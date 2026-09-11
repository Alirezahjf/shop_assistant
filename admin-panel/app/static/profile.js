// ============================================================================
// profile.js — نمای تفصیلی پروفایل
// ----------------------------------------------------------------------------
// مسئولیت‌ها: هدر چسبان + ویرایش نام، KPI (با نمودار میله‌ای)، چهار جعبهٔ بینش،
//             مودال drill (دامنه‌ها/جستجوها/علاقه‌مندی‌ها/AI)، تحلیل هوشمند،
//             خروجی JSON، ارسال به تلگرام و حذف.
// endpointها ثابت مانده‌اند: GET /api/profiles/{uid} ، PATCH/DELETE همان مسیر،
//             GET .../export ، GET .../domains-map ، POST .../analyze و .../send-telegram
// ============================================================================
(function () {
'use strict';

const $ = (id) => document.getElementById(id);
const { icon, esc, faNum, faDate, faDateTime, initials, avatarClass, sourceMeta, catIcon, toast, api } = App;
const UID = decodeURIComponent(location.pathname.split('/').pop() || '');

const state = {
  profile: null,
  snapshot: null,
  analysis: null,
  categories: [],
  interests: [],
  catMap: new Map(),
  searchCats: {},
  drill: null,
  busy: false,
};

// آیکون هر بخش علاقه‌مندی (به‌جای ایموجی سرور)
const INTEREST_ICONS = {
  top_searches: 'search', top_sites: 'globe', categories: 'heart',
  shopping: 'bag', recency: 'clock', breadth: 'compass',
};

// ───────────────────────────── بارگذاری و رندر ─────────────────────────────
async function load() {
  try {
    const data = await api(`/api/profiles/${UID}`);
    state.profile = data.profile;
    state.snapshot = data.snapshot;
    state.analysis = data.analysis;
    state.categories = data.categories || [];
    state.interests = data.interests || [];
    renderHeader();
    renderKpi();
    renderInsights();
    renderAiPanel();
    loadDomainsMap();
  } catch (e) {
    toast(e.message, 'err');
    const grid = $('kpi-row');
    if (grid) grid.innerHTML = `<div class="notice">${esc(e.message)}</div>`;
    setTimeout(() => { location.href = '/'; }, 1800);
  }
}

function loadDomainsMap() {
  api(`/api/profiles/${UID}/domains-map`).then((r) => {
    Object.entries(r.map || {}).forEach(([d, c]) => state.catMap.set(d, c));
    state.searchCats = r.searchCats || {};
    if (state.drill && (state.drill.mode === 'domains' || state.drill.mode === 'searches')) renderDrill();
  }).catch(() => { /* نگاشت دسته اختیاری است */ });
}

function renderHeader() {
  const p = state.profile;
  const nameEl = $('p-name');
  nameEl.textContent = p.name;
  nameEl.dataset.empty = p.name ? 'false' : 'true';

  const av = $('p-avatar');
  av.className = `avatar avatar--lg ${avatarClass(p.uid + p.name)}`;
  av.textContent = initials(p.name);

  const src = sourceMeta(p.source);
  const meta = $('p-meta');
  meta.innerHTML = [
    `<span>دستگاه: <b>${esc(p.deviceLabel || 'نامشخص')}</b></span>`,
    `<span class="sep">•</span>`,
    `<span>بازه: ${faNum(p.rangeDays)} روز</span>`,
    `<span class="sep">•</span>`,
    `<span>ایمپورت: ${esc(faDateTime(p.importedAt))}</span>`,
    `<span class="sep">•</span>`,
    `<span class="badge ${src.cls}">${icon(src.icon)}<span>${esc(src.label)}</span></span>`,
    `<span class="badge">${icon('file')}<span class="mono">${esc(p.sourceFile || '—')}</span></span>`,
  ].join('');

  const badges = state.categories.slice(0, 3)
    .map((c) => `<span class="badge badge--secondary">${icon(catIcon(c.category))}<span>${esc(c.label)}</span> <span class="cnt">(${faNum(c.domains)})</span></span>`)
    .join('');
  if (badges) {
    const wrap = document.createElement('span');
    wrap.className = 'cat-badges';
    wrap.innerHTML = badges;
    meta.appendChild(wrap);
  }
}

function renderKpi() {
  const p = state.profile;
  const domains = state.snapshot?.domains || [];
  const hist = new Array(7).fill(0);
  for (const d of domains) (d.histogram || []).forEach((v, i) => { if (i < 7) hist[i] += v; });
  const histTotal = hist.reduce((a, b) => a + b, 0);
  const recent = histTotal ? Math.round(((hist[4] + hist[5] + hist[6]) / histTotal) * 100) : 0;

  const cards = [
    { label: 'کل بازدیدهای ثبت‌شده', icon: 'chart', value: faNum(p.stats?.totalVisits || 0), foot: `در بازهٔ ${faNum(p.rangeDays)} روز` },
    { label: 'دامنه‌های یکتا', icon: 'globe', value: faNum(p.stats?.domains || 0), foot: `${faNum(state.categories.length)} دستهٔ موضوعی` },
    { label: 'جستجوهای یکتا', icon: 'search', value: faNum(p.stats?.searches || 0), foot: (state.snapshot?.searches || []).length ? `پرتکرارترین: «${esc((state.snapshot.searches[0] || {}).term || '—')}»` : 'جستجویی ثبت نشده' },
    { label: 'کوکی امن (بدون مقدار)', icon: 'lock', value: faNum(p.stats?.cookies || 0), foot: 'فقط شمارش، بدون محتوا' },
    { label: 'فعالیت نیمهٔ اخیر', icon: 'activity', value: `٪${faNum(recent)}`, foot: 'سهم ۳ بازهٔ آخر', chart: hist },
  ];

  const row = $('kpi-row');
  row.innerHTML = cards.map((c) => `
    <div class="kpi-card">
      <span class="kpi-card__label">${icon(c.icon)}<span>${esc(c.label)}</span></span>
      <span class="kpi-card__value">${c.value}</span>
      <span class="kpi-card__foot">${c.foot}</span>
      ${c.chart ? `<span class="kpi-chart" aria-hidden="true">${chartBars(c.chart)}</span>` : ''}
    </div>`).join('');
}

function chartBars(values) {
  const max = Math.max(...values, 1);
  return values.map((v) => `<span class="kpi-chart__bar" style="height:${Math.max(8, Math.round((v / max) * 100))}%"></span>`).join('');
}

function renderInsights() {
  const p = state.profile;
  $('ib-domains-sub').textContent = `${faNum(p.stats?.domains || 0)} دامنه در ${faNum(state.categories.length)} دسته`;
  const top = (state.snapshot?.searches || [])[0];
  $('ib-searches-sub').textContent = top
    ? `پرتکرارترین: «${top.term}» (${faNum(top.count)} بار)`
    : 'جستجویی ثبت نشده';
  $('ib-interests-sub').textContent = `${faNum(state.interests.length)} معیار تحلیل‌شدهٔ محلی`;
  $('ib-ai-sub').textContent = state.analysis
    ? `${state.analysis.profileTitle || 'تحلیل‌شده'} • ${faDate(state.analysis.analyzedAt)}`
    : 'هنوز تحلیل نشده — با یک کلیک بساز';
}

// ───────────────────────────── مودال drill ─────────────────────────────
const DRILL_META = {
  domains: { title: 'سایت‌های بازدیدشده', sub: 'مرتب بر اساس تعداد بازدید', toolbar: true },
  searches: { title: 'جستجوها', sub: 'مرتب بر اساس تعداد تکرار', toolbar: true },
  interests: { title: 'علاقه‌مندی‌ها', sub: 'موتور محلی، صفر توکن', toolbar: false },
  ai: { title: 'تحلیل هوش مصنوعی', sub: 'گزارش ساختاریافته', toolbar: false },
};

function openDrill(mode) {
  state.drill = { mode, cat: 'all', q: '', limit: 60 };
  const meta = DRILL_META[mode];
  $('drill-title').textContent = meta.title;
  $('drill-sub').textContent = `${meta.sub} — ${state.profile?.name || ''}`;
  $('drill-toolbar').hidden = !meta.toolbar;
  $('drill-foot').hidden = !meta.toolbar;
  $('drill-search').value = '';
  renderDrill();
  App.openModal('modal-drill');
}

function catOf(domain) { return state.catMap.get(domain) || 'other'; }
function catLabel(cat) {
  const c = state.categories.find((x) => x.category === cat);
  return c ? c.label : 'سایر';
}
function catCount(cat) {
  const c = state.categories.find((x) => x.category === cat);
  return c ? c.domains : 0;
}

function renderCatChips() {
  const chips = $('cat-chips');
  const isDomains = state.drill.mode === 'domains';
  const list = isDomains
    ? state.categories
    : state.categories.filter((c) => c.category !== 'search' && c.category !== 'other').slice(0, 8);
  const total = isDomains ? (state.snapshot?.domains || []).length : (state.snapshot?.searches || []).length;

  const parts = [`<button type="button" class="chip ${state.drill.cat === 'all' ? 'is-active' : ''}" data-cat="all">
      ${icon('layers')}<span>همه</span><span class="cnt">(${faNum(total)})</span></button>`];
  for (const c of list) {
    parts.push(`<button type="button" class="chip ${state.drill.cat === c.category ? 'is-active' : ''}" data-cat="${esc(c.category)}">
      ${icon(catIcon(c.category))}<span>${esc(c.label)}</span>${isDomains ? `<span class="cnt">(${faNum(c.domains)})</span>` : ''}</button>`);
  }
  chips.innerHTML = parts.join('');
  chips.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    state.drill.cat = b.dataset.cat;
    state.drill.limit = 60;
    renderDrill();
  }));
}

