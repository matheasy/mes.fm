// node tool_apps_src/hutchison-effect-simulator-tests.js : checks of MESHut (fields, tuning, interference, effect model, presets, share links)
"use strict";
var H = require("./hutchison-effect-simulator/lib.js"), n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL:", msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), msg + " (" + a + " vs " + b + ")"); }
function room(items, cables, refl) { return {room: {w: 10, h: 8, refl: refl || 0}, items: items, cables: cables || []}; }

// 1. electrode field: E = V a / r^2 (peak), falls as 1/r^2
var st = room([H.dev("a", "vdg", 5, 4)]), src = H.sources(st);
near(H.fieldAt(src, 6, 4).E, 180e3 * 0.15 / 1, 1e-9, "Van de Graaff field at 1 m = V a / r^2");
near(H.fieldAt(src, 7, 4).E / H.fieldAt(src, 6, 4).E, 0.25, 1e-9, "1/r^2 fall-off");
ok(H.fieldAt(src, 6, 4).Eac === 0, "a DC source has no AC part");

// 2. AC rms = peak / sqrt 2
var s2 = H.sources(room([H.dev("t", "tesla_large", 5, 4)]));
near(H.fieldAt(s2, 7, 4).E, H.srcE(s2[0], 2, 0) / Math.SQRT2, 1e-9, "AC field is reported as rms");

// 3. tank tuning
near(H.tankF(10, 78), 1 / (2 * Math.PI * Math.sqrt(10e-9 * 78e-6)), 1e-12, "tank resonance 1/(2 pi sqrt(LC))");
near(H.tuning(180e3, 180e3), 1, 1e-12, "a tank on the coil's frequency gives full output");
ok(H.tuning(120e3, 180e3) < 0.15, "a badly tuned tank gives little output");
var tuned = room([H.dev("t", "tesla_large", 5, 4, {f: 180e3}), H.dev("k", "tank", 2, 4, {C: 10, L: 78})], [["k", "t"]]);
ok(H.resolve(tuned).t.tune > 0.95, "LADS tank values tune the 180 kHz coil");

// 4. interference of locked sources: two equal coils in antiphase cancel on the midline, in phase they double
function pair(ph, cabled) { return H.sources(room([H.dev("a", "tesla_large", 3, 4), H.dev("b", "tesla_large", 7, 4, {phase: ph})], cabled ? [["a", "b"]] : [])); }
var mid = function (s) { return H.fieldAt(s, 5, 6); }, cen = function (s) { return H.fieldAt(s, 5, 4); };
ok(cen(pair(0, true)).E < 1e-6, "in-phase locked pair: the radial fields cancel half-way between them (node)");
ok(cen(pair(180, true)).coh > 1.99, "antiphase locked pair: they add half-way between them (antinode ratio 2)");
near(mid(pair(180, false)).E, mid(pair(0, false)).E, 1e-9, "free-running pair: phase does not matter (powers add)");
ok(mid(pair(0, false)).beats.some(function (b) { return b.drift; }), "free-running same-frequency pair is flagged as drifting");

// 5. beats between two frequencies
var bs = H.sources(room([H.dev("a", "tesla_large", 3, 4, {f: 250e3}), H.dev("b", "tesla_large", 7, 4, {f: 262e3})]));
var fb = H.fieldAt(bs, 5, 4); ok(fb.beats.length === 1 && Math.abs(fb.beats[0].df - 12e3) < 1, "250 + 262 kHz beat at 12 kHz");
ok(fb.Neff > 1.95 && fb.Neff <= 2.0001, "two equal sources: overlap 2");

// 6. dumbbell: two antiphase domes
var db = H.sources(room([H.dev("d", "tesla_dumbbell", 5, 4)]));
ok(db.length === 2 && Math.abs(Math.abs(db[0].phase - db[1].phase) - Math.PI) < 1e-9, "dumbbell coil = two domes in antiphase");
var gd = H.fieldAt(db, 5, 6).groups[0]; ok(Math.abs(gd.yr) < 1e-6 * Math.abs(gd.xr) && Math.abs(gd.xr) > 0, "dumbbell: on its middle plane the field points along the coil axis");

// 7. wall reflections only for RF
ok(H.sources(room([H.dev("r", "rf_tx", 5, 4)], [], 0.5)).length === 5, "an RF source gets 4 wall images");
ok(H.sources(room([H.dev("t", "tesla_large", 5, 4)], [], 0.5)).length === 1, "a 180 kHz coil gets no images");

