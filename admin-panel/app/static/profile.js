// ============================================================================
// profile.js — نمای تفصیلی پروفایل (داده از API سرور؛ منطق سمت پایتون)
// ============================================================================
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');
const UID = window.location.pathname.split('/').pop();

const faDate = (ts) => {
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    return isNaN(d) ? '—' : d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return '—'; }
};
const faDateTime = (ts) => {
  try { return new Date(ts).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return '—'; }
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
  if (res.status === 401) { location.href = '/login'; throw new Error('نشست منقضی شد'); }
  if (!res.ok) throw new Error(data.error || `خطای سرور (${res.status})`);
  return data;
}

function initials(text) {
  const words = String(text || '؟').trim().split(/[\s_-]+/).filter(Boolean);
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : String(text || '؟').slice(0, 2).toUpperCase();
}

// ───────────────────────── وضعیت صفحه ─────────────────────────
let profile = null, snapshot = null, analysis = null, categories = [], interests = [];
let drillState = null;

async function loadProfile() {
  try {
    const data = await api(`/api/profiles/${UID}`);
    profile = data.profile;
    snapshot = data.snapshot;
    analysis = data.analysis;
    categories = data.categories || [];
    interests = data.interests || [];
    render();
  } catch (e) {
    toast(e.message, 'err');
    setTimeout(() => { location.href = '/'; }, 1600);
  }
}

function render() {
  $('p-avatar').textContent = initials(profile.name);
  $('p-name').textContent = profile.name;
  $('p-meta').textContent =
    `دستگاه: «${profile.deviceLabel}» • بازه تحلیل: ${faNum(profile.rangeDays)} روز • وارد شده در ${faDateTime(profile.importedAt)} • منبع: ${profile.source}`;

  const badges = $('p-badges');
  badges.textContent = '';
  for (const c of categories.slice(0, 4)) {
    badges.insertAdjacentHTML('beforeend', `<span class="ph-badge cat">${c.icon} ${esc(c.label)}</span>`);
  }
  badges.insertAdjacentHTML('beforeend', `<span class="ph-badge">فایل: ${esc(profile.sourceFile)}</span>`);

  // KPI
  const kpi = $('kpi-row');
  kpi.textContent = '';
  const hist = new Array(7).fill(0);
  for (const d of snapshot.domains || []) {
    (d.histogram || []).forEach((v, i) => { if (i < 7) hist[i] += v; });
  }
  const histTotal = hist.reduce((a, b) => a + b, 0);
  const recent = histTotal ? Math.round(((hist[4] + hist[5] + hist[6]) / histTotal) * 100) : 0;

  for (const [v, l, chart] of [
    [faNum(profile.stats?.totalVisits || 0), 'کل بازدیدهای ثبت‌شده', null],
    [faNum(profile.stats?.domains || 0), 'دامنه‌های یکتا', null],
    [faNum(profile.stats?.searches || 0), 'جستجوهای یکتا', null],
    [faNum(profile.stats?.cookies || 0), 'کوکی امن (بدون مقدار)', null],
    [`٪${faNum(recent)}`, 'فعالیت نیمه اخیر', hist],
  ]) {
    const k = document.createElement('div');
    k.className = 'kpi';
    k.innerHTML = `<b>${v}</b><span>${l}</span>`;
    if (chart) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:3px;align-items:flex-end;height:26px;margin-top:6px;';
      const max = Math.max(...chart, 1);
      for (const v2 of chart) {
        wrap.insertAdjacentHTML('beforeend',
          `<div style="flex:1;background:linear-gradient(180deg,var(--brand),var(--brand-2));border-radius:3px 3px 0 0;min-height:2px;height:${Math.max(6, (v2 / max) * 100)}%;opacity:.85;"></div>`);
      }
      k.appendChild(wrap);
    }
    kpi.appendChild(k);
  }

  // جعبه‌های بینش
  $('ib-domains-sub').textContent = `${faNum(profile.stats?.domains || 0)} دامنه در ${faNum(categories.length)} دسته`;
  $('ib-searches-sub').textContent = (snapshot.searches || []).length
    ? `پرتکرارترین: «${snapshot.searches[0].term}» (${faNum(snapshot.searches[0].count)} بار)`
    : 'جستجویی ثبت نشده';
  $('ib-interests-sub').textContent = `${faNum(interests.length)} معیار تحلیل‌شده محلی`;
  $('ib-ai-sub').textContent = analysis
    ? `${analysis.profileTitle || 'تحلیل‌شده'} • ${faDateTime(analysis.analyzedAt)}`
    : 'هنوز تحلیل نشده — با یک کلیک تولید کنید';

  if (analysis) renderAnalysisPanel();
  else $('ai-panel').hidden = true;
}