function drillItems() {
  const { mode, cat, q } = state.drill;
  const needle = q.toLowerCase();
  if (mode === 'domains') {
    return (state.snapshot?.domains || [])
      .filter((d) => cat === 'all' || catOf(d.domain) === cat)
      .filter((d) => !needle || d.domain.includes(needle))
      .sort((a, b) => (b.visits || 0) - (a.visits || 0));
  }
  return (state.snapshot?.searches || [])
    .filter((s) => cat === 'all' || (state.searchCats[s.term] || []).includes(cat))
    .filter((s) => !needle || s.term.toLowerCase().includes(needle))
    .sort((a, b) => (b.count || 0) - (a.count || 0));
}

function renderDrill() {
  if (!state.drill) return;
  const { mode } = state.drill;
  if (mode === 'interests') { renderInterests(); return; }
  if (mode === 'ai') { renderAiDrill(); return; }

  renderCatChips();
  const items = drillItems();
  const shown = items.slice(0, state.drill.limit);
  const body = $('drill-body');
  const isDomains = mode === 'domains';
  const max = Math.max(...items.map((i) => (isDomains ? i.visits : i.count) || 0), 1);

  if (!shown.length) {
    body.innerHTML = `<div class="notice">موردی مطابق این فیلتر پیدا نشد.</div>`;
    $('drill-foot').hidden = true;
    return;
  }

  body.innerHTML = `<div class="drill-list">${shown.map((item, idx) => {
    const value = isDomains ? item.visits : item.count;
    const cat = isDomains ? catOf(item.domain) : (state.searchCats[item.term] || [])[0];
    const sub = isDomains
      ? `${icon('clock')}<span>آخرین بازدید: ${item.lastVisit ? esc(faDate(item.lastVisit)) : '—'}</span>`
      : `${icon('search')}<span>موتور: ${esc(item.engine || '—')}</span><span class="sep">•</span><span>آخرین: ${item.lastSeen ? esc(faDate(item.lastSeen)) : '—'}</span>`;
    return `
      <div class="drill-row">
        <div class="drill-row__rank">${faNum(idx + 1)}</div>
        <div class="drill-row__main">
          <div class="drill-row__title ${isDomains ? '' : 'drill-row__title--fa'}">${esc(isDomains ? item.domain : item.term)}</div>
          <div class="drill-row__sub">${sub}</div>
        </div>
        <div class="drill-row__barwrap">
          <div class="drill-row__bar" style="width:${Math.max(3, Math.round((value / max) * 100))}%" role="presentation"></div>
        </div>
        <div class="drill-row__count">${isDomains ? `${faNum(value)} بازدید` : `${faNum(value)} بار`}</div>
        ${cat ? `<div class="badge badge--secondary drill-row__cat">${icon(catIcon(cat))}<span>${esc(catLabel(cat))}</span></div>` : '<span></span>'}
      </div>`;
  }).join('')}</div>`;

  const foot = $('drill-foot');
  const more = $('drill-more');
  foot.hidden = items.length <= state.drill.limit;
  if (!foot.hidden) more.textContent = `نمایش بیشتر (${faNum(items.length - state.drill.limit)} مورد باقی‌مانده)`;
}

