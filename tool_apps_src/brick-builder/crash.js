/* MES Brick Builder: crash test (window.BBCrash(api) is called by app.js once the 3D view is ready).
 * Which joints give way is MESBrick.crashSplit (stud grip against the force needed to stop each part); the flying
 * pieces are simple rigid bodies (gravity, bounces on the road and walls, friction, spin). Millimetres, grams, seconds. */
(function () {
	'use strict';
	if (typeof window === 'undefined' || window.BBCrash) return;
	window.BBCrash = function (A) {
		var T = A.T, M = A.M, EX = window.BB_EXAMPLES || [], S = A.S, scene = A.scene, camera = A.camera, orbit = A.orbit;
		var $ = function (id) { return document.getElementById(id); };
		var PX = M.STUD, PY = M.PLATE, G = 9810, H = 1 / 900;
		var CAPS = { loose: 0.8, normal: 1.5, tight: 3 };
		var TGT = { concrete: { name: 'concrete wall', dt: 0.0015, e: 0.12 }, bricks: { name: 'brick wall', dt: 0.0025, e: 0.1 }, headon: { name: 'another car', dt: 0.0025, e: 0.08 }, foam: { name: 'foam wall', dt: 0.02, e: 0.04 } };
		var BALLS = { s: { name: 'small', m: 60, R: 20 }, m: { name: 'big', m: 250, R: 32 }, l: { name: 'huge', m: 900, R: 48 } };
		var TARGETS = [['mine', '🧱 My build'], ['house', '🏠 Little house'], ['castle', '🏰 Castle tower'], ['robot', '🤖 Robot'], ['brick-wall', '🧱 Brick wall'], ['pyramid', '🔺 Pyramid'], ['snowman', '⛄ Snowman'], ['rocket', '🚀 Rocket'], ['tree', '🌳 Tree']];
		var RAMS = [['truck', '🚚 Dump truck'], ['car', '🏎️ Race car'], ['sturdy-car', '🚗 Sturdy car'], ['flimsy-car', '🚙 Flimsy car']];
		var D = { cmode: '', ctar: 'mine', cram: 'truck', cload: 200, cball: 'm', cswing: 55, cdrop: 150, cveh: 'flimsy-car', ctgt: 'concrete', cspd: 20, cgrip: 'normal', cslow: 0.25, ccam: 'follow', csnd: true, crot: 0 };
		for (var k in D) if (S[k] === undefined) S[k] = D[k];
		var root = new T.Group(); root.visible = false; scene.add(root);
		var env = new T.Group(); root.add(env);
		var bodies = [], spawned = [], wall = null, ball = null, active = false, running = false, simT = 0, accT = 0, lastFrame = 0, rngS = 1, plane = null, stats = null, shake = 0, done = false;
		var XW = 0, WALL_H = 130, WALL_W = 640;
		function ex(id) { return EX.filter(function (e) { return e.id === id; })[0]; }
		function hasWheels(list) { return list.some(function (p) { return M.BY[p.t].shape === 'wheel'; }); }
		function defMode() { var l = A.world().list(); return l.length && hasWheels(l) ? 'drive' : 'hit'; }

		function rng() { rngS = (rngS + 0x6D2B79F5) | 0; var t = Math.imul(rngS ^ (rngS >>> 15), 1 | rngS); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
		function V(x, y, z) { return new T.Vector3(x, y, z); }

		// ---------- scene ----------
		var MATS = {};
		function mat(hex, o) { var k = hex + JSON.stringify(o || {}); if (!MATS[k]) { var p = { color: new T.Color(hex), roughness: 0.85 }; for (var q in o || {}) p[q] = o[q]; MATS[k] = new T.MeshStandardMaterial(p); } return MATS[k]; }
		function buildEnv() {
			while (env.children.length) env.remove(env.children[0]);
			var road = new T.Mesh(new T.BoxGeometry(7000, 4, 1600), mat('#6b7078')); road.position.set(-2400, -2, 0); road.receiveShadow = true; env.add(road);
			var grass = new T.Mesh(new T.BoxGeometry(7000, 2, 5000), mat('#6aa84f')); grass.position.set(-2400, -4, 0); grass.receiveShadow = true; env.add(grass);
			for (var x = -5600; x < 900; x += 300) { var dsh = new T.Mesh(new T.BoxGeometry(150, 0.6, 10), mat('#f5f5f5')); dsh.position.set(x, 0.3, 0); env.add(dsh); }
			[-760, 760].forEach(function (z) { var l = new T.Mesh(new T.BoxGeometry(7000, 0.6, 12), mat('#f5d547')); l.position.set(-2400, 0.3, z); env.add(l); });
			if (S.cmode === 'drive' && (S.ctgt === 'concrete' || S.ctgt === 'foam')) {
				var w = new T.Mesh(new T.BoxGeometry(80, WALL_H, WALL_W), S.ctgt === 'foam' ? mat('#f2d98a', { roughness: 1 }) : mat('#a3a7ad'));
				w.position.set(XW + 40, WALL_H / 2, 0); w.castShadow = true; w.receiveShadow = true; env.add(w);
				if (S.ctgt === 'concrete') for (var i = 0; i < 16; i++) { var st = new T.Mesh(new T.BoxGeometry(2, 14, WALL_W / 16), mat(i % 2 ? '#1f2933' : '#f2c94c')); st.position.set(XW - 0.5, 10, -WALL_W / 2 + (i + 0.5) * WALL_W / 16); env.add(st); }
			}
			var tl = targetList();
			if (tl) makeTarget(tl); else wall = null;
			ball = S.cmode === 'ball' && wall ? makeBall() : null;
			A.sunTo(V(wall ? XW + wall.dx / 2 : -300, 0, 0), Math.max(1800, wall ? wall.h * 6 : 0));
		}
		// the thing that gets smashed (hit / ball modes), or the brick wall the car drives into
		function targetList() {
			var id = S.cmode === 'drive' ? (S.ctgt === 'bricks' ? 'brick-wall' : null) : S.cmode === 'drop' ? null : S.ctar;
			if (!id) return null;
			var list = id === 'mine' ? A.world().list() : (ex(id) || ex('house')).make().parts;
			if (!list.length) list = ex('house').make().parts;
			return M.normList(list);
		}
		function smashList() {   // what falls in drop mode
			var list = S.ctar === 'mine' ? A.world().list() : (ex(S.ctar) || ex('house')).make().parts;
			if (!list.length) list = ex('house').make().parts;
			return M.normList(list).map(function (p, i) { p.u = i + 1; return p; });
		}
		function makeTarget(list) {
			var w = new M.World(64); w.load(list);
			var DX = 0, DZ = 0, HT = 0; w.parts.forEach(function (p) { var s = M.size(M.BY[p.t], p.r); DX = Math.max(DX, p.x + s[0]); DZ = Math.max(DZ, p.z + s[1]); HT = Math.max(HT, p.y + M.BY[p.t].h); });
			var g = new T.Group(); g.position.set(XW, 0, -DZ * PX / 2); env.add(g);
			var base = new T.Mesh(new T.BoxGeometry((DX + 4) * PX, 0.8, (DZ + 4) * PX), A.matFor(S.bcol == null ? 3 : S.bcol));
			base.position.set(DX * PX / 2, -0.2, DZ * PX / 2); base.receiveShadow = true; g.add(base);
			var meshes = {}, flat = {};
			w.parts.forEach(function (p) { var me = new T.Mesh(A.geoFor(p.t), A.matFor(p.c)); A.placeMesh(me, p); me.castShadow = true; me.receiveShadow = true; g.add(me); meshes[p.u] = me; if (p.y === 0 && M.BY[p.t].h === 1) flat[p.u] = 1; });
			wall = { flat: flat, w: w, g: g, meshes: meshes, ox: XW, oz: -DZ * PX / 2, dx: DX * PX, dz: DZ * PX, h: HT * PY, n0: w.parts.length };
		}
		function makeBall() {
			var B = BALLS[S.cball] || BALLS.m, R = B.R, hc = Math.max(R + 8, Math.min(wall.h * 0.45, wall.h - R * 0.3)), L = Math.max(520, wall.h * 2.4 + 200);
			var piv = V(XW + R * 0.55, hc + L, 0), th = -S.cswing * Math.PI / 180;
			var me = new T.Mesh(new T.SphereGeometry(R, 28, 18), mat('#2b2f36', { roughness: 0.35, metalness: 0.7 })); me.castShadow = true; env.add(me);
			var rg = new T.BufferGeometry().setFromPoints([piv, piv]), rope = new T.Line(rg, new T.LineBasicMaterial({ color: '#222' })); env.add(rope);
			var zc = -Math.max(260, wall.dz / 2 + 160), post = new T.Mesh(new T.BoxGeometry(24, piv.y + 30, 24), mat('#e0a100')); post.position.set(piv.x, (piv.y + 30) / 2, zc); post.castShadow = true; env.add(post);
			var arm = new T.Mesh(new T.BoxGeometry(24, 20, -zc + 40), mat('#e0a100')); arm.position.set(piv.x, piv.y + 10, zc / 2 + 10); arm.castShadow = true; env.add(arm);
			var bl = { m: B.m, R: R, L: L, piv: piv, th: th, om: 0, me: me, rope: rope, pos: V(0, 0, 0), hitT: -1, hits: 0, vmax: 0 };
			ballPos(bl); return bl;
		}
		function ballPos(bl) { bl.pos.set(bl.piv.x + bl.L * Math.sin(bl.th), bl.piv.y - bl.L * Math.cos(bl.th), 0); bl.me.position.copy(bl.pos); var a = bl.rope.geometry.attributes.position; a.setXYZ(0, bl.piv.x, bl.piv.y, 0); a.setXYZ(1, bl.pos.x, bl.pos.y, 0); a.needsUpdate = true; }

		// ---------- bodies ----------
		// a body = some parts (grid coordinates of the original build) moving as one rigid piece
		function partBox(p) { var d = M.BY[p.t], s = M.size(d, p.r); return [p.x * PX, p.y * PY, p.z * PX, (p.x + s[0]) * PX, (p.y + d.h) * PY, (p.z + s[1]) * PX]; }
		function makeBody(parts, from, kind) {
			var m = 0, c = V(0, 0, 0);
			parts.forEach(function (p) { var b = partBox(p), pm = M.BY[p.t].mass; m += pm; c.x += pm * (b[0] + b[3]) / 2; c.y += pm * (b[1] + b[4]) / 2; c.z += pm * (b[2] + b[5]) / 2; });
			c.multiplyScalar(1 / m);
			var g = new T.Group(), pts = [], I = 0;
			parts.forEach(function (p) {
				var me = new T.Mesh(A.geoFor(p.t), A.matFor(p.c)); A.placeMesh(me, p); me.position.sub(c); me.castShadow = true; me.receiveShadow = true;
				if (M.BY[p.t].shape === 'wheel') {   // spin wheels about their axle, not their bottom
					var wr = M.BY[p.t].h * PY / 2, piv = new T.Group(); piv.position.copy(me.position); piv.position.y += wr; piv.rotation.copy(me.rotation); piv.rotation.order = 'YXZ';
					me.position.set(0, -wr, 0); me.rotation.set(0, 0, 0); piv.add(me); piv.userData.wheelR = wr; g.add(piv);
				} else g.add(me);
				var b = partBox(p), pm = M.BY[p.t].mass;
				for (var i = 0; i < 8; i++) pts.push(V((i & 1 ? b[3] : b[0]) - c.x, (i & 2 ? b[4] : b[1]) - c.y, (i & 4 ? b[5] : b[2]) - c.z));
				var cx = (b[0] + b[3]) / 2 - c.x, cy = (b[1] + b[4]) / 2 - c.y, cz = (b[2] + b[5]) / 2 - c.z, sx = b[3] - b[0], sy = b[4] - b[1], sz = b[5] - b[2];
				I += pm * (cx * cx + cy * cy + cz * cz + (sx * sx + sy * sy + sz * sz) / 12);
			});
			var w = new M.World(256); parts.forEach(function (p) { w.add(p, true); });
			var R = 0; pts.forEach(function (p) { R = Math.max(R, p.length()); });
			if (from && from.ms) { m *= from.ms; I *= from.ms; }
			var b = { parts: parts, w: w, com: c, m: m, I: Math.max(I, m * 20), pts: pts, R: R, g: g, pos: V(0, 0, 0), q: new T.Quaternion(), v: V(0, 0, 0), om: V(0, 0, 0), roll: false, cool: 0, rest: 0, kind: kind || 'car', side: 1, dist: 0 };
			if (from) {   // place it where it sits inside the body it came from
				b.q.copy(from.q); b.pos.copy(c).sub(from.com).applyQuaternion(from.q).add(from.pos);
				var r = b.pos.clone().sub(from.pos); b.v.copy(from.v).add(from.om.clone().cross(r)); b.om.copy(from.om); b.side = from.side; b.ms = from.ms;
			}
			g.position.copy(b.pos); g.quaternion.copy(b.q); root.add(g);
			return b;
		}
		function vehicleList() {
			var id = S.cmode === 'hit' ? S.cram : S.cveh, list = id === 'mine' ? A.world().list() : (ex(id) || ex('truck')).make().parts;
			list = M.normList(list);
			for (var i = 0; i < (S.cmode === 'hit' ? 0 : S.crot & 3); i++) list = M.normList(M.rotList(list));
			return list.map(function (p, i) { p.u = i + 1; return p; });
		}
		function reset() {
			H = S.cmode === 'hit' || S.cmode === 'drive' && S.ctgt === 'bricks' ? 1 / 2400 : 1 / 900;
			running = false; done = false; simT = 0; accT = 0; plane = null; shake = 0; rngS = 12345;
			bodies.concat(spawned).forEach(function (b) { root.remove(b.g); }); bodies = []; spawned = [];
			if (!S.cmode) S.cmode = defMode();
			buildEnv();
			var sp = S.cspd / 3.6 * 1000;
			stats = { n: 0, v: sp, impact: false, peak: 0, wallOut: 0, ma: 0, tn: wall ? wall.n0 : 0 };
			if (S.cmode === 'ball') {
				stats.m = ball.m; stats.v = Math.sqrt(2 * G * ball.L * (1 - Math.cos(ball.th)));
				setCam(true); results(); A.dirty();
				return status('Ready: a ' + BALLS[S.cball].name + ' wrecking ball (' + M.fmtG(ball.m) + ') will swing into it. Press 💥 Smash it!');
			}
			if (S.cmode === 'drop') {
				var dl = smashList(), h = S.cdrop * 10;
				stats.n = dl.length;
				var d = makeBody(dl, null, 'car'), len = 0, wid = 0; dl.forEach(function (p) { var s = M.size(M.BY[p.t], p.r); len = Math.max(len, (p.x + s[0]) * PX); wid = Math.max(wid, (p.z + s[1]) * PX); });
				d.pos.set(XW - 400 + (d.com.x - len / 2), d.com.y + h, d.com.z - wid / 2);
				d.q.setFromEuler(new T.Euler(0.85, 0.35, 0.55)); d.om.set(1.5, 0.4, -1.2); d.g.position.copy(d.pos); d.g.quaternion.copy(d.q); stats.m = d.m; stats.v = Math.sqrt(2 * G * h); bodies.push(d);
				setCam(true); results(); A.dirty();
				return status('Ready: ' + dl.length + ' parts will fall ' + fmtLen(h) + ' onto the road. Press 💥 Smash it!');
			}
			var list = vehicleList();
			stats.n = list.length;
			if (!list.length) { status('Build something first, or pick a ready-made car.'); return; }
			var len2 = 0, wid2 = 0; list.forEach(function (p) { var s = M.size(M.BY[p.t], p.r); len2 = Math.max(len2, (p.x + s[0]) * PX); wid2 = Math.max(wid2, (p.z + s[1]) * PX); });
			var start = S.cmode === 'hit' ? Math.min(420, Math.max(220, sp * 0.04)) : Math.min(2600, Math.max(260, sp * 0.9));
			var a = makeBody(list, null, 'car'); a.roll = true;
			if (S.cmode === 'hit' && S.cload > 0) { a.ms = (a.m + S.cload) / a.m; a.I *= a.ms; a.m += S.cload; }
			stats.m = a.m;
			a.pos.set(XW - start - len2 / 2 + (a.com.x - len2 / 2), a.com.y + 0.01, a.com.z - wid2 / 2);
			a.v.set(sp, 0, 0); a.g.position.copy(a.pos); bodies.push(a);
			if (S.cmode === 'drive' && S.ctgt === 'headon') {
				var b = makeBody(list, null, 'car'); b.roll = true; b.side = -1;
				b.q.setFromAxisAngle(V(0, 1, 0), Math.PI);
				b.pos.set(-a.pos.x, a.pos.y, -a.pos.z); b.v.set(-sp, 0, 0); b.g.position.copy(b.pos); b.g.quaternion.copy(b.q); bodies.push(b);
				plane = { x: XW, on: true };
			}
			setCam(true); results(); A.dirty();
			if (S.cmode === 'hit') status('Ready: the ' + label(RAMS, S.cram).replace(/^\S+ /, '').toLowerCase() + ' drives into it at ' + S.cspd + ' km/h. Press 💥 Smash it!');
			else status('Ready: ' + list.length + ' parts at ' + S.cspd + ' km/h into the ' + TGT[S.ctgt].name + '. Press 💥 Smash it!');
		}
		function label(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i][0] === id) return arr[i][1]; return id; }
		function fmtLen(mm) { return mm >= 1000 ? (mm / 1000).toFixed(mm >= 10000 ? 0 : 1) + ' m' : Math.round(mm / 10) + ' cm'; }

		// ---------- breaking ----------
		// the body hits something moving along world direction dir at speed vn (mm/s): which joints let go?
		function shatter(b, dir, vn, dt, at) {
			if (b.parts.length < 2) return [b];
			var loc = dir.clone().applyQuaternion(b.q.clone().invert()), ax = [Math.abs(loc.x), Math.abs(loc.y), Math.abs(loc.z)], k = ax.indexOf(Math.max.apply(null, ax)), sg = loc.getComponent(k) > 0 ? 1 : -1;
			var d = [0, 0, 0]; d[k] = sg;
			var ext = -1e9; b.w.parts.forEach(function (p) { M.cellsOf(p).forEach(function (c) { ext = Math.max(ext, c[k] * sg); }); });
			var roots = b.w.parts.filter(function (p) { return M.cellsOf(p).some(function (c) { return c[k] * sg === ext; }); });
			if (at) {   // only the parts near where it touched press on the ground (a tilted build lands on a corner)
				var lp = at.clone().sub(b.pos).applyQuaternion(b.q.clone().invert()).add(b.com), near = roots.filter(function (p) { var bx = partBox(p), dx = Math.max(bx[0] - lp.x, 0, lp.x - bx[3]), dy = Math.max(bx[1] - lp.y, 0, lp.y - bx[4]), dz = Math.max(bx[2] - lp.z, 0, lp.z - bx[5]); return dx * dx + dy * dy + dz * dz < Math.pow(PX * 1.6, 2); });
				if (near.length) roots = near;
			}
			roots = roots.map(function (p) { return { u: p.u, push: true }; });
			var acc = vn / 1000 / dt;
			var r = M.crashSplit(b.w, { dir: d, cap: CAPS[S.cgrip], root: roots, load: function (u) { return M.BY[b.w.byU[u].t].mass / 1000 * acc; } });
			if (b.kind === 'car' && !stats.impact) { stats.impact = true; stats.peak = b.m / 1000 * acc; stats.ma = acc / 9.81; }
			if (r.groups.length < 2) return [b];
			root.remove(b.g);
			var out = r.groups.map(function (g) {
				var nb = makeBody(g.parts.map(function (u) { return b.w.byU[u]; }), b, b.kind);
				nb.held = g.held; nb.cool = 0.06; return nb;
			});
			// pieces that let go keep flying; they tumble up and sideways off whatever stopped the rest
			out.forEach(function (nb) {
				if (nb.held) return;
				var up = 0.25 + rng() * 0.45, sd = (rng() - 0.5) * 0.7;
				nb.v.addScaledVector(V(0, 1, 0), vn * up).addScaledVector(V(-dir.z, 0, dir.x), vn * sd * 0.6);
				nb.om.add(V(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(vn / 45));
			});
			sound(Math.min(1, vn / 6000), Math.min(1, r.broken / 6) + 0.2);
			return out;
		}

		// ---------- physics ----------
		var tmp = V(0, 0, 0), tmp2 = V(0, 0, 0);
		function impulse(b, r, n, e, mu) {
			var vp = b.v.clone().add(b.om.clone().cross(r)), vn = vp.dot(n);
			if (vn >= 0) return 0;
			var rn = r.clone().cross(n), j = -(1 + e) * vn / (1 / b.m + rn.lengthSq() / b.I);
			b.v.addScaledVector(n, j / b.m); b.om.addScaledVector(rn, j / b.I);
			var vt = vp.clone().addScaledVector(n, -vn), vtl = vt.length();
			if (vtl > 1e-6 && mu > 0) {
				var t = vt.multiplyScalar(-1 / vtl), rt = r.clone().cross(t), jt = Math.min(mu * j, vtl / (1 / b.m + rt.lengthSq() / b.I));
				b.v.addScaledVector(t, jt / b.m); b.om.addScaledVector(rt, jt / b.I);
			}
			return -vn;
		}
		// a point inside a brick of the target: push it out through the nearest open face of that cell
		function targetHit(p, vp) {
			if (!wall) return null;
			var gx = Math.floor((p.x - wall.ox) / PX), gy = Math.floor(p.y / PY), gz = Math.floor((p.z - wall.oz) / PX);
			if (gx < 0 || gz < 0 || gy < 0) return null;
			var w = wall.w, u = w.at(gx, gy, gz); if (!u || wall.flat[u]) return null;
			var x0 = wall.ox + gx * PX, y0 = gy * PY, z0 = wall.oz + gz * PX, best = null;
			function f(pen, nx, ny, nz, ok) { if (ok && vp && nx * vp.x + ny * vp.y + nz * vp.z > 1) ok = false; if (ok && (!best || pen < best.pen)) best = { pen: pen, n: V(nx, ny, nz) }; }
			f(p.x - x0, -1, 0, 0, !w.at(gx - 1, gy, gz)); f(x0 + PX - p.x, 1, 0, 0, !w.at(gx + 1, gy, gz));
			f(y0 + PY - p.y, 0, 1, 0, !w.at(gx, gy + 1, gz)); f(p.y - y0, 0, -1, 0, gy > 0 && !w.at(gx, gy - 1, gz));
			f(p.z - z0, 0, 0, -1, !w.at(gx, gy, gz - 1)); f(z0 + PX - p.z, 0, 0, 1, !w.at(gx, gy, gz + 1));
			if (!best) best = { pen: p.x - x0, n: V(-1, 0, 0) };
			best.u = u; return best;
		}
		function contacts(b) {
			// deepest point per obstacle: ground (y < 0), the wall face, the head-on plane, the bricks of the target
			var best = {}, us = {}, wallFace = S.cmode === 'drive' && (S.ctgt === 'concrete' || S.ctgt === 'foam'), useT = wall && (b.kind !== 'wall' || b.age > 0.08);
			for (var i = 0; i < b.pts.length; i++) {
				var p = tmp.copy(b.pts[i]).applyQuaternion(b.q).add(b.pos);
				if (p.y < 0 && (!best.g || p.y < best.g.d)) best.g = { d: p.y, p: p.clone() };
				if (wallFace && p.x > XW && p.x < XW + 80 && p.y < WALL_H && Math.abs(p.z) < WALL_W / 2) { var dd = XW - p.x; if (!best.w || dd < best.w.d) best.w = { d: dd, p: p.clone() }; }
				if (useT && p.x > XW) { var th = targetHit(p, b.v.clone().add(b.om.clone().cross(tmp2.copy(p).sub(b.pos)))); if (th) { us[th.u] = 1; if (!best.t || -th.pen < best.t.d) best.t = { d: -th.pen, p: p.clone(), n: th.n, u: th.u }; } }
				if (plane && plane.on && b.kind === 'car' && (p.x - plane.x) * b.side > 0) { var d3 = -(p.x - plane.x) * b.side; if (!best.h || d3 < best.h.d) best.h = { d: d3, p: p.clone() }; }
			}
			if (best.t) best.t.us = Object.keys(us).map(Number);
			return best;
		}
		// something pushes the bricks us with force F (N) along vdir: the bricks must pass it to the baseplate through their studs
		function hitTarget(us, F, vdir, vn) {
			if (!us.length) return 0;
			var hit = {}; us.forEach(function (u) { hit[u] = 1; });
			var ax = [Math.abs(vdir.x), Math.abs(vdir.y), Math.abs(vdir.z)], k = ax.indexOf(Math.max.apply(null, ax)), d = [0, 0, 0]; d[k] = vdir.getComponent(k) > 0 ? 1 : -1;
			var ground = [];
			wall.w.parts.forEach(function (p) { var g = M.cellsOf(p).filter(function (c) { return c[1] === 0; }).length; if (g) ground.push({ u: p.u, grip: g }); });
			var r = M.crashSplit(wall.w, { dir: d, cap: CAPS[S.cgrip] * 1.3, root: ground, load: function (u) { return hit[u] ? F / us.length : M.BY[wall.w.byU[u].t].mass / 1000 * 50; } });
			var out = 0, mass = 0;
			r.groups.forEach(function (g) {
				if (g.held) return;
				var list = g.parts.map(function (u) { return wall.w.byU[u]; }).map(function (p) { return { u: p.u, t: p.t, x: p.x, y: p.y, z: p.z, r: p.r, c: p.c }; });
				list.forEach(function (p) { wall.g.remove(wall.meshes[p.u]); wall.w.remove(p.u); mass += M.BY[p.t].mass; });
				out += list.length;
				var fake = { q: new T.Quaternion(), com: V(0, 0, 0), pos: V(wall.ox, 0, wall.oz), v: V(0, 0, 0), om: V(0, 0, 0), side: 1 };
				var nb = makeBody(list, fake, 'wall'), hitIt = list.some(function (p) { return hit[p.u]; }), f = hitIt ? 0.55 + rng() * 0.3 : 0.15 + rng() * 0.25;
				nb.v.copy(vdir).multiplyScalar(vn * f).add(V(0, vn * (0.08 + rng() * 0.3), (rng() - 0.5) * vn * 0.35));
				nb.om.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(vn / 60);
				spawned.push(nb);
			});
			stats.wallOut += out;
			if (out) sound(Math.min(1, vn / 5000) + 0.2, Math.min(1, out / 8) + 0.2);
			return mass;
		}
		function stepBody(b, dt) {
			if (b.rest > 0.35) return;
			b.age = (b.age || 0) + dt;
			b.v.y -= G * dt;
			b.pos.addScaledVector(b.v, dt);
			if (!b.roll) {
				var om = b.om, qd = new T.Quaternion(om.x * dt / 2, om.y * dt / 2, om.z * dt / 2, 0).multiply(b.q);
				b.q.set(b.q.x + qd.x, b.q.y + qd.y, b.q.z + qd.z, b.q.w + qd.w).normalize();
				b.om.multiplyScalar(1 - 0.15 * dt);
			} else b.dist += b.v.x * dt * b.side;
			b.cool -= dt;
			if (b.pos.y - b.R > 1 && b.pos.x + b.R < XW - 1 && !plane) return;
			var cs = contacts(b), list = [];
			if (cs.t) {   // bricks of the target
				var ct = cs.t, rt = ct.p.clone().sub(b.pos), vt = -(b.v.clone().add(b.om.clone().cross(rt))).dot(ct.n);
				if (vt > 0 && b.kind === 'car') {
					if (vt > 300) {
						if (!stats.impact) { stats.impact = true; stats.hitT = simT; stats.peak = b.m / 1000 * (vt / 1000) / TGT.bricks.dt; stats.ma = vt / 1000 / TGT.bricks.dt / 9.81; shake = Math.min(1, vt / 5000); }
						var gone = hitTarget(ct.us, b.m / 1000 * (vt / 1000) / TGT.bricks.dt, ct.n.clone().negate(), vt);
						if (gone) b.v.multiplyScalar(b.m / (b.m + 0.7 * gone));
					}
					if (b.cool <= 0 && vt > 500) {
						b.roll = false;
						var sp = shatter(b, ct.n.clone().negate(), vt, TGT.bricks.dt);
						if (sp.length > 1) return sp;
					}
				}
				if (wall.w.at(Math.floor((ct.p.x - wall.ox) / PX), Math.floor(ct.p.y / PY), Math.floor((ct.p.z - wall.oz) / PX))) {
					if (ct.n.y < 0.5) b.roll = false;
					b.pos.addScaledVector(ct.n, -ct.d + 0.01);
					impulse(b, rt, ct.n, 0.1, 0.4);
					if (ct.n.y > 0.5 && !b.roll) { b.v.x *= 1 - 1.5 * dt; b.v.z *= 1 - 1.5 * dt; b.om.multiplyScalar(1 - 2.5 * dt); if (b.v.length() < 25 && b.om.length() < 0.6) b.rest += dt; }
				}
			}
			if (cs.w || cs.h) {
				var c = cs.w || cs.h, n = cs.w ? V(-1, 0, 0) : V(-b.side, 0, 0), r = c.p.clone().sub(b.pos), vn = -(b.v.clone().add(b.om.clone().cross(r))).dot(n);
				if (vn > 0) {
					var tg = TGT[S.ctgt];
					if (b.cool <= 0 && vn > 500) {
						if (b.kind === 'car' && b.roll) { stats.hitT = simT; shake = Math.min(1, vn / 5000); if (plane) plane.offAt = simT + 0.3; }
						b.roll = false;
						var parts = shatter(b, n.clone().negate(), vn, tg.dt);
						if (parts.length > 1) { list = parts; }
					}
				}
				if (list.length) return list;
				b.roll = false;
				b.pos.addScaledVector(n, -c.d + 0.01);
				var hv = impulse(b, r, n, TGT[S.ctgt].e, 0.3); if (hv > 900) sound(Math.min(1, hv / 8000) * 0.5, 0.15);
			}
			if (cs.g) {
				var rg = cs.g.p.clone().sub(b.pos), ng = V(0, 1, 0);
				b.pos.y -= cs.g.d - 0.01;
				if (b.roll) { if (b.v.y < 0) b.v.y = 0; }
				else {
					var vg = -(b.v.clone().add(b.om.clone().cross(rg))).dot(ng);
					if (S.cmode === 'drop' && b.kind === 'car' && !stats.impact && vg > 50) { stats.impact = true; stats.hitT = simT; stats.vland = vg; stats.peak = b.m / 1000 * (vg / 1000) / 0.002; stats.ma = vg / 1000 / 0.002 / 9.81; shake = Math.min(1, vg / 5000); }
					if (vg > 1300 && b.cool <= 0 && b.parts.length > 1) { var ps = shatter(b, V(0, -1, 0), vg, 0.002, cs.g.p); if (ps.length > 1) return ps; }
					var h2 = impulse(b, rg, ng, 0.25, 0.5); if (h2 > 700) sound(Math.min(1, h2 / 9000) * 0.35, 0.08);
					b.v.x *= 1 - 1.5 * dt; b.v.z *= 1 - 1.5 * dt; b.om.multiplyScalar(1 - 2.5 * dt);
					if (b.v.length() < 25 && b.om.length() < 0.6) b.rest += dt; else b.rest = 0;
				}
			}
			return null;
		}
		// the wrecking ball: a pendulum; every brick it overlaps while swinging in gets pushed
		function stepBall(dt) {
			var bl = ball;
			bl.om += -G / bl.L * Math.sin(bl.th) * dt; bl.th += bl.om * dt; bl.om *= 1 - 0.04 * dt;
			bl.pos.set(bl.piv.x + bl.L * Math.sin(bl.th), bl.piv.y - bl.L * Math.cos(bl.th), 0);
			if (!wall || bl.om <= 0 || simT - bl.hitT < 0.02) return;
			var R = bl.R, us = {}, w = wall.w, c = bl.pos;
			for (var gx = Math.floor((c.x - R - wall.ox) / PX); gx <= Math.floor((c.x + R - wall.ox) / PX); gx++)
				for (var gy = Math.max(0, Math.floor((c.y - R) / PY)); gy <= Math.floor((c.y + R) / PY); gy++)
					for (var gz = Math.floor((c.z - R - wall.oz) / PX); gz <= Math.floor((c.z + R - wall.oz) / PX); gz++) {
						var u = w.at(gx, gy, gz); if (!u || us[u]) continue;
						var x0 = wall.ox + gx * PX, z0 = wall.oz + gz * PX, y0 = gy * PY;
						var dx = Math.max(x0 - c.x, 0, c.x - x0 - PX), dy = Math.max(y0 - c.y, 0, c.y - y0 - PY), dz = Math.max(z0 - c.z, 0, c.z - z0 - PX);
						if (dx * dx + dy * dy + dz * dz < R * R) us[u] = 1;
					}
			var list = Object.keys(us).map(Number); if (!list.length) return;
			var v = bl.om * bl.L, vdir = V(Math.cos(bl.th), Math.sin(bl.th), 0);
			bl.hitT = simT; bl.vmax = Math.max(bl.vmax, v);
			if (!stats.impact) { stats.impact = true; stats.hitT = simT; stats.v = v; stats.peak = bl.m / 1000 * (v / 1000) / TGT.bricks.dt; stats.ma = v / 1000 / TGT.bricks.dt / 9.81; shake = Math.min(1, v / 3000); }
			var gone = hitTarget(list, bl.m / 1000 * (v / 1000) / TGT.bricks.dt, vdir, v);
			if (gone) bl.om *= bl.m / (bl.m + 0.7 * gone);
			else { bl.om = -bl.om * 0.3; sound(Math.min(1, v / 6000) * 0.6, 0.12); }
			bl.hits++;
		}
		function step(dt) {
			simT += dt;
			if (plane && plane.offAt && simT > plane.offAt) plane.on = false;
			if (ball) stepBall(dt);
			var next = [];
			bodies.forEach(function (b) { var r = stepBody(b, dt); if (r) r.forEach(function (x) { next.push(x); }); else next.push(b); });
			bodies = next.concat(spawned); spawned = [];
		}
		function sync() {
			if (ball) ballPos(ball);
			bodies.forEach(function (b) {
				b.g.position.copy(b.pos); b.g.quaternion.copy(b.q);
				if (b.roll) b.g.children.forEach(function (me) { if (me.userData.wheelR) me.rotation.x = -b.dist / me.userData.wheelR; });
			});
		}

		// ---------- camera ----------
		function main() { var best = null; bodies.forEach(function (b) { if (b.kind === 'car' && (!best || b.parts.length > best.parts.length)) best = b; }); return best; }
		function setCam(jump) {
			var b = main(), tgt, pos, sz;
			if ((S.cmode === 'ball' || S.cmode === 'hit') && wall && (S.cmode === 'ball' || S.ccam !== 'follow' || !b)) {
				sz = Math.max(160, wall.dx, wall.dz, wall.h, ball ? ball.L * 0.6 : 0);
				var cx = XW + wall.dx / 2 - (S.cmode === 'ball' ? sz * 0.25 : sz * 0.5), cy = Math.max(wall.h, ball ? ball.L * 0.4 : 0) * 0.45;
				if (S.ccam === 'side') { tgt = V(cx, cy, 0); pos = V(cx, cy + sz * 0.3, sz * 2.6); }
				else if (S.ccam === 'top') { tgt = V(cx, 0, 0); pos = V(cx, sz * 3.2, 1); }
				else { if (S.ccam === 'free' && !jump) return; tgt = V(cx, cy, 0); pos = V(cx - sz * 1.3, cy + sz * 0.8, sz * 1.9); }
			} else {
				if (!b) return;
				sz = Math.max(140, b.R * 2.2, wall && S.cmode === 'hit' ? Math.max(wall.h, wall.dx) * 1.1 : 0);
				if (S.cmode === 'hit' && wall && S.ccam === 'follow') {   // keep the truck and the build in the picture
					var x0 = Math.min(b.pos.x - b.R, XW), x1 = XW + wall.dx, span = Math.max(x1 - x0, Math.max(wall.dx, wall.dz, wall.h) * 1.9, 220), cx2 = (x0 + x1) / 2;
					tgt = V(cx2, Math.min(wall.h, span * 0.3) * 0.4, 0); pos = V(cx2 - span * 1.05, span * 0.5, span * 0.6);
				} else if (S.cmode === 'drop') { var y = Math.max(sz * 0.3, b.pos.y); tgt = V(b.pos.x, y * 0.7, 0); pos = V(b.pos.x - sz * 1.5, y * 0.7 + sz * 0.9, sz * 2.3); if (S.ccam === 'side') pos = V(b.pos.x, y * 0.7 + sz * 0.3, sz * 3); }
				else if (S.ccam === 'follow') { var x = Math.min(b.pos.x, XW + 100); tgt = V(x + sz * 0.6, sz * 0.25, 0); pos = V(x - sz * 1.4, sz * 1.0, sz * 2.3); }
				else if (S.ccam === 'side') { tgt = V(XW - sz * 0.8, sz * 0.25, 0); pos = V(XW - sz * 0.8, sz * 0.7, sz * 4.2); }
				else if (S.ccam === 'top') { tgt = V(XW - sz * 1.2, 0, 0); pos = V(XW - sz * 1.2, sz * 5.5, 1); }
				else { if (!jump) return; tgt = V(XW - sz, sz * 0.25, 0); pos = V(XW - sz * 3, sz * 1.6, sz * 2.6); }
			}
			if (jump) { orbit.target.copy(tgt); camera.position.copy(pos); }
			else { orbit.target.lerp(tgt, 0.12); camera.position.lerp(pos, 0.12); }
			orbit.update();
		}

		// ---------- sound ----------
		var ac = null, noise = null;
		function sound(vol, len) {
			if (!S.csnd || vol < 0.03) return;
			try {
				if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); var n = ac.sampleRate, buf = ac.createBuffer(1, n, n), d = buf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noise = buf; }
				if (ac.state === 'suspended') ac.resume();
				var t0 = ac.currentTime, src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
				src.buffer = noise; f.type = 'bandpass'; f.frequency.value = 900 + 2600 * Math.random(); f.Q.value = 0.9;
				var dur = 0.04 + len * 0.5; g.gain.setValueAtTime(Math.min(0.9, vol), t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
				src.connect(f); f.connect(g); g.connect(ac.destination); src.start(t0, Math.random() * 0.5, dur + 0.05);
			} catch (e) {}
		}

		// ---------- results ----------
		function status(t) { $('bb-cstat').textContent = t || ''; }
		function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
		function verdictOf() {
			if (!stats || !stats.impact) return null;
			if (S.cmode === 'hit' || S.cmode === 'ball') {
				var p = pct(stats.wallOut, stats.tn);
				if (p >= 50) return ['bad', '💥 Smashed! ' + p + '% of it came apart.'];
				if (p >= 15) return ['bad', '💥 Big hole: ' + stats.wallOut + ' of ' + stats.tn + ' parts knocked off.'];
				if (p > 0) return ['good', 'It mostly held: ' + stats.wallOut + ' part' + (stats.wallOut > 1 ? 's' : '') + ' knocked off.'];
				return ['good', 'It held! Try ' + (S.cmode === 'ball' ? 'a bigger ball or a higher swing.' : 'more speed or the dump truck.')];
			}
			var cars = bodies.filter(function (b) { return b.kind === 'car'; }), big = main(), kept = big ? big.parts.length : 0, two = S.cmode === 'drive' && S.ctgt === 'headon';
			if (cars.length <= (two ? 2 : 1)) return ['good', 'It survived in one piece. Try it ' + (S.cmode === 'drop' ? 'higher!' : 'faster!')];
			if (kept / stats.n > 0.7) return ['good', 'Mostly in one piece: a few parts came off.'];
			return ['bad', '💥 Smashed! Only ' + pct(kept, stats.n) + '% stayed together.'];
		}
		function results() {
			var box = $('bb-cres'); if (!stats) { box.innerHTML = ''; return; }
			var v = stats.v / 1000, rows = '', h = v * v / 2 / 9.81 * 1000;
			if (S.cmode === 'ball') rows += '<tr><th>Ball</th><td>' + M.fmtG(ball.m) + ', ' + Math.round(ball.R * 2) + ' mm wide</td></tr><tr><th>Speed when it hits</th><td>' + v.toFixed(1) + ' m/s (' + Math.round(v * 3.6) + ' km/h)</td></tr>';
			else if (S.cmode === 'drop') rows += '<tr><th>Dropped from</th><td>' + fmtLen(S.cdrop * 10) + '</td></tr><tr><th>Speed when it lands</th><td>' + v.toFixed(1) + ' m/s (' + Math.round(v * 3.6) + ' km/h)</td></tr><tr><th>Weight</th><td>' + M.fmtG(stats.m || 0) + '</td></tr>';
			else rows += '<tr><th>Speed</th><td>' + S.cspd + ' km/h = ' + v.toFixed(1) + ' m/s</td></tr><tr><th>Like a drop from</th><td>' + fmtLen(h) + '</td></tr><tr><th>' + (S.cmode === 'hit' ? 'Truck weight' : 'Car weight') + '</th><td>' + M.fmtG(stats.m || 0) + '</td></tr>';
			if (stats.impact) {
				rows += '<tr><th>Hit force</th><td>about ' + stats.peak.toFixed(1) + ' N (' + Math.round(stats.ma) + ' g)</td></tr>';
				if (wall && S.cmode !== 'drive') rows += '<tr><th>Parts knocked off</th><td>' + stats.wallOut + ' of ' + stats.tn + ' (' + pct(stats.wallOut, stats.tn) + '%)</td></tr>';
				else if (stats.wallOut) rows += '<tr><th>Wall bricks knocked out</th><td>' + stats.wallOut + '</td></tr>';
				if (S.cmode === 'drive' || S.cmode === 'drop') { var cars = bodies.filter(function (b) { return b.kind === 'car'; }), big = main(), kept = big ? big.parts.length : 0; rows += '<tr><th>Pieces</th><td>' + cars.length + '</td></tr><tr><th>Biggest piece</th><td>' + kept + ' of ' + stats.n + ' parts (' + pct(kept, stats.n) + '%)</td></tr>'; }
			}
			var vd = verdictOf();
			box.innerHTML = '<table class="bb-kv">' + rows + '</table>' + (vd ? '<p class="bb-' + vd[0] + '">' + vd[1] + '</p>' : '');
			var msg = $('bb-smsg'); if (msg) { msg.textContent = vd && done ? vd[1] : ''; msg.className = 'bb-smsg' + (vd && done ? ' bb-smsg--' + vd[0] : ''); }
		}

		// ---------- controls ----------
		function opt(arr) { return arr.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join(''); }
		function fillTargets() {
			var n = A.world().list().length, t = TARGETS.slice(); t[0] = ['mine', n ? '🧱 My build (' + n + ' parts)' : '🧱 My build (empty: uses the house)'];
			$('bb-ctar').innerHTML = opt(t); $('bb-ctar').value = S.ctar;
			var vh = [['mine', n ? '🧱 My build (' + n + ' parts)' : '🧱 My build (empty)']].concat(RAMS.slice().reverse());
			$('bb-cveh').innerHTML = opt(vh); $('bb-cveh').value = S.cveh;
		}
		function showMode() {
			Array.prototype.forEach.call(document.querySelectorAll('#bb-tp-crash [data-cmode]'), function (b) { b.setAttribute('aria-checked', b.dataset.cmode === S.cmode ? 'true' : 'false'); });
			Array.prototype.forEach.call(document.querySelectorAll('#bb-tp-crash [data-for]'), function (el) { el.hidden = el.dataset.for.split(' ').indexOf(S.cmode) < 0; });
			$('bb-cspd').max = S.cmode === 'drive' ? 40 : 60;
			$('bb-cswingv').textContent = S.cswing + '°'; $('bb-cdropv').textContent = fmtLen(S.cdrop * 10); $('bb-cspdv').textContent = S.cspd + ' km/h';
		}
		function fill() {
			$('bb-cram').innerHTML = opt(RAMS); fillTargets();
			$('bb-cram').value = S.cram; $('bb-ctgt').value = S.ctgt; $('bb-cspd').value = S.cspd; $('bb-cgrip').value = S.cgrip; $('bb-cslow').value = String(S.cslow); $('bb-ccam').value = S.ccam; $('bb-csnd').checked = S.csnd;
			$('bb-cball').value = S.cball; $('bb-cload').value = String(S.cload); $('bb-cswing').value = S.cswing; $('bb-cdrop').value = S.cdrop;
			function ch(id, key, num, again) { $(id).onchange = function () { S[key] = num ? +this.value : this.value; A.save(); if (again) reset(); }; }
			ch('bb-ctar', 'ctar', false, true); ch('bb-cram', 'cram', false, true); ch('bb-cveh', 'cveh', false, true); ch('bb-ctgt', 'ctgt', false, true); ch('bb-cgrip', 'cgrip', false, true); ch('bb-cslow', 'cslow', true); ch('bb-ccam', 'ccam', false); ch('bb-cball', 'cball', false, true); ch('bb-cload', 'cload', true, true);
			$('bb-ccam').addEventListener('change', function () { setCam(true); A.dirty(); });
			[['bb-cspd', 'cspd'], ['bb-cswing', 'cswing'], ['bb-cdrop', 'cdrop']].forEach(function (x) {
				$(x[0]).oninput = function () { S[x[1]] = +this.value; showMode(); };
				$(x[0]).onchange = function () { A.save(); reset(); };
			});
			$('bb-csnd').onchange = function () { S.csnd = this.checked; A.save(); };
			$('bb-cmodes').onclick = function (e) { var b = e.target.closest('[data-cmode]'); if (!b) return; S.cmode = b.dataset.cmode; A.save(); showMode(); reset(); };
			$('bb-cgo').onclick = go; $('bb-creset').onclick = reset; $('bb-sgo').onclick = go; $('bb-sagain').onclick = reset;
			$('bb-cturn').onclick = function () { S.crot = (S.crot + 1) & 3; A.save(); reset(); };
		}
		function go() {
			if (running || done) reset();
			if (!bodies.length && !ball) return;
			if (S.csnd) sound(0.001, 0.01);
			running = true; lastFrame = 0; status('Smashing… (' + (S.cslow < 1 ? 'slow motion' : 'real speed') + ')');
			$('bb-sgo').textContent = '💥 Smashing…'; results();
		}
		function finish() { running = false; done = true; status('Done. Press 💥 Smash it! to do it again, or change something.'); $('bb-sgo').textContent = '💥 Again!'; }
		function frame(t) {
			if (!active) return false;
			if (!running) return false;
			var dtr = lastFrame ? Math.min(0.05, (t - lastFrame) / 1000) : 1 / 60; lastFrame = t;
			accT += dtr * S.cslow;
			var n = 0;
			while (accT >= H && n < 1200) { step(H); accT -= H; n++; }
			sync(); setCam(false);
			if (shake > 0.01) { camera.position.x += (Math.random() - 0.5) * shake * 6; camera.position.y += (Math.random() - 0.5) * shake * 6; shake *= 0.85; }
			if (isDone()) finish();
			results();
			return true;
		}
		function isDone() {
			var allRest = bodies.every(function (b) { return b.rest > 0.35; });
			if (ball) { var calm = Math.abs(ball.om) < 0.25 && simT - (stats.hitT || 0) > 1.5; return (stats.impact && calm && allRest) || (stats.impact && simT - stats.hitT > 7) || simT > 10; }
			return (stats.impact && (allRest || simT - (stats.hitT || 0) > 5)) || simT > 15;
		}
		function enter() {
			active = true; root.visible = true; A.setBuildVisible(false); fillTargets(); if (!S.cmode) S.cmode = defMode(); showMode(); reset();
			$('bb-sgo').textContent = '💥 Smash it!';
			$('bb-status').textContent = 'Smash mode: drag to look around, scroll to zoom. Space bar = smash.';
		}
		function exit() {
			active = false; running = false; root.visible = false; A.setBuildVisible(true); A.sunTo(null); $('bb-status').textContent = '';
		}
		fill();
		return { enter: enter, exit: exit, frame: frame, active: function () { return active; }, go: go, reset: reset, debug: function () { return { mode: S.cmode, bodies: bodies.map(function (b) { return [b.kind, b.parts.length, Math.round(b.pos.x), Math.round(b.pos.y), Math.round(b.v.x)]; }), wall: wall && wall.w.parts.length, ball: ball && { th: ball.th, om: ball.om, hits: ball.hits }, stats: stats, simT: simT, running: running, done: done }; },
			run: function (sec) { if (!running) go(); var steps = Math.round(sec / H); for (var i = 0; i < steps && running; i++) { step(H); if (i % 90 === 0 && isDone()) finish(); } sync(); results(); setCam(true); A.dirty(); return { bodies: bodies.length, stats: stats }; } };
	};
})();
