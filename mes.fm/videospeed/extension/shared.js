/* MES Video Speed Controller: defaults and pure helpers.
   Loaded by the content script, the popup and the options page (and by the node tests: node tool_apps_src/videospeed-tests.js). */
(function (root) {
  'use strict';
  var MIN = 0.1, MAX = 16;

  var DEFAULTS = {
    keys: { slower: 's', faster: 'd', reset: 'r', preferred: 'g', rewind: 'z', advance: 'x', toggleUi: 'v' },
    step: 0.1,          // speed change per key press / button
    preferred: 1.8,     // the "G" speed
    holdSpeed: 2,       // press and hold the speed label on the video
    seek: 10,           // seconds for rewind / advance
    remember: 'global', // 'global' | 'site' | 'off'
    force: false,       // put the speed back when a page resets it
    overlay: 'fade',    // 'fade' | 'always' | 'hidden'
    opacity: 0.8,
    audio: false,       // also control <audio> elements
    disabledSites: []
  };

  var ACTIONS = [
    ['slower', 'Slower'], ['faster', 'Faster'], ['reset', 'Reset to 1.0 (press again to go back)'],
    ['preferred', 'Preferred speed on / off'], ['rewind', 'Rewind'], ['advance', 'Advance'], ['toggleUi', 'Show / hide the on-video control']
  ];

  function clamp(v) {
    v = Number(v);
    if (!isFinite(v)) return 1;
    return Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100));
  }

  function fmt(v) {
    var s = String(Math.round(v * 100) / 100);
    return s.indexOf('.') < 0 ? s + '.0' : s;
  }

  function stepSpeed(v, dir, step) {
    return clamp(Math.round((v + dir * step) * 100) / 100);
  }

  // press and hold + drag: 0.1x steps up to 4x, then whole steps up to 10x (like the MES 3Speak players)
  function holdSpeed(base, steps) {
    var v;
    if (steps >= 0) {
      if (base >= 4) v = base + steps;
      else {
        var toFour = Math.max(0, Math.round((4 - base) * 10));
        v = steps <= toFour ? base + steps * 0.1 : 4 + (steps - toFour);
      }
    } else v = base + steps * 0.1;
    return clamp(Math.min(10, v));
  }

  function matchesSite(host, list) {
    host = String(host || '').toLowerCase();
    for (var i = 0; i < (list || []).length; i++) {
      var d = String(list[i]).trim().toLowerCase();
      if (d && (host === d || host.slice(-(d.length + 1)) === '.' + d)) return true;
    }
    return false;
  }

  // the name a shortcut is stored under; null when the event has a modifier we do not use
  function keyName(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    var k = e.key;
    if (!k || k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta' || k === 'Dead' || k === 'Unidentified') return null;
    if (k === ' ') return 'space';
    return k.toLowerCase();
  }

  function actionForKey(name, keys) {
    if (!name) return null;
    for (var a in keys) if (keys[a] && keys[a] === name) return a;
    return null;
  }

  function merge(stored) {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    if (!stored || typeof stored !== 'object') return out;
    for (var k in stored) {
      if (k === 'keys' && stored.keys && typeof stored.keys === 'object') {
        for (var a in stored.keys) if (a in out.keys && typeof stored.keys[a] === 'string') out.keys[a] = stored.keys[a];
      } else if (k in out && k !== 'keys') out[k] = stored[k];
    }
    out.step = Math.min(2, Math.max(0.01, Number(out.step) || 0.1));
    out.preferred = clamp(out.preferred);
    out.holdSpeed = clamp(out.holdSpeed);
    out.seek = Math.min(600, Math.max(1, Number(out.seek) || 10));
    out.opacity = Math.min(1, Math.max(0.2, Number(out.opacity) || 0.8));
    if (['global', 'site', 'off'].indexOf(out.remember) < 0) out.remember = 'global';
    if (['fade', 'always', 'hidden'].indexOf(out.overlay) < 0) out.overlay = 'fade';
    if (!Array.isArray(out.disabledSites)) out.disabledSites = [];
    return out;
  }

  var api = { MIN: MIN, MAX: MAX, DEFAULTS: DEFAULTS, ACTIONS: ACTIONS, clamp: clamp, fmt: fmt, stepSpeed: stepSpeed, holdSpeed: holdSpeed, matchesSite: matchesSite, keyName: keyName, actionForKey: actionForKey, merge: merge };
  root.MESVS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
