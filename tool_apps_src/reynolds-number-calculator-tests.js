/* node tool_apps_src/reynolds-number-calculator-tests.js */
const R = require("./reynolds-number-calculator/lib.js");
let f = 0, n = 0;
function near(a, b, tol, msg) { n++; const ok = Math.abs(a - b) <= tol * Math.abs(b); if (!ok) { f++; console.log("FAIL", msg, a, "vs", b); } else console.log("ok  ", msg, a.toPrecision(5)); }
function is(c, msg) { n++; if (!c) { f++; console.log("FAIL", msg); } else console.log("ok  ", msg); }
const w = R.props("water", 20), a = R.props("air", 20);
near(w.nu, 1.004e-6, 0.01, "water 20C kinematic viscosity"); near(w.rho, 998.2, 0.001, "water 20C density");
near(a.nu, 1.516e-5, 0.01, "air 20C kinematic viscosity"); near(a.rho, 1.204, 0.005, "air 20C density");
near(R.props("water", 0).mu, 1.792e-3, 0.03, "water 0C viscosity"); near(R.props("water", 100).mu, 0.282e-3, 0.03, "water 100C viscosity");
near(R.reynolds(w.rho, 1, 0.05, w.mu), 49800, 0.01, "water in a 5 cm pipe at 1 m/s");
is(R.regime("pipe", 2000).label === "Laminar" && R.regime("pipe", 3000).label === "Transitional" && R.regime("pipe", 1e4).label === "Turbulent", "pipe regimes");
is(R.regime("cylinder", 100).label === "Laminar vortex street", "cylinder at Re 100 sheds a laminar street");
near(R.darcy(1000, 0), 0.064, 1e-9, "laminar friction factor 64/Re");
near(R.darcy(1e5, 0), 0.0180, 0.05, "smooth pipe Re 1e5 friction factor (Blasius ~0.018)");
near(R.sphereDrag(1), 24 * 1.15 ** 1 * 1 / 1 * 1 === 0 ? 1 : 24 * (1 + 0.15), 0.01, "sphere drag at Re 1 (Schiller-Naumann ~ 27.6)");
near(R.strouhal(200), 0.1965, 0.03, "Strouhal at Re 200");
const p = R.props("water", 20), v = R.solveSpeed(2300, 0.05, p); near(R.reynolds(p.rho, v, 0.05, p.mu), 2300, 1e-9, "solve for speed round-trips");
near(R.solveLength(1000, 2, p), 1000 * p.mu / (p.rho * 2), 1e-9, "solve for length");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
