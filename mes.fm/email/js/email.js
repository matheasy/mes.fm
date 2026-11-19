/* MESMail: the pure core of MES Mail (mes.fm/email), window.MESMail; also require()-able in node for tests
   (node tool_apps_src/email-tests.js).

   How a message travels
   - Every user has ONE key pair: X-Wing = ML-KEM-768 (the NIST post-quantum KEM, FIPS 203) combined with X25519, so a message
     stays safe if EITHER part holds (a quantum computer breaks X25519; a future flaw in ML-KEM would not open it either). The
     keys are made from a passphrase: seed = PBKDF2-SHA256(passphrase, "mes_mail/1/<account>", 600,000 rounds), 32 bytes, and
     X-Wing's keygen is deterministic from that seed, so the same passphrase gives the same keys on any device.
   - The public key (1,216 bytes) is published in the account's posting_json_metadata under "mes_mail" (one Keychain approval
     with the posting key, account_update2), merged into whatever profile data is already there.
   - Sending: a fresh random 32-byte AES-256-GCM key encrypts the (deflated) message {s subject, b body, th thread, re parent, t time}.
     For every recipient AND the sender (so Sent stays readable) X-Wing encapsulates a shared secret to their public key; HKDF of it
     encrypts the message key (48 bytes). The envelope {v, f, to, k: {name: [kem ciphertext, wrapped key]}, iv, z, d} is split into
     custom_json ops id "mes_mail" {v, m: message id, i, c, p: piece} signed by the sender's posting key (<= 8,192 bytes each,
     5 per transaction).
   - A custom_json only shows up in the SENDER's account history, so each recipient also gets a 0.001 HBD transfer whose memo is
     the notice "📧 New encrypted message on mes.fm/email #m<id>". Transfers appear in both histories: the recipient's inbox is
     simply their incoming notices, and the message itself is then read from the sender's history.
   - The AES additional data binds version, sender, message id and recipients, so pieces can't be passed off as another message.
     The custom_json is signed by the sender on chain: that IS the proof of who sent it (assemble() only accepts ops whose signer
     equals the envelope's "f").
   What stays public: who wrote to whom, when, and the size. Subject and body are encrypted. Nothing can be deleted from Hive.

   The KEM is injected: setKem({keygen(seed32) -> {publicKey, secretKey}, encapsulate(pub) -> {cipherText, sharedSecret},
   decapsulate(ct, sk) -> sharedSecret}) = @noble/post-quantum's ml_kem768_x25519 (hybrid.js). Web Crypto does the rest. */
