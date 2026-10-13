/* Electromagnetic fields maths (pure; node: require('./tool_apps_src/electromagnetic-fields/lib.js')).
   SI units throughout. Electrostatics (point charges 1/r^2 or infinite line charges 1/r), field lines, contours, Gauss's law fluxes,
   wires (Biot-Savart / Ampere), the Boris particle pusher (relativistic option) and a 2D TMz Yee FDTD Maxwell solver. */
(function (root) {
	"use strict";
	var PI = Math.PI, TAU = 2 * PI;
	var K = 8.9875517923e9, EPS0 = 8.8541878128e-12, MU0 = 1.25663706212e-6, C = 299792458, QE = 1.602176634e-19, ME = 9.1093837015e-31, MP = 1.67262192369e-27, AMU = 1.66053906660e-27;

	/* ---------- electrostatics ---------- */
	/* charges: [{x, y, q}] in metres / coulombs (mode "3d": point charges; "2d": infinite line charges, q = coulombs per metre) */
	function fieldAt(ch, x, y, mode, skip) {
		var ex = 0, ey = 0, i, c, dx, dy, r2, f;
		for (i = 0; i < ch.length; i++) {
			if (i === skip) continue; c = ch[i]; dx = x - c.x; dy = y - c.y; r2 = dx * dx + dy * dy; if (r2 < 1e-18) continue;
			f = mode === "2d" ? c.q / (TAU * EPS0 * r2) : K * c.q / (r2 * Math.sqrt(r2)); ex += f * dx; ey += f * dy;
		}
		return [ex, ey];
	}
	function potentialAt(ch, x, y, mode) {
		var v = 0, i, c, r;
		for (i = 0; i < ch.length; i++) { c = ch[i]; r = Math.max(1e-9, Math.hypot(x - c.x, y - c.y)); v += mode === "2d" ? -c.q / (TAU * EPS0) * Math.log(r) : K * c.q / r; }
		return v;
	}
	function forceOn(ch, i, mode) { var e = fieldAt(ch, ch[i].x, ch[i].y, mode, i); return [ch[i].q * e[0], ch[i].q * e[1]]; }
	/* follow the field direction from (x0, y0) (dir +1 along E, -1 against) until near a charge, outside the box or max steps; returns flat [x, y, x, y ...] */
	function traceLine(ch, x0, y0, dir, mode, box, h, maxSteps, stopR) {
		var pts = [x0, y0], x = x0, y = y0, n, e, m, k1x, k1y, k2x, k2y, i, near;
		function d(px, py) { var f = fieldAt(ch, px, py, mode), m = Math.hypot(f[0], f[1]); return m > 0 ? [dir * f[0] / m, dir * f[1] / m] : [0, 0]; }
		for (n = 0; n < maxSteps; n++) {
			e = d(x, y); if (e[0] === 0 && e[1] === 0) break;
			k1x = e[0]; k1y = e[1]; var f2 = d(x + 0.5 * h * k1x, y + 0.5 * h * k1y); k2x = f2[0]; k2y = f2[1];
			var f3 = d(x + 0.5 * h * k2x, y + 0.5 * h * k2y), f4 = d(x + h * f3[0], y + h * f3[1]);
			x += h / 6 * (k1x + 2 * k2x + 2 * f3[0] + f4[0]); y += h / 6 * (k1y + 2 * k2y + 2 * f3[1] + f4[1]);
			pts.push(x, y);
			if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) break;
			near = false; for (i = 0; i < ch.length; i++) if (Math.hypot(x - ch[i].x, y - ch[i].y) < stopR) { near = true; break; } if (near) break;
		}
		return pts;
	}
	/* field lines for a set of charges: from every positive charge outward (or, with only negative charges, backwards from them), a number of lines proportional to |q| */
	function fieldLines(ch, mode, box, nMax, stopR, h) {
		var lines = [], pos = ch.filter(function (c) { return c.q > 0; }), src = pos.length ? pos : ch.filter(function (c) { return c.q < 0; }), dir = pos.length ? 1 : -1, qmax = 0, i, k;
		src.forEach(function (c) { if (Math.abs(c.q) > qmax) qmax = Math.abs(c.q); });
		var maxSteps = Math.round(4 * Math.hypot(box[2] - box[0], box[3] - box[1]) / h);
		src.forEach(function (c, ci) {
			var n = Math.max(4, Math.round(nMax * Math.abs(c.q) / qmax)), phase = 0.37 + ci * 0.21;
			for (k = 0; k < n; k++) { var a = phase + k * TAU / n; lines.push(traceLine(ch, c.x + 1.6 * stopR * Math.cos(a), c.y + 1.6 * stopR * Math.sin(a), dir, mode, box, h, maxSteps, stopR)); }
		});
		return lines;
	}
	/* marching squares: for each level, segments [x1, y1, x2, y2, ...] of fn(x, y) = level on a regular grid over box (the grid is sampled once) */
	function contours(fn, box, nx, ny, levels) {
		var xs = box[0], ys = box[1], dx = (box[2] - box[0]) / nx, dy = (box[3] - box[1]) / ny, F = new Float64Array((nx + 1) * (ny + 1)), i, j, out = [];
		for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) F[j * (nx + 1) + i] = fn(xs + i * dx, ys + j * dy);
		levels.forEach(function (level) {
			var seg = [];
			function lerp(a, b, fa, fb) { var t = (level - fa) / (fb - fa); return a + t * (b - a); }
			for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
				var f00 = F[j * (nx + 1) + i], f10 = F[j * (nx + 1) + i + 1], f01 = F[(j + 1) * (nx + 1) + i], f11 = F[(j + 1) * (nx + 1) + i + 1];
				var idx = (f00 > level ? 1 : 0) | (f10 > level ? 2 : 0) | (f11 > level ? 4 : 0) | (f01 > level ? 8 : 0); if (idx === 0 || idx === 15) continue;
				var x0 = xs + i * dx, x1 = x0 + dx, y0 = ys + j * dy, y1 = y0 + dy, e = [];
				var pb = [lerp(x0, x1, f00, f10), y0], pr = [x1, lerp(y0, y1, f10, f11)], pt = [lerp(x0, x1, f01, f11), y1], pl = [x0, lerp(y0, y1, f00, f01)];
				switch (idx) {
					case 1: case 14: e = [pl, pb]; break; case 2: case 13: e = [pb, pr]; break; case 3: case 12: e = [pl, pr]; break; case 4: case 11: e = [pr, pt]; break;
					case 6: case 9: e = [pb, pt]; break; case 7: case 8: e = [pl, pt]; break;
					case 5: e = [pl, pt, pb, pr]; break; case 10: e = [pl, pb, pt, pr]; break;
				}
				for (var k = 0; k < e.length; k += 2) seg.push(e[k][0], e[k][1], e[k + 1][0], e[k + 1][1]);
			}
			out.push(seg);
		});
		return out;
	}
	function contour(fn, box, nx, ny, level) { return contours(fn, box, nx, ny, [level])[0]; }
	/* flux through a sphere (3d) or a circle per unit length (2d), by quadrature; also the enclosed charge / eps0 */
	function gauss(ch, cx, cy, R, mode) {
		var flux = 0, i, j, nq = 0, c;
		ch.forEach(function (c) { if (Math.hypot(c.x - cx, c.y - cy) < R) nq += c.q; });
		if (mode === "2d") { var N = 720; for (i = 0; i < N; i++) { var a = (i + 0.5) * TAU / N, nxv = Math.cos(a), nyv = Math.sin(a), e = fieldAt(ch, cx + R * nxv, cy + R * nyv, "2d"); flux += (e[0] * nxv + e[1] * nyv) * R * TAU / N; } }
		else {
			var NT = 90, NP = 180; for (i = 0; i < NT; i++) { var th = (i + 0.5) * PI / NT, s = Math.sin(th), cz = Math.cos(th); for (j = 0; j < NP; j++) { var ph = (j + 0.5) * TAU / NP, nx2 = s * Math.cos(ph), ny2 = s * Math.sin(ph); /* the field is in the plane z = 0 only for charges in the plane: add the z part */
				var px = cx + R * nx2, py = cy + R * ny2, pz = R * cz, ex = 0, ey = 0, ez = 0; for (var k = 0; k < ch.length; k++) { c = ch[k]; var dx = px - c.x, dy = py - c.y, r2 = dx * dx + dy * dy + pz * pz, f = K * c.q / (r2 * Math.sqrt(r2)); ex += f * dx; ey += f * dy; ez += f * pz; }
				flux += (ex * nx2 + ey * ny2 + ez * cz) * R * R * s * (PI / NT) * (TAU / NP); } }
		}
		return { flux: flux, enclosed: nq, expected: nq / EPS0 };
	}
	/* a free charge moving in the field of fixed charges (leapfrog with an adaptive step); p = {x, y, vx, vy, q, m} */
	function stepFree(p, ch, mode, T) {
		var done = 0, guard = 0;
		while (done < T - 1e-18 && guard++ < 4000) {
			var tmin = Infinity, i, c, r, a;
			for (i = 0; i < ch.length; i++) { c = ch[i]; r = Math.max(1e-9, Math.hypot(p.x - c.x, p.y - c.y)); a = Math.abs(p.q * c.q) * (mode === "2d" ? 1 / (TAU * EPS0 * r) : K / (r * r)) / p.m; var t1 = Math.sqrt(r / Math.max(a, 1e-300)), t2 = r / Math.max(Math.hypot(p.vx, p.vy), 1e-300); tmin = Math.min(tmin, t1, t2); }
			var dt = Math.min(T - done, 0.02 * tmin); if (!(dt > 0)) dt = T - done;
			var e = fieldAt(ch, p.x, p.y, mode); p.vx += 0.5 * dt * p.q * e[0] / p.m; p.vy += 0.5 * dt * p.q * e[1] / p.m; p.x += dt * p.vx; p.y += dt * p.vy;
			e = fieldAt(ch, p.x, p.y, mode); p.vx += 0.5 * dt * p.q * e[0] / p.m; p.vy += 0.5 * dt * p.q * e[1] / p.m; done += dt;
		}
		return done;
	}

	/* ---------- wires perpendicular to the plane (current out of the page for I > 0) ---------- */
	function wireB(w, x, y) { var bx = 0, by = 0, i, dx, dy, r2, c; for (i = 0; i < w.length; i++) { dx = x - w[i].x; dy = y - w[i].y; r2 = dx * dx + dy * dy; if (r2 < 1e-18) continue; c = MU0 * w[i].I / (TAU * r2); bx += -c * dy; by += c * dx; } return [bx, by]; }
	function wireA(w, x, y) { var a = 0, i, r; for (i = 0; i < w.length; i++) { r = Math.max(1e-9, Math.hypot(x - w[i].x, y - w[i].y)); a += -MU0 * w[i].I / TAU * Math.log(r); } return a; }
	function ampere(w, cx, cy, R) { var N = 720, s = 0, i, enc = 0; for (i = 0; i < N; i++) { var a = (i + 0.5) * TAU / N, b = wireB(w, cx + R * Math.cos(a), cy + R * Math.sin(a)); s += (-b[0] * Math.sin(a) + b[1] * Math.cos(a)) * R * TAU / N; } w.forEach(function (q) { if (Math.hypot(q.x - cx, q.y - cy) < R) enc += q.I; } ); return { integral: s, enclosed: enc, expected: MU0 * enc }; }
	/* force per metre on wire i from the others, vector in the plane (attraction for parallel currents) */
	function wireForce(w, i) { var fx = 0, fy = 0, j, dx, dy, d, f; for (j = 0; j < w.length; j++) { if (j === i) continue; dx = w[j].x - w[i].x; dy = w[j].y - w[i].y; d = Math.hypot(dx, dy); if (d < 1e-12) continue; f = MU0 * w[i].I * w[j].I / (TAU * d); fx += f * dx / d; fy += f * dy / d; } return [fx, fy]; }

	/* ---------- charged particle: Boris pusher (momentum per mass u = gamma v; rel = false uses gamma = 1) ---------- */
	function borisStep(p, E, B, dt, rel) {
		var qm = p.q / p.m, hx = qm * E[0] * dt / 2, hy = qm * E[1] * dt / 2, hz = qm * (E[2] || 0) * dt / 2;
		var ux = p.ux + hx, uy = p.uy + hy, uz = p.uz + hz, g = rel ? Math.sqrt(1 + (ux * ux + uy * uy + uz * uz) / (C * C)) : 1;
		var tx = qm * B[0] * dt / (2 * g), ty = qm * B[1] * dt / (2 * g), tz = qm * B[2] * dt / (2 * g), t2 = tx * tx + ty * ty + tz * tz, sx = 2 * tx / (1 + t2), sy = 2 * ty / (1 + t2), sz = 2 * tz / (1 + t2);
		var vx = ux + (uy * tz - uz * ty), vy = uy + (uz * tx - ux * tz), vz = uz + (ux * ty - uy * tx);
		var wx = ux + (vy * sz - vz * sy), wy = uy + (vz * sx - vx * sz), wz = uz + (vx * sy - vy * sx);
		p.ux = wx + hx; p.uy = wy + hy; p.uz = wz + hz;
		g = rel ? Math.sqrt(1 + (p.ux * p.ux + p.uy * p.uy + p.uz * p.uz) / (C * C)) : 1;
		p.x += p.ux / g * dt; p.y += p.uy / g * dt; p.z += p.uz / g * dt;
	}
	function speedOf(p, rel) { var g = rel ? Math.sqrt(1 + (p.ux * p.ux + p.uy * p.uy + p.uz * p.uz) / (C * C)) : 1; return Math.sqrt(p.ux * p.ux + p.uy * p.uy + p.uz * p.uz) / g; }
	function makeParticle(q, m, x, y, speed, angle, rel) { var g = rel ? 1 / Math.sqrt(1 - Math.min(0.999999999999, speed * speed / (C * C))) : 1; return { q: q, m: m, x: x, y: y, z: 0, ux: g * speed * Math.cos(angle), uy: g * speed * Math.sin(angle), uz: 0 }; }
	function cyclotron(q, m, B, v, rel) {
		var g = rel ? 1 / Math.sqrt(1 - Math.min(0.999999999999, v * v / (C * C))) : 1, w = Math.abs(q) * B / (g * m);
		return { gamma: g, radius: g * m * v / (Math.abs(q) * Math.abs(B)), omega: w, period: TAU / w, freq: w / TAU };
	}

	/* ---------- 2D TMz Yee FDTD (units: c = 1, cell = 1, time step = S = 0.5) ---------- */
	function Yee(nx, ny) {
		this.nx = nx; this.ny = ny; var n = nx * ny; this.S = 0.5; this.t = 0; this.step = 0;
		this.ez = new Float32Array(n); this.hx = new Float32Array(n); this.hy = new Float32Array(n); this.epsr = new Float32Array(n).fill(1); this.sig = new Float32Array(n); this.pec = new Uint8Array(n);
		this.sponge = 18; this.sigAbs = new Float32Array(n); this.avg = new Float32Array(n); this.buildAbs(); this.build();
		this.sources = []; this.energyCache = 0;
	}
	Yee.prototype.buildAbs = function () {
		var nx = this.nx, ny = this.ny, L = this.sponge, i, j, d, s; this.sigAbs.fill(0);
		for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { d = Math.min(i, nx - 1 - i, j, ny - 1 - j); if (d < L) { s = Math.pow((L - d) / L, 3) * 0.9; this.sigAbs[j * nx + i] = s; } }
	};
	Yee.prototype.build = function () {
		var n = this.nx * this.ny, S = this.S, i, ca = this.ca || (this.ca = new Float32Array(n)), cb = this.cb || (this.cb = new Float32Array(n)), ha = this.ha || (this.ha = new Float32Array(n)), hb = this.hb || (this.hb = new Float32Array(n));
		for (i = 0; i < n; i++) { var e = this.epsr[i], s = this.sig[i] + this.sigAbs[i] * e, sm = this.sigAbs[i]; var k = s * S / (2 * e); ca[i] = (1 - k) / (1 + k); cb[i] = (S / e) / (1 + k); var km = sm * S / 2; ha[i] = (1 - km) / (1 + km); hb[i] = S / (1 + km); }
	};
	/* sources: {type: "point"|"line", x, y, y0, y1, amp, w (rad per time unit), phase, pulse (cycles, 0 = continuous), t0} */
	Yee.prototype.stepOnce = function () {
		var nx = this.nx, ny = this.ny, ez = this.ez, hx = this.hx, hy = this.hy, ca = this.ca, cb = this.cb, ha = this.ha, hb = this.hb, i, j, p;
		for (j = 0; j < ny - 1; j++) { p = j * nx; for (i = 0; i < nx - 1; i++, p++) { hx[p] = ha[p] * hx[p] - hb[p] * (ez[p + nx] - ez[p]); hy[p] = ha[p] * hy[p] + hb[p] * (ez[p + 1] - ez[p]); } }
		for (j = 1; j < ny; j++) { p = j * nx + 1; for (i = 1; i < nx; i++, p++) ez[p] = ca[p] * ez[p] + cb[p] * ((hy[p] - hy[p - 1]) - (hx[p] - hx[p - nx])); }
		this.t += this.S; this.step++;
		var t = this.t, k, s, a, env;
		for (k = 0; k < this.sources.length; k++) {
			s = this.sources[k]; env = 1; if (s.pulse > 0) { var tt = t - (s.t0 || 0), len = s.pulse * 2 * PI / s.w; env = tt < 0 || tt > len ? 0 : Math.pow(Math.sin(PI * tt / len), 2); } else env = Math.min(1, t * s.w / (4 * PI));
			a = s.amp * env * Math.sin(s.w * t + (s.phase || 0)); if (a === 0) continue;
			if (s.type === "line") { for (j = s.y0; j <= s.y1; j++) if (!this.pec[j * nx + s.x]) ez[j * nx + s.x] += a; } else { if (!this.pec[s.y * nx + s.x]) ez[s.y * nx + s.x] += a; }
		}
		var pecA = this.pec, n = nx * ny; for (p = 0; p < n; p++) if (pecA[p]) ez[p] = 0;
		var av = this.avg, al = 0.02; for (p = 0; p < n; p++) av[p] += al * (ez[p] * ez[p] - av[p]);
	};
	Yee.prototype.run = function (n) { for (var i = 0; i < n; i++) this.stepOnce(); };
	Yee.prototype.energy = function () { var n = this.nx * this.ny, e = 0, p; for (p = 0; p < n; p++) e += 0.5 * (this.epsr[p] * this.ez[p] * this.ez[p] + this.hx[p] * this.hx[p] + this.hy[p] * this.hy[p]); return e; };
	Yee.prototype.reset = function () { this.ez.fill(0); this.hx.fill(0); this.hy.fill(0); this.avg.fill(0); this.t = 0; this.step = 0; };
	/* wavelength (cells) -> angular frequency per time unit for the grid (c = 1) */
	function omegaFor(lambdaCells) { return TAU / lambdaCells; }

	var api = { K: K, EPS0: EPS0, MU0: MU0, C: C, QE: QE, ME: ME, MP: MP, AMU: AMU, fieldAt: fieldAt, potentialAt: potentialAt, forceOn: forceOn, traceLine: traceLine, fieldLines: fieldLines, contour: contour, contours: contours, gauss: gauss, stepFree: stepFree,
		wireB: wireB, wireA: wireA, ampere: ampere, wireForce: wireForce, borisStep: borisStep, speedOf: speedOf, makeParticle: makeParticle, cyclotron: cyclotron, Yee: Yee, omegaFor: omegaFor };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESEM = api;
})(typeof window !== "undefined" ? window : this);

