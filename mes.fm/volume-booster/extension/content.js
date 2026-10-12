/* MES Volume Booster: video mode. Injected into the page (every frame of the active tab) only when you use the popup or a shortcut. It routes the
   page's <video> / <audio> elements through a Web Audio gain node (with the optional soft limiter), so a quiet video can go louder than the site's
   own volume control allows. The site's volume slider still works: it is applied first, the boost on top. Nothing leaves the browser. */
(function () {
  'use strict';
  if (window.__mesvb) return;
  var V = window.MESVB, ctx = null, nodes = new WeakMap(), level = 100, limiter = true, listening = false;

  function findMedia(root, out) {
    var list = root.querySelectorAll ? root.querySelectorAll('video,audio') : [];
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var j = 0; j < all.length && j < 40000; j++) if (all[j].shadowRoot) findMedia(all[j].shadowRoot, out);
    return out;
  }
  function media() { return findMedia(document, []); }

  // routing a cross-origin file that does not allow it into Web Audio would silence it for good, so only blob: (the normal case for YouTube and
  // other streaming players), data:, same-origin and CORS-enabled sources are touched
  function safe(el) {
    var s = el.currentSrc || el.src || '';
    if (!s || /^(blob|data):/.test(s)) return true;
    try { if (new URL(s, location.href).origin === location.origin) return true; } catch (e) { /* ignore */ }
    return el.hasAttribute('crossorigin');
  }

  function attach(el) {
    var n = nodes.get(el);
    if (n) return n;
    if (!safe(el)) return { unsafe: true };
    try {
      var src = ctx.createMediaElementSource(el);
      n = { graph: V.buildGraph(ctx, src, level, limiter) };
      nodes.set(el, n);
      return n;
    } catch (e) { return { error: true }; }
  }

  async function running() {
    if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; ctx = new AC(); }
    if (ctx.state !== 'running') { try { await Promise.race([ctx.resume(), new Promise(function (r) { setTimeout(r, 400); })]); } catch (e) { /* ignore */ } }
    return ctx.state === 'running';
  }

  // a video that starts playing after the boost was set joins it
  function listen() {
    if (listening) return;
    listening = true;
    document.addEventListener('play', function (e) {
      var el = e.target;
      if (level !== 100 && ctx && ctx.state === 'running' && el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) { var n = attach(el); if (n.graph) n.graph.setLevel(level); }
    }, true);
  }

  var api = {
    status: function () {
      var els = media(), boosted = 0, unsafe = 0;
      els.forEach(function (el) { if (nodes.has(el)) boosted++; else if (!safe(el)) unsafe++; });
      return { media: els.length, boosted: boosted, unsafe: unsafe, level: level, suspended: !!ctx && ctx.state !== 'running' };
    },
    // set the boost for every video in this frame; at 100% nothing that is not already routed gets touched
    set: async function (l, lim) {
      level = V.clampLevel(l, 1000);
      if (typeof lim === 'boolean') limiter = lim;
      var els = media(), res = { media: els.length, applied: 0, unsafe: 0, suspended: false, level: level };
      if (!els.length) return res;
      var need = els.some(function (el) { return nodes.has(el); }) || level !== 100;
      if (!need) return res;
      if (!(await running())) { res.suspended = true; return res; }
      listen();
      els.forEach(function (el) {
        if (level === 100 && !nodes.has(el)) return;
        var n = attach(el);
        if (n.graph) { n.graph.setLevel(level); n.graph.setLimiter(limiter); res.applied++; } else if (n.unsafe) res.unsafe++;
      });
      return res;
    }
  };
  window.__mesvb = api;
})();
