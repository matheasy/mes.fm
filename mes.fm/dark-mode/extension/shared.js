/* MES Dark Mode: setups (profiles) and pure helpers. Loaded by the content script, the service worker, the popup, the options page and the node tests
   (node tool_apps_src/dark-mode-tests.js). */
(function (root) {
  'use strict';

  var BUILTIN_DEFAULT = 'Only when I switch it on';

  function defaultConfig() {
    return {
      mode: 'manual',          // 'manual' (nothing changes until you switch a tab on) | 'dark' | 'light' | 'system' | 'schedule'
      scheduleFrom: '19:00',   // schedule mode: dark from this time ...
      scheduleTo: '07:00',     // ... until this time
      brightness: 100, contrast: 100, sepia: 0, grayscale: 0,   // percent
      keepImages: true         // show photos / video / canvas in their natural colours
    };
  }

  function builtins() {
    var system = defaultConfig(); system.mode = 'system';
    var always = defaultConfig(); always.mode = 'dark';
    var night = defaultConfig(); night.mode = 'dark'; night.brightness = 85; night.contrast = 95; night.sepia = 20;
    var paper = defaultConfig(); paper.mode = 'light'; paper.sepia = 18; paper.brightness = 98;
    return [{ id: 'default', name: BUILTIN_DEFAULT, config: defaultConfig() }, { id: 'always', name: 'Always dark (every page)', config: always }, { id: 'system', name: 'Follow system', config: system },
            { id: 'night', name: 'Night (dim and warm)', config: night }, { id: 'paper', name: 'Paper (light, warm)', config: paper }];
  }

  function num(v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; }
  function time(v, d) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d; }

  function normConfig(c) {
    var out = defaultConfig();
    if (!c || typeof c !== 'object') return out;
    if (['manual', 'dark', 'light', 'system', 'schedule'].indexOf(c.mode) >= 0) out.mode = c.mode;
    out.scheduleFrom = time(c.scheduleFrom, out.scheduleFrom); out.scheduleTo = time(c.scheduleTo, out.scheduleTo);
    out.brightness = num(c.brightness, 40, 150, 100); out.contrast = num(c.contrast, 40, 150, 100);
    out.sepia = num(c.sepia, 0, 100, 0); out.grayscale = num(c.grayscale, 0, 100, 0);
    if (typeof c.keepImages === 'boolean') out.keepImages = c.keepImages;
    return out;
  }

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* Everything stored in chrome.storage.sync (and a copy in .local) under "mesdm", made safe, plus the one-time clean-ups of older versions.
     -> { S: the settings, reset: what an upgrade changed (empty when nothing was) }.
     v3 (1.5.0): before 1.3.0 a click on the toolbar button was saved per site in the site list and synced, so a site clicked once (mail.google.com ...) stayed dark
     everywhere, for good, with no visible reason. Those Dark / Light entries are removed (Off is kept: that was only ever set by hand). "What the button changes: All pages"
     turned one click into a permanent whole-browser setting (and the next click made dark pages light), so it goes back to "Only this tab". The built-in default setup
     ("Only when I switch it on") is put back to that if its mode was changed, since a press with "All pages" did exactly that. Any other setup the person picked is kept. */
  function migrate(stored) {
    var out = { v: 3, enabled: true, toolbar: 'toggle', scope: 'tab', active: 'default', profiles: [], siteModes: {} };   // toolbar: what clicking the toolbar button does: 'toggle' = switch this tab dark / light, 'menu' = open the panel
    var reset = { sites: [], scope: false, setup: '', kept: '' };
    var old = stored && typeof stored === 'object' ? (Number(stored.v) || 1) : 3;
    if (stored && stored.enabled === false) out.enabled = false;
    if (stored && stored.toolbar === 'menu') out.toolbar = 'menu';
    if (stored && stored.scope === 'all') out.scope = 'all';   // scope: what the toolbar button / shortcut changes: 'tab' = only the tab it is pressed in, 'all' = every page (flips the setup between dark and as-it-was)
    if (stored && Array.isArray(stored.profiles) && stored.profiles.length) {
      var seen = {};
      stored.profiles.slice(0, 30).forEach(function (p) {
        if (!p || typeof p.id !== 'string' || seen[p.id]) return;
        seen[p.id] = 1;
        out.profiles.push({ id: p.id, name: String(p.name || 'Setup').slice(0, 40), config: normConfig(p.config) });
      });
    }
    if (old < 2) out.profiles.forEach(function (p) { if (p.id === 'default' && p.config.mode === 'dark') { p.config.mode = 'manual'; p.name = BUILTIN_DEFAULT; reset.setup = 'dark'; } });   // v2: dark mode is no longer applied to every page by default
    if (!out.profiles.length) out.profiles = builtins();
    out.active = stored && out.profiles.some(function (p) { return p.id === stored.active; }) ? stored.active : out.profiles[0].id;
    if (stored && stored.siteModes && typeof stored.siteModes === 'object') {
      for (var h in stored.siteModes) {
        var mode = stored.siteModes[h], key = String(h).toLowerCase();
        if (['dark', 'light', 'off'].indexOf(mode) < 0 || !key) continue;
        if (old < 3 && mode !== 'off') { reset.sites.push(key); continue; }
        out.siteModes[key] = mode;
      }
    }
    if (old < 3) {
      if (out.scope === 'all') { out.scope = 'tab'; reset.scope = true; }
      out.profiles.forEach(function (p) { if (p.id === 'default' && p.name === BUILTIN_DEFAULT && p.config.mode !== 'manual') { reset.setup = p.config.mode; p.config.mode = 'manual'; } });
      var act = profileById(out, out.active);
      if (['dark', 'system', 'schedule'].indexOf(act.config.mode) >= 0) reset.kept = act.name;
    }
    return { S: out, reset: reset };
  }
  function merge(stored) { return migrate(stored).S; }
  function anyReset(r) { return !!(r && ((r.sites && r.sites.length) || r.scope || r.setup || r.kept)); }   // anything to tell the person

  // one line for the options page about what migrate() changed (empty when nothing was changed)
  function resetText(r) {
    if (!anyReset(r)) return '';
    var parts = [], sites = Array.isArray(r.sites) ? r.sites.map(String) : [];
    if (sites.length) parts.push('removed ' + (sites.length === 1 ? 'a per-site Dark / Light choice' : sites.length + ' per-site Dark / Light choices') + ' left over from the old one-click button (' + sites.slice(0, 6).join(', ') + (sites.length > 6 ? ', ...' : '') + ')');
    if (r.scope) parts.push('set “What the button changes” back to “Only this tab”');
    if (r.setup) parts.push('set the setup “' + BUILTIN_DEFAULT + '” back to leaving pages alone (it was ' + (r.setup === 'dark' ? 'dark on every page' : r.setup === 'light' ? 'light on every page' : r.setup) + ')');
    var t = parts.length ? 'Version 1.5.0 cleaned up old settings once: it ' + join(parts) + '.' : 'Version 1.5.0 checked your old settings once and changed nothing.';
    if (r.kept) t += (parts.length ? ' Kept: the' : ' Note: the') + ' setup “' + String(r.kept) + '” you chose changes every page; pick “' + BUILTIN_DEFAULT + '” at the top to leave pages alone.';
    return t;
  }
  function join(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  function profileById(S, id) {
    for (var i = 0; i < S.profiles.length; i++) if (S.profiles[i].id === id) return S.profiles[i];
    return S.profiles[0];
  }

  // the site-list entry that applies to a host (the longest matching one): its key or ''
  function siteKey(S, host) {
    host = String(host || '').toLowerCase();
    var best = '';
    for (var d in S.siteModes) if ((host === d || host.slice(-(d.length + 1)) === '.' + d) && d.length > best.length) best = d;
    return best;
  }
  // 'dark' | 'light' | 'off' | '' (follow the setup) for a site
  function siteMode(S, host) { var k = siteKey(S, host); return k ? S.siteModes[k] : ''; }

  function minutes(t) { var m = /^(\d\d):(\d\d)$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; }
  // is `nowMin` (minutes since midnight) inside the window from -> to (which may run past midnight)?
  function inWindow(nowMin, from, to) {
    var a = minutes(from), b = minutes(to);
    if (a === b) return false;
    return a < b ? nowMin >= a && nowMin < b : nowMin >= a || nowMin < b;
  }

  // should the page end up dark?
  function wantDark(cfg, systemDark, date) {
    if (cfg.mode === 'manual') return null;   // no opinion: leave the page alone unless this tab was switched
    if (cfg.mode === 'dark') return true;
    if (cfg.mode === 'light') return false;
    if (cfg.mode === 'system') return !!systemDark;
    var d = date || new Date();
    return inWindow(d.getHours() * 60 + d.getMinutes(), cfg.scheduleFrom, cfg.scheduleTo);
  }

  /* What happens to a page, and why. o = { enabled, tab: this tab's own switch ('dark' | 'light' | ''), site: its site-list entry ('dark' | 'light' | 'off' | ''),
     own: the site has a dark mode of its own (mes.fm), want: wantDark() of the setup (true / false / null), pageDark: does the page look dark by itself }.
     -> { why: 'disabled' | 'tab' | 'siteoff' | 'site' | 'mesfm' | 'none' | 'setup', off, want, invert, on (= we are making it dark) }
     The tab's own switch wins and is obeyed literally ('dark' always inverts, 'light' never does); the site list and the setup only invert a page that does not
     already look the way they want. */
  function decide(o) {
    var why = !o.enabled ? 'disabled' : o.tab ? 'tab' : o.site === 'off' ? 'siteoff' : o.site ? 'site' : o.own ? 'mesfm' : o.want == null ? 'none' : 'setup';
    var want = why === 'tab' ? o.tab === 'dark' : why === 'site' ? o.site === 'dark' : why === 'setup' ? !!o.want : null;
    var invert = why === 'tab' ? want : why === 'site' || why === 'setup' ? want !== !!o.pageDark : false;
    return { why: why, off: why === 'disabled' || why === 'siteoff' || why === 'mesfm', want: want, invert: !!invert, on: !!invert && want === true };
  }
  // the switch a click stores for this tab: dark, or back to the page's own colours ('light' only when the site list / setup would otherwise change it)
  function clickTab(o) {
    if (!decide(o).invert) return 'dark';
    var base = {}; for (var k in o) base[k] = o[k]; base.tab = '';
    return decide(base).invert ? 'light' : '';
  }

  /* ---- this tab's own switch ----
     The page keeps a timestamped record in its sessionStorage: {"m":"dark","h":"mail.google.com","t":1760000000000}. sessionStorage lasts as long as the tab and is
     copied into duplicated tabs, tabs restored after a restart or reopened, and windows the page opens, so on its own it made a click linger for days. A record
     still counts only for a reload, back / forward, or a link within the same site (same-origin referrer); not for a page opened by another page, typed or
     restored, nor once the page has been gone for TAB_AWAY. The service worker also keeps each tab's switch (chrome.storage.session, keyed by tab id, dropped
     when the tab goes to another site, closes or the browser restarts), and the page only keeps its switch when both agree (tabFinal). */
  var TAB_AWAY = 30 * 60 * 1000;
  function tabRec(m, h, now) { return JSON.stringify({ m: m, h: h, t: now }); }
  // the stored text -> { m, h, t } or null (also for the bare 'dark' / 'light' of versions before 1.5.0, which is not trusted)
  function parseTabRec(s) {
    if (typeof s !== 'string' || s.charAt(0) !== '{') return null;
    var r; try { r = JSON.parse(s); } catch (e) { return null; }
    return r && (r.m === 'dark' || r.m === 'light') && typeof r.h === 'string' && typeof r.t === 'number' && isFinite(r.t) ? { m: r.m, h: r.h, t: r.t } : null;
  }
  function sameOrigin(ref, origin) { if (!ref || !origin || origin === 'null') return false; try { return new URL(ref).origin === origin; } catch (e) { return false; } }
  /* ctx = { now, host (location.host), origin (location.origin), nav: performance navigation type ('navigate' | 'reload' | 'back_forward' | 'prerender'),
     ref: document.referrer, opened: the page was opened by another page (window.opener) and has no history of its own } -> 'dark' | 'light' | '' */
  function tabKeep(rec, ctx) {
    if (!rec || !ctx || rec.h !== ctx.host) return '';
    var age = ctx.now - rec.t;
    if (!(age <= TAB_AWAY) || age < -5 * 60 * 1000) return '';   // gone too long (or the clock jumped back)
    if (ctx.opened) return '';
    if (ctx.nav === 'reload' || ctx.nav === 'back_forward') return rec.m;
    if ((ctx.nav === 'navigate' || ctx.nav === 'prerender') && sameOrigin(ctx.ref, ctx.origin)) return rec.m;
    return '';
  }
  // the page's verdict (local) and the service worker's record of this tab (bg: a mode or '', null = no answer); ssOk = the page could read its sessionStorage
  function tabFinal(local, bg, ssOk) {
    if (bg == null) return local;
    if (!ssOk) return bg === 'dark' || bg === 'light' ? bg : '';
    return local && local === bg ? local : '';
  }
  // service worker side: tabs = { tabId: { h, m } }. A page says hello when it loads: a different host means the tab left the site, so its switch is dropped.
  // passive (a prerendered page, about:blank) only reads.
  function bgHello(tabs, id, host, passive) {
    var r = tabs[id];
    if (!r) return '';
    if (r.h !== host) { if (!passive) delete tabs[id]; return ''; }
    return r.m;
  }
  function bgSet(tabs, id, host, m) { if ((m === 'dark' || m === 'light') && host) tabs[id] = { h: host, m: m }; else delete tabs[id]; }

  /* ---- telling the person why ---- st = the content script's status { why, invert, want, on, host, tab, site, setup: { name, mode, from, to }, sys, scope, toolbar }
     -> { on, text, click } */
  function modeText(s, sys) {
    if (s.mode === 'dark') return 'dark on every page';
    if (s.mode === 'light') return 'light on every page';
    if (s.mode === 'system') return 'follows your system, which is ' + (sys ? 'dark' : 'light') + ' now';
    if (s.mode === 'schedule') return 'dark on a schedule, ' + s.from + ' to ' + s.to;
    return 'leaves pages alone';
  }
  function explain(st) {
    if (!st) return { on: false, text: 'It cannot change this page (browser pages and the Web Store are off limits).', click: '' };
    var h = st.host || 'This site', t, allOn = st.want === true;
    if (st.why === 'disabled') t = 'MES Dark Mode is switched off (the On switch in the panel).';
    else if (st.why === 'mesfm') t = 'mes.fm has its own dark mode (the moon button at the top of the page), so the extension leaves it alone.';
    else if (st.why === 'siteoff') t = h + ' is set to Off in your site list.';
    else if (st.why === 'tab') t = st.tab === 'dark' ? 'You switched this tab to dark.' : 'You switched this tab back to its own colours.';
    else if (st.why === 'site') t = h + ' is set to ' + (st.site === 'dark' ? 'Dark' : 'Light') + ' in your site list.' + (st.invert ? '' : ' This page already looks ' + st.site + ', so it is left alone.');
    else if (st.why === 'setup') t = (st.scope === 'all' && st.setup.mode === 'dark' ? 'Every page is dark: the toolbar button is set to change all pages (setup “' + st.setup.name + '”).' : 'Setup “' + st.setup.name + '”: ' + modeText(st.setup, st.sys) + '.') + (st.invert ? '' : ' This page already looks ' + (st.want ? 'dark' : 'light') + ', so it is left alone.');
    else t = 'Nothing is changed on this page.';
    var click = st.toolbar === 'menu' ? 'Click to open the panel.' : st.scope === 'all' ? (allOn ? 'Click: every page back to normal.' : 'Click: every page dark.') : st.on ? 'Click to switch this tab back.' : 'Click to make this tab dark.';
    return { on: !!st.on, text: t, click: click };
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
      if (cfg.keepImages) css += MEDIA + '{filter:' + FLIP + ' !important}:is(' + MEDIA + ') :is(' + MEDIA + '){filter:none !important}img[data-mesdm-vec]{filter:none !important}';
    }
    return css + '@media print{html{filter:none !important}}';
  }

  /* ---- reading the settings (browser only; `api` = chrome) ----
     sync first, then local (Brave may have no working sync), and never wait more than 1.5 s. cb(stored mesdm object or null) is called once. */
  function loadStored(api, cb, wait) {
    var done = false;
    function fin(v) { if (done) return; done = true; clearTimeout(safety); cb(v && typeof v === 'object' ? v : null); }
    var safety = setTimeout(function () { fin(null); }, wait || 1500);
    function local() { try { api.storage.local.get('mesdm', function (c) { fin(api.runtime.lastError ? null : c && c.mesdm); }); } catch (e) { fin(null); } }
    try { api.storage.sync.get('mesdm', function (a) { if (api.runtime.lastError || !a || !a.mesdm) local(); else fin(a.mesdm); }); } catch (e) { local(); }
  }

  var api = { defaultConfig: defaultConfig, builtins: builtins, normConfig: normConfig, migrate: migrate, merge: merge, anyReset: anyReset, resetText: resetText,
              profileById: profileById, siteKey: siteKey, siteMode: siteMode, inWindow: inWindow, wantDark: wantDark, decide: decide, clickTab: clickTab,
              TAB_AWAY: TAB_AWAY, tabRec: tabRec, parseTabRec: parseTabRec, tabKeep: tabKeep, tabFinal: tabFinal, bgHello: bgHello, bgSet: bgSet,
              modeText: modeText, explain: explain, parseColor: parseColor, lightness: lightness, isDarkPage: isDarkPage, buildCss: buildCss, loadStored: loadStored,
              uid: uid, MEDIA: MEDIA, BUILTIN_DEFAULT: BUILTIN_DEFAULT };
  root.MESDM = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