(function (root) {
    "use strict";

    var ID = "mes_mail", V = 1;
    var ROUNDS = 600000;
    var PIECE = 7200;          /* characters of envelope per op (op json stays well under 8,192 bytes) */
    var OPS_PER_TX = 5;        /* HIVE_CUSTOM_OP_BLOCK_LIMIT */
    var MAX_PIECES = 15;       /* ~108 KB envelope */
    var MAX_TO = 10;
    var SUBJ_MAX = 200, BODY_MAX = 50000;
    var SINCE = "2026-11-17T00:00:00";     /* no MES Mail op can be older than the launch */
    var F_TRANSFER = 4, F_CUSTOM = 262144; /* account_history operation filter bits (1 << op id) */
    var NOTICE_TXT = "📧 New encrypted message on mes.fm/email #m";
    var NOTICE_RE = /mes\.fm\/email #m([0-9a-f]{16})\b/;
    var NAME_RE = /^[a-z][a-z0-9-]{1,14}[a-z0-9](\.[a-z][a-z0-9-]{1,14}[a-z0-9])*$/;
    var kem = null;

    function setKem(k) { kem = k; }
    function needKem() { if (!kem) throw new Error("The encryption library has not loaded yet."); return kem; }
    function subtle() { return (root.crypto || globalThis.crypto).subtle; }
    function rand(n) { var b = new Uint8Array(n); (root.crypto || globalThis.crypto).getRandomValues(b); return b; }

    /* ---------- bytes ---------- */
    function utf8(s) { return new TextEncoder().encode(s); }
    function unutf8(b) { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
    function b64(bytes) {
        var s = "", CH = 0x8000;
        for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
    }
    function unb64(s) {
        if (typeof s !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error("bad base64");
        var bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
        var o = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
        return o;
    }
    function hex(b) { return Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); }
    function newId() { return hex(rand(8)); }

    function deflate(bytes) {
        if (typeof CompressionStream === "undefined") return Promise.resolve(null);
        try {
            var s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
            return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); }, function () { return null; });
        } catch (e) { return Promise.resolve(null); }
    }
    function inflate(bytes) {
        var s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }

    /* ---------- names, passphrases ---------- */
    function cleanName(s) { return String(s || "").trim().toLowerCase().replace(/^@/, ""); }
    function validName(s) { s = cleanName(s); return s.length >= 3 && s.length <= 16 && NAME_RE.test(s); }
    function parseTo(text) {
        var out = [], bad = [];
        String(text || "").split(/[\s,;]+/).forEach(function (w) {
            if (!w) return;
            var n = cleanName(w);
            if (!validName(n)) bad.push(w);
            else if (out.indexOf(n) < 0) out.push(n);
        });
        return { names: out, bad: bad };
    }
    function passBits(p) {
        p = String(p || "");
        if (!p) return 0;
        var words = p.trim().split(/[\s\-_.,]+/).filter(Boolean);
        var pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(p) ? 26 : 0) + (/[0-9]/.test(p) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(p) ? 33 : 0);
        var uniq = {}; p.split("").forEach(function (c) { uniq[c] = 1; });
        var len = Math.min(p.length, Object.keys(uniq).length * 3);
        var bits = Math.round(len * Math.log2(Math.max(pool, 2)));
        if (/^(.)\1+$/.test(p) || /password|qwerty|letmein|123456/i.test(p)) bits = Math.min(bits, 20);
        if (words.length >= 4 && words.every(function (w) { return /^[a-z]+$/i.test(w); })) bits = Math.min(bits, words.length * 11);
        return bits;
    }
    var GEN = "abcdefghjkmnpqrstuvwxyz23456789";
    function generatePass(groups) {
        groups = groups || 6;
        var out = [];
        for (var g = 0; g < groups; g++) {
            var w = "";
            while (w.length < 5) { var x = rand(1)[0]; if (x < 248) w += GEN[x % 31]; }
            out.push(w);
        }
        return out.join("-");     /* 6 x 5 x log2(31) = ~149 bits */
    }

    /* ---------- keys ---------- */
    function deriveSeed(pass, account, rounds) {
        var salt = utf8(ID + "/" + V + "/" + cleanName(account));
        return subtle().importKey("raw", utf8(String(pass).normalize("NFC")), "PBKDF2", false, ["deriveBits"]).then(function (base) {
            return subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: rounds || ROUNDS }, base, 256);
        }).then(function (b) { return new Uint8Array(b); });
    }
    function keysFromSeed(seed) {
        var k = needKem().keygen(seed);
        return { pub: k.publicKey, sk: k.secretKey };
    }
    function fingerprint(pub) {
        return subtle().digest("SHA-256", pub).then(function (d) {
            return hex(new Uint8Array(d)).slice(0, 24).match(/.{4}/g).join(" ");
        });
    }
    /* posting_json_metadata string -> {pub, t} | null */
    function profileKey(metaStr) {
        var m;
        try { m = typeof metaStr === "string" ? (metaStr ? JSON.parse(metaStr) : {}) : metaStr || {}; } catch (e) { return null; }
        var e = m && m.mes_mail;
        if (!e || e.v !== V || typeof e.k !== "string") return null;
        try { var pub = unb64(e.k); return pub.length === 1216 ? { pub: pub, t: e.t || "" } : null; } catch (er) { return null; }
    }
    /* keep every other field of the profile; refuse to touch metadata we can't read (would wipe someone's profile) */
    function mergeProfile(metaStr, pub, now) {
        var m = {};
        if (metaStr) {
            try { m = JSON.parse(metaStr); } catch (e) { throw new Error("Your profile data could not be read, so it was left alone."); }
            if (!m || typeof m !== "object" || Array.isArray(m)) throw new Error("Your profile data has an unexpected shape, so it was left alone.");
        }
        m.mes_mail = { v: V, k: b64(pub), t: new Date(now || Date.now()).toISOString().slice(0, 19) };
        return JSON.stringify(m);
    }

    /* ---------- AES / HKDF ---------- */
    function aesKey(raw, use) { return subtle().importKey("raw", raw, "AES-GCM", false, use); }
    function wrapKeyFrom(ss, msgId, name) {
        return subtle().importKey("raw", ss, "HKDF", false, ["deriveKey"]).then(function (base) {
            return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt: utf8(msgId), info: utf8(ID + "/" + V + "/wrap/" + name) },
                base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        });
    }
    var ZIV = new Uint8Array(12);   /* each wrap key is used exactly once, so a fixed nonce is safe */
    function aad(from, msgId, to) { return utf8(ID + "/" + V + "/" + from + "/" + msgId + "/" + to.join(",")); }

    function cleanPayload(p) {
        var s = String(p.s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, SUBJ_MAX);
        var b = String(p.b || "").replace(/\r\n?/g, "\n").slice(0, BODY_MAX);
        var o = { s: s, b: b, t: p.t || new Date().toISOString().slice(0, 19) };
        if (p.th && /^[0-9a-f]{16}$/.test(p.th)) o.th = p.th;
        if (p.re && /^[0-9a-f]{16}$/.test(p.re)) o.re = p.re;
        return o;
    }

    /* o = {from, to: [names], pubs: {name: Uint8Array}, payload: {s, b, th?, re?}, msgId?} -> Promise {msgId, env} */
    function seal(o) {
        var from = cleanName(o.from), to = o.to.map(cleanName);
        if (!validName(from)) throw new Error("Bad sender");
        if (!to.length) throw new Error("Add at least one recipient.");
        if (to.length > MAX_TO) throw new Error("At most " + MAX_TO + " recipients.");
        to.sort();
        var msgId = o.msgId || newId();
        var who = to.indexOf(from) < 0 ? to.concat([from]) : to.slice();
        var payload = cleanPayload(o.payload || {});
        if (!payload.b.trim() && !payload.s) throw new Error("Write a message first.");
        if (!payload.th) payload.th = msgId;
        var K = rand(32), iv = rand(12), raw = utf8(JSON.stringify(payload));
        var env = { v: V, f: from, to: to, k: {}, iv: b64(iv), z: "" };
        return deflate(raw).then(function (z) {
            var body = raw;
            if (z && z.length < raw.length) { body = z; env.z = "d"; }
            return aesKey(K, ["encrypt"]).then(function (k) {
                return subtle().encrypt({ name: "AES-GCM", iv: iv, additionalData: aad(from, msgId, to) }, k, body);
            });
        }).then(function (ct) {
            env.d = b64(new Uint8Array(ct));
            return Promise.all(who.map(function (n) {
                var pub = o.pubs[n];
                if (!pub) throw new Error("@" + n + " has no MES Mail key yet.");
                var e = needKem().encapsulate(pub);
                return wrapKeyFrom(e.sharedSecret, msgId, n).then(function (wk) {
                    return subtle().encrypt({ name: "AES-GCM", iv: ZIV }, wk, K);
                }).then(function (w) { env.k[n] = [b64(e.cipherText), b64(new Uint8Array(w))]; });
            }));
        }).then(function () { return { msgId: msgId, env: env, payload: payload }; });
    }

    /* env + my name + my secret key -> Promise payload */
    function open(env, msgId, me, sk) {
        me = cleanName(me);
        if (!env || env.v !== V || !Array.isArray(env.to) || !env.k) return Promise.reject(new Error("Not a MES Mail message"));
        var slot = env.k[me];
        if (!slot) return Promise.reject(Object.assign(new Error("This message was not sent to you."), { code: "notforme" }));
        var ss;
        try { ss = needKem().decapsulate(unb64(slot[0]), sk); } catch (e) { return Promise.reject(new Error("Could not unlock the message key.")); }
        return wrapKeyFrom(ss, msgId, me).then(function (wk) {
            return subtle().decrypt({ name: "AES-GCM", iv: ZIV }, wk, unb64(slot[1]));
        }).then(function (K) {
            return aesKey(new Uint8Array(K), ["decrypt"]);
        }).then(function (k) {
            return subtle().decrypt({ name: "AES-GCM", iv: unb64(env.iv), additionalData: aad(env.f, msgId, env.to) }, k, unb64(env.d));
        }).then(function (pt) {
            pt = new Uint8Array(pt);
            return env.z === "d" ? inflate(pt) : pt;
        }).then(function (raw) { return cleanPayload(JSON.parse(unutf8(raw))); },
            function (e) { throw e && e.code ? e : new Error("This message could not be decrypted (wrong key, or it was changed)."); });
    }

    /* ---------- ops ---------- */
    function split(env, msgId) {
        var s = JSON.stringify(env), n = Math.ceil(s.length / PIECE);
        if (n > MAX_PIECES) throw new Error("That message is too long for Hive (" + Math.round(s.length / 1000) + " KB encrypted, the limit is about " + Math.round(MAX_PIECES * PIECE / 1000) + " KB).");
        var out = [];
        for (var i = 0; i < n; i++) out.push({ v: V, m: msgId, i: i, c: n, p: s.slice(i * PIECE, (i + 1) * PIECE) });
        return out;
    }
    function batches(pieces) {
        var out = [];
        for (var i = 0; i < pieces.length; i += OPS_PER_TX) out.push(pieces.slice(i, i + OPS_PER_TX));
        return out;
    }
    function customOp(acc, piece) {
        return ["custom_json", { required_auths: [], required_posting_auths: [acc], id: ID, json: JSON.stringify(piece) }];
    }
    function noticeMemo(msgId) { return NOTICE_TXT + msgId; }
    /* the amount sent with each message (HBD / HIVE, 3 decimals, never below Hive's 0.001 minimum, capped at 1,000) */
    function cleanAmount(v) {
        var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", "."));
        if (!isFinite(n) || n < 0.001) n = 0.001;
        return Math.min(1000, Math.round(n * 1000) / 1000);
    }
    function fmtAmount(n, currency) { return cleanAmount(n).toFixed(3) + " " + (currency === "HIVE" ? "HIVE" : "HBD"); }
    /* "0.010 HBD" -> {n: 0.01, cur: "HBD"} | null */
    function parseAmount(str) {
        var m = /^\s*([0-9]+(?:\.[0-9]+)?)\s+(HBD|HIVE)\s*$/.exec(String(str || ""));
        return m ? { n: parseFloat(m[1]), cur: m[2] } : null;
    }
    /* inbox filter: setting {mode: "off" | "mark" | "hide", min}; amount string or null (unknown, e.g. notices seen before amounts were kept) */
    function lowPaid(amount, setting) {
        if (!setting || !setting.mode || setting.mode === "off") return false;
        var a = parseAmount(amount), min = parseFloat(setting.min);
        if (!a || !isFinite(min) || min <= 0) return false;
        return a.n + 1e-9 < min;
    }
    function noticeOps(from, to, msgId, currency, amount) {
        return to.filter(function (n) { return n !== from; }).map(function (n) {
            return ["transfer", { from: from, to: n, amount: fmtAmount(amount, currency), memo: noticeMemo(msgId) }];
        });
    }

    /* history entry ([idx, {trx_id, block, timestamp, op: [type, data]}]) helpers */
    function opOf(h) { var o = h && h[1] && h[1].op; return Array.isArray(o) ? { type: o[0], data: o[1] } : o && o.type ? { type: o.type.replace(/_operation$/, ""), data: o.value } : null; }
    /* a mes_mail piece from a history entry -> {signer, m, i, c, p, t, trx} | null */
    function pieceOf(h) {
        var o = opOf(h);
        if (!o || o.type !== "custom_json" || !o.data || o.data.id !== ID) return null;
        var auths = o.data.required_posting_auths || [];
        if (auths.length !== 1 || (o.data.required_auths || []).length) return null;
        var j;
        try { j = JSON.parse(o.data.json); } catch (e) { return null; }
        if (!j || j.v !== V || !/^[0-9a-f]{16}$/.test(j.m) || typeof j.p !== "string") return null;
        if (!(j.c >= 1 && j.c <= MAX_PIECES && j.i >= 0 && j.i < j.c)) return null;
        return { signer: auths[0], m: j.m, i: j.i, c: j.c, p: j.p, t: h[1].timestamp || "", trx: h[1].trx_id || "", idx: h[0] };
    }
    /* pieces -> {"signer/m": {from, msgId, env, t, trx}} for every complete, well-formed message whose envelope sender = signer */
    function assemble(pieces) {
        var by = {}, out = {};
        pieces.forEach(function (p) {
            if (!p) return;
            var key = p.signer + "/" + p.m;
            var g = by[key] || (by[key] = { c: p.c, parts: {}, t: p.t, trx: p.trx });
            if (g.c !== p.c) return;
            if (!(p.i in g.parts)) g.parts[p.i] = p.p;
            if (p.i === 0) { g.t = p.t; g.trx = p.trx; }
        });
        Object.keys(by).forEach(function (key) {
            var g = by[key], s = "";
            for (var i = 0; i < g.c; i++) { if (!(i in g.parts)) return; s += g.parts[i]; }
            var env;
            try { env = JSON.parse(s); } catch (e) { return; }
            var signer = key.split("/")[0], m = key.split("/")[1];
            if (!env || env.v !== V || env.f !== signer || !Array.isArray(env.to) || !env.k || typeof env.d !== "string") return;
            out[key] = { from: signer, msgId: m, env: env, t: g.t, trx: g.trx };
        });
        return out;
    }
    /* incoming transfer -> notice {from, to, msgId, t, trx} | classic memo {from, to, memo, amount, t, trx, classic: true} | null */
    function transferOf(h) {
        var o = opOf(h);
        if (!o || o.type !== "transfer" || !o.data) return null;
        var d = o.data, memo = String(d.memo || ""), amt = typeof d.amount === "string" ? d.amount : "";
        var base = { from: d.from, to: d.to, t: h[1].timestamp || "", trx: h[1].trx_id || "", idx: h[0], amount: amt };
        var m = NOTICE_RE.exec(memo);
        if (m) return Object.assign(base, { msgId: m[1] });
        if (memo.charAt(0) === "#" && memo.length > 40) return Object.assign(base, { memo: memo, classic: true });
        return null;
    }

    /* ---------- reading the chain (call(method, params) -> Promise result) ---------- */
    /* newest-first walk of an account's history with a filter; onPage(entries newest last) returns true to stop */
    function walk(call, account, filter, opt, onPage) {
        opt = opt || {};
        var start = -1, n = 0, pages = opt.pages || 20, top = -1;
        function page() {
            var lim = start < 0 ? 1000 : Math.min(1000, start + 1);
            return call("condenser_api.get_account_history", [account, start, lim, filter, 0]).then(function (r) {
                r = r || [];
                n++;
                if (r.length && top < 0) top = r[r.length - 1][0];
                var stop = onPage(r);
                var oldest = r.length ? r[0][0] : 0, oldT = r.length ? r[0][1].timestamp || "" : "";
                if (stop || n >= pages || r.length < 2 || oldest <= 0) return top;
                if (opt.until != null && oldest <= opt.until) return top;
                if (opt.since && oldT && oldT < opt.since) return top;
                start = oldest - 1;
                return page();
            }, function (e) { if (/does not exist|unknown account/i.test(e.message)) return top; throw e; });
        }
        return page();
    }
    /* my own history since cache.top: notices + classic memos (both ways) + my sent pieces */
    function scanMine(call, me, cache, opt) {
        cache = cache || {};
        opt = opt || {};
        var notices = [], classic = [], pieces = [];
        return walk(call, me, F_TRANSFER | F_CUSTOM, { pages: opt.pages || (cache.top != null ? 10 : 5), until: cache.top, since: opt.since }, function (r) {
            r.forEach(function (h) {
                if (cache.top != null && h[0] <= cache.top) return;
                var tr = transferOf(h);
                if (tr) { if (tr.classic) classic.push(tr); else if (tr.to === me && tr.from !== me) notices.push(tr); return; }
                var p = pieceOf(h);
                if (p && p.signer === me) pieces.push(p);
            });
        }).then(function (top) {
            return { top: top < 0 ? cache.top : Math.max(top, cache.top == null ? -1 : cache.top), notices: notices, classic: classic, pieces: pieces };
        });
    }
    /* find the pieces of the wanted message ids in a sender's history (custom_json only), back to oldest needed time - 1 h */
    function fetchFrom(call, sender, ids, oldestT) {
        var want = {}, got = [];
        ids.forEach(function (m) { want[m] = 1; });
        var since = oldestT ? new Date(Date.parse(oldestT + (oldestT.slice(-1) === "Z" ? "" : "Z")) - 3600000).toISOString().slice(0, 19) : SINCE;
        if (since < SINCE) since = SINCE;
        return walk(call, sender, F_CUSTOM, { pages: 12, since: since }, function (r) {
            r.forEach(function (h) { var p = pieceOf(h); if (p && p.signer === sender && want[p.m]) got.push(p); });
            var asm = assemble(got);
            return ids.every(function (m) { return asm[sender + "/" + m]; });
        }).then(function () { return assemble(got); });
    }

    /* ---------- threads ---------- */
    /* msgs = [{key, from, to, msgId, t, payload, me}] -> [{th, subject, last, msgs (oldest first), people, inbox, sent}] newest first */
    function threads(msgs, me) {
        var by = {};
        msgs.forEach(function (x) {
            var th = (x.payload && x.payload.th) || x.msgId;
            var g = by[th] || (by[th] = { th: th, msgs: [], people: {}, inbox: false, sent: false });
            if (g.msgs.some(function (y) { return y.key === x.key; })) return;
            g.msgs.push(x);
            if (x.from === me) g.sent = true; else g.inbox = true;
            [x.from].concat(x.to || []).forEach(function (p) { if (p !== me) g.people[p] = 1; });
        });
        return Object.keys(by).map(function (k) {
            var g = by[k];
            g.msgs.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
            g.last = g.msgs[g.msgs.length - 1];
            var first = g.msgs.filter(function (m) { return m.payload && m.payload.s; })[0];
            g.subject = first ? first.payload.s.replace(/^(re:\s*)+/i, "") : "";
            g.people = Object.keys(g.people);
            return g;
        }).sort(function (a, b) { return a.last.t < b.last.t ? 1 : a.last.t > b.last.t ? -1 : 0; });
    }
    function replySubject(s) { s = String(s || "").trim(); return /^re:/i.test(s) ? s : s ? "Re: " + s : ""; }
    function replyAll(msg, me) {
        var out = [];
        [msg.from].concat(msg.to || []).forEach(function (n) { if (n !== me && out.indexOf(n) < 0) out.push(n); });
        return out.length ? out : [msg.from];
    }
    function quote(text, who, t) {
        var lines = String(text || "").split("\n").slice(0, 60).map(function (l) { return "> " + l; });
        return "\n\nOn " + String(t || "").replace("T", " ").slice(0, 16) + " UTC, @" + who + " wrote:\n" + lines.join("\n");
    }
    /* rough size check before signing: envelope ~ 1.65 KB per person + 1.37 x body bytes */
    function estimate(to, from, body, subject) {
        var people = to.length + (to.indexOf(from) < 0 ? 1 : 0);
        var bytes = 160 + people * 1600 + Math.ceil((utf8(String(body || "")).length + utf8(String(subject || "")).length + 80) * 1.37);
        return { bytes: bytes, pieces: Math.ceil(bytes / PIECE), txs: Math.ceil(Math.ceil(bytes / PIECE) / OPS_PER_TX) };
    }

    var api = {
        ID: ID, V: V, ROUNDS: ROUNDS, PIECE: PIECE, MAX_PIECES: MAX_PIECES, MAX_TO: MAX_TO, SUBJ_MAX: SUBJ_MAX, BODY_MAX: BODY_MAX,
        SINCE: SINCE, F_TRANSFER: F_TRANSFER, F_CUSTOM: F_CUSTOM, NOTICE_RE: NOTICE_RE,
        setKem: setKem, b64: b64, unb64: unb64, hex: hex, utf8: utf8, newId: newId,
        cleanName: cleanName, validName: validName, parseTo: parseTo, passBits: passBits, generatePass: generatePass,
        deriveSeed: deriveSeed, keysFromSeed: keysFromSeed, fingerprint: fingerprint, profileKey: profileKey, mergeProfile: mergeProfile,
        seal: seal, open: open, split: split, batches: batches, customOp: customOp, noticeMemo: noticeMemo, noticeOps: noticeOps, cleanAmount: cleanAmount, fmtAmount: fmtAmount, parseAmount: parseAmount, lowPaid: lowPaid,
        pieceOf: pieceOf, assemble: assemble, transferOf: transferOf, walk: walk, scanMine: scanMine, fetchFrom: fetchFrom,
        threads: threads, replySubject: replySubject, replyAll: replyAll, quote: quote, estimate: estimate
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.MESMail = api;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Mail page (mes.fm/email). Core maths in lib.js (window.MESMail); Hive login / signing through /main_js/hive.js (MESHive).
   On localhost / 127.0.0.1 or with ?mock=1 the page runs on a pretend chain in localStorage ("mes-email:mockchain") so two tabs can
   write to each other without Keychain. */
(function () {
	"use strict";
	var M = window.MESMail;
	var $ = function (id) { return document.getElementById(id); };
	var root = $("em");
	if (!root || !M) return;

	var NOBLE = "https://cdn.jsdelivr.net/npm/@noble/post-quantum@0.7.1/hybrid.js/+esm";
	var NOBLE2 = "https://esm.sh/@noble/post-quantum@0.7.1/hybrid.js";
	var MOCK = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var LS = "mes-email:";
	var TX_GAP = 3500;

	function ls(k, v) {
		try {
			if (v === undefined) { var s = localStorage.getItem(LS + k); return s ? JSON.parse(s) : null; }
			if (v === null) localStorage.removeItem(LS + k); else localStorage.setItem(LS + k, JSON.stringify(v));
		} catch (e) { return null; }
	}
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
	function toast(msg) { var t = $("em-toast"); if (!t) { t = el("div", "tu-toast"); t.id = "em-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 3200); }
	function status(msg, bad) { var s = $("em-status"); s.textContent = msg || ""; s.classList.toggle("is-bad", !!bad); }
	function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
	function when(t) {
		if (!t) return "";
		var d = new Date(t + (/Z$/.test(t) ? "" : "Z")), now = new Date();
		if (isNaN(d)) return t;
		if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
		if (now - d < 300 * 864e5) return d.toLocaleDateString([], { month: "short", day: "numeric" });
		return d.toLocaleDateString();
	}
	function whenLong(t) { var d = new Date(t + (/Z$/.test(t) ? "" : "Z")); return isNaN(d) ? t : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
	function avatar(n) { return '<img class="em-av" alt="" loading="lazy" src="https://images.hive.blog/u/' + encodeURIComponent(n) + '/avatar/small" onerror="this.style.visibility=\'hidden\'">'; }
	/* message text -> safe HTML: escaped, links made clickable (no images: they could track who opened a message), > quotes */
	function renderBody(text) {
		var lines = String(text || "").split("\n"), out = [], q = [];
		function flushQ() { if (q.length) { out.push('<blockquote>' + q.join("<br>") + '</blockquote>'); q = []; } }
		lines.forEach(function (l) {
			var h = esc(l).replace(/(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="nofollow noopener noreferrer">$1</a>')
				.replace(/(^|[\s(])@([a-z][a-z0-9.-]{2,15})\b/g, '$1<a href="https://peakd.com/@$2" target="_blank" rel="noopener">@$2</a>')
				.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
			if (/^&gt;\s?/.test(h)) q.push(h.replace(/^&gt;\s?/, "")); else { flushQ(); out.push(h); }
		});
		flushQ();
		return out.join("<br>").replace(/(<br>){3,}/g, "<br><br>");
	}

	/* ================= Hive access (real or pretend) ================= */
	var H;
	if (!MOCK) {
		var MH = window.MESHive;
		var kc = function (fn) {
			return MH.keychain().then(function (k) {
				if (!k) throw new Error("Hive Keychain was not found. Install it, or use the Keychain phone app.");
				return new Promise(function (res, rej) { fn(k, function (r) { if (r && r.success) res(r); else rej(MH.kcError(r)); }); });
			});
		};
		H = {
			user: function () { var u = MH.user(); return u && u.name; },
			login: function (n) { return MH.login(n).then(function (u) { return u.name; }); },
			logout: function () { MH.logout(); },
			call: function (m, p) { return MH.call(m, p, { timeout: 15000 }); },
			broadcast: function (ops, key, title) { var a = H.user(); return kc(function (k, d) { k.requestBroadcast(a, ops, key, d, null, title); }); },
			classicSend: function (to, text, cur) { var a = H.user(); return kc(function (k, d) { k.requestTransfer(a, to, "0.001", "#" + text, cur, d, true); }); },
			decodeMemo: function (memo) { var a = H.user(); return kc(function (k, d) { k.requestVerifyKey(a, memo, "Memo", d); }).then(function (r) { return String(r.result || ""); }); },
			memoOk: function () { return MH.memoOk(); },
			onChange: function (fn) { MH.onChange(fn); }
		};
	} else {
		/* ---------- pretend chain ---------- */
		var chain = function () { return ls("mockchain") || { acc: {}, h: {}, n: 0 }; };
		var save = function (c) { ls("mockchain", c); };
		var hpush = function (c, acc, op) {
			c.n++;
			(c.h[acc] = c.h[acc] || []).push([c.h[acc].length, { trx_id: "mock" + c.n, block: c.n, timestamp: new Date().toISOString().slice(0, 19), op: op }]);
		};
		var ensure = function (c, n) { if (!c.acc[n]) { c.acc[n] = { meta: "", hbd: 5 }; } };
		var mu = function () { try { return sessionStorage.getItem(LS + "mockuser"); } catch (e) { return null; } };
		var listeners = [];
		H = {
			user: function () { return mu(); },
			login: function (n) { n = M.cleanName(n); if (!M.validName(n)) return Promise.reject(new Error("That is not a valid Hive username.")); var c = chain(); ensure(c, n); save(c); try { sessionStorage.setItem(LS + "mockuser", n); } catch (e) {} return Promise.resolve(n); },
			logout: function () { try { sessionStorage.removeItem(LS + "mockuser"); } catch (e) {} },
			call: function (m, p) {
				var c = chain();
				return sleep(60).then(function () {
					if (m === "condenser_api.get_accounts") return p[0].filter(function (n) { return c.acc[n]; }).map(function (n) { return { name: n, posting_json_metadata: c.acc[n].meta, hbd_balance: c.acc[n].hbd.toFixed(3) + " HBD" }; });
					if (m === "condenser_api.get_account_history") {
						var h = c.h[p[0]] || [], start = p[1], lim = p[2], f = p[3];
						h = h.filter(function (e) { var t = e[1].op[0]; return (f & M.F_TRANSFER && t === "transfer") || (f & M.F_CUSTOM && t === "custom_json"); });
						var end = start < 0 ? h.length - 1 : h.reduce(function (a, e, i) { return e[0] <= start ? i : a; }, -1);
						return h.slice(Math.max(0, end - lim + 1), end + 1);
					}
					throw new Error("mock: " + m);
				});
			},
			broadcast: function (ops) {
				if (!confirm("Test mode: pretend to sign " + ops.length + " operation(s) (" + ops.map(function (o) { return o[0]; }).join(", ") + ")?")) return Promise.reject(new Error("You cancelled in Keychain."));
				var c = chain(), me = mu();
				ops.forEach(function (o) {
					var d = o[1];
					if (o[0] === "custom_json") hpush(c, me, o);
					else if (o[0] === "transfer") { ensure(c, d.to); hpush(c, d.from, o); if (d.to !== d.from) hpush(c, d.to, o); }
					else if (o[0] === "account_update2") c.acc[me].meta = d.posting_json_metadata;
				});
				save(c);
				return sleep(200).then(function () { return { success: true, result: { id: "mock" + c.n } }; });
			},
			classicSend: function (to, text, cur) { return H.broadcast([["transfer", { from: mu(), to: to, amount: "0.001 " + cur, memo: "#mock-memo-key-encrypted-stand-in:" + M.b64(M.utf8(text)) }]]); },
			decodeMemo: function (memo) { return Promise.resolve("#" + new TextDecoder().decode(M.unb64(memo.replace(/^#mock-memo-key-encrypted-stand-in:/, "")))); },
			memoOk: function () { return true; },
			onChange: function (fn) { listeners.push(fn); }
		};
		window.addEventListener("storage", function (e) { if (e.key === LS + "mockchain" && S.keys) refresh(true); });
	}

	/* ================= state ================= */
	var S = {
		me: null, keys: null, published: null, folder: "inbox", th: null, q: "",
		cache: null, open: {}, threads: [], keyCache: {}, busy: false
	};
	var prefs = ls("v1") || { cur: "HBD" };
	function savePrefs() { ls("v1", prefs); }

	var kemP = null;
	function loadKem() {
		if (kemP) return kemP;
		var imp = new Function("u", "return import(u)");
		kemP = imp(NOBLE).catch(function () { return imp(NOBLE2); }).then(function (mod) {
			if (!mod || !mod.ml_kem768_x25519) throw new Error("bad module");
			M.setKem(mod.ml_kem768_x25519);
		}).catch(function (e) { kemP = null; throw new Error("The encryption library could not be loaded. Check your connection and reload the page."); });
		return kemP;
	}

	function show(id) { ["em-login", "em-setup", "em-unlock", "em-app"].forEach(function (x) { $(x).hidden = x !== id; }); }
	function paintWho() {
		var w = $("em-who");
		if (!S.me) { w.innerHTML = '<span class="em-brand">📧 MES Mail</span>'; }
		else w.innerHTML = avatar(S.me) + '<span><b>@' + esc(S.me) + '</b><small>' + (S.keys ? '🔓 unlocked' : S.published ? '🔒 locked' : 'not set up yet') + '</small></span>';
		$("em-logout").hidden = !S.me;
		$("em-lock").hidden = !S.keys;
		$("em-refresh").hidden = !S.keys;
	}

	/* ================= accounts and keys ================= */
	function getAccounts(names) {
		var need = names.filter(function (n) { return !(n in S.keyCache); });
		if (!need.length) return Promise.resolve();
		return H.call("condenser_api.get_accounts", [need]).then(function (r) {
			var found = {};
			(r || []).forEach(function (a) { found[a.name] = 1; S.keyCache[a.name] = { exists: true, key: M.profileKey(a.posting_json_metadata), meta: a.posting_json_metadata || "" }; });
			need.forEach(function (n) { if (!found[n]) S.keyCache[n] = { exists: false, key: null }; });
		});
	}
	function start() {
		S.me = H.user();
		S.keys = null; S.published = null; S.cache = null; S.open = {}; S.threads = []; S.th = null; S.folder = "inbox"; S.q = ""; S.memoTxt = {}; S.cls = null;
		root.classList.remove("em-reading"); $("em-cf").hidden = true; $("em-thread").hidden = true; $("em-classicv").hidden = true; $("em-empty").hidden = false;
		paintWho();
		$("em-mock").hidden = !MOCK;
		if (!S.me) { show("em-login"); $("em-kchelp").innerHTML = MOCK || !window.MESHive ? "" : MESHive.helpHtml(); status(""); return; }
		status("Reading your account…");
		delete S.keyCache[S.me];
		getAccounts([S.me]).then(function () {
			var a = S.keyCache[S.me];
			if (!a.exists) { status("Hive account @" + S.me + " was not found.", true); return; }
			S.published = a.key;
			paintWho();
			var saved = ls("seed:" + S.me);
			if (S.published && saved) {
				status("Unlocking…");
				return loadKem().then(function () { return useSeed(M.unb64(saved), false); }).catch(function (e) { status(e.message, true); show("em-unlock"); });
			}
			status("");
			if (S.published) { show("em-unlock"); setTimeout(function () { $("em-up").focus(); }, 50); }
			else { show("em-setup"); resetSetup(); }
			loadKem().catch(function (e) { status(e.message, true); });
		}).catch(function (e) { status("Could not reach a Hive node: " + e.message, true); });
	}
	function useSeed(seed, remember) {
		var k = M.keysFromSeed(seed);
		if (S.published && M.hex(k.pub) !== M.hex(S.published.pub)) {
			ls("seed:" + S.me, null);
			throw new Error("That passphrase doesn't match the mail key on your account.");
		}
		if (remember) ls("seed:" + S.me, M.b64(seed));
		S.keys = k;
		S.cache = ls("c:" + S.me) || { top: null, notices: [], classic: [], env: {}, pend: [], nf: {} };
		S.read = ls("read:" + S.me) || {};
		show("em-app"); S.showLow = false; paintFilter();
		paintWho();
		M.fingerprint(k.pub).then(function (fp) {
			$("em-keybox").innerHTML = '<b>Your mail key</b><code>' + esc(fp) + '</code><small>Quantum-safe X-Wing (ML-KEM-768 + X25519). People who write to you see the same code.</small>';
		});
		decryptAll().then(function () { paint(); refresh(); });
	}

	/* ---------- setup ---------- */
	function resetSetup() { $("em-p1").value = $("em-p2").value = ""; $("em-wrote").checked = false; checkSetup(); }
	function checkSetup() {
		var p = $("em-p1").value, bits = M.passBits(p), okLen = p.length >= 12 && bits >= 60;
		var pct = Math.min(100, Math.round(bits / 1.3));
		$("em-bar").style.width = pct + "%";
		$("em-bar").className = bits >= 100 ? "is-good" : bits >= 60 ? "is-ok" : "is-weak";
		$("em-bits").textContent = p ? "About " + bits + " bits. " + (bits >= 100 ? "Strong." : bits >= 60 ? "OK, longer is safer." : "Too weak: use at least 12 characters, or press Make one for me.") : "Use at least 12 characters. Make one for me gives a random ~149-bit passphrase.";
		var same = p && p === $("em-p2").value;
		$("em-publish").disabled = !(okLen && same && $("em-wrote").checked);
		$("em-setupnote").textContent = p && $("em-p2").value && !same ? "The two passphrases are not the same." : "";
	}
	["em-p1", "em-p2"].forEach(function (id) { $(id).addEventListener("input", checkSetup); });
	$("em-wrote").addEventListener("change", checkSetup);
	$("em-gen").onclick = function () { var g = M.generatePass(); $("em-p1").value = $("em-p2").value = g; $("em-p1").type = $("em-p2").type = "text"; $("em-show").textContent = "Hide"; checkSetup(); };
	$("em-show").onclick = function () { var t = $("em-p1").type === "password" ? "text" : "password"; $("em-p1").type = $("em-p2").type = t; this.textContent = t === "text" ? "Hide" : "Show"; };
	$("em-publish").onclick = function () {
		var btn = this, pass = $("em-p1").value;
		btn.disabled = true;
		$("em-setupnote").textContent = "Making your keys…";
		var seed, keys;
		loadKem().then(function () { return M.deriveSeed(pass, S.me); }).then(function (s) {
			seed = s; keys = M.keysFromSeed(s);
			delete S.keyCache[S.me];
			return getAccounts([S.me]);
		}).then(function () {
			var meta = M.mergeProfile(S.keyCache[S.me].meta, keys.pub);
			if (meta.length > 60000) throw new Error("Your profile data is too big to add the key.");
			$("em-setupnote").textContent = "Approve in Keychain (Posting key)…";
			return H.broadcast([["account_update2", { account: S.me, json_metadata: "", posting_json_metadata: meta, extensions: [] }]], "Posting", "Publish your MES Mail key");
		}).then(function () {
			S.published = { pub: keys.pub };
			S.keyCache[S.me] = { exists: true, key: S.published };
			toast("Your mail key is published. You can receive mail now.");
			useSeed(seed, $("em-rem1").checked);
		}).catch(function (e) { $("em-setupnote").textContent = e.message; btn.disabled = false; checkSetup(); });
	};
	$("em-unlockf").onsubmit = function (ev) {
		ev.preventDefault();
		var p = $("em-up").value;
		if (!p) return;
		$("em-unlocknote").textContent = "Unlocking…";
		loadKem().then(function () { return M.deriveSeed(p, S.me); }).then(function (seed) {
			useSeed(seed, $("em-rem2").checked);
			$("em-up").value = ""; $("em-unlocknote").textContent = "";
		}).catch(function (e) { $("em-unlocknote").textContent = e.message; });
	};
	$("em-rekey").onclick = function () {
		if (!confirm("Make a new mail key? Messages sent to your old key can never be opened again.")) return;
		S.published = null; ls("seed:" + S.me, null); show("em-setup"); resetSetup(); paintWho();
	};
	$("em-loginf").onsubmit = function (ev) {
		ev.preventDefault();
		var n = $("em-user").value;
		status("Logging in…");
		H.login(n).then(function () { start(); }).catch(function (e) { status(e.message, true); });
	};
	$("em-logout").onclick = function () { H.logout(); start(); };
	$("em-lock").onclick = function () { ls("seed:" + S.me, null); S.keys = null; start(); };
	$("em-refresh").onclick = function () { refresh(); };
	H.onChange(function () { if (H.user() !== S.me) start(); });

	/* ================= reading ================= */
	function saveCache() {
		var c = S.cache, keys = Object.keys(c.env);
		if (keys.length > 400) keys.sort(function (a, b) { return c.env[a].t < c.env[b].t ? -1 : 1; }).slice(0, keys.length - 400).forEach(function (k) { delete c.env[k]; });
		c.notices = c.notices.slice(-600); c.classic = c.classic.slice(-300); c.pend = c.pend.slice(-60);
		ls("c:" + S.me, c);
	}
	function decryptAll() {
		var c = S.cache, jobs = [];
		Object.keys(c.env).forEach(function (k) {
			if (S.open[k]) return;
			var e = c.env[k];
			jobs.push(M.open(e.env, e.msgId, S.me, S.keys.sk).then(function (p) { S.open[k] = p; }, function (er) { S.open[k] = { err: er.message }; }));
		});
		return Promise.all(jobs).then(buildThreads);
	}
	function buildThreads() {
		var c = S.cache, msgs = [], amts = {};
		(c.notices || []).forEach(function (n) { if (n.amount) amts[n.from + "/" + n.msgId] = n.amount; });
		Object.keys(c.env).forEach(function (k) {
			var e = c.env[k], p = S.open[k];
			if (!p) return;
			msgs.push({ key: k, amt: e.from === S.me ? (c.sentAmt && c.sentAmt[k]) || null : amts[k] || null, from: e.from, to: e.env.to, msgId: e.msgId, t: e.t, trx: e.trx, payload: p.err ? { s: "(could not be opened)", b: p.err, th: e.msgId } : p, err: p.err });
		});
		S.threads = M.threads(msgs, S.me);
	}
	var refreshing = false;
	function refresh(quiet) {
		if (refreshing || !S.keys) return;
		refreshing = true;
		if (!quiet) status("Checking for mail…");
		var c = S.cache, me = S.me;
		M.scanMine(H.call, me, { top: c.top }).then(function (r) {
			c.top = r.top;
			var seenN = {}; c.notices.forEach(function (n) { seenN[n.from + "/" + n.msgId] = 1; });
			r.notices.forEach(function (n) { if (!seenN[n.from + "/" + n.msgId]) { c.notices.push({ from: n.from, msgId: n.msgId, t: n.t, trx: n.trx, amount: n.amount }); seenN[n.from + "/" + n.msgId] = 1; } });
			var seenC = {}; c.classic.forEach(function (x) { seenC[x.trx + x.memo.slice(1, 12)] = 1; });
			r.classic.forEach(function (x) { var k = x.trx + x.memo.slice(1, 12); if (!seenC[k]) { c.classic.push({ from: x.from, to: x.to, memo: x.memo, amount: x.amount, t: x.t, trx: x.trx }); seenC[k] = 1; } });
			var asm = M.assemble(c.pend.concat(r.pieces));
			var done = {};
			Object.keys(asm).forEach(function (k) { if (!c.env[k]) c.env[k] = asm[k]; done[asm[k].msgId] = 1; });
			c.pend = c.pend.concat(r.pieces).filter(function (p) { return !done[p.m]; });
			/* messages announced to me that we don't have yet, grouped by sender */
			var want = {};
			c.notices.forEach(function (n) {
				var k = n.from + "/" + n.msgId;
				if (c.env[k] || (c.miss && c.miss[k] > 2)) return;
				(want[n.from] = want[n.from] || []).push(n);
			});
			var senders = Object.keys(want);
			if (senders.length && !quiet) status("Fetching " + Object.values(want).reduce(function (a, l) { return a + l.length; }, 0) + " new message(s)…");
			return senders.reduce(function (p, s) {
				return p.then(function () {
					var list = want[s], oldest = list.reduce(function (a, n) { return !a || n.t < a ? n.t : a; }, "");
					return M.fetchFrom(H.call, s, list.map(function (n) { return n.msgId; }), oldest).then(function (got) {
						list.forEach(function (n) {
							var k = s + "/" + n.msgId;
							if (got[k]) c.env[k] = got[k];
							else { c.miss = c.miss || {}; c.miss[k] = (c.miss[k] || 0) + 1; }
						});
					}, function () {});
				});
			}, Promise.resolve());
		}).then(function () {
			saveCache();
			return decryptAll();
		}).then(function () {
			refreshing = false;
			paint();
			status(quiet ? "" : "Up to date · " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
		}).catch(function (e) { refreshing = false; status("Could not check for mail: " + e.message, true); });
	}
	setInterval(function () { if (S.keys && !document.hidden) refresh(true); }, 90000);
	document.addEventListener("visibilitychange", function () { if (!document.hidden && S.keys) refresh(true); });

	/* ================= painting ================= */
	function unread(th) { return th.msgs.some(function (m) { return m.from !== S.me && !S.read[m.key]; }); }
	function inFolder(th, f) { return f === "inbox" ? th.inbox : f === "sent" ? th.sent : true; }
	function fkey() { return "fl:" + S.me; }
	function fset() { return ls(fkey()) || { mode: "off", min: "" }; }
	/* a thread is low-paid when it has mail from others and every piece of it paid under my minimum, and I never wrote in it */
	function lowThread(th) {
		var f = fset();
		if (f.mode === "off" || th.msgs.some(function (m) { return m.from === S.me; })) return false;
		return th.msgs.length > 0 && th.msgs.every(function (m) { return M.lowPaid(m.amt, f); });
	}
	function payText(th) {
		var best = null;
		th.msgs.forEach(function (m) { var a = M.parseAmount(m.amt); if (a && (!best || a.n > best.n)) best = m; });
		return best ? (best.from === S.me ? "sent with " : "paid ") + best.amt : "";
	}
	function paintFilter() {
		var f = fset();
		$("em-fmode").value = f.mode; $("em-fmin").value = f.min;
		$("em-fsum").textContent = "Spam filter: " + (f.mode === "off" || !f.min ? "off" : (f.mode === "hide" ? "hiding" : "marking") + " mail under " + f.min);
	}
	function saveFilter() {
		var f = { mode: $("em-fmode").value, min: $("em-fmin").value.trim().replace(",", ".") };
		if (f.min && !(parseFloat(f.min) > 0)) f.min = "";
		if (!f.min) f.mode = "off";
		ls(fkey(), f); paintFilter(); paintList();
	}
	function matches(th) {
		if (!S.q) return true;
		var q = S.q.toLowerCase();
		return th.people.join(" ").indexOf(q) >= 0 || th.msgs.some(function (m) { return (m.payload.s + " " + m.payload.b + " " + m.from).toLowerCase().indexOf(q) >= 0; });
	}
	function paint() {
		var ni = S.threads.filter(function (t) { return t.inbox && unread(t); }).length;
		$("em-ninbox").textContent = ni ? ni : "";
		$("em-nsent").textContent = "";
		$("em-nclassic").textContent = S.cache && S.cache.classic.length ? S.cache.classic.length : "";
		document.title = (ni ? "(" + ni + ") " : "") + document.title.replace(/^\(\d+\) /, "");
		Array.prototype.forEach.call(document.querySelectorAll(".em-fold"), function (b) { b.classList.toggle("is-on", b.dataset.f === S.folder); b.setAttribute("aria-current", b.dataset.f === S.folder ? "page" : "false"); });
		paintList();
		if (S.folder === "classic") paintClassic();
		else if (S.th && $("em-cf").hidden) paintThread();
	}
	function paintList() {
		var box = $("em-list");
		$("em-q").hidden = S.folder === "classic";
		if (S.folder === "classic") {
			var cl = S.cache.classic.slice().reverse();
			box.innerHTML = cl.length ? "" : '<p class="em-none">No encrypted Hive memos found in your recent history.</p>';
			cl.forEach(function (x, i) {
				var out = x.from === S.me;
				var b = el("button", "em-item" + (S.cls === x.trx ? " is-on" : ""));
				b.type = "button";
				b.innerHTML = avatar(out ? x.to : x.from) + '<span class="em-it"><span class="em-ip"><b>' + (out ? "To @" + esc(x.to) : "@" + esc(x.from)) + '</b><time>' + esc(when(x.t)) + '</time></span><span class="em-is">' + esc(x.amount) + '</span><span class="em-ib">🔑 Encrypted memo' + (S.memoTxt && S.memoTxt[x.trx] ? ": " + esc(S.memoTxt[x.trx].slice(0, 80)) : "") + '</span></span>';
				b.onclick = function () { S.cls = x.trx; paintList(); paintClassic(); narrow(true); };
				box.appendChild(b);
			});
			return;
		}
		$("em-filter").hidden = S.folder === "sent";
		var f = fset(), hid = 0;
		var list = S.threads.filter(function (t) {
			if (!inFolder(t, S.folder) || !matches(t)) return false;
			if (S.folder === "inbox" && f.mode === "hide" && lowThread(t) && !S.showLow) { hid++; return false; }
			return true;
		});
		$("em-fhid").innerHTML = hid ? hid + " hidden. " : "";
		if (hid) { var sb = el("button", "tu-btn tu-btn--ghost"); sb.type = "button"; sb.textContent = "Show them"; sb.onclick = function () { S.showLow = true; paintList(); }; $("em-fhid").appendChild(sb); }
		else if (S.showLow && f.mode === "hide") { var hb = el("button", "tu-btn tu-btn--ghost"); hb.type = "button"; hb.textContent = "Hide low-payment mail again"; hb.onclick = function () { S.showLow = false; paintList(); }; $("em-fhid").appendChild(hb); }
		box.innerHTML = list.length ? "" : '<p class="em-none">' + (S.q ? "Nothing matches." : S.folder === "sent" ? "You haven't sent anything yet." : "No mail yet. Messages people send you show up here.") + '</p>';
		list.forEach(function (th) {
			var last = th.last, u = unread(th);
			var who = th.people.length ? th.people.map(function (p) { return "@" + p; }).join(", ") : "@" + S.me;
			var b = el("button", "em-item" + (u ? " is-unread" : "") + (S.th === th.th ? " is-on" : ""));
			b.type = "button";
			b.innerHTML = avatar(th.people[0] || S.me) + '<span class="em-it"><span class="em-ip"><b>' + esc(who) + (th.msgs.length > 1 ? ' <small>' + th.msgs.length + '</small>' : '') + '</b><time>' + esc(when(last.t)) + '</time></span>' +
				'<span class="em-is">' + esc(th.subject || "(no subject)") + (lowThread(th) ? ' <span class="em-low" title="Paid less than your minimum">low payment</span>' : '') + (payText(th) ? ' <span class="em-pay">' + esc(payText(th)) + '</span>' : '') + '</span><span class="em-ib">' + (last.from === S.me ? "You: " : "") + esc(String(last.payload.b || "").replace(/\s+/g, " ").slice(0, 120)) + '</span></span>';
			b.onclick = function () { openThread(th.th); };
			box.appendChild(b);
		});
	}
	function threadOf(id) { return S.threads.filter(function (t) { return t.th === id; })[0]; }
	function openThread(id) {
		S.th = id; S.cls = null;
		$("em-cf").hidden = true; $("em-classicv").hidden = true;
		var th = threadOf(id);
		if (th) { th.msgs.forEach(function (m) { S.read[m.key] = 1; }); ls("read:" + S.me, S.read); }
		paint(); paintThread(); narrow(true);
	}
	function paintThread() {
		var th = threadOf(S.th), box = $("em-thread");
		$("em-empty").hidden = !!th; box.hidden = !th;
		if (!th) return;
		var html = '<div class="em-cfhead"><button type="button" class="tu-btn tu-btn--ghost em-back" data-back>‹ Back</button><h2>' + esc(th.subject || "(no subject)") + '</h2></div>' +
			'<p class="em-people">With ' + (th.people.length ? th.people.map(function (p) { return '<a href="https://peakd.com/@' + esc(p) + '" target="_blank" rel="noopener">@' + esc(p) + '</a>'; }).join(", ") : "yourself") + ' · <span class="em-lockt">🔒 end-to-end encrypted, quantum-safe</span></p>';
		th.msgs.forEach(function (m, i) {
			var nf = S.cache.nf && S.cache.nf[m.key];
			html += '<article class="em-msg' + (m.err ? " is-err" : "") + '" data-k="' + esc(m.key) + '"><header>' + avatar(m.from) + '<div><b>@' + esc(m.from) + '</b><small>to ' + m.to.map(function (t) { return "@" + esc(t); }).join(", ") + (m.amt ? ' · ' + (m.from === S.me ? 'sent with ' : 'paid ') + esc(m.amt) : '') + '</small></div><time title="' + esc(m.t) + ' UTC">' + esc(whenLong(m.t)) + '</time></header>' +
				(m.payload.s && i > 0 ? '<p class="em-msubj">' + esc(m.payload.s) + '</p>' : '') +
				'<div class="em-mbody">' + renderBody(m.payload.b) + '</div>' +
				'<footer>' + (nf ? '<button type="button" class="tu-btn" data-act="notice">⚠ Send the delivery notice again</button>' : '') +
				'<button type="button" class="tu-btn tu-btn--ghost" data-act="reply">↩ Reply</button>' + (M.replyAll(m, S.me).length > 1 ? '<button type="button" class="tu-btn tu-btn--ghost" data-act="all">↩↩ Reply all</button>' : '') +
				'<button type="button" class="tu-btn tu-btn--ghost" data-act="fwd">→ Forward</button><button type="button" class="tu-btn tu-btn--ghost" data-act="copy">Copy text</button>' +
				(m.trx && !MOCK ? '<a class="em-trx" href="https://hivehub.dev/tx/' + esc(m.trx) + '" target="_blank" rel="noopener" title="The signed operation on the Hive blockchain">on chain ↗</a>' : '') + '</footer></article>';
		});
		box.innerHTML = html;
	}
	$("em-thread").addEventListener("click", function (ev) {
		var b = ev.target.closest("[data-act]"); if (!b) return;
		var art = b.closest(".em-msg"), th = threadOf(S.th);
		var m = th && th.msgs.filter(function (x) { return x.key === art.dataset.k; })[0];
		if (!m) return;
		var a = b.dataset.act;
		if (a === "copy") { navigator.clipboard.writeText(m.payload.b).then(function () { toast("Copied."); }); return; }
		if (a === "notice") { resendNotice(m); return; }
		if (a === "fwd") compose({ subject: "Fwd: " + (th.subject || ""), body: "\n\n---------- Forwarded message ----------\nFrom: @" + m.from + "\nDate: " + m.t.replace("T", " ") + " UTC\n\n" + m.payload.b });
		else compose({ to: a === "all" ? M.replyAll(m, S.me) : [m.from === S.me ? m.to[0] : m.from], subject: M.replySubject(th.subject), body: M.quote(m.payload.b, m.from, m.t), th: m.payload.th || m.msgId, re: m.msgId });
	});
	root.addEventListener("click", function (ev) { if (ev.target.closest("[data-back]")) { narrow(false); } });
	function narrow(reading) { root.classList.toggle("em-reading", !!reading); if (reading && root.classList.contains("em-w1")) $("em-read").scrollIntoView({ block: "start", behavior: "smooth" }); }

	Array.prototype.forEach.call(document.querySelectorAll(".em-fold"), function (b) {
		b.onclick = function () { S.folder = b.dataset.f; S.th = null; S.cls = null; $("em-thread").hidden = true; $("em-classicv").hidden = true; $("em-cf").hidden = true; $("em-empty").hidden = false; narrow(false); paint(); };
	});
	$("em-q").addEventListener("input", function () { S.q = this.value.trim(); paintList(); });

	/* ---------- classic memos ---------- */
	function paintClassic() {
		var box = $("em-classicv"), x = S.cache.classic.filter(function (c) { return c.trx === S.cls; })[0];
		$("em-thread").hidden = true; $("em-cf").hidden = true;
		$("em-empty").hidden = !!x; box.hidden = !x;
		if (!x) return;
		S.memoTxt = S.memoTxt || {};
		var txt = S.memoTxt[x.trx], out = x.from === S.me;
		box.innerHTML = '<div class="em-cfhead"><button type="button" class="tu-btn tu-btn--ghost em-back" data-back>‹ Back</button><h2>Classic memo</h2></div>' +
			'<article class="em-msg"><header>' + avatar(x.from) + '<div><b>@' + esc(x.from) + '</b><small>to @' + esc(x.to) + ' · ' + esc(x.amount) + '</small></div><time>' + esc(whenLong(x.t)) + '</time></header>' +
			(txt != null ? '<div class="em-mbody">' + renderBody(txt.replace(/^#/, "")) + '</div>' :
				H.memoOk() ? '<p>This memo is encrypted with Hive memo keys. Keychain can open it with your memo key.</p><button type="button" class="tu-btn tu-btn--primary" id="em-dec">🔑 Decrypt with Keychain</button>' :
				'<p>You are logged in with the Keychain phone app (HiveAuth), which can\'t open memos. Use the Keychain browser extension to read it.</p>') +
			'<footer><button type="button" class="tu-btn tu-btn--ghost" id="em-creply">↩ Reply with MES Mail</button></footer></article>' +
			'<p class="tu-note">Classic memos are locked with elliptic-curve keys, which a future quantum computer could break. MES Mail messages are not.</p>';
		var d = $("em-dec");
		if (d) d.onclick = function () {
			d.disabled = true;
			H.decodeMemo(x.memo).then(function (t) { S.memoTxt[x.trx] = t; paintClassic(); paintList(); }).catch(function (e) { d.disabled = false; toast(e.message); });
		};
		$("em-creply").onclick = function () { compose({ to: [out ? x.to : x.from] }); };
	}

	/* ================= compose / send ================= */
	var draft = { th: null, re: null };
	function compose(o) {
		o = o || {};
		S.folder = S.folder === "classic" ? "inbox" : S.folder;
		draft = { th: o.th || null, re: o.re || null };
		$("em-cft").textContent = o.re ? "Reply" : "New message";
		$("em-to").value = (o.to || []).map(function (n) { return "@" + n; }).join(", ");
		$("em-subj").value = o.subject || "";
		$("em-body").value = o.body || "";
		$("em-sendnote").textContent = "";
		$("em-curr").value = prefs.cur || "HBD"; $("em-amt").value = prefs.amt || "0.001";
		$("em-thread").hidden = true; $("em-classicv").hidden = true; $("em-empty").hidden = true; $("em-cf").hidden = false;
		narrow(true);
		checkTo();
		setTimeout(function () { (o.to && o.to.length ? $("em-body") : $("em-to")).focus(); if (o.re) { $("em-body").setSelectionRange(0, 0); $("em-body").scrollTop = 0; } }, 30);
	}
	$("em-new").onclick = function () { var d = ls("draft"); compose(d && !d.re ? { to: M.parseTo(d.to).names, subject: d.s, body: d.b } : {}); };
	var toT;
	function checkTo() {
		clearTimeout(toT);
		toT = setTimeout(function () {
			var p = M.parseTo($("em-to").value), box = $("em-tochips");
			estimate();
			if (!p.names.length && !p.bad.length) { box.innerHTML = ""; $("em-classic").hidden = true; return; }
			getAccounts(p.names).then(function () {
				var contacts = ls("contacts") || {};
				var html = p.bad.map(function (b) { return '<span class="em-chip is-bad">' + esc(b) + ' · not a Hive name</span>'; }).join("");
				var jobs = p.names.map(function (n) {
					var a = S.keyCache[n];
					if (!a.exists) return Promise.resolve('<span class="em-chip is-bad">@' + esc(n) + ' · no such account</span>');
					if (!a.key) return Promise.resolve('<span class="em-chip is-warn" title="This account has not set up MES Mail yet">@' + esc(n) + ' · no mail key yet</span>');
					return M.fingerprint(a.key.pub).then(function (fp) {
						var changed = contacts[n] && contacts[n] !== fp;
						return '<span class="em-chip ' + (changed ? "is-bad" : "is-good") + '" title="Key ' + esc(fp) + '">🔒 @' + esc(n) + (changed ? " · key changed since you last wrote!" : "") + '</span>';
					});
				});
				return Promise.all(jobs).then(function (parts) {
					var noKey = p.names.filter(function (n) { return S.keyCache[n].exists && !S.keyCache[n].key; });
					box.innerHTML = html + parts.join("") + (noKey.length ? '<p class="em-nokey">' + noKey.map(function (n) { return "@" + esc(n); }).join(", ") + (noKey.length > 1 ? " haven't" : " hasn't") +
						' set up MES Mail. <button type="button" class="em-link" id="em-invite">Copy an invite</button>' + (p.names.length === 1 ? ' or send a classic memo (not quantum-safe, about 1,400 characters).' : '.') + '</p>' : "");
					$("em-classic").hidden = !(p.names.length === 1 && noKey.length === 1);
					var inv = $("em-invite");
					if (inv) inv.onclick = function () { navigator.clipboard.writeText("I'd like to send you an encrypted message. MES Mail is free, uses your Hive account and is quantum-safe: https://mes.fm/email").then(function () { toast("Invite copied: paste it in a DM or comment."); }); };
				});
			}).catch(function () {});
		}, 350);
	}
	function estimate() {
		var p = M.parseTo($("em-to").value), n = p.names.filter(function (x) { return x !== S.me; }).length;
		if (!S.me || !p.names.length) { $("em-est").textContent = ""; return; }
		var e = M.estimate(p.names, S.me, $("em-body").value, $("em-subj").value);
		var cur = $("em-curr").value, amt = M.cleanAmount($("em-amt").value);
		Array.prototype.forEach.call(document.querySelectorAll(".em-pre"), function (b) { b.classList.toggle("is-on", parseFloat(b.dataset.a) === amt); });
		$("em-est").textContent = "About " + (e.bytes / 1000).toFixed(1) + " KB encrypted · Keychain: " + e.txs + " Posting approval" + (e.txs > 1 ? "s" : "") + (n ? " + 1 Active approval for the payment (" + M.fmtAmount(amt, cur) + " to each of " + n + " = " + (amt * n).toFixed(3) + " " + cur + " in all, the recipients keep it; a bigger amount helps your mail pass their spam filters)" : "") + "." +
			(e.pieces > M.MAX_PIECES ? " Too long: shorten the message." : "");
	}
	$("em-to").addEventListener("input", function () { checkTo(); saveDraft(); });
	$("em-subj").addEventListener("input", function () { estimate(); saveDraft(); });
	$("em-body").addEventListener("input", function () { estimate(); saveDraft(); });
	$("em-curr").addEventListener("change", function () { prefs.cur = this.value; savePrefs(); estimate(); });
	$("em-amt").addEventListener("input", function () { estimate(); });
	$("em-amt").addEventListener("change", function () { this.value = M.cleanAmount(this.value); prefs.amt = this.value; savePrefs(); estimate(); });
	Array.prototype.forEach.call(document.querySelectorAll(".em-pre"), function (b) { b.onclick = function () { $("em-amt").value = b.dataset.a; prefs.amt = b.dataset.a; savePrefs(); estimate(); }; });
	$("em-fmode").addEventListener("change", saveFilter);
	$("em-fmin").addEventListener("change", saveFilter);
	var dT;
	function saveDraft() { clearTimeout(dT); dT = setTimeout(function () { ls("draft", { to: $("em-to").value, s: $("em-subj").value, b: $("em-body").value, re: draft.re }); }, 400); }

	$("em-cf").onsubmit = function (ev) {
		ev.preventDefault();
		if (S.busy) return;
		var p = M.parseTo($("em-to").value), note = $("em-sendnote"), btn = $("em-send");
		if (p.bad.length) { note.textContent = "Fix these names: " + p.bad.join(", "); return; }
		if (!p.names.length) { note.textContent = "Add at least one recipient."; return; }
		if (p.names.length > M.MAX_TO) { note.textContent = "At most " + M.MAX_TO + " recipients."; return; }
		S.busy = true; btn.disabled = true;
		var cur = $("em-curr").value, amt = M.cleanAmount($("em-amt").value), sealed, key;
		p.names.forEach(function (n) { if (n !== S.me) delete S.keyCache[n]; });
		note.textContent = "Checking the recipients' keys…";
		getAccounts(p.names).then(function () {
			var pubs = {};
			pubs[S.me] = S.keys.pub;
			p.names.forEach(function (n) {
				var a = S.keyCache[n];
				if (!a.exists) throw new Error("@" + n + " is not a Hive account.");
				if (!a.key) throw new Error("@" + n + " hasn't set up MES Mail yet, so a quantum-safe message can't be sent to them.");
				pubs[n] = a.key.pub;
			});
			note.textContent = "Encrypting…";
			return M.seal({ from: S.me, to: p.names, pubs: pubs, payload: { s: $("em-subj").value, b: $("em-body").value, th: draft.th, re: draft.re } });
		}).then(function (r) {
			sealed = r; key = S.me + "/" + r.msgId;
			var batches = M.batches(M.split(r.env, r.msgId));
			return batches.reduce(function (pr, b, i) {
				return pr.then(function () {
					note.textContent = "Saving the encrypted message on Hive" + (batches.length > 1 ? " (" + (i + 1) + " of " + batches.length + ")" : "") + ": approve in Keychain (Posting key)…";
					return (i ? sleep(TX_GAP) : Promise.resolve()).then(function () {
						return H.broadcast(b.map(function (pc) { return M.customOp(S.me, pc); }), "Posting", "Save an encrypted MES Mail message");
					});
				});
			}, Promise.resolve());
		}).then(function () {
			/* it is on chain now: keep it in Sent whatever happens with the notice */
			S.cache.env[key] = { from: S.me, msgId: sealed.msgId, env: sealed.env, t: new Date().toISOString().slice(0, 19), trx: "" };
			(S.cache.sentAmt = S.cache.sentAmt || {})[key] = M.fmtAmount(amt, cur);
			S.open[key] = sealed.payload;
			var contacts = ls("contacts") || {};
			return Promise.all(p.names.map(function (n) { return M.fingerprint(S.keyCache[n].key.pub).then(function (fp) { contacts[n] = fp; }); })).then(function () { ls("contacts", contacts); });
		}).then(function () {
			var ops = M.noticeOps(S.me, p.names, sealed.msgId, cur, amt);
			if (!ops.length) return;
			note.textContent = "Sending the delivery notice: approve in Keychain (Active key)…";
			return H.broadcast(ops, "Active", "MES Mail delivery notice").catch(function (e) {
				S.cache.nf = S.cache.nf || {}; S.cache.nf[key] = { to: p.names, cur: cur, amt: amt };
				toast("Saved, but the delivery notice was not sent: " + e.message);
			});
		}).then(function () {
			saveCache(); ls("draft", null);
			buildThreads();
			note.textContent = "";
			S.busy = false; btn.disabled = false;
			toast("Sent 🔒");
			S.folder = draft.re ? S.folder : "sent";
			openThread(sealed.payload.th);
		}).catch(function (e) {
			S.busy = false; btn.disabled = false;
			note.textContent = e.message;
			if (sealed && S.cache.env[key]) { saveCache(); buildThreads(); paint(); }
		});
	};
	function resendNotice(m) {
		var nf = S.cache.nf[m.key];
		H.broadcast(M.noticeOps(S.me, nf.to, m.msgId, nf.cur, nf.amt), "Active", "MES Mail delivery notice").then(function () {
			delete S.cache.nf[m.key]; saveCache(); paintThread(); toast("Notice sent.");
		}).catch(function (e) { toast(e.message); });
	}
	$("em-classic").onclick = function () {
		var p = M.parseTo($("em-to").value), to = p.names[0], text = ($("em-subj").value ? $("em-subj").value + "\n\n" : "") + $("em-body").value;
		if (!to) return;
		if (!H.memoOk()) { $("em-sendnote").textContent = "The Keychain phone app (HiveAuth) can't encrypt memos. Use the Keychain browser extension."; return; }
		if (new TextEncoder().encode(text).length > 1400) { $("em-sendnote").textContent = "Too long for a memo: about 1,400 characters at most."; return; }
		if (!confirm("Send a classic encrypted memo to @" + to + " with 0.001 " + $("em-curr").value + "? It is locked with Hive memo keys, which are NOT quantum-safe.")) return;
		H.classicSend(to, text, $("em-curr").value).then(function () {
			toast("Memo sent."); ls("draft", null); S.folder = "classic"; refresh(); paint(); narrow(false);
			$("em-cf").hidden = true; $("em-empty").hidden = false;
		}).catch(function (e) { $("em-sendnote").textContent = e.message; });
	};

	/* width classes from the box itself, not the window */
	function fit() { var w = root.clientWidth; root.classList.toggle("em-w2", w < 1000 && w >= 640); root.classList.toggle("em-w1", w < 640); }
	if (window.ResizeObserver) new ResizeObserver(fit).observe(root); else window.addEventListener("resize", fit);
	fit();

	/* ?to=name opens a new message */
	var qTo = (location.search.match(/[?&]to=([^&]+)/) || [])[1];
	start();
	if (qTo) {
		var tries = 0, w = setInterval(function () { if (S.keys) { clearInterval(w); compose({ to: M.parseTo(decodeURIComponent(qTo)).names }); } else if (++tries > 40) clearInterval(w); }, 300);
	}
	window.MESMailDebug = { S: S, H: H, refresh: refresh, compose: compose };
})();
