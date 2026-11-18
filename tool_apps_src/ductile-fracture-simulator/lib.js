/* MESVoid: voids in metals and ductile fracture (pure, runs in node: node tool_apps_src/ductile-fracture-simulator-tests.js).
   Model = Gurson-Tvergaard-Needleman (GTN) porous plasticity:
     yield: (σe/σy)² + 2 q1 f* cosh(1.5 q2 σm/σy) − 1 − q3 f*² = 0      (q1 = 1.5, q2 = 1, q3 = q1²)
     void growth   df = (1 − f) dεkk           (the matrix keeps its volume, so all volume change is void)
     nucleation    df = A(εm) dεm, A = fN/(sN√2π) exp(−½((εm − εN)/sN)²)   (Chu-Needleman: voids open at particles)
     shear damage  df = kω f ω dε, ω = 1 − ξ²   (Nahshon-Hutchinson: voids smear out in shear even with no growth)
     coalescence   f* = f below fc; above it f* rises fast to 1/q1 at fF (the ligaments between voids neck and link)
   loaded with a fixed stress triaxiality T = σm/σe and Lode parameter ξ (1 = axisymmetric tension, 0 = shear / plane strain, −1 = compression).
   A round bar: the neck is a smooth dip whose root radius R comes from its shape; Bridgman's formula gives the triaxiality across it,
   T(ρ) = 1/3 + ln(1 + (a² − ρ²)/(2aR)), highest in the middle, so the voids there grow first and the crack starts at the centre. */
