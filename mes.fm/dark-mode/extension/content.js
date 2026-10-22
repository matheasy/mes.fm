/* MES Dark Mode: content script. Runs in every frame at document_start. It decides whether the page should be dark or light (a switch pressed in this tab,
   the site list, the setup: always, the system theme or a schedule), looks at how the page is already painted, and if they disagree adds one stylesheet that
   inverts the page (and flips photos, video, canvas and iframes back). Nothing leaves the browser. */
(function () {
  'use strict';
  if (window.__mesdmLoaded || typeof chrome === 'undefined' || !chrome.storage || !chrome.runtime) return;
  window.__mesdmLoaded = true;
  var V = window.MESDM, top = window.top === window, here = location.host, host = location.hostname;
  var html = /html/i.test(document.contentType || 'text/html') && document.documentElement && document.documentElement.tagName === 'HTML';
  if (!html) {   // not a page we can change (an image, a PDF), but the service worker still has to hear that the tab moved on
    if (top) try { chrome.runtime.sendMessage({ mesdm: 'hello', h: here }, function () { void chrome.runtime.lastError; }); } catch (e) { /* ignore */ }
    return;
  }

  var S = V.merge(null), cfg = S.profiles[0].config, seen = {}, ready = false, pageDark = null, applied = '', styleEl = null, dead = false;
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var isMes = host === 'mes.fm' || /\.mes\.fm$/.test(host);
  var state = V.decide({ enabled: true, tab: '', site: '', own: false, want: null, pageDark: false });
  var MEDIA_TAGS = { IMG: 1, PICTURE: 1, VIDEO: 1, CANVAS: 1, IFRAME: 1, EMBED: 1, OBJECT: 1 };

  // ---- staying alive, and stepping aside -------------------------------------------------------------------------------
  // When the extension is reloaded or updated, the copy of this script already running in an open page is cut off (it gets no messages and no settings any more)
  // but keeps running, and used to put its stylesheet back every second for as long as the page stayed open: the page stayed dark and a click could not undo it.
  // Now every timer and observer first checks that the extension is still there and otherwise removes everything this copy added.
  var timers = [], observers = [], offs = [], detectTimer = 0, schedTimer = 0;
  function alive() { try { return !dead && !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }
  function listen(t, type, fn, opt) { t.addEventListener(type, fn, opt); offs.push(function () { t.removeEventListener(type, fn, opt); }); }
  function stop() {
    if (dead) return;
    dead = true;
    if (styleEl) styleEl.remove();
    styleEl = null; applied = '';
    timers.forEach(clearInterval); clearInterval(schedTimer); clearTimeout(detectTimer);
    observers.forEach(function (o) { o.disconnect(); });
    offs.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
  }
  function check() { if (!dead && !alive()) stop(); return !dead; }
  // A fresh copy (added by a click after the extension was updated) tells older copies in this page to stop (copies from 1.5.0 on listen for it), and empties the
  // stylesheet of any older copy in place, so one from an older version that keeps re-attaching it has nothing left to apply.
  var wasDark = false, selfStop = false;
  (function quietOld() {
    var l = document.querySelectorAll('style#mesdm-style');
    for (var i = 0; i < l.length; i++) { if (/invert\(/.test(l[i].textContent)) wasDark = true; l[i].textContent = ''; l[i].media = 'not all'; l[i].id = 'mesdm-old'; }
  })();
  listen(document, 'mesdm-stop', function () { if (!selfStop) stop(); });
  selfStop = true; try { document.dispatchEvent(new Event('mesdm-stop')); } catch (e) { /* ignore */ } selfStop = false;
  var swallow = wasDark && !window.__mesdmAdopted ? Date.now() + 5000 : 0;   // that older copy had the page dark and the click that added this copy was meant to switch it back: done already

  // ---- settings -------------------------------------------------------------------------------------------------------
  var pending = [];
  function load() {
    V.loadStored(chrome, function (stored) {
      var got = false, safety = setTimeout(function () { fin(null); }, 800);
      function fin(b) {
        if (got || dead) return;
        got = true; clearTimeout(safety);
        S = V.merge(stored); seen = (b && b.mesdmSeen) || {}; ready = true;
        update(); schedule();
        pending.splice(0).forEach(function (send) { toggle(); try { send({ ok: true }); } catch (e) { /* ignore */ } });
      }
      try { chrome.storage.local.get('mesdmSeen', function (b) { fin(chrome.runtime.lastError ? null : b); }); } catch (e) { fin(null); }
    });
  }
  function onStorage(ch, area) {
    if (!check()) return;
    if ((area === 'sync' || area === 'local') && ch.mesdm) { S = V.merge(ch.mesdm.newValue); update(); }
    if (area === 'local' && ch.mesdmSeen) seen = ch.mesdmSeen.newValue || {};
  }
  try { chrome.storage.onChanged.addListener(onStorage); offs.push(function () { chrome.storage.onChanged.removeListener(onStorage); }); } catch (e) { /* ignore */ }
  function saveAll() {
    try { chrome.storage.sync.set({ mesdm: S }); } catch (e) { /* ignore */ }
    try { chrome.storage.local.set({ mesdm: S }); } catch (e) { /* ignore */ }
  }

  // ---- this tab's own switch ------------------------------------------------------------------------------------------
  // A click switches the page in this tab only. It stays for a reload, back / forward and links within the same site, and is dropped when the tab goes to another
  // site, is duplicated, restored or opened from another page, or when the page has been gone for 30 minutes (rules: tabKeep / tabFinal in shared.js).
  var tabMem = '', ssOk = true, KEY = 'mesdmTab';
  function navType() { try { var e = performance.getEntriesByType('navigation')[0]; return (e && e.type) || ''; } catch (e) { return ''; } }
  function readRec() { try { return sessionStorage.getItem(KEY); } catch (e) { ssOk = false; return null; } }
  function writeRec() { try { if (tabMem) sessionStorage.setItem(KEY, V.tabRec(tabMem, here, Date.now())); else sessionStorage.removeItem(KEY); } catch (e) { ssOk = false; } }
  function tellBg(m) { try { chrome.runtime.sendMessage({ mesdm: 'tabset', h: here, m: m }, function () { void chrome.runtime.lastError; }); } catch (e) { /* ignore */ } }
  function hello() {
    var asked = tabMem;
    try {
      chrome.runtime.sendMessage({ mesdm: 'hello', h: here }, function (r) {
        if (chrome.runtime.lastError || !r || dead || tabMem !== asked) return;   // no answer: the page's own verdict stands; a click in the meantime wins
        var fin = V.tabFinal(asked, typeof r.m === 'string' ? r.m : null, ssOk);
        if (r.m && r.m !== fin) tellBg('');
        if (fin !== tabMem) { tabMem = fin; writeRec(); update(); }
      });
    } catch (e) { /* no answer: keep the page's own verdict */ }
  }
  function decideTab(nav) {
    var raw = readRec();
    tabMem = V.tabKeep(V.parseTabRec(raw), { now: Date.now(), host: here, origin: location.origin, nav: nav, ref: document.referrer, opened: !!window.opener && history.length <= 1 });
    if (tabMem || raw != null) writeRec();   // kept: note the time; dropped (or the bare 'dark' of a version before 1.5.0): remove it
    hello();
  }
  function setTab(m) { tabMem = m; writeRec(); tellBg(m); update(); }
  function tabNow() { return top && S.scope !== 'all' ? tabMem : ''; }   // a switch pressed in this tab only counts while the button is set to "this tab only"

  // ---- deciding and applying ------------------------------------------------------------------------------------------
  // before the page has been looked at, trust what we saw last time on this site, else assume a light page
  function knownDark() { return pageDark != null ? pageDark : seen[host] === 1; }
  function inputs(tab) {
    cfg = V.profileById(S, S.active).config;
    // mes.fm has its own dark mode (moon button, body.dark-mode), so the extension stays out of mes.fm unless switched in this tab or set in the site list by hand
    return { enabled: S.enabled, tab: tab, site: V.siteMode(S, host), own: isMes, want: V.wantDark(cfg, mql.matches, new Date()), pageDark: knownDark() };
  }
  function resolve() { state = V.decide(inputs(tabNow())); }
  function update() {
    if (!ready || !check()) return;
    resolve();
    var w = state.why, css = w === 'tab' ? (state.invert ? V.buildCss(true, cfg) : '') : w === 'site' || w === 'setup' ? V.buildCss(state.invert, cfg) : '';
    report();
    if (css === applied) return;
    applied = css;
    if (!css) { if (styleEl) { styleEl.remove(); styleEl = null; } return; }
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'mesdm-style'; }
    styleEl.textContent = css;
    attach();
    if (/invert\(/.test(css)) yieldReader();
  }
  // MES Read Aloud's page-dark button uses the same invert: two cancel out, so remove its stylesheet and tell its player (it then stays off while ours is on)
  function yieldReader() {
    var r = document.getElementById('mesra-dark-style');
    if (!r) return;
    r.remove();
    try { document.dispatchEvent(new Event('mesra-dark-yield')); } catch (e) { /* ignore */ }
  }
  // some apps (Gmail) rewrite <html> / <head> while they load and drop a style that is not theirs, so put ours back (in <head> once there is one)
  function attach() {
    if (!styleEl || !check()) return;
    var want = document.head || document.documentElement;
    if (styleEl.parentNode !== want) want.appendChild(styleEl);
  }
  function status() {
    var p = V.profileById(S, S.active);
    return { host: host, why: state.why, off: state.off, want: state.want, invert: state.invert, on: state.on, tab: tabNow(), site: V.siteMode(S, host),
             setup: { name: p.name, mode: p.config.mode, from: p.config.scheduleFrom, to: p.config.scheduleTo }, sys: !!mql.matches, pageDark: knownDark(),
             scope: S.scope, toolbar: S.toolbar, enabled: S.enabled, ready: ready };
  }
  // the toolbar button shows what this tab is doing and why (top frame only)
  var lastSig = '';
  function report() {
    if (!top || document.prerendering) return;
    var st = status(), sig = JSON.stringify(st);
    if (sig === lastSig) return;
    lastSig = sig;
    try { chrome.runtime.sendMessage({ mesdm: 'state', st: st }, function () { void chrome.runtime.lastError; }); } catch (e) { /* ignore */ }
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
    // nothing under the point painted a colour: the window shows the <html> background, or the <body> one when <html> has none (CSS carries it over to the whole
    // window, so a short dark page with body{background:#111} is dark everywhere), else the browser's white (or black for color-scheme: dark)
    var b = document.body, bc = b && V.parseColor(getComputedStyle(b).backgroundColor), hc = V.parseColor(getComputedStyle(document.documentElement).backgroundColor);
    if (!(hc && hc.a >= 0.5) && bc && bc.a >= 0.5) return V.lightness(bc);
    var root = getComputedStyle(document.documentElement).colorScheme || '';
    return /\bdark\b/.test(root) && !/\blight\b/.test(root) ? 0 : 1;
  }

  function saveSeen() {
    var keys = Object.keys(seen);
    if (keys.length > 800) keys.slice(0, 200).forEach(function (k) { delete seen[k]; });
    try { chrome.storage.local.set({ mesdmSeen: seen }); } catch (e) { /* ignore */ }
  }
  function detect() {
    if (!check()) return;
    var w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return;
    // a grid over the whole window: a page that mixes a dark frame with a big white reading pane (Gmail) is judged by what covers most of it.
    // Our own stylesheet is switched off while looking, so its white page background is not taken for the page's.
    // Read Aloud's page-dark stylesheet is switched off too, so a light page it inverted is not remembered as a dark site.
    var vals = [], sh = styleEl && styleEl.sheet, ra = document.getElementById('mesra-dark-style'), rs = ra && ra.sheet;
    if (sh) sh.disabled = true;
    if (rs) rs.disabled = true;
    try { for (var gx = 1; gx <= 8; gx++) for (var gy = 1; gy <= 6; gy++) vals.push(sampleAt(Math.floor(w * gx / 9), Math.floor(h * gy / 7))); }
    finally { if (sh) sh.disabled = false; if (rs) rs.disabled = false; }
    var d = V.isDarkPage(vals);
    if (d == null || d === pageDark) return;
    pageDark = d;
    if (top && seen[host] !== (d ? 1 : 0)) { seen[host] = d ? 1 : 0; saveSeen(); }   // frames (widgets, ads) do not speak for their whole site
    update();
  }

  // photos set as CSS backgrounds would turn into negatives: mark them so the stylesheet flips them back
  var queue = [], scanning = false;
  function idle(fn) { if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 500 }); else setTimeout(fn, 50); }
  function markBg(el) {
    if (el.nodeType !== 1 || el === document.documentElement || el === document.body) return;
    var bi;
    // vector pictures (logos, icons: Wikipedia's black wordmark) are drawn for a light page, so they stay inverted with it instead of being flipped back to black-on-dark
    if (el.tagName === 'IMG' && /\.svg(\?|#|$)|^data:image\/svg/i.test(el.currentSrc || el.getAttribute('src') || '')) { el.setAttribute('data-mesdm-vec', ''); return; }
    try { bi = getComputedStyle(el).backgroundImage; } catch (e) { return; }
    if (bi && /\.svg(\?|#|["')])|data:image\/svg/i.test(bi)) return;
    if (!bi || bi === 'none' || !/url\(/.test(bi)) return;
    var r = el.getBoundingClientRect();
    if (r.width * r.height > window.innerWidth * window.innerHeight * 0.6 && el.querySelectorAll('*').length > 40) return;   // a page-sized wrapper with a texture: leave it inverted
    el.setAttribute('data-mesdm-img', '');
  }
  function pump() {
    if (!check()) return;
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

  timers.push(setInterval(function () { if (check() && styleEl && !styleEl.isConnected) attach(); }, 1000));
  function detectSoon(ms) { clearTimeout(detectTimer); detectTimer = setTimeout(detect, ms || 400); }
  function watch(fn, target, opts) { var o = new MutationObserver(fn); o.observe(target, opts); observers.push(o); }

  function observe() {
    if (!window.MutationObserver || dead) return;
    watch(function () { if (check() && styleEl && !styleEl.isConnected) attach(); }, document, { childList: true, subtree: true });
    watch(function (list) {
      if (!check()) return;
      var add = [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i].addedNodes;
        for (var j = 0; j < a.length; j++) if (a[j].nodeType === 1) { add.push(a[j]); if (a[j].querySelectorAll) { var q = a[j].querySelectorAll('*'); for (var k = 0; k < q.length && k < 400; k++) add.push(q[k]); } }
        if (add.length > 2000) break;
      }
      if (add.length) enqueue(add);
    }, document.documentElement, { childList: true, subtree: true });
    // a page flipping its own theme (class / data-theme / style on html or body)
    var opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-bs-theme', 'data-color-mode', 'data-mode', 'theme'] };
    var themed = function () { if (check()) detectSoon(500); };
    watch(themed, document.documentElement, opts);
    var watchBody = function () { if (document.body && !dead) watch(themed, document.body, opts); };
    if (document.body) watchBody(); else listen(document, 'DOMContentLoaded', watchBody);
  }

  function schedule() {
    clearInterval(schedTimer);
    schedTimer = setInterval(function () { if (check() && ready && !document.hidden && cfg.mode === 'schedule') update(); }, 60000);
  }
  var onScheme = function () { update(); };
  if (mql.addEventListener) { mql.addEventListener('change', onScheme); offs.push(function () { mql.removeEventListener('change', onScheme); }); }
  else if (mql.addListener) { mql.addListener(onScheme); offs.push(function () { mql.removeListener(onScheme); }); }

  // ---- the toolbar button / shortcut / panel ---------------------------------------------------------------------------
  function toggle() {
    resolve();
    if (Date.now() < swallow) { swallow = 0; if (!state.invert) { setTab(''); return; } }
    if (S.scope === 'all') {   // every page: the setup itself flips between dark and leaving pages alone (and this site's own Dark / Light entry goes)
      var dark = state.want !== true, k = V.siteKey(S, host);
      V.profileById(S, S.active).config.mode = dark ? 'dark' : 'manual';
      if (k && S.siteModes[k] !== 'off') delete S.siteModes[k];
      saveAll(); update();
    } else setTab(V.clickTab(inputs(tabMem)));
  }
  function onMessage(m, sender, send) {
    if (!m || !m.mesdm || !top || !check()) return;
    if (m.mesdm === 'toggle') {
      if (!ready) { pending.push(send); return true; }   // the settings are not read yet: switch as soon as they are
      toggle(); send({ ok: true });
    } else if (m.mesdm === 'status') {
      if (ready) resolve();
      send(status());
    }
  }
  try { chrome.runtime.onMessage.addListener(onMessage); offs.push(function () { chrome.runtime.onMessage.removeListener(onMessage); }); } catch (e) { /* ignore */ }

  // ---- go -----------------------------------------------------------------------------------------------------------------
  load();
  if (top) {
    if (document.prerendering) listen(document, 'prerenderingchange', function () { if (check()) { decideTab(navType()); update(); } }, { once: true });
    else decideTab(navType());
    listen(window, 'pagehide', function () { if (tabMem && alive()) writeRec(); });   // note when the page went, for the 30 minutes
    listen(document, 'freeze', function () { if (tabMem && alive()) writeRec(); });
    listen(window, 'pageshow', function (e) { if (e.persisted && check()) { lastSig = ''; decideTab('back_forward'); update(); } });   // back from the back/forward cache: ask again
  }
  listen(document, 'visibilitychange', function () { check(); });
  var start = function () { if (!check()) return; observe(); scanAll(); detect(); setTimeout(detect, 800); setTimeout(detect, 2500); };
  if (document.readyState === 'loading') listen(document, 'DOMContentLoaded', start); else start();
  listen(window, 'load', function () { if (check()) detectSoon(150); });
})();
