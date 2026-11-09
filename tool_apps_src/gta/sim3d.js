/* MES Stunt Jump Simulator: 3D view (window.GJ3D). The physics is the same 2D side-plane simulation; this draws it in 3D:
   the course profile extruded into a road and land, timber ramps, water, buildings, palms and a sunset sky, the car body extruded from
   its side profile with spinning wheels on their suspension. three.js 0.170.0 is loaded from jsDelivr (unpkg fallback) only when 3D is chosen.
   Cameras: auto (chase on the run-up, a sweeping three-quarter view in the air), chase, side, driver, landing, orbit (drag / wheel / pinch). */
(function () {
	"use strict";
	var THREE = null, loading = null;
	var URLS = ["https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "https://unpkg.com/three@0.170.0/build/three.module.min.js"];
	function load() {
		if (THREE) return Promise.resolve(THREE); if (loading) return loading;
		var imp = new Function("u", "return import(u)");
		loading = imp(URLS[0]).catch(function () { return imp(URLS[1]); }).then(function (m) { THREE = m; return m; });
		return loading;
	}
	function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
	function canvasTex(w, h, draw) { var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

	function create(container) {
		return load().then(function () {
			var test = document.createElement("canvas"); if (!(test.getContext("webgl2") || test.getContext("webgl"))) throw new Error("WebGL is off");
			return new View(container);
		});
	}

	function View(container) {
		var self = this; this.el = container;
		var R = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.outputColorSpace = THREE.SRGBColorSpace;
		R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
		container.appendChild(R.domElement); R.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
		this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000);
		this.camPos = new THREE.Vector3(-20, 6, 12); this.camLook = new THREE.Vector3();
		/* orbit control. Orbit mode: the camera circles the car. Every other mode: a drag turns the camera
		   around what it looks at (driver's seat: looks around), on top of that camera's own movement;
		   "Auto view" (resetFree) drops the offset. */
		this.orb = { yaw: -0.7, pitch: 0.25, dist: 16 }; this.free = { yaw: 0, pitch: 0, zoom: 1, on: false }; var ptr = {}, moved = 0;
		var d = R.domElement;
		function big() { return !!d.closest(".is-fill, .is-fs") || !!document.fullscreenElement; }
		function zoomBy(k) { if (self.mode === "orbit") self.orb.dist = Math.max(5, Math.min(120, self.orb.dist * k)); else if (self.mode === "driver") { self.free.zoom = Math.max(0.55, Math.min(1.55, self.free.zoom * k)); self.setFree(); } /* driver's seat: zoom = field of view (wider shows the wheel and dash) */
			else { self.free.zoom = Math.max(0.25, Math.min(6, self.free.zoom * k)); self.setFree(); } self.redraw(); }
		d.addEventListener("pointerdown", function (e) { ptr[e.pointerId] = [e.clientX, e.clientY]; moved = 0; self.dragged = false; try { d.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
		d.addEventListener("pointermove", function (e) {
			var p = ptr[e.pointerId]; if (!p) return;
			var ids = Object.keys(ptr);
			if (ids.length === 2) { var a = ptr[ids[0]], b = ptr[ids[1]]; ptr[e.pointerId] = [e.clientX, e.clientY]; var a2 = ptr[ids[0]], b2 = ptr[ids[1]], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]), d1 = Math.hypot(a2[0] - b2[0], a2[1] - b2[1]); self.dragged = true; if (d0 > 0 && d1 > 0) zoomBy(d0 / d1); return; }
			var dx = e.clientX - p[0], dy = e.clientY - p[1]; ptr[e.pointerId] = [e.clientX, e.clientY];
			moved += Math.abs(dx) + Math.abs(dy); if (moved < 5) return; self.dragged = true;
			if (self.mode === "orbit") { self.orb.yaw -= dx * 0.008; self.orb.pitch = Math.max(-0.1, Math.min(1.45, self.orb.pitch + dy * 0.006)); }
			else if (self.mode === "driver") { self.free.yaw = Math.max(-2.6, Math.min(2.6, self.free.yaw + dx * 0.005)); self.free.pitch = Math.max(-0.9, Math.min(0.9, self.free.pitch - dy * 0.004)); self.setFree(); }
			else { self.free.yaw -= dx * 0.008; self.free.pitch = Math.max(-1.2, Math.min(1.2, self.free.pitch + dy * 0.006)); self.setFree(); }
			self.redraw();
		});
		function up(e) { delete ptr[e.pointerId]; }
		d.addEventListener("pointerup", up); d.addEventListener("pointercancel", up);
		d.addEventListener("wheel", function (e) { if (self.mode !== "orbit" && !big() && !e.ctrlKey) return; e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: false });
		d.addEventListener("dblclick", function () { self.resetFree(); });
		this.zoomBy = zoomBy;
		this.buildWorld();
	}
	View.prototype.canvas = function () { return this.renderer.domElement; };
	View.prototype.resize = function (w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.redraw(); };
	View.prototype.setFree = function () { var f = this.free, on = Math.abs(f.yaw) > 0.01 || Math.abs(f.pitch) > 0.01 || Math.abs(f.zoom - 1) > 0.01; if (on !== f.on) { f.on = on; if (this.onFree) this.onFree(on); } };
	View.prototype.resetFree = function () { var f = this.free; f.yaw = f.pitch = 0; f.zoom = 1; this.setFree(); this.redraw(); };
	View.prototype.takeDrag = function () { var t = this.dragged; this.dragged = false; return t; };
	View.prototype.redraw = function () { if (this.last) this.draw(this.last[0], this.last[1]); };

	/* sky, sun, lights, far city: built once */
	View.prototype.buildWorld = function () {
		var sc = this.scene;
		this.skyTex = canvasTex(4, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#140f38"); gr.addColorStop(0.42, "#5b2470"); gr.addColorStop(0.68, "#d65a6a"); gr.addColorStop(0.82, "#ff9f62"); gr.addColorStop(1, "#ffcf8e"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
		var skyGeo = new THREE.SphereGeometry(1800, 32, 16), skyMat = new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, depthWrite: false, fog: false });
		this.sky = new THREE.Mesh(skyGeo, skyMat); sc.add(this.sky);
		sc.fog = new THREE.Fog(0xb8566f, 160, 1300);
		var sunTex = canvasTex(256, 256, function (g, w) { var r = g.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); r.addColorStop(0, "rgba(255,248,220,1)"); r.addColorStop(0.2, "rgba(255,214,140,0.95)"); r.addColorStop(0.45, "rgba(255,150,100,0.35)"); r.addColorStop(1, "rgba(255,120,90,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); });
		this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, depthWrite: false, fog: false, transparent: true })); this.sun.scale.set(420, 420, 1); sc.add(this.sun);
		this.hemi = new THREE.HemisphereLight(0xffc7d8, 0x3a2350, 1.25); sc.add(this.hemi);
		var dl = this.light = new THREE.DirectionalLight(0xffd2a0, 2.4); dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048);
		var c = dl.shadow.camera; c.left = -45; c.right = 45; c.top = 45; c.bottom = -45; c.near = 1; c.far = 300; dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.04; sc.add(dl); sc.add(dl.target);
		/* far skyline: instanced boxes with lit windows */
		var winTex = canvasTex(64, 128, function (g, w, h) { g.fillStyle = "#2a1838"; g.fillRect(0, 0, w, h); var r = rng(5); for (var y = 6; y < h; y += 10) for (var x = 5; x < w; x += 10) { g.fillStyle = r() < 0.35 ? "rgba(255,200,120," + (0.5 + r() * 0.5) + ")" : "rgba(60,40,80,0.9)"; g.fillRect(x, y, 5, 6); } });
		winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
		var bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
		var bMat = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.9, color: 0x6d5a80 });
		var r = rng(911), n = 260, inst = new THREE.InstancedMesh(bGeo, bMat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
		for (var i = 0; i < n; i++) { var side = i % 3 === 0 ? 1 : -1, x = -900 + r() * 2200, z = side * (220 + r() * 380), w = 18 + r() * 40, h = 15 + Math.pow(r(), 2.2) * 110; p.set(x, 0, z); s.set(w, h, 18 + r() * 30); m.compose(p, q, s); inst.setMatrixAt(i, m); }
		inst.frustumCulled = false; sc.add(inst); this.skyline = inst;
		this.course = new THREE.Group(); sc.add(this.course);
		this.carG = new THREE.Group(); sc.add(this.carG);
		this.trailGeo = new THREE.BufferGeometry(); this.trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 4000), 3)); this.trailGeo.setDrawRange(0, 0);
		this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 })); this.trail.frustumCulled = false; sc.add(this.trail);
	};

	function disposeGroup(g) { while (g.children.length) { var o = g.children.pop(); o.traverse(function (k) { if (k.geometry) k.geometry.dispose(); if (k.material) { (Array.isArray(k.material) ? k.material : [k.material]).forEach(function (mt) { if (mt.map && !mt.map.__keep) mt.map.dispose(); mt.dispose(); }); } }); } }
	function shapeFrom(pts, bottom) { var s = new THREE.Shape(); s.moveTo(pts[0][0], bottom); pts.forEach(function (p) { s.lineTo(p[0], p[1]); }); s.lineTo(pts[pts.length - 1][0], bottom); s.lineTo(pts[0][0], bottom); return s; }
	function extrude(shape, depth, mat, z0) { var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, curveSegments: 1 }); g.translate(0, 0, z0 == null ? -depth / 2 : z0); var mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

	/* the course: land (ramps flattened) as a wide slab, a road strip on it, timber ramps, a building for a platform, water */
	View.prototype.setScene = function (co, veh, color, grav) {
		var M = window.MESGTA, g = this.course, self = this; disposeGroup(g); this.co = co; this.veh = veh;
		var x0 = co.rampStart - 400, x1 = (isFinite(co.zone[1]) ? co.zone[1] : co.gap) + 500, bottom = co.floor - 40;
		var inRamp = function (x) { return (x >= co.rampStart - 1e-6 && x <= 1e-6 && co.opt.ramp !== "none" && co.lip.y > 0) || (co.landKind === "ramp" && x >= co.zone[0] - 1e-6 && x <= co.zone[1] + 1e-6); };
		var inPlat = function (x) { return co.landKind === "platform" && x >= co.zone[0] - 1e-6 && x <= co.zone[1] + 1e-6; };
		var raw = co.pts.filter(function (p) { return p[0] >= x0 && p[0] <= x1; }); raw.unshift([x0, M.groundAt(co, x0).y]); raw.push([x1, M.groundAt(co, x1).y]);
		/* road profile: ramp spans flattened to the ground under them (0), keeping the vertical faces where the ground itself steps */
		function flatten(pts, alsoPlat) {
			var out = [];
			pts.forEach(function (p) {
				var y = p[1]; if (inRamp(p[0])) y = Math.min(p[1], 0) < co.floor + 1e-6 && p[1] <= co.floor + 1e-6 ? p[1] : 0;
				if (alsoPlat && inPlat(p[0])) y = co.floor;
				var last = out[out.length - 1]; if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - y) > 1e-6) out.push([p[0], y]);
			});
			return out;
		}
		var road = flatten(raw, false), land = flatten(raw, true);
		var earth = grav && grav[0] < 2 ? 0x8d909a : grav && grav[0] < 5 ? 0xa45b38 : 0x4a3d58;
		var landMat = new THREE.MeshStandardMaterial({ color: earth, roughness: 1 });
		var landMesh = extrude(shapeFrom(land, bottom), 400, landMat); landMesh.position.y = -0.04; landMesh.castShadow = false; g.add(landMesh);
		/* road with a dashed centre line: side-wall UVs of an extrusion are (x, z), so the texture repeats every 12 m along x */
		var roadTex = canvasTex(256, 64, function (c, w, h) { c.fillStyle = "#2a2a31"; c.fillRect(0, 0, w, h); var r = rng(3); for (var i = 0; i < 900; i++) { c.fillStyle = "rgba(255,255,255," + r() * 0.06 + ")"; c.fillRect(r() * w, r() * h, 2, 2); } c.fillStyle = "#ffd36b"; c.fillRect(0, h / 2 - 1.5, w * 0.5, 3); c.fillStyle = "#d9d9de"; c.fillRect(0, 3, w, 2.5); c.fillRect(0, h - 5.5, w, 2.5); });
		roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(1 / 12, 1 / 9); roadTex.anisotropy = 8;
		var roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }), wallMat = new THREE.MeshStandardMaterial({ color: 0x3c3448, roughness: 1 });
		var roadMesh = extrude(shapeFrom(road, bottom + 5), 9, [wallMat, roadMat], -4.5); roadMesh.castShadow = false; g.add(roadMesh);
		/* timber ramps */
		var woodTex = canvasTex(256, 128, function (c, w, h) { c.fillStyle = "#b9773a"; c.fillRect(0, 0, w, h); for (var x = 0; x < w; x += 16) { c.fillStyle = "rgba(70,35,10,0.55)"; c.fillRect(x, 0, 2, h); } var r = rng(9); for (var i = 0; i < 300; i++) { c.fillStyle = "rgba(90,50,20," + r() * 0.25 + ")"; c.fillRect(r() * w, r() * h, 10 + r() * 30, 1); } });
		woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(1 / 3, 1 / 3);
		var woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 }), sideMat = new THREE.MeshStandardMaterial({ color: 0x7a4a1d, roughness: 0.9 });
		function rampMesh(xa, xb) {
			var pts = co.pts.filter(function (p) { return p[0] >= xa - 1e-6 && p[0] <= xb + 1e-6 && p[1] >= -1e-6; }); if (pts.length < 2) return;
			g.add(extrude(shapeFrom(pts, 0), 8.4, [sideMat, woodMat]));
			/* steel legs under the high end */
			var legMat = new THREE.MeshStandardMaterial({ color: 0x55505e, metalness: 0.6, roughness: 0.4 });
			pts.forEach(function (p, i) { if (i % 3 || p[1] < 0.8) return; [-4.3, 4.3].forEach(function (z) { var l = new THREE.Mesh(new THREE.BoxGeometry(0.15, p[1], 0.15), legMat); l.position.set(p[0], p[1] / 2, z); l.castShadow = true; g.add(l); }); });
		}
		if (co.opt.ramp !== "none" && co.lip.y > 0) rampMesh(co.rampStart, 0);
		if (co.landKind === "ramp") rampMesh(co.zone[0], co.zone[1]);
		/* platform = a building (lit windows), roof at the landing height */
		if (co.landKind === "platform") {
			var top = M.groundAt(co, co.zone[0] + 0.01).y, hgt = top - co.floor, wB = co.zone[1] - co.zone[0];
			var bt = canvasTex(128, 256, function (c, w, h) { c.fillStyle = "#3b2f4c"; c.fillRect(0, 0, w, h); var r = rng(11); for (var y = 8; y < h; y += 16) for (var x = 6; x < w; x += 14) { c.fillStyle = r() < 0.4 ? "#ffd59a" : "#1f1830"; c.fillRect(x, y, 8, 10); } });
			bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(wB / 12, hgt / 24);
			var bm = new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.9 });
			var b = new THREE.Mesh(new THREE.BoxGeometry(wB, hgt, 22), bm); b.position.set((co.zone[0] + co.zone[1]) / 2, co.floor + hgt / 2 - 0.06, 0); b.receiveShadow = true; g.add(b);
		}
		/* the takeoff roof when there is no ramp and the street is below: a building under the road edge */
		if (co.opt.ramp === "none" && co.floor < -2) {
			var bt2 = canvasTex(128, 256, function (c, w, h) { c.fillStyle = "#33283f"; c.fillRect(0, 0, w, h); var r = rng(12); for (var y = 8; y < h; y += 16) for (var x = 6; x < w; x += 14) { c.fillStyle = r() < 0.4 ? "#ffcf8a" : "#1d1729"; c.fillRect(x, y, 8, 10); } });
			bt2.wrapS = bt2.wrapT = THREE.RepeatWrapping; bt2.repeat.set(3, -co.floor / 24);
			var b2 = new THREE.Mesh(new THREE.BoxGeometry(40, -co.floor, 22), new THREE.MeshStandardMaterial({ map: bt2, emissiveMap: bt2, emissive: 0xffffff, emissiveIntensity: 0.25 })); b2.position.set(-20.05, co.floor / 2 - 0.05, 0); g.add(b2);
		}
		/* water */
		if (co.water) {
			var wm = new THREE.MeshStandardMaterial({ color: 0x1b8fb8, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 });
			var wp = new THREE.Mesh(new THREE.PlaneGeometry(co.water.x1 - co.water.x0, 400), wm); wp.rotation.x = -Math.PI / 2; wp.position.set((co.water.x0 + co.water.x1) / 2, co.water.y, 0); wp.receiveShadow = true; g.add(wp); this.water = wp;
		} else this.water = null;
		/* landing zone: green strips along both road edges */
		if (co.hasGap) {
			var z0 = co.zone[0], z1 = isFinite(co.zone[1]) ? co.zone[1] : co.zone[0] + 60, gm = new THREE.MeshBasicMaterial({ color: 0x3ee08a });
			[-4.25, 4.25].forEach(function (z) {
				var pos = [], N = Math.max(2, Math.round((z1 - z0) / 0.5));
				for (var i = 0; i <= N; i++) { var x = z0 + (z1 - z0) * i / N, y = M.groundAt(co, x).y + 0.06; pos.push(x, y, z - 0.18, x, y, z + 0.18); }
				var geo = new THREE.BufferGeometry(), idx = []; for (i = 0; i < N; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
				geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); g.add(new THREE.Mesh(geo, gm));
			});
		}
		/* distance boards every 10 m past the lip */
		for (var dm = 10; dm <= Math.min(200, (isFinite(co.zone[1]) ? co.zone[1] : co.gap + 60) + 20); dm += 10) {
			var gy = M.groundAt(co, dm).y; if (gy < -100) continue;
			var tx = canvasTex(128, 64, function (c, w, h) { c.fillStyle = "rgba(20,12,40,0.85)"; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "bold 34px system-ui,sans-serif"; c.textAlign = "center"; c.fillText(dm + " m", w / 2, 44); });
			var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx })); sp.scale.set(1.8, 0.9, 1); sp.position.set(dm, Math.max(gy, 0) + 1.7, -9); g.add(sp);
			var post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), new THREE.MeshStandardMaterial({ color: 0xdddddd })); post.position.set(dm, Math.max(gy, 0) + 0.6, -9); g.add(post);
		}
		/* palms beside the road (not in the gap) */
		var r = rng(7), trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3d2a, roughness: 1 }), leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d4f, roughness: 0.8, side: THREE.DoubleSide });
		var leafGeo = new THREE.PlaneGeometry(3.6, 0.9); leafGeo.translate(1.8, 0, 0);
		for (var px = x0 + 20; px < x1 - 20; px += 14 + r() * 22) {
			if (px > co.rampStart - 3 && px < (isFinite(co.zone[1]) ? co.zone[1] : co.gap) + 3) continue;
			var pz = (r() < 0.5 ? -1 : 1) * (8 + r() * 10), ph = 7 + r() * 6, gyy = M.groundAt(co, px).y; if (gyy < -100) continue;
			var palm = new THREE.Group(), trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, ph, 7), trunkMat); trunk.position.y = ph / 2; trunk.castShadow = true; palm.add(trunk);
			for (var k = 0; k < 8; k++) { var lf = new THREE.Mesh(leafGeo, leafMat); lf.position.y = ph; lf.rotation.y = k / 8 * Math.PI * 2 + r(); lf.rotation.z = -0.35 - r() * 0.3; lf.castShadow = true; palm.add(lf); }
			palm.position.set(px, gyy, pz); palm.rotation.z = (r() - 0.5) * 0.15; g.add(palm);
		}
		/* sky per planet */
		this.sky.visible = !(grav && grav[0] < 2); this.scene.background = grav && grav[0] < 2 ? new THREE.Color(0x05060c) : null; this.scene.fog.color.set(grav && grav[0] < 2 ? 0x05060c : grav && grav[0] < 5 ? 0xc07a50 : 0xb8566f);
		this.sun.visible = !(grav && grav[0] < 2); this.skyline.visible = !(grav && grav[0] < 5);
		this.buildCar(veh, color);
		this.redraw();
	};

	/* the vehicle: body extruded from the side profile, glass, lights, wheels with rims */
	View.prototype.buildCar = function (veh, color) {
		var g = this.carG; disposeGroup(g); var M = window.MESGTA, sh = M.bodyShape(veh), bike = !!veh.bike, w = bike ? 0.5 : veh.body === "monster" ? 2.6 : veh.body === "suv" || veh.body === "pickup" ? 1.95 : 1.82;
		var paint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 });
		var body = new THREE.Group(); g.add(body); this.body = body;
		if (!bike) {
			var s = new THREE.Shape(); sh.pts.forEach(function (p, i) { if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); });
			var bg = new THREE.ExtrudeGeometry(s, { depth: w - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 1 }); bg.translate(0, 0, -(w - 0.12) / 2);
			var bm = new THREE.Mesh(bg, paint); bm.castShadow = true; bm.receiveShadow = true; body.add(bm);
			var win = M.windowPoly ? M.windowPoly(veh, sh) : null;
			if (win) { var ws = new THREE.Shape(); win.forEach(function (p, i) { if (i) ws.lineTo(p[0], p[1]); else ws.moveTo(p[0], p[1]); }); var wg = new THREE.ExtrudeGeometry(ws, { depth: w + 0.02, bevelEnabled: false }); wg.translate(0, 0, -(w + 0.02) / 2); body.add(new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({ color: 0x141a2e, metalness: 0.2, roughness: 0.05, transmission: 0, clearcoat: 1 }))); }
			var front = sh.pts.reduce(function (b, p) { return p[0] > b[0] ? p : b; }), rear = sh.pts.reduce(function (b, p) { return p[0] < b[0] ? p : b; });
			var hlM = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff2c0, emissiveIntensity: 2 }), tlM = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 1.6 });
			[-1, 1].forEach(function (sd) {
				var hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.32), hlM); hl.position.set(front[0] - 0.02, front[1] + 0.12, sd * (w / 2 - 0.3)); body.add(hl);
				var tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.36), tlM); tl.position.set(rear[0] + 0.02, rear[1] + 0.16, sd * (w / 2 - 0.28)); body.add(tl);
			});
		} else {
			/* bike: tank / seat block, forks, rider */
			var low = -veh.hcg + veh.r * 1.1, seat = low + 0.35, rearX = -veh.wb * veh.fr, frontX = veh.wb * (1 - veh.fr);
			var bs = new THREE.Shape(); [[rearX + 0.25, seat], [frontX - 0.35, seat + 0.18], [frontX - 0.05, seat - 0.05], [frontX - 0.4, low], [rearX + 0.4, low - 0.02]].forEach(function (p, i) { if (i) bs.lineTo(p[0], p[1]); else bs.moveTo(p[0], p[1]); });
			var bkg = new THREE.ExtrudeGeometry(bs, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }); bkg.translate(0, 0, -0.18); var bk = new THREE.Mesh(bkg, paint); bk.castShadow = true; body.add(bk);
			var suit = new THREE.MeshStandardMaterial({ color: 0x1d1f2e, roughness: 0.7 });
			function limb(a, b, r0) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), m = new THREE.Mesh(new THREE.CapsuleGeometry(r0, L, 4, 8), suit); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0); m.rotation.z = Math.atan2(dy, dx) - Math.PI / 2; m.castShadow = true; body.add(m); }
			var hip = [rearX + 0.5, seat + 0.12], knee = [frontX - 0.62, seat - 0.05], foot = [rearX + 0.62, low + 0.02], sho = [frontX - 0.62, seat + 0.62], hand = [frontX - 0.28, seat + 0.32];
			limb(foot, knee, 0.07); limb(knee, hip, 0.08); limb(hip, sho, 0.14); limb(sho, hand, 0.06);
			var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), paint); helmet.position.set(frontX - 0.52, seat + 0.86, 0); helmet.castShadow = true; body.add(helmet);
			var forkM = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.8, roughness: 0.3 }); this.fork = forkM;
		}
		/* wheels (positions set every frame) */
		var tyre = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.9 }), rim = new THREE.MeshStandardMaterial({ color: 0xb8c0ca, metalness: 0.85, roughness: 0.25 }), spokeM = new THREE.MeshStandardMaterial({ color: 0x4b525a, metalness: 0.6 });
		var tw = bike ? 0.16 : veh.body === "monster" ? 0.7 : 0.26, zs = bike ? [0] : [-(w / 2 - tw / 2 + 0.04), (w / 2 - tw / 2 + 0.04)];
		this.wheels = [];
		for (var ax = 0; ax < 2; ax++) {
			var axle = new THREE.Group(); g.add(axle);
			zs.forEach(function (z) {
				var wg = new THREE.Group(); wg.position.z = z;
				var t = new THREE.Mesh(new THREE.CylinderGeometry(veh.r, veh.r, tw, 28), tyre); t.rotation.x = Math.PI / 2; t.castShadow = true; wg.add(t);
				var rm = new THREE.Mesh(new THREE.CylinderGeometry(veh.r * 0.6, veh.r * 0.6, tw + 0.02, 20), rim); rm.rotation.x = Math.PI / 2; wg.add(rm);
				for (var k = 0; k < 5; k++) { var sp = new THREE.Mesh(new THREE.BoxGeometry(veh.r * 1.1, veh.r * 0.12, tw + 0.04), spokeM); sp.rotation.z = k * Math.PI / 5; wg.add(sp); }
				axle.add(wg);
			});
			this.wheels.push(axle);
		}
		this.buildCockpit(veh, sh, w, bike, paint);
	};

	/* driver's-seat interior (only shown in the Driver's seat camera): pillars, roof edge, windshield glass, mirror,
	   dashboard with a live speedometer, steering wheel; on a bike handlebars + a small gauge. Body-local frame: x forward, y up. */
	View.prototype.buildCockpit = function (veh, sh, w, bike, paint) {
		var ck = this.ck = { g: new THREE.Group(), full: new THREE.Group(), glass: new THREE.Group(), last: "" }; this.body.add(ck.g); ck.g.add(ck.full); ck.g.add(ck.glass); ck.g.visible = false;
		var trim = new THREE.MeshStandardMaterial({ color: 0x24252c, roughness: 0.75 }), dark = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.6 }), chrome = new THREE.MeshStandardMaterial({ color: 0xaab2bc, metalness: 0.85, roughness: 0.3 });
		var e = bike ? [0.1, veh.ht - veh.hcg + 0.05, 0] : [0.2, veh.ht - veh.hcg - 0.22, -0.35]; ck.eye = e;
		function box(par, sx, sy, sz, x, y, z, mat, rz) { var m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); if (rz) m.rotation.z = rz; par.add(m); return m; }
		function bar(par, a, b, z, t, d, mat) { var dx = b[0] - a[0], dy = b[1] - a[1]; return box(par, Math.hypot(dx, dy), t, d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z, mat, Math.atan2(dy, dx)); }
		/* gauge texture (redrawn when the shown number changes) */
		var cv = document.createElement("canvas"); cv.width = 256; cv.height = 128; ck.cv = cv; ck.tex = new THREE.CanvasTexture(cv); ck.tex.colorSpace = THREE.SRGBColorSpace;
		var gaugeM = new THREE.MeshBasicMaterial({ map: ck.tex, toneMapped: false });
		/* steering wheel / handlebars, in a group tilted toward the driver; ck.steer rocks on hard landings */
		var sw = new THREE.Group(), steer = ck.steer = new THREE.Group(); sw.add(steer);
		if (!bike) {
			var roofF = sh.roof.reduce(function (b, p) { return p[0] > b[0] ? p : b; }, sh.roof[0] || [0.5, e[1] + 0.2]);
			var fwd = sh.pts.filter(function (p) { return p[0] > roofF[0] + 0.05 && p[1] < roofF[1] - 0.05; }).sort(function (a, b) { return a[0] - b[0]; });
			var cowl = fwd[0] || [roofF[0] + 0.8, roofF[1] - 0.5], hw = w / 2 - 0.1;
			e[0] = Math.min(e[0], cowl[0] - 0.75); /* sit far enough behind the windshield base for a dash (the muscle car's cabin is set back) */
			/* A-pillars, roof header, liner, glass, mirror */
			[-hw, hw].forEach(function (z) { bar(ck.glass, cowl, roofF, z, 0.07, 0.1, trim); });
			box(ck.glass, 0.16, 0.09, w - 0.14, roofF[0] - 0.06, roofF[1] - 0.07, 0, trim);
			box(ck.glass, Math.max(0.2, roofF[0] - e[0] + 0.5), 0.02, w - 0.16, (roofF[0] - 0.1 + e[0] - 0.6) / 2, roofF[1] - 0.1, 0, new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.95 }));
			var gl = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(roofF[0] - cowl[0], roofF[1] - cowl[1]), w - 0.22), new THREE.MeshPhysicalMaterial({ color: 0xa8cbe6, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }));
			gl.position.set((roofF[0] + cowl[0]) / 2, (roofF[1] + cowl[1]) / 2, 0); gl.rotation.set(Math.PI / 2, 0, Math.atan2(roofF[1] - cowl[1], roofF[0] - cowl[0]), "ZXY"); ck.glass.add(gl);
			var mir = box(ck.glass, 0.04, 0.07, 0.24, roofF[0] - 0.12, roofF[1] - 0.17, -0.04, dark); box(mir, 0.005, 0.055, 0.22, -0.023, 0, 0, chrome);
			box(ck.glass, 0.02, 0.1, 0.02, roofF[0] - 0.1, roofF[1] - 0.11, -0.04, dark);
			/* dashboard + door sills */
			var dTop = e[1] - 0.3, xd = Math.max(e[0] + 0.45, Math.min(e[0] + 0.6, cowl[0] - 0.1)); /* placed from the eye so the gauge and wheel sit in view in every body */
			bar(ck.full, [xd, dTop], [cowl[0] + 0.08, cowl[1] + 0.012], 0, 0.07, w - 0.12, dark); /* dash top runs into the base of the windshield, so no road shows between dash and bonnet */
			box(ck.full, 0.1, 0.4, w - 0.12, xd, dTop - 0.2, 0, trim);
			box(ck.full, 0.2, 0.035, 0.44, xd - 0.06, dTop + 0.075, e[2], dark); box(ck.full, 0.1, 0.13, 0.44, xd - 0.03, dTop, e[2], dark); /* cluster hood + back */
			var cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), gaugeM); cl.position.set(xd - 0.09, dTop - 0.005, e[2]); cl.rotation.set(0, -Math.PI / 2, 0); cl.rotateX(-0.25); ck.full.add(cl);
			box(ck.full, 0.04, 0.12, 0.26, xd - 0.04, dTop - 0.1, 0.12, trim); /* centre vents */
			[-1, 1].forEach(function (sd) { box(ck.full, Math.max(0.3, cowl[0] - e[0] + 0.6), 0.08, 0.1, (cowl[0] + e[0] - 0.6) / 2, dTop + 0.03, sd * (w / 2 - 0.07), trim); });
			/* steering wheel */
			var R = 0.2, rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 10, 40), dark); steer.add(rim);
			[[0, 0], [Math.PI, 0], [-Math.PI / 2, 0]].forEach(function (a) { var sp = new THREE.Mesh(new THREE.BoxGeometry(R, 0.03, 0.015), trim); sp.position.set(Math.cos(a[0]) * R / 2, Math.sin(a[0]) * R / 2, 0); sp.rotation.z = a[0]; steer.add(sp); });
			var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 20), trim); hub.rotation.x = Math.PI / 2; steer.add(hub);
			var badge = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(paint.color), metalness: 0.6, roughness: 0.3 })); badge.position.z = 0.027; steer.add(badge);
			steer.rotation.y = -Math.PI / 2;
			var col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.42, 12), trim); col.rotation.z = -Math.PI / 2; col.position.x = 0.21; sw.add(col);
			sw.position.set(Math.max(e[0] + 0.32, xd - 0.2), e[1] - 0.52, e[2]); sw.rotation.z = -0.45; ck.full.add(sw);
		} else {
			/* handlebars with grips, risers, a small gauge pod */
			var hbx = e[0] + 0.5, hby = e[1] - 0.44;
			var hb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.72, 10), chrome); hb.rotation.x = Math.PI / 2; steer.add(hb);
			[-1, 1].forEach(function (sd) { var gr = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 10), dark); gr.rotation.x = Math.PI / 2; gr.position.z = sd * 0.31; steer.add(gr); var rs = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8), chrome); rs.position.set(0.02, -0.06, sd * 0.1); steer.add(rs); });
			var pod = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), gaugeM); pod.position.set(0.07, 0.04, 0); pod.rotation.set(0, -Math.PI / 2, 0); pod.rotateX(-0.6); steer.add(pod);
			box(steer, 0.04, 0.11, 0.21, 0.1, 0.022, 0, dark).rotation.z = -0.6;
			sw.position.set(hbx, hby, 0); ck.full.add(sw);
		}
	};
	View.prototype.paintGauge = function (sp, g, mph) {
		var ck = this.ck, v = Math.round(sp * (mph ? 2.236936 : 3.6)), gg = Math.round(g * 10) / 10, key = v + "|" + gg + "|" + mph; if (key === ck.last) return; ck.last = key;
		var c = ck.cv.getContext("2d"), max = mph ? 200 : 320; c.fillStyle = "#07090f"; c.fillRect(0, 0, 256, 128);
		c.lineWidth = 9; c.lineCap = "round"; c.strokeStyle = "#232838"; c.beginPath(); c.arc(70, 72, 48, Math.PI * 0.75, Math.PI * 2.25); c.stroke();
		var f = Math.min(1, v / max); c.strokeStyle = f > 0.8 ? "#ff4d5e" : "#ff9f43"; c.beginPath(); c.arc(70, 72, 48, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * f)); c.stroke();
		c.fillStyle = "#fff"; c.textAlign = "center"; c.font = "bold 34px system-ui,sans-serif"; c.fillText(String(v), 70, 82); c.font = "13px system-ui,sans-serif"; c.fillStyle = "#9aa3b8"; c.fillText(mph ? "mph" : "km/h", 70, 104);
		c.textAlign = "left"; c.font = "12px system-ui,sans-serif"; c.fillText("FELT", 150, 40); c.font = "bold 30px system-ui,sans-serif"; c.fillStyle = gg >= 6 ? "#ff4d5e" : gg >= 3 ? "#ffd166" : "#7ee0a1"; c.fillText(gg.toFixed(1) + " g", 150, 74);
		ck.tex.needsUpdate = true;
	};

	/* one frame: car pose from the physics state, camera, shadows follow the car */
	View.prototype.draw = function (st, o) {
		this.last = [st, o]; if (!this.co) return; var sim = o.sim, veh = this.veh, mode = this.mode = o.cam;
		var cs = Math.cos(st.th), sn = Math.sin(st.th);
		this.carG.position.set(0, 0, 0); this.body.position.set(st.x, st.y, 0); this.body.rotation.set(0, 0, st.th);
		for (var i = 0; i < 2; i++) { var A = sim.ax[i], by = A.ya - (A.L0 - (st.comp[i] || 0)), wxp = st.x + A.bx * cs - by * sn, wyp = st.y + A.bx * sn + by * cs; this.wheels[i].position.set(wxp, wyp, 0); this.wheels[i].rotation.set(0, 0, st.th + st.ang[i]); }
		/* trail */
		var tr = o.track || [], arr = this.trailGeo.attributes.position.array, n = 0;
		for (var k = 0; k < tr.length && n < 4000; k += 2) { if (tr[k][10] > 0 && tr[Math.min(tr.length - 1, k + 2)][10] > 0) continue; arr[n * 3] = tr[k][1]; arr[n * 3 + 1] = tr[k][2]; arr[n * 3 + 2] = 0; n++; }
		this.trailGeo.attributes.position.needsUpdate = true; this.trailGeo.setDrawRange(0, n);
		if (this.water) this.water.position.y = this.co.water.y + Math.sin(st.t * 2) * 0.03;
		/* camera */
		var car = new THREE.Vector3(st.x, st.y, 0), pos = new THREE.Vector3(), look = new THREE.Vector3(), air = st.state === "air" || (sim.ev.takeoff && !sim.ev.land && st.x > this.co.lip.x);
		var m = mode, ckMode = o.cockpit || "full", ckOn = m === "driver" && ckMode !== "off", ck = this.ck;
		if (ck) { ck.g.visible = ckOn; ck.full.visible = ckMode === "full"; if (ckOn && ckMode === "full") { this.paintGauge(st.sp || 0, st.g == null ? 1 : st.g, !!o.mph); ck.steer.rotation.x = Math.max(-0.25, Math.min(0.25, ((st.g || 1) - 1.5) * 0.02)) * Math.sin(st.t * 38); } }
		var fov = ckOn ? 70 : 55; if (m === "driver" && this.free.on) fov = Math.max(36, Math.min(108, fov * this.free.zoom)); if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
		if (m === "auto") m = air ? "auto-air" : sim.ev.land && st.state !== "approach" ? "chase" : "chase";
		if (m === "chase") { pos.set(st.x - 9 - veh.len, st.y + 3.2 + veh.ht * 0.6, 5.5); look.set(st.x + 8, st.y + 0.6, 0); }
		else if (m === "auto-air") { var a = 0.9 + Math.min(1.2, (st.t - (sim.ev.takeoff ? sim.ev.takeoff.t : st.t)) * 0.35); pos.set(st.x - Math.cos(a) * 16, st.y + 3.5, Math.sin(a) * 16 + 2); look.set(st.x + 4, st.y, 0); }
		else if (m === "side") { pos.set(st.x + 3, st.y + 2.5, 24); look.set(st.x + 3, st.y + 0.5, 0); }
		else if (m === "driver") { var hx = ck && ck.eye ? ck.eye[0] : veh.bike ? 0.1 : 0.2, hy = veh.ht - veh.hcg - (veh.bike ? -0.05 : 0.22), dn = ckOn ? 0.17 : 0; pos.set(st.x + hx * cs - hy * sn, st.y + hx * sn + hy * cs, veh.bike ? 0 : -0.35); look.set(pos.x + 20 * Math.cos(st.th - dn), pos.y + 20 * Math.sin(st.th - dn), pos.z); }
		else if (m === "landing") { var lz = this.co.zone[0] + 6, gy = window.MESGTA.groundAt(this.co, lz).y; pos.set(lz, Math.max(gy, 0) + 2.2, 13); look.copy(car); }
		else { var ob = this.orb; pos.set(st.x + Math.cos(ob.yaw) * Math.cos(ob.pitch) * ob.dist, st.y + Math.sin(ob.pitch) * ob.dist + 0.5, Math.sin(ob.yaw) * Math.cos(ob.pitch) * ob.dist); look.copy(car); }
		if (o.snap || m === "driver" || m === "orbit") { this.camPos.copy(pos); this.camLook.copy(look); }
		else { this.camPos.lerp(pos, 0.12); this.camLook.lerp(look, 0.2); }
		var cp = this.camPos.clone(), cl = this.camLook.clone(), f = this.free;
		if (f.on && m !== "orbit") {
			if (m === "driver") { /* turn the head: rotate the look point around the eye */
				var v0 = cl.clone().sub(cp), hz = Math.hypot(v0.x, v0.z), yw = Math.atan2(v0.z, v0.x) + f.yaw, pt = Math.atan2(v0.y, hz) + f.pitch, L0 = v0.length();
				cl.set(cp.x + Math.cos(yw) * Math.cos(pt) * L0, cp.y + Math.sin(pt) * L0, cp.z + Math.sin(yw) * Math.cos(pt) * L0);
			} else { /* swing the camera around the point it looks at */
				var v = cp.clone().sub(cl), r = v.length() * f.zoom, h0 = Math.hypot(v.x, v.z), yaw = Math.atan2(v.z, v.x) + f.yaw, pitch = Math.max(-0.05, Math.min(1.5, Math.atan2(v.y, h0) + f.pitch));
				cp.set(cl.x + Math.cos(yaw) * Math.cos(pitch) * r, cl.y + Math.sin(pitch) * r, cl.z + Math.sin(yaw) * Math.cos(pitch) * r);
			}
		}
		this.camera.position.copy(cp); this.camera.lookAt(cl);
		this.sky.position.copy(this.camera.position);
		this.sun.position.set(this.camera.position.x + 900, 120, this.camera.position.z - 500);
		this.light.position.set(st.x + 60, st.y + 70, st.z || 40); this.light.target.position.set(st.x, st.y, 0); this.light.target.updateMatrixWorld();
		this.renderer.render(this.scene, this.camera);
	};

	window.GJ3D = { create: create, load: load };
})();
