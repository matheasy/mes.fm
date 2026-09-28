/* MES Site Search (mes.fm/search). The engine and the index loader live in /main_js/site-search.js
   (window.MESSearch, shared with the header's quick-search overlay); this file is only the results page:
   search box, section chips with counts, result list with "Show more", and ?q= / &c= in the address bar. */
(function () {
    "use strict";
    var S = window.MESSearch;
    var PER = 20;
    var form = document.getElementById("ss-form");
    var qEl = document.getElementById("ss-q");
    var chipsEl = document.getElementById("ss-cats");
    var statusEl = document.getElementById("ss-status");
    var tryEl = document.getElementById("ss-try");
    var listEl = document.getElementById("ss-results");
    var moreBtn = document.getElementById("ss-more");
    if (!S || !form) return;

    var params = new URLSearchParams(location.search);
    var state = { q: params.get("q") || "", c: params.get("c") || "", shown: PER };
    var res = null, timer;
    qEl.value = state.q;

    function syncUrl() {
        var p = new URLSearchParams();
        if (state.q.trim()) p.set("q", state.q.trim());
        if (state.c) p.set("c", state.c);
        var s = p.toString();
        history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
        document.title = (state.q.trim() ? "“" + state.q.trim() + "” – " : "") + "MES Site Search | Math Easy Solutions";
    }

    function chips() {
        var cats = S.cats(), counts = {}, total = 0, q = state.q.trim();
        S.search(q).items.forEach(function (it) { counts[it.cat] = (counts[it.cat] || 0) + 1; total++; });
        var html = ['<button type="button" class="tu-chip" data-c="" aria-pressed="' + (!state.c) + '">All' +
            (q ? ' <span class="ss-n">' + total + "</span>" : "") + "</button>"];
        cats.forEach(function (c) {
            var n = counts[c[0]] || 0;
            if (!n && state.c !== c[0]) return;
            html.push('<button type="button" class="tu-chip" data-c="' + c[0] + '" aria-pressed="' + (state.c === c[0]) + '">' +
                S.esc(c[1]) + ' <span class="ss-n">' + n + "</span></button>");
        });
        chipsEl.innerHTML = html.join("");
    }

    function item(it, terms) {
        var th = it.thumb ? '<img src="' + S.esc(it.thumb) + '" alt="" loading="lazy" width="96" height="96" onerror="this.style.visibility=\'hidden\'">'
            : '<span aria-hidden="true">' + S.esc(it.title.charAt(0).toUpperCase()) + "</span>";
        var where = it.where && it.where !== it.catLabel ? " &middot; " + S.esc(it.where) : "";
        return '<li class="ss-item"><a class="ss-thumb" href="' + S.esc(it.path) + '" tabindex="-1" aria-hidden="true">' + th + "</a>" +
            '<div class="ss-body"><a class="ss-title" href="' + S.esc(it.path) + '">' + S.highlight(it.title, terms) + "</a>" +
            '<div class="ss-url">mes.fm' + S.esc(it.path === "/" ? "" : it.path) + "</div>" +
            '<div class="ss-meta"><b>' + S.esc(it.catLabel) + "</b>" + where + "</div>" +
            (it.desc ? '<p class="ss-desc">' + S.highlight(it.desc, terms) + "</p>" : "") + "</div></li>";
    }

    function render() {
        var q = state.q.trim();
        chips();
        tryEl.hidden = !!(q || state.c);
        if (!q && !state.c) {
            res = null;
            listEl.innerHTML = "";
            moreBtn.hidden = true;
            statusEl.textContent = "";
            return;
        }
        res = S.search(q, state.c);
        var n = res.items.length, label = state.c ? S.cats().filter(function (c) { return c[0] === state.c; })[0] : null;
        var inCat = label ? " in " + label[1] : "";
        statusEl.textContent = !n ? (q ? "No pages match “" + q + "”" + inCat + "." : "Nothing here yet.")
            : res.partial ? "No page has every word" + inCat + ", so here are the closest " + n + " matches."
            : q ? n + (n === 1 ? " page" : " pages") + " match “" + q + "”" + inCat + "."
            : n + (n === 1 ? " page" : " pages") + inCat + ", A–Z.";
        listEl.innerHTML = res.items.slice(0, state.shown).map(function (it) { return item(it, res.terms); }).join("");
        moreBtn.hidden = n <= state.shown;
        if (!moreBtn.hidden) moreBtn.textContent = "Show more (" + (n - state.shown) + " left)";
    }

    function update() { state.shown = PER; syncUrl(); render(); }

    qEl.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { state.q = qEl.value; update(); }, 120);
    });
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        clearTimeout(timer);
        state.q = qEl.value;
        update();
        qEl.blur();       /* closes the phone keyboard so the results are visible */
    });
    chipsEl.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-c]");
        if (!b) return;
        state.c = b.getAttribute("data-c");
        update();
    });
    moreBtn.addEventListener("click", function () {
        var first = state.shown;
        state.shown += PER * 2;
        render();
        var next = listEl.children[first] && listEl.children[first].querySelector(".ss-title");
        if (next) next.focus();
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && document.activeElement === qEl && qEl.value) { qEl.value = ""; state.q = ""; update(); }
    });

    statusEl.textContent = "Loading the search index...";
    S.load().then(function () {
        render();
        if (!state.q) qEl.focus({ preventScroll: true });
    }, function () {
        statusEl.textContent = "The search index could not be loaded. Check your connection and reload the page.";
    });
})();
