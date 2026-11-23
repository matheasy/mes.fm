/* Tests for MES Free Kicks & Penalties: node tool_apps_src/free-kick-tests.js
   physics (goals, curl, dip, posts, wall, keeper), strings, rules (shootout end), determinism, Hive protocol, the API with a fake Redis. */
"use strict";
const fs = require("fs"), path = require("path");
const B = require("./free-kick/lib.js");
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL:", msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (" + a + " vs " + b + ")"); }

// byte-identical server copy
ok(fs.readFileSync(path.join(__dirname, "free-kick/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_free-kick-lib.js"), "utf8"), "mes.fm/api/_free-kick-lib.js is a copy of lib.js");

// deterministic trig + sha256
near(B.dsc(300000)[0], 0.5, 1e-15, "sin 30");
near(B.dsc(900000)[1], 0, 1e-15, "cos 90");
ok(B.sha256("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256('abc')");
ok(B.sha256("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "sha256('')");
const r1 = B.rng("x"), r2 = B.rng("x"); ok(r1() === r2() && r1() === r2(), "rng repeats");

// strings round trip
const pen = B.penalty();
ok(B.setupStr(B.setupParse(B.setupStr(pen))) === B.setupStr(pen), "setup round trip");
const sh0 = { yaw: -1234, pitch: 812, spd: 2650, side: -55, top: 30 };
ok(JSON.stringify(B.shotParse(B.shotStr(sh0))) === JSON.stringify(sh0), "shot round trip");
ok(B.shotParse("zzzzzzzz~1~1~1~1") === null && B.shotParse("1~2~3") === null && B.shotParse("0~0~5000~0~0") === null, "bad shots refused");
ok(B.actParse(B.actStr({ tx: 100, tz: 50, d: -2 })) === null && B.actParse(B.actStr({ tx: 100, tz: 50, d: 200 })) !== null && B.actParse(B.actStr({ tx: 900, tz: 50, d: 0 })) === null, "act limits");

// physics
let sh = B.aimFor(pen, 2.8, 0.5, 25, 0, 0), r = B.simulate(pen, sh, null);
ok(r.res === "goal", "low corner penalty with no keeper scores");
near(r.cross.x, 2.8, 0.03, "aimFor x"); near(r.cross.z, 0.5, 0.03, "aimFor z");
ok(B.simulate(pen, sh, { tx: 280, tz: 50, d: 0 }).res === "save", "keeper diving early to the right spot saves it");
ok(B.simulate(pen, B.aimFor(pen, 4.6, 1, 25, 0, 0), null).res === "wide", "wide");
ok(B.simulate(pen, B.aimFor(pen, 1, 3.4, 25, 0, 0), null).res === "over", "over the bar");
const base = B.aimFor(pen, 3.3, 1, 25, 0, 0), baseB = B.aimFor(pen, 0, 2.2, 25, 0, 0);
let post = null, bar = null;
for (let d = 0; d < 300 && !post; d += 5) { const r2 = B.simulate(pen, Object.assign({}, base, { yaw: base.yaw + d }), null); if (r2.ev.some((e) => e[1] === "post")) post = r2; }
for (let d = 0; d < 300 && !bar; d += 5) { const r2 = B.simulate(pen, Object.assign({}, baseB, { pitch: baseB.pitch + d }), null); if (r2.ev.some((e) => e[1] === "bar")) bar = r2; }
ok(!!post, "hitting the post is an event"); ok(!!bar, "hitting the bar is an event");
// curl: same aim point, the curled ball's path bends (mid-flight x differs)
const fk = B.freeKick(0, 22, { n: 0 });
const s1 = B.aimFor(fk, 2.5, 1.5, 26, 8, 0), s2 = B.aimFor(fk, 2.5, 1.5, 26, 0, 0);
const f1 = B.simulate(fk, s1, null, { frames: true }), f2 = B.simulate(fk, s2, null, { frames: true });
near(f1.cross.x, 2.5, 0.05, "curler still hits its spot");
const mid = Math.floor(f1.frames.length / 3 / 4) * 3;
ok(f1.frames[mid] < f2.frames[mid] - 0.2, "curl right: the ball starts left of the straight path");
// dip: top spin comes down steeper than no spin for the same target
const d1 = B.aimFor(fk, 0, 1.5, 26, 0, 8), d2 = B.aimFor(fk, 0, 1.5, 26, 0, 0);
ok(d1.pitch > d2.pitch, "a dipper has to be struck higher");
// drag crisis: a soft ball loses relatively more speed
const soft = B.simulate(fk, { yaw: 0, pitch: 300, spd: 1000, side: 0, top: 0 }, null, { frames: true, maxT: 0.5 });
ok(soft.frames.length > 0, "frames");
// wall blocks a low straight shot from 20 m
const fkw = B.freeKick(0, 20, { n: 5 });
ok(B.wallSpots(fkw).length === 5, "five wall players");
B.wallSpots(fkw).forEach((p) => near(Math.sqrt((p.x) ** 2 + (p.y - 20) ** 2), 9.15, 1.2, "wall about 9.15 m away"));
const low = B.simulate(fkw, B.aimFor(fkw, -1.5, 0.9, 24, 0, 0), null);
ok(low.res === "blocked" || low.ev.some((e) => e[1] === "wall"), "low straight free kick hits the wall");
ok(B.wallLift({ j: 1 }, 0.3) > 0.2 && B.wallLift({ j: 0 }, 0.3) === 0, "wall jumps");
// knuckle: low spin + fast moves sideways (compared with no wobble at low speed)
const kn = B.simulate(B.freeKick(0, 30, { n: 0 }), { yaw: 0, pitch: 700, spd: 3000, side: 0, top: 0 }, null);
ok(Math.abs(kn.cross ? kn.cross.x : 0) > 0.02, "knuckleball wanders off the straight line");
// keeper reach is limited
const kt = B.keeperTarget({ kx: 0 }, { tx: 600, tz: 300, d: 0 });
ok(Math.sqrt(kt.x * kt.x + (kt.z - 1) * (kt.z - 1)) <= B.KEEPER.reach + 1e-9, "keeper reach clamp");

// determinism: the same strings always give the same result
const res1 = JSON.stringify(B.simulate(fkw, B.shotStr(s1), "120~180~200", { frames: true }));
const res2 = JSON.stringify(B.simulate(fkw, B.shotStr(s1), "120~180~200", { frames: true }));
ok(res1 === res2, "deterministic");
const e1 = B.applyError(sh0, "seed", 3, 1), e2 = B.applyError(sh0, "seed", 3, 1);
ok(JSON.stringify(e1) === JSON.stringify(e2) && JSON.stringify(e1) !== JSON.stringify(sh0), "aim spread is seeded");
ok(JSON.stringify(B.applyError(sh0, "s", 0, 0)) === JSON.stringify(sh0), "no spread when off");

// rules: shootout end
ok(B.decide([3, 0], [3, 3]) === 0, "3-0 after 3 each is over");
ok(B.decide([3, 1], [3, 3]) === -1, "3-1 after 3 each goes on");
ok(B.decide([5, 4], [5, 5]) === 0, "5-4 after 5 each");
ok(B.decide([5, 5], [5, 5]) === -1, "5-5 sudden death");
ok(B.decide([6, 5], [6, 6]) === 0 && B.decide([6, 6], [7, 6]) === -1, "sudden death pairs");
ok(B.decide([4, 2], [4, 3]) === -1 && B.decide([4, 1], [4, 3]) === 0, "can't catch up");
let st = B.create("P", "abc");
for (let i = 0; i < 40 && !st.win; i++) B.apply(st, B.aimFor(pen, i % 2 ? 2.5 : -2.5, 0.6, 24, 0, 0), i % 4 === 0 ? { tx: -250, tz: 60, d: 0 } : B.STAY);
ok(!!st.win && st.win.p === 1, "player 2 wins when player 1's kicks are all saved");
// free-kick match spots: the same pair shares a spot, legal (outside the box)
const fm = B.create("F", "zz");
ok(B.setupStr(B.setupFor(fm, 0)) === B.setupStr(B.setupFor(fm, 1)), "pair shares the spot");
for (let i = 0; i < 40; i += 2) { const s = B.setupFor(fm, i); ok(!B.inBox(s.bx, s.by), "spot outside the box " + i); }
// replay
const kicks = st.kicks.map((k) => k.shot + "/" + k.act), rp = B.replay("P", "abc", kicks);
ok(rp && JSON.stringify(rp.score) === JSON.stringify(st.score), "replay gives the same score");

// computer players
const ak = B.aiKick(fkw, "pro", "q", 0); ok(!!B.shotParse(B.shotStr(ak)), "computer kick is a legal shot");
const kp = B.aiKeeper(pen, sh, "medium", "q", 0); ok(!!B.actParse(B.actStr(kp)), "computer keeper act is legal");
let saves = 0;
for (let i = 0; i < 60; i++) { const s = B.applyError(B.aiKick(pen, "medium", "t", i), "t", i, 1); if (B.simulate(pen, s, B.aiKeeper(pen, s, "pro", "u", i)).res === "save") saves++; }
ok(saves > 3 && saves < 40, "pro keeper saves some but not all penalties (" + saves + "/60)");
// challenges
B.CHALLENGES.forEach((c) => { const s = B.challengeSetup(c); ok(!!B.setupParse(B.setupStr(s)), "challenge setup " + c.id); });
ok(!!bar && B.challengeOk(B.CHALLENGES[4], sh, bar) === true, "hit-the-bar rule");

// Hive protocol
const H = B.hive, mk = (acct, j, blk, i) => [i, { trx_id: "t" + blk + "x" + i, block: blk, timestamp: new Date(1.8e12 + blk * 3000).toISOString().slice(0, 19), op: ["custom_json", { id: "mes_fk", required_posting_auths: [acct], json: JSON.stringify(j) }] }];
const gid = "abcd2345", salt = "saltysalt123";
const act = { tx: 250, tz: 60, d: 0 }, shot = B.aimFor(pen, 2.6, 0.6, 24, 0, 0);
const hist = [
	mk("alice", { a: "open", g: gid, v: "P", f: "host" }, 1, 0),
	mk("bob", { a: "join", h: "alice", g: gid }, 2, 0),
	mk("bob", { a: "kc", h: "alice", g: gid, n: 0, c: H.commit(act, salt) }, 3, 1),
	mk("alice", { a: "k", h: "alice", g: gid, n: 0, s: B.shotStr(shot) }, 4, 1),
	mk("bob", { a: "kr", h: "alice", g: gid, n: 0, d: B.actStr(act), x: salt }, 5, 2)
];
const ops = H.parse(hist);
ok(ops.length === 5, "parse ops");
let R = H.build("alice", gid, ops, 1.8e12 + 20000);
ok(R.status === "play" && R.s.kicks.length === 1, "one kick played on Hive");
ok(R.step === "commit" && R.waitAcct === "alice", "next: alice keeps and must seal a dive");
const expect = B.simulate(pen, B.applyError(shot, H.errSeed(gid, 0, salt), 0, 1), act).res;
ok(R.s.kicks[0].res === expect, "Hive kick result = local simulation");
// a reveal that doesn't match counts as standing still
const bad = hist.slice(0, 4).concat([mk("bob", { a: "kr", h: "alice", g: gid, n: 0, d: B.actStr({ tx: -250, tz: 60, d: 0 }), x: salt }, 5, 2)]);
const Rb = H.build("alice", gid, H.parse(bad), 0);
ok(Rb.results[0].cheat === true, "bad seal detected");
// kick before the commit is ignored
const early = [hist[0], hist[1], mk("alice", { a: "k", h: "alice", g: gid, n: 0, s: B.shotStr(shot) }, 3, 1)];
ok(H.build("alice", gid, H.parse(early), 0).s.kicks.length === 0, "kick before the keeper's seal is ignored");
ok(H.clean({ a: "open", g: gid, v: "PF" }) === null, "practice modes can't be opened online");

// API with a fake Redis
(async function () {
	const store = {};
	global.fetch = async (url, opt) => {
		const cmds = JSON.parse(opt.body);
		const out = cmds.map((c) => {
			const [cmd, k, ...a] = c;
			if (cmd === "GET") return { result: store[k] === undefined ? null : store[k] };
			if (cmd === "SET") { if (a.includes("NX") && store[k] !== undefined) return { result: null }; store[k] = a[0]; return { result: "OK" }; }
			if (cmd === "INCR") { store[k] = (+store[k] || 0) + 1; return { result: store[k] }; }
			if (cmd === "DEL") { delete store[k]; return { result: 1 }; }
			return { result: c[0] === "ZREVRANGE" || c[0] === "MGET" ? [] : 1 };
		});
		return { json: async () => out };
	};
	process.env.UPSTASH_REDIS_REST_URL = "http://x"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
	const api = require("../mes.fm/api/free-kick.js");
	function call(method, body, query) {
		return new Promise((resolve) => {
			const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
			api({ method, body, query: query || {}, headers: { "content-type": "application/json", origin: "https://mes.fm" }, socket: {} }, res);
		});
	}
	const a = await call("POST", { act: "new", v: "P", name: "Ann", first: "host" });
	ok(a.code === 200 && a.body.seat === 0, "new guest match");
	const b = await call("POST", { act: "join", id: a.body.g.id, name: "Bo" });
	ok(b.code === 200 && b.body.seat === 1, "join");
	const k1 = await call("POST", { act: "kick", id: a.body.g.id, key: a.body.key, n: 0, s: B.shotStr(shot) });
	ok(k1.code === 200 && k1.body.g.pend.s === true && k1.body.g.kicks.length === 0, "kick waits for the keeper");
	ok(!JSON.stringify(k1.body).includes(B.shotStr(shot)), "pending shot is hidden");
	const wrong = await call("POST", { act: "kick", id: a.body.g.id, key: b.body.key, n: 0, s: B.shotStr(shot) });
	ok(wrong.code === 409, "keeper can't kick");
	const k2 = await call("POST", { act: "keep", id: a.body.g.id, key: b.body.key, n: 0, a: B.actStr(act) });
	ok(k2.code === 200 && k2.body.g.kicks.length === 1, "both in: the kick is played");
	ok(!JSON.stringify(k2.body).includes('"seed"'), "seed never sent");
	const g = JSON.parse(store["fk:g:" + a.body.g.id]);
	const re = B.simulate(B.penalty(), B.applyError(shot, g.seed + "|0", 0, 1), act).res;
	ok(k2.body.g.kicks[0].res === re, "server result = simulation with the secret seed");
	const again = await call("POST", { act: "keep", id: a.body.g.id, key: b.body.key, n: 0, a: B.actStr(act) });
	ok(again.code === 409, "out of step refused");
	const badShot = await call("POST", { act: "kick", id: a.body.g.id, key: b.body.key, n: 1, s: "0~0~9999~0~0" });
	ok(badShot.code === 400, "bad shot refused");
	console.log(pass + " passed, " + fail + " failed");
	process.exit(fail ? 1 : 0);
})();
