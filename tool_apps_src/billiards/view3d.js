/* MES Billiards: the 3D view (window.BL3D). Only drawing: the physics, rules and positions come from lib.js / app.js exactly as in 2D, so a
   game can switch between 2D and 3D at any moment (online and Hive games too). three.js 0.170.0 is loaded from jsDelivr (unpkg fallback)
   only when 3D is first chosen. Coordinates: three X = table x, three Z = table y, Y up, the cloth at Y = 0.
   API: BL3D.create(container) -> Promise<view>; view.setTable(st, cloth, nums), view.size(w, h), view.frame(info), view.pick(clientX, clientY),
   view.setCam(mode), view.orbit(dx, dy), view.zoom(f), view.reset(), view.png(). */
(function () {
	"use strict";
	if (typeof window === "undefined") return;     // the same file also runs as the computer's Web Worker
	var THREE = null, loading = null;
	var URLS = ["https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "https://unpkg.com/three@0.170.0/build/three.module.min.js"];
	function load() {
		if (THREE) return Promise.resolve(THREE);
		if (loading) return loading;
		var imp = new Function("u", "return import(u)");
		loading = imp(URLS[0]).catch(function () { return imp(URLS[1]); }).then(function (m) { THREE = m; return m; }, function (e) { loading = null; throw e; });
		return loading;
	}
	var POOL_COL = { 0: "#f8f8f2", 1: "#f2c200", 2: "#1c4fd8", 3: "#d62828", 4: "#6a2c91", 5: "#f77f00", 6: "#1b7f3b", 7: "#7b1e1e", 8: "#111111" };
	var SNK_COL = { 0: "#f8f8f2", 1: "#c1121f", 2: "#f2c200", 3: "#1b8a43", 4: "#7a4a1e", 5: "#1c4fd8", 6: "#ff7eb6", 7: "#111111" };
	var CLOTH = { green: "#1f7a46", blue: "#1f5f9e", red: "#9e2a2b", grey: "#5b6670" };
	function tex(w, h, draw) { var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
	function rgba(str) {   // "rgba(r,g,b,a)" | "#rrggbb" -> [THREE.Color, alpha]
		var m = /rgba?\(([^)]+)\)/.exec(str);
		if (m) { var p = m[1].split(",").map(Number); return [new THREE.Color(p[0] / 255, p[1] / 255, p[2] / 255), p.length > 3 ? p[3] : 1]; }
		return [new THREE.Color(str), 1];
	}

	function create(container) {
		return load().then(function () {
			var t = document.createElement("canvas");
			if (!(t.getContext("webgl2") || t.getContext("webgl"))) throw new Error("WebGL is switched off in this browser");
			return new View(container);
		});
	}

	function View(el) {
		this.el = el;
		var R = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
		R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.1;
		R.domElement.className = "bl-cv3";
		el.appendChild(R.domElement);
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color("#0c120f");
		this.scene.fog = new THREE.Fog("#0c120f", 6, 14);
		this.cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.02, 40);
		this.cam.position.set(-2.4, 1.2, 0);
		this.camMode = "auto"; this.zoomF = 1; this.orb = { th: -2.2, ph: 0.85, d: 3.2 };
		this.cur = { eye: new THREE.Vector3(-2.4, 1.2, 0), look: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 1, 0) };
		this.balls = []; this.quats = []; this.prev = []; this.guideGroup = new THREE.Group(); this.scene.add(this.guideGroup);
		this.ray = new THREE.Raycaster();
		var hemi = new THREE.HemisphereLight("#fff7e6", "#1b1410", 0.55); this.scene.add(hemi);
		var amb = new THREE.AmbientLight("#ffffff", 0.15); this.scene.add(amb);
		this.info = null; this.w = 300; this.h = 200; this.raf = 0;
	}
	View.prototype.setTable = function (st, cloth, nums) {
		var key = st.T.id + "|" + st.n + "|" + st.k.join(",") + "|" + cloth + "|" + (nums ? 1 : 0);
		if (key === this.tkey) return;
		this.tkey = key; this.T = st.T;
		if (this.table) { this.scene.remove(this.table); disposeTree(this.table); }
		var g = this.table = new THREE.Group(), T = st.T, L = T.L / 2, W = T.W / 2, Rb = T.R;
		var cush = 0.045, wood = T.id === "pool" ? 0.11 : 0.13, hc = Rb * 1.3, hw = Rb * 1.55;
		this.hc = hc;
		var clothCol = new THREE.Color(CLOTH[cloth] || CLOTH.green);
		var clothTex = tex(256, 256, function (c, w, h) {
			c.fillStyle = "#" + clothCol.getHexString(); c.fillRect(0, 0, w, h);
			var img = c.getImageData(0, 0, w, h), d = img.data;
			for (var i = 0; i < d.length; i += 4) { var n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
			c.putImageData(img, 0, 0);
		});
		clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping; clothTex.repeat.set(6, 3);
		var clothMat = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.95, metalness: 0 });
		var cushMat = new THREE.MeshStandardMaterial({ color: clothCol.clone().multiplyScalar(0.8), roughness: 0.9 });
		var woodTex = tex(512, 64, function (c, w, h) {
			var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#7a4222"); gr.addColorStop(0.5, "#8f5129"); gr.addColorStop(1, "#5e3117");
			c.fillStyle = gr; c.fillRect(0, 0, w, h);
			c.strokeStyle = "rgba(40,20,8,0.25)"; c.lineWidth = 1;
			for (var i = 0; i < 26; i++) { c.beginPath(); var y = Math.random() * h; c.moveTo(0, y); for (var x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x / 60 + i) * 3); c.stroke(); }
		});
		woodTex.wrapS = THREE.RepeatWrapping; woodTex.repeat.set(3, 1);
		var woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.45, metalness: 0.05 });
		// cloth with pocket holes (shape in the XY plane, y = -table y, then laid flat)
		var G = window.MESBilliards.geometry(T), pk = [];
		G.pockets.forEach(function (q) {
			var corner = q[2], rr = corner ? T.mc * 0.62 : T.ms * 0.55;
			var ox = corner ? (q[0] > 0 ? 1 : -1) * T.mc * 0.18 : 0, oy = (q[1] > 0 ? 1 : -1) * (corner ? T.mc * 0.18 : T.ms * 0.28);
			pk.push([q[0] + ox, q[1] + oy, rr]);
		});
		var sh = new THREE.Shape();
		sh.moveTo(-L - cush - wood, W + cush + wood); sh.lineTo(L + cush + wood, W + cush + wood); sh.lineTo(L + cush + wood, -W - cush - wood); sh.lineTo(-L - cush - wood, -W - cush - wood); sh.lineTo(-L - cush - wood, W + cush + wood);
		pk.forEach(function (p) { var hole = new THREE.Path(); hole.absarc(p[0], -p[1], p[2], 0, Math.PI * 2, true); sh.holes.push(hole); });
		var clothMesh = new THREE.Mesh(new THREE.ShapeGeometry(sh, 32), clothMat);
		clothMesh.rotation.x = -Math.PI / 2; clothMesh.receiveShadow = true; g.add(clothMesh);
		// cushions (one box per rail segment, outside the nose line)
		G.segs.forEach(function (sg) {
			var len = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]), nx = sg[4], ny = sg[5];
			var geo = sg[4] === 0 ? new THREE.BoxGeometry(len, hc, cush) : new THREE.BoxGeometry(cush, hc, len);
			var m = new THREE.Mesh(geo, cushMat);
			m.position.set((sg[0] + sg[2]) / 2 - nx * cush / 2, hc / 2, (sg[1] + sg[3]) / 2 - ny * cush / 2);
			m.castShadow = true; m.receiveShadow = true; g.add(m);
		});
		// wooden rails (with a gap over each pocket)
		var rails = [[0, -W - cush - wood / 2, T.L + 2 * (cush + wood), wood, "x"], [0, W + cush + wood / 2, T.L + 2 * (cush + wood), wood, "x"], [-L - cush - wood / 2, 0, wood, T.W + 2 * cush, "z"], [L + cush + wood / 2, 0, wood, T.W + 2 * cush, "z"]];
		rails.forEach(function (r) {
			var m = new THREE.Mesh(new THREE.BoxGeometry(r[2], hw + 0.16, r[3]), woodMat);
			m.position.set(r[0], (hw - 0.16) / 2, r[1]); m.castShadow = true; m.receiveShadow = true; g.add(m);
		});
		// a strip of cloth-coloured top between the cushions and the rails, so the corners look closed
		var lip = new THREE.MeshStandardMaterial({ color: clothCol.clone().multiplyScalar(0.7), roughness: 0.9 });
		[[0, -W - cush / 2, T.L + 2 * cush, cush], [0, W + cush / 2, T.L + 2 * cush, cush], [-L - cush / 2, 0, cush, T.W], [L + cush / 2, 0, cush, T.W]].forEach(function (r) {
			var m = new THREE.Mesh(new THREE.BoxGeometry(r[2], 0.004, r[3]), lip); m.position.set(r[0], -0.002, r[1]); g.add(m);
		});
		// pockets: black tube + brass ring + leather drop
		var black = new THREE.MeshStandardMaterial({ color: "#050505", roughness: 1, side: THREE.DoubleSide });
		var brass = new THREE.MeshStandardMaterial({ color: "#c9a24a", roughness: 0.3, metalness: 0.85 });
		pk.forEach(function (p) {
			var tube = new THREE.Mesh(new THREE.CylinderGeometry(p[2], p[2] * 0.92, 0.14, 28, 1, true), black);
			tube.position.set(p[0], -0.07, p[1]); g.add(tube);
			var bot = new THREE.Mesh(new THREE.CircleGeometry(p[2], 24), black); bot.rotation.x = -Math.PI / 2; bot.position.set(p[0], -0.13, p[1]); g.add(bot);
			var ring = new THREE.Mesh(new THREE.TorusGeometry(p[2] * 1.02, 0.006, 8, 32), brass); ring.rotation.x = Math.PI / 2; ring.position.set(p[0], hw + 0.002, p[1]);
			g.add(ring);
			var cap = new THREE.Mesh(new THREE.CylinderGeometry(p[2] * 1.12, p[2] * 1.12, hw, 28, 1, true, 0, Math.PI * 2), black); cap.position.set(p[0], hw / 2, p[1]); g.add(cap);
		});
		// diamonds (sights) on the rails
		var dmat = new THREE.MeshStandardMaterial({ color: "#f3e7c8", roughness: 0.4, metalness: 0.2 });
		var dz = cush + wood * 0.5, dgeo = new THREE.CircleGeometry(0.008, 4);
		function dia(x, z) { var m = new THREE.Mesh(dgeo, dmat); m.rotation.x = -Math.PI / 2; m.position.set(x, hw + 0.001, z); g.add(m); }
		for (var i = 1; i < 8; i++) if (i !== 4) { dia(-L + T.L * i / 8, -W - dz); dia(-L + T.L * i / 8, W + dz); }
		for (i = 1; i < 4; i++) { dia(-L - dz, -W + T.W * i / 4); dia(L + dz, -W + T.W * i / 4); }
		// markings
		var lm = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false });
		if (T.id === "snooker") {
			var bx = -L + T.baulk;
			var bl = new THREE.Mesh(new THREE.PlaneGeometry(0.003, T.W), lm); bl.rotation.x = -Math.PI / 2; bl.position.set(bx, 0.0008, 0); g.add(bl);
			var dArc = new THREE.Mesh(new THREE.RingGeometry(T.dR - 0.0015, T.dR + 0.0015, 48, 1, Math.PI / 2, Math.PI), lm); dArc.rotation.x = -Math.PI / 2; dArc.position.set(bx, 0.0008, 0); g.add(dArc);
			var sp = window.MESBilliards.spots(T);
			for (var v = 2; v <= 7; v++) { var s0 = new THREE.Mesh(new THREE.CircleGeometry(0.004, 12), lm); s0.rotation.x = -Math.PI / 2; s0.position.set(sp[v][0], 0.0008, sp[v][1]); g.add(s0); }
		} else {
			[[T.L / 4, 0], [-T.L / 4, 0]].forEach(function (p) { var s1 = new THREE.Mesh(new THREE.CircleGeometry(0.005, 12), lm); s1.rotation.x = -Math.PI / 2; s1.position.set(p[0], 0.0008, p[1]); g.add(s1); });
		}
		// table body, legs and the floor
		var body = new THREE.Mesh(new THREE.BoxGeometry(T.L + 2 * (cush + wood) - 0.06, 0.2, T.W + 2 * (cush + wood) - 0.06), woodMat);
		body.position.set(0, -0.26, 0); body.castShadow = true; g.add(body);
		var legGeo = new THREE.CylinderGeometry(0.06, 0.045, 0.55, 16);
		[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]].forEach(function (s) {
			if (T.id === "pool" && s[0] === 0) return;
			var m = new THREE.Mesh(legGeo, woodMat); m.position.set(s[0] * (L - 0.05), -0.62, s[1] * (W - 0.05)); m.castShadow = true; g.add(m);
		});
		var floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: "#2a211b", roughness: 0.9 }));
		floor.rotation.x = -Math.PI / 2; floor.position.y = -0.89; floor.receiveShadow = true; g.add(floor);
		// lamps over the table: shades + lights (one casts the shadows)
		var shade = new THREE.MeshStandardMaterial({ color: "#16402b", roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
		var glow = new THREE.MeshBasicMaterial({ color: "#fff6dd" });
		var nl = T.id === "snooker" ? 3 : 2;
		this.lamps = [];
		for (i = 0; i < nl; i++) {
			var lx = (i - (nl - 1) / 2) * T.L / nl;
			var sm = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 24, 1, true), shade); sm.position.set(lx, 1.12, 0); g.add(sm); this.lamps.push(sm);
			var gl = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), glow); gl.rotation.x = Math.PI / 2; gl.position.set(lx, 1.04, 0); g.add(gl); this.lamps.push(gl);
			var pl = new THREE.PointLight("#fff3dc", 1.4, 4, 1.4); pl.position.set(lx, 1.0, 0); g.add(pl);
		}
		var dl = new THREE.DirectionalLight("#fff4e0", 1.6);
		dl.position.set(0.25, 3, 0.35); dl.target.position.set(0, 0, 0);
		dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048);
		var sc = dl.shadow.camera; sc.left = -L - 0.4; sc.right = L + 0.4; sc.top = W + 0.4; sc.bottom = -W - 0.4; sc.near = 0.5; sc.far = 5;
		dl.shadow.bias = -0.0004; dl.shadow.radius = 3;
		g.add(dl); g.add(dl.target);
		this.scene.add(g);
		// balls
		this.balls.forEach(function (b) { this.scene.remove(b); b.geometry.dispose(); b.material.map && b.material.map.dispose(); b.material.dispose(); }, this);
		this.balls = []; this.quats = []; this.prev = [];
		var snooker = T.id === "snooker", geo = new THREE.SphereGeometry(Rb, 40, 28);
		for (var b = 0; b < st.n; b++) {
			var mat = new THREE.MeshPhysicalMaterial({ map: ballTex(st.k[b], snooker, nums), roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
			var m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = false;
			this.scene.add(m); this.balls.push(m);
			var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);     // the number on top
			var tw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (b * 2.39996) % (Math.PI * 2));
			this.quats.push(tw.multiply(q)); this.prev.push(null);
		}
		// the cue stick
		if (this.cue) { this.scene.remove(this.cue); disposeTree(this.cue); }
		var cueTex = tex(16, 1024, function (c, w, h) {
			var gr = c.createLinearGradient(0, 0, 0, h);
			gr.addColorStop(0, "#3d6fb8"); gr.addColorStop(0.012, "#3d6fb8"); gr.addColorStop(0.013, "#f4ecda"); gr.addColorStop(0.03, "#f4ecda"); gr.addColorStop(0.031, "#e7cf9f");
			gr.addColorStop(0.6, "#d8b27a"); gr.addColorStop(0.62, "#151010"); gr.addColorStop(0.66, "#151010"); gr.addColorStop(0.67, "#5b2e14"); gr.addColorStop(0.97, "#2a160b"); gr.addColorStop(1, "#111");
			c.fillStyle = gr; c.fillRect(0, 0, w, h);
		});
		var cue = this.cue = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0145, 1.45, 24), new THREE.MeshStandardMaterial({ map: cueTex, roughness: 0.35, metalness: 0.05 }));
		cue.castShadow = true; cue.visible = false; this.scene.add(cue);
		this.placeRing = new THREE.Mesh(new THREE.RingGeometry(Rb * 1.45, Rb * 1.6, 40), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false }));
		this.placeRing.rotation.x = -Math.PI / 2; this.placeRing.position.y = 0.001; this.placeRing.visible = false; this.scene.add(this.placeRing);
	};
	function ballTex(kind, snooker, big) {
		var col = snooker ? SNK_COL[kind] : POOL_COL[kind > 8 ? kind - 8 : kind];
		return tex(512, 256, function (c, w, h) {
			c.fillStyle = (!snooker && kind > 8) ? "#f6f4ec" : col; c.fillRect(0, 0, w, h);
			if (!snooker && kind > 8) { c.fillStyle = col; c.fillRect(0, h * 0.28, w, h * 0.44); }
			if (!snooker && kind > 0) {
				var r = h * (big ? 0.2 : 0.15);
				[w * 0.25, w * 0.75].forEach(function (x) {
					c.save(); c.translate(x, h / 2); c.scale(1, 1);
					c.fillStyle = "#fff"; c.beginPath(); c.ellipse(0, 0, r * 1.05, r, 0, 0, 7); c.fill();
					c.fillStyle = "#111"; c.font = "700 " + Math.round(r * (kind > 9 ? 1.05 : 1.3)) + "px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
					c.fillText(String(kind), 0, r * 0.06); c.restore();
				});
			}
			if (kind === 0 && !snooker) { c.fillStyle = "#c81e1e"; [[w * 0.25, h / 2], [w * 0.75, h / 2], [0, h / 2], [w, h / 2]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], h * 0.04, 0, 7); c.fill(); }); }
		});
	}
	function disposeTree(o) { o.traverse(function (x) { if (x.geometry) x.geometry.dispose(); if (x.material) { (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
	View.prototype.size = function (w, h) {
		this.w = w; this.h = h;
		this.renderer.setSize(w, h, false);
		this.renderer.domElement.style.width = w + "px"; this.renderer.domElement.style.height = h + "px";
		this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
		this.render();
	};
	View.prototype.setCam = function (m) { this.camMode = m; this.render(); };
	View.prototype.zoom = function (f) { this.zoomF = Math.max(0.35, Math.min(3, this.zoomF * f)); if (this.camMode === "orbit") this.orb.d = Math.max(0.4, Math.min(9, this.orb.d * f)); this.render(); };
	View.prototype.orbit = function (dx, dy) {
		if (this.camMode !== "orbit") {   // start the orbit from where the camera is now
			var e = this.cur.eye, lk = this.cur.look, v = e.clone().sub(lk);
			this.orb.d = v.length(); this.orb.th = Math.atan2(v.z, v.x); this.orb.ph = Math.acos(Math.max(-1, Math.min(1, v.y / this.orb.d)));
			this.orb.target = lk.clone(); this.camMode = "orbit";
		}
		this.orb.th += dx * 0.008; this.orb.ph = Math.max(0.08, Math.min(1.5, this.orb.ph - dy * 0.006));
		this.render();
	};
	View.prototype.reset = function () { this.zoomF = 1; this.orb = { th: -2.2, ph: 0.85, d: 3.2 }; this.render(); };
	View.prototype.frame = function (info) { this.info = info; this.render(); };
	View.prototype.pick = function (cx, cy) {
		if (!this.T) return null;
		var r = this.renderer.domElement.getBoundingClientRect();
		var v = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
		this.ray.setFromCamera(v, this.cam);
		var o = this.ray.ray.origin, d = this.ray.ray.direction, y0 = this.T.R;
		if (Math.abs(d.y) < 1e-6) return null;
		var t = (y0 - o.y) / d.y;
		if (t < 0) return null;
		return [o.x + d.x * t, o.z + d.z * t];
	};
	View.prototype.png = function () { this.render(true); return this.renderer.domElement.toDataURL("image/png"); };
	View.prototype.camTarget = function () {
		var I = this.info, T = this.T, L = T.L, W = T.W, z = this.zoomF, mode = this.camMode;
		var out = { eye: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
		var c0 = I && I.c0 ? I.c0 : [-L / 4, 0], d = I && I.dir ? I.dir : [1, 0], R = T.R;
		var portrait = this.w < this.h * 0.95;
		if (mode === "auto") mode = I && I.phase === "anim" ? "overview" : "behind";
		if (mode === "behind") {
			var back = 0.85 * z, high = 0.26 * z + R;
			out.eye.set(c0[0] - d[0] * back, high, c0[1] - d[1] * back);
			out.look.set(c0[0] + d[0] * 0.55, R * 0.6, c0[1] + d[1] * 0.55);
		} else if (mode === "overhead") {
			var fov = this.cam.fov * Math.PI / 180, asp = this.w / this.h;
			var span = portrait ? Math.max(W / asp, L) : Math.max(L / asp, W);
			var hgt = (span * 0.5 + 0.18) / Math.tan(fov / 2) * z + 0.1;
			out.eye.set(0, hgt, 0.0001); out.look.set(0, 0, 0);
			out.up.set(portrait ? 1 : 0, 0, portrait ? 0 : -1);
		} else if (mode === "overview") {
			var sd = I && I.shotDir ? I.shotDir : d, sc0 = I && I.shotC0 ? I.shotC0 : c0;
			var cx = sc0[0] * 0.4, cz = sc0[1] * 0.4, dist = (L * 0.62 + 0.6) * z;
			out.eye.set(cx - sd[0] * dist, (L * 0.55 + 0.3) * z, cz - sd[1] * dist);
			out.look.set(cx + sd[0] * 0.2, 0, cz + sd[1] * 0.2);
		} else if (mode === "side") {
			out.eye.set(0, (0.9 + L * 0.15) * z, (W / 2 + 1.1 + L * 0.25) * z); out.look.set(0, -0.05, 0);
		} else {
			var o = this.orb, tg = o.target || new THREE.Vector3(0, 0, 0);
			out.look.copy(tg);
			out.eye.set(tg.x + o.d * Math.sin(o.ph) * Math.cos(o.th), tg.y + o.d * Math.cos(o.ph), tg.z + o.d * Math.sin(o.ph) * Math.sin(o.th));
		}
		return out;
	};
	View.prototype.render = function (now) {
		var self = this;
		if (now === true) return this._draw(true);
		if (this.raf) return;
		this.raf = requestAnimationFrame(function () { self.raf = 0; self._draw(false); });
	};
	View.prototype._draw = function (instant) {
		if (!this.T) return;
		var I = this.info, i;
		// balls (+ rolling: turn each ball by the distance it moved since the last frame)
		if (I && I.xs) {
			for (i = 0; i < this.balls.length; i++) {
				var m = this.balls[i], on = I.ons[i];
				m.visible = !!on;
				if (!on) { this.prev[i] = null; continue; }
				var x = I.xs[i], z = I.ys[i], p = this.prev[i];
				if (p) {
					var dx = x - p[0], dz = z - p[1], dist = Math.sqrt(dx * dx + dz * dz);
					if (dist > 1e-7 && dist < 0.5) {
						var ax = new THREE.Vector3(dz, 0, -dx).normalize(), qd = new THREE.Quaternion().setFromAxisAngle(ax, dist / this.T.R);
						this.quats[i].premultiply(qd);
					}
				}
				this.prev[i] = [x, z];
				m.position.set(x, this.T.R, z); m.quaternion.copy(this.quats[i]);
			}
			// the cue stick
			if (I.cue) {
				var c = I.cue, el = 0.09, pull = c.pull, s0 = this.T.R + 0.006 + pull, half = 0.725;
				var cosE = Math.cos(el), sinE = Math.sin(el), mid = s0 + half;
				this.cue.position.set(c.x - c.dx * mid * cosE, this.T.R + mid * sinE, c.y - c.dy * mid * cosE);
				var axis = new THREE.Vector3(c.dx * cosE, -sinE, c.dy * cosE).normalize();   // from butt to tip
				this.cue.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
				this.cue.visible = true;
			} else this.cue.visible = false;
			// ball in hand
			if (I.place) { this.placeRing.visible = true; this.placeRing.position.set(I.place.x, 0.0012, I.place.y); this.placeRing.material.color.set(I.place.ok ? "#ffffff" : "#ff4d4d"); }
			else this.placeRing.visible = false;
			this.buildGuide(I.guide);
		}
		// the camera, eased toward where it should be
		var tg = this.camTarget(), cur = this.cur, k = instant ? 1 : 0.2, moving = false;
		[["eye", tg.eye], ["look", tg.look], ["up", tg.up]].forEach(function (a) { var v = cur[a[0]]; if (v.distanceTo(a[1]) > 0.0005) { v.lerp(a[1], k); moving = true; } else v.copy(a[1]); });
		this.cam.position.copy(cur.eye); this.cam.up.copy(cur.up).normalize(); this.cam.lookAt(cur.look);
		var low = cur.eye.y < 0.95;   // the lamp shades would block the view from above
		(this.lamps || []).forEach(function (m) { m.visible = low; });
		this.renderer.render(this.scene, this.cam);
		if (moving && !instant) this.render();
	};
	View.prototype.buildGuide = function (gd) {
		var grp = this.guideGroup;
		while (grp.children.length) { var o = grp.children.pop(); o.geometry.dispose(); o.material.dispose(); }
		if (!gd) return;
		var y = 0.0015, self = this;
		gd.lines.forEach(function (l) {
			var ca = rgba(l[4]), x1 = l[0], z1 = l[1], x2 = l[2], z2 = l[3], len = Math.hypot(x2 - x1, z2 - z1);
			if (len < 1e-6) return;
			var ux = (x2 - x1) / len, uz = (z2 - z1) / len, w = Math.max(0.003, l[5]) * 0.75, pos = [];
			var seg = l[6] ? 0.03 : len, gap = l[6] ? 0.02 : 0;
			for (var t = 0; t < len; t += seg + gap) {
				var t2 = Math.min(len, t + seg), ax = x1 + ux * t, az = z1 + uz * t, bx = x1 + ux * t2, bz = z1 + uz * t2, nx = -uz * w, nz = ux * w;
				pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
			}
			var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
			grp.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: ca[0], transparent: true, opacity: ca[1], depthWrite: false, side: THREE.DoubleSide })));
		});
		gd.rings.forEach(function (r) {
			var ca = rgba(r[3]);
			var m = new THREE.Mesh(new THREE.RingGeometry(r[2] * 0.93, r[2] * 1.03, 40), new THREE.MeshBasicMaterial({ color: ca[0], transparent: true, opacity: ca[1], depthWrite: false }));
			m.rotation.x = -Math.PI / 2; m.position.set(r[0], y, r[1]); grp.add(m);
			// a see-through ghost ball where the cue ball will touch
			var gh = new THREE.Mesh(new THREE.SphereGeometry(self.T.R * 0.995, 24, 16), new THREE.MeshBasicMaterial({ color: ca[0], transparent: true, opacity: 0.16, depthWrite: false }));
			gh.position.set(r[0], self.T.R, r[1]); grp.add(gh);
		});
	};
	View.prototype.resetRoll = function () { for (var i = 0; i < this.prev.length; i++) this.prev[i] = null; };

	window.BL3D = { create: create, load: load };
})();
