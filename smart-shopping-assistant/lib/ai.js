// ============================================================================
// ai.js — کلاینت AvalAI (سازگار با OpenAI) برای افزونه
// ----------------------------------------------------------------------------
// طبق مستندات https://docs.avalai.org/fa :
//   • Base URL: https://api.avalai.ir/v1
//   • احراز هویت: هدر Authorization: Bearer <KEY>
//   • نقطه پایان استفاده‌شده: POST /v1/chat/completions (سازگاری کامل OpenAI)
//   • خطاها به پیام‌های فارسی قابل‌فهم نگاشت می‌شوند + timeout + retry
// ============================================================================

import { AVALAI_BASE_URL } from './constants.js';
import { secureLog } from './log.js';

const DEFAULT_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;

class AvalAiError extends Error {
  constructor(message, { status, retryable } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable === true;
  }
}

function friendlyError(status, bodyText) {
  switch (status) {
    case 401:
    case 403:
      return new AvalAiError('کلید API نامعتبر است یا دسترسی ندارد. کلید AvalAI را بررسی کنید.', { status });
    case 402:
      return new AvalAiError('اعتبار حساب AvalAI کافی نیست.', { status });
    case 404:
      return new AvalAiError('مدل انتخابی در AvalAI یافت نشد. نام مدل را بررسی کنید.', { status });
    case 429:
      return new AvalAiError('محدودیت نرخ درخواست (Rate limit). کمی بعد دوباره تلاش کنید.', { status, retryable: true });
    default:
      if (status >= 500) return new AvalAiError(`خطای سرور AvalAI (${status}). دوباره تلاش می‌کنیم…`, { status, retryable: true });
      return new AvalAiError(`خطای AvalAI (${status}): ${(bodyText || '').slice(0, 160)}`, { status });
  }
}

/**
 * فراخوانی Chat Completions
 * @param {{apiKey:string, model:string, messages:Array, temperature?:number,
 *          maxTokens?:number, timeoutMs?:number, signal?:AbortSignal}} p
 * @returns {{text:string, usage?:object, model?:string}}
 */
export async function chatCompletion(p) {
  const {
    apiKey, model, messages,
    temperature = 0.6, maxTokens = 1600,
    timeoutMs = DEFAULT_TIMEOUT_MS, signal,
  } = p;

  if (!apiKey) throw new AvalAiError('کلید API تنظیم نشده است. از تنظیمات، کلید AvalAI را وارد کنید.');
  if (!model) throw new AvalAiError('مدل انتخاب نشده است.');

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort('timeout'), timeoutMs);
    if (signal) signal.addEventListener('abort', () => ac.abort(signal.reason), { once: true });
    try {
      const res = await fetch(`${AVALAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = friendlyError(res.status, body);
        if (!err.retryable || attempt === MAX_RETRIES) throw err;
        lastError = err;
      } else {
        const data = await res.json();
        const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
        const text = choice?.message?.content;
        if (typeof text !== 'string' || !text.trim()) {
          throw new AvalAiError('پاسخ مدل خالی بود یا فیلتر شد. دوباره تلاش کنید.');
        }
        return { text, usage: data?.usage, model: data?.model };
      }
    } catch (e) {
      if (e?.name === 'AbortError' || String(e?.message).includes('timeout')) {
        lastError = new AvalAiError('مهلت پاسخ AvalAI تمام شد (timeout).', { retryable: true });
        if (attempt === MAX_RETRIES) throw lastError;
      } else if (e instanceof AvalAiError) {
        if (!e.retryable || attempt === MAX_RETRIES) throw e;
        lastError = e;
      } else {
        secureLog.error('خطای شبکه در فراخوانی AvalAI:', e?.message || String(e));
        throw new AvalAiError('اتصال به AvalAI برقرار نشد. اینترنت/فیلترشکن را بررسی کنید.');
      }
    } finally {
      clearTimeout(timer);
    }
    // backoff نمایی
    await new Promise((r) => setTimeout(r, 700 * Math.pow(2, attempt)));
  }
  throw lastError || new AvalAiError('خطای ناشناخته AvalAI.');
}

/** آزمون اتصال با حداقل توکن */
export async function testConnection(apiKey, model) {
  const r = await chatCompletion({
    apiKey,
    model,
    messages: [{ role: 'user', content: 'سلام. فقط کلمه «متصل» را بفرست.' }],
    maxTokens: 20,
    temperature: 0,
    timeoutMs: 20000,
  });
  return { ok: true, sample: r.text.slice(0, 40), usage: r.usage };
}

/** دریافت فهرست مدل‌های موجود حساب (/v1/models) */
export async function listModels(apiKey) {
  const res = await fetch(`${AVALAI_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
  });
  if (!res.ok) throw friendlyError(res.status, '');
  const data = await res.json();
  const ids = (data?.data || []).map((m) => m?.id).filter(Boolean);
  return ids;
}
