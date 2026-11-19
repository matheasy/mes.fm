/* MES Space Shuttle Simulator: pure orbital maths in SI units (metres, seconds, kilograms, radians).
   No DOM. Runs in node too: require('./tool_apps_src/space-shuttle-simulator/lib.js'). Tests: tool_apps_src/space-shuttle-simulator-tests.js
   Model: two-body Kepler orbits around a spherical Earth, plus the secular J2 drift of the node and perigee (optional),
   impulsive burns, an exponential-layer atmosphere (US Standard 1976 fit, Vallado table 8-4) and a planar lifting entry. */
(function (root) {
	"use strict";
	var S = {};
	var MU = S.MU = 3.986004418e14;        // Earth GM, m^3/s^2
	var RE = S.RE = 6378137;               // equatorial radius, m
	var J2 = S.J2 = 1.08262668e-3;
	var WE = S.WE = 7.2921159e-5;          // Earth rotation, rad/s
	var G0 = S.G0 = 9.80665;
	S.MU_MOON = 4.9048695e12; S.R_MOON = 1737400; S.D_MOON = 384400e3; S.SOI_MOON = 66100e3;
	S.EI_ALT = 120000;                      // entry interface altitude used by the Shuttle (400,000 ft = 121.9 km)
	var PI = Math.PI, TAU = 2 * PI, D2R = PI / 180;
	S.D2R = D2R;

	/* ---------- vectors ---------- */
	function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function norm(a) { return Math.sqrt(dot(a, a)); }
	function unit(a) { var n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
	S.v = { add: add, sub: sub, mul: mul, dot: dot, cross: cross, norm: norm, unit: unit };
	function wrap(a) { a %= TAU; return a < 0 ? a + TAU : a; }
	function wrapPi(a) { a = wrap(a); return a > PI ? a - TAU : a; }
	S.wrap = wrap; S.wrapPi = wrapPi;

	/* ---------- simple orbit formulas ---------- */
	S.circV = function (alt) { return Math.sqrt(MU / (RE + alt)); };
	S.period = function (a) { return TAU * Math.sqrt(a * a * a / MU); };
	S.visViva = function (r, a) { return Math.sqrt(MU * (2 / r - 1 / a)); };
	S.escV = function (r) { return Math.sqrt(2 * MU / r); };
	S.hohmann = function (r1, r2) {
		var a = (r1 + r2) / 2, v1 = Math.sqrt(MU / r1), v2 = Math.sqrt(MU / r2);
		var vp = S.visViva(r1, a), va = S.visViva(r2, a);
		return { dv1: vp - v1, dv2: v2 - va, total: Math.abs(vp - v1) + Math.abs(v2 - va), tof: S.period(a) / 2, a: a };
	};
	S.planeChange = function (v, di) { return 2 * v * Math.sin(Math.abs(di) / 2); };
	/* Hohmann with the plane change done together with the second (slower) burn */
	S.hohmannPlane = function (r1, r2, di) {
		var h = S.hohmann(r1, r2), va = S.visViva(r2, h.a), v2 = Math.sqrt(MU / r2);
		var dv2 = Math.sqrt(va * va + v2 * v2 - 2 * va * v2 * Math.cos(di));
		return { dv1: h.dv1, dv2: dv2, total: Math.abs(h.dv1) + dv2, tof: h.tof };
	};
	/* angle the target must lead the chaser by when a Hohmann transfer from r1 to r2 starts */
	S.leadAngle = function (r1, r2) { var h = S.hohmann(r1, r2); return PI - Math.sqrt(MU / (r2 * r2 * r2)) * h.tof; };
	/* time until the phase angle (target minus chaser, rad) equals `need`, with mean motions n1 (chaser), n2 (target) */
	S.waitFor = function (phase, need, n1, n2) {
		var rel = n2 - n1;                     // rate the phase changes
		if (Math.abs(rel) < 1e-12) return Infinity;
		var d = need - phase; d = rel < 0 ? wrap(d) - TAU : wrap(d);
		if (rel < 0 && d > 0) d -= TAU;
		var t = d / rel; if (t < 0) t += TAU / Math.abs(rel);
		return t;
	};
	S.rocketDv = function (m0, mProp, isp) { return isp * G0 * Math.log(m0 / (m0 - mProp)); };
	S.propFor = function (m0, dv, isp) { return m0 * (1 - Math.exp(-Math.abs(dv) / (isp * G0))); };
	S.SHUTTLE = { mass: 115000, omsProp: 10830, isp: 316, entryMass: 95000, area: 249.9, cd: 0.84, ld: 1.0, noseR: 0.8 };
	S.j2Rates = function (a, e, i) {
		var p = a * (1 - e * e), n = Math.sqrt(MU / (a * a * a)), k = 1.5 * n * J2 * (RE / p) * (RE / p);
		return { raan: -k * Math.cos(i), argp: 0.5 * k * (5 * Math.cos(i) * Math.cos(i) - 1) };
	};
	S.sunSyncInc = function (alt) { // inclination whose node turns 360 degrees a year
		var a = RE + alt, n = Math.sqrt(MU / (a * a * a)), need = TAU / (365.2422 * 86400);
		var c = -need / (1.5 * n * J2 * (RE / a) * (RE / a));
		return Math.abs(c) <= 1 ? Math.acos(c) : NaN;
	};

	/* ---------- elements ---------- */
	/* returns a, e, i, raan, argp, nu (rad), plus handy numbers. Circular orbits use argp = 0 (nu = argument of latitude),
	   equatorial ones raan = 0 (argp from the x axis). */
	S.rv2el = function (r, v) {
		var rn = norm(r), vn = norm(v), h = cross(r, v), hn = norm(h);
		var nvec = [-h[1], h[0], 0], nn = norm(nvec);
		var ev = sub(mul(r, vn * vn / MU - 1 / rn), mul(v, dot(r, v) / MU)), e = norm(ev);
		var energy = vn * vn / 2 - MU / rn, a = e < 1 - 1e-12 || e > 1 + 1e-12 ? -MU / (2 * energy) : Infinity;
		var i = Math.acos(Math.max(-1, Math.min(1, h[2] / hn)));
		var eqt = nn < 1e-9 * hn, circ = e < 1e-9, raan, argp, nu;
		raan = eqt ? 0 : wrap(Math.atan2(nvec[1], nvec[0]));
		var nhat = eqt ? [1, 0, 0] : unit(nvec), qhat = unit(cross(h, nhat)); // in-plane basis: node line and 90 deg ahead
		if (circ) { argp = 0; nu = wrap(Math.atan2(dot(r, qhat), dot(r, nhat))); }
		else {
			argp = wrap(Math.atan2(dot(ev, qhat), dot(ev, nhat)));
			nu = wrap(Math.atan2(dot(r, qhat), dot(r, nhat)) - argp);
		}
		var p = hn * hn / MU, rp = p / (1 + e), ra = e < 1 ? p / (1 - e) : Infinity;
		return { a: a, e: e, i: i, raan: raan, argp: argp, nu: nu, h: hn, p: p, energy: energy, rp: rp, ra: ra,
			hp: rp - RE, ha: ra - RE, T: e < 1 ? S.period(a) : Infinity, eqt: eqt };
	};
	S.el2rv = function (el) {
		var p = el.p != null ? el.p : el.a * (1 - el.e * el.e), nu = el.nu, e = el.e;
		var rpf = p / (1 + e * Math.cos(nu)), sq = Math.sqrt(MU / p);
		var P = [rpf * Math.cos(nu), rpf * Math.sin(nu)], V = [-sq * Math.sin(nu), sq * (e + Math.cos(nu))];
		var cO = Math.cos(el.raan), sO = Math.sin(el.raan), cw = Math.cos(el.argp), sw = Math.sin(el.argp), ci = Math.cos(el.i), si = Math.sin(el.i);
		var m11 = cO * cw - sO * sw * ci, m12 = -cO * sw - sO * cw * ci, m21 = sO * cw + cO * sw * ci, m22 = -sO * sw + cO * cw * ci, m31 = sw * si, m32 = cw * si;
		return { r: [m11 * P[0] + m12 * P[1], m21 * P[0] + m22 * P[1], m31 * P[0] + m32 * P[1]],
			v: [m11 * V[0] + m12 * V[1], m21 * V[0] + m22 * V[1], m31 * V[0] + m32 * V[1]] };
	};
	S.nu2M = function (nu, e) {
		var E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
		return wrap(E - e * Math.sin(E));
	};
	S.M2nu = function (M, e) {
		M = wrap(M); var E = e < 0.8 ? M : PI;
		for (var k = 0; k < 50; k++) { var d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-13) break; }
		return wrap(2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)));
	};

	/* universal-variable Kepler propagation (any conic). Curtis, algorithms 3.3 / 3.4 */
	function stC(z) { return z > 1e-8 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-8 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24; }
	function stS(z) { if (z > 1e-8) { var s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); } if (z < -1e-8) { var q = Math.sqrt(-z); return (Math.sinh(q) - q) / (q * q * q); } return 1 / 6 - z / 120; }
	S.propagate = function (r0, v0, dt) {
		var r0n = norm(r0), vn = norm(v0), alpha = 2 / r0n - vn * vn / MU, sm = Math.sqrt(MU);
		if (alpha > 0) { var T = TAU / Math.sqrt(MU * alpha * alpha * alpha); dt = dt % T; }
		if (Math.abs(dt) < 1e-9) return { r: r0.slice(), v: v0.slice() };
		var vr0 = dot(r0, v0) / r0n, chi = sm * Math.abs(alpha) * dt;
		if (!(alpha > 1e-12)) chi = sm * dt / r0n;
		for (var k = 0; k < 200; k++) {
			var z = alpha * chi * chi, C = stC(z), Ss = stS(z);
			var F = r0n * vr0 / sm * chi * chi * C + (1 - alpha * r0n) * chi * chi * chi * Ss + r0n * chi - sm * dt;
			var dF = r0n * vr0 / sm * chi * (1 - alpha * chi * chi * Ss) + (1 - alpha * r0n) * chi * chi * C + r0n;
			var d = F / dF; chi -= d; if (Math.abs(d) < 1e-9) break;
		}
		var z2 = alpha * chi * chi, C2 = stC(z2), S2 = stS(z2);
		var f = 1 - chi * chi / r0n * C2, g = dt - chi * chi * chi / sm * S2;
		var r = add(mul(r0, f), mul(v0, g)), rn = norm(r);
		var fd = sm / (rn * r0n) * (alpha * chi * chi * chi * S2 - chi), gd = 1 - chi * chi / rn * C2;
		return { r: r, v: add(mul(r0, fd), mul(v0, gd)) };
	};

	/* An orbit from a state at time t0. at(t) gives {r, v}: elliptic orbits from mean anomaly (+ J2 drift when j2),
	   others by the universal-variable propagator. */
	function Orbit(r, v, t0, j2) {
		this.r0 = r.slice(); this.v0 = v.slice(); this.t0 = t0; this.j2 = !!j2;
		var el = this.el = S.rv2el(r, v);
		this.ell = el.e < 0.98;
		if (this.ell) {
			this.n = Math.sqrt(MU / (el.a * el.a * el.a)); this.M0 = S.nu2M(el.nu, el.e);
			this.rates = this.j2 ? S.j2Rates(el.a, el.e, el.i) : { raan: 0, argp: 0 };
		}
	}
	Orbit.prototype.elAt = function (t) {
		var el = this.el, dt = t - this.t0;
		return { a: el.a, e: el.e, i: el.i, p: el.p, raan: wrap(el.raan + this.rates.raan * dt), argp: wrap(el.argp + this.rates.argp * dt), nu: S.M2nu(this.M0 + this.n * dt, el.e) };
	};
	Orbit.prototype.at = function (t) {
		if (this.ell) return S.el2rv(this.elAt(t));
		return S.propagate(this.r0, this.v0, t - this.t0);
	};
	/* points of the whole orbit (one revolution) at time t, for drawing */
	Orbit.prototype.ring = function (t, n) {
		var out = [];
		if (!this.ell) { for (var k = 0; k <= n; k++) out.push(this.at(t + k * 60).r); return out; }
		var el = this.elAt(t);
		for (var j = 0; j <= n; j++) { el.nu = j / n * TAU; out.push(S.el2rv(el).r); }
		return out;
	};
	/* next time after t when the radius crosses rr going down (or up when up); null if never */
	Orbit.prototype.nextRadius = function (t, rr, up) {
		var el = this.el;
		if (!this.ell || rr < el.rp || rr > el.ra) return null;
		var c = (el.p / rr - 1) / el.e; c = Math.max(-1, Math.min(1, c));
		var nu = up ? Math.acos(c) : TAU - Math.acos(c);
		var M = S.nu2M(nu, el.e), Mt = wrap(this.M0 + this.n * (t - this.t0));
		var d = wrap(M - Mt); return t + d / this.n;
	};
	Orbit.prototype.nextApsis = function (t, apo) {
		if (!this.ell) return null;
		var Mt = wrap(this.M0 + this.n * (t - this.t0)), d = wrap((apo ? PI : 0) - Mt);
		return t + (d < 1e-9 ? TAU : d) / this.n;
	};
	S.Orbit = Orbit;

	/* burn directions at a state: prograde (along v), normal (along r x v), radial-out (in the plane, away from Earth) */
	S.frame = function (r, v) {
		var pro = unit(v), nrm = unit(cross(r, v)), rad = cross(pro, nrm);
		return { pro: pro, nrm: nrm, rad: rad };
	};
	S.applyBurn = function (r, v, b) {
		var f = S.frame(r, v);
		return add(v, add(mul(f.pro, b.pro || 0), add(mul(f.nrm, b.nrm || 0), mul(f.rad, b.rad || 0))));
	};
	S.burnSize = function (b) { return Math.sqrt((b.pro || 0) * (b.pro || 0) + (b.nrm || 0) * (b.nrm || 0) + (b.rad || 0) * (b.rad || 0)); };

	/* target-centred LVLH frame: x = radial out, y = along track (V-bar), z = orbit normal (h). Returns position and velocity of the chaser (m, m/s). */
	S.lvlh = function (rT, vT, rC, vC) {
		var x = unit(rT), z = unit(cross(rT, vT)), y = cross(z, x);
		var w = norm(cross(rT, vT)) / dot(rT, rT), dr = sub(rC, rT), dv = sub(vC, vT);
		var vrel = sub(dv, cross(mul(z, w), dr));
		return { x: dot(dr, x), y: dot(dr, y), z: dot(dr, z), vx: dot(vrel, x), vy: dot(vrel, y), vz: dot(vrel, z), dist: norm(dr), speed: norm(dv) };
	};
	/* angle of the target ahead of the chaser along the chaser's orbit (rad, -pi..pi) */
	S.phase = function (rC, vC, rT) {
		var h = unit(cross(rC, vC)), tp = sub(rT, mul(h, dot(rT, h)));
		return Math.atan2(dot(cross(rC, tp), h), dot(rC, tp));
	};

	/* ---------- Earth, time, sun ---------- */
	S.julian = function (ms) { return ms / 86400000 + 2440587.5; };
	S.gmst = function (ms) { var d = S.julian(ms) - 2451545; return wrap((280.46061837 + 360.98564736629 * d) * D2R); };
	S.sunDir = function (ms) {
		var n = S.julian(ms) - 2451545, L = (280.460 + 0.9856474 * n) * D2R, g = (357.528 + 0.9856003 * n) * D2R;
		var lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R, eps = (23.439 - 4e-7 * n) * D2R;
		return [Math.cos(lam), Math.cos(eps) * Math.sin(lam), Math.sin(eps) * Math.sin(lam)];
	};
	/* geocentric latitude / longitude (rad) of an inertial position, Earth turned by angle th */
	S.latLon = function (r, th) {
		var lon = wrapPi(Math.atan2(r[1], r[0]) - th);
		return { lat: Math.asin(r[2] / norm(r)), lon: lon, alt: norm(r) - RE };
	};
	S.ecef2eci = function (p, th) { var c = Math.cos(th), s = Math.sin(th); return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]; };
	S.llToVec = function (lat, lon, rad) { return [rad * Math.cos(lat) * Math.cos(lon), rad * Math.cos(lat) * Math.sin(lon), rad * Math.sin(lat)]; };
	S.gcDist = function (la1, lo1, la2, lo2) {
		var h = Math.sin((la2 - la1) / 2), k = Math.sin((lo2 - lo1) / 2);
		return 2 * RE * Math.asin(Math.min(1, Math.sqrt(h * h + Math.cos(la1) * Math.cos(la2) * k * k)));
	};
	S.destination = function (lat, lon, hdg, dist) {
		var d = dist / RE, la = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(hdg));
		var lo = lon + Math.atan2(Math.sin(hdg) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(la));
		return { lat: la, lon: wrapPi(lo) };
	};
	/* speed, flight-path angle and heading relative to the turning Earth (air-relative at the top of the atmosphere) */
	S.relEntry = function (r, v, th) {
		var vr = sub(v, cross([0, 0, WE], r)), rn = norm(r), up = mul(r, 1 / rn);
		var east = unit(cross([0, 0, 1], up)), north = cross(up, east);
		var vu = dot(vr, up), ve = dot(vr, east), vno = dot(vr, north), vn = norm(vr);
		var ll = S.latLon(r, th);
		return { v: vn, gamma: Math.asin(vu / vn), hdg: wrap(Math.atan2(ve, vno)), lat: ll.lat, lon: ll.lon };
	};
	S.SITES = [
		{ id: "ksc", name: "Kennedy Space Center, Florida", short: "KSC", lat: 28.615, lon: -80.695 },
		{ id: "edw", name: "Edwards Air Force Base, California", short: "Edwards", lat: 34.905, lon: -117.884 },
		{ id: "wsr", name: "White Sands, New Mexico", short: "White Sands", lat: 32.943, lon: -106.419 }
	];

	/* ---------- atmosphere ---------- */
	var ATM = [[0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714],
		[70, 8.770e-5, 6.549], [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473],
		[130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149], [150, 2.070e-9, 22.523], [180, 5.464e-10, 29.740], [200, 2.789e-10, 37.105],
		[250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298], [400, 3.725e-12, 58.515], [450, 1.585e-12, 60.828],
		[500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835], [700, 3.614e-14, 88.667], [800, 1.170e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268.00]];
	S.density = function (alt) {
		var h = Math.max(0, alt / 1000), k = ATM.length - 1;
		while (k > 0 && ATM[k][0] > h) k--;
		return ATM[k][1] * Math.exp(-(h - ATM[k][0]) / ATM[k][2]);
	};
	/* rough orbital lifetime of a circular orbit (days) for ballistic coefficient beta = m / (Cd A), kg/m^2. Average solar activity. */
	S.lifetime = function (alt, beta) {
		var a = RE + alt, t = 0;
		while (a - RE > 120000 && t < 3.2e9) {
			var rho = S.density(a - RE), dadt = -Math.sqrt(MU * a) * rho / beta;
			var dt = Math.min(86400 * 5, Math.max(30, 300 / Math.abs(dadt))); // ~300 m of decay per step
			a += dadt * dt; t += dt;
		}
		return t / 86400;
	};

	/* ---------- entry ---------- */
	/* planar lifting entry over a round Earth from altitude h0 with air-relative speed v0 and flight-path angle gamma0 (rad, negative = down).
	   opts: beta (kg/m^2), ld (lift/drag; Shuttle about 1 at Mach > 8, more lower down), drag (scales the planned drag profile, 1 = Shuttle-like),
	   maxBank (rad), noseR (m, for the Sutton-Graves heat estimate). Stops at TAEM (760 m/s), on the ground or when it skips back out. */
	S.entry = function (h0, v0, gamma0, opts) {
		opts = opts || {};
		var beta = opts.beta || S.SHUTTLE.entryMass / (S.SHUTTLE.cd * S.SHUTTLE.area), ld0 = opts.ld != null ? opts.ld : 1.0;
		var rn = opts.noseR || S.SHUTTLE.noseR, kD = opts.drag || 1, maxBank = opts.maxBank != null ? opts.maxBank : 80 * D2R;
		/* drag tracking like the Shuttle's entry guidance: the bank angle (how much of the lift points up) is chosen every step so the
		   deceleration follows a planned drag profile; kD scales the whole profile (steeper = shorter, harder entry). */
		function dRef(v) { var g; if (v > 6000) g = 0.22 + (7600 - v) / 1600 * 0.28; else if (v > 3000) g = 0.5 + (6000 - v) / 3000 * 0.5; else g = 1.0 + (3000 - v) / 2240 * 0.3; return Math.max(0.2, g) * 0.82 * G0 * kD; }
		var cosMin = Math.cos(maxBank), bankNow = 0;
		var y = [RE + h0, v0, gamma0, 0], t = 0, dt = 0.5, prof = [], peakG = 0, peakQ = 0, peakQt = 0, peakGt = 0, out = "taem", minH = h0, maxHafter = 0, dipped = false;
		function ldAt(v) { var mach = v / 300; return mach > 8 ? ld0 : mach < 2 ? ld0 * 1.5 : ld0 * (1.5 - 0.5 * (mach - 2) / 6); }
		function f(s) {
			var r = s[0], v = s[1], g = s[2], rho = S.density(r - RE), gr = MU / (r * r);
			var D = 0.5 * rho * v * v / beta, ld = ldAt(v), Dr = dRef(v), c = 1;
			if (D > 0.02 * G0) c = ((gr - v * v / r) * Math.cos(g) + 0.6 * (D - Dr) - 0.004 * v * Math.sin(g)) / (ld * D);
			c = Math.max(cosMin, Math.min(1, c)); bankNow = Math.acos(c);
			var L = ld * D * c;
			return [v * Math.sin(g), -D - gr * Math.sin(g), (L - (gr - v * v / r) * Math.cos(g)) / v, RE * v * Math.cos(g) / r];
		}
		for (var step = 0; step < 40000; step++) {
			var h = y[0] - RE, rho = S.density(h), D = 0.5 * rho * y[1] * y[1] / beta;
			var gload = D * Math.sqrt(1 + Math.pow(ldAt(y[1]), 2)) / G0, q = 1.7415e-4 * Math.sqrt(rho / rn) * Math.pow(y[1], 3) / 1e4;
			if (gload > peakG) { peakG = gload; peakGt = t; } if (q > peakQ) { peakQ = q; peakQt = t; }
			if (step % 4 === 0) prof.push({ t: t, h: h, v: y[1], g: gload, q: q, s: y[3], gam: y[2], bank: bankNow });
			if (h < minH) minH = h; if (h < h0 - 20000) dipped = true;
			if (y[1] < 760) { out = "taem"; break; }
			if (h < 0) { out = "ground"; break; }
			if (dipped && h > h0 + 5000 && y[2] > 0) { out = "skip"; break; }
			if (!dipped && h > h0 + 2000 && y[2] > 0) { out = "skip"; break; }
			var k1 = f(y), k2 = f(y.map(function (x, i) { return x + k1[i] * dt / 2; })), k3 = f(y.map(function (x, i) { return x + k2[i] * dt / 2; })), k4 = f(y.map(function (x, i) { return x + k3[i] * dt; }));
			y = y.map(function (x, i) { return x + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
			t += dt;
		}
		prof.push({ t: t, h: y[0] - RE, v: y[1], g: 0, q: 0, s: y[3], gam: y[2] });
		var taemRange = out === "taem" ? 96000 : 0, taemTime = out === "taem" ? 360 : 0; // TAEM + approach: about 52 nautical miles and 6 minutes for the Shuttle
		return { out: out, time: t, range: y[3], peakG: peakG, peakGt: peakGt, peakQ: peakQ, peakQt: peakQt, peakT: Math.pow(peakQ * 1e4 / (0.85 * 5.670374e-8), 0.25),
			prof: prof, landRange: y[3] + taemRange, landTime: t + taemTime, v: y[1], h: y[0] - RE, beta: beta };
	};
	/* rough maximum cross-range of a glider (Vinh): (pi^2 / 48) (L/D)^2 radians of Earth */
	S.crossRange = function (ld) { return PI * PI / 48 * ld * ld * RE; };

	/* De-orbit from a circular orbit of altitude alt with a retrograde burn dv (m/s, positive number). Planar, inertial, no rotation.
	   Returns the new perigee, the entry-interface crossing (speed, angle, time and angle travelled) and the entry. */
	S.deorbit = function (alt, dv, opts) {
		opts = opts || {};
		var r0 = RE + alt, v0 = Math.sqrt(MU / r0) - dv, a = 1 / (2 / r0 - v0 * v0 / MU);
		var h = r0 * v0, e = Math.sqrt(Math.max(0, 1 - h * h / (MU * a))), rp = a * (1 - e), ei = RE + (opts.ei || S.EI_ALT);
		var res = { alt: alt, dv: dv, perigee: rp - RE, apogee: a * (1 + e) - RE, a: a, e: e };
		if (rp >= ei) { res.reaches = false; return res; }
		var p = h * h / MU, cnu = (p / ei - 1) / e, nuEI = TAU - Math.acos(Math.max(-1, Math.min(1, cnu)));
		var vEI = S.visViva(ei, a), gam = -Math.acos(Math.min(1, h / (ei * vEI)));
		var M0 = PI, M1 = S.nu2M(nuEI, e), n = Math.sqrt(MU / (a * a * a));
		res.reaches = true; res.vEI = vEI; res.gammaEI = gam; res.tEI = (M1 - M0) / n; res.angleEI = nuEI - PI; res.rangeEI = (nuEI - PI) * RE;
		if (opts.entry !== false) {
			var vrel = opts.eastward === false ? vEI : vEI - (opts.vRot != null ? opts.vRot : 0);
			res.entry = S.entry(opts.ei || S.EI_ALT, vrel, gam, opts);
		}
		return res;
	};
	/* retro burn that gives a chosen entry angle (rad) from a circular orbit; bisection */
	S.deorbitFor = function (alt, gamma) {
		var lo = 1, hi = 1500;
		for (var k = 0; k < 60; k++) {
			var m = (lo + hi) / 2, d = S.deorbit(alt, m, { entry: false });
			if (!d.reaches || d.gammaEI > gamma) lo = m; else hi = m;
		}
		return (lo + hi) / 2;
	};

	/* ---------- Moon ---------- */
	/* translunar injection from a circular parking orbit: apogee at the Moon's distance (Hohmann-like, Earth gravity only) */
	S.tli = function (alt, dist) {
		dist = dist || S.D_MOON; var r = RE + alt, a = (r + dist) / 2;
		return { dv: S.visViva(r, a) - Math.sqrt(MU / r), tof: S.period(a) / 2, vArrive: S.visViva(dist, a), a: a };
	};
	/* what a burn of dv (prograde, from a circular parking orbit) reaches: apogee distance (m, Infinity = escape) and time to get to distance `to` */
	S.boost = function (alt, dv, to) {
		var r = RE + alt, v = Math.sqrt(MU / r) + dv, en = v * v / 2 - MU / r;
		if (en >= 0) {
			var o = new Orbit([r, 0, 0], [0, v, 0], 0, false), tt = null;
			if (to) { var lo = 0, hi = 3e6; for (var k = 0; k < 80; k++) { var m = (lo + hi) / 2; if (norm(o.at(m).r) < to) lo = m; else hi = m; } tt = (lo + hi) / 2; }
			return { apo: Infinity, escape: true, vinf: Math.sqrt(2 * en), t: tt, a: -MU / (2 * en), e: v * v * r / MU - 1 };
		}
		var a = -MU / (2 * en), e = 1 - r / a, ra = a * (1 + e), res = { apo: ra, escape: false, a: a, e: e, T: S.period(a), t: null };
		if (to && ra >= to) {
			var p = a * (1 - e * e), nu = Math.acos(Math.max(-1, Math.min(1, (p / to - 1) / e)));
			res.t = S.nu2M(nu, e) / Math.sqrt(MU / (a * a * a));
		}
		return res;
	};
	S.MOON_BUDGET = [
		{ id: "tli", name: "Translunar injection (leave Earth orbit)", dv: 3130 },
		{ id: "loi", name: "Lunar orbit insertion (100 km orbit)", dv: 900 },
		{ id: "pdi", name: "Descent and landing", dv: 2000 },
		{ id: "asc", name: "Ascent back to lunar orbit", dv: 1850 },
		{ id: "tei", name: "Trans-Earth injection (head home)", dv: 900 }
	];

	/* ---------- formatting ---------- */
	S.fmtTime = function (s, short) {
		if (!isFinite(s)) return "never";
		var neg = s < 0; s = Math.abs(s);
		var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60);
		var t = d ? d + "d " + h + "h " + (short ? "" : String(m).padStart(2, "0") + "m") : h ? h + "h " + String(m).padStart(2, "0") + "m" + (short ? "" : " " + String(sec).padStart(2, "0") + "s") : m ? m + "m " + String(sec).padStart(2, "0") + "s" : (s < 10 ? s.toFixed(1) : sec) + "s";
		return (neg ? "−" : "") + t.trim();
	};
	S.fmtKm = function (m, dp) { if (!isFinite(m)) return "∞"; var k = m / 1000; return (Math.abs(k) >= 1000 ? Math.round(k).toLocaleString("en-US") : k.toFixed(dp == null ? (Math.abs(k) < 10 ? 2 : 1) : dp)) + " km"; };
	S.fmtV = function (v) { return Math.abs(v) >= 1000 ? (v / 1000).toFixed(3) + " km/s" : v.toFixed(1) + " m/s"; };
	S.parseLen = function (s, unitDefault) {
		if (s == null) return NaN; s = String(s).trim().toLowerCase().replace(/,/g, "");
		var m = s.match(/^(-?[\d.]+(?:e[-+]?\d+)?)\s*([a-z]*)$/); if (!m) return NaN;
		var x = parseFloat(m[1]), u = m[2] || unitDefault || "km";
		var k = { m: 1, km: 1000, mi: 1609.344, nmi: 1852, nm: 1852, ft: 0.3048, au: 1.495978707e11, re: RE }[u];
		return k ? x * k : NaN;
	};

	if (typeof module !== "undefined" && module.exports) module.exports = S; else root.MESShuttle = S;
})(typeof window !== "undefined" ? window : this);

