// ============================================================================
// admin.js — صفحهٔ فهرست پروفایل‌ها
// ----------------------------------------------------------------------------
// مسئولیت‌ها: آمار زندهٔ هدر، اسکلتون، کارت‌های پروفایل، جستجو/مرتب‌سازی،
//             ایمپورت (آپلود + درگ‌اند‌دراپ + نمونه)، واکشی از تلگرام، حالت خالی.
// همهٔ endpointها دست‌نخورده‌اند: /api/stats ، /api/profiles ، /api/profiles/import ،
//             /api/profiles/import-sample ، /api/telegram/poll|status
// ============================================================================
(function () {
'use strict';

const $ = (id) => document.getElementById(id);
const { icon, esc, faNum, faDate, faDateTime, initials, avatarClass, sourceMeta, toast, api } = App;

const state = {
  profiles: [],
  loading: true,
  calm: false,
  telegramConfigured: null,
};

const STAT_CHIPS = [
  { key: 'profiles', label: 'پروفایل', icon: 'users' },
  { key: 'domains', label: 'دامنه', icon: 'globe' },
  { key: 'searches', label: 'جستجو', icon: 'search' },
  { key: 'visits', label: 'بازدید', icon: 'chart' },
];

// ───────────────────────────── هدر: آمار زنده ─────────────────────────────
function renderStatSkeleton() {
  const row = $('stat-row');
  if (!row) return;
  row.innerHTML = STAT_CHIPS.map((c) => `
    <div class="stat-chip">
      <span class="stat-chip__icon skeleton" style="border:0"></span>
      <span>
        <b class="stat-chip__num skeleton sk-line sk-line--lg" style="width:44px;display:block;margin:0"></b>
        <span class="stat-chip__label">${esc(c.label)}</span>
      </span>
    </div>`).join('');
}

function renderStats(s) {
  const row = $('stat-row');
  if (!row) return;
  row.innerHTML = STAT_CHIPS.map((c) => `
    <div class="stat-chip">
      <span class="stat-chip__icon">${icon(c.icon)}</span>
      <span>
        <b class="stat-chip__num">${faNum(s[c.key] || 0)}</b>
        <span class="stat-chip__label">${esc(c.label)}</span>
      </span>
    </div>`).join('');
}

async function loadStats() {
  try {
    renderStats(await api('/api/stats'));
  } catch (e) {
    const row = $('stat-row');
    if (row) row.innerHTML = `<div class="stat-chip"><span class="stat-chip__label">آمار در دسترس نیست — ${esc(e.message)}</span></div>`;
  }
}

// ───────────────────────────── اسکلتون و کارت‌ها ─────────────────────────────
function renderSkeletons(n = 6) {
  const grid = $('profiles-grid');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: n }).map(() => `
    <div class="profile-card" aria-hidden="true">
      <div class="profile-card__head">
        <span class="sk-circle skeleton"></span>
        <div class="grow">
          <span class="skeleton sk-line sk-line--lg sk-line--w60"></span>
          <span class="skeleton sk-line sk-line--w40"></span>
        </div>
      </div>
      <div class="profile-card__stats">
        <span class="skeleton sk-stat"></span><span class="skeleton sk-stat"></span><span class="skeleton sk-stat"></span>
      </div>
      <span class="skeleton sk-line sk-line--w80" style="margin:0"></span>
    </div>`).join('');
}

