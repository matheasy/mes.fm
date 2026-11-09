// node tool_apps_src/billiards-tests.js  -- MES Billiards: physics, rules, determinism, the computer, the Hive protocol and mes.fm/api/billiards.js (fake Redis + fake Hive node)
"use strict";
const fs = require("fs"), path = require("path");
const B = require("./billiards/lib.js");
let f = 0, n = 0;
function ok(c, m) { n++; if (!c) { f++; console.log("FAIL", m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + " :: " + JSON.stringify(a) + " != " + JSON.stringify(b)); }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " :: " + a + " vs " + b); }

// 0. the server copy is byte-identical
eq(fs.readFileSync(path.join(__dirname, "billiards/lib.js"), "utf8") === fs.readFileSync(path.join(__dirname, "../mes.fm/api/_billiards-lib.js"), "utf8"), true, "api/_billiards-lib.js is a copy of lib.js (cp it)");
// the simulation must not use engine-dependent maths
const simSrc = fs.readFileSync(path.join(__dirname, "billiards/lib.js"), "utf8").split("B.simulate = function")[1].split("/* ======================================================= placing")[0];
eq(/Math\.(sin|cos|tan|exp|pow|hypot|atan2|log|cbrt)/.test(simSrc), false, "simulate() uses only + - * / and sqrt");

// 1. deterministic sine / cosine
let worst = 0;
for (let u = 0; u < 3600000; u += 1237) { const sc = B.dsc(u), a = u * Math.PI / 1800000; worst = Math.max(worst, Math.abs(sc[0] - Math.sin(a)), Math.abs(sc[1] - Math.cos(a))); }
ok(worst < 1e-13, "dsc matches sin/cos to 1e-14 (worst " + worst + ")");
eq(B.dsc(0), [0, 1], "dsc(0)"); eq(B.dsc(900000)[1] === 0 || Math.abs(B.dsc(900000)[1]) < 1e-16, true, "cos 90");

// 2. shot strings
const sh = { a: 1234567, p: 750, sx: -40, sy: 33, bx: -6350, by: 1200 };
eq(B.sparse(B.sstr(sh)), sh, "shot round trip");
eq(B.sparse("zzzzzzzz~1~0~0"), null, "angle out of range");
eq(B.sparse("1~0~0~0"), null, "power 0 refused");
eq(B.sparse("1~10~64~64"), null, "spin outside the ball refused");
eq(B.sparse("1~10~0"), null, "too few fields");

// 3. racks
for (const v of ["8", "9", "10", "S15", "S6", "P8", "P9", "PS", "PL"]) {
	const s = B.create(v, "abc"), R = s.T.R;
	let overlap = 0;
	for (let i = 0; i < s.n; i++) for (let j = i + 1; j < s.n; j++) if (Math.hypot(s.x[i] - s.x[j], s.y[i] - s.y[j]) < 2 * R - 1e-6) overlap++;
	eq(overlap, 0, v + ": no balls overlap in the rack");
}
const r8 = B.create("8", "x"); eq(r8.k.slice(1).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "8-ball has 15 balls");
eq(r8.k[5], 8, "the 8 is in the middle of the rack");
eq(B.create("8", "x").x, B.create("8", "x").x, "same seed = same rack");
ok(JSON.stringify(B.create("8", "x").x) !== JSON.stringify(B.create("8", "y").x), "another seed = slightly different rack");
const r9 = B.create("9", "q"); eq(r9.k[1], 1, "9-ball: the 1 at the apex"); eq(r9.k[5], 9, "9-ball: the 9 in the middle");
const sn = B.create("S15", "q"); eq(sn.k.filter((k) => k === 1).length, 15, "15 reds"); eq(B.pointsLeft(sn), 147, "147 on a fresh snooker table");
eq(B.pointsLeft(B.create("S6", "q")), 75, "75 with six reds");

