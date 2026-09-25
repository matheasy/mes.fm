/* Shared "Comments" block (FastComments) for pages that do NOT load main.js's
   jQuery-based toggle -- the standalone Hive-mirror pages, the math hub, list
   pages and so on. Markup (see add_fastcomments.py):

       <div id="comments-button" class="mes-comments-toggle" ...>Comments</div>
       <div id="comments-box" class="hide"><div id="fastcomments-widget"></div></div>

   The bar looks and behaves like the "Important Notes" / "more calculations"
   bars on mes.fm/percentagecalculator (a filled blue bar while the section is
   open, an outlined one while it is collapsed, no up/down arrows). The
   calculator pages themselves use those same `hide-div-button button`
   classes and let main.js toggle them, so this file leaves any button carrying
   `hide-div-button` alone and only lazy-loads the widget for it.

   The block starts COLLAPSED on every page (bar outlined, #comments-box `hide`), see
   collapse_comments_default.py -- the widget then loads on the first click of the bar,
   since the observer below can never fire on a display:none target. If a page ever
   ships it open, embed.min.js is pulled in once the box nears the viewport instead.
   Either way it never blocks first render. The
   window.__fcLazyInit flag is shared with main.js so a page that loads both
   only initialises the widget once. */
(function () {
    "use strict";

    var TENANT_ID = "1RGmGBEjdU";
    var button = document.getElementById("comments-button");
    var box = document.getElementById("comments-box");
    var target = document.getElementById("fastcomments-widget");
    if (!button || !box || !target) return;

    if (!document.getElementById("mes-comments-css") && (button.classList.contains("mes-comments-toggle") || document.querySelector(".mes-comments-wrap"))) {
        var css = document.createElement("style");
        css.id = "mes-comments-css";
        css.textContent =
            ".mes-comments-toggle{display:block;box-sizing:border-box;width:100%;margin:1.4em 0 .7em;padding:.5em .2em;" +
            "text-align:center;line-height:1.4;font-size:1em;cursor:pointer;-webkit-user-select:none;user-select:none;" +
            "color:#fff;background:#1479c7;border:.125em solid #1479c7}" +
            ".mes-comments-toggle:not(.selected){background:transparent;color:#1479c7}" +
            ".mes-comments-toggle:focus-visible{outline:2px solid #1479c7;outline-offset:2px}" +
            "body.dark .mes-comments-toggle:not(.selected),body.dark-mode .mes-comments-toggle:not(.selected){color:#6cb6f5;border-color:#6cb6f5}" +
            "#comments-box{margin:0 0 1.4em}#comments-box.hide{display:none}" +
            ".mes-comments-wrap{box-sizing:border-box;max-width:820px;margin:0 auto;padding:0 20px}";
        document.head.appendChild(css);
    }

    if (!button.classList.contains("hide-div-button")) {
        button.setAttribute("role", "button");
        button.setAttribute("tabindex", "0");
        button.setAttribute("aria-controls", "comments-box");
        var sync = function () {
            button.setAttribute("aria-expanded", box.classList.contains("hide") ? "false" : "true");
        };
        var toggle = function () {
            box.classList.toggle("hide");
            button.classList.toggle("selected");
            sync();
        };
        button.addEventListener("click", toggle);
        button.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
        });
        sync();
    }

    /* Comment count on the bar (mirrors main.js; the bar starts collapsed so the widget is
       not loaded yet): fetch just the count from FastComments' public count endpoint when
       the bar nears the viewport and show "Comments (N)" if N > 0. Fails silently. */
    if (!window.__fcCountInit && window.fetch) {
        window.__fcCountInit = true;
        var base = button.textContent;
        var showCount = function () {
            fetch("https://fastcomments.com/widgets/comment-count/" + TENANT_ID + "?urlId=" + encodeURIComponent(location.href.split("#")[0]))
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (d) {
                    if (d && d.count > 0) button.textContent = base + " (" + Number(d.count).toLocaleString() + ")";
                })
                .catch(function () {});
        };
        if ("IntersectionObserver" in window) {
            var cio = new IntersectionObserver(function (entries) {
                if (entries[0].isIntersecting) { cio.disconnect(); showCount(); }
            }, { rootMargin: "400px" });
            cio.observe(button);
        } else {
            showCount();
        }
    }

    if (window.__fcLazyInit) return;
    window.__fcLazyInit = true;
    var loaded = false;
    function load() {
        if (loaded) return;
        loaded = true;
        var s = document.createElement("script");
        s.src = "https://cdn.fastcomments.com/js/embed.min.js";
        s.onload = function () {
            if (window.FastCommentsUI) {
                var dark = /(^|\s)dark(-mode)?(\s|$)/.test(document.body.className);
                window.FastCommentsUI(target, { tenantId: TENANT_ID, hasDarkBackground: dark });
            }
        };
        document.head.appendChild(s);
    }
    button.addEventListener("click", load, { once: true });
    if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) { io.disconnect(); load(); }
        }, { rootMargin: "600px" });
        io.observe(target);
    } else {
        load();
    }
})();
