/* MES Favourites (mes.fm/fav). Groups of page tiles you can drag, copy, rename and fold; everything is stored in this browser
   (localStorage "mes-fav:v1") and carried to another device by a link that contains the list (?s=1<base64url JSON>).
   The page index and search engine come from /main_js/site-search.js (window.MESSearch, pre_js). */
(function () {
    "use strict";
    var S = window.MESSearch, KEY = "mes-fav:v1";
    var root = document.getElementById("fv");
    if (!root || !S) return;
    function $(id) { return document.getElementById(id); }
    var qEl = $("fv-q"), toEl = $("fv-to"), statusEl = $("fv-status"), resEl = $("fv-res"), moreBtn = $("fv-more"),
        groupsEl = $("fv-groups"), noticeEl = $("fv-notice"), linkEl = $("fv-link"), linkNote = $("fv-linknote"), foldBtn = $("fv-fold"), starterBtn = $("fv-starter");
    var esc = S.esc, byPath = {}, indexReady = false;
    var STARTERS = ["/percentagecalculator", "/gradecalculator", "/gpacalculator", "/timer", "/speedreader", "/moon", "/emoji", "/calculator", "/clock", "/pdf"];
    var PER = 8, shown = PER, state = load(), query = "", lastRes = null;

    /* ---------- state ---------- */
    function uid() { return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function fresh() { return { v: 1, groups: [{ id: uid(), name: "Favourites", open: true, items: [] }], to: "" }; }
    function clean(s) {
        if (!s || !Array.isArray(s.groups) || !s.groups.length) return fresh();
        s.groups = s.groups.filter(function (g) { return g && typeof g === "object"; }).map(function (g) {
            var seen = {};
            return { id: String(g.id || uid()), name: String(g.name || "Group").slice(0, 60), open: g.open !== false,
                items: (Array.isArray(g.items) ? g.items : []).filter(function (p) { p = String(p); if (!/^\/(?!\/)[^\s\\]*$/.test(p) || seen[p]) return false; seen[p] = 1; return true; }).map(String) };
        });
        if (!s.groups.length) return fresh();
        return s;
    }
    function load() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return fresh(); } }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ } updateLink(); scheduleSync(); }
    function groupBy(id) { for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === id) return state.groups[i]; return null; }
    function total() { return state.groups.reduce(function (n, g) { return n + g.items.length; }, 0); }
    function inGroups(path) { return state.groups.filter(function (g) { return g.items.indexOf(path) !== -1; }); }

    /* ---------- sharing ---------- */
    function b64e(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
    function b64d(str) { str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "="; return decodeURIComponent(escape(atob(str))); }
    function pack(st) { return "1" + b64e(JSON.stringify(st.groups.map(function (g) { return [g.name, g.items]; }))); }
    function unpack(s) {
        if (!s || s.charAt(0) !== "1") return null;
        try {
            var arr = JSON.parse(b64d(s.slice(1)));
            return clean({ groups: arr.map(function (a) { return { name: a[0], items: a[1], open: true }; }) });
        } catch (e) { return null; }
    }
    function linkUrl() { return location.origin + "/fav?s=" + pack(state); }
    function updateLink() {
        var u = linkUrl(); linkEl.value = u;
        linkNote.textContent = u.length > 6000 ? "This link is long (" + u.length + " characters). It should still work in a browser, but some apps cut long links: use the backup file as well." :
            total() ? total() + " page" + (total() === 1 ? "" : "s") + " in " + state.groups.length + " group" + (state.groups.length === 1 ? "" : "s") + "." : "Add a few pages first.";
    }
    function copyText(t, msg) {
        function done() { toast(msg || "Copied"); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
        function fallback() { linkEl.focus(); linkEl.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Press Ctrl/Cmd+C to copy"); } }
    }

    /* ---------- toast + menu ---------- */
    var toastEl = null, toastT;
    function toast(msg, undo) {
        if (toastEl) toastEl.remove(); clearTimeout(toastT);
        toastEl = document.createElement("div"); toastEl.className = "fv-toast"; toastEl.setAttribute("role", "status");
        toastEl.innerHTML = "<span>" + esc(msg) + "</span>" + (undo ? "<button type='button'>Undo</button>" : "");
        if (undo) toastEl.querySelector("button").onclick = function () { undo(); if (toastEl) toastEl.remove(); toastEl = null; };
        document.body.appendChild(toastEl);
        toastT = setTimeout(function () { if (toastEl) toastEl.remove(); toastEl = null; }, undo ? 7000 : 2200);
    }
    var menuEl = null;
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
    function openMenu(anchor, head, entries) {
        closeMenu();
        menuEl = document.createElement("div"); menuEl.className = "fv-menu"; menuEl.setAttribute("role", "menu");
        menuEl.innerHTML = '<div class="fv-mh">' + esc(head) + "</div>" + entries.map(function (e, i) {
            return '<button type="button" role="menuitem" data-i="' + i + '"' + (e.off ? " disabled" : "") + ">" + esc(e.label) + "</button>";
        }).join("");
        document.body.appendChild(menuEl);
        var r = anchor.getBoundingClientRect(), x = r.left + window.scrollX, y = r.bottom + window.scrollY + 4;
        menuEl.style.left = Math.max(6, Math.min(x, window.scrollX + document.documentElement.clientWidth - menuEl.offsetWidth - 6)) + "px"; menuEl.style.top = y + "px";
        menuEl.onclick = function (ev) { var b = ev.target.closest("button[data-i]"); if (!b || b.disabled) return; var f = entries[Number(b.getAttribute("data-i"))].run; closeMenu(); f(); };
        var first = menuEl.querySelector("button:not([disabled])"); if (first) first.focus();
        menuEl.onkeydown = function (ev) {
            if (ev.key === "Escape") { closeMenu(); anchor.focus(); }
            else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
                var bs = [].slice.call(menuEl.querySelectorAll("button:not([disabled])")), i = bs.indexOf(document.activeElement);
                bs[(i + (ev.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length].focus(); ev.preventDefault();
            }
        };
    }
    document.addEventListener("mousedown", function (e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });

    /* ---------- model actions ---------- */
    function addTo(path, gid) {
        var g = groupBy(gid) || state.groups[0];
        if (g.items.indexOf(path) !== -1) { toast("Already in " + g.name); return false; }
        g.items.push(path); g.open = true; state.to = g.id; save(); render(); return true;
    }
    function removeFrom(path, gid) {
        var g = groupBy(gid), i = g ? g.items.indexOf(path) : -1; if (i < 0) return;
        g.items.splice(i, 1); save(); render();
        toast("Removed " + titleOf(path), function () { var g2 = groupBy(gid); if (g2 && g2.items.indexOf(path) === -1) { g2.items.splice(Math.min(i, g2.items.length), 0, path); save(); render(); } });
    }
    function newGroup(name) {
        var g = { id: uid(), name: name || "New group", open: true, items: [] };
        state.groups.push(g); state.to = g.id; save(); render(); return g;
    }
    function deleteGroup(gid) {
        var i = state.groups.findIndex(function (g) { return g.id === gid; }); if (i < 0) return;
        var g = state.groups[i];
        if (state.groups.length === 1) { toast("Keep at least one group"); return; }
        state.groups.splice(i, 1); save(); render();
        toast("Deleted group " + g.name, function () { state.groups.splice(Math.min(i, state.groups.length), 0, g); save(); render(); });
    }
    function titleOf(p) { var it = byPath[p]; return it ? it.title : p; }

    /* ---------- rendering ---------- */
    function thumb(it, p) {
        var t = it && it.thumb;
        return '<span class="fv-th" aria-hidden="true">' + (t ? '<img src="' + esc(t) + '" alt="" loading="lazy" width="96" height="96" onerror="this.remove()">' : "") + (t ? "" : esc((it ? it.title : p).charAt(0).toUpperCase())) + "</span>";
    }
    function tileHtml(p, g) {
        var it = byPath[p], title = it ? it.title : p.replace(/^\//, "") || "Home";
        return '<div class="fv-tile" data-p="' + esc(p) + '" data-g="' + esc(g.id) + '">' +
            '<button type="button" class="fv-grip" aria-label="Move ' + esc(title) + ': drag, or use the arrow keys" title="Drag to move (Alt: copy). Arrow keys also work.">&#8942;&#8942;</button>' +
            '<span class="fv-tools"><button type="button" class="fv-ib fv-cp" aria-label="Copy ' + esc(title) + ' to another group" title="Also put it in another group">&#10064;</button><button type="button" class="fv-ib fv-rm" aria-label="Remove ' + esc(title) + ' from this group" title="Remove">&times;</button></span>' +
            '<a href="' + esc(p) + '" draggable="false">' + thumb(it, p) + '<span class="fv-tt">' + esc(title) + "</span></a></div>";
    }
    function match(p, terms) {
        var it = byPath[p], hay = S.norm((it ? it.title + " " + it.where + " " + it.desc : "") + " " + p);
        return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    }
    function render() {
        var terms = S.norm(query).split(" ").filter(Boolean), filtering = terms.length > 0, shownTiles = 0;
        groupsEl.innerHTML = state.groups.map(function (g) {
            var items = filtering ? g.items.filter(function (p) { return match(p, terms); }) : g.items;
            if (filtering && !items.length) return "";
            shownTiles += items.length;
            var closed = !g.open && !filtering;
            return '<section class="fv-group' + (closed ? " is-closed" : "") + '" data-g="' + esc(g.id) + '" aria-label="' + esc(g.name) + '">' +
                '<div class="fv-ghead"><button type="button" class="fv-grip fv-ggrip" aria-label="Move group ' + esc(g.name) + ': drag, or use the up and down arrow keys" title="Drag to reorder groups">&#8942;&#8942;</button>' +
                '<button type="button" class="fv-gt" aria-expanded="' + (!closed) + '"><span class="fv-chev" aria-hidden="true">&#9662;</span><span class="fv-gname">' + esc(g.name) + '</span><span class="fv-gn">' + g.items.length + "</span></button>" +
                '<button type="button" class="fv-ib fv-ren" aria-label="Rename group ' + esc(g.name) + '" title="Rename">&#9998;</button><button type="button" class="fv-ib fv-del" aria-label="Delete group ' + esc(g.name) + '" title="Delete group">&#128465;</button></div>' +
                '<div class="fv-gbody">' + (items.length ? items.map(function (p) { return tileHtml(p, g); }).join("") : '<p class="fv-empty">Empty. Search above and press Add, or drag tiles here.</p>') + "</div></section>";
        }).join("") || '<p class="tu-card fv-empty-all">Nothing in your favourites matches &ldquo;' + esc(query) + "&rdquo;.</p>";
        toEl.innerHTML = state.groups.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === state.to ? " selected" : "") + ">" + esc(g.name) + "</option>"; }).join("");
        if (!groupBy(state.to)) state.to = state.groups[0].id;
        var anyOpen = state.groups.some(function (g) { return g.open; });
        foldBtn.textContent = anyOpen ? "Collapse all" : "Expand all";
        starterBtn.hidden = total() > 0 || !indexReady;
        if (lastRes) paintResults();
        if (filtering) statusNote(shownTiles);
    }
    function statusNote(n) { /* shown inside the results status line */ }

    /* ---------- search + results ---------- */
    function doSearch() {
        query = qEl.value;
        shown = PER;
        var q = query.trim();
        if (!q) { lastRes = null; resEl.innerHTML = ""; moreBtn.hidden = true; statusEl.textContent = indexReady ? "" : "Loading the page index…"; render(); return; }
        if (!indexReady) { statusEl.textContent = "Loading the page index…"; return; }
        lastRes = S.search(q, ""); paintResults(); render();
    }
    function paintResults() {
        var r = lastRes, items = r.items.filter(function (x) { return x.path !== "/fav"; }), show = items.slice(0, shown);
        statusEl.textContent = items.length ? (r.partial ? "No exact match; closest pages: " : "") + items.length + " page" + (items.length === 1 ? "" : "s") + " on mes.fm" + (state.groups.length ? ". Press Add to put one in the chosen group." : ".") : "No pages found. Try fewer or different words.";
        resEl.innerHTML = show.map(function (it) {
            var gs = inGroups(it.path), t = it.thumb ? '<img src="' + esc(it.thumb) + '" alt="" loading="lazy" width="96" height="96" onerror="this.remove()">' : esc(it.title.charAt(0).toUpperCase());
            return '<li class="fv-r"><span class="fv-th" aria-hidden="true">' + t + '</span><div class="fv-rb"><a class="fv-rt" href="' + esc(it.path) + '">' + S.highlight(it.title, r.terms) + '</a><span class="fv-rw">' + esc(it.catLabel + (it.where ? " · " + it.where : "")) + (gs.length ? " · in " + esc(gs.map(function (g) { return g.name; }).join(", ")) : "") + "</span></div>" +
                '<button type="button" class="tu-btn tu-btn--primary fv-add' + (gs.length ? " is-in" : "") + '" data-p="' + esc(it.path) + '" aria-label="Add ' + esc(it.title) + ' to favourites">' + (gs.length ? "+ Add again" : "+ Add") + "</button></li>";
        }).join("");
        moreBtn.hidden = items.length <= shown;
    }
    resEl.addEventListener("click", function (e) {
        var b = e.target.closest(".fv-add"); if (!b) return;
        var p = b.getAttribute("data-p"), g = groupBy(toEl.value) || state.groups[0];
        if (addTo(p, g.id)) toast("Added " + titleOf(p) + " to " + g.name);
    });
    moreBtn.onclick = function () { shown += PER * 2; paintResults(); };
    var st;
    qEl.addEventListener("input", function () { clearTimeout(st); st = setTimeout(doSearch, 120); });
    qEl.addEventListener("keydown", function (e) { if (e.key === "Escape") { qEl.value = ""; doSearch(); } });
    toEl.addEventListener("change", function () { state.to = toEl.value; save(); });

    /* ---------- group / tile controls ---------- */
    groupsEl.addEventListener("click", function (e) {
        var tile = e.target.closest(".fv-tile"), grp = e.target.closest(".fv-group");
        if (!grp) return;
        var gid = grp.getAttribute("data-g"), g = groupBy(gid);
        if (e.target.closest(".fv-rm") && tile) { removeFrom(tile.getAttribute("data-p"), gid); return; }
        if (e.target.closest(".fv-cp") && tile) {
            var p = tile.getAttribute("data-p"), btn = e.target.closest(".fv-cp");
            var ents = state.groups.filter(function (x) { return x.id !== gid; }).map(function (x) { return { label: (x.items.indexOf(p) !== -1 ? "✓ " : "") + x.name, off: x.items.indexOf(p) !== -1, run: function () { addTo(p, x.id); toast("Copied to " + x.name); } }; });
            ents.push({ label: "+ New group…", run: function () { var n = prompt("Name of the new group", ""); if (n === null) return; var ng = newGroup(n.trim() || "New group"); addTo(p, ng.id); } });
            openMenu(btn, "Also put it in…", ents); return;
        }
        if (e.target.closest(".fv-gt")) { g.open = !g.open; save(); render(); return; }
        if (e.target.closest(".fv-ren")) { rename(grp, g); return; }
        if (e.target.closest(".fv-del")) { deleteGroup(gid); return; }
    });
    function rename(grp, g) {
        var head = grp.querySelector(".fv-ghead"), gt = head.querySelector(".fv-gt");
        var inp = document.createElement("input"); inp.type = "text"; inp.className = "tu-input fv-gedit"; inp.value = g.name; inp.maxLength = 60; inp.setAttribute("aria-label", "Group name");
        gt.replaceWith(inp); inp.focus(); inp.select();
        var done = false;
        function fin(ok) { if (done) return; done = true; var v = inp.value.trim(); if (ok && v) { g.name = v.slice(0, 60); save(); } render(); }
        inp.onkeydown = function (e) { if (e.key === "Enter") fin(true); else if (e.key === "Escape") fin(false); };
        inp.onblur = function () { fin(true); };
    }
    $("fv-newg").onclick = function () { var g = newGroup("New group"); var el = groupsEl.querySelector('[data-g="' + g.id + '"]'); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); rename(el, g); } };
    foldBtn.onclick = function () { var anyOpen = state.groups.some(function (g) { return g.open; }); state.groups.forEach(function (g) { g.open = !anyOpen; }); save(); render(); };
    starterBtn.onclick = function () {
        var g = state.groups[0], n = 0; STARTERS.forEach(function (p) { if (byPath[p] && g.items.indexOf(p) === -1) { g.items.push(p); n++; } });
        save(); render(); toast("Added " + n + " popular pages");
    };
    $("fv-copylink").onclick = $("fv-copy2").onclick = function () { if (!total()) { toast("Add a few pages first"); return; } copyText(linkUrl(), "Link copied: open it on another device to get your favourites"); };
    linkEl.addEventListener("focus", function () { linkEl.select(); });
    $("fv-export").onclick = function () {
        var blob = new Blob([JSON.stringify({ v: 1, groups: state.groups.map(function (g) { return { name: g.name, items: g.items }; }) }, null, 1)], { type: "application/json" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mes-favourites.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    };
    $("fv-import").onclick = function () { $("fv-file").click(); };
    $("fv-file").onchange = function () {
        var f = this.files[0]; this.value = ""; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
            try { var d = JSON.parse(rd.result), c = clean({ groups: d.groups.map(function (g) { return { name: g.name, items: g.items, open: true }; }) }); offerImport(c, "the backup file"); }
            catch (e) { toast("That file is not a MES favourites backup"); }
        };
        rd.readAsText(f);
    };


    /* ---------- short link (mes.fm/f/<id>, api/fav.js): the list is stored server-side under a random id; the edit key stays in this browser ---------- */
    var SKEY = "mes-fav:short", sEl = { row: $("fv-shortrow"), link: $("fv-slink"), note: $("fv-snote"), make: $("fv-smake"), stop: $("fv-sstop") }, syncT;
    function shortGet() { try { var s = JSON.parse(localStorage.getItem(SKEY)); return s && s.id && s.key ? s : null; } catch (e) { return null; } }
    function groupsPayload() { return state.groups.map(function (g) { return [g.name, g.items]; }); }
    function api(body) {
        return fetch("/api/fav", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
            return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.error || "error"); return j; });
        });
    }
    function paintShort(msg) {
        var s = shortGet(), has = total() > 0;
        sEl.row.hidden = !s; sEl.stop.hidden = !s; sEl.make.hidden = !!s; sEl.make.disabled = !has;
        if (s) sEl.link.value = location.origin + "/f/" + s.id;
        sEl.note.textContent = msg || (s ? "Kept up to date automatically while you use this browser." : has ? "" : "Add a few pages first.");
    }
    function scheduleSync() {
        if (!shortGet()) return; clearTimeout(syncT);
        syncT = setTimeout(function () {
            var s = shortGet(); if (!s) return;
            if (!total()) { paintShort("Add a page to update your short link."); return; }
            api({ id: s.id, key: s.key, g: groupsPayload() }).then(function () { paintShort("Short link updated just now."); }, function (e) { paintShort("Could not update the short link (" + e.message + "). It will retry on your next change."); });
        }, 1500);
    }
    sEl.make.onclick = function () {
        if (!total()) { toast("Add a few pages first"); return; }
        sEl.make.disabled = true; sEl.note.textContent = "Making your link…";
        api({ g: groupsPayload() }).then(function (j) {
            try { localStorage.setItem(SKEY, JSON.stringify({ id: j.id, key: j.key })); } catch (e) { /* ignore */ }
            paintShort("Short link ready. Copy it and open it on another device."); copyText(location.origin + "/f/" + j.id, "Short link copied");
        }, function (e) { sEl.make.disabled = false; sEl.note.textContent = e.message === "not set up" ? "Short links are not switched on yet. Use the long link below." : "Could not make a short link (" + e.message + "). Try again, or use the long link below."; });
    };
    sEl.link.addEventListener("focus", function () { sEl.link.select(); });
    $("fv-scopy").onclick = function () { copyText(sEl.link.value, "Short link copied"); };
    sEl.stop.onclick = function () {
        var s = shortGet(); if (!s || !confirm("Delete your short link? Anyone who has it will no longer be able to open your list. Your favourites in this browser stay.")) return;
        api({ id: s.id, key: s.key, del: true }).then(function () { try { localStorage.removeItem(SKEY); } catch (e) { /* ignore */ } paintShort("Your short link was deleted."); }, function (e) { paintShort("Could not delete it (" + e.message + ")."); });
    };

    /* ---------- importing (link or file) ---------- */
    function offerImport(c, from) {
        var n = c.groups.reduce(function (s, g) { return s + g.items.length; }, 0);
        if (!total() && state.groups.length === 1 && !state.groups[0].items.length) { state = c; save(); render(); toast("Loaded " + n + " pages from " + from); return; }
        noticeEl.hidden = false;
        noticeEl.innerHTML = "<b>" + n + " page" + (n === 1 ? "" : "s") + " in " + c.groups.length + " group" + (c.groups.length === 1 ? "" : "s") + "</b> found in " + esc(from) + ". You already have " + total() + ". What now?<br>" +
            '<button type="button" class="tu-btn tu-btn--primary" data-a="replace">Replace mine</button><button type="button" class="tu-btn tu-btn--ghost" data-a="merge">Merge with mine</button><button type="button" class="tu-btn tu-btn--ghost" data-a="cancel">Cancel</button>';
        noticeEl.onclick = function (e) {
            var b = e.target.closest("button[data-a]"); if (!b) return; var a = b.getAttribute("data-a");
            if (a === "replace") { var old = state; state = c; save(); render(); toast("Replaced your favourites", function () { state = old; save(); render(); }); }
            else if (a === "merge") {
                var old2 = JSON.parse(JSON.stringify(state));
                c.groups.forEach(function (cg) {
                    var g = state.groups.filter(function (x) { return x.name.toLowerCase() === cg.name.toLowerCase(); })[0];
                    if (!g) { g = { id: uid(), name: cg.name, open: true, items: [] }; state.groups.push(g); }
                    cg.items.forEach(function (p) { if (g.items.indexOf(p) === -1) g.items.push(p); });
                });
                save(); render(); toast("Merged", function () { state = clean(old2); save(); render(); });
            }
            noticeEl.hidden = true; noticeEl.innerHTML = "";
            if (location.search) history.replaceState(null, "", location.pathname);
        };
    }

    /* ---------- drag and drop (pointer events: mouse, touch and pen; FLIP animation for the tiles that make room) ---------- */
    var drag = null;
    function flip(container, change) {
        var els = [].slice.call(container.children).filter(function (c) { return c !== (drag && drag.el); }), before = new Map();
        els.forEach(function (c) { before.set(c, c.getBoundingClientRect()); });
        change();
        els.forEach(function (c) {
            var a = before.get(c), b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
            if (!dx && !dy) return;
            c.style.transition = "none"; c.style.transform = "translate(" + dx + "px," + dy + "px)";
            requestAnimationFrame(function () { c.style.transition = "transform .18s ease"; c.style.transform = ""; setTimeout(function () { c.style.transition = ""; }, 220); });
        });
    }
    groupsEl.addEventListener("pointerdown", function (e) {
        if (e.button > 0 || query.trim()) return;
        var grip = e.target.closest(".fv-grip"), tile = e.target.closest(".fv-tile"), isG = grip && grip.classList.contains("fv-ggrip");
        if (!grip && !(tile && e.pointerType === "mouse" && !e.target.closest("button"))) return;
        var el = isG ? grip.closest(".fv-group") : tile;
        if (!el) return;
        drag = { kind: isG ? "group" : "tile", el: el, id: e.pointerId, sx: e.clientX, sy: e.clientY, on: false, from: isG ? null : el.getAttribute("data-g"), path: isG ? null : el.getAttribute("data-p"), ghost: null, raf: 0, x: e.clientX, y: e.clientY };
        window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onCancel); window.addEventListener("keydown", onDragKey, true);
    });
    function begin(e) {
        var r = drag.el.getBoundingClientRect(), gh = drag.el.cloneNode(true);
        gh.classList.add("fv-ghost"); gh.style.width = r.width + "px"; gh.style.height = r.height + "px"; gh.style.left = r.left + "px"; gh.style.top = r.top + "px";
        drag.ox = drag.sx - r.left; drag.oy = drag.sy - r.top; drag.ghost = gh; (root.closest("#fv") || root).appendChild(gh);
        drag.el.classList.add(drag.kind === "group" ? "is-dragging" : "is-drag"); drag.on = true; document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing";
        suppressClick();
        (function loop() { if (!drag || !drag.on) return; var y = drag.y, vh = window.innerHeight; if (y < 70) window.scrollBy(0, -Math.ceil((70 - y) / 4)); else if (y > vh - 70) window.scrollBy(0, Math.ceil((y - (vh - 70)) / 4)); drag.raf = requestAnimationFrame(loop); })();
    }
    function suppressClick() { function stop(ev) { ev.stopPropagation(); ev.preventDefault(); } window.addEventListener("click", stop, true); setTimeout(function () { window.removeEventListener("click", stop, true); }, 400); }
    function onMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        drag.x = e.clientX; drag.y = e.clientY;
        if (!drag.on) { if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 6) return; begin(e); }
        e.preventDefault();
        drag.ghost.style.left = (e.clientX - drag.ox) + "px"; drag.ghost.style.top = (e.clientY - drag.oy) + "px"; drag.ghost.classList.toggle("is-copy", drag.kind === "tile" && e.altKey);
        var under = document.elementFromPoint(e.clientX, e.clientY); if (!under) return;
        [].forEach.call(groupsEl.querySelectorAll(".is-over"), function (n) { n.classList.remove("is-over"); });
        if (drag.kind === "group") {
            var og = under.closest(".fv-group"); if (!og || og === drag.el) return;
            var rr = og.getBoundingClientRect(), after = e.clientY > rr.top + rr.height / 2;
            flip(groupsEl, function () { groupsEl.insertBefore(drag.el, after ? og.nextSibling : og); });
        } else {
            var ot = under.closest(".fv-tile"), body = ot ? ot.parentNode : (under.closest(".fv-gbody") || (under.closest(".fv-group") && under.closest(".fv-group").querySelector(".fv-gbody")));
            if (!body) return;
            var grp = body.closest(".fv-group"); if (grp.classList.contains("is-closed")) { body.classList.add("is-over"); grp.querySelector(".fv-ghead").classList.add("is-over"); if (!drag.openT) drag.openT = setTimeout(function () { var g = groupBy(grp.getAttribute("data-g")); if (g && drag) { g.open = true; grp.classList.remove("is-closed"); } }, 500); return; }
            body.classList.add("is-over");
            var empty = body.querySelector(".fv-empty"); if (empty) empty.remove();
            if (ot && ot !== drag.el) {
                var tr = ot.getBoundingClientRect(), sameRow = e.clientY > tr.top && e.clientY < tr.bottom, aft = sameRow ? e.clientX > tr.left + tr.width / 2 : e.clientY > tr.top + tr.height / 2;
                flip(body, function () { body.insertBefore(drag.el, aft ? ot.nextSibling : ot); });
                if (body !== drag.last && drag.last) flip(drag.last, function () {});
            } else if (!ot && drag.el.parentNode !== body) flip(body, function () { body.appendChild(drag.el); });
            drag.last = body;
        }
    }
    function finish(commit, alt) {
        var d = drag; drag = null; clearTimeout(d.openT); cancelAnimationFrame(d.raf);
        window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onCancel); window.removeEventListener("keydown", onDragKey, true);
        document.body.style.userSelect = ""; document.body.style.cursor = "";
        if (!d.on) return;
        if (d.ghost) d.ghost.remove();
        if (commit) {
            if (d.kind === "group") {
                var order = [].map.call(groupsEl.querySelectorAll(".fv-group"), function (n) { return n.getAttribute("data-g"); });
                state.groups.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
            } else {
                var body = d.el.parentNode, dest = groupBy(body.closest(".fv-group").getAttribute("data-g")), src = groupBy(d.from);
                var idx = [].indexOf.call(body.querySelectorAll(".fv-tile"), d.el);
                if (dest && src) {
                    if (dest === src) { src.items.splice(src.items.indexOf(d.path), 1); src.items.splice(idx, 0, d.path); }
                    else if (dest.items.indexOf(d.path) !== -1) { if (!alt) src.items.splice(src.items.indexOf(d.path), 1); toast(alt ? "Already in " + dest.name : "Merged into the copy already in " + dest.name); }
                    else { if (!alt) src.items.splice(src.items.indexOf(d.path), 1); dest.items.splice(idx, 0, d.path); dest.open = true; }
                }
            }
            save();
        }
        render();
    }
    function onUp(e) { if (drag && e.pointerId === drag.id) finish(true, e.altKey); }
    function onCancel() { if (drag) finish(false); }
    function onDragKey(e) { if (e.key === "Escape" && drag) { e.stopPropagation(); finish(false); } }

    /* keyboard: arrow keys on a focused grip move the tile / group */
    groupsEl.addEventListener("keydown", function (e) {
        var grip = e.target.closest && e.target.closest(".fv-grip"); if (!grip || query.trim()) return;
        var k = e.key; if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].indexOf(k) < 0) return;
        e.preventDefault();
        if (grip.classList.contains("fv-ggrip")) {
            var gid = grip.closest(".fv-group").getAttribute("data-g"), i = state.groups.findIndex(function (g) { return g.id === gid; }), j = k === "ArrowUp" || k === "Home" ? Math.max(0, i - 1) : Math.min(state.groups.length - 1, i + 1);
            if (k === "Home") j = 0; if (k === "End") j = state.groups.length - 1;
            if (j === i) return; var g = state.groups.splice(i, 1)[0]; state.groups.splice(j, 0, g); save(); render();
            var n = groupsEl.querySelector('[data-g="' + gid + '"] .fv-ggrip'); if (n) n.focus(); return;
        }
        var tile = grip.closest(".fv-tile"), p = tile.getAttribute("data-p"), sg = tile.getAttribute("data-g"), G = groupBy(sg), ti = G.items.indexOf(p), gi = state.groups.indexOf(G);
        if (k === "ArrowLeft" && ti > 0) { G.items.splice(ti, 1); G.items.splice(ti - 1, 0, p); }
        else if (k === "ArrowRight" && ti < G.items.length - 1) { G.items.splice(ti, 1); G.items.splice(ti + 1, 0, p); }
        else if (k === "ArrowDown" || k === "ArrowUp") {
            var D = state.groups[gi + (k === "ArrowDown" ? 1 : -1)]; if (!D) return;
            G.items.splice(ti, 1); if (D.items.indexOf(p) === -1) D.items.splice(Math.min(ti, D.items.length), 0, p); D.open = true;
            sg = D.id;
        } else return;
        save(); render();
        var f = groupsEl.querySelector('[data-g="' + sg + '"] .fv-tile[data-p="' + (window.CSS && CSS.escape ? CSS.escape(p) : p) + '"] .fv-grip'); if (f) f.focus();
    });

    window.addEventListener("storage", function (e) { if (e.key === KEY && !drag) { state = load(); render(); updateLink(); } });

    /* ---------- start ---------- */
    render(); updateLink(); paintShort();
    var sp = new URLSearchParams(location.search).get("s");
    var imported = sp ? unpack(sp) : null;
    S.load().then(function () {
        S.search("", "").items.forEach(function (it) { byPath[it.path] = it; });
        indexReady = true; statusEl.textContent = ""; render();
        if (qEl.value) doSearch();
    }, function () { statusEl.textContent = "The page index could not be loaded, so search is unavailable. Your favourites still work."; });
    if (sp && !imported) { noticeEl.hidden = false; noticeEl.textContent = "That favourites link could not be read. It may have been cut when it was copied."; }
    else if (imported) offerImport(imported, "this link");
    var fp = new URLSearchParams(location.search).get("f") || ((location.pathname.match(/^\/f\/([A-Za-z0-9_-]+)\/?$/) || [])[1]);
    if (fp) {
        fetch("/api/fav?id=" + encodeURIComponent(fp)).then(function (r) { if (!r.ok) throw new Error("gone"); return r.json(); }).then(function (j) {
            offerImport(clean({ groups: j.g.map(function (r) { return { name: r[0], items: r[1], open: true }; }) }), "this short link");
        }, function () { noticeEl.hidden = false; noticeEl.textContent = "That short link was not found. It may have been deleted, or mistyped."; });
    }
    var qp = new URLSearchParams(location.search).get("q"); if (qp) { qEl.value = qp; }
})();
