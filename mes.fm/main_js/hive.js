/* MESHive: the shared Hive helpers for mes.fm pages (window.MESHive; also require()-able in node for tests).

   - Login with Hive Keychain: requestSignBuffer() on the Posting key proves the person controls the account (Keychain only
     signs for an account whose key is in the wallet). The username (+ the public key that signed) is kept in localStorage
     "mes-hive-user"; nothing is sent to mes.fm. Logout just forgets it. Every Keychain call goes through signer(), so a
     HiveAuth signer can be added later beside the Keychain one without touching the pages that use this module.
   - call(method, params): Hive JSON-RPC with node fallbacks (api.hive.blog, api.deathwing.me, api.openhive.network,
     hive-api.arcange.eu), 7 s per node, the last node that answered is tried first.
   - render(md): a SAFE markdown -> HTML renderer for Hive post / comment bodies. Everything is escaped first, then a strict
     allowlist is rebuilt: paragraphs, headings, links (rel="nofollow ugc noopener", http(s) only), images (only through the
     https://images.hive.blog/<w>x0/<url> proxy), inline code / code blocks, quotes, lists, bold / italic / strike, hr.
     Raw HTML in the body is NOT passed through: <img>, <a>, <br> and block tags are turned into their markdown meaning,
     every other tag is dropped.
   - post / vote / transfer / recurrentTransfer: thin wrappers over the Keychain requests, returning Promises.
   - helpHtml(): the "No Keychain? Install it" box.
   No dependencies. */
