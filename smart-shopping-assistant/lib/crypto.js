// ============================================================================
// crypto.js — رمزنگاری رازها در سطح افزونه (WebCrypto)
// ----------------------------------------------------------------------------
//  • الگوریتم: AES-256-GCM + مشتق‌کلید PBKDF2-SHA256 (310,000 تکرار)
//  • هر رمزگذاری: salt و IV تصادفی تازه → خروجی پاکت‌دار base64
//  • دو حالت کلید:
//      حالت ۱ (پیش‌فرض) «کلید دستگاه»: یک کلید تصادفی ۲۵۶-بیتی per-install که
//        هیچ رمزی از کاربر نمی‌خواهد. در chrome.storage.local نگه داشته می‌شود
//        و برای استفادهٔ سریع در chrome.storage.session کش می‌شود.
//      حالت ۲ (پیشرفته/اختیاری) «رمز عبور»: PBKDF2 روی رمز کاربر. فقط در
//        chrome.storage.session کش می‌شود (با بستن مرورگر پاک می‌شود).
//  • هیچ «رازی» (توکن/کلید API/شناسه) به‌صورت plaintext در storage.local
//    نوشته نمی‌شود — فقط پاکت‌های رمزنگاری‌شده.
//  • رفع باگ ۲.۲: کلید مشتق‌شده از PBKDF2 با extractable:true ساخته می‌شود،
//    چون برای «بیدار شدن دوبارهٔ Service Worker» باید بایت‌های خام آن در
//    storage.session کش شود. (پیش‌تر extractable:false بود و exportKey پرتاب
//    می‌کرد: «key is not extractable» — قفل هرگز باز نمی‌شد.)
//    storage.session فقط در حافظه است و با بستن مرورگر پاک می‌شود.
// ============================================================================

import { secureLog } from './log.js';

const PBKDF2_ITERATIONS = 310000;
const KEY_LENGTH_BITS = 256;
const SESSION_KEY_CACHE_ID = 'unlockedMasterKey'; // در chrome.storage.session
const DEVICE_KEY_ID = 'installKey';               // در chrome.storage.local
const MODE_ID = 'cryptoMode';                     // 'device' | 'passphrase'

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

/**
 * کلید مشتق‌شده باید extractable باشد تا بتوان بایت‌های خام آن را (فقط)
 * در chrome.storage.session کش کرد؛ در غیر این صورت exportKey پرتاب می‌کند.
 */
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
    true, // ← extractable: برای کش نشست لازم است (رفع باگ exportKey)
    ['encrypt', 'decrypt']
  );
}

async function importRawKey(rawBytes) {
  return subtle().importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    true,
    ['encrypt', 'decrypt']
  );
}

async function encryptWith(key, plaintext) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { iv, ct };
}

// ---------------------------------------------------------------------------
// پاکت‌های ساده (بدون passphrase) — فقط iv/ct
// ---------------------------------------------------------------------------
async function sealPacket(key, plaintext) {
  const { iv, ct } = await encryptWith(key, plaintext);
  return JSON.stringify({ v: 1, iv: b64.enc(iv), ct: b64.enc(ct) });
}

async function unsealPacket(key, packet) {
  let env;
  try {
    env = JSON.parse(packet);
  } catch {
    throw new Error('پاکت رمزنگاری‌شده معتبر نیست.');
  }
  if (!env || (!env.ct || !env.iv)) throw new Error('فرمت پاکت پشتیبانی نمی‌شود.');
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: b64.dec(env.iv) },
      key,
      b64.dec(env.ct)
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('رمزگشایی ناموفق بود — پاکت با این کلید سازگار نیست.');
  }
}

// ---------------------------------------------------------------------------
// API عمومیِ پاکت‌های مبتنی بر passphrase (برای بک‌آپ/انتقال)
// ---------------------------------------------------------------------------
/** رمزگذاری رشته → پاکت base64: {"v":1,"k":"pbkdf2-aesgcm","salt":"..","iv":"..","ct":".."} */
export async function sealString(plaintext, passphrase) {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 6) {
    throw new Error('رمز رمزنگاری باید حداقل ۶ کاراکتر باشد.');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const { iv, ct } = await encryptWith(key, plaintext);
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
// کش کلید در chrome.storage.session (فقط حافظه — با بستن مرورگر پاک می‌شود)
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
    return importRawKey(b64.dec(cached.key));
  } catch {
    return null;
  }
}

