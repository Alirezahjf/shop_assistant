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
# مدل پیش‌فرض: از فهرست مدل‌های مستندات (docs.avalai.ir/en/models)
# qwen3.8-flash — ارزان، سریع، دارای reasoning (پیشنهادی برای دستیار خرید)
AVALAI_MODEL = os.environ.get("AVALAI_MODEL", "qwen3.8-flash")
# مستندات quickstart: «Primary Domain - Recommended: api.avalai.ir»
AVALAI_BASE_URL = os.environ.get("AVALAI_BASE_URL", "https://api.avalai.ir/v1")
# مستندات quickstart: فهرست عمومی مدل‌ها بدون احراز هویت
AVALAI_PUBLIC_MODELS_URL = "https://api.avalai.ir/public/models"

# فهرست پیشنهادیِ هم‌تراز با مستندات (فقط برای fallback آفلاین در UI)
# ⚠️ claude-fable-5-1 طبق مستندات نیازمند «Tier 2 یا بالاتر» است؛ برای حساب‌های
# عادی ۴۰۱/۴۰۳ می‌دهد، بنابراین از پیش‌فرض‌ها کنار گذاشته شده است.
AVALAI_KNOWN_MODELS = [
    "qwen3.8-flash",
    "glm-5.3-flash",
    "gemini-3.8-flash",
    "nemotron-3.5-lightning",
    "qwen3.8-27b",
    "deepseek-v4-flash",
    "gpt-6-astra",
]

# --- پروکسی افزونه (کاربران نهایی بدون کلید، از کلید سرور استفاده می‌کنند) ---
EXT_PROXY_ENABLED = os.environ.get("EXT_PROXY_ENABLED", "true").lower() == "true"
EXT_RATE_PER_MINUTE = int(os.environ.get("EXT_RATE_PER_MINUTE", "6"))     # per IP
EXT_RATE_PER_HOUR = int(os.environ.get("EXT_RATE_PER_HOUR", "40"))        # per IP
EXT_DAILY_LIMIT = int(os.environ.get("EXT_DAILY_LIMIT", "600"))           # global/day
EXT_MAX_MESSAGE_CHARS = 1000
EXT_MAX_HISTORY = 16
EXT_MAX_TOKENS = 900

# --- ربات تلگرام (اختیاری: از UI تنظیمات هم قابل وارد شدن است) ---
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
TG_ADMIN_CHAT_ID = os.environ.get("TG_ADMIN_CHAT_ID", "")

# --- عمومی ---
APP_NAME = "پنل مدیریت پروفایل‌ها — خریدار پرو"
SNAPSHOT_SCHEMA_VERSION = 2
