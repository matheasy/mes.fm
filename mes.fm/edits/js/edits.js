/* MES Edits: pure logic shared by the page (mes.fm/edits) and the server (mes.fm/api/edits.js requires a byte-identical copy,
   mes.fm/api/_edits-lib.js: cp after editing; the tests check). No DOM, no network.
   Item = { id, k: "fix"|"app"|"mirror"|"other"|<own list slug>, t, st: "todo"|"doing"|"done"|"wont", star, note, rs: [{ t, at, by }], c, u, d, src?, qo? } (c / u / d = ms).
   qo = place in the Queue (any positive number, smaller = sooner; absent = not queued). Finishing an item (done / won't) takes it off the queue.
   o = place in "My order" (any finite number, smaller = higher; absent = by date, newest first). */
(function (root, factory) {
    var E = factory();
    if (typeof module === "object" && module.exports) module.exports = E;
    else root.MESEdits = E;
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";
    var MAX_ITEMS = 5000, MAX_T = 6000, MAX_NOTE = 3000, MAX_R = 3000, MAX_RS = 60, MAX_IMPORT = 2000;
    var KINDS = ["fix", "app", "mirror", "other"], STATES = ["todo", "doing", "done", "wont"], BYS = ["me", "claude"];
    var KIND_NAME = { fix: "Fixes", app: "New apps", mirror: "Mirrors", other: "Other" };
    var KIND_ONE = { fix: "Fix", app: "New app", mirror: "Mirror", other: "Other" };
    /* Built-in lists, or one the user made: a short slug ("ai-ideas" = "Ai ideas"). */
    var KIND_RE = /^[a-z0-9][a-z0-9\/-]{1,23}$/;   /* digits and "/" are fine ("9/11"); "all" and "queue" are the page's own tabs */
    function okKind(k) { return KINDS.indexOf(k) >= 0 || (typeof k === "string" && KIND_RE.test(k) && !/--|-$|\/$|\/\/|^(all|queue)$/.test(k)); }
    function kindSlug(name) { return String(name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\/]+/g, "-").replace(/\/+/g, "/").replace(/^[^a-z0-9]+/, "").replace(/-*\/-*/g, "/").replace(/-+/g, "-").slice(0, 24).replace(/[-\/]+$/, ""); }
    /* names = the list names the user typed (meta.names: "ai" -> "AI"), so capitals they chose are kept. */
    function kindName(k, names) { if (names && typeof names[k] === "string" && names[k]) return names[k]; if (KIND_NAME[k]) return KIND_NAME[k]; var s = String(k).replace(/-/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); }
    function kindOne(k, names) { return (names && names[k]) || KIND_ONE[k] || kindName(k); }
    /* Tab settings kept on the server (edits:meta), so every device shows the same: names, pinned lists, order mode (custom = dragged, az = A-Z). */
    function cleanName(name) { return String(name || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40); }
    function cleanMeta(m) {
        m = m && typeof m === "object" ? m : {};
        var names = {}, pins = [];
        if (m.names && typeof m.names === "object") Object.keys(m.names).slice(0, 300).forEach(function (k) { var n = cleanName(m.names[k]); if (okKind(k) && n && kindSlug(n) === k) names[k] = n; });
        if (Array.isArray(m.pins)) m.pins.slice(0, 100).forEach(function (k) { if (typeof k === "string" && (okKind(k) || k === "all" || k === "queue") && pins.indexOf(k) < 0) pins.push(k); });
        return { names: names, pins: pins, mode: m.mode === "az" ? "az" : "custom" };
    }
    /* The tab order: pinned lists first (in pin order), then the rest dragged (custom) or A-Z by the name shown; All / Queue stay
       where they are in custom mode and come first (after pins) in A-Z mode. */
    function sortTabs(keys, meta, order) {
        meta = cleanMeta(meta);
        var pinned = meta.pins.filter(function (k) { return keys.indexOf(k) >= 0; });
        var rest = keys.filter(function (k) { return pinned.indexOf(k) < 0; });
        if (meta.mode === "az") {
            var fixed = rest.filter(function (k) { return k === "all" || k === "queue"; });
            rest = fixed.concat(rest.filter(function (k) { return k !== "all" && k !== "queue"; })
                .sort(function (a, b) { return kindName(a, meta.names).localeCompare(kindName(b, meta.names), undefined, { sensitivity: "base", numeric: true }); }));
        } else rest = orderTabs(rest, order);
        return pinned.concat(rest);
    }
    function okOrder(v) { return typeof v === "number" ? isFinite(v) && Math.abs(v) < 1e15 : false; }
    var STATE_NAME = { todo: "To do", doing: "Doing", done: "Done", wont: "Won't do" };

    function randId() {
        var s = "";
        var c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : null;
        if (c) { var a = new Uint8Array(6); c.getRandomValues(a); for (var i = 0; i < 6; i++) s += (a[i] + 256).toString(16).slice(1); return s; }
        try { return require("crypto").randomBytes(6).toString("hex"); } catch (e) { /* fall through */ }
        for (var j = 0; j < 12; j++) s += Math.floor(Math.random() * 16).toString(16);
        return s;
    }

    /* Text keeps new lines, drops other control characters. */
    function cleanText(t, max) {
        return String(t == null ? "" : t).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ")
            .replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, max);
    }
    function okId(id) { return typeof id === "string" && /^[a-z0-9]{6,24}$/.test(id); }
    function num(v, d) { return isFinite(+v) && +v > 0 ? Math.round(+v) : d; }
    function textKey(it) { return it.k + "|" + it.t.toLowerCase().replace(/\s+/g, " ").trim(); }
    function cleanReply(r, now) {
        if (!r || typeof r !== "object") return null;
        var t = cleanText(r.t, MAX_R);
        if (!t) return null;
        return { t: t, at: num(r.at, now), by: BYS.indexOf(r.by) >= 0 ? r.by : "me" };
    }
    /* Tidy a whole item coming from an import / restore. Returns null when it has no text. */
    function cleanItem(x, now) {
        if (!x || typeof x !== "object") return null;
        var t = cleanText(x.t, MAX_T);
        if (!t) return null;
        var c = num(x.c, now);
        var st = STATES.indexOf(x.st) >= 0 ? x.st : "todo";
        var it = {
            id: okId(x.id) ? x.id : randId(), k: okKind(x.k) ? x.k : "fix", t: t, st: st, star: !!x.star,
            note: cleanText(x.note, MAX_NOTE),
            rs: (Array.isArray(x.rs) ? x.rs : []).map(function (r) { return cleanReply(r, c); }).filter(Boolean).slice(-MAX_RS),
            c: c, u: num(x.u, c), d: st === "done" || st === "wont" ? num(x.d, num(x.u, c)) : 0
        };
        if (typeof x.src === "string" && /^[a-z0-9:_-]{1,40}$/i.test(x.src)) it.src = x.src;
        if (isFinite(+x.qo) && +x.qo > 0 && st !== "done" && st !== "wont") it.qo = +x.qo;
        if (okOrder(x.o)) it.o = x.o;
        return it;
    }

    /* Apply one change to the map of items (id -> item). Returns { status, body, put?: [items], del?: [ids] }.
       Same rules on the server and in the page's local stand-in. */
    function apply(items, body, now) {
        now = now || Date.now();
        var op = body && body.op, count = Object.keys(items).length, old, it;
        if (op === "add") {
            var t = cleanText(body.t, MAX_T);
            if (!t) return { status: 400, body: { error: "empty item" } };
            if (count >= MAX_ITEMS) return { status: 400, body: { error: "at most " + MAX_ITEMS + " items" } };
            it = { id: randId(), k: okKind(body.k) ? body.k : "fix", t: t, st: "todo", star: !!body.star, note: "", rs: [], c: now, u: now, d: 0 };
            return { status: 200, body: { item: it }, put: [it] };
        }
        if (op === "import") {
            var list = Array.isArray(body.items) ? body.items : null;
            if (!list) return { status: 400, body: { error: "items must be a list" } };
            if (list.length > MAX_IMPORT) return { status: 400, body: { error: "at most " + MAX_IMPORT + " items at once" } };
            var seen = {}, put = [], skipped = 0, replaced = 0, n = count;
            Object.keys(items).forEach(function (id) { seen[textKey(items[id])] = 1; });
            list.forEach(function (raw) {
                var x = cleanItem(raw, now);
                if (!x) { skipped++; return; }
                var o = items[x.id];
                if (o) { if (x.u > o.u) { put.push(x); replaced++; } else skipped++; return; }
                var tk = textKey(x);
                if (seen[tk] || n >= MAX_ITEMS) { skipped++; return; }
                seen[tk] = 1; put.push(x); n++;
            });
            return { status: 200, body: { added: put.length - replaced, replaced: replaced, skipped: skipped }, put: put };
        }
        if (op === "update" || op === "reply" || op === "delete") {
            old = okId(body.id) && items[body.id];
            if (!old) return { status: 404, body: { error: "no such item" } };
            if (op === "delete") return { status: 200, body: { ok: true }, del: [body.id] };
            it = JSON.parse(JSON.stringify(old));
            if (op === "reply") {
                var r = cleanReply({ t: body.t, at: now, by: body.by }, now);
                if (!r) return { status: 400, body: { error: "empty reply" } };
                it.rs = (it.rs || []).concat(r).slice(-MAX_RS);
            } else {
                if (body.t != null) { it.t = cleanText(body.t, MAX_T); if (!it.t) return { status: 400, body: { error: "empty item" } }; }
                if (body.k != null) { if (!okKind(body.k)) return { status: 400, body: { error: "bad kind" } }; it.k = body.k; }
                if (body.st != null) {
                    if (STATES.indexOf(body.st) < 0) return { status: 400, body: { error: "bad status" } };
                    if (body.st !== it.st) it.d = body.st === "done" || body.st === "wont" ? now : 0;
                    it.st = body.st;
                }
                if (body.star != null) it.star = !!body.star;
                if (body.qo != null) { var q = +body.qo; if (!isFinite(q) || q < 0) return { status: 400, body: { error: "bad queue place" } }; if (q > 0) it.qo = q; else delete it.qo; }
                if (body.o !== undefined) { if (body.o === null || body.o === "") delete it.o; else if (okOrder(+body.o)) it.o = +body.o; else return { status: 400, body: { error: "bad order" } }; }
                if (it.st === "done" || it.st === "wont") delete it.qo;
                if (body.note != null) it.note = cleanText(body.note, MAX_NOTE);
            }
            it.u = now;
            return { status: 200, body: { item: it }, put: [it] };
        }
        return { status: 400, body: { error: "unknown op" } };
    }
    function sortNewest(list) { return list.sort(function (a, b) { return b.c - a.c || (a.id < b.id ? -1 : 1); }); }

    /* ---------- page helpers ---------- */
    var URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+|mes\.fm\/[^\s<>"']*)/gi;
    function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    function trimUrl(u) { var m = u.match(/[.,;:!?)\]]+$/); var tail = ""; if (m && !(m[0].charAt(0) === ")" && u.indexOf("(") >= 0)) { tail = m[0]; u = u.slice(0, -tail.length); } return [u, tail]; }
    function hrefOf(u) { return /^https?:\/\//i.test(u) ? u : "https://" + u; }
    /* A link's picture: snipboard.io page links become their i.snipboard.io image; direct image links as they are. */
    function imageOf(u) {
        var h = hrefOf(u), m = h.match(/^https?:\/\/(?:i\.)?snipboard\.io\/([A-Za-z0-9]+)\.(jpg|jpeg|png|gif|webp)\b/i);
        if (m) return "https://i.snipboard.io/" + m[1] + "." + m[2];
        if (/^https:\/\/[^\s?#]+\.(png|jpe?g|gif|webp)(\?[^\s#]*)?$/i.test(h)) return h;
        if (/^https:\/\/(www\.)?mes\.fm\/api\/edits\?img=[a-f0-9]{16}\.jpg$/i.test(h)) return h.replace(/^https:\/\/(www\.)?mes\.fm/i, "");
        return "";
    }
    function links(t) { var out = []; String(t).replace(URL_RE, function (u) { out.push(trimUrl(u)[0]); return u; }); return out; }
    /* Safe HTML: everything escaped, links made clickable (new tab). */
    function linkify(t) {
        var s = String(t), out = "", last = 0, m;
        URL_RE.lastIndex = 0;
        while ((m = URL_RE.exec(s))) {
            var pr = trimUrl(m[0]), u = pr[0];
            out += esc(s.slice(last, m.index)) + '<a href="' + esc(hrefOf(u)) + '" target="_blank" rel="noopener">' + esc(u.replace(/^https?:\/\//i, "").replace(/^www\./i, "")) + "</a>" + esc(pr[1]);
            last = m.index + m[0].length;
        }
        return out + esc(s.slice(last));
    }
    /* mes.fm pages an item talks about ("mes.fm/photo" -> "photo"). */
    var NOT_TOOLS = { api: 1, main_js: 1, img: 1, shared: 1, www: 1 };
    function tools(t) {
        var out = [], re = /\bmes\.fm\/([a-z0-9][a-z0-9-]{0,60})/gi, m;
        while ((m = re.exec(String(t)))) { var s = m[1].toLowerCase(); if (!NOT_TOOLS[s] && out.indexOf(s) < 0) out.push(s); }
        return out;
    }
    function itemTools(it) { var all = it.t + "\n" + (it.note || "") + "\n" + (it.rs || []).map(function (r) { return r.t; }).join("\n"); return tools(all); }
    function fold(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
    /* f = { k: "fix"|"app"|"all", st: "open"|"todo"|"doing"|"done"|"wont"|"all", q, star, tool, sort: "new"|"old"|"upd"|"star" } */
    function filter(items, f) {
        f = f || {};
        var words = fold(f.q || "").split(/\s+/).filter(Boolean);
        var out = items.filter(function (it) {
            if (f.k === "queue") { if (!it.qo) return false; }
            else if (f.k && f.k !== "all" && it.k !== f.k) return false;
            var st = f.st || "open";
            if (st === "open" ? !(it.st === "todo" || it.st === "doing") : st !== "all" && it.st !== st) return false;
            if (f.star && !it.star) return false;
            if (f.tool && itemTools(it).indexOf(f.tool) < 0) return false;
            if (words.length) {
                var hay = fold(it.t + " " + (it.note || "") + " " + (it.rs || []).map(function (r) { return r.t; }).join(" "));
                for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
            }
            return true;
        });
        var s = f.k === "queue" ? "queue" : f.sort || "new";
        out.sort(function (a, b) {
            if (s === "queue") return a.qo - b.qo;
            if (s === "star" && a.star !== b.star) return a.star ? -1 : 1;
            if (s === "star" && (a.st === "doing") !== (b.st === "doing")) return a.st === "doing" ? -1 : 1;
            if (s === "old") return a.c - b.c;
            if (s === "upd") return b.u - a.u;
            if (s === "mine") return orderKey(a) - orderKey(b) || b.c - a.c;
            return b.c - a.c;
        });
        return out;
    }
    /* "My order": an item's own o, else its date (newest first, as negative numbers, so dragging one item never moves the rest). */
    function orderKey(it) { return okOrder(it.o) ? it.o : -it.c; }
    /* The number to give an item dropped between prev and next (either may be missing). */
    function between(prev, next, positive) {
        if (prev == null && next == null) return positive ? 1 : 0;
        if (prev == null) return positive ? next / 2 : next - 1000;
        if (next == null) return prev + 1;
        return (prev + next) / 2;
    }
    function counts(items) {
        var c = { fix: 0, app: 0, mirror: 0, other: 0, all: 0, queue: 0, todo: 0, doing: 0, done: 0, wont: 0 };
        items.forEach(function (it) { c[it.st]++; if (it.st === "todo" || it.st === "doing") { c[it.k] = (c[it.k] || 0) + 1; c.all++; if (it.qo) c.queue++; } });
        return c;
    }
    /* The tabs in the order the user dragged them into: keys found in `order` first (in that order), the rest after in their usual order. */
    function orderTabs(keys, order) {
        var pos = {}; (Array.isArray(order) ? order : []).forEach(function (k, i) { if (typeof k === "string" && !(k in pos)) pos[k] = i; });
        return keys.map(function (k, i) { return { k: k, a: k in pos ? 0 : 1, b: k in pos ? pos[k] : i }; })
            .sort(function (x, y) { return (x.a - y.a) || (x.b - y.b); }).map(function (x) { return x.k; });
    }
    /* Every list in use: the built-in ones first, then the user's own (A-Z), plus any extra slugs given. */
    function kindsOf(items, extra) {
        var own = {};
        items.forEach(function (it) { if (KINDS.indexOf(it.k) < 0 && okKind(it.k)) own[it.k] = 1; });
        (extra || []).forEach(function (k) { if (KINDS.indexOf(k) < 0 && okKind(k)) own[k] = 1; });
        return KINDS.concat(Object.keys(own).sort());
    }

    /* ---------- Telegram Desktop export (result.json) ----------
       One chat ({name, id, messages}) or a full export ({chats: {list: [...]}}). Every top-level message = an item; replies
       (reply_to_message_id, followed up the chain) become replies on it. A message or reply starting with "DONE" marks the item done.
       Ids are made from the chat and message ids, so importing the same file twice adds nothing. */
    function tgText(t) {
        if (typeof t === "string") return t;
        if (!Array.isArray(t)) return "";
        return t.map(function (p) {
            if (typeof p === "string") return p;
            if (!p || typeof p !== "object") return "";
            var s = String(p.text || "");
            if (p.type === "text_link" && p.href && p.href !== s) return s + " (" + p.href + ")";
            return s;
        }).join("");
    }
    function tgChats(data) {
        if (!data || typeof data !== "object") return [];
        if (Array.isArray(data.messages)) return [data];
        if (data.chats && Array.isArray(data.chats.list)) return data.chats.list.filter(function (c) { return c && Array.isArray(c.messages); });
        return [];
    }
    function guessKind(name) { return /new ?apps?|ideas?/i.test(String(name || "")) ? "app" : /mirror/i.test(String(name || "")) ? "mirror" : "fix"; }
    function tgTime(m) { var u = +m.date_unixtime; if (u > 0) return u * 1000; var d = Date.parse(m.date || ""); return isNaN(d) ? 0 : d; }
    /* chat -> { name, kind, items: [...] } (items not yet cleaned by cleanItem). */
    function fromTelegramChat(chat, kind) {
        kind = okKind(kind) ? kind : guessKind(chat.name);
        var cid = Math.abs(+chat.id || 0).toString(36).slice(-6), byId = {}, roots = {}, order = [];
        chat.messages.forEach(function (m) { if (m && m.type === "message") byId[m.id] = m; });
        function textOf(m) {
            var t = tgText(m.text).trim();
            var media = m.photo ? "[Photo in Telegram]" : m.file ? "[File in Telegram" + (m.file_name ? ": " + m.file_name : "") + "]" : m.media_type ? "[" + m.media_type.replace(/_/g, " ") + " in Telegram]" : "";
            if (media) t = t ? t + "\n" + media : media;
            if (m.forwarded_from) t = "(Forwarded from " + m.forwarded_from + ")\n" + t;
            return t;
        }
        function rootOf(m) { var seen = 0; while (m.reply_to_message_id && byId[m.reply_to_message_id] && seen++ < 100) m = byId[m.reply_to_message_id]; return m; }
        chat.messages.forEach(function (m) {
            if (!m || m.type !== "message") return;
            var t = textOf(m); if (!t) return;
            var at = tgTime(m), r = m.reply_to_message_id && byId[m.reply_to_message_id] ? rootOf(m) : null;
            if (r && r.id !== m.id && roots[r.id]) {
                var it = roots[r.id];
                it.rs.push({ t: t, at: at, by: "me" });
                if (/^\s*done\b/i.test(t)) { it.st = "done"; it.d = at; }
                if (at > it.u) it.u = at;
                return;
            }
            var done = /^\s*done\b/i.test(t);
            var item = { id: "tg" + cid + (+m.id).toString(36), k: kind, t: t, st: done ? "done" : "todo", star: false, note: "", rs: [], c: at, u: at, d: done ? at : 0, src: "telegram" };
            roots[m.id] = item; order.push(item);
        });
        return { name: String(chat.name || "Telegram chat"), kind: kind, items: order };
    }
    function fromTelegram(data) { return tgChats(data).map(function (c) { return fromTelegramChat(c); }); }

    /* JSON backup file: { app: "mes-edits", v: 1, saved, items } (a bare list of items is read too). */
    function backupText(items, now) { return JSON.stringify({ app: "mes-edits", v: 1, saved: new Date(now || Date.now()).toISOString(), items: items }, null, 1); }
    function readBackup(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.items)) return data.items;
        return null;
    }
    function ago(ms, now) {
        var s = Math.max(0, ((now || Date.now()) - ms) / 1000);
        if (s < 60) return "just now";
        if (s < 3600) return Math.floor(s / 60) + " min ago";
        if (s < 86400) return Math.floor(s / 3600) + " h ago";
        if (s < 86400 * 30) return Math.floor(s / 86400) + " d ago";
        var d = new Date(ms), o = { month: "short", day: "numeric" };
        if (d.getFullYear() !== new Date(now || Date.now()).getFullYear()) o.year = "numeric";
        return d.toLocaleDateString(undefined, o);
    }

    return {
        KINDS: KINDS, STATES: STATES, KIND_NAME: KIND_NAME, okKind: okKind, kindSlug: kindSlug, kindName: kindName, cleanMeta: cleanMeta, cleanName: cleanName, sortTabs: sortTabs, kindOne: kindOne, kindsOf: kindsOf, orderTabs: orderTabs,
        orderKey: orderKey, between: between, STATE_NAME: STATE_NAME, MAX_T: MAX_T, MAX_IMPORT: MAX_IMPORT,
        cleanText: cleanText, cleanItem: cleanItem, textKey: textKey, apply: apply, sortNewest: sortNewest,
        esc: esc, linkify: linkify, links: links, imageOf: imageOf, tools: tools, itemTools: itemTools, filter: filter, counts: counts,
        tgText: tgText, tgChats: tgChats, guessKind: guessKind, fromTelegramChat: fromTelegramChat, fromTelegram: fromTelegram,
        backupText: backupText, readBackup: readBackup, ago: ago
    };
});

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

    var pref = Object.assign({ k: "fix", st: "open", sort: "new", star: false, tool: "", cols: 1, picEdit: true }, lsJson(PREF, {}));
    var KINDS_KEY = "mes-edits:kinds";      /* the user's own lists that have no items yet */
    function userKinds() { var a = lsJson(KINDS_KEY, []); return Array.isArray(a) ? a.filter(E.okKind) : []; }
    var exp = {};           /* id -> true while "Show more" is open */
    var cache = lsJson(CACHE, null);
    var items = cache && Array.isArray(cache.items) ? cache.items : [];
    var meta = E.cleanMeta(cache && cache.meta);   /* list names (with the user's capitals), pinned lists, tab order mode: same on every device */
    function KN(k) { return E.kindName(k, meta.names); }
    function byName(a, b) { return KN(a).localeCompare(KN(b), undefined, { sensitivity: "base", numeric: true }); }
    var loadedAt = cache && cache.at || 0, online = null, busy = 0;
    var open = {};          /* id -> "edit" | "reply" while a box is open (refreshes then wait) */
    var pendingRender = false;
    function savePref() { lsSet(PREF, JSON.stringify(pref)); }
    function saveCache() { lsSet(CACHE, JSON.stringify({ items: items, meta: meta, at: loadedAt })); }

    function copyText(t) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallbackCopy(t); });
        return Promise.resolve(fallbackCopy(t));
    }
    function fallbackCopy(t) { var a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} a.remove(); return ok; }
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
                    if (method === "GET") return res({ items: E.sortNewest(Object.keys(m).map(function (k) { return m[k]; })), meta: E.cleanMeta(lsJson(MOCK + ":meta", null)) });
                    if (body && body.op === "meta") { var mm = E.cleanMeta(body.meta); lsSet(MOCK + ":meta", JSON.stringify(mm)); return res({ meta: mm }); }
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
            online = true; items = Array.isArray(j.items) ? j.items : []; if (j.meta) meta = E.cleanMeta(j.meta); loadedAt = Date.now(); saveCache();
            if (Object.keys(open).length || drag) pendingRender = true; else render();
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
    /* editable = pictures in the item's own text get a ✂ Edit button (crop / rotate / mark up, saved as a new picture) */
    function pics(t, editable) {
        var seen = {};
        return E.links(t).map(E.imageOf).filter(function (u) { if (!u || seen[u]) return false; seen[u] = 1; return true; }).slice(0, 6)
            .map(function (u) { return '<span class="ed-picw"><a class="ed-pic" href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Screenshot" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.parentNode.hidden=true"></a>'
                + (editable ? '<button type="button" class="ed-picedit" data-a="picedit" data-u="' + esc(u) + '" title="Crop, turn or mark up this picture">✂ Edit</button>' : "") + "</span>"; }).join("");
    }
    function moveSelect(it) {
        return '<select class="ed-mv" data-a="mv" aria-label="Move to another list"><option value="">⇄ Move to…</option>' + E.kindsOf(items, userKinds()).filter(function (k) { return k !== it.k; }).sort(byName)
            .map(function (k) { return '<option value="' + esc(k) + '">' + esc(KN(k)) + "</option>"; }).join("") + "</select>";
    }
    function stSelect(it) {
        return '<select class="ed-st" data-a="st" aria-label="Status">' + E.STATES.map(function (s) { return '<option value="' + s + '"' + (s === it.st ? " selected" : "") + ">" + E.STATE_NAME[s] + "</option>"; }).join("") + "</select>";
    }
    function itemHtml(it) {
        var tl = E.itemTools(it), mode = open[it.id];
        var h = '<li class="ed-it st-' + it.st + (it.star ? " is-star" : "") + (exp[it.id] ? " is-exp" : "") + '" data-id="' + esc(it.id) + '">';
        h += '<div class="ed-top"><button type="button" class="ed-grip" data-a="grip" title="Drag to change the order (or focus and press Alt+↑ / Alt+↓)" aria-label="Drag to change the order">⠿</button><button type="button" class="ed-star" data-a="star" aria-pressed="' + it.star + '" title="' + (it.star ? "Important (click to unmark)" : "Mark important") + '">' + (it.star ? "★" : "☆") + "</button>" + stSelect(it);
        if (pref.k === "queue") h += '<span class="ed-qn" title="Place in the queue">#' + (qPos[it.id] || "?") + "</span>";
        if (pref.k === "all" || pref.k === "queue") h += '<span class="ed-kind k-' + esc(it.k) + '">' + esc(E.kindOne(it.k)) + "</span>";
        h += tl.map(function (s) { return '<button type="button" class="ed-tool" data-a="tool" data-v="' + esc(s) + '" title="Show only items about mes.fm/' + esc(s) + '">/' + esc(s) + "</button>"; }).join("");
        h += '<span class="ed-sp"></span><span class="ed-when" title="Added ' + esc(fullDate(it.c)) + (it.d ? " · finished " + esc(fullDate(it.d)) : "") + '">' + esc(E.ago(it.c)) + (it.d ? " · " + (it.st === "done" ? "done " : "closed ") + esc(E.ago(it.d)) : "") + (it.src === "telegram" ? " · from Telegram" : "") + "</span></div>";
        if (mode === "edit") {
            h += '<textarea class="tu-input ed-ta ed-edt" data-f="t" rows="3" aria-label="Text">' + esc(it.t) + "</textarea>";
            h += '<label class="ed-sub">Note (what was done, why not, links)</label><textarea class="tu-input ed-ta ed-edn" data-f="note" rows="2" aria-label="Note">' + esc(it.note || "") + "</textarea>";
            h += '<div class="ed-acts"><button type="button" class="tu-btn tu-btn--primary" data-a="save">Save</button><button type="button" class="tu-btn tu-btn--ghost" data-a="editpic" title="Add a screenshot or photo to this text (you can also paste one)">&#128247;&#xFE0E; Picture</button><button type="button" class="tu-btn tu-btn--ghost" data-a="cancel">Cancel</button></div>';
        } else {
            h += '<div class="ed-txt">' + E.linkify(it.t) + '</div><button type="button" class="ed-more-btn" data-a="more" hidden>' + (exp[it.id] ? "Show less ▴" : "Show more ▾") + "</button>";
            var p = pics(it.t, true); if (p) h += '<div class="ed-pics">' + p + "</div>";
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
                + '<button type="button" class="tu-btn tu-btn--ghost" data-a="copy" title="Copy the text of this item">📋 Copy</button><button type="button" class="tu-btn tu-btn--ghost" data-a="reply">💬 Reply</button><button type="button" class="tu-btn tu-btn--ghost" data-a="edit">✎ Edit</button>'
                + moveSelect(it) + '<button type="button" class="tu-btn tu-btn--ghost ed-del" data-a="del" title="Delete">🗑</button></div>';
        }
        return h + "</li>";
    }
    function paintTools() {
        var sel = $("ed-tool"), cnt = {};
        items.forEach(function (it) { if (pref.k !== "all" && pref.k !== "queue" && it.k !== pref.k) return; E.itemTools(it).forEach(function (s) { cnt[s] = (cnt[s] || 0) + 1; }); });
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
        var c = E.counts(items), kinds = E.kindsOf(items, userKinds());
        if (pref.k !== "all" && pref.k !== "queue" && kinds.indexOf(pref.k) < 0) pref.k = "fix";
        paintTabs(kinds, c);
        var ks = $("ed-kind"), kh = kinds.slice().sort(byName).map(function (k) { return '<option value="' + esc(k) + '">' + esc(KN(k)) + "</option>"; }).join("");
        if (ks.__html !== kh) { var kv = ks.value; ks.innerHTML = kh; ks.__html = kh; if (kv) ks.value = kv; }
        if (window.MESSelect && !ks.__ss && ks.options.length >= 10) MESSelect.enhance(ks, { placeholder: "Find a list…", noun: "lists" });
        root.querySelectorAll(".ed-chip").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.st === pref.st ? "true" : "false"); });
        $("ed-addlbl").textContent = pref.k === "app" ? "New app idea" : pref.k === "fix" ? "New fix" : pref.k === "mirror" ? "New mirror to make" : pref.k === "all" || pref.k === "queue" ? "New item" : "New item in " + KN(pref.k);
        $("ed-listact").hidden = !isUserList(pref.k);
        $("ed-fstar").checked = !!pref.star; $("ed-sort").value = pref.sort; $("ed-sort").disabled = pref.k === "queue";
        $("ed-cols").value = String(pref.cols || 1); $("ed-picedit-on").checked = pref.picEdit !== false;
        paintTools();
        var f = { k: pref.k, st: pref.st, sort: pref.sort, star: pref.star, tool: pref.tool, q: $("ed-q").value };
        var list = E.filter(items, f);
        var L = $("ed-list");
        L.innerHTML = list.map(itemHtml).join("");
        L.className = "ed-list cols-" + (pref.cols || 1);
        paintMore();
        var em = $("ed-empty");
        em.hidden = list.length > 0;
        if (!list.length) em.textContent = !items.length ? (online === false ? "Can't reach mes.fm and there's no saved copy in this browser yet." : online ? "Nothing here yet. Add the first one above, or bring the Telegram groups over (bottom of the page)." : "Loading…") : "Nothing matches. Try “Everything” or clear the search.";
        var where = pref.k === "all" ? "" : pref.k === "queue" ? " queued" : pref.k === "app" ? " new-app ideas" : pref.k === "fix" ? " fixes" : " in " + KN(pref.k);
        $("ed-count").textContent = items.length ? list.length + where + " shown" + (pref.st === "open" ? " (open)" : pref.st === "all" ? "" : " (" + E.STATE_NAME[pref.st].toLowerCase() + ")") : "";
        $("ed-count").hidden = !items.length;
    }

    /* ---------- add ---------- */
    function grow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.6) + "px"; }
    function add() {
        var ta = $("ed-t"), t = ta.value.trim();
        if (!t) { ta.focus(); return; }
        var k = $("ed-kind").value || (pref.k === "all" || pref.k === "queue" ? "fix" : pref.k);
        change({ op: "add", k: k, t: t, star: $("ed-star").checked }).then(function (r) {
            if (!r) return;
            if (pref.k === "queue" && r.item) { var ql = queueList().filter(function (x) { return x.id !== r.item.id; }); change({ op: "update", id: r.item.id, qo: (ql.length ? ql[ql.length - 1].qo : 0) + 1 }); }
            toast("Added to " + KN(k) + (pref.k === "queue" ? " and the queue" : ""));
        });
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
    /* The shared picture editor (crop, turn, straighten, pen, highlighter, white-out), loaded on first use. */
    var prepP = null;
    function prep() {
        if (window.MESPhotoPrep) return Promise.resolve(window.MESPhotoPrep);
        if (!prepP) prepP = new Promise(function (res, rej) {
            var sc = document.createElement("script"); sc.src = "/main_js/photo-prep.js?v=2"; sc.async = true;
            sc.onload = function () { window.MESPhotoPrep ? res(window.MESPhotoPrep) : rej(new Error("editor missing")); };
            sc.onerror = function () { prepP = null; rej(new Error("Could not load the picture editor.")); };
            document.head.appendChild(sc);
        });
        return prepP;
    }
    /* Returns the picture to upload: the edited one, the original (editor turned off or failed), or null (Cancel). */
    function maybeEdit(file, i, n) {
        if (pref.picEdit === false) return Promise.resolve(file);
        return prep().then(function (P) {
            return P.open(file, { title: n > 1 ? "Picture " + (i + 1) + " of " + n : "Crop or mark up the picture", done: "Add this picture", mime: "image/jpeg", quality: 0.9, maxSide: 2400 })
                .then(function (r) { return r ? r.blob : null; });
        }, function () { return file; });
    }
    function upload(blob) { return shrink(blob).then(function (d) { return call("POST", { op: "img", data: d }); }); }
    function addPictures(files, ta) {
        files = [].slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
        if (!files.length) return false;
        if (LOCAL) { toast("Pictures are saved on mes.fm itself: try it on the live page"); if (pref.picEdit !== false) maybeEdit(files[0], 0, 1); return true; }
        var n = files.length, added = 0;
        files.reduce(function (p, f, i) {
            return p.then(function () { return maybeEdit(f, i, n); }).then(function (b) {
                if (!b) return;
                toast("Adding the picture…");
                return upload(b).then(function (j) { if (j && j.url) { insertAt(ta, j.url); added++; } });
            });
        }, Promise.resolve()).then(function () { if (added) toast(added > 1 ? added + " pictures added to the text" : "Picture added to the text"); ta.focus(); }, function (e) { toast("Could not add the picture: " + (e && e.message || e)); });
        return true;
    }
    /* ✂ Edit on a picture already in an item: open it in the editor, save the result as a new picture and swap the link in the text. */
    function editPicture(it, u) {
        toast("Opening the picture…");
        var load = fetch(u, { credentials: "same-origin", mode: "cors" }).then(function (r) { if (!r.ok) throw new Error("answered " + r.status); return r.blob(); });
        Promise.all([prep(), load]).then(function (a) {
            return a[0].open(a[1], { title: "Edit picture", done: "Save the picture", mime: "image/jpeg", quality: 0.9, maxSide: 2400 });
        }).then(function (r) {
            if (!r) return;
            if (!r.edited) { toast("No changes."); return; }
            if (LOCAL) { toast("Pictures are saved on mes.fm itself: try it on the live page"); return; }
            toast("Saving the picture…");
            return upload(r.blob).then(function (j) {
                if (!j || !j.url) throw new Error("no link came back");
                var cur = items[byId(it.id)] || it, old = cur.t, nu = j.url, t = old;
                E.links(old).forEach(function (l) { if (E.imageOf(l) === u) t = t.split(l).join(nu); });
                if (t === old) { toast("Saved, but that link wasn't found in the text: " + nu); return; }
                return change({ op: "update", id: it.id, t: t }).then(function (x) { if (x) toast("Picture saved", function () { change({ op: "update", id: it.id, t: old }); }); });
            });
        }).catch(function (e) { toast("Could not open the picture (" + (e && e.message || e) + "). Pictures from other sites may not allow it: download it and add it with 📷 Picture."); });
    }
    $("ed-picbtn").onclick = function () { $("ed-picin").click(); };
    var editPicTa = null;
    $("ed-picin2").onchange = function () { if (editPicTa && document.body.contains(editPicTa)) addPictures(this.files, editPicTa); this.value = ""; };
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
    /* Tab order: drag a tab (mouse, finger or pen) to move it, or Alt+Left / Alt+Right on a focused tab. Saved in this browser. */
    var ORDER_KEY = "mes-edits:taborder", tabDrag = null, tabDragged = 0;
    function saveTabOrder() { lsSet(ORDER_KEY, JSON.stringify([].map.call($("ed-tablist").querySelectorAll(".ed-tab[data-k]"), function (b) { return b.dataset.k; }))); $("ed-tablist").__html = null; }
    /* Smooth drag: the held tab follows the finger, the others glide to their new places (FLIP). Places are read from layout
       (offsetLeft / offsetTop), never from the moving pictures, so a tab can't flip back and forth while the others are still gliding. */
    function tabBox(t) {   // where the element sits in the layout: its box minus whatever translate it shows right now (also mid-glide)
        var q = t.getBoundingClientRect(), m = getComputedStyle(t).transform, tx = 0, ty = 0;
        if (m && m !== "none") { var v = m.match(/-?[\d.e]+/g).map(Number); if (v.length === 6) { tx = v[4]; ty = v[5]; } else if (v.length === 16) { tx = v[12]; ty = v[13]; } }
        return { l: q.left - tx, t: q.top - ty, w: q.width, h: q.height };
    }
    function followTab(d, x, y) { var r = tabBox(d.b); d.b.style.transform = "translate(" + (x - d.ox - r.l) + "px," + (y - d.oy - r.t) + "px)"; }
    $("ed-tablist").addEventListener("pointerdown", function (e) {
        var b = e.target.closest(".ed-tab[data-k]"); if (!b || e.button > 0) return;
        var r = tabBox(b); tabDrag = { b: b, x: e.clientX, y: e.clientY, ox: e.clientX - r.l, oy: e.clientY - r.t, on: false, id: e.pointerId };
    });
    document.addEventListener("pointermove", function (e) {
        var d = tabDrag; if (!d || e.pointerId !== d.id) return;
        if (!d.on) { if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 8) return; d.on = true; d.b.classList.add("ed-tabdrag"); try { d.b.setPointerCapture(e.pointerId); } catch (er) {} }
        e.preventDefault();
        var box = $("ed-tablist"), tabs = [].slice.call(box.querySelectorAll(".ed-tab[data-k]")), best = null, bd = 1e9, cx = e.clientX - d.ox + d.b.offsetWidth / 2, cy = e.clientY - d.oy + d.b.offsetHeight / 2;
        tabs.forEach(function (t) { if (t === d.b) return; var r = tabBox(t); var dist = Math.hypot(cx - (r.l + r.w / 2), (cy - (r.t + r.h / 2)) * 2); if (dist < bd) { bd = dist; best = t; } });
        if (best) {
            var r = tabBox(best), after = cx > r.l + r.w / 2, ref = after ? best.nextSibling : best;
            if (after ? best.nextElementSibling !== d.b : best.previousElementSibling !== d.b) {
                var before = new Map(); tabs.forEach(function (t) { if (t !== d.b) { var q = t.getBoundingClientRect(); before.set(t, q); } });
                box.insertBefore(d.b, ref);
                tabs.forEach(function (t) {
                    if (t === d.b) return; var q0 = before.get(t), q1; t.style.transition = "none"; t.style.transform = ""; q1 = t.getBoundingClientRect();
                    var dx = q0.left - q1.left, dy = q0.top - q1.top; if (!dx && !dy) { t.style.transition = ""; return; }
                    t.style.transform = "translate(" + dx + "px," + dy + "px)"; void t.offsetWidth;
                    t.style.transition = "transform .18s ease"; t.style.transform = "";
                });
            }
        }
        followTab(d, e.clientX, e.clientY);
    }, { passive: false });
    function endTabDrag(e) {
        var d = tabDrag; if (!d || (e && e.pointerId !== d.id)) return; tabDrag = null;
        if (d.on) {
            d.b.classList.remove("ed-tabdrag"); d.b.style.transition = "transform .16s ease"; d.b.style.transform = "";
            setTimeout(function () { d.b.style.transition = ""; }, 200);
            tabDragged = Date.now(); saveTabOrder();
            var dom = [].map.call($("ed-tablist").querySelectorAll(".ed-tab[data-k]"), function (b) { return b.dataset.k; });
            meta.pins = dom.filter(function (k) { return meta.pins.indexOf(k) >= 0; });
            if (meta.mode === "az") { meta.mode = "custom"; saveMeta("Switched to your own order: tab order saved."); } else if (meta.pins.length) saveMeta("Tab order saved."); else toast("Tab order saved (in this browser).");
        }
    }
    document.addEventListener("pointerup", endTabDrag); document.addEventListener("pointercancel", endTabDrag);
    $("ed-tablist").addEventListener("keydown", function (e) {
        var b = e.target.closest(".ed-tab[data-k]"); if (!b || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        e.preventDefault(); var box = $("ed-tablist"), tabs = [].slice.call(box.querySelectorAll(".ed-tab[data-k]")), i = tabs.indexOf(b);
        if (e.key === "ArrowLeft" && i > 0) box.insertBefore(b, tabs[i - 1]); else if (e.key === "ArrowRight" && i < tabs.length - 1) box.insertBefore(b, tabs[i + 1].nextSibling);
        b.focus(); saveTabOrder();
    });
    root.querySelector(".ed-tabs").addEventListener("click", function (e) {
        if (Date.now() - tabDragged < 400) { e.preventDefault(); return; }
        if (e.target.closest("#ed-newlist")) { newList(); return; }
        var b = e.target.closest(".ed-tab"); if (!b) return; pref.k = b.dataset.k; pref.tool = ""; savePref(); render(); syncKind();
    });
    function paintTabs(kinds, c) {
        var box = $("ed-tablist"), many = kinds.length + 2 > 9, find = $("ed-tfind"), q = many ? E.kindSlug(find.value).replace(/-/g, "") : "";
        $("ed-tfwrap").hidden = !many;
        var tab = function (k, label) { var pin = meta.pins.indexOf(k) >= 0; return '<button type="button" role="tab" class="ed-tab' + (pin ? " is-pin" : "") + '" title="' + (meta.mode === "az" ? "Lists are A-Z (switch to My order to drag)" : "Drag to change the order (or Alt + ← →)") + '" data-k="' + esc(k) + '" aria-selected="' + (k === pref.k) + '">' + (pin ? '<span class="ed-pinmk" aria-label="pinned">📌</span>' : "") + label + ' <span class="ed-n">' + (c[k] || "") + "</span></button>"; };
        var ICON = { fix: "🔧 ", app: "💡 ", mirror: "🪞 ", other: "🗒 " };
        var keys = E.sortTabs(kinds.concat(["all", "queue"]), meta, lsJson(ORDER_KEY, []));
        if (q) keys = keys.filter(function (k) { var n = k === "all" ? "all" : k === "queue" ? "queue" : KN(k); return k === pref.k || E.kindSlug(n).replace(/-/g, "").indexOf(q) >= 0 || k.replace(/[-\/]/g, "").indexOf(q) >= 0; });
        var h = keys.map(function (k) { return k === "all" ? tab("all", "All") : k === "queue" ? tab("queue", "📋 Queue") : tab(k, (meta.pins.indexOf(k) >= 0 ? "" : ICON[k] || "🗂 ") + esc(KN(k))); }).join("")
            + '<button type="button" class="ed-tab ed-tabnew" id="ed-newlist" title="Make a list of your own">＋ List</button>';
        if (box.__html !== h) { box.innerHTML = h; box.__html = h; }
        var pb = $("ed-tpin"), on = meta.pins.indexOf(pref.k) >= 0;
        pb.textContent = on ? "📌 Unpin" : "📌 Pin"; pb.setAttribute("aria-pressed", on ? "true" : "false");
        pb.title = (on ? "Unpin “" : "Pin “") + (pref.k === "all" ? "All" : pref.k === "queue" ? "Queue" : KN(pref.k)) + "” " + (on ? "" : "(pinned lists always come first)");
        $("ed-torder").value = meta.mode;
    }
    function saveMeta(msg) {
        meta = E.cleanMeta(meta); saveCache(); $("ed-tablist").__html = null; render();
        call("POST", { op: "meta", meta: meta }).then(function (j) { if (j && j.meta) { meta = E.cleanMeta(j.meta); saveCache(); } if (msg) toast(msg); })
            .catch(function (e) { toast(e.message || "Couldn't save the list settings"); });
    }
    /* What the user typed as a list name, kept when it differs from the plain one made from the slug (so "AI" stays "AI", not "Ai"). */
    function keepName(k, typed) { var n = E.cleanName(typed); if (n && E.kindSlug(n) === k && n !== E.kindName(k)) meta.names[k] = n; else delete meta.names[k]; }
    $("ed-tpin").onclick = function () {
        var k = pref.k, i = meta.pins.indexOf(k);
        if (i >= 0) meta.pins.splice(i, 1); else meta.pins.push(k);
        saveMeta(i >= 0 ? "Unpinned" : "Pinned: it now comes first");
    };
    $("ed-torder").onchange = function () { meta.mode = this.value === "az" ? "az" : "custom"; saveMeta(meta.mode === "az" ? "Lists sorted A-Z" : "Your own order (drag the tabs)"); };
    $("ed-tfind").addEventListener("input", function () { render(); });
    $("ed-tfind").addEventListener("keydown", function (e) {
        if (e.key === "Escape") { this.value = ""; render(); }
        if (e.key === "Enter") { var b = $("ed-tablist").querySelector(".ed-tab[data-k]:not([aria-selected=true])"); if (b) { b.click(); } }
    });
    function syncKind() { if (pref.k !== "all" && pref.k !== "queue") { var ks = $("ed-kind"); if ([].some.call(ks.options, function (o) { return o.value === pref.k; })) ks.value = pref.k; } }
    function isUserList(k) { return k !== "all" && k !== "queue" && E.KINDS.indexOf(k) < 0; }
    function saveKinds(a) { lsSet(KINDS_KEY, JSON.stringify(a)); }
    /* Rename: every item moves to the new list slug (the name shown is made from it). */
    $("ed-rename").onclick = function () {
        var old = pref.k; if (!isUserList(old)) return;
        var name = prompt("New name for the list “" + KN(old) + "” (letters, digits, spaces and / are fine, e.g. 9/11):", KN(old));
        if (name == null) return;
        var k = E.kindSlug(name);
        if (!E.okKind(k)) { toast("Use at least two characters for the name."); return; }
        if (k === old) { if (E.cleanName(name) !== KN(old)) { keepName(k, name); saveMeta("Renamed to “" + KN(k) + "”"); } else toast("That is already its name."); return; }
        if (E.kindsOf(items, userKinds()).indexOf(k) >= 0) { toast("There is already a list called “" + KN(k) + "”."); return; }
        var ids = items.filter(function (it) { return it.k === old; }).map(function (it) { return it.id; });
        var u = userKinds().filter(function (x) { return x !== old; }); u.push(k); saveKinds(u);
        keepName(k, name); delete meta.names[old]; meta.pins = meta.pins.map(function (x) { return x === old ? k : x; }); saveMeta();
        pref.k = k; savePref();
        ids.reduce(function (p, id) { return p.then(function () { return change({ op: "update", id: id, k: k }); }); }, Promise.resolve()).then(function () { render(); syncKind(); toast("Renamed to “" + KN(k) + "”" + (ids.length ? " (" + ids.length + " items moved)" : "")); });
    };
    /* Delete: items move to another list first (asked), nothing is lost. */
    $("ed-dellist").onclick = function () {
        var old = pref.k; if (!isUserList(old)) return;
        var ids = items.filter(function (it) { return it.k === old; }).map(function (it) { return it.id; });
        var to = "other";
        if (ids.length) {
            var opts = E.kindsOf(items, userKinds()).filter(function (x) { return x !== old; });
            var a = prompt("The list “" + KN(old) + "” has " + ids.length + " items. Type the list they should move to:\n" + opts.map(KN).join(", "), KN("other"));
            if (a == null) return;
            to = opts.filter(function (x) { return KN(x).toLowerCase() === a.trim().toLowerCase() || x === E.kindSlug(a); })[0];
            if (!to) { toast("No list called “" + a + "”. Nothing changed."); return; }
        }
        if (!confirm("Delete the list “" + KN(old) + "”" + (ids.length ? " and move its " + ids.length + " items to “" + KN(to) + "”" : "") + "?")) return;
        saveKinds(userKinds().filter(function (x) { return x !== old; }));
        pref.k = to; savePref();
        ids.reduce(function (p, id) { return p.then(function () { return change({ op: "update", id: id, k: to }); }); }, Promise.resolve()).then(function () { render(); syncKind(); toast("List deleted" + (ids.length ? ", items moved to " + KN(to) : "")); });
    };
    function newList() {
        var name = prompt("Name of the new list (for example: Hive posts, Ideas for later):", "");
        if (name == null) return;
        var k = E.kindSlug(name);
        if (!E.okKind(k)) { toast("Use at least two characters for the name."); return; }
        var u = userKinds(); if (u.indexOf(k) < 0 && E.KINDS.indexOf(k) < 0) { u.push(k); lsSet(KINDS_KEY, JSON.stringify(u)); }
        if (E.KINDS.indexOf(k) < 0) { keepName(k, name); saveMeta(); }
        pref.k = k; pref.tool = ""; savePref(); render(); syncKind(); $("ed-t").focus();
        toast("New list “" + KN(k) + "”: add its first item above.");
    }
    /* "Move to…" gets a search box once there are 10+ lists (site rule): turned into a searchable list on first press. */
    $("ed-list").addEventListener("pointerdown", function (e) {
        var sel = e.target.closest && e.target.closest("select.ed-mv"); if (!sel || sel.__ss || sel.options.length < 10 || !window.MESSelect) return;
        e.preventDefault(); MESSelect.enhance(sel, { placeholder: "Find a list…", noun: "lists" });
        var b = sel.parentNode.querySelector(".ss-btn"); if (b) setTimeout(function () { b.click(); }, 0);
    });
    $("ed-cols").onchange = function () { pref.cols = +this.value || 1; savePref(); render(); };
    $("ed-picedit-on").onchange = function () { pref.picEdit = this.checked; savePref(); };
    root.querySelector(".ed-chips").addEventListener("click", function (e) { var b = e.target.closest(".ed-chip"); if (!b) return; pref.st = b.dataset.st; savePref(); render(); });
    $("ed-fstar").onchange = function () { pref.star = this.checked; savePref(); render(); };
    $("ed-sort").onchange = function () { pref.sort = this.value; savePref(); render(); };
    $("ed-tool").onchange = function () { pref.tool = this.value; savePref(); render(); };
    var qT = 0; $("ed-q").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(render, 120); });
    $("ed-q").addEventListener("keydown", function (e) { if (e.key === "Escape") { this.value = ""; render(); } });

    /* ---------- item actions ---------- */
    function closeBox(id) { delete open[id]; if (pendingRender) load(true); render(); }
    $("ed-list").addEventListener("change", function (e) {
        var mv = e.target.closest(".ed-mv");
        if (mv) {
            var mid = mv.closest(".ed-it").dataset.id, old = items[byId(mid)], to = mv.value; if (!to || !old) return;
            var from = old.k;
            change({ op: "update", id: mid, k: to }).then(function (r) { if (r) toast("Moved to " + KN(to), function () { change({ op: "update", id: mid, k: from }); }); });
            return;
        }
        var s = e.target.closest(".ed-st"); if (!s) return;
        var id = s.closest(".ed-it").dataset.id;
        change({ op: "update", id: id, st: s.value });
    });
    $("ed-list").addEventListener("click", function (e) {
        var b = e.target.closest("[data-a]"); if (!b || b.tagName === "SELECT" || b.dataset.a === "grip") return;
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
        else if (a === "more") { if (exp[id]) delete exp[id]; else exp[id] = true; li.classList.toggle("is-exp", !!exp[id]); b.textContent = exp[id] ? "Show less ▴" : "Show more ▾"; if (!exp[id]) li.scrollIntoView({ block: "nearest" }); }
        else if (a === "picedit") editPicture(it, b.dataset.u);
        else if (a === "copy") copyText(it.t + (it.note ? "\n\nNote: " + it.note : "")).then(function (ok) { toast(ok ? "Copied" : "Couldn't copy: select the text and press Ctrl+C"); });
        else if (a === "tool") { pref.tool = b.dataset.v; savePref(); render(); window.scrollTo({ top: root.querySelector(".ed-bar").getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" }); }
        else if (a === "edit" || a === "reply") {
            open[id] = a; render();
            var ta = $("ed-list").querySelector('.ed-it[data-id="' + id + '"] textarea'); if (ta) { grow(ta); ta.focus(); if (a === "edit") ta.setSelectionRange(ta.value.length, ta.value.length); }
        }
        else if (a === "editpic") { editPicTa = li.querySelector('[data-f="t"]'); $("ed-picin2").click(); }
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

    /* ---------- long text: Show more / less ---------- */
    function paintMore() {
        $("ed-list").querySelectorAll(".ed-it").forEach(function (li) {
            var tx = li.querySelector(".ed-txt"), b = li.querySelector(".ed-more-btn"); if (!tx || !b) return;
            if (li.classList.contains("is-exp")) { b.hidden = false; return; }
            b.hidden = tx.scrollHeight <= tx.clientHeight + 4;
        });
    }
    var moreT = 0; window.addEventListener("resize", function () { clearTimeout(moreT); moreT = setTimeout(paintMore, 150); });

    /* ---------- drag to sort: the Queue sets its order (qo), every other list "My order" (o) ---------- */
    function shownIds() { return [].map.call($("ed-list").querySelectorAll(".ed-it"), function (li) { return li.dataset.id; }); }
    /* Save where id now sits among ids (the order on screen). */
    function placeAt(id, ids) {
        var i = ids.indexOf(id); if (i < 0) return;
        var q = pref.k === "queue", key = function (x) { var it = items[byId(x)]; return !it ? null : q ? it.qo : E.orderKey(it); };
        var prev = i > 0 ? key(ids[i - 1]) : null, next = i < ids.length - 1 ? key(ids[i + 1]) : null;
        var v = E.between(prev, next, q), it = items[byId(id)];
        if (!it || (q ? it.qo : E.orderKey(it)) === v) { render(); return; }
        var body = { op: "update", id: id }; body[q ? "qo" : "o"] = v;
        var oldV = q ? it.qo : it.o;
        change(body).then(function (r) { if (r) toast(q ? "Queue order saved (#" + (i + 1) + ")" : "Order saved", function () { var u = { op: "update", id: id }; u[q ? "qo" : "o"] = oldV == null ? null : oldV; change(u); }); });
    }
    function toMine() {
        if (pref.k === "queue" || pref.sort === "mine") return false;
        pref.sort = "mine"; savePref(); render(); toast("Sorted by “My order” so you can drag (change it in Sort).");
        return true;
    }
    var drag = null;
    $("ed-list").addEventListener("pointerdown", function (e) {
        var g = e.target.closest(".ed-grip"); if (!g || e.button > 0) return;
        e.preventDefault();
        var id = g.closest(".ed-it").dataset.id;
        if (toMine()) g = $("ed-list").querySelector('.ed-it[data-id="' + id + '"] .ed-grip');
        var li = g.closest(".ed-it"), r = li.getBoundingClientRect();
        var ph = document.createElement("li"); ph.className = "ed-ph"; ph.style.height = r.height + "px";
        li.parentNode.insertBefore(ph, li);
        li.classList.add("is-drag"); li.style.width = r.width + "px"; li.style.left = r.left + "px"; li.style.top = r.top + "px";
        drag = { id: id, li: li, ph: ph, dx: e.clientX - r.left, dy: e.clientY - r.top, pid: e.pointerId, x: e.clientX, y: e.clientY };
        try { g.setPointerCapture(e.pointerId); } catch (x) {}
        autoScroll();
    });
    function dragTo(x, y) {
        var d = drag; d.x = x; d.y = y;
        d.li.style.left = (x - d.dx) + "px"; d.li.style.top = (y - d.dy) + "px";
        var others = [].filter.call($("ed-list").children, function (c) { return c !== d.li && c !== d.ph; }), before = null;
        for (var i = 0; i < others.length; i++) {
            var q = tabBox(others[i]), b = { top: q.t, bottom: q.t + q.h, left: q.l, right: q.l + q.w, width: q.w, height: q.h };   // layout place, not the gliding picture
            if (y < b.top || (y <= b.bottom && x < b.left + b.width / 2 && y < b.top + b.height * 0.75) || (y < b.top + b.height / 2 && x <= b.right)) { before = others[i]; break; }
        }
        var list = $("ed-list"), move = before ? d.ph.nextSibling !== before : list.lastChild !== d.ph;
        if (!move) return;
        var r0 = new Map(); others.forEach(function (c) { r0.set(c, c.getBoundingClientRect()); });
        if (before) list.insertBefore(d.ph, before); else list.appendChild(d.ph);
        others.forEach(function (c) {   // the other cards glide to their new places
            var a = r0.get(c); c.style.transition = "none"; c.style.transform = ""; var z = c.getBoundingClientRect(), dx = a.left - z.left, dy = a.top - z.top;
            if (!dx && !dy) { c.style.transition = ""; return; }
            c.style.transform = "translate(" + dx + "px," + dy + "px)"; void c.offsetWidth; c.style.transition = "transform .18s ease"; c.style.transform = "";
        });
    }
    function autoScroll() {
        if (!drag) return;
        var y = drag.y, h = window.innerHeight, v = y < 80 ? -(80 - y) / 4 : y > h - 80 ? (y - h + 80) / 4 : 0;
        if (v) { window.scrollBy(0, v); dragTo(drag.x, drag.y); }
        requestAnimationFrame(autoScroll);
    }
    document.addEventListener("pointermove", function (e) { if (drag && e.pointerId === drag.pid) { e.preventDefault(); dragTo(e.clientX, e.clientY); } }, { passive: false });
    function endDrag(e, cancel) {
        if (!drag || (e && e.pointerId !== drag.pid)) return;
        var d = drag; drag = null;
        d.li.classList.remove("is-drag"); d.li.style.width = d.li.style.left = d.li.style.top = "";
        if (cancel) { d.ph.remove(); render(); return; }
        d.ph.parentNode.replaceChild(d.li, d.ph);
        if (pendingRender) { load(true); }
        placeAt(d.id, shownIds());
    }
    document.addEventListener("pointerup", function (e) { endDrag(e); });
    document.addEventListener("pointercancel", function (e) { endDrag(e, true); });
    document.addEventListener("keydown", function (e) { if (drag && e.key === "Escape") endDrag({ pointerId: drag.pid }, true); });
    $("ed-list").addEventListener("keydown", function (e) {
        var g = e.target.closest && e.target.closest(".ed-grip");
        if (!g || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        var id = g.closest(".ed-it").dataset.id; toMine();
        var ids = shownIds(), i = ids.indexOf(id), j = e.key === "ArrowUp" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= ids.length) return;
        ids.splice(i, 1); ids.splice(j, 0, id); placeAt(id, ids);
        setTimeout(function () { var ng = $("ed-list").querySelector('.ed-it[data-id="' + id + '"] .ed-grip'); if (ng) ng.focus(); }, 30);
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
    render(); syncKind(); paintSync(); load();
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !busy) load(true); });
    setInterval(function () { if (!document.hidden && !busy) load(true); }, 60000);
    window.MESEditsDebug = { items: function () { return items; }, load: load, change: change, local: LOCAL };
})();
