/* MES Edits (mes.fm/edits): private list of fixes and new-app ideas. Data = /api/edits (Upstash, behind the middleware.js password);
   rules in lib.js (MESEdits, shared with the server). Changes are applied here first with the same rules (so the page reacts at once),
   then sent; the server's answer replaces the local guess. On 127.0.0.1 / localhost or ?mock=1 a stand-in in localStorage
   ("mes-edits:mock") answers instead. The last list loaded is kept in localStorage ("mes-edits:cache") for offline reading. */
(function () {
    "use strict";
    var E = window.MESEdits, root = document.getElementById("ed");
    if (!E || !root) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = E.esc;
    var PREF = "mes-edits:v1", CACHE = "mes-edits:cache", MOCK = "mes-edits:mock", LOCKSET = "mes-edits:lockset", HVENC = "mes-edits:hiveenc";
    var LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) || /[?&]mock=1\b/.test(location.search);

    function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
    function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* full or blocked */ } }
    function lsJson(k, d) { try { var v = JSON.parse(lsGet(k, "null")); return v == null ? d : v; } catch (e) { return d; } }

    var pref = Object.assign({ k: "fix", st: "open", sort: "new", star: false, tool: "" }, lsJson(PREF, {}));
    var cache = lsJson(CACHE, null);
    var items = cache && Array.isArray(cache.items) ? cache.items : [];
    var loadedAt = cache && cache.at || 0, online = null, busy = 0;
    var open = {};          /* id -> "edit" | "reply" while a box is open (refreshes then wait) */
    var pendingRender = false;
    function savePref() { lsSet(PREF, JSON.stringify(pref)); }
    function saveCache() { lsSet(CACHE, JSON.stringify({ items: items, at: loadedAt })); }

    /* ---------- toast ---------- */
    var toastT = 0;
    function toast(msg, undo) {
        var t = $("ed-toast");
        t.innerHTML = esc(msg) + (undo ? ' <button type="button" class="ed-undo">Undo</button>' : "");
        t.className = "tu-toast tu-toast--show" + (undo ? " ed-toast--act" : "");
        if (undo) t.querySelector(".ed-undo").onclick = function () { t.className = "tu-toast"; undo(); };
        clearTimeout(toastT); toastT = setTimeout(function () { t.className = "tu-toast"; }, undo ? 7000 : 2600);
    }

    /* ---------- data ---------- */
    function mockMap() { var m = lsJson(MOCK, {}); return m && typeof m === "object" ? m : {}; }
    function call(method, body) {
        if (LOCAL) {
            return new Promise(function (res) {
                setTimeout(function () {
                    var m = mockMap();
                    if (method === "GET") return res({ items: E.sortNewest(Object.keys(m).map(function (k) { return m[k]; })) });
                    var out = E.apply(m, body);
                    (out.put || []).forEach(function (it) { m[it.id] = it; });
                    (out.del || []).forEach(function (id) { delete m[id]; });
                    lsSet(MOCK, JSON.stringify(m));
                    if (out.status !== 200) { var e = new Error(out.body.error || "error"); e.status = out.status; throw e; }
                    res(out.body);
                }, 60);
            });
        }
        var o = { method: method, credentials: "same-origin", cache: "no-store" };
        if (body) { o.headers = { "Content-Type": "application/json" }; o.body = JSON.stringify(body); }
        return fetch("/api/edits", o).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
                if (!r.ok) { var e = new Error(r.status === 401 ? "Not logged in: reload the page and type the password." : (j && j.error) || ("Server answered " + r.status)); e.status = r.status; throw e; }
                return j;
            });
        });
    }
    function sync(text, cls) { var s = $("ed-sync"); s.textContent = text || ""; s.className = "ed-sync" + (cls ? " is-" + cls : ""); }
    function paintSync() {
        if (busy) return sync("Saving…");
        if (LOCAL) return sync("Test copy in this browser (no server here)", "warn");
        if (online === false) return sync("Offline: the copy from " + (loadedAt ? E.ago(loadedAt) : "earlier"), "warn");
        if (online) return sync("✓ Saved · " + items.length + " items");
        sync("Loading…");
    }
    function load(quiet) {
        if (!quiet) paintSync();
        return call("GET").then(function (j) {
            online = true; items = Array.isArray(j.items) ? j.items : []; loadedAt = Date.now(); saveCache();
            if (Object.keys(open).length) pendingRender = true; else render();
            paintSync();
        }).catch(function (e) {
            online = false; paintSync();
            if (e.status === 401) toast(e.message);
        });
    }
    function byId(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return i; return -1; }
    function mapOf() { var m = {}; items.forEach(function (it) { m[it.id] = it; }); return m; }
    /* Apply a change locally with the shared rules, show it, then send it. */
    function change(body, done) {
        var guess = E.apply(mapOf(), body);
        if (guess.status !== 200) { toast(guess.body.error || "That didn't work."); return Promise.resolve(null); }
        var before = items.slice();
        (guess.put || []).forEach(function (it) { var i = byId(it.id); if (i >= 0) items[i] = it; else items.unshift(it); });
        (guess.del || []).forEach(function (id) { var i = byId(id); if (i >= 0) items.splice(i, 1); });
        render();
        busy++; paintSync();
        return call("POST", body).then(function (res) {
            busy--;
            if (res && res.item) {
                var tempId = guess.put && guess.put[0] && guess.put[0].id, i = byId(body.op === "add" ? tempId : res.item.id);
                if (i >= 0) items[i] = res.item; else items.unshift(res.item);
            }
            online = true; loadedAt = Date.now(); saveCache(); render(); paintSync();
            if (done) done(res);
            if (body.op === "import") return load(true).then(function () { return res; });
            return res;
        }).catch(function (e) {
            busy--; items = before; render(); online = e.status ? true : false; paintSync();
            toast((e.status ? "Not saved: " : "Not saved (no connection): ") + e.message);
            return null;
        });
    }

    /* ---------- rendering ---------- */
    function fullDate(ms) { return new Date(ms).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    function pics(t) {
        var seen = {};
        return E.links(t).map(E.imageOf).filter(function (u) { if (!u || seen[u]) return false; seen[u] = 1; return true; }).slice(0, 6)
            .map(function (u) { return '<a class="ed-pic" href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Screenshot" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.hidden=true"></a>'; }).join("");
    }
    function stSelect(it) {
        return '<select class="ed-st" data-a="st" aria-label="Status">' + E.STATES.map(function (s) { return '<option value="' + s + '"' + (s === it.st ? " selected" : "") + ">" + E.STATE_NAME[s] + "</option>"; }).join("") + "</select>";
    }
    function itemHtml(it) {
        var tl = E.itemTools(it), mode = open[it.id];
        var h = '<li class="ed-it st-' + it.st + (it.star ? " is-star" : "") + '" data-id="' + esc(it.id) + '">';
        h += '<div class="ed-top"><button type="button" class="ed-star" data-a="star" aria-pressed="' + it.star + '" title="' + (it.star ? "Important (click to unmark)" : "Mark important") + '">' + (it.star ? "★" : "☆") + "</button>" + stSelect(it);
        if (pref.k === "queue") h += '<span class="ed-qn" title="Place in the queue">#' + (qPos[it.id] || "?") + "</span>";
        if (pref.k === "all" || pref.k === "queue") h += '<span class="ed-kind k-' + it.k + '">' + (it.k === "app" ? "New app" : "Fix") + "</span>";
        h += tl.map(function (s) { return '<button type="button" class="ed-tool" data-a="tool" data-v="' + esc(s) + '" title="Show only items about mes.fm/' + esc(s) + '">/' + esc(s) + "</button>"; }).join("");
        h += '<span class="ed-sp"></span><span class="ed-when" title="Added ' + esc(fullDate(it.c)) + (it.d ? " · finished " + esc(fullDate(it.d)) : "") + '">' + esc(E.ago(it.c)) + (it.d ? " · " + (it.st === "done" ? "done " : "closed ") + esc(E.ago(it.d)) : "") + (it.src === "telegram" ? " · from Telegram" : "") + "</span></div>";
        if (mode === "edit") {
            h += '<textarea class="tu-input ed-ta ed-edt" data-f="t" rows="3" aria-label="Text">' + esc(it.t) + "</textarea>";
            h += '<label class="ed-sub">Note (what was done, why not, links)</label><textarea class="tu-input ed-ta ed-edn" data-f="note" rows="2" aria-label="Note">' + esc(it.note || "") + "</textarea>";
            h += '<div class="ed-acts"><button type="button" class="tu-btn tu-btn--primary" data-a="save">Save</button><button type="button" class="tu-btn tu-btn--ghost" data-a="cancel">Cancel</button></div>';
        } else {
            h += '<div class="ed-txt">' + E.linkify(it.t) + "</div>";
            var p = pics(it.t); if (p) h += '<div class="ed-pics">' + p + "</div>";
            if (it.note) h += '<div class="ed-noteb"><b>Note:</b> ' + E.linkify(it.note) + "</div>";
        }
        if (it.rs && it.rs.length) {
            h += '<ul class="ed-rs">' + it.rs.map(function (r) {
                return '<li class="by-' + r.by + '"><span class="ed-rby">' + (r.by === "claude" ? "Claude" : "You") + '</span> <span class="ed-rt">' + E.linkify(r.t) + '</span> <small title="' + esc(fullDate(r.at)) + '">' + esc(E.ago(r.at)) + "</small>" + (pics(r.t) ? '<div class="ed-pics">' + pics(r.t) + "</div>" : "") + "</li>";
            }).join("") + "</ul>";
        }
        if (mode === "reply") {
            h += '<textarea class="tu-input ed-ta ed-rpt" data-f="r" rows="2" placeholder="Add to this item (links; paste or drop a screenshot here)" aria-label="Reply"></textarea>';
            h += '<div class="ed-acts"><button type="button" class="tu-btn tu-btn--primary" data-a="send">Add</button><button type="button" class="tu-btn tu-btn--ghost" data-a="cancel">Cancel</button><span class="ed-hint">Ctrl+Enter adds</span></div>';
        } else if (mode !== "edit") {
            var closed = it.st === "done" || it.st === "wont";
            h += '<div class="ed-acts">' + (closed ? '<button type="button" class="tu-btn tu-btn--ghost" data-a="reopen">↺ Reopen</button>'
                : '<button type="button" class="tu-btn tu-btn--ghost ed-ok" data-a="done">✓ Done</button>' + (it.st === "doing" ? "" : '<button type="button" class="tu-btn tu-btn--ghost" data-a="doing">▶ Doing</button>'))
                + (it.qo ? (pref.k === "queue" ? '<button type="button" class="tu-btn tu-btn--ghost" data-a="qup" title="Do this sooner">↑</button><button type="button" class="tu-btn tu-btn--ghost" data-a="qdown" title="Do this later">↓</button><button type="button" class="tu-btn tu-btn--ghost" data-a="qtop" title="Do this first">⤒ First</button>' : "")
                    + '<button type="button" class="tu-btn tu-btn--ghost ed-qon" data-a="qoff" title="Take it off the queue">✓ Queued' + (qPos[it.id] ? " #" + qPos[it.id] : "") + "</button>"
                    : '<button type="button" class="tu-btn tu-btn--ghost" data-a="qon" title="Add to the end of the queue">＋ Queue</button>')
                + '<button type="button" class="tu-btn tu-btn--ghost" data-a="reply">💬 Reply</button><button type="button" class="tu-btn tu-btn--ghost" data-a="edit">✎ Edit</button>'
                + '<button type="button" class="tu-btn tu-btn--ghost" data-a="move">⇄ ' + (it.k === "fix" ? "To New apps" : "To Fixes") + '</button><button type="button" class="tu-btn tu-btn--ghost ed-del" data-a="del" title="Delete">🗑</button></div>';
        }
        return h + "</li>";
    }
    function paintTools() {
        var sel = $("ed-tool"), cnt = {};
        items.forEach(function (it) { if (pref.k !== "all" && it.k !== pref.k) return; E.itemTools(it).forEach(function (s) { cnt[s] = (cnt[s] || 0) + 1; }); });
        if (pref.tool && !cnt[pref.tool]) cnt[pref.tool] = 0;
        var keys = Object.keys(cnt).sort();
        var html = '<option value="">Every page</option>' + keys.map(function (s) { return '<option value="' + esc(s) + '">mes.fm/' + esc(s) + " (" + cnt[s] + ")</option>"; }).join("");
        if (sel.__html !== html) { sel.innerHTML = html; sel.__html = html; }
        sel.value = pref.tool || "";
        if (keys.length >= 10 && window.MESSelect && !sel.__mesEnh) { sel.__mesEnh = 1; MESSelect.enhance(sel, { placeholder: "Search pages…", noun: "pages" }); }
    }
    var qPos = {};
    function queueList() { return items.filter(function (x) { return x.qo && (x.st === "todo" || x.st === "doing"); }).sort(function (a, b) { return a.qo - b.qo; }); }
    function render() {
        pendingRender = false;
        qPos = {}; queueList().forEach(function (x, i) { qPos[x.id] = i + 1; });
        $("ed-qnote").hidden = pref.k !== "queue";
        var c = E.counts(items);
        root.querySelectorAll("[data-n]").forEach(function (n) { n.textContent = c[n.dataset.n] || ""; });
        root.querySelectorAll(".ed-tab").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.k === pref.k ? "true" : "false"); });
        root.querySelectorAll(".ed-chip").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.st === pref.st ? "true" : "false"); });
        $("ed-addlbl").textContent = pref.k === "app" ? "New app idea" : pref.k === "fix" ? "New fix" : "New item";
        $("ed-kindwrap").hidden = pref.k !== "all";
        $("ed-fstar").checked = !!pref.star; $("ed-sort").value = pref.sort;
        paintTools();
        var f = { k: pref.k, st: pref.st, sort: pref.sort, star: pref.star, tool: pref.tool, q: $("ed-q").value };
        var list = E.filter(items, f);
        $("ed-list").innerHTML = list.map(itemHtml).join("");
        var em = $("ed-empty");
        em.hidden = list.length > 0;
        if (!list.length) em.textContent = !items.length ? (online === false ? "Can't reach mes.fm and there's no saved copy in this browser yet." : online ? "Nothing here yet. Add the first one above, or bring the Telegram groups over (bottom of the page)." : "Loading…") : "Nothing matches. Try “Everything” or clear the search.";
        var where = pref.k === "all" ? "" : (pref.k === "app" ? " new-app ideas" : " fixes");
        $("ed-count").textContent = items.length ? list.length + where + " shown" + (pref.st === "open" ? " (open)" : pref.st === "all" ? "" : " (" + E.STATE_NAME[pref.st].toLowerCase() + ")") : "";
        $("ed-count").hidden = !items.length;
    }

    /* ---------- add ---------- */
    function grow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.6) + "px"; }
    function add() {
        var ta = $("ed-t"), t = ta.value.trim();
        if (!t) { ta.focus(); return; }
        var k = pref.k === "all" ? $("ed-kind").value : pref.k;
        change({ op: "add", k: k, t: t, star: $("ed-star").checked }).then(function (r) { if (r) toast("Added to " + E.KIND_NAME[k]); });
        ta.value = ""; $("ed-star").checked = false; lsSet("mes-edits:draft", null); grow(ta);
        if (pref.st !== "open" && pref.st !== "all" && pref.st !== "todo") { pref.st = "open"; savePref(); render(); }
    }
    $("ed-addbtn").onclick = add;
    /* ---------- pictures: pasted or picked (phones: the 📷 button opens the gallery / camera), shrunk to a JPEG, saved by
       /api/edits (op "img") and put into the text as a link, which shows as a picture like a snipboard link ---------- */
    function shrink(file) {
        var bmp = window.createImageBitmap ? createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(file); }) : Promise.reject(new Error("old browser"));
        return bmp.then(function (b) {
            var tries = [[1800, 0.85], [1600, 0.78], [1280, 0.72], [1024, 0.65], [800, 0.6]];
            function attempt(i) {
                var t = tries[i], k = Math.min(1, t[0] / Math.max(b.width, b.height)), c = document.createElement("canvas");
                c.width = Math.max(1, Math.round(b.width * k)); c.height = Math.max(1, Math.round(b.height * k));
                var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0, c.width, c.height);
                var d = c.toDataURL("image/jpeg", t[1]).split(",")[1];
                if (d.length <= 640000 || i === tries.length - 1) return d.length <= 690000 ? d : Promise.reject(new Error("That picture is too big."));
                return attempt(i + 1);
            }
            return attempt(0);
        });
    }
    function insertAt(ta, text) {
        var a = ta.selectionStart != null ? ta.selectionStart : ta.value.length, b = ta.selectionEnd != null ? ta.selectionEnd : a, v = ta.value;
        var pre = a > 0 && !/\s$/.test(v.slice(0, a)) ? " " : "", post = b < v.length && !/^\s/.test(v.slice(b)) ? " " : "";
        ta.value = v.slice(0, a) + pre + text + post + v.slice(b);
        var p = a + pre.length + text.length + post.length; try { ta.setSelectionRange(p, p); } catch (e) {}
        ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    function addPictures(files, ta) {
        files = [].slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
        if (!files.length) return false;
        if (LOCAL) { toast("Pictures are saved on mes.fm itself: try it on the live page"); return true; }
        var n = files.length; toast(n > 1 ? "Adding " + n + " pictures…" : "Adding the picture…");
        files.reduce(function (p, f) {
            return p.then(function () { return shrink(f); }).then(function (d) { return call("POST", { op: "img", data: d }); })
                .then(function (j) { if (j && j.url) insertAt(ta, j.url); });
        }, Promise.resolve()).then(function () { toast(n > 1 ? n + " pictures added to the text" : "Picture added to the text"); ta.focus(); }, function (e) { toast("Could not add the picture: " + (e && e.message || e)); });
        return true;
    }
    $("ed-picbtn").onclick = function () { $("ed-picin").click(); };
    $("ed-picin").onchange = function () { addPictures(this.files, $("ed-t")); this.value = ""; };
    // paste a screenshot into the new-item box, a reply box or an edit box
    root.addEventListener("paste", function (e) {
        var ta = e.target.closest && e.target.closest("textarea"); if (!ta || !e.clipboardData) return;
        var files = [].slice.call(e.clipboardData.files || []);
        if (!files.length) [].slice.call(e.clipboardData.items || []).forEach(function (it) { if (it.kind === "file") { var f = it.getAsFile(); if (f) files.push(f); } });
        if (addPictures(files, ta)) e.preventDefault();
    });
    // dropping a picture on any text box works too
    root.addEventListener("dragover", function (e) { if (e.target.closest && e.target.closest("textarea") && e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault(); });
    root.addEventListener("drop", function (e) { var ta = e.target.closest && e.target.closest("textarea"); if (ta && e.dataTransfer && addPictures(e.dataTransfer.files, ta)) e.preventDefault(); });

    $("ed-t").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });
    $("ed-t").addEventListener("input", function () { grow(this); lsSet("mes-edits:draft", this.value || null); });
    $("ed-t").value = lsGet("mes-edits:draft", ""); grow($("ed-t"));

    /* ---------- filters ---------- */
    root.querySelector(".ed-tabs").addEventListener("click", function (e) { var b = e.target.closest(".ed-tab"); if (!b) return; pref.k = b.dataset.k; pref.tool = ""; savePref(); render(); });
    root.querySelector(".ed-chips").addEventListener("click", function (e) { var b = e.target.closest(".ed-chip"); if (!b) return; pref.st = b.dataset.st; savePref(); render(); });
    $("ed-fstar").onchange = function () { pref.star = this.checked; savePref(); render(); };
    $("ed-sort").onchange = function () { pref.sort = this.value; savePref(); render(); };
    $("ed-tool").onchange = function () { pref.tool = this.value; savePref(); render(); };
    var qT = 0; $("ed-q").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(render, 120); });
    $("ed-q").addEventListener("keydown", function (e) { if (e.key === "Escape") { this.value = ""; render(); } });

    /* ---------- item actions ---------- */
    function closeBox(id) { delete open[id]; if (pendingRender) load(true); render(); }
    $("ed-list").addEventListener("change", function (e) {
        var s = e.target.closest(".ed-st"); if (!s) return;
        var id = s.closest(".ed-it").dataset.id;
        change({ op: "update", id: id, st: s.value });
    });
    $("ed-list").addEventListener("click", function (e) {
        var b = e.target.closest("[data-a]"); if (!b || b.tagName === "SELECT") return;
        var li = b.closest(".ed-it"), id = li && li.dataset.id, it = items[byId(id)], a = b.dataset.a;
        if (!it) return;
        if (a === "star") change({ op: "update", id: id, star: !it.star });
        else if (a === "qon") { var ql = queueList(); change({ op: "update", id: id, qo: (ql.length ? ql[ql.length - 1].qo : 0) + 1 }).then(function (r) { if (r) toast("Added to the queue (#" + (ql.length + 1) + ")"); }); }
        else if (a === "qoff") change({ op: "update", id: id, qo: 0 }).then(function (r) { if (r) toast("Taken off the queue", function () { change({ op: "update", id: id, qo: it.qo }); }); });
        else if (a === "qup" || a === "qdown" || a === "qtop") {
            var q = queueList(), i = q.findIndex(function (x) { return x.id === id; });
            if (a === "qtop") { if (i > 0) change({ op: "update", id: id, qo: q[0].qo / 2 }); }
            else {
                var j = a === "qup" ? i - 1 : i + 1;
                if (i < 0 || j < 0 || j >= q.length) return;
                var other = q[j], a1 = it.qo, a2 = other.qo;
                change({ op: "update", id: id, qo: a2 }).then(function (r) { if (r) change({ op: "update", id: other.id, qo: a1 }); });
            }
        }
        else if (a === "done" || a === "doing") change({ op: "update", id: id, st: a }).then(function (r) { if (r && a === "done" && pref.st === "open") toast("Marked done", function () { change({ op: "update", id: id, st: it.st }); }); });
        else if (a === "reopen") change({ op: "update", id: id, st: "todo" });
        else if (a === "move") { var to = it.k === "fix" ? "app" : "fix"; change({ op: "update", id: id, k: to }).then(function (r) { if (r) toast("Moved to " + E.KIND_NAME[to], function () { change({ op: "update", id: id, k: it.k }); }); }); }
        else if (a === "tool") { pref.tool = b.dataset.v; savePref(); render(); window.scrollTo({ top: root.querySelector(".ed-bar").getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" }); }
        else if (a === "edit" || a === "reply") {
            open[id] = a; render();
            var ta = $("ed-list").querySelector('.ed-it[data-id="' + id + '"] textarea'); if (ta) { grow(ta); ta.focus(); if (a === "edit") ta.setSelectionRange(ta.value.length, ta.value.length); }
        }
        else if (a === "cancel") closeBox(id);
        else if (a === "save") {
            var t = li.querySelector('[data-f="t"]').value, note = li.querySelector('[data-f="note"]').value;
            if (!t.trim()) { toast("The text can't be empty (use 🗑 to delete)."); return; }
            delete open[id]; change({ op: "update", id: id, t: t, note: note }).then(function () { if (pendingRender) load(true); });
        }
        else if (a === "send") {
            var r = li.querySelector('[data-f="r"]').value;
            if (!r.trim()) { li.querySelector('[data-f="r"]').focus(); return; }
            delete open[id]; change({ op: "reply", id: id, t: r }).then(function () { if (pendingRender) load(true); });
        }
        else if (a === "del") {
            if (!confirm("Delete this item?\n\n" + it.t.slice(0, 160) + (it.t.length > 160 ? "…" : ""))) return;
            var copy = JSON.parse(JSON.stringify(it));
            change({ op: "delete", id: id }).then(function (r) { if (r) toast("Deleted", function () { change({ op: "import", items: [copy] }); }); });
        }
    });
    $("ed-list").addEventListener("input", function (e) { if (e.target.tagName === "TEXTAREA") grow(e.target); });
    $("ed-list").addEventListener("keydown", function (e) {
        if (e.target.tagName !== "TEXTAREA") return;
        var li = e.target.closest(".ed-it");
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); var go = li.querySelector('[data-a="send"],[data-a="save"]'); if (go) go.click(); }
        if (e.key === "Escape") { e.preventDefault(); closeBox(li.dataset.id); }
    });

    /* ---------- backups: file ---------- */
    function stamp() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    $("ed-dl").onclick = function () {
        if (!items.length) { toast("The list is empty."); return; }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([E.backupText(items)], { type: "application/json" }));
        a.download = "mes-edits-" + stamp() + ".json";
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast("Downloaded " + items.length + " items");
    };
    function importList(list, what) {
        if (!list.length) { toast("Nothing to add."); return Promise.resolve(); }
        var chunks = [], tot = { added: 0, replaced: 0, skipped: 0 };
        for (var i = 0; i < list.length; i += 1000) chunks.push(list.slice(i, i + 1000));
        return chunks.reduce(function (p, ch) {
            return p.then(function (ok) { if (ok === false) return false; return change({ op: "import", items: ch }).then(function (r) { if (!r) return false; tot.added += r.added; tot.replaced += r.replaced; tot.skipped += r.skipped; }); });
        }, Promise.resolve()).then(function (ok) {
            if (ok === false) return;
            toast(what + ": added " + tot.added + (tot.replaced ? ", updated " + tot.replaced : "") + (tot.skipped ? ", " + tot.skipped + " already here" : ""));
        });
    }
    function readJsonFile(file) {
        return new Promise(function (res, rej) {
            var r = new FileReader();
            r.onload = function () { try { res(JSON.parse(r.result)); } catch (e) { rej(new Error("That file isn't JSON.")); } };
            r.onerror = function () { rej(new Error("Could not read the file.")); };
            r.readAsText(file);
        });
    }
    $("ed-up").onclick = function () { $("ed-upfile").click(); };
    $("ed-upfile").onchange = function () {
        var f = this.files[0]; this.value = ""; if (!f) return;
        readJsonFile(f).then(function (d) {
            var list = E.readBackup(d);
            if (!list) { if (E.tgChats(d).length) throw new Error("That is a Telegram export: use “Pick result.json” below."); throw new Error("That file isn't an MES Edits backup."); }
            return importList(list, "Restored");
        }).catch(function (e) { toast(e.message); });
    };

    /* ---------- Telegram import ---------- */
    var tgData = null;
    $("ed-tg").onclick = function () { $("ed-tgfile").click(); };
    $("ed-tgfile").onchange = function () {
        var f = this.files[0]; this.value = ""; if (!f) return;
        readJsonFile(f).then(function (d) {
            var chats = E.tgChats(d);
            if (!chats.length) throw new Error("No chat messages in that file. Export with Format: Machine-readable JSON.");
            tgData = chats; paintTg();
        }).catch(function (e) { toast(e.message); });
    };
    function paintTg() {
        var box = $("ed-tgprev");
        if (!tgData) { box.innerHTML = ""; return; }
        box.innerHTML = '<div class="ed-tgbox">' + tgData.map(function (c, i) {
            var r = E.fromTelegramChat(c), done = r.items.filter(function (x) { return x.st === "done"; }).length, reps = r.items.reduce(function (t, x) { return t + x.rs.length; }, 0);
            return '<div class="ed-tgrow"><b>' + esc(r.name) + '</b> <span class="ed-note">' + r.items.length + " items (" + done + " already done), " + reps + ' replies</span> <label>into <select class="tu-select" data-tg="' + i + '"><option value="fix"' + (r.kind === "fix" ? " selected" : "") + '>Fixes</option><option value="app"' + (r.kind === "app" ? " selected" : "") + ">New apps</option></select></label></div>";
        }).join("") + '<label class="ed-chk"><input type="checkbox" id="ed-tgskip"> Leave out the ones already marked DONE</label>'
            + '<p><button type="button" class="tu-btn tu-btn--primary" id="ed-tggo">Import</button> <button type="button" class="tu-btn tu-btn--ghost" id="ed-tgx">Cancel</button></p>'
            + '<p class="ed-note">Each message becomes an item; replies in Telegram become replies on it; a message or reply starting with “DONE” marks it done. Photos are not in the export (they show as “[Photo in Telegram]”). Importing the same file again adds nothing.</p></div>';
        $("ed-tgx").onclick = function () { tgData = null; paintTg(); };
        $("ed-tggo").onclick = function () {
            var skip = $("ed-tgskip").checked, list = [];
            tgData.forEach(function (c, i) {
                var k = box.querySelector('[data-tg="' + i + '"]').value;
                E.fromTelegramChat(c, k).items.forEach(function (x) { if (!(skip && x.st === "done")) list.push(x); });
            });
            importList(list, "Telegram").then(function () { tgData = null; paintTg(); });
        };
    }

    /* ---------- backups: Hive (MESHive + MESHiveStore, app "edits", name "all", data {v:1, items}) ---------- */
    var HAPP = "edits", hvList = null, hvBusy = false;
    function HV() { return window.MESHive; }
    function HS() { return window.MESHiveStore; }
    function hmsg(t, cls) { var m = $("ed-hv-msg"); m.textContent = t || ""; m.className = "ed-note" + (cls ? " is-" + cls : ""); }
    function hvErr(e) { return e && e.code === "cancel" ? "Cancelled." : (e && e.message) || "Something went wrong."; }
    function hvKb(n) { return n < 1024 ? n + " bytes" : (n / 1024).toFixed(1) + " KB"; }
    function hvWhen(t) { var d = new Date(/Z$/.test(t) ? t : t + "Z"); return isNaN(d) ? t : fullDate(+d); }
    function paintWarn() {
        var w = $("ed-hv-warn"), enc = $("ed-hv-enc").checked;
        if (!enc) { w.className = "ed-hvwarn is-bad"; w.innerHTML = "⚠ <b>Public:</b> every item would be readable by anyone on the Hive blockchain, forever."; return; }
        var pass = HS().lockMode && HS().lockMode() === "pass";
        w.className = "ed-hvwarn" + (pass ? "" : " is-bad");
        w.innerHTML = pass ? "🛡 Locked with your passphrase (quantum-safe)." : "🔒 Memo key lock: fine today, but pick <b>🛡 Passphrase</b> above for quantum-safe.";
    }
    function paintHvUser() {
        var box = $("ed-hv-user");
        if (!HV() || !HS()) { box.innerHTML = '<p class="ed-hvwarn is-bad">The Hive scripts did not load (blocked or offline). Reload the page to try again.</p>'; return; }
        var u = HV().user();
        if (u) {
            box.innerHTML = '<p class="ed-hvwho"><img src="' + HV().avatar(u.name) + '" alt="" width="24" height="24" loading="lazy"> Logged in as <b>@' + esc(u.name) + '</b> <button type="button" class="tu-btn tu-btn--ghost" data-h="logout">Log out</button></p>';
            $("ed-hv-main").hidden = false; $("ed-hv-help").innerHTML = "";
            var ce = $("ed-hv-enc"), can = !HS().canEncrypt || HS().canEncrypt() || (HS().lockMode && HS().lockMode() === "pass");
            ce.checked = can && lsGet(HVENC, "1") !== "0"; ce.disabled = !can;
            paintWarn();
        } else {
            box.innerHTML = '<p class="ed-hvlogin"><input class="tu-input" id="ed-hv-name" type="text" placeholder="Your Hive username" aria-label="Your Hive username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="17"> <button type="button" class="tu-btn tu-btn--primary" data-h="login">Log in with Keychain</button></p>';
            $("ed-hv-main").hidden = true;
            HV().keychain(1500).then(function (k) { if (!k && !HV().user()) $("ed-hv-help").innerHTML = HV().helpHtml(); });
        }
    }
    function hvBusySet(on) { hvBusy = on; $("ed-hv-save").disabled = on; $("ed-hv-load").disabled = on; }
    function hvSave() {
        if (hvBusy) return;
        if (!items.length) { hmsg("The list is empty.", "err"); return; }
        var enc = $("ed-hv-enc").checked;
        if (!enc && !confirm("Save WITHOUT encryption?\n\nAll " + items.length + " items will be public on the Hive blockchain, readable by anyone, and can never be deleted.")) return;
        var u = HV().user(); hvBusySet(true);
        HS().rcPercent(u.name).catch(function () { return null; }).then(function (rc) {
            if (rc != null && rc < 3) throw new Error("Your account's Resource Credits are at " + rc.toFixed(0) + "%. They refill over about five days; try again later.");
            return HS().save(HAPP, "all", { v: 1, items: items }, { encrypt: enc, onProgress: function (m) { hmsg(m); } }).then(function (r) {
                hmsg("Saved " + items.length + " items to @" + u.name + " (" + hvKb(r.bytes) + (enc ? (r.header && r.header.e === 2 ? ", locked with your passphrase" : ", encrypted with your memo key") : ", public") + ").", "ok");
                toast("Saved to Hive"); hvList = null; setTimeout(function () { hvLoad(true); }, 4000);
            });
        }).catch(function (e) { hmsg(/too (big|large)|chunks/i.test(hvErr(e)) ? "The list is too big for one Hive save: download the JSON file instead." : hvErr(e), "err"); }).then(function () { hvBusySet(false); });
    }
    function hvLoad(quiet) {
        var u = HV() && HV().user(); if (!u || (hvBusy && !quiet)) return;
        hvBusySet(true); if (!quiet) hmsg("Looking for your saves on Hive…");
        HS().list(u.name, { app: HAPP, pages: 30 }).then(function (saves) {
            hvList = saves.filter(function (e) { return e.name === "all"; }).slice(0, 12); paintHvList();
            if (!quiet) hmsg(hvList.length ? "Found " + hvList.length + " save" + (hvList.length === 1 ? "" : "s") + "." : "No MES Edits saves on @" + u.name + " yet.", hvList.length ? "" : "err");
        }).catch(function (e) { hmsg("Could not read from Hive: " + hvErr(e), "err"); }).then(function () { hvBusySet(false); });
    }
    function paintHvList() {
        var box = $("ed-hv-list");
        if (!hvList || !hvList.length) { box.innerHTML = ""; return; }
        box.innerHTML = '<ul class="ed-hb">' + hvList.map(function (e, i) {
            return '<li><span><b>' + esc(hvWhen(e.time)) + (i === 0 ? ' <span class="ed-new">newest</span>' : "") + "</b><small>" + esc(HS().lockLabel(e)) + " · " + esc(hvKb(e.bytes)) + (e.complete ? "" : " · incomplete") + (e.trx ? ' · <a href="' + HS().explorer(e.trx) + '" target="_blank" rel="noopener">chain ↗</a>' : "") + "</small></span>"
                + (e.complete ? '<button type="button" class="tu-btn tu-btn--primary" data-h="restore" data-i="' + i + '">Restore</button>' : "") + '<button type="button" class="tu-btn tu-btn--ghost" data-h="forget" data-i="' + i + '">Hide</button></li>';
        }).join("") + "</ul>";
    }
    function initHive() {
        if (!HV() || !HS()) { paintHvUser(); return; }
        /* the user asked for quantum-safe backups: switch the (site-wide) lock to the passphrase once, the first time this panel opens */
        if (!lsGet(LOCKSET) && HS().setLock) { HS().setLock("pass"); lsSet(LOCKSET, "1"); }
        $("ed-hv-enc").onchange = function () { lsSet(HVENC, this.checked ? "1" : "0"); paintWarn(); };
        if (HS().encModeUI) HS().encModeUI($("ed-hv-enc"), function () { paintHvUser(); });
        $("ed-hv-save").onclick = hvSave;
        $("ed-hv-load").onclick = function () { hvLoad(false); };
        $("ed-hive").addEventListener("click", function (e) {
            var b = e.target.closest("[data-h]"); if (!b) return;
            var a = b.dataset.h;
            if (a === "login") {
                var name = ($("ed-hv-name").value || "").trim();
                if (!name) { $("ed-hv-name").focus(); return; }
                hmsg("Confirm the login in Hive Keychain…");
                HV().login(name).then(function () { hmsg(""); paintHvUser(); hvLoad(true); }).catch(function (x) {
                    hmsg(x.code === "nokeychain" ? "Hive Keychain is not installed in this browser." : hvErr(x), "err");
                    if (x.code === "nokeychain") $("ed-hv-help").innerHTML = HV().helpHtml();
                });
            } else if (a === "logout") { HV().logout(); hvList = null; paintHvList(); hmsg(""); paintHvUser(); }
            else if (a === "restore") {
                var en = hvList[+b.dataset.i]; if (!en || hvBusy) return;
                hvBusySet(true); hmsg(en.lock === "pass" ? "Unlocking with your passphrase…" : en.encrypted ? "Confirm in Keychain: decrypt with your memo key…" : "Opening the save…");
                HS().load(en).then(function (d) {
                    var list = d && E.readBackup(d);
                    if (!list) throw new Error("That save could not be read.");
                    hmsg(""); return importList(list, "Restored from Hive");
                }).catch(function (x) { hmsg(hvErr(x), "err"); }).then(function () { hvBusySet(false); });
            } else if (a === "forget") {
                var it = hvList[+b.dataset.i]; if (!it || hvBusy) return;
                if (!confirm("Hide this save from the list?\n\nThis only adds a 'hidden' note on Hive: the save itself stays in the blockchain's history forever.")) return;
                hvBusySet(true);
                HS().forget(HAPP, it.name, it.s).then(function () { hvList.splice(+b.dataset.i, 1); paintHvList(); hmsg("Hidden from the list.", "ok"); })
                    .catch(function (x) { hmsg(hvErr(x), "err"); }).then(function () { hvBusySet(false); });
            }
        });
        $("ed-hive").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "ed-hv-name") { e.preventDefault(); $("ed-hive").querySelector('[data-h="login"]').click(); } });
        HV().onChange(function () { hvList = null; paintHvList(); paintHvUser(); });
        paintHvUser();
        if (HV().user()) hvLoad(true);
    }
    var hiveStarted = false;
    $("ed-backup").addEventListener("toggle", function () { if (this.open && !hiveStarted) { hiveStarted = true; initHive(); } });

    /* ---------- start ---------- */
    render(); paintSync(); load();
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !busy) load(true); });
    setInterval(function () { if (!document.hidden && !busy) load(true); }, 60000);
    window.MESEditsDebug = { items: function () { return items; }, load: load, change: change, local: LOCAL };
})();