// 8. drive model: monotonic in field, more for overlap, DC bias helps, 0 with nothing
ok(H.drive({E: 0, B: 0, Neff: 0, richness: 0, Es: 0, Eac: 0, pulse: 0}).D === 0, "no field, no drive");
function D(o) { return H.drive(Object.assign({E: 5e3, B: 0, Neff: 1, richness: 1, Es: 0, Eac: 5e3, pulse: 0}, o)).D; }
ok(D({E: 10e3, Eac: 10e3}) > D({}), "drive grows with the field");
ok(D({Neff: 3}) > D({}), "drive grows with overlap");
ok(D({richness: 4}) > D({}), "drive grows with spectral richness");
ok(D({Es: 2e3}) > D({}), "a DC bias under the AC field raises the drive (the Van de Graaff)");
ok(D({pulse: 1}) > D({}), "spark pulses raise the drive");
ok(D({E: 1e9, Eac: 1e9, Neff: 6}) <= 1, "drive is at most 1");

// 9. rates: material and mass dependence
var fa = {D: 0.8, fDom: 200e3, B: 0}, al = {mat: "al", m: 0.1, shape: "bar"}, blk = {mat: "steel", m: 20, shape: "block"}, wat = {mat: "water", m: 0.6, shape: "bottle"}, wood = {mat: "wood", m: 0.3, shape: "block"};
var ra = H.rates(al, fa), rb = H.rates(blk, fa), rw = H.rates(wat, fa), rwo = H.rates(wood, fa);
ok(ra.lev > 10 * rb.lev, "a 100 g bar lifts far more often than a 20 kg block");
ok(rb.lev > 0, "a 20 kg block can still lift (reports go up to 750 kg)");
ok(ra.bub === 0 && rw.bub > 0, "only liquids bubble");
ok(rw.brt > 0 && ra.brt === 0, "only bottles breathe");
ok(rwo.jel < ra.jel / 5, "wood barely plasticizes; metal does");
ok(H.rates(al, fa, {neighbour: true}).fus > 0 && ra.fus === 0, "fusion needs a different material touching");
near(H.massFactor(H.EFF.lev, 100), 1, 1e-12, "mass factor is 1 at 100 g");
ok(H.rates(al, {D: 0, fDom: 0, B: 0}).lev === 0, "no drive, no events");
ok(H.warm(0) === 0 && H.warm(200) > 0.99, "warm-up from 0 to 1");
near(H.probWithin(6, 10), 1 - Math.exp(-1), 1e-12, "6 per hour -> 1 - 1/e in 10 minutes");

// 10. ordinary field pull is tiny compared with the weight
ok(H.classicalLift(30e3, {mat: "al", m: 0.3}) < 0.01, "ordinary electrostatic pull at 30 kV/m is under 1% of the weight of a 300 g bar");

// 11. presets: calibrated rates, inside the room, cables valid
var totals = {};
Object.keys(H.PRESETS).forEach(function (k) {
	var p = H.PRESETS[k].build(), s = H.sources(p), ids = {};
	p.items.forEach(function (d) { ids[d.id] = 1; ok(d.x >= 0 && d.x <= p.room.w && d.y >= 0 && d.y <= p.room.h, k + ": " + d.id + " inside the room"); });
	p.cables.forEach(function (c) { ok(ids[c[0]] && ids[c[1]], k + ": cable " + c + " joins existing items"); });
	var tot = 0; p.items.filter(function (d) { return d.t === "sample"; }).forEach(function (o) { var f = H.fieldAt(s, o.x, o.y), r = H.rates(o, f, {neighbour: true}); Object.keys(r).forEach(function (e) { tot += r[e]; ok(isFinite(r[e]) && r[e] >= 0, k + ": finite rate"); }); });
	totals[k] = tot;
	var z = p.items.filter(function (d) { return d.t === "zone"; })[0]; ok(!!z, k + ": has an active area");
	var g = H.grid(s, p.room, 40, 30); ok(g.E.every(function (v) { return isFinite(v) && v >= 0; }) && g.D.every(function (v) { return v >= 0 && v <= 1; }), k + ": grid is finite");
});
ok(totals.lads > 0.4 && totals.lads < 3, "LADS: about one event an hour (" + totals.lads.toFixed(2) + ")");
ok(totals.starter > 0.8 && totals.starter < 6, "starter: a few events an hour (" + totals.starter.toFixed(2) + ")");
ok(H.power(H.PRESETS.starter.build()).W < 1650, "starter fits on one 15 A circuit");

