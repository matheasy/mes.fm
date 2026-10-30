// Local test data for mes.fm/search-console (only loaded on 127.0.0.1 / localhost, where there is no /api): builds a fake
// Redis store shaped like what the Apps Script sends, fake Bing rows, and answers /api/search-console with the REAL
// aggregation code (mes.fm/api/search-console.js, served as a plain file by the local server). Not used on mes.fm.
(function () {
  'use strict';
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function ptDate(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  function addDays(s, n) { return new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  var today = ptDate(Date.now());
  var Q = [['percentage calculator', '/percentagecalculator', 30], ['percent calculator', '/percentagecalculator', 18], ['bmi calculator', '/bmicalculator', 22],
    ['bmi chart', '/bmicalculator/bmi-chart', 9], ['grade calculator', '/gradecalculator', 16], ['final grade calculator', '/gradecalculator', 8],
    ['gpa calculator', '/gpacalculator', 10], ['timer', '/timer', 14], ['online timer', '/timer', 6], ['stopwatch', '/stopwatch', 7],
    ['hutchison effect', '/hutchison', 5], ['cubic formula', '/cubic-formula', 6], ['25%, 30%', '/percentagecalculator', 3],
    ['weighted average calculator', '/weighted-average-calculator', 9], ['mortgage calculator canada', '/mortgagecalculator', 5],
    ['time dilation calculator', '/time-dilation', 4], ['emoji copy', '/emoji', 6], ['latex render', '/latex', 3], ['vat calculator', '/vatcalculator', 4],
    ['inflation calculator', '/inflationcalculator', 5], ['what is 20 percent of 50', '/percentagecalculator', 4], ['speed reader', '/speedreader', 4],
    ['calculadora de porcentaje', '/calculadora-de-porcentaje', 3], ['mandelbrot explorer', '/mandelbrot', 2], ['black hole simulator', '/black-hole-simulator', 2]];
  var C = [['usa', 0.36], ['ind', 0.14], ['can', 0.1], ['gbr', 0.08], ['phl', 0.06], ['aus', 0.05], ['vnm', 0.04], ['deu', 0.04], ['pak', 0.04], ['nga', 0.03], ['zzz', 0.06]];
  var D = [['MOBILE', 0.58], ['DESKTOP', 0.38], ['TABLET', 0.04]];
  var STORE = new Map();
  var set = function (k, v) { STORE.set(k, JSON.stringify(v)); };
  function enc(rows, n) { var dict = {}, s = [], r = []; rows.forEach(function (x) { var row = []; for (var k = 0; k < n; k++) { var v = x[k]; if (!(v in dict)) { dict[v] = s.length; s.push(v); } row.push(dict[v]); } r.push(row.concat(x.slice(n))); }); return { s: s, r: r }; }
  function agg(rows, keyN) { var m = {}; rows.forEach(function (x) { var k = JSON.stringify(x.slice(0, keyN)); var o = m[k] || (m[k] = x.slice(0, keyN).concat([0, 0, 0])); o[keyN] += x[x.length - 3]; o[keyN + 1] += x[x.length - 2]; o[keyN + 2] += x[x.length - 1] * x[x.length - 2]; }); return Object.keys(m).map(function (k) { var o = m[k]; o[keyN + 2] = o[keyN + 1] ? Math.round(o[keyN + 2] / o[keyN + 1] * 100) / 100 : 0; return o; }); }
  var DAYS = 486, QDAYS = 182, qRowsByDay = {};
  for (var k = DAYS - 1; k >= 0; k--) {
    var d = addDays(today, -k), age = k;
    var growth = 0.6 + 0.4 * (1 - age / DAYS), week = [0.8, 1, 1.08, 1.1, 1.05, 0.95, 0.75][new Date(d + 'T12:00:00Z').getUTCDay()];
    var part = k === 0 ? 0.55 : 1; // today is still filling in
    var qrows = [];
    Q.forEach(function (q) {
      C.forEach(function (c) {
        D.forEach(function (dv) {
          var lam = q[2] * c[1] * dv[1] * growth * week * part * 9;
          var imp = Math.round(lam * (0.6 + rnd() * 0.8));
          if (imp < 1) return;
          var ctr = 0.02 + 0.08 * rnd() * (dv[0] === 'DESKTOP' ? 1.3 : 1);
          var clk = Math.round(imp * ctr);
          var pos = Math.round((2 + rnd() * 12 + (c[0] === 'usa' ? 3 : 0)) * 100) / 100;
          qrows.push([q[0], 'https://mes.fm' + q[1], c[0], dv[0], clk, imp, pos]);
        });
      });
    });
    // queries Google hides (anonymised): about 30% more impressions on the pages, not in the query table
    var hidden = qrows.map(function (r) { return [r[1], r[2], r[3], Math.round(r[4] * 0.4), Math.round(r[5] * 0.3), r[6] + 2]; });
    var b = agg(qrows.map(function (r) { return r.slice(1); }).concat(hidden), 3);
    var a = agg(b.map(function (r) { return r.slice(1); }), 2);
    var t = agg(a.map(function (r) { return ['x'].concat(r.slice(2)); }), 1)[0];
    var dev = agg(a.map(function (r) { return r.slice(1); }), 1);
    var blob = { t: [t[1], t[2], t[3]], dev: dev };
    if (k <= 2) blob.f = 1;
    if (k <= 2) {
      blob.h = [];
      var nowH = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
      for (var h = 0; h < 24; h++) {
        if (k === 0 && h > nowH) break;
        var w = 0.5 + Math.sin((h - 6) / 24 * Math.PI * 2) * 0.4 + 0.5;
        blob.h.push([h, Math.round(t[1] / 24 * w), Math.round(t[2] / 24 * w), Math.round((t[3] + rnd() * 2 - 1) * 100) / 100]);
      }
    }
    set('gscdash:day:' + d, blob);
    if (k < QDAYS) {
      set('gscdash:dq:' + d, enc(qrows, 4)); set('gscdash:db:' + d, enc(b, 3)); set('gscdash:dp:' + d, enc(agg(b.map(function (r) { return [r[0]].concat(r.slice(3)); }), 1), 1)); set('gscdash:da:' + d, enc(a, 2));
      qRowsByDay[d] = qrows;
    }
  }
  // range summaries (the real ones come from Search Console over the whole range)
  [7, 28, 90, 365].forEach(function (n) {
    var end = today;
    function sum(s, e) {
      var rows = [];
      for (var x = s; x <= e; x = addDays(x, 1)) (qRowsByDay[x] || []).forEach(function (r) { rows.push(r); });
      var pick = function (keys, lim) { return agg(rows.map(function (r) { return keys.map(function (i) { return r[i]; }).concat(r.slice(4)); }), keys.length).sort(function (p, q) { return q[keys.length] - p[keys.length]; }).slice(0, lim); };
      return { start: s, end: e, pages: pick([1], 500), queries: pick([0], 1000), countries: pick([2], 250), devices: pick([3], 10), pq: pick([1, 0], 1500) };
    }
    var st = addDays(end, -(n - 1));
    set('gscdash:sum:' + n + ':cur', sum(st, end));
    set('gscdash:sum:' + n + ':prev', sum(addDays(st, -n), addDays(st, -1)));
  });
  set('gscdash:meta', { at: new Date(Date.now() - 22 * 60000).toISOString(), property: 'sc-domain:mes.fm', tz: 'America/Los_Angeles', lastDay: today, fresh: addDays(today, -2), days: 5 });
  STORE.set('gscdash:at', new Date(Date.now() - 22 * 60000).toISOString());
  // Bing: day totals up to 3 days ago for ~6 months, weekly query / page buckets for ~6 months
  var BT = [], BQ = [], BP = [];
  for (var j = 3; j < 190; j++) { var dd = addDays(today, -j); BT.push([dd, Math.round(4 + rnd() * 6), Math.round(120 + rnd() * 90)]); }
  BT.sort(function (x, y) { return x[0] < y[0] ? -1 : 1; });
  for (var wk = 0; wk < 26; wk++) {
    var wd = addDays(today, -4 - wk * 7);
    Q.slice(0, 14).forEach(function (q, qi) {
      var imp = Math.round(q[2] * (1 + rnd()) * (wk === 25 ? 0.1 : 1)), clk = Math.round(imp * 0.05 * rnd());
      BQ.push([wd, q[0], clk, imp, Math.round((3 + rnd() * 10) * 10) / 10]);
      if (qi < 8) BP.push([wd, 'https://mes.fm' + q[1], clk, imp, Math.round((3 + rnd() * 10) * 10) / 10]);
    });
  }
  var BING = { GetRankAndTrafficStats: BT, GetQueryStats: BQ, GetPageStats: BP };
  var api = null;
  function loadApi() {
    if (api) return Promise.resolve(api);
    return fetch('/api/search-console.js', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (src) {
      var m = { exports: {} };
      new Function('module', 'exports', 'require', src)(m, m.exports, function () { return {}; });
      api = m.exports; return api;
    });
  }

  // ---- AI search (imported console exports): made-up blobs, answered by the REAL mes.fm/api/search-console-ai.js
  var AISTORE = new Map();
  (function () {
    var gd = [], bd = [];
    for (var k = 479; k >= 2; k--) { var d = addDays(today, -k), g = 0.4 + 0.6 * (1 - k / 480); gd.push([d, Math.round((260 + rnd() * 160) * g)]); }
    for (var j = 179; j >= 3; j--) { var e = addDays(today, -j); bd.push([e, Math.round(30 + rnd() * 40), Math.round((8 + rnd() * 9) * 10) / 10]); }
    var GP = [['https://gradecalculator.mes.fm/', 31000], ['https://percentagecalculator.mes.fm/', 26000], ['https://bmicalculator.mes.fm/bmi-chart.html', 14000],
      ['https://mes.fm/percentagecalculator', 12000], ['https://gpacalculator.mes.fm/', 9000], ['https://mes.fm/gradecalculator', 8000], ['https://timer.mes.fm/', 6500],
      ['https://mes.fm/bmicalculator', 6000], ['https://mes.fm/weighted-average-calculator', 4200], ['https://mortgagecalculator.mes.fm/', 3100], ['https://mes.fm/cubic-formula', 1800],
      ['https://mes.fm/hutchison', 900], ['https://mes.fm/time-dilation', 700], ['https://speedreader.mes.fm/', 500]];
    var GC = [['United States', 70000], ['India', 24000], ['Canada', 15000], ['United Kingdom', 12000], ['Philippines', 9000], ['Australia', 7000], ['Pakistan', 5000], ['Germany', 3000]];
    var BQ = [['grade calculator final exam', 'Informational', 'Education', 412, 23.5, 2.1], ['how to calculate percentage of a number', 'Informational', 'Math', 380, 18.2, 1.8],
      ['bmi chart for adults', 'Informational', 'Health', 220, 11.0, 1.4], ['what grade do i need on my final', 'Transactional', 'Education', 190, 30.1, 1.2],
      ['gpa calculator 4.0 scale', 'Informational', 'Education', 140, 9.4, 1.1], ['hutchison effect explained', 'Informational', 'Science', 60, 44.0, 1.0],
      ['online stopwatch', 'Navigational', 'Tools', 45, 4.2, 1.0], ['cubic formula derivation', 'Informational', 'Math', 30, 15.0, 1.0]];
    var BP = [['https://gradecalculator.mes.fm/', 900], ['https://mes.fm/percentagecalculator', 640], ['https://mes.fm/bmicalculator/bmi-chart', 300], ['https://gpacalculator.mes.fm/gpa-scale-4.html', 160], ['https://mes.fm/hutchison', 60]];
    var api2 = null;
    window.SC_MOCK_AI = function (method, url, body) {
      var get = api2 ? Promise.resolve(api2) : fetch('/api/search-console-ai.js', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (src) {
        var m = { exports: {} }; new Function('module', 'exports', 'require', src)(m, m.exports, function () { return {}; }); api2 = m.exports;
        if (!/[?&]noai=1/.test(location.search)) {
          AISTORE.set('gscdash:ai:google', JSON.stringify(api2.merge(null, api2.parse({ source: 'google', daily: gd, pages: GP, countries: GC, devices: [['Mobile', 90000], ['Desktop', 52000], ['Tablet', 4000]], files: ['Generative AI-mes.fm-2026-10-26.zip'] }))));
          AISTORE.set('gscdash:ai:bing', JSON.stringify(api2.merge(null, api2.parse({ source: 'bing', daily: bd, queries: BQ, pages: BP, files: ['AIPerformance_mes.fm.csv'] }))));
        }
        return api2;
      });
      return get.then(function (a) {
        var u = new URL(url, location.href), q = {}; u.searchParams.forEach(function (v, k) { q[k] = v; });
        return a.respond({ method: method, query: q, body: body, local: true, contentType: 'application/json' }, {
          get: function (k) { return Promise.resolve(AISTORE.has(k) ? AISTORE.get(k) : null); },
          set: function (k, v) { AISTORE.set(k, v); return Promise.resolve(); },
          del: function (k) { AISTORE.delete(k); return Promise.resolve(); },
        });
      }).then(function (out) { if (out.status !== 200) throw new Error(out.body && out.body.error || out.status); return out.body; });
    };
  })();
  window.SC_MOCK = function (url) {
    var u = new URL(url, location.href), q = {};
    u.searchParams.forEach(function (v, k) { q[k] = v; });
    return loadApi().then(function (a) {
      return a.respond(q, {
        mget: function (keys) { return Promise.resolve(keys.map(function (k) { return STORE.has(k) ? STORE.get(k) : null; })); },
        bing: /[?&]nobing=1/.test(location.search) ? null : function (m) { return Promise.resolve(BING[m] || []); },
      });
    }).then(function (out) {
      if (out.status !== 200) throw new Error(out.status);
      return new Promise(function (res) { setTimeout(function () { res(out.body); }, 150); });
    });
  };
})();
