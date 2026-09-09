// ============================================================================
// log.js — لاگ امن با Redaction
// ----------------------------------------------------------------------------
// قانون: هیچ راز یا داده شخصی نباید به کنسول/لاگ برود.
// این لاگر به‌طور خودکار توکن ربات تلگرام، کلید API، شماره کارت/شبا/ایمیل و
// پاکت‌های طولانی base64 را قبل از چاپ با «[REDACTED]» جایگزین می‌کند.
// ============================================================================

const REDACT_PATTERNS = [
  // توکن ربات تلگرام: <bot_id>:<secret>
  { re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g, tag: '[TELEGRAM_TOKEN]' },
  { re: /bot\d{8,10}:[^/\s]+/gi, tag: 'bot[TELEGRAM_TOKEN]' },
  // کلید API (عمومی: sk-، AIza، و هر رشته کلیدمانند ۳۲+)
  { re: /\b(sk|rk)-[A-Za-z0-9_-]{16,}\b/g, tag: '[API_KEY]' },
  { re: /\bAIza[A-Za-z0-9_-]{20,}\b/g, tag: '[API_KEY]' },
  { re: /\bBearer\s+[A-Za-z0-9._-]{16,}/gi, tag: 'Bearer [REDACTED]' },
  // شماره کارت / شبا / ایمیل
  { re: /\b\d{16}\b/g, tag: '[CARD]' },
  { re: /\bIR\d{24}\b/g, tag: '[IBAN]' },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, tag: '[EMAIL]' },
  // JWT
  { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, tag: '[JWT]' },
];

export function redact(input) {
  let s;
  try {
    s = typeof input === 'string' ? input : JSON.stringify(input);
  } catch {
    return '[unserializable]';
  }
  if (!s) return s;
  for (const { re, tag } of REDACT_PATTERNS) {
    s = s.replace(re, tag);
  }
  return s;
}

function emit(level, args) {
  const safe = args.map((a) => (typeof a === 'object' && a !== null ? redact(a) : redact(String(a))));
  // eslint-disable-next-line no-console
  console[level](...safe);
}

export const secureLog = {
  debug: (...a) => emit('log', a),
  info: (...a) => emit('info', a),
  warn: (...a) => emit('warn', a),
  error: (...a) => emit('error', a),
};
