/* MES Text Size: content script. Scales the text of the page (not the pictures or the layout) by a percentage: every piece of text gets its own
   font-size (and a pixel line-height) = what it had x the level. The originals are remembered so any level, and 100% (back to normal), is exact.
   The level is this tab's own size if one was set ("this tab only", the default), else the site's, else the all-sites size. */
(function () {
  'use strict';
  if (window.__mestsLoaded || typeof chrome === 'undefined' || !chrome.storage) return;
  window.__mestsLoaded = true;

  var T = window.MESTS, S = T.merge(null), ready = false, level = 100, active = false;
  var top = window.top === window, here = location.host;
  // frames use the level of the top page's site, so an embedded document matches the page around it
  var host = location.hostname;
  try { var ao = location.ancestorOrigins; if (ao && ao.length) host = new URL(ao[ao.length - 1]).hostname; } catch (e) { /* ignore */ }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, META: 1, LINK: 1, IFRAME: 1, IMG: 1, VIDEO: 1, AUDIO: 1, CANVAS: 1, SVG: 1, BR: 1, HR: 1, TITLE: 1, OPTION: 1, OPTGROUP: 1 };
  var FORM = { INPUT: 1, TEXTAREA: 1, SELECT: 1, BUTTON: 1 };
  /* orig: element -> { fs, lh, inl: { fs, fsp, lh, lhp } }, the untouched sizes. A WeakMap, so an element the page throws away is forgotten with it, and an
     element the page takes out and puts back (a list re-sorted, a panel re-rendered) is recognised and never measured, and so scaled, a second time.
     live: the tracked elements still to walk when the level changes (pruned of detached ones now and then; they stay in orig). */
  var orig = new WeakMap(), live = new Set(), sinceTrim = 0;
  var observer = null, queue = [], pending = false;
  var SYNC_MAX = 1500;   // up to this many new elements are scaled at once, before the browser paints; a bigger insertion goes through the idle queue

  // ---- settings -----------------------------------------------------------------------------------------------------------
  function load() {
    try { chrome.storage.sync.get('mests', function (a) { S = T.merge(a && a.mests); ready = true; sync(); }); } catch (e) { /* extension reloaded */ }
  }
  try { chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'sync' && ch.mests) { S = T.merge(ch.mests.newValue); sync(); } }); } catch (e) { /* ignore */ }

  // ---- this tab's own size --------------------------------------------------------------------------------------------------
  // Kept for a reload, back / forward and links within the same site in this tab; dropped when the tab goes to another site, is duplicated, restored or
  // opened from another page, or the page has been gone for 30 minutes (tabKeep / tabFinal in shared.js). Frames ask the service worker.
  var tabLevel = null, ssOk = true, KEY = 'mestsTab';
  function navType() { try { var e = performance.getEntriesByType('navigation')[0]; return (e && e.type) || ''; } catch (e) { return ''; } }
  function readRec() { try { return sessionStorage.getItem(KEY); } catch (e) { ssOk = false; return null; } }
  function writeRec() { try { if (tabLevel != null) sessionStorage.setItem(KEY, T.tabRec(tabLevel, here, Date.now())); else sessionStorage.removeItem(KEY); } catch (e) { ssOk = false; } }
  function tellBg(l) { try { chrome.runtime.sendMessage({ mests: 'tabset', h: here, l: l }, function () { void chrome.runtime.lastError; }); } catch (e) { /* ignore */ } }
  function hello() {
    var asked = tabLevel;
    try {
      chrome.runtime.sendMessage({ mests: 'hello', h: top ? here : host, frame: !top }, function (r) {
        if (chrome.runtime.lastError || !r || tabLevel !== asked) return;   // no answer: the page's own verdict stands; a change in the meantime wins
        var bg = typeof r.l === 'number' ? r.l : null;
        var fin = top ? T.tabFinal(asked, bg, ssOk) : bg;
        if (top && bg != null && bg !== fin) tellBg(null);
        if (fin !== tabLevel) { tabLevel = fin; if (top) writeRec(); sync(); }
      });
    } catch (e) { /* ignore */ }
  }
  if (top) {
    var raw = readRec();
    tabLevel = T.tabKeep(T.parseTabRec(raw), { now: Date.now(), host: here, origin: location.origin, nav: navType(), ref: document.referrer, opened: !!window.opener && history.length <= 1 });
    if (tabLevel != null || raw != null) writeRec();
  }
  hello();
  if (top) window.addEventListener('pagehide', function () { if (tabLevel != null) writeRec(); });   // refresh the record's time as the page goes

  function sync() {
    if (!ready) return;
    var l = T.effective(S, host, tabLevel);
    if (l === level && (active || l === 100)) return;
    level = l;
    if (level === 100) restoreAll(); else { start(); relevel(); }
  }

  // ---- finding and scaling text ------------------------------------------------------------------------------------------
  function hasText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.data)) return true;
    return false;
  }
  function wanted(el) {
    if (el.nodeType !== 1 || SKIP[el.tagName] || el.namespaceURI !== 'http://www.w3.org/1999/xhtml' && !FORM[el.tagName]) return false;
    return FORM[el.tagName] || hasText(el);
  }

  function elementsIn(root, out) {
    if (root.nodeType !== 1 || SKIP[root.tagName] || root.id === 'mests-never') return out;
    if (wanted(root)) out.push(root);
    var list = root.querySelectorAll('*');
    for (var i = 0; i < list.length; i++) if (wanted(list[i]) && !SKIP[list[i].parentElement && list[i].parentElement.tagName]) out.push(list[i]);
    return out;
  }

  // read the untouched sizes of `els`, then write the scaled ones. Tracked ancestors are un-scaled while reading so that a child whose size
  // depends on its parent (em, %, inherit) reports its true original size and is never scaled twice. An element seen before (taken out and put
  // back by the page) just gets the current level again from its remembered sizes.
  function process(els) {
    var fresh = [];
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (!e.isConnected) continue;
      var o = orig.get(e);
      if (o) { if (!live.has(e)) { live.add(e); putInline(e, o, true); } continue; }
      fresh.push(e);
    }
    if (!fresh.length) return;
    var anc = new Set();
    fresh.forEach(function (e) { for (var p = e.parentElement; p; p = p.parentElement) if (orig.has(p) && live.has(p)) anc.add(p); });
    anc.forEach(function (a) { putInline(a, orig.get(a), false); });
    var reads = fresh.map(function (e) {
      var cs = getComputedStyle(e);
      return { e: e, fs: T.parsePx(cs.fontSize), lh: cs.lineHeight === 'normal' ? null : T.parsePx(cs.lineHeight), inl: { fs: e.style.getPropertyValue('font-size'), fsp: e.style.getPropertyPriority('font-size'), lh: e.style.getPropertyValue('line-height'), lhp: e.style.getPropertyPriority('line-height') } };
    });
    anc.forEach(function (a) { putInline(a, orig.get(a), true); });
    reads.forEach(function (r) { if (T.scaled(r.fs, 100) == null) return; var e = r.e; delete r.e; orig.set(e, r); live.add(e); putInline(e, r, true); });
    if ((sinceTrim += fresh.length) > 3000) trim();
  }
  function trim() { sinceTrim = 0; live.forEach(function (e) { if (!e.isConnected) live.delete(e); }); }

  function putInline(e, o, on) {
    if (on) {
      var fs = T.scaled(o.fs, level);
      if (fs != null && e.style.getPropertyValue('font-size') !== fs + 'px') e.style.setProperty('font-size', fs + 'px', 'important');
      var lh = o.lh != null ? T.scaled(o.lh, level) : null;
      if (lh != null && e.style.getPropertyValue('line-height') !== lh + 'px') e.style.setProperty('line-height', lh + 'px', 'important');
    } else {
      restoreProp(e, 'font-size', o.inl.fs, o.inl.fsp); restoreProp(e, 'line-height', o.inl.lh, o.inl.lhp);
    }
  }
  function restoreProp(e, prop, val, pri) { if (val) e.style.setProperty(prop, val, pri); else e.style.removeProperty(prop); }

  // a new level: elements out of the page lose their place in `live` (orig keeps them, so if they come back they get the new level then)
  function relevel() { live.forEach(function (e) { if (e.isConnected) putInline(e, orig.get(e), true); else live.delete(e); }); scanAll(); }

  function restoreAll() {
    if (observer) { observer.disconnect(); observer = null; }
    live.forEach(function (e) { putInline(e, orig.get(e), false); });
    live.clear(); orig = new WeakMap(); queue = []; active = false;
  }

  // the first scan of a big page is chunked so it does not freeze: ~800 elements per slice
  function pump() {
    pending = false;
    var chunk = queue.splice(0, 800);
    process(chunk);
    if (queue.length) schedule();
  }
  function schedule() { if (pending) return; pending = true; (window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 300 }); } : function (f) { setTimeout(f, 30); })(pump); }
  function enqueue(root) { var l = elementsIn(root, []); for (var i = 0; i < l.length; i++) queue.push(l[i]); schedule(); }
  function scanAll() { if (document.body) enqueue(document.body); }

  function start() {
    if (active) return;
    active = true;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (active) scanAll(); });
    if (window.MutationObserver) {
      /* Mutation observer callbacks run before the browser paints, so new text is scaled in the same frame it appears. (1.0 queued it for an idle
         moment: a list the page re-builds, such as the Layers panel of a photo editor when a layer moves, showed at normal size for a frame and jumped.) */
      observer = new MutationObserver(function (list) {
        var add = [];
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.type === 'characterData') { var p = m.target.parentElement; if (p && !live.has(p) && wanted(p)) add.push(p); continue; }
          if (m.target.nodeType === 1 && !live.has(m.target) && wanted(m.target)) add.push(m.target);   // an empty element that just got its text
          for (var j = 0; j < m.addedNodes.length; j++) if (m.addedNodes[j].nodeType === 1) elementsIn(m.addedNodes[j], add);
        }
        if (!add.length) return;
        if (add.length <= SYNC_MAX) process(add);
        else { for (var k = 0; k < add.length; k++) queue.push(add[k]); schedule(); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
  }

  // ---- popup / service worker messages -------------------------------------------------------------------------------------
  try {
    chrome.runtime.onMessage.addListener(function (m, sender, send) {
      if (!m || !m.mests) return;
      if (m.mests === 'settab') {   // sent to every frame of the tab; only the top page keeps the record and answers
        tabLevel = typeof m.l === 'number' && isFinite(m.l) ? T.clampLevel(m.l, S.min, S.max) : null;
        if (top) { writeRec(); tellBg(tabLevel); }
        sync();
        if (top) send({ level: level, src: T.sourceOf(S, host, tabLevel) });
        return;
      }
      if (!top) return;
      if (m.mests === 'get') send({ level: level, host: host, tab: tabLevel, src: T.sourceOf(S, host, tabLevel), tracked: live.size });
    });
  } catch (e) { /* ignore */ }

  load();
})();
