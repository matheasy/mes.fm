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

/* MES Voids & Ductile Fracture Simulator: the page (uses window.MESVoid from lib.js).
   Bar = canvas (cut-open bar coloured by voids / triaxiality / stretch, crack, cup and cone), force chart = SVG with a draggable dot,
   end view = canvas (the cross-section at the neck, then the dimpled fracture surface). One void = SVG cell picture with draggable side
   arrows, strength / void-fraction chart and the failure locus. Settings in localStorage mes-ductile-fracture:v1; links ?m=&notch=&T=&xi= */
(function () {
	"use strict";
	var V = window.MESVoid, root = document.getElementById("df");
	if (!V || !root) return;
	function $(id) { return document.getElementById(id); }
	var KEY = "mes-ductile-fracture:v1", PI = Math.PI;
	var S = { m: "copper", f0: null, fN: null, n: null, notch: "none", look: "f", units: "mpa", speed: 1, load: "tension", T: 1 / 3, xi: 1 };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var kk in sv) if (kk in S) S[kk] = sv[kk]; } catch (e) { /* ignore */ }
	(function () {
		var q = new URLSearchParams(location.search);
		if (q.get("m") && V.MATS.some(function (m) { return m.id === q.get("m"); })) { S.m = q.get("m"); S.f0 = S.fN = S.n = null; }
		if (/^(none|blunt|sharp)$/.test(q.get("notch") || "")) S.notch = q.get("notch");
		if (q.get("T") != null && isFinite(+q.get("T"))) { S.T = clamp(+q.get("T"), -0.33, 3); S.load = ""; }
		if (q.get("xi") != null && isFinite(+q.get("xi"))) { S.xi = clamp(+q.get("xi"), -1, 1); S.load = ""; }
		if (q.get("load")) { var L = V.LOADS.filter(function (l) { return l.id === q.get("load"); })[0]; if (L) { S.load = L.id; S.T = L.T; S.xi = L.xi; } }
	})();
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
	function dark() { return document.body.classList.contains("dark-mode"); }
	function cssv(n) { return getComputedStyle(root).getPropertyValue(n).trim() || "#888"; }
	function toast(t) { var el = $("df-toast"); el.textContent = t; el.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 2200); }
	function r1(x) { return Math.round(x * 10) / 10; }
	function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d).replace(/\.0+$/, "") + "%"; }
	function fpct(f) { var p = f * 100; return (p < 0.1 ? p.toFixed(3) : p < 1 ? p.toFixed(2) : p.toFixed(1)) + "%"; }
	function stress(v) { return S.units === "ksi" ? (v * 0.1450377).toFixed(v * 0.145 < 100 ? 1 : 0) + " ksi" : Math.round(v) + " MPa"; }
	var NOTCH = { none: null, blunt: { d: 0.25, r: 0.6 }, sharp: { d: 0.3, r: 0.12 } };

	/* ---- the material with the person's changes ---- */
	function base() { return V.mat(S.m); }
	function mat() { var b = base(); return Object.assign({}, b, { f0: S.f0 != null ? S.f0 : b.f0, fN: S.fN != null ? S.fN : b.fN, n: S.n != null ? S.n : b.n }); }
	function f0FromPos(p) { return 1e-4 * Math.pow(500, p / 100); }
	function posFromF0(f) { return 100 * Math.log(Math.max(1e-4, f) / 1e-4) / Math.log(500); }
	function fNFromPos(p) { return p <= 0 ? 0 : 1e-3 * Math.pow(150, p / 100); }
	function posFromFN(f) { return f <= 0 ? 0 : clamp(100 * Math.log(f / 1e-3) / Math.log(150), 1, 100); }

	/* ================= THE BAR ================= */
	var B = { r: null, p: 0, play: false, last: 0 };
	function barBuild() {
		var nt = NOTCH[S.notch];
		B.r = V.bar(mat(), nt ? { notch: nt.d, nrad: nt.r } : {});
		B.p = 0; B.play = false; barDraw(); tiles();
	}
	var rebT = null; function barRebuild() { clearTimeout(rebT); rebT = setTimeout(function () { barBuild(); cellLocus(); cellBuild(); }, 120); }
	function frame() { var fr = B.r.frames; return fr[clamp(Math.floor(B.p), 0, fr.length - 1)]; }
	function fitCv(cv, aspect, maxH) {
		var w = cv.clientWidth || cv.parentNode.clientWidth || 300, h = Math.min(w * aspect, maxH || 9999), dpr = Math.min(2.5, window.devicePixelRatio || 1);
		if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px"; }
		var c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c: c, w: w, h: h };
	}
	function filling(el) { return !!(el.closest(".mes-pfill") || document.fullscreenElement); }
	/* colour scales (canvas, so the derived dark theme cannot touch them: each has a light and a dark version) */
	var SC = {
		f: { l: ["#dde4ec", "#fde68a", "#fb923c", "#dc2626", "#450a0a"], d: ["#3a4352", "#a16207", "#ea580c", "#ef4444", "#fecaca"] },
		T: { l: ["#dde4ec", "#c4b5fd", "#7c3aed", "#3b0764"], d: ["#3a4352", "#6d28d9", "#a78bfa", "#ede9fe"] },
		e: { l: ["#dde4ec", "#93c5fd", "#2563eb", "#172554"], d: ["#3a4352", "#1d4ed8", "#60a5fa", "#dbeafe"] }
	};
	function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
	function ramp(stops, t) { t = clamp(t, 0, 1) * (stops.length - 1); var i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = hex(stops[i]), b = hex(stops[i + 1]); return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," + Math.round(a[1] + (b[1] - a[1]) * f) + "," + Math.round(a[2] + (b[2] - a[2]) * f) + ")"; }
	function fT(f) { return Math.log(Math.max(0.003, f) / 0.003) / Math.log(0.2 / 0.003); }   /* 0.3 % … 20 % */
	function scaleVal(look, v) { return look === "f" ? fT(v) : look === "T" ? (v - 1 / 3) / 1.3 : v / 3; }
	function rInit(z) { var nt = NOTCH[S.notch], w = B.r.frames[0].w; return nt ? 1 - nt.d * Math.exp(-(z / w) * (z / w)) : 1; }
	function rAt(fr, z) { return fr.rfar - (fr.rfar - fr.a) * Math.exp(-(z / fr.w) * (z / fr.w)); }
	function Tat(fr, z, u) { var rz = rAt(fr, z), rho = u * rz, dec = Math.exp(-(z / fr.w) * (z / fr.w)); return 1 / 3 + dec * Math.log(1 + Math.max(0, rz * rz - rho * rho) / (2 * rz * fr.R)); }
	function barDraw() {
		if (!B.r) return;
		var cv = $("df-bar"), big = filling(cv), o = fitCv(cv, 1.25, big ? Math.max(320, window.innerHeight - 300) : 700), c = o.c, W = o.w, H = o.h, fr = frame(), r = B.r;
		var pal = SC[S.look][dark() ? "d" : "l"], Lz = r.Lz, nz = r.nz, nr = r.nr;
		var ZV = 2.3, px = Math.min(W * 0.3, H / (2 * (ZV + 0.75))), cx = W / 2, cy = H / 2, gap = fr.broke ? px * 0.45 : 0;
		c.clearRect(0, 0, W, H);
		var ink = cssv("--df-ink"), mut = cssv("--df-mut"), grip = cssv("--df-grip"), deadC = cssv("--df-dead");
		function Y(z) { return cy - z * px; }
		/* fracture line (model coords, z up): flat in the middle, 45° lips to the surface */
		var lip = r.lip || 0.66, jag = V.rng(31);
		var fl = []; for (var k = 0; k <= 40; k++) { var x = -1.6 + 3.2 * k / 40, ax = Math.abs(x) / Math.max(1e-6, fr.a), zz = ax <= lip ? (jag() - 0.5) * 0.05 * fr.a : ax <= 1 ? (ax - lip) * fr.a : (1 - lip) * fr.a; fl.push([x, zz]); }
		function piece(top) {
			c.save();
			if (fr.broke) {
				c.translate(0, top ? -gap / 2 : gap / 2);
				c.beginPath();
				if (top) { c.moveTo(0, -10); c.lineTo(W, -10); } else { c.moveTo(0, H + 10); c.lineTo(W, H + 10); }
				for (var q = fl.length - 1; q >= 0; q--) c.lineTo(cx + fl[q][0] * px, Y(fl[q][1]));
				c.closePath(); c.clip();
			}
			/* grips and the plain part of the bar beyond the neck region */
			var ze = ZV, rf = rAt(fr, ZV);
			[1, -1].forEach(function (sg) {
				var vEnd = S.look === "f" ? fr.f[Math.min(nz - 1, Math.floor(ZV / Lz * nz)) * nr] : S.look === "T" ? 1 / 3 : 2 * Math.log(rInit(Lz) / rf);
				c.fillStyle = ramp(pal, scaleVal(S.look, vEnd)); c.fillRect(cx - rf * px, Math.min(Y(sg * ze), Y(sg * (ze + 0.25))), 2 * rf * px, 0.25 * px);
				c.fillStyle = grip; var gy = sg > 0 ? Y(ze + 0.25) - 0.45 * px : Y(-ze - 0.25); c.fillRect(cx - 1.45 * px, gy, 2.9 * px, 0.45 * px);
			});
			/* the cells */
			for (var i = 0; i < nz; i++) {
				var z0 = i / nz * Lz, z1 = Math.min(ZV, (i + 1) / nz * Lz); if (z0 >= ZV) break; var ra = rAt(fr, z0), rb = rAt(fr, z1), zm = (z0 + z1) / 2;
				var eloc = 2 * Math.log(rInit(zm) / rAt(fr, zm));
				for (var j = 0; j < nr; j++) {
					var u0 = j / nr, u1 = (j + 1) / nr, id = i * nr + j, dd = fr.dead[id], v;
					if (dd) c.fillStyle = deadC;
					else { v = S.look === "f" ? fr.f[id] : S.look === "T" ? Tat(fr, zm, (u0 + u1) / 2) : eloc; c.fillStyle = ramp(pal, scaleVal(S.look, v)); }
					for (var sx = -1; sx <= 1; sx += 2) for (var sz = -1; sz <= 1; sz += 2) {
						c.beginPath(); c.moveTo(cx + sx * u0 * ra * px, Y(sz * z0)); c.lineTo(cx + sx * u1 * ra * px, Y(sz * z0)); c.lineTo(cx + sx * u1 * rb * px, Y(sz * z1)); c.lineTo(cx + sx * u0 * rb * px, Y(sz * z1)); c.closePath(); c.fill();
					}
					/* the voids themselves, in the Voids view: a dot per cell sized by the void fraction, stretched by the strain */
					if (S.look === "f" && !dd && fr.f[id] > 0.0015) {
						var cw = (u1 - u0) * (ra + rb) / 2 * px, ch = (z1 - z0) * px, rr = Math.min(0.46 * Math.min(cw, ch * 1.6), cw * 0.5 * Math.sqrt(fr.f[id] / 0.12) + 0.4), el = clamp(Math.exp(0.35 * eloc), 1, 2.2);
						c.fillStyle = dark() ? "rgba(10,10,14,0.75)" : "rgba(40,10,10,0.55)";
						for (var sx2 = -1; sx2 <= 1; sx2 += 2) for (var sz2 = -1; sz2 <= 1; sz2 += 2) { c.beginPath(); c.ellipse(cx + sx2 * (u0 + u1) / 2 * (ra + rb) / 2 * px, Y(sz2 * zm), rr / Math.sqrt(el), Math.min(ch * 0.48, rr * Math.sqrt(el)), 0, 0, 2 * PI); c.fill(); }
					}
				}
			}
			/* outline */
			c.strokeStyle = mut; c.lineWidth = 1.2; [1, -1].forEach(function (sx) { c.beginPath(); for (var q = -60; q <= 60; q++) { var z = q / 60 * ZV, X = cx + sx * rAt(fr, z) * px; if (q === -60) c.moveTo(X, Y(z)); else c.lineTo(X, Y(z)); } c.stroke(); });
			c.restore();
		}
		piece(true); if (fr.broke) piece(false);
		/* the inner crack before it breaks */
		if (!fr.broke && fr.crack > 0) {
			var cw2 = fr.crack * fr.a * px, open = Math.max(2.5, px * 0.07);
			c.fillStyle = dark() ? "#050505" : "#111";
			c.beginPath(); var jj = V.rng(7); c.moveTo(cx - cw2, cy);
			for (var q2 = 0; q2 <= 16; q2++) c.lineTo(cx - cw2 + 2 * cw2 * q2 / 16, cy - open * (0.5 + jj() * 0.6) * Math.sin(PI * q2 / 16));
			for (q2 = 16; q2 >= 0; q2--) c.lineTo(cx - cw2 + 2 * cw2 * q2 / 16, cy + open * (0.5 + jj() * 0.6) * Math.sin(PI * q2 / 16));
			c.closePath(); c.fill(); c.strokeStyle = dark() ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.8)"; c.lineWidth = 1; c.stroke();
		}
		/* pull arrows and labels */
		c.strokeStyle = cssv("--df-arrow"); c.fillStyle = cssv("--df-arrow"); c.lineWidth = 3;
		[[Y(ZV + 0.7) + 2 - gap / 2, -1], [Y(-ZV - 0.7) - 2 + gap / 2, 1]].forEach(function (a) { var y = a[0]; c.beginPath(); c.moveTo(cx, y + a[1] * 22); c.lineTo(cx, y); c.stroke(); c.beginPath(); c.moveTo(cx - 7, y + a[1] * 0 + (a[1] < 0 ? 10 : -10)); c.lineTo(cx, y + (a[1] < 0 ? -2 : 2)); c.lineTo(cx + 7, y + (a[1] < 0 ? 10 : -10)); c.fill(); });
		c.fillStyle = mut; c.font = "12px system-ui, sans-serif"; c.textAlign = "left";
		var lx = cx + rAt(fr, 0) * px + 12;
		if (fr.ea > r.eu + 0.05 && !fr.broke) c.fillText("neck", Math.min(lx, W - 40), cy - 4);
		if (fr.broke) { c.fillStyle = ink; c.fillText(r.lip ? "cup" : "", cx + 1.35 * px, cy + gap / 2 + 18); c.fillText(r.lip ? "cone" : "", cx + 1.35 * px, cy - gap / 2 - 10); }
		barKey(); barChart(); endDraw(); barRO(); barSay();
		$("df-bscrub").value = String(Math.round(r.frames.length > 1 ? B.p / (r.frames.length - 1) * 1000 : 0));
		$("df-bgo").textContent = B.play ? "❚❚ Pause" : fr.broke ? "↺ Pull again" : B.p > 0 ? "▶ Carry on" : "▶ Pull the bar";
	}
	function barKey() {
		var pal = SC[S.look][dark() ? "d" : "l"], g = "linear-gradient(90deg," + pal.join(",") + ")";
		var lab = S.look === "f" ? ["0.3% or less", "voids", "20%"] : S.look === "T" ? ["0.33", "triaxiality T", "1.6+"] : ["0", "true strain", "3+"];
		$("df-bkey").innerHTML = "<span>" + lab[0] + "</span><i style='background:" + g + "'></i><span>" + lab[2] + "</span><em>" + lab[1] + "</em>" + (S.look !== "e" ? "<span class='df-kdead'></span><em>cracked</em>" : "");
	}
	/* ---- force chart ---- */
	var FX0 = 60, FX1 = 506, FY0 = 16, FY1 = 254;
	function fsc() {
		var fr = B.r.frames, xm = 0, ym = 0; fr.forEach(function (f) { var el = f.dl / B.r.Lg; if (el > xm) xm = el; if (f.F > ym) ym = f.F; });
		xm = niceMax(xm * 100 * 1.05); ym = niceMax((S.units === "ksi" ? ym * 0.1450377 : ym) * 1.12);
		return { xm: xm, ym: ym, x: function (v) { return FX0 + v / xm * (FX1 - FX0); }, y: function (v) { return FY1 - v / ym * (FY1 - FY0); } };
	}
	function niceMax(v) { if (!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
	function tickStep(m) { var s = niceMax(m / 5); return s; }
	function axes(sc, xl, yl, X0, X1, Y0, Y1, y2) {
		var h = [], i, st = tickStep(sc.xm);
		for (i = 0; i <= sc.xm + 1e-9; i += st) h.push("<line x1='" + r1(sc.x(i)) + "' y1='" + Y0 + "' x2='" + r1(sc.x(i)) + "' y2='" + Y1 + "' class='df-grid'/><text x='" + r1(sc.x(i)) + "' y='" + (Y1 + 16) + "' class='df-t' text-anchor='middle'>" + +i.toPrecision(4) + "</text>");
		st = tickStep(sc.ym);
		for (i = 0; i <= sc.ym + 1e-9; i += st) h.push("<line x1='" + X0 + "' y1='" + r1(sc.y(i)) + "' x2='" + X1 + "' y2='" + r1(sc.y(i)) + "' class='df-grid'/><text x='" + (X0 - 6) + "' y='" + r1(sc.y(i) + 4) + "' class='df-t' text-anchor='end'>" + +i.toPrecision(4) + "</text>");
		h.push("<line x1='" + X0 + "' y1='" + Y1 + "' x2='" + X1 + "' y2='" + Y1 + "' class='df-axis'/><line x1='" + X0 + "' y1='" + Y0 + "' x2='" + X0 + "' y2='" + Y1 + "' class='df-axis'/>");
		h.push("<text x='" + ((X0 + X1) / 2) + "' y='" + (Y1 + 34) + "' class='df-t df-tb' text-anchor='middle'>" + xl + "</text><text x='14' y='" + ((Y0 + Y1) / 2) + "' class='df-t df-tb' text-anchor='middle' transform='rotate(-90 14 " + ((Y0 + Y1) / 2) + ")'>" + yl + "</text>");
		return h;
	}
	function barChart() {
		var svg = $("df-fchart"), r = B.r, fr = r.frames, sc = fsc(), cur = Math.floor(clamp(B.p, 0, fr.length - 1)), u = S.units === "ksi" ? 0.1450377 : 1;
		var h = axes(sc, "Elongation (%)", "Stress (" + (S.units === "ksi" ? "ksi" : "MPa") + ")", FX0, FX1, FY0, FY1);
		function pts(a, b) { var p = [r1(sc.x(0)) + "," + r1(sc.y(0))]; for (var i = a; i <= b; i++) p.push(r1(sc.x(fr[i].dl / r.Lg * 100)) + "," + r1(sc.y(fr[i].F * u))); return p.join(" "); }
		h.push("<polyline points='" + pts(0, fr.length - 1) + "' class='df-ghostl'/>", "<polyline points='" + pts(0, cur) + "' class='df-curve'/>");
		var ne = -1; for (var i = 0; i < fr.length; i++) if (fr[i].ea > r.eu + 1e-9) { ne = i; break; }
		function mark(i, t, cls) { if (i < 0 || i >= fr.length) return; var X = sc.x(fr[i].dl / r.Lg * 100), Yv = sc.y(fr[i].F * u); h.push("<circle cx='" + r1(X) + "' cy='" + r1(Yv) + "' r='4.5' class='df-mk " + cls + "'/><text x='" + r1(X + (X > FX1 - 110 ? -8 : 8)) + "' y='" + r1(Yv - 9) + "' class='df-t df-ts' text-anchor='" + (X > FX1 - 110 ? "end" : "start") + "'>" + t + "</text>"); }
		if (!r.notch && ne > 0) mark(ne, "neck starts", "df-mk--n");
		if (r.crackAt != null) mark(r.crackAt, "crack starts in the middle", "df-mk--c");
		var X = sc.x(fr[cur].dl / r.Lg * 100), Yc = sc.y(fr[cur].F * u);
		h.push("<line x1='" + r1(X) + "' y1='" + FY0 + "' x2='" + r1(X) + "' y2='" + FY1 + "' class='df-now'/><circle cx='" + r1(X) + "' cy='" + r1(Yc) + "' r='8' class='df-dot'/>");
		svg.innerHTML = h.join("");
	}
	/* ---- the end view: cross-section at the neck, then the fracture surface ---- */
	function endDraw() {
		var cv = $("df-end"), cw0 = cv.clientWidth || 300, side = cw0 >= 470, o = fitCv(cv, side ? 0.6 : (Math.min(0.72 * cw0, 300) + 140) / cw0, side ? 300 : 460), c = o.c, W = o.w, H = o.h, fr = frame(), r = B.r;
		var R0 = side ? H * 0.42 : Math.min(W * 0.36, (H - 140) / 2), cx = side ? R0 + 18 : W / 2, cy = side ? H / 2 : R0 + 10;
		var LX = side ? cx + R0 + 16 : 10, LY = side ? cy - 26 : 2 * R0 + 36;
		function lab(t, n, col) { c.fillStyle = col || mut; c.fillText(t, LX, LY + n * 16); }
		c.clearRect(0, 0, W, H);
		var metal = dark() ? "#566170" : "#b8c1cc", rim = dark() ? "#8793a3" : "#7b8794", ink = cssv("--df-ink"), mut = cssv("--df-mut");
		var a0 = r.notch ? 1 - r.notch : 1;
		if (!fr.broke) { c.setLineDash([4, 4]); c.strokeStyle = mut; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R0 * a0, 0, 2 * PI); c.stroke(); c.setLineDash([]); }
		var Ra = R0 * fr.a;
		$("df-endcap").textContent = fr.broke ? "The fracture surface (looking at the broken end)" : "Looking down the bar at its thinnest point";
		c.font = "12px system-ui, sans-serif"; c.fillStyle = mut; c.textAlign = "left";
		if (!fr.broke) {
			var gr = c.createRadialGradient(cx - Ra * 0.3, cy - Ra * 0.3, Ra * 0.1, cx, cy, Ra); gr.addColorStop(0, dark() ? "#6b7685" : "#d3dae2"); gr.addColorStop(1, metal);
			c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, Ra, 0, 2 * PI); c.fill(); c.strokeStyle = rim; c.stroke();
			/* voids in the section: random spots, more and bigger where the void fraction of that ring is higher */
			var rnd = V.rng(5), nr = r.nr;
			for (var k = 0; k < 520; k++) {
				var u = Math.sqrt(rnd()), th = rnd() * 2 * PI, j = Math.min(nr - 1, Math.floor(u * nr)), f = fr.f[j];
				if (fr.dead[j]) continue;
				var size = Ra * 0.055 * Math.sqrt(f / 0.05) * (0.5 + rnd());
				if (rnd() > Math.min(1, f * 60 + 0.05) || size < 0.6) continue;
				c.fillStyle = "rgba(20,10,10,0.7)"; c.beginPath(); c.arc(cx + u * Ra * Math.cos(th), cy + u * Ra * Math.sin(th), Math.min(size, Ra * 0.06), 0, 2 * PI); c.fill();
			}
			if (fr.crack > 0) { c.fillStyle = "#0b0b0b"; c.beginPath(); c.arc(cx, cy, fr.crack * Ra, 0, 2 * PI); c.fill(); }
			lab("dashed: the bar before the test", 0); lab(fr.crack > 0 ? "black: the crack inside" : "dark spots: voids", 1); lab("diameter " + pct(fr.a, 0) + " of the start", 2);
			return;
		}
		/* fracture surface: dimples, drawn enlarged so they can be seen */
		Ra = R0 * 0.96; c.fillStyle = mut; c.fillText("enlarged ×" + (1 / fr.a).toFixed(1), side ? 4 : 8, 14);
		var size = 0.55 + 1.1 * (base().ra || 0.6), lip = r.lip || 0.66, dm = V.dimples(17 + V.MATS.indexOf(base()), lip, size, 650);
		c.fillStyle = metal; c.beginPath(); c.arc(cx, cy, Ra, 0, 2 * PI); c.fill();
		c.save(); c.beginPath(); c.arc(cx, cy, Ra, 0, 2 * PI); c.clip();
		c.fillStyle = dark() ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"; c.beginPath(); c.arc(cx, cy, Ra, 0, 2 * PI); c.arc(cx, cy, Ra * lip, 0, 2 * PI, true); c.fill();
		dm.forEach(function (d) {
			var x = cx + d.x * Ra, y = cy + d.y * Ra, rx = d.rx * Ra, ry = d.ry * Ra;
			c.save(); c.translate(x, y); c.rotate(d.a);
			var g = c.createRadialGradient(-rx * 0.15, -ry * 0.15, 0, 0, 0, Math.max(rx, ry));
			g.addColorStop(0, dark() ? "#1f242c" : "#5c6672"); g.addColorStop(0.75, dark() ? "#4a5462" : "#9aa5b1"); g.addColorStop(1, dark() ? "#9aa6b6" : "#e6ebf0");
			c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 2 * PI); c.fill();
			if (d.p) { c.fillStyle = dark() ? "#d6a35c" : "#7a4b14"; c.beginPath(); c.arc(d.lip ? -rx * 0.55 : 0, 0, Math.max(0.8, Math.min(rx, ry) * 0.22), 0, 2 * PI); c.fill(); }
			c.restore();
		});
		c.restore(); c.strokeStyle = rim; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, Ra, 0, 2 * PI); c.stroke();
		c.strokeStyle = mut; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.arc(cx, cy, Ra * lip, 0, 2 * PI); c.stroke(); c.setLineDash([]);
		lab("flat middle: round dimples,", 0, ink); lab("one void each", 1, ink); lab("outer ring (shear lip):", 2.4, ink); lab("stretched dimples", 3.4, ink);
		lab("brown dots: the particles", 4.8); lab("the voids grew from", 5.8);
	}
	function barRO() {
		var fr = frame(), r = B.r;
		$("df-r-s").textContent = stress(fr.F);
		$("df-r-el").textContent = pct(fr.dl / r.Lg, 1);
		$("df-r-d").textContent = pct(fr.a, 0);
		$("df-r-T").textContent = fr.broke ? "–" : fr.Tc.toFixed(2);
		$("df-r-f").textContent = fr.broke ? "–" : fpct(fr.fc);
		$("df-r-c").textContent = fr.broke ? "broken" : fr.crack > 0 ? pct(fr.crack, 0) + " of the width" : "none";
		$("df-bscrubt").textContent = "frame " + (Math.floor(B.p) + 1) + " / " + r.frames.length;
	}
	function barSay() {
		var fr = frame(), r = B.r, m = base(), msg, i = Math.floor(B.p);
		if (B.p <= 0) msg = m.note + " Press Pull the bar. Drag the dot on the force chart (or the slider) to go back and forth.";
		else if (fr.broke) msg = "Broken. The neck got " + pct(1 - fr.a * fr.a / Math.pow(r.notch ? 1 - r.notch : 1, 2), 0) + " smaller in area before it broke. The crack started in the middle of the neck and ran outwards; " + (r.lip ? "the last ring tore along slanted shear lips, giving the cup on one piece and the cone on the other." : "") + " The fracture surface is covered in dimples: each one is half of a void.";
		else if (fr.crack > 0) msg = "The voids in the middle of the neck have linked into a crack. It grows outwards from the centre, just like in the video's simulation, while the outside of the bar still looks whole.";
		else if (r.notch && fr.Tc > 0.6) msg = "The notch makes the middle pulled from every side at once (triaxiality " + fr.Tc.toFixed(2) + "), so the voids there grow fast: a notched bar breaks after much less stretch.";
		else if (fr.ea > r.eu + 0.02) msg = "Necking: the bar thins in one place. In the middle of the neck the metal is pulled from the sides too (triaxiality " + fr.Tc.toFixed(2) + " in the middle, " + fr.Ts.toFixed(2) + " at the surface), so the voids there grow fastest.";
		else msg = "Stretching evenly. The voids grow slowly and new ones open at particles, but the bar still looks the same everywhere.";
		$("df-bsay").textContent = msg;
	}
	function tiles() {
		var r = B.r, fr = r.frames, ne = -1, h = [];
		for (var i = 0; i < fr.length; i++) if (fr[i].ea > r.eu + 1e-9) { ne = i; break; }
		var elb = fr[fr.length - 2] ? fr[fr.length - 2].dl / r.Lg : 0;
		function tile(l, v, s) { h.push("<div class='df-tile'><span>" + l + "</span><b>" + v + "</b>" + (s ? "<small>" + s + "</small>" : "") + "</div>"); }
		tile("Tensile strength (UTS)", stress(r.Fmax), "the top of the force curve");
		tile("Reduction of area", pct(r.RA, 0), "typical for " + base().name.toLowerCase() + ": about " + pct(base().ra, 0));
		tile("Elongation at break", pct(elb, 0), r.notch ? "notched: stretch is concentrated at the notch" : "uniform part " + pct(Math.exp(r.eu) - 1, 0));
		tile("True strain at fracture", r.ef.toFixed(2), "= 2 ln(d₀ / d) at the neck");
		tile("Crack started at", r.crackAt != null ? pct(fr[r.crackAt].dl / r.Lg, 0) + " elongation" : "–", "in the centre of the neck");
		$("df-tiles").innerHTML = h.join("");
	}
	function barTick(ts) {
		if (!B.play) return;
		var dt = B.last ? Math.min(0.05, (ts - B.last) / 1000) : 0; B.last = ts;
		var n = B.r.frames.length; B.p += dt * Math.max(12, n / 9) * S.speed;
		if (B.p >= n - 1) { B.p = n - 1; B.play = false; }
		barDraw(); if (B.play) requestAnimationFrame(barTick);
	}
	$("df-bgo").addEventListener("click", function () { if (B.play) { B.play = false; barDraw(); return; } if (B.p >= B.r.frames.length - 1) B.p = 0; B.play = true; B.last = 0; barDraw(); requestAnimationFrame(barTick); });
	$("df-breset").addEventListener("click", function () { B.play = false; B.p = 0; barDraw(); });
	$("df-bscrub").addEventListener("input", function () { B.play = false; B.p = (B.r.frames.length - 1) * (+this.value) / 1000; barDraw(); });
	$("df-bspeed").value = String(S.speed); $("df-bspeed").addEventListener("change", function () { S.speed = +this.value; save(); });
	function svgPt(svg, ev) { var p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; var m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
	function dragChart(svg, onX) { var on = false; svg.addEventListener("pointerdown", function (ev) { on = true; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } onX(svgPt(svg, ev)); ev.preventDefault(); }); svg.addEventListener("pointermove", function (ev) { if (on) onX(svgPt(svg, ev)); }); ["pointerup", "pointercancel"].forEach(function (t) { svg.addEventListener(t, function () { on = false; }); }); }
	dragChart($("df-fchart"), function (p) {
		var sc = fsc(), r = B.r, x = (p.x - FX0) / (FX1 - FX0) * sc.xm, best = 0, bd = Infinity;
		r.frames.forEach(function (f, i) { var d = Math.abs(f.dl / r.Lg * 100 - x); if (d < bd) { bd = d; best = i; } });
		B.play = false; B.p = best; barDraw();
	});
	[].forEach.call($("df-blook").querySelectorAll("button"), function (b) { b.addEventListener("click", function () { S.look = b.dataset.v; save(); segSync(); barDraw(); }); });

	/* ================= ONE VOID ================= */
	var C = { r: null, p: 0, play: false, last: 0, L1: null, L0: null };
	var LTs = []; for (var t = -0.3; t <= 3.0001; t += 0.1) LTs.push(+t.toFixed(2));
	function cellLocus() { var m = mat(); C.L1 = V.locus(m, 1, LTs); C.L0 = V.locus(m, 0, LTs); }
	function cellBuild() { C.r = V.cell(mat(), S.T, S.xi, { de: 0.004, emax: 4 }); C.p = 0; C.play = false; cellDraw(); }
	var cT = null; function cellRebuild() { clearTimeout(cT); cT = setTimeout(cellBuild, 60); }
	function cidx() { return clamp(Math.floor(C.p), 0, C.r.e.length - 1); }
	var JIT = [1.06, 0.9, 1.12, 0.95, 1.0, 0.88, 1.1, 0.93, 1.04];
	var CX = 190, CY = 190, SPX = 28, VIS = 0.4;
	function cellScale(sh) { return Math.min(240 / (3 * Math.pow(sh.cell[2], VIS)), 240 / (3 * Math.pow(sh.cell[0], VIS)), 82); }
	function cellDraw() {
		if (!C.r) return;
		var svg = $("df-cell"), k = cidx(), r = C.r, sh = r.shape[k], m = mat(), fs = r.fs[k], fc = m.fc || V.FC, h = [];
		/* the cell is drawn with its stretch squashed (strain × 0.4), so a block stretched 10× still fits; the voids keep their size relative to the cell */
		var c1 = Math.pow(sh.cell[0], VIS), c3 = Math.pow(sh.cell[2], VIS), s = cellScale(sh), w = c3 * s, hh = c1 * s, x0 = CX - 1.5 * w, y0 = CY - 1.5 * hh;
		var broken = r.ef != null && k >= r.e.length - 1, link = clamp((fs - fc) / (V.FU - fc), 0, 1);
		h.push("<rect x='" + r1(x0) + "' y='" + r1(y0) + "' width='" + r1(3 * w) + "' height='" + r1(3 * hh) + "' class='df-block'/>");
		for (var q = 1; q < 3; q++) h.push("<line x1='" + r1(x0 + q * w) + "' y1='" + r1(y0) + "' x2='" + r1(x0 + q * w) + "' y2='" + r1(y0 + 3 * hh) + "' class='df-cellg'/><line x1='" + r1(x0) + "' y1='" + r1(y0 + q * hh) + "' x2='" + r1(x0 + 3 * w) + "' y2='" + r1(y0 + q * hh) + "' class='df-cellg'/>");
		for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
			var jt = Math.cbrt(JIT[i * 3 + j]), ry = Math.min(0.49 * hh, sh.r[0] / sh.cell[0] * hh * jt), rx = sh.r[2] / sh.cell[2] * w * jt;
			rx = Math.min(0.5 * w, rx + (0.5 * w - rx) * link * link * (i === 1 ? 1 : 0.8));
			if (ry > 0.3) h.push("<ellipse cx='" + r1(x0 + (j + 0.5) * w) + "' cy='" + r1(y0 + (i + 0.5) * hh) + "' rx='" + r1(Math.max(0.6, rx)) + "' ry='" + r1(Math.max(0.6, ry)) + "' class='df-void'/>");
			if (k === 0 || m.fN > 0) h.push("<circle cx='" + r1(x0 + (j + 0.5) * w) + "' cy='" + r1(y0 + (i + 0.5) * hh) + "' r='" + r1(Math.max(1.4, 0.035 * s)) + "' class='df-part'/>");
		}
		if (broken) {
			var jj = V.rng(3), p = [[x0 - 4, CY]]; for (var q2 = 0; q2 <= 12; q2++) p.push([x0 + 3 * w * q2 / 12, CY + (q2 % 4 === 2 ? 0 : (jj() - 0.5) * hh * 0.25)]); p.push([x0 + 3 * w + 4, CY]);
			h.push("<polyline points='" + p.map(function (a) { return r1(a[0]) + "," + r1(a[1]); }).join(" ") + "' class='df-crack'/>");
		}
		/* the stresses: vertical = largest principal stress σ1, sideways = σ3 (in units of σe); drag the side arrows */
		var st = V.stresses(S.T, S.xi), s1 = st[0], s3 = st[2];
		function arrowV(x, yEdge, dir, val) { var L = clamp(Math.abs(val) * SPX, 6, 110), out = val >= 0, yA = out ? yEdge : yEdge + dir * L, yB = out ? yEdge + dir * L : yEdge; return arrow(x, yA, x, yB); }
		function arrowH(xEdge, y, dir, val) { var L = clamp(Math.abs(val) * SPX, 6, 110), out = val >= 0, xA = out ? xEdge : xEdge + dir * L, xB = out ? xEdge + dir * L : xEdge; return arrow(xA, y, xB, y); }
		function arrow(xa, ya, xb, yb) { var a = Math.atan2(yb - ya, xb - xa), hl = 10; return "<line x1='" + r1(xa) + "' y1='" + r1(ya) + "' x2='" + r1(xb - Math.cos(a) * 6) + "' y2='" + r1(yb - Math.sin(a) * 6) + "' class='df-arl'/><path d='M" + r1(xb) + "," + r1(yb) + " L" + r1(xb - hl * Math.cos(a - 0.45)) + "," + r1(yb - hl * Math.sin(a - 0.45)) + " L" + r1(xb - hl * Math.cos(a + 0.45)) + "," + r1(yb - hl * Math.sin(a + 0.45)) + " Z' class='df-arh'/>"; }
		h.push(arrowV(CX, y0 - 4, -1, s1), arrowV(CX, y0 + 3 * hh + 4, 1, s1));
		var lx = x0 - 6, rx2 = x0 + 3 * w + 6, L3 = clamp(Math.abs(s3) * SPX, 6, 110);
		h.push("<g class='df-sdrag' data-side='1'>" + arrowH(lx, CY, -1, s3) + "<circle cx='" + r1(lx - L3 - 2) + "' cy='" + CY + "' r='12' class='df-handle'/></g>");
		h.push("<g class='df-sdrag' data-side='1'>" + arrowH(rx2, CY, 1, s3) + "<circle cx='" + r1(rx2 + L3 + 2) + "' cy='" + CY + "' r='12' class='df-handle'/></g>");
		h.push("<text x='" + (CX + 12) + "' y='16' class='df-t df-tb'>σ₁ = " + s1.toFixed(2) + " σe</text>");
		h.push("<text x='8' y='" + (CY - 18) + "' class='df-t'>σ₃ = " + s3.toFixed(2) + " σe</text>");
		if (link > 0.05 && !broken) h.push("<text x='" + CX + "' y='372' class='df-t df-tb df-red' text-anchor='middle'>the metal between the voids necks and links</text>");
		else if (broken) h.push("<text x='" + CX + "' y='372' class='df-t df-tb df-red' text-anchor='middle'>linked: a crack</text>");
		else h.push("<text x='" + CX + "' y='372' class='df-t' text-anchor='middle'>pull ↕, sideways ↔ (arrows pointing in = squeezing)</text>");
		if (k > 0) h.push("<text x='372' y='" + (CY + 160) + "' class='df-t df-ts' text-anchor='end'>block's stretch drawn smaller</text>");
		svg.innerHTML = h.join("");
		cellChart(); locusChart(); cellRO();
		$("df-cscrub").value = String(Math.round(r.e.length > 1 ? C.p / (r.e.length - 1) * 1000 : 0));
		$("df-cscrubv").textContent = r.e[k].toFixed(2);
		$("df-cgo").textContent = C.play ? "❚❚ Pause" : k >= r.e.length - 1 ? "↺ Again" : C.p > 0 ? "▶ Carry on" : "▶ Stretch it";
	}
	var GX0 = 60, GX1 = 470, GY0 = 14, GY1 = 214;
	function ccs() {
		var r = C.r, xm = niceMax(r.e[r.e.length - 1] * 1.02), u = S.units === "ksi" ? 0.1450377 : 1, ym = niceMax(Math.max.apply(null, r.sig) * u * 1.12), fm = Math.max.apply(null, r.f), m = mat();
		var f2 = niceMax(Math.max(fm, (m.fc || V.FC) * 1.3) * 100 * 1.08);
		return { xm: xm, ym: ym, f2: f2, u: u, x: function (v) { return GX0 + v / xm * (GX1 - GX0); }, y: function (v) { return GY1 - v / ym * (GY1 - GY0); }, yf: function (v) { return GY1 - v * 100 / f2 * (GY1 - GY0); } };
	}
	function cellChart() {
		var r = C.r, sc = ccs(), k = cidx(), m = mat(), h = axes(sc, "Strain (equivalent)", "Strength σe (" + (S.units === "ksi" ? "ksi" : "MPa") + ")", GX0, GX1, GY0, GY1);
		var st = tickStep(sc.f2); for (var v = 0; v <= sc.f2 + 1e-9; v += st) h.push("<text x='" + (GX1 + 6) + "' y='" + r1(GY1 - v / sc.f2 * (GY1 - GY0) + 4) + "' class='df-t df-tf'>" + +v.toPrecision(3) + "</text>");
		h.push("<text x='" + (GX1 + 40) + "' y='" + ((GY0 + GY1) / 2) + "' class='df-t df-tb df-tf' text-anchor='middle' transform='rotate(90 " + (GX1 + 40) + " " + ((GY0 + GY1) / 2) + ")'>Void fraction f (%)</text>");
		var fcY = sc.yf(m.fc || V.FC); h.push("<line x1='" + GX0 + "' y1='" + r1(fcY) + "' x2='" + GX1 + "' y2='" + r1(fcY) + "' class='df-fcl'/><text x='" + (GX0 + 6) + "' y='" + r1(fcY - 5) + "' class='df-t df-ts df-tf'>fc: voids start to link</text>");
		function pl(arr, fy) { var p = []; for (var i = 0; i < r.e.length; i += Math.max(1, Math.floor(r.e.length / 300))) p.push(r1(sc.x(r.e[i])) + "," + r1(fy(arr[i]))); p.push(r1(sc.x(r.e[r.e.length - 1])) + "," + r1(fy(arr[arr.length - 1]))); return p.join(" "); }
		h.push("<polyline points='" + pl(r.sig, function (v) { return sc.y(v * sc.u); }) + "' class='df-curve'/>", "<polyline points='" + pl(r.f, sc.yf) + "' class='df-fcurve'/>");
		var X = sc.x(r.e[k]); h.push("<line x1='" + r1(X) + "' y1='" + GY0 + "' x2='" + r1(X) + "' y2='" + GY1 + "' class='df-now'/><circle cx='" + r1(X) + "' cy='" + r1(sc.y(r.sig[k] * sc.u)) + "' r='7' class='df-dot'/><circle cx='" + r1(X) + "' cy='" + r1(sc.yf(r.f[k])) + "' r='6' class='df-dot df-dotf'/>");
		if (r.ef == null) h.push("<text x='" + ((GX0 + GX1) / 2) + "' y='" + (GY0 + 16) + "' class='df-t df-tb' text-anchor='middle'>no failure by voids at this loading</text>");
		$("df-cchart").innerHTML = h.join("");
	}
	var LX0 = 60, LX1 = 500, LY0 = 14, LY1 = 214, LTmin = -0.33, LTmax = 3;
	function lsc() { var ym = 0; [C.L1, C.L0].forEach(function (L) { L.forEach(function (p) { if (p.ef && p.ef > ym) ym = p.ef; }); }); ym = niceMax(Math.min(5, ym * 1.08)); return { xm: LTmax, ym: ym, x: function (v) { return LX0 + (v - LTmin) / (LTmax - LTmin) * (LX1 - LX0); }, y: function (v) { return LY1 - Math.min(v, ym) / ym * (LY1 - LY0); } }; }
	function locusChart() {
		if (!C.L1) return;
		var sc = lsc(), h = [], i, st = 0.5;
		for (i = 0; i <= 3; i += st) h.push("<line x1='" + r1(sc.x(i)) + "' y1='" + LY0 + "' x2='" + r1(sc.x(i)) + "' y2='" + LY1 + "' class='df-grid'/><text x='" + r1(sc.x(i)) + "' y='" + (LY1 + 16) + "' class='df-t' text-anchor='middle'>" + i + "</text>");
		st = tickStep(sc.ym); for (i = 0; i <= sc.ym + 1e-9; i += st) h.push("<line x1='" + LX0 + "' y1='" + r1(sc.y(i)) + "' x2='" + LX1 + "' y2='" + r1(sc.y(i)) + "' class='df-grid'/><text x='" + (LX0 - 6) + "' y='" + r1(sc.y(i) + 4) + "' class='df-t' text-anchor='end'>" + +i.toPrecision(3) + "</text>");
		h.push("<line x1='" + LX0 + "' y1='" + LY1 + "' x2='" + LX1 + "' y2='" + LY1 + "' class='df-axis'/><line x1='" + LX0 + "' y1='" + LY0 + "' x2='" + LX0 + "' y2='" + LY1 + "' class='df-axis'/>");
		h.push("<text x='" + ((LX0 + LX1) / 2) + "' y='" + (LY1 + 34) + "' class='df-t df-tb' text-anchor='middle'>Stress triaxiality T</text><text x='14' y='" + ((LY0 + LY1) / 2) + "' class='df-t df-tb' text-anchor='middle' transform='rotate(-90 14 " + ((LY0 + LY1) / 2) + ")'>Strain at failure</text>");
		function line(L, cls) { var segs = [], cur = []; L.forEach(function (p) { if (p.ef) cur.push(r1(sc.x(p.T)) + "," + r1(sc.y(p.ef))); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur); return segs.map(function (s) { return "<polyline points='" + s.join(" ") + "' class='" + cls + "'/>"; }).join(""); }
		h.push(line(C.L1, "df-loc1"), line(C.L0, "df-loc0"));
		h.push("<g class='df-lleg'><line x1='" + (LX1 - 170) + "' y1='22' x2='" + (LX1 - 146) + "' y2='22' class='df-loc1'/><text x='" + (LX1 - 140) + "' y='26' class='df-t df-ts'>pulled round bar (ξ = 1)</text><line x1='" + (LX1 - 170) + "' y1='40' x2='" + (LX1 - 146) + "' y2='40' class='df-loc0'/><text x='" + (LX1 - 140) + "' y='44' class='df-t df-ts'>shear / plate (ξ = 0)</text></g>");
		V.LOADS.forEach(function (l) { if (l.T < -0.3) return; h.push("<line x1='" + r1(sc.x(l.T)) + "' y1='" + LY1 + "' x2='" + r1(sc.x(l.T)) + "' y2='" + (LY1 - 7) + "' class='df-axis'/>"); });
		var X = sc.x(S.T); h.push("<line x1='" + r1(X) + "' y1='" + LY0 + "' x2='" + r1(X) + "' y2='" + LY1 + "' class='df-now df-nowd'/><circle cx='" + r1(X) + "' cy='" + (LY1 - 2) + "' r='9' class='df-handle'/>");
		if (C.r && C.r.ef) h.push("<circle cx='" + r1(X) + "' cy='" + r1(sc.y(C.r.ef)) + "' r='7' class='df-dot'/><text x='" + r1(X + (X > LX1 - 90 ? -10 : 10)) + "' y='" + r1(sc.y(C.r.ef) - 9) + "' class='df-t df-tb' text-anchor='" + (X > LX1 - 90 ? "end" : "start") + "'>" + C.r.ef.toFixed(2) + "</text>");
		$("df-locus").innerHTML = h.join("");
	}
	function cellRO() {
		var r = C.r, k = cidx(), sh = r.shape[k], s0 = r.shape[0], m = mat(), fc = m.fc || V.FC;
		var R = Math.cbrt(sh.r[0] * sh.r[1] * sh.r[2]), R0 = Math.cbrt(s0.r[0] * s0.r[1] * s0.r[2]) || 1e-9;
		$("df-c-f").textContent = fpct(r.f[k]);
		$("df-c-r").textContent = R0 > 1e-6 ? "× " + (R / R0).toFixed(2) : "–";
		var mx = Math.max(sh.r[0], sh.r[1], sh.r[2]), mn = Math.min(sh.r[0], sh.r[1], sh.r[2]); $("df-c-a").textContent = mn > 0 ? (mx / mn).toFixed(2) : "–";
		var x = V.yieldRatio(r.fs[k], r.T); $("df-c-s").textContent = pct(x, 0);
		var stg = r.ef != null && k >= r.e.length - 1 ? 3 : r.f[k] >= fc ? 2 : r.f[k] > r.f[0] * 1.4 + 1e-5 ? 1 : 0;
		[].forEach.call($("df-stages").children, function (li) { var s = +li.dataset.s; li.classList.toggle("is-now", s === stg); li.classList.toggle("is-done", s < stg); });
		var L = V.LOADS.filter(function (l) { return l.id === S.load; })[0], msg = L ? L.note + " " : "";
		if (stg === 3) msg += "The voids have linked into a crack at a strain of " + r.ef.toFixed(2) + ".";
		else if (stg === 2) msg += "Coalescence: the void fraction passed fc, the thin metal between neighbouring voids necks down and the block loses its strength fast.";
		else if (stg === 1) msg += S.T > 1 ? "High triaxiality: the voids swell up almost like balloons." : S.T < 0.1 ? "Little or no pull from the sides: the voids get longer and flatter instead of bigger." : "Growth: the voids get bigger and longer along the pull.";
		else msg += S.T < 0 ? "Squeezing: the voids get smaller." : "Voids start at hard particles (brown dots) that break or come loose from the metal.";
		$("df-csay").textContent = msg;
	}
	function cellTick(ts) {
		if (!C.play) return;
		var dt = C.last ? Math.min(0.05, (ts - C.last) / 1000) : 0; C.last = ts;
		var n = C.r.e.length; C.p += dt * n / 7 * S.speed;
		if (C.p >= n - 1) { C.p = n - 1; C.play = false; }
		cellDraw(); if (C.play) requestAnimationFrame(cellTick);
	}
	$("df-cgo").addEventListener("click", function () { if (C.play) { C.play = false; cellDraw(); return; } if (C.p >= C.r.e.length - 1) C.p = 0; C.play = true; C.last = 0; cellDraw(); requestAnimationFrame(cellTick); });
	$("df-creset").addEventListener("click", function () { C.play = false; C.p = 0; cellDraw(); });
	$("df-cscrub").addEventListener("input", function () { C.play = false; C.p = (C.r.e.length - 1) * (+this.value) / 1000; cellDraw(); });
	dragChart($("df-cchart"), function (p) { var sc = ccs(), e = (p.x - GX0) / (GX1 - GX0) * sc.xm, r = C.r, best = 0, bd = Infinity; r.e.forEach(function (v, i) { var d = Math.abs(v - e); if (d < bd) { bd = d; best = i; } }); C.play = false; C.p = best; cellDraw(); });
	function setT(T, keepLoad) { S.T = clamp(Math.round(T * 100) / 100, -0.33, 3); if (!keepLoad) S.load = ""; save(); ctlSync(); cellRebuild(); }
	dragChart($("df-locus"), function (p) { setT(LTmin + (p.x - LX0) / (LX1 - LX0) * (LTmax - LTmin)); });
	(function () {
		var svg = $("df-cell"), on = false;
		svg.addEventListener("pointerdown", function (ev) { if (!ev.target.closest(".df-sdrag")) return; on = true; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } ev.preventDefault(); });
		svg.addEventListener("pointermove", function (ev) {
			if (!on) return; var p = svgPt(svg, ev), sh = C.r.shape[cidx()], s = cellScale(sh), half = 1.5 * Math.pow(sh.cell[2], VIS) * s + 6;
			var d = Math.abs(p.x - CX) - half, s3 = d / SPX, c3 = V.lodeDirs(S.xi)[2];
			S.T = clamp(s3 - 2 / 3 * c3, -0.33, 3); S.load = ""; ctlSync(); C.r = V.cell(mat(), S.T, S.xi, { de: 0.008, emax: 4 }); C.p = 0; cellDraw();
		});
		["pointerup", "pointercancel"].forEach(function (t) { svg.addEventListener(t, function () { if (on) { on = false; S.T = Math.round(S.T * 100) / 100; save(); cellBuild(); } }); });
	})();
	/* load chips */
	$("df-loads").innerHTML = "<span class='df-try__l'>How it is loaded:</span>" + V.LOADS.map(function (l) { return "<button type='button' class='tu-chip' data-load='" + l.id + "'>" + l.name + "</button>"; }).join("");
	$("df-loads").addEventListener("click", function (e) { var b = e.target.closest("[data-load]"); if (!b) return; var l = V.LOADS.filter(function (x) { return x.id === b.dataset.load; })[0]; S.load = l.id; S.T = l.T; S.xi = l.xi; save(); ctlSync(); cellBuild(); C.play = true; C.last = 0; requestAnimationFrame(cellTick); });
	$("df-T").addEventListener("input", function () { setT(+this.value); });
	$("df-xi").addEventListener("input", function () { S.xi = +this.value; S.load = ""; save(); ctlSync(); cellRebuild(); });

	/* ================= SETTINGS ================= */
	var sel = $("df-mat"); sel.innerHTML = V.MATS.map(function (m) { return "<option value='" + m.id + "'>" + m.name + "</option>"; }).join("");
	function ctlSync() {
		var m = mat(); sel.value = S.m; $("df-matnote").textContent = base().note;
		$("df-f0").value = String(Math.round(posFromF0(m.f0))); $("df-f0v").textContent = fpct(m.f0);
		$("df-fN").value = String(Math.round(posFromFN(m.fN))); $("df-fNv").textContent = m.fN > 0 ? fpct(m.fN) : "none";
		$("df-n").value = String(m.n); $("df-nv").textContent = m.n.toFixed(2);
		$("df-T").value = String(S.T); $("df-Tv").textContent = S.T.toFixed(2); $("df-xi").value = String(S.xi); $("df-xiv").textContent = S.xi.toFixed(2);
		[].forEach.call($("df-loads").querySelectorAll("[data-load]"), function (b) { b.setAttribute("aria-pressed", b.dataset.load === S.load ? "true" : "false"); });
		segSync();
	}
	function segSync() {
		[["df-blook", S.look], ["df-notch", S.notch], ["df-units", S.units]].forEach(function (a) { [].forEach.call($(a[0]).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.v === a[1] ? "true" : "false"); }); });
	}
	sel.addEventListener("change", function () { S.m = this.value; S.f0 = S.fN = S.n = null; save(); ctlSync(); barRebuild(); });
	$("df-f0").addEventListener("input", function () { S.f0 = f0FromPos(+this.value); save(); ctlSync(); barRebuild(); });
	$("df-fN").addEventListener("input", function () { S.fN = fNFromPos(+this.value); save(); ctlSync(); barRebuild(); });
	$("df-n").addEventListener("input", function () { S.n = +this.value; save(); ctlSync(); barRebuild(); });
	$("df-defaults").addEventListener("click", function () { S.f0 = S.fN = S.n = null; save(); ctlSync(); barRebuild(); });
	[].forEach.call($("df-notch").querySelectorAll("button"), function (b) { b.addEventListener("click", function () { S.notch = b.dataset.v; save(); segSync(); barRebuild(); }); });
	[].forEach.call($("df-units").querySelectorAll("button"), function (b) { b.addEventListener("click", function () { S.units = b.dataset.v; save(); segSync(); barDraw(); tiles(); cellDraw(); }); });
	$("df-link").addEventListener("click", function () {
		var q = "?m=" + S.m + (S.notch !== "none" ? "&notch=" + S.notch : "") + (S.load ? "&load=" + S.load : "&T=" + S.T + "&xi=" + S.xi), u = location.origin + location.pathname + q;
		(navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", u); });
	});
	root.querySelector(".df-try").addEventListener("click", function (e) {
		var b = e.target.closest("[data-try]"); if (!b) return; var t = b.dataset.try;
		S.f0 = S.fN = S.n = null;
		if (t === "copper") { S.m = "copper"; S.notch = "none"; } else if (t === "notch") { S.m = "steel"; S.notch = "sharp"; } else if (t === "dirty") { S.m = "dirty"; S.notch = "none"; } else if (t === "strong") { S.m = "s4340"; S.notch = "none"; } else { S.m = "steel"; S.notch = "none"; }
		save(); ctlSync(); clearTimeout(rebT); barBuild(); cellLocus(); cellBuild(); B.play = true; B.last = 0; requestAnimationFrame(barTick);
	});
	/* the video: thumbnail until clicked */
	$("df-yt").addEventListener("click", function () { var id = this.dataset.id, f = document.createElement("iframe"); f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0"; f.allow = "autoplay; encrypted-media; picture-in-picture"; f.allowFullscreen = true; f.className = "df-ytf"; f.title = "How and When Metals Fail"; this.replaceWith(f); });

	/* Fill window / full screen for both views (main_js/panel-view.js), redraw on resize and theme change */
	function addPanels() {
		if (!window.MESPanel) return false;
		[["df-bview", "df-bbar", "df-bstage", function () { barDraw(); }], ["df-cview", "df-cbar", "df-cstage", function () { cellDraw(); }]].forEach(function (a) {
			var v = $(a[0]); if (v.__mesPanel) return; window.MESPanel.add(v, { bar: $(a[1]).querySelector(".df-vbtns"), stage: $(a[2]), onChange: function () { setTimeout(a[3], 40); } });
		});
		return true;
	}
	if (!addPanels()) { window.addEventListener("load", addPanels); setTimeout(addPanels, 1500); }
	var rz = null; function redraw() { clearTimeout(rz); rz = setTimeout(function () { barDraw(); cellDraw(); }, 60); }
	if (window.ResizeObserver) new ResizeObserver(redraw).observe($("df-bstage")); else window.addEventListener("resize", redraw);
	new MutationObserver(redraw).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	ctlSync(); barBuild(); cellLocus(); cellBuild();
	window.MESVoidDebug = { S: S, B: B, C: C, bar: function (p) { B.p = p; barDraw(); }, cell: function (p) { C.p = p; cellDraw(); } };
})();
