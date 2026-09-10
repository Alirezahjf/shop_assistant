// ============================================================================
// ai.js — کلاینت گفتگوی افزونه از طریق «پروکسی سرور مدیر»
// ----------------------------------------------------------------------------
// معماری امن:
//   افزونه (بدون هیچ کلید) ──► سرور مدیر /api/ext/chat ──► AvalAI (کلید سرور)
//
//  • هیچ کلید API در افزونه نگه‌داری یا ارسال نمی‌شود — هیچ‌جا.
//  • پرامپت سیستم سمت سرور ساخته می‌شود؛ افزونه فقط پیام کاربر + تاریخچهٔ
//    کوتاه + کانتکست پاکسازی‌شده (دامنه‌ها/جستجوها) را می‌فرستد.
//  • timeout + retry + پیام خطای فارسی.
// ============================================================================

import { SERVICE_BASE_URL } from './constants.js';
import { secureLog } from './log.js';

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_RETRIES = 1;

class ExtServiceError extends Error {
  constructor(message, { retryable } = {}) {
    super(message);
    this.retryable = retryable === true;
  }
}

function friendlyError(status, bodyText) {
  switch (status) {
    case 429:
      return new ExtServiceError('تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.', { retryable: true });
    case 503:
      return new ExtServiceError('سرویس موقتاً در دسترس نیست. چند لحظه دیگر تلاش کنید.', { retryable: true });
    default:
      if (status >= 500) return new ExtServiceError('خطای سرور؛ دوباره تلاش می‌کنیم…', { retryable: true });
      // پیام فارسی سرور را نمایش بده
      try {
        const data = JSON.parse(bodyText || '{}');
        if (data?.error) return new ExtServiceError(data.error);
      } catch { /* noop */ }
      return new ExtServiceError(`خطای سرویس (${status})`);
  }
}

/** کانتکست پاکسازی‌شده برای سرور (فقط آمار سطح بالا — بدون داده خام) */
export function buildProxyContext(snapshot) {
  if (!snapshot) return { domains: [], searches: [], categories: [] };
  return {
    domains: (snapshot.domains || []).slice(0, 8).map((d) => d.domain),
    searches: (snapshot.searches || []).slice(0, 8).map((s) => s.term),
    categories: [],
  };
}

/**
 * گفتگو با دستیار از طریق سرور.
 * @param {{history:Array, message:string, snapshot?:object}} p
 * @returns {{text:string}}
 */
export async function assistantChat(p) {
  const { history = [], message, snapshot } = p;

  const body = JSON.stringify({
    message: String(message || '').slice(0, 1000),
    history: history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-16)
      .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 1000) })),
    context: buildProxyContext(snapshot),
  });

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort('timeout'), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`${SERVICE_BASE_URL}/api/ext/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ac.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = friendlyError(res.status, text);
        if (!err.retryable || attempt === MAX_RETRIES) throw err;
        lastError = err;
      } else {
        const data = await res.json();
        const reply = data?.reply;
        if (typeof reply !== 'string' || !reply.trim()) {
          throw new ExtServiceError('پاسخ دستیار خالی بود. دوباره تلاش کنید.');
        }
        return { text: reply };
      }
    } catch (e) {
      if (e?.name === 'AbortError' || String(e?.message).includes('timeout')) {
        lastError = new ExtServiceError('مهلت پاسخ سرور تمام شد. اینترنت را بررسی کنید.', { retryable: true });
        if (attempt === MAX_RETRIES) throw lastError;
      } else if (e instanceof ExtServiceError) {
        if (!e.retryable || attempt === MAX_RETRIES) throw e;
        lastError = e;
      } else {
        secureLog.error('خطای شبکه سرویس دستیار:', e?.name || 'network-error');
        throw new ExtServiceError('اتصال به سرور دستیار برقرار نشد. اینترنت را بررسی کنید.');
      }
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
  }
  throw lastError || new ExtServiceError('خطای ناشناخته سرویس.');
}

/** بررسی سلامت سرویس (بدون مصرف توکن) */
export async function pingService() {
  try {
    const res = await fetch(`${SERVICE_BASE_URL}/api/ext/ping`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: Boolean(data?.ok), proxy: Boolean(data?.proxyEnabled) };
  } catch {
    return { ok: false };
  }
}
