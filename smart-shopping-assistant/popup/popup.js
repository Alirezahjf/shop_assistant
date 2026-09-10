// ============================================================================
// popup.js — کنترلر رابط کاربری افزونه (ES Module)
// ----------------------------------------------------------------------------
// همه عملیات حساس از طریق Service Worker انجام می‌شود؛ popup هیچ رازی را
// نمی‌بیند (فقط ماسک). رندر چت کاملاً DOM-based است (بدون innerHTML از داده).
// ============================================================================

import { buildStoreLinks, storeNameFromLink } from '../lib/stores.js';

// ───────────────────────── ابزارهای پایه ─────────────────────────
const $ = (id) => document.getElementById(id);

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
  t.textContent = msg;
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
    img.textContent = '🛍️';
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
  wrap.style.padding = '0 12px';
  for (const l of links) {
    const a = document.createElement('a');
    a.className = 'chip';
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
    const flag = document.createElement('span');
    flag.className = 'flag';
    flag.textContent = l.region === 'ir' ? '🇮🇷' : '🌍';
    a.appendChild(flag);
    a.appendChild(document.createTextNode(l.name));
    wrap.appendChild(a);
  }
  chatBox.appendChild(wrap);
  scrollBottom();
}

// ───────────────────────── وضعیت و مسیریابی ─────────────────────────
let busy = false;

