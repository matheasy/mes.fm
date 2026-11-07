// node tool_apps_src/relative-speed-calculator-tests.js
const RS = require("./relative-speed-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? (isFinite(b) ? Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1, Math.abs(b)) : a === b) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
// parsing
eq(RS.parseLen("1.75 m"), 1.75, "m"); eq(RS.parseLen("20 mm"), 0.02, "mm"); eq(RS.parseLen("5 ft 9 in"), 1.7526, "ft in", 1e-12); eq(RS.parseLen("5'9\""), 1.7526, "5'9\"", 1e-12); eq(RS.parseLen("6 feet"), 1.8288, "feet", 1e-12); eq(RS.parseLen("2", "cm"), 0.02, "default unit");
eq(RS.parseLen("x"), null, "junk len"); eq(RS.parseLen("0 m"), null, "zero len"); eq(RS.parseLen("3 parsecs"), null, "unknown unit");
eq(RS.parseSpeed("100 km/h"), 100 / 3.6, "km/h"); eq(RS.parseSpeed("60 mph"), 26.8224, "mph", 1e-12); eq(RS.parseSpeed("8 ft/s"), 2.4384, "ft/s", 1e-12); eq(RS.parseSpeed("2,5 m/s"), 2.5, "decimal comma"); eq(RS.parseSpeed("10 miles per hour"), 4.4704, "words", 1e-12); eq(RS.parseSpeed("3", "m/s"), 3, "bare");
eq(RS.parseMass("4 kg"), 4, "kg"); eq(RS.parseMass("20 g"), 0.02, "g"); eq(RS.parseMass("3 mg"), 3e-6, "mg"); eq(RS.parseMass("10 lb"), 4.5359237, "lb", 1e-12);
// speed: tiger beetle 2.5 m/s, 20 mm -> 125 BL/s, at 1.75 m = 218.75 m/s = 787.5 km/h; Froude fair = 2.5*sqrt(87.5)
const b = RS.find(RS.RUNNERS, "tigerbeetle"); eq(RS.bodyLengths(b.v, b.L), 125, "beetle BL/s", 1e-12); eq(RS.scaledSpeed(b.v, b.L, 1.75) * 3.6, 787.5, "beetle at human size km/h", 1e-12);
eq(RS.froudeSpeed(b.v, b.L, 1.75), 2.5 * Math.sqrt(87.5), "Froude speed"); eq(RS.froude(RS.froudeSpeed(b.v, b.L, 1.75), 1.75), RS.froude(b.v, b.L), "Froude number kept", 1e-12);
eq(Math.round(RS.bodyLengths(0.225, 0.0007)), 321, "mite about 322 BL/s"); eq(Math.round(RS.bodyLengths(0.855, 0.0079)), 108, "silver ant 108 BL/s");
RS.RUNNERS.forEach(r => eq(r.v > 0 && r.L > 0 && !!r.name, true, "runner ok " + r.id));
// jump
eq(RS.takeoffUp(0.18), Math.sqrt(2 * 9.80665 * 0.18), "flea takeoff"); eq(RS.takeoffLong(8.95), Math.sqrt(9.80665 * 8.95), "long jump takeoff");
eq(RS.pushG(RS.takeoffUp(0.18), 0.0004), 0.18 / 0.0004, "flea push g = h/push", 1e-12); eq(isNaN(RS.pushG(1, 0)), true, "no push");
const fl = RS.find(RS.JUMPERS, "flea"); eq(fl.h / fl.L * 1.75, 157.5, "flea at human size 157.5 m", 1e-12);
RS.JUMPERS.forEach(j => eq(j.h > 0 && j.L > 0 && j.push > 0 && (j.kind === "up" || j.kind === "long"), true, "jumper ok " + j.id));
// fall
const c = RS.find(RS.FALLERS, "cat"), hu = RS.find(RS.FALLERS, "human");
const vtc = RS.terminal(c.m, c.cda), vth = RS.terminal(hu.m, hu.cda);
eq(vtc > 25 && vtc < 30, true, "cat terminal about 27 m/s (" + vtc.toFixed(1) + ")"); eq(vth > 50 && vth < 56, true, "skydiver about 53 m/s (" + vth.toFixed(1) + ")");
eq(RS.impactSpeed(1e-6, 30), Math.sqrt(2 * 9.80665 * 1e-6), "short drop = no drag", 1e-5); eq(RS.impactSpeed(1e5, 30), 30, "long drop = terminal", 1e-9);
eq(RS.impactSpeed(RS.heightFor(20, 30), 30), 20, "heightFor inverts impactSpeed", 1e-12); eq(RS.heightFor(30, 30), Infinity, "never reach terminal");
eq(RS.impactSpeed(10, 30) < RS.noDragSpeed(10), true, "drag slows");
// fall time: integrate numerically
(function () { const vt = 27, h = 50; let t = 0, y = 0, v = 0, dt = 1e-5; while (y < h) { const a = 9.80665 * (1 - v * v / (vt * vt)); v += a * dt; y += v * dt; t += dt; } eq(RS.fallTime(h, vt), t, "fall time matches integration", 1e-3); eq(RS.impactSpeed(h, vt), v, "impact speed matches integration", 1e-3); })();
// mouse barely hurt: its terminal speed is like a person falling only a few metres
const mo = RS.find(RS.FALLERS, "mouse"), hm = RS.heightFor(RS.terminal(mo.m, mo.cda), vth); eq(hm > 3 && hm < 8, true, "mouse terminal = person from " + hm.toFixed(1) + " m");
eq(RS.terminal(8, 0.36) / RS.terminal(1, 0.09), Math.sqrt(2), "square-cube: double size -> sqrt2 faster", 1e-12);
RS.FALLERS.forEach(x => eq(x.m > 0 && x.cda > 0 && x.L > 0, true, "faller ok " + x.id));
// formatting
eq(RS.fmtLen(0.002), "2 mm", "mm"); eq(RS.fmtLen(157.5), "158 m", "m"); eq(RS.fmtLen(1.75, true), "5.74 ft", "ft"); eq(RS.fmtSpeed(218.75), "788 km/h", "km/h"); eq(RS.fmtSpeed(26.8224, true), "60 mph", "mph"); eq(RS.round(1234567), "1,234,567", "commas");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
