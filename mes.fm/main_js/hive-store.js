/* MESHiveStore: optional "Save to Hive" for practical data on mes.fm pages (window.MESHiveStore; also require()-able in node).

   Where the data goes
   - custom_json operations with id "mes_store", signed with the person's POSTING key through Hive Keychain (extension, or the
     Keychain phone app via HiveAuth: then canEncrypt() is false because HiveAuth has no memo encryption) (MESHive in
     /main_js/hive.js does the login; the same "mes-hive-user" login as Premium). Keys never leave Keychain; mes.fm has no server
     part in this at all.
   - custom_json was chosen over posts / comments (what Stickit uses): it never shows up in anyone's blog, feed or comments,
     has no 3-second / 5-minute posting limits and no payouts to decline. The price: it can't be edited or looked up by name,
     so reading it back means scanning the account's history (account_history filtered to custom_json, newest first).
   - Hive limits: the json of one custom_json is at most 8,192 bytes (HIVE_CUSTOM_OP_DATA_MAX_LENGTH) and an account may put at
     most 5 custom ops in one block (HIVE_CUSTOM_OP_BLOCK_LIMIT). So a save is split into chunks of ~7.5 KB, 5 chunks per
     transaction (one Keychain confirmation each), and transactions are spaced 3.5 s apart. Max 20 chunks (~110 KB after
     compression and encryption).
   - Each save = chunks {v:1, a:app, n:name, s:saveId, i:index, c:count, d:base64 piece}; chunk 0 also carries the header
     h = {e: 0|1 encrypted, z: "d" deflate-raw | "", b: bytes before compression, t: ISO time, iv, k (wrapped key), sha (plain only)}.
     "Forget" is a tombstone {v:1, a, n, x: saveId}: the list hides that save, but the data stays in the chain's history.

   Encryption (default ON in the pages that use this)
   - A fresh random AES-256-GCM key per save encrypts the (compressed) data in the browser (Web Crypto). Only that 32-byte key
     is encrypted to the person's OWN memo key with Keychain requestEncodeMessage (memo encryption, a "#..." string), so one
     Keychain confirmation wraps it and only the holder of the memo private key can unwrap it (requestVerifyKey). The AES
     additional data binds app / name / save id, so a chunk can't be passed off as another save.
   - Needs the memo key in Keychain (it is there when the account was imported with the master password). If the person later
     changes their memo key, old encrypted saves can no longer be opened.
   - Even encrypted, a save is PUBLIC and PERMANENT: anyone can see that the account saved N bytes for "copy-text" at that
     time. Unencrypted saves are readable by anyone, forever.

   Quantum-safe passphrase lock (2026-11-13, header e: 2)
   - The memo-key wrap above is elliptic-curve (secp256k1 ECDH), which a big enough quantum computer could break with Shor's
     algorithm. Hive data is permanent, so a save made today could be read one day ("harvest now, decrypt later").
   - e: 2 instead derives the AES-256-GCM key from a passphrase: PBKDF2-SHA256 (Web Crypto), `i` rounds (PASS_ROUNDS) with a fresh
     16-byte salt per save; header {e:2, kd:"pbkdf2-sha256", i, sa: salt, iv}. Nothing elliptic-curve is involved, so only the
     passphrase guards it. AES-256 stays strong against quantum computers (Grover only halves the bits); the passphrase must be
     strong too (generatePass() = 120 random bits). There is deliberately NO memo-key copy of the key next to it: that copy
     would be the weak spot.
   - Works with the Keychain phone app (HiveAuth) too, since no memo key is needed. Forgotten passphrase = save lost for good.
   - The chosen lock is one setting for every MES page: localStorage "mes-hive-store:lock" = "memo" | "pass". The passphrase is
     kept in memory for the page; "Remember on this device" stores it in localStorage "mes-hive-store:pass:<account>".
   - Every save keeps the lock it was made with forever (the chain can't be edited); re-saving with the passphrase only protects
     the new save. Pages call encModeUI(checkbox, onChange) to show the choice; save({encrypt:true}) uses it; load() asks.

   Pure helpers (b64, chunking, op building, assembling saves from history) are exported for node tests:
   node tool_apps_src/hive-store-tests.js */
