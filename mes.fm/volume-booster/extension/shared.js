/* MES Volume Booster: settings, pure helpers and the Web Audio graph. Loaded by the popup, the options page, the service worker, the offscreen
   document and the node tests (node tool_apps_src/volume-booster-tests.js). */
(function (root) {
  'use strict';

  var DEFAULTS = { max: 600, step: 25, limiter: true, remember: true, mode: 'video' };   // mode: 'video' = boost the page's video player, 'tab' = the whole tab's sound
  var PRESETS = [100, 150, 200, 300, 400, 600];

  function merge(stored) {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    if (stored && typeof stored === 'object') {
      if ([200, 400, 600].indexOf(Number(stored.max)) >= 0) out.max = Number(stored.max);
      if ([5, 10, 25, 50].indexOf(Number(stored.step)) >= 0) out.step = Number(stored.step);
      if (typeof stored.limiter === 'boolean') out.limiter = stored.limiter;
      if (typeof stored.remember === 'boolean') out.remember = stored.remember;
      if (stored.mode === 'video' || stored.mode === 'tab') out.mode = stored.mode;
    }
    return out;
  }

  function clampLevel(v, max) {
    v = Math.round(Number(v));
    if (!isFinite(v)) return 100;
    return Math.min(max || 600, Math.max(0, v));
  }
  function stepLevel(cur, dir, step, max) { return clampLevel(Math.round(cur / step) * step + dir * step, max); }
  function gainFor(level) { return clampLevel(level, 1000) / 100; }
  function badge(level) { return level === 100 ? '' : level + '%'; }
  // the same boost is reported in decibels so people can compare it with other tools
  function decibels(level) { return level <= 0 ? -Infinity : Math.round(20 * Math.log10(level / 100) * 10) / 10; }

  /* ---- Web Audio: source -> gain -> (soft limiter) -> destination. Returns { gain, limiter, setLimiter(on), setLevel(l) } ----
     The limiter is a soft clipper (a WaveShaper): signals below about half scale pass through unchanged and the peaks that a big boost creates are
     rounded off towards +-1 instead of being cut flat by the speakers. (A DynamicsCompressorNode would add make-up gain of its own and make the
     boost differ from the percentage shown.) */
  var HEADROOM = 4;   // the shaper sees the boosted signal divided by this, so it can round off peaks up to 4x full scale
  function softClipCurve(size) {
    var c = new Float32Array(size), i, x, u;
    for (i = 0; i < size; i++) { u = i / (size - 1) * 2 - 1; x = u * HEADROOM; c[i] = x / Math.pow(1 + Math.pow(Math.abs(x), 4), 0.25); }
    return c;
  }
  function buildGraph(ctx, source, level, limiter) {
    var gain = ctx.createGain(), pre = ctx.createGain(), shaper = ctx.createWaveShaper();
    gain.gain.value = gainFor(level);
    pre.gain.value = 1 / HEADROOM; shaper.curve = softClipCurve(4096); shaper.oversample = '4x';
    var graph = { gain: gain, limiter: !!limiter };
    function wire() {
      [gain, pre, shaper].forEach(function (n) { try { n.disconnect(); } catch (e) { /* not connected yet */ } });
      if (graph.limiter) { gain.connect(pre); pre.connect(shaper); shaper.connect(ctx.destination); } else gain.connect(ctx.destination);
    }
    source.connect(gain); wire();
    graph.setLimiter = function (on) { graph.limiter = !!on; wire(); };
    graph.setLevel = function (l) { gain.gain.setTargetAtTime(gainFor(l), ctx.currentTime, 0.015); };
    return graph;
  }

  var api = { softClipCurve: softClipCurve, DEFAULTS: DEFAULTS, PRESETS: PRESETS, merge: merge, clampLevel: clampLevel, stepLevel: stepLevel,
              gainFor: gainFor, badge: badge, decibels: decibels, buildGraph: buildGraph };
  root.MESVB = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