(function (root) {
    "use strict";

    var NODES = ["https://api.hive.blog", "https://api.deathwing.me", "https://api.openhive.network", "https://hive-api.arcange.eu"];
    var LS_USER = "mes-hive-user";
    var APP = "mes.fm/1";
    var good = 0;                       /* index of the node that answered last */

    function ls() { try { return root.localStorage || null; } catch (e) { return null; } }

    /* ---------- JSON-RPC ---------- */
    function timeoutFetch(url, opt, ms) {
        if (typeof AbortController === "undefined") return fetch(url, opt);
        var ac = new AbortController();
        var t = setTimeout(function () { ac.abort(); }, ms);
        opt.signal = ac.signal;
        return fetch(url, opt).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
    }
    function call(method, params, opt) {
        opt = opt || {};
        var nodes = opt.nodes || NODES, order = [], i;
        for (i = 0; i < nodes.length; i++) order.push((good + i) % nodes.length);
        var body = JSON.stringify({ jsonrpc: "2.0", method: method, params: params == null ? [] : params, id: 1 });
        var k = 0, lastErr = null;
        function next() {
            if (k >= order.length) return Promise.reject(lastErr || new Error("No Hive node answered"));
            var idx = order[k++];
            return timeoutFetch(nodes[idx], { method: "POST", headers: { "Content-Type": "application/json" }, body: body }, opt.timeout || 7000)
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(function (j) {
                    if (j && j.error) {
                        /* a real "not found" style answer from the chain is final, not a node failure */
                        var e = new Error(j.error.message || "Hive API error"); e.rpc = j.error;
                        if (/assert|not found|does not exist|invalid/i.test(e.message)) throw Object.assign(e, { final: true });
                        throw e;
                    }
                    if (!opt.nodes) good = idx;
                    return j.result;
                })
                .catch(function (e) { if (e && e.final) throw e; lastErr = e; return next(); });
        }
        return next();
    }

    /* ---------- names, links, formatting ---------- */
    var NAME_RE = /^[a-z][a-z0-9-]{1,14}[a-z0-9](\.[a-z][a-z0-9-]{1,14}[a-z0-9])*$/;
    function validName(n) { return typeof n === "string" && n.length >= 3 && n.length <= 16 && NAME_RE.test(n); }
    function cleanName(n) { return String(n == null ? "" : n).trim().replace(/^@/, "").toLowerCase(); }

    /* author/permlink from any front-end URL: peakd, hive.blog, ecency, inleo (incl. /threads/view/), leofinance, 3speak watch */
    function parseUrl(u) {
        if (!u) return null;
        var m = String(u).match(/^https?:\/\/(?:www\.)?(?:peakd\.com|hive\.blog|ecency\.com|inleo\.io|leofinance\.io)\/(?:threads\/view\/|[a-z0-9-]+\/)?@?([a-z0-9.-]{3,16})\/([a-z0-9-]{1,255})\/?(?:[?#].*)?$/i);
        if (!m) m = String(u).match(/^https?:\/\/(?:www\.)?3speak\.tv\/watch\?v=([a-z0-9.-]{3,16})\/([a-z0-9-]{1,255})/i);
        if (!m) return null;
        var a = m[1].toLowerCase(), p = m[2].toLowerCase();
        if (!validName(a)) return null;
        return { author: a, permlink: p };
    }
    function avatar(name, size) { return "https://images.hive.blog/u/" + encodeURIComponent(name) + "/avatar/" + (size || "small"); }
    function peakd(author, permlink) { return "https://peakd.com/@" + author + (permlink ? "/" + permlink : ""); }
    function proxyImg(url, w) { return "https://images.hive.blog/" + (w || 768) + "x0/" + url; }

    function timeAgo(iso, now) {
        var t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
        if (!isFinite(t)) return "";
        var s = Math.max(0, ((now == null ? Date.now() : now) - t) / 1000);
        if (s < 60) return "just now";
        var units = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
        for (var i = 0; i < units.length; i++) {
            if (s >= units[i][0]) { var n = Math.floor(s / units[i][0]); return n + " " + units[i][1] + (n === 1 ? "" : "s") + " ago"; }
        }
        return "just now";
    }
    function money(v) { var n = parseFloat(v); return isFinite(n) ? "$" + n.toFixed(2) : "$0.00"; }

    /* new comment permlink: re-<parent author>-<utc time>, lowercase, a-z0-9-, <= 255 */
    function replyPermlink(parentAuthor, now) {
        var d = new Date(now == null ? Date.now() : now).toISOString().replace(/[^0-9]/g, "").slice(0, 17);
        return ("re-" + String(parentAuthor).replace(/[^a-z0-9-]/g, "-") + "-" + d + "z").slice(0, 255);
    }

    /* ---------- safe markdown ---------- */
    function esc(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
    function decodeEntities(s) {
        return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6}|#39);/gi, function (all, e) {
            var l = e.toLowerCase();
            if (ENT[l] != null) return ENT[l];
            var cp = l.charAt(0) === "#" ? (l.charAt(1) === "x" ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10)) : NaN;
            if (isFinite(cp) && cp > 0 && cp < 0x110000 && !(cp >= 0xd800 && cp < 0xe000)) { try { return String.fromCodePoint(cp); } catch (x) {} }
            return all;
        });
    }
    function attr(s, name) {
        var m = s.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
        return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]) : "";
    }
    /* raw HTML -> markdown meaning; anything else is dropped */
    function htmlToMd(s) {
        s = s.replace(/<!--[\s\S]*?-->/g, "");
        s = s.replace(/<(script|style|iframe|object|embed|svg|math|noscript|template|textarea|select)\b[\s\S]*?<\/\1\s*>/gi, "");
        s = s.replace(/<img\b[^>]*>/gi, function (t) { var u = attr(t, "src"); return u ? "\n\n![" + attr(t, "alt").replace(/[\[\]]/g, "") + "](" + u + ")\n\n" : ""; });
        s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, function (all, a, txt) {
            var u = attr(a, "href"); var inner = txt.replace(/<[^>]*>/g, "").trim();
            if (!u) return inner;
            return /^!\[/.test(txt.trim()) || /\n!\[/.test(txt) ? txt : "[" + (inner || u).replace(/[\[\]]/g, "") + "](" + u + ")";
        });
        s = s.replace(/<br\s*\/?>/gi, "  \n");
        s = s.replace(/<\/?(p|div|center|section|article|blockquote|table|tr|h[1-6]|ul|ol|hr|pre)\b[^>]*>/gi, "\n\n");
        s = s.replace(/<li\b[^>]*>/gi, "\n- ").replace(/<\/li\s*>/gi, "\n");
        s = s.replace(/<\/?(b|strong)\b[^>]*>/gi, "**").replace(/<\/?(i|em)\b[^>]*>/gi, "*");
        s = s.replace(/<td\b[^>]*>|<th\b[^>]*>/gi, " ");
        s = s.replace(/<\/?[a-z][^>]*>/gi, "");
        return s;
    }
    function okUrl(u) { return /^https?:\/\/[^\s"'<>]+$/i.test(u); }
    var IMG_EXT = /\.(?:jpe?g|png|gif|webp)(?:\?[^\s]*)?$/i;

    function inline(text, keep) {
        /* text is RAW (unescaped); returns safe HTML. keep = placeholder store */
        var store = keep || [];
        function hold(html) { store.push(html); return "\u0000" + (store.length - 1) + "\u0000"; }
        var s = String(text).replace(/\u0000/g, "");
        s = s.replace(/\u0002(\d+)\u0002/g, function (a, n) { return hold("<code>" + esc(SPANS[+n] || "") + "</code>"); });
        s = s.replace(/`([^`\n]+)`/g, function (a, c) { return hold("<code>" + esc(c) + "</code>"); });
        s = s.replace(/!\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, function (a, alt, u) {
            return okUrl(u) ? hold('<img src="' + esc(proxyImg(u)) + '" alt="' + esc(alt) + '" loading="lazy" referrerpolicy="no-referrer">') : esc(alt);
        });
        s = s.replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, function (a, t, u) {
            if (!okUrl(u)) return t;
            return hold('<a href="' + esc(u) + '" rel="nofollow ugc noopener" target="_blank">') + t + hold("</a>");
        });
        s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>"'()\u0000]+[^\s<>"'().,;:!?\u0000])/g, function (a, pre, u) {
            if (IMG_EXT.test(u)) return pre + hold('<img src="' + esc(proxyImg(u)) + '" alt="" loading="lazy" referrerpolicy="no-referrer">');
            return pre + hold('<a href="' + esc(u) + '" rel="nofollow ugc noopener" target="_blank">' + esc(u.length > 70 ? u.slice(0, 67) + "\u2026" : u) + "</a>");
        });
        s = s.replace(/(^|[^a-z0-9\/@.-])@([a-z][a-z0-9.-]{2,15})\b/gi, function (a, pre, n) {
            n = n.toLowerCase().replace(/\.$/, "");
            return validName(n) ? pre + hold('<a href="' + peakd(n) + '" rel="nofollow ugc noopener" target="_blank">@' + esc(n) + "</a>") : a;
        });
        s = esc(s);
        s = s.replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, function (a, x, y) { return "<strong>" + (x || y) + "</strong>"; });
        s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)|(^|[^_\w])_([^_\n]+?)_(?!\w)/g, function (a, p1, x, p2, y) { return (p1 != null ? p1 : p2) + "<em>" + (x != null ? x : y) + "</em>"; });
        s = s.replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");
        s = s.replace(/ {2,}\n/g, "<br>").replace(/\n/g, " ");
        if (!keep) s = restore(s, store);
        return s;
    }
    function restore(s, store) {
        for (var i = 0; i < 4 && /\u0000\d+\u0000/.test(s); i++) s = s.replace(/\u0000(\d+)\u0000/g, function (a, n) { return store[+n] || ""; });
        return s;
    }

    var SPANS = [];
    function render(md, opt) {
        opt = opt || {};
        var src = String(md == null ? "" : md).replace(/\r\n?/g, "\n");
        if (!opt.inner) src = src.replace(/[\u0000-\u0002]/g, "");
        if (src.length > 60000) src = src.slice(0, 60000);
        /* fenced code blocks first, so the HTML pass leaves their contents alone */
        var codes = [];
        src = src.replace(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/gm, function (a, c) { codes.push(c); return "\n\u0001" + (codes.length - 1) + "\u0001\n"; });
        if (!opt.inner) SPANS = [];
        src = src.replace(/`([^`\n]+)`/g, function (a, c) { SPANS.push(c); return "\u0002" + (SPANS.length - 1) + "\u0002"; });
        src = decodeEntities(htmlToMd(src));
        var lines = src.split("\n"), out = [], i = 0, para = [];
        function flush() { if (para.length) { var h = inline(para.join("\n")).trim(); if (h) out.push("<p>" + h + "</p>"); para = []; } }
        while (i < lines.length) {
            var ln = lines[i], m;
            if (/^\u0001\d+\u0001$/.test(ln.trim())) { flush(); out.push("<pre><code>" + esc(codes[+ln.trim().slice(1, -1)] || "") + "</code></pre>"); i++; continue; }
            if (!ln.trim()) { flush(); i++; continue; }
            if ((m = ln.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); var lv = Math.min(6, m[1].length + 2); out.push("<h" + lv + ">" + inline(m[2]) + "</h" + lv + ">"); i++; continue; }
            if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(ln)) { flush(); out.push("<hr>"); i++; continue; }
            if (/^ {0,3}>/.test(ln)) {
                flush(); var q = [];
                while (i < lines.length && /^ {0,3}>/.test(lines[i])) { q.push(lines[i].replace(/^ {0,3}> ?/, "")); i++; }
                out.push("<blockquote>" + (opt.depth > 3 ? "<p>" + inline(q.join("\n")) + "</p>" : render(q.join("\n"), { depth: (opt.depth || 0) + 1, inner: true })) + "</blockquote>");
                continue;
            }
            if (/^ {0,3}([-*+]|\d{1,9}[.)])\s+/.test(ln)) {
                flush(); var ordered = /^ {0,3}\d/.test(ln), items = [];
                while (i < lines.length && /^ {0,3}([-*+]|\d{1,9}[.)])\s+/.test(lines[i])) {
                    var it = lines[i].replace(/^ {0,3}([-*+]|\d{1,9}[.)])\s+/, ""); i++;
                    while (i < lines.length && /^ {2,}\S/.test(lines[i]) && !/^ {0,3}([-*+]|\d{1,9}[.)])\s+/.test(lines[i])) { it += "\n" + lines[i].trim(); i++; }
                    items.push("<li>" + inline(it) + "</li>");
                }
                out.push((ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>"));
                continue;
            }
            if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
                flush(); var rows = [];
                while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
                    if (!/^\s*\|?\s*:?-{3,}/.test(lines[i])) rows.push("<tr>" + lines[i].trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return "<td>" + inline(c.trim()) + "</td>"; }).join("") + "</tr>");
                    i++;
                }
                out.push('<div class="mh-tbl"><table>' + rows.join("") + "</table></div>");
                continue;
            }
            para.push(ln); i++;
        }
        flush();
        return out.join("\n");
    }

    /* plain-text summary (for titles / previews) */
    function plain(md, n) {
        var t = decodeEntities(htmlToMd(String(md || ""))).replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_`~|]/g, "").replace(/\s+/g, " ").trim();
        return n && t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
    }

    /* ---------- login state ---------- */
    var subs = [];
    function user() {
        var s = ls(); if (!s) return null;
        try { var u = JSON.parse(s.getItem(LS_USER) || "null"); return u && validName(u.name) ? u : null; } catch (e) { return null; }
    }
    function emit() { var u = user(); subs.slice().forEach(function (f) { try { f(u); } catch (e) {} }); }
    function onChange(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
    if (root.addEventListener) root.addEventListener("storage", function (e) { if (e.key === LS_USER) emit(); });

    /* ---------- signers (Keychain today; HiveAuth can be added as a second entry) ---------- */
    function keychain(wait) {
        if (root.hive_keychain) return Promise.resolve(root.hive_keychain);
        /* the extension injects hive_keychain shortly after the page loads */
        return new Promise(function (res) {
            var t0 = Date.now(), ms = wait == null ? 1500 : wait;
            (function poll() {
                if (root.hive_keychain) return res(root.hive_keychain);
                if (Date.now() - t0 >= ms) return res(null);
                setTimeout(poll, 100);
            })();
        });
    }
    function hasKeychain() { return !!root.hive_keychain; }
    function noSigner() { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; return e; }
    function kc(fn) {
        /* fn(keychain, done) -> Promise of the Keychain response (rejects with its message on failure / cancel) */
        return keychain().then(function (k) {
            if (!k) throw noSigner();
            return new Promise(function (res, rej) {
                fn(k, function (r) {
                    if (r && r.success) res(r);
                    else { var e = new Error((r && (r.message || (r.error && (r.error.message || r.error)))) || "Cancelled"); e.code = r && r.error === "user_cancel" ? "cancel" : "fail"; e.response = r; rej(e); }
                });
            });
        });
    }
    function signer() { return { name: "keychain", available: hasKeychain }; }

    function login(name) {
        name = cleanName(name);
        if (!validName(name)) return Promise.reject(new Error("That is not a valid Hive username."));
        var host = (root.location && root.location.host) || "mes.fm";
        var msg = "Log in to " + host + " as @" + name + " (" + new Date().toISOString() + " " + Math.random().toString(36).slice(2, 10) + ")";
        return kc(function (k, done) { k.requestSignBuffer(name, msg, "Posting", done, null, "Log in to mes.fm"); }).then(function (r) {
            var got = cleanName((r.data && r.data.username) || name);
            var u = { name: got, key: r.publicKey || "", at: Date.now(), via: "keychain" };
            var s = ls(); if (s) try { s.setItem(LS_USER, JSON.stringify(u)); } catch (e) {}
            emit();
            return u;
        });
    }
    function logout() { var s = ls(); if (s) try { s.removeItem(LS_USER); } catch (e) {} emit(); }
    function need() { var u = user(); if (!u) { var e = new Error("Log in with Hive Keychain first."); e.code = "nologin"; throw e; } return u; }

    function post(o) {
        /* o = {parentAuthor, parentPermlink, body, title?, tags?, permlink?} */
        return Promise.resolve().then(function () {
            var u = need();
            var body = String(o.body || "").trim();
            if (!body) throw new Error("Write something first.");
            if (body.length > 60000) throw new Error("That is too long for one comment.");
            var meta = { app: APP, format: "markdown", tags: (o.tags || []).slice(0, 8) };
            var perm = o.permlink || replyPermlink(o.parentAuthor || u.name);
            return kc(function (k, done) {
                k.requestPost(u.name, o.title || "", body, o.parentPermlink, o.parentAuthor, JSON.stringify(meta), perm, "", done);
            }).then(function (r) { return { response: r, author: u.name, permlink: perm, body: body }; });
        });
    }
    function vote(author, permlink, weight) {
        return Promise.resolve().then(function () {
            var u = need();
            var w = Math.max(-10000, Math.min(10000, Math.round(weight == null ? 10000 : weight)));
            return kc(function (k, done) { k.requestVote(u.name, permlink, author, w, done); });
        });
    }
    function amount3(a) { var n = Number(a); if (!isFinite(n) || n <= 0) throw new Error("Bad amount"); return n.toFixed(3); }
    function transfer(to, amount, currency, memo) {
        return Promise.resolve().then(function () {
            var u = need();
            return kc(function (k, done) { k.requestTransfer(u.name, to, amount3(amount), memo || "", currency || "HBD", done, true); });
        });
    }
    function recurrentTransfer(to, amount, currency, memo, recurrenceHours, executions) {
        return Promise.resolve().then(function () {
            var u = need();
            var a = Number(amount) === 0 ? "0.000" : amount3(amount);
            return kc(function (k, done) { k.requestRecurrentTransfer(u.name, to, a, currency || "HBD", memo || "", recurrenceHours || 720, executions || 12, done); });
        });
    }

    function helpHtml() {
        return '<div class="mh-help"><b>No Hive Keychain in this browser?</b> Keychain is the free, open-source wallet extension that signs Hive actions; ' +
            'your keys never leave it and mes.fm never sees them. Install it for ' +
            '<a href="https://chromewebstore.google.com/detail/hive-keychain/jcacnejopjdphbnjgfaaobbfafkihpep" target="_blank" rel="noopener">Chrome / Brave / Edge</a>, ' +
            '<a href="https://addons.mozilla.org/firefox/addon/hive-keychain/" target="_blank" rel="noopener">Firefox</a> or as the ' +
            '<a href="https://hive-keychain.com/" target="_blank" rel="noopener">Keychain mobile app</a> (open mes.fm in its built-in browser), import your account, then reload this page. ' +
            'No Hive account yet? <a href="https://signup.hive.io/" target="_blank" rel="noopener">Get one at signup.hive.io</a>.</div>';
    }

    var api = {
        NODES: NODES, APP: APP, call: call, render: render, plain: plain, esc: esc,
        parseUrl: parseUrl, validName: validName, cleanName: cleanName, avatar: avatar, peakd: peakd, proxyImg: proxyImg,
        timeAgo: timeAgo, money: money, replyPermlink: replyPermlink,
        user: user, login: login, logout: logout, onChange: onChange, keychain: keychain, hasKeychain: hasKeychain, signer: signer,
        post: post, vote: vote, transfer: transfer, recurrentTransfer: recurrentTransfer, helpHtml: helpHtml
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.MESHive = root.MESHive || api;
})(typeof window !== "undefined" ? window : globalThis);
