/* MES Dark Mode: setups (profiles) and pure helpers. Loaded by the content script, popup, options page and the node tests
   (node tool_apps_src/dark-mode-tests.js). */
(function (root) {
  'use strict';

  function defaultConfig() {
    return {
      mode: 'dark',            // 'dark' | 'light' | 'system' | 'schedule'
      scheduleFrom: '19:00',   // schedule mode: dark from this time ...
      scheduleTo: '07:00',     // ... until this time
      brightness: 100, contrast: 100, sepia: 0, grayscale: 0,   // percent
      keepImages: true         // show photos / video / canvas in their natural colours
    };
  }

  function builtins() {
    var system = defaultConfig(); system.mode = 'system';
    var night = defaultConfig(); night.brightness = 85; night.contrast = 95; night.sepia = 20;
    var paper = defaultConfig(); paper.mode = 'light'; paper.sepia = 18; paper.brightness = 98;
    return [{ id: 'default', name: 'Dark', config: defaultConfig() }, { id: 'system', name: 'Follow system', config: system },
            { id: 'night', name: 'Night (dim and warm)', config: night }, { id: 'paper', name: 'Paper (light, warm)', config: paper }];
  }

  function num(v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; }
  function time(v, d) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d; }

  function normConfig(c) {
    var out = defaultConfig();
    if (!c || typeof c !== 'object') return out;
    if (['dark', 'light', 'system', 'schedule'].indexOf(c.mode) >= 0) out.mode = c.mode;
    out.scheduleFrom = time(c.scheduleFrom, out.scheduleFrom); out.scheduleTo = time(c.scheduleTo, out.scheduleTo);
    out.brightness = num(c.brightness, 40, 150, 100); out.contrast = num(c.contrast, 40, 150, 100);
    out.sepia = num(c.sepia, 0, 100, 0); out.grayscale = num(c.grayscale, 0, 100, 0);
    if (typeof c.keepImages === 'boolean') out.keepImages = c.keepImages;
    return out;
  }

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // everything stored in chrome.storage.sync under "mesdm"
  function merge(stored) {
    var out = { v: 1, enabled: true, active: 'default', profiles: [], siteModes: {} };
    if (stored && stored.enabled === false) out.enabled = false;
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
    if (stored && stored.siteModes && typeof stored.siteModes === 'object') {
      for (var h in stored.siteModes) if (['dark', 'light', 'off'].indexOf(stored.siteModes[h]) >= 0) out.siteModes[h.toLowerCase()] = stored.siteModes[h];
    }
    return out;
  }

  function profileById(S, id) {
    for (var i = 0; i < S.profiles.length; i++) if (S.profiles[i].id === id) return S.profiles[i];
    return S.profiles[0];
  }

  // 'dark' | 'light' | 'off' | '' (follow the setup) for a site; the longest matching entry wins
  function siteMode(S, host) {
    host = String(host || '').toLowerCase();
    var best = '', bl = -1;
    for (var d in S.siteModes) if ((host === d || host.slice(-(d.length + 1)) === '.' + d) && d.length > bl) { best = S.siteModes[d]; bl = d.length; }
    return best;
  }

  function minutes(t) { var m = /^(\d\d):(\d\d)$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; }
  // is `nowMin` (minutes since midnight) inside the window from -> to (which may run past midnight)?
  function inWindow(nowMin, from, to) {
    var a = minutes(from), b = minutes(to);
    if (a === b) return false;
    return a < b ? nowMin >= a && nowMin < b : nowMin >= a || nowMin < b;
  }

  // should the page end up dark?
  function wantDark(cfg, systemDark, date) {
    if (cfg.mode === 'dark') return true;
    if (cfg.mode === 'light') return false;
    if (cfg.mode === 'system') return !!systemDark;
    var d = date || new Date();
    return inWindow(d.getHours() * 60 + d.getMinutes(), cfg.scheduleFrom, cfg.scheduleTo);
  }

  /* ---- colours ---- */
  function parseColor(str) {
    str = String(str || '').trim().toLowerCase();
    if (!str) return null;
    if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    var m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,\/]\s*([\d.]+%?))?\s*\)$/.exec(str);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: alpha(m[4]) };
    m = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(str);
    if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: alpha(m[4]) };
    return null;
  }
  function alpha(v) { if (v == null) return 1; return /%$/.test(v) ? parseFloat(v) / 100 : parseFloat(v); }
  // 0 (black) .. 1 (white): the colour's perceived brightness
  function lightness(c) { return Math.round((0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 * 1e6) / 1e6; }
  // samples = lightness values (null = unknown, ignored). -> true dark, false light, null unknown
  function isDarkPage(samples) {
    var v = samples.filter(function (x) { return typeof x === 'number'; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    return med < 0.45;
  }

  /* ---- the CSS that does the work ---- */
  var MEDIA = 'img,picture,video,canvas,embed,object,iframe,[data-mesdm-img],[style*="background-image"]';
  var FLIP = 'invert(1) hue-rotate(180deg)';
  function buildCss(invert, cfg) {
    var f = [];
    if (invert) f.push(FLIP);
    if (cfg.brightness !== 100) f.push('brightness(' + cfg.brightness / 100 + ')');
    if (cfg.contrast !== 100) f.push('contrast(' + cfg.contrast / 100 + ')');
    if (cfg.sepia) f.push('sepia(' + cfg.sepia / 100 + ')');
    if (cfg.grayscale) f.push('grayscale(' + cfg.grayscale / 100 + ')');
    if (!f.length) return '';
    var css = 'html{filter:' + f.join(' ') + ' !important}';
    if (invert) {
      css += 'html{background-color:#fff}';   // a page that paints no background still turns dark
      if (cfg.keepImages) css += MEDIA + '{filter:' + FLIP + ' !important}:is(' + MEDIA + ') :is(' + MEDIA + '){filter:none !important}';
    }
    return css + '@media print{html{filter:none !important}}';
  }

  var api = { defaultConfig: defaultConfig, builtins: builtins, normConfig: normConfig, merge: merge, profileById: profileById, siteMode: siteMode,
              inWindow: inWindow, wantDark: wantDark, parseColor: parseColor, lightness: lightness, isDarkPage: isDarkPage, buildCss: buildCss, uid: uid, MEDIA: MEDIA };
  root.MESDM = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
