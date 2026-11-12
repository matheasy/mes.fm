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
	// optional last field: cue elevation in whole degrees (jump shots), only written when > 0 (so older shot strings stay the same)
	B.sstr = function (o) { var f = [i36(o.a), i36(o.p), i36(o.sx || 0), i36(o.sy || 0)]; if (o.bx !== undefined && o.bx !== null) f.push(i36(o.bx), i36(o.by)); if (o.e) f.push(i36(o.e)); return f.join("~"); };
	B.sparse = function (str) {
		var f = String(str || "").split("~");
		if (f.length < 4 || f.length > 7) return null;
		var n = f.map(p36);
		for (var i = 0; i < n.length; i++) if (isNaN(n[i])) return null;
		var o = { a: n[0], p: n[1], sx: n[2], sy: n[3] };
		if (o.a < 0 || o.a >= 3600000 || o.p < 1 || o.p > 1000 || o.sx < -100 || o.sx > 100 || o.sy < -100 || o.sy > 100) return null;
		if (o.sx * o.sx + o.sy * o.sy > 10000) return null;            // the tip must touch the ball (inside the circle)
		if (f.length >= 6) { o.bx = n[4]; o.by = n[5]; if (Math.abs(o.bx) > 30000 || Math.abs(o.by) > 30000) return null; }
		if (f.length === 5 || f.length === 7) { o.e = n[f.length - 1]; if (o.e < 1 || o.e > B.EMAX) return null; }
		return o;
	};
	B.VMAX = 9;
	B.EMAX = 60;   // the steepest cue elevation (degrees)   // cue ball speed at full power, m/s
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
			wx = new Float64Array(n), wy = new Float64Array(n), wz = new Float64Array(n), on = new Uint8Array(n), mv = new Uint8Array(n),
			z = new Float64Array(n), vz = new Float64Array(n);    // height of the ball's bottom above the cloth (jump shots)
		for (i = 0; i < n; i++) { x[i] = s.x[i]; y[i] = s.y[i]; on[i] = s.on[i]; }
		// the cue strike
		var sc = dsc(shot.a), dxs = sc[1], dys = sc[0], v0 = B.speedOf(shot.p);
		var top = 1.25 * v0 * (shot.sy / 100) / R, side = -1.25 * v0 * (shot.sx / 100) / R;
		vx[0] = dxs * v0; vy[0] = dys * v0; wx[0] = -dys * top; wy[0] = dxs * top; wz[0] = side; mv[0] = 1;
		if (shot.e) {
			// an elevated cue drives the ball down into the slate, which throws it up: part of the speed goes up, some is lost
			var es = dsc(shot.e * 10000), up = v0 * es[0] * 0.48, keep = es[1] * 0.92 + 0.08 * (1 - es[0]);
			vx[0] *= keep; vy[0] *= keep;
			if (up > 0.3) { vz[0] = up; z[0] = 1e-9; }
		}
		var ev = [], frames = opts.frames ? [] : null, step = 0, t = 0, maxSteps = Math.round(MAXT / DT);
		var fs = T.mus * GRAV * DT, rs = T.mur * GRAV * DT, zs = 35 * DT, e = T.e, eb = T.eb, R2 = 4 * R * R, invR = 1 / R;
		var railX = G.L - R - 0.004, railY = G.W - R - 0.004;
		function frame() { var f = new Float32Array(n * 4); for (var q = 0; q < n; q++) { f[q * 4] = x[q]; f[q * 4 + 1] = y[q]; f[q * 4 + 2] = on[q]; f[q * 4 + 3] = z[q]; } frames.push(f); }
		if (frames) frame();
		var anyMoving = true;
		while (anyMoving && step < maxSteps) {
			step++; t = step * DT;
			anyMoving = false;
			for (i = 0; i < n; i++) {
				if (!on[i] || !mv[i]) continue;
				var air = z[i] > 0 || vz[i] !== 0;
				if (air) {
					// in the air: gravity only; on landing it bounces (lower each time) until it stays on the cloth
					vz[i] -= GRAV * DT; z[i] += vz[i] * DT;
					if (z[i] <= 0) {
						if (vz[i] < -0.4) { ev.push({ t: t, e: "land", a: i, v: -vz[i] }); vz[i] = -vz[i] * 0.42; z[i] = 1e-9; vx[i] *= 0.95; vy[i] *= 0.95; }
						else { z[i] = 0; vz[i] = 0; }
					}
				} else {
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
				}
				x[i] += vx[i] * DT; y[i] += vy[i] * DT;
				anyMoving = true;
				// cushions + jaws (only near the edge)
				var px = x[i], py = y[i];
				if (z[i] > 1.15 * R) {
					// high enough to clear the cushions: past the rails it has left the table
					if (px > G.L + R || px < -G.L - R || py > G.W + R || py < -G.W - R) { on[i] = 0; mv[i] = 0; vx[i] = vy[i] = vz[i] = wx[i] = wy[i] = wz[i] = 0; z[i] = 0; ev.push({ t: t, e: "off", a: i }); }
				} else if (px > railX || px < -railX || py > railY || py < -railY) {
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
					var ddz = z[j] - z[i], h2 = ddx * ddx + ddy * ddy, d2 = h2 + ddz * ddz;    // a ball in the air can pass over another
					if (d2 >= R2 || h2 === 0) continue;
					var hd = Math.sqrt(h2), d = Math.sqrt(d2), cx = ddx / hd, cy = ddy / hd;
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
		if (!chk || chk.a !== shot.a || chk.p !== shot.p || chk.sx !== (shot.sx || 0) || chk.sy !== (shot.sy || 0) || (chk.e || 0) !== (shot.e || 0)) return false;
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
		var first = -1, tFirst = 0, railAfter = false, pots = [], cuePot = false, cueOff = false, offs = [];
		sim.ev.forEach(function (e) {
			if (e.e === "hit" && first < 0 && (e.a === 0 || e.b === 0)) { first = e.a === 0 ? e.b : e.a; tFirst = e.t; }
			else if (e.e === "rail" && first >= 0 && e.t >= tFirst) railAfter = true;
			else if (e.e === "pot") { if (e.a === 0) cuePot = true; else pots.push(e.a); }
			else if (e.e === "off") { if (e.a === 0) { cuePot = true; cueOff = true; } else offs.push(e.a); }
		});
		var res = { sim: sim, foul: "", msg: "", pots: pots, cue: cuePot, first: first, cont: false, player: p };
		var wasBreak = s.brk;
		s.brk = false; s.bih = false;
		var opp = s.np === 2 ? 1 - p : p;
		// balls that jumped off the table come back: pool balls to the foot spot, snooker colours to their spots (a red stays off)
		offs.forEach(function (id) { if (s.g.table === "snooker") { if (s.k[id] >= 2) respotSnk(s, id); } else respotPool(s, id); });
		res.offs = offs.slice(); res.cueOff = cueOff;
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
				if (offs.length || cueOff) res.foul = (cueOff ? "the cue ball" : "a ball") + " jumped off the table";
				else if (cuePot) res.foul = "the cue ball went in on the break";
				else if (first < 0) res.foul = "no ball was hit";
				if (eight) { respotPool(s, pots.filter(function (id) { return K(id) === 8; })[0]); res.msg = "The 8 went in on the break: it goes back on its spot. "; }
				s.open = true;
				if (!res.foul && objPots.length) { res.cont = true; res.msg += "Good break: " + objPots.length + " in, play on. The table is open."; }
				else if (res.foul) { res.msg += "Foul: " + res.foul + ". Ball in hand."; passTurn(true); }
				else { res.msg += "Nothing went in. The table is open."; passTurn(false); }
				return;
			}
			if (offs.length || cueOff) res.foul = (cueOff ? "the cue ball" : "a ball") + " jumped off the table";
			else if (cuePot) res.foul = "the cue ball went in";
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
			if (offs.length || cueOff) res.foul = (cueOff ? "the cue ball" : "a ball") + " jumped off the table";
			else if (cuePot) res.foul = "the cue ball went in";
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
			if (offs.length || cueOff) res.foul = (cueOff ? "the cue ball" : "a ball") + " jumped off the table";
			else if (cuePot) res.foul = "the cue ball went in";
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
			if (j.ng === 1) o.ng = 1;   // no aiming guide for either player
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
	H.json = function (o) { var c = {}; for (var k in o) if (["a", "g", "v", "f", "to", "re", "h", "n", "m", "c", "o", "s", "w", "sd", "ng"].indexOf(k) >= 0) c[k] = o[k]; return JSON.stringify(c); };
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