// ───────────────────────── مودال تفصیلی ─────────────────────────
function openDrill(mode) {
  drillState = { mode, cat: 'all', q: '', limit: 60 };
  const toolbar = $('drill-toolbar');
  const foot = $('drill-foot');
  if (mode === 'domains') {
    $('drill-title').textContent = `🌐 سایت‌های بازدیدشده — ${profile.name}`;
    toolbar.hidden = false; foot.hidden = false;
    renderCatChips(); renderDrillList();
  } else if (mode === 'searches') {
    $('drill-title').textContent = `🔎 جستجوها — ${profile.name}`;
    toolbar.hidden = false; foot.hidden = false;
    renderSearchChips(); renderDrillList();
  } else if (mode === 'interests') {
    $('drill-title').textContent = `❤️ علاقه‌مندی‌ها — ${profile.name}`;
    toolbar.hidden = true; foot.hidden = true;
    renderInterestsBody();
  } else if (mode === 'ai') {
    $('drill-title').textContent = `✨ تحلیل هوش مصنوعی — ${profile.name}`;
    toolbar.hidden = true; foot.hidden = true;
    renderAiBody();
  }
  $('modal-drill').hidden = false;
}

function renderCatChips() {
  const chips = $('cat-chips');
  chips.innerHTML = '';
  const all = document.createElement('button');
  all.className = `cat-chip ${drillState.cat === 'all' ? 'active' : ''}`;
  all.innerHTML = `همه <span class="cnt">(${faNum((snapshot.domains || []).length)})</span>`;
  all.addEventListener('click', () => { drillState.cat = 'all'; renderCatChips(); renderDrillList(); });
  chips.appendChild(all);
  for (const c of categories) {
    const b = document.createElement('button');
    b.className = `cat-chip ${drillState.cat === c.category ? 'active' : ''}`;
    b.innerHTML = `${c.icon} ${esc(c.label)} <span class="cnt">(${faNum(c.domains)})</span>`;
    b.addEventListener('click', () => { drillState.cat = c.category; renderCatChips(); renderDrillList(); });
    chips.appendChild(b);
  }
}

function renderSearchChips() {
  const chips = $('cat-chips');
  chips.innerHTML = '';
  const cats = categories.filter((c) => c.category !== 'search' && c.category !== 'other').slice(0, 8);
  const all = document.createElement('button');
  all.className = `cat-chip ${drillState.cat === 'all' ? 'active' : ''}`;
  all.innerHTML = `همه <span class="cnt">(${faNum((snapshot.searches || []).length)})</span>`;
  all.addEventListener('click', () => { drillState.cat = 'all'; renderSearchChips(); renderDrillList(); });
  chips.appendChild(all);
  for (const c of cats) {
    const b = document.createElement('button');
    b.className = `cat-chip ${drillState.cat === c.category ? 'active' : ''}`;
    b.innerHTML = `${c.icon} ${esc(c.label)}`;
    b.addEventListener('click', () => { drillState.cat = c.category; renderSearchChips(); renderDrillList(); });
    chips.appendChild(b);
  }
}

