/* MES Falling Blocks: the 3D view (window.BK3D). Only drawing: it reads the same Game object the 2D canvas draws, so 2D / 3D can be switched
   mid-game. three.js 0.170.0 from jsDelivr (unpkg fallback), loaded the first time 3D is chosen.
   Units: 1 = one cell. The visible well is 10 x 20, x 0..10 left to right, y 0..20 bottom to top, z = depth (front face at z = 0.5).
   API: BK3D.create(container) -> Promise<view>; view.draw(game, opts {ghost, flash:[rows], dark}); view.size(w, h); view.orbit(dx, dy);
   view.zoom(f); view.reset(); view.moved(); view.dispose(). */
(function () {
	"use strict";
	if (typeof document === "undefined" || typeof window === "undefined") return;
	var THREE = null, loading = null;
	var URLS = ["https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "https://unpkg.com/three@0.170.0/build/three.module.min.js"];
	function load() {
		if (THREE) return Promise.resolve(THREE);
		if (loading) return loading;
		var imp = new Function("u", "return import(u)");
		loading = imp(URLS[0]).catch(function () { return imp(URLS[1]); }).then(function (m) { THREE = m; return m; }, function (e) { loading = null; throw e; });
		return loading;
	}
	var W = 10, H = 20, MAXI = W * H + 8;

	function View(box) {
		var B = window.MESBlocks;
		this.box = box;
		var r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
		r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		r.outputColorSpace = THREE.SRGBColorSpace;
		r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
		box.appendChild(r.domElement);
		r.domElement.style.display = "block";
		var s = this.scene = new THREE.Scene();
		this.cam = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
		this.yaw = -0.18; this.pitch = 0.1; this.dist = 52;
		s.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3040, 1.5));
		var key = new THREE.DirectionalLight(0xffffff, 2.4);
		key.position.set(-8, 30, 22); key.castShadow = true;
		key.shadow.mapSize.set(1024, 1024);
		var sc = key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 80;
		key.target.position.set(W / 2, H / 2, 0); s.add(key); s.add(key.target);
		var rim = new THREE.PointLight(0x7aa2ff, 30, 40); rim.position.set(14, 4, 6); s.add(rim);
		// the well: a back panel, side walls and a floor
		var wellMat = this.backMat = new THREE.MeshStandardMaterial({ color: 0x151a24, roughness: 0.9, transparent: true });
		var back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, H + 0.4, 0.3), wellMat); back.position.set(W / 2, H / 2, -0.75); back.receiveShadow = true; s.add(back);
		var sideMat = this.sideMat = new THREE.MeshStandardMaterial({ color: 0x2b3446, roughness: 0.6, metalness: 0.2, transparent: true });
		[[-0.25], [W + 0.25]].forEach(function (p) { var m = new THREE.Mesh(new THREE.BoxGeometry(0.5, H + 0.5, 1.6), sideMat); m.position.set(p[0], H / 2 - 0.25, -0.05); m.castShadow = m.receiveShadow = true; s.add(m); });
		var floor = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 0.5, 1.6), sideMat); floor.position.set(W / 2, -0.25, -0.05); floor.receiveShadow = true; s.add(floor);
		// faint grid on the back panel
		var gpts = [];
		for (var x = 1; x < W; x++) gpts.push(x, 0, -0.59, x, H, -0.59);
		for (var y = 1; y < H; y++) gpts.push(0, y, -0.59, W, y, -0.59);
		var gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(gpts, 3));
		this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x3a4458, transparent: true, opacity: 0.55 }));
		s.add(this.grid);
		// cells
		var geo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
		var mat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.08 });
		this.cells = new THREE.InstancedMesh(geo, mat, MAXI);
		this.cells.castShadow = true; this.cells.receiveShadow = true;
		this.cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		s.add(this.cells);
		this.ghost = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.6, depthWrite: false }), 4);
		s.add(this.ghost);
		this.flash = new THREE.Mesh(new THREE.BoxGeometry(W, 1, 1.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
		s.add(this.flash);
		this.flashes = [];
		this.cols = B.COLORS.map(function (c) { return new THREE.Color(c || "#000"); });
		this.m4 = new THREE.Matrix4(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
		this.w = 300; this.h = 600;
		this.place();
		this.fade();
	}
	View.prototype.place = function () {
		var d = this.dist, cx = W / 2, cy = H / 2;
		this.cam.position.set(cx + Math.sin(this.yaw) * d * Math.cos(this.pitch), cy + Math.sin(this.pitch) * d, Math.cos(this.yaw) * d * Math.cos(this.pitch));
		this.cam.lookAt(cx, cy, 0);
		this.fade();
	};
	/** the walls fade as the camera swings round, so the blocks are never hidden behind them */
	View.prototype.fade = function () {
		if (!this.backMat) return;
		var front = Math.cos(this.yaw) * Math.cos(this.pitch);           // 1 = straight in front, < 0 = behind
		var side = Math.abs(Math.sin(this.yaw)) * Math.cos(this.pitch);   // 1 = looking along the well from the side
		var bo = Math.max(0.1, Math.min(1, (front - 0.15) / 0.45));
		var so = Math.max(0.15, Math.min(1, 1 - (side - 0.35) / 0.4));
		this.backMat.opacity = bo; this.backMat.depthWrite = bo > 0.95;
		this.sideMat.opacity = so; this.sideMat.depthWrite = so > 0.95;
		if (this.grid) this.grid.material.opacity = 0.55 * bo;
	};
	/** orbit all the way round (yaw) and from below to nearly straight above (pitch) */
	View.prototype.orbit = function (dx, dy) {
		this.yaw = (this.yaw + dx) % (Math.PI * 2);
		this.pitch = Math.max(-1.15, Math.min(1.35, this.pitch + dy));
		this.place();
	};
	View.prototype.tilt = View.prototype.orbit;
	/** f > 1 = closer */
	View.prototype.zoom = function (f) { this.dist = Math.max(26, Math.min(120, this.dist / f)); this.place(); };
	View.prototype.reset = function () { this.yaw = -0.18; this.pitch = 0.1; this.dist = 52; this.place(); };
	View.prototype.moved = function () { return Math.abs(this.yaw + 0.18) > 0.01 || Math.abs(this.pitch - 0.1) > 0.01 || Math.abs(this.dist - 52) > 0.5; };
	/** w x h = the whole stage; c = pixels per cell, (bx, by) = centre of the 2D board, so the front view lines up with it */
	View.prototype.size = function (w, h, c, bx, by) {
		w = Math.max(50, Math.round(w)); h = Math.max(80, Math.round(h));
		var key = [w, h, c, bx, by].join();
		if (key === this.key) return;
		this.key = key; this.w = w; this.h = h;
		this.renderer.setSize(w, h);
		this.cam.aspect = w / h;
		this.cam.fov = 2 * Math.atan((h / (c || h / 23)) / 2 / 52) * 180 / Math.PI;
		if (bx != null) this.cam.setViewOffset(w, h, Math.round(w / 2 - bx), Math.round(h / 2 - by), w, h); else this.cam.clearViewOffset();
		this.cam.updateProjectionMatrix();
	};
	/** draw the game's state; flash = rows (visible index 0 = top) clearing right now */
	View.prototype.draw = function (g, o) {
		var B = window.MESBlocks, n = 0, m4 = this.m4, cells = this.cells, HID = B.HID;
		o = o || {};
		function put(x, row, col) {
			m4.makeTranslation(x + 0.5, H - 1 - row + 0.5, 0);
			cells.setMatrixAt(n, m4); cells.setColorAt(n, col); n++;
		}
		if (g) {
			var b = g.board;
			for (var y = HID; y < B.H; y++) for (var x = 0; x < W; x++) { var v = b[y * W + x]; if (v) put(x, y - HID, this.cols[v]); }
			var c = g.cur, gi = 0;
			if (c) {
				var col = this.cols[B.PIECES.indexOf(c.p) + 1], s = B.SHAPES[c.p][c.r];
				for (var i = 0; i < 4; i++) { var py = c.y + s[i][1]; if (py >= HID - 1) put(c.x + s[i][0], py - HID, col); }
				if (o.ghost !== false) {
					var gy = g.ghostY();
					if (gy !== c.y) for (var j = 0; j < 4; j++) { var qy = gy + s[j][1]; if (qy >= HID) { m4.makeTranslation(c.x + s[j][0] + 0.5, H - 1 - (qy - HID) + 0.5, 0); this.ghost.setMatrixAt(gi++, m4); } }
				}
			}
			for (; gi < 4; gi++) this.ghost.setMatrixAt(gi, this.zero);
			this.ghost.instanceMatrix.needsUpdate = true;
		}
		for (var k = n; k < MAXI; k++) cells.setMatrixAt(k, this.zero);
		cells.count = MAXI;
		cells.instanceMatrix.needsUpdate = true;
		if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
		// line-clear flash (the first flashing row only: enough to see it)
		var fl = o.flash;
		if (fl && fl.rows && fl.rows.length) {
			this.flash.position.set(W / 2, H - 1 - fl.rows[0] + 0.5 - (fl.rows.length - 1) / 2, 0);
			this.flash.scale.set(1, fl.rows.length, 1);
			this.flash.material.opacity = Math.max(0, fl.a) * 0.85;
		} else this.flash.material.opacity = 0;
		this.renderer.render(this.scene, this.cam);
	};
	View.prototype.dispose = function () {
		this.renderer.dispose();
		if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
	};
	window.BK3D = {
		load: load,
		create: function (box) { return load().then(function () { return new View(box); }); }
	};
})();
