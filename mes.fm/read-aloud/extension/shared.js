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

  var api = { docsId: docsId, docsItems: docsItems, defaultConfig: defaultConfig, builtins: builtins, normConfig: normConfig, merge: merge, profileById: profileById, resolveProfile: resolveProfile,
              uid: uid, contrastText: contrastText, buildText: buildText, locate: locate, posOf: posOf };
  root.MESRA = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
