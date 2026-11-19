/* MESHive: the shared Hive helpers for mes.fm pages (window.MESHive; also require()-able in node for tests).

   - Login with the Hive Keychain extension: requestSignBuffer() on the Posting key proves the person controls the account (Keychain only
     signs for an account whose key is in the wallet). The username (+ the public key that signed) is kept in localStorage
     "mes-hive-user"; nothing is sent to mes.fm. Logout just forgets it.
   - No extension (phones in Brave / Chrome / Safari...): login() falls back to HiveAuth with the Keychain PHONE APP (see the HiveAuth
     section below). keychain() then returns a stand-in object with the same request* calls as window.hive_keychain, so every page
     written for Keychain (hive-store.js, polls, premium, comments) works unchanged; only memo encryption is missing (via() === "hiveauth").
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
        try {
            var u = JSON.parse(s.getItem(LS_USER) || "null");
            if (!u || !validName(u.name)) return null;
            /* a Keychain-app (HiveAuth) login ends when the app's session expires */
            if (u.via === "hiveauth") { var h = hasSession(); if (!h || h.name !== u.name) return null; }
            return u;
        } catch (e) { return null; }
    }
    function emit() { var u = user(); subs.slice().forEach(function (f) { try { f(u); } catch (e) {} }); }
    function onChange(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
    if (root.addEventListener) root.addEventListener("storage", function (e) { if (e.key === LS_USER || e.key === LS_HAS) emit(); });

    /* ---------- HiveAuth (HAS): log in and sign with the Hive Keychain PHONE APP, no extension needed ----------
       The same protocol 3Speak uses (through the Aioha library). The page talks to the public relay
       wss://hive-auth.arcange.eu over a WebSocket; every payload is AES-encrypted (CryptoJS "Salted__" format: EVP_BytesToKey
       with MD5, AES-256-CBC) with a random per-session key that only the page and the wallet app know: the relay can't read it.
       auth_req carries a login challenge; the app learns the key from the QR code / has://auth_req/<base64 json> deep link
       {account, uuid, key, host}. sign_req (ops + key_type, broadcast) and challenge_req (sign a message) reuse the session.
       The session {name, key, token, expire} is kept in localStorage "mes-hive-has" until the app's expiry. HAS has NO memo
       encryption, so requestEncodeMessage / requestVerifyKey fail with error "nomemo_hiveauth". No libraries: MD5 is inline,
       AES is Web Crypto (secure context: https or localhost). */
    var HAS_HOST = "wss://hive-auth.arcange.eu/";
    var LS_HAS = "mes-hive-has";
    var HAS_APP_META = { name: "mes.fm", description: "MES.fm calculators and tools", icon: "https://mes.fm/img/logo-mark-64.png" };
    var QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
    var KC_APP = "https://hive-keychain.com/";
    var NO_MEMO = "Encrypted saves need your Hive memo key, and the Keychain phone-app login (HiveAuth) can't use it. " +
        "Use a browser with the Hive Keychain extension, or open mes.fm inside the Keychain app's own browser, to save or open encrypted data.";

    function md5(bytes) {
        var K = [], S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], i, j;
        for (i = 0; i < 64; i++) K[i] = (Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
        var n = bytes.length, blocks = ((n + 8) >>> 6) + 1, M = new Int32Array(blocks * 16);
        for (i = 0; i < n; i++) M[i >> 2] |= bytes[i] << ((i % 4) * 8);
        M[n >> 2] |= 0x80 << ((n % 4) * 8);
        M[blocks * 16 - 2] = n * 8;
        M[blocks * 16 - 1] = Math.floor(n / 536870912);
        var a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
        for (j = 0; j < M.length; j += 16) {
            var A = a0, B = b0, C = c0, D = d0;
            for (i = 0; i < 64; i++) {
                var F, g;
                if (i < 16) { F = (B & C) | (~B & D); g = i; }
                else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
                else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
                else { F = C ^ (B | ~D); g = (7 * i) % 16; }
                var tmp = D; D = C; C = B;
                var x = (A + F + K[i] + M[j + g]) | 0, s = S[(i >> 4) * 4 + (i % 4)];
                B = (B + ((x << s) | (x >>> (32 - s)))) | 0; A = tmp;
            }
            a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
        }
        var h = [a0, b0, c0, d0], out = new Uint8Array(16);
        for (i = 0; i < 16; i++) out[i] = (h[i >> 2] >>> ((i % 4) * 8)) & 255;
        return out;
    }
    function cat() {
        var len = 0, i; for (i = 0; i < arguments.length; i++) len += arguments[i].length;
        var o = new Uint8Array(len), at = 0;
        for (i = 0; i < arguments.length; i++) { o.set(arguments[i], at); at += arguments[i].length; }
        return o;
    }
    /* OpenSSL EVP_BytesToKey(MD5, 1 round): 32-byte key + 16-byte IV, exactly what CryptoJS.AES.encrypt(text, "passphrase") does */
    function evpKdf(pass, salt) {
        var out = new Uint8Array(48), block = new Uint8Array(0), have = 0;
        while (have < 48) { block = md5(cat(block, pass, salt)); out.set(block.subarray(0, Math.min(16, 48 - have)), have); have += 16; }
        return { key: out.subarray(0, 32), iv: out.subarray(32, 48) };
    }
    function subtle() { var c = root.crypto || (typeof globalThis !== "undefined" && globalThis.crypto); return c && c.subtle; }
    function bin2b64(u) { var s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
    function b642bin(s) { var b = atob(String(s)), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    function randomBytes(n) { var u = new Uint8Array(n); (root.crypto || globalThis.crypto).getRandomValues(u); return u; }
    function uuid4() {
        var c = root.crypto || globalThis.crypto;
        if (c && c.randomUUID) return c.randomUUID();
        var b = randomBytes(16); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
        var h = Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
        return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
    }
    function aesEncrypt(text, pass, salt) {
        var sb = subtle(); if (!sb) return Promise.reject(new Error("This browser can't encrypt (Web Crypto needs https)."));
        salt = salt || randomBytes(8);
        var k = evpKdf(new TextEncoder().encode(pass), salt);
        return sb.importKey("raw", k.key, "AES-CBC", false, ["encrypt"])
            .then(function (ck) { return sb.encrypt({ name: "AES-CBC", iv: k.iv }, ck, new TextEncoder().encode(text)); })
            .then(function (ct) { return bin2b64(cat(new TextEncoder().encode("Salted__"), salt, new Uint8Array(ct))); });
    }
    function aesDecrypt(b64, pass) {
        var sb = subtle(); if (!sb) return Promise.reject(new Error("This browser can't decrypt (Web Crypto needs https)."));
        var all;
        try { all = b642bin(b64); } catch (e) { return Promise.reject(new Error("bad ciphertext")); }
        if (all.length < 32 || String.fromCharCode.apply(null, all.subarray(0, 8)) !== "Salted__") return Promise.reject(new Error("bad ciphertext"));
        var k = evpKdf(new TextEncoder().encode(pass), all.subarray(8, 16));
        return sb.importKey("raw", k.key, "AES-CBC", false, ["decrypt"])
            .then(function (ck) { return sb.decrypt({ name: "AES-CBC", iv: k.iv }, ck, all.subarray(16)); })
            .then(function (pt) { return new TextDecoder().decode(pt); });
    }
    /* has://<auth_req|sign_req|challenge_req>/<base64 {account, uuid, key, host}>: QR content and the app's deep link */
    function hasLink(kind, account, id, key, host) {
        return "has://" + kind + "_req/" + btoa(JSON.stringify({ account: account, uuid: id, key: key, host: host || HAS_HOST }));
    }
    function lcKey(t) { t = String(t || "posting").toLowerCase(); return t === "active" || t === "memo" ? t : "posting"; }
    /* Keychain-style request -> Hive operations (what a HAS wallet signs) */
    var opsFor = {
        customJson: function (acc, id, keyType, json) {
            var act = lcKey(keyType) === "active";
            return [["custom_json", { required_auths: act ? [acc] : [], required_posting_auths: act ? [] : [acc], id: String(id), json: typeof json === "string" ? json : JSON.stringify(json) }]];
        },
        post: function (acc, title, body, parentPermlink, parentAuthor, meta, permlink, options) {
            var ops = [["comment", { parent_author: parentAuthor || "", parent_permlink: parentPermlink || "", author: acc, permlink: permlink, title: title || "", body: body, json_metadata: typeof meta === "string" ? meta : JSON.stringify(meta || {}) }]];
            if (options) ops.push(["comment_options", typeof options === "string" ? JSON.parse(options) : options]);
            return ops;
        },
        vote: function (acc, permlink, author, weight) { return [["vote", { voter: acc, author: author, permlink: permlink, weight: Number(weight) }]]; },
        transfer: function (acc, to, amount, memo, currency) { return [["transfer", { from: acc, to: to, amount: Number(amount).toFixed(3) + " " + currency, memo: memo || "" }]]; },
        recurrentTransfer: function (acc, to, amount, currency, memo, recurrence, executions) {
            return [["recurrent_transfer", { from: acc, to: to, amount: Number(amount).toFixed(3) + " " + currency, memo: memo || "", recurrence: Number(recurrence), executions: Number(executions), extensions: [] }]];
        },
        broadcast: function (ops) { return Array.isArray(ops) && typeof ops[0] === "string" ? [ops] : ops; }
    };

    function hasSession() {
        var s = ls(); if (!s) return null;
        try {
            var x = JSON.parse(s.getItem(LS_HAS) || "null");
            return x && validName(x.name) && x.key && Number(x.expire) > Date.now() + 5000 ? x : null;
        } catch (e) { return null; }
    }
    function hasErr(msg, code) { var e = new Error(msg); e.code = code || "fail"; return e; }

    var HAS = { ws: null, opening: null, timeout: 60000, cur: null, q: Promise.resolve() };
    function hasSocket() {
        if (HAS.ws && HAS.ws.readyState === 1) return Promise.resolve(HAS.ws);
        if (HAS.opening) return HAS.opening;
        if (typeof WebSocket === "undefined") return Promise.reject(hasErr("This browser can't open the HiveAuth connection.", "net"));
        HAS.opening = new Promise(function (res, rej) {
            var ws, t;
            try { ws = new WebSocket(HAS_HOST); } catch (e) { HAS.opening = null; return rej(hasErr("Could not reach the HiveAuth server.", "net")); }
            t = setTimeout(function () { try { ws.close(); } catch (e) {} HAS.opening = null; rej(hasErr("Could not reach the HiveAuth server. Check your connection and try again.", "net")); }, 12000);
            ws.onopen = function () { clearTimeout(t); HAS.ws = ws; HAS.opening = null; res(ws); };
            ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } hasOnMessage(m); };
            ws.onerror = function () {};
            ws.onclose = function () {
                clearTimeout(t);
                if (HAS.ws === ws) HAS.ws = null;
                if (HAS.opening) { HAS.opening = null; rej(hasErr("Could not reach the HiveAuth server.", "net")); }
                if (HAS.cur && HAS.cur.uuid) setTimeout(hasReattach, 1500);
            };
        });
        return HAS.opening;
    }
    /* phones suspend the page while the person is in the wallet app; when it comes back, re-attach to the pending request */
    function hasReattach() {
        var c = HAS.cur; if (!c || !c.uuid) return;
        if (root.document && root.document.hidden) return;
        hasSocket().then(function (ws) { if (HAS.cur === c) ws.send(JSON.stringify({ cmd: "attach_req", uuid: c.uuid })); }, function () { if (HAS.cur === c) setTimeout(hasReattach, 3000); });
    }
    if (root.document && root.addEventListener) root.document.addEventListener("visibilitychange", function () { if (!root.document.hidden) hasReattach(); });
    function hasOnMessage(m) {
        if (!m || !m.cmd) return;
        if (m.cmd === "connected") { if (m.timeout) HAS.timeout = m.timeout * 1000; return; }
        var c = HAS.cur; if (!c) return;
        if (!c.uuid) {
            if (m.cmd === c.kind + "_wait") { c.waiting(m); return; }
            if (m.cmd === "error") c.fail(hasErr("HiveAuth: " + (m.error || "the request was refused"), "fail"));
            return;
        }
        if (m.uuid !== c.uuid) return;
        if (m.cmd === c.kind + "_ack") c.ack(m);
        else if (m.cmd === c.kind + "_nack") c.fail(hasErr(c.kind === "auth" ? "The login was refused in the Keychain app." : "Refused in the Keychain app.", "cancel"));
        else if (m.cmd === c.kind + "_err") {
            aesDecrypt(m.error, c.key).then(function (t) { c.fail(hasErr(t || "The Keychain app reported an error.")); }, function () { c.fail(hasErr(m.error || "The Keychain app reported an error.")); });
        }
    }
    /* one request at a time (the protocol matches a *_wait to the last request) */
    function hasRequest(kind, account, plain, key, token, ui) {
        var run = function () {
            return aesEncrypt(JSON.stringify(plain), key).then(function (data) {
                return hasSocket().then(function (ws) {
                    return new Promise(function (res, rej) {
                        var c = { kind: kind, account: account, key: key, uuid: null, timer: null }, over = false;
                        function end() { over = true; clearTimeout(c.timer); if (HAS.cur === c) HAS.cur = null; hasUiClose(c); }
                        c.ack = function (m) { if (!over) { end(); res(m); } };
                        c.fail = function (e) { if (!over) { end(); rej(e); } };
                        c.waiting = function (m) {
                            c.uuid = m.uuid; c.expire = Number(m.expire) || Date.now() + HAS.timeout;
                            clearTimeout(c.timer);
                            c.timer = setTimeout(function () { c.fail(hasErr("Time ran out: nothing was approved in the Keychain app. Try again.", "expired")); }, Math.max(5000, c.expire - Date.now() + 1500));
                            c.link = hasLink(kind, account, c.uuid, key);
                            hasUiOpen(c, ui || {});
                        };
                        HAS.cur = c;
                        var msg = { cmd: kind + "_req", account: account, data: data };
                        if (token) msg.token = token;
                        c.timer = setTimeout(function () { c.fail(hasErr("The HiveAuth server did not answer. Try again.", "net")); }, 15000);
                        ws.send(JSON.stringify(msg));
                    });
                });
            });
        };
        var p = HAS.q.then(run, run);
        HAS.q = p.catch(function () {});
        return p;
    }
    function hasAuth(name, challenge, ui) {
        var key = uuid4();
        var plain = { app: HAS_APP_META, challenge: { key_type: "posting", challenge: challenge, nonce: Date.now() } };
        return hasRequest("auth", name, plain, key, null, ui).then(function (m) {
            return aesDecrypt(m.data, key).then(function (t) {
                var d = JSON.parse(t);
                var sess = { name: name, key: key, token: d.token || "", expire: Number(d.expire) || Date.now() + 86400000 };
                var ch = d.challenge && typeof d.challenge === "object" ? d.challenge : {};
                return { session: sess, signature: ch.challenge || "", pubkey: ch.pubkey || "" };
            });
        });
    }
    function hasSign(account, ops, keyType, title) {
        var s = hasSession();
        if (!s || s.name !== account) return Promise.reject(hasErr("Your Keychain app login has ended. Log in again.", "nologin"));
        var plain = { key_type: lcKey(keyType), ops: ops, broadcast: true, nonce: Date.now() };
        return hasRequest("sign", account, plain, s.key, s.token, { what: title || describeOps(ops), active: lcKey(keyType) === "active" }).then(function (m) {
            var id = typeof m.data === "string" ? m.data : (m.data && (m.data.id || m.data.tx_id)) || "";
            return { id: id, tx_id: id };
        });
    }
    function hasChallenge(account, message, keyType, title) {
        var s = hasSession();
        if (!s || s.name !== account) return Promise.reject(hasErr("Your Keychain app login has ended. Log in again.", "nologin"));
        return hasRequest("challenge", account, { key_type: lcKey(keyType), challenge: String(message), nonce: Date.now() }, s.key, s.token, { what: title || "Sign a message" })
            .then(function (m) { return typeof m.data === "string" ? aesDecrypt(m.data, s.key).then(JSON.parse) : m.data; });
    }
    function describeOps(ops) {
        var o = ops && ops[0]; if (!o) return "Approve a Hive action";
        var t = o[0], d = o[1] || {};
        if (t === "custom_json") return "Save app data (" + d.id + ")" + (ops.length > 1 ? " x" + ops.length : "");
        if (t === "comment") return d.parent_author ? "Post a comment" : "Publish a post";
        if (t === "vote") return "Vote on @" + d.author + "'s post";
        if (t === "transfer") return "Send " + d.amount + " to @" + d.to;
        if (t === "recurrent_transfer") return "Set up " + d.amount + " to @" + d.to + " every " + d.recurrence + " hours";
        return "Approve a Hive action (" + t + ")";
    }

    /* the same calls as window.hive_keychain, so pages written for Keychain work unchanged */
    function kcOk(cb, extra) { return function (r) { cb(Object.assign({ success: true, result: r, message: "Done in the Keychain app (HiveAuth)" }, extra || {})); }; }
    function kcBad(cb) { return function (e) { cb({ success: false, error: e.code === "cancel" ? "user_cancel" : (e.code || "fail"), message: e.message }); }; }
    var hasShim = {
        hiveAuth: true,
        requestHandshake: function (cb) { cb && cb(); },
        requestSignBuffer: function (acc, msg, keyType, cb, rpc, title) {
            hasChallenge(acc, msg, keyType, title).then(function (r) { cb({ success: true, result: r.challenge, publicKey: r.pubkey, data: { username: acc } }); }, kcBad(cb));
        },
        requestBroadcast: function (acc, ops, keyType, cb, rpc, title) { hasSign(acc, opsFor.broadcast(ops), keyType, title).then(kcOk(cb), kcBad(cb)); },
        requestCustomJson: function (acc, id, keyType, json, display, cb) { hasSign(acc, opsFor.customJson(acc, id, keyType, json), keyType, display).then(kcOk(cb), kcBad(cb)); },
        requestPost: function (acc, title, body, pp, pa, meta, permlink, options, cb) {
            var ops; try { ops = opsFor.post(acc, title, body, pp, pa, meta, permlink, options); } catch (e) { return kcBad(cb)(e); }
            hasSign(acc, ops, "posting").then(kcOk(cb), kcBad(cb));
        },
        requestVote: function (acc, permlink, author, weight, cb) { hasSign(acc, opsFor.vote(acc, permlink, author, weight), "posting").then(kcOk(cb), kcBad(cb)); },
        requestTransfer: function (acc, to, amount, memo, currency, cb) {
            if (/^#/.test(memo || "")) return cb({ success: false, error: "nomemo_hiveauth", message: "Encrypted memos (starting with #) can't be sent with the Keychain app login." });
            hasSign(acc, opsFor.transfer(acc, to, amount, memo, currency), "active").then(kcOk(cb), kcBad(cb));
        },
        requestRecurrentTransfer: function (acc, to, amount, currency, memo, recurrence, executions, cb) {
            hasSign(acc, opsFor.recurrentTransfer(acc, to, amount, currency, memo, recurrence, executions), "active").then(kcOk(cb), kcBad(cb));
        },
        requestEncodeMessage: function () { var cb = arguments[arguments.length - 1]; cb({ success: false, error: "nomemo_hiveauth", message: NO_MEMO }); },
        requestVerifyKey: function () { var cb = arguments[arguments.length - 1]; cb({ success: false, error: "nomemo_hiveauth", message: NO_MEMO }); }
    };

    /* ---------- the HiveAuth window (QR code on computers, "Open the Keychain app" on phones) ---------- */
    var qrLib = null;
    function loadQr() {
        if (root.qrcode) return Promise.resolve(root.qrcode);
        if (qrLib) return qrLib;
        qrLib = new Promise(function (ok, no) {
            var s = root.document.createElement("script"); s.src = QR_LIB; s.async = true;
            s.onload = function () { ok(root.qrcode); }; s.onerror = function () { qrLib = null; no(new Error("QR library blocked")); };
            root.document.head.appendChild(s);
        });
        return qrLib;
    }
    function isPhone() { try { return root.matchMedia("(pointer: coarse)").matches && Math.min(root.screen.width, root.screen.height) < 820; } catch (e) { return false; } }
    var HAS_CSS = ".mh-has{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
        ".mh-has-box{background:#fff;color:#1d1d1f;border-radius:14px;max-width:400px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:20px 20px 16px;box-shadow:0 12px 40px rgba(0,0,0,.35);text-align:center}" +
        ".mh-has-box *{color:inherit;box-sizing:border-box}.mh-has h2{font-size:1.2em;margin:0 0 .4em;font-weight:700;line-height:1.25}.mh-has p{margin:.5em 0}" +
        ".mh-has-what{font-weight:600}.mh-has-sub{font-size:.88em;color:#555!important}.mh-has-qr{display:inline-block;background:#fff;padding:8px;border-radius:8px;margin:.4em 0;border:1px solid #ddd}.mh-has-qr svg{display:block;width:220px;height:220px}" +
        ".mh-has-open{display:block;margin:.6em 0;padding:.75em 1em;border-radius:10px;background:#e31337;color:#fff!important;font-weight:700;text-decoration:none;font-size:1.05em}.mh-has-open:focus-visible{outline:3px solid #ffb703;outline-offset:2px}" +
        ".mh-has-open.is-quiet{background:transparent;color:#c0102e!important;border:1px solid #e31337;padding:.5em 1em;font-size:.95em}" +
        ".mh-has-bar{height:6px;border-radius:3px;background:#eee;overflow:hidden;margin:.7em 0 .2em}.mh-has-bar i{display:block;height:100%;background:#e31337;width:100%;transition:width 1s linear}" +
        ".mh-has-time{font-size:.85em;color:#555!important}.mh-has-cancel{margin-top:.5em;padding:.55em 1.4em;border-radius:8px;border:1px solid #bbb;background:transparent;font:inherit;cursor:pointer;min-height:44px}" +
        ".mh-has-foot{font-size:.8em;color:#666!important;margin-top:.8em!important}.mh-has-foot a{color:#c0102e!important}.mh-has details{margin:.4em 0}.mh-has summary{cursor:pointer;color:#c0102e!important;font-size:.92em;min-height:32px}" +
        "body.dark-mode .mh-has-box,body.dark .mh-has-box{background:#1f1f22;color:#eee}body.dark-mode .mh-has-sub,body.dark-mode .mh-has-time,body.dark-mode .mh-has-foot,body.dark .mh-has-sub,body.dark .mh-has-time,body.dark .mh-has-foot{color:#bbb!important}" +
        "body.dark-mode .mh-has-bar,body.dark .mh-has-bar{background:#333}body.dark-mode .mh-has-cancel,body.dark .mh-has-cancel{border-color:#666}" +
        "body.dark-mode .mh-has-foot a,body.dark-mode .mh-has summary,body.dark-mode .mh-has-open.is-quiet,body.dark .mh-has-foot a,body.dark .mh-has summary,body.dark .mh-has-open.is-quiet{color:#ff8fa3!important}";
    function hasUiOpen(c, ui) {
        var d = root.document; if (!d || !d.body) return;
        if (!d.getElementById("mh-has-css")) { var st = d.createElement("style"); st.id = "mh-has-css"; st.textContent = HAS_CSS; d.head.appendChild(st); }
        var phone = isPhone(), login = c.kind === "auth";
        var wrap = d.createElement("div"); wrap.className = "mh-has"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-labelledby", "mh-has-t");
        var open = '<a class="mh-has-open' + (phone ? "" : " is-quiet") + '" href="' + esc(c.link) + '">Open the Keychain app</a>';
        var qr = '<div class="mh-has-qr" aria-label="QR code for the Hive Keychain app"><span class="mh-has-sub">Loading the QR code…</span></div>';
        var body;
        if (login) {
            body = '<h2 id="mh-has-t">Log in as @' + esc(c.account) + ' with the Hive Keychain app</h2>' +
                (phone
                    ? '<p class="mh-has-sub">Keychain is on this phone? Tap the button, approve, then come back here.</p>' + open +
                      '<details><summary>Keychain is on another phone? Show a QR code</summary>' + qr + '<p class="mh-has-sub">In the Keychain app tap the scan (QR) button and scan this code.</p></details>'
                    : '<p class="mh-has-sub">Open Hive Keychain on your phone, tap the scan (QR) button and scan this code, then approve.</p>' + qr + open);
        } else {
            body = '<h2 id="mh-has-t">Approve in the Hive Keychain app</h2><p class="mh-has-what">' + esc(ui.what || "Approve a Hive action") + "</p>" +
                '<p class="mh-has-sub">' + (phone ? "Tap the button to switch to Keychain, approve, then come back here." : "Open Hive Keychain on your phone (logged in as @" + esc(c.account) + ") and approve the request.") +
                (ui.active ? " This needs your <b>active</b> key in the app." : "") + "</p>" + open;
        }
        wrap.innerHTML = '<div class="mh-has-box">' + body +
            '<div class="mh-has-bar"><i></i></div><p class="mh-has-time" aria-live="polite">Waiting…</p>' +
            '<button type="button" class="mh-has-cancel">Cancel</button>' +
            '<p class="mh-has-foot">HiveAuth: your keys stay in the app and mes.fm never sees them. No app yet? <a href="' + KC_APP + '" target="_blank" rel="noopener">Get Hive Keychain</a> for iPhone or Android.</p></div>';
        d.body.appendChild(wrap);
        c.ui = wrap;
        var bar = wrap.querySelector(".mh-has-bar i"), tm = wrap.querySelector(".mh-has-time"), total = Math.max(1000, c.expire - Date.now());
        function tick() {
            var left = Math.max(0, c.expire - Date.now()), s = Math.ceil(left / 1000);
            bar.style.width = (100 * left / total).toFixed(1) + "%";
            tm.textContent = "Waiting for the app… " + Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) + " left";
        }
        tick(); c.tick = setInterval(tick, 1000);
        var cancel = wrap.querySelector(".mh-has-cancel");
        cancel.onclick = function () { c.fail(hasErr("Cancelled.", "cancel")); };
        wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") cancel.click(); });
        c.prevFocus = d.activeElement;
        (wrap.querySelector(".mh-has-open:not(.is-quiet)") || cancel).focus();
        var box = wrap.querySelector(".mh-has-qr");
        if (box) loadQr().then(function (q) {
            var code = q(0, "M"); code.addData(c.link); code.make();
            box.innerHTML = code.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        }).catch(function () { box.innerHTML = '<span class="mh-has-sub">The QR code could not load (blocked?). On a phone with the app, use the button.</span>'; });
    }
    function hasUiClose(c) {
        clearInterval(c.tick);
        if (c.ui && c.ui.parentNode) c.ui.parentNode.removeChild(c.ui);
        if (c.prevFocus && c.prevFocus.focus) try { c.prevFocus.focus(); } catch (e) {}
        c.ui = null;
    }
    function via() { var u = user(); return u ? u.via || "keychain" : null; }

    /* ---------- signers: the Keychain extension, or HiveAuth when the person logged in with the phone app ---------- */
    function keychain(wait) {
        var u = user();
        if (u && u.via === "hiveauth") return Promise.resolve(hasSession() ? hasShim : null);
        return extension(wait);
    }
    /* ---------- Keychain 4 (Nov 2026): same page API, new limits ----------
       Keychain 4.x keeps window.hive_keychain and every request* call as before (checked against 4.1.2 from the Chrome Web Store),
       but its background now refuses a request when mes.fm already has 5 requests waiting for an answer ("request_limit"), when the
       same request is sent twice ("request_pending"), when a request is over 256 KB, or when it cannot tell which tab sent it
       ("invalid_sender"). A refused request answers at once with a short technical message, so every answer from the extension goes
       through kcExplain(), which replaces those messages with what the person should do. The page's own code is unchanged. */
    var KC_LIMIT_MSG = "Hive Keychain already has requests from mes.fm waiting for an answer (it allows 5 at a time). Open the Keychain window " +
        "(or its icon in the browser toolbar), approve or reject what is waiting there, then try again.";
    function kcExplain(r) {
        if (!r || r.success) return r;
        var code = String(r.error && (r.error.code || r.error) || ""), m = String(r.message || "");
        var nice = /size limit/i.test(m) ? "This is too big for one Hive Keychain request. Try a smaller amount of data."
            : code === "request_limit" || /request limit exceeded/i.test(m) ? KC_LIMIT_MSG
            : code === "request_pending" || /already pending/i.test(m) ? "Hive Keychain is already showing this request. Answer it in the Keychain window first."
            : code === "invalid_sender" ? "Hive Keychain could not tell which tab sent the request. Reload the page and try again."
            : code === "incomplete" && /invalid request/i.test(m) ? "Hive Keychain refused the request as incomplete. Reload the page and try again; if it keeps happening, tell us."
            : "";
        if (nice) { r.rawMessage = m; r.message = nice; r.kcCode = code || "limit"; }
        return r;
    }
    function kcError(r, fallback) {
        r = kcExplain(r);
        var e = new Error((r && (r.message || (r.error && (r.error.message || r.error)))) || fallback || "Cancelled");
        e.code = r && r.error === "user_cancel" ? "cancel" : r && r.kcCode ? "kc_" + r.kcCode : "fail";
        e.response = r;
        return e;
    }
    /* the extension's object with every request*() callback passed through kcExplain() (cached per injected object) */
    var wrapped = null, wrappedOf = null;
    function wrapKC(k) {
        if (!k) return k;
        if (wrappedOf === k) return wrapped;
        var w = {};
        Object.keys(k).forEach(function (name) {
            var f = k[name];
            if (typeof f !== "function") return;
            if (!/^request/.test(name)) { w[name] = f.bind(k); return; }
            w[name] = function () {
                var a = Array.prototype.slice.call(arguments).map(function (x) {
                    return typeof x === "function" ? function (r) { return x(kcExplain(r)); } : x;
                });
                return f.apply(k, a);
            };
        });
        w.raw = k;
        wrapped = w; wrappedOf = k;
        return w;
    }
    /* Keychain's content script runs once the page has loaded and injects hive_keychain about 0.3 s later (measured with 4.1.2),
       so wait until 2.5 s after the load event (or `wait` ms when given) before deciding it is not installed. */
    function sinceLoad() {
        try {
            if (root.document && root.document.readyState !== "complete") return -1;
            var n = root.performance && root.performance.getEntriesByType && root.performance.getEntriesByType("navigation")[0];
            if (n && n.loadEventEnd) return root.performance.now() - n.loadEventEnd;
        } catch (e) {}
        return 1e9;
    }
    function extension(wait) {
        if (root.hive_keychain) return Promise.resolve(wrapKC(root.hive_keychain));
        return new Promise(function (res) {
            var t0 = Date.now(), ms = wait == null ? null : wait;
            (function poll() {
                if (root.hive_keychain) return res(wrapKC(root.hive_keychain));
                var sl = sinceLoad(), budget = ms != null ? ms : (sl < 0 ? 15000 : Math.max(400, 2500 - sl));
                if (Date.now() - t0 >= budget) return res(null);
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
                    else rej(kcError(r));
                });
            });
        });
    }
    function signer() { return via() === "hiveauth" ? { name: "hiveauth", available: function () { return !!hasSession(); } } : { name: "keychain", available: hasKeychain }; }

    /* login(name, {via: "keychain" | "hiveauth"}): the extension when it is there, else HiveAuth (Keychain phone app) */
    function login(name, opt) {
        opt = opt || {};
        name = cleanName(name);
        if (!validName(name)) return Promise.reject(new Error("That is not a valid Hive username."));
        var host = "mes.fm";
        var msg = "Log in to " + host + " as @" + name + " (" + new Date().toISOString() + " " + Math.random().toString(36).slice(2, 10) + ")";
        function save(u) {
            var s = ls(); if (s) try { s.setItem(LS_USER, JSON.stringify(u)); } catch (e) {}
            emit();
            return u;
        }
        function viaHas() {
            return hasAuth(name, msg).then(function (r) {
                return checkKey(name, r.pubkey).then(function () {
                    var s = ls(); if (s) try { s.setItem(LS_HAS, JSON.stringify(r.session)); } catch (e) {}
                    return save({ name: name, key: r.pubkey, at: Date.now(), via: "hiveauth", exp: r.session.expire });
                });
            });
        }
        function viaExt(k) {
            return new Promise(function (res, rej) {
                k.requestSignBuffer(name, msg, "Posting", function (r) {
                    if (r && r.success) res(r);
                    else rej(kcError(r));
                }, null, "Log in to mes.fm");
            }).then(function (r) {
                var s = ls(); if (s) try { s.removeItem(LS_HAS); } catch (e) {}
                return save({ name: cleanName((r.data && r.data.username) || name), key: r.publicKey || "", at: Date.now(), via: "keychain" });
            });
        }
        if (opt.via === "hiveauth") return viaHas();
        return extension().then(function (k) {
            if (k) return viaExt(k);
            if (opt.via === "keychain") throw noSigner();
            return viaHas();
        });
    }
    /* the key that answered must be one of the account's keys (skipped when no Hive node answers) */
    function checkKey(name, pub) {
        if (!pub) return Promise.resolve();
        return call("condenser_api.get_accounts", [[name]]).then(function (r) {
            var a = r && r[0];
            if (!a) throw hasErr("Hive account @" + name + " was not found.");
            var keys = [];
            ["posting", "active", "owner"].forEach(function (t) { ((a[t] && a[t].key_auths) || []).forEach(function (k) { keys.push(k[0]); }); });
            if (keys.indexOf(pub) < 0) throw hasErr("The Keychain app answered with a key that is not one of @" + name + "'s keys. Pick that account in the app.");
        }, function () {});
    }
    function logout() { var s = ls(); if (s) try { s.removeItem(LS_USER); s.removeItem(LS_HAS); } catch (e) {} emit(); }
    function need() { var u = user(); if (!u) { var e = new Error("Log in with Hive first."); e.code = "nologin"; throw e; } return u; }

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
        return '<div class="mh-help"><b>No Hive Keychain extension in this browser?</b> Just press <b>Log in</b>: you can approve with the free ' +
            '<a href="' + KC_APP + '" target="_blank" rel="noopener">Hive Keychain app</a> for iPhone or Android instead (HiveAuth, the phone login 3Speak uses). ' +
            'On a phone that has the app, tap <b>Open the Keychain app</b>; on a computer, scan the QR code with the app. Your keys stay in the app and mes.fm never sees them. ' +
            'On a computer you can also install the extension for ' +
            '<a href="https://chromewebstore.google.com/detail/hive-keychain/jcacnejopjdphbnjgfaaobbfafkihpep" target="_blank" rel="noopener">Chrome / Brave / Edge</a> or ' +
            '<a href="https://addons.mozilla.org/firefox/addon/hive-keychain/" target="_blank" rel="noopener">Firefox</a>. ' +
            'No Hive account yet? <a href="https://signup.hive.io/" target="_blank" rel="noopener">Get one at signup.hive.io</a>.</div>';
    }
    function memoOk() { return via() !== "hiveauth"; }

    var api = {
        NODES: NODES, APP: APP, call: call, render: render, plain: plain, esc: esc,
        parseUrl: parseUrl, validName: validName, cleanName: cleanName, avatar: avatar, peakd: peakd, proxyImg: proxyImg,
        timeAgo: timeAgo, money: money, replyPermlink: replyPermlink,
        user: user, login: login, logout: logout, onChange: onChange, keychain: keychain, hasKeychain: hasKeychain, signer: signer,
        post: post, vote: vote, transfer: transfer, recurrentTransfer: recurrentTransfer, helpHtml: helpHtml,
        via: via, memoOk: memoOk, extension: extension, NO_MEMO: NO_MEMO, kcExplain: kcExplain, kcError: kcError, wrapKC: wrapKC,
        hiveAuth: { HOST: HAS_HOST, md5: md5, evpKdf: evpKdf, aesEncrypt: aesEncrypt, aesDecrypt: aesDecrypt, link: hasLink, ops: opsFor,
            describe: describeOps, session: hasSession, shim: hasShim, request: hasRequest, auth: hasAuth, uuid: uuid4, _state: HAS }
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.MESHive = root.MESHive || api;
})(typeof window !== "undefined" ? window : globalThis);
