/* Runtime top-up for list pages built from a snapshot (mes.fm/ama: Hive articles of @amaterasusolar; mes.fm/youtube: the @mes channel).
 *
 * The page's build.mjs writes the snapshot into the HTML and a config: window.MES_TOPUP = [{ section, source: "hive" | "yt", ... }].
 * After the page has loaded (idle time), this script asks the live source for the newest entries (Hive API from the browser, CORS-open,
 * with fallback nodes; YouTube through /api/yt-latest, which reads the channel's RSS feed), keeps the ones newer than the snapshot, and puts them
 * at the top of the Grid and List panes in the same markup, with the same topic chips (classified with the page's own category regexes, passed in
 * the config), a "New" badge, and the search / chip counts / sort updated. A "Check for new ..." button re-runs it; the answer is kept in
 * sessionStorage for 15 minutes. Nothing is written anywhere else. See "Runtime top-up" in CLAUDE.md.
 *
 * Works in node too (require it): the pure helpers below are tested by tool_apps_src/list-topup-tests.js, and the build scripts use catsFor()
 * to check that the client classifies the snapshot exactly as the build did.
 */
(function (root) {
  'use strict';
  var CACHE_MS = 15 * 60 * 1000;
  var HIVE_NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network', 'https://hive-api.arcange.eu'];

  // ---- pure helpers ---------------------------------------------------------------------------------------------------------------------------
  function compileCats(spec) {
    return (spec || []).map(function (c) {
      return { id: c.id, re: c.re ? new RegExp(c.re, c.fl || '') : null, tags: c.tags || [] };
    });
  }
  // Same rule as the builds: a topic matches on the title regex or on a shared Hive tag; nothing matched = "other".
  function catsFor(item, cats) {
    var tags = item.tags || [];
    var ids = cats.filter(function (c) {
      return (c.re && c.re.test(item.title || '')) || c.tags.some(function (g) { return tags.indexOf(g) !== -1; });
    }).map(function (c) { return c.id; });
    return (ids.length ? ids : ['other']).join(' ');
  }
  // fresh: newest first. Keeps the entries that come before the first one already in the snapshot (and are not in it). `more` = no entry of the
  // snapshot was reached, so there may be even more new ones than the source returned.
  function pickNew(fresh, known) {
    var set = {}, out = [], reached = false;
    (known || []).forEach(function (k) { set[k] = 1; });
    for (var i = 0; i < fresh.length; i++) {
      if (set[fresh[i].key]) { reached = true; break; }
      out.push(fresh[i]);
    }
    return { items: out, more: !reached && fresh.length > 0 };
  }
  function plainText(md) {
    return String(md || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/[#*_>`~|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function wordCount(body) { return String(body || '').split(/\s+/).filter(Boolean).length; }
  function fmtDate(iso) {
    var p = String(iso || '').slice(0, 10).split('-').map(Number);
    if (p.length < 3 || !p[0]) return '';
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function proxied(url, author) {
    if (!url) return 'https://images.hive.blog/u/' + author + '/avatar';
    if (/^https:\/\/images\.hive\.blog\//.test(url)) return url;
    var u = url; try { u = encodeURI(decodeURI(url)); } catch (e) { u = encodeURI(url); }
    return 'https://images.hive.blog/640x0/' + u;
  }
  // One Hive post (bridge format) -> an item; null for reblogs, comments and other authors (the snapshot holds only the account's own top-level posts).
  function hiveItem(p, author) {
    if (!p || p.author !== author || p.depth || p.reblogged_by && p.reblogged_by.length || !p.permlink) return null;
    var md = p.json_metadata || {};
    if (typeof md === 'string') { try { md = JSON.parse(md); } catch (e) { md = {}; } }
    var words = wordCount(p.body);
    var href = 'https://peakd.com/@' + author + '/' + p.permlink;
    return {
      key: p.permlink, title: p.title || p.permlink, href: href, date: String(p.created || '').slice(0, 10),
      tags: (Array.isArray(md.tags) ? md.tags : []).slice(0, 8), image: proxied(Array.isArray(md.image) ? md.image[0] : '', author),
      desc: plainText(p.body).slice(0, 420), words: words, v: words, d: words,
      meta: fmtDate(p.created) + ' · ' + words.toLocaleString('en-US') + ' words · ' + Math.max(1, Math.round(words / 230)) + ' min read',
      links: [['Read on Hive', href]],
    };
  }
  function fmtViews(n) {
    return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M views' : n >= 1e4 ? Math.round(n / 1e3) + 'K views' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K views' : n + ' views';
  }
  // One /api/yt-latest entry -> an item; null for Shorts and for titles the page leaves out (cfg.skip: e.g. livestream replays, which the
  // channel's Videos tab and therefore the snapshot do not list).
  function ytItem(v, skipRe) {
    if (!v || !/^[A-Za-z0-9_-]{11}$/.test(v.id || '') || v.short) return null;
    if (skipRe && skipRe.test(v.title || '')) return null;
    var href = 'https://www.youtube.com/watch?v=' + v.id;
    var views = typeof v.views === 'number' ? v.views : null;
    return {
      key: v.id, title: v.title || v.id, href: href, date: String(v.published || '').slice(0, 10), tags: [],
      image: 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg', yt: v.id,   // main_js/yt-thumbs.js upgrades it to maxresdefault
      meta: 'Uploaded ' + fmtDate(v.published) + (views != null ? ' · ' + fmtViews(views) : ''),
      v: views || 0, d: 0, links: [['YouTube', href]],
    };
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function attrs(it) {
    return ' data-lt="' + esc(it.key) + '" data-cats="' + esc(it.cats || 'other') + '" data-i="' + it.i + '" data-v="' + (it.v || 0) + '" data-d="' + (it.d || 0) + '"' +
      (it.desc ? ' data-s="' + esc(it.desc) + '"' : '');
  }
  var BADGE = '<span class="lt-new" title="Added since this page was built">New</span>';
  // Same markup as buildCard() / buildRow() in ama/build.mjs and math/build.mjs (plus data-lt and the badge, which sits outside the title so it
  // never takes part in search or A-Z sorting).
  function cardHtml(it) {
    return '<a class="link-card lt-added"' + attrs(it) + ' href="' + esc(it.href) + '" target="_blank" rel="noopener">' +
      '<span class="link-card-thumb" style="background-image:url(\'' + esc(it.image).replace(/'/g, '%27').replace(/\)/g, '%29') + '\')"' + (it.yt ? ' data-yt="' + esc(it.yt) + '"' : '') + '></span>' +
      '<span class="link-card-body">' + BADGE + '<span class="link-card-title">' + esc(it.title) + '</span>' +
      '<span class="link-card-meta">' + esc(it.meta) + '</span></span></a>';
  }
  function rowHtml(it) {
    var links = (it.links || []).map(function (l) { return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + '</a>'; }).join(' - ');
    return '<div class="list-row lt-added"' + attrs(it) + '><h3>' + esc(it.title) + '</h3><p>' + links +
      ' <span class="list-meta">&middot; ' + esc(it.meta) + '</span> ' + BADGE + '</p>' +
      '<img class="list-thumb" src="' + esc(it.image) + '"' + (it.yt ? ' data-yt="' + esc(it.yt) + '"' : '') + ' alt="' + esc(it.title) + '"></div>';
  }
  // Numbers the new items so "Newest first" (ascending data-i, the snapshot starts at 0) puts them on top, newest first.
  function number(items) { var n = items.length; items.forEach(function (it, k) { it.i = k - n; }); return items; }
  function ago(ms) {
    var m = Math.floor(ms / 60000);
    return m < 1 ? 'just now' : m === 1 ? '1 min ago' : m < 60 ? m + ' min ago' : Math.floor(m / 60) === 1 ? '1 hour ago' : Math.floor(m / 60) + ' hours ago';
  }
  function statusText(n, noun, nouns, checkedAgo, more) {
    var s = n ? n + ' new ' + (n === 1 ? noun : nouns) + ' added' + (more ? ' (there may be more)' : '') : 'Up to date';
    return s + ' · checked ' + checkedAgo;
  }

  var api = { compileCats: compileCats, catsFor: catsFor, pickNew: pickNew, plainText: plainText, wordCount: wordCount, hiveItem: hiveItem, ytItem: ytItem,
    cardHtml: cardHtml, rowHtml: rowHtml, number: number, ago: ago, statusText: statusText, fmtDate: fmtDate, CACHE_MS: CACHE_MS, HIVE_NODES: HIVE_NODES };

  // ---- sources (browser) ----------------------------------------------------------------------------------------------------------------------
  function timeoutFetch(url, opts, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) { if (t) clearTimeout(t); return r; }, function (e) { if (t) clearTimeout(t); throw e; });
  }
  function fetchHive(cfg) {
    var body = JSON.stringify({ jsonrpc: '2.0', method: 'bridge.get_account_posts', params: { account: cfg.author, sort: 'posts', limit: cfg.limit || 20, observer: '' }, id: 1 });
    var i = 0;
    function next() {
      if (i >= HIVE_NODES.length) return Promise.reject(new Error('no Hive node answered'));
      var node = HIVE_NODES[i++];
      return timeoutFetch(node, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }, 8000)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { if (!j || !Array.isArray(j.result)) throw new Error('bad answer'); return j.result; })
        .catch(next);
    }
    return next().then(function (posts) { return posts.map(function (p) { return hiveItem(p, cfg.author); }).filter(Boolean); });
  }
  function fetchYt(cfg) {
    var skip = cfg.skip ? new RegExp(cfg.skip.re, cfg.skip.fl || '') : null;
    return timeoutFetch('/api/yt-latest?ch=' + encodeURIComponent(cfg.ch || 'mes'), {}, 12000)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { return (j.items || []).map(function (v) { return ytItem(v, skip); }).filter(Boolean); });
  }
  api.fetchHive = fetchHive; api.fetchYt = fetchYt;

  // ---- page wiring (browser) ------------------------------------------------------------------------------------------------------------------
  var CSS = '.lt-bar{display:flex;flex-wrap:wrap;align-items:center;gap:.4em .8em;margin:0 0 1em;font-size:.9em;color:#4a5260}' +
    '.lt-bar .lt-status{color:#4a5260}.lt-bar button{font:inherit;cursor:pointer;padding:.35em .85em;border-radius:1.2em;border:1px solid #277bb6;background:#fff;color:#1f6599}' +
    '.lt-bar button:hover{background:#277bb6;color:#fff}.lt-bar button[disabled]{opacity:.6;cursor:default}' +
    '.lt-new{display:inline-block;font-size:.72em;font-weight:bold;letter-spacing:.03em;line-height:1.5;padding:0 .5em;border-radius:.6em;background:#c2410c;color:#fff;margin-right:.45em;vertical-align:.1em}' +
    '.link-card-body .lt-new{align-self:flex-start;margin:0 0 .3em}' +
    'body.dark-mode .lt-bar,body.dark-mode .lt-bar .lt-status{color:#b6bdc9}body.dark-mode .lt-bar button{background:#2a2a2a;color:#8cc8f7;border-color:#6cb6f5}' +
    'body.dark-mode .lt-bar button:hover{background:#6cb6f5;color:#111}body.dark-mode .lt-new{background:#f08a4b;color:#111}';

  function setup(cfg) {
    var sec = cfg.section;
    var grid = document.getElementById(sec + 'Grid'), list = document.getElementById(sec + 'List');
    var filter = document.getElementById(sec + 'Filter'), search = document.getElementById(sec + 'Search'), sort = document.getElementById(sec + 'Sort');
    if (!grid || !list) return;
    var cats = compileCats(cfg.cats);
    var noun = cfg.noun || 'item', nouns = cfg.nouns || noun + 's';
    var cacheKey = 'mes-topup:' + sec;
    var placeholder = search ? search.getAttribute('placeholder') || '' : '';
    if (!document.getElementById('lt-css')) {
      var st = document.createElement('style'); st.id = 'lt-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    var bar = document.createElement('div');
    bar.className = 'lt-bar';
    bar.innerHTML = '<button type="button">Check for new ' + nouns + '</button><span class="lt-status" role="status" aria-live="polite"></span>';
    var btn = bar.querySelector('button'), status = bar.querySelector('.lt-status');
    var anchor = filter || grid.parentNode.querySelector('.view-toggle');
    if (anchor && filter) anchor.parentNode.insertBefore(bar, anchor.nextSibling); else if (anchor) anchor.parentNode.insertBefore(bar, anchor); else grid.parentNode.insertBefore(bar, grid);
    var last = null, timer = null;

    function render(fresh, checkedAt) {
      var r = pickNew(fresh, cfg.known);
      var items = number(r.items.map(function (it) { it.cats = catsFor(it, cats); return it; }));
      [grid, list].forEach(function (pane) {
        Array.prototype.forEach.call(pane.querySelectorAll('.lt-added'), function (el) { el.parentNode.removeChild(el); });
        var first = pane.querySelector('[data-cats]');
        var html = items.map(pane === grid ? cardHtml : rowHtml).join('');
        if (!html) return;
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        while (tmp.firstChild) pane.insertBefore(tmp.firstChild, first);
      });
      if (search && cfg.count) {
        search.setAttribute('placeholder', placeholder.replace(/\d[\d,]*/, (cfg.count + items.length).toLocaleString('en-US')));
      }
      // Let the page's own filter recount the chips and re-apply search / topic, and the sort put the new ones where they belong.
      if (search) search.dispatchEvent(new Event('input'));
      if (sort && sort.value !== 'new') sort.dispatchEvent(new Event('change'));
      last = { n: items.length, more: r.more, t: checkedAt };
      paint();
    }
    function paint() {
      if (!last) return;
      status.textContent = statusText(last.n, noun, nouns, ago(Date.now() - last.t), last.more);
    }
    function check(force) {
      var cached = null;
      try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch (e) { cached = null; }
      if (!force && cached && Date.now() - cached.t < CACHE_MS && Array.isArray(cached.fresh)) { render(cached.fresh, cached.t); return; }
      btn.disabled = true;
      status.textContent = 'Checking ' + (cfg.source === 'hive' ? 'Hive' : 'YouTube') + ' for new ' + nouns + '…';
      (cfg.source === 'hive' ? fetchHive(cfg) : fetchYt(cfg)).then(function (fresh) {
        var t = Date.now();
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: t, fresh: fresh })); } catch (e) {}
        render(fresh, t);
      }, function () {
        status.textContent = 'Could not check for new ' + nouns + ' right now (offline, or ' + (cfg.source === 'hive' ? 'the Hive API' : 'YouTube') + ' is busy). Try again in a minute.';
      }).then(function () { btn.disabled = false; });
    }
    btn.addEventListener('click', function () { check(true); });
    if (!timer) timer = setInterval(paint, 60000);
    check(false);
  }

  function start() {
    var list = root.MES_TOPUP || [];
    list.forEach(function (cfg) { try { setup(cfg); } catch (e) { /* never break the page */ } });
  }
  api.start = start;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.MESTopup = api;
    var go = function () {
      var idle = root.requestIdleCallback || function (f) { return setTimeout(f, 800); };
      idle(start, { timeout: 3000 });
    };
    if (document.readyState === 'complete') go(); else root.addEventListener('load', go);
  }
})(typeof window !== 'undefined' ? window : this);
