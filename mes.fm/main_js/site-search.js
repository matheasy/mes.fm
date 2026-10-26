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
    var HC_CSS = [
        ".hc-more{display:none}",
        ".hc-group .hc-more{order:0}.hc-group #siteReadBtn{order:1}.hc-group #textSizeDownBtn,.hc-group #textSizeDown{order:2}.hc-group #textSizeUpBtn,.hc-group #textSizeUp{order:3}.hc-group #siteFavBtn{order:4}.hc-group #siteSearchBtn{order:5}.hc-group #themeToggleBtn,.hc-group #themeToggle{order:6}",
        "#hdrMorePanel{display:none}",
        "@media (max-width:768px),(pointer:coarse){",
        ".hc-group{gap:var(--hc-g,8px) !important;flex-wrap:nowrap !important;justify-content:flex-end !important;max-width:calc(100vw - 76px) !important}",
        ".hc-group .hc-btn{width:var(--hc-s,44px) !important;height:var(--hc-s,44px) !important;font-size:1.05em !important;flex:0 0 auto}#hdrMorePanel .hc-btn{width:44px !important;height:44px !important;font-size:1.05em !important;flex:0 0 auto}",
        ".hc-group .hc-btn svg{width:calc(var(--hc-s,44px) * .5) !important;height:calc(var(--hc-s,44px) * .5) !important}#hdrMorePanel .hc-btn svg{width:22px !important;height:22px !important}",
        ".hc-group .hc-more{display:flex !important}.hc-group .hc-more.hc-none{display:none !important}",
        /* the More panel: buttons that do not fit the one-row bar live here (press and hold any button to move it between the bar and the panel) */
        "#hdrMorePanel.open{display:block;position:fixed;z-index:2147483000;background:#fff;color:#222;border:1px solid #c9ced6;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:10px}",
        "#hdrMorePanel .hc-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}#hdrMorePanel .hc-hint{font:12px/1.35 system-ui,sans-serif;color:#555;margin:8px 2px 0;text-align:right;max-width:236px;margin-left:auto}",
        "body.dark-mode #hdrMorePanel.open,body.dark #hdrMorePanel.open{background:#2a2a2a;color:#eee;border-color:#4a4a4a}body.dark-mode #hdrMorePanel .hc-hint,body.dark #hdrMorePanel .hc-hint{color:#b8b8b8}",
        "body.hc-dc #header{padding-top:3.7em !important}body.hc-dc #header-controls{top:.4em;right:56px}",
        "#compact-nav{height:60px !important}",
        "body.is-stuck .hc-group{top:7px !important;right:54px !important;bottom:auto !important;transform:none !important}",
        "body.is-stuck #navbar-button{top:7px !important}body.is-stuck #navbar.hide{top:64px !important}",
        /* a small tab under the floating bar hides / shows the whole bar (logo, buttons, hamburger) on phones, like the tab on Google's own anchor ads */
        "#hdrBarTab{display:none;position:fixed;top:60px;right:62px;z-index:16;width:50px;height:22px;padding:0;align-items:center;justify-content:center;background:#fff;color:#444;border:1px solid #cfd4da;border-top:0;border-radius:0 0 11px 11px;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.15)}",
        "#hdrBarTab svg{transition:transform .2s}body.is-stuck #hdrBarTab{display:flex}",
        "body.hc-barhide #compact-nav{transform:translateY(-120%) !important}body.hc-barhide.is-stuck .hc-group,body.hc-barhide.is-stuck #navbar-button{display:none !important}",
        "body.hc-barhide #hdrBarTab{top:0}body.hc-barhide #hdrBarTab svg{transform:rotate(180deg)}",
        "body.dark-mode #hdrBarTab,body.dark #hdrBarTab{background:#2a2a2a;color:#eee;border-color:#454545}",
        "}",
        "@media (max-width:380px){body.is-stuck .hc-group{top:9px !important}}",
        "@media (max-width:480px){",
        "body.hc-hub .header{padding-bottom:58px !important}body.hc-hub:not(.is-stuck) #header-controls{bottom:6px !important}",
        "body.hc-math .top-bar{padding-bottom:58px !important}body.hc-math:not(.is-stuck) .header-controls{bottom:6px !important}",
        "}"
    ].join("");
    var mobMQ = window.matchMedia ? window.matchMedia("(max-width:768px),(pointer:coarse)") : null;

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
            // a page whose title (without a leading "MES") or address IS the search gets to the top: "calculator" finds /calculator before the 100 other calculators
            var tt = p.t.replace(/^ mes /, " ");
            if (tt === " " + nq + " ") score += 40; else if (p.u === " " + nq.replace(/ /g, " ") + " " || p.u.replace(/ /g, "") === " " + nq.replace(/ /g, "") + " ") score += 30;
            // "calc", "calcul", "calculato", "calculator": the MES Calculator itself comes first (people look for BMI, GPA ... by their own names)
            if (p.r[0].replace(/\/$/, "") === "/calculator" && nq.length >= 3 && ("calculator".indexOf(nq) === 0 || nq === "calculators")) score += 200;
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
    var btn = null, rbtn = null, loadingRA = false;
    var RICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false" style="display:block">' +
        '<path d="M3 9.5v5h4l5 4v-13l-5 4z" fill="currentColor"/>' +
        '<path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

    /* the speaker button (read this page aloud, with the word and sentence highlighted): the engine (main_js/site-read-aloud.js, built from the
       MES Read Aloud browser extension's reader by build_site_read_aloud.py) is only downloaded when it is clicked */
    function readAloud() {
        if (window.MESReadAloud) { window.MESReadAloud.toggle(); return; }
        if (loadingRA) return;
        loadingRA = true; rbtn.setAttribute("aria-busy", "true");
        var sc = document.createElement("script");
        sc.src = "/main_js/site-read-aloud.js?v=1";
        sc.onload = function () { loadingRA = false; rbtn.removeAttribute("aria-busy"); if (window.MESReadAloud) window.MESReadAloud.toggle(); };
        sc.onerror = function () { loadingRA = false; rbtn.removeAttribute("aria-busy"); };
        document.head.appendChild(sc);
    }


    /* ---- Favourites: a star that adds / removes this page in mes.fm/fav (list in localStorage "mes-fav:v1", same format the /fav page
       uses), plus a "Favourites" link in the side menu. Extra button on phones (hidden behind the chevron with read aloud / text size). */
    var fbtn = null, FKEY = "mes-fav:v1";
    var STAR = '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    var STARON = STAR.replace('fill="none"', 'fill="#f5a623"').replace('stroke="currentColor"', 'stroke="#f5a623"');
    function favPath() {
        var p = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
        if (p.length > 1) p = p.replace(/\/+$/, "");
        return p || "/";
    }
    function favLoad() {
        try { var s = JSON.parse(localStorage.getItem(FKEY)); if (s && Array.isArray(s.groups) && s.groups.length) return s; } catch (e) { /* ignore */ }
        return { v: 1, groups: [{ id: "g" + Date.now().toString(36), name: "Favourites", open: true, items: [] }], to: "" };
    }
    function favSave(s) { try { localStorage.setItem(FKEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
    function favIn(s, p) { return s.groups.filter(function (g) { return g.items && g.items.indexOf(p) !== -1; }); }
    function favPaint() { if (!fbtn) return; var on = favIn(favLoad(), favPath()).length > 0; fbtn.innerHTML = on ? STARON : STAR; fbtn.setAttribute("aria-pressed", on ? "true" : "false"); var t = on ? "In your favourites (click to remove)" : "Add this page to your favourites"; fbtn.title = t; fbtn.setAttribute("aria-label", t); }
    var favToastEl, favToastT;
    function favToast(msg, actions) {
        if (favToastEl) favToastEl.remove(); clearTimeout(favToastT);
        favToastEl = document.createElement("div"); favToastEl.setAttribute("role", "status");
        favToastEl.style.cssText = "position:fixed;left:50%;bottom:1.1em;transform:translateX(-50%);z-index:2147483000;background:#222;color:#fff;border-radius:.6em;padding:.65em 1em;box-shadow:0 8px 22px rgba(0,0,0,.35);display:flex;gap:1em;align-items:center;max-width:92vw;font:14px/1.3 system-ui,sans-serif";
        var sp = document.createElement("span"); sp.textContent = msg; sp.style.color = "inherit"; favToastEl.appendChild(sp);
        (actions || []).forEach(function (a) {
            var e = document.createElement(a.href ? "a" : "button"); e.textContent = a.label; if (a.href) e.href = a.href; else e.type = "button";
            e.style.cssText = "color:#ffcc66;font-weight:700;text-decoration:underline;background:none;border:0;padding:0;cursor:pointer;font:inherit;font-weight:700";
            if (a.run) e.addEventListener("click", function () { a.run(); favToastEl.remove(); });
            favToastEl.appendChild(e);
        });
        document.body.appendChild(favToastEl);
        favToastT = setTimeout(function () { if (favToastEl) favToastEl.remove(); }, 5000);
    }
    function favToggle() {
        var s = favLoad(), p = favPath(), had = favIn(s, p);
        if (had.length) {
            var snap = JSON.stringify(s);
            had.forEach(function (g) { g.items.splice(g.items.indexOf(p), 1); });
            if (favSave(s)) favToast("Removed from your favourites", [{ label: "Undo", run: function () { try { localStorage.setItem(FKEY, snap); } catch (e) { /* ignore */ } favPaint(); } }]);
        } else {
            var g = s.groups.filter(function (x) { return x.id === s.to; })[0] || s.groups[0];
            g.items = g.items || []; g.items.push(p); g.open = true; s.to = g.id;
            if (favSave(s)) favToast("Added to " + g.name, [{ label: "Open favourites", href: "/fav" }]); else favToast("Your browser would not save the favourite (private mode?)");
        }
        favPaint();
    }
    function favButton() {
        if (fbtn || !group || favPath() === "/fav" || document.getElementById("siteFavBtn")) return;
        fbtn = document.createElement("button"); fbtn.type = "button"; fbtn.id = "siteFavBtn";
        fbtn.className = (btn ? btn.className : "header-control-btn") + " hc-x";
        favPaint();
        group.insertBefore(fbtn, btn || group.firstChild);
        fbtn.addEventListener("click", favToggle);
        window.addEventListener("storage", function (e) { if (e.key === FKEY) favPaint(); });
    }
    function favMenu() {
        Array.prototype.forEach.call(document.querySelectorAll("a.navbar__link"), function (a) {
            if (!/^(https:\/\/mes\.fm)?\/browser\/?$/.test(a.getAttribute("href") || "")) return;
            var li = a.closest("li"); if (!li || li.previousElementSibling && li.previousElementSibling.getAttribute("data-fav")) return;
            var n = li.cloneNode(true); n.setAttribute("data-fav", "1");
            var l = n.querySelector("a.navbar__link"); l.setAttribute("href", "/fav"); l.textContent = "★ My Favourites"; l.removeAttribute("id");
            li.parentNode.insertBefore(n, li);
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", favMenu); else favMenu();

    /* burger / side menu: the wide "MES.fm ✓" wordmark under the Hive / Telegram icons (main_img/mes-logo-small.png, 126x29, which wrapped onto its
       own row and sat off-centre) becomes the small square MES mark + "MES.fm", on the same row as the icons and the same 2em height. One place for
       the ~1,000 classic pages that carry it (the markup stays as it is; the menu is closed while this runs, so nothing jumps). */
    function navLogo() {
        var links = document.querySelectorAll(".navbar__item--social a.info-bar__logo-container:not(.mes-navlogo)");
        if (!links.length) return;
        if (!document.getElementById("mes-navlogo-css")) {
            var st = document.createElement("style"); st.id = "mes-navlogo-css";
            st.textContent = ".navbar__item--social .social-container--navbar{align-items:center!important;column-gap:1em!important}" +
                ".navbar__item--social a.info-bar__logo-container.mes-navlogo{display:inline-flex!important;align-items:center;gap:.45em;height:2em;margin:0!important;padding:0;" +
                "color:#fff!important;text-decoration:none;font-weight:700;font-size:1em;line-height:1;white-space:nowrap;vertical-align:middle}" +
                ".navbar__item--social a.mes-navlogo:hover .mes-navlogo__t,.navbar__item--social a.mes-navlogo:focus-visible .mes-navlogo__t{text-decoration:underline}" +
                ".navbar__item--social .mes-navlogo img.mes-navlogo__mark{display:block;width:2em;height:2em;margin:0;border-radius:.3em;box-shadow:0 0 0 1px rgba(255,255,255,.55)}" +
                ".navbar__item--social .mes-navlogo .mes-navlogo__t{color:#fff!important;letter-spacing:.01em}";
            document.head.appendChild(st);
        }
        Array.prototype.forEach.call(links, function (a) {
            a.classList.add("mes-navlogo");
            a.setAttribute("aria-label", "MES.fm home");
            a.innerHTML = '<img class="mes-navlogo__mark" src="/img/logo-mark-64.png" width="32" height="32" alt=""><span class="mes-navlogo__t">MES.fm</span>';
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", navLogo); else navLogo();

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
        if (window.speechSynthesis) {
            rbtn = document.createElement("button");
            rbtn.type = "button";
            rbtn.id = "siteReadBtn";
            rbtn.className = btn.className;
            rbtn.setAttribute("aria-label", "Read this page aloud");
            rbtn.title = "Read this page aloud, highlighting the words (or the text you selected)";
            rbtn.innerHTML = RICON;
            group.insertBefore(rbtn, btn);
            rbtn.addEventListener("click", readAloud);
        }
        favButton();
        headerMore();
        reserve();
        var rt;
        window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(reserve, 100); });
        return true;
    }
    if (!attach()) document.addEventListener("DOMContentLoaded", attach);

    /* ---- phones / touch: recommended 44px header buttons + a chevron that shows or hides the extras (read aloud, A-, A+).
       Search and the theme button stay visible. The choice is remembered (localStorage hdrMore). Desktop is unchanged. Works for the
       three header families: display-controls.js pages (body.hc-dc), the hub pages with #header-controls (hc-hub) and the math-hub
       shell with .header-controls (hc-math). */
    function headerMore() {
        if (!group || document.getElementById("hdrMoreBtn")) return;
        var st = document.createElement("style"); st.id = "mes-hdr-more-css"; st.textContent = HC_CSS; document.head.appendChild(st);
        group.classList.add("hc-group");
        document.body.classList.add(document.getElementById("mes-display-controls-css") ? "hc-dc" : group.id === "header-controls" ? "hc-hub" : "hc-math");
        Array.prototype.forEach.call(group.querySelectorAll("button"), function (b) { b.classList.add("hc-btn"); });
        var sib = group.querySelector("button"), more = document.createElement("button");
        more.type = "button"; more.id = "hdrMoreBtn"; more.className = (sib ? sib.className.replace(/\bhc-x\b/, "") : "header-control-btn") + " hc-more";
        more.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2.3" fill="currentColor"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/><circle cx="19" cy="12" r="2.3" fill="currentColor"/></svg>';
        group.insertBefore(more, group.firstChild);
        /* phones: the bar is ONE row. Buttons not pinned to it sit in the More panel; press and hold a button (about half a second) to move it either way. */
        var KEYS = [["read", ["siteReadBtn"], "Read aloud"], ["tsd", ["textSizeDownBtn", "textSizeDown"], "Smaller text"], ["tsu", ["textSizeUpBtn", "textSizeUp"], "Larger text"], ["fav", ["siteFavBtn"], "Favourites"], ["search", ["siteSearchBtn"], "Search"], ["theme", ["themeToggleBtn", "themeToggle"], "Dark / light"]];
        var items = [];
        KEYS.forEach(function (k) { for (var n = 0; n < k[1].length; n++) { var e = document.getElementById(k[1][n]); if (e) { items.push({ key: k[0], el: e, name: k[2] }); break; } } });
        var DEFAULT_PINS = ["fav", "search", "theme"], MAXPIN = 6, pins = DEFAULT_PINS.slice();
        try { var sv = JSON.parse(localStorage.getItem("hdrPins")); if (Array.isArray(sv)) pins = sv.filter(function (x) { return typeof x === "string"; }).slice(0, MAXPIN); } catch (e) { /* ignore */ }
        var panel = document.createElement("div"); panel.id = "hdrMorePanel"; panel.setAttribute("role", "group"); panel.setAttribute("aria-label", "More header buttons");
        var row = document.createElement("div"); row.className = "hc-row"; var hint = document.createElement("div"); hint.className = "hc-hint";
        panel.appendChild(row); panel.appendChild(hint); document.body.appendChild(panel);
        function phone() { return !!(mobMQ && mobMQ.matches); }
        function layout() {
            var ph = phone();
            items.forEach(function (it) {
                var inBar = !ph || pins.indexOf(it.key) >= 0;
                (inBar ? group : row).appendChild(it.el); it.el.classList.add("hc-btn");
                var t = ph ? it.name + (inBar ? ". Press and hold to move it to the More menu." : ". Press and hold to pin it to the bar.") : null;
                if (t) it.el.setAttribute("data-hc-tip", t); else it.el.removeAttribute("data-hc-tip");
            });
            var extras = ph && items.some(function (it) { return pins.indexOf(it.key) < 0; });
            more.classList.toggle("hc-none", !extras); if (!extras || !ph) closePanel();
            hint.textContent = "Press and hold a button to move it to the bar. The more you pin, the smaller they get.";
            fitSize(); reserve();
        }
        /* every button on the bar stays on ONE row: they start at the 44px touch size and shrink (down to 30px) only when you pin enough of them that 44px would not fit */
        function fitSize() {
            if (!phone()) { group.style.removeProperty("--hc-s"); group.style.removeProperty("--hc-g"); return; }
            var n = group.querySelectorAll("button:not(.hc-none)").length, avail = Math.max(120, innerWidth - 76 - 4), size = 44, gap = 8;
            if (n * 44 + (n - 1) * 8 > avail) { gap = 6; size = Math.max(30, Math.floor((avail - (n - 1) * gap) / n)); }
            group.style.setProperty("--hc-s", size + "px"); group.style.setProperty("--hc-g", gap + "px");
        }
        window.addEventListener("resize", function () { fitSize(); reserve(); });
        function openPanel() {
            if (!phone()) return; var r = more.getBoundingClientRect(), gr = group.getBoundingClientRect();
            panel.classList.add("open"); panel.style.top = Math.round(r.bottom + 8) + "px"; panel.style.right = Math.max(8, Math.round(innerWidth - gr.right)) + "px";
            more.setAttribute("aria-expanded", "true"); more.setAttribute("aria-label", "Hide the More menu"); more.title = "Hide the More menu";
        }
        function closePanel() { panel.classList.remove("open"); more.setAttribute("aria-expanded", "false"); more.setAttribute("aria-label", "More buttons"); more.title = "More: read aloud, text size ..."; }
        closePanel();
        more.addEventListener("click", function () { panel.classList.contains("open") ? closePanel() : openPanel(); });
        document.addEventListener("click", function (e) { if (panel.classList.contains("open") && !panel.contains(e.target) && !more.contains(e.target)) closePanel(); }, true);
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });
        var sy = window.scrollY; window.addEventListener("scroll", function () { if (Math.abs(window.scrollY - sy) > 30) { closePanel(); } sy = window.scrollY; }, { passive: true });
        panel.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var it = items.filter(function (x) { return x.el === b; })[0]; if (it && (it.key === "read" || it.key === "search")) closePanel(); });
        /* press and hold */
        var holdT = null, sx = 0, sy2 = 0, suppress = 0;
        function startHold(e) {
            if (!phone()) return; var b = e.target.closest ? e.target.closest("button") : null; if (!b) return; var it = items.filter(function (x) { return x.el === b; })[0]; if (!it) return;
            sx = e.clientX; sy2 = e.clientY; clearTimeout(holdT);
            holdT = setTimeout(function () {
                holdT = null; var at = pins.indexOf(it.key);
                if (at >= 0) { pins.splice(at, 1); favToast(it.name + " moved to the More menu"); }
                else if (pins.length >= MAXPIN) { return; }
                else { pins.push(it.key); favToast(it.name + " is now on the bar"); }
                pins.sort(function (a, b2) { return KEYS.map(function (k) { return k[0]; }).indexOf(a) - KEYS.map(function (k) { return k[0]; }).indexOf(b2); });
                try { localStorage.setItem("hdrPins", JSON.stringify(pins)); } catch (er) { /* ignore */ }
                suppress = Date.now(); if (navigator.vibrate) navigator.vibrate(15); layout(); if (!pins.length || panel.classList.contains("open")) { if (more.classList.contains("hc-none")) closePanel(); else openPanel(); }
            }, 550);
        }
        function endHold() { clearTimeout(holdT); holdT = null; }
        [group, panel].forEach(function (c) {
            c.addEventListener("pointerdown", startHold); c.addEventListener("pointerup", endHold); c.addEventListener("pointercancel", endHold); c.addEventListener("pointerleave", endHold);
            c.addEventListener("pointermove", function (e) { if (holdT && (Math.abs(e.clientX - sx) > 12 || Math.abs(e.clientY - sy2) > 12)) endHold(); });
            c.addEventListener("contextmenu", function (e) { if (phone() && e.target.closest && e.target.closest("button")) e.preventDefault(); });
        });
        document.addEventListener("click", function (e) { if (suppress && Date.now() - suppress < 700) { e.stopPropagation(); e.preventDefault(); suppress = 0; } }, true);
        layout();
        if (mobMQ && mobMQ.addEventListener) mobMQ.addEventListener("change", layout); else if (mobMQ && mobMQ.addListener) mobMQ.addListener(layout);
        /* the hide / show tab */
        var tab = document.createElement("button"); tab.type = "button"; tab.id = "hdrBarTab";
        tab.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        document.body.appendChild(tab);
        function bar(hide, save) {
            document.body.classList.toggle("hc-barhide", hide); if (hide) closePanel();
            var t = hide ? "Show the top bar" : "Hide the top bar"; tab.setAttribute("aria-label", t); tab.title = t; tab.setAttribute("aria-expanded", hide ? "false" : "true");
            if (save) try { localStorage.setItem("hdrBar", hide ? "0" : "1"); } catch (e) { /* ignore */ }
        }
        var hid = false; try { hid = localStorage.getItem("hdrBar") === "0"; } catch (e) { /* ignore */ }
        bar(hid, false);
        tab.addEventListener("click", function () { bar(!document.body.classList.contains("hc-barhide"), true); });
    }

    /* the headers reserve room on the right for the controls (padding-right 150-180px); add the button's share */
    function reserve() {
        if (!btn || !btn.offsetWidth && !(group.classList.contains("hc-group") && mobMQ && mobMQ.matches)) return;
        if (group.classList.contains("hc-group") && mobMQ && mobMQ.matches) {   /* phones: the stuck bar needs room for exactly the visible buttons + the hamburger */
            var bar = document.getElementById("compact-nav");
            if (bar) { bar.style.removeProperty("padding-right"); bar.style.setProperty("padding-right", (group.offsetWidth + 54 + 14) + "px", "important"); }
            var pe = group.parentElement, lt = document.querySelector("#header .logo-text-container");
            if (pe) pe.style.removeProperty("padding-right"); if (lt) lt.style.removeProperty("padding-right");
            return;
        }
        var gs = getComputedStyle(group);
        var gap = parseFloat(gs.columnGap) || parseFloat(gs.gap) || 6;
        var extra = btn.offsetWidth + gap + (rbtn && rbtn.offsetWidth ? rbtn.offsetWidth + gap : 0) + (fbtn && fbtn.offsetWidth ? fbtn.offsetWidth + gap : 0);
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
            "#mes-search span,#mes-search kbd,#mes-search mark{color:inherit}",   /* the pages' CSS reset paints every span #333, which left result titles and the key hints unreadable in dark mode */
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
    /* the burger / side menu closes when you click or tap anywhere outside it (it used to close only from its own button) */
    function outsideClose(e) {
        var nav = document.getElementById("navbar"), btn = document.getElementById("navbar-button");
        /* in this site's markup the "hide" class is what SHOWS the menu (main.js toggles it from the burger) */
        if (!nav || !btn || !nav.classList.contains("hide")) return;
        if (nav.contains(e.target) || btn.contains(e.target)) return;
        if (e.target.closest && e.target.closest("#mes-search,#hdrMorePanel,.hc-group")) return;
        btn.click();
    }
    document.addEventListener("click", outsideClose, true);
    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        var nav = document.getElementById("navbar"), btn = document.getElementById("navbar-button");
        if (nav && btn && nav.classList.contains("hide")) btn.click();
    });
    window.MESSearch.open = open;

    /* "Rate this page" stars (main_js/rating.js, ~4 KB): fetched only when the Comments bar / footer nears the screen.
       rating.js decides itself which pages get it (private / utility pages, data-no-rating). */
    function ratingLoader() {
        var a = document.getElementById("comments-button") || document.querySelector(".mes-comments-toggle") || document.getElementById("footer");
        if (!a || window.__mesRatingLoad) return;
        window.__mesRatingLoad = 1;
        var done = false, t = 0;
        function go() {
            if (done) return; done = true;
            window.removeEventListener("scroll", onScroll);
            var s = document.createElement("script"); s.src = "/main_js/rating.js?v=2"; s.defer = true; document.head.appendChild(s);
        }
        function near() { var r = a.getBoundingClientRect(); return (r.width || r.height) && r.top < (window.innerHeight || 800) + 600; }
        function onScroll() { if (!t) t = setTimeout(function () { t = 0; if (near()) go(); }, 200); }
        window.addEventListener("scroll", onScroll, { passive: true });
        if (near()) go();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ratingLoader); else ratingLoader();
})();
