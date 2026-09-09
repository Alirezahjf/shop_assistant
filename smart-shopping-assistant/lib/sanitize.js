// ============================================================================
// sanitize.js — هسته پاکسازی داده (Pure Functions؛ بدون هیچ وابستگی به Chrome API)
// ----------------------------------------------------------------------------
// اصول طراحی (غیرقابل‌مصالحه):
//  1) WHITELIST نه BLACKLIST: رکورد خروجی فقط با ساخت صریح {domain, name} ساخته
//     می‌شود. مقدار کوکی (value) «هرگز» حتی به حافظه‌ی شیء خروجی کپی نمی‌شود.
//  2) شش لایه دفاعی با شمارنده گزارش‌گیری — هر رکورد حذف‌شده ثبت آماری می‌شود
//     (فقط شمارنده؛ بدون نگه‌داری خودِ رکورد).
//  3) اسکراب نهایی: خروجی سریالایز و با الگوهای نشتی (JWT/کارت/شبا/ایمیل/توکن)
//     اسکن می‌شود؛ اگر چیزی پیدا شود، آن رکورد حذف و گزارش می‌گردد.
//  4) تاریخچه: فقط دامنه + تعداد بازدید + زمان آخرین بازدید. عنوان صفحات
//     (title) و URL کامل هرگز در خروجی نمی‌آیند.
//  5) جستجوها: نرمال‌سازی فارسی/انگلیسی → فیلتر مستهجن → ادغام دقیق تکراری‌ها
//     (مثال کاربر: «خرید کفش» و «خرید کفش» یکی می‌شوند؛ اما «خرید کفش ورزشی»
//     عبارت متفاوتی است و حفظ می‌شود.)
// ============================================================================

import {
  classifyDomainSensitivity,
  SENSITIVE_COOKIE_NAME_RE,
  VALUE_LEAK_RE,
  isProfane,
} from './blocklists.js';

export const SNAPSHOT_SCHEMA_VERSION = 2;

/** حداکثرها — سقف ایمن برای جلوگیری از تورم خروجی */
export const LIMITS = {
  maxCookies: 2000,
  maxHistoryDomains: 1500,
  maxSearches: 800,
  maxTermLength: 120,
  minTermLength: 2,
};

