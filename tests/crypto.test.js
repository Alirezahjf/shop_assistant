// ============================================================================
// tests/crypto.test.js — تست رگرسیون رمزنگاری افزونه (Node + node:crypto WebCrypto)
// ----------------------------------------------------------------------------
// اجرا: node --test tests/crypto.test.js
//
// هدف اصلی: جلوگیری از بازگشت باگِ
//   «Failed to execute 'exportKey' on 'SubtleCrypto': key is not extractable»
// که باعث می‌شد setupMasterPassphrase / unlockWithPassphrase همیشه شکست بخورند.
// این تست روی کدِ قبل از اصلاح fail می‌شد (در setupMasterPassphrase).
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

// --- محیط مرورگرِ کمینه (WebCrypto + btoa/atob + chrome.storage) ---
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');

function makeStorageArea() {
  const map = new Map();
  return {
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (map.has(k)) out[k] = map.get(k);
      return out;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) map.set(k, v);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) map.delete(k);
    },
    _dump: () => Object.fromEntries(map),
  };
}

function installChromeMock() {
  globalThis.chrome = {
    storage: {
      local: makeStorageArea(),
      session: makeStorageArea(),
    },
  };
}

installChromeMock();

const cryptoLib = await import('../smart-shopping-assistant/lib/crypto.js');
const {
  sealString, unsealString, setupMasterPassphrase, unlockWithPassphrase,
  getUnlockedKey, sealWithUnlockedKey, unsealWithUnlockedKey,
  ensureDeviceKey, diagnoseCrypto, resetCrypto, disablePassphrase,
  maskSecret, invalidateUnlockedKey,
} = cryptoLib;

test('sealString → unsealString رفت‌وبرگشت درست کار می‌کند', async () => {
  const secret = '123456789:AAF-یک-توکن-تلگرام-خیلی-محرمانه';
  const packet = await sealString(secret, 'رمز-عبور-قدرتمند');
  assert.equal(typeof packet, 'string');
  assert.ok(packet.includes('"k":"pbkdf2-aesgcm"'), 'پاکت باید شناسهٔ الگوریتم داشته باشد');
  assert.ok(!packet.includes(secret), 'راز نباید در پاکت plaintext باشد');
  const opened = await unsealString(packet, 'رمز-عبور-قدرتمند');
  assert.equal(opened, secret);
});

test('پاکت‌های مختلف IV متفاوت دارند (تکرار nonce ممنوع)', async () => {
  const a = JSON.parse(await sealString('یک راز', 'رمز-عبور-قدرتمند'));
  const b = JSON.parse(await sealString('یک راز', 'رمز-عبور-قدرتمند'));
  assert.notEqual(a.iv, b.iv);
});

test('setupMasterPassphrase بدون خطا کامل می‌شود (رفع باگ exportKey)', async () => {
  // روی کدِ قبل از اصلاح، این خط پرتاب می‌کرد:
  // «Failed to execute 'exportKey' on 'SubtleCrypto': key is not extractable»
  await assert.doesNotReject(() => setupMasterPassphrase('رمز-عبور-قدرتمند'));
  const key = await getUnlockedKey();
  assert.ok(key, 'بعد از setup باید کلید در دسترس باشد');
});

test('unlockWithPassphrase بدون خطا کامل می‌شود (رفع باگ exportKey)', async () => {
  await setupMasterPassphrase('رمز-عبور-قدرتمند');
  // نشست را پاک می‌کنیم تا مسیر واقعیِ باز کردن قفل طی شود
  await invalidateUnlockedKey();
  globalThis.chrome.storage.session = makeStorageArea();
  await assert.doesNotReject(() => unlockWithPassphrase('رمز-عبور-قدرتمند'));
  assert.ok(await getUnlockedKey(), 'قفل باید باز شده باشد');
});

test('رمز اشتباه پیام فارسی درست می‌دهد', async () => {
  await setupMasterPassphrase('رمز-عبور-قدرتمند');
  globalThis.chrome.storage.session = makeStorageArea();
  await assert.rejects(
    () => unlockWithPassphrase('رمز-کاملاً-اشتباه'),
    (err) => {
      assert.equal(err.message, 'رمز رمزنگاری اشتباه است.');
      return true;
    }
  );
});

