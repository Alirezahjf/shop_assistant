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
#   • docs.avalai.ir/en/guides/error-handling
#       جدول خطاها: 400/401/402/403/404/422/429/5xx + هدر avalai-request-id
#       و Retry-After برای 429
#   • docs.avalai.ir/en/guides/rate-limits
#       پیاده‌سازی backoff با jitter و احترام به Retry-After
# ----------------------------------------------------------------------------
# توجه: هیچ رازی لاگ نمی‌شود (فقط avalai-request-id و نام مدل).
# ============================================================================
import email.utils
import json
import logging
import os
import random
import re
import threading
import time
from datetime import timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .config import AVALAI_BASE_URL, AVALAI_PUBLIC_MODELS_URL
from .security import get_secret

log = logging.getLogger("avalai")

TIMEOUT = httpx.Timeout(120.0, connect=15.0)
# مقدار پیش‌فرض از env قابل بازتعریف است (برای تست و تنظیم اپراتور)
MAX_RETRIES = int(os.environ.get("AVALAI_MAX_RETRIES", "3"))
RETRY_BASE = float(os.environ.get("AVALAI_RETRY_BASE", "2.5"))

# ---------------------------------------------------------------------------
# نگاشت کدهای خطا به پیام فارسی (مطابق جدول مستندات + ۴۰۲ اعتبار ناکافی)
# ---------------------------------------------------------------------------
_ERROR_MESSAGES = {
    400: "درخواست نامعتبر است؛ پارامترها یا مدل را بررسی کنید.",
    401: "کلید AvalAI نامعتبر است یا دسترسی ندارد.",
    402: "اعتبار حساب AvalAI کافی نیست — از داشبورد شارژ کنید",
    403: "دسترسی به این مدل مجاز نیست (ممکن است به سطح دسترسی بالاتری نیاز داشته باشد).",
    404: "مدل انتخابی در AvalAI یافت نشد.",
    422: "درخواست قابل پردازش نبود؛ پارامترهای ارسالی را بررسی کنید.",
    429: "محدودیت نرخ AvalAI — کمی بعد تلاش کنید.",
}

# ---------------------------------------------------------------------------
# وضعیت جهانی: کول‌داون و single-flight (thread-safe)
# ---------------------------------------------------------------------------
_cooldowns: Dict[str, float] = {}  # api_key -> expire_timestamp
_cooldowns_lock = threading.Lock()

_inflight_locks: Dict[str, threading.BoundedSemaphore] = {}
_inflight_lock = threading.Lock()

# کش فهرست مدل‌ها (per-key) ده‌دقیقه‌ای
_models_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_models_cache_lock = threading.Lock()
_MODELS_CACHE_TTL = 600.0  # ثانیه

# برای تست: پاکسازی وضعیت جهانی
def _reset_state_for_tests():
    with _cooldowns_lock:
        _cooldowns.clear()
    with _inflight_lock:
        _inflight_locks.clear()
    with _models_cache_lock:
        _models_cache.clear()


