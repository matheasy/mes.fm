/* MES Quantum Lab: entanglement (Bell / CHSH test) and Stern-Gerlach chains. Pure maths, no DOM.
   MESQ.ent: angles in RADIANS. Two pair types:
     "ph" photons in (|HH> + |VV>)/sqrt2, polarizer angle from horizontal:  E(a,b) = cos 2(a - b)
     "el" spin-1/2 singlet (|ud> - |du>)/sqrt2, magnet angle from z:          E(a,b) = -cos(a - b)
   Written as E = s cos(k d) with (k, s) = (2, +1) for photons and (1, -1) for the singlet, d = a - b.
   Models: "q" quantum (joint probabilities sampled exactly), and two LOCAL hidden-variable models where each side's answer
   depends only on its own setting and a shared hidden angle lambda:
     "bell"  Bell 1964 deterministic sign model: A = sign cos k(a - lam), B = s sign cos k(b - lam)  ->  E = s (1 - 2|kd|/pi) (linear, the best a local model does at the CHSH angles)
     "malus" shared polarization / spin direction, each side answers at random with Malus's law  ->  E = (s/2) cos(kd)
   MESQ.sg: Stern-Gerlach chains for spin 1/2 or spin 1, all magnets in the x-z plane (theta from +z towards +x), real Wigner d-matrices.
   Node: var Q = require("./lib.js"); require("./lib-ent.js"); */
