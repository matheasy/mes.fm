// node tool_apps_src/redshift-simulator-tests.js
const R = require("./redshift-simulator/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
function near(a, b, tol, m) { n++; const rel = Math.abs(a - b) / (Math.abs(b) || 1); if (!(rel <= tol)) { f++; console.log("FAIL", m, a, "vs", b, "rel", rel); } }
// Doppler
near(R.dopplerFactor(0.6, 180), 0.5, 1e-12, "receding 0.6c halves the frequency"); near(R.dopplerFactor(0.6, 0), 2, 1e-12, "approaching 0.6c doubles it"); near(R.dopplerFactor(0.6, 90), 0.8, 1e-12, "sideways (observer frame) = 1/gamma");
near(R.dopplerFactor(0, 37), 1, 1e-12, "at rest"); near(R.zFromBeta(0.6), 1, 1e-12, "z for 0.6c receding"); near(R.betaFromZ(1), 0.6, 1e-12, "beta from z=1"); near(R.zFromBeta(-0.6), -0.5, 1e-12, "approaching z");
near(R.zFromFactor(R.dopplerFactor(0.1, 180)), R.zFromBeta(0.1), 1e-12, "factor and z agree"); near(R.betaFromZ(R.zFromBeta(0.93)), 0.93, 1e-12, "round trip beta"); eq(R.betaFromZ(0), 0, "z=0");
near(R.zFromBeta(1e-4), 1e-4, 1e-3, "non-relativistic limit z ~ v/c"); near(R.gamma(0.8), 5 / 3, 1e-12, "gamma 0.8");
// gravity
const rsSun = R.rs(R.MSUN); near(rsSun, 2953.25, 1e-3, "Sun's Schwarzschild radius"); near(R.rs(5.9722e24), 8.87e-3, 2e-3, "Earth's Schwarzschild radius");
near(R.gravZ(rsSun, 6.957e8, Infinity), 2.12e-6, 5e-3, "Sun surface redshift 2.12e-6"); near(R.gravZ(rsSun, 6.957e8, Infinity) * R.C / 1000, 0.636, 5e-3, "...= 0.636 km/s");
const rsE = R.rs(5.9722e24), pr = -R.gravZ(rsE, 6.371e6, 6.371e6 + 22.5); near(Math.abs(pr), 2.458e-15, 0.002, "Pound-Rebka 22.5 m (0.2%)"); eq(pr < 0, true, "climbing 22.5 m is a redshift (factor < 1)");
near(R.gravZ(R.rs(1.4 * R.MSUN), 1.2e4, Infinity), 0.2363, 5e-3, "neutron star z about 0.24"); near(R.gravZ(1, 1.5, Infinity), 1 / Math.sqrt(1 - 2 / 3) - 1, 1e-12, "r = 1.5 rs"); eq(isNaN(R.gravFactor(1, 1, Infinity)), true, "horizon is NaN"); eq(isNaN(R.gravFactor(1, 0.5, 10)), true, "inside horizon");
near(R.gravZ(R.rs(1.018 * R.MSUN), 5.84e6, Infinity), 2.57e-4, 0.03, "Sirius B");
near(R.gravFactor(1, 4, 8) * R.gravFactor(1, 8, 4), 1, 1e-12, "down then up cancels"); eq(R.gravFactor(1, 2.5, 100) > 1, false, "climbing out = redshift"); eq(R.gravFactor(1, 100, 2.5) > 1, true, "falling in = blueshift");
near(R.weakZ(R.MSUN, 6.957e8, Infinity), 2.12e-6, 5e-3, "weak-field formula"); near(R.clockRate(1, 2), Math.sqrt(0.5), 1e-12, "clock rate at 2 rs"); near(R.indexOf(1, 2) * R.clockRate(1, 2), 1, 1e-12, "n = 1 / clock rate");
const g = R.gps(5.9722e24, 6.371e6, 2.6571e7); near(g.grav, 45.7, 5e-3, "GPS gravity +45.7 us/day"); near(g.sr, -7.2, 0.01, "GPS speed -7.2 us/day"); near(g.net, 38.5, 0.01, "GPS net +38.5 us/day"); near(g.v, 3874, 5e-3, "GPS speed 3.87 km/s");
// cosmology: Einstein-de Sitter has closed forms; LCDM age has one too
const eds = R.Cosmo(70, 1); near(eds.ageGyr(0), 2 / 3 * eds.hubbleTimeGyr, 1e-4, "EdS age = 2/3 Hubble time"); near(eds.comovingMpc(1), 2 * R.C / 1000 / 70 * (1 - 1 / Math.SQRT2), 1e-4, "EdS comoving distance"); near(eds.lookbackGyr(3), eds.hubbleTimeGyr * 2 / 3 * (1 - Math.pow(4, -1.5)), 1e-4, "EdS lookback");
const lc = R.Cosmo(70, 0.3), t0 = 2 / (3 * Math.sqrt(0.7)) * lc.hubbleTimeGyr * Math.asinh(Math.sqrt(0.7 / 0.3)); near(lc.ageGyr(0), t0, 1e-4, "LCDM age 13.47 Gyr"); near(lc.ageGyr(0), 13.47, 5e-3, "...number");
near(lc.lookbackGyr(1), t0 - 2 / (3 * Math.sqrt(0.7)) * lc.hubbleTimeGyr * Math.asinh(Math.sqrt(0.7 / 0.3) * Math.pow(2, -1.5)), 1e-4, "LCDM lookback at z = 1"); near(lc.comovingMpc(1), 3303, 5e-3, "LCDM comoving distance at z = 1 about 3.3 Gpc");
near(lc.ageGyr(5) + lc.lookbackGyr(5), lc.ageGyr(0), 1e-4, "age + lookback = age now"); eq(lc.ageGyr(1089) > 0.0003 && lc.ageGyr(1089) < 0.0007, true, "about half a million years old at the CMB (no radiation: loose)"); eq(lc.recessionC(1) < 1 && lc.recessionC(2) > 1, true, "recession speed passes c between z = 1 and z = 2"); near(lc.comovingMpc(0), 0, 1e-9, "z=0");
// colour and bands
eq(R.wlToRgb(650)[0] > 200 && R.wlToRgb(650)[2] === 0, true, "650 nm red"); eq(R.wlToRgb(530)[1] > 200, true, "530 green"); eq(R.wlToRgb(460)[2] > 200, true, "460 blue"); eq(R.wlToRgb(900)[3], 0, "infrared has no colour"); eq(R.wlToRgb(300)[3], 0, "ultraviolet has no colour");
eq(R.bandOf(550), "green", "550"); eq(R.bandOf(121.6), "far ultraviolet", "Lyman alpha"); eq(R.bandOf(1500), "near infrared", "near IR"); eq(R.bandOf(1.1e6), "microwaves", "CMB peak"); near(R.shiftWl(656.28, 1089), 656.28 * 1090, 1e-12, "shift");
eq(R.linesOf("H").map(l => l[1]).includes("Hα"), true, "H lines"); eq(R.linesOf("gal").length > 12, true, "galaxy set"); eq(R.sets === undefined, true, "no stray export");
near(R.exaggerate(1 + 1e-9, 1e8), 1.1, 1e-7, "exaggerate"); near(R.autoK(1.001, 1, 1.5) * 0.001, 0.5, 1e-9, "autoK targets the ratio"); eq(R.autoK(1, 1, 1.5), 1, "no difference -> 1");
eq(R.fmtWl(656.28), "656.3 nm", "fmtWl nm"); eq(R.fmtWl(1500), "1.5 µm", "fmtWl um"); eq(R.sig(2.12e-6, 3), "2.12 × 10⁻⁶", "sig sci"); eq(R.sig(0.2363, 3), "0.236", "sig plain");
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
