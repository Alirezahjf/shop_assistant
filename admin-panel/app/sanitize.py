# ============================================================================
# sanitize.py — اعتبارسنجی و پاکسازی مجدد سمت سرور (Server-Side Re-validation)
# ----------------------------------------------------------------------------
# فایل‌هایی که افزونه به ربات تلگرام می‌فرستد (browsing-profile_*.json) اینجا
# مجدداً با همان قوانین سخت‌گیرانه بازرسی می‌شوند؛ سرور «هرگز» به فایل ورودی
# اعتماد نمی‌کند:
#   • فیلدهای غیرمجاز حذف می‌شوند (whitelist)
#   • دامنه‌های حساس دوباره شناسایی و به‌کلی حذف می‌شوند
#   • جستجوها دوباره نرمال، ضد-مستهجن و ادغام تکراری می‌شوند
#   • اسکراب نهایی ضد نشتی (JWT/کارت/شبا/ایمیل/Base64) اجرا می‌شود
#   • خروجی: فقط snapshot پاک — در غیر این صورت ImportValidationError
# ============================================================================
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .blocklists import (
    SENSITIVE_COOKIE_NAME_RE,
    VALUE_LEAK_RE,
    classify_domain_sensitivity,
    clean_domain,
    is_profane,
    normalize_text,
)

MAX_COOKIES = 2000
MAX_DOMAINS = 1500
MAX_SEARCHES = 800
MAX_TERM_LEN = 120
MIN_TERM_LEN = 2

ALLOWED_COOKIE_KEYS = {"domain", "name"}
ALLOWED_DOMAIN_KEYS = {"domain", "visits", "lastVisit", "histogram"}
ALLOWED_SEARCH_KEYS = {"term", "count", "lastSeen", "engine"}

SEARCH_ENGINES = [
    ("google", ("q",)), ("bing.com", ("q",)), ("duckduckgo.com", ("q",)),
    ("search.yahoo.com", ("p",)), ("yandex", ("text",)), ("parsijoo.ir", ("q",)),
    ("ecosia.org", ("q",)), ("search.brave.com", ("q",)), ("startpage.com", ("query",)),
]


class ImportValidationError(Exception):
    """خطای اعتبارسنجی فایل ایمپورتی (پیام فارسی)."""


# ---------------------------------------------------------------------------
# نرمال‌سازی ورودی خام به ساختار استاندارد
# ---------------------------------------------------------------------------
def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def validate_and_clean(payload: Any, source_file: str = "—") -> Dict[str, Any]:
    """
    payload = dict خروجی افزونه. خروجی = snapshot پاک و استاندارد.
    هر مشکل ساختاری → ImportValidationError با پیام فارسی.
    """
    if not isinstance(payload, dict):
        raise ImportValidationError("محتوای فایل JSON معتبر نیست.")

    if payload.get("exportType") not in (None, "sanitized-browsing-profile") and payload.get("schemaVersion") != 2:
        raise ImportValidationError("این فایل خروجی پاکسازی‌شده افزونه نیست (schema v2 لازم است).")
    if payload.get("schemaVersion") not in (None, 2):
        raise ImportValidationError("نسخه schema فایل پشتیبانی نمی‌شود.")

    device_label = str(payload.get("deviceLabel") or "بدون برچسب")[:60]
    try:
        created_at = datetime.fromisoformat(str(payload.get("createdAt", "")).replace("Z", "+00:00"))
        created_iso = created_at.astimezone(timezone.utc).isoformat()
    except ValueError:
        created_iso = datetime.now(timezone.utc).isoformat()
    range_days = min(max(_as_int(payload.get("rangeDays"), 30), 1), 90)

    domains = _clean_domains(payload.get("domains"))
    searches = _clean_searches(payload.get("searches"))
    cookies = _clean_cookies(payload.get("cookies"))

    if not domains and not searches and not cookies:
        raise ImportValidationError("فایل هیچ داده قابل استفاده‌ای ندارد (همه رکوردها پاک/حذف شدند).")

    stats = {
        "domains": len(domains),
        "searches": len(searches),
        "cookies": len(cookies),
        "totalVisits": sum(d["visits"] for d in domains),
    }
    return {
        "schemaVersion": 2,
        "deviceLabel": device_label,
        "createdAt": created_iso,
        "rangeDays": range_days,
        "sourceFile": str(source_file or "—")[:120],
        "stats": stats,
        "domains": domains,
        "searches": searches,
        "cookies": cookies,
        "privacy": {
            "cookieValuesCollected": False,
            "pageTitlesCollected": False,
            "fullUrlsCollected": False,
            "serverSideRevalidated": True,
        },
    }


def parse_json_file(raw: bytes) -> Any:
    """پارس امن JSON با سقف حجم."""
    if len(raw) > 20 * 1024 * 1024:
        raise ImportValidationError("حجم فایل بیش از حد مجاز است (حداکثر ۲۰MB).")
    try:
        return json.loads(raw.decode("utf-8-sig", errors="replace"))
    except json.JSONDecodeError as e:
        raise ImportValidationError(f"JSON نامعتبر: {e}"[:120])


