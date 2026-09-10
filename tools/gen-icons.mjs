// ============================================================================
// gen-icons.mjs — تولید آیکون‌های PNG افزونه از طراحی برداری (بدون وابستگی)
// اجرا: node tools/gen-icons.mjs
// هویت: «کاغذ کاهی و مُس» — پس‌زمینهٔ مُس تخت + نشان کیف خرید و تیک کرم‌رنگ
// ============================================================================
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'smart-shopping-assistant', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------- پالت برند (هم‌رنگ پنل مدیریت) ----------
const ACCENT = [178, 91, 50];      // #B25B32 — مُس
const ON_ACCENT = [255, 247, 239]; // #FFF7EF — کرم
const RING_ALPHA = 0.22;           // قاب داخلی، مثل لوگوی پنل

// ---------- ریاضیات شکل (مختصات 128×128 مثل SVG مرجع) ----------
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const len = (x, y) => Math.hypot(x, y);

function sdfRoundRect(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const t = clamp((apx * abx + apy * aby) / (abx * abx + aby * aby), 0, 1);
  return len(apx - abx * t, apy - aby * t);
}

/** ارزیابی پوشش نقطه (0..1) و رنگ */
function sample(px, py) {
  // پس‌زمینه: مربع گرد مُس (تخت، بدون گرادیان)
  const bg = sdfRoundRect(px, py, 4, 4, 124, 124, 30);
  let alpha = clamp(0.5 - bg, 0, 1);
  let r = ACCENT[0], g = ACCENT[1], b = ACCENT[2];

  if (alpha > 0) {
    const stroke = (w) => clamp(0.5 + w, 0, 1);
    const mixOnAccent = (a) => {
      r = r * (1 - a) + ON_ACCENT[0] * a;
      g = g * (1 - a) + ON_ACCENT[1] * a;
      b = b * (1 - a) + ON_ACCENT[2] * a;
    };

    // قاب داخلی کم‌رنگ (هم‌خانواده لوگوی پنل)
    const ring = Math.abs(sdfRoundRect(px, py, 13, 13, 115, 115, 24));
    if (ring <= 1) mixOnAccent(stroke(0.5 - ring) * RING_ALPHA);

    // بدنه کیف: مستطیل گرد با خط دور 7
    const bag = Math.abs(sdfRoundRect(px, py, 36, 46, 92, 106, 6));
    if (bag <= 3.5) mixOnAccent(stroke(0.5 - bag / 7));
    // دسته: حلقه دایره‌ای بالای کیف
    const dHandle = Math.abs(len(px - 64, py - 39) - 14);
    if (dHandle <= 3.5 && py <= 47) mixOnAccent(stroke(0.5 - dHandle / 7));
    // تیک: دو پاره‌خط با سر گرد
    const dCheck = Math.min(sdSegment(px, py, 50, 78, 60, 88), sdSegment(px, py, 60, 88, 79, 67));
    if (dCheck <= 4) mixOnAccent(stroke(0.5 - dCheck / 8));
  }
  return [r, g, b, alpha * 255];
}

function renderIcon(size, supersample = 4) {
  const raw = Buffer.alloc(size * size * 4);
  const scale = 128 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0, A = 0, n = 0;
      for (let sy = 0; sy < supersample; sy++) {
        for (let sx = 0; sx < supersample; sx++) {
          const px = (x + (sx + 0.5) / supersample) * scale;
          const py = (y + (sy + 0.5) / supersample) * scale;
          const [r, g, bl, a] = sample(px, py);
          R += r; G += g; B += bl; A += a; n++;
        }
      }
      const i = (y * size + x) * 4;
      raw[i] = Math.round(R / n);
      raw[i + 1] = Math.round(G / n);
      raw[i + 2] = Math.round(B / n);
      raw[i + 3] = Math.round(A / n);
    }
  }
  return raw;
}

// ---------- انکودر PNG ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // فیلتر 0 برای هر اسکن‌لاین + deflate
  const stride = size * 4;
  const filtered = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    filtered[y * (stride + 1)] = 0;
    rgba.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(filtered, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [16, 32, 48, 128]) {
  const png = encodePNG(renderIcon(size, size <= 32 ? 6 : 4), size);
  writeFileSync(join(outDir, `icon${size}.png`), png);
  console.log(`✓ icon${size}.png (${png.length} bytes)`);
}
console.log('همه آیکون‌ها ساخته شدند.');
