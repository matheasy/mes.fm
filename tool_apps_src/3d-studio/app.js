/* MES 3D Studio (mes.fm/3d-studio): a beginner-friendly 3D modeler for 3D printing.
 * three.js 0.170.0 + addons and three-bvh-csg 0.0.17 (booleans) are loaded through the page's import map (jsDelivr).
 * Model = plain objects (S.objs): {id, name, type, p, pos (centre, mm), rot (deg), scl, color, hole, hidden, locked, children, op}.
 * Z is up, units are millimetres. Pure maths lives in lib.js (window.MES3D), templates in templates.js. */
(function () {
	'use strict';
	var L = window.MES3D, root = document.getElementById('td');
	if (!root || !L) return;
	function $(s, r) { return (r || root).querySelector(s); }
	function $$(s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	var imp; try { imp = new Function('u', 'return import(u)'); } catch (e) { imp = null; }
	var T, OrbitControls, TransformControls, BGU, CSG, BVH, FONTS = {}, fontWait = {};
	var KEY = 'mes-3d-studio:v1';
	var ST = { plate: 'ender3', custom: { x: 200, y: 200, z: 200 }, grid: 1, snap: true, unit: 'mm', mat: 'pla', dia: 1.75, infill: 15, wall: 0.8, price: 22, flow: 8, ohAngle: 45, minWall: 0.8, keep: false, efmt: 'stl', showOh: false, showThin: false, showVol: true, addHole: false, tab: 'obj' };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); for (var k in saved) if (k in ST) ST[k] = saved[k]; } catch (e) {}
	function saveST() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} }

	var S = { objs: [], sel: [], name: 'My model' };
	var MESH = {};                 // imported mesh triangle soups by ref (not copied into undo snapshots)
	var hist = [], hpos = -1;
	var view = $('#td-view'), stage = $('#td-stage');
	var renderer, scene, camera, orbit, tc, pivot, plateGroup, overlay, lights = {}, meshes = {}, geoCache = new Map(), selBox, dirty = true, ready = false;
	var COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f8fafc', '#94a3b8', '#475569', '#1f2937', '#a16207'];
	var colorTurn = 7;

	// ---------- shape catalogue ----------
	var PRIMS = {
		box: { name: 'Box', icon: '◼', dims: true, p: { w: 20, d: 20, h: 20 } },
		plate: { name: 'Rounded plate', icon: '▭', dims: true, p: { w: 40, d: 20, h: 4, r: 4 } },
		sphere: { name: 'Sphere', icon: '●', dims: true, p: { w: 20, d: 20, h: 20, seg: 48 } },
		cylinder: { name: 'Cylinder', icon: '⬤', dims: true, p: { w: 20, d: 20, h: 20, seg: 64 } },
		cone: { name: 'Cone', icon: '▲', dims: true, p: { w: 20, d: 20, h: 20, top: 0, seg: 64 } },
		pyramid: { name: 'Pyramid', icon: '△', dims: true, p: { w: 20, d: 20, h: 20, sides: 4 } },
		wedge: { name: 'Wedge', icon: '◢', dims: true, p: { w: 20, d: 20, h: 20 } },
		torus: { name: 'Torus (ring)', icon: '◯', dims: true, p: { w: 30, d: 30, h: 8, seg: 64 } },
		tube: { name: 'Tube', icon: '◎', dims: true, p: { w: 20, d: 20, h: 20, wall: 2, seg: 64 } },
		star: { name: 'Star', icon: '★', dims: true, p: { w: 30, d: 30, h: 5, points: 5, inner: 45 } },
		heart: { name: 'Heart', icon: '♥', dims: true, p: { w: 30, d: 30, h: 5 } },
		gear: { name: 'Gear', icon: '⚙', p: { teeth: 16, mod: 2, h: 6, bore: 4 } },
		text: { name: '3D text', icon: 'T', p: { text: 'Hello', size: 10, depth: 3, font: 'helvetiker_bold' } },
		lathe: { name: 'Revolve (spin a profile)', icon: '⌒', p: { seg: 64, pts: [[0, 0], [15, 0], [18, 25], [12, 40], [0, 40]] } },
		extrude: { name: 'Extrude (raise a drawing)', icon: '⬣', p: { depth: 5, shapes: [{ o: [[-10, -10], [10, -10], [10, 10], [0, 18], [-10, 10]] }] } }
	};
	var FONT_LIST = [['helvetiker_bold', 'Helvetiker bold'], ['helvetiker_regular', 'Helvetiker'], ['optimer_bold', 'Optimer bold'], ['gentilis_bold', 'Gentilis bold'], ['droid/droid_sans_bold', 'Droid Sans bold'], ['droid/droid_serif_bold', 'Droid Serif bold'], ['droid/droid_sans_mono_regular', 'Droid Sans Mono']];

	// ---------- small helpers ----------
	var uid = (function () { var n = Date.now() % 100000; return function () { return 'o' + (n++).toString(36) + Math.random().toString(36).slice(2, 5); }; })();
	function u(v) { return L.fmtNum(ST.unit === 'in' ? v / 25.4 : ST.unit === 'cm' ? v / 10 : v, ST.unit === 'in' ? 3 : 2); }
	function uu() { return ST.unit === 'in' ? 'in' : ST.unit; }
	function len(mm) { return L.fmtLength(mm, ST.unit, 2); }
	function toast(msg, act) {
		var t = $('#td-toast'); t.innerHTML = esc(msg) + (act ? ' <button type="button" class="td-b td-b--s">' + esc(act[0]) + '</button>' : '');
		t.classList.add('on'); if (act) t.querySelector('button').onclick = function () { t.classList.remove('on'); act[1](); };
		clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, act ? 7000 : 3200);
	}
	function walk(list, fn, parent) { list.forEach(function (o) { fn(o, parent); if (o.children) walk(o.children, fn, o); }); }
	function byId(id) { var f = null; walk(S.objs, function (o) { if (o.id === id) f = o; }); return f; }
	function topSel() { return S.sel.map(function (id) { return S.objs.find(function (o) { return o.id === id; }); }).filter(Boolean); }
	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function reId(o) { o.id = uid(); if (o.children) o.children.forEach(reId); return o; }
	function nameOf(o) { return o.name || (o.type === 'group' ? (o.op === 'intersect' ? 'Intersection' : 'Group') : o.type === 'mesh' ? 'Imported model' : o.type === 'text' ? '"' + (o.p.text || '').slice(0, 14) + '"' : (PRIMS[o.type] || {}).name || o.type); }
	function nextColor() { colorTurn = (colorTurn + 1) % 11; return COLORS[colorTurn]; }
	function plate() { return L.plateById(ST.plate, ST.custom); }

	// ---------- loading three.js ----------
	function loadEngine() {
		if (!imp) return Promise.reject(new Error('This browser cannot load modules.'));
		return Promise.all([imp('three'), imp('three/addons/controls/OrbitControls.js'), imp('three/addons/controls/TransformControls.js'), imp('three/addons/utils/BufferGeometryUtils.js'), imp('three-bvh-csg'), imp('three-mesh-bvh')])
			.then(function (m) { T = m[0]; OrbitControls = m[1].OrbitControls; TransformControls = m[2].TransformControls; BGU = m[3]; CSG = m[4]; BVH = m[5]; });
	}
	function addon(path) { return imp('three/addons/' + path); }
	function loadFont(id) {
		if (FONTS[id]) return Promise.resolve(FONTS[id]);
		if (fontWait[id]) return fontWait[id];
		return (fontWait[id] = Promise.all([addon('loaders/FontLoader.js'), fetch('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/' + id + '.typeface.json').then(function (r) { if (!r.ok) throw new Error('font ' + r.status); return r.json(); })])
			.then(function (a) { FONTS[id] = new a[0].FontLoader().parse(a[1]); return FONTS[id]; }));
	}
	var TextGeometry = null;

	// ---------- geometry ----------
	function finish(g, keepPlace) {
		if (g.index) g = g.toNonIndexed();
		Object.keys(g.attributes).forEach(function (a) { if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); });
		g.clearGroups();
		if (!g.attributes.normal) g.computeVertexNormals();
		var pos = g.attributes.position.array;
		if (L.volumeArea(pos).volume < 0) { L.flipWinding(pos); var nr = g.attributes.normal.array; for (var i = 0; i < nr.length; i++) nr[i] = -nr[i]; }
		g.computeBoundingBox();
		if (!keepPlace) { var c = new T.Vector3(); g.boundingBox.getCenter(c); g.translate(-c.x, -c.y, -c.z); g.computeBoundingBox(); }
		g.computeBoundingSphere();
		return g;
	}
	function fitTo(g, w, d, h) { g.computeBoundingBox(); var b = g.boundingBox, c = new T.Vector3(); b.getCenter(c); g.translate(-c.x, -c.y, -c.z); var s = new T.Vector3(); b.getSize(s); g.scale(w / (s.x || 1), d / (s.y || 1), h / (s.z || 1)); return g; }
	function v2(a) { return a.map(function (p) { return new T.Vector2(p[0], p[1]); }); }
	function shapeOf(sh) { var s = new T.Shape(v2(L.ccw(sh.o))); (sh.h || []).forEach(function (h) { s.holes.push(new T.Path(v2(L.ccw(h).reverse()))); }); return s; }
	function extrude(shapes, depth, curve) { var g = new T.ExtrudeGeometry(shapes, { depth: Math.max(0.01, depth), bevelEnabled: false, curveSegments: curve || 12 }); return g; }
	function num(v, d, lo, hi) { v = +v; if (!isFinite(v)) v = d; if (lo != null) v = Math.max(lo, v); if (hi != null) v = Math.min(hi, v); return v; }
	function primGeo(o) {
		var p = o.p || {}, w = num(p.w, 20, 0.01), d = num(p.d, 20, 0.01), h = num(p.h, 20, 0.01), g;
		switch (o.type) {
			case 'box': g = new T.BoxGeometry(w, d, h); break;
			case 'plate': g = extrude([shapeOf({ o: L.roundedRect(w, d, num(p.r, 4, 0), 8) })], h); break;
			case 'sphere': g = fitTo(new T.SphereGeometry(1, num(p.seg, 48, 8, 160) | 0, Math.max(6, num(p.seg, 48, 8, 160) / 2 | 0)).rotateX(Math.PI / 2), w, d, h); break;
			case 'cylinder': g = fitTo(new T.CylinderGeometry(1, 1, 1, num(p.seg, 64, 3, 256) | 0).rotateX(Math.PI / 2), w, d, h); break;
			case 'cone': var top = num(p.top, 0, 0, 100) / 100; g = new T.CylinderGeometry(Math.max(top, 0.0001), 1, 1, num(p.seg, 64, 3, 256) | 0).rotateX(Math.PI / 2); g.scale(w / 2, d / 2, h); break;
			case 'pyramid': var n = num(p.sides, 4, 3, 64) | 0; g = fitTo(new T.ConeGeometry(1, 1, n).rotateY(n === 4 ? Math.PI / 4 : 0).rotateX(Math.PI / 2), w, d, h); break;
			case 'wedge': g = fitTo(extrude([new T.Shape(v2([[0, 0], [w, 0], [0, h]]))], d).rotateX(Math.PI / 2), w, d, h); break;
			case 'torus': g = fitTo(new T.TorusGeometry(1, 0.3, Math.max(8, num(p.seg, 64, 8, 256) / 3 | 0), num(p.seg, 64, 8, 256) | 0), w, d, h); break;
			case 'tube':
				var ro = w / 2, ri = Math.max(0.05, ro - num(p.wall, 2, 0.1));
				if (ri >= ro) ri = ro * 0.5;
				g = new T.LatheGeometry(v2([[ri, 0], [ro, 0], [ro, h], [ri, h], [ri, 0]]), num(p.seg, 64, 3, 256) | 0).rotateX(Math.PI / 2); g.scale(1, d / w, 1); break;
			case 'star': g = fitTo(extrude([shapeOf({ o: L.starPts(num(p.points, 5, 3, 40), 1, num(p.inner, 45, 5, 95) / 100) })], 1), w, d, h); break;
			case 'heart': g = fitTo(extrude([shapeOf({ o: L.heartPts(1, 96) })], 1), w, d, h); break;
			case 'gear':
				var gp = L.gearPts(num(p.teeth, 16, 6, 200), num(p.mod, 2, 0.2, 20)), sh = { o: gp.pts, h: [] }, bore = num(p.bore, 0, 0);
				if (bore > 0 && bore / 2 < gp.root - 0.5) sh.h.push(L.circlePts(bore / 2, 48));
				g = extrude([shapeOf(sh)], num(p.h, 6, 0.2)); break;
			case 'text':
				var font = FONTS[p.font || 'helvetiker_bold'];
				if (!font || !TextGeometry) { needFont(p.font || 'helvetiker_bold'); g = new T.BoxGeometry(Math.max(1, String(p.text || ' ').length) * num(p.size, 10, 0.5) * 0.7, num(p.size, 10, 0.5), num(p.depth, 3, 0.1)); g.userData.temp = true; break; }
				var txt = String(p.text || ' ').replace(/\r/g, '');
				g = new TextGeometry(txt.trim() ? txt : '?', { font: font, size: num(p.size, 10, 0.5), depth: num(p.depth, 3, 0.1), curveSegments: 6, bevelEnabled: false });
				break;
			case 'lathe':
				var pts = L.cleanProfile(p.pts || []);
				if (pts.length < 3) pts = [[0, 0], [10, 0], [0, 10]];
				var loop = pts.concat([pts[0]]);
				g = new T.LatheGeometry(v2(loop), num(p.seg, 64, 3, 256) | 0).rotateX(Math.PI / 2); break;
			case 'extrude':
				var shapes = (p.shapes || []).filter(function (s) { return s && s.o && s.o.length >= 3; }).map(shapeOf);
				if (!shapes.length) shapes = [shapeOf({ o: [[0, 0], [10, 0], [0, 10]] })];
				g = extrude(shapes, num(p.depth, 5, 0.05)); break;
			case 'mesh':
				g = new T.BufferGeometry();
				var arr = MESH[p.ref];
				g.setAttribute('position', new T.BufferAttribute(arr ? new Float32Array(arr) : new Float32Array(9), 3));
				g.computeVertexNormals();
				return finish(g, true);
			default: g = new T.BoxGeometry(10, 10, 10);
		}
		var temp = g.userData && g.userData.temp;
		g = finish(g);
		if (temp) g.userData.temp = true;
		return g;
	}
	function geoKey(o) {
		if (o.type === 'group') return 'g' + (o.op || 'union') + '[' + o.children.filter(function (c) { return !c.hidden; }).map(function (c) { return geoKey(c) + '@' + c.pos + '|' + c.rot + '|' + c.scl + (c.hole ? 'H' : ''); }).join(';') + ']';
		if (o.type === 'text') return 'text' + JSON.stringify(o.p) + (FONTS[o.p.font || 'helvetiker_bold'] && TextGeometry ? '' : '~');
		return o.type + JSON.stringify(o.p);
	}
	function geoFor(o) {
		var k = geoKey(o), g = geoCache.get(k);
		if (g) return g;
		g = o.type === 'group' ? groupGeo(o) : primGeo(o);
		if (!(g.userData && g.userData.temp)) { geoCache.set(k, g); if (geoCache.size > 400) { var first = geoCache.keys().next().value; geoCache.delete(first); } }
		return g;
	}
	var _q = null;
	function matOf(o) {
		var m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(o.rot[0] * Math.PI / 180, o.rot[1] * Math.PI / 180, o.rot[2] * Math.PI / 180, 'XYZ'));
		return m.compose(new T.Vector3(o.pos[0], o.pos[1], o.pos[2]), q, new T.Vector3(o.scl[0], o.scl[1], o.scl[2]));
	}
	// the object's geometry placed with matrix m (inside-out fixed when the matrix mirrors)
	function placed(o, m) {
		var g = geoFor(o).clone(); g.applyMatrix4(m);
		if (m.determinant() < 0) { L.flipWinding(g.attributes.position.array); }
		return g;
	}
	var evaluator = null;
	function groupGeo(o) {
		var solids = [], holes = [];
		o.children.forEach(function (c) { if (!c.hidden) (c.hole ? holes : solids).push(c); });
		var list = solids.length ? solids : holes;     // a group of only holes is itself a hole
		if (!list.length) return finish(new T.BoxGeometry(0.01, 0.01, 0.01), true);
		if (!evaluator) { evaluator = new CSG.Evaluator(); evaluator.attributes = ['position', 'normal']; evaluator.useGroups = false; }
		// shapes that only touch (a word standing on a plate) give exactly coplanar faces, which booleans handle badly and slowly;
		// growing each part by a few ten-thousandths of a millimetre about its centre turns touching into a hair of overlap
		var kid = 0;
		function brush(c) {
			kid++;
			var g = placed(c, matOf(c)); g.computeBoundingBox(); var ctr = new T.Vector3(); g.boundingBox.getCenter(ctr);
			var k = 1 + 2e-5 * kid; g.translate(-ctr.x, -ctr.y, -ctr.z); g.scale(k, k, k); g.translate(ctr.x, ctr.y, ctr.z);
			var b = new CSG.Brush(g); b.updateMatrixWorld(); return b;
		}
		try {
			var acc = brush(list[0]);
			for (var i = 1; i < list.length; i++) acc = evaluator.evaluate(acc, brush(list[i]), o.op === 'intersect' && solids.length ? CSG.INTERSECTION : CSG.ADDITION);
			if (solids.length) holes.forEach(function (hc) { acc = evaluator.evaluate(acc, brush(hc), CSG.SUBTRACTION); });
			var g = acc.geometry.clone();
			if (!g.attributes.position || !g.attributes.position.count) return finish(new T.BoxGeometry(0.01, 0.01, 0.01), true);
			return finish(g, true);
		} catch (e) {
			console.warn('CSG failed', e);
			var gs = list.map(function (c) { return placed(c, matOf(c)); });
			return finish(BGU.mergeGeometries(gs), true);
		}
	}
	function isHoleGroup(o) { return o.type === 'group' && !o.children.some(function (c) { return !c.hidden && !c.hole; }); }
	var fontAsked = {};
	function textReady(id) { return (TextGeometry ? Promise.resolve() : addon('geometries/TextGeometry.js').then(function (m) { TextGeometry = m.TextGeometry; })).then(function () { return loadFont(id || 'helvetiker_bold'); }); }
	function needFont(id) {
		if (fontAsked[id]) return; fontAsked[id] = 1;
		textReady(id).then(function () { sync(); }).catch(function (e) { fontAsked[id] = 0; toast('Could not load the font: ' + e.message); });
	}

	// ---------- scene ----------
	var MAT = {};
	function matFor(o) {
		var hole = o.hole || isHoleGroup(o), key = hole ? 'hole' : (o.color || '#3b82f6');
		if (!MAT[key]) MAT[key] = hole ? new T.MeshStandardMaterial({ color: 0x9aa4b2, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.6, side: T.DoubleSide })
			: new T.MeshStandardMaterial({ color: new T.Color(key), roughness: 0.55, metalness: 0.04 });
		return MAT[key];
	}
	function initScene() {
		renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.setClearColor(0x1b1f27);
		view.insertBefore(renderer.domElement, view.firstChild);
		renderer.domElement.className = 'td-canvas';
		scene = new T.Scene();
		T.Object3D.DEFAULT_UP.set(0, 0, 1);
		camera = new T.PerspectiveCamera(38, 1, 0.5, 20000);
		camera.up.set(0, 0, 1);
		camera.position.set(170, -230, 190);
		lights.hemi = new T.HemisphereLight(0xffffff, 0x3a4252, 1.6); lights.hemi.position.set(0, 0, 1); scene.add(lights.hemi);
		lights.dir = new T.DirectionalLight(0xffffff, 1.6); scene.add(lights.dir); scene.add(lights.dir.target);
		orbit = new OrbitControls(camera, renderer.domElement);
		orbit.enableDamping = false; orbit.screenSpacePanning = true; orbit.zoomToCursor = true;
		orbit.target.set(0, 0, 10);
		orbit.addEventListener('change', function () { dirty = true; });
		tc = new TransformControls(camera, renderer.domElement);
		tc.setSize(0.9);
		tc.addEventListener('dragging-changed', function (e) { orbit.enabled = !e.value; if (e.value) dragStart(); else dragEnd(); });
		tc.addEventListener('objectChange', dragMove);
		tc.addEventListener('change', function () { dirty = true; });
		scene.add(tc.getHelper());
		pivot = new T.Object3D(); scene.add(pivot);
		selBox = new T.Box3Helper(new T.Box3(), 0x60a5fa); selBox.visible = false; scene.add(selBox);
		plateGroup = new T.Group(); scene.add(plateGroup);
		buildPlate();
		new ResizeObserver(resize).observe(view);
		resize();
		applySnap(); setMode('translate');
		pointerSetup();
		requestAnimationFrame(loop);
	}
	function resize() {
		var w = Math.max(50, view.clientWidth), h = Math.max(50, view.clientHeight);
		renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
	}
	function buildPlate() {
		while (plateGroup.children.length) { var c = plateGroup.children.pop(); if (c.geometry) c.geometry.dispose(); }
		var P = plate(), hx = P.x / 2, hy = P.y / 2;
		var floor = new T.Mesh(new T.PlaneGeometry(P.x, P.y), new T.MeshStandardMaterial({ color: 0x2c3442, roughness: 0.95, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
		floor.position.z = -0.02; floor.userData.floor = true; plateGroup.add(floor);
		var minor = [], major = [], step = ST.grid >= 1 ? ST.grid : 1;
		if (P.x / step > 300) step = 5;
		for (var x = 0; x <= hx + 1e-6; x += step) [x, -x].forEach(function (xx, i) { if (i && !x) return; (Math.abs(Math.round(xx / 10) * 10 - xx) < 1e-6 ? major : minor).push(xx, -hy, 0, xx, hy, 0); });
		for (var y = 0; y <= hy + 1e-6; y += step) [y, -y].forEach(function (yy, i) { if (i && !y) return; (Math.abs(Math.round(yy / 10) * 10 - yy) < 1e-6 ? major : minor).push(-hx, yy, 0, hx, yy, 0); });
		function lines(a, color, op) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(a, 3)); return new T.LineSegments(g, new T.LineBasicMaterial({ color: color, transparent: true, opacity: op })); }
		if (minor.length && step < 10) plateGroup.add(lines(minor, 0x8fa0b8, 0.10));
		plateGroup.add(lines(major, 0x9fb0c8, 0.26));
		plateGroup.add(lines([-hx, -hy, 0, hx, -hy, 0, hx, -hy, 0, hx, hy, 0, hx, hy, 0, -hx, hy, 0, -hx, hy, 0, -hx, -hy, 0], 0xcbd5e1, 0.7));
		plateGroup.add(lines([-hx, -hy, 0.05, -hx + 20, -hy, 0.05], 0xef4444, 1));
		plateGroup.add(lines([-hx, -hy, 0.05, -hx, -hy + 20, 0.05], 0x22c55e, 1));
		plateGroup.add(lines([-hx, -hy, 0, -hx, -hy, 20], 0x3b82f6, 1));
		if (ST.showVol) {
			var z = P.z, b = [];
			[[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].forEach(function (c, i, a) { var n = a[(i + 1) % 4]; b.push(c[0], c[1], 0, c[0], c[1], z, c[0], c[1], z, n[0], n[1], z); });
			plateGroup.add(lines(b, 0x94a3b8, 0.13));
		}
		dirty = true;
	}
	function loop() {
		requestAnimationFrame(loop);
		if (dirty) render();
	}
	function render() {
		if (!renderer) return;
		dirty = false;
		lights.dir.position.copy(camera.position).add(new T.Vector3(40, -20, 80));
		lights.dir.target.position.copy(orbit.target);
		renderer.render(scene, camera);
		labels();
	}
	// make the meshes match S.objs
	function sync() {
		if (!ready) return;
		var seen = {};
		S.objs.forEach(function (o) {
			seen[o.id] = 1;
			var m = meshes[o.id], k = geoKey(o);
			if (!m) { m = new T.Mesh(geoFor(o), matFor(o)); m.userData.id = o.id; m.userData.key = k; scene.add(m); meshes[o.id] = m; }
			else if (m.userData.key !== k) { m.geometry = geoFor(o); m.userData.key = k; }
			m.material = matFor(o);
			m.renderOrder = o.hole || isHoleGroup(o) ? 2 : 0;
			m.visible = !o.hidden;
			setXform(m, o);
		});
		Object.keys(meshes).forEach(function (id) { if (!seen[id]) { scene.remove(meshes[id]); delete meshes[id]; } });
		S.sel = S.sel.filter(function (id) { return meshes[id]; });
		attach();
		$('#td-empty').hidden = S.objs.length > 0;
		dirty = true;
		outliner(); inspector(); status(); schedCheck();
	}
	function setXform(m, o) { m.position.set(o.pos[0], o.pos[1], o.pos[2]); m.rotation.set(o.rot[0] * Math.PI / 180, o.rot[1] * Math.PI / 180, o.rot[2] * Math.PI / 180, 'XYZ'); m.scale.set(o.scl[0], o.scl[1], o.scl[2]); m.updateMatrixWorld(); }
	function readXform(m, o) {
		var r2 = function (v) { return Math.round(v * 1e4) / 1e4; };
		o.pos = [r2(m.position.x), r2(m.position.y), r2(m.position.z)];
		o.rot = [r2(T.MathUtils.radToDeg(m.rotation.x)), r2(T.MathUtils.radToDeg(m.rotation.y)), r2(T.MathUtils.radToDeg(m.rotation.z))];
		o.scl = [r2(m.scale.x) || 0.0001, r2(m.scale.y) || 0.0001, r2(m.scale.z) || 0.0001];
	}
	function worldBox(objs) {
		var b = new T.Box3();
		objs.forEach(function (o) { var m = meshes[o.id]; if (m) { m.updateMatrixWorld(); b.expandByObject(m, true); } });
		return b;
	}
	function boxArr(b) { return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }; }

	// ---------- selection + gizmo ----------
	var mode = 'translate', multi = null;
	function attach() {
		var objs = topSel().filter(function (o) { return !o.locked && !o.hidden; });
		tc.detach();
		if (objs.length === 1) tc.attach(meshes[objs[0].id]);
		else if (objs.length > 1) { var b = worldBox(objs), c = new T.Vector3(); b.getCenter(c); pivot.position.copy(c); pivot.rotation.set(0, 0, 0); pivot.scale.set(1, 1, 1); pivot.updateMatrixWorld(); tc.attach(pivot); }
		var all = topSel();
		if (all.length) { var bb = worldBox(all); selBox.box.copy(bb); selBox.visible = !bb.isEmpty(); } else selBox.visible = false;
		tc.setSpace(mode === 'translate' || objs.length > 1 ? 'world' : 'local');
		dirty = true;
	}
	function select(ids, add) {
		if (add) ids.forEach(function (id) { var i = S.sel.indexOf(id); if (i >= 0) S.sel.splice(i, 1); else S.sel.push(id); });
		else S.sel = ids.slice();
		attach(); outliner(); inspector(); status();
	}
	function setMode(m) { mode = m; tc.setMode(m); $$('.td-mode').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'); }); attach(); }
	function applySnap(off) {
		var on = ST.snap && !off;
		tc.setTranslationSnap(on ? +ST.grid : null);
		tc.setRotationSnap(on ? T.MathUtils.degToRad(15) : null);
		tc.setScaleSnap(on ? 0.05 : null);
	}
	function dragStart() {
		var objs = topSel().filter(function (o) { return !o.locked && !o.hidden; });
		if (objs.length > 1) {
			multi = { inv: pivot.matrixWorld.clone().invert(), items: objs.map(function (o) { var m = meshes[o.id]; m.updateMatrixWorld(); return { o: o, m: m.matrixWorld.clone() }; }) };
		} else multi = null;
	}
	function dragMove() {
		var objs = topSel().filter(function (o) { return !o.locked && !o.hidden; });
		if (multi) {
			pivot.updateMatrixWorld();
			var delta = pivot.matrixWorld.clone().multiply(multi.inv), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
			multi.items.forEach(function (it) {
				var m = delta.clone().multiply(it.m); m.decompose(p, q, s);
				var mesh = meshes[it.o.id]; mesh.position.copy(p); mesh.quaternion.copy(q); mesh.scale.copy(s); mesh.updateMatrixWorld();
				readXform(mesh, it.o);
			});
		} else if (objs.length === 1) readXform(meshes[objs[0].id], objs[0]);
		var bb = worldBox(topSel()); selBox.box.copy(bb);
		dirty = true; status(); inspectorValues();
	}
	function dragEnd() {
		topSel().forEach(function (o) { if (mode === 'scale') bakeScale(o); });
		multi = null;
		commit(mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Resize');
	}
	// shapes with size settings (w, d, h) keep scale 1: a stretch becomes new sizes, so rounded corners and walls stay true
	function bakeScale(o) {
		var def = PRIMS[o.type];
		if (!def || !def.dims) return;
		var s = o.scl.map(Math.abs);
		o.p.w = +(o.p.w * s[0]).toFixed(3); o.p.d = +(o.p.d * s[1]).toFixed(3); o.p.h = +(o.p.h * s[2]).toFixed(3);
		o.scl = o.scl.map(function (v) { return v < 0 ? -1 : 1; });
	}

	// ---------- history + autosave ----------
	function snapshot() { return JSON.stringify({ objs: S.objs, name: S.name }); }
	function commit(label) {
		hist = hist.slice(0, hpos + 1); hist.push(snapshot()); if (hist.length > 120) hist.shift(); hpos = hist.length - 1;
		sync(); undoBtns(); autosave(); cloudTick();
	}
	function restore(json) { var d = JSON.parse(json); S.objs = d.objs; S.name = d.name || S.name; sync(); undoBtns(); autosave(); cloudTick(); }
	function undo() { if (hpos > 0) { hpos--; restore(hist[hpos]); } }
	function redo() { if (hpos < hist.length - 1) { hpos++; restore(hist[hpos]); } }
	function undoBtns() { $('[data-act=undo]').disabled = hpos <= 0; $('[data-act=redo]').disabled = hpos >= hist.length - 1; }
	var DB = null;
	function db() {
		if (DB) return DB;
		DB = new Promise(function (res, rej) { try { var r = indexedDB.open('mes-3d-studio', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; } catch (e) { rej(e); } });
		return DB;
	}
	function usedRefs() { var r = {}; walk(S.objs, function (o) { if (o.type === 'mesh' && o.p.ref) r[o.p.ref] = MESH[o.p.ref]; }); return r; }
	function autosave() {
		clearTimeout(autosave.t);
		autosave.t = setTimeout(function () {
			db().then(function (d) { var tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ name: S.name, objs: JSON.stringify(S.objs), meshes: usedRefs(), t: Date.now() }, 'auto'); }).catch(function () {});
		}, 1200);
	}
	function loadAuto() {
		return db().then(function (d) { return new Promise(function (res) { var r = d.transaction('kv').objectStore('kv').get('auto'); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); }).catch(function () { return null; });
	}

	// ---------- adding things ----------
	function newObj(type, p, ext) {
		var def = PRIMS[type] || {};
		var o = { id: uid(), name: '', type: type, p: clone(p || def.p || {}), pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], color: nextColor(), hole: !!ST.addHole };
		for (var k in ext || {}) o[k] = ext[k];
		return o;
	}
	// put new objects next to what is there (in front of the view), on the floor
	function placeNew(objs) {
		objs.forEach(function (o) { S.objs.push(o); });
		sync();
		var b = worldBox(objs), c = new T.Vector3(); b.getCenter(c);
		var t = orbit.target.clone(), P = plate();
		t.x = Math.max(-P.x / 2 + 10, Math.min(P.x / 2 - 10, t.x)); t.y = Math.max(-P.y / 2 + 10, Math.min(P.y / 2 - 10, t.y));
		var others = S.objs.filter(function (o) { return objs.indexOf(o) < 0 && !o.hidden; }), dx = t.x - c.x, dy = t.y - c.y;
		var target = topSel().filter(function (o) { return objs.indexOf(o) < 0; });
		if (objs.every(function (o) { return o.hole; }) && target.length) {
			// a new hole goes straight into the selected shape, ready to be grouped
			var tb = worldBox(target), tc2 = new T.Vector3(); tb.getCenter(tc2); dx = tc2.x - c.x; dy = tc2.y - c.y;
		} else if (others.length) {
			var ob = worldBox(others), sz = new T.Vector3(); b.getSize(sz);
			for (var tries = 0; tries < 12; tries++) {
				var test = b.clone().translate(new T.Vector3(dx, dy, 0));
				if (!test.intersectsBox(ob)) break;
				dx += sz.x + 5;
			}
		}
		objs.forEach(function (o) { o.pos[0] += dx; o.pos[1] += dy; o.pos[2] += -b.min.z; o.pos = o.pos.map(function (v) { return Math.round(v * 1000) / 1000; }); });
		S.sel = objs.map(function (o) { return o.id; });
		commit('Add');
	}
	function addPrim(type) {
		if (!ready) return;
		var o = newObj(type);
		if (type === 'lathe' || type === 'extrude') { sketch(o, true); return; }
		placeNew([o]);
		if (type === 'text') { setTab('obj'); setTimeout(function () { var t = $('#td-p-text'); if (t) { t.focus(); t.select(); } }, 60); }
	}
	function fromTemplate(t) {
		var objs = t.make().map(function (o) { return prep(o); });
		function prep(o) { o.id = uid(); o.name = o.name || ''; o.hole = !!o.hole; if (!o.color) o.color = nextColor(); if (o.children) o.children.forEach(prep); return o; }
		// treat the template as one block: centre it on the view, on the floor
		objs.forEach(function (o) { S.objs.push(o); }); sync();
		var b = worldBox(objs), c = new T.Vector3(); b.getCenter(c);
		S.objs = S.objs.filter(function (o) { return objs.indexOf(o) < 0; });
		objs.forEach(function (o) { o.pos[0] -= c.x; o.pos[1] -= c.y; o.pos[2] -= b.min.z; });
		placeNew(objs);
		frame(objs);
	}

	// ---------- edits ----------
	function selected(needLock) { var s = topSel(); return needLock ? s.filter(function (o) { return !o.locked; }) : s; }
	function del() { var ids = selected(true).map(function (o) { return o.id; }); if (!ids.length) return; S.objs = S.objs.filter(function (o) { return ids.indexOf(o.id) < 0; }); S.sel = []; commit('Delete'); }
	function dup() {
		var s = selected(); if (!s.length) return;
		var copies = s.map(function (o) { var c = reId(clone(o)); c.pos[0] += Math.max(5, +ST.grid * 5); c.pos[1] += Math.max(5, +ST.grid * 5); c.name = o.name ? o.name + ' copy' : ''; return c; });
		var at = S.objs.indexOf(s[s.length - 1]) + 1; S.objs.splice.apply(S.objs, [at, 0].concat(copies));
		S.sel = copies.map(function (o) { return o.id; }); commit('Duplicate');
	}
	function toggleHole() { var s = selected(true); if (!s.length) return toast('Select a shape first.'); var to = !s.every(function (o) { return o.hole; }); s.forEach(function (o) { o.hole = to; }); commit(to ? 'Make hole' : 'Make solid'); if (to) toast('Holes cut into the solids you group them with. Select both and press Group.'); }
	function group(op, autoHoles) {
		var s = selected(true);
		if (s.length < 2) return toast(autoHoles ? 'Select the shape to cut and the shapes to cut out of it (Shift-click), then press Subtract.' : 'Select two or more shapes (Shift-click or Ctrl+A), then press Group.');
		if (autoHoles) {
			var vol = function (o) { var b = worldBox([o]), z = new T.Vector3(); b.getSize(z); return z.x * z.y * z.z; };
			var big = s.slice().sort(function (a, b) { return vol(b) - vol(a); })[0];
			s.forEach(function (o) { if (o !== big) o.hole = true; else o.hole = false; });
		}
		var b = worldBox(s), c = new T.Vector3(); b.getCenter(c);
		var firstSolid = s.find(function (o) { return !o.hole; }) || s[0];
		var g = { id: uid(), name: '', type: 'group', op: op || 'union', children: [], pos: [c.x, c.y, c.z].map(function (v) { return Math.round(v * 1000) / 1000; }), rot: [0, 0, 0], scl: [1, 1, 1], color: firstSolid.color, hole: false };
		var at = Math.min.apply(null, s.map(function (o) { return S.objs.indexOf(o); }));
		s.forEach(function (o) { o.pos = [o.pos[0] - g.pos[0], o.pos[1] - g.pos[1], o.pos[2] - g.pos[2]]; g.children.push(o); });
		S.objs = S.objs.filter(function (o) { return s.indexOf(o) < 0; });
		S.objs.splice(at, 0, g); S.sel = [g.id];
		commit(op === 'intersect' ? 'Intersect' : 'Group');
		if (!s.some(function (o) { return o.hole; }) && op !== 'intersect') toast('Grouped. Tip: make a shape a Hole before grouping to cut it out.');
	}
	function ungroup() {
		var gs = selected(true).filter(function (o) { return o.type === 'group'; });
		if (!gs.length) return toast('Select a group to ungroup.');
		var ids = [];
		gs.forEach(function (g) {
			var gm = matOf(g), at = S.objs.indexOf(g), out = [], p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(), e = new T.Euler();
			g.children.forEach(function (c) {
				gm.clone().multiply(matOf(c)).decompose(p, q, sc); e.setFromQuaternion(q, 'XYZ');
				var r4 = function (v) { return Math.round(v * 1e4) / 1e4; };
				c.pos = [r4(p.x), r4(p.y), r4(p.z)]; c.rot = [r4(e.x * 180 / Math.PI), r4(e.y * 180 / Math.PI), r4(e.z * 180 / Math.PI)]; c.scl = [r4(sc.x), r4(sc.y), r4(sc.z)];
				out.push(c); ids.push(c.id);
			});
			S.objs.splice.apply(S.objs, [at, 1].concat(out));
		});
		S.sel = ids; commit('Ungroup');
	}
	function mirror(axis) {
		var s = selected(true); if (!s.length) return toast('Select a shape first.');
		var b = worldBox(s), c = new T.Vector3(); b.getCenter(c);
		s.forEach(function (o) {
			// mirror through the selection's centre plane: reflect the whole transform
			var R = new T.Matrix4().makeTranslation(axis === 0 ? 2 * c.x : 0, axis === 1 ? 2 * c.y : 0, axis === 2 ? 2 * c.z : 0).multiply(new T.Matrix4().makeScale(axis === 0 ? -1 : 1, axis === 1 ? -1 : 1, axis === 2 ? -1 : 1));
			var m = R.multiply(matOf(o)), p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(), e = new T.Euler();
			m.decompose(p, q, sc); e.setFromQuaternion(q, 'XYZ');
			o.pos = [p.x, p.y, p.z]; o.rot = [e.x * 180 / Math.PI, e.y * 180 / Math.PI, e.z * 180 / Math.PI].map(function (v) { return Math.round(v * 1e4) / 1e4; }); o.scl = [sc.x, sc.y, sc.z];
		});
		commit('Mirror');
	}
	function drop(objs) {
		var s = objs || selected(true); if (!s.length) s = S.objs.filter(function (o) { return !o.locked; });
		s.forEach(function (o) { var b = worldBox([o]); if (!b.isEmpty()) o.pos[2] = Math.round((o.pos[2] - b.min.z) * 1e4) / 1e4; });
		commit('Drop to plate');
	}
	function centerOnPlate() {
		var s = selected(true); if (!s.length) return;
		var b = worldBox(s), c = new T.Vector3(); b.getCenter(c);
		s.forEach(function (o) { o.pos[0] -= c.x; o.pos[1] -= c.y; });
		commit('Centre on plate');
	}
	function align(k, how) {
		var s = selected(true); if (s.length < 2) return;
		var sh = L.alignShifts(s.map(function (o) { return boxArr(worldBox([o])); }), k, how);
		s.forEach(function (o, i) { o.pos[k] += sh[i]; }); commit('Align');
	}
	function distribute(k) {
		var s = selected(true); if (s.length < 3) return toast('Select three or more shapes to spread them out.');
		var sh = L.distributeShifts(s.map(function (o) { return boxArr(worldBox([o])); }), k);
		s.forEach(function (o, i) { o.pos[k] += sh[i]; }); commit('Distribute');
	}

	// ---------- views ----------
	function frame(objs) {
		var list = objs && objs.length ? objs : S.objs.filter(function (o) { return !o.hidden; });
		var b = list.length ? worldBox(list) : null;
		if (!b || b.isEmpty()) { var P = plate(); b = new T.Box3(new T.Vector3(-P.x / 3, -P.y / 3, 0), new T.Vector3(P.x / 3, P.y / 3, 20)); }
		var c = new T.Vector3(), sz = new T.Vector3(); b.getCenter(c); b.getSize(sz);
		var r = Math.max(10, sz.length() / 2), dist = r / Math.sin(camera.fov * Math.PI / 360) * 1.15;
		var dir = camera.position.clone().sub(orbit.target).normalize();
		tween(c, c.clone().add(dir.multiplyScalar(dist)));
	}
	function setView(v) {
		if (v === 'frame') return frame(topSel());
		var t = orbit.target.clone(), d = camera.position.distanceTo(t), dir;
		if (v === 'top') dir = new T.Vector3(0, -0.0001, 1);
		else if (v === 'front') dir = new T.Vector3(0, -1, 0);
		else if (v === 'side') dir = new T.Vector3(1, 0, 0);
		else dir = new T.Vector3(0.6, -0.8, 0.65).normalize();
		tween(t, t.clone().add(dir.normalize().multiplyScalar(d)));
	}
	function tween(target, pos) {
		var t0 = performance.now(), a = orbit.target.clone(), b = camera.position.clone();
		(function step() {
			var k = Math.min(1, (performance.now() - t0) / 260), e = k * k * (3 - 2 * k);
			orbit.target.lerpVectors(a, target, e); camera.position.lerpVectors(b, pos, e); orbit.update(); dirty = true;
			if (k < 1) requestAnimationFrame(step);
		})();
		if (document.hidden) { orbit.target.copy(target); camera.position.copy(pos); orbit.update(); render(); }
	}

	// ---------- pointer: click to select, floor readout ----------
	var ray, ptr, down = null, floorPt = null;
	function pointerSetup() {
		ray = new T.Raycaster(); ptr = new T.Vector2();
		var el = renderer.domElement;
		el.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
		el.addEventListener('pointerup', function (e) {
			if (!down || tc.dragging) return;
			var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
			if (moved > 5 || tc.axis) return;
			var hit = pick(e);
			if (hit) select([hit], e.shiftKey || e.ctrlKey || e.metaKey);
			else if (!e.shiftKey) select([]);
		});
		el.addEventListener('pointermove', function (e) {
			setPtr(e); ray.setFromCamera(ptr, camera);
			var p = new T.Vector3(); floorPt = ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), 0), p) ? p : null; status();
		});
		el.addEventListener('dblclick', function (e) { var id = pick(e); if (id) { select([id]); frame(topSel()); } });
	}
	function setPtr(e) { var r = renderer.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
	function pick(e) {
		setPtr(e); ray.setFromCamera(ptr, camera);
		var list = S.objs.filter(function (o) { return !o.hidden; }).map(function (o) { return meshes[o.id]; }).filter(Boolean);
		var hits = ray.intersectObjects(list, false);
		if (!hits.length) return null;
		var solid = hits.find(function (h) { var o = byId(h.object.userData.id); return o && !o.hole; });   // see through holes to solids behind? prefer the nearest
		return hits[0].object.userData.id || (solid && solid.object.userData.id);
	}

	// ---------- labels (sizes of the selection) ----------
	function labels() {
		var box = $('#td-labels'), s = topSel(), html = '';
		if (s.length && selBox.visible) {
			var b = selBox.box, w = view.clientWidth, h = view.clientHeight;
			var pts = [[(b.min.x + b.max.x) / 2, b.min.y, b.min.z, b.max.x - b.min.x, 'x'], [b.max.x, (b.min.y + b.max.y) / 2, b.min.z, b.max.y - b.min.y, 'y'], [b.max.x, b.min.y, (b.min.z + b.max.z) / 2, b.max.z - b.min.z, 'z']];
			pts.forEach(function (p) {
				var v = new T.Vector3(p[0], p[1], p[2]).project(camera);
				if (v.z > 1) return;
				var x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
				if (x < 0 || y < 0 || x > w || y > h) return;
				html += '<span class="td-lab td-lab--' + p[4] + '" style="left:' + x.toFixed(0) + 'px;top:' + y.toFixed(0) + 'px">' + u(p[3]) + '</span>';
			});
		}
		box.innerHTML = html;
	}
	function status() {
		var s = topSel(), parts = [], P = plate();
		if (s.length) { var b = worldBox(s), z = new T.Vector3(); b.getSize(z); parts.push('<b>' + (s.length === 1 ? esc(nameOf(s[0])) : s.length + ' selected') + '</b> ' + u(z.x) + ' × ' + u(z.y) + ' × ' + u(z.z) + ' ' + uu()); }
		else if (S.objs.length) { var ab = worldBox(S.objs.filter(function (o) { return !o.hidden; })), az = new T.Vector3(); ab.getSize(az); parts.push('Everything: ' + u(az.x) + ' × ' + u(az.y) + ' × ' + u(az.z) + ' ' + uu()); }
		if (floorPt) parts.push('Pointer x ' + u(floorPt.x) + ', y ' + u(floorPt.y));
		parts.push(esc(P.name) + ' ' + P.x + '×' + P.y + '×' + P.z + ' mm');
		$('#td-status').innerHTML = parts.join('<span class="td-dot">·</span>');
	}

	// ---------- left panel ----------
	function shapesPanel() {
		$('#td-shapes').innerHTML = Object.keys(PRIMS).map(function (k) { return '<button type="button" class="td-shape" data-add="' + k + '" title="Add a ' + esc(PRIMS[k].name.toLowerCase()) + '"><span class="td-si">' + PRIMS[k].icon + '</span><span>' + esc(PRIMS[k].name.replace(/ \(.*/, '')) + '</span></button>'; }).join('')
			+ '<button type="button" class="td-shape" data-act="svg" title="Raise an SVG drawing into 3D"><span class="td-si">✎</span><span>SVG file</span></button>'
			+ '<button type="button" class="td-shape" data-act="photo3d" title="Turn a photo into a relief, coin, lithophane or figure"><span class="td-si">📷</span><span>Photo to 3D</span></button>';
	}
	var openGroups = {};
	function outliner() {
		var q = ($('#td-osearch').value || '').toLowerCase().trim(), out = [];
		function row(o, depth) {
			var kids = o.children || [], match = !q || nameOf(o).toLowerCase().indexOf(q) >= 0 || o.type.indexOf(q) >= 0;
			var kidsHtml = '';
			if (kids.length && (openGroups[o.id] || q)) kids.forEach(function (c) { kidsHtml += row(c, depth + 1); });
			if (!match && !kidsHtml) return '';
			var sel = depth === 0 && S.sel.indexOf(o.id) >= 0;
			var icon = o.type === 'group' ? (o.op === 'intersect' ? '⋂' : '⧉') : o.type === 'mesh' ? '▣' : (PRIMS[o.type] || {}).icon || '?';
			return '<div class="td-orow' + (sel ? ' on' : '') + (depth ? ' td-orow--kid' : '') + (o.hidden ? ' off' : '') + '" role="treeitem" aria-selected="' + sel + '" data-id="' + o.id + '" data-depth="' + depth + '" style="padding-left:' + (0.4 + depth * 1.1) + 'em">'
				+ (kids.length ? '<button type="button" class="td-otw" data-tw="' + o.id + '" aria-label="Show the parts">' + (openGroups[o.id] || q ? '▾' : '▸') + '</button>' : '<span class="td-otw"></span>')
				+ '<span class="td-osw" style="background:' + (o.hole ? 'transparent' : esc(o.color || '#888')) + '">' + icon + '</span>'
				+ '<span class="td-on" title="Double-click to rename">' + esc(nameOf(o)) + '</span>'
				+ (o.hole ? '<span class="td-tag">hole</span>' : '')
				+ (depth === 0 ? '<button type="button" class="td-oi" data-eye="' + o.id + '" title="' + (o.hidden ? 'Show' : 'Hide') + '" aria-label="' + (o.hidden ? 'Show' : 'Hide') + '">' + (o.hidden ? '◌' : '👁') + '</button><button type="button" class="td-oi" data-lock="' + o.id + '" title="' + (o.locked ? 'Unlock' : 'Lock (stops it moving)') + '" aria-label="Lock">' + (o.locked ? '🔒' : '🔓') + '</button>' : '')
				+ '</div>' + kidsHtml;
		}
		S.objs.forEach(function (o) { out.push(row(o, 0)); });
		var html = out.join('');
		$('#td-outl').innerHTML = html || '<p class="td-hint">' + (S.objs.length ? 'No part matches.' : 'Your parts will be listed here.') + '</p>';
		$('#td-ocount').textContent = S.objs.length ? '(' + S.objs.length + ')' : '';
	}

	// ---------- inspector ----------
	function inp(id, label, val, extra) { return '<label class="td-f"><span>' + label + '</span><input class="td-in" id="' + id + '" value="' + esc(val) + '" inputmode="decimal" autocomplete="off"' + (extra || '') + '></label>'; }
	function inspector() {
		var host = $('#td-insp'), s = topSel();
		if (!s.length) {
			host.innerHTML = '<p class="td-hint">Click a shape in the view or the Parts list to change it. Shift-click to pick several.</p>'
				+ '<div class="td-sec"><b>Project name</b><input class="td-in" id="td-pname" value="' + esc(S.name) + '" aria-label="Project name"></div>'
				+ '<div class="td-sec"><b>Quick start</b><ol class="td-steps"><li>Add a shape from the left.</li><li>Drag the arrows, or type sizes here.</li><li>Make a shape a <b>Hole</b>, then <b>Group</b> it with another to cut it out.</li><li>Check the <b>3D print</b> tab, then <b>Export</b>.</li></ol></div>';
			return;
		}
		if (s.length > 1) {
			host.innerHTML = '<div class="td-sec"><b>' + s.length + ' shapes selected</b><p class="td-hint">Drag the handles to move, turn or resize them together.</p>'
				+ '<div class="td-btns"><button type="button" class="td-b" data-act="group">⧉ Group</button><button type="button" class="td-b" data-act="subtract">⊖ Subtract</button><button type="button" class="td-b" data-act="intersect">⋂ Intersect</button></div></div>'
				+ alignHtml() + colorHtml(s[0].color) + '<div class="td-sec td-btns"><button type="button" class="td-b" data-act="hole">◌ Hole / solid</button><button type="button" class="td-b" data-act="dup">⧉ Duplicate</button><button type="button" class="td-b" data-act="drop">⤓ Drop</button><button type="button" class="td-b td-b--warn" data-act="delete">🗑 Delete</button></div>';
			return;
		}
		var o = s[0], def = PRIMS[o.type] || {}, b = worldBox([o]), sz = baseSize(o);
		var h = '<div class="td-sec"><input class="td-in td-name" id="td-oname" value="' + esc(o.name) + '" placeholder="' + esc(nameOf(o)) + '" aria-label="Name"></div>';
		h += '<div class="td-sec td-seg" role="group" aria-label="Solid or hole"><button type="button" class="td-b" data-solid="1" aria-pressed="' + !o.hole + '">■ Solid</button><button type="button" class="td-b" data-solid="0" aria-pressed="' + !!o.hole + '">◌ Hole</button></div>';
		if (!o.hole) h += colorHtml(o.color);
		h += '<div class="td-sec"><b>Size (' + uu() + ')</b> <label class="td-lock"><input type="checkbox" id="td-keep"' + (ST.keep ? ' checked' : '') + '> keep proportions</label><div class="td-3">'
			+ inp('td-sx', 'W (x)', u(sz[0])) + inp('td-sy', 'D (y)', u(sz[1])) + inp('td-sz', 'H (z)', u(sz[2])) + '</div></div>';
		h += '<div class="td-sec"><b>Position (' + uu() + ')</b> <span class="td-hint">centre of the shape</span><div class="td-3">'
			+ inp('td-px', 'X', u(o.pos[0])) + inp('td-py', 'Y', u(o.pos[1])) + inp('td-pz', 'Z', u(o.pos[2])) + '</div><div class="td-hint">Bottom at ' + u(b.min.z) + ' ' + uu() + (b.min.z > 0.01 ? ' (floating: press Drop)' : b.min.z < -0.01 ? ' (below the plate: press Drop)' : '') + '</div></div>';
		h += '<div class="td-sec"><b>Rotation (°)</b><div class="td-3">' + inp('td-rx', 'X', L.fmtNum(o.rot[0])) + inp('td-ry', 'Y', L.fmtNum(o.rot[1])) + inp('td-rz', 'Z', L.fmtNum(o.rot[2])) + '</div>'
			+ '<div class="td-btns td-btns--s"><button type="button" class="td-b td-b--s" data-rot="0,90">X +90°</button><button type="button" class="td-b td-b--s" data-rot="1,90">Y +90°</button><button type="button" class="td-b td-b--s" data-rot="2,90">Z +90°</button><button type="button" class="td-b td-b--s" data-rot="r">Reset</button></div></div>';
		h += paramsHtml(o, def);
		h += '<div class="td-sec td-btns"><button type="button" class="td-b" data-act="dup">⧉ Duplicate</button><button type="button" class="td-b" data-act="mirror">⇋ Mirror</button><button type="button" class="td-b" data-act="drop">⤓ Drop</button><button type="button" class="td-b" data-act="center">⌖ Centre on plate</button>'
			+ (o.type === 'group' ? '<button type="button" class="td-b" data-act="ungroup">⧈ Ungroup</button>' : '') + '<button type="button" class="td-b td-b--warn" data-act="delete">🗑 Delete</button></div>';
		host.innerHTML = h;
	}
	function baseSize(o) { var g = geoFor(o); g.computeBoundingBox(); var z = new T.Vector3(); g.boundingBox.getSize(z); return [z.x * Math.abs(o.scl[0]), z.y * Math.abs(o.scl[1]), z.z * Math.abs(o.scl[2])]; }
	function inspectorValues() {
		var s = topSel(); if (s.length !== 1 || !$('#td-px')) return;
		var o = s[0], sz = baseSize(o), map = { 'td-px': u(o.pos[0]), 'td-py': u(o.pos[1]), 'td-pz': u(o.pos[2]), 'td-rx': L.fmtNum(o.rot[0]), 'td-ry': L.fmtNum(o.rot[1]), 'td-rz': L.fmtNum(o.rot[2]), 'td-sx': u(sz[0]), 'td-sy': u(sz[1]), 'td-sz': u(sz[2]) };
		for (var id in map) { var el = $('#' + id); if (el && document.activeElement !== el) el.value = map[id]; }
	}
	function colorHtml(c) {
		return '<div class="td-sec"><b>Colour</b><div class="td-sw">' + COLORS.map(function (k) { return '<button type="button" class="td-swb' + (k === c ? ' on' : '') + '" data-color="' + k + '" style="background:' + k + '" aria-label="Colour ' + k + '"></button>'; }).join('')
			+ '<label class="td-swb td-swc" title="Any colour"><input type="color" id="td-color" value="' + esc(L.hex6(c).toLowerCase()) + '" aria-label="Pick any colour">＋</label></div></div>';
	}
	function alignHtml() {
		var a = function (k, n) { return '<div class="td-al"><span>' + n + '</span><button type="button" class="td-b td-b--s" data-align="' + k + ',min">' + (k === 2 ? 'Bottom' : k === 0 ? 'Left' : 'Front') + '</button><button type="button" class="td-b td-b--s" data-align="' + k + ',mid">Centre</button><button type="button" class="td-b td-b--s" data-align="' + k + ',max">' + (k === 2 ? 'Top' : k === 0 ? 'Right' : 'Back') + '</button><button type="button" class="td-b td-b--s" data-dist="' + k + '" title="Spread out evenly (3 or more)">Spread</button></div>'; };
		return '<div class="td-sec"><b>Align</b>' + a(0, 'X') + a(1, 'Y') + a(2, 'Z') + '</div>';
	}
	function pIn(key, label, val, kind) {
		if (kind === 'text') return '<label class="td-f td-f--w"><span>' + label + '</span><textarea class="td-in" id="td-p-' + key + '" data-p="' + key + '" rows="2">' + esc(val) + '</textarea></label>';
		return '<label class="td-f"><span>' + label + '</span><input class="td-in" id="td-p-' + key + '" data-p="' + key + '" data-kind="' + (kind || 'mm') + '" value="' + esc(kind === 'n' || kind === 'pct' ? L.fmtNum(val, 2) : u(val)) + '" inputmode="decimal"></label>';
	}
	function paramsHtml(o, def) {
		var p = o.p || {}, h = '';
		switch (o.type) {
			case 'plate': h = pIn('r', 'Corner radius', p.r); break;
			case 'sphere': case 'cylinder': h = pIn('seg', o.type === 'cylinder' ? 'Sides (6 = hexagon)' : 'Smoothness', p.seg, 'n'); break;
			case 'cone': h = pIn('top', 'Top width %', p.top, 'pct') + pIn('seg', 'Sides', p.seg, 'n'); break;
			case 'pyramid': h = pIn('sides', 'Sides', p.sides, 'n'); break;
			case 'torus': case 'tube': h = (o.type === 'tube' ? pIn('wall', 'Wall thickness', p.wall) : '') + pIn('seg', 'Smoothness', p.seg, 'n'); break;
			case 'star': h = pIn('points', 'Points', p.points, 'n') + pIn('inner', 'Inner size %', p.inner, 'pct'); break;
			case 'gear': h = pIn('teeth', 'Teeth', p.teeth, 'n') + pIn('mod', 'Module (tooth size)', p.mod, 'n') + pIn('h', 'Thickness', p.h) + pIn('bore', 'Shaft hole', p.bore)
				+ '<p class="td-hint">Outside diameter ' + u(L.gearPts(p.teeth, p.mod).tip * 2) + ' ' + uu() + '. Gears with the same module fit together; place them ' + u(p.mod) + ' × (teeth A + teeth B) ÷ 2 apart.</p>'; break;
			case 'text': h = pIn('text', 'Text', p.text, 'text') + '<label class="td-f td-f--w"><span>Font</span><select class="td-in" data-p="font">' + FONT_LIST.map(function (f) { return '<option value="' + f[0] + '"' + (p.font === f[0] ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select></label>'
				+ pIn('size', 'Letter height', p.size) + pIn('depth', 'Thickness', p.depth); break;
			case 'lathe': h = '<button type="button" class="td-b td-b--pri" data-act="sketch">✎ Edit the profile</button>' + pIn('seg', 'Smoothness', p.seg, 'n'); break;
			case 'extrude': h = (p.svg ? '<p class="td-hint">Made from an SVG file. Change its size with the Size boxes.</p>' : '<button type="button" class="td-b td-b--pri" data-act="sketch">✎ Edit the drawing</button>') + pIn('depth', 'Height', p.depth); break;
			case 'mesh': h = '<p class="td-hint">Imported model: ' + (p.tris || 0).toLocaleString() + ' triangles. Group it with holes or shapes to change it.</p>'; break;
			case 'group':
				h = '<label class="td-f td-f--w"><span>Combine</span><select class="td-in" id="td-gop"><option value="union"' + (o.op !== 'intersect' ? ' selected' : '') + '>Join (holes cut)</option><option value="intersect"' + (o.op === 'intersect' ? ' selected' : '') + '>Keep only the overlap</option></select></label>';
				var texts = []; walk(o.children, function (c) { if (c.type === 'text') texts.push(c); });
				texts.forEach(function (c, i) { h += '<label class="td-f td-f--w"><span>Words' + (texts.length > 1 ? ' ' + (i + 1) : '') + '</span><textarea class="td-in" rows="1" data-gtext="' + c.id + '">' + esc(c.p.text) + '</textarea></label>'; });
				h += '<p class="td-hint">' + o.children.length + ' parts. Ungroup to change them one by one.</p>'; break;
		}
		return h ? '<div class="td-sec"><b>Shape settings</b><div class="td-2">' + h + '</div></div>' : '';
	}
	function readLen(el) { var v = L.parseLength(el.value, ST.unit === 'in' ? 'in' : ST.unit); return v; }
	function inspectorEvents() {
		var host = $('#td-insp');
		host.addEventListener('change', function (e) {
			var el = e.target, s = topSel(); if (!s.length) { if (el.id === 'td-pname') { S.name = el.value.trim() || 'My model'; commit('Rename'); } return; }
			var o = s[0];
			if (el.id === 'td-oname') { o.name = el.value.trim(); commit('Rename'); return; }
			if (el.id === 'td-color') { s.forEach(function (x) { x.color = el.value; }); commit('Colour'); return; }
			if (el.id === 'td-keep') { ST.keep = el.checked; saveST(); return; }
			if (el.id === 'td-gop') { o.op = el.value; commit('Combine'); return; }
			if (el.dataset.gtext) { var c = byId(el.dataset.gtext); if (c) { c.p.text = el.value; commit('Text'); } return; }
			var m = /^td-(p|r|s)([xyz])$/.exec(el.id);
			if (m) {
				var k = 'xyz'.indexOf(m[2]), v = m[1] === 'r' ? parseFloat(String(el.value).replace(',', '.')) : readLen(el);
				if (!isFinite(v)) { toast('Type a number, like 20, 2 cm or 1 in.'); inspectorValues(); return; }
				if (m[1] === 'p') o.pos[k] = v;
				else if (m[1] === 'r') o.rot[k] = v;
				else setSize(o, k, v);
				commit('Edit'); return;
			}
			if (el.dataset.p) {
				var key = el.dataset.p, kind = el.dataset.kind, val;
				if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') val = el.value;
				else { val = kind === 'mm' ? readLen(el) : parseFloat(String(el.value).replace(',', '.')); if (!isFinite(val)) { toast('Type a number.'); inspector(); return; } }
				o.p[key] = val; commit('Shape setting');
			}
		});
		host.addEventListener('input', function (e) { if (e.target.id === 'td-p-text' || e.target.dataset.gtext) { clearTimeout(inspectorEvents.t); var el = e.target; inspectorEvents.t = setTimeout(function () { el.dispatchEvent(new Event('change', { bubbles: true })); }, 500); } });
		host.addEventListener('click', function (e) {
			var b = e.target.closest('button'); if (!b) return;
			var s = topSel();
			if (b.dataset.color) { s.forEach(function (x) { x.color = b.dataset.color; }); commit('Colour'); }
			else if (b.dataset.solid) { s.forEach(function (x) { x.hole = b.dataset.solid === '0'; }); commit('Solid / hole'); }
			else if (b.dataset.rot) { s.forEach(function (x) { if (b.dataset.rot === 'r') x.rot = [0, 0, 0]; else { var r = b.dataset.rot.split(','); x.rot[+r[0]] = ((x.rot[+r[0]] + +r[1]) % 360 + 360) % 360; } }); commit('Rotate'); drop(s); }
			else if (b.dataset.align) { var a = b.dataset.align.split(','); align(+a[0], a[1]); }
			else if (b.dataset.dist) distribute(+b.dataset.dist);
		});
	}
	function setSize(o, k, v) {
		if (v <= 0) return;
		var cur = baseSize(o), f = v / (cur[k] || 1), def = PRIMS[o.type];
		var factors = ST.keep ? [f, f, f] : [k === 0 ? f : 1, k === 1 ? f : 1, k === 2 ? f : 1];
		if (def && def.dims) { o.p.w = +(o.p.w * factors[0]).toFixed(4); o.p.d = +(o.p.d * factors[1]).toFixed(4); o.p.h = +(o.p.h * factors[2]).toFixed(4); }
		else o.scl = o.scl.map(function (s, i) { return +(s * factors[i]).toFixed(6); });
	}

	// ---------- print check ----------
	function exportParts(onlySel) {
		var list = (onlySel ? topSel() : S.objs).filter(function (o) { return !o.hidden; });
		var solids = list.filter(function (o) { return !o.hole && !isHoleGroup(o); });
		var loose = list.length - solids.length;
		return { parts: solids.map(function (o) { return { o: o, g: placed(o, matOf(o)) }; }), loose: loose };
	}
	function soup(parts) { var n = 0; parts.forEach(function (p) { n += p.g.attributes.position.array.length; }); var out = new Float32Array(n), at = 0; parts.forEach(function (p) { out.set(p.g.attributes.position.array, at); at += p.g.attributes.position.array.length; }); return out; }
	var lastCheck = null;
	function schedCheck() { clearTimeout(schedCheck.t); schedCheck.t = setTimeout(function () { if (ST.tab === 'print' || ST.showOh || ST.showThin) check(); }, 500); }
	function check(force) {
		if (!ready) return;
		var ex = exportParts(false), pos = soup(ex.parts), tris = pos.length / 9;
		var host = $('#td-print'), P = plate();
		if (!force && tris > 600000) { host.innerHTML = setupHtml() + '<p class="td-hint">Big model (' + tris.toLocaleString() + ' triangles).</p><button type="button" class="td-b td-b--pri" data-act="check">Check now</button>'; return; }
		var r = { tris: tris, loose: ex.loose };
		if (tris) {
			r.bb = L.bboxOf(pos); r.fit = L.plateFit(r.bb, P); r.va = L.volumeArea(pos);
			r.mc = { closed: true, boundary: 0, gaps: 0, gapLength: 0, tjunctions: 0, nonManifold: 0, flipped: 0, shells: 0 };
			ex.parts.forEach(function (p) { var m = L.manifoldCheck(p.g.attributes.position.array, 1e-3); ['boundary', 'gaps', 'gapLength', 'tjunctions', 'nonManifold', 'flipped', 'shells'].forEach(function (k) { r.mc[k] += m[k]; }); if (!m.closed) { r.mc.closed = false; (r.open = r.open || []).push(nameOf(p.o)); } });
			r.oh = L.overhang(pos, ST.ohAngle, 0, 0.05);
			r.fil = L.filament(r.va, { material: ST.mat, diameter: ST.dia, infill: ST.infill, wall: ST.wall, price: ST.price, flow: ST.flow });
			r.thin = thinCheck(ex.parts, pos);
			r.float = ex.parts.map(function (p) { return [nameOf(p.o), L.bboxOf(p.g.attributes.position.array).min[2]]; }).filter(function (f) { return f[1] > 0.05; });
		}
		lastCheck = r;
		printPanel(r);
		drawOverlay(pos, r);
	}
	function thinCheck(parts, pos) {
		var out = { parts: [], area: 0, total: 0, flags: null };
		parts.forEach(function (p) { var b = L.bboxOf(p.g.attributes.position.array), m = Math.min.apply(null, b.size); if (m < ST.minWall) out.parts.push([nameOf(p.o), m]); });
		var nt = pos.length / 9; if (!nt || !BVH) return out;
		try {
			var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
			var bvh = new BVH.MeshBVH(g), r = new T.Ray(), flags = new Uint8Array(nt), step = Math.max(1, Math.floor(nt / 2500));
			var a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), ctr = new T.Vector3();
			for (var t = 0; t < nt; t += step) {
				var i = t * 9; a.fromArray(pos, i); b.fromArray(pos, i + 3); c.fromArray(pos, i + 6);
				n.subVectors(b, a).cross(c.clone().sub(a)); var ar = n.length() / 2; if (!ar) continue; n.normalize();
				ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
				r.origin.copy(ctr).addScaledVector(n, -0.002); r.direction.copy(n).negate();
				var hit = bvh.raycastFirst(r, T.DoubleSide);
				out.total += ar * step;
				if (hit && hit.distance + 0.002 < ST.minWall) { out.area += ar * step; flags[t] = 1; }
			}
			out.flags = flags;
		} catch (e) { console.warn(e); }
		return out;
	}
	function drawOverlay(pos, r) {
		if (overlay) { scene.remove(overlay); overlay.geometry.dispose(); overlay = null; }
		if (!pos.length || (!ST.showOh && !ST.showThin)) { dirty = true; return; }
		var pick = [], cols = [], nt = pos.length / 9;
		for (var t = 0; t < nt; t++) {
			var oh = ST.showOh && r.oh && r.oh.flags[t], th = ST.showThin && r.thin && r.thin.flags && r.thin.flags[t];
			if (!oh && !th) continue;
			for (var k = 0; k < 9; k++) pick.push(pos[t * 9 + k]);
			var col = th ? [1, 0.6, 0.1] : [0.95, 0.15, 0.2];
			cols.push.apply(cols, col.concat(col, col));
		}
		if (!pick.length) { dirty = true; return; }
		var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pick, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
		overlay = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: true, opacity: 0.85 }));
		overlay.renderOrder = 3; scene.add(overlay); dirty = true;
	}
	function setupHtml() {
		var P = plate();
		return '<div class="td-sec"><b>Printer</b><select class="td-in" id="td-plate" aria-label="Printer build plate">' + L.PLATES.map(function (p) { return '<option value="' + p.id + '"' + (p.id === ST.plate ? ' selected' : '') + '>' + esc(p.name) + (p.id !== 'custom' ? ' (' + p.x + '×' + p.y + '×' + p.z + ')' : '') + '</option>'; }).join('') + '</select>'
			+ (ST.plate === 'custom' ? '<div class="td-3">' + ['x', 'y', 'z'].map(function (k) { return '<label class="td-f"><span>' + { x: 'Width', y: 'Depth', z: 'Height' }[k] + ' mm</span><input class="td-in" data-cust="' + k + '" value="' + P[k] + '" inputmode="decimal"></label>'; }).join('') + '</div>' : '') + '</div>'
			+ '<div class="td-sec"><b>Plastic</b><div class="td-2"><label class="td-f"><span>Material</span><select class="td-in" data-st="mat">' + L.MATERIALS.map(function (m) { return '<option value="' + m.id + '"' + (m.id === ST.mat ? ' selected' : '') + '>' + esc(m.name) + ' (' + m.density + ' g/cm³)</option>'; }).join('') + '</select></label>'
			+ '<label class="td-f"><span>Filament</span><select class="td-in" data-st="dia"><option value="1.75"' + (+ST.dia === 1.75 ? ' selected' : '') + '>1.75 mm</option><option value="2.85"' + (+ST.dia === 2.85 ? ' selected' : '') + '>2.85 mm</option></select></label>'
			+ '<label class="td-f"><span>Infill %</span><input class="td-in" data-st="infill" value="' + ST.infill + '" inputmode="decimal"></label>'
			+ '<label class="td-f"><span>Walls (mm)</span><input class="td-in" data-st="wall" value="' + ST.wall + '" inputmode="decimal"></label>'
			+ '<label class="td-f"><span>Price per kg</span><input class="td-in" data-st="price" value="' + ST.price + '" inputmode="decimal"></label>'
			+ '<label class="td-f"><span>Thinnest wall (mm)</span><input class="td-in" data-st="minWall" value="' + ST.minWall + '" inputmode="decimal"></label></div></div>';
	}
	function printPanel(r) {
		var h = '';
		if (!r.tris) { $('#td-print').innerHTML = '<p class="td-hint">Add a shape to check it for printing.</p>' + setupHtml(); return; }
		var ok = function (good, txt, more) { return '<div class="td-ck ' + (good === true ? 'ok' : good === 'warn' ? 'warn' : 'bad') + '"><span class="td-cki">' + (good === true ? '✓' : good === 'warn' ? '!' : '✗') + '</span><div>' + txt + (more ? '<small>' + more + '</small>' : '') + '</div></div>'; };
		var f = r.fit, sz = r.bb.size, P = plate();
		h += '<div class="td-sec"><b>Checks</b>';
		if (f.fits) h += ok(true, 'Fits on the ' + esc(P.name) + ' plate', u(sz[0]) + ' × ' + u(sz[1]) + ' × ' + u(sz[2]) + ' ' + uu());
		else {
			var more = [];
			if (!f.fitsSize) more.push(f.fitsIfTurned ? 'It fits if you turn it 90° (select all, Rotate Z +90°).' : 'It is bigger than the plate: make it smaller or cut it into parts.');
			else if (!f.inside) more.push('It hangs over the edge: select everything and press Centre on plate.');
			if (f.below) more.push('Part of it is below the plate: press Drop.');
			h += ok(false, 'Does not fit the ' + esc(P.name) + ' (' + P.x + '×' + P.y + '×' + P.z + ')', more.join(' '));
		}
		if (!f.floating && r.float.length) h += ok('warn', r.float.length === 1 ? esc(r.float[0][0]) + ' floats ' + u(r.float[0][1]) + ' ' + uu() + ' above the plate' : r.float.length + ' parts float above the plate', 'Select it and press Drop (D), or it will print in mid-air.');
		if (f.floating) h += ok('warn', 'The model is floating ' + u(r.bb.min[2]) + ' ' + uu() + ' above the plate', 'Press Drop (D) so it sits on the plate.');
		var tiny = !r.mc.closed && !r.mc.flipped && r.mc.gapLength < 1 && r.mc.nonManifold <= 4;
		if (tiny) h += ok('warn', 'Watertight, apart from ' + (r.mc.gaps + r.mc.nonManifold) + ' tiny seam' + (r.mc.gaps + r.mc.nonManifold > 1 ? 's' : ''), 'Leftovers from cutting shapes (under 1 mm in all). Slicers close these by themselves.');
		else h += r.mc.closed ? ok(true, 'Watertight (closed, no gaps)', r.mc.shells + ' separate piece' + (r.mc.shells === 1 ? '' : 's')) : ok(false, 'Not watertight', (r.mc.gaps ? r.mc.gaps + ' open edges. ' : '') + (r.mc.nonManifold ? r.mc.nonManifold + ' edges shared by 3+ faces. ' : '') + (r.mc.flipped ? r.mc.flipped + ' faces facing the wrong way. ' : '') + 'In: ' + esc((r.open || []).join(', ')) + '. Most slicers repair small problems; grouping it with a box often fixes it.');
		if (r.loose) h += ok('warn', r.loose + ' hole' + (r.loose > 1 ? 's are' : ' is') + ' not grouped with anything', 'A hole only cuts when it is grouped with a solid. Loose holes are left out of the export.');
		var thinPct = r.thin.total ? r.thin.area / r.thin.total * 100 : 0;
		if (r.thin.parts.length) h += ok('warn', 'Very thin part' + (r.thin.parts.length > 1 ? 's' : ''), r.thin.parts.map(function (t) { return esc(t[0]) + ' is only ' + u(t[1]) + ' ' + uu(); }).join('; ') + '. Under about ' + ST.minWall + ' mm may not print.');
		else if (thinPct > 0.5) h += ok('warn', 'About ' + L.fmtNum(thinPct, 1) + '% of the surface is on walls thinner than ' + ST.minWall + ' mm', 'Turn on "Show thin walls" to see them in orange.');
		else h += ok(true, 'No walls thinner than ' + ST.minWall + ' mm found');
		var ohPct = r.oh.fraction * 100;
		h += ohPct > 0.5 ? ok('warn', 'Overhangs: ' + L.fmtNum(ohPct, 1) + '% of the surface faces down steeper than ' + ST.ohAngle + '°', 'These need supports. Turn on "Show overhangs" to see them in red; turning the model often removes them.') : ok(true, 'No big overhangs (' + ST.ohAngle + '° rule)');
		h += '<label class="td-chk"><input type="checkbox" data-stb="showOh"' + (ST.showOh ? ' checked' : '') + '> Show overhangs (red)</label><label class="td-chk"><input type="checkbox" data-stb="showThin"' + (ST.showThin ? ' checked' : '') + '> Show thin walls (orange)</label>';
		h += '</div><div class="td-sec"><b>Estimate</b><div class="td-stats">'
			+ '<div><span>Volume</span><b>' + L.fmtNum(r.va.volume / 1000, 2) + ' cm³</b></div>'
			+ '<div><span>Plastic used</span><b>' + L.fmtNum(r.fil.grams, 1) + ' g</b></div>'
			+ (r.fil.metres ? '<div><span>Filament</span><b>' + L.fmtNum(r.fil.metres, 2) + ' m</b></div>' : '')
			+ '<div><span>Cost</span><b>' + L.fmtNum(r.fil.cost, 2) + '</b></div>'
			+ '<div><span>Print time</span><b>~' + (r.fil.hours < 1 ? Math.max(1, Math.round(r.fil.hours * 60)) + ' min' : L.fmtNum(r.fil.hours, 1) + ' h') + '</b></div>'
			+ '<div><span>Triangles</span><b>' + r.tris.toLocaleString() + '</b></div></div>'
			+ '<p class="td-hint">Solid skin of ' + ST.wall + ' mm plus ' + ST.infill + '% infill. Your slicer gives the exact numbers; print time is a very rough guess.</p></div>';
		$('#td-print').innerHTML = h + setupHtml();
	}
	function printEvents() {
		var host = $('#td-print');
		host.addEventListener('change', function (e) {
			var el = e.target;
			if (el.id === 'td-plate') { ST.plate = el.value; saveST(); buildPlate(); status(); check(); return; }
			if (el.dataset.cust) { var v = parseFloat(el.value); if (v > 0) { ST.custom[el.dataset.cust] = v; saveST(); buildPlate(); check(); } return; }
			if (el.dataset.stb) { ST[el.dataset.stb] = el.checked; saveST(); check(); return; }
			if (el.dataset.st) { var k = el.dataset.st, val = k === 'mat' ? el.value : parseFloat(String(el.value).replace(',', '.')); if (k !== 'mat' && !(val >= 0)) return; ST[k] = val; if (k === 'mat') ST.price = L.materialById(val).price; saveST(); check(); }
		});
	}
	function settingsPanel() {
		$('#td-set').innerHTML = '<div class="td-sec"><b>Units</b><div class="td-seg">' + [['mm', 'Millimetres'], ['cm', 'Centimetres'], ['in', 'Inches']].map(function (x) { return '<button type="button" class="td-b" data-unit="' + x[0] + '" aria-pressed="' + (ST.unit === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div><p class="td-hint">You can always type any unit: "2 cm", "1 in", "10*3".</p></div>'
			+ '<div class="td-sec"><label class="td-chk"><input type="checkbox" data-sv="showVol"' + (ST.showVol ? ' checked' : '') + '> Show the printer\'s build height</label>'
			+ '<label class="td-f"><span>Overhang angle (°)</span><input class="td-in" data-sn="ohAngle" value="' + ST.ohAngle + '" inputmode="decimal"></label><p class="td-hint">45° is the usual rule; good printers manage 50-60°.</p></div>'
			+ '<div class="td-sec"><b>Saved in this browser</b><p class="td-hint">Your last project is kept here automatically. Use Save for a file you can open anywhere.</p><button type="button" class="td-b" data-act="new">✚ Start a new project</button></div>';
	}
	function settingsEvents() {
		var host = $('#td-set');
		host.addEventListener('click', function (e) { var b = e.target.closest('[data-unit]'); if (b) { ST.unit = b.dataset.unit; saveST(); settingsPanel(); inspector(); status(); check(); dirty = true; } });
		host.addEventListener('change', function (e) {
			var el = e.target;
			if (el.dataset.sv) { ST[el.dataset.sv] = el.checked; saveST(); buildPlate(); }
			if (el.dataset.sn) { var v = parseFloat(el.value); if (v > 0 && v < 90) { ST[el.dataset.sn] = v; saveST(); check(); } }
		});
	}
	function setTab(t) {
		ST.tab = t; saveST();
		$$('.td-tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
		['obj', 'print', 'set'].forEach(function (k) { $('#td-tp-' + k).hidden = k !== t; });
		if (t === 'print') check();
	}

	// ---------- dialogs ----------
	var dlgClose = null;
	function dialog(html, cls, onClose) {
		var w = $('#td-dlgw'), d = $('#td-dlg');
		d.className = 'td-dlg ' + (cls || ''); d.innerHTML = '<button type="button" class="td-x" data-close aria-label="Close">✕</button>' + html; w.hidden = false;
		dlgClose = function () { w.hidden = true; d.innerHTML = ''; dlgClose = null; if (onClose) onClose(); };
		var f = d.querySelector('input,textarea,select,button:not([data-close])'); if (f) setTimeout(function () { f.focus(); }, 30);
		return d;
	}
	function closeDlg() { if (dlgClose) dlgClose(); }
	$('#td-dlgw').addEventListener('click', function (e) { if (e.target.id === 'td-dlgw' || e.target.closest('[data-close]')) closeDlg(); });

	function templatesDlg() {
		var d = dialog('<h3>Templates</h3><input type="search" class="td-in" id="td-tq" placeholder="Search: keychain, cup, gear, box…" aria-label="Search templates"><div class="td-tgrid" id="td-tgrid"></div>', 'td-dlg--wide');
		function draw() {
			var q = $('#td-tq').value.toLowerCase().trim();
			var list = window.TD_TEMPLATES.filter(function (t) { return !q || (t.name + ' ' + t.tags + ' ' + t.desc).toLowerCase().indexOf(q) >= 0; });
			$('#td-tgrid').innerHTML = list.map(function (t) { return '<button type="button" class="td-tcard" data-tpl="' + t.id + '"><span class="td-tthumb" data-thumb="' + t.id + '">' + (thumbs[t.id] ? '<img src="' + thumbs[t.id] + '" alt="">' : t.emoji) + '</span><b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small></button>'; }).join('') || '<p class="td-hint">No template matches. Try "box" or "text".</p>';
			makeThumbs();
		}
		$('#td-tq').addEventListener('input', draw);
		d.addEventListener('click', function (e) { var b = e.target.closest('[data-tpl]'); if (!b) return; var t = window.TD_TEMPLATES.find(function (x) { return x.id === b.dataset.tpl; }); closeDlg(); fromTemplate(t); toast('Added: ' + t.name + '. ' + t.desc); });
		draw();
	}
	var thumbs = {}, thumbBusy = false;
	function makeThumbs() {
		if (thumbBusy || !ready) return;
		if (!TextGeometry || !FONTS.helvetiker_bold) { textReady().then(makeThumbs).catch(function () {}); return; }
		thumbBusy = true;
		var todo = window.TD_TEMPLATES.filter(function (t) { return !thumbs[t.id]; });
		if (!todo.length) { thumbBusy = false; return; }
		var r2 = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r2.setSize(240, 180); r2.setClearColor(0x252b36);
		var sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x445066, 1.8)); var dl = new T.DirectionalLight(0xffffff, 1.5); dl.position.set(1, -1.2, 2); sc.add(dl);
		var cam = new T.PerspectiveCamera(32, 4 / 3, 0.5, 5000); cam.up.set(0, 0, 1);
		var i = 0;
		(function next() {
			if (i >= todo.length || $('#td-dlgw').hidden) { r2.dispose(); r2.forceContextLoss(); thumbBusy = false; return; }
			var t = todo[i++], grp = new T.Group();
			try {
				t.make().forEach(function (o) { if (!o.color) o.color = '#60a5fa'; var m = new T.Mesh(geoFor(o), matFor(o)); setXform(m, o); grp.add(m); });
				sc.add(grp);
				var b = new T.Box3().setFromObject(grp, true), c = new T.Vector3(), z = new T.Vector3(); b.getCenter(c); b.getSize(z);
				var dist = z.length() / 2 / Math.sin(16 * Math.PI / 180) * 1.05;
				cam.position.copy(c).add(new T.Vector3(0.6, -0.85, 0.6).normalize().multiplyScalar(dist)); cam.lookAt(c); cam.updateProjectionMatrix();
				r2.render(sc, cam); thumbs[t.id] = r2.domElement.toDataURL('image/png');
				sc.remove(grp);
				var el = $('[data-thumb="' + t.id + '"]'); if (el) el.innerHTML = '<img src="' + thumbs[t.id] + '" alt="">';
			} catch (e) { console.warn('thumb', t.id, e); }
			setTimeout(next, 0);
		})();
	}

	function helpDlg() {
		var keys = [['Click', 'Select a shape (Shift-click adds more)'], ['Drag in the view', 'Turn the view'], ['Right-drag / two fingers', 'Pan'], ['Wheel / pinch', 'Zoom'], ['Double-click a shape', 'Zoom to it'],
			['G / R / S', 'Move / Rotate / Scale handles'], ['Arrow keys', 'Move the selection one grid step (Shift: ×10)'], ['Page Up / Page Down', 'Move up / down'], ['H', 'Hole / solid'], ['Ctrl+G', 'Group'], ['Ctrl+Shift+G', 'Ungroup'],
			['Ctrl+D', 'Duplicate'], ['D', 'Drop onto the plate'], ['M', 'Mirror (left / right)'], ['Delete', 'Delete'], ['Ctrl+A', 'Select everything'], ['Esc', 'Select nothing / close'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
			['7 / 1 / 3 / 0', 'Top / Front / Side / 3D view'], ['.', 'Zoom to the selection'], ['F / Shift+F', 'Fill window / Full screen'], ['Ctrl+S / Ctrl+O / Ctrl+E', 'Save / Open / Export'], ['?', 'This help']];
		dialog('<h3>How 3D Studio works</h3><ol class="td-steps"><li><b>Add shapes</b> from the left. They land on the build plate.</li><li><b>Move, turn, resize</b> with the handles, or type exact numbers in the Shape panel (any unit: 20, 2 cm, 1 in).</li><li><b>Holes</b>: make a shape a hole, put it where you want to cut, select it with the solid and press <b>Group</b>. Subtract does this in one step.</li><li><b>Check</b> the 3D print tab: plate size, watertight, thin walls, overhangs, filament and cost.</li><li><b>Export</b> STL or 3MF and open it in your slicer.</li></ol>'
			+ '<h4>Keyboard and mouse</h4><table class="td-keys">' + keys.map(function (k) { return '<tr><td><kbd>' + esc(k[0]) + '</kbd></td><td>' + esc(k[1]) + '</td></tr>'; }).join('') + '</table>', 'td-dlg--wide');
	}
	function mirrorDlg() {
		if (!selected(true).length) return toast('Select a shape first.');
		var d = dialog('<h3>Mirror (flip)</h3><p class="td-hint">Flip the selection across its own centre.</p><div class="td-btns"><button type="button" class="td-b" data-m="0">⇋ Left ↔ right (X)</button><button type="button" class="td-b" data-m="1">⇅ Front ↔ back (Y)</button><button type="button" class="td-b" data-m="2">⇕ Upside down (Z)</button></div>');
		d.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b) { closeDlg(); mirror(+b.dataset.m); } });
	}
	function alignDlg() {
		if (selected(true).length < 2) return toast('Select two or more shapes (Shift-click) to line them up.');
		var d = dialog('<h3>Align and spread</h3>' + alignHtml());
		d.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.align) { var a = b.dataset.align.split(','); align(+a[0], a[1]); } else if (b.dataset.dist) distribute(+b.dataset.dist); });
	}

	// ---------- 2D sketch editor (Revolve profile / Extrude drawing) ----------
	var PRESETS = {
		lathe: { 'Vase': [[0, 0], [20, 0], [27, 25], [17, 55], [21, 80], [0, 80]], 'Cup (solid)': [[0, 0], [30, 0], [33, 80], [0, 80]], 'Bowl': [[0, 0], [20, 0], [40, 30], [37, 30], [18, 3], [0, 3]], 'Pawn': [[0, 0], [14, 0], [14, 3], [12, 6], [9, 8], [6, 14], [5, 22], [8, 24], [8, 26], [4.5, 27], [7, 30], [8, 34], [7, 38], [4, 40.5], [0, 41]],
			'Bottle': [[0, 0], [22, 0], [22, 60], [10, 75], [8, 90], [0, 90]], 'Spinning top': [[0, 0], [1.5, 0], [22, 14], [22, 17], [5, 22], [4, 40], [0, 40]], 'Dome': [[0, 0], [25, 0], [24, 8], [21, 15], [15, 21], [8, 24], [0, 25]] },
		extrude: { 'Star': L.starPts(5, 20, 9), 'Heart': L.heartPts(36, 48), 'Hexagon': L.polygonPts(6, 18), 'Arrow': [[-20, -5], [5, -5], [5, -14], [22, 0], [5, 14], [5, 5], [-20, 5]], 'Letter L': [[-10, -15], [12, -15], [12, -8], [-3, -8], [-3, 15], [-10, 15]],
			'Cross': [[-4, -15], [4, -15], [4, -4], [15, -4], [15, 4], [4, 4], [4, 15], [-4, 15], [-4, 4], [-15, 4], [-15, -4], [-4, -4]], 'Moon': (function () { var o = []; for (var i = 0; i <= 24; i++) { var a = -Math.PI / 2 + i / 24 * Math.PI; o.push([18 * Math.cos(a), 18 * Math.sin(a)]); } for (var j = 24; j >= 0; j--) { var b = -Math.PI / 2 + j / 24 * Math.PI; o.push([9 * Math.cos(b), 18 * Math.sin(b)]); } return o; })() }
	};
	function sketch(o, isNew) {
		var lathe = o.type === 'lathe', pts = clone(lathe ? o.p.pts : ((o.p.shapes || [])[0] || { o: [] }).o).map(function (p) { return [+p[0].toFixed(2), +p[1].toFixed(2)]; });
		var selPt = -1, hist2 = [];
		var d = dialog('<h3>' + (lathe ? 'Revolve: draw half of the outline' : 'Extrude: draw the shape') + '</h3>'
			+ '<p class="td-hint">' + (lathe ? 'The dashed line is the middle. The shape spins around it, like on a pottery wheel. Click to add points, drag them to move.' : 'Click to add corners, drag them to move. The drawing is raised straight up.') + ' Click near a line to put a point on it. Select a point and press Delete to remove it.</p>'
			+ '<div class="td-skw"><canvas id="td-skc" width="640" height="440" aria-label="Drawing area"></canvas><div class="td-skside">'
			+ '<label class="td-f"><span>Start from</span><select class="td-in" id="td-skpre"><option value="">Pick a shape…</option>' + Object.keys(PRESETS[lathe ? 'lathe' : 'extrude']).map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select></label>'
			+ '<label class="td-f"><span>Snap to</span><select class="td-in" id="td-sksnap"><option value="0">Off</option><option value="0.5">0.5 mm</option><option value="1" selected>1 mm</option><option value="5">5 mm</option></select></label>'
			+ (lathe ? '' : '<label class="td-f"><span>Height (mm)</span><input class="td-in" id="td-skdepth" value="' + L.fmtNum(o.p.depth || 5) + '" inputmode="decimal"></label>')
			+ '<label class="td-f td-f--w"><span>Points (x, y per line, mm)</span><textarea class="td-in td-mono" id="td-skpts" rows="8"></textarea></label>'
			+ '<div class="td-btns"><button type="button" class="td-b td-b--s" id="td-skdel">Delete point</button><button type="button" class="td-b td-b--s" id="td-skundo">Undo</button><button type="button" class="td-b td-b--s" id="td-skclear">Clear</button></div>'
			+ '<p class="td-hint" id="td-skinfo"></p></div></div>'
			+ '<div class="td-btns td-btns--end"><button type="button" class="td-b" data-close>Cancel</button><button type="button" class="td-b td-b--pri" id="td-skok">' + (isNew ? 'Add to the model' : 'Apply') + '</button></div>', 'td-dlg--wide');
		var cv = $('#td-skc'), cx = cv.getContext('2d'), sc = 4, ox = 0, oy = 0, drag = -1;
		function fitView() {
			var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
			cv.width = Math.max(200, r.width * dpr | 0); cv.height = Math.max(160, r.height * dpr | 0);
			var b = pts.length ? L.bounds2(pts.concat(lathe ? [[0, 0]] : [])) : { minx: -20, maxx: 20, miny: -20, maxy: 20, w: 40, h: 40 };
			var w = Math.max(40, b.w * 1.3), h = Math.max(40, b.h * 1.3);
			sc = Math.min(cv.width / w, cv.height / h);
			ox = cv.width / 2 - (b.minx + b.maxx) / 2 * sc; oy = cv.height / 2 + (b.miny + b.maxy) / 2 * sc;
		}
		function toS(p) { return [ox + p[0] * sc, oy - p[1] * sc]; }
		function toW(x, y) { return [(x - ox) / sc, (oy - y) / sc]; }
		function snapP(p) { var s = +$('#td-sksnap').value; var q = s ? [L.snap(p[0], s), L.snap(p[1], s)] : [+p[0].toFixed(2), +p[1].toFixed(2)]; if (lathe) q[0] = Math.max(0, q[0]); return q; }
		function draw() {
			var W = cv.width, H = cv.height, dpr = window.devicePixelRatio || 1;
			cx.fillStyle = '#1b1f27'; cx.fillRect(0, 0, W, H);
			var step = sc * 5 < 14 ? (sc * 10 < 14 ? 50 : 10) : 5;
			cx.lineWidth = 1;
			for (var gx = Math.floor(toW(0, 0)[0] / step) * step; toS([gx, 0])[0] < W; gx += step) { cx.strokeStyle = gx % (step * 2) === 0 ? 'rgba(160,180,210,.22)' : 'rgba(160,180,210,.1)'; var x = toS([gx, 0])[0]; cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
			for (var gy = Math.floor(toW(0, H)[1] / step) * step; toS([0, gy])[1] > 0; gy += step) { cx.strokeStyle = gy % (step * 2) === 0 ? 'rgba(160,180,210,.22)' : 'rgba(160,180,210,.1)'; var y = toS([0, gy])[1]; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
			var a0 = toS([0, 0]);
			cx.strokeStyle = lathe ? '#fbbf24' : 'rgba(255,255,255,.35)'; cx.setLineDash(lathe ? [8 * dpr, 6 * dpr] : []); cx.beginPath(); cx.moveTo(a0[0], 0); cx.lineTo(a0[0], H); cx.stroke(); cx.setLineDash([]);
			cx.strokeStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.moveTo(0, a0[1]); cx.lineTo(W, a0[1]); cx.stroke();
			if (lathe && pts.length > 1) { cx.strokeStyle = 'rgba(96,165,250,.35)'; cx.beginPath(); pts.forEach(function (p, i) { var s = toS([-p[0], p[1]]); if (i) cx.lineTo(s[0], s[1]); else cx.moveTo(s[0], s[1]); }); cx.closePath(); cx.stroke(); }
			if (pts.length) {
				cx.fillStyle = 'rgba(59,130,246,.25)'; cx.strokeStyle = '#60a5fa'; cx.lineWidth = 2 * dpr; cx.beginPath();
				pts.forEach(function (p, i) { var s = toS(p); if (i) cx.lineTo(s[0], s[1]); else cx.moveTo(s[0], s[1]); });
				cx.closePath(); if (pts.length > 2) cx.fill(); cx.stroke();
				pts.forEach(function (p, i) { var s = toS(p); cx.fillStyle = i === selPt ? '#f97316' : i === 0 ? '#22c55e' : '#e2e8f0'; cx.beginPath(); cx.arc(s[0], s[1], (i === selPt ? 6 : 4.5) * dpr, 0, Math.PI * 2); cx.fill(); });
			}
			cx.fillStyle = '#cbd5e1'; cx.font = (12 * dpr) + 'px system-ui,sans-serif'; cx.fillText(step + ' mm grid', 8 * dpr, H - 8 * dpr);
			var info = pts.length + ' points';
			if (pts.length > 2) { var b = L.bounds2(pts); info += lathe ? ' · ' + L.fmtNum(b.maxx * 2) + ' mm wide, ' + L.fmtNum(b.h) + ' mm tall' : ' · ' + L.fmtNum(b.w) + ' × ' + L.fmtNum(b.h) + ' mm'; }
			if (lathe && pts.length && pts.some(function (p) { return p[0] < 0; })) info += ' · points left of the middle are moved onto it';
			$('#td-skinfo').textContent = info;
			if (document.activeElement !== $('#td-skpts')) $('#td-skpts').value = pts.map(function (p) { return L.fmtNum(p[0]) + ', ' + L.fmtNum(p[1]); }).join('\n');
		}
		function mark() { hist2.push(JSON.stringify(pts)); if (hist2.length > 80) hist2.shift(); }
		function at(e) { var r = cv.getBoundingClientRect(), dpr = cv.width / r.width; return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; }
		cv.addEventListener('pointerdown', function (e) {
			var p = at(e), dpr = cv.width / cv.getBoundingClientRect().width, best = -1, bd = 12 * dpr;
			pts.forEach(function (q, i) { var s = toS(q), dd = Math.hypot(s[0] - p[0], s[1] - p[1]); if (dd < bd) { bd = dd; best = i; } });
			mark();
			if (best >= 0) { selPt = drag = best; }
			else {
				var w = snapP(toW(p[0], p[1])), ins = pts.length, ed = 10 * dpr;
				for (var i = 0; i < pts.length && pts.length > 1; i++) { var a = toS(pts[i]), b = toS(pts[(i + 1) % pts.length]), dist = segDist(p, a, b); if (dist < ed) { ed = dist; ins = i + 1; } }
				pts.splice(ins, 0, w); selPt = drag = ins;
			}
			cv.setPointerCapture(e.pointerId); draw();
		});
		cv.addEventListener('pointermove', function (e) { if (drag < 0) return; var p = at(e); pts[drag] = snapP(toW(p[0], p[1])); draw(); });
		cv.addEventListener('pointerup', function () { drag = -1; });
		function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
		function delPt() { if (selPt >= 0 && selPt < pts.length) { mark(); pts.splice(selPt, 1); selPt = -1; draw(); } }
		$('#td-skdel').onclick = delPt;
		$('#td-skundo').onclick = function () { if (hist2.length) { pts = JSON.parse(hist2.pop()); selPt = -1; draw(); } };
		$('#td-skclear').onclick = function () { mark(); pts = []; selPt = -1; draw(); };
		$('#td-skpre').onchange = function () { var v = PRESETS[lathe ? 'lathe' : 'extrude'][this.value]; if (v) { mark(); pts = clone(v).map(function (p) { return [+p[0].toFixed(2), +p[1].toFixed(2)]; }); selPt = -1; fitView(); draw(); } };
		$('#td-skpts').addEventListener('change', function () {
			var n = this.value.split(/\n+/).map(function (l) { var m = l.split(/[,;\s]+/).filter(Boolean).map(Number); return m.length >= 2 && isFinite(m[0]) && isFinite(m[1]) ? [m[0], m[1]] : null; }).filter(Boolean);
			mark(); pts = lathe ? L.cleanProfile(n) : n; fitView(); draw();
		});
		d.addEventListener('keydown', function (e) { if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === cv) { e.preventDefault(); delPt(); } });
		cv.tabIndex = 0;
		$('#td-skok').onclick = function () {
			if (pts.length < 3) { toast('Draw at least 3 points.'); return; }
			if (lathe) { o.p.pts = L.cleanProfile(pts); }
			else { o.p.shapes = [{ o: L.ccw(pts) }]; var dv = L.parseLength($('#td-skdepth').value); if (dv > 0) o.p.depth = dv; delete o.p.svg; }
			closeDlg();
			if (isNew) placeNew([o]); else commit('Edit shape');
		};
		requestAnimationFrame(function () { fitView(); draw(); });
		setTimeout(function () { fitView(); draw(); }, 50);
	}

	// ---------- files: import / open / save / export ----------
	function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
	// a ready triangle soup (mm, Z up) -> a new mesh part, centred, on the plate
	function addMesh(soup, name, color) {
		var pos = new Float32Array(soup), bb = L.bboxOf(pos), c = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
		for (var j = 0; j < pos.length; j += 3) { pos[j] -= c[0]; pos[j + 1] -= c[1]; pos[j + 2] -= c[2]; }
		var ref = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); MESH[ref] = pos;
		var ext = { name: name, hole: false }; if (color) ext.color = color;
		var o = newObj('mesh', { ref: ref, tris: pos.length / 9 }, ext); placeNew([o]); frame([o]); return o;
	}
	function baseName(n) { return L.safeName(String(n || '').replace(/\.[^.]+$/, ''), 'model'); }
	function projectJSON() {
		var meshesB64 = {}, refs = usedRefs(); for (var r in refs) if (refs[r]) meshesB64[r] = L.f32ToB64(refs[r]);
		return JSON.stringify({ app: 'mes-3d-studio', v: 1, name: S.name, saved: new Date().toISOString(), plate: ST.plate, objs: S.objs, meshes: meshesB64 });
	}
	function saveProject() {
		if (cloud && cloud.save(proj)) return;
		download(new Blob([projectJSON()], { type: 'application/json' }), L.safeName(S.name, 'model') + '.mes3d');
		toast('Saved ' + L.safeName(S.name, 'model') + '.mes3d to your downloads.');
	}
	// ---------- ☁ Cloud: keep the project (.mes3d) saved to a synced folder, Dropbox, OneDrive or Google Drive (main_js/cloud-files.js).
	// proj = the cloud's handle for "the project that is open": a new object whenever a project is opened or started, so a link never
	// follows into another project. Attached once the last session is restored, so a return from signing in opens its kept project over it.
	var proj = {}, cloud = null;
	function cloudTick() { proj.rev = (proj.rev || 0) + 1; if (cloud && cloud.linked(proj)) cloud.changed(proj); }
	function cloudInit() {
		if (cloud || !window.MESCloud) return;
		cloud = window.MESCloud.attach({
			app: '3d-studio', folder: 'MES Apps/3D Studio', what: 'project', title: '3D Studio', defExt: 'mes3d', btnClass: 'td-b', before: $('[data-act=export]'), toast: function (m) { toast(m); },
			exts: ['.mes3d'],
			accept: [{ description: '3D Studio project', accept: { 'application/json': ['.mes3d'] } }],
			doc: function () { return proj; },
			name: function () { return L.safeName(S.name, 'model') + '.mes3d'; },
			writeName: function (n) { return /\.mes3d$/i.test(n || '') ? n : String(n || 'model').replace(/\.[A-Za-z0-9]{1,8}$/, '') + '.mes3d'; },
			bytes: function (d) { if (d !== proj) return Promise.reject(new Error('That project was closed.')); d.tried = d.rev || 0; return Promise.resolve(new TextEncoder().encode(projectJSON())); },
			open: function (u8, fname) {
				var d = JSON.parse(new TextDecoder().decode(u8));
				if (!L.validProject(d)) throw new Error('That file is not a 3D Studio project (or it is damaged).');
				MESH = {}; for (var r in d.meshes || {}) MESH[r] = L.b64ToF32(d.meshes[r]);
				S.objs = d.objs; S.name = d.name || baseName(fname); S.sel = []; geoCache.clear();
				walk(S.objs, function (o) { o.id = o.id || uid(); o.p = o.p || {}; if (o.type === 'text') needFont(o.p.font || 'helvetiker_bold'); });
				commit('Open'); frame(); proj = { rev: 0, saved: 0 }; return proj;
			},
			dirty: function (d) { return (d.rev || 0) !== (d.saved || 0); },
			markDirty: function (d) { d.rev = (d.rev || 0) + 1; },
			saved: function (d) { d.saved = d.tried != null ? d.tried : d.rev || 0; },
			replaces: true
		});
	}
	function openFiles(files) {
		Array.prototype.slice.call(files || []).forEach(function (f) {
			var ext = (/\.([a-z0-9]+)$/i.exec(f.name) || [])[1]; ext = ext ? ext.toLowerCase() : '';
			if (ext === 'mes3d' || ext === 'json') return f.text().then(function (t) { openProject(t, f.name); });
			if (ext === 'svg') return f.text().then(function (t) { importSvg(t, f.name); });
			if (['stl', 'obj', 'glb', 'gltf', '3mf'].indexOf(ext) >= 0) return importModel(f, ext);
			if (photo3d.isImage(f)) return photo3d.open(f);
			toast('Cannot open ' + f.name + '. Use .mes3d, STL, OBJ, GLB, 3MF, SVG, or a picture for Photo to 3D.');
		});
	}
	function openProject(text, fname) {
		var d; try { d = JSON.parse(text); } catch (e) { return toast('That file is not a 3D Studio project.'); }
		if (!L.validProject(d)) return toast('That file is not a 3D Studio project (or it is damaged).');
		var go = function () {
			MESH = {}; for (var r in d.meshes || {}) MESH[r] = L.b64ToF32(d.meshes[r]);
			S.objs = d.objs; S.name = d.name || baseName(fname); S.sel = []; geoCache.clear(); proj = {};
			walk(S.objs, function (o) { o.id = o.id || uid(); o.p = o.p || {}; });
			commit('Open'); frame(); if (cloud) cloud.refresh();
			toast('Opened ' + fname + '.');
		};
		if (S.objs.length) { var dd = dialog('<h3>Open ' + esc(fname) + '</h3><p>Replace what you have now, or add the project\'s parts to it?</p><div class="td-btns td-btns--end"><button type="button" class="td-b" data-o="add">Add to this model</button><button type="button" class="td-b td-b--pri" data-o="rep">Replace</button></div>');
			dd.addEventListener('click', function (e) { var b = e.target.closest('[data-o]'); if (!b) return; closeDlg(); if (b.dataset.o === 'rep') go(); else { for (var r in d.meshes || {}) MESH[r] = L.b64ToF32(d.meshes[r]); var objs = d.objs.map(function (o) { return reId(o); }); placeNew(objs); } });
		} else go();
	}
	function importModel(f, ext) {
		toast('Reading ' + f.name + '…');
		var loaders = { stl: 'loaders/STLLoader.js', obj: 'loaders/OBJLoader.js', glb: 'loaders/GLTFLoader.js', gltf: 'loaders/GLTFLoader.js', '3mf': 'loaders/3MFLoader.js' };
		Promise.all([addon(loaders[ext]), ext === 'obj' ? f.text() : f.arrayBuffer()]).then(function (a) {
			var m = a[0], data = a[1];
			if (ext === 'stl') return new m.STLLoader().parse(data);
			if (ext === 'obj') return new m.OBJLoader().parse(data);
			if (ext === '3mf') return new m.ThreeMFLoader().parse(data);
			return new m.GLTFLoader().parseAsync(data, '').then(function (g) { var s = g.scene; s.rotation.x = Math.PI / 2; return s; });
		}).then(function (res) {
			var geos = [];
			if (res.isBufferGeometry) geos.push(res);
			else { res.updateMatrixWorld(true); res.traverse(function (c) { if (c.isMesh && c.geometry && c.geometry.attributes.position) { var g = c.geometry.clone(); g.applyMatrix4(c.matrixWorld); if (g.index) g = g.toNonIndexed(); if (c.matrixWorld.determinant() < 0) L.flipWinding(g.attributes.position.array); var ng = new T.BufferGeometry(); ng.setAttribute('position', g.attributes.position); geos.push(ng); } }); }
			if (!geos.length) throw new Error('no triangles found');
			var merged = geos.length > 1 ? BGU.mergeGeometries(geos.map(function (g) { return g.index ? g.toNonIndexed() : g; }).map(function (g) { var n = new T.BufferGeometry(); n.setAttribute('position', g.attributes.position); return n; })) : (geos[0].index ? geos[0].toNonIndexed() : geos[0]);
			var pos = new Float32Array(merged.attributes.position.array), bb = L.bboxOf(pos), note = '';
			var big = Math.max.apply(null, bb.size);
			if ((ext === 'glb' || ext === 'gltf') && big < 3) { for (var i = 0; i < pos.length; i++) pos[i] *= 1000; note = ' It was in metres, so it was scaled to millimetres.'; bb = L.bboxOf(pos); }
			var c = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
			for (var j = 0; j < pos.length; j += 3) { pos[j] -= c[0]; pos[j + 1] -= c[1]; pos[j + 2] -= c[2]; }
			if (L.volumeArea(pos).volume < 0) L.flipWinding(pos);
			var ref = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
			MESH[ref] = pos;
			var o = newObj('mesh', { ref: ref, tris: pos.length / 9 }, { name: baseName(f.name), hole: false });
			placeNew([o]); frame([o]);
			var P = plate(), sz = L.bboxOf(pos).size;
			toast('Imported ' + f.name + ' (' + (pos.length / 9).toLocaleString() + ' triangles, ' + L.fmtNum(sz[0], 1) + ' × ' + L.fmtNum(sz[1], 1) + ' × ' + L.fmtNum(sz[2], 1) + ' mm).' + note + (sz[0] > P.x || sz[1] > P.y || sz[2] > P.z ? ' It is bigger than your plate: type a smaller size.' : ''));
		}).catch(function (e) { console.warn(e); toast('Could not read ' + f.name + ': ' + e.message); });
	}
	function importSvg(text, name) {
		addon('loaders/SVGLoader.js').then(function (m) {
			var data = new m.SVGLoader().parse(text), shapes = [];
			data.paths.forEach(function (path) {
				var fill = path.userData && path.userData.style && path.userData.style.fill;
				if (fill === 'none' && path.subPaths.length) { /* outlines only: still use them as filled shapes */ }
				m.SVGLoader.createShapes(path).forEach(function (s) { var e = s.extractPoints(12); if (e.shape.length >= 3) shapes.push({ o: e.shape.map(function (p) { return [p.x, -p.y]; }), h: e.holes.map(function (h) { return h.map(function (p) { return [p.x, -p.y]; }); }) }); });
			});
			if (!shapes.length) throw new Error('no filled shapes found');
			var all = []; shapes.forEach(function (s) { all = all.concat(s.o); });
			var b = L.bounds2(all), k = 60 / Math.max(b.w, b.h), cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
			var fix = function (pts) { return pts.map(function (p) { return [+((p[0] - cx) * k).toFixed(3), +((p[1] - cy) * k).toFixed(3)]; }); };
			shapes = shapes.map(function (s) { return { o: fix(s.o), h: s.h.map(fix) }; });
			var o = newObj('extrude', { depth: 3, shapes: shapes, svg: true }, { name: baseName(name) });
			placeNew([o]); frame([o]);
			toast('Raised ' + name + ' into 3D, 60 mm wide. Type another size in the Shape panel.');
		}).catch(function (e) { toast('Could not use that SVG: ' + e.message); });
	}
	function exportDlg() {
		var ex = exportParts(false);
		if (!ex.parts.length) return toast('There is nothing to export yet.');
		var r = lastCheck, warn = '';
		check(true); r = lastCheck;
		if (r && r.tris) {
			if (!r.fit.fits) warn += '<li>It does not fit your ' + esc(plate().name) + ' plate as placed.</li>';
			if (!r.mc.closed && !(r.mc.gapLength < 1 && r.mc.nonManifold <= 4 && !r.mc.flipped)) warn += '<li>It is not watertight; most slicers can repair that.</li>';
			if (r.fit.floating) warn += '<li>It floats above the plate: press Drop first.</li>';
			if (r.loose) warn += '<li>' + r.loose + ' loose hole(s) are left out (group them with a solid to cut).</li>';
		}
		var nSel = topSel().length;
		var d = dialog('<h3>Export</h3><label class="td-f td-f--w"><span>File name</span><input class="td-in" id="td-ename" value="' + esc(L.safeName(S.name, 'model')) + '"></label>'
			+ '<div class="td-fmt" role="radiogroup">' + [['stl', 'STL', 'Works with every slicer (one file, millimetres)'], ['3mf', '3MF', 'Keeps colours and separate parts (PrusaSlicer, Bambu Studio, Orca, Cura)'], ['obj', 'OBJ', 'For other 3D programs'], ['glb', 'GLB', 'For web viewers, games, AR (metres, Y up)']].map(function (f, i) { return '<label class="td-fo"><input type="radio" name="td-ef" value="' + f[0] + '"' + ((ST.efmt || 'stl') === f[0] ? ' checked' : '') + '><b>' + f[1] + '</b><small>' + f[2] + '</small></label>'; }).join('') + '</div>'
			+ (nSel ? '<label class="td-chk"><input type="checkbox" id="td-esel"> Only the ' + nSel + ' selected part' + (nSel > 1 ? 's' : '') + '</label>' : '')
			+ (warn ? '<ul class="td-warn">' + warn + '</ul>' : '<p class="td-ok">✓ Ready to print: fits the plate and is watertight.</p>')
			+ '<div class="td-btns td-btns--end"><button type="button" class="td-b" data-close>Cancel</button><button type="button" class="td-b td-b--pri" id="td-ego">⬇ Download</button></div>');
		$('#td-ego').onclick = function () {
			var fmt = (d.querySelector('[name=td-ef]:checked') || {}).value || 'stl', name = L.safeName($('#td-ename').value, 'model'), only = $('#td-esel') && $('#td-esel').checked;
			ST.efmt = fmt; saveST();
			doExport(fmt, name, only).then(function () { closeDlg(); }).catch(function (e) { toast('Export failed: ' + e.message); });
		};
	}
	function doExport(fmt, name, only) {
		var ex = exportParts(only);
		if (!ex.parts.length) return Promise.reject(new Error('nothing to export'));
		if (fmt === '3mf') {
			if (!window.MESImg || !window.MESImg.zipStore) return Promise.reject(new Error('zip writer missing'));
			var enc = new TextEncoder();
			var xml = L.threeMFModel(ex.parts.map(function (p) { return { name: nameOf(p.o), positions: p.g.attributes.position.array, color: p.o.color }; }), S.name);
			var zip = window.MESImg.zipStore([{ name: '[Content_Types].xml', data: enc.encode(L.THREEMF_TYPES) }, { name: '_rels/.rels', data: enc.encode(L.THREEMF_RELS) }, { name: '3D/3dmodel.model', data: enc.encode(xml) }]);
			download(new Blob([zip], { type: 'model/3mf' }), name + '.3mf'); toast('Exported ' + name + '.3mf'); return Promise.resolve();
		}
		var mods = { stl: 'exporters/STLExporter.js', obj: 'exporters/OBJExporter.js', glb: 'exporters/GLTFExporter.js' };
		return addon(mods[fmt]).then(function (m) {
			var grp = new T.Group();
			ex.parts.forEach(function (p) { var g = p.g.clone(); g.computeVertexNormals(); var mesh = new T.Mesh(g, new T.MeshStandardMaterial({ color: new T.Color(p.o.color || '#888888'), roughness: 0.6 })); mesh.name = nameOf(p.o); grp.add(mesh); });
			if (fmt === 'stl') {
				var merged = BGU.mergeGeometries(ex.parts.map(function (p) { var g = new T.BufferGeometry(); g.setAttribute('position', p.g.attributes.position); return g; }));
				var dv = new m.STLExporter().parse(new T.Mesh(merged), { binary: true });
				download(new Blob([dv], { type: 'model/stl' }), name + '.stl');
			} else if (fmt === 'obj') {
				download(new Blob([new m.OBJExporter().parse(grp)], { type: 'text/plain' }), name + '.obj');
			} else {
				grp.rotation.x = -Math.PI / 2; grp.scale.setScalar(0.001); grp.updateMatrixWorld(true);
				return new m.GLTFExporter().parseAsync(grp, { binary: true }).then(function (buf) { download(new Blob([buf], { type: 'model/gltf-binary' }), name + '.glb'); toast('Exported ' + name + '.glb'); });
			}
			toast('Exported ' + name + '.' + fmt);
		});
	}
	function screenshot() {
		var hide = [tc.getHelper(), selBox]; var vis = hide.map(function (h) { return h.visible; }); hide.forEach(function (h) { h.visible = false; });
		renderer.render(scene, camera);
		renderer.domElement.toBlob(function (b) { if (b) download(b, L.safeName(S.name, 'model') + '.png'); }, 'image/png');
		hide.forEach(function (h, i) { h.visible = vis[i]; }); dirty = true;
	}
	function newProject() {
		var go = function () { S.objs = []; S.sel = []; S.name = 'My model'; MESH = {}; geoCache.clear(); proj = {}; commit('New'); setView('iso'); if (cloud) cloud.refresh(); };
		if (!S.objs.length) return go();
		var d = dialog('<h3>Start a new project?</h3><p>The current model will be cleared (you can still press Undo).</p><div class="td-btns td-btns--end"><button type="button" class="td-b" data-close>Cancel</button><button type="button" class="td-b td-b--pri" id="td-newok">Start new</button></div>');
		$('#td-newok').onclick = function () { closeDlg(); go(); };
	}

	// ---------- window modes ----------
	function setFill(on) {
		root.classList.toggle('td-fill', on); document.documentElement.classList.toggle('td-noscroll', on);
		$('#td-fillbtn').setAttribute('aria-pressed', on ? 'true' : 'false');
		paintShort(); setTimeout(resize, 30);
	}
	// Fill window / Full screen on a short, wide screen (a phone held sideways): .td-short makes the 3D view fill the window,
	// the toolbar becomes one row of small icon buttons floating on it, the side panels float narrow on the left / right,
	// and "Hide controls" (key C, remembered) leaves only one small button
	var SHORT = window.matchMedia ? window.matchMedia('(max-height:560px) and (min-aspect-ratio:4/3)') : null, NOCTL = 'mes-3d-studio:noctl';
	function noCtl() { try { return localStorage.getItem(NOCTL) === '1'; } catch (e) { return false; } }
	$$('#td-bar .td-b').forEach(function (b) {   // icon + label spans, so short mode can show the icon alone (the full name stays in aria-label / title)
		var m = /^(\S+)\s+(.+)$/.exec(b.textContent.trim()); if (!m || b.querySelector('.td-bl')) return;
		b.textContent = ''; var i = document.createElement('span'); i.className = 'td-bi'; i.textContent = m[1];
		var l = document.createElement('span'); l.className = 'td-bl'; l.textContent = ' ' + m[2]; b.appendChild(i); b.appendChild(l);
		if (!b.hasAttribute('aria-label')) b.setAttribute('aria-label', m[2]);
	});
	var ctlBtn = document.createElement('button'); ctlBtn.type = 'button'; ctlBtn.className = 'td-ctlbtn'; ctlBtn.id = 'td-ctlbtn'; root.appendChild(ctlBtn);
	function isShort() { return (root.classList.contains('td-fill') || document.fullscreenElement === root) && !!SHORT && SHORT.matches; }
	function paintShort() {
		var sh = isShort(), off = noCtl();
		root.classList.toggle('td-short', sh); root.classList.toggle('td-noctl', sh && off);
		ctlBtn.setAttribute('aria-pressed', off ? 'true' : 'false');
		ctlBtn.innerHTML = off ? '☰ <span>Controls</span>' : '✕ <span>Hide controls</span>';
		ctlBtn.title = off ? 'Show the tools and panels again (C)' : 'Hide the tools and panels so the 3D view fills the screen (C)';
	}
	function toggleCtl() { try { localStorage.setItem(NOCTL, noCtl() ? '0' : '1'); } catch (e) {} paintShort(); setTimeout(resize, 30); }
	ctlBtn.addEventListener('click', toggleCtl);
	if (SHORT && SHORT.addEventListener) SHORT.addEventListener('change', function () { paintShort(); setTimeout(resize, 30); });
	paintShort();
	function fullScreen() {
		if (document.fullscreenElement) { document.exitFullscreen(); return; }
		var p = root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen ? root.webkitRequestFullscreen() : null;
		if (p && p.catch) p.catch(function () { setFill(true); });
	}
	document.addEventListener('fullscreenchange', function () { root.classList.toggle('td-fs', document.fullscreenElement === root); paintShort(); setTimeout(resize, 50); });

	// ---------- actions + keys ----------
	var ACTS = {
		photo3d: function () { photo3d.open(); }, templates: templatesDlg, open: function () { $('#td-file').click(); }, save: saveProject, export: exportDlg, 'new': newProject, undo: undo, redo: redo,
		hole: toggleHole, group: function () { group('union'); }, subtract: function () { group('union', true); }, intersect: function () { group('intersect'); }, ungroup: ungroup,
		dup: dup, mirror: mirrorDlg, align: alignDlg, drop: function () { drop(); }, 'delete': del, center: centerOnPlate, shot: screenshot,
		fill: function () { setFill(!root.classList.contains('td-fill')); }, full: fullScreen, help: helpDlg, svg: function () { $('#td-file').accept = '.svg'; $('#td-file').click(); },
		sketch: function () { var s = topSel(); if (s.length === 1) sketch(s[0], false); }, check: function () { check(true); }
	};
	root.addEventListener('click', function (e) {
		var b = e.target.closest('[data-act],[data-add],[data-mode],[data-view],.td-tab');
		if (!b || b.closest('#td-dlg') && !b.dataset.act) return;
		if (!ready && !b.classList.contains('td-tab') && b.dataset.act !== 'help' && b.dataset.act !== 'fill' && b.dataset.act !== 'full') return toast('The 3D engine is still loading…');
		if (b.dataset.add) addPrim(b.dataset.add);
		else if (b.dataset.mode) setMode(b.dataset.mode);
		else if (b.dataset.view) setView(b.dataset.view);
		else if (b.classList.contains('td-tab')) setTab(b.dataset.tab);
		else if (ACTS[b.dataset.act]) { if (b.closest('#td-dlg') && ['group', 'subtract', 'intersect', 'hole', 'dup', 'drop', 'delete'].indexOf(b.dataset.act) >= 0) closeDlg(); ACTS[b.dataset.act](); }
	});
	$('#td-file').addEventListener('change', function () { openFiles(this.files); this.value = ''; this.accept = '.mes3d,.json,.stl,.obj,.glb,.gltf,.3mf,.svg'; });
	$('#td-snap').checked = ST.snap; $('#td-grid').value = String(ST.grid); $('#td-addhole').checked = ST.addHole;
	$('#td-snap').addEventListener('change', function () { ST.snap = this.checked; saveST(); if (ready) applySnap(); });
	$('#td-grid').addEventListener('change', function () { ST.grid = +this.value; saveST(); if (ready) { applySnap(); buildPlate(); } });
	$('#td-addhole').addEventListener('change', function () { ST.addHole = this.checked; saveST(); });
	$('#td-osearch').addEventListener('input', outliner);
	$('#td-outl').addEventListener('click', function (e) {
		var tw = e.target.closest('[data-tw]'); if (tw) { openGroups[tw.dataset.tw] = !openGroups[tw.dataset.tw]; outliner(); return; }
		var eye = e.target.closest('[data-eye]'); if (eye) { var o = byId(eye.dataset.eye); o.hidden = !o.hidden; commit(o.hidden ? 'Hide' : 'Show'); return; }
		var lk = e.target.closest('[data-lock]'); if (lk) { var o2 = byId(lk.dataset.lock); o2.locked = !o2.locked; commit(o2.locked ? 'Lock' : 'Unlock'); return; }
		var row = e.target.closest('.td-orow'); if (!row) return;
		var id = row.dataset.id; if (row.dataset.depth !== '0') { var top = S.objs.find(function (t) { var f = false; walk([t], function (x) { if (x.id === id) f = true; }); return f; }); id = top && top.id; }
		if (id) { select([id], e.shiftKey || e.ctrlKey || e.metaKey); setTab('obj'); }
	});
	$('#td-outl').addEventListener('dblclick', function (e) {
		var row = e.target.closest('.td-orow'); if (!row || row.dataset.depth !== '0') return;
		var o = byId(row.dataset.id), nm = row.querySelector('.td-on'), inpEl = document.createElement('input');
		inpEl.className = 'td-in td-oren'; inpEl.value = o.name || nameOf(o); nm.replaceWith(inpEl); inpEl.focus(); inpEl.select();
		var done = function () { var v = inpEl.value.trim(); if (v !== (o.name || nameOf(o))) { o.name = v; commit('Rename'); } else outliner(); };
		inpEl.addEventListener('keydown', function (k) { k.stopPropagation(); if (k.key === 'Enter') done(); if (k.key === 'Escape') outliner(); });
		inpEl.addEventListener('blur', done);
	});
	// drop files anywhere on the tool
	root.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) { e.preventDefault(); root.classList.add('td-drop'); } });
	root.addEventListener('dragleave', function (e) { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('td-drop'); });
	root.addEventListener('drop', function (e) { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); root.classList.remove('td-drop'); if (ready) openFiles(e.dataTransfer.files); });

	document.addEventListener('keydown', function (e) {
		var t = e.target, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
		if (e.key === 'Escape') {
			if (dlgClose) { closeDlg(); return; }
			if (typing) return;
			if (root.classList.contains('td-fill')) { setFill(false); return; }
			if (S.sel.length) { select([]); return; }
			return;
		}
		if (dlgClose || typing || !ready) return;
		var inTool = root.contains(t) || t === document.body || root.classList.contains('td-fill') || document.fullscreenElement === root;
		if (!inTool) return;
		var rr = root.getBoundingClientRect(); if (rr.bottom < 60 || rr.top > window.innerHeight - 60) return;
		var ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), handled = true, s = selected(true), step = +ST.grid * (e.shiftKey ? 10 : 1);
		if (ctrl && k === 'z') e.shiftKey ? redo() : undo();
		else if (ctrl && k === 'y') redo();
		else if (ctrl && k === 'g') e.shiftKey ? ungroup() : group('union');
		else if (ctrl && k === 'd') dup();
		else if (ctrl && k === 'a') select(S.objs.filter(function (o) { return !o.hidden; }).map(function (o) { return o.id; }));
		else if (ctrl && k === 's') saveProject();
		else if (ctrl && k === 'o') $('#td-file').click();
		else if (ctrl && k === 'e') exportDlg();
		else if (ctrl) handled = false;
		else if (k === 'delete' || k === 'backspace') del();
		else if (k === 'g') setMode('translate');
		else if (k === 'r') setMode('rotate');
		else if (k === 's') setMode('scale');
		else if (k === 'h') toggleHole();
		else if (k === 'd') drop();
		else if (k === 'm') mirror(0);
		else if (k === 'c' && isShort()) toggleCtl();
		else if (k === 'f') e.shiftKey ? fullScreen() : setFill(!root.classList.contains('td-fill'));
		else if (k === '?' || (e.shiftKey && k === '/')) helpDlg();
		else if (k === '7') setView('top'); else if (k === '1') setView('front'); else if (k === '3') setView('side'); else if (k === '0') setView('iso'); else if (k === '.') setView('frame');
		else if (/^arrow/.test(k) && s.length) {
			var dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] }[k];
			s.forEach(function (o) { o.pos[0] = +(o.pos[0] + dir[0] * step).toFixed(4); o.pos[1] = +(o.pos[1] + dir[1] * step).toFixed(4); }); commit('Nudge');
		}
		else if ((k === 'pageup' || k === 'pagedown') && s.length) { s.forEach(function (o) { o.pos[2] = +(o.pos[2] + (k === 'pageup' ? step : -step)).toFixed(4); }); commit('Nudge'); }
		else handled = false;
		if (handled) e.preventDefault();
	});
	document.addEventListener('keydown', function (e) { if (e.key === 'Shift' && ready && tc.dragging) applySnap(true); });
	document.addEventListener('keyup', function (e) { if (e.key === 'Shift' && ready) applySnap(); });

	// ---------- start ----------
	shapesPanel(); outliner(); settingsPanel(); inspectorEvents(); printEvents(); settingsEvents(); setTab(ST.tab === 'set' ? 'obj' : ST.tab || 'obj'); undoBtns();
	$('#td-insp').innerHTML = '<p class="td-hint">Loading…</p>';
	var start = function () {
		loadEngine().then(function () {
			initScene(); ready = true; if (/[?&]photo=1/.test(location.search)) setTimeout(function () { photo3d.open(); }, 50);
			$('#td-loading').hidden = true;
			return loadAuto();
		}).then(function (a) {
			if (a && a.objs) { try { var objs = JSON.parse(a.objs); if (objs.length) { MESH = a.meshes || {}; S.objs = objs; S.name = a.name || S.name; toast('Welcome back: your last project is restored.', ['Start new', function () { S.objs = []; S.sel = []; S.name = 'My model'; commit('New'); }]); } } catch (e) {} }
			hist = [snapshot()]; hpos = 0; sync(); undoBtns(); frame(); cloudInit();
			walk(S.objs, function (o) { if (o.type === 'text') needFont(o.p.font || 'helvetiker_bold'); });
			needFont('helvetiker_bold');
		}).catch(function (e) {
			console.error(e);
			$('#td-loading').innerHTML = '<div><b>The 3D engine could not load.</b><br>' + esc(e.message || e) + '<br><small>It needs WebGL and a connection to cdn.jsdelivr.net. Try reloading, or another browser.</small></div>';
		});
	};
	if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 }); else setTimeout(start, 200);

	var photo3d = window.TDPhoto3D({ L: L, esc: esc, dialog: dialog, closeDlg: closeDlg, toast: toast, addMesh: addMesh, baseName: baseName });

	// for testing in a hidden tab (no animation frames there)
	window.MES3DStudio = { render: function () { if (ready) { sync(); render(); } }, S: S, ST: ST, add: addPrim, template: function (id) { var t = window.TD_TEMPLATES.find(function (x) { return x.id === id; }); if (t) fromTemplate(t); }, check: function () { check(true); return lastCheck; }, exportParts: exportParts, doExport: doExport, select: select, group: group, setView: setView, ready: function () { return ready; }, photo3d: photo3d, addMesh: addMesh };
})();
