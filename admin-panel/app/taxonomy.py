# ============================================================================
# taxonomy.py — دسته‌بندی دامنه‌ها (سرور-محور؛ صفر توکن AI)
# ============================================================================
import re
from typing import Dict, List

from .sanitize import clean_domain  # re-export convenience

EXACT: Dict[str, str] = {
    # فروشگاهی
    "digikala.com": "shopping", "torob.com": "shopping", "emalls.ir": "shopping",
    "technolife.ir": "shopping", "mobit.ir": "shopping", "modiseh.ir": "shopping",
    "basalam.com": "shopping", "okala.com": "shopping", "snappmarket.ir": "shopping",
    "divar.ir": "classifieds", "sheypoor.com": "classifieds",
    "amazon.com": "shopping", "aliexpress.com": "shopping", "ebay.com": "shopping", "etsy.com": "shopping",
    # سرگرمی / ویدیو / موسیقی
    "filimo.com": "entertainment", "namava.ir": "entertainment", "telewebion.com": "entertainment",
    "netflix.com": "entertainment", "aparat.com": "video", "youtube.com": "video", "twitch.tv": "video",
    "radiojavan.com": "music", "navahang.com": "music", "spotify.com": "music", "soundcloud.com": "music",
    "steampowered.com": "gaming", "steamcommunity.com": "gaming",
    # هوش مصنوعی
    "chatgpt.com": "ai", "openai.com": "ai", "claude.ai": "ai", "anthropic.com": "ai",
    "avalai.ir": "ai", "huggingface.co": "ai", "kaggle.com": "ai", "perplexity.ai": "ai",
    # جستجو
    "google.com": "search", "bing.com": "search", "duckduckgo.com": "search", "parsijoo.ir": "search",
    # اجتماعی
    "instagram.com": "social", "twitter.com": "social", "x.com": "social", "facebook.com": "social",
    "linkedin.com": "social", "reddit.com": "social", "pinterest.com": "social", "quora.com": "social",
    # خبر / تک
    "zoomit.ir": "tech-news", "digiato.com": "tech-news", "isna.ir": "news", "irna.ir": "news",
    "khabaronline.ir": "news", "tabnak.ir": "news", "bbc.com": "news", "cnn.com": "news",
    "varzesh3.com": "sports", "90tv.ir": "sports",
    # توسعه و آموزش
    "github.com": "dev", "gitlab.com": "dev", "stackoverflow.com": "dev",
    "wikipedia.org": "reference", "medium.com": "reference",
    "maktabkhooneh.org": "education", "quera.org": "education", "faradars.org": "education",
    "khanacademy.org": "education", "coursera.org": "education", "udemy.com": "education",
    # خدمات
    "alibaba.ir": "travel", "snapptrip.com": "travel", "flightio.com": "travel",
    "snapp.ir": "transport", "tapsi.ir": "transport", "snappfood.ir": "food", "delino.com": "food",
    "jobinja.ir": "jobs", "jobvision.ir": "jobs", "iranjobs.ir": "jobs",
}

KEYWORDS = [
    ("shopping", re.compile(r"(shop|store|bazar|market|kharid)", re.I)),
    ("news", re.compile(r"(news|khabar|akhbar|press)", re.I)),
    ("education", re.compile(r"(learn|academy|course|amoozesh|school)", re.I)),
    ("travel", re.compile(r"(travel|hotel|flight|ticket|tour)", re.I)),
    ("ai", re.compile(r"(ai|gpt|llm|chatbot)", re.I)),
]

LABELS: Dict[str, str] = {
    "shopping": "فروشگاهی", "classifieds": "نیازمندی‌ها", "entertainment": "فیلم و سریال",
    "video": "ویدیو", "music": "موسیقی", "gaming": "بازی", "ai": "هوش مصنوعی",
    "search": "موتور جستجو", "social": "شبکه اجتماعی", "tech-news": "تکنولوژی",
    "news": "خبری", "sports": "ورزشی", "dev": "برنامه‌نویسی", "reference": "مرجع / دانشنامه",
    "education": "آموزشی", "travel": "سفر", "transport": "حمل‌ونقل", "food": "غذا و رستوران",
    "jobs": "کاریابی", "gov": "دولتی / سازمانی", "other": "سایر",
}

ICONS: Dict[str, str] = {
    "shopping": "🛒", "classifieds": "🏷️", "entertainment": "🎬", "video": "▶️", "music": "🎵",
    "gaming": "🎮", "ai": "🤖", "search": "🔍", "social": "💬", "tech-news": "💻",
    "news": "📰", "sports": "⚽", "dev": "👨‍💻", "reference": "📚", "education": "🎓",
    "travel": "✈️", "transport": "🚕", "food": "🍔", "jobs": "💼", "gov": "🏛️", "other": "🌐",
}


def categorize_domain(hostname: str) -> str:
    d = clean_domain(hostname)
    for dom, cat in EXACT.items():
        if d == dom or d.endswith("." + dom):
            return cat
    for cat, kw in KEYWORDS:
        if kw.search(d):
            return cat
    if d.endswith(".ac.ir") or d.endswith(".edu"):
        return "education"
    if d.endswith(".gov.ir") or d.endswith(".gov"):
        return "gov"
    return "other"


def category_label(cat: str) -> str:
    return LABELS.get(cat, cat)


def category_icon(cat: str) -> str:
    return ICONS.get(cat, "🌐")


def category_stats(domains: List[dict]) -> List[dict]:
    """آمار دسته‌ای: [{category, label, icon, visits, domains}] مرتب بر اساس بازدید."""
    acc: Dict[str, dict] = {}
    for d in domains or []:
        cat = categorize_domain(d.get("domain", ""))
        cur = acc.setdefault(cat, {"category": cat, "label": category_label(cat),
                                   "icon": category_icon(cat), "visits": 0, "domains": 0})
        cur["visits"] += d.get("visits", 0)
        cur["domains"] += 1
    return sorted(acc.values(), key=lambda c: -c["visits"])