// 4. physics
(function () {
	const s = B.create("C1", "x"), dx = s.x[1] - s.x[0], dy = s.y[1] - s.y[0], a = B.angleOf(dx, dy);
	const c1 = B.clone(s), r1 = B.apply(c1, { a, p: 100, sx: 0, sy: 0 });
	eq(r1.pots, [1], "straight pot goes in");
	const c2 = B.clone(s); B.apply(c2, { a, p: 300, sx: 0, sy: -80 });
	const d0 = Math.hypot(s.x[1] - s.x[0], s.y[1] - s.y[0]), back = Math.hypot(c2.x[0] - s.x[1], c2.y[0] - s.y[1]);
	ok(back > d0 * 0.2 && c2.on[0], "draw brings the cue ball back (" + back.toFixed(2) + " m)");
	const c3 = B.clone(s); const r3 = B.apply(c3, { a, p: 400, sx: 0, sy: 80 });
	eq(r3.cue, true, "follow sends the cue ball in after the object ball");
	// a single ball rolled: stops, energy only lost
	const s4 = B.create("C1", "x"); s4.on[1] = 0;
	const sim = B.simulate(s4, { a: 0, p: 150, sx: 0, sy: 0 }, {});
	ok(sim.steps < 40000, "a lone ball stops"); ok(sim.x[0] !== s4.x[0], "it moved");
	// a ball rolled into a cushion bounces back
	const hitRail = sim.ev.some((e) => e.e === "rail");
	ok(hitRail, "it reached the cushion");
	// right english off a straight cushion comes back to the right of the path (shooter's view: +y when shooting +x)
	const s5 = B.create("C1", "x"); s5.on[1] = 0; s5.x[0] = 0.6; s5.y[0] = 0;
	const e5 = B.simulate(s5, { a: 0, p: 200, sx: 70, sy: 0 }, {}), e6 = B.simulate(s5, { a: 0, p: 200, sx: -70, sy: 0 }, {});
	ok(e5.y[0] > 0.01 && e6.y[0] < -0.01, "side spin throws the cue ball off the cushion (" + e5.y[0].toFixed(3) + ", " + e6.y[0].toFixed(3) + ")");
})();
// random shots never leave balls outside the table and always stop
(function () {
	let seedr = 7; const R = () => { seedr = (seedr * 16807) % 2147483647; return seedr / 2147483647; };
	let bad = 0, stuck = 0, maxSteps = 0;
	for (let k = 0; k < 240; k++) {
		const s = B.create(["S15", "8", "9"][k % 3], "q" + k);
		const sh2 = { a: Math.floor(R() * 3600000), p: 1 + Math.floor(R() * 999), sx: Math.round((R() - 0.5) * 120), sy: Math.round((R() - 0.5) * 120) };
		if (sh2.sx * sh2.sx + sh2.sy * sh2.sy > 10000) sh2.sx = 0;
		s.x[0] = s.zone === "D" ? -1.1 : -0.8; s.y[0] = 0.1;
		const r = B.simulate(s, sh2, {});
		maxSteps = Math.max(maxSteps, r.steps); if (r.steps >= 119999) stuck++;
		for (let i = 0; i < s.n; i++) if (r.on[i] && (Math.abs(r.x[i]) > s.T.L / 2 + s.T.R || Math.abs(r.y[i]) > s.T.W / 2 + s.T.R)) { bad++; console.log("  outside:", k, i, r.x[i], r.y[i]); }
	}
	eq([bad, stuck], [0, 0], "240 random shots: balls stay on the cloth and everything stops (max " + maxSteps + " steps)");
})();

