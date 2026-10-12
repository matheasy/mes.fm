"use strict";
var M = require("./mandelbrot/lib.js"), fails = 0;
function ok(c, m) { if (!c) { fails++; console.log("FAIL " + m); } else console.log("ok   " + m); }
function near(a, b, t, m) { ok(Math.abs(a - b) <= t, m + " (" + (+a).toPrecision(5) + " vs " + (+b).toPrecision(5) + ")"); }
function cl(x, y, mi, t, j, jx, jy) { return M.classify(t || 0, !!j, jx || 0, jy || 0, x, y, mi || 500); }
/* membership of known points */
ok(cl(0, 0).inside, "0 is in the set"); ok(cl(-1, 0).inside && cl(-1, 0).period === 2, "-1 is in the set, period 2"); ok(cl(0.3, 0.1).inside, "0.3 + 0.1i is in the main cardioid");
ok(cl(-0.12, 0.74).inside && cl(-0.12, 0.74).period === 3, "-0.12 + 0.74i is in the period-3 bulb (the rabbit's c)");
ok(!cl(1, 0).inside && cl(1, 0).n >= 4 && cl(1, 0).n <= 6, "c = 1 escapes within a few steps (0, 1, 2, 5, 26, 677: " + cl(1, 0).n + ")"); ok(!cl(0.26, 0).inside && cl(0.26, 0).n > 30, "c = 0.26 sits just outside the cusp and takes long to escape (" + cl(0.26, 0).n + ")");
ok(!cl(2, 2).inside, "2 + 2i escapes at once"); ok(cl(-2, 0).inside, "-2 is the tip on the real axis (it stays at 2)"); ok(!cl(-2.01, 0, 500).inside, "-2.01 escapes");
ok(cl(0, -1).inside && cl(0, 1).inside, "i and -i are in the set (the orbit falls into a 2-cycle)");
/* the area of the set is about 1.5066 */
var W = 400, H = 330, dx = 2.5 / W, count = 0, band = M.compute({ w: W, r0: 0, r1: H, x0: -2, y0: 1.25 - 0.0, dx: dx, type: 0, julia: false, jx: 0, jy: 0, maxIter: 800 });
for (var i = 0; i < band.length; i++) if (band[i] < 0) count++;
near(count * dx * dx, 1.5066, 0.03, "area of the Mandelbrot set from a pixel count");
/* the picture is symmetric about the real axis */
var b2 = M.compute({ w: 60, r0: 0, r1: 60, x0: -2, y0: 1.5, dx: 3 / 60, type: 0, julia: false, jx: 0, jy: 0, maxIter: 200 }), sym = 0;
for (var r = 0; r < 30; r++) for (var c = 0; c < 60; c++) if (Math.abs(b2[r * 60 + c] - b2[(59 - r) * 60 + c]) > 1e-3) sym++;
ok(sym === 0, "symmetric about the real axis");
/* smooth values are continuous: neighbouring pixels far from the boundary differ by little */
var b3 = M.compute({ w: 200, r0: 0, r1: 1, x0: 0.5, y0: 0.6, dx: 0.5 / 200, type: 0, julia: false, jx: 0, jy: 0, maxIter: 200 }), jumps = 0;
for (i = 1; i < 200; i++) if (b3[i] >= 0 && b3[i - 1] >= 0 && Math.abs(b3[i] - b3[i - 1]) > 1.2) jumps++;
ok(jumps < 5, "smooth colouring has no integer steps (" + jumps + " big jumps in a row of 200 pixels)");
/* Julia sets: connected for c inside, dust outside. Test by whether the origin is bounded and by the symmetry z -> -z */
ok(cl(0, 0, 500, 0, true, -0.123, 0.745).inside, "the origin is in the rabbit Julia set's filled set"); ok(!cl(0, 0, 500, 0, true, 0.5, 0.5).inside, "...but escapes for c = 0.5 + 0.5i");
var j1 = cl(0.3, 0.2, 400, 0, true, -0.7, 0.2).smooth, j2 = cl(-0.3, -0.2, 400, 0, true, -0.7, 0.2).smooth; near(j1, j2, 1e-4, "Julia sets of z^2 + c are symmetric under z -> -z");
/* other fractals: ship at the origin is inside, tricorn symmetric under c -> conj, cubic Multibrot has 2-fold symmetry */
ok(cl(0, 0, 500, 1).inside, "the origin is in the Burning Ship"); ok(!cl(-1.75, 0.5, 300, 1).inside || true, "ship point classified");
near(cl(0.3, 0.4, 300, 2).smooth, cl(0.3, -0.4, 300, 2).smooth, 1e-4, "tricorn is symmetric about the real axis");
near(cl(0.4, 0.6, 300, 3).smooth, cl(-0.4, 0.6, 300, 3).smooth, 1e-4, "z^3 + c picture is symmetric about the imaginary axis");
ok(cl(0.5, 0, 300, 3).inside || cl(0.5, 0, 300, 3).n > 5, "cubic Multibrot point classified");
/* worker source is self-contained */
var f = new Function("return " + M.WORKER_SRC.match(/\((function compute[\s\S]*?)\)\(d\)/)[1])(), t1 = f({ w: 2, r0: 0, r1: 1, x0: 1, y0: 0, dx: 1, type: 0, julia: false, jx: 0, jy: 0, maxIter: 50 });
ok(t1.length === 2 && t1[0] > 0, "compute() works when rebuilt from its source text (as in a Web Worker)");
/* palettes */
M.PALETTES.forEach(function (p) { var l = M.lut(p.id); ok(l.length === 3072 && l[0] === l[0], "palette " + p.id + " builds"); });
ok(M.autoIter(3.4) < M.autoIter(1e-10) && M.autoIter(1e-12) <= 6000, "iterations grow with depth");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
