/* MES text size pill (2026-11-17): A- / 100% / A+ for one text box or one area of a page, separate from the header's
   page-wide A- / A+. Size is saved per box in localStorage (value = percent, removed at 100).

   Easiest: put data-mes-tsize="<localStorage key>" on a <textarea>, <input> or any element. site-search.js loads this file
   when the page has one. The pill goes next to the element's <label for=id> (label and pill share a row) or, without a
   label, in a small right-aligned row just above the element. The element keeps its own font-size ratio to its parent,
   so the page's header A- / A+ still works on top.

   From code: MESTextSize.add({key, apply(scale), into: element, label: "Text size of ..."}) -> the pill element.
   apply(scale) gets 0.75 ... 3 (1 = normal); use it to set a CSS variable, e.g. el.style.setProperty("--x", scale). */
(function () {
    if (window.MESTextSize) return;
    var STEPS = [75, 87.5, 100, 112.5, 125, 150, 175, 200, 250, 300];
    var STYLE = ".mes-ts{display:inline-flex;vertical-align:middle;border:1px solid #c3c9d2;border-radius:999px;overflow:hidden;flex:none;font-size:14px;line-height:1;text-transform:none;letter-spacing:0;font-weight:400}" +
        ".mes-ts button{border:0;margin:0;background:#fff;color:#444;font:700 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:6px 11px;cursor:pointer;min-height:28px;text-transform:none;letter-spacing:0}" +
        ".mes-ts .mes-ts-up{font-size:15px}" +
        ".mes-ts .mes-ts-v{font-weight:400;font-size:12px;min-width:50px;border-left:1px solid #c3c9d2;border-right:1px solid #c3c9d2;padding:6px 6px}" +
        ".mes-ts button:hover:not(:disabled){background:#eef3fb;color:#1d5fb8}" +
        ".mes-ts button:disabled{opacity:.4;cursor:default}" +
        ".mes-ts button:focus-visible{outline:2px solid #3b82f6;outline-offset:-2px}" +
        ".mes-ts-row{display:flex;align-items:center;justify-content:space-between;gap:.6em;margin-bottom:.3em;flex-wrap:wrap}" +
        ".mes-ts-row>label{margin:0}.mes-ts-row--solo{justify-content:flex-end}" +
        "body.dark-mode .mes-ts,body.dark .mes-ts{border-color:#555}" +
        "body.dark-mode .mes-ts button,body.dark .mes-ts button{background:#262626;color:#e3e6ea}" +
        "body.dark-mode .mes-ts .mes-ts-v,body.dark .mes-ts .mes-ts-v{border-color:#555}" +
        "body.dark-mode .mes-ts button:hover:not(:disabled),body.dark .mes-ts button:hover:not(:disabled){background:#333;color:#8ab4f8}" +
        "@media (pointer:coarse){.mes-ts button{min-height:36px;padding:8px 13px}}";
    function css() {
        if (document.getElementById("mes-ts-css")) return;
        var st = document.createElement("style"); st.id = "mes-ts-css"; st.textContent = STYLE; document.head.appendChild(st);
    }
    function read(key) { try { var v = parseFloat(localStorage.getItem(key)); if (STEPS.indexOf(v) >= 0) return v; } catch (e) {} return 100; }
    function write(key, v) { try { if (v === 100) localStorage.removeItem(key); else localStorage.setItem(key, String(v)); } catch (e) {} }

    /* o.steps (percent list), o.get() / o.set(pct): use the page's own saved size instead of o.key (then o.apply is optional);
       the returned pill has .refresh() to repaint it after the page changed the size some other way (keys, other buttons). */
    function add(o) {
        css();
        var ST = o.steps || STEPS, ext = typeof o.get === "function";
        var pct = ext ? o.get() : read(o.key), what = o.label || "Text size";
        var box = document.createElement("span");
        box.className = "mes-ts"; box.setAttribute("role", "group"); box.setAttribute("aria-label", what);
        box.innerHTML = '<button type="button" data-d="-1" title="Smaller text" aria-label="Smaller text">A−</button>' +
            '<button type="button" class="mes-ts-v" data-d="0" title="Back to normal size" aria-label="Reset text size">100%</button>' +
            '<button type="button" class="mes-ts-up" data-d="1" title="Bigger text" aria-label="Bigger text">A+</button>';
        var bv = box.children[1], bdn = box.children[0], bup = box.children[2];
        function paint() {
            bv.textContent = Math.round(pct) + "%";
            bdn.disabled = pct <= ST[0] + 0.01; bup.disabled = pct >= ST[ST.length - 1] - 0.01;
        }
        function show() { paint(); if (o.apply) o.apply(pct / 100); }
        function step(d) {      // next listed step above / below the current size (the page may hold an unlisted value)
            if (d === 0) return 100;
            if (d > 0) { for (var i = 0; i < ST.length; i++) if (ST[i] > pct + 0.01) return ST[i]; return ST[ST.length - 1]; }
            for (var j = ST.length - 1; j >= 0; j--) if (ST[j] < pct - 0.01) return ST[j]; return ST[0];
        }
        box.addEventListener("click", function (e) {
            var b = e.target.closest("button[data-d]"); if (!b) return;
            e.preventDefault();
            pct = step(+b.getAttribute("data-d"));
            if (ext) o.set(pct); else write(o.key, pct);
            show();
        });
        box.refresh = function () { if (ext) pct = o.get(); paint(); };
        if (o.into) o.into.appendChild(box);
        show();
        return box;
    }

    function px(el) { return parseFloat(getComputedStyle(el).fontSize) || 16; }
    function auto(el) {
        if (el.__mesTs) return; el.__mesTs = 1;
        var key = el.getAttribute("data-mes-tsize"); if (!key) return;
        el.style.fontSize = "";
        var par = el.parentElement || document.body, ratio = px(el) / px(par);
        var lab = el.id ? document.querySelector('label[for="' + (window.CSS && window.CSS.escape ? window.CSS.escape(el.id) : el.id) + '"]') : null;
        var row = document.createElement("div"); row.className = "mes-ts-row";
        if (lab && lab.parentElement && !lab.contains(el)) { lab.parentElement.insertBefore(row, lab); row.appendChild(lab); }
        else { row.className += " mes-ts-row--solo"; el.parentElement.insertBefore(row, el); }
        add({ key: key, into: row, label: el.getAttribute("data-mes-tsize-label") || (lab ? "Text size: " + lab.textContent.trim() : "Text size"),
            apply: function (s) { el.style.fontSize = s === 1 ? "" : (ratio * s).toFixed(4) + "em"; } });
    }
    function scan(root) { Array.prototype.forEach.call((root || document).querySelectorAll("[data-mes-tsize]"), auto); }

    window.MESTextSize = { add: add, scan: scan, STEPS: STEPS };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { scan(); }); else scan();
})();
