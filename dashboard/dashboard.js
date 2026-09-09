// ============================================================================
// dashboard.js — داشبورد تحلیل پروفایل مرور (خودکفا، بدون وابستگی خارجی)
// ----------------------------------------------------------------------------
// معماری:
//   • Store: localStorage (+ قفل اختیاری AES-256-GCM روی کل بانک پروفایل‌ها)
//   • Import: فایل‌های خروجی افزونه (snapshot v2) یا بسته داشبورد
//   • تحلیل محلی: دسته‌بندی دامنه‌ها + موتور علاقه‌مندی (صفر توکن)
//   • تحلیل AI: AvalAI (/v1/chat/completions) با خروجی JSON ساختاریافته
//   • خروجی: JSON، ZIP (نوشته‌شده از صفر)، ارسال به ربات تلگرام
// ============================================================================

(() => {
'use strict';

// ═══════════════════════ ابزارهای پایه ═══════════════════════
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg, kind = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

const faDate = (ts) => {
  try { return new Date(ts).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return '—'; }
};
const faDateTime = (ts) => {
  try { return new Date(ts).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return '—'; }
};
const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function initials(text) {
  const t = String(text || '؟').trim();
  const words = t.split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

// ═══════════════════════ طبقه‌بندی دامنه‌ها ═══════════════════════
const TAX = {
  exact: {
    'digikala.com': 'shopping', 'torob.com': 'shopping', 'emalls.ir': 'shopping',
    'technolife.ir': 'shopping', 'mobit.ir': 'shopping', 'modiseh.ir': 'shopping',
    'basalam.com': 'shopping', 'okala.com': 'shopping', 'snappmarket.ir': 'shopping',
    'divar.ir': 'classifieds', 'sheypoor.com': 'classifieds',
    'amazon.com': 'shopping', 'aliexpress.com': 'shopping', 'ebay.com': 'shopping', 'etsy.com': 'shopping',
    'filimo.com': 'entertainment', 'namava.ir': 'entertainment', 'telewebion.com': 'entertainment',
    'netflix.com': 'entertainment', 'aparat.com': 'video', 'youtube.com': 'video', 'twitch.tv': 'video',
    'radiojavan.com': 'music', 'navahang.com': 'music', 'spotify.com': 'music', 'soundcloud.com': 'music',
    'steampowered.com': 'gaming', 'steamcommunity.com': 'gaming',
    'chatgpt.com': 'ai', 'openai.com': 'ai', 'claude.ai': 'ai', 'anthropic.com': 'ai',
    'avalai.ir': 'ai', 'huggingface.co': 'ai', 'kaggle.com': 'ai', 'perplexity.ai': 'ai',
    'google.com': 'search', 'bing.com': 'search', 'duckduckgo.com': 'search', 'parsijoo.ir': 'search',
    'instagram.com': 'social', 'twitter.com': 'social', 'x.com': 'social', 'facebook.com': 'social',
    'linkedin.com': 'social', 'reddit.com': 'social', 'pinterest.com': 'social', 'quora.com': 'social',
    'zoomit.ir': 'tech-news', 'digiato.com': 'tech-news', 'isna.ir': 'news', 'irna.ir': 'news',
    'khabaronline.ir': 'news', 'tabnak.ir': 'news', 'bbc.com': 'news', 'cnn.com': 'news',
    'varzesh3.com': 'sports', '90tv.ir': 'sports',
    'github.com': 'dev', 'gitlab.com': 'dev', 'stackoverflow.com': 'dev',
    'wikipedia.org': 'reference', 'medium.com': 'reference',
    'maktabkhooneh.org': 'education', 'quera.org': 'education', 'faradars.org': 'education',
    'khanacademy.org': 'education', 'coursera.org': 'education', 'udemy.com': 'education',
    'alibaba.ir': 'travel', 'snapptrip.com': 'travel', 'flightio.com': 'travel',
    'snapp.ir': 'transport', 'tapsi.ir': 'transport',
    'snappfood.ir': 'food', 'delino.com': 'food',
    'jobinja.ir': 'jobs', 'jobvision.ir': 'jobs', 'iranjobs.ir': 'jobs',
  },
  keywords: [
    { cat: 'shopping', re: /(shop|store|bazar|market|kharid)/ },
    { cat: 'news', re: /(news|khabar|akhbar|press)/ },
    { cat: 'education', re: /(learn|academy|course|amoozesh|school)/ },
    { cat: 'travel', re: /(travel|hotel|flight|ticket|tour)/ },
    { cat: 'ai', re: /(ai|gpt|llm|chatbot)/ },
  ],
  labels: {
    shopping: 'فروشگاهی', classifieds: 'نیازمندی‌ها', entertainment: 'فیلم و سریال',
    video: 'ویدیو', music: 'موسیقی', gaming: 'بازی', ai: 'هوش مصنوعی',
    search: 'موتور جستجو', social: 'شبکه اجتماعی', 'tech-news': 'تکنولوژی',
    news: 'خبری', sports: 'ورزشی', dev: 'برنامه‌نویسی', reference: 'مرجع / دانشنامه',
    education: 'آموزشی', travel: 'سفر', transport: 'حمل‌ونقل', food: 'غذا و رستوران',
    jobs: 'کاریابی', other: 'سایر',
  },
  icons: {
    shopping: '🛒', classifieds: '🏷️', entertainment: '🎬', video: '▶️', music: '🎵',
    gaming: '🎮', ai: '🤖', search: '🔍', social: '💬', 'tech-news': '💻',
    news: '📰', sports: '⚽', dev: '👨‍💻', reference: '📚', education: '🎓',
    travel: '✈️', transport: '🚕', food: '🍔', jobs: '💼', other: '🌐',
  },
};

const cleanDomain = (h) => String(h || '').toLowerCase().trim().replace(/^www\./, '').replace(/\.$/, '');

function categorizeDomain(hostname) {
  const d = cleanDomain(hostname);
  for (const [dom, cat] of Object.entries(TAX.exact)) {
    if (d === dom || d.endsWith('.' + dom)) return cat;
  }
  for (const k of TAX.keywords) if (k.re.test(d)) return k.cat;
  if (d.endsWith('.ac.ir') || d.endsWith('.edu')) return 'education';
  if (d.endsWith('.gov.ir') || d.endsWith('.gov')) return 'gov';
  return 'other';
}
TAX.labels.gov = 'دولتی / سازمانی';
TAX.icons.gov = '🏛️';

function categoryStatsOf(domains) {
  const map = new Map();
  for (const d of domains || []) {
    const cat = categorizeDomain(d.domain);
    const cur = map.get(cat) || { category: cat, visits: 0, domains: 0 };
    cur.visits += d.visits;
    cur.domains += 1;
    map.set(cat, cur);
  }
  return [...map.values()].sort((a, b) => b.visits - a.visits);
}

// ═══════════════════════ موتور علاقه‌مندی (محلی، صفر توکن) ═══════════════════════
function computeInterests(profile) {
  const sections = [];
  const domains = profile.domains || [];
  const searches = profile.searches || [];
  const totalVisits = domains.reduce((s, d) => s + d.visits, 0) || 1;

  // ۱) پرتکرارترین جستجوها
  if (searches.length) {
    sections.push({
      icon: '🔎', title: 'پرتکرارترین جستجوها', score: 'بیشترین دفعات تکرار',
      items: searches.slice(0, 8).map((s) => ({
        label: s.term, badge: `${faNum(s.count)} بار`,
        weight: s.count / (searches[0].count || 1),
      })),
    });
  }

  // ۲) پربازدیدترین سایت‌ها
  if (domains.length) {
    sections.push({
      icon: '🌐', title: 'پربازدیدترین سایت‌ها', score: 'بیشترین تعداد بازدید',
      items: domains.slice(0, 8).map((d) => ({
        label: d.domain, badge: `${faNum(d.visits)} بازدید`, ltr: true,
        weight: d.visits / (domains[0].visits || 1),
      })),
    });
  }

  // ۳) دسته‌های موردعلاقه (بر اساس بازدید تجمعی)
  const cats = categoryStatsOf(domains).filter((c) => c.category !== 'search');
  if (cats.length) {
    sections.push({
      icon: '❤️', title: 'دسته‌های موردعلاقه', score: 'بر اساس بازدید تجمعی',
      items: cats.slice(0, 8).map((c) => ({
        label: `${TAX.icons[c.category] || '🌐'} ${TAX.labels[c.category] || c.category}`,
        badge: `${Math.round((c.visits / totalVisits) * 100)}٪ از بازدیدها`,
        weight: c.visits / (cats[0].visits || 1),
      })),
    });
  }

  // ۴) وفاداری به فروشگاه
  const shopping = domains.filter((d) => categorizeDomain(d.domain) === 'shopping')
    .sort((a, b) => b.visits - a.visits);
  if (shopping.length) {
    const top = shopping[0];
    const share = Math.round((top.visits / totalVisits) * 100);
    sections.push({
      icon: '🛒', title: 'الگوی خرید', score: share >= 40 ? 'وفاداری بالا به یک فروشگاه' : 'تنوع در فروشگاه‌ها',
      items: shopping.slice(0, 5).map((d) => ({
        label: d.domain, badge: `${faNum(d.visits)} بازدید`, ltr: true,
        weight: d.visits / (shopping[0].visits || 1),
      })),
    });
  }

  // ۵) تازگی فعالیت (recency از هیستوگرام)
  const hist = new Array(7).fill(0);
  for (const d of domains) for (let i = 0; i < 7; i++) hist[i] += d.histogram?.[i] || 0;
  const histTotal = hist.reduce((a, b) => a + b, 0) || 1;
  const recentShare = Math.round(((hist[0] + hist[1] + hist[2]) / histTotal) * 100);
  sections.push({
    icon: '⏱️', title: 'الگوی زمانی فعالیت', score: recentShare >= 50 ? 'فعالیت اخیر بالا' : (recentShare >= 25 ? 'فعالیت متوسط' : 'فعالیت پراکنده'),
    chart: { buckets: hist, caption: 'توزیع بازدیدها در بازه زمانی (قدیمی ← جدید)' },
    items: [],
  });

  // ۶) دامنه کاوش
  sections.push({
    icon: '🧭', title: 'دامنه کاوش', score: domains.length >= 60 ? 'کنجکاوی بالا' : (domains.length >= 20 ? 'متعادل' : 'متمرکز'),
    items: [
      { label: 'تعداد دامنه‌های یکتا', badge: faNum(domains.length), weight: 1 },
      { label: 'تعداد جستجوهای یکتا', badge: faNum(searches.length), weight: 1 },
      { label: 'میانگین بازدید هر دامنه', badge: faNum(Math.round(totalVisits / (domains.length || 1))), weight: 1 },
    ],
  });

  return sections;
}

// ═══════════════════════ رمزنگاری (AES-256-GCM + PBKDF2) ═══════════════════════
const CryptoBox = (() => {
  const ITER = 310000;
  let cachedKey = null; // فقط در حافظه صفحه
  let cachedPass = null;

  const b64 = {
    enc(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); },
    dec(str) { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; },
  };

  async function derive(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function encryptText(plaintext, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = pass ? await derive(pass, salt) : cachedKey;
    if (!key) throw new Error('قفل باز نیست.');
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    return JSON.stringify({ v: 1, k: 'pbkdf2-aesgcm', iters: ITER, salt: b64.enc(salt), iv: b64.enc(iv), ct: b64.enc(ct) });
  }

  async function decryptText(packet, pass) {
    let env;
    try { env = JSON.parse(packet); } catch { throw new Error('پاکت نامعتبر است.'); }
    const key = await derive(pass, b64.dec(env.salt));
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(env.iv) }, key, b64.dec(env.ct));
      const text = new TextDecoder().decode(pt);
      if (env.iters && pass) { cachedKey = key; cachedPass = pass; }
      return text;
    } catch {
      throw new Error('رمز قفل اشتباه است.');
    }
  }

  return {
    get unlocked() { return cachedKey !== null; },
    async setup(pass) {
      if (!pass || pass.length < 6) throw new Error('رمز قفل باید حداقل ۶ کاراکتر باشد.');
      // تست: رمزگذاری/رمزگشایی یک رکورد کوچک
      const probe = await encryptText('ok', pass);
      await decryptText(probe, pass);
      return true;
    },
    async seal(obj, pass) { return encryptText(JSON.stringify(obj), pass || cachedPass); },
    async open(packet, pass) { return JSON.parse(await decryptText(packet, pass || cachedPass)); },
    lock() { cachedKey = null; cachedPass = null; },
    get hasKeyMaterial() { return cachedPass !== null; },
    get passphrase() { return cachedPass; },
  };
})();

