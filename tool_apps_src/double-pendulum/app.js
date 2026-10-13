/* Double Pendulum UI: live pendulum (+ copies for the butterfly effect, graphs) and the flip-time chaos map.
   Maths: MESPend (node-tested: tool_apps_src/double-pendulum-tests.js). State: localStorage mes-double-pendulum:v1; links ?a1=&a2=&m1=... */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("dp"); if (!root) return;
	var D = window.MESPend, PI = Math.PI, KEY = "mes-double-pendulum:v1", RAD = PI / 180;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(v, lo, hi, d) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	var q = new URLSearchParams(location.search), saved = sget(), toastT;
	function toast(msg) { var t = $("dp-toast"); if (!t) { t = document.createElement("div"); t.id = "dp-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copyLink(url) { var done = function () { toast("Link copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url); }
	function sig(x, d) { x = +x; if (!isFinite(x)) return "–"; if (x === 0) return "0"; var a = Math.abs(x); if (a < 1e-3 || a >= 1e5) return x.toExponential(Math.max(0, (d || 3) - 1)).replace("e", "×10^").replace("^+", "^").replace(/\^(-?\d+)/, function (m, e) { return String(e).replace(/-/g, "−").replace(/\d/g, function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]; }); }); return Number(x.toPrecision(d || 3)).toString(); }

	var tab = /^(sim|map)$/.test(q.get("tab") || "") ? q.get("tab") : "sim";
	function setTab(t) {
		tab = t; Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		try { var u = new URL(location.href); u.searchParams.set("tab", t); history.replaceState(null, "", u); } catch (e) {}
		setTimeout(function () { onResize(); if (t === "map") startMap(false); }, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* ---------------- state ---------------- */
	var P = D.params(), a1 = 140, a2 = 110, ncop = 2, eps = -6, trailN = 2, speedI = 3, flags = { trail: true, arms: true, chart: true };
	var SPEEDS = [0.05, 0.125, 0.25, 0.5, 1, 2, 4], SPN = ["0.05×", "⅛×", "¼×", "½×", "1×", "2×", "4×"]; speedI = 4;
	var TRAIL_LEN = [0, 120, 400, 1500], TRAIL_NAME = ["none", "short", "medium", "long"];
	var HS = 0.002; /* RK4 step (s) */
	var copies = [], simT = 0, play = true, E0 = 0, flips = 0, lastBelow = 0, hist = [], lastHistT = -1, drag = null, lyap = null, ta = null, e0d = 1;

	function seed() {
		copies = []; var n = ncop, d = Math.pow(10, eps);
		for (var k = 0; k < n; k++) copies.push({ s: [a1 * RAD + k * d, a2 * RAD, 0, 0], trail: [], hue: n === 1 ? 45 : (k / Math.max(1, n) * 300 + 20) % 360 });
		simT = 0; flips = 0; hist = []; lastHistT = -1; lyap = null; ta = null; e0d = Math.max(1e-12, d);
		E0 = D.energy(copies[0].s, P).E; updateReadouts(true);
	}
	function setPreset(p) { a1 = p.a1; a2 = p.a2; syncAngles(); $("dp-note").textContent = p.note; if (p.mode != null) { var M = D.normalModes(P); var r = M[p.mode].ratio; a2 = Math.max(-179, Math.min(179, a1 * r)); syncAngles(); } if (p.id === "mode1" || p.id === "mode2") { ncop = 1; $("dp-n").value = 1; $("dp-n-v").textContent = 1; } else if (ncop === 1) { ncop = 2; $("dp-n").value = 2; $("dp-n-v").textContent = 2; } seed(); }
	function syncAngles() { $("dp-a1").value = a1; $("dp-a2").value = a2; $("dp-a1-v").textContent = a1.toFixed(1); $("dp-a2-v").textContent = a2.toFixed(1); }

	/* ---------------- sizing ---------------- */
	var cv = $("dp-c"), cx = cv.getContext("2d"), stage = $("dp-stage"), chv = $("dp-ch"), chx = chv.getContext("2d"), W = 600, H = 420, dpr = 1, aspect = 1.45;
	var mcv = $("dp-mc"), mcx = mcv.getContext("2d"), mstage = $("dp-mstage");
	function onResize() {
		var wrap = stage.parentNode, w = wrap.clientWidth || 600; dpr = Math.min(2, window.devicePixelRatio || 1);
		if (tab === "sim") {
			var h = Math.round(w / aspect); wrap.setAttribute("data-mes-free", "1"); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h); if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) { var mh = window.innerHeight - 90 - (flags.chart ? 150 : 0); if (h > mh) h = mh; }
			stage.style.width = w + "px"; stage.style.height = h + "px"; W = w; H = h; var cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
			var chh = flags.chart ? 150 : 0; chv.style.height = chh + "px"; chv.parentNode.style.display = flags.chart ? "" : "none"; chv.width = Math.round(w * dpr); chv.height = Math.round(chh * dpr);
			draw(); drawChart();
		} else {
			var mwrap = mstage.parentNode, mcol = mwrap.clientWidth || w, mw = Math.min(mcol, Math.max(300, Math.min(760, window.innerHeight - 220))), mh2 = mw; mstage.style.width = mw + "px"; mstage.style.height = mh2 + "px";
			var cw2 = Math.round(mw * dpr), ch2 = Math.round(mh2 * dpr); if (mcv.width !== cw2 || mcv.height !== ch2) { mcv.width = cw2; mcv.height = ch2; mapDirty = true; if (map.ready) paintMap(); }
		}
	}

	/* ---------------- pendulum drawing ---------------- */
	function scale() { return Math.min(W, H) / (2.35 * (P.l1 + P.l2)); }
	function pivot() { return [W / 2, H / 2]; }
	function scr(x, y) { var s = scale(), p = pivot(); return [p[0] + x * s, p[1] - y * s]; }
	function hsl(h, s, l, a) { return "hsla(" + h + "," + s + "%," + l + "%," + (a == null ? 1 : a) + ")"; }
	function draw() {
		if (tab !== "sim") return; cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		var s = scale(), p = pivot(), many = copies.length > 3, i, c, ps, a, b, j;
		/* reach circle */
		cx.strokeStyle = "rgba(255,255,255,0.07)"; cx.lineWidth = 1; cx.beginPath(); cx.arc(p[0], p[1], (P.l1 + P.l2) * s, 0, 7); cx.stroke();
		/* trails */
		if (flags.trail && TRAIL_LEN[trailN]) copies.forEach(function (c, k) {
			var t = c.trail, n = t.length / 2; if (n < 2) return; var ch = many ? 4 : 8, step = Math.ceil(n / ch);
			cx.lineWidth = many ? 1.1 : 1.8;
			for (var z = 0; z < ch; z++) { var f = z * step, to = Math.min(n - 1, (z + 1) * step); if (f >= to) continue; cx.strokeStyle = hsl(c.hue, 90, 62, (many ? 0.08 : 0.1) + (many ? 0.55 : 0.8) * (z + 1) / ch); cx.beginPath(); for (j = f; j <= to; j++) { a = scr(t[2 * j], t[2 * j + 1]); if (j === f) cx.moveTo(a[0], a[1]); else cx.lineTo(a[0], a[1]); } cx.stroke(); }
		});
		/* arms and bobs */
		var r1 = 5 + 4 * Math.cbrt(P.m1 / Math.max(P.m1, P.m2)), r2 = 5 + 4 * Math.cbrt(P.m2 / Math.max(P.m1, P.m2));
		for (i = copies.length - 1; i >= 0; i--) {
			c = copies[i]; ps = D.positions(c.s, P); a = scr(ps.x1, ps.y1); b = scr(ps.x2, ps.y2); var first = i === 0;
			var al = many ? 0.35 : 1;
			if (flags.arms) { cx.strokeStyle = first ? "rgba(255,255,255," + (many ? 0.7 : 0.9) + ")" : hsl(c.hue, 85, 70, many ? 0.35 : 0.9); cx.lineWidth = first ? 2.5 : 1.6; cx.beginPath(); cx.moveTo(p[0], p[1]); cx.lineTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); }
			cx.fillStyle = hsl(c.hue, 90, 60, al); cx.beginPath(); cx.arc(a[0], a[1], many ? 3 : r1, 0, 7); cx.fill(); cx.beginPath(); cx.arc(b[0], b[1], many ? 3.5 : r2, 0, 7); cx.fill();
		}
		cx.fillStyle = "#cfd6e6"; cx.beginPath(); cx.arc(p[0], p[1], 4, 0, 7); cx.fill();
		if (drag) { var c0 = copies[0], ps0 = D.positions(c0.s, P), t = drag.which === 1 ? scr(ps0.x1, ps0.y1) : scr(ps0.x2, ps0.y2); cx.strokeStyle = "#fff"; cx.lineWidth = 2; cx.beginPath(); cx.arc(t[0], t[1], 14, 0, 7); cx.stroke(); }
		$("dp-badge").textContent = drag ? "Release to start" : "Drag a ball to set the start";
	}
	function drawChart() {
		if (!flags.chart || tab !== "sim") return; var w = chv.width, h = chv.height, k = dpr; chx.setTransform(1, 0, 0, 1, 0, 0); chx.fillStyle = "#080b12"; chx.fillRect(0, 0, w, h); chx.setTransform(k, 0, 0, k, 0, 0);
		var Wc = w / k, Hc = h / k, half = Wc / 2 - 12, pad = 26, win = 12, t1 = simT, t0 = Math.max(0, t1 - win);
		chx.font = "11px sans-serif"; chx.fillStyle = "rgba(160,170,190,0.9)"; chx.textBaseline = "top";
		/* left: angles */
		chx.fillText("angles of the first pendulum (upper white, lower coloured), last " + win + " s", 8, 4);
		var y0 = pad, y1 = Hc - 6, yz = (y0 + y1) / 2, yS = (y1 - y0) / 2 / 3.3;
		chx.strokeStyle = "rgba(255,255,255,0.12)"; chx.beginPath(); chx.moveTo(8, yz); chx.lineTo(half, yz); chx.stroke(); chx.moveTo(8, yz - PI * yS); chx.lineTo(half, yz - PI * yS); chx.moveTo(8, yz + PI * yS); chx.lineTo(half, yz + PI * yS); chx.stroke();
		var span = Math.max(1e-6, t1 - t0 || 1);
		[[0, "rgba(255,255,255,0.95)"], [1, hsl(copies[0] ? copies[0].hue : 45, 90, 62, 1)]].forEach(function (pr) {
			chx.strokeStyle = pr[1]; chx.lineWidth = 1.5; chx.beginPath(); var started = false, prev = null;
			for (var i = 0; i < hist.length; i++) { var h2 = hist[i]; if (h2[0] < t0) continue; var x = 8 + (h2[0] - t0) / span * (half - 8), v = ((h2[1 + pr[0]] + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI, y = yz - v * yS; if (prev !== null && Math.abs(v - prev) > PI) { started = false; } if (!started) { chx.moveTo(x, y); started = true; } else chx.lineTo(x, y); prev = v; } chx.stroke();
		});
		/* right: separation */
		var x0 = Wc / 2 + 14, x1 = Wc - 10; chx.fillStyle = "rgba(160,170,190,0.9)"; chx.fillText(copies.length > 1 ? "how far the copies are from the first (log scale)" : "turn on copies to see divergence", x0, 4);
		var lo = -10, hi = 0.6; chx.strokeStyle = "rgba(255,255,255,0.12)"; for (var e = -9; e <= 0; e += 3) { var yy = y0 + (hi - e) / (hi - lo) * (y1 - y0); chx.beginPath(); chx.moveTo(x0, yy); chx.lineTo(x1, yy); chx.stroke(); chx.fillStyle = "rgba(160,170,190,0.7)"; chx.fillText("10" + String(e).replace("-", "−").replace(/\d/g, function (c2) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[c2]; }), x0 + 2, yy - 12); }
		if (copies.length > 1) { chx.strokeStyle = "#ff8b6b"; chx.lineWidth = 1.5; chx.beginPath(); var st = false, tmaxs = Math.max(8, t1); for (var i2 = 0; i2 < hist.length; i2++) { var d = hist[i2][3]; if (!(d > 0)) continue; var x = x0 + hist[i2][0] / tmaxs * (x1 - x0), y = y0 + (hi - Math.log10(d)) / (hi - lo) * (y1 - y0); if (!st) { chx.moveTo(x, y); st = true; } else chx.lineTo(x, y); } chx.stroke(); }
		chx.fillStyle = "rgba(160,170,190,0.7)"; chx.fillText("time 0 → " + sig(Math.max(8, t1), 3) + " s", x1 - 80, y1 - 14);
	}

	/* ---------------- loop ---------------- */
	var last = 0;
	function sepDist() { var c0 = copies[0].s, m = 0; for (var k = 1; k < copies.length; k++) { var c = copies[k].s, wr = function (x) { x = (x + PI) % (2 * PI); if (x < 0) x += 2 * PI; return x - PI; }, d = Math.hypot(wr(c[0] - c0[0]), wr(c[1] - c0[1])); if (d > m) m = d; } return m; }
	function advance(T) {
		var n = Math.ceil(T / HS), h = T / n, i, k, c, t0 = performance.now(), done = 0;
		for (i = 0; i < n; i++) {
			for (k = 0; k < copies.length; k++) D.step(copies[k].s, P, h);
			simT += h; done++;
			if (simT - lastHistT >= 0.02) { lastHistT = simT; var s0 = copies[0].s; hist.push([simT, s0[0], s0[1], copies.length > 1 ? sepDist() : 0]); if (hist.length > 6000) hist.shift(); }
			var s0b = copies[0].s, below = Math.abs(s0b[1]) > PI ? 1 : 0; /* count lower-ball flips: crossings of |theta2| over pi in whole turns */
			var turns = Math.floor((s0b[1] + PI) / (2 * PI)); if (turns !== lastBelow) { flips += Math.abs(turns - lastBelow); lastBelow = turns; }
			if (copies.length > 1 && !lyap) { var dd = hist.length ? hist[hist.length - 1][3] : 0; if (ta === null && dd >= 10 * e0d && e0d <= 1e-3) ta = [simT, dd]; if (ta !== null && dd >= Math.min(0.05, 2e3 * e0d) && simT > ta[0] + 0.2) lyap = Math.log(dd / ta[1]) / (simT - ta[0]); }
			if (performance.now() - t0 > 12) { break; }
		}
		return done * h;
	}
	function pushTrails() {
		var cap = TRAIL_LEN[trailN]; if (!flags.trail || !cap) return; if (copies.length > 8) cap = Math.min(cap, 120);
		copies.forEach(function (c) { var ps = D.positions(c.s, P); c.trail.push(ps.x2, ps.y2); if (c.trail.length > cap * 2) c.trail.splice(0, c.trail.length - cap * 2); });
	}
	var tickN = 0;
	function frame(now) {
		requestAnimationFrame(frame); var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
		if (document.hidden || tab !== "sim") return;
		if (play && !drag) { var T = dt * SPEEDS[speedI], left = T, guard = 0; while (left > 1e-9 && guard++ < 40) { var did = advance(Math.min(left, 0.016)); left -= did; pushTrails(); if (did < Math.min(left + did, 0.016) - 1e-9) break; } }
		draw(); if (++tickN % 2 === 0) drawChart(); if (tickN % 8 === 0) updateReadouts();
	}
	function updateReadouts(force) {
		var c = copies[0]; if (!c) return; var e = D.energy(c.s, P);
		$("dp-r-t").textContent = sig(simT, 4) + " s"; $("dp-r-ts").textContent = SPN[speedI] + " speed";
		if (P.c > 0) { $("dp-r-e").textContent = "n/a"; $("dp-r-es").textContent = "friction removes energy"; } else { var dr = Math.abs((e.E - E0) / (Math.abs(E0) || 1)); $("dp-r-e").textContent = dr < 1e-13 ? "< 10⁻¹³" : dr.toExponential(1); $("dp-r-es").textContent = "relative drift (zero friction)"; }
		$("dp-r-f").textContent = String(flips);
		if (copies.length > 1) { var d = hist.length ? hist[hist.length - 1][3] : Math.pow(10, eps); $("dp-r-d").textContent = sig(d, 3) + " rad"; $("dp-r-ds").textContent = lyap ? "grows ×e every " + sig(1 / lyap, 2) + " s (λ ≈ " + sig(lyap, 2) + " /s)" : (d > 1 ? "no longer related" : "growing…"); }
		else { $("dp-r-d").textContent = "–"; $("dp-r-ds").textContent = "copies are off"; }
	}

	/* ---------------- pointer: drag a ball ---------------- */
	function evPos(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; }
	cv.addEventListener("pointerdown", function (e) {
		var p = evPos(e), c = copies[0], ps = D.positions(c.s, P), b1 = scr(ps.x1, ps.y1), b2 = scr(ps.x2, ps.y2), d1 = Math.hypot(p[0] - b1[0], p[1] - b1[1]), d2 = Math.hypot(p[0] - b2[0], p[1] - b2[1]), tol = (window.matchMedia && matchMedia("(pointer: coarse)").matches) ? 34 : 22;
		var which = d2 < d1 ? 2 : 1, d = Math.min(d1, d2); if (d > tol) { drag = null; return; }
		cv.setPointerCapture(e.pointerId); drag = { which: which }; stage.classList.add("is-drag"); moveDrag(p);
	});
	function moveDrag(p) {
		var pv = pivot(); if (drag.which === 1) a1 = Math.atan2(p[0] - pv[0], -(p[1] - pv[1])) / RAD;
		else { var ps = D.positions([a1 * RAD, 0, 0, 0], P), b1 = scr(ps.x1, ps.y1); a2 = Math.atan2(p[0] - b1[0], -(p[1] - b1[1])) / RAD; }
		syncAngles(); copies.forEach(function (c, k) { c.s = [a1 * RAD + k * Math.pow(10, eps), a2 * RAD, 0, 0]; c.trail = []; }); simT = 0; hist = []; flips = 0; lastBelow = 0; lyap = null; ta = null; E0 = D.energy(copies[0].s, P).E;
	}
	cv.addEventListener("pointermove", function (e) { if (drag) moveDrag(evPos(e)); });
	function endDrag() { if (drag) { drag = null; stage.classList.remove("is-drag"); seed(); sset({ a1: a1, a2: a2 }); } }
	cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
	cv.addEventListener("keydown", function (e) { if (e.key === " ") { e.preventDefault(); togglePlay(); } else if (e.key === "[") nudge(-1); else if (e.key === "]") nudge(1); else if (e.key === "r" || e.key === "R") seed(); });

	/* ---------------- controls ---------------- */
	function togglePlay() { play = !play; var b = $("dp-play"); b.setAttribute("aria-pressed", String(play)); b.textContent = play ? "❚❚ Pause" : "▶ Play"; }
	function nudge(d) { speedI = Math.max(0, Math.min(SPEEDS.length - 1, speedI + d)); $("dp-spd-v").textContent = SPN[speedI]; sset({ speedI: speedI }); }
	$("dp-play").onclick = togglePlay; $("dp-reset").onclick = function () { seed(); }; $("dp-slow").onclick = function () { nudge(-1); }; $("dp-fast").onclick = function () { nudge(1); };
	$("dp-png").onclick = function () { draw(); cv.toBlob(function (bl) { if (!bl) return; var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "double-pendulum.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }); };
	$("dp-full").onclick = function () { var w = stage.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	function slider(id, get, set, fmt, after) { var el = $(id); el.oninput = function () { set(+this.value); $(id + "-v").textContent = fmt(+this.value); if (after) after(); }; el.value = get(); $(id + "-v").textContent = fmt(get()); }
	slider("dp-a1", function () { return a1; }, function (v) { a1 = v; }, function (v) { return v.toFixed(1); }, function () { seed(); sset({ a1: a1 }); });
	slider("dp-a2", function () { return a2; }, function (v) { a2 = v; }, function (v) { return v.toFixed(1); }, function () { seed(); sset({ a2: a2 }); });
	slider("dp-n", function () { return ncop; }, function (v) { ncop = v; }, String, function () { seed(); sset({ ncop: ncop }); });
	slider("dp-e", function () { return eps; }, function (v) { eps = v; }, function (v) { return "10^" + v.toFixed(1); }, function () { seed(); sset({ eps: eps }); });
	[["m1", 1], ["m2", 1], ["l1", 1], ["l2", 1], ["g", 1], ["c", 1]].forEach(function (k) { slider("dp-" + k[0], function () { return P[k[0]]; }, function (v) { P[k[0]] = v; }, function (v) { return k[0] === "c" ? v.toFixed(2) : String(Math.round(v * 100) / 100); }, function () { seed(); mapDirty = true; modesNote(); var o = {}; o.P = P; sset(o); }); });
	slider("dp-tr", function () { return trailN; }, function (v) { trailN = v; }, function (v) { return TRAIL_NAME[v]; }, function () { if (!trailN) copies.forEach(function (c) { c.trail = []; }); sset({ trailN: trailN }); });
	[["dp-o-trail", "trail"], ["dp-o-arms", "arms"], ["dp-o-chart", "chart"]].forEach(function (p) { $(p[0]).onchange = function () { flags[p[1]] = this.checked; if (p[1] === "trail" && !this.checked) copies.forEach(function (c) { c.trail = []; }); onResize(); sset({ flags: flags }); }; });
	$("dp-pre").innerHTML = D.PRESETS.map(function (p) { return '<button type="button" data-id="' + p.id + '">' + esc(p.name) + "</button>"; }).join("");
	$("dp-pre").onclick = function (e) { var b = e.target.closest("button"); if (b) { var p = D.PRESETS.filter(function (x) { return x.id === b.dataset.id; })[0]; setPreset(p); Array.prototype.forEach.call($("dp-pre").children, function (x) { x.classList.toggle("is-on", x === b); }); sset({ a1: a1, a2: a2 }); } };
	var GR = [["Earth", 9.81], ["Moon", 1.62], ["Mars", 3.71], ["Jupiter", 24.8]];
	$("dp-gchips").innerHTML = GR.map(function (g) { return '<button type="button" data-g="' + g[1] + '">' + g[0] + " " + g[1] + "</button>"; }).join("");
	$("dp-gchips").onclick = function (e) { var b = e.target.closest("button"); if (b) { P.g = +b.dataset.g; $("dp-g").value = P.g; $("dp-g-v").textContent = P.g; seed(); mapDirty = true; modesNote(); sset({ P: P }); } };
	function modesNote() {
		if (P.c > 0) { $("dp-modes").textContent = "With friction there are no steady normal modes."; return; } var M = D.normalModes(P);
		$("dp-modes").textContent = "Small swings (normal modes): slow mode " + sig(M[0].period, 4) + " s with the arms " + (M[0].ratio > 0 ? "swinging together" : "against each other") + " (lower/upper angle ratio " + sig(M[0].ratio, 3) + "); fast mode " + sig(M[1].period, 4) + " s (ratio " + sig(M[1].ratio, 3) + ").";
	}
	$("dp-link").onclick = function () { var u = new URL(location.href); u.search = ""; u.searchParams.set("a1", a1.toFixed(2)); u.searchParams.set("a2", a2.toFixed(2)); ["m1", "m2", "l1", "l2", "g", "c"].forEach(function (k) { u.searchParams.set(k, P[k]); }); u.searchParams.set("n", ncop); u.searchParams.set("eps", eps); copyLink(u.toString()); };
	$("dp-tomap").onclick = function () { setTab("map"); };

	/* =================== chaos map =================== */
	var map = { ready: false, N: 0, t: null, tmax: 10, h: 0.005, job: 0, row: 0, flips: 0, canvas: null }, mapDirty = true, mapKey = "";
	var STOPS = [[0, [255, 247, 168]], [0.2, [255, 180, 84]], [0.45, [239, 71, 111]], [0.7, [142, 68, 173]], [0.88, [45, 58, 140]], [1, [10, 15, 44]]];
	function colour(u) { u = Math.max(0, Math.min(1, u)); for (var i = 1; i < STOPS.length; i++) if (u <= STOPS[i][0]) { var a = STOPS[i - 1], b = STOPS[i], f = (u - a[0]) / (b[0] - a[0]); return [a[1][0] + (b[1][0] - a[1][0]) * f, a[1][1] + (b[1][1] - a[1][1]) * f, a[1][2] + (b[1][2] - a[1][2]) * f]; } return STOPS[STOPS.length - 1][1]; }
	function startMap(force) {
		var N = +$("dp-m-res").value, tmax = +$("dp-m-tmax").value, key = [N, tmax, P.m1, P.m2, P.l1, P.l2, P.g, P.c].join("|");
		if (!force && key === mapKey && map.ready) { paintMap(); return; } if (!force && key === mapKey && map.job) return;
		mapKey = key; mapDirty = false; var my = ++map.job; map.N = N; map.tmax = tmax; map.t = new Float32Array(N * N); map.row = 0; map.flips = 0; map.ready = false; map.h = tmax > 20 ? 0.01 : 0.005;
		map.canvas = document.createElement("canvas"); map.canvas.width = N; map.canvas.height = N; map.ctx = map.canvas.getContext("2d"); map.img = map.ctx.createImageData(N, N);
		var Pm = D.params({ m1: P.m1, m2: P.m2, l1: P.l1, l2: P.l2, g: P.g, c: P.c });
		$("dp-mbadge").textContent = "Calculating… 0%"; $("dp-mmax").textContent = "(top of scale " + tmax + " s)";
		function work() {
			if (my !== map.job) return; var t0 = performance.now(), N2 = map.N;
			while (map.row < N2 && performance.now() - t0 < 14) {
				var j = map.row, th2 = PI - (j + 0.5) * 2 * PI / N2;
				for (var i = 0; i < N2; i++) { var th1 = -PI + (i + 0.5) * 2 * PI / N2, t = D.flipTime(th1, th2, Pm, map.tmax, map.h); map.t[j * N2 + i] = isFinite(t) ? t : -1; if (isFinite(t)) map.flips++; var rgb = pix(t, map.tmax), o = 4 * (j * N2 + i); map.img.data[o] = rgb[0]; map.img.data[o + 1] = rgb[1]; map.img.data[o + 2] = rgb[2]; map.img.data[o + 3] = 255; }
				map.row++;
			}
			map.ctx.putImageData(map.img, 0, 0); paintMap(); $("dp-mbadge").textContent = map.row < N2 ? "Calculating… " + Math.round(100 * map.row / N2) + "%" : "";
			if (map.row < N2) setTimeout(work, 0); else { map.ready = true; $("dp-m-f").textContent = Math.round(100 * map.flips / (N2 * N2)) + "%"; $("dp-m-fs").textContent = map.flips + " of " + N2 * N2 + " starts flip within " + map.tmax + " s"; }
		}
		setTimeout(work, 0);
	}
	function pix(t, tmax) { if (!isFinite(t)) return [10, 15, 44]; var u = Math.log(Math.max(t, 0.05) / 0.05) / Math.log(tmax / 0.05); var c = colour(u * 0.92); return c; }
	function paintMap() {
		if (!map.canvas) return; var w = mcv.width, h = mcv.height; mcx.setTransform(1, 0, 0, 1, 0, 0); mcx.imageSmoothingEnabled = false; mcx.drawImage(map.canvas, 0, 0, w, h);
		/* marker for the current start */
		var x = (a1 * RAD + PI) / (2 * PI) * w, y = (PI - a2 * RAD) / (2 * PI) * h; mcx.strokeStyle = "#fff"; mcx.lineWidth = 2 * dpr; mcx.beginPath(); mcx.arc(x, y, 7 * dpr, 0, 7); mcx.stroke(); mcx.strokeStyle = "#000"; mcx.lineWidth = 1 * dpr; mcx.beginPath(); mcx.arc(x, y, 9.5 * dpr, 0, 7); mcx.stroke();
		/* axes ticks */
		mcx.fillStyle = "rgba(255,255,255,0.75)"; mcx.font = (11 * dpr) + "px sans-serif"; mcx.fillText("−180°", 6 * dpr, h - 6 * dpr); mcx.fillText("180°", w - 38 * dpr, h - 6 * dpr); mcx.fillText("upper angle →", w / 2 - 36 * dpr, h - 6 * dpr); mcx.fillText("180°", 6 * dpr, 14 * dpr); mcx.fillText("lower ↑", 6 * dpr, h / 2);
	}
	function mapPos(e) { var r = mcv.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height; return [Math.max(0, Math.min(1, fx)), Math.max(0, Math.min(1, fy))]; }
	mcv.addEventListener("pointermove", function (e) {
		if (!map.t) return; var p = mapPos(e), th1 = -180 + p[0] * 360, th2 = 180 - p[1] * 360, i = Math.min(map.N - 1, Math.floor(p[0] * map.N)), j = Math.min(map.N - 1, Math.floor(p[1] * map.N)), t = map.t[j * map.N + i];
		$("dp-m-p").textContent = th1.toFixed(0) + "°, " + th2.toFixed(0) + "°"; $("dp-m-t").textContent = j >= map.row && !map.ready ? "…" : t < 0 ? "never" : sig(t, 3) + " s"; $("dp-m-ts").textContent = t < 0 ? "does not flip within " + map.tmax + " s" : "click to watch it";
	});
	mcv.addEventListener("click", function (e) { var p = mapPos(e); a1 = Math.round((-180 + p[0] * 360) * 10) / 10; a2 = Math.round((180 - p[1] * 360) * 10) / 10; syncAngles(); seed(); sset({ a1: a1, a2: a2 }); setTab("sim"); });
	$("dp-m-res").onchange = function () { startMap(true); }; $("dp-m-tmax").onchange = function () { startMap(true); };
	$("dp-m-png").onclick = function () { paintMap(); mcv.toBlob(function (bl) { if (!bl) return; var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "double-pendulum-chaos-map.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }); };
	$("dp-m-link").onclick = function () { var u = new URL(location.href); u.search = ""; u.searchParams.set("tab", "map"); ["m1", "m2", "l1", "l2", "g", "c"].forEach(function (k) { u.searchParams.set(k, P[k]); }); u.searchParams.set("a1", a1.toFixed(2)); u.searchParams.set("a2", a2.toFixed(2)); copyLink(u.toString()); };

	/* =================== start =================== */
	if (saved.P) ["m1", "m2", "l1", "l2", "g", "c"].forEach(function (k) { P[k] = num(saved.P[k], 0, 100, P[k]); });
	a1 = num(saved.a1, -180, 180, a1); a2 = num(saved.a2, -180, 180, a2); ncop = Math.round(num(saved.ncop, 1, 60, ncop)); eps = num(saved.eps, -9, -1, eps); trailN = Math.round(num(saved.trailN, 0, 3, 2)); speedI = Math.round(num(saved.speedI, 0, 6, 4));
	if (saved.flags) ["trail", "arms", "chart"].forEach(function (k) { if (typeof saved.flags[k] === "boolean") flags[k] = saved.flags[k]; });
	if (q.get("a1") !== null) { a1 = num(q.get("a1"), -180, 180, a1); a2 = num(q.get("a2"), -180, 180, a2); ["m1", "m2", "l1", "l2", "g", "c"].forEach(function (k) { if (q.get(k) !== null) P[k] = num(q.get(k), 0, 100, P[k]); }); ncop = Math.round(num(q.get("n"), 1, 60, ncop)); eps = num(q.get("eps"), -9, -1, eps); }
	["m1", "m2", "l1", "l2", "g", "c"].forEach(function (k) { $("dp-" + k).value = P[k]; $("dp-" + k + "-v").textContent = k === "c" ? (+P[k]).toFixed(2) : String(Math.round(P[k] * 100) / 100); });
	$("dp-a1").value = a1; $("dp-a2").value = a2; $("dp-n").value = ncop; $("dp-e").value = eps; $("dp-tr").value = trailN; $("dp-tr-v").textContent = TRAIL_NAME[trailN]; $("dp-n-v").textContent = ncop; $("dp-e-v").textContent = "10^" + eps.toFixed(1); $("dp-a1-v").textContent = a1.toFixed(1); $("dp-a2-v").textContent = a2.toFixed(1); $("dp-spd-v").textContent = SPN[speedI];
	$("dp-o-trail").checked = flags.trail; $("dp-o-arms").checked = flags.arms; $("dp-o-chart").checked = flags.chart; $("dp-note").textContent = D.PRESETS[3].note; modesNote();
	seed(); setTab(tab); window.addEventListener("resize", onResize); if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage.parentNode); setTimeout(onResize, 0);
	requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
	window.__pend = { get copies() { return copies; }, get hist() { return hist; }, get P() { return P; }, seed: seed };
})();
