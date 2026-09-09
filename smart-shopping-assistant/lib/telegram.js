// ============================================================================
// telegram.js — ارسال گزارش به ربات تلگرام (اختیاری)
// ----------------------------------------------------------------------------
// امنیت:
//  • توکن ربات و شناسه ادمین هرگز plaintext ذخیره نمی‌شوند — فقط پاکت
//    AES-256-GCM (crypto.sealWithUnlockedKey) در storage.local.
//  • هیچ‌جا (لاگ/خطا/UI) توکن چاپ نمی‌شود؛ wrapper «redacting» خطاهای شبکه را
//    قبل از لاگ پاک می‌کند و در پیام خطا هم توکن استریپ می‌شود.
//  • محتوای ارسالی «فقط» Snapshot پاکسازی‌شده است (بدون مقدار کوکی، بدون URL
//    خام، بدون دامنه‌های حساس).
// ============================================================================

import { TELEGRAM_API_BASE } from './constants.js';
import { secureLog, redact } from './log.js';
import { sealWithUnlockedKey, unsealWithUnlockedKey } from './crypto.js';

/**
 * ذخیره امن اطلاعات ربات — باید قفل رمزنگاری باز باشد.
 */
export async function saveTelegramConfig(token, chatId) {
  const sealedToken = await sealWithUnlockedKey(String(token).trim());
  const sealedChatId = await sealWithUnlockedKey(String(chatId).trim());
  await chrome.storage.local.set({ sealedTgToken: sealedToken, sealedTgChatId: sealedChatId });
  return true;
}

/** خواندن config (null یعنی قفل بسته یا تنظیم نشده) */
async function loadTelegramConfig() {
  const { sealedTgToken, sealedTgChatId } = await chrome.storage.local.get([
    'sealedTgToken', 'sealedTgChatId',
  ]);
  if (!sealedTgToken || !sealedTgChatId) return null;
  try {
    const [token, chatId] = await Promise.all([
      unsealWithUnlockedKey(sealedTgToken),
      unsealWithUnlockedKey(sealedChatId),
    ]);
    if (!token || !chatId) return null; // قفل بسته
    return { token, chatId };
  } catch {
    return null;
  }
}

/** فراخوانی امن Bot API — هرگز token/URL را لاگ یا در خطا افشا نمی‌کند */
async function callBotApi(token, method, body, fetchInit = {}) {
  const url = `${TELEGRAM_API_BASE}/bot${token}/${method}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      ...fetchInit,
      body: fetchInit.body !== undefined ? fetchInit.body : JSON.stringify(body),
      headers: fetchInit.body !== undefined
        ? fetchInit.headers
        : { 'Content-Type': 'application/json' },
      signal: fetchInit.signal || (AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined),
    });
  } catch (e) {
    secureLog.error('خطای شبکه در Telegram API:', e?.name || 'network-error');
    throw new Error('اتصال به Telegram API برقرار نشد.');
  }
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    // توضیح تلگرام ممکن است شامل توکن نباشد ولی به‌هرحال redact می‌شود
    secureLog.error('Telegram API خطا برگرداند:', redact(data.description || res.status));
    throw new Error(`Telegram API: ${String(data.description || 'خطای نامشخص').slice(0, 120)}`);
  }
  return data.result;
}

/** پیام متنی (خودکار شکسته به قطعات ≤3800) */
export async function sendTelegramText(text) {
  const cfg = await loadTelegramConfig();
  if (!cfg) throw new Error('اطلاعات ربات تنظیم/باز نشده است.');
  const chunks = [];
  let rest = String(text);
  while (rest.length > 0) {
    chunks.push(rest.slice(0, 3800));
    rest = rest.slice(3800);
  }
  for (const chunk of chunks) {
    await callBotApi(cfg.token, 'sendMessage', { chat_id: cfg.chatId, text: chunk });
  }
  return { sent: chunks.length };
}

/** ارسال Snapshot پاکسازی‌شده به‌صورت فایل JSON + پیام خلاصه */
export async function sendSnapshotToTelegram(snapshot, summaryText) {
  const cfg = await loadTelegramConfig();
  if (!cfg) throw new Error('اطلاعات ربات تنظیم/باز نشده است.');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label = String(snapshot.deviceLabel || 'device').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 30);
  const filename = `browsing-profile_${label}_${stamp}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });

  if (summaryText) {
    await callBotApi(cfg.token, 'sendMessage', { chat_id: cfg.chatId, text: summaryText.slice(0, 3800) });
  }
  const form = new FormData();
  form.append('chat_id', cfg.chatId);
  form.append('caption', `📊 پروفایل پاکسازی‌شده مرور — ${snapshot.stats.domains} دامنه، ${snapshot.stats.searches} جستجو، ${snapshot.stats.cookies} کوکی بی‌خطر`);
  form.append('document', blob, filename);
  await callBotApi(cfg.token, 'sendDocument', null, { body: form });
  return true;
}

/** آزمون اتصال ربات */
export async function testTelegram() {
  const cfg = await loadTelegramConfig();
  if (!cfg) throw new Error('اطلاعات ربات تنظیم/باز نشده است.');
  await callBotApi(cfg.token, 'sendMessage', {
    chat_id: cfg.chatId,
    text: '✅ تست اتصال موفق بود — دستیار خرید هوشمند به این چت متصل است.',
  });
  return true;
}

/** آیا config ذخیره شده؟ (بدون باز کردن) */
export async function hasTelegramConfig() {
  const { sealedTgToken, sealedTgChatId } = await chrome.storage.local.get([
    'sealedTgToken', 'sealedTgChatId',
  ]);
  return Boolean(sealedTgToken && sealedTgChatId);
}