// ═══════════════════════ Store ═══════════════════════
const Store = {
  KEY_PROFILES: 'pp_profiles_v1',
  KEY_SEALED: 'pp_profiles_sealed',
  KEY_SETTINGS: 'pp_settings_v1',
  KEY_SEALED_SECRETS: 'pp_sealed_secrets',

  settings: { model: 'qwen3.8-flash', aiKeyMask: null, tgConfigured: false, lockEnabled: false },
  profiles: [],
  secrets: { aiKey: '', tgToken: '', tgChatId: '' }, // فقط در حافظه پس از بازگشایی

  async load() {
    // تنظیمات
    try { this.settings = { ...this.settings, ...JSON.parse(localStorage.getItem(this.KEY_SETTINGS) || '{}') }; } catch { /* noop */ }

    // پروفایل‌ها (رمزنگاری‌شده یا ساده)
    const sealed = localStorage.getItem(this.KEY_SEALED);
    if (sealed) {
      this.settings.lockEnabled = true;
      this.profiles = null; // نیازمند بازگشایی
    } else {
      try { this.profiles = JSON.parse(localStorage.getItem(this.KEY_PROFILES) || '[]'); } catch { this.profiles = []; }
    }

    // رازهای رمزنگاری‌شده (اگر قفل باز است)
    const sealedSecrets = localStorage.getItem(this.KEY_SEALED_SECRETS);
    if (sealedSecrets && CryptoBox.unlocked) {
      try { this.secrets = { ...this.secrets, ...(await CryptoBox.open(sealedSecrets)) }; } catch { /* noop */ }
    }
  },

  async persistProfiles() {
    if (this.settings.lockEnabled) {
      if (!CryptoBox.unlocked) throw new Error('قفل باز نیست.');
      const pass = CryptoBox.passphrase || prompt('رمز قفل داشبورد:');
      localStorage.setItem(this.KEY_SEALED, await CryptoBox.seal(this.profiles, pass));
    } else {
      localStorage.setItem(this.KEY_PROFILES, JSON.stringify(this.profiles));
    }
  },

  persistSettings() {
    localStorage.setItem(this.KEY_SETTINGS, JSON.stringify(this.settings));
  },

  async persistSecrets() {
    if (this.settings.lockEnabled && CryptoBox.unlocked) {
      localStorage.setItem(this.KEY_SEALED_SECRETS, await CryptoBox.seal(this.secrets));
    } else {
      // بدون قفل: نگه‌داری در حافظه صفحه فقط (توصیه: قفل را فعال کنید)
      localStorage.removeItem(this.KEY_SEALED_SECRETS);
    }
  },

  nextUid() {
    let max = 0;
    for (const p of this.profiles) {
      const m = /^U-(\d+)$/.exec(p.uid || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `U-${String(max + 1).padStart(4, '0')}`;
  },

  addProfile(snapshot, sourceFile) {
    const p = {
      uid: this.nextUid(),
      name: `کاربر ${faNumDigitSafe(this.profiles.length + 1)}`,
      deviceLabel: snapshot.deviceLabel || 'بدون برچسب',
      createdAt: snapshot.createdAt || new Date().toISOString(),
      importedAt: Date.now(),
      rangeDays: snapshot.rangeDays || 30,
      stats: snapshot.stats,
      domains: snapshot.domains || [],
      searches: snapshot.searches || [],
      cookies: snapshot.cookies || [],
      analysis: null,
      sourceFile: sourceFile || '—',
    };
    this.profiles.unshift(p);
    return p;
  },

  remove(uid) {
    this.profiles = this.profiles.filter((p) => p.uid !== uid);
  },
};

function faNumDigitSafe(n) { return String(n); }

// اعتبارسنجی/نرمال‌سازی اسنپ‌شات ورودی
function normalizeImported(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('محتوا JSON معتبر نیست.');
  // بسته داشبورد
  if (Array.isArray(obj.profiles)) {
    return { bundle: true, profiles: obj.profiles };
  }
  if (obj.exportType !== 'sanitized-browsing-profile' && obj.schemaVersion !== 2) {
    throw new Error('این فایل خروجی پاکسازی‌شده افزونه نیست (schema v2 انتظار می‌رود).');
  }
  return {
    bundle: false,
    snapshot: {
      deviceLabel: String(obj.deviceLabel || 'بدون برچسب').slice(0, 60),
      createdAt: obj.createdAt || new Date().toISOString(),
      rangeDays: Number(obj.rangeDays) || 30,
      stats: obj.stats || {
        domains: (obj.domains || []).length,
        searches: (obj.searches || []).length,
        cookies: (obj.cookies || []).length,
        totalVisits: (obj.domains || []).reduce((s, d) => s + (d.visits || 0), 0),
      },
      domains: (obj.domains || []).map((d) => ({
        domain: cleanDomain(d.domain), visits: Math.max(0, Number(d.visits) || 0),
        lastVisit: Number(d.lastVisit) || 0,
        histogram: Array.isArray(d.histogram) && d.histogram.length === 7 ? d.histogram.map(Number) : [0, 0, 0, 0, 0, 0, 0],
      })).filter((d) => d.domain),
      searches: (obj.searches || []).map((s) => ({
        term: String(s.term || '').slice(0, 120), count: Math.max(1, Number(s.count) || 1),
        lastSeen: Number(s.lastSeen) || 0, engine: String(s.engine || '').slice(0, 40),
      })).filter((s) => s.term),
      cookies: (obj.cookies || []).map((c) => ({ domain: cleanDomain(c.domain), name: String(c.name || '').slice(0, 80) })).filter((c) => c.domain),
    },
  };
}

// ═══════════════════════ رندر: لیست پروفایل‌ها ═══════════════════════
let currentView = 'list';
let currentProfile = null;
let drillState = null;

function renderTopbarStats() {
  const el = $('topbar-stats');
  if (Store.profiles === null) { el.hidden = true; return; }
  el.hidden = Store.profiles.length === 0;
  $('ts-profiles').textContent = faNum(Store.profiles.length);
  $('ts-domains').textContent = faNum(Store.profiles.reduce((s, p) => s + (p.stats?.domains || 0), 0));
  $('ts-searches').textContent = faNum(Store.profiles.reduce((s, p) => s + (p.stats?.searches || 0), 0));
}

function renderList() {
  currentView = 'list';
  currentProfile = null;
  $('view-list').hidden = false;
  $('view-profile').hidden = true;
  renderTopbarStats();

  const grid = $('profiles-grid');
  const empty = $('empty-state');
  grid.textContent = '';

  const profiles = Store.profiles || [];
  if (profiles.length === 0) { empty.hidden = false; return; }
  empty.hidden = true;

  const q = ($('profile-search').value || '').toLowerCase().trim();
  const sort = $('sort-select').value;
  let list = profiles.filter((p) =>
    !q || p.name.toLowerCase().includes(q) || p.uid.toLowerCase().includes(q) || (p.deviceLabel || '').toLowerCase().includes(q));
  list = [...list].sort((a, b) => {
    if (sort === 'oldest') return a.importedAt - b.importedAt;
    if (sort === 'name') return a.name.localeCompare(b.name, 'fa');
    if (sort === 'data') return (b.stats?.totalVisits || 0) - (a.stats?.totalVisits || 0);
    return b.importedAt - a.importedAt;
  });

  for (const p of list) {
    const card = document.createElement('article');
    card.className = 'profile-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `پروفایل ${p.name}`);

    const head = document.createElement('div');
    head.className = 'pc-head';
    const av = document.createElement('div');
    av.className = 'avatar';
    av.textContent = initials(p.name);
    const nameWrap = document.createElement('div');
    nameWrap.style.minWidth = '0';
    const nm = document.createElement('div');
    nm.className = 'pc-name';
    nm.textContent = p.name;
    const idd = document.createElement('span');
    idd.className = 'pc-id';
    idd.textContent = p.uid;
    nameWrap.append(nm, idd);
    head.append(av, nameWrap);

    const stats = document.createElement('div');
    stats.className = 'pc-stats';
    for (const [v, l] of [
      [faNum(p.stats?.domains || 0), 'دامنه'],
      [faNum(p.stats?.searches || 0), 'جستجو'],
      [faNum(p.stats?.totalVisits || 0), 'بازدید'],
    ]) {
      const s = document.createElement('div');
      s.className = 'pc-stat';
      const b = document.createElement('b');
      b.textContent = v;
      const sp = document.createElement('span');
      sp.textContent = l;
      s.append(b, sp);
      stats.appendChild(s);
    }

    const foot = document.createElement('div');
    foot.className = 'pc-foot';
    const date = document.createElement('span');
    date.className = 'pc-date';
    date.textContent = `📥 ${faDate(p.importedAt)}`;
    const badge = document.createElement('span');
    badge.className = p.analysis ? 'pc-badge-analyzed' : 'pc-badge-new';
    badge.textContent = p.analysis ? '✓ تحلیل‌شده' : 'تحلیل نشده';
    foot.append(date, badge);

    card.append(head, stats, foot);
    card.addEventListener('click', () => openProfile(p.uid));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfile(p.uid); } });
    grid.appendChild(card);
  }
}

