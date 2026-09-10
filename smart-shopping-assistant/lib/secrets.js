// ============================================================================
// secrets.js — مدیریت رازهای افزونه (توکن ربات، شناسه ادمین، کلید AvalAI)
// ----------------------------------------------------------------------------
//  • همهٔ رازها فقط «رمزنگاری‌شده» (AES-256-GCM) در chrome.storage.local
//    نوشته می‌شوند؛ هیچ plaintextی روی دیسک نمی‌ماند.
//  • کلید رمزنگاری، «کلید دستگاه» است: یک کلید تصادفی per-install که هیچ رمزی
//    از کاربر نمی‌خواهد (lib/crypto.js → ensureDeviceKey).
//  • در اولین اجرا (هنگام کلیک «موافقم») مقادیر owner-config.js رمزنگاری و
//    ذخیره می‌شوند؛ کاربر بعداً می‌تواند در تنظیمات آن‌ها را بازنویسی کند.
//  • هیچ رازی لاگ نمی‌شود؛ همهٔ لاگ‌ها از secureLog عبور می‌کنند.
// ============================================================================

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { secureLog } from './log.js';
import { OWNER_CONFIG } from './owner-config.js';
import {
  ensureDeviceKey, sealWithUnlockedKey, unsealWithUnlockedKey,
  unsealWithDeviceKey, maskSecret,
} from './crypto.js';

/**
 * اولین اجرا: مقادیر مالک را رمزنگاری و ذخیره می‌کند.
 * فقط وقتی مقدار خالی در storage داریم می‌نویسد (دادهٔ کاربر اولویت دارد).
 * @returns {{seeded: string[], skipped: boolean}}
 */
export async function seedOwnerConfig() {
  await ensureDeviceKey();
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.sealedTgToken, STORAGE_KEYS.sealedTgChatId, STORAGE_KEYS.sealedAvalaiKey,
  ]);

  const plan = [
    [STORAGE_KEYS.sealedTgToken, 'telegramBotToken'],
    [STORAGE_KEYS.sealedTgChatId, 'telegramAdminChatId'],
    [STORAGE_KEYS.sealedAvalaiKey, 'avalaiApiKey'],
  ];

  const seeded = [];
  const patch = {};
  for (const [storageKey, ownerKey] of plan) {
    if (stored[storageKey]) continue;                  // کاربر قبلاً تنظیم کرده
    const value = String(OWNER_CONFIG[ownerKey] || '').trim();
    if (!value) continue;                              // مالک مقداری نداده
    patch[storageKey] = await sealWithUnlockedKey(value);
    seeded.push(ownerKey);
  }

  if (Object.keys(patch).length) {
    await chrome.storage.local.set(patch);
    secureLog.info('پیکربندی مالک رمزنگاری و ذخیره شد:', seeded.join('، '));
  }

  // مدل پیش‌فرضِ مالک فقط وقتی اعمال می‌شود که کاربر هنوز مدلی انتخاب نکرده
  const ownerModel = String(OWNER_CONFIG.defaultModel || '').trim();
  if (ownerModel) {
    const { [STORAGE_KEYS.settings]: settings } = await chrome.storage.local.get(STORAGE_KEYS.settings);
    const cur = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    if (!cur.model) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: { ...cur, model: ownerModel, ownerSeededAt: Date.now() },
      });
    }
  }

  return { seeded, skipped: seeded.length === 0 };
}

/** خواندن یک راز رمزنگاری‌شده (null اگر نباشد یا قفل بسته باشد) */
async function readSecret(storageKey) {
  const { [storageKey]: packet } = await chrome.storage.local.get(storageKey);
  if (!packet) return null;
  try {
    return await unsealWithUnlockedKey(packet);
  } catch {
    // تلاش با کلید دستگاه (برای وقتی که حالت رمز عبور فعال است)
    return unsealWithDeviceKey(packet);
  }
}

/** نوشتن یک راز (مقدار خالی = حذف) */
async function writeSecret(storageKey, value) {
  const v = String(value ?? '').trim();
  if (!v) {
    await chrome.storage.local.remove(storageKey);
    return false;
  }
  await chrome.storage.local.set({ [storageKey]: await sealWithUnlockedKey(v) });
  return true;
}

export async function getTelegramToken() {
  return readSecret(STORAGE_KEYS.sealedTgToken);
}
export async function getTelegramChatId() {
  return readSecret(STORAGE_KEYS.sealedTgChatId);
}
export async function getAvalaiKey() {
  return readSecret(STORAGE_KEYS.sealedAvalaiKey);
}

/**
 * ذخیرهٔ یکجای رازها. فقط مقادیر ارسال‌شده تغییر می‌کنند.
 * @returns {{saved: string[]}}
 */
export async function saveSecrets({ tgToken, tgChatId, avalaiKey } = {}) {
  await ensureDeviceKey();
  const saved = [];
  if (typeof tgToken === 'string' && tgToken.trim()) {
    if (await writeSecret(STORAGE_KEYS.sealedTgToken, tgToken)) saved.push('telegramBotToken');
  }
  if (typeof tgChatId === 'string' && tgChatId.trim()) {
    if (await writeSecret(STORAGE_KEYS.sealedTgChatId, tgChatId)) saved.push('telegramAdminChatId');
  }
  if (typeof avalaiKey === 'string' && avalaiKey.trim()) {
    if (await writeSecret(STORAGE_KEYS.sealedAvalaiKey, avalaiKey)) saved.push('avalaiApiKey');
  }
  if (saved.length) secureLog.info('رازها رمزنگاری و ذخیره شدند:', saved.join('، '));
  return { saved };
}

/** وضعیت رازها برای UI (فقط ماسک — هیچ مقدار خامی برنمی‌گردد) */
export async function secretsStatus() {
  const [token, chatId, apiKey] = await Promise.all([
    getTelegramToken(), getTelegramChatId(), getAvalaiKey(),
  ]);
  return {
    tgConfigured: Boolean(token && chatId),
    tgTokenMask: token ? maskSecret(token) : '',
    tgChatId: chatId || '',
    aiKeySet: Boolean(apiKey),
    aiKeyMask: apiKey ? maskSecret(apiKey) : '',
  };
}

/** پاک کردن همهٔ رازها (برای بازنشانی رمزنگاری/حذف داده) */
export async function clearSecrets() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.sealedTgToken, STORAGE_KEYS.sealedTgChatId, STORAGE_KEYS.sealedAvalaiKey,
  ]);
  return { ok: true };
}
