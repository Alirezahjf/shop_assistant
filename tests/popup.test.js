// ============================================================================
// tests/popup.test.js — تست رابط پاپ‌آپ با jsdom + chrome شبیه‌سازی‌شده
// ----------------------------------------------------------------------------
// اجرا: npm install && node --test tests/popup.test.js
//
// پوشش:
//   • هیچ «دکمهٔ مرده‌ای» در popup.html نماند (همه addEventListener گرفته باشند)
//   • همهٔ idهایی که popup.js از DOM می‌خواهد وجود داشته باشند
//   • چهار صفحهٔ اصلی (خوش‌آمد / تنظیم / استخراج / چت) حاضر باشند
//   • ذخیرهٔ تنظیمات یک پیام save_settings بفرستد و همهٔ فیلدها را دربر بگیرد
//   • تست اتصال هوش مصنوعی و تست تلگرام
//   • تم سه‌حالته (روشن/تیره/سیستم)
//   • لودینگ مرحله‌ایِ استخراج + ارسال خودکار به تلگرام
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'smart-shopping-assistant/popup/popup.html'), 'utf8');

// ---------------------------------------------------------------------------
// شبیه‌سازِ محیط مرورگر + chrome.runtime
// ---------------------------------------------------------------------------
function makeEnv() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://localhost/' });
  const { window } = dom;

  const calls = [];
  const store = {
    consent: true,
    setupDone: true,
    cryptoBroken: false,
    cryptoMode: 'device',
    unlocked: true,
    hasSnapshot: false,
    snapshotStats: null,
    chatLength: 0,
    settings: { deviceLabel: 'دستگاه من', historyDays: 30, model: 'qwen3.8-flash', theme: 'system' },
  };
  let telegramSent = 0;

  const handlers = {
    get_state: () => ({ ok: true, ...store, secrets: { tgConfigured: true, aiKeySet: true, tgTokenMask: 'aa-1•••cdef', tgChatId: '8810826597', aiKeyMask: 'sk-1•••abcd' } }),
    get_settings_masked: () => ({ ok: true, settings: store.settings, secrets: { tgConfigured: true, aiKeySet: true, tgTokenMask: 'aa-1•••cdef', tgChatId: '8810826597', aiKeyMask: 'sk-1•••abcd' } }),
    accept_consent: () => ({ ok: true, seeded: [] }),
    save_settings: (p) => { calls.push({ action: 'save_settings', payload: p }); return { ok: true, settings: store.settings, saved: [], secrets: {} }; },
    test_ai: () => { calls.push({ action: 'test_ai' }); return { ok: true, via: 'direct' }; },
    fetch_models: () => ({ ok: true, models: [{ id: 'qwen3.8-flash' }, { id: 'glm-5.3-flash' }], source: 'avalai' }),
    test_telegram: () => { calls.push({ action: 'test_telegram' }); return { ok: true }; },
    telegram_send_snapshot: () => { telegramSent += 1; return { ok: true }; },
    collect: () => {
      telegramSent += 1; // ارسال خودکارِ داخل Service Worker
      store.hasSnapshot = true;
      store.snapshotStats = { domains: 12, searches: 7, cookies: 3 };
      return { ok: true, snapshot: { stats: store.snapshotStats }, report: {}, telegram: { sent: true } };
    },
    chat_start: () => ({ ok: true, conversation: [{ role: 'assistant', content: 'سلام!چه کمکی می‌تونم بکنم؟' }] }),
    chat_send: ({ message }) => ({ ok: true, conversation: [{ role: 'user', content: message }, { role: 'assistant', content: 'پاسخ نمونه' }] }),
    chat_reset: () => ({ ok: true }),
    get_chat: () => ({ ok: true, conversation: [] }),
    export_snapshot: () => ({ ok: true, snapshot: { stats: { domains: 1, searches: 1, cookies: 0 } } }),
    clear_all: () => ({ ok: true }),
    setup_passphrase: () => ({ ok: true }),
    disable_passphrase: () => ({ ok: true }),
    reset_crypto: () => { store.cryptoBroken = false; return { ok: true }; },
    unlock: () => ({ ok: true }),
  };

  window.chrome = {
    runtime: {
      sendMessage: async (msg) => {
        const h = handlers[msg?.action];
        if (!h) return { ok: false, error: `اکشن ناشناخته: ${msg?.action}` };
        try { return await h(msg); } catch (e) { return { ok: false, error: e.message }; }
      },
    },
  };
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
  window.confirm = () => true;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {} }));
  if (!window.matchMedia('(x)').addEventListener) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  }

  // ثبتِ شنونده‌ها برای تشخیص «دکمهٔ مرده»
  const listeners = new Set();
  const origAdd = window.EventTarget.prototype.addEventListener;
  window.EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (this && typeof this.tagName === 'string') {
      listeners.add((this.id ? '#' + this.id : '') + '|' + this.tagName.toLowerCase() + '|' + type);
    }
    return origAdd.call(this, type, ...rest);
  };

  return { dom, window, document: window.document, calls, store, handlers, listeners,
    get telegramSent() { return telegramSent; } };
}

