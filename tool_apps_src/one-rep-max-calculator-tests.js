// node tool_apps_src/one-rep-max-calculator-tests.js
const RM = require("./one-rep-max-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-6 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(RM.num("102,5"), 102.5, "comma"); eq(RM.lbToKg(225), 102.0582, "lb", 1e-4);
// 100 kg x 5: Epley 116.67, Brzycki 112.5, Lander 100/(101.3-13.356)=113.7, Lombardi 100*5^.1=117.5, O'Conner 112.5
eq(RM.est("epley", 100, 5), 100 * (1 + 5 / 30), "epley"); eq(RM.est("brzycki", 100, 5), 112.5, "brzycki"); eq(RM.est("lander", 100, 5), 100 * 100 / (101.3 - 2.67123 * 5), "lander"); eq(RM.est("lombardi", 100, 5), 100 * Math.pow(5, 0.1), "lombardi"); eq(RM.est("oconner", 100, 5), 112.5, "oconner");
eq(RM.est("mayhew", 100, 5), 100 * 100 / (52.2 + 41.9 * Math.exp(-0.275)), "mayhew"); eq(RM.est("wathan", 100, 5), 10000 / (48.8 + 53.8 * Math.exp(-0.375)), "wathan");
ORDER = RM.ORDER; ORDER.forEach(id => eq(RM.est(id, 100, 1), 100, "1 rep = the weight (" + id + ")")); eq(RM.est("epley", 100, 0), null, "0 reps"); eq(RM.est("epley", 100, 2.5), null, "fractional reps"); eq(RM.est("epley", 0, 5), null, "zero weight"); eq(RM.est("brzycki", 100, 37), null, "brzycki 37 reps"); eq(RM.est("zzz", 100, 5), null, "unknown");
ORDER.forEach(id => { const a = RM.est(id, 100, 8), b = RM.est(id, 100, 3); eq(a > b && b >= 100, true, "more reps, higher max (" + id + ")"); });
const m = RM.mean(100, 5); eq(m > 110 && m < 120, true, "mean in range (" + m.toFixed(1) + ")"); const r = RM.range(100, 5); eq(r.lo <= m && m <= r.hi, true, "mean within range"); eq(r.hi - r.lo < 8, true, "formulas agree within 8 kg at 5 reps");
eq(RM.reliability(3), "high", "3"); eq(RM.reliability(8), "good", "8"); eq(RM.reliability(12), "fair", "12"); eq(RM.reliability(20), "low", "20");
// inverse: the weight for 1 rep is the 1RM; 5 reps ~ 86%; 10 reps ~ 75%
eq(RM.weightForReps(100, 1), 100, "1 rep"); eq(RM.pct(5) > 84 && RM.pct(5) < 88, true, "5RM about 86% (" + RM.pct(5).toFixed(1) + ")"); eq(RM.pct(10) > 72 && RM.pct(10) < 78, true, "10RM about 75% (" + RM.pct(10).toFixed(1) + ")"); eq(RM.pct(1), 100, "pct 1"); for (let k = 2; k <= 20; k++) eq(RM.pct(k) < RM.pct(k - 1), true, "decreasing " + k);
eq(Math.abs(RM.repsAtPercent(RM.pct(7)) - 7) < 0.01, true, "inverse round trip"); eq(RM.repsAtPercent(100), 1, "100% = 1 rep"); eq(RM.repsAtPercent(10), 30, "capped at 30");
eq(RM.roundTo(101.3, 2.5), 102.5, "round 2.5"); eq(RM.roundTo(101.2, 2.5), 100, "round down"); eq(RM.roundTo(101.2, 0), 101.2, "no rounding");
// plates: 100 kg on a 20 kg bar = 40 per side = 25 + 15; 102.5 = 41.25 per side = 25 + 15 + 1.25
eq(RM.plates(100, 20, "kg").side, [25, 15], "100 kg"); eq(RM.plates(102.5, 20, "kg").side, [25, 15, 1.25], "102.5 kg"); eq(RM.plates(100, 20, "kg").loaded, 100, "loaded"); eq(RM.plates(20, 20, "kg").side, [], "empty bar"); eq(RM.plates(15, 20, "kg").short, 5, "below the bar");
eq(RM.plates(225, 45, "lb").side, [45, 45], "225 lb = two 45s per side"); eq(RM.plates(135, 45, "lb").side, [45], "135 lb"); eq(RM.plates(101.3, 20, "kg").off, 0.3, "cannot make 101.3 kg: 0.3 off", 1e-9); eq(RM.plates(60, 20, "kg", [20]).side, [20], "custom plate set");
eq(RM.level("m", "bench", 1.3).name, "Intermediate", "bench 1.3x"); eq(RM.level("m", "bench", 0.3).name, "Untrained", "under beginner"); eq(RM.level("m", "bench", 2.5).next, null, "elite has no next"); eq(RM.level("f", "squat", 1.3).name, "Intermediate", "f squat"); eq(RM.level("m", "nope", 1), null, "unknown lift"); eq(RM.level("m", "squat", 1.0).name, "Beginner", "squat 1.0x"); eq(RM.level("m", "squat", 1.0).next.name, "Novice", "next level");
["m", "f"].forEach(s => Object.keys(RM.LIFTS).forEach(l => { const a = RM.STANDARDS[s][l]; eq(a.every((x, i) => i === 0 || x > a[i - 1]), true, "standards increase " + s + l); }));
console.log(n + " checks, " + f + " failed"); process.exit(f ? 1 : 0);
