# ============================================================================
# interests.py — موتور علاقه‌مندی (محلی، صفر توکن AI) + تطبیق دسته جستجوها
# ----------------------------------------------------------------------------
# آینه منطق computeInterests سمت کلاینت قبلی — حالا سمت سرور تا داشبورد فقط
# رندر کند و منطق یک‌جا و قابل‌تست باشد.
# ============================================================================
import re
from typing import Dict, List, Optional

from .taxonomy import KEYWORDS, category_label, category_stats, categorize_domain

# کلیدواژه‌های فارسی برای تطبیق جستجوها با دسته‌ها (سریع و بدون توکن AI)
SEARCH_FA_KEYWORDS = {
    "shopping": ["خرید", "قیمت", "فروش", "تخفیف", "حراج", "کد تخفیف"],
    "news": ["خبر", "اخبار", "اعلام"],
    "education": ["آموزش", "دوره", "کتاب", "کنکور", "زبان"],
    "travel": ["بلیط", "هتل", "سفر", "پرواز", "تور"],
    "jobs": ["استخدام", "شغل", "رزومه", "کاریابی"],
    "food": ["رستوران", "سفارش غذا", "غذا"],
    "transport": ["اسنپ", "تپسی", "ماشین بگیر"],
    "entertainment": ["فیلم", "سریال", "دانلود فیلم", "بینویز", "دوبله"],
    "music": ["آهنگ", "موسیقی", "کنسرت"],
    "gaming": ["بازی", "گیم", "استیم"],
    "ai": ["هوش مصنوعی", "چت جی", "gpt", "چت‌بات"],
    "sports": ["فوتبال", "ورزش", "نتیجه بازی", "لیگ"],
    "tech-news": ["گوشی", "لپ تاپ", "لپتاپ", "موبایل", "تبلت", "هدفون", "ساعت هوشمند", "تکنولوژی", "بررسی"],
    "dev": ["پایتون", "جاوااسکریپت", "برنامه نویسی", "برنامه‌نویسی", "کدنویسی", "github", "گیت هاب", "جنگو", "فلاتر"],
    "reference": ["ویکی پدیا", "ویکی‌پدیا", "معنی", "ترجمه"],
}


def search_matches_category(term: str, category: str, domains: List[dict]) -> bool:
    """تطبیق جستجو با دسته: نام پایه دامنه‌های آن دسته، کلیدواژه لاتین یا فارسی دسته."""
    t = (term or "").lower()
    base_names = [clean_base(d["domain"]) for d in domains
                  if categorize_domain(d.get("domain", "")) == category][:30]
    for base in base_names:
        if len(base) >= 3 and base in t:
            return True
    for cat, kw in KEYWORDS:
        if cat == category:
            for word in kw.pattern.strip("()").split("|"):
                word = word.strip()
                if len(word) >= 3 and word in t:
                    return True
    for word in SEARCH_FA_KEYWORDS.get(category, []):
        w = word.lower()
        if len(w) >= 3 and w in t:
            return True
    return False


def clean_base(domain: str) -> str:
    d = (domain or "").lower().strip()
    d = d.removeprefix("www.").rstrip(".")
    parts = d.split(".")
    return parts[0] if parts else d


