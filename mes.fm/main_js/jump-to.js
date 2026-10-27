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
   the list by hand is not fought). Runs on every page that loads this file and has a TOC; nothing to regenerate. */
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
        if (changed) {
            keepVisible(document.querySelector(".toc-sidebar"), document.querySelector(".toc-sidebar a.toc-active"));
            keepVisible(document.getElementById("compact-jump-panel"), document.querySelector("#compact-jump-panel a.toc-active"));
        }
    }
    function later() { if (!raf) raf = requestAnimationFrame(function () { paint(false); }); }
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    document.addEventListener("click", function () { setTimeout(function () { paint(true); }, 60); }, true);  /* chapter folds open / close */
    /* the floating panel is built by the block above; when it opens, light its link and bring it into view */
    var panel = document.getElementById("compact-jump-panel");
    if (panel) new MutationObserver(function () {
        if (panel.classList.contains("open")) { paint(true); keepVisible(panel, panel.querySelector("a.toc-active")); }
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    paint(true);
    setTimeout(function () { paint(true); }, 800);       /* after images / lazy content settle */
})();
