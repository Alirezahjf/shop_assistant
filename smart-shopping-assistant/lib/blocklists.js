// ============================================================================
// blocklists.js — فهرست‌های مسدودسازی و قوانین حساسیت (Pure Data + Regex)
// ----------------------------------------------------------------------------
// این فایل «تنها منبع حقیقت» برای فیلترهای حریم خصوصی است.
// هیچ مقدار کوکی/عنوان صفحه/URL خام هرگز نباید از فیلترهای اینجا عبور کند.
// لایه‌ها:
//   1) دامنه‌های حساس (پیام‌رسان، بانکی/پرداخت، محتوای جنسی، ایمیل، هویت/OAuth)
//   2) الگوهای نام کوکی حساس (session/token/auth/card/...)
//   3) کلمات مستهجن (فارسی + انگلیسی) برای تاریخچه جستجو
//   4) الگوهای «نشتی مقدار» برای اسکراب نهایی (JWT/IBAN/کارت/ایمیل/توکن‌های Base64)
// ============================================================================

/** انواع دسته حساس — اگر دامنه‌ای در هرکدام افتاد، به‌کلی از خروجی حذف می‌شود. */
export const SENSITIVE_CATEGORIES = {
  messenger: 'پیام‌رسان',
  banking: 'بانکی / پرداخت',
  adult: 'محتوای جنسی',
  email: 'سرویس ایمیل',
  identity: 'هویت / ورود (OAuth, SSO)',
};

// ---------------------------------------------------------------------------
// 1) دامنه‌های دقیق حساس (تطبیق دقیق یا suffix مثل ".telegram.org")
//    نکته: دامنه‌ها بدون "www." و lowercase نگه داشته می‌شوند.
// ---------------------------------------------------------------------------
export const SENSITIVE_EXACT_DOMAINS = new Set([
  // پیام‌رسان‌ها
  'telegram.org', 't.me', 'telegram.me', 'web.telegram.org', 'tdesktop.com',
  'wa.me', 'chat.whatsapp.com',
  'whatsapp.com', 'web.whatsapp.com',
  'eitaa.com', 'web.eitaa.com',
  'gap.im', 'gapplus.ir',
  'bale.ai', 'web.bale.ai',
  'igap.net',
  'slog.social',
  'messenger.com', 'm.me',
  'discord.com', 'discordapp.com',
  'signal.org',
  'imo.im', 'viber.com', 'line.me', 'wechat.com', 'weixin.qq.com', 'qq.com',
  'skype.com', 'live.com',
  'threema.ch', 'wire.com',

  // بانکی / پرداخت (ایرانی + بین‌المللی)
  'bmi.ir', 'bankmellat.ir', 'bpm.bankmellat.ir', 'bankmelli.ir',
  'banksepah.ir', 'bsi.ir', 'sepah.ir',
  'refah-bank.ir', 'bankrefah.ir',
  'bank-maskan.ir', 'maskanbank.ir',
  'bpi.ir', 'pasargadbank.ir', 'epay.pasargadbank.ir',
  'parsian-bank.ir', 'bankparsian.ir',
  'enbank.ir', 'edbi.ir', 'bki.ir', 'tejaratbank.ir', 'tejarat.ir',
  'sb24.com', 'samanbank.ir', 'bank-sina.ir', 'sinabank.ir',
  'karafarinbank.ir', 'sarmayehbank.ir', 'shahr-bank.ir',
  'ansarbank.ir', 'kosarbank.ir', 'mehreqtesad.ir',
  'blubank.ir', 'vebank.ir',
  'shaparak.ir', 'ecit.shaparak.ir', 'sep.ir', 'pep.co.ir', 'kiccc.ir',
  'zarinpal.com', 'idpay.ir', 'zibal.ir', 'nextpay.org', 'payping.ir',
  'novinpay.ir', 'payfa.com', 'vandar.io', 'pay.ir',
  'paypal.com', 'stripe.com', 'checkout.com', 'adyen.com', 'wise.com',
  'visa.com', 'mastercard.com',
  'nobitex.ir', 'wallex.ir', 'bitpin.ir', 'ramzinex.ir', 'tabdeal.org',
  'binance.com', 'kucoin.com', 'okx.com', 'bybit.com', 'coinbase.com',

  // محتوای جنسی (بدون هیچ اثری، حتی دامنه)
  'pornhub.com', 'xvideos.com', 'xhamster.com', 'redtube.com', 'youporn.com',
  'onlyfans.com', 'xnxx.com', 'spankbang.com', 'chaturbate.com', 'bongacams.com',
  'stripchat.com', 'myfreecams.com', 'cam4.com',
  'porn.com', 'hqporner.com', 'nhentai.net',

  // سرویس ایمیل
  'gmail.com', 'mail.google.com', 'outlook.com', 'hotmail.com',
  'yahoo.com', 'mail.yahoo.com', 'proton.me', 'protonmail.com',
  'zoho.com', 'yandex.com', 'mail.ru', 'gmx.com', 'icloud.com',
  'sina.ir', 'chmail.ir', 'mailfa.ir',

  // هویت / ورود یکپارچه
  'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com',
  'login.live.com', 'auth0.com', 'okta.com',
  'my.gov.ir', 'my.skp.ir',
]);

