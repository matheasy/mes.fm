/* MES Video Speed Controller: defaults, setups (profiles) and pure helpers.
   Loaded by the content script, the popup and the options page (and by the node tests: node tool_apps_src/videospeed-tests.js). */
(function (root) {
  'use strict';
  var MIN = 0.1, MAX = 16;

  // every shortcut action; "value" = the number a binding carries (0.1 step, 10 seconds, 1.0 speed...)
  var ACTIONS = [
    { id: 'toggleUi',   label: 'Show/hide controller' },
    { id: 'slower',     label: 'Decrease speed', value: 'Step',    def: 0.1, min: 0.01, max: 2,   step: 0.01 },
    { id: 'faster',     label: 'Increase speed', value: 'Step',    def: 0.1, min: 0.01, max: 2,   step: 0.01 },
    { id: 'rewind',     label: 'Rewind',         value: 'Seconds', def: 10,  min: 1,    max: 600, step: 1 },
    { id: 'advance',    label: 'Advance',        value: 'Seconds', def: 10,  min: 1,    max: 600, step: 1 },
    { id: 'reset',      label: 'Reset speed',    value: 'Speed',   def: 1,   min: 0.1,  max: 16,  step: 0.05 },
    { id: 'preferred',  label: 'Preferred speed', value: 'Speed',  def: 1.8, min: 0.1,  max: 16,  step: 0.05 },
    { id: 'setMarker',  label: 'Set marker' },
    { id: 'jumpMarker', label: 'Jump to marker' }
  ];
  var ACT = {};
  ACTIONS.forEach(function (a) { ACT[a.id] = a; });

  function b(action, key, value) { var o = { action: action, key: key }; if (value !== undefined) o.value = value; return o; }

  // the standard setup
  function defaultConfig() {
    return {
      bindings: [b('toggleUi', 'v'), b('slower', 's', 0.1), b('faster', 'd', 0.1), b('rewind', 'z', 10), b('advance', 'x', 10),
                 b('reset', 'r', 1), b('preferred', 'g', 1.8), b('setMarker', 'm'), b('jumpMarker', 'j')],
      remember: 'global',     // 'global' | 'site' | 'off'
      overlay: 'fade',        // 'fade' (on mouse move) | 'always'
      hideByDefault: false,   // controller stays hidden until the Show/hide shortcut
      opacity: 0.8,
      audio: false,           // also control <audio> elements
      exclusive: true,        // stop the website from also handling the shortcut keys
      force: false,           // put the speed back when a page resets it
      holdSpeed: 2            // press and hold the speed label on the video
    };
  }

  // MES's own setup
  function mesConfig() {
    var c = defaultConfig();
    c.bindings = [b('toggleUi', 'v'), b('slower', '[', 0.05), b('faster', ']', 0.05), b('rewind', 'z', 1), b('advance', 'x', 1),
                  b('reset', 'y', 1), b('preferred', 'p', 2), b('setMarker', 'm'), b('jumpMarker', 'j')];
    c.remember = 'off'; c.hideByDefault = true; c.exclusive = false;
    return c;
  }

  function builtins() {
    return [{ id: 'default', name: 'Default', config: defaultConfig() }, { id: 'mes', name: "MES's setup", config: mesConfig() }];
  }

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

  function bindingForKey(name, bindings) {
    if (!name) return null;
    for (var i = 0; i < (bindings || []).length; i++) if (bindings[i].key && bindings[i].key === name) return bindings[i];
    return null;
  }

  function bindingFor(action, bindings) {
    for (var i = 0; i < (bindings || []).length; i++) if (bindings[i].action === action) return bindings[i];
    return null;
  }

  function oneOf(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }

  function normConfig(c) {
    var out = defaultConfig();
    if (!c || typeof c !== 'object') return out;
    if (Array.isArray(c.bindings)) {
      out.bindings = [];
      c.bindings.slice(0, 40).forEach(function (x) {
        if (!x || !ACT[x.action]) return;
        var a = ACT[x.action], o = { action: x.action, key: typeof x.key === 'string' ? x.key.toLowerCase().slice(0, 24) : '' };
        if (a.value) { var n = Number(x.value); o.value = isFinite(n) && n > 0 ? Math.min(a.max, Math.max(a.min, n)) : a.def; }
        out.bindings.push(o);
      });
    }
    out.remember = oneOf(c.remember, ['global', 'site', 'off'], out.remember);
    out.overlay = oneOf(c.overlay, ['fade', 'always'], out.overlay);
    ['hideByDefault', 'audio', 'exclusive', 'force'].forEach(function (k) { if (typeof c[k] === 'boolean') out[k] = c[k]; });
    var op = Number(c.opacity); if (isFinite(op) && op > 0) out.opacity = Math.min(1, Math.max(0.2, op));
    var hs = Number(c.holdSpeed); if (isFinite(hs) && hs > 0) out.holdSpeed = clamp(hs);
    return out;
  }

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // a complete settings object from whatever is in storage
  function merge(stored) {
    var out = { v: 2, active: 'default', profiles: [], siteProfiles: {}, disabledSites: [] };
    if (stored && Array.isArray(stored.profiles) && stored.profiles.length) {
      var seen = {};
      stored.profiles.slice(0, 30).forEach(function (p) {
        if (!p || typeof p.id !== 'string' || seen[p.id]) return;
        seen[p.id] = 1;
        out.profiles.push({ id: p.id, name: String(p.name || 'Setup').slice(0, 40), config: normConfig(p.config) });
      });
    }
    if (!out.profiles.length) out.profiles = builtins();
    out.active = stored && out.profiles.some(function (p) { return p.id === stored.active; }) ? stored.active : out.profiles[0].id;
    if (stored && stored.siteProfiles && typeof stored.siteProfiles === 'object') {
      for (var h in stored.siteProfiles) if (out.profiles.some(function (p) { return p.id === stored.siteProfiles[h]; })) out.siteProfiles[h.toLowerCase()] = stored.siteProfiles[h];
    }
    if (stored && Array.isArray(stored.disabledSites)) out.disabledSites = stored.disabledSites.map(String);
    return out;
  }

  function profileById(S, id) {
    for (var i = 0; i < S.profiles.length; i++) if (S.profiles[i].id === id) return S.profiles[i];
    return S.profiles[0];
  }

  // which setup applies on a site: its own choice, else the active one
  function resolveProfile(S, host) {
    host = String(host || '').toLowerCase();
    for (var d in S.siteProfiles) if (host === d || host.slice(-(d.length + 1)) === '.' + d) return profileById(S, S.siteProfiles[d]);
    return profileById(S, S.active);
  }

  var api = { MIN: MIN, MAX: MAX, ACTIONS: ACTIONS, ACT: ACT, defaultConfig: defaultConfig, mesConfig: mesConfig, builtins: builtins, clamp: clamp, fmt: fmt,
              stepSpeed: stepSpeed, holdSpeed: holdSpeed, matchesSite: matchesSite, keyName: keyName, bindingForKey: bindingForKey, bindingFor: bindingFor,
              normConfig: normConfig, merge: merge, profileById: profileById, resolveProfile: resolveProfile, uid: uid };
  root.MESVS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
