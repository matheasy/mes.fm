/* node tool_apps_src/spin-half-tests.js -- checks the Spin-1/2 Lab maths (quaternions, the belt / plate trick families, the 720 degree sign, the sheet, the torus) */
const H = require("./spin-half/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }
function qnear(a, b, tol, m) { ok(a.every((x, i) => Math.abs(x - b[i]) <= tol), m + " (got [" + a.map(x => x.toFixed(6)) + "], want [" + b + "])"); }
function vnear(a, b, tol, m) { qnear(a, b, tol, m); }
const D = Math.PI / 180, I = [1, 0, 0, 0], NEG = [-1, 0, 0, 0];
const AX = { z: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0], tilt: H.norm([1, 1, 1]) };

/* --- quaternion algebra --- */
qnear(H.qmul([0, 1, 0, 0], [0, 0, 1, 0]), [0, 0, 0, 1], 1e-15, "i j = k");
qnear(H.qmul([0, 0, 1, 0], [0, 1, 0, 0]), [0, 0, 0, -1], 1e-15, "j i = -k");
qnear(H.qmul([0, 0, 0, 1], [0, 0, 0, 1]), NEG, 1e-15, "k k = -1");
qnear(H.qmul(H.qmul([0, 1, 0, 0], [0, 0, 1, 0]), [0, 0, 0, 1]), NEG, 1e-15, "i j k = -1");
vnear(H.qrot(H.qaxis([0, 0, 1], 90 * D), [1, 0, 0]), [0, 1, 0], 1e-12, "90 deg about z takes x to y");
vnear(H.qrot(H.qaxis([1, 0, 0], 90 * D), [0, 1, 0]), [0, 0, 1], 1e-12, "90 deg about x takes y to z");
qnear(H.qaxis([0, 0, 1], 2 * Math.PI), NEG, 1e-12, "a 360 deg turn is q = -1");
qnear(H.qaxis([0.3, -0.5, 0.8], 4 * Math.PI), I, 1e-12, "a 720 deg turn about any axis is q = +1");
qnear(H.qaxis([0, 0, 1], 180 * D), [0, 0, 0, 1], 1e-12, "180 deg about z is q = k");
{ /* the matrix of q and -q is the same: SO(3) cannot see the sign */
	const q = H.qaxis(H.norm([1, 2, 3]), 1.234), m1 = H.qToMat(q), m2 = H.qToMat(q.map(x => -x));
	near(H.matDist(m1, m2), 0, 1e-15, "q and -q give the same rotation matrix");
	const back = H.matToQ(m1); near(Math.abs(H.qdot(back, q)), 1, 1e-12, "matrix -> quaternion recovers +-q");
	for (const v of [[1, 0, 0], [0, 1, 0], [0.2, -0.7, 0.4]]) { const M = m1, w = [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]]; vnear(w, H.qrot(q, v), 1e-12, "matrix and quaternion rotate the same"); }
}
{ /* composition: q1 q2 = do q2 then q1 */
	const q1 = H.qaxis([0, 0, 1], 0.7), q2 = H.qaxis([1, 0, 0], -1.1), v = [0.3, 0.4, 0.5];
	vnear(H.qrot(H.qmul(q1, q2), v), H.qrot(q1, H.qrot(q2, v)), 1e-12, "q1 q2 rotates by q2 first");
	/* two half turns about axes at angle a = a turn by 2a about their cross product */
	const a = 0.6, n = [0, 0, 1], m = [Math.sin(a), 0, Math.cos(a)], c = H.qmul(H.qaxis(m, Math.PI), H.qaxis(n, Math.PI));
	near(2 * Math.acos(Math.abs(c[0])), 2 * a, 1e-12, "two half turns at angle a make a turn by 2a");
}
for (const k of Object.keys(AX)) { const n = AX[k], p = H.perp(n); near(H.dot(n, p), 0, 1e-12, "perp is perpendicular (" + k + ")"); near(H.len(p), 1, 1e-12, "perp is a unit vector (" + k + ")"); }

