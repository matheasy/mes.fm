/* MES Gyroscope & Spinning Top Simulator UI. Physics: MESGyro (lib.js, node-tested: tool_apps_src/gyroscope-simulator-tests.js).
   3D: three.js 0.170.0 from jsDelivr (unpkg fallback), loaded after the page; if it fails the graphs and numbers still run.
   State: localStorage mes-gyroscope-simulator:v1; links ?tab=pivot|floor|ice|mes|calc&p=<preset id> */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("gy"); if (!root) return;
	var M = window.MESGyro, V = M.v, KEY = "mes-gyroscope-simulator:v1", D = Math.PI / 180, TAU = Math.PI * 2;
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function mi(s) { return String(s).replace(/-/g, "−"); }
	function fx(x, d) { return isFinite(x) ? mi(x.toFixed(d)) : "–"; }
	function sg(x) { if (!isFinite(x)) return "–"; var a = Math.abs(x); return mi(a >= 1000 ? Math.round(x).toLocaleString("en-US") : a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : a >= 1 ? x.toFixed(2) : x.toFixed(3)); }
	var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
	function sci(x, d) { if (!isFinite(x)) return "–"; if (x === 0) return "0"; var e = Math.floor(Math.log10(Math.abs(x))); if (e >= -2 && e < 4) return sg(x); var m = x / Math.pow(10, e); return mi(m.toFixed(d == null ? 2 : d)) + "×10" + String(e).replace(/./g, function (c) { return SUP[c]; }); }
	var toastT; function toast(msg) { var t = $("gy-toast"); if (!t) { t = document.createElement("div"); t.id = "gy-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2400); }
	function setPressed(btns, on) { btns.forEach(function (b) { b.setAttribute("aria-pressed", b === on ? "true" : "false"); }); }

	/* ---------------- state ---------------- */
	var DEF = {
		tab: "pivot", spd: 0, showL: true, showT: true, trail: true, g: "tilt",
		pivot: { pre: "steady", body: "gyro", rpm: 3000, tilt: 60, start: "steady", ks: 0, kp: 0, push: 0, hold: 0, mag: 0 },
		floor: { pre: "rise", body: "top", rpm: 2400, tilt: 25, mu: 0.3, crr: 0.2, tipr: 4 },
		ice: { pre: "fast", body: "gyro", rpm: 3000, mb: 1.5, mus: 0.03, start: "steady" }
	};
	var saved = sget(), S = JSON.parse(JSON.stringify(DEF));
	["tab", "spd", "showL", "showT", "trail", "g"].forEach(function (k) { if (saved[k] != null) S[k] = saved[k]; });
	["pivot", "floor", "ice"].forEach(function (m) { if (saved[m]) for (var k in DEF[m]) if (saved[m][k] != null) S[m][k] = saved[m][k]; });
	var qs = new URLSearchParams(location.search);
	if (/^(pivot|floor|ice|mes|calc)$/.test(qs.get("tab") || "")) S.tab = qs.get("tab");
	var BODY_OK = { pivot: ["gyro", "top", "gyrotop", "heavy"], floor: ["top", "gyro", "tippe", "heavy"], ice: ["gyro", "heavy"] };
	["pivot", "floor", "ice"].forEach(function (m) { if (BODY_OK[m].indexOf(S[m].body) < 0) S[m].body = BODY_OK[m][0]; });

	var LEADS = {
		pivot: "A top or gyroscope on a fixed pivot. Gravity pulls it down, yet it goes round (precesses) instead of falling. Drag the view to look around; try the examples.",
		floor: "A top standing on a round tip on a table, free to slide and roll. Friction at the tip is what makes a top stand up in the textbook account: switch it off and see.",
		ice: "A gyroscope on a pivot stand, on a block resting on ice. Does the block move as the gyroscope precesses? It depends on the spin and on the ice's grip.",
		mes: "Owen Liang's Gyrotop and MES's gyroscope experiments, each set side by side with what the standard (textbook) model predicts.",
		calc: "Type in a gyroscope or top and get the textbook numbers: precession, nutation, sleeping speed and the ice-block test."
	};

	/* ---------------- slider mappings (stored values are physical) ---------------- */
	function rpmFromX(x) { return Math.round(100 * Math.pow(300, x)); }          // 100 .. 30000 rpm (log)
	function xFromRpm(r) { return clamp(Math.log(r / 100) / Math.log(300), 0, 1); }
	function bodyFor(mode) { var b = M.body(S[mode].body); if (mode === "floor" && b.kind !== "tippe") b.a = clamp(S.floor.tipr / 1000, 0.0002, 0.01); return b; }
	/* spin friction as a half-life of the spin: k = I3 ln2 / T */
	function ksFromX(x, b) { if (x < 0.005) return 0; var T = 300 * Math.pow(0.5 / 300, x); return b.I3 * Math.LN2 / T; }
	function xFromKs(k, b) { if (!(k > 0)) return 0; var T = b.I3 * Math.LN2 / k; return clamp(Math.log(T / 300) / Math.log(0.5 / 300), 0.006, 1); }
	function kpFromX(x, b) { if (x < 0.005) return 0; return b.I3 * 100 * Math.pow(10, 3 * (x - 1)) * 2; }
	function xFromKp(k, b) { if (!(k > 0)) return 0; return clamp(1 + Math.log10(k / (b.I3 * 200)) / 3, 0.006, 1); }
	function mgl(b) { return b.m * M.G * Math.abs(b.l); }
	function pushFromX(x, b) { var s = x < 0 ? -1 : 1, a = Math.abs(x); return a < 0.01 ? 0 : s * a * a * 0.05 * mgl(b); }
	function xFromPush(p, b) { if (!p) return 0; return clamp(Math.sign(p) * Math.sqrt(Math.abs(p) / (0.05 * mgl(b))), -1, 1); }

	/* ---------------- DOM ---------------- */
	var tabs = Array.prototype.slice.call(root.querySelectorAll(".gy-tabs button"));
	var simbox = $("gy-simbox"), panels = { mes: root.querySelector('[data-panel="mes"]'), calc: root.querySelector('[data-panel="calc"]') };
	function fill(sel, ids) { sel.innerHTML = ids.map(function (id) { return '<option value="' + id + '">' + esc(M.BODIES[id].name) + "</option>"; }).join(""); }
	fill($("gy-body"), BODY_OK.pivot); fill($("gy-ibody"), BODY_OK.ice);

	/* ---------------- simulation ---------------- */
	var sim = null, playing = true, H = [], P = [], lastSample = 0, warned = false, holderAng = 0, visSpin = 0, slowFlag = false;
	function pivotOpts() {
		var p = S.pivot, b = sim.b, o = { ks: p.ks, kp: p.kp, push: p.push, wh: [0, 0, p.hold] };
		if (p.mag) o.mag = { F: [0, 0, -p.mag * b.m * M.G], d: b.l };
		return o;
	}
	function icePar() { var b = M.body(S.ice.body); return { m: b.m, I1: b.I1, I3: b.I3, l: b.l, mb: S.ice.mb, mus: S.ice.mus, muk: S.ice.mus * 0.8, body: b }; }
	function reset() {
		var mode = S.tab; H = []; P = []; lastSample = 0; holderAng = 0; warned = false;
		if (mode === "pivot") {
			var p = S.pivot, b = bodyFor("pivot"), w = M.radps(p.rpm), th = p.tilt * D, pr = 0;
			if (p.start === "steady") { var sp = M.steadyPrecession(b, w, th); pr = sp.ok ? sp.slow : 0; if (!sp.ok) toast("Too slow for steady precession at this tilt: let go from rest instead."); }
			sim = { mode: mode, b: b, s: M.pivotState(th, 0, w, pr), dt: 2e-4 };
			sim.o = pivotOpts(); var i0 = M.pivotInfo(b, sim.s, sim.o); sim.E0 = i0.E; sim.KE0 = i0.KE;
		} else if (mode === "floor") {
			var f = S.floor, bf = bodyFor("floor");
			sim = { mode: mode, b: bf, s: M.floorState(bf, f.tilt * D, 0, M.radps(f.rpm), 0), dt: 1e-4, o: { mu: f.mu, crr: f.crr } };
			sim.E0 = M.floorInfo(bf, sim.s, sim.o).E;
		} else if (mode === "ice") {
			var ip = icePar(), wi = M.radps(S.ice.rpm);
			sim = { mode: mode, p: ip, b: ip.body, s: M.iceState(ip, Math.PI / 2, wi, S.ice.start === "steady" ? M.fastTopPrecession(ip, wi) : 0), dt: 2e-4 };
			sim.c0 = M.iceCOM(ip, sim.s); sim.E0 = M.iceEnergy(ip, sim.s); sim.trail = [];
		} else { sim = null; return; }
		sim.fell = false;
		if (view) view.build();
		sample(true);
	}
	function stepSim(simDt) {
		if (!sim || sim.fell) return;
		var n = Math.ceil(simDt / sim.dt - 1e-9), max = sim.mode === "ice" ? 1200 : sim.mode === "floor" ? 2500 : 4000;
		slowFlag = n > max; if (n > max) n = max;
		for (var i = 0; i < n; i++) {
			if (sim.mode === "pivot") sim.s = M.pivotStep(sim.b, sim.s, sim.o, sim.dt);
			else if (sim.mode === "floor") { sim.s = M.floorStep(sim.b, sim.s, sim.o, sim.dt); if (sim.s.p[2] < -0.5 || !isFinite(sim.s.p[2])) { sim.fell = true; break; } }
			else { sim.s = M.iceStep(sim.p, sim.s, sim.dt); var th = sim.s.x[2]; if (th < 4 * D || th > 176 * D) { sim.fell = true; toast("The gyroscope fell over (the ice model stops here)."); break; } }
			if (sim.s.t - lastSample >= 0.002) sample(false);
		}
		holderAng += (sim.mode === "pivot" ? S.pivot.hold : 0) * simDt;
	}
	function info() {
		if (!sim) return null;
		if (sim.mode === "pivot") return M.pivotInfo(sim.b, sim.s, sim.o);
		if (sim.mode === "floor") return M.floorInfo(sim.b, sim.s, sim.o);
		var s = sim.s, x = s.x, v = s.v; return { tilt: x[2], azi: x[3], spin: v[4] + v[3] * Math.cos(x[2]), prec: v[3], e3: [Math.sin(x[2]) * Math.cos(x[3]), Math.sin(x[2]) * Math.sin(x[3]), Math.cos(x[2])] };
	}
	function sample(force) {
		var I = info(); if (!I) return; var t = sim.s.t; lastSample = t;
		var row = { t: t, tilt: I.tilt / D, prec: I.prec, spin: M.rpm(I.spin) };
		if (sim.mode === "pivot") row.E = (I.E - sim.E0) / Math.max(1e-12, Math.abs(sim.E0) + I.KE);
		if (sim.mode === "floor") { row.h = sim.s.p[2] * 1000; row.slip = (sim.s.slip || 0) * 1000; row.E = (I.E - sim.E0) / Math.abs(sim.E0); }
		if (sim.mode === "ice") { var s = sim.s, c = M.iceCOM(sim.p, s); row.bx = s.x[0] * 1000; row.by = s.x[1] * 1000; row.cx = (c[0] - sim.c0[0]) * 1000; row.cy = (c[1] - sim.c0[1]) * 1000; row.F = s.F ? Math.hypot(s.F[0], s.F[1]) : 0; row.grip = sim.p.mus * (s.N || (sim.p.mb + sim.p.m) * M.G); row.d = Math.hypot(s.x[0], s.x[1]) * 1000; }
		var e3 = I.e3; row.px = e3[0]; row.py = e3[1];
		H.push(row); if (H.length > 9000) H.splice(0, H.length - 8000);
	}

	/* ---------------- presets ---------------- */
	function applyPreset(mode, id) {
		var pr = (M.PRESETS[mode] || []).filter(function (p) { return p.id === id; })[0]; if (!pr) return;
		var st = S[mode]; st.pre = id;
		if (mode === "pivot") { st.body = pr.body; st.rpm = pr.rpm; st.tilt = pr.tilt; st.start = pr.start; st.ks = pr.ks || 0; st.kp = pr.kp || 0; st.push = pr.push || 0; st.hold = pr.holder || 0; st.mag = pr.mag || 0; }
		if (mode === "floor") { st.body = pr.body; st.rpm = pr.rpm; st.tilt = pr.tilt; st.mu = pr.mu; st.crr = pr.crr != null ? pr.crr : (pr.mu ? 0.2 : 0); st.tipr = (M.BODIES[pr.body].a * 1000); }
		if (mode === "ice") { st.rpm = pr.rpm; st.mus = pr.mus; st.start = pr.start || "steady"; st.body = pr.body || "gyro"; st.mb = pr.mb || 1.5; }
		$("gy-pnote").textContent = pr.note || "";
		syncUI(); reset(); sset();
	}

	/* ---------------- controls ---------------- */
	function bindRange(id, get, set, label) {
		var el = $(id); el.addEventListener("input", function () { set(Number(el.value)); label(); if (live[id]) live[id](); else reset(); clearPre(); sset(); });
		return function () { el.value = get(); label(); };
	}
	var live = {};       /* controls that change a running sim without restarting it */
	function clearPre() { var m = S.tab; if (S[m]) { S[m].pre = ""; paintChips(); $("gy-pnote").textContent = ""; } }
	var syncers = [];
	function lbl(id, txt, note) { $(id + "-v").textContent = txt; if (note != null && $(id + "-n")) $(id + "-n").textContent = note; }
	syncers.push(bindRange("gy-rpm", function () { return xFromRpm(S[S.tab === "floor" ? "floor" : "pivot"].rpm); }, function (x) { S[S.tab === "floor" ? "floor" : "pivot"].rpm = rpmFromX(x); }, function () {
		var m = S.tab === "floor" ? "floor" : "pivot", r = S[m].rpm, b = bodyFor(m), sl = M.rpm(M.sleepSpin(b));
		lbl("gy-rpm", r.toLocaleString("en-US") + " rpm (" + sg(r / 60) + " turns/s)", b.l > 0 ? "Sleeping speed for this " + (b.kind === "gyro" ? "gyroscope" : "top") + " on a pivot: " + Math.round(sl).toLocaleString("en-US") + " rpm." : "");
	}));
	syncers.push(bindRange("gy-tilt", function () { return S[S.tab === "floor" ? "floor" : "pivot"].tilt; }, function (x) { S[S.tab === "floor" ? "floor" : "pivot"].tilt = x; }, function () { lbl("gy-tilt", fx(S[S.tab === "floor" ? "floor" : "pivot"].tilt, 1) + "°" + (S.tab === "pivot" && S.pivot.tilt > 90 ? " (below the pivot)" : "")); }));
	syncers.push(bindRange("gy-ks", function () { return xFromKs(S.pivot.ks, bodyFor("pivot")); }, function (x) { S.pivot.ks = ksFromX(x, bodyFor("pivot")); }, function () { var b = bodyFor("pivot"); lbl("gy-ks", S.pivot.ks ? "spin halves in " + sg(b.I3 * Math.LN2 / S.pivot.ks) + " s" : "off"); }));
	syncers.push(bindRange("gy-kp", function () { return xFromKp(S.pivot.kp, bodyFor("pivot")); }, function (x) { S.pivot.kp = kpFromX(x, bodyFor("pivot")); }, function () { lbl("gy-kp", S.pivot.kp ? sci(S.pivot.kp) + " N·m·s" : "off"); }));
	syncers.push(bindRange("gy-push", function () { return xFromPush(S.pivot.push, bodyFor("pivot")); }, function (x) { S.pivot.push = pushFromX(x, bodyFor("pivot")); }, function () { var b = bodyFor("pivot"); lbl("gy-push", S.pivot.push ? sci(S.pivot.push) + " N·m (" + fx(100 * S.pivot.push / mgl(b), 1) + "% of m·g·l)" : "off"); }));
	syncers.push(bindRange("gy-hold", function () { return S.pivot.hold; }, function (x) { S.pivot.hold = Math.abs(x) < 0.05 ? 0 : x; }, function () { lbl("gy-hold", S.pivot.hold ? fx(S.pivot.hold, 2) + " rad/s (" + (S.pivot.hold > 0 ? "anticlockwise" : "clockwise") + " seen from above)" : "still"); }));
	syncers.push(bindRange("gy-mag", function () { return S.pivot.mag; }, function (x) { S.pivot.mag = Math.abs(x) < 0.01 ? 0 : x; }, function () { lbl("gy-mag", S.pivot.mag ? (S.pivot.mag > 0 ? "" : "lift ") + fx(Math.abs(S.pivot.mag), 2) + " × its weight" : "none"); }));
	syncers.push(bindRange("gy-mu", function () { return S.floor.mu; }, function (x) { S.floor.mu = x; }, function () { lbl("gy-mu", S.floor.mu ? fx(S.floor.mu, 2) : "none (perfectly slippery)"); }));
	syncers.push(bindRange("gy-crr", function () { return S.floor.crr; }, function (x) { S.floor.crr = x; }, function () { lbl("gy-crr", S.floor.crr ? fx(S.floor.crr, 3) : "none"); }));
	syncers.push(bindRange("gy-tipr", function () { return S.floor.tipr; }, function (x) { S.floor.tipr = x; }, function () { lbl("gy-tipr", S.floor.body === "tippe" ? "the ball (" + fx(M.BODIES.tippe.a * 1000, 0) + " mm)" : fx(S.floor.tipr, 1) + " mm"); }));
	syncers.push(bindRange("gy-irpm", function () { return xFromRpm(S.ice.rpm); }, function (x) { S.ice.rpm = Math.max(300, rpmFromX(x)); }, function () {
		var p = icePar(), wc = M.rpm(M.iceCriticalSpin(p));
		lbl("gy-irpm", S.ice.rpm.toLocaleString("en-US") + " rpm", isFinite(wc) ? "Textbook: the block starts to slide below about " + Math.round(wc).toLocaleString("en-US") + " rpm." : "No grip at all: the block always moves.");
	}));
	syncers.push(bindRange("gy-imb", function () { return S.ice.mb; }, function (x) { S.ice.mb = x; }, function () { lbl("gy-imb", fx(S.ice.mb, 2) + " kg"); }));
	syncers.push(bindRange("gy-imu", function () { return S.ice.mus; }, function (x) { S.ice.mus = x; }, function () { lbl("gy-imu", S.ice.mus ? "μ = " + fx(S.ice.mus, 3) : "none (frictionless)"); }));
	syncers.push(bindRange("gy-spd", function () { return S.spd; }, function (x) { S.spd = Math.abs(x) < 0.02 ? 0 : x; }, function () { var f = Math.pow(10, S.spd); lbl("gy-spd", f >= 0.995 && f <= 1.005 ? "real speed" : f < 1 ? (f >= 0.1 ? fx(f, 2) : fx(f, 3)) + "× (slow motion)" : fx(f, 1) + "× faster"); }));
	live["gy-spd"] = function () {};
	/* friction / holder / magnet / push change the running pivot sim without restarting */
	["gy-ks", "gy-kp", "gy-push", "gy-hold", "gy-mag"].forEach(function (id) { live[id] = function () { if (sim && sim.mode === "pivot") sim.o = pivotOpts(); }; });
	["gy-mu", "gy-crr"].forEach(function (id) { live[id] = function () { if (sim && sim.mode === "floor") { sim.o.mu = S.floor.mu; sim.o.crr = S.floor.crr; } }; });
	live["gy-imu"] = function () { if (sim && sim.mode === "ice") { sim.p.mus = S.ice.mus; sim.p.muk = S.ice.mus * 0.8; syncers.forEach(function (f) { f(); }); } };

	$("gy-body").addEventListener("change", function () { var m = S.tab === "floor" ? "floor" : "pivot"; S[m].body = this.value; if (m === "floor") S.floor.tipr = M.BODIES[this.value].a * 1000; clearPre(); syncUI(); reset(); sset(); });
	$("gy-ibody").addEventListener("change", function () { S.ice.body = this.value; clearPre(); syncUI(); reset(); sset(); });
	var stBtns = [$("gy-st-steady"), $("gy-st-rest")], istBtns = [$("gy-ist-steady"), $("gy-ist-rest")];
	stBtns.forEach(function (b) { b.onclick = function () { S.pivot.start = b === stBtns[0] ? "steady" : "rest"; setPressed(stBtns, b); clearPre(); reset(); sset(); }; });
	istBtns.forEach(function (b) { b.onclick = function () { S.ice.start = b === istBtns[0] ? "steady" : "rest"; setPressed(istBtns, b); clearPre(); reset(); sset(); }; });
	[["gy-showL", "showL"], ["gy-showT", "showT"], ["gy-trail", "trail"]].forEach(function (a) { var el = $(a[0]); el.checked = !!S[a[1]]; el.onchange = function () { S[a[1]] = el.checked; sset(); if (view) view.toggles(); }; });
	$("gy-play").onclick = function () { playing = !playing; this.textContent = playing ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", playing ? "true" : "false"); };
	$("gy-restart").onclick = function () { reset(); };
	$("gy-step").onclick = function () { if (playing) $("gy-play").click(); stepSim(0.01 * Math.pow(10, Math.min(0, S.spd)) + 0.002); };
	Array.prototype.forEach.call(root.querySelectorAll(".gy-fs"), function (b) {
		b.onclick = function () { var w = b.closest(".gy-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	});

	function paintChips() {
		var box = $("gy-pre"), m = S.tab, list = M.PRESETS[m] || [];
		box.innerHTML = list.map(function (p) { return '<button type="button" data-p="' + p.id + '" aria-pressed="' + (S[m].pre === p.id) + '">' + esc(p.name) + "</button>"; }).join("");
		Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) { b.onclick = function () { applyPreset(m, b.getAttribute("data-p")); }; });
	}
	function syncUI() {
		var m = S.tab, sm = m === "floor" ? "floor" : "pivot";
		if (m === "pivot" || m === "floor") { fill($("gy-body"), BODY_OK[sm]); $("gy-body").value = S[sm].body; }
		$("gy-ibody").value = S.ice.body;
		setPressed(stBtns, S.pivot.start === "steady" ? stBtns[0] : stBtns[1]);
		setPressed(istBtns, S.ice.start === "steady" ? istBtns[0] : istBtns[1]);
		$("gy-tipr").disabled = S.floor.body === "tippe";
		syncers.forEach(function (f) { f(); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-for]"), function (el) { el.hidden = el.getAttribute("data-for").split(" ").indexOf(m) < 0; });
		paintChips(); paintGsel();
	}

	/* ---------------- tabs ---------------- */
	function showTab(t, keep) {
		S.tab = t; tabs.forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
		var isSim = t === "pivot" || t === "floor" || t === "ice";
		simbox.hidden = !isSim; panels.mes.hidden = t !== "mes"; panels.calc.hidden = t !== "calc";
		$("gy-lead").textContent = LEADS[t];
		if (isSim) { var pr = (M.PRESETS[t] || []).filter(function (p) { return p.id === S[t].pre; })[0]; $("gy-pnote").textContent = pr ? pr.note : ""; }
		syncUI(); if (isSim) { reset(); fitAll(); }
		if (t === "mes") { paintExps(); drawIceChart(); }
		if (t === "calc") calc();
		if (!keep) { var u = new URL(location.href); u.searchParams.set("tab", t); u.searchParams.delete("p"); history.replaceState(null, "", u); }
		sset();
	}
	tabs.forEach(function (b) { b.onclick = function () { showTab(b.getAttribute("data-tab")); }; });

	/* ---------------- readouts ---------------- */
	function ro(items) { $("gy-ro").innerHTML = items.map(function (it) { return '<div class="gy-ro' + (it.c ? " " + it.c : "") + '"><span>' + esc(it.l) + "</span><b>" + esc(it.v) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + "</div>"; }).join(""); }
	function turnTime(W) { return Math.abs(W) > 1e-6 ? "one turn every " + sg(TAU / Math.abs(W)) + " s" : "not turning"; }
	function readouts() {
		if (!sim) return; var I = info(), b = sim.b;
		if (sim.mode === "pivot") {
			var sp = M.steadyPrecession(b, I.spin, I.tilt, M.G), mag = 1 + (S.pivot.mag || 0);
			if (S.pivot.mag) sp = M.steadyPrecession(b, I.spin, I.tilt, M.G * mag);
			var sl = M.sleepSpin(b, M.G * mag), avgP = avgPrec();
			ro([
				{ l: "Spin", v: Math.round(M.rpm(I.spin)).toLocaleString("en-US") + " rpm", s: fx(I.spin, 1) + " rad/s" },
				{ l: "Tilt from vertical", v: fx(I.tilt / D, 2) + "°" },
				{ l: "Precession (measured)", v: avgP == null ? "–" : fx(avgP, 3) + " rad/s", s: avgP == null ? "" : turnTime(avgP) },
				{ l: "Precession (textbook)", v: sp.ok ? fx(sp.slow, 3) + " rad/s" : "none steady", s: "m·g·l / L = " + fx(M.fastTopPrecession(b, I.spin, M.G * mag), 3) + " rad/s" },
				{ l: "Nutation", v: fx(M.nutationRate(b, I.spin) / TAU, 1) + " bobs/s", s: "dip if let go: " + fx(M.nutationDip(b, I.spin, I.tilt, M.G * mag) / D, 2) + "°" },
				{ l: "Angular momentum", v: sci(I.Lmag) + " kg·m²/s" },
				{ l: "Sleeping speed", v: b.l > 0 ? Math.round(M.rpm(sl)).toLocaleString("en-US") + " rpm" : "–", c: b.l > 0 ? (I.spin > sl ? "is-good" : "is-bad") : "", s: b.l > 0 ? (I.spin > sl ? "fast enough to stand upright" : "too slow to stand upright") : "" },
				(function () { var fr = S.pivot.ks || S.pivot.kp || S.pivot.push || S.pivot.hold, rel = (I.E - sim.E0) / Math.max(1e-12, sim.KE0); return fr ? { l: "Energy change", v: fx(100 * rel, 3) + "%", s: "of the starting kinetic energy · time " + fx(sim.s.t, 2) + " s" } : { l: "Energy drift (check)", v: sci(rel), c: Math.abs(rel) < 1e-5 ? "is-good" : "", s: "should stay ~0 with no friction · time " + fx(sim.s.t, 2) + " s" }; })()
			]);
		} else if (sim.mode === "floor") {
			var Ef = (I.E - sim.E0) / Math.abs(sim.E0);
			ro([
				{ l: "Spin", v: Math.round(M.rpm(I.spin)).toLocaleString("en-US") + " rpm" },
				{ l: "Tilt from vertical", v: fx(I.tilt / D, 2) + "°", c: I.tilt < 3 * D ? "is-good" : "" , s: I.tilt < 3 * D ? "sleeping (upright)" : ""},
				{ l: "Precession", v: avgPrec() == null ? "–" : fx(avgPrec(), 2) + " rad/s" },
				{ l: "Tip sliding at", v: fx((sim.s.slip || 0) * 1000, 1) + " mm/s", s: (sim.s.slip || 0) < 0.003 ? "rolling (hardly sliding)" : "sliding" },
				{ l: "Floor push", v: fx(sim.s.N || 0, 3) + " N", s: "weight " + fx(b.m * M.G, 3) + " N" },
				{ l: "Energy lost to friction", v: fx(-100 * Ef, 2) + "%", s: "time " + fx(sim.s.t, 2) + " s" }
			]);
		} else {
			var s = sim.s, p = sim.p, F = s.F ? Math.hypot(s.F[0], s.F[1]) : 0, grip = p.mus * (s.N || (p.mb + p.m) * M.G), c = M.iceCOM(p, s);
			var need = M.iceForce(p, Math.abs(I.spin), I.tilt), wc = M.iceCriticalSpin(p);
			ro([
				{ l: "Spin", v: Math.round(M.rpm(I.spin)).toLocaleString("en-US") + " rpm", s: isFinite(wc) ? "block slides below ~" + Math.round(M.rpm(wc)).toLocaleString("en-US") + " rpm" : "" },
				{ l: "Precession", v: fx(I.prec, 3) + " rad/s", s: turnTime(I.prec) },
				{ l: "Sideways force needed", v: fx(need * 1000, 1) + " mN", s: "m·l·Ω² (steady)" },
				{ l: "Ice's grip", v: fx(grip * 1000, 0) + " mN", s: "μs × weight" },
				{ l: "Block", v: s.stuck ? "held still" : "sliding", c: s.stuck ? "is-good" : "is-bad", s: "moved " + fx(Math.hypot(s.x[0], s.x[1]) * 1000, 2) + " mm from the start" },
				{ l: "Centre of mass of everything", v: fx(Math.hypot(c[0] - sim.c0[0], c[1] - sim.c0[1]) * 1000, 2) + " mm", s: "from where it started" },
				{ l: "Tilt", v: fx(I.tilt / D, 2) + "°", s: "time " + fx(s.t, 2) + " s" }
			]);
		}
		if (view && view.failed) return;
		var note = slowFlag ? "Running slower than the chosen speed (too many steps per frame)." : sim.fell ? "Stopped: it fell over." : "";
		$("gy-msg").hidden = !note; $("gy-msg").textContent = note;
	}
	/* precession averaged over the last ~0.5 s (smooths the nutation loops) */
	function avgPrec() {
		if (H.length < 3) return null; var last = H[H.length - 1], i = H.length - 1, a = 0;
		while (i > 0 && last.t - H[i - 1].t < 0.5) i--;
		var p0 = H[i]; if (last.t - p0.t < 0.01) return null;
		for (var k = i + 1; k < H.length; k++) { var d = Math.atan2(H[k].py, H[k].px) - Math.atan2(H[k - 1].py, H[k - 1].px); if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; a += d; }
		return a / (last.t - p0.t);
	}

	/* ---------------- 2D graphs ---------------- */
	var COL = { bg: "#0a0f1a", grid: "#1e2738", axis: "#5d6a86", text: "#d6dcea", dim: "#8792aa", a: "#ffd166", b: "#4cc9f0", c: "#ff7aa2", d: "#7ee2a8" };
	function prep(stageId, cvId, hFn) {
		var stage = $(stageId), wrap = stage.parentNode, w = wrap.clientWidth || 300, dpr = Math.min(2, window.devicePixelRatio || 1), h = Math.round(hFn(w));
		stage.style.height = h + "px"; var cv = $(cvId), cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c: c, W: w, H: h };
	}
	function niceStep(range, n) { var s = range / n, p = Math.pow(10, Math.floor(Math.log10(s || 1))), f = s / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
	function txt(c, s, x, y, o) { o = o || {}; c.font = (o.b ? "600 " : "") + (o.size || 11) + "px system-ui,sans-serif"; c.fillStyle = o.col || COL.text; c.textAlign = o.al || "left"; c.textBaseline = o.bl || "alphabetic"; c.fillText(s, x, y); }
	var GQ = {
		pivot: [["tilt", "Tilt (°)"], ["prec", "Precession (rad/s)"], ["spin", "Spin (rpm)"], ["E", "Energy drift"]],
		floor: [["tilt", "Tilt (°)"], ["spin", "Spin (rpm)"], ["slip", "Tip sliding (mm/s)"], ["h", "Height of centre of mass (mm)"]],
		ice: [["d", "Block moved (mm)"], ["F", "Sideways force on block (N)"], ["tilt", "Tilt (°)"], ["prec", "Precession (rad/s)"]]
	};
	function gq() { var l = GQ[S.tab] || GQ.pivot; return l.some(function (q) { return q[0] === S.g; }) ? S.g : l[0][0]; }
	function paintGsel() {
		var box = $("gy-gsel"), l = GQ[S.tab]; if (!l) { box.innerHTML = ""; return; } var cur = gq();
		box.innerHTML = l.map(function (q) { return '<button type="button" data-g="' + q[0] + '" aria-pressed="' + (q[0] === cur) + '">' + esc(q[1]) + "</button>"; }).join("");
		Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) { b.onclick = function () { S.g = b.getAttribute("data-g"); paintGsel(); drawGraphs(); sset(); }; });
	}
	function drawGraphs() {
		if (!sim) return;
		/* --- seen from above --- */
		var A = prep("gy-p-stage", "gy-p", function (w) { return clamp(w * 0.62, 200, 300); }), c = A.c, W = A.W, Hh = A.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		var cx = W / 2, cy = Hh / 2 + 8, R = Math.min(W, Hh - 30) / 2 - 8;
		if (sim.mode !== "ice") {
			txt(c, "Tip of the spin axis, seen from above", 8, 15, { b: true, col: COL.dim });
			var maxr = 0.05; H.forEach(function (r) { maxr = Math.max(maxr, Math.hypot(r.px, r.py)); }); maxr = Math.min(1, maxr * 1.15);
			c.strokeStyle = COL.grid; c.lineWidth = 1; [0.25, 0.5, 0.75, 1].forEach(function (k) { c.beginPath(); c.arc(cx, cy, R * k, 0, TAU); c.stroke(); });
			c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
			var tiltLab = Math.asin(Math.min(1, maxr)) / D; txt(c, "outer ring = " + fx(tiltLab, 1) + "° tilt", W - 8, Hh - 6, { al: "right", col: COL.dim });
			var n = Math.min(H.length, 3500), st = H.length - n; c.lineWidth = 1.3;
			for (var i = st + 1; i < H.length; i++) { var a = H[i - 1], b2 = H[i], al = 0.15 + 0.85 * (i - st) / n; c.strokeStyle = "rgba(255,209,102," + al.toFixed(3) + ")"; c.beginPath(); c.moveTo(cx + a.px / maxr * R, cy - a.py / maxr * R); c.lineTo(cx + b2.px / maxr * R, cy - b2.py / maxr * R); c.stroke(); }
			if (H.length) { var L = H[H.length - 1]; c.fillStyle = COL.a; c.beginPath(); c.arc(cx + L.px / maxr * R, cy - L.py / maxr * R, 4, 0, TAU); c.fill(); }
			c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, cy, 2.5, 0, TAU); c.fill();
		} else {
			txt(c, "Block (blue) and centre of mass of everything (pink), seen from above", 8, 15, { b: true, col: COL.dim });
			var mr = Math.max(2 * M.iceCircle(sim.p) * 1000, 0.5); H.forEach(function (r) { mr = Math.max(mr, Math.abs(r.bx), Math.abs(r.by), Math.abs(r.cx), Math.abs(r.cy)); }); mr *= 1.15;
			var st2 = niceStep(mr, 3); c.strokeStyle = COL.grid; for (var g = -Math.floor(mr / st2) * st2; g <= mr; g += st2) { c.beginPath(); c.moveTo(cx + g / mr * R, cy - R); c.lineTo(cx + g / mr * R, cy + R); c.moveTo(cx - R, cy - g / mr * R); c.lineTo(cx + R, cy - g / mr * R); c.stroke(); }
			txt(c, "grid " + sg(st2) + " mm", W - 8, Hh - 6, { al: "right", col: COL.dim });
			[["bx", "by", COL.b], ["cx", "cy", COL.c]].forEach(function (k) { c.strokeStyle = k[2]; c.lineWidth = 1.6; c.beginPath(); H.forEach(function (r, j) { var X = cx + r[k[0]] / mr * R, Y = cy - r[k[1]] / mr * R; if (j) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke(); var L2 = H[H.length - 1]; if (L2) { c.fillStyle = k[2]; c.beginPath(); c.arc(cx + L2[k[0]] / mr * R, cy - L2[k[1]] / mr * R, 4, 0, TAU); c.fill(); } });
		}
		/* --- over time --- */
		var B = prep("gy-t-stage", "gy-t", function (w) { return clamp(w * 0.5, 180, 260); }); c = B.c; W = B.W; Hh = B.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh); if (H.length < 2) return;
		var key = gq(), lab = (GQ[S.tab].filter(function (q) { return q[0] === key; })[0] || ["", ""])[1];
		var t1 = H[H.length - 1].t, t0 = Math.max(0, t1 - Math.max(2, Math.min(30, t1))), rows = H.filter(function (r) { return r.t >= t0; });
		var y0 = Infinity, y1 = -Infinity; rows.forEach(function (r) { var v = r[key]; if (isFinite(v)) { y0 = Math.min(y0, v); y1 = Math.max(y1, v); } });
		if (key === "F") rows.forEach(function (r) { y1 = Math.max(y1, r.grip); });
		if (!isFinite(y0)) return; if (y1 - y0 < 1e-12) { var mid = y0; y0 = mid - (Math.abs(mid) * 0.01 + 1e-9); y1 = mid + (Math.abs(mid) * 0.01 + 1e-9); } var pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
		var r0 = { x: 52, y: 22, w: W - 64, h: Hh - 46 };
		var X = function (t) { return r0.x + (t - t0) / Math.max(1e-9, t1 - t0) * r0.w; }, Y = function (v) { return r0.y + r0.h - (v - y0) / (y1 - y0) * r0.h; };
		c.font = "11px system-ui,sans-serif"; var ys = niceStep(y1 - y0, 4); c.textAlign = "right"; c.textBaseline = "middle";
		for (var v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r0.x, Y(v) + 0.5); c.lineTo(r0.x + r0.w, Y(v) + 0.5); c.stroke(); c.fillStyle = COL.dim; c.fillText(Math.abs(ys) < 1e-4 ? sci(v, 2) : mi(v.toFixed(Math.max(0, -Math.floor(Math.log10(ys) + 1e-9)))), r0.x - 4, Y(v)); }
		var xs = niceStep(t1 - t0, 5); c.textAlign = "center"; c.textBaseline = "top"; for (var tt = Math.ceil(t0 / xs) * xs; tt <= t1; tt += xs) { c.fillStyle = COL.dim; c.fillText(mi(String(+tt.toFixed(3))) + " s", X(tt), r0.y + r0.h + 4); }
		txt(c, lab, r0.x, 14, { b: true, col: COL.dim });
		if (key === "F") { c.strokeStyle = COL.d; c.setLineDash([5, 4]); c.beginPath(); rows.forEach(function (r, j) { if (j) c.lineTo(X(r.t), Y(r.grip)); else c.moveTo(X(r.t), Y(r.grip)); }); c.stroke(); c.setLineDash([]); txt(c, "ice's grip", r0.x + r0.w, 14, { al: "right", col: COL.d }); }
		c.strokeStyle = COL.a; c.lineWidth = 1.6; c.beginPath(); rows.forEach(function (r, j) { if (j) c.lineTo(X(r.t), Y(r[key])); else c.moveTo(X(r.t), Y(r[key])); }); c.stroke();
	}

	/* ---------------- 3D view (three.js) ---------------- */
	var view = null;
	function loadThree() {
		var imp = new Function("u", "return import(u)");
		return imp("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js").catch(function () { return imp("https://unpkg.com/three@0.170.0/build/three.module.min.js"); });
	}
	function makeView(THREE) {
		var cv = $("gy-c"), renderer;
		try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		var scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0f1a);
		var cam = new THREE.PerspectiveCamera(40, 1.6, 0.001, 50);
		scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f3a, 1.1));
		var sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 5, 3); scene.add(sun);
		var rootG = new THREE.Group(); scene.add(rootG);
		function W3(v) { return new THREE.Vector3(v[0], v[2], -v[1]); }                 // z-up world -> three (y up)
		function Q3(q) { return new THREE.Quaternion(q[1], q[3], -q[2], q[0]); }
		function stripeTex(c1, c2, n) {
			var cnv = document.createElement("canvas"); cnv.width = 256; cnv.height = 16; var x = cnv.getContext("2d");
			for (var i = 0; i < n; i++) { x.fillStyle = i % 2 ? c2 : c1; x.fillRect(i * 256 / n, 0, 256 / n + 1, 16); }
			var t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
		}
		var MAT = {
			wood: new THREE.MeshStandardMaterial({ map: stripeTex("#d9a066", "#b5651d", 8), roughness: 0.6 }),
			rotor: new THREE.MeshStandardMaterial({ map: stripeTex("#c8ccd6", "#3a7bd5", 6), metalness: 0.6, roughness: 0.35 }),
			metal: new THREE.MeshStandardMaterial({ color: 0xb8bec9, metalness: 0.8, roughness: 0.3 }),
			frame: new THREE.MeshStandardMaterial({ color: 0xd6a83a, metalness: 0.7, roughness: 0.35 }),
			stand: new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.6 }),
			red: new THREE.MeshStandardMaterial({ color: 0xe0464e, roughness: 0.5 }),
			block: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 }),
			ice: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.85 }),
			floor: new THREE.MeshStandardMaterial({ color: 0x2b3242, roughness: 0.9 })
		};
		/* a top / gyroscope along +y, origin at its pivot / tip point. Returns {g (whole), rotor, frame} */
		function topModel(b) {
			var g = new THREE.Group(), rotor = new THREE.Group(), frame = new THREE.Group(); g.add(frame); g.add(rotor);
			var l = b.l, r = b.r, h = b.h, a = b.a;
			if (b.kind === "top") {
				var pts = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(a * 0.9, a * 0.4), new THREE.Vector2(r * 0.25, l * 0.45), new THREE.Vector2(r, l * 0.95), new THREE.Vector2(r, l * 1.12), new THREE.Vector2(r * 0.7, l * 1.3), new THREE.Vector2(r * 0.14, l * 1.38), new THREE.Vector2(r * 0.12, h * 0.98), new THREE.Vector2(0.0001, h)];
				var m1 = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), MAT.wood); rotor.add(m1);
				var tip = new THREE.Mesh(new THREE.SphereGeometry(Math.max(a, 0.0004), 16, 10), MAT.metal); tip.position.y = Math.max(a, 0.0004); rotor.add(tip);
			} else if (b.kind === "tippe") {
				var ball = new THREE.Mesh(new THREE.SphereGeometry(a, 40, 24, 0, TAU, 0.42, Math.PI - 0.42), MAT.wood); ball.position.y = a; ball.rotation.x = Math.PI; rotor.add(ball);
				var stem = new THREE.Mesh(new THREE.CylinderGeometry(a * 0.13, a * 0.13, a * 0.9, 16), MAT.wood); stem.position.y = 2 * a + a * 0.25; rotor.add(stem);
				var cap = new THREE.Mesh(new THREE.CylinderGeometry(a * 0.6, a * 0.6, a * 0.1, 30), MAT.wood); cap.position.y = a + a * 0.9; rotor.add(cap);
			} else {
				var disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.93, r * 0.1, 48, 1, false), MAT.rotor); disc.position.y = l; rotor.add(disc);
				var rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.93, r * 0.09, 14, 56), MAT.rotor); rim.rotation.x = Math.PI / 2; rim.position.y = l; rotor.add(rim);
				var fr = r * 1.14, ax = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.05, 2 * fr, 12), MAT.metal); ax.position.y = l; frame.add(ax);
				[0, Math.PI / 2].forEach(function (rr) { var ring = new THREE.Mesh(new THREE.TorusGeometry(fr, r * 0.045, 10, 64), MAT.frame); ring.rotation.y = rr; ring.position.y = l; frame.add(ring); });
				var footH = Math.max(0.002, l - fr), foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.035, footH, 12), MAT.frame); foot.position.y = footH / 2; frame.add(foot);
				var ball2 = new THREE.Mesh(new THREE.SphereGeometry(Math.max(a, r * 0.05), 14, 10), MAT.metal); ball2.position.y = Math.max(a, r * 0.05); frame.add(ball2);
				var top = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 14, 10), MAT.frame); top.position.y = l + fr; frame.add(top);
			}
			return { g: g, rotor: rotor, frame: frame };
		}
		function arrow(col) { var a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, col); a.line.material.linewidth = 2; return a; }
		var V3 = { root: rootG, sceneObj: [] };
		var top = null, stand = null, standRot = null, block = null, arrL = arrow(0xffd166), arrT = arrow(0xff5c6a), trail = null, trailPts = [], comMark = null, blockTrail = null, blockPts = [];
		var camS = { yaw: 0.7, pitch: 0.42, dist: 1, tgt: new THREE.Vector3() }, scale = 1;
		function clear() { while (rootG.children.length) rootG.remove(rootG.children[0]); trailPts = []; blockPts = []; }
		function build() {
			clear(); if (!sim) return; var b = sim.b, mode = sim.mode;
			var size = mode === "ice" ? 0.45 : Math.max(b.h, 2.2 * b.r) * (mode === "floor" ? 2.6 : 2.2);
			scale = 1 / size; rootG.scale.setScalar(scale);
			var gr = new THREE.GridHelper(size * 3, 30, 0x3a4560, 0x232b3c); gr.position.y = 0;
			top = topModel(b); rootG.add(top.g);
			if (mode === "pivot") {
				var Hs = (b.kind === "gyro" ? b.l + b.r * 1.3 : b.l + b.r * 0.8) + 0.004, armX = -(b.r * 1.7 + 0.01);
				gr.position.y = -Hs; rootG.add(gr);
				var fl = new THREE.Mesh(new THREE.CircleGeometry(size * 1.4, 48), MAT.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = -Hs - 0.0005; rootG.add(fl);
				standRot = new THREE.Group(); rootG.add(standRot);
				var col = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.12 + 0.002, b.r * 0.16 + 0.003, Hs, 16), MAT.stand); col.position.set(armX, -Hs / 2, 0); standRot.add(col);
				var arm = new THREE.Mesh(new THREE.BoxGeometry(-armX, b.r * 0.12 + 0.002, b.r * 0.2 + 0.003), MAT.stand); arm.position.set(armX / 2, -(b.r * 0.06 + 0.001) - 0.0015, 0); standRot.add(arm);
				var cup = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.12 + 0.002, b.r * 0.08 + 0.001, 0.003, 18), MAT.red); cup.position.y = -0.0015; standRot.add(cup);
				var baseD = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.9 + 0.01, b.r * 0.9 + 0.01, 0.004, 32), MAT.stand); baseD.position.set(armX, -Hs + 0.002, 0); standRot.add(baseD);
				camS.tgt.set(0, b.l * 0.5 * scale, 0); camS.dist = 1.35; camS.base = 1.35;
			} else if (mode === "floor") {
				rootG.add(gr); var f2 = new THREE.Mesh(new THREE.CircleGeometry(size * 1.5, 48), MAT.floor); f2.rotation.x = -Math.PI / 2; f2.position.y = -0.0003; rootG.add(f2);
				camS.dist = 1.5; camS.base = 1.5;
			} else {
				var p = sim.p, bw = 0.26, bd = 0.18, bh = 0.05;
				var ice = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 1.2), MAT.ice); ice.position.y = -0.02; rootG.add(ice);
				block = new THREE.Group(); rootG.add(block);
				var bx = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), MAT.block); bx.position.y = bh / 2; block.add(bx);
				var Hs2 = b.l + b.r * 1.3 + 0.01; sim.standH = bh + Hs2;
				var post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, Hs2, 14), MAT.stand); post.position.y = bh + Hs2 / 2; block.add(post);
				var cp = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.006, 0.004, 14), MAT.red); cp.position.y = bh + Hs2 - 0.002; block.add(cp);
				comMark = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, 20), new THREE.MeshBasicMaterial({ color: 0xff7aa2 })); comMark.position.y = 0.002; rootG.add(comMark);
				blockTrail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4cc9f0 })); rootG.add(blockTrail);
				scale = 1 / 0.45; rootG.scale.setScalar(scale); camS.dist = 1.15; camS.base = 1.15; camS.tgt.set(0, sim.standH * 0.85 * scale, 0);
			}
			rootG.add(arrL); rootG.add(arrT);
			trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8 })); rootG.add(trail);
			toggles(); render();
		}
		function toggles() { arrL.visible = !!S.showL; arrT.visible = !!S.showT; if (trail) trail.visible = !!S.trail; if (blockTrail) blockTrail.visible = !!S.trail; }
		function setArrow(a, origin, dir, len, col) { var d = new THREE.Vector3(dir[0], dir[2], -dir[1]); if (d.lengthSq() < 1e-20 || !(len > 1e-9)) { a.visible = false; return; } d.normalize(); a.position.copy(W3(origin)); a.setDirection(d); a.setLength(len, Math.min(len * 0.3, 0.25 / scale * 0.3), Math.min(len * 0.18, 0.12 / scale * 0.3)); }
		function update(dtVis) {
			if (!sim || !top) return; var b = sim.b, I = info(), e3 = I.e3, tilt = I.tilt, azi = Math.atan2(e3[1], e3[0]);
			var spinRate = I.spin, shown = Math.sign(spinRate) * Math.min(Math.abs(spinRate), TAU * 2.5);    // draw at most 2.5 turns a second
			visSpin = (visSpin + shown * dtVis) % TAU;
			var fq = M.qTilt(tilt, azi), rq = M.qmul(fq, M.qaxis([0, 0, 1], visSpin));
			var origin = [0, 0, 0];
			if (sim.mode === "floor") { origin = V.sub(sim.s.p, V.mul(e3, b.l)); }
			if (sim.mode === "ice") { var x = sim.s.x; origin = [x[0], x[1], sim.standH]; block.position.copy(W3([x[0], x[1], 0])); var c = M.iceCOM(sim.p, sim.s); comMark.position.copy(W3([c[0], c[1], 0.001])); }
			top.g.position.copy(W3(origin)); top.frame.quaternion.copy(Q3(fq)); top.rotor.quaternion.copy(Q3(rq));
			if (standRot) standRot.rotation.y = holderAng;
			/* arrows: angular momentum along L, torque of gravity (horizontal) at the centre of mass */
			var Lw = sim.mode === "ice" ? V.mul(e3, b.I3 * I.spin) : I.L, Lm = V.norm(Lw), L0 = sim.L0 || (sim.L0 = Lm || 1);
			var sz = 1 / scale, com = V.add(origin, V.mul(e3, b.l));
			setArrow(arrL, origin, Lw, 0.45 * sz * Math.min(2, Math.max(0.15, Lm / L0)));
			var tq = V.cross(V.mul(e3, b.l), [0, 0, -1]); setArrow(arrT, com, tq, 0.28 * sz * Math.min(1.2, Math.abs(Math.sin(tilt)) + 0.05));
			arrL.visible = !!S.showL && Lm > 0; arrT.visible = !!S.showT && Math.abs(Math.sin(tilt)) > 0.02;
			/* trail of the top of the axis */
			if (S.trail) {
				var tipP = V.add(origin, V.mul(e3, b.kind === "gyro" ? b.l + b.r * 1.22 : b.h)); trailPts.push(W3(tipP)); if (trailPts.length > 700) trailPts.shift();
				trail.geometry.setFromPoints(trailPts);
				if (blockTrail) { blockPts.push(W3([sim.s.x[0], sim.s.x[1], 0.003])); if (blockPts.length > 2000) blockPts.shift(); blockTrail.geometry.setFromPoints(blockPts); }
			}
			if (sim.mode === "floor") { var tg = W3(com).multiplyScalar(scale); camS.tgt.lerp(new THREE.Vector3(tg.x, Math.max(tg.y * 0.7, 0.15), tg.z), 0.06); }
		}
		function render() {
			var w = cv.clientWidth || 600, h = cv.clientHeight || 400; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
			var cp = Math.cos(camS.pitch); cam.position.set(camS.tgt.x + camS.dist * cp * Math.sin(camS.yaw), camS.tgt.y + camS.dist * Math.sin(camS.pitch), camS.tgt.z + camS.dist * cp * Math.cos(camS.yaw)); cam.lookAt(camS.tgt);
			renderer.render(scene, cam);
		}
		/* orbit camera: drag to turn, wheel / pinch to zoom, double-click resets */
		var ptrs = {}, drag = null, pinch = null;
		cv.addEventListener("pointerdown", function (e) { ptrs[e.pointerId] = [e.clientX, e.clientY]; try { cv.setPointerCapture(e.pointerId); } catch (er) {} var ids = Object.keys(ptrs); if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, yaw: camS.yaw, pitch: camS.pitch }; else if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), dist: camS.dist }; drag = null; } });
		cv.addEventListener("pointermove", function (e) { if (!ptrs[e.pointerId]) return; ptrs[e.pointerId] = [e.clientX, e.clientY]; var ids = Object.keys(ptrs);
			if (pinch && ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); camS.dist = clamp(pinch.dist * pinch.d / Math.max(10, d), 0.3, 8); }
			else if (drag) { camS.yaw = drag.yaw - (e.clientX - drag.x) * 0.008; camS.pitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.006, -0.2, 1.45); }
			if (!playing) render(); });
		function up(e) { delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null; if (!Object.keys(ptrs).length) drag = null; }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("wheel", function (e) { e.preventDefault(); camS.dist = clamp(camS.dist * Math.exp(e.deltaY * 0.0012), 0.3, 8); if (!playing) render(); }, { passive: false });
		function resetCam() { camS.yaw = 0.7; camS.pitch = 0.42; camS.dist = camS.base || 2.3; render(); }
		cv.addEventListener("dblclick", resetCam);
		cv.addEventListener("keydown", function (e) { var k = e.key; if (k === "ArrowLeft") camS.yaw += 0.08; else if (k === "ArrowRight") camS.yaw -= 0.08; else if (k === "ArrowUp") camS.pitch = clamp(camS.pitch + 0.06, -0.2, 1.45); else if (k === "ArrowDown") camS.pitch = clamp(camS.pitch - 0.06, -0.2, 1.45); else if (k === "+" || k === "=") camS.dist = clamp(camS.dist * 0.9, 0.3, 8); else if (k === "-") camS.dist = clamp(camS.dist / 0.9, 0.3, 8); else return; e.preventDefault(); render(); });
		$("gy-view").onclick = resetCam;
		$("gy-png").onclick = function () { render(); try { var a = document.createElement("a"); a.download = "gyroscope-simulator.png"; a.href = cv.toDataURL("image/png"); a.click(); } catch (e) { toast("Could not save the picture"); } };
		return { build: build, update: update, render: render, toggles: toggles, legend: true };
	}
	function legend() { $("gy-legend").innerHTML = '<span><i style="background:#ffd166"></i>Angular momentum L</span><span><i style="background:#ff5c6a"></i>Gravity torque</span>'; }

	/* ---------------- stage sizing (works with the shared View bar: Small / Medium / Large, Fill window) ---------------- */
	function fitStage() {
		var stage = $("gy-stage"), wrap = stage.parentNode, w = wrap.clientWidth || 600;
		wrap.setAttribute("data-mes-free", "1");
		var h = clamp(w * 0.58, 280, 620); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		stage.style.width = w + "px"; stage.style.height = Math.max(240, Math.round(h)) + "px";
		if (view) view.render();
	}
	function fitAll() { fitStage(); drawGraphs(); }
	if (window.ResizeObserver) new ResizeObserver(function () { fitStage(); }).observe($("gy-stage").parentNode);
	window.addEventListener("resize", fitAll); document.addEventListener("fullscreenchange", function () { setTimeout(fitAll, 60); });

	/* ---------------- loop ---------------- */
	var lastT = 0, lastRO = 0, lastG = 0;
	function frame(ts) {
		requestAnimationFrame(frame);
		if (document.hidden) { lastT = ts; return; }
		var dt = lastT ? Math.min(0.05, (ts - lastT) / 1000) : 0.016; lastT = ts;
		if (!sim || simbox.hidden) return;
		if (playing) stepSim(dt * Math.pow(10, S.spd));
		if (view) { view.update(playing ? dt : 0); view.render(); }
		if (ts - lastRO > 120) { lastRO = ts; readouts(); }
		if (ts - lastG > 90) { lastG = ts; drawGraphs(); }
	}

	/* ---------------- MES & Owen Liang tab ---------------- */
	var EXPS = [
		{ t: "The Gyrotop re-aligns itself when its holder is moved", who: "Owen Liang's Gyrotop",
		  obs: "The Gyrotop has a very sharp tip in a small magnetic seat, so it has very little room to slide or roll. Moving the holder around makes the spinning top re-align itself against gravity and against the magnet's pull; MES notes it can tilt against its own spin direction.",
		  std: "With a fixed pivot, friction in the seat acts on the top's motion relative to the holder. When the holder turns, that friction drags the spinning axis toward the holder's axis of turning (the same gyroscopic effect that lines up a damped gyrocompass with the Earth's rotation), while friction that resists the precession lowers it. The magnet's pull acts like extra weight on the top.",
		  diff: "Both describe the top re-aligning when the holder moves. The textbook explains it with angular momentum plus friction torques; MES reads it as a sign that the top behaves as if it had no angular momentum. Measuring the holder's turn rate, the spin and the axis angle over time would let the two be compared directly.",
		  run: [["pivot", "holder", "Turn the holder"], ["pivot", "pfric", "Precession friction"]] },
		{ t: "A gyroscope set on its foot rises like a spinning top", who: "MES Experiment 1",
		  obs: "A gyroscope placed as a spinning top stands up on its own, which MES takes as refuting the idea that tops rise because of sliding or rolling friction at the tip.",
		  std: "The standard model says a top (or a gyroscope used as one) rises because of friction where its rounded foot touches the table: as it spins, the foot slides sideways, the friction pushes the precession along, and hurrying the precession lifts the axis. With no friction at the foot it never rises. A gyroscope on its foot is, mechanically, a top, so the same applies.",
		  diff: "The observation (it rises) agrees with the model. They differ on the cause: the model needs friction at the foot; the article argues friction is not the explanation. A test: the same gyroscope on a near-frictionless surface (a polished, oiled glass plate) should, by the model, not rise.",
		  run: [["floor", "gyro", "Gyroscope as a top"], ["floor", "nofric", "No friction at the tip"]] },
		{ t: "Less precession friction is the key to rising", who: "MES Experiment 1",
		  obs: "Minimizing precessional friction makes the gyroscope (and so a top) rise.",
		  std: "Friction that holds the precession back makes a gyroscope's axis sink; a push that hurries the precession makes it rise. So less precession friction means less sinking, and any torque that speeds the precession up lifts it.",
		  diff: "Agree on the direction of the effect. The model adds that precession friction alone never lifts a gyroscope: something must push the precession along (at a top's foot, that is the sliding friction).",
		  run: [["pivot", "pfric", "Friction lowers it"], ["pivot", "push", "A push lifts it"]] },
		{ t: "Tape that adds spin friction makes it rise faster", who: "MES Experiment 1",
		  obs: "Adding tape to increase the spin friction can greatly increase the rate of rising.",
		  std: "Tape on the foot increases the friction coefficient at the contact. In the model, rising comes from that friction, so more of it gives faster rising, up to the point where the foot rolls instead of sliding.",
		  diff: "Agree: more friction at the foot, faster rising. The article calls it spin friction; in the model it is the friction between the foot and the table.",
		  run: [["floor", "rise", "Wood tip (μ 0.3)"], ["floor", "tape", "Tape tip (μ 0.8)"]] },
		{ t: "On an ice block, a fast gyroscope hardly moves the block", who: "MES ice-block experiments",
		  obs: "With the gyroscope on a block on ice, the block's sideways movement varies inversely with the spin: at high spin the precessing gyroscope does not even nudge the block; at slow spin it moves it, as Cambridge's frictionless-ice picture describes. MES concludes that precessional inertia varies.",
		  std: "For the axis to go round, the gyroscope's centre of mass must move in a circle, which needs a sideways force m·l·Ω² from the stand. Faster spin means slower precession Ω = m·g·l/(I₃ω), so the force falls as 1/spin². Ice is slippery but not frictionless: its grip μs(M+m)g holds the block still whenever the needed force is smaller. Cambridge's animation assumes frictionless ice, where the block always circles (radius m·l/(M+m)).",
		  diff: "Both agree that the block moves less at higher spin. They differ on why: the model keeps inertia constant and says the needed force drops below the ice's grip (see the chart below: for a toy gyroscope that happens at a few hundred rpm); MES reads it as inertia changing with spin. A test that would separate them: measure the ice's friction (tilt it until the block slides), then check the spin at which the block starts moving against the predicted critical spin; or repeat on an air table, where the model predicts the same small circle at every spin.",
		  run: [["ice", "fast", "Fast spin on ice"], ["ice", "slow", "Slow spin on ice"], ["ice", "zero", "Frictionless ice"]] },
		{ t: "Laithwaite: a precessing gyroscope seems weightless", who: "Eric Laithwaite (Royal Institution, 1974)",
		  obs: "Laithwaite lifted a heavy spinning gyroscope on a rod at arm's length with ease and said a precessing gyroscope behaves as if it had no weight or inertia in precession.",
		  std: "The model says the support still carries the full weight at all times (the vertical force on the pivot equals m·g in steady precession), but no torque is needed to hold the axis up, because the torque from the weight only turns it round. That is why it feels light to lift: the hand need not resist the twisting.",
		  diff: "The model and Laithwaite agree on what is felt as a twist; they differ on the weight. A bathroom scale under a precessing gyroscope's stand (the model says: no change in average reading) would settle it.",
		  run: [["pivot", "steady", "Smooth precession"], ["pivot", "push", "Hurry it: it rises"]] }
	];
	function paintExps() {
		var box = $("gy-exps"); if (box.childElementCount) return;
		box.innerHTML = EXPS.map(function (e, i) {
			return '<article class="gy-exp"><h3>' + esc(e.t) + '</h3><p class="gy-who">' + esc(e.who) + '</p><div class="gy-cols">' +
				'<div class="gy-col gy-col--obs"><h4>Reported observation</h4><p>' + esc(e.obs) + '</p></div>' +
				'<div class="gy-col gy-col--std"><h4>Textbook prediction</h4><p>' + esc(e.std) + '</p></div></div>' +
				'<div class="gy-diff"><h4>Agree or differ?</h4><p>' + esc(e.diff) + '</p></div>' +
				'<div class="gy-runs">' + e.run.map(function (r) { return '<button type="button" class="tu-btn tu-btn--ghost" data-tab="' + r[0] + '" data-p="' + r[1] + '">▶ ' + esc(r[2]) + "</button>"; }).join("") + "</div></article>";
		}).join("");
		Array.prototype.forEach.call(box.querySelectorAll("button[data-p]"), function (b) { b.onclick = function () { var t = b.getAttribute("data-tab"); showTab(t); applyPreset(t, b.getAttribute("data-p")); root.scrollIntoView({ behavior: "smooth", block: "start" }); }; });
		box.insertAdjacentHTML("beforeend", '<p class="tu-note gy-note">Applications in the article (torque over-unity, inertial propulsion, free energy) are not modelled here: the simulator follows Newton\'s laws, which keep momentum and energy constant by construction, so it cannot test them either way.</p>');
	}
	function drawIceChart() {
		var A = prep("gy-ic-stage", "gy-ic", function (w) { return clamp(w * 0.5, 220, 340); }), c = A.c, W = A.W, Hh = A.H;
		c.fillStyle = COL.bg; c.fillRect(0, 0, W, Hh);
		var b = M.body("gyro"), p = { m: b.m, I3: b.I3, l: b.l, mb: 1.5, mus: 0.03 }, r0 = { x: 56, y: 26, w: W - 70, h: Hh - 58 };
		var lx0 = Math.log10(200), lx1 = Math.log10(20000), ly0 = -5, ly1 = 1;
		var X = function (rpm) { return r0.x + (Math.log10(rpm) - lx0) / (lx1 - lx0) * r0.w; }, Y = function (F) { return r0.y + r0.h - (Math.log10(F) - ly0) / (ly1 - ly0) * r0.h; };
		c.font = "11px system-ui,sans-serif";
		for (var e = ly0; e <= ly1; e++) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(r0.x, Y(Math.pow(10, e))); c.lineTo(r0.x + r0.w, Y(Math.pow(10, e))); c.stroke(); txt(c, e >= 0 ? Math.pow(10, e) + " N" : (e >= -3 ? Math.pow(10, e + 3) + " mN" : Math.pow(10, e + 6) + " µN"), r0.x - 4, Y(Math.pow(10, e)), { al: "right", bl: "middle", col: COL.dim }); }
		[200, 500, 1000, 2000, 5000, 10000, 20000].forEach(function (r) { c.strokeStyle = COL.grid; c.beginPath(); c.moveTo(X(r), r0.y); c.lineTo(X(r), r0.y + r0.h); c.stroke(); txt(c, r >= 1000 ? r / 1000 + "k" : String(r), X(r), r0.y + r0.h + 4, { al: "center", bl: "top", col: COL.dim }); });
		txt(c, "Spin (rpm)", r0.x + r0.w, Hh - 6, { al: "right", col: COL.dim });
		txt(c, "Toy gyroscope (" + Math.round(b.m * 1000) + " g) on a 1.5 kg block: sideways force needed vs the ice's grip", 8, 15, { b: true, col: COL.dim });
		c.strokeStyle = COL.a; c.lineWidth = 2; c.beginPath(); for (var i = 0; i <= 200; i++) { var rp = Math.pow(10, lx0 + (lx1 - lx0) * i / 200), F = M.iceForce(p, M.radps(rp)); if (i) c.lineTo(X(rp), Y(F)); else c.moveTo(X(rp), Y(F)); } c.stroke();
		var lines = [[0.01, "#7ee2a8"], [0.03, "#4cc9f0"], [0.1, "#c4a7ff"]], note = [];
		lines.forEach(function (L) { var grip = L[0] * (p.mb + p.m) * M.G, wc = M.rpm(M.iceCriticalSpin(Object.assign({}, p, { mus: L[0] }))); c.strokeStyle = L[1]; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(r0.x, Y(grip)); c.lineTo(r0.x + r0.w, Y(grip)); c.stroke(); c.setLineDash([]); txt(c, "grip μ=" + L[0], r0.x + r0.w - 2, Y(grip) - 4, { al: "right", col: L[1] }); if (wc > 200 && wc < 20000) { c.fillStyle = L[1]; c.beginPath(); c.arc(X(wc), Y(grip), 4, 0, TAU); c.fill(); } note.push("μ " + L[0] + ": " + Math.round(wc) + " rpm"); });
		txt(c, "force needed = m·l·Ω²", X(260), Y(M.iceForce(p, M.radps(260))) + 14, { col: COL.a });
		$("gy-icnote").textContent = "Textbook critical spins (block stays still above them): " + note.join(" · ") + ". On frictionless ice the block would circle with radius " + fx(M.iceCircle(p) * 1000, 1) + " mm at any spin.";
	}

	/* ---------------- calculator ---------------- */
	function calc() {
		function v(id) { var x = parseFloat($(id).value); return isFinite(x) ? x : NaN; }
		var m = v("gc-m"), l = v("gc-l") / 100, I3 = Number($("gc-shape").value) * v("gc-rm") * Math.pow(v("gc-rr") / 100, 2), I1 = v("gc-i1"), w = M.radps(v("gc-rpm")), th = v("gc-tilt") * D;
		var b = { m: m, l: l, I1: I1, I3: I3 }, sp = M.steadyPrecession(b, w, th), p = { m: m, l: l, I3: I3, mb: v("gc-mb"), mus: v("gc-mu") };
		var it = [
			{ l: "Spin moment of inertia I₃", v: sci(I3) + " kg·m²" },
			{ l: "Angular momentum L = I₃ω", v: sci(I3 * w) + " kg·m²/s" },
			{ l: "Gravity torque at this tilt", v: sci(m * M.G * l * Math.sin(th)) + " N·m" },
			{ l: "Precession (slow, exact)", v: sp.ok ? fx(sp.slow, 4) + " rad/s" : "no steady precession", s: sp.ok ? turnTime(sp.slow) : "spin too slow for this tilt" },
			{ l: "Precession m·g·l / L", v: fx(M.fastTopPrecession(b, w), 4) + " rad/s" },
			{ l: "Fast precession root", v: sp.ok && isFinite(sp.fast) ? fx(sp.fast, 2) + " rad/s" : "–" },
			{ l: "Nutation rate", v: fx(M.nutationRate(b, w) / TAU, 2) + " per second" },
			{ l: "Nutation dip if let go", v: fx(M.nutationDip(b, w, th) / D, 3) + "°" },
			{ l: "Sleeping speed (upright)", v: l > 0 ? Math.round(M.rpm(M.sleepSpin(b))).toLocaleString("en-US") + " rpm" : "–" },
			{ l: "Ice: sideways force needed", v: fx(M.iceForce(p, w, th) * 1000, 2) + " mN" },
			{ l: "Ice: grip", v: fx(p.mus * (p.mb + m) * M.G * 1000, 1) + " mN" },
			{ l: "Ice: block slides below", v: isFinite(M.iceCriticalSpin(p, th)) ? Math.round(M.rpm(M.iceCriticalSpin(p, th))).toLocaleString("en-US") + " rpm" : "always moves" },
			{ l: "Frictionless ice: block circle", v: fx(M.iceCircle(p, th) * 1000, 2) + " mm radius" }
		];
		$("gc-out").innerHTML = it.map(function (x) { return '<div class="gy-ro"><span>' + esc(x.l) + "</span><b>" + esc(x.v) + "</b>" + (x.s ? "<small>" + esc(x.s) + "</small>" : "") + "</div>"; }).join("");
	}
	Array.prototype.forEach.call(panels.calc.querySelectorAll("input,select"), function (el) { el.addEventListener("input", calc); });

	/* ---------------- start ---------------- */
	if (qs.get("p") && M.PRESETS[S.tab]) { var pre = qs.get("p"); showTab(S.tab, true); applyPreset(S.tab, pre); } else showTab(S.tab, true);
	legend(); requestAnimationFrame(frame);
	function startView() {
		loadThree().then(function (THREE) { view = makeView(THREE); if (!view) throw new Error("no WebGL"); view.build(); fitStage(); })
			.catch(function () { view = { failed: true, build: function () {}, update: function () {}, render: function () {}, toggles: function () {} }; var m = $("gy-msg"); m.hidden = false; m.textContent = "The 3D view could not load (no WebGL or no connection). The simulation, numbers and graphs below still run."; });
	}
	if (document.readyState === "complete") startView(); else window.addEventListener("load", startView);
	window.MESGyroDebug = { sim: function () { return sim; }, step: function (s) { stepSim(s); readouts(); drawGraphs(); if (view) { view.update(0.02); view.render(); } }, H: function () { return H; }, preset: applyPreset, tab: showTab };
})();
