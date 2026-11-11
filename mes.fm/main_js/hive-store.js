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
            e.encrypted = e.header.e === 1;
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
    function aad(app, name, saveId) { return utf8(ID + "/" + V + "/" + app + "/" + name + "/" + saveId); }
    function sha16(bytes) { return crypto.subtle.digest("SHA-256", bytes).then(function (d) { return hex(new Uint8Array(d)).slice(0, 16); }); }

    /* data -> {header, payload}. wrapKey(hexKey) -> Promise of the wrapped key string (Keychain memo encoding in the browser). */
    function pack(data, o) {
        var raw = utf8(JSON.stringify(data));
        var saveId = o.saveId || newSaveId();
        var header = { e: o.encrypt ? 1 : 0, z: "", b: raw.length, t: new Date(o.now || Date.now()).toISOString() };
        return deflate(raw).then(function (z) {
            var body = raw;
            if (z && z.length < raw.length) { body = z; header.z = "d"; }
            if (!o.encrypt) return sha16(raw).then(function (h) { header.sha = h; return { saveId: saveId, header: header, payload: b64(body) }; });
            var key = randomBytes(32), iv = randomBytes(12);
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
        if (h.e === 1) {
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
            if (h.e !== 1 && h.sha) return sha16(raw).then(function (s) { if (s !== h.sha) throw new Error("This save is damaged (checksum)."); return raw; });
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
    function canEncrypt() { var h = root.MESHive; return !(h && h.memoOk && !h.memoOk()); }
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
            if (opt.encrypt && !canEncrypt()) { var ne = new Error(H().NO_MEMO || "Encryption is not available with this login."); ne.code = "nomemo-has"; throw ne; }
            if (opt.encrypt) say("Confirm in Keychain: encrypt the backup key to your own memo key…");
            return pack(data, { encrypt: !!opt.encrypt, app: app, name: name, wrapKey: wrapKeyFor(account) }).then(function (pk) {
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
        return unpack(entry, { unwrapKey: unwrapKeyFor(account) });
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

    var api = {
        ID: ID, V: V, JSON_MAX: JSON_MAX, OPS_PER_TX: OPS_PER_TX, MAX_CHUNKS: MAX_CHUNKS,
        b64: b64, unb64: unb64, hex: hex, unhex: unhex, okName: okName, newSaveId: newSaveId,
        chunkJsons: chunkJsons, buildTxs: buildTxs, customJson: customJson, tombstone: tombstone, assemble: assemble,
        pack: pack, unpack: unpack,
        SINCE: SINCE, save: save, list: list, load: load, forget: forget, forgetMany: forgetMany, canEncrypt: canEncrypt, rcPercent: rcPercent, explorer: explorer
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.MESHiveStore = root.MESHiveStore || api;
})(typeof window !== "undefined" ? window : globalThis);
