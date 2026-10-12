/* MES Text Size: settings and pure helpers. Loaded by the content script, the popup, the options page, the service worker and the node tests
   (node tool_apps_src/text-size-tests.js). */
(function (root) {
  'use strict';

  var DEFAULTS = { step: 10, min: 50, max: 300, allLevel: 100, siteLevels: {}, applyTo: 'site' };

  function clampLevel(v, min, max) {
    v = Math.round(Number(v));
    if (!isFinite(v)) return 100;
    return Math.min(max || 300, Math.max(min || 50, v));
  }

  function merge(stored) {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    if (!stored || typeof stored !== 'object') return out;
    if ([5, 10, 15, 25].indexOf(Number(stored.step)) >= 0) out.step = Number(stored.step);
    out.allLevel = clampLevel(stored.allLevel == null ? 100 : stored.allLevel, out.min, out.max);
    if (stored.applyTo === 'all' || stored.applyTo === 'site') out.applyTo = stored.applyTo;
    if (stored.siteLevels && typeof stored.siteLevels === 'object') {
      for (var h in stored.siteLevels) {
        var l = clampLevel(stored.siteLevels[h], out.min, out.max);
        if (l !== 100 || true) out.siteLevels[h.toLowerCase()] = l;
      }
    }
    return out;
  }

  // the entry of the longest site name that matches (example.com also covers www.example.com), or null
  function siteKey(S, host) {
    host = String(host || '').toLowerCase();
    var best = null;
    for (var d in S.siteLevels) if ((host === d || host.slice(-(d.length + 1)) === '.' + d) && (best === null || d.length > best.length)) best = d;
    return best;
  }
  // the level in force on a site: its own, else the all-sites level
  function levelFor(S, host) { var k = siteKey(S, host); return k === null ? S.allLevel : S.siteLevels[k]; }

  function stepLevel(cur, dir, step, min, max) { return clampLevel(Math.round(cur / step) * step + dir * step, min, max); }

  // where a new level is stored: this site (default) or every site
  function withLevel(S, host, level, applyTo) {
    var out = JSON.parse(JSON.stringify(S)); level = clampLevel(level, S.min, S.max);
    if ((applyTo || S.applyTo) === 'all') { out.allLevel = level; var k = siteKey(out, host); if (k !== null) delete out.siteLevels[k]; }
    else { var key = siteKey(out, host) || String(host || '').toLowerCase(); if (key) out.siteLevels[key] = level; }
    return out;
  }

  function parsePx(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  // the size a piece of text gets: original px times the factor, kept to 2 decimals; text under 1px (hidden / icon fonts) is left alone
  function scaled(px, level) { return px == null || px < 1 ? null : Math.round(px * level) / 100; }

  var api = { DEFAULTS: DEFAULTS, merge: merge, clampLevel: clampLevel, siteKey: siteKey, levelFor: levelFor, stepLevel: stepLevel, withLevel: withLevel, parsePx: parsePx, scaled: scaled };
  root.MESTS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
