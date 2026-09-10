// ============================================================================
// popup.js — کنترلر رابط کاربری افزونه (ES Module)
// ----------------------------------------------------------------------------
// v2.2:
//  • جریان پیش‌فرض: خوش‌آمد → «موافقم» → تنظیمِ حداقلی (برچسب + بازه) →
//    لودینگ مرحله‌ایِ استخراج → چت. هیچ صفحهٔ قفلی در مسیر پیش‌فرض نیست.
//  • ارسال خروجی پاکسازی‌شده به ربات تلگرام «خودکار» است و سوییچ کاربر ندارد.
//  • همهٔ رازها داخل افزونه و رمزنگاری‌شده‌اند؛ کاربر چیزی نمی‌سازد/وارد نمی‌کند
//    مگر اینکه خودش بخواهد (تب‌های هوش مصنوعی/تلگرام در تنظیمات).
//  • هر دکمه هندلر دارد: در حین کار disabled + اسپینر، در پایان توست.
//  • رندر چت کاملاً DOM-based است (بدون innerHTML از داده).
// ============================================================================

import { buildStoreLinks, storeNameFromLink } from '../lib/stores.js';
import { KNOWN_MODELS } from '../lib/constants.js';

// ───────────────────────── ابزارهای پایه ─────────────────────────
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  check: ['M4.5 12.5l5 5 10-11'],
  'check-circle': ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M8.2 12.4l2.6 2.6 5-5.4'],
  'x-circle': ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M9.3 9.3l5.4 5.4', 'M14.7 9.3l-5.4 5.4'],
  alert: ['M12 4.5l8.5 15h-17z', 'M12 10v4', 'M12 17h.01'],
  info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 11v5.5', 'M12 7.8h.01'],
  bag: ['M6 7h12l1.2 13.2a1 1 0 0 1-1 1.1H5.8a1 1 0 0 1-1-1.1L6 7z', 'M9 10V6a3 3 0 0 1 6 0v4'],
  globe: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M3.5 12h17',
    'M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z'],
  'map-pin': ['M12 20.5c4.5-4.3 6.5-7.5 6.5-10.2A6.5 6.5 0 0 0 5.5 10.3c0 2.7 2 5.9 6.5 10.2z', 'M12 8.2h.01'],
  chart: ['M4 20h16', 'M7.5 20v-6', 'M12 20V6', 'M16.5 20v-9'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20.5 20.5l-4.3-4.3'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z',
    'M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z'],
  'eye-off': ['M4 4l16 16', 'M9.6 9.7A3.2 3.2 0 0 0 12 15.2c1 0 1.9-.4 2.5-1',
    'M6.3 6.7C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.5 4.2-1.2',
    'M9.9 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a19.4 19.4 0 0 1-3.4 4'],
  shield: ['M12 3.5l7.5 2.5v6c0 4.2-3 7.4-7.5 8.7C7.5 19.4 4.5 16.2 4.5 12V6z', 'M9 12.5l2 2 4-4.5'],
  sparkles: ['M11 4l1.6 3.9L16.5 9.5l-3.9 1.6L11 15l-1.6-3.9L5.5 9.5l3.9-1.6z',
    'M18 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z'],
  refresh: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4.5V9h-4.5'],
  send: ['M20.5 12L4 4.5l3 7.5-3 7.5z', 'M7 12h13'],
  telegram: ['M21 3.5L10.5 14', 'M21 3.5l-6.8 17-3.2-6.6-6.5-3.4z'],
  download: ['M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16',
    'M12 3.5v11', 'M7.5 10L12 14.5l4.5-4.5'],
  trash: ['M4.5 7h15', 'M9.5 7V4.5h5V7', 'M6.5 7l1 12.5h9L17.5 7',
    'M10.5 10.5v6', 'M13.5 10.5v6'],
  lock: ['M5.5 10.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
    'M8 10.5V8a4 4 0 0 1 8 0v2.5'],
  database: ['M4.5 6a7.5 3 0 1 0 15 0 7.5 3 0 1 0-15 0', 'M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6',
    'M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3'],
  cpu: ['M8.5 8.5h7v7h-7z', 'M11 6.5v-3', 'M13 6.5v-3', 'M11 20.5v-3', 'M13 20.5v-3',
    'M6.5 11h-3', 'M6.5 13h-3', 'M20.5 11h-3', 'M20.5 13h-3'],
  clock: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 7.5V12l3.5 2'],
  key: ['M8 15.5a3.5 3.5 0 1 0 0-.1z', 'M10.5 13L20 3.5', 'M17 4.5l2.5 2.5', 'M14.5 7l2.5 2.5'],
};

