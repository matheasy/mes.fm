// MES Ads (private, mes.fm/ads, behind the middleware.js password like /portfolio): AdSense earnings vs Google Ads spend.
// Data: /api/earnings (daily blobs pushed by google-ads/ads-dashboard-*-script.js) and /api/ads-returns. Served as
// earnings/js/earnings.js, not under /ads/, so ad blockers don't block the page's own script.
(function () {
  'use strict';
  var RANGE = '30d';
  try { RANGE = localStorage.getItem('mes-ads:range') || '30d'; } catch (e) {}
  if (!/^(today|yesterday|7d|30d|90d|365d)$/.test(RANGE)) RANGE = '30d';
  var DATA = null, RET = null;
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
    if (shows('tot')) T.push(tile(money(t.rev), 'AdSense earnings'), tile(money(t.spend), 'Google Ads spend'),
      tile((net < 0 ? '−' : '') + money(Math.abs(net)), 'earnings minus spend', net >= 0 ? 'pos' : 'neg'));
    if (shows('pk')) T.push(tile(perK(t.rev, t.pv), 'earned per 1,000 views'), tile(perK(t.spend, t.pv), 'ad spend per 1,000 views'),
      tile((net < 0 ? '−' : '') + perK(Math.abs(net), t.pv), 'net per 1,000 views', net >= 0 ? 'pos' : 'neg'));
    T.push(tile(int(t.pv), 'page views (AdSense)'), tile(int(t.clicks), 'ad clicks bought'), tile(cpc(t.spend, t.clicks), 'average cost per click'),
      tile(t.spend ? (t.rev / t.spend).toFixed(2) + '×' : '–', 'earnings ÷ spend (whole site)'));
    T.push(tile(int(t.imp), 'ad impressions bought'));
    if (MODE === 'both') T.push(tile(t.pv ? (t.clicks / t.pv * 1000).toFixed(1) : '–', 'ad clicks per 1,000 views'));
    $('ad-tiles').innerHTML = T.join('');
    drawChart();

    var ret = {};
    ((RET && RET.rows) || []).forEach(function (r) { ret[r.path] = r; });
    var maxRev = Math.max.apply(null, d.pages.map(function (p) { return p.rev; }).concat([0]));
    table('t-pages', 'm-pages', [
      { k: 'path', t: 'Page', v: function (r) { return r.path; }, h: function (r) { if (r.path.charAt(0) === '(') return '<i>' + esc(r.path) + '</i>'; var u = r.path.charAt(0) === '/' ? r.path : 'https://' + r.path; return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(r.path) + '</a>'; } },
      { k: 'clicks', t: 'Ad clicks', v: function (r) { return r.clicks; }, h: function (r) { return r.clicks ? int(r.clicks) : '–'; }, f: int(t.clicks) },
      { k: 'spend', t: 'Spend', m: 'tot', v: function (r) { return r.spend; }, h: function (r) { return r.spend ? money(r.spend) : '–'; }, f: money(t.spend) },
      { k: 'cpc', t: 'Cost/click', v: function (r) { return r.clicks ? r.spend / r.clicks : 0; }, h: function (r) { return cpc(r.spend, r.clicks); }, f: cpc(t.spend, t.clicks) },
      { k: 'pv', t: 'Page views', v: function (r) { return r.pv; }, h: function (r) { return int(r.pv); }, f: int(t.pv) },
      { k: 'rev', t: 'Earnings', m: 'tot', v: function (r) { return r.rev; }, h: function (r) { return bar(r.rev, maxRev, 'var(--ad-rev)') + money(r.rev); }, f: money(t.rev) },
      { k: 'rpm', t: 'Earned / 1k views', m: 'pk', v: function (r) { return r.pv ? r.rev / r.pv : 0; }, h: function (r) { return perK(r.rev, r.pv); }, f: perK(t.rev, t.pv) },
      { k: 'spk', t: 'Spent / 1k views', m: 'pk', v: function (r) { return r.pv ? r.spend / r.pv : 0; }, h: function (r) { return r.spend ? perK(r.spend, r.pv) : '–'; }, f: perK(t.spend, t.pv) },
      { k: 'npk', t: 'Net / 1k views', m: 'pk', v: function (r) { return r.pv ? (r.rev - r.spend) / r.pv : 0; }, h: function (r) { return signedK(r.rev - r.spend, r.pv); }, f: signedK(t.rev - t.spend, t.pv) },
      { k: 'net', t: 'Earn − spend', m: 'tot', v: function (r) { return r.rev - r.spend; }, h: function (r) { return signed(r.rev - r.spend); }, f: signed(t.rev - t.spend) },
      { k: 'back', t: 'Came back', v: function (r) { var x = ret[r.path]; return x && x.arrivals ? x.returned / x.arrivals : -1; }, h: function (r) { var x = ret[r.path]; return x && x.arrivals ? int(x.returned) + '<small>(' + pct(x.returned, x.arrivals) + ' of ' + int(x.arrivals) + ')</small>' : '–'; } },
    ], d.pages, { sort: 'rev', top: 15, empty: 'No AdSense or Google Ads data for this range yet.',
      foot: true });

    table('t-countries', 'm-countries', [
      { k: 'name', t: 'Country', v: function (r) { return r.name || r.cc; } },
      { k: 'clicks', t: 'Ad clicks', v: function (r) { return r.clicks; }, h: function (r) { return r.clicks ? int(r.clicks) : '–'; }, f: int(t.clicks) },
      { k: 'spend', t: 'Spend', m: 'tot', v: function (r) { return r.spend; }, h: function (r) { return r.spend ? money(r.spend) : '–'; }, f: money(t.spend) },
      { k: 'cpc', t: 'Cost/click', v: function (r) { return r.clicks ? r.spend / r.clicks : 0; }, h: function (r) { return cpc(r.spend, r.clicks); }, f: cpc(t.spend, t.clicks) },
      { k: 'pv', t: 'Page views', v: function (r) { return r.pv; }, h: function (r) { return int(r.pv); }, f: int(t.pv) },
      { k: 'rev', t: 'Earnings', m: 'tot', v: function (r) { return r.rev; }, h: function (r) { return money(r.rev); }, f: money(t.rev) },
      { k: 'rpm', t: 'Earned / 1k views', m: 'pk', v: function (r) { return r.pv ? r.rev / r.pv : 0; }, h: function (r) { return perK(r.rev, r.pv); }, f: perK(t.rev, t.pv) },
      { k: 'spk', t: 'Spent / 1k views', m: 'pk', v: function (r) { return r.pv ? r.spend / r.pv : 0; }, h: function (r) { return r.spend ? perK(r.spend, r.pv) : '–'; }, f: perK(t.spend, t.pv) },
      { k: 'npk', t: 'Net / 1k views', m: 'pk', v: function (r) { return r.pv ? (r.rev - r.spend) / r.pv : 0; }, h: function (r) { return signedK(r.rev - r.spend, r.pv); }, f: signedK(t.rev - t.spend, t.pv) },
      { k: 'net', t: 'Earn − spend', m: 'tot', v: function (r) { return r.rev - r.spend; }, h: function (r) { return signed(r.rev - r.spend); }, f: signed(t.rev - t.spend) },
    ], d.countries, { sort: 'rev', top: 15, foot: true });

    table('t-campaigns', 'm-campaigns', [
      { k: 'name', t: 'Campaign', v: function (r) { return r.name; } },
      { k: 'imp', t: 'Impressions', v: function (r) { return r.imp; }, h: function (r) { return int(r.imp); } },
      { k: 'clicks', t: 'Clicks', v: function (r) { return r.clicks; }, h: function (r) { return int(r.clicks); } },
      { k: 'ctr', t: 'CTR', v: function (r) { return r.imp ? r.clicks / r.imp : 0; }, h: function (r) { return pct(r.clicks, r.imp); } },
      { k: 'spend', t: 'Spend', v: function (r) { return r.spend; }, h: function (r) { return money(r.spend); } },
      { k: 'cpc', t: 'Cost/click', v: function (r) { return r.clicks ? r.spend / r.clicks : 0; }, h: function (r) { return cpc(r.spend, r.clicks); } },
      { k: 'dev', t: 'Clicks by device', v: function (r) { return Object.keys(r.dev || {}).join(','); }, h: function (r) { return Object.keys(r.dev || {}).map(function (k) { return (DEV[k] || k) + ' ' + r.dev[k]; }).join(' · ') || '–'; } },
    ], d.campaigns, { sort: 'spend', top: 15, empty: 'No Google Ads data for this range yet.' });

    table('t-devices', null, [
      { k: 'dev', t: 'Device', v: function (r) { return DEV[r.dev] || r.dev; } },
      { k: 'clicks', t: 'Ad clicks', v: function (r) { return r.clicks; }, h: function (r) { return int(r.clicks); } },
      { k: 'spend', t: 'Spend', v: function (r) { return r.spend; }, h: function (r) { return money(r.spend); } },
      { k: 'pv', t: 'Page views', v: function (r) { return r.pv; }, h: function (r) { return int(r.pv); }, f: int(t.pv) },
      { k: 'rev', t: 'Earnings', m: 'tot', v: function (r) { return r.rev; }, h: function (r) { return money(r.rev); }, f: money(t.rev) },
      { k: 'rpm', t: 'Earned / 1k views', m: 'pk', v: function (r) { return r.pv ? r.rev / r.pv : 0; }, h: function (r) { return perK(r.rev, r.pv); }, f: perK(t.rev, t.pv) },
      { k: 'spk', t: 'Spent / 1k views', m: 'pk', v: function (r) { return r.pv ? r.spend / r.pv : 0; }, h: function (r) { return r.spend ? perK(r.spend, r.pv) : '–'; }, f: perK(t.spend, t.pv) },
      { k: 'npk', t: 'Net / 1k views', m: 'pk', v: function (r) { return r.pv ? (r.rev - r.spend) / r.pv : 0; }, h: function (r) { return signedK(r.rev - r.spend, r.pv); }, f: signedK(t.rev - t.spend, t.pv) },
      { k: 'net', t: 'Earn − spend', m: 'tot', v: function (r) { return r.rev - r.spend; }, h: function (r) { return signed(r.rev - r.spend); } },
    ], d.devices, { sort: 'rev', top: 10 });

    table('t-domains', null, [
      { k: 'dom', t: 'Site', v: function (r) { return r.dom; } },
      { k: 'pv', t: 'Page views', v: function (r) { return r.pv; }, h: function (r) { return int(r.pv); }, f: int(t.pv) },
      { k: 'rev', t: 'Earnings', v: function (r) { return r.rev; }, h: function (r) { return money(r.rev); } },
    ], d.domains, { sort: 'pv', top: 20 });

    // ad visitors who came back (moved here from /stats)
    var rt = (RET && RET.totals) || { arrivals: 0, returned: 0, loyal: 0, returnDays: 0 };
    $('r-tiles').innerHTML = tile(int(rt.arrivals), 'ad visitors (first click)') + tile(pct(rt.returned, rt.arrivals), 'came back at least once') +
      tile(pct(rt.loyal, rt.arrivals), 'came back on 5+ days') + tile(rt.arrivals ? (rt.returnDays / rt.arrivals).toFixed(2) : '0', 'days back per ad visitor');
    $('r-young').textContent = RET && RET.recentArrivals ? RET.recentArrivals.toLocaleString() + ' of these ad visitors arrived in the last 7 days and have had little time to come back, so the newest numbers rise over the following weeks.' : '';
    table('t-returns', 'm-returns', [
      { k: 'path', t: 'Landing page', v: function (r) { return r.path; }, h: function (r) { return '<a href="' + esc(r.path) + '" target="_blank" rel="noopener">' + esc(r.path) + '</a>'; } },
      { k: 'arrivals', t: 'Ad visitors', v: function (r) { return r.arrivals; }, h: function (r) { return int(r.arrivals); } },
      { k: 'ret', t: 'Came back', v: function (r) { return r.arrivals ? r.returned / r.arrivals : 0; }, h: function (r) { return bar(r.returned, r.arrivals, 'var(--ad-rev)') + int(r.returned) + '<small>(' + pct(r.returned, r.arrivals) + ')</small>'; } },
      { k: 'loyal', t: 'Back 5+ days', v: function (r) { return r.arrivals ? r.loyal / r.arrivals : 0; }, h: function (r) { return bar(r.loyal, r.arrivals, 'var(--accent)') + int(r.loyal) + '<small>(' + pct(r.loyal, r.arrivals) + ')</small>'; } },
      { k: 'per', t: 'Days back each', v: function (r) { return r.arrivals ? r.returnDays / r.arrivals : 0; }, h: function (r) { return (r.arrivals ? r.returnDays / r.arrivals : 0).toFixed(2); } },
    ], (RET && RET.rows) || [], { sort: 'arrivals', top: 10, empty: 'No ad visitors recorded yet (counting started Oct 22, 2026).',
      foot: ['Total', int(rt.arrivals), int(rt.returned) + '<small>(' + pct(rt.returned, rt.arrivals) + ')</small>', int(rt.loyal) + '<small>(' + pct(rt.loyal, rt.arrivals) + ')</small>', (rt.arrivals ? rt.returnDays / rt.arrivals : 0).toFixed(2)] });
  }
  function tile(v, label, cls) { return '<div class="tu-stat ' + (cls || '') + '"><div class="tu-stat__value">' + v + '</div><div class="tu-stat__label">' + esc(label) + '</div></div>'; }

  // ---- chart: earnings bars + spend line
  function drawChart() {
    var days = DATA.daily, svg = $('ad-svg'), box = $('ad-chart');
    var W = box.clientWidth || 600, H = box.clientHeight || 200, padL = 46, padB = 22, padT = 8, padR = 8;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    if (!days.length) { svg.innerHTML = '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="currentColor" font-size="13">No data yet</text>'; svg.style.color = 'var(--ad-muted)'; return; }
    var max = 0; days.forEach(function (x) { max = Math.max(max, x.rev, x.spend); });
    max = max || 1;
    var step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step) * step;
    var iw = W - padL - padR, ih = H - padT - padB, bw = iw / days.length;
    var y = function (v) { return padT + ih - v / nice * ih; };
    var css = getComputedStyle($('ad'));
    var cRev = css.getPropertyValue('--ad-rev').trim(), cSp = css.getPropertyValue('--ad-spend').trim(), cLine = css.getPropertyValue('--ad-line').trim(), cMuted = css.getPropertyValue('--ad-muted').trim();
    var s = '';
    for (var g = 0; g <= 4; g++) { var gv = nice * g / 4, gy = y(gv); s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + cLine + '"/><text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="' + cMuted + '">' + axisMoney(gv) + '</text>'; }
    days.forEach(function (x, i) {
      var bx = padL + i * bw + bw * 0.15, bh = Math.max(0, padT + ih - y(x.rev));
      var isToday = x.d === DATA.today;
      s += '<rect x="' + bx.toFixed(1) + '" y="' + y(x.rev).toFixed(1) + '" width="' + Math.max(1, bw * 0.7).toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + cRev + '" rx="1.5"' +
        (isToday ? ' fill-opacity="0.45" stroke="' + cRev + '" stroke-dasharray="3 2"' : '') + '/>';
    });
    var pts = days.map(function (x, i) { return (padL + i * bw + bw / 2).toFixed(1) + ',' + y(x.spend).toFixed(1); });
    var lastToday = days.length > 1 && days[days.length - 1].d === DATA.today;
    var solid = lastToday ? pts.slice(0, -1) : pts;
    if (solid.length > 1) s += '<polyline points="' + solid.join(' ') + '" fill="none" stroke="' + cSp + '" stroke-width="2.2" stroke-linejoin="round"/>';
    if (lastToday) s += '<polyline points="' + pts.slice(-2).join(' ') + '" fill="none" stroke="' + cSp + '" stroke-width="2.2" stroke-dasharray="5 4"/>';
    if (days.length === 1) s += '<circle cx="' + pts[0].split(',')[0] + '" cy="' + pts[0].split(',')[1] + '" r="4" fill="' + cSp + '"/>';
    var every = Math.ceil(days.length / Math.max(2, Math.floor(iw / 60)));
    days.forEach(function (x, i) { if (i % every === 0) s += '<text x="' + (padL + i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + cMuted + '">' + x.d.slice(5) + '</text>'; });
    svg.innerHTML = s;
    box.onmousemove = box.ontouchstart = function (e) {
      var pt = e.touches ? e.touches[0] : e, r = box.getBoundingClientRect();
      var i = Math.floor((pt.clientX - r.left - padL) / bw); if (i < 0 || i >= days.length) { $('ad-tip').style.display = 'none'; return; }
      var x = days[i], tip = $('ad-tip');
      tip.innerHTML = x.d + '<br>Earned ' + money(x.rev) + ' · Spent ' + money(x.spend) + '<br>' + int(x.pv) + ' views · ' + int(x.clicks) + ' ad clicks';
      tip.style.display = 'block';
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(0, pt.clientX - r.left + 10)) + 'px'; tip.style.top = '6px';
    };
    box.onmouseleave = function () { $('ad-tip').style.display = 'none'; };
  }
  window.addEventListener('resize', function () { if (DATA) drawChart(); });
  load();
})();
