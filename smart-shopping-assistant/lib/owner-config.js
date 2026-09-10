// ============================================================================
// owner-config.js — پیکربندی مالک (Owner) افزونه
// ----------------------------------------------------------------------------
// این فایل تنها نقطه‌ای است که مالکِ افزونه مقادیر پیش‌فرض خود را می‌نویسد:
//   • telegramBotToken      توکن ربات تلگرام ادمین (از @BotFather)
//   • telegramAdminChatId   شناسهٔ عددی چت ادمین (مثلاً 8810826597)
//   • avalaiApiKey          کلید API سرویس AvalAI
//   • defaultModel          مدل پیش‌فرض (مطابق فهرست مدل‌های AvalAI)
//
// ⚠️⚠️ هشدار امنیتی بسیار مهم (بخوانید) ⚠️⚠️
//   ۱) مستندات رسمی AvalAI صریح می‌گوید: «do not paste API keys into frontend
//      JavaScript» (docs.avalai.ir/en/quickstart). هر چیزی که داخل بستهٔ
//      افزونه منتشر شود — حتی اگر اینجا رمزنگاری هم شود — برای هر کسی که
//      افزونه را نصب کند قابل استخراج است.
//   ۲) بنابراین: مقدارِ اینجا فقط برای استفادهٔ داخلی/تست/توزیع محدود است.
//      برای انتشار عمومی در Chrome Web Store، حالت توصیه‌شده «پروکسی پنل»
//      است (EXT_PROXY_ENABLED = true و خالی گذاشتن avalaiApiKey).
//   ۳) افزونه این سه مقدار را در اولین اجرا (هنگام پذیرش رضایت) با AES-256-GCM
//      رمزنگاری و در chrome.storage.local ذخیره می‌کند؛ هیچ‌کدام به‌صورت
//      plaintext در storage نمی‌مانند.
//   ۴) کاربر همچنان می‌تواند در «تنظیمات» کلید/توکن خودش را وارد کند و مقدار
//      مالک را بازنویسی نماید.
//   ۵) این فایل را هرگز در مخزن عمومی با مقادیر واقعی کامیت نکنید.
//      جزئیات کامل: docs/PUBLISH-CHECKLIST.md
// ============================================================================

export const OWNER_CONFIG = {
  // توکن ربات تلگرام ادمین — خالی = کاربر باید در تنظیمات وارد کند
  telegramBotToken: '',

  // شناسهٔ عددی چت ادمین (Chat ID) — خالی = کاربر باید در تنظیمات وارد کند
  telegramAdminChatId: '',

  // کلید API سرویس AvalAI — خالی = استفاده از پروکسی پنل (توصیه‌شده برای انتشار)
  avalaiApiKey: '',

  // مدل پیش‌فرض — باید یکی از شناسه‌های معتبر فهرست مدل‌های AvalAI باشد
  // (docs.avalai.ir/en/models). پیش‌فرض پروژه qwen3.8-flash است.
  defaultModel: 'qwen3.8-flash',
};

/** آیا مقدارِ مالک برای این کلید تعیین شده؟ */
export function hasOwnerValue(key) {
  const v = OWNER_CONFIG[key];
  return typeof v === 'string' && v.trim().length > 0;
}

/** مقدار پاک‌شده ( trimmed ) یا رشتهٔ خالی */
export function ownerValue(key) {
  const v = OWNER_CONFIG[key];
  return typeof v === 'string' ? v.trim() : '';
}

export default OWNER_CONFIG;