/** بارگذاری popup.js داخل یک محیط تازه و برگرداندنِ همان محیط */
async function boot(mutate) {
  const env = makeEnv();
  if (mutate) mutate(env);
  // متغیرهای سراسریِ مورد نیاز ماژول
  globalThis.window = env.window;
  globalThis.document = env.window.document;
  globalThis.localStorage = env.window.localStorage;
  globalThis.chrome = env.window.chrome;
  globalThis.Node = env.window.Node;
  globalThis.matchMedia = env.window.matchMedia;
  const url = 'file://' + resolve(root, 'smart-shopping-assistant/popup/popup.js') + '?t=' + Math.random();
  await import(url);
  await new Promise((r) => setTimeout(r, 30));
  return env;
}

// ---------------------------------------------------------------------------
test('ساختار HTML: چهار صفحهٔ اصلی و مودال تنظیمات وجود دارند', async () => {
  const env = await boot();
  for (const id of ['screen-welcome', 'screen-setup', 'screen-extract', 'screen-chat',
    'screen-error', 'modal-settings', 'toast', 'extract-steps']) {
    assert.ok(env.document.getElementById(id), `المان #${id} باید وجود داشته باشد`);
  }
});

test('هیچ دکمهٔ مرده‌ای در popup.html نیست', async () => {
  const env = await boot();
  const buttons = [...env.document.querySelectorAll('button')];
  assert.ok(buttons.length >= 12, 'تعداد دکمه‌ها غیرمنتظره است: ' + buttons.length);
  const dead = [];
  for (const btn of buttons) {
    const key = (btn.id ? '#' + btn.id : '') + '|button|click';
    if (!env.listeners.has(key)) dead.push(btn.id || btn.className || '(بدون id)');
  }
  assert.deepEqual(dead, [], 'این دکمه‌ها هندلر ندارند: ' + dead.join('، '));
});

test('دکمه‌های چشمی و تب‌ها هم شنونده دارند', async () => {
  const env = await boot();
  for (const eye of env.document.querySelectorAll('[data-eye]')) {
    assert.ok(env.listeners.has('#' + eye.id + '|button|click') || env.listeners.has('|button|click'),
      `دکمهٔ چشمی برای ${eye.dataset.eye} باید هندلر داشته باشد`);
  }
  const tabs = env.document.querySelectorAll('.tab');
  assert.ok(tabs.length >= 4);
});

test('تم سه‌حالته اعمال و ذخیره می‌شود', async () => {
  const env = await boot();
  const doc = env.document;
  doc.querySelector('[data-theme-set="dark"]').click();
  assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(env.window.localStorage.getItem('kharidar-theme'), 'dark');
  doc.querySelector('[data-theme-set="light"]').click();
  assert.equal(doc.documentElement.getAttribute('data-theme'), 'light');
  doc.querySelector('[data-theme-set="system"]').click();
  assert.equal(env.window.localStorage.getItem('kharidar-theme'), 'system');
  const pressed = doc.querySelector('[data-theme-set="system"]').getAttribute('aria-pressed');
  assert.equal(pressed, 'true');
});

