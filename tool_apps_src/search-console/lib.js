// MESSCAI: pure helpers for the "AI search" panel of the private mes.fm/search-console page (prepended to app.js by
// build_tool_apps.py; node-testable: tool_apps_src/search-console-tests.js).
// Neither Google's "Generative AI performance" report (Search Console) nor Bing's "AI Performance" report (Webmaster
// Tools) is in their APIs (checked 2026-10-26), so the owner exports them from each console and drops the files here:
//   CSV / TSV files, the ZIP Search Console's "Export -> Download CSV" makes, or an Excel (.xlsx) export.
// parseFile() recognises each table by its header row (not by its name: names change with the console's language):
//   Google: dates (Date, Impressions), pages (Top pages / Page / URL, Impressions), countries, devices.
//   Bing: daily citations (Date, Citations, Cited pages), grounding queries (Query, Intent, Topic, Citations, Citation share,
//   Avg cited pages per day), pages (Page / URL, Citations).
// combine() turns the recognised tables into one payload per source for /api/search-console-ai.
(function (root) {
  'use strict';
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  // ---- CSV (quotes, BOM, , ; or tab)
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    var first = text.split(/\r?\n/, 1)[0] || '';
    var cnt = function (c) { return first.split(c).length - 1; };
    var sep = cnt('\t') > cnt(',') && cnt('\t') >= cnt(';') ? '\t' : cnt(';') > cnt(',') ? ';' : ',';
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); });
  }

  // "1,234" -> 1234, "12.5%" -> 12.5, "1 234,5" -> 1234.5, "<10" / "~" / "-" -> 0 (Search Console writes ~ and - as 0 too)
  function num(s) {
    if (typeof s === 'number') return isFinite(s) ? s : 0;
    var t = String(s == null ? '' : s).trim().replace(/[%\s  ]/g, '').replace(/^[<>~≈]+/, '');
    if (!t || t === '-' || t === '–') return 0;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    var n = Number(t);
    return isFinite(n) ? n : 0;
  }

  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function ymd(y, m, d) {
    if (y < 100) y += 2000;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
    var s = y + '-' + pad(m) + '-' + pad(d);
    return new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s ? s : null;
  }
  // ISO, ISO with a time, M/D/YYYY (US, Bing's export), D.M.YYYY, "Oct 20, 2026", "20 Oct 2026", an Excel day serial
  function parseDate(v) {
    if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
      var n = Number(v);
      if (n > 36000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5).toISOString().slice(0, 10);
      return null;
    }
    var s = String(v || '').trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) return +m[1] > 12 ? ymd(+m[3], +m[2], +m[1]) : ymd(+m[3], +m[1], +m[2]);
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) return ymd(+m[3], +m[2], +m[1]);
    if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MON[m[1].slice(0, 4).toLowerCase()] !== undefined) return ymd(+m[3], MON[m[1].slice(0, 4).toLowerCase()], +m[2]);
    if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MON[m[1].slice(0, 3).toLowerCase()]) return ymd(+m[3], MON[m[1].slice(0, 3).toLowerCase()], +m[2]);
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/)) && MON[m[2].slice(0, 3).toLowerCase()]) return ymd(+m[3], MON[m[2].slice(0, 3).toLowerCase()], +m[1]);
    return null;
  }

  // ---- header recognition
  var H = {
    date: /^(date|day|dates|datum|fecha|jour)$/,
    imp: /impression/,
    clicks: /^clicks?$|^klicks$/,
    page: /^(top )?(pages?|urls?|cited pages?|page url|landing page)$|^url$/,
    country: /^(countr(y|ies)|region|country\/region)$/,
    device: /^devices?$/,
    query: /^(top )?(grounding )?(quer(y|ies)|keywords?|search terms?)$/,
    intent: /intent/,
    topic: /topic/,
    cit: /^(total )?citations?$|^citation count$|^cited$/,
    share: /citation share|share/,
    citedPages: /cited pages|unique pages|pages cited|avg\.? cited|average cited/,
    filter: /^filter$/,
  };
  function col(head, re, not) {
    for (var i = 0; i < head.length; i++) if (re.test(head[i]) && !(not && not.test(head[i]))) return i;
    return -1;
  }
  // which table a header row is; the file name is only a tie-breaker
  function classify(header, name) {
    var head = header.map(function (h) { return String(h || '').toLowerCase().replace(/\s+/g, ' ').replace(/[()]/g, '').trim(); });
    var c = {
      date: col(head, H.date), imp: col(head, H.imp), clicks: col(head, H.clicks), page: col(head, H.page),
      country: col(head, H.country), device: col(head, H.device), query: col(head, H.query), intent: col(head, H.intent),
      topic: col(head, H.topic), cit: col(head, H.cit), share: col(head, H.share), cited: col(head, H.citedPages), filter: col(head, H.filter),
    };
    if (c.filter === 0) return { kind: 'filters', c: c };
    if (c.clicks !== -1 && c.imp !== -1) return { kind: 'normal', c: c }; // the normal Performance report (has clicks): not AI data
    if (c.imp !== -1) {
      if (c.date !== -1) return { kind: 'g-daily', c: c };
      if (c.page !== -1) return { kind: 'g-pages', c: c };
      if (c.country !== -1) return { kind: 'g-countries', c: c };
      if (c.device !== -1) return { kind: 'g-devices', c: c };
    }
    if (c.cit !== -1 || c.cited !== -1) {
      if (c.date !== -1) return { kind: 'b-daily', c: c };
      if (c.query !== -1) return { kind: 'b-queries', c: c };
      if (c.page !== -1) return { kind: 'b-pages', c: c };
    }
    // a column name we do not know, but the file name says what it is ("Pages.csv" with "Top pages" + "Impressions" is the usual)
    var n = String(name || '').toLowerCase();
    if (c.imp !== -1 && /page/.test(n)) return { kind: 'g-pages', c: Object.assign(c, { page: 0 }) };
    if (c.imp !== -1 && /countr/.test(n)) return { kind: 'g-countries', c: Object.assign(c, { country: 0 }) };
    if (c.imp !== -1 && /device/.test(n)) return { kind: 'g-devices', c: Object.assign(c, { device: 0 }) };
    if (c.imp !== -1 && /chart|date/.test(n)) return { kind: 'g-daily', c: Object.assign(c, { date: 0 }) };
    return { kind: 'unknown', c: c };
  }
  var KIND_NAMES = {
    'g-daily': 'Google AI features: impressions by day', 'g-pages': 'Google AI features: pages', 'g-countries': 'Google AI features: countries',
    'g-devices': 'Google AI features: devices', 'b-daily': 'Bing AI Performance: citations by day', 'b-queries': 'Bing AI Performance: grounding queries',
    'b-pages': 'Bing AI Performance: cited pages', filters: 'Search Console filters (date range)',
    normal: 'the normal Performance report (it has clicks): not AI data, skipped', unknown: 'not recognised, skipped',
  };

  // one table (header + rows) -> { kind, rows } with clean rows
  function parseTable(rows, name) {
    var hi = 0;
    while (hi < rows.length && hi < 5 && rows[hi].filter(function (x) { return x !== ''; }).length < 2) hi++; // skip a title line
    if (hi >= rows.length) return { kind: 'unknown', name: name, rows: [], label: KIND_NAMES.unknown };
    var cl = classify(rows[hi], name), c = cl.c, out = [], k = cl.kind;
    var body = rows.slice(hi + 1);
    body.forEach(function (r) {
      var get = function (i) { return i === -1 || i == null ? '' : r[i] == null ? '' : r[i]; };
      if (k === 'g-daily') { var d = parseDate(get(c.date)); if (d) out.push([d, num(get(c.imp))]); }
      else if (k === 'g-pages') { var p = String(get(c.page)); if (p) out.push([p, num(get(c.imp))]); }
      else if (k === 'g-countries') { var co = String(get(c.country)); if (co) out.push([co, num(get(c.imp))]); }
      else if (k === 'g-devices') { var dv = String(get(c.device)); if (dv) out.push([dv, num(get(c.imp))]); }
      else if (k === 'b-daily') { var bd = parseDate(get(c.date)); if (bd) out.push([bd, c.cit === -1 ? 0 : num(get(c.cit)), c.cited === -1 ? 0 : num(get(c.cited))]); }
      else if (k === 'b-queries') { var q = String(get(c.query)); if (q) out.push([q, String(get(c.intent)), String(get(c.topic)), c.cit === -1 ? 0 : num(get(c.cit)), c.share === -1 ? 0 : num(get(c.share)), c.cited === -1 ? 0 : num(get(c.cited))]); }
      else if (k === 'b-pages') { var bp = String(get(c.page)); if (bp) out.push([bp, c.cit === -1 ? 0 : num(get(c.cit))]); }
      else if (k === 'filters') out.push([String(get(0)), String(get(1))]);
    });
    // a share written as 0.25 (fraction) instead of 25 (%)
    if (k === 'b-queries' && out.length && out.every(function (r) { return r[4] <= 1; }) && out.some(function (r) { return r[4] > 0; })) out.forEach(function (r) { r[4] = Math.round(r[4] * 10000) / 100; });
    return { kind: k, name: name, rows: out, label: KIND_NAMES[k] };
  }

  // ---- ZIP (stored or deflated entries; DecompressionStream in browsers and in node 18+)
  function inflateRaw(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function unzip(buf) {
    var u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    var eocd = -1;
    for (var i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd === -1) return Promise.reject(new Error('not a ZIP file'));
    var n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), list = [];
    for (var e = 0; e < n && off + 46 <= u.length; e++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nlen = dv.getUint16(off + 28, true),
        xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      var name = new TextDecoder().decode(u.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + xlen + clen;
      if (/\/$/.test(name) || /^__MACOSX\//.test(name) || csize > 30e6) continue;
      var start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      list.push({ name: name, method: method, data: u.subarray(start, start + csize) });
    }
    return Promise.all(list.map(function (f) {
      if (f.method === 0) return Promise.resolve({ name: f.name, bytes: f.data });
      if (f.method === 8) return inflateRaw(f.data).then(function (b) { return { name: f.name, bytes: b }; });
      return Promise.resolve(null);
    })).then(function (a) { return a.filter(Boolean); });
  }
  var dec = function (b) { return new TextDecoder('utf-8').decode(b); };
  var xmlText = function (s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&'); };
  // a minimal .xlsx reader: every worksheet as rows of strings / numbers
  function xlsxSheets(files) {
    var by = {}; files.forEach(function (f) { by[f.name] = f; });
    var shared = [];
    if (by['xl/sharedStrings.xml']) {
      var ss = dec(by['xl/sharedStrings.xml'].bytes);
      (ss.match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) {
        shared.push(xmlText((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join('')));
      });
    }
    var names = {};
    if (by['xl/workbook.xml']) {
      var wb = dec(by['xl/workbook.xml'].bytes), i = 1;
      (wb.match(/<sheet\b[^>]*>/g) || []).forEach(function (s) { var m = s.match(/name="([^"]*)"/); names['xl/worksheets/sheet' + (i++) + '.xml'] = m ? xmlText(m[1]) : 'Sheet'; });
    }
    var colIdx = function (ref) { var l = ref.replace(/\d+/g, ''), n = 0; for (var k = 0; k < l.length; k++) n = n * 26 + (l.charCodeAt(k) - 64); return n - 1; };
    return files.filter(function (f) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name); }).sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { numeric: true }); }).map(function (f) {
      var x = dec(f.bytes), rows = [];
      (x.match(/<row\b[\s\S]*?<\/row>/g) || []).forEach(function (r) {
        var row = [];
        (r.match(/<c\b[^>]*?(\/>|>[\s\S]*?<\/c>)/g) || []).forEach(function (c) {
          var ref = (c.match(/\br="([A-Z]+\d+)"/) || [])[1], t = (c.match(/\bt="(\w+)"/) || [])[1], v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          var val = t === 's' ? shared[+v] : t === 'inlineStr' ? xmlText(((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || '') : v == null ? '' : t === 'str' ? xmlText(v) : (isFinite(+v) ? +v : xmlText(v));
          var idx = ref ? colIdx(ref) : row.length;
          while (row.length < idx) row.push('');
          row[idx] = val == null ? '' : val;
        });
        rows.push(row.map(function (v) { return typeof v === 'string' ? v.trim() : v; }));
      });
      return { name: names[f.name] || f.name, rows: rows };
    });
  }

  // a dropped file -> list of parsed tables. file = { name, bytes: Uint8Array }
  function parseFile(file) {
    var name = file.name || 'file', b = file.bytes;
    var isZip = b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
    if (!isZip) return Promise.resolve([parseTable(parseCsv(dec(b)), name)]);
    return unzip(b).then(function (files) {
      if (files.some(function (f) { return f.name === 'xl/workbook.xml'; })) return xlsxSheets(files).map(function (s) { return parseTable(s.rows, s.name); });
      return files.filter(function (f) { return /\.(csv|tsv|txt)$/i.test(f.name); }).map(function (f) { return parseTable(parseCsv(dec(f.bytes)), f.name.split('/').pop()); });
    });
  }

  // recognised tables -> { google: payload|null, bing: payload|null } for /api/search-console-ai
  function combine(tables) {
    var g = null, b = null;
    var G = function () { return g || (g = { source: 'google', files: [] }); };
    var B = function () { return b || (b = { source: 'bing', files: [] }); };
    var sumBy = function (rows, n) { var m = {}; rows.forEach(function (r) { var k = r[0]; if (!m[k]) m[k] = r.slice(); else for (var i = 1; i <= n; i++) m[k][i] += r[i]; }); return Object.keys(m).map(function (k) { return m[k]; }); };
    tables.forEach(function (t) {
      if (!t.rows.length) return;
      var map = { 'g-daily': [G, 'daily'], 'g-pages': [G, 'pages'], 'g-countries': [G, 'countries'], 'g-devices': [G, 'devices'], 'b-daily': [B, 'daily'], 'b-queries': [B, 'queries'], 'b-pages': [B, 'pages'] }[t.kind];
      if (!map) return;
      var p = map[0](), key = map[1];
      p[key] = (p[key] || []).concat(t.rows);
      if (p.files.indexOf(t.name) === -1) p.files.push(t.name);
    });
    [g, b].forEach(function (p) {
      if (!p) return;
      if (p.daily) p.daily = sumBy(p.daily, p.source === 'google' ? 1 : 2).sort(function (x, y) { return x[0] < y[0] ? -1 : 1; });
      ['pages', 'countries', 'devices'].forEach(function (k) { if (p[k]) p[k] = sumBy(p[k], 1).sort(function (x, y) { return y[1] - x[1]; }); });
      if (p.queries) p.queries.sort(function (x, y) { return y[3] - x[3]; });
      if (p.daily && p.daily.length) p.period = { from: p.daily[0][0], to: p.daily[p.daily.length - 1][0] };
    });
    return { google: g, bing: b };
  }

  // ---- old calculator subdomains (moved to mes.fm/<slug>, the old hosts only redirect)
  var MOVED = ['bmicalculator', 'gpacalculator', 'gradecalculator', 'inflationcalculator', 'mortgagecalculator', 'percentagecalculator', 'pokemongocalculator',
    'speedreader', 'timer', 'vatcalculator', 'youtubemoney', 'sjwkeyboard', 'djw'];
  // "https://gradecalculator.mes.fm/memes.html" -> { sub, to: "https://mes.fm/gradecalculator/memes" }; null for a mes.fm URL
  function oldSubdomain(url) {
    var m = String(url || '').trim().match(/^(?:https?:\/\/)?([a-z0-9-]+)\.mes\.fm(\/[^?#]*)?/i);
    if (!m) return null;
    var sub = m[1].toLowerCase();
    if (sub === 'www') return null;
    if (MOVED.indexOf(sub) === -1) return { sub: sub, to: null };
    var p = (m[2] || '/').replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return { sub: sub, to: 'https://mes.fm/' + sub + (p === '/' ? '' : p) };
  }

  // ---- summaries for the panel
  var addDays = function (s, n) { return new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); };
  // daily = { "YYYY-MM-DD": number | [n1, n2] }; n days ending on the newest stored day; metric i = which number
  function periods(daily, n) {
    var days = Object.keys(daily || {}).filter(function (d) { return DATE.test(d); }).sort();
    if (!days.length) return null;
    var end = days[days.length - 1], start = addDays(end, -(n - 1)), pend = addDays(start, -1), pstart = addDays(start, -n);
    var pick = function (a, z) { return days.filter(function (d) { return d >= a && d <= z; }); };
    var cur = pick(start, end), prev = pick(pstart, pend);
    return { start: start, end: end, pstart: pstart, pend: pend, cur: cur, prev: prev, first: days[0], prevFull: days[0] <= pstart };
  }
  var val = function (v, i) { return Array.isArray(v) ? (v[i || 0] || 0) : (i ? 0 : v || 0); };
  function sumOf(daily, dates, i) { var s = 0; dates.forEach(function (d) { s += val(daily[d], i); }); return s; }

  var api = { parseCsv: parseCsv, num: num, parseDate: parseDate, classify: classify, parseTable: parseTable, unzip: unzip, xlsxSheets: xlsxSheets,
    parseFile: parseFile, combine: combine, oldSubdomain: oldSubdomain, periods: periods, sumOf: sumOf, val: val, KIND_NAMES: KIND_NAMES, MOVED: MOVED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MESSCAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
