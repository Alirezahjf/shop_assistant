// ============================================================================
// collect.js — جمع‌آوری و پاکسازی داده‌های مرور (تنها نقطه ورود داده خام)
// ----------------------------------------------------------------------------
// مهم: داده خام (کوکی کامل / رکورد خام history) فقط در حافظه همین تابع زندگی
// می‌کند و هرگز در storage نوشته نمی‌شود. خروجیِ قابل ذخیره، فقط Snapshotِ
// پاکسازی‌شده (sanitize.buildSnapshot + finalIntegrityScrub) است.
// ============================================================================

import { secureLog } from './log.js';
import { buildSnapshot, finalIntegrityScrub } from './sanitize.js';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';

async function getHistory(days, maxItems) {
  const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Promise((resolve) => {
    try {
      chrome.history.search({ text: '', startTime, maxResults: maxItems }, (items) =>
        resolve(Array.isArray(items) ? items : [])
      );
    } catch (e) {
      secureLog.warn('history در دسترس نیست:', e?.message);
      resolve([]);
    }
  });
}

async function getCookies() {
  return new Promise((resolve) => {
    try {
      chrome.cookies.getAll({}, (items) => resolve(Array.isArray(items) ? items : []));
    } catch (e) {
      secureLog.warn('cookies در دسترس نیست:', e?.message);
      resolve([]);
    }
  });
}

/**
 * جمع‌آوری کامل + پاکسازی چندلایه + اسکراب نهایی + ذخیره امن.
 * @returns {{snapshot: object, report: object}}
 */
export async function collectAndSanitize() {
  const { [STORAGE_KEYS.settings]: settings } = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const days = Math.min(Math.max(Number(s.historyDays) || 30, 1), 90);

  // داده خام فقط در این تابع زندگی می‌کند
  const [history, cookies] = await Promise.all([getHistory(days, 5000), getCookies()]);

  let snapshot = buildSnapshot({ history, cookies }, { days, deviceLabel: s.deviceLabel });
  const scrub = finalIntegrityScrub(snapshot);
  snapshot = scrub.snapshot;

  if (scrub.issues.length > 0) {
    // اگر ever فعال شود یعنی فیلتر بالادستی جا خورده — آماری گزارش می‌شود
    secureLog.warn('اسکراب نهایی مواردی را حذف کرد:', scrub.issues.length);
  }

  // ذخیره فقطِ نسخه پاکسازی‌شده
  await chrome.storage.local.set({
    [STORAGE_KEYS.snapshot]: snapshot,
    lastCollectedAt: Date.now(),
  });
  try {
    await chrome.storage.session.set({ [STORAGE_KEYS.snapshot]: snapshot });
  } catch { /* session اختیاری است */ }

  return { snapshot, report: snapshot.privacy };
}

/** آخرین اسنپ‌شات پاکسازی‌شده ذخیره‌شده (یا null) */
export async function getStoredSnapshot() {
  const local = await chrome.storage.local.get(STORAGE_KEYS.snapshot);
  return local[STORAGE_KEYS.snapshot] || null;
}

/** حذف کامل همه داده‌های ذخیره‌شده کاربر */
export async function clearAllData() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.snapshot, 'lastCollectedAt',
  ]);
  try {
    await chrome.storage.session.remove([STORAGE_KEYS.snapshot, STORAGE_KEYS.chat]);
  } catch { /* noop */ }
}
