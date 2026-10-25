/* MES Text Size: settings and pure helpers. Loaded by the content script, the popup, the options page, the service worker and the node tests
   (node tool_apps_src/text-size-tests.js). */
(function (root) {
  'use strict';

  /* applyTo = where A- / A+ store a new size: 'tab' (this tab only, the default since 1.1.0), 'site' (this site, every tab) or 'all' (every site).
     v = settings version: 2 since 1.1.0. */
  var DEFAULTS = { v: 2, step: 10, min: 50, max: 300, allLevel: 100, siteLevels: {}, applyTo: 'tab' };

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
    if (stored.applyTo === 'all' || stored.applyTo === 'site' || stored.applyTo === 'tab') out.applyTo = stored.applyTo;
    var old = stored.v !== 2;   // saved by 1.0.x
    if (stored.siteLevels && typeof stored.siteLevels === 'object') {
      for (var h in stored.siteLevels) {
        var l = clampLevel(stored.siteLevels[h], out.min, out.max);
        // 1.0.x stored "100%" entries whenever a site was set back to normal: they only mean something when the all-sites size is not 100
        if (old && l === 100 && out.allLevel === 100) continue;
        out.siteLevels[h.toLowerCase()] = l;
      }
    }
    // 1.0.x had no per-tab choice and "this site" was its default, so nobody picked it on purpose: such settings move to the new default
    // (this tab only). The sizes already saved for sites stay (they are listed in the settings page); an explicit "all sites" stays too.
    if (old && out.applyTo === 'site') out.applyTo = 'tab';
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

  // where a new site / all-sites level is stored ('tab' levels live in the page, not here, so they leave S as it is)
  function withLevel(S, host, level, applyTo) {
    var out = JSON.parse(JSON.stringify(S)); level = clampLevel(level, S.min, S.max);
    var to = applyTo || S.applyTo;
    if (to === 'tab') return out;
    if (to === 'all') { out.allLevel = level; var k = siteKey(out, host); if (k !== null) delete out.siteLevels[k]; }
    else { var key = siteKey(out, host) || String(host || '').toLowerCase(); if (key) out.siteLevels[key] = level; }
    return out;
  }

  // the size in force in a tab: the tab's own size (a number, set with "this tab only"), else the site's, else the all-sites size
  function effective(S, host, tabLevel) { return typeof tabLevel === 'number' && isFinite(tabLevel) ? clampLevel(tabLevel, S.min, S.max) : levelFor(S, host); }
  // where the size in force comes from: 'tab' | 'site' | 'all'
  function sourceOf(S, host, tabLevel) { return typeof tabLevel === 'number' && isFinite(tabLevel) ? 'tab' : siteKey(S, host) !== null ? 'site' : 'all'; }

  /* ---- this tab's own size (same rules as MES Dark Mode 1.5.0) ----
     The page keeps a timestamped record in its sessionStorage: {"l":150,"h":"example.com","t":1760000000000}. sessionStorage is copied into duplicated,
     restored and opened tabs, so a record only counts for a reload, back / forward or a link within the same site (same-origin referrer), not for a
     page opened by another page, typed or restored, and not once the page has been gone for TAB_AWAY. The service worker also keeps each tab's size
     (chrome.storage.session, by tab id, dropped when the tab goes to another site or closes); the page keeps its size only when both agree (tabFinal). */
  var TAB_AWAY = 30 * 60 * 1000;
  function tabRec(l, h, now) { return JSON.stringify({ l: l, h: h, t: now }); }
  function parseTabRec(s) {
    if (typeof s !== 'string' || s.charAt(0) !== '{') return null;
    var r; try { r = JSON.parse(s); } catch (e) { return null; }
    return r && typeof r.l === 'number' && isFinite(r.l) && typeof r.h === 'string' && typeof r.t === 'number' && isFinite(r.t) ? { l: r.l, h: r.h, t: r.t } : null;
  }
  function sameOrigin(ref, origin) { if (!ref || !origin || origin === 'null') return false; try { return new URL(ref).origin === origin; } catch (e) { return false; } }
  // ctx = { now, host, origin, nav ('navigate' | 'reload' | 'back_forward' | 'prerender'), ref: document.referrer, opened } -> a level or null
  function tabKeep(rec, ctx) {
    if (!rec || !ctx || rec.h !== ctx.host) return null;
    var age = ctx.now - rec.t;
    if (!(age <= TAB_AWAY) || age < -5 * 60 * 1000) return null;
    if (ctx.opened) return null;
    if (ctx.nav === 'reload' || ctx.nav === 'back_forward') return rec.l;
    if ((ctx.nav === 'navigate' || ctx.nav === 'prerender') && sameOrigin(ctx.ref, ctx.origin)) return rec.l;
    return null;
  }
  // local = the page's verdict (level or null); bg = the service worker's record (level, null = none, undefined = no answer); ssOk = sessionStorage readable
  function tabFinal(local, bg, ssOk) {
    if (bg === undefined) return local;
    if (!ssOk) return typeof bg === 'number' ? bg : null;
    return local != null && local === bg ? local : null;
  }
  // service worker side: tabs = { tabId: { h, l } }. A top page says hello when it loads: another host means the tab left the site. passive (frames) only reads.
  function bgHello(tabs, id, host, passive) {
    var r = tabs[id];
    if (!r) return null;
    if (r.h !== host) { if (!passive) delete tabs[id]; return null; }
    return r.l;
  }
  function bgSet(tabs, id, host, l) { if (typeof l === 'number' && isFinite(l) && host) tabs[id] = { h: host, l: l }; else delete tabs[id]; }

  function parsePx(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  // the size a piece of text gets: original px times the factor, kept to 2 decimals; text under 1px (hidden / icon fonts) is left alone
  function scaled(px, level) { return px == null || px < 1 ? null : Math.round(px * level) / 100; }

  var api = { DEFAULTS: DEFAULTS, merge: merge, clampLevel: clampLevel, siteKey: siteKey, levelFor: levelFor, stepLevel: stepLevel, withLevel: withLevel, parsePx: parsePx, scaled: scaled,
    effective: effective, sourceOf: sourceOf, TAB_AWAY: TAB_AWAY, tabRec: tabRec, parseTabRec: parseTabRec, tabKeep: tabKeep, tabFinal: tabFinal, bgHello: bgHello, bgSet: bgSet };
  root.MESTS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