// 5. rules
(function () {
	// 8-ball: missing every ball is a foul -> ball in hand for the other player
	const s = B.create("8", "r"); s.brk = false; s.bih = false; s.x[0] = -0.6; s.y[0] = 0.4;
	const r = B.apply(s, { a: 2700000, p: 30, sx: 0, sy: 0 });
	ok(/no ball was hit/.test(r.foul), "8-ball: no ball hit is a foul"); eq([s.turn, s.bih, s.zone], [1, true, "any"], "ball in hand anywhere for the other player");
	// 9-ball: hitting a higher ball first
	const t = B.create("9", "r"); t.brk = false; t.bih = false;
	const low = t.k.indexOf(1), other = t.k.indexOf(9);
	for (let i = 1; i < t.n; i++) if (i !== low && i !== other) t.on[i] = 0;
	t.x[low] = 0.9; t.y[low] = 0.4; t.x[other] = 0.3; t.y[other] = 0; t.x[0] = -0.3; t.y[0] = 0;
	const r2 = B.apply(t, { a: 0, p: 120, sx: 0, sy: 0 });
	ok(/the 1 had to be hit first/.test(r2.foul), "9-ball: wrong ball first is a foul");
	ok(!t.win, "the 9 potted on a foul does not win");
	// 9-ball combination win
	const u = B.create("9", "r"); u.brk = false; u.bih = false;
	const l1 = u.k.indexOf(1), n9 = u.k.indexOf(9);
	for (let i = 1; i < u.n; i++) if (i !== l1 && i !== n9) u.on[i] = 0;
	const G = B.geometry(u.T), pk = G.pockets[5];   // bottom right corner
	const dir = [pk[0] - 0.7, pk[1] - 0.2], dl = Math.hypot(dir[0], dir[1]), ux = dir[0] / dl, uy = dir[1] / dl, R = u.T.R;
	u.x[n9] = 0.7; u.y[n9] = 0.2; u.x[l1] = 0.7 - ux * 2.05 * R; u.y[l1] = 0.2 - uy * 2.05 * R; u.x[0] = u.x[l1] - ux * 0.4; u.y[0] = u.y[l1] - uy * 0.4;
	B.apply(u, { a: B.angleOf(ux, uy), p: 260, sx: 0, sy: -30 });
	eq(u.win && u.win.p, 0, "9-ball: the 1 into the 9 wins");
	// snooker: pot a red = 1 point, then on a colour
	const sn2 = B.create("S15", "r"); sn2.brk = false; sn2.bih = false;
	for (let i = 1; i < sn2.n; i++) if (sn2.k[i] === 1) sn2.on[i] = 0;
	const red = sn2.k.indexOf(1); sn2.on[red] = 1;
	const P = B.geometry(sn2.T).pockets[2];    // top right corner
	const d2 = [P[0] - 1.2, P[1] + 0.5], l2 = Math.hypot(d2[0], d2[1]), vx = d2[0] / l2, vy = d2[1] / l2;
	sn2.x[red] = 1.2; sn2.y[red] = -0.5; sn2.x[0] = 1.2 - vx * 0.4; sn2.y[0] = -0.5 - vy * 0.4;
	const r4 = B.apply(sn2, { a: B.angleOf(vx, vy), p: 160, sx: 0, sy: 0 });
	eq([r4.pots.length, sn2.score[0], sn2.on2, sn2.turn], [1, 1, "colour", 0], "snooker: red potted = 1 point, now on a colour, same player");
	// snooker foul: hit a colour when on a red
	const sn3 = B.create("S15", "r"); sn3.brk = false; sn3.bih = false; sn3.x[0] = 0.15; sn3.y[0] = 0.0;
	const r5 = B.apply(sn3, { a: 1800000, p: 60, sx: 0, sy: 0 });   // straight at the blue
	ok(/blue was hit first/.test(r5.foul) && sn3.score[1] === 5, "snooker: hitting the blue on a red is a 5-point foul (" + r5.foul + ", " + sn3.score + ")");
	// placing the cue ball
	const p0 = B.create("S15", "x");
	eq(B.placeOk(p0, -1.1, 0.1), true, "inside the D is fine"); eq(B.placeOk(p0, -0.5, 0), false, "outside the D is not");
	eq(B.isLegal(p0, { a: 0, p: 100, sx: 0, sy: 0 }), false, "ball in hand needs a spot");
	eq(B.isLegal(p0, { a: 0, p: 100, sx: 0, sy: 0, bx: -11000, by: 1000 }), true, "spot in the D");
	const k8 = B.create("8", "x"); eq(B.placeOk(k8, 0.2, 0), false, "break: not past the head string");
})();

// 6. determinism + the computer finishes games
(function () {
	for (const [v, lv] of [["8", "hard"], ["9", "medium"], ["S6", "pro"], ["P8", "pro"]]) {
		const s = B.create(v, "z" + v); let k = 0;
		while (!s.win && k < 220) { const shot = B.ai(s, lv); if (!B.apply(s, shot)) { ok(false, v + ": computer made an illegal shot"); break; } k++; }
		ok(!!s.win || v === "P8", v + " " + lv + ": the game ends (" + k + " shots)");
		const back = B.replay(v, "z" + v, s.hist);
		eq(back && B.hash(back), B.hash(s), v + ": replaying the shot strings gives the same table");
		const packed = B.unpack(B.pack(s));
		eq(B.hash(packed), B.hash(s), v + ": pack / unpack keeps the table");
	}
})();

