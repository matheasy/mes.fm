/* MES Reynolds Number Calculator -- pure maths (browser + node: require('./tool_apps_src/reynolds-number-calculator/lib.js')).
 * Re = rho * v * L / mu = v * L / nu. Fluid properties at 20 C unless the fluid has a temperature model (water: Kell density + Vogel viscosity;
 * air: ideal gas + Sutherland). Regime thresholds and the extra results (friction factor, drag, shedding, boundary layer) are the standard textbook
 * correlations, labelled approximate on the page. */
(function (root) {
	"use strict";
	var FLUIDS = [
		{ id: "water", name: "Water (fresh)", temp: true },
		{ id: "air", name: "Air (sea-level pressure)", temp: true },
		{ id: "seawater", name: "Seawater", rho: 1025, mu: 1.08e-3 },
		{ id: "blood", name: "Blood (37 °C)", rho: 1060, mu: 3.5e-3 },
		{ id: "milk", name: "Milk", rho: 1030, mu: 2.0e-3 },
		{ id: "ethanol", name: "Ethanol", rho: 789, mu: 1.2e-3 },
		{ id: "gasoline", name: "Gasoline", rho: 740, mu: 0.6e-3 },
		{ id: "mercury", name: "Mercury", rho: 13534, mu: 1.526e-3 },
		{ id: "olive", name: "Olive oil", rho: 911, mu: 0.081 },
		{ id: "sae30", name: "Engine oil (SAE 30)", rho: 891, mu: 0.29 },
		{ id: "glycerin", name: "Glycerin", rho: 1261, mu: 1.41 },
		{ id: "honey", name: "Honey", rho: 1420, mu: 10 },
		{ id: "custom", name: "Custom (enter density and viscosity)" }
	];
	var FBY = {}; FLUIDS.forEach(function (f) { FBY[f.id] = f; });
	var SPEED = { "m/s": 1, "km/h": 1 / 3.6, "mph": 0.44704, "ft/s": 0.3048, "knots": 0.514444, "cm/s": 0.01, "mm/s": 0.001 };
	var LEN = { "m": 1, "cm": 0.01, "mm": 0.001, "µm": 1e-6, "km": 1000, "in": 0.0254, "ft": 0.3048, "yd": 0.9144 };
	var VISC = { "Pa·s": 1, "mPa·s (cP)": 1e-3, "poise": 0.1 };
	var DENS = { "kg/m³": 1, "g/cm³": 1000, "lb/ft³": 16.0185 };

	function waterRho(T) { return 1000 * (1 - (T - 3.9863) * (T - 3.9863) * (T + 288.9414) / (508929.2 * (T + 68.12963))); }   // Kell, T in C
	function waterMu(T) { return 2.414e-5 * Math.pow(10, 247.8 / (T + 273.15 - 140)); }                                         // Vogel
	function airMu(T) { var K = T + 273.15; return 1.458e-6 * Math.pow(K, 1.5) / (K + 110.4); }                                   // Sutherland
	function airRho(T, P) { return (P || 101325) / (287.058 * (T + 273.15)); }

	function props(id, T, custom) {
		var f = FBY[id] || FBY.water, rho, mu;
		if (id === "water") { rho = waterRho(T); mu = waterMu(T); }
		else if (id === "air") { rho = airRho(T); mu = airMu(T); }
		else if (id === "custom") { rho = custom.rho; mu = custom.mu; }
		else { rho = f.rho; mu = f.mu; }
		return { rho: rho, mu: mu, nu: mu / rho };
	}
	function reynolds(rho, v, L, mu) { return rho * v * L / mu; }

	/* regime tables: [upper Re bound, label, level 0 calm .. 3 turbulent, note] */
	var GEOM = [
		{ id: "pipe", name: "Pipe or duct (full, flowing inside)", lname: "Inside diameter", ldef: 0.05,
		  zones: [[2300, "Laminar", 0, "Smooth, orderly layers. Pressure drop grows linearly with speed."], [4000, "Transitional", 1, "Flips unpredictably between laminar and turbulent."], [1e12, "Turbulent", 3, "Chaotic eddies; much higher friction, but better mixing and heat transfer."]] },
		{ id: "plate", name: "Flat plate (flow along the surface)", lname: "Length along the flow",  ldef: 1,
		  zones: [[5e5, "Laminar boundary layer", 0, "A thin smooth layer clings to the surface."], [1e12, "Turbulent boundary layer", 3, "The layer has tripped to turbulence: thicker, more drag, harder to separate."]] },
		{ id: "sphere", name: "Sphere (ball, droplet, particle)", lname: "Diameter", ldef: 0.1,
		  zones: [[1, "Creeping (Stokes) flow", 0, "Viscosity dominates; no wake. Drag is proportional to speed."], [1000, "Steady wake, then vortex shedding", 1, "A wake forms behind the sphere and starts to shed vortices from about Re 200."], [2e5, "Subcritical", 2, "Laminar boundary layer, wide turbulent wake, drag coefficient near 0.44."], [1e12, "Supercritical (drag crisis)", 3, "The boundary layer turns turbulent, clings on longer and drag drops sharply: why golf balls have dimples."]] },
		{ id: "cylinder", name: "Circular cylinder (wire, pole, pier)", lname: "Diameter", ldef: 0.05,
		  zones: [[5, "Attached flow", 0, "Flow wraps smoothly all the way round."], [40, "Steady twin eddies", 0, "Two steady vortices sit behind the cylinder."], [200, "Laminar vortex street", 1, "Regular Kármán vortex shedding at a Strouhal number near 0.2."], [3e5, "Irregular wake", 2, "Vortex street with turbulence developing in the wake."], [3.5e6, "Drag crisis", 3, "The boundary layer transitions and drag falls steeply."], [1e12, "Supercritical", 3, "Turbulent boundary layer, narrow wake."]] },
		{ id: "airfoil", name: "Wing or airfoil (chord)", lname: "Chord length", ldef: 0.2,
		  zones: [[5e4, "Very low Re (insects, micro-drones)", 0, "Laminar separation is a problem; thin cambered wings work best."], [5e5, "Low Re (model aircraft, gliders)", 1, "Laminar separation bubbles can form and the wing may stall early."], [5e6, "Medium Re (light aircraft)", 2, "Boundary layer mostly turbulent; well-behaved lift."], [1e12, "High Re (airliners)", 3, "Fully turbulent boundary layer over most of the wing."]] },
		{ id: "channel", name: "Open channel or river (hydraulic radius)", lname: "Hydraulic radius", ldef: 0.5,
		  zones: [[500, "Laminar", 0, "Rare in rivers: only very thin sheets of water."], [2000, "Transitional", 1, "Between laminar and turbulent."], [1e12, "Turbulent", 3, "Almost every real river and canal."]] },
		{ id: "custom", name: "Something else (any length)", lname: "Characteristic length", ldef: 0.1,
		  zones: [[1, "Creeping flow", 0, "Viscous forces dominate."], [2000, "Laminar-ish", 1, "Orderly flow, usually steady or with simple wakes."], [1e5, "Transitional to turbulent", 2, "Unsteady flow with growing turbulence."], [1e12, "Strongly turbulent", 3, "Inertia dominates; chaotic eddies on many scales."]] }
	];
	var GBY = {}; GEOM.forEach(function (g) { GBY[g.id] = g; });
	function regime(gid, Re) {
		var z = GBY[gid].zones, i = 0; while (i < z.length - 1 && Re >= z[i][0]) i++;
		return { index: i, label: z[i][1], level: z[i][2], note: z[i][3] };
	}

	/* friction factor (Darcy). Laminar 64/Re; turbulent Swamee-Jain with relative roughness eps/D; in between a blend flagged unreliable */
	function darcy(Re, relRough) {
		if (Re < 2300) return 64 / Re;
		var f = 0.25 / Math.pow(Math.log10(relRough / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
		if (Re < 4000) { var fl = 64 / 2300, t = (Re - 2300) / 1700; return fl + (f - fl) * t; }
		return f;
	}
	function cylinderDrag(Re) {
		if (Re < 1) return 8 * Math.PI / (Re * (2.002 - Math.log(Re)));
		if (Re < 1000) return 1 + 10 * Math.pow(Re, -2 / 3);
		if (Re < 2e5) return 1.2;
		if (Re < 5e5) return 0.4;
		return 0.7;
	}
	function sphereDrag(Re) {
		if (Re < 1000) return 24 / Re * (1 + 0.15 * Math.pow(Re, 0.687));
		if (Re < 2e5) return 0.44;
		if (Re < 4e5) return 0.2;
		return 0.15;
	}
	function strouhal(Re) { return Re < 47 ? 0 : Re < 250 ? 0.2663 - 1.019 / Math.sqrt(Re) : Re < 2e5 ? 0.198 * (1 - 19.7 / Re) : 0.2; }

	/* extras for a geometry: array of [label, value, unit, note]; v in m/s, L in m, p = {rho, mu, nu}, opts: {rough (m)} */
	function extras(gid, Re, v, L, p, opts) {
		var out = [], q = 0.5 * p.rho * v * v;
		if (gid === "pipe") {
			var rough = (opts && opts.rough) || 0, f = darcy(Re, rough / L), A = Math.PI * L * L / 4;
			out.push(["Flow rate", v * A, "m³/s", "Q = v · π D² / 4"]);
			out.push(["Darcy friction factor", f, "", Re < 2300 ? "laminar: f = 64 / Re" : Re < 4000 ? "in the transition zone: only a rough guess" : "turbulent: Swamee–Jain"]);
			out.push(["Pressure drop per metre", f / L * q, "Pa/m", "Δp / length = f · ρ v² / (2 D)"]);
			out.push(["Head loss per metre", f / L * v * v / (2 * 9.80665), "m/m", "h = f · v² / (2 g D)"]);
			out.push(["Wall shear stress", f / 8 * p.rho * v * v, "Pa", "τ = f ρ v² / 8"]);
		} else if (gid === "plate") {
			var lam = Re < 5e5, delta = lam ? 5 * L / Math.sqrt(Re) : 0.37 * L * Math.pow(Re, -0.2), cf = lam ? 1.328 / Math.sqrt(Re) : 0.074 * Math.pow(Re, -0.2);
			out.push(["Boundary-layer thickness at the end", delta, "m", lam ? "laminar: 5 L / √Re" : "turbulent: 0.37 L / Re^0.2"]);
			out.push(["Average skin-friction coefficient", cf, "", lam ? "1.328 / √Re" : "0.074 / Re^0.2"]);
			out.push(["Friction drag per metre of width", cf * q * L, "N/m", "C_f · ½ρv² · L"]);
		} else if (gid === "sphere") {
			var cd = sphereDrag(Re), area = Math.PI * L * L / 4;
			out.push(["Drag coefficient", cd, "", Re < 1000 ? "Schiller–Naumann fit" : "approximate plateau value"]);
			out.push(["Drag force", cd * q * area, "N", "F = C_d · ½ρv² · π d² / 4"]);
			if (Re < 1) out.push(["Stokes drag", 3 * Math.PI * p.mu * L * v, "N", "F = 3π μ d v"]);
		} else if (gid === "cylinder") {
			var st = strouhal(Re), cd2 = cylinderDrag(Re);
			out.push(["Strouhal number", st, "", st ? "St = f d / v (about 0.2 once a vortex street forms)" : "no vortex shedding below Re ≈ 47"]);
			out.push(["Shedding frequency", st * v / L, "Hz", "f = St · v / d"]);
			out.push(["Drag coefficient", cd2, "", "approximate"]);
			out.push(["Drag per metre of length", cd2 * q * L, "N/m", "C_d · ½ρv² · d"]);
		} else if (gid === "channel") {
			out.push(["Equivalent pipe diameter", 4 * L, "m", "D = 4 R_h"]);
			out.push(["Froude number needs the depth", null, "", "Fr = v / √(g · depth)"]);
		}
		return out;
	}

	/* solve for the missing quantity: returns SI value */
	function solveSpeed(Re, L, p) { return Re * p.mu / (p.rho * L); }
	function solveLength(Re, v, p) { return Re * p.mu / (p.rho * v); }
	function solveViscosity(Re, rho, v, L) { return rho * v * L / Re; }

	var EXAMPLES = [
		["Bacterium swimming", 1e-5], ["Sperm cell", 1e-2], ["Fine dust settling in air", 1e-1], ["Small fish larva", 1e2],
		["Blood in the aorta", 4e3], ["Garden hose", 3e4], ["Person swimming", 1e6], ["Person walking in air", 2e5],
		["Cyclist", 1e6], ["Golf ball in flight", 1e5], ["Light aircraft wing", 2e6], ["Airliner wing", 3e7],
		["Large ship hull", 5e9], ["Blue whale", 3e8]
	];

	var API = { FLUIDS: FLUIDS, SPEED: SPEED, LEN: LEN, VISC: VISC, DENS: DENS, GEOM: GEOM, GBY: GBY, EXAMPLES: EXAMPLES, props: props, reynolds: reynolds, regime: regime, darcy: darcy, extras: extras, strouhal: strouhal, sphereDrag: sphereDrag, cylinderDrag: cylinderDrag, solveSpeed: solveSpeed, solveLength: solveLength, solveViscosity: solveViscosity };
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESRe = API;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Reynolds Number Calculator -- UI (maths in lib.js, global MESRe). State: localStorage "mes-reynolds-number-calculator:v1"; links ?f=&t=&g=&v=&vu=&l=&lu=&s=&target=&mat= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("re"); if (!root) return;
	var R = window.MESRe, KEY = "mes-reynolds-number-calculator:v1";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function num(s) { s = String(s).trim().replace(/\s/g, ""); if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); else s = s.replace(",", "."); var x = Number(s); return isFinite(x) && s !== "" ? x : NaN; }
	function fmt(x, sig) {
		if (x === 0) return "0"; if (!isFinite(x)) return "–"; var a = Math.abs(x); sig = sig || 4;
		if (a >= 1e6 || a < 1e-3) { var e = x.toExponential(sig - 1).split("e"); return e[0] + " × 10" + sup(+e[1]); }
		return Number(x.toPrecision(sig)).toLocaleString(undefined, { maximumFractionDigits: 8 });
	}
	function sup(n) { var m = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }; return String(n).split("").map(function (c) { return m[c] || c; }).join(""); }
	function opts(sel, items, cur) { sel.innerHTML = items.map(function (k) { return '<option value="' + esc(k) + '"' + (k === cur ? " selected" : "") + ">" + esc(k) + "</option>"; }).join(""); }

	var q = new URLSearchParams(location.search), saved = sget(), fromLink = !!q.get("g") || !!q.get("f");
	function pick(k, sk, ok, d) { var v = fromLink ? q.get(k) : null; if (v == null && !fromLink) v = saved[sk || k]; return v != null && ok(v) ? v : d; }
	var S = {
		f: pick("f", "f", function (v) { return !!R.FLUIDS.filter(function (x) { return x.id === v; })[0]; }, "water"),
		t: pick("t", "t", function (v) { return isFinite(+v); }, "20"), g: pick("g", "g", function (v) { return !!R.GBY[v]; }, "pipe"),
		v: pick("v", "v", function (v) { return isFinite(num(v)); }, "1"), vu: pick("vu", "vu", function (v) { return R.SPEED[v]; }, "m/s"),
		l: pick("l", "l", function (v) { return isFinite(num(v)); }, "5"), lu: pick("lu", "lu", function (v) { return R.LEN[v]; }, "cm"),
		s: pick("s", "s", function (v) { return /^(re|v|l)$/.test(v); }, "re"), target: pick("target", "target", function (v) { return isFinite(num(v)); }, "2300"),
		mat: pick("mat", "mat", function (v) { return isFinite(+v); }, "0"), rho: saved.rho || "1000", mu: saved.mu || "1", rhou: saved.rhou || "kg/m³", muu: saved.muu || "Pa·s"
	};
	var MATS = [["Smooth (drawn tubing, plastic, PVC)", 0.0015e-3], ["Commercial steel", 0.045e-3], ["Galvanized iron", 0.15e-3], ["Cast iron", 0.26e-3], ["Concrete", 1e-3], ["Riveted steel", 3e-3]];

	$("re-fluid").innerHTML = R.FLUIDS.map(function (f) { return '<option value="' + f.id + '">' + esc(f.name) + "</option>"; }).join("");
	$("re-geom").innerHTML = R.GEOM.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + "</option>"; }).join("");
	opts($("re-v-u"), Object.keys(R.SPEED), S.vu); opts($("re-l-u"), Object.keys(R.LEN), S.lu); opts($("re-rho-u"), Object.keys(R.DENS), S.rhou); opts($("re-mu-u"), Object.keys(R.VISC), S.muu);
	$("re-rough").innerHTML = MATS.map(function (m, i) { return '<option value="' + i + '">' + esc(m[0]) + "</option>"; }).join("");
	$("re-examples").querySelector("tbody").innerHTML = R.EXAMPLES.map(function (e) { return "<tr><td>" + esc(e[0]) + "</td><td>" + fmt(e[1], 2) + "</td></tr>"; }).join("");

	function read() { S.f = $("re-fluid").value; S.t = $("re-temp").value; S.g = $("re-geom").value; S.v = $("re-v").value; S.vu = $("re-v-u").value; S.l = $("re-l").value; S.lu = $("re-l-u").value; S.target = $("re-target").value; S.mat = $("re-rough").value; S.rho = $("re-rho").value; S.mu = $("re-mu").value; S.rhou = $("re-rho-u").value; S.muu = $("re-mu-u").value; }
	function write() { $("re-fluid").value = S.f; $("re-temp").value = S.t; $("re-geom").value = S.g; $("re-v").value = S.v; $("re-v-u").value = S.vu; $("re-l").value = S.l; $("re-l-u").value = S.lu; $("re-target").value = S.target; $("re-rough").value = S.mat; $("re-rho").value = S.rho; $("re-mu").value = S.mu; $("re-rho-u").value = S.rhou; $("re-mu-u").value = S.muu; }

	function scale(gid, Re) {
		var g = R.GBY[gid], lo = -5, hi = 10, W = 760, H = 96, padL = 14, padR = 14, X = function (lg) { return padL + (lg - lo) / (hi - lo) * (W - padL - padR); }, svg = "", prev = lo;
		g.zones.forEach(function (z, i) {
			var top = Math.min(hi, Math.log10(z[0])); if (top <= prev) return;
			var x0 = X(prev), x1 = X(top), w = x1 - x0;
			svg += '<rect class="re-zone-' + z[2] + '" x="' + x0.toFixed(1) + '" y="26" width="' + w.toFixed(1) + '" height="34"><title>' + esc(z[1]) + "</title></rect>";
			var label = z[1].replace(/ \(.*\)/, ""), maxc = Math.floor(w / 6.2); if (maxc >= 6) svg += '<text class="re-zl" x="' + (x0 + w / 2).toFixed(1) + '" y="47" text-anchor="middle">' + esc(label.length > maxc ? label.slice(0, maxc - 1) + "…" : label) + "</text>";
			prev = top;
		});
		svg += '<line class="re-ax" x1="' + X(lo) + '" x2="' + X(hi) + '" y1="60" y2="60"/>';
		for (var e = lo; e <= hi; e += 1) svg += '<line class="re-ax" x1="' + X(e) + '" x2="' + X(e) + '" y1="60" y2="65"/>' + (e % 1 === 0 && (e + 5) % 1 === 0 ? '<text class="re-ax-t" x="' + X(e) + '" y="78">10' + sup(e) + "</text>" : "");
		var lg = Math.max(lo, Math.min(hi, Math.log10(Math.max(1e-30, Re)))), mx = X(lg);
		svg += '<line class="re-mark" x1="' + mx + '" x2="' + mx + '" y1="14" y2="60"/><text class="re-mark-t" x="' + Math.max(40, Math.min(W - 40, mx)) + '" y="10" text-anchor="middle">Re = ' + esc(fmt(Re, 3)) + "</text>";
		$("re-scale").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' + svg + "</svg>";
	}

	function calc() {
		read(); var tC = num(S.t), g = R.GBY[S.g], custom = S.f === "custom";
		$("re-temp-f").hidden = !(S.f === "water" || S.f === "air"); $("re-custom").hidden = !custom; $("re-rough-f").hidden = S.g !== "pipe";
		$("re-v-f").hidden = S.s === "v"; $("re-l-f").hidden = S.s === "l"; $("re-target-f").hidden = S.s === "re";
		$("re-l-l").textContent = g.lname; [].forEach.call($("re-solve").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === S.s)); });
		var cust = custom ? { rho: num(S.rho) * R.DENS[S.rhou], mu: num(S.mu) * R.VISC[S.muu] } : null;
		if (!isFinite(tC)) tC = 20; if (tC < 0 && S.f === "water") tC = 0; if (tC > 100 && S.f === "water") tC = 100;
		var p = R.props(S.f, tC, cust), ok = isFinite(p.rho) && p.rho > 0 && isFinite(p.mu) && p.mu > 0;
		$("re-nu").textContent = ok ? fmt(p.nu, 4) + " m²/s" : "–"; $("re-nu-s").textContent = ok ? "ρ = " + fmt(p.rho, 4) + " kg/m³ · μ = " + fmt(p.mu, 4) + " Pa·s" : "enter a density and viscosity above zero";
		var v = num(S.v) * R.SPEED[S.vu], L = num(S.l) * R.LEN[S.lu], target = num(S.target), Re = NaN, shownV = v, shownL = L;
		if (!ok) { $("re-main").textContent = "–"; return; }
		if (S.s === "re") Re = R.reynolds(p.rho, v, L, p.mu);
		else if (S.s === "v") { Re = target; shownV = R.solveSpeed(target, L, p); v = shownV; }
		else { Re = target; shownL = R.solveLength(target, v, p); L = shownL; }
		if (!isFinite(Re) || Re <= 0 || !isFinite(v) || !isFinite(L) || v <= 0 || L <= 0) { $("re-main").textContent = "–"; $("re-main-s").textContent = "Enter positive numbers for every box."; $("re-regime").textContent = "–"; $("re-regime-s").textContent = ""; $("re-scale").innerHTML = ""; $("re-extra-card").hidden = true; return; }
		if (S.s === "re") { $("re-main-l").textContent = "Reynolds number"; $("re-main").textContent = fmt(Re, 4); $("re-main-s").textContent = "Re = ρ v L / μ = " + fmt(v, 3) + " m/s × " + fmt(L, 3) + " m ÷ " + fmt(p.nu, 3) + " m²/s"; }
		else if (S.s === "v") { $("re-main-l").textContent = "Speed for Re = " + fmt(Re, 4); $("re-main").textContent = fmt(shownV / R.SPEED[S.vu], 4) + " " + S.vu; $("re-main-s").textContent = "= " + fmt(shownV, 4) + " m/s = " + fmt(shownV * 3.6, 4) + " km/h = " + fmt(shownV / 0.44704, 4) + " mph"; }
		else { $("re-main-l").textContent = g.lname + " for Re = " + fmt(Re, 4); $("re-main").textContent = fmt(shownL / R.LEN[S.lu], 4) + " " + S.lu; $("re-main-s").textContent = "= " + fmt(shownL, 4) + " m = " + fmt(shownL * 100, 4) + " cm = " + fmt(shownL / 0.0254, 4) + " in"; }
		var rg = R.regime(S.g, Re); $("re-regime").textContent = rg.label; $("re-regime-s").textContent = rg.note;
		scale(S.g, Re);
		var ex = R.extras(S.g, Re, v, L, p, { rough: MATS[+S.mat] ? MATS[+S.mat][1] : 0 }).filter(function (r) { return r[1] != null; });
		$("re-extra-card").hidden = !ex.length;
		$("re-extra").querySelector("tbody").innerHTML = ex.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td><b>" + fmt(r[1], 4) + "</b> " + esc(r[2]) + "</td><td>" + esc(r[3]) + "</td></tr>"; }).join("");
		var pre = S.g === "plate" || S.g === "airfoil" ? "plate" : S.g === "pipe" || S.g === "channel" ? "cavity" : "cylinder", c = Math.max(10, Math.min(5000, Re));
		$("re-sim").href = "/fluid-simulator?p=" + pre + "&re=" + Math.round(c);
		$("re-sim-s").textContent = Re > 5000 ? "The simulator goes up to Re 5,000 (your flow is " + fmt(Re, 3) + "); it opens at the top of its range." : Re < 10 ? "The simulator starts at Re 10 (your flow is " + fmt(Re, 3) + "); it opens at the bottom of its range." : "Opens a scenario at Re " + Math.round(c) + ".";
		sset({ f: S.f, t: S.t, g: S.g, v: S.v, vu: S.vu, l: S.l, lu: S.lu, s: S.s, target: S.target, mat: S.mat, rho: S.rho, mu: S.mu, rhou: S.rhou, muu: S.muu });
	}
	write(); calc();
	root.addEventListener("input", calc); root.addEventListener("change", calc);
	$("re-solve").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.s = b.dataset.s; calc(); });
	$("re-link").onclick = function () {
		read(); var o = new URLSearchParams({ f: S.f, t: S.t, g: S.g, v: S.v, vu: S.vu, l: S.l, lu: S.lu, s: S.s, target: S.target, mat: S.mat }), url = location.origin + location.pathname + "?" + o.toString();
		function done() { var t = $("re-toast"); if (!t) { t = document.createElement("div"); t.id = "re-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = "Link copied"; t.classList.add("tu-toast--show"); setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};
	if (fromLink) history.replaceState(null, "", location.pathname);
})();
