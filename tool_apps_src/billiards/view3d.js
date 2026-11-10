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
		woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(3, 1);
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
		// wooden rails: one frame with the real pocket openings cut out (the inside edge follows the cushions and goes round
		// each pocket hole), so a pocket is a hole in the rail and the cloth, not a tube standing on it
		var ix = L + cush, iz = W + cush, ox = L + cush + wood, oz = W + cush + wood;
		var frame = new THREE.Shape();
		frame.moveTo(-ox, -oz); frame.lineTo(ox, -oz); frame.lineTo(ox, oz); frame.lineTo(-ox, oz); frame.lineTo(-ox, -oz);
		var hole = new THREE.Path(), N = 1440;
		for (var k = 0; k <= N; k++) {
			var th = -k / N * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
			var tr = Math.min(Math.abs(cs) > 1e-9 ? ix / Math.abs(cs) : 1e9, Math.abs(sn) > 1e-9 ? iz / Math.abs(sn) : 1e9);
			pk.forEach(function (pp) {   // shape coordinates: y = -table y
				var cx = pp[0], cy = -pp[1], r = pp[2] * 1.02, bb = cx * cs + cy * sn, disc = bb * bb - (cx * cx + cy * cy - r * r);
				if (disc > 0) { var ex = bb + Math.sqrt(disc); if (ex > tr) tr = ex; }
			});
			if (k === 0) hole.moveTo(tr * cs, tr * sn); else hole.lineTo(tr * cs, tr * sn);
		}
		frame.holes.push(hole);
		var fh = hw + 0.16, fgeo = new THREE.ExtrudeGeometry(frame, { depth: fh, bevelEnabled: false, steps: 1 });
		var fmesh = new THREE.Mesh(fgeo, woodMat);
		fmesh.rotation.x = -Math.PI / 2; fmesh.position.y = -0.16; fmesh.castShadow = true; fmesh.receiveShadow = true; g.add(fmesh);
		woodTex.repeat.set(1.5, 1.5);
		// the pocket drop below each hole (only seen through the hole)
		var black = new THREE.MeshStandardMaterial({ color: "#050505", roughness: 1, side: THREE.DoubleSide });
		pk.forEach(function (p) {
			var tube = new THREE.Mesh(new THREE.CylinderGeometry(p[2] * 1.02, p[2] * 0.9, 0.16, 28, 1, true), black);
			tube.position.set(p[0], -0.08, p[1]); g.add(tube);
			var bot = new THREE.Mesh(new THREE.CircleGeometry(p[2], 24), black); bot.rotation.x = -Math.PI / 2; bot.position.set(p[0], -0.15, p[1]); g.add(bot);
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
		this.roomKey = "";
		this.setRoom(this.roomName || "dark");
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
	View.prototype.setCam = function (m) { this.camMode = m; this.tilt = 0; this.render(); };
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
	/** tilt the camera up (+) or down (-) in radians; the orbit camera uses its own angle */
	View.prototype.tiltBy = function (dr) {
		if (this.camMode === "orbit") { this.orb.ph = Math.max(0.08, Math.min(1.5, this.orb.ph - dr)); this.render(); return; }
		this.tilt = Math.max(-0.27, Math.min(1.15, (this.tilt || 0) + dr)); this.render();
	};
	View.prototype.reset = function () { this.tilt = 0; this.zoomF = 1; this.orb = { th: -2.2, ph: 0.85, d: 3.2 }; this.render(); };
	/** start the camera from straight above (then it eases to the chosen view): a smooth way in from 2D */
	View.prototype.flyFromTop = function () {
		var keep = this.forceTop; this.forceTop = true;
		var t = this.camTarget(); this.forceTop = keep;
		this.cur.eye.copy(t.eye); this.cur.look.copy(t.look); this.cur.up.copy(t.up);
		this.render();
	};
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
		if (this.forceTop) mode = "overhead";
		if (mode === "behind") {
			// tilt: the camera's angle above the cloth (about 17 degrees by default; dragging up / down changes it)
			var ph = Math.max(0.03, Math.min(1.45, 0.297 + (this.tilt || 0))), rad = 0.889 * z * (1 + 0.35 * Math.max(0, ph - 0.297));
			var back = rad * Math.cos(ph), high = rad * Math.sin(ph) + R, ahead = 0.55 * Math.cos(ph) * Math.cos(ph);
			out.eye.set(c0[0] - d[0] * back, high, c0[1] - d[1] * back);
			out.look.set(c0[0] + d[0] * ahead, R * 0.6, c0[1] + d[1] * ahead);
		} else if (mode === "overhead") {
			var fov = this.cam.fov * Math.PI / 180, asp = this.w / this.h;
			var span = portrait ? Math.max(W / asp, L) : Math.max(L / asp, W);
			var hgt = (span * 0.5 + 0.18) / Math.tan(fov / 2) * z + 0.1;
			out.eye.set(0, hgt, 0.0001); out.look.set(0, 0, 0);
			out.up.set(portrait ? 1 : 0, 0, portrait ? 0 : -1);
		} else if (mode === "overview") {
			var sd = I && I.shotDir ? I.shotDir : d, sc0 = I && I.shotC0 ? I.shotC0 : c0;
			var cx = sc0[0] * 0.4, cz = sc0[1] * 0.4, dist = (L * 0.62 + 0.6) * z;
			var hk = Math.max(0.15, 1 + (this.tilt || 0) * 1.6);
			out.eye.set(cx - sd[0] * dist, (L * 0.55 + 0.3) * z * hk, cz - sd[1] * dist);
			out.look.set(cx + sd[0] * 0.2, 0, cz + sd[1] * 0.2);
		} else if (mode === "side") {
			var hs = Math.max(0.12, 1 + (this.tilt || 0) * 1.8);
			out.eye.set(0, (0.9 + L * 0.15) * z * hs, (W / 2 + 1.1 + L * 0.25) * z); out.look.set(0, -0.05, 0);
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
				m.position.set(x, this.T.R + (I.zs ? I.zs[i] || 0 : 0), z); m.quaternion.copy(this.quats[i]);
			}
			// the cue stick
			if (I.cue) {
				var c = I.cue, el = Math.max(0.09, (c.el || 0) * Math.PI / 180), pull = c.pull, s0 = this.T.R + 0.006 + pull, half = 0.725;
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
		if (this.anims && this.anims.length) { var tt = performance.now() / 1000; this.anims.forEach(function (f) { f(tt); }); }
		this.renderer.render(this.scene, this.cam);
		if ((moving || (this.anims && this.anims.length && !document.hidden)) && !instant) this.render();
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

	/* ---------- the room around the table ---------- */
	function textTex(w, h, draw) { return tex(w, h, draw); }
	function std(col, rough, extra) { var o = { color: col, roughness: rough === undefined ? 0.85 : rough, metalness: 0 }; if (extra) for (var k in extra) o[k] = extra[k]; return new THREE.MeshStandardMaterial(o); }
	function box(g, w, h, d, mat, x, y, z, shadow) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; } g.add(m); return m; }
	function neonTex(text, col) {   // the canvas is as wide as the text plus room for the glow, so nothing is cut off
		var probe = document.createElement("canvas").getContext("2d"), fs = 104, pad = 70;
		probe.font = "700 " + fs + "px system-ui,sans-serif";
		var tw = Math.ceil(probe.measureText(text).width), w = tw + pad * 2, h = 200;
		var t = tex(w, h, function (c) {
			c.clearRect(0, 0, w, h);
			c.font = "700 " + fs + "px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
			c.shadowColor = col; c.shadowBlur = 28; c.fillStyle = col; c.fillText(text, w / 2, h / 2 + 4);
			c.shadowBlur = 8; c.fillStyle = "#fff"; c.fillText(text, w / 2, h / 2 + 4);
		});
		return { t: t, tw: tw, w: w, h: h };
	}
	function sign(g, text, col, w, x, y, z, ry) {   // w = width of the lettering in metres
		var n = neonTex(text, col), pw = w * n.w / n.tw, ph = pw * n.h / n.w;
		var m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: n.t, transparent: true, depthWrite: false }));
		m.position.set(x, y, z); m.rotation.y = ry || 0; g.add(m); return m;
	}
	function walls(g, X, Z, H, mat, floorMat) {
		var fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * X + 2, 2 * Z + 2), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.y = -0.89; fl.receiveShadow = true; g.add(fl);
		var y = -0.89 + H / 2;
		[[0, y, -Z, 0, 2 * X], [0, y, Z, Math.PI, 2 * X], [-X, y, 0, Math.PI / 2, 2 * Z], [X, y, 0, -Math.PI / 2, 2 * Z]].forEach(function (w) {
			var m = new THREE.Mesh(new THREE.PlaneGeometry(w[4], H), mat); m.position.set(w[0], w[1], w[2]); m.rotation.y = w[3]; m.receiveShadow = true; g.add(m);
		});
	}
	View.prototype.setRoom = function (name) {
		this.roomName = name;
		if (!this.T) return;
		var key = name + "|" + this.T.id;
		if (key === this.roomKey) { this.render(); return; }
		this.roomKey = key;
		if (this.room) { this.scene.remove(this.room); disposeTree(this.room); }
		var g = this.room = new THREE.Group(), T = this.T, X = T.L / 2 + 2.7, Z = T.W / 2 + 2.3, H = 3.1, F = -0.89, i, j, sc = this.scene;
		this.anims = [];
		var rnd = (function () { var a = 12345; return function () { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
		this.renderer.toneMappingExposure = 1.1;
		if (name === "bar") {
			sc.background = new THREE.Color("#140c08"); sc.fog = new THREE.Fog("#140c08", 7, 16);
			var brick = tex(512, 512, function (c, w, h) {
				c.fillStyle = "#3a2018"; c.fillRect(0, 0, w, h);
				for (var y = 0; y < h; y += 32) for (var x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) { var v = 70 + Math.random() * 40; c.fillStyle = "rgb(" + (v + 60) + "," + (v * 0.45) + "," + (v * 0.3) + ")"; c.fillRect(x + 2, y + 2, 60, 28); }
			});
			brick.wrapS = brick.wrapT = THREE.RepeatWrapping; brick.repeat.set(6, 3);
			var plank = tex(256, 256, function (c, w, h) { for (var y = 0; y < h; y += 32) { var v = 80 + Math.random() * 30; c.fillStyle = "rgb(" + v + "," + (v * 0.6) + "," + (v * 0.35) + ")"; c.fillRect(0, y, w, 31); c.fillStyle = "rgba(0,0,0,0.4)"; c.fillRect(0, y + 31, w, 1); } });
			plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(8, 8);
			walls(g, X, Z, H, std("#ffffff", 0.95, { map: brick }), std("#ffffff", 0.7, { map: plank }));
			// the bar counter with bottles and stools
			var wood = std("#5a2e17", 0.45), top = std("#2a1508", 0.3);
			box(g, 4.2, 1.05, 0.6, wood, 0, F + 0.525, -Z + 0.9, true); box(g, 4.4, 0.06, 0.75, top, 0, F + 1.08, -Z + 0.85, true);
			box(g, 4.2, 0.04, 0.3, wood, 0, F + 1.75, -Z + 0.18); box(g, 4.2, 0.04, 0.3, wood, 0, F + 2.15, -Z + 0.18);
			var cols = ["#2f7d32", "#8a5a14", "#b71c1c", "#e0e0e0", "#1565c0", "#f9a825"];
			for (i = 0; i < 26; i++) {
				var bx = -1.95 + i * 0.155, shelf = i % 2 ? 1.77 : 2.17, bh = 0.22 + rnd() * 0.1;
				var bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, bh, 12), std(cols[i % cols.length], 0.15, { transparent: true, opacity: 0.85 }));
				bottle.position.set(bx, F + shelf + bh / 2, -Z + 0.2); g.add(bottle);
			}
			for (i = 0; i < 5; i++) {
				var sx = -1.6 + i * 0.8, seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 20), std("#7a1c1c", 0.5));
				seat.position.set(sx, F + 0.78, -Z + 1.5); g.add(seat);
				var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8), std("#888", 0.3, { metalness: 0.8 })); leg.position.set(sx, F + 0.39, -Z + 1.5); g.add(leg);
			}
			sign(g, "POOL", "#ff3d8b", 1.4, -X + 0.02, F + 2.2, 0.0, Math.PI / 2);
			sign(g, "BAR", "#29b6f6", 1.0, 1.6, F + 2.6, -Z + 0.03, 0);
			sign(g, "OPEN", "#ffd54f", 1.0, X - 0.02, F + 2.2, 0, -Math.PI / 2);
			// a dartboard and a jukebox
			var db = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 32), std("#ffffff", 0.8, { map: tex(256, 256, function (c, w, h) {
				for (var r = 8; r > 0; r--) { c.fillStyle = r % 2 ? "#1b1b1b" : "#e8dcc0"; c.beginPath(); c.arc(128, 128, r * 15, 0, 7); c.fill(); }
				for (var a = 0; a < 20; a++) { c.fillStyle = a % 2 ? "rgba(200,30,30,0.85)" : "rgba(30,140,60,0.85)"; c.beginPath(); c.arc(128, 128, 120, a * Math.PI / 10, (a + 0.5) * Math.PI / 10); c.arc(128, 128, 105, (a + 0.5) * Math.PI / 10, a * Math.PI / 10, true); c.fill(); }
				c.fillStyle = "#c62828"; c.beginPath(); c.arc(128, 128, 8, 0, 7); c.fill();
			}) }));
			db.rotation.x = Math.PI / 2; db.position.set(-1.8, F + 1.75, Z - 0.03); db.rotation.z = Math.PI; g.add(db);
			var jb = box(g, 0.7, 1.4, 0.45, std("#4a148c", 0.4, { emissive: "#7b1fa2", emissiveIntensity: 0.35 }), 1.9, F + 0.7, Z - 0.4, true);
			jb.rotation.y = Math.PI;
			var warm = new THREE.PointLight("#ffb36b", 2.2, 9, 1.2); warm.position.set(0, F + 2.6, -Z + 1.2); g.add(warm);
			var pink = new THREE.PointLight("#ff3d8b", 1.2, 5, 1.5); pink.position.set(-X + 0.5, F + 2.2, 0); g.add(pink);
		} else if (name === "tournament") {
			sc.background = new THREE.Color("#04060c"); sc.fog = new THREE.Fog("#04060c", 8, 22);
			X += 1.5; Z += 2.2;
			walls(g, X, Z, H + 2, std("#0b0f1a", 0.9), std("#101010", 0.6));
			var carpet = new THREE.Mesh(new THREE.PlaneGeometry(T.L + 3, T.W + 3), std("#1a237e", 0.95)); carpet.rotation.x = -Math.PI / 2; carpet.position.y = F + 0.002; carpet.receiveShadow = true; g.add(carpet);
			// tiered seats with a crowd on both long sides
			var seatMat = std("#20263a", 0.8), crowd = [], tones = ["#f1c27d", "#c68642", "#8d5524", "#ffdbac", "#e0ac69"], shirts = ["#e53935", "#1e88e5", "#fdd835", "#43a047", "#ffffff", "#8e24aa", "#212121", "#fb8c00"];
			[-1, 1].forEach(function (side) {
				for (var r = 0; r < 5; r++) {
					var zz = side * (T.W / 2 + 2.4 + r * 0.6), yy = F + 0.2 + r * 0.38;
					box(g, T.L + 3.4, 0.35, 0.55, seatMat, 0, yy, zz);
					for (var s2 = 0; s2 < 26; s2++) if (rnd() < 0.62) crowd.push([-(T.L + 3) / 2 + s2 * (T.L + 3) / 25 + (rnd() - 0.5) * 0.08, yy + 0.4, zz, r]);
				}
			});
			var bodyGeo = new THREE.CapsuleGeometry(0.11, 0.2, 4, 8), headGeo = new THREE.SphereGeometry(0.085, 10, 8);
			var bodies = new THREE.InstancedMesh(bodyGeo, std("#ffffff", 0.9), crowd.length), heads = new THREE.InstancedMesh(headGeo, std("#ffffff", 0.7), crowd.length);
			var mtx = new THREE.Matrix4(), col = new THREE.Color();
			crowd.forEach(function (p, k) {
				mtx.makeTranslation(p[0], p[1], p[2]); bodies.setMatrixAt(k, mtx); bodies.setColorAt(k, col.set(shirts[Math.floor(rnd() * shirts.length)]));
				mtx.makeTranslation(p[0], p[1] + 0.27, p[2]); heads.setMatrixAt(k, mtx); heads.setColorAt(k, col.set(tones[Math.floor(rnd() * tones.length)]));
			});
			g.add(bodies); g.add(heads);
			// the light rig over the table and a big screen
			var rig = box(g, T.L + 0.6, 0.08, T.W + 0.5, std("#111", 0.5, { metalness: 0.6 }), 0, 1.35, 0);
			var panel = new THREE.Mesh(new THREE.PlaneGeometry(T.L + 0.4, T.W + 0.3), new THREE.MeshBasicMaterial({ color: "#ffffff" })); panel.rotation.x = Math.PI / 2; panel.position.set(0, 1.305, 0); g.add(panel);
			void rig;
			var screen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: textTex(1024, 320, function (c, w, h) {
				var gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#0d47a1"); gr.addColorStop(1, "#1565c0"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
				c.fillStyle = "#fff"; c.font = "800 120px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("THE OPEN", w / 2, h * 0.42);
				c.font = "600 54px system-ui,sans-serif"; c.fillStyle = "#ffd54f"; c.fillText(T.id === "snooker" ? "SNOOKER CHAMPIONSHIP" : "POOL CHAMPIONSHIP", w / 2, h * 0.8);
			}) }));
			screen.position.set(-X + 0.03, F + 2.9, 0); screen.rotation.y = Math.PI / 2; g.add(screen);
			var scr2 = screen.clone(); scr2.position.set(X - 0.03, F + 2.9, 0); scr2.rotation.y = -Math.PI / 2; g.add(scr2);
			var fill = new THREE.PointLight("#dfe8ff", 1.4, 10, 1.2); fill.position.set(0, 1.2, 0); g.add(fill);
			this.renderer.toneMappingExposure = 1.2;
		} else if (name === "home") {
			sc.background = new THREE.Color("#2a2420"); sc.fog = null;
			var wall = std("#d9cbb4", 0.95), parquet = tex(256, 256, function (c, w, h) { for (var y = 0; y < h; y += 16) for (var x = (y / 16 % 2) * 32; x < w + 64; x += 64) { var v = 150 + Math.random() * 40; c.fillStyle = "rgb(" + v + "," + (v * 0.72) + "," + (v * 0.45) + ")"; c.fillRect(x, y, 63, 15); } });
			parquet.wrapS = parquet.wrapT = THREE.RepeatWrapping; parquet.repeat.set(6, 6);
			walls(g, X, Z, H, wall, std("#ffffff", 0.6, { map: parquet }));
			var rug = new THREE.Mesh(new THREE.PlaneGeometry(T.L + 1.6, T.W + 1.4), std("#ffffff", 1, { map: tex(256, 256, function (c, w, h) { c.fillStyle = "#7b2d26"; c.fillRect(0, 0, w, h); c.strokeStyle = "#e2c08d"; c.lineWidth = 8; c.strokeRect(14, 14, w - 28, h - 28); c.lineWidth = 3; c.strokeRect(34, 34, w - 68, h - 68); }) }));
			rug.rotation.x = -Math.PI / 2; rug.position.y = F + 0.003; rug.receiveShadow = true; g.add(rug);
			// a window with sky, a sofa, a bookshelf, a plant and a picture
			var win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshBasicMaterial({ map: tex(256, 170, function (c, w, h) {
				var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#5fa8e6"); gr.addColorStop(1, "#cfe7f7"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
				c.fillStyle = "rgba(255,255,255,0.9)"; [[60, 50, 22], [80, 46, 26], [100, 52, 20], [190, 80, 18], [206, 76, 22]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], p[2], 0, 7); c.fill(); });
				c.fillStyle = "#4c8c3a"; c.fillRect(0, h * 0.82, w, h);
				c.strokeStyle = "#f5f0e6"; c.lineWidth = 8; c.strokeRect(0, 0, w, h); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
			}) }));
			win.position.set(1.3, F + 1.45, -Z + 0.02); g.add(win);
			var sofa = std("#3e5c76", 0.9);
			box(g, 2.2, 0.45, 0.85, sofa, -1.2, F + 0.32, -Z + 0.6, true); box(g, 2.2, 0.55, 0.22, sofa, -1.2, F + 0.75, -Z + 0.15, true);
			box(g, 0.22, 0.6, 0.85, sofa, -2.38, F + 0.45, -Z + 0.6, true); box(g, 0.22, 0.6, 0.85, sofa, -0.02, F + 0.45, -Z + 0.6, true);
			[[-1.75, -Z + 0.55], [-0.65, -Z + 0.55]].forEach(function (p) { var cu = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.15), std("#e6b655", 0.9)); cu.position.set(p[0], F + 0.75, p[1]); cu.rotation.x = -0.25; g.add(cu); });
			var lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8), std("#333", 0.4, { metalness: 0.7 })); lampPole.position.set(0.4, F + 0.8, -Z + 0.4); g.add(lampPole);
			var lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 20, 1, true), std("#f3e1c0", 0.9, { emissive: "#ffcf8a", emissiveIntensity: 0.5, side: THREE.DoubleSide })); lampShade.position.set(0.4, F + 1.65, -Z + 0.4); g.add(lampShade);
			var shelf = std("#6d4c33", 0.6);
			box(g, 0.35, 2.1, 1.6, shelf, -X + 0.2, F + 1.05, -0.4, true);
			var bookCols = ["#b71c1c", "#1a237e", "#1b5e20", "#f9a825", "#4a148c", "#e65100", "#263238"];
			for (j = 0; j < 4; j++) for (i = 0; i < 12; i++) { var bh2 = 0.22 + rnd() * 0.08; box(g, 0.25, bh2, 0.09, std(bookCols[(i + j) % bookCols.length], 0.8), -X + 0.24, F + 0.3 + j * 0.48 + bh2 / 2, -1.1 + i * 0.115); }
			var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 16), std("#c0603a", 0.7)); pot.position.set(X - 0.5, F + 0.2, -Z + 0.5); g.add(pot);
			for (i = 0; i < 9; i++) { var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18 + rnd() * 0.1, 10, 8), std("#2e7d32", 0.8)); leaf.position.set(X - 0.5 + (rnd() - 0.5) * 0.4, F + 0.6 + rnd() * 0.7, -Z + 0.5 + (rnd() - 0.5) * 0.4); g.add(leaf); }
			var pic = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshBasicMaterial({ map: tex(200, 140, function (c, w, h) {
				c.fillStyle = "#3b2a1a"; c.fillRect(0, 0, w, h); var gr = c.createLinearGradient(0, 10, 0, h - 10); gr.addColorStop(0, "#f6a04d"); gr.addColorStop(1, "#7a3c8c"); c.fillStyle = gr; c.fillRect(10, 10, w - 20, h - 20);
				c.fillStyle = "#2b1d3a"; c.beginPath(); c.moveTo(10, h - 10); c.lineTo(70, 60); c.lineTo(120, 100); c.lineTo(160, 50); c.lineTo(w - 10, h - 10); c.fill();
				c.fillStyle = "#fff3c4"; c.beginPath(); c.arc(140, 40, 14, 0, 7); c.fill();
			}) }));
			pic.position.set(X - 0.02, F + 1.8, 0.3); pic.rotation.y = -Math.PI / 2; g.add(pic);
			var sun = new THREE.PointLight("#fff1dc", 1.6, 9, 1.2); sun.position.set(0.6, F + 2.2, -Z + 0.8); g.add(sun);
			this.renderer.toneMappingExposure = 1.15;
		} else if (name === "screens") {
			// a wall of video-call screens with fans watching, like the 2020 "virtual fans" games
			sc.background = new THREE.Color("#05070d"); sc.fog = new THREE.Fog("#05070d", 9, 20);
			X += 0.6; Z += 0.8;
			walls(g, X, Z, H + 0.6, std("#0a0d16", 0.9), std("#121212", 0.5));
			var skins = ["#f1c27d", "#c68642", "#8d5524", "#ffdbac", "#e0ac69", "#5c3a21"], hairs = ["#2b1b10", "#000000", "#7a4b1c", "#d9b25a", "#b3471e", "#888888"];
			var bgs = ["#3f51b5", "#00897b", "#6d4c41", "#455a64", "#8e24aa", "#c0ca33", "#1e88e5", "#5d4037", "#37474f", "#ad1457", "#2e7d32", "#ef6c00"];
			var shirts2 = ["#e53935", "#1e88e5", "#fdd835", "#43a047", "#ffffff", "#8e24aa", "#212121", "#fb8c00", "#00acc1"];
			var names = ["Sam", "Alex", "Jo", "Kim", "Lee", "Pat", "Max", "Ana", "Tom", "Mia", "Raj", "Zoe", "Ben", "Ivy", "Leo", "Ava"];
			function face(k, cheer) {
				var r = (function () { var a = k * 7919 + 17; return function () { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
				var bg = bgs[k % bgs.length], skin = skins[Math.floor(r() * skins.length)], hair = hairs[Math.floor(r() * hairs.length)], shirt = shirts2[Math.floor(r() * shirts2.length)], nm = names[k % names.length];
				return tex(256, 160, function (c, w, h) {
					var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg); gr.addColorStop(1, "#111"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
					c.fillStyle = "rgba(255,255,255,0.12)"; c.fillRect(20, 20, 60, 40); c.fillRect(180, 30, 50, 70);    // something on the wall behind them
					c.fillStyle = shirt; c.beginPath(); c.ellipse(128, 168, 70, 50, 0, 0, 7); c.fill();
					if (cheer) { c.strokeStyle = skin; c.lineWidth = 16; c.lineCap = "round"; c.beginPath(); c.moveTo(70, 130); c.lineTo(45, 40); c.moveTo(186, 130); c.lineTo(211, 40); c.stroke(); }
					c.fillStyle = skin; c.beginPath(); c.arc(128, 82, 36, 0, 7); c.fill();
					c.fillStyle = hair; c.beginPath(); c.arc(128, 72, 37, Math.PI, 0); c.fill();
					c.fillStyle = "#111"; c.beginPath(); c.arc(116, 82, 4, 0, 7); c.arc(140, 82, 4, 0, 7); c.fill();
					c.strokeStyle = "#5a1a1a"; c.lineWidth = 3; c.beginPath();
					if (cheer) { c.fillStyle = "#5a1a1a"; c.ellipse(128, 100, 9, 8, 0, 0, 7); c.fill(); } else { c.arc(128, 94, 10, 0.2, Math.PI - 0.2); c.stroke(); }
					c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(6, h - 26, 70, 20); c.fillStyle = "#fff"; c.font = "600 14px system-ui,sans-serif"; c.textBaseline = "middle"; c.fillText(nm, 12, h - 16);
					c.strokeStyle = cheer ? "#4caf50" : "rgba(0,0,0,0)"; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);    // the "speaking" frame
				});
			}
			var NF = 16, calm = [], loud = [];
			for (i = 0; i < NF; i++) { calm.push(face(i, false)); loud.push(face(i, true)); }
			var frameMat = std("#050505", 0.4, { metalness: 0.3 }), scr = [], sw = 0.62, sh = 0.39, gap = 0.06;
			function wallOf(len, place) {
				var cols = Math.floor((len - 0.4) / (sw + gap)), rows = 4;
				for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) {
					var u = (c2 - (cols - 1) / 2) * (sw + gap), y = F + 0.75 + r2 * (sh + gap);
					var k = Math.floor(rnd() * NF), m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: calm[k] }));
					place(m, u, y); g.add(m); scr.push({ m: m, k: k, t: 0 });
				}
			}
			wallOf(2 * X, function (m, u, y) { m.position.set(u, y, -Z + 0.03); });
			wallOf(2 * X, function (m, u, y) { m.position.set(u, y, Z - 0.03); m.rotation.y = Math.PI; });
			wallOf(2 * Z, function (m, u, y) { m.position.set(-X + 0.03, y, u); m.rotation.y = Math.PI / 2; });
			wallOf(2 * Z, function (m, u, y) { m.position.set(X - 0.03, y, u); m.rotation.y = -Math.PI / 2; });
			// a dark frame behind each wall of screens
			box(g, 2 * X - 0.2, 4 * (sh + gap) + 0.1, 0.02, frameMat, 0, F + 0.75 + 1.5 * (sh + gap), -Z + 0.015);
			var last = 0;
			this.anims.push(function (t) {    // every so often a few fans cheer (and stop again)
				if (t - last < 0.6) return; last = t;
				scr.forEach(function (o) {
					if (o.t && t > o.t) { o.m.material.map = calm[o.k]; o.t = 0; }
					else if (!o.t && Math.random() < 0.035) { o.m.material.map = loud[o.k]; o.t = t + 1 + Math.random() * 2; }
				});
			});
			sign(g, "LIVE", "#ff1744", 0.8, -X + 0.4, F + 0.45, -Z + 0.05, 0);
			var cool = new THREE.PointLight("#9fc3ff", 1.3, 9, 1.2); cool.position.set(0, F + 2.4, 0); g.add(cool);
			this.renderer.toneMappingExposure = 1.15;
		} else if (name === "party") {
			// a night club: glowing dance floor, moving beams, lasers, a DJ booth, a dancing crowd and a disco ball
			sc.background = new THREE.Color("#05020c"); sc.fog = new THREE.Fog("#05020c", 7, 17);
			walls(g, X, Z, H, std("#1b1030", 0.7), std("#0d0a14", 0.35, { metalness: 0.3 }));
			var self = this, tileCols = ["#ff2d95", "#00e5ff", "#ffea00", "#7c4dff", "#00e676", "#ff6d00"];
			// LED dance floor around the table (tiles change colour)
			var tiles2 = [], ts = 0.5, nx = Math.ceil((2 * X - 0.6) / ts), nz = Math.ceil((2 * Z - 0.6) / ts);
			for (i = 0; i < nx; i++) for (j = 0; j < nz; j++) {
				var tx = -X + 0.3 + ts / 2 + i * ts, tz = -Z + 0.3 + ts / 2 + j * ts;
				if (Math.abs(tx) < T.L / 2 + 0.35 && Math.abs(tz) < T.W / 2 + 0.35) continue;    // not under the table
				var tm = new THREE.Mesh(new THREE.PlaneGeometry(ts - 0.03, ts - 0.03), new THREE.MeshBasicMaterial({ color: tileCols[(i + j) % 6], transparent: true, opacity: 0.55 }));
				tm.rotation.x = -Math.PI / 2; tm.position.set(tx, F + 0.004, tz); g.add(tm); tiles2.push({ m: tm, i: i, j: j });
			}
			var lastT = 0;
			this.anims.push(function (t) {
				if (t - lastT < 0.45) return; lastT = t;
				var step = Math.floor(t / 0.45);
				tiles2.forEach(function (o) { o.m.material.color.set(tileCols[(o.i + o.j + step) % 6]); o.m.material.opacity = 0.3 + 0.45 * (((o.i * 7 + o.j * 3 + step) % 4) / 3); });
			});
			// beams of light from the ceiling (see-through cones) that swing
			var beams = [];
			for (i = 0; i < 6; i++) {
				var bcol = tileCols[i % 6];
				var cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: bcol, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
				var pivot = new THREE.Group(); pivot.position.set((i - 2.5) * (2 * X - 1) / 5, F + H - 0.1, (i % 2 ? -1 : 1) * (Z - 1.2));
				cone.position.y = -1.6; pivot.add(cone); g.add(pivot);
				var lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 12), std("#222", 0.4, { metalness: 0.7 })); pivot.add(lamp);
				beams.push({ p: pivot, k: i });
			}
			this.anims.push(function (t) { beams.forEach(function (b) { b.p.rotation.z = Math.sin(t * 0.9 + b.k) * 0.6; b.p.rotation.x = Math.cos(t * 0.7 + b.k * 1.3) * 0.5; }); });
			// lasers across the room
			var lasers = [];
			for (i = 0; i < 5; i++) {
				var lz = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2 * X, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? "#00ff88" : "#ff1744", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
				lz.rotation.z = Math.PI / 2; lz.position.set(0, F + 2.3 + i * 0.12, -Z + 1 + i * 0.2); g.add(lz); lasers.push(lz);
			}
			this.anims.push(function (t) { lasers.forEach(function (l, k) { l.rotation.y = Math.sin(t * 0.6 + k) * 0.35; l.visible = Math.sin(t * 3 + k * 2) > -0.3; }); });
			// the DJ booth with a screen
			box(g, 2.4, 1.0, 0.7, std("#111", 0.3, { metalness: 0.5 }), 0, F + 0.5, -Z + 0.6, true);
			var dj = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.35), new THREE.MeshBasicMaterial({ map: tex(512, 80, function (c, w, h) { var gr = c.createLinearGradient(0, 0, w, 0); tileCols.forEach(function (cc, k) { gr.addColorStop(k / 5, cc); }); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = "#000"; c.font = "800 50px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("DJ BOOTH", w / 2, h / 2 + 2); }) }));
			dj.position.set(0, F + 0.7, -Z + 0.96); g.add(dj);
			var djbody = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.45, 4, 8), std("#222", 0.8)); djbody.position.set(0, F + 1.25, -Z + 0.35); g.add(djbody);
			var djhead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), std("#c68642", 0.7)); djhead.position.set(0, F + 1.65, -Z + 0.35); g.add(djhead);
			this.anims.push(function (t) { djhead.position.y = F + 1.65 + Math.abs(Math.sin(t * 4)) * 0.05; });
			// a dancing crowd along the walls
			var dancers = [], dshirts = ["#ff2d95", "#00e5ff", "#ffea00", "#ffffff", "#7c4dff", "#00e676", "#212121", "#ff6d00"], dskins = ["#f1c27d", "#c68642", "#8d5524", "#ffdbac", "#e0ac69"];
			for (i = 0; i < 46; i++) {
				var side = i % 4, u = rnd() * 2 - 1, px, pz;
				if (side < 2) { px = u * (X - 0.6); pz = (side ? 1 : -1) * (Z - 0.5 - rnd() * 0.7); if (!side && Math.abs(px) < 1.4) continue; }
				else { px = (side === 2 ? -1 : 1) * (X - 0.5 - rnd() * 0.7); pz = u * (Z - 0.6); }
				dancers.push([px, pz, rnd() * 6, dshirts[i % dshirts.length], dskins[i % dskins.length]]);
			}
			var dB = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.55, 4, 8), std("#ffffff", 0.8), dancers.length), dH = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 10, 8), std("#ffffff", 0.7), dancers.length);
			var m4 = new THREE.Matrix4(), c4 = new THREE.Color();
			dancers.forEach(function (d0, k) { dB.setColorAt(k, c4.set(d0[3])); dH.setColorAt(k, c4.set(d0[4])); });
			g.add(dB); g.add(dH);
			this.anims.push(function (t) {
				dancers.forEach(function (d0, k) {
					var hop = Math.abs(Math.sin(t * 4.2 + d0[2])) * 0.12, sw = Math.sin(t * 2.1 + d0[2]) * 0.06;
					m4.makeTranslation(d0[0] + sw, F + 0.45 + hop, d0[1]); dB.setMatrixAt(k, m4);
					m4.makeTranslation(d0[0] + sw * 1.4, F + 0.98 + hop, d0[1]); dH.setMatrixAt(k, m4);
				});
				dB.instanceMatrix.needsUpdate = true; dH.instanceMatrix.needsUpdate = true;
			});
			// the disco ball with sparkles
			var tiles3 = tex(256, 128, function (c, w, h) { for (var y = 0; y < h; y += 8) for (var x = 0; x < w; x += 8) { var v = 120 + Math.random() * 135; c.fillStyle = "rgb(" + v + "," + v + "," + v + ")"; c.fillRect(x, y, 7, 7); } });
			var disco = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 20), std("#ffffff", 0.12, { map: tiles3, metalness: 1, emissive: "#333333" }));
			disco.position.set(0, F + H - 0.6, 0); g.add(disco);
			this.anims.push(function (t) { disco.rotation.y = t * 0.8; });
			// coloured lights that move
			["#ff2d95", "#00e5ff", "#ffea00", "#7c4dff"].forEach(function (cl, k) {
				var pl = new THREE.PointLight(cl, 2.6, 7, 1.3); g.add(pl);
				self.anims.push(function (t) { var a = t * (0.5 + k * 0.17) + k * 1.57; pl.position.set(Math.cos(a) * (T.L / 2 + 0.8), 1.2 + Math.sin(t * 1.3 + k) * 0.3, Math.sin(a) * (T.W / 2 + 0.7)); });
			});
			sign(g, "PARTY!", "#ff2d95", 1.4, 0, F + 2.35, Z - 0.03, Math.PI);
			sign(g, "LET'S PLAY", "#00e5ff", 2.0, X - 0.03, F + 2.0, 0, -Math.PI / 2);
			sign(g, "DANCE", "#ffea00", 1.4, -X + 0.03, F + 2.0, 0, Math.PI / 2);
			this.renderer.toneMappingExposure = 1.2;
		} else if (name === "stadium") {
			// a big stadium at night: bleachers all around full of fans, floodlights and a big screen over the table
			sc.background = new THREE.Color("#030612"); sc.fog = new THREE.Fog("#030612", 18, 60);
			var self2 = this, R0 = Math.max(T.L, T.W) / 2 + 6.5, rows = 22, rowH = 0.45, rowD = 0.8, ell = 1.35;
			var turf = new THREE.Mesh(new THREE.CircleGeometry(R0 * ell + 1, 64), std("#1b5e20", 0.95, { map: tex(256, 256, function (c, w, h) { for (var k2 = 0; k2 < 8; k2++) { c.fillStyle = k2 % 2 ? "#236b26" : "#1d5e21"; c.fillRect(0, k2 * h / 8, w, h / 8); } }) }));
			turf.rotation.x = -Math.PI / 2; turf.scale.set(1, 1 / ell, 1); turf.position.y = F; turf.receiveShadow = true; g.add(turf);
			var stage = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(T.L, T.W) / 2 + 1.2, Math.max(T.L, T.W) / 2 + 1.3, 0.1, 48), std("#0d1b3d", 0.6));
			stage.scale.set(1, 1, 0.62); stage.position.y = F + 0.05; stage.receiveShadow = true; g.add(stage);
			// the stands: rings of steps (an ellipse), each with a row of fans
			var standMat = std("#2a3142", 0.8), fans = [], fshirts = ["#e53935", "#1e88e5", "#fdd835", "#43a047", "#ffffff", "#8e24aa", "#fb8c00", "#00acc1", "#212121"], fskins = ["#f1c27d", "#c68642", "#8d5524", "#ffdbac", "#e0ac69"];
			for (var r3 = 0; r3 < rows; r3++) {
				var rad3 = R0 + r3 * rowD, y3 = F + 0.3 + r3 * rowH;
				var ring = new THREE.Mesh(new THREE.CylinderGeometry(rad3 + rowD, rad3 + rowD, rowH, 72, 1, true), standMat);
				ring.scale.set(ell, 1, 1); ring.position.y = y3 - rowH / 2; g.add(ring);
				var stepTop = new THREE.Mesh(new THREE.RingGeometry(rad3, rad3 + rowD, 72), standMat); stepTop.rotation.x = -Math.PI / 2; stepTop.scale.set(ell, 1, 1); stepTop.position.y = y3; g.add(stepTop);
				var nSeat = Math.floor(2 * Math.PI * rad3 * 1.15 / 0.55);
				for (var q2 = 0; q2 < nSeat; q2++) {
					var ang = q2 / nSeat * Math.PI * 2;
					if (Math.abs(Math.sin(ang)) < 0.12 && Math.cos(ang) > 0 && r3 < 6) continue;       // a tunnel on one side
					if (rnd() < 0.12) continue;
					fans.push([Math.cos(ang) * (rad3 + rowD * 0.45) * ell, y3, Math.sin(ang) * (rad3 + rowD * 0.45), ang, fshirts[Math.floor(rnd() * fshirts.length)], fskins[Math.floor(rnd() * fskins.length)]]);
				}
			}
			var fB = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.15, 0.3, 3, 6), std("#ffffff", 0.9), fans.length), fH = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), std("#ffffff", 0.8), fans.length);
			var m5 = new THREE.Matrix4(), c5 = new THREE.Color();
			fans.forEach(function (f0, k) { fB.setColorAt(k, c5.set(f0[4])); fH.setColorAt(k, c5.set(f0[5])); m5.makeTranslation(f0[0], f0[1] + 0.3, f0[2]); fB.setMatrixAt(k, m5); m5.makeTranslation(f0[0], f0[1] + 0.62, f0[2]); fH.setMatrixAt(k, m5); });
			g.add(fB); g.add(fH);
			// a Mexican wave goes round now and then
			var lastW = 0;
			this.anims.push(function (t) {
				if (t - lastW < 0.05) return; lastW = t;
				var front = (t * 0.9) % (Math.PI * 2);
				fans.forEach(function (f0, k) {
					var dA = Math.abs(((f0[3] - front + Math.PI * 3) % (Math.PI * 2)) - Math.PI), up = dA < 0.35 ? (0.35 - dA) / 0.35 * 0.35 : 0;
					m5.makeTranslation(f0[0], f0[1] + 0.3 + up, f0[2]); fB.setMatrixAt(k, m5);
					m5.makeTranslation(f0[0], f0[1] + 0.62 + up, f0[2]); fH.setMatrixAt(k, m5);
				});
				fB.instanceMatrix.needsUpdate = true; fH.instanceMatrix.needsUpdate = true;
			});
			// floodlight towers
			var topR = R0 + rows * rowD + 1.2, topY = F + rows * rowH + 5;
			for (i = 0; i < 4; i++) {
				var fa = Math.PI / 4 + i * Math.PI / 2, fx = Math.cos(fa) * topR * ell, fz = Math.sin(fa) * topR;
				var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, topY - F, 8), std("#555", 0.5, { metalness: 0.6 })); pole.position.set(fx, (topY + F) / 2, fz); g.add(pole);
				var head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.3), new THREE.MeshBasicMaterial({ color: "#fffbe6" })); head.position.set(fx, topY, fz); head.lookAt(0, 0, 0); g.add(head);
				var spot = new THREE.SpotLight("#fff6e0", 60, 60, 0.35, 0.5, 1.2); spot.position.set(fx, topY, fz); spot.target.position.set(0, 0, 0); g.add(spot); g.add(spot.target);
			}
			// the big screen hanging over the table (four sides)
			var jt = tex(1024, 512, function (c, w, h) {
				var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0d47a1"); gr.addColorStop(1, "#002171"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
				c.fillStyle = "#fff"; c.font = "800 130px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("LIVE", w / 2, h * 0.32);
				c.fillStyle = "#ffd54f"; c.font = "700 96px system-ui,sans-serif"; c.fillText(T.id === "snooker" ? "SNOOKER" : "BILLIARDS", w / 2, h * 0.62);
				c.fillStyle = "#90caf9"; c.font = "600 46px system-ui,sans-serif"; c.fillText("WORLD FINAL", w / 2, h * 0.86);
			});
			var cube = new THREE.Group(); cube.position.set(0, F + 7.5, 0); cube.scale.set(1.6, 1.6, 1.6); g.add(cube);
			for (i = 0; i < 4; i++) { var face2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: jt })); var fa2 = i * Math.PI / 2; face2.position.set(Math.sin(fa2) * 1.2, 0, Math.cos(fa2) * 1.2); face2.rotation.y = fa2; cube.add(face2); }
			box(cube, 2.44, 1.24, 2.44, std("#111", 0.5), 0, 0, 0);
			this.anims.push(function (t) { cube.rotation.y = t * 0.15; });
			// ad boards round the stage
			var ads = ["WORLD FINAL", "MES.FM", "BREAK & RUN", "GOOD LUCK!"];
			for (i = 0; i < 8; i++) {
				var aa = (i + 0.5) / 8 * Math.PI * 2, ar = R0 - 0.6;
				var txt = ads[i % ads.length], pr = document.createElement("canvas").getContext("2d"); pr.font = "800 52px system-ui,sans-serif";
				var bw = Math.ceil(pr.measureText(txt).width) + 60, bh = 100;
				var bt = tex(bw, bh, function (c, w, h) { c.fillStyle = "#111"; c.fillRect(0, 0, w, h); c.fillStyle = "#4fc3f7"; c.font = "800 52px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, w / 2, h / 2 + 2); });
				var board = new THREE.Mesh(new THREE.PlaneGeometry(0.6 * bw / bh, 0.6), new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide }));
				board.position.set(Math.cos(aa) * ar * ell, F + 0.32, Math.sin(aa) * ar); board.lookAt(0, F + 0.32, 0); g.add(board);
			}
			this.renderer.toneMappingExposure = 1.15;
		} else {
			sc.background = new THREE.Color("#0c120f"); sc.fog = new THREE.Fog("#0c120f", 6, 14);
			var fl = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), std("#2a211b", 0.9)); fl.rotation.x = -Math.PI / 2; fl.position.y = F; fl.receiveShadow = true; g.add(fl);
		}
		this.scene.add(g);
		this.render();
	};
	View.prototype.resetRoll = function () { for (var i = 0; i < this.prev.length; i++) this.prev[i] = null; };

	window.BL3D = { create: create, load: load };
})();
