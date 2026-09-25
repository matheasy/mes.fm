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
   navy-on-white header/nav/footer, which need no change. */
(function () {
    "use strict";

    var header = document.getElementById("header");
    var host = header || document.querySelector(".inner-container");
    if (!host || document.getElementById("header-controls")) return;

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
        "body.dark-mode .page-content :is(h1,h2,h3,p,span,b,strong,li){color:#eee}",
        "body.dark-mode .tag-line,body.dark-mode .page-content .calc__text--desc{color:#b8b8b8}",
        "body.dark-mode .page-content a:not(.icon-grid__link):not(.calc-link):not(.memes__link):not(.btn-link){color:#6cb6f5}",
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
    document.querySelectorAll(".page-description, .page-content .sentence, .page-content .header2, .calc__text").forEach(function (el) {
        targets.push(el);
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

    /* dark / light -- defaults to the normal light template unless dark was chosen (shared 'theme' key) */
    var body = document.body;
    var themeBtn = document.getElementById("themeToggleBtn");
    function applyTheme(isDark) {
        body.classList.toggle("dark-mode", isDark);
        themeBtn.textContent = isDark ? "☀️" : "🌙";
        try { localStorage.setItem("theme", isDark ? "dark" : "light"); } catch (e) {}
    }
    var saved;
    try { saved = localStorage.getItem("theme"); } catch (e) {}
    applyTheme(saved === "dark");
    themeBtn.addEventListener("click", function () { applyTheme(!body.classList.contains("dark-mode")); });
})();
