/* "Jump to" button in the floating compact header bar (#compact-nav), for pages that have a table of contents.

   Wide screens (>= 1300px) show the TOC as a fixed sidebar (.toc-sidebar); below that the page only has the
   "Jump to section" <details> near the top, which scrolls out of reach on a long page. This adds a "Jump to" button
   (list icon + label) to the floating bar -- i.e. once you have scrolled away from the top -- that opens the same
   list as a dropdown panel under the bar. It is hidden whenever the sidebar is visible, unless the script tag
   carries `data-always` (then it shows at every width).

   Source of truth is the page's own `.toc-mobile .toc-links a` list: the panel copies the labels (and the
   `.toc-sub` indentation) and, on tap, *clicks the original link*, so any page handler on the TOC (e.g. expanding a
   collapsed chapter before scrolling) still runs. Self-contained (injects its own CSS), does nothing on pages
   without a TOC or without #compact-nav. Works with both dark-mode class conventions (body.dark / body.dark-mode).
   Load with: <script src="/main_js/jump-to.js" defer></script> (see add_jump_to_bar.py). */
(function () {
    "use strict";
    /* <script data-always> keeps the button in the bar even on wide screens where the sidebar TOC is showing
       (pages with a long, nested TOC, e.g. vector-functions-problems-plus) */
    var always = !!(document.currentScript && document.currentScript.hasAttribute("data-always"));
    var bar = document.getElementById("compact-nav");
    var links = Array.prototype.slice.call(document.querySelectorAll(".toc-mobile .toc-links a"));
    if (!bar || !links.length || document.getElementById("compact-jump")) return;
    var titleEl = bar.querySelector(".compact-nav-title");
    var navLinks = bar.querySelector(".compact-nav-links");
    if (!navLinks) return;

    var probe = navLinks.querySelector("a");
    var accent = probe ? getComputedStyle(probe).color : "#277bb6";

    var css = document.createElement("style");
    css.id = "mes-jump-to-css";
    css.textContent =
        "html{scroll-padding-top:64px}" +           /* anchored headings land below the fixed bar, not under it */
        "#compact-jump{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;margin:0;cursor:pointer;" +
        "font:inherit;font-size:.85em;font-weight:700;line-height:1;color:" + accent + ";background:transparent;border:1.5px solid " + accent + ";border-radius:999px;white-space:nowrap}" +
        "#compact-jump:hover,#compact-jump[aria-expanded=true]{background:" + accent + ";color:#fff}" +
        "#compact-jump svg{width:16px;height:16px;flex:0 0 auto;display:block}" +
        "@media (max-width:440px){#compact-jump{padding:0 8px}#compact-jump .cj-label{display:none}}" +
        "#compact-jump-panel{position:fixed;top:58px;left:8px;width:min(26em,calc(100vw - 16px));max-height:calc(100vh - 74px);overflow-y:auto;z-index:25;" +
        "display:none;box-sizing:border-box;padding:.35em 0;background:#fff;color:#1a1a1a;border:1px solid rgba(128,128,128,.45);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.28);-webkit-overflow-scrolling:touch}" +
        "#compact-jump-panel.open{display:block}" +
        "#compact-jump-panel .cj-title{padding:.4em 1em .5em;font-size:.72em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.6}" +
        "#compact-jump-panel a{display:block;padding:.62em 1em;font-size:.93em;line-height:1.3;color:inherit !important;text-decoration:none !important}" +
        "#compact-jump-panel a.toc-sub{padding-left:2.1em;font-size:.88em;opacity:.9}" +
        "#compact-jump-panel a:hover,#compact-jump-panel a:focus-visible{background:rgba(128,128,128,.18);outline:none}" +
        "body.dark #compact-jump-panel,body.dark-mode #compact-jump-panel{background:#232323;color:#eee;border-color:rgba(255,255,255,.25)}" +
        "body.dark #compact-jump,body.dark-mode #compact-jump{color:#6cb6f5;border-color:#6cb6f5}" +
        "body.dark #compact-jump:hover,body.dark #compact-jump[aria-expanded=true],body.dark-mode #compact-jump:hover,body.dark-mode #compact-jump[aria-expanded=true]{background:#6cb6f5;color:#111}";
    document.head.appendChild(css);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "compact-jump";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "compact-jump-panel");
    btn.setAttribute("aria-label", "Jump to section");
    btn.setAttribute("tabindex", "-1");
    btn.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="2" cy="3.5" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="2" cy="12.5" r="1.3"/></g>' +
        '<g stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 3.5h9M6 8h9M6 12.5h9"/></g></svg><span class="cj-label">Jump to</span>';
    bar.insertBefore(btn, navLinks);

    var panel = document.createElement("div");
    panel.id = "compact-jump-panel";
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", "Jump to section");
    panel.innerHTML = '<div class="cj-title">Jump to</div>';
    links.forEach(function (orig) {
        var a = document.createElement("a");
        a.href = orig.getAttribute("href");
        a.setAttribute("role", "menuitem");
        if (orig.classList.contains("toc-sub")) a.className = "toc-sub";
        a.innerHTML = orig.innerHTML;
        a.addEventListener("click", function (e) {
            e.preventDefault();
            close();
            orig.click();          /* run the page's own TOC handler (chapter expand, scroll offset ...) */
        });
        panel.appendChild(a);
    });
    document.body.appendChild(panel);

    function open() { panel.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
    function close() { panel.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (e) { e.stopPropagation(); panel.classList.contains("open") ? close() : open(); });
    document.addEventListener("click", function (e) { if (!panel.contains(e.target) && e.target !== btn) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    /* only while the floating bar is showing, and only when the sidebar TOC isn't */
    var sidebar = document.querySelector(".toc-sidebar");
    function sync() {
        var sidebarShown = !always && sidebar && getComputedStyle(sidebar).display !== "none";
        btn.style.display = sidebarShown ? "none" : "";
        btn.tabIndex = document.body.classList.contains("is-stuck") && !sidebarShown ? 0 : -1;
        if (sidebarShown || !document.body.classList.contains("is-stuck")) close();
    }
    window.addEventListener("resize", sync);
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    sync();
})();

/* Scrollspy for the "Jump to" lists (2026-10-26): highlights the section you are reading (and, for a sub-section,
   its chapter) in the fixed .toc-sidebar, the in-page "Jump to section" list (.toc-mobile) and the floating bar's
   panel above. The current section = the last target whose top has passed ~30% of the window (sections hidden inside
   a collapsed chapter are skipped, so their chapter stays lit); at the very bottom of the page the last visible target
   wins. The sidebar / panel scroll themselves to keep the lit link in view (only when it changes, so a reader scrolling
   the list by hand is not fought; not at all while the article search has text, html.mes-finding, 2026-10-30). Runs on every page that loads this file and has a TOC; nothing to regenerate. */
(function () {
    "use strict";
    var lists = [".toc-sidebar", ".toc-mobile .toc-links"];
    var src = document.querySelector(".toc-sidebar") || document.querySelector(".toc-mobile .toc-links");
    if (!src || document.getElementById("mes-toc-spy-css")) return;
    var items = [], parentOf = {}, lastTop = null;
    Array.prototype.forEach.call(src.querySelectorAll("a[href^='#']"), function (a) {
        var id = decodeURIComponent(a.getAttribute("href").slice(1)), el = id && document.getElementById(id);
        if (!el) return;
        var sub = a.classList.contains("toc-sub");
        if (!sub) lastTop = id; else if (lastTop) parentOf[id] = lastTop;
        items.push({ id: id, el: el });
    });
    if (items.length < 2) return;

    var css = document.createElement("style");
    css.id = "mes-toc-spy-css";
    css.textContent =
        ".toc-sidebar a.toc-active,.toc-mobile a.toc-active,#compact-jump-panel a.toc-active{opacity:1 !important;font-weight:700;" +
        "background:rgba(128,128,128,.16);box-shadow:inset 3px 0 0 currentColor;border-radius:0 4px 4px 0;padding-left:.55em;padding-right:.3em}" +
        ".toc-sidebar a.toc-sub.toc-active,.toc-mobile a.toc-sub.toc-active{padding-left:1.55em}" +
        "#compact-jump-panel a.toc-sub.toc-active{padding-left:2.1em}" +
        ".toc-sidebar a.toc-parent,.toc-mobile a.toc-parent,#compact-jump-panel a.toc-parent{opacity:1 !important;font-weight:700}" +
        "body.dark .toc-sidebar a.toc-active,body.dark-mode .toc-sidebar a.toc-active,body.dark .toc-mobile a.toc-active,body.dark-mode .toc-mobile a.toc-active," +
        "body.dark #compact-jump-panel a.toc-active,body.dark-mode #compact-jump-panel a.toc-active{background:rgba(255,255,255,.12)}";
    document.head.appendChild(css);

    var current = null, raf = 0;
    function pick() {
        var line = Math.max(90, window.innerHeight * 0.3), best = null, lastVis = null;
        for (var i = 0; i < items.length; i++) {
            var r = items[i].el.getBoundingClientRect();
            if (!r.width && !r.height) continue;        /* inside a collapsed chapter */
            lastVis = items[i].id;
            if (r.top <= line) best = items[i].id;
        }
        var doc = document.documentElement;
        if (lastVis && window.innerHeight + window.pageYOffset >= doc.scrollHeight - 4 && best) best = lastVis;
        return best;
    }
    function links(scope) {
        var out = [];
        lists.concat("#compact-jump-panel").forEach(function (sel) {
            Array.prototype.forEach.call(document.querySelectorAll(sel + " a[href^='#']"), function (a) { out.push(a); });
        });
        return out;
    }
    function keepVisible(box, a) {
        if (!box || !a || box.scrollHeight <= box.clientHeight + 2) return;
        var b = box.getBoundingClientRect(), r = a.getBoundingClientRect();
        if (r.top < b.top + 30 || r.bottom > b.bottom - 30) box.scrollTop += (r.top - b.top) - box.clientHeight / 2 + r.height / 2;
    }
    function paint(force) {
        raf = 0;
        var id = pick();
        if (id === current && !force) return;
        var changed = id !== current;
        current = id;
        var par = id && parentOf[id];
        links().forEach(function (a) {
            var h = decodeURIComponent(a.getAttribute("href").slice(1));
            var on = h === id, p = !!par && h === par;
            a.classList.toggle("toc-active", on);
            a.classList.toggle("toc-parent", p);
            if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
        });
        if (changed && !finding()) bringIntoView();
    }
    /* while the article search (block below) has text, the lists are not scrolled: the results sit at the top of the sidebar and
       the reader needs them (and Prev / Next) to stay put; the lit link still follows the page. Clearing the search brings it back. */
    function finding() { return document.documentElement.classList.contains("mes-finding"); }
    function bringIntoView() {
        keepVisible(document.querySelector(".toc-sidebar"), document.querySelector(".toc-sidebar a.toc-active"));
        keepVisible(document.getElementById("compact-jump-panel"), document.querySelector("#compact-jump-panel a.toc-active"));
    }
    document.addEventListener("mes-find-change", function () { if (!finding()) { paint(true); bringIntoView(); } });
    function later() { if (!raf) raf = requestAnimationFrame(function () { paint(false); }); }
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    document.addEventListener("click", function () { setTimeout(function () { paint(true); }, 60); }, true);  /* chapter folds open / close */
    /* the floating panel is built by the block above; when it opens, light its link and bring it into view */
    var panel = document.getElementById("compact-jump-panel");
    if (panel) new MutationObserver(function () {
        if (panel.classList.contains("open")) { paint(true); if (!finding()) keepVisible(panel, panel.querySelector("a.toc-active")); }
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    paint(true);
    setTimeout(function () { paint(true); }, 800);       /* after images / lazy content settle */
})();

/* Search the article from the "Jump to" menus (2026-10-27): a search box at the top of the fixed .toc-sidebar, the in-page
   "Jump to section" <details> (.toc-mobile) and the floating bar's panel (#compact-jump-panel). It searches the ARTICLE TEXT,
   not only the headings: case- and accent-insensitive, at least 2 characters. The text is indexed lazily on the first focus of
   a box (re-indexed on a later focus if more than a minute old, for pages whose text changes, e.g. /moon). Results: a counter
   ("12 matches in 5 sections"), matches grouped under the TOC label of their section with a snippet, Prev / Next buttons,
   Enter / Shift+Enter, Esc clears. Jumping to a match opens every collapsed chapter / sub-fold / <details> around it
   (.chapter-toggle-list.hidden via the page's own toggleChapter(), /moon's .section-body.collapsed via its heading), scrolls
   the match to the middle of the window and highlights it with the CSS Custom Highlight API (all matches faint,
   the current one orange); browsers without it get the current match selected instead (the DOM is never modified, so the
   index stays valid). The three boxes share one state. Self-contained; nothing to regenerate. */
(function () {
    "use strict";
    var sidebar = document.querySelector(".toc-sidebar"), mob = document.querySelector(".toc-mobile");
    var tocSrc = sidebar || (mob && mob.querySelector(".toc-links"));
    if (!tocSrc || document.getElementById("mes-find-css")) return;

    /* sections from the TOC, in document order */
    var secs = [];
    Array.prototype.forEach.call(tocSrc.querySelectorAll("a[href^='#']"), function (a) {
        var id = decodeURIComponent(a.getAttribute("href").slice(1)), el = id && document.getElementById(id);
        if (el && !secs.some(function (s) { return s.el === el; })) secs.push({ el: el, label: (a.textContent || "").trim(), href: a });
    });
    if (!secs.length) return;
    secs.sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1; });
    /* content root: the closest ancestor holding every TOC target */
    var root = secs[0].el.parentElement;
    while (root && root !== document.body && !secs.every(function (s) { return root.contains(s.el); })) root = root.parentElement;
    if (!root) root = document.body;

    var hasHL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight === "function";
    var css = document.createElement("style");
    css.id = "mes-find-css";
    css.textContent =
        ".mes-find{margin:.35em 0 .6em;font-size:14px;line-height:1.35;color:inherit;text-align:left}" +
        ".mes-find .mf-row{display:flex;gap:4px;align-items:center}" +
        ".mes-find input.mf-q{flex:1 1 auto;min-width:0;box-sizing:border-box;height:34px;margin:0;padding:0 .65em;font:inherit;font-size:15px;" +
        "color:#111;background:#fff;border:1px solid rgba(128,128,128,.6);border-radius:6px;-webkit-appearance:none;appearance:none}" +
        ".mes-find input.mf-q::placeholder{color:#6b6b6b;opacity:1}" +
        ".mes-find input.mf-q:focus{outline:2px solid #277bb6;outline-offset:0;border-color:#277bb6}" +
        ".mes-find button.mf-b{flex:0 0 auto;width:34px;height:34px;margin:0;padding:0;font:inherit;font-size:15px;line-height:1;cursor:pointer;" +
        "color:inherit;background:rgba(128,128,128,.14);border:1px solid rgba(128,128,128,.45);border-radius:6px}" +
        ".mes-find button.mf-b:hover:not(:disabled){background:rgba(128,128,128,.28)}" +
        ".mes-find button.mf-b:disabled{opacity:.4;cursor:default}" +
        ".mes-find .mf-count{margin:.35em 0 0;font-size:12.5px;opacity:.85;min-height:1em}" +
        ".mes-find .mf-count:empty{display:none}" +
        ".mes-find .mf-res{max-height:min(46vh,26em);overflow-y:auto;margin:.35em 0 0;border:1px solid rgba(128,128,128,.35);border-radius:6px;-webkit-overflow-scrolling:touch}" +
        ".mes-find .mf-res:empty{display:none}" +
        ".mes-find .mf-sec{position:sticky;top:0;z-index:1;padding:.4em .6em;font-size:12px;font-weight:700;background:#eef1f5;color:#1a1a1a;border-bottom:1px solid rgba(128,128,128,.25)}" +
        ".mes-find .mf-sec span{font-weight:400;opacity:.75}" +
        ".mes-find button.mf-sec{display:flex;align-items:baseline;gap:.35em;width:100%;box-sizing:border-box;margin:0;font-family:inherit;line-height:1.35;text-align:left;cursor:pointer;border:0;border-bottom:1px solid rgba(128,128,128,.25);border-radius:0;white-space:normal;overflow-wrap:anywhere}" +
        ".mes-find button.mf-sec:hover,.mes-find button.mf-sec:focus-visible{background:#dde6f0;outline:none;text-decoration:underline}" +
        ".mes-find button.mf-sec .mf-go{margin-left:auto;padding-left:.4em;font-weight:400;opacity:.7;white-space:nowrap}" +
        ".mes-find button.mf-hit:hover .mf-snip{text-decoration:underline;text-decoration-color:rgba(128,128,128,.6)}" +
        ".mes-find .mf-count.mf-link,.mes-find .mf-more.mf-link{cursor:pointer}" +
        ".mes-find .mf-count.mf-link:hover,.mes-find .mf-more.mf-link:hover{text-decoration:underline}" +
        ".mes-find button.mf-hit{display:block;width:100%;box-sizing:border-box;margin:0;padding:.45em .6em;font:inherit;font-size:13px;line-height:1.4;text-align:left;cursor:pointer;" +
        "color:inherit;background:transparent;border:0;border-bottom:1px solid rgba(128,128,128,.15);border-radius:0;white-space:normal;overflow-wrap:anywhere}" +
        ".mes-find button.mf-hit:hover,.mes-find button.mf-hit:focus-visible{background:rgba(128,128,128,.16);outline:none}" +
        ".mes-find button.mf-hit.cur{background:rgba(255,150,50,.2);box-shadow:inset 3px 0 0 #e8590c}" +
        ".mes-find mark{background:#ffe066;color:#111;padding:0 1px;border-radius:2px}" +
        ".mes-find .mf-more{padding:.45em .6em;font-size:12px;opacity:.8}" +
        ".mes-find.mf-mini .mf-res{display:none}" +
        "#compact-jump-panel.mf-searching>a{display:none}" +   /* the panel shows the results instead of the section list while searching */
        ".toc-mobile .mes-find{margin:.6em 0 .8em}" +
        "#compact-jump-panel .mes-find{margin:.1em .75em .5em}" +
        "::highlight(mes-find){background-color:rgba(255,200,0,.38)}" +
        "::highlight(mes-find-cur){background-color:#ff9632;color:#000}" +
        "body.dark .mes-find input.mf-q,body.dark-mode .mes-find input.mf-q{color:#eee;background:#1b1b1b;border-color:rgba(255,255,255,.3)}" +
        "body.dark .mes-find input.mf-q::placeholder,body.dark-mode .mes-find input.mf-q::placeholder{color:#a5a5a5}" +
        "body.dark .mes-find input.mf-q:focus,body.dark-mode .mes-find input.mf-q:focus{outline-color:#6cb6f5;border-color:#6cb6f5}" +
        "body.dark .mes-find .mf-sec,body.dark-mode .mes-find .mf-sec{background:#2c2f33;color:#eee}" +
        "body.dark .mes-find button.mf-sec:hover,body.dark-mode .mes-find button.mf-sec:hover,body.dark .mes-find button.mf-sec:focus-visible,body.dark-mode .mes-find button.mf-sec:focus-visible{background:#3a4048}" +
        "body.dark .mes-find .mf-res,body.dark-mode .mes-find .mf-res{background:#1e1e1e;color:#e6e6e6;border-color:rgba(255,255,255,.2)}" +
        "body.dark .mes-find .mf-count,body.dark-mode .mes-find .mf-count{color:#ddd}" +
        "body.dark .mes-find button.mf-hit.cur,body.dark-mode .mes-find button.mf-hit.cur{background:rgba(255,150,50,.22)}" +
        "body.dark ::highlight(mes-find),body.dark-mode ::highlight(mes-find){background-color:rgba(255,200,0,.33)}";
    document.head.appendChild(css);

    /* ---------- index ---------- */
    var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|BUTTON|SELECT|TEXTAREA|INPUT|OPTION|SVG|CANVAS|IFRAME|VIDEO|AUDIO|NAV|HEADER|FOOTER|ASIDE)$/;
    var SKIPSEL = ".toc-sidebar,.toc-mobile,.mes-find,#compact-nav,#compact-jump-panel,.chapters-toolbar,.arrow-icon,#comments-box,#comments-button,.mes-aside,#mes-aside,.lightbox,#lightbox,.theater-toggle-btn,[aria-hidden='true']";
    var idx = null, built = 0;
    function fold(ch) {   /* one original char -> its search form (lower case, accents dropped, any space = " ") */
        if (/\s/.test(ch)) return " ";
        var c = ch.toLowerCase();
        if (c.charCodeAt(0) < 128) return c;
        c = c.normalize ? c.normalize("NFD").replace(/[̀-ͯ]/g, "") : c;
        if (c === "’" || c === "‘") return "'";
        if (c === "“" || c === "”") return "\"";
        return c;
    }
    function build() {
        var nodes = [], starts = [], secOf = [], orig = [], norm = [], map = [], pos = 0, k = -1, prevSpace = true;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                if (n.nodeType === 1) return SKIP.test(n.tagName.toUpperCase()) || (n.matches && n.matches(SKIPSEL)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
                return n.nodeValue && /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }
        });
        var n, sep = "";
        while ((n = walker.nextNode())) {
            while (k + 1 < secs.length && (secs[k + 1].el === n || secs[k + 1].el.compareDocumentPosition(n) & 4)) k++;
            var t = n.nodeValue;
            /* a separator between nodes that sit in different blocks, so "end.Start" across paragraphs is not one word */
            if (nodes.length) {
                var prevN = nodes[nodes.length - 1];
                var blk = function (x) { var e = x.parentElement; while (e && e !== root && /^(A|B|I|EM|STRONG|SPAN|SUB|SUP|SMALL|CODE|MARK|U|S|ABBR|CITE|Q|LABEL|FONT)$/.test(e.tagName.toUpperCase())) e = e.parentElement; return e; };
                if (blk(prevN) !== blk(n) && !prevSpace) { norm.push(" "); map.push(pos - 1); prevSpace = true; }
            }
            nodes.push(n); starts.push(pos); secOf.push(k); orig.push(t);
            for (var i = 0; i < t.length; i++) {
                var f = fold(t[i]);
                for (var j = 0; j < f.length; j++) {
                    if (f[j] === " ") { if (prevSpace) continue; prevSpace = true; } else prevSpace = false;
                    norm.push(f[j]); map.push(pos + i);
                }
            }
            pos += t.length;
        }
        idx = { nodes: nodes, starts: starts, secOf: secOf, text: orig.join(""), norm: norm.join(""), map: map };
        built = Date.now();
    }
    function locate(p) {   /* global original offset -> [node, offset] */
        var s = idx.starts, lo = 0, hi = s.length - 1;
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (s[mid] <= p) lo = mid; else hi = mid - 1; }
        return [idx.nodes[lo], p - s[lo], lo];
    }
    function normQ(q) { var out = ""; for (var i = 0; i < q.length; i++) out += fold(q[i]); return out.replace(/ +/g, " ").trim(); }

    /* ---------- search state ---------- */
    var LIMIT = 5000, SHOW = 300, matches = [], cur = -1, query = "", boxes = [];
    function search(q) {
        query = q; matches = []; cur = -1;
        var nq = normQ(q);
        if (nq.length >= 2) {
            if (!idx) build();
            var hay = idx.norm, from = 0, i;
            while (matches.length < LIMIT && (i = hay.indexOf(nq, from)) !== -1) {
                var a = idx.map[i], b = idx.map[i + nq.length - 1] + 1;
                matches.push({ a: a, b: b, sec: idx.secOf[locate(a)[2]] });
                from = i + Math.max(1, nq.length);
            }
        }
        paintHL(); render();
    }
    function rangeOf(m) {
        var s = locate(m.a), e = locate(m.b - 1), r = document.createRange();
        try { r.setStart(s[0], s[1]); r.setEnd(e[0], e[1] + 1); } catch (x) { return null; }
        return r;
    }
    function paintHL() {
        if (!hasHL) return;
        CSS.highlights.delete("mes-find"); CSS.highlights.delete("mes-find-cur");
        if (!matches.length) return;
        var all = new Highlight();
        for (var i = 0; i < matches.length && i < 2000; i++) { var r = rangeOf(matches[i]); if (r) all.add(r); }
        CSS.highlights.set("mes-find", all);
        if (cur >= 0) { var rc = rangeOf(matches[cur]); if (rc) CSS.highlights.set("mes-find-cur", new Highlight(rc)); }
    }
    function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
    function snippet(m) {
        var t = idx.text, a = Math.max(0, m.a - 40), b = Math.min(t.length, m.b + 40);
        var pre = t.slice(a, m.a).replace(/\s+/g, " "), mid = t.slice(m.a, m.b).replace(/\s+/g, " "), post = t.slice(m.b, b).replace(/\s+/g, " ");
        if (a > 0) pre = "…" + pre.replace(/^\S*\s/, "");
        if (b < t.length) post = post.replace(/\s\S*$/, "") + "…";
        return esc(pre) + "<mark>" + esc(mid) + "</mark>" + esc(post);
    }
    function countText() {
        if (normQ(query).length < 2) return query.trim() ? "Type at least 2 letters" : "";
        if (!matches.length) return "No matches";
        var nsec = {}; matches.forEach(function (m) { nsec[m.sec] = 1; });
        var ns = Object.keys(nsec).length, nm = matches.length >= LIMIT ? LIMIT + "+" : matches.length;
        return (cur >= 0 ? (cur + 1) + " of " : "") + nm + " match" + (matches.length === 1 ? "" : "es") + " in " + ns + " section" + (ns === 1 ? "" : "s");
    }
    function secLabel(k) { return k < 0 ? "Top of the page" : secs[k].label; }
    function render() {
        var c = countText(), html = "", last = null, per = {};
        matches.forEach(function (m) { per[m.sec] = (per[m.sec] || 0) + 1; });
        for (var i = 0; i < matches.length && i < SHOW; i++) {
            var m = matches[i];
            if (m.sec !== last) { last = m.sec; html += '<button type="button" class="mf-sec" data-s="' + m.sec + '" title="Go to this section">' + esc(secLabel(m.sec)) + ' <span>(' + per[m.sec] + ')</span><span class="mf-go" aria-hidden="true">Go ›</span></button>'; }
            html += '<button type="button" class="mf-hit' + (i === cur ? " cur" : "") + '" data-i="' + i + '"><span class="mf-snip">' + snippet(m) + "</span></button>";
        }
        if (matches.length > SHOW) html += '<div class="mf-more mf-link" role="button" tabindex="0">Showing the first ' + SHOW + '. Use Next to keep going, or type more words.</div>';
        boxes.forEach(function (bx) {
            if (bx.q.value !== query) bx.q.value = query;
            bx.count.textContent = c;
            bx.count.classList.toggle("mf-link", !!matches.length);
            bx.count.title = matches.length ? "Go to the " + (cur >= 0 ? "current" : "first") + " match" : "";
            bx.res.innerHTML = html;
            bx.prev.disabled = bx.next.disabled = !matches.length;
            bx.el.classList.remove("mf-mini");
            if (bx.panel) bx.el.parentNode.classList.toggle("mf-searching", !!query.trim());
        });
        var on = !!query.trim(), H = document.documentElement;
        if (on !== H.classList.contains("mes-finding")) {
            H.classList.toggle("mes-finding", on);   /* the scrollspy above stops scrolling the lists while this is set */
            try { document.dispatchEvent(new Event("mes-find-change")); } catch (x) {}
        }
    }
    function markCur() {
        boxes.forEach(function (bx) {
            bx.count.textContent = countText();
            var old = bx.res.querySelector(".mf-hit.cur"); if (old) old.classList.remove("cur");
            var b = bx.res.querySelector('.mf-hit[data-i="' + cur + '"]');
            if (b) {
                b.classList.add("cur");
                var R = bx.res.getBoundingClientRect(), r = b.getBoundingClientRect();
                if (R.height && (r.top < R.top + 28 || r.bottom > R.bottom)) bx.res.scrollTop += r.top - R.top - R.height / 2;
            }
        });
    }

    /* ---------- open what hides a match, then scroll to it ---------- */
    function hiddenEl(e) { return e.nodeType === 1 && getComputedStyle(e).display === "none"; }
    function reveal(node) {
        var chain = [], e = node.parentElement;
        while (e && e !== document.body) { chain.unshift(e); e = e.parentElement; }
        chain.forEach(function (el) {
            if (el.tagName === "DETAILS" && !el.open && !el.classList.contains("toc-mobile")) { el.open = true; return; }
            if (!hiddenEl(el)) return;
            if (el.classList.contains("chapter-toggle-list")) {
                if (el.id && el.classList.contains("hidden") && typeof window.toggleChapter === "function") { try { window.toggleChapter(el.id); } catch (x) {} }
                if (el.classList.contains("hidden")) el.classList.remove("hidden");
                var ar = el.id && document.getElementById("arrowIcon-" + el.id); if (ar && ar.textContent === "▼") ar.textContent = "▲";
                return;
            }
            var head = el.previousElementSibling;
            if (el.classList.contains("collapsed") && head && (head.getAttribute("role") === "button" || /toggle/.test(head.className))) { head.click(); }
            if (hiddenEl(el)) { el.classList.remove("collapsed"); el.classList.remove("hidden"); }
        });
    }
    function go(i, fromBox) {
        if (!matches.length) return;
        cur = (i + matches.length) % matches.length;
        var m = matches[cur], loc = locate(m.a);
        reveal(loc[0]);
        var r = rangeOf(m);
        if (r) {
            var rect = r.getBoundingClientRect();
            if (!rect.height && !rect.width) { var p = loc[0].parentElement; if (p) rect = p.getBoundingClientRect(); }
            var bar = document.getElementById("compact-nav"), off = bar && document.body.classList.contains("is-stuck") ? bar.offsetHeight : 0;
            var y = window.pageYOffset + rect.top - (window.innerHeight + off) / 2 + rect.height / 2;
            window.scrollTo({ top: Math.max(0, y), behavior: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            if (!hasHL) { var sel = window.getSelection && window.getSelection(); if (sel) { sel.removeAllRanges(); sel.addRange(r); } }
        }
        paintHL(); markCur();
        if (fromBox && fromBox.panel) fromBox.el.classList.add("mf-mini");   /* floating panel: shrink to the search row so the match shows */
    }
    /* a section heading in the results: open that section and scroll to its heading */
    function goSec(k, fromBox) {
        var bar = document.getElementById("compact-nav"), off = (bar && document.body.classList.contains("is-stuck") ? bar.offsetHeight : 0) + 12;
        var target = k < 0 ? root : secs[k].el;
        if (k >= 0) {
            reveal(target);
            /* the fold this heading opens: inside the section wrapper (div#ch-5 > .chapter-toggle-list) or right after a header */
            var list = target.querySelector(":scope > .chapter-toggle-list, :scope > .section-body") || target.nextElementSibling;
            if (list && list.classList.contains("chapter-toggle-list") && hiddenEl(list)) {
                if (list.id && typeof window.toggleChapter === "function") { try { window.toggleChapter(list.id); } catch (x) {} }
                if (hiddenEl(list)) list.classList.remove("hidden");
                var ar = list.id && document.getElementById("arrowIcon-" + list.id); if (ar && ar.textContent === "\u25bc") ar.textContent = "\u25b2";
            } else if (list && list.classList.contains("section-body") && list.classList.contains("collapsed")) {
                var hd = list.previousElementSibling;
                if (hd && (hd.getAttribute("role") === "button" || /toggle/.test(hd.className))) hd.click();
                if (hiddenEl(list)) list.classList.remove("collapsed");
            }
            if (target.tagName === "DETAILS") target.open = true;
        }
        var first = -1; for (var i = 0; i < matches.length; i++) if (matches[i].sec === k) { first = i; break; }
        if (first >= 0) { cur = first; paintHL(); markCur(); }
        var y = window.pageYOffset + target.getBoundingClientRect().top - off;
        window.scrollTo({ top: Math.max(0, y), behavior: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        if (fromBox && fromBox.panel) fromBox.el.classList.add("mf-mini");
    }
    function clear() {
        query = ""; matches = []; cur = -1;
        if (hasHL) { CSS.highlights.delete("mes-find"); CSS.highlights.delete("mes-find-cur"); }
        render();
    }

    /* ---------- the boxes ---------- */
    var uid = 0;
    function make(host, before, opts) {
        var el = document.createElement("div");
        el.className = "mes-find";
        el.setAttribute("role", "search");
        var id = "mes-find-q" + (++uid);
        el.innerHTML = '<div class="mf-row"><label for="' + id + '" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search the article</label>' +
            '<input type="search" class="mf-q" id="' + id + '" placeholder="Search the article…" autocomplete="off" spellcheck="false" enterkeyhint="search">' +
            '<button type="button" class="mf-b mf-prev" aria-label="Previous match" title="Previous match (Shift+Enter)" disabled>↑</button>' +
            '<button type="button" class="mf-b mf-next" aria-label="Next match" title="Next match (Enter)" disabled>↓</button></div>' +
            '<div class="mf-count" aria-live="polite"></div><div class="mf-res"></div>';
        host.insertBefore(el, before || null);
        var bx = { el: el, q: el.querySelector(".mf-q"), prev: el.querySelector(".mf-prev"), next: el.querySelector(".mf-next"),
                   count: el.querySelector(".mf-count"), res: el.querySelector(".mf-res"), panel: !!(opts && opts.panel) };
        boxes.push(bx);
        var t = 0;
        bx.q.addEventListener("focus", function () { if (!idx || Date.now() - built > 60000) { build(); if (normQ(query).length >= 2) search(query); } });
        bx.q.addEventListener("input", function () { clearTimeout(t); var v = bx.q.value; t = setTimeout(function () { search(v); }, 150); });
        bx.q.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault(); clearTimeout(t);
                if (bx.q.value !== query) search(bx.q.value);
                if (matches.length) go(cur < 0 ? (e.shiftKey ? matches.length - 1 : 0) : cur + (e.shiftKey ? -1 : 1), bx);
            } else if (e.key === "Escape") {
                if (bx.q.value || query) { e.preventDefault(); e.stopPropagation(); clearTimeout(t); clear(); }
            } else if (e.key === "ArrowDown" && !bx.panel) {
                var f = bx.res.querySelector(".mf-hit"); if (f) { e.preventDefault(); f.focus(); }
            }
        });
        bx.prev.addEventListener("click", function (e) { e.stopPropagation(); go(cur < 0 ? matches.length - 1 : cur - 1, bx); });
        bx.next.addEventListener("click", function (e) { e.stopPropagation(); go(cur + 1, bx); });
        bx.res.addEventListener("click", function (e) {
            var sh = e.target.closest && e.target.closest(".mf-sec[data-s]");
            if (sh) { e.stopPropagation(); goSec(+sh.getAttribute("data-s"), bx); return; }
            if (e.target.closest && e.target.closest(".mf-more")) { e.stopPropagation(); go(cur + 1, bx); return; }
            var b = e.target.closest && e.target.closest(".mf-hit"); if (!b) return;
            e.stopPropagation(); go(+b.getAttribute("data-i"), bx);
        });
        bx.res.addEventListener("keydown", function (e) {
            if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("mf-more")) { e.preventDefault(); go(cur + 1, bx); }
        });
        bx.count.addEventListener("click", function (e) { if (!matches.length) return; e.stopPropagation(); go(cur < 0 ? 0 : cur, bx); });
        bx.q.addEventListener("click", function () { el.classList.remove("mf-mini"); });
        return bx;
    }
    if (sidebar) {
        var after = sidebar.querySelector(".toc-tools") || sidebar.querySelector(".toc-sidebar-header") || sidebar.querySelector(".toc-title");
        make(sidebar, after ? after.nextSibling : sidebar.firstChild);
    }
    if (mob) {
        var sum = mob.querySelector("summary");
        make(mob, sum ? sum.nextSibling : mob.firstChild);
    }
    var panel = document.getElementById("compact-jump-panel");
    if (panel) {
        var title = panel.querySelector(".cj-title");
        make(panel, title ? title.nextSibling : panel.firstChild, { panel: true });
    }
})();
