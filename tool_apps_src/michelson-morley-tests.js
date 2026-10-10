/* node tool_apps_src/michelson-morley-tests.js -- arm times, fringe shift, contraction cancellation, fit, inverses, parsing, history */
const M = require("./michelson-morley-experiment/lib.js");
let fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); }
function near(a, b, rel, msg) { ok(Math.abs(a - b) <= rel * Math.abs(b), msg + " (" + a + " vs " + b + ")"); }
const C = M.C;

// 1. textbook arm times
{
	const L = 11, v = 0.3 * C, b2 = 0.09;
	near(M.armTime(L, v, 0, false), (2 * L / C) / (1 - b2), 1e-12, "parallel arm: 2L/c / (1 - b^2)");
	near(M.armTime(L, v, Math.PI / 2, false), (2 * L / C) / Math.sqrt(1 - b2), 1e-12, "transverse arm: 2L/c / sqrt(1 - b^2)");
	near(M.armTime(L, 0, 0.7, false), 2 * L / C, 1e-12, "no wind: 2L/c in any direction");
	near(M.armTime(L, v, Math.PI, false), M.armTime(L, v, 0, false), 1e-12, "pointing the other way gives the same round trip");
}
// 2. contraction cancels the effect exactly, at any angle and any speed
{
	for (const f of [1e-4, 0.01, 0.3, 0.9]) for (const th of [0, 0.4, 1.1, Math.PI / 2, 2.5]) {
		const t = M.armTime(5, f * C, th, true);
		near(t, (2 * 5 / C) / Math.sqrt(1 - f * f), 1e-12, "Lorentz-FitzGerald: arm time independent of angle (beta " + f + ", " + th.toFixed(2) + " rad)");
	}
	ok(M.fringePos("lorentz", 11, 5.7e-7, 3e4, 0.3, 1) === 0 || Math.abs(M.fringePos("lorentz", 11, 5.7e-7, 3e4, 0.3, 1)) < 1e-9, "contraction model: zero fringe position");
	ok(M.fringePos("sr", 11, 5.7e-7, 3e4, 0.3, 1) === 0 && M.fringePos("emission", 11, 5.7e-7, 3e4, 0.3, 1) === 0, "relativity and emission: zero");
}
// 3. the famous number: 1887, 11 m, 30 km/s, ~570 nm  ->  N ~ 0.4
{
	near(M.shift90(11, 5.7e-7, 3e4), 0.386, 0.01, "1887 expectation: about 0.4 fringe");
	near(M.shift90Exact(11, 5.7e-7, 3e4), M.shift90(11, 5.7e-7, 3e4), 1e-6, "exact shift matches the small-beta formula at 30 km/s");
	near(M.shift90(1.2, 5.9e-7, 3e4), 0.0407, 0.02, "1881 expectation: about 0.04 fringe");
	near(M.shift90(32, 5.7e-7, 3e4), 1.12, 0.02, "32 m path: about 1.1 fringes");
	// peak-to-peak over a full turn = 2 * amplitude = N
	let lo = 1e9, hi = -1e9;
	for (let d = 0; d < 360; d += 0.5) { const f = M.fringePos("aether", 11, 5.7e-7, 3e4, d * Math.PI / 180, 1); lo = Math.min(lo, f); hi = Math.max(hi, f); }
	near(hi - lo, M.shift90(11, 5.7e-7, 3e4), 0.01, "peak-to-peak over a full turn equals N");
	near(M.amplitude(11, 5.7e-7, 3e4), M.shift90(11, 5.7e-7, 3e4) / 2, 1e-12, "amplitude = N / 2");
	// pattern repeats every 180 degrees and flips sign after 90
	near(M.fringePos("aether", 11, 5.7e-7, 3e4, 0.5, 1), M.fringePos("aether", 11, 5.7e-7, 3e4, 0.5 + Math.PI, 1), 1e-6, "fringe position repeats every 180 degrees");
	near(M.fringePos("aether", 11, 5.7e-7, 3e4, 0.5, 1), -M.fringePos("aether", 11, 5.7e-7, 3e4, 0.5 + Math.PI / 2, 1), 1e-6, "turning 90 degrees reverses the sign");
	ok(M.shift90(11, 5.7e-7, 0) === 0, "no wind, no shift");
}
// 4. dragged aether
{
	const full = M.shift90Exact(11, 5.7e-7, 3e4);
	const half = Math.abs(M.fringePos("aether", 11, 5.7e-7, 3e4, 0, 0.5) - M.fringePos("aether", 11, 5.7e-7, 3e4, Math.PI / 2, 0.5));
	near(half, full / 4, 0.01, "feeling half the wind gives a quarter of the shift (v squared)");
	ok(M.fringePos("aether", 11, 5.7e-7, 3e4, 0.4, 0) === 0, "fully dragged: zero");
}
// 5. inverses
{
	const N = M.shift90(11, 5.7e-7, 12345);
	near(M.speedFromShift(N, 11, 5.7e-7), 12345, 1e-9, "speed from shift inverts the shift");
	near(M.lengthForShift(N, 5.7e-7, 12345), 11, 1e-9, "length from shift inverts the shift");
	// 0.01 fringe at 30 km/s in green light
	near(M.lengthForShift(0.01, 5.5e-7, 3e4), 0.2750, 0.02, "0.01 fringe at 30 km/s needs about 0.28 m of arm");
	near(M.speedFromShift(0.01, 11, 5.7e-7) / 1e3, 4.83, 0.02, "1887: a 0.01-fringe limit means about 4.8 km/s");
	const d = M.armDifference(11, 3e4); near(d.dpath, 11 * 1e-8 * 1.0, 0.01, "path difference ~ L beta^2 (11 m: 110 nm)");
}
// 6. simulated run + fit recovers the wind
{
	const base = { model: "aether", L: 11, lambda: 5.7e-7, v: 3e4, felt: 1, n: 16, turns: 6, sigma: 0.005, windAz: 0.6, seed: 7 };
	const pts = M.simulateRun(base), f = M.fit2theta(pts, 11, 5.7e-7);
	near(f.v, 3e4, 0.1, "fit recovers 30 km/s from a noisy 16-point run");
	near(f.azimuth, 0.6, 0.1, "fit recovers the wind azimuth");
	const nul = M.simulateRun(Object.assign({}, base, { model: "sr" })), g = M.fit2theta(nul, 11, 5.7e-7);
	ok(g.v < 1.2e4, "a null model with 0.005 noise fits to a small speed (" + (g.v / 1e3).toFixed(2) + " km/s)");
	const clean = M.fit2theta(M.simulateRun(Object.assign({}, base, { sigma: 0 })), 11, 5.7e-7);
	near(clean.v, 3e4, 1e-6, "noise-free fit is exact");
	ok(M.simulateRun(base)[3].y === M.simulateRun(base)[3].y && JSON.stringify(M.simulateRun(base)) === JSON.stringify(pts), "same seed, same run");
}
// 7. history + parsing + formatting
{
	ok(M.HISTORY.length === 5, "five historical experiments");
	near(M.shift90(M.HISTORY[1].L, M.HISTORY[1].lambda, 29780), 0.38, 0.05, "history table: 1887 at the Earth's orbital speed");
	near(M.parseLength("11 m"), 11, 1e-12, "parse 11 m"); near(M.parseLength("550 nm"), 5.5e-7, 1e-12, "parse 550 nm"); near(M.parseLength("2 ft"), 0.6096, 1e-12, "parse 2 ft"); ok(isNaN(M.parseLength("abc")), "parse junk");
	near(M.parseSpeed("30 km/s"), 3e4, 1e-12, "parse 30 km/s"); near(M.parseSpeed("0.001 c"), 299792.458, 1e-12, "parse 0.001 c"); near(M.parseSpeed("30"), 3e4, 1e-12, "bare speed is km/s");
	ok(M.fmtSig(1234.5, 3) === "1,234" || M.fmtSig(1234.5, 3) === "1,235", "fmtSig thousands: " + M.fmtSig(1234.5, 3));
	ok(M.fmtSig(0.0000123, 3).indexOf("×") > 0, "fmtSig small uses powers of ten");
	ok(M.fmtLen(0.5) === "50 cm" && M.fmtTime(3.7e-16).indexOf("as") > 0 || M.fmtTime(3.7e-16).indexOf("fs") > 0, "fmtLen / fmtTime: " + M.fmtLen(0.5) + ", " + M.fmtTime(3.7e-16));
}
console.log("\n" + (n - fails) + "/" + n + " passed");
process.exit(fails ? 1 : 0);
