// Tests for the MES Quantum Computer Simulator maths: node tool_apps_src/quantum-computing-tests.js
"use strict";
const Q = require("./quantum-computing/lib.js");
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function near(a, b, msg, tol) { ok(Math.abs(a - b) < (tol || 1e-9), msg + " (got " + a + ", want " + b + ")"); }
const PI = Math.PI, S = Math.SQRT1_2;

// ---- gate matrices
Object.keys(Q.GATES).forEach(g => { if (Q.GATES[g].m) ok(Q.isUnitary(Q.matrix(g, 0.73)), g + " is unitary"); });
const H = Q.matrix("H"); near(H[0], S, "H00"); near(H[6], -S, "H11");
const Y = Q.matrix("Y"); near(Y[3], -1, "Y01 = -i"); near(Y[5], 1, "Y10 = i");
const T = Q.matrix("T"); near(T[6], S, "T phase re"); near(T[7], S, "T phase im");
const Rx = Q.matrix("RX", PI); near(Rx[3], -1, "Rx(pi) = -iX"); near(Rx[0], 0, "Rx(pi) diag 0");
const Rz = Q.matrix("RZ", PI / 2); near(Rz[1], -Math.sin(PI / 4), "Rz phase");
// S = T^2, X = SX^2, Z = S^2
function mul(a, b) { const r = []; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { let re = 0, im = 0; for (let k = 0; k < 2; k++) { const ar = a[(i * 2 + k) * 2], ai = a[(i * 2 + k) * 2 + 1], br = b[(k * 2 + j) * 2], bi = b[(k * 2 + j) * 2 + 1]; re += ar * br - ai * bi; im += ar * bi + ai * br; } r.push(re, im); } return r; }
function same(a, b, msg) { ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-12), msg); }
same(mul(T, T), Q.matrix("S"), "T² = S"); same(mul(Q.matrix("S"), Q.matrix("S")), Q.matrix("Z"), "S² = Z");
same(mul(Q.matrix("SX"), Q.matrix("SX")), Q.matrix("X"), "√X² = X"); same(mul(H, H), [1, 0, 0, 0, 0, 0, 1, 0], "H² = I");
same(mul(Q.matrix("S"), Q.matrix("SDG")), [1, 0, 0, 0, 0, 0, 1, 0], "S S† = I");
same(Q.matrix("P", PI / 4), T, "P(pi/4) = T");

// ---- single-qubit states and Bloch vectors
function stateOf(n, ops) { return Q.run(Q.layout(n, ops)).state; }
let b = Q.bloch(stateOf(1, [Q.op("H", 0)]), 0); near(b.x, 1, "|+> x"); near(b.z, 0, "|+> z");
b = Q.bloch(stateOf(1, [Q.op("H", 0), Q.op("S", 0)]), 0); near(b.y, 1, "|+i> y");
b = Q.bloch(stateOf(1, [Q.op("X", 0)]), 0); near(b.z, -1, "|1> z");
b = Q.bloch(stateOf(1, [Q.op("RY", 0, null, 1.2)]), 0); near(b.z, Math.cos(1.2), "Ry z"); near(b.x, Math.sin(1.2), "Ry x");

// ---- Bell / GHZ
let p = Q.probs(Q.run(Q.preset("bell")).state); near(p[0], 0.5, "Bell 00"); near(p[3], 0.5, "Bell 11"); near(p[1] + p[2], 0, "Bell 01/10");
b = Q.bloch(Q.run(Q.preset("bell")).state, 0); near(b.r, 0, "Bell qubit fully entangled");
p = Q.probs(Q.run(Q.preset("ghz")).state); near(p[0], 0.5, "GHZ 000"); near(p[7], 0.5, "GHZ 111");
let sh = Q.shots(Q.preset("bell"), 2000, 3); ok(Object.keys(sh.counts).every(k => k === "00" || k === "11"), "Bell shots only 00 / 11");
ok(Math.abs(sh.counts["00"] - 1000) < 120, "Bell shots about half");
ok(sh.counts["00"] + sh.counts["11"] === 2000, "shots add up");