function svgIcon(name, cls) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (cls) svg.setAttribute('class', cls);
  for (const d of (ICON_PATHS[name] || ICON_PATHS.info)) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

const textNode = (text, cls) => {
  const el = document.createElement('span');
  if (cls) el.className = cls;
  el.textContent = text;
  return el;
};

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

/** دکمهٔ در حال انجام: غیرفعال + اسپینر داخلی + برچسب */
function setLoading(btn, on, label) {
  if (!btn) return;
  if (on) {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.classList.add('is-loading');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    const sp = document.createElement('span');
    sp.className = 'btn__spinner';
    btn.replaceChildren(sp, textNode(label || 'در حال انجام…'));
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
  }
}

let toastTimer;
function toast(msg, kind = '') {
  const t = $('toast');
  if (!t) return;
  const icon = kind === 'ok' ? 'check-circle' : kind === 'err' ? 'x-circle' : 'info';
  t.replaceChildren(svgIcon(icon), textNode(msg));
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

async function send(action, payload = {}) {
  const res = await chrome.runtime.sendMessage({ action, ...payload });
  if (!res) throw new Error('ارتباط با سرویس افزونه قطع شد. پنجره را دوباره باز کنید.');
  if (!res.ok) {
    const err = new Error(res.error || 'خطای ناشناخته');
    err.needsKey = res.needsKey === true;
    throw err;
  }
  return res;
}

// ───────────────────────── تم (روشن/تیره/سیستم) ─────────────────────────
const THEME_KEY = 'kharidar-theme';
const THEME_NAMES = { light: 'روشن', dark: 'تیره', system: 'سیستم' };
const mq = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function themePref() {
  try {
    const p = localStorage.getItem(THEME_KEY);
    return p === 'light' || p === 'dark' || p === 'system' ? p : 'system';
  } catch { return 'system'; }
}
function applyTheme(pref) {
  const p = pref || themePref();
  const dark = p === 'system' ? Boolean(mq && mq.matches) : p === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.querySelectorAll('[data-theme-set]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === p)));
}
function setTheme(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* دسترسی نیست */ }
  applyTheme(pref);
}
if (mq && mq.addEventListener) {
  mq.addEventListener('change', () => { if (themePref() === 'system') applyTheme('system'); });
}

// ───────────────────────── صفحه‌ها ─────────────────────────
const screens = {
  welcome: $('screen-welcome'),
  setup: $('screen-setup'),
  extract: $('screen-extract'),
  chat: $('screen-chat'),
  unlock: $('screen-unlock'),
  error: $('screen-error'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => { if (el) el.hidden = k !== name; });
  $('main-actions').hidden = name !== 'chat';
  $('crypto-banner').hidden = !(name === 'chat' && state.cryptoBroken);
}

function setStatus(text, kind = '') {
  $('status-text').textContent = text;
  const dot = document.querySelector('#status-line .dot');
  if (dot) dot.className = `dot ${kind}`;
}

let state = { cryptoBroken: false };

// ───────────────────────── مسیریابی ─────────────────────────
async function route() {
  try {
    state = await send('get_state');
    if (state.cryptoBroken) {
      $('crypto-banner').hidden = false;
    }
    if (!state.consent) { showScreen('welcome'); return; }
    if (!state.setupDone) { initSetupScreen(); showScreen('setup'); return; }
    if (state.cryptoMode === 'passphrase' && !state.unlocked) {
      // قفلِ اختیاری: پیش‌فرض هیچ‌وقت اینجا نمی‌رسد و کاربر می‌تواند رد کند
      showScreen('unlock');
      return;
    }
    await enterChat(state);
  } catch (e) {
    showError(e.message);
  }
}

function showError(msg) {
  $('error-msg').textContent = msg;
  showScreen('error');
}

// ───────────────────────── خوش‌آمد / رضایت ─────────────────────────
$('consent-check').addEventListener('change', (e) => {
  $('btn-accept-consent').disabled = !e.target.checked;
});

$('btn-accept-consent').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال آماده‌سازی…');
  try {
    const res = await send('accept_consent');
    if (Array.isArray(res.seeded) && res.seeded.length) {
      toast('پیکربندی رمزنگاری و ذخیره شد', 'ok');
    }
    initSetupScreen();
    showScreen('setup');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

function initSetupScreen() {
  if (state?.settings?.deviceLabel) $('setup-device').value = state.settings.deviceLabel;
  if (state?.settings?.historyDays) $('setup-days').value = String(state.settings.historyDays);
}

// ───────────────────────── لودینگ مرحله‌ایِ استخراج ─────────────────────────
const EXTRACT_STEPS = [
  { icon: 'database', label: 'خواندن تاریخچهٔ مرور و کوکی‌های امن' },
  { icon: 'shield', label: 'حذف دامنه‌ها و عبارت‌های حساس' },
  { icon: 'cpu', label: 'دسته‌بندی محلی — بدون مصرف توکن' },
  { icon: 'chart', label: 'ساخت اسنپ‌شات پاکسازی‌شده' },
  { icon: 'telegram', label: 'ارسال خودکار به ربات تلگرام' },
];

function renderExtractSteps(activeIndex, failIndex = -1) {
  const ol = $('extract-steps');
  ol.textContent = '';
  EXTRACT_STEPS.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'steps__item'
      + (i < activeIndex ? ' is-done' : '')
      + (i === activeIndex ? ' is-active' : '')
      + (i === failIndex ? ' is-failed' : '');
    const mark = document.createElement('span');
    mark.className = 'steps__mark';
    mark.appendChild(svgIcon(i === failIndex ? 'alert' : (i < activeIndex ? 'check' : s.icon)));
    li.append(mark, textNode(s.label));
    ol.appendChild(li);
  });
}

