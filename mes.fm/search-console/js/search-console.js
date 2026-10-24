// MES Search Console (private, mes.fm/search-console, behind the middleware.js password like /ads): Google Search Console
// and Bing Webmaster numbers for mes.fm. Data: /api/search-console (see mes.fm/api/search-console.js).
(function () {
  'use strict';
  var LS = function (k, d, re) { var v = d; try { v = localStorage.getItem('mes-gsc:' + k) || d; } catch (e) {} return re && !re.test(v) ? d : v; };
  var SAVE = function (k, v) { try { localStorage.setItem('mes-gsc:' + k, v); } catch (e) {} };
  var RANGE = LS('range', '28', /^(7|28|90|365)$/);
  var CMP = LS('cmp', '1') === '1';
  var METRIC = LS('metric', 'c', /^(c|i|ctr|p)$/);
  var TAB = LS('tab', 'queries', /^(queries|pages|countries|devices)$/);
  var TSRC = LS('tsrc', 'google', /^(google|bing)$/);
  var DATA = null, DRILL = null, FILTER = '';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; };
  var int = function (v) { return Math.round(v || 0).toLocaleString(); };
  var ctrOf = function (c, i) { return i ? c / i : 0; };
  var pctTxt = function (x) { x *= 100; return (x >= 10 || x === 0 ? x.toFixed(1) : x.toFixed(2)) + '%'; };
  var posTxt = function (p) { return p ? p.toFixed(1) : '–'; };
  var short = function (v) { return v >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'k' : String(Math.round(v)); };

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

  new MutationObserver(function () { if (DATA) drawChart(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ---- chips
  function chips(id, attr, cur, onPick) {
    var el = $(id);
    var set = function (v) { el.querySelectorAll('button[data-' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset[attr] === v ? 'true' : 'false'); }); };
    set(cur);
    el.onclick = function (e) { var b = e.target.closest('button[data-' + attr + ']'); if (!b) return; set(b.dataset[attr]); onPick(b.dataset[attr]); };
    return set;
  }
  chips('gs-range', 'r', RANGE, function (v) { if (v === RANGE) return; RANGE = v; SAVE('range', v); DRILL = null; load(); });
  chips('gs-metric', 'm', METRIC, function (v) { METRIC = v; SAVE('metric', v); if (DATA) drawChart(); });
  chips('gs-ttab', 't', TAB, function (v) { TAB = v; SAVE('tab', v); if (DATA) renderTable(true); });
  var setSrc = chips('gs-tsrc', 's', TSRC, function (v) { TSRC = v; SAVE('tsrc', v); if (DATA) renderTable(true); });
  var cmpBtn = $('gs-cmp');
  cmpBtn.setAttribute('aria-pressed', CMP ? 'true' : 'false');
  cmpBtn.onclick = function () { CMP = !CMP; SAVE('cmp', CMP ? '1' : '0'); cmpBtn.setAttribute('aria-pressed', CMP ? 'true' : 'false'); if (DATA) render(); };
  var qTimer = 0;
  $('gs-q').addEventListener('input', function () { clearTimeout(qTimer); qTimer = setTimeout(function () { FILTER = $('gs-q').value.trim().toLowerCase(); renderTable(true); }, 120); });

  function load() {
    $('gs-meta').textContent = 'Loading…';
    fetch('/api/search-console?range=' + RANGE, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { DATA = d; render(); if (DRILL) openDrill(DRILL.src, DRILL.u, DRILL.k); })
      .catch(function (e) { $('gs-meta').textContent = 'Could not load the data (' + e.message + ').'; });
  }
  function ago(iso) {
    if (!iso) return 'never';
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return m + ' min ago'; if (m < 48 * 60) return Math.round(m / 60) + ' h ago'; return Math.round(m / 1440) + ' days ago';
  }
  var fmtD = function (s) { if (!s) return '?'; try { return new Date(s + 'T12:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return s; } };

  // ---- setup / not set up yet
  function setupHtml() {
    var g = DATA.google || {}, b = DATA.bing || {}, out = '';
    if (!g.setup) out += '<div class="tu-card gs-setup"><h2>Google Search Console: not set up yet</h2><ol>' +
      '<li>Open <a href="https://script.google.com/" target="_blank" rel="noopener">script.google.com</a> → New project, name it “MES Search Console page”, paste <code>google-ads/search-console-gsc-script.js</code> from the repo over Code.gs.</li>' +
      '<li>Project Settings → tick “Show appsscript.json manifest file in editor”, then put the three <code>oauthScopes</code> from the top of the script into <code>appsscript.json</code>.</li>' +
      '<li>Project Settings → Script properties → <code>INGEST_KEY</code> = the same key as the AdSense script (Vercel env <code>EARNINGS_INGEST_KEY</code>).</li>' +
      '<li>Run <code>backfill()</code> once with the Google account that owns mes.fm in Search Console (16 months of days), then run <code>installTrigger()</code> once (every 6 hours after that).</li>' +
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
  function tiles(id, s) {
    var el = $(id), row = el.parentElement;
    if (!s || !s.setup || s.error || !s.totals) { row.hidden = true; return; }
    row.hidden = false;
    var t = s.totals, p = s.prevTotals || {};
    var hasPrev = p.days > 0;
    el.innerHTML = tile(int(t.c), 'clicks', hasPrev ? change(t.c, p.c) : null) +
      tile(int(t.i), 'impressions', hasPrev ? change(t.i, p.i) : null) +
      tile(pctTxt(ctrOf(t.c, t.i)), 'click-through rate', hasPrev ? change(ctrOf(t.c, t.i), ctrOf(p.c, p.i), 'ctr') : null) +
      tile(posTxt(t.p), 'average position', hasPrev ? change(t.p, p.p, 'pos') : null);
  }

  function render() {
    var g = DATA.google || {}, b = DATA.bing || {};
    var parts = [];
    if (g.setup && !g.error) parts.push('Google: <b>' + (g.cur ? fmtD(g.cur.start) + ' – ' + fmtD(g.cur.end) : 'no days yet') + '</b>, sent ' + ago(g.meta && g.meta.at) + (g.meta && g.meta.property ? ' (' + esc(g.meta.property) + ')' : ''));
    if (b.setup && !b.error && b.cur) parts.push('Bing: <b>' + fmtD(b.cur.start) + ' – ' + fmtD(b.cur.end) + '</b>');
    $('gs-meta').innerHTML = (parts.join(' · ') || 'No data yet.') + '. Each source’s range ends on its newest day (Google lags 2–3 days).' +
      (CMP ? ' Changes compare with the ' + RANGE + ' days before.' : '');
    $('gs-setup').innerHTML = setupHtml();
    tiles('gs-tiles-g', g); tiles('gs-tiles-b', b);
    if (TSRC === 'bing' && !(b.setup && !b.error) && g.setup) { TSRC = 'google'; setSrc('google'); }
    drawChart();
    renderTable(false);
  }

  // ---- chart
  function series(s, prev) {
    var m = {};
    ((prev ? s.prevDaily : s.daily) || []).forEach(function (x) { m[x.d] = x; });
    return m;
  }
  var addDays = function (s, n) { return new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); };
  var val = function (x) { if (!x) return null; if (METRIC === 'c') return x.c; if (METRIC === 'i') return x.i; if (METRIC === 'ctr') return x.i ? x.c / x.i * 100 : null; return x.p || null; };
  function drawChart() {
    var svg = $('gs-svg'), box = $('gs-chart');
    var W = box.clientWidth || 600, H = box.clientHeight || 220, padL = 46, padB = 22, padT = 10, padR = 10;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var css = getComputedStyle($('gs'));
    var col = { g: css.getPropertyValue('--gs-g').trim(), b: css.getPropertyValue('--gs-b').trim() };
    var cLine = css.getPropertyValue('--gs-line').trim(), cMuted = css.getPropertyValue('--gs-muted').trim();
    var src = [];
    var n = +RANGE;
    [['g', DATA.google, 'Google'], ['b', DATA.bing, 'Bing']].forEach(function (x) {
      var s = x[1];
      if (!s || !s.setup || s.error || !s.daily || !s.daily.length) return;
      if (METRIC === 'p' && x[0] === 'b') return; // Bing has no daily position
      src.push({ id: x[0], name: x[2], cur: series(s), prev: series(s, true) });
    });
    // union of dates
    var dset = {};
    src.forEach(function (s) { Object.keys(s.cur).forEach(function (d) { dset[d] = 1; }); });
    var dates = Object.keys(dset).sort();
    var notes = [];
    if (METRIC === 'p' && DATA.bing && DATA.bing.setup && !DATA.bing.error) notes.push('Bing gives no position per day, so only Google is drawn.');
    if (METRIC === 'p') notes.push('Position: lower is better, so the axis is upside down.');
    if (!dates.length) { svg.innerHTML = '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="' + cMuted + '" font-size="13">No data yet</text>'; $('gs-legend').innerHTML = ''; $('gs-cnote').textContent = notes.join(' '); box.onmousemove = null; return; }
    var max = 0, min = Infinity;
    src.forEach(function (s) {
      dates.forEach(function (d) {
        [val(s.cur[d]), CMP ? val(s.prev[addDays(d, -n)]) : null].forEach(function (v) { if (v != null) { max = Math.max(max, v); min = Math.min(min, v); } });
      });
    });
    if (METRIC !== 'p') min = 0;
    if (!(max > min)) { max = (max || 1) * 1.1; min = METRIC === 'p' ? Math.max(0, min - 1) : 0; }
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span))), top = Math.ceil(max / step) * step, bot = METRIC === 'p' ? Math.max(0, Math.floor(min / step) * step) : 0;
    if (top === bot) top = bot + step;
    var iw = W - padL - padR, ih = H - padT - padB;
    var xs = function (i) { return padL + (dates.length === 1 ? iw / 2 : i / (dates.length - 1) * iw); };
    var y = function (v) { var f = (v - bot) / (top - bot); return METRIC === 'p' ? padT + f * ih : padT + ih - f * ih; };
    var lab = function (v) { return METRIC === 'ctr' ? (+v.toFixed(2)) + '%' : METRIC === 'p' ? (+v.toFixed(1)) : short(v); };
    var s = '';
    for (var g = 0; g <= 4; g++) { var gv = bot + (top - bot) * g / 4, gy = y(gv); s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="' + cLine + '"/><text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="' + cMuted + '">' + lab(gv) + '</text>'; }
    var line = function (pts, color, dash) {
      var out = '', run = [];
      var flush = function () { if (run.length > 1) out += '<polyline points="' + run.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="' + (dash ? 1.8 : 2.6) + '" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="5 4" stroke-opacity="0.75"' : '') + '/>'; else if (run.length === 1) out += '<circle cx="' + run[0].split(',')[0] + '" cy="' + run[0].split(',')[1] + '" r="3" fill="' + color + '"/>'; run = []; };
      pts.forEach(function (p) { if (p == null) flush(); else run.push(p); });
      flush(); return out;
    };
    var legend = '';
    src.forEach(function (sr) {
      if (CMP) s += line(dates.map(function (d, i) { var v = val(sr.prev[addDays(d, -n)]); return v == null ? null : xs(i).toFixed(1) + ',' + y(v).toFixed(1); }), col[sr.id], true);
      s += line(dates.map(function (d, i) { var v = val(sr.cur[d]); return v == null ? null : xs(i).toFixed(1) + ',' + y(v).toFixed(1); }), col[sr.id], false);
      legend += '<span><i class="gs-key" style="border-color:' + col[sr.id] + '"></i>' + sr.name + '</span>';
      if (CMP) legend += '<span><i class="gs-key gs-key--dash" style="border-color:' + col[sr.id] + '"></i>' + sr.name + ', previous ' + RANGE + ' days</span>';
    });
    var every = Math.ceil(dates.length / Math.max(2, Math.floor(iw / 64)));
    dates.forEach(function (d, i) { if (i % every === 0 || i === dates.length - 1 && dates.length < 3) s += '<text x="' + xs(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + cMuted + '">' + d.slice(5) + '</text>'; });
    s += '<line id="gs-cross" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + ih) + '" stroke="' + cMuted + '" stroke-dasharray="2 3" visibility="hidden"/>';
    svg.innerHTML = s;
    $('gs-legend').innerHTML = legend;
    $('gs-cnote').textContent = notes.join(' ');
    var tip = $('gs-tip');
    box.onmousemove = box.ontouchstart = function (e) {
      var pt = e.touches ? e.touches[0] : e, r = box.getBoundingClientRect();
      var fx = (pt.clientX - r.left) / r.width * W;
      var i = dates.length === 1 ? 0 : Math.round((fx - padL) / iw * (dates.length - 1));
      if (i < 0 || i >= dates.length) { tip.style.display = 'none'; return; }
      var d = dates[i], h = '<b>' + esc(fmtD(d)) + '</b>';
      src.forEach(function (sr) {
        var x = sr.cur[d], cls = sr.id === 'g' ? 'tg' : 'tb';
        h += '<br><span class="' + cls + '">' + sr.name + '</span> ' + (x ? int(x.c) + ' clicks · ' + int(x.i) + ' impr. · ' + pctTxt(ctrOf(x.c, x.i)) + (x.p ? ' · pos ' + posTxt(x.p) : '') : 'no data');
        if (CMP) { var p = sr.prev[addDays(d, -n)]; if (p) h += '<br><span class="tp">&nbsp;&nbsp;' + esc(fmtD(addDays(d, -n))) + ': ' + int(p.c) + ' clicks · ' + int(p.i) + ' impr.</span>'; }
      });
      tip.innerHTML = h; tip.style.display = 'block';
      var cross = $('gs-cross'); if (cross) { cross.setAttribute('x1', xs(i)); cross.setAttribute('x2', xs(i)); cross.setAttribute('visibility', 'visible'); }
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(0, pt.clientX - r.left + 12)) + 'px';
    };
    box.onmouseleave = function () { tip.style.display = 'none'; var c = $('gs-cross'); if (c) c.setAttribute('visibility', 'hidden'); };
  }
  window.addEventListener('resize', function () { if (DATA) drawChart(); });

  // ---- tables (sortable, filter, top N + Show all, draggable first column)
  var ST = {};
  function cols(kind, label, clickable) {
    var max = 1;
    return function (rows) {
      rows.forEach(function (r) { max = Math.max(max, r.c); });
      var c = [
        { k: 'k', t: label, v: function (r) { return kind === 'countries' ? country(r.k) : kind === 'devices' ? (DEV[r.k] || r.k) : r.k; },
          h: function (r) {
            var name = kind === 'countries' ? country(r.k) : kind === 'devices' ? (DEV[r.k] || r.k) : r.k;
            if (kind === 'pages') { var u = r.u || (r.k.charAt(0) === '/' ? 'https://mes.fm' + r.k : 'https://' + r.k); return esc(name) + '<a class="gs-open" href="' + esc(u) + '" target="_blank" rel="noopener" title="Open the page" aria-label="Open the page">↗</a>'; }
            if (kind === 'queries' && clickable === 'q') return esc(name);
            return esc(name);
          } },
        { k: 'c', t: 'Clicks', v: function (r) { return r.c; }, h: function (r) { return '<span class="gs-bar"><i style="width:' + (r.c / max * 100).toFixed(1) + '%;background:var(--accent)"></i></span>' + int(r.c) + chHtml(r.pi != null ? change(r.c, r.pc) : null); } },
        { k: 'i', t: 'Impressions', v: function (r) { return r.i; }, h: function (r) { return int(r.i) + chHtml(change(r.i, r.pi)); } },
        { k: 'ctr', t: 'CTR', v: function (r) { return ctrOf(r.c, r.i); }, h: function (r) { return pctTxt(ctrOf(r.c, r.i)) + chHtml(r.pi ? change(ctrOf(r.c, r.i), ctrOf(r.pc, r.pi), 'ctr') : null); } },
        { k: 'p', t: 'Position', v: function (r) { return r.p || 999; }, h: function (r) { return posTxt(r.p) + chHtml(r.pp ? change(r.p, r.pp, 'pos') : null); } },
      ];
      if (CMP) c.push({ k: 'dc', t: 'Click change', v: function (r) { return r.c - (r.pc || 0); }, h: function (r) { var d = r.c - (r.pc || 0); return '<span class="' + (d > 0 ? 'up' : d < 0 ? 'dn' : 'flat') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '') + int(Math.abs(d)) + '</span>'; } });
      return c;
    };
  }
  function renderTable(resetPage) {
    var s = TSRC === 'bing' ? DATA.bing : DATA.google;
    var bingOk = DATA.bing && DATA.bing.setup && !DATA.bing.error;
    var label = { queries: 'Query', pages: 'Page', countries: 'Country', devices: 'Device' }[TAB];
    var note = '';
    var rows = [];
    if (!s || !s.setup || s.error) note = (TSRC === 'bing' ? 'Bing' : 'Google') + ' is not set up yet (see above).';
    else if (TSRC === 'bing' && (TAB === 'countries' || TAB === 'devices')) note = 'Bing Webmaster’s API has no country or device split. Switch to Google for these.';
    else {
      rows = (s[TAB] || []).slice();
      if (TSRC === 'bing') note = 'Bing counts queries and pages in weekly buckets, so the range is rounded to whole weeks; positions are Bing’s average impression position.';
      else if (TAB === 'queries') note = 'Search Console hides rare queries for privacy, so these add up to less than the totals.';
      if (TAB === 'pages') note += (note ? ' ' : '') + 'Click a page to see the searches that found it.';
    }
    if (!bingOk && TSRC === 'google') { /* fine */ }
    $('gs-tnote').textContent = note;
    var all = rows.length;
    if (FILTER) {
      var words = FILTER.split(/\s+/);
      rows = rows.filter(function (r) {
        var hay = (r.k + ' ' + (TAB === 'countries' ? country(r.k) : '') + ' ' + (DEV[r.k] || '')).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      });
    }
    $('gs-count').textContent = all ? (FILTER ? rows.length.toLocaleString() + ' of ' + all.toLocaleString() : all.toLocaleString() + ' rows') : '';
    var id = 'gs-t';
    var st = ST[id] || (ST[id] = { key: 'c', dir: 'desc', all: false });
    if (resetPage) st.all = false;
    st.cols = cols(TAB, label)(rows); st.rows = rows; st.kind = TAB; st.src = TSRC;
    if (!st.cols.some(function (c) { return c.k === st.key; })) { st.key = 'c'; st.dir = 'desc'; }
    draw(id, 'gs-more', st, TAB === 'pages' ? function (r) { openDrill(TSRC, r.u || r.k, r.k); } : null, all ? 'No rows match the filter.' : 'No data for this range yet.');
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
      var on = onRow && DRILL && DRILL.k === r.k && DRILL.src === TSRC;
      return '<tr data-i="' + i + '"' + (onRow ? ' class="gs-click' + (on ? ' gs-on' : '') + '" tabindex="0"' : '') + '>' + cs.map(function (c, j) { return '<td' + (j === 0 ? ' class="gs-k" title="' + esc(c.v(r)) + '"' : '') + '>' + c.h(r) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';
    st.shown = shown;
    if (onRow) {
      el.querySelectorAll('tbody tr').forEach(function (tr) {
        var go = function (e) { if (e.target.closest('a')) return; onRow(st.shown[+tr.dataset.i]); el.querySelectorAll('tr.gs-on').forEach(function (x) { x.classList.remove('gs-on'); }); tr.classList.add('gs-on'); };
        tr.addEventListener('click', go);
        tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
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
    else { st.key = th.dataset.k; st.dir = th.dataset.k === 'k' || th.dataset.k === 'p' ? 'asc' : 'desc'; }
    if (el.id === 'gs-t') renderTable(false); else drawDrill();
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

  // ---- page drill-down: the searches that found one page
  function openDrill(src, u, k) {
    DRILL = { src: src, u: u, k: k, rows: null };
    var sec = $('gs-drill');
    sec.hidden = false;
    $('gs-drill-h').textContent = 'Searches that found ' + k;
    $('gs-drill-note').textContent = 'Loading…';
    $('gs-drill-bars').innerHTML = ''; $('gs-dt').innerHTML = ''; $('gs-dmore').hidden = true;
    var want = DRILL;
    fetch('/api/search-console?range=' + RANGE + '&src=' + src + '&page=' + encodeURIComponent(u), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        if (DRILL !== want) return;
        DRILL.rows = d.rows || [];
        $('gs-drill-note').textContent = (src === 'bing' ? 'Bing, weekly buckets. ' : 'Google, the last ' + RANGE + ' days. ') +
          (d.error ? d.error : DRILL.rows.length ? DRILL.rows.length.toLocaleString() + ' queries' + (src === 'google' ? ' (from the top page and query pairs Search Console sends, so rare queries are missing)' : '') + '.' : 'No queries recorded for this page in this range.');
        drawDrill();
        if (sec.getBoundingClientRect().top > window.innerHeight) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (e) { if (DRILL === want) $('gs-drill-note').textContent = 'Could not load (' + e.message + ').'; });
  }
  function drawDrill() {
    if (!DRILL || !DRILL.rows) return;
    var rows = DRILL.rows;
    // a picture first: the top 8 queries as bars (clicks solid, impressions faint)
    var top = rows.slice().sort(function (a, b) { return b.c - a.c || b.i - a.i; }).slice(0, 8);
    var maxI = Math.max.apply(null, top.map(function (r) { return r.i; }).concat([1]));
    $('gs-drill-bars').innerHTML = top.map(function (r) {
      return '<div class="gs-db"><span title="' + esc(r.k) + '">' + esc(r.k) + '</span><span class="gs-db__bar"><b style="width:' + (r.i / maxI * 100).toFixed(1) + '%;background:var(--accent)"></b><i style="width:' + (r.c / maxI * 100).toFixed(1) + '%;background:var(--accent)"></i></span><span>' + int(r.c) + ' / ' + int(r.i) + '</span></div>';
    }).join('') + (top.length ? '<p class="tu-note">Bars: clicks (solid) out of impressions (faint).</p>' : '');
    var st = ST['gs-dt'] || (ST['gs-dt'] = { key: 'c', dir: 'desc', all: false });
    st.cols = cols('queries', 'Query')(rows); st.rows = rows;
    if (!st.cols.some(function (c) { return c.k === st.key; })) st.key = 'c';
    draw('gs-dt', 'gs-dmore', st, null, 'No queries.');
  }
  $('gs-drill-x').onclick = function () { DRILL = null; $('gs-drill').hidden = true; document.querySelectorAll('#gs-t tr.gs-on').forEach(function (x) { x.classList.remove('gs-on'); }); };

  load();
})();