function renderDrillList() {
  const { mode, cat, q, limit } = drillState;
  const body = $('drill-body');
  body.textContent = '';
  const list = document.createElement('div');
  list.className = 'drill-list';

  let items = [];
  if (mode === 'domains') {
    items = (snapshot.domains || [])
      .filter((d) => (cat === 'all' || (d._cat || catOf(d.domain)) === cat))
      .filter((d) => !q || d.domain.includes(q.toLowerCase()));
  } else {
    items = (snapshot.searches || [])
      .filter((s) => (cat === 'all' || (s._cats || []).includes(cat)))
      .filter((s) => !q || s.term.toLowerCase().includes(q.toLowerCase()));
  }
  items = [...items].sort((a, b) => (mode === 'domains' ? b.visits - a.visits : b.count - a.count));

  const max = Math.max(...items.map((i) => (mode === 'domains' ? i.visits : i.count)), 1);
  const shown = items.slice(0, limit);

  if (!shown.length) {
    body.innerHTML = '<p class="hint" style="text-align:center;padding:30px 0">موردی مطابق فیلتر پیدا نشد.</p>';
    $('drill-more').hidden = true;
    return;
  }

  shown.forEach((item, idx) => {
    const isDomain = mode === 'domains';
    const row = document.createElement('div');
    row.className = 'drill-row';
    row.innerHTML = `
      <div class="dr-rank">${faNum(idx + 1)}</div>
      <div class="dr-main">
        <div class="dr-title ${!isDomain ? 'fa' : ''}">${esc(isDomain ? item.domain : item.term)}</div>
        <div class="dr-sub">${esc(isDomain
          ? `${catIcon(catOf(item.domain))} ${catLabel(catOf(item.domain))} • آخرین بازدید: ${item.lastVisit ? faDate(item.lastVisit) : '—'}`
          : `موتور: ${esc(item.engine || '—')} • آخرین: ${item.lastSeen ? faDate(item.lastSeen) : '—'}`)}</div>
      </div>
      <div class="dr-bar-wrap"><div class="dr-bar" style="width:${Math.max(4, ((isDomain ? item.visits : item.count) / max) * 100)}%"></div></div>
      <div class="dr-count">${isDomain ? `${faNum(item.visits)} بازدید` : `${faNum(item.count)} بار`}</div>`;
    if (isDomain) {
      row.insertAdjacentHTML('beforeend', `<span class="dr-cat">${esc(catLabel(catOf(item.domain)))}</span>`);
    }
    list.appendChild(row);
  });

  body.appendChild(list);
  $('drill-more').hidden = items.length <= limit;
  $('drill-more').textContent = `نمایش بیشتر (${faNum(items.length - limit)} مورد باقی‌مانده)`;
}

// دسته هر دامنه از categories محاسبه‌شده سمت سرور — به‌صورت local cache
const catMap = new Map();
function buildCatMap() {
  catMap.clear();
  // سرور categories آماری می‌دهد؛ برای هر دامنه از API detail استفاده می‌کنیم
  // (snapshot دامنه‌ها را با دسته از سرور داریم: از پاسخ detail)
}
function catOf(domain) {
  if (catMap.has(domain)) return catMap.get(domain);
  return 'other';
}
function catLabel(cat) {
  return categories.find((c) => c.category === cat)?.label || cat;
}
function catIcon(cat) {
  return categories.find((c) => c.category === cat)?.icon || '🌐';
}

function renderInterestsBody() {
  const body = $('drill-body');
  body.textContent = '';
  for (const sec of interests) {
    const wrap = document.createElement('div');
    wrap.className = 'interest-section';
    wrap.innerHTML = `
      <div class="is-head">
        <span class="is-icon">${sec.icon}</span>
        <h4>${esc(sec.title)}</h4>
        <span class="is-score">${esc(sec.score)}</span>
      </div>`;

    if (sec.chart) {
      const chart = document.createElement('div');
      chart.style.cssText = 'display:flex;gap:4px;align-items:flex-end;height:70px;background:var(--surface-2);border:1px solid var(--stroke);border-radius:12px;padding:12px;';
      const max = Math.max(...sec.chart.buckets, 1);
      sec.chart.buckets.forEach((v, i) => {
        chart.insertAdjacentHTML('beforeend',
          `<div style="flex:1;height:${Math.max(4, (v / max) * 100)}%;background:linear-gradient(180deg,var(--brand),var(--brand-2));border-radius:5px 5px 0 0;opacity:${0.45 + (i / sec.chart.buckets.length) * 0.55};" title="${faNum(v)}"></div>`);
      });
      wrap.appendChild(chart);
      wrap.insertAdjacentHTML('beforeend', `<p class="hint" style="text-align:center">${esc(sec.chart.caption)}</p>`);
    }

    if (sec.items?.length) {
      const items = document.createElement('div');
      items.className = 'interest-items';
      const maxW = Math.max(...sec.items.map((i) => i.weight || 0), 0.0001);
      for (const it of sec.items) {
        items.insertAdjacentHTML('beforeend',
          `<span class="interest-item" style="opacity:${0.62 + ((it.weight || 0) / maxW) * 0.38}">${esc(it.label)} <b>${esc(it.badge)}</b></span>`);
      }
      wrap.appendChild(items);
    }
    body.appendChild(wrap);
  }
}

