/* node tool_apps_src/hive-store-tests.js -- pure parts of mes.fm/main_js/hive-store.js (chunking, ops, assembling saves from
   account history, pack / unpack with a fake Keychain key wrap) + Copy Text's merge (tool_apps_src/copy-text/lib.js). */
"use strict";
const assert = require("assert");
const path = require("path");
const S = require(path.join(__dirname, "../mes.fm/main_js/hive-store.js"));
const CT = require(path.join(__dirname, "copy-text/lib.js"));

let n = 0;
async function t(name, fn) { await fn(); n++; console.log("ok -", name); }

const fakeWrap = (h) => Promise.resolve("#FAKE" + h.split("").reverse().join(""));
const fakeUnwrap = (w) => Promise.resolve("#" + w.slice(5).split("").reverse().join(""));

/* turn txs into history items like condenser_api.get_account_history returns (oldest first) */
function history(txsList, account) {
    const items = []; let idx = 10, block = 1000;
    txsList.forEach((txs) => txs.forEach((ops) => {
        block++;
        ops.forEach((op) => { items.push([idx++, { op: op, block: block, trx_id: "t" + block, timestamp: new Date(Date.UTC(2026, 9, 31, 0, 0, block % 60)).toISOString().slice(0, 19) }]); });
    }));
    return items;
}
function rnd(len) { let s = ""; while (s.length < len) s += Math.random().toString(36).slice(2); return s.slice(0, len); }

