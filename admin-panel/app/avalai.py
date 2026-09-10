# ============================================================================
# avalai.py — کلاینت سروری AvalAI (سازگار با OpenAI) طبق docs.avalai.org
#   Base URL: https://api.avalai.ir/v1  •  POST /v1/chat/completions
#   احراز هویت: Authorization: Bearer <KEY>   •  timeout + retry + خطای فارسی
# ============================================================================
import json
import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from .config import AVALAI_BASE_URL
from .security import get_secret

log = logging.getLogger("avalai")  # توجه: هیچ رازی لاگ نمی‌شود

TIMEOUT = httpx.Timeout(120.0, connect=15.0)
MAX_RETRIES = 2


class AvalAiError(Exception):
    def __init__(self, message: str, status: Optional[int] = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


def _friendly(status: int, body: str) -> AvalAiError:
    if status in (401, 403):
        return AvalAiError("کلید AvalAI نامعتبر است یا دسترسی ندارد.", status)
    if status == 402:
        return AvalAiError("اعتبار حساب AvalAI کافی نیست.", status)
    if status == 404:
        return AvalAiError("مدل انتخابی در AvalAI یافت نشد.", status)
    if status == 429:
        return AvalAiError("محدودیت نرخ AvalAI — کمی بعد تلاش کنید.", status, retryable=True)
    if status >= 500:
        return AvalAiError(f"خطای سرور AvalAI ({status}).", status, retryable=True)
    return AvalAiError(f"خطای AvalAI ({status}): {body[:140]}", status)


def get_api_key(override: Optional[str] = None) -> str:
    key = (override or "").strip() or get_secret("avalai_key")
    if not key:
        raise AvalAiError("کلید AvalAI تنظیم نشده است. از تنظیمات وارد کنید.")
    return key


def chat_completion(api_key: str, model: str, messages: List[Dict[str, str]],
                    temperature: float = 0.5, max_tokens: int = 2000) -> Dict[str, Any]:
    payload = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    last_error: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=TIMEOUT) as client:
                resp = client.post(
                    f"{AVALAI_BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                    json=payload,
                )
            if resp.status_code != 200:
                err = _friendly(resp.status_code, resp.text)
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
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", s)
        if m:
            return m.group(1).strip()
    return None
