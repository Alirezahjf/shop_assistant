# ============================================================================
# blocklists.py — نسخه پایتونِ فهرست‌های مسدودسازی (آینه فیلترهای افزونه)
# ----------------------------------------------------------------------------
# سرور هرگز به فایل ورودی اعتماد نمی‌کند: همان قوانین سخت‌گیرانه سمت افزونه
# اینجا هم روی هر فایل ایمپورتی اجرا می‌شود (دفاع چندلایه).
# ============================================================================
import re
from typing import Dict, Optional, Tuple

SENSITIVE_CATEGORIES: Dict[str, str] = {
    "messenger": "پیام‌رسان",
    "banking": "بانکی / پرداخت",
    "adult": "محتوای جنسی",
    "email": "سرویس ایمیل",
    "identity": "هویت / ورود",
}

# دامنه‌های دقیق حساس (تطبیق دقیق یا زیردامنه)
SENSITIVE_EXACT_DOMAINS = {
    # پیام‌رسان‌ها
    "telegram.org", "t.me", "telegram.me", "web.telegram.org", "tdesktop.com",
    "wa.me", "chat.whatsapp.com", "whatsapp.com", "web.whatsapp.com",
    "eitaa.com", "web.eitaa.com", "gap.im", "gapplus.ir",
    "bale.ai", "web.bale.ai", "igap.net", "slog.social",
    "messenger.com", "m.me", "discord.com", "discordapp.com", "signal.org",
    "imo.im", "viber.com", "line.me", "wechat.com", "weixin.qq.com", "qq.com",
    "skype.com", "live.com", "threema.ch", "wire.com",
    # بانکی / پرداخت
    "bmi.ir", "bankmellat.ir", "bpm.bankmellat.ir", "bankmelli.ir",
    "banksepah.ir", "bsi.ir", "sepah.ir", "refah-bank.ir", "bankrefah.ir",
    "bank-maskan.ir", "maskanbank.ir", "bpi.ir", "pasargadbank.ir",
    "epay.pasargadbank.ir", "parsian-bank.ir", "bankparsian.ir",
    "enbank.ir", "edbi.ir", "bki.ir", "tejaratbank.ir", "tejarat.ir",
    "sb24.com", "samanbank.ir", "bank-sina.ir", "sinabank.ir",
    "karafarinbank.ir", "sarmayehbank.ir", "shahr-bank.ir",
    "ansarbank.ir", "kosarbank.ir", "mehreqtesad.ir", "blubank.ir", "vebank.ir",
    "shaparak.ir", "ecit.shaparak.ir", "sep.ir", "pep.co.ir", "kiccc.ir",
    "zarinpal.com", "idpay.ir", "zibal.ir", "nextpay.org", "payping.ir",
    "novinpay.ir", "payfa.com", "vandar.io", "pay.ir",
    "paypal.com", "stripe.com", "checkout.com", "adyen.com", "wise.com",
    "visa.com", "mastercard.com",
    "nobitex.ir", "wallex.ir", "bitpin.ir", "ramzinex.ir", "tabdeal.org",
    "binance.com", "kucoin.com", "okx.com", "bybit.com", "coinbase.com",
    # محتوای جنسی
    "pornhub.com", "xvideos.com", "xhamster.com", "redtube.com", "youporn.com",
    "onlyfans.com", "xnxx.com", "spankbang.com", "chaturbate.com",
    "bongacams.com", "stripchat.com", "myfreecams.com", "cam4.com",
    "porn.com", "hqporner.com", "nhentai.net",
    # ایمیل
    "gmail.com", "mail.google.com", "outlook.com", "hotmail.com", "yahoo.com",
    "mail.yahoo.com", "proton.me", "protonmail.com", "zoho.com", "yandex.com",
    "mail.ru", "gmx.com", "icloud.com", "sina.ir", "chmail.ir", "mailfa.ir",
    # هویت / ورود
    "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com",
    "login.live.com", "auth0.com", "okta.com", "my.gov.ir", "my.skp.ir",
}

# قوانین الگویی دامنه
SENSITIVE_DOMAIN_RULES = [
    ("messenger", re.compile(r"(^|\.)(telegram|whatsapp|eitaa|bale|igap|threema)\b", re.I)),
    ("messenger", re.compile(r"(^|\.)(gap|chat)\.(im|ir)$", re.I)),
    ("banking", re.compile(r"(^|\.)(bank|banki|blubank|vebank)", re.I)),
    ("banking", re.compile(r"bank(mellat|melli|sepah|maskan|pasargad|tejarat|saman|sina|refah|karafarin|sarmayeh|shahr|ansar|kosar|mehr|eqtesad)", re.I)),
    ("banking", re.compile(r"(^|\.)(shaparak|zarinpal|idpay|zibal|nextpay|payping|novinpay|vandar|ipay)\b", re.I)),
    ("banking", re.compile(r"(^|\.)(paypal|stripe|adyen|checkout|braintree|mastercard|wise|revolut|skrill|neteller)\b", re.I)),
    ("banking", re.compile(r"(^|\.)(nobitex|wallex|bitpin|ramzinex|tabdeal|binance|kucoin|okx|bybit|coinbase)\b", re.I)),
    ("adult", re.compile(r"porn|xxx|hentai|xnxx|xhamster|redtube|youporn|onlyfans|spankbang|chaturbate|bongacams|stripchat|escort|nsfw", re.I)),
    ("adult", re.compile(r"(^|\.)(sex|sexy|adult)\b|(^|\.)(sex|adult)\.", re.I)),
    ("email", re.compile(r"(^|\.)(gmail|outlook|hotmail|protonmail|proton|gmx|icloud|chmail|mailfa)\b", re.I)),
    ("email", re.compile(r"(^|\.)(mail|webmail|smtp|imap)\.", re.I)),
    ("identity", re.compile(r"^(auth|sso|oauth|login|signin|accounts|id)\.", re.I)),
    ("identity", re.compile(r"(^|\.)(accounts\.google|appleid|login\.microsoftonline|okta|auth0)\b", re.I)),
]