let stepTimer = null;
function startStepAnimation() {
  let i = 0;
  renderExtractSteps(0);
  clearInterval(stepTimer);
  stepTimer = setInterval(() => {
    if (i < 3) { i += 1; renderExtractSteps(i); }
  }, 700);
  return () => { clearInterval(stepTimer); stepTimer = null; };
}

/** استخراج کامل با نمایش مراحل + ارسال خودکار به تلگرام */
async function runExtraction({ startChat = true } = {}) {
  showScreen('extract');
  setStatus('در حال استخراج امن…', 'warn');
  $('extract-title').textContent = 'در حال استخراج امن…';
  const stop = startStepAnimation();
  try {
    const res = await send('collect');
    clearInterval(stepTimer);
    const tg = res.telegram || {};
    renderExtractSteps(tg.sent ? 5 : 4, tg.sent || tg.skipped ? -1 : 3);

    if (tg.sent) {
      setStatus('ارسال به ربات انجام شد', 'ok');
    } else if (tg.skipped === 'not-configured') {
      $('extract-title').textContent = 'استخراج انجام شد — ربات تلگرام تنظیم نیست';
      setStatus('ربات تنظیم نیست', 'warn');
    } else {
      $('extract-title').textContent = 'استخراج انجام شد — ارسال به ربات ناموفق';
      setStatus('ارسال ناموفق', 'warn');
    }

    await new Promise((r) => setTimeout(r, 450));
    showScreen('chat');
    if (tg.sent) toast('خروجی پاکسازی‌شده به ربات تلگرام ارسال شد', 'ok');
    else if (tg.skipped === 'not-configured') toast('استخراج انجام شد؛ برای ارسال خودکار، ربات را در تنظیمات وارد کنید.', 'info');
    else toast(`ارسال به تلگرام ناموفق: ${tg.error || 'خطای ناشناخته'}`, 'err');

    if (startChat) await startAssistantChat();
    return res;
  } catch (err) {
    clearInterval(stepTimer);
    renderExtractSteps(0, 0);
    $('extract-title').textContent = 'استخراج ناموفق بود';
    setStatus('خطا', 'err');
    toast(err.message, 'err');
    throw err;
  } finally {
    stop();
  }
}

