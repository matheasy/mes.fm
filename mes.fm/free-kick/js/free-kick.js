/* MES Free Kicks & Penalties: ball flight physics (drag, Magnus curl / dip, knuckleball wobble, bounces on the ground, posts, bar,
   net, wall players and the goalkeeper), the rules of a penalty shootout and a free-kick match, practice targets + challenges, the
   computer kicker / keeper and the Hive game protocol. Pure code: runs in the page, in node (tool_apps_src/free-kick-tests.js) and on
   the server (a byte-identical copy at mes.fm/api/_free-kick-lib.js checks online kicks: cp after editing; the tests check).

   DETERMINISM. A kick is a few integers. Every browser and the server simulate it and must get exactly the same result, so simulate()
   uses only + - * / Math.sqrt Math.floor Math.round Math.abs (exact IEEE operations) and its own sine / cosine (polynomials). Never
   use Math.sin / cos / exp / pow / atan2 inside simulate() or the rules. aimFor() and the computer players may use them (their result
   is a set of integers that then replays exactly).

   Units: metres, seconds. x = across the goal (+x = to the kicker's right), y = out from the goal line into the pitch, z = up.
   The goal line runs from y = 0 to y = -0.12; posts 12 cm round, inner edges at x = ±3.66; bar underside at z = 2.44.

   Strings (base36 fields joined by "~"):
   setup  bx ~ by (cm) ~ wall players 0-6 ~ wall shift (cm, + = right) ~ jump 0/1 ~ keeper start x (cm)
   shot   yaw (1/100 degree, 0 = straight at the goal line, + = right) ~ pitch (1/100 degree up) ~ speed (cm/s) ~ side spin ~ top spin
          (spins in 1/10 revolution per second; side + = curls right, top + = dips, - = floats)
   act    keeper: dive target x (cm) ~ target height (cm) ~ start after (ms; -1 = stays standing) */
