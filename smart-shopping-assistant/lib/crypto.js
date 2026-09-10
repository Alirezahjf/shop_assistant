// ============================================================================
// crypto.js — رمزنگاری رازها در سطح افزونه (WebCrypto)
// ----------------------------------------------------------------------------
//  • الگوریتم: AES-256-GCM + مشتق‌کلید PBKDF2-SHA256 (310,000 تکرار)
//  • هر رمزگذاری: salt و IV تصادفی تازه → خروجی پاکت‌دار base64
//  • کلید مشتق‌شده برای «طول یک نشانه مرورگر» در chrome.storage.session کش
//    می‌شود (با بستن مرورگر پاک می‌شود) تا کاربر هر بار مجبور به تایپ رمز نباشد.
//  • هیچ رازی به‌صورت plaintext در storage.local نوشته نمی‌شود.
//  • منط محدود به وضعیت است؛ توکن/کلید هرگز لاگ نمی‌شود (log.js هم redact می‌کند).
// ============================================================================

import { secureLog } from './log.js';

const PBKDF2_ITERATIONS = 310000;
const KEY_LENGTH_BITS = 256;
const SESSION_KEY_CACHE_ID = 'unlockedMasterKey'; // در chrome.storage.session

const subtle = () => globalThis.crypto.subtle;
const b64 = {
  enc(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  },
  dec(str) {
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  },
};

async function deriveKey(passphrase, salt) {
  const baseKey = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

/** رمزگذاری رشته → پاکت base64: {"v":1,"salt":"..","iv":"..","ct":".."} */
export async function sealString(plaintext, passphrase) {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 6) {
    throw new Error('رمز رمزنگاری باید حداقل ۶ کاراکتر باشد.');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return JSON.stringify({
    v: 1,
    k: 'pbkdf2-aesgcm',
    iters: PBKDF2_ITERATIONS,
    salt: b64.enc(salt),
    iv: b64.enc(iv),
    ct: b64.enc(ct),
  });
}

/** رمزگشایی پاکت؛ در صورت رمز اشتباه خطای مشخص می‌دهد. */
export async function unsealString(packet, passphrase) {
  let env;
  try {
    env = JSON.parse(packet);
  } catch {
    throw new Error('پاکت رمزنگاری‌شده معتبر نیست.');
  }
  if (!env || env.k !== 'pbkdf2-aesgcm') throw new Error('فرمت پاکت پشتیبانی نمی‌شود.');
  const key = await deriveKey(passphrase, b64.dec(env.salt));
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: b64.dec(env.iv) },
      key,
      b64.dec(env.ct)
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('رمز رمزنگاری اشتباه است.');
  }
}

// ---------------------------------------------------------------------------
// کش کلید بازشده در طول نشانه مرورگر (chrome.storage.session)
// ---------------------------------------------------------------------------
async function cacheRawKey(rawKeyBytes) {
  try {
    await chrome.storage.session.set({
      [SESSION_KEY_CACHE_ID]: { key: b64.enc(rawKeyBytes), at: Date.now() },
    });
  } catch (e) {
    secureLog.warn('کش کلید نشست ناموفق بود:', e?.message);
  }
}

async function readCachedKey() {
  try {
    const { [SESSION_KEY_CACHE_ID]: cached } = await chrome.storage.session.get(SESSION_KEY_CACHE_ID);
    if (!cached?.key) return null;
    return await subtle().importKey(
      'raw',
      b64.dec(cached.key),
      { name: 'AES-GCM', length: KEY_LENGTH_BITS },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

export async function invalidateUnlockedKey() {
  try {
    await chrome.storage.session.remove(SESSION_KEY_CACHE_ID);
  } catch { /* noop */ }
}

/**
 * باز کردن قفل: با passphrase یک کلید می‌سازد، صحتش را با یک رکورد کوچکِ
 * «تست» می‌سنجد و در طول نشست کش می‌کند.
 */
export async function unlockWithPassphrase(passphrase) {
  if (!passphrase) throw new Error('رمز رمزنگاری الزامی است.');
  const { masterSalt } = await chrome.storage.local.get('masterSalt');
  if (!masterSalt) throw new Error('هنوز رمز رمزنگاری تنظیم نشده است.');
  const salt = b64.dec(masterSalt);
  const key = await deriveKey(passphrase, salt);

  const { integrityProbe } = await chrome.storage.local.get('integrityProbe');
  if (integrityProbe?.sealed) {
    // صحت‌سنجی: رمزگشایی رکورد تست
    const iv = b64.dec(integrityProbe.iv);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv }, key, b64.dec(integrityProbe.sealed));
    if (new TextDecoder().decode(pt) !== 'integrity-ok') {
      throw new Error('رمز رمزنگاری اشتباه است.');
    }
  }
  // ذخیره بایت‌های خام کلید برای import سریع در بیدار شدن بعدی SW
  await cacheRawKey(await exportRaw(key));
  return true;
}

async function exportRaw(key) {
  return new Uint8Array(await subtle().exportKey('raw', key));
}

/** کلید بازِ فعلی (از کش نشست) یا null */
export async function getUnlockedKey() {
  return readCachedKey();
}

/** رمزگذاری یک راز با کلید بازشده (بدون نیاز به passphrase در هر بار) */
export async function sealWithUnlockedKey(plaintext) {
  const key = await getUnlockedKey();
  if (!key) throw new Error('قفل رمزنگاری بسته است؛ ابتدا رمز را وارد کنید.');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return JSON.stringify({ v: 1, iv: b64.enc(iv), ct: b64.enc(ct) });
}

/** رمزگشایی پاکت با کلید بازشده */
export async function unsealWithUnlockedKey(packet) {
  const key = await getUnlockedKey();
  if (!key) return null; // قفل بسته است — نه خطا؛ تماس‌گیرنده تصمیم می‌گیرد
  let env;
  try {
    env = JSON.parse(packet);
  } catch {
    throw new Error('پاکت نامعتبر.');
  }
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: b64.dec(env.iv) }, key, b64.dec(env.ct));
  return new TextDecoder().decode(pt);
}

/**
 * راه‌اندازی اولیه رمز اصلی: salt + رکورد تست می‌سازد و قفل را باز می‌کند.
 */
export async function setupMasterPassphrase(passphrase) {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('رمز رمزنگاری باید حداقل ۶ کاراکتر باشد.');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode('integrity-ok')
  );
  await chrome.storage.local.set({
    masterSalt: b64.enc(salt),
    integrityProbe: { sealed: b64.enc(ct), iv: b64.enc(iv) },
  });
  await cacheRawKey(await exportRaw(key));
  return true;
}

/** پوشاندن راز برای نمایش در UI (فقط ۴ کاراکتر آخر) */
export function maskSecret(value) {
  const s = String(value || '');
  if (s.length <= 6) return '••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}
