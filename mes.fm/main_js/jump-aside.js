/* "More like this" rail for the Jump-to pages (cubic formula, Vector Functions Problems Plus, moon): on screens wide enough, the sidebar column (ad + related cards)
   sits on the free side of the article, opposite the fixed "Jump to" list, as a fixed rail that scrolls on its own. It builds the same markup the other pages carry
   and then loads aside.js, which does the rest (ad request + blocker watch, cross-family cards, hide button). Hidden -> restored by "Show sidebar" (same saved
   preference as the other pages: localStorage "asideHidden" / html.aside-hidden). Needs >= 1500px; below that the page is exactly as before. Installed by add_jump_aside.py. */
(function () {
    "use strict";
    var FAMILY = { "cubic-formula": "cubic-formula", "vector-functions-problems-plus": "vector-functions-problems-plus", "moon": "tools" };
    var slug = location.pathname.replace(/^\/+|\/+$/g, "").replace(/\/index\.html$/, "");
    var fam = FAMILY[slug];
    if (!fam || document.getElementById("mes-aside")) return;
    var root = document.documentElement;
    var aside = document.createElement("aside");
    aside.id = "mes-aside";
    aside.className = "mes-aside mes-aside--rail";
    aside.setAttribute("data-aside-family", fam);
    aside.setAttribute("aria-label", "More like this");
    aside.innerHTML = '<div class="mes-aside__sticky"><div class="mes-aside__ad" data-ad-slot="8429975111"></div>' +
        '<div class="mes-aside__head"><h2 class="mes-aside__title-h">More like this</h2></div></div>';
    var show = document.createElement("button");
    show.type = "button";
    show.className = "mes-rail-show";
    show.textContent = "Show sidebar \u203A";
    show.addEventListener("click", function () {
        root.classList.remove("aside-hidden");
        try { localStorage.setItem("asideHidden", "0"); } catch (e) {}
        try { window.dispatchEvent(new Event("resize")); } catch (e) {}
    });
    function sync() { root.classList.toggle("jump-rail", window.innerWidth >= 1500 && !root.classList.contains("aside-hidden")); }
    function boot() {
        var css = document.createElement("link");
        css.rel = "stylesheet"; css.href = "/main_js/aside.css?v=2";
        document.head.appendChild(css);
        document.body.appendChild(aside);
        document.body.appendChild(show);
        sync();
        window.addEventListener("resize", sync);
        var s = document.createElement("script");
        s.src = "/main_js/aside.js?v=2"; s.defer = true;
        document.body.appendChild(s);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
