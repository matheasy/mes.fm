/* MES Dark Mode: content script. Runs in every frame at document_start. It decides whether the page should be dark or light (the setup, the
   site's own choice, the system theme or a schedule), looks at how the page is already painted, and if they disagree adds one stylesheet that
   inverts the page (and flips photos, video, canvas and iframes back). Nothing leaves the browser. */
(function () {
  'use strict';
  if (window.__mesdmLoaded || typeof chrome === 'undefined' || !chrome.storage) return;
  window.__mesdmLoaded = true;
  var ct = document.contentType || 'text/html';
  if (!/html/i.test(ct) || !document.documentElement || document.documentElement.tagName !== 'HTML') return;

  var V = window.MESDM, host = location.hostname;
  var S = V.merge(null), cfg = S.profiles[0].config, seen = {}, ready = false, pageDark = null, applied = '', styleEl = null;
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var state = { off: false, want: true, invert: false };
  var MEDIA_TAGS = { IMG: 1, PICTURE: 1, VIDEO: 1, CANVAS: 1, IFRAME: 1, EMBED: 1, OBJECT: 1 };

  // ---- settings -------------------------------------------------------------------------------------------------------
  function load() {
    try {
      chrome.storage.sync.get('mesdm', function (a) {
        chrome.storage.local.get('mesdmSeen', function (b) {
          S = V.merge(a && a.mesdm); seen = (b && b.mesdmSeen) || {};
          ready = true; update();
          schedule();
        });
      });
    } catch (e) { /* the extension was reloaded: this old script goes quiet */ }
  }
  try {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'sync' && ch.mesdm) { S = V.merge(ch.mesdm.newValue); update(); }
      if (area === 'local' && ch.mesdmSeen) seen = ch.mesdmSeen.newValue || {};
    });
  } catch (e) { /* ignore */ }

  // ---- deciding and applying ------------------------------------------------------------------------------------------
  function resolve() {
    cfg = V.profileById(S, S.active).config;
    var ov = V.siteMode(S, host);
    state.off = !S.enabled || ov === 'off';
    state.want = ov === 'dark' ? true : ov === 'light' ? false : V.wantDark(cfg, mql.matches, new Date());
  }

  // before the page has been looked at, trust what we saw last time on this site, else assume a light page
  function knownDark() { return pageDark != null ? pageDark : seen[host] === 1; }

  function update() {
    if (!ready) return;
    resolve();
    var invert = !state.off && state.want !== knownDark();
    state.invert = invert;
    var css = state.off ? '' : V.buildCss(invert, cfg);
    if (css === applied) return;
    applied = css;
    if (!css) { if (styleEl) { styleEl.remove(); styleEl = null; } return; }
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'mesdm-style'; }
    styleEl.textContent = css;
    if (!styleEl.parentNode) document.documentElement.appendChild(styleEl);
  }

  // ---- looking at the page --------------------------------------------------------------------------------------------
  function sampleAt(x, y) {
    var list;
    try { list = document.elementsFromPoint(x, y); } catch (e) { return null; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (MEDIA_TAGS[el.tagName]) return null;
      var cs = getComputedStyle(el), c = V.parseColor(cs.backgroundColor);
      if (c && c.a >= 0.5) return V.lightness(c);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /url\(/.test(cs.backgroundImage)) return null;
    }
    var root = getComputedStyle(document.documentElement).colorScheme || '';
    return /\bdark\b/.test(root) && !/\blight\b/.test(root) ? 0 : 1;   // nothing painted a colour: the browser's white (or black for color-scheme: dark)
  }

  function detect() {
    var w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return;
    var pts = [[0.3, 0.35], [0.7, 0.35], [0.3, 0.55], [0.7, 0.55], [0.3, 0.75], [0.7, 0.75]], vals = [];
    pts.forEach(function (p) { vals.push(sampleAt(Math.floor(w * p[0]), Math.floor(h * p[1]))); });
    var d = V.isDarkPage(vals);
    if (d == null) return;
    if (d !== pageDark) {
      pageDark = d;
      if (seen[host] !== (d ? 1 : 0)) {
        seen[host] = d ? 1 : 0;
        var keys = Object.keys(seen);
        if (keys.length > 800) keys.slice(0, 200).forEach(function (k) { delete seen[k]; });
        try { chrome.storage.local.set({ mesdmSeen: seen }); } catch (e) { /* ignore */ }
      }
      update();
    }
  }

  // photos set as CSS backgrounds would turn into negatives: mark them so the stylesheet flips them back
  var queue = [], scanning = false;
  function idle(fn) { if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 500 }); else setTimeout(fn, 50); }
  function markBg(el) {
    if (el.nodeType !== 1 || el === document.documentElement || el === document.body) return;
    var bi;
    try { bi = getComputedStyle(el).backgroundImage; } catch (e) { return; }
    if (!bi || bi === 'none' || !/url\(/.test(bi)) return;
    var r = el.getBoundingClientRect();
    if (r.width * r.height > window.innerWidth * window.innerHeight * 0.6 && el.querySelectorAll('*').length > 40) return;   // a page-sized wrapper with a texture: leave it inverted
    el.setAttribute('data-mesdm-img', '');
  }
  function pump() {
    scanning = true;
    var n = 0;
    while (queue.length && n < 250) { markBg(queue.pop()); n++; }
    if (queue.length) idle(pump); else scanning = false;
  }
  function enqueue(nodes) {
    for (var i = 0; i < nodes.length; i++) queue.push(nodes[i]);
    if (!scanning) idle(pump);
  }
  function scanAll() { enqueue(document.querySelectorAll('*')); }

  var detectTimer = 0;
  function detectSoon(ms) { clearTimeout(detectTimer); detectTimer = setTimeout(detect, ms || 400); }

  function observe() {
    if (!window.MutationObserver) return;
    new MutationObserver(function (list) {
      var add = [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i].addedNodes;
        for (var j = 0; j < a.length; j++) if (a[j].nodeType === 1) { add.push(a[j]); if (a[j].querySelectorAll) { var q = a[j].querySelectorAll('*'); for (var k = 0; k < q.length && k < 400; k++) add.push(q[k]); } }
        if (add.length > 2000) break;
      }
      if (add.length) enqueue(add);
    }).observe(document.documentElement, { childList: true, subtree: true });
    // a page flipping its own theme (class / data-theme / style on html or body)
    var tm = new MutationObserver(function () { detectSoon(500); });
    var opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-bs-theme', 'data-color-mode', 'data-mode', 'theme'] };
    tm.observe(document.documentElement, opts);
    var attach = function () { if (document.body) tm.observe(document.body, opts); };
    if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);
  }

  var timer = 0;
  function schedule() {
    clearInterval(timer);
    timer = setInterval(function () { if (ready && !document.hidden && cfg.mode === 'schedule') update(); }, 60000);
  }
  if (mql.addEventListener) mql.addEventListener('change', function () { update(); }); else if (mql.addListener) mql.addListener(function () { update(); });

  // ---- the keyboard shortcut / popup ---------------------------------------------------------------------------------------
  function setSite(mode) {
    var m = JSON.parse(JSON.stringify(S.siteModes));
    if (mode) m[host] = mode; else delete m[host];
    S.siteModes = m;
    try { chrome.storage.sync.set({ mesdm: S }); } catch (e) { /* ignore */ }
    update();
  }
  try {
    chrome.runtime.onMessage.addListener(function (m, sender, send) {
      if (!m || !m.mesdm || window !== window.top) return;
      if (m.mesdm === 'toggle') { resolve(); setSite(state.want ? 'light' : 'dark'); }
      else if (m.mesdm === 'status') {
        resolve();
        send({ host: host, off: state.off, want: state.want, invert: state.invert, pageDark: knownDark(), override: V.siteMode(S, host) });
      }
    });
  } catch (e) { /* ignore */ }

  // ---- go -----------------------------------------------------------------------------------------------------------------
  load();
  var start = function () { observe(); scanAll(); detect(); setTimeout(detect, 800); setTimeout(detect, 2500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('load', function () { detectSoon(150); });
})();
