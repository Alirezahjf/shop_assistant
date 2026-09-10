// ============================================================================
// popup.js — کنترلر رابط کاربری افزونه (ES Module)
// ----------------------------------------------------------------------------
// همه عملیات حساس از طریق Service Worker انجام می‌شود؛ popup هیچ رازی را
// نمی‌بیند (فقط ماسک). رندر چت کاملاً DOM-based است (بدون innerHTML از داده).
// ============================================================================

import { buildStoreLinks, storeNameFromLink } from '../lib/stores.js';

// ───────────────────────── ابزارهای پایه ─────────────────────────
const $ = (id) => document.getElementById(id);

const NS = 'http://www.w3.org/2000/svg';

/**
 * آیکون‌های خطی (stroke 1.8) هم‌خانواده با پنل مدیریت.
 * همه با DOM ساخته می‌شوند؛ هیچ رشته‌ای به innerHTML داده نمی‌شود.
 */
const ICON_PATHS = {
  check: ['M4.5 12.5l5 5 10-11'],
  'check-circle': ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M8.2 12.4l2.6 2.6 5-5.4'],
  'x-circle': ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M9.3 9.3l5.4 5.4', 'M14.7 9.3l-5.4 5.4'],
  alert: ['M12 4.5l8.5 15h-17z', 'M12 10v4', 'M12 17h.01'],
  info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 11v5.5', 'M12 7.8h.01'],
  bag: ['M6 7h12l1.2 13.2a1 1 0 0 1-1 1.1H5.8a1 1 0 0 1-1-1.1L6 7z', 'M9 10V6a3 3 0 0 1 6 0v4'],
  globe: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M3.5 12h17',
    'M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z'],
  'map-pin': ['M12 20.5c4.5-4.3 6.5-7.5 6.5-10.2A6.5 6.5 0 0 0 5.5 10.3c0 2.7 2 5.9 6.5 10.2z',
    'M12 8.2h.01'],
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

/** عدد فارسی برای نمایش (منطق/داده دست‌نخورده می‌ماند) */
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

// ───────────────────────── تم (روشن/تیره/سیستم) ─────────────────────────
const THEME_KEY = 'kharidar-theme';
const THEME_NAMES = { light: 'روشن', dark: 'تیره', system: 'سیستم' };
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

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


const screens = {
  welcome: $('screen-welcome'),
  setup: $('screen-setup'),
  unlock: $('screen-unlock'),
  chat: $('screen-chat'),
  error: $('screen-error'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => { el.hidden = k !== name; });
  $('main-actions').hidden = name !== 'chat';
  setMainActionsVisible(name === 'chat');
}

function setMainActionsVisible(v) { $('main-actions').hidden = !v; }

function setStatus(text, kind = '') {
  $('status-text').textContent = text;
  const dot = document.querySelector('#status-line .dot');
  dot.className = `dot ${kind}`;
}

let toastTimer;
function toast(msg, kind = '') {
  const t = $('toast');
  const icon = kind === 'ok' ? 'check-circle' : kind === 'err' ? 'x-circle' : 'info';
  t.replaceChildren(svgIcon(icon), textNode(msg));
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

async function send(action, payload = {}) {
  const res = await chrome.runtime.sendMessage({ action, ...payload });
  if (!res) throw new Error('ارتباط با سرویس افزونه قطع شد. پنجره را دوباره باز کنید.');
  if (!res.ok) throw new Error(res.error || 'خطای ناشناخته');
  return res;
}

// ───────────────────────── رندر امن چت ─────────────────────────
const chatBox = $('chat-box');

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

/** رندر امن متن + لینک (بدون innerHTML) */
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

function scrollBottom() { chatBox.scrollTop = chatBox.scrollHeight; }

// ─────────── پروتکل [PRODUCT] و [SHOPS] ───────────
function renderAssistantMessage(rawText) {
  const productRe = /\[PRODUCT\]([\s\S]*?)\[\/PRODUCT\]/g;
  const shopsRe = /\[SHOPS\]([\s\S]*?)\[\/SHOPS\]/g;
  const withoutProducts = rawText
    .replace(productRe, '')
    .replace(shopsRe, '')
    .trim();

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
      const data = JSON.parse(m[1].trim());
      appendProductCard(data);
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
  if (imageUrl) {
    img.style.backgroundImage = `url("${imageUrl.replace(/"/g, '%22')}")`;
  } else {
    img.appendChild(svgIcon('bag'));
  }

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

// ───────────────────────── وضعیت و مسیریابی ─────────────────────────
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

function showError(msg) {
  $('error-msg').textContent = msg;
  showScreen('error');
}

async function route() {
  try {
    const state = await send('get_state');
    if (!state.consent) { showScreen('welcome'); return; }
    if (!state.setupDone) { initSetupScreen(); showScreen('setup'); return; }
    if (state.hasSealedSecrets && !state.unlocked) {
      // قفل بسته است اما می‌توان بدون آن چت کرد؛ فقط عملیات تلگرام رمز می‌خواهد
      showScreen('unlock');
      $('unlock-pass').focus();
      return;
    }
    await enterChat(state);
  } catch (e) {
    showError(e.message);
  }
}

// ───────────────────────── خوش‌آمد / رضایت ─────────────────────────
$('consent-check').addEventListener('change', (e) => {
  $('btn-accept-consent').disabled = !e.target.checked;
});
$('btn-accept-consent').addEventListener('click', async () => {
  try {
    await send('accept_consent');
    initSetupScreen();
    showScreen('setup');
  } catch (e) { toast(e.message, 'err'); }
});

function initSetupScreen() { /* تنظیم سریع: فیلد ثابت است */ }

document.querySelectorAll('[data-eye]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.eye);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.replaceChildren(svgIcon(show ? 'eye-off' : 'eye'));
    btn.setAttribute('aria-label', show ? 'پنهان کردن رمز' : 'نمایش رمز');
  });
});