function cardHtml(p) {
  const src = sourceMeta(p.source);
  const analyzed = !!p.analyzed;
  return `
  <article class="profile-card" role="button" tabindex="0" data-uid="${esc(p.uid)}"
           aria-label="پروفایل ${esc(p.name)} — ${faNum(p.stats?.domains || 0)} دامنه، ${faNum(p.stats?.searches || 0)} جستجو">
    <div class="profile-card__head">
      <span class="avatar ${avatarClass(p.uid + p.name)}" aria-hidden="true">${esc(initials(p.name))}</span>
      <div class="grow">
        <span class="profile-card__name truncate">${esc(p.name)}</span>
        <span class="profile-card__uid">${esc(p.uid)}</span>
      </div>
      <div class="profile-card__badges">
        <span class="badge ${src.cls}">${icon(src.icon)}<span>${esc(src.label)}</span></span>
        <span class="badge ${analyzed ? 'badge--gold' : ''}">${icon(analyzed ? 'check' : 'clock')}<span>${analyzed ? 'تحلیل‌شده' : 'تحلیل نشده'}</span></span>
      </div>
    </div>
    <div class="profile-card__stats">
      <div class="pc-stat"><b>${faNum(p.stats?.domains || 0)}</b><span>دامنه</span></div>
      <div class="pc-stat"><b>${faNum(p.stats?.searches || 0)}</b><span>جستجو</span></div>
      <div class="pc-stat"><b>${faNum(p.stats?.totalVisits || 0)}</b><span>بازدید</span></div>
    </div>
    <div class="profile-card__foot">
      <span class="grow truncate">${icon('calendar')} ${esc(faDate(p.importedAt))} • ${esc(p.deviceLabel || 'دستگاه نامشخص')}</span>
      <span class="truncate mono">${esc(p.sourceFile || '—')}</span>
    </div>
  </article>`;
}

function sortedFiltered() {
  const q = ($('profile-search')?.value || '').toLowerCase().trim();
  const sort = $('sort-select')?.value || 'newest';
  let list = state.profiles.filter((p) => !q
    || (p.name || '').toLowerCase().includes(q)
    || (p.uid || '').toLowerCase().includes(q)
    || (p.deviceLabel || '').toLowerCase().includes(q)
    || (p.sourceFile || '').toLowerCase().includes(q));
  list = [...list].sort((a, b) => {
    if (sort === 'oldest') return (a.importedAt || 0) - (b.importedAt || 0);
    if (sort === 'name') return String(a.name).localeCompare(String(b.name), 'fa');
    if (sort === 'data') return (b.stats?.totalVisits || 0) - (a.stats?.totalVisits || 0);
    return (b.importedAt || 0) - (a.importedAt || 0);
  });
  return list;
}