(function (root) {
    "use strict";

    var ID = "mes_store";
    var V = 1;
    var JSON_MAX = 8192;          /* HIVE_CUSTOM_OP_DATA_MAX_LENGTH */
    var OPS_PER_TX = 5;           /* HIVE_CUSTOM_OP_BLOCK_LIMIT (per account per block) */
    var MAX_CHUNKS = 20;
    var TX_GAP_MS = 3500;
    var FILTER_CUSTOM_JSON = 262144;   /* 1 << 18: custom_json in the account_history operation filter */
    var NAME_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;
    var PASS_ROUNDS = 600000;     /* PBKDF2-SHA256 rounds for e:2 (OWASP 2023); stored per save, so it can grow later */
    var PASS_MIN = 12;
    var LOCK_KEY = "mes-hive-store:lock", PASS_KEY = "mes-hive-store:pass:";
    var QPAGE = "/quantum-cryptography?tab=safe";

    /* ---------- bytes <-> text ---------- */
    function utf8(s) { return new TextEncoder().encode(s); }
    function unutf8(b) { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
    function b64(bytes) {
        var s = "", CH = 0x8000;
        for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return (typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64"));
    }
    function unb64(s) {
        var bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function hex(bytes) { return Array.prototype.map.call(bytes, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); }
    function unhex(s) {
        if (!/^(?:[0-9a-f]{2})+$/i.test(s)) throw new Error("bad hex");
        var o = new Uint8Array(s.length / 2);
        for (var i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16);
        return o;
    }
    function randomBytes(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
    function newSaveId() { return hex(randomBytes(6)); }

    function okName(n) { return typeof n === "string" && NAME_RE.test(n); }

    /* ---------- chunking + ops (pure) ---------- */
    /* Splits the base64 payload so every chunk's json is <= JSON_MAX bytes. Returns the json strings, chunk 0 first. */
    function chunkJsons(app, name, saveId, header, payload) {
        if (!okName(app) || !okName(name)) throw new Error("bad app or name");
        var parts = [], pos = 0, i = 0;
        /* count is not known until the end: reserve 2 digits ("c":99) and fill in after */
        while (pos < payload.length || i === 0) {
            var obj = { v: V, a: app, n: name, s: saveId, i: i, c: 99, d: "" };
            if (i === 0) obj.h = header;
            var room = JSON_MAX - JSON.stringify(obj).length - 8;
            if (room < 500) throw new Error("header too big");
            obj.d = payload.slice(pos, pos + room);
            pos += obj.d.length;
            parts.push(obj); i++;
            if (parts.length > MAX_CHUNKS) throw tooBig(payload.length);
        }
        return parts.map(function (o) { o.c = parts.length; var j = JSON.stringify(o); if (j.length > JSON_MAX) throw new Error("chunk too big"); return j; });
    }
    function tooBig(n) {
        var e = new Error("That is too much for one Hive save (about " + Math.round(n / 1024) + " KB once compressed and packed; the limit is about " +
            Math.round(MAX_CHUNKS * 7.9) + " KB)."); e.code = "toobig"; return e;
    }
    function customJson(account, json) {
        return ["custom_json", { required_auths: [], required_posting_auths: [account], id: ID, json: json }];
    }
    /* json strings -> transactions (arrays of ops), OPS_PER_TX each. The LAST transaction holds chunk 0 (the header), so a
       save whose header is on chain is complete as long as the earlier transactions went through (they are sent first). */
    function buildTxs(account, jsons) {
        var ops = jsons.slice(1).concat(jsons.slice(0, 1)).map(function (j) { return customJson(account, j); });
        var txs = [];
        for (var i = 0; i < ops.length; i += OPS_PER_TX) txs.push(ops.slice(i, i + OPS_PER_TX));
        return txs;
    }
    function tombstone(app, name, saveId) { return JSON.stringify({ v: V, a: app, n: name, x: saveId }); }

    /* history items ([index, {op:[type, body], trx_id, block, timestamp}]) -> saves, newest first.
       Only ops signed by `account` with our id count; foreign or broken ops are skipped. */
    function assemble(items, account, opt) {
        opt = opt || {};
        var by = {}, order = [], dead = {};
        items.forEach(function (it) {
            var h = it && it[1], op = h && h.op;
            if (!op || op[0] !== "custom_json" || !op[1] || op[1].id !== ID) return;
            var auths = op[1].required_posting_auths || [];
            if (auths.length !== 1 || auths[0] !== account || (op[1].required_auths || []).length) return;
            var j; try { j = JSON.parse(op[1].json); } catch (e) { return; }
            if (!j || j.v !== V || !okName(j.a) || !okName(j.n)) return;
            if (opt.app && j.a !== opt.app) return;
            if (opt.name && j.n !== opt.name) return;
            if (typeof j.x === "string") { dead[j.a + "/" + j.n + "/" + j.x] = 1; return; }
            if (typeof j.s !== "string" || !/^[0-9a-f]{4,32}$/.test(j.s) || typeof j.d !== "string") return;
            if (!(j.i >= 0 && j.i < MAX_CHUNKS && j.c >= 1 && j.c <= MAX_CHUNKS && j.i < j.c)) return;
            var key = j.a + "/" + j.n + "/" + j.s, e = by[key];
            if (!e) { e = by[key] = { app: j.a, name: j.n, s: j.s, count: j.c, parts: {}, header: null, time: "", block: 0, trx: "" }; order.push(key); }
            if (e.count !== j.c || e.parts[j.i] != null) return;
            e.parts[j.i] = j.d;
            if (j.i === 0 && j.h && typeof j.h === "object") { e.header = j.h; e.time = h.timestamp || ""; e.block = h.block || 0; e.trx = h.trx_id || ""; }
        });
        var out = [];
        order.forEach(function (k) {
            var e = by[k]; if (dead[k] || !e.header) return;
            var have = Object.keys(e.parts).length;
            e.complete = have === e.count;
            e.encrypted = e.header.e === 1 || e.header.e === 2;
            e.lock = e.header.e === 2 ? "pass" : e.header.e === 1 ? "memo" : "";
            e.bytes = +e.header.b || 0;
            e.payload = e.complete ? Array.apply(null, { length: e.count }).map(function (x, i) { return e.parts[i]; }).join("") : "";
            delete e.parts;
            out.push(e);
        });
        out.sort(function (a, b) { return (b.block - a.block) || (b.time > a.time ? 1 : b.time < a.time ? -1 : 0); });
        return out;
    }

    /* ---------- compression + crypto ---------- */
    function streamBytes(bytes, stream) {
        var s = new Blob([bytes]).stream().pipeThrough(stream);
        return new Response(s).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    function deflate(bytes) {
        if (typeof CompressionStream === "undefined") return Promise.resolve(null);
        return streamBytes(bytes, new CompressionStream("deflate-raw")).catch(function () { return null; });
    }
    function inflate(bytes) {
        if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("This browser can't unpack compressed data."));
        return streamBytes(bytes, new DecompressionStream("deflate-raw"));
    }
    /* passphrase -> AES-256-GCM key (PBKDF2-SHA256). NFC so the same passphrase typed on another device gives the same key. */
    function passKey(pass, salt, rounds, use) {
        return crypto.subtle.importKey("raw", utf8(String(pass).normalize("NFC")), "PBKDF2", false, ["deriveKey"]).then(function (base) {
            return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: rounds }, base, { name: "AES-GCM", length: 256 }, false, use);
        });
    }
    /* rough strength in bits: random-looking text = length x log2(character pool), minus repeats; 4+ words = ~11 bits a word */
    function passBits(p) {
        p = String(p || "");
        if (!p) return 0;
        var words = p.trim().split(/[\s\-_.,]+/).filter(Boolean);
        var pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(p) ? 26 : 0) + (/[0-9]/.test(p) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(p) ? 33 : 0);
        var uniq = {}; p.split("").forEach(function (c) { uniq[c] = 1; });
        var len = Math.min(p.length, Object.keys(uniq).length * 3);
        var bits = Math.round(len * Math.log2(Math.max(pool, 2)));
        if (/^(.)\1+$/.test(p) || /^(?:0?1?2?3?4?5?6?7?8?9?|abcdefgh?i?j?k?)$/i.test(p) || /password|qwerty|letmein|123456/i.test(p)) bits = Math.min(bits, 20);
        if (words.length >= 4 && words.every(function (w) { return /^[a-z]+$/i.test(w); })) bits = Math.min(bits, words.length * 11);
        return bits;
    }
    var GEN = "abcdefghjkmnpqrstuvwxyz23456789";   /* 31 letters / digits, no look-alikes (i l o 0 1) */
    function generatePass(groups) {
        groups = groups || 6;
        var out = [], b = randomBytes(groups * 4 * 2), j = 0;
        for (var g = 0; g < groups; g++) {
            var w = "";
            while (w.length < 5) { var x = b[j++ % b.length]; if (j >= b.length) { b = randomBytes(b.length); j = 0; } if (x < 248) w += GEN[x % 31]; }
            out.push(w);
        }
        return out.join("-");   /* 6 x 5 x log2(31) = ~149 bits */
    }
    function aad(app, name, saveId) { return utf8(ID + "/" + V + "/" + app + "/" + name + "/" + saveId); }
    function sha16(bytes) { return crypto.subtle.digest("SHA-256", bytes).then(function (d) { return hex(new Uint8Array(d)).slice(0, 16); }); }

    /* data -> {header, payload}. wrapKey(hexKey) -> Promise of the wrapped key string (Keychain memo encoding in the browser). */
    function pack(data, o) {
        var raw = utf8(JSON.stringify(data));
        var saveId = o.saveId || newSaveId();
        var usePass = o.encrypt && typeof o.pass === "string";
        var header = { e: usePass ? 2 : o.encrypt ? 1 : 0, z: "", b: raw.length, t: new Date(o.now || Date.now()).toISOString() };
        return deflate(raw).then(function (z) {
            var body = raw;
            if (z && z.length < raw.length) { body = z; header.z = "d"; }
            if (!o.encrypt) return sha16(raw).then(function (h) { header.sha = h; return { saveId: saveId, header: header, payload: b64(body) }; });
            var key = randomBytes(32), iv = randomBytes(12);
            if (usePass) {
                var salt = randomBytes(16), rounds = o.rounds || PASS_ROUNDS;
                header.kd = "pbkdf2-sha256"; header.i = rounds; header.sa = b64(salt); header.iv = b64(iv);
                return passKey(o.pass, salt, rounds, ["encrypt"])
                    .then(function (ck) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: aad(o.app, o.name, saveId) }, ck, body); })
                    .then(function (ct) { return { saveId: saveId, header: header, payload: b64(new Uint8Array(ct)) }; });
            }
            return o.wrapKey(hex(key)).then(function (wrapped) {
                if (typeof wrapped !== "string" || !wrapped) throw new Error("Keychain did not return the encrypted key.");
                header.k = wrapped; header.iv = b64(iv);
                return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"])
                    .then(function (ck) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: aad(o.app, o.name, saveId) }, ck, body); })
                    .then(function (ct) { return { saveId: saveId, header: header, payload: b64(new Uint8Array(ct)) }; });
            });
        });
    }
    /* assembled save -> data. unwrapKey(wrapped) -> Promise of the hex key (Keychain requestVerifyKey in the browser). */
    function unpack(e, o) {
        o = o || {};
        if (!e.complete) return Promise.reject(new Error("Part of this save is missing on the chain."));
        var h = e.header, body;
        try { body = unb64(e.payload); } catch (x) { return Promise.reject(new Error("This save is damaged.")); }
        var p = Promise.resolve(body);
        if (h.e === 2) {
            if (h.kd !== "pbkdf2-sha256" || !(h.i >= 1000 && h.i <= 50000000)) return Promise.reject(new Error("This save uses a lock this page doesn't know."));
            if (!o.getPass) return Promise.reject(new Error("This save is locked with a passphrase."));
            var tries = 0;
            var attempt = function (wrong) {
                return Promise.resolve(o.getPass({ wrong: wrong, tries: tries++ })).then(function (pw) {
                    if (typeof pw !== "string") { var c = new Error("Cancelled."); c.code = "cancel"; throw c; }
                    return passKey(pw, unb64(h.sa), h.i, ["decrypt"]).then(function (ck) {
                        return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(h.iv), additionalData: aad(e.app, e.name, e.s) }, ck, body)
                            .then(function (ab) { if (o.onPassOk) o.onPassOk(pw); return new Uint8Array(ab); }, function () {
                                if (tries >= 5 || o.noRetry) { var w = new Error("Wrong passphrase (or the save is damaged)."); w.code = "badpass"; throw w; }
                                return attempt(true);
                            });
                    });
                });
            };
            p = attempt(false);
        } else if (h.e === 1) {
            if (!o.unwrapKey) return Promise.reject(new Error("This save is encrypted."));
            p = o.unwrapKey(h.k).then(function (hk) {
                var key = unhex(String(hk).replace(/^#/, "").trim());
                if (key.length !== 32) throw new Error("bad key");
                return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
            }).then(function (ck) {
                return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(h.iv), additionalData: aad(e.app, e.name, e.s) }, ck, body)
                    .catch(function () { throw new Error("This save could not be decrypted (wrong key or damaged)."); });
            }).then(function (ab) { return new Uint8Array(ab); });
        }
        return p.then(function (b) { return h.z === "d" ? inflate(b) : b; }).then(function (raw) {
            if (!h.e && h.sha) return sha16(raw).then(function (s) { if (s !== h.sha) throw new Error("This save is damaged (checksum)."); return raw; });
            return raw;
        }).then(function (raw) { return JSON.parse(unutf8(raw)); });
    }

    /* ---------- Hive + Keychain (browser) ---------- */
    function H() { var h = root.MESHive; if (!h) throw new Error("hive.js is not loaded"); return h; }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function kcCall(fn) {
        return H().keychain().then(function (k) {
            if (!k) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
            return new Promise(function (res, rej) {
                fn(k, function (r) {
                    if (r && r.success) return res(r);
                    var m = (r && (r.message || (r.error && (r.error.message || r.error)))) || "Cancelled";
                    var err = new Error(String(m)); err.code = r && r.error === "user_cancel" ? "cancel" : "fail";
                    if (/memo/i.test(String(m)) && /key|missing|not found/i.test(String(m))) err.code = "nomemo";
                    if (r && r.error === "nomemo_hiveauth") err.code = "nomemo-has";   /* Keychain phone-app login: no memo key */
                    rej(err);
                });
            });
        });
    }
    function wrapKeyFor(account) {
        return function (hexKey) {
            return kcCall(function (k, done) { k.requestEncodeMessage(account, account, "#" + hexKey, "Memo", done); })
                .then(function (r) { return r.result; })
                .catch(function (e) { if (e.code !== "cancel" && e.code !== "nomemo-has") e.message = memoHint(e.message); throw e; });
        };
    }
    function unwrapKeyFor(account) {
        return function (wrapped) {
            return kcCall(function (k, done) { k.requestVerifyKey(account, wrapped, "Memo", done); })
                .then(function (r) { return r.result; })
                .catch(function (e) { if (e.code !== "cancel" && e.code !== "nomemo-has") e.message = memoHint(e.message); throw e; });
        };
    }
    /* false while logged in with the Keychain phone app (HiveAuth): it can't use the memo key, so saves can't be encrypted */
    function memoOk() { var h = root.MESHive; return !(h && h.memoOk && !h.memoOk()); }
    function canEncrypt() { return lockMode() === "pass" || memoOk(); }
    function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
    function lockMode() { return ls(LOCK_KEY) === "pass" ? "pass" : "memo"; }
    function setLock(m) { ls(LOCK_KEY, m === "pass" ? "pass" : "memo"); fire(); }
    var memPass = {}, subs = [];
    function fire() { subs.slice().forEach(function (f) { try { f(lockMode()); } catch (e) {} }); }
    function knownPass(acct) { return memPass[acct] || ls(PASS_KEY + acct) || ""; }
    function rememberPass(acct, pw, keep) { memPass[acct] = pw; if (keep) ls(PASS_KEY + acct, pw); }
    function forgetPass(acct) { delete memPass[acct]; ls(PASS_KEY + acct, null); fire(); }
    function isRemembered(acct) { return !!ls(PASS_KEY + acct); }
    function memoHint(m) {
        return (m || "Keychain could not use your memo key") +
            ". Encrypted Hive saves need your MEMO key in Keychain (Keychain > your account > Manage keys > add the memo key).";
    }
    function need() { var u = H().user(); if (!u) { var e = new Error("Log in with Hive Keychain first."); e.code = "nologin"; throw e; } return u.name; }

    function rcPercent(account) {
        return H().call("rc_api.find_rc_accounts", { accounts: [account] }).then(function (r) {
            var a = r && r.rc_accounts && r.rc_accounts[0]; if (!a) return null;
            var max = Number(a.max_rc); if (!max) return 0;
            var elapsed = Date.now() / 1000 - Number(a.rc_manabar.last_update_time);
            var cur = Number(a.rc_manabar.current_mana) + max * Math.max(0, elapsed) / 432000;
            return Math.max(0, Math.min(100, cur / max * 100));
        });
    }

    /* save(app, name, data, {encrypt, onProgress(msg)}) -> {saveId, chunks, txs, bytes} */
    function save(app, name, data, opt) {
        opt = opt || {};
        var say = opt.onProgress || function () {};
        return Promise.resolve().then(function () {
            var account = need();
            if (opt.encrypt && (opt.lock || lockMode()) === "memo" && !memoOk()) { var ne = new Error(H().NO_MEMO || "Encryption is not available with this login."); ne.code = "nomemo-has"; throw ne; }
            var mode = opt.lock || lockMode();
            var getPw = (opt.encrypt && mode === "pass") ? (opt.pass || knownPass(account) ? Promise.resolve(opt.pass || knownPass(account)) : askPass({ mode: "save", account: account })) : Promise.resolve(null);
            return getPw.then(function (pw) {
            if (opt.encrypt && mode === "pass") { if (typeof pw !== "string") { var c = new Error("Cancelled."); c.code = "cancel"; throw c; } say("Locking the data with your passphrase (quantum-safe)…"); }
            else if (opt.encrypt) say("Confirm in Keychain: encrypt the backup key to your own memo key…");
            return pack(data, { encrypt: !!opt.encrypt, pass: pw == null ? undefined : pw, app: app, name: name, wrapKey: wrapKeyFor(account) });
            }).then(function (pk) {
                var jsons = chunkJsons(app, name, pk.saveId, pk.header, pk.payload);
                var txs = buildTxs(account, jsons), i = 0;
                function next() {
                    if (i >= txs.length) return { saveId: pk.saveId, chunks: jsons.length, txs: txs.length, bytes: pk.payload.length, header: pk.header };
                    var t = txs[i];
                    say("Confirm in Keychain: save part " + (i + 1) + " of " + txs.length + " to Hive…");
                    return (i ? sleep(TX_GAP_MS) : Promise.resolve()).then(function () {
                        return kcCall(function (k, done) {
                            k.requestBroadcast(account, t, "Posting", done, null, "Save " + app + " data to Hive" + (txs.length > 1 ? " (" + (i + 1) + "/" + txs.length + ")" : ""));
                        });
                    }).then(function () { i++; return next(); });
                }
                return next();
            });
        });
    }

    /* list(account, {app, name, pages, first, onProgress, since, cache}) -> saves newest first (no payload decoding).
       Scans the account's custom_json history, 1000 at a time, newest first, up to `pages` pages (default 30).
       Fast paths (2026-11-05, a full scan of a busy account took ~20 requests):
       - since (ISO, default SINCE = the day MESHiveStore went live): stop once the history is older than that; no save can be.
       - cache (default true in a browser): the account's mes_store ops already seen are kept in localStorage
         ("mes-hive-store:hist:<account>": {top: newest history index scanned, ops: [[index, op]]}), so the next list only reads
         history newer than `top` (usually one request). first: stop at the first complete save. */
    var SINCE = "2026-10-30T00:00:00";
    function cacheKey(account) { return "mes-hive-store:hist:" + account; }
    function cacheGet(account) {
        try { var c = JSON.parse(root.localStorage.getItem(cacheKey(account)) || "null"); if (c && c.v === 1 && Array.isArray(c.ops) && c.top >= 0) return c; } catch (e) {}
        return null;
    }
    function cachePut(account, top, ops) {
        try { root.localStorage.setItem(cacheKey(account), JSON.stringify({ v: 1, top: top, ops: ops.slice(-600) })); } catch (e) {}
    }
    function ours(it) { var op = it && it[1] && it[1].op; return !!(op && op[0] === "custom_json" && op[1] && op[1].id === ID); }
    function list(account, opt) {
        opt = opt || {};
        var pages = opt.pages || 30, since = opt.since === undefined ? SINCE : opt.since, start = -1, n = 0, top = -1;
        var useCache = opt.cache !== false && root.localStorage, cached = useCache ? cacheGet(account) : null;
        var fresh = [];   /* our ops read this time, oldest first */
        function result(whole) {
            var all = fresh;
            if (cached) { var seen = {}; fresh.forEach(function (it) { seen[it[0]] = 1; }); all = cached.ops.filter(function (it) { return !seen[it[0]]; }).concat(fresh); all.sort(function (a, b) { return a[0] - b[0]; }); }
            if (useCache && whole && top >= 0) cachePut(account, Math.max(top, cached ? cached.top : -1), all);
            return assemble(all, account, opt);
        }
        function page() {
            return H().call("condenser_api.get_account_history", [account, start, start < 0 ? 1000 : Math.min(1000, start + 1), FILTER_CUSTOM_JSON, 0], { timeout: 15000 }).then(function (r) {
                r = r || [];
                n++;
                if (r.length && top < 0) top = r[r.length - 1][0];
                fresh = r.filter(ours).concat(fresh);
                if (opt.onProgress) opt.onProgress(n, pages);
                var oldest = r.length ? r[0][0] : 0, oldT = r.length ? (r[0][1] && r[0][1].timestamp) || "" : "";
                if (cached && oldest <= cached.top) return result(true);          /* reached what was read last time */
                if (since && oldT && oldT < since) return result(true);          /* older than any possible save */
                if (opt.first && assemble(fresh, account, opt).some(function (e) { return e.complete; })) return result(false);
                if (n >= pages) return result(false);
                if (!r.length || oldest <= 0 || r.length < 2) return result(true);
                start = oldest - 1;
                if (start < 0) return result(true);
                return page();
            });
        }
        return page().catch(function (e) {
            if (/does not exist|unknown account/i.test(e.message)) return [];
            throw e;
        });
    }
    function load(entry) {
        var account = need();
        var first = true;
        return unpack(entry, {
            unwrapKey: unwrapKeyFor(account),
            getPass: function (st) {
                var k = knownPass(account);
                if (first && k && !st.wrong) { first = false; return k; }
                first = false;
                return askPass({ mode: "open", account: account, wrong: st.wrong && st.tries > 0 });
            },
            onPassOk: function (pw) { if (!memPass[account]) memPass[account] = pw; }
        });
    }
    function forget(app, name, saveId) {
        return Promise.resolve().then(function () {
            var account = need();
            return kcCall(function (k, done) { k.requestBroadcast(account, [customJson(account, tombstone(app, name, saveId))], "Posting", done, null, "Hide a Hive save"); });
        });
    }
    /* hide several saves at once: up to OPS_PER_TX tombstones per transaction (one Keychain prompt each), TX_GAP_MS apart */
    function forgetMany(app, name, saveIds, onProgress) {
        var account, groups = [];
        for (var i = 0; i < saveIds.length; i += OPS_PER_TX) groups.push(saveIds.slice(i, i + OPS_PER_TX));
        var done = 0;
        return groups.reduce(function (p, g, gi) {
            return p.then(function () {
                account = account || need();
                return (gi ? sleep(TX_GAP_MS) : Promise.resolve()).then(function () {
                    return kcCall(function (k, cb) { k.requestBroadcast(account, g.map(function (id) { return customJson(account, tombstone(app, name, id)); }), "Posting", cb, null, g.length > 1 ? "Hide " + g.length + " Hive saves" : "Hide a Hive save"); });
                }).then(function () { done += g.length; if (onProgress) onProgress(done, saveIds.length); });
            });
        }, Promise.resolve()).then(function () { return done; });
    }
    function explorer(trx) { return "https://hivehub.dev/tx/" + encodeURIComponent(trx); }

    /* ---------- lock choice + passphrase dialog (browser only; self-contained CSS, light + dark) ---------- */
    function lockLabel(e) { return !e || !e.encrypted ? "👁 public" : e.lock === "pass" ? "🛡 passphrase (quantum-safe)" : "🔒 memo key"; }
    var CSS = ".mhs-ov{position:fixed;inset:0;z-index:2147483646;background:rgba(10,14,24,.55);display:flex;align-items:center;justify-content:center;padding:16px;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
        ".mhs-card{background:#fff;color:#1d2330;border-radius:12px;max-width:470px;width:100%;max-height:92vh;overflow:auto;padding:18px 20px;box-shadow:0 18px 60px rgba(0,0,0,.35)}" +
        ".mhs-card *{color:inherit;box-sizing:border-box}.mhs-card h3{margin:0 0 6px;font-size:1.15em;line-height:1.3}.mhs-card p{margin:6px 0;font-size:.93em}" +
        ".mhs-card a{color:#1d5fd0}.mhs-in{width:100%;font:inherit;font-family:ui-monospace,Menlo,Consolas,monospace;padding:9px 10px;border:1px solid #b8c0cc;border-radius:8px;background:#fff;color:#1d2330;margin:4px 0}" +
        ".mhs-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0}.mhs-b{font:inherit;font-size:.92em;padding:7px 12px;border-radius:8px;border:1px solid #b8c0cc;background:#f3f5f8;cursor:pointer}" +
        ".mhs-b--p{background:#15803d;border-color:#15803d;color:#fff!important}.mhs-b:disabled{opacity:.5;cursor:default}.mhs-ck{display:flex;gap:7px;align-items:flex-start;font-size:.9em;margin:5px 0}.mhs-ck input{margin-top:3px}" +
        ".mhs-meter{height:6px;border-radius:3px;background:#e3e7ed;overflow:hidden;margin-top:4px}.mhs-meter i{display:block;height:100%;width:0;background:#c0392b;transition:width .2s}" +
        ".mhs-st{font-size:.85em;margin-top:3px}.mhs-err{color:#b42318!important;font-weight:600;font-size:.9em}.mhs-note{font-size:.84em;opacity:.85}" +
        ".mhs-dark .mhs-card{background:#1f242d;color:#e6e9ef}.mhs-dark .mhs-in{background:#141820;color:#e6e9ef;border-color:#4a5363}.mhs-dark .mhs-b{background:#2b313c;border-color:#4a5363}" +
        ".mhs-dark .mhs-b--p{background:#16a34a;border-color:#16a34a}.mhs-dark .mhs-card a{color:#7fb0ff}.mhs-dark .mhs-meter{background:#353c48}.mhs-dark .mhs-err{color:#ff8a80!important}" +
        ".mhs-lock{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px;font-size:.9em}.mhs-lock button{font:inherit;font-size:.95em;padding:4px 10px;border-radius:999px;border:1px solid #9aa4b2;background:transparent;cursor:pointer;color:inherit}" +
        ".mhs-lock button[aria-pressed=true]{background:#15803d;border-color:#15803d;color:#fff}.mhs-lock .mhs-lk-m[aria-pressed=true]{background:#475569;border-color:#475569}.mhs-lock a{font-size:.92em}.mhs-lock.is-off{opacity:.55}" +
        ".mhs-lock [hidden],.mhs-card [hidden]{display:none!important}.mhs-lockn{font-size:.82em;opacity:.85;margin:0 0 4px;flex-basis:100%}";
    function css() { if (document.getElementById("mhs-css")) return; var st = document.createElement("style"); st.id = "mhs-css"; st.textContent = CSS; document.head.appendChild(st); }
    function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
    function strength(bits) {
        if (bits >= 100) return [100, "#15803d", "Very strong: safe for the long run, quantum computers included."];
        if (bits >= 80) return [80, "#2f9e44", "Strong."];
        if (bits >= 60) return [55, "#d97706", "Okay, but longer is better for something kept forever."];
        return [Math.max(8, bits * 0.8), "#c0392b", "Too weak: easy to guess. Use Make one for me, or 5+ random words."];
    }
    /* askPass({mode: "save"|"open", account, wrong}) -> Promise of the passphrase, or null when cancelled */
    function askPass(o) {
        o = o || {};
        return new Promise(function (resolve) {
            css();
            var save = o.mode === "save";
            var ov = el("div", { "class": "mhs-ov" + (document.body.classList.contains("dark-mode") || document.body.classList.contains("dark") ? " mhs-dark" : ""), role: "dialog", "aria-modal": "true" });
            var why = '<a href="' + QPAGE + '" target="_blank" rel="noopener">How this stays safe from quantum computers</a>';
            ov.innerHTML = '<div class="mhs-card">' + (save
                ? '<h3>🛡 Lock with a passphrase (quantum-safe)</h3><p>Your data is locked in this browser with AES-256, using a key made from this passphrase. No memo key or elliptic-curve maths is involved, so a future quantum computer can\'t unlock it: only the passphrase can. ' + why + '.</p>' +
                  '<p><b>Keep it safe:</b> if you lose the passphrase, saves locked with it can never be opened, by you or anyone. Use the same one on every MES page and device.</p>'
                : '<h3>🛡 Passphrase needed</h3><p>This Hive save was locked with a passphrase. Type it to open it.</p>') +
                (o.wrong ? '<p class="mhs-err">That passphrase didn\'t open it. Try again.</p>' : '') +
                '<input class="mhs-in" id="mhs-p1" type="password" autocomplete="' + (save ? "new-password" : "current-password") + '" placeholder="Passphrase" spellcheck="false" autocapitalize="off">' +
                (save ? '<input class="mhs-in" id="mhs-p2" type="password" autocomplete="new-password" placeholder="Type it again" spellcheck="false" autocapitalize="off">' +
                  '<div class="mhs-meter"><i id="mhs-bar"></i></div><div class="mhs-st" id="mhs-st">At least ' + PASS_MIN + ' characters.</div>' : '') +
                '<div class="mhs-row"><button type="button" class="mhs-b" id="mhs-show">Show</button>' + (save ? '<button type="button" class="mhs-b" id="mhs-gen">🎲 Make one for me</button><button type="button" class="mhs-b" id="mhs-copy" hidden>Copy</button>' : '') + '</div>' +
                (save ? '<label class="mhs-ck"><input type="checkbox" id="mhs-ok"> <span>I have written it down or saved it in my password manager.</span></label>' : '') +
                '<label class="mhs-ck"><input type="checkbox" id="mhs-keep"> <span>Remember it on this device (anyone using this browser could open your saves)</span></label>' +
                '<div class="mhs-row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="mhs-b" id="mhs-no">Cancel</button><button type="button" class="mhs-b mhs-b--p" id="mhs-yes">' + (save ? "Lock and save" : "Open") + '</button></div></div>';
            document.body.appendChild(ov);
            function $(id) { return ov.querySelector("#" + id); }
            var p1 = $("mhs-p1"), p2 = $("mhs-p2"), yes = $("mhs-yes");
            $("mhs-keep").checked = !!(o.account && isRemembered(o.account));
            function check() {
                if (!save) { yes.disabled = !p1.value; return; }
                var bits = passBits(p1.value), sv = strength(bits), bar = $("mhs-bar");
                bar.style.width = sv[0] + "%"; bar.style.background = sv[1];
                var msg = p1.value.length < PASS_MIN ? "At least " + PASS_MIN + " characters." : sv[2];
                if (p2.value && p2.value !== p1.value) msg = "The two don't match yet.";
                $("mhs-st").textContent = msg;
                yes.disabled = !(p1.value.length >= PASS_MIN && bits >= 50 && p1.value === p2.value && $("mhs-ok").checked);
            }
            function done(v) { document.removeEventListener("keydown", key, true); ov.remove(); resolve(v); }
            function key(ev) { if (ev.key === "Escape") { ev.stopPropagation(); done(null); } else if (ev.key === "Enter" && !yes.disabled && ov.contains(ev.target)) { ev.preventDefault(); yes.click(); } }
            document.addEventListener("keydown", key, true);
            ov.addEventListener("input", check); ov.addEventListener("change", check);
            $("mhs-show").onclick = function () { var t = p1.type === "password" ? "text" : "password"; p1.type = t; if (p2) p2.type = t; this.textContent = t === "text" ? "Hide" : "Show"; };
            if (save) {
                $("mhs-gen").onclick = function () { var g = generatePass(); p1.value = p2.value = g; p1.type = p2.type = "text"; $("mhs-show").textContent = "Hide"; $("mhs-copy").hidden = false; check(); };
                $("mhs-copy").onclick = function () { var b = this; try { navigator.clipboard.writeText(p1.value).then(function () { b.textContent = "Copied ✓"; }); } catch (e) {} };
            }
            $("mhs-no").onclick = function () { done(null); };
            ov.addEventListener("mousedown", function (ev) { if (ev.target === ov) done(null); });
            yes.onclick = function () { if (yes.disabled) return; var v = p1.value; if (o.account) rememberPass(o.account, v, $("mhs-keep").checked); if (o.account && !$("mhs-keep").checked) ls(PASS_KEY + o.account, null); done(v); };
            check(); setTimeout(function () { p1.focus(); }, 30);
        });
    }
    /* encModeUI(encryptCheckbox, onChange) puts "Lock with: Memo key | Passphrase (quantum-safe)" under the page's Encrypt tick.
       One choice for every MES page. onChange(mode) lets the page repaint its notes / enable the tick (canEncrypt() changes). */
    function encModeUI(cb, onChange) {
        if (!cb || typeof document === "undefined") return null;
        css();
        var box = el("div", { "class": "mhs-lock" });
        box.innerHTML = '<span>Lock with:</span><button type="button" class="mhs-lk-m">🔑 Memo key</button><button type="button" class="mhs-lk-p">🛡 Passphrase (quantum-safe)</button>' +
            '<a href="' + QPAGE + '" target="_blank" rel="noopener" title="Why the memo key is not quantum-safe">Why?</a> <a href="#" class="mhs-lk-f" hidden>Forget the remembered passphrase</a><div class="mhs-lockn"></div>';
        var anchor = cb.closest("label") || cb;
        anchor.parentNode.insertBefore(box, anchor.nextSibling);
        function paint() {
            var m = lockMode(), u = root.MESHive && root.MESHive.user && root.MESHive.user();
            box.querySelector(".mhs-lk-m").setAttribute("aria-pressed", m === "memo");
            box.querySelector(".mhs-lk-p").setAttribute("aria-pressed", m === "pass");
            box.classList.toggle("is-off", !cb.checked && !cb.disabled);
            var f = box.querySelector(".mhs-lk-f"); f.hidden = !(m === "pass" && u && (isRemembered(u.name) || memPass[u.name]));
            box.querySelector(".mhs-lockn").textContent = m === "pass"
                ? "AES-256 with a key from your passphrase: safe from quantum computers as long as the passphrase is strong. Lose it and the save is gone for good."
                : "Easy (Keychain does it), but the memo key is elliptic-curve: a big future quantum computer could unlock these saves, and Hive keeps them forever.";
        }
        box.addEventListener("click", function (ev) {
            var b = ev.target.closest("button,a.mhs-lk-f"); if (!b) return;
            if (b.classList.contains("mhs-lk-f")) { ev.preventDefault(); var u = root.MESHive && root.MESHive.user && root.MESHive.user(); if (u) forgetPass(u.name); paint(); return; }
            setLock(b.classList.contains("mhs-lk-p") ? "pass" : "memo");
        });
        cb.addEventListener("change", paint);
        subs.push(function (m) { paint(); if (onChange) onChange(m); });
        try { window.addEventListener("storage", function (ev) { if (ev.key === LOCK_KEY) fire(); }); } catch (e) {}
        paint();
        return { refresh: paint };
    }

    var api = {
        ID: ID, V: V, JSON_MAX: JSON_MAX, OPS_PER_TX: OPS_PER_TX, MAX_CHUNKS: MAX_CHUNKS,
        b64: b64, unb64: unb64, hex: hex, unhex: unhex, okName: okName, newSaveId: newSaveId,
        chunkJsons: chunkJsons, buildTxs: buildTxs, customJson: customJson, tombstone: tombstone, assemble: assemble,
        pack: pack, unpack: unpack,
        passKey: passKey, passBits: passBits, generatePass: generatePass, PASS_ROUNDS: PASS_ROUNDS, QPAGE: QPAGE,
        lockMode: lockMode, setLock: setLock, forgetPass: forgetPass, isRemembered: isRemembered, askPass: askPass, encModeUI: encModeUI, lockLabel: lockLabel,
        SINCE: SINCE, save: save, list: list, load: load, forget: forget, forgetMany: forgetMany, canEncrypt: canEncrypt, rcPercent: rcPercent, explorer: explorer
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.MESHiveStore = root.MESHiveStore || api;
})(typeof window !== "undefined" ? window : globalThis);