// کلید تم: روشن / تیره / سیستم — با ذخیره‌سازی و هم‌گام با تنظیمات سیستم
document.querySelectorAll('[data-theme-set]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setTheme(btn.dataset.themeSet);
    toast(`تم ${THEME_NAMES[btn.dataset.themeSet]} فعال شد`, 'info');
  });
});
applyTheme();

$('btn-finish-setup').addEventListener('click', async () => {
  const pass = $('setup-pass') ? $('setup-pass').value : '';
  const tgToken = $('setup-tg-token').value.trim();
  const tgChat = $('setup-tg-chat').value.trim();

  if (tgToken && !tgChat) return toast('شناسه عددی ادمین را وارد کنید.', 'err');
  if ((tgToken || pass) && pass && pass.length < 6) return toast('رمز رمزنگاری باید حداقل ۶ کاراکتر باشد.', 'err');
  if (tgToken && !pass) return toast('برای رمز شدن اطلاعات ربات، رمز رمزنگاری لازم است.', 'err');

  const btn = $('btn-finish-setup');
  setLoading(btn, true, 'در حال ذخیره…');
  try {
    await send('save_settings', {
      passphrase: pass || undefined,
      deviceLabel: $('setup-device').value.trim() || 'دستگاه من',
      tgEnabled: Boolean(tgToken && tgChat),
      tgToken: tgToken || undefined,
      tgChatId: tgChat || undefined,
    });
    try { await send('accept_consent'); } catch { /* noop */ }
    toast('آماده شد', 'ok');
    if (tgToken && tgChat) {
      try { await send('test_telegram'); toast('پیام تست به تلگرام ارسال شد', 'ok'); } catch (e) { toast(`تست تلگرام: ${e.message}`, 'err'); }
    }
    // پس از پیکربندی باید وارد صفحهٔ گفتگو شویم (وگرنه کاربر روی همان تنظیم می‌ماند)
    showScreen('chat');
    await startFreshAnalysis();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

// ───────────────────────── باز کردن قفل ─────────────────────────
$('btn-unlock').addEventListener('click', async () => {
  const pass = $('unlock-pass').value;
  if (!pass) return toast('رمز را وارد کنید.', 'err');
  const btn = $('btn-unlock');
  setLoading(btn, true, 'در حال باز کردن…');
  try {
    await send('unlock', { passphrase: pass });
    toast('قفل باز شد', 'ok');
    await route();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    setLoading(btn, false);
  }
});

// رد کردن: چت نیازی به قفل ندارد (قفل فقط برای رازهای تلگرام است)
const skipBtn = document.createElement('button');
skipBtn.className = 'btn btn-ghost btn-block';
skipBtn.textContent = 'فعلاً نه — فقط چت';
skipBtn.addEventListener('click', async () => {
  const state = await send('get_state');
  await enterChat(state);
});
$('screen-unlock').appendChild(skipBtn);
$('unlock-pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-unlock').click();
});

// ───────────────────────── چت ─────────────────────────
async function enterChat(state) {
  showScreen('chat');
  setStatus('متصل', 'ok');
  renderSnapshotBar(state);

  const conversation = state.chatLength > 0 ? (await send('get_chat')).conversation : null;
  if (conversation && conversation.length > 0) {
    chatBox.textContent = '';
    for (const msg of conversation) {
      if (msg.role === 'user') appendTextMessage(msg.content, 'user');
      else if (msg.role === 'assistant') renderAssistantMessage(msg.content);
    }
    return;
  }

  if (!state.hasSnapshot) {
    appendHeroCard();
  } else {
    await startFreshAnalysis();
  }
}

function appendHeroCard() {
  const div = document.createElement('div');
  div.className = 'message msg-ai';
  div.textContent = 'سلام! من خریدار پرو هستم. برای شناخت سلیقهٔ شما، اول یک تحلیل امن و محلی از مرور اخیرتان انجام می‌دهم — بدون هیچ مقدار کوکی و بدون داده حساس.';
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-sm';
  btn.appendChild(svgIcon('sparkles'));
  btn.appendChild(textNode('شروع تحلیل سلیقهٔ من'));
  btn.addEventListener('click', () => startFreshAnalysis());
  div.appendChild(btn);
  chatBox.appendChild(div);
  scrollBottom();
}

// ─────────── حالت بارگذاری تحلیل (مرحله‌ای، متن واقعی) ───────────
const LOADER_STEPS = [
  { icon: 'database', label: 'خواندن تاریخچهٔ مرور و کوکی‌های امن' },
  { icon: 'shield', label: 'حذف دامنه‌ها و عبارت‌های حساس' },
  { icon: 'cpu', label: 'دسته‌بندی محلی — بدون مصرف توکن' },
];

function markLoaderSteps(active) {
  document.querySelectorAll('#chat-loader .cl-step').forEach((row, i) => {
    row.classList.toggle('is-done', i < active);
    row.classList.toggle('is-active', i === active);
  });
}

function appendLoader() {
  const box = document.createElement('div');
  box.className = 'chat-loader';
  box.id = 'chat-loader';

  const title = document.createElement('div');
  title.className = 'chat-loader__title';
  const sp = document.createElement('span');
  sp.className = 'spinner';
  title.append(sp, textNode('تحلیل امن در حال اجراست…'));
  box.appendChild(title);

  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton sk-line sk-line--lg sk-line--w60';
  box.appendChild(skeleton);

  const steps = document.createElement('div');
  steps.className = 'chat-loader__steps';
  LOADER_STEPS.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = `cl-step${i === 0 ? ' is-active' : ''}`;
    const mark = document.createElement('span');
    mark.className = 'cl-step__mark';
    mark.appendChild(svgIcon(s.icon));
    row.append(mark, textNode(s.label));
    steps.appendChild(row);
  });
  box.appendChild(steps);

  chatBox.appendChild(box);
  scrollBottom();

  const timers = [setTimeout(() => markLoaderSteps(1), 1100), setTimeout(() => markLoaderSteps(2), 2400)];
  return () => timers.forEach(clearTimeout);
}