def compute_interests(snapshot: dict) -> List[dict]:
    """بخش‌های علاقه‌مندی برای رندر + مصرف در پرامپت AI."""
    domains: List[dict] = snapshot.get("domains", [])
    searches: List[dict] = snapshot.get("searches", [])
    total_visits = sum(d.get("visits", 0) for d in domains) or 1
    sections: List[dict] = []

    # ۱) پرتکرارترین جستجوها
    if searches:
        top = max(s.get("count", 1) for s in searches) or 1
        sections.append({
            "id": "top_searches", "icon": "🔎", "title": "پرتکرارترین جستجوها",
            "score": "بیشترین دفعات تکرار",
            "items": [{"label": s["term"], "badge": f"{s['count']:,} بار",
                       "weight": s.get("count", 1) / top} for s in searches[:8]],
        })

    # ۲) پربازدیدترین سایت‌ها
    if domains:
        top = max(d.get("visits", 1) for d in domains) or 1
        sections.append({
            "id": "top_sites", "icon": "🌐", "title": "پربازدیدترین سایت‌ها",
            "score": "بیشترین تعداد بازدید",
            "items": [{"label": d["domain"], "badge": f"{d.get('visits', 0):,} بازدید", "ltr": True,
                       "weight": d.get("visits", 0) / top} for d in domains[:8]],
        })

    # ۳) دسته‌های موردعلاقه
    cats = [c for c in category_stats(domains) if c["category"] not in ("search",)]
    if cats:
        top = cats[0]["visits"] or 1
        sections.append({
            "id": "categories", "icon": "❤️", "title": "دسته‌های موردعلاقه",
            "score": "بر اساس بازدید تجمعی",
            "items": [{"label": f"{c['icon']} {c['label']}",
                       "badge": f"{round(c['visits'] * 100 / total_visits)}٪ از بازدیدها",
                       "weight": c["visits"] / top} for c in cats[:8]],
        })

    # ۴) الگوی خرید / وفاداری
    shopping = sorted((d for d in domains if categorize_domain(d["domain"]) == "shopping"),
                      key=lambda d: -d.get("visits", 0))
    if shopping:
        top = shopping[0].get("visits", 1) or 1
        share = round(shopping[0].get("visits", 0) * 100 / total_visits)
        sections.append({
            "id": "shopping", "icon": "🛒", "title": "الگوی خرید",
            "score": "وفاداری بالا به یک فروشگاه" if share >= 40 else "تنوع در فروشگاه‌ها",
            "items": [{"label": d["domain"], "badge": f"{d.get('visits', 0):,} بازدید", "ltr": True,
                       "weight": d.get("visits", 0) / top} for d in shopping[:5]],
        })

    # ۵) الگوی زمانی
    hist = [0] * 7
    for d in domains:
        h = d.get("histogram") or [0] * 7
        for i in range(7):
            hist[i] += h[i] if i < len(h) else 0
    hist_total = sum(hist) or 1
    recent_share = round(sum(hist[4:7]) * 100 / hist_total)
    sections.append({
        "id": "recency", "icon": "⏱️", "title": "الگوی زمانی فعالیت",
        "score": "فعالیت اخیر بالا" if recent_share >= 50 else ("فعالیت متوسط" if recent_share >= 25 else "فعالیت پراکنده"),
        "chart": {"buckets": hist, "caption": "توزیع بازدیدها در بازه زمانی (قدیمی ← جدید)"},
        "items": [],
    })

    # ۶) دامنه کاوش
    avg = round(total_visits / len(domains)) if domains else 0
    sections.append({
        "id": "breadth", "icon": "🧭", "title": "دامنه کاوش",
        "score": "کنجکاوی بالا" if len(domains) >= 60 else ("متعادل" if len(domains) >= 20 else "متمرکز"),
        "items": [
            {"label": "تعداد دامنه‌های یکتا", "badge": f"{len(domains):,}", "weight": 1},
            {"label": "تعداد جستجوهای یکتا", "badge": f"{len(searches):,}", "weight": 1},
            {"label": "میانگین بازدید هر دامنه", "badge": f"{avg:,}", "weight": 1},
        ],
    })

    return sections


def compact_context_for_ai(snapshot: dict, max_domains: int = 40, max_searches: int = 50) -> str:
    """خلاصه آماری فشرده برای پرامپت AI — مصرف بهینه توکن."""
    domains = snapshot.get("domains", [])[:max_domains]
    searches = snapshot.get("searches", [])[:max_searches]
    lines: List[str] = []
    lines.append(f"# پروفایل پاکسازی‌شده — بازه {snapshot.get('rangeDays', 30)} روز")
    lines.append("")
    lines.append("## دامنه‌های پربازدید (دامنه | بازدید | دسته):")
    for d in domains:
        cat = categorize_domain(d["domain"])
        lines.append(f"- {d['domain']} | {d.get('visits', 0)} | {category_label(cat)}")
    lines.append("")
    lines.append("## توزیع دسته‌ای:")
    for c in category_stats(domains):
        lines.append(f"- {c['label']}: {c['domains']} دامنه، {c['visits']} بازدید")
    lines.append("")
    lines.append("## جستجوها (عبارت | تعداد):")
    for s in searches:
        lines.append(f"- {s['term']} | {s.get('count', 1)}")
    if len(snapshot.get("searches", [])) > max_searches:
        lines.append(f"- … و {len(snapshot['searches']) - max_searches} جستجوی دیگر")
    lines.append("")
    lines.append("## علاقه‌مندی‌های استخراج‌شده محلی:")
    for sec in compute_interests(snapshot):
        items = "، ".join(i["label"] for i in sec.get("items", [])[:5]) if sec.get("items") else ""
        lines.append(f"- {sec['title']} ({sec['score']})" + (f": {items}" if items else ""))
    return "\n".join(lines)