// ---------------------------------------------------------------------------
// 2) قوانین دامنه‌ای مبتنی بر الگو (روی hostname کامل تست می‌شوند)
// ---------------------------------------------------------------------------
export const SENSITIVE_DOMAIN_RULES = [
  { cat: 'messenger', re: /(^|\.)(telegram|whatsapp|eitaa|bale|igap|threema)\b/i },
  { cat: 'messenger', re: /(^|\.)(gap|chat)\.(im|ir)$/i },
  { cat: 'banking', re: /(^|\.)(bank|banki|blubank|vebank)/i },
  { cat: 'banking', re: /bank(mellat|melli|sepah|maskan|pasargad|tejarat|saman|sina|refah|karafarin|sarmayeh|shahr|ansar|kosar|mehr|eqtesad)/i },
  { cat: 'banking', re: /(^|\.)(shaparak|zarinpal|idpay|zibal|nextpay|payping|novinpay|vandar|ipay)\b/i },
  { cat: 'banking', re: /(^|\.)(paypal|stripe|adyen|checkout|braintree|mastercard|wise|revolut|skrill|neteller)\b/i },
  { cat: 'banking', re: /(^|\.)(nobitex|wallex|bitpin|ramzinex|tabdeal|binance|kucoin|okx|bybit|coinbase)\b/i },
  { cat: 'adult', re: /porn|xxx|hentai|xnxx|xhamster|redtube|youporn|onlyfans|spankbang|chaturbate|bongacams|stripchat|escort|nsfw/i },
  { cat: 'adult', re: /(^|\.)(sex|sexy|adult)\b|(^|\.)(sex|adult)\./i },
  { cat: 'email', re: /(^|\.)(gmail|outlook|hotmail|protonmail|proton|gmx|icloud|chmail|mailfa)\b/i },
  { cat: 'email', re: /(^|\.)(mail|webmail|smtp|imap)\./i },
  { cat: 'identity', re: /^(auth|sso|oauth|login|signin|accounts|id)\./i },
  { cat: 'identity', re: /(^|\.)(accounts\.google|appleid|login\.microsoftonline|okta|auth0)\b/i },
];

// ---------------------------------------------------------------------------
// 3) الگوهای «نام کوکی حساس» — اگر نام کوکی با این‌ها بخواند حذف می‌شود
// ---------------------------------------------------------------------------
export const SENSITIVE_COOKIE_NAME_RE = new RegExp(
  [
    'sess', 'session', '_sid', 'sid$', '^sid', 'token', 'auth', 'jwt', 'oauth',
    'csrf', 'xsrf', 'passport', 'login', 'signin', 'credential', 'secret',
    'api[-_]?key', 'apikey', 'passw', 'passwd', 'pwd', 'otp', '2fa', 'totp',
    'card', 'cvv', 'cvc', '^pan', 'pan$', 'iban', 'shaba', 'account',
    'national', 'codemelli', 'melli', 'ssn', 'wallet', 'balance',
    // شناسه‌های ردیابی هویتی دستگاه
    'deviceid', 'device_id', 'fingerprint', 'fp_', 'uuid', 'guid', 'uid$',
    '^uid', 'clientid', 'client_id', 'cid$', '^cid', 'visitor', 'user[_-]?id',
  ].join('|'),
  'i'
);

// ---------------------------------------------------------------------------
// 4) کلمات مستهجن / نامناسب — جستجوهای شامل این‌ها به‌کلی حذف می‌شوند
//    (ریشه‌ها؛ تطبیق فارسی به‌صورت زیررشته برای ریشه‌های ≥4 حرفی و
//     تطبیق توکن‌به‌توکن برای ریشه‌های کوتاه تا از فالس‌پازیتوو جلوگیری شود)
// ---------------------------------------------------------------------------
export const PROFANITY_FA = [
  // جنسی — ریشه‌های بلند و نامتشابه (تطبیق زیررشته)
  'جنده', 'فاحشه', 'لاپاتی', 'پورنوگرافی', 'سکسی', 'سکسو',
  'حشری', 'بی‌حیا', 'بی حیا', 'شهوتباز', 'سکس با',
  // جنسی — ریشه‌های کوتاه (فقط تطبیق توکن کامل)
  'کیر', 'کص', 'کس', 'کون', 'جق', 'سکس', 'حشر', 'گایید', 'جند',
  // ناسزای قوی
  'کصشع?', 'ننتو', 'خارتو',
];

