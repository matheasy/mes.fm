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

  function init() {
    var v = document.querySelectorAll('.video-embed video, #videoEmbed video');
    for (var k = 0; k < v.length; k++) attach(v[k]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
