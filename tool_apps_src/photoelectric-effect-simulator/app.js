/* MES Photoelectric Effect Simulator -- UI + canvas animation (physics in lib.js, global MESPhoto). State: localStorage "mes-photoelectric-effect-simulator:v1"; links ?m=&wl=&i=&v= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pe"); if (!root) return;
	var P = window.MESPhoto, KEY = "mes-photoelectric-effect-simulator:v1";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function sci(x, d) { if (x === 0) return "0"; var e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e); return m.toFixed(d == null ? 3 : d) + " × 10" + String(e).split("").map(function (c) { return { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }[c]; }).join(""); }
	var q = new URLSearchParams(location.search), saved = sget(), fromLink = !!q.get("m");
	function pnum(k, d, lo, hi) { var x = parseFloat(fromLink ? q.get(k) : saved[k]); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; }
	var S = { m: (fromLink ? q.get("m") : saved.m) && P.MBY[fromLink ? q.get("m") : saved.m] ? (fromLink ? q.get("m") : saved.m) : "cs", wl: pnum("wl", 400, 100, 800), i: pnum("i", 60, 0, 100), v: pnum("v", 0, -12, 6) };
	var rec = Array.isArray(saved.rec) ? saved.rec.filter(function (r) { return r && isFinite(r[0]) && isFinite(r[1]); }).slice(0, 30) : [];
	var paused = false, photons = [], electrons = [], flashes = [], collected = 0, emitted = 0, lastT = 0, spawnAcc = 0;

	$("pe-metal").innerHTML = P.METALS.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + " — φ = " + m.phi.toFixed(2) + " eV</option>"; }).join("");
	function metal() { return P.MBY[S.m]; }
	function derived() {
		var phi = metal().phi, E = P.energyFromWavelength(S.wl), ke = Math.max(0, E - phi), th = P.threshold(phi);
		return { phi: phi, E: E, ke: ke, f: P.freqFromWavelength(S.wl), th: th, v0: ke, emit: E >= phi };
	}
	function sync() {
		$("pe-metal").value = S.m; $("pe-wl").value = S.wl; $("pe-int").value = S.i; $("pe-v").value = S.v;
		$("pe-wl-v").textContent = Math.round(S.wl) + " nm" + (S.wl < 380 ? " (ultraviolet)" : S.wl > 780 ? " (infrared)" : ""); $("pe-int-v").textContent = Math.round(S.i) + "%"; $("pe-v-v").textContent = (S.v > 0 ? "+" : "") + S.v.toFixed(2) + " V";
		var d = derived();
		$("pe-phi-note").textContent = "Work function φ = " + d.phi.toFixed(2) + " eV (threshold " + Math.round(d.th.nm) + " nm).";
		$("pe-e").textContent = d.E.toFixed(3) + " eV"; $("pe-e-s").textContent = "= " + sci(d.E * P.E, 3) + " J · f = " + sci(d.f, 3) + " Hz";
		$("pe-ke").textContent = d.emit ? d.ke.toFixed(3) + " eV" : "none"; $("pe-ke-s").textContent = d.emit ? "= " + sci(d.ke * P.E, 3) + " J · speed up to " + sci(P.speed(d.ke), 3) + " m/s" : "photon energy is below φ";
		$("pe-vs").textContent = d.emit ? "−" + d.v0.toFixed(3) + " V" : "–"; $("pe-vs-s").textContent = d.emit ? "stops every electron: V₀ = KE / e" : "no electrons to stop";
		$("pe-th").textContent = Math.round(d.th.nm) + " nm"; $("pe-th-s").textContent = "f₀ = " + sci(d.th.f, 3) + " Hz";
		var frac = d.emit ? P.iv(S.v, d.v0) * S.i / 100 : 0;
		$("pe-i").textContent = d.emit && S.i > 0 ? (frac * 10).toFixed(2) + " µA" : "0"; $("pe-i-s").textContent = !d.emit ? "light too weak in energy" : S.i === 0 ? "no light" : S.v <= -d.v0 ? "turned back by the voltage" : "illustrative scale";
		var vd = $("pe-verdict");
		vd.textContent = !d.emit ? "Each photon carries only " + d.E.toFixed(2) + " eV, less than the " + d.phi.toFixed(2) + " eV needed: no electrons come out, however bright the light."
			: S.i === 0 ? "No light: nothing to knock electrons out."
			: S.v <= -d.v0 - 1e-9 ? "Electrons leave with up to " + d.ke.toFixed(2) + " eV, but the " + S.v.toFixed(2) + " V collector turns them all back: current is zero."
			: "Electrons leave with up to " + d.ke.toFixed(2) + " eV (stopping voltage −" + d.v0.toFixed(2) + " V).";
		drawGraphs(); sset({ m: S.m, wl: S.wl, i: S.i, v: S.v, rec: rec });
	}

	/* ---------- apparatus animation ---------- */
	var cv = $("pe-canvas"), cx = cv.getContext("2d"), W = 0, H = 0, dpr = 1, KS = 200;
	function size() { var r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
	function geo() { var g = { tx0: W * 0.06, tx1: W * 0.9, ty0: H * 0.1, ty1: H * 0.7, ex: W * 0.2, cxp: W * 0.76, py0: H * 0.18, py1: H * 0.62 }; g.D = g.cxp - g.ex; return g; }
	function spawnPhoton(g, d) {
		var ty = g.py0 + Math.random() * (g.py1 - g.py0), sx = W * (0.02 + Math.random() * 0.06);
		var dx = g.ex - sx, dy = ty - g.ty0 * 0.2, len = Math.hypot(dx, dy);
		photons.push({ x: sx, y: g.ty0 * 0.2, ux: dx / len, uy: dy / len, ty: ty, ph: Math.random() * 6.28 });
	}
	function step(dt) {
		var g = geo(), d = derived(), sp = 420;
		spawnAcc += dt * S.i / 100 * 16; while (spawnAcc >= 1) { spawnAcc -= 1; if (photons.length < 80) spawnPhoton(g, d); }
		for (var i = photons.length - 1; i >= 0; i--) {
			var p = photons[i]; p.x += p.ux * sp * dt; p.y += p.uy * sp * dt;
			if (p.x >= g.ex + 6) {
				photons.splice(i, 1);
				if (d.emit && electrons.length < 220) {
					var ke = d.ke * (0.2 + 0.8 * Math.pow(Math.random(), 0.5)), th = (Math.random() - 0.5) * 2.4, v = Math.sqrt(2 * ke) * KS + 14;
					electrons.push({ x: g.ex + 8, y: p.y, vx: Math.max(6, v * Math.cos(th)), vy: v * Math.sin(th), age: 0 }); emitted++;
				}
				flashes.push({ x: g.ex + 4, y: p.y, t: 0.25 });
			}
		}
		for (i = electrons.length - 1; i >= 0; i--) {
			var e = electrons[i]; e.age += dt; e.vx += KS * KS * S.v / g.D * dt; e.x += e.vx * dt; e.y += e.vy * dt;
			if (e.x >= g.cxp - 3) { electrons.splice(i, 1); collected++; flashes.push({ x: g.cxp - 3, y: e.y, t: 0.2, c: 1 }); }
			else if (e.x <= g.ex + 4 || e.y < g.ty0 + 4 || e.y > g.ty1 - 4) { electrons.splice(i, 1); }
		}
		for (i = flashes.length - 1; i >= 0; i--) { flashes[i].t -= dt; if (flashes[i].t <= 0) flashes.splice(i, 1); }
	}
	function draw() {
		var g = geo(), d = derived(), m = metal(), c = cx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
		var bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0a0c1c"); bg.addColorStop(1, "#141838"); c.fillStyle = bg; c.fillRect(0, 0, W, H);
		var col = P.wlColor(S.wl);
		/* lamp + beam */
		c.fillStyle = "#3a4056"; c.fillRect(W * 0.01, g.ty0 * 0.05, W * 0.09, g.ty0 * 0.3);
		if (S.i > 0) { var gr = c.createLinearGradient(W * 0.05, g.ty0 * 0.3, g.ex, g.py0 + (g.py1 - g.py0) / 2); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); c.globalAlpha = 0.1 + 0.2 * S.i / 100; c.fillStyle = gr; c.beginPath(); c.moveTo(W * 0.02, g.ty0 * 0.3); c.lineTo(W * 0.1, g.ty0 * 0.3); c.lineTo(g.ex, g.py1); c.lineTo(g.ex, g.py0); c.closePath(); c.fill(); c.globalAlpha = 1; }
		/* tube */
		c.strokeStyle = "rgba(180,200,240,0.55)"; c.lineWidth = 3; c.beginPath(); c.roundRect ? c.roundRect(g.tx0, g.ty0, g.tx1 - g.tx0, g.ty1 - g.ty0, 26) : c.rect(g.tx0, g.ty0, g.tx1 - g.tx0, g.ty1 - g.ty0); c.stroke();
		c.fillStyle = "rgba(120,150,220,0.06)"; c.fill();
		/* plates */
		c.fillStyle = m.color; c.fillRect(g.ex - 10, g.py0, 14, g.py1 - g.py0); c.fillStyle = "#9aa2b4"; c.fillRect(g.cxp, g.py0, 12, g.py1 - g.py0);
		c.fillStyle = "#e8ecf5"; c.font = "600 " + Math.max(11, W * 0.015) + "px system-ui,sans-serif"; c.textAlign = "left"; c.fillText(m.name.replace(/ \(.*\)/, ""), g.ex + 8, g.py1 + 18); c.textAlign = "right"; c.fillText("collector", g.cxp - 2, g.py1 + 18); c.textAlign = "center";
		/* photons */
		c.lineWidth = 2.4; c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 8;
		photons.forEach(function (p) { c.beginPath(); for (var k = 0; k <= 10; k++) { var t = k / 10, px = p.x - p.ux * 22 * (1 - t) + (-p.uy) * Math.sin(t * 12 + p.ph) * 3, py = p.y - p.uy * 22 * (1 - t) + p.ux * Math.sin(t * 12 + p.ph) * 3; k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); });
		c.shadowBlur = 0;
		/* electrons */
		electrons.forEach(function (e) { c.fillStyle = "#5ac8ff"; c.strokeStyle = "#fff"; c.lineWidth = 1; c.beginPath(); c.arc(e.x, e.y, 4, 0, 6.2832); c.fill(); c.stroke(); });
		flashes.forEach(function (f) { c.fillStyle = f.c ? "rgba(90,200,255," + f.t * 3 + ")" : "rgba(255,255,255," + f.t * 3 + ")"; c.beginPath(); c.arc(f.x, f.y, 7 * (1.2 - f.t * 2), 0, 6.2832); c.fill(); });
		/* circuit: wires, battery, ammeter */
		var wy = H * 0.86; c.strokeStyle = "#8a93a6"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(g.ex - 3, g.py1); c.lineTo(g.ex - 3, wy); c.lineTo((g.ex + g.cxp) / 2 - 70, wy); c.moveTo((g.ex + g.cxp) / 2 + 70, wy); c.lineTo(g.cxp + 6, wy); c.lineTo(g.cxp + 6, g.py1); c.stroke();
		var bx = (g.ex + g.cxp) / 2; c.fillStyle = "#0a0c1c"; c.strokeStyle = "#e8ecf5"; c.lineWidth = 2;
		c.fillStyle = "#e8ecf5"; c.fillRect(bx - 70, wy - 2, 140, 4);
		c.fillStyle = "#0a0c1c"; c.fillRect(bx - 50, wy - 22, 100, 44); c.strokeStyle = "#e8ecf5"; c.strokeRect(bx - 50, wy - 22, 100, 44);
		c.fillStyle = S.v >= 0 ? "#8ee0a0" : "#ffa0a0"; c.font = "700 " + Math.max(13, W * 0.019) + "px system-ui,sans-serif"; c.textAlign = "center"; c.fillText((S.v > 0 ? "+" : "") + S.v.toFixed(2) + " V", bx, wy + 6);
		c.font = "11px system-ui,sans-serif"; c.fillStyle = "#9aa5bb"; c.fillText(S.v >= 0 ? "collector positive" : "collector negative", bx, wy + 38);
		/* ammeter sits on the collector's wire, between the tube and the battery row, so it always fits (a side position ran off the canvas on phones) */
		var ax = g.cxp + 6, ay = (g.py1 + wy) / 2, ar = Math.max(22, Math.min(30, (wy - g.py1) * 0.38)); c.beginPath(); c.fillStyle = "#0f1226"; c.strokeStyle = "#e8ecf5"; c.lineWidth = 2; c.arc(ax, ay, ar, 0, 6.2832); c.fill(); c.stroke();
		var frac = d.emit ? P.iv(S.v, d.v0) * S.i / 100 : 0; c.fillStyle = "#e8ecf5"; c.font = "700 13px system-ui,sans-serif"; c.fillText("A", ax, ay - 6); c.font = "11px system-ui,sans-serif"; c.fillText((frac * 10).toFixed(1) + " µA", ax, ay + 11);
	}
	function frame(t) {
		requestAnimationFrame(frame); var dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t; if (!W) return;
		if (!paused && !document.hidden) step(dt); draw();
	}

	/* ---------- graphs ---------- */
	function axes(g, w, h, x0, x1, y0, y1, xl, yl, xt, yt, dark) {
		var L = 52, R = 14, T = 14, B = 40, px = function (x) { return L + (x - x0) / (x1 - x0) * (w - L - R); }, py = function (y) { return h - B - (y - y0) / (y1 - y0) * (h - T - B); };
		var fg = dark ? "#cfd6e2" : "#4b5563", grid = dark ? "#343a46" : "#e3e7ec";
		g.fillStyle = dark ? "#1c1f26" : "#fff"; g.fillRect(0, 0, w, h); g.font = "12px system-ui,sans-serif"; g.lineWidth = 1;
		xt.forEach(function (t) { var x = px(t[0]); g.strokeStyle = grid; g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke(); g.fillStyle = fg; g.textAlign = "center"; g.fillText(t[1], x, h - B + 15); });
		yt.forEach(function (t) { var y = py(t[0]); g.strokeStyle = grid; g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillStyle = fg; g.textAlign = "right"; g.fillText(t[1], L - 6, y + 4); });
		g.strokeStyle = fg; g.lineWidth = 1.5; var zx = px(Math.max(x0, Math.min(x1, 0))), zy = py(Math.max(y0, Math.min(y1, 0))); g.beginPath(); g.moveTo(L, zy); g.lineTo(w - R, zy); g.moveTo(zx, T); g.lineTo(zx, h - B); g.stroke();
		g.fillStyle = fg; g.textAlign = "center"; g.font = "600 12px system-ui,sans-serif"; g.fillText(xl, (L + w - R) / 2, h - 6); g.save(); g.translate(13, (T + h - B) / 2); g.rotate(-Math.PI / 2); g.fillText(yl, 0, 0); g.restore();
		return { px: px, py: py };
	}
	function ticks(lo, hi, n, f) { var step = (hi - lo) / n, out = [], v; var nice = Math.pow(10, Math.floor(Math.log10(step))), k = step / nice; k = k < 1.5 ? 1 : k < 3.5 ? 2 : k < 7.5 ? 5 : 10; step = k * nice; for (v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push([v, f ? f(v) : String(Math.round(v * 100) / 100)]); return out; }
	function drawGraphs() {
		var dark = document.body.classList.contains("dark-mode"), acc = getComputedStyle(root).getPropertyValue("--accent").trim() || "#7c3aed", d = derived(), fg = dark ? "#cfd6e2" : "#4b5563";
		var c1 = $("pe-g1"), g = c1.getContext("2d"), w = c1.width, h = c1.height, v0 = d.emit ? d.v0 : 0, xmin = -Math.max(3, Math.ceil(v0 + 1)), xmax = 6;
		var A = axes(g, w, h, xmin, xmax, 0, 1.08, "Collector voltage (V)", "Photocurrent (relative to full light)", ticks(xmin, xmax, 6), [[0, "0"], [0.5, "0.5"], [1, "1"]], dark);
		function curve(inten, style, dash) { g.strokeStyle = style; g.lineWidth = dash ? 1.5 : 3; g.setLineDash(dash ? [5, 4] : []); g.beginPath(); for (var k = 0; k <= 160; k++) { var V = xmin + (xmax - xmin) * k / 160, y = d.emit ? P.iv(V, d.v0) * inten : 0; k ? g.lineTo(A.px(V), A.py(y)) : g.moveTo(A.px(V), A.py(y)); } g.stroke(); g.setLineDash([]); }
		curve(1, dark ? "#6b7280" : "#b6bcc8", true); curve(S.i / 100, acc, false);
		if (d.emit) { g.strokeStyle = "#e11d48"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(A.px(-v0), A.py(0)); g.lineTo(A.px(-v0), A.py(1.08)); g.stroke(); g.setLineDash([]); g.fillStyle = "#e11d48"; g.textAlign = "left"; g.font = "600 12px system-ui,sans-serif"; g.fillText("−V₀ = −" + v0.toFixed(2) + " V", A.px(-v0) + 5, A.py(1.0)); }
		var yy = d.emit ? P.iv(S.v, d.v0) * S.i / 100 : 0; g.fillStyle = acc; g.strokeStyle = dark ? "#fff" : "#000"; g.lineWidth = 1.5; g.beginPath(); g.arc(A.px(S.v), A.py(yy), 6, 0, 6.2832); g.fill(); g.stroke();
		var c2 = $("pe-g2"), g2 = c2.getContext("2d"), w2 = c2.width, h2 = c2.height, fmax = 32, ymin = -6.5, ymax = 13;
		var B = axes(g2, w2, h2, 0, fmax, ymin, ymax, "Frequency (10¹⁴ Hz)", "Max kinetic energy (eV)", ticks(0, fmax, 8), ticks(ymin, ymax, 6), dark);
		var slope = P.H / P.E * 1e14; // eV per 1e14 Hz
		g2.lineWidth = 3; g2.strokeStyle = acc; var f0 = d.phi / slope; g2.beginPath(); g2.moveTo(B.px(f0), B.py(0)); g2.lineTo(B.px(fmax), B.py(slope * fmax - d.phi)); g2.stroke();
		g2.setLineDash([5, 4]); g2.strokeStyle = dark ? "#8a93a6" : "#9aa2b4"; g2.beginPath(); g2.moveTo(B.px(0), B.py(-d.phi)); g2.lineTo(B.px(f0), B.py(0)); g2.stroke(); g2.setLineDash([]);
		g2.fillStyle = fg; g2.font = "600 12px system-ui,sans-serif"; g2.textAlign = "left"; g2.fillText("−φ = −" + d.phi.toFixed(2) + " eV", B.px(0) + 6, B.py(-d.phi) - 6); g2.fillStyle = "#e11d48"; g2.fillText("f₀ = " + (f0).toFixed(1), B.px(f0) + 5, B.py(0) - 6);
		rec.forEach(function (r) { if (r[2] !== S.m) return; g2.fillStyle = dark ? "#fbbf24" : "#d97706"; g2.beginPath(); g2.arc(B.px(r[0] / 1e14), B.py(r[1]), 5, 0, 6.2832); g2.fill(); });
		var f = d.f / 1e14, ke = d.emit ? d.ke : 0; g2.fillStyle = acc; g2.strokeStyle = dark ? "#fff" : "#000"; g2.lineWidth = 1.5; g2.beginPath(); g2.arc(B.px(Math.min(fmax, f)), B.py(d.emit ? ke : Math.max(ymin, slope * f - d.phi)), 6, 0, 6.2832); g2.fill(); g2.stroke();
	}

	/* ---------- measure h ---------- */
	function gauss() { var u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
	function addPoint(nm) {
		var d = P.ke(nm, metal().phi); if (d <= 0) return false; var v0 = d + ($("pe-noise").checked ? 0.03 * gauss() : 0);
		rec.push([P.freqFromWavelength(nm), Math.max(0, v0), S.m, nm]); return true;
	}
	function paintLab() {
		var mine = rec.filter(function (r) { return r[2] === S.m; }).sort(function (a, b) { return b[3] - a[3]; });
		$("pe-table").querySelector("tbody").innerHTML = mine.length ? mine.map(function (r) { return "<tr><td>" + Math.round(r[3]) + "</td><td>" + (r[0] / 1e14).toFixed(2) + "</td><td>" + r[1].toFixed(3) + "</td></tr>"; }).join("") : '<tr><td colspan="3" class="tu-note">Nothing recorded for this metal yet.</td></tr>';
		var f = P.fit(mine.map(function (r) { return [r[0], r[1]]; })), box = $("pe-fit");
		if (!f || mine.length < 2) box.innerHTML = '<div class="tu-note">Record at least two points above the threshold.</div>';
		else { var h = f.a * P.E, phi = -f.b; box.innerHTML = "Planck's constant<br><b>h ≈ " + sci(h, 3) + " J·s</b><br><span class=\"tu-note\">accepted value " + sci(P.H, 3) + " (" + (100 * (h - P.H) / P.H).toFixed(1) + "% off)</span><br>Work function<br><b>φ ≈ " + phi.toFixed(2) + " eV</b><br><span class=\"tu-note\">" + esc(metal().name) + " is " + metal().phi.toFixed(2) + " eV · fit R² = " + f.r2.toFixed(4) + "</span>"; }
		drawGraphs(); sset({ m: S.m, wl: S.wl, i: S.i, v: S.v, rec: rec });
	}
	$("pe-rec").onclick = function () { if (!addPoint(S.wl)) { toast("Below the threshold: no electrons, nothing to record"); return; } paintLab(); };
	$("pe-recall").onclick = function () { var th = P.threshold(metal().phi).nm, lo = 230, hi = th * 0.93; if (hi <= lo) { toast("Threshold is too short for five colours"); return; } rec = rec.filter(function (r) { return r[2] !== S.m; }); for (var k = 0; k < 5; k++) addPoint(Math.round(hi - (hi - lo) * k / 4)); paintLab(); };
	$("pe-clear").onclick = function () { rec = []; paintLab(); };

	/* ---------- wiring ---------- */
	root.addEventListener("input", function (e) {
		if (e.target.id === "pe-wl") S.wl = +e.target.value; else if (e.target.id === "pe-int") S.i = +e.target.value; else if (e.target.id === "pe-v") S.v = +e.target.value; else return; sync();
	});
	$("pe-metal").onchange = function () { S.m = this.value; sync(); paintLab(); };
	root.addEventListener("click", function (e) {
		var b = e.target.closest("[data-try]"); if (!b) return; var d = derived(), t = b.dataset.try;
		if (t === "below") S.wl = Math.min(800, Math.round(d.th.nm + 60)); else if (t === "above") S.wl = Math.round(d.th.nm - 30); else if (t === "bright") S.i = Math.min(100, S.i * 2 || 40); else if (t === "uv") S.wl = 250; else if (t === "stop") { if (S.wl > d.th.nm) S.wl = Math.round(d.th.nm - 120); S.v = -Math.round(derived().v0 * 20) / 20; }
		sync();
	});
	$("pe-pause").onclick = function () { paused = !paused; this.setAttribute("aria-pressed", String(paused)); this.textContent = paused ? "▶" : "❚❚"; };
	$("pe-full").onclick = function () { var w = $("pe-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () {}); };
	document.addEventListener("fullscreenchange", function () { setTimeout(size, 60); });
	var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(size, 80); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(size, 60); }).observe($("pe-stage"));
	var tt; function toast(msg) { var t = $("pe-toast"); if (!t) { t = document.createElement("div"); t.id = "pe-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	new MutationObserver(drawGraphs).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	size(); sync(); paintLab(); requestAnimationFrame(frame);
	if (fromLink) history.replaceState(null, "", location.pathname);
})();
