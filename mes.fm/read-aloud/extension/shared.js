/* MES Read Aloud: setups (profiles) and pure helpers. Loaded by the reader, popup, options page and the node tests
   (node tool_apps_src/read-aloud-tests.js). */
(function (root) {
  'use strict';

  function defaultConfig() {
    return {
      voice: '',                 // voiceURI of the chosen voice, '' = pick the best one for the text's language
      rate: 1, pitch: 1, volume: 1, textScale: 1,
      highlightWord: true, wordColor: '#ffd54a',
      highlightSentence: true, sentenceColor: '#fff1b8',
      autoScroll: true,
      scope: 'smart',            // 'smart' = the article / main content, 'page' = everything visible
      skipCode: true, skipTables: false, readTitle: false,
      playerPosition: 'bottom',  // 'bottom' | 'top'
      closeWhenDone: false,
      doubleClickToJump: true,
      textPanel: 'auto',         // text box above the player: 'auto' = only where the page cannot highlight (text boxes), 'on', 'off'
      panelScale: 1
    };
  }

  function builtins() {
    var study = defaultConfig();
    study.rate = 0.9; study.wordColor = '#7cc4ff'; study.sentenceColor = '#d6ecff'; study.readTitle = true;
    var quick = defaultConfig();
    quick.rate = 1.5; quick.highlightWord = false; quick.closeWhenDone = true;
    return [{ id: 'default', name: 'Default', config: defaultConfig() }, { id: 'study', name: 'Study', config: study }, { id: 'quick', name: 'Quick listen', config: quick }];
  }

  function num(v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
  function color(v, d) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d; }

  function normConfig(c) {
    var out = defaultConfig();
    if (!c || typeof c !== 'object') return out;
    if (typeof c.voice === 'string') out.voice = c.voice.slice(0, 300);
    out.rate = num(c.rate, 0.5, 4, out.rate); out.pitch = num(c.pitch, 0.5, 2, out.pitch); out.volume = num(c.volume, 0, 1, out.volume); out.textScale = num(c.textScale, 0.7, 2.5, out.textScale);
    out.wordColor = color(c.wordColor, out.wordColor); out.sentenceColor = color(c.sentenceColor, out.sentenceColor);
    ['highlightWord', 'highlightSentence', 'autoScroll', 'skipCode', 'skipTables', 'readTitle', 'closeWhenDone', 'doubleClickToJump'].forEach(function (k) { if (typeof c[k] === 'boolean') out[k] = c[k]; });
    out.panelScale = num(c.panelScale, 0.7, 2.5, out.panelScale);
    if (c.textPanel === 'auto' || c.textPanel === 'on' || c.textPanel === 'off') out.textPanel = c.textPanel;
    if (c.scope === 'smart' || c.scope === 'page') out.scope = c.scope;
    if (c.playerPosition === 'top' || c.playerPosition === 'bottom') out.playerPosition = c.playerPosition;
    return out;
  }

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function merge(stored) {
    var out = { v: 1, active: 'default', profiles: [], siteProfiles: {} };
    if (stored && Array.isArray(stored.profiles) && stored.profiles.length) {
      var seen = {};
      stored.profiles.slice(0, 30).forEach(function (p) {
        if (!p || typeof p.id !== 'string' || seen[p.id]) return;
        seen[p.id] = 1;
        out.profiles.push({ id: p.id, name: String(p.name || 'Setup').slice(0, 40), config: normConfig(p.config) });
      });
    }
    if (!out.profiles.length) out.profiles = builtins();
    out.active = stored && out.profiles.some(function (p) { return p.id === stored.active; }) ? stored.active : out.profiles[0].id;
    if (stored && stored.siteProfiles && typeof stored.siteProfiles === 'object') {
      for (var h in stored.siteProfiles) if (out.profiles.some(function (p) { return p.id === stored.siteProfiles[h]; })) out.siteProfiles[h.toLowerCase()] = stored.siteProfiles[h];
    }
    return out;
  }

  function profileById(S, id) {
    for (var i = 0; i < S.profiles.length; i++) if (S.profiles[i].id === id) return S.profiles[i];
    return S.profiles[0];
  }

  function resolveProfile(S, host) {
    host = String(host || '').toLowerCase();
    for (var d in S.siteProfiles) if (host === d || host.slice(-(d.length + 1)) === '.' + d) return profileById(S, S.siteProfiles[d]);
    return profileById(S, S.active);
  }

  // black or white, whichever reads better on this background colour
  function contrastText(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '#000000';
    function lin(v) { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    var L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
    return L > 0.4 ? '#000000' : '#ffffff';
  }

  /* ---- page text <-> character offsets ----
     items = [{ t: text, base: offset of t inside its DOM text node, b: block id }]. Returns the text to speak (whitespace collapsed, blocks
     separated by a blank line, already "clean" for SRLib.tokenize) plus, for every character, the item it came from and the offset in
     that item's text node, so a spoken word can be turned back into a DOM Range. */
  function buildText(items) {
    var text = [], own = [], off = [], first = [], last = [], started = false, gap = 0, lastBlock = null, po = 0, pf = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], s = String(it.t == null ? '' : it.t), base = it.base || 0;
      first[i] = -1; last[i] = -1;
      for (var j = 0; j < s.length; j++) {
        var ch = s.charAt(j);
        if (/[​-‍⁠﻿­]/.test(ch)) continue;
        if (/[\s   ]/.test(ch)) { if (started && gap < 1) gap = 1; continue; }
        if (started && it.b !== lastBlock) gap = 2;
        if (started && gap > 0) {
          var sep = gap === 2 ? '\n\n' : ' ';
          for (var k = 0; k < sep.length; k++) { text.push(sep.charAt(k)); own.push(po); off.push(pf); }   // a separator belongs to the character before it
        }
        text.push(ch); own.push(i); off.push(base + j); po = i; pf = base + j;
        if (first[i] < 0) first[i] = text.length - 1;
        last[i] = text.length - 1;
        started = true; gap = 0; lastBlock = it.b;
      }
    }
    return { text: text.join(''), own: own, off: off, first: first, last: last };
  }

  function locate(map, pos) {
    if (pos < 0 || pos >= map.own.length) return null;
    return { item: map.own[pos], off: map.off[pos] };
  }

  // character position for (item, offset in its text node), or -1
  function posOf(map, item, offset) {
    var lo = map.first[item], hi = map.last[item];
    if (lo == null || lo < 0) return -1;
    var ans = hi;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (map.off[mid] >= offset) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
    return ans;
  }

  // Google Docs draws its pages on a canvas, so there is no text for a page script to find: the id lets reader.js read the document's own export instead.
  function docsId(url) { var m = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]{10,})/.exec(String(url || '')); return m ? m[1] : ''; }
  // plain-text export -> one item per non-empty paragraph (node-less: there is nothing in the page to highlight)
  function docsItems(txt) {
    var out = [], lines = String(txt || '').replace(/^\uFEFF/, '').split(/\r?\n/), b = 0;
    for (var i = 0; i < lines.length; i++) { var t = lines[i].replace(/[\u200b\u00a0]+/g, ' ').trim(); if (t) out.push({ node: null, t: t, base: 0, b: b++ }); }
    return out;
  }

  // the account part of a Docs address (/u/1/ for a second signed-in Google account): the fetches must use the same one
  function docsInfo(url) {
    var m = /^https:\/\/docs\.google\.com\/document\/(u\/\d+\/)?d\/([\w-]{10,})/.exec(String(url || ''));
    return m ? { id: m[2], u: m[1] ? '/' + m[1].replace(/\/$/, '') : '' } : null;
  }
  // the addresses to try, in order. The plain-text export answers with a redirect to *.googleusercontent.com whose CORS header is
  // "Access-Control-Allow-Origin: *" with credentials, which a browser refuses for a request that sends cookies: that is why a page script
  // cannot read it (only the service worker, with host permission). The mobile view is same-origin HTML with the whole text.
  function docsUrls(url) {
    var d = docsInfo(url); if (!d) return null;
    var b = 'https://docs.google.com/document' + d.u + '/d/' + d.id;
    return { id: d.id, mobile: b + '/mobilebasic', exportTxt: b + '/export?format=txt' };
  }
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, function (m, e) {
      if (e[0] === '#') { var c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(c); } catch (x) { return m; } }
      return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
    });
  }
  // the paragraphs of a Docs "mobilebasic" page (or any Docs HTML export): text of every <p>, <li>, heading and table cell inside .doc-content
  function docsHtmlParas(html) {
    html = String(html || '');
    var i = html.search(/class="doc-content/);
    if (i < 0) i = html.search(/<body[^>]*>/i);
    i = i < 0 ? 0 : html.indexOf('>', i) + 1;
    var body = html.slice(i).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/body>[\s\S]*$/i, '');
    var parts = body.split(/<\/(?:p|li|h[1-6]|td|th|div|tr)>|<br\s*\/?>/i), out = [];
    for (var k = 0; k < parts.length; k++) {
      var t = decodeEntities(parts[k].replace(/<[^>]*>/g, '')).replace(/[​ \s]+/g, ' ').trim();
      if (t) out.push(t);
    }
    return out;
  }
  function parasToItems(paras) { return paras.map(function (t, b) { return { node: null, t: t, base: 0, b: b }; }); }

  // ---- PDFs and Word files (the extension's own reader page) ----
  function isPdfUrl(u) { return /^(https?|file):[^#?]*\.pdf(?:[?#]|$)/i.test(String(u || '')); }
  function isDocxUrl(u) { return /^(https?|file):[^#?]*\.docx(?:[?#]|$)/i.test(String(u || '')); }
  /* lines of one PDF page, top to bottom, [{ text, y (baseline, PDF units: up is bigger), size, x }] -> paragraphs. The page's usual line
     spacing is the median gap between neighbouring lines of the same size; a clearly bigger gap (1.4 x that) starts a new paragraph, as does a
     big change of font size (a heading). A word broken with a hyphen at a line end is joined again. */
  function pdfParas(lines) {
    var L = [], gaps = [];
    for (var i = 0; i < lines.length; i++) { var t = String(lines[i].text || '').replace(/\s+/g, ' ').trim(); if (t) L.push({ text: t, y: lines[i].y, size: lines[i].size || 10 }); }
    for (var j = 1; j < L.length; j++) { var g = L[j - 1].y - L[j].y; if (g > 0 && Math.abs(L[j].size - L[j - 1].size) < 0.15 * L[j].size && g < 3 * L[j].size) gaps.push(g / L[j].size); }
    gaps.sort(function (a, b) { return a - b; });
    var med = gaps.length >= 3 ? gaps[Math.floor(gaps.length / 2)] : 1.2, lim = Math.max(1.2, Math.min(2.6, med * 1.4));
    var out = [], cur = null, prev = null;
    for (var k = 0; k < L.length; k++) {
      var l = L[k], size = l.size, gap = prev ? prev.y - l.y : 0, big = prev ? Math.max(size, prev.size) : size;
      var brk = !cur || gap > lim * big || gap < -2 * size || Math.abs(size - prev.size) > 0.25 * big;
      if (brk) { cur = { text: l.text }; out.push(cur); }
      else if (/[A-Za-z]-$/.test(cur.text) && /^[a-z]/.test(l.text)) cur.text = cur.text.slice(0, -1) + l.text;
      else cur.text += ' ' + l.text;
      prev = l;
    }
    return out.map(function (p) { return p.text; });
  }
  // running headers / footers: a first or last line that comes back (digits aside) on at least half of the pages (and 3 or more)
  function pdfRepeats(pages) {
    var cnt = {}, key = function (t) { return String(t || '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase(); };
    pages.forEach(function (ls) { var seen = {}; [ls[0], ls[1], ls[ls.length - 1], ls[ls.length - 2]].forEach(function (l) { if (l) { var k = key(l.text); if (k && !seen[k]) { seen[k] = 1; cnt[k] = (cnt[k] || 0) + 1; } } }); });
    var rep = {};
    for (var k in cnt) if (cnt[k] >= 3 && cnt[k] >= pages.length / 2) rep[k] = 1;
    return function (l) { return !!rep[key(l.text)]; };
  }

  /* voices grouped like the Speed Reader: the text's language first, then the browser's, then every other one as "Other languages: X".
     langName(code) -> display name (Intl.DisplayNames in a browser). isBad(voice) -> true for voices that did not speak here (they sort last). */
  function voiceGroups(voices, textLang, browserLang, langName, isBad) {
    var SRL = (typeof SRLib !== 'undefined' && SRLib) || (root && root.SRLib), groups = {}, order = [];
    var rank = function (l) {
      if (SRL && SRL.voiceLangRank) return SRL.voiceLangRank(l, textLang, browserLang);
      var vl = String(l || '').toLowerCase().split(/[-_]/)[0], tl = String(textLang || '').toLowerCase().split('-')[0], bl = String(browserLang || '').toLowerCase().split(/[-_]/)[0];
      return tl ? (vl === tl ? 0 : vl === bl ? 1 : 2) : (vl === bl ? 0 : 2);
    };
    langName = langName || function (c) { return String(c || '').split(/[-_]/)[0] || 'Other'; };
    isBad = isBad || function () { return false; };
    (voices || []).forEach(function (v) {
      var key = langName(v.lang) || 'Other';
      if (!groups[key]) { groups[key] = { name: key, rank: 3, voices: [] }; order.push(groups[key]); }
      groups[key].voices.push(v); groups[key].rank = Math.min(groups[key].rank, rank(v.lang));
    });
    order.sort(function (a, b) { return a.rank - b.rank || a.name.localeCompare(b.name); });
    order.forEach(function (g) {
      g.label = (g.rank >= 2 ? 'Other languages: ' : '') + g.name;
      g.voices.sort(function (a, b) { return (isBad(a) ? 1 : 0) - (isBad(b) ? 1 : 0) || a.name.localeCompare(b.name); });
    });
    return order;
  }
  // words of a search box against a voice's name, language code and group label (every word must match, case and accents ignored)
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function voiceMatches(query, hay) {
    var w = fold(query).trim().split(/\s+/).filter(Boolean), h = fold(hay);
    for (var i = 0; i < w.length; i++) if (h.indexOf(w[i]) < 0) return false;
    return true;
  }

  var api = { docsId: docsId, docsItems: docsItems, docsInfo: docsInfo, docsUrls: docsUrls, docsHtmlParas: docsHtmlParas, parasToItems: parasToItems, decodeEntities: decodeEntities,
              isPdfUrl: isPdfUrl, isDocxUrl: isDocxUrl, pdfParas: pdfParas, pdfRepeats: pdfRepeats, voiceGroups: voiceGroups, voiceMatches: voiceMatches, fold: fold, defaultConfig: defaultConfig, builtins: builtins, normConfig: normConfig, merge: merge, profileById: profileById, resolveProfile: resolveProfile,
              uid: uid, contrastText: contrastText, buildText: buildText, locate: locate, posOf: posOf };
  root.MESRA = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
