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
		var D = { cveh: 'flimsy-car', ctgt: 'concrete', cspd: 15, cgrip: 'normal', cslow: 0.25, ccam: 'follow', csnd: true, crot: 0 };
		for (var k in D) if (S[k] === undefined) S[k] = D[k];
		var root = new T.Group(); root.visible = false; scene.add(root);
		var env = new T.Group(); root.add(env);
		var bodies = [], wall = null, active = false, running = false, simT = 0, accT = 0, lastFrame = 0, rngS = 1, plane = null, stats = null, shake = 0, done = false;
		var XW = 0, WALL_H = 130, WALL_W = 640;

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
			var t = TGT[S.ctgt];
			if (S.ctgt === 'concrete' || S.ctgt === 'foam') {
				var w = new T.Mesh(new T.BoxGeometry(80, WALL_H, WALL_W), S.ctgt === 'foam' ? mat('#f2d98a', { roughness: 1 }) : mat('#a3a7ad'));
				w.position.set(XW + 40, WALL_H / 2, 0); w.castShadow = true; w.receiveShadow = true; env.add(w);
				if (S.ctgt === 'concrete') for (var i = 0; i < 16; i++) { var st = new T.Mesh(new T.BoxGeometry(2, 14, WALL_W / 16), mat(i % 2 ? '#1f2933' : '#f2c94c')); st.position.set(XW - 0.5, 10, -WALL_W / 2 + (i + 0.5) * WALL_W / 16); env.add(st); }
			}
			if (S.ctgt === 'bricks') makeWall();
			else wall = null;
			A.sunTo(V(-300, 0, 0), 1800);
		}
		function makeWall() {
			var m = EX.filter(function (e) { return e.id === 'brick-wall'; })[0].make(), w = new M.World(64);
			w.load(M.normList(m.parts));
			var D0 = 0; w.parts.forEach(function (p) { D0 = Math.max(D0, p.z + M.size(M.BY[p.t], p.r)[1]); });
			var g = new T.Group(); g.position.set(XW, 0, -D0 * PX / 2); env.add(g);
			var meshes = {};
			w.parts.forEach(function (p) { var me = new T.Mesh(A.geoFor(p.t), A.matFor(p.c)); A.placeMesh(me, p); me.castShadow = true; me.receiveShadow = true; g.add(me); meshes[p.u] = me; });
			wall = { w: w, g: g, meshes: meshes, ox: XW, oz: -D0 * PX / 2, hit: false };
		}

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
			var b = { parts: parts, w: w, com: c, m: m, I: Math.max(I, m * 20), pts: pts, R: R, g: g, pos: V(0, 0, 0), q: new T.Quaternion(), v: V(0, 0, 0), om: V(0, 0, 0), roll: false, cool: 0, rest: 0, kind: kind || 'car', side: 1, dist: 0 };
			if (from) {   // place it where it sits inside the body it came from
				b.q.copy(from.q); b.pos.copy(c).sub(from.com).applyQuaternion(from.q).add(from.pos);
				var r = b.pos.clone().sub(from.pos); b.v.copy(from.v).add(from.om.clone().cross(r)); b.om.copy(from.om); b.side = from.side;
			}
			g.position.copy(b.pos); g.quaternion.copy(b.q); root.add(g);
			return b;
		}
		function vehicleList() {
			var list = S.cveh === 'mine' ? A.world().list() : (EX.filter(function (e) { return e.id === S.cveh; })[0] || EX[1]).make().parts;
			list = M.normList(list);
			for (var i = 0; i < (S.crot & 3); i++) list = M.normList(M.rotList(list));
			return list.map(function (p, i) { p.u = i + 1; return p; });
		}
		function reset() {
			running = false; done = false; simT = 0; accT = 0; plane = null; shake = 0; rngS = 12345;
			bodies.forEach(function (b) { root.remove(b.g); }); bodies = [];
			buildEnv();
			var list = vehicleList();
			stats = { n: list.length, v: S.cspd / 3.6 * 1000, impact: false, peak: 0, brokenOff: 0, wallOut: 0, ma: 0 };
			if (!list.length) { status('Build something first, or pick a ready-made car.'); return; }
			var sp = stats.v, len = 0, wid = 0; list.forEach(function (p) { var s = M.size(M.BY[p.t], p.r); len = Math.max(len, (p.x + s[0]) * PX); wid = Math.max(wid, (p.z + s[1]) * PX); });
			var start = Math.min(2600, Math.max(260, sp * 0.9));
			var a = makeBody(list, null, 'car'); a.roll = true; stats.m = a.m;
			a.pos.set(XW - start - len / 2 + (a.com.x - len / 2), a.com.y + 0.01, a.com.z - wid / 2);
			a.v.set(sp, 0, 0); a.g.position.copy(a.pos); bodies.push(a);
			if (S.ctgt === 'headon') {
				var b = makeBody(list, null, 'car'); b.roll = true; b.side = -1;
				b.q.setFromAxisAngle(V(0, 1, 0), Math.PI);
				b.pos.set(-a.pos.x, a.pos.y, -a.pos.z); b.v.set(-sp, 0, 0); b.g.position.copy(b.pos); b.g.quaternion.copy(b.q); bodies.push(b);
				plane = { x: XW, on: true };
			}
			setCam(true); results(); A.dirty();
			status('Ready: ' + list.length + ' parts at ' + S.cspd + ' km/h into the ' + TGT[S.ctgt].name + '. Press 💥 Go!');
		}

		// ---------- breaking ----------
		// the body hits something moving along world direction dir at speed vn (mm/s): which joints let go?
		function shatter(b, dir, vn, dt) {
			if (b.parts.length < 2) return [b];
			var loc = dir.clone().applyQuaternion(b.q.clone().invert()), ax = [Math.abs(loc.x), Math.abs(loc.y), Math.abs(loc.z)], k = ax.indexOf(Math.max.apply(null, ax)), sg = loc.getComponent(k) > 0 ? 1 : -1;
			var d = [0, 0, 0]; d[k] = sg;
			var ext = -1e9; b.w.parts.forEach(function (p) { M.cellsOf(p).forEach(function (c) { ext = Math.max(ext, c[k] * sg); }); });
			var roots = b.w.parts.filter(function (p) { return M.cellsOf(p).some(function (c) { return c[k] * sg === ext; }); }).map(function (p) { return { u: p.u, push: true }; });
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
		function wallCell(p) {
			if (!wall) return 0;
			var gx = Math.floor((p.x - wall.ox) / PX), gy = Math.floor(p.y / PY), gz = Math.floor((p.z - wall.oz) / PX);
			return gx >= 0 && gz >= 0 ? wall.w.at(gx, gy, gz) : 0;
		}
		function contacts(b) {
			// deepest point per obstacle: ground (y < 0), the wall face, the head-on plane
			var best = {}, wpts = [];
			for (var i = 0; i < b.pts.length; i++) {
				var p = tmp.copy(b.pts[i]).applyQuaternion(b.q).add(b.pos);
				if (p.y < 0 && (!best.g || p.y < best.g.d)) best.g = { d: p.y, p: p.clone() };
				if ((S.ctgt === 'concrete' || S.ctgt === 'foam') && p.x > XW && p.x < XW + 80 && p.y < WALL_H && Math.abs(p.z) < WALL_W / 2) { var dd = XW - p.x; if (!best.w || dd < best.w.d) best.w = { d: dd, p: p.clone() }; }
				if (S.ctgt === 'bricks' && p.x > XW) { var u = wallCell(p); if (u) { var d2 = XW - p.x; wpts.push(u); if (!best.w || d2 < best.w.d) best.w = { d: d2, p: p.clone() }; } }
				if (plane && plane.on && b.kind === 'car' && (p.x - plane.x) * b.side > 0) { var d3 = -(p.x - plane.x) * b.side; if (!best.h || d3 < best.h.d) best.h = { d: d3, p: p.clone() }; }
			}
			best.wparts = wpts; return best;
		}
		function hitBricks(b, cs, vn) {
			// the car punches the wall: the hit bricks must pass its stopping force to the baseplate through their studs
			var hit = {}; cs.wparts.forEach(function (u) { hit[u] = 1; }); var hu = Object.keys(hit).map(Number); if (!hu.length) return false;
			var F = b.m / 1000 * (vn / 1000) / TGT.bricks.dt, ground = [];
			wall.w.parts.forEach(function (p) { var g = M.cellsOf(p).filter(function (c) { return c[1] === 0; }).length; if (g) ground.push({ u: p.u, grip: g }); });
			var r = M.crashSplit(wall.w, { dir: [1, 0, 0], cap: CAPS[S.cgrip] * 2, root: ground, load: function (u) { return hit[u] ? F / hu.length : M.BY[wall.w.byU[u].t].mass / 1000 * 50; } });
			var gone = false;
			r.groups.forEach(function (g) {
				if (g.held) return;
				var list = g.parts.map(function (u) { return wall.w.byU[u]; }).map(function (p) { return { u: p.u, t: p.t, x: p.x, y: p.y, z: p.z, r: p.r, c: p.c }; });
				list.forEach(function (p) { wall.g.remove(wall.meshes[p.u]); wall.w.remove(p.u); if (hit[p.u]) gone = true; });
				stats.wallOut += list.length;
				var fake = { q: new T.Quaternion(), com: V(0, 0, 0), pos: V(wall.ox, 0, wall.oz), v: V(0, 0, 0), om: V(0, 0, 0), side: 1 };
				var nb = makeBody(list, fake, 'wall');
				nb.v.set(vn * (0.5 + rng() * 0.3), vn * (0.1 + rng() * 0.3), (rng() - 0.5) * vn * 0.3); nb.om.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(vn / 60);
				bodies.push(nb);
			});
			return gone;
		}
		function stepBody(b, dt) {
			if (b.rest > 0.35) return;
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
			if (cs.w || cs.h) {
				var c = cs.w || cs.h, n = cs.w ? V(-1, 0, 0) : V(-b.side, 0, 0), r = c.p.clone().sub(b.pos), vn = -(b.v.clone().add(b.om.clone().cross(r))).dot(n);
				if (vn > 0) {
					var tg = TGT[S.ctgt];
					if (cs.w && S.ctgt === 'bricks' && b.kind === 'car' && vn > 300 && !b.wallHit) {
						b.wallHit = true;
						if (hitBricks(b, cs, vn)) { b.v.multiplyScalar(0.55); vn *= 0.45; }
					}
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
					if (vg > 1300 && b.cool <= 0 && b.parts.length > 1) { var ps = shatter(b, V(0, -1, 0), vg, 0.002); if (ps.length > 1) return ps; }
					var h2 = impulse(b, rg, ng, 0.25, 0.5); if (h2 > 700) sound(Math.min(1, h2 / 9000) * 0.35, 0.08);
					b.v.x *= 1 - 1.5 * dt; b.v.z *= 1 - 1.5 * dt; b.om.multiplyScalar(1 - 2.5 * dt);
					if (b.v.length() < 25 && b.om.length() < 0.6) b.rest += dt; else b.rest = 0;
				}
			}
			return null;
		}
		function step(dt) {
			simT += dt;
			if (plane && plane.offAt && simT > plane.offAt) plane.on = false;
			var next = [];
			bodies.forEach(function (b) { var r = stepBody(b, dt); if (r) r.forEach(function (x) { next.push(x); }); else next.push(b); });
			bodies = next;
		}
		function sync() {
			bodies.forEach(function (b) {
				b.g.position.copy(b.pos); b.g.quaternion.copy(b.q);
				if (b.roll) b.g.children.forEach(function (me) { if (me.userData.wheelR) me.rotation.x = -b.dist / me.userData.wheelR; });
			});
		}

		// ---------- camera ----------
		function main() { var best = null; bodies.forEach(function (b) { if (b.kind === 'car' && (!best || b.parts.length > best.parts.length)) best = b; }); return best; }
		function setCam(jump) {
			var b = main(); if (!b) return;
			var sz = Math.max(140, b.R * 2.2), tgt, pos;
			if (S.ccam === 'follow') { var x = Math.min(b.pos.x, XW + 100); tgt = V(x + sz * 0.6, sz * 0.25, 0); pos = V(x - sz * 1.4, sz * 1.0, sz * 2.3); }
			else if (S.ccam === 'side') { tgt = V(XW - sz * 0.8, sz * 0.25, 0); pos = V(XW - sz * 0.8, sz * 0.7, sz * 4.2); }
			else if (S.ccam === 'top') { tgt = V(XW - sz * 1.2, 0, 0); pos = V(XW - sz * 1.2, sz * 5.5, 1); }
			else { if (!jump) return; tgt = V(XW - sz, sz * 0.25, 0); pos = V(XW - sz * 3, sz * 1.6, sz * 2.6); }
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
		function results() {
			var box = $('bb-cres'); if (!stats) { box.innerHTML = ''; return; }
			var v = stats.v / 1000, cars = bodies.filter(function (b) { return b.kind === 'car'; }), big = main(), nCar = S.ctgt === 'headon' ? stats.n * 2 : stats.n;
			var kept = big ? big.parts.length : 0, pieces = cars.length, h = v * v / 2 / 9.81 * 100;
			var rows = '<tr><th>Speed</th><td>' + S.cspd + ' km/h = ' + v.toFixed(1) + ' m/s</td></tr>' +
				'<tr><th>Like a drop from</th><td>' + (h >= 100 ? (h / 100).toFixed(1) + ' m' : Math.round(h) + ' cm') + '</td></tr>' +
				'<tr><th>Car weight</th><td>' + M.fmtG(stats.m || 0) + '</td></tr>';
			if (stats.impact) rows += '<tr><th>Stopping force</th><td>about ' + stats.peak.toFixed(1) + ' N (' + Math.round(stats.ma) + ' g)</td></tr>' +
				'<tr><th>Pieces</th><td>' + pieces + (S.ctgt === 'headon' ? ' (both cars)' : '') + '</td></tr>' +
				'<tr><th>Biggest piece</th><td>' + kept + ' of ' + (S.ctgt === 'headon' ? stats.n : stats.n) + ' parts (' + Math.round(kept / stats.n * 100) + '%)</td></tr>' +
				(stats.wallOut ? '<tr><th>Wall bricks knocked out</th><td>' + stats.wallOut + '</td></tr>' : '');
			var verdict = !stats.impact ? '' : pieces <= (S.ctgt === 'headon' ? 2 : 1) ? '<p class="bb-good">It survived in one piece. Try it faster!</p>' : kept / stats.n > 0.7 ? '<p class="bb-good">Mostly in one piece: a few parts came off.</p>' : '<p class="bb-bad">💥 Smashed! Only ' + Math.round(kept / stats.n * 100) + '% stayed together.</p>';
			box.innerHTML = '<table class="bb-kv">' + rows + '</table>' + verdict;
		}

		// ---------- controls ----------
		function fill() {
			var opts = [['mine', 'My build'], ['flimsy-car', '🚙 Flimsy car'], ['sturdy-car', '🚗 Sturdy car'], ['car', '🏎️ Race car'], ['truck', '🚚 Dump truck']];
			$('bb-cveh').innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
			$('bb-cveh').value = S.cveh; $('bb-ctgt').value = S.ctgt; $('bb-cspd').value = S.cspd; $('bb-cgrip').value = S.cgrip; $('bb-cslow').value = String(S.cslow); $('bb-ccam').value = S.ccam; $('bb-csnd').checked = S.csnd;
			$('bb-cspdv').textContent = S.cspd + ' km/h';
			function ch(id, key, num, again) { $(id).onchange = function () { S[key] = num ? +this.value : this.value; A.save(); if (again) reset(); }; }
			ch('bb-cveh', 'cveh', false, true); ch('bb-ctgt', 'ctgt', false, true); ch('bb-cgrip', 'cgrip', false, true); ch('bb-cslow', 'cslow', true); ch('bb-ccam', 'ccam', false);
			$('bb-ccam').addEventListener('change', function () { setCam(true); A.dirty(); });
			$('bb-cspd').oninput = function () { S.cspd = +this.value; $('bb-cspdv').textContent = S.cspd + ' km/h'; };
			$('bb-cspd').onchange = function () { A.save(); reset(); };
			$('bb-csnd').onchange = function () { S.csnd = this.checked; A.save(); };
			$('bb-cgo').onclick = go; $('bb-creset').onclick = reset;
			$('bb-cturn').onclick = function () { S.crot = (S.crot + 1) & 3; A.save(); reset(); };
		}
		function go() {
			if (running || done) reset();
			if (!bodies.length) return;
			if (S.csnd) sound(0.001, 0.01);
			running = true; lastFrame = 0; status('Crashing… (' + (S.cslow < 1 ? 'slow motion' : 'real speed') + ')');
		}
		function frame(t) {
			if (!active) return false;
			if (!running) return false;
			var dtr = lastFrame ? Math.min(0.05, (t - lastFrame) / 1000) : 1 / 60; lastFrame = t;
			accT += dtr * S.cslow;
			var n = 0;
			while (accT >= H && n < 600) { step(H); accT -= H; n++; }
			sync(); setCam(false);
			if (shake > 0.01) { camera.position.x += (Math.random() - 0.5) * shake * 6; camera.position.y += (Math.random() - 0.5) * shake * 6; shake *= 0.85; }
			var allRest = bodies.every(function (b) { return b.rest > 0.35; });
			if (stats.impact && (allRest || simT - (stats.hitT || 0) > 5)) { running = false; done = true; status('Done. Press 💥 Go! to crash it again, or change the speed.'); }
			if (simT > 15) { running = false; done = true; }
			results();
			return true;
		}
		function enter() {
			active = true; root.visible = true; A.setBuildVisible(false); reset();
			$('bb-status').textContent = 'Crash test: drag to look around, scroll to zoom. Space bar = Go.';
		}
		function exit() {
			active = false; running = false; root.visible = false; A.setBuildVisible(true); A.sunTo(null);
		}
		fill();
		return { enter: enter, exit: exit, frame: frame, active: function () { return active; }, go: go, reset: reset, debug: function () { return { bodies: bodies.map(function (b) { return [b.kind, b.parts.length, Math.round(b.pos.x), Math.round(b.pos.y), Math.round(b.v.x)]; }), wall: wall && wall.w.parts.length, stats: stats, simT: simT, running: running }; },
			run: function (sec) { if (!running) go(); var steps = Math.round(sec / H); for (var i = 0; i < steps; i++) step(H); sync(); results(); setCam(true); A.dirty(); return { bodies: bodies.length, stats: stats }; } };
	};
})();