class AvalAiError(Exception):
    def __init__(
        self,
        message: str,
        status: Optional[int] = None,
        retryable: bool = False,
        retry_after: Optional[float] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__(message)
        self.status = status
        self.retryable = retryable
        self.retry_after = retry_after
        self.request_id = request_id


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


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    """Retry-After را از هدر می‌خواند: عدد ثانیه یا HTTP-date."""
    if not value:
        return None
    v = value.strip()
    # عددی؟
    try:
        # ممکن است "3" یا "3.5" باشد
        f = float(v)
        if f >= 0:
            return f
    except ValueError:
        pass
    # HTTP-date
    try:
        dt = email.utils.parsedate_to_datetime(v)
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            now = time.time()
            diff = dt.timestamp() - now
            return max(0.0, diff)
    except Exception:
        pass
    return None


def _get_retry_after_from_headers(headers: Any) -> Optional[str]:
    if not headers:
        return None
    # httpx headers case-insensitive, but dict mock may be case-sensitive
    try:
        # httpx.Headers
        val = headers.get("Retry-After")
        if val:
            return str(val)
        val = headers.get("retry-after")
        if val:
            return str(val)
    except Exception:
        pass
    # dict fallback
    if isinstance(headers, dict):
        for k in ("Retry-After", "retry-after", "RETRY-AFTER"):
            if k in headers:
                return str(headers[k])
        # case-insensitive search
        lower = {str(k).lower(): v for k, v in headers.items()}
        if "retry-after" in lower:
            return str(lower["retry-after"])
    return None


def _friendly(
    status: int, body: str, retry_after: Optional[float] = None, request_id: Optional[str] = None
) -> AvalAiError:
    if status in (401, 403):
        return AvalAiError(_ERROR_MESSAGES[status], status, retryable=False, retry_after=retry_after, request_id=request_id)
    if status == 402:
        return AvalAiError(_ERROR_MESSAGES[402], status, retryable=False, retry_after=retry_after, request_id=request_id)
    if status == 404:
        return AvalAiError(_ERROR_MESSAGES[404], status, retryable=False, retry_after=retry_after, request_id=request_id)
    if status == 429:
        # پیام پیش‌فرض؛ اگر retry_after داریم، در پیام ثانیه را نشان نمی‌دهیم اینجا،
        # بلکه در لایهٔ بالاتر با کول‌داون پیام دقیق ساخته می‌شود
        return AvalAiError(_ERROR_MESSAGES[429], status, retryable=True, retry_after=retry_after, request_id=request_id)
    if status >= 500:
        return AvalAiError(f"خطای سرور AvalAI ({status}).", status, retryable=True, retry_after=retry_after, request_id=request_id)
    # ۴۰۰/۴۲۲: اگر متن سرور اشاره به پارامتر ناشناخته داشت، retryable است تا
    # لایهٔ بالاتر با حذف پارامتر دوباره تلاش کند.
    text = body or ""
    retryable = bool(
        re.search(
            r"unknown parameter|unsupported parameter|extra_forbidden|not supported|unexpected",
            text,
            re.I,
        )
    )
    msg = _server_message(text) or _ERROR_MESSAGES.get(status, f"خطای AvalAI ({status})")
    return AvalAiError(msg[:200], status, retryable=retryable, retry_after=retry_after, request_id=request_id)


def get_api_key(override: Optional[str] = None) -> str:
    key = (override or "").strip() or get_secret("avalai_key")
    if not key:
        raise AvalAiError("کلید AvalAI تنظیم نشده است. از تنظیمات وارد کنید.")
    return key


# ---------------------------------------------------------------------------
# قابلیت‌های مدل (مستندات: بعضی مدل‌ها sampling را نمی‌پذیرند / thinking الزامی است)
# ---------------------------------------------------------------------------
_NO_SAMPLING = [
    (re.compile(r"^kimi-k3($|-|\\b)", re.I), "max"),
    (re.compile(r"^kimi-k2-thinking", re.I), "max"),
]
_REQUIRES_THINKING = [
    (re.compile(r"^glm-5\.3($|-thought)", re.I), "high"),  # thinking.type الزامی
    (re.compile(r"^qwen3\.8-2\.4t", re.I), "low"),  # thinking الزامی
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


def build_payload(
    model: str,
    messages: List[Dict[str, str]],
    temperature: Optional[float] = 0.7,
    max_output_tokens: int = 900,
    use_legacy_max_tokens: bool = False,
) -> Dict[str, Any]:
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


def _sleep(seconds: float) -> None:
    """تابعی قابل monkeypatch برای تست (به‌جای time.sleep مستقیم)."""
    time.sleep(seconds)


def _get_max_retries() -> int:
    try:
        return int(os.environ.get("AVALAI_MAX_RETRIES", str(MAX_RETRIES)))
    except Exception:
        return MAX_RETRIES


def _get_retry_base() -> float:
    try:
        return float(os.environ.get("AVALAI_RETRY_BASE", str(RETRY_BASE)))
    except Exception:
        return RETRY_BASE


def chat_completion(
    api_key: str, model: str, messages: List[Dict[str, str]], temperature: float = 0.5, max_tokens: int = 2000
) -> Dict[str, Any]:
    """
    نامِ پارامتر max_tokens برای سازگاری با فراخوان‌های موجود حفظ شده است،
    اما روی سیم «ابتدا max_completion_tokens» فرستاده می‌شود و در صورت خطای
    ۴۰۰ «پارامتر ناشناخته» یک‌بار با max_tokens (Legacy) تلاش مجدد می‌شود.

    پیاده‌سازی جدید:
      • احترام به Retry-After (عدد یا HTTP-date)
      • backoff با full jitter و سقف 30s
      • کول‌داون جهانی thread-safe پس از شکست نهایی 429
      • single-flight per-key با BoundedSemaphore(1) non-blocking
    """
    # --- کول‌داون جهانی ---
    now = time.time()
    with _cooldowns_lock:
        expire = _cooldowns.get(api_key)
        if expire and now < expire:
            remaining = int(expire - now) + 1
            # حداقل 1 ثانیه
            remaining = max(1, remaining)
            raise AvalAiError(
                f"محدودیت نرخ AvalAI — {remaining} ثانیه دیگر دوباره تلاش کنید",
                status=429,
                retryable=False,
                retry_after=float(remaining),
            )

    # --- single-flight per-key ---
    with _inflight_lock:
        sem = _inflight_locks.get(api_key)
        if sem is None:
            sem = threading.BoundedSemaphore(1)
            _inflight_locks[api_key] = sem
    acquired = sem.acquire(blocking=False)
    if not acquired:
        raise AvalAiError("تحلیل در حال انجام است؛ لطفاً صبر کنید", status=409, retryable=False)

    try:
        use_legacy = False
        last_error: Optional[AvalAiError] = None
        last_retry_after: Optional[float] = None
        last_request_id: Optional[str] = None

        max_retries = _get_max_retries()
        retry_base = _get_retry_base()

        for attempt in range(max_retries + 1):
            payload = build_payload(
                model,
                messages,
                temperature=temperature,
                max_output_tokens=max_tokens,
                use_legacy_max_tokens=use_legacy,
            )
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

                retry_after_raw = _get_retry_after_from_headers(resp.headers)
                parsed_retry_after = _parse_retry_after(retry_after_raw)
                if parsed_retry_after is not None:
                    last_retry_after = parsed_retry_after
                last_request_id = request_id

                if resp.status_code != 200:
                    err = _friendly(resp.status_code, resp.text, retry_after=parsed_retry_after, request_id=request_id)
                    # سازگاری عقب‌رو: سرور max_completion_tokens را نمی‌شناسد
                    if (
                        err.status == 400
                        and not use_legacy
                        and re.search(
                            r"max_completion_tokens|unknown parameter|unsupported parameter",
                            resp.text or "",
                            re.I,
                        )
                    ):
                        log.info("fallback به max_tokens (legacy) برای مدل %s", model)
                        use_legacy = True
                        last_error = err
                        continue
                    if not err.retryable or attempt == max_retries:
                        # اگر 429 نهایی بود، کول‌داون بگذار
                        if err.status == 429:
                            cd_seconds = parsed_retry_after if parsed_retry_after is not None else 10.0
                            cd_seconds = max(cd_seconds, 10.0)
                            with _cooldowns_lock:
                                _cooldowns[api_key] = time.time() + cd_seconds
                            # پیام نهایی شامل ثانیه و request-id
                            remaining = int(cd_seconds)
                            msg = f"محدودیت نرخ AvalAI — {remaining} ثانیه دیگر دوباره تلاش کنید"
                            if request_id:
                                msg = f"{msg} (status=429, request-id={request_id})"
                            raise AvalAiError(
                                msg,
                                status=429,
                                retryable=False,
                                retry_after=cd_seconds,
                                request_id=request_id,
                            )
                        # پیام نهایی شامل کد وضعیت + request-id
                        if request_id and err.status:
                            # اگر پیام از قبل شامل request-id نیست، اضافه کن
                            if "request-id" not in str(err).lower():
                                raise AvalAiError(
                                    f"{err} (status={err.status}, request-id={request_id})",
                                    status=err.status,
                                    retryable=err.retryable,
                                    retry_after=err.retry_after,
                                    request_id=request_id,
                                )
                        raise err
                    last_error = err
                else:
                    # موفقیت → کول‌داون قبلی را پاک کن
                    with _cooldowns_lock:
                        _cooldowns.pop(api_key, None)
                    data = resp.json()
                    text = (data.get("choices") or [{}])[0].get("message", {}).get("content")
                    if not text:
                        raise AvalAiError("پاسخ مدل خالی بود یا فیلتر شد.")
                    return {"text": text, "usage": data.get("usage"), "model": data.get("model")}
            except AvalAiError:
                raise
            except (httpx.TimeoutException, httpx.TransportError) as e:
                last_error = AvalAiError(
                    "اتصال به AvalAI برقرار نشد (شبکه).", status=None, retryable=True, request_id=last_request_id
                )
                if attempt == max_retries:
                    # برای خطای شبکه، کول‌داون نمی‌گذاریم، فقط خطا
                    if last_request_id:
                        raise AvalAiError(
                            f"{last_error} (status=network, request-id={last_request_id})",
                            status=None,
                            retryable=False,
                            request_id=last_request_id,
                        )
                    raise last_error
                log.warning("avalai network retry %d: %s", attempt + 1, type(e).__name__)

            # --- محاسبه خواب برای تلاش بعدی ---
            # اگر Retry-After داریم، حداقل همان
            if last_retry_after is not None:
                # اگر attempt آخر نیست، از Retry-After استفاده کن
                sleep_sec = last_retry_after
            else:
                base = retry_base * (2**attempt)
                jitter = random.uniform(0.5, 1.0)
                sleep_sec = base * jitter
                sleep_sec = min(sleep_sec, 30.0)
            # رعایت حداقل Retry-After
            if last_retry_after is not None:
                sleep_sec = max(sleep_sec, last_retry_after)
            _sleep(sleep_sec)

        raise last_error or AvalAiError("خطای ناشناخته AvalAI.")
    finally:
        try:
            sem.release()
        except Exception:
            pass


def test_connection(api_key: str, model: str) -> Dict[str, Any]:
    return chat_completion(
        api_key,
        model,
        [{"role": "user", "content": "سلام. فقط کلمه «متصل» را بفرست."}],
        temperature=0,
        max_tokens=20,
    )


def list_models(api_key: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    فهرست مدل‌ها:
      • با کلید: GET /v1/models  (مستندات quickstart)
      • بدون کلید: GET /public/models (بدون احراز هویت)
    خروجی: فهرستی از {'id': ...} — هیچ رازی برگردانده نمی‌شود.
    کش ده‌دقیقه‌ای per-key دارد؛ خطای 429 soft-fail می‌کند.
    """
    cache_key = (api_key or "")[:64]  # برای جلوگیری از کلید خیلی بلند
    now = time.time()
    with _models_cache_lock:
        entry = _models_cache.get(cache_key)
        if entry:
            ts, models = entry
            if now - ts < _MODELS_CACHE_TTL:
                return models

    timeout = httpx.Timeout(20.0, connect=10.0)
    models_result: List[Dict[str, Any]] = []

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
                    models_result = models
            elif resp.status_code == 429:
                # soft-fail برای 429 — کش قبلی را اگر هست برگردان، وگرنه خالی
                log.warning("list_models 429 rate-limited, soft-fail")
                with _models_cache_lock:
                    entry = _models_cache.get(cache_key)
                    if entry:
                        return entry[1]
                return []
        except Exception as e:  # شبکه/پاسخ غیرمنتظره — به مسیر عمومی می‌رویم
            log.warning("دریافت /v1/models ناموفق بود: %s", type(e).__name__)

    if not models_result:
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(AVALAI_PUBLIC_MODELS_URL)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("data") if isinstance(data, dict) else data
                models = [{"id": str(m.get("id", "")).strip()} for m in (items or []) if m.get("id")]
                if models:
                    models_result = models
            elif resp.status_code == 429:
                log.warning("list_models public 429 rate-limited, soft-fail")
                with _models_cache_lock:
                    entry = _models_cache.get(cache_key)
                    if entry:
                        return entry[1]
                return []
        except Exception as e:
            log.warning("دریافت /public/models ناموفق بود: %s", type(e).__name__)

    # ذخیره در کش اگر نتیجه داشتیم
    if models_result:
        with _models_cache_lock:
            _models_cache[cache_key] = (now, models_result)

    return models_result


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
