/* Neuron Simulator UI: action potential (Hodgkin-Huxley, current / voltage clamp), nerve conduction (HH cable, myelin damage), synapses (summation neuron,
   neuromuscular junction) and the Nernst / GHK calculator. Maths: MESNeuro (node-tested: tool_apps_src/neuron-simulator-tests.js).
   State: localStorage mes-neuron-simulator:v1; links ?tab=ap&s=... / ?tab=cond&d=&my=&dmg=&ct= / ?tab=ion&io=... */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("nr"); if (!root) return;
	var M = window.MESNeuro, KEY = "mes-neuron-simulator:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, lo, hi, d) { if (v === null || v === undefined || v === "") return d; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function f1(x) { return isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1).replace("-", "−") : "–"; }
	function f0(x) { return isFinite(x) ? String(Math.round(x)).replace("-", "−") : "–"; }
	function sg(x, d) { if (!isFinite(x)) return "–"; var a = Math.abs(x); return (a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(d == null ? 1 : d) : x.toFixed(d == null ? 2 : d)).replace("-", "−"); }
	var q = new URLSearchParams(location.search), saved = sget(), toastT;
	function toast(msg) { var t = $("nr-toast"); if (!t) { t = document.createElement("div"); t.id = "nr-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copyLink(url) { var done = function () { toast("Link copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url); }
	function linkWith(params) { var u = new URL(location.origin + location.pathname); for (var k in params) u.searchParams.set(k, params[k]); return u.toString(); }
	function ro(box, items) { box.innerHTML = items.map(function (it) { return '<div class="nr-ro' + (it.c ? " " + it.c : "") + '"><span>' + esc(it.l) + "</span><b>" + esc(it.v) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</div>"; }).join(""); }
	function setPressed(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === on ? "true" : "false"); }); }
	function png(cv, name) { try { var a = document.createElement("a"); a.download = name + ".png"; a.href = cv.toDataURL("image/png"); a.click(); } catch (e) { toast("Could not save the picture"); } }
	var dpr = 1;
	function fitStage(stage, natural) {
		var wrap = stage.parentNode, w = wrap.clientWidth || 600; dpr = Math.min(2, window.devicePixelRatio || 1);
		wrap.setAttribute("data-mes-free", "1");
		var h = natural(w); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		h = Math.max(220, Math.round(h)); stage.style.width = w + "px"; stage.style.height = h + "px";
		var cv = stage.querySelector("canvas"), cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		return { W: w, H: h };
	}
	Array.prototype.forEach.call(root.querySelectorAll(".nr-fs"), function (b) {
		b.onclick = function () { var w = b.closest(".nr-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	});
	var COL = { bg: "#060a12", grid: "#1c2436", axis: "#5d6a86", text: "#c6cee0", dim: "#8792aa", V: "#ffd166", na: "#ff8c42", k: "#a78bfa", m: "#ff8c42", h: "#ff5d8f", n: "#a78bfa", b: "#5eead4", tot: "#e8ecf5", thr: "#ff6b6b", r1: "#4cc9f0", r2: "#f72585" };

	/* ---------- generic plot: frame, ticks, min/max-decimated traces ---------- */
	function niceStep(range, n) { var s = range / n, p = Math.pow(10, Math.floor(Math.log10(s))), f = s / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
	function plot(c, r, o) {
		var x0 = o.x0, x1 = o.x1, y0 = o.y0, y1 = o.y1, X = function (t) { return r.x + (t - x0) / (x1 - x0) * r.w; }, Y = function (v) { return r.y + r.h - (v - y0) / (y1 - y0) * r.h; };
		c.save(); c.font = "11px system-ui,sans-serif"; c.lineWidth = 1;
		var ys = niceStep(y1 - y0, Math.max(2, Math.floor(r.h / 26))); c.textAlign = "right"; c.textBaseline = "middle";
		for (var v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r.x, Y(v) + 0.5); c.lineTo(r.x + r.w, Y(v) + 0.5); c.stroke(); c.fillStyle = COL.dim; c.fillText(String(+v.toFixed(3)).replace("-", "−"), r.x - 4, Y(v)); }
		if (o.xt) { var xs = niceStep(x1 - x0, Math.max(2, Math.floor(r.w / 70))); c.textAlign = "center"; c.textBaseline = "top"; for (var t = Math.ceil(x0 / xs) * xs; t <= x1 + 1e-9; t += xs) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(X(t) + 0.5, r.y); c.lineTo(X(t) + 0.5, r.y + r.h); c.stroke(); c.fillStyle = COL.dim; c.fillText(String(+t.toFixed(3)), X(t), r.y + r.h + 3); } if (o.xl) { c.textAlign = "right"; c.fillText(o.xl, r.x + r.w, r.y + r.h + 3 + 12); } }
		(o.hl || []).forEach(function (h) { if (h.y < y0 || h.y > y1) return; c.strokeStyle = h.col; c.setLineDash(h.dash || [4, 4]); c.beginPath(); c.moveTo(r.x, Y(h.y) + 0.5); c.lineTo(r.x + r.w, Y(h.y) + 0.5); c.stroke(); c.setLineDash([]); if (h.lab) { c.fillStyle = h.col; c.textAlign = "right"; c.textBaseline = "bottom"; c.fillText(h.lab, r.x + r.w - 4, Y(h.y) - 1); } });
		c.strokeStyle = COL.axis; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
		c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
		(o.series || []).forEach(function (s) {
			var n = s.len == null ? s.v.length : s.len, lim = s.upto == null ? n : Math.min(n, s.upto);
			for (var pass = 0; pass < (s.upto == null ? 1 : 2); pass++) {
				var end = pass === 0 ? n : lim; if (end < 2) continue;
				c.strokeStyle = s.col; c.globalAlpha = s.upto != null && pass === 0 ? 0.28 : 1; c.lineWidth = s.w || 1.6; c.setLineDash(s.dash || []); c.beginPath();
				var lastPx = -1e9, mn = 0, mx = 0, first = true;
				for (var i = 0; i < end; i++) {
					var px = Math.round(X(s.t[i])), py = Y(s.v[i]);
					if (px !== lastPx) { if (!first) { c.lineTo(lastPx, mn); c.lineTo(lastPx, mx); } if (first) { c.moveTo(px, py); first = false; } else c.lineTo(px, py); lastPx = px; mn = mx = py; }
					else { if (py < mn) mn = py; if (py > mx) mx = py; }
				}
				c.lineTo(lastPx, mn); c.lineTo(lastPx, mx); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
			}
		});
		if (o.cur != null) { c.strokeStyle = "rgba(255,255,255,0.55)"; c.beginPath(); c.moveTo(X(o.cur) + 0.5, r.y); c.lineTo(X(o.cur) + 0.5, r.y + r.h); c.stroke(); }
		c.restore();
		if (o.title) { c.save(); c.font = "600 11px system-ui,sans-serif"; c.fillStyle = COL.text; c.textAlign = "left"; c.textBaseline = "top"; c.fillText(o.title, r.x + 6, r.y + 4); c.restore(); }
		if (o.leg) { c.save(); c.font = "11px system-ui,sans-serif"; c.textBaseline = "top"; c.textAlign = "right"; var xx = r.x + r.w - 6; for (var j = o.leg.length - 1; j >= 0; j--) { var L = o.leg[j]; c.fillStyle = L[1]; c.fillText(L[0], xx, r.y + 4); xx -= c.measureText(L[0]).width + 12; } c.restore(); }
		return { X: X, Y: Y };
	}
	function idxAt(t, arr, len) { var lo = 0, hi = len - 1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (arr[mid] < t) lo = mid; else hi = mid; } return lo; }

	/* ======================================================= tabs ======================================================= */
	var tab = /^(ap|cond|syn|ion)$/.test(q.get("tab") || "") ? q.get("tab") : (saved.tab || "ap");
	function setTab(t, init) {
		tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!init) { sset({ tab: t }); try { var u = new URL(location.href); u.search = t === "ap" ? "" : "?tab=" + t; history.replaceState(null, "", u); } catch (e) {} }
		setTimeout(function () { onResize(); if (t === "cond" && !cv.run) runCond(); if (t === "ion") ionCalc(); }, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* ======================================================= 1. ACTION POTENTIAL ======================================================= */
	var AP_DEF = { mode: "cc", amp: 20, dur: 1, np: 1, gap: 10, hold: 0, win: 30, vh: -65, vs: 0, vd: 10, ttx: 0, tea: 0, lido: 0, ko: 4, temp: 6.3, bot: "i", mem: true, spd: 5 };
	var AP_KEYS = ["amp", "dur", "np", "gap", "hold", "win", "vh", "vs", "vd", "ttx", "tea", "lido", "ko", "temp"];
	var A = {}; for (var k in AP_DEF) A[k] = AP_DEF[k];
	if (saved.ap) for (k in saved.ap) if (k in AP_DEF) A[k] = saved.ap[k];
	if (q.get("tab") === "ap" && q.get("s")) { var sv = q.get("s").split(","); AP_KEYS.forEach(function (kk, i) { var v = Number(sv[i]); if (isFinite(v)) A[kk] = v; }); A.mode = q.get("m") === "vc" ? "vc" : "cc"; }
	var AP_PRE = [
		{ id: "one", l: "One spike", s: { amp: 20, dur: 1, np: 1, hold: 0, win: 30 }, n: "A 1 ms pulse well above threshold: sodium gates (m) snap open, Na⁺ rushes in and the voltage shoots up towards E_Na; then h closes the sodium channels and n opens potassium channels, so K⁺ flows out and the voltage falls below rest (the undershoot) before recovering." },
		{ id: "sub", l: "Below threshold", s: { amp: 5, dur: 1, np: 1, hold: 0, win: 30 }, n: "Too weak: the voltage bumps up and simply leaks back. The sodium current never outruns the potassium and leak currents. Press “Find the threshold”, then try a little above it." },
		{ id: "refr", l: "Refractory period", s: { amp: 20, dur: 1, np: 2, gap: 6, hold: 0, win: 40 }, n: "Two identical pulses 6 ms apart: the second one fails because most sodium channels are still inactivated (h low) and potassium channels still open. Drag “Time between pulse starts” up to about 15 ms and the second spike comes back, smaller at first (relative refractory period)." },
		{ id: "rep", l: "Repetitive firing", s: { amp: 0, dur: 1, np: 1, hold: 10, win: 120 }, n: "A steady current of 10 µA/cm² makes the membrane fire again and again. Stronger current = higher rate (try 20 or 40); this is how a sensory receptor codes a stronger stimulus." },
		{ id: "anode", l: "Anode break", s: { amp: -25, dur: 15, np: 1, hold: 0, win: 45 }, n: "A pulse that pulls the voltage DOWN, then lets go: while hyperpolarised, h recovers (more sodium channels ready) and n falls (fewer potassium channels open), so the rebound overshoots threshold and fires a spike (anode break excitation)." },
		{ id: "lido", l: "Lidocaine: use-dependent block", s: { amp: 30, dur: 0.5, np: 20, gap: 25, hold: 0, win: 520, lido: 0.9 }, n: "A train at 40 per second with lidocaine. Watch the teal “block” line in the middle graph: each spike lets more drug bind, the spikes shrink and some fail. Slow the train (increase the time between pulses) and the drug has time to let go: this is why local anaesthetics block fast-firing pain fibres well." },
		{ id: "hyperk", l: "Hyperkalaemia", s: { amp: 20, dur: 1, np: 1, hold: 0, win: 30, ko: 9 }, n: "Outside K⁺ 9 mmol/L: E_K rises, the resting membrane depolarises, sodium channels partly inactivate, so the spike is smaller and slower to rise. Push it to 11-12 and the membrane stops firing altogether." },
		{ id: "ttx", l: "TTX", s: { amp: 20, dur: 1, np: 1, hold: 0, win: 30, ttx: 1 }, n: "Tetrodotoxin blocks every sodium channel: no inward current, no spike, only a passive bump. Try 80% block to see a smaller, delayed spike." },
		{ id: "warm", l: "Warmer (18.5 °C)", s: { amp: 20, dur: 1, np: 1, hold: 0, win: 15, temp: 18.5 }, n: "At 18.5 °C the gates run 3.4 times faster: a narrower, slightly smaller spike. The squid model fails above about 30 °C (heat block)." }
	];
	var apStage = $("nr-ap-stage"), apC = $("nr-ap-c"), apX = apC.getContext("2d"), apW = 600, apH = 400, apRun = null, apAn = null, apHead = 0, apPlay = true, apHover = null, apRefr = null;
	var apIV = null, apVC = null;
	function apParams() { return M.params({ T: A.temp, ttx: A.ttx, tea: A.tea, lido: A.lido, Ko: A.ko }); }
	var apRunT = null;
	function apCompute() {
		var P = apParams();
		if (A.mode === "cc") {
			var every = Math.max(1, Math.round(A.win / 0.01 / 5000));
			apRun = M.simulate(P, { amp: A.amp, dur: A.dur, n: A.np, gap: A.gap, hold: A.hold, t0: 5 }, A.win, 0.01, every); apAn = M.analyse(apRun);
		} else {
			var tEnd = A.vd + 8; apVC = M.vclamp(P, A.vh, A.vs, tEnd, 2, A.vd, 0.01);
			apIV = { v: [], na: [], k: [] }; for (var V = -100; V <= 70; V += 10) { var o = M.vclamp(P, A.vh, V, 2 + A.vd + 0.02, 2, A.vd, 0.02), mn = 0, last = o.iK[o.len - 2]; for (var i = 0; i < o.len; i++) if (Math.abs(o.iNa[i]) > Math.abs(mn)) mn = o.iNa[i]; apIV.v.push(V); apIV.na.push(mn); apIV.k.push(last); }
		}
		apHead = A.spd > 0 ? 0 : 1e9; apPlay = true; $("nr-ap-play").textContent = "❚❚ Pause"; apReadouts(); apDraw();
		sset({ ap: A });
	}
	function apSchedule() { clearTimeout(apRunT); apRunT = setTimeout(apCompute, 60); }
	function apReadouts() {
		var P = apParams(), box = $("nr-ap-ro");
		if (A.mode === "cc") {
			var sp = apAn.spikes, s0 = sp[0], rate = sp.length > 1 ? 1000 / ((sp[sp.length - 1].t - sp[0].t) / (sp.length - 1)) : null;
			ro(box, [
				{ l: "Resting voltage", v: f1(apAn.rest) + " mV", s: "E_K " + f1(P.EK) + " · E_Na " + f0(P.ENa) },
				{ l: "Spikes", v: String(sp.length), s: rate ? "about " + f0(rate) + " per second" : sp.length ? "in " + A.win + " ms" : "no spike", c: sp.length ? "is-good" : "" },
				{ l: "Peak", v: s0 ? f1(s0.peak) + " mV" : "–", s: s0 ? "overshoot above 0 mV" : "" },
				{ l: "Threshold", v: s0 && s0.thr != null ? f1(s0.thr) + " mV" : "–", s: "rise first faster than 20 mV/ms" },
				{ l: "Spike width", v: s0 ? sg(s0.width) + " ms" : "–", s: "at half height · max rise " + (s0 ? f0(s0.dvdt) + " mV/ms" : "–") },
				{ l: "Lowest voltage", v: f1(apAn.min) + " mV", s: "the undershoot (after-hyperpolarisation)" }
			].concat(A.lido > 0 ? [{ l: "Na channels with lidocaine", v: f0(apRun.b[0] * 100) + "% → " + f0(apRun.b[apRun.len - 1] * 100) + "%", s: "at the start → at the end" }] : []));
		} else {
			var mn = 0, i; for (i = 0; i < apVC.len; i++) if (Math.abs(apVC.iNa[i]) > Math.abs(mn)) mn = apVC.iNa[i];
			var lateI = idxAt(2 + A.vd - 0.05, apVC.t, apVC.len);
			ro(box, [
				{ l: "Peak Na⁺ current", v: f0(mn) + " µA/cm²", s: mn < 0 ? "inward (negative)" : "outward: step is above E_Na" },
				{ l: "K⁺ current at the end", v: f0(apVC.iK[lateI]) + " µA/cm²", s: "outward (positive)" },
				{ l: "Total at the end", v: f0(apVC.iK[lateI] + apVC.iNa[lateI] + apVC.iL[lateI]) + " µA/cm²", s: "Na + K + leak" },
				{ l: "E_Na / E_K", v: f0(P.ENa) + " / " + f1(P.EK) + " mV", s: "the Na⁺ current reverses at E_Na" }
			]);
		}
	}
	function apLayout() {
		var memOn = A.mem || A.mode === "vc", wide = apW >= 640, mem = null, px = 52, top = 34, pr = 10;
		if (memOn) { if (wide) { var mw = Math.min(280, Math.round(apW * 0.3)); mem = { x: 0, y: 0, w: mw, h: apH }; px = mw + 50; } else { var mh = Math.round(Math.min(190, apH * 0.32)); mem = { x: 0, y: 0, w: apW, h: mh }; top = mh + 30; } }
		var ph = apH - top - 26, w = apW - px - pr;
		return { mem: mem, p1: { x: px, y: top, w: w, h: ph * 0.48 }, p2: { x: px, y: top + ph * 0.48 + 8, w: w, h: ph * 0.22 }, p3: { x: px, y: top + ph * 0.70 + 16, w: w, h: ph * 0.30 - 16 } };
	}
	var memT = 0;
	function apDraw() {
		var c = apX; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = COL.bg; c.fillRect(0, 0, apW, apH);
		var L = apLayout(), P = apParams();
		if (A.mode === "cc" && apRun) {
			var o = apRun, n = o.len, tEnd = o.t[n - 1], head = Math.min(apHead, tEnd), cur = apHover != null ? apHover : (apHead < tEnd ? head : null), upto = apHover != null ? n : idxAt(head, o.t, n) + 1;
			var vmin = Math.min(-90, Math.floor(P.EK / 10) * 10 - 10);
			plot(c, L.p1, { x0: 0, x1: tEnd, y0: vmin, y1: 60, series: [{ t: o.t, v: o.V, len: n, col: COL.V, w: 2, upto: upto }], hl: [{ y: P.ENa, col: COL.na, lab: "E_Na" }, { y: P.EK, col: COL.k, lab: "E_K" }, { y: apAn.rest, col: "#6b7894", dash: [2, 3] }, { y: 0, col: "#3a4560", dash: [1, 3] }], cur: cur, title: "Membrane voltage (mV)" });
			var g = [{ t: o.t, v: o.m, len: n, col: COL.m, upto: upto }, { t: o.t, v: o.h, len: n, col: COL.h, upto: upto }, { t: o.t, v: o.n, len: n, col: COL.n, upto: upto }], leg = [["m", COL.m], ["h", COL.h], ["n", COL.n]];
			if (A.lido > 0) { g.push({ t: o.t, v: o.b, len: n, col: COL.b, dash: [5, 3], upto: upto }); leg.push(["block", COL.b]); }
			plot(c, L.p2, { x0: 0, x1: tEnd, y0: 0, y1: 1, series: g, cur: cur, title: "Gates (0 = shut, 1 = open)", leg: leg });
			if (A.bot === "i") {
				var lim = 50; for (var i = 0; i < n; i++) lim = Math.max(lim, Math.abs(o.iNa[i]), Math.abs(o.iK[i]));
				plot(c, L.p3, { x0: 0, x1: tEnd, y0: -lim * 1.05, y1: lim * 1.05, series: [{ t: o.t, v: o.iNa, len: n, col: COL.na, upto: upto }, { t: o.t, v: o.iK, len: n, col: COL.k, upto: upto }, { t: o.t, v: o.I, len: n, col: "#9aa5bb", dash: [3, 3] }], hl: [{ y: 0, col: "#3a4560", dash: [1, 3] }], cur: cur, xt: true, xl: "time (ms)", title: "Currents (µA/cm²): − = inward", leg: [["Na⁺", COL.na], ["K⁺", COL.k], ["stimulus", "#9aa5bb"]] });
			} else {
				var gl = 5; for (i = 0; i < n; i++) gl = Math.max(gl, o.gNa[i], o.gK[i]);
				plot(c, L.p3, { x0: 0, x1: tEnd, y0: 0, y1: gl * 1.08, series: [{ t: o.t, v: o.gNa, len: n, col: COL.na, upto: upto }, { t: o.t, v: o.gK, len: n, col: COL.k, upto: upto }], cur: cur, xt: true, xl: "time (ms)", title: "Conductances (mS/cm²)", leg: [["g_Na", COL.na], ["g_K", COL.k]] });
			}
			if (L.mem) { var k = cur == null ? n - 1 : idxAt(cur, o.t, n); drawMembrane(c, L.mem, o.V[k], o.m[k], o.h[k], o.n[k], o.iNa[k], o.iK[k], o.t[k], o.b[k]); }
		} else if (A.mode === "vc" && apVC) {
			var v = apVC, nn = v.len, te = v.t[nn - 1], tot = new Float32Array(nn), lm = 50;
			for (i = 0; i < nn; i++) { tot[i] = v.iNa[i] + v.iK[i] + v.iL[i]; lm = Math.max(lm, Math.abs(v.iNa[i]), Math.abs(v.iK[i]), Math.abs(tot[i])); }
			plot(c, L.p1, { x0: 0, x1: te, y0: -lm * 1.05, y1: lm * 1.05, series: [{ t: v.t, v: v.iNa, len: nn, col: COL.na }, { t: v.t, v: v.iK, len: nn, col: COL.k }, { t: v.t, v: tot, len: nn, col: COL.tot, w: 1.2, dash: [4, 3] }], hl: [{ y: 0, col: "#3a4560", dash: [1, 3] }], cur: apHover, title: "Currents (µA/cm²): − = inward", leg: [["Na⁺", COL.na], ["K⁺", COL.k], ["total", COL.tot]] });
			var gm = 5; for (i = 0; i < nn; i++) gm = Math.max(gm, v.gNa[i], v.gK[i]);
			plot(c, L.p2, { x0: 0, x1: te, y0: 0, y1: gm * 1.1, series: [{ t: v.t, v: v.gNa, len: nn, col: COL.na }, { t: v.t, v: v.gK, len: nn, col: COL.k }], cur: apHover, title: "Conductances (mS/cm²)" });
			plot(c, L.p3, { x0: 0, x1: te, y0: -120, y1: 80, series: [{ t: v.t, v: v.V, len: nn, col: COL.V, w: 2 }], cur: apHover, xt: true, xl: "time (ms)", title: "Command voltage (mV)" });
			if (L.mem) drawIV(c, L.mem);
		}
		if (apHover != null) hoverLabel(c, L);
	}
	function hoverLabel(c, L) {
		var txt, o, k;
		if (A.mode === "cc") { o = apRun; k = idxAt(apHover, o.t, o.len); txt = "t " + o.t[k].toFixed(2) + " ms · V " + f1(o.V[k]) + " mV · m " + o.m[k].toFixed(2) + " h " + o.h[k].toFixed(2) + " n " + o.n[k].toFixed(2) + " · I_Na " + f0(o.iNa[k]) + " · I_K " + f0(o.iK[k]); }
		else { o = apVC; k = idxAt(apHover, o.t, o.len); txt = "t " + o.t[k].toFixed(2) + " ms · I_Na " + f0(o.iNa[k]) + " · I_K " + f0(o.iK[k]) + " µA/cm²"; }
		c.save(); c.font = "11px system-ui,sans-serif"; var w = c.measureText(txt).width + 12, x = clamp(L.p1.x, 0, apW - w), y = L.p1.y - 22; if (y < 2) y = 2;
		c.fillStyle = "rgba(10,13,20,0.9)"; c.fillRect(x, y, w, 18); c.fillStyle = COL.text; c.textBaseline = "middle"; c.fillText(txt, x + 6, y + 9); c.restore();
	}
	/* the membrane: lipid bilayer with a Na channel (m gates + h plug) and a K channel (n gates); ions stream through in proportion to the current */
	function drawMembrane(c, r, V, m, h, n, iNa, iK, t, b) {
		c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
		c.fillStyle = "#0b1120"; c.fillRect(r.x, r.y, r.w, r.h);
		var cy = r.y + r.h * 0.5, th = clamp(r.h * 0.13, 18, 52), x0 = r.x + 8, x1 = r.x + r.w - 8;
		c.font = "600 11px system-ui,sans-serif"; c.textBaseline = "top"; c.fillStyle = COL.dim; c.textAlign = "left";
		c.fillText("OUTSIDE", x0, r.y + 6); c.textBaseline = "bottom"; c.fillText("INSIDE", x0, r.y + r.h - 6);
		var low = r.w >= apW - 1, ly = low ? r.y + r.h - 38 : r.y + 6;   /* on a phone the run buttons sit over the top right: put the readout at the bottom */
		c.textAlign = "right"; c.textBaseline = "top"; c.fillStyle = COL.V; c.font = "700 14px system-ui,sans-serif"; c.fillText(f1(V) + " mV", x1, ly);
		c.font = "11px system-ui,sans-serif"; c.fillStyle = COL.dim; c.fillText("t = " + t.toFixed(2) + " ms", x1, ly + 18);
		/* charges: inside negative at rest, positive at the spike peak */
		var q = clamp(-V / 70, -1, 1), sgnOut = q > 0 ? "+" : "−", sgnIn = q > 0 ? "−" : "+", cnt = Math.round(Math.abs(q) * 8);
		c.font = "700 12px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
		for (var i = 0; i < cnt; i++) { var xx = x0 + (i + 0.5) * (x1 - x0) / 8; c.fillStyle = q > 0 ? "#ff9f9f" : "#9fc4ff"; c.fillText(sgnOut, xx, cy - th / 2 - 9); c.fillStyle = q > 0 ? "#9fc4ff" : "#ff9f9f"; c.fillText(sgnIn, xx, cy + th / 2 + 9); }
		/* bilayer */
		c.fillStyle = "#3b4a66"; c.fillRect(x0, cy - th / 2, x1 - x0, th);
		c.fillStyle = "#c9b27a"; var hd = th / 4; for (var xh = x0 + hd; xh < x1; xh += hd * 2.1) { c.beginPath(); c.arc(xh, cy - th / 2 + hd * 0.6, hd * 0.75, 0, 7); c.fill(); c.beginPath(); c.arc(xh, cy + th / 2 - hd * 0.6, hd * 0.75, 0, 7); c.fill(); }
		var cw = clamp((x1 - x0) * 0.2, 26, 64), naX = x0 + (x1 - x0) * 0.3, kX = x0 + (x1 - x0) * 0.72;
		function channel(cx, col, open, label) {
			c.fillStyle = "#0b1120"; c.fillRect(cx - cw / 2, cy - th / 2 - 6, cw, th + 12);
			c.fillStyle = col; c.globalAlpha = 0.9; c.fillRect(cx - cw / 2, cy - th / 2 - 6, cw * 0.32, th + 12); c.fillRect(cx + cw / 2 - cw * 0.32, cy - th / 2 - 6, cw * 0.32, th + 12); c.globalAlpha = 1;
			var gap = cw * 0.36 * open; c.fillStyle = col; c.globalAlpha = 0.55; c.fillRect(cx - cw * 0.18, cy - th / 2 - 6, cw * 0.18 - gap / 2, 6); c.fillRect(cx + gap / 2, cy - th / 2 - 6, cw * 0.18 - gap / 2, 6); c.globalAlpha = 1;
			c.fillStyle = COL.text; c.font = "600 11px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText(label, cx, cy - th / 2 - 22);
		}
		channel(naX, COL.na, m * m * m, "Na⁺ channel");
		/* h plug (ball and chain) under the Na channel */
		var plug = 1 - h; c.strokeStyle = COL.h; c.lineWidth = 1.5; c.beginPath(); c.moveTo(naX + cw / 2, cy + th / 2 + 6); c.quadraticCurveTo(naX + cw / 2 + 8, cy + th / 2 + 20 - plug * 12, naX, cy + th / 2 + 6 + (1 - plug) * 16); c.stroke();
		c.fillStyle = COL.h; c.beginPath(); c.arc(naX, cy + th / 2 + 6 + (1 - plug) * 16, 5, 0, 7); c.fill();
		if (b > 0.02) { c.fillStyle = COL.b; c.globalAlpha = Math.min(1, b * 1.5); c.beginPath(); c.arc(naX, cy, 5, 0, 7); c.fill(); c.globalAlpha = 1; }
		channel(kX, COL.k, Math.pow(n, 4), "K⁺ channel");
		c.font = "11px system-ui,sans-serif"; c.textBaseline = "top"; c.textAlign = "center"; c.fillStyle = COL.dim;
		c.fillText("m³h = " + (m * m * m * h).toFixed(2), naX, cy + th / 2 + 28); c.fillText("n⁴ = " + Math.pow(n, 4).toFixed(2), kX, cy + th / 2 + 28);
		/* ion streams */
		function stream(cx, I, col, label, inward) {
			var a = Math.abs(I), cnt = Math.min(7, Math.round(a / 40)), len = th + Math.min(r.h * 0.5, 140);
			for (var j = 0; j < cnt; j++) {
				var ph = (memT * (0.8 + a / 600) + j / cnt) % 1, y = inward ? cy - len / 2 + ph * len : cy + len / 2 - ph * len;
				c.fillStyle = col; c.beginPath(); c.arc(cx + Math.sin(j * 2.3) * 3, y, 3.2, 0, 7); c.fill();
			}
			if (cnt > 0) { c.fillStyle = col; c.font = "600 11px system-ui,sans-serif"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(label + (inward ? " in ↓" : " out ↑"), cx + cw / 2 + 4, inward ? cy - th / 2 - 10 : cy + th / 2 + 10); }
		}
		stream(naX, iNa, COL.na, "Na⁺", iNa < 0); stream(kX, iK, COL.k, "K⁺", iK < 0);
		c.restore();
	}
	function drawIV(c, r) {
		c.save(); c.fillStyle = "#0b1120"; c.fillRect(r.x, r.y, r.w, r.h); c.restore();
		if (!apIV) return;
		var lim = 50; apIV.na.forEach(function (v) { lim = Math.max(lim, Math.abs(v)); }); apIV.k.forEach(function (v) { lim = Math.max(lim, Math.abs(v)); });
		var pr = { x: r.x + 44, y: r.y + 30, w: r.w - 56, h: r.h - 62 };
		var p = plot(c, pr, { x0: -100, x1: 70, y0: -lim * 1.05, y1: lim * 1.05, series: [{ t: apIV.v, v: apIV.na, col: COL.na, w: 2 }, { t: apIV.v, v: apIV.k, col: COL.k, w: 2 }], hl: [{ y: 0, col: "#3a4560", dash: [1, 3] }], xt: true, xl: "step to (mV)", title: "I-V curve", leg: [["peak Na⁺", COL.na], ["late K⁺", COL.k]] });
		c.save(); c.strokeStyle = COL.V; c.setLineDash([3, 3]); var x = p.X(A.vs); c.beginPath(); c.moveTo(x, pr.y); c.lineTo(x, pr.y + pr.h); c.stroke(); c.restore();
	}
	function apResize() { var s = fitStage(apStage, function (w) { return w >= 640 ? Math.max(420, w / 1.75) : w * 1.45; }); apW = s.W; apH = s.H; apDraw(); }
	/* hover / scrub */
	function apTimeAt(ev) { var r = apC.getBoundingClientRect(), x = ev.clientX - r.left, L = apLayout(); if (x < L.p1.x || x > L.p1.x + L.p1.w) return null; var o = A.mode === "cc" ? apRun : apVC; if (!o) return null; return clamp((x - L.p1.x) / L.p1.w, 0, 1) * o.t[o.len - 1]; }
	apC.addEventListener("pointermove", function (ev) { apHover = apTimeAt(ev); apDraw(); });
	apC.addEventListener("pointerleave", function () { apHover = null; apDraw(); });
	apC.addEventListener("pointerdown", function (ev) { var t = apTimeAt(ev); if (t != null && A.mode === "cc") { apHead = t; apPlay = false; $("nr-ap-play").textContent = "▶ Play"; apDraw(); } });
	apC.addEventListener("keydown", function (ev) { if (A.mode !== "cc" || !apRun) return; var tE = apRun.t[apRun.len - 1]; if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { apPlay = false; $("nr-ap-play").textContent = "▶ Play"; apHead = clamp(Math.min(apHead, tE) + (ev.key === "ArrowRight" ? 1 : -1) * (ev.shiftKey ? 5 : 0.25), 0, tE); apDraw(); ev.preventDefault(); } else if (ev.key === " ") { $("nr-ap-play").click(); ev.preventDefault(); } });
	$("nr-ap-play").onclick = function () { apPlay = !apPlay; if (apPlay && apRun && apHead >= apRun.t[apRun.len - 1]) apHead = 0; this.textContent = apPlay ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", apPlay ? "true" : "false"); };
	$("nr-ap-replay").onclick = function () { apHead = 0; apPlay = true; $("nr-ap-play").textContent = "❚❚ Pause"; };
	$("nr-ap-png").onclick = function () { png(apC, "neuron-action-potential"); };
	/* controls */
	var SL = { amp: [1, " "], dur: [1], np: [0], gap: [1], hold: [1], win: [0], vh: [0], vs: [0], vd: [1] };
	function bindRange(id, key, fmt, after) {
		var el = $("nr-" + id), out = $("nr-" + id + "-v");
		function show() { out.textContent = fmt ? fmt(A[key]) : A[key]; }
		el.value = A[key]; show();
		el.addEventListener("input", function () { A[key] = Number(el.value); show(); if (after) after(); apSchedule(); });
		return function () { el.value = A[key]; show(); };
	}
	var pct = function (v) { return Math.round(v * 100) + "%"; };
	var refreshers = [
		bindRange("amp", "amp", function (v) { return String(v).replace("-", "−"); }), bindRange("dur", "dur", function (v) { return v.toFixed(1); }), bindRange("np", "np", null, gapHz), bindRange("gap", "gap", function (v) { return v.toFixed(1); }, gapHz),
		bindRange("hold", "hold", function (v) { return String(v).replace("-", "−"); }), bindRange("win", "win"), bindRange("vh", "vh", function (v) { return String(v).replace("-", "−"); }), bindRange("vs", "vs", function (v) { return String(v).replace("-", "−"); }), bindRange("vd", "vd", function (v) { return v.toFixed(1); }),
		bindRange("ttx", "ttx", pct), bindRange("tea", "tea", pct), bindRange("lido", "lido", function (v) { return v === 0 ? "none" : v < 0.35 ? "low (" + pct(v) + ")" : v < 0.7 ? "medium (" + pct(v) + ")" : "high (" + pct(v) + ")"; }),
		bindRange("ko", "ko", function (v) { return v.toFixed(1); }, koNote), bindRange("temp", "temp", function (v) { return v.toFixed(1); })
	];
	function gapHz() { $("nr-gap-hz").textContent = A.np > 1 ? "= " + sg(1000 / A.gap, 1) + " pulses per second" : "Only matters with 2 or more pulses."; }
	function koNote() { var d = M.ekShift(A.ko); $("nr-ko-n").textContent = "Normal 3.5-5.0. E_K moves by " + (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(1) + " mV (Nernst) → " + f1(M.HH.EK + d) + " mV." + (A.ko >= 6.5 ? " Hyperkalaemia." : A.ko < 3.5 ? " Hypokalaemia." : ""); }
	gapHz(); koNote();
	function refreshAll() { refreshers.forEach(function (f) { f(); }); gapHz(); koNote(); }
	var preBox = $("nr-ap-pre");
	AP_PRE.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p.l; b.onclick = function () { if (A.mode !== "cc") setMode("cc"); var keep = { ttx: 0, tea: 0, lido: 0, ko: 4, temp: 6.3, np: 1, gap: 10, hold: 0 }; for (var k2 in keep) A[k2] = keep[k2]; for (k2 in p.s) A[k2] = p.s[k2]; refreshAll(); setPressed(Array.prototype.slice.call(preBox.children), b); $("nr-ap-note").textContent = p.n; apCompute(); }; preBox.appendChild(b); });
	function setMode(m) { A.mode = m; setPressed([$("nr-m-cc"), $("nr-m-vc")], m === "cc" ? $("nr-m-cc") : $("nr-m-vc")); $("nr-cc-box").hidden = m !== "cc"; $("nr-vc-box").hidden = m !== "vc"; $("nr-mode-note").textContent = m === "cc" ? "You inject current; the voltage does what it likes." : "The voltage is held; you see the currents (Hodgkin and Huxley's own method)."; apCompute(); }
	$("nr-m-cc").onclick = function () { setMode("cc"); }; $("nr-m-vc").onclick = function () { setMode("vc"); };
	$("nr-b-i").onclick = function () { A.bot = "i"; setPressed([$("nr-b-i"), $("nr-b-g")], this); apDraw(); sset({ ap: A }); };
	$("nr-b-g").onclick = function () { A.bot = "g"; setPressed([$("nr-b-i"), $("nr-b-g")], this); apDraw(); sset({ ap: A }); };
	setPressed([$("nr-b-i"), $("nr-b-g")], A.bot === "g" ? $("nr-b-g") : $("nr-b-i"));
	$("nr-o-mem").checked = A.mem; $("nr-o-mem").onchange = function () { A.mem = this.checked; apDraw(); sset({ ap: A }); };
	$("nr-spd").value = String(A.spd); $("nr-spd").onchange = function () { A.spd = Number(this.value); sset({ ap: A }); if (!A.spd) apHead = 1e9; else apHead = 0; };
	$("nr-normal").onclick = function () { A.ttx = 0; A.tea = 0; A.lido = 0; A.ko = 4; A.temp = 6.3; refreshAll(); apCompute(); };
	$("nr-ap-link").onclick = function () { copyLink(linkWith({ tab: "ap", m: A.mode, s: AP_KEYS.map(function (k2) { return +Number(A[k2]).toFixed(3); }).join(",") })); };
	$("nr-thr").onclick = function () {
		var P = apParams(), t = M.threshold(P, A.dur, 1000);
		$("nr-thr-out").textContent = t == null ? "No spike even at 1000 µA/cm² for a " + A.dur.toFixed(1) + " ms pulse (blocked)." : "Threshold for a " + A.dur.toFixed(1) + " ms pulse: " + sg(t) + " µA/cm²" + (A.amp > 0 ? " (your pulse is " + sg(A.amp / t, 2) + "× that)." : ".");
	};
	/* refractory scan (chunked so the page stays responsive) */
	$("nr-refr").onclick = function () {
		var P = apParams(), t1 = M.threshold(P, 1); if (t1 == null) { $("nr-thr-out").textContent = "The membrane does not fire, so there is nothing to measure."; return; }
		var gaps = [], g; for (g = 1.5; g <= 30; g += g < 10 ? 0.5 : 1) gaps.push(g); gaps.push(35, 40, 50);
		var res = [], i = 0, out = $("nr-thr-out"), box = $("nr-refr-box");
		box.hidden = false;
		(function next() {
			if (i >= gaps.length) { apRefr = { t1: t1, res: res }; drawRefr(); return; }
			res.push({ gap: gaps[i], thr: M.secondThreshold(P, gaps[i], t1) }); i++; out.textContent = "Measuring… " + Math.round(i / gaps.length * 100) + "%";
			apRefr = { t1: t1, res: res, busy: true }; drawRefr(); setTimeout(next, 0);
		})();
	};
	var refrBox = document.createElement("div"); refrBox.id = "nr-refr-box"; refrBox.hidden = true; refrBox.className = "nr-refr"; refrBox.innerHTML = '<canvas id="nr-refr-c" role="img" aria-label="Threshold of a second pulse against the time after a first spike: infinite in the absolute refractory period, then falling back to normal."></canvas>';
	$("nr-cc-box").appendChild(refrBox);
	function drawRefr() {
		var cvr = $("nr-refr-c"), w = refrBox.clientWidth || 600, h = 230; cvr.style.width = w + "px"; cvr.style.height = h + "px"; cvr.width = Math.round(w * dpr); cvr.height = Math.round(h * dpr);
		var c = cvr.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = COL.bg; c.fillRect(0, 0, w, h);
		var R = apRefr, xs = [], ys = [], absEnd = 0, relEnd = null;
		R.res.forEach(function (r) { if (r.thr == null) absEnd = r.gap; else { xs.push(r.gap); ys.push(r.thr / R.t1); if (relEnd == null && r.thr / R.t1 <= 1.1) relEnd = r.gap; } });
		var pr = { x: 46, y: 26, w: w - 58, h: h - 56 }, p = plot(c, pr, { x0: 0, x1: 50, y0: 0, y1: 20, series: [{ t: xs, v: ys, col: COL.V, w: 2 }], hl: [{ y: 1, col: "#7ee2a8", lab: "normal threshold" }], xt: true, xl: "time after the first pulse (ms)", title: "Second-pulse threshold ÷ normal threshold" });
		c.save(); c.fillStyle = "rgba(255,90,90,0.18)"; c.fillRect(pr.x, pr.y, p.X(absEnd) - pr.x, pr.h); if (relEnd) { c.fillStyle = "rgba(255,180,80,0.12)"; c.fillRect(p.X(absEnd), pr.y, p.X(relEnd) - p.X(absEnd), pr.h); } c.restore();
		if (!R.busy) $("nr-thr-out").textContent = "Absolute refractory period ≈ " + absEnd + " ms (no spike even at 20× threshold); relative refractory period until ≈ " + (relEnd || ">50") + " ms (threshold back within 10%). Model at " + A.temp.toFixed(1) + " °C: a human nerve at 37 °C recovers several times faster (absolute ~1 ms).";
	}
	/* animation loop */
	var lastFrame = 0;
	function frame(ts) {
		requestAnimationFrame(frame);
		var dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0; lastFrame = ts;
		if (document.hidden) return;
		tick(dt);
	}
	function tick(dt) {
		memT += dt;
		if (tab === "ap" && A.mode === "cc" && apRun) {
			var tE = apRun.t[apRun.len - 1];
			if (apPlay && A.spd > 0 && apHead < tE) { var sp = A.spd; if (A.win > 150) sp *= A.win / 60; apHead += dt * sp; }
			apDraw();
		} else if (tab === "cond") condFrame(dt);
		else if (tab === "syn") { if (synView === "n") synFrame(dt); else nmFrame(dt); }
	}

	/* ======================================================= 2. CONDUCTION ======================================================= */
	var C_DEF = { d: 9, my: true, dmg: 0, ct: 18.5, spd: 0.5 };
	var Cs = {}; for (k in C_DEF) Cs[k] = C_DEF[k]; if (saved.cond) for (k in saved.cond) if (k in C_DEF) Cs[k] = saved.cond[k];
	if (q.get("tab") === "cond") { Cs.d = num(q.get("d"), 0.1, 1000, Cs.d); Cs.my = q.get("my") !== "0"; Cs.dmg = num(q.get("dmg"), 0, 1, Cs.dmg); Cs.ct = num(q.get("ct"), 6.3, 30, Cs.ct); }
	var C_PRE = [
		{ l: "A-alpha (motor, 15 µm)", s: { d: 15, my: true, dmg: 0 }, n: "The fastest fibres: motor nerves and muscle-spindle afferents. Thick axon, thick myelin, long internodes." },
		{ l: "A-beta (touch, 9 µm)", s: { d: 9, my: true, dmg: 0 }, n: "Touch, pressure and vibration fibres: the ones a routine sensory nerve conduction study measures." },
		{ l: "A-delta (sharp pain, 3 µm)", s: { d: 3, my: true, dmg: 0 }, n: "Thinly myelinated: the quick, sharp “first pain” and cold." },
		{ l: "C fibre (slow pain, 1 µm)", s: { d: 1, my: false, dmg: 0 }, n: "No myelin: the impulse has to regenerate at every point of membrane, so it creeps along at 0.5-2 m/s. That is why a burning “second pain” arrives a second after the sharp first pain from your foot." },
		{ l: "Squid giant axon (476 µm)", s: { d: 476, my: false, dmg: 0 }, n: "The axon Hodgkin and Huxley used: half a millimetre thick, no myelin. The model is exactly this fibre: about 18.6 m/s at 18.5 °C (they measured 21 m/s)." },
		{ l: "MS: slowing", s: { d: 9, my: true, dmg: 0.6, ct: 18.5 }, n: "Partial loss of myelin in the middle stretch (as in a multiple sclerosis plaque or chronic inflammatory demyelinating neuropathy): the impulse still gets through, but slower there; recordings show a longer delay and a wider, smaller response." },
		{ l: "MS: conduction block", s: { d: 9, my: true, dmg: 0.92, ct: 18.5 }, n: "Too much myelin lost: the current leaking out of the bare stretch can no longer bring the next node to threshold. The impulse stops: conduction block, the cause of weakness or numbness in a relapse." },
		{ l: "Uhthoff (warm a damaged fibre)", s: { d: 9, my: true, dmg: 0.82, ct: 27 }, n: "This damaged fibre conducts at 18.5 °C but blocks when warmed to 27 °C: warmer means shorter spikes and less charge to cross the damaged stretch. Drag the warmth back down and it conducts again, as symptoms of MS can worsen in a hot bath and recover on cooling." }
	];
	var cvStage = $("nr-cv-stage"), cvC = $("nr-cv-c"), cvX = cvC.getContext("2d"), cv = { W: 600, H: 400, run: null, t: 0, play: true, ref: {} };
	function condOpts(dmg, T) { return Cs.my ? { T: T, myelin: true, stim: 5, internodeLen: 1, nodeDensity: 5, nodes: 24, damage: dmg, every: 2 } : { T: T, len: 6, stim: 5, every: 2 }; }
	function refSpeed(T) { var key = (Cs.my ? "m" : "u") + T.toFixed(1); if (!cv.ref[key]) { var r = M.runCable(condOpts(0, T), 12); cv.ref[key] = Cs.my ? M.speedOf(r, 0.05, 0.35) : M.speedOf(r, 0.3, 0.8); } return cv.ref[key]; }
	var condT = null;
	function runCond() {
		var r = M.runCable(condOpts(Cs.dmg, Cs.ct), 12); cv.run = r; cv.t = 0; cv.play = true; $("nr-cv-play").textContent = "❚❚ Pause";
		var c = r.cable, act = []; for (var i = 0; i < c.N; i++) if (c.comp[i].active) act.push(i);
		cv.act = act; cv.e1 = act[Math.round((act.length - 1) * 0.2)]; cv.e2 = act[Math.round((act.length - 1) * 0.85)];
		var last = 0; for (i = 0; i < c.N; i++) if (!isNaN(r.cross[i])) last = Math.max(last, r.cross[i]); cv.tShow = Math.min(r.tEnd, last + 3.5); cv.wait = 0;
		cv.vBefore = Cs.my ? M.speedOf(r, 0.05, 0.35) : M.speedOf(r, 0.3, 0.8); cv.vLes = Cs.my ? M.speedOf(r, 0.42, 0.68) : cv.vBefore; cv.reach = M.reached(r); cv.vRef = refSpeed(Cs.ct);
		condReadouts(); condDraw(); sset({ cond: Cs });
	}
	function condSchedule() { clearTimeout(condT); condT = setTimeout(runCond, 80); }
	function trace(i) { var r = cv.run, out = new Float32Array(r.frames.length), tt = new Float32Array(r.frames.length); for (var f = 0; f < r.frames.length; f++) { out[f] = r.frames[f][i]; tt[f] = f * r.dtFrame; } return { t: tt, v: out }; }
	function condReadouts() {
		var r = cv.run, c = r.cable, t1 = r.cross[cv.e1], t2 = r.cross[cv.e2], dx = c.comp[cv.e2].x - c.comp[cv.e1].x, a1 = r.peak[cv.e1] + 65, a2 = r.peak[cv.e2] + 65;
		var ratio = cv.reach && cv.vLes && cv.vRef ? cv.vLes / cv.vRef : null, human = M.humanSpeed(Cs.d, Cs.my), fib = M.fibreOf(Cs.d, Cs.my), squid = Cs.d > 100;
		var est = squid ? null : ratio != null ? human * Math.min(1, ratio) : null;
		var ncv = !isNaN(t1) && !isNaN(t2) && cv.reach ? dx / (t2 - t1) * 10 : null;
		ro($("nr-cv-ro"), [
			{ l: "Model speed", v: cv.vBefore ? f1(cv.vBefore) + " m/s" : "–", s: Cs.my ? "before the damaged stretch" : "along the fibre" },
			{ l: Cs.my ? "Through the damaged stretch" : "Unmyelinated", v: !cv.reach ? "blocked" : Cs.my ? f1(cv.vLes) + " m/s" : "continuous", s: Cs.my ? (Cs.dmg > 0 ? f0(Cs.dmg * 100) + "% damage" : "no damage") : "no nodes to jump between", c: cv.reach ? "" : "is-bad" },
			{ l: "Reached the far end?", v: cv.reach ? "yes" : "no: conduction block", c: cv.reach ? "is-good" : "is-bad" },
			{ l: "Human fibre of " + (Cs.d < 10 ? Cs.d.toFixed(1) : f0(Cs.d)) + " µm", v: squid ? "(squid)" : est != null ? sg(est, 1) + " m/s" : "blocked", s: squid ? "the model's own fibre" : "estimate: " + (Cs.my ? "6 m/s per µm (Hursh)" : "1.5 × √d m/s") + (ratio != null && ratio < 0.99 ? " × " + f0(ratio * 100) + "% (damage)" : "") },
			{ l: "Fibre class", v: fib ? fib.name.split(" (")[0] : squid ? "giant axon" : "–", s: fib ? fib.does + " · normally " + fib.v[0] + "-" + fib.v[1] + " m/s" : "" }
		]);
		var tb = $("nr-ncs"), vHumanCV = est, lat20 = vHumanCV ? 200 / vHumanCV : null;
		tb.innerHTML = "<thead><tr><th>Measure</th><th>Model</th><th>What it means</th></tr></thead><tbody>" +
			"<tr><td>Arrival time at electrode 1 (before the damage)</td><td>" + (isNaN(t1) ? "none" : (t1 - 0.2).toFixed(2) + " ms") + "</td><td>after the stimulus</td></tr>" +
			"<tr><td>Arrival time at electrode 2 (after the damage)</td><td>" + (isNaN(t2) || !cv.reach ? "none" : (t2 - 0.2).toFixed(2) + " ms") + "</td><td>" + (cv.reach ? "" : "the impulse never arrived") + "</td></tr>" +
			"<tr><td>Distance between the electrodes</td><td>" + dx.toFixed(1) + " cm</td><td>model fibre</td></tr>" +
			"<tr><td>Conduction velocity</td><td>" + (ncv ? f1(ncv) + " m/s" : "–") + "</td><td>distance ÷ difference in arrival time</td></tr>" +
			"<tr><td>Response size at electrode 1 / 2</td><td>" + f0(a1) + " / " + f0(a2) + " mV</td><td>" + (a2 < 0.5 * a1 ? "drop over 50%: conduction block" : "about the same: no block") + "</td></tr></tbody>";
		$("nr-ncs-n").textContent = squid ? "" : vHumanCV ? "For a human fibre of this size the same test would read about " + sg(vHumanCV, 1) + " m/s, i.e. a delay of about " + sg(lat20, 1) + " ms over 20 cm (elbow to wrist). Normal adult arm motor and sensory nerves: about 50-70 m/s; demyelinating neuropathy is suggested below about 70% of the lower limit of normal." : "A blocked fibre gives no response beyond the damage.";
	}
	function vcol(V) {
		var t = clamp((V + 85) / 125, 0, 1), st = [[11, 29, 81], [30, 91, 214], [123, 47, 247], [255, 77, 109], [255, 209, 102]], s = t * 4, i = Math.min(3, Math.floor(s)), f = s - i, a = st[i], b = st[i + 1];
		return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," + Math.round(a[1] + (b[1] - a[1]) * f) + "," + Math.round(a[2] + (b[2] - a[2]) * f) + ")";
	}
	function condDraw() {
		var c = cvX, W = cv.W, H = cv.H; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var r = cv.run; if (!r) return;
		var cab = r.cable, Lx = cab.length, fi = Math.min(r.frames.length - 1, Math.floor(cv.t / r.dtFrame)), Vf = r.frames[fi];
		var mx = 52, aw = W - mx - 14, ax = function (x) { return mx + x / Lx * aw; }, top = 46, axH = Math.max(46, H * 0.27), ay = top + axH / 2, rad = Math.min(axH * 0.22, 16);
		c.font = "600 11px system-ui,sans-serif"; c.fillStyle = COL.text; c.textAlign = "left"; c.textBaseline = "top"; c.fillText("Axon (" + (Cs.my ? "myelinated" : "unmyelinated") + ", model " + Lx.toFixed(0) + " cm long) · t = " + (fi * r.dtFrame).toFixed(2) + " ms", mx, 10);
		/* axon interior coloured by voltage */
		for (var i = 0; i < cab.N; i++) { var cp = cab.comp[i], xa = ax(cp.x - cp.dx / 2), xb = ax(cp.x + cp.dx / 2); c.fillStyle = vcol(Vf[i]); c.fillRect(xa, ay - rad, Math.max(1, xb - xa + 0.6), rad * 2); }
		if (Cs.my) {
			/* myelin sheaths per internode */
			var start = null, kind = 2;
			for (i = 0; i <= cab.N; i++) {
				var cpi = cab.comp[i];
				if (i < cab.N && !cpi.active) { if (start == null) { start = cpi.x - cpi.dx / 2; kind = cpi.kind; } }
				else if (start != null) {
					var end = cab.comp[i - 1].x + cab.comp[i - 1].dx / 2, xa2 = ax(start) + 2, xb2 = ax(end) - 2, dm = kind === 3 ? Cs.dmg : 0, thick = rad * 0.9 * (1 - dm * 0.85);
					c.fillStyle = kind === 3 ? "rgba(214,190,140," + (0.85 - dm * 0.6) + ")" : "rgba(226,206,160,0.9)";
					if (thick > 0.6) { roundRect(c, xa2, ay - rad - thick, xb2 - xa2, thick, thick / 2); roundRect(c, xa2, ay + rad, xb2 - xa2, thick, thick / 2); }
					if (kind === 3 && dm > 0.3) { c.strokeStyle = "rgba(255,120,120,0.7)"; c.setLineDash([3, 4]); c.strokeRect(xa2, ay - rad - rad * 0.9, xb2 - xa2, rad * 3.8); c.setLineDash([]); }
					start = null;
				}
			}
			var ls = null, le = null; for (i = 0; i < cab.N; i++) if (cab.comp[i].kind === 3) { if (ls == null) ls = cab.comp[i].x; le = cab.comp[i].x; }
			if (ls != null && Cs.dmg > 0) { c.fillStyle = "#ff8a8a"; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText("damaged myelin " + f0(Cs.dmg * 100) + "%", (ax(ls) + ax(le)) / 2, ay - rad * 2.2); }
		} else { c.strokeStyle = "#6b7894"; c.lineWidth = 1; c.strokeRect(mx, ay - rad, aw, rad * 2); }
		/* stimulator + electrodes */
		c.fillStyle = "#ffd166"; c.font = "700 16px system-ui,sans-serif"; c.textAlign = "right"; c.textBaseline = "middle"; c.fillText("⚡", mx - 6, ay);
		[[cv.e1, COL.r1, "1"], [cv.e2, COL.r2, "2"]].forEach(function (e) { var x = ax(cab.comp[e[0]].x); c.fillStyle = e[1]; c.beginPath(); c.moveTo(x, ay + rad * 2.4 + 2); c.lineTo(x - 6, ay + rad * 2.4 + 12); c.lineTo(x + 6, ay + rad * 2.4 + 12); c.fill(); c.font = "600 11px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "top"; c.fillText("electrode " + e[2], x, ay + rad * 2.4 + 14); });
		/* voltage along the axon */
		var p2 = { x: mx, y: top + axH + 28, w: aw, h: Math.max(60, (H - top - axH - 28) * 0.42) }, xsA = [], vsA = [];
		for (i = 0; i < cab.N; i++) { if (Cs.my && !cab.comp[i].active && i % 2) continue; xsA.push(cab.comp[i].x); vsA.push(Vf[i]); }
		plot(c, p2, { x0: 0, x1: Lx, y0: -90, y1: 60, series: [{ t: xsA, v: vsA, col: COL.V, w: 2 }], hl: [{ y: 0, col: "#3a4560", dash: [1, 3] }], title: "Voltage along the axon now (mV)" });
		/* recordings */
		var p3 = { x: mx, y: p2.y + p2.h + 12, w: aw, h: H - (p2.y + p2.h + 12) - 28 }, T1 = trace(cv.e1), T2 = trace(cv.e2), upto = fi + 1;
		plot(c, p3, { x0: 0, x1: cv.tShow, y0: -90, y1: 60, series: [{ t: T1.t, v: T1.v, col: COL.r1, upto: upto, w: 1.8 }, { t: T2.t, v: T2.v, col: COL.r2, upto: upto, w: 1.8 }], cur: fi * r.dtFrame, xt: true, xl: "time after the stimulus (ms)", title: "Recordings (mV)", leg: [["electrode 1", COL.r1], ["electrode 2", COL.r2]] });
	}
	function roundRect(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.fill(); }
	function condFrame(dt) { if (!cv.run) return; if (cv.play) { if (cv.t >= cv.tShow) { cv.wait += dt; if (cv.wait > 1.5) { cv.t = 0; cv.wait = 0; } } else cv.t = Math.min(cv.tShow, cv.t + dt * Cs.spd); } condDraw(); }
	function condResize() { var s = fitStage(cvStage, function (w) { return w >= 640 ? Math.max(420, w / 1.9) : w * 1.25; }); cv.W = s.W; cv.H = s.H; condDraw(); }
	$("nr-cv-play").onclick = function () { cv.play = !cv.play; if (cv.play && cv.run && cv.t >= cv.tShow) cv.t = 0; this.textContent = cv.play ? "❚❚ Pause" : "▶ Play"; };
	$("nr-cv-replay").onclick = function () { cv.t = 0; cv.play = true; $("nr-cv-play").textContent = "❚❚ Pause"; };
	$("nr-cv-png").onclick = function () { png(cvC, "nerve-conduction"); };
	cvC.addEventListener("pointerdown", function (ev) { if (!cv.run) return; var rct = cvC.getBoundingClientRect(), x = ev.clientX - rct.left, f = clamp((x - 52) / (cv.W - 66), 0, 1); if (ev.clientY - rct.top > cv.H * 0.6) { cv.t = f * cv.tShow; cv.play = false; $("nr-cv-play").textContent = "▶ Play"; condDraw(); } });
	var dEl = $("nr-d"), myEl = $("nr-my"), dmgEl = $("nr-dmg"), ctEl = $("nr-ct");
	function condUI() {
		dEl.value = Cs.d > 30 ? 1.4 : Math.log10(Cs.d); $("nr-d-v").textContent = Cs.d < 10 ? Cs.d.toFixed(1) : f0(Cs.d); myEl.checked = Cs.my; dmgEl.value = Cs.dmg; $("nr-dmg-v").textContent = Cs.my ? f0(Cs.dmg * 100) + "%" : "needs myelin"; dmgEl.disabled = !Cs.my; ctEl.value = Cs.ct; $("nr-ct-v").textContent = Cs.ct.toFixed(1);
		var f = M.fibreOf(Cs.d, Cs.my); $("nr-d-n").textContent = Cs.d > 100 ? "Squid giant axon (the model's own fibre)." : f ? f.name + ": " + f.does + "." : Cs.my && Cs.d < 1 ? "Below about 1 µm, myelin no longer helps; such axons are unmyelinated." : "Outside the usual range for this kind of fibre.";
		$("nr-cspd").value = String(Cs.spd);
	}
	dEl.oninput = function () { Cs.d = Math.round(Math.pow(10, Number(dEl.value)) * 10) / 10; condUI(); condSchedule(); };
	myEl.onchange = function () { Cs.my = myEl.checked; if (Cs.d > 100) Cs.d = Cs.my ? 15 : Cs.d; condUI(); condSchedule(); };
	dmgEl.oninput = function () { Cs.dmg = Number(dmgEl.value); condUI(); condSchedule(); };
	ctEl.oninput = function () { Cs.ct = Number(ctEl.value); condUI(); condSchedule(); };
	$("nr-cspd").onchange = function () { Cs.spd = Number(this.value); sset({ cond: Cs }); };
	$("nr-cv-link").onclick = function () { copyLink(linkWith({ tab: "cond", d: Cs.d, my: Cs.my ? 1 : 0, dmg: Cs.dmg, ct: Cs.ct })); };
	var cpre = $("nr-cv-pre"); C_PRE.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p.l; b.onclick = function () { for (var k2 in p.s) Cs[k2] = p.s[k2]; if (p.s.ct == null) Cs.ct = 18.5; condUI(); setPressed(Array.prototype.slice.call(cpre.children), b); $("nr-cv-note").textContent = p.n; runCond(); }; cpre.appendChild(b); });
	$("nr-fib").innerHTML = "<thead><tr><th>Class</th><th>Diameter</th><th>Myelin</th><th>Speed</th><th>Carries</th></tr></thead><tbody>" + M.FIBRES.map(function (f) { return "<tr><td>" + esc(f.name) + "</td><td>" + f.d[0] + "-" + f.d[1] + " µm</td><td>" + (f.my ? "yes" : "no") + "</td><td>" + f.v[0] + "-" + f.v[1] + " m/s</td><td style=\"white-space:normal;text-align:left\">" + esc(f.does) + "</td></tr>"; }).join("") + "</tbody>";
	condUI();

	/* ======================================================= 3. SYNAPSES ======================================================= */
	var synView = saved.synView === "j" ? "j" : "n";
	function setSyn(v) { synView = v; setPressed([$("nr-s-n"), $("nr-s-j")], v === "n" ? $("nr-s-n") : $("nr-s-j")); $("nr-syn-n").hidden = v !== "n"; $("nr-syn-j").hidden = v !== "j"; sset({ synView: v }); setTimeout(onResize, 0); }
	$("nr-s-n").onclick = function () { setSyn("n"); }; $("nr-s-j").onclick = function () { setSyn("j"); };
	var S_DEF = { we: 0.8, wi: 1.5, re: 0, ri: 0, ss: 0.05 }, Sy = {}; for (k in S_DEF) Sy[k] = S_DEF[k]; if (saved.syn) for (k in saved.syn) if (k in S_DEF) Sy[k] = saved.syn[k];
	var SYNS = [{ id: "E1", k: "E", d: 40, key: "1" }, { id: "E2", k: "E", d: 100, key: "2" }, { id: "E3", k: "E", d: 200, key: "3" }, { id: "I1", k: "I", d: 0, key: "4" }, { id: "I2", k: "I", d: 80, key: "5" }];
	var sy = { n: new M.Neuron(), hist: [], W: 600, H: 400, play: true, anim: [], pend: [], spikeAnim: [], lastPsp: null }, syStage = $("nr-sy-stage"), syC = $("nr-sy-c"), syX = syC.getContext("2d");
	function fire(id, at) { var s = SYNS.filter(function (x) { return x.id === id; })[0], t = at == null ? sy.n.t : at; sy.n.input(s.k, s.k === "E" ? Sy.we : Sy.wi, s.d, t); sy.pend.push({ s: s, t: t }); }
	var SY_PRE = [
		{ l: "One EPSP", f: function () { fire("E1"); }, n: "One excitatory input: a bump of a few mV that fades over about 20 ms. Nowhere near threshold (15 mV above rest)." },
		{ l: "Temporal summation", f: function () { for (var i = 0; i < 4; i++) fire("E1", sy.n.t + i * 3); }, n: "The same synapse four times, 3 ms apart: each bump starts before the last has faded, they stack up and reach threshold." },
		{ l: "Too slow to add up", f: function () { for (var i = 0; i < 4; i++) fire("E1", sy.n.t + i * 40); }, n: "The same four inputs 40 ms apart: each EPSP has died away before the next, so they never add up." },
		{ l: "Spatial summation", f: function () { fire("E1"); fire("E2"); fire("E3"); }, n: "Three different synapses at the same moment: their EPSPs add at the axon hillock and just reach threshold. The far synapse (E3) contributes least: its current leaks away along the dendrite." },
		{ l: "Inhibition vetoes", f: function () { fire("E1"); fire("E2"); fire("E3"); fire("I1"); fire("I2"); }, n: "The same three plus two inhibitory synapses near the soma: the inhibitory (GABA-A, chloride) current holds the voltage near −75 mV and shunts the excitatory current, so the neuron stays silent. Inhibition close to the axon hillock is the most effective." },
		{ l: "Far synapse, fast", f: function () { for (var i = 0; i < 4; i++) fire("E3", sy.n.t + i * 3); }, n: "Four quick inputs on the far dendrite (200 µm): each one is so attenuated by the time it reaches the soma that even four do not fire the cell." }
	];
	var fb = $("nr-sy-fire"); SYNS.forEach(function (s) { var b = document.createElement("button"); b.type = "button"; b.className = s.k === "E" ? "nr-e" : "nr-i"; b.textContent = (s.k === "E" ? "＋ " : "− ") + s.id + " (" + s.d + " µm) · key " + s.key; b.onclick = function () { fire(s.id); }; fb.appendChild(b); });
	var spb = $("nr-sy-pre"); SY_PRE.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p.l; b.onclick = function () { p.f(); $("nr-sy-note").textContent = p.n; }; spb.appendChild(b); });
	function bindS(id, key, fmt) { var el = $("nr-" + id), out = $("nr-" + id + "-v"); el.value = Sy[key]; if (out) out.textContent = fmt(Sy[key]); el.addEventListener(el.tagName === "SELECT" ? "change" : "input", function () { Sy[key] = Number(el.value); if (out) out.textContent = fmt(Sy[key]); sset({ syn: Sy }); synReadouts(); }); }
	bindS("we", "we", function (v) { return v.toFixed(2) + " (EPSP about " + f1(M.psp("E", v, 40)) + " mV from E1)"; }); bindS("wi", "wi", function (v) { return v.toFixed(2); }); bindS("re", "re", String); bindS("ri", "ri", String); bindS("ss", "ss", String);
	$("nr-sy-play").onclick = function () { sy.play = !sy.play; this.textContent = sy.play ? "❚❚ Pause" : "▶ Play"; };
	$("nr-sy-clear").onclick = function () { sy.n = new M.Neuron(); sy.hist = []; sy.pend = []; sy.anim = []; };
	document.addEventListener("keydown", function (ev) { if (tab !== "syn" || synView !== "n") return; var tg = ev.target; if (tg && /INPUT|SELECT|TEXTAREA/.test(tg.tagName)) return; var s = SYNS.filter(function (x) { return x.key === ev.key; })[0]; if (s) { fire(s.id); ev.preventDefault(); } });
	function synLayout() {
		var W = sy.W, H = sy.H, wide = W >= 640, nr = wide ? { x: 0, y: 0, w: Math.round(W * 0.44), h: H } : { x: 0, y: 0, w: W, h: Math.round(H * 0.5) };
		var pr = wide ? { x: nr.w + 46, y: 36, w: W - nr.w - 58, h: H - 66 } : { x: 46, y: nr.h + 30, w: W - 58, h: H - nr.h - 60 };
		var sx = nr.x + nr.w * 0.55, syy = nr.y + nr.h * 0.5, R = Math.min(nr.w, nr.h) * 0.075 + 6, pos = {};
		var scl = Math.max(30, Math.min(sx - nr.x - 34, nr.h * 0.42) - R - 18), len = function (d) { return R + 18 + d / 200 * scl; };
		pos.E1 = ang(sx, syy, len(40), -2.4); pos.E2 = ang(sx, syy, len(100), 2.5); pos.E3 = ang(sx, syy, len(200), -3.1 + 0.15); pos.I1 = ang(sx, syy, R + 2, -1.6); pos.I2 = ang(sx, syy, len(80), 2.0 + 0.9);
		return { nr: nr, pr: pr, sx: sx, sy: syy, R: R, pos: pos, len: len };
	}
	function ang(x, y, r, a) { return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, a: a, r: r }; }
	function synDraw() {
		var c = syX, W = sy.W, H = sy.H; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var L = synLayout(), V = sy.n.V;
		/* dendrites */
		c.strokeStyle = "#4b5a7a"; c.lineCap = "round";
		[["E1", 40], ["E2", 100], ["E3", 200], ["I2", 80]].forEach(function (d) { var p = L.pos[d[0]]; c.lineWidth = 7; c.beginPath(); c.moveTo(L.sx, L.sy); c.lineTo(L.sx + Math.cos(p.a) * (p.r + 14), L.sy + Math.sin(p.a) * (p.r + 14)); c.stroke(); });
		/* axon + hillock */
		var hx = L.sx + L.R, ax1 = L.nr.x + L.nr.w - 10;
		c.fillStyle = "#4b5a7a"; c.beginPath(); c.moveTo(hx - 2, L.sy - L.R * 0.6); c.lineTo(hx + L.R * 0.9, L.sy - 3); c.lineTo(hx + L.R * 0.9, L.sy + 3); c.lineTo(hx - 2, L.sy + L.R * 0.6); c.fill();
		c.lineWidth = 5; c.strokeStyle = "#4b5a7a"; c.beginPath(); c.moveTo(hx + L.R * 0.9, L.sy); c.lineTo(ax1, L.sy); c.stroke();
		c.font = "11px system-ui,sans-serif"; c.fillStyle = COL.dim; c.textAlign = "center"; c.textBaseline = "top"; c.fillText("axon hillock", hx + L.R * 0.5, L.sy + L.R * 0.7 + 4); c.textAlign = "right"; c.fillText("axon →", ax1, L.sy + 6);
		sy.spikeAnim.forEach(function (s) { var x = hx + L.R * 0.9 + s.p * (ax1 - hx - L.R * 0.9); c.fillStyle = "#ffd166"; c.beginPath(); c.arc(x, L.sy, 6, 0, 7); c.fill(); });
		/* soma coloured by voltage */
		c.fillStyle = vcol(V); c.beginPath(); c.arc(L.sx, L.sy, L.R, 0, 7); c.fill(); c.strokeStyle = "#8a97b4"; c.lineWidth = 1.5; c.stroke();
		c.fillStyle = "#fff"; c.font = "700 12px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(f0(V) + " mV", L.sx, L.sy);
		/* synapses */
		SYNS.forEach(function (s) {
			var p = L.pos[s.id], col = s.k === "E" ? "#3fbf72" : "#ef6b7c", bx = p.x + Math.cos(p.a) * 14, by = p.y + Math.sin(p.a) * 14;
			if (s.id === "I1") { bx = p.x; by = p.y - 14; }
			var flash = sy.anim.filter(function (a) { return a.s === s; }), on = flash.length ? 1 - flash[0].p : 0;
			c.fillStyle = col; c.globalAlpha = 0.35 + 0.65 * on; c.beginPath(); c.arc(bx, by, 9 + on * 3, 0, 7); c.fill(); c.globalAlpha = 1;
			c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(bx, by, 9, 0, 7); c.stroke();
			c.fillStyle = "#fff"; c.font = "600 10px system-ui,sans-serif"; c.fillText(s.id, bx, by);
			flash.forEach(function (a) { for (var j = 0; j < 6; j++) { var tt = a.p, vx = bx + (p.x - bx) * tt + Math.sin(j * 1.7) * 4, vy = by + (p.y - by) * tt + Math.cos(j * 2.1) * 4; c.fillStyle = col; c.beginPath(); c.arc(vx, vy, 2, 0, 7); c.fill(); }
				if (a.p > 0.4) { var tp = (a.p - 0.4) / 0.6, wx = p.x + (L.sx - p.x) * tp, wy = p.y + (L.sy - p.y) * tp; c.strokeStyle = col; c.globalAlpha = 1 - tp * 0.6; c.lineWidth = 2; c.beginPath(); c.arc(wx, wy, 5 + 4 * (1 - tp) * Math.exp(-s.d / 300), 0, 7); c.stroke(); c.globalAlpha = 1; } });
		});
		c.font = "11px system-ui,sans-serif"; c.fillStyle = COL.dim; c.textAlign = "left"; c.textBaseline = "top"; c.fillText("Click a synapse (or keys 1-5)", L.nr.x + 8, L.nr.y + 8);
		/* trace */
		var h = sy.hist, now = sy.n.t, ts = new Float32Array(h.length), vs = new Float32Array(h.length);
		for (var i = 0; i < h.length; i++) { ts[i] = h[i][0] - now; vs[i] = h[i][1]; }
		var p = plot(c, L.pr, { x0: -200, x1: 0, y0: -80, y1: 35, series: [{ t: ts, v: vs, col: COL.V, w: 2 }], hl: [{ y: M.SYN.Vth, col: COL.thr, lab: "threshold −55" }, { y: M.SYN.EL, col: "#6b7894", dash: [2, 3], lab: "rest −70" }], xt: true, xl: "ms (now = 0)", title: "Voltage at the axon hillock (mV)" });
		c.save(); c.strokeStyle = COL.V; c.lineWidth = 2; sy.n.spikes.forEach(function (t) { var x = p.X(t - now); if (x < L.pr.x) return; c.beginPath(); c.moveTo(x, p.Y(M.SYN.Vth)); c.lineTo(x, p.Y(30)); c.stroke(); }); c.restore();
		c.save(); c.font = "10px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "top"; sy.pend.forEach(function (e) { var x = p.X(e.t - now); if (x < L.pr.x || x > L.pr.x + L.pr.w) return; c.fillStyle = e.s.k === "E" ? "#3fbf72" : "#ef6b7c"; c.fillText("▲", x, L.pr.y + L.pr.h - 12); }); c.restore();
	}
	var syAcc = 0;
	function synFrame(dt) {
		if (sy.play) {
			var simMs = dt * 1000 * Sy.ss, step = 0.025, nst = Math.round(simMs / step);
			for (var i = 0; i < nst; i++) {
				if (Sy.re > 0 && Math.random() < Sy.re * step / 1000) fire(["E1", "E2", "E3"][Math.floor(Math.random() * 3)]);
				if (Sy.ri > 0 && Math.random() < Sy.ri * step / 1000) fire(["I1", "I2"][Math.floor(Math.random() * 2)]);
				if (sy.n.step(step)) sy.spikeAnim.push({ p: 0 });
				syAcc += step; if (syAcc >= 0.1) { syAcc = 0; sy.hist.push([sy.n.t, sy.n.V]); }
			}
			while (sy.hist.length && sy.hist[0][0] < sy.n.t - 220) sy.hist.shift();
			/* start visual release for events whose time has come */
			sy.pend = sy.pend.filter(function (e) { if (e.t <= sy.n.t) { sy.anim.push({ s: e.s, p: 0 }); return false; } return true; });
		}
		sy.anim.forEach(function (a) { a.p += dt / 0.45; }); sy.anim = sy.anim.filter(function (a) { return a.p < 1; });
		sy.spikeAnim.forEach(function (a) { a.p += dt / 0.6; }); sy.spikeAnim = sy.spikeAnim.filter(function (a) { return a.p < 1; });
		synDraw(); if (Math.random() < 0.1) synReadouts();
	}
	function synReadouts() {
		var n = sy.n, recent = n.spikes.filter(function (t) { return t > n.t - 1000; }).length;
		ro($("nr-sy-ro"), [
			{ l: "Voltage now", v: f1(n.V) + " mV", s: (n.V - M.SYN.EL >= 0 ? "+" : "") + f1(n.V - M.SYN.EL) + " mV from rest" },
			{ l: "Distance to threshold", v: f1(M.SYN.Vth - n.V) + " mV", s: "threshold −55 mV" },
			{ l: "Spikes fired", v: String(n.spikes.length), s: recent + " in the last second (model time)", c: n.spikes.length ? "is-good" : "" },
			{ l: "One EPSP (E1 / E2 / E3)", v: f1(M.psp("E", Sy.we, 40)) + " / " + f1(M.psp("E", Sy.we, 100)) + " / " + f1(M.psp("E", Sy.we, 200)), s: "mV at the soma: farther = smaller" },
			{ l: "Inputs now", v: "E " + n.gE.toFixed(2) + " · I " + n.gI.toFixed(2), s: "synaptic conductance ÷ leak" }
		]);
	}
	function synResize() { var s = fitStage(syStage, function (w) { return w >= 640 ? Math.max(380, w / 2.1) : w * 1.3; }); sy.W = s.W; sy.H = s.H; synDraw(); }
	syC.addEventListener("pointerdown", function (ev) { var r = syC.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, L = synLayout(), best = null, bd = 30; SYNS.forEach(function (s) { var p = L.pos[s.id], bx = p.x + Math.cos(p.a) * 14, by = p.y + Math.sin(p.a) * 14; if (s.id === "I1") { bx = p.x; by = p.y - 14; } var d = Math.hypot(x - bx, y - by); if (d < bd) { bd = d; best = s; } }); if (best) fire(best.id); });

	/* NMJ */
	var NM_PAT = [["single", "Single", 1, 1], ["tof", "Train-of-four (2 Hz)", 2, 4], ["rns", "Repetitive 3 Hz × 10", 3, 10], ["tet", "50 Hz × 40", 50, 40]];
	var NM_NOTES = {
		normal: "Normal: each EPP is far above the 10-20 mV the fibres need, so every fibre fires on every stimulus even though release runs down a little. Train-of-four ratio 1.0.",
		ache: "An AChE inhibitor (neostigmine, pyridostigmine) slows ACh breakdown, so each packet acts longer on more receptors: a bigger EPP. Used to reverse non-depolarising blockers and to treat myasthenia gravis.",
		mg: "Myasthenia gravis: antibodies remove acetylcholine receptors, so the EPP is close to threshold. The first stimuli still work, but as release runs down more and more fibres fail: the decrement on repetitive nerve stimulation (over 10% is abnormal) and fatigable weakness.",
		mgache: "Myasthenia gravis treated with an AChE inhibitor: the same packets now make a bigger EPP, the safety margin comes back and the fade largely disappears.",
		roc: "A non-depolarising neuromuscular blocker (rocuronium, vecuronium) occupies receptors: the EPP falls below many fibres' thresholds and fades with the train. Anaesthetists use the train-of-four ratio: below 0.9 means residual block. (Real fade also has a presynaptic part, not modelled.)",
		lems: "Lambert-Eaton myasthenic syndrome: antibodies against presynaptic calcium channels reduce release, so the first response is small, but at high rates calcium builds up and release increases: an increment at 50 Hz (over 100% is typical)."
	};
	var nm = { cond: saved.nmCond && M.NMJ_COND[saved.nmCond] ? saved.nmCond : "normal", pat: saved.nmPat || "tof", res: null, shown: 0, acc: 0, flash: 0, W: 600, H: 400 }, nmStage = $("nr-nm-stage"), nmC = $("nr-nm-c"), nmX = nmC.getContext("2d");
	var nmc = $("nr-nm-cond"); Object.keys(M.NMJ_COND).forEach(function (k2) { var b = document.createElement("button"); b.type = "button"; b.textContent = M.NMJ_COND[k2].name; b.dataset.k = k2; b.onclick = function () { nm.cond = k2; sset({ nmCond: k2 }); nmUI(); nmRun(); }; nmc.appendChild(b); });
	var nmp = $("nr-nm-pat"); NM_PAT.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.textContent = p[1]; b.dataset.k = p[0]; b.onclick = function () { nm.pat = p[0]; sset({ nmPat: p[0] }); nmUI(); nmRun(); }; nmp.appendChild(b); });
	function nmUI() { Array.prototype.forEach.call(nmc.children, function (b) { b.setAttribute("aria-pressed", b.dataset.k === nm.cond ? "true" : "false"); }); Array.prototype.forEach.call(nmp.children, function (b) { b.setAttribute("aria-pressed", b.dataset.k === nm.pat ? "true" : "false"); }); $("nr-nm-note").textContent = NM_NOTES[nm.cond]; }
	function nmRun() { var p = NM_PAT.filter(function (x) { return x[0] === nm.pat; })[0]; nm.res = M.nmjTrain(nm.cond, p[2], p[3]); nm.freq = p[2]; nm.shown = 0; nm.acc = 1; nmReadouts(); nmDraw(); }
	$("nr-nm-run").onclick = nmRun; $("nr-nm-png").onclick = function () { png(nmC, "neuromuscular-junction"); };
	function nmReadouts() {
		var r = nm.res, a = r[0], z = r[r.length - 1], ch = (z.epp / a.epp - 1) * 100;
		ro($("nr-nm-ro"), [
			{ l: "First EPP", v: f0(a.epp) + " mV", s: "fibres need 10-20 mV" },
			{ l: "Safety factor", v: sg(a.epp / 15, 1) + "×", s: "first EPP ÷ 15 mV (typical threshold)", c: a.epp / 15 >= 1.5 ? "is-good" : "is-bad" },
			{ l: r.length > 1 ? "Last EPP" : "Twitch", v: r.length > 1 ? f0(z.epp) + " mV" : f0(a.twitch * 100) + "%", s: r.length > 1 ? (ch >= 0 ? "+" : "−") + f0(Math.abs(ch)) + "% (" + (ch < -10 ? "decrement" : ch > 40 ? "increment" : "small change") + ")" : "fibres that fire" },
			{ l: nm.pat === "tof" ? "Train-of-four ratio" : "Twitch last ÷ first", v: r.length > 1 && a.twitch > 0 ? sg((nm.pat === "tof" ? r[3] : z).twitch / a.twitch, 2) : r.length > 1 ? "no response" : "–", s: nm.pat === "tof" ? "4th ÷ 1st twitch; < 0.9 = residual block" : "", c: r.length > 1 && a.twitch > 0 && (nm.pat === "tof" ? r[3] : z).twitch / a.twitch < 0.9 ? "is-bad" : "" }
		]);
	}
	function nmDraw() {
		var c = nmX, W = nm.W, H = nm.H; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
		var r = nm.res; if (!r) return;
		var cond = M.NMJ_COND[nm.cond], cur = r[Math.max(0, Math.min(r.length - 1, nm.shown - 1))], topH = Math.min(H * 0.42, 220), cx = W / 2, fl = nm.flash;
		/* terminal */
		c.fillStyle = "#2b3b5c"; c.beginPath(); c.ellipse(cx, topH * 0.28, Math.min(W * 0.32, 220), topH * 0.2, 0, 0, 7); c.fill(); c.fillRect(cx - 14, 0, 28, topH * 0.15);
		c.fillStyle = COL.dim; c.font = "11px system-ui,sans-serif"; c.textAlign = "left"; c.textBaseline = "top"; c.fillText("nerve terminal", 8, 8);
		var pool = r.length && nm.shown ? 1 - Math.min(1, (r[0].quanta - cur.quanta) / r[0].quanta * 0.9) : 1, nves = Math.round(18 * pool);
		for (var i = 0; i < nves; i++) { c.fillStyle = "#8ecae6"; c.beginPath(); c.arc(cx + (i - nves / 2) * Math.min(18, W * 0.5 / 18), topH * 0.28 + Math.sin(i * 1.9) * topH * 0.07, 4, 0, 7); c.fill(); }
		/* cleft ACh */
		var cy = topH * 0.56, nach = Math.round(Math.min(60, (nm.shown ? cur.quanta : 0) / 3) * fl);
		for (i = 0; i < nach; i++) { c.fillStyle = "#ffd166"; c.beginPath(); c.arc(cx + Math.sin(i * 7.3) * Math.min(W * 0.3, 200), cy + Math.cos(i * 3.1) * topH * 0.05, 2.2, 0, 7); c.fill(); }
		var nache = Math.round(8 / cond.ache); c.fillStyle = "#ef6b7c"; c.font = "12px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; for (i = 0; i < nache; i++) c.fillText("✂", cx - Math.min(W * 0.3, 200) + i * Math.min(W * 0.6, 400) / Math.max(1, nache - 1), cy);
		/* endplate with receptors */
		var my = topH * 0.72; c.fillStyle = "#5a3d4a"; c.fillRect(W * 0.08, my, W * 0.84, topH * 0.22);
		var nrec = Math.round(24 * cond.rec); for (i = 0; i < 24; i++) { var x = cx - Math.min(W * 0.36, 260) + i * Math.min(W * 0.72, 520) / 23; c.fillStyle = i < nrec ? (fl > 0.2 ? "#7ee2a8" : "#3fbf72") : "#3a3f4a"; c.fillRect(x - 3, my - 6, 6, 8); }
		c.fillStyle = COL.dim; c.textAlign = "left"; c.textBaseline = "bottom"; c.font = "11px system-ui,sans-serif"; c.fillText("muscle endplate: " + nrec + "/24 receptors working · ✂ = AChE" + (cond.ache > 1 ? " (inhibited)" : ""), 8, my + topH * 0.22 + 14);
		/* bars */
		var pr = { x: 46, y: topH + 34, w: W - 58, h: (H - topH - 70) * 0.58 }, pr2 = { x: 46, y: pr.y + pr.h + 22, w: W - 58, h: (H - topH - 70) * 0.42 - 22 };
		var n = r.length, bw = pr.w / n;
		var p = plot(c, pr, { x0: 0, x1: n, y0: 0, y1: 80, hl: [] });
		c.save(); c.fillStyle = "rgba(255,107,107,0.14)"; c.fillRect(pr.x, p.Y(20), pr.w, p.Y(10) - p.Y(20)); c.restore();
		for (i = 0; i < Math.min(nm.shown, n); i++) { c.fillStyle = "#4cc9f0"; c.fillRect(pr.x + i * bw + bw * 0.15, p.Y(r[i].epp), bw * 0.7, p.Y(0) - p.Y(r[i].epp)); }
		var p2 = plot(c, pr2, { x0: 0, x1: n, y0: 0, y1: 100 });
		for (i = 0; i < Math.min(nm.shown, n); i++) { c.fillStyle = "#ff8c42"; c.fillRect(pr2.x + i * bw + bw * 0.15, p2.Y(r[i].twitch * 100), bw * 0.7, p2.Y(0) - p2.Y(r[i].twitch * 100)); }
		c.save(); c.font = "600 11px system-ui,sans-serif"; c.textAlign = "left"; c.textBaseline = "top"; [[pr, "Endplate potential per stimulus (mV)"], [pr2, "Twitch (% of fibres that fire)"]].forEach(function (z) { var tw = c.measureText(z[1]).width; c.fillStyle = "rgba(6,10,18,0.8)"; c.fillRect(z[0].x + 3, z[0].y + 2, tw + 8, 16); c.fillStyle = COL.text; c.fillText(z[1], z[0].x + 7, z[0].y + 4); });
		c.font = "10px system-ui,sans-serif"; c.textAlign = "right"; c.textBaseline = "bottom"; var lt = "fibre thresholds 10-20 mV", lw = c.measureText(lt).width; c.fillStyle = "rgba(6,10,18,0.8)"; c.fillRect(pr.x + pr.w - lw - 8, p.Y(20) - 14, lw + 6, 13); c.fillStyle = COL.thr; c.fillText(lt, pr.x + pr.w - 4, p.Y(20) - 1); c.restore();
	}
	function nmFrame(dt) {
		if (!nm.res) return; nm.flash = Math.max(0, nm.flash - dt * 3);
		if (nm.shown < nm.res.length) { var gap = nm.freq >= 20 ? 0.07 : 0.45; nm.acc += dt; if (nm.acc >= gap) { nm.acc = 0; nm.shown++; nm.flash = 1; } }
		nmDraw();
	}
	function nmResize() { var s = fitStage(nmStage, function (w) { return w >= 640 ? Math.max(420, w / 1.9) : w * 1.35; }); nm.W = s.W; nm.H = s.H; nmDraw(); }
	nmUI();

	/* ======================================================= 4. NERNST / GHK ======================================================= */
	var IONS = [["K", "K⁺", 1, "Ko", "Ki", "#a78bfa"], ["Na", "Na⁺", 1, "Nao", "Nai", "#ff8c42"], ["Cl", "Cl⁻", -1, "Clo", "Cli", "#5eead4"], ["Ca", "Ca²⁺", 2, "Cao", "Cai", "#ffd166"]];
	var I0 = M.ION_PRESETS.neuron, Io = { c: {}, p: {}, T: I0.T };
	function loadIon(pre) { for (var k2 in pre.c) Io.c[k2] = pre.c[k2]; for (k2 in pre.p) Io.p[k2] = pre.p[k2]; Io.T = pre.T; }
	loadIon(I0); if (saved.ion && saved.ion.c) { for (k in saved.ion.c) Io.c[k] = saved.ion.c[k]; for (k in saved.ion.p) Io.p[k] = saved.ion.p[k]; Io.T = saved.ion.T; }
	var IO_KEYS = ["Ko", "Ki", "Nao", "Nai", "Clo", "Cli", "Cao", "Cai"];
	if (q.get("tab") === "ion" && q.get("io")) { var iv = q.get("io").split(",").map(Number); IO_KEYS.forEach(function (kk, i) { if (iv[i] > 0) Io.c[kk] = iv[i]; }); if (iv[8] >= 0) Io.p.K = iv[8]; if (iv[9] >= 0) Io.p.Na = iv[9]; if (iv[10] >= 0) Io.p.Cl = iv[10]; if (isFinite(iv[11])) Io.T = iv[11]; }
	var iot = $("nr-iot");
	iot.innerHTML = "<thead><tr><th>Ion</th><th>Outside (mmol/L)</th><th>Inside (mmol/L)</th><th>z</th><th>Equilibrium potential</th><th>Driving force at rest</th><th>Net flow</th></tr></thead><tbody>" + IONS.map(function (x) { return '<tr><td><b class="nr-ion nr-ion--' + x[0] + '">' + x[1] + '</b></td><td><input type="number" step="any" min="0" data-c="' + x[3] + '" aria-label="' + x[1] + ' outside"></td><td><input type="number" step="any" min="0" data-c="' + x[4] + '" aria-label="' + x[1] + ' inside"></td><td>' + (x[2] > 0 ? "+" : "−") + Math.abs(x[2]) + '</td><td><b data-e="' + x[0] + '"></b></td><td data-df="' + x[0] + '"></td><td data-fl="' + x[0] + '"></td></tr>'; }).join("") + "</tbody>";
	Array.prototype.forEach.call(iot.querySelectorAll("input[data-c]"), function (inp) { inp.addEventListener("input", function () { var v = Number(inp.value); if (v > 0) { Io.c[inp.dataset.c] = v; ionCalc(); } }); });
	[["it", "T"], ["pk", "K"], ["pna", "Na"], ["pcl", "Cl"]].forEach(function (pp) { var el = $("nr-" + pp[0]); el.addEventListener("input", function () { var v = Number(el.value); if (el.value === "" || !isFinite(v) || v < 0) return; if (pp[1] === "T") Io.T = v; else Io.p[pp[1]] = v; ionCalc(); }); });
	function ionFill() { Array.prototype.forEach.call(iot.querySelectorAll("input[data-c]"), function (inp) { inp.value = Io.c[inp.dataset.c]; }); $("nr-it").value = Io.T; $("nr-pk").value = Io.p.K; $("nr-pna").value = Io.p.Na; $("nr-pcl").value = Io.p.Cl; }
	var iop = $("nr-io-pre"); Object.keys(M.ION_PRESETS).forEach(function (k2) { var b = document.createElement("button"); b.type = "button"; b.textContent = M.ION_PRESETS[k2].name; b.onclick = function () { loadIon(M.ION_PRESETS[k2]); ionFill(); ionCalc(); setPressed(Array.prototype.slice.call(iop.children), b); }; iop.appendChild(b); });
	var ioStage = $("nr-io-stage"), ioC = $("nr-io-c"), ioX = ioC.getContext("2d"), io = { W: 600, H: 200 };
	function ionCalc() {
		var E = {}, Vm = M.ghk(Io.c, Io.p, Io.T); IONS.forEach(function (x) { E[x[0]] = M.nernst(x[2], Io.c[x[3]], Io.c[x[4]], Io.T); });
		IONS.forEach(function (x) { var e = E[x[0]], df = Vm - e, into; iot.querySelector('[data-e="' + x[0] + '"]').textContent = f1(e) + " mV"; iot.querySelector('[data-df="' + x[0] + '"]').textContent = isFinite(df) ? (df >= 0 ? "+" : "−") + f1(Math.abs(df)) + " mV" : "–";
			/* positive ion: flows in when Vm > E; negative ion (current direction opposite) */
			into = x[2] > 0 ? df < 0 : df > 0;   /* cation enters when the inside is more negative than its E; anion the other way */ iot.querySelector('[data-fl="' + x[0] + '"]').textContent = Math.abs(df) < 0.5 ? "balanced" : into ? "into the cell" : "out of the cell"; });
		io.E = E; io.Vm = Vm;
		var base = M.ghk(M.ION_PRESETS.neuron.c, M.ION_PRESETS.neuron.p, 37);
		ro($("nr-io-ro"), [
			{ l: "Resting voltage (GHK)", v: f1(Vm) + " mV", s: isFinite(base) ? (Vm - base >= 0 ? "+" : "−") + f1(Math.abs(Vm - base)) + " mV vs a normal neuron (" + f1(base) + ")" : "" },
			{ l: "E_K", v: f1(E.K) + " mV" }, { l: "E_Na", v: f1(E.Na) + " mV" }, { l: "E_Cl", v: f1(E.Cl) + " mV" }, { l: "E_Ca", v: f1(E.Ca) + " mV" },
			{ l: "Per 10× gradient", v: f1(M.rtf(Io.T) * Math.LN10) + " mV", s: "RT/F × ln 10 at " + Io.T + " °C (for z = 1)" }
		]);
		var notes = [];
		if (Io.c.Ko >= 5.5) notes.push("Potassium " + Io.c.Ko + " mmol/L is high (hyperkalaemia; normal 3.5-5.0): E_K and the resting voltage move up (less negative). Partly depolarised membranes inactivate sodium channels, which slows conduction; in the heart this shows as peaked T waves, then wide QRS complexes and arrhythmias.");
		if (Io.c.Ko < 3.5) notes.push("Potassium " + Io.c.Ko + " mmol/L is low (hypokalaemia): the resting voltage moves down (more negative), so cells are harder to excite (muscle weakness), while in the heart repolarisation is prolonged (U waves, arrhythmias).");
		notes.push("The resting voltage sits close to E_K because at rest the membrane is far more permeable to K⁺ than to Na⁺ (here " + Io.p.K + " : " + Io.p.Na + "). During an action potential sodium permeability rises several hundredfold and the voltage heads for E_Na.");
		$("nr-io-n").textContent = notes.join(" ");
		sset({ ion: Io }); ionDraw();
	}
	function ionDraw() {
		var c = ioX, W = io.W, H = io.H; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = COL.bg; c.fillRect(0, 0, W, H); if (!io.E) return;
		var v0 = -120, v1 = 160, mx = 30, X = function (v) { return mx + (clamp(v, v0, v1) - v0) / (v1 - v0) * (W - 2 * mx); }, ay = H * 0.62;
		c.strokeStyle = COL.axis; c.lineWidth = 1; c.beginPath(); c.moveTo(mx, ay); c.lineTo(W - mx, ay); c.stroke();
		c.font = "11px system-ui,sans-serif"; c.fillStyle = COL.dim; c.textAlign = "center"; c.textBaseline = "top";
		for (var v = -120; v <= 160; v += 20) { c.beginPath(); c.moveTo(X(v), ay - 4); c.lineTo(X(v), ay + 4); c.stroke(); if (W > 420 || v % 40 === 0) c.fillText(String(v).replace("-", "−"), X(v), ay + 7); }
		c.textAlign = "right"; c.fillText("mV", W - mx, ay + 22);
		var rows = 0;
		IONS.forEach(function (x, i) { var e = io.E[x[0]]; if (!isFinite(e)) return; var px = X(e), ly = 18 + i * 22; c.strokeStyle = x[5]; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(px, ly + 14); c.lineTo(px, ay); c.stroke(); c.setLineDash([]); c.fillStyle = x[5]; c.font = "600 11px system-ui,sans-serif"; c.textAlign = px > W - 120 ? "right" : "left"; c.textBaseline = "top"; c.fillText("E" + x[1] + " " + f0(e) + (e > v1 ? " →" : ""), px + (px > W - 120 ? -3 : 3), ly);
			/* arrow from Vm toward E: the way the voltage would move if only this ion flowed */
			var a = X(io.Vm), b2 = X(e), yy = ay + 34 + i * 12; if (H < 220) return; c.strokeStyle = x[5]; c.lineWidth = 2; c.beginPath(); c.moveTo(a, yy); c.lineTo(b2, yy); c.stroke(); c.beginPath(); c.moveTo(b2, yy); c.lineTo(b2 + (b2 > a ? -6 : 6), yy - 4); c.lineTo(b2 + (b2 > a ? -6 : 6), yy + 4); c.fill(); c.lineWidth = 1; rows++; });
		if (H >= 220) { c.font = "11px system-ui,sans-serif"; c.fillStyle = COL.dim; c.textAlign = "left"; c.textBaseline = "top"; c.fillText("Arrows: where the voltage would go if only that ion could cross", mx, H - 16); }
		c.fillStyle = "#fff"; c.fillRect(X(io.Vm) - 1.5, ay - 26, 3, 30); c.font = "700 12px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText("rest " + f1(io.Vm), X(io.Vm), ay - 28);
	}
	function ionResize() { var s = fitStage(ioStage, function (w) { return w >= 640 ? 280 : 300; }); io.W = s.W; io.H = s.H; ionDraw(); }
	$("nr-io-use").onclick = function () { A.ko = Math.round(clamp(Io.c.Ko, 1.5, 12) * 10) / 10; refreshAll(); setTab("ap"); apCompute(); toast("Outside potassium set to " + A.ko + " mmol/L"); };
	$("nr-io-link").onclick = function () { copyLink(linkWith({ tab: "ion", io: IO_KEYS.map(function (k2) { return Io.c[k2]; }).concat([Io.p.K, Io.p.Na, Io.p.Cl, Io.T]).join(",") })); };
	ionFill();

	/* ======================================================= sizing / start ======================================================= */
	function onResize() { if (tab === "ap") apResize(); else if (tab === "cond") condResize(); else if (tab === "syn") { if (synView === "n") synResize(); else nmResize(); } else if (tab === "ion") ionResize(); if (apRefr && !refrBox.hidden && tab === "ap") drawRefr(); }
	var rT; window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(onResize, 60); });
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rT); rT = setTimeout(onResize, 60); }).observe(root);
	setMode(A.mode); setSyn(synView); nmRun(); synReadouts(); setTab(tab, true);
	requestAnimationFrame(frame);
	window.MESNeuroUI = { A: A, Cs: Cs, apCompute: apCompute, runCond: runCond, tick: function (ms) { tick((ms || 16) / 1000); } };
})();