function removeLoader() { $('chat-loader')?.remove(); }

async function startFreshAnalysis() {
  if (busy) return;
  setBusy(true);
  chatBox.textContent = '';
  const stopLoader = appendLoader();
  setStatus('در حال تحلیل امن…', 'warn');
  try {
    await send('collect');
    const started = await send('chat_start');
    removeLoader();
    chatBox.textContent = '';
    const last = started.conversation[started.conversation.length - 1];
    if (last?.role === 'assistant') renderAssistantMessage(last.content);
    const state = await send('get_state');
    renderSnapshotBar(state);
    setStatus('متصل', 'ok');
  } catch (e) {
    stopLoader();
    removeLoader();
    appendTextMessage(`خطا: ${e.message}`, 'error');
    setStatus('خطا', 'err');
  } finally {
    setBusy(false);
  }
}

function renderSnapshotBar(state) {
  const bar = $('snapshot-bar');
  if (!state.hasSnapshot || !state.snapshotStats) { bar.hidden = true; return; }
  const s = state.snapshotStats;
  const wrap = $('snapshot-summary');
  const parts = [
    ['globe', `${fa(s.domains)} دامنه`],
    ['search', `${fa(s.searches)} جستجو`],
    ['shield', `${fa(s.cookies)} کوکی بی‌مقدار`],
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

$('btn-recollect').addEventListener('click', () => startFreshAnalysis());
$('btn-new-chat').addEventListener('click', async () => {
  try {
    await send('chat_reset');
    await startFreshAnalysis();
  } catch (e) { toast(e.message, 'err'); }
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
  } finally {
    setBusy(false);
    userInput.focus();
  }
}

$('btn-send').addEventListener('click', sendChat);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
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

function openSettings() {
  send('get_settings_masked').then((res) => {
    $('set-device').value = res.settings.deviceLabel;
    $('set-days').value = String(res.settings.historyDays);
    $('set-tg-enabled').checked = Boolean(res.settings.tgEnabled);
    $('set-tg-mask').textContent = res.settings.tgEnabled ? '(تنظیم و رمزنگاری‌شده)' : '(تنظیم نشده)';
  }).catch((e) => toast(e.message, 'err'));
  renderPrivacyPane();
  applyTheme();
  modal.hidden = false;
}

function closeModals() {
  modal.hidden = true;
}

document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', closeModals));
modal.addEventListener('click', (e) => { if (e.target === modal) closeModals(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(tab.dataset.tab).classList.add('active');
  });
});

$('btn-save-ai').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'ذخیره…');
  try {
    await send('save_settings', {
      deviceLabel: $('set-device').value.trim(),
      historyDays: $('set-days').value,
    });
    toast('تنظیمات ذخیره شد', 'ok');
    openSettings();
  } catch (err) { toast(err.message, 'err'); }
  finally { setLoading(btn, false); }
});