(function (root) {
	"use strict";
	var Q1 = 1.5, Q2 = 1, Q3 = Q1 * Q1, FC = 0.15, FF = 0.25, KW = 2, FU = 1 / Q1, SQ2PI = Math.sqrt(2 * Math.PI);

	/* typical numbers (MPa, GPa); f0 = voids already there, fN = particle volume that can open voids. Rough textbook values, not a design database. */
	/* typical numbers (MPa, GPa); f0 = voids (and weak particles) there at the start, fN = particles that can open voids as it stretches,
	   fc = void fraction where the voids start to link. Picked so a smooth round bar breaks with about the textbook reduction of area
	   (copper ~90 %, mild steel ~62 %, 304 ~70 %, 6061-T6 ~45 %, 4340 ~50 %, free-machining steel ~35 %): rough teaching values, not a design database. */
	var MATS = [
		{ id: "copper", name: "Pure copper (annealed)", s0: 70, n: 0.42, E: 117, f0: 0.0002, fN: 0.01, eN: 0.3, sN: 0.1, fc: 0.06, ra: 0.9, note: "Very clean and soft: it necks down a long way before the voids link. The bar in the video is copper." },
		{ id: "steel", name: "Mild steel", s0: 250, n: 0.22, E: 200, f0: 0.003, fN: 0.04, eN: 0.25, sN: 0.1, fc: 0.03, ra: 0.62, note: "Voids open at manganese sulfide and carbide particles, then link: the classic cup-and-cone." },
		{ id: "ss304", name: "Stainless steel 304", s0: 215, n: 0.35, E: 193, f0: 0.001, fN: 0.03, eN: 0.3, sN: 0.1, fc: 0.03, ra: 0.7, note: "Hardens a lot as it stretches, so the neck forms late." },
		{ id: "al6061", name: "Aluminium 6061-T6", s0: 275, n: 0.08, E: 69, f0: 0.01, fN: 0.08, eN: 0.2, sN: 0.1, fc: 0.03, ra: 0.45, note: "Little hardening, so it necks early; iron-rich particles start the voids." },
		{ id: "s4340", name: "High-strength steel 4340", s0: 860, n: 0.1, E: 205, f0: 0.02, fN: 0.04, eN: 0.1, sN: 0.1, fc: 0.03, ra: 0.5, note: "Strong but less ductile: small dimples and a short neck." },
		{ id: "dirty", name: "Free-machining steel (lots of sulfides)", s0: 300, n: 0.2, E: 200, f0: 0.03, fN: 0.08, eN: 0.1, sN: 0.1, fc: 0.015, ra: 0.35, note: "Full of particles on purpose (so chips break off when it is machined): the voids link early." }
	];
	function mat(id) { for (var i = 0; i < MATS.length; i++) if (MATS[i].id === id) return MATS[i]; return MATS[0]; }

	/* stress states you meet in practice: T and the Lode parameter ξ */
	var LOADS = [
		{ id: "comp", name: "Squashing (compression)", T: -1 / 3, xi: -1, note: "Pressure squeezes the voids shut, so nothing fails by voids." },
		{ id: "shear", name: "Pure shear (twisting)", T: 0, xi: 0, note: "No pull to open voids: they get flattened and smeared, and link along the shear band." },
		{ id: "tension", name: "Plain tension (a smooth bar)", T: 1 / 3, xi: 1, note: "Pulling one way. The voids stretch along the pull and grow slowly." },
		{ id: "plane", name: "Plane strain (a wide plate)", T: 0.577, xi: 0, note: "The plate cannot get narrower, so the pull opens the voids more." },
		{ id: "neck", name: "Middle of a neck", T: 0.7, xi: 1, note: "Once a bar necks, the middle is pulled from every side: the voids grow fast here." },
		{ id: "notch", name: "Sharp notch", T: 1.3, xi: 1, note: "A notch makes the middle even more triaxial: the bar breaks with less stretch." },
		{ id: "crack", name: "Just ahead of a crack", T: 2.5, xi: 0, note: "The highest triaxiality: the voids grow almost spherically and link quickly." }
	];
	function load(id) { for (var i = 0; i < LOADS.length; i++) if (LOADS[i].id === id) return LOADS[i]; return LOADS[2]; }

	function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
	function fstar(f, m) { var fc = m && m.fc || FC, ff = m && m.fF || FF; if (f <= fc) return f; var fs = fc + (FU - fc) / (ff - fc) * (f - fc); return fs > FU ? FU : fs; }
	function flow(m, em) { var e0 = m.e0 || 0.01; return m.s0 * Math.pow(1 + Math.max(0, em) / e0, m.n); }
	/* σe/σy that satisfies the GTN yield function for f* and T (0 = the material has no strength left) */
	function yieldRatio(fs, T) {
		if (fs <= 0) return 1;
		if (fs >= FU * 0.9999) return 0;
		var lo = 0, hi = 1, a = 1.5 * Q2 * T;
		for (var i = 0; i < 52; i++) { var x = (lo + hi) / 2, g = x * x + 2 * Q1 * fs * Math.cosh(a * x) - 1 - Q3 * fs * fs; if (g > 0) hi = x; else lo = x; }
		return (lo + hi) / 2;
	}
	/* Lode angle θ from ξ = cos 3θ, and the three principal strain-rate directions (dεi = dεe cos θi: ξ = 1 gives 1, −½, −½) */
	function lodeDirs(xi) { var th = Math.acos(clamp(xi, -1, 1)) / 3; return [Math.cos(th), Math.cos(th - 2 * Math.PI / 3), Math.cos(th + 2 * Math.PI / 3)]; }
	/* the three principal stresses for σe = 1 and triaxiality T: σi = (2/3) cos θi + T */
	function stresses(T, xi) { var c = lodeDirs(xi); return [2 / 3 * c[0] + T, 2 / 3 * c[1] + T, 2 / 3 * c[2] + T]; }

	/* one GTN step of size de (macroscopic equivalent strain) at triaxiality T, Lode ξ; s = {f, em, ev, S: [3 shape logs], E: [3 cell logs]} */
	function step(m, s, T, xi, de, opt) {
		opt = opt || {};
		var fs = fstar(s.f, m), x = yieldRatio(fs, T), kw = opt.kw == null ? KW : opt.kw, nuc = opt.nuc !== false;
		var kk = x > 1e-6 ? 1.5 * Q1 * Q2 * fs * Math.sinh(1.5 * Q2 * T * x) / x : 0, dkk = kk * de;
		var dem = x * (de + T * dkk) / Math.max(1e-6, 1 - s.f);
		if (!(dem >= 0)) dem = 0;
		var df = (1 - s.f) * dkk;
		if (nuc && m.fN > 0 && T > -0.2) df += m.fN / (m.sN * SQ2PI) * Math.exp(-0.5 * Math.pow((s.em - m.eN) / m.sN, 2)) * dem;
		if (kw > 0 && s.f > 0) df += kw * s.f * (1 - xi * xi) * de;
		s.f = clamp(s.f + df, 0, 0.9999); s.em += dem; s.ev += dkk;
		var c = lodeDirs(xi);
		for (var i = 0; i < 3; i++) { s.S[i] += 5 / 3 * c[i] * de; s.E[i] += c[i] * de + dkk / 3; }
		var mS = (s.S[0] + s.S[1] + s.S[2]) / 3; s.S[0] -= mS; s.S[1] -= mS; s.S[2] -= mS;
		return { x: x, sy: flow(m, s.em), fs: fstar(s.f, m) };
	}
	function newState(m, f0) { return { f: f0 == null ? m.f0 : f0, em: 0, ev: 0, S: [0, 0, 0], E: [0, 0, 0] }; }
	/* void radii and cell size for a unit cell of side 1 (3D: f = (4/3)π R1 R2 R3 / cell volume) */
	function voidShape(s) {
		var V = Math.exp(s.ev), R = Math.cbrt(3 * Math.max(0, s.f) * V / (4 * Math.PI));
		return { r: [R * Math.exp(s.S[0]), R * Math.exp(s.S[1]), R * Math.exp(s.S[2])], cell: [Math.exp(s.E[0]), Math.exp(s.E[1]), Math.exp(s.E[2])] };
	}

	/* a whole unit-cell test at fixed T, ξ until it fails (or emax). Arrays e (strain), sig (σe in MPa), f, fs, and the void shape per point;
	   ec = strain where f reached fc (the voids start to link), ef = failure strain, sigMax, eMax. */
	function cell(m, T, xi, opt) {
		opt = opt || {};
		var de = opt.de || 0.004, emax = opt.emax || 4, s = newState(m, opt.f0), e = 0, r = { e: [], sig: [], f: [], fs: [], shape: [], T: T, xi: xi, ec: null, ef: null, sigMax: 0, eMax: 0 }, k = 0;
		function rec(st) { var sh = voidShape(s); r.e.push(e); r.sig.push(st.x * st.sy); r.f.push(s.f); r.fs.push(st.fs); r.shape.push(sh); if (st.x * st.sy > r.sigMax) { r.sigMax = st.x * st.sy; r.eMax = e; } }
		rec({ x: yieldRatio(fstar(s.f, m), T), sy: flow(m, 0), fs: fstar(s.f, m) });
		while (e < emax && k++ < 20000) {
			var st = step(m, s, T, xi, de, opt); e += de;
			if (r.ec == null && s.f >= (m.fc || FC)) r.ec = e;
			rec(st);
			if (st.fs >= FU * 0.97 || st.x < 0.02) { r.ef = e; break; }
		}
		return r;
	}
	/* failure strain against triaxiality (the "fracture locus") for Lode ξ */
	function locus(m, xi, Ts, opt) { return Ts.map(function (T) { var c = cell(m, T, xi, Object.assign({ de: 0.006, emax: 5 }, opt || {})); return { T: T, ef: c.ef, ec: c.ec }; }); }

	/* ---- a round bar pulled until it breaks ----
	   nz rows from the middle of the neck (z = 0) outwards, nr rings from the axis to the surface; geometry in units of the starting radius r0 = 1.
	   opt.notch = 0 (smooth bar) or notch depth as a fraction of r0 (0.1-0.5) with opt.nr0 = notch root radius. Returns frames. */
	function bar(m, opt) {
		opt = opt || {};
		var nz = opt.nz || 30, nr = opt.nr || 14, Lz = 3.0, notch = opt.notch || 0, nrad = opt.nrad || 0.25, w = notch ? Math.max(0.35, 1.6 * Math.sqrt(nrad * notch)) : 1.15;
		var cells = [], i, j, frames = [], eu = notch ? 0 : Math.max(0.02, m.n), dEa = opt.dEa || 0.01;
		for (i = 0; i < nz * nr; i++) cells.push({ s: newState(m), eps: 0, dead: false, lip: false });
		/* the far part of the bar keeps the strain it had when the neck formed (Considère: strain = n); the neck root strain εa grows */
		function geom(ea) {
			var rfar = notch ? 1 : Math.exp(-Math.min(ea, eu) / 2), a = notch ? (1 - notch) * Math.exp(-ea / 2) : Math.exp(-ea / 2), dep = rfar - a, R = dep > 1e-9 ? w * w / (2 * dep) : 1e9;
			if (notch) R = Math.min(R, nrad * Math.exp(ea));   /* a notch starts with its own root radius, which opens up as it stretches */
			return { rfar: rfar, a: a, R: R, w: w, r: function (z) { return rfar - dep * Math.exp(-(z / w) * (z / w)); } };
		}
		function T_at(g, z, u) { var rz = g.r(z), rho = u * rz, decay = Math.exp(-(z / g.w) * (z / g.w)); return 1 / 3 + decay * Math.log(1 + Math.max(0, rz * rz - rho * rho) / (2 * rz * g.R)); }
		var g0 = geom(0), ea = 0, k = 0, crack = 0, broke = false, lipFrom = null, Fmax = 0, Lg = opt.Lg || 8;
		while (!broke && k++ < 900) {
			ea += ea < eu ? 0.02 : dEa * (crack > 0 ? 0.5 : 1);
			var g = geom(ea), F = 0, fieldF = new Float32Array(nz * nr), dead = new Uint8Array(nz * nr);
			for (i = 0; i < nz; i++) {
				var z = (i + 0.5) / nz * Lz, rz = g.r(z), eloc = 2 * Math.log(g0.r(z) / rz);
				for (j = 0; j < nr; j++) {
					var c = cells[i * nr + j], u = (j + 0.5) / nr, dE = eloc - c.eps;
					if (dE > 0 && !c.dead) {
						var T = T_at(g, z, u), sub = Math.max(1, Math.ceil(dE / 0.01));
						for (var q = 0; q < sub; q++) { var st = step(m, c.s, T, 1, dE / sub); if (st.fs >= FU * 0.97 || st.x < 0.02) { c.dead = true; break; } }
					}
					c.eps = Math.max(c.eps, eloc);
					fieldF[i * nr + j] = c.s.f; dead[i * nr + j] = c.dead ? (c.lip ? 2 : 1) : 0;
				}
			}
			/* the crack = the failed rings of the middle row, counted from the axis */
			for (crack = 0; crack < nr && cells[crack].dead; crack++);
			/* force on the narrowest section: Bridgman's axial stress σz = σe (T + 2/3) on each live ring */
			for (j = 0; j < nr; j++) {
				var c0 = cells[j]; if (c0.dead) continue;
				var u0 = (j + 0.5) / nr, T0 = T_at(g, 0, u0), x0 = yieldRatio(fstar(c0.s.f, m), T0), ring = Math.PI * g.a * g.a * (Math.pow((j + 1) / nr, 2) - Math.pow(j / nr, 2));
				F += ring * x0 * flow(m, c0.s.em) * (T0 + 2 / 3);
			}
			/* cup and cone: once the flat crack has eaten ~2/3 of the section, the last ring tears along 45° shear lips */
			if (crack >= Math.ceil(nr * 0.66) && crack < nr) { lipFrom = crack / nr; for (j = crack; j < nr; j++) { cells[j].dead = true; cells[j].lip = true; dead[j] = 2; } crack = nr; F = 0; }
			if (crack >= nr) broke = true;
			var Fn = F / Math.PI;   /* = engineering stress (MPa): force ÷ starting area π r0² */
			if (Fn > Fmax) Fmax = Fn;
			/* elongation of a gauge length Lg (in r0): the uniform stretch plus the extra length the neck adds (volume is kept) */
			var dl = Lg * (Math.exp(Math.min(ea, eu)) - 1);
			for (i = 0; i < nz; i++) { var zz = (i + 0.5) / nz * Lz, r2 = g.r(zz), r1 = g0.r(zz); dl += 2 * Lz / nz * (g.rfar * g.rfar - r2 * r2 / (r1 * r1)); }   /* current length − starting length of each slice of the neck (dz − dz/λ, λ = r1²/r²), beyond the uniform stretch */
			frames.push({ ea: ea, a: g.a, rfar: g.rfar, R: g.R, w: g.w, f: fieldF, dead: dead, crack: crack / nr, F: broke ? 0 : Fn, dl: dl, Tc: T_at(g, 0, 0), Ts: T_at(g, 0, 1), fc: cells[0].s.f, broke: broke, lip: lipFrom });
		}
		var last = frames[frames.length - 1], first = null;
		for (i = 0; i < frames.length; i++) if (frames[i].crack > 0) { first = i; break; }
		return { frames: frames, nz: nz, nr: nr, Lz: Lz, notch: notch, eu: eu, Fmax: Fmax, crackAt: first, af: last.a, RA: 1 - last.a * last.a / (notch ? Math.pow(1 - notch, 2) : 1), ef: last.ea, lip: lipFrom, Lg: Lg };
	}

	/* fracture-surface dimples, seeded (so a given test always shows the same picture). Points in the unit disc; centre zone = flat
	   part (round dimples, bigger when the voids grew more), outer ring = shear lip (elongated dimples leaning one way). */
	function rng(seed) { var t = seed >>> 0 || 1; return function () { t += 0x6D2B79F5; var r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
	function dimples(seed, lip, size, n) {
		var R = rng(seed), out = [], g = Math.max(10, Math.round(Math.sqrt(n || 500))), i, j;
		for (i = 0; i < g; i++) for (j = 0; j < g; j++) {
			var x = -1 + (i + 0.5 + (R() - 0.5) * 0.8) * 2 / g, y = -1 + (j + 0.5 + (R() - 0.5) * 0.8) * 2 / g, rr = Math.sqrt(x * x + y * y);
			if (rr > 0.985) continue;
			var inLip = lip != null && rr > lip, base = 1.05 / g * (inLip ? 0.8 : size || 1) * (0.7 + 0.6 * R());
			var ang = inLip ? Math.atan2(y, x) + Math.PI / 2 : R() * Math.PI, el = inLip ? 2.2 + R() : 1 + 0.25 * R();
			out.push({ x: x, y: y, rx: base * Math.sqrt(el), ry: base / Math.sqrt(el), a: ang, p: R() < (inLip ? 0.25 : 0.6), lip: inLip });
		}
		return out;
	}

	var api = { Q1: Q1, Q2: Q2, Q3: Q3, FC: FC, FF: FF, FU: FU, KW: KW, MATS: MATS, mat: mat, LOADS: LOADS, load: load, fstar: fstar, flow: flow, yieldRatio: yieldRatio,
		lodeDirs: lodeDirs, stresses: stresses, step: step, newState: newState, voidShape: voidShape, cell: cell, locus: locus, bar: bar, dimples: dimples, rng: rng };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESVoid = api;
})(this);
