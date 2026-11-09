/* MES Billiards: table physics, the rules of 8-ball, 9-ball, 10-ball and snooker, practice + challenges, the computer opponent and
   the Hive game protocol. Pure code: runs in the page, in a Web Worker (the computer's thinking), in node
   (tool_apps_src/billiards-tests.js) and on the server (a byte-identical copy at mes.fm/api/_billiards-lib.js checks online
   shots: cp after editing; the tests check).

   DETERMINISM. A shot is a few integers (angle, power, spin, ball-in-hand spot). Every browser and the server simulate it and must get
   exactly the same result, so the simulation uses only + - * / and Math.sqrt (all correctly rounded IEEE operations, identical in
   every JavaScript engine) and its own sine / cosine (dsin / dcos: polynomials). Never use Math.sin / cos / exp / pow / hypot / atan2
   inside simulate() or the rules: they may differ in the last bit between engines and a game would split in two.

   Units: metres, seconds, radians. Table coordinates: origin at the centre, x along the length (head / baulk end at -L/2),
   y across with +y DOWN on the screen (same as a canvas).

   A game is (v, seed): v = game code ("8", "9", "10", "S15", "S6", "P8", "P9", "PS", "C1".."C10"), seed = a short string that
   decides the small random offsets of the rack (so both players of an online game break the same rack).
   A shot string: base36 fields joined by "~": angle (1/10000 degree, 0..3599999) ~ power (1..1000) ~ side (-100..100, + = right
   english) ~ height (-100..100, + = top / follow, - = draw) [~ x ~ y of the cue ball in 1/10 mm when it is in hand]. */
