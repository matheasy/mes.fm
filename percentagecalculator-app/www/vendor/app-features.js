/* app-features.js - app-only enhancements for the bundled Percentage
   Calculator: light/dark theme toggle + A-/A+ text size (in the nav bar,
   every page), plus a "Labels" toggle and a "Save" button in a compact
   toolbar above the calculators. Save snapshots the current inputs + labels
   under a short name shown as a chip. All state is per-device in
   localStorage. Loaded after jquery + calculator.js. */
(function () {
    "use strict";

    var THEME_KEY = "pc-theme";
    var TEXT_SCALE_KEY = "pc-text-scale";
    var LABELS_KEY = "pc-eq-labels";       // { "1": "Personal Taxes", ... }
    var LABELS_SHOWN_KEY = "pc-labels-shown";
    var SAVED_KEY = "pc-saved";            // { name: {inputs:[], labels:{}, ts} }
    var NAME_MAX = 10;

    function read(key, fallback) {
        try {
            var v = localStorage.getItem(key);
            return v == null ? fallback : JSON.parse(v);
        } catch (e) { return fallback; }
    }
    function write(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }

    function button(cls, label, onClick) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.addEventListener("click", onClick);
        return b;
    }

    /* ---------------------------------------------------------------- theme */
    function applyTheme(t) {
        document.documentElement.setAttribute("data-theme", t);
    }
    var theme = read(THEME_KEY, null);
    if (theme !== "dark" && theme !== "light") {
        theme = window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark" : "light";
    }
    applyTheme(theme);

    var themeBtn;
    function syncThemeButton() {
        if (themeBtn) {
            themeBtn.textContent = theme === "dark"
                ? "\u2600\uFE0F"   // sun  -> tap for light
                : "\u{1F319}";     // crescent moon -> tap for dark
        }
    }
    function toggleTheme() {
        theme = theme === "dark" ? "light" : "dark";
        applyTheme(theme);
        write(THEME_KEY, theme);
        syncThemeButton();
    }

    // theme toggle: a small icon-only button tucked under the hamburger,
    // in the same container so it shares the hamburger's positioning and
    // scrolls away with the header (CSS hides it while the menu is open)
    var burger = document.getElementById("navbar-button");
    if (burger && burger.parentNode) {
        themeBtn = button("pc-theme-toggle", "", toggleTheme);
        themeBtn.setAttribute("aria-label", "Toggle light or dark mode");
        burger.parentNode.appendChild(themeBtn);
        syncThemeButton();
    }

    /* ----------------------------------------------------------- text size */
    // same steps/behavior as the website's A-/A+ (main_js/display-controls.js),
    // scaling #main-content plus the header tagline (like the site's own
    // .page-description -- the site scales description/body text but not the
    // header text (title, tagline) is deliberately left out -- kept fixed
    // size on purpose, not scaled by A-/A+
    // -- works on every bundled page, not just the calculator, so it runs
    // before the calculator-only early return below
    var STEPS = [87.5, 100, 112.5, 125, 137.5, 150];
    // .page-description (the intro paragraph) sits outside #main-content, a
    // sibling of it in .page-content, on all 3 bundled pages -- everything
    // else worth scaling (Tutorial/How-To's own .sentence/.header2 body
    // text, the calculator's own rows) is already inside #main-content
    var scaleTargets = [document.getElementById("main-content"),
        document.querySelector(".page-description")].filter(Boolean);
    var scaleIndex = STEPS.indexOf(read(TEXT_SCALE_KEY, 100));
    if (scaleIndex === -1) scaleIndex = STEPS.indexOf(100);

    var textDownBtn, textUpBtn;
    function applyTextSize() {
        scaleTargets.forEach(function (el) { el.style.fontSize = (STEPS[scaleIndex] / 100) + "em"; });
        if (textDownBtn) textDownBtn.disabled = scaleIndex === 0;
        if (textUpBtn) textUpBtn.disabled = scaleIndex === STEPS.length - 1;
        write(TEXT_SCALE_KEY, STEPS[scaleIndex]);
    }
    if (burger && burger.parentNode) {
        textDownBtn = button("pc-textsize-btn pc-textsize-down", "A−", function () {
            scaleIndex = Math.max(0, scaleIndex - 1); applyTextSize();
        });
        textDownBtn.setAttribute("aria-label", "Decrease text size");
        textUpBtn = button("pc-textsize-btn pc-textsize-up", "A+", function () {
            scaleIndex = Math.min(STEPS.length - 1, scaleIndex + 1); applyTextSize();
        });
        textUpBtn.setAttribute("aria-label", "Increase text size");
        burger.parentNode.appendChild(textDownBtn);
        burger.parentNode.appendChild(textUpBtn);
    }
    applyTextSize();

    // the button row is positioned absolute, but NOT relative to #header --
    // its actual offsetParent (walking up from .navbar-container, which is
    // position:static) is .inner-container, the whole page shell, so a fixed
    // "top" guess only happens to land under the header by coincidence and
    // breaks the moment header height differs (a longer/shorter tagline: the
    // 3 bundled pages each have their own). Measure the real gap instead.
    function positionControlRow() {
        var header = document.getElementById("header");
        if (!header || !themeBtn || !themeBtn.offsetParent) return;
        // margin (unlike padding) sits outside the box getBoundingClientRect
        // measures, so this reserves flow space below the header -- pushing
        // the nav bar down so the absolutely-positioned row below has clear
        // room -- without moving the "bottom" this function measures from
        header.style.marginBottom = "60px";
        var y = Math.round(header.getBoundingClientRect().bottom -
            themeBtn.offsetParent.getBoundingClientRect().top) + 8;
        [themeBtn, textDownBtn, textUpBtn].forEach(function (b) { if (b) b.style.top = y + "px"; });
    }
    positionControlRow();
    window.addEventListener("resize", positionControlRow);

    /* --------------------------------------------- calculator-only features */
    var equations = document.querySelectorAll(".equation");
    var mainContent = document.getElementById("main-content");
    if (!equations.length || !mainContent) return;

    var labels = read(LABELS_KEY, {});

    equations.forEach(function (eq) {
        var key = (eq.id || "").replace("equation-", "") || "x";
        var field = document.createElement("div");
        field.className = "calc-label-field";
        var input = document.createElement("input");
        input.type = "text";
        input.maxLength = 40;
        input.placeholder = "Label - e.g. Personal Taxes, Business, Discount";
        input.value = labels[key] || "";
        input.setAttribute("data-eq", key);
        input.addEventListener("input", function () {
            labels[key] = input.value;
            write(LABELS_KEY, labels);
        });
        field.appendChild(input);
        eq.insertBefore(field, eq.firstChild);
    });

    function refreshLabelFields() {
        document.querySelectorAll(".calc-label-field input").forEach(function (i) {
            i.value = labels[i.getAttribute("data-eq")] || "";
        });
    }

    var labelsBtn;
    function setLabelsShown(on) {
        document.body.classList.toggle("pc-show-labels", !!on);
        write(LABELS_SHOWN_KEY, on ? 1 : 0);
        if (labelsBtn) labelsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }

    /* ------------------------------------------------------ save / restore */
    function inputEls() {
        return Array.prototype.slice.call(
            document.querySelectorAll(".equation .input"));
    }
    function getInputs() {
        return inputEls().map(function (el) { return el.value; });
    }
    function setInputs(vals) {
        var els = inputEls();
        (vals || []).forEach(function (v, i) {
            if (!els[i]) return;
            els[i].value = v;
            ["input", "keyup", "change"].forEach(function (t) {
                els[i].dispatchEvent(new Event(t, { bubbles: true }));
            });
            if (window.jQuery) window.jQuery(els[i]).trigger("propertychange");
        });
    }

    var strip;
    function renderChips() {
        if (!strip) return;
        strip.textContent = "";
        var saved = read(SAVED_KEY, {});
        Object.keys(saved).forEach(function (name) {
            var chip = document.createElement("span");
            chip.className = "pc-chip";

            var open = button("pc-chip-open", name, function () {
                var entry = read(SAVED_KEY, {})[name];
                if (!entry) return;
                labels = entry.labels || {};
                write(LABELS_KEY, labels);
                refreshLabelFields();
                setInputs(entry.inputs);
            });
            open.title = "Restore '" + name + "'";

            var del = button("pc-chip-del", "\u00D7", function () {
                if (!window.confirm("Delete saved calculation '" + name + "'?")) return;
                var all = read(SAVED_KEY, {});
                delete all[name];
                write(SAVED_KEY, all);
                renderChips();
            });
            del.title = "Delete '" + name + "'";

            chip.appendChild(open);
            chip.appendChild(del);
            strip.appendChild(chip);
        });
    }

    function saveCurrent() {
        var raw = window.prompt(
            "Name this saved calculation (max " + NAME_MAX + " characters):", "");
        if (raw == null) return;
        var name = raw.trim().slice(0, NAME_MAX);
        if (!name) return;
        var all = read(SAVED_KEY, {});
        if (all[name] && !window.confirm("Replace the existing '" + name + "'?")) return;
        all[name] = {
            inputs: getInputs(),
            labels: JSON.parse(JSON.stringify(labels)),
            ts: Date.now()
        };
        write(SAVED_KEY, all);
        renderChips();
    }

    /* ------------------------------------------------ build the toolbar */
    var toolbar = document.createElement("div");
    toolbar.className = "pc-toolbar";
    labelsBtn = button("pc-tool-btn", "\u{1F3F7} Labels", function () {
        setLabelsShown(!document.body.classList.contains("pc-show-labels"));
    });
    toolbar.appendChild(labelsBtn);
    toolbar.appendChild(button("pc-tool-btn", "\u{1F4BE} Save", saveCurrent));

    strip = document.createElement("div");
    strip.className = "pc-saved-strip";

    mainContent.insertBefore(strip, mainContent.firstChild);
    mainContent.insertBefore(toolbar, mainContent.firstChild);

    setLabelsShown(read(LABELS_SHOWN_KEY, 0) == 1);
    renderChips();
})();
