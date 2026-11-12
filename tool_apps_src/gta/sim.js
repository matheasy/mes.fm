/* MES Stunt Jump Simulator: page UI (physics in lib.js = MESGTA, 3D renderer in sim3d.js = GJ3D). Runs only on #gt[data-page="jump"].
   Layout: #gj-app holds the stage + readouts + the options drawer. Fill window = .is-fill (fixed, z-index max, ads hidden), native full screen
   adds .is-fs; in both the options card (#gj-panel) moves into the drawer and the readouts float over the bottom of the picture.
   In the picture: a quick bar (vehicle, speed, handles on/off) and, in 2D while stopped, drag handles on the ramps (height, angle, gap,
   landing height / slope, platform length, drop into the gap).
   State: localStorage "mes-gta-stunt:v1"; links ?v=&k=&m=&r=&a=&h=&gp=&pd=&pt=&l=&la=&lh=&pl=&gr=&ac=&u=&view= */
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
	function r1(x) { return Math.round(x * 10) / 10; }
	function dark() { return document.body.classList.contains("dark-mode"); }
	var touchDev = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

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
		view: pick("view", "2d") === "3d" ? "3d" : "2d", cam2: sv.cam2 || "auto", cam3: sv.cam3 || "auto", ck: sv.ck || "full", slow: num(sv.slow, 1), color: sv.color || "", pre: fromLink ? "" : (sv.pre || P0.id),
		stats: sv.stats !== false, edit: sv.edit !== false
	};
	if (!M.VEHICLES.some(function (v) { return v.id === S.v; })) S.v = P0.veh;
	if (!/^(none|straight|curved)$/.test(S.r)) S.r = "straight"; if (!/^(ramp|platform|flat)$/.test(S.l)) S.l = "ramp"; if (!/^(earth|moon|mars|jupiter)$/.test(S.gr)) S.gr = "earth";
	if (!/^(auto|whole|follow)$/.test(S.cam2)) S.cam2 = "auto"; if (!/^(auto|chase|side|orbit|landing|driver)$/.test(S.cam3)) S.cam3 = "auto"; if (!/^(full|glass|off)$/.test(S.ck)) S.ck = "full";
	var GRAV = { earth: [9.80665, 1.2, "Earth"], moon: [1.62, 0, "Moon (no air)"], mars: [3.71, 0.02, "Mars"], jupiter: [24.79, 0.16, "Jupiter (if it had a floor)"] };
	function save() { var o = {}; "v k m r a h gp pd pt l la lh pl gr ac u view cam2 cam3 ck slow color pre stats edit".split(" ").forEach(function (k) { o[k] = S[k]; }); o.drawer = sv.drawer; sset(o); }
	function courseOpts() { return { ramp: S.r, angle: S.a, height: S.h, gap: S.gp, pit: S.pd, pitType: S.pt, land: S.l, landAngle: S.la, landHeight: S.lh, plat: S.pl }; }

	/* ---------------- units ---------------- */
	function spd(ms, d) { return S.u === "i" ? (ms / 0.44704).toFixed(d == null ? 0 : d) + " mph" : (ms * 3.6).toFixed(d == null ? 0 : d) + " km/h"; }
	function len(m, d) { if (!isFinite(m)) return "–"; return S.u === "i" ? (m / 0.3048).toFixed(d == null ? 0 : d) + " ft" : m.toFixed(d == null ? 1 : d) + " m"; }
	function kmhToUnit(k) { return S.u === "i" ? k / 1.609344 : k; }
	function unitToKmh(x) { return S.u === "i" ? x * 1.609344 : x; }

	/* ---------------- controls ---------------- */
	var vehSel = $("gj-veh"), qveh = $("gj-qveh");
	M.VEHICLES.forEach(function (v) { [vehSel, qveh].forEach(function (sel) { var o = document.createElement("option"); o.value = v.id; o.textContent = v.name; sel.appendChild(o); }); });
	["gj-pre", "gj-pre2"].forEach(function (id) { var box = $(id); M.PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "gj-chip"; b.textContent = p.name; b.setAttribute("data-pre", p.id); b.title = p.note; box.appendChild(b); }); });
	function topSpeed(v, g, rho) { var lo = 1, hi = 150; for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2, need = 0.5 * rho * v.cda * mid * mid * mid + 0.013 * v.m * g * mid; if (need < v.P * 1000) lo = mid; else hi = mid; } return lo; }
	function seg(id, key, after) {
		var box = $(id); if (!box) return;
		box.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; if (S[key] === b.getAttribute("data-v")) return; S[key] = b.getAttribute("data-v"); paintSeg(); if (key !== "u" && key !== "view") S.pre = ""; after && after(); if (key !== "view") changed(); else save(); });
	}
	function paintSeg() {
		[["gj-mode", "m"], ["gj-ramp", "r"], ["gj-land", "l"], ["gj-units", "u"], ["gj-view", "view"]].forEach(function (p) {
			var box = $(p[0]); if (!box) return; Array.prototype.forEach.call(box.querySelectorAll("button[data-v]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S[p[1]] ? "true" : "false"); });
		});
	}
	var PAIRS = [
		["gj-spd", "k", 10, 260, 1, "spd"], ["gj-a", "a", 0, 50, 1, "deg"], ["gj-h", "h", 0.3, 15, 0.1, "len"], ["gj-gp", "gp", 0, 120, 0.5, "len"],
		["gj-pd", "pd", 0, 60, 0.5, "len"], ["gj-la", "la", 5, 50, 1, "deg"], ["gj-lh", "lh", -20, 20, 0.1, "len"], ["gj-pl", "pl", 3, 80, 0.5, "len"]
	];
	function toShown(kind, x) { return kind === "spd" ? kmhToUnit(x) : kind === "len" && S.u === "i" ? x / 0.3048 : x; }
	function fromShown(kind, x) { return kind === "spd" ? unitToKmh(x) : kind === "len" && S.u === "i" ? x * 0.3048 : x; }
	function unitLabel(kind) { return kind === "spd" ? (S.u === "i" ? "mph" : "km/h") : kind === "deg" ? "°" : S.u === "i" ? "ft" : "m"; }
	function fmtIn(kind, x) { return kind === "deg" || kind === "spd" ? Math.round(x) : Math.round(x * 10) / 10; }
	PAIRS.forEach(function (p) {
		var r = $(p[0] + "-r"), n = $(p[0] + "-n"); if (!r || !n) return;
		r.addEventListener("input", function () { S[p[1]] = fromShown(p[5], +r.value); n.value = fmtIn(p[5], +r.value); S.pre = ""; changed(true); });
		r.addEventListener("change", function () { changed(); });
		n.addEventListener("change", function () { var x = num(n.value, NaN); if (!isFinite(x)) { paintInputs(); return; } S[p[1]] = clamp(fromShown(p[5], x), p[2], p[3] * (p[5] === "spd" ? 1.6 : 1)); S.pre = ""; paintInputs(); changed(); });
	});
	function paintInputs() {
		vehSel.value = S.v;
		PAIRS.forEach(function (p) {
			var r = $(p[0] + "-r"), n = $(p[0] + "-n"), u = $(p[0] + "-u"); if (!r || !n) return;
			var lo = toShown(p[5], p[2]), hi = toShown(p[5], p[3]); r.min = lo; r.max = hi; r.step = p[5] === "len" && S.u === "i" ? 0.5 : p[4];
			var sh = toShown(p[5], S[p[1]]); r.value = clamp(sh, lo, hi); if (document.activeElement !== n) n.value = fmtIn(p[5], sh); if (u) u.textContent = unitLabel(p[5]);
		});
		$("gj-pt").value = S.pt; $("gj-gr").value = S.gr; $("gj-ac").checked = S.ac; $("gj-slow").value = String(S.slow);
		$("gj-rampf").hidden = S.r === "none"; $("gj-landf").hidden = S.l === "flat"; $("gj-laf").hidden = S.l !== "ramp"; $("gj-plf").hidden = S.l !== "platform";
		$("gj-ptf").hidden = S.pd <= 0;
		$("gj-spdl").textContent = S.m === "drive" ? "Speed (Drive mode: you hold the gas instead)" : "Speed at the ramp";
		$("gj-spdf").classList.toggle("gj-dim", S.m === "drive");
		var v = M.vehicle(S.v), gg = GRAV[S.gr];
		$("gj-vinfo").textContent = v.m.toLocaleString() + " kg · " + v.P + " kW · wheelbase " + len(v.wb, 2) + " · suspension travel " + (S.u === "i" ? (v.trav / 0.0254).toFixed(1) + " in" : Math.round(v.trav * 100) + " cm") + " · top speed about " + spd(topSpeed(v, gg[0], gg[1] || 0.0001));
		Array.prototype.forEach.call(document.querySelectorAll("#gj-pre [data-pre], #gj-pre2 [data-pre]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-pre") === S.pre ? "true" : "false"); });
		paintSeg(); paintCamSel(); paintQuick();
	}
	/* quick bar in the picture: vehicle, speed, handles */
	function paintQuick() {
		qveh.value = S.v; var r = $("gj-qspd"); r.min = Math.round(kmhToUnit(10)); r.max = Math.round(kmhToUnit(260)); if (!qDragging) r.value = Math.round(kmhToUnit(S.k));
		$("gj-qspdv").textContent = S.m === "drive" ? "you drive" : spd(S.k / 3.6); $("gj-qspdf").classList.toggle("gj-dim", S.m === "drive"); r.disabled = S.m === "drive";
		$("gj-edit").setAttribute("aria-pressed", S.edit ? "true" : "false"); $("gj-edit").hidden = S.view !== "2d";
	}
	var qDragging = false;
	function setVehicle(id) { S.v = id; S.pre = ""; S.color = ""; $("gj-col").value = M.vehicle(S.v).color; changed(); }
	qveh.addEventListener("change", function () { setVehicle(qveh.value); });
	function cycleVeh(d) { var i = M.VEHICLES.findIndex(function (v) { return v.id === S.v; }); setVehicle(M.VEHICLES[(i + d + M.VEHICLES.length) % M.VEHICLES.length].id); toast(M.vehicle(S.v).name); }
	$("gj-qprev").addEventListener("click", function () { cycleVeh(-1); }); $("gj-qnext").addEventListener("click", function () { cycleVeh(1); });
	$("gj-qspd").addEventListener("input", function (e) { qDragging = true; S.k = unitToKmh(+e.target.value); S.pre = ""; changed(true); });
	$("gj-qspd").addEventListener("change", function () { qDragging = false; changed(); });
	$("gj-edit").addEventListener("click", function () { S.edit = !S.edit; save(); paintQuick(); frame(); toast(S.edit ? "Drag the white handles on the ramps to reshape the jump." : "Handles hidden."); });
	var CAMS = { "2d": [["auto", "Auto cam"], ["whole", "Whole jump"], ["follow", "Follow"]], "3d": [["auto", "Auto cam"], ["chase", "Chase"], ["side", "Side"], ["driver", "Driver's seat"], ["landing", "Landing"], ["orbit", "Orbit (drag)"]] };
	function paintCamSel() {
		var sel = $("gj-camsel"), list = CAMS[S.view], cur = S.view === "3d" ? S.cam3 : S.cam2;
		if (sel.getAttribute("data-for") !== S.view) { sel.innerHTML = list.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + "</option>"; }).join(""); sel.setAttribute("data-for", S.view); }
		sel.value = cur;
		var ckSel = $("gj-ck"); if (ckSel) { ckSel.value = S.ck; ckSel.parentNode.hidden = !(S.view === "3d" && S.cam3 === "driver"); ckSel.options[0].textContent = veh && veh.bike ? "Handlebars + gauge" : "Wheel + dashboard"; ckSel.options[1].textContent = "Windshield only"; ckSel.options[1].hidden = ckSel.options[1].disabled = !!(veh && veh.bike); if (veh && veh.bike && S.ck === "glass") ckSel.value = "off"; }
		var cr = $("gj-camreset"); if (cr) cr.hidden = !(S.view === "3d" && r3 && r3.free.on && S.cam3 !== "orbit");
	}
	$("gj-camsel").addEventListener("change", function (e) { if (S.view === "3d") { S.cam3 = e.target.value; if (r3) r3.resetFree(); } else S.cam2 = e.target.value; save(); paintCamSel(); camSnap = true; frame(); });
	$("gj-ck").addEventListener("change", function (e) { S.ck = e.target.value; save(); frame(); });
	seg("gj-mode", "m", function () { reset(); }); seg("gj-ramp", "r"); seg("gj-land", "l");
	seg("gj-units", "u", function () { paintInputs(); paintRuns(); paintRo(); drawCharts(); paintSweep(); drawSweep(); });
	seg("gj-view", "view", function () { setView(); });
	vehSel.addEventListener("change", function () { setVehicle(vehSel.value); });
	$("gj-pt").addEventListener("change", function (e) { S.pt = e.target.value; S.pre = ""; changed(); });
	$("gj-gr").addEventListener("change", function (e) { S.gr = e.target.value; S.pre = ""; changed(); });
	$("gj-ac").addEventListener("change", function (e) { S.ac = e.target.checked; changed(); });
	$("gj-slow").addEventListener("change", function (e) { S.slow = +e.target.value; save(); });
	function onPreset(e) {
		var b = e.target.closest("button[data-pre]"); if (!b) return; var p = M.PRESETS.filter(function (x) { return x.id === b.getAttribute("data-pre"); })[0]; if (!p) return;
		loadPreset(p); S.color = ""; $("gj-col").value = M.vehicle(S.v).color; paintInputs(); changed(); toast(p.note); if (isFill() && narrow()) openDrawer(false); go();
	}
	$("gj-pre").addEventListener("click", onPreset); $("gj-pre2").addEventListener("click", onPreset);
	function loadPreset(p) {
		var c = p.c; S.pre = p.id; S.v = p.veh; S.k = p.kmh; S.m = "auto"; S.r = c.ramp; S.a = c.angle || 0; S.h = c.height || 0; S.gp = c.gap || 0; S.pd = c.pit || 0; S.pt = c.pitType || "ground"; S.l = c.land; S.la = c.landAngle || 25; S.lh = c.landHeight != null ? c.landHeight : 3; S.pl = c.plat || 12; S.gr = "earth";
	}
	var tTimer = 0;
	function toast(msg) { var t = $("gj-toast"); if (!t || !msg) return; t.textContent = msg; t.classList.add("is-on"); clearTimeout(tTimer); tTimer = setTimeout(function () { t.classList.remove("is-on"); }, 4200); }

	/* ---------------- simulation ---------------- */
	var co, veh, sim = null, running = false, acc = 0, lastT = 0, replay = null, runs = [], best = null, ghost = null, sweepData = null;
	try { runs = JSON.parse(localStorage.getItem(KEY + ":runs") || "[]") || []; } catch (e) { runs = []; }
	function simOpts() { var gg = GRAV[S.gr]; return { mode: S.m, kmh: S.k, g: gg[0], rho: gg[1], airControl: S.ac, approach: 140 }; }
	function rebuild() { co = M.buildCourse(courseOpts()); veh = M.vehicle(S.v); if (r3) r3.setScene(co, veh, S.color || veh.color, GRAV[S.gr]); paintCamSel(); }
	function reset() { cancelAnimationFrame(replayTimer); rebuild(); sim = new M.Sim(co, veh, simOpts()); running = false; replay = null; acc = 0; $("gj-verdict").hidden = true; scrubSetup(); paintRun(); camSnap = true; paintRo(); frame(); }
	/* the centre tip shows until the first run (or ×), separately for Go and Drive-it-yourself; remembered */
	var hintSeen = {}; try { hintSeen = JSON.parse(localStorage.getItem(KEY + ":hints") || "{}") || {}; } catch (e) { hintSeen = {}; }
	function hintKey() { return S.m === "drive" ? "d" : "g"; }
	function hintDone() { if (hintSeen[hintKey()]) return; hintSeen[hintKey()] = 1; try { localStorage.setItem(KEY + ":hints", JSON.stringify(hintSeen)); } catch (e) { /* private mode */ } }
	function go() { hintDone();
		if (running) { running = false; paintRun(); return; }
		if (!sim || sim.done || replay) reset();
		if (touchDev && window.innerHeight < 520 && !isFill()) enterFill(); /* a phone held sideways: play in the whole window */
		replay = null; running = true; lastT = 0; paintRun(); try { cv.focus({ preventScroll: true }); } catch (e) { /* old browser */ } requestAnimationFrame(loop);
	}
	function changed(live) {
		save(); paintInputs(); sweepData = null; paintSweep();
		if (!running) { rebuild(); sim = new M.Sim(co, veh, simOpts()); replay = null; $("gj-verdict").hidden = true; scrubSetup(); if (!drag) camSnap = true; frame(); paintRo(); paintRun(); }
		if (!live) history.replaceState(null, "", writeUrl());
	}
	function writeUrl() {
		var p = new URLSearchParams(); p.set("v", S.v); p.set("k", Math.round(S.k)); if (S.m === "drive") p.set("m", "drive");
		p.set("r", S.r); if (S.r !== "none") { p.set("a", S.a); p.set("h", +S.h.toFixed(2)); } p.set("gp", +S.gp.toFixed(2));
		if (S.pd > 0) { p.set("pd", +S.pd.toFixed(2)); if (S.pt === "water") p.set("pt", "water"); }
		p.set("l", S.l); if (S.l !== "flat") p.set("lh", +S.lh.toFixed(2)); if (S.l === "ramp") p.set("la", S.la); if (S.l === "platform") p.set("pl", +S.pl.toFixed(2));
		if (S.gr !== "earth") p.set("gr", S.gr); if (S.ac) p.set("ac", "1"); if (S.view === "3d") p.set("view", "3d");
		return location.pathname + "?" + p.toString();
	}

	/* ---------------- loop ---------------- */
	var keys = { gas: 0, brake: 0, tl: 0, tr: 0 }, touch = { gas: 0, brake: 0, tl: 0, tr: 0 };
	function loop(ts) {
		if (!running) return;
		requestAnimationFrame(loop);
		if (!lastT) { lastT = ts; return; }
		var real = Math.min(0.05, (ts - lastT) / 1000); lastT = ts; acc += real * S.slow;
		var inp = sim.input; inp.gas = Math.max(keys.gas, touch.gas); inp.brake = Math.max(keys.brake, touch.brake); inp.tilt = (Math.max(keys.tl, touch.tl) - Math.max(keys.tr, touch.tr));
		var n = 0; while (acc >= DT && n < 600 && !sim.done) { sim.step(DT); acc -= DT; n++; }
		if (sim.done) { running = false; finished(); }
		frame(); paintRo(); paintTouch();
	}
	function finished() {
		var r = sim.result; paintRun();
		var rec = { n: runs.length ? runs[runs.length - 1].n + 1 : 1, v: veh.name, k: S.k, code: r.code, title: r.title, to: r.takeoff ? r.takeoff.v : 0, ang: r.takeoff ? r.takeoff.ang / RAD : 0, air: r.air, dist: r.dist, h: r.maxH, g: r.landG, rot: r.rot / RAD, ok: r.ok };
		if (r.takeoff) { runs.push(rec); if (runs.length > 30) runs.shift(); try { localStorage.setItem(KEY + ":runs", JSON.stringify(runs)); } catch (e) { /* full */ } }
		if (r.ok && r.takeoff && (!best || r.landG < best.g || (best.code !== "clean" && r.code === "clean"))) { best = { g: r.landG, code: r.code }; ghost = { track: sim.track.slice(), key: courseKey() }; }
		showVerdict(r); paintRuns(); drawCharts(); scrubSetup(); paintTouch(); frame();
	}
	function courseKey() { return JSON.stringify(courseOpts()) + S.v; }

	/* ---------------- verdict + readouts ---------------- */
	var VER = { clean: ["good", "🏆"], hard: ["warn", "💥"], brutal: ["bad", "🚑"], crash: ["bad", "💀"], short: ["bad", "⬇"], splash: ["bad", "🌊"], fell: ["bad", "⬇"], nojump: ["warn", "…"] };
	var verdictTimer = 0;
	function showVerdict(r) {
		var box = $("gj-verdict"), v = VER[r.code] || ["warn", ""];
		box.className = "gj-verdict gj-verdict--" + v[0]; box.hidden = false;
		var tip = advice(r);
		box.innerHTML = "<b>" + v[1] + " " + esc(r.title) + "</b><span>" + esc(r.detail || "") + "</span>" + (tip ? "<em>" + esc(tip) + "</em>" : "") + '<button type="button" class="gj-vx" aria-label="Close">✕</button>';
		$("gj-badge").textContent = r.title;
		clearTimeout(verdictTimer); verdictTimer = setTimeout(function () { box.classList.add("gj-verdict--small"); }, 4500);
	}
	$("gj-verdict").addEventListener("click", function (e) { if (e.target.closest(".gj-vx")) this.hidden = true; else this.classList.toggle("gj-verdict--small"); });
	function advice(r) {
		if (r.code === "nojump") return S.m === "drive" ? "Hold Gas (↑) all the way up the ramp." : "Give it more speed.";
		if (r.code === "short" || r.code === "splash" || r.code === "fell") return "More speed, or a steeper or higher takeoff ramp. “Find the right speed” below shows the window.";
		if (r.code === "crash" && Math.abs(r.rot) > 60 * RAD) return r.rot < 0 ? "It nose-dived. Hold Gas (↑) in the air to lift the nose: the spinning wheels turn the car the other way." : "It rotated backwards. Brake (↓) in the air drops the nose; a straight ramp helps too.";
		if (r.over) return "It flew past the landing. Try a little less speed.";
		if (r.code === "brutal" || r.code === "hard") return co.landKind === "ramp" ? "Land on the down slope, not the flat after it: the slope turns the fall into rolling." : "Landing on flat ground is always hard. Add a landing ramp.";
		return "";
	}
	function ro(label, val, sub, cls) { return '<div class="gj-ro' + (cls ? " gj-ro--" + cls : "") + '"><span>' + label + "</span><b>" + val + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; }
	function paintRo() {
		if (!sim) return; var e = sim.ev, to = e.takeoff, r = sim.result, sp = Math.hypot(sim.vx, sim.vy), h = [];
		var air = sim.state === "air" ? sim.t - to.t : e.land && e.land.air ? e.land.air : 0;
		h.push(ro("Speed", spd(sp), sim.state === "approach" ? "on the run-up" : sim.state === "air" ? "in the air" : "after landing"));
		h.push(ro("Takeoff", to ? spd(to.v) : "–", to ? "at " + (to.ang / RAD).toFixed(1) + "° up" : "leaves the lip"));
		h.push(ro("Airtime", air ? air.toFixed(2) + " s" : "–", ""));
		h.push(ro("Distance", r && r.takeoff ? len(r.dist) : e.land && e.land.x != null ? len(e.land.x - co.lip.x) : to ? len(sim.x - co.lip.x) : "–", "from the lip"));
		h.push(ro("Height", to ? len(Math.max(0, e.maxH - co.lip.y)) : "–", "above the lip"));
		var lg = r ? r.landG : e.landPeakG; h.push(ro("Landing", lg ? lg.toFixed(1) + " g" : "–", "peak g-force", lg ? (lg < 6 ? "ok" : lg < 12 ? "warn" : "bad") : ""));
		h.push(ro("Rotation", to ? ((sim.th - (sim.th0 != null ? sim.th0 : sim.th)) / RAD).toFixed(0) + "°" : "–", "in the air"));
		$("gj-ro").innerHTML = h.join("");
		$("gj-clock").textContent = "t = " + sim.t.toFixed(2) + " s" + (S.slow !== 1 ? " · " + (S.slow < 1 ? "slow motion " + S.slow + "×" : S.slow + "×") : "");
		if (!r) $("gj-badge").textContent = sim.state === "approach" ? (running ? (S.m === "drive" ? "Driving: hold Gas" : "Run-up…") : "Ready") : sim.state === "air" ? "Airborne " + air.toFixed(1) + " s" : "Touchdown";
		hud(stateNow());
	}
	function paintRun() {
		var b = $("gj-go"); b.textContent = running ? "❚❚ Pause" : sim && sim.done ? "▶︎ Again" : sim && sim.t > 0 ? "▶︎ Resume" : (S.m === "drive" ? "▶︎ Start" : "▶︎ Go");
		var hint = $("gj-hint");
		if (!running && sim && sim.t === 0 && !hintSeen[hintKey()]) {
			hint.hidden = false;
			hint.innerHTML = S.m === "drive" ? "<b>Drive it yourself</b>Hold <kbd>Gas</kbd> or <kbd>↑</kbd> to drive at the ramp. <kbd>↓</kbd> brakes." + (S.ac ? " <kbd>←</kbd> <kbd>→</kbd> tilt in the air." : " In the air, gas lifts the nose and brake drops it.")
				: "<b>Press Go</b>" + (touchDev && window.innerHeight < 520 ? "It opens in the whole window. " : "") + (S.edit && S.view === "2d" ? "Drag the white handles to reshape the ramps." : "Pick an example or open ⚙︎ Options to build your own jump.");
			hint.insertAdjacentHTML("afterbegin", '<button type="button" class="gj-hintx" aria-label="Hide this tip" title="Hide this tip">×</button>');
		} else hint.hidden = true;
		$("gj-quick").classList.toggle("gj-quick--run", running);
		$("gj-replay").hidden = !(sim && sim.done && sim.track.length); /* nothing to replay before a run */
		paintTouch();
	}
	function paintTouch() {
		var show = S.m === "drive" || (running && sim && sim.state === "air" && touchDev);
		$("gj-touch").hidden = !show; $("gj-touch").classList.toggle("gj-touch--tilt", S.ac);
	}

	/* ---------------- fill window / full screen / drawer ---------------- */
	var app = $("gj-app"), drawer = $("gj-drawer"), panel = $("gj-panel"), ph = $("gj-ph");
	function isFill() { return app.classList.contains("is-fill"); }
	function narrow() { return window.innerWidth < 760; }
	function enterFill() {
		if (isFill()) return; app.classList.add("is-fill"); document.documentElement.classList.add("gj-fill-on"); document.body.classList.add("gj-filling");
		$("gj-dbody").appendChild(panel); openDrawer(!narrow() && sv.drawer === true); $("gj-fill").setAttribute("aria-pressed", "true"); $("gj-fill").title = "Back to the page (Esc)"; camSnap = true; setTimeout(size, 30);
		if (window.innerHeight < 500) { S.stats = false; paintStats(); }
	}
	function leaveFill() {
		if (!isFill()) return; if (document.fullscreenElement) { document.exitFullscreen().catch(function () { /* ignore */ }); }
		app.classList.remove("is-fill", "is-fs", "gj-drawer-open"); document.documentElement.classList.remove("gj-fill-on"); document.body.classList.remove("gj-filling");
		ph.parentNode.insertBefore(panel, ph.nextSibling); $("gj-fill").setAttribute("aria-pressed", "false"); $("gj-fill").title = "Fill the browser window (W)"; $("gj-opt").setAttribute("aria-expanded", "false"); S.stats = sv.stats !== false; paintStats(); camSnap = true; setTimeout(size, 30);
	}
	function openDrawer(on) { app.classList.toggle("gj-drawer-open", on); $("gj-opt").setAttribute("aria-expanded", on ? "true" : "false"); setTimeout(size, 260); }
	$("gj-fill").addEventListener("click", function () { if (isFill()) leaveFill(); else enterFill(); });
	$("gj-fs").addEventListener("click", function () {
		if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
		enterFill(); var req = app.requestFullscreen || app.webkitRequestFullscreen;
		if (req) { try { var pr = req.call(app); if (pr && pr.then) pr.then(function () { app.classList.add("is-fs"); if (screen.orientation && screen.orientation.lock && touchDev) screen.orientation.lock("landscape").catch(function () { /* not allowed */ }); size(); }).catch(function () { toast("Full screen is not available here, so the simulator fills the window instead. Turn the phone sideways for more room."); }); else app.classList.add("is-fs"); } catch (e) { /* fill only */ } }
		else toast("This browser has no full screen for web pages, so the simulator fills the window. Turn the phone sideways for more room.");
	});
	function fsChange() { if (!document.fullscreenElement && !document.webkitFullscreenElement) { var was = app.classList.contains("is-fs"); app.classList.remove("is-fs"); if (was) leaveFill(); } setTimeout(size, 50); } /* leaving native full screen (Esc, Back) goes back to the page */
	document.addEventListener("fullscreenchange", fsChange); document.addEventListener("webkitfullscreenchange", fsChange);
	$("gj-opt").addEventListener("click", function () {
		if (isFill()) { var on = !app.classList.contains("gj-drawer-open"); openDrawer(on); sv.drawer = on; save(); }
		else { panel.scrollIntoView({ behavior: "smooth", block: "start" }); }
	});
	$("gj-dclose").addEventListener("click", function () { openDrawer(false); sv.drawer = false; save(); });
	$("gj-statsb").addEventListener("click", function () { S.stats = !S.stats; paintStats(); if (!isFill() || window.innerHeight >= 500) save(); setTimeout(size, 20); });
	function paintStats() { app.classList.toggle("gj-nostats", !S.stats); $("gj-statsb").setAttribute("aria-pressed", S.stats ? "true" : "false"); }
	window.addEventListener("orientationchange", function () { setTimeout(size, 250); });

	/* ---------------- 2D / 3D ---------------- */
	var r3 = null, r3loading = false;
	function setView() {
		paintCamSel(); paintQuick(); var is3 = S.view === "3d";
		$("gj-3d").hidden = !is3; cv.style.visibility = is3 ? "hidden" : "visible";
		if (is3 && !r3 && !r3loading) {
			if (!window.GJ3D) { S.view = "2d"; paintSeg(); setView(); return; }
			r3loading = true; $("gj-load").hidden = false;
			window.GJ3D.create($("gj-3d")).then(function (r) { r3 = r; r3loading = false; r3.onFree = function () { paintCamSel(); }; $("gj-load").hidden = true; r3.setScene(co, veh, S.color || veh.color, GRAV[S.gr]); size(); camSnap = true; frame(); },
				function (err) { r3loading = false; $("gj-load").hidden = true; S.view = "2d"; paintSeg(); setView(); toast("3D could not start here (" + (err && err.message || "no WebGL") + "). Showing 2D."); });
		}
		paintRun(); size(); frame();
	}

	/* ---------------- 2D drawing ---------------- */
	var cv = $("gj-c"), ctx = cv.getContext("2d"), dpr = 1, W = 800, H = 450, cam = { x: 0, y: 3, s: 12 }, camSnap = true, skyline = null, palms = null;
	function size() {
		var stage = $("gj-st"), w, h;
		if (isFill()) { stage.style.height = ""; w = stage.clientWidth || window.innerWidth; h = stage.clientHeight || window.innerHeight; app.style.setProperty("--gj-bh", (document.querySelector(".gj-bar").offsetHeight + 8) + "px"); app.style.setProperty("--gj-ub", ($("gj-ro").offsetHeight + (scrub.parentNode.hidden ? 0 : scrub.parentNode.offsetHeight)) + "px"); }
		else { w = stage.parentNode.clientWidth || 800; h = Math.round(w / (w < 560 ? 1.15 : w < 900 ? 1.5 : 2.0)); h = Math.max(300, Math.min(h, Math.round(window.innerHeight * (w < 560 ? 0.62 : 0.78)))); stage.style.height = h + "px"; }
		dpr = Math.min(2, window.devicePixelRatio || 1); if (W !== w || H !== h) camSnap = true; W = w; H = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
		if (r3) r3.resize(w, h);
		frame();
	}
	function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
	function makeScenery() {
		var r = rng(911), b = [], x = -2000; while (x < 3000) { var w = 12 + r() * 30, h = 15 + Math.pow(r(), 2) * 110; b.push([x, w, h, r() < 0.3]); x += w + r() * 6; } skyline = b;
		var r2 = rng(7), p = []; for (var px = -400; px < 900; px += 9 + r2() * 26) p.push([px, 7 + r2() * 6, r2() * 0.6 - 0.3, r2()]); palms = p;
	}
	function wx(x) { return (x - cam.x) * cam.s + W / 2; }
	function wy(y) { return H / 2 - (y - cam.y) * cam.s; }
	/* how much of the picture the overlays cover at the top and bottom (measured, so the camera keeps the jump clear of them) */
	function overlayPads() {
		var st = $("gj-st").getBoundingClientRect(), top = 46, bot = 8;
		var bar = document.querySelector(".gj-bar"), br = bar && bar.getBoundingClientRect();
		if (br && br.height) { if (br.top - st.top < H * 0.45) top = br.bottom - st.top + 8; else { bot = Math.max(bot, st.bottom - br.top + 8); top = 56; } }
		var q = $("gj-quick"), qr = q && q.getBoundingClientRect();
		if (qr && qr.height && getComputedStyle(q).position !== "static" && qr.top < st.bottom && qr.bottom > st.top) { if (qr.top - st.top < H * 0.45) top = Math.max(top, qr.bottom - st.top + 8); else bot = Math.max(bot, st.bottom - qr.top + 8); }
		var u = document.querySelector(".gj-under"); if (isFill() && u && S.stats) { var ur = $("gj-ro").getBoundingClientRect(); if (ur.height) bot = Math.max(bot, st.bottom - ur.top + 8); }
		if (S.m === "drive") bot = Math.max(bot, 84);
		return [top, bot];
	}
	function topPad() { return overlayPads()[0]; }
	function botPad() { return overlayPads()[1]; }
	function frameBox() {
		var x0 = co.rampStart - 12, x1, top = Math.max(co.lip.y, S.l !== "flat" ? S.lh : 0) + 6, bot = Math.min(co.floor, 0) - 1.5;
		var gg = GRAV[S.gr][0], pr = M.dragFlight(Math.max(5, S.k / 3.6), co.lip.angle / RAD, co.lip.y, 0.5 * (GRAV[S.gr][1]) * veh.cda / veh.m, gg, false);
		x1 = isFinite(co.zone[1]) ? Math.max(co.zone[1], Math.min(pr.x, 400)) + 12 : Math.max(co.gap + 25, Math.min(pr.x, 400) + 20);
		top = Math.max(top, co.lip.y + pr.apex + 4);
		return { x0: x0, x1: x1, top: top, bot: bot };
	}
	function updateCam(pos) {
		if (drag) return; /* keep the picture still while a handle is dragged */
		var tx, ty, ts, fb = frameBox(), mode = S.cam2, span = fb.x1 - fb.x0, avail = H - topPad() - botPad();
		/* the ground sits just above the bottom bars; follow the car up when it climbs */
		function vert(s, carY) { var cy = fb.bot + (H / 2 - botPad()) / s; if (carY != null) cy = Math.max(cy, carY - (H / 2 - topPad() - 30) / s); return cy; }
		var pre = !running && sim && sim.t === 0 && !replay;
		if (pre && S.m !== "drive") { fb.x0 = Math.min(fb.x0, pos.x - 6); fb.x0 -= (fb.x1 - fb.x0) * 0.1; span = fb.x1 - fb.x0; } /* before the run: the whole jump and the car, so the handles can be dragged */
		var farOff = pos.x < fb.x0 + 4 && !(pre && S.m !== "drive");
		if (mode === "whole" && !farOff) { ts = Math.min(W / span, avail / (fb.top - fb.bot)); tx = (fb.x0 + fb.x1) / 2; ty = vert(ts, null); }
		else if (mode === "follow" || farOff) { ts = clamp(Math.min(W / 30, avail / 12), 6, 60); tx = pos.x + W / ts * 0.2; ty = vert(ts, pos.y); }
		else {
			var vw = clamp(span * 0.45, 24, 50); ts = Math.min(W / 22, Math.max(W / vw, avail / (fb.top - fb.bot + 6))); vw = W / ts;
			var lo = fb.x0 + vw / 2, hi = Math.max(lo, fb.x1 - vw / 2); if (pos.x + vw * 0.22 > hi && sim && sim.state === "landed") hi = pos.x + vw * 0.22;
			tx = clamp(pos.x + vw * 0.22, lo, hi); ty = vert(ts, pos.y);
			if (pre) { ts = Math.min(W / span, avail / (fb.top - fb.bot)); tx = (fb.x0 + fb.x1) / 2; ty = vert(ts, null); }
		}
		if (!(ts > 0.5)) ts = 0.5; /* a very short stage (toolbar taller than the picture) would give a negative scale */
		if (camSnap) { cam.x = tx; cam.y = ty; cam.s = ts; camSnap = false; }
		else { var k = 0.1; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.s += (ts - cam.s) * k; }
	}
	function stateNow() {
		if (replay && replay.i != null) { var tr = replay.track[replay.i]; return { x: tr[1], y: tr[2], th: tr[3], sp: tr[4], g: tr[5], comp: [tr[6], tr[7]], ang: [tr[8], tr[9]], t: tr[0], state: "replay" }; }
		return { x: sim.x, y: sim.y, th: sim.th, sp: Math.hypot(sim.vx, sim.vy), g: sim.gNow, comp: [sim.ax[0].comp, sim.ax[1].comp], ang: [sim.ax[0].ang, sim.ax[1].ang], t: sim.t, state: sim.state };
	}
	function frame() {
		if (!co || !sim) return; var st = stateNow();
		if (S.view === "3d" && r3) { r3.draw(st, { sim: sim, co: co, veh: veh, cam: S.cam3, cockpit: S.ck, mph: S.u === "i", snap: camSnap, running: running, track: replay ? replay.track.slice(0, replay.i + 1) : sim.track }); camSnap = false; return; }
		if (!skyline) makeScenery();
		updateCam(st);
		var c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
		var sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#1b1446"); sky.addColorStop(0.45, "#7b2d7a"); sky.addColorStop(0.75, "#ef6a5b"); sky.addColorStop(1, "#ffb46b");
		if (S.gr === "moon") { sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#05060c"); sky.addColorStop(1, "#151827"); }
		else if (S.gr === "mars") { sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#3b2418"); sky.addColorStop(1, "#d08a5a"); }
		c.fillStyle = sky; c.fillRect(0, 0, W, H);
		var hz = wy(0);
		if (S.gr === "earth" || S.gr === "jupiter") {
			var sx = W * 0.72, sy = Math.min(H * 0.62, hz - 20); var sun = c.createRadialGradient(sx, sy, 2, sx, sy, Math.min(W, H) * 0.22); sun.addColorStop(0, "rgba(255,240,200,1)"); sun.addColorStop(0.18, "rgba(255,200,120,0.95)"); sun.addColorStop(1, "rgba(255,140,90,0)");
			c.fillStyle = sun; c.fillRect(0, 0, W, H);
			c.fillStyle = "rgba(46,18,70,0.75)";
			skyline.forEach(function (b) { var X = (b[0] - cam.x * 0.25) * 1.2 + W / 2, bw = b[1] * 1.2, bh = b[2] * 1.2 * (H / 500); if (X + bw < 0 || X > W) return; c.fillRect(X, hz - bh * 0.9 + 6, bw, bh); if (b[3]) c.fillRect(X + bw * 0.45, hz - bh * 0.9 - 14 + 6, 2, 14); });
		} else if (S.gr === "moon") { c.fillStyle = "#c9d3ea"; c.beginPath(); c.arc(W * 0.78, H * 0.2, Math.min(W, H) * 0.06, 0, 7); c.fill(); c.fillStyle = "rgba(255,255,255,0.7)"; var rr = rng(3); for (var i = 0; i < 80; i++) c.fillRect(rr() * W, rr() * H * 0.6, 1.2, 1.2); }
		if (S.gr === "earth") palms.forEach(function (p) { if (inPit(p[0])) return; drawPalm(c, p[0], M.groundAt(co, p[0]).y, p[1], p[2], p[3]); });
		if (co.water) { var w0 = wx(co.water.x0), w1 = wx(co.water.x1), wyy = wy(co.water.y); var wg = c.createLinearGradient(0, wyy, 0, H); wg.addColorStop(0, "#1fa2c7"); wg.addColorStop(1, "#08395a"); c.fillStyle = wg; c.fillRect(w0, wyy, w1 - w0, H - wyy + 2);
			c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5; c.beginPath(); for (var X = w0; X < w1; X += 6) { var Y = wyy + Math.sin(X * 0.08 + st.t * 3) * 1.5; if (X === w0) c.moveTo(X, Y); else c.lineTo(X, Y); } c.stroke(); }
		var pts = co.pts; c.beginPath(); c.moveTo(wx(pts[0][0]), H + 10); pts.forEach(function (p) { c.lineTo(wx(p[0]), wy(p[1])); }); c.lineTo(wx(pts[pts.length - 1][0]), H + 10); c.closePath();
		var gg = c.createLinearGradient(0, hz, 0, H); gg.addColorStop(0, S.gr === "moon" ? "#8b8f98" : S.gr === "mars" ? "#9b5634" : "#3a3346"); gg.addColorStop(1, S.gr === "moon" ? "#4a4d55" : S.gr === "mars" ? "#5a2c18" : "#1e1a26"); c.fillStyle = gg; c.fill();
		drawRamp(c, co.rampStart, 0.001, "#c9853f", "#7a4a1d");
		if (S.l === "ramp") drawRamp(c, co.zone[0] - 0.001, co.zone[1], "#c9853f", "#7a4a1d");
		if (S.l === "platform") drawBlock(c, co.zone[0], co.zone[1], M.groundAt(co, co.zone[0] + 0.01).y);
		c.strokeStyle = S.gr === "earth" ? "#ffcf8a" : "#d5d8de"; c.lineWidth = 2; c.beginPath(); pts.forEach(function (p, i) { var X = wx(p[0]), Y = wy(p[1]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke();
		c.strokeStyle = "rgba(255,230,160,0.45)"; c.lineWidth = 2; for (var dxm = Math.floor((cam.x - W / cam.s) / 6) * 6; dxm < cam.x + W / cam.s; dxm += 6) { if (dxm > co.rampStart - 1) break; c.beginPath(); c.moveTo(wx(dxm), wy(0) + 5); c.lineTo(wx(dxm + 3), wy(0) + 5); c.stroke(); }
		if (co.hasGap && co.zone) { var z0 = co.zone[0], z1 = isFinite(co.zone[1]) ? co.zone[1] : co.zone[0] + 60; c.strokeStyle = "rgba(80,230,140,0.9)"; c.lineWidth = 5; c.beginPath(); var first = true; for (var zx = z0; zx <= z1; zx += 0.5) { var gy = M.groundAt(co, zx).y; if (first) { c.moveTo(wx(zx), wy(gy) - 2); first = false; } else c.lineTo(wx(zx), wy(gy) - 2); } c.stroke(); }
		c.font = "11px system-ui,sans-serif"; c.textAlign = "center"; var step = cam.s > 12 ? 5 : cam.s > 5 ? 10 : 25;
		for (var dm = step; dm < 400; dm += step) { var gx = co.lip.x + dm, X2 = wx(gx); if (X2 < -20 || X2 > W + 20) continue; var gyy = M.groundAt(co, gx).y; c.fillStyle = "rgba(255,255,255,0.75)"; c.fillRect(X2 - 0.5, wy(gyy), 1, 8); c.fillText(S.u === "i" ? Math.round(dm / 0.3048) + " ft" : dm + " m", X2, wy(gyy) + 20); }
		if (sim.state === "approach" && !replay && S.m !== "drive") { var kd = 0.5 * GRAV[S.gr][1] * veh.cda / veh.m, path = M.dragFlight(Math.max(1, S.k / 3.6), co.lip.angle / RAD, co.lip.y - co.floor, kd, GRAV[S.gr][0], true).path;
			c.setLineDash([3, 6]); c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1.5; c.beginPath(); path.forEach(function (p, i) { var X = wx(co.lip.x + p[0]), Y = wy(co.lip.y + p[1] + veh.hcg); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke(); c.setLineDash([]); }
		if (ghost && ghost.key === courseKey()) trail(c, ghost.track, ghost.track.length, "rgba(255,255,255,0.28)");
		var tr = replay ? replay.track : sim.track, upto = replay ? replay.i + 1 : tr.length; trail(c, tr, upto, null);
		var e = sim.ev;
		if (e.takeoff && !replay) mark(c, e.takeoff.x, e.takeoff.y, "takeoff " + spd(e.takeoff.v), "below");
		if (e.apex && e.takeoff && !replay && sim.state !== "approach" && (e.apex.x - e.takeoff.x) * cam.s > 90) mark(c, e.apex.x, e.apex.y, "top: " + len(e.maxH - co.lip.y) + " above the lip", "above");
		if (e.land && e.land.x != null && !replay && sim.result) mark(c, e.land.x, e.land.y, len(sim.result.dist) + " jump", "below");
		drawVehicle(c, st);
		drawHandles(c);
	}
	function inPit(x) { return x > co.rampStart - 2 && x < (isFinite(co.zone[1]) ? co.zone[1] + 3 : co.gap + 3); }
	function drawPalm(c, x, gy, h, lean, ph) {
		var X = wx(x), Y = wy(gy), s = cam.s; if (X < -60 || X > W + 60) return; var tx = X + lean * h * s, ty = Y - h * s;
		c.strokeStyle = "rgba(30,12,40,0.85)"; c.lineWidth = Math.max(1.5, 0.35 * s); c.beginPath(); c.moveTo(X, Y); c.quadraticCurveTo(X + lean * h * s * 0.2, Y - h * s * 0.6, tx, ty); c.stroke();
		c.fillStyle = "rgba(30,12,40,0.85)"; for (var i = 0; i < 7; i++) { var a = -Math.PI + i * Math.PI / 6 + (ph - 0.5) * 0.3, L = (2.6 + (i % 2) * 0.8) * s; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 0.6 * s, tx + Math.cos(a) * L, ty + Math.sin(a) * L * 0.4 + 0.9 * s); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 + 0.1 * s, tx, ty); c.fill(); }
	}
	function drawRamp(c, x0, x1, top, side) {
		var pts = co.pts.filter(function (p) { return p[0] >= x0 - 1e-6 && p[0] <= x1 + 1e-6; }); if (pts.length < 2) return;
		var base = 0, bx0 = pts[0][0], bx1 = pts[pts.length - 1][0];
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
	/* AI-made side views (Gemini, 2026-11-11) for the car bodies: mes.fm/gta-stunt-jump-simulator/img/cars/<body>.png, facing +x.
	   [w, h, rear wheel x, front wheel x, wheel centre y, wheel radius] in image pixels; the wheels stay code-drawn (they spin and ride the suspension).
	   A picked colour re-tints the picture ("color" blend keeps its shading). Falls back to the drawn outline until the picture loads. */
	var SPR = {"hatch":[298,109,51,236,84,24],"coupe":[311,98,59.5,248.5,73,24],"super":[320,87,57.5,245,61.5,24.5],"muscle":[319,102,69,256.5,76.5,24.5],"suv":[312,129,68,255.5,103,25],"pickup":[315,138,71.5,259,105,32],"monster":[306,185,65,252,133,51]}, sprImg = {}, sprTint = {};
	function sprite(body) {
		var m = SPR[body]; if (!m) return null; var im = sprImg[body];
		if (!im) { im = sprImg[body] = new Image(); im.onload = function () { if (!running) frame(); }; im.src = "/gta-stunt-jump-simulator/img/cars/" + body + ".png?v=1"; }
		return im.complete && im.naturalWidth ? { m: m, img: im } : null;
	}
	function tinted(body, im, col) {
		if (!col) return im; var key = body + col; if (sprTint[key]) return sprTint[key];
		var cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; var x = cv.getContext("2d");
		x.drawImage(im, 0, 0); x.globalCompositeOperation = "color"; x.fillStyle = col; x.fillRect(0, 0, cv.width, cv.height); x.globalCompositeOperation = "destination-in"; x.drawImage(im, 0, 0);
		return (sprTint[key] = cv);
	}
	function drawSprite(c, st, sp, wheels) {
		var v = veh, m = sp.m, s = cam.s, k = v.wb / (m[3] - m[2]), rs = m[5] * k, dy = rs - v.r, r0 = sim.ax[0].bx;
		var bx0 = r0 - m[2] * k, by0 = v.r - v.hcg + dy + m[4] * k;
		c.save(); c.translate(wx(st.x), wy(st.y)); c.rotate(-st.th);
		c.fillStyle = "#0b0b0e"; [m[2], m[3]].forEach(function (u) { c.beginPath(); c.arc((bx0 + u * k) * s, -(by0 - m[4] * k) * s, rs * 1.03 * s, 0, 7); c.fill(); });
		c.drawImage(tinted(v.body, sp.img, S.color && S.color !== v.color ? S.color : ""), bx0 * s, -by0 * s, m[0] * k * s, m[1] * k * s);
		c.restore();
		var up = [-Math.sin(st.th), Math.cos(st.th)];
		wheels.forEach(function (w) { drawWheel(c, { x: w.x + up[0] * dy, y: w.y + up[1] * dy, ang: w.ang }, rs); });
	}
	function drawVehicle(c, st) {
		var v = veh, sh = sim.shape, col = S.color || v.color, cs = Math.cos(st.th), sn = Math.sin(st.th), dnx = sn, dny = -cs;
		var gy = M.groundAt(co, st.x).y, alt = st.y - gy; if (gy > -1e8) { c.fillStyle = "rgba(0,0,0," + clamp(0.35 - alt * 0.02, 0.05, 0.35) + ")"; c.beginPath(); c.ellipse(wx(st.x), wy(gy) - 1, Math.max(0.1, v.len * 0.5 * cam.s * (1 + alt * 0.03)), Math.max(1.5, 0.18 * cam.s), 0, 0, 7); c.fill(); }
		var wheels = sim.ax.map(function (A, i) { var att = [st.x + A.bx * cs - A.ya * sn, st.y + A.bx * sn + A.ya * cs], d = A.L0 - (st.comp[i] || 0); return { x: att[0] + dnx * d, y: att[1] + dny * d, ax: att, ang: st.ang[i] }; });
		c.strokeStyle = "#555"; c.lineWidth = Math.max(1, v.r * 0.18 * cam.s); wheels.forEach(function (w) { c.beginPath(); c.moveTo(wx(w.ax[0]), wy(w.ax[1])); c.lineTo(wx(w.x), wy(w.y)); c.stroke(); });
		if (v.bike) { drawBike(c, st, wheels, col); return; }
		var sp = sprite(v.body); if (sp) { drawSprite(c, st, sp, wheels); return; }
		c.beginPath(); sh.pts.forEach(function (p, i) { var q = bodyPt(st, p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath();
		var top = bodyPt(st, 0, v.ht - v.hcg), bot = bodyPt(st, 0, -v.hcg + sh.gc), grd = c.createLinearGradient(top[0], top[1], bot[0], bot[1]);
		grd.addColorStop(0, shade(col, 1.25)); grd.addColorStop(0.55, col); grd.addColorStop(1, shade(col, 0.55)); c.fillStyle = grd; c.fill();
		c.strokeStyle = "rgba(0,0,0,0.55)"; c.lineWidth = 1; c.stroke();
		var win = windowPoly(v, sh);
		if (win) { c.beginPath(); win.forEach(function (p, i) { var q = bodyPt(st, p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fillStyle = "rgba(25,30,60,0.8)"; c.fill(); }
		var hl = sh.pts.reduce(function (b, p) { return p[0] > b[0] ? p : b; }), tl = sh.pts.reduce(function (b, p) { return p[0] < b[0] ? p : b; });
		var qh = bodyPt(st, hl[0] - 0.06, hl[1] + 0.1), qt = bodyPt(st, tl[0] + 0.05, tl[1] + 0.15); c.fillStyle = "#fff6c8"; c.beginPath(); c.arc(qh[0], qh[1], Math.max(1.5, 0.08 * cam.s), 0, 7); c.fill(); c.fillStyle = "#ff3b3b"; c.beginPath(); c.arc(qt[0], qt[1], Math.max(1.5, 0.07 * cam.s), 0, 7); c.fill();
		wheels.forEach(function (w) { drawWheel(c, w, v.r); });
	}
	/* the glass: the upper part of the outline pulled in towards its centre (the 3D model uses it too) */
	function windowPoly(v, sh) {
		if (v.body === "monster" || v.bike) return null;
		var cut = (sh.gc - v.hcg) + (v.ht - sh.gc) * 0.58, up = sh.pts.filter(function (p) { return p[1] > cut; });
		if (up.length < 3) return null; var cx = up.reduce(function (s, p) { return s + p[0]; }, 0) / up.length, cy = up.reduce(function (s, p) { return s + p[1]; }, 0) / up.length;
		return up.map(function (p) { return [cx + (p[0] - cx) * 0.82, cy + (p[1] - cy) * 0.7]; });
	}
	M.windowPoly = windowPoly;
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
		c.fillStyle = col; c.beginPath(); var a = P(rear + 0.25, seat), b = P(front - 0.35, seat + 0.18), d = P(front - 0.05, seat - 0.05), e = P(front - 0.4, low), f = P(rear + 0.4, low - 0.02);
		[a, b, d, e, f].forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fill(); c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1; c.stroke();
		c.strokeStyle = "#c8ccd2"; c.lineWidth = Math.max(1.5, 0.06 * cam.s); var fw = wheels[1], rw = wheels[0], fk = P(front - 0.18, seat + 0.1), sw = P(rear + 0.45, low + 0.05);
		c.beginPath(); c.moveTo(fk[0], fk[1]); c.lineTo(wx(fw.x), wy(fw.y)); c.moveTo(sw[0], sw[1]); c.lineTo(wx(rw.x), wy(rw.y)); c.stroke();
		var hip = P(rear + 0.5, seat + 0.12), knee = P(front - 0.62, seat - 0.05), foot = P(rear + 0.62, low + 0.02), sho = P(front - 0.62, seat + 0.62), hand = P(front - 0.28, seat + 0.32), head = P(front - 0.52, seat + 0.86);
		c.strokeStyle = "#1d1f2e"; c.lineWidth = Math.max(2, 0.16 * cam.s); c.beginPath(); c.moveTo(foot[0], foot[1]); c.lineTo(knee[0], knee[1]); c.lineTo(hip[0], hip[1]); c.lineTo(sho[0], sho[1]); c.lineTo(hand[0], hand[1]); c.stroke();
		c.fillStyle = "#f4f4f8"; c.beginPath(); c.arc(head[0], head[1], Math.max(3, 0.15 * cam.s), 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(head[0], head[1], Math.max(3, 0.15 * cam.s), Math.PI * 0.9 - st.th, Math.PI * 1.9 - st.th); c.fill();
	}
	function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; function f(x) { return Math.round(clamp(k > 1 ? x + (255 - x) * (k - 1) : x * k, 0, 255)); } return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")"; }
	M.shade = shade;
	function hud(st) {
		$("gj-hs").textContent = Math.round(S.u === "i" ? st.sp / 0.44704 : st.sp * 3.6); $("gj-hu").textContent = S.u === "i" ? "mph" : "km/h";
		var g = st.g; $("gj-hg").style.width = (clamp(g / 12, 0, 1) * 100).toFixed(1) + "%"; $("gj-hg").style.background = g < 6 ? "#3ee08a" : g < 12 ? "#ffc145" : "#ff4d4d"; $("gj-hgt").textContent = g.toFixed(1) + " g";
	}

	/* ---------------- drag handles on the ramps (2D, while stopped) ---------------- */
	var drag = null, hoverH = null, downAt = null;
	function editable() { return S.edit && S.view === "2d" && !running && !replay && sim && (sim.t === 0 || sim.done); }
	function landTop() { return M.groundAt(co, co.gap + 0.01).y; }
	function handles() {
		if (!editable()) return [];
		var hs = [];
		if (S.r !== "none") { hs.push({ id: "lip", x: 0, y: co.lip.y, ax: "v", tip: "Ramp height " + len(S.h) }); hs.push({ id: "rs", x: co.rampStart, y: 0, ax: "h", tip: "Ramp angle " + Math.round(S.a) + "°" }); }
		if (S.pd > 0 || S.l !== "flat") hs.push({ id: "gap", x: co.gap, y: S.l === "flat" ? 0 : landTop(), ax: S.l === "flat" ? "h" : "hv", tip: "Gap " + len(S.gp) + (S.l !== "flat" ? ", landing height " + len(S.lh) : "") });
		if (S.l === "ramp") hs.push({ id: "lend", x: co.zone[1], y: 0, ax: "h", tip: "Landing slope " + Math.round(S.la) + "°" });
		if (S.l === "platform") hs.push({ id: "pend", x: co.zone[1], y: landTop(), ax: "h", tip: "Platform length " + len(S.pl) });
		if (co.gap > 1.5) hs.push({ id: "pit", x: co.gap / 2, y: co.floor, ax: "v", tip: S.pd > 0 ? "Drop " + len(S.pd) : "Drag down to dig a drop" });
		var kept = [], room = touchDev ? 30 : 22; /* zoomed far out, handles would sit on top of each other: keep the first of a crowd */
		hs.forEach(function (h) { if (!kept.some(function (k) { return Math.hypot(wx(k.x) - wx(h.x), wy(k.y) - wy(h.y)) < room; })) kept.push(h); });
		return kept;
	}
	function drawHandles(c) {
		var hs = handles(); if (!hs.length) return;
		hs.forEach(function (h) {
			var X = wx(h.x), Y = wy(h.y), on = (drag && drag.h.id === h.id) || (hoverH && hoverH.id === h.id), R = touchDev ? 11 : 8;
			if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) return;
			c.save(); c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = 6;
			c.fillStyle = on ? "#ff4fa3" : "#fff"; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill(); c.restore();
			c.strokeStyle = on ? "#fff" : "#c2185b"; c.lineWidth = 2.5; c.beginPath(); c.arc(X, Y, R, 0, 7); c.stroke();
			/* arrows showing which way it moves */
			c.strokeStyle = on ? "#fff" : "#8e1145"; c.lineWidth = 1.8; c.beginPath();
			if (h.ax.indexOf("h") >= 0) { c.moveTo(X - R + 3, Y); c.lineTo(X + R - 3, Y); c.moveTo(X - R + 3, Y); c.lineTo(X - R + 6, Y - 3); c.moveTo(X - R + 3, Y); c.lineTo(X - R + 6, Y + 3); c.moveTo(X + R - 3, Y); c.lineTo(X + R - 6, Y - 3); c.moveTo(X + R - 3, Y); c.lineTo(X + R - 6, Y + 3); }
			if (h.ax.indexOf("v") >= 0) { c.moveTo(X, Y - R + 3); c.lineTo(X, Y + R - 3); c.moveTo(X, Y - R + 3); c.lineTo(X - 3, Y - R + 6); c.moveTo(X, Y - R + 3); c.lineTo(X + 3, Y - R + 6); c.moveTo(X, Y + R - 3); c.lineTo(X - 3, Y + R - 6); c.moveTo(X, Y + R - 3); c.lineTo(X + 3, Y + R - 6); }
			c.stroke();
			if (on) { c.font = "600 12px system-ui,sans-serif"; var w = c.measureText(h.tip).width, bx = clamp(X - w / 2 - 6, 4, W - w - 16), by = Y - R - 26; c.fillStyle = "rgba(15,10,30,0.85)"; c.fillRect(bx, by, w + 12, 20); c.fillStyle = "#fff"; c.textAlign = "left"; c.fillText(h.tip, bx + 6, by + 14); }
		});
	}
	function toWorld(e) { var r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top; return { sx: sx, sy: sy, x: (sx - W / 2) / cam.s + cam.x, y: cam.y - (sy - H / 2) / cam.s }; }
	function hitH(p) { var tol = touchDev ? 26 : 16, best = null, bd = tol * tol; handles().forEach(function (h) { var dx = wx(h.x) - p.sx, dy = wy(h.y) - p.sy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = h; } }); return best; }
	function applyDrag(id, p) {
		if (id === "lip") S.h = clamp(r1(p.y), 0.3, 15);
		else if (id === "rs") { var run = Math.max(0.4, -p.x); S.a = clamp(Math.round((S.r === "curved" ? 2 * Math.atan(S.h / run) : Math.atan(S.h / run)) / RAD), 3, 50); }
		else if (id === "gap") { S.gp = clamp(Math.round(p.x * 2) / 2, 0, 120); if (S.l !== "flat") S.lh = clamp(r1(p.y), S.l === "platform" ? Math.max(-20, -S.pd + 0.5) : 0.3, 20); }
		else if (id === "lend") S.la = clamp(Math.round(Math.atan(Math.max(0.3, landTop()) / Math.max(0.4, p.x - co.gap)) / RAD), 5, 50);
		else if (id === "pend") S.pl = clamp(Math.round(p.x - co.gap), 3, 80);
		else if (id === "pit") { S.pd = clamp(r1(-p.y), 0, 60); }
		S.pre = ""; changed(true);
	}
	cv.addEventListener("pointerdown", function (e) {
		var p = toWorld(e), h = hitH(p);
		if (h) { drag = { h: h }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } e.preventDefault(); $("gj-hint").hidden = true; frame(); return; }
		downAt = { x: e.clientX, y: e.clientY };
	});
	cv.addEventListener("pointermove", function (e) {
		var p = toWorld(e);
		if (drag) { applyDrag(drag.h.id, p); drag.h = handles().filter(function (x) { return x.id === drag.h.id; })[0] || drag.h; frame(); return; }
		var h = hitH(p); if ((h && h.id) !== (hoverH && hoverH.id)) { hoverH = h; cv.style.cursor = h ? (h.ax === "h" ? "ew-resize" : h.ax === "v" ? "ns-resize" : "move") : "pointer"; frame(); }
	});
	function endDrag(e) {
		if (drag) { drag = null; changed(); camSnap = true; frame(); return; }
		if (downAt && e && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8 && !running && (!sim || !sim.done) && !replay) go();
		downAt = null;
	}
	cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", function () { drag = null; downAt = null; });
	cv.addEventListener("pointerleave", function () { if (hoverH && !drag) { hoverH = null; frame(); } });
	/* touch: a finger on a handle must not scroll the page */
	cv.addEventListener("touchstart", function (e) { var t = e.touches[0]; if (t && hitH(toWorld(t))) e.preventDefault(); }, { passive: false });
	cv.addEventListener("touchmove", function (e) { if (drag) e.preventDefault(); }, { passive: false });

	/* ---------------- replay / scrub ---------------- */
	var scrub = $("gj-scrub"), replayTimer = 0;
	function scrubSetup() { if (!sim || !sim.done || !sim.track.length) { scrub.parentNode.hidden = true; return; } scrub.parentNode.hidden = false; scrub.max = sim.track.length - 1; scrub.value = sim.track.length - 1; }
	scrub.addEventListener("input", function () { running = false; cancelAnimationFrame(replayTimer); replay = { track: sim.track, i: +scrub.value }; paintRun(); frame(); hud(stateNow()); $("gj-clock").textContent = "replay t = " + sim.track[+scrub.value][0].toFixed(2) + " s"; });
	$("gj-replay").addEventListener("click", function () {
		if (!sim || !sim.track.length || !sim.done) { toast("Do a jump first, then replay it."); return; }
		running = false; $("gj-verdict").hidden = true; var tr = sim.track, i0 = 0, t0 = performance.now();
		if (sim.ev.takeoff) for (var i = 0; i < tr.length; i++) if (tr[i][0] >= sim.ev.takeoff.t - 1) { i0 = i; break; }
		replay = { track: tr, i: i0 }; cancelAnimationFrame(replayTimer); camSnap = true; var rate = S.slow < 1 ? S.slow : 0.35;
		(function tick(now) { if (!replay) return; var t = tr[i0][0] + (now - t0) / 1000 * rate; var j = replay.i; while (j < tr.length - 1 && tr[j + 1][0] <= t) j++; replay.i = j; scrub.value = j; frame(); hud(stateNow()); $("gj-clock").textContent = "replay t = " + tr[j][0].toFixed(2) + " s · slow motion"; if (j < tr.length - 1) replayTimer = requestAnimationFrame(tick); else showVerdict(sim.result); })(t0);
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
	$("gj-link").addEventListener("click", function () { copy(location.origin + writeUrl(), "Link copied: it opens this exact jump."); });
	$("gj-png").addEventListener("click", function () {
		var use3 = S.view === "3d" && r3, src = use3 ? r3.canvas() : cv; if (use3) frame();
		src.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "stunt-jump.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); });
	});

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
		if (!sweepData) return; var c = $("gj-swc"); if (!c.parentNode.clientWidth) return; var o = prepC(c, 2.4, 220), x = o.x, col = chartCol(), L = 52, R = 12, T = 12, B = 36, w = o.w - L - R, h = o.h - T - B;
		x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var list = sweepData.list, kmax = list[list.length - 1].kmh, dmax = 10;
		list.forEach(function (r) { if (r.code !== "nojump") dmax = Math.max(dmax, r.dist); }); if (isFinite(co.zone[1])) dmax = Math.max(dmax, co.zone[1] * 1.15); dmax = Math.min(dmax * 1.05, 500);
		function X(k) { return L + (k - 10) / (kmax - 10) * w; } function Y(d) { return T + h - clamp(d / dmax, 0, 1) * h; }
		if (co.hasGap) { var z1 = isFinite(co.zone[1]) ? co.zone[1] : dmax; x.fillStyle = col.zone; x.fillRect(L, Y(z1), w, Y(co.zone[0]) - Y(z1)); x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.textAlign = "right"; x.fillText("landing", L + w - 4, Y(co.zone[0]) - 4); }
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.lineWidth = 1;
		for (var i = 0; i <= 5; i++) { var gy = T + h * i / 5, gx = L + w * i / 5; x.beginPath(); x.moveTo(L, gy); x.lineTo(L + w, gy); x.moveTo(gx, T); x.lineTo(gx, T + h); x.stroke(); x.textAlign = "right"; x.fillText(len(dmax * (5 - i) / 5, 0).replace(" m", "").replace(" ft", ""), L - 5, gy + 4); x.textAlign = "center"; x.fillText(Math.round(kmhToUnit(10 + (kmax - 10) * i / 5)), gx, T + h + 15); }
		x.textAlign = "center"; x.fillText("speed at the ramp (" + (S.u === "i" ? "mph" : "km/h") + ")", L + w / 2, o.h - 4); x.save(); x.translate(12, T + h / 2); x.rotate(-Math.PI / 2); x.fillText("distance (" + (S.u === "i" ? "ft" : "m") + ")", 0, 0); x.restore();
		x.strokeStyle = col.text; x.globalAlpha = 0.35; x.beginPath(); var first = true; list.forEach(function (r) { if (r.code === "nojump") return; if (first) { x.moveTo(X(r.kmh), Y(r.dist)); first = false; } else x.lineTo(X(r.kmh), Y(r.dist)); }); x.stroke(); x.globalAlpha = 1;
		swHit = [];
		list.forEach(function (r) { var px = X(r.kmh), py = Y(r.code === "nojump" ? 0 : r.dist); x.fillStyle = CODECOL[r.code] || "#888"; x.beginPath(); x.arc(px, py, 4.5, 0, 7); x.fill(); swHit.push([px, py, r]); });
		x.strokeStyle = col.strong; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(X(S.k), T); x.lineTo(X(S.k), T + h); x.stroke(); x.setLineDash([]);
		$("gj-swlg").innerHTML = ["clean", "hard", "brutal", "crash", "short", "splash"].filter(function (k) { return list.some(function (r) { return r.code === k; }); }).map(function (k) { return '<span><i style="background:' + CODECOL[k] + '"></i>' + k + "</span>"; }).join("");
	}
	function swPick(e, tol) { var r = $("gj-swc").getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = tol; swHit.forEach(function (p) { var d = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my); if (d < bd) { bd = d; best = p[2]; } }); return best; }
	$("gj-swc").addEventListener("click", function (e) { var b = swPick(e, 500); if (b) { S.k = b.kmh; S.m = "auto"; S.pre = ""; changed(); drawSweep(); $("gj-st").scrollIntoView({ behavior: "smooth", block: "center" }); go(); } });
	$("gj-swc").addEventListener("mousemove", function (e) { var b = swPick(e, 300); this.title = b ? spd(b.kmh / 3.6) + ": " + b.title + (b.code !== "nojump" && b.dist ? ", " + len(b.dist) : "") + (b.ok ? ", " + b.landG.toFixed(1) + " g" : "") : ""; });

	/* ---------------- charts of the last run ---------------- */
	function drawCharts() {
		var tr = sim && sim.track, c1 = $("gj-ch1"), c2 = $("gj-ch2"); if (!c1 || !tr || tr.length < 2 || !sim.ev.takeoff || !sim.done) { $("gj-charts").hidden = true; return; }
		$("gj-charts").hidden = false; if (!c1.parentNode.clientWidth) return; var col = chartCol();
		var o = prepC(c1, 2.2, 200), x = o.x, L = 48, R = 10, T = 10, B = 32, w = o.w - L - R, h = o.h - T - B; x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var x0 = co.rampStart - 5, x1 = Math.max(tr[tr.length - 1][1], co.lip.x + 10), ymin = Math.min(co.floor, 0) - 1, ymax = 1;
		tr.forEach(function (p) { if (p[1] >= x0 && p[1] <= x1) ymax = Math.max(ymax, p[2] + 1); });
		var sx = w / (x1 - x0), sy = h / (ymax - ymin); function X(v) { return L + (v - x0) * sx; } function Y(v) { return T + h - (v - ymin) * sy; }
		x.fillStyle = dark() ? "#2a2533" : "#e9e3f2"; x.beginPath(); x.moveTo(X(x0), T + h); for (var gx = x0; gx <= x1; gx += (x1 - x0) / 300) x.lineTo(X(gx), Y(Math.max(ymin, M.groundAt(co, gx).y))); x.lineTo(X(x1), T + h); x.closePath(); x.fill();
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; for (var i = 0; i <= 4; i++) { var yy = T + h * i / 4, vv = ymax - (ymax - ymin) * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + w, yy); x.stroke(); x.textAlign = "right"; x.fillText(len(vv, 0), L - 4, yy + 4); var xv = x0 + (x1 - x0) * i / 4; x.textAlign = "center"; x.fillText(len(xv - co.lip.x, 0), X(xv), T + h + 14); }
		x.textAlign = "center"; x.fillText("distance from the lip", L + w / 2, o.h - 3);
		if (ghost && ghost.key === courseKey()) { x.strokeStyle = col.text; x.globalAlpha = 0.35; x.setLineDash([4, 4]); x.beginPath(); ghost.track.forEach(function (p, i) { if (i) x.lineTo(X(p[1]), Y(p[2])); else x.moveTo(X(p[1]), Y(p[2])); }); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
		x.lineWidth = 2.5; for (i = 1; i < tr.length; i++) { if (tr[i][1] < x0) continue; x.strokeStyle = speedCol(tr[i][4]); x.beginPath(); x.moveTo(X(tr[i - 1][1]), Y(tr[i - 1][2])); x.lineTo(X(tr[i][1]), Y(tr[i][2])); x.stroke(); } x.lineWidth = 1;
		o = prepC(c2, 2.2, 200); x = o.x; w = o.w - L - R; h = o.h - T - B; x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var t0 = Math.max(0, sim.ev.takeoff.t - 1.2), t1 = tr[tr.length - 1][0], gmax = 6; tr.forEach(function (p) { if (p[0] >= t0) gmax = Math.max(gmax, p[5] * 1.1); }); gmax = Math.min(gmax, 80);
		function TX(t) { return L + (t - t0) / (t1 - t0 || 1) * w; } function GY(g) { return T + h - clamp(g / gmax, 0, 1) * h; }
		[[6, "rgba(230,162,26,0.12)"], [12, "rgba(226,69,60,0.12)"]].forEach(function (b, k) { var top = k ? gmax : 12; if (b[0] >= gmax) return; x.fillStyle = b[1]; x.fillRect(L, GY(Math.min(top, gmax)), w, GY(b[0]) - GY(Math.min(top, gmax))); });
		x.strokeStyle = col.grid; x.fillStyle = col.text; for (i = 0; i <= 4; i++) { yy = T + h * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + w, yy); x.stroke(); x.textAlign = "right"; x.fillText((gmax * (4 - i) / 4).toFixed(0) + " g", L - 4, yy + 4); x.textAlign = "center"; x.fillText((t0 + (t1 - t0) * i / 4 - sim.ev.takeoff.t).toFixed(1) + " s", L + w * i / 4, T + h + 14); }
		x.textAlign = "center"; x.fillText("time from takeoff", L + w / 2, o.h - 3);
		x.strokeStyle = dark() ? "#ff9a6b" : "#c2185b"; x.lineWidth = 2; x.beginPath(); var f = true; tr.forEach(function (p) { if (p[0] < t0) return; if (f) { x.moveTo(TX(p[0]), GY(p[5])); f = false; } else x.lineTo(TX(p[0]), GY(p[5])); }); x.stroke(); x.lineWidth = 1;
		x.setLineDash([3, 3]); x.strokeStyle = col.text; x.beginPath(); x.moveTo(L, GY(1)); x.lineTo(L + w, GY(1)); x.stroke(); x.setLineDash([]); x.textAlign = "left"; x.fillText("1 g = sitting still", L + 4, GY(1) - 4);
	}

	/* ---------------- keyboard + touch driving ---------------- */
	function typing(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
	var KM = { ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", ArrowLeft: "tl", KeyA: "tl", ArrowRight: "tr", KeyD: "tr" };
	function inView() { var r = app.getBoundingClientRect(); return isFill() || (r.bottom > 0 && r.top < innerHeight); }
	function startIfDrive(k) { if (!running && S.m === "drive" && k === "gas" && sim && !sim.done && !replay) go(); }
	document.addEventListener("keydown", function (e) {
		if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || !inView()) return;
		var mine = isFill() || document.activeElement === cv || app.contains(document.activeElement) || running;
		if (!mine) return;
		if (KM[e.code]) { keys[KM[e.code]] = 1; startIfDrive(KM[e.code]); e.preventDefault(); return; }
		if (e.code === "Space" && !(document.activeElement && document.activeElement.tagName === "BUTTON")) { e.preventDefault(); go(); }
		else if (e.code === "KeyR") { e.preventDefault(); reset(); }
		else if (e.code === "KeyF") { e.preventDefault(); $("gj-fs").click(); }
		else if (e.code === "Escape" && isFill() && !document.fullscreenElement) { e.preventDefault(); leaveFill(); }
		else if (e.code === "KeyO") { $("gj-opt").click(); }
		else if (S.view === "3d" && r3 && (e.code === "Minus" || e.code === "NumpadSubtract")) { e.preventDefault(); r3.zoomBy(1.1); } /* - = zoom out (wider) */
		else if (S.view === "3d" && r3 && (e.code === "Equal" || e.code === "NumpadAdd")) { e.preventDefault(); r3.zoomBy(1 / 1.1); }
		else if (S.view === "3d" && r3 && e.code === "Digit0") { e.preventDefault(); r3.resetFree(); }
	});
	document.addEventListener("keyup", function (e) { if (KM[e.code]) keys[KM[e.code]] = 0; });
	window.addEventListener("blur", function () { keys = { gas: 0, brake: 0, tl: 0, tr: 0 }; touch = { gas: 0, brake: 0, tl: 0, tr: 0 }; });
	Array.prototype.forEach.call(document.querySelectorAll("#gj-touch [data-k]"), function (b) {
		var k = b.getAttribute("data-k");
		function on(e) { e.preventDefault(); touch[k] = 1; b.classList.add("is-on"); try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } startIfDrive(k); }
		function off() { touch[k] = 0; b.classList.remove("is-on"); }
		b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("lostpointercapture", off);
		b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	});
	$("gj-go").addEventListener("click", go);
	$("gj-reset").addEventListener("click", reset);
	$("gj-camreset").addEventListener("click", function () { if (r3) r3.resetFree(); });
	$("gj-3d").addEventListener("click", function () { if (r3 && r3.takeDrag()) return; if (S.cam3 !== "orbit" && !running && (!sim || !sim.done) && !replay) go(); });
	$("gj-hint").addEventListener("click", function (e) { if (e.target.closest(".gj-hintx")) { hintDone(); $("gj-hint").hidden = true; return; } if (S.m !== "drive") go(); });
	$("gj-col").addEventListener("input", function (e) { S.color = e.target.value; save(); if (r3) r3.setScene(co, veh, S.color, GRAV[S.gr]); frame(); });

	/* ---------------- start ---------------- */
	if (S.pre && !fromLink) { var pp = M.PRESETS.filter(function (x) { return x.id === S.pre; })[0]; if (pp && !sv.k) loadPreset(pp); }
	$("gj-col").value = S.color || M.vehicle(S.v).color;
	paintStats(); paintInputs(); paintRuns(); reset(); paintSweep(); size(); setView();
	window.addEventListener("resize", function () { size(); if (!isFill()) { drawCharts(); drawSweep(); } });
	if (window.ResizeObserver) new ResizeObserver(function () { size(); }).observe($("gj-st"));
	new MutationObserver(function () { drawCharts(); drawSweep(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	window.MESStunt = { S: S, go: go, reset: reset, get sim() { return sim; }, get r3() { return r3; }, get cam() { return cam; }, frame: frame, enterFill: enterFill, leaveFill: leaveFill, handles: handles, wx: wx, wy: wy,
		setView: function (v) { S.view = v; paintSeg(); setView(); },
		step: function (n) { for (var i = 0; i < (n || 1); i++) if (!sim.done) sim.step(DT); if (sim.done && !sim._f) { sim._f = 1; finished(); } frame(); paintRo(); } };
})();
