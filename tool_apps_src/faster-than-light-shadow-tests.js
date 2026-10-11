/* node tool_apps_src/faster-than-light-shadow-tests.js */
const F = require("./faster-than-light-shadow-simulator/lib.js");
let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
function near(a, b, rel, m) { ok(Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300), m + " (" + a + " vs " + b + ")"); }
const C = F.C;
/* the Moon: critical sweep rate c/D = 0.78 rad/s = 44.7 deg/s */
near(F.criticalRate(384400e3), 0.77993, 1e-4, "moon critical rate rad/s"); near(F.criticalRate(384400e3) * 180 / Math.PI, 44.69, 1e-3, "moon deg/s");
near(F.spotAxisSpeed(F.criticalRate(1e7), 1e7), C, 1e-12, "critical sweep gives c");
near(F.fingerNeeded(1, 384400e3), 0.77993, 1e-4, "finger at 1 m needs 0.78 m/s"); near(F.shadowSpeed(F.fingerNeeded(2, 1e9), 2, 1e9), C, 1e-12, "shadow at critical finger speed = c");
/* spotSpeed on axis = phi'; sec^2 factor off axis */
near(F.spotSpeed(0, 3, 1), 3, 1e-12, "on-axis"); near(F.spotSpeed(0.5, 0, 1), 0, 1e-12, "zero rate");
/* compare the closed form with a numerical derivative of arrival position over arrival time, constant sweep rate w */
for (const [w, Dr] of [[0.3, 1], [2, 1], [5, 1], [1, 0.4], [-1.5, 0.7]]) {
	const phi = (t) => w * t, ta = (t) => t + Dr / Math.cos(phi(t)), y = (t) => Math.tan(phi(t));
	for (const t of [0.1, 0.3, -0.2]) { const e = 1e-6, num = (y(t + e) - y(t - e)) / (ta(t + e) - ta(t - e)); near(F.spotSpeed(phi(t), w, Dr), num, 1e-5, "closed form vs finite difference w=" + w + " Dr=" + Dr + " t=" + t); }
}
/* Hist + spots: sweep at 4 rad/T0 from the axis: the spot must be at tan(phi) with v ~ 4 at t just after arrival of phi~0 */
{
	const h = 1 / 480, H = new F.Hist(h, 4000); let t = 0;
	for (let i = 0; i < 480 * 3; i++) { H.push(0.8 * (i * h) - 1.2); }     // phi = 0.8 t - 1.2, so phi = 0 at t=1.5
	const sp = F.spots(H, 2.5, 1, null, 1.2); ok(sp.length >= 1, "a spot exists");
	if (sp.length) { const s = sp[0]; near(s.te + 1 / Math.cos(s.phi), 2.5, 1e-3, "arrival time matches"); near(s.y, Math.tan(s.phi), 1e-9, "y=tan"); near(s.v, F.spotSpeed(s.phi, 0.8, 1), 1e-3, "spot speed"); }
	/* fast sweep: more than c */
	const H2 = new F.Hist(h, 4000); for (let i = 0; i < 480 * 3; i++) H2.push(2 * (i * h) - 2);
	const s2 = F.spots(H2, 2.2, 1, null, 1.2); ok(s2.length >= 1 && Math.abs(s2[0].v) > 1, "fast sweep -> faster than c");
	/* a reversing sweep makes pairs of spots at once (the spot is created in pairs) */
	const H3 = new F.Hist(h, 4000); let ph = -0.9, dir = 1; for (let i = 0; i < 480 * 3; i++) { ph += dir * 3 * h; if (ph > 0.9) { ph = 1.8 - ph; dir = -1; } H3.push(ph); }
	let maxN = 0; for (let tt = 0.5; tt < 2.9; tt += 0.01) maxN = Math.max(maxN, F.spots(H3, tt, 1, null, 1.4).length); ok(maxN >= 1, "spots on a reversing sweep");
}
/* shadow: finger at d=0.25 moving up at speed vf (D per T0); the shadow edge speed on axis is vf/d */
{
	const h = 1 / 480, d = 0.25, vf = 0.5, H = new F.Hist(h, 4000); for (let i = 0; i < 480 * 3; i++) H.push(vf * (i * h) - 0.4 * d);
	const sp = F.spots(H, 2, 1 - d, (y) => Math.atan(y / d), 1.2); ok(sp.length >= 1, "shadow spot"); if (sp.length) { const s = sp[0]; near(s.v, F.spotSpeed(s.phi, (vf / d) / (1 + (s.y * 0) + Math.pow(Math.tan(s.phi), 2)), 1 - d), 2e-3, "shadow speed from finger speed"); }
}
/* parsing */
near(F.parseLen("384,400 km"), 384400e3, 1e-12, "km"); near(F.parseLen("1 AU"), 149597870700, 1e-12, "au"); near(F.parseLen("2.5 million ly"), 2.5e6 * 9460730472580800, 1e-12, "million ly"); near(F.parseLen("10 m"), 10, 1e-12, "m"); near(F.parseLen("5 light-seconds"), 5 * C, 1e-12, "light-seconds");
ok(F.parseLen("banana") === null, "bad length"); near(F.parseLen("1e6 km"), 1e9, 1e-12, "sci");
near(F.parseRate("90 deg/s"), Math.PI / 2, 1e-12, "deg/s"); near(F.parseRate("1 rad/s"), 1, 1e-12, "rad/s"); near(F.parseRate("60 rpm"), 2 * Math.PI, 1e-12, "rpm"); near(F.parseRate("45"), Math.PI / 4, 1e-12, "bare = deg/s"); near(F.parseRate("1 turn per second"), 2 * Math.PI, 1e-12, "turn per second");
near(F.parseSpeed("0.78 m/s"), 0.78, 1e-12, "m/s"); near(F.parseSpeed("36 km/h"), 10, 1e-12, "km/h"); near(F.parseSpeed("0.5 c"), C / 2, 1e-12, "c"); near(F.parseSpeed("10 mph"), 4.4704, 1e-12, "mph");
ok(/c$/.test(F.fmtC(C * 3.2)) && F.fmtC(C * 3.2) === "3.20 c", "fmtC " + F.fmtC(C * 3.2)); ok(F.fmtLen(384400e3) === "384,400 km", "fmtLen " + F.fmtLen(384400e3)); ok(F.fmtTime(1.282) === "1.28 s", "fmtTime " + F.fmtTime(1.282));
console.log(bad ? bad + " of " + n + " FAILED" : "all " + n + " checks passed"); process.exit(bad ? 1 : 0);
