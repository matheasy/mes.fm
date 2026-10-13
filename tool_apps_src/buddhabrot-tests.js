"use strict";
var B = require("./buddhabrot/lib.js"), fails = 0;
function ok(c, m) { if (!c) { fails++; console.log("FAIL " + m); } else console.log("ok   " + m); }
function sum(b) { var s = 0; for (var i = 0; i < b.length; i++) s += b[i]; return s; }
function base(o) { var p = { n: 1, W: 100, H: 100, ps: 0.05, cr: 0, ci: 0, rot: false, pw: 2, lims: [100], min: 0, anti: false }; for (var k in o) p[k] = o[k]; return p; }
function run(p) { var bufs = p.lims.map(function () { return new Uint32Array(p.W * p.H); }), st = { s: 12345 }, r = B.accumulate(p, bufs, st); return { bufs: bufs, r: r }; }
/* c = 1: orbit 0, 1, 2, 5 -> escapes at step 3, so z1 = 1 and z2 = 2 are plotted (and their mirror images) */
var one = { x0: 1, x1: 1, y0: 0, y1: 0 };
var a = run(base({ box: one }));
ok(a.r.escaped === 1 && a.r.plotted === 4, "c = 1 escapes and plots z1, z2 and their mirrors (" + a.r.plotted + ")");
ok(a.bufs[0][50 * 100 + 70] === 2 && a.bufs[0][50 * 100 + 90] === 2, "unrotated: z1 = 1 sits at x = 50 + 1/0.05 = 70, z2 = 2 at 90 on the middle row (counted twice: z and its mirror land in the same pixel on the axis)");
var rot = run(base({ box: one, rot: true }));
ok(rot.bufs[0][(50 + 20) * 100 + 50] === 2 && rot.bufs[0][(50 + 40) * 100 + 50] === 2, "rotated: the real axis points DOWN (the tip at -2 is the topknot), z1 = 1 is 20 rows below the centre, z2 = 2 is 40 rows down");
/* points that never escape plot nothing (c = -1 is a 2-cycle); c = -2 stays at 2 */
ok(run(base({ box: { x0: -1, x1: -1, y0: 0, y1: 0 } })).r.plotted === 0, "c = -1 (a cycle) is not plotted");
ok(run(base({ box: { x0: 0.1, x1: 0.2, y0: 0.05, y1: 0.1 }, n: 500 })).r.tried === 500 && run(base({ box: { x0: 0.1, x1: 0.2, y0: 0.05, y1: 0.1 }, n: 500 })).r.escaped === 0, "points of the main cardioid are skipped and never counted as escaping");
/* anti mode: the same cardioid points ARE plotted, as long orbits */
var an = run(base({ box: { x0: 0.1, x1: 0.2, y0: 0.05, y1: 0.1 }, n: 20, anti: true, lims: [50] }));
ok(an.r.plotted > 0 && an.r.escaped === 0, "anti: orbits that stay bounded are plotted (" + an.r.plotted + " dots)");
/* every dot lands somewhere when the window is wide: counts add up to the reported plotted */
var wide = run(base({ n: 2000, W: 400, H: 400, ps: 0.01, cr: -0.5, lims: [200] }));
ok(sum(wide.bufs[0]) === wide.r.plotted && wide.r.plotted > 0, "buffer total equals the plotted count (" + wide.r.plotted + ")");
/* mirror symmetry about the real axis */
var sym = true; for (var y = 0; y < 400; y++) for (var x = 0; x < 400; x++) if (wide.bufs[0][y * 400 + x] !== wide.bufs[0][(399 - y) * 400 + x]) sym = false;
ok(sym, "the picture is exactly symmetric about the real axis");
/* determinism and a different seed */
var d1 = run(base({ n: 500, lims: [100] })), d2 = run(base({ n: 500, lims: [100] }));
ok(sum(d1.bufs[0]) === sum(d2.bufs[0]), "same seed, same picture");
/* channels nest: an orbit that needs n steps appears in the channels whose limit is >= n only */
var c26 = { x0: 0.26, x1: 0.26, y0: 0, y1: 0 }, zr = 0, n26 = 0; for (var k = 1; k < 5000; k++) { zr = zr * zr + 0.26; if (zr * zr > 4) { n26 = k; break; } }
var ch = run(base({ box: c26, lims: [n26 - 1, n26, n26 + 100] }));
ok(n26 > 20 && sum(ch.bufs[0]) === 0 && sum(ch.bufs[1]) > 0 && sum(ch.bufs[2]) === sum(ch.bufs[1]), "c = 0.26 escapes at step " + n26 + ": missing from a limit one short, present at the limit and above");
ok(sum(ch.bufs[1]) === 2 * (n26 - 1), "it plots n - 1 = " + (n26 - 1) + " points, twice (mirror) = " + sum(ch.bufs[1]));
/* minimum iterations drops short escapes */
ok(run(base({ box: one, min: 5 })).r.plotted === 0 && run(base({ box: one, min: 3 })).r.plotted === 4, "min iterations: escape in 3 steps is dropped with min 5, kept with min 3");
/* powers: cubic and quartic orbits iterate with the right formula */
var o3 = B.orbit(1, 0, 3, 50), o4 = B.orbit(1, 0, 4, 50), o2 = B.orbit(-0.5, 0.5, 2, 5);
ok(o3.n === 3 && o3.pts[2][0] === 2 && o3.pts[3][0] === 9, "z^3 + 1 orbit is 0, 1, 2, 9 (escapes at step 3)");
ok(o4.n === 3 && o4.pts[3][0] === 17, "z^4 + 1 orbit is 0, 1, 2, 17");
ok(Math.abs(o2.pts[1][0] + 0.5) < 1e-12 && Math.abs(o2.pts[2][0] - (0.25 - 0.25 - 0.5)) < 1e-12 && Math.abs(o2.pts[2][1] - (2 * -0.5 * 0.5 + 0.5)) < 1e-12, "complex step is right: (-0.5 + 0.5i)^2 + (-0.5 + 0.5i)");
var cub = run(base({ pw: 3, n: 800, lims: [60], W: 200, H: 200, ps: 0.02 })), qua = run(base({ pw: 4, n: 800, lims: [60], W: 200, H: 200, ps: 0.02 }));
ok(cub.r.plotted > 0 && qua.r.plotted > 0, "cubic and quartic Buddhabrots plot dots");
/* a worker string is self-contained: evaluate it with a fake self */
var msgs = [], self2 = { postMessage: function (m) { msgs.push(m); }, onmessage: null };
new Function("self", "setTimeout", B.WORKER_SRC)(self2, function () {});
self2.onmessage({ data: { cmd: "start", id: 7, seed: 99, p: base({ lims: [50, 5], W: 60, H: 60, ps: 0.06 }) } });
self2.onmessage({ data: { cmd: "stop" } });
ok(msgs.length === 1 && msgs[0].id === 7 && msgs[0].bufs.length === 2 && msgs[0].tot.tried > 0, "worker source runs on its own and posts its buffers (" + (msgs[0] && msgs[0].tot.tried) + " samples)");
/* tone mapping */
var buf = new Uint32Array(100); for (var i = 0; i < 100; i++) buf[i] = i < 50 ? 0 : i;
ok(B.scaleOf(buf, 1.0) >= 98 && B.scaleOf(buf, 0.5) >= 70 && B.scaleOf(new Uint32Array(10), 0.99) === 1, "scaleOf picks a percentile of the non-zero counts");
var out = new Uint32Array(3); B.shade([new Uint32Array([0, 50, 100])], { lut: B.lut("grey"), scales: [100], bright: 1, gamma: 1 }, out);
ok((out[0] & 255) === 0 && (out[2] & 255) === 255 && Math.abs((out[1] & 255) - 127) <= 2, "grey shading is linear from black to white");
B.shade([new Uint32Array([100, 0]), new Uint32Array([0, 100]), new Uint32Array([0, 0])], { scales: [100, 100, 100], bright: 1, gamma: 1 }, out = new Uint32Array(2));
ok((out[0] & 255) === 255 && ((out[0] >> 8) & 255) === 0 && ((out[1] >> 8) & 255) === 255, "RGB shading sends channel 0 to red and channel 1 to green");
B.shade([new Uint32Array([20, 60, 100])], { lut: B.lut("grey"), scales: [100], bright: 1, gamma: 1, black: 0.2 }, out = new Uint32Array(3));
ok((out[0] & 255) === 0 && (out[2] & 255) === 255 && (out[1] & 255) > 120 && (out[1] & 255) < 135, "the black level cuts the haze: 20% of the scale becomes black, the rest is stretched");
console.log(fails ? fails + " FAILED" : "buddhabrot-tests: all OK"); process.exit(fails ? 1 : 0);
