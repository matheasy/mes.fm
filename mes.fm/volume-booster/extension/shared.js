/* MES Volume Booster: settings, pure helpers and the Web Audio graph. Loaded by the popup, the options page, the service worker, the offscreen
   document and the node tests (node tool_apps_src/volume-booster-tests.js). */
(function (root) {
  'use strict';

  var DEFAULTS = { max: 600, step: 25, limiter: true, remember: true };
  var PRESETS = [100, 150, 200, 300, 400, 600];

  function merge(stored) {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    if (stored && typeof stored === 'object') {
      if ([200, 400, 600].indexOf(Number(stored.max)) >= 0) out.max = Number(stored.max);
      if ([5, 10, 25, 50].indexOf(Number(stored.step)) >= 0) out.step = Number(stored.step);
      if (typeof stored.limiter === 'boolean') out.limiter = stored.limiter;
      if (typeof stored.remember === 'boolean') out.remember = stored.remember;
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

  /* ---- Web Audio: source -> gain -> (limiter) -> destination. Returns { gain, comp, setLimiter(on), setLevel(l) } ---- */
  function buildGraph(ctx, source, level, limiter) {
    var gain = ctx.createGain(), comp = ctx.createDynamicsCompressor();
    gain.gain.value = gainFor(level);
    // a fast, hard limiter: catches the peaks a big boost creates instead of letting the speakers clip
    comp.threshold.value = -4; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.002; comp.release.value = 0.12;
    var api = { gain: gain, comp: comp, limiter: !!limiter };
    function wire() {
      try { gain.disconnect(); } catch (e) { /* not connected yet */ }
      try { comp.disconnect(); } catch (e) { /* not connected yet */ }
      if (api.limiter) { gain.connect(comp); comp.connect(ctx.destination); } else gain.connect(ctx.destination);
    }
    source.connect(gain); wire();
    api.setLimiter = function (on) { api.limiter = !!on; wire(); };
    api.setLevel = function (l) { gain.gain.setTargetAtTime(gainFor(l), ctx.currentTime, 0.015); };
    return api;
  }

  var api = { DEFAULTS: DEFAULTS, PRESETS: PRESETS, merge: merge, clampLevel: clampLevel, stepLevel: stepLevel, gainFor: gainFor, badge: badge, decibels: decibels, buildGraph: buildGraph };
  root.MESVB = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
