/* seo-fold.js: hide / show the explanation text on tool, calculator and simulator pages.
   Loaded by site-search.js only on pages that have a .tu-seo block (the explanation / FAQ
   block of every build_tool_apps.py page) or a classic "Important Notes" box
   (.hide-div-button.button followed by .box-border, e.g. /percentagecalculator).

   - A bar like the percentage calculator's "Important Notes" sits above each .tu-seo block:
     filled while the text shows, outlined while it is folded. The page's own .button /
     .selected colours are used, so it matches each tool's brand colour.
   - The choice is remembered for this page only (localStorage mes-seofold:<path> = "1" hidden),
     so hiding it on one calculator leaves it showing on every other page (owner's choice,
     2026-11-27; the old site-wide key mes-seofold is ignored and removed).
     Nothing saved = shown, so a first visit always shows the text.
   - The text stays in the HTML (crawlers read it). Folded text is wrapped in
     hidden="until-found" where the browser supports it, so the browser's own Find (Ctrl+F)
     still finds it and unfolds it; links / #hashes pointing inside it unfold it too.
   - Classic Important-Notes boxes already toggle through main.js; this only remembers
     their state with the same site-wide choice. */
(function () {
    "use strict";
    if (window.MESSeoFold) return;
    var KEY = "mes-seofold";
    var path = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/+$/, "") || "/";
    var PKEY = KEY + ":" + path;
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
    set(KEY, null);
    function wantHidden() { return get(PKEY) === "1"; }
    function save(hid) { set(PKEY, hid ? "1" : null); }
    var EN = /^en/i.test(document.documentElement.lang || "en");
    var untilFound = "onbeforematch" in document.documentElement;

    function css() {
        if (document.getElementById("mes-seofold-css")) return;
        var s = document.createElement("style");
        s.id = "mes-seofold-css";
        s.textContent = [
            ".mes-sfbar{display:flex;align-items:stretch;gap:0;margin:1.6em 0 0.4em;}",
            ".mes-sfbar .mes-sfbtn{flex:1;margin:0;font-size:1.05em;font-weight:600;line-height:1.3;padding:0.55em 0.6em;border-radius:6px;}",
            ".mes-sfbar .mes-sfbtn:focus-visible{outline:3px solid #f59f00;outline-offset:2px;}",
            ".mes-sfwrap .tu-seo{margin-top:0.6em;}",
            ".mes-sfbar.is-folded{margin-bottom:1.2em;}",
            "@media (max-width:480px){.mes-sfbar .mes-sfbtn{font-size:1em;}}",
            "body.dark-mode .mes-sfbar .mes-sfbtn.selected{background-color:#2563a8;border-color:#2563a8;color:#fff;}",
            "body.dark-mode .mes-sfbar .mes-sfbtn:not(.selected){color:#9cc3f5;border-color:#4d86d0;}"
        ].join("\n");
        document.head.appendChild(s);
    }

    function labelFor(block) {
        if (block.getAttribute("data-fold-label")) return block.getAttribute("data-fold-label");
        if (EN) return "How it works & questions";
        var h = block.querySelector("h2,h3");
        var t = h ? h.textContent.replace(/\s+/g, " ").trim() : "";
        if (t && t.length <= 60) return t;
        return "How it works & questions";
    }

    var bars = [];
    function paint(b) {
        var hid = b.hidden;
        b.btn.classList.toggle("selected", !hid);
        b.btn.setAttribute("aria-expanded", hid ? "false" : "true");
        b.btn.textContent = b.label + (hid && EN ? "  (show)" : "");
        b.btn.title = hid ? "Show the explanation" : "Hide the explanation on this page (remembered)";
        b.bar.classList.toggle("is-folded", hid);
        if (hid) {
            if (untilFound) b.wrap.setAttribute("hidden", "until-found"); else b.wrap.hidden = true;
        } else b.wrap.removeAttribute("hidden");
    }
    function setAll(hid, doSave) {
        bars.forEach(function (b) { b.hidden = hid; paint(b); });
        if (doSave) save(hid);
    }
    function unfoldTo(el) {
        for (var i = 0; i < bars.length; i++) if (bars[i].hidden && bars[i].wrap.contains(el)) { bars[i].hidden = false; paint(bars[i]); }
    }

    function addBar(block) {
        if (block.__mesSf) return;
        block.__mesSf = 1;
        var wrap = document.createElement("div");
        wrap.className = "mes-sfwrap";
        block.parentNode.insertBefore(wrap, block);
        wrap.appendChild(block);
        var bar = document.createElement("div");
        bar.className = "mes-sfbar";
        var btn = document.createElement("div");
        btn.className = "button mes-sfbtn";
        btn.setAttribute("role", "button");
        btn.tabIndex = 0;
        var id = block.id || ("mes-sf-" + bars.length);
        if (!block.id) wrap.id = id;
        btn.setAttribute("aria-controls", block.id ? block.id : id);
        bar.appendChild(btn);
        wrap.parentNode.insertBefore(bar, wrap);
        var b = { bar: bar, btn: btn, wrap: wrap, label: labelFor(block), hidden: wantHidden() };
        bars.push(b);
        function toggle() { setAll(!b.hidden, true); }
        btn.addEventListener("click", toggle);
        btn.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
        });
        wrap.addEventListener("beforematch", function () { b.hidden = false; paint(b); });
        paint(b);
    }

    /* Classic Important-Notes boxes: main.js toggles them; we restore and remember the state. */
    function classic() {
        var list = document.querySelectorAll(".hide-div-button.button");
        Array.prototype.forEach.call(list, function (btn) {
            if (btn.id === "comments-button" || btn.__mesSf) return;
            var box = btn.nextElementSibling;
            if (!box || !box.classList.contains("box-border")) return;
            btn.__mesSf = 1;
            if (wantHidden()) { box.classList.add("hide"); btn.classList.remove("selected"); }
            btn.addEventListener("click", function () {
                setTimeout(function () {
                    var hid = box.classList.contains("hide");
                    save(hid);
                }, 0);
            });
        });
    }

    function hashCheck() {
        if (!location.hash || location.hash.length < 2) return;
        var t = null;
        try { t = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
        if (t) { unfoldTo(t); }
    }

    function init() {
        var blocks = document.querySelectorAll(".tu-seo");
        if (blocks.length) css();
        Array.prototype.forEach.call(blocks, addBar);
        classic();
        hashCheck();
    }
    window.addEventListener("hashchange", hashCheck);
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest('a[href*="#"]');
        if (!a || a.pathname !== location.pathname) return;
        var id = a.hash.slice(1);
        if (!id) return;
        var t = null;
        try { t = document.getElementById(decodeURIComponent(id)); } catch (er) {}
        if (t) unfoldTo(t);
    }, true);

    window.MESSeoFold = { unfoldTo: unfoldTo, set: function (hid) { setAll(!!hid, true); } };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
