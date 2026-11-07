/* MES Stunt Jump Simulator: page UI (physics in lib.js, global MESGTA). Runs only on #gt[data-page="jump"].
   State: localStorage "mes-gta-stunt:v1"; links ?v=&k=&m=&r=&a=&h=&gp=&pd=&pt=&l=&la=&lh=&pl=&gr=&ac=&u= */
(function () {
	"use strict";
	var root = document.getElementById("gt"); if (!root || root.getAttribute("data-page") !== "jump" || !window.MESGTA) return;
	var M = window.MESGTA, KEY = "mes-gta-stunt:v1", RAD = Math.PI / 180, DT = 1 / 500;
	var $ = function (id) { return document.getElementById(id); };
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode */ } }
	function num(v, d) { var x = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) ? x : d; }
	function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
	function dark() { return document.body.classList.contains("dark-mode"); }

	/* ---------------- state ---------------- */
	var q = new URLSearchParams(location.search), sv = sget(), fromLink = q.has("v") || q.has("k") || q.has("r");
	function pick(k, d) { if (q.has(k)) return q.get(k); if (!fromLink && sv[k] != null) return sv[k]; return d; }
	var P0 = M.PRESETS[1];
	var S = {
		v: pick("v", P0.veh), k: num(pick("k", P0.kmh), P0.kmh), m: pick("m", "auto") === "drive" ? "drive" : "auto",
		r: pick("r", P0.c.ramp || "straight"), a: num(pick("a", P0.c.angle), 20), h: num(pick("h", P0.c.height), 2),
		gp: num(pick("gp", P0.c.gap), 20), pd: num(pick("pd", P0.c.pit || 0), 0), pt: pick("pt", P0.c.pitType || "ground") === "water" ? "water" : "ground",
		l: pick("l", P0.c.land || "ramp"), la: num(pick("la", P0.c.landAngle || 25), 25), lh: num(pick("lh", P0.c.landHeight || 4), 4), pl: num(pick("pl", P0.c.plat || 12), 12),
		gr: pick("gr", "earth"), ac: pick("ac", "0") === "1", u: pick("u", (navigator.language || "").toLowerCase() === "en-us" ? "i" : "m"),
		cam: sv.cam || "auto", slow: num(sv.slow, 1), color: sv.color || "", pre: fromLink ? "" : (sv.pre || P0.id)
	};
	if (!/^(none|straight|curved)$/.test(S.r)) S.r = "straight"; if (!/^(ramp|platform|flat)$/.test(S.l)) S.l = "ramp"; if (!/^(earth|moon|mars|jupiter)$/.test(S.gr)) S.gr = "earth";
	var GRAV = { earth: [9.80665, 1.2, "Earth"], moon: [1.62, 0, "Moon (no air)"], mars: [3.71, 0.02, "Mars"], jupiter: [24.79, 0.16, "Jupiter (if it had a floor)"] };
	function save() { var o = {}; "v k m r a h gp pd pt l la lh pl gr ac u cam slow color pre".split(" ").forEach(function (k) { o[k] = S[k]; }); sset(o); }
	function courseOpts() { return { ramp: S.r, angle: S.a, height: S.h, gap: S.gp, pit: S.pd, pitType: S.pt, land: S.l, landAngle: S.la, landHeight: S.lh, plat: S.pl }; }

	/* ---------------- units ---------------- */
	function spd(ms, d) { return S.u === "i" ? (ms / 0.44704).toFixed(d == null ? 0 : d) + " mph" : (ms * 3.6).toFixed(d == null ? 0 : d) + " km/h"; }
	function len(m, d) { if (!isFinite(m)) return "–"; return S.u === "i" ? (m / 0.3048).toFixed(d == null ? 0 : d) + " ft" : m.toFixed(d == null ? 1 : d) + " m"; }
	function kmhToUnit(k) { return S.u === "i" ? k / 1.609344 : k; }
	function unitToKmh(x) { return S.u === "i" ? x * 1.609344 : x; }

	/* ---------------- build controls ---------------- */
	var vehSel = $("gj-veh");
	M.VEHICLES.forEach(function (v) { var o = document.createElement("option"); o.value = v.id; o.textContent = v.name; vehSel.appendChild(o); });
	var preBox = $("gj-pre");
	M.PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "gj-chip"; b.textContent = p.name; b.setAttribute("data-pre", p.id); b.title = p.note; preBox.appendChild(b); });
	function topSpeed(v, g, rho) { var lo = 1, hi = 150; for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2, need = 0.5 * rho * v.cda * mid * mid * mid + 0.013 * v.m * g * mid; if (need < v.P * 1000) lo = mid; else hi = mid; } return lo; }

	/* seg buttons */
	function seg(id, key, after) {
		var box = $(id); if (!box) return;
		box.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; S[key] = b.getAttribute("data-v"); paintSeg(); S.pre = ""; after && after(); changed(); });
	}
	function paintSeg() {
		[["gj-mode", "m"], ["gj-ramp", "r"], ["gj-land", "l"], ["gj-units", "u"], ["gj-cam", "cam"]].forEach(function (p) {
			var box = $(p[0]); if (!box) return; Array.prototype.forEach.call(box.querySelectorAll("button[data-v]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S[p[1]] ? "true" : "false"); });
		});
	}
	/* slider + number pairs */
	var PAIRS = [ /* id, key, min, max, step, unit kind */
		["gj-spd", "k", 10, 260, 1, "spd"], ["gj-a", "a", 0, 50, 1, "deg"], ["gj-h", "h", 0.3, 15, 0.1, "len"], ["gj-gp", "gp", 0, 120, 0.5, "len"],
		["gj-pd", "pd", 0, 60, 0.5, "len"], ["gj-la", "la", 5, 50, 1, "deg"], ["gj-lh", "lh", -20, 20, 0.1, "len"], ["gj-pl", "pl", 3, 80, 0.5, "len"]
	];
	function toShown(kind, x) { return kind === "spd" ? kmhToUnit(x) : kind === "len" && S.u === "i" ? x / 0.3048 : x; }
	function fromShown(kind, x) { return kind === "spd" ? unitToKmh(x) : kind === "len" && S.u === "i" ? x * 0.3048 : x; }
	function unitLabel(kind) { return kind === "spd" ? (S.u === "i" ? "mph" : "km/h") : kind === "deg" ? "°" : S.u === "i" ? "ft" : "m"; }
	PAIRS.forEach(function (p) {
		var r = $(p[0] + "-r"), n = $(p[0] + "-n"); if (!r || !n) return;
		r.addEventListener("input", function () { S[p[1]] = fromShown(p[5], +r.value); n.value = fmtIn(p[5], +r.value); S.pre = ""; changed(true); });
		r.addEventListener("change", function () { changed(); });
		n.addEventListener("change", function () { var x = num(n.value, NaN); if (!isFinite(x)) { paintInputs(); return; } S[p[1]] = clamp(fromShown(p[5], x), p[2], p[3] * (p[5] === "spd" ? 1.6 : 1)); S.pre = ""; paintInputs(); changed(); });
	});
	function fmtIn(kind, x) { return kind === "deg" ? Math.round(x) : kind === "spd" ? Math.round(x) : (Math.round(x * 10) / 10); }
	function paintInputs() {
		vehSel.value = S.v;
		PAIRS.forEach(function (p) {
			var r = $(p[0] + "-r"), n = $(p[0] + "-n"), u = $(p[0] + "-u"); if (!r || !n) return;
			var lo = toShown(p[5], p[2]), hi = toShown(p[5], p[3]); r.min = lo; r.max = hi; r.step = p[5] === "len" && S.u === "i" ? 0.5 : p[4];
			var sh = toShown(p[5], S[p[1]]); r.value = clamp(sh, lo, hi); n.value = fmtIn(p[5], sh); if (u) u.textContent = unitLabel(p[5]);
		});
		$("gj-pt").value = S.pt; $("gj-gr").value = S.gr; $("gj-ac").checked = S.ac; $("gj-slow").value = String(S.slow);
		$("gj-rampf").hidden = S.r === "none"; $("gj-landf").hidden = S.l === "flat"; $("gj-laf").hidden = S.l !== "ramp"; $("gj-plf").hidden = S.l !== "platform";
		$("gj-ptf").hidden = S.pd <= 0;
		$("gj-spdl").textContent = S.m === "drive" ? "Top speed the cruise control would aim for (Drive mode ignores it)" : "Speed at the ramp";
		$("gj-spdf").classList.toggle("gj-dim", S.m === "drive");
		var v = M.vehicle(S.v), gg = GRAV[S.gr];
		$("gj-vinfo").textContent = v.m.toLocaleString() + " kg · " + v.P + " kW · wheelbase " + len(v.wb, 2) + " · suspension travel " + (S.u === "i" ? (v.trav / 0.0254).toFixed(1) + " in" : Math.round(v.trav * 100) + " cm") + " · top speed about " + spd(topSpeed(v, gg[0], gg[1] || 0.0001));
		Array.prototype.forEach.call(preBox.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-pre") === S.pre ? "true" : "false"); });
		paintSeg();
	}
	seg("gj-mode", "m", function () { reset(); }); seg("gj-ramp", "r"); seg("gj-land", "l");
	seg("gj-units", "u", function () { paintInputs(); paintRuns(); paintRo(); drawCharts(); });
	seg("gj-cam", "cam");
	vehSel.addEventListener("change", function () { S.v = vehSel.value; S.pre = ""; changed(); });
	$("gj-pt").addEventListener("change", function (e) { S.pt = e.target.value; S.pre = ""; changed(); });
	$("gj-gr").addEventListener("change", function (e) { S.gr = e.target.value; S.pre = ""; changed(); });
	$("gj-ac").addEventListener("change", function (e) { S.ac = e.target.checked; changed(); });
	$("gj-slow").addEventListener("change", function (e) { S.slow = +e.target.value; save(); });
	preBox.addEventListener("click", function (e) {
		var b = e.target.closest("button[data-pre]"); if (!b) return; var p = M.PRESETS.filter(function (x) { return x.id === b.getAttribute("data-pre"); })[0]; if (!p) return;
		loadPreset(p); paintInputs(); changed(); toast(p.note); go();
	});
	function loadPreset(p) {
		var c = p.c; S.pre = p.id; S.v = p.veh; S.k = p.kmh; S.m = "auto"; S.r = c.ramp; S.a = c.angle || 0; S.h = c.height || 0; S.gp = c.gap || 0; S.pd = c.pit || 0; S.pt = c.pitType || "ground"; S.l = c.land; S.la = c.landAngle || 25; S.lh = c.landHeight != null ? c.landHeight : 3; S.pl = c.plat || 12; S.gr = "earth";
	}
	var tTimer = 0;
	function toast(msg) { var t = $("gj-toast"); if (!t || !msg) return; t.textContent = msg; t.classList.add("is-on"); clearTimeout(tTimer); tTimer = setTimeout(function () { t.classList.remove("is-on"); }, 4200); }

	/* ---------------- simulation state ---------------- */
	var co, veh, sim = null, running = false, acc = 0, lastT = 0, replay = null, runs = [], best = null, ghost = null, sweepData = null, dirtyCourse = true;
	try { runs = JSON.parse(localStorage.getItem(KEY + ":runs") || "[]") || []; } catch (e) { runs = []; }
	function simOpts() { var gg = GRAV[S.gr]; return { mode: S.m, kmh: S.k, g: gg[0], rho: gg[1], airControl: S.ac, approach: 260 }; }
	function rebuild() { co = M.buildCourse(courseOpts()); veh = M.vehicle(S.v); dirtyCourse = false; }
	function reset() { rebuild(); sim = new M.Sim(co, veh, simOpts()); running = false; replay = null; acc = 0; $("gj-verdict").hidden = true; $("gj-badge").textContent = ""; scrubSetup(); paintRun(); camSnap = true; paintRo(); frame(); }
	function go() {
		if (running) { running = false; paintRun(); return; }
		if (!sim || sim.done || sim.t > 0 && replay) reset();
		replay = null; running = true; lastT = 0; paintRun(); $("gj-c").focus({ preventScroll: true }); loop();
	}
	var changeTimer = 0;
	function changed(live) {
		save(); paintInputs(); sweepData = null; paintSweep();
		if (!running) { rebuild(); sim = new M.Sim(co, veh, simOpts()); replay = null; camSnap = true; frame(); paintRo(); }
		else dirtyCourse = true;
		if (!live) writeUrl();
	}
	function writeUrl() {
		var p = new URLSearchParams(); p.set("v", S.v); p.set("k", Math.round(S.k)); if (S.m === "drive") p.set("m", "drive");
		p.set("r", S.r); if (S.r !== "none") { p.set("a", S.a); p.set("h", +S.h.toFixed(2)); } p.set("gp", +S.gp.toFixed(2));
		if (S.pd > 0) { p.set("pd", +S.pd.toFixed(2)); if (S.pt === "water") p.set("pt", "water"); }
		p.set("l", S.l); if (S.l !== "flat") p.set("lh", +S.lh.toFixed(2)); if (S.l === "ramp") p.set("la", S.la); if (S.l === "platform") p.set("pl", +S.pl.toFixed(2));
		if (S.gr !== "earth") p.set("gr", S.gr); if (S.ac) p.set("ac", "1");
		return location.origin + location.pathname + "?" + p.toString();
	}

	/* ---------------- loop ---------------- */
	var keys = { gas: 0, brake: 0, tl: 0, tr: 0 }, touch = { gas: 0, brake: 0, tl: 0, tr: 0 };
	function loop(ts) {
		if (!running) return;
		requestAnimationFrame(loop);
		if (ts == null) return;
		if (!lastT) { lastT = ts; return; }
		var real = Math.min(0.05, (ts - lastT) / 1000); lastT = ts; acc += real * S.slow;
		var inp = sim.input; inp.gas = Math.max(keys.gas, touch.gas); inp.brake = Math.max(keys.brake, touch.brake); inp.tilt = (Math.max(keys.tl, touch.tl) - Math.max(keys.tr, touch.tr));
		var n = 0; while (acc >= DT && n < 600 && !sim.done) { sim.step(DT); acc -= DT; n++; }
		if (sim.done) { running = false; finished(); }
		frame(); paintRo();
	}
	function finished() {
		var r = sim.result; r.track = sim.track; paintRun();
		var rec = { n: runs.length ? runs[runs.length - 1].n + 1 : 1, v: veh.name, k: S.k, code: r.code, title: r.title, to: r.takeoff ? r.takeoff.v : 0, ang: r.takeoff ? r.takeoff.ang / RAD : 0, air: r.air, dist: r.dist, h: r.maxH, g: r.landG, rot: r.rot / RAD, ok: r.ok };
		if (r.takeoff) { runs.push(rec); if (runs.length > 30) runs.shift(); try { localStorage.setItem(KEY + ":runs", JSON.stringify(runs)); } catch (e) { /* full */ } }
		if (r.ok && r.takeoff && (!best || r.landG < best.g || (best.code !== "clean" && r.code === "clean"))) { best = { g: r.landG, code: r.code }; ghost = { track: sim.track.slice(), key: courseKey() }; }
		showVerdict(r); paintRuns(); drawCharts(); scrubSetup();
	}
	function courseKey() { return JSON.stringify(courseOpts()) + S.v; }

	/* ---------------- verdict + readouts ---------------- */
	var VER = { clean: ["good", "🏆"], hard: ["warn", "💥"], brutal: ["bad", "🚑"], crash: ["bad", "💀"], short: ["bad", "⬇"], splash: ["bad", "🌊"], fell: ["bad", "⬇"], nojump: ["warn", "…"] };
	function showVerdict(r) {
		var box = $("gj-verdict"), v = VER[r.code] || ["warn", ""];
		box.className = "gj-verdict gj-verdict--" + v[0]; box.hidden = false;
		var tip = advice(r);
		box.innerHTML = "<b>" + v[1] + " " + esc(r.title) + "</b><span>" + esc(r.detail || "") + "</span>" + (tip ? "<em>" + esc(tip) + "</em>" : "");
		$("gj-badge").textContent = r.title;
	}
	function advice(r) {
		if (r.code === "short" || r.code === "splash" || r.code === "fell") return "Try more speed, or a steeper or higher takeoff ramp. Find the right speed below shows the window.";
		if (r.code === "crash" && Math.abs(r.rot) > 60 * RAD) return r.rot < 0 ? "It nose-dived. Press ↑ (gas) in the air to lift the nose: the spinning wheels turn the car the other way." : "It rotated backwards. Press ↓ (brake) in the air to drop the nose, or use a straight ramp instead of a curved one.";
		if (r.over) return "It flew past the landing. Try a little less speed.";
		if (r.code === "brutal" || r.code === "hard") return co.landKind === "ramp" ? "Land on the down slope, not on the flat after it: it turns the fall into rolling." : "Landing on flat ground is always hard. Add a landing ramp.";
		return "";
	}
	function ro(label, val, sub, cls) { return '<div class="gj-ro' + (cls ? " gj-ro--" + cls : "") + '"><span>' + label + "</span><b>" + val + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; }
	function paintRo() {
		if (!sim) return; var e = sim.ev, to = e.takeoff, r = sim.result, sp = Math.hypot(sim.vx, sim.vy);
		var gNow = sim.gNow, h = []; var air = sim.state === "air" ? sim.t - to.t : r ? r.air : 0;
		h.push(ro("Speed", spd(sp), sim.state === "approach" ? "on the approach" : sim.state === "air" ? "in the air" : "after landing"));
		h.push(ro("Takeoff", to ? spd(to.v) : "–", to ? "at " + (to.ang / RAD).toFixed(1) + "° up" : "leaves the lip"));
		h.push(ro("Airtime", air ? air.toFixed(2) + " s" : "–", ""));
		h.push(ro("Distance", r && r.takeoff ? len(r.dist) : to ? len(sim.x - co.lip.x) : "–", "from the lip"));
		h.push(ro("Height", to ? len(Math.max(0, e.maxH - co.lip.y)) : "–", "above the lip"));
		var lg = r ? r.landG : e.landPeakG; h.push(ro("Landing", lg ? lg.toFixed(1) + " g" : "–", "peak g-force felt", lg ? (lg < 5 ? "ok" : lg < 10 ? "warn" : "bad") : ""));
		h.push(ro("Now", gNow.toFixed(1) + " g", gNow < 0.15 ? "weightless" : "felt by the driver"));
		h.push(ro("Rotation", to ? ((sim.th - (sim.th0 != null ? sim.th0 : sim.th)) / RAD).toFixed(0) + "°" : "–", "pitch change in the air"));
		$("gj-ro").innerHTML = h.join("");
		$("gj-clock").textContent = "t = " + sim.t.toFixed(2) + " s" + (S.slow !== 1 ? " · " + (S.slow < 1 ? "slow motion " + S.slow + "×" : "fast " + S.slow + "×") : "");
		if (!r) $("gj-badge").textContent = sim.state === "approach" ? (running ? "Run-up…" : "Ready: press Go") : sim.state === "air" ? "Airborne " + air.toFixed(1) + " s" : "Touchdown";
	}
	function paintRun() {
		var b = $("gj-go"); b.textContent = running ? "⏸ Pause" : sim && sim.done ? "▶ Again" : sim && sim.t > 0 ? "▶ Resume" : "▶ Go";
		$("gj-touch").hidden = !(S.m === "drive" || (running && sim && sim.state === "air")); if (!running) $("gj-touch").hidden = S.m !== "drive";
		if (running) $("gj-verdict").hidden = true;
	}

	/* ---------------- drawing ---------------- */
	var cv = $("gj-c"), ctx = cv.getContext("2d"), dpr = 1, W = 800, H = 450, cam = { x: 0, y: 3, s: 12 }, camSnap = true, skyline = null, palms = null;
	function size() {
		var stage = $("gj-st"), wrap = stage.parentNode, w = wrap.clientWidth || 800, h = Math.round(w / (w < 560 ? 1.05 : w < 900 ? 1.6 : 2.1));
		wrap.setAttribute("data-mes-free", "1"); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill") || wrap.classList.contains("mes-fs")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		h = Math.max(260, h); stage.style.height = h + "px"; dpr = Math.min(2, window.devicePixelRatio || 1); W = w; H = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
		frame();
	}
	function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
	function makeScenery() {
		var r = rng(911), b = [], x = -2000; while (x < 3000) { var w = 12 + r() * 30, h = 15 + Math.pow(r(), 2) * 110; b.push([x, w, h, r() < 0.3]); x += w + r() * 6; } skyline = b;
		var r2 = rng(7), p = []; for (var px = -400; px < 900; px += 9 + r2() * 26) p.push([px, 7 + r2() * 6, r2() * 0.6 - 0.3, r2()]); palms = p;
	}
	function wx(x) { return (x - cam.x) * cam.s + W / 2; }
	function wy(y) { return H / 2 - (y - cam.y) * cam.s; }
	function frameBox() {
		var x0 = co.rampStart - 12, x1, top = Math.max(co.lip.y, S.l !== "flat" ? S.lh : 0) + 6, bot = Math.min(co.floor, 0) - 1.5;
		var gg = GRAV[S.gr][0], pr = M.dragFlight(Math.max(5, S.k / 3.6), co.lip.angle / RAD, co.lip.y, 0.5 * (GRAV[S.gr][1]) * veh.cda / veh.m, gg, false);
		x1 = isFinite(co.zone[1]) ? Math.max(co.zone[1], Math.min(pr.x, 400)) + 12 : Math.max(co.gap + 25, Math.min(pr.x, 400) + 20);
		top = Math.max(top, co.lip.y + pr.apex + 4);
		return { x0: x0, x1: x1, top: top, bot: bot };
	}
	function updateCam(pos) {
		var tx, ty, ts, fb = frameBox(), mode = S.cam, span = fb.x1 - fb.x0;
		/* keep the ground low in the picture (82 % down) unless the car climbs: then follow it up */
		function vert(s, carY) { var hm = H / s, cy = fb.bot + 0.32 * hm; if (carY != null) cy = Math.max(cy, carY - 0.25 * hm); return cy; }
		if (mode === "whole") { ts = Math.min(W / span, (H - 40) / (fb.top - fb.bot)); tx = (fb.x0 + fb.x1) / 2; ty = vert(ts, null); if (fb.top > ty + (H / ts) * 0.5 - 30 / ts) ty = (fb.top + fb.bot) / 2 + 10 / ts; }
		else if (mode === "follow") { ts = clamp(W / 32, 6, 50); tx = pos.x + 4; ty = vert(ts, pos.y); }
		else { /* auto: zoom to about 3/4 of the jump (never wider than 90 m), slide along with the car inside the jump area */
			var vw = clamp(span * 0.45, 24, 50); ts = Math.min(W / 22, Math.max(W / vw, (H - 60) / (fb.top - fb.bot + 8))); vw = W / ts;
			var lo = fb.x0 + vw / 2, hi = Math.max(lo, fb.x1 - vw / 2); if (pos.x + vw * 0.22 > hi && sim && sim.state === "landed") hi = pos.x + vw * 0.22; /* keep following it down the run-out */
			tx = clamp(pos.x + vw * 0.22, lo, hi); ty = vert(ts, pos.y);
		}
		if (camSnap) { cam.x = tx; cam.y = ty; cam.s = ts; camSnap = false; }
		else { var k = 0.1; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.s += (ts - cam.s) * k; }
	}
	function stateNow() {
		if (replay && replay.i != null) { var tr = replay.track[replay.i]; return { x: tr[1], y: tr[2], th: tr[3], sp: tr[4], g: tr[5], comp: [tr[6], tr[7]], ang: [tr[8], tr[9]], t: tr[0] }; }
		return { x: sim.x, y: sim.y, th: sim.th, sp: Math.hypot(sim.vx, sim.vy), g: sim.gNow, comp: [sim.ax[0].comp, sim.ax[1].comp], ang: [sim.ax[0].ang, sim.ax[1].ang], t: sim.t };
	}
	function frame() {
		if (!co || !sim) return; if (!skyline) makeScenery();
		var st = stateNow(); updateCam(st);
		var c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
		/* sky: sunset gradient (fixed colours: the canvas is not touched by the derived dark theme) */
		var sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#1b1446"); sky.addColorStop(0.45, "#7b2d7a"); sky.addColorStop(0.75, "#ef6a5b"); sky.addColorStop(1, "#ffb46b");
		if (S.gr === "moon") { sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#05060c"); sky.addColorStop(1, "#151827"); }
		else if (S.gr === "mars") { sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#3b2418"); sky.addColorStop(1, "#d08a5a"); }
		c.fillStyle = sky; c.fillRect(0, 0, W, H);
		var hz = wy(0);
		if (S.gr === "earth") {
			var sx = W * 0.72, sy = Math.min(H * 0.62, hz - 20); var sun = c.createRadialGradient(sx, sy, 2, sx, sy, Math.min(W, H) * 0.22); sun.addColorStop(0, "rgba(255,240,200,1)"); sun.addColorStop(0.18, "rgba(255,200,120,0.95)"); sun.addColorStop(1, "rgba(255,140,90,0)");
			c.fillStyle = sun; c.fillRect(0, 0, W, H);
			/* skyline, parallax 0.25 */
			c.fillStyle = "rgba(46,18,70,0.75)";
			skyline.forEach(function (b) { var X = (b[0] - cam.x * 0.25) * 1.2 + W / 2, bw = b[1] * 1.2, bh = b[2] * 1.2 * (H / 500); if (X + bw < 0 || X > W) return; c.fillRect(X, hz - bh * 0.9 + 6, bw, bh); if (b[3]) c.fillRect(X + bw * 0.45, hz - bh * 0.9 - 14 + 6, 2, 14); });
		} else if (S.gr === "moon") { c.fillStyle = "#c9d3ea"; c.beginPath(); c.arc(W * 0.78, H * 0.2, Math.min(W, H) * 0.06, 0, 7); c.fill(); c.fillStyle = "rgba(255,255,255,0.7)"; var rr = rng(3); for (var i = 0; i < 80; i++) c.fillRect(rr() * W, rr() * H * 0.6, 1.2, 1.2); }
		/* palms (world, behind the course) */
		if (S.gr === "earth") palms.forEach(function (p) { if (inPit(p[0])) return; drawPalm(c, p[0], M.groundAt(co, p[0]).y, p[1], p[2], p[3]); });
		/* water in the pit */
		if (co.water) { var w0 = wx(co.water.x0), w1 = wx(co.water.x1), wyy = wy(co.water.y); var wg = c.createLinearGradient(0, wyy, 0, H); wg.addColorStop(0, "#1fa2c7"); wg.addColorStop(1, "#08395a"); c.fillStyle = wg; c.fillRect(w0, wyy, w1 - w0, H - wyy + 2);
			c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5; c.beginPath(); for (var X = w0; X < w1; X += 6) { var Y = wyy + Math.sin(X * 0.08 + (sim ? sim.t * 3 : 0)) * 1.5; if (X === w0) c.moveTo(X, Y); else c.lineTo(X, Y); } c.stroke(); }
		/* ground */
		var pts = co.pts; c.beginPath(); c.moveTo(wx(pts[0][0]), H + 10); pts.forEach(function (p) { c.lineTo(wx(p[0]), wy(p[1])); }); c.lineTo(wx(pts[pts.length - 1][0]), H + 10); c.closePath();
		var gg = c.createLinearGradient(0, hz, 0, H); gg.addColorStop(0, S.gr === "moon" ? "#8b8f98" : S.gr === "mars" ? "#9b5634" : "#3a3346"); gg.addColorStop(1, S.gr === "moon" ? "#4a4d55" : S.gr === "mars" ? "#5a2c18" : "#1e1a26"); c.fillStyle = gg; c.fill();
		/* ramps as timber / steel structures */
		drawRamp(c, co.rampStart, 0.001, "#c9853f", "#7a4a1d");
		if (S.l === "ramp") drawRamp(c, co.zone[0] - 0.001, co.zone[1], "#c9853f", "#7a4a1d");
		if (S.l === "platform") drawBlock(c, co.zone[0], co.zone[1], S.lh);
		/* surface line + road marks */
		c.strokeStyle = S.gr === "earth" ? "#ffcf8a" : "#d5d8de"; c.lineWidth = 2; c.beginPath(); pts.forEach(function (p, i) { var X = wx(p[0]), Y = wy(p[1]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke();
		/* landing zone */
		if (co.hasGap && co.zone) { var z0 = co.zone[0], z1 = isFinite(co.zone[1]) ? co.zone[1] : co.zone[0] + 60; c.strokeStyle = "rgba(80,230,140,0.9)"; c.lineWidth = 5; c.beginPath(); var first = true; for (var zx = z0; zx <= z1; zx += 0.5) { var gy = M.groundAt(co, zx).y; if (first) { c.moveTo(wx(zx), wy(gy) - 2); first = false; } else c.lineTo(wx(zx), wy(gy) - 2); } c.stroke(); }
		/* distance marks from the lip */
		c.font = "11px system-ui,sans-serif"; c.textAlign = "center"; var step = cam.s > 12 ? 5 : cam.s > 5 ? 10 : 25;
		for (var dm = step; dm < 400; dm += step) { var gx = co.lip.x + dm, X2 = wx(gx); if (X2 < -20 || X2 > W + 20) continue; var gyy = M.groundAt(co, gx).y; c.fillStyle = "rgba(255,255,255,0.75)"; c.fillRect(X2 - 0.5, wy(gyy), 1, 8); c.fillText(S.u === "i" ? Math.round(dm / 0.3048) + " ft" : dm + " m", X2, wy(gyy) + 20); }
		/* ideal point-mass path */
		if (sim.state === "approach" && !replay) { var kd = 0.5 * GRAV[S.gr][1] * veh.cda / veh.m, path = M.dragFlight(Math.max(1, S.k / 3.6), co.lip.angle / RAD, co.lip.y - co.floor + 0, kd, GRAV[S.gr][0], true).path;
			c.setLineDash([3, 6]); c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1.5; c.beginPath(); path.forEach(function (p, i) { var X = wx(co.lip.x + p[0]), Y = wy(co.lip.y + p[1] + veh.hcg); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke(); c.setLineDash([]); }
		/* ghost of the best run */
		if (ghost && ghost.key === courseKey()) trail(c, ghost.track, ghost.track.length, "rgba(255,255,255,0.28)");
		/* trail of this run */
		var tr = replay ? replay.track : sim.track, upto = replay ? replay.i + 1 : tr.length; trail(c, tr, upto, null);
		/* markers */
		var e = sim.ev;
		if (e.takeoff && !replay) mark(c, e.takeoff.x, e.takeoff.y, "takeoff " + spd(e.takeoff.v), "below");
		if (e.apex && e.takeoff && !replay && sim.state !== "approach" && (e.apex.x - e.takeoff.x) * cam.s > 90) mark(c, e.apex.x, e.apex.y, "top: " + len(e.maxH - co.lip.y) + " above the lip", "above");
		if (e.land && e.land.x != null && !replay && sim.result) mark(c, e.land.x, e.land.y, len(sim.result.dist) + " jump", "below");
		/* the vehicle */
		drawVehicle(c, st);
		/* HUD */
		hud(c, st);
	}
	function inPit(x) { return x > co.rampStart - 2 && x < (isFinite(co.zone[1]) ? co.zone[1] + 3 : co.gap + 3); }
	function drawPalm(c, x, gy, h, lean, ph) {
		var X = wx(x), Y = wy(gy), s = cam.s; if (X < -60 || X > W + 60) return; var tx = X + lean * h * s, ty = Y - h * s;
		c.strokeStyle = "rgba(30,12,40,0.85)"; c.lineWidth = Math.max(1.5, 0.35 * s); c.beginPath(); c.moveTo(X, Y); c.quadraticCurveTo(X + lean * h * s * 0.2, Y - h * s * 0.6, tx, ty); c.stroke();
		c.fillStyle = "rgba(30,12,40,0.85)"; for (var i = 0; i < 7; i++) { var a = -Math.PI + i * Math.PI / 6 + (ph - 0.5) * 0.3, L = (2.6 + (i % 2) * 0.8) * s; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 0.6 * s, tx + Math.cos(a) * L, ty + Math.sin(a) * L * 0.4 + 0.9 * s); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 + 0.1 * s, tx, ty); c.fill(); }
	}
	function drawRamp(c, x0, x1, top, side) {
		var pts = co.pts.filter(function (p) { return p[0] >= x0 - 1e-6 && p[0] <= x1 + 1e-6; }); if (pts.length < 2) return;
		var base = Math.max(0, co.floor) === 0 ? 0 : co.floor, bx0 = pts[0][0], bx1 = pts[pts.length - 1][0];
		c.beginPath(); c.moveTo(wx(bx0), wy(base)); pts.forEach(function (p) { c.lineTo(wx(p[0]), wy(Math.max(p[1], base))); }); c.lineTo(wx(bx1), wy(base)); c.closePath();
		var g = c.createLinearGradient(0, wy(Math.max.apply(null, pts.map(function (p) { return p[1]; }))), 0, wy(base)); g.addColorStop(0, top); g.addColorStop(1, side); c.fillStyle = g; c.fill();
		c.save(); c.clip(); c.strokeStyle = "rgba(60,30,10,0.55)"; c.lineWidth = Math.max(1, cam.s * 0.08);
		var n = Math.max(2, Math.round((bx1 - bx0) / 1.6)); for (var i = 0; i <= n; i++) { var xx = bx0 + (bx1 - bx0) * i / n; c.beginPath(); c.moveTo(wx(xx), wy(base)); c.lineTo(wx(xx), wy(base + 60)); c.stroke(); }
		for (i = 0; i < n; i++) { var xa = bx0 + (bx1 - bx0) * i / n, xb = bx0 + (bx1 - bx0) * (i + 1) / n; c.beginPath(); c.moveTo(wx(xa), wy(base)); c.lineTo(wx(xb), wy(M.groundAt(co, xb).y)); c.stroke(); }
		c.restore();
	}
	function drawBlock(c, x0, x1, h) { var base = co.floor; c.fillStyle = "#3d3550"; c.fillRect(wx(x0), wy(h), wx(x1) - wx(x0), wy(base) - wy(h)); c.fillStyle = "rgba(255,210,140,0.35)"; for (var yy = h - 1.2; yy > base + 0.5; yy -= 3) for (var xx = x0 + 1; xx < x1 - 1; xx += 2.4) c.fillRect(wx(xx), wy(yy), Math.max(2, cam.s * 0.9), Math.max(2, cam.s * 1.1)); }
	function trail(c, tr, upto, col) {
		if (!tr || upto < 2) return; c.lineWidth = 2.5; c.lineCap = "round";
		for (var i = 1; i < upto; i++) { var a = tr[i - 1], b = tr[i]; if (a[10] > 0 && b[10] > 0 && !col) continue; c.strokeStyle = col || speedCol(b[4]); c.beginPath(); c.moveTo(wx(a[1]), wy(a[2])); c.lineTo(wx(b[1]), wy(b[2])); c.stroke(); }
	}
	function speedCol(v) { var t = clamp(v / 50, 0, 1); return "hsl(" + Math.round(190 - 190 * t) + ",95%,62%)"; }
	function mark(c, x, y, label, where) {
		var X = wx(x), Y = wy(y); if (X < -4 || X > W + 4 || Y < -4 || Y > H + 4) return; c.fillStyle = "#fff"; c.beginPath(); c.arc(X, Y, 3.5, 0, 7); c.fill(); if (!label) return;
		c.font = "600 12px system-ui,sans-serif"; c.textAlign = "left"; var w = c.measureText(label).width, bx = clamp(X - w / 2 - 5, 4, W - w - 14), by = where === "above" ? Y - 30 : Y + 12;
		c.fillStyle = "rgba(15,10,30,0.72)"; c.fillRect(bx, by, w + 10, 18); c.fillStyle = "#fff"; c.fillText(label, bx + 5, by + 13);
	}
	function bodyPt(st, bx, by) { var cs = Math.cos(st.th), sn = Math.sin(st.th); return [wx(st.x + bx * cs - by * sn), wy(st.y + bx * sn + by * cs)]; }
	function drawVehicle(c, st) {
		var v = veh, sh = sim.shape, col = S.color || v.color, cs = Math.cos(st.th), sn = Math.sin(st.th), dnx = sn, dny = -cs;
		/* shadow on the ground */
		var gy = M.groundAt(co, st.x).y, alt = st.y - gy; if (gy > -1e8) { c.fillStyle = "rgba(0,0,0," + clamp(0.35 - alt * 0.02, 0.05, 0.35) + ")"; c.beginPath(); c.ellipse(wx(st.x), wy(gy) - 1, v.len * 0.5 * cam.s * (1 + alt * 0.03), Math.max(1.5, 0.18 * cam.s), 0, 0, 7); c.fill(); }
		/* wheels */
		var wheels = sim.ax.map(function (A, i) { var att = [st.x + A.bx * cs - A.ya * sn, st.y + A.bx * sn + A.ya * cs], d = A.L0 - (st.comp[i] || 0); return { x: att[0] + dnx * d, y: att[1] + dny * d, ax: att, ang: st.ang[i] }; });
		/* suspension struts */
		c.strokeStyle = "#555"; c.lineWidth = Math.max(1, v.r * 0.18 * cam.s); wheels.forEach(function (w) { c.beginPath(); c.moveTo(wx(w.ax[0]), wy(w.ax[1])); c.lineTo(wx(w.x), wy(w.y)); c.stroke(); });
		if (v.bike) { drawBike(c, st, wheels, col); return; }
		/* body */
		c.beginPath(); sh.pts.forEach(function (p, i) { var q = bodyPt(st, p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath();
		var top = bodyPt(st, 0, v.ht - v.hcg), bot = bodyPt(st, 0, -v.hcg + sh.gc), grd = c.createLinearGradient(top[0], top[1], bot[0], bot[1]);
		grd.addColorStop(0, shade(col, 1.25)); grd.addColorStop(0.55, col); grd.addColorStop(1, shade(col, 0.55)); c.fillStyle = grd; c.fill();
		c.strokeStyle = "rgba(0,0,0,0.55)"; c.lineWidth = 1; c.stroke();
		/* windows: the upper part of the outline pulled in */
		var up = sh.pts.filter(function (p) { return p[1] > (v.ht - v.hcg) * 0.25 - 0.05 + (sh.gc - v.hcg) * 0.4; });
		if (up.length >= 3 && v.body !== "monster") { var cx = up.reduce(function (s, p) { return s + p[0]; }, 0) / up.length, cy = up.reduce(function (s, p) { return s + p[1]; }, 0) / up.length;
			c.beginPath(); up.forEach(function (p, i) { var q = bodyPt(st, cx + (p[0] - cx) * 0.78, cy + (p[1] - cy) * 0.72); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fillStyle = "rgba(25,30,60,0.78)"; c.fill(); }
		/* lights */
		var hl = sh.pts.reduce(function (b, p) { return p[0] > b[0] ? p : b; }), tl = sh.pts.reduce(function (b, p) { return p[0] < b[0] ? p : b; });
		var qh = bodyPt(st, hl[0] - 0.05, hl[1] + 0.12), qt = bodyPt(st, tl[0] + 0.05, tl[1] + 0.15); c.fillStyle = "#fff6c8"; c.beginPath(); c.arc(qh[0], qh[1], Math.max(1.5, 0.08 * cam.s), 0, 7); c.fill(); c.fillStyle = "#ff3b3b"; c.beginPath(); c.arc(qt[0], qt[1], Math.max(1.5, 0.07 * cam.s), 0, 7); c.fill();
		wheels.forEach(function (w) { drawWheel(c, w, v.r); });
	}
	function drawWheel(c, w, r) {
		var X = wx(w.x), Y = wy(w.y), R = r * cam.s; c.fillStyle = "#15151a"; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill(); c.fillStyle = "#9aa3ad"; c.beginPath(); c.arc(X, Y, R * 0.58, 0, 7); c.fill();
		c.strokeStyle = "#4b525a"; c.lineWidth = Math.max(1, R * 0.12); for (var i = 0; i < 5; i++) { var a = w.ang + i * 2 * Math.PI / 5; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * R * 0.55, Y - Math.sin(a) * R * 0.55); c.stroke(); }
		c.fillStyle = "#2b2f35"; c.beginPath(); c.arc(X, Y, R * 0.14, 0, 7); c.fill();
	}
	function drawBike(c, st, wheels, col) {
		var v = veh; wheels.forEach(function (w) { drawWheel(c, w, v.r); });
		function P(bx, by) { return bodyPt(st, bx, by); }
		var rear = sim.ax[0].bx, front = sim.ax[1].bx, low = -v.hcg + v.r * 1.1, seat = low + 0.35;
		c.lineCap = "round"; c.lineJoin = "round";
		/* frame + tank + fairing */
		c.fillStyle = col; c.beginPath(); var a = P(rear + 0.25, seat), b = P(front - 0.35, seat + 0.18), d = P(front - 0.05, seat - 0.05), e = P(front - 0.4, low), f = P(rear + 0.4, low - 0.02);
		[a, b, d, e, f].forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fill(); c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1; c.stroke();
		/* forks + swingarm */
		c.strokeStyle = "#c8ccd2"; c.lineWidth = Math.max(1.5, 0.06 * cam.s); var fw = wheels[1], rw = wheels[0], fk = P(front - 0.18, seat + 0.1), sw = P(rear + 0.45, low + 0.05);
		c.beginPath(); c.moveTo(fk[0], fk[1]); c.lineTo(wx(fw.x), wy(fw.y)); c.moveTo(sw[0], sw[1]); c.lineTo(wx(rw.x), wy(rw.y)); c.stroke();
		/* rider: leg, torso, arm, helmet */
		var hip = P(rear + 0.5, seat + 0.12), knee = P(front - 0.62, seat - 0.05), foot = P(rear + 0.62, low + 0.02), sho = P(front - 0.62, seat + 0.62), hand = P(front - 0.28, seat + 0.32), head = P(front - 0.52, seat + 0.86);
		c.strokeStyle = "#1d1f2e"; c.lineWidth = Math.max(2, 0.16 * cam.s); c.beginPath(); c.moveTo(foot[0], foot[1]); c.lineTo(knee[0], knee[1]); c.lineTo(hip[0], hip[1]); c.lineTo(sho[0], sho[1]); c.lineTo(hand[0], hand[1]); c.stroke();
		c.fillStyle = "#f4f4f8"; c.beginPath(); c.arc(head[0], head[1], Math.max(3, 0.15 * cam.s), 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(head[0], head[1], Math.max(3, 0.15 * cam.s), Math.PI * 0.9 - st.th, Math.PI * 1.9 - st.th); c.fill();
	}
	function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; function f(x) { return Math.round(clamp(k > 1 ? x + (255 - x) * (k - 1) : x * k, 0, 255)); } return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")"; }
	function hud(c, st) {
		var x = 12, y = H - 14; c.textAlign = "left"; c.fillStyle = "rgba(10,8,25,0.6)"; c.fillRect(x - 6, y - 40, 150, 48); c.fillStyle = "#fff"; c.font = "700 24px system-ui,sans-serif";
		var s = S.u === "i" ? st.sp / 0.44704 : st.sp * 3.6; c.fillText(Math.round(s), x, y - 12); c.font = "11px system-ui,sans-serif"; c.fillStyle = "#cfd3e6"; c.fillText(S.u === "i" ? "mph" : "km/h", x + c.measureText("000").width + 22, y - 12);
		/* g bar */
		var gv = clamp(st.g / 12, 0, 1); c.fillStyle = "rgba(255,255,255,0.15)"; c.fillRect(x, y - 4, 130, 6); c.fillStyle = st.g < 5 ? "#3ee08a" : st.g < 10 ? "#ffc145" : "#ff4d4d"; c.fillRect(x, y - 4, 130 * gv, 6); c.fillStyle = "#cfd3e6"; c.fillText(st.g.toFixed(1) + " g", x + 92, y - 12 + 0);
		if (S.m === "drive" && running) { c.textAlign = "right"; c.fillStyle = "rgba(255,255,255,0.75)"; c.fillText("↑ gas · ↓ brake" + (S.ac ? " · ←/→ tilt" : ""), W - 12, H - 12); }
	}

	/* ---------------- replay / scrub ---------------- */
	var scrub = $("gj-scrub");
	function scrubSetup() { if (!sim || !sim.track.length) { scrub.parentNode.hidden = true; return; } scrub.parentNode.hidden = false; scrub.max = sim.track.length - 1; scrub.value = sim.track.length - 1; }
	scrub.addEventListener("input", function () { running = false; replay = { track: sim.track, i: +scrub.value }; paintRun(); frame(); var tr = sim.track[+scrub.value]; $("gj-clock").textContent = "replay t = " + tr[0].toFixed(2) + " s"; });
	var replayTimer = 0;
	$("gj-replay").addEventListener("click", function () {
		if (!sim || !sim.track.length) return; running = false; var tr = sim.track, i0 = 0, t0 = performance.now();
		/* start a second before takeoff */
		if (sim.ev.takeoff) for (var i = 0; i < tr.length; i++) if (tr[i][0] >= sim.ev.takeoff.t - 0.8) { i0 = i; break; }
		replay = { track: tr, i: i0 }; cancelAnimationFrame(replayTimer);
		(function tick(now) { var t = tr[i0][0] + (now - t0) / 1000 * Math.min(S.slow, 1) * (S.slow >= 1 ? 0.35 : 1); var j = replay.i; while (j < tr.length - 1 && tr[j + 1][0] <= t) j++; replay.i = j; scrub.value = j; frame(); $("gj-clock").textContent = "replay t = " + tr[j][0].toFixed(2) + " s · slow motion"; if (j < tr.length - 1 && replay) replayTimer = requestAnimationFrame(tick); })(t0);
	});

	/* ---------------- runs table ---------------- */
	function paintRuns() {
		var tb = $("gj-runs"); if (!runs.length) { tb.innerHTML = '<tr><td colspan="8" class="gj-empty">Your jumps will be listed here.</td></tr>'; return; }
		tb.innerHTML = runs.slice().reverse().map(function (r) {
			var cl = r.code === "clean" ? "ok" : r.code === "hard" ? "warn" : "bad";
			return "<tr><td>" + r.n + "</td><td>" + esc(r.v) + "</td><td>" + spd(r.to) + "</td><td>" + (r.ang || 0).toFixed(0) + "°</td><td>" + (r.air || 0).toFixed(2) + " s</td><td>" + len(r.dist) + "</td><td>" + (r.g || 0).toFixed(1) + " g</td><td><span class=\"gj-tag gj-tag--" + cl + "\">" + esc(r.title) + "</span></td></tr>";
		}).join("");
	}
	$("gj-clear").addEventListener("click", function () { runs = []; try { localStorage.removeItem(KEY + ":runs"); } catch (e) { /* ignore */ } best = null; ghost = null; paintRuns(); frame(); });
	$("gj-csv").addEventListener("click", function () {
		var rows = [["run", "vehicle", "takeoff km/h", "takeoff angle", "airtime s", "distance m", "height m", "landing g", "rotation deg", "result"]].concat(runs.map(function (r) { return [r.n, r.v, (r.to * 3.6).toFixed(1), r.ang.toFixed(1), r.air.toFixed(2), r.dist.toFixed(2), r.h.toFixed(2), r.g.toFixed(2), r.rot.toFixed(0), r.title]; }));
		copy(rows.map(function (r) { return r.join("\t"); }).join("\n"), "Copied: paste it into a spreadsheet.");
	});
	function copy(text, msg) { (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg); }, function () { prompt("Copy this:", text); }); }
	$("gj-link").addEventListener("click", function () { copy(writeUrl(), "Link copied: it opens this exact jump."); });
	$("gj-png").addEventListener("click", function () { cv.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "stunt-jump.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }); });

	/* ---------------- speed sweep ---------------- */
	var sweepBusy = false;
	$("gj-sweep").addEventListener("click", function () {
		if (sweepBusy) return; sweepBusy = true; rebuild();
		var gg = GRAV[S.gr], top = topSpeed(veh, gg[0], gg[1] || 0.0001) * 3.6, kmax = Math.min(260, Math.max(60, top)), list = [], step = kmax > 160 ? 4 : 2, k;
		for (k = 10; k <= kmax; k += step) list.push(k);
		var out = [], i = 0, btn = $("gj-sweep"), opts = simOpts(), cKey = courseKey(); btn.disabled = true;
		(function chunk() {
			var t0 = performance.now();
			while (i < list.length && performance.now() - t0 < 30) { out.push(M.sweepOne(co, veh, opts, list[i])); i++; }
			btn.textContent = "Working… " + Math.round(i / list.length * 100) + "%";
			if (i < list.length) { setTimeout(chunk, 0); return; }
			sweepBusy = false; btn.disabled = false; btn.textContent = "↻ Find the right speed again"; sweepData = { list: out, key: cKey }; paintSweep(); drawSweep();
		})();
	});
	function windows(list, codes) { var w = [], cur = null; list.forEach(function (r) { var hit = codes.indexOf(r.code) >= 0 && !(r.over && codes.length === 1); if (hit) { if (!cur) { cur = [r.kmh, r.kmh]; w.push(cur); } else cur[1] = r.kmh; } else cur = null; }); return w; }
	function paintSweep() {
		var box = $("gj-sweeptxt"); if (!sweepData) { box.innerHTML = "Runs this exact jump at every speed (a few seconds) and shows where it lands and how hard."; $("gj-swwrap").hidden = true; return; }
		$("gj-swwrap").hidden = false;
		var cl = windows(sweepData.list, ["clean"]), ok = windows(sweepData.list, ["clean", "hard"]);
		function txt(w) { return w.map(function (a) { return a[0] === a[1] ? spd(a[0] / 3.6) : spd(a[0] / 3.6) + " to " + spd(a[1] / 3.6); }).join(", "); }
		var s = cl.length ? "<b>Clean landings: " + txt(cl) + ".</b> " : "<b>No clean landing at any speed.</b> ";
		s += ok.length ? "Survivable (clean or hard): " + txt(ok) + ". " : "";
		if (!ok.length) s += "Change the ramps: a landing ramp at about the takeoff angle and height gives the widest window.";
		s += " Click a dot to try that speed.";
		box.innerHTML = s;
	}
	var swHit = [];
	function chartCol() { var d = dark(); return { bg: d ? "#16181f" : "#ffffff", grid: d ? "#2c313c" : "#e6e9ee", text: d ? "#c9ced6" : "#4a5260", strong: d ? "#f1f3f6" : "#1f2530", zone: d ? "rgba(70,200,120,0.18)" : "rgba(40,170,90,0.14)" }; }
	var CODECOL = { clean: "#22b35a", hard: "#e6a21a", brutal: "#e2453c", crash: "#7a1fa2", short: "#5b6576", splash: "#1f8fd6", fell: "#5b6576", nojump: "#aab" };
	function prepC(c, aspect, minH) { var w = c.parentNode.clientWidth || 600, h = Math.max(minH, Math.round(w / aspect)); c.style.height = h + "px"; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); var x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); return { x: x, w: w, h: h }; }
	function drawSweep() {
		if (!sweepData) return; var c = $("gj-swc"), o = prepC(c, 2.4, 220), x = o.x, col = chartCol(), L = 52, R = 12, T = 12, B = 36, w = o.w - L - R, h = o.h - T - B;
		x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var list = sweepData.list, kmax = list[list.length - 1].kmh, dmax = 10;
		list.forEach(function (r) { if (r.code !== "nojump") dmax = Math.max(dmax, r.dist); }); if (isFinite(co.zone[1])) dmax = Math.max(dmax, co.zone[1] * 1.15); dmax = Math.min(dmax * 1.05, 500);
		function X(k) { return L + (k - 10) / (kmax - 10) * w; } function Y(d) { return T + h - clamp(d / dmax, 0, 1) * h; }
		if (co.hasGap) { var z1 = isFinite(co.zone[1]) ? co.zone[1] : dmax; x.fillStyle = col.zone; x.fillRect(L, Y(z1), w, Y(co.zone[0]) - Y(z1)); x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.textAlign = "right"; x.fillText("landing", L + w - 4, Y(co.zone[0]) - 4); }
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.lineWidth = 1;
		for (var i = 0; i <= 5; i++) { var gy = T + h * i / 5, gx = L + w * i / 5; x.beginPath(); x.moveTo(L, gy); x.lineTo(L + w, gy); x.moveTo(gx, T); x.lineTo(gx, T + h); x.stroke(); x.textAlign = "right"; x.fillText(len(dmax * (5 - i) / 5, 0).replace(" m", "").replace(" ft", ""), L - 5, gy + 4); x.textAlign = "center"; x.fillText(Math.round(kmhToUnit(10 + (kmax - 10) * i / 5)), gx, T + h + 15); }
		x.textAlign = "center"; x.fillText("speed at the ramp (" + (S.u === "i" ? "mph" : "km/h") + ")", L + w / 2, o.h - 4); x.save(); x.translate(12, T + h / 2); x.rotate(-Math.PI / 2); x.fillText("distance (" + (S.u === "i" ? "ft" : "m") + ")", 0, 0); x.restore();
		/* line + dots */
		x.strokeStyle = col.text; x.globalAlpha = 0.35; x.beginPath(); var first = true; list.forEach(function (r) { if (r.code === "nojump") return; if (first) { x.moveTo(X(r.kmh), Y(r.dist)); first = false; } else x.lineTo(X(r.kmh), Y(r.dist)); }); x.stroke(); x.globalAlpha = 1;
		swHit = [];
		list.forEach(function (r) { var px = X(r.kmh), py = Y(r.code === "nojump" ? 0 : r.dist); x.fillStyle = CODECOL[r.code] || "#888"; x.beginPath(); x.arc(px, py, 4.5, 0, 7); x.fill(); swHit.push([px, py, r]); });
		/* current speed */
		x.strokeStyle = col.strong; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(X(S.k), T); x.lineTo(X(S.k), T + h); x.stroke(); x.setLineDash([]);
		var lg = $("gj-swlg"); lg.innerHTML = ["clean", "hard", "brutal", "crash", "short", "splash"].filter(function (k) { return list.some(function (r) { return r.code === k; }); }).map(function (k) { return '<span><i style="background:' + CODECOL[k] + '"></i>' + { clean: "clean", hard: "hard", brutal: "brutal", crash: "crash", short: "short", splash: "splash" }[k] + "</span>"; }).join("");
	}
	$("gj-swc").addEventListener("click", function (e) {
		var r = this.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = 400;
		swHit.forEach(function (p) { var d = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my); if (d < bd) { bd = d; best = p[2]; } });
		if (best) { S.k = best.kmh; S.m = "auto"; S.pre = ""; changed(); drawSweep(); go(); }
	});
	$("gj-swc").addEventListener("mousemove", function (e) {
		var r = this.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = 300;
		swHit.forEach(function (p) { var d = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my); if (d < bd) { bd = d; best = p[2]; } });
		this.title = best ? spd(best.kmh / 3.6) + ": " + best.title + (best.code !== "nojump" && best.dist ? ", " + len(best.dist) : "") + (best.ok ? ", " + best.landG.toFixed(1) + " g" : "") : "";
	});

	/* ---------------- charts of the last run ---------------- */
	function drawCharts() {
		var tr = sim && sim.track, c1 = $("gj-ch1"), c2 = $("gj-ch2"); if (!c1 || !tr || tr.length < 2 || !sim.ev.takeoff) { $("gj-charts").hidden = true; return; }
		$("gj-charts").hidden = false; var col = chartCol();
		/* 1: path (height vs distance) with the ground */
		var o = prepC(c1, 2.2, 200), x = o.x, L = 48, R = 10, T = 10, B = 32, w = o.w - L - R, h = o.h - T - B; x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var x0 = co.rampStart - 5, x1 = Math.max(tr[tr.length - 1][1], co.lip.x + 10), ymin = Math.min(co.floor, 0) - 1, ymax = 1;
		tr.forEach(function (p) { if (p[1] >= x0 && p[1] <= x1) ymax = Math.max(ymax, p[2] + 1); });
		var sx = w / (x1 - x0), sy = h / (ymax - ymin), s = Math.min(sx, sy * 3); function X(v) { return L + (v - x0) * sx; } function Y(v) { return T + h - (v - ymin) * sy; }
		x.fillStyle = dark() ? "#2a2533" : "#e9e3f2"; x.beginPath(); x.moveTo(X(x0), T + h); for (var gx = x0; gx <= x1; gx += (x1 - x0) / 300) x.lineTo(X(gx), Y(Math.max(ymin, M.groundAt(co, gx).y))); x.lineTo(X(x1), T + h); x.closePath(); x.fill();
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; for (var i = 0; i <= 4; i++) { var yy = T + h * i / 4, vv = ymax - (ymax - ymin) * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + w, yy); x.stroke(); x.textAlign = "right"; x.fillText(len(vv, 0), L - 4, yy + 4); var xv = x0 + (x1 - x0) * i / 4; x.textAlign = "center"; x.fillText(len(xv - co.lip.x, 0), X(xv), T + h + 14); }
		x.textAlign = "center"; x.fillText("distance from the lip", L + w / 2, o.h - 3);
		if (ghost && ghost.key === courseKey()) { x.strokeStyle = col.text; x.globalAlpha = 0.35; x.setLineDash([4, 4]); x.beginPath(); ghost.track.forEach(function (p, i) { if (i) x.lineTo(X(p[1]), Y(p[2])); else x.moveTo(X(p[1]), Y(p[2])); }); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
		x.lineWidth = 2.5; for (i = 1; i < tr.length; i++) { if (tr[i][1] < x0) continue; x.strokeStyle = speedCol(tr[i][4]); x.beginPath(); x.moveTo(X(tr[i - 1][1]), Y(tr[i - 1][2])); x.lineTo(X(tr[i][1]), Y(tr[i][2])); x.stroke(); } x.lineWidth = 1;
		/* 2: g-force vs time */
		o = prepC(c2, 2.2, 200); x = o.x; w = o.w - L - R; h = o.h - T - B; x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var t0 = Math.max(0, sim.ev.takeoff.t - 1.2), t1 = tr[tr.length - 1][0], gmax = 6; tr.forEach(function (p) { if (p[0] >= t0) gmax = Math.max(gmax, p[5] * 1.1); }); gmax = Math.min(gmax, 80);
		function TX(t) { return L + (t - t0) / (t1 - t0 || 1) * w; } function GY(g) { return T + h - clamp(g / gmax, 0, 1) * h; }
		[[5, "rgba(230,162,26,0.12)"], [10, "rgba(226,69,60,0.12)"]].forEach(function (b, k) { var top = k ? gmax : 10; x.fillStyle = b[1]; x.fillRect(L, GY(top), w, GY(b[0]) - GY(top)); });
		x.strokeStyle = col.grid; x.fillStyle = col.text; for (i = 0; i <= 4; i++) { yy = T + h * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + w, yy); x.stroke(); x.textAlign = "right"; x.fillText((gmax * (4 - i) / 4).toFixed(0) + " g", L - 4, yy + 4); x.textAlign = "center"; x.fillText((t0 + (t1 - t0) * i / 4 - sim.ev.takeoff.t).toFixed(1) + " s", L + w * i / 4, T + h + 14); }
		x.textAlign = "center"; x.fillText("time from takeoff", L + w / 2, o.h - 3);
		x.strokeStyle = dark() ? "#ff9a6b" : "#c2185b"; x.lineWidth = 2; x.beginPath(); var f = true; tr.forEach(function (p) { if (p[0] < t0) return; if (f) { x.moveTo(TX(p[0]), GY(p[5])); f = false; } else x.lineTo(TX(p[0]), GY(p[5])); }); x.stroke(); x.lineWidth = 1;
		x.setLineDash([3, 3]); x.strokeStyle = col.text; x.beginPath(); x.moveTo(L, GY(1)); x.lineTo(L + w, GY(1)); x.stroke(); x.setLineDash([]); x.textAlign = "left"; x.fillText("1 g = sitting still", L + 4, GY(1) - 4);
	}

	/* ---------------- input ---------------- */
	function typing(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
	var KM = { ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", ArrowLeft: "tl", KeyA: "tl", ArrowRight: "tr", KeyD: "tr" };
	function inView() { var r = root.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
	document.addEventListener("keydown", function (e) {
		if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || !inView()) return;
		if (KM[e.code] && (running || document.activeElement === cv)) { keys[KM[e.code]] = 1; e.preventDefault(); return; }
		if (e.code === "Space" && document.activeElement === cv) { e.preventDefault(); go(); }
		else if (e.code === "KeyR" && (document.activeElement === cv || running)) { e.preventDefault(); reset(); }
	});
	document.addEventListener("keyup", function (e) { if (KM[e.code]) keys[KM[e.code]] = 0; });
	window.addEventListener("blur", function () { keys = { gas: 0, brake: 0, tl: 0, tr: 0 }; });
	Array.prototype.forEach.call(document.querySelectorAll("#gj-touch [data-k]"), function (b) {
		var k = b.getAttribute("data-k");
		function on(e) { e.preventDefault(); touch[k] = 1; b.classList.add("is-on"); } function off() { touch[k] = 0; b.classList.remove("is-on"); }
		b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
	});
	$("gj-go").addEventListener("click", go);
	$("gj-reset").addEventListener("click", reset);
	cv.addEventListener("click", function () { if (!running && (!sim || !sim.done)) go(); });
	cv.addEventListener("wheel", function (e) { if (!(e.ctrlKey || e.metaKey || document.querySelector(".mes-fill") || document.fullscreenElement)) return; e.preventDefault(); S.cam = "follow"; paintSeg(); }, { passive: false });
	$("gj-col").addEventListener("input", function (e) { S.color = e.target.value; save(); frame(); });

	/* ---------------- start ---------------- */
	if (S.pre && !fromLink) { var pp = M.PRESETS.filter(function (x) { return x.id === S.pre; })[0]; if (pp && !sv.k) loadPreset(pp); }
	$("gj-col").value = S.color || M.vehicle(S.v).color;
	paintInputs(); paintRuns(); reset(); paintSweep(); size();
	window.addEventListener("resize", size); if (window.ResizeObserver) new ResizeObserver(function () { size(); drawCharts(); drawSweep(); }).observe($("gj-st").parentNode);
	new MutationObserver(function () { drawCharts(); drawSweep(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	window.MESStunt = { S: S, go: go, reset: reset, get sim() { return sim; }, frame: frame, step: function (n) { for (var i = 0; i < (n || 1); i++) if (!sim.done) sim.step(DT); if (sim.done && !sim._f) { sim._f = 1; finished(); } frame(); paintRo(); } };
})();
