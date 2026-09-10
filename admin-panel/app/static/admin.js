// ============================================================================
// admin.js — فرانت‌اند پنل مدیریت (لیست پروفایل‌ها، ایمپورت، تلگرام، تنظیمات)
// تمام منطق سمت سرور (FastAPI) است؛ اینجا فقط رندر و فراخوانی API.
// ============================================================================
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

const faDate = (ts) => {
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    return isNaN(d) ? '—' : d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return '—'; }
};

let toastTimer;
function toast(msg, kind = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || `خطای سرور (${res.status})`);
  return data;
}

function initials(text) {
  const words = String(text || '؟').trim().split(/[\s_-]+/).filter(Boolean);
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : String(text || '؟').slice(0, 2).toUpperCase();
}

// ───────────────────────── لیست پروفایل‌ها ─────────────────────────
let profiles = [];

async function refreshStats() {
  try {
    const s = await api('/api/stats');
    $('topbar-stats').hidden = !s.profiles;
    $('ts-profiles').textContent = faNum(s.profiles);
    $('ts-domains').textContent = faNum(s.domains);
    $('ts-searches').textContent = faNum(s.searches);
  } catch { /* noop */ }
}

async function loadList() {
  try {
    const data = await api('/api/profiles');
    profiles = data.profiles || [];
    renderList();
    refreshStats();
  } catch (e) {
    if (e.message.includes('نشست')) location.href = '/login';
    else toast(e.message, 'err');
  }
}

function renderList() {
  const grid = $('profiles-grid');
  const empty = $('empty-state');
  grid.textContent = '';
  if (!profiles.length) { empty.hidden = false; return; }
  empty.hidden = true;

  const q = ($('profile-search').value || '').toLowerCase().trim();
  const sort = $('sort-select').value;
  let list = profiles.filter((p) => !q
    || p.name.toLowerCase().includes(q)
    || p.uid.toLowerCase().includes(q)
    || (p.deviceLabel || '').toLowerCase().includes(q));
  list = [...list].sort((a, b) => {
    if (sort === 'oldest') return a.importedAt - b.importedAt;
    if (sort === 'name') return a.name.localeCompare(b.name, 'fa');
    if (sort === 'data') return (b.stats?.totalVisits || 0) - (a.stats?.totalVisits || 0);
    return b.importedAt - a.importedAt;
  });

  for (const p of list) {
    const card = document.createElement('article');
    card.className = 'profile-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const sourceIcon = { telegram: '📨', upload: '📥', sample: '✨', paste: '📋' }[p.source] || '📥';
    const head = document.createElement('div');
    head.className = 'pc-head';
    head.innerHTML = `
      <div class="avatar">${esc(initials(p.name))}</div>
      <div style="min-width:0">
        <div class="pc-name">${esc(p.name)}</div>
        <span class="pc-id">${esc(p.uid)}</span>
      </div>
      <span style="margin-inline-start:auto;font-size:16px" title="منبع: ${esc(p.source)}">${sourceIcon}</span>`;

    const stats = document.createElement('div');
    stats.className = 'pc-stats';
    for (const [v, l] of [
      [faNum(p.stats?.domains || 0), 'دامنه'],
      [faNum(p.stats?.searches || 0), 'جستجو'],
      [faNum(p.stats?.totalVisits || 0), 'بازدید'],
    ]) {
      stats.insertAdjacentHTML('beforeend', `<div class="pc-stat"><b>${v}</b><span>${l}</span></div>`);
    }

    const foot = document.createElement('div');
    foot.className = 'pc-foot';
    foot.innerHTML = `
      <span class="pc-date">${sourceIcon} ${faDate(p.importedAt)}</span>
      <span class="${p.analyzed ? 'pc-badge-analyzed' : 'pc-badge-new'}">${p.analyzed ? '✓ تحلیل‌شده' : 'تحلیل نشده'}</span>`;

    card.append(head, stats, foot);
    card.addEventListener('click', () => { location.href = `/profile/${p.uid}`; });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.href = `/profile/${p.uid}`; });
    grid.appendChild(card);
  }
}

$('profile-search').addEventListener('input', renderList);
$('sort-select').addEventListener('change', renderList);

// ───────────────────────── ایمپورت (آپلود فایل‌ها) ─────────────────────────
async function importFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const res = await fetch('/api/profiles/import', { method: 'POST', body: fd });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (res.status === 401) return location.href = '/login';
  if (!res.ok) return toast(data.error || 'خطا در ایمپورت', 'err');

  const added = data.added?.length || 0;
  const failed = data.failed || [];
  if (added) toast(`${faNum(added)} پروفایل اضافه شد ✅` + (failed.length ? ` • ${faNum(failed.length)} رد شد` : ''), 'ok');
  else toast(failed[0]?.error || 'هیچ پروفایلی اضافه نشد', 'err');
  for (const f of failed.slice(0, 3)) console.warn('import rejected:', f.file, '-', f.error);
  await loadList();
}

$('import-file').addEventListener('change', async (e) => {
  if (e.target.files?.length) await importFiles([...e.target.files]);
  e.target.value = '';
});

