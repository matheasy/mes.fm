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
