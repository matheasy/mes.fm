/* MES Stats -- mes.fm/stats
 *
 * Page-view leaderboard + Views Over Time chart, read from the
 * /api/stats and /api/stats-series endpoints (populated by
 * main_js/track.js beacons). Range tabs, sortable tables, per-page
 * device x source drill-down and the daily/weekly line chart all render
 * client-side from one cached API response per range.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const RANGE_LABELS = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', '365d': '365 days', all: 'all time' };
const DEVICE_LABELS = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', tv: 'TV', bot: 'Bot', unknown: 'Unknown' };
const DEFAULT_DEVICES = Object.keys(DEVICE_LABELS);
const SOURCE_LABELS = { direct: 'Direct', internal: 'Internal', google: 'Google', search: 'Other Search', social: 'Social', referral: 'Referral' };
const DEFAULT_SOURCES = Object.keys(SOURCE_LABELS);
let savedRange;
try { savedRange = localStorage.getItem('statsRange'); } catch (e) { savedRange = null; }
let currentRange = savedRange || '7d';
if (!(currentRange in RANGE_LABELS)) currentRange = '7d';

// The API already returns up to 50 rows in one (server-cached) call, so
// expanding/collapsing the list below is pure client-side rendering --
// no extra request or API cost per click.
const PAGES_PREVIEW_COUNT = 10;
let topPagesData = [];
let topPagesDevices = [];
let topPagesSources = [];
let deviceTotalsData = [];
let sourceTotalsData = [];
let showAllPages = false;
const showMoreBtn = document.getElementById('showMorePages');

// Per-table sort state. Text columns (page path, device/source name)
// default to A-Z; numeric columns (views, and each device/source view
// count) default to most-first. Clicking the already-active column just
// flips its direction instead of picking a new default.
let pagesSort = { key: 'views', dir: 'desc' };
let deviceSort = { key: 'views', dir: 'desc' };
let sourceSort = { key: 'views', dir: 'desc' };

// Which pages currently have their device x source drill-down open,
// keyed by "site|path". Persists across re-renders (sort clicks, Show
// more) since it's just a Set, not tied to DOM nodes.
const expandedPages = new Set();

// Pages ticked in the table to plot in Views Over Time (max 8, kept in tick
// order). Colors are stable per page while it stays ticked.
const MAX_PICKS = 8;
const SERIES_COLORS = ['#e8590c', '#2f9e44', '#9c36b5', '#d6336c', '#f08c00', '#0c8599', '#5f3dc4', '#868e96'];
let picks = [];
try {
  const saved = JSON.parse(localStorage.getItem('statsPicks') || '[]');
  if (Array.isArray(saved)) picks = saved.filter(function (k) { return typeof k === 'string' && k.indexOf('|') !== -1; }).slice(0, MAX_PICKS);
} catch (e) { picks = []; }
const pickColors = {};
function colorFor(key) {
  if (!pickColors[key]) {
    const used = picks.map(function (k) { return pickColors[k]; });
    pickColors[key] = SERIES_COLORS.find(function (c) { return used.indexOf(c) === -1; }) || SERIES_COLORS[0];
  }
  return pickColors[key];
}
picks.forEach(colorFor);
function savePicks() { try { localStorage.setItem('statsPicks', JSON.stringify(picks)); } catch (e) {} }

function pageKey(p) {
  return p.site + '|' + p.path;
}

// Every subdomain now redirects into mes.fm/<slug>, so "mes.fm" is the
// overwhelming default -- a dedicated Site column on Most Viewed Pages
// would be blank repetition. The rare non-mes.fm row (e.g.
// youtubemoney.mes.fm, a separate site, not one of the consolidated
// subdomains) still needs disambiguating, so its domain is prefixed
// right into the page label instead of getting its own column. Used for
// both display and the "Page" sort key so the two never disagree.
function pageLabel(p) {
  return p.site === 'mes.fm' ? p.path : (p.site + p.path);
}

function isTextSortKey(key) {
  return key === 'path' || key === 'device' || key === 'source';
}

function toggleSort(state, key) {
  if (state.key === key) {
    state.dir = state.dir === 'desc' ? 'asc' : 'desc';
  } else {
    state.key = key;
    state.dir = isTextSortKey(key) ? 'asc' : 'desc';
  }
}

// Reads a per-device or per-source view count off a row -- the two
// breakdowns live in separate objects but their category names never
// collide (desktop/mobile/... vs direct/google/...), so one lookup
// covers both.
function breakdownValue(row, key) {
  return (row.deviceViews && row.deviceViews[key]) || (row.sourceViews && row.sourceViews[key]) || 0;
}

function compareRows(a, b, key) {
  if (key === 'views') return a.views - b.views;
  if (key === 'path') return pageLabel(a).localeCompare(pageLabel(b));
  if (key === 'device') return (DEVICE_LABELS[a.device] || a.device || '').localeCompare(DEVICE_LABELS[b.device] || b.device || '');
  if (key === 'source') return (SOURCE_LABELS[a.source] || a.source || '').localeCompare(SOURCE_LABELS[b.source] || b.source || '');
  // Anything else is a per-device or per-source view-count column.
  return breakdownValue(a, key) - breakdownValue(b, key);
}

function sortRows(rows, state) {
  const sign = state.dir === 'desc' ? -1 : 1;
  return rows.slice().sort(function (a, b) { return sign * compareRows(a, b, state.key); });
}

function sortArrow(state, key) {
  if (state.key !== key) return '';
  return state.dir === 'desc' ? ' ▼' : ' ▲';
}

function thCell(label, key, state, extraClass) {
  const classes = ['sortable'];
  if (extraClass) classes.push(extraClass);
  const isActive = state.key === key;
  if (isActive) classes.push('active-sort');
  const ariaSort = isActive ? (state.dir === 'desc' ? 'descending' : 'ascending') : 'none';
  return '<th class="' + classes.join(' ') + '" data-sort-key="' + key + '" aria-sort="' + ariaSort + '">' +
    escapeHtml(label) + sortArrow(state, key) + '</th>';
}

function setActiveTab() {
  document.querySelectorAll('.range-tab').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.range === currentRange);
  });
}

// Only show a device/source column if at least one displayed row
// actually has views from it -- keeps the table from filling up with
// all-zero TV/Bot/Referral columns before that kind of traffic has
// shown up.
function visibleDevices(rows, devices) {
  return (devices || DEFAULT_DEVICES).filter(function (d) {
    return rows.some(function (r) { return r.deviceViews && r.deviceViews[d] > 0; });
  });
}

function visibleSources(rows, sources) {
  return (sources || DEFAULT_SOURCES).filter(function (s) {
    return rows.some(function (r) { return r.sourceViews && r.sourceViews[s] > 0; });
  });
}

function breakdownCell(row, key) {
  return '<td class="views">' + breakdownValue(row, key).toLocaleString() + '</td>';
}

function matrixValue(matrix, device, source) {
  return (matrix && matrix[device] && matrix[device][source]) || 0;
}

// The full device x source cross-tab for one page, e.g. exactly "100
// desktop which is 90 direct, 0 internal, 1 google, ..." -- flattening
// this into columns on the main table would mean 6 devices x 6 sources
// = 36 columns per page, which is unreadable, so it lives in a small
// per-page table instead, opened on demand. Device rows are limited to
// ones with any traffic on this page; source columns always show all of
// them (including zeros) since the whole point is seeing the split.
function renderMatrixDetail(p) {
  const matrix = p.deviceSourceMatrix;
  const rowDevices = DEFAULT_DEVICES.filter(function (d) {
    return DEFAULT_SOURCES.some(function (s) { return matrixValue(matrix, d, s) > 0; });
  });

  if (!rowDevices.length) {
    return '<div class="matrix-wrap"><em>No device/source breakdown recorded for this page yet.</em></div>';
  }

  const headCells = '<th></th>' + DEFAULT_SOURCES.map(function (s) {
    return '<th>' + escapeHtml(SOURCE_LABELS[s] || s) + '</th>';
  }).join('') + '<th>Total</th>';

  const bodyRows = rowDevices.map(function (d) {
    const cells = DEFAULT_SOURCES.map(function (s) {
      return '<td>' + matrixValue(matrix, d, s).toLocaleString() + '</td>';
    }).join('');
    const rowTotal = DEFAULT_SOURCES.reduce(function (sum, s) { return sum + matrixValue(matrix, d, s); }, 0);
    return '<tr><td>' + escapeHtml(DEVICE_LABELS[d] || d) + '</td>' + cells + '<td>' + rowTotal.toLocaleString() + '</td></tr>';
  }).join('');

  const footCells = DEFAULT_SOURCES.map(function (s) {
    const colTotal = rowDevices.reduce(function (sum, d) { return sum + matrixValue(matrix, d, s); }, 0);
    return '<td>' + colTotal.toLocaleString() + '</td>';
  }).join('');
  const grandTotal = rowDevices.reduce(function (sum, d) {
    return sum + DEFAULT_SOURCES.reduce(function (s2, s) { return s2 + matrixValue(matrix, d, s); }, 0);
  }, 0);

  return '<div class="matrix-wrap"><table class="matrix-table">' +
    '<thead><tr>' + headCells + '</tr></thead>' +
    '<tbody>' + bodyRows + '</tbody>' +
    '<tfoot><tr><td>Total</td>' + footCells + '<td>' + grandTotal.toLocaleString() + '</td></tr></tfoot>' +
    '</table></div>';
}

// --- Draggable Page column ---------------------------------------------------------------------------------------------
// A handle on the Page header's right edge resizes the frozen Page column (mouse, touch and pen via Pointer Events; arrow
// keys when focused; double-click / double-tap resets). The width lives in the --page-col-w CSS variable on the table,
// which the .page-w-set rules in the page CSS turn into the column width and the path-ellipsis cap, and is remembered in
// localStorage. The header row is rebuilt on every render, so the handle is re-attached each time; the table itself
// (and so the width) persists.
const PAGE_COL_KEY = 'statsPageColW';
const PAGE_COL_MIN = 90;
let pageColRestored = false;
let lastHandleTap = 0;

function setPageColWidth(px, save) {
  const table = document.getElementById('topPagesHead').closest('table');
  if (px == null) {
    table.classList.remove('page-w-set');
    table.style.removeProperty('--page-col-w');
    if (save) { try { localStorage.removeItem(PAGE_COL_KEY); } catch (e) { /* private mode */ } }
    return null;
  }
  const max = Math.max(PAGE_COL_MIN + 40, table.parentElement.clientWidth - 160);
  const w = Math.round(Math.min(max, Math.max(PAGE_COL_MIN, px)));
  table.style.setProperty('--page-col-w', w + 'px');
  table.classList.add('page-w-set');
  if (save) { try { localStorage.setItem(PAGE_COL_KEY, String(w)); } catch (e) { /* private mode */ } }
  return w;
}