// ---- norm preservation on random circuits
const names = ["H", "X", "Y", "Z", "S", "SDG", "T", "TDG", "SX", "RX", "RY", "RZ", "P", "SWAP"];
const rnd = Q.rng(99);
for (let t = 0; t < 40; t++) {
	const n = 1 + Math.floor(rnd() * 8), ops = [];
	for (let k = 0; k < 30; k++) {
		const g = names[Math.floor(rnd() * names.length)], perm = [...Array(n).keys()].sort(() => rnd() - 0.5);
		if (g === "SWAP" && n < 2) continue;
		const nt = g === "SWAP" ? 2 : 1, nc = Math.min(n - nt, Math.floor(rnd() * 3));
		ops.push(Q.op(g, perm.slice(0, nt), perm.slice(nt, nt + nc), Q.GATES[g].par ? rnd() * 6 : null));
	}
	const c = Q.layout(n, ops);
	near(Q.norm(Q.run(c).state), 1, "norm random circuit " + t, 1e-10);
	// columns never overlap
	ok(c.cols.every(col => col.every((a, i) => col.every((o, j) => i === j || !Q.overlaps(a, o)))), "layout without overlaps " + t);
	// share link round trip
	const d = Q.decode(Q.encode(c)); ok(Q.encode(d) === Q.encode(c), "encode/decode " + t);
	const s1 = Q.run(c).state, s2 = Q.run(d).state; ok(s1.re.every((v, i) => Math.abs(v - s2.re[i]) < 1e-9 && Math.abs(s1.im[i] - s2.im[i]) < 1e-9), "decoded circuit same state " + t);
	// QASM round trip (no multi-control gates outside qelib1 in this check)
	if (ops.every(o => o.c.length === 0 || (o.c.length === 1 && o.g !== "SX") || (o.c.length === 2 && (o.g === "X" || o.g === "Z")))) {
		const back = Q.fromQASM(Q.toQASM(c)), s3 = Q.run(back).state;
		ok(s1.re.every((v, i) => Math.abs(v - s3.re[i]) < 1e-9 && Math.abs(s1.im[i] - s3.im[i]) < 1e-9), "QASM round trip same state " + t);
	}
}

// ---- QFT against the DFT: QFT|x> = 1/sqrt(N) sum_y e^{2 pi i x y / N} |y>
for (const n of [1, 2, 3, 4, 5]) {
	const N = 1 << n, qs = [...Array(n).keys()];
	for (const x of [0, 1, N - 1, Math.floor(N / 3)]) {
		const pre = qs.filter(q => (x >> q) & 1).map(q => Q.op("X", q));
		const s = stateOf(n, pre.concat(Q.qftOps(qs)));
		let err = 0; for (let y = 0; y < N; y++) { const a = 2 * PI * x * y / N; err = Math.max(err, Math.abs(s.re[y] - Math.cos(a) / Math.sqrt(N)), Math.abs(s.im[y] - Math.sin(a) / Math.sqrt(N))); }
		near(err, 0, "QFT n=" + n + " x=" + x, 1e-10);
		const back = stateOf(n, pre.concat(Q.qftOps(qs), Q.qftOps(qs, true)));
		near(back.re[x], 1, "QFT then inverse QFT n=" + n + " x=" + x, 1e-10);
	}
}