function renderAiBody() {
  const body = $('drill-body');
  body.textContent = '';
  if (analysis) {
    renderAnalysisInto(body, analysis);
  } else {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:30px 0;display:flex;flex-direction:column;gap:14px;align-items:center;';
    empty.innerHTML = `<div style="font-size:40px">✨</div><p style="color:var(--text-2)">این پروفایل هنوز با هوش مصنوعی تحلیل نشده است.</p>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '🚀 اجرای تحلیل هوشمند';
    btn.addEventListener('click', () => { $('modal-drill').hidden = true; runAnalysis(); });
    empty.appendChild(btn);
    body.appendChild(empty);
  }
}

function renderAnalysisInto(container, a) {
  container.textContent = '';
  const secs = [
    ['📌', 'عنوان پروفایل', a.profileTitle, 'text'],
    ['❤️', 'علاقه‌مندی‌های شناسایی‌شده', a.interests, 'interests'],
    ['🧠', 'تحلیل رفتاری و شخصیت', a.personality, 'text'],
    ['🛒', 'عادت‌های خرید', a.shoppingHabits, 'text'],
    ['🔮', 'پیش‌بینی نیازهای بعدی', a.topPredictions, 'list'],
    ['🏷️', 'دسته‌های پیشنهادی', a.recommendedCategories, 'list'],
    ['📢', 'نکات بازاریابی', a.marketingTips, 'list'],
    ['📝', 'جمع‌بندی', a.summary, 'text'],
  ];
  for (const [icon, title, content, kind] of secs) {
    if (content === undefined || content === null || (Array.isArray(content) && !content.length)) continue;
    const sec = document.createElement('div');
    sec.className = 'ai-section';
    sec.innerHTML = `<div class="ai-section-title">${icon} ${title}</div>`;
    if (kind === 'text') {
      sec.insertAdjacentHTML('beforeend', `<p class="ai-text">${esc(content)}</p>`);
    } else if (kind === 'list') {
      const ul = document.createElement('ul');
      ul.className = 'ai-list';
      for (const item of content) ul.insertAdjacentHTML('beforeend', `<li>${esc(item)}</li>`);
      sec.appendChild(ul);
    } else if (kind === 'interests') {
      const chips = document.createElement('div');
      chips.className = 'ai-chips';
      for (const it of content) {
        chips.insertAdjacentHTML('beforeend',
          `<span class="ai-chip"><b>${esc(it.strength ? `[${it.strength}] ` : '')}</b>${esc(it.title)} — ${esc(it.detail || '')}</span>`);
      }
      sec.appendChild(chips);
    }
    container.appendChild(sec);
  }
}

function renderAnalysisPanel() {
  $('ai-panel').hidden = false;
  $('ai-panel-name').textContent = profile.name;
  $('ai-panel-meta').textContent = `تحلیل‌شده در ${faDateTime(analysis.analyzedAt)} • مدل: ${analysis.model || '—'}`;
  renderAnalysisInto($('ai-panel-body'), analysis);
}

// ───────────────────────── تحلیل هوشمند ─────────────────────────
async function runAnalysis() {
  const btn = $('btn-analyze');
  btn.disabled = true;
  $('btn-analyze-label').textContent = 'در حال تحلیل…';
  $('ai-panel').hidden = false;
  $('ai-panel-name').textContent = profile.name;
  $('ai-panel-meta').textContent = 'در حال پردازش…';
  const body = $('ai-panel-body');
  body.innerHTML = `<div class="ai-loading">
    <div class="ai-spinner"></div>
    <p>هوش مصنوعی در حال تحلیل پروفایل <b>${esc(profile.name)}</b> است… (تا ۲ دقیقه)</p>
  </div>`;
  $('ai-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const r = await api(`/api/profiles/${UID}/analyze`, { method: 'POST' });
    analysis = r.analysis;
    renderAnalysisPanel();
    $('ib-ai-sub').textContent = `${analysis.profileTitle} • ${faDateTime(analysis.analyzedAt)}`;
    toast('تحلیل هوشمند ذخیره شد ✅', 'ok');
  } catch (e) {
    body.innerHTML = `<div class="hint" style="text-align:center;padding:20px;color:var(--danger)">❌ ${esc(e.message)}</div>`;
    const retry = document.createElement('button');
    retry.className = 'btn btn-primary btn-sm';
    retry.textContent = 'تلاش مجدد';
    retry.addEventListener('click', runAnalysis);
    body.appendChild(retry);
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    $('btn-analyze-label').textContent = 'تحلیل هوشمند';
  }
}
$('btn-analyze').addEventListener('click', runAnalysis);

// ───────────────────────── اکشن‌های پروفایل ─────────────────────────
$('btn-p-export').addEventListener('click', (e) => {
  e.preventDefault();
  // دانلود با نشست کوکی‌دار
  const a = document.createElement('a');
  a.href = `/api/profiles/${UID}/export`;
  a.download = `${UID}.json`;
  a.click();
});

$('btn-p-tg').addEventListener('click', async () => {
  try {
    await api(`/api/profiles/${UID}/send-telegram`, { method: 'POST' });
    toast('پروفایل به تلگرام ارسال شد 📨', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-p-delete').addEventListener('click', async () => {
  if (!confirm(`پروفایل «${profile.name}» (${profile.uid}) برای همیشه حذف شود؟`)) return;
  try {
    await api(`/api/profiles/${UID}`, { method: 'DELETE' });
    toast('پروفایل حذف شد 🗑', 'ok');
    setTimeout(() => { location.href = '/'; }, 700);
  } catch (e) { toast(e.message, 'err'); }
});

// ویرایش نام
$('p-name').addEventListener('blur', async () => {
  const newName = $('p-name').textContent.trim().slice(0, 60);
  if (!newName || newName === profile.name) { $('p-name').textContent = profile.name; return; }
  try {
    await api(`/api/profiles/${UID}`, { method: 'PATCH', body: JSON.stringify({ name: newName }) });
    profile.name = newName;
    $('p-avatar').textContent = initials(newName);
    toast('نام به‌روزرسانی شد ✏️', 'ok');
  } catch (e) {
    $('p-name').textContent = profile.name;
    toast(e.message, 'err');
  }
});
$('p-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('p-name').blur(); } });

// ───────────────────────── رویدادهای عمومی ─────────────────────────
$('box-domains').addEventListener('click', () => openDrill('domains'));
$('box-searches').addEventListener('click', () => openDrill('searches'));
$('box-interests').addEventListener('click', () => openDrill('interests'));
$('box-ai').addEventListener('click', () => openDrill('ai'));

$('drill-search').addEventListener('input', (e) => {
  if (drillState) { drillState.q = e.target.value; drillState.limit = 60; renderDrillList(); }
});
$('drill-more').addEventListener('click', () => {
  if (drillState) { drillState.limit += 100; renderDrillList(); }
});

document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => { $(btn.dataset.close).hidden = true; }));
document.querySelectorAll('.modal-backdrop').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop').forEach((m) => { m.hidden = true; });
});

// ───────────────────────── شروع ─────────────────────────
loadProfile().then(() => {
  // ساخت نگاشت دامنه→دسته از پاسخ سرور (در detail categories آماری است؛
  // برای دقت کامل، دسته هر دامنه را از سرور می‌پرسیم یک‌جا)
  if (snapshot?.domains?.length) {
    api(`/api/profiles/${UID}/domains-map`).then((r) => {
      for (const [d, c] of Object.entries(r.map || {})) catMap.set(d, c);
      for (const s of snapshot.searches || []) {
        s._cats = r.searchCats?.[s.term] || [];
      }
      if (drillState?.mode === 'domains' || drillState?.mode === 'searches') renderDrillList();
    }).catch(() => {});
  }
});

})();