function renderList() {
  const grid = $('profiles-grid');
  const empty = $('empty-state');
  const calm = $('empty-calm');
  if (!grid) return;

  if (state.loading) { renderSkeletons(); return; }

  const hasAny = state.profiles.length > 0;
  if (empty) empty.hidden = hasAny || state.calm;
  if (calm) calm.hidden = hasAny || !state.calm;
  if (!hasAny) { grid.innerHTML = ''; $('list-count').textContent = ''; return; }

  const list = sortedFiltered();
  $('list-count').textContent = list.length === state.profiles.length
    ? `${faNum(list.length)} پروفایل`
    : `${faNum(list.length)} از ${faNum(state.profiles.length)}`;

  if (!list.length) {
    grid.innerHTML = `<div class="notice">پروفایلی با این جستجو پیدا نشد — عبارت دیگری را امتحان کن.</div>`;
    return;
  }

  grid.innerHTML = list.map(cardHtml).join('');
  grid.querySelectorAll('.profile-card').forEach((card) => {
    const go = () => { location.href = `/profile/${card.dataset.uid}`; };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

async function loadList() {
  state.loading = true;
  renderList();
  try {
    const data = await api('/api/profiles');
    state.profiles = data.profiles || [];
  } catch (e) {
    state.profiles = [];
    toast(e.message, 'err');
  } finally {
    state.loading = false;
    renderList();
  }
}

// ───────────────────────────── ایمپورت ─────────────────────────────
function importFilenames(files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  return fetch('/api/profiles/import', { method: 'POST', body: fd });
}

async function importFiles(files) {
  if (!files.length) return;
  toast(`در حال ایمپورت ${faNum(files.length)} فایل…`, 'info', 2000);
  try {
    const res = await importFilenames(files);
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (res.status === 401) { location.href = '/login'; return; }
    if (!res.ok) { toast(data.error || 'ایمپورت انجام نشد.', 'err'); return; }
    const added = (data.added || []).length;
    const failed = data.failed || [];
    if (added) {
      toast(`${faNum(added)} پروفایل اضافه شد${failed.length ? ` • ${faNum(failed.length)} فایل رد شد` : ''}`, 'ok');
    } else {
      toast(failed[0]?.error || 'هیچ پروفایلی اضافه نشد.', 'err', 5000);
    }
    if (failed.length) console.warn('import rejected:', failed);
    await Promise.all([loadList(), loadStats()]);
  } catch (e) {
    toast('ارتباط با سرور برقرار نشد.', 'err');
  }
}

function pickFiles() { $('import-file')?.click(); }

async function importSample() {
  try {
    await api('/api/profiles/import-sample', { method: 'POST' });
    toast('پروفایل نمونه اضافه شد', 'ok');
    await Promise.all([loadList(), loadStats()]);
  } catch (e) { toast(e.message, 'err'); }
}

// ───────────────────────────── تلگرام ─────────────────────────────
function setTgDot(configured, pending = false) {
  const dot = $('tg-dot');
  if (!dot) return;
  dot.className = 'dot ' + (pending ? 'dot--pending' : configured ? 'dot--on' : 'dot--off');
  const btn = $('btn-tg-poll');
  if (btn) btn.title = configured ? 'ربات متصل است — واکشی فایل‌های جدید' : 'ربات تلگرام هنوز تنظیم نشده است';
}

async function updateTgStatus() {
  try {
    const s = await api('/api/telegram/status');
    state.telegramConfigured = !!s.configured;
    setTgDot(!!s.configured);
  } catch {
    setTgDot(false);
  }
}

async function pollTelegram() {
  setTgDot(state.telegramConfigured, true);
  const btn = $('btn-tg-poll');
  if (btn) App.btnLoading(btn, true, 'در حال واکشی…');
  try {
    const r = await api('/api/telegram/poll', { method: 'POST' });
    if ((r.imported || []).length) {
      toast(`${faNum(r.imported.length)} فایل از تلگرام ایمپورت شد`, 'ok');
      await Promise.all([loadList(), loadStats()]);
    } else if ((r.errors || []).length) {
      toast(r.errors[0].error || 'خطا در پردازش فایل‌ها', 'err');
    } else {
      toast('فایل جدیدی در چت ربات نبود.', 'info');
    }
    await updateTgStatus();
  } catch (e) {
    toast(e.message, 'err', 5000);
    await updateTgStatus();
  } finally {
    if (btn) App.btnLoading(btn, false);
  }
}

// ───────────────────────────── رویدادها ─────────────────────────────
App.wireShell({ onTelegramFetch: pollTelegram });

$('btn-add-user')?.addEventListener('click', pickFiles);
$('fab-add')?.addEventListener('click', pickFiles);
$('path-upload')?.addEventListener('click', pickFiles);
$('path-telegram')?.addEventListener('click', pollTelegram);
$('path-sample')?.addEventListener('click', importSample);
$('dropzone')?.addEventListener('click', pickFiles);

$('btn-tg-poll')?.addEventListener('click', pollTelegram);

$('btn-calm')?.addEventListener('click', () => {
  state.calm = true;
  renderList();
});
$('btn-calm-back')?.addEventListener('click', () => {
  state.calm = false;
  renderList();
});

$('import-file')?.addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  await importFiles(files);
});

$('profile-search')?.addEventListener('input', App.debounce(renderList, 120));
$('sort-select')?.addEventListener('change', renderList);

document.addEventListener('app:telegram-status', updateTgStatus);

// درگ‌اند‌دراپ در کل پنجره
const overlay = $('drop-overlay');
const dropzone = $('dropzone');
let dragDepth = 0;

function isFileDrag(e) {
  const types = e.dataTransfer?.types || [];
  return [...types].includes('Files');
}
window.addEventListener('dragenter', (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth += 1;
  if (overlay) overlay.hidden = false;
  dropzone?.classList.add('is-over');
});
window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener('dragleave', () => {
  if (dragDepth > 0) dragDepth -= 1;
  if (dragDepth === 0) {
    if (overlay) overlay.hidden = true;
    dropzone?.classList.remove('is-over');
  }
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  if (overlay) overlay.hidden = true;
  dropzone?.classList.remove('is-over');
  const files = [...(e.dataTransfer?.files || [])]
    .filter((f) => f.name.toLowerCase().endsWith('.json') || f.type === 'application/json');
  if (!files.length) { toast('فقط فایل JSON پذیرفته می‌شود.', 'err'); return; }
  await importFiles(files);
});

// ───────────────────────────── شروع ─────────────────────────────
renderStatSkeleton();
renderSkeletons();
updateTgStatus();
loadStats();
loadList();

})();
