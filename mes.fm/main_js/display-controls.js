/* Text-size (A-/A+) and dark/light (moon/sun) display controls for the classic
   mes.fm-template pages that don't carry them inline: the homepage and the
   calculators / tools / mobile-apps / puzzles / memes hub pages. Same buttons,
   look, position (left of the hamburger), localStorage keys ('articleFontScale',
   'theme') and floating-bar behaviour as mes.fm/math, whose build.mjs holds its
   own inline copy -- keep the two visually in step.

   Everything is created here (CSS, the #header-controls markup, the handlers),
   so a page only needs:  <script src="/main_js/display-controls.js" defer></script>

   Text size scales only running text (page description, intro paragraphs and
   headings, calculator/tool card text), leaving nav, logos and thumbnails
   alone. Dark mode is page-scoped overrides on top of the template's own
   navy-on-white header/nav/footer, which need no change.

   FLOATING BAR: if the page has no #compact-nav of its own (the hubs, mes.fm/math and the tool
   pages carry theirs inline) this script builds one at runtime -- title from .calculator-title
   (minus "by MES"), logo from #logo, home link from the logo's link, colour from the computed
   #info-bar background -- so the ~1,000 calculator / meme / quote pages only need this one <script>.
   Add data-scale="main" to the script tag to also scale #main-content with A-/A+, and
   data-dark="derive" to derive the dark theme at runtime from the page's own stylesheets
   (every colour rule gets a mapped `body.dark-mode ...` twin -- same algorithm as
   add_tool_page_controls.py's build-time TOOL-DARK block -- so calculator widgets, answer
   boxes, tables etc. go dark without a hand-written rule per site).

   Tool pages (mes.fm/emoji, /latex, /timezone, ... -- see add_tool_page_controls.py)
   opt in with <div id="main-content" data-tool data-text-scale>: the whole tool area is
   scaled by text size, <body> gets .tool-page, the hub-specific dark text/link rules
   below are skipped for it, and each tool page carries its own generated
   `body.dark-mode ...` block for its widgets (between TOOL-DARK markers). */
