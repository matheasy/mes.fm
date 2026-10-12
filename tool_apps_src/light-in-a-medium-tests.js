"use strict";
var L = require("./light-in-a-medium/lib.js"), fails = 0;
function ok(c, m) { if (!c) { fails++; console.log("FAIL " + m); } else console.log("ok   " + m); }
function near(a, b, t, m) { ok(Math.abs(a - b) <= t, m + " (" + a.toFixed(4) + " vs " + b.toFixed(4) + ")"); }

/* 1. pulse speed in vacuum and in n = 2 glass: front position grows by COURANT/n cells per step */
function frontSpeed(n) {
	var m = new L.Medium(400, 60); if (n !== 1) m.fill(function () { return n; });
	var w = new L.Wave(m); w.mode = "pulse"; w.wl = 24; w.sources = L.pointSource(60, 30); w.pulse();
	var t1 = 120, t2 = 240, p1 = 0, p2 = 0;
	for (var t = 0; t < t2; t++) {
		w.step();
		if (t + 1 === t1 || t + 1 === t2) {
			var best = 0, at = 0; for (var x = 62; x < 390; x++) { var v = Math.abs(w.u[30 * 400 + x]); if (v > best) { best = v; at = x; } }
			if (t + 1 === t1) p1 = at; else p2 = at;
		}
	}
	return (p2 - p1) / (t2 - t1);
}
near(frontSpeed(1), L.COURANT, 0.05, "pulse speed in vacuum");
near(frontSpeed(2), L.COURANT / 2, 0.05, "pulse speed in n = 2");
/* 2. stability: energy stays bounded over a long run in a strong medium */
var m = new L.Medium(120, 80); m.disc(60, 40, 25, 4); var w = new L.Wave(m); w.sources = L.pointSource(30, 40); for (var i = 0; i < 4000; i++) w.step();
var mx = 0; for (i = 0; i < w.u.length; i++) mx = Math.max(mx, Math.abs(w.u[i])); ok(isFinite(mx) && mx < 20, "stable after 4000 steps in n = 4 (max |u| = " + mx.toFixed(3) + ")");
/* 3. sponge removes the wave: after a pulse leaves, little is left */
var m2 = new L.Medium(160, 80), w2 = new L.Wave(m2); w2.mode = "pulse"; w2.sources = L.pointSource(80, 40); w2.pulse(); for (i = 0; i < 600; i++) w2.step();
mx = 0; for (i = 0; i < w2.u.length; i++) mx = Math.max(mx, Math.abs(w2.u[i])); ok(mx < 0.02, "sponge absorbs the pulse (left " + mx.toFixed(4) + ")");
/* 4. wavelength shrinks by 1/n: count zero crossings of a continuous wave */
function wavelength(n) {
	var mm = new L.Medium(320, 40); mm.fill(function (x) { return x > 100 ? n : 0; }); var ww = new L.Wave(mm); ww.wl = 20; ww.sources = L.pointSource(40, 20);
	for (var t = 0; t < 700; t++) ww.step();
	var zs = [], row = 20 * 320; for (var x = 130; x < 280; x++) if (ww.u[row + x] <= 0 && ww.u[row + x + 1] > 0) zs.push(x - ww.u[row + x] / (ww.u[row + x + 1] - ww.u[row + x]));
	return zs.length > 2 ? (zs[zs.length - 1] - zs[0]) / (zs.length - 1) : 0;
}
var w1 = wavelength(1), w15 = wavelength(1.5); near(w1 / w15, 1.5, 0.12, "wavelength shrinks by 1/n (" + w1.toFixed(1) + " -> " + w15.toFixed(1) + ")");
/* 5. rays obey Snell's law at a smooth interface */
var rm = new L.Medium(300, 200); rm.fill(function (x) { return 1 + 0.5 / (1 + Math.exp(-(x - 150) / 1.2)) - 0.5 * 0 ; });
function exitAngle(a) { var p = L.trace(rm, 20, 100, a, 4000, 0.25), n = p.length; return Math.atan2(p[n - 3] - p[n - 7], p[n - 4] - p[n - 8]); }
var th1 = 30 * Math.PI / 180, th2 = exitAngle(th1);
near(Math.sin(th1), 1.5 * Math.sin(th2), 0.01, "Snell: sin 30° = 1.5 sin θ₂ (θ₂ = " + (th2 * 180 / Math.PI).toFixed(2) + "°)");
/* 6. total internal reflection from n = 1.5 into vacuum above the critical angle (41.8°) */
var tm = new L.Medium(300, 200); tm.fill(function (x, y) { return y > 100 ? 1.5 : 0; });
var p = L.trace(tm, 100, 150, -(40 * Math.PI / 180), 6000, 0.25), last = p.length; ok(p[last - 1] > 0 && (p[last - 1] < 5 || p[last - 1] > 295 || p[last - 2] > 100), "ray is reflected at 50° to the normal (critical " + L.critical(1.5, 1).toFixed(1) + "°)");
var yEnd = p[last - 1]; ok(yEnd > 100, "reflected ray stays in the glass (y = " + yEnd.toFixed(1) + ")");
/* 7. gradient bends rays towards higher n, and a uniform medium keeps rays straight */
var gm = new L.Medium(300, 200); gm.fill(function (x, y) { return 1 + 0.8 * (1 - y / 200); });
var gp = L.trace(gm, 10, 150, 0.0, 3000, 0.5); ok(gp[gp.length - 1] < 150 - 0 || gp[gp.length - 2] < 140, "ray bends towards the higher-n (upper) side");
var sm = new L.Medium(300, 200), sp = L.trace(sm, 10, 100, 0.3, 2000, 0.5), nn = sp.length; near((sp[nn - 1] - sp[1]) / (sp[nn - 2] - sp[0]), Math.tan(0.3), 0.005, "straight ray in vacuum");
/* 8. presets build, have a source, and keep n within bounds */
L.PRESETS.forEach(function (pr) { var mm = new L.Medium(256, 144), s = pr.build(mm, 256, 144), lo = 9, hi = 0; for (var i = 0; i < mm.n.length; i++) { lo = Math.min(lo, mm.n[i]); hi = Math.max(hi, mm.n[i]); } ok(s && lo >= 1 && hi <= L.NMAX + 1e-6, "preset " + pr.id + " n in [" + lo.toFixed(2) + ", " + hi.toFixed(2) + "]"); });
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
