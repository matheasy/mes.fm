/* node tool_apps_src/heart-simulator-tests.js : the heart simulator's model against textbook values */
const H = require("./heart-simulator/lib.js");
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL:", m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + " +-" + tol + ")"); }
function within(a, lo, hi, m) { ok(a >= lo && a <= hi, m + " (got " + (+a).toFixed(3) + ", want " + lo + ".." + hi + ")"); }
const P = (id) => H.PRESETS.find((x) => x.id === id).p;

/* elastance curve: Stergiopulos double-Hill peaks at about 1 near tn = 1 */
{ let mx = 0, at = 0; for (let t = 0; t < 2; t += 0.001) { const e = H.hill(t); if (e > mx) { mx = e; at = t; } } near(mx, 1, 0.03, "double-Hill peak"); near(at, 1, 0.06, "double-Hill peak time"); ok(H.hill(1.6) < 0.01, "relaxed by tn 1.6"); }

/* normal adult at rest (Guyton & Hall / Klabunde ranges) */
const N = H.simulate({});
within(N.edv, 110, 140, "normal EDV ml"); within(N.esv, 40, 65, "normal ESV ml"); within(N.sv, 60, 90, "normal SV ml"); within(N.ef, 0.55, 0.65, "normal EF");
within(N.sbp, 110, 130, "normal systolic"); within(N.dbp, 68, 85, "normal diastolic"); within(N.edp, 5, 12, "normal LVEDP"); within(N.la, 5, 12, "normal mean LA pressure");
within(N.co, 4.5, 6.5, "normal cardiac output L/min"); within(N.avGrad, 0, 10, "normal aortic valve mean gradient");
within((N.ev.ao - N.ev.mc) * 1000, 30, 90, "isovolumic contraction ms"); within((N.ev.ac - N.ev.ao) * 1000, 240, 320, "ejection time ms"); within((N.ev.mo - N.ev.ac) * 1000, 50, 110, "isovolumic relaxation ms");
within(N.ev.ac * 1000, 546 - 2.1 * 75 - 45, 546 - 2.1 * 75 + 15, "QS2 near Weissler 546 - 2.1 HR");
/* conservation of blood volume: the beat starts where it ended (steady state) */
{ const r = N.rec; near(r.vlv[0], r.vlv[r.vlv.length - 1], 1.5, "LV volume returns to its start (steady)"); }
/* stroke work ~ SV x (MAP - EDP) to within the loop's shape */
within(N.sw / (N.sv * (N.map - N.edp)), 0.95, 1.45, "stroke work vs SV x (MAP - EDP) (mean ejection pressure is above MAP)");
/* end-systole sits on the ESPVR: Pes ≈ Ees (Ves - V0) */
within(N.esp / H.espvr(N.p, N.esv), 0.85, 1.12, "end-systolic point on the ESPVR line");
/* end-diastole sits on the EDPVR */
near(N.edp, H.edpvr(N.p, N.edv), 0.01, "end-diastolic point on the EDPVR");

/* Frank-Starling: more volume -> bigger EDV and SV */
{ const a = H.simulate({ vol: 560 }), b = H.simulate({ vol: 760 }); ok(b.edv > a.edv + 5 && b.sv > a.sv + 3, "Frank-Starling: preload up, SV up"); }
/* contractility: higher Ees -> smaller ESV, higher EF */
{ const a = H.simulate({ ees: 1.5 }), b = H.simulate({ ees: 3.5 }); ok(b.esv < a.esv - 8 && b.ef > a.ef + 0.08, "contractility: Ees up, ESV down, EF up"); }
/* afterload: higher SVR -> higher pressure, smaller SV */
{ const a = H.simulate({ svr: 0.7 }), b = H.simulate({ svr: 1.6 }); ok(b.map > a.map + 20 && b.sv < a.sv - 5, "afterload: SVR up, MAP up, SV down"); ok(b.ea > a.ea, "Ea rises with SVR"); }
/* caval occlusion: end-systolic points of the shrinking loops fall on a line of slope ≈ Ees */
{ const L = H.cavalOcclusion({}, { beats: 9 }); const pts = L.slice(2).map((b) => [b.esv, b.esp]); const fit = H.fitLine(pts); within(fit.slope, 2.5 * 0.8, 2.5 * 1.25, "caval occlusion ESPVR slope ≈ Ees 2.5"); ok(L[L.length - 1].edv < L[0].edv - 20, "occlusion empties the ventricle"); }

