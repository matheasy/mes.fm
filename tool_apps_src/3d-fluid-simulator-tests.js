/* node tool_apps_src/3d-fluid-simulator-tests.js */
const F = require("./3d-fluid-simulator/lib.js");
let fails = 0, n = 0; function ok(c, m) { n++; if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); }
function finite(f) { for (const a of [f.u, f.v, f.w, f.s, f.T, f.c, f.q]) for (let k = 0; k < a.length; k++) if (!isFinite(a[k])) return false; return true; }
function make(id, base) {
	const P = F.BYID[id], d = P.dims.map((x) => Math.round(x * base)), f = new F.Fluid3(d[0], d[1], d[2]);
	f.mode = P.mode; f.beta = P.beta; f.vort = P.vort; f.U = P.U; f.rebuild(); f.clear(); return { f, P, d };
}
// 1. plume: smoke rises and stays finite
{
	const { f, d } = make("plume", 32); f.heaters.push({ x: d[0] / 2, y: 3, z: d[2] / 2, r: 3, T: 1, s: 1, c: 0.3 });
	let t = Date.now(); for (let i = 0; i < 120; i++) f.step(); const ms = (Date.now() - t) / 120;
	const st = f.stats();
	ok(finite(f), "plume stays finite"); ok(st.smokeY > 8, "plume smoke has risen (mean height " + st.smokeY.toFixed(1) + ")"); ok(st.vmax > 0.1 && st.vmax < 5, "plume speeds sensible (" + st.vmax.toFixed(2) + ")");
	console.log("   plume 32x48x32:", ms.toFixed(1), "ms/step");
}
// 2. projection leaves little divergence in a closed box
{
	const { f, d } = make("stir", 24); f.splat(12, 12, 12, 1.5, 0.5, -0.8, 3, 1, 0.5, 0); for (let i = 0; i < 40; i++) f.step();
	const st = f.stats(); ok(finite(f), "stir stays finite"); ok(st.divmax < 0.25, "divergence small after projection (" + st.divmax.toExponential(2) + ")"); ok(st.vmax > 0.02, "stirred flow persists");
}
// 3. sphere in a tunnel: velocity zero inside, wake forms, finite
{
	const { f, d } = make("sphere", 24); f.setObstacle("sphere", d[0] * 0.3, d[1] / 2, d[2] / 2, 4); f.initUniform(); let t = Date.now(); for (let i = 0; i < 150; i++) f.step(); const ms = (Date.now() - t) / 150;
	let bad = 0, inside = 0; for (let k = 0; k < f.N; k++) if (f.type[k] === 1 && !(f.u[k] === 0 && f.v[k] === 0 && f.w[k] === 0)) bad++;
	for (let k = 0; k < f.N; k++) if (f.obst[k]) inside++;
	ok(finite(f), "sphere tunnel stays finite"); ok(inside > 100 && bad === 0, "velocity is zero inside the sphere (" + inside + " cells)");
	const k0 = Math.round(d[0] * 0.3 + 7) + f.sy * Math.round(d[1] / 2) + f.sz * Math.round(d[2] / 2);
	ok(f.u[k0] < 0.95 * f.U, "wake behind the sphere is slower than the wind (u " + f.u[k0].toFixed(2) + ")");
	console.log("   sphere 48x24x24:", ms.toFixed(1), "ms/step");
}
// 4. smoke ring: a pulse makes a ring that travels along its axis
{
	const { f, d } = make("ring", 28); f.fire(d[0] / 2, d[1] / 2, 6, 0, 0, 1, 5, 0.9, 6, 0.2);
	function cz() { let sm = 0, sz = 0; for (let z = 1; z < d[2] - 1; z++) for (let y = 1; y < d[1] - 1; y++) for (let x = 1; x < d[0] - 1; x++) { const s = f.s[x + f.sy * y + f.sz * z]; sm += s; sz += s * z; } return sz / sm; }
	for (let i = 0; i < 10; i++) f.step(); const a = cz(); for (let i = 0; i < 50; i++) f.step(); const b = cz();
	ok(finite(f), "ring stays finite"); ok(b > a + 2, "ring travels along its axis (" + a.toFixed(1) + " -> " + b.toFixed(1) + ")");
}
// 5. speed at the sizes the page offers
for (const base of [24, 32, 40, 48]) { const { f, d } = make("plume", base); f.heaters.push({ x: d[0] / 2, y: 3, z: d[2] / 2, r: 3, T: 1, s: 1, c: 0.3 }); for (let i = 0; i < 5; i++) f.step(); const t = Date.now(); for (let i = 0; i < 15; i++) f.step(); console.log("   plume base", base, d.join("x"), ((Date.now() - t) / 15).toFixed(1), "ms/step"); }
console.log(fails ? fails + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(fails ? 1 : 0);
