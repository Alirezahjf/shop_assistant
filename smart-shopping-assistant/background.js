// ============================================================================
// background.js — Service Worker (MV3, ES Module)
// ----------------------------------------------------------------------------
// مسئولیت‌ها: مسیریابی پیام‌ها، جمع‌آوری+پاکسازی، مدیریت رازهای رمزنگاری‌شده،
// گفتگو با AvalAI، ساخت خروجی/ارسال تلگرام. هیچ state حیاتی در حافظه نگه
// نداریم — همه‌چیز در chrome.storage (رفع باگ مرگ Service Worker).
// ============================================================================

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './lib/constants.js';
import { secureLog } from './lib/log.js';
import {
  setupMasterPassphrase, unlockWithPassphrase, getUnlockedKey,
  sealWithUnlockedKey, unsealWithUnlockedKey, invalidateUnlockedKey, maskSecret,
} from './lib/crypto.js';
import { collectAndSanitize, getStoredSnapshot, clearAllData } from './lib/collect.js';
import { chatCompletion, testConnection, listModels } from './lib/ai.js';
import { saveTelegramConfig, sendSnapshotToTelegram, testTelegram, hasTelegramConfig } from './lib/telegram.js';
import { categoryStats, CATEGORY_LABELS } from './lib/taxonomy-lite.js';

// ---------------------------------------------------------------------------
// State مکالمه — در storage.session (باقی‌مانده تا بستن مرورگر، مقاوم به مرگ SW)
// ---------------------------------------------------------------------------
const CHAT_LIMIT = 24;

async function loadConversation() {
  const { [STORAGE_KEYS.chat]: chat } = await chrome.storage.session.get(STORAGE_KEYS.chat);
  return Array.isArray(chat) ? chat : [];
}
async function saveConversation(messages) {
  const trimmed = messages.slice(-CHAT_LIMIT);
  await chrome.storage.session.set({ [STORAGE_KEYS.chat]: trimmed });
  return trimmed;
}

