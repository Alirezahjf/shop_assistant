# ============================================================================
# avalai.py — کلاینت سروری AvalAI (سازگار با OpenAI) طبق docs.avalai.ir
# ----------------------------------------------------------------------------
# مرجع مستندات (بازبینی‌شده):
#   • docs.avalai.ir/en/api-reference/chat
#       POST https://api.avalai.ir/v1/chat/completions
#       Authorization: Bearer <KEY>
#       - max_completion_tokens  ← جایگزین رسمی (شامل توکن‌های reasoning)
#       - max_tokens             ← Legacy؛ «not compatible with some reasoning
#                                   models» ⇒ فقط به‌عنوان fallback عقب‌رو
#       - temperature/top_p      ← بعضی مدل‌ها آن‌ها را رد می‌کنند
#       - reasoning_effort       ← مدل‌محور
#   • docs.avalai.ir/en/quickstart
#       Base URL اصلی: https://api.avalai.ir/v1
#       فهرست مدل‌ها: GET /v1/models (با احراز هویت) و /public/models (بدون
#       احراز هویت)؛ جزئیات/قیمت: GET /v1/models/{id}
#       هدر پاسخ avalai-request-id برای رهگیری هزینه
#   • docs.avalai.ir/en/models و /models/model-details
#       kimi-k3  → فقط reasoning_effort:"max" و حذف temperature/top_p
#       glm-5.3  → thinking.type:"enabled" الزامی + reasoning_effort
#       claude-fable-5-1 → نیازمند Tier 2 یا بالاتر
# ----------------------------------------------------------------------------
# توجه: هیچ رازی لاگ نمی‌شود (فقط avalai-request-id و نام مدل).
# ============================================================================
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

import httpx

from .config import AVALAI_BASE_URL, AVALAI_PUBLIC_MODELS_URL
from .security import get_secret

log = logging.getLogger("avalai")

TIMEOUT = httpx.Timeout(120.0, connect=15.0)
MAX_RETRIES = 2

# ---------------------------------------------------------------------------
# نگاشت کدهای خطا به پیام فارسی (مطابق جدول مستندات + ۴۰۲ اعتبار ناکافی)
# ---------------------------------------------------------------------------
_ERROR_MESSAGES = {
    400: "درخواست نامعتبر است؛ پارامترها یا مدل را بررسی کنید.",
    401: "کلید AvalAI نامعتبر است یا دسترسی ندارد.",
    403: "دسترسی به این مدل مجاز نیست (ممکن است به سطح دسترسی بالاتری نیاز داشته باشد).",
    404: "مدل انتخابی در AvalAI یافت نشد.",
    422: "درخواست قابل پردازش نبود؛ پارامترهای ارسالی را بررسی کنید.",
    429: "محدودیت نرخ AvalAI — کمی بعد تلاش کنید.",
}