/* --- the belt trick families --- */
for (const k of Object.keys(AX)) {
	const n = AX[k], p = H.perp(n);
	for (const thd of [0, 90, 200, 360, 540, 720]) {
		const th = thd * D;
		for (const mode of ["twist", "anti"]) {
			const st = { mode, th };
			qnear(H.belt(1, st, n, p), I, 1e-12, mode + " " + thd + " deg (" + k + "): the wall shell is not turned");
			const core = H.belt(0, st, n, p), want = H.qaxis(n, th);
			near(Math.abs(H.qdot(core, want)), 1, 1e-12, mode + " " + thd + " deg (" + k + "): the ball shell turns with the ball");
			qnear(core, want, 1e-12, mode + " " + thd + " deg (" + k + "): the lifted ball quaternion is cos(th/2) + sin(th/2) n");
			ok(H.maxJump(st, n, 400) < 0.08, mode + " " + thd + " deg (" + k + "): neighbouring shells differ by a small turn (continuous)");
		}
	}
	/* the untangling path at 720: ball held still the whole time, wall fixed, ends with every shell home */
	for (const s of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
		const st = { mode: "untangle", s };
		qnear(H.belt(1, st, n, p), I, 1e-12, "untangle s=" + s + " (" + k + "): wall fixed");
		qnear(H.belt(0, st, n, p), I, 1e-12, "untangle s=" + s + " (" + k + "): the ball does not turn");
		ok(H.maxJump(st, n, 400) < 0.05, "untangle s=" + s + " (" + k + "): continuous along the ribbon");
	}
	for (const r of [0, 0.13, 0.5, 0.77, 1]) {
		near(H.qangle(H.belt(r, { mode: "untangle", s: 0 }, n, p), H.belt(r, { mode: "twist", th: 4 * Math.PI }, n, p)), 0, 1e-9, "untangling starts from the 720 deg twist (r=" + r + ", " + k + ")");
		near(H.qangle(H.belt(r, { mode: "untangle", s: 1 }, n, p), I), 0, 1e-9, "untangling ends with every shell home (r=" + r + ", " + k + ")");
		near(H.qangle(H.belt(r, { mode: "anti", th: 4 * Math.PI }, n, p), I), 0, 1e-9, "the never-tangle motion is home again after 720 deg (r=" + r + ", " + k + ")");
	}
	/* continuity in the deformation parameter, too */
	for (let s = 0; s < 1; s += 0.05) for (const r of [0.2, 0.5, 0.8]) ok(H.qangle(H.belt(r, { mode: "untangle", s }, n, p), H.belt(r, { mode: "untangle", s: s + 0.01 }, n, p)) < 0.1, "untangle moves smoothly in s");
	/* the half attempt at 360 deg must turn the ball */
	let worst = 0; for (let s = 0; s <= 1.0001; s += 0.05) worst = Math.max(worst, H.qangle(H.belt(0, { mode: "untangle", s, half: true }, n, p), H.qaxis(n, 2 * Math.PI)));
	ok(worst > 3, "undoing the 360 deg twist the same way swings the ball through " + (worst / D).toFixed(0) + " deg (" + k + ")");
}

/* --- the invariant: lift the shells from the wall (q = +1) to the ball --- */
for (const k of Object.keys(AX)) {
	const n = AX[k];
	qnear(H.liftBall({ mode: "twist", th: 2 * Math.PI }, n), NEG, 1e-9, "after 360 deg the lifted ball is q = -1 (" + k + ")");
	qnear(H.liftBall({ mode: "twist", th: 4 * Math.PI }, n), I, 1e-9, "after 720 deg the lifted ball is q = +1 (" + k + ")");
	qnear(H.liftBall({ mode: "anti", th: 2 * Math.PI }, n), NEG, 1e-9, "never-tangle motion at 360: q = -1 (" + k + ")");
	qnear(H.liftBall({ mode: "anti", th: 3 * Math.PI }, n), H.qaxis(n, 3 * Math.PI), 1e-9, "never-tangle at 540 lifts to cos 270 + sin 270 n (" + k + ")");
	for (const s of [0, 0.3, 0.6, 1]) qnear(H.liftBall({ mode: "untangle", s }, n), I, 1e-9, "the class stays +1 all the way through the untangling, s=" + s);
}
/* a shell chain lifted from rotation matrices keeps track of the sign that the matrices forget */
{ const mats = []; for (let i = 0; i <= 100; i++) mats.push(H.qToMat(H.qaxis([0, 0, 1], 2 * Math.PI * i / 100))); const L = H.liftChain(mats); qnear(L[100], NEG, 1e-9, "lifting one full turn ends on -1"); }
/* turning stored along the ribbons */
near(H.turnsStored({ mode: "twist", th: 2 * Math.PI }, [0, 0, 1]), 1, 1e-9, "a 360 deg twist stores one turn");
near(H.turnsStored({ mode: "twist", th: 4 * Math.PI }, [0, 0, 1]), 2, 1e-9, "a 720 deg twist stores two turns");
near(H.turnsStored({ mode: "untangle", s: 1 }, [0, 0, 1]), 0, 1e-5, "untangled: nothing stored");
near(H.turnsStored({ mode: "anti", th: 2 * Math.PI }, [0, 0, 1]), 1, 1e-6, "never-tangle at 360: one full turn swings round the ribbons");
near(H.turnsStored({ mode: "anti", th: 4 * Math.PI }, [0, 0, 1]), 0, 1e-6, "never-tangle at 720: nothing");