function setBusy(b) {
  busy = b;
  $('btn-send').disabled = b;
  $('user-input').disabled = b;
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
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

$('btn-finish-setup').addEventListener('click', async () => {
  const pass = $('setup-pass') ? $('setup-pass').value : '';
  const tgToken = $('setup-tg-token').value.trim();
  const tgChat = $('setup-tg-chat').value.trim();

  if (tgToken && !tgChat) return toast('شناسه عددی ادمین را وارد کنید.', 'err');
  if ((tgToken || pass) && pass && pass.length < 6) return toast('رمز رمزنگاری باید حداقل ۶ کاراکتر باشد.', 'err');
  if (tgToken && !pass) return toast('برای رمز شدن اطلاعات ربات، رمز رمزنگاری لازم است.', 'err');

  const btn = $('btn-finish-setup');
  btn.disabled = true;
  btn.textContent = 'در حال ذخیره…';
  try {
    await send('save_settings', {
      passphrase: pass || undefined,
      deviceLabel: $('setup-device').value.trim() || 'دستگاه من',
      tgEnabled: Boolean(tgToken && tgChat),
      tgToken: tgToken || undefined,
      tgChatId: tgChat || undefined,
    });
    try { await send('accept_consent'); } catch { /* noop */ }
    toast('آماده شد ✅', 'ok');
    if (tgToken && tgChat) {
      try { await send('test_telegram'); toast('پیام تست به تلگرام ارسال شد 📨', 'ok'); } catch (e) { toast(`تست تلگرام: ${e.message}`, 'err'); }
    }
    await startFreshAnalysis();
  } catch (e) {
    toast(e.message, 'err');
    btn.disabled = false;
    btn.textContent = 'شروع کنید';
  }
});

// ───────────────────────── باز کردن قفل ─────────────────────────
$('btn-unlock').addEventListener('click', async () => {
  const pass = $('unlock-pass').value;
  if (!pass) return toast('رمز را وارد کنید.', 'err');
  try {
    await send('unlock', { passphrase: pass });
    toast('قفل باز شد 🔓', 'ok');
    await route();
  } catch (e) {
    toast(e.message, 'err');
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
  div.textContent = 'سلام! 👋 من خریدار پرو هستم. برای شناخت سلیقه شما، اول یک تحلیل امن و محلی از مرور اخیرتان انجام می‌دهم (بدون هیچ مقدار کوکی و بدون داده حساس).';
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-sm';
  btn.style.marginTop = '8px';
  btn.textContent = '🚀 شروع تحلیل سلیقه من';
  btn.addEventListener('click', () => startFreshAnalysis());
  div.appendChild(btn);
  chatBox.appendChild(div);
  scrollBottom();
}

async function startFreshAnalysis() {
  if (busy) return;
  setBusy(true);
  chatBox.textContent = '';
  appendTyping();
  setStatus('در حال تحلیل امن…', 'warn');
  try {
    await send('collect');
    const started = await send('chat_start');
    removeTyping();
    chatBox.textContent = '';
    const last = started.conversation[started.conversation.length - 1];
    if (last?.role === 'assistant') renderAssistantMessage(last.content);
    const state = await send('get_state');
    renderSnapshotBar(state);
    setStatus('متصل', 'ok');
  } catch (e) {
    removeTyping();
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
  $('snapshot-summary').textContent =
    `📊 ${s.domains} دامنه • ${s.searches} جستجوی یکتا • ${s.cookies} کوکی بی‌خطر`;
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
  appendTextMessage(`🔍 جستجوی «${q}» در فروشگاه‌ها:`, 'user');
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
    $('set-tg-mask').textContent = res.settings.tgEnabled ? '(تنظیم و رمزنگاری شده ✅)' : '(تنظیم نشده)';
  }).catch((e) => toast(e.message, 'err'));
  renderPrivacyPane();
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

$('btn-save-ai').addEventListener('click', async () => {
  try {
    await send('save_settings', {
      deviceLabel: $('set-device').value.trim(),
      historyDays: $('set-days').value,
    });
    toast('تنظیمات ذخیره شد ✅', 'ok');
    openSettings();
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-save-tg').addEventListener('click', async () => {
  const token = $('set-tg-token').value.trim();
  const chat = $('set-tg-chat').value.trim();
  try {
    await send('save_settings', {
      tgEnabled: $('set-tg-enabled').checked,
      tgToken: token || undefined,
      tgChatId: chat || undefined,
    });
    toast('اطلاعات ربات رمزنگاری و ذخیره شد ✅', 'ok');
    $('set-tg-token').value = '';
    openSettings();
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-test-tg').addEventListener('click', async () => {
  try {
    await send('test_telegram');
    toast('پیام تست ارسال شد 📨', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-export-json').addEventListener('click', async () => {
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
    toast('فایل خروجی دانلود شد ⬇️', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-send-tg-export').addEventListener('click', async () => {
  try {
    await send('telegram_send_snapshot');
    toast('خروجی به تلگرام ارسال شد 📨', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-clear-data').addEventListener('click', async () => {
  if (!confirm('همه داده‌های ذخیره‌شده (اسنپ‌شات تحلیل و مکالمه) حذف شود؟')) return;
  try {
    await send('clear_all');
    await send('chat_reset');
    toast('همه داده‌ها حذف شد 🗑', 'ok');
    closeModals();
    chatBox.textContent = '';
    appendHeroCard();
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-lock').addEventListener('click', async () => {
  try {
    await send('lock');
    toast('رازها قفل شدند 🔒', 'ok');
    closeModals();
    showScreen('unlock');
  } catch (e) { toast(e.message, 'err'); }
});

function renderPrivacyPane() {
  send('get_state').then((state) => {
    const ps = $('privacy-summary');
    ps.textContent = '';
    const items = [
      [state.snapshotStats?.domains ?? 0, 'دامنه امن ذخیره‌شده'],
      [state.snapshotStats?.searches ?? 0, 'جستجوی پاکسازی‌شده'],
      [state.snapshotStats?.cookies ?? 0, 'کوکی بی‌مقدار'],
      ['۰', 'مقدار حساس ذخیره‌شده'],
    ];
    for (const [v, label] of items) {
      const d = document.createElement('div');
      d.className = 'ps-item';
      const b = document.createElement('b');
      b.textContent = String(v);
      const s = document.createElement('span');
      s.textContent = label;
      d.append(b, s);
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
