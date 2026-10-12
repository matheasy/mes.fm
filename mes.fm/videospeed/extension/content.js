/* MES Video Speed Controller: content script. Finds every <video> (and optionally <audio>) in this frame, including ones inside
   open shadow roots, and adds keyboard shortcuts plus a small on-video control. Nothing leaves the browser. */
(function () {
  'use strict';
  if (window.__mesvsLoaded || typeof chrome === 'undefined' || !chrome.storage) return;
  window.__mesvsLoaded = true;

  var V = window.MESVS;
  var S = V.merge(null), P = V.resolveProfile(S, location.hostname).config, profKey = '';
  var on = false, ready = false;
  var media = new Set();
  var observed = new WeakSet();
  var observers = [];
  var active = null;
  var globalSpeed = null, siteSpeeds = {};
  var host = location.hostname;
  var hiddenLocal = false, showUntil = 0, tickTimer = 0, scanTimer = 0, saveTimer = 0;
  var ui = null, off = { dx: 8, dy: 8 }, offSaveTimer = 0;

  // ---- settings -------------------------------------------------------------------------------------------------------
  function enabledHere() { return !V.matchesSite(host, S.disabledSites); }

  function pickProfile() {
    var rp = V.resolveProfile(S, host);
    P = rp.config;
    var k = rp.id + ':' + P.hideByDefault;
    if (k !== profKey) { profKey = k; hiddenLocal = P.hideByDefault; }
  }

  function load() {
    try {
      chrome.storage.sync.get('mesvs', function (a) {
        chrome.storage.local.get(['mesvsSpeed', 'mesvsSites', 'mesvsPos'], function (b) {
          if (b && b.mesvsPos && isFinite(b.mesvsPos.dx) && isFinite(b.mesvsPos.dy)) off = { dx: b.mesvsPos.dx, dy: b.mesvsPos.dy };
          S = V.merge(a && a.mesvs);
          globalSpeed = b && typeof b.mesvsSpeed === 'number' ? b.mesvsSpeed : null;
          siteSpeeds = (b && b.mesvsSites) || {};
          ready = true;
          sync();
        });
      });
    } catch (e) { /* extension was reloaded: this old script just goes quiet */ }
  }

  try {
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'sync' && ch.mesvs) { S = V.merge(ch.mesvs.newValue); sync(); }
      if (area === 'local') {
        if (ch.mesvsSpeed) globalSpeed = typeof ch.mesvsSpeed.newValue === 'number' ? ch.mesvsSpeed.newValue : null;
        if (ch.mesvsSites) siteSpeeds = ch.mesvsSites.newValue || {};
      }
    });
  } catch (e) { /* ignore */ }

  function sync() {
    if (!ready) return;
    pickProfile();
    if (enabledHere()) start(); else stop();
    if (on) { collect(document); tick(); }
  }

  function initialSpeed() {
    if (P.remember === 'global') return globalSpeed;
    if (P.remember === 'site') return typeof siteSpeeds[host] === 'number' ? siteSpeeds[host] : null;
    return null;
  }

  function persist(v) {
    if (P.remember === 'off') return;
    if (P.remember === 'global') globalSpeed = v; else siteSpeeds[host] = v;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        if (P.remember === 'global') chrome.storage.local.set({ mesvsSpeed: v });
        else chrome.storage.local.set({ mesvsSites: siteSpeeds });
      } catch (e) { /* ignore */ }
    }, 300);
  }

  // ---- media elements -------------------------------------------------------------------------------------------------
  function setRate(el, v) { el.__mesWant = v; try { el.playbackRate = v; } catch (e) { /* ignore */ } }

  function applyInitial(el) {
    var key = el.currentSrc || el.src || '';
    if (el.__mesKey === key) return;
    el.__mesKey = key;
    var sp = initialSpeed();
    if (sp) setRate(el, V.clamp(sp));
  }

  function register(el) {
    if (media.has(el)) return;
    if (el.tagName === 'AUDIO' && !P.audio) return;
    media.add(el);
    el.__mesWant = el.playbackRate;
    el.addEventListener('loadedmetadata', function () { if (on) applyInitial(el); });
    el.addEventListener('play', function () { if (!on) return; applyInitial(el); active = el; });
    el.addEventListener('ratechange', function (e) {
      if (!on || Math.abs(el.playbackRate - (el.__mesWant || 1)) < 0.001) return;   // our own change
      if (P.force && el.__mesWant) { e.stopImmediatePropagation(); setRate(el, el.__mesWant); return; }
      el.__mesWant = el.playbackRate;   // the page or its own speed menu changed it: follow it
      if (el === active) flash();
    }, true);
    if (on) applyInitial(el);
  }

  function scanRoot(root) {
    if (root.querySelectorAll) { var l = root.querySelectorAll('video,audio'); for (var i = 0; i < l.length; i++) register(l[i]); }
  }

  function watch(root) {
    if (observed.has(root)) return;
    observed.add(root);
    var mo = new MutationObserver(function (list) {
      if (!on) return;
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'VIDEO' || n.tagName === 'AUDIO') register(n);
          else { scanRoot(n); if (n.shadowRoot) collect(n.shadowRoot); }
        }
      }
    });
    mo.observe(root, { childList: true, subtree: true });
    observers.push(mo);
  }

  // register media in a root and in every open shadow root below it
  function collect(root) {
    scanRoot(root);
    watch(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT), n, c = 0;
    while ((n = w.nextNode()) && c++ < 40000) if (n.shadowRoot) collect(n.shadowRoot);
  }

  function pickActive() {
    if (active && active.isConnected && media.has(active)) return active;
    var best = null, bestScore = -1;
    media.forEach(function (el) {
      if (!el.isConnected) { media.delete(el); return; }
      var r = el.getBoundingClientRect(), score = r.width * r.height + (el.paused ? 0 : 1e9);
      if (score > bestScore) { best = el; bestScore = score; }
    });
    return best;
  }

  // ---- changing the speed ---------------------------------------------------------------------------------------------
  function userSet(v, temp) {
    var el = pickActive();
    if (!el) return null;
    v = V.clamp(v);
    setRate(el, v);
    if (!temp) persist(v);
    active = el;
    flash();
    return v;
  }

  function doAction(a, val) {
    var el = pickActive();
    if (!el) return false;
    var cur = el.playbackRate, spec = V.ACT[a], n = val > 0 ? val : (spec && spec.def);
    if (a === 'slower') userSet(V.stepSpeed(cur, -1, n));
    else if (a === 'faster') userSet(V.stepSpeed(cur, 1, n));
    else if (a === 'reset') {
      if (Math.abs(cur - n) > 0.001) { el.__mesPrev = cur; userSet(n); } else if (el.__mesPrev) userSet(el.__mesPrev);
    } else if (a === 'preferred') {
      if (Math.abs(cur - n) < 0.001) userSet(1); else userSet(n);
    } else if (a === 'rewind') { el.currentTime = Math.max(0, el.currentTime - n); flash(); }
    else if (a === 'advance') { el.currentTime = el.currentTime + n; flash(); }
    else if (a === 'toggleUi') { hiddenLocal = !hiddenLocal; flash(); }
    else if (a === 'setMarker') { el.__mesMark = el.currentTime; flash(); }
    else if (a === 'jumpMarker') { if (typeof el.__mesMark === 'number') el.currentTime = el.__mesMark; flash(); }
    else return false;
    return true;
  }

  // the step / seconds / speed a button on the control uses: the first binding of that action in the current setup
  function stepOf(action) { var b = V.bindingFor(action, P.bindings); return b ? b.value : undefined; }

  function typing(e) {
    var t = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!t || t.nodeType !== 1) return false;
    var tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  function onKey(e) {
    if (!on || e.defaultPrevented || typing(e)) return;
    var bd = V.bindingForKey(V.keyName(e), P.bindings);
    if (!bd || !pickActive()) return;
    if (doAction(bd.action, bd.value) && P.exclusive) { e.preventDefault(); e.stopImmediatePropagation(); }
  }

  // ---- the on-video control -------------------------------------------------------------------------------------------
  var CSS = '*{box-sizing:border-box}.bar{display:flex;align-items:center;gap:0;padding:2px 3px;border-radius:999px;background:rgba(20,20,24,.82);color:#fff;font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);user-select:none;-webkit-user-select:none;transition:opacity .2s}' +
    'button{all:unset;cursor:pointer;color:#fff;min-width:22px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:999px;font:600 15px/1 system-ui,sans-serif;touch-action:none}' +
    'button:hover,button:focus-visible{background:rgba(255,255,255,.22)}' +
    '.v{min-width:46px;padding:0 3px;font-size:13px;font-variant-numeric:tabular-nums}' +
    '.v.hold{background:#2563a8}.g{cursor:grab;min-width:14px;font-size:12px;letter-spacing:-2px;color:#c5c9d1}.g.drag{cursor:grabbing}.x{min-width:20px;font-size:14px;color:#c5c9d1}.x:hover{color:#fff}';

  function buildUi() {
    var h = document.createElement('div');
    h.setAttribute('data-mesvs', '');
    h.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:none;left:0;top:0';
    var sh = h.attachShadow({ mode: 'closed' });
    sh.innerHTML = '<style>' + CSS + '</style><div class="bar" role="group" aria-label="MES Video Speed Controller"><button class="g" title="Drag to move this control">&#8942;&#8942;</button><button class="m" title="Slower (hold to change faster and faster)">&minus;</button><button class="v" title="Click: reset / back. Press and hold: temporary fast speed, drag left or right to change it">1.00&times;</button><button class="p" title="Faster (hold to change faster and faster)">+</button><button class="x" title="Hide this control. Bring it back with the Show/hide shortcut or the toolbar menu" aria-label="Hide controller">&times;</button></div>';
    ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'contextmenu'].forEach(function (t) {
      h.addEventListener(t, function (e) { e.stopPropagation(); });
    });
    var bar = sh.querySelector('.bar'), label = sh.querySelector('.v');
    // a press steps once; holding repeats and keeps getting faster (every repeat comes 15% sooner, down to 60 ms)
    function repeater(btn, act) {
      var t = 0, iv = 200, on2 = false;
      function stopR() { clearTimeout(t); on2 = false; }
      btn.addEventListener('pointerdown', function (e) {
        if (e.button > 0) return;
        try { btn.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        act(); iv = 200; on2 = true;
        t = setTimeout(function loop() { if (!on2) return; act(); iv = Math.max(60, iv * 0.85); t = setTimeout(loop, iv); }, 380);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { btn.addEventListener(ev, stopR); });
      btn.addEventListener('click', function (e) { if (e.detail === 0) act(); });   // keyboard activation
    }
    repeater(sh.querySelector('.m'), function () { doAction('slower', stepOf('slower')); });
    repeater(sh.querySelector('.p'), function () { doAction('faster', stepOf('faster')); });
    sh.querySelector('.x').addEventListener('click', function () { hiddenLocal = true; tick(); });
    var grip = sh.querySelector('.g'), drag = null;
    grip.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      drag = { x: e.clientX, y: e.clientY, dx: off.dx, dy: off.dy };
      grip.classList.add('drag');
      try { grip.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      e.preventDefault();
    });
    grip.addEventListener('pointermove', function (e) {
      if (!drag) return;
      off = { dx: drag.dx + e.clientX - drag.x, dy: drag.dy + e.clientY - drag.y };
      showUntil = Date.now() + 2800; tick();
    });
    function dropGrip() {
      if (!drag) return;
      drag = null; grip.classList.remove('drag');
      clearTimeout(offSaveTimer);
      offSaveTimer = setTimeout(function () { try { chrome.storage.local.set({ mesvsPos: off }); } catch (e) { /* ignore */ } }, 200);
    }
    grip.addEventListener('pointerup', dropGrip);
    grip.addEventListener('pointercancel', dropGrip);
    grip.addEventListener('dblclick', function () { off = { dx: 8, dy: 8 }; dropGrip(); tick(); });
    var hold = null;
    label.addEventListener('pointerdown', function (e) {
      var el = pickActive();
      if (!el || e.button > 0) return;
      hold = { x: e.clientX, prev: el.playbackRate, on: false };
      try { label.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      hold.t = setTimeout(function () { hold.on = true; label.classList.add('hold'); userSet(P.holdSpeed, true); }, 260);
    });
    label.addEventListener('pointermove', function (e) {
      if (hold && hold.on) userSet(V.holdSpeed(P.holdSpeed, Math.trunc((e.clientX - hold.x) / 16)), true);
    });
    function end() {
      if (!hold) return;
      clearTimeout(hold.t);
      var h2 = hold; hold = null;
      label.classList.remove('hold');
      if (h2.on) { var el = pickActive(); if (el) { setRate(el, h2.prev); flash(); } } else { var rb = V.bindingFor('reset', P.bindings); doAction('reset', rb ? rb.value : 1); }
    }
    label.addEventListener('pointerup', end);
    label.addEventListener('pointercancel', end);
    return { host: h, bar: bar, label: label };
  }

  function flash() { showUntil = Date.now() + 2800; tick(); }

  function tick() {
    if (!on) return;
    var el = pickActive();
    if (!ui) { if (!el) return; ui = buildUi(); }
    var show = false, r = null;
    if (el && !hiddenLocal) {
      r = el.getBoundingClientRect();
      var big = r.width >= 160 && r.height >= 90 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      show = big && (P.overlay === 'always' || Date.now() < showUntil);
    }
    if (!show) { if (ui.host.style.display !== 'none') ui.host.style.display = 'none'; return; }
    var fs = document.fullscreenElement, parent = document.documentElement;
    if (fs && fs.nodeType === 1 && !(fs instanceof HTMLMediaElement)) parent = fs;
    if (ui.host.parentNode !== parent) parent.appendChild(ui.host);
    ui.host.style.display = 'block';
    var bw = ui.bar.offsetWidth || 150, bh = ui.bar.offsetHeight || 30;
    ui.host.style.left = Math.min(Math.max(0, innerWidth - bw), Math.max(0, Math.max(0, r.left) + off.dx)) + 'px';
    ui.host.style.top = Math.min(Math.max(0, innerHeight - bh), Math.max(0, Math.max(0, r.top) + off.dy)) + 'px';
    ui.bar.style.opacity = String(P.opacity);
    var t = V.fmt2(el.playbackRate) + '×';
    if (ui.label.textContent !== t) ui.label.textContent = t;
  }

  var lastMove = 0;
  function onMove(e) {
    if (!on || P.overlay !== 'fade') return;
    var now = Date.now();
    if (now - lastMove < 100) return;
    lastMove = now;
    var hit = null, area = Infinity;
    media.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && r.width * r.height < area) { hit = el; area = r.width * r.height; }
    });
    if (hit) { active = hit; flash(); }
  }

  // ---- popup messages ---------------------------------------------------------------------------------------------------
  try {
    chrome.runtime.onMessage.addListener(function (m, sender, send) {
      if (!on || !m || !m.mesvs) return;
      var el = pickActive();
      if (!el) return;
      if (m.mesvs === 'set') userSet(m.speed);
      else if (m.mesvs === 'action') doAction(m.action, m.value);
      else if (m.mesvs === 'ui') { hiddenLocal = !m.show; if (m.show) { showUntil = Date.now() + 4000; } tick(); }
      send({ speed: el.playbackRate, paused: el.paused, count: media.size, host: host, hidden: hiddenLocal });
    });
  } catch (e) { /* ignore */ }

  // ---- start / stop -------------------------------------------------------------------------------------------------------
  var listening = false;
  function start() {
    if (on) return;
    on = true;
    if (!listening) {
      listening = true;
      window.addEventListener('keydown', onKey, true);
      document.addEventListener('mousemove', onMove, true);
      window.addEventListener('scroll', function () { if (on) tick(); }, true);
      window.addEventListener('resize', function () { if (on) tick(); });
      document.addEventListener('fullscreenchange', function () { if (on) tick(); });
    }
    clearInterval(tickTimer); tickTimer = setInterval(tick, 400);
    clearInterval(scanTimer); scanTimer = setInterval(function () { if (!document.hidden) collect(document); }, 3000);
    media.forEach(applyInitial);
  }

  function stop() {
    if (!on) return;
    on = false;
    clearInterval(tickTimer); clearInterval(scanTimer);
    if (ui) { ui.host.remove(); ui = null; }
  }

  load();
})();
