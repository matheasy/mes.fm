/* MES Read Aloud: the reader. Injected into a page only when you ask (toolbar, shortcut or context menu): finds the text, speaks it a
   sentence at a time with the browser's own voices, highlights the word and sentence being read (CSS Custom Highlight API, so the page's
   own markup is never changed) and shows a small floating player. Nothing leaves the browser. */
(function () {
  'use strict';
  if (window.__mesraLoaded || typeof chrome === 'undefined' || !chrome.storage) return;
  window.__mesraLoaded = true;

  var SR = window.SRLib, RA = window.MESRA;
  var synth = window.speechSynthesis;
  var S = RA.merge(null), P = RA.resolveProfile(S, location.hostname).config, host = location.hostname;
  var st = { active: false, playing: false, words: null, text: '', starts: null, map: null, nodes: null, idx: 0, gen: 0, chunk: null, estimated: false, lang: '', mode: 'page' };
  var ui = null, voices = [], keep = [], timers = {}, userScrollAt = 0, lastScrollAt = 0, hlWord = null, hlSent = null, sentIdx = -1, styleEl = null, saveTimer = 0, keyN = 0, panelUserAt = 0;

  // ---- settings -------------------------------------------------------------------------------------------------------
  function loadSettings(cb) {
    try {
      chrome.storage.sync.get('mesra', function (a) { S = RA.merge(a && a.mesra); P = RA.resolveProfile(S, host).config; if (cb) cb(); });
    } catch (e) { if (cb) cb(); }
  }
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { try { chrome.storage.sync.set({ mesra: S }); } catch (e) { /* extension reloaded */ } }, 300);
  }
  try {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area !== 'sync' || !ch.mesra) return;
      var old = P;
      S = RA.merge(ch.mesra.newValue); P = RA.resolveProfile(S, host).config;
      applyStyle(); fillUi();
      if (st.active && st.playing && (old.rate !== P.rate || old.voice !== P.voice || old.pitch !== P.pitch || old.volume !== P.volume)) restartSoon();
      if (st.active && sentIdx >= 0) { sentIdx = -1; highlight(st.idx); }
    });
  } catch (e) { /* ignore */ }

  // ---- voices ---------------------------------------------------------------------------------------------------------
  function loadVoices() { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } }
  if (synth) { loadVoices(); try { synth.addEventListener('voiceschanged', function () { loadVoices(); fillUi(); }); } catch (e) { /* ignore */ } }

  function chooseVoice() {
    var v = null;
    if (P.voice) for (var i = 0; i < voices.length; i++) if (voices[i].voiceURI === P.voice) { v = voices[i]; break; }
    return v || SR.pickVoice(voices, st.lang || '', navigator.language || '');
  }

  // ---- finding the text -----------------------------------------------------------------------------------------------
  var HARD = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, CANVAS: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, BUTTON: 1, VIDEO: 1, AUDIO: 1, HEAD: 1 };
  var SOFT = { NAV: 1, ASIDE: 1, FOOTER: 1, FORM: 1, DIALOG: 1 };
  var SOFTROLE = { navigation: 1, banner: 1, complementary: 1, contentinfo: 1, search: 1, dialog: 1, alert: 1, menu: 1, menubar: 1, toolbar: 1 };
  var BLOCK = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th,dd,dt,div,section,article,figcaption,tr,ul,ol,table,header,footer,aside,main,nav,form,details,summary,caption,body';
  var memo, vmemo;

  function skipped(el, soft) {
    if (!el) return true;
    var key = soft ? 1 : 0, m = memo[key];
    if (m.has(el)) return m.get(el);
    var r = false, tag = el.tagName;
    if (HARD[tag] || (el.getAttribute && el.getAttribute('aria-hidden') === 'true') || el.hasAttribute('hidden') || el.id === 'mesra-host') r = true;
    else if (soft && (SOFT[tag] || SOFTROLE[el.getAttribute('role')] || (P.skipCode && tag === 'PRE') || (P.skipTables && tag === 'TABLE'))) r = true;
    else if (el.parentElement) r = skipped(el.parentElement, soft);
    m.set(el, r);
    return r;
  }

  function visible(el) {
    if (vmemo.has(el)) return vmemo.get(el);
    var r = true;
    try {
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') r = false;
      else if (cs.display === 'contents') r = el.parentElement ? visible(el.parentElement) : true;
      else {
        var rects = el.getClientRects();
        r = rects.length > 0 && (rects[0].width > 1 || rects[0].height > 1);
      }
    } catch (e) { r = true; }
    vmemo.set(el, r);
    return r;
  }

  var blockIds = new WeakMap(), nextBlock = 1;
  function blockOf(el) {
    var b = el.closest ? el.closest(BLOCK) : null;
    if (!b) return 0;
    var id = blockIds.get(b);
    if (!id) { id = nextBlock++; blockIds.set(b, id); }
    return id;
  }

  function pickRoot() {
    if (P.scope === 'page') return document.body;
    var sels = (window.__mesraRoots || []).concat(['article', '[role=main]', 'main', '#content', '.post-content', '.entry-content', '.article-body', '.article', '.post', '#main']), best = null, bestLen = 299;
    for (var i = 0; i < sels.length; i++) {
      var list = document.querySelectorAll(sels[i]);
      for (var j = 0; j < list.length; j++) {
        if (skipped(list[j], false)) continue;
        var len = (list[j].innerText || '').length;
        if (len > bestLen) { best = list[j]; bestLen = len; }
      }
    }
    return best || document.body;
  }

  function textNodes(root, range, soft) {
    var out = [];
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      if (range && !range.intersectsNode(n)) continue;
      if (!n.data || !/\S/.test(n.data)) continue;
      var el = n.parentElement;
      if (!el || skipped(el, soft) || !visible(el)) continue;
      var s = 0, e = n.data.length;
      if (range) { if (n === range.startContainer) s = range.startOffset; if (n === range.endContainer) e = range.endOffset; }
      if (e <= s) continue;
      out.push({ node: n, t: n.data.slice(s, e), base: s, b: blockOf(el) });
    }
    return out;
  }

  // Text selected inside a form field. window.getSelection() is empty for <textarea> / <input>, and editors such as CodeMirror 5
  // (PeakD drafts) keep the selection in a hidden textarea whose value *is* the selected text, so read the focused field's own
  // selection. (A selection in a contenteditable, e.g. Gmail or CodeMirror 6, is a normal DOM selection and needs none of this.)
  function fieldText() {
    var el = document.activeElement, guard = 0;
    while (el && guard++ < 8) {
      if (el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      else if (el.tagName === 'IFRAME') {
        var d = null; try { d = el.contentDocument; } catch (e) { /* cross-origin */ }
        if (d && d.activeElement && d.activeElement !== d.body) el = d.activeElement; else break;
      } else break;
    }
    if (!el || el.nodeType !== 1) return '';
    if (el.tagName !== 'TEXTAREA' && !(el.tagName === 'INPUT' && /^(text|search|url|email|tel)?$/i.test(el.type || ''))) return '';
    var v = el.value || '', a = null, b = null;
    try { a = el.selectionStart; b = el.selectionEnd; } catch (e) { /* ignore */ }
    return a != null && b > a ? v.slice(a, b) : '';
  }

  // mode: 'selection' | 'page' | 'auto' (selection if there is one, else page). Returns false if there is nothing to read.
  function collect(mode, pre) {
    memo = [new Map(), new Map()]; vmemo = new Map();
    var sel = window.getSelection(), items, startPos = 0, caret = null;
    var hasSel = sel && sel.rangeCount && !sel.isCollapsed && /\S/.test(sel.toString());
    var ft = hasSel ? '' : fieldText();
    if (mode === 'auto') mode = (hasSel || /\S/.test(ft)) ? 'selection' : 'page';
    if (pre) { items = pre; mode = 'page'; }   // a Google Doc: the text came from its export
    else if (mode === 'selection') {
      if (hasSel) {
        var r = sel.getRangeAt(0), root = r.commonAncestorContainer;
        items = textNodes(root.nodeType === 1 ? root : root.parentNode, r, false);
      } else if (/\S/.test(ft)) items = [{ node: null, t: ft, base: 0, b: 0 }];   // field text has no DOM nodes to highlight, like the page title
      else return false;
    } else {
      if (sel && sel.rangeCount && sel.isCollapsed && sel.anchorNode && sel.anchorNode.nodeType === 3) caret = { node: sel.anchorNode, off: sel.anchorOffset };
      items = textNodes(pickRoot(), null, true);
      if (!items.length && P.scope !== 'page') items = textNodes(document.body, null, true);
      if (P.readTitle && document.title) items.unshift({ node: null, t: document.title, base: 0, b: -1 });
    }
    if (!items.length) return false;
    var map = RA.buildText(items);
    if (!map.text) return false;
    var tk = SR.tokenize(map.text);
    if (tk.text !== map.text) {   // cleanText changed something (should not happen): keep the offsets honest by tokenizing the cleaned text only for speech
      return false;
    }
    st.map = map; st.nodes = items.map(function (i) { return i.node; }); st.key = ++keyN; st.panelOver = null;
    st.selText = mode === 'selection' && hasSel ? sel.toString().trim() : ''; st.words = tk.words; st.starts = tk.sentStarts; st.text = tk.text; st.mode = mode; st.docs = !!pre;
    st.lang = SR.detectLang(tk.text) || (document.documentElement.lang || '').toLowerCase();
    st.idx = 0;
    if (caret) {
      for (var i = 0; i < st.nodes.length; i++) if (st.nodes[i] === caret.node) {
        var p = RA.posOf(map, i, caret.off);
        if (p >= 0) st.idx = SR.sentenceStartAt(st.starts, SR.wordAtChar(st.words, p)) >= 0 ? st.starts[SR.sentenceStartAt(st.starts, SR.wordAtChar(st.words, p))] : 0;
        break;
      }
    }
    return st.words.length > 0;
  }

  // ---- highlighting ---------------------------------------------------------------------------------------------------
  function applyStyle() {
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'mesra-style'; (document.head || document.documentElement).appendChild(styleEl); }
    styleEl.textContent =
      '::highlight(mesra-sentence){background-color:' + P.sentenceColor + ';color:' + RA.contrastText(P.sentenceColor) + '}' +
      '::highlight(mesra-word){background-color:' + P.wordColor + ';color:' + RA.contrastText(P.wordColor) + '}';
  }

  function rangeFor(a, b) {
    var m = st.map, s = RA.locate(m, a), e = RA.locate(m, b - 1);
    if (!s || !e) return null;
    var ns = st.nodes[s.item], ne = st.nodes[e.item];
    if (!ns || !ne || !ns.isConnected || !ne.isConnected) return null;
    var r = document.createRange();
    try { r.setStart(ns, Math.min(s.off, ns.data.length)); r.setEnd(ne, Math.min(e.off + 1, ne.data.length)); } catch (x) { return null; }
    return r;
  }

  function clearHighlight() {
    try { if (window.CSS && CSS.highlights) { CSS.highlights.delete('mesra-word'); CSS.highlights.delete('mesra-sentence'); } } catch (e) { /* ignore */ }
    sentIdx = -1; panelMark(-1);
  }

  function highlight(i) {
    if (!st.words || !st.words[i]) return;
    panelMark(i);
    if (!(window.CSS && CSS.highlights && window.Highlight)) return;
    var w = st.words[i], k = SR.sentenceStartAt(st.starts, i);
    if (P.highlightSentence) {
      if (k !== sentIdx) {
        sentIdx = k;
        var a = st.words[st.starts[k]].s, endW = k + 1 < st.starts.length ? st.starts[k + 1] - 1 : st.words.length - 1;
        var sr = rangeFor(a, st.words[endW].e);
        if (sr) { var h = new Highlight(sr); h.priority = 1; CSS.highlights.set('mesra-sentence', h); } else CSS.highlights.delete('mesra-sentence');
      }
    } else CSS.highlights.delete('mesra-sentence');
    var wr = rangeFor(w.s, w.e);
    if (P.highlightWord && wr) { var hw = new Highlight(wr); hw.priority = 2; CSS.highlights.set('mesra-word', hw); } else CSS.highlights.delete('mesra-word');
    if (P.autoScroll && (wr || sentIdx >= 0)) follow(wr || rangeFor(w.s, w.e));
  }

  function follow(r) {
    if (!r) return;
    var now = Date.now();
    if (now - userScrollAt < 4000 || now - lastScrollAt < 350) return;
    var rect = r.getBoundingClientRect();
    var top = P.playerPosition === 'top' && !pipWin ? 140 : 70, bottom = window.innerHeight - (P.playerPosition === 'top' || pipWin ? 70 : 160);
    if (rect.height && (rect.top < top || rect.bottom > bottom)) {
      lastScrollAt = now;
      var el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  ['wheel', 'touchmove'].forEach(function (t) { window.addEventListener(t, function () { if (st.active) userScrollAt = Date.now(); }, { passive: true, capture: true }); });

  // ---- speaking ---------------------------------------------------------------------------------------------------------
  function clearTimers() { for (var k in timers) { clearTimeout(timers[k]); } timers = {}; }

  function stopSpeech() { st.gen++; clearTimers(); keep = []; try { synth.cancel(); } catch (e) { /* ignore */ } }

  function speakFrom(i, retry) {
    if (!synth) return fail('This browser has no speech synthesis.');
    var gen = ++st.gen;
    clearTimers(); try { synth.cancel(); } catch (e) { /* ignore */ }
    keep = [];
    st.playing = true; st.idx = i; fillUi();
    queueChunk(i, gen, true, retry || 0);
  }

  function queueChunk(from, gen, first, retry) {
    var chunk = SR.speechChunk(st.words, st.text, from, 200);
    if (!chunk) return;
    var u = new SpeechSynthesisUtterance(chunk.text), v = chooseVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else if (st.lang) u.lang = st.lang;
    u.rate = P.rate; u.pitch = P.pitch; u.volume = P.volume;
    var heard = false, startedAt = 0;
    keep.push(u); if (keep.length > 4) keep.shift();

    u.onstart = function () {
      if (gen !== st.gen) return;
      heard = true; startedAt = Date.now(); st.chunk = chunk; st.idx = chunk.a; st.estimated = false;
      clearTimeout(timers.watch);
      highlight(chunk.a); fillUi();
      if (chunk.b < st.words.length) queueChunk(chunk.b, gen, false, 0);   // the next sentence waits in the queue: no gap
      timers.est = setTimeout(function () { if (gen === st.gen && !st.gotBoundary) estimate(chunk, gen, startedAt); }, 900);
    };
    u.onboundary = function (e) {
      if (gen !== st.gen) return;
      if (e.name && e.name !== 'word') return;
      st.gotBoundary = true; st.estimated = false; clearTimeout(timers.est); clearTimeout(timers.estStep);
      var i = SR.wordAtChar(st.words, chunk.start + e.charIndex);
      if (i < chunk.a) i = chunk.a; if (i >= chunk.b) i = chunk.b - 1;
      st.idx = i; highlight(i); fillProgress();
    };
    u.onend = function () {
      if (gen !== st.gen) return;
      clearTimeout(timers.estStep);
      if (chunk.b >= st.words.length) done();
    };
    u.onerror = function (e) {
      if (gen !== st.gen) return;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      fail('The voice stopped (' + (e && e.error || 'error') + '). Try another voice in the player.');
    };
    try { synth.speak(u); } catch (x) { fail('Could not start speaking.'); return; }
    if (first) {
      timers.watch = setTimeout(function () {
        if (gen !== st.gen || heard) return;
        if (retry < 1) speakFrom(from, retry + 1);
        else fail('The voice did not start. Pick another voice in the player.');
      }, 3500);
    }
  }

  // voices that never send word events: step through the words on a timer so the highlight still follows
  function estimate(chunk, gen, t0) {
    st.estimated = true; fillUi();
    var i = chunk.a, t = 0;
    (function step() {
      if (gen !== st.gen || !st.playing || i >= chunk.b) return;
      st.idx = i; highlight(i); fillProgress();
      t = SR.speechDelay(st.words[i].w, P.rate); i++;
      timers.estStep = setTimeout(step, t);
    })();
  }

  var restartTimer = 0;
  function restartSoon() { clearTimeout(restartTimer); restartTimer = setTimeout(function () { if (st.active && st.playing) speakFrom(st.idx); }, 250); }

  function done() {
    st.playing = false; st.idx = st.words ? st.words.length - 1 : 0; clearHighlight(); fillUi();
    if (P.closeWhenDone) stopAll();
  }
  function fail(msg) { st.playing = false; stopSpeech(); setStatus(msg, true); fillUi(); }

  function pause() { if (!st.playing) return; st.playing = false; stopSpeech(); fillUi(); }
  function resume() { if (!st.active || st.playing) return; speakFrom(st.idx); }
  function toggle() { if (!st.active) return; if (st.playing) pause(); else resume(); }
  function jumpSentence(dir) {
    if (!st.active || !st.words) return;
    var n = st.words.length, i = st.idx;
    i = dir < 0 ? SR.prevSentenceStart(st.starts, i) : SR.nextSentenceStart(st.starts, i, n);
    if (dir > 0 && i <= st.idx) return;
    st.idx = Math.max(0, Math.min(n - 1, i)); sentIdx = -1;
    if (st.playing) speakFrom(st.idx); else { highlight(st.idx); fillUi(); }
  }
  function setRate(r) {
    r = Math.round(Math.min(4, Math.max(0.5, r)) * 20) / 20;
    P.rate = r; saveSettings(); fillUi(); if (st.playing) restartSoon();
  }

  // ---- text size of the page being read: only the elements holding the text we read are scaled, and every original is put back --------
  var scaled = [];
  function restoreText() {
    scaled.forEach(function (o) { try { o.el.style.fontSize = o.fs; o.el.style.lineHeight = o.lh; } catch (e) { /* node gone */ } });
    scaled = [];
  }
  function applyText() {
    restoreText();
    var k = P.textScale || 1;
    if (Math.abs(k - 1) < 0.01 || !st.nodes) { paintText(); return; }
    var els = [], seen = new Set(), i, el;
    for (i = 0; i < st.nodes.length; i++) { el = st.nodes[i].parentElement; if (el && !seen.has(el)) { seen.add(el); els.push(el); } }
    var info = els.map(function (e) {   // read every size first, then write: scaling a parent must not change what its children report
      var cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight);
      return { el: e, fs: e.style.fontSize, lh: e.style.lineHeight, px: parseFloat(cs.fontSize), lpx: isNaN(lh) ? 0 : lh };
    });
    info.forEach(function (o) {
      if (!o.px) return;
      scaled.push({ el: o.el, fs: o.fs, lh: o.lh });
      o.el.style.setProperty('font-size', (o.px * k).toFixed(2) + 'px', 'important');
      if (o.lpx) o.el.style.setProperty('line-height', (o.lpx * k).toFixed(2) + 'px', 'important');
    });
    paintText();
  }
  function paintText() { if (ui) { var k = Math.round((P.textScale || 1) * 100); ui.sh.querySelector('.tsm').title = 'Smaller text on the page (now ' + k + '%)'; ui.sh.querySelector('.tsp').title = 'Larger text on the page (now ' + k + '%)'; } }
  function setTextScale(k) {
    k = Math.round(Math.min(2.5, Math.max(0.7, k)) * 10) / 10;
    P.textScale = k; saveSettings(); applyText();
    if (st.active && st.idx != null) { sentIdx = -1; highlight(st.idx); }
  }

  function go() {
    st.active = true; st.playing = false; st.gotBoundary = false; sentIdx = -1;
    applyStyle();
    loadUi(function () { buildUi(); fillUi(); applyText(); speakFrom(st.idx); });
  }
  // Google Docs: the page is a canvas, so read the document through its own plain-text export (same origin, with the person's own login).
  function fetchDoc(id, cb) {
    var done = false, fin = function (items) { if (!done) { done = true; cb(items); } };
    try {
      fetch('/document/d/' + id + '/export?format=txt', { credentials: 'include' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (t) { var it = RA.docsItems(t); fin(it.length ? it : null); }, function () { fin(null); });
    } catch (e) { fin(null); }
    setTimeout(function () { fin(null); }, 15000);
  }
  function begin(mode) {
    if (st.active) stopSpeech();
    loadSettings(function () {
      var did = window.__mesraSite ? '' : RA.docsId(location.href);
      if (did && !(window.getSelection && !window.getSelection().isCollapsed && /\S/.test(String(window.getSelection())))) {
        showNote('MES Read Aloud: loading this Google Doc…', 1500);
        fetchDoc(did, function (items) {
          if (!items || !collect(mode === 'selection' ? 'page' : mode, items)) { showNothing('docs'); return; }
          go();
        });
        return;
      }
      if (!collect(mode)) { showNothing(); return; }
      go();
    });
  }

  // a new selection made while the player is open: offer to read it (no need for the right-click menu or the toolbar button)
  function selCheck() {
    if (!ui || !ui.rs) return;
    var sel = window.getSelection(), t = sel && !sel.isCollapsed ? String(sel).trim() : '';
    ui.rs.hidden = !(st.active && t && (st.mode !== 'selection' || t !== st.selText));
  }
  document.addEventListener('selectionchange', function () { clearTimeout(selCheck.t); selCheck.t = setTimeout(selCheck, 150); });

  function stopAll() {
    stopSpeech(); clearHighlight(); st.active = false; st.playing = false; st.words = null; st.map = null; restoreText(); st.nodes = null;
    closePip();
    if (ui) { ui.host.remove(); ui = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
  }

  // ---- the player -----------------------------------------------------------------------------------------------------
  var CSS_UI = '*{box-sizing:border-box}:host{all:initial}.p{position:fixed;left:50%;transform:translateX(-50%);z-index:2147483647;width:min(640px,calc(100vw - 20px));background:#1f2023;color:#f2f2f2;border:1px solid #3a3c41;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.45);font:13px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:8px 10px 10px;zoom:var(--z,1)}' +
    '.p.bottom{bottom:12px}.p.top{top:12px}.bar{height:5px;border-radius:3px;background:#3a3c41;cursor:pointer;margin:2px 0 8px;position:relative}.fill{height:100%;border-radius:3px;background:#4cc38a;width:0}' +
    '.row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}button{all:unset;cursor:pointer;min-width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:600 16px/1 system-ui,sans-serif;color:#f2f2f2;background:#2c2e33;padding:0 8px;text-align:center}' +
    'button:hover,button:focus-visible{background:#3d4047;outline:none}button.pl{background:#15803d;min-width:44px}button.pl:hover{background:#1a9a49}select{font:inherit;background:#2c2e33;color:#f2f2f2;border:1px solid #3a3c41;border-radius:8px;height:34px;padding:0 6px;max-width:170px}' +
    '.rate{min-width:54px;font-size:13px}.st{margin-left:auto;color:#aab0b8;font-size:12px;text-align:right;min-width:90px}.st.err{color:#ff9b8f}.sp{flex:1}' +
    '.grip{cursor:grab;min-width:22px;padding:0 2px;color:#8a919a;letter-spacing:-2px}.p.dragging,.p.dragging .grip{cursor:grabbing}.p{touch-action:none}' +
    '.volr{width:74px;height:34px;margin:0 2px;accent-color:#4cc38a;cursor:pointer;background:transparent}.vol svg{display:block}.vol.muted{color:#ff9b8f}' +
    '.rs{background:#1f6f43;font-size:13px;padding:0 12px}.rs[hidden]{display:none}.dk.on{background:#2b3a67}.p.flip:not(.pip){filter:invert(1) hue-rotate(180deg)}.hl.on{background:#4a4220}.hl i{font-style:normal;padding:0 4px;border-radius:3px;font-size:13px}.hl.on i{background:#ffd54a;color:#000}.hl:not(.on) i{text-decoration:line-through;color:#9aa0a8}' +
    '.p.moved{left:var(--x);top:var(--y);bottom:auto;transform:none}' +
    '.rz{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;border-radius:0 0 13px 0;color:#8a919a;background:linear-gradient(135deg,transparent 50%,currentColor 50%,currentColor 58%,transparent 58%,transparent 70%,currentColor 70%,currentColor 78%,transparent 78%);opacity:.7}.rz:hover{opacity:1}.p.pip .rz,.p.min .rz{display:none}' +
    '.p.pip,.p.pip.moved{zoom:1;position:static;left:auto;top:auto;bottom:auto;transform:none;width:100%;border:0;border-radius:0;box-shadow:none}.p.pip .grip,.p.pip .mini{display:none}.pip-b.on{background:#1a4d6b}' +
    '.tp{display:none;margin:0 0 8px;border:1px solid #3a3c41;border-radius:10px;background:#17181a;overflow:hidden}.tp.on{display:block}.p.pip .tp,.p.min .tp{display:none}' +
    '.th{display:flex;align-items:center;gap:4px;padding:3px 6px;background:#25272b;color:#aab0b8;font-size:12px}.th b{flex:1;font-weight:600}.th button{min-width:28px;height:24px;font-size:13px;border-radius:6px;padding:0 6px}.tpb.on{background:#1a4d6b}' +
    '.tb{position:relative;height:150px;min-height:56px;max-height:60vh;overflow:auto;resize:vertical;padding:8px 12px;font-size:calc(16px * var(--tf,1));line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;color:#e6e6e6;user-select:text}.tb .w{cursor:pointer;border-radius:3px}.tb .w:hover{text-decoration:underline}.tb .s.cur{background:var(--sc);color:var(--sct);border-radius:3px}.tb .w.cur{background:var(--wc);color:var(--wct)}' +
    '.p.min{width:auto;padding:6px 8px}.p.min .bar,.p.min .row>*:not(.grip):not(.pl):not(.mini):not(.x){display:none}.p.min .row{flex-wrap:nowrap}';

  function buildUi() {
    if (ui) { ui.host.remove(); ui = null; }
    var h = document.createElement('div'); h.id = 'mesra-host';
    h.style.cssText = 'all:initial';
    var sh = h.attachShadow({ mode: 'closed' });
    sh.innerHTML = '<style>' + CSS_UI + '</style><div class="p ' + (P.playerPosition === 'top' ? 'top' : 'bottom') + '" role="region" aria-label="MES Read Aloud">' +
      '<div class="tp" role="region" aria-label="Text being read"><div class="th"><b class="tl">Text being read</b><button class="tsm2" title="Smaller text in this box" aria-label="Smaller text in the box">A&minus;</button><button class="tsp2" title="Larger text in this box" aria-label="Larger text in the box">A+</button><button class="tpx" title="Hide this box" aria-label="Hide the text box">&times;</button></div><div class="tb" tabindex="0"></div></div>' +
      '<div class="bar" title="Click to jump"><div class="fill"></div></div>' +
      '<div class="rz" title="Drag to resize the player (double-click for normal size)" aria-label="Resize the player"></div>' +
      '<div class="row"><button class="grip" title="Drag to move the player (double-click to put it back)">&#8942;&#8942;</button><button class="prev" title="Previous sentence (Left arrow)">&#9198;</button><button class="pl" title="Pause / resume (Space)">&#9654;</button><button class="next" title="Next sentence (Right arrow)">&#9197;</button>' +
      '<button class="slow" title="Slower (Down arrow)">&minus;</button><button class="rate" title="Speed">1.0&times;</button><button class="fast" title="Faster (Up arrow)">+</button>' +
      '<button class="tsm" title="Smaller text on the page" aria-label="Smaller text">A&minus;</button><button class="tsp" title="Larger text on the page" aria-label="Larger text">A+</button>' +
      '<button class="tpb" title="Show / hide the text being read in a box above the player" aria-label="Show or hide the text box"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 6h16M4 11h16M4 16h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg></button><button class="vol" title="Mute / unmute"></button><input class="volr" type="range" min="0" max="1" step="0.05" title="Volume" aria-label="Volume">' +
      '<select class="voice" title="Voice"></select><select class="setup" title="Setup"></select>' +
      '<span class="st" aria-live="polite"></span><button class="rs" hidden title="Stop and read the text you just highlighted on the page">Read selection</button><button class="hl" title="Turn highlighting on / off (H)"><i>ab</i></button><button class="dk" title="Dark / light page: inverts the page colours (pictures and video keep theirs). Remembered for this site." aria-label="Dark or light page">&#9680;</button><button class="pip-b" title="Pop out into a floating window you can move anywhere, even outside the browser" aria-label="Pop out"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="2"/><rect x="11" y="11" width="8" height="6" fill="currentColor"/></svg></button><button class="gear" title="Settings">&#9881;</button><button class="mini" title="Minimise to a small bar (M)">&#9662;</button><button class="x" title="Close (Esc)">&times;</button></div></div>';
    var q = function (c) { return sh.querySelector(c); };
    if (window.__mesraSite) { var gearBtn = sh.querySelector('.gear'); if (gearBtn) gearBtn.style.display = 'none'; }   // the site player has no options page
    ui = { host: h, sh: sh, p: q('.p'), fill: q('.fill'), bar: q('.bar'), pl: q('.pl'), rate: q('.rate'), voice: q('.voice'), setup: q('.setup'), st: q('.st'), hl: q('.hl'), rs: q('.rs'), dk: q('.dk'), mini: q('.mini'), grip: q('.grip'), vol: q('.vol'), volr: q('.volr'), pipb: q('.pip-b'), tp: q('.tp'), tb: q('.tb'), tl: q('.tl'), tpb: q('.tpb'), wEls: null, curW: null, curS: null, tkey: 0 };
    q('.prev').onclick = function () { jumpSentence(-1); };
    q('.next').onclick = function () { jumpSentence(1); };
    ui.pl.onclick = toggle;
    q('.slow').onclick = function () { setRate(P.rate - 0.1); };
    q('.fast').onclick = function () { setRate(P.rate + 0.1); };
    ui.rate.onclick = function () { setRate(1); };
    q('.tsm').onclick = function () { setTextScale(P.textScale - 0.1); };
    q('.tsp').onclick = function () { setTextScale(P.textScale + 0.1); };
    q('.x').onclick = stopAll;
    ui.tpb.onclick = function () { st.panelOver = !panelVisible(); panelApply(); };
    q('.tpx').onclick = function () { st.panelOver = false; panelApply(); };
    q('.tsm2').onclick = function () { setPanelScale(P.panelScale - 0.1); };
    q('.tsp2').onclick = function () { setPanelScale(P.panelScale + 0.1); };
    ['wheel', 'touchmove'].forEach(function (t) { ui.tb.addEventListener(t, function () { panelUserAt = Date.now(); }, { passive: true }); });
    ui.tb.onclick = function (e) {
      var w = e.target.closest && e.target.closest('.w');
      if (!w || !st.words) return;
      var i = Number(w.getAttribute('data-i'));
      st.idx = i; sentIdx = -1; if (st.playing) speakFrom(i); else { highlight(i); fillUi(); }
    };
    q('.gear').onclick = function () { try { chrome.runtime.sendMessage({ mesra: 'options' }); } catch (e) { /* ignore */ } };
    ui.bar.onclick = function (e) {
      if (!st.words) return;
      var r = ui.bar.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      var i = st.starts[Math.min(st.starts.length - 1, Math.floor(f * st.starts.length))];
      st.idx = i; sentIdx = -1; if (st.playing) speakFrom(i); else { highlight(i); fillUi(); }
    };
    ui.voice.onchange = function () { P.voice = ui.voice.value; saveSettings(); if (st.playing) restartSoon(); };
    ui.setup.onchange = function () { S.active = ui.setup.value; saveSettings(); P = RA.resolveProfile(S, host).config; applyStyle(); fillUi(); if (st.playing) restartSoon(); };
    ui.hl.onclick = toggleHighlight;
    ui.rs.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the page selection alive until the click reads it
    ui.rs.onclick = function () { ui.rs.hidden = true; begin('selection'); };
    selCheck();
    ui.dk.onclick = function () { setDark(!darkOn, true); };
    if (window.__mesraSite) ui.dk.style.display = 'none';   // mes.fm has its own moon button
    ui.dk.classList.toggle('on', darkOn); ui.p.classList.toggle('flip', darkOn);
    ui.pipb.onclick = popOut;
    if (!window.documentPictureInPicture) ui.pipb.style.display = 'none';
    ui.volr.oninput = function () { P.volume = Number(ui.volr.value); if (P.volume > 0) lastVol = P.volume; paintVol(); saveSettings(); };
    ui.volr.onchange = function () { if (st.playing) restartSoon(); };   // the voice reads the new volume from the next sentence on, so restart the current one
    ui.vol.onclick = function () { if (P.volume > 0) { lastVol = P.volume; P.volume = 0; } else P.volume = lastVol || 1; paintVol(); saveSettings(); if (st.playing) restartSoon(); };
    ui.mini.onclick = toggleMini;
    ui.grip.ondblclick = function () { place(null); };
    // drag the player anywhere by its grip or any empty part of it
    var drag = null;
    ui.p.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || (e.target.closest && e.target.closest('button:not(.grip),select,input,.bar,.rz'))) return;
      var r = ui.p.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
      try { ui.p.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    });
    ui.p.addEventListener('pointermove', function (e) {
      if (!drag) return;
      drag.moved = true; ui.p.classList.add('dragging');
      place({ x: e.clientX - drag.dx, y: e.clientY - drag.dy }, true);
    });
    function endDrag() { if (!drag) return; var m = drag.moved; drag = null; ui.p.classList.remove('dragging'); if (m) saveUi(); }
    ui.p.addEventListener('pointerup', endDrag);
    ui.p.addEventListener('pointercancel', endDrag);
    // resize by the bottom-right corner: everything in the player scales together (CSS zoom)
    var rz = q('.rz'), rs0 = null;
    rz.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      var r = ui.p.getBoundingClientRect();
      place({ x: r.left, y: r.top }, true);   // anchor the top-left corner so it grows toward the bottom-right
      rs0 = { x: e.clientX, w: r.width, z: uiZoom };
      try { rz.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      e.preventDefault();
    });
    rz.addEventListener('pointermove', function (e) {
      if (!rs0) return;
      if (!(e.buttons & 1)) { endRz(); return; }   // the button was let go somewhere we did not hear about: stop following the pointer
      setZoom(rs0.z * (rs0.w + e.clientX - rs0.x) / rs0.w);
    });
    function endRz() { if (rs0) { rs0 = null; saveUi(); } }
    rz.addEventListener('pointerup', endRz);
    rz.addEventListener('pointercancel', endRz);
    rz.addEventListener('lostpointercapture', endRz);
    rz.ondblclick = function () { setZoom(1); saveUi(); };
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'dblclick', 'keydown', 'keyup'].forEach(function (t) { h.addEventListener(t, function (e) { e.stopPropagation(); }); });
    (document.body || document.documentElement).appendChild(h);
    applyZoom(); place(uiPos, true); ui.p.classList.toggle('min', uiMin); fillMini();
    if (pipWin) mountPip();
  }

  // ---- the text box: the words being read, shown inside the player ----
  // A page can only highlight text that sits in its own DOM. Text typed in a <textarea> / <input> has no DOM nodes, so there the box is the
  // only place to follow the reading ("auto" shows it exactly then); everywhere else it is off unless asked for.
  function hasDomText() { return !!(st.nodes && st.nodes.some(Boolean) && window.CSS && CSS.highlights && window.Highlight); }
  function panelVisible() {
    if (st.panelOver != null) return !!st.panelOver;
    return P.textPanel === 'on' || (P.textPanel === 'auto' && !hasDomText());
  }
  function panelBuild() {
    if (!ui || !st.words || ui.tkey === st.key) return;
    ui.tkey = st.key;
    var w = st.words, text = st.text, n = w.length, frag = document.createDocumentFragment(), prev = 0, k, i;
    ui.wEls = new Array(n); ui.curW = null; ui.curS = null; ui.sEls = [];
    for (k = 0; k < st.starts.length; k++) {
      var a = st.starts[k], b = k + 1 < st.starts.length ? st.starts[k + 1] : n, sp = document.createElement('span');
      sp.className = 's';
      for (i = a; i < b; i++) {
        var gap = text.slice(prev, w[i].s);
        if (gap) { if (i === a) frag.appendChild(document.createTextNode(gap)); else sp.appendChild(document.createTextNode(gap)); }
        var we = document.createElement('span'); we.className = 'w'; we.setAttribute('data-i', i); we.textContent = text.slice(w[i].s, w[i].e);
        sp.appendChild(we); ui.wEls[i] = we; prev = w[i].e;
      }
      ui.sEls.push(sp); frag.appendChild(sp);
    }
    ui.tb.textContent = ''; ui.tb.appendChild(frag); ui.tb.scrollTop = 0;
  }
  function panelMark(i) {
    if (!ui || !ui.wEls) return;
    if (ui.curW) { ui.curW.classList.remove('cur'); ui.curW = null; }
    if (ui.curS) { ui.curS.classList.remove('cur'); ui.curS = null; }
    var el = ui.wEls[i];
    if (!el) return;
    if (P.highlightWord) { el.classList.add('cur'); ui.curW = el; }
    if (P.highlightSentence) { var sp = ui.sEls[SR.sentenceStartAt(st.starts, i)]; if (sp) { sp.classList.add('cur'); ui.curS = sp; } }
    if (!ui.tp.classList.contains('on') || Date.now() - panelUserAt < 4000) return;
    var tb = ui.tb, top = el.offsetTop, h = el.offsetHeight;
    if (top < tb.scrollTop + 8 || top + h > tb.scrollTop + tb.clientHeight - 8) tb.scrollTop = Math.max(0, top - tb.clientHeight / 2);
  }
  function panelApply() {
    if (!ui) return;
    var on = panelVisible();
    ui.tp.classList.toggle('on', on); ui.tpb.classList.toggle('on', on);
    ui.tpb.title = on ? 'Hide the text box' : 'Show the text being read in a box above the player';
    if (!on) return;
    ui.tl.textContent = hasDomText() ? 'Text being read' : st.docs ? 'Text of this Google Doc (Google Docs draws its pages itself, so the words are followed here)' : 'Text being read (the page cannot highlight text inside a text box, so it is shown here)';
    var ps = ui.p.style;
    ps.setProperty('--tf', String(P.panelScale || 1));
    ps.setProperty('--wc', P.wordColor); ps.setProperty('--wct', RA.contrastText(P.wordColor));
    ps.setProperty('--sc', P.sentenceColor); ps.setProperty('--sct', RA.contrastText(P.sentenceColor));
    panelBuild();
    if (st.words && ui.wEls && !ui.curW && !ui.curS) panelMark(st.idx);
  }
  function setPanelScale(k) { P.panelScale = Math.round(Math.min(2.5, Math.max(0.7, k)) * 10) / 10; saveSettings(); panelApply(); }

  // ---- pop out: Document Picture-in-Picture gives a real, always-on-top window that can be dragged anywhere on the screen ----
  var pipWin = null;
  async function popOut() {
    if (pipWin) { var old = pipWin; old.close(); onPipHide(); return; }
    var api = window.documentPictureInPicture;
    if (!api || !ui) return;
    var w;
    try { w = await api.requestWindow({ width: 660, height: 150 }); } catch (e) { setStatus('The browser did not open the floating window.', true); return; }
    pipWin = w;
    var d = w.document;
    d.title = 'MES Read Aloud';
    d.documentElement.style.cssText = 'background:#1f2023';
    d.body.style.cssText = 'margin:0;background:#1f2023;overflow:hidden';
    mountPip();
    w.addEventListener('keydown', onKey, true);
    w.addEventListener('pagehide', onPipHide);
    try { var chromeH = w.outerHeight - w.innerHeight; w.resizeTo(w.outerWidth, Math.max(110, ui.p.offsetHeight + chromeH + 2)); } catch (e) { /* the window may not be resizable */ }
  }
  function mountPip() {
    if (!ui || !pipWin) return;
    ui.p.classList.add('pip');
    pipWin.document.body.appendChild(ui.host);
    fillUi();
  }
  // the floating window was closed (or the reading ended): the player goes back onto the page
  function onPipHide() {
    if (!pipWin) return;
    pipWin = null;
    if (ui) { ui.p.classList.remove('pip'); (document.body || document.documentElement).appendChild(ui.host); place(uiPos, true); fillUi(); }
  }
  function closePip() { if (!pipWin) return; var w = pipWin; pipWin = null; try { w.close(); } catch (e) { /* ignore */ } }

  var lastVol = 1;
  function volIcon(v) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 9.5v5h4l5 4v-13l-5 4z" fill="currentColor"/>' +
      (v <= 0 ? '<path d="M15 9.5l6 5M21 9.5l-6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'
        : '<path d="M15.5 9a4 4 0 0 1 0 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' + (v > 0.5 ? '<path d="M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' : '')) + '</svg>';
  }
  function paintVol() {
    if (!ui) return;
    ui.volr.value = P.volume; ui.vol.innerHTML = volIcon(P.volume); ui.vol.classList.toggle('muted', P.volume <= 0);
    ui.vol.title = P.volume <= 0 ? 'Unmute' : 'Mute'; ui.volr.title = 'Volume ' + Math.round(P.volume * 100) + '%';
  }

  // player position + minimised state, remembered per browser (not per site)
  var uiPos = null, uiZoom = 1, uiMin = false, hlPrev = null, uiDark = {};
  function loadUi(cb) {
    try { chrome.storage.local.get('mesraUi', function (a) { var u = a && a.mesraUi; if (u) { uiPos = u.pos || null; uiMin = !!u.min; uiZoom = Math.max(0.5, Math.min(2, Number(u.zoom) || 1)); uiDark = u.dark || {}; } setDark(!!uiDark[location.hostname], false); if (cb) cb(); }); } catch (e) { if (cb) cb(); }
  }
  loadUi();
  function saveUi() { try { chrome.storage.local.set({ mesraUi: { pos: uiPos, zoom: uiZoom, min: uiMin, dark: uiDark } }); } catch (e) { /* ignore */ } }
  function place(pt, keep) {
    if (!ui || pipWin) return;
    if (!pt) { uiPos = null; ui.p.classList.remove('moved'); if (!keep) saveUi(); return; }
    var br = ui.p.getBoundingClientRect(), w = br.width || 300, h2 = br.height || 60;
    var x = Math.max(8, Math.min(window.innerWidth - w - 8, pt.x)), y = Math.max(8, Math.min(window.innerHeight - h2 - 8, pt.y));
    uiPos = { x: x, y: y };
    ui.p.style.setProperty('--x', x / uiZoom + 'px'); ui.p.style.setProperty('--y', y / uiZoom + 'px'); ui.p.classList.add('moved');
  }
  function applyZoom() { if (ui) ui.p.style.setProperty('--z', String(uiZoom)); }
  function setZoom(z) {
    uiZoom = Math.max(0.5, Math.min(2, z));
    if (!ui) return;
    var oldPos = uiPos; applyZoom(); if (oldPos) place(oldPos, true);
  }
  window.addEventListener('resize', function () { if (ui && uiPos) place(uiPos, true); });
  function fillMini() { if (ui) { ui.mini.innerHTML = uiMin ? '&#9652;' : '&#9662;'; ui.mini.title = uiMin ? 'Show the full player (M)' : 'Minimise to a small bar (M)'; } }
  function toggleMini() { uiMin = !uiMin; if (ui) { ui.p.classList.toggle('min', uiMin); fillMini(); if (uiPos) place(uiPos, true); } saveUi(); }
  // dark / light page: one stylesheet that inverts the page (hue kept) and flips pictures, video and our own player back; it stays on the page after the player closes
  var darkOn = false;
  function setDark(on, save) {
    if (window.__mesraSite) return;
    darkOn = !!on;
    var el = document.getElementById('mesra-dark-style');
    if (darkOn && !el) {
      el = document.createElement('style'); el.id = 'mesra-dark-style';
      el.textContent = 'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}img,picture,video,canvas,iframe,embed,object,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';   // the player flips itself back (.p.flip): a filter on its host element would make the host the containing block of the fixed player and push it off screen
      (document.head || document.documentElement).appendChild(el);
    } else if (!darkOn && el) el.remove();
    if (ui && ui.dk) ui.dk.classList.toggle('on', darkOn);
    if (ui && ui.p) ui.p.classList.toggle('flip', darkOn);
    if (save) { if (darkOn) uiDark[location.hostname] = true; else delete uiDark[location.hostname]; saveUi(); }
  }
  function toggleHighlight() {
    if (P.highlightWord || P.highlightSentence) { hlPrev = { w: P.highlightWord, s: P.highlightSentence }; P.highlightWord = false; P.highlightSentence = false; clearHighlight(); }
    else { P.highlightWord = hlPrev ? hlPrev.w : true; P.highlightSentence = hlPrev ? hlPrev.s : true; if (!P.highlightWord && !P.highlightSentence) { P.highlightWord = true; P.highlightSentence = true; } sentIdx = -1; if (st.words) highlight(st.idx); }
    saveSettings(); fillUi();
  }

  function setStatus(msg, err) { if (ui) { ui.st.textContent = msg; ui.st.className = 'st' + (err ? ' err' : ''); } }

  function fillProgress() {
    if (!ui || !st.words) return;
    ui.fill.style.width = Math.round(100 * (st.idx + 1) / st.words.length) + '%';
    if (!ui.st.classList.contains('err')) {
      var left = SR.speechEstimateMs(st.words, st.idx, st.words.length, P.rate);
      var si = SR.sentenceStartAt(st.starts, st.idx) + 1;
      ui.st.textContent = si + ' / ' + st.starts.length + ' · ' + SR.formatDuration(left) + ' left' + (st.estimated ? ' (estimated)' : '');
    }
  }

  function fillUi() {
    if (!ui) return;
    ui.p.classList.toggle('top', P.playerPosition === 'top'); ui.p.classList.toggle('bottom', P.playerPosition !== 'top');
    ui.hl.classList.toggle('on', !!(P.highlightWord || P.highlightSentence));
    paintVol();
    if (ui.pipb) { ui.pipb.classList.toggle('on', !!pipWin); ui.pipb.title = pipWin ? 'Put the player back on the page' : 'Pop out into a floating window you can move anywhere, even outside the browser'; }
    ui.pl.innerHTML = st.playing ? '&#10074;&#10074;' : '&#9654;';
    ui.pl.title = st.playing ? 'Pause (Space)' : 'Resume (Space)';
    ui.rate.innerHTML = (Math.round(P.rate * 100) / 100).toFixed(P.rate * 100 % 10 ? 2 : 1).replace(/0$/, '') + '&times;';
    // voices: best matches for the page language first
    var list = voices.slice().sort(function (a, b) { return SR.voiceScore(b, st.lang, navigator.language) - SR.voiceScore(a, st.lang, navigator.language); });
    var cur = chooseVoice(), curId = P.voice || (cur && cur.voiceURI) || '';
    if (ui.voice.getAttribute('data-n') !== String(list.length) + '|' + curId) {
      ui.voice.innerHTML = '';
      list.forEach(function (v) { var o = document.createElement('option'); o.value = v.voiceURI; o.textContent = v.name + ' (' + v.lang + ')'; ui.voice.appendChild(o); });
      ui.voice.value = curId; ui.voice.setAttribute('data-n', String(list.length) + '|' + curId);
    }
    ui.setup.innerHTML = '';
    S.profiles.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; ui.setup.appendChild(o); });
    ui.setup.value = RA.resolveProfile(S, host).id;
    if (!ui.st.classList.contains('err') || st.playing) { ui.st.className = 'st'; fillProgress(); }
    panelApply();
  }

  function showNote(msg, ms) {
    var h = document.createElement('div');
    h.style.cssText = 'all:initial;position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;background:#1f2023;color:#f2f2f2;font:14px system-ui,sans-serif;padding:10px 16px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.4)';
    h.textContent = msg; document.documentElement.appendChild(h); setTimeout(function () { h.remove(); }, ms || 3000);
  }
  function showNothing(why) {
    if (why === 'docs') { showNote('MES Read Aloud could not read this Google Doc. Open it while signed in with access, and check that File > Download is not disabled for viewers.', 6000); return; }
    var h = document.createElement('div');
    h.style.cssText = 'all:initial;position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;background:#1f2023;color:#f2f2f2;font:14px system-ui,sans-serif;padding:10px 16px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.4)';
    h.textContent = 'MES Read Aloud: no readable text found here. Select some text and try again.';
    document.documentElement.appendChild(h);
    setTimeout(function () { h.remove(); }, 4000);
  }

  // ---- keys and clicks while the player is open -------------------------------------------------------------------------
  function typing(e) {
    var t = (e.composedPath && e.composedPath()[0]) || e.target;
    return !!t && t.nodeType === 1 && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  function onKey(e) {
    if (!st.active || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (ui && path.indexOf(ui.host) >= 0 && (e.key === ' ' || e.key === 'Enter')) return;   // a focused player button handles its own press
    var k = e.key, used = true;
    if (k === ' ') toggle();
    else if (k === 'ArrowLeft') jumpSentence(-1);
    else if (k === 'ArrowRight') jumpSentence(1);
    else if (k === 'ArrowUp') setRate(P.rate + 0.1);
    else if (k === 'ArrowDown') setRate(P.rate - 0.1);
    else if (k === 'Escape') stopAll();
    else if (k === 'h' || k === 'H') toggleHighlight();
    else if (k === 'm' || k === 'M') toggleMini();
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  window.addEventListener('keydown', onKey, true);

  document.addEventListener('dblclick', function (e) {
    if (!st.active || !P.doubleClickToJump || !st.words) return;
    var pos = null;
    if (document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(e.clientX, e.clientY); if (cp) pos = { node: cp.offsetNode, off: cp.offset }; }
    else if (document.caretRangeFromPoint) { var cr = document.caretRangeFromPoint(e.clientX, e.clientY); if (cr) pos = { node: cr.startContainer, off: cr.startOffset }; }
    if (!pos) return;
    for (var i = 0; i < st.nodes.length; i++) if (st.nodes[i] === pos.node) {
      var p = RA.posOf(st.map, i, pos.off);
      if (p < 0) return;
      var w = SR.wordAtChar(st.words, p);
      st.idx = w; sentIdx = -1; speakFrom(w);
      return;
    }
  }, true);

  window.addEventListener('pagehide', function () { try { synth.cancel(); } catch (e) { /* ignore */ } closePip(); });

  // ---- messages -----------------------------------------------------------------------------------------------------------
  try {
    chrome.runtime.onMessage.addListener(function (m, sender, send) {
      if (!m || !m.mesra) return;
      if (m.mesra === 'ping') send({ ok: 1 });
      else if (m.mesra === 'read') { begin(m.mode || 'auto'); send({ ok: 1 }); }
      else if (m.mesra === 'toggle') { if (st.active) toggle(); else begin('auto'); send({ ok: 1 }); }
      else if (m.mesra === 'stop') { stopAll(); send({ ok: 1 }); }
      else if (m.mesra === 'get') {
        var sel = window.getSelection();
        send({ active: st.active, playing: st.playing, idx: st.idx, total: st.words ? st.words.length : 0, hasSelection: !!(sel && !sel.isCollapsed && /\S/.test(sel.toString())) || /\S/.test(fieldText()) });
      }
    });
  } catch (e) { /* ignore */ }

  loadSettings();
})();
