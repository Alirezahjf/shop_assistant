// ============================================================================
// stores.js — جستجوی محصول در گوگل و فروشگاه‌های معتبر ایرانی و خارجی
// ----------------------------------------------------------------------------
// همه لینک‌ها deterministic و سمت کلاینت ساخته می‌شوند (مصرف صفر توکن).
// برای فروشگاه‌هایی که فرمت URL جستجوی پایدار ندارند، از جستجوی site: گوگل
// استفاده می‌شود تا همیشه نتیجه درست برگردد.
// ============================================================================

function q(value) {
  return encodeURIComponent(String(value || '').trim()).replace(/%20/g, '+');
}

export const STORES = [
  {
    id: 'google', name: 'گوگل', region: 'global', direct: true,
    build: (s) => `https://www.google.com/search?q=${q(s)}`,
  },
  {
    id: 'google-shopping', name: 'گوگل شاپینگ', region: 'global', direct: true,
    build: (s) => `https://www.google.com/search?tbm=shop&q=${q(s)}`,
  },
  {
    id: 'digikala', name: 'دیجی‌کالا', region: 'ir', direct: true,
    build: (s) => `https://www.digikala.com/search/?q=${q(s)}`,
  },
  {
    id: 'torob', name: 'ترب', region: 'ir', direct: true,
    build: (s) => `https://torob.com/search/?query=${q(s)}`,
  },
  {
    id: 'emalls', name: 'ایمالز', region: 'ir', direct: false,
    build: (s) => `https://www.google.com/search?q=${q(`site:emalls.ir ${s}`)}`,
  },
  {
    id: 'technolife', name: 'تکنولایف', region: 'ir', direct: false,
    build: (s) => `https://www.google.com/search?q=${q(`site:technolife.ir ${s}`)}`,
  },
  {
    id: 'mobit', name: 'موبیت', region: 'ir', direct: false,
    build: (s) => `https://www.google.com/search?q=${q(`site:mobit.ir ${s}`)}`,
  },
  {
    id: 'basalam', name: 'باسلام', region: 'ir', direct: true,
    build: (s) => `https://basalam.com/search?q=${q(s)}`,
  },
  {
    id: 'amazon', name: 'آمازون', region: 'global', direct: true,
    build: (s) => `https://www.amazon.com/s?k=${q(s)}`,
  },
  {
    id: 'aliexpress', name: 'علی‌اکسپرس', region: 'global', direct: true,
    build: (s) => `https://www.aliexpress.com/w/wholesale-${q(s)}.html`,
  },
  {
    id: 'ebay', name: 'ای‌بی', region: 'global', direct: true,
    build: (s) => `https://www.ebay.com/sch/i.html?_nkw=${q(s)}`,
  },
  {
    id: 'etsy', name: 'اتسی', region: 'global', direct: true,
    build: (s) => `https://www.etsy.com/search?q=${q(s)}`,
  },
];

/** ساخت لینک جستجو برای همه فروشگاه‌ها */
export function buildStoreLinks(searchText) {
  const s = String(searchText || '').trim();
  if (!s) return [];
  return STORES.map((store) => ({
    id: store.id,
    name: store.name,
    region: store.region,
    direct: store.direct,
    url: store.build(s),
  }));
}

/** نام فروشگاه از روی لینک محصول (برای برچسب کارت — رفع باگ برچسب ثابت دیجی‌کالا) */
export function storeNameFromLink(link) {
  try {
    const host = new URL(link).hostname.replace(/^www\./, '');
    const known = {
      'digikala.com': 'دیجی‌کالا',
      'torob.com': 'ترب',
      'technolife.ir': 'تکنولایف',
      'mobit.ir': 'موبیت',
      'basalam.com': 'باسلام',
      'amazon.com': 'آمازون',
      'aliexpress.com': 'علی‌اکسپرس',
      'ebay.com': 'ای‌بی',
      'etsy.com': 'اتسی',
    };
    for (const [d, name] of Object.entries(known)) {
      if (host === d || host.endsWith('.' + d)) return name;
    }
    return null;
  } catch {
    return null;
  }
}
