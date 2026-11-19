// node tool_apps_src/space-shuttle-simulator-tests.js
"use strict";
const S = require("./space-shuttle-simulator/lib.js");
const D = S.D2R;
let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL " + m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " ± " + tol + ")"); }

// circular orbits
near(S.period(S.RE + 410e3) / 60, 92.7, 0.15, "ISS period at 410 km");
near(S.circV(410e3), 7663, 5, "ISS speed");
near(S.period(S.RE + 35786e3) / 3600, 23.934, 0.01, "GEO period = sidereal day");
near(S.escV(S.RE), 11180, 3, "escape speed at the surface");
near(S.j2Rates(S.RE + 410e3, 0, 51.6 * D).raan / D * 86400, -5.0, 0.1, "ISS node drift per day");
near(S.sunSyncInc(800e3) / D, 98.6, 0.1, "sun-synchronous inclination at 800 km");

// Hohmann / plane change / rocket
const h = S.hohmann(S.RE + 300e3, S.RE + 415e3);
near(h.dv1 + h.dv2, 65.7, 0.5, "Hohmann 300 -> 415 km");
near(h.tof / 60, 45.8, 0.3, "Hohmann transfer time 300 -> 415 km");
const geo = S.hohmann(S.RE + 200e3, S.RE + 35786e3);
near(geo.total, 3935, 15, "LEO -> GEO Hohmann");
near(S.planeChange(7700, 1 * D), 134.4, 0.5, "1 degree plane change at 7.7 km/s");
ok(S.hohmannPlane(S.RE + 200e3, S.RE + 35786e3, 28.5 * D).total < geo.total + S.planeChange(S.circV(35786e3), 28.5 * D), "combined plane change is cheaper");
near(S.rocketDv(115000, 10830, 316), 306, 3, "Shuttle OMS delta-v about 300 m/s");
near(S.propFor(115000, S.rocketDv(115000, 10830, 316), 316), 10830, 1, "propellant round trip");

// elements round trip, propagation
for (const [r, v] of [[[7e6, 0, 1e5], [0, 7400, 1000]], [[-5e6, 4.2e6, 2e6], [-4000, -5000, 3000]], [[6.9e6, 0, 0], [0, 7600, 0]], [[6.9e6, 0, 0], [0, 7600.0001, 0]]]) {
	const el = S.rv2el(r, v), back = S.el2rv(el);
	near(S.v.norm(S.v.sub(back.r, r)), 0, 1e-3, "el2rv(rv2el) position");
	near(S.v.norm(S.v.sub(back.v, v)), 0, 1e-6, "el2rv(rv2el) velocity");
	const o = new S.Orbit(r, v, 0, false), a = o.at(4321).r, b = S.propagate(r, v, 4321).r;
	near(S.v.norm(S.v.sub(a, b)), 0, 0.5, "Orbit.at = universal propagation");
	const o2 = new S.Orbit(r, v, 100, false), e0 = S.rv2el(o2.at(100 + 7777).r, o2.at(100 + 7777).v);
	near(e0.a, el.a, 1e-3, "energy kept"); near(e0.e, el.e, 1e-9, "eccentricity kept");
}
const hyp = S.propagate([7e6, 0, 0], [0, 12000, 0], 3600);
near(S.v.norm(hyp.v) ** 2 / 2 - S.MU / S.v.norm(hyp.r), 12000 ** 2 / 2 - S.MU / 7e6, 1e-3, "hyperbolic energy kept");
const ellE = new S.Orbit([S.RE + 300e3, 0, 0], [0, S.circV(300e3) + 100, 0], 0, false);
near(S.v.norm(ellE.at(ellE.nextApsis(0, true)).r) - S.RE, ellE.el.ha, 1, "nextApsis(apo) reaches the apogee");
const tr = ellE.nextRadius(0, S.RE + 500e3, true);
near(S.v.norm(ellE.at(tr).r) - S.RE, 500e3, 1, "nextRadius crossing");

// burns
const r0 = [S.RE + 400e3, 0, 0], v0 = [0, S.circV(400e3), 0];
const vp = S.applyBurn(r0, v0, { pro: 50 });
ok(S.rv2el(r0, vp).ha > 570e3, "prograde burn raises the far side");
const vn = S.applyBurn(r0, v0, { nrm: S.planeChange(S.circV(400e3), 1 * D) });
near(S.rv2el(r0, vn).i / D, 1, 0.01, "normal burn tilts the orbit");
const vr = S.applyBurn(r0, v0, { rad: 30 });
near(S.v.norm(vr), Math.hypot(S.circV(400e3), 30), 1e-6, "radial burn is sideways to the velocity");
ok(S.rv2el(r0, vr).e > 0.003, "radial burn makes the orbit oval");
near(S.burnSize({ pro: 3, nrm: 4 }), 5, 1e-12, "burn size");

// rendezvous helpers
near(S.leadAngle(S.RE + 300e3, S.RE + 415e3) / D, 2.28, 0.05, "lead angle for 300 -> 415 km");
const ph = S.phase([7e6, 0, 0], [0, 7500, 0], [0, 7e6, 0]);
near(ph / D, 90, 1e-6, "target 90 degrees ahead");
const l = S.lvlh([7e6, 0, 0], [0, 7546, 0], [7e6, -1000, 0], [0, 7546, 0]);
near(l.y, -1000, 1e-6, "LVLH: 1 km behind on the V-bar");
const n1 = Math.sqrt(S.MU / (S.RE + 300e3) ** 3), n2 = Math.sqrt(S.MU / (S.RE + 415e3) ** 3);
const w = S.waitFor(30 * D, 3 * D, n1, n2);
near(30 * D + (n2 - n1) * w, 3 * D, 1e-6, "waitFor lands on the needed phase");