/* MES Space Shuttle Simulator: the Earth picture (drawn from Natural Earth land shapes, mes.fm/maps/data/countries-110m.json)
   used as the 3D globe's texture and as the flat ground-track map. window.SXMap. */
(function () {
	"use strict";
	if (typeof document === "undefined") return;
	var M = window.SXMap = {};
	var W = 2048, H = 1024, land = null, borders = null, tex = null, ready = null;

	function decode(topo) {
		var sc = topo.transform.scale, tr = topo.transform.translate;
		var arcs = topo.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (p) { x += p[0]; y += p[1]; return [x * sc[0] + tr[0], y * sc[1] + tr[1]]; }); });
		function ring(ids) {
			var out = [];
			ids.forEach(function (i, k) { var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; out = out.concat(k ? a.slice(1) : a); });
			return out;
		}
		function polys(g) {
			if (g.type === "Polygon") return [g.arcs.map(ring)];
			if (g.type === "MultiPolygon") return g.arcs.map(function (p) { return p.map(ring); });
			return [];
		}
		var L = [], B = [];
		(topo.objects.land.geometries || [topo.objects.land]).forEach(function (g) { L = L.concat(polys(g)); });
		topo.objects.countries.geometries.forEach(function (g) { B = B.concat(polys(g)); });
		return { land: L, borders: B };
	}
	/* unwrap a ring's longitudes so it is continuous; a ring that goes all the way round (Antarctica) is closed along the pole */
	function unwrapRing(r) {
		var out = [], off = 0;
		for (var i = 0; i < r.length; i++) {
			if (i) { var d = r[i][0] - r[i - 1][0]; if (d > 180) off -= 360; else if (d < -180) off += 360; }
			out.push([r[i][0] + off, r[i][1]]);
		}
		var span = out[out.length - 1][0] - out[0][0];
		if (Math.abs(span) > 300) { var pole = out[0][1] < 0 ? -90 : 90; out.push([out[out.length - 1][0], pole], [out[0][0], pole]); }
		return out;
	}
	function pathRings(ctx, rings, w, h) {
		ctx.beginPath();
		[-360, 0, 360].forEach(function (shift) {
			rings.forEach(function (r) {
				var u = unwrapRing(r);
				u.forEach(function (p, i) { var x = (p[0] + shift + 180) / 360 * w, y = (90 - p[1]) / 180 * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
				ctx.closePath();
			});
		});
	}
	function paint() {
		var c = document.createElement("canvas"); c.width = W; c.height = H;
		var g = c.getContext("2d");
		var oc = g.createLinearGradient(0, 0, 0, H);
		oc.addColorStop(0, "#1b3a5c"); oc.addColorStop(0.18, "#13426e"); oc.addColorStop(0.5, "#0f4c80"); oc.addColorStop(0.82, "#13426e"); oc.addColorStop(1, "#1b3a5c");
		g.fillStyle = oc; g.fillRect(0, 0, W, H);
		var lg = g.createLinearGradient(0, 0, 0, H);
		[[0, "#eef3f6"], [0.15, "#e2e9ee"], [0.2, "#5d7a52"], [0.27, "#4f7444"], [0.33, "#8a8a5a"], [0.4, "#b9a273"], [0.46, "#5f8a45"], [0.54, "#4b7d3a"], [0.6, "#a8946a"], [0.67, "#7c8a55"], [0.74, "#55764a"], [0.81, "#dfe6ea"], [1, "#f4f7f9"]].forEach(function (s) { lg.addColorStop(s[0], s[1]); });
		g.fillStyle = lg;
		land.forEach(function (poly) { pathRings(g, poly, W, H); g.fill("evenodd"); });
		g.strokeStyle = "rgba(20,30,20,0.35)"; g.lineWidth = 1.2;
		borders.forEach(function (poly) { pathRings(g, poly, W, H); g.stroke(); });
		g.strokeStyle = "rgba(230,245,255,0.35)"; g.lineWidth = 1.5;
		land.forEach(function (poly) { pathRings(g, poly, W, H); g.stroke(); });
		return c;
	}
	M.load = function () {
		if (ready) return ready;
		ready = fetch("/maps/data/countries-110m.json").then(function (r) { if (!r.ok) throw new Error("map " + r.status); return r.json(); })
			.then(function (t) { var d = decode(t); land = d.land; borders = d.borders; tex = paint(); return tex; })
			.catch(function () { var c = document.createElement("canvas"); c.width = 512; c.height = 256; var g = c.getContext("2d"); g.fillStyle = "#0f4c80"; g.fillRect(0, 0, 512, 256); tex = c; return c; });
		return ready;
	};
	M.texture = function () { return tex; };

	/* night shading: a small picture recomputed when the sun has moved */
	var night = null, nightKey = "";
	function nightCanvas(sunLat, sunLon) {
		var key = Math.round(sunLat * 4) + ":" + Math.round(sunLon * 4);
		if (night && key === nightKey) return night;
		nightKey = key; night = night || document.createElement("canvas"); night.width = 360; night.height = 180;
		var g = night.getContext("2d"), img = g.createImageData(360, 180), sl = Math.sin(sunLat), cl = Math.cos(sunLat);
		for (var y = 0; y < 180; y++) {
			var lat = (89.5 - y) * Math.PI / 180, s = Math.sin(lat), c = Math.cos(lat);
			for (var x = 0; x < 360; x++) {
				var lon = (x - 179.5) * Math.PI / 180, el = s * sl + c * cl * Math.cos(lon - sunLon);
				var a = el > 0.05 ? 0 : el < -0.1 ? 150 : (0.05 - el) / 0.15 * 150, k = (y * 360 + x) * 4;
				img.data[k] = 2; img.data[k + 1] = 6; img.data[k + 2] = 20; img.data[k + 3] = a;
			}
		}
		g.putImageData(img, 0, 0);
		return night;
	}
	function xy(lat, lon, w, h) { return [(lon * 180 / Math.PI + 180) / 360 * w, (90 - lat * 180 / Math.PI) / 180 * h]; }
	M.xy = xy;
	/* polyline of {lat, lon} (rad), broken where it crosses the date line */
	M.track = function (ctx, pts, w, h) {
		ctx.beginPath(); var prev = null;
		for (var i = 0; i < pts.length; i++) {
			var p = xy(pts[i].lat, pts[i].lon, w, h);
			if (!prev || Math.abs(p[0] - prev[0]) > w / 2) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
			prev = p;
		}
		ctx.stroke();
	};
	M.base = function (ctx, w, h, sun) {
		if (tex) { ctx.imageSmoothingEnabled = true; ctx.drawImage(tex, 0, 0, w, h); } else { ctx.fillStyle = "#0f4c80"; ctx.fillRect(0, 0, w, h); }
		if (sun) ctx.drawImage(nightCanvas(sun.lat, sun.lon), 0, 0, w, h);
		ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.beginPath();
		for (var lo = -150; lo <= 150; lo += 30) { var x = (lo + 180) / 360 * w; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
		for (var la = -60; la <= 60; la += 30) { var y = (90 - la) / 180 * h; ctx.moveTo(0, y); ctx.lineTo(w, y); }
		ctx.stroke();
		ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
	};
})();

/* MES Space Shuttle Simulator: the 3D view (three.js 0.170.0, loaded by app.js through the page's import map). window.SXView.
   Units: 1 = Earth's equatorial radius. Inertial x, y, z (metres) map to three's (x, z, -y), so three's +Y is the North Pole. */
(function () {
	"use strict";
	if (typeof document === "undefined") return;
	var RE = 6378137;
	window.SXView = { create: create };

	function create(stage, THREE, OrbitControls) {
		var V = {}, cap = 2400;
		var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		var cv = renderer.domElement; cv.className = "sx-canvas"; cv.tabIndex = 0;
		cv.setAttribute("aria-label", "3D view of the Earth and the Shuttle's orbit. Drag to turn the view, wheel or pinch to zoom. Drag the burn marker along the orbit or its arrows to change a burn.");
		stage.insertBefore(cv, stage.firstChild);
		var scene = new THREE.Scene();
		var camera = new THREE.PerspectiveCamera(45, 16 / 9, 1e-5, 2000);
		camera.position.set(1.6, 1.6, 3.2);
		var controls = new OrbitControls(camera, cv);
		controls.enableDamping = true; controls.dampingFactor = 0.09; controls.minDistance = 0.002; controls.maxDistance = 200; controls.rotateSpeed = 0.7;
		V.camera = camera; V.controls = controls; V.canvas = cv; V.renderer = renderer;

		function T(p) { return new THREE.Vector3(p[0] / RE, p[2] / RE, -p[1] / RE); }
		V.T = T;

		/* sky */
		var sg = new THREE.BufferGeometry(), sp = [], sc = [];
		var rnd = mulberry(7);
		for (var i = 0; i < 2600; i++) {
			var u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = Math.sqrt(1 - u * u), b = 0.35 + rnd() * 0.65;
			sp.push(rr * Math.cos(th) * 600, u * 600, rr * Math.sin(th) * 600);
			var tint = rnd(); sc.push(b * (tint > 0.85 ? 1 : 0.85), b * 0.9, b * (tint < 0.2 ? 0.75 : 1));
		}
		sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
		scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));

		/* sun light + a soft fill so the night side is not pitch black */
		var sun = new THREE.DirectionalLight(0xffffff, 2.6); scene.add(sun);
		scene.add(new THREE.AmbientLight(0x3a4a66, 0.35));
		var sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE, "255,240,200"), color: 0xffffff, depthWrite: false, blending: THREE.AdditiveBlending }));
		sunSprite.scale.set(40, 40, 1); scene.add(sunSprite);

		/* Earth */
		var earth = new THREE.Group(); scene.add(earth);
		var earthMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 14, specular: 0x223344 });
		var globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMat); earth.add(globe);
		var atm = new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 64), new THREE.ShaderMaterial({
			transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
			vertexShader: "varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }",
			fragmentShader: "varying vec3 vN; varying vec3 vP; void main(){ float f = pow(clamp(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 0.0, 1.0), 4.0); gl_FragColor = vec4(0.32,0.6,1.0,1.0) * min(f, 1.2); }"
		}));
		scene.add(atm);
		V.setTexture = function (c) { var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; earthMat.map = t; earthMat.needsUpdate = true; };

		/* lines with a fixed capacity */
		function line(color, dashed, opacity) {
			var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cap * 3), 3)); g.setDrawRange(0, 0);
			var m = dashed ? new THREE.LineDashedMaterial({ color: color, dashSize: 0.025, gapSize: 0.018, transparent: true, opacity: opacity || 1 }) : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity || 1 });
			var l = new THREE.Line(g, m); l.frustumCulled = false; l.userData.dashed = dashed; return l;
		}
		function setLine(l, pts, surface) {
			var a = l.geometry.attributes.position, n = Math.min(cap, pts ? pts.length : 0);
			for (var i = 0; i < n; i++) { var v = surface ? pts[i] : T(pts[i]); a.array[i * 3] = v.x; a.array[i * 3 + 1] = v.y; a.array[i * 3 + 2] = v.z; }
			a.needsUpdate = true; l.geometry.setDrawRange(0, n); l.geometry.computeBoundingSphere();
			if (l.userData.dashed && n > 1) l.computeLineDistances();
			l.visible = n > 1;
		}
		var orbitL = line(0x8ec5ff), planL = line(0xffa94d, true), targetL = line(0x69db7c, false, 0.55), trailL = line(0xffffff, false, 0.35);
		scene.add(orbitL, planL, targetL, trailL);
		var surfL = line(0xffd43b, false, 0.9); earth.add(surfL);   // entry ground path, on the surface (turns with the Earth)
		var footL = line(0xff6b6b, false, 0.95); earth.add(footL);

		/* the Shuttle: built from simple shapes, forward = +Z, up = +Y */
		var shuttle = new THREE.Group(); scene.add(shuttle);
		(function () {
			var white = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.55, metalness: 0.05 });
			var black = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.7 });
			var grey = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.6 });
			var body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.05, 18), white); body.rotation.x = Math.PI / 2; shuttle.add(body);
			var nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 18), white); nose.rotation.x = Math.PI / 2; nose.position.z = 0.675; shuttle.add(nose);
			var tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 12), black); tip.rotation.x = Math.PI / 2; tip.position.z = 0.79; shuttle.add(tip);
			var belly = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 1.0), black); belly.position.set(0, -0.11, 0.02); shuttle.add(belly);
			var wing = new THREE.Shape(); wing.moveTo(0, 0.35); wing.lineTo(0.58, -0.42); wing.lineTo(0.58, -0.52); wing.lineTo(0, -0.52); wing.closePath();
			[1, -1].forEach(function (s) {
				var g = new THREE.ExtrudeGeometry(wing, { depth: 0.025, bevelEnabled: false });
				var m = new THREE.Mesh(g, white); m.rotation.x = -Math.PI / 2; if (s < 0) m.scale.x = -1; m.position.set(0, -0.08, 0); shuttle.add(m);
				var e = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.12), black); e.position.set(s * 0.3, -0.1, -0.44); shuttle.add(e);
			});
			var fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-0.34, 0); fin.lineTo(-0.5, 0.42); fin.lineTo(-0.38, 0.42); fin.closePath();
			var fm = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.02, bevelEnabled: false }), white); fm.rotation.y = -Math.PI / 2; fm.position.set(0.01, 0.1, -0.18); shuttle.add(fm);
			[[0, 0.06], [-0.07, -0.03], [0.07, -0.03]].forEach(function (p) { var n = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 12), grey); n.rotation.x = Math.PI / 2; n.position.set(p[0], p[1], -0.57); shuttle.add(n); });
			[1, -1].forEach(function (s) { var p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12), white); p.rotation.x = Math.PI / 2; p.position.set(s * 0.12, 0.08, -0.38); shuttle.add(p); });
		})();
		var plasma = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE, "255,150,60"), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
		plasma.scale.set(2.2, 2.2, 1); plasma.position.set(0, -0.15, 0.35); shuttle.add(plasma);
		var flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE, "120,180,255"), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
		flame.scale.set(0.7, 0.7, 1); flame.position.set(0, 0.02, -0.8); shuttle.add(flame);

		/* the station */
		var station = new THREE.Group(); scene.add(station);
		(function () {
			var truss = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.6 });
			var panel = new THREE.MeshStandardMaterial({ color: 0x2b4a8a, roughness: 0.4, metalness: 0.3, emissive: 0x0a1428, side: THREE.DoubleSide });
			var mod = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 });
			var tr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.05), truss); station.add(tr);
			[-0.7, -0.45, 0.45, 0.7].forEach(function (x) { [1, -1].forEach(function (s) { var p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.55), panel); p.position.set(x, 0, s * 0.32); p.rotation.x = Math.PI / 2; station.add(p); }); });
			var m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 14), mod); m1.rotation.x = Math.PI / 2; station.add(m1);
			var m2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 14), mod); m2.rotation.z = Math.PI / 2; m2.position.z = 0.28; station.add(m2);
		})();

		/* markers: burn node, entry interface, landing, sites */
		var nodeM = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffa94d, depthTest: false, transparent: true }));
		nodeM.renderOrder = 10; scene.add(nodeM);
		var nodeOthers = [];
		var arrows = {}, ACOL = { pro: 0xffd43b, retro: 0xffd43b, nrm: 0xd0a2ff, anti: 0xd0a2ff, rad: 0x66d9e8, radin: 0x66d9e8 };
		Object.keys(ACOL).forEach(function (k) {
			var a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, ACOL[k], 0.28, 0.16);
			a.traverse(function (o) { if (o.material) { o.material.depthTest = false; o.material.transparent = true; o.material.opacity = k === "retro" || k === "anti" || k === "radin" ? 0.6 : 1; } o.renderOrder = 11; });
			scene.add(a); arrows[k] = a;
		});
		function dot(color, size) { var m = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), new THREE.MeshBasicMaterial({ color: color })); return m; }
		var eiM = dot(0xffd43b, 0.012), landM = dot(0xff6b6b, 0.014);
		earth.add(eiM, landM);
		var siteMs = [];
		V.setSites = function (sites) {
			siteMs.forEach(function (m) { earth.remove(m); }); siteMs = [];
			sites.forEach(function (s) { var m = dot(0x51cf66, 0.009); m.position.copy(ll(s.lat * Math.PI / 180, s.lon * Math.PI / 180, 1.002)); earth.add(m); siteMs.push(m); });
		};
		function ll(lat, lon, r) { return new THREE.Vector3(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon)); }
		V.ll = ll;

		var size = { w: 1, h: 1 };
		V.resize = function () {
			var w = stage.clientWidth || 640, h = stage.clientHeight || 360;
			if (w === size.w && h === size.h) return;
			size.w = w; size.h = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
		};
		V.screen = function (v3) { var p = v3.clone().project(camera); return { x: (p.x + 1) / 2 * size.w, y: (1 - p.y) / 2 * size.h, vis: p.z < 1 && p.z > -1 }; };
		V.screenOf = function (eci) { return V.screen(T(eci)); };

		var follow = "earth", lastFollow = null, followPos = new THREE.Vector3();
		V.setFollow = function (f) { follow = f; lastFollow = null; };
		V.followTarget = function () { return follow; };
		V.aim = function (dir, dist) { var d = T([dir[0] * RE, dir[1] * RE, dir[2] * RE]).normalize(); if (follow === "earth") { controls.target.set(0, 0, 0); camera.position.copy(d.multiplyScalar(dist || 3.3)); } lastFollow = null; };
		V.reset = function () {
			lastFollow = null;
			if (follow === "earth") { controls.target.set(0, 0, 0); camera.position.set(1.6, 1.6, 3.2); }
		};
		function pxScale(obj, px) { var d = camera.position.distanceTo(obj.position), f = 2 * Math.tan(camera.fov * Math.PI / 360) * d / size.h; return f * px; }

		V.render = function (st) {
			V.resize();
			earth.rotation.y = st.gmst;
			var s3 = T([st.sun[0] * 1e12, st.sun[1] * 1e12, st.sun[2] * 1e12]).normalize();
			sun.position.copy(s3).multiplyScalar(50); sunSprite.position.copy(s3).multiplyScalar(500);
			setLine(orbitL, st.orbit); setLine(planL, st.plan); setLine(targetL, st.targetOrbit); setLine(trailL, st.trail);
			setLine(surfL, st.surfPath ? st.surfPath.map(function (p) { return ll(p.lat, p.lon, 1.003); }) : null, true);
			setLine(footL, st.footprint ? st.footprint.map(function (p) { return ll(p.lat, p.lon, 1.003); }) : null, true);
			eiM.visible = !!st.ei; if (st.ei) eiM.position.copy(ll(st.ei.lat, st.ei.lon, 1.004));
			landM.visible = !!st.land; if (st.land) landM.position.copy(ll(st.land.lat, st.land.lon, 1.004));
			// camera follow
			var fp = follow === "shuttle" && st.shuttle ? T(st.shuttle.r) : follow === "target" && st.target ? T(st.target.r) : null;
			if (fp) {
				if (!lastFollow) { controls.target.copy(fp); var off = camera.position.clone().sub(controls.target); if (off.length() > 0.6) off.setLength(0.12); camera.position.copy(fp).add(off); }
				else { var d = fp.clone().sub(lastFollow); camera.position.add(d); controls.target.add(d); }
				lastFollow = fp.clone();
			} else if (follow === "earth" && lastFollow) { lastFollow = null; }
			controls.update();
			// shuttle
			shuttle.visible = !!st.shuttle;
			if (st.shuttle) {
				shuttle.position.copy(T(st.shuttle.r));
				var fwd = T(st.shuttle.v).normalize(), up = T(st.shuttle.r).normalize();
				if (st.shuttle.nose) fwd = T(st.shuttle.nose).normalize();
				var x = new THREE.Vector3().crossVectors(up, fwd).normalize(), y = new THREE.Vector3().crossVectors(fwd, x).normalize();
				shuttle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, fwd));
				var k = pxScale(shuttle, st.shuttle.px || 40); shuttle.scale.setScalar(k);
				plasma.visible = st.shuttle.plasma > 0; plasma.material.opacity = Math.min(1, st.shuttle.plasma || 0);
				flame.visible = !!st.shuttle.firing;
			}
			station.visible = !!st.target;
			if (st.target) {
				station.position.copy(T(st.target.r));
				var tf = T(st.target.v).normalize(), tu = T(st.target.r).normalize(), tx = new THREE.Vector3().crossVectors(tu, tf).normalize(), ty = new THREE.Vector3().crossVectors(tf, tx);
				station.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tf, ty, tx.negate()));
				station.scale.setScalar(pxScale(station, 30));
			}
			// burn node + arrows
			nodeM.visible = !!st.node;
			Object.keys(arrows).forEach(function (k) { arrows[k].visible = !!st.node; });
			if (st.node) {
				nodeM.position.copy(T(st.node.r)); nodeM.scale.setScalar(pxScale(nodeM, 8));
				var L = pxScale(nodeM, 62);
				var dirs = { pro: st.node.f.pro, retro: neg(st.node.f.pro), nrm: st.node.f.nrm, anti: neg(st.node.f.nrm), rad: st.node.f.rad, radin: neg(st.node.f.rad) };
				Object.keys(dirs).forEach(function (k) { var d = T(dirs[k]).normalize(); arrows[k].position.copy(nodeM.position); arrows[k].setDirection(d); arrows[k].setLength(L, L * 0.28, L * 0.16); });
				V.arrowTips = Object.keys(dirs).map(function (k) { var d = T(dirs[k]).normalize(); return { k: k, p: V.screen(nodeM.position.clone().add(d.multiplyScalar(L * 0.92))), o: V.screen(nodeM.position) }; });
			} else V.arrowTips = [];
			while (nodeOthers.length < (st.others || []).length) { var m = dot(0xffa94d, 1); m.material.transparent = true; m.material.opacity = 0.55; m.material.depthTest = false; scene.add(m); nodeOthers.push(m); }
			nodeOthers.forEach(function (m, i) { var o = (st.others || [])[i]; m.visible = !!o; if (o) { m.position.copy(T(o)); m.scale.setScalar(pxScale(m, 6)); } });
			renderer.render(scene, camera);
		};
		V.png = function () { return cv.toDataURL("image/png"); };
		return V;
	}
	function neg(a) { return [-a[0], -a[1], -a[2]]; }
	function glowTex(THREE, rgb) {
		var c = document.createElement("canvas"); c.width = c.height = 128; var g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
		gr.addColorStop(0, "rgba(" + rgb + ",1)"); gr.addColorStop(0.25, "rgba(" + rgb + ",0.55)"); gr.addColorStop(1, "rgba(" + rgb + ",0)");
		g.fillStyle = gr; g.fillRect(0, 0, 128, 128); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
	}
	function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
})();