// 7. the aiming guide
(function () {
	const s = B.create("C1", "x"), dx = s.x[1] - s.x[0], dy = s.y[1] - s.y[0], d = Math.hypot(dx, dy);
	const g = B.guide(s, s.x[0], s.y[0], dx / d, dy / d);
	eq(g.kind, "ball", "guide meets the ball"); near(g.t, d - 2 * s.T.R, 1e-9, "contact distance");
	const g2 = B.guide(s, s.x[0], s.y[0], -1, 0); eq(g2.kind, "rail", "guide meets the cushion");
})();

// 8. Hive protocol
(function () {
	const H = B.hive, ops = [];
	let blk = 100;
	const op = (acct, j) => { ops.push({ ...H.clean(j), acct, trx: "t" + ops.length, block: blk++, i: ops.length, ts: 1e12 + ops.length * 4000 }); };
	op("alice", { a: "open", g: "abcdefgh", v: "9", f: "host" });
	op("bob", { a: "join", h: "alice", g: "abcdefgh" });
	let R = H.build("alice", "abcdefgh", ops, 1e12);
	eq([R.status, R.players], ["play", ["alice", "bob"]], "hive: open + join");
	const s = B.create("9", "abcdefgh"); let who = 0;
	for (let i = 0; i < 6 && !s.win; i++) {
		const shot = B.ai(s, "medium"), str = B.sstr(shot), seat = s.turn;
		const n0 = s.hist.length; B.apply(s, shot);
		op(seat === 0 ? "alice" : "bob", { a: "sh", h: "alice", g: "abcdefgh", n: n0, m: str, c: B.hash(s) });
		who++;
	}
	R = H.build("alice", "abcdefgh", ops, 1e12 + 1e5);
	eq(B.hash(R.s), B.hash(s), "hive: the chain replays to the same table"); eq(R.bad, 0, "hive: fingerprints match");
	const R2 = H.build("alice", "abcdefgh", ops, 1e12 + 1e5, { from: R });
	eq([R2.results.length, B.hash(R2.s)], [0, B.hash(s)], "hive: rebuilding from an earlier result simulates nothing again");
	op("carl", { a: "sh", h: "alice", g: "abcdefgh", n: s.hist.length, m: "0~64~0~0" });
	eq(H.build("alice", "abcdefgh", ops, 1e12 + 2e5).s.hist.length, s.hist.length, "hive: shots from a third account are ignored");
	eq(H.clean({ a: "open", g: "abcdefgh", v: "P8" }), null, "hive: practice games can't be opened");
	// self-reported result that replays
	const solo = B.create("C1", "s1"); const dx = solo.x[1] - solo.x[0], dy = solo.y[1] - solo.y[0];
	B.apply(solo, { a: B.angleOf(dx, dy), p: 100, sx: 0, sy: 0 });
	const rec = { a: "rec", g: "recrecre", v: "C1", sd: "s1", m: solo.hist.join("."), o: "local", s: -1, w: 0 };
	const recOps = [{ ...H.clean(rec), acct: "alice", trx: "r1", block: 1, i: 1, ts: 1 }];
	eq(H.records(recOps).length, 1, "hive: a challenge clear replays and counts");
	const fake = [{ ...H.clean({ ...rec, m: "0~64~0~0" }), acct: "alice", trx: "r2", block: 2, i: 2, ts: 2 }];
	eq(H.records(fake).length, 0, "hive: a result that does not replay is dropped");
})();

