/* MES Crash Physics -- UI (maths in lib.js, global MESCrash). State: localStorage "mes-crash-physics:v1"; links ?tab=hit&pm=&sh=&d=&L=&m=&v=&a=&tm=&h=&w= / ?tab=crash&ob=&om=&cv=&fh=&src=&su=&o2=&d2=&v2=&rs=&e= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("cr"); if (!root || !window.MESCrash) return;
	var C = window.MESCrash, KEY = "mes-crash-physics:v1", G = C.G;
	function lc(s) { return s.replace(/\b([A-Z][a-z]+)\b/g, function (w) { return w.toLowerCase(); }); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function num(s) { s = String(s == null ? "" : s).trim().replace(/\s/g, ""); if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); else s = s.replace(",", "."); var x = Number(s); return s !== "" && isFinite(x) ? x : NaN; }
	function sup(n) { var m = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }; return String(n).split("").map(function (c) { return m[c] || c; }).join(""); }
	function sig(x, n) { if (!isFinite(x)) return "–"; if (x === 0) return "0"; var a = Math.abs(x); n = n || 3; if (a >= 1e6 || a < 1e-3) { var e = x.toExponential(n - 1).split("e"); return e[0] + " × 10" + sup(+e[1]); } return Number(x.toPrecision(n)).toLocaleString(undefined, { maximumFractionDigits: 6 }); }
	function si(x, u, n) { if (!isFinite(x)) return "–"; var a = Math.abs(x), P = [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"]]; if (a === 0) return "0 " + u; for (var i = 0; i < P.length; i++) if (a >= P[i][0] * 0.9995 || i === P.length - 1) return sig(x / P[i][0], n || 3) + " " + P[i][1] + u; return sig(x, n) + " " + u; }
	function len(x) { if (!isFinite(x)) return "–"; var a = Math.abs(x); if (a >= 1000) return sig(x / 1000, 3) + " km"; if (a >= 1) return sig(x, 3) + " m"; if (a >= 0.01) return sig(x * 100, 3) + " cm"; if (a >= 1e-4) return sig(x * 1000, 3) + " mm"; return sig(x * 1e6, 3) + " µm"; }
	function mass(x) { if (x >= 1000) return sig(x / 1000, 3) + " t"; if (x >= 1) return sig(x, 3) + " kg"; if (x >= 1e-3) return sig(x * 1000, 3) + " g"; return sig(x * 1e6, 3) + " mg"; }
	function time(t) { if (!isFinite(t)) return "–"; if (t >= 1) return sig(t, 3) + " s"; if (t >= 1e-3) return sig(t * 1e3, 3) + " ms"; if (t >= 1e-6) return sig(t * 1e6, 3) + " µs"; return sig(t * 1e9, 3) + " ns"; }
	var VU = { ms: [1, "m/s"], kmh: [1 / 3.6, "km/h"], mph: [0.44704, "mph"], fts: [0.3048, "ft/s"] }, LU = { mm: 1e-3, cm: 1e-2, m: 1, "in": 0.0254 }, HU = { m: 1, ft: 0.3048, cm: 0.01 };
	function spd(v, u) { u = u || S.vu; return sig(v / VU[u][0], 3) + " " + VU[u][1]; }
	function spdAll(v) { return sig(v, 3) + " m/s (" + sig(v * 3.6, 3) + " km/h, " + sig(v / 0.44704, 3) + " mph)"; }
	/* everyday energies for "about the same as" */
	var EN = [[0.05, "a coin dropped from your hand"], [9.8, "a 1 kg bag dropped 1 m"], [125, "a fastball pitch"], [4184, "1 gram of TNT"], [1.45e5, "a car at 50 km/h"], [5.8e5, "a car at 100 km/h"], [4.184e9, "a tonne of TNT"], [6.3e13, "the Hiroshima bomb"]];
	function likeE(E) { var best = EN[0], br = 1e99; EN.forEach(function (x) { var r = Math.abs(Math.log(E / x[0])); if (r < br) { br = r; best = x; } }); var k = E / best[0]; return (k >= 0.95 && k <= 1.05 ? "about " : "about " + sig(k, 2) + " × ") + best[1]; }

	/* ---------------- state ---------------- */
	var q = new URLSearchParams(location.search), saved = sget(), link = q.has("pm") || q.has("ob");
	function pick(k, ok, d) { var v = q.has(k) ? q.get(k) : (!link && saved[k] != null ? saved[k] : null); return v != null && v !== "" && ok(String(v)) ? String(v) : d; }
	var isMat = function (v) { return C.MATS.some(function (m) { return m.id === v; }); }, isNum = function (v) { return num(v) > 0; };
	var S = {
		tab: /^(hit|crash)$/.test(q.get("tab") || "") ? q.get("tab") : (saved.tab === "crash" ? "crash" : "hit"),
		pm: pick("pm", isMat, "ice"), sh: pick("sh", function (v) { return C.SHAPES.some(function (s) { return s.id === v; }); }, "sphere"), d: pick("d", isNum, "50"), du: pick("du", function (v) { return v in LU; }, "mm"), L: pick("L", isNum, "100"),
		m: pick("m", isNum, ""), rho: pick("rho", isNum, ""), v: pick("v", isNum, "30"), vu: pick("vu", function (v) { return v in VU; }, "ms"), a: pick("a", function (v) { return num(v) >= 0 && num(v) <= 85; }, "0"),
		tm: pick("tm", isMat, "steel"), h: pick("h", isNum, "0.8"), hu: pick("hu", function (v) { return v in LU; }, "mm"), w: pick("w", isNum, "1"),
		ob: pick("ob", function (v) { return C.OBJECTS.some(function (o) { return o.id === v; }); }, "car"), om: pick("om", isNum, ""), src: pick("src", function (v) { return v === "speed" || v === "fall"; }, "speed"),
		cv: pick("cv", isNum, "56"), cvu: pick("cvu", function (v) { return v === "kmh" || v === "mph" || v === "ms"; }, "kmh"), fh: pick("fh", isNum, "1"), fhu: pick("fhu", function (v) { return v in HU; }, "m"),
		su: pick("su", function (v) { return C.SURFACES.some(function (o) { return o.id === v; }); }, "wall"), o2: pick("o2", function (v) { return C.OBJECTS.some(function (o) { return o.id === v; }); }, "car"),
		d2: pick("d2", function (v) { return /^(head|stop|same)$/.test(v); }, "head"), v2: pick("v2", function (v) { return num(v) >= 0; }, "50"), rs: pick("rs", function (v) { return v in C.RESTRAINTS || v === "off"; }, "beltbag"), e: pick("e", function (v) { return num(v) >= 0 && num(v) <= 1; }, ""),
		slow: false
	};
	function save() { var o = {}; ["tab", "pm", "sh", "d", "du", "L", "m", "rho", "v", "vu", "a", "tm", "h", "hu", "w", "ob", "om", "src", "cv", "cvu", "fh", "fhu", "su", "o2", "d2", "v2", "rs", "e"].forEach(function (k) { o[k] = S[k]; }); sset(o); }

	var PRE1 = [
		{ n: "Hail on a car roof", pm: "ice", sh: "sphere", d: 50, v: 30, tm: "steel", h: 0.8, w: 1, note: "A 5 cm hailstone falls at about 30 m/s. It shatters, but it still dents the 0.8 mm roof." },
		{ n: "Golf ball vs window", pm: "rubber", sh: "sphere", d: 42.7, m: 45.9, v: 40, tm: "glass", h: 4, w: 0.8, note: "A driven golf ball (46 g) at 40 m/s against a 4 mm pane." },
		{ n: "Baseball vs drywall", pm: "pine", sh: "sphere", d: 74, m: 145, v: 40, tm: "drywall", h: 12.7, w: 0.4, note: "A 145 g baseball thrown hard at ½ inch drywall between studs 40 cm apart." },
		{ n: "Stone vs windshield", pm: "granite", sh: "sphere", d: 20, v: 30, tm: "glass", h: 6, w: 1.2, note: "A 2 cm stone thrown up at highway speed. (Real windshields are laminated, so they crack but hold the stone.)" },
		{ n: "Arrow into wood", pm: "steel", sh: "cone", d: 8, L: 60, m: 25, v: 90, tm: "pine", h: 50, w: 0.5, note: "A 25 g arrow from a strong bow at 90 m/s into a pine board." },
		{ n: "Steel ball vs steel plate", pm: "steel", sh: "sphere", d: 10, v: 300, tm: "steel", h: 3, w: 0.5, note: "A 10 mm steel ball bearing at 300 m/s against a 3 mm mild steel plate." },
		{ n: "Space debris vs ISS wall", pm: "al", sh: "sphere", d: 10, v: 7000, tm: "al", h: 4, w: 1, note: "A 1 cm aluminium fragment at 7 km/s, typical of low-orbit debris, against a 4 mm aluminium wall." },
		{ n: "Micrometeoroid", pm: "granite", sh: "sphere", d: 1, v: 20000, tm: "al", h: 1, w: 1, note: "A 1 mm grain of rock at 20 km/s: tiny, but it carries the energy of a thrown baseball." },
		{ n: "Meteorite into rock", pm: "steel", sh: "sphere", d: 1000, rho: 7800, v: 15000, tm: "granite", h: 100000, hu: "m", w: 1000, note: "A 1 m iron meteorite at 15 km/s into solid rock. (Big craters are shaped by gravity too; this is only the first bite.)" },
		{ n: "Ball into water", pm: "steel", sh: "sphere", d: 10, v: 300, tm: "water", h: 1000, w: 2, note: "A fast steel ball into a pool. Water stops it within half a metre." }
	];
	var PRE2 = [
		{ n: "Car into a wall, 56 km/h", ob: "car", src: "speed", cv: 56, cvu: "kmh", su: "wall", rs: "beltbag", note: "The standard frontal crash test speed (35 mph)." },
		{ n: "Same, no seat belt", ob: "car", src: "speed", cv: 56, cvu: "kmh", su: "wall", rs: "none", note: "Nothing holds the person, so they keep going until they hit the dashboard." },
		{ n: "Head-on, two cars at 50 km/h", ob: "car", src: "speed", cv: 50, cvu: "kmh", su: "vehicle", o2: "car", d2: "head", v2: 50, rs: "beltbag", note: "Two equal cars head-on is the same as one car hitting a solid wall at its own speed." },
		{ n: "Small car vs SUV head-on", ob: "smallcar", src: "speed", cv: 60, cvu: "kmh", su: "vehicle", o2: "suv", d2: "head", v2: 60, rs: "beltbag", note: "Momentum: the lighter car gets the bigger change of speed." },
		{ n: "Pickup rear-ends a stopped car", ob: "pickup", src: "speed", cv: 40, cvu: "kmh", su: "vehicle", o2: "car", d2: "stop", v2: 0, rs: "belt" },
		{ n: "Car into a tree, 80 km/h", ob: "car", src: "speed", cv: 80, cvu: "kmh", su: "pole", rs: "beltbag", note: "A narrow pole misses most of the crumple structure, so the car crushes deeper." },
		{ n: "Truck into a crash cushion", ob: "pickup", src: "speed", cv: 100, cvu: "kmh", su: "cushion", rs: "belt", note: "A highway crash cushion stretches the stop over metres instead of centimetres." },
		{ n: "Egg dropped 1 m on the floor", ob: "egg", src: "fall", fh: 1, fhu: "m", su: "wall" },
		{ n: "Egg dropped 1 m onto a pillow", ob: "egg", src: "fall", fh: 1, fhu: "m", su: "pillow" },
		{ n: "Phone dropped 1.5 m on concrete", ob: "phone", src: "fall", fh: 1.5, fhu: "m", su: "wall" },
		{ n: "Jump from 2 m, knees bent", ob: "personbent", src: "fall", fh: 2, fhu: "m", su: "grass" },
		{ n: "Jump from 2 m, legs stiff", ob: "personstiff", src: "fall", fh: 2, fhu: "m", su: "wall" },
		{ n: "Into water from 10 m", ob: "personstiff", src: "fall", fh: 10, fhu: "m", su: "water" },
		{ n: "Watermelon off a roof (5 m)", ob: "melon", src: "fall", fh: 5, fhu: "m", su: "wall" }
	];

	/* ---------------- tabs ---------------- */
	var tabs = root.querySelectorAll(".cr-tabs [role=tab]");
	function setTab(t) { S.tab = t; tabs.forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === t)); }); root.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.dataset.panel !== t; }); save(); setTimeout(function () { onResize(); }, 0); }
	tabs.forEach(function (b) { b.addEventListener("click", function () { setTab(b.dataset.tab); }); });

	/* ---------------- selects ---------------- */
	function fillMats(sel, cur) {
		var g = null, h = "";
		C.MATS.forEach(function (m) { if (m.g !== g) { if (g) h += "</optgroup>"; g = m.g; h += '<optgroup label="' + esc(g) + '">'; } h += '<option value="' + m.id + '">' + esc(m.name) + "</option>"; });
		sel.innerHTML = h + "</optgroup>"; sel.value = cur;
	}
	fillMats($("cr-pm"), S.pm); fillMats($("cr-tm"), S.tm);
	$("cr-sh").innerHTML = C.SHAPES.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join(""); $("cr-sh").value = S.sh;
	function fillObj(sel, cur, vehOnly) { var g = null, h = ""; C.OBJECTS.forEach(function (o) { if (vehOnly && !o.veh) return; if (o.g !== g) { if (g) h += "</optgroup>"; g = o.g; h += '<optgroup label="' + esc(g) + '">'; } h += '<option value="' + o.id + '">' + esc(o.name) + "</option>"; }); sel.innerHTML = h + "</optgroup>"; sel.value = cur; }
	fillObj($("cr-ob"), S.ob); fillObj($("cr-o2"), S.o2, true);
	$("cr-su").innerHTML = C.SURFACES.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join(""); $("cr-su").value = S.su;
	$("cr-rs").innerHTML = Object.keys(C.RESTRAINTS).map(function (k) { return '<option value="' + k + '">' + esc(C.RESTRAINTS[k].name) + "</option>"; }).join("") + '<option value="off">Don\'t simulate the people</option>'; $("cr-rs").value = S.rs;

	/* log sliders */
	function logPos(x, lo, hi) { return Math.round(1000 * Math.log(x / lo) / Math.log(hi / lo)); }
	function logVal(p, lo, hi) { var v = lo * Math.pow(hi / lo, p / 1000), e = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / e) * e; }

	/* ======================= HIT A TARGET ======================= */
	var R1 = null;
	function hitInput() {
		var du = LU[S.du], o = { pm: S.pm, shape: S.sh, d: num(S.d) * du, L: num(S.L) * du, v: num(S.v) * VU[S.vu][0], ang: num(S.a) || 0, tm: S.tm, h: num(S.h) * LU[S.hu], span: num(S.w) };
		if (num(S.m) > 0) o.m = num(S.m) / 1000; else if (num(S.rho) > 0) o.rho = num(S.rho);
		return o;
	}
	function hitOk(o) { return o.d > 0 && (o.shape === "sphere" || o.L > 0) && o.v > 0 && o.h > 0 && o.span > 0; }
	function syncHitInputs() {
		$("cr-pm").value = S.pm; $("cr-sh").value = S.sh; $("cr-d").value = S.d; $("cr-du").value = S.du; $("cr-L").value = S.L; $("cr-L-u").textContent = S.du;
		$("cr-v").value = S.v; $("cr-vu").value = S.vu; $("cr-a").value = S.a; $("cr-a-v").textContent = S.a; $("cr-tm").value = S.tm; $("cr-h").value = S.h; $("cr-hu").value = S.hu; $("cr-w").value = S.w;
		$("cr-L-f").hidden = S.sh === "sphere"; $("cr-d-l").textContent = S.sh === "sphere" ? "Diameter" : "Diameter of the cylinder";
		var vms = num(S.v) * VU[S.vu][0]; if (vms > 0) $("cr-vs").value = logPos(vms, 0.5, 30000);
		var hm = num(S.h) * LU[S.hu]; if (hm > 0) $("cr-hs").value = logPos(hm, 1e-4, 10);
	}
	function runHit() {
		var o = hitInput();
		if (!hitOk(o)) { $("cr-verdict").textContent = "Fill in every size, the speed and the thickness with numbers above zero."; return; }
		var r = C.impact(o); R1 = r;
		if (!(num(S.m) > 0)) { $("cr-m").value = sig(r.m * 1000, 3).replace(/,/g, ""); $("cr-m-n").textContent = "Worked out from the size and the material" + (num(S.rho) > 0 ? " (density " + S.rho + " kg/m³)" : "") + "."; $("cr-mauto").hidden = true; }
		else { $("cr-m-n").textContent = "You typed the mass, so the object's density is " + sig(r.m / (o.shape === "sphere" ? Math.PI * o.d * o.d * o.d / 6 : Math.PI * o.d * o.d / 4 * o.L), 3) + " kg/m³."; $("cr-mauto").hidden = false; }
		renderHit(r, o); drawCh1(o, r); drawCh2(o); startAnim(1); save();
	}
	var OUT = { through: "Goes through", breaks: "Breaks through", stuck: "Stops inside", crater: "Makes a crater", bounces: "Bounces off", shatters: "Shatters on the surface", ricochet: "Glances off (ricochet)" };
	var REG = { rigid: "stays in one piece", mushroom: "flattens (mushrooms)", shatter: "shatters", bounce: "squashes and springs back", erode: "erodes away like a fluid as it goes" };
	function verdict(r, o) {
		var pm = C.mat(o.pm), tm = C.mat(o.tm), s = "";
		var who = "The " + (o.shape === "sphere" ? "ball" : "object") + " (" + mass(r.m) + " of " + lc(pm.name) + ")";
		if (r.out === "through") s = who + " goes through the " + len(o.h) + " of " + lc(tm.name) + (r.debris ? " as a spray of molten debris" : "") + " and comes out at " + spd(r.vr) + (r.plug > 1e-6 ? ", pushing out a plug of " + mass(r.plug) : "") + ".";
		else if (r.out === "breaks") s = "The " + lc(tm.name) + " cannot bend enough to take the blow: it breaks, and " + who.charAt(0).toLowerCase() + who.slice(1) + " carries on at " + spd(r.vr) + ".";
		else if (r.out === "stuck") s = who + " " + REG[r.reg] + " and stops " + len(r.depth) + " into the " + lc(tm.name) + ".";
		else if (r.out === "crater") s = who + " " + REG[r.reg] + " and digs a crater about " + len(r.P) + " deep and " + len(r.dEff) + " across.";
		else if (r.out === "shatters") s = who + " shatters on the surface without getting in.";
		else if (r.out === "bounces") s = who + " bounces off" + (r.rebound > 0.05 ? " at about " + spd(r.rebound) : "") + ".";
		else if (r.out === "ricochet") s = "At " + o.ang + "° it hits at too shallow an angle and glances off.";
		if (r.mush && r.out !== "through") s += " It flattens to about " + len(r.dEff) + " across.";
		if (r.dent > 1e-4) s += " The sheet is left with a dent about " + len(r.dent) + " deep.";
		if (r.cracks && r.out !== "breaks") s += " The " + lc(tm.name) + " cracks.";
		if (r.spall) s += " Chunks break off the back face (spalling).";
		if (r.vapor) s += " The impact is violent enough to melt and partly vaporise it.";
		else if (r.melt) s += " It heats up enough to melt.";
		return s;
	}
	function renderHit(r, o) {
		var tm = C.mat(o.tm), stop = isFinite(r.hStop) ? (r.hStop < 1e-6 ? "any thickness" : len(r.hStop)) : "more than 200 m";
		$("cr-verdict").textContent = verdict(r, o);
		var ro = [["Result", OUT[r.out], r.perf ? "exit speed " + spd(r.vr) : (r.out === "stuck" || r.out === "crater" ? "depth " + len(r.P) : "")],
			["Energy", si(r.ke, "J"), likeE(r.ke)], ["Momentum", sig(r.p, 3) + " kg·m/s", "force × time it takes to stop"],
			["Peak force", si(r.F, "N"), "≈ " + sig(r.F / G, 3) + " kg weight"],
			["Ballistic limit", isFinite(r.vbl) ? spd(r.vbl) : "not reached", "slowest speed that goes through"],
			["To stop it", stop, "of " + lc(tm.name)]];
		$("cr-ro1").innerHTML = ro.map(function (x, i) { return '<div class="cr-ro' + (i === 0 ? " cr-ro--" + (r.perf ? "bad" : "ok") : "") + '"><span>' + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b><small>" + esc(x[2]) + "</small></div>"; }).join("");
		var rows = [["Mass", mass(r.m)], ["Kinetic energy", si(r.ke, "J") + " <small>" + esc(likeE(r.ke)) + "; " + sig(r.tnt * 1000, 3) + " g of TNT</small>"], ["Momentum", sig(r.p, 3) + " kg·m/s"],
			["Speed", spdAll(o.v)], ["Contact pressure at first touch", si(r.s0, "Pa") + " <small>the target resists with " + si(r.Rt, "Pa") + "; the object can take about " + si(r.Rp, "Pa") + "</small>"],
			["The object", esc(REG[r.reg])], ["Peak force", si(r.F, "N") + " <small>" + sig(r.F / G / 1000, 3) + " tonnes-force</small>"], ["Contact time", time(r.tContact)], ["Average deceleration", sig(r.decel / G, 3) + " g"],
			["Depth into a thick block", r.P > 0 ? len(r.P) : "none (it does not get in)"], ["Plate thickness along the flight line", len(r.hEff) + (o.ang > 0 ? " <small>(" + len(o.h) + " at " + o.ang + "°)</small>" : "")],
			["Exit speed", r.perf ? spd(r.vr) : "stays on this side"], ["Energy taken by the target", si(r.eAbs, "J")]];
		if (r.plug > 1e-6) rows.push(["Plug punched out", mass(r.plug)]);
		if (r.dent > 1e-5) rows.push(["Dent left in the sheet", len(r.dent)]);
		if (tm.kind === "brittle" && r.Ubend > 0) rows.push(["Bending energy the pane can take", si(r.Ubend, "J") + " <small>thinner panes take much less</small>"]);
		rows.push(["Ballistic limit", isFinite(r.vbl) ? spdAll(r.vbl) : "not reached even at 40 km/s"], ["Thickness needed to stop it", stop + " <small>of " + esc(lc(tm.name)) + " at this angle</small>"],
			["Temperature rise of the object", r.vapor ? "it vaporises (thousands of °C)" : r.melt ? "it melts" : "about " + sig(r.dT, 2) + " °C <small>if 30% of the lost energy heats it</small>"]);
		$("cr-tab1").innerHTML = "<tbody>" + rows.map(function (x) { return "<tr><td>" + x[0] + "</td><td>" + x[1] + "</td></tr>"; }).join("") + "</tbody>";
		var b = OUT[r.out] + (r.perf ? " · exits at " + spd(r.vr) : "");
		$("cr-b1").textContent = b;
	}
	/* hit inputs */
	function bindVal(id, key, after) { $(id).addEventListener("input", function () { S[key] = this.value; if (after) after(); schedule(); }); }
	var tmr1 = 0, tmr2 = 0;
	function schedule() { clearTimeout(tmr1); tmr1 = setTimeout(runHit, 120); }
	function schedule2() { clearTimeout(tmr2); tmr2 = setTimeout(runCrash, 80); }
	$("cr-pm").addEventListener("change", function () { S.pm = this.value; S.rho = ""; runHit(); });
	$("cr-sh").addEventListener("change", function () { S.sh = this.value; syncHitInputs(); runHit(); });
	$("cr-du").addEventListener("change", function () { var f = LU[S.du] / LU[this.value]; S.d = sig(num(S.d) * f, 4).replace(/,/g, ""); S.L = sig(num(S.L) * f, 4).replace(/,/g, ""); S.du = this.value; syncHitInputs(); runHit(); });
	$("cr-hu").addEventListener("change", function () { S.h = sig(num(S.h) * LU[S.hu] / LU[this.value], 4).replace(/,/g, ""); S.hu = this.value; syncHitInputs(); runHit(); });
	$("cr-vu").addEventListener("change", function () { S.v = sig(num(S.v) * VU[S.vu][0] / VU[this.value][0], 4).replace(/,/g, ""); S.vu = this.value; syncHitInputs(); runHit(); });
	$("cr-tm").addEventListener("change", function () { S.tm = this.value; runHit(); });
	bindVal("cr-d", "d"); bindVal("cr-L", "L"); bindVal("cr-w", "w");
	bindVal("cr-v", "v", function () { var x = num(S.v) * VU[S.vu][0]; if (x > 0) $("cr-vs").value = logPos(x, 0.5, 30000); });
	bindVal("cr-h", "h", function () { var x = num(S.h) * LU[S.hu]; if (x > 0) $("cr-hs").value = logPos(x, 1e-4, 10); });
	$("cr-m").addEventListener("input", function () { S.m = this.value; schedule(); });
	$("cr-mauto").addEventListener("click", function () { S.m = ""; S.rho = ""; runHit(); });
	$("cr-a").addEventListener("input", function () { S.a = this.value; $("cr-a-v").textContent = S.a; schedule(); });
	$("cr-vs").addEventListener("input", function () { var v = logVal(+this.value, 0.5, 30000); S.v = sig(v / VU[S.vu][0], 3).replace(/,/g, ""); $("cr-v").value = S.v; schedule(); });
	$("cr-hs").addEventListener("input", function () { var h = logVal(+this.value, 1e-4, 10); S.h = sig(h / LU[S.hu], 3).replace(/,/g, ""); $("cr-h").value = S.h; schedule(); });
	function chips(box, list, apply) {
		box.innerHTML = list.map(function (p, i) { return '<button type="button" data-i="' + i + '">' + esc(p.n) + "</button>"; }).join("");
		box.addEventListener("click", function (e) { var b = e.target.closest("button[data-i]"); if (!b) return; apply(list[+b.dataset.i]); });
	}
	var noteBox = document.createElement("p"); noteBox.className = "tu-note cr-pnote"; $("cr-pre1").after(noteBox);
	chips($("cr-pre1"), PRE1, function (p) {
		S.pm = p.pm; S.sh = p.sh; S.du = p.d >= 1000 ? "m" : "mm"; S.d = String(S.du === "m" ? p.d / 1000 : p.d); S.L = String(p.L ? (S.du === "m" ? p.L / 1000 : p.L) : 100); S.m = p.m ? String(p.m) : ""; S.rho = p.rho ? String(p.rho) : "";
		S.vu = "ms"; S.v = String(p.v); S.a = "0"; S.tm = p.tm; S.hu = p.hu || "mm"; S.h = String(p.hu === "m" ? p.h / 1000 : p.h); S.w = String(p.w);
		noteBox.textContent = p.note || ""; syncHitInputs(); runHit();
	});

	/* ---------------- canvases ---------------- */
	var dpr = 1;
	function sizeStage(n) {
		var st = $("cr-st" + n), wrap = st.parentNode, w = wrap.clientWidth || 600, h = Math.round(w / (w < 560 ? 1.15 : 2.0));
		wrap.setAttribute("data-mes-free", "1"); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(st, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		h = Math.max(240, h); st.style.height = h + "px"; var c = $("cr-c" + n); dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
	}
	function sizeChart(c, aspect, minH) { var w = c.parentNode.clientWidth || 500, h = Math.max(minH || 180, Math.round(w / aspect)); c.style.height = h + "px"; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); return { w: w, h: h }; }
	function onResize() { if (S.tab === "hit") { sizeStage(1); if (R1) { drawCh1(hitInput(), R1); drawCh2(hitInput()); } } else { sizeStage(2); if (R2) drawCh3(); } frame(true); }
	function dark() { return document.body.classList.contains("dark-mode"); }
	function chartCol() { var d = dark(); return { bg: d ? "#16181d" : "#ffffff", grid: d ? "#2c313a" : "#e6e9ee", text: d ? "#c9ced6" : "#4a5260", strong: d ? "#f1f3f6" : "#1f2530", acc: d ? "#ff9a6b" : "#c2410c", line2: d ? "#7cc4ff" : "#1d6fd1", line3: d ? "#9be38b" : "#2f8a28" }; }

	/* chart 1: exit speed vs impact speed */
	var ch1pts = null;
	function drawCh1(o, r) {
		var c = $("cr-ch1"), sz = sizeChart(c, 2.2, 190), x = c.getContext("2d"), col = chartCol(); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = col.bg; x.fillRect(0, 0, sz.w, sz.h);
		var vmax = Math.max(o.v * 1.6, isFinite(r.vbl) ? r.vbl * 2 : o.v * 2), pts = C.curve(o, vmax, 70), L = 54, B = 34, T = 12, Rr = 12, W = sz.w - L - Rr, H = sz.h - T - B;
		ch1pts = { pts: pts, vmax: vmax, L: L, T: T, W: W, H: H, o: o };
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "12px system-ui,sans-serif"; x.lineWidth = 1;
		var f = VU[S.vu][0];
		for (var i = 0; i <= 5; i++) { var gx = L + W * i / 5, gy = T + H * i / 5; x.beginPath(); x.moveTo(gx, T); x.lineTo(gx, T + H); x.moveTo(L, gy); x.lineTo(L + W, gy); x.stroke(); x.textAlign = "center"; x.fillText(sig(vmax * i / 5 / f, 2), gx, T + H + 16); x.textAlign = "right"; x.fillText(sig(vmax * (5 - i) / 5 / f, 2), L - 6, gy + 4); }
		x.textAlign = "center"; x.fillText("impact speed (" + VU[S.vu][1] + ")", L + W / 2, sz.h - 3); x.save(); x.translate(13, T + H / 2); x.rotate(-Math.PI / 2); x.fillText("exit speed", 0, 0); x.restore();
		x.setLineDash([4, 4]); x.strokeStyle = col.grid; x.beginPath(); x.moveTo(L, T + H); x.lineTo(L + W, T); x.stroke(); x.setLineDash([]);
		x.strokeStyle = col.acc; x.lineWidth = 2.5; x.beginPath(); var first = true;
		pts.forEach(function (p) { if (!isFinite(p[1])) return; var px = L + W * p[0] / vmax, py = T + H * (1 - p[1] / vmax); if (first) { x.moveTo(px, py); first = false; } else x.lineTo(px, py); }); x.stroke();
		if (isFinite(r.vbl) && r.vbl < vmax) { var bx = L + W * r.vbl / vmax; x.strokeStyle = col.line2; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(bx, T); x.lineTo(bx, T + H); x.stroke(); x.setLineDash([]); x.fillStyle = col.line2; x.textAlign = "left"; x.fillText("ballistic limit " + spd(r.vbl), Math.min(bx + 5, L + W - 150), T + 14); }
		var cy = r.perf ? r.vr : 0; x.fillStyle = col.strong; x.beginPath(); x.arc(L + W * o.v / vmax, T + H * (1 - cy / vmax), 5, 0, 7); x.fill();
	}
	$("cr-ch1").addEventListener("mousemove", function (e) {
		if (!ch1pts) return; var b = this.getBoundingClientRect(), mx = e.clientX - b.left, k = ch1pts; if (mx < k.L || mx > k.L + k.W) return;
		var v = (mx - k.L) / k.W * k.vmax, t = Object.assign({}, k.o); t.v = v; var vr = C.impactLite(t); this.title = "Impact " + spd(v) + " → " + (vr > 0 ? "exit " + spd(vr) : "stopped");
	});
	/* chart 2: thickness to stop it, per material */
	var ch2bars = [];
	function drawCh2(o) {
		var list = C.MATS.map(function (m) { var t = Object.assign({}, o, { tm: m.id }); return { m: m, h: C.stopThickness(t) }; });
		list.sort(function (a, b) { return (isFinite(a.h) ? a.h : 1e9) - (isFinite(b.h) ? b.h : 1e9); });
		var c = $("cr-ch2"), rowH = 19, w = c.parentNode.clientWidth || 500, hgt = 20 + rowH * list.length + 24; c.style.height = hgt + "px"; c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr);
		var x = c.getContext("2d"), col = chartCol(); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = col.bg; x.fillRect(0, 0, w, hgt);
		x.font = "bold 12px system-ui,sans-serif"; var L = Math.min(10 + Math.max.apply(null, list.map(function (it) { return x.measureText(it.m.name).width; })), w * 0.45), W = w - L - 74, lo = 1e-4, hi = 1e3; x.font = "12px system-ui,sans-serif"; ch2bars = [];
		[1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100, 1000].forEach(function (v) { var px = L + W * Math.log(v / lo) / Math.log(hi / lo); x.strokeStyle = col.grid; x.beginPath(); x.moveTo(px, 14); x.lineTo(px, hgt - 22); x.stroke(); x.fillStyle = col.text; x.textAlign = "center"; x.fillText(len(v).replace(" ", " "), px, hgt - 6); });
		list.forEach(function (it, i) {
			var y = 16 + i * rowH, cur = it.m.id === o.tm; x.textAlign = "right"; x.fillStyle = cur ? col.strong : col.text; x.font = (cur ? "bold " : "") + "12px system-ui,sans-serif"; x.fillText(it.m.name, L - 6, y + 13);
			var hv = it.h, pw = hv <= lo ? 2 : isFinite(hv) ? Math.max(2, W * Math.log(Math.min(hv, hi) / lo) / Math.log(hi / lo)) : W;
			x.fillStyle = it.m.col; x.fillRect(L, y + 3, pw, rowH - 6); x.strokeStyle = cur ? col.acc : "rgba(0,0,0,0.25)"; x.lineWidth = cur ? 2.5 : 1; x.strokeRect(L + 0.5, y + 3.5, pw, rowH - 7);
			x.textAlign = "left"; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.fillText(!isFinite(hv) ? "> 200 m" : hv < 1e-6 ? "any (it breaks up)" : len(hv), L + pw + 5, y + 13);
			ch2bars.push({ y0: y, y1: y + rowH, id: it.m.id });
		});
	}
	$("cr-ch2").addEventListener("click", function (e) { var b = this.getBoundingClientRect(), y = e.clientY - b.top; ch2bars.forEach(function (r) { if (y >= r.y0 && y < r.y1) { S.tm = r.id; $("cr-tm").value = r.id; runHit(); root.querySelector(".cr-wrap").scrollIntoView({ behavior: "smooth", block: "center" }); } }); });
	$("cr-ch2").style.cursor = "pointer";

	/* ---------------- animation ---------------- */
	var anim = { n: 1, t0: 0, raf: 0, parts: [] };
	function rnd(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
	function startAnim(n) { anim.freeze = null; anim.n = n; anim.t0 = performance.now(); anim.parts = []; if (!anim.raf) anim.raf = requestAnimationFrame(loop); }
	function loop() { anim.raf = 0; var going = frame(false); if (going) anim.raf = requestAnimationFrame(loop); }
	function dur() { return S.slow ? 2.2 : 1; }
	function frame(still) {
		var n = S.tab === "hit" ? 1 : 2; if (n === 1 && !R1) return false; if (n === 2 && !R2) return false;
		var t = anim.freeze != null ? anim.freeze : still && anim.n !== n ? 99 : (performance.now() - anim.t0) / 1000;
		if (n === 1) { drawHit(t); return t < 4.4 * dur() + 0.2; } drawCrash(t); return t < (R2.anim.total) + 0.2;
	}
	function ctx(n) { var c = $("cr-c" + n), x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); return { x: x, w: c.width / dpr, h: c.height / dpr }; }
	function ease(u) { return u < 0 ? 0 : u > 1 ? 1 : u * (2 - u); }
	function drawHit(t) {
		var r = R1, o = r.o, k = ctx(1), x = k.x, W = k.w, H = k.h, pm = C.mat(o.pm), tm = C.mat(o.tm), D = dur();
		var bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0d1220"); bg.addColorStop(1, "#1b2234"); x.fillStyle = bg; x.fillRect(0, 0, W, H);
		/* scale: fit the projectile, plate and depth */
		var pl = o.shape === "sphere" ? o.d : o.L, thick = Math.min(r.hEff, Math.max(r.P * 1.6, o.d * 6)), worldW = Math.max(pl * 5, thick * 2.6, (r.P || 0) * 2.4, o.d * 8), sc = W * 0.9 / worldW, minR = 6;
		var dpx = Math.max(o.d * sc, minR * 2), lpx = o.shape === "sphere" ? dpx : Math.max(o.L * sc, dpx * 1.6), big = o.d * sc < minR * 2;
		var hpx = Math.max(3, Math.min(r.hEff, thick) * sc), cut = r.hEff * sc > hpx + 1, px0 = W * 0.5, cy = H * 0.52, ang = (o.ang || 0) * Math.PI / 180;
		var Tin = 1.4 * D, Tc = 0.9 * D, Tout = 2.1 * D, u;
		/* plate */
		var plateTop = H * 0.08, plateBot = H * 0.92, dentPx = r.dent > 0 ? Math.max(3, Math.min(H * 0.12, r.dent * sc * (r.dent * sc < 3 ? 20 : 1))) : 0;
		var hit = t >= Tin, cu = ease((t - Tin) / Tc), after = t > Tin + Tc;
		x.save(); x.translate(px0, cy); x.rotate(-ang * 0.0);
		x.fillStyle = tm.col; x.strokeStyle = "rgba(255,255,255,0.35)"; x.lineWidth = 1;
		var bow = hit ? dentPx * cu : 0, broken = (r.out === "breaks") && hit;
		if (!broken) {
			x.beginPath(); x.moveTo(0, plateTop - cy); x.quadraticCurveTo(bow * 2, 0, 0, plateBot - cy); x.lineTo(hpx, plateBot - cy); x.quadraticCurveTo(hpx + bow * 2, 0, hpx, plateTop - cy); x.closePath(); x.fill(); x.stroke();
		} else {
			var rr = rnd(7); x.save(); var spread = cu * 0.9 + (after ? (t - Tin - Tc) * 0.6 : 0);
			for (var sI = 0; sI < 9; sI++) { var y0 = plateTop - cy + (plateBot - plateTop) * sI / 9, y1 = y0 + (plateBot - plateTop) / 9, near = 1 - Math.min(1, Math.abs((y0 + y1) / 2) / (H * 0.4)); x.save(); x.translate(spread * 60 * near * (0.6 + rr()), spread * spread * 40 * (rr() - 0.3)); x.rotate(spread * near * (rr() - 0.5)); x.fillRect(0, y0, hpx, y1 - y0 - 1); x.restore(); }
			x.restore();
		}
		if (cut) { x.fillStyle = "rgba(255,255,255,0.75)"; x.font = "11px system-ui,sans-serif"; x.textAlign = "left"; x.fillText("continues: " + len(r.hEff) + " in all", hpx + 6, plateBot - cy - 6); }
		/* hole / crater */
		var holeD = Math.max(dpx, r.dEff * sc), depthPx = Math.min((r.out === "through" || r.out === "breaks" ? r.hEff : (r.P || 0)) * sc, hpx + 2);
		if (hit && (r.P > 0 || r.perf) && r.out !== "breaks") {
			var gpx = depthPx * (r.perf ? 1 : cu); x.fillStyle = "#05070d";
			if (r.crater) { x.beginPath(); x.ellipse(0, 0, gpx, holeD / 2 * Math.min(1, cu * 1.3), 0, -Math.PI / 2, Math.PI / 2); x.fill(); }
			else { x.fillRect(0, -holeD / 2, r.perf ? hpx + 1 : gpx, holeD); }
		}
		/* cracks */
		if (hit && (r.cracks || r.spall || tm.kind === "brittle" && r.P > 0)) { var cr = rnd(3); x.strokeStyle = "rgba(255,255,255,0.7)"; x.lineWidth = 1; for (var j = 0; j < 9; j++) { x.beginPath(); var yy = (cr() - 0.5) * holeD, cxx = 0; x.moveTo(1, yy); for (var s2 = 0; s2 < 5; s2++) { cxx += hpx * 0.2; yy += (cr() - 0.5) * H * 0.12 * cu; x.lineTo(Math.min(cxx, hpx - 1), yy); } x.stroke(); } }
		x.restore();
		/* projectile path: comes in along the angle from the upper left */
		var dir = [Math.cos(ang), Math.sin(ang)], startX = -px0 - lpx, travel = px0 + lpx * 0.5 - 4;
		function drawProj(cx, cyy, sq, rot, alpha) {
			x.save(); x.globalAlpha = alpha == null ? 1 : alpha; x.translate(cx, cyy); x.rotate(rot || 0);
			var hot = r.vapor || r.melt ? Math.min(1, Math.max(0, (t - Tin) / Tc)) : 0, base = pm.col;
			x.fillStyle = hot > 0 ? mix(base, "#ffb347", hot) : base; x.strokeStyle = "rgba(255,255,255,0.55)"; x.lineWidth = 1;
			var dw = dpx * sq, ll = (o.shape === "sphere" ? dpx : lpx) / sq;
			if (o.shape === "sphere") { x.beginPath(); x.ellipse(0, 0, ll / 2, dw / 2, 0, 0, 7); x.fill(); x.stroke(); }
			else { x.beginPath(); x.moveTo(-ll, -dw / 2); var nose = o.shape === "flat" ? 0 : o.shape === "round" ? dw / 2 : dw * 1.2; x.lineTo(-nose, -dw / 2); if (o.shape === "flat") x.lineTo(0, -dw / 2), x.lineTo(0, dw / 2); else if (o.shape === "round") x.arc(-nose, 0, dw / 2, -Math.PI / 2, Math.PI / 2); else x.lineTo(0, 0), x.lineTo(-nose, dw / 2); x.lineTo(-ll, dw / 2); x.closePath(); x.fill(); x.stroke(); }
			x.restore();
		}
		var rot = ang, cx, cyy;
		var nose0 = o.shape === "sphere" ? dpx / 2 : 0;
		if (t < Tin) { u = t / Tin; var dist = travel * (1 - u); cx = px0 - nose0 - dist * dir[0]; cyy = cy - dist * dir[1]; drawProj(cx, cyy, 1, rot); trail(cx, cyy, dir, u); }
		else {
			var sqz = r.mush ? Math.sqrt(r.f) : 1;
			if (r.out === "bounces" || r.out === "shatters" || r.out === "ricochet") {
				var bu = (t - Tin) / Tout;
				if (r.out === "shatters") { if (!anim.parts.length) burst(px0, cy, r.ke, pm.col, -1, 26); drawParts(t - Tin); }
				else { var outDir = r.out === "ricochet" ? [-Math.cos(ang) * 0.4 + 0.0, Math.sin(ang)] : [-Math.cos(ang), Math.sin(ang) * 0.3]; var sp = (r.rebound / Math.max(o.v, 1e-9)) * travel * 1.4; var squash = r.out === "bounces" && t < Tin + Tc * 0.4 ? 1 + 0.35 * Math.sin(Math.PI * (t - Tin) / (Tc * 0.4)) : 1; drawProj(px0 - nose0 + outDir[0] * sp * bu, cy + outDir[1] * sp * bu, squash, Math.atan2(outDir[1], outDir[0]) + Math.PI); }
			}
			else if (r.out === "stuck" || r.out === "crater") { var dep = Math.min(r.P * sc, hpx + 4) * cu; if (r.reg === "erode") { if (!anim.parts.length) burst(px0, cy, r.ke, "#ffd18a", -1, 40); drawParts(t - Tin); drawProj(px0 + dep - nose0, cy, 1, 0, Math.max(0, 1 - cu)); } else drawProj(px0 - nose0 + dep, cy, 1 + (sqz - 1) * cu, 0); }
			else if (r.out === "through" || r.out === "breaks") {
				var ex = (r.vr / Math.max(o.v, 1e-9)), pass = Math.min(1, (t - Tin) / Tc), xin = (hpx + lpx) * pass, xout = after ? (t - Tin - Tc) / Tout * travel * 1.3 * ex : 0;
				if (r.debris) { if (!anim.parts.length) { burst(px0, cy, r.ke, "#ffd18a", -1, 24); burst(px0 + hpx, cy, r.ke, "#ffb347", 1, 60, ex); } drawParts(t - Tin); }
				else {
					var bx2 = px0 - nose0 + xin + xout; drawProj(bx2, cy, 1 + (sqz - 1) * Math.min(1, pass), 0);
					if (r.plug > 1e-6 && pass >= 1) { /* the plug leaves just ahead of the nose, at the same speed */ var pw2 = Math.max(2, (r.plug / (tm.rho * Math.PI * Math.pow(r.dEff, 2) / 4)) * sc); x.fillStyle = tm.col; x.strokeStyle = "rgba(255,255,255,0.5)"; x.fillRect(Math.max(px0 + hpx, bx2 + nose0 + 3 + xout * 0.15), cy - holeD / 2, pw2, holeD); x.strokeRect(Math.max(px0 + hpx, bx2 + nose0 + 3 + xout * 0.15), cy - holeD / 2, pw2, holeD); }
				}
			}
		}
		/* labels and scale bar */
		x.fillStyle = "rgba(255,255,255,0.85)"; x.font = "12px system-ui,sans-serif"; x.textAlign = "left";
		x.fillText(pm.name + (big ? " (drawn bigger than life)" : ""), 12, H - 30); x.textAlign = "right"; x.fillText(tm.name + ", " + len(o.h), W - 12, H - 30);
		var bar = niceBar(worldW * 0.2); x.strokeStyle = "rgba(255,255,255,0.7)"; x.lineWidth = 2; x.beginPath(); x.moveTo(12, H - 14); x.lineTo(12 + bar * sc, H - 14); x.stroke(); x.textAlign = "left"; x.fillText(len(bar), 18 + bar * sc, H - 10);
		var clock = t < Tin ? "approaching at " + spd(o.v) : t < Tin + Tc ? "impact: " + time(r.tContact * Math.min(1, (t - Tin) / Tc)) + " of " + time(r.tContact) + " (slowed " + slowBy(r.tContact, Tc) + "×)" : "after the impact";
		$("cr-k1").textContent = clock;
		function trail(cx2, cy2, d, uu) { var g = x.createLinearGradient(cx2 - d[0] * 90, cy2 - d[1] * 90, cx2, cy2); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,0.25)"); x.strokeStyle = g; x.lineWidth = Math.max(2, dpx * 0.5); x.beginPath(); x.moveTo(cx2 - d[0] * 90 * uu, cy2 - d[1] * 90 * uu); x.lineTo(cx2 - d[0] * dpx * 0.5, cy2); x.stroke(); }
		function burst(bx, by, E, colr, side, nP, sp) { var rr = rnd(11 + nP); for (var i = 0; i < nP; i++) { var a = (side < 0 ? Math.PI : 0) + (rr() - 0.5) * (side < 0 ? 2.4 : 1.1), s = (30 + rr() * 140) * (sp ? 0.4 + sp : 1); anim.parts.push({ x: bx, y: by, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1 + rr() * 2.5, c: colr }); } }
		function drawParts(dt) { var tt = dt / D; anim.parts.forEach(function (p) { x.fillStyle = p.c; x.globalAlpha = Math.max(0, 1 - tt / 2.6); x.beginPath(); x.arc(p.x + p.vx * tt, p.y + p.vy * tt + 30 * tt * tt, p.r, 0, 7); x.fill(); }); x.globalAlpha = 1; }
	}
	function slowBy(real, shown) { var k = shown / Math.max(real, 1e-12); return k >= 1e6 ? sig(k, 2) : Math.round(k).toLocaleString(); }
	function niceBar(v) { var e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; }
	function mix(a, b, f) { function p(h) { h = h.replace("#", ""); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; } var A = p(a), B = p(b); return "rgb(" + A.map(function (v, i) { return Math.round(v + (B[i] - v) * f); }).join(",") + ")"; }

	/* ======================= CRASH ======================= */
	var R2 = null;
	function syncCrashInputs() {
		var ob = C.obj(S.ob); $("cr-ob").value = S.ob; $("cr-om").value = num(S.om) > 0 ? S.om : String(ob.m); $("cr-cv").value = S.cv; $("cr-cvu").value = S.cvu; $("cr-fh").value = S.fh; $("cr-fhu").value = S.fhu;
		$("cr-su").value = S.su; $("cr-o2").value = S.o2; $("cr-d2").value = S.d2; $("cr-v2").value = S.v2; $("cr-v2-u").textContent = VU[S.cvu][1]; $("cr-rs").value = S.rs;
		root.querySelectorAll("#cr-vsrc button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === S.src)); });
		$("cr-cv-f").hidden = S.src !== "speed"; $("cr-fh-f").hidden = S.src !== "fall";
		var veh = S.su === "vehicle"; $("cr-o2-f").hidden = !veh; $("cr-d2-f").hidden = !veh; $("cr-v2-f").hidden = !veh || S.d2 === "stop"; $("cr-rs-f").hidden = !ob.veh;
		var vv = num(S.cv) * VU[S.cvu][0]; if (vv > 0) $("cr-cvs").value = logPos(vv, 0.3, 120);
	}
	function crashSpeed() { return S.src === "fall" ? Math.sqrt(2 * G * Math.max(0, num(S.fh) * HU[S.fhu])) : num(S.cv) * VU[S.cvu][0]; }
	function defaultE() { var ob = C.obj(S.ob), su = C.surf(S.su); if (S.su === "vehicle") return ob.e * C.obj(S.o2).e; return ob.e * su.e; }
	function runCrash() {
		var ob = C.obj(S.ob), su = C.surf(S.su), m1 = num(S.om) > 0 ? num(S.om) : ob.m, v1 = crashSpeed();
		if (!(m1 > 0) || !(v1 > 0)) { $("cr-verdict2").textContent = "Fill in a mass and a speed (or fall height) above zero."; return; }
		var e = num(S.e) >= 0 && S.e !== "" ? num(S.e) : defaultE(); $("cr-e").value = Math.round(e * 100); $("cr-e-v").textContent = e.toFixed(2);
		var k1 = ob.k * (su.soften || 1), o = { m1: m1, k1: k1, e1: Math.sqrt(Math.max(e, 0.01)), e2: Math.sqrt(Math.max(e, 0.01)), v1: v1, occ: ob.veh && S.rs !== "off" ? S.rs : null };
		var other = null;
		if (S.su === "vehicle") { other = C.obj(S.o2); var v2 = S.d2 === "stop" ? 0 : num(S.v2) * VU[S.cvu][0] || 0; o.m2 = other.m; o.k2 = other.k; o.v2 = S.d2 === "head" ? -v2 : v2; }
		else { o.m2 = Infinity; o.k2 = su.k; o.v2 = 0; }
		if (S.su === "vehicle" && S.d2 === "same" && !(o.v1 > o.v2)) { $("cr-verdict2").textContent = "The car in front is going as fast or faster, so they never meet. Lower its speed."; R2 = null; return; }
		var res = C.crash(o); R2 = { o: o, res: res, ob: ob, su: su, other: other, m1: m1 };
		var s = res.sum, tc = s.tc, occT = res.t.length ? res.t[res.t.length - 1] : tc;
		R2.anim = { Tin: 1.2, Tc: Math.max(1.6, Math.min(3.2, occT * 25)) * (S.slow ? 2 : 1), Tout: 1.4 }; R2.anim.total = R2.anim.Tin + R2.anim.Tc + R2.anim.Tout;
		renderCrash(); drawCh3(); startAnim(2); save();
	}
	function risk(p) { return p < 0.03 ? "low" : p < 0.15 ? "moderate" : p < 0.5 ? "high" : "very high"; }
	function renderCrash() {
		var R = R2, s = R.res.sum, o = R.o, ob = R.ob, fall = S.src === "fall", into = S.su === "vehicle" ? "the " + lc(R.other.name) : (!ob.veh && R.su.sayDrop) || R.su.say || R.su.name.toLowerCase();
		var txt = "The " + lc(ob.name) + " (" + mass(R.m1) + ") " + (fall ? "falls " + sig(num(S.fh), 3) + " " + S.fhu + " onto " + into + " and lands at " + spd(o.v1, "ms") : "hits " + into + " at " + spd(o.v1, S.cvu)) + ". ";
		txt += "It stops in " + len(s.crush) + " and " + time(s.tc) + ", a peak of " + sig(s.a1max / G, 3) + " g (" + sig(s.a1avg / G, 3) + " g on average). ";
		if (ob.breakF) txt += s.Fmax > ob.breakF ? "The peak force, " + si(s.Fmax, "N") + ", is above the " + si(ob.breakF, "N") + " it can take: it breaks. " : "The peak force, " + si(s.Fmax, "N") + ", is below the " + si(ob.breakF, "N") + " it can take: it survives. ";
		if (/^person/.test(ob.id)) txt += "That is " + sig(s.Fmax / (R.m1 * G), 3) + " times body weight through the legs. ";
		if (S.su === "vehicle") txt += "Its speed changes by " + spd(s.dv1, S.cvu) + "; the " + lc(R.other.name) + "'s by " + spd(s.dv2, S.cvu) + ". ";
		if (s.occ) txt += "The person inside (" + C.RESTRAINTS[o.occ].name.toLowerCase() + ") feels " + sig(s.occ.clip3, 3) + " g on the chest and a head injury criterion of " + Math.round(s.occ.hic) + ": a " + risk(Math.max(s.occ.pHead, s.occ.pChest)) + " risk of severe injury.";
		$("cr-verdict2").textContent = txt;
		var ro = [["Impact speed", spd(o.v1, fall ? "ms" : S.cvu), fall ? "after " + sig(num(S.fh), 3) + " " + S.fhu : spdAll(o.v1).replace(/^.*?\(/, "(")],
			["Stopping distance", len(s.crush), "crush + give of the surface"], ["Peak deceleration", sig(s.a1max / G, 3) + " g", "average " + sig(s.a1avg / G, 3) + " g"],
			["Peak force", si(s.Fmax, "N"), sig(s.Fmax / G / 1000, 3) + " tonnes-force"], ["Contact time", time(s.tc), "how long the stop takes"]];
		if (s.occ) ro.push(["Person inside", sig(s.occ.clip3, 3) + " g · HIC " + Math.round(s.occ.hic), risk(Math.max(s.occ.pHead, s.occ.pChest)) + " risk of severe injury"]);
		else if (ob.breakF) ro.push(["Breaks?", s.Fmax > ob.breakF ? "Yes" : "No", "it can take about " + si(ob.breakF, "N")]);
		$("cr-ro2").innerHTML = ro.map(function (x, i) { var bad = i === ro.length - 1 && ((s.occ && Math.max(s.occ.pHead, s.occ.pChest) >= 0.15) || (!s.occ && ob.breakF && s.Fmax > ob.breakF)); var good = i === ro.length - 1 && ((s.occ && Math.max(s.occ.pHead, s.occ.pChest) < 0.03) || (!s.occ && ob.breakF && s.Fmax <= ob.breakF)); return '<div class="cr-ro' + (bad ? " cr-ro--bad" : good ? " cr-ro--ok" : "") + '"><span>' + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b><small>" + esc(x[2]) + "</small></div>"; }).join("");
		var rows = [["Mass", mass(R.m1)], ["Impact speed", spdAll(o.v1)], ["Kinetic energy", si(s.keIn, "J") + " <small>" + esc(likeE(s.keIn)) + "</small>"], ["Same as falling from", len(o.v1 * o.v1 / (2 * G))],
			["Energy soaked up (crushing, heat)", si(s.eAbs, "J")], ["Crush of the " + esc(lc(ob.name)), len(s.crush1)], [S.su === "vehicle" ? "Crush of the " + esc(lc(R.other.name)) : "Give of the surface", len(s.crush2)],
			["Contact time", time(s.tc)], ["Peak / average deceleration", sig(s.a1max / G, 3) + " g / " + sig(s.a1avg / G, 3) + " g"], ["Peak force", si(s.Fmax, "N") + " <small>" + sig(s.Fmax / G / 1000, 3) + " tonnes-force</small>"],
			["Bounces back at", spd(s.rebound * (o.m2 === Infinity ? 1 : 1), "ms")], ["Change of speed (Δv)", spdAll(s.dv1)]];
		if (S.su === "vehicle") rows.push(["Other vehicle: Δv and peak", spdAll(s.dv2) + " · " + sig(s.a2max / G, 3) + " g"], ["Speeds after", spd(s.v1After, S.cvu) + " and " + spd(s.v2After, S.cvu) + " <small>momentum is conserved</small>"]);
		if (s.occ) rows.push(["Person: peak chest deceleration", sig(s.occ.peak, 3) + " g <small>3 ms clip " + sig(s.occ.clip3, 3) + " g (limit used in US tests: 60 g)</small>"], ["Person: head injury criterion (HIC15)", Math.round(s.occ.hic) + " <small>limit used in tests: 700</small>"],
			["Person: how far forward they move", len(s.occ.travel) + " <small>relative to the car</small>"], ["Chance of a severe head / chest injury (AIS 4+)", Math.round(s.occ.pHead * 100) + "% / " + Math.round(s.occ.pChest * 100) + "% <small>NHTSA's NCAP risk curves, rough</small>"]);
		$("cr-tab2").innerHTML = "<tbody>" + rows.map(function (x) { return "<tr><td>" + x[0] + "</td><td>" + x[1] + "</td></tr>"; }).join("") + "</tbody>";
		$("cr-b2").textContent = sig(s.a1max / G, 3) + " g peak · stops in " + len(s.crush) + (s.occ ? " · person " + sig(s.occ.clip3, 3) + " g" : "");
	}
	/* chart 3: deceleration vs time */
	function drawCh3(cursor) {
		var c = $("cr-ch3"); if (!R2) return; var sz = sizeChart(c, 3.6, 150), x = c.getContext("2d"), col = chartCol(), res = R2.res; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = "#0e1118"; x.fillRect(0, 0, sz.w, sz.h);
		var L = 46, B = 26, T = 10, W = sz.w - L - 12, H = sz.h - T - B, tmax = res.t[res.t.length - 1] || 0.1, gmax = 1;
		function g(arr, i) { return Math.abs(arr[i]) / G; }
		for (var i = 0; i < res.t.length; i++) { gmax = Math.max(gmax, g(res.a1, i), res.ao.length ? g(res.ao, i) : 0, g(res.a2, i)); }
		gmax = niceBar(gmax) * Math.ceil(gmax / niceBar(gmax));
		x.font = "11px system-ui,sans-serif"; x.strokeStyle = "#262c38"; x.fillStyle = "#9aa5bb";
		for (var j = 0; j <= 4; j++) { var yy = T + H * j / 4, xx = L + W * j / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + W, yy); x.moveTo(xx, T); x.lineTo(xx, T + H); x.stroke(); x.textAlign = "right"; x.fillText(sig(gmax * (4 - j) / 4, 3) + " g", L - 4, yy + 4); x.textAlign = "center"; x.fillText(time(tmax * j / 4), xx, T + H + 15); }
		function line(arr, colr, w) { x.strokeStyle = colr; x.lineWidth = w; x.beginPath(); for (var i = 0; i < res.t.length; i++) { var px = L + W * res.t[i] / tmax, py = T + H * (1 - g(arr, i) / gmax); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); }
		if (isFinite(R2.o.m2)) line(res.a2, "#7cc4ff", 1.5);
		line(res.a1, "#ff9a6b", 2.2); if (res.ao.length) line(res.ao, "#9be38b", 2.2);
		x.textAlign = "left"; x.fillStyle = "#ff9a6b"; x.fillText("■ " + R2.ob.name, L + 6, T + 12); var lx = L + 12 + x.measureText("■ " + R2.ob.name).width;
		if (res.ao.length) { x.fillStyle = "#9be38b"; x.fillText("■ person inside", lx, T + 12); lx += 100; } if (isFinite(R2.o.m2)) { x.fillStyle = "#7cc4ff"; x.fillText("■ " + R2.other.name, lx, T + 12); }
		if (cursor != null) { var cx = L + W * Math.min(1, cursor / tmax); x.strokeStyle = "rgba(255,255,255,0.6)"; x.lineWidth = 1; x.beginPath(); x.moveTo(cx, T); x.lineTo(cx, T + H); x.stroke(); }
	}
	/* crash animation */
	function at(arr, tt) { var ts = R2.res.t; if (!ts.length) return 0; if (tt <= ts[0]) return arr[0]; var lo = 0, hi = ts.length - 1; if (tt >= ts[hi]) return arr[hi]; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (ts[m] < tt) lo = m; else hi = m; } var f = (tt - ts[lo]) / (ts[hi] - ts[lo]); return arr[lo] + (arr[hi] - arr[lo]) * f; }
	function prepKin() {
		if (R2.kin) return R2.kin; var res = R2.res, o = R2.o, n = res.t.length, x1 = [0], v1 = [o.v1], x2 = [0], v2 = [o.v2 || 0];
		for (var i = 1; i < n; i++) { var dt = res.t[i] - res.t[i - 1]; v1.push(v1[i - 1] + res.a1[i] * dt); x1.push(x1[i - 1] + v1[i] * dt); v2.push(v2[i - 1] + res.a2[i] * dt); x2.push(x2[i - 1] + v2[i] * dt); }
		R2.kin = { x1: x1, v1: v1, x2: x2, v2: v2 }; return R2.kin;
	}
	function drawCrash(t) {
		var k = ctx(2), x = k.x, W = k.w, H = k.h, R = R2, o = R.o, res = R.res, s = res.sum, ob = R.ob, A = R.anim, kin = prepKin(), vertical = !ob.veh;
		var bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#101726"); bg.addColorStop(1, "#1d2536"); x.fillStyle = bg; x.fillRect(0, 0, W, H);
		var tPhys, pre = 0, post = 0, tEnd = res.t[res.t.length - 1] || s.tc;
		if (t < A.Tin) { tPhys = 0; pre = (A.Tin - t) / A.Tin; } else if (t < A.Tin + A.Tc) tPhys = tEnd * (t - A.Tin) / A.Tc; else { tPhys = tEnd; post = (t - A.Tin - A.Tc) / A.Tout; }
		var z = at(res.z, tPhys), c1 = z * s.k / o.k1, c2 = z * s.k / o.k2, y = res.y.length ? at(res.y, tPhys) : 0;
		var dx1 = at(kin.x1, tPhys), dx2 = at(kin.x2, tPhys), vEnd1 = kin.v1[kin.v1.length - 1], vEnd2 = kin.v2[kin.v2.length - 1];
		if (vertical) {
			var obH = { egg: 0.06, phone: 0.15, melon: 0.3, bowling: 0.22, personbent: 1.75, personstiff: 1.75 }[ob.id] || 0.3, scy = H * 0.5 / obH, floorY = H * 0.78;
			var giveMax = Math.max(s.crush2, 1e-9), drop = pre > 0 ? pre * H * 0.7 : 0, rebound = post > 0 ? Math.min(H * 0.3, s.rebound * s.rebound / (2 * G) * scy) * Math.sin(Math.min(1, post) * Math.PI) : 0;
			x.fillStyle = R.su.id === "vehicle" ? "#555" : surfCol(R.su.id); var sg = c2 * scy; x.fillRect(0, floorY + Math.min(sg, H * 0.1), W, H - floorY);
			x.fillStyle = "rgba(255,255,255,0.8)"; x.font = "12px system-ui,sans-serif"; x.textAlign = "right"; x.fillText(R.su.name, W - 12, H - 12);
			var squash = Math.min(0.85, c1 / obH), bottom = floorY + Math.min(sg, H * 0.1) - drop - rebound;
			drawThing(x, ob.id, W / 2, bottom, obH * scy, squash, s.Fmax > (ob.breakF || Infinity) && t > A.Tin + A.Tc * 0.3);
			if (pre > 0) { x.strokeStyle = "rgba(255,255,255,0.18)"; x.lineWidth = 3; x.beginPath(); x.moveTo(W / 2, bottom - obH * scy - 10); x.lineTo(W / 2, bottom - obH * scy - 70); x.stroke(); }
		} else {
			var carL = carLen(ob), car2L = R.other ? carLen(R.other) : 0, sc = W * 0.3 / Math.max(carL, car2L * 0.8), gy = H * 0.72, c0 = W * (isFinite(o.m2) ? 0.5 : 0.62);
			x.fillStyle = "#2a3140"; x.fillRect(0, gy, W, H - gy); x.strokeStyle = "#454d5e"; x.setLineDash([20, 16]); x.beginPath(); x.moveTo(0, gy + 18); x.lineTo(W, gy + 18); x.stroke(); x.setLineDash([]);
			/* ground frame: real seconds shown before / after = enough for the faster one to cover about half the picture */
			var vmaxA = Math.max(Math.abs(o.v1), Math.abs(o.v2 || 0), 1), Treal = 0.45 * W / (sc * vmaxA), n1 = kin.x1.length - 1;
			var c1e = res.z[n1] * s.k / o.k1, c2e = res.z[n1] * s.k / o.k2, s1, s2;
			if (pre > 0) { s1 = c0 - o.v1 * pre * Treal * sc; s2 = c0 - (o.v2 || 0) * pre * Treal * sc; c1 = 0; c2 = 0; }
			else if (post > 0) { s1 = c0 + (kin.x1[n1] - c1e) * sc + vEnd1 * post * Treal * sc; s2 = c0 + (kin.x2[n1] + c2e) * sc + vEnd2 * post * Treal * sc; c1 = c1e; c2 = c2e; }
			else { s1 = c0 + (dx1 - c1) * sc; s2 = c0 + (dx2 + c2) * sc; }
			if (!isFinite(o.m2)) drawWall(x, R.su.id, Math.max(c0, s2), gy, H);
			drawCar(x, s1, gy, carL * sc, c1 * sc, ob, "#d9534f", false, y * sc, res.y.length > 0);
			if (isFinite(o.m2)) drawCar(x, s2, gy, car2L * sc, c2 * sc, R.other, "#3f88d8", true, 0, false);
			if (t > A.Tin && t < A.Tin + A.Tc * 0.5) { x.fillStyle = "rgba(255,220,140," + (0.5 * (1 - (t - A.Tin) / (A.Tc * 0.5))) + ")"; x.beginPath(); x.arc(s1, gy - carL * sc * 0.12, 18 + 30 * (t - A.Tin) / A.Tc, 0, 7); x.fill(); }
		}
		$("cr-k2").textContent = pre > 0 ? "coming in at " + spd(o.v1, S.src === "fall" ? "ms" : S.cvu) : post > 0 ? "after the crash" : "t = " + time(tPhys) + " (slowed " + slowBy(tEnd, A.Tc) + "×)";
		if (S.tab === "crash") drawCh3(pre > 0 ? 0 : tPhys);
	}
	function carLen(ob) { return ob.m > 20000 ? 16 : ob.m > 5000 ? 12 : ob.m > 2400 ? 5.6 : ob.m > 1800 ? 4.9 : ob.m < 1200 ? 4 : 4.6; }
	function surfCol(id) { return { wall: "#8f8a80", pole: "#8f8a80", wood: "#a97a45", grass: "#3f7d35", sand: "#d7bf86", water: "#2f6fb0", mat: "#2e5bb8", foam: "#e7e5df", pillow: "#e8e1f2", cushion: "#e0b52f" }[id] || "#8f8a80"; }
	function drawWall(x, id, wx, gy, H) {
		if (id === "pole") { x.fillStyle = "#6b4b2a"; x.fillRect(wx, gy - H * 0.62, 26, H * 0.62); x.fillStyle = "#3f7d35"; x.beginPath(); x.arc(wx + 13, gy - H * 0.64, 46, 0, 7); x.fill(); return; }
		if (id === "cushion") { for (var i = 0; i < 5; i++) { x.fillStyle = i % 2 ? "#1f2530" : "#e0b52f"; x.fillRect(wx + i * 22, gy - 60, 22, 60); } x.fillStyle = "#8f8a80"; x.fillRect(wx + 110, gy - 120, 40, 120); return; }
		x.fillStyle = surfCol(id); x.fillRect(wx, gy - H * 0.55, H, H * 0.55); x.strokeStyle = "rgba(0,0,0,0.25)"; for (var r = 0; r < 8; r++) { x.beginPath(); x.moveTo(wx, gy - r * 22); x.lineTo(wx + H, gy - r * 22); x.stroke(); }
	}
	function drawCar(x, frontX, gy, Lpx, crushPx, ob, colr, flip, occY, occOn) {
		x.save(); x.translate(frontX, gy); if (flip) x.scale(-1, 1);
		var truck = ob.m > 5000, hh = Math.min(Lpx * (truck ? 0.3 : 0.3), Lpx > 0 ? 9e9 : 0), body = hh * 0.5, cz = 0, rear = -(Lpx - Math.max(0, crushPx)), wr = hh * 0.2; Lpx = Lpx - Math.max(0, crushPx); cz = 0; var zz0 = Math.max(0, crushPx);
		x.lineJoin = "round"; x.strokeStyle = "rgba(0,0,0,0.45)"; x.lineWidth = 1.5; x.fillStyle = colr;
		/* lower body with a crumpled (zigzag) nose */
		x.beginPath(); x.moveTo(rear, -wr * 0.6); x.lineTo(rear, -body - wr * 0.6); x.lineTo(-cz - Lpx * 0.04, -body - wr * 0.6);
		var nz = 7, zw = Math.min(zz0 * 0.35 + 2, Lpx * 0.06); for (var i = 0; i <= nz; i++) x.lineTo(-(i % 2 ? zw : 0) - cz * 0.0, -body - wr * 0.6 + (body) * i / nz);
		x.closePath(); x.fill(); x.stroke();
		/* cabin (or truck cab) */
		x.beginPath();
		if (truck) { x.rect(-Lpx * 0.28 - cz * 0.3, -hh - wr * 0.6, Lpx * 0.24, hh - body); }
		else { var c0 = rear + Lpx * 0.18, c1 = -Lpx * 0.36 - cz * 0.35; x.moveTo(c0, -body - wr * 0.6); x.lineTo(c0 + Lpx * 0.06, -hh - wr * 0.6); x.lineTo(c1 - Lpx * 0.06, -hh - wr * 0.6); x.lineTo(c1 + Lpx * 0.04, -body - wr * 0.6); }
		x.closePath(); x.fill(); x.stroke();
		/* windows */
		x.fillStyle = "rgba(190,225,255,0.8)";
		if (truck) x.fillRect(-Lpx * 0.14 - cz * 0.3, -hh - wr * 0.6 + 4, Lpx * 0.08, (hh - body) * 0.5);
		else { x.beginPath(); var w0 = rear + Lpx * 0.26, w1 = -Lpx * 0.38 - cz * 0.35, wt = -hh - wr * 0.6 + 4, wb = -body - wr * 0.6 - 3; x.moveTo(w0 - 2, wb); x.lineTo(w0 + 4, wt); x.lineTo(w1 - Lpx * 0.06, wt); x.lineTo(w1, wb); x.closePath(); x.fill(); }
		x.fillStyle = "#111"; x.strokeStyle = "#666"; [rear + Lpx * 0.18, -Math.max(Lpx * 0.2, cz + Lpx * 0.08)].forEach(function (wx) { x.beginPath(); x.arc(wx, -wr * 0.55, wr, 0, 7); x.fill(); x.stroke(); });
		if (occOn) { var hx = -Lpx * 0.5 + Math.min(occY, Lpx * 0.16); x.fillStyle = "#f3d1a6"; x.beginPath(); x.arc(hx, -hh * 0.82 - wr * 0.6, hh * 0.1, 0, 7); x.fill(); x.strokeStyle = "#f3d1a6"; x.lineWidth = 3; x.beginPath(); x.moveTo(hx - 2, -hh * 0.72 - wr * 0.6); x.lineTo(hx - 8, -body - wr * 0.6 + 4); x.stroke(); }
		x.restore();
	}
	function drawThing(x, id, cx, bottom, hpx, squash, broken) {
		var h = hpx * (1 - squash), w = hpx * (id === "personbent" || id === "personstiff" ? 0.3 : id === "phone" ? 0.5 : 0.8) * (1 + squash * 0.8);
		x.save(); x.translate(cx, bottom);
		if (id === "egg") { x.fillStyle = broken ? "#f3e9d2" : "#f7efe0"; x.beginPath(); x.ellipse(0, -h / 2, w / 2 * 0.8, h / 2, 0, 0, 7); x.fill(); if (broken) { x.fillStyle = "#f5b82e"; x.beginPath(); x.ellipse(0, -2, w * 0.9, 6, 0, 0, 7); x.fill(); x.strokeStyle = "#7a6a50"; x.beginPath(); x.moveTo(-w / 3, -h / 2); x.lineTo(-5, -h * 0.35); x.lineTo(4, -h * 0.6); x.lineTo(w / 3, -h * 0.4); x.stroke(); } }
		else if (id === "melon") { x.fillStyle = "#2f7d32"; x.beginPath(); x.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, 7); x.fill(); if (broken) { x.fillStyle = "#e5484d"; x.beginPath(); x.ellipse(0, -h * 0.35, w * 0.55, h * 0.3, 0, Math.PI, 0); x.fill(); } }
		else if (id === "bowling") { x.fillStyle = "#222b55"; x.beginPath(); x.arc(0, -h / 2, Math.min(w, h) / 2, 0, 7); x.fill(); }
		else if (id === "phone") { x.fillStyle = "#222"; x.fillRect(-w / 2, -h, w, h); x.fillStyle = "#4a7bd0"; x.fillRect(-w / 2 + 3, -h + 4, w - 6, h - 8); }
		else { /* person: knees bend with the squash */ var leg = h * 0.48, bend = squash * 1.6; x.strokeStyle = "#f3d1a6"; x.lineCap = "round"; x.lineWidth = Math.max(3, hpx * 0.06);
			x.beginPath(); x.moveTo(-6, 0); x.lineTo(-6 - leg * 0.5 * Math.sin(bend), -leg * 0.5 * Math.cos(bend)); x.lineTo(-6, -leg); x.moveTo(6, 0); x.lineTo(6 - leg * 0.5 * Math.sin(bend), -leg * 0.5 * Math.cos(bend)); x.lineTo(6, -leg); x.stroke();
			x.beginPath(); x.moveTo(0, -leg); x.lineTo(0, -h * 0.85); x.moveTo(0, -h * 0.78); x.lineTo(-hpx * 0.18, -h * 0.6); x.moveTo(0, -h * 0.78); x.lineTo(hpx * 0.18, -h * 0.6); x.stroke(); x.fillStyle = "#f3d1a6"; x.beginPath(); x.arc(0, -h * 0.92, hpx * 0.07, 0, 7); x.fill(); }
		x.restore();
	}
	/* crash inputs */
	$("cr-ob").addEventListener("change", function () { S.ob = this.value; S.om = ""; S.e = ""; var ob = C.obj(S.ob); if (!ob.veh && S.su === "vehicle") S.su = "wall"; if (!ob.veh && S.src === "speed" && S.cvu === "kmh" && num(S.cv) > 60) { S.src = "fall"; } syncCrashInputs(); runCrash(); });
	$("cr-om").addEventListener("input", function () { S.om = this.value; schedule2(); });
	root.querySelectorAll("#cr-vsrc button").forEach(function (b) { b.addEventListener("click", function () { S.src = b.dataset.v; syncCrashInputs(); runCrash(); }); });
	$("cr-cv").addEventListener("input", function () { S.cv = this.value; var vv = num(S.cv) * VU[S.cvu][0]; if (vv > 0) $("cr-cvs").value = logPos(vv, 0.3, 120); schedule2(); });
	$("cr-cvs").addEventListener("input", function () { var v = logVal(+this.value, 0.3, 120); S.cv = sig(v / VU[S.cvu][0], 3).replace(/,/g, ""); $("cr-cv").value = S.cv; schedule2(); });
	$("cr-cvu").addEventListener("change", function () { var f = VU[S.cvu][0] / VU[this.value][0]; S.cv = sig(num(S.cv) * f, 4).replace(/,/g, ""); S.v2 = sig(num(S.v2) * f, 4).replace(/,/g, ""); S.cvu = this.value; syncCrashInputs(); runCrash(); });
	$("cr-fh").addEventListener("input", function () { S.fh = this.value; schedule2(); });
	$("cr-fhu").addEventListener("change", function () { S.fh = sig(num(S.fh) * HU[S.fhu] / HU[this.value], 4).replace(/,/g, ""); S.fhu = this.value; syncCrashInputs(); runCrash(); });
	$("cr-su").addEventListener("change", function () { S.su = this.value; S.e = ""; syncCrashInputs(); runCrash(); });
	$("cr-o2").addEventListener("change", function () { S.o2 = this.value; S.e = ""; runCrash(); });
	$("cr-d2").addEventListener("change", function () { S.d2 = this.value; syncCrashInputs(); runCrash(); });
	$("cr-v2").addEventListener("input", function () { S.v2 = this.value; schedule2(); });
	$("cr-rs").addEventListener("change", function () { S.rs = this.value; runCrash(); });
	$("cr-e").addEventListener("input", function () { S.e = String(+this.value / 100); $("cr-e-v").textContent = (+this.value / 100).toFixed(2); schedule2(); });
	$("cr-ereset").addEventListener("click", function () { S.e = ""; runCrash(); });
	var noteBox2 = document.createElement("p"); noteBox2.className = "tu-note cr-pnote"; $("cr-pre2").after(noteBox2);
	chips($("cr-pre2"), PRE2, function (p) {
		S.ob = p.ob; S.om = ""; S.e = ""; S.src = p.src; if (p.cv != null) { S.cv = String(p.cv); S.cvu = p.cvu || "kmh"; } if (p.fh != null) { S.fh = String(p.fh); S.fhu = p.fhu || "m"; }
		S.su = p.su; if (p.o2) S.o2 = p.o2; if (p.d2) S.d2 = p.d2; if (p.v2 != null) S.v2 = String(p.v2); if (p.rs) S.rs = p.rs; noteBox2.textContent = p.note || ""; syncCrashInputs(); runCrash();
	});
	$("cr-fh-n").textContent = "";

	/* ---------------- buttons ---------------- */
	[1, 2].forEach(function (n) {
		$("cr-play" + n).addEventListener("click", function () { startAnim(n); });
		$("cr-slow" + n).addEventListener("click", function () { S.slow = !S.slow; [1, 2].forEach(function (m) { $("cr-slow" + m).setAttribute("aria-pressed", String(S.slow)); }); if (n === 2) runCrash(); startAnim(n); });
		$("cr-png" + n).addEventListener("click", function () { var a = document.createElement("a"); a.download = "mes-crash-physics.png"; a.href = $("cr-c" + n).toDataURL("image/png"); a.click(); });
		$("cr-full" + n).addEventListener("click", function () { var w = $("cr-st" + n).parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen(); });
	});
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	function linkFor(n) {
		var p = new URLSearchParams(); p.set("tab", n === 1 ? "hit" : "crash");
		(n === 1 ? ["pm", "sh", "d", "du", "L", "m", "rho", "v", "vu", "a", "tm", "h", "hu", "w"] : ["ob", "om", "src", "cv", "cvu", "fh", "fhu", "su", "o2", "d2", "v2", "rs", "e"]).forEach(function (k) { if (S[k] !== "" && S[k] != null) p.set(k, S[k]); });
		return location.origin + location.pathname + "?" + p.toString();
	}
	function copy(txt, btn) { var done = function () { var o = btn.textContent; btn.textContent = "✓ Link copied"; setTimeout(function () { btn.textContent = o; }, 1600); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { prompt("Copy this link:", txt); }); else prompt("Copy this link:", txt); }
	$("cr-link1").addEventListener("click", function () { copy(linkFor(1), this); });
	$("cr-link2").addEventListener("click", function () { copy(linkFor(2), this); });
	new MutationObserver(function () { onResize(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	/* ---------------- start ---------------- */
	syncHitInputs(); syncCrashInputs(); setTab(S.tab);
	window.addEventListener("resize", onResize); if (window.ResizeObserver) { new ResizeObserver(onResize).observe($("cr-st1").parentNode); new ResizeObserver(onResize).observe($("cr-st2").parentNode); }
	sizeStage(1); sizeStage(2); runCrash(); runHit(); if (S.tab === "crash") startAnim(2);
	window.MESCrashDebug = { S: S, run: function () { runHit(); runCrash(); }, R: function () { return { hit: R1, crash: R2 }; }, frame: function (t) { anim.freeze = t; frame(true); }, unfreeze: function () { anim.freeze = null; } };
})();