/* presets against their textbook signature */
{ const b = H.simulate(P("hfref")); within(b.ef, 0.1, 0.4, "HFrEF EF < 40%"); ok(b.edv > 170, "HFrEF dilated (EDV > 170)"); ok(b.edp > 12, "HFrEF raised EDP"); }
{ const b = H.simulate(P("hfpef")); ok(b.ef >= 0.5, "HFpEF EF >= 50%"); ok(b.edp > 15, "HFpEF raised EDP (" + b.edp.toFixed(1) + ")"); }
{ const b = H.simulate(P("as")); ok(b.avGrad > 40, "severe AS mean gradient > 40 mmHg (" + b.avGrad.toFixed(1) + ")"); ok(b.plvMax > b.sbp + 40, "AS: LV systolic pressure far above aortic"); }
{ const b = H.simulate(P("ms")); ok(b.mvGrad > 5, "MS mean gradient > 5 mmHg (" + b.mvGrad.toFixed(1) + ")"); ok(b.la > N.la + 3, "MS raised LA pressure"); }
{ const b = H.simulate(P("mr")); ok(b.mrVol >= 60, "severe MR regurgitant volume >= 60 ml (" + b.mrVol.toFixed(0) + ")"); ok(b.rf >= 0.5, "severe MR regurgitant fraction >= 50%"); ok(b.ef > N.ef, "MR: EF looks high"); }
{ const b = H.simulate(P("ar")); ok(b.arVol >= 60 * 0.8, "severe AR regurgitant volume ~>= 60 ml (" + b.arVol.toFixed(0) + ")"); ok(b.sbp - b.dbp > 70, "AR wide pulse pressure"); ok(b.dbp < 65, "AR low diastolic"); }
{ const b = H.simulate(P("ex")); ok(b.co > 1.8 * N.co, "exercise CO about doubles (" + b.co.toFixed(1) + ")"); }
{ const b = H.simulate(P("af")); ok(b.sv < N.sv, "AF: no atrial kick, smaller SV"); }
{ const b = H.simulate(P("hem")); ok(b.edv < N.edv - 25 && b.sv < N.sv, "blood loss: small EDV and SV"); }
/* valve law: K from Bernoulli 4v²: 300 ml/s through 1 cm² is 3 m/s, i.e. 36 mmHg */
{ const K = 1 / 2500; near(K * 300 * 300, 36, 1e-9, "Bernoulli 4v² at 3 m/s"); }

