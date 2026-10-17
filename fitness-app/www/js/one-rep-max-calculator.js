/* MES One-Rep Max Calculator -- pure maths (no DOM). Browser global `RM`; node: require('./tool_apps_src/one-rep-max-calculator/lib.js'); tests: node tool_apps_src/one-rep-max-calculator-tests.js */
(function (root) {
	"use strict";
	var LB = 0.45359237;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	/* ---------- estimating a one-rep max from a set of w x r ---------- */
	var FORMULAS = {
		epley: { name: "Epley", f: function (w, r) { return w * (1 + r / 30); }, note: "w x (1 + reps / 30). Popular and good up to about 10 reps." },
		brzycki: { name: "Brzycki", f: function (w, r) { return r >= 37 ? null : w * 36 / (37 - r); }, note: "w x 36 / (37 - reps). Very accurate under 10 reps." },
		lander: { name: "Lander", f: function (w, r) { return 100 * w / (101.3 - 2.67123 * r); }, note: "100w / (101.3 - 2.67 x reps)." },
		lombardi: { name: "Lombardi", f: function (w, r) { return w * Math.pow(r, 0.10); }, note: "w x reps^0.10. Tends to read a little low." },
		mayhew: { name: "Mayhew", f: function (w, r) { return 100 * w / (52.2 + 41.9 * Math.exp(-0.055 * r)); }, note: "Fitted on bench press data." },
		oconner: { name: "O'Conner", f: function (w, r) { return w * (1 + 0.025 * r); }, note: "w x (1 + 0.025 x reps)." },
		wathan: { name: "Wathan", f: function (w, r) { return 100 * w / (48.8 + 53.8 * Math.exp(-0.075 * r)); }, note: "Similar to Mayhew with a different fit." }
	};
	var ORDER = ["epley", "brzycki", "lander", "lombardi", "mayhew", "oconner", "wathan"];
	function valid(w, r) { return w > 0 && w < 1500 && r >= 1 && r <= 30 && Math.floor(r) === r; }
	function est(id, w, r) { if (!valid(w, r) || !FORMULAS[id]) return null; if (r === 1) return w; var v = FORMULAS[id].f(w, r); return v > 0 && isFinite(v) ? v : null; }
	function all(w, r) { var o = {}; ORDER.forEach(function (id) { o[id] = est(id, w, r); }); return o; }
	function mean(w, r) { var v = ORDER.map(function (id) { return est(id, w, r); }).filter(function (x) { return x != null; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }
	function range(w, r) { var v = ORDER.map(function (id) { return est(id, w, r); }).filter(function (x) { return x != null; }); return { lo: Math.min.apply(null, v), hi: Math.max.apply(null, v) }; }
	// reliability: estimates are decent up to ~10 reps and poor beyond ~12
	function reliability(r) { return r <= 5 ? "high" : r <= 10 ? "good" : r <= 12 ? "fair" : "low"; }
	/* ---------- the other way: what can I lift for r reps? (average of Epley and Brzycki, inverted) ---------- */
	function weightForReps(rm, r) { if (r <= 1) return rm; var e = rm / (1 + r / 30), b = r >= 37 ? e : rm * (37 - r) / 36; return (e + b) / 2; }
	function pct(r) { return weightForReps(1, r) * 100; }                       // % of 1RM for r reps
	function repsAtPercent(p) { var lo = 1, hi = 30, i; if (p >= 100) return 1; if (pct(30) >= p) return 30; for (i = 0; i < 50; i++) { var m = (lo + hi) / 2; if (pct(m) > p) lo = m; else hi = m; } return (lo + hi) / 2; }
	function roundTo(x, step) { return step > 0 ? Math.round(x / step) * step : x; }
	// training zones by % of 1RM
	var ZONES = [{ id: "str", name: "Max strength", lo: 85, hi: 100, reps: "1-5", note: "Heavy singles, doubles and triples; long rests (3-5 min)." }, { id: "hyp", name: "Muscle growth (hypertrophy)", lo: 67, hi: 85, reps: "6-12", note: "Moderate weight, 2-3 min rests, close to failure." }, { id: "end", name: "Muscular endurance", lo: 40, hi: 67, reps: "12-25+", note: "Light weight, short rests, high reps." }];
	/* ---------- plates ---------- */
	var PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5], lb: [45, 35, 25, 10, 5, 2.5, 1.25] };
	var BARS = { kg: [20, 15, 10], lb: [45, 35, 25] };
	// plates for one side of the bar; leftover is what cannot be made with the available plates (per side)
	function plates(target, bar, unit, have) {
		var list = (have || PLATES[unit] || PLATES.kg).slice().sort(function (a, b) { return b - a; }), side = (target - bar) / 2, out = [];
		if (!(side > 0)) return { side: [], loaded: bar, short: Math.max(0, bar - target) };
		var left = side + 1e-9; list.forEach(function (p) { while (left >= p - 1e-9) { out.push(p); left -= p; } });
		var loaded = bar + 2 * out.reduce(function (a, b) { return a + b; }, 0); return { side: out, loaded: loaded, short: 0, off: target - loaded };
	}
	// bodyweight-relative strength standards (approximate community figures)
	var LIFTS = { squat: "Squat", bench: "Bench press", deadlift: "Deadlift", ohp: "Overhead press" };
	var LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
	var STANDARDS = { m: { bench: [0.5, 0.75, 1.25, 1.75, 2.0], squat: [0.75, 1.25, 1.75, 2.25, 2.75], deadlift: [1.0, 1.5, 2.0, 2.5, 3.0], ohp: [0.35, 0.55, 0.8, 1.05, 1.3] }, f: { bench: [0.25, 0.5, 0.75, 1.25, 1.5], squat: [0.5, 0.75, 1.25, 1.75, 2.25], deadlift: [0.5, 1.0, 1.5, 2.0, 2.5], ohp: [0.2, 0.35, 0.5, 0.75, 0.95] } };
	function level(sex, lift, ratio) { var s = (STANDARDS[sex] || STANDARDS.m)[lift]; if (!s) return null; var i = -1; for (var k = 0; k < s.length; k++) if (ratio >= s[k] - 1e-9) i = k; return { index: i, name: i < 0 ? "Untrained" : LEVELS[i], next: i + 1 < s.length ? { name: LEVELS[i + 1], ratio: s[i + 1] } : null }; }
	var RM = { num: num, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, FORMULAS: FORMULAS, ORDER: ORDER, valid: valid, est: est, all: all, mean: mean, range: range, reliability: reliability, weightForReps: weightForReps, pct: pct, repsAtPercent: repsAtPercent, roundTo: roundTo, ZONES: ZONES, PLATES: PLATES, BARS: BARS, plates: plates, LIFTS: LIFTS, LEVELS: LEVELS, STANDARDS: STANDARDS, level: level };
	if (typeof module !== "undefined" && module.exports) module.exports = RM; else root.RM = RM;
})(typeof window !== "undefined" ? window : this);