// Earth / sun / geography
near(S.gcDist(0, 0, 0, Math.PI / 2) / 1000, S.RE * Math.PI / 2 / 1000, 0.5, "great circle distance");
const dd = S.destination(28 * D, -80 * D, 90 * D, 1000e3), back = S.gcDist(28 * D, -80 * D, dd.lat, dd.lon);
near(back, 1000e3, 1, "destination point");
const sd = S.sunDir(Date.UTC(2026, 5, 21, 12)); near(Math.asin(sd[2]) / D, 23.44, 0.1, "sun declination at the June solstice");
near(S.gmst(Date.UTC(2000, 0, 1, 12)) / D, 280.46, 0.01, "GMST at J2000");
const ll = S.latLon([S.RE, 0, 0], 0); near(ll.lat, 0, 1e-12, "latLon"); near(ll.lon, 0, 1e-12, "latLon lon");

// atmosphere
near(S.density(0), 1.225, 1e-9, "sea-level density"); near(S.density(400e3), 3.725e-12, 1e-15, "density at 400 km");
ok(S.density(110e3) > S.density(130e3), "density falls with height");
const lt = S.lifetime(400e3, 100); ok(lt > 100 && lt < 1500, "lifetime at 400 km about a year (" + lt.toFixed(0) + " days)");
ok(S.lifetime(250e3, 100) < 60, "250 km decays within weeks");

// de-orbit: the Shuttle's burn was about 90 m/s (300 ft/s) from roughly 300-400 km, entry interface at -1.2 degrees, about 7.6-7.9 km/s
const dv12 = S.deorbitFor(350e3, -1.2 * D); near(dv12, 92, 6, "retro burn for -1.2 degrees from 350 km");
const de = S.deorbit(330e3, 90, { vRot: 350 });
ok(de.reaches, "90 m/s from 330 km reaches the atmosphere");
ok(de.gammaEI / D < -0.8 && de.gammaEI / D > -1.8, "entry angle in the Shuttle range (" + (de.gammaEI / D).toFixed(2) + ")");
ok(de.vEI > 7700 && de.vEI < 7950, "entry speed");
ok(de.tEI / 60 > 20 && de.tEI / 60 < 40, "burn to entry interface about half an hour");
ok(de.entry.out === "taem", "flies down to TAEM");
ok(de.entry.peakG > 1.1 && de.entry.peakG < 2.0, "peak deceleration about 1.5 g (" + de.entry.peakG.toFixed(2) + ")");
ok(de.entry.landRange > 5000e3 && de.entry.landRange < 9000e3, "entry to landing range thousands of km (" + (de.entry.landRange / 1e3).toFixed(0) + ")");
ok(de.entry.landTime / 60 > 20 && de.entry.landTime / 60 < 40, "entry to landing about half an hour");
ok(de.entry.peakT - 273 > 1300 && de.entry.peakT - 273 < 2200, "nose temperature about 1,500 C");
ok(!S.deorbit(330e3, 30).reaches, "30 m/s stays in orbit");
ok(S.deorbit(330e3, 400).entry.peakG > de.entry.peakG, "steeper entry = more g");
ok(S.deorbit(330e3, 90, { drag: 1.6, vRot: 350 }).entry.landRange < de.entry.landRange, "more drag = shorter range");
near(S.crossRange(1) / 1000, 1311, 2, "Vinh cross-range for L/D 1");

// Moon
const t = S.tli(185e3); near(t.dv, 3135, 10, "TLI from 185 km"); near(t.tof / 86400, 4.98, 0.05, "Hohmann trip to the Moon ~5 days");
ok(S.boost(185e3, 300, S.D_MOON).apo < 20000e3, "Shuttle OMS (300 m/s) gets nowhere near the Moon");
const bb = S.boost(185e3, 3200, S.D_MOON); ok(bb.apo > S.D_MOON && bb.t / 86400 < 4, "a bit more than TLI reaches the Moon in under 4 days");
ok(S.boost(185e3, 3300, S.D_MOON).escape, "3.3 km/s escapes Earth");
near(S.propFor(100000, 3135, 316) / (1 - S.propFor(100000, 3135, 316) / 100000) / 1000, 175, 3, "an empty 100 t orbiter would need ~175 t of propellant for TLI");

// formatting / parsing
ok(S.fmtTime(5572) === "1h 32m 52s", "fmtTime " + S.fmtTime(5572));
near(S.parseLen("400 km"), 400e3, 1e-9, "parse km"); near(S.parseLen("1 nmi"), 1852, 1e-9, "parse nmi"); near(S.parseLen("250"), 250e3, 1e-9, "bare = km");
ok(isNaN(S.parseLen("abc")), "bad length");

console.log((bad ? bad + " of " : "all ") + n + " checks " + (bad ? "FAILED" : "passed"));
process.exit(bad ? 1 : 0);
