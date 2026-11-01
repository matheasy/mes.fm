/* MES 3D Studio: ready-made models (window.TD_TEMPLATES). Each make() returns plain objects (no three.js):
 * {type, p (shape settings, mm), pos (centre, mm, Z up), rot (degrees), scl, color, hole, children (groups)}.
 * Positions are where each part's centre goes; the app then puts the whole model on the middle of the plate. */
(function () {
	'use strict';
	var L = window.MES3D;
	function o(type, p, pos, ext) { var r = { type: type, p: p || {}, pos: pos || [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], color: null }; for (var k in ext || {}) r[k] = ext[k]; return r; }
	function hole(type, p, pos, ext) { var r = o(type, p, pos, ext); r.hole = true; return r; }
	function g(children, ext) { var r = { type: 'group', op: 'union', children: children, pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], color: null }; for (var k in ext || {}) r[k] = ext[k]; return r; }
	function pts(a) { return a.map(function (p) { return [+p[0].toFixed(3), +p[1].toFixed(3)]; }); }

	var T = [
		{ id: 'keychain', name: 'Name keychain', emoji: '🔑', tags: 'key ring tag name text gift', desc: 'A rounded tag with your name and a ring hole. Select it and type a new name in the Shape panel.',
			make: function () { return [g([o('plate', { w: 50, d: 18, h: 3, r: 5 }, [0, 0, 1.5]), o('text', { text: 'MES', size: 9, depth: 2, font: 'helvetiker_bold' }, [4, 0, 4]), hole('cylinder', { w: 5, d: 5, h: 10, seg: 32 }, [-18.5, 0, 1.5])], { color: '#f97316', name: 'Name keychain' })]; } },
		{ id: 'phone-stand', name: 'Phone stand', emoji: '📱', tags: 'phone tablet holder desk stand', desc: 'A desk stand for a phone, printed on its side so it needs no supports.',
			make: function () { return [o('extrude', { depth: 70, shapes: [{ o: [[0, 0], [75, 0], [75, 4], [32, 4], [54, 60], [47, 62], [24, 4], [8, 4], [8, 16], [0, 16]] }] }, [0, 0, 31], { rot: [90, 0, 0], color: '#3b82f6', name: 'Phone stand' })]; } },
		{ id: 'cup', name: 'Cup', emoji: '🥤', tags: 'cup mug glass drink lathe revolve', desc: 'A drinking cup made by spinning a side profile around the middle (Revolve).',
			make: function () { return [o('lathe', { seg: 72, pts: [[0, 0], [32, 0], [35, 85], [32.5, 85], [29.6, 3], [0, 3]] }, [0, 0, 42.5], { color: '#14b8a6', name: 'Cup' })]; } },
		{ id: 'box-lid', name: 'Box with lid', emoji: '📦', tags: 'box container storage lid case', desc: 'A small box with 2 mm walls and a lid that pushes on. Print the lid as it lies.',
			make: function () { return [
				g([o('box', { w: 60, d: 40, h: 30 }, [0, 0, 15]), hole('box', { w: 56, d: 36, h: 30 }, [0, 0, 17])], { color: '#8b5cf6', name: 'Box' }),
				g([o('box', { w: 60, d: 40, h: 2 }, [70, 0, 1]), o('box', { w: 55.6, d: 35.6, h: 3 }, [70, 0, 3.5])], { color: '#a78bfa', name: 'Lid' })]; } },
		{ id: 'coaster', name: 'Coaster', emoji: '☕', tags: 'coaster drink mat table text', desc: 'A round coaster with a shallow dish and raised letters.',
			make: function () { return [g([g([o('cylinder', { w: 95, d: 95, h: 5, seg: 96 }, [0, 0, 2.5]), hole('cylinder', { w: 85, d: 85, h: 3, seg: 96 }, [0, 0, 5])]), o('text', { text: 'MES', size: 16, depth: 1.5, font: 'helvetiker_bold' }, [0, 0, 4.25])], { color: '#ef4444', name: 'Coaster' })]; } },
		{ id: 'gear', name: 'Gear', emoji: '⚙️', tags: 'gear cog wheel teeth mechanical', desc: 'A spur gear: change the teeth and size in the Shape panel. Two gears with the same module mesh.',
			make: function () { return [o('gear', { teeth: 20, mod: 2, h: 8, bore: 5 }, [0, 0, 4], { color: '#64748b', name: 'Gear' })]; } },
		{ id: 'pawn', name: 'Chess pawn', emoji: '♟️', tags: 'chess pawn game piece lathe revolve', desc: 'A chess pawn made with Revolve: edit the profile to make the other pieces.',
			make: function () { return [o('lathe', { seg: 64, pts: [[0, 0], [14, 0], [14, 3], [12, 4], [12, 6], [9, 8], [6, 14], [5, 22], [8, 24], [8, 26], [4.5, 27], [7, 30], [8, 34], [7, 38], [4, 40.5], [0, 41]] }, [0, 0, 20.5], { color: '#1f2937', name: 'Pawn' })]; } },
		{ id: 'planter', name: 'Planter pot', emoji: '🪴', tags: 'plant pot planter flower garden drain', desc: 'A plant pot with a drain hole in the bottom.',
			make: function () { return [g([o('lathe', { seg: 72, pts: [[0, 0], [30, 0], [40, 70], [37, 70], [27.6, 3], [0, 3]] }, [0, 0, 35]), hole('cylinder', { w: 8, d: 8, h: 10, seg: 32 }, [0, 0, 1.5])], { color: '#16a34a', name: 'Planter' })]; } },
		{ id: 'cookie-cutter', name: 'Cookie cutter', emoji: '🍪', tags: 'cookie cutter baking heart kitchen', desc: 'A heart cookie cutter: a thin wall with a wider rim on top for your hand.',
			make: function () {
				var b = L.bounds2(L.heartPts(1)), r = b.h / b.w, W = 60, T = 1.2, w2 = W - 2 * T;     // the wall is the heart minus a slightly smaller heart
				return [g([o('heart', { w: W, d: W * r, h: 12 }, [0, 0, 6]), o('heart', { w: W + 8, d: (W + 8) * r, h: 2 }, [0, 0, 1]), hole('heart', { w: w2, d: w2 * r, h: 16 }, [0, -0.6, 7])], { color: '#ec4899', name: 'Cookie cutter' })];
			} },
		{ id: 'hook', name: 'Wall hook', emoji: '🪝', tags: 'hook wall hang coat key screw', desc: 'A wall hook with two screw holes (for 3.5 mm screws).',
			make: function () { return [g([o('extrude', { depth: 20, shapes: [{ o: [[0, 0], [30, 0], [30, 18], [25, 18], [25, 5], [5, 5], [5, 60], [0, 60]] }] }, [15, 0, 30], { rot: [90, 0, 0] }),
				hole('cylinder', { w: 4, d: 4, h: 14, seg: 24 }, [2.5, 0, 50], { rot: [0, 90, 0] }), hole('cylinder', { w: 4, d: 4, h: 14, seg: 24 }, [2.5, 0, 25], { rot: [0, 90, 0] })], { color: '#0ea5e9', name: 'Wall hook' })]; } },
		{ id: 'nameplate', name: 'Desk nameplate', emoji: '🪧', tags: 'name plate desk sign office text', desc: 'A standing name sign for a desk. Type a new name in the Shape panel.',
			make: function () { return [g([o('box', { w: 120, d: 40, h: 4 }, [0, 0, 2]), o('box', { w: 120, d: 4, h: 30 }, [0, 8, 19]), o('text', { text: 'Your Name', size: 12, depth: 2, font: 'helvetiker_bold' }, [0, 5, 19], { rot: [90, 0, 0] })], { color: '#0f766e', name: 'Nameplate' })]; } },
		{ id: 'house', name: 'Simple house', emoji: '🏠', tags: 'house home building roof door window toy', desc: 'Walls, a roof, a chimney, and a door and windows made with holes.',
			make: function () { return [g([o('box', { w: 40, d: 30, h: 25 }, [0, 0, 12.5]), o('extrude', { depth: 34, shapes: [{ o: [[-23, 0], [23, 0], [0, 16]] }] }, [0, 0, 33], { rot: [90, 0, 0] }), o('box', { w: 5, d: 5, h: 10 }, [12, 8, 38]),
				hole('box', { w: 8, d: 6, h: 14 }, [0, -15, 7]), hole('box', { w: 7, d: 6, h: 7 }, [-12, -15, 15]), hole('box', { w: 7, d: 6, h: 7 }, [12, -15, 15])], { color: '#eab308', name: 'House' })]; } },
		{ id: 'dice', name: 'Dice', emoji: '🎲', tags: 'dice die game cube rounded pips', desc: 'A rounded die: a cube kept only where it overlaps a sphere (Intersect), then pips cut as holes.',
			make: function () {
				var c = [g([o('box', { w: 16, d: 16, h: 16 }, [0, 0, 8]), o('sphere', { w: 22.4, d: 22.4, h: 22.4, seg: 48 }, [0, 0, 8])], { op: 'intersect' })];
				var s = 4, pip = function (x, y, z) { var o2 = function (v, mid) { return v === mid + 8 ? v + 0.4 : v === mid - 8 ? v - 0.4 : v; }; c.push(hole('sphere', { w: 3.4, d: 3.4, h: 3.4, seg: 20 }, [o2(x, 0), o2(y, 0), o2(z, 8)])); };
				pip(0, 0, 16);                                                                   // 1 on top
				pip(-s, -8, 8 + s); pip(s, -8, 8 - s);                                            // 2 at the front
				pip(8, -s, 8 + s); pip(8, 0, 8); pip(8, s, 8 - s);                                // 3 on the right
				[[-s, -s], [s, -s], [-s, s], [s, s]].forEach(function (q) { pip(q[0], 8, 8 + q[1]); });   // 4 at the back
				[[-s, -s], [s, -s], [-s, s], [s, s], [0, 0]].forEach(function (q) { pip(-8, q[0], 8 + q[1]); }); // 5 on the left
				[[-s, -s], [0, -s], [s, -s], [-s, s], [0, s], [s, s]].forEach(function (q) { pip(q[0], q[1], 0); }); // 6 underneath
				return [g(c, { color: '#f8fafc', name: 'Dice' })];
			} },
		{ id: 'ring', name: 'Finger ring', emoji: '💍', tags: 'ring finger jewellery band tube', desc: 'A plain band ring, 17 mm inside (about US size 6.5). Change the Tube size for other fingers.',
			make: function () { return [o('tube', { w: 21, d: 21, h: 6, wall: 2, seg: 96 }, [0, 0, 3], { color: '#fbbf24', name: 'Ring' })]; } },
		{ id: 'pencil-holder', name: 'Pencil holder', emoji: '✏️', tags: 'pencil pen holder cup desk hexagon', desc: 'A six-sided pen cup with 3 mm walls.',
			make: function () { return [g([o('cylinder', { w: 70, d: 70, h: 90, seg: 6 }, [0, 0, 45]), hole('cylinder', { w: 64, d: 64, h: 90, seg: 6 }, [0, 0, 48])], { color: '#22c55e', name: 'Pencil holder' })]; } },
		{ id: 'vase', name: 'Vase', emoji: '🏺', tags: 'vase flower curve lathe revolve', desc: 'A curvy vase made with Revolve. Try your slicer\'s "spiral vase" mode.',
			make: function () { return [o('lathe', { seg: 96, pts: [[0, 0], [25, 0], [33, 30], [22, 70], [26, 100], [24, 100], [20, 70], [31, 30], [23, 2], [0, 2]] }, [0, 0, 50], { color: '#6366f1', name: 'Vase' })]; } },
		{ id: 'bookmark', name: 'Bookmark', emoji: '🔖', tags: 'bookmark book read text tassel', desc: 'A thin bookmark with a word and a hole for a ribbon.',
			make: function () { return [g([o('plate', { w: 40, d: 120, h: 1.5, r: 5 }, [0, 0, 0.75]), o('text', { text: 'READ', size: 14, depth: 1, font: 'helvetiker_bold' }, [0, -8, 2], { rot: [0, 0, 90] }), hole('cylinder', { w: 6, d: 6, h: 5, seg: 32 }, [0, 51, 0.75])], { color: '#e11d48', name: 'Bookmark' })]; } },
		{ id: 'top', name: 'Spinning top', emoji: '🌀', tags: 'spinning top toy spin lathe', desc: 'A toy top: flip it over in the slicer if you prefer to print it point up.',
			make: function () { return [o('lathe', { seg: 72, pts: [[0, 0], [1.5, 0], [22, 14], [22, 17], [5, 22], [4, 40], [0, 40]] }, [0, 0, 20], { color: '#f43f5e', name: 'Spinning top' })]; } },
		{ id: 'star-ornament', name: 'Star ornament', emoji: '⭐', tags: 'star christmas tree ornament hang', desc: 'A star with a loop for a string.',
			make: function () { return [g([o('star', { w: 60, d: 60, h: 4, points: 5, inner: 45 }, [0, 0, 2]), o('tube', { w: 10, d: 10, h: 4, wall: 2, seg: 48 }, [0, 32, 2])], { color: '#facc15', name: 'Star ornament' })]; } },
		{ id: 'snowman', name: 'Snowman', emoji: '⛄', tags: 'snowman winter christmas toy spheres', desc: 'Three spheres and a carrot nose: a good first try at putting shapes together.',
			make: function () { return [g([o('sphere', { w: 40, d: 40, h: 40, seg: 48 }, [0, 0, 20]), o('sphere', { w: 28, d: 28, h: 28, seg: 48 }, [0, 0, 50]), o('sphere', { w: 20, d: 20, h: 20, seg: 48 }, [0, 0, 71])], { color: '#e5e7eb', name: 'Snowman' }),
				o('cone', { w: 4, d: 4, h: 10, top: 0, seg: 24 }, [0, -13, 72], { rot: [90, 0, 0], color: '#f97316', name: 'Nose' })]; } },
		{ id: 'tealight', name: 'Tea light holder', emoji: '🕯️', tags: 'candle tealight holder light star', desc: 'A holder for a standard 39 mm tea light, with star cut-outs.',
			make: function () { var c = [o('cylinder', { w: 60, d: 60, h: 30, seg: 72 }, [0, 0, 15]), hole('cylinder', { w: 40, d: 40, h: 30, seg: 72 }, [0, 0, 18])];
				for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; c.push(hole('star', { w: 12, d: 12, h: 20, points: 5, inner: 45 }, [Math.cos(a) * 26, Math.sin(a) * 26, 17], { rot: [90, 0, a * 180 / Math.PI + 90] })); }
				return [g(c, { color: '#f59e0b', name: 'Tea light holder' })]; } },
		{ id: 'plant-label', name: 'Plant label', emoji: '🌱', tags: 'garden plant label stake sign text', desc: 'A stake for a plant pot with a name on it.',
			make: function () { return [g([o('plate', { w: 60, d: 22, h: 2, r: 4 }, [0, 30, 1]), o('extrude', { depth: 2, shapes: [{ o: [[-4, 0], [4, 0], [4, 60], [0, 70], [-4, 60]] }] }, [0, -14, 1], { rot: [0, 0, 180] }), o('text', { text: 'Basil', size: 10, depth: 1.2, font: 'helvetiker_bold' }, [0, 30, 2.6])], { color: '#65a30d', name: 'Plant label' })]; } }
	];
	window.TD_TEMPLATES = T;
})();