function attachPageColResizer() {
  const th = document.querySelector('#topPagesHead th.sticky-left');
  if (!th) return;
  if (!pageColRestored) {
    pageColRestored = true;
    try {
      const saved = parseInt(localStorage.getItem(PAGE_COL_KEY), 10);
      if (saved > 0) setPageColWidth(saved, false);
    } catch (e) { /* private mode */ }
  }
  const handle = document.createElement('span');
  handle.className = 'col-resizer';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize the Page column (double-click to reset)');
  handle.title = 'Drag to resize the Page column. Double-click to reset.';
  th.appendChild(handle);

  // a drag ends in a click on the handle; without this it would bubble to the header's sort handler
  handle.addEventListener('click', function (e) { e.stopPropagation(); });
  handle.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    setPageColWidth(th.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 16 : -16), true);
  });
  handle.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    document.body.classList.add('col-resizing');
    handle.classList.add('dragging');
    function move(ev) { setPageColWidth(startW + ev.clientX - startX, false); }
    function up(ev) {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      try { handle.releasePointerCapture(ev.pointerId); } catch (err) { /* already released */ }
      document.body.classList.remove('col-resizing');
      handle.classList.remove('dragging');
      if (Math.abs(ev.clientX - startX) < 4) {  // a tap, not a drag: two quick taps reset (works for mouse and touch)
        const now = Date.now();
        if (now - lastHandleTap < 400) { lastHandleTap = 0; setPageColWidth(null, true); return; }
        lastHandleTap = now;
        return;
      }
      setPageColWidth(th.getBoundingClientRect().width, true);
    }
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

