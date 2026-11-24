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
		easy: { name: "Easy", react: 330, noise: 0.6, guess: 0.12, aim: 1.6 },
		medium: { name: "Medium", react: 270, noise: 0.4, guess: 0.15, aim: 1.15 },
		hard: { name: "Hard", react: 215, noise: 0.28, guess: 0.2, aim: 0.85 },
		pro: { name: "Pro", react: 180, noise: 0.18, guess: 0.22, aim: 0.65 }
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