test('پاکت نامعتبر پیام فارسی می‌دهد', async () => {
  await assert.rejects(
    () => unsealString('این-یک-پاکت-نیست', 'رمز-عبور-قدرتمند'),
    (err) => {
      assert.equal(err.message, 'پاکت رمزنگاری‌شده معتبر نیست.');
      return true;
    }
  );
});

test('رمز کوتاه‌تر از ۶ کاراکتر پذیرفته نمی‌شود', async () => {
  await assert.rejects(
    () => sealString('راز', '۱۲۳'),
    (err) => {
      assert.equal(err.message, 'رمز رمزنگاری باید حداقل ۶ کاراکتر باشد.');
      return true;
    }
  );
});

test('کلید دستگاه: بدون رمز کاربر، رفت‌وبرگشت درست است', async () => {
  await resetCrypto();
  const key = await ensureDeviceKey();
  assert.ok(key);
  const packet = await sealWithUnlockedKey('توکن-خیلی-محرمانه');
  assert.equal(await unsealWithUnlockedKey(packet), 'توکن-خیلی-محرمانه');
  // راز خام هرگز در storage.local نوشته نمی‌شود
  const dump = JSON.stringify(globalThis.chrome.storage.local._dump());
  assert.ok(!dump.includes('توکن-خیلی-محرمانه'), 'راز نباید plaintext در storage.local باشد');
});

test('diagnoseCrypto نصبِ نیمه‌پیکربندی‌شده را cryptoBroken گزارش می‌دهد', async () => {
  await resetCrypto();
  // وضعیتِ گیرکردهٔ واقعی: masterSalt و پاکتِ قدیمی هست، ولی کلید دستگاه نداریم
  globalThis.chrome.storage.local = makeStorageArea();
  await globalThis.chrome.storage.local.set({
    masterSalt: globalThis.btoa('1234567890123456'),
    integrityProbe: { sealed: globalThis.btoa('aaaa'), iv: globalThis.btoa('bbbbbbbbbbbb') },
    sealedTgToken: JSON.stringify({ v: 1, iv: globalThis.btoa('cccccccccccc'), ct: globalThis.btoa('dddd') }),
  });
  globalThis.chrome.storage.session = makeStorageArea();

  const diag = await diagnoseCrypto();
  assert.equal(diag.broken, true, 'نصبِ نیمه‌پیکربندی‌شده باید شکسته تشخیص داده شود');

  // بازنشانی: masterSalt و integrityProbe و پاکت‌های قدیمی پاک می‌شوند
  const res = await resetCrypto();
  assert.equal(res.ok, true);
  const after = globalThis.chrome.storage.local._dump();
  assert.equal(after.masterSalt, undefined);
  assert.equal(after.integrityProbe, undefined);
  assert.equal(after.sealedTgToken, undefined);
  assert.ok(after.installKey, 'بعد از بازنشانی باید کلید تازهٔ نصب ساخته شود');
  const diag2 = await diagnoseCrypto();
  assert.equal(diag2.broken, false);
});

test('بعد از بازنشانی می‌توان دوباره راز ذخیره کرد', async () => {
  const packet = await sealWithUnlockedKey('کلید-جدید-avalai');
  assert.equal(await unsealWithUnlockedKey(packet), 'کلید-جدید-avalai');
});

test('disablePassphrase بدون خطا به حالت کلید دستگاه برمی‌گردد', async () => {
  await resetCrypto();
  await setupMasterPassphrase('رمز-عبور-قدرتمند');
  await sealWithUnlockedKey('راز-منتقل-شونده');
  await assert.doesNotReject(() => disablePassphrase());
  const diag = await diagnoseCrypto();
  assert.equal(diag.mode, 'device');
  assert.equal(diag.unlocked, true);
});

test('maskSecret مقدار خام را فاش نمی‌کند', () => {
  const masked = maskSecret('aa-1234567890abcdef');
  assert.ok(!masked.includes('1234567890abcdef'));
  assert.equal(maskSecret(''), '');
});