function renderTopPages() {
  const topPagesHead = document.getElementById('topPagesHead');
  const topPagesBody = document.getElementById('topPagesBody');
  const topPagesFoot = document.getElementById('topPagesFoot');
  if (!topPagesData.length) {
    topPagesHead.innerHTML = '<tr>' + thCell('Page', 'path', pagesSort, 'sticky-col sticky-left') + thCell('Views', 'views', pagesSort, 'views sticky-col sticky-right') + '</tr>';
    attachPageColResizer();
    topPagesBody.innerHTML = '<tr><td colspan="99" class="empty-state">No data for the past ' + RANGE_LABELS[currentRange] + '.</td></tr>';
    topPagesFoot.innerHTML = '';
    showMoreBtn.style.display = 'none';
    return;
  }

  const devices = topPagesDevices;
  const sources = topPagesSources;
  const sorted = sortRows(topPagesData, pagesSort);
  const visible = showAllPages ? sorted : sorted.slice(0, PAGES_PREVIEW_COUNT);
  const breakdownKeys = devices.concat(sources);

  // Page and Views are frozen at either edge (position: sticky) so both
  // stay visible while scrolling through the device/source columns in
  // between -- helps on any screen width, not just wide desktops.
  topPagesHead.innerHTML = '<tr>' + thCell('Page', 'path', pagesSort, 'sticky-col sticky-left') +
    breakdownKeys.map(function (k) { return thCell(DEVICE_LABELS[k] || SOURCE_LABELS[k] || k, k, pagesSort, 'views'); }).join('') +
    thCell('Views', 'views', pagesSort, 'views sticky-col sticky-right') + '</tr>';
  attachPageColResizer();

  topPagesBody.innerHTML = visible.map(function (p) {
    const url = 'https://' + p.site + p.path;
    const label = pageLabel(p);
    const key = pageKey(p);
    const isExpanded = expandedPages.has(key);
    const toggle = '<button type="button" class="expand-toggle" data-page-key="' + escapeHtml(key) + '" aria-expanded="' + isExpanded + '" title="Show device × source breakdown">' + (isExpanded ? '▾' : '▸') + '</button>';
    const picked = picks.indexOf(key) !== -1;
    const pick = '<input type="checkbox" class="pg-pick" data-page-key="' + escapeHtml(key) + '" title="Show in chart" aria-label="Show ' + escapeHtml(label) + ' in chart"' +
      (picked ? ' checked style="accent-color:' + colorFor(key) + '"' : (picks.length >= MAX_PICKS ? ' disabled' : '')) + '>';
    const row = '<tr><td class="page-cell sticky-col sticky-left">' + pick + toggle + '<a href="' + escapeHtml(url) + '" title="' + escapeHtml(label) + '" target="_blank" rel="noopener"><span class="page-path">' + escapeHtml(label) + '</span></a></td>' +
      breakdownKeys.map(function (k) { return breakdownCell(p, k); }).join('') +
      '<td class="views sticky-col sticky-right">' + p.views.toLocaleString() + '</td></tr>';
    if (!isExpanded) return row;
    return row + '<tr class="detail-row"><td colspan="99">' + renderMatrixDetail(p) + '</td></tr>';
  }).join('');

  // Totals reflect the full top-N dataset (not just the "Show N" preview
  // slice), same as Views by Device/Source -- but unlike those tables
  // this ISN'T every page ever viewed, just the leaderboard's top N, so
  // the label says so rather than implying a true grand total.
  const totalViews = topPagesData.reduce(function (sum, p) { return sum + p.views; }, 0);
  const breakdownTotals = breakdownKeys.map(function (k) {
    const sum = topPagesData.reduce(function (acc, p) { return acc + breakdownValue(p, k); }, 0);
    return '<td class="views">' + sum.toLocaleString() + '</td>';
  }).join('');
  topPagesFoot.innerHTML = '<tr><td class="sticky-col sticky-left">Total (top ' + topPagesData.length + ')</td>' + breakdownTotals + '<td class="views sticky-col sticky-right">' + totalViews.toLocaleString() + '</td></tr>';

  if (topPagesData.length > PAGES_PREVIEW_COUNT) {
    showMoreBtn.style.display = 'block';
    showMoreBtn.textContent = showAllPages ? 'Show top ' + PAGES_PREVIEW_COUNT : 'Show all (' + topPagesData.length + ')';
  } else {
    showMoreBtn.style.display = 'none';
  }
}

