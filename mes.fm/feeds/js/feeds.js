/* MES Feeds (mes.fm/feeds): lists the RSS feeds written by build_feeds.py (feeds/index.json) with copy / subscribe buttons,
   and, for the site owner (localStorage mes-owner=1), a Podping sender: one custom_json per medium, id pp_<medium>_update,
   payload {version:"1.1", medium, reason:"update", iris, timestampNs, sessionId} as podping-hivewriter writes it. */
(function () {
    "use strict";
    var root = document.getElementById("fd"); if (!root) return;
    var $ = function (id) { return document.getElementById(id); };
    var LS_PING = "mes-feeds:lastping", LS_G = "mes-feeds:group";
    var feeds = [], group = "all";
    function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
    function toast(msg) {
        var t = document.querySelector(".tu-toast");
        if (!t) { t = document.createElement("div"); t.className = "tu-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
        t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
    }
    function copy(text) {
        var ok = function () { toast("Feed link copied"); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
        function fallback() { var a = document.createElement("textarea"); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); ok(); } catch (e) { prompt("Copy this link:", text); } a.remove(); }
    }
    function ago(d) {
        if (!d) return "";
        var days = Math.round((Date.now() - new Date(d).getTime()) / 864e5);
        return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? days + " days ago" : new Date(d).toLocaleDateString();
    }

    function render() {
        var grid = $("fd-grid");
        var list = feeds.filter(function (f) { return group === "all" || f.group === group; });
        if (!list.length) { grid.innerHTML = '<p class="fd-load">No feeds here.</p>'; return; }
        grid.innerHTML = list.map(function (f) {
            var enc = encodeURIComponent(f.url);
            var items = (f.latest || []).slice(0, 3).map(function (i) {
                return '<li><a href="' + esc(i.l) + '">' + esc(i.t) + '</a> <span class="fd-d">' + esc(i.d) + '</span></li>';
            }).join("");
            return '<article class="tu-card fd-card' + (f.id === "everything" ? " fd-main" : "") + '">' +
                '<div class="fd-top"><span class="fd-ico" aria-hidden="true">' + (f.medium === "video" ? "▶" : "≡") + '</span>' +
                '<div><h2 class="fd-t">' + esc(f.title) + '</h2><p class="fd-desc">' + esc(f.desc) + '</p></div></div>' +
                '<p class="fd-meta">' + f.count + " items · newest " + esc(ago(f.updated)) + '</p>' +
                (items ? '<ul class="fd-items">' + items + "</ul>" : "") +
                '<div class="fd-url"><input class="tu-input" readonly value="' + esc(f.url) + '" aria-label="Feed link for ' + esc(f.title) + '"></div>' +
                '<div class="fd-btns">' +
                '<button type="button" class="tu-btn tu-btn--primary" data-copy="' + esc(f.url) + '">Copy link</button>' +
                '<a class="tu-btn tu-btn--ghost" href="https://feedly.com/i/subscription/feed/' + enc + '" target="_blank" rel="noopener">Feedly</a>' +
                '<a class="tu-btn tu-btn--ghost" href="https://www.inoreader.com/?add_feed=' + enc + '" target="_blank" rel="noopener">Inoreader</a>' +
                '<a class="tu-btn tu-btn--ghost" href="' + esc(f.url) + '" target="_blank" rel="noopener">Open feed</a>' +
                "</div></article>";
        }).join("");
    }
    root.addEventListener("click", function (e) {
        var b = e.target.closest("[data-copy]"); if (b) { copy(b.getAttribute("data-copy")); return; }
        var g = e.target.closest(".fd-filter [data-g]");
        if (g) {
            group = g.getAttribute("data-g"); ls(LS_G, group);
            root.querySelectorAll(".fd-filter [data-g]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === g)); });
            render();
        }
    });
    root.addEventListener("focusin", function (e) { if (e.target.matches(".fd-url input")) e.target.select(); });

    /* ---------- owner: Podping ---------- */
    function lastPing() { try { return JSON.parse(ls(LS_PING) || "{}"); } catch (e) { return {}; } }
    function isNew(f) { var lp = lastPing()[f.id]; return f.updated && (!lp || lp < f.updated); }
    function drawPick(onlyNew) {
        var lp = lastPing();
        $("fd-pick").innerHTML = feeds.map(function (f) {
            var on = onlyNew ? isNew(f) : ($("fd-pk-" + f.id) ? $("fd-pk-" + f.id).checked : isNew(f));
            return '<label class="fd-pk"><input type="checkbox" id="fd-pk-' + f.id + '" data-id="' + f.id + '"' + (on ? " checked" : "") + "> " +
                esc(f.title) + ' <span class="fd-d">(' + f.medium + (isNew(f) ? ", new items" : "") + (lp[f.id] ? ", pinged " + esc(ago(lp[f.id + ":at"])) : "") + ")</span></label>";
        }).join("");
    }
    function drawAcct() {
        var H = window.MESHive, u = H && H.user();
        $("fd-acct").innerHTML = u ? "Signing as <b>@" + esc(u.name) + '</b> <button type="button" class="tu-btn tu-btn--ghost tu-btn--sm" id="fd-out">Log out</button>'
            : '<label class="tu-label" for="fd-name">Hive account</label> <input class="tu-input fd-name" id="fd-name" value="mes" autocomplete="username"> ' +
              '<button type="button" class="tu-btn tu-btn--ghost" id="fd-in">Log in</button>';
    }
    function log(html) { var d = document.createElement("div"); d.innerHTML = html; $("fd-log").prepend(d); }
    function payload(medium, iris) {
        var ts = String(Date.now()) + "000000";                       /* nanoseconds, as an exact integer */
        var sid = Math.floor(Math.random() * 9e15) + 1e15;
        return '{"version":"1.1","medium":"' + medium + '","reason":"update","iris":' + JSON.stringify(iris) +
            ',"timestampNs":' + ts + ',"sessionId":' + sid + "}";
    }
    function send() {
        var H = window.MESHive, u = H && H.user();
        if (!u) { toast("Log in with your Hive account first"); return; }
        var picked = [].slice.call(root.querySelectorAll(".fd-pk input:checked")).map(function (x) { return feeds.find(function (f) { return f.id === x.getAttribute("data-id"); }); });
        if (!picked.length) { toast("Tick at least one feed"); return; }
        var byMedium = {};
        picked.forEach(function (f) { (byMedium[f.medium] = byMedium[f.medium] || []).push(f); });
        var jobs = Object.keys(byMedium);
        $("fd-send").disabled = true;
        H.keychain(true).then(function (kc) {
            if (!kc) throw new Error("Hive Keychain was not found. Install it, or log in with the Keychain app.");
            var i = 0;
            (function next() {          /* one request at a time: Keychain refuses a 6th waiting request */
                if (i >= jobs.length) { $("fd-send").disabled = false; drawPick(); return; }
                var medium = jobs[i++], list = byMedium[medium], id = "pp_" + medium + "_update";
                kc.requestCustomJson(u.name, id, "Posting", payload(medium, list.map(function (f) { return f.url; })), "Podping: " + list.length + " MES feed(s) updated", function (r) {
                    if (r && r.success) {
                        var lp = lastPing(), now = new Date().toISOString();
                        list.forEach(function (f) { lp[f.id] = f.updated; lp[f.id + ":at"] = now; });
                        ls(LS_PING, JSON.stringify(lp));
                        var trx = r.result && (r.result.tx_id || r.result.id);
                        log("✓ <code>" + id + "</code> sent for " + list.length + " feed(s)" + (trx ? ' · <a href="https://hivehub.dev/tx/' + esc(trx) + '" target="_blank" rel="noopener">see it on Hive</a>' : ""));
                    } else {
                        log("✗ <code>" + id + "</code>: " + esc((r && (r.message || r.error)) || "not sent"));
                    }
                    next();
                });
            })();
        }).catch(function (e) { $("fd-send").disabled = false; log("✗ " + esc(e.message || e)); });
    }
    function owner() {
        if (ls("mes-owner") !== "1" && !/[?&]owner=1/.test(location.search)) return;
        $("fd-owner").hidden = false;
        var H = window.MESHive;
        drawAcct(); drawPick();
        if (H && H.onChange) H.onChange(drawAcct);
        $("fd-owner").addEventListener("click", function (e) {
            if (e.target.id === "fd-in") {
                var n = $("fd-name").value;
                H.login(n).then(drawAcct, function (err) { toast(err.message || "Login failed"); });
            } else if (e.target.id === "fd-out") { H.logout(); drawAcct(); }
            else if (e.target.id === "fd-send") send();
            else if (e.target.id === "fd-new") drawPick(true);
        });
    }

    var g0 = ls(LS_G);
    if (g0) { group = g0; root.querySelectorAll(".fd-filter [data-g]").forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-g") === group)); }); }
    fetch("/feeds/index.json", {cache: "no-cache"}).then(function (r) { return r.json(); }).then(function (d) {
        feeds = d.feeds || []; render(); owner();
    }).catch(function () { $("fd-grid").innerHTML = '<p class="fd-load">The feed list could not be loaded. Try again later.</p>'; });
    window.MESFeedsDebug = {feeds: function () { return feeds; }, payload: payload};
})();
