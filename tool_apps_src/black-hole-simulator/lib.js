/* MES Black Hole Simulator -- pure maths (browser + node: require('./lib.js')).
 * Units for the geometry: G = c = 1 and the Schwarzschild radius rs = 2GM/c^2 = 1, so r is "in rs" and the horizon is at r = 1.
 * Light:     u = 1/r,  d2u/dth2 = -u + 1.5 u^2                  (null geodesic, th = angle in the orbital plane; impact parameter b = L/E)
 * Orbits:    d2u/dphi2 = -u + 1/(2 L^2) + 1.5 u^2               (L = angular momentum per unit mass in units of rs c; rs = 1)
 * Analogue:  light in isotropic coordinates moves like light in a medium n(rho) = (1 + 1/(4 rho))^3 / (1 - 1/(4 rho)), with r = rho (1 + 1/(4 rho))^2.
 * The numbers section uses SI (CODATA 2018 constants).
 */
(function (root) {
	"use strict";
	var B = {};
	var PI = Math.PI;
	B.BCRIT = 1.5 * Math.sqrt(3);          /* critical impact parameter: the shadow radius, 2.598 rs */
	B.PHOTON = 1.5; B.ISCO = 3; B.HORIZON = 1;

	function rk4(u, v, h, acc) { /* second order ODE u'' = acc(u) */
		var k1u = v, k1v = acc(u), k2u = v + h / 2 * k1v, k2v = acc(u + h / 2 * k1u), k3u = v + h / 2 * k2v, k3v = acc(u + h / 2 * k2u), k4u = v + h * k3v, k4v = acc(u + h * k3u);
		return [u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u), v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)];
	}
	var accLight = function (u) { return -u + 1.5 * u * u; };
	var _u = 0, _v = 0;
	function stepLight(u, v, h) {   /* the same RK4 without allocating: result in _u, _v (hot loop of the picture) */
		var k1u = v, k1v = -u + 1.5 * u * u;
		var u2 = u + h / 2 * k1u, v2 = v + h / 2 * k1v, k2v = -u2 + 1.5 * u2 * u2;
		var u3 = u + h / 2 * v2, v3 = v + h / 2 * k2v, k3v = -u3 + 1.5 * u3 * u3;
		var u4 = u + h * v3, v4 = v + h * k3v, k4v = -u4 + 1.5 * u4 * u4;
		_u = u + h / 6 * (k1u + 2 * v2 + 2 * v3 + v4); _v = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
	}

	/* ---------- light rays ---------- */
	/* A photon coming in from far away on the left with impact parameter b (b < 0 mirrors it). Returns {pts: [x, y, ...] (x to the right, y up), captured, alpha (deflection, rad), thetaEnd, rmin}.
	   R = the distance it starts and ends at; dth = angular step. */
	B.traceLight = function (b, R, dth, wantPts) {
		R = R || 40; dth = dth || 0.01;
		var sgn = b < 0 ? -1 : 1, bb = Math.abs(b), u0 = 1 / R, delta = Math.asin(Math.min(1, bb / R)), th = delta, u = u0, v = Math.sqrt(Math.max(0, 1 / (bb * bb) - u0 * u0 * (1 - u0))), pts = wantPts === false ? null : [], captured = false, rmin = R, n = 0;
		var th0 = delta;
		if (pts) pts.push(-R * Math.cos(th) , sgn * R * Math.sin(th));
		while (n++ < 400000) {
			var r = rk4(u, v, dth, accLight), un = r[0], vn = r[1], uPrev = u;
			th += dth; u = un; v = vn;
			if (u >= 1) { captured = true; if (pts) { pts.push(-Math.cos(th), sgn * Math.sin(th)); } break; }
			var rr = 1 / u; if (rr < rmin) rmin = rr;
			if (pts && (n % 2 === 0 || rr < 6)) pts.push(-rr * Math.cos(th), sgn * rr * Math.sin(th));
			if (u <= u0 && v < 0) {   /* back at the start radius: interpolate the exact angle where u = u0 */
				var f = (uPrev - u0) / (uPrev - u); th = th - dth * (1 - f); rr = R;
				if (pts) pts.push(-rr * Math.cos(th), sgn * rr * Math.sin(th));
				break;
			}
			if (th > 12 * PI) break;
		}
		return { pts: pts, captured: captured, alpha: captured ? NaN : (th - th0) - (PI - 2 * delta), thetaEnd: th, rmin: rmin, sgn: sgn };
	};
	B.deflectionWeak = function (b) { return 2 / b + (15 * PI / 16) / (b * b); };   /* rs = 1: 4GM/(b c^2) + (15 pi/4)(GM/(b c^2))^2 */

	/* ---------- the optical analogue ---------- */
	B.nIso = function (rho) { var q = 1 / (4 * rho); return Math.pow(1 + q, 3) / (1 - q); };
	B.rOfRho = function (rho) { var q = 1 + 1 / (4 * rho); return rho * q * q; };
	B.rhoOfR = function (r) { return (r - 0.5 + Math.sqrt(Math.max(0, r * r - r))) / 2; };
	/* a ray through n(rho) from the far left at height y0; returns {pts in Schwarzschild plot coordinates, alpha, captured} */
	B.traceAnalogue = function (b, X0, wantPts) {
		X0 = X0 || 60;
		var sgn = b < 0 ? -1 : 1, x = -X0, y = Math.abs(b), px = 1, py = 0, pts = wantPts === false ? null : [], captured = false, n = 0, e = 1e-4;
		function nAt(x, y) { return B.nIso(Math.max(0.2501, Math.sqrt(x * x + y * y))); }
		function grad(x, y) { return [(nAt(x + e, y) - nAt(x - e, y)) / (2 * e), (nAt(x, y + e) - nAt(x, y - e)) / (2 * e)]; }
		function plot(x, y) { var rho = Math.sqrt(x * x + y * y), s = B.rOfRho(rho) / rho; return [x * s, sgn * y * s]; }
		var n0 = nAt(x, y); px = n0; py = 0;
		if (pts) { var p0 = plot(x, y); pts.push(p0[0], p0[1]); }
		while (n++ < 600000) {
			var rho = Math.sqrt(x * x + y * y);
			if (rho < 0.2502) { captured = true; break; }
			var ds = Math.max(0.004, Math.min(2, 0.03 * (rho - 0.25)));
			var nn = nAt(x, y), g = grad(x, y);
			var mx = x + px / nn * ds / 2, my = y + py / nn * ds / 2, mn = nAt(mx, my), g2 = grad(mx, my), mpx = px + g[0] * ds / 2, mpy = py + g[1] * ds / 2;
			x += mpx / mn * ds; y += mpy / mn * ds; px += g2[0] * ds; py += g2[1] * ds;
			if (pts && (n % 3 === 0 || rho < 5)) { var p = plot(x, y); pts.push(p[0], p[1]); }
			if (x > X0 || x * x + y * y > X0 * X0 * 4 && x > 0) break;
		}
		var alpha = captured ? NaN : Math.atan2(py, px) * -1;   /* positive = bent towards the hole (downwards for y > 0) */
		if (pts && captured) { var q = plot(x, y); pts.push(q[0], q[1]); }
		return { pts: pts, captured: captured, alpha: alpha };
	};

	/* ---------- orbits of a massive particle (rs = 1) ---------- */
	B.circularL = function (r) { return r > 1.5 ? Math.sqrt(0.5 * r * r / (r - 1.5)) : NaN; };
	B.circularV = function (r) { return Math.sqrt(0.5 / (r - 1)); };   /* speed measured by a static observer, in c */
	B.Orbit = function (r0, k) {
		var u0 = 1 / r0, Lc = B.circularL(r0), L = k * Lc;
		this.r0 = r0; this.L = L; this.k = k;
		this.u = u0; this.v = 0; this.phi = 0; this.tau = 0; this.t = 0; this.captured = false;
		this.E = Math.sqrt((1 - u0) * (1 + L * L * u0 * u0));
		this.peri = []; this.prec = null;
		var c = 1 / (2 * L * L); this.acc = function (u) { return -u + c + 1.5 * u * u; };
		this.c = c;
	};
	B.Orbit.prototype.step = function (dtau) {
		if (this.captured) return 0;
		var u = this.u, dphi = Math.min(0.04, Math.max(1e-6, dtau * this.L * u * u)), r = rk4(u, this.v, dphi, this.acc), vOld = this.v;
		var tauStep = dphi / (this.L * u * u);
		this.u = r[0]; this.v = r[1]; this.phi += dphi; this.tau += tauStep; this.t += this.E / (1 - 0.5 * (u + this.u)) * tauStep;
		if (this.u >= 1) { this.captured = true; this.u = 1; return tauStep; }
		if (vOld > 0 && this.v <= 0) {   /* periapsis: u was rising and has turned */
			var f = vOld / (vOld - this.v), ph = this.phi - dphi * (1 - f);
			this.peri.push(ph);
			if (this.peri.length > 1) this.prec = this.peri[this.peri.length - 1] - this.peri[this.peri.length - 2] - 2 * PI;
		}
		return tauStep;
	};
	B.Orbit.prototype.pos = function () { var r = 1 / this.u; return [r * Math.cos(this.phi), r * Math.sin(this.phi)]; };
	B.Orbit.prototype.speed = function () { /* local speed measured by a static observer, in c */
		var u = this.u, f = 1 - u, vr2 = (this.E * this.E - f * (1 + this.L * this.L * u * u)) / (this.E * this.E), vt = this.L * u * Math.sqrt(f) / this.E;
		return Math.sqrt(Math.max(0, Math.max(0, vr2) + vt * vt));
	};
	B.newtonU = function (orb, phi) { return orb.c + (1 / orb.r0 - orb.c) * Math.cos(phi); };
	/* GR periapsis advance per orbit for a weakly curved ellipse: 6 pi G M / (c^2 p) with p = 2 L^2 (rs = 1) */
	B.precessionWeak = function (L) { return 3 * PI / (2 * L * L); };
	B.minL = 2;   /* below this angular momentum (units rs c) a particle always plunges; at 2 it is marginally bound */

	/* ---------- the picture: a camera at distance D looking at the hole; a thin disk and a star sky ---------- */
	/* Trace one pixel. Returns {kind: 0 sky, 1 disk, 2 shadow, ...}. cam = {D, e1, e2basis...} are prepared by B.makeCamera. */
	B.makeCamera = function (D, incl, fov) {
		var pc = [1, 0, 0], f = [-1, 0, 0], up = [0, 0, 1], right = [0, 1, 0];
		var i = incl * PI / 180, n = [Math.cos(i), 0, Math.sin(i)];
		return { D: D, pc: pc, f: f, up: up, right: right, n: n, tanHalf: Math.tan(fov * PI / 360) };
	};
	var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
	B.tracePixel = function (cam, sx, sy, opt) {
		/* sx, sy in [-1, 1] across the picture (sx right, sy up, scaled by aspect already) */
		var d = [cam.f[0] + cam.tanHalf * (sx * cam.right[0] + sy * cam.up[0]), cam.f[1] + cam.tanHalf * (sx * cam.right[1] + sy * cam.up[1]), cam.f[2] + cam.tanHalf * (sx * cam.right[2] + sy * cam.up[2])];
		var dl = Math.sqrt(dot(d, d)); d = [d[0] / dl, d[1] / dl, d[2] / dl];
		var D = cam.D, cosg = -dot(d, cam.pc), sing = Math.sqrt(Math.max(0, 1 - cosg * cosg));   /* angle from the inward radial direction */
		var e1 = cam.pc, e2 = sing > 1e-9 ? [(d[0] + cosg * e1[0]) / sing, (d[1] + cosg * e1[1]) / sing, (d[2] + cosg * e1[2]) / sing] : [0, 1, 0];
		var b = D * sing / Math.sqrt(1 - 1 / D), u0 = 1 / D;
		var v0sq = 1 / (b * b) - u0 * u0 * (1 - u0);
		if (v0sq <= 0 && sing > 0.5) { /* looking away from the hole */ }
		var inward = cosg > 0, u = u0, v = inward ? Math.sqrt(Math.max(0, v0sq)) : -Math.sqrt(Math.max(0, v0sq));
		var th = 0, h = opt && opt.h || 0.03, Rfar = opt && opt.Rfar || 60, disk = opt && opt.disk, rin = opt && opt.rin || 3, rout = opt && opt.rout || 9;
		var n1 = dot(e1, cam.n), n2 = dot(e2, cam.n), prevF = n1, prevU = u, prevTh = 0, steps = 0, passes = 0, hit = null, acc = null;
		while (steps++ < 700) {
			var hh = u > 0.35 ? h * 0.6 : h; stepLight(u, v, hh); u = _u; v = _v; th += hh; h = hh === h ? h : h;
			if (u >= 1) return { kind: 2 };
			var fcur = Math.cos(th) * n1 + Math.sin(th) * n2;
			if (disk && prevF * fcur < 0) {   /* crossed the disk plane: where? */
				var s = prevF / (prevF - fcur), uc = prevU + (u - prevU) * s, rc = 1 / uc, thc = prevTh + h * s;
				if (rc >= rin && rc <= rout) {
					/* disk velocity direction: n x rhat; photon direction (backwards along the traced ray) at the crossing */
					var ch = Math.cos(thc), sh = Math.sin(thc), rh = [ch * e1[0] + sh * e2[0], ch * e1[1] + sh * e2[1], ch * e1[2] + sh * e2[2]];
					var thh = [-sh * e1[0] + ch * e2[0], -sh * e1[1] + ch * e2[1], -sh * e1[2] + ch * e2[2]];
					var vloc = -(v) / Math.max(uc, 1e-9);   /* dr/dth * u... direction of travel along the traced ray: (-u'/u) rhat + that */
					var tx = [vloc * rh[0] + thh[0], vloc * rh[1] + thh[1], vloc * rh[2] + thh[2]], tl = Math.sqrt(dot(tx, tx)); tx = [tx[0] / tl, tx[1] / tl, tx[2] / tl];
					var vd = [cam.n[1] * rh[2] - cam.n[2] * rh[1], cam.n[2] * rh[0] - cam.n[0] * rh[2], cam.n[0] * rh[1] - cam.n[1] * rh[0]];
					var beta = Math.sqrt(0.5 / (rc - 1)), cosa = -dot(tx, vd), gam = 1 / Math.sqrt(1 - beta * beta), dop = 1 / (gam * (1 - beta * cosa));
					var grav = Math.sqrt(1 - 1 / rc) / Math.sqrt(1 - 1 / D), gfac = dop * grav;
					var rec = { kind: 1, r: rc, g: gfac, order: passes, rad: rc };
					passes++;
					if (!acc) acc = []; acc.push(rec);
					if (passes >= 3) break;
				}
			}
			prevF = fcur; prevU = u; prevTh = th;
			if (u <= 1 / Rfar && v < 0) {
				var rr = 1 / u, ch2 = Math.cos(th), sh2 = Math.sin(th), rh2 = [ch2 * e1[0] + sh2 * e2[0], ch2 * e1[1] + sh2 * e2[1], ch2 * e1[2] + sh2 * e2[2]], th2 = [-sh2 * e1[0] + ch2 * e2[0], -sh2 * e1[1] + ch2 * e2[1], -sh2 * e1[2] + ch2 * e2[2]], vr = -v / u;
				var o = [vr * rh2[0] + th2[0], vr * rh2[1] + th2[1], vr * rh2[2] + th2[2]], ol = Math.sqrt(dot(o, o));
				return { kind: 0, dir: [o[0] / ol, o[1] / ol, o[2] / ol], disks: acc };
			}
			if (th > 6 * PI) break;
		}
		return { kind: acc ? 3 : 2, disks: acc };
	};

	/* ---------- numbers ---------- */
	var K = B.K = { G: 6.67430e-11, c: 299792458, hbar: 1.054571817e-34, kB: 1.380649e-23, Msun: 1.98847e30, Mearth: 5.9722e24, ly: 9.4607304725808e15, AU: 1.495978707e11, g0: 9.80665, year: 3.15576e7 };
	B.numbers = function (M) { /* M in kg */
		var rs = 2 * K.G * M / (K.c * K.c);
		return {
			M: M, rs: rs, photon: 1.5 * rs, shadow: B.BCRIT * rs, isco: 3 * rs,
			density: M / (4 / 3 * PI * rs * rs * rs),
			gravity: K.c * K.c * K.c * K.c / (4 * K.G * M),          /* surface gravity (acceleration of a static observer just outside the horizon is infinite; this is the usual kappa) */
			hawkingT: K.hbar * Math.pow(K.c, 3) / (8 * PI * K.G * M * K.kB),
			lifetime: 5120 * PI * K.G * K.G * Math.pow(M, 3) / (K.hbar * Math.pow(K.c, 4)),   /* s */
			orbitTime: function (rr) { return 2 * PI * Math.sqrt(rr * rr * rr / (K.G * M)); },
			dilation: function (rr) { return rr > rs ? Math.sqrt(1 - rs / rr) : 0; },
			escape: function (rr) { return rr > rs ? K.c * Math.sqrt(rs / rr) : K.c; },
			tidal: function (rr, len) { return 2 * K.G * M * len / (rr * rr * rr); },
			tidalRadius: function (len, a) { return Math.cbrt(2 * K.G * M * len / a); }
		};
	};
	B.formatSI = function (x, unit) {
		if (!isFinite(x)) return "–";
		if (x === 0) return "0 " + unit;
		var a = Math.abs(x), pre = [[1e24, "Y"], [1e21, "Z"], [1e18, "E"], [1e15, "P"], [1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"]];
		if (a >= 1e27 || a < 1e-9) return x.toExponential(2) + " " + unit;
		for (var i = 0; i < pre.length; i++) if (a >= pre[i][0]) return +(x / pre[i][0]).toPrecision(3) + " " + pre[i][1] + unit;
		return x.toExponential(2) + " " + unit;
	};
	B.formatLength = function (m) {
		var a = Math.abs(m);
		if (a >= 0.5 * K.ly * 1e3) return +(m / K.ly).toPrecision(3) + " light-years";
		if (a >= 0.1 * K.AU) return +(m / K.AU).toPrecision(3) + " AU";
		if (a >= 1e3) return +(m / 1e3).toPrecision(4) + " km";
		if (a >= 1) return +m.toPrecision(3) + " m";
		if (a >= 1e-3) return +(m * 1e3).toPrecision(3) + " mm";
		return m.toExponential(2) + " m";
	};
	B.formatTime = function (s) {
		if (!isFinite(s)) return "–";
		var a = Math.abs(s);
		if (a < 1e-3) return s.toExponential(2) + " s";
		if (a < 120) return +s.toPrecision(3) + " s";
		if (a < 7200) return +(s / 60).toPrecision(3) + " minutes";
		if (a < 172800) return +(s / 3600).toPrecision(3) + " hours";
		if (a < 2 * K.year) return +(s / 86400).toPrecision(3) + " days";
		var y = s / K.year;
		return y < 1e6 ? +y.toPrecision(3) + " years" : y.toExponential(2) + " years";
	};
	B.OBJECTS = [
		{ id: "sun", name: "The Sun (as a black hole)", M: K.Msun },
		{ id: "earth", name: "The Earth (as a black hole)", M: K.Mearth },
		{ id: "cygx1", name: "Cygnus X-1 (21 solar masses)", M: 21.2 * K.Msun },
		{ id: "gw150914", name: "GW150914 merger remnant (62 M☉)", M: 62 * K.Msun },
		{ id: "sgra", name: "Sagittarius A* (4.3 million M☉)", M: 4.3e6 * K.Msun },
		{ id: "m87", name: "M87* (6.5 billion M☉)", M: 6.5e9 * K.Msun },
		{ id: "ton618", name: "TON 618 (66 billion M☉)", M: 6.6e10 * K.Msun }
	];
	if (typeof module !== "undefined" && module.exports) module.exports = B; else root.MESBH = B;
})(typeof window !== "undefined" ? window : this);
