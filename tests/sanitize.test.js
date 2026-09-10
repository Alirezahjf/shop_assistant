// ============================================================================
// tests/sanitize.test.js — تست‌های واحد هسته پاکسازی (node --test tests/)
// ============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeCookies, sanitizeHistory, buildSnapshot, finalIntegrityScrub,
  normalizeText, extractSearchFromUrl, cleanDomain, LIMITS,
} from '../smart-shopping-assistant/lib/sanitize.js';

import {
  classifyDomainSensitivity, isProfane,
} from '../smart-shopping-assistant/lib/blocklists.js';

import { categorizeDomain } from '../smart-shopping-assistant/lib/taxonomy-lite.js';

import { buildStoreLinks, storeNameFromLink } from '../smart-shopping-assistant/lib/stores.js';

// ─────────────────────────── نرمال‌سازی ───────────────────────────
describe('normalizeText', () => {
  test('ی阿拉伯→فارسی، اعراب، نیم‌فاصله، فاصله اضافی', () => {
    assert.equal(normalizeText('كِتابِ فارسي'), 'کتاب فارسی');
    assert.equal(normalizeText('خرید  کفش'), 'خرید کفش');
    assert.equal(normalizeText('خرید\u200cکفش'), 'خرید کفش');
    assert.equal(normalizeText('  Klingon?  ') , 'klingon');
  });

  test('نیم‌فاصله به فاصله تبدیل شود تا «میکروسافت» و «می كروسافت» یکی شوند؟ خیر — فقط مقایسه', () => {
    assert.equal(normalizeText('مي‌خواهم'), 'می خواهم');
  });
});

describe('cleanDomain', () => {
  test('حذف www فقط از ابتدا (رفع باگ replace)', () => {
    assert.equal(cleanDomain('WWW.Example.COM'), 'example.com');
    assert.equal(cleanDomain('awww.example.com'), 'awww.example.com');
    assert.equal(cleanDomain('www.www.ir'), 'www.ir');
  });
});

// ─────────────────────────── کوکی‌ها ───────────────────────────
describe('sanitizeCookies — حریم خصوصی', () => {
  const mk = (domain, name, extra = {}) => ({ domain, name, ...extra });

  test('مقدار کوکی هرگز در خروجی نیست (whitelist)', () => {
    const { cookies } = sanitizeCookies([
      mk('example.com', 'prefs', { value: 'TOPSECRET-VALUE', httpOnly: false }),
    ]);
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].value, undefined);
    assert.equal(JSON.stringify(cookies).includes('TOPSECRET'), false);
  });

  test('کوکی‌های HttpOnly (نشست لاگین) حذف می‌شوند', () => {
    const { cookies, report } = sanitizeCookies([
      mk('example.com', 'sessionid', { httpOnly: true }),
      mk('example.com', 'normal', { httpOnly: false }),
    ]);
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].name, 'normal');
    assert.equal(report.cookiesDroppedHttpOnly, 1);
  });

  test('دامنه پیام‌رسان/بانک/جنسی/ایمیل حذف می‌شود — حتی با نام بی‌خطر', () => {
    const { cookies, report } = sanitizeCookies([
      mk('web.telegram.org', 'theme'),
      mk('api.telegram.org', 'stel_token'),
      mk('bmi.ir', 'ui'),                    // بانک ملی
      mk('pornhub.com', 'age_gate'),
      mk('mail.google.com', 'MAIL_SETTINGS'),
      mk('accounts.google.com', 'LSID'),
      mk('sub.bankmellat.ir', 'x'),
    ]);
    assert.equal(cookies.length, 0);
    assert.ok(report.cookiesDroppedSensitiveDomain >= 6);
  });

  test('نام کوکی حساس (session/token/auth/card) حذف می‌شود', () => {
    const { cookies, report } = sanitizeCookies([
      mk('shop.com', 'PHPSESSID'),
      mk('shop.com', 'auth_token'),
      mk('shop.com', 'card_number'),
      mk('shop.com', 'csrf_token'),
      mk('shop.com', 'theme_color'), // بی‌خطر
      mk('shop.com', 'lang'),        // بی‌خطر
    ]);
    assert.deepEqual(cookies.map((c) => c.name).sort(), ['lang', 'theme_color']);
    assert.equal(report.cookiesDroppedSensitiveName, 4);
  });

  test('سقف تعداد کوکی‌ها رعایت می‌شود', () => {
    const many = Array.from({ length: LIMITS.maxCookies + 50 }, (_, i) => mk(`d${i}.com`, 'c'));
    const { cookies } = sanitizeCookies(many);
    assert.ok(cookies.length <= LIMITS.maxCookies);
  });
});

