// ============================================================================
// constants.js — ثابت‌های مشترک افزونه
// ============================================================================

export const STORAGE_KEYS = {
  settings: 'settings',            // تنظیمات غیرحساس (plaintext)
  sealedAiKey: 'sealedAiKey',      // کلید AvalAI — رمزنگاری‌شده
  sealedTgToken: 'sealedTgToken',  // توکن ربات تلگرام — رمزنگاری‌شده
  sealedTgChatId: 'sealedTgChatId',// شناسه عددی ادمین — رمزنگاری‌شده
  snapshot: 'sanitizedSnapshot',   // اسنپ‌شات پاکسازی‌شده (بدون هیچ داده خام)
  consent: 'consentV2',            // رضایت آگاهانه کاربر
  chat: 'conversationHistory',     // مکالمه چت (storage.session)
};

export const DEFAULT_SETTINGS = {
  model: 'qwen3.8-flash',
  deviceLabel: 'دستگاه من',
  historyDays: 30,
  tgEnabled: false,
  consentAt: null,
};

/** مدل‌های پیشنهادی AvalAI (از مستندات docs.avalai.org) */
export const AVALAI_MODELS = [
  { id: 'qwen3.8-flash', label: 'Qwen 3.8 Flash — ارزان و سریع (پیشنهادی)' },
  { id: 'glm-5.3-flash', label: 'GLM 5.3 Flash — ارزان و توانمند' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash (آخرین نسخه)' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra — پرچم‌دار (گران‌تر)' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 — پرچم‌دار' },
  { id: 'custom', label: 'مدل سفارشی…' },
];

export const AVALAI_BASE_URL = 'https://api.avalai.ir/v1';
export const TELEGRAM_API_BASE = 'https://api.telegram.org';
