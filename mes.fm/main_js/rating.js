/* MES "Rate this page": one compact line of stars just above the Comments bar (else above the footer) on every public page.
   Loaded lazily by site-search.js when the bottom of the page nears the screen. Votes go to /api/rating (one per browser per
   page, changing it replaces it); the average is shown once a page has 5 ratings. "Tell us more" opens a short text box whose
   text is only ever sent through the prefilled contact form (the visitor presses its Send): nothing written is stored or shown here.
   Ranking: mes.fm/ratings. Opt out per page with <body data-no-rating> or <html data-no-rating>. */
(function () {
    "use strict";
    if (window.__mesRating) return; window.__mesRating = 1;
    var EXCLUDE = /^\/(ads|search-console|earnings|contact|privacy-policy|donate|ratings|feedback|portfolio|taxes|sov|lp|assets|random-wallets|finance|ai|mfa|404|f|r|ri)(\/|$)|_https?_|\/1$/;
    var KEY = "mes-rating:v1", MIN_MS = 4000, EMAIL = "contact@mes.fm";
    var API = "/api/rating";
    function pagePath() {
        var p = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
        if (p.length > 1) p = p.replace(/\/+$/, "");
        return p || "/";
    }
    var path = pagePath();
    if (EXCLUDE.test(path) || document.documentElement.hasAttribute("data-no-rating") || (document.body && document.body.hasAttribute("data-no-rating"))) return;
    if (/^(404|page not found)/i.test(document.title)) return;
    if (document.getElementById("mes-rate")) return;
    var anchor = document.getElementById("comments-button") || document.querySelector(".mes-comments-toggle") || document.getElementById("footer");
    if (!anchor || !anchor.parentNode) return;

    function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object" && s.v) return s; } catch (e) { /* ignore */ } return { v: {} }; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
    function browserId(s) {
        if (!/^[a-f0-9]{32}$/.test(s.id || "")) {
            var a = new Uint8Array(16), h = "";
            (window.crypto || window.msCrypto).getRandomValues(a);
            for (var i = 0; i < 16; i++) h += (a[i] < 16 ? "0" : "") + a[i].toString(16);
            s.id = h; save(s);
        }
        return s.id;
    }
    var state = load(), mine = Number(state.v[path]) || 0, stats = null, busy = false;
    var title = (document.title || "").split(/\s+[|–—-]\s+/)[0].trim().slice(0, 90) || path;

    var CSS = ".mes-rate{margin:1.4em auto .9em;padding:.55em .8em;max-width:100%;box-sizing:border-box;border-top:1px solid rgba(127,127,127,.28);font-size:1rem;line-height:1.4;text-align:left;clear:both}" +
        ".mes-rate,.mes-rate *{color:#333;font-family:inherit}" +
        ".mes-rate__row{display:flex;flex-wrap:wrap;align-items:center;gap:.25em .7em}" +
        ".mes-rate__lab{font-weight:700;font-size:.95em}" +
        ".mes-rate__stars{display:inline-flex;gap:.1em}" +
        ".mes-rate__s{appearance:none;-webkit-appearance:none;border:0;background:transparent;padding:0 .08em;margin:0;min-width:36px;min-height:36px;font-size:1.55em;line-height:1;cursor:pointer;border-radius:.3em;touch-action:manipulation}" +
        ".mes-rate .mes-rate__s{color:#b9bec6}.mes-rate .mes-rate__s.is-on{color:#e8a200}" +
        ".mes-rate__s:focus-visible{outline:2px solid #1a5fb4;outline-offset:1px}" +
        ".mes-rate__s:disabled{cursor:progress}" +
        ".mes-rate__info{font-size:.92em}.mes-rate .mes-rate__info b{font-weight:700}" +
        ".mes-rate .mes-rate__lnk{background:none;border:0;padding:.3em .1em;margin:0;font:inherit;font-size:1em;color:#1a5fb4!important;text-decoration:underline;cursor:pointer;min-height:32px}" +
        ".mes-rate .mes-rate__err{color:#a3261c}" +
        ".mes-rate__more{margin-top:.6em}.mes-rate__more[hidden]{display:none}" +
        ".mes-rate .mes-rate__ta{display:block;width:100%;box-sizing:border-box;min-height:5.5em;padding:.5em .6em;font:inherit;font-size:1em;color:#222;background:#fff;border:1px solid #b9bec6;border-radius:.4em;resize:vertical}" +
        ".mes-rate__acts{display:flex;flex-wrap:wrap;gap:.5em;align-items:center;margin-top:.5em}" +
        ".mes-rate .mes-rate__btn{display:inline-flex;align-items:center;min-height:40px;padding:.35em .9em;border-radius:.4em;border:1px solid #1a5fb4;background:#1a5fb4;color:#fff!important;text-decoration:none;font-weight:700;font-size:.95em}" +
        ".mes-rate .mes-rate__btn--ghost{background:transparent;color:#1a5fb4!important}" +
        ".mes-rate .mes-rate__note{font-size:.85em;margin:.45em 0 0;color:#555}" +
        ".mes-rate__hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}" +
        "body.dark-mode .mes-rate,body.dark-mode .mes-rate *,body.dark .mes-rate,body.dark .mes-rate *{color:#e4e4e4}" +
        "body.dark-mode .mes-rate .mes-rate__s,body.dark .mes-rate .mes-rate__s{color:#767b84}" +
        "body.dark-mode .mes-rate .mes-rate__s.is-on,body.dark .mes-rate .mes-rate__s.is-on{color:#f5b82e}" +
        "body.dark-mode .mes-rate .mes-rate__lnk,body.dark .mes-rate .mes-rate__lnk,body.dark-mode .mes-rate .mes-rate__btn--ghost,body.dark .mes-rate .mes-rate__btn--ghost{color:#8ab4f8!important;border-color:#8ab4f8}" +
        "body.dark-mode .mes-rate .mes-rate__btn:not(.mes-rate__btn--ghost),body.dark .mes-rate .mes-rate__btn:not(.mes-rate__btn--ghost){background:#2f6fd0;border-color:#2f6fd0;color:#fff!important}" +
        "body.dark-mode .mes-rate .mes-rate__ta,body.dark .mes-rate .mes-rate__ta{background:#1e1e1e;color:#e8e8e8;border-color:#555}" +
        "body.dark-mode .mes-rate .mes-rate__note,body.dark .mes-rate .mes-rate__note{color:#b8bec7}" +
        "body.dark-mode .mes-rate .mes-rate__err,body.dark .mes-rate .mes-rate__err{color:#ff9b8f}" +
        "body.dark-mode .mes-rate__s:focus-visible,body.dark .mes-rate__s:focus-visible{outline-color:#8ab4f8}";
    var st = document.createElement("style"); st.id = "mes-rate-css"; st.textContent = CSS; document.head.appendChild(st);

    var box = document.createElement("div");
    box.className = "mes-rate"; box.id = "mes-rate";
    var html = '<div class="mes-rate__row"><span class="mes-rate__lab" id="mes-rate-lab">Rate this page</span>' +
        '<span class="mes-rate__stars" role="radiogroup" aria-labelledby="mes-rate-lab">';
    for (var i = 1; i <= 5; i++) html += '<button type="button" class="mes-rate__s" role="radio" aria-checked="false" data-v="' + i + '" aria-label="' + i + (i === 1 ? " star" : " stars") + ' out of 5" tabindex="-1">★</button>';
    html += '</span><span class="mes-rate__info" aria-live="polite"></span></div>' +
        '<div class="mes-rate__more" hidden><label class="mes-rate__lab" for="mes-rate-ta">Tell us more (optional)</label>' +
        '<textarea class="mes-rate__ta" id="mes-rate-ta" maxlength="1000" placeholder="What was useful? What was missing, confusing or broken?"></textarea>' +
        '<div class="mes-rate__acts"><a class="mes-rate__btn" id="mes-rate-form" href="/contact" target="_blank" rel="noopener">Send feedback</a>' +
        '<button type="button" class="mes-rate__lnk" id="mes-rate-close">Close</button></div>' +
        '<p class="mes-rate__note">Opens our contact form in a new tab with your message filled in: add your name and email there and press its Send button. Prefer email? Write to ' + EMAIL + '. Nothing you write is posted on this page or kept by the rating.</p></div>' +
        '<input class="mes-rate__hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">';
    box.innerHTML = html;
    anchor.parentNode.insertBefore(box, anchor);

    var stars = Array.prototype.slice.call(box.querySelectorAll(".mes-rate__s"));
    var info = box.querySelector(".mes-rate__info"), more = box.querySelector(".mes-rate__more"), ta = box.querySelector(".mes-rate__ta");
    var form = box.querySelector("#mes-rate-form"), hp = box.querySelector(".mes-rate__hp");

    function paint(n) {
        stars.forEach(function (b, k) {
            var on = k < n; b.classList.toggle("is-on", on);
            b.setAttribute("aria-checked", String(k + 1 === mine));
            b.tabIndex = (mine ? k + 1 === mine : k === 0) ? 0 : -1;
        });
    }
    function avgText() {
        if (!stats || !stats.count) return "";
        if (stats.avg == null) return stats.count + (stats.count === 1 ? " rating" : " ratings") + " so far";
        return "<b>" + stats.avg.toFixed(1) + " ★</b> from " + stats.count + " ratings";
    }
    function linkBtn(id, text) { return '<button type="button" class="mes-rate__lnk" data-act="' + id + '">' + text + "</button>"; }
    function render(msg, isErr) {
        paint(mine);
        var parts = [];
        if (msg) parts.push(isErr ? '<span class="mes-rate__err">' + msg + "</span>" : msg);
        var a = avgText();
        if (mine) {
            if (!msg) parts.push("Thanks!" + (a ? "" : " You rated it " + mine + " ★"));
            if (a) parts.push(a);
            parts.push(linkBtn("change", "Change") + " · " + linkBtn("more", "Tell us more"));
        } else {
            if (a) parts.push(a);
            parts.push(linkBtn("more", "Feedback"));
        }
        parts.push('<a class="mes-rate__lnk" href="/ratings">Top rated pages</a>');
        info.innerHTML = parts.join(" · ");
    }
    function feedbackLinks() {
        var text = (ta.value || "").trim().slice(0, 1000);
        var subj = "Feedback on " + title;
        var body = (text ? text + "\n\n" : "") + "Page: " + location.origin + path + (mine ? "\nMy rating: " + mine + " out of 5" : "");
        form.href = "/contact?subject=" + encodeURIComponent(subj) + "&message=" + encodeURIComponent(body);
    }
    ta.addEventListener("input", feedbackLinks);
    box.querySelector("#mes-rate-close").addEventListener("click", function () { more.hidden = true; });
    info.addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]"); if (!b) return;
        if (b.getAttribute("data-act") === "more") { more.hidden = !more.hidden; feedbackLinks(); if (!more.hidden) ta.focus(); }
        else { render("Pick a new rating."); (stars[mine - 1] || stars[0]).focus(); }
    });

    function errText(code) {
        if (code === 409) return "This page was already rated from your network.";
        if (code === 429) return "Too many ratings from your network just now. Please try again later.";
        if (code === 404 || code === 503) return "Ratings are not available here yet.";
        return "Could not save your rating. Please try again later.";
    }
    function vote(n) {
        if (busy) return;
        busy = true;
        var old = mine; mine = n; paint(n);
        info.textContent = "Saving…";
        stars.forEach(function (b) { b.disabled = true; });
        var wait = Math.max(0, MIN_MS + 200 - (window.performance && performance.now ? performance.now() : MIN_MS));
        setTimeout(function () {
            var s = load(), payload = { path: path, stars: n, id: browserId(s), t: Math.round(performance && performance.now ? performance.now() : MIN_MS), hp: hp.value };
            fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "omit" }).then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) { return { code: r.status, j: j }; });
            }).then(function (x) {
                if (x.code !== 200) throw x.code;
                s = load(); s.v[path] = n; save(s);
                if (typeof x.j.count === "number") stats = { count: x.j.count, avg: x.j.avg, hist: x.j.hist };
                render(x.j.changed ? "Rating changed." : "");
            }).catch(function (code) {
                mine = old; render(errText(typeof code === "number" ? code : 0), true);
            }).then(function () { busy = false; stars.forEach(function (b) { b.disabled = false; }); });
        }, wait);
    }
    stars.forEach(function (b, k) {
        b.addEventListener("click", function () { vote(k + 1); });
        b.addEventListener("mouseenter", function () { if (!busy) paint(k + 1); });
        b.addEventListener("focus", function () { if (!busy && box.matches(":focus-within") && b.matches(":focus-visible")) paint(k + 1); });
        b.addEventListener("keydown", function (e) {
            var to = null;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") to = Math.min(4, k + 1);
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = Math.max(0, k - 1);
            else if (e.key === "Home") to = 0; else if (e.key === "End") to = 4;
            if (to !== null) { e.preventDefault(); stars.forEach(function (x, j) { x.tabIndex = j === to ? 0 : -1; }); stars[to].focus(); paint(to + 1); }
        });
    });
    box.querySelector(".mes-rate__stars").addEventListener("mouseleave", function () { if (!busy) paint(mine); });
    box.querySelector(".mes-rate__stars").addEventListener("focusout", function (e) { if (!busy && !box.querySelector(".mes-rate__stars").contains(e.relatedTarget)) paint(mine); });

    render();
    fetch(API + "?path=" + encodeURIComponent(path), { credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && typeof j.count === "number") { stats = j; if (!busy) render(); } }).catch(function () { /* offline / no API: stars still work */ });
})();