class AvalAiError(Exception):
    def __init__(self, message: str, status: Optional[int] = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


def _server_message(body: str) -> str:
    """متن خطای فارسی/انگلیسیِ خودِ AvalAI را استخراج می‌کند (بدون لاگ‌کردن راز)."""
    try:
        data = json.loads(body or "{}")
    except Exception:
        return ""
    err = data.get("error")
    if isinstance(err, dict):
        msg = err.get("message") or err.get("code") or ""
    elif isinstance(err, str):
        msg = err
    else:
        msg = data.get("message") or ""
    return str(msg).strip()


def _friendly(status: int, body: str) -> AvalAiError:
    if status in (401, 403):
        return AvalAiError(_ERROR_MESSAGES[status], status)
    if status == 402:
        return AvalAiError("اعتبار حساب AvalAI کافی نیست؛ حساب را شارژ کنید.", status)
    if status == 404:
        return AvalAiError(_ERROR_MESSAGES[404], status)
    if status == 429:
        return AvalAiError(_ERROR_MESSAGES[429], status, retryable=True)
    if status >= 500:
        return AvalAiError(f"خطای سرور AvalAI ({status}).", status, retryable=True)
    # ۴۰۰/۴۲۲: اگر متن سرور اشاره به پارامتر ناشناخته داشت، retryable است تا
    # لایهٔ بالاتر با حذف پارامتر دوباره تلاش کند.
    text = body or ""
    retryable = bool(re.search(
        r"unknown parameter|unsupported parameter|extra_forbidden|not supported|unexpected",
        text, re.I))
    msg = _server_message(text) or _ERROR_MESSAGES.get(status, f"خطای AvalAI ({status})")
    return AvalAiError(msg[:200], status, retryable=retryable)


def get_api_key(override: Optional[str] = None) -> str:
    key = (override or "").strip() or get_secret("avalai_key")
    if not key:
        raise AvalAiError("کلید AvalAI تنظیم نشده است. از تنظیمات وارد کنید.")
    return key


# ---------------------------------------------------------------------------
# قابلیت‌های مدل (مستندات: بعضی مدل‌ها sampling را نمی‌پذیرند / thinking الزامی است)
# ---------------------------------------------------------------------------
_NO_SAMPLING = [
    (re.compile(r"^kimi-k3($|-|\b)", re.I), "max"),
    (re.compile(r"^kimi-k2-thinking", re.I), "max"),
]
_REQUIRES_THINKING = [
    (re.compile(r"^glm-5\.3($|-thought)", re.I), "high"),   # thinking.type الزامی
    (re.compile(r"^qwen3\.8-2\.4t", re.I), "low"),          # thinking الزامی
]
_SUPPORTS_EFFORT = [
    (re.compile(r"^gpt-6-astra", re.I), "medium"),
    (re.compile(r"^deepseek-v4", re.I), "low"),
    (re.compile(r"^claude-(fable-5-1|opus-5)", re.I), "medium"),
    (re.compile(r"^kimi-", re.I), "max"),
    (re.compile(r"^glm-5\.3", re.I), "high"),
    (re.compile(r"^qwen3\.8-(max|flash|2\.4t)", re.I), "low"),
]


def _first_match(rules, model: str):
    for pattern, value in rules:
        if pattern.search(model or ""):
            return value
    return None


def sampling_allowed(model: str) -> bool:
    """آیا می‌توان temperature/top_p فرستاد؟ (kimi و glm-5.3 آن را رد می‌کنند)"""
    return _first_match(_NO_SAMPLING, model) is None and _first_match(_REQUIRES_THINKING, model) is None


def build_payload(model: str, messages: List[Dict[str, str]],
                  temperature: Optional[float] = 0.7,
                  max_output_tokens: int = 900,
                  use_legacy_max_tokens: bool = False) -> Dict[str, Any]:
    """
    ساخت بدنهٔ درخواست مطابق مستندات:
      • max_completion_tokens پیش‌فرض است (شامل توکن‌های reasoning)
      • در صورت ناسازگاری، use_legacy_max_tokens=True مقدار را با max_tokens
        (پارامتر Legacy) می‌فرستد.
    """
    payload: Dict[str, Any] = {"model": model, "messages": messages}
    # مستندات: «max_tokens: Legacy ... Deprecated ... not compatible with some
    # reasoning models» ⇒ max_completion_tokens اولویت دارد.
    token_key = "max_tokens" if use_legacy_max_tokens else "max_completion_tokens"
    payload[token_key] = max_output_tokens

    if temperature is not None and sampling_allowed(model):
        payload["temperature"] = temperature

    if _first_match(_REQUIRES_THINKING, model):
        # مستندات: درخواست‌هایی که thinking را غیرفعال کنند برای این مدل‌ها خطا می‌دهند
        payload["thinking"] = {"type": "enabled"}
        payload["reasoning_effort"] = _first_match(_REQUIRES_THINKING, model)
    else:
        effort = _first_match(_SUPPORTS_EFFORT, model)
        if effort:
            payload["reasoning_effort"] = effort
    return payload


def chat_completion(api_key: str, model: str, messages: List[Dict[str, str]],
                    temperature: float = 0.5, max_tokens: int = 2000) -> Dict[str, Any]:
    """
    نامِ پارامتر max_tokens برای سازگاری با فراخوان‌های موجود حفظ شده است،
    اما روی سیم «ابتدا max_completion_tokens» فرستاده می‌شود و در صورت خطای
    ۴۰۰ «پارامتر ناشناخته» یک‌بار با max_tokens (Legacy) تلاش مجدد می‌شود.
    """
    use_legacy = False
    last_error: Optional[Exception] = None

    for attempt in range(MAX_RETRIES + 1):
        payload = build_payload(model, messages, temperature=temperature,
                                max_output_tokens=max_tokens,
                                use_legacy_max_tokens=use_legacy)
        try:
            with httpx.Client(timeout=TIMEOUT) as client:
                resp = client.post(
                    f"{AVALAI_BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                    json=payload,
                )
            # فقط شناسهٔ درخواست (بدون هیچ راز) برای رهگیری هزینه لاگ می‌شود
            request_id = resp.headers.get("avalai-request-id")
            if request_id:
                log.info("avalai request-id=%s model=%s", request_id, model)

            if resp.status_code != 200:
                err = _friendly(resp.status_code, resp.text)
                # سازگاری عقب‌رو: سرور max_completion_tokens را نمی‌شناسد
                if (err.status == 400 and not use_legacy
                        and re.search(r"max_completion_tokens|unknown parameter|unsupported parameter",
                                      resp.text or "", re.I)):
                    log.info("fallback به max_tokens (legacy) برای مدل %s", model)
                    use_legacy = True
                    last_error = err
                    continue
                if not err.retryable or attempt == MAX_RETRIES:
                    raise err
                last_error = err
            else:
                data = resp.json()
                text = (data.get("choices") or [{}])[0].get("message", {}).get("content")
                if not text:
                    raise AvalAiError("پاسخ مدل خالی بود یا فیلتر شد.")
                return {"text": text, "usage": data.get("usage"), "model": data.get("model")}
        except AvalAiError:
            raise
        except (httpx.TimeoutException, httpx.TransportError) as e:
            last_error = AvalAiError("اتصال به AvalAI برقرار نشد (شبکه).")
            if attempt == MAX_RETRIES:
                raise last_error
            log.warning("avalai network retry %d: %s", attempt + 1, type(e).__name__)
        time.sleep(0.8 * (2 ** attempt))

    raise last_error or AvalAiError("خطای ناشناخته AvalAI.")


def test_connection(api_key: str, model: str) -> Dict[str, Any]:
    return chat_completion(
        api_key, model,
        [{"role": "user", "content": "سلام. فقط کلمه «متصل» را بفرست."}],
        temperature=0, max_tokens=20,
    )


def list_models(api_key: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    فهرست مدل‌ها:
      • با کلید: GET /v1/models  (مستندات quickstart)
      • بدون کلید: GET /public/models (بدون احراز هویت)
    خروجی: فهرستی از {'id': ...} — هیچ رازی برگردانده نمی‌شود.
    """
    timeout = httpx.Timeout(20.0, connect=10.0)
    if api_key:
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(
                    f"{AVALAI_BASE_URL}/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("data") if isinstance(data, dict) else data
                models = [{"id": str(m.get("id", "")).strip()} for m in (items or []) if m.get("id")]
                if models:
                    return models
        except Exception as e:  # شبکه/پاسخ غیرمنتظره — به مسیر عمومی می‌رویم
            log.warning("دریافت /v1/models ناموفق بود: %s", type(e).__name__)

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(AVALAI_PUBLIC_MODELS_URL)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("data") if isinstance(data, dict) else data
            models = [{"id": str(m.get("id", "")).strip()} for m in (items or []) if m.get("id")]
            if models:
                return models
    except Exception as e:
        log.warning("دریافت /public/models ناموفق بود: %s", type(e).__name__)

    return []


def extract_json(text: str) -> Dict[str, Any]:
    """استخراج مقاوم JSON از پاسخ مدل (مقاوم به markdown/متن اضافه)."""
    s = text.strip()
    fence = json_safe_fence(s)
    if fence:
        s = fence
    first, last = s.find("{"), s.rfind("}")
    if first == -1 or last == -1 or last <= first:
        raise AvalAiError("پاسخ مدل ساختار JSON نداشت.")
    try:
        return json.loads(s[first:last + 1])
    except json.JSONDecodeError:
        raise AvalAiError("JSON پاسخ مدل قابل پارس نبود.")


def json_safe_fence(s: str) -> Optional[str]:
    if "```" in s:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", s)
        if m:
            return m.group(1).strip()
    return None