// ---- algorithms
p = Q.probs(Q.run(Q.preset("grover2")).state); near(p[3], 1, "Grover 2 finds |11>");
const m3 = Q.marginal(Q.probs(Q.run(Q.preset("grover3")).state), [0, 1, 2]); near(m3[5], 0.9453125, "Grover 3 finds |101> with 94.5%", 1e-6);
let mg = Q.marginal(Q.probs(Q.run(Q.preset("dj")).state), [0, 1, 2]); near(mg[7], 1, "Deutsch-Jozsa balanced -> 111");
mg = Q.marginal(Q.probs(Q.run(Q.preset("bv")).state), [0, 1, 2]); near(mg[5], 1, "Bernstein-Vazirani -> 101");
p = Q.probs(Q.run(Q.preset("superdense")).state); near(p[3], 1, "superdense coding -> 11");
// teleportation: q2 ends with q0's starting Bloch vector
const tel = Q.preset("teleport"), b0 = Q.bloch(Q.run(tel, { upto: 1 }).state, 0), ref = Q.bloch(stateOf(1, [Q.op("RY", 0, null, 1.1), Q.op("RZ", 0, null, 0.7)]), 0), b2 = Q.bloch(Q.run(tel).state, 2);
near(b2.x, ref.x, "teleport x", 1e-9); near(b2.y, ref.y, "teleport y", 1e-9); near(b2.z, ref.z, "teleport z", 1e-9); near(b2.r, 1, "teleported qubit is pure");
ok(b0.r > 0.99, "q0 pure at start");
// Shor: counting register reads 0, 2, 4, 6 with 1/4 each
mg = Q.marginal(Q.probs(Q.run(Q.preset("shor")).state), [0, 1, 2]);
[0, 2, 4, 6].forEach(y => near(mg[y], 0.25, "Shor y=" + y, 1e-9)); [1, 3, 5, 7].forEach(y => near(mg[y], 0, "Shor y=" + y, 1e-9));
ok(Q.convergents(6 / 8, 15).some(c => c[1] === 4), "continued fraction of 6/8 gives r = 4");
// QFT preset: equal sizes, phase steps of 5 x 45 degrees
const qs = Q.run(Q.preset("qft")).state; for (let y = 0; y < 8; y++) near(qs.re[y] ** 2 + qs.im[y] ** 2, 1 / 8, "QFT preset size " + y);
// every preset fits its qubits and runs
Q.PRESETS.forEach(ps => { const c = Q.preset(ps.id); ok(c.n === ps.n && c.cols.every(col => col.every(o => Q.validOp(o, c.n))), "preset " + ps.id + " valid"); near(Q.norm(Q.run(c).state), 1, "preset norm " + ps.id); });

// ---- measurement
const mid = Q.layout(2, [Q.op("H", 0), Q.op("M", 0), Q.op("X", 1, 0), Q.op("M", 1)]); ok(Q.measureInfo(mid).mid, "mid-circuit measurement detected");
ok(!Q.measureInfo(Q.preset("bell")).mid, "terminal measurement not mid");
sh = Q.shots(mid, 1000, 5); ok(Object.keys(sh.counts).every(k => k === "00" || k === "11"), "mid-circuit shots correlated");
const s = stateOf(1, [Q.op("H", 0)]); const r = Q.measure(s, 0, 0.9); ok(r.v === 0 && Math.abs(r.p1 - 0.5) < 1e-12, "measure picks 0 for r >= p1"); near(Q.norm(s), 1, "renormalised");

// ---- angles and QASM import
near(Q.parseAngle("pi/4"), PI / 4, "pi/4"); near(Q.parseAngle("-3π/4"), -3 * PI / 4, "-3π/4"); near(Q.parseAngle("2pi/3"), 2 * PI / 3, "2pi/3");
near(Q.parseAngle("0.5"), 0.5, "0.5"); near(Q.parseAngle("(pi+pi)/4"), PI / 2, "parens"); near(Q.parseAngle("3*pi/8"), 3 * PI / 8, "3*pi/8");
let threw = false; try { Q.parseAngle("alert(1)"); } catch (e) { threw = true; } ok(threw, "bad angle rejected");
ok(Q.fmtAngle(PI / 4) === "π/4" && Q.fmtAngle(-3 * PI / 4) === "-3π/4" && Q.fmtAngle(0.5) === "0.5", "fmtAngle");
const qa = Q.fromQASM('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\ncreg c[3];\nh q[0];\ncx q[0],q[1];\ncx q[1],q[2];\nbarrier q;\nmeasure q -> c;\n');
ok(qa.n === 3, "QASM qreg"); p = Q.probs(Q.run(qa).state); near(p[0] + p[7], 1, "QASM GHZ");
ok(Q.measureInfo(qa).qs.length === 3, "measure q -> c broadcasts");
const u3 = Q.fromQASM("qreg q[1]; u3(pi/2,0,pi) q[0];"); b = Q.bloch(Q.run(u3).state, 0); near(b.x, 1, "u3(pi/2,0,pi) = H on |0>");
threw = false; try { Q.fromQASM("qreg q[2]; foo q[0];"); } catch (e) { threw = /not supported/.test(e.message); } ok(threw, "unknown gate message");
threw = false; try { Q.fromQASM("qreg q[11];"); } catch (e) { threw = true; } ok(threw, "too many qubits");
ok(/cu1\(pi\/2\) q\[0\],q\[1\]/.test(Q.toQASM(Q.layout(2, [Q.op("S", 1, 0)]))), "controlled S exported as cu1");
threw = false; try { Q.decode("3~H0,X0c1"); } catch (e) { threw = true; } ok(threw, "overlapping gates in a link rejected");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