$('btn-save-tg').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const token = $('set-tg-token').value.trim();
  const chat = $('set-tg-chat').value.trim();
  setLoading(btn, true, 'ذخیره…');
  try {
    await send('save_settings', {
      tgEnabled: $('set-tg-enabled').checked,
      tgToken: token || undefined,
      tgChatId: chat || undefined,
    });
    toast('اطلاعات ربات رمزنگاری و ذخیره شد', 'ok');
    $('set-tg-token').value = '';
    openSettings();
  } catch (err) { toast(err.message, 'err'); }
  finally { setLoading(btn, false); }
});

$('btn-test-tg').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال ارسال…');
  try {
    await send('test_telegram');
    toast('پیام تست ارسال شد', 'ok');
  } catch (err) { toast(err.message, 'err'); }
  finally { setLoading(btn, false); }
});

$('btn-export-json').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال آماده‌سازی…');
  try {
    const { snapshot } = await send('export_snapshot');
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `browsing-profile_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('فایل خروجی دانلود شد', 'ok');
  } catch (err) { toast(err.message, 'err'); }
  finally { setLoading(btn, false); }
});

$('btn-send-tg-export').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال ارسال…');
  try {
    await send('telegram_send_snapshot');
    toast('خروجی به تلگرام ارسال شد', 'ok');
  } catch (err) { toast(err.message, 'err'); }
  finally { setLoading(btn, false); }
});

$('btn-clear-data').addEventListener('click', async (e) => {
  if (!confirm('همه داده‌های ذخیره‌شده (اسنپ‌شات تحلیل و مکالمه) حذف شود؟')) return;
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال حذف…');
  try {
    await send('clear_all');
    await send('chat_reset');
    toast('همه داده‌ها حذف شد', 'ok');
    closeModals();
    chatBox.textContent = '';
    appendHeroCard();
  } catch (err) { toast(err.message, 'err'); }
  finally { setLoading(btn, false); }
});

$('btn-lock').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'در حال قفل…');
  try {
    await send('lock');
    toast('رازها قفل شدند', 'ok');
    closeModals();
    showScreen('unlock');
  } catch (err) { toast(err.message, 'err'); }
  finally { setLoading(btn, false); }
});

function renderPrivacyPane() {
  send('get_state').then((state) => {
    const ps = $('privacy-summary');
    ps.textContent = '';
    const items = [
      [fa(state.snapshotStats?.domains ?? 0), 'دامنهٔ امن ذخیره‌شده'],
      [fa(state.snapshotStats?.searches ?? 0), 'جستجوی پاکسازی‌شده'],
      [fa(state.snapshotStats?.cookies ?? 0), 'کوکی بی‌مقدار'],
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
      'کلید AvalAI، توکن ربات و شناسه ادمین با AES-256-GCM رمزنگاری می‌شوند.',
      'هیچ رازی در لاگ‌ها نوشته نمی‌شود (لاگر خودکار پاک‌کننده دارد).',
    ];
    for (const g of guarantees) {
      const li = document.createElement('li');
      li.textContent = g;
      $('privacy-list').appendChild(li);
    }
  }).catch(() => {});
}

$('btn-settings').addEventListener('click', openSettings);
$('btn-retry').addEventListener('click', route);

// ───────────────────────── شروع ─────────────────────────
document.addEventListener('DOMContentLoaded', route);
route();
