/* Tests for MES Mail's core (tool_apps_src/email/lib.js).
   node tool_apps_src/email-tests.js
   With the real post-quantum KEM: NOBLE=/path/to/node_modules node tool_apps_src/email-tests.js
   (npm i @noble/post-quantum@0.7.1 somewhere; without it a stand-in X25519 KEM from node:crypto is used, same shapes). */
"use strict";
const path = require("path");
const nodeCrypto = require("crypto");
const M = require(path.join(__dirname, "email/lib.js"));

let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL:", msg); } }
async function throws(fn, re, msg) { try { await fn(); fail++; console.log("FAIL (no throw):", msg); } catch (e) { ok(!re || re.test(e.message), msg + " -> " + e.message); } }

/* stand-in KEM: X25519 from node:crypto, public key padded to X-Wing's 1,216 bytes, ciphertext to 1,120 */
const PK8 = Buffer.from("302e020100300506032b656e04220420", "hex");
function x25519Priv(seed) { return nodeCrypto.createPrivateKey({ key: Buffer.concat([PK8, Buffer.from(seed)]), format: "der", type: "pkcs8" }); }
function rawPub(priv) { return nodeCrypto.createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(-32); }
function pubObj(raw) { return nodeCrypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b656e032100", "hex"), Buffer.from(raw)]), format: "der", type: "spki" }); }
const fakeKem = {
    keygen(seed) { const p = x25519Priv(seed); const pub = new Uint8Array(1216); pub.set(rawPub(p)); return { publicKey: pub, secretKey: new Uint8Array(seed) }; },
    encapsulate(pub) {
        const eph = nodeCrypto.randomBytes(32), ep = x25519Priv(eph);
        const ss = nodeCrypto.diffieHellman({ privateKey: ep, publicKey: pubObj(pub.subarray(0, 32)) });
        const ct = new Uint8Array(1120); ct.set(rawPub(ep));
        return { cipherText: ct, sharedSecret: new Uint8Array(ss) };
    },
    decapsulate(ct, sk) { return new Uint8Array(nodeCrypto.diffieHellman({ privateKey: x25519Priv(sk), publicKey: pubObj(ct.subarray(0, 32)) })); }
};

(async function () {
    let kemName = "stand-in X25519";
    if (process.env.NOBLE) {
        const mod = await import(path.join(process.env.NOBLE, "@noble/post-quantum/hybrid.js"));
        M.setKem(mod.ml_kem768_x25519); kemName = "X-Wing (ML-KEM-768 + X25519)";
    } else M.setKem(fakeKem);
    console.log("KEM:", kemName);

    /* names */
    ok(M.validName("mes") && M.validName("@MesTruth") && M.validName("hive-io.test"), "valid names");
    ok(!M.validName("ab") && !M.validName("1abc") && !M.validName("a_b") && !M.validName("abcdefghijklmnopq"), "invalid names");
    const pt = M.parseTo("@mes, bob  bob;x carol");
    ok(pt.names.join() === "mes,bob,carol" && pt.bad.join() === "x", "parseTo");
    ok(M.passBits("aaaaaaaaaaaaaaaa") <= 20 && M.passBits(M.generatePass()) > 100, "passBits");
    ok(/^([a-z2-9]{5}-){5}[a-z2-9]{5}$/.test(M.generatePass()), "generatePass shape");

    /* keys are deterministic from passphrase + account */
    const sA = await M.deriveSeed("correct horse battery staple x", "alice", 1000);
    const sA2 = await M.deriveSeed("correct horse battery staple x", "alice", 1000);
    const sB = await M.deriveSeed("correct horse battery staple x", "bob", 1000);
    ok(M.hex(sA) === M.hex(sA2) && M.hex(sA) !== M.hex(sB) && sA.length === 32, "seed deterministic, salted by account");
    const A = M.keysFromSeed(sA), B = M.keysFromSeed(sB), C = M.keysFromSeed(await M.deriveSeed("other pass phrase here", "carol", 1000));
    ok(A.pub.length === 1216, "public key 1216 bytes");
    ok(M.hex(M.keysFromSeed(sA).pub) === M.hex(A.pub), "same seed same key");
    const fp = await M.fingerprint(A.pub);
    ok(/^([0-9a-f]{4} ){5}[0-9a-f]{4}$/.test(fp), "fingerprint " + fp);

    /* profile metadata */
    const merged = M.mergeProfile(JSON.stringify({ profile: { name: "Alice", about: "hi" }, x: 1 }), A.pub, Date.UTC(2026, 10, 17));
    const mj = JSON.parse(merged);
    ok(mj.profile.name === "Alice" && mj.x === 1 && mj.mes_mail.v === 1, "merge keeps profile");
    ok(M.hex(M.profileKey(merged).pub) === M.hex(A.pub), "profileKey reads it back");
    ok(M.profileKey("") === null && M.profileKey("{bad") === null && M.profileKey('{"mes_mail":{"v":1,"k":"AAAA"}}') === null, "profileKey rejects");
    ok(JSON.parse(M.mergeProfile("", A.pub)).mes_mail, "merge into empty");
    await throws(() => M.mergeProfile("{broken", A.pub), /left alone/, "merge refuses unreadable profile");
    await throws(() => M.mergeProfile("[1]", A.pub), /left alone/, "merge refuses array profile");

    /* seal / open */
    const pubs = { alice: A.pub, bob: B.pub, carol: C.pub };
    const body = "Hello Bob!\n\nThis is a **secret**. ".repeat(20) + "ünïcødé 🚀";
    const r = await M.seal({ from: "alice", to: ["bob"], pubs, payload: { s: "Hi there", b: body } });
    ok(/^[0-9a-f]{16}$/.test(r.msgId) && r.env.f === "alice" && r.env.to.join() === "bob", "seal shape");
    ok(r.env.k.alice && r.env.k.bob && !r.env.k.carol, "keys for sender + recipient only");
    ok(r.env.z === "d" || typeof CompressionStream === "undefined", "body compressed");
    ok(r.env.d.indexOf("secret") < 0 && JSON.stringify(r.env).indexOf("Hi there") < 0, "subject + body not visible");
    const pb = await M.open(r.env, r.msgId, "bob", B.sk);
    ok(pb.s === "Hi there" && pb.b === body && pb.th === r.msgId, "bob reads it");
    const pa = await M.open(r.env, r.msgId, "alice", A.sk);
    ok(pa.b === body, "sender reads own sent copy");
    await throws(() => M.open(r.env, r.msgId, "carol", C.sk), /not sent to you/, "carol can't");
    await throws(() => M.open(r.env, r.msgId, "bob", A.sk), /could not/, "wrong secret key fails");
    await throws(() => M.open(r.env, "0000000000000000", "bob", B.sk), /could not/, "other message id fails (AAD + HKDF salt)");
    const t1 = JSON.parse(JSON.stringify(r.env)); t1.to = ["bob", "carol"];
    await throws(() => M.open(t1, r.msgId, "bob", B.sk), /could not/, "changed recipients fail");
    const t2 = JSON.parse(JSON.stringify(r.env)); t2.f = "carol";
    await throws(() => M.open(t2, r.msgId, "bob", B.sk), /could not/, "changed sender fails");
    const t3 = JSON.parse(JSON.stringify(r.env)); const db = M.unb64(t3.d); db[5] ^= 1; t3.d = M.b64(db);
    await throws(() => M.open(t3, r.msgId, "bob", B.sk), /could not/, "flipped bit fails");
    const t4 = JSON.parse(JSON.stringify(r.env)); t4.k.bob = t4.k.alice;
    await throws(() => M.open(t4, r.msgId, "bob", B.sk), /could not/, "swapped key slot fails");

    /* multi-recipient + thread fields */
    const r2 = await M.seal({ from: "bob", to: ["carol", "alice", "alice"].filter((v, i, a) => a.indexOf(v) === i), pubs, payload: { s: "Re: Hi there", b: "reply", th: r.msgId, re: r.msgId } });
    ok(r2.env.to.join() === "alice,carol" && Object.keys(r2.env.k).length === 3, "two recipients + sender");
    const pc = await M.open(r2.env, r2.msgId, "carol", C.sk);
    ok(pc.th === r.msgId && pc.re === r.msgId, "thread fields survive");
    await throws(() => M.seal({ from: "alice", to: ["dave"], pubs, payload: { b: "x" } }), /no MES Mail key/, "unknown key");
    await throws(() => M.seal({ from: "alice", to: [], pubs, payload: { b: "x" } }), /recipient/, "no recipients");
    await throws(() => M.seal({ from: "alice", to: ["bob"], pubs, payload: { b: "  " } }), /Write/, "empty message");
    const pz = await M.open((await M.seal({ from: "alice", to: ["bob"], pubs, payload: { s: "x", b: "y", th: "ZZ", re: "<script>" } })).env, null, "bob", B.sk).catch(() => null);
    ok(pz === null, "open with null id fails");
    const r3 = await M.seal({ from: "alice", to: ["bob"], pubs, payload: { s: "a\u0000b\nc", b: "y", th: "ZZ", re: "<script>" } });
    const p3 = await M.open(r3.env, r3.msgId, "bob", B.sk);
    ok(p3.s === "a b c" && p3.th === r3.msgId && !p3.re, "payload cleaned");

    /* split / pieces / assemble from history entries */
    const big = await M.seal({ from: "alice", to: ["bob", "carol"], pubs, payload: { s: "big", b: nodeCrypto.randomBytes(9000).toString("hex") } });
    const pieces = M.split(big.env, big.msgId);
    ok(pieces.length >= 3 && pieces.every(p => JSON.stringify(p).length < 8192), "pieces fit custom_json (" + pieces.length + ")");
    ok(M.batches(pieces).every(b => b.length <= 5), "batches of 5");
    let idx = 100;
    const hist = (acc, piece, ts) => [idx++, { trx_id: "t" + idx, block: 1, timestamp: ts || "2026-11-17T10:00:00", op: M.customOp(acc, piece) }];
    const H = pieces.slice().reverse().map(p => hist("alice", p));
    const got = M.assemble(H.map(M.pieceOf));
    const key = "alice/" + big.msgId;
    ok(got[key] && JSON.stringify(got[key].env) === JSON.stringify(big.env), "assemble out of order");
    ok((await M.open(got[key].env, big.msgId, "carol", C.sk)).s === "big", "carol reads the assembled big one");
    ok(!M.assemble(H.slice(1).map(M.pieceOf))[key], "missing piece = not complete");
    const forged = pieces.map(p => hist("mallory", p));
    ok(Object.keys(M.assemble(forged.map(M.pieceOf))).length === 0, "copy signed by someone else is rejected (f != signer)");
    ok(M.pieceOf([1, { op: ["custom_json", { id: "other", required_posting_auths: ["a"], required_auths: [], json: "{}" }] }]) === null, "other id ignored");
    ok(M.pieceOf([1, { op: ["custom_json", { id: "mes_mail", required_posting_auths: ["a", "b"], required_auths: [], json: JSON.stringify(pieces[0]) }] }]) === null, "two signers ignored");
    await throws(() => M.split({ d: "x".repeat(M.PIECE * M.MAX_PIECES + 10) }, "a".repeat(16)), /too long/, "too long");

    /* transfers: notices + classic memos */
    const ops = M.noticeOps("alice", ["bob", "alice", "carol"], big.msgId, "HBD");
    ok(ops.length === 2 && ops[0][1].amount === "0.001 HBD" && M.NOTICE_RE.test(ops[0][1].memo), "notice ops skip self");
    const o2 = M.noticeOps("alice", ["bob"], big.msgId, "HIVE", "0,5");
    ok(o2[0][1].amount === "0.500 HIVE" && M.noticeOps("a", ["b"], big.msgId, "HBD", 0)[0][1].amount === "0.001 HBD" && M.noticeOps("a", ["b"], big.msgId, "HBD", "x")[0][1].amount === "0.001 HBD", "amount: chosen, floored at 0.001");
    ok(M.cleanAmount(99999) === 1000 && M.parseAmount("0.010 HBD").n === 0.01 && M.parseAmount("junk") === null, "amount parse / cap");
    ok(M.lowPaid("0.001 HBD", { mode: "hide", min: 0.01 }) && !M.lowPaid("0.010 HBD", { mode: "hide", min: 0.01 }) && !M.lowPaid("0.001 HBD", { mode: "off", min: 1 }) && !M.lowPaid(null, { mode: "hide", min: 1 }), "lowPaid filter");
    const n = M.transferOf([5, { timestamp: "2026-11-17T10:00:03", trx_id: "x", op: ops[0] }]);
    ok(n && n.msgId === big.msgId && n.from === "alice" && n.to === "bob", "notice parsed");
    const cl = M.transferOf([6, { timestamp: "t", trx_id: "y", op: ["transfer", { from: "bob", to: "alice", amount: "0.001 HBD", memo: "#" + "Z".repeat(60) }] }]);
    ok(cl && cl.classic, "classic memo parsed");
    ok(M.transferOf([7, { op: ["transfer", { from: "a", to: "b", amount: "1.000 HIVE", memo: "thanks" }] }]) === null, "plain transfer ignored");

    /* chain scanning with a fake node */
    const chain = { alice: [], bob: [] };
    let gidx = 0;
    function push(acc, op, ts) { const e = [chain[acc].length, { trx_id: "tx" + (++gidx), block: gidx, timestamp: ts, op }]; chain[acc].push(e); }
    for (let i = 0; i < 1500; i++) push("alice", ["custom_json", { id: "noise", required_posting_auths: ["alice"], required_auths: [], json: "{}" }], "2026-11-17T09:00:00");
    pieces.forEach(p => push("alice", M.customOp("alice", p), "2026-11-17T10:00:00"));
    ops.forEach(o => { push("alice", o, "2026-11-17T10:00:03"); push(o[1].to === "bob" ? "bob" : "alice", o, "2026-11-17T10:00:03"); });
    for (let i = 0; i < 1200; i++) push("alice", ["custom_json", { id: "noise", required_posting_auths: ["alice"], required_auths: [], json: "{}" }], "2026-11-17T11:00:00");
    let calls = 0;
    const call = async (method, [acc, start, lim]) => {
        calls++;
        const h = chain[acc] || [];
        const end = start < 0 ? h.length - 1 : Math.min(start, h.length - 1);
        return h.slice(Math.max(0, end - lim + 1), end + 1);
    };
    const mine = await M.scanMine(call, "bob", {});
    ok(mine.notices.length === 1 && mine.notices[0].msgId === big.msgId && mine.top === 0, "bob sees the notice");
    const again = await M.scanMine(call, "bob", { top: mine.top });
    ok(again.notices.length === 0, "cached top skips old ops");
    const fetched = await M.fetchFrom(call, "alice", [big.msgId], mine.notices[0].t);
    ok(fetched[key] && (await M.open(fetched[key].env, big.msgId, "bob", B.sk)).s === "big", "fetchFrom finds it in the sender's history");
    const am = await M.scanMine(call, "alice", {});
    ok(Object.keys(M.assemble(am.pieces)).length === 1, "alice's Sent from her own history");

    /* threads */
    const msgs = [
        { key: "a/1", from: "alice", to: ["bob"], msgId: "1".repeat(16), t: "2026-11-17T10:00:00", payload: { s: "Plan", th: "1".repeat(16) } },
        { key: "b/2", from: "bob", to: ["alice"], msgId: "2".repeat(16), t: "2026-11-17T11:00:00", payload: { s: "Re: Plan", th: "1".repeat(16) } },
        { key: "c/3", from: "carol", to: ["bob"], msgId: "3".repeat(16), t: "2026-11-17T09:00:00", payload: { s: "Other", th: "3".repeat(16) } }
    ];
    const th = M.threads(msgs, "bob");
    ok(th.length === 2 && th[0].msgs.length === 2 && th[0].subject === "Plan" && th[0].inbox && th[0].sent, "threads grouped, newest first");
    ok(th[0].people.join() === "alice" && th[1].people.join() === "carol", "thread people");
    ok(M.replySubject("Plan") === "Re: Plan" && M.replySubject("re: Plan") === "re: Plan", "reply subject");
    ok(M.replyAll({ from: "alice", to: ["bob", "carol"] }, "bob").join() === "alice,carol", "reply all");
    ok(/@alice wrote:\n> a\n> b$/.test(M.quote("a\nb", "alice", "2026-11-17T10:00:00")), "quote");
    const est = M.estimate(["bob"], "alice", "hello", "hi");
    ok(est.pieces === 1 && est.txs === 1, "estimate small");

    console.log(pass + " passed, " + fail + " failed");
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
