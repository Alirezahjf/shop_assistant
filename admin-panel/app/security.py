# ============================================================================
# security.py — احراز هویت مدیر + رمزنگاری رازها در پایگاه داده (Fernet)
# ----------------------------------------------------------------------------
#  • رمز مدیر: PBKDF2-SHA256 با 310,000 تکرار + salt تصادفی (در settings)
#  • نشست: توکن تصادفی 256بیتی در کوکی HttpOnly + جدول sessions با انقضا
#  • رازها (توکن ربات/آیدی ادمین/کلید AvalAI) با AES-128-CBC فشرده Fernet
#    (کلید از SECRET_KEY با SHA-256) در DB رمز می‌شوند — هرگز plaintext و
#    هرگز در لاگ.
#  • محدودیت تلاش ورود: ۵ خطا → قفل ۳۰ ثانیه‌ای (in-memory)
# ============================================================================
import base64
import hashlib
import hmac
import secrets
import time
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from . import db
from .config import ADMIN_PASSWORD, SECRET_KEY, SESSION_TTL_HOURS

PBKDF2_ITERATIONS = 310_000
SESSION_COOKIE = "admin_session"

_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest()))

# ---------- رمز مدیر ----------
def _hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)


def ensure_admin_password() -> None:
    """اولین اجرا: هش رمز پیش‌فرض/محیطی ذخیره می‌شود."""
    with db.get_db() as conn:
        if db.get_setting(conn, "admin_password") is None:
            salt = secrets.token_bytes(16)
            digest = _hash_password(ADMIN_PASSWORD, salt)
            db.set_setting(conn, "admin_password", f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}")


def verify_password(password: str) -> bool:
    with db.get_db() as conn:
        stored = db.get_setting(conn, "admin_password")
    if not stored:
        return False
    try:
        _algo, iters, salt_hex, digest_hex = stored.split("$")
        digest = _hash_password(password, bytes.fromhex(salt_hex))
        return hmac.compare_digest(digest, bytes.fromhex(digest_hex))
    except (ValueError, TypeError):
        return False


def change_password(current: str, new: str) -> bool:
    if not verify_password(current):
        return False
    if len(new) < 8:
        raise ValueError("رمز جدید باید حداقل ۸ کاراکتر باشد.")
    salt = secrets.token_bytes(16)
    digest = _hash_password(new, salt)
    with db.get_db() as conn:
        db.set_setting(conn, "admin_password", f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}")
    return True


# ---------- محدودیت تلاش ورود ----------
_fail_count = 0
_lock_until = 0.0


def login_allowed() -> bool:
    return time.time() >= _lock_until


def register_login_attempt(ok: bool) -> None:
    global _fail_count, _lock_until
    if ok:
        _fail_count = 0
        return
    _fail_count += 1
    if _fail_count >= 5:
        _lock_until = time.time() + 30


# ---------- نشست ----------
def create_session() -> str:
    token = secrets.token_urlsafe(32)
    expires = int(time.time()) + SESSION_TTL_HOURS * 3600
    with db.get_db() as conn:
        db.purge_expired_sessions(conn)
        db.create_session(conn, token, expires)
    return token


def validate_session(token: Optional[str]) -> bool:
    if not token:
        return False
    with db.get_db() as conn:
        row = db.get_session(conn, token)
    if not row:
        return False
    if row["expires_at"] < int(time.time()):
        with db.get_db() as conn:
            db.delete_session(conn, token)
        return False
    return True


def destroy_session(token: Optional[str]) -> None:
    if token:
        with db.get_db() as conn:
            db.delete_session(conn, token)


# ---------- رمزنگاری رازها ----------
def encrypt_secret(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_secret(ciphertext: str) -> Optional[str]:
    try:
        return _fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def set_secret(key: str, value: str) -> None:
    if not value:
        return
    with db.get_db() as conn:
        db.set_setting(conn, f"secret:{key}", encrypt_secret(value))


def get_secret(key: str) -> str:
    with db.get_db() as conn:
        stored = db.get_setting(conn, f"secret:{key}")
    if not stored:
        return ""
    return decrypt_secret(stored) or ""


def has_secret(key: str) -> bool:
    with db.get_db() as conn:
        return db.get_setting(conn, f"secret:{key}") is not None


def mask(value: str) -> str:
    s = str(value or "")
    if len(s) <= 8:
        return "••••••"
    return f"{s[:4]}••••••{s[-4:]}"
