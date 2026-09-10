// ============================================================================
// constants.js — ثابت‌های مشترک افزونه
// ============================================================================

export const STORAGE_KEYS = {
  settings: 'settings',              // تنظیمات غیرحساس (plaintext)
  sealedTgToken: 'sealedTgToken',    // توکن ربات تلگرام — رمزنگاری‌شده
  sealedTgChatId: 'sealedTgChatId',  // شناسه عددی ادمین — رمزنگاری‌شده
  sealedAvalaiKey: 'sealedAvalaiKey',// کلید API هوش مصنوعی — رمزنگاری‌شده
  snapshot: 'sanitizedSnapshot',     // اسنپ‌شات پاکسازی‌شده (بدون هیچ داده خام)
  consent: 'consentV2',              // رضایت آگاهانه کاربر
  chat: 'conversationHistory',       // مکالمه چت (storage.session)
};

export const DEFAULT_SETTINGS = {
  deviceLabel: 'دستگاه من',
  historyDays: 30,
  // «ارسال خودکار خروجی پاکسازی‌شده به ربات تلگرامِ خودتان» سیاست ثابت است و
  // دیگر سوییچ کاربر ندارد؛ این فلگ فقط نشان می‌دهد ربات پیکربندی شده یا نه.
  tgEnabled: false,
  model: DEFAULT_MODEL_NAME(),
  consentAt: null,
  ownerSeededAt: null,
};

function DEFAULT_MODEL_NAME() {
  return 'qwen3.8-flash';
}

// ============================================================================
// AvalAI — مطابق مستندات رسمی (docs.avalai.ir)
//   • Endpoint:   POST https://api.avalai.ir/v1/chat/completions
//   • Auth:       Authorization: Bearer <KEY>
//   • Models:     GET https://api.avalai.ir/v1/models  (با احراز هویت)
//                 GET https://api.avalai.ir/public/models (بدون احراز هویت)
// ============================================================================
export const AVALAI_BASE_URL = 'https://api.avalai.ir/v1';
export const AVALAI_PUBLIC_MODELS_URL = 'https://api.avalai.ir/public/models';

// فهرست پیشنهادی هم‌تراز با مستندات (docs.avalai.ir/en/models).
// اگر کلید تنظیم باشد، دکمهٔ «دریافت فهرست مدل‌ها» این فهرست را از سرور
// AvalAI به‌روز می‌کند؛ این‌ها فقط fallback آفلاین هستند.
export const KNOWN_MODELS = [
  { id: 'qwen3.8-flash', label: 'Qwen 3.8 Flash — ارزان و سریع (پیشنهادی)' },
  { id: 'glm-5.3-flash', label: 'GLM 5.3 Flash — ارزان' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'nemotron-3.5-lightning', label: 'Nemotron 3.5 Lightning — بسیار ارزان' },
  { id: 'qwen3.8-27b', label: 'Qwen 3.8 27B' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra — قوی‌ترین' },
  // ⚠️ claude-fable-5-1 طبق مستندات نیاز به «Tier 2 یا بالاتر» دارد؛ برای حساب
  // عادی ۴۰۱/۴۰۳ می‌دهد. فقط در صورت داشتن سطح دسترسی انتخاب کنید.
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 — نیازمند Tier 2+' },
];

// ============================================================================
// ⚠️ تنظیم انتشار (فقط یک‌بار قبل از آپلود به Web Store تغییر دهید):
// آدرس پنل مدیریت شما (سروری که کلید AvalAI روی آن است). برای توسعه لوکال
// همان localhost بماند؛ برای انتشار، دامنه خودتان را بگذارید و در
// manifest.json هم host_permission همان دامنه را جایگزین کنید.
// راهنمای کامل: docs/PUBLISH-CHECKLIST.md
// ============================================================================
export const SERVICE_BASE_URL = 'http://localhost:8000';

// مسیر پروکسی پنل (fallback اختیاری وقتی کلید مستقیم نداریم)
export const EXT_PROXY_ENABLED = true;

export const TELEGRAM_API_BASE = 'https://api.telegram.org';
