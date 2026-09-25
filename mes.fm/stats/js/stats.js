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

function renderTopPages() {
  const topPagesHead = document.getElementById('topPagesHead');
  const topPagesBody = document.getElementById('topPagesBody');
  const topPagesFoot = document.getElementById('topPagesFoot');
  if (!topPagesData.length) {
    topPagesHead.innerHTML = '<tr>' + thCell('Page', 'path', pagesSort, 'sticky-col sticky-left') + thCell('Views', 'views', pagesSort, 'views sticky-col sticky-right') + '</tr>';
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

  topPagesBody.innerHTML = visible.map(function (p) {
    const url = 'https://' + p.site + p.path;
    const label = pageLabel(p);
    const key = pageKey(p);
    const isExpanded = expandedPages.has(key);
    const toggle = '<button type="button" class="expand-toggle" data-page-key="' + escapeHtml(key) + '" aria-expanded="' + isExpanded + '" title="Show device × source breakdown">' + (isExpanded ? '▾' : '▸') + '</button>';
    const row = '<tr><td class="page-cell sticky-col sticky-left">' + toggle + '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener"><span class="page-path">' + escapeHtml(label) + '</span></a></td>' +
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

function renderDeviceTotals() {
  const deviceTotalsHead = document.getElementById('deviceTotalsHead');
  const deviceTotalsBody = document.getElementById('deviceTotalsBody');
  const deviceTotalsFoot = document.getElementById('deviceTotalsFoot');
  if (!deviceTotalsData.length) {
    deviceTotalsHead.innerHTML = '<tr>' + thCell('Device', 'device', deviceSort) + thCell('Views', 'views', deviceSort, 'views') + '</tr>';
    deviceTotalsBody.innerHTML = '<tr><td colspan="99" class="empty-state">No data for the past ' + RANGE_LABELS[currentRange] + '.</td></tr>';
    deviceTotalsFoot.innerHTML = '';
    return;
  }

  const sorted = sortRows(deviceTotalsData, deviceSort);

  deviceTotalsHead.innerHTML = '<tr>' + thCell('Device', 'device', deviceSort) + thCell('Views', 'views', deviceSort, 'views') + '</tr>';

  deviceTotalsBody.innerHTML = sorted.map(function (d) {
    const label = DEVICE_LABELS[d.device] || escapeHtml(d.device);
    return '<tr><td>' + label + '</td><td class="views">' + d.views.toLocaleString() + '</td></tr>';
  }).join('');

  const totalDeviceViews = deviceTotalsData.reduce(function (sum, d) { return sum + d.views; }, 0);
  deviceTotalsFoot.innerHTML = '<tr><td>Total</td><td class="views">' + totalDeviceViews.toLocaleString() + '</td></tr>';
}

function renderSourceTotals() {
  const sourceTotalsHead = document.getElementById('sourceTotalsHead');
  const sourceTotalsBody = document.getElementById('sourceTotalsBody');
  const sourceTotalsFoot = document.getElementById('sourceTotalsFoot');
  if (!sourceTotalsData.length) {
    sourceTotalsHead.innerHTML = '<tr>' + thCell('Source', 'source', sourceSort) + thCell('Views', 'views', sourceSort, 'views') + '</tr>';
    sourceTotalsBody.innerHTML = '<tr><td colspan="99" class="empty-state">No data for the past ' + RANGE_LABELS[currentRange] + '.</td></tr>';
    sourceTotalsFoot.innerHTML = '';
    return;
  }

  const sorted = sortRows(sourceTotalsData, sourceSort);

  sourceTotalsHead.innerHTML = '<tr>' + thCell('Source', 'source', sourceSort) + thCell('Views', 'views', sourceSort, 'views') + '</tr>';

  sourceTotalsBody.innerHTML = sorted.map(function (s) {
    const label = SOURCE_LABELS[s.source] || escapeHtml(s.source);
    return '<tr><td>' + label + '</td><td class="views">' + s.views.toLocaleString() + '</td></tr>';
  }).join('');

  const totalSourceViews = sourceTotalsData.reduce(function (sum, s) { return sum + s.views; }, 0);
  sourceTotalsFoot.innerHTML = '<tr><td>Total</td><td class="views">' + totalSourceViews.toLocaleString() + '</td></tr>';
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

function renderLineChart(svg, ptsEl, data) {
  const W = 640, H = 220, left = 34, right = 6, top = 10, bottom = 26;
  const innerW = W - left - right, innerH = H - top - bottom;
  const values = data.map(function (d) { return d.views; });
  const ticks = niceTicks(Math.max.apply(null, values), 4);
  const topMax = ticks[ticks.length - 1] || 1;

  function xAt(i) { return left + (data.length === 1 ? 0 : (i / (data.length - 1)) * innerW); }
  function yAt(v) { return top + innerH - (v / topMax) * innerH; }

  const parts = ['<g>'];

  ticks.forEach(function (t) {
    const y = yAt(t);
    parts.push('<line class="ts-gridline" x1="' + left + '" x2="' + (W - right) + '" y1="' + y + '" y2="' + y + '"/>');
    parts.push('<text class="ts-axis-label" x="' + (left - 6) + '" y="' + (y + 2.5) + '" text-anchor="end">' + t.toLocaleString() + '</text>');
  });

  const xStep = Math.max(1, Math.ceil(data.length / 6));
  data.forEach(function (d, i) {
    if (i % xStep !== 0 && i !== data.length - 1) return;
    parts.push('<text class="ts-axis-label" x="' + xAt(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + fmtPoint(d.key) + '</text>');
  });

  const linePts = data.map(function (d, i) { return xAt(i) + ',' + yAt(d.views); });
  const areaPath = 'M' + xAt(0) + ',' + (H - bottom) + ' L' + linePts.join(' L') + ' L' + xAt(data.length - 1) + ',' + (H - bottom) + ' Z';
  parts.push('<path class="ts-area" d="' + areaPath + '"/>');
  if (data.length > 2) {
    parts.push('<path class="ts-line" d="M' + linePts.slice(0, -1).join(' L') + '"/>');
  }
  parts.push('<path class="ts-line partial" d="M' + linePts.slice(-2).join(' L') + '"/>');
  parts.push('<circle class="ts-dot partial" cx="' + xAt(data.length - 1) + '" cy="' + yAt(data[data.length - 1].views) + '" r="4"/>');
  parts.push('</g>');
  svg.innerHTML = parts.join('');

  // Hover/focus hit targets are skipped past ~120 points (365d/all can
  // fetch that many) -- at that density each point is under 5px apart,
  // so a 22px hit circle per point would mostly overlap its neighbors'
  // anyway; the gridlines + line shape carry the story at that zoom.
  ptsEl.innerHTML = '';
  if (data.length > 120) return;
  data.forEach(function (d, i) {
    const isPartial = i === data.length - 1;
    const pt = document.createElement('div');
    pt.className = 'ts-pt';
    pt.style.left = (xAt(i) / W * 100) + '%';
    pt.style.top = (yAt(d.views) / H * 100) + '%';
    pt.tabIndex = 0;
    const tip = document.createElement('div');
    tip.className = 'ts-tip';
    const strong = document.createElement('strong');
    strong.textContent = d.views.toLocaleString() + ' views';
    tip.appendChild(strong);
    tip.appendChild(document.createTextNode(' — ' + (d.tipLabel || fmtPoint(d.key))));
    // d.partialLabel (weekly points) can flag ANY point partial, e.g.
    // the first week if tracking started mid-week -- not just the last.
    // Falls back to the generic label for the one daily/hourly point
    // that's ever partial: the last (current, still-filling-in) one.
    if (d.partialLabel) tip.appendChild(document.createTextNode(d.partialLabel));
    else if (isPartial) tip.appendChild(document.createTextNode(' (partial, so far)'));
    pt.appendChild(tip);
    ptsEl.appendChild(pt);
  });
}

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
const tsBtnDaily = document.querySelector('#tsToggle [data-ts="daily"]');
const tsBtnWeekly = document.querySelector('#tsToggle [data-ts="weekly"]');
let tsRawPoints = []; // whatever was fetched: hourly or daily
let tsMode = 'daily';
let tsUnit = 'daily';

// Weekly reuses the exact same line chart as daily/hourly, just fed
// buildWeeklyPoints(tsRawPoints) instead -- no refetch, just a
// re-aggregate-and-redraw of what's already in hand.
function renderTsChart() {
  const mode = tsUnit === 'hourly' ? 'daily' : tsMode; // no weekly view for a single day
  tsBtnDaily.classList.toggle('active', mode === 'daily');
  tsBtnWeekly.classList.toggle('active', mode === 'weekly');
  const points = mode === 'weekly' ? buildWeeklyPoints(tsRawPoints) : tsRawPoints;
  renderLineChart(tsSvgEl, tsPtsEl, points);

  const rangeDesc = currentRange === 'all' ? 'all tracked history' : ('the past ' + RANGE_LABELS[currentRange]);
  if (mode === 'weekly') {
    tsNoteEl.textContent = 'Monday-start weeks, summed from ' + rangeDesc + '. The first and most recent week are marked partial where fewer than 7 tracked days fall inside them.';
  } else {
    const unitWord = tsUnit === 'hourly' ? 'Hourly' : 'Daily';
    const partialWord = tsUnit === 'hourly' ? 'the current hour' : 'today';
    tsNoteEl.textContent = unitWord + ' totals for ' + rangeDesc + '. The dashed segment is ' + partialWord + ', still filling in.';
  }
}

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
  } catch (e) {
    tsNoteEl.textContent = 'Views-over-time data is temporarily unavailable.';
  }
}

loadTimeSeries();
