/* MES Text Size: content script. Scales the text of the page (not the pictures or the layout) by a percentage: every piece of text gets its own
   font-size (and a pixel line-height) = what it had x the level. The originals are remembered so any level, and 100% (back to normal), is exact. */
(function () {
  'use strict';
  if (window.__mestsLoaded || typeof chrome === 'undefined' || !chrome.storage) return;
  window.__mestsLoaded = true;

  var T = window.MESTS, S = T.merge(null), ready = false, level = 100, active = false;
  // frames use the level of the top page's site, so an embedded document matches the page around it
  var host = location.hostname;
  try { var ao = location.ancestorOrigins; if (ao && ao.length) host = new URL(ao[ao.length - 1]).hostname; } catch (e) { /* ignore */ }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, META: 1, LINK: 1, IFRAME: 1, IMG: 1, VIDEO: 1, AUDIO: 1, CANVAS: 1, SVG: 1, BR: 1, HR: 1, TITLE: 1, OPTION: 1, OPTGROUP: 1 };
  var FORM = { INPUT: 1, TEXTAREA: 1, SELECT: 1, BUTTON: 1 };
  var orig = new Map();   // element -> { fs, lh, inl: { fs, fsp, lh, lhp } }
  var observer = null, queue = [], pending = false;

  // ---- settings ---------------------------------------------------------------------------------------------------------
  function load() {
    try { chrome.storage.sync.get('mests', function (a) { S = T.merge(a && a.mests); ready = true; sync(); }); } catch (e) { /* extension reloaded */ }
  }
  try { chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'sync' && ch.mests) { S = T.merge(ch.mests.newValue); sync(); } }); } catch (e) { /* ignore */ }

  function sync() {
    if (!ready) return;
    var l = T.levelFor(S, host);
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
  // depends on its parent (em, %, inherit) reports its true original size and is never scaled twice.
  function process(els) {
    els = els.filter(function (e) { return e.isConnected && !orig.has(e); });
    if (!els.length) return;
    var anc = new Set();
    els.forEach(function (e) { for (var p = e.parentElement; p; p = p.parentElement) if (orig.has(p)) anc.add(p); });
    anc.forEach(function (a) { putInline(a, orig.get(a), false); });
    var reads = els.map(function (e) {
      var cs = getComputedStyle(e);
      return { e: e, fs: T.parsePx(cs.fontSize), lh: cs.lineHeight === 'normal' ? null : T.parsePx(cs.lineHeight), inl: { fs: e.style.getPropertyValue('font-size'), fsp: e.style.getPropertyPriority('font-size'), lh: e.style.getPropertyValue('line-height'), lhp: e.style.getPropertyPriority('line-height') } };
    });
    anc.forEach(function (a) { putInline(a, orig.get(a), true); });
    reads.forEach(function (r) { if (T.scaled(r.fs, 100) == null) return; orig.set(r.e, r); putInline(r.e, r, true); });
  }

  function putInline(e, o, on) {
    if (on) {
      var fs = T.scaled(o.fs, level);
      if (fs != null) e.style.setProperty('font-size', fs + 'px', 'important');
      var lh = o.lh != null ? T.scaled(o.lh, level) : null;
      if (lh != null) e.style.setProperty('line-height', lh + 'px', 'important');
    } else {
      restoreProp(e, 'font-size', o.inl.fs, o.inl.fsp); restoreProp(e, 'line-height', o.inl.lh, o.inl.lhp);
    }
  }
  function restoreProp(e, prop, val, pri) { if (val) e.style.setProperty(prop, val, pri); else e.style.removeProperty(prop); }

  function relevel() { orig.forEach(function (o, e) { if (e.isConnected) putInline(e, o, true); else orig.delete(e); }); scanAll(); }

  function restoreAll() {
    if (observer) { observer.disconnect(); observer = null; }
    orig.forEach(function (o, e) { putInline(e, o, false); });
    orig.clear(); queue = []; active = false;
  }

  // chunked so a big page does not freeze: ~800 elements per slice
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
      observer = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.type === 'characterData') { var p = m.target.parentElement; if (p && !orig.has(p) && wanted(p)) { queue.push(p); schedule(); } continue; }
          if (m.target.nodeType === 1 && !orig.has(m.target) && wanted(m.target)) { queue.push(m.target); schedule(); }   // an empty element that just got its text
          for (var j = 0; j < m.addedNodes.length; j++) if (m.addedNodes[j].nodeType === 1) enqueue(m.addedNodes[j]);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
  }

  // ---- popup messages -----------------------------------------------------------------------------------------------------
  try {
    chrome.runtime.onMessage.addListener(function (m, sender, send) {
      if (!m || !m.mests || window !== window.top) return;
      if (m.mests === 'get') send({ level: level, host: host, tracked: orig.size });
    });
  } catch (e) { /* ignore */ }

  load();
})();