(function (root) {
	"use strict";
	var Q = root.MESQ || (typeof require !== "undefined" ? require("./lib.js") : {});
	var PI = Math.PI, SQ2 = Math.SQRT2;

	/* ======================= entanglement ======================= */
	function ks(type) { return type === "el" ? { k: 1, s: -1 } : { k: 2, s: 1 }; }
	/* wrap x into (-pi, pi] */
	function wrap(x) { x = ((x + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; return x === -PI ? PI : x; }
	function sgn(x) { return x >= 0 ? 1 : -1; }

	var ent = {};
	ent.MODELS = { q: "Quantum mechanics", bell: "Bell 1964 hidden angle (local)", malus: "Shared polarization + Malus's law (local)" };
	ent.TYPES = { ph: "Photon pairs (polarization)", el: "Electron pairs (spin singlet)" };
	ent.ks = ks; ent.wrap = wrap;
	/* correlation E(a, b) = <A B> for a model */
	ent.E = function (type, model, a, b) {
		var p = ks(type), x = p.k * (a - b);
		if (model === "bell") return p.s * (1 - 2 * Math.abs(wrap(x)) / PI);
		if (model === "malus") return p.s * 0.5 * Math.cos(x);
		return p.s * Math.cos(x);
	};
	/* quantum joint probabilities [P(++), P(+-), P(-+), P(--)]; each side alone is always 1/2 */
	ent.joint = function (type, a, b) {
		var E = ent.E(type, "q", a, b), same = (1 + E) / 4, diff = (1 - E) / 4;
		return [same, diff, diff, same];
	};
	/* one pair: returns [A, B] in {+1, -1}. r = Q.rng(...). For the local models a fresh hidden angle is drawn per pair and
	   A is computed from (a, lam) only, B from (b, lam) only. */
	ent.pair = function (type, model, a, b, r) {
		var p = ks(type), lam, A, B;
		if (model === "bell") {
			lam = r() * 2 * PI;
			A = sgn(Math.cos(p.k * (a - lam))); B = p.s * sgn(Math.cos(p.k * (b - lam)));
			return [A, B];
		}
		if (model === "malus") {
			lam = r() * 2 * PI;
			var pa = 0.5 * (1 + Math.cos(p.k * (a - lam))), pb = 0.5 * (1 + p.s * Math.cos(p.k * (b - lam)));
			A = r() < pa ? 1 : -1; B = r() < pb ? 1 : -1;
			return [A, B];
		}
		var J = ent.joint(type, a, b), u = r();
		if (u < J[0]) return [1, 1];
		if (u < J[0] + J[1]) return [1, -1];
		if (u < J[0] + J[1] + J[2]) return [-1, 1];
		return [-1, -1];
	};
	/* deterministic answer of the Bell model for a given hidden angle (used by the exhaustive test) */
	ent.bellAnswers = function (type, set, lam) {
		var p = ks(type);
		return { A: set.slice(0, 2).map(function (a) { return sgn(Math.cos(p.k * (a - lam))); }),
			B: set.slice(2).map(function (b) { return p.s * sgn(Math.cos(p.k * (b - lam))); }) };
	};
	/* the standard optimal CHSH settings [a, a', b, b'] (radians) for each pair type */
	ent.optimal = function (type) {
		var d = PI / 180;
		return type === "el" ? [0, 90 * d, 45 * d, 135 * d] : [0, 45 * d, 22.5 * d, 67.5 * d];
	};
	/* CHSH combination from four correlations ordered (a,b), (a,b'), (a',b), (a',b') */
	ent.Sof = function (E) { return Math.abs(E[0] - E[1] + E[2] + E[3]); };
	ent.Stheory = function (type, model, set) {
		var a = set[0], ap = set[1], b = set[2], bp = set[3];
		return ent.Sof([ent.E(type, model, a, b), ent.E(type, model, a, bp), ent.E(type, model, ap, b), ent.E(type, model, ap, bp)]);
	};
	ent.TSIRELSON = 2 * SQ2;
	/* counts: cell i (0..3 = ab, ab', a'b, a'b') -> {n, pp, pm, mp, mm}. Returns E per cell, its standard error, S and the error of S */
	ent.newCounts = function () { var c = []; for (var i = 0; i < 4; i++) c.push({ n: 0, pp: 0, pm: 0, mp: 0, mm: 0 }); return c; };
	ent.add = function (cell, A, B) { cell.n++; if (A > 0) { if (B > 0) cell.pp++; else cell.pm++; } else { if (B > 0) cell.mp++; else cell.mm++; } };
	ent.cellE = function (c) { return c.n ? (c.pp + c.mm - c.pm - c.mp) / c.n : NaN; };
	ent.cellErr = function (c) { if (c.n < 2) return NaN; var E = ent.cellE(c); return Math.sqrt(Math.max(1e-12, 1 - E * E) / c.n); };
	ent.stats = function (counts) {
		var E = counts.map(ent.cellE), err = counts.map(ent.cellErr), ok = counts.every(function (c) { return c.n >= 2; });
		var S = ok ? ent.Sof(E) : NaN, dS = ok ? Math.sqrt(err.reduce(function (s, e) { return s + e * e; }, 0)) : NaN;
		return { E: E, err: err, S: S, dS: dS, n: counts.reduce(function (s, c) { return s + c.n; }, 0), sigma: ok && dS > 0 ? (S - 2) / dS : NaN };
	};
	/* run a whole CHSH test of n pairs, settings chosen at random per pair. Returns {counts, marg} where marg[x][y] = [n, A+ , B+] by Alice's / Bob's choice */
	ent.chsh = function (type, model, set, n, r) {
		var counts = ent.newCounts(), marg = { A: [[0, 0], [0, 0]], B: [[0, 0], [0, 0]] };
		for (var i = 0; i < n; i++) {
			var x = r() < 0.5 ? 0 : 1, y = r() < 0.5 ? 0 : 1, ab = ent.pair(type, model, set[x], set[2 + y], r);
			ent.add(counts[x * 2 + y], ab[0], ab[1]);
			marg.A[x][0]++; if (ab[0] > 0) marg.A[x][1]++;
			marg.B[x][0]++; if (ab[1] > 0) marg.B[x][1]++;   // Bob's +1 rate split by ALICE's choice: the no-signalling check
		}
		return { counts: counts, marg: marg };
	};

	/* ======================= Stern-Gerlach ======================= */
	var sg = {};
	/* Wigner small d-matrix d^j(theta) as rows m' = j..-j, columns m = j..-j. Column m = the state "m along theta" written in the z basis. */
	sg.d = function (j2, th) {
		if (j2 === 1) { var c = Math.cos(th / 2), s = Math.sin(th / 2); return [[c, -s], [s, c]]; }
		var C = Math.cos(th), S = Math.sin(th);
		return [[(1 + C) / 2, -S / SQ2, (1 - C) / 2], [S / SQ2, C, -S / SQ2], [(1 - C) / 2, S / SQ2, (1 + C) / 2]];
	};
	sg.dim = function (j2) { return j2 === 1 ? 2 : 3; };
	sg.labels = function (j2) { return j2 === 1 ? ["+½", "−½"] : ["+1", "0", "−1"]; };
	sg.basis = function (j2, th, m) { var D = sg.d(j2, th); return D.map(function (row) { return row[m]; }); };
	function dot(u, v) { var s = 0; for (var i = 0; i < u.length; i++) s += u[i] * v[i]; return s; }
	/* source: "oven" (unpolarized), "z" (prepared m = +j along z), "x" (prepared m = +j along x) */
	sg.sourceRho = function (j2, src) {
		var n = sg.dim(j2), i, k, rho = [];
		for (i = 0; i < n; i++) { rho.push([]); for (k = 0; k < n; k++) rho[i].push(src === "oven" ? (i === k ? 1 / n : 0) : 0); }
		if (src !== "oven") { var v = sg.basis(j2, src === "x" ? PI / 2 : 0, 0); for (i = 0; i < n; i++) for (k = 0; k < n; k++) rho[i][k] = v[i] * v[k]; }
		return rho;
	};
	function proj(rho, v) { var n = v.length, i, k, w = 0; for (i = 0; i < n; i++) for (k = 0; k < n; k++) w += v[i] * rho[i][k] * v[k]; return w; }
	function outer(v, w) { return v.map(function (a) { return v.map(function (b) { return a * b * w; }); }); }
	function addM(A, B) { return A.map(function (r, i) { return r.map(function (x, k) { return x + B[i][k]; }); }); }
	function zeroM(n) { var z = []; for (var i = 0; i < n; i++) { z.push([]); for (var k = 0; k < n; k++) z[i].push(0); } return z; }
	/* spin expectation <S>/j in the x-z plane: {x, z, len}. For spin 1/2 this is the Bloch vector. */
	sg.spinVec = function (j2, rho) {
		var tr = 0, i; for (i = 0; i < rho.length; i++) tr += rho[i][i];
		if (tr <= 0) return { x: 0, z: 0, len: 0 };
		var x, z;
		if (j2 === 1) { z = (rho[0][0] - rho[1][1]) / tr; x = 2 * rho[0][1] / tr; }
		else { z = (rho[0][0] - rho[2][2]) / tr; x = SQ2 * (rho[0][1] + rho[1][2]) / tr; }   // <Sx> = sqrt2 (rho_{1,0} + rho_{0,-1}), divided by j = 1
		return { x: x, z: z, len: Math.sqrt(x * x + z * z) };
	};
	/* pass option of a magnet: an outcome index 0..n-1 (that output goes on, the others are blocked), "coh" (all outputs recombined, nothing recorded)
	   or "peek" (recombined, but a detector notes which path each atom took). The LAST magnet always sends every output to the screen.
	   theory(): per stage {arrive (fraction of the source), p (outcome probabilities given arrival), vec (spin of the arriving beam), amp (amplitudes if pure)}
	   and screen = fraction of all source atoms landing in each final spot. */
	sg.theory = function (j2, src, mags) {
		var n = sg.dim(j2), rho = sg.sourceRho(j2, src), arrive = 1, stages = [], k, m;
		for (k = 0; k < mags.length; k++) {
			var th = mags[k].th, vecs = [], p = [];
			for (m = 0; m < n; m++) { vecs.push(sg.basis(j2, th, m)); p.push(proj(rho, vecs[m])); }
			var tot = p.reduce(function (s, x) { return s + x; }, 0) || 1;
			var vec = sg.spinVec(j2, rho), pure = Math.abs(vec.len - 1) < 1e-9 || (j2 === 2 && isPure(rho)), amp = null;
			if (pure) { var psi = pureVec(rho); amp = vecs.map(function (v) { return dot(v, psi); }); }
			stages.push({ arrive: arrive, p: p.map(function (x) { return x / tot; }), vec: vec, amp: amp });
			if (k === mags.length - 1) break;
			var pass = mags[k].pass;
			if (pass === "coh") { /* unchanged */ }
			else if (pass === "peek") { var r2 = zeroM(n); for (m = 0; m < n; m++) r2 = addM(r2, outer(vecs[m], p[m])); rho = r2; }
			else { m = +pass; arrive *= p[m] / tot; rho = p[m] > 1e-15 ? outer(vecs[m], 1) : zeroM(n); if (p[m] <= 1e-15) arrive = 0; }
			// keep rho normalized (trace 1) so the next stage's probabilities are conditional
			var t = 0; for (m = 0; m < n; m++) t += rho[m][m]; if (t > 0) rho = rho.map(function (r) { return r.map(function (x) { return x / t; }); });
		}
		var last = stages[stages.length - 1], screen = last.p.map(function (x) { return x * last.arrive; });
		return { stages: stages, screen: screen, through: screen.reduce(function (s, x) { return s + x; }, 0), rho: rho };
	};
	function isPure(rho) { var n = rho.length, t2 = 0, t = 0, i, k; for (i = 0; i < n; i++) { t += rho[i][i]; for (k = 0; k < n; k++) t2 += rho[i][k] * rho[k][i]; } return t > 0 && Math.abs(t2 / (t * t) - 1) < 1e-9; }
	function pureVec(rho) {   // rho = v v^T: take the column with the biggest diagonal
		var n = rho.length, b = 0, i; for (i = 1; i < n; i++) if (rho[i][i] > rho[b][b]) b = i;
		var s = Math.sqrt(rho[b][b]) || 1, v = []; for (i = 0; i < n; i++) v.push(rho[i][b] / s); return v;
	}
	/* one atom through the chain. Returns {out: [outcome or "coh" per stage], block: stage index where it was stopped or -1, spot: final outcome or -1} */
	sg.sample = function (j2, src, mags, r) {
		var n = sg.dim(j2), psi, k, m, out = [];
		if (src === "oven") { psi = []; var pick = Math.floor(r() * n); for (m = 0; m < n; m++) psi.push(m === pick ? 1 : 0); }
		else psi = sg.basis(j2, src === "x" ? PI / 2 : 0, 0);
		for (k = 0; k < mags.length; k++) {
			var th = mags[k].th, last = k === mags.length - 1, pass = mags[k].pass;
			if (!last && pass === "coh") { out.push("coh"); continue; }
			var vecs = [], u = r(), acc = 0, pick2 = n - 1;
			for (m = 0; m < n; m++) vecs.push(sg.basis(j2, th, m));
			for (m = 0; m < n; m++) { var a = dot(vecs[m], psi); acc += a * a; if (u < acc) { pick2 = m; break; } }
			out.push(pick2); psi = vecs[pick2];
			if (last) return { out: out, block: -1, spot: pick2 };
			if (pass !== "peek" && +pass !== pick2) return { out: out, block: k, spot: -1 };
		}
		return { out: out, block: -1, spot: -1 };
	};
	/* classical expectation for one magnet: moment pointing in a random 3D direction -> deflection proportional to cos(polar angle), uniform on [-1, 1] */
	sg.classical = function (r) { return 2 * r() - 1; };

	Q.ent = ent; Q.sg = sg;
	if (typeof module !== "undefined" && module.exports) module.exports = Q;
})(typeof window !== "undefined" ? window : globalThis);
