/* Page width for the hub pages (see hub-theatre.css). Saves localStorage "pageMode" (and "pageWide" for older scripts), shared with the
   Standard | Wide | Theatre switch on the sidebar pages.

   2026-10-08: hub pages are now Standard | Wide | Theatre with WIDE as the default (when nothing is saved; the HUB-THEATRE-HEAD snippet sets html.page-wide /
   page-theatre before first paint). Standard carries the "More like this" sidebar: this script builds the same <aside id="mes-aside"> the classic sidebar
   pages have (recommendations only, no ad slot unless the page itself loads AdSense: the PizzaGate pages never do), marks #outer-container .has-aside and
   loads aside.css / aside.js, which then provide the switch and the cards. In Wide / Theatre the recommendations drop under the content as a card grid
   ("Show sidebar" in the switch brings the column back). Pages where a sidebar makes no sense (livestreams, the homepage, bare .container shells) keep
   the old two-state Standard | Theatre switch.

   2026-10-24: a page that carries data-page-modes="3" on any element (the private /search-console and /ads dashboards) gets
   Standard | Wide | Theatre WITHOUT the sidebar: html.page-wide (Wide and Theatre) and html.page-theatre (Theatre), the same
   classes and saved "pageMode" as everywhere else; the page's own CSS says how wide each one is. */
(function () {
    "use strict";
    var host = document.querySelector(".outer-page-content .page-content");
    if (!host) { host = document.querySelector(".container"); if (host) host.classList.add("hub-host-container"); }   /* crypto / mathiew / djw: bare .container shell */
    if (!host || host.querySelector(".hub-mode") || host.querySelector(".mes-wide-toggle")) return;
    var root = document.documentElement;
    var oc = document.getElementById("outer-container");
    var slug = location.pathname.replace(/^\/+|\/+$/g, "").replace(/\/index\.html$/, "").replace(/\.html$/, "");
    /* sidebar family by page (keys of aside-recs.json / aside-random.json; the 9/11 / Hutchison / conspiracy cluster recommends only itself) */
    function familyOf(s) {
        var top = s.split("/")[0];
        if (!top || top === "livestreams") return null;
        if (/^911/.test(top) || top === "1109-keo-meteor-music") return "911";
        if (/^hutchison/.test(top) || /^(highlights|articles|cold-fusion-lenr)$/.test(top)) return "hutchison";
        if (/^(conspiracy|mh370|bg|pg)/.test(top)) return "conspiracy";
        if (/^(science|physics|experiments|antigravity|free-energy)/.test(top)) return "science";
        if (/^(math|sequences-series|spherical-harmonics|vectors|vector-functions)/.test(top)) return "math";
        if (/^(memes|puzzles|timer|percentagecalculator|gradecalculator|gpacalculator|bmicalculator|mortgagecalculator|inflationcalculator|pokemongocalculator)$/.test(top)) return top;
        return "tools";
    }
    var three = !!document.querySelector("[data-page-modes='3']");
    var fam = !three && host.matches(".outer-page-content .page-content") && oc ? familyOf(slug) : null;
    if (fam) {
        root.classList.add("hub-sb");
        var ads = Array.prototype.some.call(document.scripts, function (s) { return /googlesyndication|adsbygoogle/.test((s.textContent || "") + (s.src || "")); });
        var aside = document.createElement("aside");
        aside.id = "mes-aside"; aside.className = "mes-aside"; aside.setAttribute("data-aside-family", fam);
        aside.setAttribute("aria-label", "More like this");
        if (!ads) aside.setAttribute("data-no-ads", "");
        aside.innerHTML = '<div class="mes-aside__sticky"><div class="mes-aside__ad" data-ad-slot="' + (ads ? "8429975111" : "") + '"></div>' +
            '<div class="mes-aside__head"><h2 class="mes-aside__title-h">More like this</h2><button type="button" class="mes-aside__flip" aria-label="Move this sidebar to the other side" title="Move sidebar to the other side">&#8644;</button></div></div>';
        host.parentNode.appendChild(aside);
        oc.classList.add("has-aside");
        var css = document.createElement("link");
        css.rel = "stylesheet"; css.href = "/main_js/aside.css?v=2";
        document.head.appendChild(css);
        var s = document.createElement("script");
        s.src = "/main_js/aside.js?v=2"; s.defer = true;
        document.body.appendChild(s);
        return;
    }
    var group = document.createElement("div");
    group.className = "hub-mode";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Page width");
    var MODES = [["std", "Standard", "Normal page width"], ["theatre", "Theatre", "Use nearly the whole window: more columns on big screens"]], btn = {};
    if (three) MODES.splice(1, 0, ["wide", "Wide", "A wider page"]);
    function cur() { return root.classList.contains("page-theatre") ? "theatre" : three && root.classList.contains("page-wide") ? "wide" : "std"; }
    function paint() { var c = cur(); MODES.forEach(function (x) { btn[x[0]].setAttribute("aria-pressed", String(x[0] === c)); }); }
    MODES.forEach(function (x) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = x[1]; b.title = x[2];
        b.addEventListener("click", function () {
            var on = x[0] === "theatre";
            root.classList.toggle("page-theatre", on);
            if (three) root.classList.toggle("page-wide", x[0] !== "std");
            try { localStorage.setItem("pageMode", x[0]); localStorage.setItem("pageWide", x[0] !== "std" ? "1" : "0"); } catch (e) {}
            paint();
            try { window.dispatchEvent(new Event("resize")); } catch (e) {}
        });
        btn[x[0]] = b; group.appendChild(b);
    });
    paint();
    host.insertBefore(group, host.firstChild);
})();
