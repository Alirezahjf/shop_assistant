// ============================================================================
// taxonomy-lite.js — دسته‌بندی سبک دامنه‌ها برای افزونه (بدون AI، صفر توکن)
// نسخه کامل‌تر و قابل توسعه در داشبورد (lib/taxonomy.js) نگه‌داری می‌شود.
// ============================================================================

import { cleanDomain } from './sanitize.js';

const EXACT = new Map(Object.entries({
  // فروشگاهی
  'digikala.com': 'shopping', 'torob.com': 'shopping', 'emalls.ir': 'shopping',
  'technolife.ir': 'shopping', 'mobit.ir': 'shopping', 'modiseh.ir': 'shopping',
  'basalam.com': 'shopping', 'okala.com': 'shopping', 'divar.ir': 'classifieds',
  'sheypoor.com': 'classifieds', 'amazon.com': 'shopping', 'aliexpress.com': 'shopping',
  'ebay.com': 'shopping', 'etsy.com': 'shopping',
  // سرگرمی / ویدیو / موسیقی
  'filimo.com': 'entertainment', 'namava.ir': 'entertainment', 'telewebion.com': 'entertainment',
  'aparat.com': 'video', 'youtube.com': 'video', 'netflix.com': 'entertainment',
  'twitch.tv': 'video', 'radiojavan.com': 'music', 'navahang.com': 'music',
  'spotify.com': 'music', 'soundcloud.com': 'music', 'steamcommunity.com': 'gaming',
  'steampowered.com': 'gaming',
  // هوش مصنوعی
  'chatgpt.com': 'ai', 'openai.com': 'ai', 'claude.ai': 'ai', 'anthropic.com': 'ai',
  'avalai.ir': 'ai', 'huggingface.co': 'ai', 'kaggle.com': 'ai', 'perplexity.ai': 'ai',
  // موتور جستجو
  'google.com': 'search', 'bing.com': 'search', 'duckduckgo.com': 'search',
  'parsijoo.ir': 'search', 'yandex.com': 'search',
  // اجتماعی
  'instagram.com': 'social', 'twitter.com': 'social', 'x.com': 'social',
  'facebook.com': 'social', 'linkedin.com': 'social', 'reddit.com': 'social',
  'pinterest.com': 'social', 'quora.com': 'social',
  // خبر / تک
  'zoomit.ir': 'tech-news', 'digiato.com': 'tech-news', 'isna.ir': 'news',
  'irna.ir': 'news', 'khabaronline.ir': 'news', 'tabnak.ir': 'news',
  'bbc.com': 'news', 'cnn.com': 'news', 'varzesh3.com': 'sports', '90tv.ir': 'sports',
  // توسعه و آموزش
  'github.com': 'dev', 'gitlab.com': 'dev', 'stackoverflow.com': 'dev',
  'medium.com': 'reference', 'wikipedia.org': 'reference',
  'maktabkhooneh.org': 'education', 'quera.org': 'education', 'faradars.org': 'education',
  'khanacademy.org': 'education', 'coursera.org': 'education', 'udemy.com': 'education',
  // خدمات
  'alibaba.ir': 'travel', 'snapptrip.com': 'travel', 'flightio.com': 'travel',
  'snapp.ir': 'transport', 'tapsi.ir': 'transport', 'snappfood.ir': 'food',
  'delino.com': 'food', 'jobinja.ir': 'jobs', 'jobvision.ir': 'jobs', 'iranjobs.ir': 'jobs',
}));

const KEYWORDS = [
  { cat: 'shopping', re: /(shop|store|bazar|bazr|market|kharid)/ },
  { cat: 'news', re: /(news|khabar|akhabar|press|akhbar)/ },
  { cat: 'education', re: /(learn|academy|course|amoozesh|dabirest|school)/ },
  { cat: 'travel', re: /(travel|hotel|flight|ticket|tour)/ },
  { cat: 'ai', re: /(ai|gpt|llm|chatbot)/ },
];

export const CATEGORY_LABELS = {
  shopping: 'فروشگاهی',
  classifieds: 'نیازمندی‌ها',
  entertainment: 'فیلم و سریال',
  video: 'ویدیو',
  music: 'موسیقی',
  gaming: 'بازی',
  ai: 'هوش مصنوعی',
  search: 'موتور جستجو',
  social: 'شبکه اجتماعی',
  'tech-news': 'تکنولوژی',
  news: 'خبری',
  sports: 'ورزشی',
  dev: 'برنامه‌نویسی',
  reference: 'مرجع / دانشنامه',
  education: 'آموزشی',
  travel: 'سفر',
  transport: 'حمل‌ونقل',
  food: 'غذا و رستوران',
  jobs: 'کاریابی',
  other: 'سایر',
};

/** دسته یک دامنه */
export function categorizeDomain(hostname) {
  const d = cleanDomain(hostname);
  // suffix match (مثل en.wikipedia.org)
  for (const [domain, cat] of EXACT) {
    if (d === domain || d.endsWith('.' + domain)) return cat;
  }
  for (const k of KEYWORDS) {
    if (k.re.test(d)) return k.cat;
  }
  // پسوند آکادمیک/دولتی ایران
  if (d.endsWith('.ac.ir')) return 'education';
  return 'other';
}

/** آمار دسته‌ای از لیست دامنه‌ها */
export function categoryStats(domains) {
  const map = new Map();
  for (const d of domains || []) {
    const cat = categorizeDomain(d.domain);
    const prev = map.get(cat) || { category: cat, visits: 0, domains: 0 };
    prev.visits += d.visits;
    prev.domains += 1;
    map.set(cat, prev);
  }
  return Array.from(map.values()).sort((a, b) => b.visits - a.visits);
}