function renderInterests() {
  const body = $('drill-body');
  if (!state.interests.length) {
    body.innerHTML = `<div class="notice">داده‌ای برای استخراج علاقه‌مندی وجود ندارد.</div>`;
    return;
  }
  body.innerHTML = state.interests.map((sec) => {
    const items = (sec.items || []).map((it) => `
      <span class="ai-chip" title="${esc(it.badge || '')}">${esc(it.label)} <b>${esc(it.badge || '')}</b></span>`).join('');
    const chart = sec.chart
      ? `<span class="kpi-chart" aria-hidden="true">${chartBars(sec.chart.buckets)}</span>
         <p class="hint" style="text-align:center">${esc(sec.chart.caption)}</p>`
      : '';
    return `
      <section class="ai-section">
        <h3 class="ai-section__title">${icon(INTEREST_ICONS[sec.id] || 'info')} ${esc(sec.title)}
          <span class="badge badge--gold">${esc(sec.score)}</span></h3>
        ${chart}
        ${items ? `<div class="ai-chips">${items}</div>` : ''}
      </section>`;
  }).join('');
}

// ساختار گزارش AI (کلیدها از سرور می‌آید)
const AI_SECTIONS = [
  { key: 'profileTitle', title: 'عنوان پروفایل', icon: 'tag', kind: 'text' },
  { key: 'interests', title: 'علاقه‌مندی‌های شناسایی‌شده', icon: 'heart', kind: 'chips' },
  { key: 'personality', title: 'تحلیل رفتاری و شخصیت', icon: 'activity', kind: 'text' },
  { key: 'shoppingHabits', title: 'عادت‌های خرید', icon: 'bag', kind: 'text' },
  { key: 'topPredictions', title: 'پیش‌بینی نیازهای بعدی', icon: 'sparkles', kind: 'list' },
  { key: 'recommendedCategories', title: 'دسته‌های پیشنهادی', icon: 'layers', kind: 'list' },
  { key: 'marketingTips', title: 'نکات بازاریابی', icon: 'chart', kind: 'list' },
  { key: 'summary', title: 'جمع‌بندی', icon: 'clipboard', kind: 'text' },
];