const DEVICE_COLORS = { desktop: '#2f80ed', mobile: '#27ae60', tablet: '#f2994a', tv: '#9b51e0', bot: '#8e99a8', unknown: '#c4c9d1' };
const SOURCE_COLORS = { direct: '#2f80ed', internal: '#8e99a8', google: '#eb5757', search: '#f2994a', social: '#9b51e0', referral: '#27ae60' };

function compactNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString();
}
function pctText(v, total) {
  if (!total) return '0%';
  const p = v / total * 100;
  return (p >= 10 || p === 0 ? p.toFixed(0) : p.toFixed(1)) + '%';
}

// Donut of the same rows the table shows (circumference 100, so a slice's
// dash length is its percentage), with the total in the middle.
function donutSvg(rows, total, colors, labels, keyName) {
  let offset = 0;
  const segs = rows.filter(function (r) { return r.views > 0; }).map(function (r) {
    const frac = r.views / total * 100;
    const key = r[keyName];
    const seg = '<circle class="dn-seg" cx="21" cy="21" r="15.9155" fill="none" stroke="' + (colors[key] || '#c4c9d1') + '" stroke-width="6" stroke-dasharray="' + Math.max(frac - (rows.length > 1 ? 0.35 : 0), 0.05) + ' ' + (100 - frac) + '" stroke-dashoffset="' + (-offset) + '"><title>' + escapeHtml(String(labels[key] || key).replace(/<[^>]*>/g, '')) + ': ' + r.views.toLocaleString() + ' (' + pctText(r.views, total) + ')</title></circle>';
    offset += frac;
    return seg;
  }).join('');
  return '<svg viewBox="0 0 42 42" role="img" aria-label="Share of views"><g transform="rotate(-90 21 21)">' + segs + '</g>' +
    '<text class="dn-total" x="21" y="21.6" text-anchor="middle">' + compactNum(total) + '</text>' +
    '<text class="dn-sub" x="21" y="26.4" text-anchor="middle">views</text></svg>';
}

function renderBreakdown(cfg) {
  const head = document.getElementById(cfg.id + 'Head');
  const body = document.getElementById(cfg.id + 'Body');
  const foot = document.getElementById(cfg.id + 'Foot');
  const donut = document.getElementById(cfg.id + 'Donut');
  const headHtml = '<tr>' + thCell(cfg.title, cfg.keyName, cfg.sort) + thCell('Views', 'views', cfg.sort, 'views') + '<th class="views share-h">Share</th></tr>';
  head.innerHTML = headHtml;
  if (!cfg.data.length) {
    body.innerHTML = '<tr><td colspan="99" class="empty-state">No data for the past ' + RANGE_LABELS[currentRange] + '.</td></tr>';
    foot.innerHTML = '';
    donut.innerHTML = '';
    return;
  }
  const sorted = sortRows(cfg.data, cfg.sort);
  if (cfg.extra && cfg.extra.views > 0) sorted.push(cfg.extra); // always last, whatever the sort
  const total = sorted.reduce(function (sum, r) { return sum + r.views; }, 0);
  body.innerHTML = sorted.map(function (r) {
    const key = r[cfg.keyName];
    const color = cfg.colors[key] || '#c4c9d1';
    const share = total ? r.views / total * 100 : 0;
    return '<tr><td><span class="dot" style="background:' + color + '"></span>' + (cfg.labels[key] || escapeHtml(key)) + '</td>' +
      '<td class="views">' + r.views.toLocaleString() + '</td>' +
      '<td class="views share"><span class="share-bar"><i style="width:' + share.toFixed(1) + '%;background:' + color + '"></i></span>' + pctText(r.views, total) + '</td></tr>';
  }).join('');
  foot.innerHTML = '<tr><td>Total</td><td class="views">' + total.toLocaleString() + '</td><td class="views share">100%</td></tr>';
  donut.innerHTML = donutSvg(sorted, total, cfg.colors, cfg.labels, cfg.keyName);
}

function renderDeviceTotals() {
  renderBreakdown({ id: 'deviceTotals', title: 'Device', keyName: 'device', data: deviceTotalsData, sort: deviceSort, labels: DEVICE_LABELS, colors: DEVICE_COLORS });
}

// Source tracking began a week after device tracking (2026-08-27 vs 09-03),
// so the 365d / all-time device total is larger. Show that gap as its own
// row so the two tables add up to the same number.
function renderSourceTotals() {
  const deviceSum = deviceTotalsData.reduce(function (sum, d) { return sum + d.views; }, 0);
  const sourceSum = sourceTotalsData.reduce(function (sum, d) { return sum + d.views; }, 0);
  const labels = Object.assign({}, SOURCE_LABELS, { unrecorded: '<span title="Views from before traffic-source tracking started (Sep 3, 2026)">Not recorded</span>' });
  const colors = Object.assign({}, SOURCE_COLORS, { unrecorded: '#d5d9de' });
  renderBreakdown({ id: 'sourceTotals', title: 'Source', keyName: 'source', data: sourceTotalsData, sort: sourceSort, labels: labels, colors: colors,
    extra: { source: 'unrecorded', views: sourceTotalsData.length ? deviceSum - sourceSum : 0 } });
}

showMoreBtn.addEventListener('click', function () {
  showAllPages = !showAllPages;
  renderTopPages();
});