/* --- ribbons --- */
for (const c of [1, 2, 4, 6, 30]) { const d = H.ribbonDirs(c); ok(d.length === c, c + " ribbon directions"); ok(d.every(v => Math.abs(H.len(v) - 1) < 1e-12), "ribbon directions are unit vectors (" + c + ")"); }
{ const f = H.fib(30); let s = [0, 0, 0]; f.forEach(v => { s = H.cross([0, 0, 0], v); }); let cx = 0, cy = 0, cz = 0; f.forEach(v => { cx += v[0]; cy += v[1]; cz += v[2]; }); ok(Math.hypot(cx, cy, cz) < 0.5, "the sheet of 30 ribbons is spread round the ball"); }
{ const st = { mode: "twist", th: 4 * Math.PI }, n = [0, 0, 1], pts = H.strand([1, 0, 0], st, n, { rBall: 1, rWall: 4, steps: 40 });
	vnear(pts[40].c, [4, 0, 0], 1e-9, "a strand is anchored on the wall"); near(H.len(pts[0].c), 1, 1e-12, "a strand starts on the ball surface");
	ok(pts.every(p => Math.abs(H.dot(H.norm(p.c), p.w)) < 1e-9), "the ribbon's width stays across the strand"); }

/* --- the 2:1 story --- */
near(H.compare(2 * Math.PI).core, 1, 1e-12, "core at 360: back to start"); near(H.compare(2 * Math.PI).medium, -1, 1e-12, "medium at 360: upside down");
ok(H.compare(4 * Math.PI).same, "at 720 both are home"); ok(!H.compare(2 * Math.PI).same, "at 360 the medium is not home");
vnear(H.mobiusNormal(2 * Math.PI), H.mobiusNormal(0).map(x => -x), 1e-12, "Mobius band: one lap flips the across direction");
vnear(H.mobiusNormal(4 * Math.PI), H.mobiusNormal(0), 1e-12, "Mobius band: two laps bring it back");
{ const P = H.mobius(1.3, 0, 3, 1), Q = H.mobius(1.3, 0, 3, 0.5); vnear(P, Q, 1e-12, "the band's centre line does not depend on its width"); }
near(H.beadArrow(0.4, 2 * Math.PI) - H.beadArrow(0.4, 0), Math.PI, 1e-12, "a bead arrow turns half a turn per ring turn");

/* --- the elastic sheet --- */
for (const kind of ["smooth", "inv2", "linear"]) {
	near(H.profile(0.5, 1, 5, kind), 1, 1e-12, kind + ": the core turns fully"); near(H.profile(5, 1, 5, kind), 0, 1e-12, kind + ": the edge is fixed");
	let mono = true, prev = 1; for (let r = 1; r <= 5; r += 0.05) { const f = H.profile(r, 1, 5, kind); if (f > prev + 1e-12) mono = false; prev = f; } ok(mono, kind + ": the twist falls off outwards");
	const n = [1, 0, 0], p = [0, 0, 1];
	near(H.sheetFlatness(0, n, 1, 5, kind, false, 30, p), 0, 1e-12, kind + ": flat at the start");
	ok(H.sheetFlatness(2 * Math.PI, n, 1, 5, kind, false, 30, p) > 0.2, kind + ": NOT flat after 360 deg");
	near(H.sheetFlatness(4 * Math.PI, n, 1, 5, kind, false, 30, p), 0, 1e-9, kind + ": flat again after 720 deg");
	ok(H.sheetFlatness(4 * Math.PI, n, 1, 5, kind, true, 30, p) > 0.2, kind + ": the naive twist is NOT flat after 720 deg");
	const P = [1.7, 2.2, 0]; for (const th of [0.5, 2, 5]) near(H.len(H.deform(P, th, n, 1, 5, kind, false, p)), H.len(P), 1e-12, "deforming keeps each point's distance from the core");
	vnear(H.deform([3, 4.5, 0], 2.5, n, 1, 5, kind, false, p), [3, 4.5, 0], 1e-12, kind + ": points outside the influence radius stay put");
}

/* --- torus --- */
{ const W = H.WINDINGS.half; near(H.torusPathV(4 * Math.PI, W), 2 * Math.PI, 1e-12, "spin 1/2: one tube turn per two core turns"); ok(H.closesAfter(W) === 2, "spin 1/2 line closes after 2 turns");
	near(H.torusPathV(2 * Math.PI, W), Math.PI, 1e-12, "spin 1/2: after one core turn the tube is half way round");
	for (const k of Object.keys(H.WINDINGS)) { const w = H.WINDINGS[k];
		/* the colour phase is single-valued on the torus (whole-number windings), and constant along the marked line */
		const a = H.torusPhase(1.1, 0.4, w), b = H.torusPhase(1.1 + 2 * Math.PI, 0.4, w), c = H.torusPhase(1.1, 0.4 + 2 * Math.PI, w);
		near(Math.cos(a - b), 1, 1e-12, k + ": colour matches after going round the big circle"); near(Math.cos(a - c), 1, 1e-12, k + ": colour matches after going round the tube");
		near(H.torusPhase(2.3, H.torusPathV(2.3, w), w), H.torusPhase(0, 0, w), 1e-12, k + ": the marked line has one colour"); }
	const P = H.torus(0, 0, 3, 1); vnear(P, [4, 0, 0], 1e-12, "torus outer equator point"); }

/* --- formatting --- */
ok(H.qText([-1, 0, 0, 0], 2) === "−1.00 + 0.00i + 0.00j + 0.00k", "q text for -1: " + H.qText([-1, 0, 0, 0], 2));
near(H.wrap720(-30), 690, 1e-12, "wrap720");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
