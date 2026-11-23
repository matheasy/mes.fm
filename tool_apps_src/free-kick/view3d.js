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
		el.appendChild(R.domElement);
		var sc = this.scene = new THREE.Scene();
		sc.background = new THREE.Color("#8fc3ea");
		sc.fog = new THREE.Fog("#a9cfe9", 70, 170);
		this.cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 400);
		this.eye = new THREE.Vector3(0, 1.8, 25); this.look = new THREE.Vector3(0, 1.2, 0);
		sc.add(new THREE.HemisphereLight("#eef6ff", "#2d5a2a", 1.1));
		var sun = new THREE.DirectionalLight("#fff4dc", 1.6); sun.position.set(-30, 60, 40); sc.add(sun);
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
		grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0, 40); sc.add(grass);
		var outer = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: "#356f35", roughness: 1 }));
		outer.rotation.x = -Math.PI / 2; outer.position.set(0, -0.02, 40); sc.add(outer);
		// goal frame
		var white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 });
		var pr = G.postR, px = G.postX, top = G.barZ + pr, ly = G.lineY;
		[-1, 1].forEach(function (s) { var p = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, top + pr, 16), white); p.position.set(s * px, (top + pr) / 2, ly); sc.add(p); });
		var bar = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, px * 2 + pr * 2, 16), white); bar.rotation.z = Math.PI / 2; bar.position.set(0, top, ly); sc.add(bar);
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
		this.netMat = new THREE.LineBasicMaterial({ color: "#f1f3f5", transparent: true, opacity: 0.5 });
		sc.add(new THREE.LineSegments(ng, this.netMat));
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
		stand(140, 0, -16, 0); stand(130, -44, 40, Math.PI / 2); stand(130, 44, 40, -Math.PI / 2);
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
		sc.add(this.ball);
		var shadowTex = canvasTex(64, 64, function (c, w) { var g = c.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2); g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, w, w); });
		this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
		this.ballShadow = this.blob(0.3); sc.add(this.ballShadow);
		this.prevBall = null;
		// players (pictures on planes; drawn stand-ins until the pictures arrive)
		this.tex = {};
		var fall = {
			"wall-player": figure("#1c4aa0", "#f8f9fa", false), "keeper-ready": figure("#a9e34b", "#212529", true), "keeper-dive": diveFigure(), kicker: figure("#c92a2a", "#f8f9fa", false, true)
		};
		Object.keys(fall).forEach(function (n) {
			self.tex[n] = { t: canvasTex(256, 512, fall[n].draw), ar: fall[n].ar };
			if (n === "keeper-dive") self.tex[n] = { t: canvasTex(512, 256, fall[n].draw), ar: fall[n].ar };
			new THREE.TextureLoader().load(IMG + n + ".png?v=1", function (t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; self.tex[n] = { t: t, ar: t.image.width / t.image.height }; self.refreshSprites(); self.draw(); });
		});
		this.wallGroup = new THREE.Group(); sc.add(this.wallGroup);
		this.keeper = this.sprite("keeper-ready", 1.95); sc.add(this.keeper);
		this.keeperShadow = this.blob(0.8); sc.add(this.keeperShadow);
		this.kicker = this.sprite("kicker", 1.8); sc.add(this.kicker);
		this.kickerShadow = this.blob(0.6); sc.add(this.kickerShadow);
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
	function figure(shirt, shorts, gloves, back) {
		return { ar: 0.5, draw: function (c, w, h) {
			c.fillStyle = "#3b2a20"; c.beginPath(); c.arc(w / 2, h * 0.1, w * 0.12, 0, 7); c.fill();
			if (!back) { c.fillStyle = "#e6b98f"; c.beginPath(); c.arc(w / 2, h * 0.12, w * 0.1, 0, 7); c.fill(); }
			c.fillStyle = shirt; c.fillRect(w * 0.28, h * 0.19, w * 0.44, h * 0.33);
			c.fillRect(w * 0.14, h * 0.2, w * 0.14, h * 0.24); c.fillRect(w * 0.72, h * 0.2, w * 0.14, h * 0.24);
			if (gloves) { c.fillStyle = "#f8f9fa"; c.fillRect(w * 0.12, h * 0.42, w * 0.17, h * 0.06); c.fillRect(w * 0.71, h * 0.42, w * 0.17, h * 0.06); }
			c.fillStyle = shorts; c.fillRect(w * 0.29, h * 0.52, w * 0.42, h * 0.13);
			c.fillStyle = "#e6b98f"; c.fillRect(w * 0.32, h * 0.65, w * 0.13, h * 0.2); c.fillRect(w * 0.55, h * 0.65, w * 0.13, h * 0.2);
			c.fillStyle = shirt; c.fillRect(w * 0.31, h * 0.78, w * 0.15, h * 0.14); c.fillRect(w * 0.54, h * 0.78, w * 0.15, h * 0.14);
			c.fillStyle = "#111"; c.fillRect(w * 0.29, h * 0.93, w * 0.18, h * 0.05); c.fillRect(w * 0.53, h * 0.93, w * 0.18, h * 0.05);
		} };
	}
	function diveFigure() {
		return { ar: 2, draw: function (c, w, h) {
			c.fillStyle = "#a9e34b"; c.fillRect(w * 0.3, h * 0.38, w * 0.38, h * 0.26);
			c.fillStyle = "#212529"; c.fillRect(w * 0.18, h * 0.38, w * 0.13, h * 0.26);
			c.fillStyle = "#e6b98f"; c.fillRect(w * 0.04, h * 0.42, w * 0.15, h * 0.08); c.fillRect(w * 0.04, h * 0.53, w * 0.15, h * 0.08);
			c.fillStyle = "#a9e34b"; c.fillRect(w * 0.68, h * 0.36, w * 0.18, h * 0.09); c.fillRect(w * 0.68, h * 0.56, w * 0.18, h * 0.09);
			c.fillStyle = "#f8f9fa"; c.fillRect(w * 0.86, h * 0.34, w * 0.09, h * 0.13); c.fillRect(w * 0.86, h * 0.54, w * 0.09, h * 0.13);
			c.fillStyle = "#3b2a20"; c.beginPath(); c.arc(w * 0.74, h * 0.5, h * 0.11, 0, 7); c.fill();
		} };
	}
	View.prototype.blob = function (r) { var m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), this.shadowMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1; return m; };
	View.prototype.sprite = function (name, hgt) {
		var t = this.tex[name], mat = new THREE.MeshBasicMaterial({ map: t.t, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide });
		var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
		m.userData = { name: name, h: hgt }; m.scale.set(hgt * t.ar, hgt, 1);
		return m;
	};
	View.prototype.setTex = function (m, name) {
		if (m.userData.name === name && m.material.map === this.tex[name].t) return;
		var t = this.tex[name]; m.userData.name = name; m.material.map = t.t; m.material.needsUpdate = true;
		m.scale.set(m.userData.h * t.ar, m.userData.h, 1);
	};
	View.prototype.refreshSprites = function () {
		var self = this;
		[this.keeper, this.kicker].concat(this.wallGroup.children.filter(function (c) { return c.userData.name; })).forEach(function (m) { var n = m.userData.name; m.userData.name = ""; self.setTex(m, n); });
	};
	View.prototype.ringMesh = function (col, r, cross) {
		var g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthTest: false });
		g.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 40), mat));
		if (cross) { var a = new THREE.Mesh(new THREE.PlaneGeometry(r * 3, 0.03), mat), b = new THREE.Mesh(new THREE.PlaneGeometry(0.03, r * 3), mat); g.add(a); g.add(b); }
		g.renderOrder = 5; g.children.forEach(function (c) { c.renderOrder = 5; });
		return g;
	};
	View.prototype.size = function (w, h) {
		w = Math.max(50, Math.round(w)); h = Math.max(50, Math.round(h));
		if (w === this.w && h === this.h) return;
		this.w = w; this.h = h;
		this.renderer.setSize(w, h, false);
		this.renderer.domElement.style.width = w + "px"; this.renderer.domElement.style.height = h + "px";
		this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
	};
	function setPts(line, pts) { line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(pts); }
	function V(x, y, z) { return new THREE.Vector3(x, z, y); }     // pitch (x, y, z) -> three
	View.prototype.frame = function (info) { this.info = info; this.draw(); };
	View.prototype.draw = function () {
		var I = this.info; if (!I) return;
		var G = this.G, s = I.setup, sc = this.scene, self = this;
		var dk = !!I.dark;
		sc.background.set(dk ? "#1a2a3c" : "#8fc3ea"); sc.fog.color.set(dk ? "#1a2a3c" : "#a9cfe9");
		this.netMat.opacity = dk ? 0.38 : 0.5;
		// wall
		var wk = I.wall.map(function (p) { return p.x + "," + p.y; }).join("|");
		if (wk !== this.wallKey) {
			this.wallKey = wk;
			while (this.wallGroup.children.length) this.wallGroup.remove(this.wallGroup.children[0]);
			I.wall.forEach(function () { self.wallGroup.add(self.sprite("wall-player", 1.86)); self.wallGroup.add(self.blob(0.45)); });
		}
		var camPos = this.cam.position;
		I.wall.forEach(function (p, i) {
			var m = self.wallGroup.children[i * 2], sh = self.wallGroup.children[i * 2 + 1];
			m.position.copy(V(p.x, p.y, I.lift + 0.93));
			m.rotation.set(0, Math.atan2(camPos.x - m.position.x, camPos.z - m.position.z), 0);
			sh.position.set(p.x, 0.013, p.y);
		});
		// keeper
		var k = I.keeper;
		if (k.dive && k.s > 0.15) {
			this.setTex(this.keeper, "keeper-dive");
			var mx = (k.ax + k.hx) / 2, mz = (k.az + k.hz) / 2, dx = k.hx - k.ax, dz = k.hz - k.az, len = Math.sqrt(dx * dx + dz * dz);
			var t = this.tex["keeper-dive"], wd = len * 1.15;
			var flip = dx < 0;
			this.keeper.scale.set(flip ? -wd : wd, wd / t.ar, 1);
			this.keeper.position.copy(V(mx, k.y, mz));
			this.keeper.rotation.set(0, 0, flip ? -Math.atan2(dz, -dx) : Math.atan2(dz, dx));
			this.keeperShadow.position.set(mx, 0.013, k.y); this.keeperShadow.scale.set(1.6, 0.6, 1);
		} else {
			this.setTex(this.keeper, "keeper-ready");
			this.keeper.position.copy(V(k.ax, k.y, 0.975));
			this.keeper.rotation.set(0, Math.atan2(camPos.x - k.ax, camPos.z - k.y), 0);
			this.keeperShadow.position.set(k.ax, 0.013, k.y); this.keeperShadow.scale.set(1, 1, 1);
		}
		// kicker: runs in from behind and to the left, then stays by the ball
		var dxg = -s.bx, dyg = G.lineY - s.by, dl = Math.sqrt(dxg * dxg + dyg * dyg), ux = dxg / dl, uy = dyg / dl;
		var p0 = { x: s.bx - ux * 2.0 + uy * 1.1, y: s.by - uy * 2.0 - ux * 1.1 }, p1 = { x: s.bx - ux * 0.45 + uy * 0.75, y: s.by - uy * 0.45 - ux * 0.75 };
		var pr = I.kicker, kx = p0.x + (p1.x - p0.x) * pr, ky = p0.y + (p1.y - p0.y) * pr;
		if (I.flying) { var fw = Math.min(1, I.t * 2) * 0.8; kx += ux * fw; ky += uy * fw; }
		this.kicker.position.copy(V(kx, ky, 0.9 + Math.abs(Math.sin(pr * Math.PI * 4)) * 0.05 * (pr < 1 ? 1 : 0)));
		this.kicker.rotation.set(0, Math.atan2(camPos.x - kx, camPos.z - ky), 0);
		this.kickerShadow.position.set(kx, 0.013, ky);
		// ball (rolls / spins with its movement)
		var b = I.ball;
		this.ball.position.copy(V(b[0], b[1], b[2]));
		if (this.prevBall) { var mvx = b[0] - this.prevBall[0], mvy = b[1] - this.prevBall[1], d = Math.sqrt(mvx * mvx + mvy * mvy); if (d > 1e-4 && d < 2) { this.ball.rotateOnWorldAxis(new THREE.Vector3(mvy / d, 0, -mvx / d).normalize(), -d / G.R); } }
		this.prevBall = b.slice();
		this.ballShadow.position.set(b[0], 0.012, b[1]);
		var sz = Math.max(0.35, 1 - b[2] * 0.18); this.ballShadow.scale.set(sz, sz, 1); this.ballShadow.material.opacity = sz;
		// trail
		if (!I.flying) this.trailPts = [];
		else { var lp = this.trailPts[this.trailPts.length - 1]; if (!lp || Math.abs(lp.x - b[0]) + Math.abs(lp.z - b[1]) + Math.abs(lp.y - b[2]) > 0.15) this.trailPts.push(V(b[0], b[1], b[2])); }
		setPts(this.trail, this.trailPts.length > 1 ? this.trailPts : [V(0, 0, -5), V(0, 0, -5)]);
		// guide
		if (I.guide && I.guide.length > 1) { this.guide.visible = true; setPts(this.guide, I.guide.map(function (p) { return V(p[0], p[1], p[2]); })); this.guide.computeLineDistances(); }
		else this.guide.visible = false;
		// marks
		this.aimMark.visible = !!I.aim; if (I.aim) this.aimMark.position.copy(V(I.aim.x, G.lineY + 0.02, I.aim.z));
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
		// camera
		var e, l, back = { x: -ux, y: -uy };
		if (I.cam === "keeper") { e = V((s.kx || 0) * 0.6, -1.7, 1.75); l = V(b[0] * 0.5 + s.bx * 0.5, b[1] * 0.5 + s.by * 0.5, Math.max(0.6, b[2] * 0.6)); }
		else if (I.cam === "tv") { var sd = s.bx > 0 ? -1 : 1; e = V(sd * 30, s.by * 0.55 + 3, 13); l = V(b[0] * 0.4, Math.max(2, b[1] * 0.55), 1); }
		else if (I.cam === "high") { e = V(s.bx + back.x * 13, s.by + back.y * 13, 9); l = V(0, 0, 1); }
		else {
			// behind the ball: fit the ball (near the bottom) and the crossbar (near the top), and the goal's width
			var bk = 7, hh = 2.4, gd = Math.sqrt(s.bx * s.bx + (s.by - G.lineY) * (s.by - G.lineY)) + bk;
			var aB = Math.atan2(-(hh - 0.1), bk), aT = Math.atan2(2.7 - hh, gd), asp = this.w / this.h;
			var vf = (aT - aB) * 1.2, needH = Math.atan(5.6 / gd);
			vf = Math.max(vf, 2 * Math.atan(Math.tan(needH) / asp));
			var mid = (aT + aB) / 2 - (vf - (aT - aB) * 1.2) * 0.1;
			e = V(s.bx + back.x * bk - uy * 0.9, s.by + back.y * bk + ux * 0.9, hh);
			var hx2 = -back.x, hy2 = -back.y;
			l = V(s.bx + back.x * bk + hx2 * 10 * Math.cos(mid), s.by + back.y * bk + hy2 * 10 * Math.cos(mid), hh + 10 * Math.sin(mid));
			this.behindFov = vf * 180 / Math.PI;
		}
		var lerp = this.camInit ? 0.16 : 1; this.camInit = true;
		if (this.lastCam !== I.cam) lerp = 0.35; this.lastCam = I.cam;
		this.eye.lerp(e, lerp); this.look.lerp(l, lerp);
		this.cam.position.copy(this.eye); this.cam.lookAt(this.look);
		this.cam.fov = I.cam === "keeper" ? 62 : I.cam === "tv" || I.cam === "high" ? 38 : Math.min(75, this.behindFov || 40); this.cam.updateProjectionMatrix();
		this.renderer.render(sc, this.cam);
		if (this.eye.distanceTo(e) > 0.02 && !this.raf) { this.raf = requestAnimationFrame(function () { self.raf = 0; self.draw(); }); }
	};
	View.prototype.pickGoal = function (cx, cy) {
		var r = this.renderer.domElement.getBoundingClientRect(), G = this.G;
		var nd = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
		this.ray.setFromCamera(nd, this.cam);
		var pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -G.lineY), hit = new THREE.Vector3();
		if (!this.ray.ray.intersectPlane(pl, hit)) return null;
		if (Math.abs(hit.x) > 7 || hit.y > 4.5 || hit.y < -0.5) return null;
		return { x: hit.x, z: hit.y };
	};
	View.prototype.hover = function (cx, cy) { var g = this.pickGoal(cx, cy); this.renderer.domElement.style.cursor = g ? "crosshair" : ""; };
	window.FK3D = { create: create, load: load };
})();