/** شروع گفتگو با دستیار (سلامِ اولیه) */
async function startAssistantChat() {
  chatBox.textContent = '';
  setBusy(true);
  appendTyping();
  setStatus('در حال گفتگو…', 'warn');
  try {
    const started = await send('chat_start');
    removeTyping();
    chatBox.textContent = '';
    const last = started.conversation[started.conversation.length - 1];
    if (last?.role === 'assistant') renderAssistantMessage(last.content);
    const s = await send('get_state');
    state = s;
    renderSnapshotBar(s);
    setStatus('متصل', 'ok');
  } catch (e) {
    removeTyping();
    appendTextMessage(e.message, 'error');
    if (e.needsKey) appendOpenSettingsButton();
    setStatus('خطا', 'err');
  } finally {
    setBusy(false);
  }
}

// ───────────────────────── جریانِ تنظیم سریع ─────────────────────────
$('btn-finish-setup').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال ذخیره…');
  try {
    await send('save_settings', {
      deviceLabel: $('setup-device').value.trim() || 'دستگاه من',
      historyDays: $('setup-days').value,
    });
    await runExtraction({ startChat: true });
  } catch (err) {
    toast(err.message, 'err');
    setLoading(btn, false);
    showScreen('setup');
  } finally {
    setLoading(btn, false);
  }
});

// ───────────────────────── رندر امن چت ─────────────────────────
const chatBox = $('chat-box');

function scrollBottom() { chatBox.scrollTop = chatBox.scrollHeight; }

function appendTextMessage(content, who) {
  if (who === 'error') {
    const div = document.createElement('div');
    div.className = 'message msg-error';
    div.textContent = content;
    chatBox.appendChild(div);
    scrollBottom();
    return;
  }
  const div = document.createElement('div');
  div.className = `message ${who === 'user' ? 'msg-user' : 'msg-ai'}`;
  renderRichText(div, content);
  chatBox.appendChild(div);
  scrollBottom();
}

function renderRichText(container, text) {
  container.textContent = '';
  const parts = String(text).split(/(https?:\/\/[^\s\]]+)/g);
  for (const part of parts) {
    if (/^https?:\/\//.test(part)) {
      try {
        const u = new URL(part);
        if (u.protocol === 'https:' || u.protocol === 'http:') {
          const a = document.createElement('a');
          a.href = u.href;
          a.textContent = u.hostname.replace(/^www\./, '');
          a.target = '_blank';
          a.rel = 'noopener noreferrer nofollow';
          container.appendChild(a);
          continue;
        }
      } catch { /* fallthrough */ }
    }
    container.appendChild(document.createTextNode(part));
  }
}

function appendTyping() {
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typing-indicator';
  for (let i = 0; i < 3; i++) div.appendChild(document.createElement('span'));
  chatBox.appendChild(div);
  scrollBottom();
}
function removeTyping() { $('typing-indicator')?.remove(); }

// ─────────── پروتکل [PRODUCT] و [SHOPS] ───────────
function renderAssistantMessage(rawText) {
  const productRe = /\[PRODUCT\]([\s\S]*?)\[\/PRODUCT\]/g;
  const shopsRe = /\[SHOPS\]([\s\S]*?)\[\/SHOPS\]/g;
  const withoutProducts = rawText.replace(productRe, '').replace(shopsRe, '').trim();
  if (withoutProducts) appendTextMessage(withoutProducts, 'ai');

  let m;
  while ((m = shopsRe.exec(rawText)) !== null) {
    try {
      const { query } = JSON.parse(m[1].trim());
      appendStoreChips(buildStoreLinks(query));
    } catch { /* JSON خراب — نادیده */ }
  }
  while ((m = productRe.exec(rawText)) !== null) {
    try {
      appendProductCard(JSON.parse(m[1].trim()));
    } catch { /* JSON خراب — نادیده */ }
  }
}

