# ============================================================================
# analysis.py — تحلیل هوش مصنوعی پروفایل (سمت سرور، خروجی JSON ساختاریافته)
# ============================================================================
import logging
import time
from typing import Any, Dict

from . import avalai
from .config import AVALAI_MODEL
from .interests import compact_context_for_ai
from .security import get_secret

log = logging.getLogger("analysis")

SCHEMA_HINT = """پاسخ را فقط و فقط به‌صورت یک شیء JSON معتبر بده، بدون هیچ متن اضافه، بدون markdown، و با همین ساختار:
{
  "profileTitle": "عنوان ۳ تا ۶ کلمه‌ای برای این کاربر",
  "interests": [{"title":"عنوان علاقه‌مندی","detail":"توضیح یک جمله‌ای","strength":"قوی|متوسط|ضعیف"}],
  "personality": "تحلیل ۲ تا ۴ جمله‌ای رفتار و شخصیت دیجیتال",
  "shoppingHabits": "تحلیل ۲ تا ۴ جمله‌ای عادت‌های خرید",
  "topPredictions": ["پیش‌بینی نیاز بعدی ۱", "۲", "۳"],
  "recommendedCategories": ["دسته ۱", "دسته ۲", "دسته ۳"],
  "marketingTips": ["نکته عملی ۱", "نکته ۲", "نکته ۳"],
  "summary": "جمع‌بندی ۲ تا ۳ جمله‌ای"
}
همه مقادیر فارسی روان باشند. علاقه‌مندی‌ها ۳ تا ۶ مورد، پیش‌بینی‌ها ۳ تا ۵ مورد، نکات ۳ تا ۵ مورد."""


def _clip(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def normalize_analysis(raw: Dict[str, Any], model: str) -> Dict[str, Any]:
    analysis: Dict[str, Any] = {
        "profileTitle": _clip(raw.get("profileTitle"), 80) or "کاربر تحلیل‌شده",
        "interests": [],
        "personality": _clip(raw.get("personality"), 1200),
        "shoppingHabits": _clip(raw.get("shoppingHabits"), 1200),
        "topPredictions": [_clip(x, 160) for x in (raw.get("topPredictions") or [])[:6]],
        "recommendedCategories": [_clip(x, 60) for x in (raw.get("recommendedCategories") or [])[:8]],
        "marketingTips": [_clip(x, 200) for x in (raw.get("marketingTips") or [])[:6]],
        "summary": _clip(raw.get("summary"), 800),
        "model": model,
        "analyzedAt": int(time.time() * 1000),
    }
    for item in (raw.get("interests") or [])[:8]:
        if not isinstance(item, dict):
            continue
        title = _clip(item.get("title"), 80)
        if not title:
            continue
        strength = item.get("strength")
        analysis["interests"].append({
            "title": title,
            "detail": _clip(item.get("detail"), 200),
            "strength": strength if strength in ("قوی", "متوسط", "ضعیف") else "متوسط",
        })
    return analysis


def analyze_snapshot(snapshot: dict, model: str = "", api_key_override: str = "") -> Dict[str, Any]:
    """اجرای تحلیل روی snapshot پاک‌شده — برگشت analysis نرمال‌شده."""
    model = (model or get_secret("avalai_model") or AVALAI_MODEL).strip()
    api_key = avalai.get_api_key(api_key_override)

    if not snapshot.get("domains") and not snapshot.get("searches"):
        raise avalai.AvalAiError("این پروفایل داده قابل تحلیل ندارد.")

    prompt = "\n".join([
        "تو یک تحلیلگر حرفه‌ای رفتار کاربران دیجیتال و مشاور خرید هستی.",
        "داده‌های زیر یک «پروفایل پاکسازی‌شده» است: فقط دامنه‌ها و جستجوها (بدون هیچ داده حساس).",
        "وظیفه: تحلیل عمیق، دقیق و عملی این کاربر. خروجی کاملاً فارسی.",
        "",
        SCHEMA_HINT,
        "",
        compact_context_for_ai(snapshot),
    ])

    result = avalai.chat_completion(
        api_key, model,
        [
            {"role": "system", "content": "تحلیلگر ارشد رفتار کاربر. همیشه فقط JSON معتبر برگردان."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        max_tokens=2000,
    )
    raw = avalai.extract_json(result["text"])
    analysis = normalize_analysis(raw, model)
    usage = result.get("usage") or {}
    log.info("analysis ok: uid-context model=%s total_tokens=%s",
             model, usage.get("total_tokens", "?"))
    return analysis