(function () {
    "use strict";

    var header = document.getElementById("header");
    var host = header || document.querySelector(".inner-container");
    if (!host || document.getElementById("header-controls")) return;

    var isTool = !!document.querySelector("#main-content[data-tool]");
    if (isTool) document.body.classList.add("tool-page");

    var css = document.createElement("style");
    css.id = "mes-display-controls-css";
    css.textContent = [
        "#header-controls{position:absolute;top:16px;right:68px;z-index:20;display:flex;align-items:center;gap:6px}",
        ".header-control-btn{flex:0 0 auto;width:2em;height:2em;padding:0;margin:0;border:1.5px solid rgba(0,0,0,.15);border-radius:50%;",
        "cursor:pointer;font-family:inherit;font-size:.9em;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;",
        "box-shadow:0 1px 3px rgba(0,0,0,.2);background-color:#3a3d52;color:#fff}",
        ".header-control-btn:disabled{opacity:.4;cursor:default}",
        /* floating compact bar: reserve room for the controls + hamburger, pin the controls into its right end */
        "#compact-nav{padding-right:172px !important}",
        "body.is-stuck #header-controls{position:fixed;top:13px;right:60px}",
        "@media (max-width:480px){#compact-nav{padding-right:160px !important}body.is-stuck #header-controls{right:56px}}",
        /* narrow screens: the wide header logo would sit under the buttons, so give them their own strip above it */
        "@media (max-width:768px){#header{position:relative;padding-top:2.6em}#header-controls{top:.35em;right:60px}}",
        /* dark mode */
        "body.dark-mode{background-color:#1a1a1a}",
        "body.dark-mode .inner-container{background-color:#232323;box-shadow:none}",
        "body.dark-mode .calculator-title,body.dark-mode .page-title,body.dark-mode .page-description,",
        "body.dark-mode:not(.tool-page) .page-content :is(h1,h2,h3,p,span,b,strong,li){color:#eee}",
        "body.dark-mode.tool-page{color-scheme:dark}",
        /* long titles (e.g. "MES YouTube Thumbnail Grabber", "Percentage Calculator by MES") must wrap before the controls, not run under them */
        "#header .logo-text-container{padding-right:175px}",
        "@media (max-width:768px){#header .logo-text-container{padding-right:0}}",
        "body.dark-mode.tool-page .page-title,body.dark-mode.tool-page .page-description{color:#eee}",
        "body.dark-mode.tool-page .page-description a{color:#6cb6f5}",
        "body.dark-mode .tag-line,body.dark-mode .page-content .calc__text--desc{color:#b8b8b8}",
        "body.dark-mode:not(.tool-page) .page-content a:not(.icon-grid__link):not(.calc-link):not(.memes__link):not(.btn-link){color:#6cb6f5}",
        "body.dark-mode .page-content .icon-grid__label{color:#fff}",
        "body.dark-mode .calc-link,body.dark-mode .memes__img{border-color:rgba(255,255,255,.2)}",
        "body.dark-mode .calc-link:hover,body.dark-mode .memes__img:hover{border-color:#6cb6f5}",
        "body.dark-mode .button:not(.selected){color:#6cb6f5;border-color:#6cb6f5}",
        "body.dark-mode .header-control-btn{background-color:#2e2e2e;color:#eee;border-color:rgba(255,255,255,.25)}",
        "body.dark-mode #compact-nav{background:#1a1a1a}",
        "body.dark-mode #compact-nav .compact-nav-title{color:#eee}",
        "body.dark-mode #compact-nav .compact-nav-links a{color:#6cb6f5}"
    ].join("");
    document.head.appendChild(css);

    var box = document.createElement("div");
    box.id = "header-controls";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Display settings");
    box.innerHTML =
        '<button type="button" id="textSizeDownBtn" class="header-control-btn" aria-label="Decrease text size" title="Decrease text size">A&minus;</button>' +
        '<button type="button" id="textSizeUpBtn" class="header-control-btn" aria-label="Increase text size" title="Increase text size">A+</button>' +
        '<button type="button" id="themeToggleBtn" class="header-control-btn" aria-label="Toggle dark mode" title="Toggle dark mode">&#127769;</button>';
    host.insertBefore(box, host.firstChild);

    /* text size */
    var STEPS = [87.5, 100, 112.5, 125, 137.5, 150];
    var targets = [];
    var self = document.querySelector('script[src*="display-controls.js"]');
    var scaleMain = !!(self && self.getAttribute("data-scale") === "main");
    document.querySelectorAll(".page-description, .page-content .sentence, .page-content .header2, .calc__text, [data-text-scale]" + (scaleMain ? ", #main-content" : "")).forEach(function (el) {
        if (targets.indexOf(el) === -1) targets.push(el);
    });
    var downBtn = document.getElementById("textSizeDownBtn");
    var upBtn = document.getElementById("textSizeUpBtn");
    var index;
    try { index = STEPS.indexOf(parseFloat(localStorage.getItem("articleFontScale"))); } catch (e) { index = -1; }
    if (index === -1) index = STEPS.indexOf(100);

    function applySize() {
        targets.forEach(function (el) { el.style.fontSize = (STEPS[index] / 100) + "em"; });
        downBtn.disabled = index === 0;
        upBtn.disabled = index === STEPS.length - 1;
        try { localStorage.setItem("articleFontScale", String(STEPS[index])); } catch (e) {}
    }
    downBtn.addEventListener("click", function () { index = Math.max(0, index - 1); applySize(); });
    upBtn.addEventListener("click", function () { index = Math.min(STEPS.length - 1, index + 1); applySize(); });
    applySize();

    /* ---- dark theme derived from the page's own stylesheets (opt-in: data-dark="derive") ---- */
    var derived = false;
    function deriveDark() {
        if (derived || !self || self.getAttribute("data-dark") !== "derive" || isTool) return;
        derived = true;
        var SKIP = /(info-bar|navbar|footer|social|active-tab|compact-nav|header-control|dropdown|hamburger|lazyload|mes-comments|comments|\bbutton\b)/;
        function parse(v) {
            var m = /rgba?\(([^)]*)\)/.exec(v || "");
            if (!m) return null;
            var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
            return p.length >= 3 ? { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } : null;
        }
        function hsl(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
            if (mx !== mn) {
                var d = mx - mn;
                s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
                h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
                h /= 6;
            }
            return [h, s, l];
        }
        function rgbOf(h, s, l) {
            function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
            if (s === 0) return [l * 255, l * 255, l * 255];
            var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
            return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
        }
        function map(v, kind) {
            var c = parse(v);
            if (!c || c.a === 0) return null;
            var x = hsl(c.r, c.g, c.b), h = x[0], s = x[1], l = x[2], neutral = s < .30, l2, s2;
            if (kind === "text") {
                if (l > .9) return null;
                if (neutral) { l2 = Math.min(.95, Math.max(.62, 1 - l)); s2 = s * .5; } else { l2 = Math.max(l, .68); s2 = s; }
            } else if (kind === "bg") {
                if (l > .72) { l2 = Math.min(.24, Math.max(.10, 1 - l + .06)); s2 = s * .45; }
                else if (neutral) { l2 = l < .6 ? Math.min(.32, 1 - l) : .16; s2 = s; }
                else return null;
            } else {
                if (neutral) { l2 = l > .5 ? Math.min(.42, Math.max(.20, 1 - l + .06)) : Math.max(l, .3); s2 = s; }
                else { l2 = l < .5 ? Math.max(l, .5) : Math.min(.4, 1 - l + .1); s2 = s; }
            }
            var o = rgbOf(h, s2, l2).map(function (n) { return Math.max(0, Math.min(255, Math.round(n))); });
            return c.a >= .999 ? "rgb(" + o.join(",") + ")" : "rgba(" + o.join(",") + "," + c.a + ")";
        }
        var PROPS = [["color", "text", "color"], ["backgroundColor", "bg", "background-color"],
            ["borderTopColor", "border", "border-top-color"], ["borderRightColor", "border", "border-right-color"],
            ["borderBottomColor", "border", "border-bottom-color"], ["borderLeftColor", "border", "border-left-color"]];
        var out = [], seen = {};
        function walk(rules) {
            for (var i = 0; i < rules.length; i++) {
                var r = rules[i];
                if (r.type === 4) { if (!/print/.test(r.conditionText || r.media.mediaText)) walk(r.cssRules); continue; }
                if (r.type !== 1 || !r.selectorText) continue;
                var decl = [];
                PROPS.forEach(function (pr) {
                    var v = r.style[pr[0]];
                    if (!v) return;
                    var m = map(v, pr[1]);
                    if (m && m !== v) decl.push(pr[2] + ":" + m);
                });
                if (!decl.length) continue;
                var sels = r.selectorText.split(/,(?![^(]*\))/).map(function (s) { return s.trim(); }).filter(function (s) {
                    return s && !SKIP.test(s) && !/^(a|body|html|\*)(?![\w-])/.test(s) && s.indexOf("dark-mode") === -1;
                });
                if (!sels.length) continue;
                var rule = sels.map(function (s) { return "body.dark-mode " + s; }).join(",") + "{" + decl.join(";") + "}";
                if (!seen[rule]) { seen[rule] = 1; out.push(rule); }
            }
        }
        for (var i = 0; i < document.styleSheets.length; i++) {
            var sh = document.styleSheets[i];
            if (sh.ownerNode && sh.ownerNode.id && /^mes-/.test(sh.ownerNode.id)) continue;
            try { walk(sh.cssRules); } catch (e) { /* cross-origin sheet (bootstrap CDN ...) */ }
        }
        var st = document.createElement("style");
        st.id = "mes-dark-derived";
        st.textContent = out.join("\n");
        document.head.appendChild(st);

        /* elements that carry their colours in a style="" attribute (e.g. the light-blue notice boxes) -- the stylesheet
           pass can't see those, so map them in place and remember the originals so light mode can restore them */
        inline = Array.prototype.slice.call(document.querySelectorAll(".page-content [style]")).filter(function (el) {
            return el.style.color || el.style.backgroundColor || el.style.borderColor || el.style.borderTopColor;
        }).map(function (el) {
            var o = { el: el, color: el.style.color, bg: el.style.backgroundColor, bc: el.style.borderTopColor };
            o.dColor = o.color && map(getComputedStyle(el).color, "text");
            o.dBg = o.bg && map(getComputedStyle(el).backgroundColor, "bg");
            o.dBc = o.bc && map(getComputedStyle(el).borderTopColor, "border");
            return o;
        });
    }
    var inline = [];
    function paintInline(isDark) {
        inline.forEach(function (o) {
            o.el.style.color = isDark && o.dColor ? o.dColor : o.color;
            o.el.style.backgroundColor = isDark && o.dBg ? o.dBg : o.bg;
            if (o.bc) o.el.style.borderColor = isDark && o.dBc ? o.dBc : o.bc;
        });
    }

    /* dark / light -- defaults to the normal light template unless dark was chosen (shared 'theme' key) */
    var body = document.body;
    var themeBtn = document.getElementById("themeToggleBtn");
    function applyTheme(isDark) {
        body.classList.toggle("dark-mode", isDark);
        if (isDark) deriveDark();
        paintInline(isDark);
        themeBtn.textContent = isDark ? "☀️" : "🌙";
        try { localStorage.setItem("theme", isDark ? "dark" : "light"); } catch (e) {}
    }
    var saved;
    try { saved = localStorage.getItem("theme"); } catch (e) {}
    applyTheme(saved === "dark");
    themeBtn.addEventListener("click", function () { applyTheme(!body.classList.contains("dark-mode")); });
    /* ---- floating compact bar, built at runtime when the page doesn't carry one ---- */
    (function () {
        var nav = document.querySelector(".info-bar-container");
        if (document.getElementById("compact-nav") || !nav) return;
        var infoBar = document.getElementById("info-bar");
        var rgb = infoBar ? getComputedStyle(infoBar).backgroundColor.match(/\d+/g) : null;
        var accent = rgb ? "rgb(" + rgb.slice(0, 3).join(",") + ")" : "#277bb6";
        var hover = rgb ? "rgba(" + rgb.slice(0, 3).join(",") + ",.12)" : "rgba(39,123,182,.12)";
        var titleEl = document.querySelector(".calculator-title");
        var logo = document.getElementById("logo");
        var logoLink = logo && logo.closest("a");
        var home = (logoLink && logoLink.getAttribute("href")) || "/";
        var title = titleEl ? titleEl.textContent.replace(/\s+by MES\s*$/i, "").trim() : "MES.fm";
        if (home === "/" ) title = "MES.fm";
        var square = logo && logo.getAttribute("width") && logo.getAttribute("width") === logo.getAttribute("height");
        var logoSrc = square ? (logo.getAttribute("data-src") || logo.getAttribute("src")) : "https://mes.fm/img/logo-mark.png";
        var links = [["Math Tutorials", "/math"], ["Calculators", "/calculators"], ["Tools", "/tools"], ["Mobile Apps", "/mobile-apps"], ["Puzzles", "/puzzles"], ["Memes", "/memes"], ["MES.fm", "/"]];
        function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

        var st = document.createElement("style");
        st.id = "mes-compact-nav-css";
        st.textContent =
            "#compact-nav{position:fixed;top:0;left:0;right:0;height:52px;z-index:15;display:none;align-items:center;gap:12px;padding:0 80px 0 12px;box-sizing:border-box;" +
            "background:#fff;border-bottom:3px solid " + accent + ";box-shadow:0 2px 8px rgba(0,0,0,.18);transform:translateY(-110%);transition:transform .2s ease}" +
            "#compact-nav.is-visible{display:flex}body.is-stuck #compact-nav{transform:none}" +
            "#compact-nav .compact-nav-logo{display:block;width:32px;height:32px;border-radius:6px;flex:0 0 auto}" +
            "#compact-nav .compact-nav-title{flex:0 1 auto;min-width:0;font-weight:700;font-size:1.05em;color:#1a1a1a;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
            "#compact-nav .compact-nav-links{display:flex;flex:1 1 0;min-width:0;overflow:hidden;margin:0 0 0 8px;padding:0;list-style:none}" +
            "#compact-nav .compact-nav-links li{flex:0 0 auto}" +
            "#compact-nav .compact-nav-links a{display:block;padding:0 10px;line-height:52px;font-size:.9em;color:" + accent + ";text-decoration:none;white-space:nowrap}" +
            "#compact-nav .compact-nav-links a:hover{background:" + hover + "}" +
            "body.is-stuck #navbar-button{position:fixed !important;top:4px !important;right:8px !important;display:flex;align-items:center}" +
            "body.is-stuck #navbar.hide{position:fixed;top:56px;right:8px}" +
            "@media (max-width:700px){#compact-nav .compact-nav-title{display:none}#compact-nav .compact-nav-logo{width:36px;height:36px}}" +
            "@media (max-width:480px){#compact-nav{padding-right:70px;gap:8px}}";
        document.head.appendChild(st);

        var bar = document.createElement("div");
        bar.id = "compact-nav";
        bar.setAttribute("aria-hidden", "true");
        bar.style.display = "none";
        bar.innerHTML =
            '<a href="' + esc(home) + '" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="' + esc(logoSrc) + '"></a>' +
            '<a class="compact-nav-title" href="' + esc(home) + '" tabindex="-1">' + esc(title) + '</a>' +
            '<ul class="compact-nav-links">' + links.filter(function (l) { return l[1] !== home; }).map(function (l) {
                return '<li><a href="' + l[1] + '" tabindex="-1">' + (l[1] === "/" ? "<b>" + l[0] + "</b>" : l[0]) + "</a></li>";
            }).join("") + "</ul>";
        var outer = document.getElementById("outer-container");
        (outer && outer.parentNode ? outer.parentNode : document.body).insertBefore(bar, outer || document.body.firstChild);

        /* same show/hide + link-fitting logic as the inline copy (see add_compact_nav_bar.py) */
        var list = bar.querySelector(".compact-nav-links");
        var items = Array.prototype.slice.call(list.children);
        var stuck = false, ticking = false, hideTimer;
        function fit() {
            items.forEach(function (li) { li.style.display = ""; });
            var order = items.slice(0, -1).reverse();
            for (var i = 0; i < order.length && list.scrollWidth > list.clientWidth; i++) order[i].style.display = "none";
            if (list.scrollWidth > list.clientWidth) items[items.length - 1].style.display = "none";
        }
        function update() {
            ticking = false;
            var now = nav.getBoundingClientRect().bottom < 0;
            if (now === stuck) return;
            stuck = now;
            bar.setAttribute("aria-hidden", stuck ? "false" : "true");
            Array.prototype.forEach.call(bar.querySelectorAll("a"), function (a) { a.tabIndex = stuck ? 0 : -1; });
            if (stuck) {
                clearTimeout(hideTimer);
                bar.style.display = "flex";
                fit();
                requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add("is-stuck"); }); });
            } else {
                document.body.classList.remove("is-stuck");
                hideTimer = setTimeout(function () { bar.style.display = "none"; }, 220);
            }
        }
        window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
        window.addEventListener("resize", function () { if (stuck) fit(); });
        update();
    })();
})();