document.getElementById('topPagesHead').addEventListener('click', function (e) {
  const th = e.target.closest('th[data-sort-key]');
  if (!th) return;
  toggleSort(pagesSort, th.dataset.sortKey);
  renderTopPages();
});

document.getElementById('topPagesBody').addEventListener('click', function (e) {
  const btn = e.target.closest('.expand-toggle');
  if (!btn) return;
  const key = btn.dataset.pageKey;
  if (expandedPages.has(key)) {
    expandedPages.delete(key);
  } else {
    expandedPages.add(key);
  }
  renderTopPages();
});

document.getElementById('deviceTotalsHead').addEventListener('click', function (e) {
  const th = e.target.closest('th[data-sort-key]');
  if (!th) return;
  toggleSort(deviceSort, th.dataset.sortKey);
  renderDeviceTotals();
});

document.getElementById('sourceTotalsHead').addEventListener('click', function (e) {
  const th = e.target.closest('th[data-sort-key]');
  if (!th) return;
  toggleSort(sourceSort, th.dataset.sortKey);
  renderSourceTotals();
});

async function loadStats() {
  setActiveTab();
  document.getElementById('topPagesBody').innerHTML = '<tr><td colspan="99" class="empty-state">Loading&hellip;</td></tr>';
  document.getElementById('topPagesFoot').innerHTML = '';
  showMoreBtn.style.display = 'none';
  document.getElementById('deviceTotalsBody').innerHTML = '<tr><td colspan="99" class="empty-state">Loading&hellip;</td></tr>';
  document.getElementById('deviceTotalsFoot').innerHTML = '';
  document.getElementById('sourceTotalsBody').innerHTML = '<tr><td colspan="99" class="empty-state">Loading&hellip;</td></tr>';
  document.getElementById('sourceTotalsFoot').innerHTML = '';
  document.getElementById('updatedAt').textContent = 'Loading stats…';

  try {
    const res = await fetch('/api/stats?range=' + encodeURIComponent(currentRange));
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    const devices = data.devices && data.devices.length ? data.devices : DEFAULT_DEVICES;
    const sources = data.sources && data.sources.length ? data.sources : DEFAULT_SOURCES;

    topPagesData = data.topPages || [];
    topPagesDevices = visibleDevices(topPagesData, devices);
    topPagesSources = visibleSources(topPagesData, sources);
    showAllPages = false;
    renderTopPages();

    deviceTotalsData = data.deviceTotals || [];
    renderDeviceTotals();

    sourceTotalsData = data.sourceTotals || [];
    renderSourceTotals();

    document.getElementById('updatedAt').textContent = 'Last updated: ' + new Date(data.updatedAt).toLocaleString();
  } catch (e) {
    document.getElementById('updatedAt').textContent = 'Stats are temporarily unavailable.';
  }
}

document.getElementById('rangeTabs').addEventListener('click', function (e) {
  const btn = e.target.closest('.range-tab');
  if (!btn || btn.dataset.range === currentRange) return;
  currentRange = btn.dataset.range;
  try { localStorage.setItem('statsRange', currentRange); } catch (e) {}
  loadStats();
  loadTimeSeries();
});

loadStats();

// ---- Views Over Time: follows the same range tabs as the tables above
// (24h/7d/30d/365d/all), via /api/stats-series?range=... -- 24h gets
// hourly points from that endpoint, everything else daily. ----

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Manual Y-M-D(-HH) split rather than `new Date(key)` -- sidesteps the
// UTC-parse/local-format shift entirely instead of fighting it with
// getUTC* accessors everywhere a key gets displayed. Handles both an
// hourly key ("2026-09-16T14") and a daily one ("2026-09-16").
function fmtPoint(key) {
  const p = key.split('-');
  const label = MONTHS[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10);
  if (p[2].indexOf('T') === -1) return label;
  const hh = parseInt(p[2].split('T')[1], 10);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return h12 + (hh < 12 ? 'am' : 'pm');
}
function fmtDate(iso) {
  const p = iso.split('-');
  return MONTHS[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10);
}
function mondayOf(iso) {
  const p = iso.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  const dow = d.getUTCDay(); // 0 = Sun
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}
function addDaysIso(iso, n) {
  const p = iso.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Same tick-picking logic as the sortable tables' bar-chart cousin on
// the mes.fm/stats snapshot artifact this page's daily/weekly chart was
// prototyped in -- walks up in whole steps until the top tick is >= max,
// so a value at the max is never scaled past 100% and drawn over its
// own label.
function niceTicks(max, targetCount) {
  const raw = max / (targetCount || 5);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3.5) step = 2 * mag;
  else if (norm < 7.5) step = 5 * mag;
  else step = 10 * mag;
  const ticks = [];
  let v = 0;
  while (v < max) { ticks.push(v); v += step; }
  ticks.push(Math.round(v));
  return ticks;
}

// series: [{ id, label, color, kind: 'total' | 'page', points: [{key, views, tipLabel?, partialLabel?}] }]
// (all series share the same keys). mode: 'lines' | 'stacked' (Combined is
// just one summed series fed in as 'lines').
const CH = { W: 640, H: 220, left: 34, right: 6, top: 10, bottom: 26 };
let tsCur = null; // what the hover handler reads

