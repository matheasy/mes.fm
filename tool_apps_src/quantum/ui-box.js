/* ui-box: the "Wells & energy levels" tab. Stationary states by MESQ.tunnel.solveWell, click levels to build a superposition that moves. */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var T = Q.tunnel;
	var MASS = { electron: 1, gaas: 0.067, muon: 206.768, proton: T.MASSES.proton, h2: T.MASSES.proton / 2 };
	var NAMES = { electron: "Electron", gaas: "Electron in GaAs", muon: "Muon", proton: "Proton", h2: "H₂ vibration (μ = mₚ/2)", custom: "Particle" };
	/* parameter sliders per potential: key, label, min, max, log?, unit */
	var PARAMS = {
		inf: [["L", "Box width L", 0.1, 5, true, "nm"]],
		fin: [["a", "Well width", 0.1, 5, true, "nm"], ["V", "Well depth V₀", 0.02, 5, false, "eV"]],
		ho: [["w", "Spring ħω", 0.005, 1, true, "eV"]],
		dw: [["V", "Barrier between the wells", 0.1, 4, false, "eV"], ["b", "Distance of each well from the middle", 0.2, 2, false, "nm"]],
		morse: [["D", "Bond energy D", 0.5, 10, false, "eV"], ["a", "Width parameter a", 5, 40, false, "/nm"], ["re", "Bond length", 0.03, 0.3, false, "nm"]],
		lin: [["F", "Force (slope)", 0.05, 20, true, "eV/nm"]],
		custom: [["L", "Width", 0.3, 5, true, "nm"], ["vmax", "Height scale", 0.05, 5, true, "eV"]]
	};
	var DEFP = { inf: { L: 1 }, fin: { a: 1, V: 2 }, ho: { w: 0.2 }, dw: { V: 1, b: 1 }, morse: { D: 4.75, a: 19.43, re: 0.0741 }, lin: { F: 2 }, custom: { L: 2, vmax: 1, pts: [1, 0.4, 0.1, 0.25, 0.7, 0.25, 0.1, 0.4, 1] } };
	var PRESETS = {
		inf: { type: "inf", mass: "electron", sel: [0, 1] }, fin: { type: "fin", mass: "electron", sel: [0] }, ho: { type: "ho", mass: "electron", sel: [0, 1] },
		dw: { type: "dw", mass: "electron", sel: [0, 1] }, morse: { type: "morse", mass: "h2", sel: [0] }, lin: { type: "lin", mass: "electron", sel: [0, 1] },
		custom: { type: "custom", mass: "electron", sel: [0] }, slosh: { type: "ho", mass: "electron", sel: [0, 1, 2, 3, 4, 5, 6, 7], coh: 1.6 }
	};
	var COL = ["#22d3ee", "#a3e635", "#facc15", "#fb923c", "#f472b6", "#c084fc", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#e879f9", "#38bdf8"];

	var api, st, el = {}, sol = null, well = null, playing = false, raf = 0, visible = false, t = 0, lastTs = 0, re, im, amps = [], scaleP = 1, lay = null, drag = null, trail = [];

	function $(id) { return document.getElementById(id); }
	function mass() { return st.mass === "custom" ? Math.max(0.01, +st.mc || 1) : MASS[st.mass] || 1; }
	function cc() { return T.C0 / mass(); }
	function eV(x) { var a = Math.abs(x); return a !== 0 && a < 0.1 ? (a < 1e-4 ? Q.fmt(x * 1e6, 3) + " µeV" : Q.fmt(x * 1000, 3) + " meV") : Q.fmt(x, 4) + " eV"; }
	function nm(x) { return Q.si(x * 1e-9, "m"); }
	function P() { st.p_ = st.p_ || {}; if (!st.p_[st.type]) st.p_[st.type] = JSON.parse(JSON.stringify(DEFP[st.type])); return st.p_[st.type]; }
	function spF() { return Math.pow(10, (st.sp - 50) / 35); }
	function n0() { return st.type === "ho" || st.type === "morse" ? 0 : 1; }
	function lname(n) { return (st.type === "morse" ? "v = " : "n = ") + (n + n0()); }

	/* ---------- solve ---------- */
	function solve() {
		var p = P(), q = JSON.parse(JSON.stringify(p));
		if (st.type === "custom") q.pts = (p.pts || DEFP.custom.pts).map(function (v) { return v * p.vmax; });
		well = T.well(st.type, q, cc());
		var phone = window.innerWidth < 700, N = st.type === "morse" ? (phone ? 1400 : 2400) : (phone ? 700 : 1200);
		sol = T.solveWell(well, N, st.type === "morse" ? 26 : 14);
		re = new Float64Array(sol.N); im = new Float64Array(sol.N);
		st.sel = (st.sel || []).filter(function (n) { return n < sol.E.length; });
		mix();
	}
	function mix() {
		var sel = st.sel.slice().sort(function (a, b) { return a - b; });
		if (st.coh > 0 && st.type === "ho") {
			var a = st.coh, w = sel.map(function (n) { var f = 1; for (var k = 2; k <= n; k++) f *= k; return Math.pow(a, n) / Math.sqrt(f); }), s = Math.sqrt(w.reduce(function (x, y) { return x + y * y; }, 0));
			amps = sel.map(function (n, i) { return { n: n, a: w[i] / s }; });
		} else amps = sel.map(function (n) { return { n: n, a: 1 / Math.sqrt(sel.length) }; });
		/* density scale: the biggest |Psi|^2 over a few moments */
		scaleP = 1e-9; var Tb = period() || 1;
		for (var k = 0; k < 9; k++) { T.superpose(sol, amps, Tb * k / 9, re, im); for (var i = 0; i < sol.N; i++) scaleP = Math.max(scaleP, re[i] * re[i] + im[i] * im[i]); }
		trail = [];
	}
	function period() {
		if (amps.length < 2) return amps.length ? T.H / Math.max(1e-12, Math.abs(sol.E[amps[0].n])) : 0;
		var g = Infinity; for (var i = 0; i < amps.length; i++) for (var j = i + 1; j < amps.length; j++) g = Math.min(g, Math.abs(sol.E[amps[j].n] - sol.E[amps[i].n]));
		/* for evenly spaced levels the whole pattern repeats after h / (smallest gap) */
		return T.H / g;
	}

	/* ---------- drawing ---------- */
	function size() {
		var stage = el.stage, w = stage.clientWidth || 600, wrap = el.wrap, fs = document.fullscreenElement === wrap;
		var h = Math.max(320, Math.min(620, w * 0.58)); if (w < 520) h = Math.max(520, w * 1.45);
		if (window.MESStage && MESStage.sh) h = MESStage.sh(stage, h);
		if (fs) { var o = 0; Array.prototype.forEach.call(wrap.children, function (c) { if (c !== stage) o += c.offsetHeight; }); h = Math.max(240, window.innerHeight - o); }
		stage.style.height = Math.round(h) + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		if (el.cv.width !== Math.round(w * dpr) || el.cv.height !== Math.round(h * dpr)) { el.cv.width = Math.round(w * dpr); el.cv.height = Math.round(h * dpr); }
		return { w: w, h: h, dpr: dpr };
	}
	function topE() {
		var E = sol.E, top = well.top;
		if (st.type === "inf") top = E.length ? E[Math.min(5, E.length - 1)] * 1.12 : top;
		if (st.type === "custom") top = Math.max(top, E.length > 3 ? E[3] * 1.08 : top);
		if (st.type === "lin" || st.type === "ho") top = Math.min(top, E.length ? E[E.length - 1] * 1.04 : top);
		return top;
	}
	function draw() {
		if (!sol) return;
		var S = size(), ctx = el.cv.getContext("2d"), W = S.w, H = S.h, phone = W < 520;
		ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var padL = phone ? 40 : 52, padR = phone ? 64 : 104, padT = 34, strip = amps.length ? Math.round(H * (phone ? 0.27 : 0.25)) : 0, padB = 26 + strip + (phone ? 96 : 0);
		var x0 = well.x0, x1 = well.x1, top = topE(), vmin = 0;
		for (var i = 0; i < sol.N; i += 4) vmin = Math.min(vmin, sol.V[i]);
		var emin = vmin - 0.06 * (top - vmin);
		var X = function (x) { return padL + (x - x0) / (x1 - x0) * (W - padL - padR); };
		var XI = function (px) { return x0 + (px - padL) / (W - padL - padR) * (x1 - x0); };
		var Y = function (e) { return padT + (top - e) / (top - emin) * (H - padT - padB); };
		var YI = function (py) { return top - (py - padT) / (H - padT - padB) * (top - emin); };
		lay = { X: X, XI: XI, Y: Y, YI: YI, W: W, H: H, padT: padT, padB: padB, padL: padL, padR: padR };
		/* grid + axis */
		ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#9aa6c0"; ctx.strokeStyle = "rgba(148,163,184,0.1)"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
		var es = nice((top - emin) / 6);
		for (var e = Math.ceil(emin / es) * es; e <= top; e += es) { var y = Y(e); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillText(+e.toFixed(4) + "", padL - 5, y); }
		ctx.save(); ctx.translate(11, (padT + H - padB) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("energy (eV)", 0, 0); ctx.restore();
		var xs = nice((x1 - x0) / (phone ? 4 : 7)), unit = (x1 - x0) < 0.9 ? 1e-3 : 1, un = unit === 1 ? "nm" : "pm";
		xs = nice((x1 - x0) / unit / (phone ? 4 : 7)) * unit;
		ctx.textAlign = "center"; ctx.textBaseline = "top";
		var yb = H - padB;
		for (var xx = Math.ceil(x0 / xs) * xs; xx <= x1 + 1e-12; xx += xs) ctx.fillText(+(xx / unit).toFixed(3) + "", X(xx), yb + 4);
		ctx.textAlign = "right"; ctx.fillText(un, W - padR, yb + 15);
		/* potential */
		var clipV = function (v) { return Math.min(v, top + (top - emin)); };
		var stepI = Math.max(1, Math.floor(sol.N / (W * 1.5)));
		/* shade under the potential curve */
		ctx.beginPath(); ctx.moveTo(X(x0), yb);
		for (i = 0; i < sol.N; i += stepI) ctx.lineTo(X(sol.x[i]), Math.max(padT, Y(clipV(sol.V[i]))));
		ctx.lineTo(X(x1), yb); ctx.closePath();
		var gr = ctx.createLinearGradient(0, padT, 0, yb); gr.addColorStop(0, "rgba(95,111,147,0.5)"); gr.addColorStop(1, "rgba(95,111,147,0.12)"); ctx.fillStyle = gr; ctx.fill();
		if (st.type === "inf" || st.type === "lin" || st.type === "custom") { ctx.fillStyle = "rgba(95,111,147,0.55)"; ctx.fillRect(X(x0) - 6, padT, 6, yb - padT); if (st.type !== "lin") ctx.fillRect(X(x1), padT, 6, yb - padT); }
		var py;
		ctx.strokeStyle = "#8ea0c8"; ctx.lineWidth = 2; ctx.save(); ctx.beginPath(); ctx.rect(padL - 8, padT, W - padL - padR + 16, yb - padT); ctx.clip();
		ctx.beginPath(); for (i = 0; i < sol.N; i += stepI) { py = Y(clipV(sol.V[i])); if (i) ctx.lineTo(X(sol.x[i]), py); else ctx.moveTo(X(sol.x[i]), py); } ctx.stroke();
		/* levels */
		var E = sol.E, show = st.show, sel = st.sel;
		for (var n = 0; n < E.length; n++) {
			if (E[n] > top) break;
			var yE = Y(E[n]), c = COL[n % COL.length], picked = sel.indexOf(n) >= 0;
			/* room for the wave: the gap to the nearest clearly different level (a near-degenerate pair, as in the double well, shares its room) */
			var tiny = 0.03 * (top - emin), gup = Infinity, gdn = Infinity, q2;
			for (q2 = n + 1; q2 < E.length; q2++) if (E[q2] - E[n] > tiny) { gup = E[q2] - E[n]; break; }
			for (q2 = n - 1; q2 >= 0; q2--) if (E[n] - E[q2] > tiny) { gdn = E[n] - E[q2]; break; }
			var gap = Math.min(gup, gdn); if (!isFinite(gap)) gap = (top - emin) * 0.3;
			/* classically allowed range */
			var ia = -1, ib = -1; for (i = 0; i < sol.N; i++) if (sol.V[i] <= E[n]) { if (ia < 0) ia = i; ib = i; }
			if (ia < 0) { ia = 0; ib = sol.N - 1; }
			ctx.strokeStyle = c; ctx.globalAlpha = picked ? 1 : sel.length ? 0.45 : 0.8; ctx.lineWidth = picked ? 2.4 : 1.2;
			ctx.setLineDash(picked ? [] : [5, 4]); ctx.beginPath(); ctx.moveTo(X(sol.x[ia]), yE); ctx.lineTo(X(sol.x[ib]), yE); ctx.stroke(); ctx.setLineDash([]);
			if (show !== "none") {
				var v = sol.psi[n], mx = 0; for (i = 0; i < sol.N; i++) mx = Math.max(mx, show === "prob" ? v[i] * v[i] : Math.abs(v[i]));
				var A = Math.min(0.46 * Math.abs(Y(E[n]) - Y(E[n] + gap)), (H - padT - padB) * 0.18) / mx;
				ctx.beginPath();
				for (i = 0; i < sol.N; i += stepI) { var val = show === "prob" ? v[i] * v[i] : v[i]; var yy = yE - val * A; if (i) ctx.lineTo(X(sol.x[i]), yy); else ctx.moveTo(X(sol.x[i]), yy); }
				ctx.lineWidth = picked ? 2 : 1.3; ctx.stroke();
			}
			ctx.globalAlpha = 1;
		}
		ctx.restore();
		/* level labels on the right */
		ctx.font = (phone ? "10px" : "11px") + " system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; var lastY = 1e9;
		for (n = 0; n < E.length; n++) { if (E[n] > top) break; yE = Y(E[n]); if (lastY - yE < 11) continue; lastY = yE; ctx.fillStyle = COL[n % COL.length]; ctx.globalAlpha = sel.indexOf(n) >= 0 || !sel.length ? 1 : 0.6; ctx.fillText((phone ? (n + n0()) : lname(n)) + "  " + eV(E[n]).replace(" eV", phone ? "" : " eV"), W - padR + 6, yE); }
		ctx.globalAlpha = 1;
		/* custom handles */
		if (st.type === "custom") handles().forEach(function (h, k) { ctx.beginPath(); ctx.arc(h[0], h[1], 7, 0, 7); ctx.fillStyle = drag && drag.k === k ? "#fff" : "#c7d2fe"; ctx.fill(); ctx.strokeStyle = "#5b3fd6"; ctx.lineWidth = 2; ctx.stroke(); });
		/* superposition strip */
		if (amps.length) {
			var sy0 = H - strip - (phone ? 92 : 6), sh = strip - 12, base = sy0 + sh;
			ctx.fillStyle = "#0c1020"; ctx.fillRect(padL, sy0 - 4, W - padL - padR, sh + 8);
			ctx.fillStyle = "#9aa6c0"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("|Ψ(x,t)|² of the picked levels", padL + 6, sy0);
			T.superpose(sol, amps, t, re, im);
			var cols = Math.round(W - padL - padR), sxm = 0, sn = 0;
			for (i = 0; i < sol.N; i++) { var pp = re[i] * re[i] + im[i] * im[i]; sxm += pp * sol.x[i]; sn += pp; }
			var xm = sxm / sn;
			for (var cI = 0; cI < cols; cI++) {
				var xq = XI(padL + cI), j = Math.max(0, Math.min(sol.N - 1, Math.round((xq - sol.x[0]) / sol.dx))), d = (re[j] * re[j] + im[j] * im[j]) / scaleP * (sh - 14);
				if (d < 0.3) continue; var rgb = Q.phaseRGB(Math.atan2(im[j], re[j]), 1);
				ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")"; ctx.fillRect(padL + cI, base - d, 1.2, d);
			}
			ctx.strokeStyle = "rgba(148,163,184,0.4)"; ctx.beginPath(); ctx.moveTo(padL, base + 0.5); ctx.lineTo(W - padR, base + 0.5); ctx.stroke();
			/* <x> line through both panels + trail */
			var px = X(xm); trail.push(px); if (trail.length > 60) trail.shift();
			ctx.strokeStyle = "rgba(250,204,21,0.9)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, base); ctx.stroke(); ctx.setLineDash([]);
			for (var q = 0; q < trail.length; q++) { ctx.fillStyle = "rgba(250,204,21," + (0.05 + 0.6 * q / trail.length).toFixed(2) + ")"; ctx.fillRect(trail[q] - 1.5, base + 3, 3, 3); }
			ctx.fillStyle = "#facc15"; ctx.textAlign = px > W - padR - 70 ? "right" : "left"; ctx.textBaseline = "top"; ctx.fillText("⟨x⟩", px + (px > W - padR - 70 ? -4 : 4), padT + 2);
			el.r6.textContent = Math.abs(xm) < 1e-5 * (x1 - x0) ? "0 nm" : nm(xm);
		}
		if (!amps.length) { ctx.fillStyle = "#9aa6c0"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(phone ? "Tap a level to pick it" : "Click a level to pick it; pick two or more to see them move", (padL + W - padR) / 2, Math.min(H - 6, yb + 34)); }
	}
	function nice(r) { var p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
	function handles() {
		if (!lay || st.type !== "custom") return [];
		var p = P(), pts = p.pts, n = pts.length;
		return pts.map(function (v, k) { return [lay.X(well.x0 + (well.x1 - well.x0) * k / (n - 1)), lay.Y(v * p.vmax)]; });
	}

	/* ---------- readouts, table, note ---------- */
	function readouts() {
		var E = sol.E;
		el.r1.textContent = E.length ? eV(E[0]) : "none";
		el.r2.textContent = E.length > 1 ? eV(E[1] - E[0]) : "–";
		el.l3.textContent = well.bound < Infinity ? "Bound states" : "Levels shown";
		el.r3.textContent = well.bound < Infinity ? String(E.length) : "∞ (" + E.filter(function (e) { return e <= topE(); }).length + " shown)";
		el.r4.textContent = st.sel.length ? (st.type === "morse" ? "v = " : "n = ") + st.sel.slice().sort(function (a, b) { return a - b; }).map(function (n) { return n + n0(); }).join(", ") + (st.coh > 0 && st.type === "ho" ? " (coherent mix)" : "") : "none";
		el.r5.textContent = amps.length ? eV(amps.reduce(function (s, a) { return s + a.a * a.a * E[a.n]; }, 0)) : "–";
		if (!amps.length) el.r6.textContent = "–";
		el.l7.textContent = st.type === "dw" && amps.length === 2 && amps[0].n === 0 && amps[1].n === 1 ? "Tunnelling period h/ΔE" : amps.length > 1 ? "Repeats every h/ΔE" : "Phase turns every h/E";
		el.r7.textContent = amps.length ? Q.si(period() * 1e-15, "s") : "–";
		el.r8.textContent = Q.si(t * 1e-15, "s");
	}
	function table() {
		var E = sol.E, tb = el.table.tBodies[0], h = "", unitE = st.type === "ho" ? P().w : E[0];
		el.th4.textContent = st.type === "ho" ? "E / ħω" : "E / E₁";
		for (var n = 0; n < E.length; n++) {
			var on = st.sel.indexOf(n) >= 0;
			h += '<tr><td><input type="checkbox" data-n="' + n + '"' + (on ? " checked" : "") + ' aria-label="Pick level ' + (n + n0()) + '"></td><td style="color:' + "inherit" + '"><span style="display:inline-block;width:0.7em;height:0.7em;border-radius:50%;margin-right:0.4em;background:' + COL[n % COL.length] + '"></span>' + lname(n) + "</td><td>" + eV(E[n]) + "</td><td>" + Q.fmt(E[n] / unitE, 4) + "</td><td>" + (n + 1 < E.length ? eV(E[n + 1] - E[n]) : (well.bound < Infinity ? "top of the well: " + eV(well.bound) : "–")) + "</td></tr>";
		}
		tb.innerHTML = h;
	}
	function note() {
		var m = mass(), E = sol.E, p = P(), txt = (st.mass === "custom" ? "Mass " + Q.fmt(m, 3) + " mₑ" : NAMES[st.mass]) + ". ";
		if (st.type === "inf") txt += "Exact: E₁ = π²ħ²/(2mL²) = " + eV(Math.PI * Math.PI * cc() / (p.L * p.L)) + "; the levels go 1, 4, 9, 16 … times that.";
		else if (st.type === "fin") txt += "A well this size holds " + T.finCount(p.a, p.V, cc()) + " bound state" + (T.finCount(p.a, p.V, cc()) > 1 ? "s" : "") + " (formula: the integer above a·√(2mV₀)/(πħ)). Look at the walls: every wave leaks into them.";
		else if (st.type === "ho") txt += "Exact: E = (n + ½) ħω with ħω = " + eV(p.w) + ". The ground state keeps ½ħω: the zero-point energy.";
		else if (st.type === "dw" && E.length > 1) txt += "The two lowest levels are split by only ΔE = " + eV(E[1] - E[0]) + ". Picked together, the particle starts in the left well and is in the right one after half of h/ΔE = " + Q.si(T.H / (E[1] - E[0]) * 1e-15 / 2, "s") + ". Raise the middle barrier and watch the splitting (and the tunnelling) shrink exponentially.";
		else if (st.type === "morse") txt += "Morse curve V = D(1 − e^(−a(x − rₑ)))². The level gaps shrink as the bond stretches, and the levels stop at D: above it the molecule falls apart.";
		else if (st.type === "lin") txt += "Exact: Eₙ = (ħ²F²/2m)^⅓ × the zeros of the Airy function (2.338, 4.088, 5.521 …) = " + E.slice(0, 3).map(function (e) { return Q.fmt(e, 3); }).join(", ") + " eV. Neutrons bouncing on a mirror in Earth’s gravity show these levels (in pico-electronvolts).";
		else if (st.type === "custom") txt += "Drag the round handles to draw any well; the levels follow. Hard walls at both ends.";
		txt += " Grid: " + sol.N + " points.";
		el.note.textContent = txt;
		el.badge.textContent = (st.mass === "custom" ? Q.fmt(m, 3) + " mₑ" : NAMES[st.mass]) + " · x in " + ((well.x1 - well.x0) < 0.9 ? "pm" : "nm") + " · E in eV";
	}

	/* ---------- params UI ---------- */
	function paramsUI() {
		var p = P(), h = "";
		PARAMS[st.type].forEach(function (d) {
			h += '<div class="tu-field"><label class="tu-label" for="qm-bx-p-' + d[0] + '">' + d[1] + ' <span class="qm-val" id="qm-bx-pv-' + d[0] + '"></span></label><input type="range" id="qm-bx-p-' + d[0] + '" data-k="' + d[0] + '" min="0" max="1000" step="1"></div>';
		});
		el.params.innerHTML = h; syncParams();
	}
	function toSl(d, v) { return Math.round(1000 * (d[4] ? Math.log(v / d[2]) / Math.log(d[3] / d[2]) : (v - d[2]) / (d[3] - d[2]))); }
	function fromSl(d, s) { var f = s / 1000; return d[4] ? d[2] * Math.pow(d[3] / d[2], f) : d[2] + f * (d[3] - d[2]); }
	function fmtP(d, v) { return d[5] === "nm" ? nm(v) : d[5] === "eV" ? eV(v) : Q.fmt(v, 3) + " " + d[5]; }
	function syncParams() { var p = P(); PARAMS[st.type].forEach(function (d) { var s = $("qm-bx-p-" + d[0]); if (s) { s.value = toSl(d, p[d[0]]); $("qm-bx-pv-" + d[0]).textContent = fmtP(d, p[d[0]]); } }); }
	function syncInputs() {
		el.type.value = st.type; el.mass.value = st.mass; el.mcf.hidden = st.mass !== "custom"; el.mc.value = st.mc; el.show.value = st.show;
		el.sp.value = st.sp; el.spv.textContent = "×" + Q.fmt(spF(), 2);
		Array.prototype.forEach.call(el.presets.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === st.preset ? "true" : "false"); });
	}
	function refresh(keepT) { solve(); if (!keepT) t = 0; readouts(); table(); note(); draw(); clearTimeout(refresh.tm); refresh.tm = setTimeout(api.save, 250); }
	function toggle(n) {
		var i = st.sel.indexOf(n); if (i >= 0) st.sel.splice(i, 1); else st.sel.push(n);
		st.coh = 0; st.preset = null; mix(); t = 0; syncInputs(); readouts(); table(); draw(); api.save();
		if (st.sel.length >= 1 && !playing) setPlay(true);
	}
	function applyPreset(id) {
		var p = PRESETS[id]; st.type = p.type; st.mass = p.mass; st.sel = p.sel.slice(); st.coh = p.coh || 0; st.preset = id;
		st.p_ = st.p_ || {}; st.p_[p.type] = JSON.parse(JSON.stringify(DEFP[p.type]));
		syncInputs(); paramsUI(); refresh(); setPlay(true);
	}
	function linkUrl() {
		var u = new URL(location.href), p = P();
		Array.from(u.searchParams.keys()).forEach(function (k) { if (k.indexOf("bx_") === 0) u.searchParams.delete(k); });
		u.searchParams.set("tab", "box"); u.searchParams.set("bx_t", st.type); u.searchParams.set("bx_m", st.mass); if (st.mass === "custom") u.searchParams.set("bx_mc", st.mc);
		PARAMS[st.type].forEach(function (d) { u.searchParams.set("bx_" + d[0], +(+p[d[0]]).toPrecision(5)); });
		if (st.type === "custom") u.searchParams.set("bx_pts", p.pts.map(function (v) { return +v.toFixed(3); }).join("_"));
		if (st.sel.length) u.searchParams.set("bx_sel", st.sel.join("_")); if (st.coh) u.searchParams.set("bx_coh", st.coh);
		return u.toString();
	}
	function readQuery(q) {
		var tp = q.get("bx_t"); if (!tp || !PARAMS[tp]) return;
		st.type = tp; var m = q.get("bx_m"); if (MASS[m] || m === "custom") st.mass = m;
		var mc = parseFloat(q.get("bx_mc")); if (isFinite(mc)) st.mc = Q.clamp(mc, 0.01, 1e5);
		var p = P(); PARAMS[tp].forEach(function (d) { var v = parseFloat(q.get("bx_" + d[0])); if (isFinite(v)) p[d[0]] = Q.clamp(v, d[2], d[3]); });
		if (tp === "custom" && q.get("bx_pts")) { var pts = q.get("bx_pts").split("_").map(Number).filter(isFinite).map(function (v) { return Q.clamp(v, 0, 1.2); }); if (pts.length >= 3 && pts.length <= 20) p.pts = pts; }
		st.sel = (q.get("bx_sel") || "").split("_").map(Number).filter(function (n) { return isFinite(n) && n >= 0 && n < 30; });
		st.coh = Q.clamp(parseFloat(q.get("bx_coh")) || 0, 0, 3); st.preset = null;
	}

	/* ---------- animation ---------- */
	function setPlay(on) { playing = !!on; el.play.textContent = playing ? "Pause" : "Play"; el.play.setAttribute("aria-pressed", playing ? "true" : "false"); lastTs = 0; if (playing && visible && !raf) raf = requestAnimationFrame(frame); }
	function frame(ts) {
		raf = 0; if (!playing || !visible) return;
		var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
		var Pd = period(); if (Pd) t += dt * Pd / (amps.length > 1 ? 5 : 3) * spF();
		draw(); el.r8.textContent = Q.si(t * 1e-15, "s");
		raf = requestAnimationFrame(frame);
	}

	/* ---------- pointer ---------- */
	function pos(e) { var r = el.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	function hitHandle(p) { var hs = handles(), b = -1, bd = 20; hs.forEach(function (h, k) { var d = Math.hypot(h[0] - p.x, h[1] - p.y); if (d < bd) { bd = d; b = k; } }); return b; }
	function hitLevel(p) {
		if (!lay) return -1; var b = -1, bd = 10, top = topE();
		sol.E.forEach(function (E, n) { if (E > top) return; var d = Math.abs(lay.Y(E) - p.y); if (d < bd) { bd = d; b = n; } });
		return b;
	}
	function down(e) {
		var p = pos(e), k = hitHandle(p);
		if (k >= 0) { drag = { k: k, id: e.pointerId }; el.cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
		var n = hitLevel(p); if (n >= 0) toggle(n);
	}
	function move(e) {
		var p = pos(e);
		if (!drag) { el.cv.style.cursor = hitHandle(p) >= 0 ? "grab" : hitLevel(p) >= 0 ? "pointer" : "default"; return; }
		var pr = P(); pr.pts[drag.k] = Q.clamp(+(lay.YI(p.y) / pr.vmax).toFixed(3), 0, 1.2); st.preset = null; refresh(true);
	}
	function up(e) { if (drag && e.pointerId === drag.id) { drag = null; api.save(); draw(); } }

	Q.reg("box", {
		init: function (panel, a) {
			api = a; st = api.st;
			if (!st.type || !PARAMS[st.type]) st.type = "dw";
			if (!st.mass) st.mass = "electron"; if (!st.mc) st.mc = 1; if (!st.show) st.show = "psi"; if (st.sp == null) st.sp = 50; if (!st.sel) st.sel = [0, 1]; if (st.coh == null) st.coh = 0;
			if (st.preset === undefined) st.preset = "dw";
			readQuery(api.query);
			["wrap", "stage", "cv", "badge", "play", "clear", "show", "fs", "type", "mass", "mcf", "mc", "params", "sp", "spv", "link", "note", "table", "th4", "presets",
				"r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "l3", "l7"].forEach(function (k) { el[k] = $("qm-bx-" + k); });
			el.presets.addEventListener("click", function (e) { var b = e.target.closest("button[data-p]"); if (b) applyPreset(b.dataset.p); });
			el.play.addEventListener("click", function () { setPlay(!playing); });
			el.clear.addEventListener("click", function () { st.sel = []; st.coh = 0; st.preset = null; mix(); t = 0; syncInputs(); readouts(); table(); draw(); api.save(); });
			el.show.addEventListener("change", function () { st.show = el.show.value; api.save(); draw(); });
			el.fs.addEventListener("click", function () { if (document.fullscreenElement === el.wrap) document.exitFullscreen(); else if (el.wrap.requestFullscreen) el.wrap.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); });
			el.type.addEventListener("change", function () { st.type = el.type.value; st.preset = null; st.coh = 0; st.sel = [0, 1]; syncInputs(); paramsUI(); refresh(); });
			el.mass.addEventListener("change", function () { st.mass = el.mass.value; st.preset = null; syncInputs(); refresh(); });
			el.mc.addEventListener("change", function () { st.mc = Q.clamp(+el.mc.value || 1, 0.01, 1e5); syncInputs(); refresh(); });
			el.params.addEventListener("input", function (e) { var k = e.target.dataset.k; if (!k) return; var d = PARAMS[st.type].filter(function (x) { return x[0] === k; })[0]; P()[k] = +fromSl(d, +e.target.value).toPrecision(5); st.preset = null; syncParams(); syncInputs(); refresh(true); });
			el.sp.addEventListener("input", function () { st.sp = +el.sp.value; syncInputs(); api.save(); });
			el.link.addEventListener("click", function () { api.copy(linkUrl(), "Link copied"); });
			el.table.addEventListener("change", function (e) { var n = e.target.dataset && e.target.dataset.n; if (n != null) toggle(+n); });
			el.cv.addEventListener("pointerdown", down); el.cv.addEventListener("pointermove", move); el.cv.addEventListener("pointerup", up); el.cv.addEventListener("pointercancel", up);
			el.cv.addEventListener("touchstart", function (e) { var tt = e.touches[0]; if (tt && st.type === "custom") { var r = el.cv.getBoundingClientRect(); if (hitHandle({ x: tt.clientX - r.left, y: tt.clientY - r.top }) >= 0) e.preventDefault(); } }, { passive: false });
			el.cv.addEventListener("keydown", function (e) { if (e.key === " ") { e.preventDefault(); setPlay(!playing); } else if (/^[0-9]$/.test(e.key)) { var n = (+e.key + 9) % 10; if (n < sol.E.length) toggle(n); } });
			if (window.ResizeObserver) new ResizeObserver(function () { if (visible) draw(); }).observe(el.stage);
			window.addEventListener("resize", function () { if (visible) draw(); });
			document.addEventListener("fullscreenchange", function () { if (visible) setTimeout(draw, 60); });
			syncInputs(); paramsUI(); solve(); readouts(); table(); note();
			window.MESQuantumDebug_box = { get sol() { return sol; }, st: st, preset: applyPreset, toggle: toggle, handles: handles, lay: function () { return lay; }, setT: function (x) { t = x; draw(); readouts(); }, period: period, draw: draw };
		},
		show: function () { visible = true; draw(); readouts(); if (playing && !raf) raf = requestAnimationFrame(frame); },
		hide: function () { visible = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
	});
})();