(function (root) {
	"use strict";
	var B = {};
	var PI = 3.141592653589793;

	/* ======================================================= deterministic maths ======================================================= */
	function poly(x, sinPart) {
		var x2 = x * x;
		if (sinPart) return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
		return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600 + x2 * (-1 / 87178291200)))))));
	}
	/** [sin, cos] of an angle in 1/10000 degree (an integer) */
	function dsc(units) {
		units = ((units % 3600000) + 3600000) % 3600000;
		var q = Math.floor((units + 450000) / 900000) % 4;
		var r = units - q * 900000;
		if (r > 450000) r -= 3600000;
		var x = r * (PI / 1800000);
		var s = poly(x, true), c = poly(x, false);
		if (q === 0) return [s, c];
		if (q === 1) return [c, -s];
		if (q === 2) return [-s, -c];
		return [-c, s];
	}
	function sinr(rad) { return dsc(Math.round(rad * 1800000 / PI))[0]; }
	B.dsc = dsc;

	/* random numbers from a string seed (integer maths only) */
	function xmur(str) {
		var h = 1779033703 ^ str.length;
		for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
		return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
	}
	B.rng = function (seed) {
		var a = xmur(String(seed))();
		return function () {
			a |= 0; a = (a + 0x6D2B79F5) | 0;
			var t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	};
	/** a standard-normal-ish number from 4 uniforms (no log / cos needed) */
	function gauss(r) { return (r() + r() + r() + r() - 2) * 1.7320508075688772; }

	/* SHA-256 of a string (UTF-8), hex. Used for the keeper's commit on Hive and for seeds. */
	B.sha256 = function (str) {
		var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
			0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
			0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
			0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
		var bytes = [], i, j;
		var s = unescape(encodeURIComponent(String(str)));
		for (i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
		var bl = bytes.length * 8;
		bytes.push(0x80);
		while (bytes.length % 64 !== 56) bytes.push(0);
		for (i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bl >>> (i * 8)) & 255);
		var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
		function ror(x, n) { return (x >>> n) | (x << (32 - n)); }
		for (i = 0; i < bytes.length; i += 64) {
			for (j = 0; j < 16; j++) W[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
			for (j = 16; j < 64; j++) {
				var s0 = ror(W[j - 15], 7) ^ ror(W[j - 15], 18) ^ (W[j - 15] >>> 3), s1 = ror(W[j - 2], 17) ^ ror(W[j - 2], 19) ^ (W[j - 2] >>> 10);
				W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
			}
			var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
			for (j = 0; j < 64; j++) {
				var t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + W[j]) | 0;
				var t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
				h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
			}
			H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
		}
		return H.map(function (x) { return ("00000000" + (x >>> 0).toString(16)).slice(-8); }).join("");
	};

	function i36(n) { return (n < 0 ? "-" : "") + Math.abs(n).toString(36); }
	function p36(s) { return /^-?[0-9a-z]{1,7}$/.test(s) ? parseInt(s, 36) : NaN; }
	function ints(str, n) {
		var f = String(str || "").split("~");
		if (f.length !== n) return null;
		var o = f.map(p36);
		for (var i = 0; i < o.length; i++) if (isNaN(o[i])) return null;
		return o;
	}
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

	/* ======================================================= the pitch ======================================================= */
	var G = B.G = {
		R: 0.11, mass: 0.43, halfW: 3.66, barZ: 2.44, postR: 0.06, postX: 3.72, lineY: -0.06, lineBack: -0.12, depth: 2.0,
		boxX: 20.16, boxY: 16.5, sixX: 9.16, sixY: 5.5, penY: 11, arcR: 9.15, pitchHalf: 34, wallDist: 9.15, keeperY: 0.3
	};
	var KDRAG = 0.5 * 1.2 * PI * G.R * G.R / G.mass;   // 0.5 rho A / m

	/* ======================================================= strings ======================================================= */
	B.setupStr = function (s) { return [i36(Math.round(s.bx * 100)), i36(Math.round(s.by * 100)), i36(s.n | 0), i36(s.off | 0), i36(s.j ? 1 : 0), i36(Math.round((s.kx || 0) * 100))].join("~"); };
	B.setupParse = function (str) {
		var f = ints(str, 6);
		if (!f) return null;
		var o = { bx: f[0] / 100, by: f[1] / 100, n: f[2], off: f[3], j: f[4], kx: f[5] / 100 };
		if (Math.abs(o.bx) > G.pitchHalf || o.by < 5 || o.by > 50 || o.n < 0 || o.n > 6 || Math.abs(o.off) > 600 || (o.j !== 0 && o.j !== 1) || Math.abs(o.kx) > 3) return null;
		return o;
	};
	B.SHOT_LIM = { yaw: 8000, pmin: -300, pmax: 4500, smin: 300, smax: 4000, spin: 150 };
	B.shotStr = function (o) { return [i36(o.yaw), i36(o.pitch), i36(o.spd), i36(o.side || 0), i36(o.top || 0)].join("~"); };
	B.shotParse = function (str) {
		var f = ints(str, 5), L = B.SHOT_LIM;
		if (!f) return null;
		var o = { yaw: f[0], pitch: f[1], spd: f[2], side: f[3], top: f[4] };
		if (Math.abs(o.yaw) > L.yaw || o.pitch < L.pmin || o.pitch > L.pmax || o.spd < L.smin || o.spd > L.smax || Math.abs(o.side) > L.spin || Math.abs(o.top) > L.spin) return null;
		return o;
	};
	B.actStr = function (o) { return [i36(o.tx | 0), i36(o.tz | 0), i36(o.d | 0)].join("~"); };
	B.actParse = function (str) {
		var f = ints(str, 3);
		if (!f) return null;
		var o = { tx: f[0], tz: f[1], d: f[2] };
		if (Math.abs(o.tx) > 600 || o.tz < 0 || o.tz > 320 || o.d < -1 || o.d > 3000) return null;
		return o;
	};
	B.STAY = { tx: 0, tz: 0, d: -1 };

	/* ======================================================= set pieces ======================================================= */
	B.inBox = function (x, y) { return Math.abs(x) < G.boxX && y < G.boxY; };
	B.distance = function (bx, by) { return Math.sqrt(bx * bx + (by + 0.06) * (by + 0.06)); };
	/** angle from straight-on, degrees (page only) */
	B.angleDeg = function (bx, by) { return Math.atan2(Math.abs(bx), by) * 180 / PI; };
	/** how many players in the wall for a free kick from here (what most teams do) */
	B.autoWall = function (bx, by) {
		var d = B.distance(bx, by), a = Math.abs(bx) / Math.max(0.1, by);   // tan of the angle
		var n = d < 21 ? 5 : d < 26 ? 4 : d < 31 ? 3 : 2;
		if (d > 38) n = 1;
		if (a > 0.84) n = Math.min(n, 2); else if (a > 0.47) n = Math.min(n, 3);
		return n;
	};
	/** the keeper's starting x for a free kick: a little toward the far post when there is a wall */
	B.autoKeeper = function (bx, by, n) {
		if (!n) return clamp(Math.round(bx * 4) / 100, -0.4, 0.4);
		var sgn = bx > 0.3 ? 1 : bx < -0.3 ? -1 : 0;
		return clamp(Math.round((-sgn * (n >= 3 ? 0.7 : 0.4) + bx * 0.02) * 100) / 100, -1.5, 1.5);
	};
	B.freeKick = function (bx, by, opts) {
		opts = opts || {};
		var n = opts.n !== undefined ? opts.n : B.autoWall(bx, by);
		return { bx: Math.round(bx * 100) / 100, by: Math.round(by * 100) / 100, n: n, off: opts.off | 0, j: opts.j ? 1 : 0, kx: opts.kx !== undefined ? opts.kx : B.autoKeeper(bx, by, n) };
	};
	B.penalty = function () { return { bx: 0, by: G.penY, n: 0, off: 0, j: 0, kx: 0 }; };
	/** a random legal free-kick spot (outside the penalty area, 17-34 m out, not too wide) */
	B.randomSpot = function (r) {
		for (var i = 0; i < 400; i++) {
			var d = 17 + r() * 17, a = (r() * 2 - 1) * 0.85;
			var bx = d * poly(a, true), by = d * poly(a, false) - 0.06;
			if (!B.inBox(bx, by) && by >= 8 && Math.abs(bx) <= 28) return { bx: Math.round(bx * 10) / 10, by: Math.round(by * 10) / 10 };
		}
		return { bx: 0, by: 22 };
	};
	/** where the wall players stand: [{x, y}], outermost (covering the near post) first */
	B.wallSpots = function (s) {
		var out = [];
		if (!s.n) return out;
		var gx = 0, gy = G.lineY, dx = gx - s.bx, dy = gy - s.by, dl = Math.sqrt(dx * dx + dy * dy);
		var ux = dx / dl, uy = dy / dl;                        // ball -> goal centre
		var px = -uy, py = ux;                                 // across the line of the wall
		var dist = Math.min(G.wallDist, dl - 1.2);
		var cx = s.bx + ux * dist, cy = s.by + uy * dist;
		// near post (the side the ball is on; straight on = the kicker's left)
		var side = s.bx > 0.3 ? 1 : -1;
		var npx = side * (G.halfW + 0.15), npy = G.lineY;
		var ex = npx - s.bx, ey = npy - s.by, el = Math.sqrt(ex * ex + ey * ey);
		var t = dist / ((ex * ux + ey * uy) / el);             // along the near-post line until it is `dist` out along u
		var qx = s.bx + ex / el * t, qy = s.by + ey / el * t;
		var q = (qx - cx) * px + (qy - cy) * py;              // where that is along the wall line
		var dir = q > 0 ? -1 : 1;                              // the rest of the wall goes toward the middle
		var start = q - dir * 0.3 + (s.off || 0) / 100 * (px >= 0 ? 1 : -1);
		for (var i = 0; i < s.n; i++) {
			var a = start + dir * i * 0.5;
			out.push({ x: Math.round((cx + px * a) * 1000) / 1000, y: Math.round((cy + py * a) * 1000) / 1000 });
		}
		return out;
	};
	/** how high the wall is off the ground at time t after the kick (they jump when the ball is struck) */
	B.wallLift = function (s, t) {
		if (!s.j || t < 0.12) return 0;
		var u = t - 0.12, z = 2.5 * u - 4.905 * u * u;
		return z > 0 ? z : 0;
	};

	/* ======================================================= the goalkeeper ======================================================= */
	// Standing: a body from z 0.2 to 1.75 plus two hands at chest height. Diving: the hands travel to the target (clamped to what a
	// keeper can reach) in 0.12 s + 0.085 s per metre after `d` ms, and the body follows behind them.
	B.KEEPER = { r: 0.19, handR: 0.12, reach: 3.25, base: 0.12, perM: 0.085 };
	B.keeperTarget = function (s, act) {
		var kx = s.kx || 0, tx = act.tx / 100, tz = act.tz / 100;
		tz = clamp(tz, 0.12, 2.5);
		var dx = tx - kx, dz = tz - 1.0, d = Math.sqrt(dx * dx + dz * dz), lim = B.KEEPER.reach;
		if (d > lim) { tx = kx + dx * lim / d; tz = 1.0 + dz * lim / d; }
		return { x: tx, z: clamp(tz, 0.12, 2.5) };
	};
	/** keeper pose at time t: {ax, az (feet end), hx, hz (hands end), y, s (0 standing .. 1 dive done), dive} */
	B.keeperAt = function (s, act, t) {
		var kx = s.kx || 0, y = G.keeperY;
		var stand = { ax: kx, az: 0.2, hx: kx, hz: 1.75, y: y, s: 0, dive: false, vx: 0, vz: 0 };
		if (!act || act.d < 0) return stand;
		var t0 = act.d / 1000;
		if (t <= t0) return stand;
		var T = B.keeperTarget(s, act);
		var h0x = kx, h0z = 1.45, dx = T.x - h0x, dz = T.z - h0z, dist = Math.sqrt(dx * dx + dz * dz);
		var dur = B.KEEPER.base + B.KEEPER.perM * dist;
		var u = clamp((t - t0) / dur, 0, 1), e = u * u * (3 - 2 * u);
		var hx = h0x + dx * e, hz = h0z + dz * e;
		// feet end: 1.75 m behind the hands, pointing back toward where he pushed off
		var bx = T.x - kx, bz = T.z - 0.4, bl = Math.sqrt(bx * bx + bz * bz) || 1;
		var fx = T.x - 1.75 * bx / bl, fz = Math.max(0.1, T.z - 1.75 * bz / bl);
		var ax = kx + (fx - kx) * e, az = 0.2 + (fz - 0.2) * e;
		return { ax: ax, az: az, hx: hx, hz: hz, y: y, s: e, dive: true };
	};

	/* ======================================================= the simulation ======================================================= */
	var DT = 0.001, FRAME = 10, MAXT = 6;
	function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	/** sphere (p, v, radius R) against a capsule segment a-b, radius r, moving with velocity ov. Returns true on contact. */
	function capsule(p, v, w, a, b, r, e, fr, ov) {
		var abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], L2 = abx * abx + aby * aby + abz * abz;
		var t = L2 > 1e-12 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / L2 : 0;
		t = clamp(t, 0, 1);
		var qx = a[0] + abx * t, qy = a[1] + aby * t, qz = a[2] + abz * t;
		var dx = p[0] - qx, dy = p[1] - qy, dz = p[2] - qz, d2 = dx * dx + dy * dy + dz * dz, rr = G.R + r;
		if (d2 >= rr * rr) return false;
		var d = Math.sqrt(d2);
		if (d < 1e-9) { dx = 0; dy = 1; dz = 0; d = 1e-9; } else { dx /= d; dy /= d; dz /= d; }
		var pen = rr - d;
		p[0] += dx * pen; p[1] += dy * pen; p[2] += dz * pen;
		var ox = ov ? ov[0] : 0, oy = ov ? ov[1] : 0, oz = ov ? ov[2] : 0;
		var rx = v[0] - ox, ry = v[1] - oy, rz = v[2] - oz, vn = rx * dx + ry * dy + rz * dz;
		if (vn < 0) {
			var nx = vn * dx, ny = vn * dy, nz = vn * dz;
			var tx = rx - nx, ty = ry - ny, tz = rz - nz;
			v[0] = ox + tx * fr - nx * e; v[1] = oy + ty * fr - ny * e; v[2] = oz + tz * fr - nz * e;
			w[0] *= 0.5; w[1] *= 0.5; w[2] *= 0.5;
		}
		return true;
	}
	function keeperParts(s, act, t) {
		var k = B.keeperAt(s, act, t), y = k.y, out = [[[k.ax, y, k.az], [k.hx, y, k.hz], B.KEEPER.r]];
		if (!k.dive || k.s < 0.25) {
			var kx = s.kx || 0, spread = k.dive ? 0.45 * (1 - k.s) : 0.45;
			out.push([[kx - spread, y, 1.3], [kx - spread, y, 1.3], B.KEEPER.handR]);
			out.push([[kx + spread, y, 1.3], [kx + spread, y, 1.3], B.KEEPER.handR]);
		}
		return out;
	}
	/** launch velocity of a shot */
	B.launch = function (shot) {
		var yw = dsc(shot.yaw * 100), pt = dsc(shot.pitch * 100), v = shot.spd / 100;
		return [v * pt[1] * yw[0], -v * pt[1] * yw[1], v * pt[0]];
	};
	/**
	 * Simulate one kick. setup / shot / act objects (or strings). opts: {frames, noKeeper, noWall, maxT}
	 * -> {res: "goal|save|blocked|post|wide|over|short", ev: [[t, what]], t, cross: {x, z, t}|null, frames: [x, y, z ...]|null, end: [x, y, z]}
	 */
	B.simulate = function (setup, shot, act, opts) {
		opts = opts || {};
		if (typeof setup === "string") setup = B.setupParse(setup);
		if (typeof shot === "string") shot = B.shotParse(shot);
		if (typeof act === "string") act = B.actParse(act);
		if (!setup || !shot) return null;
		if (!act || opts.noKeeper) act = null;
		var R = G.R, p = [setup.bx, setup.by, R], v = B.launch(shot);
		var hl = Math.sqrt(v[0] * v[0] + v[1] * v[1]) || 1, hx = v[0] / hl, hy = v[1] / hl;
		var ws = shot.side / 10 * 2 * PI, wt = shot.top / 10 * 2 * PI;
		var w = [-hy * wt, hx * wt, ws];
		var wall = opts.noWall ? [] : B.wallSpots(setup);
		var phase1 = ((shot.yaw * 7 + shot.spd * 3 + shot.pitch) % 628) / 100, phase2 = ((shot.spd * 11 + shot.yaw) % 628) / 100;
		var frames = opts.frames ? [] : null, ev = [], hit = { keeper: 0, wall: 0, post: 0 }, res = null, endT = opts.maxT || MAXT, cross = null, over = false;
		var maxT = opts.maxT || MAXT, steps = Math.round(maxT / DT), wasRolling = false, bounced = 0, goalT = -1;
		var prevK = null;
		for (var i = 0; i <= steps; i++) {
			var t = i * DT;
			if (frames && i % FRAME === 0) frames.push(Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000, Math.round(p[2] * 1000) / 1000);
			if (t >= endT) break;
			var sp = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
			var rolling = p[2] <= R + 1e-6 && v[2] <= 1e-6 && v[2] >= -0.5;
			var ax = 0, ay = 0, az = rolling ? 0 : -9.81;
			if (sp > 0.05) {
				var q = sp / 12.5, q2 = q * q, q4 = q2 * q2, cd = 0.25 + 0.2 / (1 + q4 * q4);
				var dk = -KDRAG * cd * sp;
				ax += dk * v[0]; ay += dk * v[1]; az += rolling ? 0 : dk * v[2];
				var wm = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
				if (wm > 0.1 && !rolling) {
					var S = R * wm / sp, cl = 1.6 * S / (1 + 3 * S), c = cross3(w, v), f = KDRAG * cl * sp / wm;
					ax += f * c[0]; ay += f * c[1]; az += f * c[2];
				}
				// knuckleball: almost no spin at high speed -> the wake flips from side to side
				var kn = clamp(1 - wm / 12, 0, 1) * clamp((sp - 17) / 6, 0, 1);
				if (kn > 0 && !rolling) {
					var a2 = KDRAG * sp * sp * kn, vxh = v[0] / sp, vyh = v[1] / sp;
					var s1 = sinr(2 * PI * 2.3 * t + phase1) * 0.07 * a2, s2 = sinr(2 * PI * 1.7 * t + phase2) * 0.05 * a2;
					ax += -vyh * s1; ay += vxh * s1; az += s2;
				}
			}
			v[0] += ax * DT; v[1] += ay * DT; v[2] += az * DT;
			if (rolling) {
				var vh = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
				if (vh > 0) { var k = Math.max(0, 1 - 0.9 * DT / vh); v[0] *= k; v[1] *= k; }
				w[0] *= 0.99; w[1] *= 0.99; w[2] *= 0.99;
			}
			var dec = 1 - 0.05 * DT;
			w[0] *= dec; w[1] *= dec; w[2] *= dec;
			var py0 = p[1];
			p[0] += v[0] * DT; p[1] += v[1] * DT; p[2] += v[2] * DT;
			// ground
			if (p[2] < R) {
				p[2] = R;
				if (v[2] < -0.5) { v[2] = -0.55 * v[2]; v[0] *= 0.8; v[1] *= 0.8; w[0] *= 0.6; w[1] *= 0.6; w[2] *= 0.6; bounced++; }
				else v[2] = 0;
			}
			// goal frame
			for (var sg = -1; sg <= 1; sg += 2) {
				if (capsule(p, v, w, [sg * G.postX, G.lineY, 0], [sg * G.postX, G.lineY, G.barZ + G.postR], G.postR, 0.65, 0.85)) { if (!hit.post) ev.push([t, "post"]); hit.post = 1; }
			}
			if (capsule(p, v, w, [-G.postX, G.lineY, G.barZ + G.postR], [G.postX, G.lineY, G.barZ + G.postR], G.postR, 0.65, 0.85)) { if (!hit.post) ev.push([t, "bar"]); hit.post = 1; }
			// wall
			if (wall.length && p[1] > G.lineY && p[2] < 2.6) {
				var lift = B.wallLift(setup, t);
				for (var wi = 0; wi < wall.length; wi++) {
					var wp = wall[wi];
					if (capsule(p, v, w, [wp.x, wp.y, lift + 0.3], [wp.x, wp.y, lift + 1.62], 0.22, 0.35, 0.6)) { if (!hit.wall) ev.push([t, "wall"]); hit.wall = 1; }
				}
			}
			// keeper
			if (act && p[1] < 3 && p[1] > -0.2 && !res) {
				var parts = keeperParts(setup, act, t), pv = prevK || parts;
				for (var ki = 0; ki < parts.length; ki++) {
					var pa = parts[ki], pb = pv[ki] || pa;
					var ov = [(pa[1][0] - pb[1][0]) / DT, 0, (pa[1][2] - pb[1][2]) / DT];
					if (capsule(p, v, w, pa[0], pa[1], pa[2], 0.3, 0.45, ov)) { if (!hit.keeper) ev.push([t, "keeper"]); hit.keeper = 1; }
				}
				prevK = parts;
			}
			// crossing the goal plane
			if (!cross && py0 >= G.lineY && p[1] < G.lineY) cross = { x: Math.round(p[0] * 1000) / 1000, z: Math.round(p[2] * 1000) / 1000, t: Math.round(t * 1000) / 1000 };
			if (p[2] > G.barZ + 0.3 && p[1] < 3) over = true;
			// result
			if (!res) {
				if (p[1] < G.lineBack - R) {
					if (Math.abs(p[0]) < G.halfW && p[2] < G.barZ) { res = "goal"; goalT = t; ev.push([t, "goal"]); endT = t + 0.9; }
					else { res = hit.keeper ? "save" : hit.wall ? "blocked" : hit.post ? "post" : (p[2] >= G.barZ || over) && Math.abs(p[0]) < G.halfW + 1.5 ? "over" : "wide"; endT = t + 0.35; }
				} else if (p[1] > setup.by + 6 || Math.abs(p[0]) > 40 || (rolling && sp < 0.25) || (p[1] > 3 && v[1] > 0 && (hit.keeper || hit.wall) && sp < 6)) {
					res = hit.keeper ? "save" : hit.wall ? "blocked" : hit.post ? "post" : "short"; endT = t + 0.25;
				}
			} else if (res === "goal") {
				// the net
				if (p[1] < G.lineBack - G.depth + R && v[1] < 0) { v[1] = -v[1] * 0.12; v[0] *= 0.3; v[2] *= 0.4; }
				if (Math.abs(p[0]) > G.halfW - R && p[0] * v[0] > 0) { v[0] = -v[0] * 0.15; v[1] *= 0.5; }
				if (p[2] > G.barZ - R && v[2] > 0) { v[2] = -v[2] * 0.15; }
			}
			wasRolling = rolling;
		}
		if (!res) res = hit.keeper ? "save" : hit.wall ? "blocked" : hit.post ? "post" : "short";
		return { res: res, ev: ev, t: Math.round(Math.min(endT, maxT) * 1000) / 1000, cross: cross, frames: frames, end: [p[0], p[1], p[2]], bounced: bounced, goalT: goalT, hit: hit };
	};
	B.FRAME_S = FRAME * DT;
	B.RES_TEXT = { goal: "GOAL!", save: "Saved!", blocked: "Blocked by the wall", post: "Off the woodwork", wide: "Wide", over: "Over the bar", short: "Stopped short" };

	/* ======================================================= aiming (page / computer only) ======================================================= */
	/** a shot that reaches (tx, tz) on the goal line at speed spd (m/s) with these spins (rev/s), ignoring keeper and wall */
	B.aimFor = function (setup, tx, tz, spd, side, top) {
		var sd = Math.round(side * 10), tp = Math.round(top * 10), sp = Math.round(spd * 100);
		var dy = setup.by - G.lineY, yaw = Math.atan2(tx - setup.bx, dy) * 180 / PI;
		var d = Math.sqrt(dy * dy + (tx - setup.bx) * (tx - setup.bx));
		var pitch = Math.atan2(tz - 0.11 + 4.9 * (d / spd) * (d / spd), d) * 180 / PI;
		function at(yw, pc) {
			var sh = { yaw: Math.round(clamp(yw, -80, 80) * 100), pitch: Math.round(clamp(pc, -3, 45) * 100), spd: sp, side: sd, top: tp };
			var r = B.simulate(setup, sh, null, { noKeeper: true, noWall: true, maxT: 3 });
			if (!r.cross) return { x: r.end[0], z: -1, sh: sh };
			return { x: r.cross.x, z: r.cross.z, sh: sh };
		}
		var best = null;
		for (var it = 0; it < 7; it++) {
			var c = at(yaw, pitch);
			if (c.z < 0) { pitch += 3; continue; }
			var ex = tx - c.x, ez = tz - c.z, err = ex * ex + ez * ez;
			if (!best || err < best.err) best = { err: err, sh: c.sh };
			if (err < 1e-4) break;
			var cy = at(yaw + 0.2, pitch), cp = at(yaw, pitch + 0.2);
			if (cy.z < 0 || cp.z < 0) { pitch += 1; continue; }
			var a11 = (cy.x - c.x) / 0.2, a21 = (cy.z - c.z) / 0.2, a12 = (cp.x - c.x) / 0.2, a22 = (cp.z - c.z) / 0.2, det = a11 * a22 - a12 * a21;
			if (Math.abs(det) < 1e-9) break;
			var dyaw = (a22 * ex - a12 * ez) / det, dp = (-a21 * ex + a11 * ez) / det;
			yaw += clamp(dyaw, -8, 8); pitch += clamp(dp, -6, 6);
		}
		return best ? best.sh : at(yaw, pitch).sh;
	};
	/** aim spread (degrees, one standard deviation): small for soft shots, more for blasts */
	B.spreadDeg = function (shot, level) {
		var v = shot.spd / 100, base = 0.45 + Math.max(0, v - 18) * 0.11 + (Math.abs(shot.side) + Math.abs(shot.top)) / 10 * 0.025;
		return base * (level === undefined ? 1 : level);
	};
	/** the shot that really happens: the intended one plus a seeded miss (whole numbers out, so it replays exactly) */
	B.applyError = function (shot, seed, n, level) {
		if (level === 0) return { yaw: shot.yaw, pitch: shot.pitch, spd: shot.spd, side: shot.side, top: shot.top };
		var r = B.rng(String(seed) + "|err|" + n), sd = B.spreadDeg(shot, level) * 100, L = B.SHOT_LIM;
		var o = {
			yaw: clamp(Math.round(shot.yaw + gauss(r) * sd), -L.yaw, L.yaw),
			pitch: clamp(Math.round(shot.pitch + gauss(r) * sd * 0.8), L.pmin, L.pmax),
			spd: clamp(Math.round(shot.spd * (1 + gauss(r) * 0.015)), L.smin, L.smax),
			side: clamp(Math.round(shot.side + gauss(r) * 4), -L.spin, L.spin),
			top: clamp(Math.round(shot.top + gauss(r) * 4), -L.spin, L.spin)
		};
		return o;
	};

	/* ======================================================= computer players ======================================================= */
	B.LEVELS = {
		easy: { name: "Easy", react: 440, noise: 0.6, guess: 0.12, aim: 1.6 },
		medium: { name: "Medium", react: 340, noise: 0.4, guess: 0.15, aim: 1.15 },
		hard: { name: "Hard", react: 270, noise: 0.28, guess: 0.2, aim: 0.85 },
		pro: { name: "Pro", react: 225, noise: 0.18, guess: 0.22, aim: 0.65 }
	};
	B.LEVEL_IDS = ["easy", "medium", "hard", "pro"];
	/** the computer keeper reacting to a shot (it watches the ball, so it is decided after the kick) */
	B.aiKeeper = function (setup, shot, level, seed, n) {
		var L = B.LEVELS[level] || B.LEVELS.medium, r = B.rng(String(seed) + "|gk|" + n);
		var pen = !setup.n && setup.by <= 12;
		if (pen && r() < L.guess) {    // penalty: guess a side before the kick
			var side = r() < 0.5 ? -1 : 1, hi = r() < 0.35;
			return { tx: Math.round(side * (220 + r() * 100)), tz: Math.round(hi ? 150 + r() * 70 : 40 + r() * 60), d: 0 };
		}
		var f = B.simulate(setup, shot, null, { noKeeper: true, maxT: 4 });
		var cx = f.cross ? f.cross.x : setup.kx, cz = f.cross ? f.cross.z : 0.5;
		if (!f.cross || Math.abs(cx) > G.halfW + 0.4 || cz > G.barZ + 0.4 || f.hit.wall) {
			return { tx: Math.round(clamp(cx, -3, 3) * 50), tz: 120, d: f.cross ? L.react + 150 : -1 };
		}
		var tx = cx + gauss(r) * L.noise, tz = clamp(cz + gauss(r) * L.noise * 0.7, 0.15, 2.4);
		var d = L.react + (setup.n ? 110 : 0) + Math.round(r() * 60);
		return { tx: Math.round(tx * 100), tz: Math.round(tz * 100), d: d };
	};
	/** the computer kicker: picks a target and a style; returns the intended shot (the aim spread is added afterwards) */
	B.aiKick = function (setup, level, seed, n) {
		var L = B.LEVELS[level] || B.LEVELS.medium, r = B.rng(String(seed) + "|ck|" + n);
		if (!setup.n) {
			var side = r() < 0.5 ? -1 : 1, x = side * (1.6 + r() * 1.5), z = r() < 0.6 ? 0.25 + r() * 0.6 : 1.2 + r() * 0.9;
			if (r() < 0.06) { x = (r() - 0.5) * 0.8; z = 0.8 + r() * 0.9; }
			return B.aimFor(setup, x, z, 21 + r() * 6, (r() - 0.5) * 2, 0);
		}
		var best = null, tries = 10;
		for (var i = 0; i < tries; i++) {
			var far = r() < 0.6, sgn = setup.bx > 0.3 ? 1 : setup.bx < -0.3 ? -1 : (r() < 0.5 ? 1 : -1);
			var tx = (far ? -sgn : sgn) * (2.4 + r() * 0.9), tz = 1.3 + r() * 0.9, spd = 22 + r() * 8;
			var side2 = (r() < 0.5 ? -1 : 1) * (2 + r() * 8), top = 2 + r() * 6;
			if (r() < 0.15) { side2 = 0; top = 0; spd = 28 + r() * 3; }
			var sh = B.aimFor(setup, tx, tz, spd, side2, top);
			var f = B.simulate(setup, sh, null, { noKeeper: true });
			var score = (f.res === "goal" ? 10 : 0) + (f.cross ? -Math.abs(Math.abs(f.cross.x) - 2.9) : -5);
			if (!best || score > best.s) best = { s: score, sh: sh };
		}
		return best.sh;
	};

	/* ======================================================= games ======================================================= */
	B.MODES = [
		{ id: "P", name: "Penalty shootout", group: "Matches", np: 2, online: true, kicks: 5, desc: "Five penalties each, taking turns; still level after five each and it goes to sudden death." },
		{ id: "F", name: "Free-kick match", group: "Matches", np: 2, online: true, kicks: 5, desc: "Five free kicks each from random spots (both players get the same spot), with a wall and a keeper. Still level: sudden death." },
		{ id: "PF", name: "Free-kick practice", group: "Practice", np: 1, desc: "Pick any spot by dragging the ball on the pitch, set up the wall and the keeper, and shoot as often as you like." },
		{ id: "PP", name: "Penalty practice", group: "Practice", np: 1, desc: "Penalties against the computer keeper, as many as you like." },
		{ id: "PK", name: "Goalkeeper practice", group: "Practice", np: 1, keeper: true, desc: "You are the keeper: the computer shoots, you dive. Click where to dive while the ball is in the air (or before the kick)." },
		{ id: "T", name: "Target practice", group: "Practice", np: 1, balls: 10, desc: "Ten balls, five targets in the goal. Top corners score the most. No keeper." }
	];
	B.TARGETS = [
		{ x: -3.05, z: 2.0, r: 0.45, pts: 50 }, { x: 3.05, z: 2.0, r: 0.45, pts: 50 },
		{ x: -3.0, z: 0.4, r: 0.45, pts: 30 }, { x: 3.0, z: 0.4, r: 0.45, pts: 30 }, { x: 0, z: 2.05, r: 0.4, pts: 20 }
	];
	// challenges: spot, wall, keeper level (null = empty goal), balls, need goals, rule (extra condition)
	B.CHALLENGES = [
		{ id: "C1", name: "Top bin", bx: 0, by: 11, n: 0, gk: null, balls: 3, need: 1, rule: "target", tgt: { x: -3.05, z: 2.0, r: 0.5 }, tip: "Hit the top-left target from the penalty spot. No keeper: just accuracy." },
		{ id: "C2", name: "Over the wall", bx: 0, by: 20, n: 5, gk: null, balls: 3, need: 1, tip: "Five players, 20 m out, empty goal: lift it over the wall with some dip (top spin) so it comes down in time." },
		{ id: "C3", name: "Bend it round", bx: -9, by: 20, n: 4, gk: "medium", balls: 5, need: 1, tip: "From the left: curl it around the wall into the far corner (curl right)." },
		{ id: "C4", name: "Knuckleball", bx: 0, by: 30, n: 3, gk: "medium", balls: 5, need: 1, rule: "knuckle", tip: "Hit it hard (27 m/s or more) with almost no spin (curl and dip under 1). The ball wobbles in the air." },
		{ id: "C5", name: "Hit the bar", bx: 4, by: 18, n: 0, gk: null, balls: 5, need: 1, rule: "bar", tip: "No wall, no keeper: just hit the crossbar." },
		{ id: "C6", name: "Panenka", bx: 0, by: 11, n: 0, gk: "pro", balls: 3, need: 1, rule: "chip", early: 1, tip: "The keeper always dives early. Chip it softly (16 m/s or less) down the middle." },
		{ id: "C7", name: "Tight angle", bx: 17, by: 14, n: 2, gk: "medium", balls: 5, need: 1, tip: "Wide on the right, close to the box. Near post or curl it to the far post." },
		{ id: "C8", name: "Long range", bx: -3, by: 34, n: 2, gk: "medium", balls: 5, need: 1, tip: "34 m out. Power and a bit of dip." },
		{ id: "C9", name: "Beat the pro", bx: 0, by: 11, n: 0, gk: "pro", balls: 5, need: 3, tip: "Five penalties against the best keeper: score three." },
		{ id: "C10", name: "Jumping wall", bx: 1, by: 19, n: 5, gk: "hard", balls: 5, need: 1, j: 1, tip: "The wall jumps: go low under it, or over it with plenty of dip." }
	];
	B.mode = function (v) {
		var i;
		for (i = 0; i < B.MODES.length; i++) if (B.MODES[i].id === v) return B.MODES[i];
		for (i = 0; i < B.CHALLENGES.length; i++) if (B.CHALLENGES[i].id === v) { var c = B.CHALLENGES[i]; return { id: c.id, name: "Challenge: " + c.name, group: "Challenges", np: 1, ch: c, desc: c.tip }; }
		return null;
	};
	B.onlineMode = function (v) { var m = B.mode(v); return !!(m && m.online); };
	B.challengeSetup = function (c) { var s = B.freeKick(c.bx, c.by, { n: c.n, j: c.j }); if (!c.n) s.kx = 0; return s; };
	/** does this kick pass the challenge's extra rule? (r = simulate result) */
	B.challengeOk = function (c, shot, r) {
		if (c.rule === "target") return !!(r.cross && dist2(r.cross, c.tgt) <= c.tgt.r * c.tgt.r && r.res === "goal");
		if (c.rule === "bar") return r.ev.some(function (e) { return e[1] === "bar"; });
		if (c.rule === "knuckle") return r.res === "goal" && shot.spd >= 2700 && Math.abs(shot.side) <= 10 && Math.abs(shot.top) <= 10;
		if (c.rule === "chip") return r.res === "goal" && shot.spd <= 1600;
		return r.res === "goal";
	};
	function dist2(a, b) { return (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z); }
	B.targetPoints = function (r) {
		if (!r.cross || r.res === "wide" || r.res === "over") return 0;
		for (var i = 0; i < B.TARGETS.length; i++) { var T = B.TARGETS[i]; if (dist2(r.cross, T) <= T.r * T.r) return T.pts; }
		return 0;
	};

	/** a two-player match (P / F): state {v, seed, kicks: [{setup, shot, act, res}], score [a, b], taken [a, b], win: {p, why}|null} */
	B.create = function (v, seed) { return { v: v, seed: String(seed || "x"), kicks: [], score: [0, 0], taken: [0, 0], win: null }; };
	B.kicker = function (s) { return s.kicks.length % 2; };
	B.setupFor = function (s, i) {
		i = i === undefined ? s.kicks.length : i;
		if (s.v === "F") {
			var pair = Math.floor(i / 2), r = B.rng(s.seed + "|spot|" + pair), sp = B.randomSpot(r);
			return B.freeKick(sp.bx, sp.by, { j: r() < 0.3 });
		}
		return B.penalty();
	};
	/** decided? 5 each, then sudden death in pairs; the kick count never runs past 40 (a draw then) */
	B.decide = function (score, taken, perSide) {
		var n = perSide || 5;
		if (taken[0] <= n && taken[1] <= n) {
			var left0 = n - taken[0], left1 = n - taken[1];
			if (score[0] > score[1] + left1) return 0;
			if (score[1] > score[0] + left0) return 1;
			if (left0 || left1) return -1;
		}
		if (taken[0] === taken[1]) { if (score[0] !== score[1]) return score[0] > score[1] ? 0 : 1; if (taken[0] >= 20) return 2; }
		return -1;
	};
	/** play a kick: shot = the shot that really happened (after the aim spread), act = the keeper's act. -> simulate result */
	B.apply = function (s, shot, act, opts) {
		if (s.win) return null;
		var setup = B.setupFor(s), k = B.kicker(s);
		var r = B.simulate(setup, shot, act, opts);
		if (!r) return null;
		s.kicks.push({ setup: B.setupStr(setup), shot: B.shotStr(shot), act: act ? B.actStr(act) : B.actStr(B.STAY), res: r.res });
		s.taken[k]++;
		if (r.res === "goal") s.score[k]++;
		var d = B.decide(s.score, s.taken, (B.mode(s.v) || {}).kicks);
		if (d === 2) s.win = { p: -1, why: "draw" };
		else if (d >= 0) s.win = { p: d, why: "score" };
		return r;
	};
	/** replay a list of kicks ["shot/act", ...] -> state (null if any kick is malformed) */
	B.replay = function (v, seed, kicks) {
		var s = B.create(v, seed);
		for (var i = 0; i < kicks.length; i++) {
			var p = String(kicks[i]).split("/"), sh = B.shotParse(p[0]), a = B.actParse(p[1] || "");
			if (!sh || !a || s.win) return null;
			B.apply(s, sh, a);
		}
		return s;
	};

	/* ======================================================= Hive protocol ======================================================= */
	// custom_json id mes_fk. Ops: open {g, v, f, to?} · join {h, g} · kc {h, g, n, c} keeper's commit = first 16 hex of
	// sha256(act + "|" + salt) · k {h, g, n, s} the kicker's intended shot (only after the keeper's commit) · kr {h, g, n, d, x} the
	// keeper reveals act + salt · res / claim / cancel {h, g} · rec {g, v, sd, k ("shot/act" joined by "."), o, s, w}.
	// The aim spread of kick n comes from sha256(gid | n | salt), so the kicker cannot know it before kicking. A reveal that does not
	// match the commit counts as the keeper standing still.
	var H = B.hive = { ID: "mes_fk", CLAIM_S: 300, OPEN_S: 3600, GID_RE: /^[a-z0-9]{8}$/, ACCT_RE: /^[a-z][a-z0-9.-]{2,15}$/, OPP: ["easy", "medium", "hard", "pro", "local"] };
	H.commit = function (act, salt) { return B.sha256(B.actStr(act) + "|" + salt).slice(0, 16); };
	H.errSeed = function (gid, n, salt) { return B.sha256(gid + "|" + n + "|" + salt).slice(0, 16); };
	H.parse = function (entries, acct) {
		var out = [];
		(entries || []).forEach(function (e) {
			var idx = e[0], x = e[1] || {}, op = x.op;
			if (!op || op[0] !== "custom_json" || !op[1] || op[1].id !== H.ID) return;
			var auths = op[1].required_posting_auths || [];
			if (auths.length !== 1 || (acct && auths[0] !== acct)) return;
			var j;
			try { j = typeof op[1].json === "string" ? JSON.parse(op[1].json) : op[1].json; } catch (er) { return; }
			var o = H.clean(j);
			if (!o) return;
			o.acct = auths[0]; o.trx = x.trx_id || ""; o.block = x.block || 0; o.i = idx;
			o.ts = Date.parse(String(x.timestamp || "") + (/Z$/.test(x.timestamp || "") ? "" : "Z")) || 0;
			out.push(o);
		});
		return out;
	};
	function okN(n) { return typeof n === "number" && n >= 0 && n <= 80 && (n | 0) === n; }
	H.clean = function (j) {
		if (!j || typeof j !== "object" || !H.GID_RE.test(String(j.g))) return null;
		var a = j.a, o = { a: a, g: j.g };
		if (a === "open") {
			if (!B.onlineMode(j.v)) return null;
			o.v = j.v; o.f = ["host", "guest", "random"].indexOf(j.f) >= 0 ? j.f : "host";
			if (j.to !== undefined) { if (!H.ACCT_RE.test(String(j.to))) return null; o.to = j.to; }
			return o;
		}
		if (a === "rec") {
			if (!B.onlineMode(j.v) || typeof j.k !== "string" || j.k.length > 6000 || !/^[0-9a-z~\/.-]*$/.test(j.k)) return null;
			if (typeof j.sd !== "string" || !/^[a-z0-9]{1,16}$/.test(j.sd)) return null;
			if (H.OPP.indexOf(j.o) < 0 || [-1, 0, 1].indexOf(j.s) < 0 || [-1, 0, 1].indexOf(j.w) < 0) return null;
			o.v = j.v; o.sd = j.sd; o.k = j.k; o.o = j.o; o.s = j.s; o.w = j.w;
			return o;
		}
		if (!H.ACCT_RE.test(String(j.h))) return null;
		o.h = j.h;
		if (a === "join" || a === "res" || a === "claim" || a === "cancel") return o;
		if (!okN(j.n)) return null;
		o.n = j.n;
		if (a === "kc") { if (typeof j.c !== "string" || !/^[0-9a-f]{16}$/.test(j.c)) return null; o.c = j.c; return o; }
		if (a === "k") { if (!B.shotParse(j.s)) return null; o.s = String(j.s); return o; }
		if (a === "kr") { if (!B.actParse(j.d) || typeof j.x !== "string" || !/^[0-9a-z]{6,32}$/.test(j.x)) return null; o.d = String(j.d); o.x = j.x; return o; }
		return null;
	};
	H.json = function (o) { var c = {}; for (var k in o) if (["a", "g", "v", "f", "to", "h", "n", "c", "s", "d", "x", "k", "o", "w", "sd"].indexOf(k) >= 0) c[k] = o[k]; return JSON.stringify(c); };
	H.newGid = function (r) { var A = "abcdefghijkmnpqrstuvwxyz23456789", s = ""; r = r || Math.random; for (var i = 0; i < 8; i++) s += A[(r() * A.length) | 0]; return s; };
	H.newSalt = function (r) { var A = "abcdefghijklmnopqrstuvwxyz0123456789", s = ""; r = r || Math.random; for (var i = 0; i < 20; i++) s += A[(r() * A.length) | 0]; return s; };
	function order(a, b) { return (a.block || Infinity) - (b.block || Infinity) || (a.acct === b.acct ? a.i - b.i : a.trx < b.trx ? -1 : a.trx > b.trx ? 1 : 0) || (a.ts - b.ts); }
	H.order = order;
	H.coin = function (trxA, trxB) { var s = String(trxA) + String(trxB), n = 0; for (var i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 2; };
	/**
	 * A Hive match from both players' operations. -> {ok, status none|wait|play|over|cancelled|expired, players [seat0, seat1], s (state),
	 * step: "commit" | "kick" | "reveal" (what the match waits for), waitAcct, canClaimAt, pend {c, s} for the kick in progress, results: [{n, r}], trx}
	 */
	H.build = function (host, gid, ops, now) {
		var mine = ops.filter(function (o) { return o.g === gid && o.a !== "rec" && (o.a === "open" ? o.acct === host : o.h === host); }).sort(order);
		var R = { host: host, gid: gid, open: null, guest: null, players: [null, null], s: null, status: "none", win: null, lastTs: 0, step: null, waitAcct: null, canClaimAt: 0, pend: null, results: [], trx: { open: "", join: "", end: "", kicks: [] } };
		for (var i = 0; i < mine.length; i++) {
			var o = mine[i];
			if (!R.open) { if (o.a === "open") { R.open = o; R.s = B.create(o.v, gid); R.status = "wait"; R.lastTs = o.ts; R.trx.open = o.trx; } continue; }
			if (o.a === "open") continue;
			if (R.status === "wait") {
				if (o.a === "cancel" && o.acct === host) { R.status = "cancelled"; R.lastTs = o.ts; R.trx.end = o.trx; continue; }
				if (o.a === "join" && o.acct !== host && (!R.open.to || R.open.to === o.acct)) {
					R.guest = o.acct; R.trx.join = o.trx;
					var hostFirst = R.open.f === "host" ? true : R.open.f === "guest" ? false : H.coin(R.open.trx, o.trx) === 0;
					R.players = hostFirst ? [host, o.acct] : [o.acct, host];
					R.status = "play"; R.lastTs = o.ts; R.pend = { c: null, s: null };
				}
				continue;
			}
			if (R.status !== "play") continue;
			var seat = R.players.indexOf(o.acct);
			if (seat < 0) continue;
			var n = R.s.kicks.length, kseat = B.kicker(R.s), gseat = 1 - kseat;
			if (o.a === "kc" && o.n === n && seat === gseat && !R.pend.c) { R.pend.c = o.c; R.lastTs = o.ts; }
			else if (o.a === "k" && o.n === n && seat === kseat && R.pend.c && !R.pend.s) { R.pend.s = o.s; R.lastTs = o.ts; }
			else if (o.a === "kr" && o.n === n && seat === gseat && R.pend.c && R.pend.s) {
				var act = B.actParse(o.d), good = H.commit(act, o.x) === R.pend.c;
				var shot = B.applyError(B.shotParse(R.pend.s), H.errSeed(gid, n, o.x), n, 1);
				var r = B.apply(R.s, shot, good ? act : B.STAY);
				R.results.push({ n: n, r: r, cheat: !good });
				R.trx.kicks.push(o.trx);
				R.pend = { c: null, s: null }; R.lastTs = o.ts;
				if (R.s.win) { R.status = "over"; R.win = R.s.win; R.trx.end = o.trx; }
			} else if (o.a === "res") {
				R.status = "over"; R.win = { p: 1 - seat, why: "resign" }; R.s.win = R.win; R.trx.end = o.trx;
			} else if (o.a === "claim") {
				var waitSeat = !R.pend.c ? gseat : !R.pend.s ? kseat : gseat;
				if (waitSeat !== seat && o.ts - R.lastTs >= H.CLAIM_S * 1000) { R.status = "over"; R.win = { p: seat, why: "timeout" }; R.s.win = R.win; R.trx.end = o.trx; }
			}
		}
		if (R.status === "wait" && now && R.open && now - R.open.ts > H.OPEN_S * 1000) R.status = "expired";
		if (R.status === "play") {
			var ks = B.kicker(R.s);
			R.step = !R.pend.c ? "commit" : !R.pend.s ? "kick" : "reveal";
			R.waitAcct = R.players[R.step === "kick" ? ks : 1 - ks];
			R.canClaimAt = R.lastTs + H.CLAIM_S * 1000;
		}
		R.ok = R.status !== "none";
		return R;
	};
	H.myGames = function (acct, ops) {
		var seen = {}, out = [];
		ops.filter(function (o) { return o.acct === acct && (o.a === "open" || o.a === "join"); }).sort(order).reverse().forEach(function (o) {
			var host = o.a === "open" ? acct : o.h, k = host + "/" + o.g;
			if (seen[k]) return; seen[k] = 1;
			out.push({ host: host, gid: o.g, role: o.a === "open" ? "host" : "guest", v: o.v, to: o.to, ts: o.ts, trx: o.trx });
		});
		return out;
	};
	/** self-reported results (vs the computer / pass and play) that replay to the stated winner, newest first */
	H.records = function (ops) {
		var seen = {};
		return ops.filter(function (o) { return o.a === "rec"; }).sort(order).reverse().filter(function (o) {
			var k = o.acct + "/" + o.g; if (seen[k]) return false; seen[k] = 1;
			var st = B.replay(o.v, o.sd, o.k ? o.k.split(".") : []);
			if (!st || !st.win || st.win.p !== o.w) return false;
			if (o.o === "local" ? o.s !== -1 : o.s < 0) return false;
			o._st = st;
			return true;
		}).map(function (o) {
			return { acct: o.acct, g: o.g, v: o.v, o: o.o, s: o.s, w: o.w, score: o._st.score, result: o.s < 0 ? "" : o.w === o.s ? "w" : o.w < 0 ? "d" : "l", ts: o.ts, trx: o.trx };
		});
	};

	if (typeof module !== "undefined" && module.exports) module.exports = B;
	root.MESFreeKick = B;
})(typeof self !== "undefined" ? self : this);