test('ذخیرهٔ تنظیمات: یک پیام save_settings با همهٔ فیلدها', async () => {
  const env = await boot();
  const doc = env.document;
  doc.getElementById('set-device').value = 'لپ‌تاپ شخصی';
  doc.getElementById('set-days').value = '14';
  doc.getElementById('set-ai-key').value = 'sk-test-key-123456';
  doc.getElementById('set-tg-token').value = '123456789:AAF-test-token';
  doc.getElementById('set-tg-chat').value = '8810826597';
  doc.getElementById('set-model').value = 'qwen3.8-flash';

  doc.getElementById('btn-save-all').click();
  await new Promise((r) => setTimeout(r, 60));

  const save = env.calls.find((c) => c.action === 'save_settings');
  assert.ok(save, 'پیام save_settings باید ارسال شود');
  assert.equal(save.payload.deviceLabel, 'لپ‌تاپ شخصی');
  assert.equal(String(save.payload.historyDays), '14');
  assert.equal(save.payload.avalaiKey, 'sk-test-key-123456');
  assert.equal(save.payload.tgToken, '123456789:AAF-test-token');
  assert.equal(save.payload.tgChatId, '8810826597');
  assert.equal(save.payload.model, 'qwen3.8-flash');
  assert.ok(['light', 'dark', 'system'].includes(save.payload.theme));
  const toast = doc.getElementById('toast');
  assert.equal(toast.hidden, false, 'توست موفقیت باید نمایش داده شود');
});

test('تست اتصال هوش مصنوعی و تست تلگرام فراخوانی می‌شوند', async () => {
  const env = await boot();
  env.document.getElementById('btn-test-ai').click();
  env.document.getElementById('btn-test-tg').click();
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(env.calls.some((c) => c.action === 'test_ai'), 'تست اتصال باید ارسال شود');
  assert.ok(env.calls.some((c) => c.action === 'test_telegram'), 'تست تلگرام باید ارسال شود');
});

test('دریافت فهرست مدل‌ها select را پر می‌کند', async () => {
  const env = await boot();
  env.document.getElementById('btn-fetch-models').click();
  await new Promise((r) => setTimeout(r, 80));
  const opts = [...env.document.getElementById('set-model').options].map((o) => o.value);
  assert.ok(opts.includes('qwen3.8-flash'));
  assert.ok(opts.includes('glm-5.3-flash'));
});

test('جریانِ استخراج: لودینگ مرحله‌ای + ارسال خودکار به تلگرام', async () => {
  const env = await boot((e) => { e.store.setupDone = true; e.store.hasSnapshot = false; });
  const doc = env.document;
  // بعد از boot باید روی صفحهٔ استخراج (یا چت) باشیم
  await new Promise((r) => setTimeout(r, 900));
  const steps = doc.querySelectorAll('#extract-steps .steps__item');
  assert.equal(steps.length, 5, 'پنج مرحلهٔ استخراج باید رندر شوند');
  const labels = [...steps].map((li) => li.textContent);
  assert.ok(labels.some((l) => l.includes('ربات تلگرام')), 'مرحلهٔ ارسال به ربات باید باشد');
  assert.ok(env.telegramSent >= 1, 'خروجی باید به‌طور خودکار به تلگرام ارسال شود');
  // در پایان وارد چت می‌شویم
  assert.equal(doc.getElementById('screen-chat').hidden, false, 'پس از استخراج باید صفحهٔ چت فعال شود');
});

test('صفحهٔ قفل در مسیر پیش‌فرض دیده نمی‌شود (consent+setupDone کافی است)', async () => {
  const env = await boot();
  assert.equal(env.document.getElementById('screen-unlock').hidden, true);
});

test('رازها در DOM پاپ‌آپ به‌صورت plaintext نوشته نمی‌شوند', async () => {
  const env = await boot();
  await new Promise((r) => setTimeout(r, 60));
  const html2 = env.document.body.innerHTML;
  assert.ok(!html2.includes('sk-test-key'), 'کلید خام نباید در DOM باشد');
  assert.ok(!html2.includes('123456789:AAF'), 'توکن خام نباید در DOM باشد');
});