(function (root) {
	"use strict";
	var B = {};

	/* ======================================================= deterministic maths ======================================================= */
	var PI = 3.141592653589793;
	function poly(x, sinPart) {
		var x2 = x * x;
		if (sinPart) return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
		return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600 + x2 * (-1 / 87178291200)))))));
	}
	/** sin / cos of an angle given in 1/10000 degree (an integer 0..3599999): exact range reduction on the integer, then a polynomial */
	function dsc(units) {
		units = ((units % 3600000) + 3600000) % 3600000;
		var q = Math.floor((units + 450000) / 900000) % 4;      // which quarter (centred on 0, 90, 180, 270 degrees)
		var r = units - q * 900000;                               // -450000 .. 450000 (exact integer)
		if (r > 450000) r -= 3600000;
		var x = r * (PI / 1800000);                               // radians, |x| <= pi/4
		var s = poly(x, true), c = poly(x, false);
		if (q === 0) return [s, c];
		if (q === 1) return [c, -s];
		if (q === 2) return [-s, -c];
		return [-c, s];
	}
	B.dsc = dsc;
	/** angle units of a direction (for the page / the computer: may use Math.atan2, the result is an integer that then replays exactly) */
	B.angleOf = function (dx, dy) { var a = Math.round(Math.atan2(dy, dx) * 1800000 / PI); return ((a % 3600000) + 3600000) % 3600000; };
	B.dirOf = function (units) { var sc = dsc(units); return { x: sc[1], y: sc[0] }; };

	/* ======================================================= tables + games ======================================================= */
	// L x W = the playing area between the cushion noses; R = ball radius; mc / ms = corner / middle pocket mouth width; e = cushion bounce.
	B.TABLES = {
		pool: { id: "pool", name: "9-foot pool table", L: 2.54, W: 1.27, R: 0.028575, mc: 0.116, ms: 0.132, e: 0.78, eb: 0.95, mus: 0.2, mur: 0.01, muc: 0.2, cloth: "#1d6f42" },
		snooker: { id: "snooker", name: "12-foot snooker table", L: 3.569, W: 1.778, R: 0.02625, mc: 0.086, ms: 0.104, e: 0.72, eb: 0.95, mus: 0.2, mur: 0.0085, muc: 0.2, cloth: "#14763a",
			baulk: 0.737, dR: 0.292, black: 0.324 }
	};
	B.SNK_NAMES = { 1: "red", 2: "yellow", 3: "green", 4: "brown", 5: "blue", 6: "pink", 7: "black" };
	B.GAMES = [
		{ id: "8", name: "8-ball", group: "Pool", table: "pool", type: "8", np: 2, online: true, desc: "Pot all your group (solids 1-7 or stripes 9-15), then the black 8. Pot the 8 too early, or with a foul, and you lose." },
		{ id: "9", name: "9-ball", group: "Pool", table: "pool", type: "9", np: 2, online: true, desc: "Always hit the lowest numbered ball first. Any ball you pot keeps you at the table; pot the 9, even in a combination, and you win." },
		{ id: "10", name: "10-ball", group: "Pool", table: "pool", type: "10", np: 2, online: true, desc: "Like 9-ball with ten balls racked in a triangle: hit the lowest ball first, pot the 10 to win." },
		{ id: "S15", name: "Snooker (15 reds)", group: "Snooker", table: "snooker", type: "S", reds: 15, np: 2, online: true, desc: "Pot a red, then a colour, red, colour... then the colours in order from yellow to black. The highest score wins the frame." },
		{ id: "S6", name: "Six-red snooker", group: "Snooker", table: "snooker", type: "S", reds: 6, np: 2, online: true, desc: "Snooker with six reds: quicker frames, the same rules." },
		{ id: "P8", name: "Practice: 8-ball rack", group: "Practice", table: "pool", type: "P", rack: "8", np: 1, desc: "On your own: break and clear the table in as few shots as you can. No fouls, no turns." },
		{ id: "P9", name: "Practice: 9-ball rack", group: "Practice", table: "pool", type: "P", rack: "9", np: 1, desc: "On your own: break the 9-ball diamond and clear it." },
		{ id: "PS", name: "Practice: snooker table", group: "Practice", table: "snooker", type: "P", rack: "S15", np: 1, desc: "On your own on the big snooker table: pot every ball in any order." },
		{ id: "PL", name: "Practice: line-up (8 balls)", group: "Practice", table: "pool", type: "P", rack: "line", np: 1, desc: "Eight balls spread across the table: pot them all with good position play." }
	];
	// challenges: goal = pot every listed ball within `shots` shots without potting the cue ball. Positions are in table fractions (x/L, y/W).
	B.CHALLENGES = [
		{ id: "C1", name: "Straight in", shots: 1, table: "pool", cue: [0.01, -0.044], balls: [[1, 0.32, 0.3]], tip: "A straight shot into the corner. Aim through the middle of the ball." },
		{ id: "C2", name: "Thin cut", shots: 1, table: "pool", cue: [-0.1, -0.3], balls: [[3, 0.4, 0.4]], tip: "Aim the ghost ball (the dotted circle) so it touches the 3 on the side away from the pocket." },
		{ id: "C3", name: "Middle pocket", shots: 1, table: "pool", cue: [-0.25, -0.1], balls: [[2, 0.05, 0.3]], tip: "Middle pockets are easiest when the ball comes in straight." },
		{ id: "C4", name: "Bank it", shots: 1, table: "pool", cue: [-0.3, 0.3], balls: [[5, 0.0, -0.3], [9, -0.04, 0.0], [10, 0.04, 0.0]], targets: [5], tip: "Two balls block the 5 from the near middle pocket: bank it off the far cushion into the middle pocket." },
		{ id: "C5", name: "Combination", shots: 1, table: "pool", cue: [-0.3, 0.15], balls: [[1, 0.25, 0.3], [9, 0.33, 0.37]], targets: [9], tip: "Hit the 1 into the 9 so the 9 goes in the corner." },
		{ id: "C6", name: "Draw back", shots: 2, table: "pool", cue: [0.2, 0.0], balls: [[4, 0.32, 0.0], [6, -0.32, 0.3]], tip: "Pot the 4 with plenty of draw (bottom spin) so the cue ball comes back up the table for the 6." },
		{ id: "C7", name: "Follow through", shots: 2, table: "pool", cue: [-0.35, 0.3], balls: [[7, -0.1, 0.38], [8, 0.38, 0.4]], tip: "Hit the 7 with top spin so the cue ball keeps rolling toward the 8." },
		{ id: "C8", name: "Clear five", shots: 5, table: "pool", cue: [-0.25, 0.0], balls: [[1, 0.1, -0.3], [2, 0.3, 0.2], [3, -0.2, 0.35], [4, 0.0, 0.25], [5, 0.4, -0.38]], tip: "Five balls in five shots: plan where the cue ball stops each time." },
		{ id: "C9", name: "Long pot (snooker)", shots: 1, table: "snooker", cue: [-0.35, -0.18], balls: [[7, 0.45, 0.42]], tip: "The classic long pot down the table. Snooker pockets are tight: take your time with the aim." },
		{ id: "C10", name: "Black off its spot", shots: 1, table: "snooker", cue: [0.2, 0.08], balls: [[7, 0.409, 0]], tip: "Pot the black off its spot into a top corner." }
	];
	B.game = function (v) {
		var i;
		for (i = 0; i < B.GAMES.length; i++) if (B.GAMES[i].id === v) return B.GAMES[i];
		for (i = 0; i < B.CHALLENGES.length; i++) if (B.CHALLENGES[i].id === v) { var c = B.CHALLENGES[i]; return { id: c.id, name: "Challenge: " + c.name, group: "Challenges", table: c.table, type: "C", np: 1, ch: c, desc: c.tip }; }
		return null;
	};
	B.describe = function (v) { var g = B.game(v); return g ? g.name : v; };

	/* ======================================================= seeded random (racks) ======================================================= */
	function rng(seed) {
		var h = 2166136261 >>> 0, s = String(seed || "mes");
		for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
		return function () { h = (h + 0x6D2B79F5) >>> 0; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	}
	B.rng = rng;

	/* ======================================================= creating a game ======================================================= */
	// balls: arrays x, y, on (1 = on the table); k[i] = kind: pool = the number (0 = cue), snooker = value (0 cue, 1 red, 2..7 colours)
	function spots(T) {   // snooker colour spots (index = value)
		var bx = -T.L / 2 + T.baulk;
		return { 2: [bx, T.dR], 3: [bx, -T.dR], 4: [bx, 0], 5: [0, 0], 6: [T.L / 4, 0], 7: [T.L / 2 - T.black, 0] };
	}
	B.spots = spots;
	function triangle(T, rows, apexX, rand) {   // positions of a triangle rack, row by row (apex first), rows of 1..rows balls
		var R = T.R, out = [], dx = 2 * R * 0.8660254037844386 * 1.004, g = 2 * R * 1.004;
		for (var r = 0; r < rows; r++) for (var j = 0; j <= r; j++) {
			var jx = (rand() - 0.5) * 0.00009, jy = (rand() - 0.5) * 0.00009;
			out.push([apexX + r * dx + jx, (j - r / 2) * g + jy]);
		}
		return out;
	}
	function rackPool(T, kind, rand, x, y, k) {
		var foot = T.L / 4, i, pos, order;
		x.push(-T.L / 4); y.push(0); k.push(0);        // the cue ball (moved by the first ball in hand)
		if (kind === "8") {
			pos = triangle(T, 5, foot, rand);
			// 8 in the middle (index 4), a solid and a stripe in the back corners (10 and 14), the rest shuffled
			var solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
			shuffle(solids, rand); shuffle(stripes, rand);
			var flip = rand() < 0.5;
			var slot = new Array(15), rest = [];
			slot[4] = 8; slot[10] = flip ? solids.pop() : stripes.pop(); slot[14] = flip ? stripes.pop() : solids.pop();
			rest = solids.concat(stripes); shuffle(rest, rand);
			for (i = 0; i < 15; i++) if (!slot[i]) slot[i] = rest.pop();
			for (i = 0; i < 15; i++) { x.push(pos[i][0]); y.push(pos[i][1]); k.push(slot[i]); }
		} else if (kind === "9") {
			// diamond: rows of 1, 2, 3, 2, 1; the 1 at the apex, the 9 in the middle, the rest shuffled
			order = [2, 3, 4, 5, 6, 7, 8]; shuffle(order, rand);
			var lab = [1, order[0], order[1], order[2], 9, order[3], order[4], order[5], order[6]];
			var d = diamond(T, foot, rand);
			for (i = 0; i < 9; i++) { x.push(d[i][0]); y.push(d[i][1]); k.push(lab[i]); }
		} else if (kind === "10") {
			pos = triangle(T, 4, foot, rand);
			order = [2, 3, 4, 5, 6, 7, 8, 9]; shuffle(order, rand);
			var lab10 = [1, order[0], order[1], order[2], 10, order[3], order[4], order[5], order[6], order[7]];
			for (i = 0; i < 10; i++) { x.push(pos[i][0]); y.push(pos[i][1]); k.push(lab10[i]); }
		} else if (kind === "line") {
			var L = T.L, W = T.W, pts = [[0.05, -0.25], [0.18, 0.2], [0.3, -0.1], [0.38, 0.35], [-0.1, 0.3], [-0.22, -0.3], [0.1, 0.05], [0.42, -0.35]];
			for (i = 0; i < pts.length; i++) { x.push(pts[i][0] * L + (rand() - 0.5) * 0.04); y.push(pts[i][1] * W + (rand() - 0.5) * 0.04); k.push(i + 1); }
		}
	}
	function diamond(T, foot, rand) {
		var R = T.R, dx = 2 * R * 0.8660254037844386 * 1.004, g = 2 * R * 1.004, rows = [1, 2, 3, 2, 1], out = [];
		for (var r = 0; r < 5; r++) for (var j = 0; j < rows[r]; j++) out.push([foot + r * dx + (rand() - 0.5) * 0.00009, (j - (rows[r] - 1) / 2) * g + (rand() - 0.5) * 0.00009]);
		return out;   // apex, row 2 (2), row 3 (3: index 4 is the middle), row 4 (2), back

	}
	function shuffle(a, rand) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
	function rackSnooker(T, reds, rand, x, y, k) {
		var sp = spots(T);
		x.push(sp[4][0] - 0.1); y.push(0.12); k.push(0);
		var rows = reds === 15 ? 5 : 3, apex = sp[6][0] + 2 * T.R + 0.002;
		var pos = triangle(T, rows, apex, rand);
		for (var i = 0; i < reds; i++) { x.push(pos[i][0]); y.push(pos[i][1]); k.push(1); }
		for (var v = 2; v <= 7; v++) { x.push(sp[v][0]); y.push(sp[v][1]); k.push(v); }
	}

	B.create = function (v, seed) {
		var g = B.game(v);
		if (!g) return null;
		var T = B.TABLES[g.table], rand = rng(v + "|" + (seed || "")), x = [], y = [], k = [];
		if (g.type === "S") rackSnooker(T, g.reds, rand, x, y, k);
		else if (g.type === "P") { if (g.rack === "S15") rackSnooker(T, 15, rand, x, y, k); else rackPool(T, g.rack, rand, x, y, k); }
		else if (g.type === "C") {
			var c = g.ch;
			x.push(c.cue[0] * T.L); y.push(c.cue[1] * T.W); k.push(0);
			c.balls.forEach(function (b) { x.push(b[1] * T.L); y.push(b[2] * T.W); k.push(b[0]); });
		} else rackPool(T, g.type, rand, x, y, k);
		var n = x.length, on = [];
		for (var i = 0; i < n; i++) on.push(1);
		var s = {
			v: v, seed: String(seed || ""), g: g, T: T, x: x, y: y, on: on, k: k, n: n,
			np: g.np, turn: 0, hist: [], win: null,
			bih: g.type === "C" ? false : true,                                  // ball in hand?
			zone: g.type === "S" || (g.type === "P" && g.rack === "S15") ? "D" : g.type === "C" ? "any" : "kitchen",
			brk: g.type !== "C" && g.type !== "S" && !(g.type === "P" && g.rack === "S15") ? true : false,
			open: true, grp: [null, null], score: [0, 0], run: 0, best: [0, 0], on2: "red", shots: [0, 0], pots: [0, 0], fouls: [0, 0],
			msg: "", last: null, reblack: false
		};
		if (g.type === "S") s.brk = true;   // the first shot of a frame (the break-off)
		return s;
	};
	B.clone = function (s) {
		var o = {};
		for (var key in s) {
			var val = s[key];
			o[key] = Array.isArray(val) ? val.slice() : (val && typeof val === "object" && key !== "g" && key !== "T") ? JSON.parse(JSON.stringify(val)) : val;
		}
		return o;
	};

	/* ======================================================= shot strings ======================================================= */
	function i36(n) { return (n < 0 ? "-" : "") + Math.abs(n).toString(36); }
	function p36(s) { if (!/^-?[0-9a-z]{1,7}$/.test(s)) return NaN; var neg = s[0] === "-", v = parseInt(neg ? s.slice(1) : s, 36); return neg ? -v : v; }
	B.sstr = function (o) { var f = [i36(o.a), i36(o.p), i36(o.sx || 0), i36(o.sy || 0)]; if (o.bx !== undefined && o.bx !== null) f.push(i36(o.bx), i36(o.by)); return f.join("~"); };
	B.sparse = function (str) {
		var f = String(str || "").split("~");
		if (f.length !== 4 && f.length !== 6) return null;
		var n = f.map(p36);
		for (var i = 0; i < n.length; i++) if (isNaN(n[i])) return null;
		var o = { a: n[0], p: n[1], sx: n[2], sy: n[3] };
		if (o.a < 0 || o.a >= 3600000 || o.p < 1 || o.p > 1000 || o.sx < -100 || o.sx > 100 || o.sy < -100 || o.sy > 100) return null;
		if (o.sx * o.sx + o.sy * o.sy > 10000) return null;            // the tip must touch the ball (inside the circle)
		if (f.length === 6) { o.bx = n[4]; o.by = n[5]; if (Math.abs(o.bx) > 30000 || Math.abs(o.by) > 30000) return null; }
		return o;
	};
	B.VMAX = 9;   // cue ball speed at full power, m/s
	B.speedOf = function (p) { return B.VMAX * p / 1000; };
	B.powerFor = function (v) { return Math.max(1, Math.min(1000, Math.round(v * 1000 / B.VMAX))); };

	/* ======================================================= the simulation ======================================================= */
	var DT = 0.0005, FRAME = 33, GRAV = 9.81, MAXT = 60;
	function geometry(T) {
		if (T._geo) return T._geo;
		var L = T.L / 2, W = T.W / 2, g = T.mc / 1.4142135623730951, h = T.ms / 2;
		// rail segments (a -> b along the cushion nose) with the inward normal
		var segs = [
			[-L + g, -W, -h, -W, 0, 1], [h, -W, L - g, -W, 0, 1],      // top long rail (y = -W)
			[-L + g, W, -h, W, 0, -1], [h, W, L - g, W, 0, -1],        // bottom long rail
			[-L, -W + g, -L, W - g, 1, 0],                            // head (left) end
			[L, -W + g, L, W - g, -1, 0]                              // foot (right) end
		];
		var pts = [];
		segs.forEach(function (sg) { pts.push([sg[0], sg[1]], [sg[2], sg[3]]); });
		var pockets = [[-L, -W, 1], [0, -W, 0], [L, -W, 1], [-L, W, 1], [0, W, 0], [L, W, 1]];   // [x, y, corner?]
		T._geo = { segs: segs, pts: pts, pockets: pockets, g: g, h: h, L: L, W: W };
		return T._geo;
	}
	B.geometry = geometry;
	function potCheck(T, G, px, py) {
		var R = T.R, L = G.L, W = G.W, lim = 0.6 * R;
		if (px > L + lim || px < -L - lim || py > W + lim || py < -W - lim) return pocketAt(G, px, py);
		// corner mouths: past the line between the two jaw points by 0.4 R
		var ax = px < 0 ? -px : px, ay = py < 0 ? -py : py;
		var d = ((ax - (L - G.g / 2)) + (ay - (W - G.g / 2))) * 0.7071067811865476;
		if (d > 0.4 * R && ax > L - G.g && ay > W - G.g) return pocketAt(G, px, py);
		return -1;
	}
	function pocketAt(G, px, py) {
		var best = -1, bd = 1e9;
		for (var i = 0; i < 6; i++) { var q = G.pockets[i], dx = px - q[0], dy = py - q[1], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
		return best;
	}
	/**
	 * Simulate one shot. s: state (x, y, on are read, not changed); shot: parsed shot (cue ball already placed in s.x[0], s.y[0]).
	 * opts.frames: record positions for drawing. -> {x, y, on (final), ev: [{t, e: "hit"|"rail"|"pot", a, b, v}], frames: [Float32Array], t}
	 */
	B.simulate = function (s, shot, opts) {
		opts = opts || {};
		var T = s.T, G = geometry(T), n = s.n, R = T.R, i, j;
		var x = new Float64Array(n), y = new Float64Array(n), vx = new Float64Array(n), vy = new Float64Array(n),
			wx = new Float64Array(n), wy = new Float64Array(n), wz = new Float64Array(n), on = new Uint8Array(n), mv = new Uint8Array(n);
		for (i = 0; i < n; i++) { x[i] = s.x[i]; y[i] = s.y[i]; on[i] = s.on[i]; }
		// the cue strike
		var sc = dsc(shot.a), dxs = sc[1], dys = sc[0], v0 = B.speedOf(shot.p);
		var top = 1.25 * v0 * (shot.sy / 100) / R, side = -1.25 * v0 * (shot.sx / 100) / R;
		vx[0] = dxs * v0; vy[0] = dys * v0; wx[0] = -dys * top; wy[0] = dxs * top; wz[0] = side; mv[0] = 1;
		var ev = [], frames = opts.frames ? [] : null, step = 0, t = 0, maxSteps = Math.round(MAXT / DT);
		var fs = T.mus * GRAV * DT, rs = T.mur * GRAV * DT, zs = 35 * DT, e = T.e, eb = T.eb, R2 = 4 * R * R, invR = 1 / R;
		var railX = G.L - R - 0.004, railY = G.W - R - 0.004;
		function frame() { var f = new Float32Array(n * 3); for (var q = 0; q < n; q++) { f[q * 3] = x[q]; f[q * 3 + 1] = y[q]; f[q * 3 + 2] = on[q]; } frames.push(f); }
		if (frames) frame();
		var anyMoving = true;
		while (anyMoving && step < maxSteps) {
			step++; t = step * DT;
			anyMoving = false;
			for (i = 0; i < n; i++) {
				if (!on[i] || !mv[i]) continue;
				// cloth friction
				var ux = vx[i] - R * wy[i], uy = vy[i] + R * wx[i], us = Math.sqrt(ux * ux + uy * uy);
				if (us > 1e-9) {
					// sliding: friction against the slip; the slip shrinks 3.5 times faster than the speed changes, so when it would
					// pass zero this step take exactly the change that makes the ball roll (keeps the angular momentum right)
					var k2 = us > 3.5 * fs ? fs / us : 1 / 3.5;
					var ax = -k2 * ux, ay = -k2 * uy;
					vx[i] += ax; vy[i] += ay; wx[i] += 2.5 * ay * invR; wy[i] -= 2.5 * ax * invR;
					if (k2 === 1 / 3.5) { wy[i] = vx[i] * invR; wx[i] = -vy[i] * invR; }
				} else {
					var sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
					if (sp <= rs) { vx[i] = 0; vy[i] = 0; wx[i] = 0; wy[i] = 0; }
					else { var f = (sp - rs) / sp; vx[i] *= f; vy[i] *= f; wy[i] = vx[i] * invR; wx[i] = -vy[i] * invR; }
				}
				if (wz[i] > zs) wz[i] -= zs; else if (wz[i] < -zs) wz[i] += zs; else wz[i] = 0;
				if (vx[i] === 0 && vy[i] === 0 && wx[i] === 0 && wy[i] === 0) { mv[i] = 0; wz[i] = 0; continue; }
				x[i] += vx[i] * DT; y[i] += vy[i] * DT;
				anyMoving = true;
				// cushions + jaws (only near the edge)
				var px = x[i], py = y[i];
				if (px > railX || px < -railX || py > railY || py < -railY) {
					var hit = false;
					for (j = 0; j < 6 && !hit; j++) {
						var sg = G.segs[j], nx = sg[4], ny = sg[5];
						var dist = (px - sg[0]) * nx + (py - sg[1]) * ny;
						if (dist >= R || dist < -R) continue;
						var along = nx === 0 ? px : py, lo = nx === 0 ? Math.min(sg[0], sg[2]) : Math.min(sg[1], sg[3]), hi = nx === 0 ? Math.max(sg[0], sg[2]) : Math.max(sg[1], sg[3]);
						if (along < lo || along > hi) continue;
						var vn = vx[i] * nx + vy[i] * ny;
						if (vn >= 0) continue;
						cushion(i, nx, ny, vn, e);
						x[i] += nx * (R - dist); y[i] += ny * (R - dist);
						ev.push({ t: t, e: "rail", a: i, v: -vn }); hit = true;
					}
					for (j = 0; j < G.pts.length && !hit; j++) {
						var q = G.pts[j], qx = px - q[0], qy = py - q[1], dd = qx * qx + qy * qy;
						if (dd >= R * R || dd === 0) continue;
						var dl = Math.sqrt(dd), mx = qx / dl, my = qy / dl, vn2 = vx[i] * mx + vy[i] * my;
						if (vn2 >= 0) continue;
						cushion(i, mx, my, vn2, e * 0.8);
						x[i] = q[0] + mx * R; y[i] = q[1] + my * R;
						ev.push({ t: t, e: "rail", a: i, v: -vn2, jaw: 1 }); hit = true;
					}
					var pk = potCheck(T, G, x[i], y[i]);
					if (pk >= 0) { on[i] = 0; mv[i] = 0; vx[i] = vy[i] = wx[i] = wy[i] = wz[i] = 0; ev.push({ t: t, e: "pot", a: i, b: pk }); }
				}
			}
			// ball-ball collisions
			for (i = 0; i < n; i++) {
				if (!on[i]) continue;
				for (j = i + 1; j < n; j++) {
					if (!on[j] || (!mv[i] && !mv[j])) continue;
					var ddx = x[j] - x[i]; if (ddx >= 2 * R || ddx <= -2 * R) continue;
					var ddy = y[j] - y[i]; if (ddy >= 2 * R || ddy <= -2 * R) continue;
					var d2 = ddx * ddx + ddy * ddy;
					if (d2 >= R2 || d2 === 0) continue;
					var d = Math.sqrt(d2), cx = ddx / d, cy = ddy / d;
					var rel = (vx[i] - vx[j]) * cx + (vy[i] - vy[j]) * cy;
					if (rel > 0) {
						var J = (1 + eb) * 0.5 * rel;
						vx[i] -= J * cx; vy[i] -= J * cy; vx[j] += J * cx; vy[j] += J * cy;
						mv[i] = 1; mv[j] = 1;
						ev.push({ t: t, e: "hit", a: i, b: j, v: rel });
					}
					var push = (2 * R - d) * 0.5;
					x[i] -= cx * push; y[i] -= cy * push; x[j] += cx * push; y[j] += cy * push;
					anyMoving = true;
				}
			}
			if (frames && step % FRAME === 0) frame();
		}
		if (frames) frame();
		function cushion(b, nx, ny, vn, ee) {
			var tx = -ny, ty = nx, vt = vx[b] * tx + vy[b] * ty;
			var slip = vt - R * wz[b], Jt = -slip / 3.5, lim = T.muc * (1 + ee) * -vn;
			if (Jt > lim) Jt = lim; else if (Jt < -lim) Jt = -lim;
			var vtn = vt + Jt, vnn = -ee * vn;
			vx[b] = nx * vnn + tx * vtn; vy[b] = ny * vnn + ty * vtn;
			wz[b] += -2.5 * Jt * invR;
			// the rolling spin about the tangent axis is mostly killed and turned around by the cushion
			var wt = wx[b] * tx + wy[b] * ty, wn = wx[b] * nx + wy[b] * ny;
			wt = -0.3 * wt;
			wx[b] = tx * wt + nx * wn; wy[b] = ty * wt + ny * wn;
			mv[b] = 1;
		}
		var ox = [], oy = [], oon = [];
		for (i = 0; i < n; i++) { ox.push(x[i]); oy.push(y[i]); oon.push(on[i]); }
		return { x: ox, y: oy, on: oon, ev: ev, frames: frames, t: t, steps: step };
	};

	/* ======================================================= placing the cue ball ======================================================= */
	B.zoneName = function (z) { return z === "D" ? "inside the D" : z === "kitchen" ? "behind the head string (the left quarter)" : "anywhere"; };
	B.placeOk = function (s, px, py) {
		var T = s.T, R = T.R, L = T.L / 2, W = T.W / 2;
		if (!(px > -L + R && px < L - R && py > -W + R && py < W - R)) return false;
		if (s.zone === "kitchen" && px > -T.L / 4) return false;
		if (s.zone === "D") {
			var bx = -L + T.baulk, dx = px - bx;
			if (px > bx || dx * dx + py * py > T.dR * T.dR) return false;
		}
		for (var i = 1; i < s.n; i++) if (s.on[i]) { var ex = s.x[i] - px, ey = s.y[i] - py; if (ex * ex + ey * ey < 4 * R * R * 1.0001) return false; }
		return true;
	};

	/* ======================================================= rules ======================================================= */
	function isPool(s) { return s.g.table === "pool" && s.g.type !== "P" && s.g.type !== "C"; }
	function snk(s) { return s.g.type === "S"; }
	B.snookerOn = function (s) {    // "red" | "colour" | 2..7
		var reds = 0;
		for (var i = 1; i < s.n; i++) if (s.on[i] && s.k[i] === 1) reds++;
		if (s.on2 === "colour") return "colour";
		if (reds) return "red";
		for (var v = 2; v <= 7; v++) for (i = 1; i < s.n; i++) if (s.on[i] && s.k[i] === v) return v;
		return 0;
	};
	B.groupOf = function (k) { return k >= 1 && k <= 7 ? "s" : k >= 9 && k <= 15 ? "t" : k === 8 ? "8" : ""; };
	/** balls the player may legally hit first (ids), and the money ball */
	B.targets = function (s) {
		var out = [], i, t = s.g.type;
		if (t === "8") {
			var gr = s.grp[s.turn];
			for (i = 1; i < s.n; i++) if (s.on[i]) {
				var gk = B.groupOf(s.k[i]);
				if (s.open || s.brk) { if (gk !== "8" || s.brk) out.push(i); }
				else if (gk === gr) out.push(i);
			}
			if (!s.open && !s.brk && !out.length) for (i = 1; i < s.n; i++) if (s.on[i] && s.k[i] === 8) out.push(i);
			if (s.open && !s.brk && !out.length) for (i = 1; i < s.n; i++) if (s.on[i]) out.push(i);
		} else if (t === "9" || t === "10") {
			var low = 99, li = -1;
			for (i = 1; i < s.n; i++) if (s.on[i] && s.k[i] < low) { low = s.k[i]; li = i; }
			if (li >= 0) out.push(li);
		} else if (t === "S") {
			var on = B.snookerOn(s);
			for (i = 1; i < s.n; i++) if (s.on[i]) {
				if (on === "red" ? s.k[i] === 1 : on === "colour" ? s.k[i] >= 2 : s.k[i] === on) out.push(i);
			}
		} else {
			for (i = 1; i < s.n; i++) if (s.on[i]) out.push(i);
		}
		return out;
	};
	B.isLegal = function (s, shot) {
		if (!shot || s.win) return false;
		var chk = B.sparse(B.sstr(shot));     // every field a whole number in range
		if (!chk || chk.a !== shot.a || chk.p !== shot.p || chk.sx !== (shot.sx || 0) || chk.sy !== (shot.sy || 0)) return false;
		var has = shot.bx !== undefined && shot.bx !== null;
		if (s.bih !== has) return false;
		if (has && !B.placeOk(s, shot.bx / 10000, shot.by / 10000)) return false;
		return true;
	};
	function respotPool(s, i) {
		var T = s.T, R = T.R, px = T.L / 4, py = 0;
		for (var tries = 0; tries < 400; tries++) {
			var ok = true;
			for (var j = 0; j < s.n; j++) if (j !== i && s.on[j]) { var dx = s.x[j] - px, dy = s.y[j] - py; if (dx * dx + dy * dy < 4 * R * R) { ok = false; break; } }
			if (ok && px < T.L / 2 - R) break;
			px += R * 0.25;
			if (px > T.L / 2 - R) { px = T.L / 4 - R * 0.25 * (tries - 0); }
		}
		s.x[i] = px; s.y[i] = py; s.on[i] = 1;
	}
	function respotSnk(s, i) {
		var T = s.T, R = T.R, sp = spots(T), v = s.k[i];
		var free = function (px, py) { for (var j = 0; j < s.n; j++) if (j !== i && s.on[j]) { var dx = s.x[j] - px, dy = s.y[j] - py; if (dx * dx + dy * dy < 4 * R * R) return false; } return true; };
		var p = sp[v];
		if (!free(p[0], p[1])) {
			var found = null;
			for (var w = 7; w >= 2 && !found; w--) if (free(sp[w][0], sp[w][1])) found = sp[w];
			if (found) p = found;
			else { var px = sp[v][0]; while (px < T.L / 2 - R && !free(px, 0)) px += R * 0.2; p = [px, 0]; }
		}
		s.x[i] = p[0]; s.y[i] = p[1]; s.on[i] = 1;
	}
	B.playerLabel = function (s, p) {
		if (s.g.type === "8" && s.grp[p]) return s.grp[p] === "s" ? "solids" : "stripes";
		return "";
	};
	/**
	 * Play a shot: place the cue ball (ball in hand), simulate, apply the rules. Returns {sim, foul, msg, pots, cont} or null when illegal.
	 * opts.frames: keep the frames for drawing.
	 */
	B.apply = function (s, shot, opts) {
		if (typeof shot === "string") shot = B.sparse(shot);
		if (!B.isLegal(s, shot)) return null;
		var p = s.turn, g = s.g, type = g.type, i;
		if (s.bih) { s.x[0] = shot.bx / 10000; s.y[0] = shot.by / 10000; s.on[0] = 1; }
		var before = s.on.slice(), targets = B.targets(s), onBall = type === "S" ? B.snookerOn(s) : null;
		var sim = B.simulate(s, shot, opts);
		s.x = sim.x; s.y = sim.y; s.on = sim.on;
		s.hist.push(B.sstr(shot));
		s.shots[p]++;
		// what happened
		var first = -1, tFirst = 0, railAfter = false, pots = [], cuePot = false;
		sim.ev.forEach(function (e) {
			if (e.e === "hit" && first < 0 && (e.a === 0 || e.b === 0)) { first = e.a === 0 ? e.b : e.a; tFirst = e.t; }
			else if (e.e === "rail" && first >= 0 && e.t >= tFirst) railAfter = true;
			else if (e.e === "pot") { if (e.a === 0) cuePot = true; else pots.push(e.a); }
		});
		var res = { sim: sim, foul: "", msg: "", pots: pots, cue: cuePot, first: first, cont: false, player: p };
		var wasBreak = s.brk;
		s.brk = false; s.bih = false;
		var opp = s.np === 2 ? 1 - p : p;
		var K = function (id) { return s.k[id]; };
		if (type === "8") rules8();
		else if (type === "9" || type === "10") rules9();
		else if (type === "S") rulesSnk();
		else rulesSolo();
		s.pots[p] += pots.length;
		if (res.foul) s.fouls[p]++;
		s.last = { p: p, foul: res.foul, pots: pots.slice(), cue: cuePot, first: first, msg: res.msg };
		s.msg = res.msg;
		return res;

		function passTurn(foul) {
			if (foul) { s.bih = true; }
			if (cuePot) { s.bih = true; s.on[0] = 0; }
			s.turn = opp;
		}
		function rules8() {
			var gr = s.grp[p], eight = pots.some(function (id) { return K(id) === 8; });
			var cleared = gr && !s.on.some(function (o, id) { return o && id > 0 && B.groupOf(K(id)) === gr; });
			var groupBefore = gr && before.some(function (o, id) { return o && id > 0 && B.groupOf(K(id)) === gr; });
			var objPots = pots.filter(function (id) { return K(id) !== 8; });
			if (wasBreak) {
				if (cuePot) res.foul = "the cue ball went in on the break";
				else if (first < 0) res.foul = "no ball was hit";
				if (eight) { respotPool(s, pots.filter(function (id) { return K(id) === 8; })[0]); res.msg = "The 8 went in on the break: it goes back on its spot. "; }
				s.open = true;
				if (!res.foul && objPots.length) { res.cont = true; res.msg += "Good break: " + objPots.length + " in, play on. The table is open."; }
				else if (res.foul) { res.msg += "Foul: " + res.foul + ". Ball in hand."; passTurn(true); }
				else { res.msg += "Nothing went in. The table is open."; passTurn(false); }
				return;
			}
			if (cuePot) res.foul = "the cue ball went in";
			else if (first < 0) res.foul = "no ball was hit";
			else if (s.open && K(first) === 8) res.foul = "the 8 was hit first on an open table";
			else if (!s.open && targets.indexOf(first) < 0) res.foul = "the wrong ball was hit first (" + (gr === "s" ? "a solid" : "a stripe") + (groupBefore ? "" : " or the 8") + " should be hit first)";
			else if (!railAfter && !pots.length) res.foul = "no ball touched a cushion after the hit";
			if (eight) {
				var ok = !res.foul && !s.open && !groupBefore;
				s.win = { p: ok ? p : opp, why: ok ? "8" : "8foul" };
				res.msg = ok ? "The 8 goes in: game over." : "The 8 went in " + (res.foul ? "with a foul (" + res.foul + ")" : "too early") + ": that loses the game.";
				return;
			}
			if (res.foul) { res.msg = "Foul: " + res.foul + ". Ball in hand."; passTurn(true); return; }
			if (s.open && objPots.length) {
				var gk = B.groupOf(K(objPots[0]));
				s.grp[p] = gk; s.grp[opp] = gk === "s" ? "t" : "s"; s.open = false; gr = gk;
				res.msg = "You have the " + (gk === "s" ? "solids (1-7)" : "stripes (9-15)") + ". ";
			}
			var mine = objPots.filter(function (id) { return B.groupOf(K(id)) === gr; });
			if (mine.length) { res.cont = true; res.msg += mine.length > 1 ? mine.length + " in, play on." : "In, play on."; }
			else { res.msg += objPots.length ? "Only the other group's ball went in." : "Nothing went in."; passTurn(false); }
		}
		function rules9() {
			var money = type === "9" ? 9 : 10, low = targets[0];
			var mPot = pots.some(function (id) { return K(id) === money; });
			if (cuePot) res.foul = "the cue ball went in";
			else if (first < 0) res.foul = "no ball was hit";
			else if (first !== low) res.foul = "the " + K(low) + " had to be hit first";
			else if (!wasBreak && !railAfter && !pots.length) res.foul = "no ball touched a cushion after the hit";
			if (mPot && !res.foul) { s.win = { p: p, why: "money" }; res.msg = "The " + money + " goes in: game over."; return; }
			if (mPot) { respotPool(s, pots.filter(function (id) { return K(id) === money; })[0]); }
			if (res.foul) { res.msg = "Foul: " + res.foul + "." + (mPot ? " The " + money + " goes back on its spot." : "") + " Ball in hand."; passTurn(true); return; }
			if (pots.length) { res.cont = true; res.msg = (wasBreak ? "Good break, " : "") + (pots.length > 1 ? pots.length + " in, play on." : "In, play on."); }
			else { res.msg = wasBreak ? "Nothing went in on the break." : "Nothing went in."; passTurn(false); }
		}
		function rulesSnk() {
			var val = function (id) { return id < 0 ? 0 : K(id); };
			var nominated = onBall === "colour" && first >= 0 && K(first) >= 2 ? first : -1;
			var legalFirst = first >= 0 && (onBall === "red" ? K(first) === 1 : onBall === "colour" ? K(first) >= 2 : K(first) === onBall);
			var badPots = pots.filter(function (id) {
				if (onBall === "red") return K(id) !== 1;
				if (onBall === "colour") return id !== nominated;
				return K(id) !== onBall;
			});
			if (cuePot) res.foul = "the cue ball went in";
			else if (first < 0) res.foul = "no ball was hit";
			else if (!legalFirst) res.foul = "the " + B.SNK_NAMES[K(first)] + " was hit first (" + (onBall === "red" ? "a red" : onBall === "colour" ? "a colour" : "the " + B.SNK_NAMES[onBall]) + " was on)";
			else if (badPots.length) res.foul = "the " + B.SNK_NAMES[K(badPots[0])] + " went in";
			var onVal = onBall === "red" ? 1 : onBall === "colour" ? (nominated >= 0 ? K(nominated) : 0) : onBall;
			var reds = function () { return s.on.some(function (o, id) { return o && id > 0 && K(id) === 1; }); };
			var lastBlack = onBall === 7;
			if (res.foul) {
				var fv = Math.max(4, onVal, val(first), Math.max.apply(null, [0].concat(pots.map(val))));
				s.score[opp] += fv;
				pots.forEach(function (id) { if (K(id) >= 2) respotSnk(s, id); });
				// a foul when only the black is left ends the frame (unless it puts the scores level)
				if (lastBlack && s.score[0] !== s.score[1]) { endFrame("Foul: " + res.foul + ". " + fv + " points to the other player, and with only the black left that ends the frame."); return; }
				s.run = 0; s.on2 = "red";
				res.msg = "Foul: " + res.foul + ". " + fv + " points to the other player." + (cuePot ? " Ball in hand in the D." : "");
				passTurn(true);
				s.bih = cuePot;          // in snooker the next player plays from where the cue ball stopped, unless it went in
				return;
			}
			if (!pots.length) {
				s.run = 0; s.on2 = "red";
				res.msg = "No score.";
				passTurn(false);
				return;
			}
			var pts = 0;
			pots.forEach(function (id) { pts += K(id); });
			s.score[p] += pts; s.run += pts; if (s.run > s.best[p]) s.best[p] = s.run;
			res.cont = true;
			if (onBall === "red") { s.on2 = "colour"; res.msg = "+" + pts + " (break " + s.run + "). Now a colour."; return; }
			if (onBall === "colour") {
				respotSnk(s, nominated);
				s.on2 = "red";
				res.msg = "+" + pts + " (break " + s.run + "). " + (reds() ? "Now a red." : "The reds are gone: now the colours in order, yellow first.");
				return;
			}
			// the colours in order
			if (onBall === 7) { endFrame("The black goes in."); return; }
			res.msg = "+" + pts + " (break " + s.run + "). Now the " + B.SNK_NAMES[onBall + 1] + ".";
		}
		function endFrame(text) {
			if (s.score[0] === s.score[1]) {
				// level after the last black: the black goes back on its spot and the other player starts with the cue ball in hand in the D
				for (var b = 1; b < s.n; b++) if (K(b) === 7) respotSnk(s, b);
				s.on[0] = 0; s.bih = true; s.reblack = true; s.run = 0; s.on2 = "red";
				res.msg = text + " Scores level: the black is re-spotted.";
				s.turn = opp;
				return;
			}
			s.win = { p: s.score[0] > s.score[1] ? 0 : 1, why: "frame" };
			res.msg = text + " Frame over.";
		}
		function rulesSolo() {
			var left = 0;
			for (i = 1; i < s.n; i++) if (s.on[i]) left++;
			var ch = type === "C" ? g.ch : null;
			if (ch) {
				var need = (ch.targets || null);
				var targetLeft = s.on.some(function (o, id) { return o && id > 0 && (!need || need.indexOf(K(id)) >= 0); });
				if (cuePot) { s.win = { p: -1, why: "fail" }; res.msg = "The cue ball went in: challenge failed. Try again!"; return; }
				if (!targetLeft) { s.win = { p: 0, why: "done" }; res.msg = "Challenge complete in " + s.shots[0] + " shot" + (s.shots[0] > 1 ? "s" : "") + "!"; return; }
				if (s.shots[0] >= ch.shots) { s.win = { p: -1, why: "fail" }; res.msg = "Out of shots: challenge failed. Try again!"; return; }
				res.msg = pots.length ? "In! " + (ch.shots - s.shots[0]) + " shot" + (ch.shots - s.shots[0] > 1 ? "s" : "") + " left." : "Missed. " + (ch.shots - s.shots[0]) + " shot" + (ch.shots - s.shots[0] > 1 ? "s" : "") + " left.";
				return;
			}
			if (cuePot) { s.bih = true; s.on[0] = 0; s.zone = s.g.rack === "S15" ? "D" : "any"; res.msg = "The cue ball went in: put it back anywhere."; }
			else res.msg = pots.length ? (pots.length > 1 ? pots.length + " in." : "In.") : "Nothing went in.";
			if (s.g.rack !== "S15") s.zone = "any";
			if (!left) { s.win = { p: 0, why: "clear" }; res.msg = "Table cleared in " + s.shots[0] + " shots!"; }
		}
	};
	// after the first shot the ball-in-hand zone is "anywhere" in pool (fouls), the D in snooker
	var _apply = B.apply;
	B.apply = function (s, shot, opts) {
		var r = _apply(s, shot, opts);
		if (r && s.g.table === "pool" && s.g.type !== "C") s.zone = "any";
		if (r && s.g.type === "S") s.zone = "D";
		return r;
	};
	B.replay = function (v, seed, shots) {
		var s = B.create(v, seed);
		if (!s) return null;
		for (var i = 0; i < shots.length; i++) if (!B.apply(s, shots[i])) return null;
		return s;
	};
	/** the state as plain JSON (the server keeps it between shots) and back: exact doubles survive JSON */
	var PACK = ["x", "y", "on", "turn", "hist", "win", "bih", "zone", "brk", "open", "grp", "score", "run", "best", "on2", "shots", "pots", "fouls", "msg", "last", "reblack"];
	B.pack = function (s) { var o = { v: s.v, seed: s.seed }; PACK.forEach(function (k) { o[k] = s[k]; }); return JSON.stringify(o); };
	B.unpack = function (str) {
		var o = typeof str === "string" ? JSON.parse(str) : str, s = B.create(o.v, o.seed);
		if (!s) return null;
		PACK.forEach(function (k) { if (o[k] !== undefined) s[k] = o[k]; });
		return s;
	};
	/** a short fingerprint of the ball positions (checks that two browsers agree) */
	B.hash = function (s) {
		var h = 2166136261 >>> 0, dv = new DataView(new ArrayBuffer(8));
		for (var i = 0; i < s.n; i++) {
			dv.setFloat64(0, s.on[i] ? s.x[i] : 9); h = Math.imul(h ^ dv.getUint32(0), 16777619) >>> 0; h = Math.imul(h ^ dv.getUint32(4), 16777619) >>> 0;
			dv.setFloat64(0, s.on[i] ? s.y[i] : 9); h = Math.imul(h ^ dv.getUint32(0), 16777619) >>> 0; h = Math.imul(h ^ dv.getUint32(4), 16777619) >>> 0;
		}
		return ("0000000" + h.toString(16)).slice(-8);
	};
	/** points left on the table (snooker) */
	B.pointsLeft = function (s) {
		var reds = 0, cols = 0, i;
		for (i = 1; i < s.n; i++) if (s.on[i]) { if (s.k[i] === 1) reds++; else cols += s.k[i]; }
		return reds * 8 + cols + (s.on2 === "colour" ? 7 : 0);
	};
	B.ballsLeft = function (s, grp) { var c = 0; for (var i = 1; i < s.n; i++) if (s.on[i] && (!grp || B.groupOf(s.k[i]) === grp)) c++; return c; };

	/* ======================================================= the computer ======================================================= */
	B.LEVELS = {
		easy: { k: 3, aim: 1.7, pow: 0.16, spin: false, safe: 6 },
		medium: { k: 6, aim: 0.65, pow: 0.08, spin: true, safe: 10 },
		hard: { k: 10, aim: 0.22, pow: 0.04, spin: true, safe: 16 },
		pro: { k: 14, aim: 0.07, pow: 0.02, spin: true, safe: 22 }
	};
	function aimPoints(s) {    // where to send an object ball for each pocket (a little inside the mouth)
		var G = geometry(s.T), R = s.T.R;
		return G.pockets.map(function (q) {
			if (q[2]) return [q[0], q[1], 1];
			return [q[0], q[1] + (q[1] < 0 ? -R : R), 0];
		});
	}
	function clearPath(s, ax, ay, bx, by, skip1, skip2, wid) {
		var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, R = s.T.R, w = wid || 2 * R;
		if (L2 === 0) return true;
		for (var i = 0; i < s.n; i++) {
			if (!s.on[i] || i === skip1 || i === skip2) continue;
			var t = ((s.x[i] - ax) * dx + (s.y[i] - ay) * dy) / L2;
			if (t < 0 || t > 1) continue;
			var px = ax + t * dx - s.x[i], py = ay + t * dy - s.y[i];
			if (px * px + py * py < w * w * 0.98) return false;
		}
		return true;
	}
	/** possible pots from cue position (cx, cy): [{b, pk, gx, gy, cut, d1, d2, score}] best first */
	B.candidates = function (s, cx, cy, tg) {
		var R = s.T.R, out = [], aps = aimPoints(s);
		tg = tg || B.targets(s);
		tg.forEach(function (b) {
			var bx = s.x[b], by = s.y[b];
			aps.forEach(function (ap, pk) {
				var ox = ap[0] - bx, oy = ap[1] - by, d2 = Math.sqrt(ox * ox + oy * oy);
				if (d2 < 1e-6) return;
				ox /= d2; oy /= d2;
				if (!ap[2] && Math.abs(oy) < 0.42) return;               // middle pockets need a fairly straight approach
				var gx = bx - ox * 2 * R, gy = by - oy * 2 * R;
				var cxv = gx - cx, cyv = gy - cy, d1 = Math.sqrt(cxv * cxv + cyv * cyv);
				if (d1 < 1e-6) return;
				var cosc = (cxv * ox + cyv * oy) / d1;
				if (cosc < 0.17) return;                                  // cut over ~80 degrees
				if (!clearPath(s, cx, cy, gx, gy, 0, b) || !clearPath(s, bx, by, ap[0], ap[1], b, 0)) return;
				var cut = Math.acos(Math.min(1, cosc));
				var score = cosc * cosc / (0.4 + d1 * 0.6 + d2 * 1.1) * (ap[2] ? 1 : 0.85);
				out.push({ b: b, pk: pk, gx: gx, gy: gy, cut: cut, d1: d1, d2: d2, score: score, cosc: cosc });
			});
		});
		out.sort(function (a, b) { return b.score - a.score; });
		return out;
	};
	function speedFor(c) {   // cue ball speed so the object ball reaches the pocket with a little to spare
		var dec = 0.11, vo = Math.sqrt(2 * dec * (c.d2 + 0.35)) / 0.975;
		var vc = vo / Math.max(0.25, c.cosc) + Math.sqrt(2 * dec * c.d1) * 0.9 + 0.25;
		return vc;
	}
	function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
	/** how good a position is for the player to move (0 = nothing easy) */
	function posValue(s) {
		if (s.win) return 0;
		if (s.bih) return 2.5;
		var c = B.candidates(s, s.x[0], s.y[0]);
		var v = 0;
		for (var i = 0; i < c.length && i < 3; i++) v += c[i].score * (i === 0 ? 1 : 0.3);
		return v;
	}
	B.posValue = posValue;
	function evalAfter(s0, shot, me) {
		var s = B.clone(s0), r = B.apply(s, shot);
		if (!r) return { v: -1e9 };
		var v;
		if (s.win) v = s.win.p === me ? 1000 : -1000;
		else if (s.turn === me) v = 100 + posValue(s) * 40 + (s.g.type === "S" ? r.pots.reduce(function (a, id) { return a + s.k[id]; }, 0) * 3 : r.pots.length * 2);
		else v = (r.foul ? -60 : 0) - posValue(s) * 40 + (s.g.type === "S" ? (s.score[me] - s0.score[me]) - (s.score[1 - me] - s0.score[1 - me]) : 0);
		return { v: v, r: r, s: s };
	}
	/**
	 * The computer's shot. level: easy | medium | hard | pro; rand: a random function (Math.random). -> shot object
	 */
	B.ai = function (s, level, rand) {
		rand = rand || Math.random;
		var Lv = B.LEVELS[level] || B.LEVELS.medium, me = s.turn, T = s.T, R = T.R, best = null, tries = [], i;
		var tg = B.targets(s);
		function consider(shot) {
			var e = evalAfter(s, shot, me);
			tries.push(1);
			if (!best || e.v > best.v) best = { v: e.v, shot: shot };
		}
		function mk(cx, cy, gx, gy, v, sx, sy, place) {
			var o = { a: B.angleOf(gx - cx, gy - cy), p: B.powerFor(v), sx: sx || 0, sy: sy || 0 };
			if (place) { o.bx = Math.round(cx * 10000); o.by = Math.round(cy * 10000); }
			return o;
		}
		// the break
		if (s.brk && s.g.type !== "S") {
			var px = -T.L / 4 - 0.05, py = (rand() - 0.5) * T.W * 0.4;
			var apex = 1; for (i = 1; i < s.n; i++) if (s.on[i] && s.x[i] < s.x[apex]) apex = i;
			var shotB = mk(px, py, s.x[apex] - 0.002 + (rand() - 0.5) * 0.004, s.y[apex] + (rand() - 0.5) * 0.006, 8.4 + rand() * 0.5, 0, -10, true);
			if (!B.placeOk(s, px, py)) { shotB.bx = Math.round(-T.L / 4 * 1.2 * 10000); shotB.by = 0; }
			return noise(shotB);
		}
		// where can the cue ball go (ball in hand)?
		var starts = [];
		if (s.bih) {
			var cands = [];
			var allPots = [];
			tg.forEach(function (b) {
				aimPoints(s).forEach(function (ap) {
					var ox = ap[0] - s.x[b], oy = ap[1] - s.y[b], d = Math.sqrt(ox * ox + oy * oy);
					if (!ap[2] && Math.abs(oy / d) < 0.42) return;
					[0.22, 0.35, 0.55].forEach(function (back) {
						[0, 0.35, -0.35].forEach(function (ang) {
							var ux = ox / d, uy = oy / d, cs = Math.cos(ang), sn = Math.sin(ang);
							var rx = ux * cs - uy * sn, ry = ux * sn + uy * cs;
							var cx = s.x[b] - ux * 2 * R - rx * back, cy = s.y[b] - uy * 2 * R - ry * back;
							if (B.placeOk(s, cx, cy)) allPots.push([cx, cy]);
						});
					});
				});
			});
			shuffle(allPots, rand);
			allPots.slice(0, 40).forEach(function (p) { var c = B.candidates(s, p[0], p[1], tg); if (c.length) cands.push({ p: p, c: c[0] }); });
			cands.sort(function (a, b) { return b.c.score - a.c.score; });
			cands.slice(0, Lv.k).forEach(function (o) { starts.push(o.p); });
			if (!starts.length) {
				// any legal spot (e.g. the D): try a few
				for (i = 0; i < 60 && starts.length < 6; i++) {
					var zx = s.zone === "D" ? -T.L / 2 + T.baulk - rand() * T.dR : s.zone === "kitchen" ? -T.L / 2 + R + rand() * (T.L / 4 - 2 * R) : (rand() - 0.5) * (T.L - 4 * R);
					var zy = s.zone === "D" ? (rand() - 0.5) * 2 * T.dR : (rand() - 0.5) * (T.W - 4 * R);
					if (B.placeOk(s, zx, zy)) starts.push([zx, zy]);
				}
			}
		} else starts.push([s.x[0], s.y[0]]);
		var place = s.bih;
		starts.forEach(function (st) {
			var c = B.candidates(s, st[0], st[1], tg).slice(0, Lv.k);
			c.forEach(function (cd) {
				var v = speedFor(cd);
				var vs = [v, v * 1.45], spins = Lv.spin ? [[0, 0], [0, 45], [0, -45]] : [[0, 0]];
				vs.forEach(function (vv) { spins.forEach(function (sp) { consider(mk(st[0], st[1], cd.gx, cd.gy, Math.min(B.VMAX * 0.95, vv), sp[0], sp[1], place)); }); });
			});
		});
		// nothing good: play safe (hit a legal ball softly, leave little) or kick at random
		if (!best || best.v < 60) {
			var st0 = starts[0] || [s.x[0], s.y[0]];
			for (i = 0; i < Lv.safe; i++) {
				var b = tg[Math.floor(rand() * tg.length)];
				if (b === undefined) break;
				var off = (rand() - 0.5) * 3.6 * R;
				var dx = s.x[b] - st0[0], dy = s.y[b] - st0[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
				var tx = s.x[b] - dy / d * off, ty = s.y[b] + dx / d * off;
				consider(mk(st0[0], st0[1], tx, ty, 0.8 + rand() * 2.2, 0, Math.round((rand() - 0.5) * 60), place));
			}
			if (!best || best.v < -50) for (i = 0; i < Lv.safe; i++) {
				var ang = Math.floor(rand() * 3600000);
				var sh = { a: ang, p: B.powerFor(1.5 + rand() * 4), sx: 0, sy: 0 };
				if (place) { sh.bx = Math.round(st0[0] * 10000); sh.by = Math.round(st0[1] * 10000); }
				consider(sh);
			}
		}
		if (!best) {
			var sh2 = { a: 0, p: 300, sx: 0, sy: 0 };
			if (place) { var pp = starts[0] || [-T.L / 2 + T.baulk - 0.1, 0]; sh2.bx = Math.round(pp[0] * 10000); sh2.by = Math.round(pp[1] * 10000); }
			return sh2;
		}
		return noise(best.shot);
		function noise(sh) {
			var o = { a: sh.a, p: sh.p, sx: sh.sx, sy: sh.sy };
			if (sh.bx !== undefined) { o.bx = sh.bx; o.by = sh.by; }
			o.a = Math.round(o.a + gauss(rand) * Lv.aim * 10000);
			o.a = ((o.a % 3600000) + 3600000) % 3600000;
			o.p = Math.max(1, Math.min(1000, Math.round(o.p * (1 + gauss(rand) * Lv.pow))));
			return o;
		}
	};

	/* ======================================================= the aiming guide ======================================================= */
	/** first thing the cue ball meets going straight along a direction: {kind: "ball"|"rail"|"none", b, x, y (cue centre at contact), ox, oy (object ball direction), tx, ty (cue ball tangent), rx, ry (rail bounce direction)} */
	B.guide = function (s, cx, cy, dxs, dys) {
		var R = s.T.R, G = geometry(s.T), best = 1e9, out = { kind: "none" }, i;
		for (i = 1; i < s.n; i++) {
			if (!s.on[i]) continue;
			var fx = s.x[i] - cx, fy = s.y[i] - cy, t = fx * dxs + fy * dys;
			if (t <= 0) continue;
			var p2 = fx * fx + fy * fy - t * t, r2 = 4 * R * R;
			if (p2 >= r2) continue;
			var tc = t - Math.sqrt(r2 - p2);
			if (tc < best) { best = tc; out = { kind: "ball", b: i, t: tc }; }
		}
		// cushions: the box the centre can move in
		var L = G.L - R, W = G.W - R, tr = 1e9, nx = 0, ny = 0;
		if (dxs > 0) { var a = (L - cx) / dxs; if (a < tr) { tr = a; nx = -1; ny = 0; } }
		if (dxs < 0) { var b2 = (-L - cx) / dxs; if (b2 < tr) { tr = b2; nx = 1; ny = 0; } }
		if (dys > 0) { var c2 = (W - cy) / dys; if (c2 < tr) { tr = c2; nx = 0; ny = -1; } }
		if (dys < 0) { var d2 = (-W - cy) / dys; if (d2 < tr) { tr = d2; nx = 0; ny = 1; } }
		if (tr < best) {
			var dot = dxs * nx + dys * ny;
			return { kind: "rail", x: cx + dxs * tr, y: cy + dys * tr, t: tr, rx: dxs - 2 * dot * nx, ry: dys - 2 * dot * ny };
		}
		if (out.kind === "ball") {
			out.x = cx + dxs * best; out.y = cy + dys * best;
			var ox = s.x[out.b] - out.x, oy = s.y[out.b] - out.y, ol = Math.sqrt(ox * ox + oy * oy) || 1;
			out.ox = ox / ol; out.oy = oy / ol;
			var along = dxs * out.ox + dys * out.oy;
			var tx = dxs - along * out.ox, ty = dys - along * out.oy, tl = Math.sqrt(tx * tx + ty * ty);
			out.tx = tl > 1e-9 ? tx / tl : 0; out.ty = tl > 1e-9 ? ty / tl : 0; out.cut = along;
		}
		return out;
	};

	/* ======================================================= Hive protocol ======================================================= */
	// custom_json id mes_pool. Ops: open {g, v, f, to?, re?} · join {h, g} · sh {h, g, n, m, c} · res / claim / cancel {h, g} ·
	// rec {g, v, sd (seed), m (shots joined by "."), o (computer level | local), s (your seat | -1), w (winner | -1)}
	var H = B.hive = { ID: "mes_pool", CLAIM_S: 300, OPEN_S: 3600, GID_RE: /^[a-z0-9]{8}$/, ACCT_RE: /^[a-z][a-z0-9.-]{2,15}$/, OPP: ["easy", "medium", "hard", "pro", "local"] };
	B.onlineGame = function (v) { var g = B.game(v); return !!(g && g.online); };
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
	H.clean = function (j) {
		if (!j || typeof j !== "object" || !H.GID_RE.test(String(j.g))) return null;
		var a = j.a, o = { a: a, g: j.g };
		if (a === "open") {
			if (!B.onlineGame(j.v)) return null;
			o.v = j.v; o.f = ["host", "guest", "random"].indexOf(j.f) >= 0 ? j.f : "host";
			if (j.to !== undefined) { if (!H.ACCT_RE.test(String(j.to))) return null; o.to = j.to; }
			if (j.re !== undefined && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(String(j.re))) o.re = j.re;
			return o;
		}
		if (a === "rec") {
			if (!B.game(j.v) || typeof j.m !== "string" || j.m.length > 7000 || !/^[0-9a-z~.-]+$/.test(j.m)) return null;
			if (typeof j.sd !== "string" || !/^[a-z0-9]{1,16}$/.test(j.sd)) return null;
			if (H.OPP.indexOf(j.o) < 0 || [-1, 0, 1].indexOf(j.s) < 0 || [-1, 0, 1].indexOf(j.w) < 0) return null;
			o.v = j.v; o.sd = j.sd; o.m = j.m; o.o = j.o; o.s = j.s; o.w = j.w;
			return o;
		}
		if (!H.ACCT_RE.test(String(j.h))) return null;
		o.h = j.h;
		if (a === "join" || a === "res" || a === "claim" || a === "cancel") return o;
		if (a === "sh") {
			if (typeof j.n !== "number" || j.n < 0 || j.n > 900 || (j.n | 0) !== j.n || !B.sparse(j.m)) return null;
			o.n = j.n; o.m = String(j.m);
			if (typeof j.c === "string" && /^[0-9a-f]{8}$/.test(j.c)) o.c = j.c;
			return o;
		}
		return null;
	};
	H.json = function (o) { var c = {}; for (var k in o) if (["a", "g", "v", "f", "to", "re", "h", "n", "m", "c", "o", "s", "w", "sd"].indexOf(k) >= 0) c[k] = o[k]; return JSON.stringify(c); };
	H.newGid = function (r) { var A = "abcdefghijkmnpqrstuvwxyz23456789", s = ""; r = r || Math.random; for (var i = 0; i < 8; i++) s += A[(r() * A.length) | 0]; return s; };
	function order(a, b) { return (a.block || Infinity) - (b.block || Infinity) || (a.acct === b.acct ? a.i - b.i : a.trx < b.trx ? -1 : a.trx > b.trx ? 1 : 0) || (a.ts - b.ts); }
	H.order = order;
	H.coin = function (trxA, trxB) { var s = String(trxA) + String(trxB), n = 0; for (var i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 2; };
	/**
	 * A Hive game from operations: host, gid; ops: parsed operations of both players; now: ms.
	 * -> {ok, open, guest, players, s, status "none|wait|play|over|cancelled|expired", win, lastTs, turnAcct, canClaimAt, trx: {open, join, end, moves: [trx]}, results: [apply results of new shots]}
	 * opts.from: an earlier result with the same game to continue from (only new shots are simulated).
	 */
	H.build = function (host, gid, ops, now, opts) {
		opts = opts || {};
		var mine = ops.filter(function (o) { return o.g === gid && o.a !== "rec" && (o.a === "open" ? o.acct === host : o.h === host); }).sort(order);
		var R = { host: host, gid: gid, open: null, guest: null, players: [null, null], s: null, status: "none", win: null, lastTs: 0, turnAcct: null, canClaimAt: 0, trx: { open: "", join: "", end: "", moves: [] }, results: [], bad: 0 };
		var prev = opts.from && opts.from.s && opts.from.gid === gid && opts.from.host === host ? opts.from : null;
		for (var i = 0; i < mine.length; i++) {
			var o = mine[i];
			if (!R.open) {
				if (o.a === "open") { R.open = o; R.s = B.create(o.v, gid); R.status = "wait"; R.lastTs = o.ts; R.trx.open = o.trx; }
				continue;
			}
			if (o.a === "open") continue;
			if (R.status === "wait") {
				if (o.a === "cancel" && o.acct === host) { R.status = "cancelled"; R.lastTs = o.ts; R.trx.end = o.trx; continue; }
				if (o.a === "join" && o.acct !== host && (!R.open.to || R.open.to === o.acct)) {
					R.guest = o.acct; R.join = o; R.trx.join = o.trx;
					var hostFirst = R.open.f === "host" ? true : R.open.f === "guest" ? false : H.coin(R.open.trx, o.trx) === 0;
					R.players = hostFirst ? [host, o.acct] : [o.acct, host];
					R.status = "play"; R.lastTs = o.ts;
				}
				continue;
			}
			if (R.status !== "play") continue;
			var seat = R.players.indexOf(o.acct);
			if (seat < 0) continue;
			if (o.a === "sh") {
				if (o.n !== R.s.hist.length || R.s.turn !== seat) continue;
				var shot = B.sparse(o.m);
				if (!B.isLegal(R.s, shot)) continue;
				var n = R.s.hist.length;
				if (prev && prev.s.hist.length > n && prev.s.hist[n] === o.m && prev._snaps && prev._snaps[n + 1]) {
					R.s = B.clone(prev._snaps[n + 1]);
				} else {
					var res = B.apply(R.s, shot, { frames: !!opts.frames });
					res.n = n;
					R.results.push(res);
				}
				(R._snaps || (R._snaps = []))[n + 1] = B.clone(R.s);
				if (o.c && o.c !== B.hash(R.s)) R.bad++;
				R.lastTs = o.ts; R.trx.moves.push(o.trx);
				if (R.s.win) { R.status = "over"; R.win = { p: R.s.win.p, why: R.s.win.why }; R.trx.end = o.trx; }
			} else if (o.a === "res") {
				R.status = "over"; R.win = { p: 1 - seat, why: "resign" }; R.s.win = { p: 1 - seat, why: "resign" }; R.trx.end = o.trx;
			} else if (o.a === "claim") {
				if (R.s.turn !== seat && o.ts - R.lastTs >= H.CLAIM_S * 1000) {
					R.status = "over"; R.win = { p: seat, why: "timeout" }; R.s.win = { p: seat, why: "timeout" }; R.trx.end = o.trx;
				}
			}
		}
		if (R.status === "wait" && now && R.open && now - R.open.ts > H.OPEN_S * 1000) R.status = "expired";
		if (R.status === "play") { R.turnAcct = R.players[R.s.turn]; R.canClaimAt = R.lastTs + H.CLAIM_S * 1000; }
		R.ok = R.status !== "none";
		return R;
	};
	H.myGames = function (acct, ops) {
		var seen = {}, out = [];
		ops.filter(function (o) { return o.acct === acct && (o.a === "open" || o.a === "join"); }).sort(order).reverse().forEach(function (o) {
			var host = o.a === "open" ? acct : o.h, k = host + "/" + o.g;
			if (seen[k]) return; seen[k] = 1;
			out.push({ host: host, gid: o.g, role: o.a === "open" ? "host" : "guest", v: o.v, to: o.to, re: o.re, ts: o.ts, trx: o.trx });
		});
		return out;
	};
	/** self-reported results that replay to the stated winner, newest first */
	H.records = function (ops, maxCheck) {
		var seen = {}, n = 0;
		return ops.filter(function (o) { return o.a === "rec"; }).sort(order).reverse().filter(function (o) {
			var k = o.acct + "/" + o.g; if (seen[k]) return false; seen[k] = 1;
			if (maxCheck && n++ >= maxCheck) return false;
			var g = B.game(o.v); if (!g) return false;
			var st = B.replay(o.v, o.sd, o.m.split("."));
			if (!st || !st.win) return false;
			if (st.win.p !== o.w) return false;
			if (g.np === 1 ? o.s !== -1 : o.o === "local" ? o.s !== -1 : o.s < 0) return false;
			o._st = st;
			return true;
		}).map(function (o) {
			return { acct: o.acct, g: o.g, v: o.v, sd: o.sd, shots: o.m.split("."), o: o.o, s: o.s, w: o.w, score: o._st.score, result: o.s < 0 ? "" : o.w === o.s ? "w" : "l", ts: o.ts, trx: o.trx };
		});
	};

	if (typeof module !== "undefined" && module.exports) module.exports = B;
	root.MESBilliards = B;
})(typeof self !== "undefined" ? self : this);

/* MES Billiards: the page (setup, table drawing, aiming, power + spin, the computer, replay, challenges, guest online games via
   /api/billiards, Hive games, statistics, rules). The same served file is also started as a Web Worker that runs the computer's thinking.
   Online: /api/billiards on mes.fm; on localhost / 127.0.0.1 (no /api) or with ?mock=1 an in-browser stand-in kept in localStorage
   "mes-billiards:mock" is used instead, and Hive play uses a stand-in chain ("mes-billiards:hchain") + a per-tab account, so two tabs can play. */
(function () {
	"use strict";
	var B = (typeof self !== "undefined" ? self : window).MESBilliards;

	if (typeof document === "undefined") {          // running as the Web Worker: the computer's shot
		self.onmessage = function (e) {
			var r = null;
			try {
				var s = e.data.s;
				s.g = B.game(s.v); s.T = B.TABLES[s.g.table];
				r = B.ai(s, e.data.level);
			} catch (err) { r = null; }
			self.postMessage({ id: e.data.id, r: r });
		};
		return;
	}

	var SCRIPT = document.currentScript && document.currentScript.src;
	var root = document.getElementById("bl");
	if (!root) return;
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-billiards:v1";
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var START = root.getAttribute("data-start") || "";

	/* ---------- saved settings ---------- */
	var S = { game: "8", opp: "cpu", lv: "medium", me: "first", alt: 0, guide: "full", orient: "auto", speed: "1", cloth: "green", snd: true, rel: true, nums: false,
		names: ["", ""], name: "", ofirst: "host", opub: true, cur: null, stats: {}, online: null, hive: null, saved: {}, chal: {}, power: 350 };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) for (var k0 in saved) S[k0] = saved[k0]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

	/* ---------- worker ---------- */
	var worker = null, wid = 0, waiting = {};
	try {
		if (SCRIPT && typeof Worker !== "undefined" && !/noworker/.test(location.search)) {
			worker = new Worker(SCRIPT);
			worker.onmessage = function (e) { var f = waiting[e.data.id]; if (f) { delete waiting[e.data.id]; f(e.data.r); } };
			worker.onerror = function () { worker = null; Object.keys(waiting).forEach(function (k) { var f = waiting[k]; delete waiting[k]; f(undefined); }); };
		}
	} catch (e) { worker = null; }
	function plain(s) { var o = {}; for (var k in s) if (k !== "g" && k !== "T") o[k] = s[k]; return JSON.parse(JSON.stringify(o)); }
	function askAi(s, level) {
		return new Promise(function (res) {
			var local = function () { setTimeout(function () { try { res(B.ai(B.clone(s), level)); } catch (e) { res(null); } }, 30); };
			if (!worker) return local();
			var id = ++wid;
			waiting[id] = function (r) { if (r === undefined) local(); else res(r); };
			worker.postMessage({ id: id, s: plain(s), level: level });
		});
	}

	/* ---------- game state ---------- */
	var st, mode = "cpu", human = 0, seed = "", busy = false, gen = 0;
	var aim = 0, power = S.power || 350, spin = { x: 0, y: 0 }, place = null;   // place = cue ball spot while in hand (table metres)
	var anim = null, queue = [], lastShow = null, cpuAim = null;
	var score = { p: [0, 0] };
	var LEVEL_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard", pro: "Pro" };

	function newSeed() { var A = "abcdefghijkmnpqrstuvwxyz23456789", s = ""; for (var i = 0; i < 6; i++) s += A[(Math.random() * A.length) | 0]; return s; }
	function game() { return st.g; }
	function effOpp() { return B.game(S.game) && B.game(S.game).np === 1 ? "solo" : S.opp; }
	function newGame(keepAlt) {
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		gen++; busy = false; anim = null; queue = []; cpuAim = null;
		seed = newSeed();
		st = B.create(S.game, seed) || B.create("8", seed);
		mode = effOpp();
		if (mode === "cpu") {
			if (!keepAlt && S.me === "alt") S.alt = 1 - (S.alt || 0);
			human = S.me === "second" ? 1 : S.me === "alt" ? (S.alt || 0) : 0;
		} else human = 0;
		save();
		resetAim();
		storeCur();
		render(); relayout();
		maybeCpu();
	}
	function storeCur() { S.cur = { v: st.v, seed: st.seed, hist: st.hist.slice(), mode: mode, human: human, done: !!st.win }; save(); }
	function isHumanTurn() {
		if (!st || st.win) return false;
		if (mode === "cpu") return st.turn === human;
		if (mode === "online") return on.g && on.g.status === "play" && st.turn === on.seat;
		if (mode === "hive") return hv.R && hv.R.status === "play" && hv.R.players[st.turn] === hMe();
		return true;
	}
	function canShoot() { return isHumanTurn() && !anim && !queue.length && !busy && !(mode === "online" && on.sending) && !(mode === "hive" && (hv.busy || hv.pending.some(function (p) { return p.a === "sh"; }))); }

	function defaultPlace() {
		var T = st.T, tries, px, py;
		if (st.zone === "D") { px = -T.L / 2 + T.baulk - 0.06; py = T.dR * 0.45; }
		else if (st.zone === "kitchen") { px = -T.L / 4 - 0.04; py = 0; }
		else { px = -T.L / 4; py = 0; }
		if (B.placeOk(st, px, py)) return [px, py];
		for (tries = 0; tries < 400; tries++) {
			var a = tries * 0.618 * 6.283, r = 0.02 + tries * 0.004;
			var qx = px + Math.cos(a) * r, qy = py + Math.sin(a) * r;
			if (B.placeOk(st, qx, qy)) return [qx, qy];
		}
		return [px, py];
	}
	function cueXY() { return st.bih ? (place || (place = defaultPlace())) : [st.x[0], st.y[0]]; }
	function resetAim() {
		place = st.bih ? defaultPlace() : null;
		var c = cueXY(), tg = B.targets(st), best = null, bd = 1e9;
		if (st.brk && st.g.table === "pool") {   // aim at the apex of the rack
			for (var i = 1; i < st.n; i++) if (st.on[i] && st.x[i] < bd) { bd = st.x[i]; best = i; }
			if (best !== null) aim = B.angleOf(st.x[best] - c[0], st.y[best] - c[1]);
		} else autoAimNext();
		spin = { x: 0, y: 0 };
		if (st.brk && st.g.table === "pool") power = Math.max(power, 850);
		else if (power > 700) power = 380;
		drawSpin(); renderPower();
	}

	/* ---------- shooting ---------- */
	function buildShot() {
		var o = { a: aim, p: Math.max(1, Math.min(1000, Math.round(power))), sx: Math.round(spin.x), sy: Math.round(spin.y) };
		if (o.sx * o.sx + o.sy * o.sy > 10000) { var f = 100 / Math.sqrt(o.sx * o.sx + o.sy * o.sy); o.sx = Math.trunc(o.sx * f); o.sy = Math.trunc(o.sy * f); }
		if (st.bih) { var c = cueXY(); o.bx = Math.round(c[0] * 10000); o.by = Math.round(c[1] * 10000); }
		return o;
	}
	function shoot() {
		if (!canShoot()) { if (anim) skipAnim(); return; }
		ensureAudio();
		var shot = buildShot();
		if (!B.isLegal(st, shot)) {
			if (st.bih) return toast("The cue ball can't go there: place it " + B.zoneName(st.zone) + ", not touching another ball.");
			return toast("That shot isn't allowed.");
		}
		if (mode === "online") return onlineShot(shot);
		if (mode === "hive") return hiveShot(shot);
		take(shot);
	}
	function take(shot) {
		var res = B.apply(st, shot, { frames: true });
		if (!res) return;
		place = null;
		storeCur();
		show(res, function () { afterShot(); });
	}
	function afterShot() {
		if (st.bih) place = defaultPlace();
		if (st.win && !st._fin) { st._fin = true; finish(); }
		else if (!st.win) autoAimNext();
		render();
		maybeCpu();
	}
	function autoAimNext() {
		// aim at the nearest legal ball the cue ball can hit straight (else just the nearest legal ball)
		var c = cueXY(), tg = B.targets(st).slice();
		tg.sort(function (a, b) { return Math.hypot(st.x[a] - c[0], st.y[a] - c[1]) - Math.hypot(st.x[b] - c[0], st.y[b] - c[1]); });
		var pick = tg[0];
		for (var i = 0; i < tg.length; i++) {
			var dx = st.x[tg[i]] - c[0], dy = st.y[tg[i]] - c[1], d = Math.hypot(dx, dy) || 1, g = B.guide(st, c[0], c[1], dx / d, dy / d);
			if (g.kind === "ball" && g.b === tg[i]) { pick = tg[i]; break; }
		}
		if (pick !== undefined) aim = B.angleOf(st.x[pick] - c[0], st.y[pick] - c[1]);
		spin = { x: 0, y: 0 }; drawSpin();
	}

	/* ---------- the computer ---------- */
	function maybeCpu() {
		if (mode !== "cpu" || !st || st.win || st.turn === human || busy || anim) return;
		busy = true;
		var g0 = gen, t0 = Date.now();
		$("bl-think").hidden = false;
		render();
		askAi(st, S.lv).then(function (shot) {
			if (g0 !== gen) return;
			if (!shot || !B.isLegal(st, shot)) shot = fallbackShot();
			var wait = Math.max(0, 500 - (Date.now() - t0));
			setTimeout(function () {
				if (g0 !== gen) return;
				$("bl-think").hidden = true;
				// show the computer lining up the shot
				var from = aim, to = shot.a, d = ((to - from) % 3600000 + 5400000) % 3600000 - 1800000;
				if (shot.bx !== undefined) place = [shot.bx / 10000, shot.by / 10000];
				cpuAim = { t0: performance.now(), from: from, d: d, p0: power, p1: shot.p, sx: shot.sx, sy: shot.sy };
				spin = { x: shot.sx, y: shot.sy }; drawSpin();
				var dur = 650;
				var tick = function () {
					if (g0 !== gen) return;
					var f = Math.min(1, (performance.now() - cpuAim.t0) / dur), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
					aim = (((cpuAim.from + cpuAim.d * e) % 3600000) + 3600000) % 3600000;
					power = cpuAim.p0 + (cpuAim.p1 - cpuAim.p0) * e; renderPower();
					draw();
					if (f < 1) requestAnimationFrame(tick);
					else { aim = shot.a; cpuAim = null; busy = false; take(shot); }
				};
				requestAnimationFrame(tick);
			}, wait);
		});
	}
	function fallbackShot() {
		var c = st.bih ? defaultPlace() : [st.x[0], st.y[0]], tg = B.targets(st), b = tg[0] || 1;
		var o = { a: B.angleOf(st.x[b] - c[0], st.y[b] - c[1]), p: 300, sx: 0, sy: 0 };
		if (st.bih) { o.bx = Math.round(c[0] * 10000); o.by = Math.round(c[1] * 10000); }
		return o;
	}

	/* ---------- undo ---------- */
	function undo() {
		if (mode === "online" || mode === "hive") return toast("No undo in online games.");
		if (!st.hist.length || anim) return;
		gen++; busy = false; cpuAim = null; $("bl-think").hidden = true;
		var h = st.hist.slice(), k = h.length - 1, s2 = null;
		if (mode === "cpu") {
			for (; k >= 0; k--) { s2 = B.replay(st.v, st.seed, h.slice(0, k)); if (s2 && s2.turn === human) break; }
			if (k < 0) { s2 = B.replay(st.v, st.seed, []); }
		} else s2 = B.replay(st.v, st.seed, h.slice(0, k));
		if (!s2) return;
		st = s2;
		resetAim();
		storeCur();
		toast("Shot taken back.");
		render(); draw();
		maybeCpu();
	}

	/* ===================================================================== drawing ===================================================================== */
	var cv = $("bl-cv"), ctx = cv.getContext("2d"), stage = $("bl-stage"), view = $("bl-view");
	var LY = null, staticCv = null, sprites = {};
	var CLOTH = { green: ["#1f7a46", "#155d34"], blue: ["#1f5f9e", "#174877"], red: ["#9e2a2b", "#771f20"], grey: ["#5b6670", "#434c54"] };
	var POOL_COL = { 0: "#f8f8f2", 1: "#f2c200", 2: "#1c4fd8", 3: "#d62828", 4: "#6a2c91", 5: "#f77f00", 6: "#1b7f3b", 7: "#7b1e1e", 8: "#111111" };
	var SNK_COL = { 0: "#f8f8f2", 1: "#c1121f", 2: "#f2c200", 3: "#1b8a43", 4: "#7a4a1e", 5: "#1c4fd8", 6: "#ff7eb6", 7: "#111111" };
	function ballColor(k, snooker) { return snooker ? SNK_COL[k] : POOL_COL[k > 8 ? k - 8 : k]; }
	function upright() {
		if (S.orient === "upright") return true;
		if (S.orient === "across") return false;
		var w = stage.clientWidth || window.innerWidth;
		return w < 620 && window.innerHeight > window.innerWidth * 1.15;
	}
	function relayout() {
		if (!st) return;
		var T = st.T, cush = 0.045, wood = T.id === "pool" ? 0.11 : 0.13, edge = cush + wood;
		var Lo = T.L + 2 * edge, Wo = T.W + 2 * edge, up = upright();
		var dimX = up ? Wo : Lo, dimY = up ? Lo : Wo;
		var aw = Math.max(200, stage.clientWidth - 12);
		var fill = view.classList.contains("mes-pfill");
		var ah;
		if (fill) ah = Math.max(160, stage.clientHeight - 12);
		else ah = Math.max(220, window.innerHeight - (up ? 250 : 200));
		var kk = Math.min(aw / dimX, ah / dimY);
		var w = Math.floor(dimX * kk), h = Math.floor(dimY * kk), dpr = Math.min(2.5, window.devicePixelRatio || 1);
		cv.style.width = w + "px"; cv.style.height = h + "px";
		cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
		LY = { k: kk, w: w, h: h, dpr: dpr, up: up, cx: w / 2, cy: h / 2, cush: cush, wood: wood, T: T, Lo: Lo, Wo: Wo };
		staticCv = null; sprites = {};
		draw();
	}
	function w2s(x, y) { return LY.up ? [LY.cx + y * LY.k, LY.cy - x * LY.k] : [LY.cx + x * LY.k, LY.cy + y * LY.k]; }
	function s2w(px, py) { return LY.up ? [(LY.cy - py) / LY.k, (px - LY.cx) / LY.k] : [(px - LY.cx) / LY.k, (py - LY.cy) / LY.k]; }
	function buildStatic() {
		var T = LY.T, G = B.geometry(T), c = document.createElement("canvas");
		c.width = cv.width; c.height = cv.height;
		var g = c.getContext("2d"), k = LY.k;
		g.scale(LY.dpr, LY.dpr);
		var rect = function (x0, y0, x1, y1) { var a = w2s(x0, y0), b = w2s(x1, y1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])]; };
		var L = T.L / 2, W = T.W / 2, e = LY.cush + LY.wood;
		// wood frame
		var r0 = rect(-L - e, -W - e, L + e, W + e), wg = g.createLinearGradient(r0[0], r0[1], r0[0] + r0[2], r0[1] + r0[3]);
		wg.addColorStop(0, "#6b3a1e"); wg.addColorStop(0.5, "#8a4d27"); wg.addColorStop(1, "#5a2f17");
		g.fillStyle = wg; roundRect(g, r0[0], r0[1], r0[2], r0[3], 0.05 * k); g.fill();
		g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 2; g.stroke();
		// cloth (incl. cushions)
		var cl = CLOTH[S.cloth] || CLOTH.green;
		var r1 = rect(-L - LY.cush, -W - LY.cush, L + LY.cush, W + LY.cush);
		g.fillStyle = cl[1]; g.fillRect(r1[0], r1[1], r1[2], r1[3]);
		var r2 = rect(-L, -W, L, W), cg = g.createRadialGradient(LY.cx, LY.cy, 10, LY.cx, LY.cy, Math.max(r2[2], r2[3]) * 0.7);
		cg.addColorStop(0, shade(cl[0], 18)); cg.addColorStop(1, cl[0]);
		g.fillStyle = cg; g.fillRect(r2[0], r2[1], r2[2], r2[3]);
		// cushion noses (a darker line)
		g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = Math.max(1, 0.006 * k);
		G.segs.forEach(function (sg) { var a = w2s(sg[0], sg[1]), b = w2s(sg[2], sg[3]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); });
		// pockets
		G.pockets.forEach(function (q) {
			var corner = q[2], rr = (corner ? T.mc * 0.62 : T.ms * 0.55) * k;
			var ox = corner ? (q[0] > 0 ? 1 : -1) * T.mc * 0.18 : 0, oy = (q[1] > 0 ? 1 : -1) * (corner ? T.mc * 0.18 : T.ms * 0.28);
			var p = w2s(q[0] + ox, q[1] + oy);
			var pg = g.createRadialGradient(p[0], p[1], rr * 0.2, p[0], p[1], rr);
			pg.addColorStop(0, "#000"); pg.addColorStop(1, "#1a1a1a");
			g.fillStyle = pg; g.beginPath(); g.arc(p[0], p[1], rr, 0, 7); g.fill();
			g.strokeStyle = "#c0a060"; g.lineWidth = Math.max(1, 0.008 * k); g.stroke();
		});
		// diamonds (sights)
		g.fillStyle = "#f3e7c8";
		var dz = LY.cush + LY.wood * 0.5;
		for (var i = 1; i < 8; i++) if (i !== 4) { var xx = -L + T.L * i / 8; dot(xx, -W - dz); dot(xx, W + dz); }
		for (i = 1; i < 4; i++) { var yy = -W + T.W * i / 4; dot(-L - dz, yy); dot(L + dz, yy); }
		function dot(x, y) { var p = w2s(x, y); g.beginPath(); g.arc(p[0], p[1], Math.max(1.6, 0.009 * k), 0, 7); g.fill(); }
		// markings
		g.strokeStyle = "rgba(255,255,255,0.32)"; g.fillStyle = "rgba(255,255,255,0.55)"; g.lineWidth = Math.max(1, 0.003 * k);
		if (T.id === "snooker") {
			var bx = -L + T.baulk, a1 = w2s(bx, -W), a2 = w2s(bx, W);
			g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.stroke();
			var c0 = w2s(bx, 0);
			g.beginPath();
			if (LY.up) g.arc(c0[0], c0[1], T.dR * k, 0, Math.PI); else g.arc(c0[0], c0[1], T.dR * k, Math.PI / 2, Math.PI * 1.5);
			g.stroke();
			var sp = B.spots(T);
			for (var v = 2; v <= 7; v++) { var sq = w2s(sp[v][0], sp[v][1]); g.beginPath(); g.arc(sq[0], sq[1], Math.max(1.2, 0.006 * k), 0, 7); g.fill(); }
		} else {
			var hx = -T.L / 4, h1 = w2s(hx, -W), h2 = w2s(hx, W);
			g.setLineDash([4, 6]); g.beginPath(); g.moveTo(h1[0], h1[1]); g.lineTo(h2[0], h2[1]); g.stroke(); g.setLineDash([]);
			var fs = w2s(T.L / 4, 0), hs = w2s(-T.L / 4, 0);
			g.beginPath(); g.arc(fs[0], fs[1], Math.max(1.5, 0.007 * k), 0, 7); g.fill();
			g.beginPath(); g.arc(hs[0], hs[1], Math.max(1.5, 0.007 * k), 0, 7); g.fill();
		}
		// brand
		g.fillStyle = "rgba(255,255,255,0.08)"; g.font = "700 " + Math.round(0.07 * k) + "px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
		var mp = w2s(T.id === "snooker" ? 0.5 : 0.3, 0);
		g.save(); g.translate(mp[0], mp[1]); if (LY.up) g.rotate(-Math.PI / 2); g.fillText("mes.fm", 0, 0); g.restore();
		staticCv = c;
	}
	function shade(hex, amt) {
		var n = parseInt(hex.slice(1), 16), r = Math.min(255, Math.max(0, (n >> 16) + amt)), gg = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt)), b = Math.min(255, Math.max(0, (n & 255) + amt));
		return "rgb(" + r + "," + gg + "," + b + ")";
	}
	function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
	function sprite(kind) {
		var key = kind + (S.nums ? "b" : "");
		if (sprites[key]) return sprites[key];
		var snooker = st.g.table === "snooker", R = st.T.R * LY.k * LY.dpr, size = Math.ceil(R * 2 + 4), c = document.createElement("canvas");
		c.width = c.height = size;
		var g = c.getContext("2d"), m = size / 2, col = ballColor(kind, snooker);
		g.beginPath(); g.arc(m, m, R, 0, 7); g.closePath();
		if (!snooker && kind > 8) {
			g.fillStyle = "#f8f8f2"; g.fill();
			g.save(); g.clip(); g.fillStyle = col; g.fillRect(m - R, m - R * 0.55, R * 2, R * 1.1); g.restore();
		} else { g.fillStyle = col; g.fill(); }
		if (!snooker && kind > 0) {
			var nr = R * (S.nums ? 0.62 : 0.48);
			g.fillStyle = "#fff"; g.beginPath(); g.arc(m, m, nr, 0, 7); g.fill();
			g.fillStyle = "#111"; g.font = "700 " + Math.round(nr * (kind > 9 ? 1.1 : 1.3)) + "px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
			g.fillText(String(kind), m, m + nr * 0.07);
		}
		if (kind === 0 && !snooker) { g.fillStyle = "rgba(200,30,30,0.6)"; g.beginPath(); g.arc(m, m, R * 0.12, 0, 7); g.fill(); }
		// shading
		var sh = g.createRadialGradient(m - R * 0.38, m - R * 0.42, R * 0.08, m, m, R);
		sh.addColorStop(0, "rgba(255,255,255,0.75)"); sh.addColorStop(0.22, "rgba(255,255,255,0.12)"); sh.addColorStop(0.7, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.42)");
		g.beginPath(); g.arc(m, m, R, 0, 7); g.fillStyle = sh; g.fill();
		g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = Math.max(1, R * 0.05); g.stroke();
		sprites[key] = c;
		return c;
	}
	var needed = false;
	function need() { if (!needed) { needed = true; requestAnimationFrame(function () { needed = false; draw(); }); } }
	function positions() {
		if (!anim || !anim.playing) return null;
		var f = anim.frames, idx = anim.idx, i0 = Math.min(f.length - 1, Math.floor(idx)), i1 = Math.min(f.length - 1, i0 + 1), t = idx - Math.floor(idx);
		return { a: f[i0], b: f[i1], t: i0 === i1 ? 0 : t };
	}
	function draw() {
		if (!LY || !st) return;
		if (!staticCv) buildStatic();
		var g = ctx, k = LY.k, R = st.T.R;
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.clearRect(0, 0, cv.width, cv.height);
		g.drawImage(staticCv, 0, 0);
		g.setTransform(LY.dpr, 0, 0, LY.dpr, 0, 0);
		var P = positions(), n = st.n, xs = [], ys = [], ons = [], i;
		for (i = 0; i < n; i++) {
			if (P) { var ax = P.a[i * 3], bx = P.b[i * 3]; xs.push(ax + (bx - ax) * P.t); ys.push(P.a[i * 3 + 1] + (P.b[i * 3 + 1] - P.a[i * 3 + 1]) * P.t); ons.push(P.t < 0.5 ? P.a[i * 3 + 2] : P.b[i * 3 + 2]); }
			else if (anim && anim.pre) { xs.push(anim.pre[i * 3]); ys.push(anim.pre[i * 3 + 1]); ons.push(anim.pre[i * 3 + 2]); }
			else { xs.push(st.x[i]); ys.push(st.y[i]); ons.push(st.on[i]); }
		}
		var aiming = !anim && (canShoot() || cpuAim);
		if (aiming && st.bih && place) { xs[0] = place[0]; ys[0] = place[1]; ons[0] = 1; }
		// shadows
		g.fillStyle = "rgba(0,0,0,0.28)";
		for (i = 0; i < n; i++) if (ons[i]) { var p = w2s(xs[i], ys[i]); g.beginPath(); g.ellipse(p[0] + R * k * 0.22, p[1] + R * k * 0.28, R * k * 0.98, R * k * 0.9, 0, 0, 7); g.fill(); }
		// the guide (under the balls)
		var c0 = [xs[0], ys[0]];
		if (aiming && (S.guide !== "off" || mode === "solo") && !cpuAim) drawGuide(g, c0);
		// balls
		for (i = 0; i < n; i++) if (ons[i]) {
			var q = w2s(xs[i], ys[i]), sp = sprite(st.k[i]), sz = sp.width / LY.dpr;
			g.drawImage(sp, q[0] - sz / 2, q[1] - sz / 2, sz, sz);
		}
		if (aiming && st.bih && place) {
			var okp = B.placeOk(st, place[0], place[1]), qq = w2s(place[0], place[1]);
			g.strokeStyle = okp ? "rgba(255,255,255,0.85)" : "#ff4d4d"; g.lineWidth = 2; g.setLineDash([4, 4]);
			g.beginPath(); g.arc(qq[0], qq[1], R * k * 1.55, 0, 7); g.stroke(); g.setLineDash([]);
			if (st.zone !== "any") drawZone(g);
		}
		// the cue stick
		if ((aiming && ons[0]) || (anim && anim.strike !== undefined)) drawCue(g, c0);
	}
	function drawZone(g) {
		var T = st.T, k = LY.k;
		g.fillStyle = "rgba(255,255,255,0.07)";
		if (st.zone === "D") {
			var bx = -T.L / 2 + T.baulk, c = w2s(bx, 0);
			g.beginPath(); g.moveTo(c[0], c[1]);
			if (LY.up) g.arc(c[0], c[1], T.dR * k, 0, Math.PI); else g.arc(c[0], c[1], T.dR * k, Math.PI / 2, Math.PI * 1.5);
			g.closePath(); g.fill();
		} else {
			var a = w2s(-T.L / 2, -T.W / 2), b = w2s(-T.L / 4, T.W / 2);
			g.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
		}
	}
	function drawGuide(g, c0) {
		var d = B.dirOf(aim), gd = B.guide(st, c0[0], c0[1], d.x, d.y), R = st.T.R, k = LY.k, short = S.guide === "short" && mode !== "solo";
		var maxLen = short ? 0.32 : 9;
		var a = w2s(c0[0], c0[1]);
		g.lineWidth = Math.max(1.2, 0.004 * k);
		g.strokeStyle = "rgba(255,255,255,0.75)";
		var endT = gd.kind === "none" ? 0.5 : Math.min(gd.t, maxLen);
		var e = w2s(c0[0] + d.x * endT, c0[1] + d.y * endT);
		g.setLineDash([6, 5]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(e[0], e[1]); g.stroke(); g.setLineDash([]);
		if (gd.kind === "ball" && gd.t <= maxLen) {
			var legal = B.targets(st).indexOf(gd.b) >= 0 || (st.brk && st.g.table === "pool");
			var gp = w2s(gd.x, gd.y);
			g.strokeStyle = legal ? "rgba(255,255,255,0.9)" : "#ff5c5c";
			g.beginPath(); g.arc(gp[0], gp[1], R * k, 0, 7); g.stroke();
			if (!short) {
				var ob = w2s(st.x[gd.b], st.y[gd.b]), ol = 0.18 + 0.75 * Math.max(0, gd.cut);
				var oe = w2s(st.x[gd.b] + gd.ox * ol, st.y[gd.b] + gd.oy * ol);
				g.strokeStyle = legal ? "rgba(255,240,120,0.95)" : "rgba(255,120,120,0.9)"; g.lineWidth = Math.max(1.5, 0.005 * k);
				g.beginPath(); g.moveTo(ob[0], ob[1]); g.lineTo(oe[0], oe[1]); g.stroke();
				var tl = 0.08 + 0.3 * Math.sqrt(Math.max(0, 1 - gd.cut * gd.cut)), te = w2s(gd.x + gd.tx * tl, gd.y + gd.ty * tl);
				g.strokeStyle = "rgba(160,220,255,0.75)"; g.lineWidth = Math.max(1, 0.003 * k);
				g.beginPath(); g.moveTo(gp[0], gp[1]); g.lineTo(te[0], te[1]); g.stroke();
			}
		} else if (gd.kind === "rail" && !short) {
			var rp = w2s(gd.x, gd.y), re = w2s(gd.x + gd.rx * 0.35, gd.y + gd.ry * 0.35);
			g.strokeStyle = "rgba(255,255,255,0.45)"; g.setLineDash([3, 5]);
			g.beginPath(); g.moveTo(rp[0], rp[1]); g.lineTo(re[0], re[1]); g.stroke(); g.setLineDash([]);
			g.strokeStyle = "rgba(255,255,255,0.75)"; g.beginPath(); g.arc(rp[0], rp[1], R * k, 0, 7); g.stroke();
		}
	}
	function drawCue(g, c0) {
		var d = B.dirOf(aim), R = st.T.R, k = LY.k;
		var pull = anim && anim.strike !== undefined ? (0.03 + 0.17 * power / 1000) * (1 - anim.strike) : 0.03 + 0.17 * power / 1000;
		var s0 = R + 0.006 + pull, len = 1.45;
		var a = w2s(c0[0] - d.x * s0, c0[1] - d.y * s0), b = w2s(c0[0] - d.x * (s0 + len), c0[1] - d.y * (s0 + len));
		var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), w0 = 0.0065 * k, w1 = 0.015 * k;
		g.save(); g.translate(a[0], a[1]); g.rotate(ang);
		g.fillStyle = "rgba(0,0,0,0.25)"; g.beginPath(); g.moveTo(3, w0 + 3); g.lineTo(L + 3, w1 + 3); g.lineTo(L + 3, 3 - w1); g.lineTo(3, 3 - w0); g.fill();
		var cg = g.createLinearGradient(0, 0, L, 0);
		cg.addColorStop(0, "#5a7fb8"); cg.addColorStop(0.012, "#f1e6cf"); cg.addColorStop(0.03, "#f1e6cf"); cg.addColorStop(0.62, "#d8b27a"); cg.addColorStop(0.64, "#2b1a10"); cg.addColorStop(0.72, "#5b2e14"); cg.addColorStop(1, "#1d120b");
		g.fillStyle = cg; g.beginPath(); g.moveTo(0, -w0); g.lineTo(L, -w1); g.lineTo(L, w1); g.lineTo(0, w0); g.closePath(); g.fill();
		g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.stroke();
		g.restore();
	}

	/* ---------- playing a shot (animation + sound) ---------- */
	var FT = 33 * 0.0005;
	function show(res, done) {
		var f = res.sim.frames;
		var item = { frames: f, ev: res.sim.ev, done: done, msg: res.msg, res: res };
		lastShow = item;
		queue.push(item);
		if (!anim) nextAnim();
	}
	function nextAnim() {
		var it = queue.shift();
		if (!it) { anim = null; render(); draw(); return; }
		anim = { frames: it.frames, ev: it.ev, done: it.done, idx: 0, evi: 0, strike: 0, t0: performance.now(), playing: false, pre: it.frames[0], item: it };
		power = power || 350;
		var spd = +S.speed || 1;
		var loop = function (now) {
			if (!anim || anim.frames !== it.frames) return;
			if (anim.strike !== undefined) {
				var sf = (now - anim.t0) / 140;
				if (sf >= 1) { delete anim.strike; anim.playing = true; anim.t1 = now; sound("cue", 0.35 + power / 1600); }
				else anim.strike = sf;
			} else {
				anim.idx = (now - anim.t1) / 1000 * spd / FT;
				var tNow = anim.idx * FT;
				while (anim.evi < anim.ev.length && anim.ev[anim.evi].t <= tNow) { playEv(anim.ev[anim.evi]); anim.evi++; }
				if (anim.idx >= anim.frames.length - 1) {
					var dn = anim.done; anim = null;
					if (dn) dn();
					if (queue.length) nextAnim(); else { render(); draw(); }
					return;
				}
			}
			draw();
			requestAnimationFrame(loop);
		};
		render();
		requestAnimationFrame(loop);
	}
	function skipAnim() {
		if (!anim) return;
		anim.t1 = (anim.t1 || performance.now()) - 1e7; delete anim.strike; anim.playing = true;
	}
	function replayLast() {
		if (!lastShow || anim || busy) return;
		anim = null;
		var it = lastShow, keep = { frames: it.frames, ev: it.ev, done: null, msg: it.msg, res: it.res };
		queue.push(keep); nextAnim();
	}

	/* sound (WebAudio, made on the fly) */
	var AC = null, noiseBuf = null, sndCount = 0, sndT = 0;
	function ensureAudio() {
		if (AC || !S.snd) return;
		try {
			AC = new (window.AudioContext || window.webkitAudioContext)();
			noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.25, AC.sampleRate);
			var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		} catch (e) { AC = null; }
	}
	function sound(kind, vol) {
		if (!S.snd || !AC || document.hidden) return;
		var now = AC.currentTime;
		if (now - sndT > 0.05) { sndT = now; sndCount = 0; }
		if (++sndCount > 4) return;
		vol = Math.max(0.03, Math.min(1, vol));
		var src = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
		src.buffer = noiseBuf;
		if (kind === "ball") { f.type = "bandpass"; f.frequency.value = 2600 + Math.random() * 600; f.Q.value = 2.2; gn.gain.setValueAtTime(vol * 0.9, now); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.05); }
		else if (kind === "rail") { f.type = "lowpass"; f.frequency.value = 380; gn.gain.setValueAtTime(vol * 0.9, now); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.09); }
		else if (kind === "cue") { f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 1.5; gn.gain.setValueAtTime(vol * 0.7, now); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.04); }
		else { f.type = "lowpass"; f.frequency.value = 220; gn.gain.setValueAtTime(0.0001, now); gn.gain.linearRampToValueAtTime(0.7, now + 0.02); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.25); }
		src.connect(f); f.connect(gn); gn.connect(AC.destination);
		src.start(now); src.stop(now + 0.3);
	}
	function playEv(e) {
		if (e.e === "hit") sound("ball", e.v / 3);
		else if (e.e === "rail") sound("rail", e.v / 3.5);
		else if (e.e === "pot") sound("pot", 0.8);
	}

	/* ===================================================================== input ===================================================================== */
	var drag = null;
	function evXY(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
	cv.addEventListener("pointerdown", function (e) {
		if (e.button > 0) return;
		ensureAudio();
		if (anim) { skipAnim(); return; }
		if (!canShoot()) return;
		var p = evXY(e), w = s2w(p[0], p[1]), c = cueXY();
		cv.setPointerCapture(e.pointerId);
		if (st.bih && Math.hypot(w[0] - c[0], w[1] - c[1]) < st.T.R * 2.4) {
			drag = { kind: "ball", ox: c[0] - w[0], oy: c[1] - w[1] };
			cv.classList.add("is-dragball");
		} else {
			drag = { kind: "aim" };
			setAimTo(w);
		}
		e.preventDefault();
	});
	cv.addEventListener("pointermove", function (e) {
		var p = evXY(e), w = s2w(p[0], p[1]);
		if (!drag) {
			if (canShoot() && st.bih && LY) { var c = cueXY(); cv.classList.toggle("is-place", Math.hypot(w[0] - c[0], w[1] - c[1]) < st.T.R * 2.4); }
			return;
		}
		if (drag.kind === "ball") {
			place = clampPlace(w[0] + drag.ox, w[1] + drag.oy);
			need();
		} else setAimTo(w);
	});
	function endDrag() { if (drag) { drag = null; cv.classList.remove("is-dragball"); render(); } }
	cv.addEventListener("pointerup", endDrag);
	cv.addEventListener("pointercancel", endDrag);
	function clampPlace(x, y) {
		var T = st.T, R = T.R, L = T.L / 2 - R * 1.01, W = T.W / 2 - R * 1.01;
		x = Math.max(-L, Math.min(L, x)); y = Math.max(-W, Math.min(W, y));
		if (st.zone === "kitchen") x = Math.min(x, -T.L / 4);
		if (st.zone === "D") {
			var bx = -T.L / 2 + T.baulk; x = Math.min(x, bx);
			var dx = x - bx, dd = Math.sqrt(dx * dx + y * y), lim = T.dR * 0.999;
			if (dd > lim) { x = bx + dx / dd * lim; y = y / dd * lim; }
		}
		return [x, y];
	}
	function setAimTo(w) {
		var c = cueXY(), dx = w[0] - c[0], dy = w[1] - c[1];
		if (dx * dx + dy * dy < 1e-6) return;
		aim = B.angleOf(dx, dy);
		renderAim(); need();
	}
	function nudgeAim(units) { aim = ((aim + units) % 3600000 + 3600000) % 3600000; renderAim(); need(); }
	function renderAim() { $("bl-aimv").textContent = (((360 - aim / 10000) % 360 + 360) % 360).toFixed(2) + "°"; }
	// fine aim buttons (hold to repeat)
	root.querySelectorAll(".bl-fine").forEach(function (b) {
		var t = null, rep = function (first) { nudgeAim(+b.getAttribute("data-fine") * (window.event && window.event.shiftKey ? 5000 : 500)); t = setTimeout(rep, first ? 380 : 60); };
		b.addEventListener("pointerdown", function (e) { e.preventDefault(); if (!canShoot()) return; rep(true); });
		["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { b.addEventListener(n, function () { clearTimeout(t); }); });
	});

	/* power bar */
	var pow = $("bl-pow"), powDrag = false;
	function renderPower() {
		var pc = Math.max(1, Math.round(power / 10));
		$("bl-powfill").style.width = (power / 10) + "%"; $("bl-powknob").style.left = (power / 10) + "%";
		$("bl-powv").textContent = pc + "%"; pow.setAttribute("aria-valuenow", pc);
	}
	function powFrom(e) { var r = pow.getBoundingClientRect(); power = Math.max(10, Math.min(1000, (e.clientX - r.left) / r.width * 1000)); renderPower(); need(); }
	pow.addEventListener("pointerdown", function (e) { ensureAudio(); if (!canShoot() && !cpuAim) { if (!canShoot()) return; } powDrag = true; pow.classList.add("is-drag"); pow.setPointerCapture(e.pointerId); powFrom(e); e.preventDefault(); });
	pow.addEventListener("pointermove", function (e) { if (powDrag) powFrom(e); });
	pow.addEventListener("pointerup", function () { if (!powDrag) return; powDrag = false; pow.classList.remove("is-drag"); S.power = Math.round(power); save(); if (S.rel && canShoot()) shoot(); });
	pow.addEventListener("pointercancel", function () { powDrag = false; pow.classList.remove("is-drag"); });
	pow.addEventListener("keydown", function (e) {
		var s = e.shiftKey ? 100 : 20;
		if (e.key === "ArrowRight" || e.key === "ArrowUp") { power = Math.min(1000, power + s); }
		else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { power = Math.max(10, power - s); }
		else if (e.key === "Enter") { shoot(); }
		else return;
		e.preventDefault(); e.stopPropagation(); renderPower(); need();
	});
	$("bl-shoot").addEventListener("click", function () { shoot(); });

	/* spin */
	var spinCv = $("bl-spin"), sctx = spinCv.getContext("2d"), spinDrag = false;
	function drawSpin() {
		var g = sctx, W = spinCv.width, m = W / 2, R = W * 0.44;
		g.clearRect(0, 0, W, W);
		var gr = g.createRadialGradient(m - R * 0.35, m - R * 0.4, R * 0.1, m, m, R);
		gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#c9ccd1");
		g.fillStyle = gr; g.beginPath(); g.arc(m, m, R, 0, 7); g.fill();
		g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2; g.stroke();
		g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1.5;
		g.beginPath(); g.moveTo(m - R, m); g.lineTo(m + R, m); g.moveTo(m, m - R); g.lineTo(m, m + R); g.stroke();
		g.beginPath(); g.arc(m, m, R * 0.5, 0, 7); g.stroke();
		var px = m + spin.x / 100 * R * 0.88, py = m - spin.y / 100 * R * 0.88;
		g.fillStyle = "#e03131"; g.beginPath(); g.arc(px, py, W * 0.075, 0, 7); g.fill();
		g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
		var lab = [];
		if (spin.y > 8) lab.push("Follow " + Math.round(spin.y) + "%"); else if (spin.y < -8) lab.push("Draw " + Math.round(-spin.y) + "%");
		if (spin.x > 8) lab.push("Right " + Math.round(spin.x) + "%"); else if (spin.x < -8) lab.push("Left " + Math.round(-spin.x) + "%");
		$("bl-spinl").textContent = lab.length ? lab.join(", ") : "Centre (no spin)";
	}
	function spinFrom(e) {
		var r = spinCv.getBoundingClientRect(), R = r.width * 0.44 * 0.88;
		var x = (e.clientX - r.left - r.width / 2) / R * 100, y = -(e.clientY - r.top - r.height / 2) / R * 100, d = Math.hypot(x, y);
		if (d > 100) { x = x / d * 100; y = y / d * 100; }
		spin = { x: Math.trunc(x), y: Math.trunc(y) };
		drawSpin(); need();
	}
	spinCv.addEventListener("pointerdown", function (e) { if (!canShoot()) return; spinDrag = true; spinCv.setPointerCapture(e.pointerId); spinFrom(e); e.preventDefault(); });
	spinCv.addEventListener("pointermove", function (e) { if (spinDrag) spinFrom(e); });
	spinCv.addEventListener("pointerup", function () { spinDrag = false; });
	spinCv.addEventListener("dblclick", function () { spin = { x: 0, y: 0 }; drawSpin(); });
	function nudgeSpin(dx, dy) {
		var x = spin.x + dx, y = spin.y + dy, d = Math.hypot(x, y);
		if (d > 100) { x = x / d * 100; y = y / d * 100; }
		spin = { x: Math.trunc(x), y: Math.trunc(y) }; drawSpin(); need();
	}

	/* keyboard */
	document.addEventListener("keydown", function (e) {
		var t = e.target, tag = t && t.tagName;
		if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
		if ($("bl-p-play").hidden || t === pow) return;
		if (t && t.closest && t.closest(".bl-tabs, .bl-setup, .tu-seo")) return;
		var k = e.key.toLowerCase();
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") { if (!canShoot()) return; e.preventDefault(); nudgeAim((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10000 : 500)); }
		else if (e.key === "ArrowUp" || e.key === "ArrowDown") { if (!canShoot()) return; e.preventDefault(); power = Math.max(10, Math.min(1000, power + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 100 : 20))); renderPower(); need(); }
		else if (e.key === " " || k === "enter") { if (t && t.tagName === "BUTTON" && k === "enter") return; e.preventDefault(); if (anim) skipAnim(); else shoot(); }
		else if (k === "w") { if (canShoot()) nudgeSpin(0, 10); }
		else if (k === "s") { if (canShoot()) nudgeSpin(0, -10); }
		else if (k === "a") { if (canShoot()) nudgeSpin(-10, 0); }
		else if (k === "d") { if (canShoot()) nudgeSpin(10, 0); }
		else if (k === "c") { spin = { x: 0, y: 0 }; drawSpin(); need(); }
		else if (k === "r") replayLast();
		else if (k === "u") undo();
		else if (k === "n") { if (mode !== "online" && mode !== "hive") newGame(); }
		else if (k === "f") panelBtn(1);
	});

	/* ---------- fill window / full screen (shared panel-view.js) ---------- */
	function addPanel() {
		if (window.MESPanel && !view.__mesPanel) window.MESPanel.add(view, { bar: $("bl-pbar"), stage: stage, onChange: function () { setTimeout(relayout, 30); } });
	}
	addPanel();
	if (!view.__mesPanel) document.addEventListener("DOMContentLoaded", addPanel);
	window.addEventListener("load", addPanel);
	function panelBtn(n) { var b = view.querySelectorAll(".mes-pbtn")[n]; if (b) b.click(); }
	var roT = null;
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(roT); roT = setTimeout(relayout, 60); }).observe(stage);
	window.addEventListener("resize", function () { clearTimeout(roT); roT = setTimeout(relayout, 80); });

	/* ===================================================================== status ===================================================================== */
	function nameOf(p) {
		if (mode === "solo") return "You";
		if (mode === "cpu") return p === human ? "You" : "Computer (" + LEVEL_NAMES[S.lv] + ")";
		if (mode === "online") return (on.g && on.g.names[p]) || (p === on.seat ? "You" : "Waiting…");
		if (mode === "hive") return hv.R && hv.R.players[p] ? "@" + hv.R.players[p] : "?";
		return (S.names[p] || "").trim() || "Player " + (p + 1);
	}
	function youAre(p) { return mode === "solo" || (mode === "cpu" && p === human) || (mode === "online" && p === on.seat) || (mode === "hive" && hv.R && hv.R.players[p] === hMe()); }
	function miniBall(kind, gone) {
		var snooker = st.g.table === "snooker", col = ballColor(kind, snooker), stripe = !snooker && kind > 8;
		var bg = stripe ? "linear-gradient(#f8f8f2 0 26%, " + col + " 26% 74%, #f8f8f2 74%)" : col;
		var txt = !snooker && kind > 0 ? '<span style="background:#fff;border-radius:50%;width:0.95em;height:0.95em;display:inline-flex;align-items:center;justify-content:center;line-height:1;color:#111">' + kind + "</span>" : "";
		return '<span class="bl-mb' + (gone ? " is-gone" : "") + '" style="background:' + bg + '" title="' + (snooker ? B.SNK_NAMES[kind] : "Ball " + kind) + '">' + txt + "</span>";
	}
	function renderPlayers() {
		var box = $("bl-players"), t = st.g.type, h = "";
		if (st.np === 1) {
			var left = B.ballsLeft(st), ch = t === "C" ? st.g.ch : null;
			h = '<div class="bl-pl is-turn"><span class="bl-turnd"></span><span class="bl-pn">' + esc(st.g.name) + '</span><span class="bl-pg">' + left + " ball" + (left === 1 ? "" : "s") + " left</span>" +
				'<span class="bl-ps">' + st.shots[0] + (ch ? " / " + ch.shots : "") + '</span><span class="bl-pg">shot' + (ch ? "s" : st.shots[0] === 1 ? "" : "s") + "</span></div>";
			box.innerHTML = h; return;
		}
		var shownTurn = anim && anim.item && anim.item.res ? anim.item.res.player : st.turn;
		for (var p = 0; p < 2; p++) {
			var turn = !st.win && shownTurn === p, extra = "", sc = "";
			if (t === "8") {
				var gr = st.grp[p];
				if (gr) {
					var list = gr === "s" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
					extra = '<span class="bl-balls">' + list.map(function (kk) { var id = st.k.indexOf(kk); return miniBall(kk, id < 0 || !st.on[id]); }).join("") + miniBall(8, false) + "</span>";
				} else extra = '<span class="bl-pg">open table</span>';
			} else if (t === "S") {
				sc = '<span class="bl-ps">' + st.score[p] + "</span>";
				if (turn && st.run) extra = '<span class="bl-pg">break ' + st.run + "</span>";
			} else extra = '<span class="bl-pg">' + st.pots[p] + " potted</span>";
			h += '<div class="bl-pl' + (turn ? " is-turn" : "") + '"><span class="bl-turnd"></span><span class="bl-pn">' + esc(nameOf(p)) + "</span>" + extra + sc + "</div>";
		}
		if (t === "9" || t === "10") {
			var tg = B.targets(st);
			if (tg.length && !st.win) h += '<div class="bl-pl"><span class="bl-pg">Hit first:</span>' + miniBall(st.k[tg[0]], false) + '<span class="bl-balls">' + st.k.map(function (kk, id) { return id > 0 && st.on[id] && id !== tg[0] ? miniBall(kk, false) : ""; }).join("") + "</span></div>";
		}
		if (t === "S" && !st.win) {
			var on = B.snookerOn(st), onTxt = on === "red" ? "a red" : on === "colour" ? "any colour" : "the " + B.SNK_NAMES[on];
			h += '<div class="bl-pl"><span class="bl-pg">On: <b>' + onTxt + "</b> · " + B.pointsLeft(st) + " points left</span></div>";
		}
		box.innerHTML = h;
	}
	function renderMsg() {
		var el = $("bl-msg"), m = st.msg || "", tail = "";
		if (anim || queue.length) { el.innerHTML = "&nbsp;"; return; }
		if (st.win) {
			var w = st.win.p;
			if (st.np === 1) tail = "";
			else if (st.win.why === "resign") tail = esc(nameOf(1 - w)) + " resigned: " + esc(nameOf(w)) + " wins.";
			else if (st.win.why === "timeout") tail = esc(nameOf(w)) + " wins (the other player was away).";
			else tail = youAre(w) && mode !== "local" ? "<b>You win!</b>" : "<b>" + esc(nameOf(w)) + " wins.</b>";
			if (st.g.type === "S") tail += " " + st.score[0] + " – " + st.score[1] + ".";
		} else if (busy || (mode === "cpu" && st.turn !== human)) tail = "The computer's shot.";
		else if (mode === "online" && on.g && on.g.status === "wait") tail = "Waiting for someone to join.";
		else if (isHumanTurn()) {
			var who = mode === "local" ? esc(nameOf(st.turn)) + ": your shot" : "Your shot";
			tail = who + (st.bih ? ". Ball in hand: drag the white ball " + B.zoneName(st.zone) + ", then aim." : ".");
			if (st.brk && st.g.table === "pool") tail = who + ": break! Place the cue ball behind the line, aim and hit it hard.";
		} else if (mode === "online" || mode === "hive") tail = "Waiting for " + esc(nameOf(st.turn)) + "'s shot.";
		var foul = /^Foul/.test(m);
		el.innerHTML = (m ? '<span class="' + (foul ? "is-foul" : "") + '">' + esc(m) + "</span> " : "") + tail;
	}
	function render() {
		if (!st) return;
		root.classList.toggle("bl-incpu", mode === "cpu" || (effOpp() === "cpu" && mode !== "online" && mode !== "hive"));
		root.classList.toggle("bl-inlocal", effOpp() === "local");
		root.classList.toggle("bl-solo", B.game(S.game) && B.game(S.game).np === 1);
		renderPlayers(); renderMsg(); renderAim(); renderPower();
		var can = canShoot();
		$("bl-shoot").disabled = !can && !anim;
		$("bl-shoot").textContent = anim ? "Skip ▸▸" : "Shoot";
		$("bl-undo").disabled = !st.hist.length || mode === "online" || mode === "hive";
		$("bl-new").disabled = mode === "online" || mode === "hive";
		$("bl-replay").disabled = !lastShow;
		cv.classList.toggle("is-wait", !can);
		var sv = $("bl-hsave"), saveable = st.win && (mode === "cpu" || mode === "local" || mode === "solo") && st.win.p >= 0 && st.win.why !== "resign";
		var key = st.v + ":" + st.seed + ":" + st.hist.length;
		sv.hidden = !saveable; sv.disabled = !!S.saved[key];
		$("bl-hsaved").innerHTML = saveable && S.saved[key] ? "Saved on Hive: " + txLinks(S.saved[key]) : "";
		renderObar();
		need();
	}
	function finish() {
		var w = st.win.p, key = st.v + "|" + (mode === "cpu" ? S.lv : mode);
		var r = S.stats[key] || { w: 0, l: 0, g: 0, shots: 0, pots: 0, best: 0, fewest: 0 };
		r.g++;
		var me = mode === "cpu" ? human : 0;
		if (mode === "cpu") { if (w === human) r.w++; else r.l++; }
		else if (mode === "solo") { if (w === 0) { r.w++; if (!r.fewest || st.shots[0] < r.fewest) r.fewest = st.shots[0]; } else r.l++; }
		else if (mode === "online" || mode === "hive") { me = mode === "online" ? on.seat : (hv.R && hv.R.players.indexOf(hMe())); if (me === w) r.w++; else if (me >= 0) r.l++; }
		if (me >= 0) { r.shots += st.shots[me] || 0; r.pots += st.pots[me] || 0; if (st.g.type === "S" && st.best[me] > r.best) r.best = st.best[me]; }
		S.stats[key] = r;
		if (st.g.type === "C" && w === 0) { var b0 = S.chal[st.v]; if (!b0 || st.shots[0] < b0) S.chal[st.v] = st.shots[0]; }
		if (mode === "local") score.p[w] = (score.p[w] || 0) + 1;
		storeCur();
		save();
		render();
		if (st.np === 1) toast(st.msg);
		else toast(youAre(w) && mode !== "local" ? "You win! 🎱" : nameOf(w) + " wins.");
	}

	/* ===================================================================== setup ===================================================================== */
	function fillGameSelect() {
		var groups = {}, order = [];
		B.GAMES.concat(B.CHALLENGES.map(function (c) { return B.game(c.id); })).forEach(function (g) { if (!groups[g.group]) { groups[g.group] = []; order.push(g.group); } groups[g.group].push(g); });
		$("bl-game").innerHTML = order.map(function (gn) { return '<optgroup label="' + gn + '">' + groups[gn].map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + "</option>"; }).join("") + "</optgroup>"; }).join("");
	}
	function segSet(id, v) { var bs = $(id).querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-v") === String(v) ? "true" : "false"); }
	function segWire(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b || b.disabled) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); }); }
	function syncSetup() {
		$("bl-game").value = S.game;
		segSet("bl-opp", S.opp); segSet("bl-lv", S.lv); segSet("bl-me", S.me); segSet("bl-ofirst", S.ofirst);
		segSet("bl-guide", S.guide); segSet("bl-orient", S.orient); segSet("bl-speed", S.speed); segSet("bl-cloth", S.cloth);
		$("bl-snd").checked = S.snd; $("bl-rel").checked = S.rel; $("bl-nums").checked = S.nums;
		$("bl-n1").value = S.names[0] || ""; $("bl-n2").value = S.names[1] || "";
		$("bl-name").value = S.name || ""; $("bl-opub").checked = S.opub !== false;
		var g = B.game(S.game);
		$("bl-desc").textContent = g ? g.desc : "";
		$("bl-ovar").textContent = $("bl-hvar").textContent = g && g.online ? g.name : "8-ball (the chosen game can't be played online)";
	}
	$("bl-game").addEventListener("change", function () { S.game = this.value; save(); syncSetup(); newGame(); });
	segWire("bl-opp", function (v) { S.opp = v; save(); newGame(); });
	segWire("bl-lv", function (v) { S.lv = v; save(); if (mode === "cpu" && st.hist.length && !st.win) toast("The new level plays from the computer's next shot."); render(); });
	segWire("bl-me", function (v) { S.me = v; save(); newGame(true); });
	segWire("bl-ofirst", function (v) { S.ofirst = v; save(); });
	segWire("bl-guide", function (v) { S.guide = v; save(); need(); });
	segWire("bl-orient", function (v) { S.orient = v; save(); relayout(); });
	segWire("bl-speed", function (v) { S.speed = v; save(); });
	segWire("bl-cloth", function (v) { S.cloth = v; save(); staticCv = null; need(); });
	$("bl-snd").addEventListener("change", function () { S.snd = this.checked; save(); if (S.snd) ensureAudio(); });
	$("bl-rel").addEventListener("change", function () { S.rel = this.checked; save(); });
	$("bl-nums").addEventListener("change", function () { S.nums = this.checked; save(); sprites = {}; need(); });
	["bl-n1", "bl-n2"].forEach(function (id, i) { $(id).addEventListener("input", function () { S.names[i] = this.value.slice(0, 20); save(); render(); }); });
	$("bl-new").addEventListener("click", function () { newGame(); });
	$("bl-undo").addEventListener("click", undo);
	$("bl-replay").addEventListener("click", replayLast);

	/* ---------- tabs ---------- */
	var tabs = root.querySelectorAll(".bl-tab");
	function showTab(name, focus) {
		for (var i = 0; i < tabs.length; i++) {
			var on1 = tabs[i].getAttribute("data-t") === name;
			tabs[i].setAttribute("aria-selected", on1 ? "true" : "false");
			tabs[i].tabIndex = on1 ? 0 : -1;
			$("bl-p-" + tabs[i].getAttribute("data-t")).hidden = !on1;
			if (on1 && focus) tabs[i].focus();
		}
		if (name === "online") { loadLobby(); loadHiveLobby(); renderHiveCard(); loadRecent(); }
		if (name === "stats") renderStats();
		if (name === "chal") renderChals();
		if (name === "play") setTimeout(relayout, 0);
		lobbyTimer(name === "online");
	}
	$("bl-tabs").addEventListener("click", function (e) { var b = e.target.closest(".bl-tab"); if (b) showTab(b.getAttribute("data-t")); });
	$("bl-tabs").addEventListener("keydown", function (e) {
		var arr = Array.prototype.slice.call(tabs), i = arr.indexOf(document.activeElement);
		if (i < 0) return;
		var j = e.key === "ArrowRight" ? (i + 1) % arr.length : e.key === "ArrowLeft" ? (i + arr.length - 1) % arr.length : e.key === "Home" ? 0 : e.key === "End" ? arr.length - 1 : -1;
		if (j >= 0) { e.preventDefault(); showTab(arr[j].getAttribute("data-t"), true); }
	});

	/* ---------- challenges ---------- */
	function renderChals() {
		$("bl-chals").innerHTML = B.CHALLENGES.map(function (c, i) {
			var best = S.chal[c.id];
			return '<button type="button" class="bl-ch" data-ch="' + c.id + '"><b>' + (i + 1) + ". " + esc(c.name) + '</b><span class="bl-chs">' + esc(c.tip) + '</span><span class="bl-chs">' + (c.table === "snooker" ? "Snooker table · " : "") + c.shots + " shot" + (c.shots > 1 ? "s" : "") + " allowed</span>" +
				(best ? '<span class="bl-chr">✓ Done in ' + best + " shot" + (best > 1 ? "s" : "") + "</span>" : "") + "</button>";
		}).join("");
	}
	$("bl-chals").addEventListener("click", function (e) {
		var b = e.target.closest("[data-ch]"); if (!b) return;
		if (mode === "online" || mode === "hive") return toast("Leave the online game first.");
		S.game = b.getAttribute("data-ch"); save(); syncSetup(); showTab("play"); newGame();
		view.scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------- statistics ---------- */
	function renderStats() {
		var box = $("bl-stats"), keys = Object.keys(S.stats);
		var chDone = B.CHALLENGES.filter(function (c) { return S.chal[c.id]; }).length;
		if (!keys.length && !chDone) { box.innerHTML = '<p class="bl-sub">No finished games yet.</p>'; return; }
		var OPP = { easy: "vs Easy computer", medium: "vs Medium computer", hard: "vs Hard computer", pro: "vs Pro computer", local: "two players here", solo: "on your own", online: "online (guest)", hive: "on Hive" };
		var rows = keys.sort().map(function (k) {
			var r = S.stats[k], p = k.split("|"), pot = r.shots ? Math.round(r.pots * 100 / r.shots) + "%" : "–";
			return "<tr><td>" + esc(B.describe(p[0])) + ' <span class="bl-lobv">' + esc(OPP[p[1]] || p[1]) + "</span></td><td>" + r.g + '</td><td class="w">' + r.w + '</td><td class="l">' + (p[1] === "local" ? "–" : r.l) + "</td><td>" + pot + "</td><td>" + (r.best ? r.best : r.fewest ? r.fewest + " shots" : "–") + "</td></tr>";
		}).join("");
		box.innerHTML = '<table class="bl-stbl"><thead><tr><th>Game</th><th>Played</th><th>Won</th><th>Lost</th><th title="Balls potted per shot (yours)">Pots / shot</th><th title="Snooker: highest break. Practice: fewest shots to clear">Best</th></tr></thead><tbody>' + rows + "</tbody></table>" +
			'<p class="bl-sub" style="margin-top:0.8em">Challenges done: <b>' + chDone + " of " + B.CHALLENGES.length + '</b></p><p><button type="button" class="tu-btn" id="bl-sreset">Delete my statistics</button></p>';
		$("bl-sreset").addEventListener("click", function () { if (confirm("Delete all your billiards statistics and challenge results in this browser?")) { S.stats = {}; S.chal = {}; save(); renderStats(); } });
	}

	/* ---------- rules ---------- */
	function renderRules() {
		var R = [
			["How to play here", "<ul><li><b>Aim</b>: press on the table and drag; the cue follows your finger or mouse. Dragging far from the cue ball gives finer aim. The ⟲ ⟳ buttons and the arrow keys turn it a hair at a time.</li><li><b>Power</b>: drag along the power bar and let go to shoot (or press Shoot / Space).</li><li><b>Spin</b>: drag the red dot on the little white ball. Top = follow (the cue ball keeps rolling after the hit), bottom = draw (it comes back), left / right = side spin, which changes how it comes off the cushions.</li><li><b>Ball in hand</b>: drag the white ball to where you want it, then aim.</li><li><b>The guide</b>: the dotted line shows where the cue ball goes, the circle where it touches the first ball, the yellow line where that ball goes and the blue line where the cue ball heads off (before spin). A red circle means that ball is not allowed first.</li></ul>"],
			["8-ball", "<ul><li>The first player breaks from behind the head string. If balls go in on the break the player carries on; the table stays <b>open</b>.</li><li>On an open table, the first ball you pot decides your group: <b>solids</b> (1-7) or <b>stripes</b> (9-15).</li><li>You must hit a ball of your group first, then pot one of your group or make any ball touch a cushion. Pot one of yours and you play again.</li><li>When your group is cleared, pot the <b>8</b> to win. Pot the 8 early, or in the same shot as a foul, and you lose. The 8 going in on the break is put back on its spot.</li><li><b>Fouls</b> (the cue ball goes in, no ball hit, the wrong ball first, no cushion after the hit) give the other player <b>ball in hand</b> anywhere on the table.</li><li>Here the shot is not called: any legal pot counts.</li></ul>"],
			["9-ball and 10-ball", "<ul><li>Always hit the <b>lowest numbered</b> ball on the table first. Any ball you pot after a legal hit keeps you at the table.</li><li>Pot the 9 (10 in 10-ball) on a legal shot, even in a combination or on the break, and you win.</li><li>A foul gives the other player ball in hand anywhere; a 9 or 10 potted on a foul goes back on its spot.</li><li>No push-out and no three-foul rule here.</li></ul>"],
			["Snooker", "<ul><li>15 reds (1 point each) and six colours: yellow 2, green 3, brown 4, blue 5, pink 6, black 7. Break off from the D.</li><li>Pot a red, then any colour (the colour you hit first is the one you nominate), then a red, and so on. Colours potted while reds remain come back on their spots.</li><li>When the reds are gone, pot the colours in order: yellow, green, brown, blue, pink, black.</li><li><b>Fouls</b> give the other player at least 4 points (or the value of the ball involved, up to 7): hitting the wrong ball first, potting a ball that isn't on, the cue ball going in, missing everything. After a foul the next player plays from where the cue ball stopped, or from the D if it went in.</li><li>The frame ends when the black goes in; a foul with only the black left also ends it. If the scores are level the black is re-spotted.</li><li>Not modelled here: free ball, the miss rule, touching balls and conceding (use New game).</li></ul>"],
			["Practice and challenges", "<p>Practice racks are just you and the balls: no turns, no fouls, and the cue ball comes back in hand anywhere if it goes in. The Challenges tab has set shots (straight pots, cuts, banks, combinations, draw, follow) with a limited number of shots.</p>"],
			["How the physics works", "<p>Every ball slides, then rolls, with real cloth friction: a ball hit without spin slides first and then starts to roll, which is why a stun shot stops dead on a straight hit at short range and follows through from further away. Top and back spin come from where the cue hits the cue ball, and side spin changes the angle off the cushions. Balls collide with a small loss of energy, cushions bounce at about three quarters of the speed, and the pocket jaws can rattle a ball out. The simulation runs 2,000 steps per second of table time and only uses arithmetic that gives exactly the same answer in every browser and on the server, so online and Hive games always agree.</p>"],
			["Online and Hive", "<p>Guest games: make one on the Play online tab and send the link. Hive games: every shot is a custom_json operation (id <code>mes_pool</code>) signed with your posting key; both browsers replay the shots from the chain. A player who is away for five minutes on their turn can lose by a claim. You can also save the result of a game against the computer, a friend or a practice clear to your Hive account (self-reported, but the shots are checked by replaying them).</p>"]
		];
		$("bl-rules").innerHTML = R.map(function (r) { return '<div class="bl-rule"><h3>' + r[0] + "</h3>" + r[1] + "</div>"; }).join("");
	}

	/* ---------- toast + copy ---------- */
	var toastT = null;
	function toast(msg, html) { var t = $("bl-toast"); if (html) t.innerHTML = msg; else t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, html ? 6000 : 3200); }
	function copy(text, msg) {
		var done = function () { toast(msg || "Copied."); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
		else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { prompt("Copy this:", text); } ta.remove(); }
	}

	/* ===================================================================== guest online ===================================================================== */
	var on = { id: null, key: null, seat: 0, g: null, sending: false, timer: null, fails: 0 };
	var API = "/api/billiards";
	function api(method, body, query) {
		if (MOCK) return Promise.resolve().then(function () { return mockApi(method, body, query); });
		var opt = method === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
		return fetch(API + (query || ""), opt).then(function (r) {
			return r.json().catch(function () { return { error: "The server answered strangely (" + r.status + ")." }; }).then(function (j) { if (!r.ok && !j.error) j.error = "Error " + r.status; return j; });
		}, function () { return { error: "No connection to mes.fm." }; });
	}
	function myName() { var n = ($("bl-name").value || "").trim().slice(0, 24); return n || S.guest || (S.guest = "Guest " + (100 + Math.floor(Math.random() * 900))); }
	$("bl-name").addEventListener("change", function () { S.name = this.value.trim().slice(0, 24); save(); });
	$("bl-opub").addEventListener("change", function () { S.opub = this.checked; save(); });
	$("bl-ochange").addEventListener("click", function () { showTab("play"); $("bl-game").focus(); });
	function onlineV() { var g = B.game(S.game); return g && g.online ? g.id : "8"; }
	function setOnlineGame(v, sd, shots) {
		gen++; busy = false; anim = null; queue = []; cpuAim = null; $("bl-think").hidden = true;
		st = B.replay(v, sd, shots) || B.create(v, sd);
		seed = sd;
		place = st.bih ? defaultPlace() : null;
		autoAimNext();
		relayout();
	}
	function startOnline(r) {
		on.id = r.g.id; on.key = r.key; on.seat = r.seat; on.g = r.g; on.fails = 0;
		S.online = { id: on.id, key: on.key, seat: on.seat }; save();
		mode = "online";
		setOnlineGame(r.g.v, r.g.seed, r.g.shots);
		applyServerWin();
		render();
		showTab("play");
		poll(0);
	}
	$("bl-ocreate").addEventListener("click", function () {
		if (mode === "online" || mode === "hive") return toast("You are already in an online game.");
		S.name = ($("bl-name").value || "").trim().slice(0, 24); save();
		var b = this; b.disabled = true;
		api("POST", { act: "new", v: onlineV(), name: myName(), pub: $("bl-opub").checked, first: S.ofirst }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			startOnline(r);
		});
	});
	function join(id) {
		if (mode === "online" && on.id === id) { showTab("play"); return; }
		if (mode === "online" || mode === "hive") return toast("Leave your current online game first.");
		api("POST", { act: "join", id: id, name: myName() }).then(function (r) {
			if (r.error) { toast(r.error); loadLobby(); return; }
			startOnline(r);
			toast("You joined " + (r.g.names[1 - r.seat] || "the game") + ".");
		});
	}
	function leaveOnline() {
		clearTimeout(on.timer);
		on.id = null; on.g = null; S.online = null; save();
		mode = effOpp(); newGame();
	}
	function inviteLink() { return location.origin + location.pathname + "?join=" + on.id; }
	function renderObar() {
		var box = $("bl-obar");
		if (mode === "hive") return renderHbar();
		if (mode !== "online" || !on.g) { box.hidden = true; return; }
		box.hidden = false;
		var g = on.g, other = g.names[1 - on.seat], h = "";
		if (g.status === "wait") {
			h = '<span><span class="bl-dot"></span>Waiting for a player. Send them this link:</span><span class="bl-vbtns"><button type="button" class="bl-vb bl-vb--main" data-o="copy">🔗 Copy invite link</button>' +
				(navigator.share ? '<button type="button" class="bl-vb" data-o="share">Share…</button>' : "") + '<button type="button" class="bl-vb" data-o="cancel">Cancel game</button></span>';
		} else {
			var away = g.status === "play" && st.turn !== on.seat && (g.idle || 0) > 180000;
			h = '<span><span class="bl-dot' + (on.fails > 2 ? " is-off" : "") + '"></span>Online vs <b>' + esc(other || "?") + "</b> · " + esc(B.describe(g.v)) + (on.fails > 2 ? " (reconnecting…)" : "") + '</span><span class="bl-vbtns">';
			if (g.status === "play") {
				if (away) h += '<button type="button" class="bl-vb bl-vb--main" data-o="claim">Claim the win (they are away)</button>';
				h += '<button type="button" class="bl-vb" data-o="resign">Resign</button>';
			} else h += '<button type="button" class="bl-vb bl-vb--main" data-o="rematch">↺ Rematch</button>';
			h += '<button type="button" class="bl-vb" data-o="leave">Leave</button></span>';
		}
		box.innerHTML = h;
	}
	$("bl-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-o]"); if (!b) return;
		var a = b.getAttribute("data-o");
		if (a === "copy") return copy(inviteLink(), "Invite link copied: send it to the other player.");
		if (a === "share") return navigator.share({ title: "Play billiards with me", text: "Join my " + B.describe(on.g.v) + " game", url: inviteLink() }).catch(function () {});
		if (a === "cancel" || a === "leave") {
			if (a === "leave" && on.g && on.g.status === "play" && !confirm("Leave the game? It counts as resigning.")) return;
			api("POST", { act: a === "cancel" ? "cancel" : "leave", id: on.id, key: on.key });
			leaveOnline();
			return;
		}
		if (a === "resign" && !confirm("Resign this game?")) return;
		b.disabled = true;
		api("POST", { act: a, id: on.id, key: on.key }).then(function (r) {
			b.disabled = false;
			if (r.error) return toast(r.error);
			sync(r.g);
		});
	});
	function onlineShot(shot) {
		var n = st.hist.length, str = B.sstr(shot);
		on.sending = true;
		var res = B.apply(st, shot, { frames: true });
		place = null;
		show(res, function () { afterShot(); });
		api("POST", { act: "shot", id: on.id, key: on.key, n: n, m: str }).then(function (r) {
			on.sending = false;
			if (r.error) { toast(r.error); refetch(); return; }
			sync(r.g);
		});
	}
	function refetch() { api("GET", null, "?id=" + on.id).then(function (r) { if (r.g) sync(r.g); }); }
	function applyServerWin() {
		var g = on.g;
		if (g && g.status === "over" && g.win && !st.win) { st.win = { p: g.win.p, why: g.win.why }; }
	}
	function sync(g) {
		if (!g || !on.id || g.id !== on.id) return;
		var prev = on.g, wasOver = st.win;
		on.g = g;
		if (!prev || prev.round !== g.round || g.shots.length < st.hist.length || g.shots.slice(0, st.hist.length).join() !== st.hist.join()) {
			if (prev && prev.round !== g.round) { on.seat = 1 - on.seat; S.online.seat = on.seat; save(); toast("Rematch! The other player breaks this time... or you, if you lost the toss."); }
			setOnlineGame(g.v, g.seed, g.shots);
			wasOver = null;
		} else {
			for (var i = st.hist.length; i < g.shots.length; i++) {
				var res = B.apply(st, g.shots[i], { frames: true });
				if (!res) { setOnlineGame(g.v, g.seed, g.shots); break; }
				show(res, afterShot);
			}
		}
		if (prev && prev.status === "wait" && g.status === "play") toast((g.names[1 - on.seat] || "Someone") + " joined. " + (st.turn === on.seat ? "Your break!" : "They break."));
		applyServerWin();
		render();
		if (st.win && !wasOver && !st._fin && !anim && !queue.length) { st._fin = true; finish(); }
	}
	function poll(delay) {
		clearTimeout(on.timer);
		on.timer = setTimeout(function () {
			if (!on.id) return;
			api("GET", null, "?id=" + on.id).then(function (r) {
				if (!on.id) return;
				if (r.error) {
					on.fails++;
					if (/not found|expired/i.test(r.error)) { toast("This online game is no longer there."); leaveOnline(); return; }
					renderObar();
				} else { var wasBad = on.fails > 2; on.fails = 0; if (!on.sending) sync(r.g); if (wasBad) renderObar(); }
				poll(nextDelay());
			});
		}, delay);
	}
	function nextDelay() {
		var g = on.g, hidden = document.hidden;
		if (!g) return 3000;
		if (g.status === "over") return hidden ? 10000 : 3000;
		var waitingOn = g.status === "wait" || st.turn !== on.seat;
		return hidden ? 6000 : waitingOn ? 1300 : 4000;
	}
	document.addEventListener("visibilitychange", function () { if (!document.hidden && on.id) poll(50); });

	/* lobby */
	var lobT = null;
	function lobbyTimer(onTab) { clearInterval(lobT); if (onTab) lobT = setInterval(function () { if (!document.hidden) { loadLobby(); loadHiveLobby(); } }, 8000); }
	function ago(ms) { var s = Math.round(ms / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
	function firstText(f) { return f === "host" ? "they break" : f === "guest" ? "you break" : "random break"; }
	function loadLobby() {
		api("GET", null, "?lobby=1").then(function (r) {
			var box = $("bl-lobby");
			if (r.error) { box.innerHTML = '<p class="bl-sub">' + esc(r.error) + "</p>"; return; }
			var list = (r.open || []).filter(function (o) { return o.id !== on.id; });
			if (!list.length) { box.innerHTML = '<p class="bl-sub">No open games right now. Make one above, it will show up here for others.</p>'; return; }
			box.innerHTML = '<ul class="bl-lob">' + list.map(function (o) {
				return '<li><span class="bl-lobn">' + esc(o.name || "Guest") + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · " + firstText(o.first) + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-join="' + esc(o.id) + '">Join</button></li>';
			}).join("") + "</ul>";
		});
	}
	$("bl-lobby").addEventListener("click", function (e) { var b = e.target.closest("[data-join]"); if (b) join(b.getAttribute("data-join")); });
	$("bl-orefresh").addEventListener("click", loadLobby);

	/* ===================================================================== Hive games ===================================================================== */
	var H = B.hive;
	var hv = { host: null, gid: null, R: null, pending: [], timer: null, joiners: [], busy: false, ops: {}, lastErr: 0, reOffer: null, listed: false };
	var HA = MOCK ? mockHive() : realHive();
	function realHive() {
		var M = function () { return window.MESHive || null; };
		return {
			user: function () { var u = M() && M().user(); return u ? u.name : ""; },
			login: function (n) { return M() ? M().login(n) : Promise.reject(new Error("The Hive helpers did not load: reload the page.")); },
			logout: function () { if (M()) M().logout(); },
			onChange: function (f) { if (M()) M().onChange(f); else window.addEventListener("load", function () { if (M()) M().onChange(f); }); },
			help: function () { return M() ? M().helpHtml() : ""; },
			send: function (obj, label) {
				var me = this.user();
				return M().keychain().then(function (k) {
					if (!k) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
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
					return M().call("condenser_api.get_account_history", [acct, start, start < 0 ? 200 : Math.min(1000, start + 1), 262144, 0]).then(function (r) {
						r = r || []; pages++;
						all = r.concat(all);
						var oldest = r.length ? r[0] : null, oldT = oldest ? Date.parse(oldest[1].timestamp + "Z") : 0;
						if (oldest && oldest[0] > 0 && oldT > since && pages < 5 && r.length >= (start < 0 ? 200 : 2)) return page(oldest[0] - 1);
						return H.parse(all, acct);
					});
				}
				return page(-1);
			}
		};
	}
	function mockHive() {
		var subs = [];
		function chain() { try { return JSON.parse(localStorage.getItem("mes-billiards:hchain") || "[]"); } catch (e) { return []; } }
		return {
			user: function () { try { return sessionStorage.getItem("mes-billiards:hacct") || ""; } catch (e) { return ""; } },
			login: function (n) { n = String(n || "").replace(/^@/, "").toLowerCase(); if (!H.ACCT_RE.test(n)) return Promise.reject(new Error("Type a Hive username.")); sessionStorage.setItem("mes-billiards:hacct", n); subs.forEach(function (f) { f(); }); return Promise.resolve({ name: n }); },
			logout: function () { sessionStorage.removeItem("mes-billiards:hacct"); subs.forEach(function (f) { f(); }); },
			onChange: function (f) { subs.push(f); },
			help: function () { return ""; },
			send: function (obj) {
				var me = this.user(), c = chain(), now = Date.now(), trx = Math.random().toString(16).slice(2, 12) + Math.random().toString(16).slice(2, 12);
				c.push([c.length + 1, { trx_id: trx, block: Math.floor(now / 3000) + 1, timestamp: new Date(now).toISOString().slice(0, 19),
					op: ["custom_json", { id: H.ID, required_auths: [], required_posting_auths: [me], json: H.json(obj) }] }]);
				localStorage.setItem("mes-billiards:hchain", JSON.stringify(c));
				return new Promise(function (r) { setTimeout(function () { r({ trx: trx }); }, 300); });
			},
			ops: function (acct) {
				var cut = Math.floor(Date.now() / 3000);
				return Promise.resolve(H.parse(chain().filter(function (e) { return e[1].block <= cut && e[1].op[1].required_posting_auths[0] === acct; }), acct));
			}
		};
	}
	function hMe() { return HA.user(); }
	function hLink(host, gid) { return location.origin + location.pathname + "?hive=" + host + "/" + gid; }
	function txLinks(trx) { return trx ? '<a href="https://hivehub.dev/tx/' + esc(trx) + '" target="_blank" rel="noopener">hivehub</a> · <a href="https://hiveblocks.com/tx/' + esc(trx) + '" target="_blank" rel="noopener">hiveblocks</a>' : ""; }
	function renderHiveCard() {
		var box = $("bl-hlogin"), me = hMe();
		$("bl-hmake").hidden = !me;
		if (me) {
			box.innerHTML = '<p class="bl-hwho">Signed in as ' + (MOCK ? "" : '<img alt="" src="https://images.hive.blog/u/' + esc(me) + '/avatar/small">') + "<b>@" + esc(me) + '</b> <button type="button" class="tu-btn" id="bl-hlogout">Log out</button></p>';
			$("bl-hlogout").addEventListener("click", function () { HA.logout(); });
			loadMine();
		} else {
			box.innerHTML = '<div class="bl-hrow"><input class="tu-input" id="bl-huser" placeholder="Your Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn tu-btn--primary" id="bl-hlogin-b">Log in with Hive</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test mode: any username works here, nothing is signed (no Keychain on this local copy)." : "Keychain proves you own the account by signing a message with your posting key; your keys never leave Keychain and mes.fm never sees them.") + "</p>";
			var go = function () {
				var b = $("bl-hlogin-b"); b.disabled = true; b.textContent = "Check Keychain…";
				HA.login($("bl-huser").value).then(function () { toast("Logged in."); }, function (e) {
					b.disabled = false; b.textContent = "Log in with Hive";
					if (e && /keychain|signer/i.test(e.message + (e.code || ""))) { var d = document.createElement("div"); d.innerHTML = HA.help(); box.appendChild(d); }
					else toast((e && e.message) || "Could not log in.");
				});
			};
			$("bl-hlogin-b").addEventListener("click", go);
			$("bl-huser").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
			$("bl-hminebox").hidden = true;
		}
	}
	HA.onChange(function () { renderHiveCard(); render(); });

	function hiveCreate() {
		var me = hMe(); if (!me) return toast("Log in with Hive first.");
		if (mode === "online" || mode === "hive") return toast("Leave the game you are in first.");
		var to = ($("bl-hto").value || "").trim().replace(/^@/, "").toLowerCase();
		if (to && (!H.ACCT_RE.test(to) || to === me)) return toast(to === me ? "You can't challenge yourself." : "That isn't a Hive username.");
		var obj = { a: "open", g: H.newGid(), v: onlineV(), f: S.ofirst };
		if (to) obj.to = to;
		var b = $("bl-hcreate"); b.disabled = true;
		HA.send(obj, to ? "Challenge @" + to + " to " + B.describe(obj.v) : "Open a " + B.describe(obj.v) + " game").then(function (r) {
			b.disabled = false;
			hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]);
			register("hopen", { host: hMe(), g: obj.g });
			toast(obj.to ? "Challenge sent: copy the link above the table and send it to @" + obj.to + "." : "Your game is open: it will show up under Open Hive games.");
		}, function (e) { b.disabled = false; toast(e.message); });
	}
	function register(act, body, tries) {
		tries = tries || 0;
		body.act = act;
		api("POST", body).then(function (r) {
			if (r && r.error && /not on the chain/i.test(r.error) && tries < 6) setTimeout(function () { register(act, body, tries + 1); }, 3500);
			else if (act === "hopen" && r && r.ok) hv.listed = true;
		});
	}
	function pend(obj, trx) { var o = H.clean(JSON.parse(H.json(obj))); o.acct = hMe(); o.trx = trx || ("p" + Math.random()); o.block = 0; o.ts = Date.now(); o.i = 1e12 + hv.pending.length; o.pend = true; return o; }
	function hiveJoin(host, gid) {
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive first, then press Join again."); return; }
		if (host === me) return hiveEnter(host, gid, []);
		toast("Checking the game on Hive…");
		Promise.all([HA.ops(host, 0), HA.ops(me, 0)]).then(function (res) {
			var R = H.build(host, gid, res[0].concat(res[1]), Date.now());
			if (!R.open) return toast("That Hive game wasn't found (it may not be in a block yet: try again in a few seconds).");
			if (R.guest === me || R.status !== "wait") return hiveEnter(host, gid, []);
			if (R.open.to && R.open.to !== me) return toast("That game is a challenge for @" + R.open.to + ".");
			var obj = { a: "join", h: host, g: gid };
			HA.send(obj, "Join @" + host + "'s " + B.describe(R.open.v) + " game").then(function (r) {
				hiveEnter(host, gid, [pend(obj, r.trx)]);
				register("hjoin", { host: host, g: gid, acct: me });
			}, function (e) { toast(e.message); });
		}, function () { toast("No Hive node answered: try again."); });
	}
	function hiveEnter(host, gid, pending) {
		clearTimeout(hv.timer);
		hv.host = host; hv.gid = gid; hv.R = null; hv.pending = pending || []; hv.joiners = []; hv.reOffer = null; hv.listed = false; hv.busy = false; hv.ops = {};
		S.hive = { host: host, gid: gid }; save();
		mode = "hive";
		gen++; busy = false; anim = null; queue = [];
		showTab("play");
		hivePoll(0);
		render();
	}
	function hiveLeave() {
		clearTimeout(hv.timer);
		hv.host = null; hv.R = null; S.hive = null; save();
		mode = effOpp(); newGame();
	}
	function hivePoll(delay) { clearTimeout(hv.timer); hv.timer = setTimeout(hiveRefresh, delay); }
	function hiveRefresh() {
		if (mode !== "hive" || !hv.host) return;
		var me = hMe(), R = hv.R, accts = [hv.host];
		if (R && R.guest) accts.push(R.guest);
		else hv.joiners.forEach(function (a) { if (accts.indexOf(a) < 0) accts.push(a); });
		if (me && accts.indexOf(me) < 0) accts.push(me);
		if (R && R.open && R.open.to && accts.indexOf(R.open.to) < 0) accts.push(R.open.to);
		var since = R && R.open ? R.open.ts - 60000 : 0;
		var jobs = accts.map(function (a) { return HA.ops(a, since).then(function (o) { hv.ops[a] = o; }, function () { hv.lastErr = Date.now(); }); });
		if (!R || R.status === "wait") jobs.push(api("GET", null, "?hg=" + hv.host + "/" + hv.gid).then(function (r) { if (r && r.joiners) hv.joiners = r.joiners.slice(0, 5); }));
		Promise.all(jobs).then(function () {
			if (mode !== "hive" || !hv.host) return;
			hiveRebuild();
			if (hv.R && hv.R.status === "wait" && hv.host === me && !hv.listed && !hv.R.open.to) register("hopen", { host: me, g: hv.gid });
			hivePoll(hiveDelay());
		});
	}
	function hiveDelay() {
		var R = hv.R;
		if (document.hidden) return 9000;
		if (!R || R.status === "wait") return 4000;
		if (R.status === "play") return R.turnAcct === hMe() ? 6000 : 3000;
		return 6000;
	}
	function hiveRebuild() {
		var all = [];
		Object.keys(hv.ops).forEach(function (a) { all = all.concat(hv.ops[a]); });
		var now = Date.now();
		hv.pending = hv.pending.filter(function (p) {
			var seen = all.some(function (o) { return (p.trx && o.trx === p.trx) || (o.acct === p.acct && o.a === p.a && o.g === p.g && o.n === p.n); });
			return !seen && now - p.ts < 120000;
		});
		var prev = hv.R, firstLoad = !prev || !prev.s;
		var mineShown = st && mode === "hive" && prev && prev.s ? st.hist.length : 0;
		var R = H.build(hv.host, hv.gid, all.concat(hv.pending), now, { from: prev, frames: !firstLoad });
		hv.R = R;
		if (R.s) {
			if (firstLoad || !st || st.v !== R.s.v || st.seed !== R.s.seed || R.s.hist.slice(0, st.hist.length).join() !== st.hist.join()) {
				st = B.clone(R.s); place = st.bih ? defaultPlace() : null; autoAimNext(); relayout();
			} else if (R.s.hist.length > st.hist.length) {
				// new shots from the chain (the other player's, or ours confirmed): play the ones we have not shown yet
				var newOnes = R.results.filter(function (r) { return r.n >= mineShown; });
				st = B.clone(R.s);
				newOnes.forEach(function (r) { show(r, afterShot); });
			} else if (R.status !== (prev && prev.status)) st = B.clone(R.s);
			if (R.bad) hv.badWarn = true;
		}
		if (prev && prev.status === "wait" && R.status === "play") toast("@" + R.guest + " joined. " + (R.turnAcct === hMe() ? "Your break!" : "They break."));
		hv.reOffer = null;
		if (R.status === "over") {
			var other = R.players[0] === hMe() ? R.players[1] : R.players[0];
			var mine = H.myGames(other, hv.ops[other] || []).filter(function (g) { return g.re === hv.host + "/" + hv.gid && g.role === "host"; });
			if (mine.length) hv.reOffer = mine[0];
		}
		render();
		if (st && st.win && !st._fin && !anim && !queue.length && prev && prev.status === "play") { st._fin = true; finish(); }
	}
	function hiveSend(obj, label) {
		hv.busy = true; render();
		return HA.send(obj, label).then(function (r) {
			hv.busy = false;
			hv.pending.push(pend(obj, r.trx));
			hiveRebuild();
			hivePoll(2500);
		}, function (e) { hv.busy = false; render(); toast(e.message); throw e; });
	}
	function hiveShot(shot) {
		// show it at once; the chain confirms it a few seconds later
		var n = st.hist.length, str = B.sstr(shot), probe = B.clone(st), res = B.apply(probe, shot);
		hiveSend({ a: "sh", h: hv.host, g: hv.gid, n: n, m: str, c: B.hash(probe) }, "Billiards shot " + (n + 1) + " vs @" + hiveOther()).catch(function () {});
		void res;
	}
	function hiveOther() { var R = hv.R, me = hMe(); if (!R) return ""; return R.players[0] === me ? (R.players[1] || "") : (R.players[0] || R.open && R.open.to || ""); }
	function renderHbar() {
		var box = $("bl-obar"), R = hv.R, me = hMe();
		box.hidden = false;
		var h, link = '<span class="bl-chain">On Hive · game <a href="https://hivehub.dev/@' + esc(hv.host) + '" target="_blank" rel="noopener">@' + esc(hv.host) + "</a>/" + esc(hv.gid) + "</span>";
		if (!R || !R.open) h = '<span><span class="bl-dot is-off"></span>Reading the game from Hive…</span><span class="bl-vbtns"><button type="button" class="bl-vb" data-h="leave">Leave</button></span>';
		else if (R.status === "wait") {
			h = '<span><span class="bl-dot"></span>' + (R.open.to ? "Waiting for @" + esc(R.open.to) + " to accept" : "Waiting for someone on Hive to join") + " · " + esc(B.describe(R.open.v)) + ".</span>" + link + '<span class="bl-vbtns">' +
				(me && me !== hv.host && (!R.open.to || R.open.to === me) ? '<button type="button" class="bl-vb bl-vb--main" data-h="join">Join this game</button>' : "") +
				'<button type="button" class="bl-vb' + (me === hv.host ? " bl-vb--main" : "") + '" data-h="copy">🔗 Copy invite link</button>' + (hv.host === me ? '<button type="button" class="bl-vb" data-h="cancel">Cancel game</button>' : "") + '<button type="button" class="bl-vb" data-h="leave">Leave</button></span>';
		} else if (R.status === "cancelled" || R.status === "expired") {
			h = "<span>This Hive game was " + (R.status === "cancelled" ? "cancelled" : "never joined (open games last an hour)") + '.</span><span class="bl-vbtns"><button type="button" class="bl-vb" data-h="leave">Close</button></span>';
		} else {
			var other = hiveOther(), mine = R.players.indexOf(me) >= 0;
			h = '<span><span class="bl-dot' + (Date.now() - hv.lastErr < 10000 ? " is-off" : "") + '"></span>' + (mine ? "Hive game vs <b>@" + esc(other) + "</b>" : "Watching <b>@" + esc(R.players[0]) + "</b> vs <b>@" + esc(R.players[1]) + "</b>") + " · " + esc(B.describe(R.open.v)) + (hv.pending.some(function (p) { return p.a === "sh"; }) ? " · your shot is on its way to the chain…" : "") + "</span>" + link + '<span class="bl-vbtns">';
			if (R.status === "play" && mine) {
				if (R.turnAcct !== me && Date.now() > R.canClaimAt) h += '<button type="button" class="bl-vb bl-vb--main" data-h="claim">Claim the win (away 5 min)</button>';
				h += '<button type="button" class="bl-vb" data-h="resign">Resign</button>';
			} else if (R.status === "over" && mine) {
				if (hv.reOffer) h += '<button type="button" class="bl-vb bl-vb--main" data-h="accept">Accept @' + esc(other) + "'s rematch</button>";
				else h += '<button type="button" class="bl-vb bl-vb--main" data-h="rematch">↺ Offer a rematch</button>';
			}
			h += '<button type="button" class="bl-vb" data-h="leave">Leave</button></span>';
			if (hv.badWarn) h += '<span class="bl-chain">Note: a shot\'s fingerprint did not match what this browser worked out. Please tell us on the Contact page.</span>';
			if (R.status === "over" && R.trx) {
				h += '<details class="bl-trx"><summary>On the chain (' + (R.trx.moves.length + 2) + ' transactions)</summary><ul>' +
					"<li>Open: " + txLinks(R.trx.open) + "</li><li>Join: " + txLinks(R.trx.join) + "</li>" +
					R.trx.moves.map(function (t, i) { return "<li>Shot " + (i + 1) + ": " + txLinks(t) + "</li>"; }).join("") +
					(R.trx.end && R.trx.moves.indexOf(R.trx.end) < 0 ? "<li>End (" + esc(R.win ? R.win.why : "") + "): " + txLinks(R.trx.end) + "</li>" : "") + "</ul></details>";
			}
		}
		box.innerHTML = h;
	}
	$("bl-obar").addEventListener("click", function (e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.getAttribute("data-h"), R = hv.R;
		if (a === "copy") return copy(hLink(hv.host, hv.gid), "Invite link copied.");
		if (a === "leave") return hiveLeave();
		if (a === "join") return hiveJoin(hv.host, hv.gid);
		if (a === "cancel") return hiveSend({ a: "cancel", h: hv.host, g: hv.gid }, "Cancel my open billiards game").then(function () { register("hcancel", { host: hv.host, g: hv.gid }); }, function () {});
		if (a === "resign") { if (confirm("Resign this Hive game? It is final.")) hiveSend({ a: "res", h: hv.host, g: hv.gid }, "Resign billiards vs @" + hiveOther()).catch(function () {}); return; }
		if (a === "claim") return hiveSend({ a: "claim", h: hv.host, g: hv.gid }, "Claim the win: @" + hiveOther() + " is away").catch(function () {});
		if (a === "accept" && hv.reOffer) return hiveJoin(hv.reOffer.host, hv.reOffer.gid);
		if (a === "rematch" && R) {
			var other = hiveOther(), iWasFirst = R.players[0] === hMe();
			var obj = { a: "open", g: H.newGid(), v: R.open.v, f: iWasFirst ? "guest" : "host", to: other, re: hv.host + "/" + hv.gid };
			HA.send(obj, "Offer @" + other + " a billiards rematch").then(function (r) { hiveEnter(hMe(), obj.g, [pend(obj, r.trx)]); toast("Rematch offered: @" + other + " sees an Accept button."); }, function (e2) { toast(e2.message); });
		}
	});

	/* self-reported results */
	$("bl-hsave").addEventListener("click", function () {
		if (!st.win) return;
		var me = hMe();
		if (!me) { showTab("online"); toast("Log in with Hive (Play online tab) and press Save again on the Play tab."); return; }
		var obj = { a: "rec", g: H.newGid(), v: st.v, sd: st.seed, m: st.hist.join("."), o: mode === "cpu" ? S.lv : "local", s: mode === "cpu" ? human : -1, w: st.win.p };
		if (!H.clean(obj)) return toast("This game is too long to save on Hive.");
		var key = st.v + ":" + st.seed + ":" + st.hist.length, b = this;
		b.disabled = true;
		HA.send(obj, "Save a billiards result (self-reported)").then(function (r) {
			S.saved[key] = r.trx || "?";
			var ks = Object.keys(S.saved); if (ks.length > 80) delete S.saved[ks[0]];
			save(); render();
			if (r.trx) toast("Saved on Hive: " + txLinks(r.trx), true); else toast("Saved on Hive.");
			register("hrec", { acct: me, g: obj.g });
		}, function (e) { b.disabled = false; toast(e.message); });
	});

	/* lobby + my games + recent */
	function loadHiveLobby() {
		api("GET", null, "?hlobby=1").then(function (r) {
			var box = $("bl-hlobby"), me = hMe();
			if (r.error) { box.innerHTML = '<p class="bl-sub">' + esc(r.error) + "</p>"; return; }
			var list = r.open || [];
			if (!list.length) { box.innerHTML = '<p class="bl-sub">No open Hive games right now.' + (me ? " Make one above." : " Log in to make one.") + "</p>"; return; }
			box.innerHTML = '<ul class="bl-lob">' + list.map(function (o) {
				return '<li><span class="bl-lobn">@' + esc(o.host) + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · " + firstText(o.f) + " · " + ago(o.age) + '</span></span><button type="button" class="tu-btn tu-btn--primary" data-hjoin="' + esc(o.host + "/" + o.g) + '">' + (o.host === me ? "Open" : "Join") + "</button></li>";
			}).join("") + "</ul>";
		});
	}
	function loadMine() {
		var me = hMe(); if (!me) return;
		HA.ops(me, Date.now() - 30 * 86400000).then(function (ops) {
			var games = H.myGames(me, ops).slice(0, 12), recs = H.records(ops, 12), box = $("bl-hmine");
			$("bl-hminebox").hidden = !games.length && !recs.length;
			var OPP = { easy: "Easy computer", medium: "Medium computer", hard: "Hard computer", pro: "Pro computer", local: "pass and play / practice" };
			box.innerHTML = (games.length ? '<ul class="bl-lob">' + games.map(function (g) {
				return '<li><span class="bl-lobn">' + (g.role === "host" ? "You opened" + (g.to ? " (challenge to @" + esc(g.to) + ")" : "") : "You joined @" + esc(g.host)) + ' <span class="bl-lobv">· ' + (g.v ? esc(B.describe(g.v)) + " · " : "") + new Date(g.ts).toLocaleString() + " · " + txLinks(g.trx) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(g.host + "/" + g.gid) + '">Open</button></li>';
			}).join("") + "</ul>" : "") +
			(recs.length ? '<h4 class="bl-h4">Saved results (self-reported, checked by replaying the shots)</h4><ul class="bl-lob">' + recs.map(function (o) {
				var res = o.result === "w" ? "Won" : o.result === "l" ? "Lost" : (B.game(o.v).np === 1 ? "Cleared" : "Player " + (o.w + 1) + " won");
				var lk = location.pathname + "?v=" + encodeURIComponent(o.v) + "&sd=" + o.sd + "&m=" + o.shots.join(".");
				return '<li><span class="bl-lobn">' + esc(res) + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · vs " + esc(OPP[o.o] || o.o) + " · " + o.shots.length + " shots" + (B.game(o.v).type === "S" ? " · " + o.score[0] + "–" + o.score[1] : "") + " · " + new Date(o.ts).toLocaleString() + " · " + txLinks(o.trx) + '</span></span><a class="tu-btn" href="' + esc(lk) + '">Replay</a></li>';
			}).join("") + "</ul>" : "");
		}, function () {});
	}
	function loadRecent() {
		api("GET", null, "?hrecent=1").then(function (r) {
			var box = $("bl-hrecent");
			if (!r || r.error || (!(r.games || []).length && !(r.recs || []).length)) { box.innerHTML = '<p class="bl-sub">' + (r && r.error ? esc(r.error) : "Nothing yet.") + "</p>"; return; }
			box.innerHTML = '<ul class="bl-lob">' + (r.games || []).map(function (o) {
				return '<li><span class="bl-lobn">@' + esc(o.host) + " vs @" + esc(o.guest) + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · started " + ago(o.age) + '</span></span><button type="button" class="tu-btn" data-hjoin="' + esc(o.host + "/" + o.g) + '">Watch</button></li>';
			}).join("") + (r.recs || []).map(function (o) {
				return '<li><span class="bl-lobn">@' + esc(o.acct) + " saved a result" + ' <span class="bl-lobv">· ' + esc(B.describe(o.v)) + " · " + esc(o.res) + " · " + ago(o.age) + " · " + txLinks(o.trx) + "</span></span></li>";
			}).join("") + "</ul>";
		});
	}
	$("bl-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hjoin]"); if (!b) return;
		var p = b.getAttribute("data-hjoin").split("/");
		var watching = mode === "hive" && hv.host === p[0] && hv.gid === p[1];
		if (watching && !(hMe() && hv.R && hv.R.status === "wait" && hv.host !== hMe())) return showTab("play");
		if (mode === "online") return toast("Leave the guest game first.");
		if (hMe()) hiveJoin(p[0], p[1]); else hiveEnter(p[0], p[1], []);
	});
	$("bl-hcreate").addEventListener("click", hiveCreate);
	$("bl-hrefresh").addEventListener("click", function () { loadHiveLobby(); loadMine(); loadRecent(); });

	/* in-browser stand-in for /api/billiards (local testing: two tabs can play each other) */
	function mockApi(method, b, query) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-billiards:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-billiards:mock", JSON.stringify(db)); };
		var pub = function (g) { return { id: g.id, v: g.v, seed: g.seed, names: g.names, shots: g.shots, status: g.status, win: g.win, round: g.round, pub: g.pub, first: g.first, idle: now - g.at }; };
		if (method === "GET" && /hlobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return !g.joiners.length && !g.cancelled && !g.to && now - g.ts < 3600000; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, f: g.f, age: now - g.ts }; }) };
		if (method === "GET" && /hrecent/.test(query)) return { games: Object.keys(db).filter(function (k) { return /^h:/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.joiners.length; }).map(function (g) { return { host: g.host, g: g.g, v: g.v, guest: g.joiners[0], age: now - g.ts }; }), recs: (db._recs || []).map(function (o) { return { acct: o.acct, v: o.v, res: o.res, trx: o.trx, age: now - o.ts }; }) };
		if (method === "GET" && /hg=/.test(query)) { var hk = "h:" + decodeURIComponent((/hg=([^&]+)/.exec(query) || [])[1] || ""); return { joiners: db[hk] ? db[hk].joiners : [] }; }
		if (method === "POST" && b.act === "hrec") {
			return HA.ops(b.acct).then(function (ops) {
				var rec = H.records(ops).filter(function (o) { return o.g === b.g; })[0];
				if (!rec) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-billiards:mock") || "{}"); } catch (e) { db2 = {}; }
				db2._recs = [{ acct: b.acct, v: rec.v, res: rec.result === "w" ? "won" : rec.result === "l" ? "lost" : "finished", trx: rec.trx, ts: rec.ts }].concat(db2._recs || []).slice(0, 20);
				localStorage.setItem("mes-billiards:mock", JSON.stringify(db2));
				return { ok: true };
			});
		}
		if (method === "POST" && /^h(open|join|cancel)$/.test(b.act)) {
			var who = b.act === "hjoin" ? b.acct : b.host, want = b.act.slice(1);
			return HA.ops(who).then(function (ops) {
				var op = ops.filter(function (o) { return o.a === want && o.g === b.g && (want === "open" || o.h === b.host); })[0];
				if (!op) return { error: "That operation is not on the chain yet: wait a few seconds." };
				var db2; try { db2 = JSON.parse(localStorage.getItem("mes-billiards:mock") || "{}"); } catch (e) { db2 = {}; }
				var k2 = "h:" + b.host + "/" + b.g;
				if (want === "open") db2[k2] = db2[k2] || { host: b.host, g: b.g, v: op.v, f: op.f, to: op.to || null, ts: op.ts, joiners: [], cancelled: false };
				else if (db2[k2]) { if (want === "join" && db2[k2].joiners.indexOf(who) < 0) db2[k2].joiners.push(who); if (want === "cancel") db2[k2].cancelled = true; }
				localStorage.setItem("mes-billiards:mock", JSON.stringify(db2));
				return { ok: true, joiners: db2[k2] ? db2[k2].joiners : [] };
			});
		}
		if (method === "GET") {
			if (/lobby/.test(query)) return { open: Object.keys(db).filter(function (k) { return !/^h:|^_/.test(k); }).map(function (k) { return db[k]; }).filter(function (g) { return g.status === "wait" && g.pub && now - g.created < 1800000; }).map(function (g) { return { id: g.id, v: g.v, name: g.names[g.tok[0] ? 0 : 1], first: g.first, age: now - g.created }; }) };
			var id = (/id=([a-z0-9]+)/.exec(query) || [])[1], g0 = db[id];
			return g0 ? { g: pub(g0) } : { error: "Game not found (it may have expired)." };
		}
		var g = db[b.id], seat = g ? g.tok.indexOf(b.key) : -1;
		if (b.act === "new") {
			if (!B.onlineGame(b.v)) return { error: "Unknown game." };
			var nid = Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "a"), key = Math.random().toString(36).slice(2), hs = b.first === "guest" ? 1 : b.first === "random" ? (Math.random() < 0.5 ? 0 : 1) : 0;
			var names = [null, null], tok = [null, null]; names[hs] = b.name; tok[hs] = key;
			db[nid] = { id: nid, v: b.v, seed: nid, names: names, tok: tok, shots: [], status: "wait", win: null, round: 0, pub: !!b.pub, first: b.first, created: now, at: now };
			put(); return { g: pub(db[nid]), key: key, seat: hs };
		}
		if (!g) return { error: "Game not found (it may have expired)." };
		if (b.act === "join") {
			if (g.status !== "wait") return { error: "Someone else already joined that game." };
			var s2 = g.tok[0] ? 1 : 0, k2 = Math.random().toString(36).slice(2);
			g.tok[s2] = k2; g.names[s2] = b.name; g.status = "play"; g.at = now; put();
			return { g: pub(g), key: k2, seat: s2 };
		}
		if (seat < 0) return { error: "That isn't your game." };
		if (b.act === "shot") {
			if (g.status !== "play") return { error: "The game isn't running." };
			if (b.n !== g.shots.length) return { error: "Out of step: the table was refreshed." };
			var s = B.replay(g.v, g.seed, g.shots);
			if (s.turn !== seat) return { error: "It's not your turn." };
			if (!B.apply(s, b.m)) return { error: "That shot isn't allowed." };
			g.shots.push(b.m); g.at = now;
			if (s.win) { g.status = "over"; g.win = { p: s.win.p, why: s.win.why }; }
			put(); return { g: pub(g) };
		}
		if (b.act === "resign" || b.act === "leave") { if (g.status === "play") { g.status = "over"; g.win = { p: 1 - seat, why: b.act === "leave" ? "left" : "resign" }; } g.at = now; put(); return { g: pub(g) }; }
		if (b.act === "cancel") { delete db[b.id]; put(); return { ok: true }; }
		if (b.act === "claim") { g.status = "over"; g.win = { p: seat, why: "timeout" }; put(); return { g: pub(g) }; }
		if (b.act === "rematch") {
			if (g.status !== "over") return { error: "Finish this game first." };
			g.tok = [g.tok[1], g.tok[0]]; g.names = [g.names[1], g.names[0]]; g.shots = []; g.status = "play"; g.win = null; g.round++; g.seed = g.id + "r" + g.round; g.at = now; put();
			return { g: pub(g) };
		}
		return { error: "Unknown action." };
	}
	if (MOCK) $("bl-p-online").insertAdjacentHTML("afterbegin", '<p class="tu-note">Test mode: online games are kept in this browser only (no server here); open the page in a second tab to play yourself.</p>');

	/* ---------- start ---------- */
	fillGameSelect();
	if (START && B.game(START) && !(S.cur && S.cur.v === START && !S.cur.done)) S.game = START;
	syncSetup();
	renderRules();
	drawSpin();
	var q = new URLSearchParams(location.search);
	var joinId = q.get("join"), qh = q.get("hive"), qv = q.get("v");
	if (joinId || qh || qv || q.get("g")) { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} }
	if (q.get("g") && B.game(q.get("g"))) { S.game = q.get("g"); syncSetup(); }
	function blank() { st = B.create(onlineV(), "x"); mode = effOpp(); relayout(); render(); }
	if (qh && /^[a-z][a-z0-9.-]{2,15}\/[a-z0-9]{8}$/.test(qh)) {
		blank();
		var qp = qh.split("/");
		setTimeout(function () { if (hMe()) hiveJoin(qp[0], qp[1]); else hiveEnter(qp[0], qp[1], []); }, 300);
	} else if (joinId && /^[a-z0-9]{6,12}$/.test(joinId)) {
		blank();
		if (S.online && S.online.id === joinId) api("GET", null, "?id=" + joinId).then(function (r) { if (r.g) startOnline({ g: r.g, key: S.online.key, seat: S.online.seat }); });
		else { S.online = null; join(joinId); }
	} else if (qv && B.game(qv)) {
		var sd0 = (q.get("sd") || "").slice(0, 16), mv = (q.get("m") || "").split(".").filter(Boolean);
		var s0 = B.replay(qv, sd0, mv);
		S.online = null; S.hive = null; S.game = qv; save(); syncSetup();
		mode = B.game(qv).np === 1 ? "solo" : "local";
		st = s0 || B.create(qv, sd0); seed = st.seed; human = 0;
		place = st.bih ? defaultPlace() : null;
		relayout(); render();
		toast(s0 && mv.length ? "Game loaded from the link (" + mv.length + " shots)." : "Game loaded from the link.");
	} else if (S.hive && S.hive.host) {
		blank();
		var sh = S.hive;
		setTimeout(function () { hiveEnter(sh.host, sh.gid, []); }, 0);
	} else if (S.online && S.online.id) {
		blank();
		mode = "online"; on.id = S.online.id; on.key = S.online.key; on.seat = S.online.seat;
		api("GET", null, "?id=" + on.id).then(function (r) {
			if (r.g) startOnline({ g: r.g, key: on.key, seat: on.seat });
			else { on.id = null; S.online = null; save(); mode = effOpp(); resumeOrNew(); }
		});
	} else resumeOrNew();
	renderHiveCard();
	function resumeOrNew() {
		var c = S.cur;
		if (c && !c.done && c.v === S.game && c.hist && c.hist.length && B.game(c.v)) {
			var s1 = B.replay(c.v, c.seed, c.hist);
			if (s1) {
				st = s1; seed = c.seed; mode = c.mode === "local" || c.mode === "solo" || c.mode === "cpu" ? c.mode : effOpp(); human = c.human || 0;
				place = st.bih ? defaultPlace() : null; autoAimNext();
				relayout(); render(); maybeCpu();
				return;
			}
		}
		newGame(true);
	}
	// for testing in a hidden pane: window.MESBilliardsDebug.state()
	window.MESBilliardsDebug = {
		state: function () { return { v: st.v, seed: st.seed, shots: st.hist.length, turn: st.turn, win: st.win, mode: mode, bih: st.bih, msg: st.msg, busy: busy, anim: !!anim, score: st.score, layout: LY && { w: LY.w, h: LY.h, up: LY.up } }; },
		shoot: function (a, p, sx, sy) { aim = a; power = p; spin = { x: sx || 0, y: sy || 0 }; shoot(); },
		aimAt: function (id) { var c = cueXY(); aim = B.angleOf(st.x[id] - c[0], st.y[id] - c[1]); need(); },
		finishAnim: function () { while (anim) { var dn = anim.done; anim = null; if (dn) dn(); if (queue.length) { var it = queue.shift(); anim = { done: it.done }; } } render(); draw(); },
		st: function () { return st; }
	};
})();
