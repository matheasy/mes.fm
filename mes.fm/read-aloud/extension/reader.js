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
  var ui = null, voices = [], keep = [], timers = {}, userScrollAt = 0, lastScrollAt = 0, hlWord = null, hlSent = null, sentIdx = -1, styleEl = null, saveTimer = 0;

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

  // mode: 'selection' | 'page' | 'auto' (selection if there is one, else page). Returns false if there is nothing to read.
  function collect(mode) {
    memo = [new Map(), new Map()]; vmemo = new Map();
    var sel = window.getSelection(), items, startPos = 0, caret = null;
    var hasSel = sel && sel.rangeCount && !sel.isCollapsed && /\S/.test(sel.toString());
    if (mode === 'auto') mode = hasSel ? 'selection' : 'page';
    if (mode === 'selection') {
      if (!hasSel) return false;
      var r = sel.getRangeAt(0), root = r.commonAncestorContainer;
      items = textNodes(root.nodeType === 1 ? root : root.parentNode, r, false);
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
    st.map = map; st.nodes = items.map(function (i) { return i.node; });
    st.words = tk.words; st.starts = tk.sentStarts; st.text = tk.text; st.mode = mode;
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
    sentIdx = -1;
  }

  function highlight(i) {
    if (!st.words || !st.words[i]) return;
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

  function begin(mode) {
    if (st.active) stopSpeech();
    loadSettings(function () {
      if (!collect(mode)) { showNothing(); return; }
      st.active = true; st.playing = false; st.gotBoundary = false; sentIdx = -1;
      applyStyle();
      loadUi(function () { buildUi(); fillUi(); applyText(); speakFrom(st.idx); });
    });
  }

  function stopAll() {
    stopSpeech(); clearHighlight(); st.active = false; st.playing = false; st.words = null; st.map = null; restoreText(); st.nodes = null;
    closePip();
    if (ui) { ui.host.remove(); ui = null; }
    if (styleEl) { styleEl.remove(); styleEl = null; }
  }

  // ---- the player -----------------------------------------------------------------------------------------------------
  var CSS_UI = '*{box-sizing:border-box}:host{all:initial}.p{position:fixed;left:50%;transform:translateX(-50%);z-index:2147483647;width:min(640px,calc(100vw - 20px));background:#1f2023;color:#f2f2f2;border:1px solid #3a3c41;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.45);font:13px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:8px 10px 10px}' +
    '.p.bottom{bottom:12px}.p.top{top:12px}.bar{height:5px;border-radius:3px;background:#3a3c41;cursor:pointer;margin:2px 0 8px;position:relative}.fill{height:100%;border-radius:3px;background:#4cc38a;width:0}' +
    '.row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}button{all:unset;cursor:pointer;min-width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:600 16px/1 system-ui,sans-serif;color:#f2f2f2;background:#2c2e33;padding:0 8px;text-align:center}' +
    'button:hover,button:focus-visible{background:#3d4047;outline:none}button.pl{background:#15803d;min-width:44px}button.pl:hover{background:#1a9a49}select{font:inherit;background:#2c2e33;color:#f2f2f2;border:1px solid #3a3c41;border-radius:8px;height:34px;padding:0 6px;max-width:170px}' +
    '.rate{min-width:54px;font-size:13px}.st{margin-left:auto;color:#aab0b8;font-size:12px;text-align:right;min-width:90px}.st.err{color:#ff9b8f}.sp{flex:1}' +
    '.grip{cursor:grab;min-width:22px;padding:0 2px;color:#8a919a;letter-spacing:-2px}.p.dragging,.p.dragging .grip{cursor:grabbing}.p{touch-action:none}' +
    '.volr{width:74px;height:34px;margin:0 2px;accent-color:#4cc38a;cursor:pointer;background:transparent}.vol svg{display:block}.vol.muted{color:#ff9b8f}' +
    '.dk.on{background:#2b3a67}.hl.on{background:#4a4220}.hl i{font-style:normal;padding:0 4px;border-radius:3px;font-size:13px}.hl.on i{background:#ffd54a;color:#000}.hl:not(.on) i{text-decoration:line-through;color:#9aa0a8}' +
    '.p.moved{left:var(--x);top:var(--y);bottom:auto;transform:none}' +
    '.p.pip,.p.pip.moved{position:static;left:auto;top:auto;bottom:auto;transform:none;width:100%;border:0;border-radius:0;box-shadow:none}.p.pip .grip,.p.pip .mini{display:none}.pip-b.on{background:#1a4d6b}' +
    '.p.min{width:auto;padding:6px 8px}.p.min .bar,.p.min .row>*:not(.grip):not(.pl):not(.mini):not(.x){display:none}.p.min .row{flex-wrap:nowrap}';

  function buildUi() {
    if (ui) { ui.host.remove(); ui = null; }
    var h = document.createElement('div'); h.id = 'mesra-host';
    h.style.cssText = 'all:initial';
    var sh = h.attachShadow({ mode: 'closed' });
    sh.innerHTML = '<style>' + CSS_UI + '</style><div class="p ' + (P.playerPosition === 'top' ? 'top' : 'bottom') + '" role="region" aria-label="MES Read Aloud">' +
      '<div class="bar" title="Click to jump"><div class="fill"></div></div>' +
      '<div class="row"><button class="grip" title="Drag to move the player (double-click to put it back)">&#8942;&#8942;</button><button class="prev" title="Previous sentence (Left arrow)">&#9198;</button><button class="pl" title="Pause / resume (Space)">&#9654;</button><button class="next" title="Next sentence (Right arrow)">&#9197;</button>' +
      '<button class="slow" title="Slower (Down arrow)">&minus;</button><button class="rate" title="Speed">1.0&times;</button><button class="fast" title="Faster (Up arrow)">+</button>' +
      '<button class="tsm" title="Smaller text on the page" aria-label="Smaller text">A&minus;</button><button class="tsp" title="Larger text on the page" aria-label="Larger text">A+</button>' +
      '<button class="vol" title="Mute / unmute"></button><input class="volr" type="range" min="0" max="1" step="0.05" title="Volume" aria-label="Volume">' +
      '<select class="voice" title="Voice"></select><select class="setup" title="Setup"></select>' +
      '<span class="st" aria-live="polite"></span><button class="hl" title="Turn highlighting on / off (H)"><i>ab</i></button><button class="dk" title="Dark / light page: inverts the page colours (pictures and video keep theirs). Remembered for this site." aria-label="Dark or light page">&#9680;</button><button class="pip-b" title="Pop out into a floating window you can move anywhere, even outside the browser" aria-label="Pop out"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M3 5h18v14H3z" fill="none" stroke="currentColor" stroke-width="2"/><rect x="11" y="11" width="8" height="6" fill="currentColor"/></svg></button><button class="gear" title="Settings">&#9881;</button><button class="mini" title="Minimise to a small bar (M)">&#9662;</button><button class="x" title="Close (Esc)">&times;</button></div></div>';
    var q = function (c) { return sh.querySelector(c); };
    if (window.__mesraSite) { var gearBtn = sh.querySelector('.gear'); if (gearBtn) gearBtn.style.display = 'none'; }   // the site player has no options page
    ui = { host: h, sh: sh, p: q('.p'), fill: q('.fill'), bar: q('.bar'), pl: q('.pl'), rate: q('.rate'), voice: q('.voice'), setup: q('.setup'), st: q('.st'), hl: q('.hl'), dk: q('.dk'), mini: q('.mini'), grip: q('.grip'), vol: q('.vol'), volr: q('.volr'), pipb: q('.pip-b') };
    q('.prev').onclick = function () { jumpSentence(-1); };
    q('.next').onclick = function () { jumpSentence(1); };
    ui.pl.onclick = toggle;
    q('.slow').onclick = function () { setRate(P.rate - 0.1); };
    q('.fast').onclick = function () { setRate(P.rate + 0.1); };
    ui.rate.onclick = function () { setRate(1); };
    q('.tsm').onclick = function () { setTextScale(P.textScale - 0.1); };
    q('.tsp').onclick = function () { setTextScale(P.textScale + 0.1); };
    q('.x').onclick = stopAll;
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
    ui.dk.onclick = function () { setDark(!darkOn, true); };
    if (window.__mesraSite) ui.dk.style.display = 'none';   // mes.fm has its own moon button
    ui.dk.classList.toggle('on', darkOn);
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
      if (e.button > 0 || (e.target.closest && e.target.closest('button:not(.grip),select,input,.bar'))) return;
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
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'dblclick', 'keydown', 'keyup'].forEach(function (t) { h.addEventListener(t, function (e) { e.stopPropagation(); }); });
    (document.body || document.documentElement).appendChild(h);
    place(uiPos, true); ui.p.classList.toggle('min', uiMin); fillMini();
    if (pipWin) mountPip();
  }

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
  var uiPos = null, uiMin = false, hlPrev = null, uiDark = {};
  function loadUi(cb) {
    try { chrome.storage.local.get('mesraUi', function (a) { var u = a && a.mesraUi; if (u) { uiPos = u.pos || null; uiMin = !!u.min; uiDark = u.dark || {}; } setDark(!!uiDark[location.hostname], false); if (cb) cb(); }); } catch (e) { if (cb) cb(); }
  }
  loadUi();
  function saveUi() { try { chrome.storage.local.set({ mesraUi: { pos: uiPos, min: uiMin, dark: uiDark } }); } catch (e) { /* ignore */ } }
  function place(pt, keep) {
    if (!ui || pipWin) return;
    if (!pt) { uiPos = null; ui.p.classList.remove('moved'); if (!keep) saveUi(); return; }
    var w = ui.p.offsetWidth || 300, h2 = ui.p.offsetHeight || 60;
    var x = Math.max(8, Math.min(window.innerWidth - w - 8, pt.x)), y = Math.max(8, Math.min(window.innerHeight - h2 - 8, pt.y));
    uiPos = { x: x, y: y };
    ui.p.style.setProperty('--x', x + 'px'); ui.p.style.setProperty('--y', y + 'px'); ui.p.classList.add('moved');
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
      el.textContent = 'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}img,picture,video,canvas,iframe,embed,object,svg image,[style*="background-image"],#mesra-host{filter:invert(1) hue-rotate(180deg)!important}';
      (document.head || document.documentElement).appendChild(el);
    } else if (!darkOn && el) el.remove();
    if (ui && ui.dk) ui.dk.classList.toggle('on', darkOn);
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
  }

  function showNothing() {
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
        send({ active: st.active, playing: st.playing, idx: st.idx, total: st.words ? st.words.length : 0, hasSelection: !!(sel && !sel.isCollapsed && /\S/.test(sel.toString())) });
      }
    });
  } catch (e) { /* ignore */ }

  loadSettings();
})();
