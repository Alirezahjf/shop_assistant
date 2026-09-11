// ============================================================================
// app-core.js — هستهٔ مشترک رابط کاربری (سیستم طراحی «کاغذ کاهی و مُس»)
// ----------------------------------------------------------------------------
// شامل: آیکون‌های SVG خطی، توست، مودال/شیت، تم (روشن/تیره/سیستم)، منوی آواتار،
//        نوار پایین موبایل، تنظیمات پنل و هلپرهای نمایش اعداد و تاریخ جلالی.
// توجه: هیچ endpoint یا قرارداد API تغییر نکرده است؛ فقط لایهٔ نمایش.
// ============================================================================
window.App = (function () {
'use strict';

// ───────────────────────────── آیکون‌های خطی (stroke 1.8) ─────────────
// مجموعهٔ اختصاصی؛ همه از خطوط/دایره/مستطیل ساده ساخته شده‌اند (سبک Lucide).
const ICONS = {
  menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  back: '<path d="M20 12H5"/><path d="M11 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.3-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="M5.3 5.3l1.4 1.4"/><path d="M17.3 17.3l1.4 1.4"/><path d="M18.7 5.3l-1.4 1.4"/><path d="M6.7 17.3l-1.4 1.4"/>',
  moon: '<path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M9 20h6"/><path d="M12 16v4"/>',
  settings: '<path d="M4 7h9"/><path d="M18.5 7H21"/><path d="M4 17h4"/><path d="M13.5 17H21"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="10.5" cy="17" r="2.2"/>',
  logout: '<path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M11 8l-4 4 4 4"/><path d="M7 12h9"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c0-3.6 3.4-6.2 7.5-6.2s7.5 2.6 7.5 6.2"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5c0-3.3 2.9-5.7 6.5-5.7s6.5 2.4 6.5 5.7"/><path d="M16.5 5.6a3.5 3.5 0 0 1 0 6.3"/><path d="M18 14.2c2.1.6 3.6 2.2 3.6 4.3"/>',
  upload: '<path d="M4 15.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5"/><path d="M12 4v11"/><path d="M7.5 8.5L12 4l4.5 4.5"/>',
  inbox: '<path d="M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4"/><path d="M5.5 5.5h13l2 8v4a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17.5v-4z"/>',
  send: '<path d="M21 3.5L10.5 14"/><path d="M21 3.5l-6.8 17-3.2-6.6-6.5-3.4z"/>',
  file: '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5v5h5"/><path d="M10 12.8l-1.4 2 1.4 2"/><path d="M14 12.8l1.4 2-1.4 2"/>',
  sparkles: '<path d="M11 4l1.6 3.9L16.5 9.5l-3.9 1.6L11 15l-1.6-3.9L5.5 9.5l3.9-1.6z"/><path d="M18 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z"/>',
  heart: '<path d="M12 20.2s-7.5-4.4-7.5-9.4A4.2 4.2 0 0 1 12 8.2a4.2 4.2 0 0 1 7.5 2.6c0 5-7.5 9.4-7.5 9.4z"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 12.5h9L17.5 7"/><path d="M10.5 10.5v6"/><path d="M13.5 10.5v6"/>',
  download: '<path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/><path d="M12 3.5v11"/><path d="M7.5 10L12 14.5l4.5-4.5"/>',
  pencil: '<path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
  more: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
  alert: '<path d="M12 4.5l8.5 15h-17z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".95" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".95" fill="currentColor" stroke="none"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  activity: '<path d="M3 12.5h3.5L9.5 5l4.5 14 3-6.5H21"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/>',
  'eye-off': '<path d="M4 4l16 16"/><path d="M9.6 9.7A3.2 3.2 0 0 0 12 15.2c1 0 1.9-.4 2.5-1"/><path d="M6.3 6.7C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.5 4.2-1.2"/><path d="M9.9 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a19.4 19.4 0 0 1-3.4 4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  key: '<circle cx="8" cy="15.5" r="3.5"/><path d="M10.5 13L20 3.5"/><path d="M17 4.5l2.5 2.5"/><path d="M14.5 7l2.5 2.5"/>',
  shield: '<path d="M12 3.5l7.5 2.5v6c0 4.2-3 7.4-7.5 8.7C7.5 19.4 4.5 16.2 4.5 12V6z"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4.5V8"/><circle cx="9" cy="13.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.3" fill="currentColor" stroke="none"/>',
  tag: '<path d="M20.5 12.8l-7.7 7.7a1.5 1.5 0 0 1-2.1 0L3.5 13.3V3.5h9.8l7.2 7.2a1.5 1.5 0 0 1 0 2.1z"/><circle cx="8" cy="8" r="1.4"/>',
  bag: '<path d="M5.5 7.5h13l1 13H4.5z"/><path d="M9 7.5V6a3 3 0 0 1 6 0v1.5"/>',
  film: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M8 4.5v15"/><path d="M16 4.5v15"/><path d="M3 12h18"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5l6 3.5-6 3.5z"/>',
  music: '<circle cx="7" cy="17" r="2.8"/><circle cx="17.5" cy="15" r="2.8"/><path d="M9.8 17V7l10.5-2.5V15"/>',
  gamepad: '<rect x="2.5" y="7.5" width="19" height="10" rx="4"/><path d="M7 10.5v4"/><path d="M5 12.5h4"/><circle cx="16" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13.8" r="1.1" fill="currentColor" stroke="none"/>',
  cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/><rect x="10" y="10" width="4" height="4" rx="1"/><path d="M10 3.5v3"/><path d="M14 3.5v3"/><path d="M10 17.5v3"/><path d="M14 17.5v3"/><path d="M3.5 10h3"/><path d="M3.5 14h3"/><path d="M17.5 10h3"/><path d="M17.5 14h3"/>',
  message: '<path d="M20.5 12.5c0 4-3.8 7-8.5 7-1 0-2-.1-2.9-.4L4 20.5l1.5-4C4.4 15.2 3.5 14 3.5 12.5c0-4 3.8-7 8.5-7s8.5 3 8.5 7z"/>',
  newspaper: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9h2.5A1.5 1.5 0 0 1 21 10.5v6a2.5 2.5 0 0 1-2.5 2.5H17"/><path d="M6.5 8.5h7"/><path d="M6.5 12h7"/><path d="M6.5 15.5h7"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.5V8a3 3 0 0 0 3 3"/><path d="M16 5.5h2.5V8a3 3 0 0 1-3 3"/><path d="M12 13v4"/><path d="M8.5 20h7"/>',
  code: '<path d="M9 7.5L4.5 12 9 16.5"/><path d="M15 7.5L19.5 12 15 16.5"/>',
  book: '<path d="M12 7.5C10.5 6 8.6 5.5 4.5 5.5v12c4.1 0 6 .5 7.5 2 1.5-1.5 3.4-2 7.5-2v-12c-4.1 0-6 .5-7.5 2z"/><path d="M12 7.5v12"/>',
  cap: '<path d="M12 4.5l9 4.5-9 4.5-9-4.5z"/><path d="M7 11.5V16c0 1.6 2.2 3 5 3s5-1.4 5-3v-4.5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  car: '<rect x="3.5" y="11" width="17" height="6" rx="2.5"/><path d="M6 11l1.5-3.5h9L18 11"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  food: '<path d="M7 3.5v6a2.5 2.5 0 0 0 5 0v-6"/><path d="M9.5 9.5v11"/><path d="M17 3.5c1.7 1.2 2.5 2.8 2.5 4.7 0 1.5-.7 2.6-1.8 3.2v9.1"/>',
  briefcase: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M3.5 12.5h17"/>',
  landmark: '<path d="M3.5 20.5h17"/><path d="M5 20.5V11"/><path d="M9.5 20.5V11"/><path d="M14.5 20.5V11"/><path d="M19 20.5V11"/><path d="M12 3.5l8 6H4z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.5 2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V9h-4.5"/>',
  chart: '<path d="M4 20h16"/><path d="M7.5 20v-6"/><path d="M12 20V6"/><path d="M16.5 20v-9"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3.5v4"/><path d="M16 3.5v4"/>',
  clipboard: '<rect x="6" y="4.5" width="12" height="16" rx="2.5"/><path d="M9.5 4.5v-1h5v1"/><path d="M9.5 10.5h5"/><path d="M9.5 14.5h5"/>',
  plug: '<path d="M9 3.5v5"/><path d="M15 3.5v5"/><path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v3.5"/>',
  layers: '<path d="M12 3.5l8.5 4.2L12 12 3.5 7.7z"/><path d="M4.5 12.5L12 16.3l7.5-3.8"/><path d="M4.5 16.5L12 20.3l7.5-3.8"/>',
  leaf: '<path d="M20 4.5c-9 0-15 3.4-15 9.5a6.5 6.5 0 0 0 6.5 6.5c6 0 8.5-6 8.5-16z"/><path d="M5 20.5c1.5-6 5-10 11-12"/>',
};

function icon(name, cls) {
  const body = ICONS[name] || ICONS.info;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
    (cls ? ' class="' + cls + '"' : '') + '>' + body + '</svg>';
}

// ───────────────────────────── هلپرها ─────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

function toDate(ts) {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
function faDate(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}
function faDateTime(ts) {
  const d = toDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) +
    ' • ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}
function faWeekday() {
  return new Date().toLocaleDateString('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function initials(text) {
  const t = String(text || '').trim();
  if (!t) return '؟';
  const words = t.split(/[\s_-]+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : t.slice(0, 2)).toUpperCase();
}
function hashSeed(text) {
  const s = String(text || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h;
}
function avatarClass(seed) { return 'avatar--' + ((hashSeed(seed) % 6) + 1); }

const SOURCES = {
  telegram: { label: 'تلگرام', icon: 'send', cls: 'badge--secondary' },
  upload: { label: 'آپلود', icon: 'upload', cls: 'badge--accent' },
  sample: { label: 'نمونه', icon: 'sparkles', cls: 'badge--gold' },
  paste: { label: 'چسبانده‌شده', icon: 'clipboard', cls: 'badge--accent' },
};
function sourceMeta(source) {
  return SOURCES[source] || { label: source || 'نامشخص', icon: 'inbox', cls: '' };
}

// دسته‌بندی سمت سرور است؛ اینجا فقط آیکون خطی جای ایموجی می‌نشیند
const CAT_ICONS = {
  shopping: 'bag', classifieds: 'tag', entertainment: 'film', video: 'play',
  music: 'music', gaming: 'gamepad', ai: 'cpu', search: 'search', social: 'message',
  'tech-news': 'cpu', news: 'newspaper', sports: 'trophy', dev: 'code',
  reference: 'book', education: 'cap', travel: 'compass', transport: 'car',
  food: 'food', jobs: 'briefcase', gov: 'landmark', other: 'globe',
};
function catIcon(cat) { return CAT_ICONS[cat] || 'globe'; }

// ───────────────────────────── API ─────────────────────────────
async function api(path, options = {}) {
  const headers = options.body ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('نشست منقضی شد — دوباره وارد شوید.');
  }
  if (!res.ok) throw new Error(data.error || `خطای سرور (${res.status})`);
  return data;
}

// ───────────────────────────── توست ─────────────────────────────
let toastWrap = null;
function ensureToastWrap() {
  if (!toastWrap || !document.body.contains(toastWrap)) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    toastWrap.setAttribute('role', 'status');
    toastWrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastWrap);
  }
  return toastWrap;
}
function toast(message, kind = '', timeout = 3500) {
  const wrap = ensureToastWrap();
  const el = document.createElement('div');
  const cls = kind === 'ok' ? 'toast--ok' : kind === 'err' ? 'toast--err' : 'toast--info';
  const ic = kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'info';
  el.className = `toast ${cls}`;
  el.innerHTML = `${icon(ic)}<span>${esc(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 260);
  }, timeout);
}

// ───────────────────────────── دکمهٔ در حال انجام ─────────────────────────────
function btnLoading(btn, loading, label) {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.classList.add('is-loading');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `<span class="btn__spinner"></span><span>${esc(label || 'در حال انجام…')}</span>`;
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
  }
}

// ───────────────────────────── مودال‌ها ─────────────────────────────
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
let lastFocus = null;

// ── اسکرول مستقل هر باکس (.scroll-box) ───────────────────────────────────
// بررسی scrollHeight>clientHeight هنگام باز شدن مودال + listener روی scroll
// برای فید پایین گرادیان (is-scrollable / is-at-bottom)
function updateScrollableState(container) {
  const bodies = container.querySelectorAll('.set-section__body, .scroll-box__body, .ai-panel__body, #drill-body');
  bodies.forEach((el) => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    const scrollable = el.scrollHeight > el.clientHeight + 4;
    el.classList.toggle('is-scrollable', scrollable);
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    el.classList.toggle('is-at-bottom', !!(scrollable && atBottom));
    if (scrollable && !el.getAttribute('aria-label')) {
      el.setAttribute('aria-label', 'محتوای قابل اسکرول');
    }
  });
}

function wireScrollableBody(el) {
  if (!el || el._scrollWired) return;
  el._scrollWired = true;
  el.addEventListener('scroll', () => {
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    el.classList.toggle('is-at-bottom', !!atBottom);
  }, { passive: true });
}

function openModal(id) {
  const m = typeof id === 'string' ? $(id) : id;
  if (!m) return;
  lastFocus = document.activeElement;
  m.hidden = false;
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  const panel = m.querySelector('.modal') || m;
  setTimeout(() => {
    updateScrollableState(panel);
    panel.querySelectorAll('.set-section__body, .scroll-box__body, .ai-panel__body, #drill-body').forEach(wireScrollableBody);
  }, 80);
  const auto = panel.querySelector('[data-autofocus]') ||
    panel.querySelector('input:not([type="hidden"]), select, textarea') ||
    panel.querySelector(FOCUSABLE);
  if (auto) setTimeout(() => auto.focus({ preventScroll: true }), 60);
}
function closeModal(id) {
  const m = typeof id === 'string' ? $(id) : id;
  if (!m || m.hidden) return;
  m.hidden = true;
  m.removeAttribute('aria-modal');
  m.removeAttribute('role');
  m.dispatchEvent(new CustomEvent('modal:closed'));
  if (lastFocus && document.body.contains(lastFocus)) {
    try { lastFocus.focus({ preventScroll: true }); } catch { /* noop */ }
  }
}
function openModals() {
  return [...document.querySelectorAll('.modal-backdrop:not([hidden])')];
}
function trapTab(e) {
  const list = openModals();
  if (!list.length) return;
  const panel = list[list.length - 1].querySelector('.modal') || list[list.length - 1];
  const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ───────────────────────────── تأییدیه ─────────────────────────────
function confirmDialog({ title = 'تأیید عملیات', text = '', confirmLabel = 'تأیید', danger = true } = {}) {
  return new Promise((resolve) => {
    const modal = $('modal-confirm');
    if (!modal) { resolve(window.confirm(text || title)); return; }
    $('confirm-title').textContent = title;
    $('confirm-text').innerHTML = text;
    const ok = $('confirm-ok');
    ok.textContent = confirmLabel;
    ok.className = 'btn ' + (danger ? 'btn--danger' : 'btn--primary');
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      modal.removeEventListener('modal:closed', onClosed);
      ok.onclick = null;
      if (cancelA) cancelA.onclick = null;
      if (cancelB) cancelB.onclick = null;
      if (!modal.hidden) modal.hidden = true;
      resolve(val);
    };
    const onClosed = () => done(false);
    const cancelA = $('confirm-cancel'), cancelB = $('confirm-cancel-2');
    ok.onclick = () => done(true);
    if (cancelA) cancelA.onclick = () => done(false);
    if (cancelB) cancelB.onclick = () => done(false);
    modal.addEventListener('modal:closed', onClosed);
    openModal(modal);
  });
}

// ───────────────────────────── تم (روشن/تیره/سیستم) ─────────────────────────────
const THEME_KEY = 'admin-theme';
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function systemTheme() {
  return mq && mq.matches ? 'dark' : 'light';
}
function themePref() {
  try {
    const p = localStorage.getItem(THEME_KEY);
    return p === 'light' || p === 'dark' || p === 'system' ? p : 'system';
  } catch { return 'system'; }
}
function resolvedTheme(pref) {
  return pref === 'system' ? systemTheme() : pref;
}
function applyTheme(pref) {
  const p = pref || themePref();
  document.documentElement.setAttribute('data-theme', resolvedTheme(p));
  document.querySelectorAll('[data-theme-set]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === p));
  });
}
function setTheme(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* noop */ }
  applyTheme(pref);
}
if (mq && mq.addEventListener) {
  mq.addEventListener('change', () => { if (themePref() === 'system') applyTheme('system'); });
}

// ───────────────────────────── تنظیمات پنل ─────────────────────────────
// فهرست پیشنهادی — هم‌تراز با مستندات AvalAI (docs.avalai.ir/en/models).
// نکته‌ها: «gemini-flash-latest» فقط یک alias است که به gemini-3.8-flash اشاره
// می‌کند؛ claude-fable-5-1 طبق مستندات نیازمند «Tier 2 یا بالاتر» است و برای
// حساب‌های عادی ۴۰۱/۴۰۳ می‌دهد (فقط با یادداشتِ روشن نگه داشته شده است).
const KNOWN_MODELS = [
  'qwen3.8-flash', 'glm-5.3-flash', 'gemini-3.8-flash', 'gemini-flash-latest',
  'nemotron-3.5-lightning', 'qwen3.8-27b', 'deepseek-v4-flash', 'gpt-6-astra',
  'claude-fable-5-1',
];

function setStatePill(el, isSet, setLabel = 'تنظیم‌شده', unsetLabel = 'تنظیم نشده') {
  if (!el) return;
  el.className = 'badge set-state ' + (isSet ? 'badge--ok' : 'badge--warn');
  el.innerHTML = `${icon(isSet ? 'check' : 'alert')}<span>${esc(isSet ? setLabel : unsetLabel)}</span>`;
}

async function loadSettings() {
  const s = await api('/api/settings');
  const keyState = $('ai-key-state');
  if (keyState) keyState.textContent = s.avalaiKeyMask ? `ذخیره‌شده: ${s.avalaiKeyMask}` : 'هنوز کلیدی ذخیره نشده';
  setStatePill($('ai-state-pill'), !!s.avalaiKeySet);
  setStatePill($('tg-state-pill'), !!s.tgConfigured);
  const modelState = $('ai-model-state');
  if (modelState) modelState.textContent = s.model || '—';
  const sel = $('set-model');
  if (sel) {
    const known = KNOWN_MODELS.includes(s.model);
    sel.value = known ? s.model : 'custom';
    const custom = $('set-model-custom');
    if (custom) {
      custom.hidden = known;
      if (!known) custom.value = s.model || '';
    }
  }
  return s;
}

function currentModelValue() {
  const sel = $('set-model');
  if (!sel) return '';
  return sel.value === 'custom' ? ($('set-model-custom')?.value || '').trim() : sel.value;
}

function wireSettings() {
  const modal = $('modal-settings');
  if (!modal) return;

  const openers = ['btn-settings', 'mi-settings'];
  openers.forEach((id) => $(id)?.addEventListener('click', async () => {
    closeMenu();
    openModal(modal);
    try { await loadSettings(); } catch (e) { toast(e.message, 'err'); }
  }));

  $('set-model')?.addEventListener('change', () => {
    const custom = $('set-model-custom');
    if (custom) custom.hidden = $('set-model').value !== 'custom';
  });

  $('btn-save-ai')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btnLoading(btn, true, 'ذخیره…');
    try {
      await api('/api/settings/avalai', {
        method: 'POST',
        body: JSON.stringify({ aiKey: $('set-ai-key')?.value.trim(), model: currentModelValue() }),
      });
      if ($('set-ai-key')) $('set-ai-key').value = '';
      toast('تنظیمات هوش مصنوعی ذخیره شد', 'ok');
      await loadSettings();
    } catch (err) { toast(err.message, 'err'); }
    finally { btnLoading(btn, false); }
  });

  $('btn-test-ai')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btnLoading(btn, true, 'در حال تست…');
    try {
      const r = await api('/api/ai/test', {
        method: 'POST',
        body: JSON.stringify({ aiKey: $('set-ai-key')?.value.trim(), model: currentModelValue() }),
      });
      toast(`اتصال موفق — پاسخ نمونه: ${r.sample}`, 'ok', 5000);
    } catch (err) { toast(err.message, 'err'); }
    finally { btnLoading(btn, false); }
  });

  $('btn-save-tg')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btnLoading(btn, true, 'ذخیره…');
    try {
      await api('/api/settings/telegram', {
        method: 'POST',
        body: JSON.stringify({
          tgToken: $('set-tg-token')?.value.trim(),
          tgChatId: $('set-tg-chat')?.value.trim(),
        }),
      });
      if ($('set-tg-token')) $('set-tg-token').value = '';
      toast('اطلاعات ربات تلگرام ذخیره شد', 'ok');
      await loadSettings();
      document.dispatchEvent(new CustomEvent('app:telegram-status'));
    } catch (err) { toast(err.message, 'err'); }
    finally { btnLoading(btn, false); }
  });

  $('btn-test-tg')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btnLoading(btn, true, 'در حال ارسال…');
    try {
      await api('/api/telegram/test', { method: 'POST' });
      toast('پیام تست در تلگرام ارسال شد', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { btnLoading(btn, false); }
  });

  // نمایش/پنهان کردن مقدارِ فیلدهای راز
  document.querySelectorAll('[data-eye]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.eye);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eye-off' : 'eye');
      btn.setAttribute('aria-label', show ? 'پنهان کردن مقدار' : 'نمایش مقدار');
    });
  });

  // دریافت فهرست مدل‌ها از AvalAI (از طریق /api/models)
  $('btn-fetch-models')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btnLoading(btn, true, 'در حال دریافت…');
    try {
      const r = await api('/api/models');
      const models = (r.models || []).map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean);
      const sel = $('set-model');
      if (sel && models.length) {
        const current = currentModelValue();
        // گزینهٔ «سفارشی» را حفظ می‌کنیم و بقیه را از پاسخ سرور می‌سازیم
        const customOpt = sel.querySelector('option[value="custom"]');
        sel.innerHTML = '';
        for (const id of models.slice(0, 400)) {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = id;
          sel.appendChild(opt);
        }
        if (customOpt) sel.appendChild(customOpt);
        sel.value = models.includes(current) ? current : 'custom';
        const custom = $('set-model-custom');
        if (custom) { custom.hidden = sel.value !== 'custom'; if (custom.hidden === false) custom.value = current; }
        const hint = $('model-source-hint');
        if (hint) {
          hint.textContent = r.source === 'static'
            ? 'دسترسی به AvalAI برقرار نبود؛ فهرست ایستای مستندات نمایش داده می‌شود.'
            : `فهرست زنده از AvalAI دریافت شد (${models.length} مدل).`;
        }
        toast(`فهرست مدل‌ها به‌روز شد — ${models.length} مدل`, 'ok');
      } else {
        toast('مدلی از سرور دریافت نشد.', 'err');
      }
    } catch (err) { toast(err.message, 'err'); }
    finally { btnLoading(btn, false); }
  });

  // ذخیرهٔ یکجای همهٔ تنظیمات (فوتر چسبان مودال)
  $('btn-save-all-settings')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btnLoading(btn, true, 'در حال ذخیره…');
    const done = [];
    try {
      const aiKey = $('set-ai-key')?.value.trim();
      const model = currentModelValue();
      if (aiKey || model) {
        await api('/api/settings/avalai', { method: 'POST', body: JSON.stringify({ aiKey, model }) });
        if ($('set-ai-key')) $('set-ai-key').value = '';
        done.push('هوش مصنوعی');
      }
      const tgToken = $('set-tg-token')?.value.trim();
      const tgChatId = $('set-tg-chat')?.value.trim();
      if (tgToken || tgChatId) {
        await api('/api/settings/telegram', { method: 'POST', body: JSON.stringify({ tgToken, tgChatId }) });
        if ($('set-tg-token')) $('set-tg-token').value = '';
        done.push('تلگرام');
      }
      const cur = $('set-pass-current')?.value || '';
      const nxt = $('set-pass-new')?.value || '';
      if (cur || nxt) {
        if (nxt.length < 8) throw new Error('رمز جدید باید حداقل ۸ کاراکتر باشد.');
        await api('/api/settings/password', { method: 'POST', body: JSON.stringify({ current: cur, new: nxt }) });
        if ($('set-pass-current')) $('set-pass-current').value = '';
        if ($('set-pass-new')) $('set-pass-new').value = '';
        done.push('رمز مدیر');
      }
      await loadSettings();
      document.dispatchEvent(new CustomEvent('app:telegram-status'));
      toast(done.length ? `ذخیره شد: ${done.join('، ')}` : 'تغییری برای ذخیره وجود نداشت', done.length ? 'ok' : 'info');
    } catch (err) { toast(err.message, 'err'); }
    finally { btnLoading(btn, false); }
  });

  $('btn-save-pass')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const current = $('set-pass-current')?.value || '';
    const next = $('set-pass-new')?.value || '';
    if (next.length < 8) { toast('رمز جدید باید حداقل ۸ کاراکتر باشد.', 'err'); return; }
    btnLoading(btn, true, 'ذخیره…');
    try {
      await api('/api/settings/password', { method: 'POST', body: JSON.stringify({ current, new: next }) });
      if ($('set-pass-current')) $('set-pass-current').value = '';
      if ($('set-pass-new')) $('set-pass-new').value = '';
      toast('رمز مدیر تغییر کرد', 'ok');
      setStatePill($('pass-state-pill'), true, 'به‌روز شد');
    } catch (err) { toast(err.message, 'err'); }
    finally { btnLoading(btn, false); }
  });
}

// ───────────────────────────── منوی آواتار ─────────────────────────────
let menuOpenState = false;
function openMenu() {
  const menu = $('avatar-menu'), back = $('menu-backdrop');
  if (!menu) return;
  menuOpenState = true;
  menu.hidden = false;
  if (back) back.hidden = false;
  $('btn-avatar')?.setAttribute('aria-expanded', 'true');
  const first = menu.querySelector(FOCUSABLE);
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
}
function closeMenu() {
  const menu = $('avatar-menu'), back = $('menu-backdrop');
  if (!menu) return;
  menuOpenState = false;
  menu.hidden = true;
  if (back) back.hidden = true;
  $('btn-avatar')?.setAttribute('aria-expanded', 'false');
}
function toggleMenu() { menuOpenState ? closeMenu() : openMenu(); }

// ───────────────────────────── پوستهٔ اپ ─────────────────────────────
function wireShell(opts = {}) {
  applyTheme();

  // منوی آواتار
  $('btn-avatar')?.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  $('bnav-menu')?.addEventListener('click', (e) => { e.preventDefault(); toggleMenu(); });
  $('menu-backdrop')?.addEventListener('click', closeMenu);
  $('avatar-menu')?.addEventListener('click', (e) => { if (e.target.closest('[data-keep-menu]')) e.stopPropagation(); });

  // تم
  document.querySelectorAll('[data-theme-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.themeSet);
      const names = { light: 'روشن', dark: 'تیره', system: 'سیستم' };
      toast(`تم ${names[btn.dataset.themeSet]} فعال شد`, 'info', 1800);
    });
  });

  // خروج — همیشه یک تپ
  document.querySelectorAll('[data-logout]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      btnLoading(el, true, 'خروج…');
      location.href = '/logout';
    });
  });

  // بستن مودال‌ها
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-backdrop').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (menuOpenState) { closeMenu(); return; }
      const list = openModals();
      if (list.length) closeModal(list[list.length - 1]);
    } else if (e.key === 'Tab') {
      trapTab(e);
    }
  });
  // کلیک بیرون منو
  document.addEventListener('click', (e) => {
    if (!menuOpenState) return;
    if (e.target.closest('#avatar-menu') || e.target.closest('#btn-avatar') || e.target.closest('#bnav-menu')) return;
    closeMenu();
  });

  // نوار پایین موبایل
  $('bnav-home')?.addEventListener('click', (e) => {
    if (e.currentTarget.dataset.back === '1') return; // لینک عادی =\u003e back
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('bnav-telegram')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.classList.add('is-loading');
    try {
      await (opts.onTelegramFetch ? opts.onTelegramFetch() : Promise.resolve());
    } finally {
      el.classList.remove('is-loading');
    }
  });

  // تاریخ امروز (جلالی)
  document.querySelectorAll('[data-today]').forEach((el) => { el.textContent = faWeekday(); });

  // چشمی رمز
  document.querySelectorAll('[data-eye]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.eye);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eye-off' : 'eye');
      btn.setAttribute('aria-label', show ? 'پنهان کردن رمز' : 'نمایش رمز');
    });
  });

  wireSettings();
  applyTheme();
}

function debounce(fn, wait = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

return {
  icon, esc, faNum, faDate, faDateTime, faWeekday, initials, avatarClass, hashSeed,
  sourceMeta, catIcon, api, toast, btnLoading, debounce,
  openModal, closeModal, confirm: confirmDialog,
  theme: { get: themePref, set: setTheme, apply: applyTheme, resolved: resolvedTheme },
  menu: { open: openMenu, close: closeMenu, toggle: toggleMenu },
  wireShell, loadSettings,
};
})();