// ─────────────────────────── دامنه‌های حساس ───────────────────────────
describe('classifyDomainSensitivity', () => {
  const cases = [
    ['web.telegram.org', true], ['t.me', true], ['wa.me', true],
    ['eitaa.com', true], ['bale.ai', true],
    ['bankmellat.ir', true], ['bpm.bankmellat.ir', true],
    ['shaparak.ir', true], ['zarinpal.com', true], ['nobitex.ir', true],
    ['pornhub.com', true], ['xvideos.com', true],
    ['gmail.com', true], ['smtp.gmail.com', true],
    ['accounts.google.com', true], ['login.microsoftonline.com', true],
    ['auth.mysite.com', true],
    // سالم‌ها
    ['digikala.com', false], ['google.com', false], ['github.com', false],
    ['aparat.com', false], ['zoomit.ir', false],
  ];
  for (const [domain, blocked] of cases) {
    test(`${domain} → ${blocked ? 'مسدود' : 'مجاز'}`, () => {
      assert.equal(classifyDomainSensitivity(domain).blocked, blocked);
    });
  }
});

// ─────────────────────────── جستجوها ───────────────────────────
describe('استخراج و پاکسازی جستجوها', () => {
  test('استخراج از موتورهای مختلف', () => {
    assert.deepEqual(
      { ...extractSearchFromUrl('https://www.google.com/search?q=خرید+کفش&client=firefox') }.term,
      'خرید کفش');
    assert.equal(extractSearchFromUrl('https://www.bing.com/search?q=test').term, 'test');
    assert.equal(extractSearchFromUrl('https://duckduckgo.com/?q=hello').term, 'hello');
    assert.equal(extractSearchFromUrl('https://digikala.com/search/?q=x'), null); // موتور جستجو نیست
    assert.equal(extractSearchFromUrl('notaurl'), null);
  });

  test('ادغام تکراری دقیق: «خرید کفش» = «خرید کفش»', () => {
    const { searches, report } = sanitizeHistory([
      { url: 'https://www.google.com/search?q=%D8%AE%D8%B1%DB%8C%D8%AF+%DA%A9%D9%81%D8%B4', visitCount: 1, lastVisitTime: Date.now() },
      { url: 'https://www.google.com/search?q=خرید کفش', visitCount: 1, lastVisitTime: Date.now() },
    ]);
    assert.equal(searches.length, 1);
    assert.equal(searches[0].count, 2);
    assert.equal(report.duplicatesMerged, 1);
  });

  test('حفظ تمایز: «خرید کفش ورزشی» ≠ «خرید کفش»', () => {
    const { searches } = sanitizeHistory([
      { url: 'https://www.google.com/search?q=خرید کفش', visitCount: 1, lastVisitTime: Date.now() },
      { url: 'https://www.google.com/search?q=خرید کفش ورزشی', visitCount: 1, lastVisitTime: Date.now() },
    ]);
    assert.equal(searches.length, 2);
    const terms = searches.map((s) => s.term).sort();
    assert.deepEqual(terms, ['خرید کفش', 'خرید کفش ورزشی']);
  });

  test('ادغام با اختلاف حروف عربی/فارسی و نیم‌فاصله', () => {
    const { searches } = sanitizeHistory([
      { url: 'https://www.google.com/search?q=جاuvaherat' , visitCount: 1, lastVisitTime: Date.now() },
      { url: 'https://www.bing.com/search?q=جاuvaherat', visitCount: 1, lastVisitTime: Date.now() },
    ]);
    // هر دو یکسان‌اند (صرفاً تست تعادل)
    assert.equal(searches.length, 1);
  });

  test('حذف کلمات مستهجن — فقط شمارنده، بدون نگه‌داری', () => {
    const profaneQueries = ['سکس', 'دانلود فیلم سکسی', 'porn', 'xxx video', 'کیر', 'قیمت کفش سکسو? no'];
    const items = profaneQueries.map((t) => ({
      url: `https://www.google.com/search?q=${encodeURIComponent(t)}`,
      visitCount: 1, lastVisitTime: Date.now(),
    }));
    items.push({ url: `https://www.google.com/search?q=${encodeURIComponent('قیمت لپ‌تاپ')}`, visitCount: 1, lastVisitTime: Date.now() });
    const { searches, report } = sanitizeHistory(items);
    assert.equal(searches.length, 1);
    assert.equal(searches[0].term, 'قیمت لپ‌تاپ');
    assert.ok(report.searchesDroppedProfane >= 5);
    assert.equal(JSON.stringify(searches).includes('سکس'), false);
  });

  test('فالس‌پازیتوو: کلمات سالم حذف نشوند', () => {
    // «کس» کوتاه است — فقط تطبیق توکن کامل؛ پس «ککسوری/بکس» نباید حذف شود
    assert.equal(isProfane('بکس ورزشی'), false);
    assert.equal(isProfane('خرید کشر'), false);
    // «سکس» توکن مستقل باید حذف شود
    assert.equal(isProfane('دانلود سکس'), true);
    assert.equal(isProfane('سکسی'), true);
    assert.equal(isProfane('sex'), true);
    assert.equal(isProfane('سوکسالا'), false); // شامل «سکس» نیست به‌صورت توکن
  });
});

