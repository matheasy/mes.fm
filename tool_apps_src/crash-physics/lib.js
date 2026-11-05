/* MES Crash Physics -- pure maths (global MESCrash; also require()-able in node). SI units throughout (m, kg, s, Pa, J).
   Two models:
   1. impact(o): an object hits a plate or block. Poncelet penetration (resisting stress R + B rho v^2) for an intact projectile,
      a flattening (mushrooming) projectile, or an eroding / hypervelocity one (Newton depth + hypervelocity crater scaling); for a plate,
      the projectile may push in to depth x and then shear out the rest as a plug (failure at the first x where its energy is enough);
      thin brittle plates break by bending (energy stored in the plate at the breaking load), thin ductile plates dent (plastic + membrane).
      Engineering approximations: good to roughly a factor of two, said on the page.
   2. crash(o): two bodies (or a body and a wall / surface) meet through springs in series with a loading / unloading hysteresis
      that gives the chosen coefficient of restitution; an optional car occupant is held by a belt / airbag / nothing. */
(function (root) {
	"use strict";
	var G = 9.80665, TNT = 4.184e6;
	/* kind: metal (ductile), polymer (ductile plastic), brittle, wood, elastic (rubber), soft (soil, sand, water, foam)
	   rho kg/m^3, E GPa, sy yield / compressive strength MPa, st tensile (ultimate) strength MPa, c J/(kg K), R penetration resistance MPa (else from cavity expansion),
	   tau shear strength for a plug MPa (else 0.6 st for ductile, 2 st for brittle cones), Tm melting point K, Lf heat of fusion kJ/kg, col drawing colour */
	var MATS = [
		{ id: "steel", name: "Mild steel", g: "Metals", kind: "metal", rho: 7850, E: 200, sy: 250, st: 400, c: 490, Tm: 1780, Lf: 247, col: "#8a93a0" },
		{ id: "hsteel", name: "Hardened steel", g: "Metals", kind: "metal", rho: 7850, E: 210, sy: 1200, st: 1500, c: 470, Tm: 1780, Lf: 247, col: "#5f6a78" },
		{ id: "stainless", name: "Stainless steel", g: "Metals", kind: "metal", rho: 8000, E: 193, sy: 290, st: 580, c: 500, Tm: 1700, Lf: 260, col: "#a7b0bb" },
		{ id: "al", name: "Aluminium (6061-T6)", g: "Metals", kind: "metal", rho: 2700, E: 69, sy: 275, st: 310, c: 900, Tm: 933, Lf: 397, col: "#c3cbd4" },
		{ id: "ti", name: "Titanium alloy", g: "Metals", kind: "metal", rho: 4430, E: 114, sy: 880, st: 950, c: 526, Tm: 1941, Lf: 365, col: "#9b9a8f" },
		{ id: "cu", name: "Copper", g: "Metals", kind: "metal", rho: 8960, E: 117, sy: 70, st: 220, c: 385, Tm: 1358, Lf: 205, col: "#c67a45" },
		{ id: "pb", name: "Lead", g: "Metals", kind: "metal", rho: 11340, E: 16, sy: 12, st: 17, c: 129, Tm: 600, Lf: 23, col: "#6f7380" },
		{ id: "w", name: "Tungsten alloy", g: "Metals", kind: "metal", rho: 17600, E: 360, sy: 1000, st: 1100, c: 134, Tm: 3695, Lf: 285, col: "#4c5361" },
		{ id: "concrete", name: "Concrete (35 MPa)", g: "Stone & glass", kind: "brittle", rho: 2400, E: 30, sy: 35, st: 3.5, c: 880, R: 400, col: "#a9a59b" },
		{ id: "brick", name: "Brick", g: "Stone & glass", kind: "brittle", rho: 1900, E: 15, sy: 20, st: 2, c: 840, R: 250, col: "#b4553a" },
		{ id: "granite", name: "Granite / rock", g: "Stone & glass", kind: "brittle", rho: 2700, E: 50, sy: 200, st: 10, c: 790, R: 900, col: "#8d8478" },
		{ id: "glass", name: "Window glass", g: "Stone & glass", kind: "brittle", rho: 2500, E: 70, sy: 1000, st: 45, c: 840, R: 2500, Tm: 1700, Lf: 0, col: "#9fd3e0" },
		{ id: "ceramic", name: "Ceramic (alumina)", g: "Stone & glass", kind: "brittle", rho: 3900, E: 370, sy: 2500, st: 300, c: 880, R: 5000, col: "#e8e2d4" },
		{ id: "ice", name: "Ice", g: "Stone & glass", kind: "brittle", rho: 917, E: 9, sy: 8, st: 1.5, c: 2100, R: 40, Tm: 273, Lf: 334, col: "#d6eef7" },
		{ id: "pine", name: "Pine wood", g: "Wood & plastics", kind: "wood", rho: 500, E: 10, sy: 30, st: 60, c: 1700, R: 60, tau: 8, col: "#d9b77a" },
		{ id: "oak", name: "Oak wood", g: "Wood & plastics", kind: "wood", rho: 750, E: 12, sy: 50, st: 90, c: 1700, R: 100, tau: 12, col: "#a97a45" },
		{ id: "plywood", name: "Plywood", g: "Wood & plastics", kind: "wood", rho: 600, E: 9, sy: 35, st: 40, c: 1600, R: 70, tau: 8, col: "#c9a46a" },
		{ id: "drywall", name: "Drywall (gypsum)", g: "Wood & plastics", kind: "brittle", rho: 700, E: 2, sy: 3, st: 1, c: 1090, R: 8, col: "#efece4" },
		{ id: "pc", name: "Polycarbonate", g: "Wood & plastics", kind: "polymer", rho: 1200, E: 2.4, sy: 62, st: 65, c: 1200, col: "#bfe3f0" },
		{ id: "acrylic", name: "Acrylic (Plexiglas)", g: "Wood & plastics", kind: "brittle", rho: 1180, E: 3.2, sy: 100, st: 70, c: 1470, R: 200, col: "#cde9f3" },
		{ id: "hdpe", name: "HDPE plastic", g: "Wood & plastics", kind: "polymer", rho: 950, E: 1, sy: 25, st: 30, c: 1900, col: "#e9eef2" },
		{ id: "rubber", name: "Rubber", g: "Wood & plastics", kind: "elastic", rho: 1150, E: 0.01, sy: 15, st: 15, c: 2000, R: 20, col: "#2f3238" },
		{ id: "soil", name: "Soil (clay)", g: "Ground, water & foam", kind: "soft", rho: 1800, E: 0.05, sy: 0.5, st: 0.05, c: 1000, R: 2, col: "#8a6a45" },
		{ id: "sand", name: "Dry sand", g: "Ground, water & foam", kind: "soft", rho: 1600, E: 0.05, sy: 0.5, st: 0, c: 830, R: 3, col: "#dcc48f" },
		{ id: "water", name: "Water", g: "Ground, water & foam", kind: "soft", rho: 1000, E: 2.2, sy: 0, st: 0, c: 4186, R: 0.05, col: "#4f9ed8" },
		{ id: "foam", name: "Foam (polystyrene)", g: "Ground, water & foam", kind: "soft", rho: 30, E: 0.005, sy: 0.15, st: 0.2, c: 1300, R: 0.15, col: "#f4f4f0" }
	];
	var BY = {}; MATS.forEach(function (m) { BY[m.id] = m; });
	function mat(id) { return BY[id] || BY.steel; }
	/* nose shapes: B = Poncelet inertia coefficient of the nose; flat ends punch out a plug, sharp ones push the plate aside (petals). */
	var SHAPES = [
		{ id: "sphere", name: "Ball", B: 0.5, plug: true },
		{ id: "flat", name: "Cylinder, flat end", B: 1.0, plug: true },
		{ id: "round", name: "Cylinder, round nose", B: 0.5, plug: true },
		{ id: "cone", name: "Cylinder, pointed nose", B: 0.3, plug: false }
	];
	function shape(id) { for (var i = 0; i < SHAPES.length; i++) if (SHAPES[i].id === id) return SHAPES[i]; return SHAPES[0]; }
	function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
	/* penetration resistance: given, or spherical cavity expansion in an elastic-perfectly plastic solid */
	function R(m) { if (m.R != null) return m.R * 1e6; var sy = m.sy * 1e6, E = m.E * 1e9; return (2 / 3) * sy * (1 + Math.log(Math.max(1.0001, E / (3 * sy)))); }
	function tauOf(m) { if (m.tau != null) return m.tau * 1e6; if (m.kind === "soft") return 0; if (m.kind === "brittle") return 2 * m.st * 1e6; return 0.6 * m.st * 1e6; }
	function volume(sh, d, L) { return sh === "sphere" ? Math.PI * d * d * d / 6 : Math.PI * d * d / 4 * L; }
	function massOf(o) { var pm = mat(o.pm); return o.m > 0 ? o.m : volume(o.shape, o.d, o.L) * (o.rho > 0 ? o.rho : pm.rho); }
	function lenEff(o) { return o.shape === "sphere" ? (2 / 3) * o.d : o.L; }

	/* Hertz contact of a ball (radius d/2) on a flat: peak force and peak pressure, used while the speed is too low to push a cavity open */
	function hertz(o) {
		var pm = mat(o.pm), tm = mat(o.tm), Es = 1 / ((1 - 0.09) / (pm.E * 1e9) + (1 - 0.09) / (tm.E * 1e9)), Rs = o.d / 2, m = massOf(o);
		var dl = Math.pow(15 * m * o.v * o.v / (16 * Es * Math.sqrt(Rs)), 0.4), F = 4 / 3 * Es * Math.sqrt(Rs) * Math.pow(dl, 1.5), a = Math.sqrt(Rs * dl);
		return { F: F, p0: a > 0 ? 3 * F / (2 * Math.PI * a * a) : 0, t: 2.94 * dl / Math.max(o.v, 1e-9) };
	}
	/* regime: what happens to the projectile at first contact */
	function regime(o) {
		var pm = mat(o.pm), tm = mat(o.tm), sh = shape(o.shape), Rt = R(tm), Rp = R(pm), rp = o.rho > 0 ? o.rho : pm.rho;
		var s0 = Rt + sh.B * tm.rho * o.v * o.v; var hyd = 0.5 * rp * o.v * o.v; if (tm.kind !== "soft") s0 = Math.min(s0, hertz(o).p0);
		if (s0 <= Rp * 1.2) return { id: "rigid", s0: s0, Rt: Rt, Rp: Rp };
		if (pm.kind === "elastic") return { id: "bounce", s0: s0, Rt: Rt, Rp: Rp };
		if (hyd > Rt) return { id: "erode", s0: s0, Rt: Rt, Rp: Rp };
		if (pm.kind === "metal" || pm.kind === "polymer" || pm.kind === "wood") return { id: "mushroom", s0: s0, Rt: Rt, Rp: Rp };
		return { id: "shatter", s0: s0, Rt: Rt, Rp: Rp };
	}
	/* Poncelet: v(x)^2 = (v0^2 + R/K) exp(-2 K A x / m) - R/K;  depth P = m/(2KA) ln(1 + K v0^2 / R) */
	function poncelet(m, A, K, Rt, v0) {
		Rt = Math.max(Rt, 5e4);
		return { P: m / (2 * K * A) * Math.log(1 + K * v0 * v0 / Rt), v2: function (x) { return (v0 * v0 + Rt / K) * Math.exp(-2 * K * A * x / m) - Rt / K; } };
	}
	/* depth into a thick block (semi-infinite) */
	function depth(o, rg) {
		var pm = mat(o.pm), tm = mat(o.tm), sh = shape(o.shape), m = massOf(o), A = Math.PI * o.d * o.d / 4, rp = o.rho > 0 ? o.rho : pm.rho;
		rg = rg || regime(o);
		if (rg.id === "rigid") return { P: poncelet(m, A, sh.B * tm.rho, rg.Rt, o.v).P, dEff: o.d, A: A, B: sh.B };
		if (rg.id === "mushroom") { var f = clamp(Math.sqrt(rg.s0 / rg.Rp), 1, 3); return { P: poncelet(m, A * f, tm.rho, rg.Rt, o.v).P, dEff: o.d * Math.sqrt(f), A: A * f, B: 1, f: f }; }
		if (rg.id === "erode") {
			var ratio = Math.sqrt(rp / tm.rho), hyd = 0.5 * rp * o.v * o.v;
			var Pn = lenEff(o) * ratio * Math.max(0, 1 - rg.Rt / hyd);
			var Yt = (tm.kind === "metal" || tm.kind === "polymer") ? tm.sy * 1e6 : rg.Rt / 3;
			var Pc = 0.3 * o.d * ratio * Math.cbrt(tm.rho * o.v * o.v / Math.max(Yt, 1e4));
			var P = Math.max(Pn, Pc), hyper = o.v > 2500;
			return { P: P, dEff: hyper ? Math.max(o.d, 2 * P) : 1.4 * o.d, A: A, B: 1, crater: hyper };
		}
		return { P: 0, dEff: o.d * (rg.id === "shatter" ? 2 : 1), A: A, B: 1 };
	}
	/* through a plate of thickness h (along the line of flight): returns {perf, x (depth where it broke through), vr, plug} */
	function plate(o, rg, dp) {
		var tm = mat(o.tm), sh = shape(o.shape), m = massOf(o), hEff = o.h / Math.cos((o.ang || 0) * Math.PI / 180);
		if (rg.id === "rigid" || rg.id === "mushroom") {
			var K = (rg.id === "rigid" ? sh.B : 1) * tm.rho, pc = poncelet(m, dp.A, K, rg.Rt, o.v), tau = tauOf(tm), dE = dp.dEff;
			var plugs = sh.plug || rg.id === "mushroom";
			/* shear plug (x2 for the strain rate) plus dishing the plate first (collapse load x a dish of d/4) */
			function eplug(t) { return tau > 0 ? tau * Math.PI * dE * t * t / 2 * 2 * (plugs ? 1 : 1.6) + (tm.kind === "metal" || tm.kind === "polymer" ? 1.57 * tm.sy * 1e6 * t * t * dE / 4 : 0) : Infinity; }
			var xmax = Math.min(pc.P, hEff), N = 400;
			for (var i = 0; i <= N; i++) {
				var x = xmax * i / N, ke = 0.5 * m * Math.max(0, pc.v2(x)), rem = hEff - x, ep = rem > 1e-12 ? eplug(rem) : 0;
				if (ke >= ep && (rem <= 1e-12 || isFinite(ep))) {
					var mp = plugs ? tm.rho * dp.A * rem : 0, vr = Math.sqrt(2 * (ke - ep) / m) * m / (m + mp);
					return { perf: true, x: x, vr: vr, plug: mp, rem: rem };
				}
			}
			if (pc.P >= hEff) { return { perf: true, x: hEff, vr: Math.sqrt(Math.max(0, pc.v2(hEff))), plug: 0, rem: 0 }; }
			return { perf: false, x: pc.P };
		}
		if (rg.id === "erode") {
			var k = dp.crater ? 1.8 : 1.3;
			if (dp.P * k >= hEff) return { perf: true, x: Math.min(dp.P, hEff), vr: NaN, plug: 0, rem: 0, debris: dp.crater };
			return { perf: false, x: dp.P };
		}
		return { perf: false, x: 0 };
	}
	function perforates(o) { var rg = regime(o), dp = depth(o, rg); return plate(o, rg, dp).perf || brittleBreak(o, rg, dp).through; }
	/* thin brittle plate: energy it can store in bending before the centre load P = st h^2 / 1.5 breaks it (circular plate, span = diameter) */
	function bendFail(tm, h, span, d) {
		var E = tm.E * 1e9, nu = 0.25, D = E * h * h * h / (12 * (1 - nu * nu)), a = Math.max(span / 2, 2 * h), kp = 16 * Math.PI * D / (a * a), r0 = Math.max(h, (d || 0) / 4);
		/* point load on a circular plate: peak bending stress 3P(1+nu) ln(a/r0) / (2 pi h^2) reaches the tensile strength */
		var Pf = 2 * Math.PI * h * h * tm.st * 1e6 / (3 * (1 + nu) * Math.max(0.5, Math.log(a / r0)));
		return { U: Pf * Pf / (2 * kp), P: Pf, k: kp };
	}
	function shareToPlate(rg) { return rg.id === "shatter" ? 0.5 : rg.id === "bounce" ? 0.6 : 0.7; }
	function brittleBreak(o, rg, dp) {
		var tm = mat(o.tm); if (tm.kind !== "brittle" || !(o.span > 0)) return { through: false };
		var m = massOf(o), ke = 0.5 * m * o.v * o.v, bf = bendFail(tm, o.h, o.span, o.d), W = ke * shareToPlate(rg);
		if (o.h > o.span / 8 || (dp && dp.P > 0.5 * o.h)) return { through: false, U: bf.U, W: W, cracks: false };
		var cr = W > bf.U, thr = W > 3 * bf.U;
		return { through: thr, cracks: cr, U: bf.U, W: W, vr: thr ? Math.sqrt(Math.max(0, o.v * o.v - 2 * 2 * bf.U / m)) : 0 };
	}
	/* thin ductile plate: plastic collapse load P0 = 2 pi M0 (M0 = sy h^2 / 4) with membrane stiffening, work = P0 (d + d^3 / (3 h^2)) */
	function dent(tm, h, span, W) {
		var P0 = 1.57 * tm.sy * 1e6 * h * h, D = tm.E * 1e9 * h * h * h / (12 * 0.91), kp = 16 * Math.PI * D / Math.pow(span / 2, 2);
		W -= Math.min(P0 * P0 / (2 * kp), P0 * h / 2); /* the part it can take springily comes back out (at most a deflection of one thickness before stretching takes over) */
		if (!(W > 0)) return 0; var target = W / P0, d = Math.cbrt(target * 3 * h * h);
		if (d < h) d = target;
		for (var i = 0; i < 40; i++) { var f = d + d * d * d / (3 * h * h) - target, fp = 1 + d * d / (h * h); d = Math.max(0, d - f / fp); }
		return Math.min(d, span / 4);
	}
	function bisect(fn, lo, hi, n) { for (var i = 0; i < (n || 50); i++) { var mid = (lo + hi) / 2; if (fn(mid)) hi = mid; else lo = mid; } return hi; }
	/* ballistic limit: slowest speed that goes through (true monotone in practice; bisection) */
	function ballisticLimit(o) {
		var t = Object.assign({}, o); function go(v) { t.v = v; return perforates(t); }
		var v0 = Math.max(o.v, 1);
		if (go(v0)) return bisect(go, 0, v0, 40);
		for (var v = v0 * 2; v <= 40000; v *= 2) if (go(v)) return bisect(go, v / 2, v, 40);
		return Infinity;
	}
	/* thickness needed to stop it */
	function stopThickness(o) { var t = Object.assign({}, o); t.ang = o.ang || 0; function stops(h) { t.h = h; return !perforates(t); } if (!stops(200)) return Infinity; return bisect(stops, 0, 200, 54); }

	function impact(o) {
		o = Object.assign({ shape: "sphere", d: 0.01, L: 0.02, v: 100, ang: 0, h: 0.005, span: 0.6 }, o);
		var pm = mat(o.pm), tm = mat(o.tm), sh = shape(o.shape), m = massOf(o), rg = regime(o), dp = depth(o, rg), ke = 0.5 * m * o.v * o.v;
		var hEff = o.h / Math.cos(o.ang * Math.PI / 180), pl = plate(o, rg, dp), bb = brittleBreak(o, rg, dp), rp = o.rho > 0 ? o.rho : pm.rho;
		var ric = !pl.perf && !bb.through && (o.ang >= 75 || (o.ang >= 60 && dp.P * Math.cos(o.ang * Math.PI / 180) < o.d / 2));
		if (o.ang >= 80 && !(rg.id === "erode")) { ric = true; }
		var hz = hertz(o), r = { o: o, m: m, ke: ke, p: m * o.v, tnt: ke / TNT, reg: rg.id, s0: rg.s0, Rt: rg.Rt, Rp: rg.Rp, P: dp.P, dEff: dp.dEff, hEff: hEff, crater: !!dp.crater, f: dp.f || 1 };
		if (ric && o.ang >= 80) { r.out = "ricochet"; r.perf = false; }
		else if (pl.perf) { r.out = "through"; r.perf = true; r.vr = isNaN(pl.vr) ? NaN : pl.vr; r.plug = pl.plug; r.xBreak = pl.x; r.debris = !!pl.debris; }
		else if (bb.through) { r.out = "breaks"; r.perf = true; r.vr = bb.vr; r.plug = 0; r.xBreak = 0; }
		else if (ric) { r.out = "ricochet"; r.perf = false; }
		else { r.out = rg.id === "erode" ? "crater" : rg.id === "bounce" || rg.id === "shatter" || dp.P < 1e-5 ? (rg.id === "shatter" ? "shatters" : "bounces") : "stuck"; r.perf = false; r.depth = Math.min(dp.P, hEff); }
		if (r.perf && isNaN(r.vr)) { var vb = ballisticLimit(o); r.vr = Math.sqrt(Math.max(0, o.v * o.v - vb * vb)); r.vbl = vb; }
		r.cracks = !!bb.cracks; r.Ubend = bb.U; r.spall = !r.perf && tm.kind === "brittle" && dp.P > 0 && hEff < 2.2 * dp.P;
		r.dent = (!r.perf && (tm.kind === "metal" || tm.kind === "polymer") && o.h <= o.span / 15 && dp.P < 0.5 * o.h) ? dent(tm, o.h, o.span, ke * shareToPlate(rg)) : 0;
		r.F = Math.min(rg.id === "rigid" || rg.id === "mushroom" ? rg.s0 * dp.A : (rp * o.v * o.v + Math.min(rg.Rp, rg.Rt)) * Math.PI * o.d * o.d / 4, rg.id === "erode" ? Infinity : hz.F);
		r.tContact = (!r.perf && dp.P < 1e-4 && hz.t > 0) ? hz.t : r.perf ? 2 * Math.min(hEff, Math.max(dp.P, o.d)) / Math.max(1, o.v + (r.vr || 0)) : (dp.P > 1e-5 ? 2 * dp.P / o.v : 2 * Math.max(lenEff(o), o.d / 2) / o.v);
		r.decel = (o.v - (r.perf ? r.vr || 0 : 0)) / Math.max(r.tContact, 1e-9);
		r.eAbs = ke - (r.perf ? 0.5 * m * (r.vr || 0) * (r.vr || 0) : 0);
		var heat = 0.3 * r.eAbs / m; r.dT = heat / pm.c;
		r.melt = pm.Tm ? heat > pm.c * (pm.Tm - 293) + (pm.Lf || 0) * 1e3 : false;
		r.vapor = 0.3 * 0.5 * o.v * o.v > 8e6;
		r.rebound = r.out === "bounces" ? o.v * (rg.id === "bounce" ? 0.75 : 0.25) : r.out === "ricochet" ? o.v * 0.6 : 0;
		r.vbl = r.vbl || ballisticLimit(o); r.hStop = stopThickness(o); r.mush = rg.id === "mushroom" && (dp.f || 1) >= 1.3;
		return r;
	}
	/* residual speed curve for a chart */
	function curve(o, vmax, n) { var out = [], t = Object.assign({}, o), vb = null; n = n || 60; for (var i = 0; i <= n; i++) { t.v = vmax * i / n; var r = impactLite(t); if (isNaN(r)) { if (vb === null) vb = ballisticLimit(t); r = Math.sqrt(Math.max(0, t.v * t.v - vb * vb)); } out.push([t.v, r]); } return out; }
	function impactLite(o) { var rg = regime(o), dp = depth(o, rg), pl = plate(o, rg, dp); if (pl.perf) return isNaN(pl.vr) ? NaN : pl.vr; var bb = brittleBreak(o, rg, dp); return bb.through ? bb.vr : 0; }

	/* ---------------- crash: springs in series with restitution hysteresis ---------------- */
	var OBJECTS = [
		{ id: "smallcar", name: "Small car", g: "Vehicles", m: 1100, k: 0.85e6, e: 0.15, veh: true },
		{ id: "car", name: "Mid-size car", g: "Vehicles", m: 1500, k: 1.0e6, e: 0.15, veh: true },
		{ id: "suv", name: "SUV", g: "Vehicles", m: 2200, k: 1.3e6, e: 0.15, veh: true },
		{ id: "pickup", name: "Pickup truck", g: "Vehicles", m: 2600, k: 1.5e6, e: 0.15, veh: true },
		{ id: "bus", name: "Bus", g: "Vehicles", m: 12000, k: 4e6, e: 0.1, veh: true },
		{ id: "semi", name: "Semi truck (loaded)", g: "Vehicles", m: 36000, k: 6e6, e: 0.1, veh: true },
		{ id: "personbent", name: "Person landing on bent knees", g: "People & things", m: 75, k: 1.6e4, e: 0.1 },
		{ id: "personstiff", name: "Person landing stiff-legged", g: "People & things", m: 75, k: 1.6e6, e: 0.1 },
		{ id: "egg", name: "Egg", g: "People & things", m: 0.06, k: 1.5e5, e: 0.2, breakF: 35 },
		{ id: "phone", name: "Phone", g: "People & things", m: 0.2, k: 1.5e6, e: 0.3 },
		{ id: "melon", name: "Watermelon", g: "People & things", m: 6, k: 3e5, e: 0.1, breakF: 2500 },
		{ id: "bowling", name: "Bowling ball", g: "People & things", m: 6.5, k: 5e7, e: 0.4 }
	];
	var SURFACES = [
		{ id: "wall", name: "Rigid concrete wall / floor", say: "a solid concrete wall", sayDrop: "a concrete floor", k: 1e11, e: 1 },
		{ id: "pole", name: "Pole or tree (narrow hit)", say: "a pole or tree", k: 1e11, e: 1, soften: 0.55 },
		{ id: "cushion", name: "Highway crash cushion", say: "a highway crash cushion", k: 1.2e5, e: 0.1 },
		{ id: "wood", name: "Wooden floor", say: "a wooden floor", k: 2e7, e: 0.8 },
		{ id: "grass", name: "Grass / soil", k: 2e5, e: 0.4 },
		{ id: "sand", name: "Sand", k: 6e4, e: 0.15 },
		{ id: "water", name: "Water (feet first)", say: "water", k: 3e4, e: 0.05 },
		{ id: "mat", name: "Gym mat (10 cm)", say: "a gym mat", k: 6e3, e: 0.3 },
		{ id: "foam", name: "Thick foam block", say: "a thick foam block", k: 1.5e3, e: 0.2 },
		{ id: "pillow", name: "Pillow", say: "a pillow", k: 4e2, e: 0.3 },
		{ id: "vehicle", name: "Another vehicle", k: 0, e: 1 }
	];
	function obj(id) { for (var i = 0; i < OBJECTS.length; i++) if (OBJECTS[i].id === id) return OBJECTS[i]; return OBJECTS[1]; }
	function surf(id) { for (var i = 0; i < SURFACES.length; i++) if (SURFACES[i].id === id) return SURFACES[i]; return SURFACES[0]; }
	/* restraints: relative travel before contact (m), spring (N/m), damping ratio; an airbag adds a soft stage */
	var RESTRAINTS = {
		belt: { name: "Seat belt", st: [{ at: 0.03, k: 9e4, z: 0.25 }] },
		beltbag: { name: "Seat belt + airbag", st: [{ at: 0.03, k: 7e4, z: 0.25 }, { at: 0.12, k: 2.5e4, z: 0.4 }] },
		bag: { name: "Airbag, no belt", st: [{ at: 0.2, k: 3.5e4, z: 0.4 }, { at: 0.5, k: 6e5, z: 0.1 }] },
		none: { name: "No belt, no airbag", st: [{ at: 0.5, k: 6e5, z: 0.1 }] }
	};
	/* one hysteretic contact: loading k, unloading slope k/e^2 down to a permanent set z_max (1 - e^2) */
	function makeContact(k, e) {
		var zmax = 0, e2 = Math.max(e * e, 1e-4);
		return { f: function (z) { if (z >= zmax) { zmax = z; return k * z; } var zp = zmax * (1 - e2); return z <= zp ? 0 : k * zmax * (z - zp) / (zmax - zp); }, max: function () { return zmax; } };
	}
	function crash(o) {
		/* o: {m1, k1, e1, v1, m2 (Infinity = wall), k2, e2, v2, occ: restraint id or null, mo} -> time series + summary */
		var m1 = o.m1, m2 = o.m2 > 0 && isFinite(o.m2) ? o.m2 : Infinity, mu = isFinite(m2) ? m1 * m2 / (m1 + m2) : m1;
		var k = 1 / (1 / o.k1 + 1 / o.k2), e = clamp(o.e1 * o.e2, 0.01, 1), u0 = o.v1 - (o.v2 || 0);
		var out = { t: [], z: [], a1: [], a2: [], ao: [], y: [], F: [] };
		if (!(u0 > 0)) { out.none = true; return out; }
		var T = Math.PI * Math.sqrt(mu / k), dt = Math.min(T / 1500, 2e-4), c = makeContact(k, e), z = 0, w = u0, t = 0, sep = false, tSep = 0;
		var occ = o.occ && RESTRAINTS[o.occ], mo = o.mo || 75, y = 0, yv = 0, oc = occ ? occ.st.map(function (s) { return makeContact(s.k, 0.4); }) : [];
		var tEnd = occ ? Math.max(4 * T, 0.25) : 3 * T, Fmax = 0, zmaxv = 0, aoMax = 0, yMax = 0, step = 0, every = Math.max(1, Math.round((tEnd / dt) / 1500));
		function rforce(yy, vv) { var F = 0; if (!occ) return 0; for (var i = 0; i < occ.st.length; i++) { var s = occ.st[i]; if (yy > s.at) { F += oc[i].f(yy - s.at) + 2 * s.z * Math.sqrt(s.k * mo) * vv * (vv > 0 ? 1 : 0.3); } } return Math.max(0, F); }
		while (t < tEnd) {
			var F = 0;
			if (!sep) {
				/* velocity Verlet on the relative compression z (w = dz/dt) */
				F = c.f(z); var a = -F / mu, z1 = z + w * dt + 0.5 * a * dt * dt, F1 = c.f(z1), a1 = -F1 / mu; w += 0.5 * (a + a1) * dt; z = z1; F = F1;
				if (z <= 0 || (w < 0 && F <= 0)) { sep = true; tSep = t; F = 0; }
			}
			var acar = -F / m1;
			if (occ) { var fr = rforce(y, yv), ay = -acar - fr / mo; yv += ay * dt; y += yv * dt; var ao = acar + ay; if (Math.abs(ao) > aoMax) aoMax = Math.abs(ao); if (y > yMax) yMax = y; if (sep && yv < 0 && fr <= 0 && t > tSep + 0.02) { tEnd = Math.min(tEnd, t + 0.01); } }
			if (F > Fmax) Fmax = F; if (z > zmaxv) zmaxv = z;
			if (step % every === 0) { out.t.push(t); out.z.push(Math.max(0, z)); out.F.push(F); out.a1.push(acar); out.a2.push(isFinite(m2) ? F / m2 : 0); if (occ) { out.ao.push(acar + (-acar - rforce(y, yv) / mo)); out.y.push(y); } }
			if (sep && !occ && t > tSep + T * 0.15) break;
			t += dt; step++;
		}
		var uOut = sep ? -w : 0, dv1 = (u0 + Math.max(0, uOut)) * mu / m1, dv2 = isFinite(m2) ? (u0 + Math.max(0, uOut)) * mu / m2 : 0;
		var tc = sep ? tSep : t;
		out.sum = { mu: mu, k: k, e: e, u0: u0, rebound: Math.max(0, uOut), dv1: dv1, dv2: dv2, crush: zmaxv, crush1: zmaxv * k / o.k1, crush2: zmaxv * k / o.k2, Fmax: Fmax, tc: tc,
			a1max: Fmax / m1, a1avg: dv1 / Math.max(tc, 1e-9), a2max: isFinite(m2) ? Fmax / m2 : 0, eAbs: 0.5 * mu * u0 * u0 * (1 - e * e), keIn: 0.5 * m1 * o.v1 * o.v1 + (isFinite(m2) ? 0.5 * m2 * (o.v2 || 0) * (o.v2 || 0) : 0),
			v1After: o.v1 - dv1, v2After: (o.v2 || 0) + dv2 };
		if (occ) {
			var g = out.ao.map(function (x) { return Math.abs(x) / G; });
			out.sum.occ = { peak: aoMax / G, clip3: clip(out.t, g, 0.003), hic: hic(out.t, g, 0.015), travel: yMax };
			/* NHTSA's NCAP risk curves for a severe (AIS 4+) injury from HIC and chest g */
			out.sum.occ.pHead = 1 / (1 + Math.exp(5.02 - 0.00351 * out.sum.occ.hic));
			out.sum.occ.pChest = 1 / (1 + Math.exp(5.55 - 0.0693 * out.sum.occ.clip3));
		}
		return out;
	}
	/* highest level held for a window of length w (the "3 ms clip"): max over windows of the window minimum */
	function clip(t, g, w) { var best = 0, j = 0; for (var i = 0; i < t.length; i++) { while (t[i] - t[j] > w) j++; if (t[i] - t[j] >= w - 1.01 * (t.length > 1 ? t[1] - t[0] : 0)) { var mn = Infinity; for (var k = j; k <= i; k++) if (g[k] < mn) mn = g[k]; if (mn > best) best = mn; } } return best; }
	/* head injury criterion: max over t2 - t1 <= w of (t2 - t1) * (mean g)^2.5 */
	function hic(t, g, w) {
		var n = t.length, cum = [0]; for (var i = 1; i < n; i++) cum.push(cum[i - 1] + 0.5 * (g[i] + g[i - 1]) * (t[i] - t[i - 1]));
		var best = 0; for (var a = 0; a < n; a++) for (var b = a + 1; b < n && t[b] - t[a] <= w + 1e-12; b++) { var d = t[b] - t[a]; if (d <= 0) continue; var m = (cum[b] - cum[a]) / d, h = d * Math.pow(m, 2.5); if (h > best) best = h; }
		return best;
	}
	function phi(x) { var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }

	var api = { G: G, TNT: TNT, MATS: MATS, mat: mat, SHAPES: SHAPES, shape: shape, R: R, tauOf: tauOf, massOf: massOf, hertz: hertz, regime: regime, depth: depth, plate: plate, perforates: perforates, bendFail: bendFail, dent: dent,
		ballisticLimit: ballisticLimit, stopThickness: stopThickness, impact: impact, curve: curve, impactLite: impactLite,
		OBJECTS: OBJECTS, SURFACES: SURFACES, obj: obj, surf: surf, RESTRAINTS: RESTRAINTS, makeContact: makeContact, crash: crash, clip: clip, hic: hic, phi: phi };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESCrash = api;
})(typeof window !== "undefined" ? window : this);