function appendProductCard(data) {
  const card = document.createElement('div');
  card.className = 'product-card';

  const img = document.createElement('div');
  img.className = 'product-image';
  let imageUrl = null;
  if (typeof data.image === 'string' && data.image.trim()) {
    try {
      const u = new URL(data.image);
      if (u.protocol === 'https:' || u.protocol === 'http:') imageUrl = u.href;
    } catch { /* نامعتبر */ }
  }
  if (imageUrl) img.style.backgroundImage = `url("${imageUrl.replace(/"/g, '%22')}")`;
  else img.appendChild(svgIcon('bag'));

  const body = document.createElement('div');
  body.className = 'product-body';

  const name = document.createElement('div');
  name.className = 'product-name';
  name.textContent = String(data.name || 'محصول پیشنهادی').slice(0, 160);

  const summary = document.createElement('div');
  summary.className = 'product-summary';
  summary.textContent = String(data.summary || '').slice(0, 300);

  const meta = document.createElement('div');
  meta.className = 'product-meta';

  if (data.price) {
    const price = document.createElement('span');
    price.className = 'product-price';
    price.textContent = String(data.price).slice(0, 40);
    meta.appendChild(price);
  }

  let linkUrl = null;
  if (typeof data.link === 'string' && data.link.trim()) {
    try {
      const u = new URL(data.link);
      if (u.protocol === 'https:') linkUrl = u.href;
    } catch { /* نامعتبر */ }
  }
  if (linkUrl) {
    const link = document.createElement('a');
    link.className = 'product-link';
    link.href = linkUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer nofollow';
    const storeName = storeNameFromLink(linkUrl);
    link.textContent = storeName ? `مشاهده در ${storeName}` : 'مشاهده محصول';
    meta.appendChild(link);
  }

  body.append(name, summary, meta);
  card.append(img, body);
  chatBox.appendChild(card);
  scrollBottom();
}

function appendStoreChips(links) {
  const wrap = document.createElement('div');
  wrap.className = 'store-chips';
  for (const l of links) {
    const a = document.createElement('a');
    a.className = 'chip';
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
    a.appendChild(svgIcon(l.region === 'ir' ? 'map-pin' : 'globe'));
    a.appendChild(textNode(l.name));
    const region = document.createElement('span');
    region.className = l.region === 'ir' ? 'chip__region chip__region--ir' : 'chip__region';
    region.textContent = l.region === 'ir' ? 'ایران' : 'جهانی';
    a.appendChild(region);
    wrap.appendChild(a);
  }
  chatBox.appendChild(wrap);
  scrollBottom();
}

/** دکمهٔ «تنظیمات» داخل چت — وقتی کلیدی تنظیم نیست */
function appendOpenSettingsButton() {
  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary btn-sm';
  btn.appendChild(svgIcon('key'));
  btn.appendChild(textNode('رفتن به تنظیمات'));
  btn.addEventListener('click', openSettings);
  chatBox.appendChild(btn);
  scrollBottom();
}

// ───────────────────────── وضعیتِ مشغول بودن ─────────────────────────
let busy = false;
const sendBtn = $('btn-send');

function setBusy(b) {
  busy = b;
  sendBtn.disabled = b;
  $('user-input').disabled = b;
  if (b) {
    const sp = document.createElement('span');
    sp.className = 'spinner';
    sendBtn.replaceChildren(sp);
  } else {
    sendBtn.replaceChildren(svgIcon('send'));
  }
}

// ───────────────────────── ورود به چت ─────────────────────────
async function enterChat(s) {
  showScreen('chat');
  setStatus('متصل', 'ok');
  renderSnapshotBar(s);

  if (s.chatLength > 0) {
    const { conversation } = await send('get_chat');
    if (conversation && conversation.length) {
      chatBox.textContent = '';
      for (const msg of conversation) {
        if (msg.role === 'user') appendTextMessage(msg.content, 'user');
        else if (msg.role === 'assistant') renderAssistantMessage(msg.content);
      }
      return;
    }
  }

  if (!s.hasSnapshot) {
    // اولین ورود: مستقیم به لودینگ مرحله‌ای استخراج می‌رویم
    await runExtraction({ startChat: true });
  } else {
    chatBox.textContent = '';
    appendHeroCard();
  }
}

function appendHeroCard() {
  const div = document.createElement('div');
  div.className = 'message msg-ai';
  div.textContent = 'سلام! من خریدار پرو هستم. برای شناخت سلیقهٔ شما، یک تحلیل امن و محلی از مرور اخیرتان انجام می‌دهم — بدون هیچ مقدار کوکی و بدون داده حساس.';
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-sm';
  btn.appendChild(svgIcon('sparkles'));
  btn.appendChild(textNode('شروع تحلیل سلیقهٔ من'));
  btn.addEventListener('click', () => runExtraction({ startChat: true }).catch(() => {}));
  div.appendChild(btn);
  chatBox.appendChild(div);
  scrollBottom();
}

