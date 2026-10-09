/* node tool_apps_src/photoelectric-effect-tests.js */
const P = require("./photoelectric-effect-simulator/lib.js");
let f = 0, n = 0; function near(a, b, t, m) { n++; const ok = Math.abs(a - b) <= t * Math.abs(b); if (!ok) { f++; console.log("FAIL", m, a, b); } else console.log("ok  ", m, a.toPrecision(5)); }
function is(c, m) { n++; if (!c) { f++; console.log("FAIL", m); } else console.log("ok  ", m); }
near(P.HC_EVNM, 1239.84198, 1e-7, "hc in eV nm");
near(P.energyFromWavelength(400), 3.0996, 1e-4, "photon energy at 400 nm");
near(P.ke(400, P.MBY.cs.phi), 0.9596, 1e-3, "caesium at 400 nm: KE max");
is(P.ke(700, P.MBY.cs.phi) === 0, "caesium at 700 nm: below threshold, no electrons");
near(P.threshold(2.14).nm, 579.4, 1e-3, "caesium threshold wavelength");
near(P.threshold(2.14).f, 5.174e14, 1e-3, "caesium threshold frequency");
near(P.speed(1), 5.931e5, 1e-3, "speed of a 1 eV electron");
is(P.iv(-1, 1) === 0 && P.iv(5, 1) === 1 && P.iv(0, 1) > 0 && P.iv(0, 1) < 1, "I-V shape");
// h from a synthetic experiment on sodium: V0 = h f / e - phi / e
const pts = []; for (const nm of [250, 300, 350, 400, 450]) pts.push([P.freqFromWavelength(nm), P.ke(nm, 2.75)]);
const fit = P.fit(pts); near(fit.a * P.E, P.H, 1e-6, "Planck constant from the slope"); near(-fit.b, 2.75, 1e-6, "work function from the intercept"); is(fit.r2 > 0.999999, "perfect line");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
