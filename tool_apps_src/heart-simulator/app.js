/* Heart Simulator UI: animated heart + Wiggers diagram, pressure-volume loop, ECG rhythm strip with calipers and quiz, hemodynamics calculator.
   Maths: MESHeart (lib.js, node-tested: tool_apps_src/heart-simulator-tests.js). State: localStorage mes-heart-simulator:v1; links ?tab=&preset=&rh= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("hs"); if (!root) return;
	var H = window.MESHeart, KEY = "mes-heart-simulator:v1", dpr = Math.min(2, window.devicePixelRatio || 1);
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function f0(x) { return isFinite(x) ? Math.round(x).toString() : "–"; }
	function f1(x) { return isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : "–"; }
	var toastT;
	function toast(msg) { var t = $("hs-toast"); if (!t) { t = document.createElement("div"); t.id = "hs-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copyText(s, msg) { var done = function () { toast(msg || "Copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, function () { prompt("Copy:", s); }); else prompt("Copy:", s); }
	function isDark() { return document.body.classList.contains("dark-mode"); }

	var q = new URLSearchParams(location.search), saved = sget();
	var S = {
		tab: /^(cycle|pv|ecg|calc)$/.test(q.get("tab") || "") ? q.get("tab") : (saved.tab || "cycle"),
		preset: q.get("preset") || saved.preset || "normal",
		p: null, spd: saved.spd != null ? saved.spd : 2, play: true, snd: false,
		rh: q.get("rh") || saved.rh || "sinus", mon: !!saved.mon, esp: saved.esp || 25, gain: saved.gain || 10,
		ph: saved.ph !== false, ev: saved.ev !== false, la: saved.la !== false, lines: saved.lines !== false, ea: saved.ea !== false
	};
	if (!H.PRESETS.some(function (x) { return x.id === S.preset; })) S.preset = "normal";
	if (!H.RHYTHMS.some(function (x) { return x.id === S.rh; })) S.rh = "sinus";
	function presetObj() { return H.PRESETS.find(function (x) { return x.id === S.preset; }) || H.PRESETS[0]; }
	S.p = H.params(saved.p && !q.get("preset") ? saved.p : presetObj().p);
	["hr", "ees", "vol", "svr"].forEach(function (k) { var v = parseFloat(q.get(k)); if (isFinite(v)) S.p[k] = v; });

	/* ---------- model ---------- */
	var B = null, G = null, OCC = null, simT = 0;
	function run() { B = H.simulate(S.p); B.ph = H.phases(B); B.xs = H.extraSounds(B, S.p); OCC = null; paintPV(); paintCycleRO(); }
	function schedule() { if (simT) return; simT = requestAnimationFrame(function () { simT = 0; run(); save(); }); }
	function save() { sset({ tab: S.tab, preset: S.preset, p: S.p, spd: S.spd, rh: S.rh, mon: S.mon, esp: S.esp, gain: S.gain, ph: S.ph, ev: S.ev, la: S.la, lines: S.lines, ea: S.ea }); }
	function idxAt(t) { var r = B.rec, i = Math.round(t / 0.002); return Math.max(0, Math.min(r.t.length - 1, i)); }
	function phaseAt(t) { var T = B.T, ph = B.ph; for (var i = 0; i < ph.length; i++) { var a = ph[i].a, b = ph[i].b; if (a < 0 || b < 0) continue; if ((t >= a && t < b) || (t + T >= a && t + T < b)) return ph[i]; } return ph[3]; }

	/* ---------- tabs and presets ---------- */
	function setTab(t) {
		S.tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		var showPre = t === "cycle" || t === "pv"; $("hs-pre").hidden = !showPre; $("hs-pnote").hidden = !showPre;
		save(); setTimeout(onResize, 0);
	}
	root.querySelector(".hs-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
	function paintPresets() {
		$("hs-pre").innerHTML = H.PRESETS.map(function (x) { return '<button type="button" data-p="' + x.id + '" aria-pressed="' + (x.id === S.preset) + '">' + esc(x.name) + '</button>'; }).join("");
		$("hs-pnote").textContent = presetObj().note;
	}
	$("hs-pre").addEventListener("click", function (e) { var b = e.target.closest("[data-p]"); if (!b) return; S.preset = b.dataset.p; S.p = H.params(presetObj().p); paintPresets(); syncSliders(); run(); save(); });

	/* ---------- sliders ---------- */
	var SL = [
		["hs-hr", "hr", function (v) { return f0(v); }], ["hs-hr2", "hr", function (v) { return f0(v); }], ["hs-ees", "ees", function (v) { return v.toFixed(2); }],
		["hs-vol", "vol", function (v) { return f0(v); }], ["hs-svr", "svr", function (v) { return f0(v * 1333) + " dyn·s·cm⁻⁵"; }], ["hs-edb", "edB", function (v) { return v.toFixed(3); }],
		["hs-ca", "ca", function (v) { return v.toFixed(2); }], ["hs-ava", "ava", function (v) { return v.toFixed(2); }], ["hs-mva", "mva", function (v) { return v.toFixed(2); }],
		["hs-mr", "mr", function (v) { return v.toFixed(2); }], ["hs-ar", "ar", function (v) { return v.toFixed(2); }], ["hs-kick", "laKick", function (v) { return v === 0 ? "none (AF)" : v.toFixed(2) + "×"; }]
	];
	function syncSliders() { SL.forEach(function (s) { var el = $(s[0]); el.value = S.p[s[1]]; $(s[0] + "-v").textContent = s[2](+S.p[s[1]]); }); }
	SL.forEach(function (s) { $(s[0]).addEventListener("input", function () { S.p[s[1]] = +this.value; syncSliders(); schedule(); }); });
	var SPD = [0.1, 0.25, 0.5, 0.75, 1, 1.5];
	function syncSpd() { $("hs-spd").value = S.spd; $("hs-spd-v").textContent = SPD[S.spd] + "× (" + (SPD[S.spd] < 1 ? "slow motion" : "real time") + ")"; }
	$("hs-spd").addEventListener("input", function () { S.spd = +this.value; syncSpd(); save(); });
	$("hs-reset").addEventListener("click", function () { S.p = H.params(presetObj().p); syncSliders(); run(); save(); });
	function chk(id, k, after) { var el = $(id); el.checked = S[k]; el.addEventListener("change", function () { S[k] = el.checked; save(); if (after) after(); }); }
	chk("hs-o-ph", "ph"); chk("hs-o-ev", "ev"); chk("hs-o-la", "la"); chk("hs-o-lines", "lines", paintPV); chk("hs-o-ea", "ea", paintPV);

	/* ---------- canvas sizing (works with stage-ctl's View bar: fixed aspect per stage) ---------- */
	/* Finger-friendly dragging: the stages use touch-action:pan-y, so an up/down swipe always scrolls the page.
	   Mouse and pen drag at once; a finger only takes over once the move is clearly sideways (or on a plain tap). */
	function hdrag(cv, h) {
		var id = null, on = false, sx = 0, sy = 0;
		function begin(e) { on = true; h.down(e); try { cv.setPointerCapture(e.pointerId); } catch (x) {} }
		cv.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return; id = e.pointerId; sx = e.clientX; sy = e.clientY; on = false;
			if (e.pointerType !== "touch") begin(e);
		});
		cv.addEventListener("pointermove", function (e) {
			if (e.pointerId !== id) return; if (on) { h.move(e); return; }
			var dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy);
			if (dx > 9 && dx > dy * 1.4) { begin(e); h.move(e); } else if (dy > 12) id = null;
		});
		cv.addEventListener("pointerup", function (e) {
			if (e.pointerId !== id) return;
			if (!on && Math.abs(e.clientX - sx) < 9 && Math.abs(e.clientY - sy) < 9) h.down(e);   // a tap moves the marker too
			h.up(e); on = false; id = null;
		});
		cv.addEventListener("pointercancel", function (e) { if (e.pointerId !== id) return; if (on) h.up(e); on = false; id = null; });
	}
	var CV = { cycle: { st: $("hs-cstage"), cv: $("hs-cc") }, pv: { st: $("hs-pstage"), cv: $("hs-pc") }, ecg: { st: $("hs-estage"), cv: $("hs-ec") } };
	function aspectOf(tab, w) {
		if (tab === "cycle") return w >= 700 ? 2.15 : 0.62;
		if (tab === "pv") return w >= 760 ? 1.9 : 1.1;
		var ppm = Math.max(4, w / 150); return (w / ppm) / 40;
	}
	function size(tab) {
		var o = CV[tab], wrap = o.st.parentNode, W = wrap.clientWidth; if (!W) return;
		var asp = aspectOf(tab, W), h = Math.round(W / asp);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) { var fh = window.MESStage && MESStage.fillH ? MESStage.fillH(wrap) : window.innerHeight - 90; if (h > fh) { h = fh; W = Math.round(h * asp); } }
		o.st.style.width = W + "px"; o.st.style.height = h + "px"; o.W = W; o.H = h;
		var cw = Math.round(W * dpr), ch = Math.round(h * dpr); if (o.cv.width !== cw || o.cv.height !== ch) { o.cv.width = cw; o.cv.height = ch; }
	}
	function onResize() { size(S.tab === "calc" ? "cycle" : S.tab); if (S.tab === "pv") paintPV(); if (S.tab === "ecg") drawECG(); if (S.tab === "cycle") drawCycle(); }
	function ctxOf(tab) { var c = CV[tab].cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); return c; }
	function full(id, tab) { $(id).addEventListener("click", function () { var w = CV[tab].st.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () {}); }); }
	full("hs-cfull", "cycle"); full("hs-pfull", "pv"); full("hs-efull", "ecg");

	/* ---------- the cardiac cycle: heart + Wiggers ---------- */
	var tc = 0, lastNow = 0, valveOpen = { mv: 1, av: 0 }, wig = null;
	function lerp(a, b, k) { return a + (b - a) * k; }
	function drawHeart(c, x0, y0, w, h, t) {
		var r = B.rec, i = idxAt(t), V = r.vlv[i], Vla = r.vla[i], e = r.e[i], k = Math.min(w / 400, h / 360), ox = x0 + (w - 400 * k) / 2, oy = y0 + (h - 360 * k) / 2;
		c.save(); c.translate(ox, oy); c.scale(k, k);
		var sL = Math.cbrt(V / 125), sA = Math.cbrt(Math.max(5, Vla) / 55), apexY = 336, L = 150 * Math.sqrt(sL), plane = apexY - L, annW = 110 * (0.9 + 0.1 * sL), Wm = 120 * Math.pow(sL, 1.4), Wr = 104 * Math.pow(sL, 1.4);
		var qmv = r.qmv[i], qav = r.qav[i];
		valveOpen.mv = lerp(valveOpen.mv, qmv > 0.5 ? 1 : 0, 0.35); valveOpen.av = lerp(valveOpen.av, qav > 0.5 ? 1 : 0, 0.35);
		var red = "#c73a3f", redF = "rgba(214,60,66,0.85)", blueF = "rgba(70,110,210,0.85)", wall = e > 0.15 ? "#c46a74" : "#b0545f", lw = 7 + 16 * Math.max(0, 1 - sL);
		// pulmonary trunk and aorta (behind the atria)
		c.lineCap = "round";
		c.strokeStyle = "#3d5ea8"; c.lineWidth = 26; c.beginPath(); c.moveTo(183, plane); c.lineTo(183, 92); c.quadraticCurveTo(183, 62, 150, 62); c.lineTo(52, 62); c.stroke();
		c.strokeStyle = red; c.lineWidth = 28; c.beginPath(); c.moveTo(217, plane); c.lineTo(217, 62); c.quadraticCurveTo(217, 26, 260, 26); c.quadraticCurveTo(352, 26, 352, 80); c.lineTo(352, 128); c.stroke();
		// atria
		function atrium(cx, fill) { c.beginPath(); c.ellipse(cx, plane - 34 * sA, 46 * sA, 36 * sA, 0, 0, 6.2832); c.fillStyle = fill; c.fill(); c.lineWidth = 5; c.strokeStyle = "#a9505a"; c.stroke(); }
		atrium(118, blueF); atrium(282, redF);
		c.strokeStyle = "#3d5ea8"; c.lineWidth = 16; c.beginPath(); c.moveTo(118, plane - 70 * sA); c.lineTo(118, plane - 105); c.stroke(); c.beginPath(); c.moveTo(80, plane - 10); c.lineTo(50, plane + 8); c.stroke();
		c.strokeStyle = red; c.lineWidth = 10; c.beginPath(); c.moveTo(316, plane - 50 * sA); c.lineTo(352, plane - 70); c.stroke(); c.beginPath(); c.moveTo(318, plane - 24 * sA); c.lineTo(360, plane - 22); c.stroke();
		// ventricles
		function vent(dir, aw, mw, apex, fill) {
			var x = function (d) { return 200 + dir * d; };
			c.beginPath(); c.moveTo(200, plane); c.lineTo(x(aw), plane);
			c.quadraticCurveTo(x(mw * 1.06), plane + 0.25 * (apex - plane), x(mw), plane + 0.5 * (apex - plane));
			c.quadraticCurveTo(x(mw * 0.85), apex - 0.04 * (apex - plane), x(mw * 0.3), apex);
			c.quadraticCurveTo(x(4), apex, 200, plane + 0.55 * (apex - plane)); c.closePath();
			c.fillStyle = fill; c.fill(); c.lineJoin = "round"; c.lineWidth = lw; c.strokeStyle = wall; c.stroke();
		}
		vent(-1, annW * 0.95, Wr, apexY - 22, blueF); vent(1, annW, Wm, apexY, redF);
		c.strokeStyle = wall; c.lineWidth = lw + 3; c.beginPath(); c.moveTo(200, plane); c.lineTo(200, plane + 0.55 * L); c.stroke();
		// valves: AV valves swing down into the ventricle, outflow valves up into the arteries
		function leaflets(x1, x2, open, down) {
			var len = (x2 - x1) / 2, a = open * 1.25 * (down ? 1 : -1);
			c.strokeStyle = "#f4f0e8"; c.lineWidth = 3.2; c.beginPath();
			c.moveTo(x1, plane); c.lineTo(x1 + len * Math.cos(a), plane + len * Math.sin(a));
			c.moveTo(x2, plane); c.lineTo(x2 - len * Math.cos(a), plane + len * Math.sin(a)); c.stroke();
		}
		leaflets(84, 160, valveOpen.mv, true); leaflets(236, 312, valveOpen.mv, true); leaflets(170, 196, valveOpen.av, false); leaflets(204, 230, valveOpen.av, false);
		// flow arrows
		function arrow(xa, ya, xb, yb, a) { if (a < 0.05) return; c.globalAlpha = Math.min(1, a); c.strokeStyle = "#fff"; c.fillStyle = "#fff"; c.lineWidth = 3; c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke(); var an = Math.atan2(yb - ya, xb - xa); c.beginPath(); c.moveTo(xb, yb); c.lineTo(xb - 11 * Math.cos(an - 0.45), yb - 11 * Math.sin(an - 0.45)); c.lineTo(xb - 11 * Math.cos(an + 0.45), yb - 11 * Math.sin(an + 0.45)); c.fill(); c.globalAlpha = 1; }
		arrow(274, plane - 34, 274, plane + 40, Math.max(0, qmv) / 300); arrow(122, plane - 34, 122, plane + 40, Math.max(0, qmv) / 300);
		arrow(217, plane - 6, 217, 70, Math.max(0, qav) / 250); arrow(183, plane - 6, 183, 96, Math.max(0, qav) / 250);
		if (qmv < -5) arrow(274, plane + 24, 274, plane - 40, -qmv / 150); if (qav < -5) arrow(217, 80, 217, plane + 20, -qav / 150);
		// labels
		c.fillStyle = "#fff"; c.font = "bold 15px system-ui,sans-serif"; c.textAlign = "center";
		c.fillText("RA", 118, plane - 30); c.fillText("LA", 282, plane - 30); c.fillText("RV", 200 - Wr * 0.5, plane + 0.45 * L); c.fillText("LV", 200 + Wm * 0.5, plane + 0.42 * L);
		c.font = "12px system-ui,sans-serif"; c.fillText(f0(V) + " ml", 200 + Wm * 0.5, plane + 0.42 * L + 16);
		c.fillStyle = "#c8d0e0"; c.font = "11px system-ui,sans-serif"; c.fillText("aorta", 290, 18); c.fillText("pulmonary artery", 70, 52);
		c.textAlign = "left"; c.fillText("right side follows the left's timing (simplified)", 4, 356);
		c.restore();
	}
	function wiggersLayout(x0, y0, w, h) {
		var L = { x: x0 + 48, w: w - 58, y: y0, h: h };
		var av = Math.max(120, h - 28 - 26 - 22);
		L.band = [y0 + 2, 22]; L.p = [y0 + 28, av * 0.47]; L.v = [L.p[0] + L.p[1] + 8, av * 0.2]; L.e = [L.v[0] + L.v[1] + 8, av * 0.18]; L.s = [L.e[0] + L.e[1] + 6, av * 0.15]; L.ax = L.s[0] + L.s[1] + 4;
		return L;
	}
	function ecgWig(t) {   // sinus lead II matched to the model's beat (QRS onset = start of the beat)
		var T = B.T, pr = B.tm.pr, qt = H.qtFor(T), y = 0;
		for (var k = -1; k <= 3; k++) { var t0 = k * T; y += H.gsum(H.complex({ m: "n", qrs: 0.09, qt: qt }), t0, t); if (S.p.laKick > 0.05) y += H.gsum(H.pwave(0.15), t0 - pr, t); }
		if (S.p.laKick <= 0.05) y += 0.03 * Math.sin(6.2832 * 6.1 * t) + 0.02 * Math.sin(6.2832 * 7.7 * t + 1);
		return y;
	}
	function phono(t) {   // envelope of the heart sounds (0..1) at time t within the beat
		var ev = B.ev, T = B.T, env = 0, tt = ((t % T) + T) % T, p = S.p, r = B.rec, i = idxAt(tt);
		function burst(c, d, a) { var x = tt - c; if (x < -0.01) x += T; if (x > T - 0.02) x -= T; if (x >= 0 && x < d) env = Math.max(env, a * Math.sin(Math.PI * x / d)); }
		if (ev.mc >= 0) burst(ev.mc + 0.005, 0.1, 1); if (ev.ac >= 0) burst(ev.ac, 0.075, 0.85);
		if (B.xs.s3 && ev.mo >= 0) burst(ev.mo + 0.13, 0.05, 0.45); if (B.xs.s4) burst(B.tm.a0 + 0.06, 0.045, 0.4);
		var q = r.qav[i], m = 0;
		if (p.ava < 2 && q > 0) m = Math.max(m, Math.min(0.75, q * q / (2500 * p.ava * p.ava) / 60));
		if (r.qmv[i] < 0) m = Math.max(m, Math.min(0.6, -r.qmv[i] / 250));
		if (q < 0 && p.ar > 0) m = Math.max(m, Math.min(0.55, -q / 180));
		if (p.mva < 2 && r.qmv[i] > 0) m = Math.max(m, Math.min(0.4, r.qmv[i] * r.qmv[i] / (2500 * p.mva * p.mva) / 20));
		return { s: env, m: m };
	}
	function drawWiggers(c, x0, y0, w, h, tPlay) {
		var L = wiggersLayout(x0, y0, w, h), T = B.T, span = 2 * T, r = B.rec, X = function (t) { return L.x + t / span * L.w; };
		wig = { L: L, span: span };
		var dim = "#9aa5bb", grid = "#1f2533";
		// phase bands
		var cols = { ivc: "rgba(255,180,90,0.13)", ej: "rgba(255,90,90,0.12)", ivr: "rgba(140,170,255,0.13)", rf: "rgba(90,200,160,0.12)", dia: "rgba(120,120,140,0.08)", as: "rgba(220,140,255,0.12)" };
		B.ph.forEach(function (ph) {
			if (ph.a < 0 || ph.b <= ph.a) return;
			for (var k = -1; k <= 1; k++) { var a = Math.max(0, ph.a + k * T), b = Math.min(span, ph.b + k * T); if (b <= a) continue; c.fillStyle = cols[ph.id]; c.fillRect(X(a), L.band[0], X(b) - X(a), L.ax - L.band[0]);
				if (S.ph && X(b) - X(a) > 34) { c.fillStyle = "#c8d0e0"; c.font = "10px system-ui,sans-serif"; c.textAlign = "center"; var words = { ivc: "Isovol. contr.", ej: "Ejection", ivr: "Isovol. relax.", rf: "Rapid filling", dia: "Diastasis", as: "Atrial kick" }[ph.id]; c.fillText((X(b) - X(a) > 70 ? words : words.split(" ")[0]), (X(a) + X(b)) / 2, L.band[0] + 14); } }
		});
		var pmax = Math.max(140, Math.ceil(Math.max.apply(null, r.plv) / 20) * 20), vmin = Math.min.apply(null, r.vlv), vmax = Math.max.apply(null, r.vlv), vlo = Math.floor((vmin - 10) / 20) * 20, vhi = Math.ceil((vmax + 10) / 20) * 20;
		function axis(row, lo, hi, ticks, unit) {
			c.strokeStyle = grid; c.lineWidth = 1; c.fillStyle = dim; c.font = "10px system-ui,sans-serif"; c.textAlign = "right";
			ticks.forEach(function (v) { var y = row[0] + row[1] - (v - lo) / (hi - lo) * row[1]; c.beginPath(); c.moveTo(L.x, y); c.lineTo(L.x + L.w, y); c.stroke(); c.fillText(v, L.x - 4, y + 3); });
			c.save(); c.translate(x0 + 9, row[0] + row[1] / 2); c.rotate(-Math.PI / 2); c.textAlign = "center"; c.fillText(unit, 0, 0); c.restore();
		}
		var pt = []; for (var v = 0; v <= pmax; v += pmax > 200 ? 50 : 40) pt.push(v); axis(L.p, 0, pmax, pt, "mmHg");
		axis(L.v, vlo, vhi, [vlo, Math.round((vlo + vhi) / 40) * 20, vhi], "LV ml");
		function trace(arr, row, lo, hi, col, wid, dash) {
			c.strokeStyle = col; c.lineWidth = wid; c.setLineDash(dash || []); c.beginPath();
			for (var k = 0; k < 2; k++) for (var j = 0; j < arr.length; j += 1) { var t = k * T + r.t[j], y = row[0] + row[1] - (arr[j] - lo) / (hi - lo) * row[1]; if (k === 0 && j === 0) c.moveTo(X(t), y); else c.lineTo(X(t), y); }
			c.stroke(); c.setLineDash([]);
		}
		trace(r.pao, L.p, 0, pmax, "#ff6b6b", 2); trace(r.plv, L.p, 0, pmax, "#ffd166", 2.2); if (S.la) trace(r.pla, L.p, 0, pmax, "#7fd1ff", 1.8);
		trace(r.vlv, L.v, vlo, vhi, "#9be89b", 2);
		// legend
		c.font = "11px system-ui,sans-serif"; c.textAlign = "left"; var lg = [["Aortic", "#ff6b6b"], ["LV", "#ffd166"]]; if (S.la) lg.push(["LA", "#7fd1ff"]); var lx = L.x + 6;
		lg.forEach(function (g) { c.fillStyle = g[1]; c.fillRect(lx, L.p[0] + 4, 12, 3); c.fillText(g[0], lx + 15, L.p[0] + 9); lx += 62; });
		// ECG row
		var er = L.e; c.strokeStyle = "#c8f7c5"; c.lineWidth = 1.6; c.beginPath();
		for (var px = 0; px <= L.w; px += 1) { var t = px / L.w * span, y = er[0] + er[1] * 0.72 - ecgWig(t) / 1.4 * er[1] * 0.8; if (!px) c.moveTo(L.x + px, y); else c.lineTo(L.x + px, y); }
		c.stroke(); c.fillStyle = dim; c.textAlign = "right"; c.fillText("ECG", L.x - 4, er[0] + er[1] * 0.6);
		// phonocardiogram
		var sr = L.s, mid = sr[0] + sr[1] / 2; c.strokeStyle = "#e6e6f0"; c.lineWidth = 1; c.beginPath();
		for (px = 0; px <= L.w; px += 1.5) { var tt = px / L.w * span, ph = phono(tt), a = Math.max(ph.s, ph.m * (0.6 + 0.4 * Math.sin(px * 7.3))); if (a < 0.02) continue; var hh = a * sr[1] / 2; c.moveTo(L.x + px, mid - hh); c.lineTo(L.x + px, mid + hh); }
		c.stroke(); c.strokeStyle = grid; c.beginPath(); c.moveTo(L.x, mid); c.lineTo(L.x + L.w, mid); c.stroke(); c.fillStyle = dim; c.fillText("Sounds", L.x - 4, mid + 3);
		// sound labels
		c.textAlign = "center"; c.fillStyle = "#e6e6f0"; c.font = "10px system-ui,sans-serif";
		for (var kk = 0; kk < 2; kk++) { if (B.ev.mc >= 0) c.fillText("S1", X(kk * T + B.ev.mc + 0.05), sr[0] + 2); if (B.ev.ac >= 0) c.fillText("S2", X(kk * T + B.ev.ac + 0.04), sr[0] + 2); if (B.xs.s3) c.fillText("S3", X(kk * T + B.ev.mo + 0.155), sr[0] + 2); if (B.xs.s4) c.fillText("S4", X(kk * T + B.tm.a0 + 0.08), sr[0] + 2); }
		// valve events
		if (S.ev) {
			var evs = [["MC", B.ev.mc, "mitral closes"], ["AO", B.ev.ao, "aortic opens"], ["AC", B.ev.ac, "aortic closes"], ["MO", B.ev.mo, "mitral opens"]];
			c.setLineDash([3, 3]); c.strokeStyle = "rgba(255,255,255,0.35)"; c.fillStyle = "#fff"; c.font = "bold 10px system-ui,sans-serif";
			for (kk = 0; kk < 2; kk++) evs.forEach(function (e) { if (e[1] < 0) return; var x = X(kk * T + e[1]); c.beginPath(); c.moveTo(x, L.p[0]); c.lineTo(x, L.v[0] + L.v[1]); c.stroke(); if (kk === 0) c.fillText(e[0], x, L.p[0] + 22 + (e[0] === "AO" || e[0] === "MO" ? 11 : 0)); });
			c.setLineDash([]);
		}
		// time axis
		c.fillStyle = dim; c.font = "10px system-ui,sans-serif"; c.textAlign = "center";
		for (var s = 0; s <= span + 1e-6; s += 0.2) { c.fillText(s.toFixed(1), X(s), L.ax + 10); }
		c.textAlign = "right"; c.fillText("s", L.x + L.w + 8, L.ax + 10);
		// playhead
		var xp = X(tPlay); c.strokeStyle = "#ffffff"; c.lineWidth = 2; c.beginPath(); c.moveTo(xp, L.band[0]); c.lineTo(xp, L.ax); c.stroke();
	}
	function drawCycle() {
		if (!B || S.tab !== "cycle") return; var o = CV.cycle; if (!o.W) size("cycle"); var c = ctxOf("cycle"), W = o.W, Hh = o.H;
		c.fillStyle = "#0a0e16"; c.fillRect(0, 0, W, Hh);
		var t = tc % B.T, wide = W >= 700;
		if (wide) { drawHeart(c, 0, 26, W * 0.36, Hh - 30, t); drawWiggers(c, W * 0.36, 30, W * 0.64 - 6, Hh - 34, tc % (2 * B.T)); }
		else { var hh = W * 0.86; drawHeart(c, 0, 30, W, hh - 30, t); drawWiggers(c, 0, hh + 4, W - 4, Hh - hh - 8, tc % (2 * B.T)); }
		var ph = phaseAt(t); c.fillStyle = "#fff"; c.font = "bold 14px system-ui,sans-serif"; c.textAlign = "left"; c.fillText(ph.name, 10, 20);
		paintCycleLive(t, ph);
	}
	function ro(label, val, sub, cls) { return '<div class="hs-ro"><span>' + label + '</span><b' + (cls ? ' class="' + cls + '"' : "") + '>' + val + '</b><small>' + (sub || "") + '</small></div>'; }
	var liveEls = null;
	function paintCycleRO() {
		if (!B) return;
		$("hs-cro").innerHTML = ro("LV pressure", "<span id='hs-l-plv'>–</span>", "mmHg now") + ro("Aortic pressure", "<span id='hs-l-pao'>–</span>", "mmHg now") + ro("LA pressure", "<span id='hs-l-pla'>–</span>", "mmHg now") + ro("LV volume", "<span id='hs-l-v'>–</span>", "ml now") +
			ro("Blood pressure", f0(B.sbp) + "/" + f0(B.dbp), "mmHg, MAP " + f0(B.map)) + ro("Stroke volume", f0(B.sv) + " ml", "EF " + f0(B.ef * 100) + "%") + ro("Cardiac output", f1(B.co), "L/min at " + f0(S.p.hr) + "/min");
		liveEls = { plv: $("hs-l-plv"), pao: $("hs-l-pao"), pla: $("hs-l-pla"), v: $("hs-l-v") };
	}
	function paintCycleLive(t, ph) {
		if (!liveEls) return; var r = B.rec, i = idxAt(t);
		liveEls.plv.textContent = f0(r.plv[i]); liveEls.pao.textContent = f0(r.pao[i]); liveEls.pla.textContent = f1(r.pla[i]); liveEls.v.textContent = f0(r.vlv[i]);
		$("hs-scrub").value = Math.round(t / B.T * 1000); $("hs-scrub-v").textContent = Math.round(t * 1000) + " ms · " + ph.name;
	}
	function setPlay(on) { S.play = on; $("hs-cplay").textContent = on ? "❚❚ Pause" : "▶ Play"; $("hs-cplay").setAttribute("aria-pressed", on ? "true" : "false"); }
	$("hs-cplay").addEventListener("click", function () { setPlay(!S.play); });
	$("hs-scrub").addEventListener("input", function () { setPlay(false); tc = +this.value / 1000 * B.T; drawCycle(); });
	(function () {   // click / drag on the Wiggers diagram to scrub
		var cv = CV.cycle.cv, down = false;
		function at(e) { if (!wig) return; var rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, L = wig.L; if (x < L.x - 10) return; var t = Math.max(0, Math.min(wig.span - 0.001, (x - L.x) / L.w * wig.span)); setPlay(false); tc = t; drawCycle(); }
		hdrag(cv, { down: function (e) { down = true; at(e); }, move: function (e) { if (down) at(e); }, up: function () { down = false; } });
		cv.addEventListener("keydown", function (e) { if (e.key === " ") { e.preventDefault(); setPlay(!S.play); } if (e.key === "ArrowRight" || e.key === "ArrowLeft") { setPlay(false); tc = Math.max(0, tc + (e.key === "ArrowRight" ? 0.01 : -0.01)); drawCycle(); } });
	})();
	/* lub-dub with WebAudio */
	var AC = null;
	function thump(f, dur, g) { if (!AC) return; var t0 = AC.currentTime, o = AC.createOscillator(), v = AC.createGain(); o.type = "sine"; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.6, t0 + dur); v.gain.setValueAtTime(0.0001, t0); v.gain.exponentialRampToValueAtTime(g, t0 + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(v); v.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02); }
	$("hs-snd").addEventListener("click", function () { S.snd = !S.snd; if (S.snd && !AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { S.snd = false; } } if (AC && AC.state === "suspended") AC.resume(); this.textContent = S.snd ? "🔊 Sound" : "🔇 Sound"; this.setAttribute("aria-pressed", S.snd ? "true" : "false"); });

	/* ---------- pressure-volume loop ---------- */
	var pvT = 0;
	function paintPV() {
		if (!B) return;
		var cls = function (bad) { return bad ? "hs-bad" : ""; }, cpl = S.p.ees / B.ea;
		var h = ro("EDV", f0(B.edv) + " ml", "end-diastolic volume") + ro("ESV", f0(B.esv) + " ml", "end-systolic volume") + ro("Stroke volume", f0(B.sv) + " ml", B.mrVol + B.arVol > 3 ? "forward " + f0(B.netSv) + " ml" : "EDV − ESV") +
			ro("Ejection fraction", f0(B.ef * 100) + "%", "normal 52-72%", cls(B.ef < 0.5)) + ro("EDP", f1(B.edp) + " mmHg", "filling pressure", cls(B.edp > 15)) + ro("ESP", f0(B.esp) + " mmHg", "end-systolic pressure") +
			ro("Blood pressure", f0(B.sbp) + "/" + f0(B.dbp), "MAP " + f0(B.map) + " mmHg") + ro("Cardiac output", f1(B.co) + " L/min", f0(S.p.hr) + " beats/min") + ro("Stroke work", (B.sw * 1.333e-4).toFixed(2) + " J", f0(B.sw) + " mmHg·ml (loop area)") +
			ro("Ea (afterload)", f1(B.ea) + " mmHg/ml", "Ees/Ea = " + f1(cpl), cls(cpl < 0.8)) + ro("Mean LA pressure", f1(B.la) + " mmHg", "≈ wedge pressure", cls(B.la > 15));
		if (S.p.ava < 2.5) h += ro("Aortic gradient", f0(B.avGrad) + " mmHg", "mean, during ejection", cls(B.avGrad >= 40));
		if (S.p.mva < 3) h += ro("Mitral gradient", f1(B.mvGrad) + " mmHg", "mean, during filling", cls(B.mvGrad >= 5));
		if (S.p.mr > 0 || S.p.ar > 0) h += ro("Regurgitation", f0(B.mrVol + B.arVol) + " ml", "fraction " + f0(B.rf * 100) + "%", cls(B.rf >= 0.5));
		$("hs-pro").innerHTML = h; drawPV();
	}
	function drawPV() {
		if (!B || S.tab !== "pv") return; var o = CV.pv; if (!o.W) size("pv"); var c = ctxOf("pv"), W = o.W, Hh = o.H, wide = W >= 760, p = S.p;
		c.fillStyle = "#0a0e16"; c.fillRect(0, 0, W, Hh);
		var pw = wide ? W * 0.62 : W, L = { x: 52, y: 14, w: pw - 66, h: Hh - 50 };
		var loops = [B]; if (G) loops.push(G); if (OCC) loops = loops.concat(OCC);
		var vmaxD = 0, pmaxD = 0; loops.forEach(function (b) { vmaxD = Math.max(vmaxD, b.edv); pmaxD = Math.max(pmaxD, b.plvMax); });
		var vmax = Math.max(200, Math.ceil(vmaxD * 1.2 / 50) * 50), pmax = Math.max(160, Math.ceil(pmaxD * 1.12 / 20) * 20);
		var X = function (v) { return L.x + v / vmax * L.w; }, Y = function (pp) { return L.y + L.h - pp / pmax * L.h; };
		c.strokeStyle = "#1f2533"; c.lineWidth = 1; c.fillStyle = "#9aa5bb"; c.font = "11px system-ui,sans-serif"; c.textAlign = "center";
		for (var v = 0; v <= vmax; v += 50) { c.beginPath(); c.moveTo(X(v), L.y); c.lineTo(X(v), L.y + L.h); c.stroke(); c.fillText(v, X(v), L.y + L.h + 14); }
		c.textAlign = "right"; for (var pp = 0; pp <= pmax; pp += 40) { c.beginPath(); c.moveTo(L.x, Y(pp)); c.lineTo(L.x + L.w, Y(pp)); c.stroke(); c.fillText(pp, L.x - 5, Y(pp) + 4); }
		c.textAlign = "center"; c.fillText("Left ventricular volume (ml)", L.x + L.w / 2, L.y + L.h + 30);
		c.save(); c.translate(13, L.y + L.h / 2); c.rotate(-Math.PI / 2); c.fillText("LV pressure (mmHg)", 0, 0); c.restore();
		c.save(); c.beginPath(); c.rect(L.x, L.y, L.w, L.h); c.clip();
		if (S.lines) {
			c.strokeStyle = "#ff9f43"; c.lineWidth = 1.6; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(X(p.v0), Y(0)); c.lineTo(X(p.v0 + pmax / p.ees), Y(pmax)); c.stroke();
			c.strokeStyle = "#5fb8ff"; c.beginPath(); for (v = p.v0; v <= vmax; v += 2) { var y = Y(H.edpvr(p, v)); if (v === p.v0) c.moveTo(X(v), y); else c.lineTo(X(v), y); if (y < L.y) break; } c.stroke(); c.setLineDash([]);
		}
		if (S.ea) { c.strokeStyle = "#c792ea"; c.lineWidth = 1.4; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(X(B.edv), Y(0)); c.lineTo(X(B.esv - 0.15 * B.sv), Y(B.esp * 1.15)); c.stroke(); c.setLineDash([]); }
		function loop(b, col, wd, dash) { var r = b.rec; c.strokeStyle = col; c.lineWidth = wd; c.setLineDash(dash || []); c.beginPath(); for (var j = 0; j < r.t.length; j++) { var x = X(r.vlv[j]), yy = Y(r.plv[j]); if (!j) c.moveTo(x, yy); else c.lineTo(x, yy); } c.closePath(); c.stroke(); c.setLineDash([]); }
		if (OCC) OCC.forEach(function (b, k) { loop(b, "hsla(" + (40 + k * 22) + ",80%,62%,0.75)", 1.2); });
		if (OCC) { var fit = H.fitLine(OCC.slice(2).map(function (b) { return [b.esv, b.esp]; })); c.strokeStyle = "#fff"; c.lineWidth = 1.2; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(fit.v0), Y(0)); c.lineTo(X(fit.v0 + pmax / fit.slope), Y(pmax)); c.stroke(); c.setLineDash([]); OCC.fit = fit; }
		if (G) loop(G, "rgba(200,208,224,0.55)", 1.5, [5, 5]);
		c.fillStyle = "rgba(255,209,102,0.10)"; var r = B.rec; c.beginPath(); for (var j = 0; j < r.t.length; j++) { if (!j) c.moveTo(X(r.vlv[j]), Y(r.plv[j])); else c.lineTo(X(r.vlv[j]), Y(r.plv[j])); } c.closePath(); c.fill();
		loop(B, "#ffd166", 2.6);
		c.restore();
		// corner labels
		c.font = "11px system-ui,sans-serif"; c.fillStyle = "#e8ecf5";
		function lab(t, txt, dx, dy, al) { if (t < 0) return; var i = idxAt(t); c.textAlign = al; c.beginPath(); c.arc(X(r.vlv[i]), Y(r.plv[i]), 3.5, 0, 6.3); c.fill(); c.fillText(txt, X(r.vlv[i]) + dx, Y(r.plv[i]) + dy); }
		lab(B.ev.mc, "mitral closes (EDV)", 6, 14, "left"); lab(B.ev.ao, "aortic opens", 6, -6, "left"); lab(B.ev.ac, "aortic closes (ESV)", -6, -6, "right"); lab(B.ev.mo, "mitral opens", -6, 14, "right");
		// line labels
		if (S.lines) { c.fillStyle = "#ff9f43"; c.textAlign = "left"; var vx = Math.min(vmax * 0.92, p.v0 + pmax * 0.88 / p.ees); c.fillText("ESPVR (slope Ees " + p.ees.toFixed(1) + ")", X(vx) - 120 > L.x ? X(vx) - 120 : L.x + 4, Y(p.ees * (vx - p.v0)) - 6); c.fillStyle = "#5fb8ff"; c.textAlign = "right"; c.fillText("EDPVR", L.x + L.w - 6, Math.max(L.y + 12, Y(H.edpvr(p, vmax * 0.98)) + 14)); }
		if (G && (Math.abs(G.edv - B.edv) > 0.5 || Math.abs(G.esp - B.esp) > 0.5)) { c.fillStyle = "#c8d0e0"; c.textAlign = "left"; c.fillText("dashed: comparison loop", L.x + 6, L.y + 14); }
		if (OCC && OCC.fit) { c.fillStyle = "#fff"; c.textAlign = "left"; c.fillText("Caval occlusion: measured ESPVR slope " + OCC.fit.slope.toFixed(2) + " mmHg/ml (set: " + p.ees.toFixed(2) + ")", L.x + 6, L.y + 30); }
		// moving dot
		var tt = pvT % B.T, ii = idxAt(tt); c.fillStyle = "#fff"; c.beginPath(); c.arc(X(r.vlv[ii]), Y(r.plv[ii]), 5.5, 0, 6.3); c.fill();
		if (wide) {   // pressure-time inset
			var M = { x: pw + 40, y: 20, w: W - pw - 54, h: Hh - 70 }, T = B.T, pm = pmax;
			c.fillStyle = "#9aa5bb"; c.textAlign = "center"; c.fillText("Pressures in one beat", M.x + M.w / 2, M.y - 6);
			c.strokeStyle = "#1f2533"; c.strokeRect(M.x, M.y, M.w, M.h);
			[["pao", "#ff6b6b"], ["plv", "#ffd166"], ["pla", "#7fd1ff"]].forEach(function (s) { c.strokeStyle = s[1]; c.lineWidth = 1.8; c.beginPath(); for (var j = 0; j < r.t.length; j++) { var x = M.x + r.t[j] / T * M.w, y = M.y + M.h - r[s[0]][j] / pm * M.h; if (!j) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); });
			var xl = M.x + tt / T * M.w; c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(xl, M.y); c.lineTo(xl, M.y + M.h); c.stroke();
			c.fillStyle = "#9aa5bb"; c.textAlign = "left"; c.fillText("0", M.x - 12, M.y + M.h); c.fillText(pm, M.x - 26, M.y + 8); c.textAlign = "center"; c.fillText(Math.round(T * 1000) + " ms", M.x + M.w - 20, M.y + M.h + 14);
			[["Aortic", "#ff6b6b"], ["LV", "#ffd166"], ["LA", "#7fd1ff"]].forEach(function (g, k) { c.fillStyle = g[1]; c.fillRect(M.x + 6 + k * 60, M.y + M.h + 22, 12, 3); c.fillStyle = "#c8d0e0"; c.textAlign = "left"; c.fillText(g[0], M.x + 22 + k * 60, M.y + M.h + 27); });
		}
	}
	$("hs-ghost").addEventListener("click", function () { if (G) { G = null; this.textContent = "⧉ Keep loop"; } else { G = B; this.textContent = "✕ Clear kept loop"; toast("Loop kept as the dashed outline: now change something"); } drawPV(); });
	$("hs-occ").addEventListener("click", function () { OCC = H.cavalOcclusion(S.p, { beats: 10 }); drawPV(); });
	$("hs-tocalc").addEventListener("click", function () { fillCalc(); setTab("calc"); });

	/* ---------- ECG strip ---------- */
	var gen = null, tE = 0, eplay = true, cal = null, quiz = null, seed = 1 + Math.floor(Math.random() * 1e6);
	function newGen() { gen = H.rhythm(S.rh, seed++); tE = 0; gen.until(30); cal = cal ? { a: tE + 1, b: tE + 1.8 } : null; }
	function paintRhythms() {
		var groups = {}; H.RHYTHMS.forEach(function (r) { (groups[r.grp] = groups[r.grp] || []).push(r); });
		$("hs-rhythms").innerHTML = Object.keys(groups).map(function (gk) { return '<div class="hs-rgrp"><span>' + esc(gk) + '</span><div class="hs-chips" role="group" aria-label="' + esc(gk) + ' rhythms">' + groups[gk].map(function (r) { return '<button type="button" data-rh="' + r.id + '" aria-pressed="' + (r.id === S.rh) + '">' + esc(r.name) + '</button>'; }).join("") + '</div></div>'; }).join("");
		var R = H.RHYTHMS.find(function (x) { return x.id === S.rh; });
		$("hs-rhythms").hidden = !!quiz; $("hs-hint").textContent = quiz && !quiz.done ? "" : R.hint; $("hs-ebadge").textContent = quiz && !quiz.done ? "Lead II · ?" : "Lead II · " + R.name;
	}
	$("hs-rhythms").addEventListener("click", function (e) { var b = e.target.closest("[data-rh]"); if (!b) return; S.rh = b.dataset.rh; newGen(); paintRhythms(); paintTruth(); save(); drawECG(); });
	function ecgGeom() { var o = CV.ecg, ppm = o.H / 40, secs = o.W / ppm / S.esp; return { ppm: ppm, secs: secs, W: o.W, H: o.H }; }
	function drawECG() {
		if (!gen || S.tab !== "ecg") return; var o = CV.ecg; if (!o.W) size("ecg"); var c = ctxOf("ecg"), g = ecgGeom(), ppm = g.ppm, W = g.W, Hh = g.H, mon = S.mon;
		root.classList.toggle("hs-mon", mon);
		c.fillStyle = mon ? "#030805" : "#fff6f4"; c.fillRect(0, 0, W, Hh);
		var t1 = Math.max(g.secs, tE), t0 = t1 - g.secs, pxs = ppm * S.esp;   // px per second
		// grid tied to paper time so it scrolls with the trace
		var off = ((t0 * S.esp) % 1) * ppm;
		if (!mon) {
			c.lineWidth = 1; for (var i = -1, n = Math.ceil(W / ppm) + 2; i < n; i++) { var x = i * ppm - off, mm = Math.round(t0 * S.esp) + i; c.strokeStyle = mm % 5 === 0 ? "rgba(225,80,80,0.55)" : "rgba(240,150,150,0.35)"; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, Hh); c.stroke(); }
			for (i = 0; i <= 40; i++) { var y = i * ppm; c.strokeStyle = i % 5 === 0 ? "rgba(225,80,80,0.55)" : "rgba(240,150,150,0.35)"; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
		} else { c.strokeStyle = "rgba(60,140,80,0.18)"; for (i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(0, i * Hh / 8); c.lineTo(W, i * Hh / 8); c.stroke(); } }
		var base = Hh * 0.6, mv = S.gain * ppm;
		// calibration pulse at the left: 1 mV, 0.2 s
		c.strokeStyle = mon ? "#5dff8f" : "#111"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(4, base); c.lineTo(4 + 0.04 * pxs, base); c.lineTo(4 + 0.04 * pxs, base - mv); c.lineTo(4 + 0.24 * pxs, base - mv); c.lineTo(4 + 0.24 * pxs, base); c.lineTo(4 + 0.3 * pxs, base); c.stroke();
		var xs = 4 + 0.34 * pxs; c.beginPath(); var started = false;
		for (var px = xs; px <= W; px += 1) { var t = t0 + px / pxs, v = gen.at(t), yy = base - v * mv; if (!started) { c.moveTo(px, yy); started = true; } else c.lineTo(px, yy); }
		c.lineWidth = mon ? 1.8 : 1.5; c.stroke();
		c.fillStyle = mon ? "#b8ffcf" : "#333"; c.font = "bold 13px system-ui,sans-serif"; c.textAlign = "left"; c.fillText("II", 6, 16);
		c.font = "11px system-ui,sans-serif"; c.fillText(S.esp + " mm/s · " + S.gain + " mm/mV", 26, 16);
		// calipers
		if (cal) {
			[cal.a, cal.b].forEach(function (tt) { var x = (tt - t0) * pxs; c.strokeStyle = "#1565c0"; if (mon) c.strokeStyle = "#7fd1ff"; c.lineWidth = 1.8; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, Hh); c.stroke(); c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(x, 10, 6, 0, 6.3); c.fill(); });
			var xa = (cal.a - t0) * pxs, xb = (cal.b - t0) * pxs, dt = Math.abs(cal.b - cal.a); c.fillStyle = mon ? "#7fd1ff" : "#0d47a1"; c.textAlign = "center"; c.font = "bold 12px system-ui,sans-serif";
			c.fillText(Math.round(dt * 1000) + " ms", (xa + xb) / 2, Hh - 8);
			paintCaliperRO(dt);
		}
	}
	function paintCaliperRO(dt) {
		if (!cal) { $("hs-ero").innerHTML = ro("Calipers", "off", "press 📏 Calipers") + ro("Paper", S.esp + " mm/s", "small square " + (1 / S.esp * 1000) + " ms") + ro("Gain", S.gain + " mm/mV", "small square " + f1(1 / S.gain) + " mV"); return; }
		var small = dt * S.esp, big = small / 5;
		$("hs-ero").innerHTML = ro("Interval", Math.round(dt * 1000) + " ms", "between the caliper lines") + ro("Small squares", f1(small), "1 mm each") + ro("Big squares", f1(big), "5 mm each") +
			ro("Rate if RR", f0(60 / dt) + "/min", "60 ÷ interval") + ro("300 rule", f0(300 / big * (S.esp / 25)), "300 ÷ big squares (at 25 mm/s)") + ro("1500 rule", f0(1500 / small * (S.esp / 25)), "1500 ÷ small squares");
	}
	function setEPlay(on) { eplay = on; $("hs-eplay").textContent = on ? "❚❚ Pause" : "▶ Play"; $("hs-eplay").setAttribute("aria-pressed", on ? "true" : "false"); }
	$("hs-eplay").addEventListener("click", function () { setEPlay(!eplay); });
	$("hs-cal").addEventListener("click", function () {
		if (cal) { cal = null; this.setAttribute("aria-pressed", "false"); CV.ecg.cv.classList.remove("hs-calon"); paintCaliperRO(); drawECG(); return; }
		setEPlay(false); var g = ecgGeom(), t1 = Math.max(g.secs, tE), t0 = t1 - g.secs;
		var bs = gen.beats.filter(function (b) { return b.t > t0 + 0.3 && b.t < t1 - 0.3; });   // start on two R waves if there are any
		cal = bs.length >= 2 ? { a: bs[0].t + 0.04 * (bs[0].qrs / 0.09) * (bs[0].m === "w" ? 3 : 1), b: bs[1].t + 0.04 * (bs[1].qrs / 0.09) * (bs[1].m === "w" ? 3 : 1) } : { a: t0 + g.secs * 0.35, b: t0 + g.secs * 0.55 };
		this.setAttribute("aria-pressed", "true"); CV.ecg.cv.classList.add("hs-calon"); drawECG();
	});
	(function () {
		var cv = CV.ecg.cv, drag = null;
		function tAt(e) { var g = ecgGeom(), rc = cv.getBoundingClientRect(), t1 = Math.max(g.secs, tE); return t1 - g.secs + (e.clientX - rc.left) / (g.ppm * S.esp); }
		hdrag(cv, { down: function (e) { if (!cal) return; var t = tAt(e); drag = Math.abs(t - cal.a) < Math.abs(t - cal.b) ? "a" : "b"; cal[drag] = t; if (eplay) setEPlay(false); drawECG(); },
			move: function (e) { if (drag) { cal[drag] = tAt(e); drawECG(); } }, up: function () { drag = null; } });
		cv.addEventListener("keydown", function (e) { if (e.key === " ") { e.preventDefault(); setEPlay(!eplay); } if (cal && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); cal.b += (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 0.04 : 0.004); drawECG(); } });
	})();
	function ms(x) { return x == null ? "–" : Array.isArray(x) ? x.map(function (v) { return Math.round(v * 1000); }).join(", ") + " ms" : Math.round(x * 1000) + " ms"; }
	function paintTruth() {
		var t = gen.truth, box = $("hs-truthbox"); if (box.hidden) return;
		var qtc = t.qt && t.rate ? H.qtc(t.qt, 60 / (t.id === "longqt" ? 62 : t.rate)).bazett : null;
		box.innerHTML = "<b>Measurements of this strip:</b> ventricular rate " + (t.rate ? f0(t.rate) + "/min" : "none") + (t.regular ? " (regular)" : " (irregular)") + (t.pRate ? " · atrial rate " + f0(t.pRate) + "/min" : "") +
			" · PR " + ms(t.pr) + " · QRS " + ms(t.qrs) + " · QT " + ms(t.qt) + (qtc ? " · QTc (Bazett) " + Math.round(qtc * 1000) + " ms" : "") + ". Calipers measure from the start of one wave to the start of another (QT: QRS start to T end).";
	}
	$("hs-truth").addEventListener("click", function () { var b = $("hs-truthbox"); b.hidden = !b.hidden; this.textContent = b.hidden ? "Show the measurements" : "Hide the measurements"; paintTruth(); });
	$("hs-esp").value = S.esp; $("hs-egain").value = S.gain; $("hs-mon").checked = S.mon;
	$("hs-esp").addEventListener("change", function () { S.esp = +this.value; save(); paintCaliperRO(cal ? Math.abs(cal.b - cal.a) : 0); drawECG(); });
	$("hs-egain").addEventListener("change", function () { S.gain = +this.value; save(); drawECG(); });
	$("hs-mon").addEventListener("change", function () { S.mon = this.checked; save(); drawECG(); });
	/* quiz */
	function nextQ() {
		var pool = H.RHYTHMS.slice(), ans = pool[Math.floor(Math.random() * pool.length)];
		var opts = [ans]; while (opts.length < 4) { var x = pool[Math.floor(Math.random() * pool.length)]; if (opts.indexOf(x) < 0) opts.push(x); } opts.sort(function () { return Math.random() - 0.5; });
		quiz.ans = ans; quiz.done = false; S.rh = ans.id; newGen(); setEPlay(true);
		$("hs-qopts").innerHTML = opts.map(function (r) { return '<button type="button" data-qa="' + r.id + '">' + esc(r.name) + '</button>'; }).join("");
		$("hs-qfb").textContent = ""; $("hs-qscore").textContent = "Score " + quiz.ok + " / " + quiz.n; paintRhythms(); $("hs-truthbox").hidden = true; $("hs-truth").textContent = "Show the measurements";
	}
	$("hs-qbtn").addEventListener("click", function () {
		if (quiz) { quiz = null; $("hs-quiz").hidden = true; this.textContent = "🎓 Quiz me"; paintRhythms(); return; }
		quiz = { ok: 0, n: 0 }; $("hs-quiz").hidden = false; this.textContent = "✕ End the quiz"; nextQ();
	});
	$("hs-qopts").addEventListener("click", function (e) {
		var b = e.target.closest("[data-qa]"); if (!b || !quiz) return;
		if (quiz.done) return; quiz.done = true; quiz.n++; var right = b.dataset.qa === quiz.ans.id; if (right) quiz.ok++;
		Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) { if (x.dataset.qa === quiz.ans.id) x.classList.add("hs-right"); else if (x === b) x.classList.add("hs-wrong"); });
		$("hs-qfb").innerHTML = (right ? "✓ Right: " : "✗ It is <b>" + esc(quiz.ans.name) + "</b>: ") + esc(quiz.ans.hint) + ' <button type="button" class="tu-btn" id="hs-qnext">Next strip →</button>';
		$("hs-qscore").textContent = "Score " + quiz.ok + " / " + quiz.n; paintRhythms();
		$("hs-qnext").addEventListener("click", nextQ);
	});
	/* QTc calculator */
	function qtcPaint() {
		var qt = +$("hs-qt").value / 1000, rr = +$("hs-qrr").value / 1000, sex = $("hs-qsex").value, lim = sex === "f" ? 0.46 : 0.45;
		if (!(qt > 0 && rr > 0)) { $("hs-qtab").innerHTML = ""; return; }
		var r = H.qtc(qt, rr), rows = [["Bazett", r.bazett, "QT ÷ √RR (most used; over-corrects at fast rates)"], ["Fridericia", r.fridericia, "QT ÷ ∛RR (better at fast or slow rates)"], ["Framingham", r.framingham, "QT + 0.154 (1 − RR)"], ["Hodges", r.hodges, "QT + 1.75 (HR − 60) ms"]];
		$("hs-qtab").innerHTML = "<tr><th>Formula</th><th>QTc</th><th>Verdict</th><th>How</th></tr>" + rows.map(function (x) {
			var v = x[1], st = v >= 0.5 ? ['hi', "high risk (≥ 500)"] : v >= lim ? ['hi', "prolonged"] : v < 0.35 ? ['lo', "short (< 350)"] : ['ok', "normal"];
			return "<tr><td>" + x[0] + '</td><td class="hs-num">' + Math.round(v * 1000) + ' ms</td><td><span class="hs-st hs-st--' + st[0] + '">' + st[1] + "</span></td><td><small>" + x[2] + "</small></td></tr>";
		}).join("");
	}
	$("hs-qhr").addEventListener("input", function () { var h = +this.value; if (h > 0) $("hs-qrr").value = Math.round(60000 / h); qtcPaint(); });
	$("hs-qrr").addEventListener("input", function () { var r = +this.value; if (r > 0) $("hs-qhr").value = Math.round(60000 / r); qtcPaint(); });
	$("hs-qt").addEventListener("input", qtcPaint); $("hs-qsex").addEventListener("change", qtcPaint);
	$("hs-useqt").addEventListener("click", function () { if (!cal) { toast("Turn on the calipers first"); return; } $("hs-qt").value = Math.round(Math.abs(cal.b - cal.a) * 1000); qtcPaint(); });
	$("hs-userr").addEventListener("click", function () { if (!cal) { toast("Turn on the calipers first"); return; } var r = Math.round(Math.abs(cal.b - cal.a) * 1000); $("hs-qrr").value = r; $("hs-qhr").value = Math.round(60000 / r); qtcPaint(); });

	/* ---------- hemodynamics calculator ---------- */
	var CIN = [["hr", "Heart rate", "/min", 72], ["sv", "Stroke volume", "ml", 70], ["sbp", "Systolic BP", "mmHg", 120], ["dbp", "Diastolic BP", "mmHg", 80], ["cvp", "CVP", "mmHg", 5], ["mpap", "Mean PA pressure", "mmHg", 15], ["pcwp", "PCWP (wedge)", "mmHg", 9],
		["cm", "Height", "cm", 170], ["kg", "Weight", "kg", 70], ["edv", "EDV", "ml", ""], ["esv", "ESV", "ml", ""], ["hb", "Haemoglobin", "g/dl", 14], ["sao2", "SaO₂", "%", 98], ["pao2", "PaO₂", "mmHg", 95], ["svo2", "SvO₂ (mixed venous)", "%", 72]];
	var cvals = saved.calc || {};
	$("hs-cin").innerHTML = CIN.map(function (c) { var v = cvals[c[0]] != null ? cvals[c[0]] : c[3]; return '<div class="tu-field"><span class="tu-label">' + c[1] + ' <small>(' + c[2] + ')</small></span><input type="number" class="tu-input" id="hs-c-' + c[0] + '" value="' + esc(v) + '" step="any" inputmode="decimal"></div>'; }).join("");
	function readCalc() { var x = {}; CIN.forEach(function (c) { var v = parseFloat($("hs-c-" + c[0]).value); if (isFinite(v)) x[c[0]] = v; }); if (x.hb > 30) x.hb /= 10; return x; }
	function calcPaint() {
		var x = readCalc(), o = H.hemo(x), N = H.NORMALS, rows = [];
		var st = function (k, v) { var n = N[k]; if (!n || !v) return ""; var s = v < n[0] ? ["lo", "low"] : v > n[1] ? ["hi", "high"] : ["ok", "normal"]; return '<span class="hs-st hs-st--' + s[0] + '">' + s[1] + "</span>"; };
		var rng = function (k, sc) { var n = N[k]; if (!n) return ""; sc = sc || 1; return (n[0] * sc) + "-" + (n[1] * sc) + " " + n[2]; };
		function add(k, name, v, unit, dec, how, sc) { if (!v || !isFinite(v)) return; rows.push("<tr><td>" + name + '</td><td class="hs-num">' + (sc ? (v * sc).toFixed(dec) : v.toFixed(dec)) + " " + unit + "</td><td>" + st(k, v) + "</td><td><small>" + rng(k, sc) + "</small></td><td><small>" + how + "</small></td></tr>"); }
		add("co", "Cardiac output", o.co, "L/min", 2, "HR × SV"); add("bsa", "Body surface area", o.bsa, "m²", 2, "Mosteller √(cm × kg / 3600)"); add("ci", "Cardiac index", o.ci, "L/min/m²", 2, "CO ÷ BSA"); add("svi", "Stroke volume index", o.svi, "ml/m²", 0, "SV ÷ BSA");
		add("map", "Mean arterial pressure", o.map, "mmHg", 0, "DBP + (SBP − DBP) ÷ 3"); add("pp", "Pulse pressure", o.pp, "mmHg", 0, "SBP − DBP");
		add("svr", "Systemic vascular resistance", o.svr, "dyn·s·cm⁻⁵", 0, "80 × (MAP − CVP) ÷ CO"); add("svri", "SVR index", o.svri, "dyn·s·cm⁻⁵·m²", 0, "SVR × BSA");
		add("pvr", "Pulmonary vascular resistance", o.pvr, "dyn·s·cm⁻⁵", 0, "80 × (mPAP − PCWP) ÷ CO = " + f1(o.pvrWU) + " Wood units");
		add("ef", "Ejection fraction", o.ef, "%", 0, "(EDV − ESV) ÷ EDV", 100);
		add("cao2", "Arterial O₂ content", o.cao2, "ml/dl", 1, "1.34 × Hb × SaO₂ + 0.003 × PaO₂"); add("do2", "O₂ delivery", o.do2, "ml/min", 0, "CO × CaO₂ × 10"); add("do2i", "O₂ delivery index", o.do2i, "ml/min/m²", 0, "DO₂ ÷ BSA");
		add("vo2", "O₂ consumption (Fick)", o.vo2, "ml/min", 0, "CO × (CaO₂ − CvO₂) × 10"); add("o2er", "O₂ extraction ratio", o.o2er, "%", 0, "(CaO₂ − CvO₂) ÷ CaO₂", 100);
		add("cpp", "Coronary perfusion pressure", o.cpp, "mmHg", 0, "DBP − PCWP"); add("rpp", "Rate-pressure product", o.rpp, "", 0, "HR × SBP (myocardial O₂ demand)"); add("si", "Shock index", o.si, "", 2, "HR ÷ SBP (> 1 is worrying)");
		add("sw", "LV stroke work", o.sw, "g·m", 0, "SV × (MAP − PCWP) × 0.0136");
		$("hs-cout").innerHTML = "<tr><th>Result</th><th>Value</th><th></th><th>Usual range</th><th>Formula</th></tr>" + rows.join("");
		var sv = {}; CIN.forEach(function (c) { sv[c[0]] = $("hs-c-" + c[0]).value; }); sset({ calc: sv });
		return rows;
	}
	$("hs-cin").addEventListener("input", calcPaint);
	function fillCalc() { if (!B) return; var set = function (k, v) { $("hs-c-" + k).value = v; }; set("hr", Math.round(S.p.hr)); set("sv", Math.round(B.netSv)); set("sbp", Math.round(B.sbp)); set("dbp", Math.round(B.dbp)); set("pcwp", Math.round(B.la)); set("edv", Math.round(B.edv)); set("esv", Math.round(B.esv)); calcPaint(); toast("Filled from the simulation (" + presetObj().name + ")"); }
	$("hs-fill").addEventListener("click", fillCalc);
	$("hs-cclear").addEventListener("click", function () { CIN.forEach(function (c) { $("hs-c-" + c[0]).value = ""; }); calcPaint(); });
	$("hs-ccopy").addEventListener("click", function () { var t = Array.prototype.map.call($("hs-cout").querySelectorAll("tr"), function (tr) { return Array.prototype.map.call(tr.children, function (td) { return td.textContent.trim(); }).join("\t"); }).join("\n"); copyText(t, "Results copied"); });

	/* ---------- links ---------- */
	function link(extra) { var u = new URL(location.href.split("?")[0]); u.searchParams.set("tab", S.tab); if (extra) for (var k in extra) u.searchParams.set(k, extra[k]); return u.toString(); }
	$("hs-link1").addEventListener("click", function () { copyText(link({ preset: S.preset, hr: S.p.hr }), "Link copied"); });
	$("hs-link2").addEventListener("click", function () { copyText(link({ preset: S.preset, hr: S.p.hr, ees: S.p.ees, vol: S.p.vol, svr: S.p.svr }), "Link copied"); });
	$("hs-link3").addEventListener("click", function () { copyText(link({ rh: S.rh }), "Link copied"); });

	/* ---------- animation ---------- */
	var prevT = 0;
	function frame(now) { requestAnimationFrame(frame); tick(now); }
	function tick(now) {
		if (document.hidden) { lastNow = now; return; }
		var dt = Math.min(0.1, (now - (lastNow || now)) / 1000); lastNow = now;
		if (!B) return;
		if (S.tab === "cycle") {
			if (S.play) { var old = tc % B.T; tc = (tc + dt * SPD[S.spd]) % (2 * B.T); var nw = tc % B.T;
				if (S.snd && AC) { var crossed = function (x) { return x >= 0 && ((old <= x && nw > x) || (nw < old && (x >= old || x < nw))); }; if (crossed(B.ev.mc + 0.005)) thump(70, 0.12, 0.5); if (crossed(B.ev.ac)) thump(95, 0.09, 0.4); } }
			drawCycle();
		} else if (S.tab === "pv") { pvT += dt * 0.6; drawPV(); }
		else if (S.tab === "ecg") { if (eplay) { tE += dt; if (gen) gen.until(tE + 2); } drawECG(); }
	}

	/* ---------- start ---------- */
	paintPresets(); syncSliders(); syncSpd(); run(); newGen(); paintRhythms(); paintCaliperRO(); qtcPaint(); calcPaint(); setTab(S.tab);
	window.addEventListener("resize", onResize); if (window.ResizeObserver) ["cycle", "pv", "ecg"].forEach(function (k) { new ResizeObserver(function () { onResize(); }).observe(CV[k].st.parentNode); });
	new MutationObserver(function () { onResize(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	window.MESHeartDebug = { S: S, get B() { return B; }, step: function (n) { for (var i = 0; i < (n || 1); i++) tick((lastNow || 0) + 33); } };
	requestAnimationFrame(frame);
})();