function renderSnapshotBar(s) {
  const bar = $('snapshot-bar');
  if (!bar) return;
  if (!s.hasSnapshot || !s.snapshotStats) { bar.hidden = true; return; }
  const st = s.snapshotStats;
  const wrap = $('snapshot-summary');
  const parts = [
    ['globe', `${fa(st.domains)} دامنه`],
    ['search', `${fa(st.searches)} جستجو`],
    ['shield', `${fa(st.cookies)} کوکی بی‌مقدار`],
  ];
  wrap.replaceChildren();
  for (const [name, label] of parts) {
    const item = document.createElement('span');
    item.className = 'sb-item';
    item.append(svgIcon(name), textNode(label));
    wrap.appendChild(item);
  }
  bar.setAttribute('aria-label', `اسنپ‌شات: ${parts.map(([, l]) => l).join('، ')}`);
  bar.hidden = false;
}

$('btn-recollect').addEventListener('click', () => {
  runExtraction({ startChat: true }).catch(() => {});
});

$('btn-new-chat').addEventListener('click', async () => {
  try {
    await send('chat_reset');
    await runExtraction({ startChat: true });
  } catch (e) {
    toast(e.message, 'err');
  }
});

// ───────────────────────── ارسال پیام ─────────────────────────
const userInput = $('user-input');

function autoSize() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 96) + 'px';
}

async function sendChat() {
  const text = userInput.value.trim();
  if (!text || busy) return;
  userInput.value = '';
  autoSize();
  appendTextMessage(text, 'user');
  setBusy(true);
  appendTyping();
  try {
    const res = await send('chat_send', { message: text });
    removeTyping();
    const last = res.conversation[res.conversation.length - 1];
    if (last?.role === 'assistant') renderAssistantMessage(last.content);
  } catch (e) {
    removeTyping();
    appendTextMessage(e.message, 'error');
    if (e.needsKey) appendOpenSettingsButton();
  } finally {
    setBusy(false);
    userInput.focus();
  }
}

sendBtn.addEventListener('click', sendChat);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
userInput.addEventListener('input', autoSize);

// ───────────────────────── جستجوی سریع فروشگاه‌ها ─────────────────────────
$('btn-quick-search').addEventListener('click', () => {
  const q = $('quick-search-input').value.trim();
  if (!q) return toast('عبارت جستجو را وارد کنید.', 'err');
  appendTextMessage(`جستجوی «${q}» در فروشگاه‌ها:`, 'user');
  appendStoreChips(buildStoreLinks(q));
  $('quick-search-input').value = '';
});

// ───────────────────────── مودال تنظیمات ─────────────────────────
const modal = $('modal-settings');

function fillModelSelect(models, selected) {
  const sel = $('set-model');
  sel.textContent = '';
  const list = (models && models.length) ? models : KNOWN_MODELS.map((m) => ({ id: m.id, label: m.label }));
  for (const m of list) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    sel.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'مدل سفارشی…';
  sel.appendChild(customOpt);

  const known = list.some((m) => m.id === selected);
  sel.value = known ? selected : 'custom';
  const custom = $('set-model-custom');
  custom.hidden = known;
  if (!known) custom.value = selected || '';
}

async function openSettings() {
  modal.hidden = false;
  try {
    const res = await send('get_settings_masked');
    const s = res.settings || {};
    $('set-device').value = s.deviceLabel || 'دستگاه من';
    $('set-days').value = String(s.historyDays || 30);
    $('set-tg-chat').value = (res.secrets?.tgChatId) || '';
    $('set-tg-mask').textContent = res.secrets?.tgTokenMask
      ? `(ذخیره‌شده: ${res.secrets.tgTokenMask})` : '(تنظیم نشده)';
    $('ai-key-state').textContent = res.secrets?.aiKeyMask
      ? `(ذخیره‌شده: ${res.secrets.aiKeyMask})` : '(تنظیم نشده)';
    $('set-ai-key').value = '';
    $('set-tg-token').value = '';
    fillModelSelect(KNOWN_MODELS.map((m) => ({ id: m.id, label: m.label })), s.model);
    applyTheme(s.theme || 'system');
  } catch (e) {
    toast(e.message, 'err');
  }
  renderPrivacyPane();
}