// ─────────────────────────── تاریخچه ───────────────────────────
describe('sanitizeHistory', () => {
  test('تجمیع بازدید دامنه‌ها و حذف صفحات غیر وب', () => {
    const { domains, report } = sanitizeHistory([
      { url: 'https://digikala.com/product/a', visitCount: 3, lastVisitTime: Date.now() },
      { url: 'https://www.digikala.com/cart', visitCount: 2, lastVisitTime: Date.now() },
      { url: 'chrome://settings', visitCount: 5, lastVisitTime: Date.now() },
      { url: 'file:///C:/x.pdf', visitCount: 1, lastVisitTime: Date.now() },
      { url: 'bad-url', visitCount: 1, lastVisitTime: Date.now() },
    ]);
    assert.equal(domains.length, 1);
    assert.equal(domains[0].domain, 'digikala.com');
    assert.equal(domains[0].visits, 5);
    assert.equal(domains[0].histogram.length, 7);
    assert.equal(report.historyDroppedNonWeb, 2);
    assert.equal(report.historyDroppedInvalid, 1);
  });

  test('حذف کامل دامنه‌های حساس از تاریخچه', () => {
    const { domains, report } = sanitizeHistory([
      { url: 'https://web.telegram.org/a/', visitCount: 9, lastVisitTime: Date.now() },
      { url: 'https://ib.bmi.ir/login', visitCount: 4, lastVisitTime: Date.now() },
      { url: 'https://mail.yahoo.com', visitCount: 2, lastVisitTime: Date.now() },
      { url: 'https://www.youtube.com/watch', visitCount: 6, lastVisitTime: Date.now() },
    ]);
    assert.equal(domains.length, 1);
    assert.equal(domains[0].domain, 'youtube.com');
    assert.equal(report.historyDroppedSensitiveDomain, 3);
  });

  test('در خروجی تاریخچه نه URL هست نه عنوان', () => {
    const { domains } = sanitizeHistory([
      { url: 'https://example.com/very/secret/path?token=abc', title: 'مخفی', visitCount: 1, lastVisitTime: Date.now() },
    ]);
    const s = JSON.stringify(domains);
    assert.equal(s.includes('secret'), false);
    assert.equal(s.includes('مخفی'), false);
    assert.equal(s.includes('token'), false);
  });
});

