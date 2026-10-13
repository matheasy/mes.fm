/* Newest calculators / tools, fed by /newest.json (written by build_newest.py from git history, so it updates itself).
   Containers:
     <div class="mini-row" data-newest="latest|calculators|tools" [data-count="3"]>   thin pills: small icon + title
     <div class="icon-grid popular-grid popular-grid--static" data-newest-tiles="calculators|tools" [data-count="3"]>  homepage tiles
   A container's parent <section class="hub-cat--newest"> (hub pages) is revealed once it has content.
   Also injects the CSS of the thin "mini" pills used by the static Popular rows on /calculators and /tools. */
(function () {
    "use strict";
    if (!document.getElementById("mes-mini-css")) {
        var css = document.createElement("style");
        css.id = "mes-mini-css";
        css.textContent =
            ".mini-row{display:flex;flex-wrap:wrap;gap:.45em .55em;margin:.2em 0 .1em}" +
            ".mini,.mini:visited{display:inline-flex;align-items:center;gap:.5em;max-width:100%;padding:.28em .85em .28em .3em;border:1px solid #c3c9d2;border-radius:2em;background:#fff;color:#1e2733;text-decoration:none;font-size:.92em;line-height:1.2;transition:border-color .15s,box-shadow .15s}" +
            ".mini:hover{border-color:#277bb6;box-shadow:0 0 0 2px rgba(39,123,182,.18);text-decoration:none}" +
            ".mini__img{flex:none;width:1.9em;height:1.9em;border-radius:.45em;object-fit:cover;background:#e6edf5}" +
            ".mini__new{flex:none;font-size:.68em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:#d9480f;border-radius:1em;padding:.15em .55em}" +
            ".mini-strip{display:flex;flex-wrap:wrap;align-items:center;gap:.4em .8em;margin:.8em 0 .2em}" +
            ".mini-strip__label{font-weight:700;color:#b25e00;white-space:nowrap}" +
            ".mini-suggest{font-size:.92em;margin:.3em 0 1em}" +
            ".hub-cat--newest:not([data-ready]){display:none}" +
            ".hub-cat--mini{margin-bottom:1.1em}.hub-cat--mini .hub-cat__title{margin-bottom:.5em}" +
            "body.dark-mode .mini,body.dark-mode .mini:visited{background:#2a2a2a;color:#e8e8e8;border-color:#555}" +
            "body.dark-mode .mini:hover{border-color:#6cb6f5}body.dark-mode .mini__img{background:#3a3a3a}" +
            "body.dark-mode .mini-strip__label{color:#ffb454}";
        document.head.appendChild(css);
    }
    var pills = document.querySelectorAll("[data-newest]"), tiles = document.querySelectorAll("[data-newest-tiles]");
    if (!pills.length && !tiles.length) return;

    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function short(t) { return t.replace(/^MES\s+/, ""); }
    function reveal(el) { var s = el.closest(".hub-cat--newest"); if (s) s.setAttribute("data-ready", "1"); }

    fetch("/newest.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
        Array.prototype.forEach.call(pills, function (el) {
            var list = (d[el.getAttribute("data-newest")] || []).slice(0, +el.getAttribute("data-count") || 3);
            if (!list.length) return;
            el.innerHTML = list.map(function (x) {
                return '<a class="mini" href="' + esc(x.href) + '" title="' + esc(x.desc) + '"><img class="mini__img" src="' + esc(x.icon) + '" alt="" width="28" height="28" loading="lazy"><span>' + esc(short(x.title)) + "</span></a>";
            }).join("");
            reveal(el);
        });
        Array.prototype.forEach.call(tiles, function (el) {
            var list = (d[el.getAttribute("data-newest-tiles")] || []).slice(0, +el.getAttribute("data-count") || 3);
            if (!list.length) return;
            el.innerHTML = list.map(function (x) {
                return '<a class="icon-grid__link icon-grid__link--labeled" href="' + esc(x.href) + '"><span class="icon-grid__thumb" style="background-image:url(\'' + esc(x.icon) + '\')"></span><span class="icon-grid__label">' + esc(short(x.title)) + "</span></a>";
            }).join("");
        });
    }).catch(function () {});
})();
