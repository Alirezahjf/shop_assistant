// ============================================================================
// constants.js — ثابت‌های مشترک افزونه
// ============================================================================

export const STORAGE_KEYS = {
  settings: 'settings',            // تنظیمات غیرحساس (plaintext)
  sealedTgToken: 'sealedTgToken',  // توکن ربات تلگرام — رمزنگاری‌شده
  sealedTgChatId: 'sealedTgChatId',// شناسه عددی ادمین — رمزنگاری‌شده
  snapshot: 'sanitizedSnapshot',   // اسنپ‌شات پاکسازی‌شده (بدون هیچ داده خام)
  consent: 'consentV2',            // رضایت آگاهانه کاربر
  chat: 'conversationHistory',     // مکالمه چت (storage.session)
};

export const DEFAULT_SETTINGS = {
  deviceLabel: 'دستگاه من',
  historyDays: 30,
  tgEnabled: false,
  consentAt: null,
};

// ============================================================================
// ⚠️ تنظیم انتشار (فقط یک‌بار قبل از آپلود به Web Store تغییر دهید):
// آدرس پنل مدیریت شما (سروری که کلید AvalAI روی آن است). برای توسعه لوکال
// همان localhost بماند؛ برای انتشار، دامنه خودتان را بگذارید و در
// manifest.json هم host_permission همان دامنه را جایگزین کنید.
// راهنمای کامل: docs/PUBLISH-CHECKLIST.md
// ============================================================================
export const SERVICE_BASE_URL = 'http://localhost:8000';

export const TELEGRAM_API_BASE = 'https://api.telegram.org';
