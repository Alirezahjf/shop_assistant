# تغییرات نگارش ۲.۲ — رفع باگ‌ها + بازنگری AvalAI + ساده‌سازی جریان کاربر

تاریخ: ۱۴۰۴/۰۶/۱۹ (۲۰۲۶-۰۹-۱۰) · شاخه: `arena/01a08c00-shop-assistant`

---

## الف) رفع باگِ قفل رمزنگاری (اولویت اول)

**علت ریشه‌ای:** در `smart-shopping-assistant/lib/crypto.js`، تابع `deriveKey`
کلید AES-GCM را با `extractable: false` می‌ساخت، اما `exportRaw` روی همان کلید
`subtle.exportKey('raw', key)` صدا می‌زد ⇒
`Failed to execute 'exportKey' on 'SubtleCrypto': key is not extractable`.
چون `exportRaw` در انتهای `unlockWithPassphrase` و `setupMasterPassphrase`
فراخوانی می‌شد، قفل هرگز باز نمی‌شد. بدتر اینکه `setupMasterPassphrase`
پیش از کرش، `masterSalt` و `integrityProbe` را در `storage.local` نوشته بود ⇒
نصب در وضعیت «نیمه‌پیکربندی‌شده» گیر می‌کرد و ذخیرهٔ تنظیمات تلگرام هم
(که از `unlockWithPassphrase` استفاده می‌کرد) شکست می‌خورد.

**راه‌حل انتخاب‌شده:** کلید مشتق‌شده با `extractable: true` ساخته می‌شود
(گزینهٔ «الف» از دو گزینهٔ پیشنهادی).

**چرا «الف» و نه «ب»؟**
در گزینهٔ «ب» (حذف `exportRaw` و نگه‌داشتن passphrase در نشست) باید یا
passphrase را در `storage.session` نگه می‌داشتیم (که با مرگ Service Worker در
MV3 از بین می‌رفت و هر بار صفحهٔ قفل برمی‌گشت — دقیقاً همان چیزی که کاربر از آن
شکایت داشت)، یا اصلاً چیزی کش نمی‌کردیم (هر بار PBKDF2 با ۳۱۰٬۰۰۰ تکرار روی هر
پیام). با `extractable: true` بایت‌های خام کلید فقط در
`chrome.storage.session` کش می‌شوند که **فقط در حافظه است و با بستن مرورگر پاک
می‌شود**؛ بنابراین سطح حمله عملاً همان است، اما تجربهٔ کاربر درست می‌ماند.
هیچ راز خامی هرگز به `storage.local` نوشته نمی‌شود.

**تغییراتِ پیاده‌سازی‌شده:**

| فایل | تغییر |
|---|---|
| `lib/crypto.js` | `deriveKey` با `extractable:true`؛ افزودن «کلید دستگاه» (per-install، بدون رمز کاربر)؛ `ensureDeviceKey`؛ `diagnoseCrypto`؛ `resetCrypto`؛ `disablePassphrase`؛ انتقالِ خودکار رازها هنگام تغییر حالت |
| `tests/crypto.test.js` | **جدید** — ۱۲ تست: رفت‌وبرگشت seal/unseal، اجرای بدون خطای `setupMasterPassphrase`/`unlockWithPassphrase`، پیام فارسیِ رمز اشتباه، تشخیص و بازنشانی نصبِ گیرکرده |
| `background.js` | `get_state` فلگ `cryptoBroken` را می‌فرستد؛ هندلر `reset_crypto`؛ حذف نیاز به passphrase در `save_settings` |
| `popup/popup.html` | بنرِ «رمزنگاری نیمه‌پیکربندی» + دکمهٔ «بازنشانی رمزنگاری» |

**اثبات:** روی کدِ قبل از اصلاح، `setupMasterPassphrase` با همان خطای
`key is not extractable` شکست می‌خورد (تأییدشده با اجرای کدِ `HEAD` در یک
محیط موقت)؛ بعد از اصلاح ۱۲/۱۲ تست پاس است.

---

## ب) بازنگری بخش هوش مصنوعی با مستندات رسمی AvalAI

