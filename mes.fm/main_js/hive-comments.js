/* "Hive comments" tab of the Comments box, on pages that mirror a Hive post. Loaded by comments.js the first time the
   Comments bar is opened (window.__mesHiveSrc = {author, permlink} of the original post). It puts two tabs at the top of
   #comments-box: "Comments" (the FastComments widget, untouched) and "Hive comments (N)" = the replies of the original
   post from bridge.get_discussion, threaded, with avatar, reputation, time, votes and payout, a PeakD link per reply,
   and Reply / Comment / Upvote buttons that sign with Hive Keychain (main_js/hive.js). The chosen tab is remembered
   (localStorage "mes-comments-tab"), the sort order ("mes-hive-sort") and the vote weight ("mes-hive-vw") too.
   Bodies go through MESHive.render(), the strict allowlist renderer: no raw HTML from the chain ever reaches the page. */
(function () {
    "use strict";
    var src = window.__mesHiveSrc;
    var box = document.getElementById("comments-box");
    var fc = document.getElementById("fastcomments-widget");
    var bar = document.getElementById("comments-button");
    if (!src || !box || !fc || document.getElementById("mes-hive-tabs")) return;

    function ls(k, v) {
        try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
        return null;
    }

    /* ---------- CSS (light + dark; the page's own dark class is body.dark or body.dark-mode) ---------- */
    var css = document.createElement("style");
    css.id = "mes-hive-comments-css";
    css.textContent = [
        ".mhc-tabs{display:flex;gap:.4em;flex-wrap:wrap;margin:.2em 0 .9em;border-bottom:2px solid #d5dde6}",
        ".mhc-tabs button{font:inherit;font-size:.95em;padding:.5em .95em;margin:0 0 -2px;border:2px solid transparent;border-bottom:none;border-radius:8px 8px 0 0;background:none;color:#1a5a8c;cursor:pointer}",
        ".mhc-tabs button[aria-selected=true]{background:#fff;border-color:#d5dde6;color:#14324d;font-weight:600}",
        ".mhc-tabs button:focus-visible{outline:2px solid #1479c7;outline-offset:2px}",
        ".mhc{font-size:.95em;line-height:1.5;color:#22303c}",
        ".mhc[hidden]{display:none}",
        ".mhc *{box-sizing:border-box}",
        ".mhc p,.mhc div,.mhc span,.mhc li,.mhc h3,.mhc h4,.mhc h5,.mhc h6,.mhc blockquote,.mhc td,.mhc label{color:inherit}",
        ".mhc-top{display:flex;flex-wrap:wrap;gap:.5em 1em;align-items:center;justify-content:space-between;margin:0 0 .8em}",
        ".mhc-top .mhc-src{font-size:.92em;opacity:.85}",
        ".mhc-ctl{display:flex;gap:.5em;align-items:center;flex-wrap:wrap}",
        ".mhc select,.mhc input[type=text],.mhc textarea{font:inherit;font-size:.95em;color:#22303c;background:#fff;border:1px solid #b9c6d3;border-radius:6px;padding:.35em .5em}",
        ".mhc textarea{width:100%;min-height:6.5em;resize:vertical;display:block}",
        ".mhc-btn{font:inherit;font-size:.92em;display:inline-flex;align-items:center;gap:.3em;padding:.38em .8em;border-radius:6px;border:1px solid #1479c7;background:#fff;color:#1479c7;cursor:pointer;text-decoration:none;line-height:1.3}",
        ".mhc-btn:hover{background:#eaf3fb}",
        ".mhc-btn--p{background:#1479c7;color:#fff}.mhc-btn--p:hover{background:#0f63a5}",
        ".mhc-btn[disabled]{opacity:.55;cursor:default}",
        ".mhc-btn--s{padding:.2em .55em;font-size:.85em;border-color:transparent;background:none}",
        ".mhc-btn--s:hover{background:rgba(20,121,199,.1)}",
        ".mhc-acct{display:flex;flex-wrap:wrap;gap:.5em;align-items:center;padding:.6em .75em;margin:0 0 .9em;border:1px solid #d5dde6;border-radius:8px;background:#f6f9fc}",
        ".mhc-acct img{width:28px;height:28px;border-radius:50%}",
        ".mhc-acct input{width:11em}",
        ".mhc-help{font-size:.9em;padding:.6em .75em;margin:.5em 0 .9em;border-left:3px solid #e0a100;background:#fff8e6;border-radius:0 6px 6px 0}",
        ".mhc-msg{font-size:.9em;margin:.4em 0;min-height:1.2em}.mhc-msg.err{color:#b42318}.mhc-msg.ok{color:#1a7f37}",
        ".mhc-c{display:flex;gap:.65em;margin:.9em 0 0}",
        ".mhc-av{flex:none;width:36px;height:36px;border-radius:50%;background:#dde5ee;object-fit:cover}",
        ".mhc-kids .mhc-av{width:28px;height:28px}",
        ".mhc-b{flex:1;min-width:0}",
        ".mhc-h{font-size:.88em;display:flex;flex-wrap:wrap;gap:.1em .45em;align-items:baseline}",
        ".mhc-h a{font-weight:600;text-decoration:none;color:#1a5a8c}.mhc-h a.mhc-t{font-weight:400;color:#5b6b7a}",
        ".mhc-rep{font-size:.85em;color:#5b6b7a}",
        ".mhc-body{overflow-wrap:anywhere;margin:.15em 0 .2em}",
        ".mhc-body p{margin:.35em 0}.mhc-body img{max-width:100%;height:auto;border-radius:4px}",
        ".mhc-body blockquote{margin:.4em 0;padding:.1em .8em;border-left:3px solid #c5d0db;color:#4a5866}",
        ".mhc-body pre{overflow:auto;background:#f0f3f6;padding:.6em;border-radius:6px;font-size:.88em}",
        ".mhc-body code{background:#f0f3f6;padding:0 .25em;border-radius:3px;font-size:.92em}.mhc-body pre code{background:none;padding:0}",
        ".mhc-body h3,.mhc-body h4,.mhc-body h5,.mhc-body h6{font-size:1.05em;margin:.6em 0 .3em}",
        ".mhc-body ul,.mhc-body ol{margin:.35em 0;padding-left:1.4em}",
        ".mhc-tbl{overflow-x:auto}.mhc-tbl table{border-collapse:collapse}.mhc-tbl td{border:1px solid #d5dde6;padding:.2em .45em}",
        ".mhc-f{display:flex;flex-wrap:wrap;gap:.15em .3em;align-items:center;font-size:.88em;color:#5b6b7a}",
        ".mhc-f .mhc-pay{padding:0 .4em}",
        ".mhc-vote[aria-pressed=true]{color:#1a7f37;font-weight:600}",
        ".mhc-kids{border-left:2px solid #e3e9ef;padding-left:.75em;margin-left:.1em}",
        ".mhc-flat>.mhc-b>.mhc-kids{border-left:none;padding-left:0}",
        ".mhc-gray>.mhc-b>.mhc-body{opacity:.55}",
        ".mhc-new{animation:mhcIn 1.6s ease-out}@keyframes mhcIn{from{background:#fff3c4}to{background:transparent}}",
        ".mhc-compose{margin:.6em 0 .2em}",
        ".mhc-compose .mhc-prev{border:1px dashed #b9c6d3;border-radius:6px;padding:.4em .7em;margin:.5em 0;min-height:2em}",
        ".mhc-compose .mhc-row{display:flex;flex-wrap:wrap;gap:.45em;align-items:center;margin:.45em 0 0}",
        ".mhc-note{font-size:.85em;color:#5b6b7a}",
        ".mhc-empty{padding:1em 0;color:#5b6b7a}",
        ".mhc-more{margin:1.2em 0 .2em;font-size:.88em;color:#5b6b7a}",
        "body.dark .mhc-tabs,body.dark-mode .mhc-tabs{border-color:#3a4654}",
        "body.dark .mhc-tabs button,body.dark-mode .mhc-tabs button{color:#7cc0f5}",
        "body.dark .mhc-tabs button[aria-selected=true],body.dark-mode .mhc-tabs button[aria-selected=true]{background:#1e252d;border-color:#3a4654;color:#eef3f8}",
        "body.dark .mhc,body.dark-mode .mhc{color:#dfe6ee}",
        "body.dark .mhc select,body.dark .mhc input[type=text],body.dark .mhc textarea,body.dark-mode .mhc select,body.dark-mode .mhc input[type=text],body.dark-mode .mhc textarea{background:#161b21;color:#e8eef4;border-color:#4a5868}",
        "body.dark .mhc-btn,body.dark-mode .mhc-btn{background:transparent;color:#7cc0f5;border-color:#5aa8e6}",
        "body.dark .mhc-btn:hover,body.dark-mode .mhc-btn:hover{background:rgba(124,192,245,.12)}",
        "body.dark .mhc-btn--p,body.dark-mode .mhc-btn--p{background:#1f6fb3;color:#fff;border-color:#1f6fb3}",
        "body.dark .mhc-btn--s,body.dark-mode .mhc-btn--s{border-color:transparent}",
        "body.dark .mhc-acct,body.dark-mode .mhc-acct{background:#1b2229;border-color:#34404d}",
        "body.dark .mhc-help,body.dark-mode .mhc-help{background:#2b2412;border-color:#c99100}",
        "body.dark .mhc-msg.err,body.dark-mode .mhc-msg.err{color:#ff8b7a}body.dark .mhc-msg.ok,body.dark-mode .mhc-msg.ok{color:#6ad38a}",
        "body.dark .mhc-h a,body.dark-mode .mhc-h a,body.dark .mhc a,body.dark-mode .mhc a{color:#7cc0f5}",
        "body.dark .mhc-h a.mhc-t,body.dark-mode .mhc-h a.mhc-t,body.dark .mhc-rep,body.dark-mode .mhc-rep,body.dark .mhc-f,body.dark-mode .mhc-f,body.dark .mhc-note,body.dark-mode .mhc-note,body.dark .mhc-empty,body.dark-mode .mhc-empty,body.dark .mhc-more,body.dark-mode .mhc-more{color:#a9b6c3}",
        "body.dark .mhc-body blockquote,body.dark-mode .mhc-body blockquote{color:#c1ccd7;border-color:#4a5868}",
        "body.dark .mhc-body pre,body.dark .mhc-body code,body.dark-mode .mhc-body pre,body.dark-mode .mhc-body code{background:#11161b}",
        "body.dark .mhc-kids,body.dark-mode .mhc-kids{border-color:#2f3a45}",
        "body.dark .mhc-vote[aria-pressed=true],body.dark-mode .mhc-vote[aria-pressed=true]{color:#6ad38a}",
        "body.dark .mhc-tbl td,body.dark-mode .mhc-tbl td{border-color:#3a4654}",
        "@keyframes mhcInD{from{background:#3d3416}to{background:transparent}}body.dark .mhc-new,body.dark-mode .mhc-new{animation-name:mhcInD}",
        "@media (max-width:600px){.mhc-kids{padding-left:.45em}.mhc-c{gap:.45em}.mhc-av{width:30px;height:30px}.mhc-top{align-items:flex-start}}"
    ].join("\n");
    document.head.appendChild(css);

    /* ---------- tabs ---------- */
    var tabs = document.createElement("div");
    tabs.id = "mes-hive-tabs";
    tabs.className = "mhc-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Comments");
    tabs.innerHTML = '<button type="button" role="tab" id="mhc-tab-fc" data-t="fc" aria-controls="fastcomments-widget">Comments</button>' +
        '<button type="button" role="tab" id="mhc-tab-hive" data-t="hive" aria-controls="mes-hive-comments">Hive comments<span class="mhc-n"></span></button>';
    box.insertBefore(tabs, box.firstChild);
    var pane = document.createElement("div");
    pane.id = "mes-hive-comments";
    pane.className = "mhc";
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-labelledby", "mhc-tab-hive");
    pane.hidden = true;
    fc.parentNode.insertBefore(pane, fc.nextSibling);
    fc.setAttribute("role", "tabpanel");
    fc.setAttribute("aria-labelledby", "mhc-tab-fc");
    var tabCount = tabs.querySelector(".mhc-n");
    function setCount(n) {
        tabCount.textContent = n > 0 ? " (" + n.toLocaleString() + ")" : " (0)";
        if (bar) { bar.setAttribute("data-hive-final", "1"); if (n > 0) bar.setAttribute("data-hive-count", " · Hive (" + n.toLocaleString() + ")"); else bar.removeAttribute("data-hive-count"); }
    }
    if (window.__mesHiveCount != null) setCount(window.__mesHiveCount);

    var loaded = false;
    function show(t, focus) {
        if (t !== "hive") t = "fc";
        [].forEach.call(tabs.querySelectorAll("button"), function (b) {
            var on = b.getAttribute("data-t") === t;
            b.setAttribute("aria-selected", on ? "true" : "false");
            b.tabIndex = on ? 0 : -1;
            if (on && focus) b.focus();
        });
        fc.style.display = t === "fc" ? "" : "none";
        pane.hidden = t !== "hive";
        ls("mes-comments-tab", t);
        if (t === "hive" && !loaded) { loaded = true; start(); }
    }
    tabs.addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) show(b.getAttribute("data-t")); });
    tabs.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        var cur = tabs.querySelector("[aria-selected=true]").getAttribute("data-t");
        show(e.key === "Home" ? "fc" : e.key === "End" ? "hive" : cur === "fc" ? "hive" : "fc", true);
    });
    show(ls("mes-comments-tab") || "fc");

    /* ---------- helpers ---------- */
    function needHive() {
        if (window.MESHive) return Promise.resolve(window.MESHive);
        return new Promise(function (res, rej) {
            var s = document.createElement("script");
            s.src = "/main_js/hive.js?v=1";
            s.onload = function () { window.MESHive ? res(window.MESHive) : rej(new Error("hive.js")); };
            s.onerror = function () { rej(new Error("Could not load hive.js")); };
            document.head.appendChild(s);
        });
    }
    function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

    var H, data = null, rootKey = src.author + "/" + src.permlink, extra = {};
    var sortBy = ls("mes-hive-sort") || "oldest";
    var vw = +(ls("mes-hive-vw") || 100);

    function start() {
        pane.innerHTML = '<p class="mhc-empty">Loading the replies from the Hive blockchain…</p>';
        needHive().then(function (h) {
            H = h;
            build();
            H.onChange(function () { renderAcct(); renderList(); });
            fetchData();
        }).catch(function () { pane.innerHTML = '<p class="mhc-empty">Could not load the Hive comments. <a href="https://peakd.com/@' + src.author + "/" + src.permlink + '" target="_blank" rel="noopener">Read them on PeakD</a>.</p>'; });
    }

    var acct, list, msg, sortSel, topCompose;
    function build() {
        var E = H.esc;
        pane.innerHTML = "";
        var top = el("div", "mhc-top");
        top.innerHTML = '<span class="mhc-src">Replies to <a href="' + E(H.peakd(src.author, src.permlink)) + '" target="_blank" rel="noopener">the original post</a> by @' + E(src.author) + ' on the Hive blockchain.</span>' +
            '<span class="mhc-ctl"><label class="mhc-note" for="mhc-sort">Sort</label><select id="mhc-sort"><option value="oldest">Oldest first</option><option value="newest">Newest first</option><option value="votes">Most votes</option><option value="payout">Highest payout</option></select>' +
            '<button type="button" class="mhc-btn mhc-btn--s" id="mhc-refresh" title="Load the replies again">↻ Refresh</button></span>';
        pane.appendChild(top);
        sortSel = top.querySelector("#mhc-sort");
        sortSel.value = sortBy;
        sortSel.addEventListener("change", function () { sortBy = sortSel.value; ls("mes-hive-sort", sortBy); renderList(); });
        top.querySelector("#mhc-refresh").addEventListener("click", function () { fetchData(); });
        acct = el("div", "mhc-acct");
        pane.appendChild(acct);
        msg = el("p", "mhc-msg");
        msg.setAttribute("role", "status");
        pane.appendChild(msg);
        topCompose = el("div", "mhc-topc");
        pane.appendChild(topCompose);
        list = el("div", "mhc-list");
        pane.appendChild(list);
        var more = el("p", "mhc-more", 'Comments here are public posts on the Hive blockchain, signed in your own Hive Keychain; mes.fm never sees your keys. ' +
            'Have a Hive account? <a href="/premium">Turn off the ads on mes.fm for 1 HBD a month</a>.');
        pane.appendChild(more);
        renderAcct();
        list.addEventListener("click", onListClick);
    }
    function say(t, kind) { msg.textContent = t || ""; msg.className = "mhc-msg" + (kind ? " " + kind : ""); }

    function renderAcct() {
        var E = H.esc, u = H.user();
        if (u) {
            acct.innerHTML = '<img src="' + E(H.avatar(u.name)) + '" alt="" loading="lazy"><span>Logged in as <a href="' + E(H.peakd(u.name)) + '" target="_blank" rel="noopener">@' + E(u.name) + '</a></span>' +
                '<label class="mhc-note" for="mhc-vw">Vote weight</label><select id="mhc-vw">' + [100, 75, 50, 25, 10, 1].map(function (w) { return '<option value="' + w + '"' + (w === vw ? " selected" : "") + ">" + w + "%</option>"; }).join("") + "</select>" +
                '<button type="button" class="mhc-btn mhc-btn--s" id="mhc-logout">Log out</button>';
            acct.querySelector("#mhc-logout").addEventListener("click", function () { H.logout(); say("Logged out.", "ok"); });
            acct.querySelector("#mhc-vw").addEventListener("change", function (e) { vw = +e.target.value; ls("mes-hive-vw", String(vw)); });
            topCompose.innerHTML = "";
            var b = el("button", "mhc-btn mhc-btn--p", "✎ Comment on Hive");
            b.type = "button";
            b.addEventListener("click", function () { openCompose(topCompose, src.author, src.permlink, b); });
            topCompose.appendChild(b);
        } else {
            acct.innerHTML = '<span>Log in with Hive Keychain to reply or vote:</span>' +
                '<input type="text" id="mhc-user" placeholder="Hive username" autocomplete="username" autocapitalize="none" spellcheck="false" aria-label="Hive username">' +
                '<button type="button" class="mhc-btn mhc-btn--p" id="mhc-login">Log in</button>';
            var inp = acct.querySelector("#mhc-user"), btn = acct.querySelector("#mhc-login");
            var go = function () { doLogin(inp.value, btn); };
            btn.addEventListener("click", go);
            inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
            topCompose.innerHTML = "";
            H.keychain(1200).then(function (k) { if (!k && !H.user() && !acct.querySelector(".mhc-help")) { var h = el("div", "", H.helpHtml()); h.firstChild.className = "mhc-help"; acct.parentNode.insertBefore(h.firstChild, acct.nextSibling); } });
        }
    }
    function doLogin(name, btn) {
        btn.disabled = true;
        say("Waiting for Hive Keychain…");
        H.login(name).then(function (u) {
            say("Logged in as @" + u.name + ".", "ok");
            var help = pane.querySelector(".mhc-help"); if (help) help.parentNode.removeChild(help);
        }).catch(function (e) {
            btn.disabled = false;
            say(e.code === "nokeychain" ? "Hive Keychain is not installed in this browser (see below)." : (e.message || "Login failed."), "err");
            if (e.code === "nokeychain" && !pane.querySelector(".mhc-help")) { var h = el("div", "", H.helpHtml()); h.firstChild.className = "mhc-help"; acct.parentNode.insertBefore(h.firstChild, acct.nextSibling); }
        });
    }

    /* ---------- data ---------- */
    function fetchData() {
        if (list && !data) list.innerHTML = '<p class="mhc-empty">Loading the replies…</p>';
        return H.call("bridge.get_discussion", { author: src.author, permlink: src.permlink, observer: "" }).then(function (d) {
            data = d || {};
            /* keep replies we just posted until the API has them */
            Object.keys(extra).forEach(function (k) { if (data[k]) delete extra[k]; });
            renderList();
        }).catch(function () {
            list.innerHTML = '<p class="mhc-empty">The Hive nodes did not answer just now. <button type="button" class="mhc-btn mhc-btn--s" id="mhc-retry">Try again</button> or <a href="' + H.esc(H.peakd(src.author, src.permlink)) + '" target="_blank" rel="noopener">read them on PeakD</a>.</p>';
            var r = list.querySelector("#mhc-retry"); if (r) r.addEventListener("click", fetchData);
        });
    }
    function node(k) { return (data && data[k]) || extra[k] || null; }
    function kidsOf(k) {
        var n = node(k), out = [];
        if (n && n.replies) n.replies.forEach(function (r) { if (node(r)) out.push(r); });
        Object.keys(extra).forEach(function (x) { var e = extra[x]; if (e.parent_author + "/" + e.parent_permlink === k && out.indexOf(x) < 0) out.push(x); });
        var t = function (x) { return Date.parse(node(x).created + "Z") || 0; };
        var v = function (x) { var p = node(x); return (p.stats && p.stats.total_votes) || (p.active_votes || []).length; };
        var pay = function (x) { return +node(x).payout || 0; };
        out.sort(function (a, b) {
            if (sortBy === "newest") return t(b) - t(a);
            if (sortBy === "votes") return v(b) - v(a) || t(a) - t(b);
            if (sortBy === "payout") return pay(b) - pay(a) || t(a) - t(b);
            return t(a) - t(b);
        });
        return out;
    }
    function total(k) { return kidsOf(k).reduce(function (s, x) { return s + 1 + total(x); }, 0); }

    function renderList() {
        if (!list || !data) return;
        var n = total(rootKey);
        setCount(n);
        list.innerHTML = "";
        if (!n) { list.innerHTML = '<p class="mhc-empty">No replies on Hive yet. Be the first: log in with Keychain and press Comment on Hive.</p>'; return; }
        var frag = document.createDocumentFragment();
        kidsOf(rootKey).forEach(function (k) { frag.appendChild(renderOne(k, 1)); });
        list.appendChild(frag);
    }
    function renderOne(k, depth) {
        var p = node(k), E = H.esc, u = H.user();
        var c = el("div", "mhc-c" + (depth > 5 ? " mhc-flat" : ""));
        c.setAttribute("data-k", k);
        var gray = p.stats && (p.stats.gray || p.stats.hide);
        if (gray) c.className += " mhc-gray";
        if (p._new) c.className += " mhc-new";
        var votes = (p.stats && p.stats.total_votes) || (p.active_votes || []).length;
        var mine = u && (p.active_votes || []).some(function (v) { return v.voter === u.name && (+v.rshares || +v.percent || 0) > 0; });
        if (p._voted != null) mine = p._voted;
        var created = String(p.created || "");
        var rep = p.author_reputation != null ? Math.floor(+p.author_reputation) : null;
        var link = H.peakd(p.author, p.permlink);
        var paid = p.is_paidout ? "" : " pending";
        c.innerHTML = '<img class="mhc-av" src="' + E(H.avatar(p.author)) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' +
            '<div class="mhc-b"><div class="mhc-h"><a href="' + E(H.peakd(p.author)) + '" target="_blank" rel="noopener">@' + E(p.author) + "</a>" +
            (rep != null && isFinite(rep) ? '<span class="mhc-rep" title="Hive reputation">(' + rep + ")</span>" : "") +
            '<a class="mhc-t" href="' + E(link) + '" target="_blank" rel="noopener" title="' + E(created.replace("T", " ") + " UTC") + '">' + E(p._new ? "just now" : H.timeAgo(created)) + "</a></div>" +
            '<div class="mhc-body">' + (gray ? '<p><button type="button" class="mhc-btn mhc-btn--s" data-a="unhide">Hidden because of low ratings: show it</button></p>' : H.render(p.body)) + "</div>" +
            '<div class="mhc-f"><button type="button" class="mhc-btn mhc-btn--s mhc-vote" data-a="vote" aria-pressed="' + (mine ? "true" : "false") + '" title="' + (mine ? "Remove your vote" : "Upvote with Keychain") + '">▲ ' + votes + "</button>" +
            '<span class="mhc-pay" title="Payout' + E(paid) + '">' + E(H.money(p.payout)) + "</span>" +
            '<button type="button" class="mhc-btn mhc-btn--s" data-a="reply">Reply</button>' +
            '<a class="mhc-btn mhc-btn--s" href="' + E(link) + '" target="_blank" rel="noopener">PeakD ↗</a></div>' +
            '<div class="mhc-rbox"></div><div class="mhc-kids"></div></div>';
        var kids = c.querySelector(".mhc-kids");
        var ks = kidsOf(k);
        if (!ks.length) kids.parentNode.removeChild(kids);
        else ks.forEach(function (x) { kids.appendChild(renderOne(x, depth + 1)); });
        return c;
    }

    function onListClick(e) {
        var b = e.target.closest("button[data-a]");
        if (!b) return;
        var c = b.closest(".mhc-c"), k = c.getAttribute("data-k"), p = node(k);
        var a = b.getAttribute("data-a");
        if (a === "unhide") { b.parentNode.parentNode.innerHTML = H.render(p.body); return; }
        if (a === "reply") {
            if (!H.user()) { say("Log in with Hive Keychain first (above).", "err"); var i = pane.querySelector("#mhc-user"); if (i) i.focus(); return; }
            openCompose(c.querySelector(".mhc-rbox"), p.author, p.permlink, b);
            return;
        }
        if (a === "vote") {
            if (!H.user()) { say("Log in with Hive Keychain to vote.", "err"); var j = pane.querySelector("#mhc-user"); if (j) j.focus(); return; }
            var undo = b.getAttribute("aria-pressed") === "true";
            b.disabled = true;
            say(undo ? "Removing your vote (confirm in Keychain)…" : "Voting " + vw + "% (confirm in Keychain)…");
            H.vote(p.author, p.permlink, undo ? 0 : vw * 100).then(function () {
                p._voted = !undo;
                var n = parseInt(b.textContent.replace(/\D/g, ""), 10) || 0;
                b.textContent = "▲ " + Math.max(0, n + (undo ? -1 : 1));
                b.setAttribute("aria-pressed", undo ? "false" : "true");
                b.disabled = false;
                say(undo ? "Vote removed." : "Voted. Thank you!", "ok");
            }).catch(function (err) { b.disabled = false; say(err.message || "Vote failed.", "err"); });
        }
    }

    function openCompose(where, pa, pp, trigger) {
        if (where.querySelector(".mhc-compose")) { where.querySelector("textarea").focus(); return; }
        var E = H.esc, u = H.user();
        var f = el("div", "mhc-compose");
        var draftKey = "mes-hive-draft:" + pa + "/" + pp;
        f.innerHTML = '<label class="mhc-note" for="mhc-ta-' + E(pp) + '">' + (pp === src.permlink && pa === src.author ? "Your comment on the Hive post" : "Your reply to @" + E(pa)) + " (Markdown works)</label>" +
            '<textarea id="mhc-ta-' + E(pp) + '" maxlength="20000"></textarea><div class="mhc-prev" hidden></div>' +
            '<div class="mhc-row"><button type="button" class="mhc-btn mhc-btn--p" data-c="post">Post with Keychain</button>' +
            '<button type="button" class="mhc-btn" data-c="prev">Preview</button><button type="button" class="mhc-btn mhc-btn--s" data-c="cancel">Cancel</button></div>' +
            '<p class="mhc-note">Posted publicly on the Hive blockchain as @' + E(u ? u.name : "") + ". It can be edited later but never fully deleted.</p>";
        where.appendChild(f);
        if (trigger && trigger.parentNode === where) trigger.hidden = true;
        var ta = f.querySelector("textarea"), prev = f.querySelector(".mhc-prev");
        ta.value = ls(draftKey) || "";
        ta.addEventListener("input", function () { ls(draftKey, ta.value || null); if (!prev.hidden) prev.innerHTML = H.render(ta.value); });
        ta.focus();
        f.addEventListener("click", function (e) {
            var b = e.target.closest("button[data-c]"); if (!b) return;
            var c = b.getAttribute("data-c");
            if (c === "cancel") { f.parentNode.removeChild(f); if (trigger) trigger.hidden = false; return; }
            if (c === "prev") { prev.hidden = !prev.hidden; b.textContent = prev.hidden ? "Preview" : "Hide preview"; prev.innerHTML = H.render(ta.value) || '<span class="mhc-note">Nothing to preview yet.</span>'; return; }
            if (c === "post") {
                b.disabled = true;
                say("Confirm the comment in Hive Keychain…");
                H.post({ parentAuthor: pa, parentPermlink: pp, body: ta.value, tags: ["mesfm"] }).then(function (r) {
                    ls(draftKey, null);
                    var key = r.author + "/" + r.permlink;
                    extra[key] = { author: r.author, permlink: r.permlink, parent_author: pa, parent_permlink: pp, body: r.body,
                        created: new Date().toISOString().slice(0, 19), payout: 0, is_paidout: false, active_votes: [], stats: { total_votes: 0 }, replies: [], _new: true };
                    f.parentNode.removeChild(f);
                    if (trigger) trigger.hidden = false;
                    renderList();
                    say("Posted on Hive. It can take a few seconds to show up on other Hive sites.", "ok");
                    setTimeout(fetchData, 5000);
                }).catch(function (err) { b.disabled = false; say(err.message || "Posting failed.", "err"); });
            }
        });
    }
})();
