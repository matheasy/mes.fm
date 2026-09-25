/* A- / A+ text size for the custom-layout mirror pages (moon, ferrocell, hutchison-tom-sky, norman-patricia, djw, ufo ...)
   that have no <article> for the standard text-size script to scale.

   The header's #textSizeDown / #textSizeUp buttons step a scale through the same six steps and the same
   `articleFontScale` localStorage key as the rest of the site, and the page content -- every direct child of
   .container except the header chrome (top bar, nav bar, "Part of" box, footer) -- is scaled with CSS `zoom`, which
   works whatever units the page's own CSS uses (px, rem, em). The buttons live in .header-controls, so the floating
   compact bar carries them too. Load with <script src="/main_js/zoom-text-size.js" defer></script>. */
(function () {
    "use strict";
    var down = document.getElementById("textSizeDown");
    var up = document.getElementById("textSizeUp");
    if (!down || !up || !document.querySelector(".container")) return;

    var css = document.createElement("style");
    css.id = "mes-zoom-text-size-css";
    css.textContent =
        ".container > :not(.top-bar):not(.info-bar-container):not(.part-of):not(#footer):not(#compact-nav):not(script):not(style){zoom:var(--ts,1)}" +
        ".header-icon-btn:disabled{opacity:.4;cursor:default}";
    document.head.appendChild(css);

    var STEPS = [87.5, 100, 112.5, 125, 137.5, 150];
    var index;
    try { index = STEPS.indexOf(parseFloat(localStorage.getItem("articleFontScale"))); } catch (e) { index = -1; }
    if (index === -1) index = STEPS.indexOf(100);

    function apply() {
        document.documentElement.style.setProperty("--ts", String(STEPS[index] / 100));
        down.disabled = index === 0;
        up.disabled = index === STEPS.length - 1;
        try { localStorage.setItem("articleFontScale", String(STEPS[index])); } catch (e) {}
    }
    down.addEventListener("click", function () { index = Math.max(0, index - 1); apply(); });
    up.addEventListener("click", function () { index = Math.min(STEPS.length - 1, index + 1); apply(); });
    apply();
})();