منابع (تاریخ بازبینی: ۲۰۲۶-۰۹-۱۰):
[Chat Completions](https://docs.avalai.ir/en/api-reference/chat) ·
[Quickstart](https://docs.avalai.ir/en/quickstart) ·
[Models](https://docs.avalai.ir/en/models/) ·
[Model details](https://docs.avalai.ir/en/models/model-details)

| # | قبل | بعد | منبع مستند |
|---|---|---|---|
| ۱ | همه‌جا `max_tokens` | `max_completion_tokens` پیش‌فرض؛ در صورت ۴۰۰ِ «پارامتر ناشناخته» یک‌بار با `max_tokens` تلاش مجدد | chat#request-body: «`max_tokens` … Legacy … Deprecated … not compatible with some reasoning models» |
| ۲ | همیشه `temperature` فرستاده می‌شد | فقط وقتی مدل آن را می‌پذیرد؛ روی ۴۰۰، فیلدهای ممنوع حذف و تلاش مجدد | chat: kimi فقط `reasoning_effort:"max"` و حذف temperature؛ مدل‌های reasoning ممکن است فیلدهای قدیمی را رد کنند |
| ۳ | هیچ `reasoning_effort`/`thinking` ارسال نمی‌شد | `glm-5.3` → `thinking.type:"enabled"` الزامی؛ `kimi`/`deepseek`/`gpt-6-astra`/`qwen3.8` → `reasoning_effort` | chat#model-notes برای GLM/Kimi/Qwen/DeepSeek |
| ۴ | `claude-fable-5-1` در فهرست پیشنهادی، بدون توضیح | با برچسب «نیازمند Tier 2+» نگه داشته شد و از پیش‌فرض‌ها حذف شد | chat: «access requires Tier 2 or higher» |
| ۵ | فهرست مدل‌ها ایستا و شامل aliasِ قدیمی | هم‌تراز با مستندات؛ `gemini-flash-latest` به‌عنوان aliasِ `gemini-3.8-flash` برچسب خورد؛ `nemotron-3.5-lightning` و `qwen3.8-27b` اضافه شدند | models/ و chat#model-notes |
| ۶ | هیچ راهی برای گرفتن فهرستِ زنده نبود | دکمهٔ «دریافت فهرست مدل‌ها» + endpointهای افزودنی `/api/ext/models` (عمومی) و `/api/models` (مدیر) که از `/v1/models` و در fallback از `/public/models` پر می‌شوند | quickstart#list-available-models-via-api |
| ۷ | پیغامِ ۴۰۲/۴۰۳/۴۲۲ نداشتیم | ۴۰۱/۴۰۳ = کلید/دسترسی، ۴۰۲ = اعتبار ناکافی، ۴۰۴ = مدل یافت نشد، ۴۲۹ = محدودیت نرخ، ۴۲۲ = پارامتر نامعتبر | chat#error-handling |
| ۸ | هدر `avalai-request-id` نادیده گرفته می‌شد | فقط همین شناسه (بدون هیچ راز) در لاگ ثبت می‌شود | quickstart#get-the-request-id |

فایل‌ها: `admin-panel/app/avalai.py` (بازنویسی)، `admin-panel/app/config.py`،
`admin-panel/app/extproxy.py`، `admin-panel/app/main.py` (فقط endpointهای
افزودنی)، `admin-panel/app/static/app-core.js`، `admin-panel/app/templates/index.html`،
`smart-shopping-assistant/lib/ai.js` (بازنویسی).

**قید حفظ شد:** مسیرها و شکل JSONِ همهٔ endpointهای موجود دست‌نخورده ماند؛
فقط دو endpoint **افزوده** شد (`GET /api/ext/models` و `GET /api/models`).

---

## پ) تغییر معماریِ جریان کاربری

۱. **تصمیمِ ارسال به تلگرام از کاربر گرفته شد.** سوییچ «ارسال خروجی به ربات
   تلگرام» (و هر toggle مشابه) از UI حذف شد. سیاست ثابت: پس از هر استخراج موفق،
   خروجیِ پاکسازی‌شده به‌طور خودکار با `sendSnapshotToTelegram` ارسال می‌شود؛
   نتیجه با توست و لاگ (بدون راز) گزارش می‌شود.
۲. **متن رضایت صادقانه شد:** «کلیک روی موافقم = اقدام صریح؛ خروجی پاکسازی‌شده
   به‌طور خودکار به ربات تلگرام خودت ارسال می‌شود». تب «داده و حریم خصوصی» هم
   هم‌راستا شد.
۳. **رازها داخل افزونه و رمزنگاری‌شده:** فایل جدید
   `smart-shopping-assistant/lib/owner-config.js` (توکن ربات، شناسهٔ عددی، کلید
   AvalAI، مدل پیش‌فرض) + `lib/secrets.js` که در اولین اجرا (کلیک موافقت) این
   مقادیر را با AES-256-GCM و کلید دستگاه در `storage.local` ذخیره می‌کند.
   هیچ plaintextی روی دیسک نمی‌ماند و کاربر **هیچ رمزی** وارد نمی‌کند.
۴. **حذف اصطکاک ورود:** خوش‌آمد → تیک «می‌پذیرم» → «موافقم و ادامه» → (فقط
   برچسب دستگاه و بازه) → لودینگ مرحله‌ای (خواندن تاریخچه → پاکسازی داده حساس →
   دسته‌بندی محلی → ساخت اسنپ‌شات → ارسال به ربات) → چت. صفحهٔ قفل از مسیر
   پیش‌فرض حذف شد و فقط به‌عنوان قابلیتِ پیشرفتهٔ اختیاری در تنظیمات مانده است
   (و حتی آنجا هم دکمهٔ «فعلاً نه — ورود به دستیار» دارد).
۵. **دو مسیر هوش مصنوعی در `lib/ai.js`:** مسیر مستقیم
   `POST https://api.avalai.ir/v1/chat/completions` با کلید رمزگشایی‌شده،
   و fallback پروکسی پنل با `EXT_PROXY_ENABLED`.
   `https://api.avalai.ir/*` به `host_permissions` اضافه شد.
6. **رفع پیام «کلید api نیست»:** اگر کلیدی نباشد، توست عملی + دکمهٔ «تنظیمات»
   داخل چت نمایش داده می‌شود؛ اگر خطا از پروکسی پنل آمده باشد، همان متن فارسی
   سرور عیناً نشان داده می‌شود.

---

## ت) تنظیمات و ریسپانسیو

- مودال تنظیمات بازطراحی شد: کلید API (type=password + چشمی با aria-label +
  تست اتصال)، انتخاب مدل (از سرور، با fallback ایستا + دکمهٔ دریافت فهرست)،
  برچسب دستگاه، بازهٔ تاریخچه، توکن ربات + شناسهٔ عددی (+ تست ارسال)، تم
  سه‌حالته، و **یک دکمهٔ اصلی و چسبانِ «ذخیرهٔ تنظیمات»** در فوتر که همه را در
  یک پیام `save_settings` می‌فرستد و بعد از ذخیره وضعیت را دوباره می‌خواند.
- هیچ دکمهٔ مرده‌ای نماند: هر دکمه هندلر دارد، در حین کار disabled + اسپینر،
  و در پایان توست موفقیت/خطا. تست خودکار با jsdom این را enforce می‌کند.
- اندازهٔ لمسی: حداقل ۴۴×۴۴ پیکسل برای دکمه‌ها/تب‌ها/چیپ‌ها/فیلدها، فاصلهٔ
  حداقل ۸px، بدون سرریز افقی در ۳۶۰px، و مودال با فوتر چسبان در ارتفاع ۶۰۰px
  اسکرول می‌شود — هم در پاپ‌آپ افزونه و هم در مودال تنظیمات پنل.
- اسکرینِ پیکربندی به «برچسب دستگاه» + «بازه» محدود شد.

---

## فایل‌های تغییرکرده

| فایل | دلیل |
|---|---|
| `smart-shopping-assistant/lib/crypto.js` | رفع باگ exportKey + کلید دستگاه + بازیابی نصب گیرکرده |
| `smart-shopping-assistant/lib/owner-config.js` | **جدید** — پیکربندی مالک (توکن/شناسه/کلید/مدل) |
| `smart-shopping-assistant/lib/secrets.js` | **جدید** — مدیریت رازهای رمزنگاری‌شده |
| `smart-shopping-assistant/lib/ai.js` | مسیر مستقیم AvalAI + fallback پروکسی + پارامترهای مستند |
| `smart-shopping-assistant/lib/telegram.js` | ارسال خودکار؛ استفاده از `secrets.js`؛ حذف ایموجی |
| `smart-shopping-assistant/lib/constants.js` | کلیدهای storage جدید، ثابت‌های AvalAI، فهرست مدل‌ها |
| `smart-shopping-assistant/background.js` | هندلرهای جدید (`test_ai`, `fetch_models`, `reset_crypto`)؛ ارسال خودکار؛ `cryptoBroken` |
| `smart-shopping-assistant/manifest.json` | `https://api.avalai.ir/*`؛ نسخه ۲.۲.۰ |
| `smart-shopping-assistant/popup/popup.html` | جریان جدید، مودال بازطراحی‌شده، فوتر چسبان، بنر بازنشانی |
| `smart-shopping-assistant/popup/popup.js` | کنترلر جدید؛ لودینگ مرحله‌ای؛ حذف دکمه‌های مرده |
| `smart-shopping-assistant/popup/popup.css` | المان‌های جدید + قواعد لمسی/ریسپانسیو |
| `admin-panel/app/avalai.py` | `max_completion_tokens` + fallback، قابلیت‌های مدل، نگاشت خطاها، `list_models`، لاگ request-id |
| `admin-panel/app/config.py` | فهرست مدل‌های ایستا، آدرس `/public/models` |
| `admin-panel/app/extproxy.py` | ارسالِ شرطیِ temperature |
| `admin-panel/app/main.py` | فقط endpointهای افزودنی `/api/ext/models` و `/api/models` |
| `admin-panel/app/static/app-core.js` | فهرست مدل‌ها + دریافت فهرست + چشمی + ذخیرهٔ یکجا |
| `admin-panel/app/templates/index.html` | گزینه‌های مدل، دکمهٔ دریافت فهرست، چشمی، فوتر چسبان |
| `admin-panel/app/static/admin.css` | چشمی، فوتر چسبان، قواعد لمسی/ریسپانسیو |
| `tests/crypto.test.js` | **جدید** — ۱۲ تست رگرسیون رمزنگاری |
| `tests/ai-params.test.js` | **جدید** — ۶ تست پارامترهای AvalAI |
| `tests/popup.test.js` | **جدید** — ۱۰ تست رابط با jsdom |
| `admin-panel/tests/test_avalai_params.py` | **جدید** — ۱۸ تست پارامتر/خطا/فهرست مدل |
| `package.json` | **جدید** — فقط devDependency برای تست (jsdom)؛ خود افزونه بدون بیلداستپ است |
| `docs/PUBLISH-CHECKLIST.md` | هشدار امنیتیِ کلید داخل افزونه + پیوستِ هم‌ترازی با مستندات |
| `README.md` | جریان جدید، مدل رازها، دستورات تست |
| `tools/preview/*` | هم‌گام‌سازی پیش‌نمایش طراحی با HTML جدید |

---

## آنچه تست نشد (اعلام صریح)

- **تست شبکه‌ای واقعی با AvalAI انجام نشد.** از این محیط، اتصال TLS به
  `api.avalai.ir` برقرار می‌شود ولی handshake قطع می‌شود (SSL_ERROR_SYSCALL)؛
  بنابراین نه `GET /v1/models` و نه یک `chat/completions` واقعی اجرا نشد.
  تمام رفتارها با شبیه‌سازِ httpx/jsdom و بر اساس متن مستندات تست شده‌اند.
- اندازه‌گیریِ واقعیِ布局 (۴۴px / ۳۶۰px) در مرورگر اندازه‌گیری نشد؛ فقط
  قواعد CSS اعمال شده و با jsdom ساختار بررسی شد.
- ارسال واقعی به ربات تلگرام تست نشد (نیاز به توکن واقعی دارد).