# ---------------------------------------------------------------------------
# پاکسازی هر بخش
# ---------------------------------------------------------------------------
def _clean_domains(raw: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        domain = clean_domain(str(item.get("domain") or ""))
        if not domain or domain in seen:
            continue
        blocked, _cat = classify_domain_sensitivity(domain)
        if blocked:
            continue  # دفاع سمت سرور: حتی اگر فایل مخاطبی داشت، حذف
        # whitelist سخت‌گیرانه فیلدها
        visits = min(max(_as_int(item.get("visits"), 1), 0), 1_000_000)
        last_visit = _as_int(item.get("lastVisit"), 0)
        hist_raw = item.get("histogram")
        histogram = (
            [max(0, _as_int(v)) for v in hist_raw][:7]
            if isinstance(hist_raw, list) and len(hist_raw) >= 7
            else [0, 0, 0, 0, 0, 0, 0]
        )
        while len(histogram) < 7:
            histogram.append(0)
        rec = {"domain": domain, "visits": visits, "lastVisit": last_visit, "histogram": histogram}
        if VALUE_LEAK_RE.search(json.dumps(rec, ensure_ascii=False)):
            continue  # الگوی نشتی → حذف کامل
        seen.add(domain)
        out.append(rec)
    out.sort(key=lambda d: -d["visits"])
    return out[:MAX_DOMAINS]


def _clean_searches(raw: Any) -> List[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        term = str(item.get("term") or "").strip()[:MAX_TERM_LEN]
        if not term:
            continue
        normalized = normalize_text(term)
        if len(normalized) < MIN_TERM_LEN or len(normalized) > MAX_TERM_LEN:
            continue
        if is_profane(normalized):
            continue  # دفاع سمت سرور: مستهجن حذف — فقط نادیده گرفته می‌شود
        count = min(max(_as_int(item.get("count"), 1), 1), 100_000)
        last_seen = _as_int(item.get("lastSeen"), 0)
        engine = str(item.get("engine") or "")[:40]
        rec = {"term": term, "count": count, "lastSeen": last_seen, "engine": engine}
        if VALUE_LEAK_RE.search(json.dumps(rec, ensure_ascii=False)):
            continue
        if normalized in merged:
            merged[normalized]["count"] += count  # ادغام مجدد تکراری‌ها
            merged[normalized]["lastSeen"] = max(merged[normalized]["lastSeen"], last_seen)
        else:
            merged[normalized] = rec
    out = sorted(merged.values(), key=lambda s: (-s["count"], -s["lastSeen"]))
    return out[:MAX_SEARCHES]


def _clean_cookies(raw: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        domain = clean_domain(str(item.get("domain") or ""))
        name = str(item.get("name") or "").strip()[:80]
        if not domain or not name:
            continue
        # هر فیلد اضافه (مثل value!) یعنی فایل مطابق قرارداد نیست → رکورد حذف
        extra = set(item.keys()) - ALLOWED_COOKIE_KEYS
        if extra:
            continue
        blocked, _cat = classify_domain_sensitivity(domain)
        if blocked or SENSITIVE_COOKIE_NAME_RE.search(name):
            continue
        key = (domain, name)
        if key in seen:
            continue
        seen.add(key)
        out.append({"domain": domain, "name": name})
        if len(out) >= MAX_COOKIES:
            break
    return out


# ---------------------------------------------------------------------------
# اسکراب نهایی روی snapshot کامل (قبل از ذخیره در DB)
# ---------------------------------------------------------------------------
def final_scrub(snapshot: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    issues: List[str] = []

    def _filter(items: List[dict], allowed: set, what: str) -> List[dict]:
        kept = []
        for item in items:
            extra = set(item.keys()) - allowed
            if extra:
                issues.append(f"{what}: فیلد غیرمجاز {sorted(extra)}")
                continue
            if VALUE_LEAK_RE.search(json.dumps(item, ensure_ascii=False)):
                issues.append(f"{what}: الگوی نشتی مقدار")
                continue
            kept.append(item)
        return kept

    snapshot["cookies"] = _filter(snapshot.get("cookies", []), ALLOWED_COOKIE_KEYS, "cookie")
    snapshot["domains"] = _filter(snapshot.get("domains", []), ALLOWED_DOMAIN_KEYS, "domain")
    snapshot["searches"] = _filter(snapshot.get("searches", []), ALLOWED_SEARCH_KEYS, "search")
    snapshot["stats"] = {
        "domains": len(snapshot["domains"]),
        "searches": len(snapshot["searches"]),
        "cookies": len(snapshot["cookies"]),
        "totalVisits": sum(d["visits"] for d in snapshot["domains"]),
    }
    return snapshot, issues


def is_likely_snapshot_filename(filename: str) -> bool:
    """تشخیص نام فایل خروجی افزونه: browsing-profile_*.json"""
    return bool(re.match(r"^browsing-profile_.+\.json$", str(filename or "")))