/* MES Space Shuttle Simulator: the De-orbit & landing, Orbit calculator and Moon tabs. window.SXTabs */
(function () {
	"use strict";
	if (typeof document === "undefined") return;
	var S = window.MESShuttle, D = S.D2R, RE = S.RE;
	function $(id) { return document.getElementById(id); }
	function fmtN(x, dp) { return Number(x).toLocaleString("en-US", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }); }
	function dark() { return document.body.classList.contains("dark-mode"); }
	function pal() { return dark() ? { bg: "#16191f", grid: "rgba(255,255,255,0.09)", axis: "#9aa3b2", text: "#e4e7ec", a: "#6ea8fe", b: "#ffa94d", c: "#ff6b6b", d: "#69db7c", earth: "#2f6fb0", air: "rgba(110,168,254,0.18)" } :
		{ bg: "#ffffff", grid: "rgba(0,0,0,0.07)", axis: "#5b6575", text: "#1d2430", a: "#1e40af", b: "#c2410c", c: "#c92a2a", d: "#2b8a3e", earth: "#2f6fb0", air: "rgba(30,64,175,0.10)" }; }
	var inited = {}, T = window.SXTabs = { show: function (id) { if (!inited[id]) { inited[id] = true; if (INIT[id]) INIT[id](); } if (DRAW[id]) DRAW[id](); } };
	var INIT = {}, DRAW = {};
	function canvas(c) {
		var dpr = Math.min(2, window.devicePixelRatio || 1), W = c.clientWidth || 600, H = parseInt(c.getAttribute("height"), 10) || 230;
		c.style.height = H + "px"; if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
		var g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g: g, W: W, H: H };
	}
	function tbl(rows) { return '<table class="tu-table sx-t"><tbody>' + rows.map(function (r) { return "<tr><td>" + r[0] + (r[2] ? "<small>" + r[2] + "</small>" : "") + "</td><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table>"; }
	window.addEventListener("resize", function () { var t = document.querySelector('#sx .sx-tabs [aria-selected="true"]'); var id = t && t.getAttribute("data-tab"); if (id && DRAW[id] && inited[id]) DRAW[id](); });
	new MutationObserver(function () { var t = document.querySelector('#sx .sx-tabs [aria-selected="true"]'); var id = t && t.getAttribute("data-tab"); if (id && DRAW[id] && inited[id]) DRAW[id](); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	/* generic line chart: series = [{pts:[[x,y]], col, axis:'l'|'r', label}] */
	function chart(c, o) {
		var k = canvas(c), g = k.g, W = k.W, H = k.H, P = pal(), m = { l: 52, r: o.r ? 52 : 14, t: 14, b: 32 };
		g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
		var pw = W - m.l - m.r, ph = H - m.t - m.b;
		function ax(arr) { var lo = Infinity, hi = -Infinity; arr.forEach(function (s) { s.pts.forEach(function (p) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }); }); if (o.zero) lo = Math.min(0, lo); if (hi === lo) hi = lo + 1; return [lo, hi + (hi - lo) * 0.06]; }
		var L = o.series.filter(function (s) { return s.axis !== "r"; }), R = o.series.filter(function (s) { return s.axis === "r"; });
		var xl = o.x0 != null ? o.x0 : 0, xh = o.x1 || Math.max.apply(null, o.series.map(function (s) { return s.pts.length ? s.pts[s.pts.length - 1][0] : 1; }));
		var yl = ax(L), yr = R.length ? ax(R) : null;
		function X(x) { return m.l + (x - xl) / (xh - xl) * pw; }
		g.strokeStyle = P.grid; g.lineWidth = 1; g.fillStyle = P.axis; g.font = "11px system-ui, sans-serif"; g.textAlign = "right";
		for (var i = 0; i <= 4; i++) { var y = m.t + ph * i / 4, v = yl[1] - (yl[1] - yl[0]) * i / 4; g.beginPath(); g.moveTo(m.l, y); g.lineTo(m.l + pw, y); g.stroke(); g.fillText(o.fy(v), m.l - 5, y + 4);
			if (yr) { var v2 = yr[1] - (yr[1] - yr[0]) * i / 4; g.textAlign = "left"; g.fillText(o.fr(v2), m.l + pw + 5, y + 4); g.textAlign = "right"; } }
		g.textAlign = "center";
		for (var j = 0; j <= 5; j++) { var xv = xl + (xh - xl) * j / 5; g.fillText(o.fx(xv), X(xv), H - m.b + 15); }
		g.fillText(o.xl || "", m.l + pw / 2, H - 4);
		o.series.forEach(function (s) {
			var yy = s.axis === "r" ? yr : yl; g.strokeStyle = s.col; g.lineWidth = 2.2; g.setLineDash(s.dash ? [5, 4] : []); g.beginPath();
			s.pts.forEach(function (p, i) { var px = X(p[0]), py = m.t + ph * (1 - (p[1] - yy[0]) / (yy[1] - yy[0])); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); g.setLineDash([]);
		});
		var lx = m.l + 8; g.textAlign = "left"; g.font = "600 11px system-ui, sans-serif";
		o.series.forEach(function (s) { g.fillStyle = s.col; g.fillRect(lx, m.t + 4, 12, 3); g.fillStyle = P.text; g.fillText(s.label, lx + 16, m.t + 9); lx += g.measureText(s.label).width + 34; });
		(o.marks || []).forEach(function (mk) { var px = X(mk.x); g.strokeStyle = mk.col; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(px, m.t); g.lineTo(px, m.t + ph); g.stroke(); g.setLineDash([]); g.fillStyle = mk.col; g.fillText(mk.label, Math.min(px + 4, W - 80), m.t + ph - 6); });
	}

	/* ================= De-orbit tab ================= */
	var dS = { alt: 330, dv: 90, drag: 1, mass: 95000 }, DDEF = { alt: 330, dv: 90, drag: 1, mass: 95000 };
	INIT.deorbit = function () {
		[["alt", "sx-d-alt"], ["dv", "sx-d-dv"], ["drag", "sx-d-dr"], ["mass", "sx-d-m"]].forEach(function (p) {
			$(p[1]).value = dS[p[0]]; $(p[1]).addEventListener("input", function () { dS[p[0]] = parseFloat(this.value); DRAW.deorbit(); });
		});
		var tries = [["STS-135 style (370 km)", { alt: 370, dv: 95 }], ["ISS undock (390 km)", { alt: 390, dv: 100 }], ["Hubble (560 km)", { alt: 560, dv: 140 }], ["Too gentle", { alt: 330, dv: 55 }], ["Too steep", { alt: 330, dv: 300 }], ["Heavy, steep guidance", { drag: 1.8, mass: 105000 }]];
		var box = $("sx-d-try");
		tries.forEach(function (t) { var b = document.createElement("button"); b.type = "button"; b.textContent = t[0]; b.addEventListener("click", function () { Object.assign(dS, DDEF, t[1]); sync(); }); box.appendChild(b); });
		$("sx-d-reset").addEventListener("click", function () { Object.assign(dS, DDEF); sync(); });
		$("sx-d-solve").addEventListener("click", function () { dS.dv = Math.round(S.deorbitFor(dS.alt * 1000, -1.2 * D)); sync(); });
		$("sx-d-fly").addEventListener("click", function () { if (window.SXFly) window.SXFly.deorbit(dS.alt, dS.dv); });
		function sync() { $("sx-d-alt").value = dS.alt; $("sx-d-dv").value = dS.dv; $("sx-d-dr").value = dS.drag; $("sx-d-m").value = dS.mass; DRAW.deorbit(); }
	};
	DRAW.deorbit = function () {
		$("sx-d-alt-v").textContent = dS.alt + " km"; $("sx-d-dv-v").textContent = dS.dv + " m/s (" + Math.round(dS.dv / 0.3048) + " ft/s)";
		$("sx-d-dr-v").textContent = dS.drag.toFixed(2) + "× Shuttle"; $("sx-d-m-v").textContent = fmtN(dS.mass) + " kg";
		var beta = dS.mass / (S.SHUTTLE.cd * S.SHUTTLE.area), d = S.deorbit(dS.alt * 1000, dS.dv, { drag: dS.drag, beta: beta, vRot: 380 });
		var prop = S.propFor(S.SHUTTLE.mass, dS.dv, S.SHUTTLE.isp), stat = [], bar = "";
		var P = pal();
		if (!d.reaches) {
			bar = '<div class="sx-verdict sx-v-no">Stays in orbit: the low point is ' + Math.round(d.perigee / 1000) + " km, above the 120 km entry interface. Brake harder.</div>";
		} else {
			var e = d.entry, ok = e.out === "taem" && d.gammaEI / D > -2 && d.gammaEI / D < -0.7 && e.peakG < 2.5;
			bar = '<div class="sx-verdict ' + (ok ? "sx-v-ok" : "sx-v-warn") + '">' + (e.out === "skip" ? "⚠ Too shallow: it skips back out of the air." : e.out === "ground" ? "⚠ It hits the ground before slowing down." : ok ? "✅ A Shuttle-like entry." : d.gammaEI / D <= -2 ? "⚠ Steeper than the Shuttle ever flew: more g and heat." : "⚠ Shallow: long and hot, hard to aim.") + "</div>";
			stat = [["Burn", dS.dv + " m/s", fmtN(prop) + " kg of OMS propellant, about " + Math.round(prop / 30) + " s"], ["New low point", Math.round(d.perigee / 1000) + " km", "high point " + Math.round(d.apogee / 1000) + " km"],
				["Burn to entry interface", S.fmtTime(d.tEI), S.fmtKm(d.rangeEI, 0) + " around the Earth"], ["At 120 km", S.fmtV(d.vEI), (d.gammaEI / D).toFixed(2) + "° below horizontal (Shuttle ~ −1.2°)"],
				["Peak deceleration", e.peakG.toFixed(2) + " g", S.fmtTime(e.peakGt) + " after entry interface"], ["Peak nose heating", Math.round(e.peakQ) + " W/cm²", "≈ " + fmtN(e.peakT - 273) + " °C (radiating)"],
				["Entry to wheels stop", S.fmtTime(e.landTime), S.fmtKm(e.landRange, 0) + " of ground, ± " + S.fmtKm(S.crossRange(1), 0) + " to the side"], ["Burn to wheels stop", S.fmtTime(d.tEI + e.landTime), S.fmtKm(d.rangeEI + e.landRange, 0) + " from the burn point"]];
		}
		$("sx-dbar").innerHTML = bar;
		$("sx-dstat").innerHTML = stat.map(function (s) { return '<div class="sx-tile sx-tile--l"><span>' + s[0] + "</span><b>" + s[1] + "</b><small>" + s[2] + "</small></div>"; }).join("");
		drawTrip(d, P);
		if (d.reaches) {
			var pr = d.entry.prof;
			chart($("sx-d-hv"), { series: [{ pts: pr.map(function (p) { return [p.s / 1000, p.h / 1000]; }), col: P.a, label: "height (km)" }, { pts: pr.map(function (p) { return [p.s / 1000, p.v / 1000]; }), col: P.b, axis: "r", label: "speed (km/s)" }],
				fx: function (v) { return fmtN(v); }, fy: function (v) { return v.toFixed(0); }, fr: function (v) { return v.toFixed(1); }, r: true, zero: true, xl: "ground distance after entry interface (km)" });
			chart($("sx-d-gq"), { series: [{ pts: pr.map(function (p) { return [p.t / 60, p.g]; }), col: P.c, label: "g-force" }, { pts: pr.map(function (p) { return [p.t / 60, p.q]; }), col: P.b, axis: "r", label: "nose heating (W/cm²)" }],
				fx: function (v) { return v.toFixed(0); }, fy: function (v) { return v.toFixed(1); }, fr: function (v) { return v.toFixed(0); }, r: true, zero: true, xl: "minutes after entry interface",
				marks: [{ x: d.entry.peakGt / 60, col: P.c, label: "peak g" }] });
		} else { [$("sx-d-hv"), $("sx-d-gq")].forEach(function (c) { var k = canvas(c); k.g.fillStyle = P.bg; k.g.fillRect(0, 0, k.W, k.H); k.g.fillStyle = P.axis; k.g.font = "13px system-ui"; k.g.textAlign = "center"; k.g.fillText("No entry: the orbit stays above 120 km", k.W / 2, k.H / 2); }); }
	};
	/* side view of the whole trip: an "unrolled" Earth, height exaggerated */
	function drawTrip(d, P) {
		var k = canvas($("sx-d-trip")), g = k.g, W = k.W, H = k.H; g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
		var rangeTot = d.reaches ? d.rangeEI + d.entry.landRange : Math.PI * RE, m = 18, x0 = m, x1 = W - m, gy = H - 30, top = 22;
		var hMax = Math.max(dS.alt, 140) * 1000;
		function X(s) { return x0 + s / rangeTot * (x1 - x0); } function Y(h) { return gy - Math.max(0, h) / hMax * (gy - top); }
		g.fillStyle = P.air; g.fillRect(x0, Y(120000), x1 - x0, gy - Y(120000));
		g.fillStyle = P.earth; g.fillRect(x0, gy, x1 - x0, 6);
		g.strokeStyle = P.axis; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x0, Y(120000)); g.lineTo(x1, Y(120000)); g.stroke(); g.setLineDash([]);
		g.fillStyle = P.axis; g.font = "11px system-ui, sans-serif"; g.textAlign = "left"; g.fillText("120 km entry interface", x0 + 4, Y(120000) - 4);
		g.strokeStyle = P.a; g.lineWidth = 2.4; g.beginPath();
		var a = d.a, e = d.e, p = a * (1 - e * e), n = 200, endNu = d.reaches ? Math.PI + d.angleEI : Math.PI * 2;
		for (var i = 0; i <= n; i++) { var nu = Math.PI + (endNu - Math.PI) * i / n, r = p / (1 + e * Math.cos(nu)), s = (nu - Math.PI) * RE; if (i) g.lineTo(X(s), Y(r - RE)); else g.moveTo(X(s), Y(r - RE)); }
		if (d.reaches) d.entry.prof.forEach(function (q) { g.lineTo(X(d.rangeEI + q.s), Y(q.h)); });
		g.stroke();
		if (d.reaches) { g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(d.rangeEI + d.entry.range), Y(d.entry.h)); g.lineTo(X(d.rangeEI + d.entry.landRange), gy); g.stroke(); g.setLineDash([]); }
		g.fillStyle = P.b; g.beginPath(); g.arc(X(0), Y(dS.alt * 1000), 5, 0, 7); g.fill(); g.fillText("🔥 burn", X(0) + 8, Y(dS.alt * 1000) + 4);
		if (d.reaches) { g.fillStyle = P.c; var ex = X(d.rangeEI); g.beginPath(); g.arc(ex, Y(120000), 4, 0, 7); g.fill(); g.textAlign = "center"; g.fillText("entry, " + S.fmtTime(d.tEI), ex, Y(120000) - 18 > top ? Y(120000) - 18 : top + 10); g.fillText("🛬 " + S.fmtTime(d.tEI + d.entry.landTime), X(rangeTot) - 30, gy - 8); }
		g.fillStyle = P.axis; g.textAlign = "center"; g.fillText(S.fmtKm(rangeTot, 0) + " of ground track (height ×" + Math.round((rangeTot / (W - 2 * m)) / (hMax / (gy - top))) + ")", W / 2, H - 6);
	}

	/* ================= Calculator tab ================= */
	INIT.calc = function () {
		var tries = [["ISS", ["415 km", "420 km", 51.6]], ["Shuttle (KSC)", ["300 km", "300 km", 28.5]], ["Hubble", ["535 km", "540 km", 28.5]], ["Sun-synchronous 700 km", ["700 km", "700 km", 98.2]], ["Molniya", ["600 km", "39700 km", 63.4]], ["GPS", ["20180 km", "20180 km", 55]], ["Geostationary", ["35786 km", "35786 km", 0]]];
		var box = $("sx-c-try");
		tries.forEach(function (t) { var b = document.createElement("button"); b.type = "button"; b.textContent = t[0]; b.addEventListener("click", function () { $("sx-c-hp").value = t[1][0]; $("sx-c-ha").value = t[1][1]; $("sx-c-i").value = t[1][2]; DRAW.calc(); }); box.appendChild(b); });
		["sx-c-hp", "sx-c-ha", "sx-c-i", "sx-c-h2", "sx-c-di", "sx-c-m", "sx-c-isp", "sx-c-b"].forEach(function (id) { $(id).addEventListener("input", DRAW.calc); });
	};
	DRAW.calc = function () {
		var hp = S.parseLen($("sx-c-hp").value), ha = S.parseLen($("sx-c-ha").value), inc = parseFloat($("sx-c-i").value) * D, h2 = S.parseLen($("sx-c-h2").value);
		var di = parseFloat($("sx-c-di").value) * D || 0, m0 = parseFloat($("sx-c-m").value), isp = parseFloat($("sx-c-isp").value), beta = parseFloat($("sx-c-b").value);
		var out = $("sx-c-out");
		if (!isFinite(hp) || !isFinite(ha) || hp < -RE * 0.9) { out.innerHTML = '<div class="tu-card"><p class="tu-note">Type heights like 400 km.</p></div>'; return; }
		if (ha < hp) { var x = ha; ha = hp; hp = x; }
		var rp = RE + hp, ra = RE + ha, a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), T = S.period(a), vp = S.visViva(rp, a), va = S.visViva(ra, a);
		var j = isFinite(inc) ? S.j2Rates(a, e, inc) : null, cross = T * S.WE * RE;
		var horizon = Math.sqrt(Math.pow(rp, 2) - RE * RE), cov = Math.acos(RE / rp);
		var orbit = [["Period", S.fmtTime(T), (86400 / T).toFixed(3) + " orbits a day"], ["Speed at the low point", S.fmtV(vp), fmtN(vp * 3.6) + " km/h, " + fmtN(vp * 2.23694) + " mph"],
			["Speed at the high point", S.fmtV(va)], ["Semi-major axis", S.fmtKm(a, 0), "eccentricity " + e.toFixed(5)], ["Escape speed from the low point", S.fmtV(S.escV(rp)), "you need " + S.fmtV(S.escV(rp) - vp) + " more"],
			["Gravity at the low point", (S.MU / (rp * rp)).toFixed(2) + " m/s²", Math.round(S.MU / (rp * rp) / S.G0 * 100) + "% of the surface's: astronauts float because they fall, not because gravity is gone"]];
		var earthRows = [["Ground track moves west each orbit", S.fmtKm(cross, 0), (T / 86400 * 360).toFixed(2) + "° of longitude"],
			["Node drift from Earth's bulge (J2)", j ? (j.raan / D * 86400).toFixed(3) + "°/day" : "–", j ? "perigee turns " + (j.argp / D * 86400).toFixed(3) + "°/day" : ""],
			["Sun-synchronous inclination here", isFinite(S.sunSyncInc(a - RE)) ? (S.sunSyncInc(a - RE) / D).toFixed(2) + "°" : "none", "node turns once a year, same local time every pass"],
			["Distance to the horizon", S.fmtKm(horizon, 0), "you see a circle " + S.fmtKm(2 * cov * RE, 0) + " across"], ["Longest time in shadow", S.fmtTime(T * Math.asin(RE / rp) / Math.PI), "per orbit, with the Sun in the orbit's plane"],
			["Orbital lifetime (rough)", hp < 120000 ? "comes down now" : (function () { var d = S.lifetime(Math.min(hp, ha), beta); return d > 365 * 30 ? "decades or more" : d > 365 ? (d / 365.25).toFixed(1) + " years" : Math.round(d) + " days"; })(), "for m/(Cd·A) = " + beta + " kg/m² (ISS ~ 100-150); solar activity can halve or double it"]];
		var tf = [], h = isFinite(h2) ? S.hohmann(rp, RE + h2) : null;
		if (h) { tf.push(["Hohmann transfer to " + S.fmtKm(h2, 0), S.fmtV(h.total), S.fmtV(Math.abs(h.dv1)) + " + " + S.fmtV(Math.abs(h.dv2)) + ", " + S.fmtTime(h.tof) + " of coasting"]); }
		var pc = S.planeChange(Math.sqrt(S.MU / rp), di); tf.push(["Plane change of " + (di / D).toFixed(2) + "° at " + S.fmtKm(hp, 0), S.fmtV(pc), "2 v sin(Δi/2)"]);
		if (h && di) { var hpc = S.hohmannPlane(rp, RE + h2, di); tf.push(["Transfer + plane change together", S.fmtV(hpc.total), "the tilt done in the second burn saves " + S.fmtV(h.total + pc - hpc.total)]); }
		var deo = S.deorbitFor(hp, -1.2 * D); tf.push(["De-orbit burn for a −1.2° entry", hp > 125000 && e < 0.01 ? S.fmtV(deo) : "–", "from a round orbit at the low point"]);
		var rk = [];
		if (m0 > 0 && isp > 0) {
			[["The transfer", h ? h.total : 0], ["The plane change", pc], ["The de-orbit", e < 0.01 ? deo : 0]].forEach(function (r) { if (r[1] > 0) rk.push([r[0], fmtN(S.propFor(m0, r[1], isp)) + " kg", "of propellant from " + fmtN(m0) + " kg at Isp " + isp + " s"]); });
			rk.push(["The Shuttle's OMS could give", S.fmtV(S.rocketDv(m0, Math.min(S.SHUTTLE.omsProp, m0 * 0.9), isp)), fmtN(S.SHUTTLE.omsProp) + " kg of propellant"]);
		}
		out.innerHTML = '<div class="tu-card"><h3 class="sx-h">The orbit</h3>' + tbl(orbit) + '</div><div class="tu-card"><h3 class="sx-h">Over the Earth</h3>' + tbl(earthRows) + '</div><div class="tu-card"><h3 class="sx-h">Burns</h3>' + tbl(tf) + (rk.length ? '<h3 class="sx-h">Propellant (rocket equation)</h3>' + tbl(rk) : "") + "</div>";
	};

	/* ================= Moon tab ================= */
	var mDv = 300;
	INIT.moon = function () {
		$("sx-m-dv").value = mDv; $("sx-m-dv").addEventListener("input", function () { mDv = parseFloat(this.value); DRAW.moon(); });
		var tli = Math.round(S.tli(185e3).dv);
		[["Shuttle OMS: 300 m/s", 300], ["1,000 m/s", 1000], ["2,500 m/s", 2500], ["Hohmann to the Moon: " + fmtN(tli), tli], ["Apollo TLI: 3,180 m/s", 3180], ["Escape: 3,230 m/s", 3230]].forEach(function (t) {
			var b = document.createElement("button"); b.type = "button"; b.textContent = t[0]; b.addEventListener("click", function () { mDv = t[1]; $("sx-m-dv").value = mDv; DRAW.moon(); }); $("sx-m-try").appendChild(b);
		});
	};
	DRAW.moon = function () {
		var P = pal(), b = S.boost(185e3, mDv, S.D_MOON), k = canvas($("sx-m-c")), g = k.g, W = k.W, H = k.H;
		$("sx-m-dv-v").textContent = fmtN(mDv) + " m/s";
		g.fillStyle = dark() ? "#05070d" : "#0b1020"; g.fillRect(0, 0, W, H);
		var scale = Math.min(W * 0.46, H * 0.46) / (S.D_MOON * 1.08), cx = W * 0.5, cy = H * 0.5;
		g.strokeStyle = "rgba(255,255,255,0.25)"; g.setLineDash([3, 5]); g.beginPath(); g.arc(cx, cy, S.D_MOON * scale, 0, 7); g.stroke(); g.setLineDash([]);
		g.strokeStyle = "rgba(255,255,255,0.10)"; g.beginPath(); g.arc(cx - S.D_MOON * scale, cy, S.SOI_MOON * scale, 0, 7); g.stroke();
		g.fillStyle = "#3b82f6"; g.beginPath(); g.arc(cx, cy, Math.max(3, RE * scale), 0, 7); g.fill();
		g.fillStyle = "#d9d9d9"; g.beginPath(); g.arc(cx - S.D_MOON * scale, cy, Math.max(2.5, S.R_MOON * scale * 1.5), 0, 7); g.fill();
		g.fillStyle = "#cfd6e2"; g.font = "11px system-ui, sans-serif"; g.textAlign = "center"; g.fillText("Moon's orbit (384,400 km)", cx, cy - S.D_MOON * scale - 6); g.fillText("Moon", cx - S.D_MOON * scale, cy + 16); g.fillText("Earth", cx, cy + 16);
		// path: periapsis on the right (burn), apogee on the left toward the Moon
		var r = RE + 185e3, v = Math.sqrt(S.MU / r) + mDv, o = new S.Orbit([r, 0, 0], [0, v, 0], 0, false), pts = [], tMax = b.escape ? 6 * 86400 : (b.T || 1e4) * (b.apo > S.D_MOON * 1.2 ? 0.5 : 1), lim = S.D_MOON * 1.15;
		for (var i = 0; i <= 400; i++) { var s = o.at(i / 400 * tMax).r; if (S.v.norm(s) > lim) break; pts.push(s); }
		g.strokeStyle = mDv >= S.tli(185e3).dv - 15 ? "#69db7c" : "#ffa94d"; g.lineWidth = 2.2; g.beginPath();
		pts.forEach(function (p, i) { var x = cx + p[0] * scale, y = cy - p[1] * scale; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
		// a dot every day
		g.fillStyle = "#fff"; for (var dday = 1; dday < 8; dday++) { var t = dday * 86400; if (t > tMax) break; var q = o.at(t).r; if (S.v.norm(q) > lim) break; g.beginPath(); g.arc(cx + q[0] * scale, cy - q[1] * scale, 2.5, 0, 7); g.fill(); g.fillText("day " + dday, cx + q[0] * scale, cy - q[1] * scale - 7); }
		// close-up of the Earth when the path stays small
		if (!b.escape && b.apo < 120000e3) {
			var bw = Math.min(170, W * 0.32), bx = W - bw - 10, by = 10, ext = Math.max(b.apo, RE * 1.6) * 1.15, sc2 = bw / 2 / ext, icx = bx + bw / 2, icy = by + bw / 2;
			g.fillStyle = "rgba(10,14,26,0.95)"; g.strokeStyle = "rgba(255,255,255,0.3)"; g.lineWidth = 1; g.fillRect(bx, by, bw, bw); g.strokeRect(bx, by, bw, bw);
			g.save(); g.beginPath(); g.rect(bx, by, bw, bw); g.clip();
			g.fillStyle = "#3b82f6"; g.beginPath(); g.arc(icx, icy, RE * sc2, 0, 7); g.fill();
			g.strokeStyle = "#ffa94d"; g.lineWidth = 2; g.beginPath();
			for (var j = 0; j <= 240; j++) { var q2 = o.at(j / 240 * b.T).r; var x2 = icx + q2[0] * sc2, y2 = icy - q2[1] * sc2; if (j) g.lineTo(x2, y2); else g.moveTo(x2, y2); } g.stroke();
			g.restore(); g.fillStyle = "#cfd6e2"; g.textAlign = "left"; g.fillText("close-up ×" + fmtN(S.D_MOON * scale > 0 ? sc2 / scale : 1), bx + 5, by + bw - 6);
		}
		var tli = S.tli(185e3), reach = b.escape || b.apo >= S.D_MOON;
		$("sx-m-read").innerHTML = '<div class="sx-tile"><span>Highest point</span><b>' + (b.escape ? "escapes Earth" : S.fmtKm(b.apo - RE, 0)) + "</b><small>" + (b.escape ? "leaves at " + S.fmtV(b.vinf) + " for good" : Math.round((b.apo) / S.D_MOON * 100) + "% of the way to the Moon") + "</small></div>" +
			'<div class="sx-tile"><span>Reaches the Moon’s distance?</span><b>' + (reach ? "yes, after " + S.fmtTime(b.t, true) : "no") + "</b><small>" + (reach ? "if the Moon is there when you arrive" : "you need " + fmtN(Math.max(0, tli.dv - mDv)) + " m/s more") + "</small></div>" +
			'<div class="sx-tile"><span>Compared with the Shuttle</span><b>' + (mDv / 300).toFixed(1) + "× its OMS</b><small>about 300 m/s from 10.8 t of propellant</small></div>";
		var bud = S.MOON_BUDGET, tot = bud.reduce(function (a, x) { return a + x.dv; }, 0), mx = 3200;
		$("sx-m-budget").innerHTML = '<div class="sx-bars">' + bud.map(function (x) { return '<div class="sx-bar"><span>' + x.name + '</span><i style="width:' + (x.dv / mx * 100).toFixed(1) + '%"></i><b>' + fmtN(x.dv) + " m/s</b></div>"; }).join("") +
			'<div class="sx-bar sx-bar--sh"><span>The Shuttle\'s whole OMS supply</span><i style="width:' + (300 / mx * 100).toFixed(1) + '%"></i><b>~300 m/s</b></div></div><p class="tu-note">Total about ' + fmtN(tot) + " m/s after reaching Earth orbit. Apollo split this between the S-IVB stage, the service module, and the lunar module's two stages.</p>";
		var dry = 100000, need = dry * (Math.exp(tli.dv / (S.SHUTTLE.isp * S.G0)) - 1), full = dry * (Math.exp(tot / (S.SHUTTLE.isp * S.G0)) - 1);
		$("sx-m-rocket").innerHTML = tbl([["Propellant just to leave for the Moon", fmtN(need / 1000, 0) + " t", "for a 100 t orbiter at Isp 316 s (it carried 10.8 t)"],
			["For the whole trip with one vehicle", fmtN(full / 1000, 0) + " t", "about " + Math.round(full / S.SHUTTLE.omsProp) + " times the OMS tanks: why missions use stages"],
			["Arriving back from the Moon", "~11 km/s", "the Shuttle's tiles were made for 7.8 km/s; heating grows about with speed cubed (" + Math.pow(11 / 7.8, 3).toFixed(1) + "×)"],
			["Time to the Moon (Hohmann-like)", S.fmtTime(tli.tof, true), "Apollo pushed a bit harder and took about 3 days"]]);
	};
})();

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
	var st = { t: 0, epoch: Date.now(), nodes: [], sel: null, phase: "orbit", trail: [], mapTrail: [], speed: 5, paused: false, j2: pref.j2 !== false, nid: 1, fire: 0 };
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
	$("sx-cam").addEventListener("change", function () { if (this.value === "target" && !st.target) { this.value = "shuttle"; flash("No station in this mission."); } if (viewObj) viewObj.setFollow(this.value); });

	/* ---------------- station view ---------------- */
	var relC = $("sx-relc"), relX = relC.getContext("2d");
	function drawRel() {
		var box = $("sx-rel"), has = st.target && st.phase !== "entry" && st.phase !== "landed";
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
		window.SXMap.base(g, mw, mh, sll);
		if (st.phase === "orbit" || st.phase === "docked") {
			if (performance.now() - mapCache.t > 250 || needPlan) {
				var T = st.orb.el.T || 5500, stop = st.orb.el.rp < RE + EI ? st.orb.nextRadius(st.t, RE + EI, false) : null;
				mapCache.fut = futureTrack(st.orb, st.t, T * 2, 300, stop);
				mapCache.tgt = st.target ? futureTrack(st.target, st.t, T, 150) : null;
				var n = selNode(); mapCache.plan = null;
				if (n && n.after) { var stop2 = n.pred ? n.pred.tE : null; mapCache.plan = futureTrack(n.after, n.t, (n.after.el.T || 5500) * 1.2, 200, stop2); }
				mapCache.t = performance.now();
			}
			if (mapCache.tgt) { g.strokeStyle = "rgba(105,219,124,0.6)"; g.lineWidth = 1.5; window.SXMap.track(g, mapCache.tgt, mw, mh); }
			g.strokeStyle = "rgba(142,197,255,0.95)"; g.lineWidth = 2; window.SXMap.track(g, mapCache.fut, mw, mh);
			if (mapCache.plan) { g.strokeStyle = "#ffa94d"; g.setLineDash([6, 5]); g.lineWidth = 2; window.SXMap.track(g, mapCache.plan, mw, mh); g.setLineDash([]); }
		}
		if (pref.trail !== false && st.mapTrail.length > 1) { g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 1.5; window.SXMap.track(g, st.mapTrail, mw, mh); }
		// landing prediction for the selected burn (or the current orbit / entry)
		var n2 = selNode(), pr = st.phase === "entry" || st.phase === "landed" ? null : (n2 && n2.pred) || st.pred;
		if (pr) {
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
		S.SITES.forEach(function (s) { var q = window.SXMap.xy(s.lat * D, s.lon * D, mw, mh); g.fillStyle = "#51cf66"; g.strokeStyle = "#0b1a0b"; g.lineWidth = 1.5; g.beginPath(); g.rect(q[0] - 3.5, q[1] - 3.5, 7, 7); g.fill(); g.stroke(); });
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
		Promise.all([imp("three"), imp("three/addons/controls/OrbitControls.js"), window.SXMap.load()]).then(function (m) {
			THREE = m[0]; viewObj = window.SXView.create($("sx-3d"), THREE, m[1].OrbitControls);
			viewObj.setTexture(m[2]); viewObj.setSites(S.SITES); viewObj.setFollow($("sx-cam").value); aimCam();
			$("sx-load").hidden = true; wirePointer();
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
			orbPts = stop ? arcPts(st.orb, st.t, stop) : st.orb.ring(st.t, 240);
			if (n && n.after) planPts = n.pred ? arcPts(n.after, n.t, n.pred.tE) : n.after.ring(n.t, 240);
			if (st.target) tPts = st.target.ring(st.t, 180);
		}
		if (pref.trail !== false) trail = st.trail;
		var pr = (n && n.pred) || (o ? st.pred : null), surf = null;
		if (st.entry) { surf = []; for (var k = 0; k <= 60; k++) surf.push(entryPos(st.entry.t0 + k / 60 * st.entry.e.landTime)); }
		viewObj.render({ gmst: gm(st.t), sun: S.sunDir(st.epoch + st.t * 1000), shuttle: sh, target: st.target && st.phase !== "landed" ? st.target.at(st.t) : null,
			orbit: orbPts, plan: planPts, targetOrbit: tPts, trail: trail, node: nodeInfo, others: others,
			ei: pr ? { lat: pr.rel.lat, lon: pr.rel.lon } : st.entry ? { lat: st.entry.rel.lat, lon: st.entry.rel.lon } : null,
			land: pr ? pr.land : st.entry && st.entry.site ? { lat: st.entry.site.s.lat * D, lon: st.entry.site.s.lon * D } : null,
			footprint: pr ? pr.foot.concat([pr.foot[0]]) : null, surfPath: surf });
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
