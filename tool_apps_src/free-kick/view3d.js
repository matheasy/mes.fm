/* MES Free Kicks & Penalties: the 3D view (window.FK3D). Only drawing: positions come from lib.js / app.js exactly as in 2D.
   three.js 0.170.0 from jsDelivr (unpkg fallback), loaded the first time 3D is shown.
   Coordinates: three X = pitch x, three Y = height z, three Z = pitch y (out from the goal line toward the kicker).
   API: FK3D.create(el) -> Promise<view>; view.size(w, h); view.frame(info); view.pickGoal(clientX, clientY) -> {x, z} | null; view.hover(). */
(function () {
	"use strict";
	if (typeof window === "undefined") return;
	var THREE = null, loading = null;
	var URLS = ["https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "https://unpkg.com/three@0.170.0/build/three.module.min.js"];
	function load() {
		if (THREE) return Promise.resolve(THREE);
		if (loading) return loading;
		var imp = new Function("u", "return import(u)");
		loading = imp(URLS[0]).catch(function () { return imp(URLS[1]); }).then(function (m) { THREE = m; return m; }, function (e) { loading = null; throw e; });
		return loading;
	}
	var IMG = "/free-kick/img/";
	function canvasTex(w, h, draw) { var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

	function create(el) {
		return load().then(function () {
			var t = document.createElement("canvas");
			if (!(t.getContext("webgl2") || t.getContext("webgl"))) throw new Error("WebGL is switched off in this browser");
			return new View(el);
		});
	}
	function View(el) {
		var G = window.MESFreeKick.G, self = this;
		this.el = el; this.G = G;
		var R = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
		R.domElement.className = "fk-cv3";
		R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
		el.appendChild(R.domElement);
		var sc = this.scene = new THREE.Scene();
		sc.background = new THREE.Color("#8fc3ea");
		sc.fog = new THREE.Fog("#a9cfe9", 70, 170);
		this.cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 400);
		this.eye = new THREE.Vector3(0, 1.8, 25); this.look = new THREE.Vector3(0, 1.2, 0);
		this.hemi = new THREE.HemisphereLight("#eef6ff", "#2d5a2a", 1.1); sc.add(this.hemi);
		var sun = this.sun = new THREE.DirectionalLight("#fff4dc", 1.7); sun.position.set(-18, 34, 26); sun.target.position.set(0, 0, 12); sc.add(sun); sc.add(sun.target);
		sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
		var scam = sun.shadow.camera; scam.left = -26; scam.right = 26; scam.top = 30; scam.bottom = -22; scam.near = 5; scam.far = 90;
		this.ray = new THREE.Raycaster();
		// grass with the markings painted in (x -60..60, y -20..100 -> canvas)
		var gTex = canvasTex(2048, 2048, function (c, w, h) {
			var X = function (x) { return (x + 60) / 120 * w; }, Y = function (y) { return (y + 20) / 120 * h; }, px = w / 120;
			for (var y = -20; y < 100; y += 5) { c.fillStyle = Math.round((y + 20) / 5) % 2 ? "#3d9a49" : "#48a855"; c.fillRect(0, Y(y), w, 5 * px + 1); }
			var img = c.getImageData(0, 0, w, h), d = img.data;
			for (var i = 0; i < d.length; i += 4) { var n = (Math.random() - 0.5) * 16; d[i] += n * 0.6; d[i + 1] += n; d[i + 2] += n * 0.5; }
			c.putImageData(img, 0, 0);
			c.strokeStyle = "rgba(255,255,255,0.92)"; c.lineWidth = 0.12 * px;
			c.beginPath(); c.moveTo(X(-34), Y(0)); c.lineTo(X(34), Y(0)); c.stroke();
			c.strokeRect(X(-G.boxX), Y(0), G.boxX * 2 * px, G.boxY * px);
			c.strokeRect(X(-G.sixX), Y(0), G.sixX * 2 * px, G.sixY * px);
			c.beginPath(); c.moveTo(X(-34), Y(0)); c.lineTo(X(-34), Y(100)); c.moveTo(X(34), Y(0)); c.lineTo(X(34), Y(100)); c.stroke();
			c.beginPath(); c.arc(X(0), Y(G.penY), G.arcR * px, 0.205 * Math.PI, 0.795 * Math.PI); c.stroke();
			c.fillStyle = "#fff"; c.beginPath(); c.arc(X(0), Y(G.penY), 0.13 * px, 0, 7); c.fill();
			c.beginPath(); c.arc(X(0), Y(52.5), 9.15 * px, 0, 7); c.stroke(); c.beginPath(); c.moveTo(X(-34), Y(52.5)); c.lineTo(X(34), Y(52.5)); c.stroke();
		});
		var grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }));
		grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0, 40); grass.receiveShadow = true; sc.add(grass);
		var outer = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: "#356f35", roughness: 1 }));
		outer.rotation.x = -Math.PI / 2; outer.position.set(0, -0.02, 40); sc.add(outer);
		// goal frame
		var white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 });
		var pr = G.postR, px = G.postX, top = G.barZ + pr, ly = G.lineY;
		[-1, 1].forEach(function (s) { var p = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, top + pr, 16), white); p.position.set(s * px, (top + pr) / 2, ly); p.castShadow = true; sc.add(p); });
		var bar = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, px * 2 + pr * 2, 16), white); bar.rotation.z = Math.PI / 2; bar.position.set(0, top, ly); bar.castShadow = true; sc.add(bar);
		// the net: back, roof and sides as a grid of thin lines
		var back = -G.depth + ly, pts = [], step = 0.14, h2 = 1.6;
		function seg(a, b) { pts.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
		for (var x = -px; x <= px + 0.001; x += step) { seg([x, 0, back], [x, h2, back]); seg([x, h2, back], [x, top, ly]); }
		for (var z = 0; z <= h2 + 0.001; z += step) seg([-px, z, back], [px, z, back]);
		for (var u = 0; u <= 1.0001; u += step / 2.2) { var yy = h2 + (top - h2) * u, zz = back + (ly - back) * u; seg([-px, yy, zz], [px, yy, zz]); }
		[-1, 1].forEach(function (s) {
			for (var zz2 = back; zz2 <= ly + 0.001; zz2 += step) { var fz = (zz2 - back) / (ly - back); seg([s * px, 0, zz2], [s * px, h2 + (top - h2) * fz, zz2]); }
			for (var yy2 = 0; yy2 <= top; yy2 += step) { var zb = yy2 <= h2 ? back : back + (ly - back) * (yy2 - h2) / (top - h2); seg([s * px, yy2, zb], [s * px, yy2, ly]); }
		});
		var ng = new THREE.BufferGeometry(); ng.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
		this.netMat = new THREE.LineBasicMaterial({ color: "#f1f3f5", transparent: true, opacity: 0.55 });
		this.netGeo = ng; this.netBase = new Float32Array(pts);
		var netLines = new THREE.LineSegments(ng, this.netMat); netLines.frustumCulled = false; sc.add(netLines);
		var supp = new THREE.MeshStandardMaterial({ color: "#d0d4d9", roughness: 0.5 });
		[-1, 1].forEach(function (s) { var r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h2, 8), supp); r.position.set(s * px, h2 / 2, back); sc.add(r); });
		// stands + crowd behind the goal and along both sides
		this.crowdMat = new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, function (c, w, h) {
			c.fillStyle = "#2b3442"; c.fillRect(0, 0, w, h);
			var cols = ["#d9480f", "#1c7ed6", "#f8f9fa", "#fab005", "#2f9e44", "#c92a2a", "#343a40", "#e6b98f"];
			for (var i = 0; i < 2600; i++) { c.fillStyle = cols[(Math.random() * cols.length) | 0]; c.fillRect(Math.random() * w, Math.random() * h, 3, 4); }
		}), roughness: 1, side: THREE.DoubleSide });
		this.crowdMat.map.wrapS = THREE.RepeatWrapping; this.crowdMat.map.repeat.set(6, 1);
		var stands = this.stands = new THREE.Group();
		function stand(w2, cx, cz, rotY) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w2, 26), self.crowdMat); m.position.set(cx, 11, cz); m.rotation.y = rotY; m.rotation.x = rotY === 0 ? -0.45 : 0; stands.add(m); return m; }
		stand(140, 0, -16, 0); stand(150, -44, 45, Math.PI / 2); stand(150, 44, 45, -Math.PI / 2);
		var bs = stand(110, 0, 112, Math.PI); bs.rotation.x = 0;
		// roofs over the stands so an orbiting camera sees a closed stadium
		var roofMat = new THREE.MeshStandardMaterial({ color: "#3a4250", roughness: 0.8, side: THREE.DoubleSide });
		[[0, -24, 150, 14, 0], [-52, 45, 14, 150, 0], [52, 45, 14, 150, 0], [0, 120, 120, 14, 0]].forEach(function (r) { var m = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), roofMat); m.rotation.x = -Math.PI / 2; m.position.set(r[0], 25, r[1]); stands.add(m); });
		var boardTex = canvasTex(1024, 64, function (c, w, h) {
			var grd = c.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, "#1c3d78"); grd.addColorStop(0.5, "#264d9b"); grd.addColorStop(1, "#1c3d78");
			c.fillStyle = grd; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "bold 38px system-ui, sans-serif"; c.textAlign = "center";
			for (var i = 0; i < 4; i++) c.fillText(i % 2 ? "MES.FM" : "FREE KICKS", w * (i + 0.5) / 4, 46);
		});
		boardTex.wrapS = THREE.RepeatWrapping; boardTex.repeat.set(4, 1);
		var board = new THREE.Mesh(new THREE.PlaneGeometry(90, 0.9), new THREE.MeshBasicMaterial({ map: boardTex })); board.position.set(0, 0.45, -5); stands.add(board);
		sc.add(stands);
		new THREE.TextureLoader().load(IMG + "crowd.jpg?v=1", function (t) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.MirroredRepeatWrapping; t.repeat.set(3, 1); self.crowdMat.map = t; self.crowdMat.needsUpdate = true; self.draw(); });
		// ball
		var bTex = canvasTex(512, 256, function (c, w, h) {
			c.fillStyle = "#f8f9fa"; c.fillRect(0, 0, w, h);
			c.fillStyle = "#1e2733";
			for (var i = 0; i < 12; i++) { var cx = (i % 6) * w / 6 + (i >= 6 ? w / 12 : 0), cy = i >= 6 ? h * 0.72 : h * 0.28; c.beginPath(); for (var k = 0; k < 5; k++) { var a = k / 5 * Math.PI * 2 - Math.PI / 2; c.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 30); } c.fill(); }
		});
		this.ball = new THREE.Mesh(new THREE.SphereGeometry(G.R, 32, 18), new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.45 }));
		this.ball.castShadow = true; sc.add(this.ball);
		var shadowTex = canvasTex(64, 64, function (c, w) { var g = c.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2); g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, w, w); });
		this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
		this.ballShadow = this.blob(0.3); sc.add(this.ballShadow);
		this.prevBall = null;
		// players: low-poly 3D people built from simple shapes (they cast real shadows)
		this.kit = {
			wall: { shirt: "#1c4aa0", shorts: "#f8f9fa", socks: "#1c4aa0", trim: "#ffffff" },
			keeper: { shirt: "#a9e34b", shorts: "#212529", socks: "#a9e34b", trim: "#212529", gloves: "#f8f9fa" },
			kicker: { shirt: "#c92a2a", shorts: "#f8f9fa", socks: "#c92a2a", trim: "#ffffff" }
		};
		this.wallGroup = new THREE.Group(); sc.add(this.wallGroup); this.wallMen = [];
		this.keeperP = this.person(this.kit.keeper, 1, 1.0, "#3b2a20"); sc.add(this.keeperP.root);
		this.kickerP = this.person(this.kit.kicker, 10, 0.98, "#1f1611"); sc.add(this.kickerP.root);
		this.fallT = 0; this.free = null; this.t0 = performance.now();
		// marks
		this.aimMark = this.ringMesh("#ffd43b", 0.22, true); sc.add(this.aimMark);
		this.diveMark = this.ringMesh("#69db7c", 0.26, false); sc.add(this.diveMark);
		this.targetGroup = new THREE.Group(); sc.add(this.targetGroup);
		this.guide = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: "#ffffff", dashSize: 0.18, gapSize: 0.22, transparent: true, opacity: 0.95 }));
		this.guide.frustumCulled = false; sc.add(this.guide);
		this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#ffd43b", transparent: true, opacity: 0.6 }));
		this.trail.frustumCulled = false; sc.add(this.trail);
		this.trailPts = [];
		this.w = 300; this.h = 200; this.info = null; this.wallKey = "";
	}
	var PS = {};   // shared geometries (made once)
	function geo() {
		if (PS.cap) return PS;
		PS.cap = function (r, l) { var k = r + "|" + l; return PS[k] || (PS[k] = new THREE.CapsuleGeometry(r, l, 4, 10)); };
		PS.head = new THREE.SphereGeometry(0.112, 18, 14);
		PS.hair = new THREE.SphereGeometry(0.119, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
		PS.hand = new THREE.SphereGeometry(0.048, 10, 8);
		PS.glove = new THREE.BoxGeometry(0.12, 0.15, 0.06);
		PS.boot = new THREE.BoxGeometry(0.088, 0.062, 0.235);
		PS.shorts = new THREE.CylinderGeometry(0.165, 0.175, 0.24, 14);
		PS.neck = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10);
		PS.eye = new THREE.SphereGeometry(0.014, 6, 5);
		PS.num = new THREE.PlaneGeometry(0.2, 0.2);
		return PS;
	}
	var MATC = {};
	function mat(col, rough) { var k = col + "|" + (rough || 0.75); return MATC[k] || (MATC[k] = new THREE.MeshStandardMaterial({ color: col, roughness: rough || 0.75 })); }
	var SKINS = ["#e6b98f", "#c68a5e", "#8d5a3b", "#f1c9a5", "#a8704a", "#5c3a24"], HAIRS = ["#1f1611", "#3b2a20", "#6b4a2b", "#111111", "#a0703c", "#2a1d14"];
	/** a person: root on the ground between the feet, facing +Z (three), about 1.85 m tall. Returns the joints. */
	View.prototype.person = function (kit, num, scale, hair, skinI) {
		var P = geo(), self = this, skin = mat(SKINS[(skinI || 0) % SKINS.length], 0.65);
		var root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(scale || 1);
		function m(g, mt, x, y, z, parent) { var o = new THREE.Mesh(g, mt); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; (parent || body).add(o); return o; }
		function grp(x, y, z, parent) { var o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; }
		var pelvis = grp(0, 0.97, 0, body);
		var sh = m(P.shorts, mat(kit.shorts), 0, -0.05, 0, pelvis); sh.scale.set(1, 1, 0.72);
		var torso = grp(0, 0.05, 0, pelvis);
		var chest = m(P.cap(0.16, 0.3), mat(kit.shirt, 0.6), 0, 0.29, 0, torso); chest.scale.set(1.22, 1, 0.74);
		m(P.neck, skin, 0, 0.56, 0, torso);
		var head = grp(0, 0.62, 0, torso);
		m(P.head, skin, 0, 0.1, 0, head);
		var hr = m(P.hair, mat(hair || HAIRS[0], 0.9), 0, 0.11, -0.012, head); hr.rotation.x = -0.25;
		var em = mat("#1b1b1b", 0.4); m(P.eye, em, 0.038, 0.115, 0.1, head); m(P.eye, em, -0.038, 0.115, 0.1, head);
		// number on the back, crest on the front
		var nt = canvasTex(128, 128, function (c, w, h) { c.font = "800 92px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineWidth = 8; c.strokeStyle = "rgba(0,0,0,0.35)"; c.strokeText(String(num), w / 2, h / 2 + 4); c.fillStyle = kit.trim; c.fillText(String(num), w / 2, h / 2 + 4); });
		var nm = new THREE.Mesh(P.num, new THREE.MeshStandardMaterial({ map: nt, transparent: true, roughness: 0.7, depthWrite: false })); nm.position.set(0, 0.32, -0.123); nm.rotation.y = Math.PI; torso.add(nm);
		var cm = new THREE.Mesh(P.num, new THREE.MeshStandardMaterial({ map: nt, transparent: true, roughness: 0.7, depthWrite: false })); cm.scale.setScalar(0.45); cm.position.set(-0.07, 0.4, 0.122); torso.add(cm);
		function arm(sx) {
			var s = grp(sx * 0.215, 0.49, 0, torso);
			m(P.cap(0.066, 0.08), mat(kit.shirt, 0.6), 0, -0.07, 0, s);
			m(P.cap(0.052, 0.2), kit.gloves ? mat(kit.shirt, 0.6) : skin, 0, -0.15, 0, s);
			var e = grp(0, -0.29, 0, s);
			m(P.cap(0.045, 0.19), kit.gloves ? mat(kit.shirt, 0.6) : skin, 0, -0.12, 0, e);
			if (kit.gloves) m(P.glove, mat(kit.gloves, 0.5), 0, -0.28, 0.005, e); else m(P.hand, skin, 0, -0.26, 0, e);
			return { s: s, e: e };
		}
		function leg(sx) {
			var h = grp(sx * 0.095, -0.07, 0, pelvis);
			m(P.cap(0.072, 0.26), skin, 0, -0.2, 0, h);
			var k = grp(0, -0.43, 0, h);
			m(P.cap(0.058, 0.27), mat(kit.socks, 0.8), 0, -0.19, 0, k);
			boots.push(m(P.boot, mat("#151515", 0.45), 0, -0.42, 0.04, k));
			return { h: h, k: k };
		}
		var boots = [], L = arm(1), R = arm(-1), LL = leg(1), RL = leg(-1);
		var shadow = this.blob(0.42); shadow.material = this.shadowMat; this.scene.add(shadow);
		return { root: root, body: body, pelvis: pelvis, torso: torso, head: head, aL: L.s, eL: L.e, aR: R.s, eR: R.e, lL: LL.h, kL: LL.k, lR: RL.h, kR: RL.k, shadow: shadow, boots: boots };
	};
	/** set a pose. p: pelvis offset (py), pelvis tilt (prx, prz), torso lean (tx, ty), head (hx), arms (aLx, aLz, eL, aRx, aRz, eR), legs (lLx, lLz, kL, lRx, lRz, kR) */
	function pose(P, p) {
		P.pelvis.position.set(p.px || 0, 0.97 + (p.py || 0), p.pz || 0);
		P.pelvis.rotation.set(p.prx || 0, p.pry || 0, p.prz || 0);
		P.torso.rotation.set(p.tx || 0, p.ty || 0, p.tz || 0);
		P.head.rotation.set(p.hx || 0, p.hy || 0, 0);
		P.aL.rotation.set(p.aLx || 0, 0, p.aLz || 0); P.eL.rotation.set(p.eL || 0, 0, 0);
		P.aR.rotation.set(p.aRx || 0, 0, p.aRz || 0); P.eR.rotation.set(p.eR || 0, 0, 0);
		P.lL.rotation.set(p.lLx || 0, 0, p.lLz || 0); P.kL.rotation.set(p.kL || 0, 0, 0);
		P.lR.rotation.set(p.lRx || 0, 0, p.lRz || 0); P.kR.rotation.set(p.kR || 0, 0, 0);
	}
	function mix(a, b, u) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * u; for (k in a) if (!(k in b)) o[k] = a[k] * (1 - u); return o; }
	function alerp(a, b, u) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * u; }
	/* the same pose with left and right swapped (a left-footed kicker) */
	var SWAP = { aLx: "aRx", aRx: "aLx", aLz: "aRz", aRz: "aLz", eL: "eR", eR: "eL", lLx: "lRx", lRx: "lLx", lLz: "lRz", lRz: "lLz", kL: "kR", kR: "kL" }, NEG = { aLz: 1, aRz: 1, lLz: 1, lRz: 1, prz: 1, pry: 1, ty: 1, tz: 1, hy: 1, px: 1 };
	function mirrorPose(p) { var o = {}; for (var k in p) { var k2 = SWAP[k] || k; o[k2] = NEG[k2] ? -p[k] : p[k]; } return o; }
	function sm(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }
	var POSE = {
		stand: { aLz: 0.13, aRz: -0.13, eL: -0.25, eR: -0.25, kL: 0.05, kR: 0.05 },
		ready: { py: -0.13, tx: 0.32, hx: -0.25, aLx: -0.75, aLz: 0.62, eL: -0.75, aRx: -0.75, aRz: -0.62, eR: -0.75, lLx: -0.42, lLz: 0.16, kL: 0.78, lRx: -0.42, lRz: -0.16, kR: 0.78 },
		wall: { aLx: -0.28, aLz: -0.32, eL: -0.95, aRx: -0.28, aRz: 0.32, eR: -0.95, kL: 0.08, kR: 0.08, hx: 0.1 },
		crouch: { py: -0.16, tx: 0.25, aLx: -0.4, aLz: -0.2, eL: -1.0, aRx: -0.4, aRz: 0.2, eR: -1.0, lLx: -0.6, kL: 1.1, lRx: -0.6, kR: 1.1 },
		tuck: { tx: 0.05, aLx: -0.1, aLz: -0.25, eL: -1.1, aRx: -0.1, aRz: 0.25, eR: -1.1, lLx: -0.35, kL: 0.95, lRx: -0.35, kR: 0.95, hx: -0.15 },
		cheer: { aLz: 2.55, aRz: -2.55, eL: -0.2, eR: -0.2, hx: -0.35, kL: 0.05, kR: 0.05 },
		sad: { tx: 0.35, hx: 0.5, aLz: 0.05, aRz: -0.05, eL: -0.1, eR: -0.1, kL: 0.1, kR: 0.1 }
	};
	/* the lowest point of a person in the world (the boots only, or every part): from each part's box corners */
	var BOX = null, VV = null;
	function lowY(P, bootsOnly) {
		if (!VV) VV = new THREE.Vector3();
		P.root.updateMatrixWorld(true);
		var lo = 99;
		function one(o) {
			if (!o.isMesh || o.material.transparent) return;
			if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
			var bb = o.geometry.boundingBox;
			for (var i = 0; i < 8; i++) { VV.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld); if (VV.y < lo) lo = VV.y; }
		}
		if (bootsOnly) P.boots.forEach(one); else P.root.traverse(one);
		return lo;
	}
	/* stand the person on the ground (feet planted, whatever the pose does to the legs), or at height "base" in the air */
	function plantP(P, base) { P.root.position.y += (base || 0) + 0.003 - lowY(P, true); }
	/* never let any part go under the grass (a diving keeper) */
	function aboveP(P) { var lo = lowY(P, false); if (lo < 0.008) P.root.position.y += 0.008 - lo; }
	View.prototype.place = function (P, x, y, z, face) { P.root.position.set(x, z, y); P.root.rotation.y = face; P.shadow.position.set(x, 0.013, y); };

	View.prototype.ringMesh = function (col, r, cross) {
		var g = new THREE.Group(), mt = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthTest: false });
		g.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 40), mt));
		if (cross) { var a = new THREE.Mesh(new THREE.PlaneGeometry(r * 3, 0.03), mt), b = new THREE.Mesh(new THREE.PlaneGeometry(0.03, r * 3), mt); g.add(a); g.add(b); }
		g.renderOrder = 5; g.children.forEach(function (c) { c.renderOrder = 5; });
		return g;
	};
	View.prototype.blob = function (r) { var m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), this.shadowMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1; return m; };
	View.prototype.size = function (w, h) {
		w = Math.max(50, Math.round(w)); h = Math.max(50, Math.round(h));
		if (w === this.w && h === this.h) return;
		this.w = w; this.h = h;
		this.renderer.setSize(w, h, false);
		this.renderer.domElement.style.width = w + "px"; this.renderer.domElement.style.height = h + "px";
		this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
		this.dirty = true;
	};
	function setPts(line, pts) { line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(pts); }
	function V(x, y, z) { return new THREE.Vector3(x, z, y); }     // pitch (x, y, z) -> three
	/* the app hands over what to show; the view keeps its own animation loop (idle movement, camera easing) while it is on screen */
	View.prototype.frame = function (info) {
		this.info = info; this.dirty = true;
		var now = performance.now();
		if (!this.loopOn || now - (this.lastLoop || 0) > 120) this.draw(now);
		this.startLoop();
	};
	View.prototype.startLoop = function () {
		if (this.loopOn) return;
		var self = this; this.loopOn = true;
		if (!this.io && window.IntersectionObserver) { this.vis = true; this.io = new IntersectionObserver(function (es) { self.vis = es[0].isIntersecting; if (self.vis) self.startLoop(); }); this.io.observe(this.el); }
		(function lp(now) {
			if (document.hidden || self.vis === false || self.el.offsetParent === null && !document.fullscreenElement) { self.loopOn = false; return; }
			self.lastLoop = now; self.draw(now);
			requestAnimationFrame(lp);
		})(performance.now());
		document.addEventListener("visibilitychange", function () { if (!document.hidden) self.startLoop(); });
	};
	View.prototype.draw = function (now) {
		var I = this.info; if (!I) return;
		now = now || performance.now();
		var G = this.G, s = I.setup, sc = this.scene, self = this, clock = (now - this.t0) / 1000;
		var dk = !!I.dark;
		sc.background.set(dk ? "#162436" : "#8fc3ea"); sc.fog.color.set(dk ? "#162436" : "#a9cfe9");
		this.hemi.intensity = dk ? 0.75 : 1.1; this.sun.intensity = dk ? 1.15 : 1.7;
		this.netMat.opacity = dk ? 0.4 : 0.55;
		var b = I.ball;
		// ---- wall
		var wk = I.wall.length;
		while (this.wallMen.length < wk) { var wp = this.person(this.kit.wall, [4, 6, 8, 5, 3, 14][this.wallMen.length % 6], 0.97 + (this.wallMen.length % 3) * 0.02, HAIRS[(this.wallMen.length + 2) % HAIRS.length], this.wallMen.length + 1); this.wallGroup.add(wp.root); this.wallMen.push(wp); }
		this.wallMen.forEach(function (P, i) {
			var on = i < wk; P.root.visible = on; P.shadow.visible = on; if (!on) return;
			var p = I.wall[i], face = Math.atan2(s.bx - p.x, s.by - p.y);
			var tt = I.t, pr;
			if (s.j && tt > 0 && tt < 0.12) pr = mix(POSE.wall, POSE.crouch, sm(tt / 0.12));
			else if (I.lift > 0.01) pr = mix(POSE.wall, POSE.tuck, sm(I.lift * 4));
			else { pr = mix(POSE.wall, { hx: 0.1 }, 0); pr.py = Math.sin(clock * 2.1 + i * 1.7) * 0.006; pr.ty = Math.sin(clock * 0.9 + i) * 0.04; }
			pose(P, pr);
			self.place(P, p.x, p.y, I.lift, face); plantP(P, I.lift);
			var ss = Math.max(0.4, 1 - I.lift * 1.2); P.shadow.scale.set(ss, ss, 1);
		});
		// ---- keeper (3D body: hands go exactly where the physics puts them; the body keeps its size)
		var k = I.keeper, K = this.keeperP, kface = Math.atan2(s.bx - k.ax, Math.max(0.5, s.by - k.y)) * 0.85;
		if (k.dive) {
			var e = k.s, dx = k.hx - k.ax, dz = k.hz - k.az, ang = Math.atan2(dx, dz);    // body axis, from vertical
			// the model is longer (hands to feet ~2.1 m) than the physics capsule, so it lies flatter when the hands are low:
			// otherwise the legs end up under the grass
			var LEG = 0.95, reach = 1.08 + 0.08 * e, need = (k.hz - 0.06) / (reach + LEG);
			if (Math.cos(ang) > need) { var aMin = Math.acos(Math.max(-1, Math.min(1, need))); ang = (ang < 0 || (ang === 0 && k.hx < (s.kx || 0)) ? -1 : 1) * aMin; }
			var hipX = k.hx - Math.sin(ang) * reach, hipZ = k.hz - Math.cos(ang) * reach;
			var stand = { x: (s.kx || 0), z: 0.84 }, u = sm(Math.min(1, e * 1.6));
			var px = stand.x + (hipX - stand.x) * u, pz = stand.z + (hipZ - stand.z) * u;
			// after the kick is over the keeper drops to the grass
			if (I.settle && e >= 0.999) { if (!this.fallT) this.fallT = now; var fu = sm((now - this.fallT) / 520); pz = pz + (Math.max(0.24, Math.min(pz, 0.26 + Math.abs(Math.cos(ang)) * 0.6)) - pz) * fu; }
			else this.fallT = 0;
			var floorZ = Math.cos(ang * u) * LEG * 0.97 + 0.04;   // feet never under the grass, at any moment of the dive
			if (pz < floorZ) pz = floorZ; if (pz < 0.2) pz = 0.2;
			var dp = mix(POSE.ready, { aLz: 2.95, aRz: -2.95, eL: -0.05, eR: -0.05, aLx: -0.15, aRx: -0.15, lLx: 0.12, lLz: 0.22, kL: 0.35, lRx: -0.15, lRz: -0.08, kR: 0.15, tx: 0.08, hx: 0.1, py: 0 }, sm(Math.min(1, e * 2.2)));
			dp.prz = -ang * u; dp.py = 0; dp.px = 0;
			pose(K, dp);
			K.pelvis.position.set(0, 0, 0);
			// place: root at (px, keeperY) on the ground, pelvis lifted to pz
			K.root.position.set(px, 0, k.y); K.root.rotation.y = kface * (1 - u);
			K.pelvis.position.set(0, pz / (K.body.scale.x), 0);
			aboveP(K);
			K.shadow.position.set(px, 0.013, k.y); var kss = Math.max(0.6, 1.4 - pz * 0.5); K.shadow.scale.set(kss * (1 + Math.abs(Math.sin(ang)) * 1.2), kss * 0.7, 1);
		} else {
			this.fallT = 0;
			var bob = Math.sin(clock * 3.4) * 0.012, sway = Math.sin(clock * 1.3) * 0.05;
			var kp = I.res === "goal" && I.settle ? mix(POSE.ready, POSE.sad, sm((now - (this.resT || now)) / 400)) : mix(POSE.ready, {}, 0);
			kp.py = (kp.py || 0) + bob; kp.ty = sway * 0.4; kp.px = 0;
			if (I.flying) { kp.py -= 0.03; kp.aLx -= 0.15; kp.aRx -= 0.15; }
			pose(K, kp);
			this.place(K, k.ax + Math.sin(clock * 0.8) * 0.04 * (I.flying ? 0 : 1), k.y, 0, kface); plantP(K, 0);
			K.shadow.scale.set(1, 1, 1);
		}
		if (I.settle && !this.resT) this.resT = now; if (!I.settle) this.resT = 0;
		// ---- kicker: run-up from behind and to the side of the standing foot, plant, strike, follow through.
		// A left-footed kicker (I.foot "L") runs in from the other side and every pose is mirrored.
		var lf = I.foot === "L", fs = lf ? -1 : 1;
		var dxg = -s.bx, dyg = G.lineY - s.by, dl = Math.sqrt(dxg * dxg + dyg * dyg), ux = dxg / dl, uy = dyg / dl, lx = uy * fs, ly = -ux * fs;   // u: to goal, l: the side he runs in from
		var face = Math.atan2(ux, uy), C = this.kickerP;
		var start = { x: s.bx - ux * 3.3 + lx * 1.6, y: s.by - uy * 3.3 + ly * 1.6 }, plant = { x: s.bx - ux * 0.42 + lx * 0.2, y: s.by - uy * 0.42 + ly * 0.2 };
		var t = I.t, kxp, kyp, kp2, kface2 = face;
		if (!I.anim && !I.settle) {
			kxp = start.x; kyp = start.y; kface2 = Math.atan2(s.bx - start.x, s.by - start.y);
			kp2 = mix(POSE.stand, { tx: 0.12, hx: 0.1 }, 0.6); kp2.py = Math.sin(clock * 2.6) * 0.008; kp2.aLz += Math.sin(clock * 2.6) * 0.03;
			if (I.charge > 0) { var c2 = I.charge; kp2 = mix(kp2, { tx: 0.3, py: -0.08, lLx: -0.3, kL: 0.5, lRx: 0.25, kR: 0.4, aLz: 0.5, aRz: -0.5 }, Math.min(1, c2 * 1.4)); }
		} else if (I.anim && t < -0.12) {
			var pr = (t + I.run) / (I.run - 0.12); pr = Math.max(0, Math.min(1, pr));
			kxp = start.x + (plant.x - start.x) * pr; kyp = start.y + (plant.y - start.y) * pr;
			// angles blended the short way round (a plain blend spun him 360 degrees on a penalty, where the angle crosses +-180)
			kface2 = alerp(Math.atan2(plant.x - start.x, plant.y - start.y), face, pr * 0.6);
			var ph2 = pr * Math.PI * 5, sw = Math.sin(ph2);
			kp2 = { tx: 0.22, py: -0.03 + Math.abs(Math.cos(ph2)) * 0.05, lLx: -sw * 0.85, kL: 0.3 + Math.max(0, sw) * 1.1, lRx: sw * 0.85, kR: 0.3 + Math.max(0, -sw) * 1.1, aLx: sw * 0.8, aRx: -sw * 0.8, aLz: 0.15, aRz: -0.15, eL: -1.2, eR: -1.2 };
		} else {
			kxp = plant.x; kyp = plant.y;
			var q = Math.max(0, Math.min(1, (t + 0.12) / 0.5));     // 0: plant .. 0.24 ball struck .. 1 follow-through
			var back = { tx: 0.3, py: -0.06, lLx: -0.2, kL: 0.35, lRx: 1.05, kR: 1.75, aLz: 0.95, aLx: -0.3, aRz: -0.6, aRx: 0.4, eL: -0.3, eR: -0.5, ty: 0.35 };
			var strike = { tx: 0.05, py: -0.04, lLx: -0.15, kL: 0.25, lRx: -0.35, kR: 0.25, aLz: 1.15, aLx: 0.3, aRz: -0.5, aRx: -0.5, eL: -0.3, eR: -0.5, ty: -0.25 };
			var follow = { tx: -0.12, py: 0.02, lLx: 0, kL: 0.1, lRx: -1.45, kR: 0.15, aLz: 1.0, aLx: 0.5, aRz: -0.8, aRx: -0.8, eL: -0.2, eR: -0.3, ty: -0.4, hx: -0.1 };
			kp2 = q < 0.24 ? mix(back, strike, sm(q / 0.24)) : mix(strike, follow, sm((q - 0.24) / 0.5));
			if (I.settle && q >= 1) {
				var ru = sm((now - (this.resT || now)) / 450);
				kp2 = mix(follow, I.res === "goal" ? POSE.cheer : POSE.sad, ru);
				if (I.res === "goal") { kp2.py = Math.abs(Math.sin((now - this.resT) / 160)) * 0.12 * ru; kp2.aLz += Math.sin(now / 120) * 0.15; }
			}
		}
		pose(C, lf ? mirrorPose(kp2) : kp2);
		// turn smoothly from the frame before (never the long way round)
		if (this.kFace === undefined || !I.anim && !I.settle && this.kWasAnim) this.kFace = kface2;
		this.kFace = alerp(this.kFace, kface2, 0.35); this.kWasAnim = I.anim || I.settle;
		this.place(C, kxp, kyp, 0, this.kFace);
		plantP(C, I.res === "goal" && I.settle && kp2.py > 0.01 ? kp2.py : 0);
		// ---- ball (rolls / spins with its movement)
		this.ball.position.copy(V(b[0], b[1], b[2]));
		if (this.prevBall) { var mvx = b[0] - this.prevBall[0], mvy = b[1] - this.prevBall[1], d = Math.sqrt(mvx * mvx + mvy * mvy); if (d > 1e-4 && d < 2) { this.ball.rotateOnWorldAxis(new THREE.Vector3(mvy / d, 0, -mvx / d).normalize(), -d / G.R); } }
		this.prevBall = b.slice();
		this.ballShadow.position.set(b[0], 0.012, b[1]);
		var sz = Math.max(0.35, 1 - b[2] * 0.18); this.ballShadow.scale.set(sz, sz, 1);
		// ---- net bulges where the ball hits it
		this.netBulge(b, now);
		// ---- trail
		if (!I.flying) this.trailPts = [];
		else { var lp = this.trailPts[this.trailPts.length - 1]; if (!lp || Math.abs(lp.x - b[0]) + Math.abs(lp.z - b[1]) + Math.abs(lp.y - b[2]) > 0.15) this.trailPts.push(V(b[0], b[1], b[2])); }
		if (this.trailN !== this.trailPts.length) { this.trailN = this.trailPts.length; setPts(this.trail, this.trailPts.length > 1 ? this.trailPts : [V(0, 0, -5), V(0, 0, -5)]); }
		// ---- guide
		var gk2 = I.guide && I.guide.length > 1 ? I.guide.length + ":" + I.guide[I.guide.length - 1].join(",") : "";
		if (gk2) { this.guide.visible = true; if (gk2 !== this.guideKey) { setPts(this.guide, I.guide.map(function (p) { return V(p[0], p[1], p[2]); })); this.guide.computeLineDistances(); } }
		else this.guide.visible = false;
		this.guideKey = gk2;
		// ---- marks
		this.aimMark.visible = !!I.aim; if (I.aim) { this.aimMark.position.copy(V(I.aim.x, G.lineY + 0.02, I.aim.z)); var pulse = 1 + Math.sin(clock * 5) * 0.08; this.aimMark.scale.set(pulse, pulse, 1); }
		this.diveMark.visible = !!I.dive; if (I.dive) this.diveMark.position.copy(V(I.dive.x, G.lineY + 0.05, I.dive.z));
		var tk = I.targets ? I.targets.map(function (t) { return t.x + "," + t.z; }).join("|") : "";
		if (tk !== this.tgtKey) {
			this.tgtKey = tk;
			while (this.targetGroup.children.length) this.targetGroup.remove(this.targetGroup.children[0]);
			(I.targets || []).forEach(function (t) {
				var g = new THREE.Mesh(new THREE.RingGeometry(t.r * 0.86, t.r, 48), new THREE.MeshBasicMaterial({ color: "#ffd43b", transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
				var f = new THREE.Mesh(new THREE.CircleGeometry(t.r * 0.86, 48), new THREE.MeshBasicMaterial({ color: "#ffd43b", transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
				g.position.copy(V(t.x, G.lineY + 0.01, t.z)); f.position.copy(g.position); self.targetGroup.add(g); self.targetGroup.add(f);
			});
		}
		// ---- camera
		var e3, l3, bk = { x: -ux, y: -uy };
		if (I.cam === "keeper") { e3 = V((s.kx || 0) * 0.6, -1.7, 1.75); l3 = V(b[0] * 0.5 + s.bx * 0.5, b[1] * 0.5 + s.by * 0.5, Math.max(0.6, b[2] * 0.6)); }
		else if (I.cam === "tv") { var sd = s.bx > 0 ? -1 : 1; e3 = V(sd * 30, s.by * 0.55 + 3, 13); l3 = V(b[0] * 0.4, Math.max(2, b[1] * 0.55), 1); }
		else if (I.cam === "high") { e3 = V(s.bx + bk.x * 13, s.by + bk.y * 13, 9); l3 = V(0, 0, 1); }
		else if (I.cam === "ball" && I.flying) { e3 = V(b[0] + bk.x * 3.2, b[1] + bk.y * 3.2, b[2] + 0.9); l3 = V(b[0] * 0.3, Math.min(b[1], 3), Math.max(1, b[2])); }
		else {
			// behind the ball: fit the ball (near the bottom) and the crossbar (near the top), and the goal's width
			var bkd = 7, hh = 2.4, gd = Math.sqrt(s.bx * s.bx + (s.by - G.lineY) * (s.by - G.lineY)) + bkd;
			var aB = Math.atan2(-(hh + 0.12), bkd), aT = Math.atan2(2.7 - hh, gd), asp = this.w / this.h;
			var vf = (aT - aB) * 1.2, needH = Math.atan(5.6 / gd);
			vf = Math.max(vf, 2 * Math.atan(Math.tan(needH) / asp));
			var mid = (aT + aB) / 2 - (vf - (aT - aB) * 1.2) * 0.1;
			e3 = V(s.bx + bk.x * bkd - uy * 1.7 * fs, s.by + bk.y * bkd + ux * 1.7 * fs, hh);     // on the other side from the run-up, so the kicker never fills the picture
			l3 = V(s.bx + bk.x * bkd - bk.x * 10 * Math.cos(mid), s.by + bk.y * bkd - bk.y * 10 * Math.cos(mid), hh + 10 * Math.sin(mid));
			this.behindFov = vf * 180 / Math.PI;
		}
		var fov = I.cam === "keeper" ? 62 : I.cam === "tv" || I.cam === "high" ? 38 : I.cam === "ball" && I.flying ? 60 : Math.min(75, this.behindFov || 40);
		if (this.free) {
			var F = this.free, cp = Math.cos(F.pitch);
			e3 = new THREE.Vector3(F.target.x + F.dist * cp * Math.sin(F.yaw), F.target.y + F.dist * Math.sin(F.pitch), F.target.z + F.dist * cp * Math.cos(F.yaw));
			l3 = F.target.clone(); fov = F.fov;
		}
		// keep every camera inside the stadium: in front of the stands, under the roofs (it used to fly out behind the crowd)
		clampEye(e3);
		var lerp = this.camInit ? (this.free ? 0.45 : 0.14) : 1; this.camInit = true;
		if (this.holdCam) lerp = 0;      // while the ball is being dragged on the pitch the camera stays put
		var ck = I.cam + (this.free ? "f" : "");
		if (this.lastCam !== ck) lerp = 0.3; this.lastCam = ck;
		this.eye.lerp(e3, lerp); this.look.lerp(l3, lerp);
		this.cam.position.copy(this.eye); this.cam.lookAt(this.look);
		this.cam.fov += (fov - this.cam.fov) * Math.max(lerp, 0.2); this.cam.updateProjectionMatrix();
		this.renderer.render(sc, this.cam);
		this.dirty = false;
	};
	/* the stands: behind the goal (leaning back, front edge ~z -10), both sides (x +-44), the far end (z 112), roofs at 25 m */
	function clampEye(e) {
		if (e.y < 0.25) e.y = 0.25; if (e.y > 21) e.y = 21;
		var zmin = -8.5 + Math.max(0, e.y - 1) * 0.42;     // the stand behind the goal leans back
		if (e.z < zmin) e.z = zmin; if (e.z > 106) e.z = 106;
		if (e.x < -40) e.x = -40; if (e.x > 40) e.x = 40;
		return e;
	}
	View.prototype.netBulge = function (b, now) {
		var G = this.G, inGoal = b[1] < G.lineY - 0.25 && Math.abs(b[0]) < G.halfW && b[2] < G.barZ;
		if (inGoal) { this.bulge = { x: b[0], z: b[2], y: b[1], t: now }; }
		var B2 = this.bulge, pos = this.netGeo.attributes.position, base = this.netBase;
		if (!B2) return;
		var age = (now - B2.t) / 1000, amp = inGoal ? 0.32 : 0.32 * Math.exp(-age * 3.2) * Math.cos(age * 14);
		if (!inGoal && age > 1.6) { pos.array.set(base); pos.needsUpdate = true; this.bulge = null; return; }
		var a = pos.array;
		for (var i = 0; i < a.length; i += 3) {
			var bx = base[i], by = base[i + 1], bz = base[i + 2];
			if (bz > G.lineY - 0.15) { a[i] = bx; a[i + 1] = by; a[i + 2] = bz; continue; }
			var dx = bx - B2.x, dy = by - B2.z, f = Math.exp(-(dx * dx + dy * dy) / 0.45);
			a[i] = bx; a[i + 1] = by; a[i + 2] = bz - amp * f;
		}
		pos.needsUpdate = true;
	};
	/* free orbit camera */
	View.prototype.ensureFree = function () {
		if (this.free) return;
		// pivot around the point in the middle of the picture (where it meets the pitch at chest height), not far beyond it
		var dir = this.look.clone().sub(this.eye).normalize(), tgt = this.look.clone();
		if (dir.y < -0.02) { var k = (this.eye.y - 1.0) / -dir.y; if (k > 1 && k < 45) tgt = this.eye.clone().addScaledVector(dir, k); }
		var d = this.eye.clone().sub(tgt), dist = Math.max(2, d.length());
		this.free = { target: tgt, dist: dist, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-0.99, Math.min(0.99, d.y / dist))), fov: this.cam.fov };
		if (this.free.target.y < 0) this.free.target.y = 0;
	};
	View.prototype.orbit = function (dx, dy) {
		this.ensureFree(); var F = this.free;
		F.yaw -= dx * 0.0042; F.pitch = Math.max(0.02, Math.min(1.45, F.pitch + dy * 0.0035));
		this.kick();
	};
	View.prototype.pan = function (dx, dy) {
		this.ensureFree(); var F = this.free, k = F.dist * 0.0016;
		var right = new THREE.Vector3(Math.cos(F.yaw), 0, -Math.sin(F.yaw)), fwd = new THREE.Vector3(-Math.sin(F.yaw), 0, -Math.cos(F.yaw));
		F.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
		F.target.x = Math.max(-34, Math.min(34, F.target.x)); F.target.z = Math.max(-3, Math.min(95, F.target.z));
		this.kick();
	};
	View.prototype.zoom = function (f) { this.ensureFree(); this.free.dist = Math.max(1.5, Math.min(70, this.free.dist * f)); this.kick(); };
	View.prototype.resetView = function () { this.free = null; this.kick(); };
	View.prototype.isFree = function () { return !!this.free; };
	View.prototype.kick = function () { this.dirty = true; if (!this.loopOn) this.draw(); this.startLoop(); };
	View.prototype.pickGoal = function (cx, cy) {
		var r = this.renderer.domElement.getBoundingClientRect(), G = this.G;
		var nd = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
		this.ray.setFromCamera(nd, this.cam);
		var pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -G.lineY), hit = new THREE.Vector3();
		if (this.cam.position.z < G.lineY + 0.3) return null;        // looking from behind the goal: no aiming through the net
		if (!this.ray.ray.intersectPlane(pl, hit)) return null;
		if (Math.abs(hit.x) > 6.5 || hit.y > 4.2 || hit.y < -0.4) return null;
		return { x: hit.x, z: hit.y };
	};
	/** where the pointer meets the grass, in pitch coordinates {x, y}, or null */
	View.prototype.pickGround = function (cx, cy) {
		var r = this.renderer.domElement.getBoundingClientRect();
		var nd = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
		this.ray.setFromCamera(nd, this.cam);
		var hit = new THREE.Vector3();
		if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
		return { x: hit.x, y: hit.z };
	};
	/** the ball's position on the screen (client pixels) */
	View.prototype.ballScreen = function () {
		var r = this.renderer.domElement.getBoundingClientRect(), v = this.ball.position.clone().project(this.cam);
		return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, front: v.z < 1 };
	};
	View.prototype.hover = function (cx, cy, overBall) { var g = this.pickGoal(cx, cy); this.renderer.domElement.style.cursor = overBall ? "move" : g ? "crosshair" : this.dragging ? "grabbing" : "grab"; };
	window.FK3D = { create: create, load: load };
})();
