/* MES Space Shuttle Simulator: the "Fly the Shuttle" tab (simulation, burn planner, 3D view, ground track, station view) and tab routing.
   Physics in lib.js (MESShuttle), 3D in view3d.js (SXView), map in map.js (SXMap), the other tabs in tabs.js (SXTabs). */
(function () {
	"use strict";
	var S = window.MESShuttle, D = S.D2R, RE = S.RE, EI = S.EI_ALT;
	var root = document.getElementById("sx"); if (!root) return;
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmtN(x, dp) { return x.toLocaleString("en-US", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }); }
	var LS = "mes-space-shuttle:v1", pref = {};
	try { pref = JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (e) { pref = {}; }
	function savePref() { try { localStorage.setItem(LS, JSON.stringify(pref)); } catch (e) {} }

	/* ---------------- tabs ---------------- */
	var tabs = root.querySelectorAll(".sx-tabs [data-tab]"), curTab = "fly";
	function showTab(id, noUrl) {
		if (!root.querySelector('[data-panel="' + id + '"]')) id = "fly";
		curTab = id;
		tabs.forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === id ? "true" : "false"); });
		root.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== id; });
		if (id !== "fly" && window.SXTabs) window.SXTabs.show(id);
		if (!noUrl) { try { var u = new URL(location.href); if (id === "fly") u.searchParams.delete("tab"); else u.searchParams.set("tab", id); history.replaceState(null, "", u); } catch (e) {} }
		if (id === "fly") { needPlan = true; setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 30); }
	}
	tabs.forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });

	/* ---------------- missions ---------------- */
	var MISSIONS = [
		{ id: "free", name: "Free flight", alt: 330, inc: 28.5, goal: "A Shuttle in a 330 km orbit from Florida. Try a burn: drag the yellow forward arrow at the orange dot and watch the far side of the orbit rise." },
		{ id: "raise", name: "Raise the orbit", alt: 330, inc: 28.5, goalAlt: 550, goal: "Climb to 550 km, Hubble's height. Use <b>Raise or lower to 550 km</b>, or plan it yourself: a forward burn now, and another half an orbit later at the new high point to make the orbit round." },
		{ id: "tilt", name: "Tilt the orbit", alt: 350, inc: 28.5, goal: "Turn the orbit's plane by half a degree. Burns sideways (normal) work best where the orbit crosses the equator. Notice how much propellant even half a degree costs." },
		{ id: "iss", name: "Catch the ISS", alt: 300, inc: 51.6, target: { name: "ISS", alt: 415, lead: 40 }, goal: "The ISS is 40° ahead and 115 km higher. You are lower, so you are faster and catching up. Press <b>Catch the station</b>: it waits for the right angle, then flies a Hohmann transfer. Finish with the small pushes in the station view." },
		{ id: "hubble", name: "Catch Hubble", alt: 380, inc: 28.5, target: { name: "Hubble", alt: 540, lead: 60 }, goal: "Repair mission: Hubble flies at 540 km, 60° ahead of you. Plan the transfer, then close in with the station view." },
		{ id: "deorbit", name: "De-orbit and land", alt: 330, inc: 51.6, goal: "Time to come home. Choose a runway and press <b>De-orbit to</b>: the planner finds the pass and burn time that bring the glide down near it. Then speed up time and watch the entry." }
	];
	var mBox = $("sx-missions");
	MISSIONS.forEach(function (m) { var b = document.createElement("button"); b.type = "button"; b.textContent = m.name; b.setAttribute("data-m", m.id); b.addEventListener("click", function () { startMission(m.id); }); mBox.appendChild(b); });
	S.SITES.forEach(function (s) { var o = document.createElement("option"); o.value = s.id; o.textContent = s.short; $("sx-a-site").appendChild(o); });
	var anyOpt = document.createElement("option"); anyOpt.value = "any"; anyOpt.textContent = "nearest runway"; $("sx-a-site").appendChild(anyOpt);

	/* ---------------- state ---------------- */
	var SPEEDS = [1, 2, 5, 10, 30, 60, 120, 300, 600, 1200, 3000];
	var st = { t: 0, epoch: Date.now(), nodes: [], sel: null, phase: "orbit", trail: [], mapTrail: [], speed: 5, paused: false, j2: pref.j2 !== false, nid: 1, fire: 0, hide: {} };
	var needPlan = true;
	function gm(t) { return S.gmst(st.epoch + t * 1000); }
	function makeOrbit(alt, inc, raan, u, t) {
		var p = S.el2rv({ a: RE + alt * 1000, e: 0, i: inc * D, raan: raan, argp: 0, nu: u });
		return new S.Orbit(p.r, p.v, t, st.j2);
	}
	function startMission(id, opts) {
		opts = opts || {};
		var m = MISSIONS.filter(function (x) { return x.id === id; })[0] || MISSIONS[0];
		st.mission = m.id; st.t = 0; st.epoch = Date.now(); st.nodes = []; st.sel = null; st.phase = "orbit"; st.entry = null; st.trail = []; st.mapTrail = []; st.result = null;
		st.mass = S.SHUTTLE.mass; st.prop = S.SHUTTLE.omsProp; st.dvUsed = 0; st.docked = false;
		var alt = opts.alt || m.alt, raan = S.wrap(gm(0) - 95 * D);
		st.orb = makeOrbit(alt, m.inc, raan, 10 * D, 0);
		st.target = null; st.tname = "";
		if (m.target) { st.target = makeOrbit(m.target.alt, m.inc, raan, (10 + m.target.lead) * D, 0); st.tname = m.target.name; }
		mBox.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === m.id ? "true" : "false"); });
		$("sx-goal").innerHTML = m.goal;
		if (m.goalAlt) $("sx-a-alt").value = m.goalAlt;
		$("sx-a-note").textContent = "";
		if (opts.deorbitDv) { addNode({ t: 300, pro: -opts.deorbitDv }); }
		if (viewObj) { viewObj.setFollow($("sx-cam").value); aimCam(); }
		st.speed = 5; updSpeed();
		needPlan = true; refreshNodes();
		flash("");
		try { var u = new URL(location.href); u.searchParams.set("m", m.id); history.replaceState(null, "", u); } catch (e) {}
	}

	/* ---------------- burn chain ---------------- */
	function sorted() { return st.nodes.slice().sort(function (a, b) { return a.t - b.t; }); }
	var entryCache = {};
	function entryFor(v, g) {
		var key = Math.round(v / 2) + ":" + Math.round(g / D * 200) + ":" + Math.round(st.mass / 1000);
		if (!entryCache[key]) {
			var beta = Math.min(st.mass, 110000) * 0.83 / (S.SHUTTLE.cd * S.SHUTTLE.area);
			entryCache[key] = { mid: S.entry(EI, v, g, { beta: beta }), short: S.entry(EI, v, g, { beta: beta, drag: 1.6 }), long: S.entry(EI, v, g, { beta: beta, drag: 0.65 }) };
		}
		return entryCache[key];
	}
	/* landing prediction for an orbit that dips below the entry interface */
	function predictLanding(o, from) {
		var tE = o.nextRadius(from, RE + EI, false); if (tE == null) return null;
		var s = o.at(tE), rel = S.relEntry(s.r, s.v, gm(tE)), en = entryFor(rel.v, rel.gamma);
		var land = S.destination(rel.lat, rel.lon, rel.hdg, en.mid.landRange);
		var site = nearestSite(land, en, rel);
		var fp = [], A = (en.long.landRange - en.short.landRange) / 2, C = S.crossRange(1), mid = (en.long.landRange + en.short.landRange) / 2;
		for (var k = 0; k <= 48; k++) {
			var a = k / 48 * Math.PI * 2, along = mid + Math.cos(a) * A, p = S.destination(rel.lat, rel.lon, rel.hdg, along);
			fp.push(S.destination(p.lat, p.lon, rel.hdg + Math.PI / 2, Math.sin(a) * C * (1 - Math.abs(Math.cos(a)) * 0.15)));
		}
		return { tE: tE, rel: rel, en: en.mid, land: land, site: site, foot: fp };
	}
	/* a runway is reachable when it is inside the footprint (along-track window and the cross-range) */
	function nearestSite(land, en, rel, only) {
		var best = null;
		(only || S.SITES).forEach(function (s) {
			var la = s.lat * D, lo = s.lon * D, d = S.gcDist(rel.lat, rel.lon, la, lo);
			var brg = Math.atan2(Math.sin(lo - rel.lon) * Math.cos(la), Math.cos(rel.lat) * Math.sin(la) - Math.sin(rel.lat) * Math.cos(la) * Math.cos(lo - rel.lon));
			var along = d * Math.cos(brg - rel.hdg), cross = d * Math.sin(brg - rel.hdg);
			var ok = along > en.short.landRange - 150e3 && along < en.long.landRange + 150e3 && Math.abs(cross) < S.crossRange(1);
			var miss = S.gcDist(land.lat, land.lon, la, lo);
			if (!best || (ok && !best.ok) || (ok === best.ok && miss < best.miss)) best = { s: s, ok: ok, miss: miss, d: d, along: along, cross: cross };
		});
		return best;
	}
	function plan() {
		var o = st.orb, list = sorted(), out = [];
		list.forEach(function (n) {
			if (n.t < st.t) n.t = st.t;
			var s = o.at(n.t), v2 = S.applyBurn(s.r, s.v, n), o2 = new S.Orbit(s.r, v2, n.t, st.j2);
			n.before = o; n.after = o2; n.state = s; n.pred = o2.el.rp < RE + EI ? predictLanding(o2, n.t) : null;
			if (o2.el.rp < RE) n.pred = n.pred || null;
			out.push(n); o = o2;
		});
		st.chain = out; st.final = o;
		st.pred = st.phase === "orbit" && st.orb.el.rp < RE + EI ? predictLanding(st.orb, st.t) : null;
		needPlan = false;
	}
	function addNode(n) {
		n.id = st.nid++; n.pro = n.pro || 0; n.nrm = n.nrm || 0; n.rad = n.rad || 0; n.t = st.t + (n.t == null ? 60 : n.t);
		st.nodes.push(n); st.sel = n.id; needPlan = true; refreshNodes(); return n;
	}
	function selNode() { return st.nodes.filter(function (n) { return n.id === st.sel; })[0] || null; }

	/* decompose a wanted velocity change (vector) into pro / nrm / rad at state s */
	function comps(s, dv) { var f = S.frame(s.r, s.v); return { pro: S.v.dot(dv, f.pro), nrm: S.v.dot(dv, f.nrm), rad: S.v.dot(dv, f.rad) }; }

	/* ---------------- automatic plans ---------------- */
	function lastOrbit() { if (needPlan) plan(); return { o: st.final, t: st.chain.length ? st.chain[st.chain.length - 1].t + 1 : st.t }; }
	function note(t) { $("sx-a-note").innerHTML = t; }
	function autoHohmann() {
		var alt = parseFloat($("sx-a-alt").value); if (!(alt >= 150 && alt <= 40000)) return note("Pick a height between 150 and 40,000 km.");
		var L = lastOrbit(), o = L.o, r2 = RE + alt * 1000;
		var t1 = o.el.e > 0.002 ? o.nextApsis(L.t, r2 < o.el.a) : L.t + 120;
		var s1 = o.at(t1), r1 = S.v.norm(s1.r), a = (r1 + r2) / 2, v1 = S.v.norm(s1.v);
		var n1 = addNode({ t: t1 - st.t, pro: S.visViva(r1, a) - v1 });
		plan();
		var o2 = n1.after, t2 = t1 + o2.el.T / 2, s2 = o2.at(t2), v2 = S.v.norm(s2.v);
		addNode({ t: t2 - st.t, pro: Math.sqrt(S.MU / S.v.norm(s2.r)) - v2 });
		note("Planned two burns: " + S.fmtV(Math.abs(n1.pro)) + " now-ish and another half an orbit (" + S.fmtTime(o2.el.T / 2) + ") later. Total " + S.fmtV(S.hohmann(r1, r2).total) + ".");
	}
	function autoCirc() {
		var L = lastOrbit(), o = L.o; if (o.el.e < 0.0005) return note("The orbit is already round.");
		var t = o.nextApsis(L.t, true), s = o.at(t), want = S.v.mul(S.v.unit(s.v), Math.sqrt(S.MU / S.v.norm(s.r)));
		var c = comps(s, S.v.sub(want, s.v)); addNode({ t: t - st.t, pro: c.pro, nrm: 0, rad: c.rad });
		note("A " + S.fmtV(Math.abs(c.pro)) + " burn at the next apogee makes the orbit round.");
	}
	function nextEquator(o, t0) {
		var dt = 20, prev = o.at(t0).r[2];
		for (var t = t0 + dt; t < t0 + (o.el.T || 6000) * 1.1; t += dt) {
			var z = o.at(t).r[2];
			if ((prev < 0) !== (z < 0)) { var lo = t - dt, hi = t; for (var k = 0; k < 40; k++) { var m = (lo + hi) / 2; if ((o.at(m).r[2] < 0) === (prev < 0)) lo = m; else hi = m; } return { t: (lo + hi) / 2, asc: z > 0 }; }
			prev = z;
		}
		return null;
	}
	function autoTilt() {
		var di = parseFloat($("sx-a-di").value) * D; if (!di) return note("Type how many degrees to tilt.");
		var L = lastOrbit(), o = L.o, eq = nextEquator(o, L.t + 30); if (!eq) return;
		var s = o.at(eq.t), v = S.v.norm(s.v), h = S.v.unit(S.v.cross(s.r, s.v)), r = S.v.unit(s.r);
		// turn the velocity about the radius by the angle; + raises the inclination at the ascending node
		var ang = eq.asc ? -di : di, vt = rot(s.v, r, ang);
		var c = comps(s, S.v.sub(vt, s.v)); addNode({ t: eq.t - st.t, pro: c.pro, nrm: c.nrm, rad: c.rad });
		note("At the " + (eq.asc ? "northbound" : "southbound") + " equator crossing: " + S.fmtV(S.burnSize(c)) + " (2 v sin(Δi/2) with v = " + S.fmtV(v) + ").");
		void h;
	}
	function rot(v, k, a) { // Rodrigues
		var c = Math.cos(a), s = Math.sin(a), kv = S.v.cross(k, v), kd = S.v.dot(k, v);
		return S.v.add(S.v.add(S.v.mul(v, c), S.v.mul(kv, s)), S.v.mul(k, kd * (1 - c)));
	}
	function autoPlane() {
		if (!st.target) return note("This mission has no station. Pick <b>Catch the ISS</b> or <b>Catch Hubble</b>.");
		var L = lastOrbit(), o = L.o, line = S.v.cross(S.v.cross(o.at(L.t).r, o.at(L.t).v), S.v.cross(st.target.at(L.t).r, st.target.at(L.t).v));
		if (S.v.norm(line) < 1e-3 * S.v.norm(S.v.cross(o.at(L.t).r, o.at(L.t).v)) * S.v.norm(S.v.cross(st.target.at(L.t).r, st.target.at(L.t).v)) / (RE * 7700)) return note("The planes already match (difference under 0.01°).");
		var best = null, T = o.el.T || 5600;
		for (var t = L.t + 30; t < L.t + T; t += 15) { var s = o.at(t), ht = S.v.unit(S.v.cross(st.target.at(t).r, st.target.at(t).v)), d = Math.abs(S.v.dot(S.v.unit(s.r), ht)); if (!best || d < best.d) best = { t: t, d: d }; }
		var s1 = o.at(best.t), ht1 = S.v.unit(S.v.cross(st.target.at(best.t).r, st.target.at(best.t).v));
		var vin = S.v.sub(s1.v, S.v.mul(ht1, S.v.dot(s1.v, ht1))); vin = S.v.mul(S.v.unit(vin), S.v.norm(s1.v));
		var c = comps(s1, S.v.sub(vin, s1.v)); addNode({ t: best.t - st.t, pro: c.pro, nrm: c.nrm, rad: c.rad });
		note("Burn sideways where the two orbits cross: " + S.fmtV(S.burnSize(c)) + " to line up with the " + esc(st.tname) + "'s plane.");
	}
	function autoRdv() {
		if (!st.target) return note("This mission has no station. Pick <b>Catch the ISS</b> or <b>Catch Hubble</b>.");
		var L = lastOrbit(), o = L.o, a1 = o.el.a, a2 = st.target.el.a;
		var lead = S.leadAngle(a1, a2), n1 = Math.sqrt(S.MU / (a1 * a1 * a1)), n2 = Math.sqrt(S.MU / (a2 * a2 * a2));
		var s0 = o.at(L.t), ph = S.phase(s0.r, s0.v, st.target.at(L.t).r);
		var w = S.waitFor(ph, lead, n1, n2); if (w < 120) w += 2 * Math.PI / Math.abs(n1 - n2);
		// refine the start time numerically (J2 and a slightly oval orbit shift it a little)
		var t1 = L.t + w;
		for (var it = 0; it < 4; it++) {
			var s = o.at(t1), r1 = S.v.norm(s.r), h = S.hohmann(r1, a2), tArr = t1 + h.tof;
			var phA = S.phase(s.r, s.v, st.target.at(tArr).r) - Math.PI; // where the target will be on arrival vs where we will arrive
			t1 += S.wrapPi(phA) / (n1 - n2) * 0.9;
		}
		var sA = o.at(t1), rA = S.v.norm(sA.r), aT = (rA + a2) / 2, nA = addNode({ t: t1 - st.t, pro: S.visViva(rA, aT) - S.v.norm(sA.v) });
		plan();
		var t2 = t1 + nA.after.el.T / 2, sB = nA.after.at(t2), tv = st.target.at(t2);
		var c = comps(sB, S.v.sub(tv.v, sB.v)); addNode({ t: t2 - st.t, pro: c.pro, nrm: c.nrm, rad: c.rad });
		var miss = S.v.norm(S.v.sub(sB.r, tv.r));
		note("Wait " + S.fmtTime(t1 - st.t) + " for the " + esc(st.tname) + " to be " + (lead / D).toFixed(1) + "° ahead, burn " + S.fmtV(nA.pro) + " forward, coast " + S.fmtTime(t2 - t1) + " up, then match its speed. Predicted miss: " + S.fmtKm(miss) + ". Finish with the station view's pushes.");
	}
	function autoDeorbit() {
		var dv = parseFloat($("sx-a-dv").value); if (!(dv >= 20 && dv <= 1000)) return note("Choose a burn between 20 and 1,000 m/s.");
		var want = $("sx-a-site").value, L = lastOrbit(), o = L.o;
		if (o.el.rp < RE + EI) return note("You are already coming down.");
		var best = null, run = null, sites = want === "any" ? S.SITES : S.SITES.filter(function (x) { return x.id === want; });
		for (var t = L.t + 120; t < L.t + 86400; t += 30) {
			var s = o.at(t), v2 = S.applyBurn(s.r, s.v, { pro: -dv }), o2 = new S.Orbit(s.r, v2, t, st.j2);
			if (o2.el.rp >= RE + EI) { best = { none: true }; break; }
			var p = predictLanding(o2, t); if (!p) continue;
			var en = entryFor(p.rel.v, p.rel.gamma), ns = nearestSite(p.land, en, p.rel, sites);
			if (!best || ns.miss < best.m) best = { t: t, m: ns.miss, site: ns.s, p: p };
			if (ns.ok) { if (!run || ns.miss < run.m) run = { t: t, m: ns.miss, site: ns.s, p: p }; }
			else if (run) break;     // the first pass that can reach the runway, at its closest
		}
		if (run) best = run;
		if (!best || best.none) return note("A " + dv + " m/s burn does not bring the orbit down to 120 km. Try more.");
		addNode({ t: best.t - st.t, pro: -dv });
		plan();
		var n = selNode(), p = n.pred, ok = p && p.site && p.site.ok;
		note("Burn " + dv + " m/s backwards in " + S.fmtTime(best.t - st.t) + ". Entry interface " + S.fmtTime(p.tE - best.t) + " later at " + (p.rel.gamma / D).toFixed(2) + "°, " + S.fmtV(p.rel.v) + " (air-relative). The glide " + (ok ? "can reach <b>" + esc(p.site.s.short) + "</b> (it is " + S.fmtKm(p.site.miss, 0) + " from the straight-ahead landing point, inside the Shuttle's ~1,300 km cross-range)." : "lands " + S.fmtKm(best.m, 0) + " from " + esc(best.site.short) + ": no runway in reach on the next day of passes."));
	}
	[["sx-a-hoh", autoHohmann], ["sx-a-circ", autoCirc], ["sx-a-inc", autoTilt], ["sx-a-plane", autoPlane], ["sx-a-rdv", autoRdv], ["sx-a-deo", autoDeorbit]].forEach(function (p) {
		$(p[0]).addEventListener("click", function () { if (st.phase !== "orbit" && st.phase !== "docked") return note("Not while coming down."); if (st.phase === "docked") undock(); p[1](); needPlan = true; refreshNodes(); });
	});

	/* ---------------- node editor ---------------- */
	function sl2v(x) { return Math.sign(x) * 500 * Math.pow(Math.abs(x), 3); }
	function v2sl(v) { return Math.sign(v) * Math.pow(Math.min(1, Math.abs(v) / 500), 1 / 3); }
	function refreshNodes() {
		var box = $("sx-nodes"), list = sorted();
		box.innerHTML = "";
		list.forEach(function (n, i) {
			var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", n.id === st.sel ? "true" : "false");
			b.textContent = "Burn " + (i + 1) + " · " + S.burnSize(n).toFixed(1) + " m/s"; b.addEventListener("click", function () { st.sel = n.id; refreshNodes(); });
			box.appendChild(b);
		});
		var n = selNode(); if (!n && list.length) { st.sel = list[0].id; n = list[0]; }
		$("sx-node-ed").hidden = !n; $("sx-none").hidden = !!n;
		if (n) ["pro", "nrm", "rad"].forEach(function (k) { var inp = $("sx-" + k); if (document.activeElement !== inp) inp.value = (Math.round(n[k] * 10) / 10).toString(); if (document.activeElement !== $("sx-" + k + "-r")) $("sx-" + k + "-r").value = v2sl(n[k]); });
		needPlan = true; editorText();
	}
	function editorText() {
		var n = selNode(); if (!n) return;
		if (needPlan) plan();
		$("sx-when").textContent = (n.t - st.t > 0 ? "in " + S.fmtTime(n.t - st.t) : "now") + " · " + whereText(n);
		var o = n.after, el = o.el, dv = S.burnSize(n), prop = S.propFor(st.mass, dv, S.SHUTTLE.isp), leftDv = S.rocketDv(st.mass, st.prop, S.SHUTTLE.isp);
		var before = 0; sorted().forEach(function (m) { if (m.t < n.t || (m.t === n.t && m.id < n.id)) before += S.burnSize(m); });
		var after = '<div class="sx-pv"><span>New orbit</span><b>' + (el.e < 1 ? Math.round(el.ha / 1000) + " × " + Math.round(el.hp / 1000) + " km" : "escapes Earth!") + "</b></div>" +
			'<div class="sx-pv"><span>Period</span><b>' + (el.e < 1 ? S.fmtTime(el.T) : "–") + "</b></div>" +
			'<div class="sx-pv"><span>Inclination</span><b>' + (el.i / D).toFixed(2) + "°</b></div>" +
			'<div class="sx-pv"><span>This burn</span><b>' + dv.toFixed(1) + " m/s</b><small>" + fmtN(prop) + " kg, about " + Math.max(1, Math.round(prop / 30)) + " s on both OMS engines</small></div>";
		var warn = "";
		var plannedDv = before + dv;
		if (plannedDv > leftDv) warn += '<p class="sx-warn">⚠ The burns so far add up to ' + plannedDv.toFixed(0) + " m/s but only " + leftDv.toFixed(0) + " m/s of OMS propellant is left. A real Shuttle could not do this.</p>";
		if (n.pred) {
			var p = n.pred;
			warn += '<p class="sx-info">🔥 This orbit comes down. Entry interface (120 km) ' + S.fmtTime(p.tE - n.t) + " after the burn, at " + S.fmtV(p.rel.v) + " and " + (p.rel.gamma / D).toFixed(2) + "° (the Shuttle aimed for about −1.2°). Peak " + p.en.peakG.toFixed(1) + " g, landing about " + S.fmtTime(p.en.landTime) + " later, " +
				(p.site && p.site.ok ? "in reach of <b>" + esc(p.site.s.short) + "</b>." : "with no runway in reach.") + " Red outline on the map: where the glide can land.</p>";
			if (p.rel.gamma / D < -3) warn += '<p class="sx-warn">⚠ Very steep: g-forces and heating far above what the Shuttle was built for.</p>';
		} else if (el.rp < RE + EI + 30000 && el.rp >= RE + EI) warn += '<p class="sx-info">The low point is ' + Math.round(el.hp / 1000) + " km: grazing the top of the air. Not enough to come down soon; the Shuttle needed it well under 120 km.</p>";
		$("sx-preview").innerHTML = '<div class="sx-pvs">' + after + "</div>" + warn;
	}
	function whereText(n) {
		var s = n.state || st.orb.at(n.t), r = S.v.norm(s.r), o = n.before;
		if (o && o.el.e > 0.001) { var ta = S.wrap(o.elAt ? o.elAt(n.t).nu : 0); if (Math.abs(S.wrapPi(ta - Math.PI)) < 0.05) return "at apogee"; if (Math.abs(S.wrapPi(ta)) < 0.05) return "at perigee"; }
		var ll = S.latLon(s.r, gm(n.t)); return Math.round((r - RE) / 1000) + " km up over " + latLonText(ll);
	}
	function latLonText(ll) { return Math.abs(ll.lat / D).toFixed(1) + "°" + (ll.lat >= 0 ? "N" : "S") + " " + Math.abs(ll.lon / D).toFixed(1) + "°" + (ll.lon >= 0 ? "E" : "W"); }
	["pro", "nrm", "rad"].forEach(function (k) {
		$("sx-" + k).addEventListener("input", function () { var n = selNode(); if (!n) return; var v = parseFloat(this.value); n[k] = isFinite(v) ? Math.max(-4000, Math.min(4000, v)) : 0; $("sx-" + k + "-r").value = v2sl(n[k]); needPlan = true; editorText(); updNodeBtns(); });
		$("sx-" + k + "-r").addEventListener("input", function () { var n = selNode(); if (!n) return; n[k] = Math.round(sl2v(parseFloat(this.value)) * 10) / 10; $("sx-" + k).value = n[k]; needPlan = true; editorText(); updNodeBtns(); });
	});
	function updNodeBtns() { var list = sorted(); $("sx-nodes").querySelectorAll("button").forEach(function (b, i) { if (list[i]) b.textContent = "Burn " + (i + 1) + " · " + S.burnSize(list[i]).toFixed(1) + " m/s"; }); }
	$("sx-add").addEventListener("click", function () { if (st.phase === "docked") undock(); var L = lastOrbit(); addNode({ t: L.t - st.t + 300, pro: 10 }); });
	$("sx-zero").addEventListener("click", function () { var n = selNode(); if (!n) return; n.pro = n.nrm = n.rad = 0; refreshNodes(); });
	$("sx-del").addEventListener("click", function () { st.nodes = st.nodes.filter(function (n) { return n.id !== st.sel; }); st.sel = null; refreshNodes(); });
	$("sx-now").addEventListener("click", function () { var n = selNode(); if (!n || st.phase === "entry" || st.phase === "landed") return; if (st.phase === "docked") undock(); n.t = st.t; execute(n); refreshNodes(); });
	$("sx-whenbtns").addEventListener("click", function (e) {
		var b = e.target.closest("[data-w]"), n = selNode(); if (!b || !n) return;
		var w = b.getAttribute("data-w"), o = n.before || st.orb, t = n.t;
		if (w === "m-1") t -= 60; else if (w === "m1") t += 60; else if (w === "now") t = st.t + 60;
		else if (w === "apo" || w === "peri") { if (o.el.e < 0.0008) return flash("The orbit is round: no clear apogee or perigee yet."); t = o.nextApsis(Math.max(st.t, t - 1) + 1, w === "apo"); }
		else if (w === "node") { var q = nextEquator(o, Math.max(st.t, n.t) + 10); if (q) t = q.t; }
		n.t = Math.max(st.t, t); needPlan = true; editorText();
	});

	/* ---------------- running ---------------- */
	function burnMass(dv) { var p = S.propFor(st.mass, dv, S.SHUTTLE.isp); st.prop = Math.max(0, st.prop - p); st.mass -= p; st.dvUsed += dv; }
	function execute(n) {
		var s = st.orb.at(n.t), v2 = S.applyBurn(s.r, s.v, n), dv = S.burnSize(n);
		st.orb = new S.Orbit(s.r, v2, n.t, st.j2); burnMass(dv);
		st.nodes = st.nodes.filter(function (x) { return x !== n; }); if (st.sel === n.id) st.sel = null;
		st.fire = performance.now() + 1800; flash("🔥 Burn: " + dv.toFixed(1) + " m/s");
		needPlan = true; refreshNodes();
	}
	function undock() { st.docked = false; st.phase = "orbit"; var s = st.orb.at(st.t); st.orb = new S.Orbit(s.r, S.applyBurn(s.r, s.v, { pro: -0.3 }), st.t, st.j2); flash("Undocked: backing away at 0.3 m/s"); }
	function startEntry(tE) {
		var s = st.orb.at(tE), rel = S.relEntry(s.r, s.v, gm(tE)), en = entryFor(rel.v, rel.gamma);
		var land = S.destination(rel.lat, rel.lon, rel.hdg, en.mid.landRange), site = nearestSite(land, en, rel);
		st.phase = "entry"; st.entry = { t0: tE, rel: rel, e: en.mid, land: land, site: site && site.ok ? site : null };
		st.nodes = []; st.sel = null; refreshNodes();
		if (st.speed > 4) { st.speed = 4; updSpeed(); }
		flash("Entry interface: 120 km at " + S.fmtV(rel.v));
	}
	/* where the Shuttle is during the glide: along its heading, curving toward the chosen runway */
	function entryPos(t) {
		var E = st.entry, e = E.e, dt = t - E.t0, P = e.prof, s, h, v, g, q;
		if (dt >= e.time) { var f = Math.min(1, (dt - e.time) / (e.landTime - e.time)); s = e.range + f * (e.landRange - e.range); h = 25000 * (1 - f) * (1 - f * 0.3); v = dt >= e.landTime ? 0 : 760 * (1 - f) + 95 * f; g = 1; q = 0; }
		else {
			var k = 0; while (k < P.length - 2 && P[k + 1].t < dt) k++;
			var a = P[k], b = P[k + 1], u = b.t > a.t ? Math.max(0, Math.min(1, (dt - a.t) / (b.t - a.t))) : 0;
			s = a.s + (b.s - a.s) * u; h = a.h + (b.h - a.h) * u; v = a.v + (b.v - a.v) * u; g = a.g + (b.g - a.g) * u; q = a.q + (b.q - a.q) * u;
		}
		var frac = s / e.landRange, p1 = S.destination(E.rel.lat, E.rel.lon, E.rel.hdg, s), ll = p1;
		if (E.site) {
			var la = E.site.s.lat * D, lo = E.site.s.lon * D, dS = S.gcDist(E.rel.lat, E.rel.lon, la, lo);
			var brg = Math.atan2(Math.sin(lo - E.rel.lon) * Math.cos(la), Math.cos(E.rel.lat) * Math.sin(la) - Math.sin(E.rel.lat) * Math.cos(la) * Math.cos(lo - E.rel.lon));
			var p2 = S.destination(E.rel.lat, E.rel.lon, brg, Math.min(1, frac) * dS), w = Math.min(1, frac) * Math.min(1, frac) * (3 - 2 * Math.min(1, frac));
			var dlon = S.wrapPi(p2.lon - p1.lon); ll = { lat: p1.lat + (p2.lat - p1.lat) * w, lon: S.wrapPi(p1.lon + dlon * w) };
		}
		return { lat: ll.lat, lon: ll.lon, h: h, v: v, g: g, q: q, s: s, done: dt >= e.landTime };
	}
	function entryEci(t, p) { return S.ecef2eci(S.llToVec(p.lat, p.lon, RE + p.h), gm(t)); }
	function step(dt) {
		if (st.phase === "landed") return;
		var t1 = st.t + dt;
		if (st.phase === "entry") { st.t = t1; var p = entryPos(st.t); if (p.done) land(p); return; }
		var guard = 0;
		while (guard++ < 20) {
			var list = sorted(), next = list.length ? list[0] : null;
			var tE = st.orb.el.rp < RE + EI ? st.orb.nextRadius(st.t, RE + EI, false) : null;
			if (st.orb.el.rp < RE && tE == null) tE = st.t; // inside the Earth: start the entry at once
			var tn = next && next.t <= t1 ? next.t : Infinity, te = tE != null && tE <= t1 ? tE : Infinity;
			if (tn === Infinity && te === Infinity) break;
			if (tn <= te) { st.t = tn; execute(next); }
			else { st.t = te; startEntry(te); var rest = t1 - st.t; st.t += rest; return; }
		}
		st.t = t1;
		if (st.docked && st.target) st.orb = st.target;
	}
	function land(p) {
		st.phase = "landed";
		var best = null; S.SITES.forEach(function (s) { var d = S.gcDist(p.lat, p.lon, s.lat * D, s.lon * D); if (!best || d < best.d) best = { s: s, d: d }; });
		st.result = best && best.d < 40e3 ? "✅ Wheels stop at " + best.s.name + ". Welcome home!" : "Landed at " + latLonText(p) + ", " + S.fmtKm(best.d, 0) + " from " + best.s.short + (best.d > 400e3 ? ". No runway there: this would have been a bail-out." : ".");
		flash(st.result, 1e9); st.paused = true; updPlay();
	}

	/* ---------------- speed / play ---------------- */
	function updSpeed() { $("sx-spd").textContent = SPEEDS[st.speed] + "×"; }
	function updPlay() { $("sx-play").textContent = st.paused ? "▶" : "❚❚"; $("sx-play").setAttribute("aria-label", st.paused ? "Play" : "Pause"); }
	$("sx-slow").addEventListener("click", function () { st.speed = Math.max(0, st.speed - 1); updSpeed(); });
	$("sx-fast").addEventListener("click", function () { st.speed = Math.min(SPEEDS.length - 1, st.speed + 1); updSpeed(); });
	$("sx-play").addEventListener("click", function () { if (st.phase === "landed") { startMission(st.mission); st.paused = false; } else st.paused = !st.paused; updPlay(); });
	$("sx-warp").addEventListener("click", warpNext);
	function warpNext() {
		if (st.phase !== "orbit") return;
		var list = sorted(); if (!list.length) return flash("No burn planned.");
		var tgt = list[0].t - 20; if (tgt > st.t) { step(tgt - st.t); needPlan = true; }
		st.speed = Math.min(st.speed, 2); updSpeed(); st.paused = false; updPlay();
	}
	var flashT = 0;
	function flash(t, ms) { var f = $("sx-flash"); f.textContent = t; f.hidden = !t; flashT = t ? performance.now() + (ms || 3500) : 0; }

	/* ---------------- options ---------------- */
	$("sx-o-j2").checked = st.j2;
	$("sx-o-j2").addEventListener("change", function () { st.j2 = this.checked; pref.j2 = st.j2; savePref(); var s = st.orb.at(st.t); st.orb = new S.Orbit(s.r, s.v, st.t, st.j2); if (st.target) { var q = st.target.at(st.t); st.target = new S.Orbit(q.r, q.v, st.t, st.j2); } entryCache = {}; needPlan = true; });
	$("sx-o-trail").checked = pref.trail !== false;
	$("sx-o-trail").addEventListener("change", function () { pref.trail = this.checked; savePref(); });
	$("sx-o-slow").checked = pref.slow !== false;
	$("sx-o-slow").addEventListener("change", function () { pref.slow = this.checked; savePref(); });
	$("sx-restart").addEventListener("click", function () { startMission(st.mission); st.paused = false; updPlay(); });
	$("sx-link").addEventListener("click", function () {
		var u = location.origin + location.pathname + "?m=" + st.mission;
		(navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { flash("Link copied"); }, function () { prompt("Copy this link:", u); });
	});
	var show = pref.show || "both";
	function setShow(v) { show = v; pref.show = v; savePref(); $("sx-stage").setAttribute("data-v", v); $("sx-show").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === v ? "true" : "false"); }); setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 20); }
	$("sx-show").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) setShow(b.getAttribute("data-v")); });
	setShow(show);
	$("sx-cam").addEventListener("change", function () { if (this.value === "target" && !st.target) { this.value = "shuttle"; flash("No station in this mission."); } if (viewObj) viewObj.setFollow(this.value); camUi(); });
	function camUi() { var c = $("sx-cam").value; $("sx-camv").hidden = c === "earth"; if (c !== "earth") flash("Drag to swing round it, wheel or pinch to zoom, double-click for behind", 4000); }
	$("sx-camv").addEventListener("click", function (e) { var b = e.target.closest("[data-cv]"); if (!b || !viewObj) return; var k = b.getAttribute("data-cv"); if (k === "in") viewObj.zoomFollow(0.6); else if (k === "out") viewObj.zoomFollow(1.6); else viewObj.view(k); });
	/* what to draw: saved per browser */
	var HIDE_OPTS = [["orbit", "Orbit line"], ["plan", "Path after the burn"], ["trail", "Trail behind the Shuttle"], ["torbit", "Station's orbit"], ["arrows", "Burn arrows"], ["foot", "Landing area"], ["sites", "Runways"], ["borders", "Country borders"], ["hud", "Numbers box (top left)"], ["rel", "Station view"], ["mapgrid", "Map grid"]];
	st.hide = pref.hide || {}; if (pref.hide == null) st.hide = {};
	(function () {
		var box = $("sx-showp");
		HIDE_OPTS.forEach(function (o) { var l = document.createElement("label"); l.className = "sx-check"; l.innerHTML = '<input type="checkbox" data-h="' + o[0] + '"' + (st.hide[o[0]] ? "" : " checked") + "> " + o[1]; box.appendChild(l); });
		var row = document.createElement("div"); row.className = "sx-showr"; row.innerHTML = '<button type="button" data-ha="none">Hide all lines</button><button type="button" data-ha="all">Show everything</button>'; box.appendChild(row);
		box.addEventListener("change", function (e) { var k = e.target.getAttribute("data-h"); if (!k) return; st.hide[k] = !e.target.checked; applyHide(k); });
		box.addEventListener("click", function (e) { var b = e.target.closest("[data-ha]"); if (!b) return; var none = b.getAttribute("data-ha") === "none";
			HIDE_OPTS.forEach(function (o) { var lineish = ["orbit", "plan", "trail", "torbit", "arrows", "foot", "mapgrid"].indexOf(o[0]) >= 0; st.hide[o[0]] = none ? (lineish || !!st.hide[o[0]]) : false; });
			box.querySelectorAll("[data-h]").forEach(function (c) { c.checked = !st.hide[c.getAttribute("data-h")]; }); applyHide("all"); });
	})();
	function applyHide(k) {
		pref.hide = st.hide; savePref();
		$("sx-hud").hidden = !!st.hide.hud;
		if (viewObj) viewObj.showSites(!st.hide.sites);
		if ((k === "borders" || k === "all") && viewObj && window.SXMap.repaint) { window.SXMap.opts = { borders: !st.hide.borders }; viewObj.setTexture(window.SXMap.repaint(window.SXMap.opts)); }
	}

	/* ---------------- station view ---------------- */
	var relC = $("sx-relc"), relX = relC.getContext("2d");
	function drawRel() {
		var box = $("sx-rel"), has = st.target && st.phase !== "entry" && st.phase !== "landed" && !st.hide.rel;
		box.hidden = !has; if (!has) return;
		var sC = st.orb.at(st.t), sT = st.target.at(st.t), L = S.lvlh(sT.r, sT.v, sC.r, sC.v);
		$("sx-rel-d").textContent = S.fmtKm(L.dist) + " · " + (L.speed < 100 ? L.speed.toFixed(2) + " m/s" : S.fmtV(L.speed));
		var dpr = Math.min(2, window.devicePixelRatio || 1), W = relC.clientWidth || 300, H = relC.clientHeight || 220;
		if (relC.width !== Math.round(W * dpr)) { relC.width = Math.round(W * dpr); relC.height = Math.round(H * dpr); }
		var g = relX; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
		g.fillStyle = "rgba(6,10,18,0.92)"; g.fillRect(0, 0, W, H);
		var path = [], T = Math.min(st.orb.el.T || 5500, 6000);
		for (var k = 0; k <= 90; k++) { var tt = st.t + k / 90 * T, a = st.orb.at(tt), b = st.target.at(tt), q = S.lvlh(b.r, b.v, a.r, a.v); path.push(q); }
		var ext = Math.max(Math.abs(L.y), Math.abs(L.x)) * 1.5; ext = Math.max(ext, 150);
		path.forEach(function (q) { if (Math.abs(q.y) < ext * 3 && Math.abs(q.x) < ext * 3) ext = Math.max(ext, Math.min(ext * 2.2, Math.max(Math.abs(q.y), Math.abs(q.x) * 1.4))); });
		var sc = Math.min(W, H * 1.3) / 2 / ext, cx = W / 2, cy = H / 2;
		var step = Math.pow(10, Math.floor(Math.log10(ext))); if (ext / step < 2) step /= 2;
		g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 1; g.beginPath();
		for (var x = -Math.ceil(ext * 2 / step) * step; x <= ext * 2; x += step) { g.moveTo(cx + x * sc, 0); g.lineTo(cx + x * sc, H); g.moveTo(0, cy - x * sc); g.lineTo(W, cy - x * sc); }
		g.stroke();
		g.strokeStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.moveTo(0, cy); g.lineTo(W, cy); g.moveTo(cx, 0); g.lineTo(cx, H); g.stroke();
		g.fillStyle = "#9aa5bb"; g.font = "11px system-ui, sans-serif"; g.fillText("ahead →", W - 52, cy - 5); g.fillText("↑ up (away from Earth)", cx + 5, 13);
		g.fillText("grid " + (step >= 1000 ? step / 1000 + " km" : step + " m"), 6, H - 6);
		g.strokeStyle = "#ffa94d"; g.setLineDash([4, 4]); g.beginPath();
		path.forEach(function (q, i) { var px = cx + q.y * sc, py = cy - q.x * sc; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
		g.stroke(); g.setLineDash([]);
		g.fillStyle = "#69db7c"; g.fillRect(cx - 7, cy - 2, 14, 4); g.fillRect(cx - 2, cy - 6, 4, 12);
		var px = cx + L.y * sc, py = cy - L.x * sc;
		g.fillStyle = "#fff"; g.beginPath(); g.arc(px, py, 4.5, 0, 7); g.fill();
		if (L.speed > 0.01) { var k2 = 30 / Math.max(L.speed, 0.5); g.strokeStyle = "#fff"; g.beginPath(); g.moveTo(px, py); g.lineTo(px + L.vy * k2 * Math.min(1, 6 / L.speed), py - L.vx * k2 * Math.min(1, 6 / L.speed)); g.stroke(); }
		g.fillStyle = "#e8ecf5"; g.fillText(Math.abs(L.z) > 50 ? "out of plane " + S.fmtKm(Math.abs(L.z)) : "", 6, 14);
		$("sx-dock").hidden = !(L.dist < 120 && L.speed < 1 && !st.docked);
	}
	$("sx-rel").addEventListener("click", function (e) {
		var b = e.target.closest("[data-n]"); if (!b || st.phase !== "orbit") return;
		var p = b.getAttribute("data-n").split(":"), sz = parseFloat($("sx-nsz").value) * parseFloat(p[1]), n = { t: st.t, pro: 0, nrm: 0, rad: 0 }; n[p[0]] = sz;
		var s = st.orb.at(st.t); st.orb = new S.Orbit(s.r, S.applyBurn(s.r, s.v, n), st.t, st.j2); burnMass(Math.abs(sz)); st.fire = performance.now() + 500; needPlan = true;
	});
	$("sx-dock").addEventListener("click", function () { st.docked = true; st.phase = "docked"; st.orb = st.target; st.nodes = []; refreshNodes(); flash("🤝 Docked with the " + st.tname + "!", 6000); });

	/* ---------------- map ---------------- */
	var mapC = $("sx-map"), mapX = mapC.getContext("2d"), mapCache = { t: -1e9 };
	function futureTrack(o, t0, dur, n, stopAt) {
		var pts = [];
		for (var k = 0; k <= n; k++) { var t = t0 + k / n * dur; if (stopAt && t > stopAt) { t = stopAt; } var s = o.at(t); pts.push(S.latLon(s.r, gm(t))); if (stopAt && t >= stopAt) break; }
		return pts;
	}
	function drawMap() {
		var W = mapC.clientWidth, H = mapC.clientHeight;
		if (!W || !H || mapC.offsetParent === null) return;
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		if (mapC.width !== Math.round(W * dpr) || mapC.height !== Math.round(H * dpr)) { mapC.width = Math.round(W * dpr); mapC.height = Math.round(H * dpr); }
		var g = mapX; g.setTransform(dpr, 0, 0, dpr, 0, 0);
		var mw = Math.min(W, H * 2), mh = mw / 2, ox = (W - mw) / 2, oy = (H - mh) / 2;
		g.fillStyle = "#050810"; g.fillRect(0, 0, W, H);
		g.save(); g.translate(ox, oy);
		var sd = S.sunDir(st.epoch + st.t * 1000), sll = S.latLon(sd, gm(st.t));
		window.SXMap.base(g, mw, mh, sll, !st.hide.mapgrid);
		if (st.phase === "orbit" || st.phase === "docked") {
			if (performance.now() - mapCache.t > 250 || needPlan) {
				var T = st.orb.el.T || 5500, stop = st.orb.el.rp < RE + EI ? st.orb.nextRadius(st.t, RE + EI, false) : null;
				mapCache.fut = futureTrack(st.orb, st.t, T * 2, 300, stop);
				mapCache.tgt = st.target ? futureTrack(st.target, st.t, T, 150) : null;
				var n = selNode(); mapCache.plan = null;
				if (n && n.after) { var stop2 = n.pred ? n.pred.tE : null; mapCache.plan = futureTrack(n.after, n.t, (n.after.el.T || 5500) * 1.2, 200, stop2); }
				mapCache.t = performance.now();
			}
			if (mapCache.tgt && !st.hide.torbit) { g.strokeStyle = "rgba(105,219,124,0.6)"; g.lineWidth = 1.5; window.SXMap.track(g, mapCache.tgt, mw, mh); }
			if (!st.hide.orbit) { g.strokeStyle = "rgba(142,197,255,0.95)"; g.lineWidth = 2; window.SXMap.track(g, mapCache.fut, mw, mh); }
			if (mapCache.plan && !st.hide.plan) { g.strokeStyle = "#ffa94d"; g.setLineDash([6, 5]); g.lineWidth = 2; window.SXMap.track(g, mapCache.plan, mw, mh); g.setLineDash([]); }
		}
		if (pref.trail !== false && !st.hide.trail && st.mapTrail.length > 1) { g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 1.5; window.SXMap.track(g, st.mapTrail, mw, mh); }
		// landing prediction for the selected burn (or the current orbit / entry)
		var n2 = selNode(), pr = st.phase === "entry" || st.phase === "landed" ? null : (n2 && n2.pred) || st.pred;
		if (pr && !st.hide.foot) {
			g.strokeStyle = "#ff6b6b"; g.fillStyle = "rgba(255,107,107,0.18)"; g.lineWidth = 2;
			g.beginPath(); pr.foot.forEach(function (p, i) { var q = window.SXMap.xy(p.lat, p.lon, mw, mh); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.stroke();
			var e = window.SXMap.xy(pr.rel.lat, pr.rel.lon, mw, mh), l = window.SXMap.xy(pr.land.lat, pr.land.lon, mw, mh);
			dotAt(g, e, "#ffd43b", 4, "Entry interface"); dotAt(g, l, "#ff6b6b", 4, "");
		}
		if (st.entry) {
			var E = st.entry, path = []; for (var k = 0; k <= 80; k++) { var tt = E.t0 + k / 80 * E.e.landTime; path.push(entryPos(Math.min(tt, st.t))); if (tt > st.t) break; }
			g.strokeStyle = "#ffd43b"; g.lineWidth = 2.5; window.SXMap.track(g, path, mw, mh);
			dotAt(g, window.SXMap.xy(E.rel.lat, E.rel.lon, mw, mh), "#ffd43b", 4, "Entry interface");
		}
		if (!st.hide.sites) S.SITES.forEach(function (s) { var q = window.SXMap.xy(s.lat * D, s.lon * D, mw, mh); g.fillStyle = "#51cf66"; g.strokeStyle = "#0b1a0b"; g.lineWidth = 1.5; g.beginPath(); g.rect(q[0] - 3.5, q[1] - 3.5, 7, 7); g.fill(); g.stroke(); });
		// the station and the Shuttle
		if (st.target && st.phase !== "landed") { var tq = window.SXMap.xy.apply(null, (function () { var ll = S.latLon(st.target.at(st.t).r, gm(st.t)); return [ll.lat, ll.lon, mw, mh]; })()); dotAt(g, tq, "#69db7c", 5, st.tname); }
		var me = shuttleLL();
		if (me) { var mq = window.SXMap.xy(me.lat, me.lon, mw, mh); g.fillStyle = "#fff"; g.strokeStyle = "#1e40af"; g.lineWidth = 2.5; g.beginPath(); g.arc(mq[0], mq[1], 6, 0, 7); g.fill(); g.stroke(); }
		// sun marker
		var sq = window.SXMap.xy(sll.lat, sll.lon, mw, mh); g.fillStyle = "#ffe066"; g.beginPath(); g.arc(sq[0], sq[1], 5, 0, 7); g.fill();
		g.restore();
	}
	function dotAt(g, q, col, r, label) {
		g.fillStyle = col; g.strokeStyle = "#111"; g.lineWidth = 1.5; g.beginPath(); g.arc(q[0], q[1], r, 0, 7); g.fill(); g.stroke();
		if (label) { g.font = "600 11px system-ui, sans-serif"; g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,0.75)"; g.strokeText(label, q[0] + 7, q[1] - 6); g.fillStyle = "#fff"; g.fillText(label, q[0] + 7, q[1] - 6); }
	}
	function shuttleLL() {
		if (st.phase === "entry" || st.phase === "landed") return st.entry ? entryPos(st.t) : null;
		return S.latLon(st.orb.at(st.t).r, gm(st.t));
	}
	$("sx-mapkey").innerHTML = '<span><i style="background:#8ec5ff"></i>next 2 orbits</span><span><i style="background:#ffa94d"></i>after the burn</span><span><i style="background:#ff6b6b"></i>landing area</span><span><i style="background:#51cf66"></i>runways</span><span><i style="background:#ffe066;border-radius:50%"></i>Sun overhead</span>';

	/* ---------------- HUD + readouts ---------------- */
	function inShadow(r, sd) { var d = S.v.dot(r, sd); return d < 0 && S.v.norm(S.v.sub(r, S.v.mul(sd, d))) < RE; }
	var roT = 0;
	function readouts() {
		var now = performance.now(); if (now - roT < 120) return; roT = now;
		var date = new Date(st.epoch + st.t * 1000), hud = "", ro = [];
		var met = '<div class="sx-hrow sx-hmet">MET ' + S.fmtTime(st.t) + '</div><div class="sx-hrow sx-hdim">' + date.toISOString().slice(0, 16).replace("T", " ") + " UTC</div>";
		if (st.phase === "entry" || st.phase === "landed") {
			var p = entryPos(st.t);
			hud = met + row("Height", S.fmtKm(p.h)) + row("Speed", S.fmtV(p.v) + " · Mach " + Math.max(0, p.v / 300).toFixed(1)) + row("Felt", p.g.toFixed(2) + " g") + row("Nose heating", Math.round(p.q) + " W/cm²") + row("To go", S.fmtKm(Math.max(0, st.entry.e.landRange - p.s), 0));
			ro = [tile("Phase", st.phase === "landed" ? "Landed" : p.h > 25000 ? "Entry glide" : "Final approach", st.entry.site ? "heading for " + st.entry.site.s.short : "no runway in reach"), tile("Peak g", st.entry.e.peakG.toFixed(2) + " g", "during this entry"), tile("Peak nose heat", Math.round(st.entry.e.peakQ) + " W/cm²", "about " + fmtN(st.entry.e.peakT - 273) + " °C on the nose cap"), tile("Entry to wheels stop", S.fmtTime(st.entry.e.landTime), S.fmtKm(st.entry.e.landRange, 0) + " of ground")];
		} else {
			var s = st.orb.at(st.t), el = st.orb.el, alt = S.v.norm(s.r) - RE, ll = S.latLon(s.r, gm(st.t)), sh = inShadow(s.r, S.sunDir(date.getTime()));
			hud = met + row("Height", S.fmtKm(alt)) + row("Speed", S.fmtV(S.v.norm(s.v))) + row("Over", latLonText(ll)) + '<div class="sx-hrow sx-hdim">' + (sh ? "🌑 in Earth's shadow" : "☀ in sunlight") + "</div>";
			var leftDv = S.rocketDv(st.mass, st.prop, S.SHUTTLE.isp), list = sorted(), nx = list[0];
			ro.push(tile("Orbit (high × low)", el.e < 1 ? Math.round(el.ha / 1000) + " × " + Math.round(el.hp / 1000) + " km" : "escaping", el.e < 1 ? "e = " + el.e.toFixed(4) : ""));
			ro.push(tile("Period", el.e < 1 ? S.fmtTime(el.T) : "–", el.e < 1 ? (86400 / el.T).toFixed(2) + " orbits a day" : ""));
			ro.push(tile("Inclination", (el.i / D).toFixed(2) + "°", st.j2 ? "node turns " + (S.j2Rates(el.a, el.e, el.i).raan / D * 86400).toFixed(2) + "°/day" : "J2 off"));
			ro.push(tile("OMS propellant left", fmtN(st.prop) + " kg", "≈ " + leftDv.toFixed(0) + " m/s of burns · used " + st.dvUsed.toFixed(1) + " m/s"));
			ro.push(tile("Next burn", nx ? "in " + S.fmtTime(nx.t - st.t) : "none", nx ? S.burnSize(nx).toFixed(1) + " m/s" : "plan one below"));
			if (st.target) { var tS = st.target.at(st.t), L = S.lvlh(tS.r, tS.v, s.r, s.v), ph = S.phase(s.r, s.v, tS.r); ro.push(tile(st.tname, S.fmtKm(L.dist), st.docked ? "docked" : (ph / D).toFixed(1) + "° " + (ph >= 0 ? "ahead" : "behind") + " · " + (L.speed < 100 ? L.speed.toFixed(2) + " m/s" : S.fmtV(L.speed)) + " relative")); }
			if (st.pred) ro.push(tile("Coming down", "entry in " + S.fmtTime(st.pred.tE - st.t), "at " + (st.pred.rel.gamma / D).toFixed(2) + "°"));
		}
		$("sx-hud").innerHTML = hud; $("sx-ro").innerHTML = ro.join("");
		if (selNode()) { var n = selNode(); $("sx-when").textContent = (n.t - st.t > 0 ? "in " + S.fmtTime(n.t - st.t) : "now") + " · " + whereText(n); }
	}
	function row(a, b) { return '<div class="sx-hrow"><span>' + a + "</span><b>" + b + "</b></div>"; }
	function tile(a, b, c) { return '<div class="sx-tile"><span>' + esc(a) + "</span><b>" + b + "</b><small>" + (c || "") + "</small></div>"; }

	/* ---------------- 3D ---------------- */
	function aimCam() { var s = st.orb.at(st.t), h = S.v.unit(S.v.cross(s.r, s.v)), r = S.v.unit(s.r); viewObj.aim(S.v.add(S.v.mul(h, 0.62), S.v.mul(r, 0.78)), 3.3); }
	var viewObj = null, THREE = null;
	function imp(u) { return new Function("u", "return import(u)")(u); }
	function load3d() {
		(window.SXMap.opts = { borders: !(pref.hide || {}).borders }, Promise.all([imp("three"), imp("three/addons/controls/OrbitControls.js"), window.SXMap.load()])).then(function (m) {
			THREE = m[0]; viewObj = window.SXView.create($("sx-3d"), THREE, m[1].OrbitControls);
			viewObj.setTexture(m[2]); viewObj.setSites(S.SITES); viewObj.setFollow($("sx-cam").value); aimCam();
			$("sx-load").hidden = true; wirePointer(); applyHide("all"); camUi();
		}).catch(function (e) {
			window.SXMap.load(); $("sx-load").textContent = "The 3D view could not load (" + (e && e.message || "no WebGL") + "). The map and planner still work.";
			setShow("map");
		});
	}
	function render3d() {
		if (!viewObj || show === "map" || curTab !== "fly") return;
		var o = st.phase === "orbit" || st.phase === "docked", sh = null, nodeInfo = null, others = [];
		if (o) {
			var s = st.orb.at(st.t); sh = { r: s.r, v: s.v, firing: performance.now() < st.fire };
		} else if (st.entry) {
			var p = entryPos(st.t), r = entryEci(st.t, p), p2 = entryPos(st.t + 5), r2 = entryEci(st.t + 5, p2);
			var fwd = S.v.unit(S.v.sub(r2, r)); if (!isFinite(fwd[0])) fwd = [1, 0, 0];
			var up = S.v.unit(r), nose = S.v.unit(S.v.add(fwd, S.v.mul(up, Math.tan(p.h > 25000 ? 40 * D : 12 * D))));
			sh = { r: r, v: S.v.sub(r2, r), nose: nose, plasma: Math.max(0, Math.min(1, (p.q - 8) / 30)), px: st.phase === "landed" ? 26 : 40 };
		}
		var n = o ? selNode() : null;
		if (n && n.state) nodeInfo = { r: n.state.r, f: S.frame(n.state.r, n.state.v) };
		sorted().forEach(function (m) { if (m !== n && m.state) others.push(m.state.r); });
		var orbPts = null, planPts = null, tPts = null, trail = null;
		if (o) {
			if (needPlan) plan();
			var T = st.orb.el.T || 5600, stop = st.orb.el.rp < RE + EI ? st.orb.nextRadius(st.t, RE + EI, false) : null;
			var dense = $("sx-cam").value !== "earth" ? 1440 : 240;
			orbPts = stop ? arcPts(st.orb, st.t, stop) : st.orb.ring(st.t, dense);
			if (n && n.after) planPts = n.pred ? arcPts(n.after, n.t, n.pred.tE) : n.after.ring(n.t, dense);
			if (st.target) tPts = st.target.ring(st.t, dense > 240 ? 1440 : 180);
		}
		if (pref.trail !== false) trail = st.trail;
		var pr = (n && n.pred) || (o ? st.pred : null), surf = null;
		if (st.entry) { surf = []; for (var k = 0; k <= 60; k++) surf.push(entryPos(st.entry.t0 + k / 60 * st.entry.e.landTime)); }
		viewObj.render({ gmst: gm(st.t), sun: S.sunDir(st.epoch + st.t * 1000), shuttle: sh, target: st.target && st.phase !== "landed" ? st.target.at(st.t) : null,
			orbit: orbPts, plan: planPts, targetOrbit: tPts, trail: trail, node: nodeInfo, others: others,
			ei: pr ? { lat: pr.rel.lat, lon: pr.rel.lon } : st.entry ? { lat: st.entry.rel.lat, lon: st.entry.rel.lon } : null,
			land: pr ? pr.land : st.entry && st.entry.site ? { lat: st.entry.site.s.lat * D, lon: st.entry.site.s.lon * D } : null,
			footprint: pr ? pr.foot.concat([pr.foot[0]]) : null, surfPath: surf, hide: st.hide });
	}
	function arcPts(o, t0, t1) { var out = []; for (var k = 0; k <= 160; k++) out.push(o.at(t0 + (t1 - t0) * k / 160).r); return out; }

	/* drag the burn marker along the orbit, or an arrow to change the burn */
	var drag = null;
	function wirePointer() {
		var cv = viewObj.canvas;
		cv.addEventListener("pointerdown", function (e) {
			var n = selNode(); if (!n || !n.state || st.phase !== "orbit") return;
			var rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, best = null;
			(viewObj.arrowTips || []).forEach(function (a) { if (!a.p.vis) return; var d = Math.hypot(a.p.x - x, a.p.y - y); if (d < 16 && (!best || d < best.d)) best = { d: d, a: a }; });
			var np = viewObj.screenOf(n.state.r);
			if (!best && np.vis && Math.hypot(np.x - x, np.y - y) < 14) best = { node: true };
			if (!best) return;
			e.preventDefault(); e.stopPropagation(); viewObj.controls.enabled = false; cv.setPointerCapture(e.pointerId);
			if (best.node) {
				var o = n.before || st.orb, T = o.el.T || 5600, prev = sorted().filter(function (m) { return m.t < n.t && m !== n; }).pop(), t0 = prev ? prev.t + 1 : st.t, samp = [];
				for (var k = 0; k <= 240; k++) { var tt = t0 + k / 240 * T; samp.push({ t: tt, p: viewObj.screenOf(o.at(tt).r) }); }
				drag = { kind: "node", n: n, samp: samp };
			} else {
				var a = best.a, dx = a.p.x - a.o.x, dy = a.p.y - a.o.y, L = Math.hypot(dx, dy) || 1, ax = { pro: ["pro", 1], retro: ["pro", -1], nrm: ["nrm", 1], anti: ["nrm", -1], rad: ["rad", 1], radin: ["rad", -1] }[a.k];
				drag = { kind: "arrow", n: n, ux: dx / L, uy: dy / L, x: x, y: y, key: ax[0], sign: ax[1], v0: n[ax[0]] };
			}
		}, true);
		cv.addEventListener("pointermove", function (e) {
			if (!drag) { hoverCursor(e); return; }
			var rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
			if (drag.kind === "node") {
				var best = null; drag.samp.forEach(function (s) { if (!s.p.vis) return; var d = Math.hypot(s.p.x - x, s.p.y - y); if (!best || d < best.d) best = { d: d, t: s.t }; });
				if (best) { drag.n.t = Math.max(st.t, best.t); needPlan = true; editorText(); }
			} else {
				var along = (x - drag.x) * drag.ux + (y - drag.y) * drag.uy, rate = e.shiftKey ? 0.02 : 0.25;
				drag.n[drag.key] = Math.round((drag.v0 + drag.sign * along * rate) * 10) / 10; needPlan = true; refreshNodes();
			}
		});
		function end() { if (drag) { drag = null; viewObj.controls.enabled = true; } }
		cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
	}
	function hoverCursor(e) {
		var n = selNode(), cv = viewObj.canvas; if (!n || !n.state) { cv.style.cursor = ""; return; }
		var rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, hit = false;
		(viewObj.arrowTips || []).forEach(function (a) { if (a.p.vis && Math.hypot(a.p.x - x, a.p.y - y) < 16) hit = true; });
		var np = viewObj.screenOf(n.state.r); if (np.vis && Math.hypot(np.x - x, np.y - y) < 14) hit = true;
		cv.style.cursor = hit ? "grab" : "";
	}

	/* ---------------- keys ---------------- */
	document.addEventListener("keydown", function (e) {
		if (curTab !== "fly" || e.target.closest("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
		var r = $("sx-view").getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
		if (e.key === " ") { e.preventDefault(); $("sx-play").click(); }
		else if (e.key === "[") $("sx-slow").click(); else if (e.key === "]") $("sx-fast").click();
		else if (e.key === "n" || e.key === "N") warpNext();
	});

	/* ---------------- loop ---------------- */
	var last = performance.now(), trailT = -1e9;
	function frame(now) {
		var dt = Math.min(0.1, (now - last) / 1000); last = now;
		if (curTab === "fly" && !st.paused && st.orb) {
			var sp = SPEEDS[st.speed];
			if (pref.slow !== false && st.phase === "orbit") { var nx = sorted()[0]; if (nx && nx.t - st.t < 90 && nx.t >= st.t) sp = Math.min(sp, 10); }
			step(dt * sp);
			if (st.t - trailT > Math.max(8, sp * 0.1)) {
				trailT = st.t;
				var pos = st.phase === "orbit" || st.phase === "docked" ? st.orb.at(st.t).r : st.entry ? entryEci(st.t, entryPos(st.t)) : null;
				if (pos) { st.trail.push(pos); if (st.trail.length > 400) st.trail.shift(); var ll = shuttleLL(); if (ll) { st.mapTrail.push(ll); if (st.mapTrail.length > 900) st.mapTrail.shift(); } }
			}
			if (selNode() && Math.random() < 0.05) needPlan = true;
		}
		if (flashT && now > flashT) flash("");
		if (curTab === "fly" && st.orb) { render3d(); if (show !== "3d") drawMap(); drawRel(); readouts(); }
		requestAnimationFrame(frame);
	}

	/* ---------------- start ---------------- */
	var q = new URLSearchParams(location.search);
	startMission(q.get("m") || pref.mission || "free");
	var orig = startMission; startMission = function (id, o) { orig(id, o); pref.mission = id; savePref(); };
	if (window.MESPanel) window.MESPanel.add($("sx-view"), { bar: $("sx-pbar"), stage: $("sx-stage"), onChange: function () { setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 40); } });
	else window.addEventListener("load", function () { if (window.MESPanel && !$("sx-view").__mesPanel) window.MESPanel.add($("sx-view"), { bar: $("sx-pbar"), stage: $("sx-stage") }); });
	load3d();
	if (q.get("tab")) showTab(q.get("tab"), true);
	requestAnimationFrame(frame);
	window.SXFly = { deorbit: function (alt, dv) { showTab("fly"); startMission("deorbit", { alt: alt, deorbitDv: dv }); st.paused = false; updPlay(); } };
	window.MESShuttleDebug = { st: st, view: function () { return viewObj; }, step: function (s) { step(s); needPlan = true; }, plan: plan, render: function () { render3d(); drawMap(); drawRel(); roT = 0; readouts(); }, startMission: function (id, o) { startMission(id, o); }, auto: { hohmann: autoHohmann, rdv: autoRdv, deorbit: autoDeorbit, tilt: autoTilt, plane: autoPlane, circ: autoCirc } };
})();
