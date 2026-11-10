/* ui-tunnel: the "Tunnelling" tab. Wave packet vs barrier (MESQ.tunnel.Sim), drag handles on the barrier, exact T(E) chart. */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var T = Q.tunnel;
	var MASS = { electron: 1, gaas: 0.067, muon: 206.768, proton: T.MASSES.proton };
	var NAMES = { electron: "Electron", gaas: "Electron in GaAs", muon: "Muon", proton: "Proton", custom: "Particle" };
	var PRESETS = {
		thin: { type: "rect", V: 1, a: 0.3, E: 0.5, s: 2.5, mass: "electron" },
		thick: { type: "rect", V: 1, a: 1.4, E: 0.5, s: 2.5, mass: "electron" },
		above: { type: "rect", V: 0.5, a: 1, E: 0.75, s: 3.5, mass: "electron" },
		res: { type: "double", V: 0.6, a: 0.45, g: 2.5, E: -2, s: 10, mass: "electron" },
		alpha: { type: "alpha", V: 2, a: 1.5, E: 1.35, s: 1.8, mass: "electron" },
		stm: { type: "rect", V: 5, a: 0.4, E: 1, s: 2.5, mass: "electron" },
		field: { type: "tri", V: 3, a: 1.2, E: 1, s: 2.5, mass: "electron" },
		step: { type: "stepup", V: 1, a: 1, E: 1.3, s: 3, mass: "electron" },
		well: { type: "well", V: 1, a: 1.5, E: 0.25, s: 3, mass: "electron" },
		proton: { type: "rect", V: 1, a: 0.3 / T.lenUnit(T.MASSES.proton), E: 0.5, s: 2.5, mass: "proton" }
	};
	var DEF = { type: "rect", V: 1, a: 0.3, g: 2, E: 0.5, s: 2.5, mass: "electron", mc: 1, view: "fill", sp: 40, ball: true, mag: true, log: false, p: "thin" };
	var AMIN = 0.05, AMAX = 16;

	var api, st, el = {}, sim = null, shape = null, playing = false, raf = 0, done = false, ball = null, drag = null, peak0 = 1, layout = null, tlay = null, texact = 0, ro, visible = false;

	function $(id) { return document.getElementById(id); }
	function mass() { return st.mass === "custom" ? Math.max(0.01, +st.mc || 1) : MASS[st.mass] || 1; }
	function lu() { return T.lenUnit(mass()); }            // nm per simulation length unit
	function len(u, sig) { return Q.si(u * lu() * 1e-9, "m", sig || 3); }
	function eV(x) { return (Math.abs(x) < 0.1 && x !== 0 ? Q.fmt(x * 1000, 3) + " meV" : Q.fmt(x, 3) + " eV"); }
	function pct(p) { p = Math.max(0, p); if (p >= 0.001) return (p * 100).toFixed(p >= 0.1 ? 1 : 2) + "%"; if (p < 1e-12) return "0%"; return Q.fmt(p * 100, 2) + "%"; }
	function aToSl(a) { return Math.round(1000 * Math.log(a / AMIN) / Math.log(AMAX / AMIN)); }
	function slToA(v) { return AMIN * Math.pow(AMAX / AMIN, v / 1000); }
	function spFactor() { return Math.pow(10, (st.sp - 40) / 40); }

	/* energy of the nth transmission resonance (T close to 1) below the barrier top */
	function resonance(s, nth) {
		var n = 0, pp = 0, pr = 0, dE = s.V0 / 6000, found = s.V0 * 0.5;
		for (var E = 0.002; E < s.V0; E += dE) { var t = T.TofE(s, E); if (pp < pr && pr > t && pr > 0.5) { found = E - dE; if (++n >= nth) return found; } pp = pr; pr = t; }
		return found;
	}

	/* ---------- build the simulation from the settings ---------- */
	function build() {
		shape = T.shape(st.type, { V: st.V, a: st.a, g: st.g, W: 12, Vd: 1 });
		var VL = shape.VL || 0, E = Math.max(VL + 0.02, st.E), sig = st.s;
		if (st.type === "alpha") sig = Math.min(sig, 2);
		var ext = Math.max(Math.abs(shape.xa), Math.abs(shape.xb));
		var L = st.type === "alpha" ? 110 : Math.max(80, Math.ceil((ext + 9 * sig + 10) * 2 / 0.76));
		var vmin = 0; for (var x = shape.xa - 1; x <= shape.xb + 1; x += 0.05) vmin = Math.min(vmin, shape.f(x));
		var vtop = 0; for (x = shape.xa - 1; x <= shape.xb + 1; x += 0.05) vtop = Math.max(vtop, Math.min(shape.f(x), 12));
		var kmax = Math.max(Math.sqrt(Math.max(E - vmin, E) / T.C0) + 5 / (2 * sig), Math.sqrt(Math.max(0, vtop - E) / T.C0));
		var dxT = Math.min(0.06, 0.25 / kmax), phone = window.innerWidth < 700, nmax = phone ? 2048 : 4096, N = 1024;
		while (N < L / dxT && N < nmax) N *= 2;
		sim = new T.Sim({ shape: shape, E: E, sigma: sig, N: N, L: L });
		var mx = 0; for (var i = 0; i < sim.N; i++) mx = Math.max(mx, sim.re[i] * sim.re[i] + sim.im[i] * sim.im[i]);
		peak0 = mx || 1; done = false;
		texact = st.type === "alpha" ? T.TofE(shape, E, sim.xR) : T.tAvg(shape, E, sig, sim.xR);
		resetBall();
	}
	function resetBall() { ball = { x: sim.x0, dir: 1, gone: false, bounced: false }; }
	function stepBall(dt) {
		if (!ball || ball.gone) return;
		var E = sim.E0, s = 0, h = 0.02, left = Math.abs(dt);
		while (left > 0 && s < 4000) {
			var V = shape.f(ball.x), ke = E - V; if (ke <= 0) ke = 1e-6;
			var v = 2 * Math.sqrt(T.C0 * ke) / T.HBAR, step = Math.min(left, h / v), nx = ball.x + ball.dir * v * step;
			if (shape.f(nx) >= E) { ball.dir = -ball.dir; ball.bounced = true; nx = ball.x; }
			ball.x = nx; left -= step; s++;
			if (shape.type === "alpha" && ball.x < shape.xa + 0.05) { ball.dir = 1; ball.x = shape.xa + 0.05; }
			if (ball.x < sim.xL || ball.x > sim.xR) { ball.gone = true; break; }
		}
	}

	/* ---------- canvas sizing ---------- */
	function sizeStage(stage, cv, ratio, minH, maxH) {
		var w = stage.clientWidth || stage.parentNode.clientWidth || 600, wrap = stage.parentNode, fs = document.fullscreenElement === wrap;
		var h = Math.max(minH, Math.min(maxH, w * ratio)); if (w < 520) h = Math.max(minH, w * (ratio + 0.25));
		if (window.MESStage && MESStage.sh) h = MESStage.sh(stage, h);
		if (fs) { var other = 0; Array.prototype.forEach.call(wrap.children, function (c) { if (c !== stage) other += c.offsetHeight; }); h = Math.max(200, window.innerHeight - other); }
		stage.style.height = Math.round(h) + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
		return { w: w, h: h, dpr: dpr };
	}

	/* ---------- main drawing ---------- */
	function draw() {
		if (!sim) return;
		var S = sizeStage(el.stage, el.cv, 0.5, W0() < 520 ? 400 : 280, 560), ctx = el.cv.getContext("2d"), W = S.w, H = S.h;
		ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
		ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var padL = 46, padR = 12, padT = 34, padB = 30, phone = W < 520;
		if (phone) { padT = 30; padB = 108; padL = 40; }
		var half = Math.max(Math.abs(sim.x0) + 3.5 * sim.sigma, shape.xb + 4 * sim.sigma, 6), xmin = Math.max(sim.xL - 0.3 * sim.lab, -half), xmax = Math.min(sim.xR + 0.3 * sim.lab, half);
		if (shape.type === "alpha") { xmin = shape.xa - 2; xmax = Math.min(sim.xR, 22); }
		var E0 = sim.E0, vmax = 0, vmin = 0;
		for (var i = 0; i < sim.N; i++) { var x = sim.x[i]; if (x < xmin || x > xmax) continue; var V = sim.V[i]; if (V > vmax && V < 9) vmax = V; vmin = Math.min(vmin, V); }
		if (shape.type === "alpha") vmax = Math.max(vmax, shape.V0);
		var emax = Math.max(vmax, E0) * 1.3 + 0.05, emin = Math.min(vmin, 0) - 0.12 * (emax - Math.min(vmin, 0));
		/* while a handle is dragged the axes stay as they were, so the handle follows the pointer */
		if (drag && drag.view) { xmin = drag.view[0]; xmax = drag.view[1]; emin = drag.view[2]; emax = drag.view[3]; }
		var X = function (x) { return padL + (x - xmin) / (xmax - xmin) * (W - padL - padR); };
		var XI = function (px) { return xmin + (px - padL) / (W - padL - padR) * (xmax - xmin); };
		var Y = function (e) { return padT + (emax - e) / (emax - emin) * (H - padT - padB); };
		layout = { X: X, XI: XI, Y: Y, W: W, H: H, padT: padT, padB: padB, emin: emin, emax: emax, view: [xmin, xmax, emin, emax] };
		/* absorbing edges */
		ctx.fillStyle = "rgba(148,163,184,0.08)";
		if (sim.xL > xmin) ctx.fillRect(X(xmin), padT, X(sim.xL) - X(xmin), H - padT - padB);
		if (sim.xR < xmax) ctx.fillRect(X(sim.xR), padT, X(xmax) - X(sim.xR), H - padT - padB);
		/* axes: energy ticks */
		ctx.font = "11px system-ui, sans-serif"; ctx.textBaseline = "middle"; ctx.fillStyle = "#9aa6c0"; ctx.strokeStyle = "rgba(148,163,184,0.12)"; ctx.lineWidth = 1;
		var et = niceStep((emax - emin) / 5);
		for (var e = Math.ceil(emin / et) * et; e <= emax; e += et) { var y = Y(e); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.textAlign = "right"; ctx.fillText(+e.toFixed(3) + "", padL - 5, y); }
		ctx.save(); ctx.translate(11, (padT + H - padB) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("energy (eV)", 0, 0); ctx.restore();
		/* x ticks in real units */
		var span = (xmax - xmin) * lu(), unit = span > 3e3 ? 1e3 : span > 3 ? 1 : span > 3e-3 ? 1e-3 : 1e-6, uname = unit === 1e3 ? "µm" : unit === 1 ? "nm" : unit === 1e-3 ? "pm" : "fm";
		var xt = niceStep(span / unit / (phone ? 4 : 8)) * unit / lu();
		ctx.textAlign = "center"; ctx.textBaseline = "top";
		for (var xx = Math.ceil(xmin / xt) * xt; xx <= xmax; xx += xt) { var px = X(xx); ctx.fillText(+(xx * lu() / unit).toFixed(4) + "", px, H - padB + 4); ctx.beginPath(); ctx.moveTo(px, H - padB); ctx.lineTo(px, H - padB + 3); ctx.stroke(); }
		ctx.textAlign = "right"; ctx.fillText(uname, W - padR, H - padB + 16);
		/* potential (clipped to the plot) */
		ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, W - padL - padR, H - padT - padB); ctx.clip();
		ctx.beginPath(); ctx.moveTo(X(xmin), Y(emin));
		var Vat = function (x) { return shape.f(Math.min(Math.max(x, sim.xL), sim.xR)); };
		var steps = Math.max(400, W), last = 0;
		for (var k = 0; k <= steps; k++) { var xv = xmin + (xmax - xmin) * k / steps, vv = Math.min(Vat(xv), emax + 1); ctx.lineTo(X(xv), Y(vv)); last = vv; }
		ctx.lineTo(X(xmax), Y(emin)); ctx.closePath();
		var gr = ctx.createLinearGradient(0, padT, 0, H - padB); gr.addColorStop(0, "rgba(95,111,147,0.55)"); gr.addColorStop(1, "rgba(95,111,147,0.18)"); ctx.fillStyle = gr; ctx.fill();
		ctx.beginPath(); for (k = 0; k <= steps; k++) { xv = xmin + (xmax - xmin) * k / steps; vv = Math.min(Vat(xv), emax + 1); if (k) ctx.lineTo(X(xv), Y(vv)); else ctx.moveTo(X(xv), Y(vv)); }
		ctx.strokeStyle = "#8ea0c8"; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
		/* zero line */
		ctx.strokeStyle = "rgba(148,163,184,0.35)"; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke(); ctx.setLineDash([]);
		/* energy line */
		var yE = Y(E0);
		ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1.3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(padL, yE); ctx.lineTo(W - padR, yE); ctx.stroke(); ctx.setLineDash([]);
		/* wave */
		drawWave(ctx, X, yE, W, H, padL, padR, padT, xmin, xmax);
		/* handles */
		drawHandles(ctx, X, Y);
		/* labels */
		ctx.textBaseline = "bottom"; ctx.textAlign = "left"; ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#facc15";
		ctx.fillText("⟨E⟩ = " + eV(E0), padL + 6, yE - 3);
		/* classical ball */
		if (st.ball && ball && !ball.gone) {
			ctx.beginPath(); ctx.arc(X(ball.x), yE, 6, 0, 7); ctx.fillStyle = "#f97316"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
		}
		/* scale text */
		ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#9aa6c0"; ctx.textAlign = "right"; ctx.textBaseline = "top";

	}
	function W0() { return el.stage.clientWidth || 600; }
	function niceStep(r) { var p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

	function drawWave(ctx, X, yE, W, H, padL, padR, padT, xmin, xmax) {
		/* the packet's starting peak fills ~45% of the room above the energy line, so the interference fringes in front of a
		   barrier (up to 4x the incoming density) still mostly fit; anything taller is cut at the top of the picture */
		var N = sim.N, re = sim.re, im = sim.im, amp = Math.max(30, (yE - padT - 4) * 0.45), sc = amp / peak0, view = st.view, room = yE - padT + 2;
		/* magnify the far side */
		var mag = 1, xb = shape.type === "alpha" ? 0 : shape.xb, pl = 0, pr = 0, i;
		if (st.mag) {
			for (i = 0; i < N; i++) { var p = re[i] * re[i] + im[i] * im[i], x = sim.x[i]; if (x > xb + 0.3 && x < sim.xR) pr = Math.max(pr, p); else if (x < xb) pl = Math.max(pl, p); }
			if (pr > 0 && pr < peak0 * 0.02) { mag = Math.pow(10, Math.floor(Math.log10(peak0 * 0.3 / pr))); mag = Math.min(mag, 1e8); if (mag < 10) mag = 1; }
		}
		var cols = Math.round(W - padL - padR), px0 = padL, x0 = sim.x[0], dx = sim.dx;
		function idx(px) { var x = xmin + (px - px0) / cols * (xmax - xmin); return Math.max(0, Math.min(N - 1, Math.round((x - x0) / dx))); }
		function magAt(px) { var x = xmin + (px - px0) / cols * (xmax - xmin); return x > xb + 0.3 ? mag : 1; }
		if (view === "phase") {
			for (var c = 0; c < cols; c++) {
				var j = idx(px0 + c), d = (re[j] * re[j] + im[j] * im[j]) * sc * magAt(px0 + c); if (d < 0.4) continue;
				var rgb = Q.phaseRGB(Math.atan2(im[j], re[j]), 1); ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
				ctx.fillRect(px0 + c, yE - Math.min(d, room), 1.2, Math.min(d, room));
			}
		} else {
			ctx.beginPath(); ctx.moveTo(px0, yE);
			for (c = 0; c <= cols; c++) { j = idx(px0 + c); d = (re[j] * re[j] + im[j] * im[j]) * sc * magAt(px0 + c); ctx.lineTo(px0 + c, yE - Math.min(d, room)); }
			ctx.lineTo(px0 + cols, yE); ctx.closePath();
			ctx.fillStyle = view === "reim" ? "rgba(139,123,255,0.28)" : "rgba(139,123,255,0.62)"; ctx.fill();
			ctx.strokeStyle = "#b9adff"; ctx.lineWidth = 1.2; ctx.stroke();
			if (view === "reim") {
				var asc = amp * 0.55 / Math.sqrt(peak0);
				[["#22d3ee", re], ["#f472b6", im]].forEach(function (pair) {
					ctx.beginPath();
					for (var c2 = 0; c2 <= cols; c2++) { var j2 = idx(px0 + c2), v = pair[1][j2] * asc * Math.sqrt(magAt(px0 + c2)); v = Math.max(-(H - yE - 4), Math.min(room, v)); if (c2) ctx.lineTo(px0 + c2, yE - v); else ctx.moveTo(px0 + c2, yE - v); }
					ctx.strokeStyle = pair[0]; ctx.lineWidth = 1.1; ctx.stroke();
				});
			}
		}
		if (mag > 1) {
			var bx = X(xb + 0.3);
			ctx.strokeStyle = "rgba(244,114,182,0.6)"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(bx, padT); ctx.lineTo(bx, yE); ctx.stroke(); ctx.setLineDash([]);
			ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#f472b6"; ctx.textAlign = "left"; ctx.textBaseline = "top";
			ctx.fillText("× " + Q.fmt(mag, 1) + " (magnified)", bx + 5, padT + 2);
		}
	}

	/* handles: [kind, x, y] in canvas px */
	function handles() {
		if (!layout) return [];
		var X = layout.X, Y = layout.Y, s = shape, out = [], t = s.type, V = s.V0;
		if (t === "rect") { out.push(["h", X(0), Y(V)]); out.push(["w", X(s.xb), Y(V / 2)]); }
		else if (t === "double") { out.push(["h", X(s.g / 2 + s.a / 2), Y(V)]); out.push(["w", X(s.xb), Y(V / 2)]); out.push(["g", X(s.g / 2), Y(V / 2)]); }
		else if (t === "well") { out.push(["h", X(0), Y(-V)]); out.push(["w", X(s.xb), Y(-V / 2)]); }
		else if (t === "tri") { out.push(["h", X(0), Y(V)]); out.push(["w", X(s.xb), Y(0)]); }
		else if (t === "stepup") out.push(["h", X(Math.min(6, sim.xR / 3)), Y(V)]);
		else if (t === "stepdown") out.push(["h", X(Math.min(6, sim.xR / 3)), Y(-V)]);
		else if (t === "alpha") { out.push(["h", X(0), Y(V)]); out.push(["w", X(s.a), Y(V / 2)]); }
		return out;
	}
	function drawHandles(ctx, X, Y) {
		handles().forEach(function (h) {
			ctx.beginPath();
			if (h[0] === "h") ctx.arc(h[1], h[2], 7, 0, 7); else ctx.rect(h[1] - 6, h[2] - 6, 12, 12);
			ctx.fillStyle = drag && drag.k === h[0] ? "#ffffff" : "#c7d2fe"; ctx.fill(); ctx.strokeStyle = "#5b3fd6"; ctx.lineWidth = 2; ctx.stroke();
		});
	}
	function hit(px, py) { var hs = handles(), best = null, bd = 22; hs.forEach(function (h) { var d = Math.hypot(px - h[1], py - h[2]); if (d < bd) { bd = d; best = h; } }); return best; }
	function evPos(e, cv) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	function onDown(e) {
		var p = evPos(e, el.cv), h = hit(p.x, p.y); if (!h) return;
		drag = { k: h[0], id: e.pointerId, view: layout.view.slice() }; el.cv.setPointerCapture(e.pointerId); e.preventDefault(); draw();
	}
	function onMove(e) {
		var p = evPos(e, el.cv);
		if (!drag) { el.cv.style.cursor = hit(p.x, p.y) ? "grab" : "default"; return; }
		if (e.pointerId !== drag.id) return;
		var x = layout.XI(p.x), en = layout.emax - (p.y - layout.padT) / (layout.H - layout.padT - layout.padB) * (layout.emax - layout.emin), t = st.type;
		if (drag.k === "h") st.V = Q.clamp(+(t === "well" || t === "stepdown" ? -en : en).toFixed(2), 0.05, 6);
		else if (drag.k === "w") {
			var a = t === "rect" || t === "well" ? 2 * x : t === "double" ? x - st.g / 2 : x;
			st.a = Q.clamp(+a.toFixed(3), AMIN, AMAX);
		} else if (drag.k === "g") st.g = Q.clamp(+(2 * x).toFixed(2), 0.5, 8);
		st.p = null; syncInputs(); rebuild(true);
	}
	function onUp(e) { if (drag && e.pointerId === drag.id) { drag = null; api.save(); draw(); } }

	/* ---------- T(E) chart ---------- */
	function drawT() {
		if (!sim) return;
		var S = sizeStage(el.tstage, el.tcv, 0.3, W0() < 520 ? 280 : 190, 320), ctx = el.tcv.getContext("2d"), W = S.w, H = S.h;
		ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var padL = 50, padR = 14, padT = 34, padB = W < 520 ? 70 : 30, VL = shape.VL || 0;
		var emax = Math.max(shape.V0 * 2.2, sim.E0 * 1.5, 0.3), emin = Math.max(VL, 0) + 0.002;
		if (shape.type === "alpha") emin = 0.01;
		var lg = st.log, tmin = lg ? 1e-8 : 0;
		var X = function (e) { return padL + (e - emin) / (emax - emin) * (W - padL - padR); };
		var Y = function (t) { if (lg) t = Math.log10(Math.max(t, tmin)); var a = lg ? -8 : 0, b = lg ? 0 : 1; return padT + (b - t) / (b - a) * (H - padT - padB); };
		tlay = { X: X, emin: emin, emax: emax, padL: padL, padR: padR, W: W };
		ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#9aa6c0"; ctx.strokeStyle = "rgba(148,163,184,0.12)"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
		var ticks = lg ? [1, 1e-2, 1e-4, 1e-6, 1e-8] : [0, 0.25, 0.5, 0.75, 1];
		ticks.forEach(function (t) { var y = Y(t); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(lg ? (t === 1 ? "1" : "10" + Q.sup(Math.round(Math.log10(t)))) : String(t), padL - 5, y); });
		var et = niceStep((emax - emin) / 6); ctx.textAlign = "center"; ctx.textBaseline = "top";
		for (var e = Math.ceil(emin / et) * et; e <= emax; e += et) ctx.fillText(+e.toFixed(3) + "", X(e), H - padB + 4);
		ctx.textAlign = "right"; ctx.fillText("E (eV)", W - padR, H - padB + 16);
		/* packet energy spread (gaussian band) */
		var k0 = sim.k0, sk = 1 / (2 * sim.sigma), E0 = sim.E0;
		for (var px = padL; px < W - padR; px++) {
			var en = emin + (px - padL) / (W - padL - padR) * (emax - emin), kk = Math.sqrt(Math.max(0, en - VL) / T.C0), wgt = Math.exp(-(kk - k0) * (kk - k0) / (2 * sk * sk));
			if (wgt < 0.02) continue; ctx.fillStyle = "rgba(250,204,21," + (0.42 * wgt).toFixed(3) + ")"; ctx.fillRect(px, padT, 1, H - padT - padB);
		}
		/* barrier top line */
		if (shape.V0 > emin && shape.V0 < emax && shape.type !== "well") { ctx.strokeStyle = "rgba(142,160,200,0.6)"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(shape.V0), padT); ctx.lineTo(X(shape.V0), H - padB); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = "#8ea0c8"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("V₀", X(shape.V0) + 3, padT + 2); }
		/* curve */
		var g = T.segs(shape, sim.xR), n = Math.min(700, Math.round(W - padL - padR));
		ctx.beginPath();
		for (var i = 0; i <= n; i++) { var E = emin + (emax - emin) * i / n, t = T.trans(E, g.segs, g.VL, g.VR); var y = Y(t); if (i) ctx.lineTo(X(E), y); else ctx.moveTo(X(E), y); }
		ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1.8; ctx.stroke();
		/* exact average ring + simulated dot */
		var ex = texact, sx = X(E0);
		ctx.beginPath(); ctx.arc(sx, Y(ex), 7, 0, 7); ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 2; ctx.stroke();
		var s = sim.stats(), simT = shape.type === "alpha" ? null : s.right, fin = settled(s);
		if (simT != null && fin) { ctx.beginPath(); ctx.arc(sx, Y(simT), 4, 0, 7); ctx.fillStyle = "#f472b6"; ctx.fill(); }
		ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = "#f9a8d4"; ctx.textBaseline = "bottom";
		var lbl = shape.type === "alpha" ? "T(E) per hit on the barrier = " + Q.fmt(ex, 2) : "exact ⟨T⟩ = " + pct(ex) + (simT != null && fin ? "   simulated " + pct(simT) : "");
		ctx.textAlign = sx > W * 0.6 ? "right" : "left"; ctx.fillText(lbl, sx + (sx > W * 0.6 ? -10 : 10), Math.max(padT + 26, Y(ex) - 8));
	}

	/* the collision is over: nothing left near the barrier and the packet's slow tail has had time to arrive */
	function settled(s) {
		if (done) return true;
		var v = 2 * T.C0 * Math.max(sim.k0, 0.05) / T.HBAR, slow = Math.max(0.3 * v, v - 4 * 2 * T.C0 / (2 * sim.sigma) / T.HBAR);
		return s.inside < 2e-3 && sim.t > (Math.abs(shape.xb - sim.x0) + 4 * sim.sigma) / slow;
	}
	/* ---------- readouts ---------- */
	function readouts() {
		var s = sim.stats(), lab = shape.labels, alpha = shape.type === "alpha";
		el.lr.textContent = alpha ? "Round trip in the nucleus" : lab[0]; el.li.textContent = lab[1]; el.lt.textContent = lab[2];
		el.rr.textContent = alpha ? Q.si(2 * shape.W / (2 * T.C0 * sim.k0 / T.HBAR) * 1e-15, "s") : pct(s.left); el.ri.textContent = pct(alpha ? s.inside + s.left : s.inside); el.rt.textContent = pct(s.right);
		el.rx.textContent = alpha ? pct(texact) + " per hit" : pct(texact);
		el.lx.textContent = alpha ? "Escape chance per hit (exact)" : "Exact T for this packet";
		el.re.textContent = eV(sim.E0); el.rv.textContent = shape.type === "well" ? "−" + eV(shape.V0) + " (a dip)" : shape.type === "stepdown" ? "−" + eV(shape.V0) : eV(shape.V0);
		var top = shape.type === "well" || shape.type === "stepdown" ? 0 : shape.V0, kap = T.kappa(top, sim.E0);
		el.rk.textContent = kap > 0 ? len(1 / kap) : "none (E above the top)";
		el.rtime.textContent = Q.si(sim.t * 1e-15, "s");
		el.rc.textContent = !st.ball ? "hidden" : alpha ? "trapped forever" : sim.E0 < top ? "bounces back (100%)" : "goes over (100%)";
	}
	function scaleNote() {
		var m = mass(), u = lu(), name = st.mass === "custom" ? m + " mₑ" : NAMES[st.mass];
		el.badge.textContent = name + " · x in " + (u >= 0.9995 ? "nm" : u > 9e-4 ? "pm" : "fm") + " · E in eV · t in fs";
		var txt = "Lengths for " + (st.mass === "custom" ? "a particle of " + Q.fmt(m, 3) + " electron masses" : NAMES[st.mass].toLowerCase()) + ". ";
		if (Math.abs(m - 1) > 1e-9) txt += "The picture is the electron one with every length multiplied by √(mₑ/m) = " + Q.fmt(u, 3) + ": a heavier particle needs a much thinner barrier to tunnel as much. ";
		txt += "Grid: " + sim.N + " points, " + len(sim.dx) + " apart; time step " + Q.fmt(sim.dt, 2) + " fs.";
		if (shape.type === "alpha") txt += " Alpha decay preset: the Gamow picture (a particle rattling in a nucleus, leaking a little at each hit) at electron scale; real alpha decay has MeV energies and femtometre sizes, and lifetimes from microseconds to billions of years for the same reason as here: T is exponentially sensitive to the barrier.";
		if (shape.type === "rect" && st.p === "stm") { var k = T.kappa(shape.V0, sim.E0); txt += " STM: every extra 0.1 nm of gap divides the current by e^(2κ·0.1 nm) ≈ " + Q.fmt(Math.exp(2 * k * 0.1 / lu()), 2) + ", which is why the microscope can feel single atoms."; }
		el.scale.textContent = txt;
	}

	/* ---------- inputs ---------- */
	function syncInputs() {
		el.type.value = st.type; el.mass.value = st.mass; el.mcf.hidden = st.mass !== "custom"; el.mc.value = st.mc;
		el.E.value = st.E; el.Ev.textContent = eV(st.E);
		el.V.value = st.V; el.Vv.textContent = eV(st.V);
		el.a.value = aToSl(st.a); el.av.textContent = len(st.a);
		el.g.value = st.g; el.gv.textContent = len(st.g);
		el.s.value = st.s; el.sv.textContent = len(st.s);
		el.sp.value = st.sp; el.spv.textContent = "×" + Q.fmt(spFactor(), 2);
		el.view.value = st.view; el.ball.checked = !!st.ball; el.mag.checked = !!st.mag; el.log.setAttribute("aria-pressed", st.log ? "true" : "false");
		var t = st.type;
		el.gf.hidden = t !== "double"; el.af.hidden = t === "stepup" || t === "stepdown";
		el.al.textContent = t === "well" ? "Well width" : t === "alpha" ? "Coulomb tail length r₀" : t === "tri" ? "Barrier length" : t === "double" ? "Each barrier's width" : "Barrier width";
		el.E.min = t === "alpha" ? 0.1 : 0.02;
		Array.prototype.forEach.call(el.presets.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === st.p ? "true" : "false"); });
	}
	var rbT = 0;
	function rebuild(quick) {
		build(); scaleNote(); readouts(); draw(); drawT();
		clearTimeout(rbT); rbT = setTimeout(function () { api.save(); }, 250);
	}
	function linkUrl() {
		var u = new URL(location.href);
		["tu_t", "tu_E", "tu_V", "tu_a", "tu_g", "tu_s", "tu_m", "tu_mc"].forEach(function (k) { u.searchParams.delete(k); });
		u.searchParams.set("tab", "tunnel"); u.searchParams.set("tu_t", st.type); u.searchParams.set("tu_E", st.E); u.searchParams.set("tu_V", st.V); u.searchParams.set("tu_a", +st.a.toFixed(4));
		if (st.type === "double") u.searchParams.set("tu_g", st.g);
		u.searchParams.set("tu_s", st.s); u.searchParams.set("tu_m", st.mass); if (st.mass === "custom") u.searchParams.set("tu_mc", st.mc);
		return u.toString();
	}
	function applyPreset(id) {
		var p = PRESETS[id]; if (!p) return;
		st.type = p.type; st.V = p.V; st.a = p.a; st.s = p.s; st.mass = p.mass; if (p.g) st.g = p.g; st.p = id;
		if (p.E < 0) st.E = +resonance(T.shape(p.type, { V: p.V, a: p.a, g: p.g }), -p.E).toFixed(4); else st.E = p.E;
		st.mag = true; syncInputs(); rebuild(); st.log = texact < 0.02 && p.type !== "alpha"; syncInputs(); drawT(); setPlay(true);
	}
	function readQuery(q) {
		if (!q.get("tu_t")) return;
		var num = function (k, lo, hi, d) { var v = parseFloat(q.get(k)); return isFinite(v) ? Q.clamp(v, lo, hi) : d; };
		var t = q.get("tu_t"); if (["rect", "double", "stepup", "stepdown", "well", "tri", "alpha"].indexOf(t) >= 0) st.type = t;
		st.E = num("tu_E", 0.02, 5, st.E); st.V = num("tu_V", 0.05, 6, st.V); st.a = num("tu_a", AMIN, AMAX, st.a); st.g = num("tu_g", 0.5, 8, st.g); st.s = num("tu_s", 0.8, 10, st.s);
		var m = q.get("tu_m"); if (MASS[m] || m === "custom") st.mass = m; st.mc = num("tu_mc", 0.01, 100000, st.mc); st.p = null;
	}

	/* ---------- animation ---------- */
	function setPlay(on) {
		playing = !!on; el.play.textContent = playing ? "Pause" : "Play"; el.play.setAttribute("aria-pressed", playing ? "true" : "false");
		if (playing && done) { sim.reset(); resetBall(); done = false; }
		if (playing && visible && !raf) raf = requestAnimationFrame(frame);
	}
	function stepsPerFrame() {
		var v = 2 * T.C0 * Math.max(sim.k0, 0.3) / T.HBAR, D = sim.xR - sim.x0, tc = D / v;
		if (shape.type === "alpha") tc = 60 / v * 8;
		return Math.max(1, Math.round(tc / 6 / 60 / sim.dt * spFactor()));
	}
	function advance(n) {
		var t0 = performance.now(), want = n, done2 = 0, chunk = Math.max(1, Math.min(want, 20));
		while (done2 < want) { sim.step(chunk); done2 += chunk; if (performance.now() - t0 > 8) break; }
		stepBall(done2 * sim.dt);
		var s = sim.stats();
		if (shape.type !== "alpha" && s.onGrid < 0.002) { done = true; setPlay(false); }
		if (shape.type === "alpha" && s.inside + s.left < 0.003) { done = true; setPlay(false); }
	}
	function frame() {
		raf = 0; if (!playing || !visible) return;
		advance(stepsPerFrame()); draw(); readouts();
		frame.n = (frame.n || 0) + 1; if (frame.n % 6 === 0 || done) drawT();
		if (playing) raf = requestAnimationFrame(frame);
	}

	function fullscreen(wrap) { if (document.fullscreenElement === wrap) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); }

	Q.reg("tunnel", {
		init: function (panel, a) {
			api = a; st = api.st;
			Object.keys(DEF).forEach(function (k) { if (st[k] == null) st[k] = DEF[k]; });
			readQuery(api.query);
			["wrap", "stage", "cv", "badge", "play", "step", "reset", "view", "fs", "twrap", "tstage", "tcv", "log", "tfs", "type", "mass", "mcf", "mc", "E", "Ev", "V", "Vv", "a", "av", "al", "af", "g", "gv", "gf", "s", "sv", "sp", "spv", "ball", "mag", "link", "scale", "presets",
				"lr", "li", "lt", "lx", "rr", "ri", "rt", "rx", "re", "rv", "rk", "rtime", "rc"].forEach(function (k) { el[k] = $("qm-tu-" + k); });
			el.presets.addEventListener("click", function (e) { var b = e.target.closest("button[data-p]"); if (b) applyPreset(b.dataset.p); });
			el.play.addEventListener("click", function () { setPlay(!playing); });
			el.step.addEventListener("click", function () { setPlay(false); if (done) { sim.reset(); resetBall(); done = false; } advance(stepsPerFrame() * 10); draw(); readouts(); drawT(); });
			el.reset.addEventListener("click", function () { sim.reset(); resetBall(); done = false; draw(); readouts(); drawT(); });
			el.view.addEventListener("change", function () { st.view = el.view.value; api.save(); draw(); });
			el.fs.addEventListener("click", function () { fullscreen(el.wrap); });
			el.tfs.addEventListener("click", function () { fullscreen(el.twrap); });
			el.log.addEventListener("click", function () { st.log = !st.log; syncInputs(); api.save(); drawT(); });
			function inp(id, fn) { el[id].addEventListener("input", function () { fn(el[id].value); st.p = null; syncInputs(); rebuild(true); }); }
			inp("E", function (v) { st.E = +v; }); inp("V", function (v) { st.V = +v; }); inp("a", function (v) { st.a = +slToA(+v).toFixed(4); });
			inp("g", function (v) { st.g = +v; }); inp("s", function (v) { st.s = +v; });
			el.sp.addEventListener("input", function () { st.sp = +el.sp.value; syncInputs(); api.save(); });
			el.type.addEventListener("change", function () { st.type = el.type.value; st.p = null; if (st.type === "alpha") { st.E = Math.min(st.E, st.V * 0.8); st.a = Math.min(Math.max(st.a, 0.5), 4); } syncInputs(); rebuild(); });
			el.mass.addEventListener("change", function () { st.mass = el.mass.value; st.p = null; syncInputs(); rebuild(); });
			el.mc.addEventListener("change", function () { st.mc = Q.clamp(+el.mc.value || 1, 0.01, 100000); syncInputs(); rebuild(); });
			el.ball.addEventListener("change", function () { st.ball = el.ball.checked; api.save(); draw(); readouts(); });
			el.mag.addEventListener("change", function () { st.mag = el.mag.checked; api.save(); draw(); });
			el.link.addEventListener("click", function () { api.copy(linkUrl(), "Link copied"); });
			el.cv.addEventListener("pointerdown", onDown); el.cv.addEventListener("pointermove", onMove); el.cv.addEventListener("pointerup", onUp); el.cv.addEventListener("pointercancel", onUp);
			el.cv.addEventListener("touchstart", function (e) { var t = e.touches[0]; if (!t) return; var r = el.cv.getBoundingClientRect(); if (hit(t.clientX - r.left, t.clientY - r.top)) e.preventDefault(); }, { passive: false });
			el.cv.addEventListener("keydown", function (e) {
				if (e.key === " ") { e.preventDefault(); setPlay(!playing); }
				else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); st.V = Q.clamp(+(st.V + (e.key === "ArrowUp" ? 0.05 : -0.05)).toFixed(2), 0.05, 6); st.p = null; syncInputs(); rebuild(); }
				else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); st.a = Q.clamp(st.a * (e.key === "ArrowRight" ? 1.06 : 1 / 1.06), AMIN, AMAX); st.p = null; syncInputs(); rebuild(); }
			});
			el.tcv.addEventListener("click", function (e) { if (!tlay) return; var p = evPos(e, el.tcv), en = tlay.emin + (p.x - tlay.padL) / (tlay.W - tlay.padL - tlay.padR) * (tlay.emax - tlay.emin); st.E = Q.clamp(+en.toFixed(3), 0.02, 5); st.p = null; syncInputs(); rebuild(); });
			if (window.ResizeObserver) { ro = new ResizeObserver(function () { if (visible) { draw(); drawT(); } }); ro.observe(el.stage); ro.observe(el.tstage); }
			window.addEventListener("resize", function () { if (visible) { draw(); drawT(); } });
			document.addEventListener("fullscreenchange", function () { if (visible) setTimeout(function () { draw(); drawT(); }, 60); });
			syncInputs(); build(); scaleNote(); readouts();
			window.MESQuantumDebug_tunnel = { get sim() { return sim; }, get shape() { return shape; }, st: st, step: function (n) { sim.step(n || 100); stepBall((n || 100) * sim.dt); draw(); readouts(); drawT(); return sim.stats(); }, toTime: function (fs) { var t0 = sim.t; while (sim.t < fs) sim.step(50); stepBall(sim.t - t0); draw(); readouts(); drawT(); return sim.stats(); }, run: function (fs) { while (!done && fs-- > 0) advance(stepsPerFrame()); draw(); readouts(); drawT(); return sim.stats(); }, preset: applyPreset, handles: handles, draw: function () { draw(); drawT(); } };
		},
		show: function () { visible = true; draw(); drawT(); readouts(); if (playing && !raf) raf = requestAnimationFrame(frame); },
		hide: function () { visible = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
	});
})();