// ═══════════════════════ رندر: نمای پروفایل ═══════════════════════
function openProfile(uid) {
  const p = (Store.profiles || []).find((x) => x.uid === uid);
  if (!p) return toast('پروفایل یافت نشد.', 'err');
  currentProfile = p;
  currentView = 'profile';
  $('view-list').hidden = true;
  $('view-profile').hidden = false;
  renderProfile(p);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderProfile(p) {
  // هدر
  $('p-avatar').textContent = initials(p.name);
  const nameEl = $('p-name');
  nameEl.textContent = p.name;
  $('p-uid').textContent = p.uid;
  $('p-meta').textContent =
    `دستگاه: «${p.deviceLabel}» • بازه تحلیل: ${faNum(p.rangeDays)} روز • وارد شده در ${faDateTime(p.importedAt)}`;

  const badges = $('p-badges');
  badges.textContent = '';
  const topCats = categoryStatsOf(p.domains).slice(0, 4);
  for (const c of topCats) {
    const b = document.createElement('span');
    b.className = 'ph-badge cat';
    b.textContent = `${TAX.icons[c.category] || '🌐'} ${TAX.labels[c.category] || c.category}`;
    badges.appendChild(b);
  }
  const srcB = document.createElement('span');
  srcB.className = 'ph-badge';
  srcB.textContent = `فایل: ${p.sourceFile}`;
  badges.appendChild(srcB);

  // KPI
  const kpi = $('kpi-row');
  kpi.textContent = '';
  const hist = new Array(7).fill(0);
  for (const d of p.domains) for (let i = 0; i < 7; i++) hist[i] += d.histogram?.[i] || 0;
  const histTotal = hist.reduce((a, b) => a + b, 0);
  const recent = histTotal ? Math.round(((hist[4] + hist[5] + hist[6]) / histTotal) * 100) : 0;

  const kpis = [
    [faNum(p.stats?.totalVisits || 0), 'کل بازدیدهای ثبت‌شده', null],
    [faNum(p.stats?.domains || 0), 'دامنه‌های یکتا', null],
    [faNum(p.stats?.searches || 0), 'جستجوهای یکتا', null],
    [faNum(p.stats?.cookies || 0), 'کوکی امن (بدون مقدار)', null],
    [`٪${faNum(recent)}`, 'فعالیت نیمه اخیر', hist],
  ];
  for (const [v, l, chart] of kpis) {
    const k = document.createElement('div');
    k.className = 'kpi';
    const b = document.createElement('b');
    b.textContent = v;
    const s = document.createElement('span');
    s.textContent = l;
    k.append(b, s);
    if (chart) {
      const wrap = document.createElement('div');
      wrap.className = 'kpi-trend';
      wrap.style.display = 'flex';
      wrap.style.gap = '3px';
      wrap.style.alignItems = 'flex-end';
      wrap.style.height = '26px';
      wrap.style.marginTop = '6px';
      const max = Math.max(...chart, 1);
      for (const v2 of chart) {
        const bar = document.createElement('div');
        bar.style.cssText = `flex:1;background:linear-gradient(180deg,var(--brand),var(--brand-2));border-radius:3px 3px 0 0;min-height:2px;height:${Math.max(6, (v2 / max) * 100)}%;opacity:.85;`;
        wrap.appendChild(bar);
      }
      k.appendChild(wrap);
    }
    kpi.appendChild(k);
  }

  // جعبه‌های بینش
  $('ib-domains-sub').textContent = `${faNum(p.stats?.domains || 0)} دامنه در ${faNum(categoryStatsOf(p.domains).length)} دسته`;
  $('ib-searches-sub').textContent = p.searches.length
    ? `پرتکرارترین: «${p.searches[0].term}» (${faNum(p.searches[0].count)} بار)`
    : 'جستجویی ثبت نشده';
  const interests = computeInterests(p);
  $('ib-interests-sub').textContent = `${faNum(interests.length)} معیار تحلیل‌شده محلی`;
  $('ib-ai-sub').textContent = p.analysis
    ? `${p.analysis.profileTitle || 'تحلیل‌شده'} • ${faDateTime(p.analysis.analyzedAt)}`
    : 'هنوز تحلیل نشده — با یک کلیک تولید کنید';

  // پنل AI
  if (p.analysis) {
    renderAnalysisPanel(p);
  } else {
    $('ai-panel').hidden = true;
  }
}

// ─────────────────── مودال تفصیلی (drill-down) ───────────────────
function openDrill(mode) {
  const p = currentProfile;
  if (!p) return;
  drillState = { mode, cat: 'all', q: '', limit: 60, p };
  const modal = $('modal-drill');
  const toolbar = $('drill-toolbar');
  const foot = $('drill-foot');

  if (mode === 'domains') {
    $('drill-title').textContent = `🌐 سایت‌های بازدیدشده — ${p.name}`;
    toolbar.hidden = false;
    foot.hidden = false;
    renderCatChips();
    renderDrillList();
  } else if (mode === 'searches') {
    $('drill-title').textContent = `🔎 جستجوها — ${p.name}`;
    toolbar.hidden = false;
    foot.hidden = false;
    renderSearchChips();
    renderDrillList();
  } else if (mode === 'interests') {
    $('drill-title').textContent = `❤️ علاقه‌مندی‌ها — ${p.name}`;
    toolbar.hidden = true;
    foot.hidden = true;
    renderInterestsBody();
  } else if (mode === 'ai') {
    $('drill-title').textContent = `✨ تحلیل هوش مصنوعی — ${p.name}`;
    toolbar.hidden = true;
    foot.hidden = true;
    renderAiBody();
  }
  modal.hidden = false;
}

function renderCatChips() {
  const { p } = drillState;
  const chips = $('cat-chips');
  chips.textContent = '';
  const stats = categoryStatsOf(p.domains);
  const all = document.createElement('button');
  all.className = `cat-chip ${drillState.cat === 'all' ? 'active' : ''}`;
  all.innerHTML = `همه <span class="cnt">(${faNum(p.domains.length)})</span>`;
  all.addEventListener('click', () => { drillState.cat = 'all'; renderCatChips(); renderDrillList(); });
  chips.appendChild(all);
  for (const c of stats) {
    const b = document.createElement('button');
    b.className = `cat-chip ${drillState.cat === c.category ? 'active' : ''}`;
    b.innerHTML = `${TAX.icons[c.category] || '🌐'} ${esc(TAX.labels[c.category] || c.category)} <span class="cnt">(${faNum(c.domains)})</span>`;
    b.addEventListener('click', () => { drillState.cat = c.category; renderCatChips(); renderDrillList(); });
    chips.appendChild(b);
  }
}

function renderSearchChips() {
  const { p } = drillState;
  const chips = $('cat-chips');
  chips.textContent = '';
  // دسته‌بندی جستجوها بر اساس تداخل با دسته‌های دامنه‌ها (تطبیق نام دامنه در عبارت)
  const cats = categoryStatsOf(p.domains).filter((c) => c.category !== 'search' && c.category !== 'other').slice(0, 8);
  const all = document.createElement('button');
  all.className = `cat-chip ${drillState.cat === 'all' ? 'active' : ''}`;
  all.innerHTML = `همه <span class="cnt">(${faNum(p.searches.length)})</span>`;
  all.addEventListener('click', () => { drillState.cat = 'all'; renderSearchChips(); renderDrillList(); });
  chips.appendChild(all);
  for (const c of cats) {
    const b = document.createElement('button');
    b.className = `cat-chip ${drillState.cat === c.category ? 'active' : ''}`;
    b.innerHTML = `${TAX.icons[c.category] || '🌐'} ${esc(TAX.labels[c.category] || c.category)}`;
    b.addEventListener('click', () => { drillState.cat = c.category; renderSearchChips(); renderDrillList(); });
    chips.appendChild(b);
  }
}

/** تطبیق جستجو با دسته: اگر کلمه کلیدی دسته در عبارت بود یا دامنه‌ای از آن دسته در عبارت بود */
function searchMatchesCategory(term, cat, p) {
  const t = term.toLowerCase();
  const sampleDomains = p.domains.filter((d) => categorizeDomain(d.domain) === cat).slice(0, 30).map((d) => d.domain);
  for (const dom of sampleDomains) {
    const base = dom.split('.')[0];
    if (base.length >= 3 && t.includes(base)) return true;
  }
  const kw = TAX.keywords.find((k) => k.cat === cat);
  if (kw) {
    for (const w of kw.re.source.split('|')) {
      const word = w.replace(/[()^]/g, '');
      if (word.length >= 3 && t.includes(word)) return true;
    }
  }
  return false;
}

function renderDrillList() {
  const { mode, p, cat, q } = drillState;
  const body = $('drill-body');
  body.textContent = '';
  const list = document.createElement('div');
  list.className = 'drill-list';

  let items = [];
  if (mode === 'domains') {
    items = p.domains
      .filter((d) => (cat === 'all' || categorizeDomain(d.domain) === cat))
      .filter((d) => !q || d.domain.includes(q.toLowerCase()))
      .sort((a, b) => b.visits - a.visits);
  } else {
    items = p.searches
      .filter((s) => (cat === 'all' || searchMatchesCategory(s.term, cat, p)))
      .filter((s) => !q || s.term.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.count - a.count);
  }

  const max = Math.max(...items.map((i) => (mode === 'domains' ? i.visits : i.count)), 1);
  const shown = items.slice(0, drillState.limit);

  if (shown.length === 0) {
    const em = document.createElement('p');
    em.className = 'hint';
    em.style.textAlign = 'center';
    em.style.padding = '30px 0';
    em.textContent = 'موردی مطابق فیلتر پیدا نشد.';
    body.appendChild(em);
    $('drill-more').hidden = items.length <= drillState.limit;
    return;
  }

  shown.forEach((item, idx) => {
    const isDomain = mode === 'domains';
    const row = document.createElement('div');
    row.className = 'drill-row';

    const rank = document.createElement('div');
    rank.className = 'dr-rank';
    rank.textContent = faNum(idx + 1);

    const main = document.createElement('div');
    main.className = 'dr-main';
    const title = document.createElement('div');
    title.className = `dr-title ${!isDomain ? 'fa' : ''}`;
    title.textContent = isDomain ? item.domain : item.term;
    const sub = document.createElement('div');
    sub.className = 'dr-sub';
    if (isDomain) {
      const c = categorizeDomain(item.domain);
      sub.textContent = `${TAX.icons[c] || '🌐'} ${TAX.labels[c] || c} • آخرین بازدید: ${item.lastVisit ? faDate(item.lastVisit) : '—'}`;
    } else {
      sub.textContent = `موتور: ${item.engine || '—'} • آخرین: ${item.lastSeen ? faDate(item.lastSeen) : '—'}`;
    }
    main.append(title, sub);

    const barWrap = document.createElement('div');
    barWrap.className = 'dr-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'dr-bar';
    const val = isDomain ? item.visits : item.count;
    requestAnimationFrame(() => { bar.style.width = `${Math.max(4, (val / max) * 100)}%`; });
    barWrap.appendChild(bar);

    const count = document.createElement('div');
    count.className = 'dr-count';
    count.textContent = isDomain ? `${faNum(item.visits)} بازدید` : `${faNum(item.count)} بار`;

    row.append(rank, main, barWrap, count);
    if (isDomain) {
      const cb = document.createElement('span');
      cb.className = 'dr-cat';
      const c = categorizeDomain(item.domain);
      cb.textContent = TAX.labels[c] || c;
      row.appendChild(cb);
    }
    list.appendChild(row);
  });

  body.appendChild(list);
  $('drill-more').hidden = items.length <= drillState.limit;
  $('drill-more').textContent = `نمایش بیشتر (${faNum(items.length - shown.length)} مورد باقی‌مانده)`;
}

function renderInterestsBody() {
  const { p } = drillState;
  const body = $('drill-body');
  body.textContent = '';
  const sections = computeInterests(p);
  for (const sec of sections) {
    const wrap = document.createElement('div');
    wrap.className = 'interest-section';
    const head = document.createElement('div');
    head.className = 'is-head';
    const icon = document.createElement('span');
    icon.className = 'is-icon';
    icon.textContent = sec.icon;
    const h = document.createElement('h4');
    h.textContent = sec.title;
    const score = document.createElement('span');
    score.className = 'is-score';
    score.textContent = sec.score;
    head.append(icon, h, score);
    wrap.appendChild(head);

    if (sec.chart) {
      const chart = document.createElement('div');
      chart.style.cssText = 'display:flex;gap:4px;align-items:flex-end;height:70px;background:var(--surface-2);border:1px solid var(--stroke);border-radius:12px;padding:12px;';
      const max = Math.max(...sec.chart.buckets, 1);
      sec.chart.buckets.forEach((v, i) => {
        const col = document.createElement('div');
        col.style.cssText = `flex:1;height:${Math.max(4, (v / max) * 100)}%;background:linear-gradient(180deg,var(--brand),var(--brand-2));border-radius:5px 5px 0 0;opacity:${0.45 + (i / sec.chart.buckets.length) * 0.55};`;
        col.title = faNum(v);
        chart.appendChild(col);
      });
      wrap.appendChild(chart);
      const cap = document.createElement('p');
      cap.className = 'hint';
      cap.style.textAlign = 'center';
      cap.textContent = sec.chart.caption;
      wrap.appendChild(cap);
    }

    if (sec.items.length) {
      const items = document.createElement('div');
      items.className = 'interest-items';
      const maxW = Math.max(...sec.items.map((i) => i.weight || 0), 0.0001);
      for (const it of sec.items) {
        const chip = document.createElement('span');
        chip.className = 'interest-item';
        chip.style.opacity = String(0.62 + ((it.weight || 0) / maxW) * 0.38);
        const b = document.createElement('b');
        b.textContent = it.badge;
        chip.append(document.createTextNode(it.label + ' '), b);
        items.appendChild(chip);
      }
      wrap.appendChild(items);
    }
    body.appendChild(wrap);
  }
}

function renderAiBody() {
  const { p } = drillState;
  const body = $('drill-body');
  body.textContent = '';
  if (p.analysis) {
    renderAnalysisInto(body, p.analysis);
  } else {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:30px 0;display:flex;flex-direction:column;gap:14px;align-items:center;';
    const ic = document.createElement('div');
    ic.style.fontSize = '40px';
    ic.textContent = '✨';
    const msg = document.createElement('p');
    msg.style.color = 'var(--text-2)';
    msg.textContent = 'این پروفایل هنوز با هوش مصنوعی تحلیل نشده است.';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '🚀 اجرای تحلیل هوشمند';
    btn.addEventListener('click', () => { closeDrill(); runAnalysis(p); });
    empty.append(ic, msg, btn);
    body.appendChild(empty);
  }
}

function renderAnalysisInto(container, analysis) {
  container.textContent = '';
  const secs = [
    ['📌', 'عنوان پروفایل', analysis.profileTitle, 'text'],
    ['❤️', 'علاقه‌مندی‌های شناسایی‌شده', analysis.interests, 'interests'],
    ['🧠', 'تحلیل رفتاری و شخصیت', analysis.personality, 'text'],
    ['🛒', 'عادت‌های خرید', analysis.shoppingHabits, 'text'],
    ['🔮', 'پیش‌بینی نیازهای بعدی', analysis.topPredictions, 'list'],
    ['🏷️', 'دسته‌های پیشنهادی', analysis.recommendedCategories, 'list'],
    ['📢', 'نکات بازاریابی', analysis.marketingTips, 'list'],
    ['📝', 'جمع‌بندی', analysis.summary, 'text'],
  ];
  for (const [icon, title, content, kind] of secs) {
    if (content === undefined || content === null || (Array.isArray(content) && content.length === 0)) continue;
    const sec = document.createElement('div');
    sec.className = 'ai-section';
    const h = document.createElement('div');
    h.className = 'ai-section-title';
    h.textContent = `${icon} ${title}`;
    sec.appendChild(h);

    if (kind === 'text') {
      const t = document.createElement('p');
      t.className = 'ai-text';
      t.textContent = String(content);
      sec.appendChild(t);
    } else if (kind === 'list') {
      const ul = document.createElement('ul');
      ul.className = 'ai-list';
      for (const item of content) {
        const li = document.createElement('li');
        li.textContent = String(item);
        ul.appendChild(li);
      }
      sec.appendChild(ul);
    } else if (kind === 'interests') {
      const chips = document.createElement('div');
      chips.className = 'ai-chips';
      for (const it of content) {
        const chip = document.createElement('span');
        chip.className = 'ai-chip';
        const b = document.createElement('b');
        b.textContent = it.strength ? `[${it.strength}] ` : '';
        chip.appendChild(b);
        chip.appendChild(document.createTextNode(`${it.title} — ${it.detail || ''}`));
        chips.appendChild(chip);
      }
      sec.appendChild(chips);
    }
    container.appendChild(sec);
  }
}

function renderAnalysisPanel(p) {
  $('ai-panel').hidden = false;
  $('ai-panel-name').textContent = p.name;
  $('ai-panel-meta').textContent = `تحلیل‌شده در ${faDateTime(p.analysis.analyzedAt)} • مدل: ${p.analysis.model || '—'}`;
  renderAnalysisInto($('ai-panel-body'), p.analysis);
}

function closeDrill() { $('modal-drill').hidden = true; drillState = null; }

// ═══════════════════════ کلاینت AvalAI ═══════════════════════
const AVALAI_BASE = 'https://api.avalai.ir/v1';

async function avalaiChat(apiKey, model, messages, { maxTokens = 1800, temperature = 0.5 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort('timeout'), 120000);
  try {
    const res = await fetch(`${AVALAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) throw new Error('کلید AvalAI نامعتبر است.');
      if (res.status === 402) throw new Error('اعتبار AvalAI کافی نیست.');
      if (res.status === 429) throw new Error('محدودیت نرخ AvalAI — کمی بعد تلاش کنید.');
      throw new Error(`خطای AvalAI (${res.status}): ${bodyText.slice(0, 140)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('پاسخ مدل خالی بود.');
    return text;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('مهلت پاسخ AI تمام شد.');
    if (e instanceof TypeError) throw new Error('اتصال به AvalAI برقرار نشد (شبکه/CORS). اینترنت را بررسی کنید.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────── تحلیل هوشمند پروفایل ───────────────────
function buildAnalysisPrompt(p) {
  const cats = categoryStatsOf(p.domains);
  const lines = [];
  lines.push(`# پروفایل پاکسازی‌شده کاربر (${p.uid}) — بازه ${p.rangeDays} روز`);
  lines.push('');
  lines.push('## دامنه‌های پربازدید (دامنه | بازدید | دسته):');
  for (const d of p.domains.slice(0, 40)) {
    lines.push(`- ${d.domain} | ${d.visits} | ${TAX.labels[categorizeDomain(d.domain)] || 'سایر'}`);
  }
  lines.push('');
  lines.push('## توزیع دسته‌ای:');
  for (const c of cats) lines.push(`- ${TAX.labels[c.category] || c.category}: ${c.domains} دامنه، ${c.visits} بازدید`);
  lines.push('');
  lines.push('## جستجوها (عبارت | تعداد):');
  for (const s of p.searches.slice(0, 50)) lines.push(`- ${s.term} | ${s.count}`);
  if (p.searches.length > 50) lines.push(`- … و ${p.searches.length - 50} جستجوی دیگر`);
  lines.push('');
  lines.push('## علاقه‌مندی‌های استخراج‌شده محلی:');
  for (const sec of computeInterests(p)) {
    lines.push(`- ${sec.title} (${sec.score})${sec.items.length ? ': ' + sec.items.slice(0, 5).map((i) => i.label).join('، ') : ''}`);
  }
  return lines.join('\n');
}

const ANALYSIS_SCHEMA_HINT = `پاسخ را فقط و فقط به‌صورت یک شیء JSON معتبر بده، بدون هیچ متن اضافه، بدون markdown، و با همین ساختار:
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
همه مقادیر فارسی روان باشند. علاقه‌مندی‌ها ۳ تا ۶ مورد، پیش‌بینی‌ها ۳ تا ۵ مورد، نکات ۳ تا ۵ مورد.`;

async function runAnalysis(p) {
  const apiKey = Store.secrets.aiKey;
  if (!apiKey) {
    openSettingsModal('ai');
    return toast('ابتدا کلید AvalAI را در تنظیمات وارد کنید.', 'err');
  }
  if (p.domains.length === 0 && p.searches.length === 0) {
    return toast('این پروفایل داده قابل تحلیل ندارد.', 'err');
  }

  const btn = $('btn-analyze');
  btn.disabled = true;
  $('btn-analyze-label').textContent = 'در حال تحلیل…';
  $('ib-ai-sub').textContent = 'در حال تحلیل با هوش مصنوعی…';
  $('ai-panel').hidden = false;
  $('ai-panel-name').textContent = p.name;
  $('ai-panel-meta').textContent = 'در حال پردازش…';
  const body = $('ai-panel-body');
  body.textContent = '';
  const loading = document.createElement('div');
  loading.className = 'ai-loading';
  loading.innerHTML = `<div class="ai-spinner"></div><p>هوش مصنوعی در حال تحلیل پروفایل <b>${esc(p.name)}</b> است…</p>
    <div class="ai-steps">
      <span class="ai-step active">۱. آماده‌سازی داده پاکسازی‌شده</span>
      <span class="ai-step">۲. ارسال به مدل ${esc(Store.settings.model)}</span>
      <span class="ai-step">۳. دریافت و اعتبارسنجی تحلیل</span>
      <span class="ai-step">۴. ذخیره دائمی در پروفایل</span>
    </div>`;
  body.appendChild(loading);
  $('ai-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const steps = loading.querySelectorAll('.ai-step');
    steps[0].classList.replace('active', 'done');
    steps[1].classList.add('active');

    const prompt = [
      'تو یک تحلیلگر حرفه‌ای رفتار کاربران دیجیتال و مشاور خرید هستی.',
      'داده‌های زیر یک «پروفایل پاکسازی‌شده» است: فقط دامنه‌ها و جستجوها (بدون هیچ داده حساس).',
      'وظیفه: تحلیل عمیق، دقیق و عملی این کاربر. خروجی کاملاً فارسی.',
      '',
      ANALYSIS_SCHEMA_HINT,
      '',
      buildAnalysisPrompt(p),
    ].join('\n');

    const raw = await avalaiChat(apiKey, Store.settings.model, [
      { role: 'system', content: 'تحلیلگر ارشد رفتار کاربر. همیشه فقط JSON معتبر برگردان.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 2000 });

    steps[1].classList.replace('active', 'done');
    steps[2].classList.add('active');

    // استخراج JSON از پاسخ (مقاوم به markdown)
    let jsonText = raw.trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(jsonText);
    if (fence) jsonText = fence[1].trim();
    const first = jsonText.indexOf('{');
    const last = jsonText.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('پاسخ مدل ساختار JSON نداشت.');
    const analysis = JSON.parse(jsonText.slice(first, last + 1));

    // اعتبارسنجی حداقلی + نرمال‌سازی
    analysis.profileTitle = String(analysis.profileTitle || 'کاربر تحلیل‌شده').slice(0, 80);
    analysis.interests = Array.isArray(analysis.interests) ? analysis.interests.slice(0, 8).map((i) => ({
      title: String(i?.title || '').slice(0, 80),
      detail: String(i?.detail || '').slice(0, 200),
      strength: ['قوی', 'متوسط', 'ضعیف'].includes(i?.strength) ? i.strength : 'متوسط',
    })).filter((i) => i.title) : [];
    analysis.personality = String(analysis.personality || '').slice(0, 1200);
    analysis.shoppingHabits = String(analysis.shoppingHabits || '').slice(0, 1200);
    analysis.topPredictions = (Array.isArray(analysis.topPredictions) ? analysis.topPredictions : []).slice(0, 6).map((x) => String(x).slice(0, 160));
    analysis.recommendedCategories = (Array.isArray(analysis.recommendedCategories) ? analysis.recommendedCategories : []).slice(0, 8).map((x) => String(x).slice(0, 60));
    analysis.marketingTips = (Array.isArray(analysis.marketingTips) ? analysis.marketingTips : []).slice(0, 6).map((x) => String(x).slice(0, 200));
    analysis.summary = String(analysis.summary || '').slice(0, 800);
    analysis.analyzedAt = Date.now();
    analysis.model = Store.settings.model;

    steps[2].classList.replace('active', 'done');
    steps[3].classList.add('active');

    p.analysis = analysis;
    await Store.persistProfiles();

    steps[3].classList.replace('active', 'done');
    loading.remove();
    renderAnalysisPanel(p);
    renderProfile(p);
    toast('تحلیل هوشمند ذخیره شد ✅', 'ok');
  } catch (e) {
    body.textContent = '';
    const err = document.createElement('div');
    err.className = 'hint';
    err.style.cssText = 'text-align:center;padding:20px;color:var(--danger);';
    err.textContent = `❌ ${e.message}`;
    const retry = document.createElement('button');
    retry.className = 'btn btn-primary btn-sm';
    retry.textContent = 'تلاش مجدد';
    retry.addEventListener('click', () => runAnalysis(p));
    body.append(err, retry);
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    $('btn-analyze-label').textContent = 'تحلیل هوشمند';
  }
}

// ═══════════════════════ تلگرام ═══════════════════════
async function tgCall(method, body, fetchInit) {
  const { tgToken, tgChatId } = Store.secrets;
  if (!tgToken || !tgChatId) throw new Error('اطلاعات ربات تلگرام در تنظیمات کامل نیست.');
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${tgToken}/${method}`, {
      method: 'POST',
      ...(fetchInit || { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(40000) : undefined,
    });
  } catch {
    throw new Error('اتصال به Telegram API برقرار نشد.');
  }
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram: ${String(data.description || res.status).slice(0, 120)}`);
  return data.result;
}

async function sendProfileToTelegram(p) {
  const caption = [
    `📊 پروفایل ${p.name} (${p.uid})`,
    `دستگاه: ${p.deviceLabel} | بازه: ${p.rangeDays} روز`,
    `دامنه: ${p.stats?.domains || 0} • جستجو: ${p.stats?.searches || 0} • کوکی امن: ${p.stats?.cookies || 0}`,
    p.analysis ? `✨ تحلیل: ${p.analysis.profileTitle}` : '⏳ هنوز تحلیل AI نشده',
  ].join('\n');
  await tgCall('sendMessage', { chat_id: Store.secrets.tgChatId, text: caption });

  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const form = new FormData();
  form.append('chat_id', Store.secrets.tgChatId);
  form.append('caption', `📎 فایل کامل پروفایل ${p.uid}`);
  form.append('document', blob, `${p.uid}_${(p.name || 'profile').replace(/[^\w\u0600-\u06FF-]+/g, '_')}.json`);
  await tgCall('sendDocument', null, { body: form });
}

// ═══════════════════════ ZIP (بدون وابستگی) ═══════════════════════
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ساخت ZIP با روش STORE (بدون فشرده‌سازی) — سازگار با همه unzip ها */
function buildZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, content } of files) {
    const nameBytes = enc.encode(name);
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);      // version
    local.setUint16(6, 0x0800, true);  // UTF-8 flag
    local.setUint16(8, 0, true);       // store
    local.setUint16(10, 0, true); local.setUint16(12, 0, true); // time/date
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true); cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
}

function exportProfilesZip(list) {
  if (!list.length) return toast('پروفایلی برای خروجی وجود ندارد.', 'err');
  const readme = [
    'بانک پروفایل‌های مرور — داشبورد تحلیل (خریدار پرو)',
    `تاریخ خروجی: ${new Date().toLocaleString('fa-IR')}`,
    `تعداد پروفایل‌ها: ${list.length}`,
    '',
    'هر فایل JSON یک پروفایل پاکسازی‌شده است (بدون هیچ داده حساس):',
    '  domains[]  = دامنه‌های بازدیدشده + تعداد بازدید',
    '  searches[] = جستجوها + تعداد تکرار',
    '  cookies[]  = نام و دامنه کوکی‌های «بی‌مقدار» (بدون هیچ مقدار)',
    '  analysis   = تحلیل هوش مصنوعی (در صورت اجرا)',
    '',
    '🛡️ یادآوری: هیچ مقدار کوکی، URL شخصی، عنوان صفحه یا دامنه حساس',
    '   (بانکی/پیام‌رسان/جنسی) در این فایل‌ها وجود ندارد.',
  ].join('\n');
  const files = [{ name: 'README.txt', content: readme }];
  const stamp = new Date().toISOString().slice(0, 10);
  for (const p of list) {
    const safe = `${p.uid}_${(p.name || 'user').replace(/[^\w\u0600-\u06FF-]+/g, '_')}`;
    files.push({ name: `${safe}.json`, content: JSON.stringify(p, null, 2) });
  }
  download(`profiles-bank_${stamp}.zip`, buildZip(files));
  toast(`ZIP با ${faNum(list.length)} پروفایل ساخته شد 📦`, 'ok');
}

// ═══════════════════════ Import ═══════════════════════
async function importFiles(fileList) {
  let added = 0, skipped = 0, failed = 0;
  for (const file of fileList) {
    try {
      const text = await file.text();
      const parsed = normalizeImported(JSON.parse(text));
      if (parsed.bundle) {
        for (const snap of parsed.profiles) {
          try {
            const n = normalizeImported(snap);
            Store.addProfile(n.snapshot, file.name);
            added++;
          } catch { skipped++; }
        }
      } else {
        Store.addProfile(parsed.snapshot, file.name);
        added++;
      }
    } catch (e) {
      console.warn('import failed:', file.name, e.message);
      failed++;
    }
  }
  if (added > 0) {
    await Store.persistProfiles();
    renderList();
    toast(`${faNum(added)} پروفایل اضافه شد ✅${skipped ? ` • ${faNum(skipped)} رد شد` : ''}${failed ? ` • ${faNum(failed)} خطا` : ''}`, 'ok');
  } else {
    toast(`هیچ پروفایلی اضافه نشد.${failed ? ` (${faNum(failed)} فایل نامعتبر)` : ''}`, 'err');
  }
}

// ═══════════════════════ مودال تنظیمات ═══════════════════════
function openSettingsModal(focusTab) {
  const m = $('modal-settings');
  $('lock-state-label').textContent = Store.settings.lockEnabled ? '(قفل فعال ✅)' : '(غیرفعال)';
  $('btn-remove-lock').hidden = !Store.settings.lockEnabled;
  $('ai-key-state').textContent = Store.secrets.aiKey ? `(ذخیره‌شده: ${maskKey(Store.secrets.aiKey)})` : '(تنظیم نشده)';
  $('tg-state').textContent = (Store.secrets.tgToken && Store.secrets.tgChatId) ? '(تنظیم‌شده ✅)' : '(تنظیم نشده)';
  const sel = $('set-model');
  sel.value = ['qwen3.8-flash', 'glm-5.3-flash', 'gemini-flash-latest', 'gpt-6-astra', 'claude-fable-5-1'].includes(Store.settings.model)
    ? Store.settings.model : 'custom';
  $('set-model-custom').hidden = sel.value !== 'custom';
  if (sel.value === 'custom') $('set-model-custom').value = Store.settings.model;
  m.hidden = false;
  if (focusTab === 'ai') $('set-ai-key').focus();
}

function maskKey(k) {
  const s = String(k);
  return s.length <= 8 ? '••••••' : `${s.slice(0, 4)}••••••${s.slice(-4)}`;
}

// ═══════════════════════ رویدادها ═══════════════════════

// جستجو و مرتب‌سازی لیست
$('profile-search').addEventListener('input', () => renderList());
$('sort-select').addEventListener('change', () => renderList());

// باز/بسته کردن پروفایل
$('btn-back').addEventListener('click', renderList);

// ویرایش نام
$('p-name').addEventListener('blur', async () => {
  if (!currentProfile) return;
  const newName = $('p-name').textContent.trim().slice(0, 60);
  if (newName && newName !== currentProfile.name) {
    currentProfile.name = newName;
    await Store.persistProfiles();
    $('p-avatar').textContent = initials(newName);
    toast('نام پروفایل به‌روزرسانی شد ✏️', 'ok');
  } else {
    $('p-name').textContent = currentProfile.name;
  }
});
$('p-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('p-name').blur(); }
});

// جعبه‌های بینش
$('box-domains').addEventListener('click', () => openDrill('domains'));
$('box-searches').addEventListener('click', () => openDrill('searches'));
$('box-interests').addEventListener('click', () => openDrill('interests'));
$('box-ai').addEventListener('click', () => openDrill('ai'));
$('btn-analyze').addEventListener('click', () => runAnalysis(currentProfile));

// فیلتر drill
$('drill-search').addEventListener('input', (e) => {
  if (drillState) { drillState.q = e.target.value; drillState.limit = 60; renderDrillList(); }
});
$('drill-more').addEventListener('click', () => {
  if (drillState) { drillState.limit += 100; renderDrillList(); }
});

// اکشن‌های پروفایل
$('btn-p-export').addEventListener('click', () => {
  if (!currentProfile) return;
  download(`${currentProfile.uid}_${currentProfile.name.replace(/[^\w\u0600-\u06FF-]+/g, '_')}.json`,
    new Blob([JSON.stringify(currentProfile, null, 2)], { type: 'application/json' }));
});
$('btn-p-tg').addEventListener('click', async () => {
  try {
    await sendProfileToTelegram(currentProfile);
    toast('پروفایل به تلگرام ارسال شد 📨', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});
$('btn-p-delete').addEventListener('click', async () => {
  if (!currentProfile) return;
  if (!confirm(`پروفایل «${currentProfile.name}» (${currentProfile.uid}) برای همیشه حذف شود؟`)) return;
  Store.remove(currentProfile.uid);
  await Store.persistProfiles();
  toast('پروفایل حذف شد 🗑', 'ok');
  renderList();
});

// Import: file input + drag&drop + چسباندن دستی
$('import-file').addEventListener('change', async (e) => {
  if (e.target.files?.length) await importFiles([...e.target.files]);
  e.target.value = '';
});

const dropOverlay = $('drop-overlay');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dropOverlay.hidden = false; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.hidden = true; } });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.name.endsWith('.json') || f.type === 'application/json');
  if (files.length) await importFiles(files);
  else toast('فقط فایل JSON پذیرفته می‌شود.', 'err');
});
$('dropzone').addEventListener('click', () => $('import-file').click());

