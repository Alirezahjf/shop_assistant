// ============================================================================
// tools/preview/serve.mjs — سرور پیش‌نمایش طراحی پاپ‌آپ افزونه
// ----------------------------------------------------------------------------
// فقط و فقط چهار مسیر زیر را سرو می‌کند (لیست سفید؛ هیچ فایلی از ریپو لو نمی‌رود):
//   /                 → tools/preview/popup-preview.html
//   /popup.css        → smart-shopping-assistant/popup/popup.css
//   /popup.js         → smart-shopping-assistant/popup/popup.js
//   /lib/stores.js    → smart-shopping-assistant/lib/stores.js
// اجرا: node tools/preview/serve.mjs [port]   (پیش‌فرض ۸۱۳۷)
// ============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2] || 8137);

const ROUTES = {
  '/': ['tools/preview/popup-preview.html', 'text/html; charset=utf-8'],
  '/popup-preview.html': ['tools/preview/popup-preview.html', 'text/html; charset=utf-8'],
  '/popup-frame.html': ['tools/preview/popup-frame.html', 'text/html; charset=utf-8'],
  '/popup.css': ['smart-shopping-assistant/popup/popup.css', 'text/css; charset=utf-8'],
  '/popup.js': ['smart-shopping-assistant/popup/popup.js', 'text/javascript; charset=utf-8'],
  '/lib/stores.js': ['smart-shopping-assistant/lib/stores.js', 'text/javascript; charset=utf-8'],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = ROUTES[url.pathname];
  if (!route) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('مسیر مجاز نیست. فقط / ، /popup.css ، /popup.js و /lib/stores.js.\n');
    return;
  }
  try {
    const body = await readFile(join(root, normalize(route[0])));
    res.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('خطا در خواندن فایل: ' + e.message + '\n');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`پیش‌نمایش پاپ‌آپ افزونه: http://0.0.0.0:${port}/`);
});