/* Electromagnetic Fields UI: electric charges (field lines, equipotentials, Gauss), currents (Ampere), a charged particle (Boris pusher), Maxwell waves (2D FDTD) and a 3D plane wave.
   Maths: MESEM (node-tested: tool_apps_src/electromagnetic-fields-tests.js). State: localStorage mes-electromagnetic-fields:v1; links ?tab=... plus each tab's keys. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("em"); if (!root) return;
	var M = window.MESEM, PI = Math.PI, TAU = 2 * PI, KEY = "mes-electromagnetic-fields:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(v, lo, hi, d) { if (v === null || v === undefined || v === "") return d; v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	var q = new URLSearchParams(location.search), saved = sget(), toastT, coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
	function toast(msg) { var t = $("em-toast"); if (!t) { t = document.createElement("div"); t.id = "em-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copyLink(params) {
		var u = new URL(location.href); u.search = ""; u.searchParams.set("tab", tab); for (var k in params) u.searchParams.set(k, params[k]);
		var url = u.toString(), done = function () { toast("Link copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	}
	var PFX = [[1e-15, "f"], [1e-12, "p"], [1e-9, "n"], [1e-6, "μ"], [1e-3, "m"], [1, ""], [1e3, "k"], [1e6, "M"], [1e9, "G"], [1e12, "T"], [1e15, "P"], [1e18, "E"]];
	function si(x, unit, d) {
		if (!isFinite(x)) return "∞ " + unit; if (x === 0) return "0 " + unit; var a = Math.abs(x), p = PFX[5], i; for (i = 0; i < PFX.length; i++) if (a >= PFX[i][0] * 0.9995) p = PFX[i];
		return (Number((x / p[0]).toPrecision(d || 3))).toString().replace("-", "−") + " " + p[1] + unit;
	}
	function sig(x, d) { if (!isFinite(x)) return "∞"; if (x === 0) return "0"; var a = Math.abs(x); if (a >= 1e5 || a < 1e-3) { var e = Math.floor(Math.log10(a)); return (x / Math.pow(10, e)).toPrecision(d || 3).replace(/\.?0+$/, "") + "×10" + String(e).replace("-", "⁻").replace(/\d/g, function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]; }); } return String(Number(x.toPrecision(d || 3))).replace("-", "−"); }
	function ang(x, y) { return ((Math.atan2(y, x) * 180 / PI) + 360) % 360; }

	/* ---------- tabs ---------- */
	var TABS = ["es", "ms", "pt", "wv", "pw"], tab = TABS.indexOf(q.get("tab")) >= 0 ? q.get("tab") : (TABS.indexOf(saved.tab) >= 0 ? saved.tab : "es");
	var showers = {};
	function setTab(t, init) {
		tab = t; sset({ tab: t });
		Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!init) try { var u = new URL(location.href); if (t === "es") u.searchParams.delete("tab"); else u.searchParams.set("tab", t); history.replaceState(null, "", u); } catch (e) {}
		setTimeout(function () { if (showers[t]) showers[t](); }, 0);
	}
	Array.prototype.forEach.call(root.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* ---------- canvas views ---------- */
	function mkView(prefix, aspect, extraH) {
		var cv = $("em-" + prefix + "-c"), st = $("em-" + prefix + "-stage"), V = { cv: cv, cx: cv.getContext("2d"), st: st, W: 600, H: 400, dpr: 1, aspect: aspect };
		V.resize = function () {
			var wrap = st.parentNode, w = wrap.clientWidth; if (!w) return false; var h = Math.round(w / V.aspect); wrap.setAttribute("data-mes-free", "1");
			if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(st, h);
			if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) { var mh = window.innerHeight - 90 - (extraH || 0); if (h > mh) h = mh; }
			st.style.width = w + "px"; st.style.height = h + "px"; V.dpr = Math.min(2, window.devicePixelRatio || 1); V.W = w; V.H = h;
			var cw = Math.round(w * V.dpr), ch = Math.round(h * V.dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; return true; } return false;
		};
		V.pos = function (e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (V.W / r.width), (e.clientY - r.top) * (V.H / r.height)]; };
		V.begin = function () { V.cx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); };
		return V;
	}
	function wirePng(id, V, draw) { $(id).onclick = function () { draw(); V.cv.toBlob(function (bl) { if (!bl) return; var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "electromagnetism.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }); }; }
	function wireFull(id, V) { $(id).onclick = function () { var w = V.st.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); }; }
	function wireTools(id, cb) { var el = $(id); el.onclick = function (e) { var b = e.target.closest("button"); if (!b) return; Array.prototype.forEach.call(el.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); cb(b.dataset.t); }; }
	function chips(el, items, on) { el.innerHTML = items.map(function (it, i) { return '<button type="button" data-i="' + i + '">' + esc(it.name) + "</button>"; }).join(""); el.onclick = function (e) { var b = e.target.closest("button"); if (b) { Array.prototype.forEach.call(el.children, function (x) { x.classList.toggle("is-on", x === b); }); on(items[+b.dataset.i]); } }; }
	function arrow(cx, x0, y0, x1, y1, col, w, hs) { cx.strokeStyle = col; cx.fillStyle = col; cx.lineWidth = w || 1.5; cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke(); var a = Math.atan2(y1 - y0, x1 - x0), h = hs || 7; cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); cx.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45)); cx.closePath(); cx.fill(); }
	function lineW(cx, flat, tr, col, wd) { cx.strokeStyle = col; cx.lineWidth = wd; cx.beginPath(); for (var i = 0; i < flat.length; i += 2) { var p = tr(flat[i], flat[i + 1]); if (i === 0) cx.moveTo(p[0], p[1]); else cx.lineTo(p[0], p[1]); } cx.stroke(); }
	function segs(cx, flat, tr, col, wd) { cx.strokeStyle = col; cx.lineWidth = wd; cx.beginPath(); for (var i = 0; i < flat.length; i += 4) { var a = tr(flat[i], flat[i + 1]), b = tr(flat[i + 2], flat[i + 3]); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); } cx.stroke(); }

	/* =================== ELECTRIC CHARGES =================== */
	var ES = { ch: [], tool: "pos", sel: -1, VW: 4, nLines: 14, lines: true, arrows: false, eq: false, gauss: false, col: "none", mode: "3d", qk: 0, wk: 0.26, gc: { x: 0, y: 0, R: 0.8 }, tests: [], play: true, mouse: null, dirty: true, cache: {}, drag: null, gdirty: true, tcQ: 1e-9, tcM: 1e-3 };
	var ev = mkView("es", 1.6), esHeat = document.createElement("canvas");
	function esT(x, y) { var S = ev.W / ES.VW; return [ev.W / 2 + x * S, ev.H / 2 - y * S]; }
	function esW(px, py) { var S = ev.W / ES.VW; return [(px - ev.W / 2) / S, -(py - ev.H / 2) / S]; }
	function esBox() { var hw = ES.VW / 2, hh = ES.VW / 2 * ev.H / ev.W; return [-hw, -hh, hw, hh]; }
	function qNew() { return Math.pow(10, ES.qk) * 1e-6; }
	var ES_PRE = [
		{ name: "Dipole", ch: [[-0.7, 0, 1], [0.7, 0, -1]], VW: 4 }, { name: "Two positives", ch: [[-0.7, 0, 1], [0.7, 0, 1]], VW: 4 }, { name: "Unequal pair", ch: [[-0.9, 0, 2], [0.9, 0, -1]], VW: 5 },
		{ name: "Quadrupole", ch: [[-0.6, -0.6, 1], [0.6, 0.6, 1], [-0.6, 0.6, -1], [0.6, -0.6, -1]], VW: 4 },
		{ name: "Parallel plates", ch: (function () { var a = []; for (var i = 0; i < 11; i++) { a.push([-1.5 + i * 0.3, 0.7, 0.4]); a.push([-1.5 + i * 0.3, -0.7, -0.4]); } return a; })(), VW: 5 },
		{ name: "Ring and centre", ch: (function () { var a = [[0, 0, -4]]; for (var i = 0; i < 8; i++) a.push([Math.cos(i * TAU / 8), Math.sin(i * TAU / 8), 1]); return a; })(), VW: 4 },
		{ name: "Three charges", ch: [[-1, -0.5, 1], [1, -0.5, 1], [0, 0.9, -2]], VW: 4.5 }
	];
	function esLoad(p) { ES.ch = p.ch.map(function (c) { return { x: c[0], y: c[1], q: c[2] * 1e-6 }; }); ES.VW = p.VW; ES.sel = -1; ES.tests = []; ES.dirty = true; ES.gdirty = true; syncEs(); }
	function syncEs() { $("em-es-q").value = ES.qk; $("em-es-q-v").textContent = sig(Math.pow(10, ES.qk), 2) + " μC"; ES.wk = Math.log10(ES.VW / 4); $("em-es-w").value = ES.wk; $("em-es-w-v").textContent = sig(ES.VW, 3) + " m"; $("em-es-n").value = ES.nLines; $("em-es-n-v").textContent = ES.nLines; selUi(); }
	function selUi() {
		var c = ES.ch[ES.sel]; $("em-es-sel").hidden = !c; if (!c) return; $("em-es-sel-q").textContent = si(c.q, "C", 3); $("em-es-selq").value = Math.max(-10, Math.min(10, c.q * 1e6));
		var f = M.forceOn(ES.ch, ES.sel, ES.mode); $("em-es-sel-f").textContent = "force on it: " + si(Math.hypot(f[0], f[1]), ES.mode === "2d" ? "N/m" : "N", 3) + " at " + ang(f[0], f[1]).toFixed(0) + "°";
	}
	function esRecompute() {
		var box = esBox(), W = ev.W, H = ev.H, C = ES.cache, qmax = 0; ES.ch.forEach(function (c) { qmax = Math.max(qmax, Math.abs(c.q)); }); C.qmax = qmax;
		var sc = ES.VW / W; /* metres per pixel */
		C.lines = ES.lines && ES.ch.length ? M.fieldLines(ES.ch, ES.mode, [box[0] * 1.6, box[1] * 1.6, box[2] * 1.6, box[3] * 1.6], ES.nLines, 7 * sc, 2.2 * sc) : [];
		C.eq = []; if (ES.eq && ES.ch.length) {
			var ref = (ES.mode === "2d" ? qmax / (TAU * M.EPS0) : M.K * qmax / (0.2 * ES.VW)); var step = ref / 3, lv = [], j; for (j = -12; j <= 12; j++) lv.push(j * step * 0.5);
			var fn = function (x, y) { var v = M.potentialAt(ES.ch, x, y, ES.mode); return v; };
			var nx = Math.max(40, Math.round(W / 7)), ny = Math.max(30, Math.round(H / 7)); var all = M.contours(fn, box, nx, ny, lv); C.eq = all.map(function (s, i) { return { s: s, lv: lv[i] }; });
		}
		/* heat map */
		C.heat = null; if (ES.col !== "none" && ES.ch.length) {
			var hw = Math.max(40, Math.round(W / 3)), hh = Math.max(30, Math.round(H / 3)); esHeat.width = hw; esHeat.height = hh; var hc = esHeat.getContext("2d"), img = hc.createImageData(hw, hh), i, j2;
			var Vref = M.K * qmax / (0.25 * ES.VW), Eref = M.K * qmax / Math.pow(0.25 * ES.VW, 2); if (ES.mode === "2d") { Vref = qmax / (TAU * M.EPS0); Eref = qmax / (TAU * M.EPS0 * 0.25 * ES.VW); }
			for (j2 = 0; j2 < hh; j2++) for (i = 0; i < hw; i++) {
				var x = box[0] + (i + 0.5) / hw * (box[2] - box[0]), y = box[3] - (j2 + 0.5) / hh * (box[3] - box[1]), o = 4 * (j2 * hw + i), r, g, b;
				if (ES.col === "v") { var v = Math.tanh(M.potentialAt(ES.ch, x, y, ES.mode) / Vref * (ES.mode === "2d" ? 1 : 1)); if (v >= 0) { r = 255 * v; g = 60 * v; b = 40 * v; } else { r = 30 * -v; g = 90 * -v; b = 255 * -v; } }
				else { var e = M.fieldAt(ES.ch, x, y, ES.mode), m = Math.hypot(e[0], e[1]), u = Math.max(0, Math.min(1, (Math.log10(m / Eref + 1e-12) + 3) / 5)); r = 255 * Math.min(1, u * 2); g = 190 * Math.pow(u, 1.6); b = 90 * Math.pow(u, 3) + 30 * (1 - u); }
				img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 200;
			}
			hc.putImageData(img, 0, 0); C.heat = true;
		}
		ES.dirty = false;
	}
	function esDraw() {
		if (tab !== "es") return; if (ES.dirty) esRecompute(); ev.begin(); var cx = ev.cx, W = ev.W, H = ev.H, C = ES.cache, S = W / ES.VW;
		cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		if (C.heat) { cx.imageSmoothingEnabled = true; cx.drawImage(esHeat, 0, 0, W, H); }
		/* faint grid */
		cx.strokeStyle = "rgba(255,255,255,0.05)"; cx.lineWidth = 1; var gs = Math.pow(10, Math.floor(Math.log10(ES.VW / 4))), x;
		for (x = Math.ceil(esBox()[0] / gs) * gs; x <= esBox()[2]; x += gs) { var px = esT(x, 0)[0]; cx.beginPath(); cx.moveTo(px, 0); cx.lineTo(px, H); cx.stroke(); }
		for (var y = Math.ceil(esBox()[1] / gs) * gs; y <= esBox()[3]; y += gs) { var py = esT(0, y)[1]; cx.beginPath(); cx.moveTo(0, py); cx.lineTo(W, py); cx.stroke(); }
		/* equipotentials */
		if (ES.eq) C.eq.forEach(function (o) { if (!o.s.length) return; segs(cx, o.s, esT, o.lv > 0 ? "rgba(255,140,120,0.7)" : o.lv < 0 ? "rgba(120,170,255,0.7)" : "rgba(255,255,255,0.8)", 1.1); });
		/* field lines with a direction arrow */
		if (ES.lines) C.lines.forEach(function (l) {
			if (l.length < 6) return; lineW(cx, l, esT, "rgba(235,240,255,0.85)", 1.3);
			var n = l.length / 2, k = Math.max(1, Math.floor(n * 0.3)), a = esT(l[2 * (k - 1)], l[2 * (k - 1) + 1]), b = esT(l[2 * k], l[2 * k + 1]); var dir = ES.ch.some(function (c) { return c.q > 0; }) ? 1 : -1;
			if (dir > 0) arrow(cx, a[0], a[1], b[0], b[1], "rgba(235,240,255,0.95)", 0.1, 6); else arrow(cx, b[0], b[1], a[0], a[1], "rgba(235,240,255,0.95)", 0.1, 6);
		});
		if (ES.arrows) { var gp = coarse ? 40 : 32, i, j; for (j = gp / 2; j < H; j += gp) for (i = gp / 2; i < W; i += gp) { var w = esW(i, j), e = M.fieldAt(ES.ch, w[0], w[1], ES.mode), m = Math.hypot(e[0], e[1]); if (!(m > 0)) continue; var Eref = ES.mode === "2d" ? C.qmax / (TAU * M.EPS0 * 0.25 * ES.VW) : M.K * C.qmax / Math.pow(0.25 * ES.VW, 2), u = Math.max(0.15, Math.min(1, (Math.log10(m / Eref + 1e-12) + 3) / 4)); var L = gp * 0.42 * u; arrow(cx, i - e[0] / m * L * 0.5, j + e[1] / m * L * 0.5, i + e[0] / m * L * 0.5, j - e[1] / m * L * 0.5, "rgba(255,210,120," + (0.35 + 0.6 * u) + ")", 1.3, 5); } }
		/* Gauss surface */
		if (ES.gauss) { var c0 = esT(ES.gc.x, ES.gc.y), R = ES.gc.R * S; cx.setLineDash([7, 5]); cx.strokeStyle = "#7dd3fc"; cx.lineWidth = 2; cx.beginPath(); cx.arc(c0[0], c0[1], R, 0, 7); cx.stroke(); cx.setLineDash([]); cx.fillStyle = "rgba(125,211,252,0.08)"; cx.fill(); cx.fillStyle = "#7dd3fc"; cx.beginPath(); cx.arc(c0[0], c0[1], 4, 0, 7); cx.fill(); cx.beginPath(); cx.arc(c0[0] + R, c0[1], 5, 0, 7); cx.fill(); }
		/* test charges */
		ES.tests.forEach(function (t) { if (t.trail.length > 3) lineW(cx, t.trail, esT, t.q > 0 ? "rgba(255,230,90,0.8)" : "rgba(90,230,255,0.8)", 1.6); var p = esT(t.x, t.y); cx.fillStyle = t.q > 0 ? "#ffe45a" : "#5ae6ff"; cx.beginPath(); cx.arc(p[0], p[1], t.alive ? 4.5 : 3, 0, 7); cx.fill(); });
		/* charges */
		var qm = Math.max(C.qmax || 1e-6, 1e-12); ES.ch.forEach(function (c, i) { var p = esT(c.x, c.y), r = 8 + 6 * Math.sqrt(Math.abs(c.q) / qm); cx.fillStyle = c.q > 0 ? "#ef4444" : "#3b82f6"; cx.beginPath(); cx.arc(p[0], p[1], r, 0, 7); cx.fill(); cx.strokeStyle = i === ES.sel ? "#fff" : "rgba(255,255,255,0.55)"; cx.lineWidth = i === ES.sel ? 2.5 : 1.2; cx.stroke(); cx.fillStyle = "#fff"; cx.font = "bold " + Math.round(r * 1.3) + "px sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(c.q > 0 ? "+" : "−", p[0], p[1] + 1); });
		cx.textAlign = "start"; cx.textBaseline = "alphabetic";
		/* probe */
		if (ES.mouse && !ES.drag) { var mw = esW(ES.mouse[0], ES.mouse[1]), e2 = M.fieldAt(ES.ch, mw[0], mw[1], ES.mode), m2 = Math.hypot(e2[0], e2[1]); cx.strokeStyle = "rgba(255,255,255,0.7)"; cx.lineWidth = 1; cx.beginPath(); cx.arc(ES.mouse[0], ES.mouse[1], 4, 0, 7); cx.stroke(); if (m2 > 0) arrow(cx, ES.mouse[0], ES.mouse[1], ES.mouse[0] + e2[0] / m2 * 34, ES.mouse[1] - e2[1] / m2 * 34, "#fff", 2, 7); }
		/* scale bar */
		var sb = Math.pow(10, Math.floor(Math.log10(ES.VW / 3))), sp = sb * S; cx.strokeStyle = "rgba(255,255,255,0.8)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 14); cx.lineTo(12 + sp, H - 14); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.85)"; cx.font = "12px sans-serif"; cx.fillText(si(sb, "m", 2), 12, H - 20);
		$("em-es-badge").textContent = ES.drag ? "" : (ES.ch.length ? { pos: "Click to add a + charge · drag charges to move them", neg: "Click to add a − charge · drag charges to move them", move: "Drag a charge to move it", test: "Click to drop a test charge" }[ES.tool] : "Click to add a charge, or pick an example below");
	}
	function esReadouts() {
		var m = ES.mouse; if (m) { var w = esW(m[0], m[1]), e = M.fieldAt(ES.ch, w[0], w[1], ES.mode), v = M.potentialAt(ES.ch, w[0], w[1], ES.mode), E = Math.hypot(e[0], e[1]); $("em-es-p").textContent = sig(w[0], 3) + ", " + sig(w[1], 3); $("em-es-e").textContent = si(E, ES.mode === "2d" ? "V/m" : "N/C", 3); $("em-es-es").textContent = "pointing " + ang(e[0], e[1]).toFixed(0) + "° (arrow on the picture)"; $("em-es-v").textContent = ES.mode === "2d" ? sig(v, 3) + " V" : si(v, "V", 3); $("em-es-vs").textContent = ES.mode === "2d" ? "zero at 1 m from the origin" : "zero very far away"; }
		else { $("em-es-p").textContent = "–"; $("em-es-e").textContent = "–"; $("em-es-v").textContent = "–"; $("em-es-es").textContent = "move the pointer over the picture"; $("em-es-vs").textContent = ""; }
		if (ES.gauss) { if (ES.gdirty) { ES.gres = M.gauss(ES.ch, ES.gc.x, ES.gc.y, ES.gc.R, ES.mode); ES.gdirty = false; } var g = ES.gres; $("em-es-gl").textContent = ES.mode === "2d" ? "Gauss's law (circle)" : "Gauss's law (sphere)"; var qsc = 0; ES.ch.forEach(function (c) { qsc += Math.abs(c.q); }); var fz = Math.abs(g.flux) < 1e-6 * qsc / M.EPS0; $("em-es-g").textContent = fz ? "Φ ≈ 0" : "Φ = " + sig(g.flux, 4) + (ES.mode === "2d" ? " V" : " V·m"); $("em-es-gs").textContent = "inside: " + si(g.enclosed, ES.mode === "2d" ? "C/m" : "C", 3) + " → Q/ε₀ = " + sig(g.expected, 4) + (Math.abs(g.expected) > 1e-6 * qsc / M.EPS0 ? " (" + (100 * (g.flux / g.expected - 1)).toFixed(2) + "% off)" : fz ? " (nothing net inside, so no net flux)" : ""); }
		else { $("em-es-gl").textContent = "Gauss's law"; $("em-es-g").textContent = "–"; $("em-es-gs").textContent = "tick “Gauss surface”"; }
		selUi();
	}
	function esHit(p) { var best = -1, bd = 1e9; ES.ch.forEach(function (c, i) { var s = esT(c.x, c.y), d = Math.hypot(s[0] - p[0], s[1] - p[1]); if (d < (coarse ? 26 : 16) && d < bd) { bd = d; best = i; } }); return best; }
	ev.cv.addEventListener("pointerdown", function (e) {
		ev.cv.setPointerCapture(e.pointerId); var p = ev.pos(e), i = esHit(p); ES.mouse = p;
		if (ES.gauss) { var c0 = esT(ES.gc.x, ES.gc.y), S = ev.W / ES.VW, d = Math.hypot(p[0] - c0[0], p[1] - c0[1]); if (i < 0 && Math.abs(d - ES.gc.R * S) < 12) { ES.drag = { k: "gR" }; ev.st.classList.add("is-grab"); return; } if (i < 0 && d < 12) { ES.drag = { k: "gC", dx: ES.gc.x - esW(p[0], p[1])[0], dy: ES.gc.y - esW(p[0], p[1])[1] }; ev.st.classList.add("is-grab"); return; } }
		if (i >= 0) { ES.sel = i; ES.drag = { k: "c", i: i }; ev.st.classList.add("is-grab"); selUi(); return; }
		var w = esW(p[0], p[1]);
		if (ES.tool === "pos" || ES.tool === "neg") { if (ES.ch.length >= 40) { toast("That is plenty of charges (40)"); return; } ES.ch.push({ x: w[0], y: w[1], q: (ES.tool === "pos" ? 1 : -1) * qNew() }); ES.sel = ES.ch.length - 1; ES.dirty = true; ES.gdirty = true; }
		else if (ES.tool === "test") { if (ES.tests.length >= 8) ES.tests.shift(); var qq = ES.tcQ; var a0 = Math.hypot.apply(null, M.fieldAt(ES.ch, w[0], w[1], ES.mode)) * Math.abs(qq) / ES.tcM; ES.tests.push({ x: w[0], y: w[1], vx: 0, vy: 0, q: qq, m: ES.tcM, trail: [w[0], w[1]], alive: true, tau: Math.sqrt(0.08 * ES.VW / Math.max(a0, 1e-12)) }); }
		else ES.sel = -1; selUi();
	});
	ev.cv.addEventListener("pointermove", function (e) {
		var p = ev.pos(e); ES.mouse = p; if (!ES.drag) return; var w = esW(p[0], p[1]);
		if (ES.drag.k === "c") { var c = ES.ch[ES.drag.i]; if (c) { c.x = w[0]; c.y = w[1]; ES.dirty = true; ES.gdirty = true; } } else if (ES.drag.k === "gR") { ES.gc.R = Math.max(ES.VW * 0.03, Math.hypot(w[0] - ES.gc.x, w[1] - ES.gc.y)); ES.gdirty = true; } else if (ES.drag.k === "gC") { ES.gc.x = w[0] + ES.drag.dx; ES.gc.y = w[1] + ES.drag.dy; ES.gdirty = true; }
	});
	function esUp() { ES.drag = null; ev.st.classList.remove("is-grab"); }
	ev.cv.addEventListener("pointerup", esUp); ev.cv.addEventListener("pointercancel", esUp); ev.cv.addEventListener("pointerleave", function () { if (!ES.drag) ES.mouse = null; });
	ev.cv.addEventListener("keydown", function (e) { if ((e.key === "Delete" || e.key === "Backspace") && ES.sel >= 0) { e.preventDefault(); esDel(); } });
	function esDel() { if (ES.sel >= 0) { ES.ch.splice(ES.sel, 1); ES.sel = -1; ES.dirty = true; ES.gdirty = true; selUi(); } }
	wireTools("em-es-tools", function (t) { ES.tool = t; });
	$("em-es-q").oninput = function () { ES.qk = +this.value; $("em-es-q-v").textContent = sig(Math.pow(10, ES.qk), 2) + " μC"; sset({ qk: ES.qk }); };
	$("em-es-w").oninput = function () { ES.VW = 4 * Math.pow(10, +this.value); $("em-es-w-v").textContent = sig(ES.VW, 3) + " m"; ES.dirty = true; ES.tests.forEach(function (t) { t.trail = [t.x, t.y]; }); };
	$("em-es-n").oninput = function () { ES.nLines = +this.value; $("em-es-n-v").textContent = this.value; ES.dirty = true; sset({ nLines: ES.nLines }); };
	[["em-es-lines", "lines"], ["em-es-arrows", "arrows"], ["em-es-eq", "eq"], ["em-es-gauss", "gauss"]].forEach(function (p) { $(p[0]).onchange = function () { ES[p[1]] = this.checked; ES.dirty = true; ES.gdirty = true; var o = {}; o["es_" + p[1]] = this.checked; sset(o); }; });
	$("em-es-col").onchange = function () { ES.col = this.value; ES.dirty = true; sset({ es_col: ES.col }); };
	$("em-es-mode").onchange = function () { ES.mode = this.value; ES.dirty = true; ES.gdirty = true; ES.tests = []; sset({ es_mode: ES.mode }); };
	$("em-es-selq").oninput = function () { var c = ES.ch[ES.sel]; if (!c) return; var v = +this.value; c.q = (Math.abs(v) < 0.05 ? 0.05 : Math.abs(v)) * (v < 0 ? -1 : 1) * 1e-6; ES.dirty = true; ES.gdirty = true; };
	$("em-es-del").onclick = esDel; $("em-es-clear").onclick = function () { ES.ch = []; ES.sel = -1; ES.dirty = true; ES.gdirty = true; ES.tests = []; selUi(); }; $("em-es-tclear").onclick = function () { ES.tests = []; };
	$("em-es-play").onclick = function () { ES.play = !ES.play; this.setAttribute("aria-pressed", String(ES.play)); this.textContent = ES.play ? "❚❚ Pause" : "▶ Play"; };
	wirePng("em-es-png", ev, esDraw); wireFull("em-es-full", ev);
	$("em-es-link").onclick = function () { copyLink({ c: ES.ch.map(function (c) { return [+c.x.toFixed(3), +c.y.toFixed(3), +(c.q * 1e6).toFixed(3)].join(","); }).join(";"), w: ES.VW.toFixed(3), m: ES.mode }); };
	function esStepTests(dt) {
		ES.tests.forEach(function (t) { if (!t.alive) return; M.stepFree(t, ES.ch, ES.mode, dt * 1.6 * t.tau); t.trail.push(t.x, t.y); if (t.trail.length > 1600) t.trail.splice(0, 2); var hit = ES.ch.some(function (c) { return Math.hypot(t.x - c.x, t.y - c.y) < 0.012 * ES.VW; }); if (hit || Math.abs(t.x) > 6 * ES.VW || Math.abs(t.y) > 6 * ES.VW) t.alive = false; });
	}

	/* =================== CURRENTS =================== */
	var MS = { w: [], tool: "out", sel: -1, VW: 0.4, lines: true, arrows: false, heat: false, loop: false, lc: { x: 0, y: 0, R: 0.06 }, mouse: null, drag: null, dirty: true, cache: {}, ik: 1, ldirty: true };
	var mv = mkView("ms", 1.6), msHeat = document.createElement("canvas");
	function mT(x, y) { var S = mv.W / MS.VW; return [mv.W / 2 + x * S, mv.H / 2 - y * S]; }
	function mW(px, py) { var S = mv.W / MS.VW; return [(px - mv.W / 2) / S, -(py - mv.H / 2) / S]; }
	function mBox() { var hw = MS.VW / 2, hh = MS.VW / 2 * mv.H / mv.W; return [-hw, -hh, hw, hh]; }
	function iNew() { return Math.pow(10, MS.ik); }
	var MS_PRE = [
		{ name: "One wire", w: [[0, 0, 10]], VW: 0.3 }, { name: "Parallel currents", w: [[-0.06, 0, 10], [0.06, 0, 10]], VW: 0.4 }, { name: "Opposite currents", w: [[-0.06, 0, 10], [0.06, 0, -10]], VW: 0.4 },
		{ name: "Solenoid (cross-section)", w: (function () { var a = []; for (var i = 0; i < 9; i++) { a.push([-0.16 + i * 0.04, 0.05, 10]); a.push([-0.16 + i * 0.04, -0.05, -10]); } return a; })(), VW: 0.6 },
		{ name: "Coaxial cable", w: (function () { var a = [[0, 0, 12]]; for (var i = 0; i < 12; i++) a.push([0.07 * Math.cos(i * TAU / 12), 0.07 * Math.sin(i * TAU / 12), -1]); return a; })(), VW: 0.3 },
		{ name: "Three wires", w: [[-0.08, -0.04, 10], [0.08, -0.04, 10], [0, 0.07, -20]], VW: 0.4 }
	];
	function msLoad(p) { MS.w = p.w.map(function (w) { return { x: w[0], y: w[1], I: w[2] }; }); MS.VW = p.VW; MS.sel = -1; MS.lc = { x: 0, y: 0, R: p.VW * 0.2 }; MS.dirty = true; MS.ldirty = true; syncMs(); }
	function syncMs() { $("em-ms-i").value = MS.ik; $("em-ms-i-v").textContent = sig(iNew(), 3) + " A"; $("em-ms-w").value = Math.log10(MS.VW / 0.4); $("em-ms-w-v").textContent = sig(MS.VW * 100, 3) + " cm"; msSel(); }
	function msSel() { var w = MS.w[MS.sel]; $("em-ms-sel").hidden = !w; if (!w) return; $("em-ms-sel-i").textContent = sig(w.I, 3) + " A (" + (w.I > 0 ? "out ⊙" : "into ⊗") + ")"; $("em-ms-seli").value = Math.max(-100, Math.min(100, w.I)); }
	function msRecompute() {
		var box = mBox(), W = mv.W, H = mv.H, C = mv.cache = {}; MS.cache = C; C.lines = []; C.bmax = 0;
		if (MS.lines && MS.w.length) {
			var nx = Math.max(40, Math.round(W / 6)), ny = Math.max(30, Math.round(H / 6)), vals = [], i, j, dx = (box[2] - box[0]) / nx, dy = (box[3] - box[1]) / ny; var rmin = MS.VW * 0.012;
			var fn = function (x, y) { var a = 0; for (var k = 0; k < MS.w.length; k++) { var r = Math.max(rmin, Math.hypot(x - MS.w[k].x, y - MS.w[k].y)); a += -M.MU0 * MS.w[k].I / TAU * Math.log(r); } return a; };
			for (j = 0; j <= ny; j += 2) for (i = 0; i <= nx; i += 2) vals.push(fn(box[0] + i * dx, box[1] + j * dy)); vals.sort(function (a, b) { return a - b; }); var lo = vals[Math.floor(vals.length * 0.03)], hi = vals[Math.floor(vals.length * 0.97)], n = 26, lv = [];
			if (hi - lo > 0) for (i = 0; i < n; i++) lv.push(lo + (i + 0.5) * (hi - lo) / n);
			C.lines = M.contours(fn, box, nx, ny, lv);
		}
		C.heat = null; if (MS.heat && MS.w.length) {
			var hw = Math.max(40, Math.round(W / 3)), hh = Math.max(30, Math.round(H / 3)); msHeat.width = hw; msHeat.height = hh; var hc = msHeat.getContext("2d"), img = hc.createImageData(hw, hh), imax = 0; MS.w.forEach(function (w) { imax = Math.max(imax, Math.abs(w.I)); }); var Bref = M.MU0 * imax / (TAU * 0.1 * MS.VW), x, y, o, b, u;
			for (j = 0; j < hh; j++) for (i = 0; i < hw; i++) { x = box[0] + (i + 0.5) / hw * (box[2] - box[0]); y = box[3] - (j + 0.5) / hh * (box[3] - box[1]); b = M.wireB(MS.w, x, y); u = Math.max(0, Math.min(1, (Math.log10(Math.hypot(b[0], b[1]) / Bref + 1e-12) + 2.5) / 3.5)); o = 4 * (j * hw + i); img.data[o] = 60 * u + 20 * (1 - u); img.data[o + 1] = 120 * Math.pow(u, 1.4); img.data[o + 2] = 255 * Math.pow(u, 0.8); img.data[o + 3] = 190; }
			hc.putImageData(img, 0, 0); C.heat = true;
		}
		MS.dirty = false;
	}
	function msDraw() {
		if (tab !== "ms") return; if (MS.dirty) msRecompute(); mv.begin(); var cx = mv.cx, W = mv.W, H = mv.H, C = MS.cache, S = W / MS.VW; cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		if (C.heat) { cx.imageSmoothingEnabled = true; cx.drawImage(msHeat, 0, 0, W, H); }
		if (MS.lines) C.lines.forEach(function (s) { if (s.length) segs(cx, s, mT, "rgba(160,200,255,0.8)", 1.2); });
		if (MS.lines && MS.w.length) { /* direction arrows on the closest ring around each wire, counter-clockwise for current out of the page */ MS.w.forEach(function (w) { if (!w.I) return; for (var k = 0; k < 3; k++) { var r = (0.08 + 0.07 * k) * Math.min(MS.VW, 0.4 * MS.VW + 0.3) * 0.6 + MS.VW * 0.03, a = k * 1.1 + 0.5, p = mT(w.x + r * Math.cos(a), w.y + r * Math.sin(a)), t = [-Math.sin(a) * Math.sign(w.I), Math.cos(a) * Math.sign(w.I)]; arrow(cx, p[0] - t[0] * 7, p[1] + t[1] * 7, p[0] + t[0] * 7, p[1] - t[1] * 7, "rgba(200,225,255,0.95)", 0.1, 7); } }); }
		if (MS.arrows) { var gp = coarse ? 40 : 32, i, j; for (j = gp / 2; j < H; j += gp) for (i = gp / 2; i < W; i += gp) { var w = mW(i, j), b = M.wireB(MS.w, w[0], w[1]), m = Math.hypot(b[0], b[1]); if (!(m > 0)) continue; var imax = 0; MS.w.forEach(function (q) { imax = Math.max(imax, Math.abs(q.I)); }); var Bref = M.MU0 * imax / (TAU * 0.1 * MS.VW), u = Math.max(0.15, Math.min(1, (Math.log10(m / Bref + 1e-12) + 2.5) / 3.5)), L = gp * 0.42 * u; arrow(cx, i - b[0] / m * L * 0.5, j + b[1] / m * L * 0.5, i + b[0] / m * L * 0.5, j - b[1] / m * L * 0.5, "rgba(255,200,140," + (0.3 + 0.6 * u) + ")", 1.3, 5); } }
		if (MS.loop) { var c0 = mT(MS.lc.x, MS.lc.y), R = MS.lc.R * S; cx.setLineDash([7, 5]); cx.strokeStyle = "#86efac"; cx.lineWidth = 2; cx.beginPath(); cx.arc(c0[0], c0[1], R, 0, 7); cx.stroke(); cx.setLineDash([]); cx.fillStyle = "#86efac"; cx.beginPath(); cx.arc(c0[0], c0[1], 4, 0, 7); cx.fill(); cx.beginPath(); cx.arc(c0[0] + R, c0[1], 5, 0, 7); cx.fill(); }
		var r0 = Math.max(9, Math.min(16, 0.014 * W)); MS.w.forEach(function (w, i) { var p = mT(w.x, w.y), rr = r0 + 2 * Math.log10(Math.max(1, Math.abs(w.I))); cx.fillStyle = "#1f2937"; cx.beginPath(); cx.arc(p[0], p[1], rr, 0, 7); cx.fill(); cx.strokeStyle = i === MS.sel ? "#fff" : (w.I > 0 ? "#fb923c" : "#60a5fa"); cx.lineWidth = i === MS.sel ? 3 : 2; cx.stroke(); cx.strokeStyle = w.I > 0 ? "#fb923c" : "#60a5fa"; cx.fillStyle = cx.strokeStyle; cx.lineWidth = 2; if (w.I > 0) { cx.beginPath(); cx.arc(p[0], p[1], rr * 0.28, 0, 7); cx.fill(); } else { var d = rr * 0.5; cx.beginPath(); cx.moveTo(p[0] - d, p[1] - d); cx.lineTo(p[0] + d, p[1] + d); cx.moveTo(p[0] + d, p[1] - d); cx.lineTo(p[0] - d, p[1] + d); cx.stroke(); } });
		var sw = MS.w[MS.sel]; if (sw) { var f = M.wireForce(MS.w, MS.sel), fm = Math.hypot(f[0], f[1]); if (fm > 0) { var p = mT(sw.x, sw.y); arrow(cx, p[0], p[1], p[0] + f[0] / fm * 60, p[1] - f[1] / fm * 60, "#fde047", 3, 10); } }
		if (MS.mouse && !MS.drag) { var mw = mW(MS.mouse[0], MS.mouse[1]), b2 = M.wireB(MS.w, mw[0], mw[1]), m2 = Math.hypot(b2[0], b2[1]); cx.strokeStyle = "rgba(255,255,255,0.7)"; cx.lineWidth = 1; cx.beginPath(); cx.arc(MS.mouse[0], MS.mouse[1], 4, 0, 7); cx.stroke(); if (m2 > 0) arrow(cx, MS.mouse[0], MS.mouse[1], MS.mouse[0] + b2[0] / m2 * 34, MS.mouse[1] - b2[1] / m2 * 34, "#fff", 2, 7); }
		var sb = Math.pow(10, Math.floor(Math.log10(MS.VW / 3))), sp = sb * S; cx.strokeStyle = "rgba(255,255,255,0.8)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 14); cx.lineTo(12 + sp, H - 14); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.85)"; cx.font = "12px sans-serif"; cx.fillText(si(sb, "m", 2), 12, H - 20);
		$("em-ms-badge").textContent = MS.drag ? "" : (MS.w.length ? { out: "Click to add a wire carrying current out of the screen", in: "Click to add a wire carrying current into the screen", move: "Drag a wire to move it" }[MS.tool] : "Click to add a wire, or pick an example below");
	}
	function msReadouts() {
		var m = MS.mouse; if (m) { var w = mW(m[0], m[1]), b = M.wireB(MS.w, w[0], w[1]), B = Math.hypot(b[0], b[1]); $("em-ms-p").textContent = sig(w[0] * 100, 3) + ", " + sig(w[1] * 100, 3); $("em-ms-b").textContent = si(B, "T", 3); $("em-ms-bs").textContent = "pointing " + ang(b[0], b[1]).toFixed(0) + "° (arrow on the picture)"; } else { $("em-ms-p").textContent = "–"; $("em-ms-b").textContent = "–"; $("em-ms-bs").textContent = "move the pointer over the picture"; }
		if (MS.loop) { if (MS.ldirty) { MS.ares = M.ampere(MS.w, MS.lc.x, MS.lc.y, MS.lc.R); MS.ldirty = false; } var a = MS.ares; var isum = 0; MS.w.forEach(function (w) { isum += Math.abs(w.I); }); $("em-ms-a").textContent = "∮B·dl = " + (Math.abs(a.integral) < 1e-6 * M.MU0 * isum ? "≈ 0" : si(a.integral, "T·m", 4)); $("em-ms-as").textContent = "current inside " + sig(a.enclosed, 3) + " A → μ₀I = " + si(a.expected, "T·m", 4); } else { $("em-ms-a").textContent = "–"; $("em-ms-as").textContent = "tick “Ampère loop”"; }
		var w = MS.w[MS.sel]; if (w && MS.w.length > 1) { var f = M.wireForce(MS.w, MS.sel), fm = Math.hypot(f[0], f[1]); $("em-ms-f").textContent = si(fm, "N/m", 3); $("em-ms-fs").textContent = "yellow arrow: " + (fm > 0 ? "pulls toward / pushes from the other wires" : "no net force"); } else { $("em-ms-f").textContent = "–"; $("em-ms-fs").textContent = w ? "needs a second wire" : "select a wire"; }
		msSel();
	}
	function msHit(p) { var best = -1, bd = 1e9; MS.w.forEach(function (c, i) { var s = mT(c.x, c.y), d = Math.hypot(s[0] - p[0], s[1] - p[1]); if (d < (coarse ? 26 : 18) && d < bd) { bd = d; best = i; } }); return best; }
	mv.cv.addEventListener("pointerdown", function (e) {
		mv.cv.setPointerCapture(e.pointerId); var p = mv.pos(e), i = msHit(p); MS.mouse = p;
		if (MS.loop) { var c0 = mT(MS.lc.x, MS.lc.y), S = mv.W / MS.VW, d = Math.hypot(p[0] - c0[0], p[1] - c0[1]); if (i < 0 && Math.abs(d - MS.lc.R * S) < 12) { MS.drag = { k: "lR" }; mv.st.classList.add("is-grab"); return; } if (i < 0 && d < 12) { var w0 = mW(p[0], p[1]); MS.drag = { k: "lC", dx: MS.lc.x - w0[0], dy: MS.lc.y - w0[1] }; mv.st.classList.add("is-grab"); return; } }
		if (i >= 0) { MS.sel = i; MS.drag = { k: "w", i: i }; mv.st.classList.add("is-grab"); msSel(); return; }
		var w = mW(p[0], p[1]); if (MS.tool === "out" || MS.tool === "in") { if (MS.w.length >= 40) { toast("That is plenty of wires (40)"); return; } MS.w.push({ x: w[0], y: w[1], I: (MS.tool === "out" ? 1 : -1) * iNew() }); MS.sel = MS.w.length - 1; MS.dirty = true; MS.ldirty = true; } else MS.sel = -1; msSel();
	});
	mv.cv.addEventListener("pointermove", function (e) { var p = mv.pos(e); MS.mouse = p; if (!MS.drag) return; var w = mW(p[0], p[1]); if (MS.drag.k === "w") { var c = MS.w[MS.drag.i]; if (c) { c.x = w[0]; c.y = w[1]; MS.dirty = true; MS.ldirty = true; } } else if (MS.drag.k === "lR") { MS.lc.R = Math.max(MS.VW * 0.02, Math.hypot(w[0] - MS.lc.x, w[1] - MS.lc.y)); MS.ldirty = true; } else if (MS.drag.k === "lC") { MS.lc.x = w[0] + MS.drag.dx; MS.lc.y = w[1] + MS.drag.dy; MS.ldirty = true; } });
	function msUp() { MS.drag = null; mv.st.classList.remove("is-grab"); } mv.cv.addEventListener("pointerup", msUp); mv.cv.addEventListener("pointercancel", msUp); mv.cv.addEventListener("pointerleave", function () { if (!MS.drag) MS.mouse = null; });
	function msDel() { if (MS.sel >= 0) { MS.w.splice(MS.sel, 1); MS.sel = -1; MS.dirty = true; MS.ldirty = true; msSel(); } }
	mv.cv.addEventListener("keydown", function (e) { if ((e.key === "Delete" || e.key === "Backspace") && MS.sel >= 0) { e.preventDefault(); msDel(); } });
	wireTools("em-ms-tools", function (t) { MS.tool = t; });
	$("em-ms-i").oninput = function () { MS.ik = +this.value; $("em-ms-i-v").textContent = sig(iNew(), 3) + " A"; sset({ ik: MS.ik }); };
	$("em-ms-w").oninput = function () { MS.VW = 0.4 * Math.pow(10, +this.value); $("em-ms-w-v").textContent = sig(MS.VW * 100, 3) + " cm"; MS.dirty = true; };
	[["em-ms-lines", "lines"], ["em-ms-arrows", "arrows"], ["em-ms-heat", "heat"], ["em-ms-loop", "loop"]].forEach(function (p) { $(p[0]).onchange = function () { MS[p[1]] = this.checked; MS.dirty = true; MS.ldirty = true; }; });
	$("em-ms-seli").oninput = function () { var w = MS.w[MS.sel]; if (!w) return; w.I = +this.value; MS.dirty = true; MS.ldirty = true; $("em-ms-sel-i").textContent = sig(w.I, 3) + " A (" + (w.I > 0 ? "out ⊙" : w.I < 0 ? "into ⊗" : "off") + ")"; };
	$("em-ms-del").onclick = msDel; $("em-ms-clear").onclick = function () { MS.w = []; MS.sel = -1; MS.dirty = true; MS.ldirty = true; msSel(); };
	wirePng("em-ms-png", mv, msDraw); wireFull("em-ms-full", mv);
	$("em-ms-link").onclick = function () { copyLink({ w: MS.w.map(function (w) { return [+(w.x * 100).toFixed(3), +(w.y * 100).toFixed(3), +w.I.toFixed(3)].join(","); }).join(";"), vw: (MS.VW * 100).toFixed(3) }); };
	chips($("em-ms-pre"), MS_PRE, msLoad);
	chips($("em-es-pre"), ES_PRE, esLoad);

	/* =================== CHARGED PARTICLE =================== */
	var SPEC = { proton: { n: "proton", q: M.QE, m: M.MP, c: "#ef4444" }, electron: { n: "electron", q: -M.QE, m: M.ME, c: "#60a5fa" }, alpha: { n: "alpha particle", q: 2 * M.QE, m: 4.001506179 * M.AMU * 1 - 2 * M.ME, c: "#fbbf24" }, muon: { n: "muon", q: -M.QE, m: 1.883531627e-28, c: "#a78bfa" }, c12: { n: "C-12 ion", q: M.QE, m: 12 * M.AMU - M.ME, c: "#34d399" }, c13: { n: "C-13 ion", q: M.QE, m: 13.00335484 * M.AMU - M.ME, c: "#fbbf24" }, c14: { n: "C-14 ion", q: M.QE, m: 14.003241989 * M.AMU - M.ME, c: "#f472b6" } };
	var PT = { sp: "proton", Bk: 0, E: 0, vk: 6, a: 0, spd: -0.3, rel: "auto", follow: false, fields: true, play: true, parts: [], t: 0, view: { VW: 0.1, cx: 0, cy: 0 }, extra: [], note: "", dtLast: 0 };
	var pv = mkView("pt", 1.6);
	function ptRel(v) { return PT.rel === "yes" ? true : PT.rel === "no" ? false : v > 0.1 * M.C; }
	function ptB() { return Math.pow(10, PT.Bk); }
	function ptE() { return PT.E * 1e6; }
	function ptLaunch() {
		var specs = [{ sp: PT.sp, v: Math.pow(10, PT.vk), a: PT.a }].concat(PT.extra);
		PT.parts = specs.map(function (s) { var sp = SPEC[s.sp], rel = ptRel(s.v), p = M.makeParticle(sp.q, sp.m, 0, 0, Math.min(s.v, 0.9999999 * M.C), s.a * PI / 180, rel); return { p: p, spec: sp, rel: rel, trail: [0, 0], color: s.color || sp.c, v0: s.v, p0x: p.ux / (rel ? Math.sqrt(1 + (p.ux * p.ux + p.uy * p.uy) / (M.C * M.C)) : 1), p0y: p.uy / (rel ? Math.sqrt(1 + (p.ux * p.ux + p.uy * p.uy) / (M.C * M.C)) : 1), vyPrev: p.uy, periods: [], lastCross: null, x0: 0 }; });
		PT.t = 0; ptFit(); ptReadouts(true);
	}
	function ptRadius(part) { var v = part.v0, c = M.cyclotron(part.spec.q, part.spec.m, ptB(), v, part.rel); var r = c.radius; var E = Math.abs(ptE()), B = ptB(); if (E > 0) r = Math.max(r, 2 * part.spec.m * E / (Math.abs(part.spec.q) * B * B)); return { r: r, c: c }; }
	function ptFit() { var R = 0; PT.parts.forEach(function (pt) { R = Math.max(R, ptRadius(pt).r); }); PT.view.VW = Math.max(R * 5.2, 1e-9); PT.view.cx = PT.parts.length > 1 ? 0 : 0; PT.view.cy = 0; }
	var PT_PRE = [
		{ name: "Cyclotron (proton, 1 T)", sp: "proton", Bk: 0, E: 0, vk: 6, a: 0, note: "A proton at 1000 km/s in 1 tesla goes round a circle of radius 1.04 cm in 65.6 ns, no matter how fast it is: that constant time is what a cyclotron uses." },
		{ name: "Electron, weak field", sp: "electron", Bk: -3, E: 0, vk: 7, a: 90, note: "An electron at 10,000 km/s in 1 millitesla: a circle about 5.7 cm across. The electron turns the opposite way to a proton." },
		{ name: "E × B drift (cycloid)", sp: "proton", Bk: 0, E: 0.3, vk: 3, a: 0, follow: true, note: "A proton released at rest in crossed fields makes a cycloid and drifts at E/B = 300 km/s, to the right whatever the charge or mass (the E×B direction)." },
		{ name: "Velocity selector", sp: "proton", Bk: 0, E: 0.2, vk: 5.30103, a: 0, extra: [{ sp: "proton", v: 3e5, a: 0, color: "#fbbf24" }, { sp: "proton", v: 1.4e5, a: 0, color: "#a78bfa" }], note: "The proton moving at E/B = 200 km/s goes straight through (red). A faster one is bent by the magnetic force (yellow), a slower one by the electric force (purple)." },
		{ name: "Mass spectrometer", sp: "c12", Bk: -0.30103, E: 0, vk: 5, a: 90, extra: [{ sp: "c13", v: 1e5, a: 90 }, { sp: "c14", v: 1e5, a: 90 }], note: "Ions of carbon-12, -13 and -14 start together at the same speed in 0.5 T: heavier ones go round bigger circles (r = mv/qB). Measuring where they land tells their mass." },
		{ name: "Relativistic proton (0.9 c)", sp: "proton", Bk: 0, E: 0, vk: 8.4313, a: 0, rel: "yes", note: "At 0.9 c a proton's momentum is 2.3 times larger than Newton's formula says, so its circle is 2.3 times bigger (6.5 m instead of 2.8 m) and the lap takes 2.3 times longer." },
		{ name: "Muon", sp: "muon", Bk: -1, E: 0, vk: 7, a: 0, note: "A muon is 207 times heavier than an electron, so its circle in the same field is 207 times bigger." }
	];
	function ptApply(p) {
		PT.sp = p.sp; PT.Bk = p.Bk; PT.E = p.E; PT.vk = p.vk; PT.a = p.a; PT.extra = p.extra || []; PT.rel = p.rel || "auto"; PT.follow = !!p.follow; $("em-pt-note").textContent = p.note || ""; ptSync(); ptLaunch();
	}
	function ptSync() { $("em-pt-sp-sel").value = PT.sp; $("em-pt-B").value = PT.Bk; $("em-pt-B-v").textContent = si(ptB(), "T", 3); $("em-pt-E").value = PT.E; $("em-pt-E-v").textContent = si(ptE(), "V/m", 3); $("em-pt-vs-in").value = PT.vk; $("em-pt-vv").textContent = si(Math.pow(10, PT.vk), "m/s", 3) + " (" + sig(Math.pow(10, PT.vk) / M.C, 3) + " c)"; $("em-pt-a").value = PT.a; $("em-pt-a-v").textContent = PT.a; $("em-pt-sp").value = PT.spd; $("em-pt-sp-v").textContent = sig(Math.pow(10, PT.spd), 2) + " turns per second"; $("em-pt-rel").value = PT.rel; $("em-pt-follow").checked = PT.follow; $("em-pt-fields").checked = PT.fields; }
	function ptStep(Treal) {
		if (!PT.parts.length) return; var B = ptB(), E = ptE(), Tm = Infinity; PT.parts.forEach(function (pt) { var c = M.cyclotron(pt.spec.q, pt.spec.m, B, Math.max(M.speedOf(pt.p, pt.rel), 1), pt.rel); Tm = Math.min(Tm, c.period); });
		var T0 = M.cyclotron(PT.parts[0].spec.q, PT.parts[0].spec.m, B, Math.max(M.speedOf(PT.parts[0].p, PT.parts[0].rel), 1), PT.parts[0].rel).period, simT = Treal * Math.pow(10, PT.spd) * T0, dt = Tm / 160, n = Math.min(3000, Math.max(1, Math.ceil(simT / dt))); dt = simT / n;
		for (var i = 0; i < n; i++) PT.parts.forEach(function (pt) { M.borisStep(pt.p, [0, E, 0], [0, 0, B], dt, pt.rel); }); PT.t += simT; PT.dtLast = dt;
		PT.parts.forEach(function (pt) { pt.trail.push(pt.p.x, pt.p.y); if (pt.trail.length > 12000) pt.trail.splice(0, 2); var vy = pt.p.uy; if (pt.vyPrev > 0 && vy <= 0) { if (pt.lastCross !== null) { pt.periods.push(PT.t - pt.lastCross); if (pt.periods.length > 6) pt.periods.shift(); } pt.lastCross = PT.t; } pt.vyPrev = vy; });
	}
	function ptCam() { var c = PT.view; if (PT.follow && PT.parts[0]) { c.cx = PT.parts[0].p.x; c.cy = PT.parts[0].p.y; } return c; }
	function ptT(x, y) { var c = ptCam(), S = pv.W / c.VW; return [pv.W / 2 + (x - c.cx) * S, pv.H / 2 - (y - c.cy) * S]; }
	function ptDraw() {
		if (tab !== "pt") return; pv.begin(); var cx = pv.cx, W = pv.W, H = pv.H, c = ptCam(), S = W / c.VW; cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		if (PT.fields) {
			var gp = Math.max(28, Math.round(Math.min(W, H) / 10)), i, j; cx.fillStyle = "rgba(125,175,255,0.35)"; cx.strokeStyle = "rgba(125,175,255,0.35)"; cx.lineWidth = 1.2;
			var ox = (W / 2 - c.cx * S) % gp, oy = (H / 2 + c.cy * S) % gp; for (j = oy - gp; j < H + gp; j += gp) for (i = ox - gp; i < W + gp; i += gp) { cx.beginPath(); cx.arc(i, j, 2.2, 0, 7); cx.fill(); cx.beginPath(); cx.arc(i, j, 6, 0, 7); cx.stroke(); }
			if (ptE() !== 0) { var s = Math.sign(ptE()); cx.strokeStyle = "rgba(255,160,120,0.35)"; for (i = ox - gp / 2; i < W + gp; i += gp * 2.2) { arrow(cx, i, H / 2 + s * 40, i, H / 2 - s * 40, "rgba(255,160,120,0.4)", 1.5, 8); } }
		}
		PT.parts.forEach(function (pt) { var t = pt.trail; if (t.length > 3) { var n = t.length / 2, ch = 8, step = Math.ceil(n / ch); cx.lineWidth = 1.8; cx.strokeStyle = pt.color; for (var k = 0; k < ch; k++) { var f = k * step, to = Math.min(n - 1, (k + 1) * step); if (f >= to) continue; cx.globalAlpha = 0.25 + 0.75 * (k + 1) / ch; cx.beginPath(); for (var j = f; j <= to; j++) { var p = ptT(t[2 * j], t[2 * j + 1]); if (j === f) cx.moveTo(p[0], p[1]); else cx.lineTo(p[0], p[1]); } cx.stroke(); } cx.globalAlpha = 1; } var q = ptT(pt.p.x, pt.p.y); cx.fillStyle = pt.color; cx.beginPath(); cx.arc(q[0], q[1], 6, 0, 7); cx.fill(); cx.strokeStyle = "#fff"; cx.lineWidth = 1.3; cx.stroke(); var v = ptVel(pt), Lv = 38; var vm = Math.hypot(v[0], v[1]); if (vm > 0) arrow(cx, q[0], q[1], q[0] + v[0] / vm * Lv, q[1] - v[1] / vm * Lv, "#fff", 1.8, 7); });
		var sb = Math.pow(10, Math.floor(Math.log10(c.VW / 3))), sp = sb * S; cx.strokeStyle = "rgba(255,255,255,0.8)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 14); cx.lineTo(12 + sp, H - 14); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.85)"; cx.font = "12px sans-serif"; cx.fillText(si(sb, "m", 2), 12, H - 20);
		$("em-pt-badge").textContent = "B out of the screen (dots)" + (ptE() ? " · E " + (ptE() > 0 ? "up" : "down") : "");
	}
	function ptVel(pt) { var g = pt.rel ? Math.sqrt(1 + (pt.p.ux * pt.p.ux + pt.p.uy * pt.p.uy) / (M.C * M.C)) : 1; return [pt.p.ux / g, pt.p.uy / g]; }
	function ptReadouts(force) {
		var pt = PT.parts[0]; if (!pt) return; var B = ptB(), E = ptE(), v = Math.hypot.apply(null, ptVel(pt)), c = M.cyclotron(pt.spec.q, pt.spec.m, B, pt.v0, pt.rel), rr = ptRadius(pt);
		var vperp0 = pt.v0; var rad = c.radius, rlab = "r = " + (pt.rel ? "γ" : "") + "mv/(qB)"; if (E !== 0 && !pt.rel) { var vd0 = E / B, vx0 = pt.p0x, vy0 = pt.p0y; rad = pt.spec.m * Math.hypot(vx0 - vd0, vy0) / (Math.abs(pt.spec.q) * B); rlab = "r = m|v − E/B|/(qB), the circle in the drifting frame"; } $("em-pt-r").textContent = rad < 1e-9 * Math.max(1, c.radius) ? "straight line" : si(rad, "m", 3); $("em-pt-rs").textContent = rlab + (pt.rel ? ", γ = " + c.gamma.toFixed(3) : "") + " · " + pt.spec.n;
		$("em-pt-T").textContent = si(c.period, "s", 4); var meas = pt.periods.length ? pt.periods[pt.periods.length - 1] : null; $("em-pt-Ts").textContent = "frequency " + si(c.freq, "Hz", 3) + (meas ? " · measured " + si(meas, "s", 4) : "");
		var Ek = (pt.rel ? (c.gamma - 1) * pt.spec.m * M.C * M.C : 0.5 * pt.spec.m * pt.v0 * pt.v0); var Ev = Math.hypot.apply(null, ptVel(pt)); var Ekn = pt.rel ? (1 / Math.sqrt(1 - Math.pow(Ev / M.C, 2)) - 1) * pt.spec.m * M.C * M.C : 0.5 * pt.spec.m * Ev * Ev;
		$("em-pt-v").textContent = si(Ev, "m/s", 3); $("em-pt-vs").textContent = sig(Ev / M.C, 3) + " c · energy " + si(Ekn / M.QE, "eV", 3);
		if (E !== 0) { var vd = E / B; $("em-pt-d").textContent = si(vd, "m/s", 3); $("em-pt-ds").textContent = "E/B = " + sig(vd / M.C, 3) + " c" + (Math.abs(vd) >= M.C ? " (more than c: the particle cannot drift that fast)" : ""); } else { $("em-pt-d").textContent = "none"; $("em-pt-ds").textContent = "no electric field"; }
	}
	var ptSel = { proton: 1 };
	$("em-pt-sp-sel").onchange = function () { PT.sp = this.value; PT.extra = []; ptLaunch(); };
	$("em-pt-B").oninput = function () { PT.Bk = +this.value; $("em-pt-B-v").textContent = si(ptB(), "T", 3); ptLaunch(); sset({ pt_B: PT.Bk }); };
	$("em-pt-E").oninput = function () { PT.E = +this.value; $("em-pt-E-v").textContent = si(ptE(), "V/m", 3); ptLaunch(); };
	$("em-pt-vs-in").oninput = function () { PT.vk = +this.value; $("em-pt-vv").textContent = si(Math.pow(10, PT.vk), "m/s", 3) + " (" + sig(Math.pow(10, PT.vk) / M.C, 3) + " c)"; ptLaunch(); };
	$("em-pt-a").oninput = function () { PT.a = +this.value; $("em-pt-a-v").textContent = this.value; ptLaunch(); };
	$("em-pt-sp").oninput = function () { PT.spd = +this.value; $("em-pt-sp-v").textContent = sig(Math.pow(10, PT.spd), 2) + " turns per second"; sset({ pt_spd: PT.spd }); };
	$("em-pt-rel").onchange = function () { PT.rel = this.value; ptLaunch(); };
	$("em-pt-follow").onchange = function () { PT.follow = this.checked; if (!PT.follow) ptFit(); };
	$("em-pt-fields").onchange = function () { PT.fields = this.checked; };
	$("em-pt-play").onclick = function () { PT.play = !PT.play; this.setAttribute("aria-pressed", String(PT.play)); this.textContent = PT.play ? "❚❚ Pause" : "▶ Play"; };
	$("em-pt-reset").onclick = ptLaunch; wirePng("em-pt-png", pv, ptDraw); wireFull("em-pt-full", pv);
	$("em-pt-link").onclick = function () { copyLink({ sp: PT.sp, B: PT.Bk, E: PT.E, v: PT.vk, a: PT.a, rel: PT.rel }); };
	chips($("em-pt-pre"), PT_PRE, ptApply);

	/* =================== WAVES (FDTD) =================== */
	var NX = 240, NY = 140, Y = new M.Yee(NX, NY), WV = { tool: "glass", n: 1.5, brush: 4, lam: 16, speed: 3, view: "ez", stype: "point", pulse: 0, arrows: false, mat: true, play: true, probe: null, hist: [], peak: 0.05, scale: 0.122, sx: new Float32Array(NX * NY), sy: new Float32Array(NX * NY), amp: 0.5, mouseDown: false, note: "" };
	var wvv = mkView("wv", NX / NY, 90), wvImg = document.createElement("canvas"), sc = $("em-wv-sc"), scx = sc.getContext("2d"), SP = Y.sponge;
	wvImg.width = NX; wvImg.height = NY; var wvC = wvImg.getContext("2d"), wvID = wvC.createImageData(NX, NY);
	function wvClearAll() { Y.epsr.fill(1); Y.sig.fill(0); Y.pec.fill(0); Y.sources = []; Y.reset(); WV.sx.fill(0); WV.sy.fill(0); WV.hist = []; WV.peak = 0.05; Y.build(); }
	function disc(cx0, cy0, r, fn) { for (var j = Math.max(1, Math.floor(cy0 - r)); j <= Math.min(NY - 2, Math.ceil(cy0 + r)); j++) for (var i = Math.max(1, Math.floor(cx0 - r)); i <= Math.min(NX - 2, Math.ceil(cx0 + r)); i++) if ((i - cx0) * (i - cx0) + (j - cy0) * (j - cy0) <= r * r) fn(j * NX + i, i, j); }
	function rect(x0, y0, x1, y1, fn) { for (var j = Math.max(0, y0); j <= Math.min(NY - 1, y1); j++) for (var i = Math.max(0, x0); i <= Math.min(NX - 1, x1); i++) fn(j * NX + i, i, j); }
	function glassFn(n) { return function (p) { Y.epsr[p] = n * n; }; } function metalFn(p) { Y.pec[p] = 1; }
	function addSrc(type, x, y) { var w = M.omegaFor(WV.lam); if (type === "line") Y.sources.push({ type: "line", x: x, y0: SP + 1, y1: NY - SP - 2, amp: WV.amp * 0.12, w: w, pulse: WV.pulse, t0: Y.t }); else Y.sources.push({ type: "point", x: x, y: y, amp: WV.amp, w: w, pulse: WV.pulse, t0: Y.t }); }
	var WV_PRE = [
		{ name: "Plane wave", note: "A plane wave travelling right through empty space: the colour bands are the crests (red) and troughs (blue) of the electric field. Add materials with the tools above.", set: function () { addSrc("line", 40, 0); } },
		{ name: "Mirror (metal wall)", note: "A plane wave hits a metal wall. The metal forces the field to zero, so the wave reflects with its sign flipped and the incoming and reflected waves make a standing pattern with fixed nodes half a wavelength apart.", set: function () { addSrc("line", 40, 0); rect(150, SP, 153, NY - SP - 1, metalFn); } },
		{ name: "Glass slab", note: "A wave enters glass: it slows down to c/n, so the wavelength shortens (look at the crests), and a little reflects at each surface.", set: function () { addSrc("line", 40, 0); rect(110, SP, 170, NY - SP - 1, glassFn(WV.n)); } },
		{ name: "Prism (refraction)", note: "A glass prism bends a wave that arrives at a slant on its surfaces (Snell's law, n₁ sin θ₁ = n₂ sin θ₂); the beam is deviated towards the thicker part.", set: function () { addSrc("line", 40, 0); for (var j = 20; j < 120; j++) { var half = (j - 20) * 0.5; rect(110, j, Math.round(110 + half), j, glassFn(WV.n)); } } },
		{ name: "Lens", note: "A disc of glass (n = 2) acts as a cylindrical lens and brings the plane wave to a bright focus just behind it.", set: function () { addSrc("line", 40, 0); disc(130, 70, 30, glassFn(2)); WV.view = "avg"; $("em-wv-view").value = "avg"; } },
		{ name: "Double slit", note: "Two slits in a metal wall: the waves from each slit overlap and add or cancel, producing bright and dark fans (switch Show to Average brightness to see the interference pattern clearly).", set: function () { addSrc("line", 40, 0); rect(100, SP, 103, 58, metalFn); rect(100, 66, 103, 74, metalFn); rect(100, 82, 103, NY - SP - 1, metalFn); WV.view = "avg"; $("em-wv-view").value = "avg"; } },
		{ name: "Single slit", note: "One narrow opening in a metal wall: the wave spreads out behind it (diffraction); the narrower the slit compared with the wavelength, the more it spreads.", set: function () { addSrc("line", 40, 0); rect(100, SP, 103, 62, metalFn); rect(100, 78, 103, NY - SP - 1, metalFn); } },
		{ name: "Waveguide", note: "A hollow metal channel carries the wave along it with almost no loss: the waves reflect between the walls (a rectangular waveguide, like those that carry microwaves in a radar).", set: function () { addSrc("point", 50, 70); rect(40, 55, 205, 57, metalFn); rect(40, 83, 205, 85, metalFn); rect(40, 55, 42, 85, metalFn); } },
		{ name: "Antenna (dipole)", note: "A small antenna radiating: circular waves spread out in all directions with the field falling as 1/√r (in 2D).", set: function () { addSrc("point", 120, 70); WV.view = "ez"; } },
		{ name: "Resonant cavity", note: "A box with perfectly conducting walls. A pulse bounces around and settles into standing patterns (modes) that ring at certain frequencies only: how a microwave oven or a laser cavity works.", set: function () { rect(70, 30, 170, 32, metalFn); rect(70, 108, 170, 110, metalFn); rect(70, 30, 72, 110, metalFn); rect(168, 30, 170, 110, metalFn); WV.pulse0 = WV.pulse; Y.sources.push({ type: "point", x: 95, y: 55, amp: WV.amp, w: M.omegaFor(WV.lam), pulse: 3, t0: Y.t }); } },
		{ name: "Absorber", note: "A lossy block (like a radar-absorbing material or a brick wall for Wi-Fi): the wave is attenuated as it passes through, turning into heat.", set: function () { addSrc("line", 40, 0); rect(110, SP, 160, NY - SP - 1, function (p) { Y.sig[p] = 0.06; }); } }
	];
	function wvLoad(p) { wvClearAll(); WV.view = "ez"; $("em-wv-view").value = "ez"; p.set(); Y.build(); WV.note = p.note; $("em-wv-note").textContent = p.note; }
	function wvDraw() {
		if (tab !== "wv") return; wvv.begin(); var cx = wvv.cx, W = wvv.W, H = wvv.H, id = wvID.data, ez = Y.ez, avg = Y.avg, i, mx = 0, n = NX * NY;
		if (WV.view === "ez") { for (i = 0; i < n; i++) { var a = Math.abs(ez[i]); if (a > mx) mx = a; } WV.peak = Math.max(mx, WV.peak * 0.995, 1e-3); }
		var scl = 1 / (WV.peak * 0.9);
		var aMax = 0; if (WV.view === "avg") { for (i = 0; i < n; i++) if (avg[i] > aMax) aMax = avg[i]; WV.aPeak = Math.max(aMax, (WV.aPeak || 0) * 0.995, 1e-6); } var as = 1 / (WV.aPeak || 1);
		for (i = 0; i < n; i++) {
			var o = 4 * i, r, g, b;
			if (WV.view === "ez") { var v = Math.max(-1, Math.min(1, ez[i] * scl)); if (v >= 0) { r = 18 + 237 * v; g = 20 + 70 * v; b = 28 + 40 * v; } else { r = 18 + 40 * -v; g = 20 + 120 * -v; b = 28 + 227 * -v; } }
			else { var u = Math.min(1, Math.sqrt(avg[i] * as)); r = 255 * Math.min(1, u * 1.6); g = 200 * Math.pow(u, 1.7); b = 60 * Math.pow(u, 3) + 25 * (1 - u); }
			if (Y.pec[i]) { r = 190; g = 195; b = 205; } else if (WV.mat && Y.epsr[i] > 1.001) { r = r * 0.78 + 255 * 0.22 * 0.6; g = g * 0.78 + 255 * 0.22 * 0.8; b = b * 0.78 + 255 * 0.22; } else if (WV.mat && Y.sig[i] > 0) { r = r * 0.7 + 90; g = g * 0.7 + 60; b = b * 0.7 + 30; }
			id[o] = r; id[o + 1] = g; id[o + 2] = b; id[o + 3] = 255;
		}
		wvC.putImageData(wvID, 0, 0); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high"; cx.drawImage(wvImg, 0, 0, W, H);
		var gx = W / NX, gy = H / NY;
		if (WV.arrows) { var st = 10, k, l; for (l = SP + 4; l < NY - SP - 2; l += st) for (k = SP + 4; k < NX - SP - 2; k += st) { var p = l * NX + k, sx = WV.sx[p], sy = WV.sy[p], m = Math.hypot(sx, sy), ref = (WV.pk || 1e-6); if (m < ref * 0.08) continue; var L = Math.min(1, m / ref) * st * 0.9 * gx; arrow(cx, (k + 0.5) * gx - sx / m * L * 0.5, (l + 0.5) * gy + sy / m * L * 0.5, (k + 0.5) * gx + sx / m * L * 0.5, (l + 0.5) * gy - sy / m * L * 0.5, "rgba(255,255,255,0.8)", 1.2, 4.5); } }
		Y.sources.forEach(function (s) { cx.strokeStyle = "#fde047"; cx.fillStyle = "#fde047"; cx.lineWidth = 2; if (s.type === "line") { cx.beginPath(); cx.moveTo((s.x + 0.5) * gx, (s.y0 + 0.5) * gy); cx.lineTo((s.x + 0.5) * gx, (s.y1 + 0.5) * gy); cx.stroke(); } else { cx.beginPath(); cx.arc((s.x + 0.5) * gx, (s.y + 0.5) * gy, 5, 0, 7); cx.fill(); } });
		if (WV.probe) { var px = (WV.probe[0] + 0.5) * gx, py = (WV.probe[1] + 0.5) * gy; cx.strokeStyle = "#86efac"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(px - 8, py); cx.lineTo(px + 8, py); cx.moveTo(px, py - 8); cx.lineTo(px, py + 8); cx.stroke(); cx.beginPath(); cx.arc(px, py, 5, 0, 7); cx.stroke(); }
		var wl = WV.lam * gx; cx.strokeStyle = "rgba(255,255,255,0.85)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(12, H - 16); cx.lineTo(12 + wl, H - 16); cx.moveTo(12, H - 20); cx.lineTo(12, H - 12); cx.moveTo(12 + wl, H - 20); cx.lineTo(12 + wl, H - 12); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.9)"; cx.font = "12px sans-serif"; cx.fillText("1 wavelength", 12, H - 22);
		$("em-wv-badge").textContent = { glass: "Drag to paint glass", metal: "Drag to paint metal (perfect conductor)", absorb: "Drag to paint a lossy absorber", erase: "Drag to erase materials", src: "Click to place a source (" + (WV.stype === "line" ? "plane wave line" : "point") + ")", probe: "Click to put the probe there" }[WV.tool];
		drawScope();
	}
	function drawScope() {
		var w = sc.clientWidth || 600, h = 90, dpr = Math.min(2, window.devicePixelRatio || 1); if (sc.width !== Math.round(w * dpr) || sc.height !== Math.round(h * dpr)) { sc.width = Math.round(w * dpr); sc.height = Math.round(h * dpr); } scx.setTransform(dpr, 0, 0, dpr, 0, 0); scx.fillStyle = "#080b12"; scx.fillRect(0, 0, w, h); scx.font = "11px sans-serif"; scx.fillStyle = "rgba(160,170,190,0.9)";
		if (!WV.probe) { scx.fillText("Probe: choose the ⌖ tool and click the picture to see the electric field at that point over time.", 8, 18); return; }
		scx.strokeStyle = "rgba(255,255,255,0.12)"; scx.beginPath(); scx.moveTo(0, h / 2); scx.lineTo(w, h / 2); scx.stroke(); var H = WV.hist, n = H.length; if (n < 2) return; var mx = 1e-6; H.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); }); scx.strokeStyle = "#86efac"; scx.lineWidth = 1.5; scx.beginPath(); for (var i = 0; i < n; i++) { var x = i / 600 * w, y = h / 2 - H[i] / mx * (h / 2 - 8); if (i === 0) scx.moveTo(x, y); else scx.lineTo(x, y); } scx.stroke(); scx.fillText("field at the probe, last " + n + " samples (peak " + sig(mx, 3) + ")", 8, 14);
	}
	function wvPaint(e) {
		var p = wvv.pos(e), gx = p[0] / wvv.W * NX, gy = p[1] / wvv.H * NY, r = WV.brush; if (gx < SP + 1 || gx > NX - SP - 2 || gy < SP + 1 || gy > NY - SP - 2) { if (WV.tool !== "src" && WV.tool !== "probe") return; }
		if (WV.tool === "glass") disc(gx, gy, r, function (i2, x, y) { if (x > SP && x < NX - SP - 1 && y > SP && y < NY - SP - 1) { Y.epsr[i2] = WV.n * WV.n; Y.pec[i2] = 0; Y.sig[i2] = 0; } });
		else if (WV.tool === "metal") disc(gx, gy, r, function (i2, x, y) { if (x > SP && x < NX - SP - 1 && y > SP && y < NY - SP - 1) { Y.pec[i2] = 1; Y.epsr[i2] = 1; Y.sig[i2] = 0; } });
		else if (WV.tool === "absorb") disc(gx, gy, r, function (i2, x, y) { if (x > SP && x < NX - SP - 1 && y > SP && y < NY - SP - 1) { Y.sig[i2] = 0.06; Y.pec[i2] = 0; Y.epsr[i2] = 1; } });
		else if (WV.tool === "erase") disc(gx, gy, r, function (i2) { Y.epsr[i2] = 1; Y.pec[i2] = 0; Y.sig[i2] = 0; });
		Y.build();
	}
	wvv.cv.addEventListener("pointerdown", function (e) {
		wvv.cv.setPointerCapture(e.pointerId); var p = wvv.pos(e), gx = Math.round(p[0] / wvv.W * NX - 0.5), gy = Math.round(p[1] / wvv.H * NY - 0.5);
		if (WV.tool === "src") { if (Y.sources.length >= 8) { toast("Plenty of sources (8): use “Remove the sources”"); return; } gx = Math.max(SP + 2, Math.min(NX - SP - 3, gx)); gy = Math.max(SP + 2, Math.min(NY - SP - 3, gy)); addSrc(WV.stype, gx, gy); }
		else if (WV.tool === "probe") { WV.probe = [Math.max(1, Math.min(NX - 2, gx)), Math.max(1, Math.min(NY - 2, gy))]; WV.hist = []; }
		else { WV.mouseDown = true; wvPaint(e); }
	});
	wvv.cv.addEventListener("pointermove", function (e) { if (WV.mouseDown) wvPaint(e); }); function wvUp() { WV.mouseDown = false; } wvv.cv.addEventListener("pointerup", wvUp); wvv.cv.addEventListener("pointercancel", wvUp);
	wireTools("em-wv-tools", function (t) { WV.tool = t; });
	function setLam(l) { WV.lam = l; $("em-wv-l").value = l; $("em-wv-l-v").textContent = l; var w = M.omegaFor(l); Y.sources.forEach(function (s) { s.w = w; }); }
	$("em-wv-l").oninput = function () { setLam(+this.value); sset({ wv_lam: WV.lam }); };
	$("em-wv-e").oninput = function () { WV.n = +this.value; $("em-wv-e-v").textContent = WV.n.toFixed(2); };
	$("em-wv-b").oninput = function () { WV.brush = +this.value; $("em-wv-b-v").textContent = this.value; };
	$("em-wv-s").oninput = function () { WV.speed = +this.value; $("em-wv-s-v").textContent = this.value; };
	$("em-wv-view").onchange = function () { WV.view = this.value; }; $("em-wv-stype").onchange = function () { WV.stype = this.value; }; $("em-wv-pulse").onchange = function () { WV.pulse = +this.value; };
	$("em-wv-scale").onchange = function () { WV.scale = +this.value; };
	$("em-wv-arrows").onchange = function () { WV.arrows = this.checked; }; $("em-wv-mat").onchange = function () { WV.mat = this.checked; };
	$("em-wv-clearm").onclick = function () { Y.epsr.fill(1); Y.sig.fill(0); Y.pec.fill(0); Y.build(); }; $("em-wv-clears").onclick = function () { Y.sources = []; };
	$("em-wv-play").onclick = function () { WV.play = !WV.play; this.setAttribute("aria-pressed", String(WV.play)); this.textContent = WV.play ? "❚❚ Pause" : "▶ Play"; };
	$("em-wv-reset").onclick = function () { Y.reset(); WV.sx.fill(0); WV.sy.fill(0); WV.hist = []; WV.peak = 0.05; WV.aPeak = 0; var s = Y.sources; s.forEach(function (x) { x.t0 = 0; }); };
	wirePng("em-wv-png", wvv, wvDraw); wireFull("em-wv-full", wvv);
	chips($("em-wv-pre"), WV_PRE, wvLoad);
	function wvStep() {
		if (!WV.play) return; var k, i, n = NX * NY, t0 = performance.now();
		for (k = 0; k < WV.speed; k++) { Y.stepOnce(); if (WV.probe && Y.step % 2 === 0) { WV.hist.push(Y.ez[WV.probe[1] * NX + WV.probe[0]]); if (WV.hist.length > 600) WV.hist.shift(); } if (performance.now() - t0 > 12) break; }
		if (WV.arrows) { var a = 0.04, ez = Y.ez, hx = Y.hx, hy = Y.hy, mxs = 0; for (i = 0; i < n; i++) { WV.sx[i] += a * (-ez[i] * hy[i] - WV.sx[i]); WV.sy[i] += a * (ez[i] * hx[i] - WV.sy[i]); } for (i = 0; i < n; i += 7) { var m = Math.hypot(WV.sx[i], WV.sy[i]); if (m > mxs) mxs = m; } WV.pk = Math.max(mxs, (WV.pk || 0) * 0.995); }
	}
	function wvReadouts() {
		var T = WV.lam; $("em-wv-t").textContent = sig(Y.t / T, 3) + " periods"; $("em-wv-ts").textContent = "t = " + sig(Y.t, 3) + " cell-times"; var lam = WV.scale, f = M.C / lam; $("em-wv-f").textContent = si(f, "Hz", 3); $("em-wv-fs").textContent = "λ = " + si(lam, "m", 3) + " (" + WV.lam + " cells)";
		var amax = 0, i; for (i = 0; i < NX * NY; i += 3) { var a = Math.abs(Y.ez[i]); if (a > amax) amax = a; } var ref = Y.sources.length ? Math.max.apply(null, Y.sources.map(function (s) { return s.amp; })) : 1; $("em-wv-m").textContent = sig(amax / ref, 3) + "×";
		if (WV.probe) { var H = WV.hist, mx = 0; H.forEach(function (v) { mx = Math.max(mx, Math.abs(v)); }); var cr = [], j; for (j = 1; j < H.length; j++) if (H[j - 1] < 0 && H[j] >= 0) cr.push(j); var per = cr.length > 2 ? (cr[cr.length - 1] - cr[0]) / (cr.length - 1) * 2 * Y.S : null; $("em-wv-pr").textContent = sig(Y.ez[WV.probe[1] * NX + WV.probe[0]], 3); $("em-wv-prs").textContent = "peak " + sig(mx, 3) + (per ? " · period " + sig(per, 3) + " (source " + WV.lam + ")" : ""); } else { $("em-wv-pr").textContent = "–"; $("em-wv-prs").textContent = "⌖ tool, then click"; }
	}

	/* =================== PLANE WAVE =================== */
	var PW = { lk: -0.263, ek: 1, a: 0, pol: "lin", bOn: true, eOn: true, tip: false, yaw: -0.5, pitch: 0.35, phase: 0, play: true, drag: null };
	var pwv = mkView("pw", 1.7), BANDS = [[1e-11, "gamma ray"], [1e-8, "X-ray"], [4e-7, "ultraviolet"], [7.5e-7, "visible light"], [1e-3, "infrared"], [0.3, "microwave"], [1e3, "radio"], [1e9, "radio (very long)"]];
	function bandOf(l) { for (var i = 0; i < BANDS.length; i++) if (l < BANDS[i][0]) return BANDS[i][1]; return "radio (very long)"; }
	function visCol(l) { var nm = l * 1e9, r, g, b; if (nm < 380 || nm > 750) return null; if (nm < 440) { r = (440 - nm) / 60; g = 0; b = 1; } else if (nm < 490) { r = 0; g = (nm - 440) / 50; b = 1; } else if (nm < 510) { r = 0; g = 1; b = (510 - nm) / 20; } else if (nm < 580) { r = (nm - 510) / 70; g = 1; b = 0; } else if (nm < 645) { r = 1; g = (645 - nm) / 65; b = 0; } else { r = 1; g = 0; b = 0; } return "rgb(" + Math.round(255 * r) + "," + Math.round(255 * g) + "," + Math.round(255 * b) + ")"; }
	var PW_PRE = [{ n: "FM radio (3 m)", l: 3 }, { n: "Wi-Fi (12.2 cm)", l: 0.122 }, { n: "Microwave oven", l: 0.1224 }, { n: "Infrared (10 μm)", l: 1e-5 }, { n: "Red light", l: 7e-7 }, { n: "Green light", l: 5.5e-7 }, { n: "Violet light", l: 4e-7 }, { n: "Ultraviolet", l: 1e-7 }, { n: "X-ray (0.1 nm)", l: 1e-10 }];
	function pwLam() { return Math.pow(10, PW.lk); }
	function pwE0() { return Math.pow(10, PW.ek); }
	function pwSync() { $("em-pw-l").value = PW.lk; $("em-pw-l-v").textContent = si(pwLam(), "m", 3); $("em-pw-e").value = PW.ek; $("em-pw-e-v").textContent = si(pwE0(), "V/m", 3); $("em-pw-a").value = PW.a; $("em-pw-a-v").textContent = PW.a; $("em-pw-pol").value = PW.pol; $("em-pw-b-on").checked = PW.bOn; $("em-pw-e-on").checked = PW.eOn; $("em-pw-tip").checked = PW.tip; }
	function pwField(x, ph) { /* unit E and B vectors (y, z) at position x along the wave (dimensionless 0..1 units of wavelength) */ var k = TAU * x - ph, c = Math.cos(k), s = Math.sin(k), a = PW.a * PI / 180, ey, ez;
		if (PW.pol === "lin") { ey = c * Math.cos(a); ez = c * Math.sin(a); } else if (PW.pol === "circR" || PW.pol === "circL") { var sg = PW.pol === "circR" ? 1 : -1; ey = c / Math.SQRT2 * 1.2; ez = sg * s / Math.SQRT2 * 1.2; } else { var A = 1, Bb = 0.5, u = A * c, v = Bb * s; ey = u * Math.cos(a) - v * Math.sin(a); ez = u * Math.sin(a) + v * Math.cos(a); }
		/* B along k x E: x_hat x (ey, ez) = (-ez, ey) in (y, z) */ return { ey: ey, ez: ez, by: -ez, bz: ey }; }
	function pwProj(x, y, z) { var cy = Math.cos(PW.yaw), sy = Math.sin(PW.yaw), cp = Math.cos(PW.pitch), sp = Math.sin(PW.pitch); var x1 = x * cy - z * sy, z1 = x * sy + z * cy; var y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp; return [x1, y1, z2]; }
	function pwDraw() {
		if (tab !== "pw") return; pwv.begin(); var cx = pwv.cx, W = pwv.W, H = pwv.H; cx.fillStyle = "#05070d"; cx.fillRect(0, 0, W, H);
		var Lx = 3.2, N = 96, sc = Math.min(W / (Lx * 1.25), H / 3.4) * 0.95, ox = W / 2, oy = H / 2; function P(x, y, z) { var p = pwProj(x - Lx / 2, y, z); return [ox + p[0] * sc, oy - p[1] * sc, p[2]]; }
		var lcol = visCol(pwLam()), ecol = "#ef4444", bcol = "#3b82f6"; if (lcol) { ecol = lcol; }
		/* axis */ var a0 = P(0, 0, 0), a1 = P(Lx, 0, 0); cx.strokeStyle = "rgba(255,255,255,0.35)"; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(a0[0], a0[1]); cx.lineTo(a1[0], a1[1]); cx.stroke(); arrow(cx, a1[0] - 0.1, a1[1], a1[0] + 18 * Math.cos(0), a1[1], "rgba(255,255,255,0.55)", 0.1, 9);
		var items = []; var k; for (k = 0; k <= N; k++) { var x = k / N * Lx, f = pwField(x, PW.phase), env = Math.min(1, Math.min(x, Lx - x) * 4); items.push({ x: x, f: f, env: env }); }
		/* wave planes: E at every sample (red) and B (blue) */
		var amp = 1.0; items.forEach(function (it) { var p0 = P(it.x, 0, 0); it.p0 = p0; it.e = P(it.x, it.f.ey * amp * it.env, it.f.ez * amp * it.env); it.b = P(it.x, it.f.by * amp * it.env, it.f.bz * amp * it.env); });
		function drawVec(it, tip, col, wd) { cx.strokeStyle = col; cx.globalAlpha = 0.35 + 0.65 * it.env; cx.lineWidth = wd; cx.beginPath(); cx.moveTo(it.p0[0], it.p0[1]); cx.lineTo(tip[0], tip[1]); cx.stroke(); cx.globalAlpha = 1; }
		var order = items.slice().sort(function (a, b) { return a.p0[2] - b.p0[2]; });
		var tipE = function (it) { return it.e; }, tipB = function (it) { return it.b; };
		/* filled ribbons give the wave its shape */
		function ribbon(key, col, fill) { cx.beginPath(); items.forEach(function (it, i) { var q = it[key]; if (i === 0) cx.moveTo(q[0], q[1]); else cx.lineTo(q[0], q[1]); }); cx.strokeStyle = col; cx.lineWidth = 2.2; cx.stroke(); if (fill) { cx.lineTo(items[N].p0[0], items[N].p0[1]); for (var i = N; i >= 0; i--) cx.lineTo(items[i].p0[0], items[i].p0[1]); cx.closePath(); cx.fillStyle = fill; cx.fill(); } }
		if (PW.eOn) { ribbon("e", ecol, "rgba(239,68,68,0.10)"); } if (PW.bOn) { ribbon("b", bcol, "rgba(59,130,246,0.10)"); }
		order.forEach(function (it, idx) { if (idx % 3 !== 0 && N > 60) return; if (PW.eOn) { drawVec(it, it.e, ecol, 1.4); } if (PW.bOn) { drawVec(it, it.b, bcol, 1.4); } });
		if (PW.tip && PW.pol !== "lin") { cx.strokeStyle = "rgba(255,255,255,0.4)"; cx.lineWidth = 1; cx.beginPath(); for (k = 0; k <= 40; k++) { var ph = k / 40 * TAU, f = pwField(0, -ph), p = P(0, f.ey, f.ez); if (k === 0) cx.moveTo(p[0], p[1]); else cx.lineTo(p[0], p[1]); } cx.stroke(); }
		/* labels */
		var ax = P(Lx * 0.5, 1.25, 0), bx = P(Lx * 0.5, 0, 1.25); cx.font = "bold 14px sans-serif"; if (PW.eOn) { cx.fillStyle = ecol; cx.fillText("E", ax[0] + 6, ax[1]); } if (PW.bOn) { cx.fillStyle = bcol; cx.fillText("B", bx[0] + 6, bx[1] + 14); } cx.fillStyle = "rgba(255,255,255,0.8)"; cx.fillText("direction of travel →", W - 160, H - 14);
		var lam = pwLam(), u0 = pwProj(0, 0, 0), u1 = pwProj(1, 0, 0), wl = Math.hypot(u1[0] - u0[0], u1[1] - u0[1]) * sc, bx0 = 16, by0 = H - 36; cx.strokeStyle = "rgba(255,255,255,0.7)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(bx0, by0); cx.lineTo(bx0 + wl, by0); cx.moveTo(bx0, by0 - 5); cx.lineTo(bx0, by0 + 5); cx.moveTo(bx0 + wl, by0 - 5); cx.lineTo(bx0 + wl, by0 + 5); cx.stroke(); cx.fillStyle = "rgba(255,255,255,0.9)"; cx.font = "12px sans-serif"; cx.fillText("one wavelength = " + si(lam, "m", 3), bx0, by0 + 18);
	}
	function pwReadouts() {
		var l = pwLam(), f = M.C / l, E0 = pwE0(), B0 = E0 / M.C, I = 0.5 * M.EPS0 * M.C * E0 * E0, h = 6.62607015e-34, Eph = h * f; $("em-pw-k").textContent = bandOf(l); $("em-pw-ks").textContent = "wavelength " + si(l, "m", 3);
		$("em-pw-f").textContent = si(f, "Hz", 3); $("em-pw-fs").textContent = "period " + si(1 / f, "s", 3); $("em-pw-b").textContent = si(B0, "T", 3); $("em-pw-i").textContent = si(I * (PW.pol === "lin" || PW.pol === "ell" ? 1 : 1.44), "W/m²", 3);
		$("em-pw-is").textContent = "photon " + (Eph / M.QE >= 0.001 ? si(Eph / M.QE, "eV", 3) : sig(Eph, 3) + " J") + (PW.pol === "circR" || PW.pol === "circL" ? " (circular: both components at full strength)" : "");
	}
	chips($("em-pw-pre"), PW_PRE.map(function (p) { return { name: p.n, l: p.l }; }), function (p) { PW.lk = Math.log10(p.l); pwSync(); });
	$("em-pw-l").oninput = function () { PW.lk = +this.value; $("em-pw-l-v").textContent = si(pwLam(), "m", 3); sset({ pw_lk: PW.lk }); };
	$("em-pw-e").oninput = function () { PW.ek = +this.value; $("em-pw-e-v").textContent = si(pwE0(), "V/m", 3); };
	$("em-pw-a").oninput = function () { PW.a = +this.value; $("em-pw-a-v").textContent = this.value; };
	$("em-pw-pol").onchange = function () { PW.pol = this.value; }; $("em-pw-b-on").onchange = function () { PW.bOn = this.checked; }; $("em-pw-e-on").onchange = function () { PW.eOn = this.checked; }; $("em-pw-tip").onchange = function () { PW.tip = this.checked; };
	$("em-pw-play").onclick = function () { PW.play = !PW.play; this.setAttribute("aria-pressed", String(PW.play)); this.textContent = PW.play ? "❚❚ Pause" : "▶ Play"; };
	wirePng("em-pw-png", pwv, pwDraw); wireFull("em-pw-full", pwv);
	pwv.cv.addEventListener("pointerdown", function (e) { pwv.cv.setPointerCapture(e.pointerId); PW.drag = { x: e.clientX, y: e.clientY, yaw: PW.yaw, pitch: PW.pitch }; });
	pwv.cv.addEventListener("pointermove", function (e) { if (!PW.drag) return; PW.yaw = PW.drag.yaw + (e.clientX - PW.drag.x) * 0.008; PW.pitch = Math.max(-1.4, Math.min(1.4, PW.drag.pitch + (e.clientY - PW.drag.y) * 0.008)); });
	function pwUp() { PW.drag = null; } pwv.cv.addEventListener("pointerup", pwUp); pwv.cv.addEventListener("pointercancel", pwUp);

	/* =================== loop and start =================== */
	var last = 0, tick = 0, views = { es: ev, ms: mv, pt: pv, wv: wvv, pw: pwv };
	function resizeAll() { var v = views[tab]; if (v) { v.resize(); if (tab === "es" || tab === "ms") { if (tab === "es") ES.dirty = true; else MS.dirty = true; } } }
	showers = { es: function () { resizeAll(); ES.dirty = true; }, ms: function () { resizeAll(); MS.dirty = true; }, pt: function () { resizeAll(); }, wv: function () { resizeAll(); }, pw: function () { resizeAll(); } };
	function frame(now) {
		requestAnimationFrame(frame); var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; if (document.hidden) return; tick++;
		if (tab === "es") { if (ES.play && ES.tests.length) esStepTests(dt); esDraw(); if (tick % 4 === 0) esReadouts(); }
		else if (tab === "ms") { msDraw(); if (tick % 4 === 0) msReadouts(); }
		else if (tab === "pt") { if (PT.play) ptStep(dt); ptDraw(); if (tick % 6 === 0) ptReadouts(); }
		else if (tab === "wv") { wvStep(); wvDraw(); if (tick % 6 === 0) wvReadouts(); }
		else if (tab === "pw") { if (PW.play) PW.phase += dt * 1.6; pwDraw(); if (tick % 8 === 0) pwReadouts(); }
	}
	window.addEventListener("resize", resizeAll); var roq = 0; if (window.ResizeObserver) Object.keys(views).forEach(function (k) { new ResizeObserver(function () { if (k === tab && !roq) roq = requestAnimationFrame(function () { roq = 0; resizeAll(); }); }).observe(views[k].st.parentNode); }); document.addEventListener("fullscreenchange", function () { setTimeout(resizeAll, 60); });
	/* initial state */
	ES.qk = num(saved.qk, -1, 1.3, 0); ES.nLines = Math.round(num(saved.nLines, 4, 40, 14)); ["lines", "arrows", "eq", "gauss"].forEach(function (k) { if (typeof saved["es_" + k] === "boolean") ES[k] = saved["es_" + k]; }); if (/^(none|v|e)$/.test(saved.es_col || "")) ES.col = saved.es_col; if (/^(3d|2d)$/.test(saved.es_mode || "")) ES.mode = saved.es_mode;
	MS.ik = num(saved.ik, -1, 2, 1); PT.Bk = num(saved.pt_B, -4, 1, 0); PT.spd = num(saved.pt_spd, -1.5, 1, -0.3); WV.lam = Math.round(num(saved.wv_lam, 8, 40, 16)); PW.lk = num(saved.pw_lk, -10, 3, -0.263);
	var qc = q.get("c"); if (qc) { try { ES.ch = qc.split(";").slice(0, 40).map(function (s) { var a = s.split(",").map(Number); if (a.length !== 3 || a.some(function (v) { return !isFinite(v); })) throw 0; return { x: a[0], y: a[1], q: a[2] * 1e-6 }; }); ES.VW = num(q.get("w"), 0.01, 1e4, 4); if (/^(3d|2d)$/.test(q.get("m") || "")) ES.mode = q.get("m"); } catch (e) { ES.ch = []; } } else esLoad(ES_PRE[0]);
	var qw = q.get("w") && tab === "ms" ? q.get("w") : null; if (qw) { try { MS.w = qw.split(";").slice(0, 40).map(function (s) { var a = s.split(",").map(Number); if (a.length !== 3 || a.some(function (v) { return !isFinite(v); })) throw 0; return { x: a[0] / 100, y: a[1] / 100, I: a[2] }; }); MS.VW = num(q.get("vw"), 0.01, 1e5, 40) / 100; } catch (e) { MS.w = []; } } else msLoad(MS_PRE[1]);
	$("em-es-lines").checked = ES.lines; $("em-es-arrows").checked = ES.arrows; $("em-es-eq").checked = ES.eq; $("em-es-gauss").checked = ES.gauss; $("em-es-col").value = ES.col; $("em-es-mode").value = ES.mode;
	if (q.get("sp") && SPEC[q.get("sp")]) { PT.sp = q.get("sp"); PT.Bk = num(q.get("B"), -4, 1, 0); PT.E = num(q.get("E"), -1, 1, 0); PT.vk = num(q.get("v"), 3, 8.46, 6); PT.a = num(q.get("a"), -180, 180, 0); if (/^(auto|no|yes)$/.test(q.get("rel") || "")) PT.rel = q.get("rel"); } else { PT.vk = 6; PT.E = 0; }
	syncEs(); syncMs(); ptSync(); ptLaunch(); $("em-pt-note").textContent = PT_PRE[0].note; $("em-wv-l").value = WV.lam; $("em-wv-l-v").textContent = WV.lam; $("em-wv-e").value = WV.n; $("em-wv-e-v").textContent = WV.n.toFixed(2); $("em-wv-b").value = WV.brush; $("em-wv-b-v").textContent = WV.brush; $("em-wv-s").value = WV.speed; $("em-wv-s-v").textContent = WV.speed; $("em-wv-scale").value = String(WV.scale);
	wvLoad(WV_PRE[0]); pwSync(); pwReadouts();
	setTab(tab, true); requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
	window.__em = { ES: ES, MS: MS, PT: PT, WV: WV, Y: Y, PW: PW };
})();
