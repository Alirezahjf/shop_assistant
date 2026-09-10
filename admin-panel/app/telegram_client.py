# ============================================================================
# telegram_client.py — کلاینت Bot API برای پنل مدیر
# ----------------------------------------------------------------------------
# وظیفه اصلی: واکشی فایل‌های JSON که افزونه (سمت کاربر) به چت ادمین فرستاده
#   getUpdates → پیام‌های document با نام browsing-profile_*.json
#   → getFile → دانلود از file/bot<token>/<path> → اعتبارسنجی → ایمپورت
# امنیت:
#   • فقط پیام‌های «چت ادمین» پذیرفته می‌شوند
#   • توکن هرگز لاگ نمی‌شود (redact) و فقط رمزنگاری‌شده در DB است
# ============================================================================
import logging
from typing import Any, Dict, List, Optional

import httpx

from .security import get_secret

log = logging.getLogger("telegram")

BASE = "https://api.telegram.org"
TIMEOUT = httpx.Timeout(40.0, connect=10.0)
MAX_FILE_SIZE = 20 * 1024 * 1024


class TelegramError(Exception):
    pass


class NotConfigured(TelegramError):
    pass


def get_config() -> Dict[str, str]:
    token = get_secret("tg_token")
    chat_id = get_secret("tg_chat_id")
    if not token or not chat_id:
        raise NotConfigured("اطلاعات ربات تلگرام کامل نیست. از تنظیمات وارد کنید.")
    return {"token": token, "chat_id": chat_id}


def _call(token: str, method: str, payload: Optional[dict] = None) -> Any:
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            resp = client.post(f"{BASE}/bot{token}/{method}", json=payload or {})
    except (httpx.TimeoutException, httpx.TransportError) as e:
        log.error("telegram network error on %s: %s", method, type(e).__name__)
        raise TelegramError("اتصال به Telegram API برقرار نشد.")
    try:
        data = resp.json()
    except ValueError:
        raise TelegramError("پاسخ نامعتبر از Telegram API.")
    if not data.get("ok"):
        desc = str(data.get("description", resp.status_code))
        log.error("telegram api error on %s: %s", method, desc[:100])
        raise TelegramError(f"Telegram API: {desc[:120]}")
    return data.get("result")


# ---------------------------------------------------------------------------
# عملیات
# ---------------------------------------------------------------------------
def get_updates(token: str, offset: int = 0, poll_timeout: int = 0) -> List[dict]:
    """دریافت آپدیت‌ها. poll_timeout=0 یعنی فوری (بدون long-poll)."""
    result = _call(token, "getUpdates", {
        "offset": offset or None,
        "timeout": poll_timeout,
        "allowed_updates": ["message"],
    })
    return result or []


def download_document(token: str, file_id: str) -> bytes:
    info = _call(token, "getFile", {"file_id": file_id})
    file_path = info.get("file_path")
    size = int(info.get("file_size") or 0)
    if not file_path:
        raise TelegramError("مسیر فایل از تلگرام دریافت نشد.")
    if size > MAX_FILE_SIZE:
        raise TelegramError("حجم فایل بیش از حد مجاز است.")
    url = f"{BASE}/file/bot{token}/{file_path}"
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            resp = client.get(url)
    except (httpx.TimeoutException, httpx.TransportError):
        raise TelegramError("دانلود فایل از تلگرام ناموفق بود.")
    if resp.status_code != 200:
        raise TelegramError(f"دانلود فایل ناموفق ({resp.status_code}).")
    return resp.content


def send_message(token: str, chat_id: str, text: str) -> None:
    _call(token, "sendMessage", {"chat_id": chat_id, "text": text[:4000]})


def send_document(token: str, chat_id: str, filename: str, content: bytes, caption: str = "") -> None:
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            resp = client.post(
                f"{BASE}/bot{token}/sendDocument",
                data={"chat_id": chat_id, "caption": caption[:1000]},
                files={"document": (filename, content, "application/json")},
            )
    except (httpx.TimeoutException, httpx.TransportError):
        raise TelegramError("اتصال به Telegram API برقرار نشد.")
    try:
        data = resp.json()
    except ValueError:
        raise TelegramError("پاسخ نامعتبر از Telegram API.")
    if not data.get("ok"):
        raise TelegramError(f"Telegram API: {str(data.get('description', resp.status_code))[:120]}")


def test_connection() -> None:
    cfg = get_config()
    send_message(cfg["token"], cfg["chat_id"],
                 "✅ تست اتصال پنل مدیریت به ربات — موفق بود.")