function renderLineChart(svg, ptsEl, series, mode) {
  const W = CH.W, H = CH.H, left = CH.left, right = CH.right, top = CH.top, bottom = CH.bottom;
  const innerW = W - left - right, innerH = H - top - bottom;
  const base = series[0].points;
  const n = base.length;
  const stacked = mode === 'stacked' && series.filter(function (x) { return x.kind === 'page'; }).length > 1;
  const stackSeries = series.filter(function (x) { return x.kind === 'page'; });

  let maxV = 0;
  series.forEach(function (x) { x.points.forEach(function (d) { if (d.views > maxV) maxV = d.views; }); });
  if (stacked) {
    for (let i = 0; i < n; i++) {
      const sum = stackSeries.reduce(function (acc, x) { return acc + x.points[i].views; }, 0);
      if (sum > maxV) maxV = sum;
    }
  }
  const ticks = niceTicks(maxV, 4);
  const topMax = ticks[ticks.length - 1] || 1;

  function xAt(i) { return left + (n === 1 ? 0 : (i / (n - 1)) * innerW); }
  function yAt(v) { return top + innerH - (v / topMax) * innerH; }

  const parts = ['<g>'];
  ticks.forEach(function (t) {
    const y = yAt(t);
    parts.push('<line class="ts-gridline" x1="' + left + '" x2="' + (W - right) + '" y1="' + y + '" y2="' + y + '"/>');
    parts.push('<text class="ts-axis-label" x="' + (left - 6) + '" y="' + (y + 2.5) + '" text-anchor="end">' + t.toLocaleString() + '</text>');
  });
  const xStep = Math.max(1, Math.ceil(n / 6));
  base.forEach(function (d, i) {
    if (i % xStep !== 0 && i !== n - 1) return;
    parts.push('<text class="ts-axis-label" x="' + xAt(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + fmtPoint(d.key) + '</text>');
  });

  function lineParts(x, withArea) {
    const pts = x.points.map(function (d, i) { return xAt(i) + ',' + yAt(d.views); });
    const style = ' style="stroke:' + x.color + '"';
    if (withArea) {
      parts.push('<path class="ts-area" style="fill:' + x.color + '" d="M' + xAt(0) + ',' + (H - bottom) + ' L' + pts.join(' L') + ' L' + xAt(n - 1) + ',' + (H - bottom) + ' Z"/>');
    }
    if (n > 2) parts.push('<path class="ts-line"' + style + ' d="M' + pts.slice(0, -1).join(' L') + '"/>');
    parts.push('<path class="ts-line partial"' + style + ' d="M' + pts.slice(-2).join(' L') + '"/>');
    parts.push('<circle class="ts-dot partial" style="stroke:' + x.color + '" cx="' + xAt(n - 1) + '" cy="' + yAt(x.points[n - 1].views) + '" r="3.5"/>');
  }

  if (stacked) {
    const cum = new Array(n).fill(0);
    stackSeries.forEach(function (x) {
      const lower = cum.slice();
      for (let i = 0; i < n; i++) cum[i] += x.points[i].views;
      const upper = cum.map(function (v, i) { return xAt(i) + ',' + yAt(v); });
      const back = lower.map(function (v, i) { return xAt(i) + ',' + yAt(v); }).reverse();
      parts.push('<path d="M' + upper.join(' L') + ' L' + back.join(' L') + ' Z" style="fill:' + x.color + ';opacity:0.55"/>');
      parts.push('<path class="ts-line" style="stroke:' + x.color + ';stroke-width:1.2" d="M' + upper.join(' L') + '"/>');
    });
    series.filter(function (x) { return x.kind === 'total'; }).forEach(function (x) { lineParts(x, false); });
  } else {
    series.forEach(function (x) { lineParts(x, series.length === 1); });
  }
  parts.push('</g>');
  svg.innerHTML = parts.join('');

  // One crosshair + shared tooltip for every series (pointer-driven, so it
  // works the same for 24 hourly points or 365 daily ones, and on touch).
  ptsEl.innerHTML = '<div class="ts-cross"></div><div class="ts-tip2"></div>';
  tsCur = { n: n, xAt: xAt, series: series, stacked: stacked, W: W, left: left, innerW: innerW, cross: ptsEl.firstChild, tip: ptsEl.lastChild };
}

function showTsHover(clientX) {
  const c = tsCur;
  if (!c) return;
  const rect = document.getElementById('tsChart').getBoundingClientRect();
  const vx = (clientX - rect.left) / rect.width * c.W;
  let i = c.n === 1 ? 0 : Math.round((vx - c.left) / c.innerW * (c.n - 1));
  i = Math.max(0, Math.min(c.n - 1, i));
  const pct = c.xAt(i) / c.W * 100;
  c.cross.style.display = 'block';
  c.cross.style.left = pct + '%';
  const d = c.series[0].points[i];
  let html = '<strong>' + escapeHtml(d.tipLabel || fmtPoint(d.key)) + '</strong>' + (d.partialLabel ? escapeHtml(d.partialLabel) : (i === c.n - 1 ? ' (partial, so far)' : ''));
  c.series.forEach(function (x) {
    html += '<br><i style="background:' + x.color + '"></i>' + x.points[i].views.toLocaleString() + ' &middot; ' + escapeHtml(x.label);
  });
  c.tip.innerHTML = html;
  c.tip.style.display = 'block';
  c.tip.style.top = '4px';
  if (pct > 55) { c.tip.style.left = ''; c.tip.style.right = (100 - pct) + '%'; c.tip.style.marginRight = '10px'; c.tip.style.marginLeft = ''; }
  else { c.tip.style.right = ''; c.tip.style.left = pct + '%'; c.tip.style.marginLeft = '10px'; c.tip.style.marginRight = ''; }
}
(function () {
  const wrap = document.getElementById('tsChart');
  wrap.addEventListener('pointermove', function (e) { showTsHover(e.clientX); });
  wrap.addEventListener('pointerdown', function (e) { showTsHover(e.clientX); });
  wrap.addEventListener('pointerleave', function () {
    if (!tsCur) return;
    tsCur.cross.style.display = 'none';
    tsCur.tip.style.display = 'none';
  });
})();

// Weekly is the same line chart as daily/hourly, just fed pre-aggregated
// points instead of raw ones -- a trend is a trend regardless of bucket
// size, and reusing renderLineChart means one chart implementation
// instead of two. Monday-start weeks, summed from whatever daily points
// were already fetched (no separate endpoint for a sum-of-sums).
function buildWeeklyPoints(data) {
  const buckets = {};
  const order = [];
  data.forEach(function (d) {
    const wk = mondayOf(d.key);
    if (!buckets[wk]) { buckets[wk] = { start: wk, views: 0, days: 0 }; order.push(wk); }
    buckets[wk].views += d.views;
    buckets[wk].days += 1;
  });
  return order.map(function (k) {
    const w = buckets[k];
    const endIso = addDaysIso(w.start, 6);
    const partial = w.days < 7;
    return {
      key: w.start,
      views: w.views,
      tipLabel: fmtDate(w.start) + '–' + fmtDate(endIso),
      partialLabel: partial ? ' (partial, ' + w.days + '/7 days tracked)' : ''
    };
  });
}

const tsNoteEl = document.getElementById('tsNote');
const tsSvgEl = document.getElementById('tsSvg');
const tsPtsEl = document.getElementById('tsPts');
const tsLegendEl = document.getElementById('tsLegend');
const tsBtnDaily = document.querySelector('#tsToggle [data-ts="daily"]');
const tsBtnWeekly = document.querySelector('#tsToggle [data-ts="weekly"]');
let tsRawPoints = []; // whatever was fetched: hourly or daily
let tsMode = 'daily';
let tsUnit = 'daily';
let showTotal = true; // Total stays on when pages are ticked; its legend chip hides it
let chartMode = 'lines'; // lines | stacked | combined
let tsToken = 0;
// range -> { "site|path": { bucketKey: views } }; only pages not already
// here are requested, so ticking/unticking and switching Daily/Weekly cost nothing.
const pageSeriesCache = {};

function pickLabel(key) {
  const i = key.indexOf('|');
  const site = key.slice(0, i), path = key.slice(i + 1);
  return site === 'mes.fm' ? path : site + path;
}

function buildSeries(mode) {
  const out = [];
  const agg = function (pts) { return mode === 'weekly' ? buildWeeklyPoints(pts) : pts; };
  const cache = pageSeriesCache[currentRange] || {};
  const pagePts = picks.filter(function (k) { return cache[k]; }).map(function (k) {
    return { id: k, key: k, kind: 'page', label: pickLabel(k), color: colorFor(k),
      points: agg(tsRawPoints.map(function (p) { return { key: p.key, views: cache[k][p.key] || 0 }; })) };
  });
  if (showTotal || !pagePts.length) {
    out.push({ id: 'total', kind: 'total', label: 'Total', color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2272c3', points: agg(tsRawPoints) });
  }
  if (chartMode === 'combined' && pagePts.length > 1) {
    out.push({ id: 'sel', kind: 'page', label: 'Selected pages (' + pagePts.length + ')', color: SERIES_COLORS[0],
      points: pagePts[0].points.map(function (d, i) {
        return { key: d.key, tipLabel: d.tipLabel, partialLabel: d.partialLabel, views: pagePts.reduce(function (acc, x) { return acc + x.points[i].views; }, 0) };
      }) });
  } else {
    pagePts.forEach(function (x) { out.push(x); });
  }
  return out;
}

function renderLegend() {
  if (!picks.length) { tsLegendEl.hidden = true; tsLegendEl.innerHTML = ''; return; }
  tsLegendEl.hidden = false;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2272c3';
  let html = '<button type="button" class="ts-chip' + (showTotal ? '' : ' off') + '" data-total="1" title="Show / hide the site total"><i style="background:' + accent + '"></i><span>Total</span></button>';
  picks.forEach(function (k) {
    html += '<button type="button" class="ts-chip" data-remove="' + escapeHtml(k) + '" title="Remove from chart"><i style="background:' + colorFor(k) + '"></i><span>' + escapeHtml(pickLabel(k)) + '</span><b>&times;</b></button>';
  });
  html += '<button type="button" class="ts-clear" data-clear="1">Clear</button><span class="ts-sep"></span>';
  if (picks.length > 1) {
    html += '<div class="ts-toggle" id="tsCm">' + [['lines', 'Lines'], ['stacked', 'Stacked'], ['combined', 'Combined']].map(function (m) {
      return '<button type="button" class="ts-toggle-btn' + (chartMode === m[0] ? ' active' : '') + '" data-cm="' + m[0] + '">' + m[1] + '</button>';
    }).join('') + '</div>';
  }
  tsLegendEl.innerHTML = html;
}

// Weekly reuses the exact same line chart as daily/hourly, just fed
// buildWeeklyPoints(...) instead -- no refetch, just a
// re-aggregate-and-redraw of what's already in hand.
function renderTsChart() {
  const mode = tsUnit === 'hourly' ? 'daily' : tsMode; // no weekly view for a single day
  tsBtnDaily.classList.toggle('active', mode === 'daily');
  tsBtnWeekly.classList.toggle('active', mode === 'weekly');
  if (!tsRawPoints.length) return;
  renderLegend();
  renderLineChart(tsSvgEl, tsPtsEl, buildSeries(mode), chartMode);

  const rangeDesc = currentRange === 'all' ? 'all tracked history' : ('the past ' + RANGE_LABELS[currentRange]);
  let note;
  if (mode === 'weekly') {
    note = 'Monday-start weeks, summed from ' + rangeDesc + '. The first and most recent week are marked partial where fewer than 7 tracked days fall inside them.';
  } else {
    const unitWord = tsUnit === 'hourly' ? 'Hourly' : 'Daily';
    const partialWord = tsUnit === 'hourly' ? 'the current hour' : 'today';
    note = unitWord + ' totals for ' + rangeDesc + '. The dashed segment is ' + partialWord + ', still filling in.';
  }
  if (!picks.length) note += ' Tick the boxes in Most Viewed Pages to chart individual pages.';
  tsNoteEl.textContent = note;
}

// Fetches series for ticked pages not cached for this range yet (one API
// call, one Redis command per time bucket), then redraws.
async function ensurePickSeries() {
  const cache = pageSeriesCache[currentRange] || (pageSeriesCache[currentRange] = {});
  const need = picks.filter(function (k) { return !cache[k]; });
  if (!need.length || !tsRawPoints.length) { renderTsChart(); return; }
  const token = ++tsToken;
  const range = currentRange;
  tsNoteEl.textContent = 'Loading page lines…';
  try {
    const res = await fetch('/api/stats-series?range=' + encodeURIComponent(range) + '&pages=' + encodeURIComponent(need.join(',')));
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    need.forEach(function (k) { pageSeriesCache[range][k] = (data.series && data.series[k]) || {}; });
  } catch (e) {
    if (token === tsToken) tsNoteEl.textContent = 'Page lines are temporarily unavailable.';
    return;
  }
  if (token === tsToken && range === currentRange) renderTsChart();
}

function refreshPickBoxes() {
  document.querySelectorAll('.pg-pick').forEach(function (box) {
    const k = box.dataset.pageKey;
    const on = picks.indexOf(k) !== -1;
    box.checked = on;
    box.style.accentColor = on ? colorFor(k) : '';
    box.disabled = !on && picks.length >= MAX_PICKS;
  });
}

function setPick(key, on) {
  const i = picks.indexOf(key);
  if (on && i === -1 && picks.length < MAX_PICKS) {
    colorFor(key);
    picks.push(key);
  } else if (!on && i !== -1) {
    picks.splice(i, 1);
    delete pickColors[key];
  }
  savePicks();
  refreshPickBoxes();
  ensurePickSeries();
}

document.getElementById('topPagesBody').addEventListener('change', function (e) {
  const box = e.target.closest('.pg-pick');
  if (box) setPick(box.dataset.pageKey, box.checked);
});

tsLegendEl.addEventListener('click', function (e) {
  const chip = e.target.closest('button');
  if (!chip) return;
  if (chip.dataset.total) { showTotal = !showTotal; renderTsChart(); return; }
  if (chip.dataset.remove) { setPick(chip.dataset.remove, false); return; }
  if (chip.dataset.clear) {
    picks.slice().forEach(function (k) { delete pickColors[k]; });
    picks = []; showTotal = true; savePicks(); refreshPickBoxes(); renderTsChart(); return;
  }
  if (chip.dataset.cm) { chartMode = chip.dataset.cm; renderTsChart(); }
});

// A single 24h range has no meaningful "week" to bucket into, so the
// Weekly button is hidden rather than shown-but-empty for it, and the
// Daily button relabels to Hourly since that's what it's actually
// showing then.
document.getElementById('tsToggle').addEventListener('click', function (e) {
  const btn = e.target.closest('.ts-toggle-btn');
  if (!btn || btn.style.display === 'none') return;
  tsMode = btn.dataset.ts;
  renderTsChart();
});

async function loadTimeSeries() {
  tsNoteEl.textContent = 'Loading…';
  try {
    const res = await fetch('/api/stats-series?range=' + encodeURIComponent(currentRange));
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    let points = data.points || [];
    tsUnit = data.unit || 'daily';
    tsBtnDaily.textContent = tsUnit === 'hourly' ? 'Hourly' : 'Daily';
    tsBtnWeekly.style.display = tsUnit === 'hourly' ? 'none' : '';
    tsMode = 'daily'; // reset on every range switch/reload

    // Drop a leading run of true zeros -- points from before
    // device/source tracking (and this series) existed, not a real
    // zero-traffic stretch.
    const firstNonZero = points.findIndex(function (p) { return p.views > 0; });
    if (firstNonZero > 0) points = points.slice(firstNonZero);
    tsRawPoints = points;

    if (!points.length) {
      tsNoteEl.textContent = 'No data yet for ' + RANGE_LABELS[currentRange] + '.';
      return;
    }

    renderTsChart();
    ensurePickSeries();
  } catch (e) {
    tsNoteEl.textContent = 'Views-over-time data is temporarily unavailable.';
  }
}

loadTimeSeries();

// Wide / Theater: widens the whole stats card so the chart and the Most Viewed Pages
// table have more room. One shared state, controlled from either section's buttons
// (both pairs stay in sync). Not persisted.
let statsView = 'default';
const viewBtns = document.querySelectorAll('[data-view-toggle] .view-btn');
function applyStatsView() {
  document.body.classList.toggle('stats-wide', statsView === 'wide');
  document.body.classList.toggle('stats-theater', statsView === 'theater');
  viewBtns.forEach(function (btn) {
    const isActive = btn.dataset.view === statsView;
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.textContent = isActive ? 'Default view' : (btn.dataset.view === 'wide' ? 'Wide view' : 'Theater view');
  });
}
viewBtns.forEach(function (btn) {
  btn.addEventListener('click', function () {
    statsView = statsView === btn.dataset.view ? 'default' : btn.dataset.view;
    applyStatsView();
  });
});