function closeModals() { modal.hidden = true; }

document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', closeModals));
modal.addEventListener('click', (e) => { if (e.target === modal) closeModals(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const pane = $(tab.dataset.tab);
    if (pane) pane.classList.add('active');
  });
});

document.querySelectorAll('[data-theme-set]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setTheme(btn.dataset.themeSet);
    toast(`تم ${THEME_NAMES[btn.dataset.themeSet]} فعال شد`, 'info');
  });
});

document.querySelectorAll('[data-eye]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.eye);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.replaceChildren(svgIcon(show ? 'eye-off' : 'eye'));
    btn.setAttribute('aria-label', show ? 'پنهان کردن مقدار' : 'نمایش مقدار');
  });
});

$('set-model').addEventListener('change', () => {
  const custom = $('set-model-custom');
  custom.hidden = $('set-model').value !== 'custom';
  if (!custom.hidden) custom.focus();
});

function currentModelValue() {
  const sel = $('set-model');
  if (!sel) return '';
  return sel.value === 'custom'
    ? ($('set-model-custom')?.value || '').trim()
    : sel.value;
}

/** ذخیرهٔ یکجای همهٔ تنظیمات (دکمهٔ چسبانِ فوتر مودال) */
$('btn-save-all').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال ذخیره…');
  try {
    const payload = {
      deviceLabel: $('set-device').value.trim() || 'دستگاه من',
      historyDays: $('set-days').value,
      theme: themePref(),
      model: currentModelValue(),
      tgToken: $('set-tg-token').value.trim() || undefined,
      tgChatId: $('set-tg-chat').value.trim() || undefined,
      avalaiKey: $('set-ai-key').value.trim() || undefined,
    };
    if (payload.model === 'custom') payload.model = '';
    const res = await send('save_settings', payload);
    const saved = res.saved || [];
    $('set-ai-key').value = '';
    $('set-tg-token').value = '';
    toast(saved.length ? `تنظیمات ذخیره شد (${saved.length} راز رمزنگاری شد)` : 'تنظیمات ذخیره شد', 'ok');
    await openSettings();
    state = await send('get_state');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-test-ai').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال تست…');
  try {
    const res = await send('test_ai');
    toast(res.via === 'direct' ? 'اتصال به AvalAI برقرار است' : 'اتصال از طریق پروکسی پنل برقرار است', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-fetch-models').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال دریافت…');
  try {
    const res = await send('fetch_models');
    const models = res.models || [];
    fillModelSelect(models, currentModelValue());
    const src = res.source === 'static' ? 'فهرست ایستا (دسترسی به AvalAI نبود)' : 'فهرست زندهٔ AvalAI';
    toast(`${src} — ${models.length} مدل`, models.length ? 'ok' : 'info');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-test-tg').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال ارسال…');
  try {
    await send('test_telegram');
    toast('پیام تست به تلگرام ارسال شد', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-export-json').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال آماده‌سازی…');
  try {
    const { snapshot } = await send('export_snapshot');
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browsing-profile_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('فایل خروجی دانلود شد', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-send-tg-export').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال ارسال…');
  try {
    await send('telegram_send_snapshot');
    toast('خروجی به تلگرام ارسال شد', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-clear-data').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (typeof window.confirm === 'function' && !window.confirm('همه داده‌های ذخیره‌شده (اسنپ‌شات تحلیل و مکالمه) حذف شود؟')) return;
  setLoading(btn, true, 'در حال حذف…');
  try {
    await send('clear_all');
    await send('chat_reset');
    toast('همه داده‌ها حذف شد', 'ok');
    closeModals();
    chatBox.textContent = '';
    showScreen('chat');
    appendHeroCard();
    state = await send('get_state');
    renderSnapshotBar(state);
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-save-passphrase').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const pass = $('set-passphrase').value;
  if (!pass || pass.length < 6) return toast('رمز باید حداقل ۶ کاراکتر باشد.', 'err');
  setLoading(btn, true, 'در حال اعمال…');
  try {
    await send('setup_passphrase', { passphrase: pass });
    $('set-passphrase').value = '';
    toast('قفلِ اختیاری فعال شد', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-disable-passphrase').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال غیرفعال‌سازی…');
  try {
    await send('disable_passphrase');
    toast('قفل غیرفعال شد — مسیر بدون رمز برقرار است', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

function renderPrivacyPane() {
  send('get_state').then((s) => {
    const ps = $('privacy-summary');
    ps.textContent = '';
    const items = [
      [fa(s.snapshotStats?.domains ?? 0), 'دامنهٔ امن ذخیره‌شده'],
      [fa(s.snapshotStats?.searches ?? 0), 'جستجوی پاکسازی‌شده'],
      [fa(s.snapshotStats?.cookies ?? 0), 'کوکی بی‌مقدار'],
      ['۰', 'مقدار حساس ذخیره‌شده'],
    ];
    for (const [v, label] of items) {
      const d = document.createElement('div');
      d.className = 'ps-item';
      d.append(textNode(String(v), 'ps-num'), textNode(label, 'ps-label'));
      ps.appendChild(d);
    }
    $('privacy-list').textContent = '';
    const guarantees = [
      'مقدار کوکی‌ها هرگز جمع‌آوری، ذخیره یا ارسال نمی‌شود (ساخت whitelist).',
      'کوکی‌های HttpOnly (نشست‌های لاگین) به‌کلی حذف می‌شوند.',
      'دامنه‌های بانکی، پیام‌رسان، ایمیل، هویتی و محتوای جنسی حذف می‌شوند.',
      'URL کامل و عنوان صفحات ذخیره نمی‌شوند — فقط دامنه و تعداد بازدید.',
      'جستجوها نرمال و از تکرار پاک می‌شوند؛ عبارات نامناسب حذف می‌گردند.',
      'توکن ربات، شناسه ادمین و کلید AvalAI در همین دستگاه با AES-256-GCM رمزنگاری می‌شوند.',
      'هیچ رازی در لاگ‌ها نوشته نمی‌شود (لاگر خودکار پاک‌کننده دارد).',
      'کلیک روی «موافقم و ادامه» همان اقدام صریح شماست؛ پس از آن، خروجی پاکسازی‌شده پس از هر استخراج به‌طور خودکار به ربات تلگرامِ خودتان فرستاده می‌شود.',
      'اگر کلید AvalAI داخل افزونه قرار گیرد (پیکربندی مالک)، برای نصب‌کنندگان قابل استخراج است — برای انتشار عمومی، پروکسی پنل امن‌تر است.',
    ];
    for (const g of guarantees) {
      const li = document.createElement('li');
      li.textContent = g;
      $('privacy-list').appendChild(li);
    }
  }).catch(() => { /* بی‌صدا — این پن فقط گزارش است */ });
}

$('btn-settings').addEventListener('click', openSettings);
$('btn-retry').addEventListener('click', route);

// ───────────────────────── بازنشانی رمزنگاری ─────────────────────────
$('btn-reset-crypto').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال بازنشانی…');
  try {
    await send('reset_crypto');
    $('crypto-banner').hidden = true;
    toast('رمزنگاری بازنشانی شد. اطلاعات ربات را دوباره در تنظیمات وارد کنید.', 'ok');
    state = await send('get_state');
    if (!state.hasTelegramConfig) openSettings();
    else await route();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

// ───────────────────────── قفلِ اختیاری ─────────────────────────
$('btn-unlock').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const pass = $('unlock-pass').value;
  if (!pass) return toast('رمز را وارد کنید.', 'err');
  setLoading(btn, true, 'در حال باز کردن…');
  try {
    await send('unlock', { passphrase: pass });
    toast('قفل باز شد', 'ok');
    await route();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

$('btn-skip-unlock').addEventListener('click', async () => {
  try {
    state = await send('get_state');
    await enterChat(state);
  } catch (e) {
    toast(e.message, 'err');
  }
});

$('unlock-pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-unlock').click();
});

// ───────────────────────── شروع ─────────────────────────
// فهرست مدل‌ها را همان ابتدا با مقادیر ایستا پر می‌کنیم تا select هرگز خالی
// نماند (دکمهٔ «دریافت فهرست» بعداً آن را از AvalAI به‌روز می‌کند).
fillModelSelect(KNOWN_MODELS.map((m) => ({ id: m.id, label: m.label })), KNOWN_MODELS[0].id);
applyTheme();
document.addEventListener('DOMContentLoaded', route);
route();