function analysisHtml(a) {
  return AI_SECTIONS.map((s) => {
    const value = a ? a[s.key] : null;
    if (value === undefined || value === null || value === '') return '';
    if (Array.isArray(value) && !value.length) return '';
    let inner = '';
    if (s.kind === 'text') {
      inner = `<p class="ai-text">${esc(value)}</p>`;
    } else if (s.kind === 'list') {
      inner = `<ul class="ai-bullets">${value.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;
    } else {
      inner = `<div class="ai-chips">${value.map((it) => `
        <span class="ai-chip"><b>${esc(it.strength || '')}</b> ${esc(it.title)}${it.detail ? ` — ${esc(it.detail)}` : ''}</span>`).join('')}</div>`;
    }
    return `<section class="ai-section"><h3 class="ai-section__title">${icon(s.icon)} ${esc(s.title)}</h3>${inner}</section>`;
  }).join('');
}

function renderAiPanel() {
  const panel = $('ai-panel');
  if (!state.analysis) { panel.hidden = true; return; }
  panel.hidden = false;
  $('ai-panel-name').textContent = state.profile?.name || '';
  $('ai-panel-meta').textContent = `تحلیل‌شده در ${faDateTime(state.analysis.analyzedAt)} • مدل: ${state.analysis.model || '—'}`;
  $('ai-panel-body').innerHTML = analysisHtml(state.analysis);
}

function renderAiDrill() {
  const body = $('drill-body');
  if (state.analysis) {
    body.innerHTML = analysisHtml(state.analysis);
    return;
  }
  body.innerHTML = `
    <div class="notice">این پروفایل هنوز با هوش مصنوعی تحلیل نشده است.</div>
    <button class="btn btn--primary btn--block" id="drill-run-ai">
      ${icon('sparkles')}<span>اجرای تحلیل هوشمند</span>
    </button>`;
  $('drill-run-ai')?.addEventListener('click', () => { App.closeModal('modal-drill'); runAnalysis(); });
}

// ───────────────────────────── تحلیل هوشمند ─────────────────────────────
const AI_STEPS = [
  { icon: 'database', label: 'آماده‌سازی داده‌های پاکسازی‌شده' },
  { icon: 'cpu', label: 'ارسال به مدل و دریافت تحلیل' },
  { icon: 'clipboard', label: 'ساختاردهی گزارش فارسی' },
];

function renderAiLoading(body) {
  body.innerHTML = `
    <div class="ai-loading">
      <p class="hint">هوش مصنوعی در حال تحلیل پروفایل «${esc(state.profile?.name || '')}» است…</p>
      <div class="ai-steps" id="ai-steps">
        ${AI_STEPS.map((s, i) => `
          <div class="ai-step ${i === 0 ? 'is-active' : ''}" data-step="${i}">
            <span class="ai-step__mark">${icon(s.icon)}</span>
            <span>${esc(s.label)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function advanceAiSteps() {
  const steps = () => [...document.querySelectorAll('#ai-steps .ai-step')];
  const timers = [
    setTimeout(() => {
      steps().forEach((el, i) => {
        el.classList.toggle('is-done', i < 1);
        el.classList.toggle('is-active', i === 1);
      });
    }, 1200),
    setTimeout(() => {
      steps().forEach((el, i) => {
        el.classList.toggle('is-done', i < 2);
        el.classList.toggle('is-active', i === 2);
      });
    }, 3000),
  ];
  return () => timers.forEach(clearTimeout);
}

// مدیریت 429 با شمارش معکوس و disabled روی دکمه تحلیل
let retryTimer = null;
function startRetryCountdown(seconds, btn) {
  if (retryTimer) clearInterval(retryTimer);
  let remaining = seconds;
  const label = $('btn-analyze-label');
  const update = () => {
    const txt = `تلاش مجدد تا ${faNum(remaining)} ثانیه`;
    if (btn) {
      btn.disabled = true;
      if (label) label.textContent = txt;
      else btn.textContent = txt;
    }
    toast(`محدودیت نرخ AvalAI — ${faNum(remaining)} ثانیه دیگر`, 'err', 1200);
  };
  update();
  retryTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(retryTimer);
      retryTimer = null;
      if (btn) {
        btn.disabled = false;
        if (label) label.textContent = 'تحلیل هوشمند';
      }
      App.btnLoading(btn, false);
      state.busy = false;
      return;
    }
    if (btn) {
      if (label) label.textContent = `تلاش مجدد تا ${faNum(remaining)} ثانیه`;
    }
  }, 1000);
}

async function runAnalysis() {
  if (state.busy) return;
  state.busy = true;
  const btn = $('btn-analyze');
  const label = $('btn-analyze-label');
  App.btnLoading(btn, true, 'در حال تحلیل…');
  if (label) label.textContent = 'در حال تحلیل…';

  const panel = $('ai-panel');
  panel.hidden = false;
  $('ai-panel-name').textContent = state.profile?.name || '';
  $('ai-panel-meta').textContent = 'در حال پردازش…';
  const body = $('ai-panel-body');
  renderAiLoading(body);
  const stopSteps = advanceAiSteps();

  try {
    const r = await api(`/api/profiles/${UID}/analyze`, { method: 'POST' });
    state.analysis = r.analysis;
    stopSteps();
    renderAiPanel();
    renderInsights();
    toast('تحلیل هوشمند ذخیره شد', 'ok');
  } catch (e) {
    stopSteps();
    // 429 → شمارش معکوس و disabled
    if (e.status === 429) {
      const ra = e.retryAfter || 30;
      $('ai-panel-meta').textContent = `محدودیت نرخ — ${faNum(ra)} ثانیه`;
      body.innerHTML = `
        <div class="ai-error">
          <span class="ai-error__icon">${icon('alert')}</span>
          <p>${esc(e.message)}</p>
          <span class="hint">سهم نرخ/اعتبار حساب AvalAI پر شده؛ ${faNum(ra)} ثانیه دیگر دوباره تلاش کنید. اگر ادامه داشت، اعتبار حساب را در chat.avalai.ir/platform/home بررسی کن.</span>
          <button class="btn btn--secondary btn--sm" id="ai-retry" disabled>${icon('clock')}<span>تلاش مجدد تا ${faNum(ra)} ثانیه</span></button>
        </div>`;
      startRetryCountdown(ra, btn);
      toast(`${esc(e.message)} — ${faNum(ra)} ثانیه صبر`, 'err', 4000);
      return;
    }
    // 409 single-flight → toast بدون رفرش خودکار
    if (e.status === 409) {
      $('ai-panel-meta').textContent = 'در حال انجام';
      body.innerHTML = `
        <div class="ai-error">
          <span class="ai-error__icon">${icon('clock')}</span>
          <p>${esc(e.message)}</p>
          <span class="hint">تحلیل دیگری در حال اجراست؛ لطفاً صبر کنید.</span>
          <button class="btn btn--primary btn--sm" id="ai-retry">${icon('refresh')}<span>تلاش مجدد</span></button>
        </div>`;
      $('ai-retry')?.addEventListener('click', runAnalysis);
      toast(e.message, 'info', 4000);
      // busy را آزاد نکن تا دکمه دوباره فعال شود؟ اما اجازه تلاش مجدد می‌دهیم
      state.busy = false;
      App.btnLoading(btn, false);
      if (label) label.textContent = 'تحلیل هوشمند';
      return;
    }
    $('ai-panel-meta').textContent = 'ناموفق';
    body.innerHTML = `
      <div class="ai-error">
        <span class="ai-error__icon">${icon('alert')}</span>
        <p>${esc(e.message)}</p>
        <span class="hint">اتصال اینترنت یا کلید AvalAI را در «تنظیمات پنل» بررسی کن. داده‌ای از دست نرفته است.</span>
        <button class="btn btn--primary btn--sm" id="ai-retry">${icon('refresh')}<span>تلاش مجدد</span></button>
      </div>`;
    $('ai-retry')?.addEventListener('click', runAnalysis);
    toast(e.message, 'err', 5000);
  } finally {
    if (retryTimer == null) {
      state.busy = false;
      App.btnLoading(btn, false);
      if (label && !btn.disabled) label.textContent = 'تحلیل هوشمند';
    }
  }
}

// ───────────────────────────── اقدام‌های پروفایل ─────────────────────────────
function exportJson() {
  const a = document.createElement('a');
  a.href = `/api/profiles/${UID}/export`;
  a.download = `${UID}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('فایل JSON در حال دانلود است', 'info', 2200);
}

async function sendToTelegram(btn) {
  App.btnLoading(btn, true, 'در حال ارسال…');
  try {
    await api(`/api/profiles/${UID}/send-telegram`, { method: 'POST' });
    toast('پروفایل به تلگرام ارسال شد', 'ok');
  } catch (e) {
    toast(e.message, 'err', 5000);
  } finally {
    App.btnLoading(btn, false);
  }
}

async function deleteProfile(btn) {
  const name = state.profile?.name || UID;
  const ok = await App.confirm({
    title: 'حذف پروفایل',
    text: `پروفایل <b>${esc(name)}</b> (<span class="mono">${esc(UID)}</span>) و گزارش تحلیل آن برای همیشه حذف می‌شود. این کار برگشت‌پذیر نیست.`,
    confirmLabel: 'حذف کن',
    danger: true,
  });
  if (!ok) return;
  App.btnLoading(btn, true, 'در حال حذف…');
  try {
    await api(`/api/profiles/${UID}`, { method: 'DELETE' });
    toast('پروفایل حذف شد', 'ok');
    setTimeout(() => { location.href = '/'; }, 700);
  } catch (e) {
    toast(e.message, 'err');
    App.btnLoading(btn, false);
  }
}

async function renameProfile(newName) {
  const el = $('p-name');
  const clean = String(newName || '').trim().slice(0, 60);
  if (!clean || clean === state.profile.name) {
    el.textContent = state.profile.name;
    return;
  }
  try {
    await api(`/api/profiles/${UID}`, { method: 'PATCH', body: JSON.stringify({ name: clean }) });
    state.profile.name = clean;
    el.textContent = clean;
    el.dataset.empty = 'false';
    $('p-avatar').textContent = initials(clean);
    toast('نام پروفایل به‌روزرسانی شد', 'ok', 2200);
  } catch (e) {
    el.textContent = state.profile.name;
    toast(e.message, 'err');
  }
}

async function pollTelegramFromProfile() {
  try {
    const r = await api('/api/telegram/poll', { method: 'POST' });
    const n = (r.imported || []).length;
    if (n) toast(`${faNum(n)} پروفایل جدید ایمپورت شد — در فهرست ببین`, 'ok', 5000);
    else if ((r.errors || []).length) toast(r.errors[0].error || 'خطا در پردازش فایل‌ها', 'err');
    else toast('فایل جدیدی در چت ربات نبود.', 'info');
  } catch (e) {
    toast(e.message, 'err', 5000);
  }
}

// ───────────────────────────── رویدادها ─────────────────────────────
App.wireShell({ onTelegramFetch: pollTelegramFromProfile });

const nameEl = $('p-name');
nameEl.addEventListener('blur', () => renameProfile(nameEl.textContent));
nameEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
  if (e.key === 'Escape') { nameEl.textContent = state.profile?.name || ''; nameEl.blur(); }
});
nameEl.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  document.execCommand('insertText', false, text);
});

$('btn-analyze')?.addEventListener('click', runAnalysis);
$('btn-p-export')?.addEventListener('click', exportJson);
$('btn-p-tg')?.addEventListener('click', (e) => sendToTelegram(e.currentTarget));
$('btn-p-delete')?.addEventListener('click', (e) => deleteProfile(e.currentTarget));

$('btn-more')?.addEventListener('click', () => App.openModal('modal-actions'));
$('ma-analyze')?.addEventListener('click', () => { App.closeModal('modal-actions'); runAnalysis(); });
$('ma-export')?.addEventListener('click', () => { App.closeModal('modal-actions'); exportJson(); });
$('ma-telegram')?.addEventListener('click', (e) => { App.closeModal('modal-actions'); sendToTelegram(e.currentTarget); });
$('ma-delete')?.addEventListener('click', (e) => { App.closeModal('modal-actions'); deleteProfile(e.currentTarget); });

$('box-domains')?.addEventListener('click', () => openDrill('domains'));
$('box-searches')?.addEventListener('click', () => openDrill('searches'));
$('box-interests')?.addEventListener('click', () => openDrill('interests'));
$('box-ai')?.addEventListener('click', () => openDrill('ai'));

$('drill-search')?.addEventListener('input', App.debounce((e) => {
  if (!state.drill) return;
  state.drill.q = e.target.value.trim();
  state.drill.limit = 60;
  renderDrill();
}, 140));

$('drill-more')?.addEventListener('click', () => {
  if (!state.drill) return;
  state.drill.limit += 100;
  renderDrill();
});

// ───────────────────────────── شروع ─────────────────────────────
load();

})();
