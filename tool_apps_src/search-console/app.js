// MES Search Console (private, mes.fm/search-console, behind the middleware.js password like /ads): Google Search Console
// and Bing Webmaster numbers for mes.fm. Data: /api/search-console (see mes.fm/api/search-console.js).
// On 127.0.0.1 / localhost (no /api there) the page answers itself from /search-console/js/sc-mock.js, which runs the
// real aggregation code on made-up data.
(function () {
  'use strict';
  try { localStorage.setItem('mes-owner', '1'); } catch (e) {} // this page is behind the password: /stats and /seo then show the private links
  var LS = function (k, d, re) { var v = d; try { v = localStorage.getItem('mes-gsc:' + k) || d; } catch (e) {} return re && !re.test(v) ? d : v; };
  var SAVE = function (k, v) { try { localStorage.setItem('mes-gsc:' + k, v); } catch (e) {} };
  var RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', '7 days'], ['28', '28 days'], ['90', '90 days'], ['365', '365 days']];
  var RANGE = LS('range', '28', /^(today|yesterday|7|28|90|365)$/);
  var CMP = LS('cmp', '1') === '1';
  var METRICS = LS('metrics', 'c,i', /^(c|i|ctr|p)(,(c|i|ctr|p))*$/).split(',');
  var CSRC = LS('csrc', 'both', /^(google|bing|both)$/);
  var HIDE = LS('hidechart', '0') === '1';
  var TAB = LS('tab', 'queries', /^(queries|pages|countries|devices)$/);
  var TSRC = LS('tsrc', 'google', /^(google|bing)$/);
  var FILTERS = [];
  try { FILTERS = JSON.parse(sessionStorage.getItem('mes-gsc:filters') || '[]'); if (!Array.isArray(FILTERS)) FILTERS = []; } catch (e) { FILTERS = []; }
  var DATA = null, TFILTER = '', NOTE = '', SEL = null;
  // ticked table rows drawn as their own lines in the Day by day chart (like /stats): at most 8, colour = the tick box
  var LCOL = ['#e8710a', '#d01884', '#188038', '#b06000', '#c5221f', '#6d4c41', '#7a7f86', '#00a3a3'];
  var MAXL = 8, LINES = [], LDATA = {}, LERR = '';
  try { LINES = JSON.parse(LS('lines', '[]')); } catch (e) { LINES = []; }
  if (!Array.isArray(LINES)) LINES = [];
  LINES = LINES.filter(function (l) { return l && /^(query|page|country|device)$/.test(l.dim) && typeof l.v === 'string' && typeof l.k === 'string' && typeof l.c === 'string'; }).slice(0, MAXL);
  var HIDETOT = LS('hidetot', '0') === '1';
  var lkey = function (l) { return l.dim + '\u0001' + l.k; };
  var ctxKey = function () { return RANGE + '|' + JSON.stringify(FILTERS); };
  function saveLines() { SAVE('lines', JSON.stringify(LINES)); }
  function freeColor() { var used = LINES.map(function (l) { return l.c; }); return LCOL.filter(function (c) { return used.indexOf(c) === -1; })[0] || LCOL[0]; }
  var MOCK = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; };
  var int = function (v) { return Math.round(v || 0).toLocaleString(); };
  var ctrOf = function (c, i) { return i ? c / i : 0; };
  var pctTxt = function (x) { x *= 100; return (x >= 10 || x === 0 ? x.toFixed(1) : x.toFixed(2)) + '%'; };
  var posTxt = function (p) { return p ? p.toFixed(1) : '–'; };
  var short = function (v) { return v >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'k' : String(Math.round(v)); };
  var addDays = function (s, n) { return new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); };
  var daysBetween = function (a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); };
  var fmtD = function (s, noYear) { if (!s) return '?'; try { return new Date(s + 'T12:00:00Z').toLocaleDateString([], noYear ? { month: 'short', day: 'numeric', timeZone: 'UTC' } : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return s; } };
  var fmtH = function (h) { var d = new Date(Date.UTC(2020, 0, 1, h)); try { return d.toLocaleTimeString([], { hour: 'numeric', timeZone: 'UTC' }); } catch (e) { return h + ':00'; } };
  var isDay = function () { return RANGE === 'today' || RANGE === 'yesterday'; };
  var rangeName = function (r) { return r === 'today' ? 'today' : r === 'yesterday' ? 'yesterday' : r + ' days'; };

  // change vs previous period; "pos" = lower is better
  function change(cur, prev, kind) {
    if (!CMP || prev == null) return null;
    if (kind === 'pos') {
      if (!cur || !prev) return null;
      var d = cur - prev;
      if (Math.abs(d) < 0.05) return { cls: 'flat', t: '±0' };
      return { cls: d < 0 ? 'up' : 'dn', t: (d < 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) };
    }
    if (kind === 'ctr') {
      var dd = (cur - prev) * 100;
      if (Math.abs(dd) < 0.005) return { cls: 'flat', t: '±0' };
      return { cls: dd > 0 ? 'up' : 'dn', t: (dd > 0 ? '+' : '−') + Math.abs(dd).toFixed(2) + ' pt' };
    }
    if (!prev) return cur ? { cls: 'up', t: 'new' } : null;
    var r = (cur - prev) / prev * 100;
    if (Math.abs(r) < 0.5) return { cls: 'flat', t: '±0%' };
    return { cls: r > 0 ? 'up' : 'dn', t: (r > 0 ? '+' : '−') + Math.abs(r).toFixed(Math.abs(r) < 10 ? 1 : 0) + '%' };
  }
  var chHtml = function (ch, tag) { return ch ? '<' + (tag || 'small') + ' class="' + ch.cls + (tag === 'span' ? ' gs-d' : '') + '">' + esc(ch.t) + '</' + (tag || 'small') + '>' : ''; };

  // countries: Search Console uses lowercase ISO alpha-3
  var A3 = 'usa:US,can:CA,gbr:GB,aus:AU,nzl:NZ,ind:IN,pak:PK,bgd:BD,phl:PH,vnm:VN,idn:ID,mys:MY,sgp:SG,tha:TH,chn:CN,hkg:HK,twn:TW,jpn:JP,kor:KR,deu:DE,fra:FR,ita:IT,esp:ES,prt:PT,nld:NL,bel:BE,che:CH,aut:AT,swe:SE,nor:NO,dnk:DK,fin:FI,irl:IE,pol:PL,cze:CZ,svk:SK,hun:HU,rou:RO,bgr:BG,grc:GR,tur:TR,ukr:UA,rus:RU,isr:IL,sau:SA,are:AE,qat:QA,kwt:KW,egy:EG,mar:MA,dza:DZ,tun:TN,nga:NG,gha:GH,ken:KE,eth:ET,zaf:ZA,uga:UG,tza:TZ,mex:MX,bra:BR,arg:AR,chl:CL,col:CO,per:PE,ven:VE,ecu:EC,bol:BO,ury:UY,pry:PY,cri:CR,pan:PA,gtm:GT,dom:DO,jam:JM,tto:TT,pri:PR,cub:CU,lka:LK,npl:NP,mmr:MM,khm:KH,lao:LA,irn:IR,irq:IQ,jor:JO,lbn:LB,syr:SY,afg:AF,kaz:KZ,uzb:UZ,aze:AZ,geo:GE,arm:AM,srb:RS,hrv:HR,svn:SI,bih:BA,alb:AL,mkd:MK,ltu:LT,lva:LV,est:EE,blr:BY,mda:MD,isl:IS,lux:LU,mlt:MT,cyp:CY,zmb:ZM,zwe:ZW,cmr:CM,civ:CI,sen:SN,rwa:RW,moz:MZ,ago:AO,bwa:BW,nam:NA,mus:MU,fji:FJ,png:PG,mng:MN,brn:BN,omn:OM,bhr:BH,yem:YE,lby:LY,sdn:SD,som:SO,hnd:HN,slv:SV,nic:NI,hti:HT,bhs:BS,brb:BB,guy:GY,sur:SR,mac:MO,mdv:MV,btn:BT';
  var A3MAP = {}; A3.split(',').forEach(function (x) { var p = x.split(':'); A3MAP[p[0]] = p[1]; });
  var DN = null; try { DN = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
  var country = function (k) { var a2 = A3MAP[k]; if (k === 'zzz') return 'Unknown'; try { if (a2 && DN) return DN.of(a2); } catch (e) {} return String(k).toUpperCase(); };
  var DEV = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' };
  var DIMNAME = { query: 'Query', page: 'Page', country: 'Country', device: 'Device' };
  var TAB2DIM = { queries: 'query', pages: 'page', countries: 'country', devices: 'device' };

  // metric colours, as on Google's own Search Console (lighter twins in dark mode via CSS custom properties)
  var MET = [['c', 'Clicks', '--gs-mc'], ['i', 'Impressions', '--gs-mi'], ['ctr', 'CTR', '--gs-mt'], ['p', 'Position', '--gs-mp']];

  new MutationObserver(function () { if (DATA) drawChart(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ---- controls: range (two bars, kept in step), compare (two buttons), chart source, metrics, hide
  function paintRange() {
    document.querySelectorAll('#gs [data-rangebar]').forEach(function (bar) {
      if (!bar.firstChild) bar.innerHTML = RANGES.map(function (r) { return '<button type="button" class="tu-chip" data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('');
      bar.querySelectorAll('button[data-r]').forEach(function (b) {
        var off = FILTERS.length && b.dataset.r === '365';
        b.setAttribute('aria-pressed', b.dataset.r === RANGE ? 'true' : 'false');
        b.disabled = !!off;
        b.title = off ? 'Filters cover at most 90 days (remove the filters for 365 days)' : '';
      });
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('#gs [data-rangebar] button[data-r]');
    if (!b || b.disabled || b.dataset.r === RANGE) return;
    RANGE = b.dataset.r; SAVE('range', RANGE); SEL = null; NOTE = ''; paintRange(); load();
  });
  function paintCmp() { document.querySelectorAll('#gs .gs-cmpbtn').forEach(function (b) { b.setAttribute('aria-pressed', CMP ? 'true' : 'false'); }); }
  document.querySelectorAll('#gs .gs-cmpbtn').forEach(function (b) { b.addEventListener('click', function () { CMP = !CMP; SAVE('cmp', CMP ? '1' : '0'); paintCmp(); if (DATA) render(); }); });
  function chips(id, attr, cur, onPick) {
    var el = $(id);
    var set = function (v) { el.querySelectorAll('button[data-' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset[attr] === v ? 'true' : 'false'); }); };
    set(cur);
    el.onclick = function (e) { var b = e.target.closest('button[data-' + attr + ']'); if (!b) return; set(b.dataset[attr]); onPick(b.dataset[attr]); };
    return set;
  }
  chips('gs-src', 's', CSRC, function (v) { CSRC = v; SAVE('csrc', v); if (DATA) drawChart(); });
  chips('gs-ttab', 't', TAB, function (v) { TAB = v; SAVE('tab', v); if (DATA) renderTable(true); });
  var setSrc = chips('gs-tsrc', 's', TSRC, function (v) { TSRC = v; SAVE('tsrc', v); if (DATA) renderTable(true); });
  function paintHide() {
    $('gs-cbody').hidden = HIDE;
    $('gs-hide').textContent = HIDE ? 'Show chart' : 'Hide chart';
    $('gs-hide').setAttribute('aria-expanded', HIDE ? 'false' : 'true');
  }
  $('gs-hide').onclick = function () { HIDE = !HIDE; SAVE('hidechart', HIDE ? '1' : '0'); paintHide(); if (!HIDE && DATA) drawChart(); };
  paintRange(); paintCmp(); paintHide();
  var qTimer = 0;
  $('gs-q').addEventListener('input', function () { clearTimeout(qTimer); qTimer = setTimeout(function () { TFILTER = $('gs-q').value.trim().toLowerCase(); renderTable(true); }, 120); paintTClear(); });

  // Fill window / Full screen for the chart card and the table card (main_js/panel-view.js)
  (function panels() {
    if (!window.MESPanel) { setTimeout(panels, 60); return; }
    window.MESPanel.add($('gs-chartsec'), { bar: $('gs-hbtns'), onChange: function () { if (DATA && !HIDE) drawChart(); } });
    window.MESPanel.add($('gs-tablesec'), { bar: $('gs-thead') });
  })();

  // ---- filters (like Search Console's: several, ANDed, shown as removable chips; a table row adds one)
  var OPS = { text: [['contains', 'contains'], ['exact', 'is exactly'], ['not', 'doesn’t contain']], pick: [['exact', 'is'], ['not', 'is not']] };
  var isPick = function (dim) { return dim === 'country' || dim === 'device'; };
  function fLabel(f) {
    var v = f.dim === 'country' ? country(f.v) : f.dim === 'device' ? (DEV[f.v] || f.v) : '“' + f.v + '”';
    var op = (OPS[isPick(f.dim) ? 'pick' : 'text'].filter(function (o) { return o[0] === f.op; })[0] || ['', f.op])[1];
    return DIMNAME[f.dim] + ' ' + op + ' ' + v;
  }
  function saveFilters() { try { sessionStorage.setItem('mes-gsc:filters', JSON.stringify(FILTERS)); } catch (e) {} }
  function paintFilters() {
    var el = $('gs-fchips');
    el.innerHTML = FILTERS.map(function (f, i) {
      return '<span class="gs-fchip"><span>' + esc(fLabel(f)) + '</span><button type="button" data-fx="' + i + '" aria-label="Remove filter: ' + esc(fLabel(f)) + '" title="Remove">×</button></span>';
    }).join('') + (FILTERS.length > 1 ? '<button type="button" class="gs-fclear" data-fx="all">Clear all</button>' : '');
    $('gs-fadd').textContent = FILTERS.length ? '+ Add filter' : '+ Filter';
    paintTClear();
  }
  // Clear beside the table: drops every filter and the table search
  function paintTClear() { var b = $('gs-tclear'); if (b) b.hidden = !FILTERS.length && !$('gs-q').value; }
  $('gs-tclear').onclick = function () {
    var had = FILTERS.length; clearTimeout(qTimer);
    $('gs-q').value = ''; TFILTER = '';
    if (had) { FILTERS = []; saveFilters(); paintFilters(); paintRange(); NOTE = ''; SEL = null; load(); } else { paintTClear(); renderTable(true); }
    $('gs-q').focus();
  };
  $('gs-fchips').onclick = function (e) {
    var b = e.target.closest('button[data-fx]'); if (!b) return;
    if (b.dataset.fx === 'all') FILTERS = []; else FILTERS.splice(+b.dataset.fx, 1);
    saveFilters(); paintFilters(); paintRange(); NOTE = ''; SEL = null; load();
  };
  function addFilter(f) {
    FILTERS = FILTERS.filter(function (x) { return !(x.dim === f.dim && x.op === f.op && x.v.toLowerCase() === f.v.toLowerCase()); });
    if (f.op === 'exact') FILTERS = FILTERS.filter(function (x) { return !(x.dim === f.dim && x.op === 'exact'); }); // one "is" per dimension
    FILTERS.push(f);
    if (FILTERS.length > 8) FILTERS = FILTERS.slice(-8);
    NOTE = '';
    if (RANGE === '365') { RANGE = '90'; SAVE('range', RANGE); NOTE = 'Filters cover at most 90 days (Google sends day-by-day breakdowns for the last 180 days, 90 of them for the comparison), so the range is now 90 days.'; }
    saveFilters(); paintFilters(); paintRange(); SEL = null; load();
  }
  function fillOps() {
    var dim = $('gs-fdim').value, pick = isPick(dim);
    $('gs-fop').innerHTML = OPS[pick ? 'pick' : 'text'].map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('');
    $('gs-fv').hidden = pick; $('gs-fsel').hidden = !pick;
    var g = (DATA && DATA.google) || {};
    if (pick) {
      var rows = (g[dim === 'country' ? 'countries' : 'devices'] || []).slice();
      var keys = rows.map(function (r) { return r.k; });
      if (dim === 'device') ['mobile', 'desktop', 'tablet'].forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
      if (dim === 'country') Object.keys(A3MAP).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
      var lab = function (k) { return dim === 'country' ? country(k) : (DEV[k] || k); };
      var top = keys.slice(0, rows.length), rest = keys.slice(rows.length).sort(function (a, b) { return lab(a).localeCompare(lab(b)); });
      $('gs-fsel').innerHTML = (top.length ? '<optgroup label="In this range">' + top.map(function (k) { return '<option value="' + esc(k) + '">' + esc(lab(k)) + '</option>'; }).join('') + '</optgroup>' : '') +
        (rest.length ? '<optgroup label="Others">' + rest.map(function (k) { return '<option value="' + esc(k) + '">' + esc(lab(k)) + '</option>'; }).join('') + '</optgroup>' : '');
    } else {
      $('gs-fv').placeholder = dim === 'page' ? 'e.g. /bmicalculator' : 'e.g. bmi';
      $('gs-flist').innerHTML = (g[dim === 'page' ? 'pages' : 'queries'] || []).slice(0, 60).map(function (r) { return '<option value="' + esc(r.k) + '">'; }).join('');
    }
  }
  $('gs-fdim').onchange = fillOps;
  $('gs-fadd').onclick = function () {
    var f = $('gs-fform'), open = f.hidden;
    f.hidden = !open; $('gs-fadd').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { $('gs-fdim').value = TAB2DIM[TAB] || 'query'; fillOps(); (isPick($('gs-fdim').value) ? $('gs-fsel') : $('gs-fv')).focus(); }
  };
  $('gs-fcancel').onclick = function () { $('gs-fform').hidden = true; $('gs-fadd').setAttribute('aria-expanded', 'false'); };
  $('gs-fform').onsubmit = function (e) {
    e.preventDefault();
    var dim = $('gs-fdim').value, v = (isPick(dim) ? $('gs-fsel').value : $('gs-fv').value).trim();
    if (!v) { $('gs-fv').focus(); return; }
    $('gs-fform').hidden = true; $('gs-fadd').setAttribute('aria-expanded', 'false'); $('gs-fv').value = '';
    addFilter({ dim: dim, op: $('gs-fop').value, v: v.slice(0, 200) });
  };
  paintFilters();

  // ---- data
  var mockReady = null;
  function getJSON(url) {
    if (MOCK) {
      mockReady = mockReady || new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '/search-console/js/sc-mock.js?v=' + Date.now(); s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      return mockReady.then(function () { return window.SC_MOCK(url); });
    }
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  var loadSeq = 0;
  function load() {
    var seq = ++loadSeq;
    $('gs-meta').textContent = 'Loading…';
    var url = '/api/search-console?range=' + RANGE + (FILTERS.length ? '&f=' + encodeURIComponent(JSON.stringify(FILTERS)) : '');
    getJSON(url).then(function (d) { if (seq !== loadSeq) return; DATA = d; render(); loadLines(); })
      .catch(function (e) { if (seq === loadSeq) $('gs-meta').textContent = 'Could not load the data (' + e.message + ').'; });
  }
  // per-row lines: only the ones not loaded yet for this range + filters are asked for
  var lineSeq = 0;
  function loadLines() {
    var ctx = ctxKey();
    var miss = LINES.filter(function (l) { return !LDATA[ctx + '|' + lkey(l)]; });
    if (!miss.length || isDay()) { if (DATA && !HIDE) drawChart(); return; }
    var seq = ++lineSeq;
    var url = '/api/search-console?range=' + RANGE + (FILTERS.length ? '&f=' + encodeURIComponent(JSON.stringify(FILTERS)) : '') +
      '&lines=' + encodeURIComponent(JSON.stringify(miss.map(function (l) { return { dim: l.dim, v: l.v }; })));
    getJSON(url).then(function (d) {
      if (seq !== lineSeq || ctx !== ctxKey()) return;
      LERR = d.error || '';
      (d.lines || []).forEach(function (x, j) { var l = miss[j]; if (l) LDATA[ctx + '|' + lkey(l)] = { daily: x.daily || [], basis: x.basis }; });
      if (d.clamped) LDATA[ctx + '|clamped'] = 1;
      if (DATA && !HIDE) drawChart();
    }).catch(function (e) { LERR = 'Could not load the row lines (' + e.message + ').'; if (DATA && !HIDE) drawChart(); });
  }
  function toggleLine(l) {
    var k = lkey(l), i = LINES.findIndex(function (x) { return lkey(x) === k; });
    if (i !== -1) LINES.splice(i, 1);
    else { if (LINES.length >= MAXL) return; l.c = freeColor(); LINES.push(l); }
    saveLines(); renderTable(false); loadLines();
  }

  function ago(iso) {
    if (!iso) return 'never';
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return m + ' min ago'; if (m < 48 * 60) return Math.round(m / 60) + ' h ago'; return Math.round(m / 1440) + ' days ago';
  }
  var gOk = function () { var g = DATA && DATA.google; return !!(g && g.setup && !g.error); };
  var bOk = function () { var b = DATA && DATA.bing; return !!(b && b.setup && !b.error); };
  var bingFiltered = function () { return bOk() && FILTERS.length > 0; };

  // ---- setup / not set up yet
  function setupHtml() {
    var g = DATA.google || {}, b = DATA.bing || {}, out = '';
    if (!g.setup) out += '<div class="tu-card gs-setup"><h2>Google Search Console: not set up yet</h2><ol>' +
      '<li>Open <a href="https://script.google.com/" target="_blank" rel="noopener">script.google.com</a> → New project, name it “MES Search Console page”, paste <code>google-ads/search-console-gsc-script.js</code> from the repo over Code.gs.</li>' +
      '<li>Project Settings → tick “Show appsscript.json manifest file in editor”, then put the three <code>oauthScopes</code> from the top of the script into <code>appsscript.json</code>.</li>' +
      '<li>Project Settings → Script properties → <code>INGEST_KEY</code> = the same key as the AdSense script (Vercel env <code>EARNINGS_INGEST_KEY</code>).</li>' +
      '<li>Run <code>backfill()</code> once with the Google account that owns mes.fm in Search Console (16 months of days, then the day-by-day breakdowns), then run <code>installTrigger()</code> once (every hour after that).</li>' +
      '<li>If the property is a URL-prefix one, change <code>PROPERTY</code> in the script to <code>https://mes.fm/</code>.</li></ol></div>';
    else if (g.error) out += '<div class="tu-card gs-setup"><h2>Google</h2><p>' + esc(g.error) + '</p></div>';
    if (!b.setup) out += '<div class="tu-card gs-setup"><h2>Bing Webmaster Tools: not set up yet</h2><ol>' +
      '<li>Open <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster Tools</a> → Settings (gear) → API access → API Key → Generate.</li>' +
      '<li>Vercel → the mes.fm project → Settings → Environment Variables → add <code>BING_WEBMASTER_KEY</code> (plain project-level variable, Production). Optional: <code>BING_SITE_URL</code> if the site is not registered as <code>https://mes.fm/</code>.</li>' +
      '<li>Redeploy. Bing’s numbers are then read live (cached for 6 hours).</li></ol></div>';
    else if (b.error) out += '<div class="tu-card gs-setup"><h2>Bing</h2><p>' + esc(b.error) + ' Check the key in Vercel and that <code>BING_SITE_URL</code> matches the site as Bing lists it.</p></div>';
    return out;
  }

  function tile(v, label, ch) { return '<div class="tu-stat"><div class="tu-stat__value">' + v + chHtml(ch, 'span') + '</div><div class="tu-stat__label">' + esc(label) + '</div></div>'; }
  // Google / Bing totals: collapsible; collapsed = one summary line (localStorage mes-gsc:sumfold)
  var SUMS = {}, SUMFOLD = LS('sumfold', '0', /^[01]$/) === '1';
  function paintSum() {
    $('gs-sumbody').hidden = SUMFOLD;
    var b = $('gs-sumbtn');
    b.setAttribute('aria-expanded', SUMFOLD ? 'false' : 'true');
    b.title = SUMFOLD ? 'Show the Google and Bing totals' : 'Hide the totals (a one-line summary stays)';
    b.querySelector('.gs-sumarr').textContent = SUMFOLD ? '▸' : '▾';
    var line = ['g', 'b'].filter(function (k) { return SUMS[k]; }).map(function (k) {
      return '<span class="gs-sumpart"><i class="gs-dot gs-dot--' + k + '"></i><b>' + (k === 'g' ? 'Google' : 'Bing') + '</b> ' + SUMS[k] + '</span>';
    }).join('');
    var ln = $('gs-sumline'); ln.hidden = !SUMFOLD; ln.innerHTML = line || 'No totals yet';
  }
  $('gs-sumbtn').onclick = function () { SUMFOLD = !SUMFOLD; SAVE('sumfold', SUMFOLD ? '1' : '0'); paintSum(); };
  paintSum();
  function tiles(id, s, hideWhy) {
    var el = $(id), row = el.parentElement, k = id.slice(-1);
    SUMS[k] = '';
    if (!s || !s.setup || s.error) { row.hidden = true; paintSum(); return; }
    row.hidden = false;
    if (hideWhy) { el.innerHTML = ''; el.hidden = true; paintSum(); return; }
    el.hidden = false;
    var t = s.totals || { c: 0, i: 0, p: 0, days: 0 }, p = s.prevTotals || {};
    SUMS[k] = esc(int(t.c)) + ' clicks · ' + esc(int(t.i)) + ' impr. · ' + esc(pctTxt(ctrOf(t.c, t.i))) + ' CTR · pos. ' + esc(posTxt(t.p));
    paintSum();
    var hasPrev = !s.prevPartial && p.days > 0;
    el.innerHTML = tile(int(t.c), 'clicks', hasPrev ? change(t.c, p.c) : null) +
      tile(int(t.i), 'impressions', hasPrev ? change(t.i, p.i) : null) +
      tile(pctTxt(ctrOf(t.c, t.i)), 'click-through rate', hasPrev ? change(ctrOf(t.c, t.i), ctrOf(p.c, p.i), 'ctr') : null) +
      tile(posTxt(t.p), 'average position', hasPrev && s.prevDaysOk !== false ? change(t.p, p.p, 'pos') : null);
  }
  // what Bing can and cannot show for this view
  function bingNote() {
    var b = DATA.bing || {};
    if (!bOk()) return '';
    var n = [];
    if (b.lag) n.push('Bing has no numbers for ' + fmtD(b.cur && b.cur.end) + ' yet: its newest day is ' + fmtD(b.newest) + ' (Bing lags 2–3 days).');
    else if (b.empty) n.push('Bing has no data yet.');
    if (FILTERS.length) n.push('Bing’s day totals cannot be split by query, page, country or device, so its tiles and line are hidden while filters are on; its query and page tables are filtered where Bing has that dimension.');
    if (!isDay() && CMP && b.prevPartial && !b.empty) n.push('Bing keeps a limited history' + (b.since && b.since.tables ? ' (queries and pages from ' + fmtD(b.since.tables) + ')' : '') + ', so the ' + rangeName(DATA.rangeUsed || RANGE) + ' before this range are not complete: no changes are shown for Bing.');
    if (!isDay() && b.curPartial) n.push('Bing’s data starts ' + fmtD((b.since && (b.since.tables || b.since.traffic)) || '') + ', so this range is only partly covered.');
    return n.join(' ');
  }

  function render() {
    var g = DATA.google || {}, b = DATA.bing || {};
    var parts = [];
    var gRange = g.cur ? (g.cur.start === g.cur.end ? fmtD(g.cur.start) : fmtD(g.cur.start) + ' – ' + fmtD(g.cur.end)) : 'no days yet';
    if (gOk()) parts.push('Google: <b>' + gRange + '</b>, sent ' + ago(g.meta && g.meta.at) + (g.meta && g.meta.property ? ' (' + esc(g.meta.property) + ')' : ''));
    if (bOk() && b.empty) parts.push('Bing: <b>no numbers for this range yet</b>');
    else if (bOk() && b.cur) parts.push('Bing: <b>' + (b.cur.start === b.cur.end ? fmtD(b.cur.start) : fmtD(b.cur.start) + ' – ' + fmtD(b.cur.end)) + '</b>');
    $('gs-meta').innerHTML = (parts.join(' · ') || 'No data yet.') + '.' +
      (isDay() ? ' Times and days are Pacific time, Search Console’s day.' : ' Each source’s range ends on its newest day.') +
      (CMP ? ' Changes compare with ' + (isDay() ? 'the day before' : 'the ' + rangeName(DATA.rangeUsed || RANGE) + ' before') + '.' : '');
    // fresh data note
    var fr = $('gs-fresh');
    if (gOk() && g.fresh) {
      var fd = (g.daily || []).filter(function (x) { return x.f; }).map(function (x) { return x.d; });
      fr.hidden = false;
      fr.innerHTML = '<b>Fresh data:</b> ' + (fd.length === 1 ? fmtD(fd[0]) + ' is' : fmtD(fd[0], true) + ' – ' + fmtD(fd[fd.length - 1], true) + ' are') +
        ' still being counted by Google, so these numbers may still change (usually upwards) over the next 2–3 days. Shaded on the chart.';
    } else if (gOk() && isDay() && g.noDay) {
      fr.hidden = false; fr.innerHTML = '<b>No Google numbers for ' + fmtD(g.cur && g.cur.start) + ' yet.</b> Search Console starts showing a day after a few hours; the script sends fresh data every hour.';
    } else fr.hidden = true;
    // filter note
    var fn = [];
    if (NOTE) fn.push(NOTE);
    if (FILTERS.length && gOk()) {
      if (g.clamped) fn.push('Filters cover at most 90 days, so this shows 90 days.');
      if (g.basis === 'q') fn.push('With a query filter only the queries Google lists are counted (it hides rare queries for privacy), so totals are lower than the unfiltered ones.');
      else if (g.basis === 'p') fn.push('Page filter: Search Console’s own page totals (a search that showed two mes.fm pages counts once for each page).');
      else if (g.basis === 'b') fn.push('A page filter together with a country or device filter uses Google’s page × country × device rows, which leave out small rows, so these read lower than Search Console’s own (page-only filters are exact).');
      if (g.pFallback) fn.push(g.pFallback.want - g.pFallback.have + ' of these ' + g.pFallback.want + ' days were stored before the complete page breakdown existed, so they come from page × country × device rows and read far too low: paste the version 3 Apps Script and run backfillDims() once.');
      if (g.dimDays && g.dimDays.have < g.dimDays.want) fn.push('Google’s day-by-day breakdowns cover ' + g.dimDays.have + ' of these ' + g.dimDays.want + ' days' + (g.dimDays.have ? '' : ': run backfillDims() in the Apps Script once') + '.');
    }
    $('gs-fnote').hidden = !fn.length; $('gs-fnote').textContent = fn.join(' ');
    $('gs-setup').innerHTML = setupHtml();
    tiles('gs-tiles-g', g); tiles('gs-tiles-b', b, bingFiltered() || b.empty);
    var bn = bingNote(); $('gs-bnote').hidden = !bn; $('gs-bnote').textContent = bn;
    if (TSRC === 'bing' && !bOk() && g.setup) { TSRC = 'google'; setSrc('google'); }
    if (!HIDE) drawChart();
    renderTable(false);
    if (AI) renderAi(false);
  }

  // ---- chart: several metrics at once (each its own scale, like Search Console), Google / Bing / both, previous period dashed
  var cssv = function (n) { return getComputedStyle($('gs')).getPropertyValue(n).trim(); };
  function metricTiles(srcs) {
    var el = $('gs-mtiles');
    el.innerHTML = MET.map(function (m) {
      var on = METRICS.indexOf(m[0]) !== -1;
      var vals = srcs.map(function (s) {
        var t = s.data.totals || {}; var v = m[0] === 'c' ? int(t.c) : m[0] === 'i' ? short(t.i || 0) : m[0] === 'ctr' ? pctTxt(ctrOf(t.c, t.i)) : posTxt(t.p);
        if (m[0] === 'p' && s.id === 'b') return '';
        return '<span class="gs-mt__v"><i class="gs-dot gs-dot--' + s.id + '"></i>' + v + '</span>';
      }).join('');
      return '<button type="button" class="gs-mt" data-m="' + m[0] + '" aria-pressed="' + on + '" style="--mc:var(' + m[2] + ')"><span class="gs-mt__n"><span class="gs-mt__box" aria-hidden="true"></span>' + m[1] + '</span>' + vals + '</button>';
    }).join('');
  }
  $('gs-mtiles').onclick = function (e) {
    var b = e.target.closest('button[data-m]'); if (!b) return;
    var m = b.dataset.m, i = METRICS.indexOf(m);
    if (i === -1) METRICS.push(m); else if (METRICS.length > 1) METRICS.splice(i, 1);
    METRICS = MET.map(function (x) { return x[0]; }).filter(function (x) { return METRICS.indexOf(x) !== -1; });
    SAVE('metrics', METRICS.join(',')); drawChart();
  };
  var mval = function (x, m) { if (!x) return null; if (m === 'c') return x.c; if (m === 'i') return x.i; if (m === 'ctr') return x.i ? x.c / x.i * 100 : null; return x.p || null; };
  var mtxt = function (v, m) { return v == null ? '–' : m === 'ctr' ? (+v.toFixed(2)) + '%' : m === 'p' ? (+v.toFixed(1)) : short(v); };

  // the x axis and the series of each visible source
  function chartModel() {
    var g = DATA.google, b = DATA.bing, srcs = [];
    if ((CSRC === 'google' || CSRC === 'both') && gOk()) srcs.push({ id: 'g', name: 'Google', data: g });
    if ((CSRC === 'bing' || CSRC === 'both') && bOk() && !bingFiltered() && !b.empty) srcs.push({ id: 'b', name: 'Bing', data: b });
    var hourly = isDay() && gOk() && !FILTERS.length && (g.hourly || []).length > 0 && srcs.some(function (s) { return s.id === 'g'; });
    var xs = [], series = [];
    if (hourly) {
      for (var h = 0; h < 24; h++) xs.push(h);
      srcs.forEach(function (s) {
        if (s.id !== 'g') return;
        var cur = {}, prev = {};
        (s.data.hourly || []).forEach(function (x) { cur[x.h] = x; });
        (s.data.prevHourly || []).forEach(function (x) { prev[x.h] = x; });
        series.push({ src: s, cur: function (k) { return cur[k]; }, prev: function (k) { return prev[k]; } });
      });
    } else {
      var set = {};
      srcs.forEach(function (s) { (s.data.daily || []).forEach(function (x) { set[x.d] = 1; }); });
      xs = Object.keys(set).sort();
      srcs.forEach(function (s) {
        var cur = {}, prev = {}, d = s.data;
        (d.daily || []).forEach(function (x) { cur[x.d] = x; });
        (d.prevDaily || []).forEach(function (x) { prev[x.d] = x; });
        var off = d.cur && d.prev ? daysBetween(d.prev.start, d.cur.start) : 0;
        series.push({ src: s, cur: function (k) { return cur[k]; }, prev: function (k) { return prev[addDays(k, -off)]; }, prevKey: function (k) { return addDays(k, -off); } });
      });
    }
    // ticked rows (Google, by day): own lines in their tick-box colour
    var lines = [];
    if (!hourly && !isDay() && gOk()) {
      var ctx = ctxKey();
      LINES.forEach(function (l) {
        var got = LDATA[ctx + '|' + lkey(l)]; if (!got) return;
        var m = {}; got.daily.forEach(function (x) { m[x.d] = x; if (xs.indexOf(x.d) === -1) xs.push(x.d); });
        lines.push({ line: l, src: { id: 'l' }, name: lname(l), color: l.c, cur: function (k) { return m[k]; }, prev: function () { return null; } });
      });
      xs.sort();
    }
    return { srcs: srcs, xs: xs, series: series, lines: lines, hourly: hourly };
  }
  var lname = function (l) { return l.dim === 'country' ? country(l.k) : l.dim === 'device' ? (DEV[l.k] || l.k) : l.k; };
  var LDASH = { c: '', i: '7 4', ctr: '2 3', p: '9 3 2 3' };

  function drawChart() {
    if (!DATA || HIDE) return;
    var svg = $('gs-svg'), box = $('gs-chart');
    var model = chartModel(), xs = model.xs, lseries = model.lines;
    var showTot = !HIDETOT || !lseries.length;
    var series = showTot ? model.series : [];
    metricTiles(model.srcs);
    $('gs-ctitle').textContent = model.hourly ? 'Hour by hour' : 'Day by day';
    var W = box.clientWidth || 600, H = box.clientHeight || 220;
    var mets = METRICS.slice();
    var leftAx = mets.length <= 2, rightAx = mets.length === 2;
    var padL = leftAx ? 44 : 10, padR = rightAx ? 44 : 10, padB = 22, padT = 10;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var cLine = cssv('--gs-line'), cMuted = cssv('--gs-muted');
    var notes = [];
    if (mets.indexOf('p') !== -1 && model.srcs.some(function (s) { return s.id === 'b'; })) notes.push('Bing gives no position per day, so Position is Google only.');
    if (mets.indexOf('p') !== -1) notes.push('Position: lower is better, so its scale is upside down.');
    if (isDay() && !model.hourly) notes.push(FILTERS.length ? 'Hourly numbers exist only for the whole site, so with a filter the day is one point.' : 'No hourly numbers for this day yet.');
    if (model.hourly && model.srcs.some(function (s) { return s.id === 'b'; })) notes.push('Bing has no hourly numbers.');
    if (model.hourly) notes.push('Hours are Pacific time.');
    if (LINES.length && isDay()) notes.push('Ticked rows are drawn as lines for 7 days or more.');
    else if (LINES.length && lseries.length < LINES.length && !LERR) notes.push('Loading the ticked rows…');
    if (lseries.length) notes.push('Ticked rows: Google, from its day-by-day breakdowns' + (LDATA[ctxKey() + '|clamped'] ? ' (the last 90 days only)' : '') + (mets.length > 1 ? '; dash = metric (clicks solid, impressions dashed, CTR dotted)' : '') + '.');
    if (LERR) notes.push(LERR);
    if (!xs.length) {
      svg.innerHTML = '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="' + cMuted + '" font-size="13">No data for this range</text>';
      $('gs-legend').innerHTML = ''; $('gs-cnote').textContent = notes.join(' '); $('gs-read').innerHTML = ''; box.onpointermove = box.onpointerdown = null; return;
    }
    if (SEL == null || SEL >= xs.length) {
      SEL = xs.length - 1; // the newest point that has numbers (today's later hours have none yet)
      while (SEL > 0 && !series.some(function (sr) { return sr.cur(xs[SEL]); })) SEL--;
    }
    var iw = W - padL - padR, ih = H - padT - padB;
    var X = function (i) { return padL + (xs.length === 1 ? iw / 2 : i / (xs.length - 1) * iw); };
    // one scale per metric, over everything drawn for it
    var scales = {};
    mets.forEach(function (m) {
      var lo = Infinity, hi = -Infinity;
      series.concat(lseries).forEach(function (sr) {
        if (m === 'p' && sr.src.id === 'b') return;
        xs.forEach(function (k) { [mval(sr.cur(k), m), CMP ? mval(sr.prev(k), m) : null].forEach(function (v) { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
      });
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (m !== 'p') lo = 0;
      if (!(hi > lo)) { hi = (hi || 1) * 1.2; lo = m === 'p' ? Math.max(0, lo - 1) : 0; }
      var step = Math.pow(10, Math.floor(Math.log10(hi - lo))) || 1, top = Math.ceil(hi / step) * step, bot = m === 'p' ? Math.max(0, Math.floor(lo / step) * step) : 0;
      if (top === bot) top = bot + step;
      scales[m] = { top: top, bot: bot, y: function (v) { var f = (v - bot) / (top - bot); return m === 'p' ? padT + f * ih : padT + ih - f * ih; } };
    });
    var s = '';
    // fresh (incomplete) days shaded
    if (!model.hourly) {
      var fi = -1;
      series.forEach(function (sr) { if (sr.src.id !== 'g') return; xs.forEach(function (k, i) { var x = sr.cur(k); if (x && x.f && fi === -1) fi = i; }); });
      if (fi !== -1) {
        var fx = xs.length === 1 ? padL : X(fi) - (fi > 0 ? iw / (xs.length - 1) / 2 : 0);
        s += '<rect x="' + fx.toFixed(1) + '" y="' + padT + '" width="' + Math.max(4, W - padR - fx).toFixed(1) + '" height="' + ih + '" fill="' + cssv('--gs-fresh') + '"/>' +
          '<text x="' + (W - padR - 4) + '" y="' + (padT + 12) + '" text-anchor="end" font-size="10.5" fill="' + cMuted + '">fresh</text>';
      }
    }
    // grid + axes
    for (var gi = 0; gi <= 4; gi++) {
      var gy = padT + ih * gi / 4;
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="' + cLine + '"/>';
      var axLab = function (m, x, anchor) {
        var sc = scales[m], v = m === 'p' ? sc.bot + (sc.top - sc.bot) * gi / 4 : sc.top - (sc.top - sc.bot) * gi / 4;
        return '<text x="' + x + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="' + anchor + '" font-size="11" fill="' + (mets.length === 1 ? cMuted : cssv(MET.filter(function (q) { return q[0] === m; })[0][2])) + '">' + mtxt(v, m) + '</text>';
      };
      if (leftAx) s += axLab(mets[0], padL - 6, 'end');
      if (rightAx) s += axLab(mets[1], W - padR + 6, 'start');
    }
    var colorOf = function (sr, m) { return mets.length === 1 ? cssv(sr.src.id === 'g' ? '--gs-g' : '--gs-b') : cssv(MET.filter(function (q) { return q[0] === m; })[0][2]); };
    var poly = function (pts, color, w, dash, op) {
      var out = '', run = [];
      var flush = function () {
        if (run.length > 1) out += '<polyline points="' + run.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + (op ? ' stroke-opacity="' + op + '"' : '') + '/>';
        else if (run.length === 1) out += '<circle cx="' + run[0].split(',')[0] + '" cy="' + run[0].split(',')[1] + '" r="3.2" fill="' + color + '"' + (op ? ' fill-opacity="' + op + '"' : '') + '/>';
        run = [];
      };
      pts.forEach(function (p) { if (p == null) flush(); else run.push(p); });
      flush(); return out;
    };
    var legend = [];
    mets.forEach(function (m) {
      series.forEach(function (sr) {
        if (m === 'p' && sr.src.id === 'b') return;
        var col = colorOf(sr, m), y = scales[m].y, bing = sr.src.id === 'b' && mets.length > 1;
        if (CMP) s += poly(xs.map(function (k, i) { var v = mval(sr.prev(k), m); return v == null ? null : X(i).toFixed(1) + ',' + y(v).toFixed(1); }), col, 1.6, '5 4', 0.6);
        s += poly(xs.map(function (k, i) { var v = mval(sr.cur(k), m); return v == null ? null : X(i).toFixed(1) + ',' + y(v).toFixed(1); }), col, bing ? 2 : 2.6, bing ? '1.5 3.5' : '', 0);
      });
      lseries.forEach(function (sr) {
        var y = scales[m].y;
        s += poly(xs.map(function (k, i) { var v = mval(sr.cur(k), m); return v == null ? null : X(i).toFixed(1) + ',' + y(v).toFixed(1); }), sr.color, 2.2, mets.length > 1 ? LDASH[m] : '', 0);
      });
    });
    // chart notes: markers on the x axis (daily view)
    if (!model.hourly && window.MESNotes) s += window.MESNotes.marks({ days: xs, X: X, y0: padT + ih, y1: padT, size: 6 });
    // legend
    if (mets.length === 1) series.forEach(function (sr) { legend.push('<span><i class="gs-key" style="border-color:' + colorOf(sr, mets[0]) + '"></i>' + sr.src.name + '</span>'); });
    else {
      mets.forEach(function (m) { var q = MET.filter(function (x) { return x[0] === m; })[0]; legend.push('<span><i class="gs-key" style="border-color:' + cssv(q[2]) + '"></i>' + q[1] + '</span>'); });
      if (series.some(function (sr) { return sr.src.id === 'b'; })) legend.push('<span><i class="gs-key gs-key--dot"></i>Bing (dotted), Google (solid)</span>');
    }
    if (CMP && series.length) legend.push('<span><i class="gs-key gs-key--dash"></i>' + (isDay() ? 'the day before' : 'previous ' + rangeName(DATA.rangeUsed || RANGE)) + '</span>');
    if (lseries.length || LINES.length) {
      legend.push('<button type="button" class="gs-lchip gs-lchip--tot" data-tot aria-pressed="' + (showTot ? 'true' : 'false') + '" title="Show or hide the totals while rows are ticked">Total</button>');
      LINES.forEach(function (l) {
        legend.push('<span class="gs-lchip" style="--lc:' + l.c + '"><i class="gs-key" style="border-color:' + l.c + '"></i>' + esc(lname(l)) +
          '<button type="button" data-lrm="' + esc(lkey(l)) + '" aria-label="Remove the line for ' + esc(lname(l)) + '" title="Remove">×</button></span>');
      });
    }
    // x labels
    var every = Math.ceil(xs.length / Math.max(2, Math.floor(iw / (model.hourly ? 46 : 60))));
    xs.forEach(function (k, i) {
      if (i % every === 0 || xs.length < 3) s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + cMuted + '">' + (model.hourly ? esc(fmtH(k)) : String(k).slice(5)) + '</text>';
    });
    s += '<g id="gs-mark"></g>';
    svg.innerHTML = s;
    $('gs-legend').innerHTML = legend.join('');
    $('gs-cnote').textContent = notes.join(' ');

    // crosshair + dots on the picked point; the numbers go in the readout line ABOVE the plot, so a finger never hides them
    function mark(i) {
      SEL = i;
      var x = X(i), k = xs[i], g = $('gs-mark'), out = '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + padT + '" y2="' + (padT + ih) + '" stroke="' + cMuted + '" stroke-dasharray="3 3"/>';
      mets.forEach(function (m) {
        series.forEach(function (sr) {
          if (m === 'p' && sr.src.id === 'b') return;
          var v = mval(sr.cur(k), m); if (v == null) return;
          out += '<circle cx="' + x.toFixed(1) + '" cy="' + scales[m].y(v).toFixed(1) + '" r="4.5" fill="' + colorOf(sr, m) + '" stroke="' + cssv('--gs-card') + '" stroke-width="2"/>';
        });
        lseries.forEach(function (sr) {
          var v = mval(sr.cur(k), m); if (v == null) return;
          out += '<circle cx="' + x.toFixed(1) + '" cy="' + scales[m].y(v).toFixed(1) + '" r="4" fill="' + sr.color + '" stroke="' + cssv('--gs-card') + '" stroke-width="2"/>';
        });
      });
      g.innerHTML = out;
      var narrow = W < 560;
      var lab = model.hourly ? fmtH(k) + (DATA.google.cur ? ', ' + fmtD(DATA.google.cur.start, true) : '') : fmtD(k, narrow);
      var html = '<b class="gs-read__d">' + esc(lab) + '</b>';
      series.forEach(function (sr) {
        var x2 = sr.cur(k);
        var part = function (xx) {
          if (!xx) return '<span class="gs-read__na">no data</span>';
          return MET.map(function (q) {
            if (q[0] === 'p' && (sr.src.id === 'b' || !xx.p)) return '';
            var v = q[0] === 'c' ? int(xx.c) : q[0] === 'i' ? (narrow ? short(xx.i) : int(xx.i)) : q[0] === 'ctr' ? pctTxt(ctrOf(xx.c, xx.i)) : posTxt(xx.p);
            var on = mets.indexOf(q[0]) !== -1;
            return '<span class="gs-read__m' + (on ? ' on' : '') + '" style="--mc:var(' + q[2] + ')">' + v + '<small> ' + (narrow ? { c: 'cl', i: 'im', ctr: 'ctr', p: 'pos' }[q[0]] : q[1].toLowerCase()) + '</small></span>';
          }).join('');
        };
        html += '<span class="gs-read__s"><i class="gs-dot gs-dot--' + sr.src.id + '"></i>' + part(x2) + '</span>';
        if (CMP && showTot) {
          var pk = sr.prevKey ? sr.prevKey(k) : null;
          html += '<span class="gs-read__s gs-read__p">vs ' + (model.hourly ? 'the day before' : esc(fmtD(pk, true))) + ': ' + part(sr.prev(k)) + '</span>';
        }
      });
      lseries.forEach(function (sr) {
        var x3 = sr.cur(k);
        html += '<span class="gs-read__s gs-read__l"><i class="gs-dot" style="background:' + sr.color + '"></i><span class="gs-read__ln">' + esc(sr.name) + '</span> ' +
          (x3 ? mets.map(function (m) { var q = MET.filter(function (z) { return z[0] === m; })[0]; return '<span class="gs-read__m on" style="--mc:var(' + q[2] + ')">' + (m === 'c' ? int(x3.c) : m === 'i' ? (narrow ? short(x3.i) : int(x3.i)) : m === 'ctr' ? pctTxt(ctrOf(x3.c, x3.i)) : posTxt(x3.p)) + '<small> ' + (narrow ? { c: 'cl', i: 'im', ctr: 'ctr', p: 'pos' }[m] : q[1].toLowerCase()) + '</small></span>'; }).join('') : '<span class="gs-read__na">no data</span>') + '</span>';
      });
      if (!model.hourly && window.MESNotes) {
        var dn = window.MESNotes.list().filter(function (n) { return n.d === k; });
        html += dn.map(function (n) { return '<button type="button" class="gs-nread" data-nid="' + esc(n.id) + '" title="Edit this note">✎ ' + esc(n.t) + '</button>'; }).join('') +
          '<button type="button" class="gs-nadd" data-nd="' + esc(k) + '" title="Add a note on this day (also: right-click the chart)">+ Note</button>';
      }
      $('gs-read').innerHTML = html;
    }
    mark(Math.min(SEL, xs.length - 1));
    var pick = function (e) {
      var r = box.getBoundingClientRect();
      var fx = (e.clientX - r.left) / r.width * W;
      var i = xs.length === 1 ? 0 : Math.round((fx - padL) / iw * (xs.length - 1));
      mark(Math.max(0, Math.min(xs.length - 1, i)));
    };
    var down = false;
    box.onpointerdown = function (e) { down = true; pick(e); };
    box.onpointermove = function (e) { if (e.pointerType === 'mouse' || down) pick(e); };
    box.onpointerup = box.onpointercancel = function () { down = false; };
    var rest = SEL;
    box.onpointerleave = function (e) { down = false; if (e.pointerType === 'mouse') mark(rest); };
    box.oncontextmenu = function (e) {
      if (model.hourly || !window.MESNotes) return;
      e.preventDefault(); pick(e); down = false; window.MESNotes.edit(xs[SEL]);
    };
    if (window.MESNotes) window.MESNotes.attach(box);
    box.tabIndex = 0;
    box.onkeydown = function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); mark(Math.max(0, Math.min(xs.length - 1, SEL + (e.key === 'ArrowLeft' ? -1 : 1)))); }
    };
  }
  window.addEventListener('resize', function () { if (DATA) drawChart(); });
  // readout buttons (notes) and legend chips (row lines)
  $('gs-read').addEventListener('click', function (e) {
    var a = e.target.closest('.gs-nadd'), b = e.target.closest('.gs-nread');
    if (a && window.MESNotes) window.MESNotes.edit(a.dataset.nd);
    if (b && window.MESNotes) window.MESNotes.edit(null, b.dataset.nid);
  });
  $('gs-legend').addEventListener('click', function (e) {
    var rm = e.target.closest('button[data-lrm]'), tot = e.target.closest('button[data-tot]');
    if (rm) { LINES = LINES.filter(function (l) { return lkey(l) !== rm.dataset.lrm; }); saveLines(); renderTable(false); drawChart(); }
    if (tot) { HIDETOT = !HIDETOT; SAVE('hidetot', HIDETOT ? '1' : '0'); drawChart(); }
  });
  (function notesHook() {
    if (!window.MESNotes) { setTimeout(notesHook, 80); return; }
    window.MESNotes.on(function () { if (DATA && !HIDE) drawChart(); });
    $('gs-notes').onclick = function () { window.MESNotes.manage(); };
  })();

  // ---- table (sortable, quick search, top N + Show all, draggable first column); a row click adds it as a filter
  var ST = {};
  function cols(kind, label, noPrev) {
    var max = 1;
    return function (rows) {
      rows.forEach(function (r) { max = Math.max(max, r.c); });
      var c = [
        { k: 'k', t: label, v: function (r) { return kind === 'countries' ? country(r.k) : kind === 'devices' ? (DEV[r.k] || r.k) : r.k; },
          h: function (r) {
            var name = kind === 'countries' ? country(r.k) : kind === 'devices' ? (DEV[r.k] || r.k) : r.k;
            name = (TSRC === 'google' ? lineBox(kind, r) : '') + esc(name);
            if (kind === 'pages') { var u = r.u || (r.k.charAt(0) === '/' ? 'https://mes.fm' + r.k : 'https://' + r.k); return name + '<a class="gs-open" href="' + esc(u) + '" target="_blank" rel="noopener" title="Open the page" aria-label="Open the page">↗</a>'; }
            return name;
          } },
        { k: 'c', t: 'Clicks', v: function (r) { return r.c; }, h: function (r) { return '<span class="gs-bar"><i style="width:' + (r.c / max * 100).toFixed(1) + '%;background:var(--accent)"></i></span>' + int(r.c) + chHtml(r.pi != null ? change(r.c, r.pc) : null); } },
        { k: 'i', t: 'Impressions', v: function (r) { return r.i; }, h: function (r) { return int(r.i) + chHtml(r.pi != null ? change(r.i, r.pi) : null); } },
        { k: 'ctr', t: 'CTR', v: function (r) { return ctrOf(r.c, r.i); }, h: function (r) { return pctTxt(ctrOf(r.c, r.i)) + chHtml(r.pi ? change(ctrOf(r.c, r.i), ctrOf(r.pc, r.pi), 'ctr') : null); } },
        { k: 'p', t: 'Position', v: function (r) { return r.p || 999; }, h: function (r) { return posTxt(r.p) + chHtml(r.pp ? change(r.p, r.pp, 'pos') : null); } },
      ];
      if (CMP && !noPrev) c.push({ k: 'dc', t: 'Click change', v: function (r) { return r.c - (r.pc || 0); }, h: function (r) { var d = r.c - (r.pc || 0); return '<span class="' + (d > 0 ? 'up' : d < 0 ? 'dn' : 'flat') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '') + int(Math.abs(d)) + '</span>'; } });
      return c;
    };
  }
  // the tick box in front of a row: draw this row as its own line in the chart (its colour once ticked)
  var rowLine = function (kind, r) { return { dim: TAB2DIM[kind], k: String(r.k), v: kind === 'pages' ? String(r.u || r.k) : String(r.k) }; };
  function lineBox(kind, r) {
    var l = rowLine(kind, r), k = lkey(l), on = LINES.filter(function (x) { return lkey(x) === k; })[0];
    var off = !on && LINES.length >= MAXL;
    return '<label class="gs-lck"' + (on ? ' style="--lc:' + on.c + '"' : '') + ' title="' + (off ? 'At most ' + MAXL + ' lines: untick one first' : on ? 'Remove its line from the chart' : 'Draw this row as its own line in the chart') + '">' +
      '<input type="checkbox" data-lk="1"' + (on ? ' checked' : '') + (off ? ' disabled' : '') + ' aria-label="Line in the chart"></label>';
  }
  function renderTable(resetPage) {
    var s = TSRC === 'bing' ? DATA.bing : DATA.google;
    var label = { queries: 'Query', pages: 'Page', countries: 'Country', devices: 'Device' }[TAB];
    var note = '', rows = [], noPrev = !!(s && s.prevPartial);
    if (!s || !s.setup || s.error) note = (TSRC === 'bing' ? 'Bing' : 'Google') + ' is not set up yet (see above).';
    else if (TSRC === 'bing' && (TAB === 'countries' || TAB === 'devices')) note = 'Bing Webmaster’s API has no country or device split. Switch to Google for these.';
    else if (TSRC === 'bing' && isDay()) note = 'Bing counts queries and pages in weekly buckets only, so it has no table for a single day. Choose 7 days or more.';
    else if (TSRC === 'bing' && s.blocked && s.blocked[TAB]) note = 'Bing’s ' + TAB + ' table has no ' + FILTERS.filter(function (f) { return f.dim !== TAB2DIM[TAB]; }).map(function (f) { return f.dim; }).join(' / ') + ' split, so it cannot apply these filters.';
    else {
      rows = (s[TAB] || []).slice();
      if (TSRC === 'bing') note = 'Bing counts queries and pages in weekly buckets, so the range is rounded to whole weeks; positions are Bing’s average impression position.' + (noPrev && CMP ? ' No changes: Bing’s history does not cover the period before.' : '');
      else {
        if (TAB === 'queries') note = 'Search Console hides rare queries for privacy, so these add up to less than the totals.';
        if (noPrev && CMP && !isDay()) note += (note ? ' ' : '') + 'No changes shown: Search Console keeps 16 months, so the ' + rangeName(DATA.rangeUsed || RANGE) + ' before this range are not complete.';
      }
      note += (note ? ' ' : '') + 'Click a row to filter the whole page by it' + (TSRC === 'google' ? '; tick its box to draw it as its own line in the chart (up to ' + MAXL + ').' : '.');
    }
    $('gs-tnote').textContent = note;
    var all = rows.length;
    if (TFILTER) {
      var words = TFILTER.split(/\s+/);
      rows = rows.filter(function (r) {
        var hay = (r.k + ' ' + (TAB === 'countries' ? country(r.k) : '') + ' ' + (DEV[r.k] || '')).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      });
    }
    $('gs-count').textContent = all ? (TFILTER ? rows.length.toLocaleString() + ' of ' + all.toLocaleString() : all.toLocaleString() + ' rows') : '';
    var id = 'gs-t';
    var st = ST[id] || (ST[id] = { key: 'c', dir: 'desc', all: false });
    if (resetPage) st.all = false;
    st.cols = cols(TAB, label, noPrev)(rows); st.rows = rows; st.kind = TAB; st.src = TSRC;
    if (!st.cols.some(function (c) { return c.k === st.key; })) { st.key = 'c'; st.dir = 'desc'; }
    var dim = TAB2DIM[TAB];
    draw(id, 'gs-more', st, function (r) {
      addFilter({ dim: dim, op: 'exact', v: dim === 'page' ? (r.u || r.k) : r.k });
      if (TAB === 'pages') { TAB = 'queries'; SAVE('tab', TAB); document.querySelectorAll('#gs-ttab button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.t === TAB ? 'true' : 'false'); }); }
    }, all ? 'No rows match the search.' : 'No data for this range yet.');
  }
  function draw(id, moreId, st, onRow, empty) {
    var el = $(id), cs = st.cols;
    el.innerHTML = '<thead><tr>' + cs.map(function (c) {
      return '<th data-k="' + c.k + '" class="' + (st.key === c.k ? 'on' : '') + '" title="Sort">' + esc(c.t) + (st.key === c.k ? (st.dir === 'desc' ? ' ▼' : ' ▲') : '') + '</th>';
    }).join('') + '</tr></thead>';
    var more = $(moreId);
    if (!st.rows.length) { el.innerHTML += '<tbody><tr><td colspan="99" class="empty">' + esc(empty) + '</td></tr></tbody>'; more.hidden = true; attachResizer(el); return; }
    var col = cs.filter(function (c) { return c.k === st.key; })[0] || cs[1];
    var sign = st.dir === 'desc' ? -1 : 1;
    var sorted = st.rows.slice().sort(function (a, b) {
      var va = col.v(a), vb = col.v(b);
      if (typeof va === 'string') return sign * va.localeCompare(vb);
      return sign * ((va || 0) - (vb || 0));
    });
    var n = 25, shown = st.all ? sorted.slice(0, 1000) : sorted.slice(0, n);
    el.innerHTML += '<tbody>' + shown.map(function (r, i) {
      return '<tr data-i="' + i + '"' + (onRow ? ' class="gs-click" tabindex="0" title="Filter the page by this"' : '') + '>' + cs.map(function (c, j) { return '<td' + (j === 0 ? ' class="gs-k" title="' + esc(c.v(r)) + '"' : '') + '>' + c.h(r) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';
    st.shown = shown;
    if (onRow) {
      el.querySelectorAll('tbody tr').forEach(function (tr) {
        var go = function (e) { if (e.target.closest('a') || e.target.closest('.gs-lck')) return; onRow(st.shown[+tr.dataset.i]); };
        var lk = tr.querySelector('input[data-lk]');
        if (lk) lk.addEventListener('change', function () { toggleLine(rowLine(st.kind, st.shown[+tr.dataset.i])); });
        tr.addEventListener('click', go);
        tr.addEventListener('keydown', function (e) { if (e.target.closest('.gs-lck')) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
      });
    }
    attachResizer(el);
    more.hidden = st.rows.length <= n;
    more.textContent = st.all ? 'Show top ' + n : 'Show all (' + Math.min(1000, st.rows.length).toLocaleString() + ')';
    more.onclick = function () { st.all = !st.all; draw(id, moreId, st, onRow, empty); };
  }
  document.addEventListener('click', function (e) {
    var th = e.target.closest('#gs th[data-k]'); if (!th) return;
    var el = th.closest('table'), st = ST[el.id]; if (!st) return;
    if (st.key === th.dataset.k) st.dir = st.dir === 'desc' ? 'asc' : 'desc';
    else { st.key = th.dataset.k; st.dir = th.dataset.k === 'k' || th.dataset.k === 'p' || th.dataset.k === 'in' || th.dataset.k === 'to' ? 'asc' : 'desc'; }
    if (el.id === 'gs-ait') renderAiTable(false); else renderTable(false);
  });

  // first column resize (same behaviour as the Page column on /stats); width per table in localStorage
  var lastTap = 0;
  function setColW(el, px, save) {
    var key = 'colw:' + el.id;
    if (px == null) { el.classList.remove('w-set'); el.style.removeProperty('--gs-col-w'); if (save) { try { localStorage.removeItem('mes-gsc:' + key); } catch (e) {} } return; }
    var max = Math.max(130, el.parentElement.clientWidth - 120);
    var w = Math.round(Math.min(max, Math.max(80, px)));
    el.style.setProperty('--gs-col-w', w + 'px'); el.classList.add('w-set');
    if (save) SAVE(key, String(w));
  }
  function attachResizer(el) {
    var th = el.querySelector('thead th'); if (!th) return;
    if (!el.dataset.wRestored) { el.dataset.wRestored = '1'; var saved = parseInt(LS('colw:' + el.id, ''), 10); if (saved > 0) setColW(el, saved, false); }
    var h = document.createElement('span');
    h.className = 'gs-resizer'; h.tabIndex = 0;
    h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical');
    h.setAttribute('aria-label', 'Resize the first column (double-click to reset)');
    h.title = 'Drag to resize this column. Double-click to reset.';
    th.appendChild(h);
    h.addEventListener('click', function (e) { e.stopPropagation(); });
    h.addEventListener('dblclick', function (e) { e.stopPropagation(); setColW(el, null, true); });
    h.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); e.stopPropagation();
      setColW(el, th.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 16 : -16), true);
    });
    h.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      var startX = e.clientX, startW = th.getBoundingClientRect().width;
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
      document.body.classList.add('gs-col-resizing'); h.classList.add('dragging');
      function move(ev) { setColW(el, startW + ev.clientX - startX, false); }
      function up(ev) {
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        try { h.releasePointerCapture(ev.pointerId); } catch (err) {}
        document.body.classList.remove('gs-col-resizing'); h.classList.remove('dragging');
        if (Math.abs(ev.clientX - startX) < 4) {
          var now = Date.now();
          if (now - lastTap < 400) { lastTap = 0; setColW(el, null, true); } else lastTap = now;
          return;
        }
        setColW(el, th.getBoundingClientRect().width, true);
      }
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
  }

  // ---- AI search: Google "Generative AI" (AI Overviews / AI Mode impressions) and Bing "AI Performance" (Copilot citations).
  // Neither has an API, so the owner drops the console exports on the page (parsed here by MESSCAI, lib.js) and they are
  // kept by /api/search-console-ai. Range and Compare follow the page's controls; filters do not apply (no queries in Google's report).
  var AI = null, AISRC = LS('aisrc', 'google', /^(google|bing)$/), AITAB = { google: LS('aitab-g', 'pages', /^(pages|countries|devices)$/), bing: LS('aitab-b', 'queries', /^(queries|pages)$/) };
  var AIQ = '', AISEL = null, AIPENDING = null;
  var AI_TABS = { google: [['pages', 'Pages'], ['countries', 'Countries'], ['devices', 'Devices']], bing: [['queries', 'Grounding queries'], ['pages', 'Cited pages']] };
  function aiReq(method, url, body) {
    if (MOCK) {
      mockReady = mockReady || new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '/search-console/js/sc-mock.js?v=' + Date.now(); s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      return mockReady.then(function () { return window.SC_MOCK_AI(method, url, body); });
    }
    return fetch(url, { method: method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function loadAi() {
    aiReq('GET', '/api/search-console-ai').then(function (d) { AI = d || {}; renderAi(); })
      .catch(function (e) { AI = {}; $('gs-aimeta').textContent = 'Could not load the imported AI numbers (' + e.message + ').'; });
  }
  chips('gs-aisrc', 's', AISRC, function (v) { AISRC = v; SAVE('aisrc', v); AISEL = null; AIQ = ''; $('gs-aiq').value = ''; renderAi(true); });
  $('gs-aiimp').onclick = function () { var box = $('gs-aiimport'), open = box.hidden; box.hidden = !open; this.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  $('gs-aitab').onclick = function (e) { var b = e.target.closest('button[data-t]'); if (!b) return; AITAB[AISRC] = b.dataset.t; SAVE('aitab-' + AISRC.charAt(0), b.dataset.t); renderAiTable(true); };
  var aiqT = 0;
  $('gs-aiq').addEventListener('input', function () { clearTimeout(aiqT); aiqT = setTimeout(function () { AIQ = $('gs-aiq').value.trim().toLowerCase(); renderAiTable(true); }, 120); });
  (function aiPanel() { if (!window.MESPanel) { setTimeout(aiPanel, 60); return; } window.MESPanel.add($('gs-aisec'), { bar: $('gs-aibtns'), onChange: function () { if (AI) drawAiChart(); } }); })();

  // import: drop / choose files -> preview of what was recognised -> Save
  function readFiles(list) {
    var files = Array.prototype.slice.call(list || []).slice(0, 30);
    if (!files.length) return;
    $('gs-aiprev').innerHTML = '<p class="tu-note">Reading ' + files.length + ' file' + (files.length > 1 ? 's' : '') + '…</p>';
    Promise.all(files.map(function (f) {
      if (f.size > 40e6) return Promise.resolve([{ kind: 'unknown', name: f.name, rows: [], label: 'too large (over 40 MB), skipped' }]);
      return f.arrayBuffer().then(function (b) { return MESSCAI.parseFile({ name: f.name, bytes: new Uint8Array(b) }); })
        .catch(function (e) { return [{ kind: 'unknown', name: f.name, rows: [], label: 'could not be read (' + e.message + ')' }]; });
    })).then(function (lists) {
      var tables = [].concat.apply([], lists);
      AIPENDING = MESSCAI.combine(tables);
      var ok = AIPENDING.google || AIPENDING.bing;
      $('gs-aiprev').innerHTML = '<ul class="gs-aifiles">' + tables.map(function (t) {
        var good = t.rows.length && /^[gb]-/.test(t.kind);
        return '<li class="' + (good ? 'ok' : 'skip') + '"><b>' + esc(t.name) + '</b>: ' + esc(t.label) + (good ? ' (' + t.rows.length.toLocaleString() + (t.rows.length === 1 ? ' row)' : ' rows)') : '') + '</li>';
      }).join('') + '</ul>' + (ok ? '<button type="button" class="tu-btn" id="gs-aisave">Save to the dashboard</button> <button type="button" class="tu-btn tu-btn--ghost" id="gs-aicancel">Cancel</button>'
        : '<p class="tu-note">Nothing to import: these are not Generative AI / AI Performance exports (see “How to export them”).</p>');
      if (!ok) return;
      $('gs-aicancel').onclick = function () { AIPENDING = null; $('gs-aiprev').innerHTML = ''; };
      $('gs-aisave').onclick = function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Saving…';
        var jobs = ['google', 'bing'].filter(function (s) { return AIPENDING[s]; }).map(function (s) { var p = Object.assign({}, AIPENDING[s]); delete p.period; return aiReq('POST', '/api/search-console-ai', p); });
        Promise.all(jobs).then(function (res) {
          var first = res[0] && res[0].source;
          $('gs-aiprev').innerHTML = '<p class="gs-aiok">Saved: ' + res.map(function (r) { return (r.source === 'google' ? 'Google' : 'Bing') + ' (' + r.days.toLocaleString() + ' days stored)'; }).join(', ') + '.</p>';
          AIPENDING = null;
          if (first && res.length === 1) { AISRC = first; SAVE('aisrc', first); document.querySelectorAll('#gs-aisrc button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.s === first ? 'true' : 'false'); }); }
          loadAi();
        }).catch(function (e) { btn.disabled = false; btn.textContent = 'Save to the dashboard'; $('gs-aiprev').insertAdjacentHTML('beforeend', '<p class="dn">Could not save: ' + esc(e.message) + '</p>'); });
      };
    });
  }
  $('gs-aifile').onchange = function () { readFiles(this.files); this.value = ''; };
  var drop = $('gs-drop');
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('on'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('on'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); readFiles(e.dataTransfer && e.dataTransfer.files); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('gs-aifile').click(); } });
  document.querySelectorAll('#gs [data-aidel]').forEach(function (b) {
    b.onclick = function () {
      var s = b.dataset.aidel;
      if (!confirm('Remove all imported ' + (s === 'google' ? 'Google AI features' : 'Bing AI Performance') + ' numbers from the dashboard?')) return;
      aiReq('DELETE', '/api/search-console-ai?src=' + s).then(loadAi).catch(function (e) { alert('Could not remove them: ' + e.message); });
    };
  });

  function aiBlob() { return AI && AI[AISRC]; }
  function aiN() { return RANGE === 'today' || RANGE === 'yesterday' ? 1 : +RANGE; }
  // metrics per source: Google = impressions; Bing = citations (index 0) + cited pages per day (index 1, averaged)
  function renderAi(resetPage) {
    if (!AI) return;
    var blob = aiBlob(), meta = $('gs-aimeta');
    $('gs-aitab').innerHTML = AI_TABS[AISRC].map(function (t) { return '<button type="button" class="tu-chip" data-t="' + t[0] + '" aria-pressed="' + (AITAB[AISRC] === t[0]) + '">' + t[1] + '</button>'; }).join('');
    var empty = !blob || !Object.keys(blob.daily || {}).length && !(blob.pages || blob.queries || []).length;
    ['gs-aitiles', 'gs-airead', 'gs-aichart', 'gs-ailegend'].forEach(function (id) { $(id).hidden = empty; });
    $('gs-aisec').querySelector('.gs-aithead').hidden = empty; $('gs-aisec').querySelector('.gs-filter').hidden = empty;
    $('gs-ait').hidden = empty; $('gs-aitnote').hidden = empty;
    if (empty) {
      $('gs-aiold').hidden = true; $('gs-aimore').hidden = true;
      meta.innerHTML = 'No ' + (AISRC === 'google' ? 'Google Generative AI' : 'Bing AI Performance') + ' numbers imported yet. Neither console has an API for these reports: press <b>Import exports…</b>, drop the export file(s) and Save.';
      if ($('gs-aiimport').hidden && !renderAi.opened) { renderAi.opened = true; $('gs-aiimp').click(); }
      return;
    }
    var per = MESSCAI.periods(blob.daily, aiN());
    var bits = [];
    if (per) bits.push((AISRC === 'google' ? 'Impressions in AI Overviews and AI Mode' : 'Citations in Microsoft Copilot and partners') + ': <b>' + (per.start === per.end ? fmtD(per.end) : fmtD(per.start) + ' – ' + fmtD(per.end)) + '</b> (' + (isDay() ? 'the newest day in the export' : 'ends on the newest day in the export') + ')');
    bits.push('imported ' + ago(blob.at) + (blob.imports && blob.imports[0] && blob.imports[0].files.length ? ' from ' + esc(blob.imports[0].files.slice(0, 4).join(', ')) + (blob.imports[0].files.length > 4 ? '…' : '') : ''));
    if (per && per.first) bits.push('stored days ' + fmtD(per.first) + ' – ' + fmtD(per.end));
    if (FILTERS.length) bits.push('the page’s filters do not apply here');
    var stale = per && daysBetween(per.end, DATA ? DATA.today || per.end : per.end) > 7;
    meta.innerHTML = bits.join(' · ') + '.' + (stale ? ' <b>The newest imported day is ' + daysBetween(per.end, DATA.today) + ' days old: import a fresh export.</b>' : '');
    // tiles
    var t = '', has = per && CMP && per.prevFull && per.prev.length;
    if (AISRC === 'google') {
      var ci = per ? MESSCAI.sumOf(blob.daily, per.cur) : 0, pi = per ? MESSCAI.sumOf(blob.daily, per.prev) : 0;
      t += tile(int(ci), 'AI feature impressions', has ? change(ci, pi) : null);
      t += tile(per && per.cur.length ? int(ci / per.cur.length) : '–', 'per day', has ? change(ci / per.cur.length, pi / Math.max(1, per.prev.length)) : null);
      var gt = DATA && gOk() && DATA.google.totals;
      if (gt && gt.i && ci && per && !isDay()) t += '<div class="tu-stat" title="AI feature impressions as a share of all Google web impressions in the range above (the two ranges can end on different days)"><div class="tu-stat__value">≈ ' + pctTxt(ci / gt.i) + '</div><div class="tu-stat__label">of Google web impressions</div></div>';
      t += tile(int((blob.pages || []).length), 'pages shown in AI features', null);
    } else {
      var cc = per ? MESSCAI.sumOf(blob.daily, per.cur, 0) : 0, pc = per ? MESSCAI.sumOf(blob.daily, per.prev, 0) : 0;
      var cp = per && per.cur.length ? MESSCAI.sumOf(blob.daily, per.cur, 1) / per.cur.length : 0, pp = per && per.prev.length ? MESSCAI.sumOf(blob.daily, per.prev, 1) / per.prev.length : 0;
      t += tile(int(cc), 'total citations', has ? change(cc, pc) : null);
      t += tile(cp ? (+cp.toFixed(1)).toLocaleString() : '–', 'avg cited pages per day', has ? change(cp, pp) : null);
      t += tile(int((blob.queries || []).length), 'grounding queries', null);
      t += tile(int((blob.pages || []).length), 'cited pages', null);
    }
    $('gs-aitiles').innerHTML = t;
    // pages still on the old calculator subdomains
    var old = (blob.pages || []).filter(function (r) { return MESSCAI.oldSubdomain(r[0]); });
    if (old.length) {
      var oi = 0, all = 0; old.forEach(function (r) { oi += r[1]; }); (blob.pages || []).forEach(function (r) { all += r[1]; });
      $('gs-aiold').hidden = false;
      $('gs-aiold').innerHTML = '<b>' + old.length.toLocaleString() + ' page' + (old.length > 1 ? 's' : '') + ' in this report still use the old subdomain addresses</b> (' + pctTxt(all ? oi / all : 0) + ' of its ' + (AISRC === 'google' ? 'impressions' : 'citations') +
        ', e.g. ' + esc(old[0][0]) + '). They redirect to the new mes.fm/&lt;slug&gt; pages; the AI features will switch once the search engines have re-crawled them. Marked <span class="gs-oldtag">old address</span> in the Pages table with the new URL.';
    } else $('gs-aiold').hidden = true;
    drawAiChart();
    renderAiTable(resetPage);
  }

  function drawAiChart() {
    var blob = aiBlob(); if (!blob || $('gs-aichart').hidden) return;
    var svg = $('gs-aisvg'), box = $('gs-aichart');
    var per = MESSCAI.periods(blob.daily, isDay() ? 28 : aiN());
    var W = box.clientWidth || 600, H = box.clientHeight || 220, padL = 46, padR = AISRC === 'bing' ? 44 : 12, padT = 10, padB = 22;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var cLine = cssv('--gs-line'), cMuted = cssv('--gs-muted');
    if (!per) { svg.innerHTML = '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="' + cMuted + '" font-size="13">No days in the import (tables only)</text>'; $('gs-airead').innerHTML = ''; $('gs-ailegend').innerHTML = ''; return; }
    var xs = []; for (var d = per.start; d <= per.end; d = addDays(d, 1)) xs.push(d);
    var off = xs.length;
    var V = MESSCAI.val, iw = W - padL - padR, ih = H - padT - padB;
    var X = function (i) { return padL + (xs.length === 1 ? iw / 2 : i / (xs.length - 1) * iw); };
    var mets = AISRC === 'google' ? [[0, 'AI impressions', '--gs-mi']] : [[0, 'Citations', '--gs-b'], [1, 'Cited pages', '--gs-mp']];
    var showPrev = CMP && per.prevFull;
    var at = function (k, m) { var v = blob.daily[k]; return v == null ? null : V(v, m); };
    var scales = mets.map(function (m) {
      var hi = 0; xs.forEach(function (k) { [at(k, m[0]), showPrev ? at(addDays(k, -off), m[0]) : null].forEach(function (v) { if (v != null && v > hi) hi = v; }); });
      hi = hi || 1; var step = Math.pow(10, Math.floor(Math.log10(hi))) || 1, top = Math.ceil(hi / step) * step;
      return { top: top, y: function (v) { return padT + ih - v / top * ih; } };
    });
    var s = '';
    for (var gi = 0; gi <= 4; gi++) {
      var gy = padT + ih * gi / 4;
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="' + cLine + '"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="' + cssv(mets[0][2]) + '">' + short(scales[0].top * (1 - gi / 4)) + '</text>';
      if (mets[1]) s += '<text x="' + (W - padR + 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="start" font-size="11" fill="' + cssv(mets[1][2]) + '">' + (+(scales[1].top * (1 - gi / 4)).toFixed(1)) + '</text>';
    }
    var line = function (get, col, dash, op) {
      var out = '', run = [];
      var flush = function () { if (run.length > 1) out += '<polyline points="' + run.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="' + (dash ? 1.6 : 2.4) + '" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="5 4"' : '') + (op ? ' stroke-opacity="' + op + '"' : '') + '/>'; else if (run.length === 1) out += '<circle cx="' + run[0].split(',')[0] + '" cy="' + run[0].split(',')[1] + '" r="3" fill="' + col + '"/>'; run = []; };
      xs.forEach(function (k, i) { var v = get(k); if (v == null) flush(); else run.push(X(i).toFixed(1) + ',' + v.toFixed(1)); });
      flush(); return out;
    };
    mets.forEach(function (m, mi) {
      var col = cssv(m[2]), y = scales[mi].y;
      if (showPrev) s += line(function (k) { var v = at(addDays(k, -off), m[0]); return v == null ? null : y(v); }, col, true, 0.6);
      s += line(function (k) { var v = at(k, m[0]); return v == null ? null : y(v); }, col, false);
    });
    var every = Math.ceil(xs.length / Math.max(2, Math.floor(iw / 60)));
    xs.forEach(function (k, i) { if (i % every === 0 || xs.length < 3) s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + cMuted + '">' + k.slice(5) + '</text>'; });
    s += '<g id="gs-aimark"></g>';
    svg.innerHTML = s;
    $('gs-ailegend').innerHTML = mets.map(function (m) { return '<span><i class="gs-key" style="border-color:' + cssv(m[2]) + '"></i>' + m[1] + '</span>'; }).join('') +
      (showPrev ? '<span><i class="gs-key gs-key--dash"></i>previous ' + xs.length + ' days</span>' : '') + (isDay() ? '<span>(28 days shown: AI reports have no hours)</span>' : '');
    function mark(i) {
      AISEL = i;
      var k = xs[i], x = X(i), out = '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + padT + '" y2="' + (padT + ih) + '" stroke="' + cMuted + '" stroke-dasharray="3 3"/>';
      var html = '<b class="gs-read__d">' + esc(fmtD(k, W < 560)) + '</b>';
      mets.forEach(function (m, mi) {
        var v = at(k, m[0]);
        if (v != null) out += '<circle cx="' + x.toFixed(1) + '" cy="' + scales[mi].y(v).toFixed(1) + '" r="4.5" fill="' + cssv(m[2]) + '" stroke="' + cssv('--gs-card') + '" stroke-width="2"/>';
        var pv = showPrev ? at(addDays(k, -off), m[0]) : null;
        html += '<span class="gs-read__m on" style="--mc:var(' + m[2] + ')">' + (v == null ? '–' : int(v)) + '<small> ' + (m[0] === 0 && AISRC === 'google' ? 'AI impressions' : m[1].toLowerCase()) + '</small></span>' +
          (showPrev ? '<span class="gs-read__p">vs ' + esc(fmtD(addDays(k, -off), true)) + ': ' + (pv == null ? '–' : int(pv)) + '</span>' : '');
      });
      $('gs-aimark').innerHTML = out; $('gs-airead').innerHTML = html;
    }
    if (AISEL == null || AISEL >= xs.length) { AISEL = xs.length - 1; while (AISEL > 0 && blob.daily[xs[AISEL]] == null) AISEL--; }
    mark(AISEL);
    var pick = function (e) { var r = box.getBoundingClientRect(); var i = xs.length === 1 ? 0 : Math.round(((e.clientX - r.left) / r.width * W - padL) / iw * (xs.length - 1)); mark(Math.max(0, Math.min(xs.length - 1, i))); };
    var down = false, rest = AISEL;
    box.onpointerdown = function (e) { down = true; pick(e); };
    box.onpointermove = function (e) { if (e.pointerType === 'mouse' || down) pick(e); };
    box.onpointerup = box.onpointercancel = function () { down = false; };
    box.onpointerleave = function (e) { down = false; if (e.pointerType === 'mouse') mark(rest); };
    box.tabIndex = 0;
    box.onkeydown = function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); mark(Math.max(0, Math.min(xs.length - 1, AISEL + (e.key === 'ArrowLeft' ? -1 : 1)))); } };
  }
  window.addEventListener('resize', function () { if (AI) drawAiChart(); });

  // a page cell: the URL, its new address when it is still an old subdomain, and an open link
  function aiPageCell(u) {
    var o = MESSCAI.oldSubdomain(u), href = /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, 'mes.fm/');
    var shown = u.replace(/^https?:\/\/(www\.)?/i, '');
    return esc(shown) + '<a class="gs-open" href="' + esc(href) + '" target="_blank" rel="noopener" title="Open the page" aria-label="Open the page">↗</a>' +
      (o ? ' <span class="gs-oldtag" title="Old subdomain: it redirects">old address</span>' + (o.to ? ' <a class="gs-newurl" href="' + esc(o.to) + '" target="_blank" rel="noopener">→ ' + esc(o.to.replace(/^https:\/\//, '')) + '</a>' : '') : '');
  }
  function renderAiTable(resetPage) {
    var blob = aiBlob(); if (!blob) return;
    var tab = AITAB[AISRC], rows = (blob[tab] || []).slice(), tp = blob.tp && blob.tp[tab];
    var max = 1, tot = 0; rows.forEach(function (r) { var v = AISRC === 'bing' && tab === 'queries' ? r[3] : r[1]; max = Math.max(max, v); tot += v; });
    var metric = AISRC === 'google' ? 'Impressions' : 'Citations';
    var bar = function (v) { return '<span class="gs-bar"><i style="width:' + (v / max * 100).toFixed(1) + '%;background:var(' + (AISRC === 'google' ? '--gs-mi' : '--gs-b') + ')"></i></span>' + int(v); };
    var share = function (v) { return tot ? pctTxt(v / tot) : '–'; };
    var cs;
    if (AISRC === 'bing' && tab === 'queries') cs = [
      { k: 'k', t: 'Grounding query', v: function (r) { return r[0]; }, h: function (r) { return esc(r[0]); } },
      { k: 'in', t: 'Intent', v: function (r) { return r[1]; }, h: function (r) { return esc(r[1] || '–'); } },
      { k: 'to', t: 'Topic', v: function (r) { return r[2]; }, h: function (r) { return esc(r[2] || '–'); } },
      { k: 'c', t: 'Citations', v: function (r) { return r[3]; }, h: function (r) { return bar(r[3]); } },
      { k: 'sh', t: 'Citation share', v: function (r) { return r[4]; }, h: function (r) { return r[4] ? (+r[4].toFixed(1)) + '%' : '–'; } },
      { k: 'ap', t: 'Avg cited pages / day', v: function (r) { return r[5]; }, h: function (r) { return r[5] ? (+r[5].toFixed(2)).toString() : '–'; } },
    ];
    else cs = [
      { k: 'k', t: { pages: 'Page', countries: 'Country', devices: 'Device' }[tab], v: function (r) { return r[0]; }, h: function (r) { return tab === 'pages' ? aiPageCell(r[0]) : esc(r[0]); } },
      { k: 'c', t: metric, v: function (r) { return r[1]; }, h: function (r) { return bar(r[1]); } },
      { k: 'sh', t: 'Share', v: function (r) { return r[1]; }, h: function (r) { return share(r[1]); } },
    ];
    var all = rows.length;
    if (AIQ) { var words = AIQ.split(/\s+/); rows = rows.filter(function (r) { var hay = r.join(' ').toLowerCase() + (tab === 'pages' && MESSCAI.oldSubdomain(r[0]) ? ' old address subdomain' : ''); return words.every(function (w) { return hay.indexOf(w) !== -1; }); }); }
    $('gs-aicount').textContent = all ? (AIQ ? rows.length.toLocaleString() + ' of ' + all.toLocaleString() : all.toLocaleString() + ' rows') : '';
    var note = tp ? 'This table covers the exported period ' + fmtD(tp.from) + ' – ' + fmtD(tp.to) + ' (the console export, not the range above).' : 'This table covers the period of the export it came from (the range above does not change it).';
    if (AISRC === 'google') note += ' Google’s AI report has no queries, clicks or positions; these impressions are also inside the normal Web numbers above.';
    else note += ' Bing’s grounding queries are a sample, not every citation.';
    $('gs-aitnote').textContent = note;
    var id = 'gs-ait', st = ST[id] || (ST[id] = { key: 'c', dir: 'desc', all: false });
    if (resetPage) st.all = false;
    if (!cs.some(function (c) { return c.k === st.key; })) { st.key = 'c'; st.dir = 'desc'; }
    st.cols = cs; st.rows = rows;
    draw(id, 'gs-aimore', st, null, all ? 'No rows match the search.' : 'This export had no ' + tab + ' table.');
  }

  if (FILTERS.length && RANGE === '365') { RANGE = '90'; paintRange(); }
  load();
  loadAi();
})();