// خروجی‌های کلی
$('btn-export-all').addEventListener('click', () => {
  const list = Store.profiles || [];
  if (!list.length) return toast('پروفایلی وجود ندارد.', 'err');
  download(`profiles-bank_${new Date().toISOString().slice(0, 10)}.json`,
    new Blob([JSON.stringify({ app: 'shop-profile-dashboard', version: 1, exportedAt: new Date().toISOString(), profiles: list }, null, 2)], { type: 'application/json' }));
  toast('خروجی JSON ساخته شد ⬇️', 'ok');
});
$('btn-export-zip').addEventListener('click', () => exportProfilesZip(Store.profiles || []));

// مودال‌ها: باز/بسته
$('btn-settings').addEventListener('click', () => openSettingsModal());
document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => { $(btn.dataset.close).hidden = true; }));
document.querySelectorAll('.modal-backdrop').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop').forEach((m) => { m.hidden = true; });
});

document.querySelectorAll('[data-eye]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.eye);
    input.type = input.type === 'password' ? 'text' : 'password';
  }));

// تنظیمات: قفل
$('btn-save-lock').addEventListener('click', async () => {
  const pass = $('set-lock-pass').value;
  try {
    if (Store.settings.lockEnabled && !CryptoBox.unlocked) {
      // قفل فعال ولی بسته: ابتدا بازگشایی با رمز فعلی لازم است
      const cur = prompt('برای تغییر رمز، رمز فعلی را وارد کنید:');
      if (!cur) return;
      await CryptoBox.open(localStorage.getItem(Store.KEY_SEALED), cur);
    }
    await CryptoBox.setup(pass);
    // رمزنگاری مجدد بانک با رمز جدید
    const profiles = Store.profiles || [];
    localStorage.setItem(Store.KEY_SEALED, await CryptoBox.seal(profiles, pass));
    localStorage.removeItem(Store.KEY_PROFILES);
    Store.settings.lockEnabled = true;
    Store.persistSettings();
    if (Store.secrets.aiKey || Store.secrets.tgToken) await Store.persistSecrets();
    $('set-lock-pass').value = '';
    toast('قفل داشبورد فعال شد 🔐', 'ok');
    openSettingsModal();
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-remove-lock').addEventListener('click', async () => {
  try {
    if (!CryptoBox.unlocked) {
      const cur = prompt('رمز فعلی قفل را وارد کنید:');
      if (!cur) return;
      Store.profiles = await CryptoBox.open(localStorage.getItem(Store.KEY_SEALED), cur);
    }
    if (!confirm('با حذف قفل، پروفایل‌ها به‌صورت رمزنگاری‌نشده ذخیره می‌شوند. مطمئنید؟')) return;
    localStorage.setItem(Store.KEY_PROFILES, JSON.stringify(Store.profiles));
    localStorage.removeItem(Store.KEY_SEALED);
    localStorage.removeItem(Store.KEY_SEALED_SECRETS);
    Store.settings.lockEnabled = false;
    Store.persistSettings();
    CryptoBox.lock();
    toast('قفل حذف شد.', 'ok');
    openSettingsModal();
  } catch (e) { toast(e.message, 'err'); }
});

// تنظیمات: AI
$('set-model').addEventListener('change', () => {
  $('set-model-custom').hidden = $('set-model').value !== 'custom';
});
$('btn-save-ai').addEventListener('click', async () => {
  const key = $('set-ai-key').value.trim();
  const model = $('set-model').value === 'custom'
    ? $('set-model-custom').value.trim() : $('set-model').value;
  if (key) Store.secrets.aiKey = key;
  if (model) Store.settings.model = model;
  Store.persistSettings();
  await Store.persistSecrets();
  $('set-ai-key').value = '';
  toast('تنظیمات AI ذخیره شد ✅', 'ok');
  openSettingsModal();
});
$('btn-test-ai').addEventListener('click', async () => {
  const key = $('set-ai-key').value.trim() || Store.secrets.aiKey;
  if (!key) return toast('ابتدا کلید را وارد کنید.', 'err');
  const btn = $('btn-test-ai');
  btn.disabled = true; btn.textContent = 'در حال تست…';
  try {
    const r = await avalaiChat(key, Store.settings.model,
      [{ role: 'user', content: 'فقط کلمه «متصل» را بفرست.' }], { maxTokens: 10, temperature: 0 });
    toast(`اتصال موفق ✅ — ${r.slice(0, 30)}`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'تست اتصال'; }
});

// تنظیمات: تلگرام
$('btn-save-tg').addEventListener('click', async () => {
  const token = $('set-tg-token').value.trim();
  const chat = $('set-tg-chat').value.trim();
  if (token) Store.secrets.tgToken = token;
  if (chat) Store.secrets.tgChatId = chat;
  await Store.persistSecrets();
  $('set-tg-token').value = '';
  toast('اطلاعات ربات ذخیره شد ✅', 'ok');
  openSettingsModal();
});
$('btn-test-tg').addEventListener('click', async () => {
  try {
    await tgCall('sendMessage', { chat_id: Store.secrets.tgChatId, text: '✅ تست اتصال داشبورد تحلیل پروفایل — موفق بود.' });
    toast('پیام تست ارسال شد 📨', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

// افزودن دستی
document.querySelectorAll('[data-close]').forEach(() => {});
(function bindManual() {
  // دکمه افزودن دستی: Shift+کلیک روی «افزودن کاربر» یا از منو
  $('import-file').addEventListener('click', () => {}, { passive: true });
})();
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'm') { e.preventDefault(); $('modal-manual').hidden = false; }
});
$('btn-manual-import').addEventListener('click', async () => {
  const text = $('manual-json').value.trim();
  if (!text) return toast('محتوای JSON را وارد کنید.', 'err');
  try {
    const parsed = normalizeImported(JSON.parse(text));
    if (parsed.bundle) {
      for (const snap of parsed.profiles) {
        try { Store.addProfile(normalizeImported(snap).snapshot, 'چسبانده‌شده'); } catch { /* skip */ }
      }
    } else {
      Store.addProfile(parsed.snapshot, 'چسبانده‌شده');
    }
    await Store.persistProfiles();
    $('manual-json').value = '';
    $('modal-manual').hidden = true;
    renderList();
    toast('پروفایل وارد شد ✅', 'ok');
  } catch (e) { toast(`خطا: ${e.message}`, 'err'); }
});

// ═══════════════════════ راه‌اندازی ═══════════════════════
(async function init() {
  await Store.load();

  // اگر قفل فعال است و باز نیست → صفحه بازگشایی
  if (Store.profiles === null) {
    showUnlockGate();
    return;
  }
  renderList();
})();

function showUnlockGate() {
  const pass = prompt('🔐 این داشبورد با رمز قفل شده است.\nرمز قفل را وارد کنید:');
  if (!pass) {
    document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;font-family:Vazirmatn,sans-serif;color:#7a86a3;text-align:center;"><div><p>داشبورد قفل است.</p><button onclick="location.reload()" style="margin-top:12px;padding:10px 22px;border:none;border-radius:10px;background:#7c3aed;color:#fff;font-family:inherit;cursor:pointer;">تلاش مجدد</button></div></div>';
    return;
  }
  CryptoBox.open(localStorage.getItem(Store.KEY_SEALED), pass).then(async (profiles) => {
    Store.profiles = profiles;
    const sealedSecrets = localStorage.getItem(Store.KEY_SEALED_SECRETS);
    if (sealedSecrets) {
      try { Store.secrets = { ...Store.secrets, ...(await CryptoBox.open(sealedSecrets, pass)) }; } catch { /* noop */ }
    }
    toast('قفل باز شد 🔓', 'ok');
    renderList();
  }).catch((e) => {
    toast(e.message, 'err');
    setTimeout(showUnlockGate, 400);
  });
}

})();
