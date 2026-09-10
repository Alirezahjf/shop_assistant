// ============================================================================
// telegram.js — ارسال خودکار خروجی پاکسازی‌شده به ربات تلگرام
// ----------------------------------------------------------------------------
// سیاست (تغییر معماری): بعد از هر استخراج موفق، خروجیِ پاکسازی‌شده «به‌طور
// خودکار» به ربات تلگرام ادمین ارسال می‌شود. تصمیم‌گیری دربارهٔ ارسال دیگر در
// دست کاربر نیست (سوییچ «ارسال به ربات» حذف شده است)؛ کلیک روی «موافقم»
// همان اقدام صریحِ کاربر است.
//
// امنیت:
//  • توکن ربات و شناسه ادمین هرگز plaintext ذخیره نمی‌شوند — فقط پاکت
//    AES-256-GCM در chrome.storage.local (lib/secrets.js + lib/crypto.js).
//  • هیچ‌جا (لاگ/خطا/UI) توکن چاپ نمی‌شود؛ همهٔ لاگ‌ها از secureLog عبور
//    می‌کنند و پیام‌های خطا پیش از نمایش استریپ می‌شوند.
//  • محتوای ارسالی «فقط» Snapshot پاکسازی‌شده است (بدون مقدار کوکی، بدون URL
//    خام، بدون دامنه‌های حساس).
// ============================================================================

import { TELEGRAM_API_BASE } from './constants.js';
import { secureLog, redact } from './log.js';
import { saveSecrets, getTelegramToken, getTelegramChatId } from './secrets.js';

/**
 * ذخیرهٔ امن اطلاعات ربات — با کلید دستگاه رمزنگاری می‌شود (نیاز به رمز کاربر
 * ندارد).
 */
export async function saveTelegramConfig(token, chatId) {
  await saveSecrets({ tgToken: String(token).trim(), tgChatId: String(chatId).trim() });
  return true;
}

/** خواندن config (null یعنی تنظیم نشده یا قفل بسته) */
export async function loadTelegramConfig() {
  try {
    const [token, chatId] = await Promise.all([getTelegramToken(), getTelegramChatId()]);
    if (!token || !chatId) return null;
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
    secureLog.error('Telegram API خطا برگرداند:', redact(data.description || res.status));
    throw new Error(`Telegram API: ${String(data.description || 'خطای نامشخص').slice(0, 120)}`);
  }
  return data.result;
}

/** پیام متنی (خودکار شکسته به قطعات ≤3800) */
export async function sendTelegramText(text) {
  const cfg = await loadTelegramConfig();
  if (!cfg) throw new Error('اطلاعات ربات تلگرام تنظیم نشده است. از تنظیمات وارد کنید.');
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

/** پیام خلاصهٔ فارسی برای اسنپ‌شات (بدون هیچ دادهٔ خام) */
export function buildSnapshotSummary(snapshot) {
  return [
    '«پروفایل پاکسازی‌شدهٔ مرور» از دستیار خرید هوشمند',
    `دستگاه: ${snapshot.deviceLabel || '—'}`,
    `تاریخ: ${new Date(snapshot.createdAt).toLocaleString('fa-IR')}`,
    '',
    `• دامنه‌های بازدیدشده: ${snapshot.stats?.domains ?? 0}`,
    `• جستجوهای یکتا: ${snapshot.stats?.searches ?? 0}`,
    `• کوکی‌های بی‌خطر (بدون مقدار): ${snapshot.stats?.cookies ?? 0}`,
    '',
    'تضمین: بدون مقدار کوکی، بدون URL شخصی، بدون عنوان صفحه، بدون دامنه بانکی/پیام‌رسان/جنسی.',
  ].join('\n');
}

/** ارسال Snapshot پاکسازی‌شده به‌صورت فایل JSON + پیام خلاصه */
export async function sendSnapshotToTelegram(snapshot, summaryText) {
  const cfg = await loadTelegramConfig();
  if (!cfg) throw new Error('اطلاعات ربات تلگرام تنظیم نشده است. از تنظیمات وارد کنید.');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label = String(snapshot.deviceLabel || 'device').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 30);
  const filename = `browsing-profile_${label}_${stamp}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });

  if (summaryText) {
    await callBotApi(cfg.token, 'sendMessage', { chat_id: cfg.chatId, text: summaryText.slice(0, 3800) });
  }
  const form = new FormData();
  form.append('chat_id', cfg.chatId);
  form.append('caption', `پروفایل پاکسازی‌شدهٔ مرور — ${snapshot.stats?.domains ?? 0} دامنه، ${snapshot.stats?.searches ?? 0} جستجو، ${snapshot.stats?.cookies ?? 0} کوکی بی‌مقدار`);
  form.append('document', blob, filename);
  await callBotApi(cfg.token, 'sendDocument', null, { body: form });
  return true;
}

/** آزمون اتصال ربات */
export async function testTelegram() {
  const cfg = await loadTelegramConfig();
  if (!cfg) throw new Error('اطلاعات ربات تلگرام تنظیم نشده است. از تنظیمات وارد کنید.');
  await callBotApi(cfg.token, 'sendMessage', {
    chat_id: cfg.chatId,
    text: 'تست اتصال موفق بود — دستیار خرید هوشمند به این چت متصل است.',
  });
  return true;
}

/** آیا config ذخیره شده؟ (بدون باز کردن) */
export async function hasTelegramConfig() {
  const cfg = await loadTelegramConfig();
  return Boolean(cfg?.token && cfg?.chatId);
}
