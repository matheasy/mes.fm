// MES App Installs (mes.fm/installs): pure parsing and summing, shared by the page and the Vercel function.
// This file must stay byte-identical to mes.fm/api/_installs-lib.js (cp after editing; tool_apps_src/installs-tests.js checks).
//  - iOS: App Store Connect Sales and Trends, SALES / SUMMARY / DAILY (gunzipped TSV) -> compact rows per day.
//  - Android: Google Play installs CSVs from the developer's Cloud Storage bucket (UTF-16) -> compact rows per day.
//  - buildDataset() joins both into one public dataset; summarize() sums a date range / app / platform for the page.
(function (root) {
  'use strict';
  var I = {};

  // The MES apps. ios = App Store id (null until known: rows are then matched by title), android = Play package.
  I.APPS = [
    { k: 'pct', name: 'Percentage Calculator', bundle: 'fm.mes.percentagecalculator', ios: '6809222891', android: 'fm.mes.percentagecalculator', title: /percent/i, web: '/percentagecalculator' },
    { k: 'bmi', name: 'BMI Calculator', bundle: 'fm.mes.bmicalculator', ios: null, android: 'fm.mes.bmicalculator', title: /\bbmi\b/i, web: '/bmicalculator' },
    { k: 'grade', name: 'Grade Calculator', bundle: 'fm.mes.gradecalculator', ios: '6824035179', android: 'fm.mes.gradecalculator', title: /grade/i, web: '/gradecalculator' },
    { k: 'gpa', name: 'GPA Calculator', bundle: 'fm.mes.gpacalculator', ios: '6824052607', android: 'fm.mes.gpacalculator', title: /\bgpa\b/i, web: '/gpacalculator' },
    { k: 'fit', name: 'Fitness Calculators', bundle: 'fm.mes.fitnesscalculators', ios: '6824113713', android: 'fm.mes.fitnesscalculators', title: /fitness/i, web: '/bmr-calculator' }
  ];
  I.appByKey = function (k) { for (var i = 0; i < I.APPS.length; i++) if (I.APPS[i].k === k) return I.APPS[i]; return null; };

  // Apple "Product Type Identifier": 1* / F1 = first download, 3* / F3 = re-download, 7* / F7 = update; in-app purchases and the rest = null.
  I.iosKind = function (pt) {
    var s = String(pt || '').trim().toUpperCase();
    if (/^(1|1F|1T|1E|1EP|1EU|F1)$/.test(s)) return 'dl';
    if (/^(3|3F|3T|F3)$/.test(s)) return 're';
    if (/^(7|7F|7T|F7)$/.test(s)) return 'up';
    return null;
  };

  I.parseTsv = function (text) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return [];
    var head = lines[0].split('\t').map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (l) {
      var c = l.split('\t'), o = {};
      head.forEach(function (h, i) { o[h] = c[i] == null ? '' : c[i].trim(); });
      return o;
    });
  };

  // "10/27/2026" -> "2026-10-27"
  I.usDate = function (s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
    if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim()) ? String(s).trim() : '';
    return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  };

  I.matchIosApp = function (row) {
    var id = String(row['Apple Identifier'] || '').trim(), title = String(row.Title || '');
    for (var i = 0; i < I.APPS.length; i++) if (I.APPS[i].ios && I.APPS[i].ios === id) return I.APPS[i].k;
    for (var j = 0; j < I.APPS.length; j++) if (I.APPS[j].title.test(title) || I.APPS[j].bundle === String(row.SKU || '').trim()) return I.APPS[j].k;
    return null;
  };

  // One day's sales report -> rows [app, kind, country, device, version, units] (only our apps, only downloads / updates / re-downloads).
  I.iosRows = function (tsv) {
    var out = [], idx = {};
    I.parseTsv(tsv).forEach(function (r) {
      var kind = I.iosKind(r['Product Type Identifier']);
      if (!kind) return;
      if (r['Parent Identifier'] && String(r['Parent Identifier']).trim()) return; // in-app items hang off a parent
      var app = I.matchIosApp(r);
      if (!app) return;
      var units = Number(String(r.Units || '0').replace(/,/g, '')) || 0;
      if (!units) return;
      var cc = String(r['Country Code'] || '').toUpperCase().slice(0, 2) || '??';
      var dev = String(r.Device || '').trim() || 'Unknown';
      var ver = String(r.Version || '').trim().slice(0, 20) || '';
      var key = [app, kind, cc, dev, ver].join('|');
      if (idx[key] != null) out[idx[key]][5] += units;
      else { idx[key] = out.length; out.push([app, kind, cc, dev, ver, units]); }
    });
    return out;
  };

  // UTF-16 (Play reports) or UTF-8 bytes -> string. Works on a Node Buffer or a Uint8Array.
  I.decodeText = function (bytes) {
    var b = bytes, n = b.length, le = true, start = 0;
    if (n >= 2 && b[0] === 0xFF && b[1] === 0xFE) { le = true; start = 2; }
    else if (n >= 2 && b[0] === 0xFE && b[1] === 0xFF) { le = false; start = 2; }
    else {
      var zeros = 0, look = Math.min(n, 400);
      for (var z = 0; z < look; z++) if (b[z] === 0) zeros++;
      if (zeros < look / 4) { // UTF-8
        if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
        return Buffer.from(b).toString('utf8').replace(/^﻿/, '');
      }
      le = b[1] === 0;
    }
    var parts = [], chunk = [];
    for (var i = start; i + 1 < n; i += 2) {
      chunk.push(le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
      if (chunk.length >= 8192) { parts.push(String.fromCharCode.apply(null, chunk)); chunk = []; }
    }
    if (chunk.length) parts.push(String.fromCharCode.apply(null, chunk));
    return parts.join('');
  };

  // CSV with quotes -> array of arrays.
  I.parseCsv = function (text) {
    var s = String(text || '').replace(/^﻿/, ''), rows = [], row = [], f = '', q = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(f); f = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  };

  // Play installs file name -> { pkg, month, dim } (dim: overview | country | device | os_version | app_version | ...)
  I.playName = function (name) {
    var m = /(?:^|\/)installs_(.+)_(\d{6})_([a-z_]+)\.csv$/.exec(String(name || ''));
    return m ? { pkg: m[1], month: m[2], dim: m[3] } : null;
  };
  var DIMCOL = { country: /^country$/i, device: /^device$/i, os_version: /android os version|os version/i, app_version: /app version/i, carrier: /carrier/i, language: /language/i };
  I.DIMKEY = { country: 'c', device: 'd', os_version: 'o', app_version: 'v' };

  // One Play installs CSV -> { daily: [[date, installs, updates, uninstalls, active]] } (overview) or { dims: [[date, key, installs, updates]] }.
  I.playParse = function (text, dim) {
    var rows = I.parseCsv(text);
    if (!rows.length) return dim === 'overview' ? { daily: [] } : { dims: [] };
    var head = rows[0].map(function (h) { return h.trim(); });
    var col = function (re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; };
    var cD = col(/^date$/i);
    var cI = col(/^daily device installs$/i); if (cI < 0) cI = col(/^install events$/i);
    var cU = col(/^daily device upgrades$/i); if (cU < 0) cU = col(/^update events$/i);
    var cX = col(/^daily device uninstalls$/i); if (cX < 0) cX = col(/^uninstall events$/i);
    var cA = col(/^active device installs$/i);
    var cK = DIMCOL[dim] ? col(DIMCOL[dim]) : -1;
    var num = function (r, c) { if (c < 0) return 0; var v = Number(String(r[c] || '').replace(/,/g, '')); return isFinite(v) ? v : 0; };
    var out = dim === 'overview' ? { daily: [] } : { dims: [] };
    rows.slice(1).forEach(function (r) {
      var d = String(r[cD] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = I.usDate(d);
      if (!d) return;
      if (dim === 'overview') out.daily.push([d, num(r, cI), num(r, cU), num(r, cX), cA < 0 || String(r[cA] || '').trim() === '' ? null : num(r, cA)]);
      else if (cK >= 0) {
        var k = String(r[cK] || '').trim() || 'Unknown';
        if (dim === 'country') k = k.toUpperCase();
        var a = num(r, cI), u = num(r, cU);
        if (a || u) out.dims.push([d, k.slice(0, 60), a, u]);
      }
    });
    return out;
  };

  // Play ratings overview CSV -> last "Total Average Rating" (null when none)
  I.playRating = function (text) {
    var rows = I.parseCsv(text);
    if (rows.length < 2) return null;
    var head = rows[0].map(function (h) { return h.trim(); }), c = -1;
    for (var i = 0; i < head.length; i++) if (/^total average rating$/i.test(head[i])) c = i;
    if (c < 0) return null;
    for (var j = rows.length - 1; j > 0; j--) { var v = Number(rows[j][c]); if (rows[j][c] && isFinite(v) && v > 0) return Math.round(v * 100) / 100; }
    return null;
  };

  // ios = { 'YYYY-MM-DD': iosRows }, play = { app key: { overview: [...daily], country: [...dims], ... } }
  // -> { daily: [[d, app, plat, installs, updates, redownloads, uninstalls, active]], dims: [[d, app, plat, dim, key, installs, updates]] }
  I.buildDataset = function (ios, play) {
    var daily = [], dims = [], di = {}, mi = {};
    var addD = function (d, a, p, ins, up, re, un, act) {
      var k = d + '|' + a + '|' + p;
      if (di[k] == null) { di[k] = daily.length; daily.push([d, a, p, 0, 0, 0, 0, null]); }
      var r = daily[di[k]]; r[3] += ins; r[4] += up; r[5] += re; r[6] += un;
      if (act != null) r[7] = (r[7] || 0) + act;
    };
    var addM = function (d, a, p, dim, key, ins, up) {
      if (!ins && !up) return;
      var k = d + '|' + a + '|' + p + '|' + dim + '|' + key;
      if (mi[k] == null) { mi[k] = dims.length; dims.push([d, a, p, dim, key, 0, 0]); }
      dims[mi[k]][5] += ins; dims[mi[k]][6] += up;
    };
    Object.keys(ios || {}).forEach(function (d) {
      (ios[d] || []).forEach(function (r) {
        var a = r[0], kind = r[1], n = r[5];
        addD(d, a, 'i', kind === 'dl' ? n : 0, kind === 'up' ? n : 0, kind === 're' ? n : 0, 0, null);
        var ins = kind === 'dl' || kind === 're' ? n : 0, up = kind === 'up' ? n : 0;
        addM(d, a, 'i', 'c', r[2], ins, up);
        addM(d, a, 'i', 'd', r[3], ins, up);
        if (r[4]) addM(d, a, 'i', 'v', r[4], kind === 'dl' || kind === 're' ? n : 0, up);
      });
    });
    Object.keys(play || {}).forEach(function (a) {
      var p = play[a] || {};
      (p.overview || []).forEach(function (r) { addD(r[0], a, 'a', r[1], r[2], 0, r[3], r[4]); });
      Object.keys(I.DIMKEY).forEach(function (dim) { (p[dim] || []).forEach(function (r) { addM(r[0], a, 'a', I.DIMKEY[dim], r[1], r[2], r[3]); }); });
    });
    var by = function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; };
    daily.sort(by); dims.sort(by);
    return { daily: daily, dims: dims };
  };

  // Date helpers (UTC calendar days)
  I.addDays = function (d, n) { return new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); };
  I.daysBetween = function (from, to) { var out = []; for (var d = from; d <= to && out.length < 4000; d = I.addDays(d, 1)) out.push(d); return out; };
  I.RANGES = { '7d': 7, '30d': 30, '90d': 90, '365d': 365, all: 0 };
  // range ending on `last` (the newest day with data). 'all' starts at the first day in the dataset.
  I.rangeDates = function (range, last, first) {
    var n = I.RANGES[range];
    if (n == null) n = 30;
    if (!last) return [];
    var from = n ? I.addDays(last, 1 - n) : (first || last);
    return I.daysBetween(from, last);
  };

  // Sum the dataset for the page. opt = { from, to, app ('' = all), plat ('' | 'i' | 'a') }.
  I.summarize = function (ds, opt) {
    opt = opt || {};
    var from = opt.from || '0000', to = opt.to || '9999', app = opt.app || '', plat = opt.plat || '';
    var keep = function (r) { return r[0] >= from && r[0] <= to && (!app || r[1] === app) && (!plat || r[2] === plat); };
    var tot = { ins: 0, iosIns: 0, andIns: 0, dl: 0, re: 0, up: 0, un: 0, active: null, activeDay: null };
    var days = {}, apps = {}, lastAct = {};
    (ds.daily || []).forEach(function (r) {
      if (!keep(r)) return;
      var ins = r[2] === 'i' ? r[3] + r[5] : r[3];
      tot.ins += ins; if (r[2] === 'i') { tot.iosIns += ins; tot.dl += r[3]; tot.re += r[5]; } else tot.andIns += ins;
      tot.up += r[4]; tot.un += r[6];
      var day = days[r[0]] || (days[r[0]] = { d: r[0], i: 0, a: 0, dl: 0, re: 0, up: 0, un: 0, byApp: {} });
      day[r[2]] += ins; day.dl += r[3]; day.re += r[5]; day.up += r[4]; day.un += r[6];
      day.byApp[r[1]] = (day.byApp[r[1]] || 0) + ins;
      var ap = apps[r[1]] || (apps[r[1]] = { k: r[1], iosIns: 0, andIns: 0, dl: 0, re: 0, up: 0, un: 0, active: null, iosUp: 0, andUp: 0 });
      if (r[2] === 'i') { ap.iosIns += ins; ap.dl += r[3]; ap.re += r[5]; ap.iosUp += r[4]; } else { ap.andIns += ins; ap.un += r[6]; ap.andUp += r[4]; }
      ap.up += r[4];
      if (r[2] === 'a' && r[7] != null && (!lastAct[r[1]] || r[0] >= lastAct[r[1]])) { lastAct[r[1]] = r[0]; ap.active = r[7]; }
    });
    Object.keys(apps).forEach(function (k) {
      if (apps[k].active != null) { tot.active = (tot.active || 0) + apps[k].active; if (!tot.activeDay || lastAct[k] > tot.activeDay) tot.activeDay = lastAct[k]; }
    });
    var dim = { c: {}, d: {}, o: {}, v: {} };
    (ds.dims || []).forEach(function (r) {
      if (!keep(r)) return;
      var m = dim[r[3]]; if (!m) return;
      var key = r[2] + '|' + (r[3] === 'v' ? r[1] + '|' : '') + r[4];
      var x = m[key] || (m[key] = { plat: r[2], app: r[1], key: r[4], ins: 0, up: 0 });
      x.ins += r[5]; x.up += r[6];
    });
    var list = function (m) { return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return (b.ins - a.ins) || (b.up - a.up) || (a.key < b.key ? -1 : 1); }); };
    // countries merged across platforms (with the split kept)
    var cc = {};
    list(dim.c).forEach(function (x) { var y = cc[x.key] || (cc[x.key] = { key: x.key, ins: 0, i: 0, a: 0, up: 0 }); y.ins += x.ins; y[x.plat] += x.ins; y.up += x.up; });
    return {
      totals: tot,
      days: Object.keys(days).sort().map(function (d) { return days[d]; }),
      apps: Object.keys(apps).map(function (k) { return apps[k]; }),
      countries: Object.keys(cc).map(function (k) { return cc[k]; }).sort(function (a, b) { return (b.ins - a.ins) || (b.up - a.up) || (a.key < b.key ? -1 : 1); }),
      devices: list(dim.d), os: list(dim.o), versions: list(dim.v)
    };
  };

  // newest / oldest day in the dataset
  I.span = function (ds) {
    var first = null, last = null;
    (ds.daily || []).forEach(function (r) { if (!first || r[0] < first) first = r[0]; if (!last || r[0] > last) last = r[0]; });
    return { first: first, last: last };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = I; else root.MESInst = I;
})(this);