(async () => {
    await t("b64 / hex round trip", () => {
        const b = new Uint8Array(300).map((x, i) => (i * 37) & 255);
        assert.deepStrictEqual(S.unb64(S.b64(b)), b);
        assert.deepStrictEqual(S.unhex(S.hex(b)), b);
        assert.throws(() => S.unhex("zz"));
    });

    await t("chunk json stays under 8192 bytes, header only on chunk 0", () => {
        const payload = rnd(40000);
        const js = S.chunkJsons("copy-text", "boards", "abcdef123456", { e: 1, k: "#" + rnd(200), iv: "x", b: 1, z: "d", t: "2026" }, payload);
        js.forEach((j, i) => {
            assert(Buffer.byteLength(j) <= S.JSON_MAX, "chunk " + i + " too big");
            const o = JSON.parse(j); assert.strictEqual(o.i, i); assert.strictEqual(o.c, js.length);
            assert.strictEqual(!!o.h, i === 0);
        });
        assert.strictEqual(js.map((j) => JSON.parse(j).d).join(""), payload);
        assert(js.length <= 6);
    });

    await t("too big is refused with a clear error", () => {
        assert.throws(() => S.chunkJsons("copy-text", "boards", "abcd", { e: 0 }, rnd(200000)), (e) => e.code === "toobig");
    });

    await t("bad app / name rejected", () => {
        assert.throws(() => S.chunkJsons("Copy Text", "boards", "abcd", {}, "x"));
        assert.throws(() => S.chunkJsons("copy-text", "../x", "abcd", {}, "x"));
    });

    await t("transactions: <= 5 ops, < 64 KB, header chunk sent last", () => {
        const js = S.chunkJsons("copy-text", "boards", "abcd", { e: 0 }, rnd(70000));
        const txs = S.buildTxs("alice", js);
        txs.forEach((tx) => { assert(tx.length <= S.OPS_PER_TX); assert(JSON.stringify(tx).length < 64 * 1024); });
        const last = txs[txs.length - 1];
        assert.strictEqual(JSON.parse(last[last.length - 1][1].json).i, 0);
        assert.deepStrictEqual(last[0][1].required_posting_auths, ["alice"]);
        assert.strictEqual(last[0][1].id, "mes_store");
    });

    await t("pack / unpack plain round trip (compressed + checksum)", async () => {
        const data = { v: 1, boards: [{ name: "Work", notes: [{ title: "Sig", text: "Best,\nMES " + "é✓".repeat(500) }] }] };
        const pk = await S.pack(data, { encrypt: false, app: "copy-text", name: "boards" });
        assert.strictEqual(pk.header.e, 0); assert.strictEqual(pk.header.z, "d"); assert(pk.header.sha);
        const txs = S.buildTxs("alice", S.chunkJsons("copy-text", "boards", pk.saveId, pk.header, pk.payload));
        const saves = S.assemble(history([txs], "alice"), "alice", { app: "copy-text" });
        assert.strictEqual(saves.length, 1); assert(saves[0].complete);
        assert.deepStrictEqual(await S.unpack(saves[0]), data);
    });

    await t("pack / unpack encrypted round trip; payload does not contain the text", async () => {
        const data = { secret: "my address 123 Main St" };
        const pk = await S.pack(data, { encrypt: true, app: "copy-text", name: "boards", wrapKey: fakeWrap });
        assert.strictEqual(pk.header.e, 1); assert(pk.header.k.startsWith("#")); assert(!pk.header.sha);
        assert(!Buffer.from(pk.payload, "base64").toString("latin1").includes("Main St"));
        const txs = S.buildTxs("alice", S.chunkJsons("copy-text", "boards", pk.saveId, pk.header, pk.payload));
        const e = S.assemble(history([txs], "alice"), "alice")[0];
        assert(e.encrypted);
        await assert.rejects(S.unpack(e), /encrypted/);
        assert.deepStrictEqual(await S.unpack(e, { unwrapKey: fakeUnwrap }), data);
        /* wrong key */
        await assert.rejects(S.unpack(e, { unwrapKey: () => Promise.resolve("#" + "00".repeat(32)) }), /decrypted/);
        /* the AES data is bound to the save id: relabelled copy fails */
        const copy = Object.assign({}, e, { s: "ffffffff" });
        await assert.rejects(S.unpack(copy, { unwrapKey: fakeUnwrap }), /decrypted/);
    });

    await t("assemble: newest first, foreign signer / other id / other app ignored, tombstone hides", async () => {
        const mk = async (txt, s) => { const pk = await S.pack({ x: txt }, { app: "copy-text", name: "boards", saveId: s }); return S.buildTxs("alice", S.chunkJsons("copy-text", "boards", s, pk.header, pk.payload)); };
        const a = await mk("old", "aaaa1111"), b = await mk("new", "bbbb2222");
        const items = history([a, b], "alice");
        items.push([99, { op: ["custom_json", { id: "mes_store", required_auths: [], required_posting_auths: ["mallory"], json: JSON.parse(JSON.stringify(b[0][0][1].json)) }], block: 5000, trx_id: "m", timestamp: "2026-11-01T00:00:00" }]);
        items.push([100, { op: ["custom_json", { id: "other", required_auths: [], required_posting_auths: ["alice"], json: "{}" }], block: 5001 }]);
        items.push([101, { op: ["custom_json", { id: "mes_store", required_auths: [], required_posting_auths: ["alice"], json: "not json" }], block: 5002 }]);
        let saves = S.assemble(items, "alice");
        assert.deepStrictEqual(saves.map((s) => s.s), ["bbbb2222", "aaaa1111"]);
        assert.deepStrictEqual(await S.unpack(saves[0]), { x: "new" });
        assert.strictEqual(S.assemble(items, "alice", { app: "nba-picks" }).length, 0);
        items.push([102, { op: S.customJson("alice", S.tombstone("copy-text", "boards", "bbbb2222")), block: 6000 }]);
        saves = S.assemble(items, "alice");
        assert.deepStrictEqual(saves.map((s) => s.s), ["aaaa1111"]);
    });

    await t("assemble: missing chunk = incomplete, duplicate chunk ignored", async () => {
        const pk = await S.pack({ big: rnd(60000) }, { app: "copy-text", name: "boards", saveId: "cccc3333" });
        const txs = S.buildTxs("alice", S.chunkJsons("copy-text", "boards", "cccc3333", pk.header, pk.payload));
        assert(txs.length >= 2);
        const items = history([txs.slice(1)], "alice");       // first transaction lost
        const e = S.assemble(items, "alice")[0];
        assert.strictEqual(e.complete, false);
        await assert.rejects(S.unpack(e), /missing/);
        const full = history([txs], "alice"); full.push(full[0]);
        assert(S.assemble(full, "alice")[0].complete);
    });

    await t("Copy Text: snapshot strips ids, merge skips duplicates, replace", () => {
        const local = { v: 1, cur: "b1", boards: [{ id: "b1", name: "Work", notes: [{ id: "n1", title: "Sig", text: "Best", c: "y", pin: true, t: 1 }] }] };
        const snap = CT.snapshot(local);
        assert(!JSON.stringify(snap).includes("n1"));
        const incoming = { v: 1, boards: [{ name: "Work", notes: [{ title: "Sig", text: "Best" }, { title: "", text: "New one", c: "zz" }] }, { name: "Home", notes: [{ text: "Addr" }] }, { name: "Bad", notes: "x" }] };
        let id = 0; const uid = () => "u" + (++id);
        const r = CT.merge(local, incoming, uid);
        assert.strictEqual(r.added, 2); assert.strictEqual(r.boards, 1);
        assert.strictEqual(local.boards[0].notes.length, 2); assert.strictEqual(local.boards[0].notes[1].c, "");
        assert.strictEqual(local.boards[1].name, "Home");
        assert.strictEqual(CT.merge(local, incoming, uid).added, 0);
        const rep = CT.replace(incoming, uid);
        assert.strictEqual(rep.boards.length, 2); assert(rep.cur === rep.boards[0].id);
        assert.throws(() => CT.merge(local, { nope: 1 }, uid));
    });

    await t("Copy Text: backup status per note (record = hashes only)", () => {
        const st = { boards: [{ id: "b", name: "W", notes: [{ id: "a", title: "x", text: "one" }, { id: "b2", title: "", text: "two" }] }] };
        const rec = CT.record(CT.snapshot(st), 5, "alice");
        assert(!JSON.stringify(rec).includes("one"));
        let s = CT.status(st, rec); assert.strictEqual(s.on, 2); assert.strictEqual(s.off, 0); assert.strictEqual(s.gone, 0);
        st.boards[0].notes[0].text = "one!"; st.boards[0].notes.push({ id: "c", text: "three" });
        s = CT.status(st, rec); assert.strictEqual(s.by.a, "off"); assert.strictEqual(s.by.b2, "on"); assert.strictEqual(s.off, 2); assert.strictEqual(s.gone, 1);
        assert.strictEqual(CT.status(st, null).off, 3);
    });

    await t("list: stops at SINCE and reads only new history the next time", async () => {
        const store = {}; globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
        const pk = await S.pack({ a: 1 }, { app: "copy-text", name: "boards", saveId: "dddd4444" });
        const ours = S.buildTxs("alice", S.chunkJsons("copy-text", "boards", "dddd4444", pk.header, pk.payload))[0];
        let hist = [];
        for (let i = 0; i < 5000; i++) hist.push([i, { op: ["custom_json", { id: "other", json: "{}", required_posting_auths: ["alice"], required_auths: [] }], timestamp: i < 3000 ? "2026-01-01T00:00:00" : "2026-11-01T00:00:00", block: i }]);
        ours.forEach((op) => hist.push([hist.length, { op, timestamp: "2026-11-02T00:00:00", block: 9e6, trx_id: "tx" }]));
        let calls = 0;
        globalThis.MESHive = { call: (m, [acct, start, limit]) => { calls++; const top = start < 0 ? hist.length - 1 : start; return Promise.resolve(hist.filter((h) => h[0] <= top).slice(-limit)); } };
        let r = await S.list("alice", { app: "copy-text", name: "boards" });
        assert.strictEqual(r.length, 1); assert(r[0].complete); assert.strictEqual(calls, 3, "stopped at the 2026-01 history");
        calls = 0; r = await S.list("alice", { app: "copy-text", name: "boards" });
        assert.strictEqual(r.length, 1); assert.strictEqual(calls, 1, "second look = one request");
        hist.push([hist.length, { op: ["custom_json", { id: "mes_store", json: S.tombstone("copy-text", "boards", "dddd4444"), required_posting_auths: ["alice"], required_auths: [] }], timestamp: "2026-11-03T00:00:00", block: 9e6 + 1 }]);
        calls = 0; r = await S.list("alice", { app: "copy-text", name: "boards" });
        assert.strictEqual(r.length, 0); assert.strictEqual(calls, 1);
        delete globalThis.MESHive; delete globalThis.localStorage;
    });

    console.log("\n" + n + " tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