/* ECG rhythm generator */
function rrs(id, t) { const g = H.rhythm(id, 5).until(t + 2); return { g, rr: g.beats.filter((b) => b.t < t).map((b, i, a) => i ? b.t - a[i - 1].t : 0).slice(1) }; }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, cv = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))) / m; };
{ const { rr } = rrs("sinus", 60); near(60 / mean(rr), 75, 1.5, "sinus rate 75"); ok(cv(rr) < 0.03, "sinus regular"); }
{ const { rr } = rrs("brady", 60); ok(60 / mean(rr) < 60, "sinus brady < 60"); }
{ const { rr } = rrs("tachy", 60); ok(60 / mean(rr) > 100, "sinus tachy > 100"); }
{ const { g, rr } = rrs("af", 60); ok(cv(rr) > 0.15, "AF irregularly irregular"); ok(g.ps.length === 0, "AF no P waves"); }
{ const { rr } = rrs("svt", 30); within(60 / mean(rr), 150, 250, "SVT rate"); }
{ const { rr } = rrs("vt", 30); within(60 / mean(rr), 120, 250, "VT rate"); ok(H.rhythm("vt", 1).until(5).beats.every((b) => b.m === "w"), "VT wide"); }
{ const g = H.rhythm("avb1", 1).until(20); ok(g.beats.every((b) => Math.abs(b.pr - 0.28) < 1e-9), "1st degree PR 280 ms"); }
{ const g = H.rhythm("mob1", 1).until(30); const pr = g.beats.map((b) => b.pr); ok(pr[1] > pr[0] && pr[2] > pr[1], "Wenckebach PR lengthens"); ok(g.beats.length < g.ps.length, "Wenckebach drops beats"); }
{ const g = H.rhythm("mob2", 1).until(30); ok(new Set(g.beats.map((b) => b.pr)).size === 1, "Mobitz II constant PR"); ok(g.beats.length < g.ps.length, "Mobitz II drops beats"); }
{ const g = H.rhythm("avb3", 1).until(60); const pr = g.ps.length / 60 * 60, vr = g.beats.filter((b) => b.t < 60).length; ok(pr > 70 && vr < 40, "complete block: atria ~80, ventricles ~36"); }
{ const { g, rr } = rrs("pvc", 30); const i = g.beats.findIndex((b) => b.pvc); const r0 = g.beats[i].t - g.beats[i - 1].t, r1 = g.beats[i + 1].t - g.beats[i].t; near(r0 + r1, 2 * 0.8, 0.06, "PVC compensatory pause = 2 RR"); }
{ const g = H.rhythm("hyperk", 1).until(5), b = g.beats[1]; const w = H.complex(b), T = w[w.length - 1]; ok(T.a > 0.8 && T.s < 0.035, "hyperkalaemia: tall narrow T"); }
{ const g = H.rhythm("stemi", 1).until(5), b = g.beats[1]; const y = g.at(b.t + b.qrs + 0.06), y0 = g.at(b.t - 0.02); ok(y - y0 >= 0.1, "STEMI: ST raised >= 1 mm (" + (y - y0).toFixed(2) + " mV)"); }
{ const g = H.rhythm("longqt", 1); const rr = 60 / 62; ok(H.qtc(g.truth.qt, rr).bazett > 0.5, "long QT: QTc > 500 ms"); }
{ const g = H.rhythm("vf", 1).until(5); ok(g.beats.length === 0, "VF: no QRS"); let mx = 0; for (let t = 0; t < 5; t += 0.01) mx = Math.max(mx, Math.abs(g.at(t))); ok(mx > 0.2, "VF has visible waves"); }
{ const g = H.rhythm("asys", 1).until(5); let mx = 0; for (let t = 0; t < 5; t += 0.01) mx = Math.max(mx, Math.abs(g.at(t))); ok(mx < 0.05, "asystole flat"); }
/* every rhythm in the list builds and draws finite numbers */
H.RHYTHMS.forEach((r) => { const g = H.rhythm(r.id, 9).until(12); let bad = 0; for (let t = 0; t < 10; t += 0.004) if (!isFinite(g.at(t))) bad++; ok(!bad, "rhythm " + r.id + " finite"); });
/* the drawn QRS of a normal beat is about the width it claims */
{ const g = H.rhythm("sinus", 1).until(5), b = g.beats[2]; let on = null, off = null; for (let t = b.t - 0.03; t < b.t + 0.15; t += 0.001) { const y = Math.abs(g.at(t) - g.at(b.t - 0.03)); if (y > 0.05 && on === null) on = t; if (y > 0.05) off = t; } within((off - on) * 1000, 60, 110, "drawn QRS width ms"); }

/* QTc formulas (QT 400 ms, RR 0.8 s) */
{ const q = H.qtc(0.4, 0.8); near(q.bazett * 1000, 447.2, 0.1, "Bazett"); near(q.fridericia * 1000, 430.9, 0.1, "Fridericia"); near(q.framingham * 1000, 430.8, 0.1, "Framingham"); near(q.hodges * 1000, 426.25, 0.1, "Hodges"); }
{ const r = H.rateFromBoxes(4, 20); near(r.big, 75, 1e-9, "300 rule"); near(r.small, 75, 1e-9, "1500 rule"); }

/* bedside formulas */
near(H.map(120, 80), 93.333, 0.001, "MAP 120/80");
near(H.bsa(170, 70).mosteller, 1.8181, 0.0005, "Mosteller BSA 170 cm 70 kg"); near(H.bsa(170, 70).dubois, 1.8097, 0.002, "Du Bois BSA");
{ const o = H.hemo({ hr: 70, sv: 70, sbp: 120, dbp: 80, cvp: 5, mpap: 15, pcwp: 8, cm: 170, kg: 70, hb: 15, sao2: 98, pao2: 100, svo2: 75, pvo2: 40 });
  near(o.co, 4.9, 1e-9, "CO = HR x SV"); near(o.ci, 4.9 / 1.8181, 0.002, "CI"); near(o.svr, 80 * (93.333 - 5) / 4.9, 0.05, "SVR dyn"); near(o.pvr, 80 * 7 / 4.9, 0.01, "PVR dyn"); near(o.pvrWU, 7 / 4.9, 0.001, "PVR Wood units");
  near(o.cao2, 1.34 * 15 * 0.98 + 0.3, 1e-9, "CaO2 ml/dl"); within(o.cao2, 19.9, 20.1, "CaO2 ≈ 20 ml/dl"); near(o.do2, 4.9 * o.cao2 * 10, 1e-9, "DO2 = CO x CaO2 x 10"); within(o.do2, 970, 990, "DO2 ≈ 980 ml/min"); within(o.o2er, 0.22, 0.26, "O2 extraction ≈ 24%"); within(o.vo2, 220, 245, "Fick VO2 ≈ 230 ml/min"); }

console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
