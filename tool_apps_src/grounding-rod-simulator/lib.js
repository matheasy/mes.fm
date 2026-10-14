/* MES Grounding & Ground Rod Simulator -- pure maths (browser global MESGnd; node: require('./tool_apps_src/grounding-rod-simulator/lib.js')).
 * Rod resistance: Dwight/Sunde  R = rho/(2 pi L) (ln(4L/a) - 1)   (a = rod radius, L = length in the soil, uniform soil).
 * Several rods: self + mutual (Sunde series) resistance matrix solved for equal potential. Lightning: point-source potential rho I/(2 pi r) on the surface.
 * Everything is a textbook approximation for uniform soil and low frequency / DC; real soil is layered and impulse behaviour differs (said on the page). */
(function (root) {
	"use strict";
	var SOILS = [
		{ id: "marsh", name: "Marsh / wet organic soil", rho: 30, range: "10 - 50" },
		{ id: "clay", name: "Clay", rho: 60, range: "20 - 100" },
		{ id: "loam", name: "Loam / garden soil", rho: 100, range: "40 - 250" },
		{ id: "sandmoist", name: "Damp sand", rho: 250, range: "100 - 500" },
		{ id: "gravel", name: "Gravel / stony soil", rho: 1000, range: "300 - 3000" },
		{ id: "sanddry", name: "Dry sand", rho: 2000, range: "1000 - 5000" },
		{ id: "rock", name: "Rock / bedrock", rho: 10000, range: "3000 - 20000+" }
	];
	var DIAS = [{ id: "d12", name: "1/2 in (12.7 mm)", m: 0.0127 }, { id: "d58", name: "5/8 in (15.9 mm)", m: 0.015875 }, { id: "d34", name: "3/4 in (19 mm)", m: 0.019 }, { id: "d16", name: "16 mm", m: 0.016 }, { id: "d20", name: "20 mm", m: 0.02 }];
	var BODY_OHM = 1000;

	function rodR(rho, L, d) { var a = d / 2; return rho / (2 * Math.PI * L) * (Math.log(4 * L / a) - 1); }
	function mutual(rho, L, d, s) {                       // mutual resistance of two identical vertical rods s metres apart
		if (s <= d) return rodR(rho, L, d);
		var k = rho / (2 * Math.PI * L);
		if (s <= L) return k * (Math.log(4 * L / s) - 1 + s / (2 * L) - s * s / (16 * L * L));
		return k * 0.8238 * L / s;                       // beyond one rod length: falls like 1/s (continuous at s = L)
	}
	function solve(A, b) {                                // small Gaussian elimination with partial pivoting
		var n = b.length, M = A.map(function (r, i) { return r.slice().concat([b[i]]); }), i, j, k;
		for (i = 0; i < n; i++) { var p = i; for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j; var t = M[i]; M[i] = M[p]; M[p] = t;
			for (j = i + 1; j < n; j++) { var f = M[j][i] / M[i][i]; for (k = i; k <= n; k++) M[j][k] -= f * M[i][k]; } }
		var x = new Array(n); for (i = n - 1; i >= 0; i--) { var s = M[i][n]; for (j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x;
	}
	function groupR(n, rho, L, d, s) {                    // n rods in a straight line, spacing s, all at one potential
		if (n <= 1) return rodR(rho, L, d);
		var A = [], i, j; for (i = 0; i < n; i++) { A.push([]); for (j = 0; j < n; j++) A[i].push(i === j ? rodR(rho, L, d) : mutual(rho, L, d, Math.abs(i - j) * s)); }
		var I = solve(A, new Array(n).fill(1)), tot = 0; I.forEach(function (x) { tot += x; }); return 1 / tot;
	}
	function rodsNeeded(target, rho, L, d, s, max) {
		max = max || 30; for (var n = 1; n <= max; n++) if (groupR(n, rho, L, d, s) <= target) return n; return null;
	}
	// current-voltage of the rod in a fault / lightning
	function lightningV(rho, I, r) { return rho * I / (2 * Math.PI * Math.max(r, 1e-6)); }
	function stepV(rho, I, r, stride) { return lightningV(rho, I, r) - lightningV(rho, I, r + stride); }
	function hemiRadius(rho, R) { return rho / (2 * Math.PI * R); }      // radius of the hemisphere with the same resistance
	function gpr(I, R) { return I * R; }
	function betweenRods(rho, I, R1, d) {                 // strike current I into rod 1 (resistance R1); an unbonded rod d metres away
		var v1 = I * R1, v2 = lightningV(rho, I, d); return { rod1: v1, rod2: Math.min(v2, v1), between: Math.max(0, v1 - Math.min(v2, v1)) };
	}
	// shock
	function bodyEffect(mA) {
		if (mA < 0.5) return { k: 0, t: "Below the feeling threshold" };
		if (mA < 5) return { k: 1, t: "Tingle / perceptible" };
		if (mA < 10) return { k: 2, t: "Painful, can usually let go" };
		if (mA < 30) return { k: 3, t: "Can't let go, muscles lock" };
		if (mA < 100) return { k: 4, t: "Breathing can stop, fibrillation possible" };
		return { k: 5, t: "Very likely fatal if it lasts" };
	}
	var CURVES = { B: { inst: 5, name: "B (trips at 3-5 x)" }, C: { inst: 10, name: "C (5-10 x)" }, D: { inst: 20, name: "D (10-20 x)" }, std: { inst: 10, name: "US thermal-magnetic (about 10 x)" } };
	function tripTime(I, In, curve) {                    // coarse, labelled approximate on the page
		var m = I / In, c = CURVES[curve] || CURVES.std, lo = curve === "B" ? 3 : curve === "D" ? 10 : curve === "C" ? 5 : 5;
		if (m < 1.13) return { trips: false, t: Infinity, note: "does not trip" };
		if (m >= c.inst) return { trips: true, t: 0.02, note: "instantly, about 10 to 20 ms" };
		if (m >= lo) return { trips: true, t: 0.1 + 0.9 * (c.inst - m) / (c.inst - lo), note: "magnetic trip, 0.1 to 1 s" };
		if (m >= 2) return { trips: true, t: 10 + 50 / (m - 1), note: "slow thermal trip, tens of seconds" };
		return { trips: true, t: 60 * 20 / (m - 1.1), note: "very slow thermal trip, minutes" };
	}
	function faultCases(p) {                              // p: V, In, curve, Rline, Regc, Rsrc (supply side up to the transformer neutral), Rrod, Rsrcg (utility ground), Rfloor, rcdmA
		var out = [], body = BODY_OHM, V = p.V;
		var Z1 = p.Rsrc + p.Rline + p.Regc, I1 = V / Z1, T1 = tripTime(I1, p.In, p.curve);
		out.push({ id: "egc", name: "Proper grounding wire (EGC) back to the panel", I: I1, trip: T1, Vcase: I1 * p.Regc, Ibody: (I1 * p.Regc) / (body + p.Rfloor) * 1000, rcd: null });
		var Z2 = p.Rsrc + p.Rline + p.Rrod + p.Rsrcg, I2 = V / Z2, T2 = tripTime(I2, p.In, p.curve);
		out.push({ id: "rod", name: "Only a ground rod, no ground wire to the panel", I: I2, trip: T2, Vcase: I2 * p.Rrod, Ibody: (I2 * p.Rrod) / (body + p.Rfloor) * 1000, rcd: null });
		var Z3 = p.Rsrc + p.Rline + p.Rsrcg + body + p.Rfloor, I3 = V / Z3, T3 = tripTime(I3, p.In, p.curve);
		out.push({ id: "none", name: "No grounding at all: you complete the circuit", I: I3, trip: T3, Vcase: I3 * (body + p.Rfloor), Ibody: I3 * 1000, rcd: null });
		return out;
	}
	function ttMaxRA(mA, limit) { return (limit || 50) / (mA / 1000); }
	// static electricity
	function staticE(C, V) { return 0.5 * C * V * V; }                 // joules
	function staticTau(R, C) { return R * C; }
	function staticDecay(R, C, V0, V1) { return V0 <= V1 ? 0 : R * C * Math.log(V0 / V1); }

	var API = { SOILS: SOILS, DIAS: DIAS, BODY_OHM: BODY_OHM, CURVES: CURVES, rodR: rodR, mutual: mutual, groupR: groupR, rodsNeeded: rodsNeeded, lightningV: lightningV, stepV: stepV, hemiRadius: hemiRadius, gpr: gpr, betweenRods: betweenRods, bodyEffect: bodyEffect, tripTime: tripTime, faultCases: faultCases, ttMaxRA: ttMaxRA, staticE: staticE, staticTau: staticTau, staticDecay: staticDecay };
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESGnd = API;
})(typeof window !== "undefined" ? window : globalThis);
