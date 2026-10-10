/* MES Atomic Clock Simulator -- mes.fm/atomic-clock-simulator
 * UI around MESAtomic (lib.js: line shapes, locked-clock stability, servo loop, clock ladder, drift maths).
 * Five tabs: How it works (live servo loop), Fountain & fringes (Ramsey), Clock race, Stability chart, Drift calculator.
 * State: localStorage mes-atomic-clock-simulator:v1; share links ?tab=&c=&T=&snr=&f=&t=&per=. All maths lives in lib.js (node-tested).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("ac");
	if (!root) return;
	var A = window.MESAtomic;
	var KEY = "mes-atomic-clock-simulator:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var NU0 = A.NU0;
	var saved = sget(), q = new URLSearchParams(location.search);
	var TABS = ["loop", "fringe", "bloch", "fountain", "race", "stab", "drift"];
	var COL = { bg: "#070d1f", line: "#26325a", text: "#e6ecfb", dim: "#93a1c4", gold: "#fbbf24", cyan: "#22d3ee", blue: "#60a5fa", grey: "#94a3b8", red: "#f87171", grid: "rgba(147,161,196,0.16)" };
	var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;

	/* ---------------- state ---------------- */
	function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }
	var S = {
		tab: TABS.indexOf(q.get("tab")) >= 0 ? q.get("tab") : (TABS.indexOf(saved.tab) >= 0 ? saved.tab : "loop"),
		type: /^(beam|fountain)$/.test(q.get("c") || saved.type || "") ? (q.get("c") || saved.type) : "fountain",
		gain: clamp(num(saved.gain) || 0.3, 0.02, 0.9), speed: clamp(num(saved.speed) || 12, 1, 60),
		T: clamp(num(q.get("T")) || num(saved.T) || 0.5, 0.001, 10), temp: clamp(num(saved.temp) || 2, 0.2, 50), snr: clamp(num(q.get("snr")) || num(saved.snr) || 300, 10, 3000), det: 0.15,
		rabi: saved.rabi !== false, hidden: saved.hidden || {}, raceSpeed: num(saved.raceSpeed) || 31557600,
		frac: A.parseFraction(q.get("f") || saved.frac || "5 ppm"), target: A.parseTime(q.get("t") || saved.target || "1 s"), per: /^(day|week|month|year)$/.test(q.get("per") || saved.per || "") ? (q.get("per") || saved.per) : "month"
	};
	if (!isFinite(S.frac)) S.frac = 5e-6; if (!isFinite(S.target) || S.target <= 0) S.target = 1;
	function save() { sset({ temp: S.temp, tab: S.tab, type: S.type, gain: S.gain, speed: S.speed, T: S.T, snr: S.snr, rabi: S.rabi, hidden: S.hidden, raceSpeed: S.raceSpeed, frac: S.frac, target: S.target, per: S.per }); }

	/* ---------------- shared helpers ---------------- */
	var toastT;
	function toast(msg) { var t = $("ac-toast"); if (!t) { t = document.createElement("div"); t.id = "ac-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copy(text, ok) {
		function fallback() { prompt("Copy this:", text); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(ok || "Copied"); }, fallback); else fallback();
	}
	function hz(x) { var a = Math.abs(x); if (a >= 1e6) return A.fmtSig(x / 1e6, 3) + " MHz"; if (a >= 1e3) return A.fmtSig(x / 1e3, 3) + " kHz"; if (a >= 1) return A.fmtSig(x, 3) + " Hz"; if (a >= 1e-3) return A.fmtSig(x * 1e3, 3) + " mHz"; return A.fmtSig(x * 1e6, 3) + " µHz"; }
	function sgn(x) { return x > 0 ? "+" : x < 0 ? "−" : ""; }
	function sfrac(y) { return (y < 0 ? "−" : y > 0 ? "+" : "") + A.fmtFrac(Math.abs(y)); }
	function setup(canvas, w, h) {
		var dpr = Math.min(window.devicePixelRatio || 1, 2), c = canvas.getContext("2d");
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
		c.setTransform(dpr, 0, 0, dpr, 0, 0); return c;
	}
	function fontPx(w) { return clamp(Math.round(w / 62), 11, 15); }
	function sizeStage(stage, ratioWide, ratioNarrow) {
		var w = stage.clientWidth || 600; var h = w < 640 ? w * ratioNarrow : w * ratioWide; h = Math.max(h, 260); stage.style.height = Math.round(h) + "px"; return { w: w, h: h };
	}
	function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
	function label(c, txt, x, y, col, size, align) { c.fillStyle = col || COL.text; c.font = (size || 12) + "px system-ui,-apple-system,Segoe UI,Roboto,sans-serif"; c.textAlign = align || "left"; c.textBaseline = "middle"; c.fillText(txt, x, y); }
	function arrow(c, x1, y1, x2, y2, col, t) {
		c.strokeStyle = col || COL.dim; c.fillStyle = col || COL.dim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
		var a = Math.atan2(y2 - y1, x2 - x1); c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 8 * Math.cos(a - 0.4), y2 - 8 * Math.sin(a - 0.4)); c.lineTo(x2 - 8 * Math.cos(a + 0.4), y2 - 8 * Math.sin(a + 0.4)); c.closePath(); c.fill();
		if (t != null) { var L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.floor(L / 46)); c.fillStyle = COL.cyan; for (var i = 0; i < n; i++) { var u = ((t * 0.5 + i / n) % 1); c.beginPath(); c.arc(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, 2.4, 0, 6.3); c.fill(); } }
	}
	function toggleFull(wrapId, stageId, draw) {
		var w = $(wrapId); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); });
	}

	/* ---------------- clock-type presets for tab 1 ---------------- */
	var TYPES = {
		beam: { T: 0.010, snr: 300, rw: 2e-11, name: "Caesium beam", note: "Atoms fly 1 m through a tube at about 100 m/s: 10 ms between the two microwave pulses, so a line about 50 Hz wide." },
		fountain: { T: 0.5, snr: 300, rw: 1e-11, name: "Caesium fountain", note: "Atoms are tossed up about 0.3 m and fall back: 0.5 s between the pulses, so a line only 1 Hz wide, 50 times narrower." }
	};
	var loop = null, hist = { free: [], out: [] }, HN = 360, cyc = 0, loopPlaying = true;
	function lw() { return A.fringeWidth(TYPES[S.type].T); }          // fringe FWHM of the loop's clock (Hz)
	function newLoop(keepLock) {
		var t = TYPES[S.type], cap = 0.9 * (1 / (2 * t.T)) / NU0, wasLocked = keepLock && loop && loop.locked;
		loop = new A.Loop({ seed: 21 + Math.floor(Math.random() * 1000), dt: 1, sig1: A.sigma1s(lw(), t.snr, 1), rw: t.rw, gain: S.gain, y0: 0.3 * cap, capture: cap });
		if (wasLocked) loop.setLock(true);
		hist = { free: [], out: [] }; loop.x = 0; loop.xFree = 0;
		paintLockBtn();
	}
	function paintLockBtn() { var b = $("ac-lock"); b.setAttribute("aria-pressed", String(!!loop.locked)); b.textContent = loop.locked ? "🔓 Unlock (free-run the quartz)" : "🔒 Lock to the atoms"; }
	$("ac-lock").onclick = function () { loop.setLock(!loop.locked); loop.x = 0; loop.xFree = 0; paintLockBtn(); };
	$("ac-kick").onclick = function () { var cap = loop.capture; loop.kick((Math.random() < 0.5 ? -1 : 1) * 0.45 * cap); };
	$("ac-retune").onclick = function () { loop.retune(); loop.x = 0; loop.xFree = 0; };
	$("ac-loop-play").onclick = function () { loopPlaying = !loopPlaying; this.setAttribute("aria-pressed", String(loopPlaying)); this.textContent = loopPlaying ? "❚❚ Pause" : "▶ Play"; };
	$("ac-loop-reset").onclick = function () { newLoop(false); };
	$("ac-type").value = S.type;
	$("ac-type").onchange = function () { S.type = this.value; save(); $("ac-type-note").textContent = TYPES[S.type].note; newLoop(true); };
	$("ac-type-note").textContent = TYPES[S.type].note;
	$("ac-gain").value = S.gain; $("ac-gain-v").textContent = S.gain.toFixed(2);
	$("ac-gain").oninput = function () { S.gain = +this.value; $("ac-gain-v").textContent = S.gain.toFixed(2); if (loop) loop.gain = S.gain; save(); };
	$("ac-speed").value = S.speed; $("ac-speed-v").textContent = S.speed + " cycles per second";
	$("ac-speed").oninput = function () { S.speed = +this.value; $("ac-speed-v").textContent = S.speed + " cycles per second"; save(); };

	var atoms = []; for (var ai = 0; ai < 26; ai++) atoms.push({ u: ai / 26, flip: 0, dec: false });
	var animT = 0;

	function drawLoop(dt) {
		var st = $("ac-stage1"), dim = sizeStage(st, 0.56, 1.7), W = dim.w, H = dim.h, c = setup($("ac-loop"), W, H), fs = fontPx(W), narrow = W < 640;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var tcfg = TYPES[S.type], yA = loop.free + loop.corr, dA = yA * NU0, fw = lw();
		var P = A.fountainP(dA, tcfg.T);
		var dR = narrow ? { x: 0, y: 0, w: W, h: H * 0.34 } : { x: 0, y: 0, w: W * 0.6, h: H * 0.6 };
		var rR = narrow ? { x: 0, y: H * 0.34, w: W, h: H * 0.34 } : { x: W * 0.6, y: 0, w: W * 0.4, h: H * 0.6 };
		var sR = narrow ? { x: 0, y: H * 0.68, w: W, h: H * 0.32 } : { x: 0, y: H * 0.6, w: W, h: H * 0.4 };

		/* --- block diagram --- */
		(function () {
			var R = dR, px = function (x) { return R.x + R.w * x; }, py = function (y) { return R.y + R.h * y; };
			function box(x, y, w, h, title, sub, col) {
				c.fillStyle = "rgba(34,211,238,0.07)"; c.strokeStyle = col || COL.line; c.lineWidth = 1.5; rrect(c, px(x), py(y), R.w * w, R.h * h, 8); c.fill(); c.stroke();
				label(c, title, px(x + w / 2), py(y + h / 2) - (sub ? fs * 0.55 : 0), COL.text, fs + 1, "center"); if (sub) label(c, sub, px(x + w / 2), py(y + h / 2) + fs * 0.75, COL.dim, fs - 1.5, "center");
			}
			var Q = { x: 0.03, y: 0.12, w: 0.22, h: 0.24 }, Y = { x: 0.31, y: 0.12, w: 0.2, h: 0.24 };
			box(Q.x, Q.y, Q.w, Q.h, "Quartz", "10 MHz", loop.locked ? COL.cyan : COL.grey); box(Y.x, Y.y, Y.w, Y.h, "Synthesiser", "× 919.26 → 9.19 GHz", COL.line);
			arrow(c, px(Q.x + Q.w), py(0.24), px(Y.x), py(0.24), COL.dim, animT);
			// atom tube
			var tx0 = px(0.58), tx1 = px(0.98), ty = py(0.3), th = R.h * 0.2;
			arrow(c, px(Y.x + Y.w), py(0.24), tx0 - 4, py(0.24), COL.gold, animT);
			c.fillStyle = "rgba(96,165,250,0.08)"; c.strokeStyle = COL.line; rrect(c, tx0, ty - th / 2, tx1 - tx0, th, 6); c.fill(); c.stroke();
			var a1 = tx0 + (tx1 - tx0) * 0.22, a2 = tx0 + (tx1 - tx0) * 0.62, aw = (tx1 - tx0) * 0.12;
			c.fillStyle = "rgba(251,191,36,0.22)"; c.strokeStyle = COL.gold; c.lineWidth = 1.2; c.fillRect(a1, ty - th * 0.9, aw, th * 1.8); c.strokeRect(a1, ty - th * 0.9, aw, th * 1.8); c.fillRect(a2, ty - th * 0.9, aw, th * 1.8); c.strokeRect(a2, ty - th * 0.9, aw, th * 1.8);
			label(c, "pulse 1", a1 + aw / 2, ty - th * 1.15, COL.gold, fs - 2, "center"); label(c, "pulse 2", a2 + aw / 2, ty - th * 1.15, COL.gold, fs - 2, "center");
			label(c, "atoms", tx0 + 4, ty + th * 0.95 + fs, COL.dim, fs - 2, "left");
			for (var i = 0; i < atoms.length; i++) {
				var a = atoms[i]; a.u += dt * 0.16; if (a.u >= 1) { a.u -= 1; a.dec = false; }
				if (!a.dec && a.u > 0.78) { a.dec = true; a.flip = Math.random() < P ? 1 : 0; }
				if (a.u < 0.76) a.dec = false;
				var ax = tx0 + 8 + (tx1 - tx0 - 16) * a.u, ay = ty + Math.sin(i * 12.9898) * th * 0.32;
				var col = (a.u > 0.78 && a.flip) ? COL.gold : COL.blue; c.fillStyle = col; c.globalAlpha = 0.92; c.beginPath(); c.arc(ax, ay, Math.max(2.2, W / 230), 0, 6.3); c.fill();
			}
			c.globalAlpha = 1;
			label(c, "detector", tx1 - 2, ty + th * 1.55 + fs * 0.2, COL.dim, fs - 2, "right");
			var Sv = { x: 0.56, y: 0.66, w: 0.28, h: 0.26 };
			box(Sv.x, Sv.y, Sv.w, Sv.h, "Servo", loop.locked ? (loop.lost ? "lost the line" : "locked") : "off", loop.locked ? (loop.lost ? COL.red : COL.cyan) : COL.grey);
			arrow(c, px(0.9), ty + th * 0.9 + 4 + fs * 1.2, px(0.9), py(Sv.y + 0.13), loop.locked ? COL.cyan : COL.line, loop.locked ? animT : null);
			c.strokeStyle = loop.locked ? COL.cyan : COL.line; c.lineWidth = 1.6; c.beginPath(); c.moveTo(px(0.9), py(Sv.y + 0.13)); c.lineTo(px(Sv.x + Sv.w), py(Sv.y + 0.13)); c.stroke();
			arrow(c, px(Sv.x), py(Sv.y + 0.13), px(Q.x + Q.w / 2), py(Sv.y + 0.13), loop.locked ? COL.cyan : COL.line, loop.locked ? animT : null);
			arrow(c, px(Q.x + Q.w / 2), py(Sv.y + 0.13), px(Q.x + Q.w / 2), py(Q.y + Q.h) + 3, loop.locked ? COL.cyan : COL.line, loop.locked ? animT : null);
			label(c, "steer", px(0.42), py(Sv.y + 0.13) + fs * 0.9, loop.locked ? COL.cyan : COL.dim, fs - 2, "center");
			// output counter
			var O = { x: 0.03, y: 0.62, w: 0.4, h: 0.3 };
			c.strokeStyle = COL.gold; c.lineWidth = 1.4; c.fillStyle = "rgba(251,191,36,0.07)"; rrect(c, px(O.x), py(O.y), R.w * O.w, R.h * O.h, 8); c.fill(); c.stroke();
			label(c, "Clock output", px(O.x + O.w / 2), py(O.y + 0.07), COL.gold, fs - 1, "center");
			label(c, A.fmtTime(loop.x, 3) + " off", px(O.x + O.w / 2), py(O.y + 0.17), COL.text, fs + 3, "center");
			label(c, "quartz alone: " + A.fmtTime(loop.xFree, 3), px(O.x + O.w / 2), py(O.y + 0.25), COL.dim, fs - 2, "center");
			arrow(c, px(Q.x + 0.05), py(Q.y + Q.h) + 2, px(Q.x + 0.05), py(O.y) - 2, COL.gold, animT);
		})();

		/* --- resonance --- */
		(function () {
			var R = rR, m = { l: 14, r: 12, t: 26, b: 28 }, x0 = R.x + m.l, x1 = R.x + R.w - m.r, y0 = R.y + R.h - m.b, y1 = R.y + m.t;
			var span = 3 * fw; function X(d) { return x0 + (clamp(d, -span, span) + span) / (2 * span) * (x1 - x0); } function Yp(p) { return y0 - p * (y0 - y1); }
			label(c, (rR.w < 330 ? "Resonance curve" : "Resonance: atoms flipped vs frequency"), R.x + R.w / 2, R.y + 12, COL.dim, fs - 1, "center");
			c.strokeStyle = COL.grid; c.lineWidth = 1; c.beginPath(); for (var g = -3; g <= 3; g++) { c.moveTo(X(g * fw), y1); c.lineTo(X(g * fw), y0); } c.stroke();
			c.strokeStyle = COL.line; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.stroke();
			// capture range
			var cap = loop.capture * NU0; c.fillStyle = "rgba(34,211,238,0.07)"; c.fillRect(X(-cap), y1, X(cap) - X(-cap), y0 - y1);
			c.strokeStyle = COL.gold; c.lineWidth = 2.2; c.beginPath(); for (var k = 0; k <= 240; k++) { var d = -span + 2 * span * k / 240, xx = X(d), yy = Yp(A.fountainP(d, tcfg.T)); if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke();
			// free quartz marker (grey) and servo-corrected (cyan)
			var df = loop.free * NU0;
			if (loop.locked) { c.strokeStyle = COL.grey; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(df), y1); c.lineTo(X(df), y0); c.stroke(); c.setLineDash([]); label(c, "quartz alone", clamp(X(df), x0 + 30, x1 - 30), y1 - 6, COL.grey, fs - 3, "center"); }
			var xm = X(dA), out = Math.abs(dA) > span; c.strokeStyle = loop.locked ? COL.cyan : COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(xm, y1); c.lineTo(xm, y0); c.stroke();
			c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(xm, Yp(out ? 0 : P), 5, 0, 6.3); c.fill();
			label(c, hz(dA), clamp(xm, x0 + 28, x1 - 28), y0 + 14, loop.locked ? COL.cyan : COL.gold, fs - 2, "center");
			label(c, "−" + hz(3 * fw), x0, y0 + 14, COL.dim, fs - 3, "left"); label(c, "+" + hz(3 * fw), x1, y0 + 14, COL.dim, fs - 3, "right");
			label(c, "100%", x0 + 2, y1 + 6, COL.dim, fs - 3, "left");
			if (loop.locked && !loop.lost) { c.fillStyle = COL.cyan; [-fw / 4, fw / 4].forEach(function (d) { c.beginPath(); c.arc(X(xm * 0 + d + dA), Yp(A.fountainP(d + dA, tcfg.T)), 3, 0, 6.3); c.fill(); }); }
		})();

		/* --- strip chart --- */
		(function () {
			var R = sR, m = { l: 76, r: 14, t: 22, b: 22 }, x0 = R.x + m.l, x1 = R.x + R.w - m.r, y0 = R.y + R.h - m.b, y1 = R.y + m.t;
			var cap = loop.capture, ymax = cap * 1.7; function Yv(v) { return (y0 + y1) / 2 - clamp(v, -ymax, ymax) / ymax * (y0 - y1) / 2; }
			label(c, "Frequency error, last " + HN + " seconds", R.x + R.w / 2, R.y + 10, COL.dim, fs - 1, "center");
			c.fillStyle = "rgba(34,211,238,0.06)"; c.fillRect(x0, Yv(cap), x1 - x0, Yv(-cap) - Yv(cap));
			c.strokeStyle = COL.line; c.lineWidth = 1; c.strokeRect(x0, y1, x1 - x0, y0 - y1);
			c.setLineDash([3, 4]); c.strokeStyle = "rgba(34,211,238,0.5)"; c.beginPath(); c.moveTo(x0, Yv(cap)); c.lineTo(x1, Yv(cap)); c.moveTo(x0, Yv(-cap)); c.lineTo(x1, Yv(-cap)); c.stroke();
			c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(x0, Yv(0)); c.lineTo(x1, Yv(0)); c.stroke(); c.setLineDash([]);
			label(c, "0", x0 - 6, Yv(0), COL.dim, fs - 2, "right"); label(c, "+" + A.fmtFrac(cap), x0 - 6, Yv(cap), COL.cyan, fs - 3, "right"); label(c, "−" + A.fmtFrac(cap), x0 - 6, Yv(-cap), COL.cyan, fs - 3, "right");
			label(c, "lock range", x1 - 4, Yv(cap) - 8, COL.cyan, fs - 3, "right");
			function trace(arr, col, lwid) { if (arr.length < 2) return; c.strokeStyle = col; c.lineWidth = lwid; c.beginPath(); for (var i = 0; i < arr.length; i++) { var xx = x1 - (arr.length - 1 - i) / (HN - 1) * (x1 - x0), yy = Yv(arr[i]); if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke(); }
			trace(hist.free, COL.grey, 1.4); trace(hist.out, loop.locked ? COL.cyan : COL.gold, 2);
			var lx = x0 + 8, ly = y1 + 12; c.fillStyle = COL.grey; c.fillRect(lx, ly - 2, 14, 3); label(c, "quartz alone", lx + 20, ly, COL.dim, fs - 2, "left");
			c.fillStyle = loop.locked ? COL.cyan : COL.gold; c.fillRect(lx + 100, ly - 2, 14, 3); label(c, "clock output", lx + 120, ly, COL.dim, fs - 2, "left");
		})();
	}

	function stepLoop(dtReal) {
		animT += dtReal;
		if (!loopPlaying) return;
		cyc += dtReal * S.speed; var n = 0;
		while (cyc >= 1 && n < 12) { cyc -= 1; n++; loop.step(); hist.free.push(loop.free); hist.out.push(loop.yOut); if (hist.free.length > HN) { hist.free.shift(); hist.out.shift(); } }
		if (cyc > 12) cyc = 0;
	}
	function readLoop() {
		var cap = loop.capture, yA = loop.free + loop.corr, P = A.fountainP(yA * NU0, TYPES[S.type].T);
		$("ac-status").textContent = !loop.locked ? "Off" : loop.lost ? "Lost lock" : "Locked"; $("ac-status").style.color = !loop.locked ? "" : loop.lost ? COL.red : COL.cyan;
		$("ac-status-s").textContent = !loop.locked ? "quartz free-running" : loop.lost ? "kicked off the line: press Re-tune" : "following the atoms";
		$("ac-yfree").textContent = sfrac(loop.free); $("ac-yout").textContent = sfrac(loop.yOut);
		$("ac-yout-s").textContent = hz(loop.yOut * NU0) + " at 9.19 GHz";
		$("ac-pflip").textContent = Math.round(P * 100) + "%";
		$("ac-day").textContent = A.fmtTime(loop.x, 3); $("ac-day-s").textContent = "quartz alone: " + A.fmtTime(loop.xFree, 3);
	}

	/* ================= tab 2: fountain + fringes ================= */
	function Tmap(v) { return 0.001 * Math.pow(10, 4 * v / 1000); }
	function TmapInv(T) { return Math.round(1000 * Math.log10(T / 0.001) / 4); }
	function Smap(v) { return 10 * Math.pow(300, v / 1000); }
	function SmapInv(s) { return Math.round(1000 * Math.log(s / 10) / Math.log(300)); }
	function fmtT(T) { return T < 1 ? A.fmtSig(T * 1000, 3) + " ms" : A.fmtSig(T, 3) + " s"; }
	$("ac-T").value = TmapInv(S.T); $("ac-snr").value = SmapInv(S.snr); $("ac-det").value = Math.round(S.det * 1000 / 2.5 * 1.0);
	var detSlider = 0.15;
	$("ac-det").value = Math.round(detSlider * 1000);
	function fringeVals() {
		var T = S.T, fw = A.fringeWidth(T), s1 = A.sigma1s(fw, S.snr, 1), span = 2.5 / T, det = (+$("ac-det").value / 1000) * span;
		return { T: T, fw: fw, s1: s1, span: span, det: det, Q: NU0 / fw, h: 9.80665 * T * T / 8 };
	}
	function paintFringeLabels() {
		var v = fringeVals();
		$("ac-T-v").textContent = fmtT(S.T); $("ac-snr-v").textContent = A.fmtSig(S.snr, 3); $("ac-det-v").textContent = (v.det >= 0 ? "+" : "−") + hz(Math.abs(v.det));
	}
	$("ac-T").oninput = function () { S.T = Tmap(+this.value); paintFringeLabels(); syncBT(); save(); };
	$("ac-snr").oninput = function () { S.snr = Smap(+this.value); paintFringeLabels(); save(); };
	$("ac-det").oninput = function () { paintFringeLabels(); };
	$("ac-rabi").checked = S.rabi; $("ac-rabi").onchange = function () { S.rabi = this.checked; save(); };
	[].forEach.call(document.querySelectorAll("[data-try]"), function (b) {
		b.onclick = function () { var t = b.getAttribute("data-try"); S.T = t === "tube" ? 0.01 : t === "nist" ? 0.5 : 5; S.snr = t === "space" ? 600 : 300; $("ac-T").value = TmapInv(S.T); $("ac-snr").value = SmapInv(S.snr); paintFringeLabels(); syncBT(); save(); };
	});
	var fPhase = 0;
	function drawFringe(dt) {
		var st = $("ac-stage2"), dim = sizeStage(st, 0.5, 1.5), W = dim.w, H = dim.h, c = setup($("ac-fr"), W, H), fs = fontPx(W), narrow = W < 640;
		var v = fringeVals(), tau = Math.min(0.01, v.T / 5);
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var fR = narrow ? { x: 0, y: 0, w: W, h: H * 0.5 } : { x: 0, y: 0, w: W * 0.32, h: H }, pR = narrow ? { x: 0, y: H * 0.5, w: W, h: H * 0.5 } : { x: W * 0.32, y: 0, w: W * 0.68, h: H };
		/* fountain */
		(function () {
			var R = fR, cx = R.x + R.w * (narrow ? 0.22 : 0.5), top = R.y + 22, bot = R.y + R.h - 20, cavY = bot - (bot - top) * 0.32, mot = bot - 6;
			var hpx = clamp((cavY - top - 14) * (0.15 + 0.85 * clamp(Math.log10(v.T * 1000) / 4, 0, 1)), 10, cavY - top - 14);
			label(c, "Caesium fountain", R.x + R.w / 2, R.y + 10, COL.dim, fs - 1, "center");
			c.strokeStyle = COL.line; c.lineWidth = 1.4; c.fillStyle = "rgba(96,165,250,0.05)"; rrect(c, cx - 26, top, 52, bot - top, 10); c.fill(); c.stroke();
			c.fillStyle = "rgba(251,191,36,0.18)"; c.strokeStyle = COL.gold; c.fillRect(cx - 40, cavY - 9, 80, 18); c.strokeRect(cx - 40, cavY - 9, 80, 18); label(c, "microwave cavity", cx + 46, cavY, COL.gold, fs - 3, "left");
			c.fillStyle = "rgba(251,191,36,0.35)"; c.beginPath(); c.arc(cx, mot, 9, 0, 6.3); c.fill(); label(c, "laser-cooled ball", cx + 46, mot, COL.dim, fs - 3, "left");
			c.strokeStyle = COL.dim; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(cx - 40, cavY - hpx); c.lineTo(cx + 40, cavY - hpx); c.stroke(); c.setLineDash([]); label(c, fmtH(v.h), cx + 46, cavY - hpx, COL.dim, fs - 3, "left");
			fPhase = (fPhase + dt / (3 + Math.min(4, Math.log10(v.T * 1000)))) % 1;
			var ph = fPhase, y, flip = false;
			if (ph < 0.18) { y = mot + (cavY - mot) * (ph / 0.18); } else if (ph < 0.82) { var u = (ph - 0.18) / 0.64; y = cavY - 4 * hpx * u * (1 - u); } else { var w2 = (ph - 0.82) / 0.18; y = cavY + (bot - 28 - cavY) * w2; flip = true; }
			var P = A.fountainP(v.det, v.T, tau);
			for (var i = 0; i < 36; i++) { var a = i * 2.399, r = 5 + 7 * Math.sqrt((i + 1) / 36), col = flip && ((i / 36) < P) ? COL.gold : COL.blue; c.fillStyle = col; c.globalAlpha = 0.85; c.beginPath(); c.arc(cx + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, 2, 0, 6.3); c.fill(); }
			c.globalAlpha = 1;
			if (Math.abs(ph - 0.18) < 0.05 || Math.abs(ph - 0.82) < 0.05) { c.strokeStyle = COL.gold; c.lineWidth = 2; c.strokeRect(cx - 40, cavY - 9, 80, 18); label(c, ph < 0.5 ? "pulse 1" : "pulse 2", cx - 46, cavY, COL.gold, fs - 2, "right"); }
			label(c, "T = " + fmtT(v.T), cx - 46, cavY - hpx / 2, COL.text, fs - 1, "right");
			label(c, "detect", cx - 32, bot - 6, COL.dim, fs - 3, "right");
		})();
		/* fringes */
		(function () {
			var R = pR, m = { l: 40, r: 14, t: 46, b: 38 }, x0 = R.x + m.l, x1 = R.x + R.w - m.r, y0 = R.y + R.h - m.b, y1 = R.y + m.t, span = v.span;
			function X(d) { return x0 + (d + span) / (2 * span) * (x1 - x0); } function Yp(p) { return y0 - p * (y0 - y1); }
			label(c, "Atoms flipped vs microwave frequency  (centre = 9,192,631,770 Hz)", R.x + R.w / 2, R.y + 12, COL.dim, fs - 1, "center");
			c.strokeStyle = COL.grid; c.lineWidth = 1; c.beginPath(); for (var g = 0; g <= 4; g++) { c.moveTo(x0, Yp(g / 4)); c.lineTo(x1, Yp(g / 4)); } c.stroke();
			for (var g2 = 0; g2 <= 4; g2++) label(c, g2 * 25 + "%", x0 - 5, Yp(g2 / 4), COL.dim, fs - 3, "right");
			c.strokeStyle = COL.line; c.strokeRect(x0, y1, x1 - x0, y0 - y1);
			// single-pass Rabi for the same total time T
			if (S.rabi) { c.strokeStyle = "rgba(147,161,196,0.8)"; c.setLineDash([5, 4]); c.lineWidth = 1.6; c.beginPath(); for (var k = 0; k <= 400; k++) { var d = -span + 2 * span * k / 400, xx = X(d), yy = Yp(A.beamP(d, v.T)); if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke(); c.setLineDash([]); }
			c.strokeStyle = COL.gold; c.lineWidth = 2.4; c.beginPath(); var N = 700; for (var k2 = 0; k2 <= N; k2++) { var d2 = -span + 2 * span * k2 / N, xx2 = X(d2), yy2 = Yp(A.fountainP(d2, v.T, tau)); if (k2) c.lineTo(xx2, yy2); else c.moveTo(xx2, yy2); } c.stroke();
			// width marker
			var hw = v.fw / 2; c.strokeStyle = COL.cyan; c.lineWidth = 1.6; c.beginPath(); c.moveTo(X(-hw), Yp(0.5)); c.lineTo(X(hw), Yp(0.5)); c.stroke();
			c.beginPath(); c.moveTo(X(-hw), Yp(0.5) - 5); c.lineTo(X(-hw), Yp(0.5) + 5); c.moveTo(X(hw), Yp(0.5) - 5); c.lineTo(X(hw), Yp(0.5) + 5); c.stroke();
			label(c, hz(v.fw), X(0) + (X(hw) - X(0)) + 8, Yp(0.5) - 8, COL.cyan, fs - 1, "left");
			// probe
			var pp = A.fountainP(v.det, v.T, tau); c.strokeStyle = COL.text; c.lineWidth = 1.2; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(v.det), y1); c.lineTo(X(v.det), y0); c.stroke(); c.setLineDash([]);
			c.fillStyle = COL.text; c.beginPath(); c.arc(X(v.det), Yp(pp), 5, 0, 6.3); c.fill();
			// axis
			var step = niceStep(span / 2.5); c.fillStyle = COL.dim; for (var t = -Math.floor(span / step) * step; t <= span + 1e-9; t += step) { label(c, (t > 0 ? "+" : "") + shortHz(t), X(t), y0 + 14, COL.dim, fs - 3, "center"); c.fillRect(X(t), y0, 1, 4); }
			label(c, "detuning from resonance", (x0 + x1) / 2, y0 + 30, COL.dim, fs - 2, "center");
			var lgx = x0 + 4, lgy = R.y + 30;
			c.strokeStyle = COL.gold; c.lineWidth = 2.4; c.beginPath(); c.moveTo(lgx, lgy); c.lineTo(lgx + 20, lgy); c.stroke(); label(c, "two pulses (Ramsey)", lgx + 26, lgy, COL.dim, fs - 3, "left");
			if (S.rabi) { c.strokeStyle = "rgba(147,161,196,0.8)"; c.setLineDash([5, 4]); c.lineWidth = 1.6; c.beginPath(); c.moveTo(lgx + 150, lgy); c.lineTo(lgx + 170, lgy); c.stroke(); c.setLineDash([]); label(c, "one pass of length T", lgx + 176, lgy, COL.dim, fs - 3, "left"); }
		})();
	}
	function niceStep(x) { var e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; }
	function shortHz(t) { var a = Math.abs(t); if (a === 0) return "0"; if (a >= 1000) return A.fmtSig(t / 1000, 3) + " kHz"; if (a >= 1) return A.fmtSig(t, 3) + " Hz"; return A.fmtSig(t * 1000, 3) + " mHz"; }
	function bigNum(x) { var e = Math.floor(Math.log10(x)); return A.fmtSig(x / Math.pow(10, e), 3) + "\u00d710" + A.sup(e); }
	function fmtH(h) { return h >= 1 ? A.fmtSig(h, 3) + " m" : h >= 0.01 ? A.fmtSig(h * 100, 3) + " cm" : A.fmtSig(h * 1000, 3) + " mm"; }
	function readFringe() {
		var v = fringeVals(), pp = A.fountainP(v.det, v.T, Math.min(0.01, v.T / 5));
		$("ac-fw").textContent = hz(v.fw); $("ac-q").textContent = A.fmtFrac(v.Q).replace("×10", "×10"); $("ac-s1").textContent = A.fmtFrac(v.s1);
		$("ac-s1-s").textContent = "after a day of averaging: " + A.fmtFrac(v.s1 / Math.sqrt(86400));
		$("ac-h").textContent = fmtH(v.h); $("ac-h-s").textContent = "above the cavity (" + A.fmtSig(v.T * 100, 2) + " m of beam at 100 m/s)";
		$("ac-pp").textContent = Math.round(pp * 100) + "%"; $("ac-pp-s").textContent = "at " + (v.det >= 0 ? "+" : "−") + hz(Math.abs(v.det));
	}


	/* ================= tab 2b: Bloch sphere ================= */
	var bl = { u: 0, playing: true, hold: 0.4, yaw: -0.65, pitch: 0.38, drag: null, trail: true };
	var BSEG = [0.2, 0.8];                                  // fractions of the animation: pulse 1 | wait | pulse 2
	var BCOL = [COL.cyan, COL.gold, "#f472b6"];
	$("ac-bdet").value = 200; $("ac-bT").value = TmapInv(S.T);
	function syncBT() { $("ac-bT").value = TmapInv(S.T); $("ac-T").value = TmapInv(S.T); $("ac-fT").value = TmapInv(S.T); paintBloch(); paintFringeLabels(); paintFo(); }
	function bdet() { var span = 2.5 / S.T; return (+$("ac-bdet").value / 1000) * span; }
	var bp = null, bpKey = "";
	function getPath() { var k = bdet().toFixed(6) + "|" + S.T; if (k !== bpKey) { bp = A.blochPath(bdet(), S.T, Math.min(0.01, S.T / 5), 24, 60); bpKey = k; } return bp; }
	function bPos(u) {
		var pts = getPath(), nP = 24, nF = 60, k;
		if (u < BSEG[0]) k = u / BSEG[0] * nP; else if (u < BSEG[1]) k = nP + (u - BSEG[0]) / (BSEG[1] - BSEG[0]) * nF; else k = nP + nF + (u - BSEG[1]) / (1 - BSEG[1]) * nP;
		var i = Math.min(Math.floor(k), pts.length - 2), f = k - i, a = pts[i].r, b = pts[i + 1].r, r = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], m = Math.hypot(r[0], r[1], r[2]) || 1;
		return { r: [r[0] / m, r[1] / m, r[2] / m], seg: u < BSEG[0] ? 0 : u < BSEG[1] ? 1 : 2, k: k };
	}
	function paintBloch() {
		var d = bdet(); $("ac-bdet-v").textContent = (d >= 0 ? "+" : "−") + hz(Math.abs(d)); $("ac-bT-v").textContent = fmtT(S.T);
		$("ac-bu").value = Math.round(bl.u * 1000); $("ac-bu-v").textContent = Math.round(bl.u * 100) + "%";
		$("ac-b-play").setAttribute("aria-pressed", String(bl.playing)); $("ac-b-play").textContent = bl.playing ? "❚❚ Pause" : "▶ Play";
	}
	$("ac-bdet").oninput = function () { paintBloch(); }; $("ac-bT").oninput = function () { S.T = Tmap(+this.value); syncBT(); save(); };
	$("ac-bu").oninput = function () { bl.u = +this.value / 1000; bl.playing = false; paintBloch(); };
	$("ac-b-play").onclick = function () { bl.playing = !bl.playing; bl.hold = 0; paintBloch(); };
	$("ac-b-replay").onclick = function () { bl.u = 0; bl.playing = true; bl.hold = 0.4; paintBloch(); };
	[].forEach.call(document.querySelectorAll("[data-bstep]"), function (b) { b.onclick = function () { bl.u = +b.getAttribute("data-bstep"); bl.playing = false; paintBloch(); }; });
	[].forEach.call(document.querySelectorAll("[data-bdet]"), function (b) { b.onclick = function () { $("ac-bdet").value = b.getAttribute("data-bdet"); bl.u = 0; bl.playing = true; bl.hold = 0.4; paintBloch(); }; });
	$("ac-b-trail").onchange = function () { bl.trail = this.checked; };
	$("ac-full4").onclick = function () { toggleFull("ac-wrap4"); };
	function stepBloch(dt) {
		if (!bl.playing) return;
		if (bl.hold > 0) { bl.hold -= dt; return; }
		if (bl.u >= 1) { bl.u = 0; bl.hold = 0.6; } else { bl.u += dt / 7; if (bl.u >= 1) { bl.u = 1; bl.hold = 1.8; } }
		$("ac-bu").value = Math.round(bl.u * 1000); $("ac-bu-v").textContent = Math.round(bl.u * 100) + "%";
	}
	(function () {
		var cv = $("ac-bl");
		cv.addEventListener("pointerdown", function (e) { bl.drag = { x: e.clientX, y: e.clientY, yaw: bl.yaw, pitch: bl.pitch }; cv.setPointerCapture(e.pointerId); cv.classList.add("is-drag"); });
		cv.addEventListener("pointermove", function (e) { if (!bl.drag) return; bl.yaw = bl.drag.yaw + (e.clientX - bl.drag.x) * 0.01; bl.pitch = clamp(bl.drag.pitch + (e.clientY - bl.drag.y) * 0.01, -1.4, 1.4); });
		function up() { bl.drag = null; cv.classList.remove("is-drag"); }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
	})();
	function drawBloch() {
		var st = $("ac-stage4"), dim = sizeStage(st, 0.56, 1.55), W = dim.w, H = dim.h, c = setup($("ac-bl"), W, H), fs = fontPx(W), narrow = W < 640;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var sR = narrow ? { x: 0, y: 0, w: W, h: H * 0.62 } : { x: 0, y: 0, w: W * 0.55, h: H }, pR = narrow ? { x: 0, y: H * 0.62, w: W, h: H * 0.38 } : { x: W * 0.55, y: 0, w: W * 0.45, h: H };
		var cx = sR.x + sR.w / 2 + 12, cy = sR.y + sR.h / 2 + 6, R = Math.min(sR.w - 150, sR.h - 150) / 2; R = Math.max(R, 60);
		var cyw = Math.cos(bl.yaw), syw = Math.sin(bl.yaw), cp = Math.cos(bl.pitch), sp = Math.sin(bl.pitch);
		function proj(v) { var x1 = v[0] * cyw - v[1] * syw, y1 = v[0] * syw + v[1] * cyw, z = v[2]; return { x: cx + x1 * R, y: cy - (y1 * sp + z * cp) * R, d: y1 * cp - z * sp }; }   // d > 0: farther from the viewer than the centre
		var g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R); g.addColorStop(0, "rgba(96,165,250,0.16)"); g.addColorStop(1, "rgba(14,24,60,0.55)");
		c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, 6.3); c.fill(); c.strokeStyle = COL.line; c.lineWidth = 1.5; c.stroke();
		function circle(fn, col, wd) {
			var prev = null; for (var i = 0; i <= 96; i++) { var q = proj(fn(i / 96 * 6.2832)); if (prev) { c.strokeStyle = col; c.globalAlpha = (q.d + prev.d) / 2 > 0 ? 0.28 : 0.85; c.lineWidth = wd; c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(q.x, q.y); c.stroke(); } prev = q; } c.globalAlpha = 1;
		}
		circle(function (t) { return [Math.cos(t), Math.sin(t), 0]; }, "#5b6ea8", 1.6);
		[0, Math.PI / 2].forEach(function (a) { circle(function (t) { return [Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), Math.sin(t)]; }, "#33406b", 1); });
		function axis(v, col, lab) { var o = proj([0, 0, 0]), q = proj(v); c.strokeStyle = col; c.lineWidth = 1.3; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(q.x, q.y); c.stroke(); c.globalAlpha = 1; if (lab) label(c, lab, q.x + (q.x >= cx ? 6 : -6), q.y, col, fs - 2, q.x >= cx ? "left" : "right"); }
		axis([1.18, 0, 0], "#a78bfa", "x: pulse direction"); axis([0, 1.18, 0], "#64748b", "y");
		var np = proj([0, 0, 1]), sp2 = proj([0, 0, -1]); c.strokeStyle = "#64748b"; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(sp2.x, sp2.y); c.lineTo(np.x, np.y); c.stroke(); c.globalAlpha = 1;
		var nt = proj([0, 0, 1.14]), stt = proj([0, 0, -1.14]);
		label(c, "excited ↑", nt.x, nt.y - 4, COL.gold, fs, "center"); label(c, "ground ↓", stt.x, stt.y + 10, COL.blue, fs, "center");
		var pos = bPos(bl.u), pts = getPath();
		if (bl.trail) {
			for (var i = 1; i <= Math.min(Math.floor(pos.k) + 1, pts.length - 1); i++) {
				var a = proj(pts[i - 1].r), b = i <= pos.k ? proj(pts[i].r) : proj(pos.r); c.strokeStyle = BCOL[pts[i].seg]; c.lineWidth = 3; c.globalAlpha = ((a.d + b.d) / 2 > 0) ? 0.4 : 1; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
			}
			c.globalAlpha = 1;
		}
		var o = proj([0, 0, 0]), tip = proj(pos.r), col = BCOL[pos.seg];
		c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 3.5; c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(tip.x, tip.y); c.stroke();
		var ang = Math.atan2(tip.y - o.y, tip.x - o.x); c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(tip.x - 14 * Math.cos(ang - 0.35), tip.y - 14 * Math.sin(ang - 0.35)); c.lineTo(tip.x - 14 * Math.cos(ang + 0.35), tip.y - 14 * Math.sin(ang + 0.35)); c.closePath(); c.fill();
		c.beginPath(); c.arc(tip.x, tip.y, 5, 0, 6.3); c.fill();
		var sh = proj([pos.r[0], pos.r[1], 0]); c.setLineDash([3, 4]); c.strokeStyle = "rgba(230,236,251,0.45)"; c.lineWidth = 1; c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(sh.x, sh.y); c.stroke(); c.setLineDash([]); c.fillStyle = "rgba(230,236,251,0.5)"; c.beginPath(); c.arc(sh.x, sh.y, 2.5, 0, 6.3); c.fill();
		var gx = sR.x + 26, gt = cy - R, gb = cy + R; c.strokeStyle = COL.line; c.lineWidth = 8; c.lineCap = "round"; c.beginPath(); c.moveTo(gx, gt); c.lineTo(gx, gb); c.stroke();
		var gy = cy - pos.r[2] * R; c.strokeStyle = col; c.lineWidth = 8; c.beginPath(); c.moveTo(gx, gb); c.lineTo(gx, gy); c.stroke(); c.lineCap = "butt";
		label(c, "100%", gx, gt - 12, COL.gold, fs - 3, "center"); label(c, "0%", gx, gb + 12, COL.blue, fs - 3, "center"); label(c, Math.round((1 + pos.r[2]) / 2 * 100) + "%", gx + 14, gy, COL.text, fs - 1, "left");
		[["pulse 1", BCOL[0]], ["wait", BCOL[1]], ["pulse 2", BCOL[2]]].forEach(function (p, i) { var lx = sR.x + 56, ly = sR.y + 16 + i * (fs + 6); c.fillStyle = p[1]; c.fillRect(lx, ly - 2, 14, 4); label(c, p[0], lx + 20, ly, COL.dim, fs - 2, "left"); });
		(function () {
			var R2 = pR, m = { l: 40, r: 14, t: 34, b: 38 }, x0 = R2.x + m.l, x1 = R2.x + R2.w - m.r, y0 = R2.y + R2.h - m.b, y1 = R2.y + m.t, T = S.T, tau = Math.min(0.01, T / 5), span = 2.5 / T;
			function X(d) { return x0 + (d + span) / (2 * span) * (x1 - x0); } function Yp(p) { return y0 - p * (y0 - y1); }
			label(c, "Where this detuning lands on the fringes", R2.x + R2.w / 2, R2.y + 14, COL.dim, fs - 1, "center");
			c.strokeStyle = COL.grid; c.lineWidth = 1; c.beginPath(); for (var g2 = 0; g2 <= 4; g2++) { c.moveTo(x0, Yp(g2 / 4)); c.lineTo(x1, Yp(g2 / 4)); } c.stroke();
			for (var g3 = 0; g3 <= 4; g3 += 2) label(c, g3 * 25 + "%", x0 - 5, Yp(g3 / 4), COL.dim, fs - 3, "right");
			c.strokeStyle = COL.line; c.strokeRect(x0, y1, x1 - x0, y0 - y1);
			c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); for (var k = 0; k <= 400; k++) { var d = -span + 2 * span * k / 400, xx = X(d), yy = Yp(A.fountainP(d, T, tau)); if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke();
			var dd = bdet(), pf = A.fountainP(dd, T, tau); c.strokeStyle = COL.text; c.setLineDash([3, 3]); c.lineWidth = 1.2; c.beginPath(); c.moveTo(X(dd), y1); c.lineTo(X(dd), y0); c.stroke(); c.setLineDash([]);
			c.fillStyle = "#f472b6"; c.beginPath(); c.arc(X(dd), Yp(pf), 5.5, 0, 6.3); c.fill();
			var st2 = niceStep(span / 2.5); for (var t = -Math.floor(span / st2) * st2; t <= span + 1e-9; t += st2) { label(c, (t > 0 ? "+" : "") + shortHz(t), X(t), y0 + 14, COL.dim, fs - 3, "center"); }
			label(c, "detuning from resonance", (x0 + x1) / 2, y0 + 30, COL.dim, fs - 2, "center");
		})();
		label(c, "drag to rotate", sR.x + 56, sR.y + sR.h - 12, COL.dim, fs - 3, "left");
	}
	function readBloch() {
		var pos = bPos(bl.u), d = bdet(), T = S.T, tau = Math.min(0.01, T / 5), pf = A.fountainP(d, T, tau);
		var names = ["Pulse 1", "The wait", "Pulse 2"], subs = ["tipping the arrow up to the equator", "the arrow turns around the equator", "the second tip decides where it ends"];
		$("ac-b-step").textContent = bl.u >= 1 ? "Done" : bl.u <= 0 ? "Start" : names[pos.seg]; $("ac-b-step-s").textContent = bl.u >= 1 ? "final position" : bl.u <= 0 ? "all atoms in the ground state" : subs[pos.seg];
		$("ac-b-p").textContent = Math.round((1 + pos.r[2]) / 2 * 100) + "%";
		var ph = A.waitPhase(d, T) * 180 / Math.PI, ph1 = ((ph % 360) + 540) % 360 - 180;
		$("ac-b-ph").textContent = Math.round(ph1) + "°"; $("ac-b-ph-s").textContent = A.fmtSig(Math.abs(ph) / 360, 3) + " full turns (2π × detuning × T)";
		$("ac-b-fin").textContent = Math.round(pf * 100) + "%"; $("ac-b-fin-s").textContent = pf > 0.9 ? "top of a fringe: nearly all atoms flip" : pf < 0.1 ? "bottom of a fringe: nearly none flip" : "on the slope of a fringe";
		$("ac-b-explain").textContent = Math.abs(ph1) < 15 ? "The arrow has barely turned, so the second pulse carries on in the same direction and the atoms end near the north pole." : Math.abs(Math.abs(ph1) - 180) < 15 ? "The arrow has turned half a circle, so the second pulse undoes the first and the atoms go back to the south pole." : "The arrow has turned part of the way round, so the second pulse takes it to a point between the poles.";
	}


	/* ================= tab 2c: 3D fountain ================= */
	var fo = { u: 0, playing: true, hold: 0.5, yaw: -0.75, pitch: 0.3, drag: null, lasers: true }, EX = 6, FA = [];
	(function () { var r = A.rng(5); for (var i = 0; i < 260; i++) FA.push({ g: [r.normal(), r.normal(), r.normal()], v: [r.normal(), r.normal(), r.normal()], u: r() }); })();
	function TmapU(v) { return 0.2 * Math.pow(250, v / 1000); } function TmapUInv(t) { return Math.round(1000 * Math.log(t / 0.2) / Math.log(250)); }
	function fmtUK(t) { return A.fmtSig(t, 2) + " µK"; }
	$("ac-ft").value = TmapUInv(S.temp);
	function paintFo() {
		$("ac-fT-v").textContent = fmtT(S.T); $("ac-ft-v").textContent = fmtUK(S.temp);
		$("ac-f-play").setAttribute("aria-pressed", String(fo.playing)); $("ac-f-play").textContent = fo.playing ? "❚❚ Pause" : "▶ Play";
	}
	$("ac-fT").oninput = function () { S.T = Tmap(+this.value); syncBT(); save(); };
	$("ac-ft").oninput = function () { S.temp = TmapU(+this.value); paintFo(); save(); };
	$("ac-f-play").onclick = function () { fo.playing = !fo.playing; fo.hold = 0; paintFo(); };
	$("ac-f-replay").onclick = function () { fo.u = 0; fo.playing = true; fo.hold = 0.4; paintFo(); };
	$("ac-f-lasers").onchange = function () { fo.lasers = this.checked; };
	$("ac-full5").onclick = function () { toggleFull("ac-wrap5"); };
	[].forEach.call(document.querySelectorAll("[data-ftry]"), function (b) { b.onclick = function () { var p = b.getAttribute("data-ftry").split(","); S.temp = +p[0]; S.T = +p[1]; $("ac-ft").value = TmapUInv(S.temp); fo.u = 0; fo.playing = true; fo.hold = 0.4; syncBT(); save(); }; });
	function stepFo(dt) {
		if (!fo.playing) return;
		if (fo.hold > 0) { fo.hold -= dt; return; }
		if (fo.u >= 1) { fo.u = 0; fo.hold = 0.5; } else { fo.u += dt / 13; if (fo.u >= 1) { fo.u = 1; fo.hold = 1.5; } }
	}
	(function () {
		var cv = $("ac-fo");
		cv.addEventListener("pointerdown", function (e) { fo.drag = { x: e.clientX, y: e.clientY, yaw: fo.yaw, pitch: fo.pitch }; cv.setPointerCapture(e.pointerId); cv.classList.add("is-drag"); });
		cv.addEventListener("pointermove", function (e) { if (!fo.drag) return; fo.yaw = fo.drag.yaw + (e.clientX - fo.drag.x) * 0.01; fo.pitch = clamp(fo.drag.pitch + (e.clientY - fo.drag.y) * 0.01, -1.2, 1.3); });
		function up() { fo.drag = null; cv.classList.remove("is-drag"); }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
	})();
	function foTimes(G) {            // animation position u -> physical time since launch (s), and the phase
		var u = fo.u; if (u < 0.16) return { tau: 0, phase: 0, cap: u / 0.16 };
		if (u < 0.9) return { tau: (u - 0.16) / 0.74 * G.tDetect, phase: 1, cap: 1 };
		return { tau: G.tDetect, phase: 2, cap: 1 };
	}
	function drawFo() {
		var st = $("ac-stage5"), dim = sizeStage(st, 0.62, 1.5), W = dim.w, H = dim.h, c = setup($("ac-fo"), W, H), fs = fontPx(W);
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var G = A.fountainGeometry(S.T, S.temp), tm = foTimes(G), tau = tm.tau;
		var zmin = -G.d - 0.06, zmax = Math.max(G.h, 0.12) + 0.1, zc = (zmin + zmax) / 2, sc = (H - 70) / (zmax - zmin);
		var cx = W * 0.5, cy = H * 0.5 + 6, cyw = Math.cos(fo.yaw), syw = Math.sin(fo.yaw), cp = Math.cos(fo.pitch), sp = Math.sin(fo.pitch);
		function pr(x, y, z) { var x1 = x * cyw - y * syw, y1 = x * syw + y * cyw, zz = z - zc; return { x: cx + x1 * sc, y: cy - (y1 * sp + zz * cp) * sc, d: y1 * cp - zz * sp }; }
		function ring(r, z, col, wd, al, n) { c.strokeStyle = col; c.lineWidth = wd; c.globalAlpha = al; c.beginPath(); n = n || 48; for (var i = 0; i <= n; i++) { var a = i / n * 6.2832, q = pr(r * Math.cos(a), r * Math.sin(a), z); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); } c.stroke(); c.globalAlpha = 1; }
		function seg(a, b, col, wd, al) { var p = pr(a[0], a[1], a[2]), q = pr(b[0], b[1], b[2]); c.strokeStyle = col; c.lineWidth = wd; c.globalAlpha = al; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke(); c.globalAlpha = 1; }
		// vacuum tube
		var TR = 0.05; for (var a0 = 0; a0 < 8; a0++) { var an = a0 / 8 * 6.2832; seg([TR * Math.cos(an), TR * Math.sin(an), zmin], [TR * Math.cos(an), TR * Math.sin(an), zmax - 0.02], "#2c3a6b", 1, 0.55); }
		ring(TR, zmin, "#3b4c88", 1.2, 0.8); ring(TR, zmax - 0.02, "#3b4c88", 1.2, 0.8); ring(TR, G.d * -0.5, "#26325a", 1, 0.6); ring(TR, G.h * 0.5, "#26325a", 1, 0.6);
		// apex marker
		ring(TR * 0.9, G.h, "rgba(147,161,196,0.8)", 1, 0.7, 40); var ap = pr(TR + 0.01, 0, G.h); var apl = pr(-TR - 0.01, 0, G.h); label(c, "apex " + fmtH(G.h), apl.x - 10, apl.y, COL.dim, fs - 1, "right");
		// microwave cavity
		var flash = Math.min(Math.abs(tau - G.tCavity), Math.abs(tau - G.tReturn)) < 0.035 * G.tDetect && tm.phase === 1, cc = flash ? "#fde68a" : COL.gold;
		[-0.03, 0.03].forEach(function (zz) { ring(0.062, zz, cc, flash ? 3.4 : 2, 0.95); });
		for (var a1 = 0; a1 < 6; a1++) { var ang = a1 / 6 * 6.2832; seg([0.062 * Math.cos(ang), 0.062 * Math.sin(ang), -0.03], [0.062 * Math.cos(ang), 0.062 * Math.sin(ang), 0.03], cc, 1.2, 0.6); }
		var cl = pr(0.07, 0, 0); label(c, flash ? "microwave pulse!" : "microwave cavity", cl.x + 12, cl.y, cc, fs - 1, "left");
		// detection zone
		var dz = G.detectZ, lit = tau > (G.tReturn + 0.7 * (G.tDetect - G.tReturn)), dq = [[-0.06, -0.06], [0.06, -0.06], [0.06, 0.06], [-0.06, 0.06]];
		c.fillStyle = lit ? "rgba(74,222,128,0.28)" : "rgba(74,222,128,0.08)"; c.strokeStyle = "#4ade80"; c.lineWidth = 1.2; c.beginPath(); dq.forEach(function (p, i) { var q = pr(p[0], p[1], dz); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); c.closePath(); c.fill(); c.stroke();
		var dl = pr(0.07, 0.07, dz); label(c, "detection (laser sheet)", dl.x + 6, dl.y + 4, "#4ade80", fs - 2, "left");
		// cooling lasers
		var mot = fo.lasers && fo.u < 0.2, mz = -G.d;
		if (mot) {
			var al = 0.55 + 0.35 * Math.sin(performance.now() / 1000 * 6);
			[[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (v) { seg([-v[0] * 0.15, -v[1] * 0.15, mz - v[2] * 0.15], [v[0] * 0.15, v[1] * 0.15, mz + v[2] * 0.15], "#f87171", 2.2, al); });
			var ml = pr(0.15, 0, mz); label(c, "6 cooling laser beams", ml.x + 6, ml.y - 4, "#f87171", fs - 1, "left");
		} else { var mm = pr(0.06, 0, mz); label(c, "cooling region", mm.x + 8, mm.y + 12, COL.dim, fs - 2, "left"); }
		// atoms
		var P = A.fountainP(fringeVals().det, S.T, Math.min(0.01, S.T / 5)), t0 = tm.phase === 0 ? 0 : tau, grow = tm.phase === 0 ? 0.35 + 0.65 * tm.cap : 1, items = [], lost = 0, kept = 0;
		var zC = A.fountainZ(G, tau), sv = G.sigmaV, s0 = 0.002;
		for (var i = 0; i < FA.length; i++) {
			var at = FA[i], rx = (s0 * at.g[0] + sv * t0 * at.v[0]), ry = (s0 * at.g[1] + sv * t0 * at.v[1]), rz = (s0 * at.g[2] + sv * t0 * at.v[2]);
			var rRet = Math.hypot(s0 * at.g[0] + sv * G.tReturn * at.v[0], s0 * at.g[1] + sv * G.tReturn * at.v[1]), isLost = rRet > G.aperture, passedRet = tau > G.tReturn;
			if (isLost) lost++; else kept++;
			var q = pr(rx * EX * grow, ry * EX * grow, zC + rz * EX * grow), col = COL.blue, a2 = 0.9, rad = Math.max(1.6, W / 330);
			if (tau > G.tCavity && tau <= G.tReturn) col = "#a78bfa"; else if (tau > G.tReturn) col = (at.u < P) ? COL.gold : COL.blue;
			if (isLost && passedRet) { col = COL.red; a2 = Math.max(0.12, 0.7 - (tau - G.tReturn) / (G.tDetect - G.tReturn) * 0.6); }
			var glow = tau > (G.tReturn + 0.7 * (G.tDetect - G.tReturn)) && !(isLost && passedRet) && at.u < P;
			items.push({ x: q.x, y: q.y, d: q.d, col: col, a: a2, r: rad + (glow ? 1.5 : 0), glow: glow });
		}
		items.sort(function (a, b) { return b.d - a.d; });
		items.forEach(function (it) { if (it.glow) { c.fillStyle = "rgba(251,191,36,0.25)"; c.beginPath(); c.arc(it.x, it.y, it.r * 3, 0, 6.3); c.fill(); } c.globalAlpha = it.a; c.fillStyle = it.col; c.beginPath(); c.arc(it.x, it.y, it.r, 0, 6.3); c.fill(); });
		c.globalAlpha = 1;
		// height ruler and phase caption
		var pc = tm.phase === 0 ? (fo.lasers ? "1. Cool: six laser beams cool the atoms" : "1. Cool the atoms") : tau < G.tCavity ? "2. Launch: the ball is tossed up" : tau < G.tReturn ? (tau < G.tApex ? "3. Pulse 1, then it keeps rising" : "4. Apex: it turns and falls back") : tau < (G.tReturn + 0.7 * (G.tDetect - G.tReturn)) ? "5. Pulse 2, then it falls to the detector" : "6. Detect: count the atoms that flipped";
		label(c, pc, 14, 18, COL.text, fs + 1, "left");
		c.fillStyle = COL.dim; c.fillRect(14, H - 20, W - 28, 3); c.fillStyle = COL.cyan; c.fillRect(14, H - 20, (W - 28) * fo.u, 3);
		label(c, "drag to rotate", W - 14, 18, COL.dim, fs - 3, "right");
	}
	function readFo() {
		var G = A.fountainGeometry(S.T, S.temp), rel = A.fountainRelStability(S.T, S.temp);
		$("ac-f-v").textContent = A.fmtSig(G.vLaunch, 3) + " m/s"; $("ac-f-v-s").textContent = A.fmtSig(G.vCavity, 3) + " m/s as it passes the cavity";
		$("ac-f-h").textContent = fmtH(G.h);
		$("ac-f-w").textContent = A.fmtSig(G.sigmaReturn * 1000 * 2, 3) + " mm"; $("ac-f-w-s").textContent = "spread σ = " + A.fmtSig(G.sigmaReturn * 1000, 2) + " mm; atoms drift at " + A.fmtSig(G.sigmaV * 1000, 2) + " mm/s";
		$("ac-f-n").textContent = Math.round(G.fraction * 100) + "%"; $("ac-f-n-s").textContent = "inside the " + A.fmtSig(G.aperture * 200, 2) + " cm opening on the way back";
		$("ac-f-r").textContent = A.fmtSig(rel, 2) + "×"; $("ac-f-r-s").textContent = "vs 0.5 s at 2 µK (lower is better)";
		$("ac-f-explain").textContent = rel < 0.7 ? "This setup would be a better clock than the reference: the longer flight or colder atoms win more than the lost atoms cost." : rel > 1.6 ? "Worse than the reference: either the flight is too short for a narrow fringe, or too many warm atoms miss the cavity on the way back." : "About as good as the reference fountain. Try colder atoms or a longer flight and watch the red (lost) atoms.";
	}

	/* ================= tab 3: race ================= */
	var race = A.raceInit(7), racePlaying = false, lanes = {};
	(function buildLanes() {
		var host = $("ac-lanes"), head = document.createElement("div"); head.className = "ac-lane ac-lane--head"; head.setAttribute("role", "row");
		head.innerHTML = "<div>Clock</div><div>Error now</div><div>Error on a log scale</div><div>Typically off by 1 s after</div>"; host.appendChild(head);
		A.CLOCKS.forEach(function (cl) {
			var row = document.createElement("div"); row.className = "ac-lane"; row.setAttribute("role", "row"); row.title = cl.name + ". " + cl.note;
			row.innerHTML = '<div class="ac-lane__n"><span class="ac-dot" style="background:' + cl.color + '"></span><span>' + esc(cl.short) + '</span></div><div class="ac-lane__e" data-e>0 s</div><div class="ac-lane__bar" aria-hidden="true"><div class="ac-lane__fill" data-f style="background:' + cl.color + ';width:0"></div></div><div class="ac-lane__t">' + esc(A.fmtSpan(A.timeToError(cl, 1))) + '</div>';
			host.appendChild(row); lanes[cl.id] = { e: row.querySelector("[data-e]"), f: row.querySelector("[data-f]") };
		});
	})();
	function paintRace() {
		A.CLOCKS.forEach(function (cl) {
			var x = race.x[cl.id], l = lanes[cl.id], a = Math.abs(x);
			l.e.textContent = a === 0 ? "0 s" : (x > 0 ? "+" : "−") + A.fmtTime(a, 3);
			var f = a <= 1e-18 ? 0 : clamp((Math.log10(a) + 18) / 20, 0, 1); l.f.style.width = (f * 100).toFixed(1) + "%";
		});
		$("ac-race-t").textContent = A.fmtTime(race.t, 3);
	}
	$("ac-race-speed").value = String(S.raceSpeed); if ($("ac-race-speed").value !== String(S.raceSpeed)) $("ac-race-speed").value = "31557600";
	$("ac-race-speed").onchange = function () { S.raceSpeed = +this.value; save(); };
	$("ac-race-play").onclick = function () { racePlaying = !racePlaying; this.setAttribute("aria-pressed", String(racePlaying)); this.textContent = racePlaying ? "❚❚ Pause" : "▶ Start"; };
	$("ac-race-reset").onclick = function () { race = A.raceInit(1 + Math.floor(Math.random() * 99999)); paintRace(); };

	/* ================= tab 4: stability chart ================= */
	var chips = $("ac-st-chips");
	A.CLOCKS.forEach(function (cl) {
		var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.setAttribute("aria-pressed", String(!S.hidden[cl.id])); b.innerHTML = '<span class="ac-dot" style="display:inline-block;width:0.7em;height:0.7em;margin-right:0.4em;background:' + cl.color + '"></span>' + esc(cl.short);
		b.onclick = function () { S.hidden[cl.id] = !S.hidden[cl.id]; b.setAttribute("aria-pressed", String(!S.hidden[cl.id])); save(); stabDirty = true; }; chips.appendChild(b);
	});
	var yb = document.createElement("button"); yb.type = "button"; yb.className = "tu-chip"; yb.setAttribute("aria-pressed", String(!S.hidden.mine)); yb.textContent = "Your fountain (dashed)";
	yb.onclick = function () { S.hidden.mine = !S.hidden.mine; yb.setAttribute("aria-pressed", String(!S.hidden.mine)); save(); stabDirty = true; }; chips.appendChild(yb);
	var stabDirty = true, hover = null, TMIN = 0.1, TMAX = 1e6, YMIN = 1e-19, YMAX = 1e-5;
	function mineAt(tau) { var s1 = A.sigma1s(A.fringeWidth(S.T), S.snr, 1); return Math.sqrt(s1 * s1 / tau + 1e-16 * 1e-16); }
	function drawStab() {
		var st = $("ac-stage3"), dim = sizeStage(st, 0.52, 1.0), W = dim.w, H = dim.h, c = setup($("ac-st"), W, H), fs = fontPx(W);
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var m = { l: 62, r: W < 640 ? 14 : 112, t: 16, b: 44 }, x0 = m.l, x1 = W - m.r, y0 = H - m.b, y1 = m.t;
		var lx = Math.log10(TMIN), lX = Math.log10(TMAX) - lx, ly = Math.log10(YMIN), lY = Math.log10(YMAX) - ly;
		function X(t) { return x0 + (Math.log10(t) - lx) / lX * (x1 - x0); } function Y(v) { return y0 - (Math.log10(clamp(v, YMIN, YMAX)) - ly) / lY * (y0 - y1); }
		c.lineWidth = 1; c.strokeStyle = COL.grid; c.beginPath();
		for (var e = Math.ceil(lx); e <= Math.log10(TMAX); e++) { c.moveTo(X(Math.pow(10, e)), y1); c.lineTo(X(Math.pow(10, e)), y0); }
		for (var f = Math.ceil(ly); f <= Math.log10(YMAX); f++) { c.moveTo(x0, Y(Math.pow(10, f))); c.lineTo(x1, Y(Math.pow(10, f))); } c.stroke();
		c.strokeStyle = COL.line; c.strokeRect(x0, y1, x1 - x0, y0 - y1);
		for (var f2 = Math.ceil(ly); f2 <= Math.log10(YMAX); f2 += (H < 380 ? 2 : 1)) label(c, "10" + A.sup(f2), x0 - 6, Y(Math.pow(10, f2)), COL.dim, fs - 2, "right");
		var tl = [[0.1, "0.1 s"], [1, "1 s"], [10, "10 s"], [60, "1 min"], [3600, "1 h"], [86400, "1 day"], [1e6, "12 days"]];
		tl.forEach(function (p) { if (W < 640 && (p[0] === 0.1 || p[0] === 10)) return; label(c, p[1], X(p[0]), y0 + 14, COL.dim, fs - 2, "center"); });
		label(c, "averaging time τ", (x0 + x1) / 2, y0 + 33, COL.dim, fs - 1, "center");
		c.save(); c.translate(14, (y0 + y1) / 2); c.rotate(-Math.PI / 2); label(c, "fractional frequency instability σy(τ)  ↓ better", 0, 0, COL.dim, fs - 1, "center"); c.restore();
		function curve(fn, col, wd, dash) { c.strokeStyle = col; c.lineWidth = wd; c.setLineDash(dash || []); c.beginPath(); var N = 160; for (var i = 0; i <= N; i++) { var t = Math.pow(10, lx + lX * i / N), xx = X(t), yy = Y(fn(t)); if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke(); c.setLineDash([]); }
		var ends = [];
		A.CLOCKS.forEach(function (cl) { if (S.hidden[cl.id]) return; curve(function (t) { return A.allanModel(cl, t); }, cl.color, hover ? 1.8 : 2.4); ends.push({ y: Y(A.allanModel(cl, TMAX)), t: cl.short, col: cl.color }); });
		if (!S.hidden.mine) { curve(mineAt, "#ffffff", 2, [6, 4]); ends.push({ y: Y(mineAt(TMAX)), t: "yours", col: "#fff" }); }
		if (W >= 640) { ends.sort(function (a, b) { return a.y - b.y; }); for (var i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < fs + 1) ends[i].y = ends[i - 1].y + fs + 1; ends.forEach(function (o) { label(c, o.t, x1 + 6, o.y, o.col, fs - 1, "left"); }); }
		if (hover) {
			var t = hover.t, xx = X(t); c.strokeStyle = COL.text; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(xx, y1); c.lineTo(xx, y0); c.stroke(); c.setLineDash([]);
			A.CLOCKS.forEach(function (cl) { if (S.hidden[cl.id]) return; c.fillStyle = cl.color; c.beginPath(); c.arc(xx, Y(A.allanModel(cl, t)), 4, 0, 6.3); c.fill(); });
			if (!S.hidden.mine) { c.fillStyle = "#fff"; c.beginPath(); c.arc(xx, Y(mineAt(t)), 4, 0, 6.3); c.fill(); }
		}
	}
	var stCanvas = $("ac-st");
	function stMove(ev) {
		var r = stCanvas.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, W = r.width, m = { l: 62, r: W < 640 ? 14 : 112 };
		var u = clamp((px - m.l) / (W - m.l - m.r), 0, 1), t = Math.pow(10, Math.log10(TMIN) + u * (Math.log10(TMAX) - Math.log10(TMIN)));
		hover = { t: t }; stabDirty = true;
		var parts = []; A.CLOCKS.forEach(function (cl) { if (!S.hidden[cl.id]) parts.push([cl.short, A.allanModel(cl, t)]); }); parts.sort(function (a, b) { return a[1] - b[1]; });
		$("ac-st-read").textContent = "τ = " + A.fmtTime(t, 3);
		$("ac-st-s").textContent = parts.map(function (p) { return p[0] + " " + A.fmtFrac(p[1]); }).join("  ·  ") + (S.hidden.mine ? "" : "  ·  yours " + A.fmtFrac(mineAt(t))) + "   (best first)";
	}
	stCanvas.addEventListener("mousemove", stMove); stCanvas.addEventListener("touchstart", stMove, { passive: true }); stCanvas.addEventListener("touchmove", stMove, { passive: true });
	stCanvas.addEventListener("mouseleave", function () { hover = null; stabDirty = true; });

	/* ================= tab 5: drift calculator ================= */
	var PER = { day: A.DAY, week: 7 * A.DAY, month: A.YEAR / 12, year: A.YEAR };
	var dFrac = $("ac-d-frac"), dSec = $("ac-d-sec"), dPer = $("ac-d-per"), dTar = $("ac-d-target");
	function fmtFracInput(y) { return y === 0 ? "0" : Number(y.toPrecision(4)).toExponential().replace("e+", "e"); }
	function syncFromFrac() { dFrac.value = fmtFracInput(S.frac); dSec.value = A.fmtSig(S.frac * PER[S.per], 4); dPer.value = S.per; dTar.value = A.fmtTime(S.target, 4).replace(/ years?$/, " y").replace(/ hours$/, " h").replace(/ days$/, " day"); }
	var DP = $("ac-d-presets");
	A.CLOCKS.forEach(function (cl) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = cl.short + " (" + A.fmtFrac(cl.acc) + ")"; b.title = cl.name; b.onclick = function () { S.frac = cl.acc; save(); syncFromFrac(); renderDrift(); }; DP.appendChild(b); });
	[["1 s per day", A.fractionFrom(1, A.DAY)], ["1 min per year", A.fractionFrom(60, A.YEAR)]].forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = p[0]; b.onclick = function () { S.frac = p[1]; save(); syncFromFrac(); renderDrift(); }; DP.appendChild(b); });
	var DT = $("ac-d-targets");
	[["1 ns", 1e-9], ["1 µs", 1e-6], ["1 ms", 1e-3], ["1 s", 1], ["1 min", 60], ["1 hour", 3600]].forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = p[0]; b.onclick = function () { S.target = p[1]; save(); syncFromFrac(); renderDrift(); }; DT.appendChild(b); });
	function nearestClock(y) { var a = Math.abs(y), best = null, bd = 1e9; A.CLOCKS.forEach(function (cl) { var d = Math.abs(Math.log10(Math.max(a, 1e-30)) - Math.log10(cl.acc)); if (d < bd) { bd = d; best = cl; } }); return best; }
	function groupDigits(s) { return /^\d+$/.test(s) ? s.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : s; }
	var lastAnswer = "";
	function renderDrift() {
		var y = S.frac, a = Math.abs(y), fast = y > 0 ? "gains" : "loses";
		$("ac-d-tl").textContent = A.fmtTime(S.target, 3);
		if (!isFinite(y)) { $("ac-d-until").textContent = "–"; return; }
		$("ac-d-until").textContent = a === 0 ? "never" : A.fmtSpan(A.timeUntil(y, S.target));
		$("ac-d-until-s").textContent = a === 0 ? "A perfect clock never drifts" : "A clock with an error of " + (y < 0 ? "−" : "") + A.fmtFrac(a) + " (" + hz(a * NU0) + " at 9.19 GHz)";
		$("ac-d-day").textContent = a === 0 ? "0 s" : A.fmtTime(a * A.DAY, 3); $("ac-d-day-s").textContent = a === 0 ? "" : fast + " this much each day";
		$("ac-d-year").textContent = a === 0 ? "0 s" : A.fmtTime(a * A.YEAR, 3); $("ac-d-year-s").textContent = a === 0 ? "" : fast + " this much each year";
		var cl = a === 0 ? null : nearestClock(y);
		if (!cl) { $("ac-d-like").textContent = "–"; $("ac-d-like-s").textContent = ""; }
		else if (a > 1e-3) { $("ac-d-like").textContent = "A broken clock"; $("ac-d-like-s").textContent = "Worse than any watch: over 0.1% error"; }
		else { $("ac-d-like").textContent = cl.short; $("ac-d-like-s").textContent = cl.name + ": typical error " + A.fmtFrac(cl.acc) + ". " + cl.note; }
		var rows = [["1 hour", 3600], ["1 day", A.DAY], ["1 week", 7 * A.DAY], ["1 month", A.YEAR / 12], ["1 year", A.YEAR], ["10 years", 10 * A.YEAR], ["100 years", 100 * A.YEAR]], tb = $("ac-d-table").querySelector("tbody"), html = "";
		rows.forEach(function (r) { var err = a * r[1]; html += "<tr><td>" + r[0] + "</td><td>" + (a === 0 ? "0 s" : A.fmtTime(err, 3)) + "</td><td>" + (a === 0 ? "0" : A.fmtDist(A.lightDistance(err))) + "</td><td>" + groupDigits(A.cyclesIn(r[1])) + "</td></tr>"; });
		tb.innerHTML = html;
		lastAnswer = a === 0 ? "A perfect clock never drifts." : "A clock with a fractional frequency error of " + (y < 0 ? "-" : "") + A.fmtFrac(a) + " " + fast + " " + A.fmtTime(a * A.DAY, 3) + " per day and " + A.fmtTime(a * A.YEAR, 3) + " per year, and is typically off by " + A.fmtTime(S.target, 3) + " after " + A.fmtSpan(A.timeUntil(y, S.target)) + ". (mes.fm/atomic-clock-simulator)";
		save();
	}
	dFrac.addEventListener("input", function () { var v = A.parseFraction(this.value); if (isFinite(v)) { S.frac = v; dSec.value = A.fmtSig(v * PER[S.per], 4); renderDrift(); $("ac-d-frac-n").textContent = "Type 5 ppm, 2 ppb, 3 ppt, 1.5e-13 or 0.0005%"; } else $("ac-d-frac-n").textContent = "Could not read that: try 5 ppm or 2e-9"; });
	function fromSec() { var v = parseFloat(dSec.value.replace(/,/g, "")); if (isFinite(v)) { S.per = dPer.value; S.frac = A.fractionFrom(v, PER[S.per]); dFrac.value = fmtFracInput(S.frac); renderDrift(); } }
	dSec.addEventListener("input", fromSec); dPer.addEventListener("change", fromSec);
	dTar.addEventListener("input", function () { var v = A.parseTime(this.value); if (isFinite(v) && v > 0) { S.target = v; renderDrift(); $("ac-d-target-n").textContent = "Try 1 ns, 1 ms, 1 s, 1 min"; } else $("ac-d-target-n").textContent = "Could not read that: try 1 ms or 2 min"; });
	$("ac-d-copy").onclick = function () { copy(lastAnswer, "Answer copied"); };
	$("ac-d-link").onclick = function () { var o = new URLSearchParams(); o.set("tab", "drift"); o.set("f", fmtFracInput(S.frac)); o.set("t", A.fmtSig(S.target, 6) + "s"); o.set("per", S.per); copy(location.origin + location.pathname + "?" + o.toString(), "Link copied"); };

	/* ================= tabs, theatre, full screen ================= */
	function setTab(t, fromUser) {
		if (TABS.indexOf(t) < 0) t = "loop"; S.tab = t;
		TABS.forEach(function (k) { var on = k === t; $("ac-p-" + k).hidden = !on; $("ac-t-" + k).setAttribute("aria-selected", String(on)); $("ac-t-" + k).tabIndex = on ? 0 : -1; });
		if (t === "race") paintRace(); if (t === "stab") stabDirty = true; if (t === "drift") { syncFromFrac(); renderDrift(); } if (t === "fringe") paintFringeLabels(); if (t === "bloch" || t === "fountain") { syncBT(); }
		save();
		if (fromUser) { var u = new URL(location.href); u.search = ""; history.replaceState(null, "", u.pathname); }
	}
	[].forEach.call(document.querySelectorAll(".ac-tabs button"), function (b) {
		b.onclick = function () { setTab(b.getAttribute("data-tab"), true); };
		b.onkeydown = function (e) { var i = TABS.indexOf(b.getAttribute("data-tab")); if (e.key === "ArrowRight") { setTab(TABS[(i + 1) % TABS.length], true); $("ac-t-" + S.tab).focus(); e.preventDefault(); } else if (e.key === "ArrowLeft") { setTab(TABS[(i + TABS.length - 1) % TABS.length], true); $("ac-t-" + S.tab).focus(); e.preventDefault(); } };
	});
	function paintTheatre() { $("ac-theatre").setAttribute("aria-pressed", String(document.documentElement.classList.contains("page-theatre"))); }
	$("ac-theatre").onclick = function () {
		var on = !document.documentElement.classList.contains("page-theatre");
		document.documentElement.classList.toggle("page-theatre", on); document.documentElement.classList.toggle("page-wide", on);
		try { localStorage.setItem("pageMode", on ? "theatre" : "std"); localStorage.setItem("pageWide", on ? "1" : "0"); } catch (e) {}
		paintTheatre(); stabDirty = true;
	};
	paintTheatre();
	$("ac-full1").onclick = function () { toggleFull("ac-wrap1"); }; $("ac-full2").onclick = function () { toggleFull("ac-wrap2"); };
	document.addEventListener("keydown", function (e) {
		var tag = (e.target.tagName || "").toLowerCase(); if (/^(input|textarea|select)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (S.tab === "loop") { if (e.key === "l" || e.key === "L") $("ac-lock").click(); else if (e.key === "k" || e.key === "K") $("ac-kick").click(); else if (e.key === " " && tag !== "button") { e.preventDefault(); $("ac-loop-play").click(); } }
		if (S.tab === "race" && e.key === " " && tag !== "button") { e.preventDefault(); $("ac-race-play").click(); }
	});

	/* ================= main loop ================= */
	var last = 0, vis = true;
	document.addEventListener("visibilitychange", function () { vis = !document.hidden; last = 0; });
	function frame(ts) {
		requestAnimationFrame(frame);
		if (!vis) return;
		var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016; last = ts;
		if (S.tab === "loop") { stepLoop(dt); drawLoop(dt); readLoop(); }
		else if (S.tab === "fringe") { drawFringe(dt); readFringe(); }
		else if (S.tab === "bloch") { stepBloch(dt); drawBloch(); readBloch(); }
		else if (S.tab === "fountain") { stepFo(dt); drawFo(); readFo(); }
		else if (S.tab === "race") { if (racePlaying) { A.raceStep(race, S.raceSpeed * dt); paintRace(); } }
		else if (S.tab === "stab") { if (stabDirty) { drawStab(); stabDirty = false; } }
	}
	var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { stabDirty = true; }, 60); });
	document.addEventListener("fullscreenchange", function () { stabDirty = true; });

	newLoop(false); paintFringeLabels(); syncFromFrac(); renderDrift();
	setTab(S.tab, false);
	if (q.get("tab") || q.get("f") || q.get("c")) history.replaceState(null, "", location.pathname);
	requestAnimationFrame(frame);
})();
