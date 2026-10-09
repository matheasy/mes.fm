/* node tool_apps_src/fluid-simulator-tests.js -- solver checks: no NaN, divergence removed, Taylor-Green decay, vortex shedding behind a cylinder, box + tunnel sanity */
const F = require("./fluid-simulator/lib.js");
let fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); }
function setup(id, H) {
	const P = F.BYID[id], ny = H, nx = Math.round(H * P.aspect), f = new F.Fluid(nx, ny);
	f.mode = P.mode; f.U = P.U; f.lidU = P.lid ? P.U : 0; f.beta = P.beta || 0; f.vort = P.vort || 0;
	if (P.shape) f.setShape(P.shape); else f.rebuild();
	f.nu = F.nuFor(P.U, P.lref * ny, P.Re);
	if (P.probe && P.shape) { const D = P.shape.size * ny; f.probe = { x: P.shape.cx * nx + P.probe[0] * D - 0.0, y: P.probe[1] * ny + 0.7 * D * 0.5 }; }
	f.clearFields();
	return { f, P, nx, ny };
}
function finite(f) { for (const a of [f.u, f.v, f.r, f.g, f.b, f.T, f.q]) for (let k = 0; k < a.length; k++) if (!isFinite(a[k])) return false; return true; }

// 1. Taylor-Green: energy decay vs exact exp(-4 nu k^2 t)
{
	const { f, nx } = setup("taylor", 64); f.initTaylorGreen(0.3); f.U = 0.3; f.nu = 0.05;
	const e0 = f.stats().ke; let steps = 0; const nu = f.nu;
	for (; steps < 900; steps++) f.step();
	const ratio = f.stats().ke / e0, exact = F.taylorEnergy(nu, nx, steps);
	console.log("   TGV nu", nu.toFixed(4), "sim", ratio.toFixed(4), "exact", exact.toFixed(4));
	ok(finite(f), "taylor-green stays finite");
	ok(Math.abs(ratio - exact) / exact < 0.35, "taylor-green energy within 35% of the exact decay (numerical diffusion adds a little)");
	ok(f.stats().divmax < 0.1, "taylor-green divergence small (" + f.stats().divmax.toExponential(2) + ")");
}
// 1b. inviscid smooth flow must not gain energy
{
	const f = new F.Fluid(64, 64); f.mode = "periodic"; f.nu = 0; f.rebuild(); f.initTaylorGreen(0.3); const e0 = f.stats().ke;
	for (let s = 0; s < 1500; s++) f.step();
	ok(f.stats().ke <= e0 * 1.02, "inviscid Taylor-Green does not gain energy (" + (f.stats().ke / e0).toFixed(2) + "x)");
}
// 2. projection removes divergence in a box
{
	const { f } = setup("cavity", 48); f.U = 1.2; f.lidU = 1.2; f.bndVel();
	for (let s = 0; s < 120; s++) f.step();
	const st = f.stats();
	ok(finite(f), "cavity stays finite"); ok(st.divmax < 0.25, "cavity divergence small (" + st.divmax.toExponential(2) + ")");
	ok(st.vmax > 0.2 && st.vmax < 3, "cavity speeds sensible (" + st.vmax.toFixed(2) + ")");
	// lid drives a clockwise eddy: u near the top positive, near the bottom negative
	const S = f.S, top = f.u[(48 - 3) * S + 24], bot = f.u[4 * S + 24];
	ok(top > 0.1 && bot < 0, "cavity: flow goes with the lid at the top (" + top.toFixed(2) + ") and back along the bottom (" + bot.toFixed(2) + ")");
}
// 3. cylinder: wake sheds vortices at a Strouhal number near 0.2
{
	const { f, P, ny } = setup("cylinder", 64), D = P.shape.size * ny;
	f.initUniform(P.U, 0.05);
	for (let s = 0; s < 2600; s++) f.step();
	const per = f.period(), St = per ? D / (P.U * per) : 0;
	console.log("   cylinder: period", per.toFixed(1), "steps, St", St.toFixed(3), "crossings", f.cross.length);
	ok(finite(f), "cylinder stays finite");
	ok(per > 0, "cylinder: a steady shedding period is found");
	ok(St > 0.12 && St < 0.27, "cylinder: Strouhal number plausible (" + St.toFixed(3) + ")");
	ok(f.stats().divmax < 0.3, "cylinder divergence small (" + f.stats().divmax.toExponential(2) + ")");
}
// 4. solid cells stay at rest, box mode keeps dye bounded
{
	const { f } = setup("tunnel", 48); f.paintSolid(30, 24, 5, true); f.initUniform(1.4, 0);
	for (let s = 0; s < 150; s++) f.step();
	let bad = 0; for (let k = 0; k < f.N; k++) if (f.solid[k] && (f.u[k] !== 0 || f.v[k] !== 0)) bad++;
	ok(bad === 0, "velocity is zero inside drawn walls"); ok(finite(f), "drawn wall stays finite");
}
{
	const { f } = setup("plume", 48); f.rebuild();
	for (let s = 0; s < 200; s++) { f.splat(24, 4, 0, 0, 3, [0.3, 0.3, 0.3], 0.5); f.step(); }
	ok(finite(f), "plume stays finite"); ok(f.stats().vmax > 0.05, "plume rises (speed " + f.stats().vmax.toFixed(2) + ")");
}
{
	const { f } = setup("shear", 48); f.initShear(1.0);
	for (let s = 0; s < 400; s++) f.step();
	ok(finite(f), "shear layer stays finite");
}
{
	const { f } = setup("merge", 48); f.initVortices(40, 0.28);
	for (let s = 0; s < 400; s++) f.step();
	ok(finite(f), "vortex merger stays finite");
}
console.log(fails ? fails + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(fails ? 1 : 0);