/* MES One-Rep Max Calculator -- mes.fm/one-rep-max-calculator (UI; maths in lib.js, global RM).
 * localStorage "mes-one-rep-max-calculator:v1" = { u, w, r, lift, bw, sex, step, bar }. Links: ?w=&r=&u=kg|lb&lift=&bw=&sex= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("rm"); if (!root || !window.RM) return;
	var KEY = "mes-one-rep-max-calculator:v1";
	var EXAMPLES = [["100 kg x 5", { u: "kg", w: "100", r: "5", lift: "bench" }], ["225 lb x 8", { u: "lb", w: "225", r: "8", lift: "squat" }], ["80 kg x 10", { u: "kg", w: "80", r: "10", lift: "" }]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { u: "kg", w: "", r: "5", lift: "", bw: "", sex: "m", step: "2.5", bar: "20" };
	function clean(s) { var o = { u: s.u === "lb" ? "lb" : "kg", w: String(s.w || "").slice(0, 8), r: String(s.r || "").replace(/\D/g, "").slice(0, 2), lift: RM.LIFTS[s.lift] ? s.lift : "", bw: String(s.bw || "").slice(0, 8), sex: s.sex === "f" ? "f" : "m", step: String(s.step == null ? "2.5" : s.step).slice(0, 5), bar: String(s.bar || "20").slice(0, 4) }; return o; }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) st = clean(s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search); if (!q.has("w")) return false; var u = q.get("u") === "lb" ? "lb" : "kg"; st = clean({ u: u, w: q.get("w"), r: q.get("r") || "5", lift: q.get("lift"), bw: q.get("bw"), sex: q.get("sex") || st.sex, step: u === st.u ? st.step : (u === "lb" ? "5" : "2.5"), bar: u === st.u ? st.bar : (u === "lb" ? "45" : "20") }); return true; }
	function toast(msg) { var t = $("rm-toast"); if (!t) { t = document.createElement("div"); t.id = "rm-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }
	function opts() {
		var steps = st.u === "kg" ? [["0", "No rounding"], ["1", "1 kg"], ["1.25", "1.25 kg"], ["2.5", "2.5 kg"], ["5", "5 kg"]] : [["0", "No rounding"], ["1", "1 lb"], ["2.5", "2.5 lb"], ["5", "5 lb"], ["10", "10 lb"]];
		$("rm-step").innerHTML = steps.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join(""); if (!steps.some(function (s) { return s[0] === st.step; })) st.step = st.u === "kg" ? "2.5" : "5";
		$("rm-bar").innerHTML = RM.BARS[st.u].map(function (b) { return '<option value="' + b + '">' + b + " " + st.u + (b === RM.BARS[st.u][0] ? " (standard)" : "") + "</option>"; }).join(""); if (RM.BARS[st.u].indexOf(+st.bar) < 0) st.bar = String(RM.BARS[st.u][0]);
	}
	function syncAll() { opts(); $("rm-w").value = st.w; $("rm-r").value = st.r; $("rm-lift").value = st.lift; $("rm-bw").value = st.bw; $("rm-step").value = st.step; $("rm-bar").value = st.bar; $("rm-wu").textContent = st.u; [].forEach.call(root.querySelectorAll(".rm-u2"), function (e) { e.textContent = st.u; }); [].forEach.call($("rm-u").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.u)); }); [].forEach.call($("rm-sex").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === st.sex)); }); if (st.lift || st.bw) $("rm-more").open = true; }
	$("rm-w").addEventListener("input", function () { st.w = this.value; save(); update(); }); $("rm-r").addEventListener("input", function () { st.r = this.value.replace(/\D/g, "").slice(0, 2); save(); update(); });
	$("rm-rm").onclick = function () { st.r = String(Math.max(1, (+st.r || 2) - 1)); $("rm-r").value = st.r; save(); update(); }; $("rm-rp").onclick = function () { st.r = String(Math.min(30, (+st.r || 0) + 1)); $("rm-r").value = st.r; save(); update(); };
	$("rm-u").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || b.dataset.u === st.u) return; var from = st.u, to = b.dataset.u; function cv(v) { var n = RM.num(v); return n > 0 ? RM.trim(from === "kg" ? RM.kgToLb(n) : RM.lbToKg(n), 1) : ""; } st.w = cv(st.w); st.bw = cv(st.bw); st.u = to; st.step = to === "lb" ? "5" : "2.5"; st.bar = String(RM.BARS[to][0]); save(); syncAll(); update(); });
	$("rm-lift").addEventListener("change", function () { st.lift = this.value; save(); update(); }); $("rm-bw").addEventListener("input", function () { st.bw = this.value; save(); update(); }); $("rm-step").addEventListener("change", function () { st.step = this.value; save(); update(); }); $("rm-bar").addEventListener("change", function () { st.bar = this.value; save(); plateView(); });
	$("rm-sex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.sex = b.dataset.s; save(); syncAll(); update(); });
	$("rm-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("rm-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var x = EXAMPLES[+b.dataset.i][1]; st = clean(Object.assign({}, st, x, { step: x.u === "lb" ? "5" : "2.5", bar: x.u === "lb" ? "45" : "20", bw: "" })); save(); syncAll(); update(); });
	$("rm-ref").innerHTML = "<thead><tr><th>Formula</th><th>How it works</th></tr></thead><tbody>" + RM.ORDER.map(function (id) { return "<tr><td><b>" + RM.FORMULAS[id].name + "</b></td><td>" + esc(RM.FORMULAS[id].note) + "</td></tr>"; }).join("") + "</tbody>";
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null, U = function () { return st.u; };
	function R(x) { return RM.roundTo(x, +st.step || 0); }
	function show(x, d) { return RM.trim(x, d == null ? (+st.step && +st.step % 1 === 0 ? 0 : 1) : d); }
	function update() {
		var w = RM.num(st.w), r = +st.r, ok = RM.valid(w, r); $("rm-empty").hidden = ok; $("rm-out").hidden = !ok; cur = null; if (!ok) return;
		var m = RM.mean(w, r), rg = RM.range(w, r), rel = RM.reliability(r); cur = { w: w, r: r, m: m, rg: rg };
		$("rm-hero").innerHTML = stat("Estimated 1RM", show(R(m), 1) + " <small>" + U() + "</small>", "average of 7 formulas", "tu-stat--hero") + stat("Range", show(rg.lo, 1) + "&ndash;" + show(rg.hi, 1) + " <small>" + U() + "</small>", "lowest to highest formula") + stat("Your set", show(w, 1) + " &times; " + r, Math.round(w / m * 100) + "% of your max") + stat("Reliability", rel === "high" ? "High" : rel === "good" ? "Good" : rel === "fair" ? "Fair" : "Low", r <= 10 ? "sets of 1&ndash;10 reps are accurate" : "over 10 reps, treat as a rough guide");
		$("rm-verdict").innerHTML = "Your estimated one-rep max is about <b>" + show(R(m), 1) + " " + U() + "</b> (" + show(RM[U() === "kg" ? "kgToLb" : "lbToKg"](m), 0) + (U() === "kg" ? " lb" : " kg") + "). " + (r === 1 ? "A single rep is your max by definition." : r > 12 ? '<span class="rm-warn">Estimates above 12 reps are unreliable: try a heavier set of 3&ndash;8 reps for a better number.</span>' : "A set of " + r + " at " + show(w, 1) + " " + U() + " is about " + Math.round(w / m * 100) + "% of that.");
		formulas(); curve(); zones(); setTgt(); lvl();
	}
	function formulas() {
		var A = RM.all(cur.w, cur.r), ids = RM.ORDER.slice().sort(function (a, b) { return A[b] - A[a]; }), W = 640, rowH = 28, H = 16 + ids.length * rowH + 20, L = 96, Rm = 70, mx = Math.max.apply(null, ids.map(function (i) { return A[i]; })) * 1.08, mn = cur.w * 0.9, X = function (v) { return L + (v - mn) / (mx - mn) * (W - L - Rm); }, s = "";
		ids.forEach(function (id, i) { var y = 8 + i * rowH; s += '<text class="rm-lbl" x="' + (L - 8) + '" y="' + (y + 14) + '" text-anchor="end">' + RM.FORMULAS[id].name + '</text><rect class="rm-bar' + (i === 0 ? " is-top" : "") + '" x="' + L + '" y="' + y + '" width="' + Math.max(2, X(A[id]) - L) + '" height="19" rx="4"><title>' + RM.FORMULAS[id].name + ": " + RM.trim(A[id], 1) + " " + U() + '</title></rect><text class="rm-val" x="' + (X(A[id]) + 6) + '" y="' + (y + 14) + '">' + show(A[id], 1) + "</text>"; });
		s += '<line class="rm-avg" x1="' + X(cur.m) + '" x2="' + X(cur.m) + '" y1="4" y2="' + (H - 18) + '"/><text class="rm-ct" x="' + X(cur.m) + '" y="' + (H - 4) + '" text-anchor="middle">average ' + show(cur.m, 1) + " " + U() + "</text>"; $("rm-formulas").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	var cv = null;
	function curve() {
		var W = 640, H = 250, L = 46, Rm = 12, T = 12, B = 30, maxR = 20, m = cur.m, lo = Math.floor(RM.weightForReps(m, maxR) * 0.9 / 5) * 5, hi = Math.ceil(m * 1.04 / 5) * 5, X = function (r) { return L + (r - 1) / (maxR - 1) * (W - L - Rm); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); }, s = "";
		var zs = [["str", 1, RM.repsAtPercent(85)], ["hyp", RM.repsAtPercent(85), RM.repsAtPercent(67)], ["end", RM.repsAtPercent(67), maxR]]; zs.forEach(function (z) { var a = Math.max(1, z[1]), b = Math.min(maxR, z[2]); if (b > a) s += '<rect class="rm-z-' + z[0] + '" x="' + X(a) + '" y="' + T + '" width="' + (X(b) - X(a)) + '" height="' + (H - T - B) + '"/>'; });
		var step = hi - lo > 80 ? 20 : 10; for (var g = Math.ceil(lo / step) * step; g <= hi; g += step) s += '<line class="rm-gl" x1="' + L + '" x2="' + (W - Rm) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text class="rm-ct" x="' + (L - 5) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + "</text>";
		for (var r = 1; r <= maxR; r += (r === 1 ? 4 : 5)) s += '<text class="rm-ct" x="' + X(r) + '" y="' + (H - 10) + '" text-anchor="middle">' + r + "</text>";
		var pts = []; for (var q = 1; q <= maxR; q++) pts.push(X(q) + "," + Y(RM.weightForReps(m, q))); s += '<polyline class="rm-line" points="' + pts.join(" ") + '"/><circle class="rm-dot" cx="' + X(Math.min(maxR, cur.r)) + '" cy="' + Y(Math.max(lo, Math.min(hi, cur.w))) + '" r="6" style="fill:#1e2733"><title>your set</title></circle><g id="rm-hov" hidden><line class="rm-cross" y1="' + T + '" y2="' + (H - B) + '"/><circle class="rm-dot" r="5"/></g><text class="rm-ct" x="' + (W - Rm) + '" y="' + (H - 1) + '" text-anchor="end">reps &rarr; weight (' + U() + "); red = strength, amber = size, green = endurance</text>";
		$("rm-curve").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>"; cv = { X: X, Y: Y, W: W, L: L, Rm: Rm, maxR: maxR };
		var rows = []; for (var p = 100; p >= 50; p -= 5) { var rr = RM.repsAtPercent(p), zid = p >= 85 ? "str" : p >= 67 ? "hyp" : "end"; rows.push('<tr class="rm-r-' + zid + '"><td>' + p + "%</td><td><b>" + show(R(m * p / 100), 1) + " " + U() + "</b></td><td>" + (p === 100 ? "1" : "about " + Math.round(rr)) + "</td></tr>"); }
		$("rm-table").innerHTML = "<thead><tr><th>% of 1RM</th><th>Weight</th><th>Reps you can do</th></tr></thead><tbody>" + rows.join("") + "</tbody>";
	}
	function hover(ev) { if (!cv || !cur) return; var svg = $("rm-curve").querySelector("svg"); if (!svg) return; var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * cv.W, k = Math.max(1, Math.min(cv.maxR, Math.round(1 + (x - cv.L) / (cv.W - cv.L - cv.Rm) * (cv.maxR - 1)))), v = RM.weightForReps(cur.m, k), g = $("rm-hov"); if (!g) return; g.hidden = false; g.querySelector("line").setAttribute("x1", cv.X(k)); g.querySelector("line").setAttribute("x2", cv.X(k)); var c = g.querySelector("circle"); c.setAttribute("cx", cv.X(k)); c.setAttribute("cy", cv.Y(v)); $("rm-readout").innerHTML = "<b>" + k + (k === 1 ? " rep" : " reps") + "</b>: about <b>" + show(R(v), 1) + " " + U() + "</b> (" + Math.round(v / cur.m * 100) + "% of your max)"; }
	$("rm-curve").addEventListener("mousemove", hover); $("rm-curve").addEventListener("touchmove", function (e) { if (e.touches[0]) hover(e.touches[0]); }, { passive: true });
	function zones() { $("rm-zones").innerHTML = "<thead><tr><th>Goal</th><th>% of 1RM</th><th>Weight</th><th>Reps</th><th>Notes</th></tr></thead><tbody>" + RM.ZONES.map(function (z) { return "<tr><td><b>" + z.name + "</b></td><td>" + z.lo + "&ndash;" + z.hi + "%</td><td>" + show(R(cur.m * z.lo / 100), 1) + "&ndash;" + show(R(cur.m * z.hi / 100), 1) + " " + U() + "</td><td>" + z.reps + "</td><td>" + esc(z.note) + "</td></tr>"; }).join("") + "</tbody>"; }
	/* ---------- plates ---------- */
	var PCTS = [100, 95, 90, 85, 80, 75, 70, 60]; $("rm-pcts").innerHTML = PCTS.map(function (p) { return '<button type="button" class="tu-chip" data-p="' + p + '">' + p + "%</button>"; }).join("");
	$("rm-pcts").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || !cur) return; $("rm-tgt").value = RM.trim(R(cur.m * +b.dataset.p / 100), 2); $("rm-tgt").dataset.auto = "0"; plateView(); });
	$("rm-tgt").addEventListener("input", plateView);
	function setTgt() { if (!$("rm-tgt").value || $("rm-tgt").dataset.auto !== "0") { $("rm-tgt").value = RM.trim(R(cur.m * 0.8), 2); } plateView(); }
	$("rm-tgt").addEventListener("input", function () { this.dataset.auto = "0"; });
	function plateView() {
		var t = RM.num($("rm-tgt").value), bar = +st.bar; if (!cur || !(t > 0)) { $("rm-plates").innerHTML = ""; $("rm-platetxt").textContent = ""; return; }
		var P = RM.plates(t, bar, st.u), W = 640, H = 120, cy = 60, s = '<rect x="20" y="' + (cy - 5) + '" width="600" height="10" rx="4" fill="#9aa5b1"/><rect x="40" y="' + (cy - 14) + '" width="12" height="28" rx="2" fill="#6a7280"/><rect x="588" y="' + (cy - 14) + '" width="12" height="28" rx="2" fill="#6a7280"/>';
		function cls(p) { var kg = st.u === "kg" ? p : p * 0.4536; return kg >= 25 ? "rm-pl25" : kg >= 20 ? "rm-pl20" : kg >= 15 ? "rm-pl15" : kg >= 10 ? "rm-pl10" : kg >= 5 ? "rm-pl5" : kg >= 2.5 ? "rm-pl2" : kg >= 1 ? "rm-pl1" : "rm-pl0"; }
		function hgt(p) { var kg = st.u === "kg" ? p : p * 0.4536; return Math.max(26, Math.min(108, 26 + kg * 3.3)); }
		var x = 58; P.side.forEach(function (p) { var h = hgt(p), wd = Math.max(8, Math.min(20, 6 + p * (st.u === "kg" ? 0.5 : 0.25))); s += '<rect class="' + cls(p) + '" x="' + x + '" y="' + (cy - h / 2) + '" width="' + wd + '" height="' + h + '" rx="3"><title>' + p + " " + st.u + '</title></rect><text x="' + (x + wd / 2) + '" y="' + (cy + 3) + '" text-anchor="middle" font-size="9" font-weight="700" fill="' + (cls(p) === "rm-pl5" || cls(p) === "rm-pl0" || cls(p) === "rm-pl1" ? "#1e2733" : "#fff") + '" transform="rotate(-90 ' + (x + wd / 2) + " " + cy + ')">' + p + "</text>"; x += wd + 2; });
		$("rm-plates").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plates on one side of the bar">' + s + "</svg>";
		var counts = {}; P.side.forEach(function (p) { counts[p] = (counts[p] || 0) + 1; }); var txt = Object.keys(counts).sort(function (a, b) { return b - a; }).map(function (p) { return counts[p] + " × " + p + " " + st.u; }).join(" + ");
		$("rm-platetxt").innerHTML = P.short > 0 ? '<span class="rm-warn">That is lighter than the ' + bar + " " + st.u + " bar.</span>" : "<b>Each side:</b> " + (txt || "no plates (empty bar)") + ". Total <b>" + RM.trim(P.loaded, 2) + " " + st.u + "</b> on a " + bar + " " + st.u + " bar" + (Math.abs(P.off || 0) > 0.001 ? ' <span class="rm-warn">(' + RM.trim(Math.abs(P.off), 2) + " " + st.u + " short of " + RM.trim(t, 2) + " with standard plates)</span>" : "") + ".";
	}
	$("rm-bar").addEventListener("change", plateView);
	function lvl() {
		var bw = RM.num(st.bw), box = $("rm-lvlbox"); if (!st.lift || !(bw > 0)) { box.hidden = true; return; } box.hidden = false;
		var ratio = cur.m / bw, L = RM.level(st.sex, st.lift, ratio), S = RM.STANDARDS[st.sex][st.lift];
		var h = "<p style=\"margin:0 0 0.4em;\">Your <b>" + RM.LIFTS[st.lift].toLowerCase() + "</b> of about <b>" + show(R(cur.m), 1) + " " + U() + "</b> at a body weight of " + show(bw, 1) + " " + U() + " is <b>" + RM.trim(ratio, 2) + "&times; body weight</b>: <b>" + L.name + "</b>.</p><div class=\"rm-lv\">" + RM.LEVELS.map(function (n, i) { return '<span class="' + (i === L.index ? "is-on" : i < L.index ? "is-past" : "") + '">' + n + "<br>" + S[i] + "&times;</span>"; }).join("") + "</div>";
		if (L.next) h += "<p style=\"margin:0.4em 0 0;\">For <b>" + L.next.name + "</b> you would need about <b>" + show(R(L.next.ratio * bw), 1) + " " + U() + "</b>.</p>"; h += '<p class="tu-note" style="margin:0.6em 0 0;">Approximate bodyweight-relative standards from common strength-training tables, for a lifter training for a few months to a few years. Not official.</p>'; $("rm-lvl").innerHTML = h;
	}
	$("rm-link").onclick = function () { if (cur) copy("https://mes.fm" + "/one-rep-max-calculator?w=" + encodeURIComponent(st.w) + "&r=" + st.r + "&u=" + st.u + (st.lift ? "&lift=" + st.lift : "") + (RM.num(st.bw) > 0 ? "&bw=" + encodeURIComponent(st.bw) + "&sex=" + st.sex : ""), "Link copied"); };
	$("rm-copy").onclick = function () { if (!cur) return; var l = ["% of 1RM\tWeight (" + st.u + ")\tReps"]; for (var p = 100; p >= 50; p -= 5) l.push(p + "%\t" + show(R(cur.m * p / 100), 1) + "\t" + (p === 100 ? 1 : Math.round(RM.repsAtPercent(p)))); copy(l.join("\n"), "Copied: paste it into a spreadsheet"); };
	load(); if (fromUrl()) { save(); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
	syncAll(); $("rm-tgt").dataset.auto = "1"; update();
})();
