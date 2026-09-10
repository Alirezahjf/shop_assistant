# ============================================================================
# config.py — تنظیمات پنل مدیر (از متغیرهای محیطی / فایل .env)
# ============================================================================
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent   # admin-panel/
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)


def _load_dotenv() -> None:
    """لودر ساده .env (بدون وابستگی خارجی)."""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_dotenv()

# --- امنیت ---
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin1234")  # ⚠️ در .env تغییر دهید
SECRET_KEY = os.environ.get("SECRET_KEY") or ""
if not SECRET_KEY:
    # کلید خودکار: یک‌بار تولید و در data/secret.key نگه‌داری می‌شود
    key_file = DATA_DIR / "secret.key"
    if key_file.exists():
        SECRET_KEY = key_file.read_text(encoding="utf-8").strip()
    else:
        SECRET_KEY = secrets.token_urlsafe(48)
        key_file.write_text(SECRET_KEY, encoding="utf-8")

SESSION_TTL_HOURS = int(os.environ.get("SESSION_TTL_HOURS", "72"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

# --- پایگاه داده ---
DB_PATH = DATA_DIR / "admin_panel.db"

# --- AvalAI (اختیاری: می‌توانید از UI تنظیمات هم وارد کنید) ---
AVALAI_API_KEY = os.environ.get("AVALAI_API_KEY", "")
AVALAI_MODEL = os.environ.get("AVALAI_MODEL", "qwen3.8-flash")
AVALAI_BASE_URL = "https://api.avalai.ir/v1"

# --- ربات تلگرام (اختیاری: از UI تنظیمات هم قابل وارد شدن است) ---
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
TG_ADMIN_CHAT_ID = os.environ.get("TG_ADMIN_CHAT_ID", "")

# --- عمومی ---
APP_NAME = "پنل مدیریت پروفایل‌ها — خریدار پرو"
SNAPSHOT_SCHEMA_VERSION = 2
