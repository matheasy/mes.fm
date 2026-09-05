/* app-features.js - app-only enhancements for the bundled Percentage
   Calculator: light/dark theme toggle, "Labels" toggle that adds a free-text
   label to every calculation, and "Save" which snapshots the current inputs
   (+ labels) under a short name shown as a chip in the nav bar. All state is
   per-device in localStorage. Loaded after jquery + calculator.js. */
(function () {
    "use strict";

    var THEME_KEY = "pc-theme";
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

    function toggleTheme() {
        theme = theme === "dark" ? "light" : "dark";
        applyTheme(theme);
        write(THEME_KEY, theme);
        syncThemeButton();
    }

    /* ------------------------------------------------------------- nav bar */
    var bar = document.getElementById("info-bar");
    var hasCalculators = !!document.querySelector(".equation");

    function li(cls) {
        var el = document.createElement("li");
        el.className = "info-bar__item " + cls;
        return el;
    }
    function btn(label, onClick) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "pc-btn";
        b.textContent = label;
        b.addEventListener("click", onClick);
        return b;
    }

    var themeBtn;
    function syncThemeButton() {
        if (themeBtn) {
            themeBtn.textContent = theme === "dark"
                ? "\u2600\uFE0F Light"        // sun
                : "\u{1F319} Dark";      // crescent moon
        }
    }

    if (bar) {
        var themeLi = li("info-bar__tool");
        themeBtn = btn("", toggleTheme);
        syncThemeButton();
        themeLi.appendChild(themeBtn);
        bar.appendChild(themeLi);
    }

    /* ----------------------------------------------------- calculation labels */
    var labels = read(LABELS_KEY, {});

    if (hasCalculators) {
        document.querySelectorAll(".equation").forEach(function (eq) {
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
    }

    function setLabelsShown(on) {
        document.body.classList.toggle("pc-show-labels", !!on);
        write(LABELS_SHOWN_KEY, on ? 1 : 0);
        if (labelsBtn) labelsBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    function refreshLabelFields() {
        document.querySelectorAll(".calc-label-field input").forEach(function (input) {
            input.value = labels[input.getAttribute("data-eq")] || "";
        });
    }

    var labelsBtn;
    if (bar && hasCalculators) {
        var labelsLi = li("info-bar__tool");
        labelsBtn = btn("\u{1F3F7} Labels", function () {
            setLabelsShown(!document.body.classList.contains("pc-show-labels"));
        });
        labelsLi.appendChild(labelsBtn);
        bar.appendChild(labelsLi);
        setLabelsShown(read(LABELS_SHOWN_KEY, 0) == 1);
    }

    /* ------------------------------------------------------ save / restore */
    function inputEls() {
        return Array.prototype.slice.call(document.querySelectorAll(".equation .input"));
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

    function renderChips() {
        if (!bar) return;
        Array.prototype.slice.call(bar.querySelectorAll(".info-bar__saved"))
            .forEach(function (n) { n.remove(); });

        var saved = read(SAVED_KEY, {});
        Object.keys(saved).forEach(function (name) {
            var item = li("info-bar__saved");

            var open = document.createElement("button");
            open.type = "button";
            open.className = "pc-open";
            open.textContent = name;
            open.title = "Restore '" + name + "'";
            open.addEventListener("click", function () {
                var entry = read(SAVED_KEY, {})[name];
                if (!entry) return;
                labels = entry.labels || {};
                write(LABELS_KEY, labels);
                refreshLabelFields();
                setInputs(entry.inputs);
            });

            var del = document.createElement("button");
            del.type = "button";
            del.className = "pc-del";
            del.textContent = "\u00D7";
            del.title = "Delete '" + name + "'";
            del.addEventListener("click", function () {
                if (!window.confirm("Delete saved calculation '" + name + "'?")) return;
                var all = read(SAVED_KEY, {});
                delete all[name];
                write(SAVED_KEY, all);
                renderChips();
            });

            item.appendChild(open);
            item.appendChild(del);
            bar.appendChild(item);
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
        all[name] = { inputs: getInputs(), labels: JSON.parse(JSON.stringify(labels)), ts: Date.now() };
        write(SAVED_KEY, all);
        renderChips();
    }

    if (bar && hasCalculators) {
        var saveLi = li("info-bar__tool");
        saveLi.appendChild(btn("\u{1F4BE} Save", saveCurrent));
        bar.appendChild(saveLi);
        renderChips();
    }
})();