# نام کوکی حساس
SENSITIVE_COOKIE_NAME_RE = re.compile(
    r"(sess|session|_sid|sid$|^sid|token|auth|jwt|oauth|csrf|xsrf|passport|"
    r"login|signin|credential|secret|api[-_]?key|apikey|passw|passwd|pwd|"
    r"otp|2fa|totp|card|cvv|cvc|^pan|pan$|iban|shaba|account|national|"
    r"codemelli|melli|ssn|wallet|balance|deviceid|device_id|fingerprint|fp_|"
    r"uuid|guid|uid$|^uid|clientid|client_id|cid$|^cid|visitor|user[_-]?id)",
    re.I,
)

# کلمات مستهجن — فارسی
PROFANITY_FA = [
    # ریشه‌های بلند (تطبیق زیررشته)
    "جنده", "فاحشه", "لاپاتی", "پورنوگرافی", "سکسی", "سکسو",
    "حشری", "بی‌حیا", "بی حیا", "شهوتباز", "سکس با",
    # ریشه‌های کوتاه (فقط توکن کامل)
    "کیر", "کص", "کس", "کون", "جق", "سکس", "حشر", "گایید", "جند",
    "کصشعر", "ننتو", "خارتو",
]
PROFANITY_EN = [
    "porn", "xxx", "hentai", "onlyfans", "nsfw", "escort", "hooker", "blowjob",
    "handjob", "cumshot", "creampie", "dildo", "bdsm", "fetish", "nude", "nudes",
    "sex", "sexy", "erotic", "pornhub", "xvideos", "xhamster", "redtube",
]
PROFANITY_EN_RE = re.compile(r"\b(" + "|".join(re.escape(w) for w in PROFANITY_EN) + r")\b", re.I)

# الگوهای نشتی مقدار (JWT/شبا/کارت/Base64/ایمیل)
VALUE_LEAK_RE = re.compile(
    r"(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})"
    r"|(\bIR\d{24}\b)"
    r"|(\b\d{16}\b)"
    r"|(\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b)"
    r"|([A-Za-z0-9+/=_-]{40,})"
    r"|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"
)


def clean_domain(hostname: str) -> str:
    return (hostname or "").strip().lower().replace("^www.", "").removeprefix("www.").rstrip(".")


def classify_domain_sensitivity(hostname: str) -> Tuple[bool, Optional[str]]:
    """(مسدود؟, دسته) — آینه دقیق منطق افزونه."""
    if not hostname:
        return True, "invalid"
    host = clean_domain(hostname)
    if host in SENSITIVE_EXACT_DOMAINS:
        return True, _exact_category(host)
    for d in SENSITIVE_EXACT_DOMAINS:
        if host.endswith("." + d):
            return True, _exact_category(d)
    for cat, rule in SENSITIVE_DOMAIN_RULES:
        if rule.search(host):
            return True, cat
    return False, None


def _exact_category(domain: str) -> str:
    if re.search(r"(telegram|whatsapp|eitaa|bale|igap|slog|discord|imo|viber|line|wechat|qq|skype|messenger|m\.me|threema|wire|t\.me|gap)", domain):
        return "messenger"
    if re.search(r"(porn|xvideos|xhamster|redtube|youporn|onlyfans|xnxx|spankbang|chaturbate|bongacams|stripchat|nhentai|cam4)", domain):
        return "adult"
    if re.search(r"(gmail|outlook|hotmail|proton|zoho|yandex|gmx|icloud|sina\.ir|chmail|mailfa|mail\.yahoo|mail\.ru|live\.com)", domain):
        return "email"
    if re.search(r"(accounts\.google|appleid|microsoftonline|auth0|okta|my\.gov|my\.skp|signin)", domain):
        return "identity"
    return "banking"


def normalize_text(text: str) -> str:
    """نرمال‌سازی فارسی/انگلیسی برای مقایسه دقیق (آینه sanitize.js)."""
    s = str(text or "")
    s = s.replace("\u064a", "\u06cc").replace("\u0649", "\u06cc")   # ي ى → ی
    s = s.replace("\u0643", "\u06a9")                               # ك → ک
    s = s.replace("\u0629", "\u0647")                               # ة → ه
    for ch in "\u0622\u0623\u0625":
        s = s.replace(ch, "\u0627")                                 # آ أ إ → ا
    s = re.sub(r"[\u064b-\u0652\u0670\u0640]", "", s)               # اعراب
    s = s.replace("\u200c", " ").replace("\u200d", " ")             # نیم‌فاصله → فاصله
    for ch in "\u200b\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069":
        s = s.replace(ch, "")
    s = s.lower()
    s = re.sub(r"[.,،؛;:!؟?()\"'\-_ /\\]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def is_profane(normalized: str) -> bool:
    t = str(normalized or "").lower()
    if not t:
        return False
    if PROFANITY_EN_RE.search(t):
        return True
    tokens = [tok for tok in re.split(r"[\s.,،؛;:!؟?()\"'\-_ /\\]+", t) if tok]
    for root in PROFANITY_FA:
        if not root:
            continue
        if len(root) >= 4:
            if root in t:
                return True
        else:
            if any(tok == root for tok in tokens):
                return True
    return False