// 9. the API (fake Redis + fake Hive node)
(async function () {
	process.env.UPSTASH_REDIS_REST_URL = "http://redis.test"; process.env.UPSTASH_REDIS_REST_TOKEN = "t";
	const store = new Map(), zs = new Map();
	const Z = (k) => { if (!zs.has(k)) zs.set(k, new Map()); return zs.get(k); };
	const chain = {};
	global.fetch = async (url, opts) => {
		if (!/redis\.test/.test(url)) { const q = JSON.parse(opts.body); return { json: async () => ({ result: chain[q.params[0]] || [] }) }; }
		const out = JSON.parse(opts.body).map((c) => {
			const [op, k, v] = c;
			if (op === "SET") { if (c.includes("NX") && store.has(k)) return { result: null }; store.set(k, v); return { result: "OK" }; }
			if (op === "GET") return { result: store.has(k) ? store.get(k) : null };
			if (op === "MGET") return { result: c.slice(1).map((x) => (store.has(x) ? store.get(x) : null)) };
			if (op === "DEL") { store.delete(k); return { result: 1 }; }
			if (op === "INCR") { const n2 = (+store.get(k) || 0) + 1; store.set(k, String(n2)); return { result: n2 }; }
			if (op === "ZADD") { Z(k).set(c[3], +v); return { result: 1 }; }
			if (op === "ZREM") { c.slice(2).forEach((x) => Z(k).delete(x)); return { result: 1 }; }
			if (op === "ZREVRANGE") { const e = [...Z(k).entries()].sort((a, b) => b[1] - a[1]).slice(+c[2], +c[3] + 1); return { result: c[4] === "WITHSCORES" ? e.flatMap((x) => [x[0], String(x[1])]) : e.map((x) => x[0]) }; }
			return { result: 1 };
		});
		return { json: async () => out };
	};
	const h = require("../mes.fm/api/billiards.js");
	function mk(method, o) {
		const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
		return { req: Object.assign({ method, query: {}, headers: { "x-forwarded-for": "1.1.1.1", "content-type": "application/json" }, body: null }, o), res };
	}
	async function call(method, o) { const { req, res } = mk(method, o); await h(req, res); return res; }
	const post = (body, ip) => call("POST", { body, headers: { "x-forwarded-for": ip || "1.1.1.1", "content-type": "application/json" } });
	let r = await post({ act: "new", v: "8", name: "Alice<b>", pub: true, first: "host" });
	eq(r.code, 200, "api: new"); const id = r.body.g.id, ka = r.body.key;
	eq([r.body.seat, r.body.g.names[0], r.body.g.tok, r.body.g.st], [0, "Aliceb", undefined, undefined], "api: seat, clean name, no secrets or state in the answer");
	eq((await post({ act: "new", v: "P8", name: "x" })).code, 400, "api: practice games are not online games");
	r = await post({ act: "join", id, name: "Bob" }, "2.2.2.2"); const kb = r.body.key;
	eq([r.code, r.body.seat, r.body.g.status], [200, 1, "play"], "api: join");
	const s = B.create("8", id);
	const brk = B.ai(s, "hard");
	eq((await post({ act: "shot", id, key: kb, n: 0, m: B.sstr(brk) }, "2.2.2.2")).code, 409, "api: not your turn");
	eq((await post({ act: "shot", id, key: ka, n: 0, m: B.sstr({ a: 0, p: 100, sx: 0, sy: 0 }) })).code, 400, "api: the break needs the cue ball placed");
	r = await post({ act: "shot", id, key: ka, n: 0, m: B.sstr(brk) });
	eq(r.code, 200, "api: break accepted");
	B.apply(s, brk);
	eq(r.body.g.shots.length, 1, "api: shot stored");
	const stored = JSON.parse(store.get("bl:g:" + id));
	eq(B.hash(B.unpack(stored.st)), B.hash(s), "api: the server's table equals the browser's");
	eq((await post({ act: "shot", id, key: ka, n: 0, m: B.sstr(brk) })).code, 409, "api: stale shot number refused");
	r = await post({ act: "resign", id, key: kb }, "2.2.2.2");
	eq([r.body.g.status, r.body.g.win.p], ["over", 0], "api: resign");
	r = await post({ act: "rematch", id, key: kb }, "2.2.2.2");
	eq([r.body.g.status, r.body.g.round, r.body.g.names, r.body.g.seed], ["play", 1, ["Bob", "Aliceb"], id + "r1"], "api: rematch swaps seats with a new rack");
	// hive index: open needs the op on the chain
	chain.alice = [[1, { trx_id: "x1", block: 5, timestamp: new Date().toISOString().slice(0, 19), op: ["custom_json", { id: "mes_pool", required_auths: [], required_posting_auths: ["alice"], json: JSON.stringify({ a: "open", g: "abcdefgh", v: "S15", f: "host" }) }] }]];
	eq((await post({ act: "hopen", host: "alice", g: "abcdefgh" })).code, 200, "api: hive open listed");
	r = await call("GET", { query: { hlobby: "1" } });
	eq(r.body.open.map((o) => o.v), ["S15"], "api: hive lobby");
	eq((await post({ act: "hopen", host: "alice", g: "zzzzzzzz" })).code, 404, "api: an op that is not on the chain is refused");
	console.log(f ? f + " of " + n + " checks FAILED" : "all " + n + " checks passed");
	process.exit(f ? 1 : 0);
})();
