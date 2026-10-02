/* MES Inflation Calculator (rewrite, 2026-10-02).
   Data: GET /api/inflation (live from World Bank / FRED / StatCan / ONS, edge-cached) with
   data/inflation-data.json as the instant first paint and the offline fallback.
   Charts: Chart.js 4 (responsive, so Wide / Theatre / Expand all just work).
   Old share links (/inflationcalculator/s/<id>, which stored CPI values) are resolved against
   data/legacy-cpi-2019.json; new share links are plain query strings (?c=&s=&from=&to=&amt=). */
(function () {
  'use strict';

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var app = document.getElementById('ic-app');
  if (!app) return;
  var $ = function (s, r) { return (r || app).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || app).querySelectorAll(s)); };

  var el = {
    country: $('#ic-country'), source: $('#ic-source'), gran: $('#ic-gran'), granWrap: $('#ic-gran-wrap'),
    amt: $('#ic-amt'), cur: $('#ic-cur'), from: $('#ic-from'), to: $('#ic-to'), swap: $('#ic-swap'),
    share: $('#ic-share'), reset: $('#ic-reset'), presets: $('#ic-presets'),
    headline: $('#ic-headline'), stats: $('#ic-stats'), sentences: $('#ic-sentences'), note: $('#ic-datanote'),
    tbody: $('#ic-tbody'), thead: $('#ic-thead'), filter: $('#ic-filter'), newest: $('#ic-newest'), csv: $('#ic-csv'),
    sources: $('#ic-sources'), toast: $('#ic-toast')
  };

  var DATA = null, isLive = false, ready = false;
  var byCountry = {};            // name -> [{key, src, entry}]
  var cache = {};                // series cache
  var S = { country: 'United States', src: null, from: null, to: null, amt: 100 };
  var ranges = { infl: 'all', cpi: 'all', worth: 'all' };
  var logs = { cpi: false, worth: false };
  var charts = {};
  var touched = false;           // only write the URL once the person changed something
  var newestFirst = false;
  var srcPinned = false;         // the person chose a data source themselves

  /* ---------- data loading ---------- */
  function fetchJSON(url, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { clearTimeout(t); resolve(d); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function load() {
    var fails = 0;
    function failed() { if (++fails === 2 && !DATA) fatal('The inflation data could not be loaded. Please check your connection and reload.'); }
    fetchJSON('/inflationcalculator/data/inflation-data.json', 15000).then(function (d) { if (!isLive) setData(d, false); }, failed);
    fetchJSON('/api/inflation', 25000).then(function (d) { isLive = true; setData(d, true); }, failed);
  }

  function fatal(msg) {
    el.headline.textContent = msg;
    el.headline.className = 'ic-headline ic-headline--err';
  }

  function setData(d, live) {
    if (!d || d.v !== 2 || !d.sources) return;
    DATA = d;
    byCountry = {};
    var order = ['FRED', 'StatCan', 'UK ONS', 'World Bank'];   // country-specific monthly sources first
    order.forEach(function (key) {
      var src = d.sources[key];
      if (!src) return;
      Object.keys(src.countries).forEach(function (name) {
        (byCountry[name] = byCountry[name] || []).push({ key: key, src: src, entry: src.countries[name] });
      });
    });
    cache = {};
    if (!ready) { init(); } else { revalidate(); render(); }
  }

  /* ---------- series ---------- */
  function entryOf(country, key) {
    var l = byCountry[country] || [];
    for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i];
    return null;
  }

  // One entry (+ granularity) -> aligned arrays. K = year (annual) or month index (monthly).
  function series(country, key, monthly) {
    var ck = country + '|' + key + '|' + (monthly ? 'm' : 'a');
    if (cache[ck]) return cache[ck];
    var e = entryOf(country, key).entry;
    var s = { L: [], K: [], T: [], V: [], step: monthly ? 12 : 1, monthly: monthly, idx: {} };
    function push(l, k, t, v) { s.idx[k] = s.L.length; s.L.push(l); s.K.push(k); s.T.push(t); s.V.push(v); }
    if (monthly && e.m) {
      var p = e.m.s.split('-'), k0 = +p[0] * 12 + (+p[1] - 1);
      e.m.v.forEach(function (v, i) {
        if (v == null) return;
        var k = k0 + i;
        push(MON[k % 12] + ' ' + Math.floor(k / 12), k, Math.floor(k / 12) + (k % 12) / 12, v);
      });
    } else {
      e.a.v.forEach(function (v, i) { if (v != null) { var y = e.a.s + i; push(String(y), y, y, v); } });
      if (e.m) {   // current, unfinished year -> year-to-date average
        var q = e.m.s.split('-'), start = +q[0] * 12 + (+q[1] - 1), last = start + e.m.v.length - 1;
        var ly = Math.floor(last / 12), lastA = e.a.s + e.a.v.length - 1;
        if (ly > lastA) {
          var sum = 0, n = 0;
          for (var k = ly * 12; k <= last; k++) { var v = e.m.v[k - start]; if (v != null) { sum += v; n++; } }
          if (n) push(ly + ' (YTD)', ly, ly, sum / n);
        }
      }
    }
    s.yoy = s.V.map(function (v, i) {
      var j = s.idx[s.K[i] - s.step];
      return j == null ? null : v / s.V[j] - 1;
    });
    cache[ck] = s;
    return s;
  }

  function cur() { return entryOf(S.country, S.src); }
  function curSeries() { return series(S.country, S.src, S.monthly); }

  function nearest(s, k) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < s.K.length; i++) { var d = Math.abs(s.K[i] - k); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  /* ---------- formatting ---------- */
  var fmtCache = {};
  function money(v) {
    var c = cur().entry.cur;
    if (c) {
      try {
        var f = fmtCache[c] || (fmtCache[c] = new Intl.NumberFormat('en', { style: 'currency', currency: c, currencyDisplay: 'symbol' }));
        return f.format(v);
      } catch (e) { /* unknown currency code */ }
    }
    return v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(x, d) { return (x * 100).toLocaleString('en', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) + '%'; }
  function signed(x) { return (x > 0 ? '+' : '') + pct(x); }
  function num(v) { return v.toLocaleString('en', { maximumFractionDigits: 3 }); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function span(from, to) {   // "25 years" / "3 years 4 months"
    var months = Math.round(Math.abs(to - from) * 12);
    var y = Math.floor(months / 12), m = months % 12, out = [];
    if (y) out.push(y + (y === 1 ? ' year' : ' years'));
    if (m) out.push(m + (m === 1 ? ' month' : ' months'));
    return out.join(' ') || 'same period';
  }

  /* ---------- UI population ---------- */
  function fillCountries() {
    var names = Object.keys(byCountry).sort(function (a, b) { return a.localeCompare(b); });
    el.country.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
    el.country.value = S.country;
  }

  function fillSources() {
    var l = byCountry[S.country] || [];
    el.source.innerHTML = l.map(function (o) {
      return '<option value="' + esc(o.key) + '">' + esc(o.src.label) + '</option>';
    }).join('');
    el.source.value = S.src;
    el.source.disabled = l.length < 2;
    var hasM = !!cur().entry.m;
    el.granWrap.hidden = !hasM;
    el.gran.value = S.monthly ? 'monthly' : 'annual';
    el.cur.textContent = cur().entry.cur ? '(' + cur().entry.cur + ')' : '';
  }

  function fillPeriods() {
    var s = curSeries();
    var html = '';
    for (var i = s.L.length - 1; i >= 0; i--) html += '<option value="' + s.K[i] + '">' + s.L[i] + '</option>';
    el.from.innerHTML = html;
    el.to.innerHTML = html;
    el.from.value = String(S.from);
    el.to.value = String(S.to);
  }

  function updatePresets() {
    var s = curSeries(), last = s.K.length - 1, per = s.monthly ? 12 : 1, firstY = s.T[0], lastT = s.T[last];
    var defs = [['1 yr', 1], ['5 yrs', 5], ['10 yrs', 10], ['25 yrs', 25], ['50 yrs', 50], ['Since 2000', 'y2000'], ['Since 1980', 'y1980'], ['Since 1950', 'y1950']];
    el.presets.innerHTML = defs.map(function (d) {
      var ok = typeof d[1] === 'number' ? (lastT - d[1] >= firstY - 0.01) : (+d[1].slice(1) >= firstY);
      return ok ? '<button type="button" class="ic-chip" data-p="' + d[1] + '">' + d[0] + '</button>' : '';
    }).join('');
    el.presets.hidden = !el.presets.innerHTML;
  }

  function applyPreset(p) {
    var s = curSeries(), last = s.K.length - 1, k;
    if (typeof p === 'string' && p.charAt(0) === 'y') {
      var y = +p.slice(1);
      k = s.monthly ? y * 12 : y;
      S.from = s.K[nearest(s, k)];
    } else {
      p = +p;
      var targetT = s.T[last] - p;
      var bi = 0, bd = Infinity;
      for (var i = 0; i < s.T.length; i++) { var d = Math.abs(s.T[i] - targetT); if (d < bd) { bd = d; bi = i; } }
      S.from = s.K[bi];
    }
    S.to = s.K[last];
    el.from.value = String(S.from);
    el.to.value = String(S.to);
    changed();
  }

  /* ---------- state <-> URL ---------- */
  function token(s, k) {
    if (!s.monthly) return String(k);
    return Math.floor(k / 12) + '-' + String(k % 12 + 1).padStart(2, '0');
  }
  function parseToken(t) {
    var m = /^(\d{4})-(\d{1,2})$/.exec(t || '');
    if (m) return { monthly: true, k: +m[1] * 12 + (+m[2] - 1) };
    if (/^\d{4}$/.test(t || '')) return { monthly: false, k: +t };
    return null;
  }
  function shareUrl() {
    var s = curSeries();
    var q = new URLSearchParams();
    q.set('c', S.country); q.set('s', S.src);
    q.set('from', token(s, S.from)); q.set('to', token(s, S.to));
    q.set('amt', String(S.amt));
    return location.origin + '/inflationcalculator?' + q.toString();
  }
  function syncUrl() {
    if (!touched) return;
    try { history.replaceState(null, '', shareUrl().replace(location.origin, '')); } catch (e) { /* ignore */ }
  }

  /* ---------- state validation ---------- */
  function bestSource(country) { return byCountry[country][0].key; }

  function defaultCountry() {
    try {
      var lang = (navigator.languages && navigator.languages[0]) || navigator.language || 'en-US';
      var region = (lang.split('-')[1] || '').toUpperCase();
      if (region && window.Intl && Intl.DisplayNames) {
        var name = new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
        var alias = { 'United States': 'United States', 'United Kingdom': 'United Kingdom', 'Russia': 'Russian Federation', 'South Korea': 'Korea, Rep.', 'Egypt': 'Egypt, Arab Rep.', 'Turkey': 'Turkiye', 'Vietnam': 'Viet Nam', 'Iran': 'Iran, Islamic Rep.', 'Hong Kong SAR China': 'Hong Kong SAR, China', 'Czechia': 'Czechia', 'Slovakia': 'Slovak Republic', 'Venezuela': 'Venezuela, RB', 'Kyrgyzstan': 'Kyrgyz Republic', 'Laos': 'Lao PDR', 'Yemen': 'Yemen, Rep.', 'Gambia': 'Gambia, The', 'Bahamas': 'Bahamas, The', 'Congo - Kinshasa': 'Congo, Dem. Rep.', 'Congo - Brazzaville': 'Congo, Rep.' };
        name = alias[name] || name;
        if (byCountry[name]) return name;
      }
    } catch (e) { /* fall through */ }
    return 'United States';
  }

  // make S consistent with the (possibly newly loaded) data without losing the person's picks
  function revalidate() {
    if (!byCountry[S.country]) S.country = 'United States';
    if (!entryOf(S.country, S.src)) S.src = bestSource(S.country);
    if (S.monthly && !cur().entry.m) S.monthly = false;
    var s = curSeries();
    S.from = s.K[nearest(s, S.from)];
    S.to = s.K[nearest(s, S.to)];
    fillCountries(); fillSources(); fillPeriods(); updatePresets();
  }

  function setDefaults(country) {
    S.country = country;
    S.src = bestSource(country);
    S.monthly = !!cur().entry.m;   // month-by-month where the source has it: "Jan 2000 -> latest month"
    var s = curSeries(), last = s.K.length - 1;
    S.to = s.K[last];
    S.from = s.K[nearestT(s, s.T[0] <= 2000 ? 2000 : s.T[0])];
  }

  /* ---------- init ---------- */
  function init() {
    ready = true;
    var legacyId = (location.pathname.match(/^\/inflationcalculator\/s\/([A-Za-z0-9]+)\/?$/) || [])[1];
    var q = new URLSearchParams(location.search);
    var haveParams = q.get('c') && byCountry[q.get('c')];

    wire();
    if (haveParams) {
      var c = q.get('c');
      S.country = c;
      S.src = entryOf(c, q.get('s')) ? q.get('s') : bestSource(c);
      var f = parseToken(q.get('from')), t = parseToken(q.get('to'));
      if (!f && !t) { setDefaults(c); if (entryOf(c, q.get('s'))) { S.src = q.get('s'); S.monthly = !!cur().entry.m; var s0 = curSeries(); S.to = s0.K[s0.K.length - 1]; S.from = s0.K[nearestT(s0, Math.max(2000, s0.T[0]))]; } finishInit(); return; }
      S.monthly = !!((f && f.monthly) || (t && t.monthly)) && !!cur().entry.m;
      var s = curSeries();
      var a = parseFloat(q.get('amt'));
      S.amt = a > 0 ? a : 100;
      S.from = s.K[nearest(s, f ? (s.monthly === f.monthly ? f.k : (s.monthly ? f.k * 12 : Math.floor(f.k / 12))) : 2000)];
      S.to = s.K[nearest(s, t ? (s.monthly === t.monthly ? t.k : (s.monthly ? t.k * 12 + 11 : Math.floor(t.k / 12))) : 1e9)];
      finishInit();
    } else if (legacyId) {
      setDefaults(defaultCountry());
      finishInit();
      resolveLegacy(legacyId);
    } else {
      setDefaults(defaultCountry());
      finishInit();
    }
  }

  function finishInit() {
    el.amt.value = String(S.amt);
    fillCountries(); fillSources(); fillPeriods(); updatePresets();
    renderSources();
    render();
  }

  // Old shares stored {source, country, indexYear: <CPI value>, comparisonYear: <CPI value>, customInput}
  function resolveLegacy(id) {
    Promise.all([fetchJSON('/api/share?calc=ic&id=' + encodeURIComponent(id), 15000), fetchJSON('/inflationcalculator/data/legacy-cpi-2019.json', 20000)])
      .then(function (r) {
        var sh = typeof r[0] === 'string' ? JSON.parse(r[0]) : r[0], old = r[1];
        var cpis = ((old[sh.source] || {}).data || {})[sh.country];
        if (!cpis || !byCountry[sh.country]) return;
        function yearOf(v) {
          var best = null, bd = Infinity;
          Object.keys(cpis).forEach(function (y) { var d = Math.abs(cpis[y] - parseFloat(v)); if (d < bd) { bd = d; best = +y; } });
          return best;
        }
        var y1 = yearOf(sh.indexYear), y2 = yearOf(sh.comparisonYear);
        S.country = sh.country; S.src = bestSource(sh.country); S.monthly = false;
        S.amt = parseFloat(sh.customInput) > 0 ? parseFloat(sh.customInput) : 100;
        var s = curSeries();
        S.from = s.K[nearest(s, y1)]; S.to = s.K[nearest(s, y2)];
        el.amt.value = String(S.amt);
        touched = true;
        fillCountries(); fillSources(); fillPeriods(); updatePresets(); render();
      }).catch(function () { /* keep defaults */ });
  }

  /* ---------- events ---------- */
  var pending = 0;
  function schedule() { clearTimeout(pending); pending = setTimeout(render, 0); }
  function changed() { touched = true; schedule(); }

  function wire() {
    el.country.addEventListener('change', function () {
      var old = curSeries(), tFrom = old.T[old.idx[S.from]], tTo = old.T[old.idx[S.to]];
      var hadM = !!cur().entry.m;
      S.country = el.country.value;
      // keep a source the person picked on purpose; otherwise use the country's best (monthly) one
      if (!(srcPinned && entryOf(S.country, S.src))) S.src = bestSource(S.country);
      if (!cur().entry.m) S.monthly = false;
      else if (!hadM) S.monthly = true;   // came from an annual-only country: monthly is the better default
      remap(old, curSeries(), tFrom, tTo);
      fillSources(); fillPeriods(); updatePresets(); changed();
    });
    el.source.addEventListener('change', function () {
      var old = curSeries(), tFrom = old.T[old.idx[S.from]], tTo = old.T[old.idx[S.to]];
      S.src = el.source.value; srcPinned = true;
      if (S.monthly && !cur().entry.m) S.monthly = false;
      remap(old, curSeries(), tFrom, tTo);
      fillSources(); fillPeriods(); updatePresets(); changed();
    });
    el.gran.addEventListener('change', function () {
      var old = curSeries(), tFrom = old.T[old.idx[S.from]], tTo = old.T[old.idx[S.to]];
      S.monthly = el.gran.value === 'monthly';
      remap(old, curSeries(), tFrom, tTo);
      fillPeriods(); updatePresets(); changed();
    });
    el.from.addEventListener('change', function () { S.from = +el.from.value; changed(); });
    el.to.addEventListener('change', function () { S.to = +el.to.value; changed(); });
    el.swap.addEventListener('click', function () { var t = S.from; S.from = S.to; S.to = t; el.from.value = String(S.from); el.to.value = String(S.to); changed(); });
    el.amt.addEventListener('input', function () { var v = parseFloat(el.amt.value); S.amt = v >= 0 ? v : 0; changed(); });
    el.presets.addEventListener('click', function (e) { var b = e.target.closest('.ic-chip'); if (b) applyPreset(b.getAttribute('data-p')); });
    el.reset.addEventListener('click', function () {
      touched = false; S.amt = 100; el.amt.value = '100'; setDefaults(defaultCountry());
      fillCountries(); fillSources(); fillPeriods(); updatePresets();
      Object.keys(ranges).forEach(function (k) { ranges[k] = 'all'; });
      $$('.ic-range').forEach(function (r) { r.value = 'all'; });
      try { history.replaceState(null, '', '/inflationcalculator'); } catch (e) { /* ignore */ }
      render();
    });
    el.share.addEventListener('click', doShare);

    $$('.ic-range').forEach(function (sel) {
      sel.addEventListener('change', function () { ranges[sel.getAttribute('data-chart')] = sel.value; renderCharts(); });
    });
    $$('.ic-log').forEach(function (cb) {
      cb.addEventListener('change', function () { logs[cb.getAttribute('data-chart')] = cb.checked; renderCharts(); });
    });
    $$('.ic-expand').forEach(function (b) { b.addEventListener('click', function () { toggleFull(b.closest('.ic-card')); }); });
    $$('.ic-png').forEach(function (b) { b.addEventListener('click', function () { savePng(b.getAttribute('data-chart')); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var f = $('.ic-card--full'); if (f) toggleFull(f); } });

    el.filter.addEventListener('input', renderTable);
    el.newest.addEventListener('click', function () { newestFirst = !newestFirst; el.newest.setAttribute('aria-pressed', newestFirst); renderTable(); });
    el.csv.addEventListener('click', downloadCsv);

    if (window.ResizeObserver) {   // width tiers for the CSS (2-column charts from 56em, taller plots from 72em)
      new ResizeObserver(function (es) {
        var em = parseFloat(getComputedStyle(app).fontSize) || 16, w = es[0].contentRect.width / em, v = [];
        if (w >= 56) v.push('m');
        if (w >= 72) v.push('l');
        app.setAttribute('data-w', v.join(' '));
      }).observe(app);
    }
    new MutationObserver(function () { styleCharts(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  // carry the person's From / To across a change of country, source or detail level
  function remap(oldS, newS, tFrom, tTo) {
    var f = tFrom, t = tTo;
    var wasLatest = tTo >= oldS.T[oldS.T.length - 1] - 1e-6;          // To was "now": keep it at the newest period
    if (newS.monthly && !oldS.monthly) { f = Math.floor(tFrom + 1e-6); t = Math.floor(tTo + 1e-6) + 11 / 12; }   // year -> January .. December
    if (!newS.monthly && oldS.monthly) { f = Math.floor(tFrom + 1e-6); t = Math.floor(tTo + 1e-6); }              // month -> its year
    S.from = newS.K[nearestT(newS, f)];
    S.to = wasLatest ? newS.K[newS.K.length - 1] : newS.K[nearestT(newS, t)];
    if (S.from === S.to && newS.K.length > 1) { S.from = newS.K[nearestT(newS, 2000)]; S.to = newS.K[newS.K.length - 1]; }
  }

  function nearestT(s, t) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < s.T.length; i++) { var d = Math.abs(s.T[i] - t); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  function doShare() {
    touched = true; syncUrl();
    var url = shareUrl(), s = curSeries();
    var text = 'Inflation in ' + S.country + ': ' + money(S.amt) + ' in ' + s.L[s.idx[S.from]] + ' is worth ' + money(S.amt * s.V[s.idx[S.to]] / s.V[s.idx[S.from]]) + ' in ' + s.L[s.idx[S.to]];
    if (navigator.share) {
      navigator.share({ title: 'Inflation Calculator by MES', text: text, url: url }).catch(function () { /* cancelled */ });
      return;
    }
    function done() { showToast('Link copied. Anyone who opens it sees these results.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { legacyCopy(url, done); });
    else legacyCopy(url, done);
  }
  function legacyCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { window.prompt('Copy this link:', text); }
    document.body.removeChild(ta);
  }
  var toastTimer;
  function showToast(msg) {
    el.toast.textContent = msg; el.toast.classList.add('ic-toast--on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.toast.classList.remove('ic-toast--on'); }, 3200);
  }

  /* ---------- render ---------- */
  function render() {
    if (!ready || !DATA) return;
    var s = curSeries();
    var i = s.idx[S.from], j = s.idx[S.to];
    if (i == null || j == null || !s.V.length) { fatal('No data for that selection.'); return; }
    var r = s.V[j] / s.V[i];
    var fromL = s.L[i], toL = s.L[j], amt = S.amt;
    var years = Math.abs(s.T[j] - s.T[i]);
    el.headline.className = 'ic-headline';

    if (i === j) {
      el.headline.innerHTML = 'Pick two different periods to see how prices changed.';
      el.stats.innerHTML = '';
      el.sentences.innerHTML = '';
    } else {
      el.headline.innerHTML = '<span class="ic-big">' + esc(money(amt)) + '</span> in <b>' + esc(fromL) + '</b> has the buying power of <span class="ic-big ic-big--out">' + esc(money(amt * r)) + '</span> in <b>' + esc(toL) + '</b>';
      var cagr = years > 0 ? Math.pow(r, 1 / years) - 1 : null;
      var power = 1 / r - 1;
      var tiles = [
        ['Total inflation', signed(r - 1), 'prices ' + (r >= 1 ? 'rose' : 'fell') + ' over ' + span(s.T[i], s.T[j])],
        ['Average per year', cagr == null ? '–' : signed(cagr), 'compound annual rate'],
        ['Buying power of money', signed(power), money(1) + ' in ' + esc(toL) + ' buys what ' + money(1 / r) + ' bought in ' + esc(fromL)],
        ['Price index', num(s.V[i]) + ' → ' + num(s.V[j]), 'CPI, base ' + esc(cur().src.base)]
      ];
      el.stats.innerHTML = tiles.map(function (t) {
        return '<div class="ic-stat"><div class="ic-stat__k">' + t[0] + '</div><div class="ic-stat__v">' + t[1] + '</div><div class="ic-stat__s">' + t[2] + '</div></div>';
      }).join('');
      el.sentences.innerHTML =
        'Using CPI for ' + esc(S.country) + ', the inflation rate between ' + esc(fromL) + ' and ' + esc(toL) + ' is <b>' + signed(r - 1) + '</b>.<br>' +
        '<b>' + esc(money(amt)) + '</b> in ' + esc(fromL) + ' would be worth <b>' + esc(money(amt * r)) + '</b> in ' + esc(toL) + '.<br>' +
        '<b>' + esc(money(amt)) + '</b> in ' + esc(toL) + ' would be worth <b>' + esc(money(amt / r)) + '</b> in ' + esc(fromL) + '.';
    }

    // data note
    var o = cur(), lastL = s.L[s.L.length - 1];
    var upd = DATA.updated ? new Date(DATA.updated).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    el.note.innerHTML = 'Source: <a href="' + esc(o.src.url) + '" target="_blank" rel="noopener">' + esc(o.src.label) + '</a> · latest data: <b>' + esc(lastL) + '</b> · ' +
      (isLive ? 'fetched live from the publisher' + (upd ? ' (' + upd + ')' : '') : 'saved copy from ' + esc(upd || 'earlier') + ' (live refresh in progress)') +
      (o.src.stale ? ' · <span class="ic-warn">this source is temporarily showing its last saved copy</span>' : '');

    renderCharts();
    renderTable();
    syncUrl();
  }

  function renderSources() {
    el.sources.innerHTML = Object.keys(DATA.sources).map(function (k) {
      var s = DATA.sources[k];
      return '<li><b>' + esc(s.label) + '</b> (' + esc(s.freq) + ', base ' + esc(s.base) + '): ' + esc(s.note) + ' <a href="' + esc(s.url) + '" target="_blank" rel="noopener">Open source</a></li>';
    }).join('');
  }

  /* ---------- charts ---------- */
  var palette = function () {
    var dark = document.body.classList.contains('dark-mode');
    return dark ? { grid: 'rgba(255,255,255,.13)', text: '#cfcfcf', bg: '#232323', mark: '#ffd166', red: '#ff6b57', blue: '#6aa8ff', green: '#5fd38a', zero: 'rgba(255,255,255,.55)' }
                : { grid: 'rgba(0,0,0,.09)', text: '#444444', bg: '#ffffff', mark: '#222222', red: '#d92d12', blue: '#2a5bd7', green: '#1c8a3c', zero: '#555555' };
  };

  var markPlugin = {
    id: 'icMarks',
    afterDatasetsDraw: function (chart, args, o) {
      if (!o || !o.items) return;
      var x = chart.scales.x, a = chart.chartArea, c = chart.ctx, p = palette();
      c.save();
      var lastRight = -1e9, row = 0;
      o.items.slice().sort(function (p, q) { return p.i - q.i; }).forEach(function (it) {
        if (it.i < 0 || it.i >= chart.data.labels.length) return;
        var px = x.getPixelForValue(it.i);
        c.strokeStyle = p.mark; c.lineWidth = 1.5; c.setLineDash([4, 3]);
        c.beginPath(); c.moveTo(px, a.top); c.lineTo(px, a.bottom); c.stroke(); c.setLineDash([]);
        c.fillStyle = p.mark; c.font = '600 11px Helvetica, Arial, sans-serif';
        var w = c.measureText(it.t).width, tx = px + w + 8 > a.right ? px - w - 4 : px + 4;
        if (tx < lastRight + 6) row++; else row = 0;     // two labels close together: drop the second one a line
        c.fillText(it.t, tx, a.top + 12 + row * 14);
        lastRight = Math.max(lastRight, tx + w);
      });
      c.restore();
    }
  };
  var bgPlugin = {
    id: 'icBg',
    beforeDraw: function (chart) {
      var c = chart.ctx; c.save(); c.globalCompositeOperation = 'destination-over'; c.fillStyle = palette().bg;
      c.fillRect(0, 0, chart.width, chart.height); c.restore();
    }
  };

  function makeChart(id, fmtY, extra) {
    var canvas = $('#ic-c-' + id);
    if (!canvas || !window.Chart) return null;
    var cfg = {
      type: 'line',
      data: { labels: [], datasets: [{ data: [], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true }] },
      plugins: [markPlugin, bgPlugin],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.parsed.y == null ? '' : fmtY(c.parsed.y); } } },
          icMarks: { items: [] }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0, autoSkip: true } },
          y: { ticks: { callback: function (v) { return fmtY(v, true); } } }
        }
      }
    };
    if (extra) extra(cfg);
    return new Chart(canvas.getContext('2d'), cfg);
  }

  function ensureCharts() {
    if (charts.infl || !window.Chart) return;
    charts.infl = makeChart('infl', function (v) { return v.toFixed(2) + '%'; }, function (cfg) {
      cfg.options.scales.y.ticks.callback = function (v) { return v + '%'; };
      cfg.data.datasets[0].fill = { target: 'origin', above: 'rgba(217,45,18,.14)', below: 'rgba(42,91,215,.16)' };
      cfg.data.datasets[0].segment = { borderColor: function (c) { return c.p1.parsed.y < 0 ? palette().blue : palette().red; } };
    });
    charts.cpi = makeChart('cpi', function (v) { return num(v); });
    charts.worth = makeChart('worth', function (v, tick) { return tick ? shortMoney(v) : money(v); });
    styleCharts();
  }

  function shortMoney(v) {
    var a = Math.abs(v), c = cur().entry.cur;
    var sym = '';
    if (c) { try { sym = new Intl.NumberFormat('en', { style: 'currency', currency: c }).format(0).replace(/[0-9.,\s]/g, ''); } catch (e) { sym = ''; } }
    if (a >= 1e9) return sym + +(v / 1e9).toPrecision(3) + 'B';
    if (a >= 1e6) return sym + +(v / 1e6).toPrecision(3) + 'M';
    if (a >= 1e4) return sym + +(v / 1e3).toPrecision(3) + 'k';
    return sym + (a >= 100 ? Math.round(v) : +v.toPrecision(3));
  }

  function styleCharts() {
    var p = palette();
    var colour = { infl: p.red, cpi: p.blue, worth: p.green };
    Object.keys(charts).forEach(function (id) {
      var ch = charts[id]; if (!ch) return;
      var ds = ch.data.datasets[0];
      ds.borderColor = colour[id];
      ds.backgroundColor = colour[id];
      ch.options.scales.x.ticks.color = p.text;
      ch.options.scales.y.ticks.color = p.text;
      ch.options.scales.y.grid = { color: function (c) { return id === 'infl' && c.tick.value === 0 ? p.zero : p.grid; }, lineWidth: function (c) { return id === 'infl' && c.tick.value === 0 ? 1.5 : 1; } };
      ch.options.scales.x.border = { color: p.grid };
      ch.update('none');
    });
  }

  function windowFor(range, s, i, j) {
    var n = s.L.length, start = 0, end = n;
    if (range === 'sel') {
      var lo = Math.min(i, j), hi = Math.max(i, j), pad = Math.max(3, Math.ceil((hi - lo) * 0.15));
      start = Math.max(0, lo - pad); end = Math.min(n, hi + pad + 1);
    } else if (range !== 'all') {
      start = Math.max(0, n - (+range) * (s.monthly ? 12 : 1) - 1);
    }
    return [start, end];
  }

  function renderCharts() {
    ensureCharts();
    var s = curSeries(), i = s.idx[S.from], j = s.idx[S.to];
    var o = cur();
    var worthBase = S.amt / s.V[i];
    var series3 = {
      infl: s.yoy.map(function (v) { return v == null ? null : v * 100; }),
      cpi: s.V,
      worth: s.V.map(function (v) { return v * worthBase; })
    };
    var titles = {
      infl: S.country + ': inflation rate (' + (s.monthly ? 'year over year, by month' : 'annual average') + ')',
      cpi: S.country + ': consumer price index (' + o.src.base + ')',
      worth: 'What ' + money(S.amt) + ' from ' + s.L[i] + ' is worth in other ' + (s.monthly ? 'months' : 'years')
    };
    Object.keys(series3).forEach(function (id) {
      var t = $('#ic-t-' + id); if (t) t.textContent = titles[id];
      var ch = charts[id]; if (!ch) return;
      var w = windowFor(ranges[id], s, i, j);
      ch.data.labels = s.L.slice(w[0], w[1]);
      ch.data.datasets[0].data = series3[id].slice(w[0], w[1]);
      ch.options.plugins.icMarks.items = [{ i: i - w[0], t: 'From ' + s.L[i] }, { i: j - w[0], t: 'To ' + s.L[j] }];
      if (id !== 'infl') ch.options.scales.y.type = logs[id] ? 'logarithmic' : 'linear';
      ch.options.scales.x.ticks.maxTicksLimit = ch.canvas.clientWidth < 520 ? 5 : 10;
      ch.update('none');
    });
    var msg = $('#ic-chartmsg');
    msg.hidden = !!window.Chart || !!charts.infl;
  }

  /* ---------- expand / PNG ---------- */
  function toggleFull(card) {
    if (!card) return;
    var on = !card.classList.contains('ic-card--full');
    $$('.ic-card--full').forEach(function (c) { if (c !== card) { c.classList.remove('ic-card--full'); } });
    card.classList.toggle('ic-card--full', on);
    document.documentElement.classList.toggle('ic-noscroll', on);
    var b = $('.ic-expand', card);
    b.setAttribute('aria-pressed', on);
    b.querySelector('span').textContent = on ? 'Close' : 'Expand';
    b.querySelector('i').textContent = on ? '✕' : '⤢';
    b.focus({ preventScroll: true });
    requestAnimationFrame(function () { Object.keys(charts).forEach(function (k) { charts[k] && charts[k].resize(); }); });
    if (on) { var sc = $('.ic-tablewrap', card); if (sc) sc.scrollTop = sc.scrollTop; }
  }

  function savePng(id) {
    var ch = charts[id]; if (!ch) return;
    var a = document.createElement('a');
    a.href = ch.toBase64Image('image/png', 1);
    a.download = 'inflation-' + S.country.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + id + '.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  /* ---------- table ---------- */
  function rows() {
    var s = curSeries(), i = s.idx[S.from], base = S.amt / s.V[i], out = [];
    for (var k = 0; k < s.L.length; k++) out.push({ k: k, l: s.L[k], yoy: s.yoy[k], cpi: s.V[k], worth: s.V[k] * base });
    return out;
  }

  function renderTable() {
    var s = curSeries(), i = s.idx[S.from], j = s.idx[S.to];
    var o = cur();
    $('#ic-tabletitle').textContent = 'Worth column: ' + money(S.amt) + ' in ' + s.L[i] + ' expressed in each period’s money';
    var q = el.filter.value.trim().toLowerCase();
    var list = rows().filter(function (r) { return !q || r.l.toLowerCase().indexOf(q) !== -1; });
    if (newestFirst) list.reverse();
    el.thead.innerHTML = '<tr><th>' + (s.monthly ? 'Month' : 'Year') + '</th><th>Inflation rate</th><th>CPI</th><th>Worth of ' + esc(money(S.amt)) + '</th></tr>';
    el.tbody.innerHTML = list.map(function (r) {
      var cls = r.k === i ? ' class="ic-row--from"' : r.k === j ? ' class="ic-row--to"' : '';
      var y = r.yoy == null ? '–' : '<span class="' + (r.yoy < 0 ? 'ic-neg' : '') + '">' + (r.yoy < 0 ? '(' + pct(-r.yoy) + ')' : pct(r.yoy)) + '</span>';
      return '<tr' + cls + '><td>' + esc(r.l) + '</td><td>' + y + '</td><td>' + num(r.cpi) + '</td><td>' + esc(money(r.worth)) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">No rows match “' + esc(q) + '”.</td></tr>';
    $('#ic-rowcount').textContent = list.length.toLocaleString('en') + ' rows';
    void o;
  }

  function downloadCsv() {
    var s = curSeries(), out = ['Period,Inflation rate (%),CPI,Worth of ' + S.amt + ' from ' + s.L[s.idx[S.from]]];
    rows().forEach(function (r) { out.push([r.l, r.yoy == null ? '' : (r.yoy * 100).toFixed(4), r.cpi, r.worth.toFixed(4)].join(',')); });
    var blob = new Blob([out.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inflation-' + S.country.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (s.monthly ? '-monthly' : '-annual') + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- Chart.js loader ---------- */
  function whenChart(cb) {
    if (window.Chart) return cb();
    var tries = 0, t = setInterval(function () {
      if (window.Chart) { clearInterval(t); cb(); return; }
      if (++tries === 40 && !document.getElementById('ic-chartjs-fallback')) {   // jsDelivr slow/blocked -> unpkg
        var sc = document.createElement('script');
        sc.id = 'ic-chartjs-fallback'; sc.src = 'https://unpkg.com/chart.js@4.4.7/dist/chart.umd.js'; document.head.appendChild(sc);
      }
      if (tries > 200) clearInterval(t);
    }, 100);
  }

  load();
  whenChart(function () { if (ready) renderCharts(); });
})();