// ---------------------------------------------------------------------------
// نرمال‌سازی متن فارسی/انگلیسی برای مقایسه دقیق
// ---------------------------------------------------------------------------
export function normalizeText(input) {
  let s = String(input ?? '');
  s = s.normalize('NFKC');
  // یکسان‌سازی حروف عربی/فارسی
  s = s
    .replace(/[\u064A\u0649]/g, '\u06CC') // ي ى → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/\u0629/g, '\u0647') // ة → ه
    .replace(/[\u0622\u0623\u0625]/g, '\u0627') // آ أ إ → ا
    .replace(/[\u064B-\u0652\u0670\u0640]/g, ''); // اعراب و کشیده
  // نیم‌فاصله/ZWJ → فاصله (قبل از حذف کاراکترهای کنترلی تا حذف نشوند)
  s = s.replace(/[\u200C\u200D]/g, ' ');
  s = s.replace(/[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  s = s.toLowerCase();
  s = s.replace(/[.,،؛;:!؟?()"'\-_/\\]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** پاک‌سازی نام دامنه: حذف www. فقط از ابتدا (رفع باگ replace('www.','')) */
export function cleanDomain(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .trim()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

function newReport() {
  return {
    cookiesScanned: 0,
    cookiesDroppedSensitiveDomain: 0,
    cookiesDroppedSensitiveName: 0,
    cookiesDroppedHttpOnly: 0,
    cookiesDroppedInvalid: 0,
    cookiesDroppedFinalScrub: 0,
    cookiesKept: 0,
    cookieValuesCollected: false, // همیشه false — قرارداد
    historyItemsScanned: 0,
    historyDroppedSensitiveDomain: 0,
    historyDroppedNonWeb: 0,
    historyDroppedInvalid: 0,
    historyDomainsKept: 0,
    pagesTitlesStripped: true, // عنوان‌ها اصلاً جمع نمی‌شوند
    urlsStrippedToDomain: true, // فقط دامنه نگه داشته می‌شود
    searchesScanned: 0,
    searchesDroppedProfane: 0,
    searchesDroppedShortOrLong: 0,
    duplicatesMerged: 0,
    searchesKept: 0,
    blockedDomainSamples: [], // حداکثر ۲۰ دسته‌ی نمونه (بدون مقدار حساس — فقط دسته)
  };
}

function noteBlockedSample(report, category) {
  if (report.blockedDomainSamples.length < 20 && !report.blockedDomainSamples.includes(category)) {
    report.blockedDomainSamples.push(category);
  }
}

// ---------------------------------------------------------------------------
// لایه‌های ۱ تا ۵: پاکسازی کوکی‌ها
// ---------------------------------------------------------------------------

/**
 * @param {Array<{domain?:string, name?:string, httpOnly?:boolean, ...}>} rawCookies
 * @returns {{cookies: Array<{domain:string,name:string}>, report: object}}
 */
export function sanitizeCookies(rawCookies) {
  const report = newReport();
  const kept = [];
  const seen = new Set();

  for (const c of Array.isArray(rawCookies) ? rawCookies : []) {
    report.cookiesScanned++;

    // لایه ۰ — اعتبارسنجی ساختاری
    if (!c || typeof c !== 'object' || typeof c.domain !== 'string' || typeof c.name !== 'string') {
      report.cookiesDroppedInvalid++;
      continue;
    }
    const domain = cleanDomain(c.domain);
    const name = c.name.trim();
    if (!domain || !name) {
      report.cookiesDroppedInvalid++;
      continue;
    }

    // لایه ۱ — کوکی‌های HttpOnly = نشست‌های احراز هویت؛ حذف کامل
    if (c.httpOnly === true) {
      report.cookiesDroppedHttpOnly++;
      continue;
    }

    // لایه ۲ — دامنه حساس (پیام‌رسان/بانک/جنسی/ایمیل/هویت) → حذف کامل دامنه
    const sens = classifyDomainSensitivity(domain);
    if (sens.blocked) {
      report.cookiesDroppedSensitiveDomain++;
      noteBlockedSample(report, sens.category);
      continue;
    }

    // لایه ۳ — نام کوکی حساس (session/token/auth/card/...) → حذف
    if (SENSITIVE_COOKIE_NAME_RE.test(name)) {
      report.cookiesDroppedSensitiveName++;
      continue;
    }

    // لایه ۴ — ساخت WHITELIST خروجی: مقدار (value) عمداً کپی نمی‌شود.
    const dedupeKey = domain + '\u0000' + name;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // لایه ۵ — اسکراب نهایی ضد نشتی (سپر دوم)
    const probe = JSON.stringify({ domain, name });
    if (VALUE_LEAK_RE.test(probe)) {
      report.cookiesDroppedFinalScrub++;
      continue;
    }

    if (kept.length >= LIMITS.maxCookies) break;
    kept.push({ domain, name });
  }

  report.cookiesKept = kept.length;
  return { cookies: kept, report };
}

// ---------------------------------------------------------------------------
// استخراج جستجوها از URL موتورهای جستجو
// ---------------------------------------------------------------------------
const SEARCH_ENGINES = [
  { host: 'google', params: ['q'] },
  { host: 'bing.com', params: ['q'] },
  { host: 'duckduckgo.com', params: ['q'] },
  { host: 'search.yahoo.com', params: ['p'] },
  { host: 'yandex', params: ['text'] },
  { host: 'parsijoo.ir', params: ['q'] },
  { host: 'ecosia.org', params: ['q'] },
  { host: 'search.brave.com', params: ['q'] },
  { host: 'startpage.com', params: ['query'] },
];

/** استخراج عبارت جستجو از یک URL؛ خروجی null یعنی جستجو نیست */
export function extractSearchFromUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = cleanDomain(url.hostname);
  const engine = SEARCH_ENGINES.find((e) => host.includes(e.host));
  if (!engine) return null;
  for (const p of engine.params) {
    const v = url.searchParams.get(p);
    if (v && v.trim()) return { term: v.trim().slice(0, LIMITS.maxTermLength), engine: host };
  }
  return null;
}

// ---------------------------------------------------------------------------
// پاکسازی تاریخچه مرور → آمار دامنه‌ای + جستجوهای پاکسازی‌شده
// ---------------------------------------------------------------------------

/**
 * @param {Array<{url?:string, visitCount?:number, lastVisitTime?:number}>} historyItems
 * @param {{days?: number}} opts
 */
export function sanitizeHistory(historyItems, opts = {}) {
  const days = opts.days && opts.days > 0 ? opts.days : 30;
  const report = newReport();
  const domains = new Map(); // domain -> {domain, visits, lastVisit, dailyHistogram}
  const searches = new Map(); // normalizedTerm -> {term, count, lastSeen, engine, normalized}

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const item of Array.isArray(historyItems) ? historyItems : []) {
    report.historyItemsScanned++;
    if (!item || typeof item.url !== 'string') {
      report.historyDroppedInvalid++;
      continue;
    }

    // جستجو؟ (قبل از فیلتر دامنه — موتورهای جستجو خودشان دامنه معمولی‌اند)
    const searchHit = extractSearchFromUrl(item.url);

    let url;
    try {
      url = new URL(item.url);
    } catch {
      report.historyDroppedInvalid++;
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) {
      report.historyDroppedNonWeb++;
      continue;
    }
    const domain = cleanDomain(url.hostname);
    if (!domain) {
      report.historyDroppedInvalid++;
      continue;
    }

    // لایه — دامنه حساس (پیام‌رسان/بانک/جنسی/ایمیل/هویت) → حتی دامنه هم ثبت نمی‌شود
    const sens = classifyDomainSensitivity(domain);
    if (sens.blocked) {
      report.historyDroppedSensitiveDomain++;
      noteBlockedSample(report, sens.category);
      continue;
    }

    const visits = Math.max(1, Math.min(Number(item.visitCount) || 1, 9999));
    const lastVisit = Number(item.lastVisitTime) || now;

    // ثبت آمار دامنه (بدون URL، بدون title)
    if (!domains.has(domain)) {
      domains.set(domain, {
        domain,
        visits: 0,
        lastVisit,
        histogram: new Array(7).fill(0), // هفت bucket زمانی برای تحلیل recency
      });
    }
    const d = domains.get(domain);
    d.visits += visits;
    d.lastVisit = Math.max(d.lastVisit, lastVisit);
    const bucket = Math.min(6, Math.floor((now - lastVisit) / (days / 7 * dayMs)));
    if (bucket >= 0) d.histogram[bucket] += visits;

    // ثبت جستجو
    if (searchHit) {
      report.searchesScanned++;
      const normalized = normalizeText(searchHit.term);
      if (normalized.length < LIMITS.minTermLength || normalized.length > LIMITS.maxTermLength) {
        report.searchesDroppedShortOrLong++;
      } else if (isProfane(normalized)) {
        report.searchesDroppedProfane++; // حذف کامل؛ فقط شمارنده
      } else {
        const existing = searches.get(normalized);
        if (existing) {
          // ادغام تکراری دقیق (پس از نرمال‌سازی)
          existing.count += 1;
          existing.lastSeen = Math.max(existing.lastSeen, lastVisit);
          report.duplicatesMerged++;
        } else {
          searches.set(normalized, {
            term: searchHit.term, // شکل اصلی اولین بار
            normalized,
            count: 1,
            lastSeen: lastVisit,
            engine: searchHit.engine,
          });
        }
      }
    }
  }

  const domainList = Array.from(domains.values())
    .sort((a, b) => b.visits - a.visits)
    .slice(0, LIMITS.maxHistoryDomains)
    .map((d) => ({ domain: d.domain, visits: d.visits, lastVisit: d.lastVisit, histogram: d.histogram }));

  const searchList = Array.from(searches.values())
    .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
    .slice(0, LIMITS.maxSearches)
    .map((s) => ({ term: s.term, count: s.count, lastSeen: s.lastSeen, engine: s.engine }));

  report.historyDomainsKept = domainList.length;
  report.searchesKept = searchList.length;

  return { domains: domainList, searches: searchList, report };
}

// ---------------------------------------------------------------------------
// ساخت Snapshot نهایی خروجی (فرمت v2 — قرارداد مشترک با داشبورد)
// ---------------------------------------------------------------------------

/**
 * @param {{cookies: Array, history: Array}} raw
 * @param {{days?: number, deviceLabel?: string}} opts
 */
export function buildSnapshot(raw, opts = {}) {
  const days = opts.days && opts.days > 0 ? opts.days : 30;
  const { cookies, report: cookieReport } = sanitizeCookies(raw.cookies);
  const { domains, searches, report: historyReport } = sanitizeHistory(raw.history, { days });

  const report = {
    cookieReport,
    historyReport,
    privacyGuarantees: {
      cookieValuesCollected: false,
      cookieValuesStored: false,
      pageTitlesCollected: false,
      fullUrlsCollected: false,
      sensitiveDomainsCompletelyRemoved: true,
      rawHistoryStored: false,
    },
  };

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedBy: 'smart-shopping-assistant',
    exportType: 'sanitized-browsing-profile',
    deviceLabel: String(opts.deviceLabel || 'دستگاه بدون نام').slice(0, 60),
    createdAt: new Date().toISOString(),
    rangeDays: days,
    stats: {
      domains: domains.length,
      searches: searches.length,
      cookies: cookies.length,
      totalVisits: domains.reduce((s, d) => s + d.visits, 0),
    },
    domains,
    searches,
    cookies,
    privacy: report,
  };
}

/**
 * اسکراب دفاعی نهایی روی Snapshot کامل (پیش از ذخیره/ارسال).
 * هر نشتی احتمالی حذف می‌شود؛ خروجی همیشه قابل اعتماد است.
 */
export function finalIntegrityScrub(snapshot) {
  const issues = [];
  const allowedCookieKeys = new Set(['domain', 'name']);
  const allowedDomainKeys = new Set(['domain', 'visits', 'lastVisit', 'histogram']);
  const allowedSearchKeys = new Set(['term', 'count', 'lastSeen', 'engine']);

  const clean = (arr, allowed, what) =>
    arr.filter((item) => {
      const keys = Object.keys(item);
      const extra = keys.filter((k) => !allowed.has(k));
      if (extra.length > 0) {
        issues.push(`${what}: فیلد غیرمجاز ${extra.join(',')}`);
        return false;
      }
      if (VALUE_LEAK_RE.test(JSON.stringify(item))) {
        issues.push(`${what}: الگوی نشتی مقدار`);
        return false;
      }
      return true;
    });

  const out = {
    ...snapshot,
    cookies: clean(snapshot.cookies || [], allowedCookieKeys, 'cookie'),
    domains: clean(snapshot.domains || [], allowedDomainKeys, 'domain'),
    searches: clean(snapshot.searches || [], allowedSearchKeys, 'search'),
  };

  // histogram باید آرایه ۷تایی عدد باشد
  out.domains = out.domains.map((d) => ({
    ...d,
    histogram: Array.isArray(d.histogram) && d.histogram.length === 7
      ? d.histogram.map((n) => Number(n) || 0)
      : [0, 0, 0, 0, 0, 0, 0],
  }));

  return { snapshot: out, issues };
}