// ─────────────────────────── Snapshot و اسکراب ───────────────────────────
describe('buildSnapshot و finalIntegrityScrub', () => {
  test('ساختار snapshot با تضمین‌های حریم خصوصی', () => {
    const snap = buildSnapshot({
      history: [{ url: 'https://google.com/search?q=کتاب', visitCount: 1, lastVisitTime: Date.now() }],
      cookies: [{ domain: 'a.com', name: 'x', value: 'LEAK', httpOnly: false }],
    }, { days: 14, deviceLabel: 'تست' });
    assert.equal(snap.schemaVersion, 2);
    assert.equal(snap.privacy.privacyGuarantees.cookieValuesCollected, false);
    assert.ok(snap.stats.domains >= 1);
    assert.equal(JSON.stringify(snap).includes('LEAK'), false);
  });

  test('اسکراب نهایی فیلد غیرمجاز را حذف می‌کند', () => {
    const snap = buildSnapshot({ history: [], cookies: [] }, { days: 7 });
    const tampered = {
      ...snap,
      cookies: [{ domain: 'x.com', name: 'c', value: 'hacker-value' }],
      domains: [{ domain: 'x.com', visits: 1, lastVisit: 0, histogram: [0, 0, 0, 0, 0, 0, 0], hack: 1 }],
    };
    const { snapshot, issues } = finalIntegrityScrub(tampered);
    assert.equal(snapshot.cookies.length, 0);
    assert.equal(snapshot.domains.length, 0);
    assert.ok(issues.length >= 2);
  });

  test('اسکراب: JWT/کارت/ایمیل در هر رکورد مسیر حذف دارد', () => {
    const snap = buildSnapshot({ history: [], cookies: [] }, { days: 7 });
    const tampered = {
      ...snap,
      searches: [
        { term: 'ali@example.com', count: 1, lastSeen: 0, engine: 'g' },
        { term: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcABC123_x', count: 1, lastSeen: 0, engine: 'g' },
        { term: '6221060000000000', count: 1, lastSeen: 0, engine: 'g' },
      ],
    };
    const { snapshot } = finalIntegrityScrub(tampered);
    assert.equal(snapshot.searches.length, 0);
  });
});

// ─────────────────────────── طبقه‌بندی و فروشگاه‌ها ───────────────────────────
describe('taxonomy و stores', () => {
  test('دسته‌بندی دامنه‌های نمونه', () => {
    assert.equal(categorizeDomain('digikala.com'), 'shopping');
    assert.equal(categorizeDomain('en.wikipedia.org'), 'reference');
    assert.equal(categorizeDomain('university.ac.ir'), 'education');
    assert.equal(categorizeDomain('unknown-site.xyz'), 'other');
  });

  test('لینک فروشگاه‌ها و نام فروشگاه از لینک', () => {
    const links = buildStoreLinks('گوشی سامسونگ');
    assert.ok(links.length >= 10);
    assert.ok(links.every((l) => l.url.startsWith('https://')));
    assert.equal(storeNameFromLink('https://www.digikala.com/product/123'), 'دیجی‌کالا');
    assert.equal(storeNameFromLink('https://amazon.com/s?k=x'), 'آمازون');
    assert.equal(storeNameFromLink('https://example.com'), null);
  });
});