// ---------------------------------------------------------------------------
// تنظیمات
// ---------------------------------------------------------------------------
async function getSettings() {
  const { [STORAGE_KEYS.settings]: settings } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
async function setSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

// ---------------------------------------------------------------------------
// پرامپت سیستم دستیار خرید (فارسی) + پروتکل محصول
// ---------------------------------------------------------------------------
function buildSystemPrompt(snapshot, settings) {
  let contextLine = 'داده‌ای از کاربر موجود نیست — صمیمی سلام کن و بپرس دنبال چه چیزی هستی.';
  if (snapshot) {
    const cats = categoryStats(snapshot.domains).slice(0, 6)
      .map((c) => `${CATEGORY_LABELS[c.category] || c.category} (${c.visits} بازدید)`).join('، ');
    const topDomains = snapshot.domains.slice(0, 8).map((d) => d.domain).join('، ');
    const topSearches = snapshot.searches.slice(0, 8).map((s) => s.term).join('، ');
    contextLine = `دامنه‌های پربازدید: ${topDomains || '—'}\nعلاقه‌مندی‌های دسته‌ای: ${cats || '—'}\nجستجوهای اخیر: ${topSearches || '—'}`;
  }
  return [
    'شما «خریدار پرو» هستی؛ دستیار خرید صمیمی، حرفه‌ای و دقیقاً فارسی‌زبان.',
    'اهداف: درک نیاز کاربر، پیشنهاد هوشمندانه محصول، و راهنمایی برای بهترین خرید.',
    '',
    'قواعد پاسخ:',
    '1) مکالمه گرم و کوتاه نگه دار؛ از واژه‌های تخصصی خرید استفاده کن.',
    '2) هر وقت محصول پیشنهاد می‌کنی، هر محصول را دقیقاً در این قالب بده:',
    '   [PRODUCT]{"name":"نام محصول","summary":"توضیح یک‌دو جمله‌ای","link":"https://لینک معتبر محصول","image":"https://لینک تصویر اختیاری","price":"قیمت تقریبی اختیاری"}[/PRODUCT]',
    '   لینک فقط به فروشگاه‌های معتبر (دیجی‌کالا، ترب، تکنولایف، باسلام، آمازون، علی‌اکسپرس، ای‌بی) باشد و حتماً https.',
    '3) هر وقت کاربر دنبال خرید چیزی است و لازم شد جستجوی گسترده کند، یک خط اضافه کن:',
    '   [SHOPS]{"query":"عبارت جستجوی مناسب"}[/SHOPS]',
    '4) از درخواست یا تکرار هیچ داده حساس (رمز، کارت بانکی، نشست) خودداری کن.',
    '5) اگر سؤال کاملاً بی‌ربط به خرید بود، مؤدبانه پاسخ کوتاه بده و به موضوع خرید برگرد.',
    '',
    `تحلیل پاکسازی‌شده رفتار کاربر (دستگاه: ${settings.deviceLabel}):`,
    contextLine,
    'نکته: این داده‌ها فقط «دامنه و شمارش» هستند؛ هیچ مقدار کوکی یا URL شخصی در دسترس تو نیست.',
  ].join('\n');
}

async function buildInitialMessages() {
  const settings = await getSettings();
  const snapshot = await getStoredSnapshot();
  const system = buildSystemPrompt(snapshot, settings);
  return [
    { role: 'system', content: system },
    { role: 'user', content: 'سلام! تحلیل من رو شروع کن و بدون پیشنهاد محصول، گرم با من صحبت کن و بپرس دنبال چه چیزی هستم.' },
  ];
}

async function requireAiKey() {
  const { [STORAGE_KEYS.sealedAiKey]: sealed } = await chrome.storage.local.get(STORAGE_KEYS.sealedAiKey);
  if (!sealed) throw new Error('کلید AvalAI تنظیم نشده است. از ⚙️ تنظیمات واردش کنید.');
  const key = await unsealWithUnlockedKey(sealed);
  if (!key) throw new Error('قفل رمزنگاری بسته است. رمز رمزنگاری را وارد کنید.');
  return key;
}

// ---------------------------------------------------------------------------
// مسیریابی پیام‌ها
// ---------------------------------------------------------------------------
const handlers = {
  async get_state() {
    const settings = await getSettings();
    const { [STORAGE_KEYS.sealedAiKey]: hasKey } = await chrome.storage.local.get(STORAGE_KEYS.sealedAiKey);
    const { [STORAGE_KEYS.consent]: consent } = await chrome.storage.local.get(STORAGE_KEYS.consent);
    const snapshot = await getStoredSnapshot();
    const conversation = await loadConversation();
    const unlocked = Boolean(await getUnlockedKey());
    return {
      ok: true,
      consent: Boolean(consent),
      hasAiKey: Boolean(hasKey),
      unlocked,
      settings: {
        model: settings.model,
        deviceLabel: settings.deviceLabel,
        historyDays: settings.historyDays,
        tgEnabled: settings.tgEnabled,
      },
      hasTelegramConfig: await hasTelegramConfig(),
      hasSnapshot: Boolean(snapshot),
      snapshotStats: snapshot ? snapshot.stats : null,
      lastCollectedAt: (await chrome.storage.local.get('lastCollectedAt')).lastCollectedAt || null,
      chatLength: conversation.length,
    };
  },

  async accept_consent() {
    await setSettings({ consentAt: new Date().toISOString() });
    await chrome.storage.local.set({ [STORAGE_KEYS.consent]: Date.now() });
    return { ok: true };
  },

  async setup_passphrase({ passphrase }) {
    await setupMasterPassphrase(passphrase);
    return { ok: true };
  },

  async unlock({ passphrase }) {
    await unlockWithPassphrase(passphrase);
    return { ok: true };
  },

  async lock() {
    await invalidateUnlockedKey();
    try { await chrome.storage.session.remove('unlockedMasterKey'); } catch { /* noop */ }
    return { ok: true };
  },

  async save_settings({ aiKey, model, deviceLabel, historyDays, tgEnabled, tgToken, tgChatId, passphrase }) {
    // رمز اصلی: اگر کاربر رمزی داده یا اولین بار است، راه‌اندازی/بازخوانی شود
    const { masterSalt } = await chrome.storage.local.get('masterSalt');
    if (passphrase) {
      if (masterSalt) await unlockWithPassphrase(passphrase);
      else await setupMasterPassphrase(passphrase);
    } else if (!(await getUnlockedKey())) {
      throw new Error('برای ذخیره اطلاعات حساس، رمز رمزنگاری لازم است.');
    }

    const patch = {};
    if (model) patch.model = String(model).slice(0, 80);
    if (typeof deviceLabel === 'string' && deviceLabel.trim()) patch.deviceLabel = deviceLabel.trim().slice(0, 60);
    if (historyDays) patch.historyDays = Math.min(Math.max(parseInt(historyDays, 10) || 30, 1), 90);
    if (typeof tgEnabled === 'boolean') patch.tgEnabled = tgEnabled;

    if (aiKey && String(aiKey).trim()) {
      const sealed = await sealWithUnlockedKey(String(aiKey).trim());
      await chrome.storage.local.set({ [STORAGE_KEYS.sealedAiKey]: sealed });
    }
    if (tgToken && String(tgToken).trim() && tgChatId && String(tgChatId).trim()) {
      await saveTelegramConfig(String(tgToken).trim(), String(tgChatId).trim());
      patch.tgEnabled = true;
    }

    const settings = await setSettings(patch);
    return { ok: true, settings };
  },

  async get_settings_masked() {
    const settings = await getSettings();
    const { [STORAGE_KEYS.sealedAiKey]: sealedKey } = await chrome.storage.local.get(STORAGE_KEYS.sealedAiKey);
    let keyMask = null;
    if (sealedKey) {
      try {
        keyMask = maskSecret(await unsealWithUnlockedKey(sealedKey) || '');
      } catch { keyMask = '••••'; }
    }
    return { ok: true, settings, keyMask };
  },

  async collect() {
    const { snapshot, report } = await collectAndSanitize();
    return { ok: true, snapshot, report };
  },

  async chat_start() {
    const messages = await buildInitialMessages();
    const apiKey = await requireAiKey();
    const settings = await getSettings();
    const { text, usage } = await chatCompletion({ apiKey, model: settings.model, messages, temperature: 0.7 });
    const conversation = await saveConversation([...messages, { role: 'assistant', content: text }]);
    secureLog.info('چت جدید شروع شد. توکن مصرفی:', usage?.total_tokens ?? '?');
    return { ok: true, conversation };
  },

  async chat_send({ message }) {
    const text = String(message || '').trim();
    if (!text) throw new Error('پیام خالی است.');
    let conversation = await loadConversation();
    if (conversation.length === 0) conversation = await buildInitialMessages();
    conversation = await saveConversation([...conversation, { role: 'user', content: text }]);

    const apiKey = await requireAiKey();
    const settings = await getSettings();
    const { text: reply, usage } = await chatCompletion({ apiKey, model: settings.model, messages: conversation });
    const updated = await saveConversation([...conversation, { role: 'assistant', content: reply }]);
    return { ok: true, conversation: updated, usage };
  },

  async chat_reset() {
    try { await chrome.storage.session.remove(STORAGE_KEYS.chat); } catch { /* noop */ }
    return { ok: true };
  },

  async get_chat() {
    return { ok: true, conversation: await loadConversation() };
  },

  async export_snapshot() {
    const snapshot = await getStoredSnapshot();
    if (!snapshot) throw new Error('هنوز تحلیلی ذخیره نشده است.');
    return { ok: true, snapshot };
  },

  async telegram_send_snapshot() {
    const snapshot = await getStoredSnapshot();
    if (!snapshot) throw new Error('هنوز تحلیلی ذخیره نشده است.');
    const settings = await getSettings();
    if (!settings.tgEnabled) throw new Error('ارسال به تلگرام غیرفعال است.');
    const summary = [
      '📊 «پروفایل پاکسازی‌شده مرور» از دستیار خرید هوشمند',
      `دستگاه: ${snapshot.deviceLabel}`,
      `تاریخ: ${new Date(snapshot.createdAt).toLocaleString('fa-IR')}`,
      '',
      `• دامنه‌های بازدیدشده: ${snapshot.stats.domains}`,
      `• جستجوهای یکتا: ${snapshot.stats.searches}`,
      `• کوکی‌های بی‌خطر (بدون مقدار): ${snapshot.stats.cookies}`,
      '',
      '🛡️ تضمین: بدون مقدار کوکی، بدون URL شخصی، بدون عنوان صفحه، بدون دامنه بانکی/پیام‌رسان/جنسی.',
      'فایل JSON کامل در پیام بعدی 👇',
    ].join('\n');
    await sendSnapshotToTelegram(snapshot, summary);
    return { ok: true };
  },

  async test_ai({ aiKey }) {
    const key = aiKey && String(aiKey).trim() ? String(aiKey).trim() : await requireAiKey();
    const settings = await getSettings();
    const r = await testConnection(key, settings.model);
    return { ok: true, sample: r.sample };
  },

  async list_models({ aiKey }) {
    const key = aiKey && String(aiKey).trim() ? String(aiKey).trim() : await requireAiKey();
    const ids = await listModels(key);
    return { ok: true, models: ids.slice(0, 200) };
  },

  async test_telegram() {
    await testTelegram();
    return { ok: true };
  },

  async clear_all() {
    await clearAllData();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    const handler = handlers[request?.action];
    if (!handler) {
      sendResponse({ ok: false, error: `اکشن ناشناخته: ${request?.action}` });
      return;
    }
    try {
      const result = await handler(request || {});
      sendResponse(result);
    } catch (e) {
      secureLog.error('خطای هندلر:', e?.message || e);
      sendResponse({ ok: false, error: e?.message || 'خطای ناشناخته' });
    }
  })();
  return true; // پاسخ async
});

chrome.runtime.onInstalled.addListener(async () => {
  secureLog.info('دستیار خرید هوشمند نصب/به‌روزرسانی شد. نسخه ۲.۰');
  const settings = await getSettings();
  await setSettings(settings); // تضمین مقادیر پیش‌فرض
});
