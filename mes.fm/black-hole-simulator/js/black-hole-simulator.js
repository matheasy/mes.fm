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
			var rr = u > 1e-12 ? 1 / u : R; if (rr < rmin) rmin = rr;
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
		this.peri = []; this.prec = null; this.uLow = u0;
		var c = 1 / (2 * L * L); this.acc = function (u) { return -u + c + 1.5 * u * u; };
		this.c = c;
	};
	B.Orbit.prototype.step = function (dtau) {
		if (this.captured) return 0;
		var u = this.u, dphi = Math.min(0.04, Math.max(1e-6, dtau * this.L * u * u)), r = rk4(u, this.v, dphi, this.acc), vOld = this.v;
		var tauStep = dphi / (this.L * u * u);
		this.u = r[0]; this.v = r[1]; this.phi += dphi; this.tau += tauStep; this.t += this.E / (1 - 0.5 * (u + this.u)) * tauStep;
		if (this.u >= 1) { this.captured = true; this.u = 1; return tauStep; }
		if (this.u < this.uLow) this.uLow = this.u;
		if (vOld > 0 && this.v <= 0 && this.u - this.uLow > 2e-3 * this.u) {   /* periapsis: u was rising and has turned (a real swing, not the wobble of a circular orbit) */
			this.uLow = this.u;
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
			var hh = u > 0.35 ? h * 0.6 : h; stepLight(u, v, hh); u = _u; v = _v; th += hh;
			if (u >= 1) return { kind: 2 };
			var fcur = Math.cos(th) * n1 + Math.sin(th) * n2;
			if (disk && prevF * fcur < 0) {   /* crossed the disk plane: where? */
				var s = prevF / (prevF - fcur), uc = prevU + (u - prevU) * s, rc = 1 / uc, thc = prevTh + (th - prevTh) * s;
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

/* MES Black Hole Simulator -- mes.fm/black-hole-simulator
 * Four tabs around MESBH (lib.js: Schwarzschild light rays and orbits, the optical analogue, a per-pixel ray tracer, SI numbers):
 * bending light (top view, shadow, photon sphere, optical analogue), orbits (precession, ISCO, plunge, clocks), the picture (lensed sky + thin disk) and numbers.
 * State: localStorage mes-black-hole-simulator:v1; share links ?tab= plus each tab's own keys. All maths is node-tested (tool_apps_src/black-hole-simulator-tests.js).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bh");
	if (!root) return;
	var B = window.MESBH, PI = Math.PI, KEY = "mes-black-hole-simulator:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function num(v, lo, hi, d) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function fx(x, d) { return (+x).toFixed(d); }
	var q = new URLSearchParams(location.search), saved = sget();
	var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
	var tab = /^(light|orbit|image|numbers)$/.test(q.get("tab") || "") ? q.get("tab") : (/^(light|orbit|image|numbers)$/.test(saved.tab || "") ? saved.tab : "light");

	/* ---------- shared helpers ---------- */
	var toastT;
	function toast(msg) { var t = $("bh-toast"); if (!t) { t = document.createElement("div"); t.id = "bh-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copyLink(params) {
		var u = new URL(location.href); u.search = ""; u.searchParams.set("tab", tab);
		for (var k in params) u.searchParams.set(k, params[k]);
		var url = u.toString(), done = function () { toast("Link copied"); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	}
	function size(stage, canvas, aspect, maxH) {
		var wrap = stage.parentNode, W = wrap.clientWidth, H = Math.round(W / aspect);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill")) { var mh = window.innerHeight - 90; if (H > mh) { H = mh; W = Math.round(H * aspect); } }
		stage.style.width = W + "px"; stage.style.height = H + "px";
		var dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(W * dpr), ch = Math.round(H * dpr);
		if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
		return { W: cw, H: ch, dpr: dpr };
	}
	function chips(el, items, on) { el.innerHTML = items.map(function (it, i) { return '<button type="button" data-i="' + i + '">' + esc(it.name) + "</button>"; }).join(""); el.onclick = function (e) { var b = e.target.closest("button"); if (b) on(items[+b.dataset.i]); }; }

	/* ---------- tabs ---------- */
	var loops = {};
	function setTab(t, keepUrl) {
		tab = t; sset({ tab: t });
		Array.prototype.forEach.call(document.querySelectorAll("#bh [data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(document.querySelectorAll("#bh [data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		if (!keepUrl && history.replaceState) { try { var u = new URL(location.href); u.searchParams.set("tab", t); history.replaceState(null, "", u); } catch (e) {} }
		setTimeout(function () { if (loops[t] && loops[t].show) loops[t].show(); }, 0);
	}
	Array.prototype.forEach.call(document.querySelectorAll("#bh [data-tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });

	/* =====================================================================================================================
	   TAB 1: bending light
	   ===================================================================================================================== */
	var LT = { b: num(q.get("b") || saved.lb, -8, 8, 4), n: num(q.get("n") || saved.ln, 5, 61, 25) | 1, zoom: num(q.get("z") || saved.lz, 6, 40, 16), ph: saved.lph !== false, sh: saved.lsh !== false, ana: q.get("ana") === "1" || (q.get("ana") == null && !!saved.lana) };
	var lc = $("bh-lc"), lctx = lc.getContext("2d"), lstage = $("bh-lstage"), lrays = [], lana = [], lhi = null, lhiAna = null, lDirty = true, lT0 = performance.now();
	function pathInfo(pts) { var cum = [0], s = 0; for (var i = 2; i < pts.length; i += 2) { s += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); cum.push(s); } return cum; }
	function lraysCompute() {
		var Bm = LT.zoom * 0.48; lrays = []; lana = [];
		for (var i = 0; i < LT.n; i++) {
			var b = -Bm + 2 * Bm * i / (LT.n - 1); if (Math.abs(b) < 0.02) b = 0.02;
			var r = B.traceLight(b, 60, 0.01); r.cum = pathInfo(r.pts); r.b = b; lrays.push(r);
			if (LT.ana) { var a = B.traceAnalogue(b, 60); a.cum = pathInfo(a.pts); a.b = b; lana.push(a); }
		}
		lDirty = false;
	}
	function lhiCompute() {
		lhi = B.traceLight(LT.b, 60, 0.006); lhi.cum = pathInfo(lhi.pts);
		lhiAna = LT.ana ? B.traceAnalogue(LT.b, 60) : null; if (lhiAna) lhiAna.cum = pathInfo(lhiAna.pts);
		var fine = B.traceLight(LT.b, 2000, 0.004, false), ab = Math.abs(LT.b);
		$("bh-l-b").textContent = fx(LT.b, 2) + " rs";
		if (fine.captured) { $("bh-l-a").textContent = "falls in"; $("bh-l-as").textContent = "b is inside the shadow (below 2.598 rs)"; $("bh-l-r").textContent = "inside the horizon"; $("bh-l-rs").textContent = "this ray is swallowed"; $("bh-l-n").textContent = "–"; }
		else {
			var deg = fine.alpha * 180 / PI;
			$("bh-l-a").textContent = fx(deg, deg < 1 ? 3 : 2) + "°"; $("bh-l-as").textContent = ab > 6 ? "weak-field 2 rs/b = " + fx(2 / ab * 180 / PI, 3) + "°" : (fine.alpha > 2 * PI ? "more than one full turn" : "strong bending");
			$("bh-l-n").textContent = fx(1 / ab * 180 / PI, deg < 1 ? 3 : 2) + "°";
			$("bh-l-r").textContent = fx(fine.rmin, 2) + " rs"; $("bh-l-rs").textContent = fine.rmin < 1.5 + 1e-6 ? "" : fx(fine.rmin / 1.5, 2) + " × the photon sphere";
		}
		$("bh-lb-in").value = LT.b; $("bh-lb-v").textContent = fx(LT.b, 2);
	}
	function lPointAt(pts, cum, s) { var lo = 0, hi = cum.length - 1; while (lo < hi - 1) { var m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } var seg = cum[hi] - cum[lo] || 1, f = (s - cum[lo]) / seg; return [pts[2 * lo] + (pts[2 * hi] - pts[2 * lo]) * f, pts[2 * lo + 1] + (pts[2 * hi + 1] - pts[2 * lo + 1]) * f]; }
	function lDraw(now) {
		var d = size(lstage, lc, 16 / 9), W = d.W, H = d.H, s = W / LT.zoom, cx = W / 2, cy = H / 2, c = lctx, T = (now - lT0) / 1000;
		if (lDirty) lraysCompute();
		c.fillStyle = "#05070d"; c.fillRect(0, 0, W, H);
		if (LT.ana) {   /* the medium: n(rho) shown as a glow around the hole */
			var g = c.createRadialGradient(cx, cy, 0, cx, cy, s * 14);
			for (var k = 0; k <= 14; k++) { var rr = Math.max(1, 1 + k * 0.9), rho = B.rhoOfR(rr), nn = B.nIso(Math.max(rho, 0.2501)); g.addColorStop(Math.min(1, rr / 14), "rgba(70,150,200," + Math.min(0.5, (nn - 1) * 0.12).toFixed(3) + ")"); }
			c.fillStyle = g; c.beginPath(); c.arc(cx, cy, s * 14, 0, 2 * PI); c.fill();
		}
		function stroke(r, col, w, dash) {
			if (!r.pts || r.pts.length < 4) return; c.beginPath(); c.lineWidth = w; c.strokeStyle = col; c.setLineDash(dash || []);
			c.moveTo(cx + r.pts[0] * s, cy - r.pts[1] * s); for (var i = 2; i < r.pts.length; i += 2) c.lineTo(cx + r.pts[i] * s, cy - r.pts[i + 1] * s); c.stroke(); c.setLineDash([]);
		}
		var lw = Math.max(1, d.dpr * 1.1);
		for (var i = 0; i < lrays.length; i++) stroke(lrays[i], lrays[i].captured ? "rgba(255,120,80,0.55)" : "rgba(255,214,90,0.7)", lw);
		for (i = 0; i < lana.length; i++) stroke(lana[i], "rgba(90,220,255,0.9)", lw * 0.9, [4 * d.dpr, 4 * d.dpr]);
		/* photons moving along the rays */
		var allr = lrays.concat(lhi ? [lhi] : []); c.fillStyle = "#fff";
		for (i = 0; i < allr.length; i++) {
			var r = allr[i], len = r.cum[r.cum.length - 1], s0 = 60 - LT.zoom * 0.52, span = Math.max(1, len - s0), sd = s0 + ((T * 9 + i * 3.7) % span), p = lPointAt(r.pts, r.cum, Math.min(sd, len));
			c.globalAlpha = r === lhi ? 1 : 0.55; c.beginPath(); c.arc(cx + p[0] * s, cy - p[1] * s, d.dpr * (r === lhi ? 3 : 1.8), 0, 2 * PI); c.fill();
		}
		c.globalAlpha = 1;
		if (lhi) { stroke(lhi, "#ffffff", lw * 2.2); if (lhiAna) stroke(lhiAna, "#4fe0ff", lw * 1.4, [5 * d.dpr, 4 * d.dpr]); }
		c.setLineDash([5 * d.dpr, 5 * d.dpr]); c.lineWidth = Math.max(1, d.dpr);
		if (LT.ph) { c.strokeStyle = "rgba(255,255,255,0.55)"; c.beginPath(); c.arc(cx, cy, 1.5 * s, 0, 2 * PI); c.stroke(); }
		if (LT.sh) { c.strokeStyle = "rgba(180,140,255,0.8)"; c.beginPath(); c.arc(cx, cy, B.BCRIT * s, 0, 2 * PI); c.stroke(); }
		c.setLineDash([]);
		var hg = c.createRadialGradient(cx, cy, s * 0.9, cx, cy, s * 1.5); hg.addColorStop(0, "rgba(255,170,60,0.28)"); hg.addColorStop(1, "rgba(255,170,60,0)"); c.fillStyle = hg; c.beginPath(); c.arc(cx, cy, s * 1.5, 0, 2 * PI); c.fill();
		c.fillStyle = "#000"; c.beginPath(); c.arc(cx, cy, s, 0, 2 * PI); c.fill(); c.strokeStyle = "rgba(255,200,120,0.7)"; c.lineWidth = Math.max(1, d.dpr); c.stroke();
		c.font = Math.round(11 * d.dpr) + "px system-ui,sans-serif"; c.textBaseline = "middle";
		if (LT.sh) { c.fillStyle = "rgba(190,160,255,0.95)"; c.fillText("shadow edge b = 2.6 rs", cx + B.BCRIT * s * 0.72 + 6 * d.dpr, cy - B.BCRIT * s * 0.72 - 6 * d.dpr); }
		if (LT.ph) { c.fillStyle = "rgba(255,255,255,0.8)"; c.fillText("photon sphere 1.5 rs", cx - 1.5 * s * 0.72 - 118 * d.dpr, cy + 1.5 * s * 0.72 + 12 * d.dpr); }
		c.fillStyle = "rgba(255,200,120,0.9)"; c.fillText("horizon (1 rs)", cx - s * 0.62, cy + s * 0.02 + 0);
		$("bh-lbadge").textContent = "scale: the picture is " + LT.zoom + " rs wide" + (LT.ana ? " · dashed = optical analogue" : "");
	}
	function lSetB(py) { var r = lc.getBoundingClientRect(), y = -(py - r.top - r.height / 2) / (r.width / LT.zoom); LT.b = Math.max(-8, Math.min(8, Math.round(y * 100) / 100)); if (Math.abs(LT.b) < 0.02) LT.b = 0.02; sset({ lb: LT.b }); lhiCompute(); }
	var ldrag = false;
	lc.addEventListener("pointerdown", function (e) { ldrag = true; try { lc.setPointerCapture(e.pointerId); } catch (x) {} lSetB(e.clientY); e.preventDefault(); });
	lc.addEventListener("pointermove", function (e) { if (ldrag || e.pointerType === "mouse") lSetB(e.clientY); });
	lc.addEventListener("pointerup", function () { ldrag = false; });
	$("bh-lb-in").oninput = function () { LT.b = +this.value || 0.02; sset({ lb: LT.b }); lhiCompute(); };
	$("bh-ln-in").oninput = function () { LT.n = +this.value; $("bh-ln-v").textContent = LT.n; sset({ ln: LT.n }); lDirty = true; };
	$("bh-lz-in").oninput = function () { LT.zoom = +this.value; $("bh-lz-v").textContent = LT.zoom; sset({ lz: LT.zoom }); lDirty = true; };
	$("bh-l-ph").onchange = function () { LT.ph = this.checked; sset({ lph: LT.ph }); };
	$("bh-l-sh").onchange = function () { LT.sh = this.checked; sset({ lsh: LT.sh }); };
	$("bh-l-ana").onchange = function () { LT.ana = this.checked; sset({ lana: LT.ana }); lDirty = true; lhiCompute(); };
	$("bh-l-link").onclick = function () { copyLink({ b: LT.b, n: LT.n, z: LT.zoom, ana: LT.ana ? 1 : 0 }); };
	loops.light = { show: function () { lhiCompute(); }, draw: lDraw };

	/* =====================================================================================================================
	   TAB 2: orbits
	   ===================================================================================================================== */
	var OB = { r0: num(q.get("r") || saved.or, 1.6, 60, 30), k: num(q.get("k") || saved.ok, 0.2, 1.5, 0.8), speed: num(saved.os, 0.2, 4, 1), newt: saved.onewt !== false, isco: saved.oisco !== false };
	var oc = $("bh-oc"), octx = oc.getContext("2d"), ostage = $("bh-ostage"), orb = null, otrail = [], orun = true, oLast = 0, oView = 40;
	var OTRY = [
		{ name: "Circle at 10 rs", r: 10, k: 1 }, { name: "Slow precession (30 rs)", r: 30, k: 0.8 }, { name: "Fast precession (10 rs)", r: 10, k: 0.9 }, { name: "Swings out (25 rs)", r: 25, k: 1.15 },
		{ name: "At the ISCO (3 rs)", r: 3, k: 1 }, { name: "Just inside the ISCO: spirals in", r: 2.6, k: 0.97 }, { name: "Plunge", r: 8, k: 0.55 }
	];
	chips($("bh-o-try"), OTRY, function (p) { OB.r0 = p.r; OB.k = p.k; oSync(); oRestart(); });
	function oSync() { $("bh-or-in").value = OB.r0; $("bh-or-v").textContent = fx(OB.r0, 1); $("bh-ok-in").value = OB.k; $("bh-ok-v").textContent = fx(OB.k, 2); $("bh-os-in").value = OB.speed; $("bh-os-v").textContent = fx(OB.speed, 1) + "×"; sset({ or: OB.r0, ok: OB.k }); }
	function oRestart() {
		orb = new B.Orbit(OB.r0, OB.k); otrail = [];
		var c = orb.c, u0 = 1 / OB.r0, umin = 2 * c - u0, rApo = umin > 0.012 ? 1 / umin : OB.r0 * 2.2;
		oView = Math.max(6, Math.min(70, Math.max(OB.r0, rApo) * 1.18));
		$("bh-obadge").textContent = fx(orb.L, 2) + " rs·c angular momentum" + (orb.L < 2 ? " (below 2: it must plunge)" : "");
		oLast = 0;
	}
	function oStep(dt) {
		if (!orb || orb.captured) return;
		var target = 0.02 * Math.pow(OB.r0, 1.5) * OB.speed * Math.min(2, dt * 60), used = 0, guard = 0;
		while (used < target && guard++ < 4000 && !orb.captured) { used += orb.step(target - used) || 1e-9; var p = orb.pos(); otrail.push(p[0], p[1]); }
		if (otrail.length > 2 * 5000) otrail.splice(0, otrail.length - 2 * 5000);
	}
	function oDraw() {
		if (!orb) oRestart();
		var d = size(ostage, oc, 16 / 9), W = d.W, H = d.H, s = H / (2 * oView), cx = W / 2, cy = H / 2, c = octx;
		c.fillStyle = "#05070d"; c.fillRect(0, 0, W, H);
		c.setLineDash([5 * d.dpr, 5 * d.dpr]); c.lineWidth = Math.max(1, d.dpr);
		if (OB.isco) { c.strokeStyle = "rgba(120,200,160,0.6)"; c.beginPath(); c.arc(cx, cy, 3 * s, 0, 2 * PI); c.stroke(); }
		c.strokeStyle = "rgba(255,255,255,0.4)"; c.beginPath(); c.arc(cx, cy, 1.5 * s, 0, 2 * PI); c.stroke();
		if (OB.newt) {
			c.strokeStyle = "rgba(150,160,180,0.75)"; c.beginPath(); var first = true;
			for (var a = 0; a <= 2 * PI + 0.05; a += 0.03) { var uu = B.newtonU(orb, a); if (uu <= 0.005) { first = true; continue; } var rr = 1 / uu; if (first) { c.moveTo(cx + rr * Math.cos(a) * s, cy - rr * Math.sin(a) * s); first = false; } else c.lineTo(cx + rr * Math.cos(a) * s, cy - rr * Math.sin(a) * s); }
			c.stroke();
		}
		c.setLineDash([]);
		var n = otrail.length / 2; c.lineWidth = Math.max(1.2, d.dpr * 1.5);
		for (var i = 1; i < n; i += 1) { var al = i / n; c.strokeStyle = "rgba(255,210,100," + (al * al * 0.9).toFixed(3) + ")"; c.beginPath(); c.moveTo(cx + otrail[2 * i - 2] * s, cy - otrail[2 * i - 1] * s); c.lineTo(cx + otrail[2 * i] * s, cy - otrail[2 * i + 1] * s); c.stroke(); }
		c.fillStyle = "#000"; c.beginPath(); c.arc(cx, cy, s, 0, 2 * PI); c.fill(); c.strokeStyle = "rgba(255,200,120,0.7)"; c.stroke();
		var p = orb.pos(); c.fillStyle = orb.captured ? "#ff6a50" : "#fff"; c.beginPath(); c.arc(cx + p[0] * s, cy - p[1] * s, d.dpr * 4, 0, 2 * PI); c.fill();
		c.font = Math.round(11 * d.dpr) + "px system-ui,sans-serif"; c.fillStyle = "rgba(200,205,215,0.85)"; c.textBaseline = "middle";
		c.fillText("scale: " + fx(oView, 0) + " rs from the centre to the edge" , 10 * d.dpr, H - 12 * d.dpr);
		var r = 1 / orb.u, v = orb.speed(), tauStr = fx(orb.tau, orb.tau < 100 ? 1 : 0), tStr = fx(orb.t, orb.t < 100 ? 1 : 0);
		$("bh-o-r").textContent = fx(r, 2); $("bh-o-v").textContent = fx(v, 3) + " c";
		$("bh-o-tau").textContent = tauStr + " rs/c"; $("bh-o-dil").textContent = orb.captured ? "crossed the horizon (a distant clock never sees it)" : "distant clock: " + tStr + " · ratio " + fx(Math.sqrt(1 - orb.u), 3);
		if (orb.prec != null) { $("bh-o-p").textContent = fx(orb.prec * 180 / PI, 1) + "°"; var w = B.precessionWeak(orb.L); $("bh-o-ps").textContent = "weak-field formula: " + fx(w * 180 / PI, 1) + "° · after " + orb.peri.length + " periapsis passes"; }
		else { $("bh-o-p").textContent = orb.captured ? "plunged" : "–"; $("bh-o-ps").textContent = orb.captured ? "" : "wait for the second closest approach"; }
	}
	$("bh-or-in").oninput = function () { OB.r0 = +this.value; oSync(); oRestart(); };
	$("bh-ok-in").oninput = function () { OB.k = +this.value; oSync(); oRestart(); };
	$("bh-os-in").oninput = function () { OB.speed = +this.value; $("bh-os-v").textContent = fx(OB.speed, 1) + "×"; sset({ os: OB.speed }); };
	$("bh-o-newt").onchange = function () { OB.newt = this.checked; sset({ onewt: OB.newt }); };
	$("bh-o-isco").onchange = function () { OB.isco = this.checked; sset({ oisco: OB.isco }); };
	$("bh-oplay").onclick = function () { orun = !orun; this.textContent = orun ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", orun ? "true" : "false"); };
	$("bh-oreset").onclick = oRestart;
	$("bh-o-link").onclick = function () { copyLink({ r: OB.r0, k: OB.k }); };
	loops.orbit = { show: function () { oSync(); if (!orb) oRestart(); }, draw: function (now) { var dt = oLast ? Math.min(0.1, (now - oLast) / 1000) : 0.016; oLast = now; if (orun) oStep(dt); oDraw(); } };

	/* =====================================================================================================================
	   TAB 3: the picture
	   ===================================================================================================================== */
	var IM = { incl: num(q.get("i") || saved.ii, 0, 90, 78), D: num(q.get("d") || saved.id, 6, 60, 24), fov: num(q.get("f") || saved.ifov, 6, 90, 26), rout: num(q.get("o") || saved.io, 4, 20, 10), res: [180, 270, 400].indexOf(+(saved.ires)) >= 0 ? +saved.ires : (coarse ? 180 : 270), col: /^(heat|mono|doppler)$/.test(q.get("c") || saved.icol || "") ? (q.get("c") || saved.icol) : "heat", disk: saved.idisk !== false, stars: saved.istars !== false, ring: !!saved.iring };
	var ic = $("bh-ic"), ictx = ic.getContext("2d"), istage = $("bh-istage"), imgToken = 0, imgBuf = document.createElement("canvas"), sky = null;
	function makeSky() {
		var TW = 2048, TH = 1024, f = new Float32Array(TW * TH * 3), seed = 12345;
		function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
		for (var y = 0; y < TH; y++) for (var x = 0; x < TW; x++) {   /* a faint tilted band of "Milky Way" haze */
			var lon = x / TW * 2 * PI - PI, lat = (0.5 - y / TH) * PI, bx = Math.cos(lat) * Math.cos(lon), by = Math.cos(lat) * Math.sin(lon), bz = Math.sin(lat);
			var dist = Math.abs(0.35 * bx + 0.2 * by + 0.915 * bz), band = Math.exp(-dist * dist * 14) * (0.55 + 0.45 * Math.sin(lon * 7 + lat * 5) * Math.sin(lat * 9 - lon * 3)), o = (y * TW + x) * 3;
			f[o] = 0.020 + band * 0.06; f[o + 1] = 0.024 + band * 0.055; f[o + 2] = 0.045 + band * 0.075;
		}
		var stars = 9000;
		for (var i = 0; i < stars; i++) {
			var sx = rnd() * TW, sy = Math.acos(1 - 2 * rnd()) / PI * TH, mag = Math.pow(rnd(), 5), br = 0.25 + mag * 1.6, rad = 1 + (mag > 0.3 ? 1 : 0) + (mag > 0.8 ? 1 : 0), hue = rnd();
			var cr = hue < 0.2 ? 1 : (hue > 0.8 ? 0.7 : 0.9), cg = hue < 0.2 ? 0.85 : 0.92, cb = hue < 0.2 ? 0.7 : (hue > 0.8 ? 1 : 0.95);
			for (var dy = -rad; dy <= rad; dy++) for (var dx = -rad; dx <= rad; dx++) {
				var xx = ((sx + dx) % TW + TW) % TW | 0, yy = Math.max(0, Math.min(TH - 1, (sy + dy) | 0)), w = Math.exp(-(dx * dx + dy * dy) / (0.55 * rad * rad + 0.3)), o2 = (yy * TW + xx) * 3;
				f[o2] += br * w * cr; f[o2 + 1] += br * w * cg; f[o2 + 2] += br * w * cb;
			}
		}
		return { f: f, w: TW, h: TH };
	}
	function skyAt(dir) {
		var lon = Math.atan2(dir[1], dir[0]), lat = Math.asin(Math.max(-1, Math.min(1, dir[2]))), x = Math.floor((lon / (2 * PI) + 0.5) * sky.w) % sky.w, y = Math.max(0, Math.min(sky.h - 1, Math.floor((0.5 - lat / PI) * sky.h))), o = (y * sky.w + x) * 3;
		return [sky.f[o], sky.f[o + 1], sky.f[o + 2]];
	}
	function diskColor(rec) {
		var t = Math.max(0, Math.min(1, (rec.r - 3) / (IM.rout - 3 + 1e-6))), g = rec.g, rings = 0.84 + 0.12 * Math.sin(rec.r * 11.3) + 0.07 * Math.sin(rec.r * 27.1 + 1.3), edge = Math.min(1, (IM.rout - rec.r) / 1.4 + 0.02);
		var I = Math.pow(3 / rec.r, 1.7) * Math.pow(Math.max(0.05, g), 3.2) * 1.5 * rings * Math.max(0, edge), r, gg, b;
		if (IM.col === "doppler") { var s = Math.max(-1, Math.min(1, (g - 1) * 1.8)); r = s < 0 ? 1 : 1 - s * 0.7; gg = 0.55 - Math.abs(s) * 0.15; b = s > 0 ? 1 : 1 + s * 0.8; }
		else if (IM.col === "mono") { r = gg = b = 1; }
		else { r = 1; gg = 0.93 - 0.55 * t - 0.12 * (1 - g); b = 0.82 - 0.75 * t + 0.25 * (g - 1); }
		if (IM.col === "heat" && g > 1) { b += (g - 1) * 0.6; }
		return [Math.max(0, r * I), Math.max(0, gg * I), Math.max(0, Math.min(1.4, b) * I)];
	}
	function tone(v) { return 255 * (1 - Math.exp(-v * 1.35)); }
	function render() {
		if (!sky) sky = makeSky();
		var token = ++imgToken, Wp = IM.res, Hp = Math.round(Wp * 9 / 16), asp = Wp / Hp, cam = B.makeCamera(IM.D, IM.incl, IM.fov);
		imgBuf.width = Wp; imgBuf.height = Hp; var bctx = imgBuf.getContext("2d"), img = bctx.createImageData(Wp, Hp), data = img.data, row = 0;
		$("bh-ibadge").textContent = "Rendering…";
		var opt = { disk: IM.disk, rin: 3, rout: IM.rout, Rfar: Math.max(60, IM.D * 2) };
		function chunk() {
			if (token !== imgToken) return;
			var t0 = performance.now();
			while (row < Hp && performance.now() - t0 < 14) {
				for (var i = 0; i < Wp; i++) {
					var res = B.tracePixel(cam, ((i + 0.5) / Wp * 2 - 1) * asp, -((row + 0.5) / Hp * 2 - 1), opt), col, o = (row * Wp + i) * 4;
					if (res.disks && res.disks.length && IM.disk) col = diskColor(res.disks[0]);
					else if (res.kind === 0 && IM.stars) col = skyAt(res.dir);
					else if (res.kind === 0) col = [0.01, 0.012, 0.025];
					else col = [0, 0, 0];
					data[o] = tone(col[0]); data[o + 1] = tone(col[1]); data[o + 2] = tone(col[2]); data[o + 3] = 255;
				}
				row++;
			}
			bctx.putImageData(img, 0, 0); iPaint();
			if (row < Hp) setTimeout(chunk, 0); else $("bh-ibadge").textContent = "";
		}
		chunk();
	}
	function iPaint() {
		var d = size(istage, ic, 16 / 9), c = ictx; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
		c.fillStyle = "#000"; c.fillRect(0, 0, d.W, d.H); if (imgBuf.width) c.drawImage(imgBuf, 0, 0, d.W, d.H);
		if (IM.ring) {
			var cam = B.makeCamera(IM.D, IM.incl, IM.fov), sing = B.BCRIT * Math.sqrt(1 - 1 / IM.D) / IM.D, tanG = sing / Math.sqrt(1 - sing * sing), rpx = tanG / cam.tanHalf * (d.H / 2);
			c.setLineDash([6 * d.dpr, 5 * d.dpr]); c.strokeStyle = "rgba(180,140,255,0.9)"; c.lineWidth = Math.max(1, d.dpr * 1.2); c.beginPath(); c.arc(d.W / 2, d.H / 2, rpx, 0, 2 * PI); c.stroke(); c.setLineDash([]);
		}
	}
	var rTimer = 0;
	function irender() { clearTimeout(rTimer); rTimer = setTimeout(render, 120); }
	var ITRY = [
		{ name: "Edge-on (86°)", i: 86, d: 24, f: 26, o: 10 }, { name: "Tilted (70°)", i: 70, d: 24, f: 26, o: 10 }, { name: "Face-on (0°)", i: 0, d: 24, f: 26, o: 10 },
		{ name: "Close up", i: 80, d: 10, f: 50, o: 8 }, { name: "Far away", i: 78, d: 55, f: 9, o: 12 }
	];
	chips($("bh-i-try"), ITRY, function (p) { IM.incl = p.i; IM.D = p.d; IM.fov = p.f; IM.rout = p.o; iSync(); irender(); });
	function iSync() {
		$("bh-ii-in").value = IM.incl; $("bh-ii-v").textContent = IM.incl; $("bh-id-in").value = IM.D; $("bh-id-v").textContent = IM.D; $("bh-if-in").value = IM.fov; $("bh-if-v").textContent = IM.fov; $("bh-io-in").value = IM.rout; $("bh-io-v").textContent = IM.rout;
		$("bh-i-res").value = String(IM.res); $("bh-i-col").value = IM.col; $("bh-i-disk").checked = IM.disk; $("bh-i-stars").checked = IM.stars; $("bh-i-ring").checked = IM.ring;
		sset({ ii: IM.incl, id: IM.D, ifov: IM.fov, io: IM.rout });
	}
	[["ii", "incl"], ["id", "D"], ["if", "fov"], ["io", "rout"]].forEach(function (p) { $("bh-" + p[0] + "-in").oninput = function () { IM[p[1]] = +this.value; $("bh-" + p[0] + "-v").textContent = this.value; sset({ ii: IM.incl, id: IM.D, ifov: IM.fov, io: IM.rout }); irender(); }; });
	$("bh-i-res").onchange = function () { IM.res = +this.value; sset({ ires: IM.res }); irender(); };
	$("bh-i-col").onchange = function () { IM.col = this.value; sset({ icol: IM.col }); irender(); };
	$("bh-i-disk").onchange = function () { IM.disk = this.checked; sset({ idisk: IM.disk }); irender(); };
	$("bh-i-stars").onchange = function () { IM.stars = this.checked; sset({ istars: IM.stars }); irender(); };
	$("bh-i-ring").onchange = function () { IM.ring = this.checked; sset({ iring: IM.ring }); iPaint(); };
	$("bh-ipng").onclick = function () { iPaint(); var a = document.createElement("a"); a.download = "black-hole.png"; a.href = ic.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove(); };
	$("bh-ifull").onclick = function () { var w = istage.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	$("bh-i-link").onclick = function () { copyLink({ i: IM.incl, d: IM.D, f: IM.fov, o: IM.rout, c: IM.col }); };
	var iRendered = false;
	loops.image = { show: function () { iSync(); if (!iRendered) { iRendered = true; render(); } else iPaint(); }, draw: null };

	/* =====================================================================================================================
	   TAB 4: numbers
	   ===================================================================================================================== */
	var NU = { m: q.get("m") || saved.nm || "1", u: /^(msun|mearth|kg)$/.test(q.get("u") || saved.nu || "") ? (q.get("u") || saved.nu) : "msun", d: num(saved.nd, 0, 3, 1), len: saved.nlen || "2" };
	function parseNum(s) { s = String(s).replace(/,/g, "").replace(/\s+/g, ""); var v = Number(s); return isFinite(v) ? v : NaN; }
	function massKg() { var m = parseNum(NU.m); if (!(m > 0)) return NaN; return m * (NU.u === "msun" ? B.K.Msun : NU.u === "mearth" ? B.K.Mearth : 1); }
	function row(label, val, note) { return "<tr><td>" + label + (note ? "<small>" + note + "</small>" : "") + "</td><td>" + val + "</td></tr>"; }
	function nCalc() {
		var M = massKg(), t1 = $("bh-n-t1").tBodies[0], t2 = $("bh-n-t2").tBodies[0];
		if (!(M > 0)) { t1.innerHTML = row("Mass", "enter a positive number"); t2.innerHTML = ""; return; }
		var n = B.numbers(M), ratio = Math.max(1.0001, Math.pow(10, NU.d)), rr = ratio * n.rs, len = parseNum(NU.len); if (!(len > 0)) len = 2;
		$("bh-nd-v").textContent = fx(ratio, ratio < 10 ? 3 : 1) + " rs = " + B.formatLength(rr);
		var rho = n.density, water = rho / 1000;
		t1.innerHTML = row("Mass", M.toExponential(3) + " kg", fx(M / B.K.Msun, M / B.K.Msun < 1e-3 ? 9 : 3) + " solar masses · " + (M / B.K.Mearth).toExponential(2) + " Earth masses") +
			row("Horizon radius (Schwarzschild radius)", B.formatLength(n.rs), "2GM/c²: the point of no return") +
			row("Horizon diameter", B.formatLength(2 * n.rs)) + row("Photon sphere", B.formatLength(n.photon), "light can orbit here (unstable), 1.5 rs") +
			row("Shadow radius (as seen from far away)", B.formatLength(n.shadow), "2.6 rs: bigger than the horizon") + row("Innermost stable circular orbit", B.formatLength(n.isco), "3 rs") +
			row("Average density inside the horizon", rho >= 1e3 ? rho.toExponential(2) + " kg/m³" : fx(rho, 2) + " kg/m³", water > 1.5 ? water.toExponential(2) + " × water" : fx(water, 4) + " × water") +
			row("Hawking temperature", n.hawkingT < 1e-3 ? n.hawkingT.toExponential(2) + " K" : fx(n.hawkingT, 3) + " K", n.hawkingT < 2.725 ? "colder than the cosmic microwave background (2.7 K): it grows, not evaporates" : "hotter than the CMB: it loses mass") +
			row("Time to evaporate (if alone)", B.formatTime(n.lifetime), "Hawking radiation only");
		var dil = n.dilation(rr);
		t2.innerHTML = row("Distance from the centre", B.formatLength(rr), fx(ratio, 3) + " rs") +
			row("Clock slowdown", fx(dil, dil < 0.01 ? 5 : 3) + "×", "1 second there = " + (dil > 0 ? B.formatTime(1 / dil) : "forever") + " far away") +
			row("Escape speed", fx(n.escape(rr) / B.K.c, 4) + " c", ratio <= 1.0002 ? "at the horizon it is c" : "") +
			row("Circular orbit period", rr >= 3 * n.rs ? B.formatTime(n.orbitTime(rr)) : (rr >= 1.5 * n.rs ? "unstable" : "none"), rr >= 3 * n.rs ? "as counted by a distant clock" : (rr >= 1.5 * n.rs ? "between 1.5 and 3 rs orbits exist but are unstable" : "inside 1.5 rs no circular orbit exists")) +
			row("Tidal stretch across " + len + " m", B.formatSI(n.tidal(rr, len), "m/s²"), (n.tidal(rr, len) / B.K.g0).toPrecision(3) + " g between head and feet") +
			row("Where " + len + " m feels 1000 g of tide", B.formatLength(n.tidalRadius(len, 1000 * B.K.g0)), fx(n.tidalRadius(len, 1000 * B.K.g0) / n.rs, 3) + " rs" + (n.tidalRadius(len, 1000 * B.K.g0) < n.rs ? ": inside the horizon, so you cross it unharmed" : ": outside the horizon, torn apart before you get there"));
	}
	chips($("bh-n-try"), B.OBJECTS, function (o) { var m = o.M / B.K.Msun; if (m >= 1e-3) { NU.m = String(+m.toPrecision(4)); NU.u = "msun"; } else { NU.m = String(+(o.M / B.K.Mearth).toPrecision(4)); NU.u = "mearth"; } nSync(); nCalc(); });
	function nSync() { $("bh-n-m").value = NU.m; $("bh-n-u").value = NU.u; $("bh-nd-in").value = NU.d; $("bh-n-len").value = NU.len; sset({ nm: NU.m, nu: NU.u, nd: NU.d, nlen: NU.len }); }
	$("bh-n-m").oninput = function () { NU.m = this.value; sset({ nm: NU.m }); nCalc(); };
	$("bh-n-u").onchange = function () { NU.u = this.value; sset({ nu: NU.u }); nCalc(); };
	$("bh-nd-in").oninput = function () { NU.d = +this.value; sset({ nd: NU.d }); nCalc(); };
	$("bh-n-len").oninput = function () { NU.len = this.value; sset({ nlen: NU.len }); nCalc(); };
	loops.numbers = { show: function () { nSync(); nCalc(); }, draw: null };

	/* ---------- main loop + resize ---------- */
	function frame(now) {
		requestAnimationFrame(frame);
		if (document.hidden) return;
		var l = loops[tab]; if (l && l.draw) l.draw(now);
	}
	var rt;
	function onResize() { clearTimeout(rt); rt = setTimeout(function () { if (tab === "image") iPaint(); }, 80); }
	window.addEventListener("resize", onResize);
	document.addEventListener("fullscreenchange", function () { setTimeout(onResize, 60); });
	if (window.ResizeObserver) Array.prototype.forEach.call(document.querySelectorAll("#bh .bh-wrap"), function (w) { new ResizeObserver(onResize).observe(w); });

	/* ---------- go ---------- */
	$("bh-ln-in").value = LT.n; $("bh-ln-v").textContent = LT.n; $("bh-lz-in").value = LT.zoom; $("bh-lz-v").textContent = LT.zoom; $("bh-l-ph").checked = LT.ph; $("bh-l-sh").checked = LT.sh; $("bh-l-ana").checked = LT.ana;
	setTab(tab, true);
	requestAnimationFrame(frame);
})();
