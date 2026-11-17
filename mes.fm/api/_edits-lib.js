/* MES Edits: pure logic shared by the page (mes.fm/edits) and the server (mes.fm/api/edits.js requires a byte-identical copy,
   mes.fm/api/_edits-lib.js: cp after editing; the tests check). No DOM, no network.
   Item = { id, k: "fix"|"app", t, st: "todo"|"doing"|"done"|"wont", star, note, rs: [{ t, at, by }], c, u, d, src? } (c / u / d = ms). */
(function (root, factory) {
    var E = factory();
    if (typeof module === "object" && module.exports) module.exports = E;
    else root.MESEdits = E;
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";
    var MAX_ITEMS = 5000, MAX_T = 6000, MAX_NOTE = 3000, MAX_R = 3000, MAX_RS = 60, MAX_IMPORT = 2000;
    var KINDS = ["fix", "app"], STATES = ["todo", "doing", "done", "wont"], BYS = ["me", "claude"];
    var KIND_NAME = { fix: "Fixes", app: "New apps" };
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
            id: okId(x.id) ? x.id : randId(), k: KINDS.indexOf(x.k) >= 0 ? x.k : "fix", t: t, st: st, star: !!x.star,
            note: cleanText(x.note, MAX_NOTE),
            rs: (Array.isArray(x.rs) ? x.rs : []).map(function (r) { return cleanReply(r, c); }).filter(Boolean).slice(-MAX_RS),
            c: c, u: num(x.u, c), d: st === "done" || st === "wont" ? num(x.d, num(x.u, c)) : 0
        };
        if (typeof x.src === "string" && /^[a-z0-9:_-]{1,40}$/i.test(x.src)) it.src = x.src;
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
            it = { id: randId(), k: KINDS.indexOf(body.k) >= 0 ? body.k : "fix", t: t, st: "todo", star: !!body.star, note: "", rs: [], c: now, u: now, d: 0 };
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
                if (body.k != null) { if (KINDS.indexOf(body.k) < 0) return { status: 400, body: { error: "bad kind" } }; it.k = body.k; }
                if (body.st != null) {
                    if (STATES.indexOf(body.st) < 0) return { status: 400, body: { error: "bad status" } };
                    if (body.st !== it.st) it.d = body.st === "done" || body.st === "wont" ? now : 0;
                    it.st = body.st;
                }
                if (body.star != null) it.star = !!body.star;
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
            if (f.k && f.k !== "all" && it.k !== f.k) return false;
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
        var s = f.sort || "new";
        out.sort(function (a, b) {
            if (s === "star" && a.star !== b.star) return a.star ? -1 : 1;
            if (s === "star" && (a.st === "doing") !== (b.st === "doing")) return a.st === "doing" ? -1 : 1;
            if (s === "old") return a.c - b.c;
            if (s === "upd") return b.u - a.u;
            return b.c - a.c;
        });
        return out;
    }
    function counts(items) {
        var c = { fix: 0, app: 0, all: 0, todo: 0, doing: 0, done: 0, wont: 0 };
        items.forEach(function (it) { c[it.st]++; if (it.st === "todo" || it.st === "doing") { c[it.k]++; c.all++; } });
        return c;
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
    function guessKind(name) { return /new ?apps?|ideas?/i.test(String(name || "")) ? "app" : "fix"; }
    function tgTime(m) { var u = +m.date_unixtime; if (u > 0) return u * 1000; var d = Date.parse(m.date || ""); return isNaN(d) ? 0 : d; }
    /* chat -> { name, kind, items: [...] } (items not yet cleaned by cleanItem). */
    function fromTelegramChat(chat, kind) {
        kind = KINDS.indexOf(kind) >= 0 ? kind : guessKind(chat.name);
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
        KINDS: KINDS, STATES: STATES, KIND_NAME: KIND_NAME, STATE_NAME: STATE_NAME, MAX_T: MAX_T, MAX_IMPORT: MAX_IMPORT,
        cleanText: cleanText, cleanItem: cleanItem, textKey: textKey, apply: apply, sortNewest: sortNewest,
        esc: esc, linkify: linkify, links: links, imageOf: imageOf, tools: tools, itemTools: itemTools, filter: filter, counts: counts,
        tgText: tgText, tgChats: tgChats, guessKind: guessKind, fromTelegramChat: fromTelegramChat, fromTelegram: fromTelegram,
        backupText: backupText, readBackup: readBackup, ago: ago
    };
});
