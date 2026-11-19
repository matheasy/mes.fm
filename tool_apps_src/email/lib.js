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