/* MES Free Kicks & Penalties: the 3D view (window.FK3D). Only drawing: positions come from lib.js / app.js exactly as in 2D.
   three.js 0.170.0 from jsDelivr (unpkg fallback), loaded the first time 3D is shown.
   Coordinates: three X = pitch x, three Y = height z, three Z = pitch y (out from the goal line toward the kicker).
   API: FK3D.create(el) -> Promise<view>; view.size(w, h); view.frame(info); view.pickGoal(clientX, clientY) -> {x, z} | null; view.hover(). */
(function () {
	"use strict";
	if (typeof window === "undefined") return;
	var THREE = null, loading = null;
	var URLS = ["https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "https://unpkg.com/three@0.170.0/build/three.module.min.js"];
	function load() {
		if (THREE) return Promise.resolve(THREE);
		if (loading) return loading;
		var imp = new Function("u", "return import(u)");
		loading = imp(URLS[0]).catch(function () { return imp(URLS[1]); }).then(function (m) { THREE = m; return m; }, function (e) { loading = null; throw e; });
		return loading;
	}
	var IMG = "/free-kick/img/";
	function canvasTex(w, h, draw) { var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

	function create(el) {
		return load().then(function () {
			var t = document.createElement("canvas");
			if (!(t.getContext("webgl2") || t.getContext("webgl"))) throw new Error("WebGL is switched off in this browser");
			return new View(el);
		});
	}
	function View(el) {
		var G = window.MESFreeKick.G, self = this;
		this.el = el; this.G = G;
		var R = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
		R.domElement.className = "fk-cv3";
		el.appendChild(R.domElement);
		var sc = this.scene = new THREE.Scene();
		sc.background = new THREE.Color("#8fc3ea");
		sc.fog = new THREE.Fog("#a9cfe9", 70, 170);
		this.cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 400);
		this.eye = new THREE.Vector3(0, 1.8, 25); this.look = new THREE.Vector3(0, 1.2, 0);
		sc.add(new THREE.HemisphereLight("#eef6ff", "#2d5a2a", 1.1));
		var sun = new THREE.DirectionalLight("#fff4dc", 1.6); sun.position.set(-30, 60, 40); sc.add(sun);
		this.ray = new THREE.Raycaster();
		// grass with the markings painted in (x -60..60, y -20..100 -> canvas)
		var gTex = canvasTex(2048, 2048, function (c, w, h) {
			var X = function (x) { return (x + 60) / 120 * w; }, Y = function (y) { return (y + 20) / 120 * h; }, px = w / 120;
			for (var y = -20; y < 100; y += 5) { c.fillStyle = Math.round((y + 20) / 5) % 2 ? "#3d9a49" : "#48a855"; c.fillRect(0, Y(y), w, 5 * px + 1); }
			var img = c.getImageData(0, 0, w, h), d = img.data;
			for (var i = 0; i < d.length; i += 4) { var n = (Math.random() - 0.5) * 16; d[i] += n * 0.6; d[i + 1] += n; d[i + 2] += n * 0.5; }
			c.putImageData(img, 0, 0);
			c.strokeStyle = "rgba(255,255,255,0.92)"; c.lineWidth = 0.12 * px;
			c.beginPath(); c.moveTo(X(-34), Y(0)); c.lineTo(X(34), Y(0)); c.stroke();
			c.strokeRect(X(-G.boxX), Y(0), G.boxX * 2 * px, G.boxY * px);
			c.strokeRect(X(-G.sixX), Y(0), G.sixX * 2 * px, G.sixY * px);
			c.beginPath(); c.moveTo(X(-34), Y(0)); c.lineTo(X(-34), Y(100)); c.moveTo(X(34), Y(0)); c.lineTo(X(34), Y(100)); c.stroke();
			c.beginPath(); c.arc(X(0), Y(G.penY), G.arcR * px, 0.205 * Math.PI, 0.795 * Math.PI); c.stroke();
			c.fillStyle = "#fff"; c.beginPath(); c.arc(X(0), Y(G.penY), 0.13 * px, 0, 7); c.fill();
			c.beginPath(); c.arc(X(0), Y(52.5), 9.15 * px, 0, 7); c.stroke(); c.beginPath(); c.moveTo(X(-34), Y(52.5)); c.lineTo(X(34), Y(52.5)); c.stroke();
		});
		var grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }));
		grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0, 40); sc.add(grass);
		var outer = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: "#356f35", roughness: 1 }));
		outer.rotation.x = -Math.PI / 2; outer.position.set(0, -0.02, 40); sc.add(outer);
		// goal frame
		var white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 });
		var pr = G.postR, px = G.postX, top = G.barZ + pr, ly = G.lineY;
		[-1, 1].forEach(function (s) { var p = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, top + pr, 16), white); p.position.set(s * px, (top + pr) / 2, ly); sc.add(p); });
		var bar = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, px * 2 + pr * 2, 16), white); bar.rotation.z = Math.PI / 2; bar.position.set(0, top, ly); sc.add(bar);
		// the net: back, roof and sides as a grid of thin lines
		var back = -G.depth + ly, pts = [], step = 0.14, h2 = 1.6;
		function seg(a, b) { pts.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
		for (var x = -px; x <= px + 0.001; x += step) { seg([x, 0, back], [x, h2, back]); seg([x, h2, back], [x, top, ly]); }
		for (var z = 0; z <= h2 + 0.001; z += step) seg([-px, z, back], [px, z, back]);
		for (var u = 0; u <= 1.0001; u += step / 2.2) { var yy = h2 + (top - h2) * u, zz = back + (ly - back) * u; seg([-px, yy, zz], [px, yy, zz]); }
		[-1, 1].forEach(function (s) {
			for (var zz2 = back; zz2 <= ly + 0.001; zz2 += step) { var fz = (zz2 - back) / (ly - back); seg([s * px, 0, zz2], [s * px, h2 + (top - h2) * fz, zz2]); }
			for (var yy2 = 0; yy2 <= top; yy2 += step) { var zb = yy2 <= h2 ? back : back + (ly - back) * (yy2 - h2) / (top - h2); seg([s * px, yy2, zb], [s * px, yy2, ly]); }
		});
		var ng = new THREE.BufferGeometry(); ng.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
		this.netMat = new THREE.LineBasicMaterial({ color: "#f1f3f5", transparent: true, opacity: 0.5 });
		sc.add(new THREE.LineSegments(ng, this.netMat));
		var supp = new THREE.MeshStandardMaterial({ color: "#d0d4d9", roughness: 0.5 });
		[-1, 1].forEach(function (s) { var r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h2, 8), supp); r.position.set(s * px, h2 / 2, back); sc.add(r); });
		// stands + crowd behind the goal and along both sides
		this.crowdMat = new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, function (c, w, h) {
			c.fillStyle = "#2b3442"; c.fillRect(0, 0, w, h);
			var cols = ["#d9480f", "#1c7ed6", "#f8f9fa", "#fab005", "#2f9e44", "#c92a2a", "#343a40", "#e6b98f"];
			for (var i = 0; i < 2600; i++) { c.fillStyle = cols[(Math.random() * cols.length) | 0]; c.fillRect(Math.random() * w, Math.random() * h, 3, 4); }
		}), roughness: 1, side: THREE.DoubleSide });
		this.crowdMat.map.wrapS = THREE.RepeatWrapping; this.crowdMat.map.repeat.set(6, 1);
		var stands = this.stands = new THREE.Group();
		function stand(w2, cx, cz, rotY) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w2, 26), self.crowdMat); m.position.set(cx, 11, cz); m.rotation.y = rotY; m.rotation.x = rotY === 0 ? -0.45 : 0; stands.add(m); return m; }
		stand(140, 0, -16, 0); stand(130, -44, 40, Math.PI / 2); stand(130, 44, 40, -Math.PI / 2);
		var boardTex = canvasTex(1024, 64, function (c, w, h) {
			var grd = c.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, "#1c3d78"); grd.addColorStop(0.5, "#264d9b"); grd.addColorStop(1, "#1c3d78");
			c.fillStyle = grd; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "bold 38px system-ui, sans-serif"; c.textAlign = "center";
			for (var i = 0; i < 4; i++) c.fillText(i % 2 ? "MES.FM" : "FREE KICKS", w * (i + 0.5) / 4, 46);
		});
		boardTex.wrapS = THREE.RepeatWrapping; boardTex.repeat.set(4, 1);
		var board = new THREE.Mesh(new THREE.PlaneGeometry(90, 0.9), new THREE.MeshBasicMaterial({ map: boardTex })); board.position.set(0, 0.45, -5); stands.add(board);
		sc.add(stands);
		new THREE.TextureLoader().load(IMG + "crowd.jpg?v=1", function (t) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.MirroredRepeatWrapping; t.repeat.set(3, 1); self.crowdMat.map = t; self.crowdMat.needsUpdate = true; self.draw(); });
		// ball
		var bTex = canvasTex(512, 256, function (c, w, h) {
			c.fillStyle = "#f8f9fa"; c.fillRect(0, 0, w, h);
			c.fillStyle = "#1e2733";
			for (var i = 0; i < 12; i++) { var cx = (i % 6) * w / 6 + (i >= 6 ? w / 12 : 0), cy = i >= 6 ? h * 0.72 : h * 0.28; c.beginPath(); for (var k = 0; k < 5; k++) { var a = k / 5 * Math.PI * 2 - Math.PI / 2; c.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 30); } c.fill(); }
		});
		this.ball = new THREE.Mesh(new THREE.SphereGeometry(G.R, 32, 18), new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.45 }));
		sc.add(this.ball);
		var shadowTex = canvasTex(64, 64, function (c, w) { var g = c.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2); g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, w, w); });
		this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
		this.ballShadow = this.blob(0.3); sc.add(this.ballShadow);
		this.prevBall = null;
		// players (pictures on planes; drawn stand-ins until the pictures arrive)
		this.tex = {};
		var fall = {
			"wall-player": figure("#1c4aa0", "#f8f9fa", false), "keeper-ready": figure("#a9e34b", "#212529", true), "keeper-dive": diveFigure(), kicker: figure("#c92a2a", "#f8f9fa", false, true)
		};
		Object.keys(fall).forEach(function (n) {
			self.tex[n] = { t: canvasTex(256, 512, fall[n].draw), ar: fall[n].ar };
			if (n === "keeper-dive") self.tex[n] = { t: canvasTex(512, 256, fall[n].draw), ar: fall[n].ar };
			new THREE.TextureLoader().load(IMG + n + ".png?v=1", function (t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; self.tex[n] = { t: t, ar: t.image.width / t.image.height }; self.refreshSprites(); self.draw(); });
		});
		this.wallGroup = new THREE.Group(); sc.add(this.wallGroup);
		this.keeper = this.sprite("keeper-ready", 1.95); sc.add(this.keeper);
		this.keeperShadow = this.blob(0.8); sc.add(this.keeperShadow);
		this.kicker = this.sprite("kicker", 1.8); sc.add(this.kicker);
		this.kickerShadow = this.blob(0.6); sc.add(this.kickerShadow);
		// marks
		this.aimMark = this.ringMesh("#ffd43b", 0.22, true); sc.add(this.aimMark);
		this.diveMark = this.ringMesh("#69db7c", 0.26, false); sc.add(this.diveMark);
		this.targetGroup = new THREE.Group(); sc.add(this.targetGroup);
		this.guide = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: "#ffffff", dashSize: 0.18, gapSize: 0.22, transparent: true, opacity: 0.95 }));
		this.guide.frustumCulled = false; sc.add(this.guide);
		this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#ffd43b", transparent: true, opacity: 0.6 }));
		this.trail.frustumCulled = false; sc.add(this.trail);
		this.trailPts = [];
		this.w = 300; this.h = 200; this.info = null; this.wallKey = "";
	}
	function figure(shirt, shorts, gloves, back) {
		return { ar: 0.5, draw: function (c, w, h) {
			c.fillStyle = "#3b2a20"; c.beginPath(); c.arc(w / 2, h * 0.1, w * 0.12, 0, 7); c.fill();
			if (!back) { c.fillStyle = "#e6b98f"; c.beginPath(); c.arc(w / 2, h * 0.12, w * 0.1, 0, 7); c.fill(); }
			c.fillStyle = shirt; c.fillRect(w * 0.28, h * 0.19, w * 0.44, h * 0.33);
			c.fillRect(w * 0.14, h * 0.2, w * 0.14, h * 0.24); c.fillRect(w * 0.72, h * 0.2, w * 0.14, h * 0.24);
			if (gloves) { c.fillStyle = "#f8f9fa"; c.fillRect(w * 0.12, h * 0.42, w * 0.17, h * 0.06); c.fillRect(w * 0.71, h * 0.42, w * 0.17, h * 0.06); }
			c.fillStyle = shorts; c.fillRect(w * 0.29, h * 0.52, w * 0.42, h * 0.13);
			c.fillStyle = "#e6b98f"; c.fillRect(w * 0.32, h * 0.65, w * 0.13, h * 0.2); c.fillRect(w * 0.55, h * 0.65, w * 0.13, h * 0.2);
			c.fillStyle = shirt; c.fillRect(w * 0.31, h * 0.78, w * 0.15, h * 0.14); c.fillRect(w * 0.54, h * 0.78, w * 0.15, h * 0.14);
			c.fillStyle = "#111"; c.fillRect(w * 0.29, h * 0.93, w * 0.18, h * 0.05); c.fillRect(w * 0.53, h * 0.93, w * 0.18, h * 0.05);
		} };
	}
	function diveFigure() {
		return { ar: 2, draw: function (c, w, h) {
			c.fillStyle = "#a9e34b"; c.fillRect(w * 0.3, h * 0.38, w * 0.38, h * 0.26);
			c.fillStyle = "#212529"; c.fillRect(w * 0.18, h * 0.38, w * 0.13, h * 0.26);
			c.fillStyle = "#e6b98f"; c.fillRect(w * 0.04, h * 0.42, w * 0.15, h * 0.08); c.fillRect(w * 0.04, h * 0.53, w * 0.15, h * 0.08);
			c.fillStyle = "#a9e34b"; c.fillRect(w * 0.68, h * 0.36, w * 0.18, h * 0.09); c.fillRect(w * 0.68, h * 0.56, w * 0.18, h * 0.09);
			c.fillStyle = "#f8f9fa"; c.fillRect(w * 0.86, h * 0.34, w * 0.09, h * 0.13); c.fillRect(w * 0.86, h * 0.54, w * 0.09, h * 0.13);
			c.fillStyle = "#3b2a20"; c.beginPath(); c.arc(w * 0.74, h * 0.5, h * 0.11, 0, 7); c.fill();
		} };
	}
	View.prototype.blob = function (r) { var m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), this.shadowMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1; return m; };
	View.prototype.sprite = function (name, hgt) {
		var t = this.tex[name], mat = new THREE.MeshBasicMaterial({ map: t.t, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide });
		var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
		m.userData = { name: name, h: hgt }; m.scale.set(hgt * t.ar, hgt, 1);
		return m;
	};
	View.prototype.setTex = function (m, name) {
		if (m.userData.name === name && m.material.map === this.tex[name].t) return;
		var t = this.tex[name]; m.userData.name = name; m.material.map = t.t; m.material.needsUpdate = true;
		m.scale.set(m.userData.h * t.ar, m.userData.h, 1);
	};
	View.prototype.refreshSprites = function () {
		var self = this;
		[this.keeper, this.kicker].concat(this.wallGroup.children.filter(function (c) { return c.userData.name; })).forEach(function (m) { var n = m.userData.name; m.userData.name = ""; self.setTex(m, n); });
	};
	View.prototype.ringMesh = function (col, r, cross) {
		var g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthTest: false });
		g.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 40), mat));
		if (cross) { var a = new THREE.Mesh(new THREE.PlaneGeometry(r * 3, 0.03), mat), b = new THREE.Mesh(new THREE.PlaneGeometry(0.03, r * 3), mat); g.add(a); g.add(b); }
		g.renderOrder = 5; g.children.forEach(function (c) { c.renderOrder = 5; });
		return g;
	};
	View.prototype.size = function (w, h) {
		w = Math.max(50, Math.round(w)); h = Math.max(50, Math.round(h));
		if (w === this.w && h === this.h) return;
		this.w = w; this.h = h;
		this.renderer.setSize(w, h, false);
		this.renderer.domElement.style.width = w + "px"; this.renderer.domElement.style.height = h + "px";
		this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
	};
	function setPts(line, pts) { line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(pts); }
	function V(x, y, z) { return new THREE.Vector3(x, z, y); }     // pitch (x, y, z) -> three
	View.prototype.frame = function (info) { this.info = info; this.draw(); };
	View.prototype.draw = function () {
		var I = this.info; if (!I) return;
		var G = this.G, s = I.setup, sc = this.scene, self = this;
		var dk = !!I.dark;
		sc.background.set(dk ? "#1a2a3c" : "#8fc3ea"); sc.fog.color.set(dk ? "#1a2a3c" : "#a9cfe9");
		this.netMat.opacity = dk ? 0.38 : 0.5;
		// wall
		var wk = I.wall.map(function (p) { return p.x + "," + p.y; }).join("|");
		if (wk !== this.wallKey) {
			this.wallKey = wk;
			while (this.wallGroup.children.length) this.wallGroup.remove(this.wallGroup.children[0]);
			I.wall.forEach(function () { self.wallGroup.add(self.sprite("wall-player", 1.86)); self.wallGroup.add(self.blob(0.45)); });
		}
		var camPos = this.cam.position;
		I.wall.forEach(function (p, i) {
			var m = self.wallGroup.children[i * 2], sh = self.wallGroup.children[i * 2 + 1];
			m.position.copy(V(p.x, p.y, I.lift + 0.93));
			m.rotation.set(0, Math.atan2(camPos.x - m.position.x, camPos.z - m.position.z), 0);
			sh.position.set(p.x, 0.013, p.y);
		});
		// keeper
		var k = I.keeper;
		if (k.dive && k.s > 0.15) {
			this.setTex(this.keeper, "keeper-dive");
			var mx = (k.ax + k.hx) / 2, mz = (k.az + k.hz) / 2, dx = k.hx - k.ax, dz = k.hz - k.az, len = Math.sqrt(dx * dx + dz * dz);
			var t = this.tex["keeper-dive"], wd = len * 1.15;
			var flip = dx < 0;
			this.keeper.scale.set(flip ? -wd : wd, wd / t.ar, 1);
			this.keeper.position.copy(V(mx, k.y, mz));
			this.keeper.rotation.set(0, 0, flip ? -Math.atan2(dz, -dx) : Math.atan2(dz, dx));
			this.keeperShadow.position.set(mx, 0.013, k.y); this.keeperShadow.scale.set(1.6, 0.6, 1);
		} else {
			this.setTex(this.keeper, "keeper-ready");
			this.keeper.position.copy(V(k.ax, k.y, 0.975));
			this.keeper.rotation.set(0, Math.atan2(camPos.x - k.ax, camPos.z - k.y), 0);
			this.keeperShadow.position.set(k.ax, 0.013, k.y); this.keeperShadow.scale.set(1, 1, 1);
		}
		// kicker: runs in from behind and to the left, then stays by the ball
		var dxg = -s.bx, dyg = G.lineY - s.by, dl = Math.sqrt(dxg * dxg + dyg * dyg), ux = dxg / dl, uy = dyg / dl;
		var p0 = { x: s.bx - ux * 2.0 + uy * 1.1, y: s.by - uy * 2.0 - ux * 1.1 }, p1 = { x: s.bx - ux * 0.45 + uy * 0.75, y: s.by - uy * 0.45 - ux * 0.75 };
		var pr = I.kicker, kx = p0.x + (p1.x - p0.x) * pr, ky = p0.y + (p1.y - p0.y) * pr;
		if (I.flying) { var fw = Math.min(1, I.t * 2) * 0.8; kx += ux * fw; ky += uy * fw; }
		this.kicker.position.copy(V(kx, ky, 0.9 + Math.abs(Math.sin(pr * Math.PI * 4)) * 0.05 * (pr < 1 ? 1 : 0)));
		this.kicker.rotation.set(0, Math.atan2(camPos.x - kx, camPos.z - ky), 0);
		this.kickerShadow.position.set(kx, 0.013, ky);
		// ball (rolls / spins with its movement)
		var b = I.ball;
		this.ball.position.copy(V(b[0], b[1], b[2]));
		if (this.prevBall) { var mvx = b[0] - this.prevBall[0], mvy = b[1] - this.prevBall[1], d = Math.sqrt(mvx * mvx + mvy * mvy); if (d > 1e-4 && d < 2) { this.ball.rotateOnWorldAxis(new THREE.Vector3(mvy / d, 0, -mvx / d).normalize(), -d / G.R); } }
		this.prevBall = b.slice();
		this.ballShadow.position.set(b[0], 0.012, b[1]);
		var sz = Math.max(0.35, 1 - b[2] * 0.18); this.ballShadow.scale.set(sz, sz, 1); this.ballShadow.material.opacity = sz;
		// trail
		if (!I.flying) this.trailPts = [];
		else { var lp = this.trailPts[this.trailPts.length - 1]; if (!lp || Math.abs(lp.x - b[0]) + Math.abs(lp.z - b[1]) + Math.abs(lp.y - b[2]) > 0.15) this.trailPts.push(V(b[0], b[1], b[2])); }
		setPts(this.trail, this.trailPts.length > 1 ? this.trailPts : [V(0, 0, -5), V(0, 0, -5)]);
		// guide
		if (I.guide && I.guide.length > 1) { this.guide.visible = true; setPts(this.guide, I.guide.map(function (p) { return V(p[0], p[1], p[2]); })); this.guide.computeLineDistances(); }
		else this.guide.visible = false;
		// marks
		this.aimMark.visible = !!I.aim; if (I.aim) this.aimMark.position.copy(V(I.aim.x, G.lineY + 0.02, I.aim.z));
		this.diveMark.visible = !!I.dive; if (I.dive) this.diveMark.position.copy(V(I.dive.x, G.lineY + 0.05, I.dive.z));
		var tk = I.targets ? I.targets.map(function (t) { return t.x + "," + t.z; }).join("|") : "";
		if (tk !== this.tgtKey) {
			this.tgtKey = tk;
			while (this.targetGroup.children.length) this.targetGroup.remove(this.targetGroup.children[0]);
			(I.targets || []).forEach(function (t) {
				var g = new THREE.Mesh(new THREE.RingGeometry(t.r * 0.86, t.r, 48), new THREE.MeshBasicMaterial({ color: "#ffd43b", transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
				var f = new THREE.Mesh(new THREE.CircleGeometry(t.r * 0.86, 48), new THREE.MeshBasicMaterial({ color: "#ffd43b", transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
				g.position.copy(V(t.x, G.lineY + 0.01, t.z)); f.position.copy(g.position); self.targetGroup.add(g); self.targetGroup.add(f);
			});
		}
		// camera
		var e, l, back = { x: -ux, y: -uy };
		if (I.cam === "keeper") { e = V((s.kx || 0) * 0.6, -1.7, 1.75); l = V(b[0] * 0.5 + s.bx * 0.5, b[1] * 0.5 + s.by * 0.5, Math.max(0.6, b[2] * 0.6)); }
		else if (I.cam === "tv") { var sd = s.bx > 0 ? -1 : 1; e = V(sd * 30, s.by * 0.55 + 3, 13); l = V(b[0] * 0.4, Math.max(2, b[1] * 0.55), 1); }
		else if (I.cam === "high") { e = V(s.bx + back.x * 13, s.by + back.y * 13, 9); l = V(0, 0, 1); }
		else {
			// behind the ball: fit the ball (near the bottom) and the crossbar (near the top), and the goal's width
			var bk = 7, hh = 2.4, gd = Math.sqrt(s.bx * s.bx + (s.by - G.lineY) * (s.by - G.lineY)) + bk;
			var aB = Math.atan2(-(hh - 0.1), bk), aT = Math.atan2(2.7 - hh, gd), asp = this.w / this.h;
			var vf = (aT - aB) * 1.2, needH = Math.atan(5.6 / gd);
			vf = Math.max(vf, 2 * Math.atan(Math.tan(needH) / asp));
			var mid = (aT + aB) / 2 - (vf - (aT - aB) * 1.2) * 0.1;
			e = V(s.bx + back.x * bk - uy * 0.9, s.by + back.y * bk + ux * 0.9, hh);
			var hx2 = -back.x, hy2 = -back.y;
			l = V(s.bx + back.x * bk + hx2 * 10 * Math.cos(mid), s.by + back.y * bk + hy2 * 10 * Math.cos(mid), hh + 10 * Math.sin(mid));
			this.behindFov = vf * 180 / Math.PI;
		}
		var lerp = this.camInit ? 0.16 : 1; this.camInit = true;
		if (this.lastCam !== I.cam) lerp = 0.35; this.lastCam = I.cam;
		this.eye.lerp(e, lerp); this.look.lerp(l, lerp);
		this.cam.position.copy(this.eye); this.cam.lookAt(this.look);
		this.cam.fov = I.cam === "keeper" ? 62 : I.cam === "tv" || I.cam === "high" ? 38 : Math.min(75, this.behindFov || 40); this.cam.updateProjectionMatrix();
		this.renderer.render(sc, this.cam);
		if (this.eye.distanceTo(e) > 0.02 && !this.raf) { this.raf = requestAnimationFrame(function () { self.raf = 0; self.draw(); }); }
	};
	View.prototype.pickGoal = function (cx, cy) {
		var r = this.renderer.domElement.getBoundingClientRect(), G = this.G;
		var nd = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
		this.ray.setFromCamera(nd, this.cam);
		var pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -G.lineY), hit = new THREE.Vector3();
		if (!this.ray.ray.intersectPlane(pl, hit)) return null;
		if (Math.abs(hit.x) > 7 || hit.y > 4.5 || hit.y < -0.5) return null;
		return { x: hit.x, z: hit.y };
	};
	View.prototype.hover = function (cx, cy) { var g = this.pickGoal(cx, cy); this.renderer.domElement.style.cursor = g ? "crosshair" : ""; };
	window.FK3D = { create: create, load: load };
})();

/* MES Free Kicks & Penalties: the page. Physics / rules / computer players / Hive protocol are in lib.js (MESFreeKick), the 3D view in
   view3d.js (FK3D). This file: setup, aiming, the keeper, the 2D view (goal seen from behind the ball + the pitch from above), the
   animation, guest online matches (/api/free-kick) and Hive matches.
   On localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in (localStorage "mes-free-kick:mock") is used, and Hive play
   uses a stand-in chain ("mes-free-kick:hchain") + a per-tab account, so two tabs can play each other. */
(function () {
	"use strict";
	var B = window.MESFreeKick, G = B.G;
	function $(id) { return document.getElementById(id); }
	var root = $("fk");
	if (!root || !B) return;
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function rnd() { return Math.random().toString(36).slice(2, 10); }
	function ago(ms) { var m = Math.round(ms / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago"; }

	/* ===================================================================== settings ===================================================================== */
	var KEY = "mes-free-kick:v1";
	var S = { mode: "PF", opp: "cpu", first: 0, lv: "medium", plv: "medium", spread: true, live: true, guide: "full", slow: 1, dim: "3d", cam: "behind",
		power: 24, curl: 0, dip: 0, when: 180, spot: { bx: -6, by: 21, wall: "auto", j: 0, off: 0, kx: null }, stats: {}, name: "", opub: true, ofirst: "host", omode: "P", saved: {} };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var k in sv) S[k] = sv[k]; } catch (e) { /* defaults */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
	var toastT = 0;
	function toast(msg, html) { var t = $("fk-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("is-on"); }, 4200); }
	function copy(text, done) {
		if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(done); }, function () { prompt("Copy this:", text); });
		else prompt("Copy this:", text);
	}

	/* ===================================================================== the match ===================================================================== */
	// M: what is being played. kind: match (P/F) | practice (PF/PP/PK) | target (T) | challenge (C..)
	var M = null;
	var ph = "aim";              // aim | keep | handover | ready | anim | result | wait | over
	var aim = { x: 2.6, z: 1.6 };
	var dive = { x: 2.4, z: 0.8 };
	var A = null;                // the animation in progress
	var last = null;             // last finished kick (to keep drawing it)
	var mode = "local";          // local | online | hive

	function modeOf(v) { return B.mode(v) || B.mode("PF"); }
	function newMatch(v) {
		var md = modeOf(v || S.mode);
		M = { v: md.id, md: md, seed: rnd(), log: [], n: 0, goals: 0, pts: 0, saves: 0, faced: 0, opp: S.opp, lv: S.lv };
		if (md.np === 2) { M.kind = "match"; M.st = B.create(md.id, M.seed); M.me = S.opp === "cpu" ? +S.first : -1; }
		else if (md.ch) { M.kind = "challenge"; M.ch = md.ch; M.lv = md.ch.gk; }
		else if (md.id === "T") { M.kind = "target"; M.lv = null; }
		else { M.kind = "practice"; M.lv = S.plv === "none" ? null : S.plv; }
		last = null; A = null;
		if (md.id === "PP" || md.id === "PK" || md.id === "C1" || md.id === "C6" || md.id === "C9") aim = { x: -2.6, z: 0.6 };
		next();
	}
	/* the set piece for the current kick */
	function curSetup() {
		if (!M) return B.penalty();
		if (mode !== "local" || M.kind === "match") return B.setupFor(M.st);
		if (M.kind === "challenge") return B.challengeSetup(M.ch);
		if (M.v === "PP" || M.v === "PK" || M.v === "T") return B.penalty();
		var sp = S.spot, n = sp.wall === "auto" ? B.autoWall(sp.bx, sp.by) : +sp.wall;
		var s = B.freeKick(sp.bx, sp.by, { n: n, off: sp.off, j: sp.j });
		if (sp.kx !== null && sp.kx !== undefined) s.kx = sp.kx;
		return s;
	}
	function humanKicks() {
		if (mode === "online") { var s = onState(); return s && B.kicker(s) === on.seat; }
		if (mode === "hive") { var R = hv.R; return !!(R && R.status === "play" && R.players[B.kicker(R.s)] === hMe()); }
		if (M.kind === "match") return M.opp === "local" || B.kicker(M.st) === M.me;
		return M.v !== "PK";
	}
	function humanKeeps() {
		if (mode !== "local") return !humanKicks();
		if (M.kind === "match") return M.opp === "local" || B.kicker(M.st) !== M.me;
		return M.v === "PK";
	}
	function kickN() { return M.kind === "match" ? M.st.kicks.length : M.n; }
	function cpuLevel() { return M.kind === "match" ? M.lv : M.lv; }

	function next() {
		hideBanner();
		A = null;
		if (mode !== "local") { onlinePhase(); render(); return; }
		if (M.kind === "match" && M.st.win) { ph = "over"; showOver(); render(); return; }
		if ((M.kind === "target" && M.n >= 10) || (M.kind === "challenge" && (M.n >= M.ch.balls || M.goals >= M.ch.need))) { ph = "over"; showOver(); render(); return; }
		if (humanKicks()) ph = "aim";
		else {
			// the computer kicks
			var setup = curSetup(), n = kickN(), intended = B.aiKick(setup, M.lv || "medium", M.seed, n);
			M.pendShot = B.applyError(intended, M.seed, n, 1);
			if (S.live) { ph = "ready"; banner('<b>You are the keeper.</b><br>Click in the goal while the ball is in the air to dive there.', "Ready ▶", function () { start(setup, M.pendShot, null, true); }); }
			else ph = "keep";
		}
		render();
	}

	/* the kicker presses Shoot */
	function shoot(power) {
		if (ph !== "aim") return;
		var setup = curSetup(), n = kickN();
		var intended = B.aimFor(setup, aim.x, aim.z, power || S.power, S.curl, S.dip);
		if (mode === "online") return onKick(intended);
		if (mode === "hive") return hiveKick(intended);
		var spreadOn = M.kind === "match" || S.spread;
		var shot = spreadOn ? B.applyError(intended, M.seed, n, 1) : intended;
		M.lastAim = intended;
		if (humanKeeps()) {
			M.pendShot = shot;
			if (S.live) { ph = "handover"; banner("<b>Keeper's turn.</b><br>Kicker, look away from the goal! Keeper: click in the goal while the ball flies to dive.", "I'm the keeper: go ▶", function () { start(setup, shot, null, true); }); }
			else { ph = "handover"; banner("<b>Keeper's turn.</b><br>Hand over: the keeper picks a dive without seeing the shot.", "I'm the keeper ▶", function () { ph = "keep"; hideBanner(); render(); }); }
			render();
			return;
		}
		var act = null, lv = M.lv;
		if (lv) act = M.ch && M.ch.early ? earlyGuess(n) : B.aiKeeper(setup, shot, lv, M.seed, n);
		start(setup, shot, act, false);
	}
	function earlyGuess(n) { var r = B.rng(M.seed + "|eg|" + n); var s = r() < 0.5 ? -1 : 1; return { tx: Math.round(s * (240 + r() * 60)), tz: 60, d: 0 }; }
	/* the keeper (guess mode) presses Ready */
	function keeperReady() {
		if (ph !== "keep") return;
		var act = S.when < 0 ? B.STAY : { tx: Math.round(dive.x * 100), tz: Math.round(dive.z * 100), d: +S.when };
		if (mode === "online") return onKeep(act);
		if (mode === "hive") return hiveKeep(act);
		start(curSetup(), M.pendShot, act, false);
	}

	/* ===================================================================== animation ===================================================================== */
	var RUN = 0.75;
	function start(setup, shot, act, live, opts) {
		opts = opts || {};
		hideBanner();
		var sim = B.simulate(setup, shot, act, { frames: true });
		A = { setup: setup, shot: shot, act: act, live: !!live && !act, sim: sim, t: -RUN, t0: performance.now(), last: performance.now(), wall: B.wallSpots(setup), done: false, onEnd: opts.onEnd, n: opts.n };
		ph = "anim";
		render();
		requestAnimationFrame(tick);
	}
	function liveDive(x, z) {
		if (!A || !A.live || A.act) return;
		var d = Math.max(0, Math.round(A.t * 1000));
		A.act = { tx: Math.round(clamp(x, -5.5, 5.5) * 100), tz: Math.round(clamp(z, 0, 3) * 100), d: d };
		A.sim = B.simulate(A.setup, A.shot, A.act, { frames: true });
		dive = { x: x, z: z };
	}
	function tick(now) {
		if (!A || A.done) return;
		var dt = Math.min(0.05, (now - A.last) / 1000); A.last = now;
		A.t += dt * (A.t < 0 ? 1 : +S.slow);
		if (A.t >= A.sim.t + 0.15) { A.t = A.sim.t; endKick(); return; }
		draw();
		requestAnimationFrame(tick);
	}
	function ballAt(sim, t) {
		var f = sim.frames, n = f.length / 3, u = Math.max(0, t) / B.FRAME_S, i = Math.min(n - 1, Math.floor(u)), j = Math.min(n - 1, i + 1), a = u - i;
		return [f[i * 3] + (f[j * 3] - f[i * 3]) * a, f[i * 3 + 1] + (f[j * 3 + 1] - f[i * 3 + 1]) * a, f[i * 3 + 2] + (f[j * 3 + 2] - f[i * 3 + 2]) * a];
	}
	function endKick() {
		var a = A; a.done = true;
		var r = a.sim, act = a.act || B.STAY;
		last = a;
		if (a.onEnd) { a.onEnd(r); return; }
		var who = humanKicks(), n = kickN();
		var item = { res: r.res, setup: B.setupStr(a.setup), shot: B.shotStr(a.shot), act: B.actStr(act), cross: r.cross, hk: who };
		if (M.kind === "match") {
			B.apply(M.st, a.shot, act);
			stat(M.v, who ? "kick" : "keep", r.res);
		} else {
			M.n++;
			if (r.res === "goal") M.goals++;
			if (M.kind === "target") { item.pts = B.targetPoints(r); M.pts += item.pts; }
			if (M.kind === "challenge") { item.ok = B.challengeOk(M.ch, a.shot, r); if (item.ok) M.goals += 0; }
			if (M.v === "PK") { M.faced++; if (r.res !== "goal") M.saves++; }
			stat(M.v, M.v === "PK" ? "keep" : "kick", r.res);
		}
		if (M.kind === "challenge") { M.goals = M.log.filter(function (x) { return x.ok; }).length + (item.ok ? 1 : 0); }
		M.log.push(item);
		ph = "result";
		var txt = B.RES_TEXT[r.res] || r.res;
		if (M.kind === "target") txt += item.pts ? " +" + item.pts : " (no target)";
		if (M.kind === "challenge" && r.res === "goal" && !item.ok) txt = "Goal, but not the way the challenge asks";
		banner('<span class="fk-res fk-res--' + r.res + '">' + esc(txt) + "</span>", null, null);
		render();
		var auto = M.kind === "match" || M.kind === "challenge" || M.kind === "target" || M.v === "PK";
		clearTimeout(nextT);
		nextT = setTimeout(function () { if (ph === "result") next(); }, auto ? 1900 : 1500);
	}
	var nextT = 0;

	/* ===================================================================== banners / status ===================================================================== */
	function banner(html, btn, fn) {
		var b = $("fk-banner");
		b.innerHTML = '<div class="fk-bin">' + html + (btn ? '<br><button type="button" class="fk-shoot fk-bbtn">' + esc(btn) + "</button>" : "") + "</div>";
		b.hidden = false;
		var x = b.querySelector(".fk-bbtn");
		if (x) { x.addEventListener("click", fn); setTimeout(function () { try { x.focus({ preventScroll: true }); } catch (e) { /* old */ } }, 30); }
		b.classList.toggle("is-plain", !btn);
	}
	function hideBanner() { $("fk-banner").hidden = true; }
	function showOver() {
		var h = "";
		if (M.kind === "match") {
			var w = M.st.win, sc = M.st.score;
			if (M.opp === "cpu") h = w.p < 0 ? "A draw after 20 kicks each!" : w.p === M.me ? "<b>You win " + Math.max(sc[0], sc[1]) + "–" + Math.min(sc[0], sc[1]) + "!</b>" : "The computer wins " + Math.max(sc[0], sc[1]) + "–" + Math.min(sc[0], sc[1]) + ".";
			else h = w.p < 0 ? "A draw!" : "<b>Player " + (w.p + 1) + " wins " + sc[w.p] + "–" + sc[1 - w.p] + "!</b>";
			if (M.opp === "cpu") stat(M.v, "match", w.p === M.me ? "w" : w.p < 0 ? "d" : "l");
		} else if (M.kind === "target") { h = "<b>" + M.pts + " points</b> from 10 balls."; var best = (S.stats.Tbest || 0); if (M.pts > best) { S.stats.Tbest = M.pts; save(); h += " A new best!"; } }
		else if (M.kind === "challenge") {
			var ok = M.goals >= M.ch.need;
			h = ok ? "<b>Challenge done!</b> ⭐" : "Not this time: " + M.goals + " of " + M.ch.need + ".";
			if (ok) { S.stats.ch = S.stats.ch || {}; S.stats.ch[M.ch.id] = 1; save(); }
		}
		banner(h, "Play again ↺", function () { newMatch(M.v); });
	}
	function statusText() {
		if (mode === "online") return onStatus();
		if (mode === "hive") return hiveStatus();
		var md = M.md, n = kickN();
		if (ph === "over") return "Finished.";
		if (M.kind === "match") {
			var k = B.kicker(M.st), who = M.opp === "cpu" ? (k === M.me ? "You" : "The computer") : "Player " + (k + 1);
			var role = ph === "keep" || ph === "ready" ? (M.opp === "cpu" ? "You are in goal" : "Player " + (2 - k) + " in goal") : who + " to kick";
			return (md.id === "F" ? "Free kick " : "Penalty ") + (Math.floor(n / 2) + 1) + (n >= 10 ? " (sudden death)" : "") + " · " + role;
		}
		if (M.kind === "target") return "Ball " + Math.min(10, M.n + 1) + " of 10 · " + M.pts + " points";
		if (M.kind === "challenge") return M.ch.name + " · ball " + Math.min(M.ch.balls, M.n + 1) + " of " + M.ch.balls + " · " + M.goals + "/" + M.ch.need;
		if (M.v === "PK") return "Goalkeeper practice · saved " + M.saves + " of " + M.faced;
		return md.name + " · " + M.goals + " goals from " + M.n;
	}
	function renderScore() {
		var box = $("fk-score");
		var st = mode === "online" ? onState() : mode === "hive" ? (hv.R && hv.R.s) : M.kind === "match" ? M.st : null;
		if (!st) { box.innerHTML = ""; box.hidden = true; return; }
		box.hidden = false;
		var names = mode === "online" ? (on.g ? on.g.names.map(function (x) { return x || "…"; }) : ["", ""]) : mode === "hive" ? hv.R.players.map(function (p) { return p ? "@" + p : "…"; }) :
			M.opp === "cpu" ? (M.me === 0 ? ["You", "Computer"] : ["Computer", "You"]) : ["Player 1", "Player 2"];
		var rows = [0, 1].map(function (p) {
			var dots = [], ks = st.kicks.filter(function (k, i) { return i % 2 === p; });
			var shown = Math.max(5, Math.ceil(st.kicks.length / 2));
			for (var i = 0; i < shown; i++) { var k = ks[i]; dots.push('<span class="fk-dot ' + (!k ? "" : k.res === "goal" ? "is-goal" : "is-miss") + '" title="' + (k ? esc(B.RES_TEXT[k.res]) : "to come") + '"></span>'); }
			return '<div class="fk-srow' + (!st.win && B.kicker(st) === p ? " is-turn" : "") + '"><span class="fk-sname">' + esc(names[p]) + '</span><span class="fk-dots">' + dots.join("") + '</span><b class="fk-snum">' + st.score[p] + "</b></div>";
		});
		box.innerHTML = rows.join("");
	}
	function renderLog() {
		var list = mode === "local" && M ? M.log : [];
		if (mode === "online") list = (on.g ? on.g.kicks : []).map(function (k, i) { return { res: k.res, shot: k.shot, hk: (i % 2) === on.seat }; });
		if (mode === "hive" && hv.R && hv.R.s) list = hv.R.s.kicks.map(function (k, i) { return { res: k.res, shot: k.shot, hk: hv.R.players[i % 2] === hMe() }; });
		$("fk-log").innerHTML = list.slice(-12).map(function (it, i) {
			var sh = B.shotParse(it.shot);
			return '<li class="fk-li fk-li--' + it.res + '"><b>' + esc(B.RES_TEXT[it.res]) + "</b>" + (it.pts ? " +" + it.pts : "") + (sh ? ' <span class="fk-lis">' + (sh.spd / 100).toFixed(1) + " m/s" + (Math.abs(sh.side) >= 10 ? " · curl " + (sh.side / 10).toFixed(1) : "") + (Math.abs(sh.top) >= 10 ? " · " + (sh.top > 0 ? "dip " : "float ") + Math.abs(sh.top / 10).toFixed(1) : "") + "</span>" : "") + "</li>";
		}).join("");
	}
	function render() {
		$("fk-status").textContent = M ? statusText() : "";
		renderScore();
		renderLog();
		var kick = ph === "aim", keep = ph === "keep";
		$("fk-kickctl").hidden = !(kick || (ph !== "keep" && !keep && humanKicksSafe()));
		$("fk-keepctl").hidden = !keep;
		$("fk-shoot").disabled = !kick;
		var fkset = mode === "local" && M && M.kind === "practice" && M.v === "PF";
		$("fk-fkset").hidden = !fkset;
		root.classList.toggle("fk-candrag", fkset && (ph === "aim" || ph === "result"));
		if (fkset) {
			var s = curSetup();
			$("fk-spot").innerHTML = "<b>" + B.distance(s.bx, s.by).toFixed(1) + " m</b> from goal · " + Math.round(B.angleDeg(s.bx, s.by)) + "° " + (s.bx > 0.3 ? "right" : s.bx < -0.3 ? "left" : "straight on") + " · wall " + s.n;
			$("fk-wall").value = String(S.spot.wall); $("fk-jump").checked = !!S.spot.j; $("fk-shift").value = S.spot.off || 0;
			$("fk-kx").value = Math.round((s.kx || 0) * 100);
		}
		$("fk-powerv").textContent = (+S.power).toFixed(1) + " m/s (" + Math.round(S.power * 3.6) + " km/h)";
		$("fk-curlv").textContent = S.curl === 0 ? "none" : Math.abs(S.curl).toFixed(1) + (S.curl > 0 ? " → right" : " ← left");
		$("fk-dipv").textContent = S.dip === 0 ? "none" : S.dip > 0 ? "dip " + S.dip : "float " + (-S.dip);
		$("fk-hint").textContent = hintText();
		$("fk-hsave").hidden = !(mode === "local" && M && M.kind === "match" && M.st.win && M.st.win.p >= -1 && !S.saved[M.seed]);
		draw();
	}
	function humanKicksSafe() { try { return M && ph !== "anim" && ph !== "result" && ph !== "over" && ph !== "wait" && humanKicks(); } catch (e) { return false; } }
	function hintText() {
		if (ph === "aim") return "Click in the goal to aim" + (S.guide !== "off" ? " · the dotted line is the path" : "");
		if (ph === "keep") return "Click in the goal where to dive";
		if (ph === "anim" && A && A.live && !A.act) return "Click in the goal to dive!";
		if (ph === "wait") return "Waiting for the other player…";
		return "";
	}

	/* ===================================================================== stats ===================================================================== */
	function stat(v, kind, res) {
		var s = S.stats[v] || (S.stats[v] = {});
		if (kind === "kick") { s.k = (s.k || 0) + 1; if (res === "goal") s.g = (s.g || 0) + 1; }
		if (kind === "keep") { s.f = (s.f || 0) + 1; if (res !== "goal") s.sv = (s.sv || 0) + 1; }
		if (kind === "match") s[res] = (s[res] || 0) + 1;
		save();
	}
	function renderStats() {
		var rows = B.MODES.concat(B.CHALLENGES.map(function (c) { return B.mode(c.id); })).map(function (md) {
			var s = S.stats[md.id]; if (!s) return "";
			return "<tr><td>" + esc(md.name) + "</td><td>" + (s.k ? (s.g || 0) + " / " + s.k + " (" + Math.round(100 * (s.g || 0) / s.k) + "%)" : "–") + "</td><td>" + (s.f ? (s.sv || 0) + " / " + s.f : "–") + "</td><td>" + (s.w || s.l || s.d ? (s.w || 0) + "–" + (s.l || 0) + (s.d ? "–" + s.d : "") : "–") + "</td></tr>";
		}).join("");
		var ch = S.stats.ch || {}, done = B.CHALLENGES.filter(function (c) { return ch[c.id]; }).length;
		$("fk-stats").innerHTML = (rows ? '<div class="fk-tblw"><table class="fk-tbl"><thead><tr><th>Game</th><th>Goals / kicks</th><th>Saves / shots faced</th><th>Won–lost</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="fk-sub">Nothing yet: take some kicks!</p>') +
			'<p><b>Challenges done:</b> ' + done + " of " + B.CHALLENGES.length + (S.stats.Tbest ? " · <b>Target practice best:</b> " + S.stats.Tbest + " points" : "") + '</p><p><button type="button" class="tu-btn" id="fk-sreset">Reset statistics</button></p>';
		$("fk-sreset").addEventListener("click", function () { if (confirm("Reset all statistics?")) { S.stats = {}; save(); renderStats(); } });
	}

	/* ===================================================================== 2D drawing ===================================================================== */
	var cv = $("fk-cv"), ctx = cv.getContext("2d"), mapCv = $("fk-map"), mctx = mapCv.getContext("2d");
	var L = null;                // layout of the 2D view (goal panel + pitch)
	var dark = function () { return document.body.classList.contains("dark-mode"); };
	function eye(s) {
		var dx = -s.bx, dy = G.lineY - s.by, l = Math.sqrt(dx * dx + dy * dy) || 1;
		return { x: s.bx - dx / l * 2.2, y: s.by - dy / l * 2.2, z: 1.55 };
	}
	/* perspective onto the goal plane from behind the ball: world -> goal-plane (X, Z, scale) */
	function proj(E, x, y, z) {
		var den = E.y - y; if (den < 0.3) den = 0.3;
		var s = (E.y - G.lineY) / den;
		return { X: E.x + (x - E.x) * s, Z: E.z + (z - E.z) * s, k: s };
	}
	function sizeCanvas(c, w, h) {
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
		c.style.width = w + "px"; c.style.height = h + "px";
		return dpr;
	}
	function layout() {
		var st = $("fk-stage"), w = st.clientWidth || 600, h = st.clientHeight || 420;
		var dpr = sizeCanvas(cv, w, h);
		var s = A ? A.setup : curSetup();
		var gh = S.dim === "2d" || !v3 ? Math.round(h * (w < 560 ? 0.48 : 0.52)) : h;
		// goal panel: x -5.4..5.4, z -0.3..3.4 (as seen from behind the ball)
		var gw = w - 16, sc = Math.min(gw / 10.8, (gh - 14) / 3.7);
		L = { w: w, h: h, dpr: dpr, gh: gh, gs: sc, gx: w / 2, gz: gh - 8 - 0.3 * sc, s: s };
		// pitch from above
		var ymax = Math.max(20, s.by + 6), xr = Math.max(14, Math.abs(s.bx) + 6), ph2 = h - gh - 8, pw = w - 16;
		var ps = Math.max(0.5, Math.min(pw / (2 * xr), ph2 / (ymax + 3)));
		L.ps = ps; L.px = w / 2; L.py = gh + 8 + 2.5 * ps;
		return L;
	}
	function G2S(X, Z) { return [L.gx + X * L.gs, L.gz - Z * L.gs]; }
	function S2G(px, py) { return { x: (px - L.gx) / L.gs, z: (L.gz - py) / L.gs }; }
	function P2S(x, y) { return [L.px + x * L.ps, L.py + y * L.ps]; }
	function S2P(px, py) { return { x: (px - L.px) / L.ps, y: (py - L.py) / L.ps }; }

	function guidePath(setup) {
		if (S.guide === "off" || ph !== "aim") return null;
		var key = B.setupStr(setup) + "|" + aim.x.toFixed(2) + aim.z.toFixed(2) + S.power + S.curl + S.dip;
		if (guidePath.key === key) return guidePath.val;
		var sh = B.aimFor(setup, aim.x, aim.z, S.power, S.curl, S.dip), r = B.simulate(setup, sh, null, { frames: true, noKeeper: true, maxT: 3 });
		var f = r.frames, pts = [], cut = S.guide === "start" ? Math.min(f.length / 3, 28) : f.length / 3;
		for (var i = 0; i < cut; i++) pts.push([f[i * 3], f[i * 3 + 1], f[i * 3 + 2]]);
		guidePath.key = key; guidePath.val = { pts: pts, res: r.res };
		return guidePath.val;
	}
	function keeperNow() {
		if (A) return B.keeperAt(A.setup, A.act, Math.max(0, A.t));
		if (last && ph === "result") return B.keeperAt(last.setup, last.act, last.sim.t);
		return B.keeperAt(curSetup(), null, 0);
	}
	function ballNow() {
		if (A) return ballAt(A.sim, A.t);
		if (last && ph === "result") return ballAt(last.sim, last.sim.t);
		var s = curSetup(); return [s.bx, s.by, G.R];
	}

	function draw() {
		if (!M && mode === "local") return;
		layout();
		var s = L.s;
		if (S.dim === "3d" && v3) { draw3d(s); drawMap(); return; }
		var c = ctx, d = dark();
		c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
		c.clearRect(0, 0, L.w, L.h);
		drawGoalPanel(c, s, d);
		drawPitch(c, s, d, P2S, L.ps, { x0: 0, y0: L.gh, w: L.w, h: L.h - L.gh });
	}
	function drawGoalPanel(c, s, d) {
		var E = eye(s), gh = L.gh;
		var sky = c.createLinearGradient(0, 0, 0, gh);
		sky.addColorStop(0, d ? "#16212e" : "#bcd9ef"); sky.addColorStop(0.55, d ? "#22303f" : "#e2eef6"); sky.addColorStop(0.56, d ? "#1d4d2b" : "#3f9a4e"); sky.addColorStop(1, d ? "#174023" : "#2f7f3c");
		c.fillStyle = sky; c.fillRect(0, 0, L.w, gh);
		// crowd strip
		var cy0 = G2S(0, 3.4)[1], cy1 = G2S(0, 2.9)[1];
		if (IMG.crowd) { var ch = cy1, cw = ch * IMG.crowd.width / IMG.crowd.height; for (var cx0 = 0; cx0 < L.w; cx0 += cw) c.drawImage(IMG.crowd, cx0, 0, cw, ch); if (d) { c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(0, 0, L.w, ch); } }
		else {
			c.fillStyle = d ? "#2b3340" : "#8c97a6"; c.fillRect(0, Math.max(0, cy0 - 30), L.w, cy1 - Math.max(0, cy0 - 30));
			for (var i = 0; i < L.w; i += 7) { c.fillStyle = ["#d9480f", "#1c7ed6", "#f8f9fa", "#fab005", "#2f9e44"][(i * 7 + (i >> 3)) % 5]; c.globalAlpha = 0.5; c.fillRect(i, cy1 - 10 - ((i * 13) % 9), 4, 5); }
			c.globalAlpha = 1;
		}
		// ground line
		var gl = G2S(0, 0)[1];
		c.fillStyle = d ? "#1d5a2f" : "#3a944a"; c.fillRect(0, gl, L.w, gh - gl);
		// net
		var a = G2S(-G.halfW, G.barZ), b = G2S(G.halfW, 0);
		c.fillStyle = d ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)"; c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
		c.strokeStyle = d ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.55)"; c.lineWidth = 1;
		c.beginPath();
		for (var x = -G.halfW; x <= G.halfW + 0.01; x += 0.25) { var p = G2S(x, 0), q = G2S(x, G.barZ); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); }
		for (var z = 0; z <= G.barZ + 0.01; z += 0.25) { var p2 = G2S(-G.halfW, z), q2 = G2S(G.halfW, z); c.moveTo(p2[0], p2[1]); c.lineTo(q2[0], q2[1]); }
		c.stroke();
		// targets
		if (M && (M.kind === "target" || (M.ch && M.ch.tgt))) {
			(M.kind === "target" ? B.TARGETS : [M.ch.tgt]).forEach(function (T) {
				var p = G2S(T.x, T.z); c.beginPath(); c.arc(p[0], p[1], T.r * L.gs, 0, 7); c.fillStyle = "rgba(255,212,59,0.28)"; c.fill(); c.strokeStyle = "#ffd43b"; c.lineWidth = 3; c.stroke();
				if (T.pts) { c.fillStyle = "#fff"; c.font = "700 " + Math.round(L.gs * 0.28) + "px system-ui"; c.textAlign = "center"; c.fillText(T.pts, p[0], p[1] + L.gs * 0.1); }
			});
		}
		// keeper
		var k = keeperNow();
		drawKeeperFace(c, k);
		// posts + bar
		c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(3, G.postR * 2 * L.gs); c.lineCap = "round";
		var pl = G2S(-G.postX, 0), pt = G2S(-G.postX, G.barZ + G.postR), pr = G2S(G.postX, G.barZ + G.postR), pb = G2S(G.postX, 0);
		c.beginPath(); c.moveTo(pl[0], pl[1]); c.lineTo(pt[0], pt[1]); c.lineTo(pr[0], pr[1]); c.lineTo(pb[0], pb[1]); c.stroke();
		// wall (projected: players nearer to the eye look bigger)
		var wall = A ? A.wall : B.wallSpots(s), lift = A ? B.wallLift(s, Math.max(0, A.t)) : 0;
		c.globalAlpha = 0.62;
		wall.forEach(function (w) {
			var f = proj(E, w.x, w.y, lift), h = proj(E, w.x, w.y, lift + 1.82), rw = 0.24 * f.k * L.gs;
			var F = G2S(f.X, f.Z), Hd = G2S(h.X, h.Z);
			if (IMG["wall-player"]) { var wim = IMG["wall-player"], wh = F[1] - Hd[1], ww = wh * wim.width / wim.height; c.drawImage(wim, F[0] - ww / 2, Hd[1], ww, wh); return; }
			c.fillStyle = "rgba(28,74,160,0.9)"; c.strokeStyle = "rgba(10,20,50,0.6)"; c.lineWidth = 1;
			c.beginPath(); c.moveTo(F[0] - rw, F[1]); c.lineTo(F[0] - rw * 1.1, Hd[1] + rw * 1.6); c.lineTo(F[0] + rw * 1.1, Hd[1] + rw * 1.6); c.lineTo(F[0] + rw, F[1]); c.closePath(); c.fill(); c.stroke();
			c.fillStyle = "#e6b98f"; c.beginPath(); c.arc(Hd[0], Hd[1] + rw * 0.7, rw * 0.62, 0, 7); c.fill();
			c.fillStyle = "#f8f9fa"; c.fillRect(F[0] - rw, F[1] - (F[1] - Hd[1]) * 0.45, rw * 2, (F[1] - Hd[1]) * 0.12);
		});
		c.globalAlpha = 1;
		// guide
		var gp = guidePath(s);
		if (gp) {
			c.setLineDash([2, 6]); c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 2.5; c.beginPath();
			gp.pts.forEach(function (pp, i) { var q = proj(E, pp[0], pp[1], pp[2]), Q = G2S(q.X, q.Z); if (i) c.lineTo(Q[0], Q[1]); else c.moveTo(Q[0], Q[1]); });
			c.stroke(); c.setLineDash([]);
		}
		// aim / dive marks
		if (ph === "aim") cross(c, G2S(aim.x, aim.z), "#ffd43b");
		if (ph === "keep" || (A && A.act && A.act.d >= 0)) { var dt = ph === "keep" ? dive : { x: A.act.tx / 100, z: A.act.tz / 100 }; ring(c, G2S(dt.x, dt.z), "#69db7c"); }
		// ball
		var bp = ballNow(), bq = proj(E, bp[0], bp[1], bp[2]), gq = proj(E, bp[0], bp[1], 0), BQ = G2S(bq.X, bq.Z), GQ = G2S(gq.X, gq.Z), br = Math.max(3, G.R * bq.k * L.gs);
		c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(GQ[0], GQ[1], br, br * 0.35, 0, 0, 7); c.fill();
		ballSprite(c, BQ[0], BQ[1], br);
	}
	function cross(c, p, col) { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(p[0], p[1], 12, 0, 7); c.moveTo(p[0] - 18, p[1]); c.lineTo(p[0] + 18, p[1]); c.moveTo(p[0], p[1] - 18); c.lineTo(p[0], p[1] + 18); c.stroke(); }
	function ring(c, p, col) { c.strokeStyle = col; c.lineWidth = 3; c.setLineDash([5, 4]); c.beginPath(); c.arc(p[0], p[1], 15, 0, 7); c.stroke(); c.setLineDash([]); c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1], 3, 0, 7); c.fill(); }
	function ballSprite(c, x, y, r) {
		var g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
		g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#c9ced6");
		c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
		if (r > 5) { c.fillStyle = "#1e2733"; c.beginPath(); c.arc(x, y, r * 0.32, 0, 7); c.fill(); }
		c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
	}
	var IMG = {};
	["keeper-ready", "keeper-dive", "wall-player", "kicker", "crowd"].forEach(function (n) { var im = new Image(); im.onload = function () { IMG[n] = im; if (!A) draw(); }; im.src = "/free-kick/img/" + n + (n === "crowd" ? ".jpg" : ".png") + "?v=1"; });
	function drawKeeperFace(c, k) {
		var A2 = G2S(k.ax, k.az), H2 = G2S(k.hx, k.hz), sc = L.gs;
		var im = k.dive && k.s > 0.15 ? IMG["keeper-dive"] : IMG["keeper-ready"];
		if (im) {
			var dx = H2[0] - A2[0], dy = H2[1] - A2[1], len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx);
			c.save();
			if (k.dive && k.s > 0.15) {
				c.translate((A2[0] + H2[0]) / 2, (A2[1] + H2[1]) / 2);
				if (dx < 0) { c.scale(-1, 1); c.rotate(Math.atan2(dy, -dx)); } else c.rotate(ang);
				var w = len * 1.15, h = w * im.height / im.width; c.drawImage(im, -w / 2, -h / 2, w, h);
			} else {
				var hh = 1.95 * sc, ww = hh * im.width / im.height; c.drawImage(im, A2[0] - ww / 2, G2S(0, 0)[1] - hh, ww, hh);
			}
			c.restore();
			return;
		}
		c.strokeStyle = "#a9e34b"; c.lineWidth = 0.36 * sc; c.lineCap = "round";
		c.beginPath(); c.moveTo(A2[0], A2[1]); c.lineTo(H2[0], H2[1]); c.stroke();
		c.fillStyle = "#e6b98f"; var hx = A2[0] + (H2[0] - A2[0]) * 0.78, hy = A2[1] + (H2[1] - A2[1]) * 0.78; c.beginPath(); c.arc(hx, hy, 0.13 * sc, 0, 7); c.fill();
	}
	function drawKickerBack(c, x, y, h) {
		var im = IMG.kicker;
		if (im) { var w = h * im.width / im.height; c.drawImage(im, x - w / 2, y - h, w, h); return; }
		c.fillStyle = "#c92a2a"; c.fillRect(x - h * 0.13, y - h * 0.82, h * 0.26, h * 0.42);
		c.fillStyle = "#f8f9fa"; c.fillRect(x - h * 0.12, y - h * 0.42, h * 0.24, h * 0.14);
		c.strokeStyle = "#e6b98f"; c.lineWidth = h * 0.06; c.beginPath(); c.moveTo(x - h * 0.06, y - h * 0.28); c.lineTo(x - h * 0.08, y); c.moveTo(x + h * 0.06, y - h * 0.28); c.lineTo(x + h * 0.08, y); c.stroke();
		c.fillStyle = "#3b2a20"; c.beginPath(); c.arc(x, y - h * 0.9, h * 0.08, 0, 7); c.fill();
	}
	/* the pitch from above (also the mini map in 3D) */
	function drawPitch(c, s, d, P, ps, box) {
		c.save();
		c.beginPath(); c.rect(box.x0, box.y0, box.w, box.h); c.clip();
		c.fillStyle = d ? "#1b4a29" : "#3c9a4b"; c.fillRect(box.x0, box.y0, box.w, box.h);
		for (var y = 0; y < 60; y += 5) { var a = P(-40, y), b = P(40, y + 2.5); c.fillStyle = d ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.06)"; c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
		c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = Math.max(1, 0.12 * ps);
		function rect(x0, y0, x1, y1) { var p = P(x0, y0), q = P(x1, y1); c.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); }
		var gl = P(-40, 0), gr = P(40, 0); c.beginPath(); c.moveTo(gl[0], gl[1]); c.lineTo(gr[0], gr[1]); c.stroke();
		rect(-G.boxX, 0, G.boxX, G.boxY); rect(-G.sixX, 0, G.sixX, G.sixY);
		var sp = P(0, G.penY); c.fillStyle = "#fff"; c.beginPath(); c.arc(sp[0], sp[1], Math.max(1.5, 0.15 * ps), 0, 7); c.fill();
		c.beginPath(); c.arc(sp[0], sp[1], G.arcR * ps, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
		// goal
		var g0 = P(-G.postX, 0), g1 = P(G.postX, -G.depth); c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(g0[0], g1[1], g1[0] - g0[0], g0[1] - g1[1]);
		c.strokeStyle = "#fff"; c.lineWidth = Math.max(2, 0.14 * ps); c.beginPath(); c.moveTo(g0[0], g0[1]); c.lineTo(g1[0], g0[1]); c.stroke();
		// keeper
		var k = keeperNow(), ka = P(k.ax, k.y), kh = P(k.hx, k.y);
		c.strokeStyle = "#a9e34b"; c.lineWidth = Math.max(4, 0.4 * ps); c.lineCap = "round";
		c.beginPath(); c.moveTo(ka[0], ka[1] + (k.dive ? 0 : -0.15 * ps)); c.lineTo(kh[0] + (k.dive ? 0 : 0.01), kh[1] + (k.dive ? 0 : 0.15 * ps)); c.stroke();
		if (!k.dive) { c.beginPath(); c.moveTo(ka[0] - 0.4 * ps, ka[1]); c.lineTo(ka[0] + 0.4 * ps, ka[1]); c.stroke(); }
		// wall
		var wall = A ? A.wall : B.wallSpots(s);
		wall.forEach(function (w) { var p = P(w.x, w.y); c.fillStyle = "#1c4aa0"; c.beginPath(); c.arc(p[0], p[1], Math.max(3, 0.24 * ps), 0, 7); c.fill(); c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1; c.stroke(); });
		// 9.15 m ring around a free kick
		if (s.n && M && M.v === "PF" && ph === "aim") { var bp0 = P(s.bx, s.by); c.setLineDash([3, 5]); c.strokeStyle = "rgba(255,255,255,0.45)"; c.lineWidth = 1; c.beginPath(); c.arc(bp0[0], bp0[1], G.wallDist * ps, 0, 7); c.stroke(); c.setLineDash([]); }
		// guide (from above)
		var gp = guidePath(s);
		if (gp) { c.setLineDash([2, 5]); c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 2; c.beginPath(); gp.pts.forEach(function (pp, i) { var q = P(pp[0], pp[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.stroke(); c.setLineDash([]); }
		// flight trail
		var sim = A ? A.sim : (last && ph === "result" ? last.sim : null), tt = A ? A.t : sim ? sim.t : 0;
		if (sim && tt > 0) {
			c.strokeStyle = "rgba(255,212,59,0.9)"; c.lineWidth = 2; c.beginPath();
			var f = sim.frames, n = Math.min(f.length / 3, Math.floor(tt / B.FRAME_S) + 1);
			for (var i = 0; i < n; i++) { var q = P(f[i * 3], f[i * 3 + 1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }
			c.stroke();
		}
		// ball + shadow
		var bp = ballNow(), sh = P(bp[0], bp[1]), bh = P(bp[0] + bp[2] * 0.25, bp[1] - bp[2] * 0.6), br = Math.max(3.5, (0.11 + bp[2] * 0.03) * ps * 1.6);
		c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.arc(sh[0], sh[1], Math.max(2.5, 0.11 * ps * 1.4), 0, 7); c.fill();
		ballSprite(c, bh[0], bh[1], br);
		if (root.classList.contains("fk-candrag") && !A) { c.strokeStyle = "rgba(255,212,59,0.95)"; c.lineWidth = 2; c.beginPath(); c.arc(sh[0], sh[1], br + 6, 0, 7); c.stroke(); }
		c.restore();
	}
	/* the mini map in 3D mode */
	var MAP = null;
	function drawMap() {
		var show = S.dim === "3d" && v3 && mode === "local" && M && M.v === "PF";
		mapCv.hidden = !show;
		if (!show) return;
		var w = Math.min(220, Math.round(L.w * 0.34)), h = Math.round(w * 0.8), dpr = sizeCanvas(mapCv, w, h), s = L.s;
		var ymax = Math.max(24, s.by + 5), xr = Math.max(16, Math.abs(s.bx) + 5), ps = Math.min(w / (2 * xr), h / (ymax + 3));
		MAP = { ps: ps, px: w / 2, py: 2.5 * ps };
		mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		drawPitch(mctx, s, dark(), function (x, y) { return [MAP.px + x * MAP.ps, MAP.py + y * MAP.ps]; }, ps, { x0: 0, y0: 0, w: w, h: h });
	}

	/* ===================================================================== 3D ===================================================================== */
	var v3 = null, v3loading = false;
	function ensure3d() {
		if (v3 || v3loading || !window.FK3D) return;
		v3loading = true; $("fk-load").hidden = false;
		window.FK3D.create($("fk-3d")).then(function (v) { v3 = v; v3loading = false; $("fk-load").hidden = true; applyDim(); render(); }, function (e) {
			v3loading = false; $("fk-load").hidden = true; S.dim = "2d"; save(); applyDim(); toast("3D is not available here (" + (e && e.message || "no WebGL") + "): showing the 2D view.");
		});
	}
	function applyDim() {
		var is3 = S.dim === "3d";
		if (is3 && !v3) ensure3d();
		$("fk-3d").hidden = !(is3 && v3);
		cv.hidden = is3 && !!v3;
		$("fk-dim").textContent = is3 ? "2D" : "3D";
		$("fk-cam").hidden = !is3;
		$("fk-cam").value = S.cam;
		draw();
	}
	function draw3d(s) {
		var st = $("fk-stage");
		v3.size(st.clientWidth, st.clientHeight);
		var gp = guidePath(s), k = keeperNow(), bp = ballNow();
		var prog = A ? clamp(1 + A.t / RUN, 0, 1) : ph === "result" ? 1 : 0;
		v3.frame({
			setup: s, wall: A ? A.wall : B.wallSpots(s), lift: A ? B.wallLift(s, Math.max(0, A.t)) : 0, ball: bp, keeper: k, kicker: prog, flying: !!(A && A.t > 0),
			guide: gp ? gp.pts : null, aim: ph === "aim" ? aim : null, dive: ph === "keep" ? dive : (A && A.act && A.act.d >= 0 ? { x: A.act.tx / 100, z: A.act.tz / 100 } : null),
			targets: M && M.kind === "target" ? B.TARGETS : M && M.ch && M.ch.tgt ? [M.ch.tgt] : null, cam: S.cam, dark: dark(), t: A ? A.t : 0
		});
	}

	/* ===================================================================== input ===================================================================== */
	function stagePoint(e) {
		var r = $("fk-stage").getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	function goalPick(e) {
		if (S.dim === "3d" && v3) return v3.pickGoal(e.clientX, e.clientY);
		var p = stagePoint(e);
		if (p.y > L.gh) return null;
		return S2G(p.x, p.y);
	}
	function onGoal(g) {
		if (!g) return false;
		var x = clamp(g.x, -5.5, 5.5), z = clamp(g.z, 0, 3.4);
		if (ph === "aim") { aim = { x: x, z: Math.max(0.11, z) }; render(); return true; }
		if (ph === "keep") { dive = { x: x, z: z }; render(); return true; }
		if (ph === "anim" && A && A.live && !A.act) { liveDive(x, z); return true; }
		return false;
	}
	var drag = null;
	$("fk-stage").addEventListener("pointerdown", function (e) {
		if (e.target.closest(".fk-banner") || e.button > 0) return;
		var p = stagePoint(e);
		// dragging the ball on the pitch (2D) / the mini map (3D)
		if (root.classList.contains("fk-candrag")) {
			if (e.target === mapCv && MAP) { drag = { map: true }; mapCv.setPointerCapture(e.pointerId); moveSpot(e); e.preventDefault(); return; }
			if (S.dim === "2d" && p.y > L.gh) { drag = { map: false }; cv.setPointerCapture(e.pointerId); moveSpot(e); e.preventDefault(); return; }
		}
		if (e.target === mapCv) return;
		var g = goalPick(e);
		if (g && onGoal(g)) { drag = { goal: true }; e.preventDefault(); }
	});
	window.addEventListener("pointermove", function (e) {
		if (!drag) { if (v3 && S.dim === "3d" && e.target.closest && e.target.closest("#fk-3d")) v3.hover(e.clientX, e.clientY); return; }
		if (drag.goal) { if (ph === "aim" || ph === "keep") onGoal(goalPick(e)); return; }
		moveSpot(e);
	});
	window.addEventListener("pointerup", function () { if (drag && !drag.goal) { save(); render(); } drag = null; });
	function moveSpot(e) {
		var x, y;
		if (drag && drag.map) { var r = mapCv.getBoundingClientRect(); x = (e.clientX - r.left - MAP.px) / MAP.ps; y = (e.clientY - r.top - MAP.py) / MAP.ps; }
		else { var p = stagePoint(e), w = S2P(p.x, p.y); x = w.x; y = w.y; }
		x = clamp(Math.round(x * 2) / 2, -30, 30); y = clamp(Math.round(y * 2) / 2, 6, 45);
		if (B.inBox(x, y)) { if (Math.abs(x) < G.boxX - 0.01) { if (y > G.boxY - 3) y = G.boxY + 0.5; else x = x < 0 ? -G.boxX - 0.5 : G.boxX + 0.5; } }
		S.spot.bx = x; S.spot.by = y; S.spot.kx = null;
		guidePath.key = null;
		render();
	}
	/* sliders + buttons */
	function bindRange(id, key, fn) { var el = $(id); el.value = S[key]; el.addEventListener("input", function () { S[key] = +this.value; guidePath.key = null; save(); render(); if (fn) fn(); }); }
	bindRange("fk-power", "power"); bindRange("fk-curl", "curl"); bindRange("fk-dip", "dip");
	var STYLES = { place: [22, 0, 0], curl: [25, 7, 2], dip: [27, 0, 7], knuckle: [29, 0, 0], chip: [14, 0, -4], blast: [32, 0, 1] };
	root.querySelector(".fk-styles").addEventListener("click", function (e) {
		var b = e.target.closest("[data-style]"); if (!b) return;
		var st = STYLES[b.getAttribute("data-style")], s = curSetup();
		S.power = st[0]; S.curl = st[1] * (b.getAttribute("data-style") === "curl" && aim.x < s.bx ? -1 : 1); S.dip = st[2];
		if (b.getAttribute("data-style") === "chip") { aim.z = Math.max(aim.z, 1.2); }
		["power", "curl", "dip"].forEach(function (k) { $("fk-" + k).value = S[k]; });
		guidePath.key = null; save(); render();
	});
	// Shoot: a click shoots at the slider power; holding charges the power (it swings up and down) and shoots on release
	var hold = null;
	$("fk-shoot").addEventListener("pointerdown", function (e) {
		if (ph !== "aim") return;
		hold = { t0: performance.now(), id: e.pointerId };
		this.setPointerCapture(e.pointerId);
		(function swing() {
			if (!hold) return;
			var el = (performance.now() - hold.t0) / 1000;
			if (el > 0.22) { var u = (el - 0.22) / 1.4 % 2, v = u < 1 ? u : 2 - u; hold.p = 10 + v * 24; $("fk-shoot").style.setProperty("--fk-pw", Math.round(v * 100) + "%"); $("fk-shoot").textContent = "⚽ " + hold.p.toFixed(0) + " m/s"; }
			requestAnimationFrame(swing);
		})();
	});
	function releaseShoot() {
		if (!hold) return;
		var p = hold.p; hold = null;
		$("fk-shoot").style.removeProperty("--fk-pw"); $("fk-shoot").textContent = "⚽ Shoot";
		if (p) { S.power = Math.round(p * 2) / 2; $("fk-power").value = S.power; save(); }
		shoot(S.power);
	}
	$("fk-shoot").addEventListener("pointerup", releaseShoot);
	$("fk-shoot").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); shoot(S.power); } });
	$("fk-dive").addEventListener("click", keeperReady);
	segBind("fk-when", "when", function (v) { return +v; }, render);
	segBind("fk-opp", "opp", null, function () { syncSetup(); newMatch(); });
	segBind("fk-first", "first", function (v) { return +v; }, function () { newMatch(); });
	segBind("fk-lv", null, null, null, function (v) {
		var md = modeOf(S.mode);
		if (md.np === 2) S.lv = v === "none" ? "medium" : v; else S.plv = v;
		save(); syncSetup();
		if (M && M.kind === "match") newMatch(); else if (M) { M.lv = v === "none" ? null : v; if (M.ch) M.lv = M.ch.gk; render(); }
	});
	function segBind(id, key, conv, after, custom) {
		var box = $(id);
		box.addEventListener("click", function (e) {
			var b = e.target.closest("[data-v]"); if (!b) return;
			var v = b.getAttribute("data-v");
			if (custom) custom(v); else { S[key] = conv ? conv(v) : v; save(); }
			syncSegs();
			if (after) after();
		});
	}
	function syncSegs() {
		function set(id, val) { [].forEach.call($(id).querySelectorAll("[data-v]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(val))); }); }
		set("fk-opp", S.opp); set("fk-first", S.first); set("fk-when", S.when); set("fk-ofirst", S.ofirst);
		var md = modeOf(S.mode);
		set("fk-lv", md.np === 2 ? S.lv : S.plv);
	}
	function syncSetup() {
		var md = modeOf(S.mode);
		$("fk-mode").value = md.id;
		root.classList.toggle("fk-ismatch", md.np === 2);
		root.classList.toggle("fk-iscpu", md.np === 2 && S.opp === "cpu");
		root.classList.toggle("fk-nolv", !!md.ch || md.id === "T" || (md.np === 2 && S.opp === "local"));
		root.classList.toggle("fk-ispractice", md.np === 1 && md.id !== "PK");
		$("fk-desc").textContent = md.desc + (md.ch && S.stats.ch && S.stats.ch[md.id] ? " ✓ Done before." : "");
		$("fk-spread").checked = S.spread; $("fk-live").checked = S.live; $("fk-guide").value = S.guide; $("fk-slow").value = String(S.slow);
		syncSegs();
	}
	(function fillModes() {
		var sel = $("fk-mode"), groups = {};
		B.MODES.concat(B.CHALLENGES.map(function (c) { return B.mode(c.id); })).forEach(function (md) {
			var g = groups[md.group] || (groups[md.group] = document.createElement("optgroup")); g.label = md.group;
			var o = document.createElement("option"); o.value = md.id; o.textContent = md.name; g.appendChild(o);
		});
		Object.keys(groups).forEach(function (k) { sel.appendChild(groups[k]); });
	})();
	$("fk-mode").addEventListener("change", function () { if (mode !== "local") return toast("Leave the online match first."); S.mode = this.value; save(); syncSetup(); newMatch(); });
	$("fk-spread").addEventListener("change", function () { S.spread = this.checked; save(); });
	$("fk-live").addEventListener("change", function () { S.live = this.checked; save(); if (mode === "local" && (ph === "keep" || ph === "ready")) next(); });
	$("fk-guide").addEventListener("change", function () { S.guide = this.value; guidePath.key = null; save(); render(); });
	$("fk-slow").addEventListener("change", function () { S.slow = +this.value; save(); });
	$("fk-new").addEventListener("click", function () { if (mode === "online") return onLeave(); if (mode === "hive") return hiveLeave(); newMatch(); });
	$("fk-dim").addEventListener("click", function () { S.dim = S.dim === "3d" ? "2d" : "3d"; save(); applyDim(); });
	$("fk-cam").addEventListener("change", function () { S.cam = this.value; save(); draw(); });
	$("fk-rand").addEventListener("click", randomSpot);
	function randomSpot() { var sp = B.randomSpot(Math.random); S.spot.bx = sp.bx; S.spot.by = sp.by; S.spot.kx = null; guidePath.key = null; save(); render(); }
	$("fk-wall").addEventListener("change", function () { S.spot.wall = this.value === "auto" ? "auto" : +this.value; S.spot.kx = null; guidePath.key = null; save(); render(); });
	$("fk-jump").addEventListener("change", function () { S.spot.j = this.checked ? 1 : 0; save(); render(); });
	$("fk-shift").addEventListener("input", function () { S.spot.off = +this.value; guidePath.key = null; save(); render(); });
	$("fk-kx").addEventListener("input", function () { S.spot.kx = +this.value / 100; save(); render(); });
	$("fk-autokx").addEventListener("click", function () { S.spot.kx = null; save(); render(); });

	document.addEventListener("keydown", function (e) {
		if (e.target.closest && e.target.closest("input, select, textarea") && e.target.type !== "range") return;
		if (!root.offsetParent && !document.fullscreenElement) return;
		var k = e.key, step = e.shiftKey ? 0.3 : 0.1;
		if (ph === "anim" && A && A.live && !A.act && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp")) {
			var s = A.setup, hi = e.shiftKey;
			liveDive(k === "ArrowLeft" ? (s.kx || 0) - 2.8 : k === "ArrowRight" ? (s.kx || 0) + 2.8 : (s.kx || 0), k === "ArrowUp" ? 2.3 : hi ? 1.9 : 0.6);
			e.preventDefault(); return;
		}
		if (k === " " && (ph === "aim" || ph === "keep")) { e.preventDefault(); if (ph === "aim") shoot(S.power); else keeperReady(); return; }
		if (k.indexOf("Arrow") === 0 && (ph === "aim" || ph === "keep")) {
			if (e.target.type === "range") return;
			var t = ph === "aim" ? aim : dive;
			if (k === "ArrowLeft") t.x -= step; if (k === "ArrowRight") t.x += step; if (k === "ArrowUp") t.z += step; if (k === "ArrowDown") t.z = Math.max(0.11, t.z - step);
			e.preventDefault(); render(); return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (k === "v" || k === "V") $("fk-dim").click();
		else if ((k === "c" || k === "C") && S.dim === "3d") { var o = ["behind", "keeper", "tv", "high"]; S.cam = o[(o.indexOf(S.cam) + 1) % o.length]; $("fk-cam").value = S.cam; save(); draw(); }
		else if ((k === "r" || k === "R") && !$("fk-fkset").hidden) randomSpot();
		else if (k === "n" || k === "N") $("fk-new").click();
	});
	window.addEventListener("resize", function () { draw(); });
	if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe($("fk-stage"));
	new MutationObserver(function () { draw(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	/* tabs */
	$("fk-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (b) showTab(b.getAttribute("data-t")); });
	function showTab(t) {
		[].forEach.call($("fk-tabs").querySelectorAll("[data-t]"), function (b) { var on2 = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", String(on2)); b.tabIndex = on2 ? 0 : -1; $("fk-p-" + b.getAttribute("data-t")).hidden = !on2; });
		if (t === "stats") renderStats();
		if (t === "online") { loadLobby(); renderHiveCard(); loadHiveLobby(); loadRecent(); }
		if (t === "play") setTimeout(draw, 20);
	}

	/* ===================================================================== guest online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, timer: null, seen: 0, sending: false };
	var API = "/api/free-kick";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("fk-name").value || "").trim().slice(0, 24); return n || "Guest"; }
	$("fk-name").value = S.name || "";
	$("fk-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("fk-opub").checked = S.opub !== false;
	$("fk-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("fk-omode").value = S.omode || "P";
	$("fk-omode").addEventListener("change", function () { S.omode = this.value; save(); });
	segBind("fk-ofirst", "ofirst");
	function onState() { if (!on.g) return null; return B.replay(on.g.v, on.g.id + "r" + on.g.round, on.g.kicks.map(function (k) { return k.shot + "/" + k.act; })); }
	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.seen = r.g.kicks.length;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online"; M = M || { log: [] };
		showTab("play"); onlinePhase(); render(); poll(0);
	}
	$("fk-ocreate").addEventListener("click", function () {
		if (mode !== "local") return toast("Leave the match you are in first.");
		api("POST", { act: "new", v: S.omode, name: myName(), pub: S.opub !== false, first: S.ofirst }).then(function (r) { if (r.error) return toast(r.error); startOnline(r); toast("Match made: copy the link and send it to a friend."); });
	});
	function join(id) {
		api("POST", { act: "join", id: id, name: myName() }).then(function (r) { if (r.error) return toast(r.error); startOnline(r); });
	}
	function poll(delay) { clearTimeout(on.timer); on.timer = setTimeout(function () {
		if (mode !== "online") return;
		api("GET", null, "?id=" + on.id).then(function (r) { if (r.g) gotGame(r.g); poll(document.hidden ? 6000 : on.g && on.g.status === "play" ? 1500 : 3000); });
	}, delay); }
	function gotGame(g) {
		var prev = on.g; on.g = g;
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Your opponent") + " joined!");
		if (prev && g.round !== prev.round) { on.seen = 0; toast("Rematch!"); }
		if (g.kicks.length > on.seen && !A) {
			var i = on.seen, k = g.kicks[i]; on.seen = i + 1;
			var st = B.replay(g.v, g.id + "r" + g.round, g.kicks.slice(0, i).map(function (x) { return x.shot + "/" + x.act; }));
			start(B.setupFor(st), B.shotParse(k.shot), B.actParse(k.act), false, { onEnd: function (r) { last = A || last; banner('<span class="fk-res fk-res--' + r.res + '">' + esc(B.RES_TEXT[r.res]) + "</span>", null, null); ph = "result"; render(); setTimeout(function () { if (ph === "result") next(); }, 1700); } });
			return;
		}
		if (!A && ph !== "result") { onlinePhase(); render(); }
	}
	function onlinePhase() {
		if (mode === "hive") return hivePhase();
		var g = on.g; if (!g) { ph = "wait"; return; }
		if (g.status === "wait") { ph = "wait"; return; }
		if (g.status === "over") { ph = "over"; var w = g.win; banner(w.p < 0 ? "A draw." : w.p === on.seat ? "<b>You win!</b>" + (w.why !== "score" ? " (" + esc(w.why) + ")" : "") : "You lose." + (w.why !== "score" ? " (" + esc(w.why) + ")" : ""), "Rematch ↺", function () { onAct("rematch"); }); return; }
		var st = onState(), ks = B.kicker(st);
		if (ks === on.seat) ph = g.pend.s ? "wait" : "aim"; else ph = g.pend.a ? "wait" : "keep";
	}
	function onKick(intended) { onSend({ act: "kick", id: on.id, key: on.key, n: on.g.kicks.length, s: B.shotStr(intended) }); }
	function onKeep(act) { onSend({ act: "keep", id: on.id, key: on.key, n: on.g.kicks.length, a: B.actStr(act) }); }
	function onSend(body) {
		ph = "wait"; render();
		api("POST", body).then(function (r) { if (r.error) toast(r.error); if (r.g) gotGame(r.g); else { onlinePhase(); render(); } });
	}
	function onAct(a) { api("POST", { act: a, id: on.id, key: on.key }).then(function (r) { if (r.error) toast(r.error); if (r.g) { hideBanner(); gotGame(r.g); } }); }
	function onLeave() {
		if (on.g && on.g.status === "play" && !confirm("Leave this match? You will lose it.")) return;
		if (on.g && on.g.status === "wait") api("POST", { act: "cancel", id: on.id, key: on.key }); else if (on.g && on.g.status === "play") api("POST", { act: "leave", id: on.id, key: on.key });
		clearTimeout(on.timer); on.g = null; S.online = null; save(); mode = "local"; $("fk-obar").hidden = true; newMatch();
	}
	function onStatus() {
		var g = on.g; if (!g) return "Connecting…";
		if (g.status === "wait") return "Waiting for someone to join…";
		var st = onState(), n = st.kicks.length;
		return (g.v === "F" ? "Free kick " : "Penalty ") + (Math.floor(n / 2) + 1) + " · " + (ph === "aim" ? "Your kick" : ph === "keep" ? "You are in goal: pick a dive" : g.status === "over" ? "Finished" : "Waiting for " + (g.names[1 - on.seat] || "the other player"));
	}
	function renderObar() {
		var box = $("fk-obar");
		if (mode === "online") {
			var g = on.g, link = location.origin + location.pathname + "?g=" + on.id;
			box.hidden = false;
			box.innerHTML = "<span>Online · " + esc(g ? g.names.map(function (x) { return x || "…"; }).join(" vs ") : "") + '</span><span class="fk-vbtns"><button type="button" class="fk-vb" data-o="copy">🔗 Copy invite link</button>' +
				(g && g.status === "play" && g.idle > 180000 ? '<button type="button" class="fk-vb" data-o="claim">Claim the win</button>' : "") + (g && g.status === "play" ? '<button type="button" class="fk-vb" data-o="resign">Resign</button>' : "") + '<button type="button" class="fk-vb" data-o="leave">Leave</button></span>';
			box.dataset.link = link;
		} else if (mode === "hive") renderHbar();
		else box.hidden = true;
	}
	$("fk-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return hbarClick(e);
		var a = b.getAttribute("data-o");
		if (a === "copy") copy(this.dataset.link, "Invite link copied.");
		else if (a === "leave") onLeave();
		else if (a === "resign") { if (confirm("Resign?")) onAct("resign"); }
		else onAct(a);
	});
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("fk-lobby");
			if (r.error) { box.innerHTML = '<p class="fk-sub">' + esc(r.error) + "</p>"; return; }
			var list = r.open || [];
			box.innerHTML = list.length ? '<ul class="fk-lob">' + list.map(function (o) { return '<li><span>' + esc(o.name) + ' <span class="fk-lobv">· ' + (o.v === "F" ? "Free-kick match" : "Penalty shootout") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>'; }).join("") + "</ul>" : '<p class="fk-sub">No open matches right now. Make one above.</p>';
		});
	}
	$("fk-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) { if (mode !== "local") return toast("Leave the match you are in first."); join(b.getAttribute("data-join")); } });
	$("fk-orefresh").addEventListener("click", loadLobby);

	/* stand-in for /api/free-kick on local copies (two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-free-kick:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-free-kick:mock", JSON.stringify(db)); };
		function pub(g) { return { id: g.id, v: g.v, names: g.names, kicks: g.kicks, pend: { s: !!g.pend.s, a: !!g.pend.a }, status: g.status, win: g.win, round: g.round, idle: now - g.at }; }
		var q = query || "";
		if (method === "GET") {
			if (/lobby=1/.test(q) && !/hlobby/.test(q)) return { open: Object.keys(db).map(function (k) { return db[k]; }).filter(function (g) { return g.status === "wait" && g.pub; }).map(function (g) { return { id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], age: now - g.created }; }) };
			if (/hlobby|hrecent|hg=/.test(q)) return { open: [], games: [], recs: [], done: [], joiners: [] };
			var m = /id=([a-z0-9]+)/.exec(q), g0 = m && db[m[1]];
			return g0 ? { g: pub(g0) } : { error: "Game not found." };
		}
		if (/^h/.test(b.act)) return { ok: true };
		if (b.act === "new") {
			var seat = b.first === "guest" ? 1 : b.first === "random" ? (Math.random() < 0.5 ? 0 : 1) : 0, key = rnd() + rnd() + rnd(), id = rnd();
			var g = { id: id, v: b.v, names: [null, null], tok: [null, null], seed: rnd(), kicks: [], pend: { s: null, a: null }, status: "wait", win: null, round: 0, pub: b.pub, created: now, at: now };
			g.names[seat] = b.name; g.tok[seat] = key; db[id] = g; put();
			return { g: pub(g), key: key, seat: seat };
		}
		var gg = db[b.id];
		if (!gg) return { error: "Game not found." };
		if (b.act === "join") {
			if (gg.status !== "wait") return { error: "Someone else already joined." };
			var s2 = gg.tok[0] ? 1 : 0, k2 = rnd() + rnd() + rnd(); gg.tok[s2] = k2; gg.names[s2] = b.name; gg.status = "play"; gg.at = now; put();
			return { g: pub(gg), key: k2, seat: s2 };
		}
		var me = gg.tok.indexOf(b.key);
		if (me < 0) return { error: "That isn't your game." };
		if (b.act === "kick" || b.act === "keep") {
			var st = B.replay(gg.v, gg.id + "r" + gg.round, gg.kicks.map(function (k) { return k.shot + "/" + k.act; })), ks = B.kicker(st);
			if (b.n !== gg.kicks.length) return { error: "Out of step.", g: pub(gg) };
			if (b.act === "kick") { if (me !== ks) return { error: "You're the keeper." }; gg.pend.s = b.s; } else { if (me === ks) return { error: "You're the kicker." }; gg.pend.a = b.a; }
			gg.at = now;
			if (gg.pend.s && gg.pend.a) {
				var shot = B.applyError(B.shotParse(gg.pend.s), gg.seed + "|" + gg.round, gg.kicks.length, 1);
				B.apply(st, shot, B.actParse(gg.pend.a));
				gg.kicks.push(st.kicks[st.kicks.length - 1]); gg.pend = { s: null, a: null };
				if (st.win) { gg.status = "over"; gg.win = st.win; }
			}
			put(); return { g: pub(gg) };
		}
		if (b.act === "resign" || b.act === "leave") { if (gg.status === "play") { gg.status = "over"; gg.win = { p: 1 - me, why: b.act }; } put(); return { g: pub(gg) }; }
		if (b.act === "rematch") { if (gg.status === "over") { gg.tok = [gg.tok[1], gg.tok[0]]; gg.names = [gg.names[1], gg.names[0]]; gg.kicks = []; gg.pend = { s: null, a: null }; gg.status = "play"; gg.win = null; gg.round++; gg.at = now; put(); } return { g: pub(gg) }; }
		if (b.act === "cancel") { delete db[b.id]; put(); return { ok: true }; }
		return { error: "Unknown action." };
	}

	/* ===================================================================== Hive matches =====================================================================
	   Ops are custom_json id mes_fk signed with the posting key through main_js/hive.js (MESHive). For each kick: the keeper posts a sealed
	   dive (kc), the kicker the shot (k), the keeper opens the seal (kr). The keeper's salt is kept in localStorage until it is revealed. */
	var H = B.hive;
	var hv = { host: null, gid: null, R: null, pending: [], timer: null, joiners: [], busy: false, ops: {}, seen: 0, revealing: -1 };
	var HA = MOCK ? mockHive() : realHive();
	function realHive() {
		var Mh = function () { return window.MESHive || null; };
		return {
			user: function () { var u = Mh() && Mh().user(); return u ? u.name : ""; },
			login: function (n) { return Mh() ? Mh().login(n) : Promise.reject(new Error("The Hive helpers did not load: reload the page.")); },
			logout: function () { if (Mh()) Mh().logout(); },
			onChange: function (f) { if (Mh()) Mh().onChange(f); else window.addEventListener("load", function () { if (Mh()) Mh().onChange(f); }); },
			help: function () { return Mh() ? Mh().helpHtml() : ""; },
			send: function (obj, label) {
				var me = this.user();
				return Mh().keychain().then(function (k) {
					if (!k) { var e = new Error("Hive Keychain is not installed in this browser."); throw e; }
					return new Promise(function (ok, no) {
						k.requestCustomJson(me, H.ID, "Posting", H.json(obj), label, function (r) {
							if (r && r.success) { var x = r.result || {}; ok({ trx: x.id || x.tx_id || x.trx_id || "" }); }
							else no(new Error((r && (r.message || (r.error && (r.error.message || r.error)))) || "Cancelled in Keychain"));
						});
					});
				});
			},
			ops: function (acct, since) {
				var all = [], pages = 0;
				function page(start) {
					return Mh().call("condenser_api.get_account_history", [acct, start, start < 0 ? 200 : Math.min(1000, start + 1), 262144, 0]).then(function (r) {
						r = r || []; pages++; all = r.concat(all);
						var oldest = r.length ? r[0] : null, oldT = oldest ? Date.parse(oldest[1].timestamp + "Z") : 0;
						if (oldest && oldest[0] > 0 && oldT > since && pages < 4 && r.length >= (start < 0 ? 200 : 2)) return page(oldest[0] - 1);
						return H.parse(all, acct);
					});
				}
				return page(-1);
			}
		};
	}
	function mockHive() {
		var subs = [];
		function chain() { try { return JSON.parse(localStorage.getItem("mes-free-kick:hchain") || "[]"); } catch (e) { return []; } }
		return {
			user: function () { try { return sessionStorage.getItem("mes-free-kick:hacct") || ""; } catch (e) { return ""; } },
			login: function (n) { n = String(n || "").replace(/^@/, "").toLowerCase(); if (!H.ACCT_RE.test(n)) return Promise.reject(new Error("Type a Hive username.")); sessionStorage.setItem("mes-free-kick:hacct", n); subs.forEach(function (f) { f(); }); return Promise.resolve({ name: n }); },
			logout: function () { sessionStorage.removeItem("mes-free-kick:hacct"); subs.forEach(function (f) { f(); }); },
			onChange: function (f) { subs.push(f); },
			help: function () { return ""; },
			send: function (obj) {
				var me = this.user(), c = chain(), now = Date.now(), trx = rnd() + rnd() + rnd();
				c.push([c.length + 1, { trx_id: trx, block: Math.floor(now / 3000) + 1, timestamp: new Date(now).toISOString().slice(0, 19), op: ["custom_json", { id: H.ID, required_auths: [], required_posting_auths: [me], json: H.json(obj) }] }]);
				localStorage.setItem("mes-free-kick:hchain", JSON.stringify(c));
				return new Promise(function (r) { setTimeout(function () { r({ trx: trx }); }, 300); });
			},
			ops: function (acct) { var cut = Math.floor(Date.now() / 3000); return Promise.resolve(H.parse(chain().filter(function (e) { return e[1].block <= cut && e[1].op[1].required_posting_auths[0] === acct; }), acct)); }
		};
	}
	function hMe() { return HA.user(); }
	function txLinks(trx) { return trx ? '<a href="https://hivehub.dev/tx/' + esc(trx) + '" target="_blank" rel="noopener">hivehub</a>' : ""; }
	function renderHiveCard() {
		var box = $("fk-hlogin"), me = hMe();
		$("fk-hmake").hidden = !me;
		if (me) {
			box.innerHTML = '<p class="fk-hwho">Signed in as <b>@' + esc(me) + '</b> <button type="button" class="tu-btn" id="fk-hlogout">Log out</button></p>';
			$("fk-hlogout").addEventListener("click", function () { HA.logout(); });
			loadMine();
		} else {
			box.innerHTML = '<div class="fk-hrow"><input class="tu-input" id="fk-huser" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" id="fk-hlogin-b">Log in with Hive</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test mode: any username works here, nothing is signed." : "Keychain proves you own the account; your keys never leave Keychain.") + "</p>";
			var go = function () {
				var b = $("fk-hlogin-b"); b.disabled = true;
				HA.login($("fk-huser").value).then(function () { toast("Logged in."); }, function (e) { b.disabled = false; if (e && /keychain|signer/i.test(e.message)) { var d = document.createElement("div"); d.innerHTML = HA.help(); box.appendChild(d); } else toast((e && e.message) || "Could not log in."); });
			};
			$("fk-hlogin-b").addEventListener("click", go);
			$("fk-huser").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
			$("fk-hminebox").hidden = true;
		}
	}
	HA.onChange(function () { renderHiveCard(); render(); });
	function register(act, body, tries) {
		tries = tries || 0; body.act = act;
		api("POST", body).then(function (r) { if (r && r.error && /not on the chain/i.test(r.error) && tries < 6) setTimeout(function () { register(act, body, tries + 1); }, 3500); });
	}
	function pend(obj, trx) { var o = H.clean(JSON.parse(H.json(obj))); o.acct = hMe(); o.trx = trx || ("p" + Math.random()); o.block = 0; o.ts = Date.now(); o.i = 1e12 + hv.pending.length; return o; }
	$("fk-hcreate").addEventListener("click", function () {
		var me = hMe(); if (!me) return toast("Log in with Hive first.");
		if (mode !== "local") return toast("Leave the match you are in first.");
		var to = ($("fk-hto").value || "").trim().replace(/^@/, "").toLowerCase();
		if (to && (!H.ACCT_RE.test(to) || to === me)) return toast("That isn't a Hive username you can challenge.");
		var obj = { a: "open", g: H.newGid(), v: S.omode, f: S.ofirst };
		if (to) obj.to = to;
		HA.send(obj, (to ? "Challenge @" + to + " to " : "Open ") + (S.omode === "F" ? "a free-kick match" : "a penalty shootout")).then(function (r) {
			hiveEnter(me, obj.g, [pend(obj, r.trx)]);
			register("hopen", { host: me, g: obj.g });
			toast(to ? "Challenge sent: copy the link and send it to @" + to + "." : "Your match is open.");
		}, function (e) { toast(e.message); });
	});
	function hiveJoin(host, gid) {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive first, then press Join again."); return; }
		if (host === me) return hiveEnter(host, gid, []);
		Promise.all([HA.ops(host, 0), HA.ops(me, 0)]).then(function (res) {
			var R = H.build(host, gid, res[0].concat(res[1]), Date.now());
			if (!R.open) return toast("That Hive match wasn't found (try again in a few seconds).");
			if (R.guest === me || R.status !== "wait") return hiveEnter(host, gid, []);
			if (R.open.to && R.open.to !== me) return toast("That match is a challenge for @" + R.open.to + ".");
			var obj = { a: "join", h: host, g: gid };
			HA.send(obj, "Join @" + host + "'s match").then(function (r) { hiveEnter(host, gid, [pend(obj, r.trx)]); register("hjoin", { host: host, g: gid, acct: me }); }, function (e) { toast(e.message); });
		}, function () { toast("No Hive node answered: try again."); });
	}
	function hiveEnter(host, gid, pending) {
		clearTimeout(hv.timer);
		hv.host = host; hv.gid = gid; hv.R = null; hv.pending = pending || []; hv.ops = {}; hv.seen = -1; hv.joiners = [];
		S.hive = { host: host, gid: gid }; save();
		mode = "hive"; M = M || { log: [] }; ph = "wait";
		showTab("play"); hivePoll(0); render();
	}
	function hiveLeave() { clearTimeout(hv.timer); hv.host = null; hv.R = null; S.hive = null; save(); mode = "local"; $("fk-obar").hidden = true; newMatch(); }
	function hivePoll(d) { clearTimeout(hv.timer); hv.timer = setTimeout(hiveRefresh, d); }
	function hiveRefresh() {
		if (mode !== "hive") return;
		var me = hMe(), R = hv.R, accts = [hv.host];
		if (R && R.guest) accts.push(R.guest); else hv.joiners.forEach(function (a) { if (accts.indexOf(a) < 0) accts.push(a); });
		if (me && accts.indexOf(me) < 0) accts.push(me);
		var since = R && R.open ? R.open.ts - 60000 : 0;
		var jobs = accts.map(function (a) { return HA.ops(a, since).then(function (o) { hv.ops[a] = o; }, function () {}); });
		if (!R || R.status === "wait") jobs.push(api("GET", null, "?hg=" + hv.host + "/" + hv.gid).then(function (r) { if (r && r.joiners) hv.joiners = r.joiners.slice(0, 5); }));
		Promise.all(jobs).then(function () { if (mode !== "hive") return; hiveRebuild(); hivePoll(document.hidden ? 9000 : 3500); });
	}
	function hiveRebuild() {
		var all = [], now = Date.now();
		Object.keys(hv.ops).forEach(function (a) { all = all.concat(hv.ops[a]); });
		hv.pending = hv.pending.filter(function (p) { return !all.some(function (o) { return o.trx === p.trx || (o.acct === p.acct && o.a === p.a && o.g === p.g && o.n === p.n); }) && now - p.ts < 120000; });
		var prev = hv.R, R = H.build(hv.host, hv.gid, all.concat(hv.pending), now);
		hv.R = R;
		if (prev && prev.status === "wait" && R.status === "play") toast("@" + R.guest + " joined!");
		if (R.status === "over" && prev && prev.status === "play") register("hres", { host: hv.host, g: hv.gid });
		var nk = R.s ? R.s.kicks.length : 0;
		if (hv.seen < 0) hv.seen = nk;
		if (nk > hv.seen && !A) {
			var i = hv.seen; hv.seen = i + 1;
			var k = R.s.kicks[i], st = B.replay(R.s.v, hv.gid, R.s.kicks.slice(0, i).map(function (x) { return x.shot + "/" + x.act; }));
			start(B.setupFor(st), B.shotParse(k.shot), B.actParse(k.act), false, { onEnd: function (r) { last = A || last; banner('<span class="fk-res fk-res--' + r.res + '">' + esc(B.RES_TEXT[r.res]) + (R.results[i] && R.results[i].cheat ? " (the keeper's seal did not match)" : "") + "</span>", null, null); ph = "result"; render(); setTimeout(function () { if (ph === "result") next(); }, 1700); } });
			return;
		}
		if (!A && ph !== "result") { hivePhase(); render(); }
	}
	function saltKey(n) { return "mes-free-kick:hsalt:" + hv.host + "/" + hv.gid + "/" + n; }
	function hivePhase() {
		var R = hv.R, me = hMe();
		if (!R || R.status !== "play") { ph = R && R.status === "over" ? "over" : "wait"; if (ph === "over") banner(R.win.p < 0 ? "A draw." : R.players[R.win.p] === me ? "<b>You win!</b>" : "@" + esc(R.players[R.win.p]) + " wins.", null, null); return; }
		var mine = R.waitAcct === me;
		if (!mine || hv.busy) { ph = "wait"; return; }
		if (R.step === "commit") ph = "keep";
		else if (R.step === "kick") ph = "aim";
		else { ph = "wait"; hiveReveal(); }
	}
	function hiveSend(obj, label) {
		hv.busy = true; render();
		return HA.send(obj, label).then(function (r) { hv.busy = false; hv.pending.push(pend(obj, r.trx)); hiveRebuild(); hivePoll(2500); }, function (e) { hv.busy = false; toast(e.message); hivePhase(); render(); throw e; });
	}
	function hiveKeep(act) {
		var n = hv.R.s.kicks.length, salt = H.newSalt();
		try { localStorage.setItem(saltKey(n), JSON.stringify({ d: B.actStr(act), x: salt })); } catch (e) { /* kept in memory below */ }
		hv.mem = { n: n, d: B.actStr(act), x: salt };
		ph = "wait"; render();
		hiveSend({ a: "kc", h: hv.host, g: hv.gid, n: n, c: H.commit(act, salt) }, "Seal my dive for kick " + (n + 1)).catch(function () {});
	}
	function hiveKick(intended) { var n = hv.R.s.kicks.length; ph = "wait"; render(); hiveSend({ a: "k", h: hv.host, g: hv.gid, n: n, s: B.shotStr(intended) }, "Take kick " + (n + 1)).catch(function () {}); }
	function hiveReveal() {
		var n = hv.R.s.kicks.length;
		if (hv.revealing === n) return;
		var sv2 = null; try { sv2 = JSON.parse(localStorage.getItem(saltKey(n)) || "null"); } catch (e) { /* none */ }
		if (!sv2 && hv.mem && hv.mem.n === n) sv2 = hv.mem;
		if (!sv2) { toast("The seal of your dive is not in this browser: the kick will count as if you stood still once time runs out."); return; }
		hv.revealing = n;
		hiveSend({ a: "kr", h: hv.host, g: hv.gid, n: n, d: sv2.d, x: sv2.x }, "Open my dive for kick " + (n + 1)).then(function () { try { localStorage.removeItem(saltKey(n)); } catch (e) { /* ok */ } }, function () { hv.revealing = -1; });
	}
	function hiveStatus() {
		var R = hv.R, me = hMe();
		if (!R || !R.open) return "Reading the match from Hive…";
		if (R.status === "wait") return R.open.to ? "Waiting for @" + R.open.to + " to accept" : "Waiting for someone on Hive to join";
		if (R.status !== "play") return "Finished";
		var n = R.s.kicks.length, w = R.waitAcct === me ? "you" : "@" + R.waitAcct;
		return (R.open.v === "F" ? "Free kick " : "Penalty ") + (Math.floor(n / 2) + 1) + " · waiting for " + w + (R.step === "commit" ? " (keeper seals a dive)" : R.step === "kick" ? " (kick)" : " (keeper opens the seal)");
	}
	function renderHbar() {
		var box = $("fk-obar"), R = hv.R, me = hMe();
		box.hidden = false;
		var h = "<span>On Hive · @" + esc(hv.host) + "/" + esc(hv.gid) + '</span><span class="fk-vbtns"><button type="button" class="fk-vb" data-h="copy">🔗 Copy link</button>';
		if (R && R.status === "wait" && me && me !== hv.host && (!R.open.to || R.open.to === me)) h += '<button type="button" class="fk-vb fk-vb--main" data-h="join">Join</button>';
		if (R && R.status === "wait" && me === hv.host) h += '<button type="button" class="fk-vb" data-h="cancel">Cancel</button>';
		if (R && R.status === "play" && R.players.indexOf(me) >= 0) {
			if (R.waitAcct !== me && Date.now() > R.canClaimAt) h += '<button type="button" class="fk-vb fk-vb--main" data-h="claim">Claim the win (away 5 min)</button>';
			h += '<button type="button" class="fk-vb" data-h="resign">Resign</button>';
		}
		box.innerHTML = h + '<button type="button" class="fk-vb" data-h="leave">Leave</button></span>';
	}
	function hbarClick(e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.getAttribute("data-h");
		if (a === "copy") return copy(location.origin + location.pathname + "?hive=" + hv.host + "/" + hv.gid, "Link copied.");
		if (a === "leave") return hiveLeave();
		if (a === "join") return hiveJoin(hv.host, hv.gid);
		if (a === "cancel") return hiveSend({ a: "cancel", h: hv.host, g: hv.gid }, "Cancel my open match").then(function () { register("hcancel", { host: hv.host, g: hv.gid }); }, function () {});
		if (a === "resign") { if (confirm("Resign this Hive match? It is final.")) hiveSend({ a: "res", h: hv.host, g: hv.gid }, "Resign").catch(function () {}); return; }
		if (a === "claim") hiveSend({ a: "claim", h: hv.host, g: hv.gid }, "Claim the win").catch(function () {});
	}
	$("fk-hsave").addEventListener("click", function () {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive (Play online tab), then press Save again."); return; }
		var st = M.st, obj = { a: "rec", g: H.newGid(), v: M.v, sd: M.seed.replace(/[^a-z0-9]/g, "").slice(0, 16) || "x", k: st.kicks.map(function (k) { return k.shot + "/" + k.act; }).join("."), o: M.opp === "cpu" ? M.lv : "local", s: M.opp === "cpu" ? M.me : -1, w: st.win.p };
		if (obj.sd !== M.seed) return toast("This match can't be saved.");
		if (!H.clean(obj)) return toast("This match can't be saved (too long).");
		HA.send(obj, "Save a free-kick result (self-reported)").then(function (r) { S.saved[M.seed] = r.trx || "?"; save(); render(); toast("Saved on Hive. " + txLinks(r.trx), true); register("hrec", { acct: me, g: obj.g }); }, function (e) { toast(e.message); });
	});
	function loadHiveLobby() {
		api("GET", null, "?hlobby=1").then(function (r) {
			var box = $("fk-hlobby"), list = (r && r.open) || [], me = hMe();
			box.innerHTML = list.length ? '<ul class="fk-lob">' + list.map(function (o) { return '<li><span>@' + esc(o.host) + ' <span class="fk-lobv">· ' + (o.v === "F" ? "Free-kick match" : "Penalty shootout") + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-hjoin="' + esc(o.host + "/" + o.g) + '">' + (o.host === me ? "Open" : "Join") + "</button></li>"; }).join("") + "</ul>" : '<p class="fk-sub">No open Hive matches right now.</p>';
		});
	}
	function loadMine() {
		var me = hMe(); if (!me) return;
		HA.ops(me, Date.now() - 30 * 86400000).then(function (ops) {
			var games = H.myGames(me, ops).slice(0, 10);
			$("fk-hminebox").hidden = !games.length;
			$("fk-hmine").innerHTML = '<ul class="fk-lob">' + games.map(function (g) { return '<li><span>' + (g.role === "host" ? "You opened" : "You joined @" + esc(g.host)) + ' <span class="fk-lobv">· ' + new Date(g.ts).toLocaleString() + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(g.host + "/" + g.gid) + '">Open</button></li>'; }).join("") + "</ul>";
		}, function () {});
	}
	function loadRecent() {
		api("GET", null, "?hrecent=1").then(function (r) {
			var box = $("fk-hrecent"), items = [];
			(r.done || []).forEach(function (o) { items.push("<li><span>@" + esc(o.players[0]) + " " + o.score[0] + "–" + o.score[1] + " @" + esc(o.players[1]) + ' <span class="fk-lobv">· ' + (o.v === "F" ? "free kicks" : "penalties") + " · " + ago(o.age) + " · " + txLinks(o.trx) + "</span></span></li>"); });
			(r.games || []).forEach(function (o) { items.push('<li><span>@' + esc(o.host) + " vs @" + esc(o.guest) + ' <span class="fk-lobv">· started ' + ago(o.age) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(o.host + "/" + o.g) + '">Watch</button></li>'); });
			(r.recs || []).forEach(function (o) { items.push("<li><span>@" + esc(o.acct) + ' saved a result <span class="fk-lobv">· ' + esc(o.res) + " · " + ago(o.age) + "</span></span></li>"); });
			box.innerHTML = items.length ? '<ul class="fk-lob">' + items.join("") + "</ul>" : '<p class="fk-sub">Nothing yet.</p>';
		});
	}
	$("fk-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hjoin]"); if (!b) return;
		if (mode === "online") return toast("Leave the guest match first.");
		var p = b.getAttribute("data-hjoin").split("/");
		if (hMe()) hiveJoin(p[0], p[1]); else hiveEnter(p[0], p[1], []);
	});
	$("fk-hrefresh").addEventListener("click", function () { loadHiveLobby(); loadMine(); loadRecent(); });

	/* ===================================================================== start ===================================================================== */
	var renderBase = render;
	render = function () { renderBase(); renderObar(); };
	if (window.MESPanel) window.MESPanel.add($("fk-view"), { bar: $("fk-pbar"), stage: $("fk-stage"), onChange: function () { setTimeout(draw, 30); } });
	else window.addEventListener("load", function () { if (window.MESPanel) window.MESPanel.add($("fk-view"), { bar: $("fk-pbar"), stage: $("fk-stage"), onChange: function () { setTimeout(draw, 30); } }); });
	syncSetup();
	var qs = new URLSearchParams(location.search);
	if (qs.get("mode") && B.mode(qs.get("mode"))) { S.mode = qs.get("mode"); syncSetup(); }
	newMatch();
	applyDim();
	if (qs.get("g")) join(qs.get("g"));
	else if (qs.get("hive") && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(qs.get("hive"))) { var hp = qs.get("hive").split("/"); hiveEnter(hp[0], hp[1], []); }
	else if (S.online && S.online.id) { api("GET", null, "?id=" + S.online.id).then(function (r) { if (r.g && r.g.status !== "over") { on.key = S.online.key; on.seat = S.online.seat; startOnline({ g: r.g, key: S.online.key, seat: S.online.seat }); } else { S.online = null; save(); } }); }
	window.MESFreeKickDebug = { state: function () { return { M: M, ph: ph, A: A, aim: aim, dive: dive, mode: mode }; }, shoot: shoot, step: function (s) { if (A) { A.t += s; if (A.t >= A.sim.t) { A.t = A.sim.t; endKick(); } else draw(); } }, setAim: function (x, z) { aim = { x: x, z: z }; render(); }, next: next, liveDive: liveDive, B: B };
})();
