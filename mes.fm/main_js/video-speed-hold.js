/* video-speed-hold.js -- press-and-hold (mouse or finger) on a video's picture = 2x playback while held, like YouTube.
   While holding, drag left / right to change the speed: 0.1x steps up to 4x, then whole 1x steps up to 10x (like Telegram).
   Releasing restores the previous speed. Attaches to every <video> inside a .video-embed; the native control bar (bottom ~56px)
   is left alone so seeking / buttons behave as before, and a plain tap or click still pauses / plays.
   Does nothing for the YouTube fallback iframe (cross-origin, cannot be intercepted). */
(function () {
  'use strict';
  var HOLD_MS = 350;      // press this long without moving to start the boost
  var MOVE_CANCEL = 10;   // px of movement before the hold starts = it is a scroll / drag, not a hold
  var PX_PER_STEP = 14;   // horizontal px per speed step while dragging
  var CONTROLS_PX = 56;   // native control bar height: presses there are not holds
  var LEVELS = [], i;
  for (i = 1; i <= 40; i++) LEVELS.push(Math.round(i * 10) / 100);   // 0.1 .. 4.0
  for (i = 5; i <= 10; i++) LEVELS.push(i);                          // 5 .. 10
  var START = LEVELS.indexOf(2);

  function fmt(r) { return (r >= 4 ? String(r) : r.toFixed(1)) + '×'; }

  var css = document.createElement('style');
  css.textContent =
    '.vsh-pill{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:6;display:none;pointer-events:none;' +
    'padding:.3em .9em;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font:600 15px/1.3 Arial,Helvetica,sans-serif;white-space:nowrap}' +
    '.vsh-pill small{font-weight:400;opacity:.75;margin:0 .5em}' +
    '.vsh-pill.on{display:block}' +
    '.vsh-active{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}';
  document.head.appendChild(css);

  function attach(video) {
    if (video.__vsh) return;
    video.__vsh = true;
    var box = video.parentElement;
    var pill = document.createElement('div');
    pill.className = 'vsh-pill';
    pill.setAttribute('aria-hidden', 'true');
    box.appendChild(pill);

    var timer = null, pid = null, x0 = 0, y0 = 0, held = false, base = 1, idx = START, swallow = 0;

    function show(r, dragging) {
      pill.innerHTML = (dragging ? '◀<small>' : '<small>') + fmt(r) + (dragging ? '</small>▶' : '</small>');
      pill.classList.add('on');
    }
    function end() {
      clearTimeout(timer); timer = null;
      if (held) {
        video.playbackRate = base;
        held = false;
        swallow = Date.now() + 500;   // the release would otherwise toggle play / pause
        pill.classList.remove('on');
        box.classList.remove('vsh-active');
        try { if (pid !== null) video.releasePointerCapture(pid); } catch (e) {}
      }
      pid = null;
    }

    video.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (video.paused || video.ended || pid !== null) return;
      var r = video.getBoundingClientRect();
      if (video.controls && r.bottom - e.clientY < CONTROLS_PX) return;
      pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
      timer = setTimeout(function () {
        timer = null;
        held = true;
        base = video.playbackRate || 1;
        idx = START;
        video.playbackRate = LEVELS[idx];
        box.classList.add('vsh-active');
        show(LEVELS[idx], false);
        try { video.setPointerCapture(pid); } catch (e2) {}
      }, HOLD_MS);
    });

    video.addEventListener('pointermove', function (e) {
      if (e.pointerId !== pid) return;
      var dx = e.clientX - x0;
      if (!held) {
        if (Math.abs(dx) > MOVE_CANCEL || Math.abs(e.clientY - y0) > MOVE_CANCEL) { clearTimeout(timer); timer = null; pid = null; }
        return;
      }
      var n = Math.max(0, Math.min(LEVELS.length - 1, START + Math.round(dx / PX_PER_STEP)));
      if (n !== idx) { idx = n; video.playbackRate = LEVELS[idx]; }
      show(LEVELS[idx], true);
    });

    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      video.addEventListener(t, function (e) { if (e.pointerId === pid || t === 'pointercancel') end(); });
    });
    video.addEventListener('pause', end);
    document.addEventListener('visibilitychange', end);

    // a finger held still on a phone opens the long-press menu / starts a scroll: stop both while boosting
    video.addEventListener('contextmenu', function (e) { if (held || timer) e.preventDefault(); });
    video.addEventListener('touchmove', function (e) { if (held && e.cancelable) e.preventDefault(); }, { passive: false });
    box.addEventListener('click', function (e) {
      if (swallow && Date.now() < swallow) { e.preventDefault(); e.stopPropagation(); swallow = 0; }
    }, true);
  }

  /* ---- Left / Right arrow keys = back / forward 5 seconds, like YouTube ----
     Acts on the video you last used if it is on screen, else a playing one on screen, else the most visible one.
     Ignored while typing (inputs, text areas, editable text), on sliders / tabs / menus, with Ctrl / Alt / Cmd,
     and when no video is on screen (the arrows then scroll the page as usual). */
  var SEEK = 5, lastVideo = null, seekTimer = null;
  css.textContent +=
    '.vsh-seek{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:6;pointer-events:none;opacity:0;' +
    'transition:opacity .2s;padding:.45em 1em;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font:600 16px/1.3 Arial,Helvetica,sans-serif;white-space:nowrap}' +
    '.vsh-seek.on{opacity:1;transition:none}' +
    '.vsh-cov{opacity:0 !important;visibility:hidden !important;pointer-events:none !important;transition:opacity .2s,visibility 0s .2s !important}';

  function allVideos() { return document.querySelectorAll('.video-embed video, #videoEmbed video'); }
  function shown(v) {
    var r = v.getBoundingClientRect(), h = window.innerHeight || document.documentElement.clientHeight;
    if (!r.width || !r.height) return 0;
    return Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0)) / r.height;
  }
  function pickVideo() {
    if (lastVideo && document.contains(lastVideo) && shown(lastVideo) > 0.15) return lastVideo;
    var v = allVideos(), best = null, bestScore = 0, k, s;
    for (k = 0; k < v.length; k++) {
      s = shown(v[k]);
      if (s <= 0.15) continue;
      if (!v[k].paused) s += 2;
      if (s > bestScore) { bestScore = s; best = v[k]; }
    }
    return best;
  }
  function seekPill(v, text) {
    var box = v.parentElement, p = box.querySelector('.vsh-seek');
    if (!p) { p = document.createElement('div'); p.className = 'vsh-seek'; p.setAttribute('aria-hidden', 'true'); box.appendChild(p); }
    p.textContent = text;
    p.classList.add('on');
    clearTimeout(seekTimer);
    seekTimer = setTimeout(function () { p.classList.remove('on'); }, 650);
  }
  function typing(t) {
    if (!t || t === document.body) return false;
    if (t.isContentEditable) return true;
    var tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    var role = t.getAttribute && t.getAttribute('role');
    return /^(slider|spinbutton|tab|listbox|option|menu|menuitem|combobox|textbox|separator|scrollbar)$/.test(role || '');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (typing(e.target)) return;
    var v = (e.target && e.target.tagName === 'VIDEO') ? e.target : pickVideo();
    if (!v || !v.readyState) return;
    e.preventDefault();
    e.stopPropagation();   // a focused <video> would otherwise also seek with its own built-in step
    var d = isFinite(v.duration) ? v.duration : Infinity;
    var t = v.currentTime + (e.key === 'ArrowRight' ? SEEK : -SEEK);
    v.currentTime = Math.max(0, Math.min(d - 0.05, t));
    lastVideo = v;
    seekPill(v, e.key === 'ArrowRight' ? SEEK + ' s ▶▶' : '◀◀ ' + SEEK + ' s');
  }, true);
  document.addEventListener('pointerdown', function (e) {
    var v = e.target && e.target.closest && e.target.closest('.video-embed, #videoEmbed');
    v = v && v.querySelector('video');
    if (v) lastVideo = v;
  }, true);
  document.addEventListener('play', function (e) { if (e.target && e.target.tagName === 'VIDEO') lastVideo = e.target; }, true);

  /* ---- Wide View / Theater Mode: fixed side panels (Jump-to list, "More like this" rail, their tabs) no longer
     cover the widened video. A panel that overlaps it fades out while the video is on screen and comes back as
     soon as you scroll past it, or go back to Default View. */
  var PANELS = '.toc-sidebar, .toc-resize, .toc-reopen, .mes-aside--rail, .mes-rail-show';
  var covRaf = 0;
  function overlaps(a, b) { return a.width && a.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
  function checkCover() {
    covRaf = 0;
    var big = document.querySelectorAll('.video-embed.theater-mode, .video-embed.wide-mode, #videoEmbed.theater-mode, #videoEmbed.wide-mode');
    var rects = [], k, j;
    for (k = 0; k < big.length; k++) rects.push(big[k].getBoundingClientRect());
    var ps = document.querySelectorAll(PANELS);
    for (k = 0; k < ps.length; k++) {
      var r = ps[k].getBoundingClientRect(), hit = false;
      for (j = 0; j < rects.length && !hit; j++) hit = overlaps(r, rects[j]);
      ps[k].classList.toggle('vsh-cov', hit);
    }
  }
  function queueCover() { if (!covRaf) covRaf = requestAnimationFrame(checkCover); }
  function laterCover() { queueCover(); setTimeout(checkCover, 120); setTimeout(checkCover, 350); }
  window.addEventListener('scroll', queueCover, { passive: true });
  // panels built later (the Jump-to rail is made by jump-aside.js after load) are caught by a light re-check
  setInterval(function () { if (document.querySelector('.theater-mode, .wide-mode, .vsh-cov')) checkCover(); }, 800);
  window.addEventListener('resize', laterCover);
  document.addEventListener('transitionend', function (e) { if (e.target && e.target.classList && e.target.classList.contains('video-embed')) queueCover(); }, true);
  if (window.MutationObserver) {
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var t = ms[i].target;
        if (t === document.body || t === document.documentElement || (t.classList && (t.classList.contains('video-embed') || t.id === 'videoEmbed'))) { laterCover(); return; }
      }
    }).observe(document.body || document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  function init() {
    var v = allVideos();
    for (var k = 0; k < v.length; k++) attach(v[k]);
    laterCover();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