export async function invalidateUnlockedKey() {
  try {
    await chrome.storage.session.remove(SESSION_KEY_CACHE_ID);
  } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// کلید دستگاه (per-install، بدون نیاز به رمز کاربر)
// ---------------------------------------------------------------------------
/**
 * کلید دستگاه را می‌سازد (اولین اجرا) یا برمی‌گرداند.
 * توجه امنیتی صادقانه: این کلید باید جاییِ پایدار ذخیره شود تا کاربر مجبور
 * نباشد هر بار رمز وارد کند؛ تنها جای پایدار در MV3 همین storage.local است.
 * این محافظت در برابر «خواندن اتفاقی/کپی پروفایل» است، نه در برابر مهاجمی که
 * به دیسک دسترسی کامل دارد — برای انتشار عمومی، حالت پروکسی پنل توصیه می‌شود.
 * (مستند در docs/PUBLISH-CHECKLIST.md)
 */
export async function ensureDeviceKey() {
  const cached = await readCachedKey();
  if (cached) {
    // مطمئن شو کلید کش‌شده همان کلید دستگاه است
    const { [DEVICE_KEY_ID]: stored } = await chrome.storage.local.get(DEVICE_KEY_ID);
    if (stored) return cached;
  }
  const { [DEVICE_KEY_ID]: stored } = await chrome.storage.local.get(DEVICE_KEY_ID);
  if (stored) {
    const key = await importRawKey(b64.dec(stored));
    await cacheRawKey(b64.dec(stored));
    return key;
  }
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  await chrome.storage.local.set({ [DEVICE_KEY_ID]: b64.enc(raw) });
  await cacheRawKey(raw);
  return importRawKey(raw);
}

// ---------------------------------------------------------------------------
// حالت فعلی و کلیدِ فعال
// ---------------------------------------------------------------------------
async function getMode() {
  const { [MODE_ID]: mode } = await chrome.storage.local.get(MODE_ID);
  return mode === 'passphrase' ? 'passphrase' : 'device';
}

async function setMode(mode) {
  await chrome.storage.local.set({ [MODE_ID]: mode });
}

export async function isPassphraseMode() {
  return (await getMode()) === 'passphrase';
}

/**
 * کلیدِ فعال:
 *  • حالت دستگاه → همیشه در دسترس (مسیر پیش‌فرض هیچ‌وقت کاربر را بلاک نمی‌کند)
 *  • حالت رمز عبور → فقط اگر نشست باز شده باشد (در غیر این صورت null)
 */
export async function getUnlockedKey() {
  if ((await getMode()) === 'passphrase') return readCachedKey();
  return ensureDeviceKey();
}

/** آیا قفل (در حالت رمز عبور) باز است؟ */
export async function isUnlocked() {
  return Boolean(await getUnlockedKey());
}

// ---------------------------------------------------------------------------
// رمزگذاری/رمزگشایی رازها با کلید فعال
// ---------------------------------------------------------------------------
/** رمزگذاری یک راز با کلید فعال */
export async function sealWithUnlockedKey(plaintext) {
  const key = await getUnlockedKey();
  if (!key) throw new Error('قفل رمزنگاری بسته است؛ ابتدا رمز را وارد کنید.');
  return sealPacket(key, plaintext);
}

/** رمزگشایی پاکت با کلید فعال؛ null یعنی قفل بسته است */
export async function unsealWithUnlockedKey(packet) {
  const key = await getUnlockedKey();
  if (!key) return null;
  return unsealPacket(key, packet);
}

/** رمزگشایی با کلید دستگاه (حتی وقتی حالت رمز عبور فعال است — برای بازیابی) */
export async function unsealWithDeviceKey(packet) {
  const key = await ensureDeviceKey();
  try {
    return await unsealPacket(key, packet);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// مسیر رمز عبور (قابلیت پیشرفته و اختیاری)
// ---------------------------------------------------------------------------
const RESEAL_KEYS = ['sealedTgToken', 'sealedTgChatId', 'sealedAvalaiKey'];

/** همهٔ رازهای ذخیره‌شده را از یک کلید به کلید دیگر منتقل می‌کند. */
async function resealSecrets(fromKey, toKey) {
  if (!fromKey || !toKey) return;
  const stored = await chrome.storage.local.get(RESEAL_KEYS);
  const patch = {};
  for (const k of RESEAL_KEYS) {
    const packet = stored[k];
    if (!packet) continue;
    try {
      const plain = await unsealPacket(fromKey, packet);
      patch[k] = await sealPacket(toKey, plain);
    } catch {
      // پاکت با کلید قبلی سازگار نیست — حذف می‌شود (نمی‌توان بازیابی کرد)
      patch[k] = null;
    }
  }
  const toRemove = Object.keys(patch).filter((k) => patch[k] === null);
  const toSet = {};
  for (const k of Object.keys(patch)) if (patch[k] !== null) toSet[k] = patch[k];
  if (Object.keys(toSet).length) await chrome.storage.local.set(toSet);
  if (toRemove.length) await chrome.storage.local.remove(toRemove);
}

/**
 * باز کردن قفل: با passphrase یک کلید می‌سازد، صحتش را با رکورد «تست»
 * می‌سنجد و در طول نشست کش می‌کند.
 */
export async function unlockWithPassphrase(passphrase) {
  if (!passphrase) throw new Error('رمز رمزنگاری الزامی است.');
  const { masterSalt } = await chrome.storage.local.get('masterSalt');
  if (!masterSalt) throw new Error('هنوز رمز رمزنگاری تنظیم نشده است.');
  const key = await deriveKey(passphrase, b64.dec(masterSalt));

  const { integrityProbe } = await chrome.storage.local.get('integrityProbe');
  if (integrityProbe?.sealed) {
    const iv = b64.dec(integrityProbe.iv);
    try {
      const pt = await subtle().decrypt({ name: 'AES-GCM', iv }, key, b64.dec(integrityProbe.sealed));
      if (new TextDecoder().decode(pt) !== 'integrity-ok') {
        throw new Error('bad-probe');
      }
    } catch {
      throw new Error('رمز رمزنگاری اشتباه است.');
    }
  }
  // ذخیرهٔ بایت‌های خام کلید برای import سریع در بیدار شدن بعدی SW
  await cacheRawKey(new Uint8Array(await subtle().exportKey('raw', key)));
  return true;
}

/**
 * راه‌اندازی اولیهٔ رمز عبور: salt + رکورد تست می‌سازد، رازها را به کلید جدید
 * منتقل می‌کند و قفل را باز می‌گذارد.
 */
export async function setupMasterPassphrase(passphrase) {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('رمز رمزنگاری باید حداقل ۶ کاراکتر باشد.');
  }
  const previousKey = await getUnlockedKey().catch(() => null);

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const { iv, ct } = await encryptWith(key, 'integrity-ok');

  await resealSecrets(previousKey, key);

  await chrome.storage.local.set({
    masterSalt: b64.enc(salt),
    integrityProbe: { sealed: b64.enc(ct), iv: b64.enc(iv) },
    [MODE_ID]: 'passphrase',
  });
  await cacheRawKey(new Uint8Array(await subtle().exportKey('raw', key)));
  return true;
}

/** غیرفعال کردن قفل رمز عبور و بازگشت به کلید دستگاه (مسیر پیش‌فرض) */
export async function disablePassphrase() {
  const current = await getUnlockedKey();
  const deviceKey = await ensureDeviceKey();
  if (current) await resealSecrets(current, deviceKey);
  await chrome.storage.local.remove(['masterSalt', 'integrityProbe']);
  await setMode('device');
  await invalidateUnlockedKey();
  await ensureDeviceKey();
  return true;
}

// ---------------------------------------------------------------------------
// تشخیص و بازیابی نصب‌های نیمه‌پیکربندی‌شده («گیرکرده»)
// ---------------------------------------------------------------------------
/**
 * تشخیص وضعیت: اگر masterSalt وجود دارد (یعنی نصب قدیمی/نیمه‌پیکربندی‌شده)
 * اما هیچ کلیدی در دسترس نیست و رازها با کلید دستگاه باز نمی‌شوند،
 * رمزنگاری «شکسته» تلقی می‌شود و باید بازنشانی شود.
 */
export async function diagnoseCrypto() {
  const { masterSalt, sealedTgToken, sealedTgChatId, sealedAvalaiKey,
    [DEVICE_KEY_ID]: installKey } = await chrome.storage.local.get(
    ['masterSalt', 'sealedTgToken', 'sealedTgChatId', 'sealedAvalaiKey', DEVICE_KEY_ID]
  );
  const hasSealed = Boolean(sealedTgToken || sealedTgChatId || sealedAvalaiKey);
  const sessionKey = await readCachedKey();
  const mode = await getMode();

  if (!masterSalt) {
    return { broken: false, unlocked: Boolean(sessionKey) || mode === 'device', mode };
  }
  // حالت رمز عبورِ سالم: یا نشست باز است یا کاربر می‌تواند باز کند
  if (mode === 'passphrase') {
    return { broken: false, unlocked: Boolean(sessionKey), mode };
  }
  // masterSalt باقی‌مانده از نصب قدیمی ولی کلید دستگاه نداریم/باز نمی‌شود
  if (hasSealed && installKey) {
    const probe = sealedTgToken || sealedTgChatId || sealedAvalaiKey;
    const opened = await unsealWithDeviceKey(probe);
    if (opened) return { broken: false, unlocked: true, mode };
  }
  if (hasSealed && !installKey) {
    return { broken: true, unlocked: false, mode, reason: 'legacy-salt-without-key' };
  }
  return { broken: false, unlocked: Boolean(sessionKey) || Boolean(installKey), mode };
}

/**
 * بازنشانی کامل رمزنگاری: پاکت‌های قدیمی، masterSalt و integrityProbe پاک
 * می‌شوند و یک کلید تازهٔ نصب ساخته می‌شود.
 * هشدار: رازهای قبلی (توکن ربات/کلید API) قابل بازیابی نیستند و باید دوباره
 * وارد یا از owner-config بازیابی شوند.
 */
export async function resetCrypto() {
  await chrome.storage.local.remove([
    'masterSalt', 'integrityProbe', DEVICE_KEY_ID,
    ...RESEAL_KEYS,
  ]);
  await invalidateUnlockedKey();
  await setMode('device');
  const key = await ensureDeviceKey();
  secureLog.warn('رمزنگاری بازنشانی شد؛ رازهای قبلی باید دوباره وارد شوند.');
  return { ok: true, resealed: Boolean(key) };
}

// ---------------------------------------------------------------------------
// ابزار نمایش
// ---------------------------------------------------------------------------
/** پوشاندن راز برای نمایش در UI (فقط ۴ کاراکتر اول و آخر) */
export function maskSecret(value) {
  const s = String(value || '');
  if (!s) return '';
  if (s.length <= 8) return '••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}
