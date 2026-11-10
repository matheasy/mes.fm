/* MES Brick Builder: example builds (window.BB_EXAMPLES). All original designs. Each make() drops parts in building
 * order (that order is also the step-by-step instructions). Colour indexes are MESBrick.COLORS. */
(function (root) {
	'use strict';
	var M = root.MESBrick || (typeof require === 'function' ? require('./lib.js') : null);
	var RED = 0, BLUE = 1, YEL = 2, GRN = 3, WHT = 4, BLK = 5, LG = 6, DG = 7, ORA = 8, BRN = 9, TAN = 10, LIME = 11, SKY = 12, DBL = 13, DGR = 14, DRD = 15, PNK = 16, PUR = 17, TEAL = 18, SAND = 19, GLS = 20, GLD = 21;

	function B(size) {
		var w = new M.World(size || 32), list = [], loads = [];
		var api = {
			w: w,
			put: function (t, x, z, r, c, y) { var yy = w.placeY(t, r || 0, x, z, y); list.push(w.add({ t: t, x: x, z: z, r: r || 0, c: c, y: yy })); return list.length - 1; },
			load: function (i, g) { loads.push([i, g]); },
			// a straight run of 1-wide bricks along x (axis 'x') or z, cells from a to b inclusive; odd rows start with a short brick
			run: function (axis, fixed, a, b, y, c, row) {
				var x = a, first = true;
				while (x <= b) {
					var left = b - x + 1, L = first && row % 2 && left >= 3 ? 2 : Math.min(4, left);
					first = false;
					if (axis === 'x') api.put('b1x' + L, x, fixed, 0, c, y); else api.put('b1x' + L, fixed, x, 1, c, y);
					x += L;
				}
			},
			// a ring of walls, running bond, corners interlocked; type(x, z, row) = 0 wall, 1 gap, 2 glass
			walls: function (x0, z0, W, D, rows, c, y0, type) {
				for (var row = 0; row < rows; row++) {
					var y = y0 + row * 3, odd = row % 2, segs = [];
					[z0, z0 + D - 1].forEach(function (z) { segs.push(['x', z, odd ? x0 + 1 : x0, odd ? x0 + W - 2 : x0 + W - 1]); });
					[x0, x0 + W - 1].forEach(function (x) { segs.push(['z', x, odd ? z0 : z0 + 1, odd ? z0 + D - 1 : z0 + D - 2]); });
					segs.forEach(function (s) {
						var a = s[2], cur = -1, st = a;
						for (var k = a; k <= s[3] + 1; k++) {
							var tp = k > s[3] ? -2 : (type ? type(s[0] === 'x' ? k : s[1], s[0] === 'x' ? s[1] : k, row) : 0);
							if (tp !== cur) {
								if (cur === 0 || cur === 2) api.run(s[0], s[1], st, k - 1, y, cur === 2 ? GLS : c, row);
								cur = tp; st = k;
							}
						}
					});
				}
			},
			done: function (o) { var r = { parts: list.map(function (p) { return { t: p.t, x: p.x, y: p.y, z: p.z, r: p.r, c: p.c }; }), loads: loads }; for (var k in o || {}) r[k] = o[k]; return r; }
		};
		return api;
	}

	var EX = [
		// ---------------- for kids ----------------
		{ id: 'house', cat: 'kids', name: 'Little house', emoji: '🏠', desc: 'Walls in a brick pattern, a door, glass windows and a sloped roof with a chimney.',
			make: function () {
				var b = B();
				b.put('p8x16', 8, 10, 0, GRN);
				b.walls(8, 10, 16, 8, 5, WHT, 1, function (x, z, row) {
					if (z === 10 && (x === 15 || x === 16) && row < 4) return 1;
					if ((z === 10 || z === 17) && (x === 10 || x === 11 || x === 20 || x === 21) && (row === 2 || row === 3)) return 2;
					return 0;
				});
				b.put('p8x16', 8, 10, 0, LG);
				for (var x = 8; x < 24; x += 4) { b.put('s4x2', x, 10, 2, RED); b.put('s4x2', x, 16, 0, RED); }
				for (x = 8; x < 24; x += 4) { b.put('b2x4', x, 12, 0, RED); b.put('b2x4', x, 14, 0, RED); }
				for (x = 8; x < 24; x += 4) { b.put('s4x2', x, 12, 2, RED); b.put('s4x2', x, 14, 0, RED); }
				for (var i = 0; i < 3; i++) b.put('b1x2', 19, 14, 0, DG);
				return b.done();
			} },
		{ id: 'car', cat: 'kids', name: 'Race car', emoji: '🏎️', desc: 'Four wheels, a low body, a glass cabin and a sloped nose.',
			make: function () {
				var b = B();
				b.put('wheel', 12, 14, 1, BLK); b.put('wheel', 18, 14, 1, BLK); b.put('wheel', 12, 17, 1, BLK); b.put('wheel', 18, 17, 1, BLK);
				b.put('p4x8', 12, 14, 0, RED);
				b.put('b2x4', 14, 15, 0, DG, 2);
				b.put('s4x2', 12, 14, 1, RED);
				b.put('b2x4', 14, 14, 1, GLS);
				b.put('b2x4', 16, 14, 1, RED);
				b.put('s4x2', 18, 14, 3, RED);
				b.put('p2x4', 14, 14, 1, BLK);
				b.put('t1x1', 17, 14, 0, YEL); b.put('t1x1', 17, 17, 0, YEL);
				return b.done();
			} },
		{ id: 'tree', cat: 'kids', name: 'Tree', emoji: '🌳', desc: 'A round trunk and leaves that get smaller towards the top.',
			make: function () {
				var b = B();
				for (var i = 0; i < 4; i++) b.put('r2x2', 15, 15, 0, BRN);
				b.put('p6x6', 13, 13, 0, GRN);
				b.put('b2x6', 13, 13, 0, GRN); b.put('b2x6', 13, 15, 0, DGR); b.put('b2x6', 13, 17, 0, GRN);
				b.put('b2x4', 14, 14, 1, LIME); b.put('b2x4', 16, 14, 1, GRN);
				b.put('b2x2', 15, 15, 0, DGR);
				b.put('cone', 15, 15, 0, GRN); b.put('cone', 16, 16, 0, GRN);
				b.put('rp1x1', 13, 13, 0, RED); b.put('rp1x1', 18, 17, 0, RED); b.put('rp1x1', 14, 18, 0, RED);
				return b.done();
			} },
		{ id: 'rocket', cat: 'kids', name: 'Rocket', emoji: '🚀', desc: 'A tall round body with four fins and a red nose.',
			make: function () {
				var b = B();
				b.put('s1x2', 13, 15, 1, RED); b.put('s1x2', 17, 16, 3, RED); b.put('s1x2', 16, 13, 2, RED); b.put('s1x2', 15, 17, 0, RED);
				for (var i = 0; i < 7; i++) b.put('r2x2', 15, 15, 0, i === 3 ? BLUE : WHT);
				b.put('r2x2', 15, 15, 0, RED);
				b.put('cone', 15, 15, 0, RED); b.put('cone', 16, 15, 0, RED); b.put('cone', 15, 16, 0, RED); b.put('cone', 16, 16, 0, RED);
				return b.done();
			} },
		{ id: 'duck', cat: 'kids', name: 'Duck', emoji: '🦆', desc: 'A yellow duck with an orange beak and black eyes.',
			make: function () {
				var b = B();
				b.put('b2x6', 11, 14, 0, YEL); b.put('b2x6', 11, 16, 0, YEL);
				b.put('b2x4', 12, 15, 0, YEL); b.put('s1x2', 10, 15, 1, YEL);
				b.put('b2x2', 16, 15, 0, YEL); b.put('b2x2', 16, 15, 0, YEL);
				b.put('p1x2', 17, 15, 0, ORA); b.put('p1x2', 17, 16, 0, ORA);
				b.put('t1x1', 16, 15, 0, BLK); b.put('t1x1', 16, 16, 0, BLK);
				b.put('t2x4', 12, 15, 0, WHT);
				return b.done();
			} },
		{ id: 'rainbow', cat: 'kids', name: 'Rainbow', emoji: '🌈', desc: 'Each colour steps in a little until the two sides meet at the top.',
			make: function () {
				var b = B(), cols = [RED, ORA, YEL, GRN, BLUE, PUR];
				for (var k = 0; k < 6; k++) { b.put('b1x4', 6 + k, 15, 0, cols[k]); b.put('b1x4', 22 - k, 15, 0, cols[k]); }
				b.put('b1x8', 12, 15, 0, PUR);
				return b.done();
			} },
		{ id: 'snowman', cat: 'kids', name: 'Snowman', emoji: '⛄', desc: 'Three white balls (well, blocks), a hat, eyes and buttons.',
			make: function () {
				var b = B();
				b.put('b2x4', 14, 14, 0, WHT); b.put('b2x4', 14, 16, 0, WHT);
				b.put('b2x4', 14, 14, 1, WHT); b.put('b2x4', 16, 14, 1, WHT);
				b.put('b2x2', 15, 15, 0, WHT); b.put('b2x2', 15, 15, 0, WHT);
				b.put('r2x2', 15, 15, 0, WHT);
				b.put('p2x2', 15, 15, 0, BLK); b.put('r1x1', 15, 15, 0, BLK); b.put('r1x1', 16, 16, 0, BLK);
				b.put('t1x1', 15, 14, 0, ORA, 9);
				return b.done();
			} },
		{ id: 'flower', cat: 'kids', name: 'Flower', emoji: '🌸', desc: 'A green stem with leaves, pink petals and a yellow middle.',
			make: function () {
				var b = B();
				b.put('p4x4', 14, 14, 0, BRN);
				for (var i = 0; i < 4; i++) b.put('b1x1', 15, 15, 0, GRN);
				b.put('p1x3', 14, 15, 0, PNK); b.put('p1x3', 15, 14, 1, PNK);
				b.put('rp1x1', 15, 15, 0, YEL);
				b.put('t1x2', 14, 14, 1, GRN); b.put('t1x2', 16, 16, 1, DGR);
				return b.done();
			} },
		{ id: 'robot', cat: 'kids', name: 'Robot', emoji: '🤖', desc: 'Square legs, a blue body, arms and a head with red eyes.',
			make: function () {
				var b = B();
				for (var i = 0; i < 2; i++) { b.put('b2x2', 13, 15, 0, LG); b.put('b2x2', 17, 15, 0, LG); }
				b.put('b2x6', 13, 15, 0, BLUE); b.put('b2x6', 13, 15, 0, BLUE); b.put('b2x6', 13, 15, 0, BLUE);
				b.put('p2x8', 12, 15, 0, DG);
				b.put('b1x2', 12, 15, 1, LG, 12); b.put('b1x2', 19, 15, 1, LG, 12);
				b.put('b2x2', 15, 15, 0, LG); b.put('b2x2', 15, 15, 0, LG);
				b.put('t1x1', 15, 15, 0, RED); b.put('t1x1', 16, 15, 0, RED);
				b.put('r1x1', 15, 16, 0, YEL);
				return b.done();
			} },
		{ id: 'pyramid', cat: 'kids', name: 'Pyramid', emoji: '🔺', desc: 'Square layers that get smaller: 8, 6, 4, then 2 studs wide.',
			make: function () {
				var b = B(), s, k;
				for (s = 8, k = 0; s >= 2; s -= 2, k++) for (var z = 0; z < s; z += 2) b.put('b2x' + s, 12 + k, 12 + k + z, 0, k % 2 ? SAND : TAN);
				return b.done();
			} },
		{ id: 'castle', cat: 'kids', name: 'Castle tower', emoji: '🏰', desc: 'A square tower with a doorway and battlements on top.',
			make: function () {
				var b = B();
				b.put('p8x8', 12, 12, 0, DG);
				b.walls(12, 12, 8, 8, 8, LG, 1, function (x, z, row) { return z === 12 && (x === 15 || x === 16) && row < 3 ? 1 : 0; });
				b.put('p8x8', 12, 12, 0, DG);
				for (var x = 12; x < 20; x += 2) { b.put('b1x1', x, 12, 0, LG); b.put('b1x1', x, 19, 0, LG); }
				for (var z = 14; z < 19; z += 2) { b.put('b1x1', 12, z, 0, LG); b.put('b1x1', 19, z, 0, LG); }
				b.put('r1x1', 15, 15, 0, BRN); b.put('r1x1', 15, 15, 0, BRN); b.put('p1x2', 15, 15, 0, RED);
				return b.done();
			} },
		{ id: 'heart', cat: 'kids', name: 'Heart picture', emoji: '❤️', desc: 'Pixel art standing up: each row of bricks overlaps the row below so it holds together.',
			make: function () {
				var b = B(), z = 15;
				b.put('b1x1', 15, z, 0, RED);
				b.put('b1x3', 14, z, 0, RED);
				b.put('b1x3', 13, z, 0, RED); b.put('b1x2', 16, z, 0, RED);
				b.put('b1x4', 12, z, 0, RED); b.put('b1x3', 16, z, 0, RED);
				b.put('b1x3', 12, z, 0, RED); b.put('b1x4', 15, z, 0, RED);
				b.put('b1x2', 13, z, 0, RED); b.put('b1x2', 16, z, 0, RED);
				return b.done();
			} },
		{ id: 'boat', cat: 'kids', name: 'Sail boat', emoji: '⛵', desc: 'A brown hull on blue water, with a mast and a flag.',
			make: function () {
				var b = B();
				b.put('p8x16', 8, 12, 0, BLUE);
				b.put('p4x8', 12, 14, 0, BRN);
				b.put('b1x6', 12, 14, 0, BRN); b.put('b1x6', 12, 17, 0, BRN); b.put('b1x2', 12, 15, 1, BRN);
				b.put('s4x2', 18, 14, 1, BRN);
				for (var i = 0; i < 5; i++) b.put('r1x1', 15, 15, 0, BRN);
				b.put('p1x3', 15, 15, 0, WHT); b.put('b1x2', 15, 15, 0, RED);
				return b.done();
			} },

		// ---------------- engineering ----------------
		{ id: 'beam-bridge', cat: 'eng', name: 'Beam bridge', emoji: '🌉', desc: 'Two piers and a flat deck. The deck bends like a beam: try the Strength test and press "Find the breaking load".',
			make: function () {
				var b = B();
				for (var i = 0; i < 4; i++) { b.put('b2x4', 7, 14, 1, LG); b.put('b2x4', 23, 14, 1, LG); }
				var d = b.put('p2x16', 8, 14, 0, DG); b.put('p2x16', 8, 16, 0, DG);
				b.load(d, 200);
				return b.done({ test: d });
			} },
		{ id: 'thin-thick', cat: 'eng', name: 'Thin deck vs thick deck', emoji: '📏', desc: 'The same span twice: one plate thick and three plates thick (staggered so the joints do not line up). Same 200 g weight on each.',
			make: function () {
				var b = B();
				for (var i = 0; i < 3; i++) { b.put('b2x2', 6, 6, 0, LG); b.put('b2x2', 22, 6, 0, LG); b.put('b2x2', 6, 22, 0, LG); b.put('b2x2', 22, 22, 0, LG); }
				var thin = b.put('p2x16', 7, 6, 0, RED);
				b.put('p2x16', 7, 22, 0, BLUE); b.put('p2x4', 7, 22, 0, BLUE); b.put('p2x8', 11, 22, 0, BLUE); b.put('p2x4', 19, 22, 0, BLUE);
				var top = b.put('p2x16', 7, 22, 0, BLUE);
				b.load(thin, 200); b.load(top, 200);
				return b.done({ test: thin });
			} },
		{ id: 'arch-bridge', cat: 'eng', name: 'Arch bridge', emoji: '🌁', desc: 'Arches push their load sideways into the ground, so a curved bridge can be light and strong.',
			make: function () {
				var b = B();
				for (var z = 14; z < 18; z++) b.put('a1x12', 10, z, 0, TAN);
				for (z = 14; z < 18; z++) { b.put('b1x2', 8, z, 0, TAN); b.put('b1x2', 22, z, 0, TAN); b.put('b1x2', 8, z, 0, TAN); b.put('b1x2', 22, z, 0, TAN); b.put('b1x2', 8, z, 0, TAN); b.put('b1x2', 22, z, 0, TAN); }
				var d = b.put('p4x12', 10, 14, 0, DG);
				b.put('p4x4', 6, 14, 0, DG); b.put('p4x4', 22, 14, 0, DG);
				b.load(d, 500);
				return b.done({ test: d });
			} },
		{ id: 'corbel', cat: 'eng', name: 'Corbel arch', emoji: '🧱', desc: 'The oldest way to bridge a gap: each brick sticks out a little past the one below. It stands because the weight stays over the bricks underneath.',
			make: function () {
				var b = B();
				for (var k = 0; k < 6; k++) { b.put('b1x4', 6 + k, 15, 0, k % 2 ? LG : DG); b.put('b1x4', 22 - k, 15, 0, k % 2 ? LG : DG); }
				var top = b.put('b1x8', 12, 15, 0, DG);
				b.load(top, 100);
				return b.done({ test: top });
			} },
		{ id: 'cantilever-bridge', cat: 'eng', name: 'Cantilever bridge', emoji: '🏗️', desc: 'Two towers each hold an arm out on both sides, balanced like a seesaw. A short middle piece joins the arms.',
			make: function () {
				var b = B();
				for (var i = 0; i < 4; i++) { b.put('b2x4', 10, 14, 1, DRD); b.put('b2x4', 20, 14, 1, DRD); }
				b.put('p4x8', 7, 14, 0, DRD); b.put('p4x8', 17, 14, 0, DRD);
				b.put('p4x6', 4, 14, 0, DRD); b.put('p4x6', 22, 14, 0, DRD);
				var mid = b.put('p4x6', 13, 14, 0, DG);
				b.load(mid, 200);
				return b.done({ test: mid });
			} },
		{ id: 'bonds', cat: 'eng', name: 'Brick patterns: stacked vs staggered', emoji: '🧱', desc: 'Left: bricks right on top of each other make separate columns that are not joined at all. Right: staggered bricks lock the whole wall together. Look at "Separate pieces" in the Strength tab.',
			make: function () {
				var b = B();
				for (var r = 0; r < 6; r++) for (var x = 4; x < 16; x += 4) b.put('b1x4', x, 10, 0, RED);
				for (r = 0; r < 6; r++) b.run('x', 20, 18, 29, r * 3, BLUE, r);
				return b.done();
			} },
		{ id: 'crane', cat: 'eng', name: 'Crane with counterweight', emoji: '🏗️', desc: 'The baseplate grip is off here, so the crane can tip. The dark weights behind the tower balance the long arm. Put a weight on the hook and see when it tips.',
			make: function () {
				var b = B();
				b.put('p8x8', 12, 12, 0, YEL);
				for (var i = 0; i < 8; i++) b.put('b2x2', 15, 15, 0, YEL);
				var jib = b.put('p2x16', 11, 15, 0, YEL);
				b.put('b2x2', 11, 15, 0, DG); b.put('b2x2', 11, 15, 0, DG); b.put('b2x2', 11, 15, 0, DG);
				var hook = b.put('b1x1', 26, 15, 0, BLK, 22);
				return b.done({ anchored: false, test: hook });
			} },
		{ id: 'overhang', cat: 'eng', name: 'Leaning stack puzzle', emoji: '📚', desc: 'No stud grip at all here, only balance (like stacking books). Five bricks reach a whole brick length past the edge of the bottom one.',
			make: function () {
				var b = B();
				b.put('b1x8', 10, 15, 0, BLUE); b.put('b1x8', 11, 15, 0, SKY); b.put('b1x8', 12, 15, 0, BLUE); b.put('b1x8', 14, 15, 0, SKY); b.put('b1x8', 18, 15, 0, BLUE);
				return b.done({ anchored: false, grip: 'none' });
			} },

		// ---------------- crash test vehicles and targets (not in the Examples window) ----------------
		{ id: 'flimsy-car', cat: 'crash', name: 'Flimsy car', emoji: '🚙', desc: 'Built quickly: the cabin is stacks of bricks right on top of each other, held by only a few studs.',
			make: function () {
				var b = B();
				b.put('wheel', 12, 14, 1, BLK); b.put('wheel', 18, 14, 1, BLK); b.put('wheel', 12, 17, 1, BLK); b.put('wheel', 18, 17, 1, BLK);
				b.put('p4x8', 12, 14, 0, SKY);
				for (var r = 0; r < 3; r++) { b.put('b1x1', 14, 14, 0, SKY); b.put('b1x1', 14, 17, 0, SKY); b.put('b1x1', 16, 14, 0, SKY); b.put('b1x1', 16, 17, 0, SKY); }
				b.put('t4x4', 14, 14, 0, WHT);
				b.put('b1x2', 18, 15, 1, YEL); b.put('b1x2', 12, 15, 1, YEL);
				return b.done();
			} },
		{ id: 'sturdy-car', cat: 'crash', name: 'Sturdy car', emoji: '🚗', desc: 'Built well: two layers of plates that overlap their joints and bricks that overlap each other, so every part is held by many studs.',
			make: function () {
				var b = B();
				b.put('wheel', 12, 14, 1, BLK); b.put('wheel', 18, 14, 1, BLK); b.put('wheel', 12, 17, 1, BLK); b.put('wheel', 18, 17, 1, BLK);
				b.put('p4x8', 12, 14, 0, GRN); b.put('p2x8', 12, 14, 0, GRN); b.put('p2x8', 12, 16, 0, GRN);
				b.put('b2x4', 12, 14, 1, DGR); b.put('b2x4', 18, 14, 1, DGR);
				b.put('b2x4', 14, 14, 1, GLS); b.put('b2x4', 16, 14, 1, GLS);
				b.put('p4x6', 13, 14, 0, GRN);
				b.put('b2x4', 14, 14, 1, GRN);
				b.put('s4x2', 18, 14, 3, GRN, 7); b.put('s4x2', 12, 14, 1, GRN, 7);
				return b.done();
			} },
		{ id: 'truck', cat: 'crash', name: 'Dump truck', emoji: '🚚', desc: 'A long truck with a cab in front and a load of loose bricks in the back.',
			make: function () {
				var b = B();
				b.put('wheel', 10, 14, 1, BLK); b.put('wheel', 18, 14, 1, BLK); b.put('wheel', 10, 17, 1, BLK); b.put('wheel', 18, 17, 1, BLK);
				b.put('p4x12', 9, 14, 0, DG);
				b.put('b2x4', 18, 14, 1, YEL); b.put('b2x4', 18, 14, 1, GLS); b.put('p4x4', 17, 14, 0, YEL);
				b.put('b1x8', 9, 14, 0, ORA); b.put('b1x8', 9, 17, 0, ORA); b.put('b1x2', 9, 15, 1, ORA);
				for (var i = 0; i < 4; i++) b.put('b1x1', 11 + i % 2 * 3, 15 + (i >> 1), 0, [RED, BLUE, YEL, GRN][i]);
				return b.done();
			} },
		{ id: 'brick-wall', cat: 'target', name: 'Brick wall', emoji: '🧱', desc: 'A one-stud-thick wall in a staggered pattern, stuck to its baseplate.',
			make: function () {
				var b = B();
				for (var r = 0; r < 7; r++) b.run('z', 0, 0, 23, r * 3, r % 2 ? DRD : RED, r);
				return b.done();
			} },

		// ---------------- challenges ----------------
		{ id: 'river', cat: 'chal', name: 'Challenge: cross the river', emoji: '🏞️', desc: 'Build a bridge from one bank to the other that holds 1 kg in the middle. The banks and water are fixed; press "Check my build" when you are done.',
			challenge: { kind: 'span', from: 9, to: 22, mid: [15, 15], need: 1000 },
			make: function () {
				var b = B();
				for (var z = 10; z < 22; z += 2) for (var r = 0; r < 2; r++) { b.put('b2x6', 4, z, 0, LG); b.put('b2x6', 22, z, 0, LG); }
				for (z = 10; z < 22; z += 4) for (var x = 10; x < 22; x += 4) b.put('t4x4', x, z, 0, SKY);
				return b.done({ fixed: true });
			} },
		{ id: 'reach', cat: 'chal', name: 'Challenge: reach out', emoji: '👉', desc: 'Starting from the wall, build an arm that reaches past the red line (10 studs out) and holds 50 g at its far end.',
			challenge: { kind: 'reach', x: 16, need: 50 },
			make: function () {
				var b = B();
				b.put('p4x4', 2, 14, 0, DG);
				for (var r = 0; r < 6; r++) { b.put('b2x4', 2, 14, 1, DG); b.put('b2x4', 4, 14, 1, DG); }
				for (var z = 10; z < 22; z += 2) b.put('t1x2', 16, z, 1, RED);
				return b.done({ fixed: true });
			} }
	];
	if (typeof module === 'object' && module.exports) module.exports = EX; else root.BB_EXAMPLES = EX;
})(typeof window !== 'undefined' ? window : this);
