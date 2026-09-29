/* MES site search: a magnifier button in the header controls (left of A-/A+/moon) that opens a quick-search
   overlay, plus the search engine the mes.fm/search page uses (window.MESSearch).

   The index is mes.fm/search/index.json (built by build_search_index.py from the sitemap). It is only
   downloaded when someone opens the search (click, "/" or Ctrl/Cmd+K), never on page load.

   Loaded on every page: display-controls.js appends this script after building its controls (~1,000 pages);
   the math-hub shell pages, whose controls are inline, carry the <script> tag themselves (add_site_search.py
   patches them and their generators/templates). Finds either #header-controls or .header-controls, copies its
   buttons' class so the magnifier matches, and widens the space those headers reserve for the controls
   (padding-right on the header / floating bar) by the new button's width. */
(function () {
    "use strict";
    if (window.MESSearch) return;

    var INDEX_URL = "/search/index.json";
    var data = null, loading = null, prepared = null;

    /* ---------- engine ---------- */
    function norm(s) {
        s = String(s || "").toLowerCase();
        if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
        return s.replace(/['’]/g, "")
            .replace(/(\d)\/(\d)/g, "$1$2 $1 $2")           /* "9/11" matches 911, 9/11 and "9 11" */
            .replace(/[^a-z0-9]+/g, " ").trim();
    }
    function load() {
        if (data) return Promise.resolve(data);
        if (!loading) {
            loading = fetch(INDEX_URL, { credentials: "omit" }).then(function (r) {
                if (!r.ok) throw new Error("search index " + r.status);
                return r.json();
            }).then(function (d) {
                data = d;
                prepared = d.p.map(function (r) {
                    return { r: r, t: " " + norm(r[1]) + " ", w: " " + norm(r[2] + " " + d.cats[r[4]][1]) + " ",
                        u: " " + norm(r[0]) + " ", d: " " + norm(r[3]) + " " };
                });
                return d;
            }, function (e) { loading = null; throw e; });
        }
        return loading;
    }
    /* points for one term in one field: whole word > word prefix > anywhere (3+ letters) */
    function hit(field, term, whole, prefix, sub) {
        if (field.indexOf(" " + term + " ") !== -1) return whole;
        if (field.indexOf(" " + term) !== -1) return prefix;
        if (term.length >= 3 && field.indexOf(term) !== -1) return sub;
        return 0;
    }
    var CAT_BOOST = { calculators: 6, tools: 6, math: 2, fun: -2 };
    function search(q, cat) {
        if (!prepared) return { items: [], partial: false, terms: [] };
        var nq = norm(q), terms = nq ? nq.split(" ").filter(function (t, i, a) { return a.indexOf(t) === i; }) : [];
        var ci = -1;
        if (cat) data.cats.forEach(function (c, i) { if (c[0] === cat) ci = i; });
        var all = [], partial = [];
        prepared.forEach(function (p) {
            if (ci !== -1 && p.r[4] !== ci) return;
            if (!terms.length) { all.push({ p: p, s: 0 }); return; }
            var score = 0, matched = 0;
            terms.forEach(function (t) {
                var s = Math.max(hit(p.t, t, 12, 8, 4), hit(p.w, t, 5, 3, 1), hit(p.u, t, 4, 3, 1), hit(p.d, t, 3, 2, 1));
                if (s) { matched++; score += s; }
            });
            if (!matched) return;
            if (terms.length > 1 && p.t.indexOf(" " + nq + " ") !== -1) score += 15;
            else if (terms.length > 1 && p.t.indexOf(" " + nq) !== -1) score += 10;
            if (p.t.indexOf(" " + nq) === 0) score += 8;
            score += CAT_BOOST[data.cats[p.r[4]][0]] || 0;
            (matched === terms.length ? all : partial).push({ p: p, s: score, m: matched });
        });
        var usePartial = !all.length && partial.length;
        var list = usePartial ? partial : all;
        list.sort(function (a, b) {
            return (b.m || 0) - (a.m || 0) || b.s - a.s || a.p.r[1].length - b.p.r[1].length || (a.p.r[1] < b.p.r[1] ? -1 : 1);
        });
        if (!terms.length) list.sort(function (a, b) { return a.p.r[1].localeCompare(b.p.r[1]); });
        return {
            partial: !!usePartial, terms: terms,
            items: list.map(function (x) {
                var r = x.p.r;
                return { path: r[0], title: r[1], where: r[2], desc: r[3], cat: data.cats[r[4]][0], catLabel: data.cats[r[4]][1], thumb: r[5] };
            })
        };
    }
    function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    /* escape + wrap word-start matches of the query terms in <mark> */
    function highlight(text, terms) {
        text = String(text || "");
        var ts = (terms || []).filter(function (t) { return t.length > 1 || /\d/.test(t); });
        if (!ts.length) return esc(text);
        var re = new RegExp("(^|[^A-Za-z0-9À-ɏ])(" + ts.map(function (t) {
            return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }).sort(function (a, b) { return b.length - a.length; }).join("|") + ")", "gi");
        var out = "", last = 0, m;
        while ((m = re.exec(text))) {
            var start = m.index + m[1].length;
            out += esc(text.slice(last, start)) + "<mark>" + esc(m[2]) + "</mark>";
            last = start + m[2].length;
            if (re.lastIndex === m.index) re.lastIndex++;
        }
        return out + esc(text.slice(last));
    }
    /* open: lets pages that draw their own search button (the Next.js dashboards at mes.fm/portfolio, /assets, ...) open the same overlay */
    window.MESSearch = { load: load, search: search, highlight: highlight, esc: esc, norm: norm, open: open, cats: function () { return data ? data.cats : []; } };

    /* ---------- header button + overlay ---------- */
    var group = null;
    var onSearchPage = /^\/search\/?$/.test(location.pathname);
    var ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false" style="display:block">' +
        '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
        '<line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';
    var btn = null;

    /* on pages where this script runs before display-controls.js has built the controls (e.g. /search, which loads
       it up front), try again once every deferred script has run */
    function attach() {
        group = document.getElementById("header-controls") || document.querySelector(".header-controls");
        if (!group || document.getElementById("siteSearchBtn")) return !!group;
        var sib = group.querySelector("button");
        btn = document.createElement("button");
        btn.type = "button";
        btn.id = "siteSearchBtn";
        btn.className = sib ? sib.className : "header-control-btn";
        btn.setAttribute("aria-label", "Search mes.fm");
        btn.title = "Search mes.fm (/)";
        btn.innerHTML = ICON;
        group.insertBefore(btn, group.firstChild);
        btn.addEventListener("click", open);
        reserve();
        var rt;
        window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(reserve, 100); });
        return true;
    }
    if (!attach()) document.addEventListener("DOMContentLoaded", attach);

    /* the headers reserve room on the right for the controls (padding-right 150-180px); add the button's share */
    function reserve() {
        if (!btn || !btn.offsetWidth) return;
        var gs = getComputedStyle(group);
        var extra = btn.offsetWidth + (parseFloat(gs.columnGap) || parseFloat(gs.gap) || 6);
        var els = [document.getElementById("compact-nav"), group.parentElement,
            document.querySelector("#header .logo-text-container")];
        els.forEach(function (el, i) {
            if (!el || els.indexOf(el) !== i) return;
            el.style.removeProperty("padding-right");
            var base = parseFloat(getComputedStyle(el).paddingRight) || 0;
            if (base >= 100) el.style.setProperty("padding-right", (base + extra) + "px", "important");
        });
    }

    var box, input, list, foot, status, items = [], active = -1, lastFocus, timer;
    function css() {
        if (document.getElementById("mes-search-css")) return;
        var st = document.createElement("style");
        st.id = "mes-search-css";
        st.textContent = [
            "#mes-search{position:fixed;inset:0;z-index:1000;display:none;background:rgba(15,23,32,.55);padding:8vh 16px 16px;box-sizing:border-box;overflow-y:auto;",
            "font-family:inherit;--ss-bg:#fff;--ss-fg:#1e2733;--ss-sub:#667085;--ss-line:#e3e7ec;--ss-hover:#e6f4f2;--ss-accent:#0f766e;--ss-mark:#ccfbf1}",
            "#mes-search.is-open{display:block}",
            "#mes-search *{box-sizing:border-box}",
            "#mes-search .ss-panel{max-width:640px;margin:0 auto;background:var(--ss-bg);color:var(--ss-fg);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.35);overflow:hidden;text-align:left}",
            "#mes-search .ss-bar{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--ss-line)}",
            "#mes-search .ss-bar svg{flex:0 0 auto;color:var(--ss-accent)}",
            "#mes-search input{flex:1 1 auto;min-width:0;border:0;outline:0;background:transparent;color:var(--ss-fg);font:inherit;font-size:18px;padding:4px 0;-webkit-appearance:none;appearance:none}",
            "#mes-search input::-webkit-search-cancel-button{display:none}",
            "#mes-search .ss-close{flex:0 0 auto;border:1px solid var(--ss-line);background:transparent;color:var(--ss-sub);border-radius:6px;font:inherit;font-size:12px;padding:3px 7px;cursor:pointer}",
            "#mes-search ul{list-style:none;margin:0;padding:6px;max-height:60vh;overflow-y:auto}",
            "#mes-search li{margin:0;padding:0}",
            "#mes-search li a{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;color:var(--ss-fg) !important;text-decoration:none !important}",
            "#mes-search li a.is-active,#mes-search li a:hover{background:var(--ss-hover)}",
            "#mes-search .ss-thumb{flex:0 0 auto;width:44px;height:44px;border-radius:6px;object-fit:cover;background:var(--ss-line)}",
            "#mes-search .ss-ph{display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--ss-accent);font-size:18px}",
            "#mes-search .ss-text{min-width:0;flex:1 1 auto}",
            "#mes-search .ss-title{display:block;font-weight:700;font-size:15px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
            "#mes-search .ss-where{display:block;font-size:12.5px;color:var(--ss-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}",
            "#mes-search mark{background:var(--ss-mark);color:inherit;border-radius:2px;padding:0 1px}",
            "#mes-search .ss-status{padding:14px 16px;color:var(--ss-sub);font-size:14px;margin:0}",
            "#mes-search .ss-status:empty{display:none}",
            "#mes-search .ss-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--ss-line);font-size:13px;color:var(--ss-sub)}",
            "#mes-search .ss-foot a{color:var(--ss-accent) !important;font-weight:700;text-decoration:none !important}",
            "#mes-search .ss-foot a:hover{text-decoration:underline !important}",
            "#mes-search kbd{font:inherit;font-size:11px;border:1px solid var(--ss-line);border-radius:4px;padding:0 4px}",
            "body.dark-mode #mes-search,body.dark #mes-search{--ss-bg:#232323;--ss-fg:#eee;--ss-sub:#a0a8b3;--ss-line:#3a3a3a;--ss-hover:#1d3532;--ss-accent:#5eead4;--ss-mark:#134e4a}",
            "body.ss-lock{overflow:hidden}",
            "@media (max-width:600px){#mes-search{padding:10px 8px}#mes-search .ss-hint{display:none}#mes-search ul{max-height:none}}"
        ].join("");
        document.head.appendChild(st);
    }
    function build() {
        if (box) return;
        css();
        box = document.createElement("div");
        box.id = "mes-search";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.setAttribute("aria-label", "Search mes.fm");
        box.innerHTML =
            '<div class="ss-panel"><form class="ss-bar" role="search" action="/search" method="get">' + ICON.replace('width="15" height="15"', 'width="20" height="20"') +
            '<input type="search" name="q" autocomplete="off" spellcheck="false" placeholder="Search mes.fm" aria-label="Search mes.fm" ' +
            'role="combobox" aria-expanded="true" aria-controls="mes-search-list" aria-autocomplete="list">' +
            '<button type="button" class="ss-close" aria-label="Close search">Esc</button></form>' +
            '<p class="ss-status" role="status"></p><ul id="mes-search-list" role="listbox"></ul>' +
            '<div class="ss-foot"><a class="ss-all" href="/search">Search page &rarr;</a>' +
            '<span class="ss-hint"><kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move &middot; <kbd>Enter</kbd> to open &middot; <kbd>Esc</kbd> to close</span></div></div>';
        document.body.appendChild(box);
        input = box.querySelector("input");
        list = box.querySelector("ul");
        status = box.querySelector(".ss-status");
        foot = box.querySelector(".ss-all");
        box.addEventListener("mousedown", function (e) { if (e.target === box) close(); });
        box.querySelector(".ss-close").addEventListener("click", close);
        box.querySelector("form").addEventListener("submit", function (e) {
            e.preventDefault();
            go(active >= 0 && items[active] ? items[active].path : allUrl());
        });
        input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 60); });
        input.addEventListener("keydown", function (e) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (!items.length) return;
                var n = Math.min(items.length, 8);
                move(e.key === "ArrowDown" ? (active + 1) % n : (active <= 0 ? n - 1 : active - 1));
            }
        });
        box.addEventListener("keydown", function (e) {
            if (e.key === "Escape") { e.preventDefault(); close(); }
            if (e.key === "Tab") {       /* keep focus inside the dialog */
                var f = box.querySelectorAll("input, button, a[href]");
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
    }
    function allUrl() {
        var q = input.value.trim();
        return "/search" + (q ? "?q=" + encodeURIComponent(q) : "");
    }
    function go(url) { location.href = url; }
    function move(i) {
        var links = list.querySelectorAll("a");
        if (links[active]) { links[active].classList.remove("is-active"); links[active].setAttribute("aria-selected", "false"); }
        active = i;
        if (links[i]) {
            links[i].classList.add("is-active");
            links[i].setAttribute("aria-selected", "true");
            input.setAttribute("aria-activedescendant", links[i].id);
            links[i].scrollIntoView({ block: "nearest" });
        } else input.removeAttribute("aria-activedescendant");
    }
    function run() {
        var q = input.value.trim();
        foot.href = allUrl();
        active = -1;
        input.removeAttribute("aria-activedescendant");
        if (!q) {
            items = [];
            list.innerHTML = "";
            status.textContent = "Search calculators, tools, math tutorials, memes, 9/11 and Hutchison Effect posts, livestreams...";
            foot.innerHTML = "Search page &rarr;";
            return;
        }
        if (!data) {
            status.textContent = "Loading...";
            load().then(run, function () { status.textContent = "Search is unavailable right now. Try again in a moment."; });
            return;
        }
        var res = search(q);
        items = res.items;
        var shown = items.slice(0, 8);
        status.textContent = !items.length ? "No pages match “" + q + "”." : res.partial ? "No page has every word; closest matches:" : "";
        list.innerHTML = shown.map(function (it, i) {
            var th = it.thumb ? '<img class="ss-thumb" src="' + esc(it.thumb) + '" alt="" loading="lazy" width="44" height="44" onerror="this.style.visibility=\'hidden\'">'
                : '<span class="ss-thumb ss-ph" aria-hidden="true">' + esc(it.title.charAt(0).toUpperCase()) + "</span>";
            return '<li><a id="ss-opt-' + i + '" role="option" aria-selected="false" href="' + esc(it.path) + '">' + th +
                '<span class="ss-text"><span class="ss-title">' + highlight(it.title, res.terms) + '</span><span class="ss-where">' +
                esc(it.catLabel) + (it.where && it.where !== it.catLabel ? " &middot; " + esc(it.where) : "") + "</span></span></a></li>";
        }).join("");
        foot.textContent = items.length > shown.length ? "See all " + items.length + " results →" : "Open on the search page →";
    }
    function open() {
        if (onSearchPage) {
            var own = document.getElementById("ss-q");
            if (own) { own.focus(); own.select(); own.scrollIntoView({ block: "center" }); return; }
        }
        build();
        lastFocus = document.activeElement;
        box.classList.add("is-open");
        document.body.classList.add("ss-lock");
        input.focus();
        input.select();
        load().catch(function () {});
        run();
    }
    function close() {
        if (!box || !box.classList.contains("is-open")) return;
        box.classList.remove("is-open");
        document.body.classList.remove("ss-lock");
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    /* "/" or Ctrl/Cmd+K opens the search from anywhere except text fields */
    document.addEventListener("keydown", function (e) {
        var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey) { e.preventDefault(); open(); }
        else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(); }
    });
    window.MESSearch.open = open;
})();
