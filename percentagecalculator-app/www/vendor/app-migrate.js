/* app-migrate.js - runs once, before the calculator starts. Version 1.0 of the app kept its labels and saved calculations in its own localStorage keys
   (pc-eq-labels, pc-labels-shown, pc-saved); the calculator script that v1.1 bundles (the website's) keeps them under mes-percentagecalculator:*.
   Labels carry over as they are. A saved calculation was a flat list of every input's text in page order; the new format groups the numbers by
   calculation and row, so a save is converted only when that mapping is certain (the calculations were never re-ordered and the list has exactly the
   inputs of the first row of each calculation); otherwise it is left untouched in the old key rather than guessed at. Nothing old is ever deleted. */
(function () {
    "use strict";
    try {
        var DONE = "pc-migrated-v1.1";
        if (localStorage.getItem(DONE)) return;
        var L = "mes-percentagecalculator:labels", SHOWN = "mes-percentagecalculator:labels-shown", SAVES = "mes-percentagecalculator:saves";
        function rd(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
        function wr(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

        var oldLabels = rd("pc-eq-labels"), oldShown = rd("pc-labels-shown"), oldSaved = rd("pc-saved");
        if (oldLabels && typeof oldLabels === "object" && localStorage.getItem(L) == null) wr(L, oldLabels);
        if (oldShown != null && localStorage.getItem(SHOWN) == null) wr(SHOWN, oldShown);

        if (oldSaved && typeof oldSaved === "object" && localStorage.getItem(SAVES) == null) {
            var eqs = Array.prototype.slice.call(document.querySelectorAll(".equation"));
            var layout = rd("pcLayout");
            var defaultOrder = eqs.map(function (e) { return e.id; });
            var reordered = !!(layout && layout.order && layout.order.join("|") !== defaultOrder.join("|"));
            var counts = eqs.map(function (e) { var r = e.querySelector(".input-row"); return r ? r.querySelectorAll(".input").length : 0; });
            var total = counts.reduce(function (a, b) { return a + b; }, 0);
            var out = {}, any = false;
            if (!reordered) {
                Object.keys(oldSaved).forEach(function (name) {
                    var e = oldSaved[name];
                    if (!e || !Array.isArray(e.inputs) || e.inputs.length !== total) return;
                    var pos = 0, d = [];
                    // canonical order = the equations' own numbers (equation-1 ... equation-10)
                    var byNum = eqs.map(function (q, i) { return { n: parseInt(q.id.replace("equation-", ""), 10), c: counts[i], start: 0 }; });
                    byNum.forEach(function (x) { x.start = pos; pos += x.c; });
                    byNum.sort(function (a, b) { return a.n - b.n; });
                    byNum.forEach(function (x) {
                        var row = e.inputs.slice(x.start, x.start + x.c).map(function (v) { return v == null ? "" : String(v); });
                        d.push([row]);
                    });
                    out[name] = { d: d, l: e.labels || {}, ts: e.ts || Date.now() };
                    any = true;
                });
            }
            if (any) wr(SAVES, out);
        }
        localStorage.setItem(DONE, "1");
    } catch (err) { /* never block the calculator */ }
})();
