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
    { k: 'bmi', name: 'BMI Calculator', bundle: 'fm.mes.bmicalculator', ios: '6824009307', android: 'fm.mes.bmicalculator', title: /\bbmi\b/i, web: '/bmicalculator' },
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

// MES App Installs (public, mes.fm/installs): installs of the MES apps on iPhone and Android.
// Data = /api/installs (App Store Connect + Google Play, see mes.fm/api/installs.js), summed here with MESInst (lib.js).
// On 127.0.0.1 / localhost (no /api there) or with ?mock=1 the page shows the made-up /installs/data/sample.json.
(function () {
  'use strict';
  var I = window.MESInst;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; };
  var int = function (v) { return v == null ? '–' : Math.round(v).toLocaleString(); };
  var MOCK = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
  var ST = { r: '30d', app: '', plat: '', split: 'plat' };
  try { var sv = JSON.parse(localStorage.getItem('mes-installs:v1') || '{}'); if (sv && typeof sv === 'object') ST = Object.assign(ST, sv); } catch (e) {}
  if (!I.RANGES.hasOwnProperty(ST.r)) ST.r = '30d';
  var save = function () { try { localStorage.setItem('mes-installs:v1', JSON.stringify(ST)); } catch (e) {} };
  var DATA = null, SUM = null, PREV = null, DATES = [];
  var SHOW = { cc: 15, dev: 15, os: 15, ver: 15 };
  var SORT = {};
  var APPC = { pct: '#2563eb', bmi: '#b3529d', grade: '#575fab', gpa: '#5a812d', fit: '#e8590c' };
  var css = function (n) { return getComputedStyle($('in')).getPropertyValue(n).trim(); };

  var regionName = (function () { try { var dn = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }); return function (c) { try { return dn.of(c) || c; } catch (e) { return c; } }; } catch (e) { return function (c) { return c; }; } })();
  var flag = function (c) { return /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65) : '🌐'; };
  var appName = function (k) { var a = DATA && DATA.apps.filter(function (x) { return x.k === k; })[0]; return a ? a.name : k; };
  var platName = function (p) { return p === 'i' ? 'iPhone & iPad' : 'Android'; };
  var dot = function (p) { return '<span class="in-dot in-dot--' + p + '" title="' + platName(p) + '"></span>'; };

  function chips(group, attr, val) { document.querySelectorAll('#' + group + ' button[' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute(attr) === val ? 'true' : 'false'); }); }
  function wire() {
    $('in-range').onclick = function (e) { var b = e.target.closest('button[data-r]'); if (!b) return; ST.r = b.dataset.r; save(); render(); };
    $('in-plat').onclick = function (e) { var b = e.target.closest('button[data-p]'); if (!b) return; ST.plat = b.dataset.p; save(); render(); };
    $('in-app').onclick = function (e) { var b = e.target.closest('button[data-a]'); if (!b) return; ST.app = b.dataset.a; save(); render(); };
    $('in-split').onclick = function (e) { var b = e.target.closest('button[data-s]'); if (!b) return; ST.split = b.dataset.s; save(); render(); };
    ['cc', 'dev', 'os', 'ver'].forEach(function (k) { $('m-' + k).onclick = function () { SHOW[k] = SHOW[k] >= 1e6 ? 15 : 1e6; render(); }; });
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { if (SUM) drawChart(); }, 120); });
  }

  function load() {
    var url = MOCK ? '/installs/data/sample.json' : '/api/installs';
    fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      DATA = d; buildAppChips(); setupCards(); render();
    }).catch(function () {
      $('in-meta').textContent = 'The install numbers could not be loaded right now. Try again in a few minutes.';
    });
  }

  function buildAppChips() {
    var h = '<button type="button" class="tu-chip" data-a="">All apps</button>';
    DATA.apps.forEach(function (a) { h += '<button type="button" class="tu-chip" data-a="' + esc(a.k) + '"><span class="in-sw" style="background:' + (APPC[a.k] || '#888') + '"></span>' + esc(a.name.replace(/ Calculators?$/, '')) + '</button>'; });
    $('in-app').innerHTML = h;
    if (ST.app && !DATA.apps.some(function (a) { return a.k === ST.app; })) ST.app = '';
  }

  var STEPS = {
    ios: '<h3>iPhone numbers are not connected yet</h3><p>One-time setup (about 10 minutes), in <a href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noopener">App Store Connect → Users and Access → Integrations → App Store Connect API</a>:</p><ol>' +
      '<li>Under <b>Team Keys</b>, press <b>+</b> (Generate API Key). Name it <i>MES installs page</i>, Access <b>Sales</b> (or Finance). Generate.</li>' +
      '<li>Copy the <b>Issuer ID</b> (above the list) and the key\'s <b>Key ID</b>. Press <b>Download</b> to save the <code>AuthKey_XXXX.p8</code> file (Apple lets you download it only once: keep it safe).</li>' +
      '<li>Find your <b>vendor number</b>: <a href="https://appstoreconnect.apple.com/trends/reports" target="_blank" rel="noopener">Sales and Trends → Reports</a>, the number next to your name at the top (8 digits, starts with 8 or 9).</li>' +
      '<li>In Vercel → the <b>mes.fm</b> project → Settings → Environment Variables, add four plain project variables (Production): <code>APPSTORE_ISSUER_ID</code>, <code>APPSTORE_KEY_ID</code>, <code>APPSTORE_VENDOR_NUMBER</code> and <code>APPSTORE_PRIVATE_KEY</code> (open the .p8 file in TextEdit and paste everything, including the BEGIN / END lines).</li>' +
      '<li>Redeploy. The first load fetches every day since September; give it a minute and reload.</li></ol>',
    play: '<h3>Android numbers are not connected yet</h3><p>One-time setup (about 15 minutes):</p><ol>' +
      '<li>In <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener">Google Cloud Console → IAM → Service accounts</a> (any project, e.g. <i>mes-search-console</i>), press <b>Create service account</b>, name it <i>mes-installs</i>, no roles needed. Open it → <b>Keys → Add key → Create new key → JSON</b>. A .json file downloads.</li>' +
      '<li>In <a href="https://play.google.com/console/users-and-permissions" target="_blank" rel="noopener">Play Console → Users and permissions</a> press <b>Invite new users</b>, paste the service account\'s e-mail (…@….iam.gserviceaccount.com), and under <b>Account permissions</b> tick <b>View app information and download bulk reports (read-only)</b>. Invite. (It can take up to a day before Google lets it read the reports.)</li>' +
      '<li>Find the bucket: Play Console → <b>Download reports → Statistics</b> → press <b>Copy Cloud Storage URI</b>. It looks like <code>gs://pubsite_prod_rev_0123456789/stats/installs/</code>.</li>' +
      '<li>In Vercel → the <b>mes.fm</b> project → Settings → Environment Variables, add <code>PLAY_BUCKET</code> = that URI (the <code>gs://pubsite_prod_rev_…</code> part is enough) and <code>PLAY_SERVICE_ACCOUNT</code> = the whole contents of the .json file (open it in TextEdit, copy all).</li>' +
      '<li>Redeploy and reload this page.</li></ol>'
  };
  function setupCards() {
    var s = DATA.sources || {}, h = '';
    ['ios', 'play'].forEach(function (k) {
      var x = s[k] || {};
      if (!x.setup) h += '<div class="tu-card in-setcard">' + STEPS[k] + (x.missing && x.missing.length ? '<p class="tu-note">Missing: ' + x.missing.map(function (m) { return '<code>' + esc(m) + '</code>'; }).join(', ') + '</p>' : '') + '</div>';
      else if (x.ok === false && x.error) h += '<div class="tu-card in-setcard in-setcard--err"><h3>' + (k === 'ios' ? 'App Store Connect' : 'Google Play') + ' did not answer</h3><p>' + esc(x.error) + '</p><p class="tu-note">The numbers below may be missing the newest days. Check the keys if this stays.</p></div>';
    });
    if (h && !MOCK && !(DATA.daily || []).length) h += '<p class="tu-note"><a href="?mock=1">See the page with made-up sample numbers</a></p>';
    $('in-setup').innerHTML = h;
  }

  function render() {
    chips('in-range', 'data-r', ST.r); chips('in-plat', 'data-p', ST.plat); chips('in-app', 'data-a', ST.app); chips('in-split', 'data-s', ST.split);
    var sp = I.span(DATA);
    DATES = I.rangeDates(ST.r, sp.last, sp.first);
    var from = DATES[0], to = DATES[DATES.length - 1];
    SUM = I.summarize(DATA, { from: from, to: to, app: ST.app, plat: ST.plat });
    PREV = null;
    if (ST.r !== 'all' && from) { var n = DATES.length; var pf = I.addDays(from, -n); PREV = sp.first && sp.first <= pf ? I.summarize(DATA, { from: pf, to: I.addDays(from, -1), app: ST.app, plat: ST.plat }) : null; }
    var meta = (MOCK ? '<b class="in-sample">Sample data</b> (made up, for the local preview). ' : '');
    meta += sp.last ? 'Showing <b>' + I.addDays(from, 0) + '</b> to <b>' + to + '</b>' + (ST.app ? ' · ' + esc(appName(ST.app)) : '') + (ST.plat ? ' · ' + platName(ST.plat) : '') + '.' : 'No install numbers yet.';
    if (DATA.generated) meta += ' <span class="in-dim">Updated ' + new Date(DATA.generated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + '.</span>';
    $('in-meta').innerHTML = meta;
    tiles(); drawChart(); appTable(); ccTable();
    dimTable('dev', SUM.devices, 'Device'); dimTable('os', SUM.os.filter(function (x) { return x.plat === 'a'; }), 'Android version'); dimTable('ver', SUM.versions, 'Version');
    $('in-ossec').hidden = ST.plat === 'i';
  }

  function change(cur, prev) {
    if (prev == null || !PREV) return '';
    if (!prev) return cur ? '<small class="in-up">new</small>' : '';
    var p = (cur - prev) / prev * 100;
    return '<small class="' + (p >= 0 ? 'in-up' : 'in-dn') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0) + '% vs the ' + DATES.length + ' days before</small>';
  }
  function tile(v, label, extra, title) { return '<div class="tu-stat"' + (title ? ' title="' + esc(title) + '"' : '') + '><div class="tu-stat__value">' + v + '</div><div class="tu-stat__label">' + esc(label) + '</div>' + (extra || '') + '</div>'; }
  function tiles() {
    var t = SUM.totals, p = PREV && PREV.totals, h = '';
    h += tile(int(t.ins), 'Installs', change(t.ins, p && p.ins));
    if (ST.plat !== 'a') h += tile(int(t.iosIns), 'iPhone & iPad', change(t.iosIns, p && p.iosIns));
    if (ST.plat !== 'i') h += tile(int(t.andIns), 'Android', change(t.andIns, p && p.andIns));
    if (ST.plat !== 'a') { h += tile(int(t.dl), 'First-time downloads', '', 'iPhone & iPad: an Apple account getting the app for the first time'); h += tile(int(t.re), 'Re-downloads', '', 'iPhone & iPad: the same Apple account installing again'); }
    h += tile(int(t.up), 'Updates');
    if (ST.plat !== 'i') { h += tile(int(t.un), 'Uninstalls', '', 'Android only'); h += tile(int(t.active), 'Active devices', t.activeDay ? '<small>Android, on ' + t.activeDay + '</small>' : '', 'Android phones and tablets with the app installed'); }
    var rs = ratingSummary();
    if (rs) h += tile(rs.v, 'Rating', '<small>' + esc(rs.note) + '</small>');
    $('in-tiles').innerHTML = h;
  }
  function ratingSummary() {
    var sum = 0, n = 0, parts = [];
    DATA.apps.forEach(function (a) {
      if (ST.app && a.k !== ST.app) return;
      if (ST.plat !== 'a' && a.ios && a.ios.rating && a.ios.ratings) { sum += a.ios.rating * a.ios.ratings; n += a.ios.ratings; }
      if (ST.plat !== 'i' && a.android && a.android.rating) parts.push(a.android.rating);
    });
    if (n) return { v: '★ ' + (sum / n).toFixed(1), note: n + ' App Store rating' + (n === 1 ? '' : 's') + (parts.length ? ' · Play ★ ' + (parts.reduce(function (x, y) { return x + y; }, 0) / parts.length).toFixed(1) : '') };
    if (parts.length) return { v: '★ ' + (parts.reduce(function (x, y) { return x + y; }, 0) / parts.length).toFixed(1), note: 'Google Play' };
    return null;
  }

  function niceTop(max) { max = max || 1; var step = Math.pow(10, Math.floor(Math.log10(max))); var m = max / step; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * step; }
  function series() {
    if (ST.split === 'app') {
      var keys = DATA.apps.map(function (a) { return a.k; }).filter(function (k) { return !ST.app || k === ST.app; });
      return keys.map(function (k) { return { k: k, name: appName(k), col: APPC[k] || '#888', v: function (day) { return (day && day.byApp[k]) || 0; } }; });
    }
    var out = [];
    if (ST.plat !== 'a') out.push({ k: 'i', name: 'iPhone & iPad', col: css('--in-ios'), v: function (day) { return day ? day.i : 0; } });
    if (ST.plat !== 'i') out.push({ k: 'a', name: 'Android', col: css('--in-and'), v: function (day) { return day ? day.a : 0; } });
    return out;
  }
  function drawChart() {
    var svg = $('in-svg'), box = $('in-chart'), tip = $('in-tip');
    var byD = {}; SUM.days.forEach(function (x) { byD[x.d] = x; });
    var S = series();
    $('in-legend').innerHTML = S.map(function (s) { return '<span><i class="in-key" style="background:' + s.col + '"></i>' + esc(s.name) + '</span>'; }).join('');
    var W = box.clientWidth || 600, H = box.clientHeight || 220, padL = 40, padR = 8, padT = 8, padB = 22;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var cMuted = css('--in-muted'), cLine = css('--in-line');
    if (!DATES.length) { svg.innerHTML = '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" font-size="13" fill="' + cMuted + '">No installs yet</text>'; return; }
    var max = 0; DATES.forEach(function (d) { var t = 0; S.forEach(function (s) { t += s.v(byD[d]); }); max = Math.max(max, t); });
    var top = niceTop(max), iw = W - padL - padR, ih = H - padT - padB, bw = iw / DATES.length;
    var y = function (v) { return padT + ih - v / top * ih; };
    var h = '';
    for (var g = 0; g <= 4; g++) { var gv = top * g / 4, gy = y(gv); h += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + cLine + '"/><text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="' + cMuted + '">' + (gv % 1 ? gv.toFixed(1) : gv.toLocaleString()) + '</text>'; }
    DATES.forEach(function (d, i) {
      var base = 0, bx = padL + i * bw + bw * 0.12, w = Math.max(1, bw * 0.76);
      S.forEach(function (s) { var v = s.v(byD[d]); if (!v) return; h += '<rect x="' + bx.toFixed(1) + '" y="' + y(base + v).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0.5, y(base) - y(base + v)).toFixed(1) + '" fill="' + s.col + '"/>'; base += v; });
    });
    var every = Math.ceil(DATES.length / Math.max(2, Math.floor(iw / 62)));
    DATES.forEach(function (d, i) { if (i % every === 0) h += '<text x="' + (padL + i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + cMuted + '">' + d.slice(5) + '</text>'; });
    h += '<line id="in-cross" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + ih) + '" stroke="' + cMuted + '" stroke-dasharray="3 3" visibility="hidden"/>';
    svg.innerHTML = h;
    var move = function (e) {
      var pt = e.touches ? e.touches[0] : e, r = box.getBoundingClientRect(), i = Math.floor((pt.clientX - r.left - padL) / (r.width - padL - padR) * DATES.length);
      if (i < 0 || i >= DATES.length) { tip.style.display = 'none'; return; }
      var d = DATES[i], day = byD[d], tot = 0, lines = '';
      S.forEach(function (s) { var v = s.v(day); tot += v; lines += '<br><i class="in-key" style="background:' + s.col + '"></i>' + esc(s.name) + ': ' + int(v); });
      tip.innerHTML = '<b>' + new Date(d + 'T12:00:00Z').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + '</b><br>' + int(tot) + ' installs' + lines +
        (day && day.up ? '<br>' + int(day.up) + ' updates' : '') + (day && day.un ? '<br>' + int(day.un) + ' uninstalls (Android)' : '');
      tip.style.display = 'block';
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(0, pt.clientX - r.left + 12)) + 'px';
      var cr = $('in-cross'); if (cr) { var cx = padL + i * bw + bw / 2; cr.setAttribute('x1', cx); cr.setAttribute('x2', cx); cr.setAttribute('visibility', 'visible'); }
    };
    box.onmousemove = move; box.ontouchstart = move; box.ontouchmove = move;
    box.onmouseleave = function () { tip.style.display = 'none'; var cr = $('in-cross'); if (cr) cr.setAttribute('visibility', 'hidden'); };
  }

  // sortable table: cols = [{k, label, f(row) -> html, v(row) -> sort value, cls}]
  function table(id, cols, rows, opts) {
    opts = opts || {};
    var s = SORT[id] || { k: opts.sort || cols[1].k, dir: -1 };
    var col = cols.filter(function (c) { return c.k === s.k; })[0] || cols[1];
    rows = rows.slice().sort(function (a, b) { var x = col.v(a), y = col.v(b); if (x === y) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : 1) * s.dir; });
    var lim = opts.limit || 1e9, more = $(opts.more || '');
    var h = '<thead><tr>' + cols.map(function (c) { return '<th data-k="' + c.k + '"' + (c.k === s.k ? ' class="on" aria-sort="' + (s.dir < 0 ? 'descending' : 'ascending') + '"' : '') + ' title="' + esc(c.title || 'Sort') + '">' + c.label + (c.k === s.k ? (s.dir < 0 ? ' ▾' : ' ▴') : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
    if (!rows.length) h += '<tr><td class="empty" colspan="' + cols.length + '">Nothing in this range yet</td></tr>';
    // in-cell bars (column option b = colour, or function(row) -> colour, or segs(row) -> [[value, colour], ...] for a
    // stacked bar): a thin bar under the number, scaled to the column's largest value over every row (not just those shown)
    var mx = {};
    cols.forEach(function (c) { if (!c.b && !c.segs) return; var m = 0; rows.forEach(function (r) { var v = +c.v(r); if (isFinite(v) && v > m) m = v; }); mx[c.k] = m; });
    var cell = function (c, r) {
      var h = c.f(r); if (!mx[c.k]) return h;
      var v = +c.v(r); if (!isFinite(v) || v <= 0) return h;
      var segs = c.segs ? c.segs(r) : [[v, typeof c.b === 'function' ? c.b(r) : c.b]];
      return h + '<span class="in-ib" aria-hidden="true">' + segs.map(function (g) { return g[0] > 0 ? '<i style="width:' + Math.max(c.segs ? 0 : 2, Math.min(100, g[0] / mx[c.k] * 100)).toFixed(1) + '%;background:' + g[1] + '"></i>' : ''; }).join('') + '</span>';
    };
    rows.slice(0, lim).forEach(function (r) { h += '<tr>' + cols.map(function (c) { var cl = (c.cls || '') + (mx[c.k] ? ' in-bc' : ''); return '<td' + (cl.trim() ? ' class="' + cl.trim() + '"' : '') + '>' + cell(c, r) + '</td>'; }).join('') + '</tr>'; });
    h += '</tbody>';
    if (opts.foot) h += '<tfoot><tr>' + opts.foot.map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr></tfoot>';
    var t = $(id); t.innerHTML = h;
    t.querySelectorAll('th[data-k]').forEach(function (th) { th.onclick = function () { var k = th.dataset.k; var cur = SORT[id] || s; SORT[id] = { k: k, dir: cur.k === k ? -cur.dir : (k === cols[0].k ? 1 : -1) }; render(); }; });
    if (more) { more.hidden = rows.length <= 15; more.textContent = lim >= 1e6 ? 'Show fewer' : 'Show all ' + rows.length; }
  }

  function appTable() {
    var rows = DATA.apps.filter(function (a) { return !ST.app || a.k === ST.app; }).map(function (a) {
      var s = SUM.apps.filter(function (x) { return x.k === a.k; })[0] || { iosIns: 0, andIns: 0, dl: 0, re: 0, up: 0, un: 0, active: null };
      return { a: a, s: s, tot: (ST.plat === 'a' ? 0 : s.iosIns) + (ST.plat === 'i' ? 0 : s.andIns) };
    });
    var star = function (v, n) { return v ? '★ ' + v.toFixed(1) + (n ? ' <small>(' + n + ')</small>' : '') : '<span class="in-dim">–</span>'; };
    var cols = [
      { k: 'n', label: 'App', v: function (r) { return r.a.name; }, f: function (r) { return '<span class="in-sw" style="background:' + (APPC[r.a.k] || '#888') + '"></span><a href="' + esc(r.a.web) + '">' + esc(r.a.name) + '</a>'; } },
      { k: 't', label: 'Installs', v: function (r) { return r.tot; }, b: function (r) { return APPC[r.a.k] || '#888'; }, f: function (r) { return int(r.tot); } }
    ];
    if (ST.plat !== 'a') cols.push({ k: 'i', label: 'iPhone', b: 'var(--in-ios)', v: function (r) { return r.s.iosIns; }, f: function (r) { return int(r.s.iosIns); } },
      { k: 'dl', label: 'First<small>iPhone</small>', title: 'First-time downloads', b: 'var(--in-ios)', v: function (r) { return r.s.dl; }, f: function (r) { return int(r.s.dl); } },
      { k: 're', label: 'Re-dl<small>iPhone</small>', title: 'Re-downloads', b: 'var(--in-ios)', v: function (r) { return r.s.re; }, f: function (r) { return int(r.s.re); } });
    if (ST.plat !== 'i') cols.push({ k: 'a', label: 'Android', b: 'var(--in-and)', v: function (r) { return r.s.andIns; }, f: function (r) { return int(r.s.andIns); } });
    cols.push({ k: 'u', label: 'Updates', b: 'var(--in-muted)', v: function (r) { return ST.plat === 'i' ? r.s.iosUp : ST.plat === 'a' ? r.s.andUp : r.s.up; }, f: function (r) { return int(ST.plat === 'i' ? r.s.iosUp : ST.plat === 'a' ? r.s.andUp : r.s.up); } });
    if (ST.plat !== 'i') cols.push({ k: 'x', label: 'Uninst.<small>Android</small>', title: 'Uninstalls', b: 'var(--in-bad)', v: function (r) { return r.s.un; }, f: function (r) { return int(r.s.un); } },
      { k: 'ac', label: 'Active<small>Android</small>', title: 'Devices with the app installed (latest day)', b: 'var(--in-and)', v: function (r) { return r.s.active; }, f: function (r) { return int(r.s.active); } });
    if (ST.plat !== 'a') cols.push({ k: 'ri', label: 'App Store', title: 'App Store rating (US)', v: function (r) { return r.a.ios.rating; }, f: function (r) { return star(r.a.ios.rating, r.a.ios.ratings); } });
    if (ST.plat !== 'i') cols.push({ k: 'ra', label: 'Play', title: 'Google Play rating', v: function (r) { return r.a.android.rating; }, f: function (r) { return star(r.a.android.rating); } });
    cols.push({ k: 'st', label: 'Get it', v: function (r) { return r.a.k; }, f: function (r) { return (r.a.ios.url ? '<a href="' + esc(r.a.ios.url) + '" target="_blank" rel="noopener">App Store</a>' : '') + (r.a.ios.url ? ' · ' : '') + '<a href="' + esc(r.a.android.url) + '" target="_blank" rel="noopener">Play</a>'; } });
    table('t-apps', cols, rows, { sort: 't' });
  }

  function ccTable() {
    var rows = SUM.countries;
    var cols = [
      { k: 'n', label: 'Country', v: function (r) { return regionName(r.key); }, f: function (r) { return '<span class="in-flag">' + flag(r.key) + '</span>' + esc(regionName(r.key)); } },
      { k: 't', label: 'Installs', v: function (r) { return r.ins; }, segs: function (r) { return [[r.i, 'var(--in-ios)'], [r.a, 'var(--in-and)']]; }, f: function (r) { return int(r.ins); } }
    ];
    if (ST.plat !== 'a') cols.push({ k: 'i', label: 'iPhone', b: 'var(--in-ios)', v: function (r) { return r.i; }, f: function (r) { return int(r.i); } });
    if (ST.plat !== 'i') cols.push({ k: 'a', label: 'Android', b: 'var(--in-and)', v: function (r) { return r.a; }, f: function (r) { return int(r.a); } });
    var tot = rows.reduce(function (s, r) { return s + r.ins; }, 0);
    cols.push({ k: 'p', label: 'Share', b: 'var(--in-muted)', v: function (r) { return r.ins; }, f: function (r) { return tot ? (r.ins / tot * 100).toFixed(r.ins / tot < 0.1 ? 1 : 0) + '%' : '–'; } });
    cols.push({ k: 'u', label: 'Updates', b: 'var(--in-muted)', v: function (r) { return r.up; }, f: function (r) { return int(r.up); } });
    table('t-cc', cols, rows, { sort: 't', limit: SHOW.cc, more: 'm-cc' });
  }
  function dimTable(k, rows, label) {
    var cols = [
      { k: 'n', label: label, v: function (r) { return r.key; }, f: function (r) { return (ST.plat ? '' : dot(r.plat)) + (k === 'ver' && !ST.app ? '<span class="in-dim">' + esc(appName(r.app).replace(/ Calculators?$/, '')) + '</span> ' : '') + esc(r.key); } },
      { k: 't', label: 'Installs', v: function (r) { return r.ins; }, b: function (r) { return r.plat === 'i' ? 'var(--in-ios)' : 'var(--in-and)'; }, f: function (r) { return int(r.ins); } },
      { k: 'u', label: 'Updates', b: 'var(--in-muted)', v: function (r) { return r.up; }, f: function (r) { return int(r.up); } }
    ];
    table('t-' + k, cols, rows, { sort: 't', limit: SHOW[k], more: 'm-' + k });
  }

  function panels() {
    if (!window.MESPanel) { setTimeout(panels, 60); return; }
    document.querySelectorAll('#in .in-sec').forEach(function (sec) {
      var head = sec.querySelector('.in-head'); if (!head) return;
      var bar = head.querySelector('.in-hbtns') || head.appendChild(Object.assign(document.createElement('span'), { className: 'in-hbtns' }));
      window.MESPanel.add(sec, { bar: bar, onChange: function () { if (SUM && sec.id === 'in-daysec') drawChart(); } });
    });
  }

  wire(); load(); panels();
})();