export const PROFANITY_EN = [
  'porn', 'xxx', 'hentai', 'onlyfans', 'nsfw', 'escort', 'hooker', 'blowjob',
  'handjob', 'cumshot', 'creampie', 'dildo', 'bdsm', 'fetish', 'nude', 'nudes',
  'sex', 'sexy', 'erotic', 'pornhub', 'xvideos', 'xhamster', 'redtube',
];

/** الگوی لاتین با مرز کلمه؛ برای انگلیسی */
export const PROFANITY_EN_RE = new RegExp(
  `\\b(${PROFANITY_EN.map(escapeRe).join('|')})\\b`,
  'i'
);

// ---------------------------------------------------------------------------
// 5) اسکراب نهایی — الگوهای «مقدار حساس» که هرگز نباید در خروجی دیده شوند.
//    (سپر دفاعی دوم؛ چون خروجی فقط {domain, name} است، در عمل هرگز فعال
//     نمی‌شود — اما اگر شد، یعنی فیلتر بالادستی جا خورده و رکورد حذف می‌گردد.)
// ---------------------------------------------------------------------------
export const VALUE_LEAK_RE = new RegExp(
  [
    'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}', // JWT
    '\\bIR\\d{24}\\b', // شبا
    '\\b\\d{16}\\b', // کارت ۱۶ رقمی
    '\\b\\d{4}[- ]\\d{4}[- ]\\d{4}[- ]\\d{4}\\b',
    '[A-Za-z0-9+/=_-]{40,}', // توکن‌های Base64 مانند
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', // ایمیل
  ].join('|')
);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * تشخیص حساسیت دامنه.
 * @param {string} hostname — lowercase، بدون www.
 * @returns {{blocked: boolean, category?: string}}
 */
export function classifyDomainSensitivity(hostname) {
  if (!hostname) return { blocked: true, category: 'invalid' };
  const host = String(hostname).toLowerCase().replace(/^www\./, '');
  if (SENSITIVE_EXACT_DOMAINS.has(host)) {
    return { blocked: true, category: exactCategory(host) };
  }
  // تطبیق suffix: هر زیردامنه‌ای از یک دامنه حساس هم حساس است
  for (const d of SENSITIVE_EXACT_DOMAINS) {
    if (host.endsWith('.' + d)) {
      return { blocked: true, category: exactCategory(d) };
    }
  }
  for (const rule of SENSITIVE_DOMAIN_RULES) {
    if (rule.re.test(host)) return { blocked: true, category: rule.cat };
  }
  return { blocked: false };
}

function exactCategory(domain) {
  if (/(telegram|whatsapp|eitaa|bale|igap|slog|discord|imo|viber|line|wechat|qq|skype|messenger|m\.me|threema|wire|t\.me|gap)/.test(domain)) return 'messenger';
  if (/(porn|xvideos|xhamster|redtube|youporn|onlyfans|xnxx|spankbang|chaturbate|bongacams|stripchat|nhentai|cam4)/.test(domain)) return 'adult';
  if (/(gmail|outlook|hotmail|proton|zoho|yandex|gmx|icloud|sina\.ir|chmail|mailfa|mail\.yahoo|mail\.ru|live\.com)/.test(domain)) return 'email';
  if (/(accounts\.google|appleid|microsoftonline|auth0|okta|my\.gov|my\.skp|signin)/.test(domain)) return 'identity';
  return 'banking';
}

/**
 * بررسی مستهجن بودن عبارت جستجو.
 * @param {string} termNormalized — عبارت نرمال‌شده
 * @returns {boolean} true یعنی باید حذف شود
 */
export function isProfane(termNormalized) {
  const t = String(termNormalized || '').toLowerCase();
  if (!t) return false;
  if (PROFANITY_EN_RE.test(t)) return true;
  const tokens = t.split(/[\s\u200c.,،؛;:!؟?()"'\-_/\\]+/).filter(Boolean);
  for (const root of PROFANITY_FA) {
    if (!root) continue;
    if (root.length >= 4) {
      if (t.includes(root)) return true;
    } else {
      for (const tok of tokens) {
        if (tok === root) return true; // فقط تطبیق دقیق توکن برای ریشه‌های کوتاه
      }
    }
  }
  return false;
}