const dropOverlay = $('drop-overlay');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dropOverlay.hidden = false; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.hidden = true; } });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.name.endsWith('.json') || f.type === 'application/json');
  if (files.length) await importFiles(files);
  else toast('فقط فایل JSON پذیرفته می‌شود.', 'err');
});
$('dropzone').addEventListener('click', (e) => {
  if (e.target.id === 'btn-import-sample' || e.target.closest('#btn-import-sample')) return;
  $('import-file').click();
});

$('btn-import-sample')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    await api('/api/profiles/import-sample', { method: 'POST' });
    toast('پروفایل نمونه اضافه شد ✨', 'ok');
    await loadList();
  } catch (err) { toast(err.message, 'err'); }
});

// ───────────────────────── واکشی از تلگرام ─────────────────────────
async function pollTelegram() {
  const btn = $('btn-tg-poll');
  btn.disabled = true;
  const label = btn.querySelector('span');
  const old = label.textContent;
  label.textContent = 'در حال واکشی…';
  try {
    const r = await api('/api/telegram/poll', { method: 'POST' });
    if (r.imported?.length) {
      toast(`${faNum(r.imported.length)} فایل از تلگرام ایمپورت شد ✅`, 'ok');
      await loadList();
    } else if (r.errors?.length) {
      toast(r.errors[0].error, 'err');
    } else {
      toast('فایل جدیدی در چت ربات نبود.', '');
    }
    updateTgStatus();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    label.textContent = old;
  }
}
$('btn-tg-poll').addEventListener('click', pollTelegram);

async function updateTgStatus() {
  try {
    const s = await api('/api/telegram/status');
    $('tg-status').textContent = s.configured ? '🟢 ربات متصل' : '⚪ ربات تنظیم نشده';
  } catch { /* noop */ }
}

// ───────────────────────── تنظیمات ─────────────────────────
const modal = $('modal-settings');

$('btn-settings').addEventListener('click', async () => {
  try {
    const s = await api('/api/settings');
    $('ai-key-state').textContent = s.avalaiKeyMask ? `(ذخیره‌شده: ${s.avalaiKeyMask})` : '(تنظیم نشده)';
    $('tg-state').textContent = s.tgConfigured ? '(تنظیم‌شده ✅)' : '(تنظیم نشده)';
    const known = ['qwen3.8-flash', 'glm-5.3-flash', 'gemini-flash-latest', 'gpt-6-astra', 'claude-fable-5-1'];
    $('set-model').value = known.includes(s.model) ? s.model : 'custom';
    $('set-model-custom').hidden = $('set-model').value !== 'custom';
    if ($('set-model').value === 'custom') $('set-model-custom').value = s.model || '';
  } catch (e) { toast(e.message, 'err'); }
  modal.hidden = false;
});

document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => { $(btn.dataset.close).hidden = true; }));
document.querySelectorAll('.modal-backdrop').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop').forEach((m) => { m.hidden = true; });
});

$('set-model').addEventListener('change', () => {
  $('set-model-custom').hidden = $('set-model').value !== 'custom';
});

$('btn-save-ai').addEventListener('click', async () => {
  const model = $('set-model').value === 'custom' ? $('set-model-custom').value.trim() : $('set-model').value;
  try {
    await api('/api/settings/avalai', { method: 'POST', body: JSON.stringify({ aiKey: $('set-ai-key').value.trim(), model }) });
    $('set-ai-key').value = '';
    toast('تنظیمات AI ذخیره شد ✅', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-test-ai').addEventListener('click', async () => {
  const btn = $('btn-test-ai');
  btn.disabled = true; btn.textContent = 'در حال تست…';
  try {
    const model = $('set-model').value === 'custom' ? $('set-model-custom').value.trim() : $('set-model').value;
    const r = await api('/api/ai/test', { method: 'POST', body: JSON.stringify({ aiKey: $('set-ai-key').value.trim(), model }) });
    toast(`اتصال موفق ✅ — ${r.sample}`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'تست اتصال'; }
});

$('btn-save-tg').addEventListener('click', async () => {
  try {
    await api('/api/settings/telegram', {
      method: 'POST',
      body: JSON.stringify({ tgToken: $('set-tg-token').value.trim(), tgChatId: $('set-tg-chat').value.trim() }),
    });
    $('set-tg-token').value = '';
    toast('اطلاعات ربات ذخیره شد ✅', 'ok');
    updateTgStatus();
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-test-tg').addEventListener('click', async () => {
  try {
    await api('/api/telegram/test', { method: 'POST' });
    toast('پیام تست ارسال شد 📨', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-save-pass').addEventListener('click', async () => {
  const current = $('set-pass-current').value;
  const newPass = $('set-pass-new').value;
  if (newPass.length < 8) return toast('رمز جدید باید حداقل ۸ کاراکتر باشد.', 'err');
  try {
    await api('/api/settings/password', { method: 'POST', body: JSON.stringify({ current, new: newPass }) });
    $('set-pass-current').value = '';
    $('set-pass-new').value = '';
    toast('رمز مدیر تغییر کرد ✅', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

// ───────────────────────── شروع ─────────────────────────
loadList();
updateTgStatus();

})();
