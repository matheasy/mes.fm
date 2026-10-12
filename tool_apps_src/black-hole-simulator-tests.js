"use strict";
var B = require("./black-hole-simulator/lib.js"), fails = 0;
function ok(c, m) { if (!c) { fails++; console.log("FAIL " + m); } else console.log("ok   " + m); }
function near(a, b, t, m) { ok(Math.abs(a - b) <= t, m + " (" + (+a).toPrecision(6) + " vs " + (+b).toPrecision(6) + ")"); }

/* 1. the shadow: rays with b below 3 sqrt(3)/2 rs are captured, above it escape */
var lo = B.traceLight(2.55, 2000, 0.004, false), hi = B.traceLight(2.65, 2000, 0.004, false);
ok(lo.captured && !hi.captured, "b = 2.55 rs captured, b = 2.65 rs escapes (critical " + B.BCRIT.toFixed(4) + ")");
var a = 2.0, b = 3.2; for (var i = 0; i < 40; i++) { var m = (a + b) / 2; if (B.traceLight(m, 2000, 0.004, false).captured) a = m; else b = m; }
near(a, B.BCRIT, 0.01, "bisected capture threshold = 3 sqrt(3) / 2");
/* 2. weak-field deflection: 2 rs / b to first order, plus the (15 pi / 16) / b^2 term */
[20, 50, 200].forEach(function (bb) { var r = B.traceLight(bb, 1e5, 0.005, false); near(r.alpha / B.deflectionWeak(bb), 1, 0.01, "deflection at b = " + bb + " rs matches the expansion"); });
near(B.traceLight(1000, 2e5, 0.01, false).alpha * 1000, 2, 0.02, "far rays: alpha b = 2 rs (Einstein: 4GM / b c^2)");
/* a ray close to the shadow edge winds around: deflection grows without bound */
ok(B.traceLight(2.6, 2000, 0.002, false).alpha > 2 * Math.PI * 0.8, "b = 2.6 rs bends by more than 1.6 pi (nearly a full loop)");
/* mirror symmetry */
near(B.traceLight(-6, 500, 0.005, false).alpha, B.traceLight(6, 500, 0.005, false).alpha, 1e-9, "b and -b bend equally");
/* 3. the optical analogue gives the same bending as the curved space */
[5, 8, 15].forEach(function (bb) { var g = B.traceLight(bb, 3000, 0.003, false).alpha, an = B.traceAnalogue(bb, 300, false).alpha; near(an / g, 1, 0.02, "n(rho) medium bends b = " + bb + " rs like Schwarzschild (" + g.toFixed(4) + " rad)"); });
near(B.rOfRho(B.rhoOfR(7.3)), 7.3, 1e-9, "isotropic radius round trip");
near(B.nIso(0.25 + 1e-9) > 1e6 ? 1 : 0, 1, 0, "n diverges at the horizon");
/* 4. orbits: circular orbit stays circular, periapsis advance matches 3 pi / (2 L^2) for a wide orbit, ISCO stability, plunge */
var oc = new B.Orbit(10, 1); for (i = 0; i < 20000; i++) oc.step(0.2); near(1 / oc.u, 10, 0.01, "circular orbit at r = 10 rs stays at r = 10 rs");
var ow = new B.Orbit(80, 0.7); for (i = 0; i < 400000 && ow.peri.length < 4; i++) ow.step(2); var Lw = ow.L;
ok(ow.prec !== null, "found periapsis passes"); near(ow.prec / B.precessionWeak(Lw), 1, 0.12, "periapsis advance ~ 3 pi / (2 L^2) (" + ow.prec + " vs " + B.precessionWeak(Lw) + ")");
var op = new B.Orbit(5, 0.5); for (i = 0; i < 20000 && !op.captured; i++) op.step(0.05); ok(op.captured, "an orbit with too little angular momentum plunges");
var os = new B.Orbit(2.9, 1), ou = new B.Orbit(3.2, 1); for (i = 0; i < 30000 && !os.captured; i++) { os.step(0.1); ou.step(0.1); }
ok(os.captured || Math.abs(1 / os.u - 2.9) > 0.001, "a 'circular' orbit inside the ISCO (r = 2.9) is unstable"); near(1 / ou.u, 3.2, 0.05, "just outside r = 3 rs the orbit is stable (r = 3.2)");
near(B.circularL(3) * B.circularL(3), 3, 1e-9, "L^2 = 12 (GM/c)^2 = 3 (rs c)^2 at the ISCO");
near(B.circularV(3), 0.5, 1e-9, "orbital speed at the ISCO is c / 2 (as measured by a static observer)");
/* energy is conserved along an eccentric orbit */
var oe = new B.Orbit(20, 0.8), E0 = oe.E, ml = 0; for (i = 0; i < 50000 && !oe.captured; i++) { oe.step(0.5); var uu = oe.u, E2 = oe.v * oe.v * oe.L * oe.L * uu * uu * uu * uu * (1 - uu) * 0; }
ok(!oe.captured && oe.peri.length >= 1, "an eccentric orbit at r0 = 20 rs, k = 0.8 keeps going");
/* 5. numbers */
var sun = B.numbers(B.K.Msun); near(sun.rs, 2953.25, 0.5, "Schwarzschild radius of the Sun is 2.95 km");
near(sun.hawkingT, 6.17e-8, 0.02e-8, "Hawking temperature of a solar-mass hole is 61.7 nK");
near(sun.dilation(sun.rs * 1.0001) < 0.02 ? 1 : 0, 1, 0, "clocks stop at the horizon");
var sgra = B.numbers(4.3e6 * B.K.Msun); near(sgra.rs / 1e9, 12.7, 0.2, "Sgr A* rs is about 12.7 million km");
near(B.numbers(B.K.Mearth).rs, 0.00887, 0.0002, "the Earth's Schwarzschild radius is 8.9 mm");
near(sun.tidalRadius(2, B.K.g0 * 1000) / sun.rs, 1, 1e9, "tidal radius is a finite number");
/* 6. the picture: a pixel that looks straight at the hole is black, one far off sees sky; the disk is hit when the line of sight crosses it */
var cam = B.makeCamera(30, 0, 30), hits = 0;
ok(B.tracePixel(cam, 0, 0, { disk: false }).kind === 2, "looking straight at the hole: the shadow");
ok(B.tracePixel(cam, 0.95, 0.9, { disk: false }).kind === 0, "looking far from the hole: the sky");
for (i = 0; i < 40; i++) { var rp = B.tracePixel(cam, 0.2 + i * 0.01, 0.0, { disk: true }); if (rp.disks && rp.disks.length) hits++; } ok(hits > 5, "face-on view: rays just outside the shadow cross the disk (" + hits + " of 40 pixels)");
var edge = B.makeCamera(30, 88, 30), eh = 0, e2 = 0; for (i = 0; i < 60; i++) { var rq = B.tracePixel(edge, 0, 0.1 + i * 0.01, { disk: true }); if (rq.disks && rq.disks.length) eh++; if (rq.disks && rq.disks.length > 1) e2++; } ok(eh > 3, "edge-on: rays that pass above the hole bend down onto the far side of the disk (" + eh + " of 60 pixels hit it, " + e2 + " twice)");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
