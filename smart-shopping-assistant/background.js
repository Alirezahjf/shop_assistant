// ============================================================================
// background.js — Service Worker (MV3, ES Module)
// ----------------------------------------------------------------------------
// v2.1: گفتگو از طریق پروکسی سرور مدیر — کاربر هیچ کلیدی وارد/نگه نمی‌دارد.
// تنها راز سمت کاربر: اطلاعات اختیاری ربات تلگرام (رمزنگاری AES-256-GCM).
// state حیاتی در chrome.storage (مقاوم به مرگ Service Worker).
// ============================================================================

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './lib/constants.js';
import { secureLog } from './lib/log.js';
import {
  setupMasterPassphrase, unlockWithPassphrase, getUnlockedKey,
  sealWithUnlockedKey, unsealWithUnlockedKey, invalidateUnlockedKey, maskSecret,
} from './lib/crypto.js';
import { collectAndSanitize, getStoredSnapshot, clearAllData } from './lib/collect.js';
import { assistantChat } from './lib/ai.js';
import { saveTelegramConfig, sendSnapshotToTelegram, testTelegram, hasTelegramConfig } from './lib/telegram.js';

// ---------------------------------------------------------------------------
// مکالمه — در storage.session (باقی‌مانده تا بستن مرورگر)
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
// گفتگو با دستیار (سرور پرامپت سیستم را می‌سازد)
// ---------------------------------------------------------------------------
async function requireSnapshot() {
  return getStoredSnapshot();
}

// ---------------------------------------------------------------------------
// مسیریابی پیام‌ها
// ---------------------------------------------------------------------------
const handlers = {
  async get_state() {
    const settings = await getSettings();
    const { [STORAGE_KEYS.consent]: consent } = await chrome.storage.local.get(STORAGE_KEYS.consent);
    const snapshot = await getStoredSnapshot();
    const conversation = await loadConversation();
    const unlocked = Boolean(await getUnlockedKey());
    const { sealedTgToken, sealedTgChatId } = await chrome.storage.local.get(['sealedTgToken', 'sealedTgChatId']);
    return {
      ok: true,
      consent: Boolean(consent),
      setupDone: Boolean(settings.setupDone), // پس از تکمیل پیکربندی سریع
      unlocked,
      hasSealedSecrets: Boolean(sealedTgToken || sealedTgChatId),
      settings: {
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

  async save_settings({ deviceLabel, historyDays, tgEnabled, tgToken, tgChatId, passphrase }) {
    // راز تلگرام فقط با قفل باز ذخیره می‌شود
    if (tgToken && String(tgToken).trim() && tgChatId && String(tgChatId).trim()) {
      const { masterSalt } = await chrome.storage.local.get('masterSalt');
      if (passphrase) {
        if (masterSalt) await unlockWithPassphrase(passphrase);
        else await setupMasterPassphrase(passphrase);
      } else if (!(await getUnlockedKey())) {
        throw new Error('برای ذخیرهٔ اطلاعات ربات، ابتدا رمز رمزنگاری را تنظیم/وارد کنید.');
      }
      await saveTelegramConfig(String(tgToken).trim(), String(tgChatId).trim());
    }

    const patch = {};
    if (typeof deviceLabel === 'string' && deviceLabel.trim()) patch.deviceLabel = deviceLabel.trim().slice(0, 60);
    if (historyDays) patch.historyDays = Math.min(Math.max(parseInt(historyDays, 10) || 30, 1), 90);
    if (typeof tgEnabled === 'boolean') patch.tgEnabled = tgEnabled;
    if (tgToken && tgChatId) patch.tgEnabled = true;
    patch.setupDone = true;

    const settings = await setSettings(patch);
    return { ok: true, settings };
  },

  async get_settings_masked() {
    const settings = await getSettings();
    return { ok: true, settings, keyMask: null };
  },

  async collect() {
    const { snapshot, report } = await collectAndSanitize();
    return { ok: true, snapshot, report };
  },

  async chat_start() {
    // پیام اول: بدون پیام کاربر — سرور با کانتکست، سلام گرم می‌سازد
    const snapshot = await requireSnapshot();
    const { text } = await assistantChat({
      message: 'سلام! تحلیل من رو شروع کن و بدون پیشنهاد محصول، گرم با من صحبت کن و بپرس دنبال چه چیزی هستم.',
      history: [],
      snapshot,
    });
    const conversation = await saveConversation([
      { role: 'user', content: '(شروع گفتگو)' },
      { role: 'assistant', content: text },
    ]);
    return { ok: true, conversation };
  },

  async chat_send({ message }) {
    const text = String(message || '').trim();
    if (!text) throw new Error('پیام خالی است.');
    let conversation = await loadConversation();
    const snapshot = await requireSnapshot();
    const { text: reply } = await assistantChat({
      message: text,
      history: conversation.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-14),
      snapshot,
    });
    const updated = await saveConversation([...conversation, { role: 'user', content: text }, { role: 'assistant', content: reply }]);
    return { ok: true, conversation: updated };
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
  secureLog.info('دستیار خرید هوشمند نصب/به‌روزرسانی شد. نسخه ۲.۱ (پروکسی سرور)');
  const settings = await getSettings();
  await setSettings(settings);
});
