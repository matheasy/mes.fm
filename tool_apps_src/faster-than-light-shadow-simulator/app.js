/* MES Faster-Than-Light Shadow Simulator -- mes.fm/faster-than-light-shadow-simulator
 * UI around MESFTL (lib.js: spot-speed formula, arrival-time history, parsers). Four tabs: Sweep a light beam, Move a shadow, Can it carry a message? (space-time diagram), Calculator.
 * The picture is physical: each pixel asks "which ray passes here now?" (it left the torch r light-units ago) and looks that ray's aim up in a history buffer, so a swung beam curves like a hose jet.
 * State: localStorage mes-faster-than-light-shadow-simulator:v1; share links ?tab=&D=&k=&A=&kf=&d=&s= and (calculator) ?tab=calc&kD=&kw=&kd=&kf=.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("ftl");
	if (!root) return;
	var F = window.MESFTL, C = F.C;
	var KEY = "mes-faster-than-light-shadow-simulator:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }
	var rad = function (d) { return d * Math.PI / 180; };
	var saved = sget(), q = new URLSearchParams(location.search);
	var TABS = ["sweep", "shadow", "msg", "calc"];
	var COL = { bg: "#070d1f", line: "#26325a", text: "#e6ecfb", dim: "#93a1c4", gold: "#fbbf24", cyan: "#22d3ee", orange: "#fb923c", green: "#4ade80", steel: "#cbd5e1" };
	var H = 1 / 240;   // history step, in light-crossing times

	/* ---------------- state ---------------- */
	function pick(k, key, fallback) { var a = num(q.get(k)); if (a != null) return a; var b = num(saved[key || k]); return b != null ? b : fallback; }
	var dq = q.get("D") || saved.Dtxt || "384,400 km", Dm = F.parseLen(dq);
	var S = {
		tab: TABS.indexOf(q.get("tab")) >= 0 ? q.get("tab") : (TABS.indexOf(saved.tab) >= 0 ? saved.tab : "sweep"),
		Dtxt: Dm ? dq : "384,400 km", D: Dm || 384400e3,
		kv: clamp(pick("k", "kv", 560), 0, 1000), A: clamp(pick("A", "A", 25), 5, 40), kfv: clamp(pick("kf", "kfv", 560), 0, 1000), d: clamp(pick("d", "d", 25), 2, 90), sv: clamp(pick("s", "sv", 300), 0, 1000),
		cross: clamp(num(saved.cross) || 3, 1, 10), aim: false, sman: false, slide: false, run: true,
		bw: clamp(pick("bw", "bw", 1.7), 1, 10), sz: clamp(pick("sz", "sz", 10), 3, 45),
		k: { D: q.get("kD") || saved.kD || "384,400 km", w: q.get("kw") || saved.kw || "90 deg/s", d: q.get("kd") || saved.kd || "1 m", f: q.get("kf2") || saved.kf2 || "1 m/s" }
	};
	function save() { sset({ tab: S.tab, Dtxt: S.Dtxt, kv: S.kv, A: S.A, kfv: S.kfv, d: S.d, sv: S.sv, bw: S.bw, sz: S.sz, cross: S.cross, kD: S.k.D, kw: S.k.w, kd: S.k.d, kf2: S.k.f }); }
	function logk(v) { return 0.05 * Math.pow(600, v / 1000); }              // slider -> multiple of the speed that matches light
	function logs(v) { return 1.05 * Math.pow(1000 / 1.05, v / 1000); }
	function kS() { return logk(S.kv); } function kfS() { return logk(S.kfv); } function sS() { return logs(S.sv); }
	function multTxt(k) { return (k >= 10 ? k.toFixed(0) : k >= 1 ? k.toFixed(1) : k.toFixed(2)) + "×"; }

	/* ---------------- helpers ---------------- */
	var toastT;
	function toast(msg) { var t = $("ftl-toast"); if (!t) { t = document.createElement("div"); t.id = "ftl-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copy(text, ok) { function fb() { prompt("Copy this:", text); } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(ok || "Copied"); }, fb); else fb(); }
	function setup(canvas, w, h) { var dpr = Math.min(window.devicePixelRatio || 1, 2), c = canvas.getContext("2d"); if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); } c.setTransform(dpr, 0, 0, dpr, 0, 0); return c; }
	function text(c, txt, x, y, col, size, align, bold) { c.fillStyle = col || COL.text; c.font = (bold ? "700 " : "") + (size || 12) + "px system-ui,-apple-system,Segoe UI,Roboto,sans-serif"; c.textAlign = align || "left"; c.textBaseline = "middle"; c.fillText(txt, x, y); }
	function toggleFull(id) { var w = $(id); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); }
	function fmtMult(v) { var a = Math.abs(v); return (a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)) + " c"; }
	function ro(label, val, sub, cls) { return '<div class="ftl-ro"><span>' + esc(label) + '</span><b' + (cls ? ' class="' + cls + '"' : "") + ">" + val + "</b><small>" + (sub || "") + "</small></div>"; }
	function setHTML(el, html, key) { if (el._k !== key) { el.innerHTML = html; el._k = key; } }

	/* ---------------- simulation ---------------- */
	var sim, T0 = 1;
	function newSim() {
		T0 = S.D / C;
		sim = { t: 0, hist: new F.Hist(H, 1800), val: 0, dir: 1, target: 0, max: 0, trail: [], chart: [], rate: 0 };
		sim.hist.push(0); dirty = true;
	}
	function advance() {
		if (S.tab === "sweep") {
			var A = rad(S.A);
			if (S.aim) sim.val += (sim.target - sim.val) * (1 - Math.exp(-H / 0.015));
			else { sim.val += sim.dir * kS() * H; if (sim.val > A) { sim.val = 2 * A - sim.val; sim.dir = -1; } else if (sim.val < -A) { sim.val = -2 * A - sim.val; sim.dir = 1; } }
		} else {
			var d = S.d / 100, Y = d * Math.tan(rad(32));
			if (S.sman) sim.val += (sim.target - sim.val) * (1 - Math.exp(-H / 0.015));
			else { sim.val += sim.dir * kfS() * d * H; if (sim.val > Y) { sim.val = 2 * Y - sim.val; sim.dir = -1; } else if (sim.val < -Y) { sim.val = -2 * Y - sim.val; sim.dir = 1; } }
		}
		var prev = sim.hist.get(sim.hist.k - 1); sim.hist.push(sim.val); sim.rate = Math.abs(sim.val - prev) / H;
	}
	function stepTo(t) { var n = 0; while (sim.hist.k * H <= t && n++ < 400) advance(); }
	function mySpots() { return S.tab === "sweep" ? F.spots(sim.hist, sim.t, 1, null, 1.25) : F.spots(sim.hist, sim.t, 1 - S.d / 100, function (y) { return Math.atan(y / (S.d / 100)); }, 1.25); }

	/* ---------------- layout + field rendering ---------------- */
	var lay = { key: "" }, off, offc, img;
	function layout(canvas, stage, Yr) {
		var w = stage.clientWidth || 640, h = clamp(w * (2 * Yr) / 1.28, 280, w < 640 ? 460 : 620);
		stage.style.height = Math.round(h) + "px";
		var key = [w, Math.round(h), Yr.toFixed(3), S.tab].join("|");
		if (key === lay.key) return lay;
		var sc = Math.min(w / 1.28, h / (2 * Yr)), ox = (w - 1.28 * sc) / 2 + 0.14 * sc;
		var gw = Math.min(w < 500 ? 150 : 210, GWMAX), cell = 1.28 / gw, gh = Math.ceil(2 * Yr / cell);
		lay = { key: key, w: w, h: h, sc: sc, ox: ox, Yr: Yr, gw: gw, gh: gh, cell: cell };
		var n = gw * gh; lay.r = new Float32Array(n); lay.phi = new Float32Array(n); lay.x = new Float32Array(n); lay.sec = new Float32Array(n);
		for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
			var x = -0.14 + (i + 0.5) * cell, y = Yr - (j + 0.5) * cell, k = j * gw + i;
			lay.x[k] = x; lay.r[k] = Math.hypot(x, y); lay.phi[k] = Math.atan2(y, x); lay.sec[k] = 1 / Math.max(Math.cos(lay.phi[k]), 0.05);
		}
		off = document.createElement("canvas"); off.width = gw; off.height = gh; offc = off.getContext("2d"); img = offc.createImageData(gw, gh);
		return lay;
	}
	var sx = function (x) { return lay.ox + x * lay.sc; }, sy = function (y) { return lay.h / 2 - y * lay.sc; };
	var FAN = 0.82, BW = 0.03, GWMAX = 210, slowN = 0;
	function light(x, r, phi, sec, t, hist) {          // 0..1 brightness of the light passing (x, y) at time t
		if (x < 0 || x > 1.0005) return 0;
		if (S.tab === "sweep") { var dd = (phi - hist.at(t - r)) / BW; return dd > 3 || dd < -3 ? 0 : Math.exp(-dd * dd); }
		if (phi > FAN || phi < -FAN) return 0;
		var d = S.d / 100;
		if (x <= d) return 0.55;
		var yf = hist.at(t - r + d * sec), dist = Math.abs(d * Math.tan(phi) - yf) - d * S.sz / 100;
		return 0.55 * clamp(0.5 + dist / (0.02 * d), 0, 1);
	}
	function paintField(c) {
		BW = rad(S.bw) * 1.75; var t0 = performance.now();
		var a = img.data, n = lay.gw * lay.gh, hist = sim.hist, t = sim.t, k, v, p = 0;
		var br = S.tab === "sweep" ? 255 : 255, bg = [7, 13, 31];
		for (k = 0; k < n; k++, p += 4) {
			v = light(lay.x[k], lay.r[k], lay.phi[k], lay.sec[k], t, hist);
			if (S.tab === "sweep") { a[p] = bg[0] + (251 - bg[0]) * v; a[p + 1] = bg[1] + (191 - bg[1]) * v; a[p + 2] = bg[2] + (36 - bg[2]) * v; }
			else { a[p] = bg[0] + (255 - bg[0]) * v; a[p + 1] = bg[1] + (238 - bg[1]) * v; a[p + 2] = bg[2] + (170 - bg[2]) * v; }
			a[p + 3] = 255;
		}
		offc.putImageData(img, 0, 0);
		c.imageSmoothingEnabled = true;
		var pt = performance.now() - t0; slowN = pt > 9 ? slowN + 1 : Math.max(0, slowN - 1);
		if (slowN > 12 && GWMAX > 110) { GWMAX = Math.max(110, Math.round(GWMAX * 0.8)); slowN = 0; lay.key = ""; }
		c.drawImage(off, sx(-0.14), sy(lay.Yr), lay.gw * lay.cell * lay.sc, lay.gh * lay.cell * lay.sc);
	}
	function drawScene(canvas, stage) {
		var Yr = S.tab === "sweep" ? Math.max(0.46, Math.tan(rad(S.A)) * 1.2) : 0.62;
		var L = layout(canvas, stage, Yr), c = setup(canvas, L.w, L.h);
		c.fillStyle = COL.bg; c.fillRect(0, 0, L.w, L.h);
		paintField(c);
		var h = sim.hist, spots = mySpots(), i, s;
		/* screen: a lit strip showing where light lands */
		var wx = sx(1), step = 2, y;
		c.fillStyle = "#1b2447"; c.fillRect(wx, 0, 9, L.h);
		for (y = -Yr; y < Yr; y += step / L.sc) {
			var cell = lay.sec, lv = light(1, Math.hypot(1, y), Math.atan2(y, 1), 1 / Math.cos(Math.atan2(y, 1)), sim.t, h);
			if (lv > 0.02) { c.fillStyle = S.tab === "sweep" ? "rgba(251,191,36," + lv + ")" : "rgba(255,238,170," + lv + ")"; c.fillRect(wx, sy(y), 9, step + 0.5); }
		}
		c.strokeStyle = COL.steel; c.lineWidth = 2; c.beginPath(); c.moveTo(wx, 0); c.lineTo(wx, L.h); c.stroke();
		/* source */
		c.fillStyle = "#475569"; c.fillRect(sx(-0.075), sy(0.03), sx(0) - sx(-0.075), 0.06 * L.sc);
		c.fillStyle = COL.gold; c.beginPath(); c.arc(sx(0), sy(0), 5, 0, 7); c.fill();
		text(c, S.tab === "sweep" ? "torch" : "lamp", sx(-0.075), sy(-0.07), COL.dim, 11, "left");
		if (S.tab === "sweep") {             // little aim marker
			var th = h.get(h.k - 1); c.strokeStyle = "rgba(251,191,36,0.5)"; c.lineWidth = 1; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(sx(0), sy(0)); c.lineTo(sx(0.16 * Math.cos(th)), sy(0.16 * Math.sin(th))); c.stroke(); c.setLineDash([]);
		} else {                             // the finger
			var d = S.d / 100, yf = h.get(h.k - 1), fh = d * S.sz / 100;
			c.fillStyle = "#d9a679"; c.beginPath(); (c.roundRect || c.rect).call(c, sx(d) - 0.012 * L.sc, sy(yf + fh), 0.024 * L.sc, 2 * fh * L.sc, 3); c.fill();
			text(c, "finger", sx(d), sy(-0.62 + 0.04), COL.dim, 11, "center");
			c.strokeStyle = "rgba(147,161,196,0.35)"; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(sx(0), sy(-0.55)); c.lineTo(sx(d), sy(-0.55)); c.stroke(); c.setLineDash([]);
			text(c, "d", sx(d / 2), sy(-0.55) - 8, COL.dim, 11, "center");
		}
		/* trail + spots */
		for (i = sim.trail.length - 1; i >= 0; i--) {
			var tr = sim.trail[i], age = sim.t - tr.t; if (age > 1.1) { sim.trail.splice(0, i + 1); break; }
			c.fillStyle = (Math.abs(tr.v) > 1 ? "rgba(251,146,60," : "rgba(74,222,128,") + (0.5 * (1 - age / 1.1)) + ")"; c.beginPath(); c.arc(wx + 14, sy(tr.y), 2.2, 0, 7); c.fill();
		}
		for (i = 0; i < spots.length; i++) {
			s = spots[i]; var fast = Math.abs(s.v) > 1, col = fast ? COL.orange : COL.green;
			if (S.run) sim.trail.push({ y: s.y, v: s.v, t: sim.t });
			var g = c.createRadialGradient(wx + 4, sy(s.y), 1, wx + 4, sy(s.y), 16); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
			c.fillStyle = g; c.beginPath(); c.arc(wx + 4, sy(s.y), 16, 0, 7); c.fill();
			c.fillStyle = "#fff"; c.beginPath(); c.arc(wx + 4, sy(s.y), 3.5, 0, 7); c.fill();
			if (sy(s.y) > 12 && sy(s.y) < L.h - 12) text(c, fmtMult(s.v), Math.min(wx + 24, L.w - 4 - 56), sy(s.y), col, 13, "left", true);
		}
		if (S.run) for (i = 0; i < spots.length; i++) sim.chart.push({ t: sim.t, v: Math.abs(spots[i].v) });
		while (sim.chart.length && sim.t - sim.chart[0].t > 3.2) sim.chart.shift();
		drawChart(S.tab === "sweep" ? $("ftl-ch1") : $("ftl-ch2"));
		text(c, "screen " + F.fmtLen(S.D) + " away · light needs " + F.fmtTime(T0) + " · animation slowed ×" + F.sig(S.cross / T0, 3), 10, 14, COL.dim, 11, "left");
		if ((S.tab === "sweep" && S.aim) || (S.tab === "shadow" && S.sman)) { c.fillStyle = "rgba(251,146,60,0.92)"; c.fillRect(10, 24, 170, 20); text(c, "✋ MANUAL MODE: drag or click", 16, 34, "#1a0f00", 11, "left", true); }
		return spots;
	}


	/* ---------------- speed-versus-time chart ---------------- */
	function drawChart(canvas) {
		var box = canvas.parentNode, w = box.clientWidth || 300, h = box.clientHeight || 200, c = setup(canvas, w, h), m = { l: 44, r: 12, t: 30, b: 28 }, X = w - m.l - m.r, Y = h - m.t - m.b;
		var lo = Math.log10(0.1), hi = Math.log10(100), win = 3;
		var px = function (t) { return m.l + (t - (sim.t - win)) / win * X; }, py = function (v) { return m.t + (1 - (Math.log10(clamp(v, 0.1, 100)) - lo) / (hi - lo)) * Y; };
		c.fillStyle = "#0a1124"; c.fillRect(0, 0, w, h);
		c.fillStyle = "rgba(251,146,60,0.10)"; c.fillRect(m.l, m.t, X, py(1) - m.t);
		c.strokeStyle = "rgba(147,161,196,0.2)"; c.lineWidth = 1; c.font = "11px system-ui,sans-serif"; c.textAlign = "right"; c.textBaseline = "middle";
		[0.1, 1, 10, 100].forEach(function (v) { var y = py(v); c.strokeStyle = v === 1 ? COL.orange : "rgba(147,161,196,0.2)"; c.lineWidth = v === 1 ? 2 : 1; c.beginPath(); c.moveTo(m.l, y); c.lineTo(m.l + X, y); c.stroke(); c.fillStyle = v === 1 ? COL.orange : COL.dim; c.fillText(v === 1 ? "c" : v + " c", m.l - 6, y); });
		text(c, "Spot speed", m.l, 12, COL.text, 12, "left", true); text(c, "faster than light ↑", m.l + X, 12, COL.orange, 11, "right");
		text(c, "time →  (last " + win + " light-crossings)", m.l + X / 2, h - 10, COL.dim, 11, "center");
		var i, p;
		for (i = 0; i < sim.chart.length; i++) { p = sim.chart[i]; var x = px(p.t); if (x < m.l) continue; c.fillStyle = p.v > 1 ? "rgba(251,146,60,0.95)" : "rgba(74,222,128,0.95)"; c.fillRect(x - 1, py(p.v) - 1.2, 2, 2.4); }
		if (!sim.chart.length) text(c, "waiting for the first light to land…", m.l + X / 2, m.t + Y / 2, COL.dim, 12, "center");
	}

	/* ---------------- readouts ---------------- */
	function renderRO(spots) {
		var sp = null, i, a = 0; for (i = 0; i < spots.length; i++) if (Math.abs(spots[i].v) >= a) { a = Math.abs(spots[i].v); sp = spots[i]; }
		var v = sp ? Math.abs(sp.v) : 0; if (S.run || v > sim.max) sim.max = Math.max(sim.max, v);
		var cls = v > 1 ? "is-ftl" : "is-slow", vt = sp ? fmtMult(v) : "–", sub = sp ? F.fmtSpeed(v * C) + " along the screen" : "no spot on the screen";
		var key, html;
		if (S.tab === "sweep") {
			var crit = F.criticalRate(S.D), now = (S.aim ? sim.rate : kS()) * crit;
			html = ro("Spot speed now", vt, sub, sp ? cls : "") + ro("Fastest so far", fmtMult(sim.max), sim.max > 1 ? "faster than light" : "not yet faster than light", sim.max > 1 ? "is-ftl" : "")
				+ ro(S.aim ? "Your swing now" : "Torch swing rate", F.fmtRate(now), "light speed needs " + F.fmtRate(crit) + " on the axis")
				+ ro("Light to the screen", F.fmtTime(T0), "every photon takes this long")
				+ ro("Is the spot a thing?", sp && v > 1 ? "Faster than c" : "Slower than c", "no photon travels along it; each lands once", sp && v > 1 ? "is-ftl" : "is-slow");
			key = [vt, sim.max.toFixed(2), F.fmtRate(now), S.Dtxt].join("|");
		} else {
			var d = S.d / 100, vfNow = kfS() * d, need1 = F.fingerNeeded(1, S.D);
			html = ro("Shadow speed now", vt, sub, sp ? cls : "") + ro("Fastest so far", fmtMult(sim.max), sim.max > 1 ? "faster than light" : "not yet faster than light", sim.max > 1 ? "is-ftl" : "")
				+ ro("Magnification", F.sig(1 / d, 3) + "×", "shadow moves " + F.sig(1 / d, 3) + " times as far as the finger")
				+ ro("Finger speed", fmtMult(vfNow), "at this spacing it needs " + fmtMult(d) + " to beat light")
				+ ro("Finger 1 m from the lamp", F.fmtSpeed(need1), "is enough to beat light across " + F.fmtLen(S.D), "is-slow");
			key = [vt, sim.max.toFixed(2), kfS().toFixed(3), S.d, S.Dtxt].join("|");
		}
		setHTML($(S.tab === "sweep" ? "ftl-ro1" : "ftl-ro2"), html, key);
	}

	/* ---------------- message tab: space-time diagram ---------------- */
	function drawMsg() {
		var stage = $("ftl-stage3"), canvas = $("ftl-c3"), w = stage.clientWidth || 640, h = clamp(w * 0.55, 300, 520); stage.style.height = Math.round(h) + "px";
		var c = setup(canvas, w, h), s = sS(), m = { l: 56, r: 24, t: 24, b: 44 }, X = w - m.l - m.r, Y = h - m.t - m.b;
		c.fillStyle = COL.bg; c.fillRect(0, 0, w, h);
		var px = function (x) { return m.l + x / 1.15 * X; }, py = function (t) { return h - m.b - t / 1.15 * Y; };
		/* unreachable region (below the light line from A) and reachable region */
		c.fillStyle = "rgba(248,113,113,0.13)"; c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(1.15), py(0)); c.lineTo(px(1.15), py(1.15)); c.closePath(); c.fill();
		c.fillStyle = "rgba(34,211,238,0.10)"; c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(1.15), py(1.15)); c.lineTo(px(0), py(1.15)); c.closePath(); c.fill();
		c.strokeStyle = COL.line; c.lineWidth = 1; c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(1.15), py(0)); c.moveTo(px(0), py(0)); c.lineTo(px(0), py(1.15)); c.stroke();
		c.strokeStyle = COL.cyan; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(1.15), py(1.15)); c.stroke(); c.setLineDash([]);
		text(c, "light from A (speed c)", px(0.62), py(0.62) - 18, COL.cyan, 12, "left");
		var tB = 1 / s;
		c.strokeStyle = COL.orange; c.lineWidth = 3.5; c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(1), py(tB)); c.stroke();
		function dot(x, t, col, lab, dx, dy) { c.fillStyle = col; c.beginPath(); c.arc(px(x), py(t), 6, 0, 7); c.fill(); text(c, lab, px(x) + dx, py(t) + dy, COL.text, 13, "left", true); }
		dot(1, 1, COL.cyan, "earliest B could hear from A", -150, -16); dot(0, 0, COL.text, "A", 10, 12); dot(1, tB, COL.orange, "B: the spot arrives", -150, 20);
		text(c, "the spot's path", px(0.3), py(0.3 / s) + 18, COL.orange, 12, "left", true);
		text(c, "can influence B", px(0.18), py(0.84), "rgba(34,211,238,0.9)", 12, "center"); text(c, "A cannot influence this region", px(0.76), py(0.22), "rgba(248,113,113,0.95)", 12, "center");
		text(c, "distance along the screen →", m.l + X / 2, h - 14, COL.dim, 12, "center");
		c.save(); c.translate(16, m.t + Y / 2); c.rotate(-Math.PI / 2); text(c, "time →", 0, 0, COL.dim, 12, "center"); c.restore();
		var dt = S.D / C, tSpot = dt / s;
		var html = ro("Spot speed", fmtMult(s), F.fmtSpeed(s * C), "is-ftl") + ro("A to B", F.fmtLen(S.D), "the two ends of the screen") + ro("Light would need", F.fmtTime(dt), "the fastest any signal could go")
			+ ro("The spot takes", F.fmtTime(tSpot), F.sig(s, 3) + " times quicker") + ro("A and B are", "Out of reach", "outside each other's light cones: no cause can pass from A to B", "is-slow");
		setHTML($("ftl-ro3"), html, [s.toFixed(3), S.Dtxt].join("|"));
	}

	/* ---------------- calculator ---------------- */
	function renderCalc() {
		var D = F.parseLen(S.k.D), w = F.parseRate(S.k.w), d = F.parseLen(S.k.d), f = F.parseSpeed(S.k.f), out = [], note = function (id, ok, msg) { $(id).textContent = ok ? msg : "Could not read this, try e.g. " + msg; };
		note("ftl-k-D-n", D, D ? "= " + F.fmtLen(D) + " · light takes " + F.fmtTime(D / C) : "384,400 km"); note("ftl-k-w-n", w, w ? "= " + F.sig(w, 3) + " rad/s = " + F.fmtRate(w) : "90 deg/s or 2 rpm");
		note("ftl-k-d-n", d, d ? "= " + F.fmtLen(d) + (D ? " (" + F.sig(d / D, 3) + " of the way)" : "") : "1 m"); note("ftl-k-f-n", f, f ? "= " + F.fmtSpeed(f) + " (" + F.sig(f * 3.6, 3) + " km/h)" : "1 m/s or 3 km/h");
		function st(l, v, sub, hero) { return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + esc(l) + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + sub + "</div></div>"; }
		var lines = [];
		if (D) {
			out.push(st("Sweep rate that beats light", F.fmtRate(F.criticalRate(D)), F.sig(F.criticalRate(D), 3) + " rad/s · one turn in " + F.fmtTime(2 * Math.PI / F.criticalRate(D)), true)); lines.push("Sweep rate that beats light: " + F.fmtRate(F.criticalRate(D)));
			if (w) { var v = F.spotAxisSpeed(w, D); out.push(st("Your spot speed", F.fmtC(v), F.fmtSpeed(v) + (v > C ? " · faster than light (the spot is not an object)" : " · slower than light"), false)); lines.push("Spot speed at " + F.fmtRate(w) + ": " + F.fmtC(v)); }
			if (d && d < D) {
				out.push(st("Finger speed that beats light", F.fmtSpeed(F.fingerNeeded(d, D)), "finger " + F.fmtLen(d) + " from the lamp, wall " + F.fmtLen(D) + " away · magnification " + F.sig(D / d, 3) + "×", true)); lines.push("Finger speed that beats light at " + F.fmtLen(d) + ": " + F.fmtSpeed(F.fingerNeeded(d, D)));
				if (f) { var vs = F.shadowSpeed(f, d, D); out.push(st("Your shadow speed", F.fmtC(vs), F.fmtSpeed(vs) + (vs > C ? " · faster than light" : " · slower than light"), false)); lines.push("Shadow speed at finger " + F.fmtSpeed(f) + ": " + F.fmtC(vs)); }
			} else if (d) out.push(st("Finger distance", "–", "must be less than the distance to the screen", false));
		}
		$("ftl-k-out").innerHTML = out.join(""); renderCalc.text = lines.join("\n");
		$("ftl-k-places").innerHTML = '<span class="tu-label">Screen:</span> ' + F.PLACES.map(function (p, i) { return '<button type="button" class="tu-chip" data-pl="' + i + '">' + esc(p.n) + "</button>"; }).join(" ");
	}
	function placesTable() {
		$("ftl-k-table").innerHTML = "<thead><tr><th>Screen</th><th>Distance</th><th>Light takes</th><th>Sweep rate to beat c</th><th>Finger speed at 1 m</th></tr></thead><tbody>" + F.PLACES.map(function (p) {
			return "<tr><td>" + esc(p.n) + "</td><td>" + esc(p.s) + "</td><td>" + F.fmtTime(p.d / C) + "</td><td>" + F.fmtRate(F.criticalRate(p.d)) + "</td><td>" + F.fmtSpeed(F.fingerNeeded(1, p.d)) + "</td></tr>"; }).join("") + "</tbody>";
	}
	function bindCalc() {
		var map = { "ftl-k-D": "D", "ftl-k-w": "w", "ftl-k-d": "d", "ftl-k-f": "f" };
		Object.keys(map).forEach(function (id) { $(id).value = S.k[map[id]]; $(id).oninput = function () { S.k[map[id]] = this.value; save(); renderCalc(); }; });
		$("ftl-k-places").onclick = function (e) { var b = e.target.closest("[data-pl]"); if (!b) return; var p = F.PLACES[+b.getAttribute("data-pl")]; S.k.D = p.s; $("ftl-k-D").value = p.s; save(); renderCalc(); };
		$("ftl-k-copy").onclick = function () { copy(renderCalc.text || "", "Answers copied"); };
		$("ftl-k-link").onclick = function () { var u = new URL(location.href.split("?")[0], location.href); u.searchParams.set("tab", "calc"); u.searchParams.set("kD", S.k.D); u.searchParams.set("kw", S.k.w); u.searchParams.set("kd", S.k.d); u.searchParams.set("kf2", S.k.f); copy(u.toString(), "Link copied"); };
	}

	/* ---------------- controls ---------------- */
	var dirty = true;
	function paintSetup() {
		$("ftl-k-v").textContent = multTxt(kS()) + " the speed that matches light (" + F.fmtRate(kS() * F.criticalRate(S.D)) + ")";
		$("ftl-a-v").textContent = S.A + "°"; $("ftl-bw-v").textContent = S.bw.toFixed(1) + "°"; $("ftl-sz-v").textContent = S.sz + "% of its distance from the lamp";
		$("ftl-kf-v").textContent = multTxt(kfS()) + " the speed that matches light";
		$("ftl-d-v").textContent = F.fmtLen(S.d / 100 * S.D) + " (" + S.d + "% of the way)";
		$("ftl-s-v").textContent = fmtMult(sS());
		$("ftl-bw").value = S.bw; $("ftl-sz").value = S.sz; $("ftl-slide").checked = S.slide; $("ftl-sm-auto").setAttribute("aria-pressed", String(!S.sman)); $("ftl-sm-man").setAttribute("aria-pressed", String(S.sman)); $("ftl-shint").hidden = !S.sman; $("ftl-kf").disabled = S.sman; $("ftl-c2").classList.toggle("is-aim", S.sman);
		$("ftl-hand1").setAttribute("aria-pressed", String(S.aim)); $("ftl-hand2").setAttribute("aria-pressed", String(S.sman)); $("ftl-hand1").textContent = S.aim ? "↻ Back to auto" : "✋ Manual"; $("ftl-hand2").textContent = S.sman ? "↻ Back to auto" : "✋ Manual";
		$("ftl-k").value = S.kv; $("ftl-a").value = S.A; $("ftl-kf").value = S.kfv; $("ftl-d").value = S.d; $("ftl-s").value = S.sv;
		$("ftl-m-auto").setAttribute("aria-pressed", String(!S.aim)); $("ftl-m-aim").setAttribute("aria-pressed", String(S.aim)); $("ftl-aimhint").hidden = !S.aim; $("ftl-k").disabled = S.aim; $("ftl-c1").classList.toggle("is-aim", S.aim);
		[].forEach.call(document.querySelectorAll("[data-dp]"), function (b) { b.setAttribute("aria-pressed", String(F.PLACES[+b.getAttribute("data-dp")].s === S.Dtxt)); });
		$("ftl-play1").textContent = $("ftl-play2").textContent = S.run ? "❚❚ Pause" : "▶ Play"; $("ftl-play1").setAttribute("aria-pressed", String(S.run)); $("ftl-play2").setAttribute("aria-pressed", String(S.run));
	}
	function distanceBar(where) {      // chips for the screen distance, placed above each simulation's controls
		return '<div class="ftl-row ftl-distrow"><span class="tu-label">Screen is</span> ' + F.PLACES.map(function (p, i) { return '<button type="button" class="tu-chip" data-dp="' + i + '" title="' + esc(p.s) + '">' + esc(p.n) + "</button>"; }).join(" ")
			+ ' <label class="ftl-own">or <input class="tu-input" type="text" data-dcustom placeholder="e.g. 5 light-minutes" aria-label="Custom screen distance" autocomplete="off" spellcheck="false"></label>'
			+ ' <span class="ftl-slow tu-note">Slow motion: light crosses in <input type="number" data-cross min="1" max="10" step="0.5" aria-label="Seconds the light takes on screen"> s</span></div>';
	}
	function setDistance(txt) {
		var m = F.parseLen(txt); if (!m || m < 1 || m > 1e30) { toast("Could not read that distance"); return; }
		S.Dtxt = txt; S.D = m; save(); newSim(); paintSetup(); renderAllChips();
	}
	function renderAllChips() { [].forEach.call(document.querySelectorAll("[data-dcustom]"), function (i) { if (document.activeElement !== i) i.value = F.PLACES.some(function (p) { return p.s === S.Dtxt; }) ? "" : S.Dtxt; }); [].forEach.call(document.querySelectorAll("[data-cross]"), function (i) { if (document.activeElement !== i) i.value = S.cross; }); }
	function chipsFor(id, vals, setter) {
		$(id).innerHTML = vals.map(function (v) { return '<button type="button" class="tu-chip" data-v="' + v[0] + '">' + v[1] + "</button>"; }).join(" ");
		$(id).onclick = function (e) { var b = e.target.closest("[data-v]"); if (!b) return; setter(parseFloat(b.getAttribute("data-v"))); };
	}
	function fromK(k) { return Math.round(1000 * Math.log(k / 0.05) / Math.log(600)); }
	function setTab(t, user) {
		S.tab = t; [].forEach.call(root.querySelectorAll(".ftl-tabs button"), function (b) { var on = b.getAttribute("data-tab") === t; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
		TABS.forEach(function (n) { $("ftl-p-" + n).hidden = n !== t; });
		if (t === "sweep" || t === "shadow") newSim(); if (t === "msg") { paintSetup(); drawMsg(); } if (t === "calc") renderCalc();
		save(); if (user) history.replaceState(null, "", location.pathname);
	}
	function insertDistanceBars() {
		["ftl-p-sweep", "ftl-p-shadow"].forEach(function (id) { var card = $(id).querySelector(".ftl-controls"); card.insertAdjacentHTML("afterbegin", distanceBar()); });
		root.addEventListener("click", function (e) { var b = e.target.closest("[data-dp]"); if (b) setDistance(F.PLACES[+b.getAttribute("data-dp")].s); });
		root.addEventListener("change", function (e) {
			if (e.target.hasAttribute("data-dcustom")) setDistance(e.target.value);
			else if (e.target.hasAttribute("data-cross")) { S.cross = clamp(parseFloat(e.target.value) || 3, 1, 10); save(); renderAllChips(); }
		});
		root.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.hasAttribute("data-dcustom")) e.target.blur(); });
	}
	insertDistanceBars();
	chipsFor("ftl-k-chips", [[0.3, "0.3×"], [0.9, "just under light"], [1.1, "just over light"], [3, "3×"], [10, "10×"], [30, "30×"]], function (k) { S.kv = fromK(k); S.aim = false; save(); paintSetup(); });
	chipsFor("ftl-kf-chips", [[0.3, "0.3×"], [0.9, "just under light"], [1.1, "just over light"], [3, "3×"], [10, "10×"], [30, "30×"]], function (k) { S.kfv = fromK(k); save(); paintSetup(); });
	$("ftl-k").oninput = function () { S.kv = +this.value; save(); paintSetup(); };
	$("ftl-a").oninput = function () { S.A = +this.value; save(); paintSetup(); newSim(); };
	$("ftl-kf").oninput = function () { S.kfv = +this.value; save(); paintSetup(); };
	$("ftl-d").oninput = function () { S.d = +this.value; save(); paintSetup(); newSim(); };
	$("ftl-s").oninput = function () { S.sv = +this.value; save(); paintSetup(); drawMsg(); };
	$("ftl-m-auto").onclick = function () { S.aim = false; paintSetup(); newSim(); }; $("ftl-m-aim").onclick = function () { S.aim = true; sim.target = sim.val; paintSetup(); };
	$("ftl-hand1").onclick = function () { if (S.aim) { S.aim = false; paintSetup(); newSim(); } else { S.aim = true; sim.target = sim.val; paintSetup(); dirty = true; } };
	$("ftl-hand2").onclick = function () { if (S.sman) { S.sman = false; S.slide = false; paintSetup(); newSim(); } else { S.sman = true; sim.target = sim.val; paintSetup(); dirty = true; } };
	$("ftl-sm-auto").onclick = function () { S.sman = false; paintSetup(); newSim(); }; $("ftl-sm-man").onclick = function () { S.sman = true; sim.target = sim.val; paintSetup(); };
	$("ftl-slide").onchange = function () { S.slide = this.checked; if (S.slide && !S.sman) { S.sman = true; sim.target = sim.val; } paintSetup(); };
	$("ftl-bw").oninput = function () { S.bw = +this.value; save(); paintSetup(); dirty = true; };
	$("ftl-sz").oninput = function () { S.sz = +this.value; save(); paintSetup(); dirty = true; };
	function toggleRun() { S.run = !S.run; paintSetup(); } $("ftl-play1").onclick = toggleRun; $("ftl-play2").onclick = toggleRun;
	$("ftl-restart1").onclick = $("ftl-restart2").onclick = function () { newSim(); };
	$("ftl-full1").onclick = function () { toggleFull("ftl-wrap1"); }; $("ftl-full2").onclick = function () { toggleFull("ftl-wrap2"); };
	/* aiming / moving by hand: drag or click on the picture (first touch switches that tab to hand mode) */
	function pointerWorld(cv, e) { var r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) - lay.ox) / lay.sc, y: (lay.h / 2 - (e.clientY - r.top)) / lay.sc }; }
	function handTo(e) {
		if (!lay.sc) return; var cv = S.tab === "sweep" ? $("ftl-c1") : $("ftl-c2"), w = pointerWorld(cv, e);
		if (S.tab === "sweep") sim.target = clamp(Math.atan2(w.y, Math.max(w.x, 0.05)), -rad(60), rad(60));
		else { sim.target = clamp(w.y, -0.58, 0.58); if (S.slide) { S.d = clamp(Math.round(w.x * 100), 4, 90); paintSetup(); } }
		dirty = true;
	}
	["ftl-c1", "ftl-c2"].forEach(function (id) {
		var cv = $(id), down = false;
		cv.addEventListener("pointerdown", function (e) {
			if ((id === "ftl-c1") !== (S.tab === "sweep")) return;
			if (id === "ftl-c1" && !S.aim) { S.aim = true; sim.target = sim.val; paintSetup(); }
			if (id === "ftl-c2" && !S.sman) { S.sman = true; sim.target = sim.val; paintSetup(); }
			down = true; handTo(e); if (cv.setPointerCapture) try { cv.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault();
		});
		cv.addEventListener("pointermove", function (e) { if (down) handTo(e); });
		cv.addEventListener("pointerup", function () { down = false; }); cv.addEventListener("pointercancel", function () { down = false; });
	});
	[].forEach.call(root.querySelectorAll(".ftl-tabs button"), function (b) {
		b.onclick = function () { setTab(b.getAttribute("data-tab"), true); };
		b.onkeydown = function (e) { var i = TABS.indexOf(b.getAttribute("data-tab")); if (e.key === "ArrowRight") { setTab(TABS[(i + 1) % TABS.length], true); $("ftl-t-" + S.tab).focus(); e.preventDefault(); } else if (e.key === "ArrowLeft") { setTab(TABS[(i + TABS.length - 1) % TABS.length], true); $("ftl-t-" + S.tab).focus(); e.preventDefault(); } };
	});
	document.addEventListener("keydown", function (e) {
		var tag = (e.target.tagName || "").toLowerCase(); if (/^(input|textarea|select)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
		if ((S.tab === "sweep" || S.tab === "shadow") && e.key === " " && tag !== "button") { e.preventDefault(); toggleRun(); }
	});

	/* ---------------- main loop ---------------- */
	var last = 0, vis = true;
	document.addEventListener("visibilitychange", function () { vis = !document.hidden; last = 0; });
	function frame(ts) {
		requestAnimationFrame(frame);
		if (!vis) return;
		var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016; last = ts;
		if (S.tab === "sweep" || S.tab === "shadow") {
			if (S.run) { sim.t += dt / S.cross; stepTo(sim.t); } else if (!dirty) return;
			dirty = false;
			var spots = drawScene(S.tab === "sweep" ? $("ftl-c1") : $("ftl-c2"), S.tab === "sweep" ? $("ftl-stage1") : $("ftl-stage2"));
			renderRO(spots);
		}
	}
	if (window.ResizeObserver) [1, 2].forEach(function (n) { new ResizeObserver(function () { setTimeout(function () { var w = $("ftl-wrap" + n).clientWidth, k = w >= 900 ? "wide" : "narrow"; if ($("ftl-wrap" + n).getAttribute("data-w") !== k) $("ftl-wrap" + n).setAttribute("data-w", k); lay.key = ""; dirty = true; }, 0); }).observe($("ftl-wrap" + n)); });
	var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { lay.key = ""; dirty = true; if (S.tab === "msg") drawMsg(); }, 60); });
	document.addEventListener("fullscreenchange", function () { lay.key = ""; dirty = true; if (S.tab === "msg") drawMsg(); });

	placesTable(); bindCalc(); renderAllChips(); paintSetup();
	setTab(S.tab, false);
	if (q.get("tab") || q.get("D") || q.get("k")) history.replaceState(null, "", location.pathname);
	requestAnimationFrame(frame);
})();