// 12. share links round-trip
var L = H.PRESETS.lads.build(); L.preset = "lads";
var back = H.decode(H.encode(L));
ok(back && back.items.length === L.items.length && back.cables.length === L.cables.length && back.preset === "lads", "share link keeps every item and cable");
near(H.fieldAt(H.sources(back), 13, 9).E, H.fieldAt(H.sources(L), 13, 9).E, 1e-6, "share link reproduces the field");
ok(H.decode("not base64!!") === null, "a broken link gives null");
ok(H.decode(H.encode({room: {w: 5, h: 5}, items: [{id: "x", t: "evil", x: 1, y: 1}], cables: [["x", "y"]]})).items.length === 0, "unknown types and dangling cables are dropped");

// 13. spectrum: harmonics and sidebands
var sp = H.spectrum(H.sources(room([H.dev("t", "tesla_large", 5, 4, {f: 200e3}), H.dev("g", "siggen", 1, 1, {f: 1000})], [["g", "t"]])), 6, 4);
ok(sp.some(function (l) { return l.kind === "side" && Math.abs(l.f - 201e3) < 1; }), "modulation adds a sideband at f + fm");
ok(sp.some(function (l) { return l.kind === "harm" && Math.abs(l.f - 400e3) < 1; }), "a Tesla coil shows its 2nd harmonic");

// 14. schematic layout follows the cables
var sc = H.schematic(H.PRESETS.toronto.build());
var colOf = {}; sc.nodes.forEach(function (n) { colOf[n.id] = n.col; });
ok(colOf.ac < colOf.ps && colOf.ps < colOf.gp && colOf.gp < colOf.tk && colOf.tk < colOf.lt && colOf.lt < colOf.fs, "schematic columns follow outlet -> supply -> gap -> tank -> coil -> field shaper");

// 15. ICNIRP reference levels
near(H.eRef(14e6), 61, 1e-12, "61 V/m between 10 and 400 MHz"); near(H.eRef(200e3), 610, 1e-12, "610 V/m at 200 kHz");

// 16. cameras: field of view, what they see, picture noise
var cam = H.dev("c", "camera", 2, 4, {rot: 0}), rm = {w: 10, h: 8};
near(H.camFov(cam), 50, 1e-12, "default field of view 50 degrees"); near(H.camFov({fov: 500}), 120, 1e-12, "field of view is capped at 120");
near(H.wallDist(rm, 2, 4, 0), 8, 1e-9, "looking right from x=2 meets the wall 8 m away"); near(H.wallDist(rm, 2, 4, -Math.PI / 2), 4, 1e-9, "looking up meets the top wall");
ok(H.inView(cam, 6, 4.5) && !H.inView(cam, 1, 4) && !H.inView(cam, 6, 8), "in view straight ahead, not behind or far to the side");
near(H.viewAngle(cam, 5, 3), -45 * 0 + Math.atan2(-1, 3) * 180 / Math.PI, 1e-9, "points above the centre line are on the left of the picture (negative)");
var vp = H.viewPoly(cam, rm, 10); ok(vp.length === 12 && vp.every(function (q) { return q[0] >= -1e-9 && q[0] <= 10 + 1e-9 && q[1] >= -1e-9 && q[1] <= 8 + 1e-9; }), "the view polygon stays inside the room");
var zz = H.dev("z", "zone", 7, 4, {w: 2, h: 1}); near(H.zoneCoverage(cam, zz), 1, 1e-9, "a zone straight ahead is fully covered");
ok(H.zoneCoverage(H.dev("c2", "camera", 2, 4, {rot: 180}), zz) === 0, "a camera turned away sees none of it");
var sees = H.camSees(room([cam, zz, H.dev("t", "tesla_large", 8, 4), H.dev("v", "vdg", 1, 1)]), cam); ok(sees.ids.indexOf("t") >= 0 && sees.ids.indexOf("v") < 0 && sees.zones.length === 1, "camSees lists what is in front only");
var back2 = H.decode(H.encode(room([H.dev("c", "camera", 2, 4, {fov: 30})]))); ok(back2.items[0].fov === 30, "share links keep the field of view");
ok(H.camNoise(2, 10) === 0 && H.camNoise(300, 10) === 1 && H.camNoise(30, 10) > H.camNoise(10, 10), "picture noise grows with the field / immunity ratio");
var dropF = function (lv) { var k = 0; for (var i = 0; i < 6000; i++) k += H.camDropout(lv, i * 0.05, 3); return k / 6000; };
ok(dropF(0.2) === 0, "no dropouts at low noise"); ok(dropF(1) > 0.02 && dropF(1) < 0.15, "dropouts are intermittent even at full noise (" + dropF(1).toFixed(3) + ")"); ok(dropF(0.6) < dropF(1), "fewer dropouts at medium noise");
ok(H.camDropout(1, 12.34, 5) === H.camDropout(1, 12.34, 5), "dropouts are deterministic");

console.log(n - bad + " / " + n + " checks passed"); if (bad) process.exit(1);
