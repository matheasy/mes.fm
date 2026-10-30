// MES Ads (private, mes.fm/ads, behind the middleware.js password like /portfolio): AdSense earnings vs Google Ads spend.
// Data: /api/earnings (daily blobs pushed by google-ads/ads-dashboard-*-script.js) and /api/ads-returns. Served as
// earnings/js/earnings.js, not under /ads/, so ad blockers don't block the page's own script.
(function () {
  'use strict';
  try { localStorage.setItem('mes-owner', '1'); } catch (e) {} // this page is behind the password: /stats and /seo then show the private links
  var RANGE = '30d';
  try { RANGE = localStorage.getItem('mes-ads:range') || '30d'; } catch (e) {}
  if (!/^(today|yesterday|7d|30d|90d|365d)$/.test(RANGE)) RANGE = '30d';
  var DATA = null, RET = null, GSC = null, VS = null;
  // Search Console lines on the daily chart (right axis): gc / gi = Google clicks / impressions, bc / bi = Bing (localStorage)
  var SEOL = ['gc'];
  try { var sv = localStorage.getItem('mes-ads:seo'); if (sv != null) SEOL = sv ? sv.split(',') : []; } catch (e) {}
  SEOL = SEOL.filter(function (x) { return /^(gc|gi|bc|bi)$/.test(x); });
  var SEON = { gc: 'Google clicks', gi: 'Google impressions', bc: 'Bing clicks', bi: 'Bing impressions' };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; };
  var $ = function (id) { return document.getElementById(id); };
  // Currency switch: everything arrives in CAD; the chosen currency (CAD / VND / USD, localStorage) is applied when drawing.
  var CUR = 'CAD';
  try { CUR = localStorage.getItem('mes-ads:cur') || 'CAD'; } catch (e) {}
  if (!/^(CAD|VND|USD)$/.test(CUR)) CUR = 'CAD';
  var rate = function () { return (DATA && DATA.fx && DATA.fx.rates && DATA.fx.rates[CUR]) || 1; };
  var SYM = { CAD: 'CA$', USD: 'US$', VND: '₫' };
  var money = function (v) {
    var x = v * rate();
    if (CUR === 'VND') return '₫' + Math.round(x).toLocaleString();
    return SYM[CUR] + (Math.abs(x) < 10 ? x.toFixed(2) : x.toFixed(Math.abs(x) < 1000 ? 1 : 0));
  };
  var axisMoney = function (v) {
    var x = v * rate();
    if (CUR === 'VND') return '₫' + (x >= 1e6 ? +(x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? Math.round(x / 1e3) + 'k' : Math.round(x));
    return '$' + (x < 10 ? x.toFixed(x % 1 ? 2 : 0) : x.toFixed(0));
  };
  var signed = function (v) { return '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v < 0 ? '−' : '') + money(Math.abs(v)) + '</span>'; };
  var int = function (v) { return Math.round(v).toLocaleString(); };
  var pct = function (n, d) { if (!d) return '–'; var p = n / d * 100; return (p >= 10 || p === 0 ? p.toFixed(0) : p.toFixed(1)) + '%'; };
  var rpm = function (rev, pv) { return pv ? money(rev / pv * 1000) : '–'; };
  var cpc = function (spend, clicks) { if (!clicks) return '–'; var x = spend / clicks * rate(); return CUR === 'VND' ? '₫' + Math.round(x).toLocaleString() : SYM[CUR] + x.toFixed(3); };
  // Totals | Per 1,000 views | Both: which money figures the tiles and the page / country / device tables show (localStorage).
  var MODE = 'tot';
  try { MODE = localStorage.getItem('mes-ads:mode') || 'tot'; } catch (e) {}
  if (!/^(tot|pk|both)$/.test(MODE)) MODE = 'tot';
  var shows = function (m) { return !m || MODE === 'both' || MODE === m; };
  // Colour code: revenue blue (.rv), costs red (.cs), profit green / red (.pos / .neg); counts stay neutral.
  var R = function (h) { return h === '–' ? h : '<span class="rv">' + h + '</span>'; };
  var C = function (h) { return h === '–' ? h : '<span class="cs">' + h + '</span>'; };
  var perK = function (v, pv) { return pv ? money(v / pv * 1000) : '–'; };
  var signedK = function (v, pv) { return pv ? signed(v / pv * 1000) : '–'; };
  var DEV = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', tv: 'TV', other: 'Other' };

  // the shell's moon button toggles body.dark-mode: redraw the chart in the other colours
  new MutationObserver(function () { if (DATA) drawChart(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ---- sortable table helper (same idea as /stats: click a heading, ▼ ▲, sticky first column, top N + Show all)
  var TABLES = {};
  function table(id, moreId, cols, rows, opts) {
    var st = TABLES[id] || (TABLES[id] = { key: opts.sort, dir: 'desc', all: false });
    st.cols = cols.filter(function (c) { return shows(c.m); }); st.rows = rows; st.opts = opts; st.moreId = moreId;
    if (!st.cols.some(function (c) { return c.k === st.key; })) { st.key = opts.sort; if (!st.cols.some(function (c) { return c.k === st.key; })) st.key = st.cols[1].k; st.dir = 'desc'; }
    renderTable(id);
  }
  function renderTable(id) {
    var st = TABLES[id], el = $(id), cols = st.cols;
    el.innerHTML = '<thead><tr>' + cols.map(function (c) {
      return '<th data-k="' + c.k + '" class="' + (st.key === c.k ? 'on' : '') + '">' + esc(c.t) + (st.key === c.k ? (st.dir === 'desc' ? ' ▼' : ' ▲') : '') + '</th>';
    }).join('') + '</tr></thead>';
    if (!st.rows.length) { el.innerHTML += '<tbody><tr><td colspan="99" class="empty">' + esc(st.opts.empty || 'No data yet.') + '</td></tr></tbody>'; if (st.moreId) $(st.moreId).hidden = true; attachResizer(el); return; }
    var col = cols.filter(function (c) { return c.k === st.key; })[0] || cols[0];
    var sign = st.dir === 'desc' ? -1 : 1;
    var sorted = st.rows.slice().sort(function (a, b) {
      var va = col.v(a), vb = col.v(b);
      if (typeof va === 'string') return sign * va.localeCompare(vb);
      return sign * ((va || 0) - (vb || 0));
    });
    var n = st.opts.top || 15;
    var shown = st.all ? sorted : sorted.slice(0, n);
    el.innerHTML += '<tbody>' + shown.map(function (r) { return '<tr>' + cols.map(function (c, i) { return '<td' + (i === 0 ? ' class="ad-path" title="' + esc(c.v(r)) + '"' : '') + '>' + (c.h ? c.h(r) : esc(c.v(r))) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>';
    if (st.opts.foot) el.innerHTML += '<tfoot><tr>' + (Array.isArray(st.opts.foot) ? st.opts.foot : st.cols.map(function (c, i) { return i ? (c.f || '') : 'Total'; })).map(function (h) { return '<td>' + h + '</td>'; }).join('') + '</tr></tfoot>';
    attachResizer(el);
    if (st.moreId) {
      var m = $(st.moreId);
      m.hidden = st.rows.length <= n;
      m.textContent = st.all ? 'Show top ' + n : 'Show all (' + st.rows.length + ')';
      m.onclick = function () { st.all = !st.all; renderTable(id); };
    }
  }
  document.addEventListener('click', function (e) {
    var th = e.target.closest('th[data-k]'); if (!th) return;
    var id = th.closest('table').id, st = TABLES[id]; if (!st) return;
    if (st.key === th.dataset.k) st.dir = st.dir === 'desc' ? 'asc' : 'desc';
    else { st.key = th.dataset.k; st.dir = th.dataset.k === st.cols[0].k ? 'asc' : 'desc'; }
    renderTable(id);
  });
  // First column resize (same behaviour as the Page column on /stats): drag the handle on the header's right edge
  // (mouse / touch / pen), arrow keys when focused, double-click or double-tap resets. Width per table in localStorage.
  var lastTap = 0;
  function setColW(el, px, save) {
    var key = 'mes-ads:colw:' + el.id;
    if (px == null) {
      el.classList.remove('w-set'); el.style.removeProperty('--ad-col-w');
      if (save) { try { localStorage.removeItem(key); } catch (e) {} }
      return;
    }
    var max = Math.max(130, el.parentElement.clientWidth - 120);
    var w = Math.round(Math.min(max, Math.max(80, px)));
    el.style.setProperty('--ad-col-w', w + 'px'); el.classList.add('w-set');
    if (save) { try { localStorage.setItem(key, String(w)); } catch (e) {} }
  }
  function attachResizer(el) {
    var th = el.querySelector('thead th'); if (!th) return;
    if (!el.dataset.wRestored) {
      el.dataset.wRestored = '1';
      try { var saved = parseInt(localStorage.getItem('mes-ads:colw:' + el.id), 10); if (saved > 0) setColW(el, saved, false); } catch (e) {}
    }
    var h = document.createElement('span');
    h.className = 'ad-resizer'; h.tabIndex = 0;
    h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical');
    h.setAttribute('aria-label', 'Resize the first column (double-click to reset)');
    h.title = 'Drag to resize this column. Double-click to reset.';
    th.appendChild(h);
    h.addEventListener('click', function (e) { e.stopPropagation(); });
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
      document.body.classList.add('ad-col-resizing'); h.classList.add('dragging');
      function move(ev) { setColW(el, startW + ev.clientX - startX, false); }
      function up(ev) {
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        try { h.releasePointerCapture(ev.pointerId); } catch (err) {}
        document.body.classList.remove('ad-col-resizing'); h.classList.remove('dragging');
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
  function bar(v, max, color) { var w = max ? Math.min(100, v / max * 100) : 0; return '<span class="ad-bar"><i style="width:' + w.toFixed(1) + '%;background:' + color + '"></i></span>'; }

  // ---- data
  function setTabs() { document.querySelectorAll('#ad-tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.r === RANGE ? 'true' : 'false'); }); }
  $('ad-tabs').onclick = function (e) {
    var b = e.target.closest('button[data-r]'); if (!b || b.dataset.r === RANGE) return;
    RANGE = b.dataset.r; try { localStorage.setItem('mes-ads:range', RANGE); } catch (x) {}
    load();
  };
  function setMode() { document.querySelectorAll('#ad-mode button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.m === MODE ? 'true' : 'false'); }); }
  setMode();
  $('ad-mode').onclick = function (e) {
    var b = e.target.closest('button[data-m]'); if (!b || b.dataset.m === MODE) return;
    MODE = b.dataset.m; try { localStorage.setItem('mes-ads:mode', MODE); } catch (x) {}
    setMode(); if (DATA) render();
  };
  function setCur() { document.querySelectorAll('#ad-cur button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.c === CUR ? 'true' : 'false'); }); }
  setCur();
  $('ad-cur').onclick = function (e) {
    var b = e.target.closest('button[data-c]'); if (!b || b.dataset.c === CUR) return;
    CUR = b.dataset.c; try { localStorage.setItem('mes-ads:cur', CUR); } catch (x) {}
    setCur(); if (DATA) render();
  };
  function load() {
    setTabs();
    $('ad-meta').textContent = 'Loading…';
    var retRange = RANGE === 'today' || RANGE === 'yesterday' || RANGE === '7d' ? '7d' : RANGE === '30d' ? '30d' : '90d';
    Promise.all([
      fetch('/api/earnings?range=' + RANGE, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('/api/ads-returns?range=' + retRange).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    ]).then(function (res) {
      DATA = res[0]; RET = res[1];
      render();
      var r0 = RANGE;
      fetch('/api/earnings?gsc=1&range=' + RANGE, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        .then(function (g) { if (r0 !== RANGE) return; GSC = g; render(); });
      if (!VS) loadVs();
    }).catch(function (e) {
      $('ad-meta').textContent = 'Could not load the data (' + e.message + ').';
    });
  }

  function ago(iso) {
    if (!iso) return 'never';
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return m + ' min ago'; if (m < 48 * 60) return Math.round(m / 60) + ' h ago'; return Math.round(m / 1440) + ' days ago';
  }

  // When the accounts' day (Pacific time) ends, like the "today is complete in ..." note on /stats. Redrawn every minute.
  function pacificNow() {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Vancouver', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = +x.value; });
    return p;
  }
  function endsNote() {
    var el = $('ad-ends'); if (!el) return;
    var p = pacificNow();
    var mins = Math.max(1, Math.ceil(((23 - p.hour) * 3600 + (59 - p.minute) * 60 + (60 - p.second)) / 60));
    var end = new Date(Date.now() + mins * 60000);
    var at = ''; try { at = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) {}
    var left = mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min';
    var nextRun = 60 - new Date().getMinutes();
    el.textContent = 'The faded bar and dashed line are today, still filling in: the accounts\' day (midnight to midnight Pacific time) is complete in ' + left +
      (at ? ' (' + at + ' your time)' : '') + '. New numbers arrive every hour (next in about ' + nextRun + ' min); Google itself can lag a few hours.';
  }
  setInterval(endsNote, 60000);

  function render() {
    var d = DATA, t = d.totals, m = d.meta || {};
    $('ad-meta').innerHTML = 'Google Ads data: <b>' + ago(m.gads && m.gads.at) + '</b> · AdSense data: <b>' + ago(m.adsense && m.adsense.at) + '</b> · ' +
      (d.fx && d.fx.rates ? '1 CAD = ' + Math.round(d.fx.rates.VND).toLocaleString() + ' VND = ' + d.fx.rates.USD.toFixed(3) + ' USD' + (d.fx.live ? '' : ' (fallback rate)') : '') +
      '. Both update every hour. AdSense numbers are estimates until the month closes.' +
      (d.from && d.daily.length && d.daily[0].d === d.from && /d$/.test(d.range) ? ' Counting from ' + esc(d.from) + ', the first day with AdSense earnings (older ad spend is left out).' : '');
    endsNote();
    var missing = [];
    if (!m.gads) missing.push('<li><b>Google Ads Script</b> has not sent data yet (Google Ads → Tools → Bulk actions → Scripts, script "MES ads page").</li>');
    if (!m.adsense) missing.push('<li><b>AdSense Apps Script</b> has not sent data yet (script.google.com: run backfill() once, then installTrigger()).</li>');
    $('ad-setup').hidden = !missing.length;
    $('ad-setup').innerHTML = missing.length ? '<h2>Waiting for data</h2><ul>' + missing.join('') + '</ul><p class="tu-note">Both run every hour (resending the last 3 days) and once a day at 6 am (the last 35 days), so a day is filled in or corrected on the next run.</p>' : '';

    var net = t.rev - t.spend;
    var T = [];
    if (shows('tot')) T.push(tile(R(money(t.rev)), 'AdSense earnings'), tile(C(money(t.spend)), 'Google Ads spend'),
      tile((net < 0 ? '−' : '') + money(Math.abs(net)), 'earnings minus spend', net >= 0 ? 'pos' : 'neg'));
    if (shows('pk')) T.push(tile(R(perK(t.rev, t.pv)), 'earned per 1,000 views'), tile(C(perK(t.spend, t.pv)), 'ad spend per 1,000 views'),
      tile((net < 0 ? '−' : '') + perK(Math.abs(net), t.pv), 'net per 1,000 views', net >= 0 ? 'pos' : 'neg'));
    T.push(tile(int(t.pv), 'page views (AdSense)'), tile(int(t.clicks), 'ad clicks bought'), tile(C(cpc(t.spend, t.clicks)), 'average cost per click'),
      tile(t.spend ? (t.rev / t.spend).toFixed(2) + '×' : '–', 'earnings ÷ spend (whole site)', t.spend ? (t.rev >= t.spend ? 'pos' : 'neg') : ''));
    T.push(tile(int(t.imp), 'ad impressions bought'));
    if (MODE === 'both') T.push(tile(t.pv ? (t.clicks / t.pv * 1000).toFixed(1) : '–', 'ad clicks per 1,000 views'));
    $('ad-tiles').innerHTML = T.join('');
    drawChart();
    if (VS) drawVs();

    var ret = {};
    ((RET && RET.rows) || []).forEach(function (r) { ret[r.path] = r; });
    // Search Console columns (organic = Google Search): by landing path and by country (alpha-2)
    var gOk = GSC && GSC.setup;
    var gp = function (path) { return gOk && GSC.pages ? GSC.pages[path] || (path.charAt(0) === '/' ? { c: 0, i: 0 } : null) : null; };
    var gc = function (cc) { return gOk && GSC.countries && cc ? GSC.countries[String(cc).toUpperCase()] || { c: 0, i: 0 } : null; };
    var gTot = function (k) { if (!gOk) return '–'; var sum = 0; (GSC.daily || []).forEach(function (x) { sum += (k === 'c' ? x.gc : x.gi) || 0; }); return int(sum); };
    var sn = [];
    if (!GSC) sn.push('Loading the Search Console numbers…');
    else if (!GSC.setup) sn.push('No Search Console numbers yet (see mes.fm/search-console).');
    else {
      var cv = GSC.cover || {};
      sn.push('Organic = Google Search clicks / impressions (Search Console) for the same days' + (GSC.lastDay ? ', which Google has up to ' + esc(GSC.lastDay) + ' (it lags 2–3 days)' : '') + '.');
      if (cv.from === 'summary') sn.push('For 365 days the page and country columns are Search Console’s own 365-day totals (' + esc(cv.sumStart || '') + ' – ' + esc(cv.sumEnd || '') + ').');
      else if (cv.bDays) sn.push(cv.bDays + ' of these days come from an older, thinner page breakdown (paste the version 3 Search Console script and run backfillDims()).');
      if (SEOL.some(function (x) { return x.charAt(0) === 'b'; })) sn.push(GSC.bingAt ? 'Bing: day totals as last read by the Search Console page (' + ago(GSC.bingAt) + ').' : 'Bing: open mes.fm/search-console once so its Bing numbers are cached.');
    }
    $('ad-seonote').textContent = sn.join(' ');
    var maxRev = Math.max.apply(null, d.pages.map(function (p) { return p.rev; }).concat([0]));
    table('t-pages', 'm-pages', [
      { k: 'path', t: 'Page', v: function (r) { return r.path; }, h: function (r) { if (r.path.charAt(0) === '(') return '<i>' + esc(r.path) + '</i>'; var u = r.path.charAt(0) === '/' ? r.path : 'https://' + r.path; return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(r.path) + '</a>'; } },
      { k: 'clicks', t: 'Ad clicks', v: function (r) { return r.clicks; }, h: function (r) { return r.clicks ? int(r.clicks) : '–'; }, f: int(t.clicks) },
      { k: 'spend', t: 'Spend', m: 'tot', v: function (r) { return r.spend; }, h: function (r) { return r.spend ? C(money(r.spend)) : '–'; }, f: C(money(t.spend)) },
      { k: 'cpc', t: 'Cost/click', v: function (r) { return r.clicks ? r.spend / r.clicks : 0; }, h: function (r) { return C(cpc(r.spend, r.clicks)); }, f: C(cpc(t.spend, t.clicks)) },
      { k: 'pv', t: 'Page views', v: function (r) { return r.pv; }, h: function (r) { return int(r.pv); }, f: int(t.pv) },
      { k: 'rev', t: 'Earnings', m: 'tot', v: function (r) { return r.rev; }, h: function (r) { return bar(r.rev, maxRev, 'var(--ad-rev)') + R(money(r.rev)); }, f: R(money(t.rev)) },
      { k: 'rpm', t: 'Earned / 1k views', m: 'pk', v: function (r) { return r.pv ? r.rev / r.pv : 0; }, h: function (r) { return R(perK(r.rev, r.pv)); }, f: R(perK(t.rev, t.pv)) },
      { k: 'spk', t: 'Spent / 1k views', m: 'pk', v: function (r) { return r.pv ? r.spend / r.pv : 0; }, h: function (r) { return r.spend ? C(perK(r.spend, r.pv)) : '–'; }, f: C(perK(t.spend, t.pv)) },
      { k: 'npk', t: 'Net / 1k views', m: 'pk', v: function (r) { return r.pv ? (r.rev - r.spend) / r.pv : 0; }, h: function (r) { return signedK(r.rev - r.spend, r.pv); }, f: signedK(t.rev - t.spend, t.pv) },
      { k: 'net', t: 'Earn − spend', m: 'tot', v: function (r) { return r.rev - r.spend; }, h: function (r) { return signed(r.rev - r.spend); }, f: signed(t.rev - t.spend) },
      { k: 'oc', t: 'Organic clicks', v: function (r) { var x = gp(r.path); return x ? x.c : -1; }, h: function (r) { var x = gp(r.path); return x ? int(x.c) : '–'; }, f: gTot('c') },
      { k: 'oi', t: 'Organic impr.', v: function (r) { var x = gp(r.path); return x ? x.i : -1; }, h: function (r) { var x = gp(r.path); return x ? int(x.i) : '–'; }, f: gTot('i') },
      { k: 'back', t: 'Came back', v: function (r) { var x = ret[r.path]; return x && x.arrivals ? x.returned / x.arrivals : -1; }, h: function (r) { var x = ret[r.path]; return x && x.arrivals ? int(x.returned) + '<small>(' + pct(x.returned, x.arrivals) + ' of ' + int(x.arrivals) + ')</small>' : '–'; } },
    ], d.pages, { sort: 'rev', top: 15, empty: 'No AdSense or Google Ads data for this range yet.',
      foot: true });

    table('t-countries', 'm-countries', [
      { k: 'name', t: 'Country', v: function (r) { return r.name || r.cc; } },
      { k: 'clicks', t: 'Ad clicks', v: function (r) { return r.clicks; }, h: function (r) { return r.clicks ? int(r.clicks) : '–'; }, f: int(t.clicks) },
      { k: 'spend', t: 'Spend', m: 'tot', v: function (r) { return r.spend; }, h: function (r) { return r.spend ? C(money(r.spend)) : '–'; }, f: C(money(t.spend)) },
      { k: 'cpc', t: 'Cost/click', v: function (r) { return r.clicks ? r.spend / r.clicks : 0; }, h: function (r) { return C(cpc(r.spend, r.clicks)); }, f: C(cpc(t.spend, t.clicks)) },
      { k: 'pv', t: 'Page views', v: function (r) { return r.pv; }, h: function (r) { return int(r.pv); }, f: int(t.pv) },
      { k: 'rev', t: 'Earnings', m: 'tot', v: function (r) { return r.rev; }, h: function (r) { return R(money(r.rev)); }, f: R(money(t.rev)) },
      { k: 'rpm', t: 'Earned / 1k views', m: 'pk', v: function (r) { return r.pv ? r.rev / r.pv : 0; }, h: function (r) { return R(perK(r.rev, r.pv)); }, f: R(perK(t.rev, t.pv)) },
      { k: 'spk', t: 'Spent / 1k views', m: 'pk', v: function (r) { return r.pv ? r.spend / r.pv : 0; }, h: function (r) { return r.spend ? C(perK(r.spend, r.pv)) : '–'; }, f: C(perK(t.spend, t.pv)) },
      { k: 'npk', t: 'Net / 1k views', m: 'pk', v: function (r) { return r.pv ? (r.rev - r.spend) / r.pv : 0; }, h: function (r) { return signedK(r.rev - r.spend, r.pv); }, f: signedK(t.rev - t.spend, t.pv) },
      { k: 'net', t: 'Earn − spend', m: 'tot', v: function (r) { return r.rev - r.spend; }, h: function (r) { return signed(r.rev - r.spend); }, f: signed(t.rev - t.spend) },
      { k: 'oc', t: 'Organic clicks', v: function (r) { var x = gc(r.cc); return x ? x.c : -1; }, h: function (r) { var x = gc(r.cc); return x ? int(x.c) : '–'; }, f: gTot('c') },
      { k: 'oi', t: 'Organic impr.', v: function (r) { var x = gc(r.cc); return x ? x.i : -1; }, h: function (r) { var x = gc(r.cc); return x ? int(x.i) : '–'; }, f: gTot('i') },
    ], d.countries, { sort: 'rev', top: 15, foot: true });

    table('t-campaigns', 'm-campaigns', [
      { k: 'name', t: 'Campaign', v: function (r) { return r.name; } },
      { k: 'imp', t: 'Impressions', v: function (r) { return r.imp; }, h: function (r) { return int(r.imp); } },
      { k: 'clicks', t: 'Clicks', v: function (r) { return r.clicks; }, h: function (r) { return int(r.clicks); } },
      { k: 'ctr', t: 'CTR', v: function (r) { return r.imp ? r.clicks / r.imp : 0; }, h: function (r) { return pct(r.clicks, r.imp); } },
      { k: 'spend', t: 'Spend', v: function (r) { return r.spend; }, h: function (r) { return C(money(r.spend)); } },
      { k: 'cpc', t: 'Cost/click', v: function (r) { return r.clicks ? r.spend / r.clicks : 0; }, h: function (r) { return C(cpc(r.spend, r.clicks)); } },
      { k: 'dev', t: 'Clicks by device', v: function (r) { return Object.keys(r.dev || {}).join(','); }, h: function (r) { return Object.keys(r.dev || {}).map(function (k) { return (DEV[k] || k) + ' ' + r.dev[k]; }).join(' · ') || '–'; } },
    ], d.campaigns, { sort: 'spend', top: 15, empty: 'No Google Ads data for this range yet.' });

    table('t-devices', null, [
      { k: 'dev', t: 'Device', v: function (r) { return DEV[r.dev] || r.dev; } },
      { k: 'clicks', t: 'Ad clicks', v: function (r) { return r.clicks; }, h: function (r) { return int(r.clicks); } },
      { k: 'spend', t: 'Spend', v: function (r) { return r.spend; }, h: function (r) { return C(money(r.spend)); } },
      { k: 'pv', t: 'Page views', v: function (r) { return r.pv; }, h: function (r) { return int(r.pv); }, f: int(t.pv) },
      { k: 'rev', t: 'Earnings', m: 'tot', v: function (r) { return r.rev; }, h: function (r) { return R(money(r.rev)); }, f: R(money(t.rev)) },
      { k: 'rpm', t: 'Earned / 1k views', m: 'pk', v: function (r) { return r.pv ? r.rev / r.pv : 0; }, h: function (r) { return R(perK(r.rev, r.pv)); }, f: R(perK(t.rev, t.pv)) },
      { k: 'spk', t: 'Spent / 1k views', m: 'pk', v: function (r) { return r.pv ? r.spend / r.pv : 0; }, h: function (r) { return r.spend ? C(perK(r.spend, r.pv)) : '–'; }, f: C(perK(t.spend, t.pv)) },
      { k: 'npk', t: 'Net / 1k views', m: 'pk', v: function (r) { return r.pv ? (r.rev - r.spend) / r.pv : 0; }, h: function (r) { return signedK(r.rev - r.spend, r.pv); }, f: signedK(t.rev - t.spend, t.pv) },
      { k: 'net', t: 'Earn − spend', m: 'tot', v: function (r) { return r.rev - r.spend; }, h: function (r) { return signed(r.rev - r.spend); } },
    ], d.devices, { sort: 'rev', top: 10 });

    table('t-domains', null, [
      { k: 'dom', t: 'Site', v: function (r) { return r.dom; } },
      { k: 'pv', t: 'Page views', v: function (r) { return r.pv; }, h: function (r) { return int(r.pv); }, f: int(t.pv) },
      { k: 'rev', t: 'Earnings', v: function (r) { return r.rev; }, h: function (r) { return R(money(r.rev)); } },
    ], d.domains, { sort: 'pv', top: 20 });

    // ad visitors who came back (moved here from /stats)
    var rt = (RET && RET.totals) || { arrivals: 0, returned: 0, loyal: 0, returnDays: 0 };
    $('r-tiles').innerHTML = tile(int(rt.arrivals), 'ad visitors (first click)') + tile(pct(rt.returned, rt.arrivals), 'came back at least once') +
      tile(pct(rt.loyal, rt.arrivals), 'came back on 5+ days') + tile(rt.arrivals ? (rt.returnDays / rt.arrivals).toFixed(2) : '0', 'days back per ad visitor');
    $('r-young').textContent = RET && RET.recentArrivals ? RET.recentArrivals.toLocaleString() + ' of these ad visitors arrived in the last 7 days and have had little time to come back, so the newest numbers rise over the following weeks.' : '';
    table('t-returns', 'm-returns', [
      { k: 'path', t: 'Landing page', v: function (r) { return r.path; }, h: function (r) { return '<a href="' + esc(r.path) + '" target="_blank" rel="noopener">' + esc(r.path) + '</a>'; } },
      { k: 'arrivals', t: 'Ad visitors', v: function (r) { return r.arrivals; }, h: function (r) { return int(r.arrivals); } },
      { k: 'ret', t: 'Came back', v: function (r) { return r.arrivals ? r.returned / r.arrivals : 0; }, h: function (r) { return bar(r.returned, r.arrivals, 'var(--ad-good)') + int(r.returned) + '<small>(' + pct(r.returned, r.arrivals) + ')</small>'; } },
      { k: 'loyal', t: 'Back 5+ days', v: function (r) { return r.arrivals ? r.loyal / r.arrivals : 0; }, h: function (r) { return bar(r.loyal, r.arrivals, 'var(--accent)') + int(r.loyal) + '<small>(' + pct(r.loyal, r.arrivals) + ')</small>'; } },
      { k: 'per', t: 'Days back each', v: function (r) { return r.arrivals ? r.returnDays / r.arrivals : 0; }, h: function (r) { return (r.arrivals ? r.returnDays / r.arrivals : 0).toFixed(2); } },
    ], (RET && RET.rows) || [], { sort: 'arrivals', top: 10, empty: 'No ad visitors recorded yet (counting started Oct 22, 2026).',
      foot: ['Total', int(rt.arrivals), int(rt.returned) + '<small>(' + pct(rt.returned, rt.arrivals) + ')</small>', int(rt.loyal) + '<small>(' + pct(rt.loyal, rt.arrivals) + ')</small>', (rt.arrivals ? rt.returnDays / rt.arrivals : 0).toFixed(2)] });
  }
  function tile(v, label, cls) { return '<div class="tu-stat ' + (cls || '') + '"><div class="tu-stat__value">' + v + '</div><div class="tu-stat__label">' + esc(label) + '</div></div>'; }

  // ---- chart: earnings bars + spend line, Search Console lines on a right axis, chart notes on the x axis
  function niceTop(max) { max = max || 1; var step = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / step) * step; }
  var shortN = function (v) { return v >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'k' : String(Math.round(v)); };
  function paintSeoT() { document.querySelectorAll('#ad-seot button[data-g]').forEach(function (b) { b.setAttribute('aria-pressed', SEOL.indexOf(b.dataset.g) !== -1 ? 'true' : 'false'); }); }
  paintSeoT();
  $('ad-seot').onclick = function (e) {
    var b = e.target.closest('button[data-g]'); if (!b) return;
    var i = SEOL.indexOf(b.dataset.g);
    if (i === -1) SEOL.push(b.dataset.g); else SEOL.splice(i, 1);
    try { localStorage.setItem('mes-ads:seo', SEOL.join(',')); } catch (x) {}
    paintSeoT(); if (DATA) render();
  };
  function drawChart() {
    var days = DATA.daily, svg = $('ad-svg'), box = $('ad-chart');
    var gmap = {};
    ((GSC && GSC.setup && GSC.daily) || []).forEach(function (x) { gmap[x.d] = x; });
    var seo = GSC && GSC.setup ? SEOL.filter(function (k) { return days.some(function (x) { return gmap[x.d] && gmap[x.d][k] != null; }); }) : [];
    var W = box.clientWidth || 600, H = box.clientHeight || 200, padL = 46, padB = 22, padT = 8, padR = seo.length ? 44 : 8;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    if (!days.length) { svg.innerHTML = '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="currentColor" font-size="13">No data yet</text>'; svg.style.color = 'var(--ad-muted)'; return; }
    var max = 0; days.forEach(function (x) { max = Math.max(max, x.rev, x.spend); });
    var nice = niceTop(max);
    var smax = 0; days.forEach(function (x) { var g = gmap[x.d]; if (g) seo.forEach(function (k) { if (g[k] != null) smax = Math.max(smax, g[k]); }); });
    var snice = niceTop(smax);
    var iw = W - padL - padR, ih = H - padT - padB, bw = iw / days.length;
    var y = function (v) { return padT + ih - v / nice * ih; };
    var y2 = function (v) { return padT + ih - v / snice * ih; };
    var css = getComputedStyle($('ad'));
    var cv = function (n) { return css.getPropertyValue(n).trim(); };
    var cRev = cv('--ad-rev'), cSp = cv('--ad-cost'), cLine = cv('--ad-line'), cMuted = cv('--ad-muted');
    var s = '';
    for (var g = 0; g <= 4; g++) {
      var gv = nice * g / 4, gy = y(gv);
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + cLine + '"/><text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="' + cMuted + '">' + axisMoney(gv) + '</text>';
      if (seo.length) s += '<text x="' + (W - padR + 6) + '" y="' + (gy + 4) + '" text-anchor="start" font-size="11" fill="' + (seo.length === 1 ? cv('--ad-' + seo[0]) : cMuted) + '">' + shortN(snice * g / 4) + '</text>';
    }
    days.forEach(function (x, i) {
      var bx = padL + i * bw + bw * 0.15, bh = Math.max(0, padT + ih - y(x.rev));
      var isToday = x.d === DATA.today;
      s += '<rect x="' + bx.toFixed(1) + '" y="' + y(x.rev).toFixed(1) + '" width="' + Math.max(1, bw * 0.7).toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + cRev + '" rx="1.5"' +
        (isToday ? ' fill-opacity="0.45" stroke="' + cRev + '" stroke-dasharray="3 2"' : '') + '/>';
    });
    var cx = function (i) { return padL + i * bw + bw / 2; };
    var pts = days.map(function (x, i) { return cx(i).toFixed(1) + ',' + y(x.spend).toFixed(1); });
    var lastToday = days.length > 1 && days[days.length - 1].d === DATA.today;
    var solid = lastToday ? pts.slice(0, -1) : pts;
    if (solid.length > 1) s += '<polyline points="' + solid.join(' ') + '" fill="none" stroke="' + cSp + '" stroke-width="2.8" stroke-linejoin="round"/>';
    if (lastToday) s += '<polyline points="' + pts.slice(-2).join(' ') + '" fill="none" stroke="' + cSp + '" stroke-width="2.8" stroke-dasharray="5 4"/>';
    if (days.length === 1) s += '<circle cx="' + pts[0].split(',')[0] + '" cy="' + pts[0].split(',')[1] + '" r="4" fill="' + cSp + '"/>';
    // search lines: a gap where Search Console has no number yet (it lags 2-3 days), never a drop to 0
    seo.forEach(function (k) {
      var col = cv('--ad-' + k), dash = k.charAt(0) === 'b' ? ' stroke-dasharray="6 4"' : '', run = [], out = '';
      var flush = function () { if (run.length > 1) out += '<polyline points="' + run.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"' + dash + '/>'; else if (run.length === 1) out += '<circle cx="' + run[0].split(',')[0] + '" cy="' + run[0].split(',')[1] + '" r="2.8" fill="' + col + '"/>'; run = []; };
      days.forEach(function (x, i) { var gx = gmap[x.d]; if (gx && gx[k] != null) run.push(cx(i).toFixed(1) + ',' + y2(gx[k]).toFixed(1)); else flush(); });
      flush(); s += out;
    });
    var every = Math.ceil(days.length / Math.max(2, Math.floor(iw / 60)));
    days.forEach(function (x, i) { if (i % every === 0) s += '<text x="' + cx(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + cMuted + '">' + x.d.slice(5) + '</text>'; });
    if (window.MESNotes) s += window.MESNotes.marks({ days: days.map(function (x) { return x.d; }), X: cx, y0: padT + ih, y1: padT, size: 6 });
    svg.innerHTML = s;
    var at = function (pt) { var r = box.getBoundingClientRect(); var i = Math.floor((pt.clientX - r.left - padL) / bw); return i < 0 || i >= days.length ? -1 : i; };
    box.onmousemove = box.ontouchstart = function (e) {
      var pt = e.touches ? e.touches[0] : e, r = box.getBoundingClientRect();
      var i = at(pt); if (i === -1) { $('ad-tip').style.display = 'none'; return; }
      var x = days[i], tip = $('ad-tip'), gx = gmap[x.d];
      var notes = window.MESNotes ? window.MESNotes.list().filter(function (n) { return n.d === x.d; }) : [];
      tip.innerHTML = x.d + '<br>Earned ' + R(money(x.rev)) + ' · Spent ' + C(money(x.spend)) + '<br>' + int(x.pv) + ' views · ' + int(x.clicks) + ' ad clicks' +
        (gx && gx.gc != null ? '<br>Google search: ' + int(gx.gc) + ' clicks · ' + int(gx.gi) + ' impr.' + (gx.gf ? ' (fresh)' : '') : '') +
        (gx && gx.bc != null && SEOL.some(function (k) { return k.charAt(0) === 'b'; }) ? '<br>Bing: ' + int(gx.bc) + ' clicks · ' + int(gx.bi) + ' impr.' : '') +
        notes.map(function (n) { return '<br>✎ ' + esc(n.t); }).join('');
      tip.style.display = 'block';
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(0, pt.clientX - r.left + 10)) + 'px'; tip.style.top = '6px';
    };
    box.onmouseleave = function () { $('ad-tip').style.display = 'none'; };
    box.oncontextmenu = function (e) { var i = at(e); if (i === -1 || !window.MESNotes) return; e.preventDefault(); $('ad-tip').style.display = 'none'; window.MESNotes.edit(days[i].d); };
    if (window.MESNotes) window.MESNotes.attach(box);
  }
  (function notesHook() {
    if (!window.MESNotes) { setTimeout(notesHook, 80); return; }
    window.MESNotes.on(function () { if (DATA) drawChart(); if (VS) drawVs(); });
    $('ad-notes').onclick = function () { window.MESNotes.manage(); };
  })();

  // ---- Ads vs SEO: one country and / or landing page, per day (api/earnings ?vs=1)
  var VSSEL = { cc: '', page: '', days: '90' };
  try { var vsv = JSON.parse(localStorage.getItem('mes-ads:vs') || 'null'); if (vsv && typeof vsv === 'object') VSSEL = { cc: String(vsv.cc || ''), page: String(vsv.page || ''), days: /^(30|60|90|180)$/.test(vsv.days) ? vsv.days : '90' }; } catch (e) {}
  function fillVsSelects() {
    var cs = $('ad-vscc'), ps = $('ad-vspage');
    var cc = (DATA && DATA.countries || []).filter(function (r) { return r.cc && /^[A-Z]{2}$/i.test(r.cc); });
    if (GSC && GSC.countries) Object.keys(GSC.countries).forEach(function (k) { if (/^[A-Z]{2}$/.test(k) && !cc.some(function (r) { return r.cc.toUpperCase() === k; })) cc.push({ cc: k, name: '', spend: 0 }); });
    var dn = null; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
    var cname = function (r) { if (r.name) return r.name; try { return dn ? dn.of(r.cc.toUpperCase()) : r.cc; } catch (e) { return r.cc; } };
    cc.sort(function (a, b) { return (b.spend > 0) - (a.spend > 0) || cname(a).localeCompare(cname(b)); });
    var spentC = cc.filter(function (r) { return r.spend > 0; }), restC = cc.filter(function (r) { return !(r.spend > 0); });
    var opt = function (v, t) { return '<option value="' + esc(v) + '">' + esc(t) + '</option>'; };
    cs.innerHTML = opt('', 'All countries') + (spentC.length ? '<optgroup label="With ad spend">' + spentC.map(function (r) { return opt(r.cc.toUpperCase(), cname(r)); }).join('') + '</optgroup>' : '') +
      (restC.length ? '<optgroup label="Others">' + restC.map(function (r) { return opt(r.cc.toUpperCase(), cname(r)); }).join('') + '</optgroup>' : '');
    var pages = (DATA && DATA.pages || []).filter(function (r) { return r.path.charAt(0) === '/'; });
    var spentP = pages.filter(function (r) { return r.spend > 0; }).map(function (r) { return r.path; }).sort();
    var restP = pages.filter(function (r) { return !(r.spend > 0); }).map(function (r) { return r.path; }).sort();
    ps.innerHTML = opt('', 'All pages') + (spentP.length ? '<optgroup label="Ad landing pages">' + spentP.map(function (p) { return opt(p, p); }).join('') + '</optgroup>' : '') +
      (restP.length ? '<optgroup label="Other pages">' + restP.slice(0, 300).map(function (p) { return opt(p, p); }).join('') + '</optgroup>' : '');
    [[cs, VSSEL.cc], [ps, VSSEL.page]].forEach(function (x) { if (x[1] && !x[0].querySelector('option[value="' + CSS.escape(x[1]) + '"]')) x[0].insertAdjacentHTML('beforeend', opt(x[1], x[1])); x[0].value = x[1]; });
    $('ad-vsdays').value = VSSEL.days;
  }
  $('ad-vsf').onchange = function () {
    VSSEL = { cc: $('ad-vscc').value, page: $('ad-vspage').value, days: $('ad-vsdays').value };
    try { localStorage.setItem('mes-ads:vs', JSON.stringify(VSSEL)); } catch (e) {}
    loadVs();
  };
  var vsSeq = 0;
  function loadVs() {
    var seq = ++vsSeq;
    $('ad-vsnote').textContent = 'Loading…';
    fetch('/api/earnings?vs=1&days=' + VSSEL.days + (VSSEL.cc ? '&cc=' + VSSEL.cc : '') + (VSSEL.page ? '&page=' + encodeURIComponent(VSSEL.page) : ''), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { if (seq !== vsSeq) return; VS = d; drawVs(); })
      .catch(function (e) { if (seq === vsSeq) $('ad-vsnote').textContent = 'Could not load (' + e.message + ').'; });
  }
  function pctCh(v) { if (v == null || !isFinite(v)) return ''; return ' <small class="' + (v >= 0 ? 'ad-up' : 'ad-dn') + '">' + (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0) + '%</small>'; }
  function drawVs() {
    if (!VS) return;
    fillVsSelects();
    var rows = VS.rows || [], ba = VS.ba || {}, svg = $('ad-vssvg'), box = $('ad-vschart');
    var T = [];
    var sum = function (k) { return rows.reduce(function (t, r) { return t + (r[k] || 0); }, 0); };
    T.push(tile(C(money(sum('spend'))), 'ad spend, ' + VS.days + ' days'), tile(int(sum('adClicks')), 'ad clicks'),
      tile(int(sum('oc')), 'organic clicks'), tile(int(sum('oi')), 'organic impressions'));
    if (ba.before) {
      T.push(tile((+ba.before.cPerDay.toFixed(1)) + ' → ' + (+ba.after.cPerDay.toFixed(1)) + pctCh(ba.clicksChange), 'organic clicks a day, ' + ba.n + ' days before → after ' + ba.start),
        tile(shortN(ba.before.iPerDay) + ' → ' + shortN(ba.after.iPerDay) + pctCh(ba.imprChange), 'organic impressions a day, before → after'));
    }
    $('ad-vstiles').innerHTML = T.join('');
    var n = [];
    if (ba.why === 'no-spend') n.push('No ad spend for this choice in these ' + VS.days + ' days, so there is no before / after.');
    else if (ba.why === 'spend-from-first-day') n.push('Ads ran from the first day shown, so there is no “before”: choose more days.');
    else if (ba.start) n.push('Before / after: the ' + ba.n + ' days before the first ad spend (' + ba.start + ') against the ' + ba.n + ' days from it; a rise can also be the season or Google, so compare with a page or country without ads.');
    if (VS.basis === 'b') n.push('A page in one country comes from Search Console’s page × country × device rows, which leave out small rows: compare the shape, not the level, with the page’s own totals.');
    if (VS.page && VS.cc && VS.campaigns && !VS.campaigns.length) n.push('No campaign points at this page, so ad spend is 0.');
    else if (VS.page && VS.campaigns && VS.campaigns.length) n.push('Campaigns pointing at this page: ' + VS.campaigns.join(', ') + '.');
    if (rows.some(function (r) { return r.ob; })) n.push('Some days use an older, thinner page breakdown (paste the version 3 Search Console script and run backfillDims()).');
    n.push('Organic numbers lag 2–3 days.');
    $('ad-vsnote').textContent = n.join(' ');
    // chart: spend bars (left, money), ad + organic clicks (right), impressions dashed on their own scale
    var W = box.clientWidth || 600, H = box.clientHeight || 200, padL = 46, padR = 40, padB = 22, padT = 8;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    if (!rows.length) { svg.innerHTML = ''; return; }
    var iw = W - padL - padR, ih = H - padT - padB, bw = iw / rows.length;
    var mS = niceTop(Math.max.apply(null, rows.map(function (r) { return r.spend; }).concat([0]))), mC = niceTop(Math.max.apply(null, rows.map(function (r) { return Math.max(r.adClicks || 0, r.oc || 0); }).concat([0])));
    var mI = Math.max.apply(null, rows.map(function (r) { return r.oi || 0; }).concat([1]));
    var css = getComputedStyle($('ad')), cv = function (k) { return css.getPropertyValue(k).trim(); };
    var cx = function (i) { return padL + i * bw + bw / 2; }, ys = function (v) { return padT + ih - v / mS * ih; }, yc = function (v) { return padT + ih - v / mC * ih; }, yi = function (v) { return padT + ih - v / mI * ih * 0.95; };
    var s = '';
    for (var g = 0; g <= 4; g++) {
      var gy = padT + ih * g / 4;
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + cv('--ad-line') + '"/>' +
        '<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="' + cv('--ad-cost') + '">' + axisMoney(mS * (4 - g) / 4) + '</text>' +
        '<text x="' + (W - padR + 6) + '" y="' + (gy + 4) + '" font-size="11" fill="' + cv('--ad-gc') + '">' + shortN(mC * (4 - g) / 4) + '</text>';
    }
    if (ba.start && ba.n) { var si = rows.findIndex(function (r) { return r.d === ba.start; }); if (si > -1) s += '<line x1="' + (padL + si * bw).toFixed(1) + '" x2="' + (padL + si * bw).toFixed(1) + '" y1="' + padT + '" y2="' + (padT + ih) + '" stroke="' + cv('--ad-muted') + '" stroke-dasharray="4 3"/><text x="' + (padL + si * bw + 4).toFixed(1) + '" y="' + (padT + 11) + '" font-size="10.5" fill="' + cv('--ad-muted') + '">first ad spend</text>'; }
    rows.forEach(function (r, i) { if (r.spend > 0) s += '<rect x="' + (padL + i * bw + bw * 0.15).toFixed(1) + '" y="' + ys(r.spend).toFixed(1) + '" width="' + Math.max(1, bw * 0.7).toFixed(1) + '" height="' + Math.max(0, padT + ih - ys(r.spend)).toFixed(1) + '" fill="' + cv('--ad-cost') + '" fill-opacity="0.35" rx="1"/>'; });
    var line = function (key, y, col, dash) {
      var run = [], out = '';
      var flush = function () { if (run.length > 1) out += '<polyline points="' + run.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>'; run = []; };
      rows.forEach(function (r, i) { if (r[key] == null) flush(); else run.push(cx(i).toFixed(1) + ',' + y(r[key]).toFixed(1)); });
      flush(); return out;
    };
    s += line('oi', yi, cv('--ad-gi'), '6 4') + line('adClicks', yc, cv('--ad-cost'), '') + line('oc', yc, cv('--ad-gc'), '');
    var every = Math.ceil(rows.length / Math.max(2, Math.floor(iw / 60)));
    rows.forEach(function (r, i) { if (i % every === 0) s += '<text x="' + cx(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + cv('--ad-muted') + '">' + r.d.slice(5) + '</text>'; });
    if (window.MESNotes) s += window.MESNotes.marks({ days: rows.map(function (r) { return r.d; }), X: cx, y0: padT + ih, y1: padT, size: 6 });
    svg.innerHTML = s;
    var at = function (pt) { var rc = box.getBoundingClientRect(); var i = Math.floor((pt.clientX - rc.left - padL) / bw); return i < 0 || i >= rows.length ? -1 : i; };
    box.onmousemove = box.ontouchstart = function (e) {
      var pt = e.touches ? e.touches[0] : e, rc = box.getBoundingClientRect(), i = at(pt), tip = $('ad-vstip');
      if (i === -1) { tip.style.display = 'none'; return; }
      var r = rows[i];
      tip.innerHTML = r.d + '<br>Spent ' + C(money(r.spend)) + ' · ' + int(r.adClicks) + ' ad clicks<br>Organic: ' + (r.oc == null ? 'no data yet' : int(r.oc) + ' clicks · ' + int(r.oi) + ' impr.' + (r.of ? ' (fresh)' : ''));
      tip.style.display = 'block';
      tip.style.left = Math.min(rc.width - tip.offsetWidth - 4, Math.max(0, pt.clientX - rc.left + 10)) + 'px'; tip.style.top = '6px';
    };
    box.onmouseleave = function () { $('ad-vstip').style.display = 'none'; };
    box.oncontextmenu = function (e) { var i = at(e); if (i === -1 || !window.MESNotes) return; e.preventDefault(); window.MESNotes.edit(rows[i].d); };
    if (window.MESNotes) window.MESNotes.attach(box);
  }
  window.addEventListener('resize', function () { if (DATA) drawChart(); if (VS) drawVs(); });
  // Fill window / Full screen for the chart and every table (main_js/panel-view.js)
  (function panels() {
    if (!window.MESPanel) { setTimeout(panels, 60); return; }
    document.querySelectorAll('#ad .ad-sec').forEach(function (sec) {
      var head = sec.querySelector('.ad-head');
      if (head) window.MESPanel.add(sec, { bar: head, onChange: function () { if (DATA && sec.contains($('ad-chart'))) drawChart(); if (VS && sec.contains($('ad-vschart'))) drawVs(); } });
    });
  })();
  load();
})();
