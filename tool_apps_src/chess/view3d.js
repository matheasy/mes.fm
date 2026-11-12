/* MES Chess: the 3D view (window.CH3D). Only drawing: rules, moves and the position come from lib.js / app.js exactly as in 2D, so a game can
   switch between 2D and 3D at any moment (online and Hive games too). three.js 0.170.0 is loaded from jsDelivr (unpkg fallback) only when 3D is
   first chosen. Units: 1 = one square. The board is 8 x 8 centred at the origin with its top at Y = 0; X = file (a = -3.5 ... h = +3.5),
   Z = rank (rank 1 at Z = +3.5, rank 8 at Z = -3.5), so White sits on the +Z side.
   API: CH3D.create(container) -> Promise<view>; view.setPosition({b, flip, last, check, sel, targets, anim}), view.pick(clientX, clientY) -> square,
   view.setRoom(id), view.setSet(id), view.setCam(mode), view.orbit(dx, dy), view.zoom(f), view.resetView(), view.size(w, h), view.render(),
   view.png(), view.setCoords(on), view.dispose(). Everything (pieces, rooms, textures) is drawn by code: no image files. */
(function () {
	"use strict";
	if (typeof document === "undefined" || typeof window === "undefined") return;     // the same file also runs as the computer's Web Worker
	var THREE = null, loading = null;
	var URLS = ["https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "https://unpkg.com/three@0.170.0/build/three.module.min.js"];
	function load() {
		if (THREE) return Promise.resolve(THREE);
		if (loading) return loading;
		var imp = new Function("u", "return import(u)");
		loading = imp(URLS[0]).catch(function () { return imp(URLS[1]); }).then(function (m) { THREE = m; return m; }, function (e) { loading = null; throw e; });
		return loading;
	}
	var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	var M = 18;    // squares per metre (a 5.5 cm square): room furniture is sized in metres * M

	var ROOMS = [{ id: "club", name: "Chess club" }, { id: "tournament", name: "Tournament hall" }, { id: "park", name: "Park table" },
		{ id: "home", name: "Living room" }, { id: "space", name: "Space" }, { id: "screens", name: "Video call fans" }, { id: "dark", name: "Plain (fastest)" }];
	var SETS = [{ id: "wood", name: "Wood" }, { id: "marble", name: "Marble" }, { id: "glass", name: "Glass" }, { id: "tournament", name: "Tournament" }];

	function tex(w, h, draw) { var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
	function std(col, rough, extra) { var o = { color: col, roughness: rough === undefined ? 0.85 : rough, metalness: 0 }; if (extra) for (var k in extra) o[k] = extra[k]; return new THREE.MeshStandardMaterial(o); }
	function box(g, w, h, d, mat, x, y, z, shadow) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; } g.add(m); return m; }
	function cyl(g, rt, rb, h, mat, x, y, z, seg) { var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 24), mat); m.position.set(x, y, z); g.add(m); return m; }
	function disposeTree(o) { o.traverse(function (x) { if (x.geometry && !x.geometry.userData.keep) x.geometry.dispose(); if (x.material && !x.material.userData.keep) { (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
	function rng(seed) { var a = seed || 12345; return function () { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; }
	function noiseTex(base, vary, lines, seed) {   // wood grain / marble veins on a small canvas
		var r = rng(seed);
		return tex(256, 256, function (c, w, h) {
			c.fillStyle = base; c.fillRect(0, 0, w, h);
			for (var i = 0; i < lines; i++) {
				c.strokeStyle = vary[(r() * vary.length) | 0]; c.globalAlpha = 0.18 + r() * 0.35; c.lineWidth = 0.6 + r() * 2.2;
				c.beginPath(); var y = r() * h, x = 0; c.moveTo(x, y);
				while (x < w) { x += 12 + r() * 20; y += (r() - 0.5) * 9; c.lineTo(x, y); }
				c.stroke();
			}
			c.globalAlpha = 1;
		});
	}

	/* ---------- piece sets ---------- */
	function setLook(id) {
		if (id === "marble") return { light: "#e9e4dc", dark: "#3f4a4f", lightV: ["#b9b3aa", "#d3cdc4"], darkV: ["#6f7b80", "#24292c"], frame: "#2c2622", frameV: ["#46392f"], coord: "#d9d3c7",
			w: { color: "#f3efe8", roughness: 0.25, metalness: 0.05 }, b: { color: "#202426", roughness: 0.25, metalness: 0.05 }, accW: "#bdb6aa", accB: "#55606a" };
		if (id === "glass") return { light: "#c9dcea", dark: "#3e5f7a", lightV: ["#e4eff8"], darkV: ["#2d4a62"], frame: "#20303e", frameV: ["#2f4558"], coord: "#cfe4f5",
			w: { color: "#eaf6ff", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.62 }, b: { color: "#1e3a5c", roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.7 }, accW: "#9fd2ff", accB: "#79b8ff" };
		if (id === "tournament") return { light: "#eeeed2", dark: "#769656", lightV: [], darkV: [], frame: "#f5f3ea", frameV: [], coord: "#4b5d3a",
			w: { color: "#f5f1e6", roughness: 0.45, metalness: 0 }, b: { color: "#161616", roughness: 0.45, metalness: 0 }, accW: "#d8d2c0", accB: "#3a3a3a" };
		return { light: "#e6c79a", dark: "#8a5a34", lightV: ["#d4b07c", "#c79f6a"], darkV: ["#6e4424", "#a06a3e"], frame: "#5a3418", frameV: ["#3f230f", "#73441f"], coord: "#f1dcb8",
			w: { color: "#efe2c6", roughness: 0.5, metalness: 0 }, b: { color: "#2a1a10", roughness: 0.45, metalness: 0 }, accW: "#c9b48c", accB: "#5a3a22" };
	}

	/* ---------- piece geometry (built once, shared by every piece) ---------- */
	var GEO = null;
	function arc(pts, cy, r, a0, a1, n) { for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; pts.push([Math.max(0.0001, r * Math.cos(a)), cy + r * Math.sin(a)]); } }
	function lathe(pts) { var g = new THREE.LatheGeometry(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 40); g.computeVertexNormals(); g.userData.keep = true; return g; }
	function basePts(rb, top) {   // shared foot: a flat bottom, a rounded plinth and a collar
		return [[0.0001, 0], [rb, 0], [rb, 0.05], [rb - 0.02, 0.075], [rb * 0.92, 0.1], [rb * 0.78, 0.13], [rb * 0.7, top]];
	}
	function buildGeo() {
		var g = {}, p;
		p = basePts(0.3, 0.15).concat([[0.16, 0.2], [0.12, 0.3], [0.1, 0.38], [0.17, 0.4], [0.17, 0.425], [0.1, 0.44]]);
		arc(p, 0.53, 0.12, -Math.PI / 2 + 0.55, Math.PI / 2, 10); p.push([0.0001, 0.65]);
		g.P = lathe(p);
		p = basePts(0.33, 0.16).concat([[0.2, 0.22], [0.16, 0.42], [0.15, 0.56], [0.2, 0.58], [0.2, 0.61], [0.13, 0.63]]);
		arc(p, 0.74, 0.13, -Math.PI / 2 + 0.3, Math.PI / 2 - 0.5, 10); p.push([0.03, 0.87]); arc(p, 0.9, 0.035, -Math.PI / 2, Math.PI / 2, 5);
		g.B = lathe(p);
		p = basePts(0.34, 0.16).concat([[0.23, 0.22], [0.2, 0.5], [0.24, 0.55], [0.25, 0.62], [0.25, 0.7], [0.0001, 0.7]]);
		g.R = lathe(p);
		g.Rc = new THREE.BoxGeometry(0.11, 0.1, 0.1); g.Rc.userData.keep = true;
		p = basePts(0.36, 0.17).concat([[0.22, 0.24], [0.15, 0.55], [0.14, 0.72], [0.22, 0.75], [0.22, 0.78], [0.15, 0.8], [0.2, 0.92], [0.21, 0.95], [0.0001, 0.95]]);
		g.Q = lathe(p);
		g.Qb = new THREE.SphereGeometry(0.04, 12, 8); g.Qb.userData.keep = true;
		g.Qt = new THREE.SphereGeometry(0.06, 16, 10); g.Qt.userData.keep = true;
		p = basePts(0.37, 0.17).concat([[0.23, 0.24], [0.16, 0.58], [0.15, 0.76], [0.23, 0.79], [0.23, 0.82], [0.16, 0.84], [0.2, 0.98], [0.21, 1.0], [0.12, 1.03], [0.0001, 1.04]]);
		g.K = lathe(p);
		g.Kv = new THREE.BoxGeometry(0.06, 0.22, 0.06); g.Kv.userData.keep = true;
		g.Kh = new THREE.BoxGeometry(0.17, 0.06, 0.06); g.Kh.userData.keep = true;
		g.Bs = new THREE.BoxGeometry(0.2, 0.018, 0.06); g.Bs.userData.keep = true;
		g.Nb = lathe(basePts(0.33, 0.24).concat([[0.2, 0.26], [0.0001, 0.26]]));
		// the knight's head: a side silhouette (forward = +x) extruded and bevelled
		var s = new THREE.Shape(), H = [[-0.22, 0.24], [0.18, 0.24], [0.12, 0.36], [0.1, 0.47], [0.24, 0.56], [0.33, 0.64], [0.32, 0.7], [0.26, 0.74], [0.1, 0.86],
			[0.06, 0.95], [-0.01, 1.0], [-0.06, 0.92], [-0.18, 0.84], [-0.25, 0.68], [-0.27, 0.5], [-0.25, 0.36]];
		s.moveTo(H[0][0], H[0][1]); for (var i = 1; i < H.length; i++) s.lineTo(H[i][0], H[i][1]); s.closePath();
		var kn = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3, curveSegments: 6 });
		kn.translate(0, 0, -0.08); kn.computeVertexNormals(); kn.userData.keep = true;
		g.Nh = kn;
		g.Ne = new THREE.SphereGeometry(0.025, 8, 6); g.Ne.userData.keep = true;
		return g;
	}
	function makePiece(type, mats) {
		var white = type === type.toUpperCase(), t = type.toUpperCase(), mat = white ? mats.w : mats.b, acc = white ? mats.accW : mats.accB, g = new THREE.Group(), G = GEO;
		function add(geo, m, x, y, z) { var o = new THREE.Mesh(geo, m || mat); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; }
		if (t === "N") {
			add(G.Nb);
			var h = add(G.Nh, null, 0, 0.02, 0);
			h.rotation.y = Math.PI / 2;      // forward (+x of the shape) -> -z: toward Black's side
			add(G.Ne, acc, -0.105, 0.82, -0.18); add(G.Ne, acc, 0.105, 0.82, -0.18);
			if (!white) g.rotation.y = Math.PI;
		} else {
			add(G[t]);
			if (t === "R") for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3, c = add(G.Rc, null, Math.cos(a) * 0.19, 0.74, Math.sin(a) * 0.19); c.rotation.y = -a; }
			if (t === "Q") { for (var j = 0; j < 8; j++) { var b = j * Math.PI / 4; add(G.Qb, null, Math.cos(b) * 0.19, 0.97, Math.sin(b) * 0.19); } add(G.Qt, acc, 0, 1.01, 0); }
			if (t === "K") { add(G.Kv, acc, 0, 1.15, 0); add(G.Kh, acc, 0, 1.17, 0); }
			if (t === "B") { var sl = add(G.Bs, acc, 0, 0.79, 0); sl.rotation.z = 0.6; sl.rotation.y = white ? 0 : Math.PI; }
		}
		g.userData.type = type;
		return g;
	}

	/* ---------- the view ---------- */
	function create(container) {
		return load().then(function () {
			var t = document.createElement("canvas");
			if (!(t.getContext("webgl2") || t.getContext("webgl"))) throw new Error("WebGL is switched off in this browser");
			if (!GEO) GEO = buildGeo();
			return new View(container);
		});
	}
	function sqX(s) { return (s & 7) - 3.5; }
	function sqZ(s) { return 3.5 - (s >> 3); }

	function View(el) {
		this.el = el;
		var R = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
		R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
		R.domElement.className = "ch-cv3";
		R.domElement.style.width = "100%"; R.domElement.style.height = "100%"; R.domElement.style.display = "block";
		el.appendChild(R.domElement);
		this.scene = new THREE.Scene();
		this.cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 900);
		this.cur = { eye: new THREE.Vector3(0, 9, 11), look: new THREE.Vector3(0, 0, 0.3), up: new THREE.Vector3(0, 1, 0) };
		this.camMode = "auto"; this.zoomF = 1; this.free = { yaw: 0, pitch: 0 }; this.orb = { th: Math.PI / 2, ph: 0.75, d: 13 };
		this.flip = false; this.coords = true; this.setId = "wood"; this.roomName = "club";
		this.ray = new THREE.Raycaster();
		this.scene.add(new THREE.HemisphereLight("#fff6e8", "#2a2018", 0.75));
		var key = this.key = new THREE.DirectionalLight("#fff3dd", 1.7);
		key.position.set(-5, 14, 7); key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		var sc = key.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 40; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
		this.scene.add(key); this.scene.add(key.target);
		this.boardG = new THREE.Group(); this.scene.add(this.boardG);
		this.markG = new THREE.Group(); this.scene.add(this.markG);
		this.pieceG = new THREE.Group(); this.scene.add(this.pieceG);
		this.pieces = new Array(64); this.moves = []; this.pos = null;
		this.w = 300; this.h = 300; this.raf = 0; this.anims = [];
		this.buildMats(); this.buildBoard(); this.buildMarkers();
		this.setRoom("club");
	}
	View.prototype.buildMats = function () {
		var L = setLook(this.setId), keep = function (m) { m.userData.keep = true; return m; }, pc = this.pieceCols;
		if (pc) {   // the player's own piece colours (easier to see than ivory on a light board)
			L = Object.assign({}, L, { w: Object.assign({}, L.w, { color: pc[0] }), b: Object.assign({}, L.b, { color: pc[1] }) });
			if (L.w.map) delete L.w.map; if (L.b.map) delete L.b.map;
		}
		if (this.mats) ["w", "b", "accW", "accB"].forEach(function (k) { this.mats[k].dispose(); }, this);
		this.look = L;
		this.mats = { w: keep(new THREE.MeshStandardMaterial(L.w)), b: keep(new THREE.MeshStandardMaterial(L.b)), accW: keep(std(L.accW, 0.4)), accB: keep(std(L.accB, 0.4)) };
	};
	View.prototype.buildBoard = function () {
		var L = this.look, g = this.boardG, coords = this.coords;
		this.roomAnims = this.roomAnims || [];
		while (g.children.length) { var c0 = g.children.pop(); disposeTree(c0); }
		var B = 0.6, N = 8 + 2 * B, px = 1024, sq = px / N, bp = B * sq;
		var light = L.lightV.length ? noiseTex(L.light, L.lightV, 60, 3) : null, dark = L.darkV.length ? noiseTex(L.dark, L.darkV, 60, 7) : null;
		var frameT = L.frameV.length ? noiseTex(L.frame, L.frameV, 80, 11) : null;
		var t = tex(px, px, function (c, w) {
			if (frameT) { c.drawImage(frameT.image, 0, 0, w, w); c.fillStyle = "rgba(0,0,0,0.12)"; c.fillRect(0, 0, w, w); } else { c.fillStyle = L.frame; c.fillRect(0, 0, w, w); }
			for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
				var isLight = (r + f) % 2 === 1, x = bp + f * sq, y = bp + (7 - r) * sq, src = isLight ? light : dark;
				if (src) c.drawImage(src.image, (f * 37) % 128, (r * 53) % 128, 128, 128, x, y, sq + 0.5, sq + 0.5);
				else { c.fillStyle = isLight ? L.light : L.dark; c.fillRect(x, y, sq + 0.5, sq + 0.5); }
			}
			c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 3; c.strokeRect(bp, bp, 8 * sq, 8 * sq);
			if (coords) {
				c.fillStyle = L.coord; c.font = "700 " + Math.round(bp * 0.5) + "px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
				var F = "abcdefgh";
				for (var i = 0; i < 8; i++) {
					var cx = bp + (i + 0.5) * sq, cy = bp + (7 - i + 0.5) * sq;
					c.fillText(F[i], cx, w - bp / 2);
					c.fillText(String(i + 1), bp / 2, cy);
					c.save(); c.translate(cx, bp / 2); c.rotate(Math.PI); c.fillText(F[i], 0, 0); c.restore();
					c.save(); c.translate(w - bp / 2, cy); c.rotate(Math.PI); c.fillText(String(i + 1), 0, 0); c.restore();
				}
			}
		});
		[light, dark, frameT].forEach(function (x) { if (x) x.dispose(); });
		var top = new THREE.Mesh(new THREE.PlaneGeometry(N, N), std("#ffffff", this.setId === "marble" || this.setId === "glass" ? 0.3 : 0.6, { map: t }));
		top.rotation.x = -Math.PI / 2; top.receiveShadow = true; g.add(top);
		var side = std(L.frame, 0.6);
		box(g, N, 0.32, N, side, 0, -0.165, 0, true);
	};
	View.prototype.buildMarkers = function () {
		var mk = function (col, op) { var m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }); m.userData.keep = true; return m; };
		var sqG = new THREE.PlaneGeometry(1, 1); sqG.userData.keep = true;
		this.mk = {
			sq: sqG, dot: (function () { var d = new THREE.CircleGeometry(0.15, 24); d.userData.keep = true; return d; })(),
			ring: (function () { var d = new THREE.RingGeometry(0.4, 0.48, 32); d.userData.keep = true; return d; })(),
			last: mk("#f6d743", 0.42), sel: mk("#3cb371", 0.55), tgt: mk("#103a20", 0.45),
			chk: (function () {
				var t = tex(128, 128, function (c, w, h) { var gr = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(255,40,40,0.95)"); gr.addColorStop(0.6, "rgba(255,0,0,0.45)"); gr.addColorStop(1, "rgba(255,0,0,0)"); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
				var m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }); m.userData.keep = true; return m;
			})()
		};
	};
	View.prototype.markers = function (p) {
		var g = this.markG, K = this.mk;
		while (g.children.length) g.remove(g.children[g.children.length - 1]);
		function put(geo, mat, s, y) { var m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(sqX(s), y || 0.004, sqZ(s)); m.renderOrder = 2; g.add(m); return m; }
		if (p.last) { if (p.last.f >= 0) put(K.sq, K.last, p.last.f); if (p.last.t >= 0) put(K.sq, K.last, p.last.t); }
		if (p.sel >= 0) put(K.sq, K.sel, p.sel, 0.006);
		if (p.check >= 0) { var c = put(K.sq, K.chk, p.check, 0.008); c.scale.set(1.25, 1.25, 1); }
		(p.targets || []).forEach(function (s) { put(p.b[s] ? K.ring : K.dot, K.tgt, s, 0.01); });
	};

	/* position: keep the meshes that did not move, slide the one that moved */
	View.prototype.setPosition = function (p) {
		p = p || {}; var b = p.b || [], old = this.pieces, next = new Array(64), used = [], self = this, i;
		var flipChanged = !!p.flip !== this.flip; this.flip = !!p.flip;
		function take(s) { var m = old[s]; if (m && used.indexOf(m) < 0) { used.push(m); return m; } return null; }
		function placeAt(m, s) { m.position.set(sqX(s), 0, sqZ(s)); }
		this.anims = this.anims.filter(function (a) { placeAt(a.m, a.to); return false; });   // finish anything still sliding
		var A = p.anim && !REDUCED ? [[p.anim.f, p.anim.t]].concat(p.anim.rf >= 0 && p.anim.rt >= 0 && p.anim.rf !== undefined ? [[p.anim.rf, p.anim.rt]] : []) : [];
		A.forEach(function (mv) {
			var f = mv[0], t = mv[1];
			if (f < 0 || t < 0 || !b[t]) return;
			var m = old[f] && old[f].userData.type === b[t] ? take(f) : null;
			if (!m) { m = makePiece(b[t], self.mats); self.pieceG.add(m); }
			next[t] = m; placeAt(m, f);
			var knight = b[t].toUpperCase() === "N";
			self.anims.push({ m: m, from: f, to: t, t0: performance.now() + (mv === A[1] ? 60 : 0), dur: knight ? 300 : 230 + 12 * Math.hypot(sqX(t) - sqX(f), sqZ(t) - sqZ(f)), hop: knight ? 0.9 : 0 });
		});
		for (i = 0; i < 64; i++) {
			if (next[i] || !b[i]) continue;
			var m = old[i] && old[i].userData.type === b[i] ? take(i) : null;
			if (!m) { m = makePiece(b[i], this.mats); this.pieceG.add(m); }
			placeAt(m, i); next[i] = m;
		}
		old.forEach(function (m) { if (m && used.indexOf(m) < 0 && next.indexOf(m) < 0) self.pieceG.remove(m); });
		this.pieces = next; this.pos = p;
		this.markers(p);
		if (flipChanged && this.camMode !== "orbit") this.free = { yaw: 0, pitch: 0 };
		this.render();
	};
	View.prototype.rebuildPieces = function () {
		var b = this.pos ? this.pos.b : null;
		this.pieces.forEach(function (m) { if (m) this.pieceG.remove(m); }, this);
		this.pieces = new Array(64);
		if (this.pos) this.setPosition({ b: b, flip: this.flip, last: this.pos.last, check: this.pos.check, sel: this.pos.sel, targets: this.pos.targets });
	};
	View.prototype.setSet = function (id) {
		if (!SETS.some(function (s) { return s.id === id; })) id = "wood";
		this.setId = id; this.buildMats(); this.buildBoard(); this.rebuildPieces(); this.render();
	};
	/** cols = [white colour, black colour] or null for the set's own */
	View.prototype.setPieceColors = function (cols) { this.pieceCols = cols || null; this.buildMats(); this.rebuildPieces(); this.render(); };
	View.prototype.setCoords = function (on) { this.coords = on !== false; this.buildBoard(); this.render(); };

	/* ---------- camera ---------- */
	View.prototype.setCam = function (m) { this.camMode = m; this.free = { yaw: 0, pitch: 0 }; this.render(); };
	View.prototype.zoom = function (f) { this.zoomF = Math.max(0.45, Math.min(2.6, this.zoomF * f)); if (this.camMode === "orbit") this.orb.d = Math.max(5, Math.min(40, this.orb.d * f)); this.render(); };
	View.prototype.orbit = function (dx, dy) {
		if (this.camMode === "orbit") { this.orb.th -= dx * 0.008; this.orb.ph = Math.max(0.05, Math.min(1.45, this.orb.ph - dy * 0.006)); }
		else { this.free.yaw -= dx * 0.008; this.free.pitch = Math.max(-0.9, Math.min(0.9, this.free.pitch + dy * 0.006)); }
		this.render();
	};
	View.prototype.resetView = function () { this.free = { yaw: 0, pitch: 0 }; this.zoomF = 1; this.orb = { th: this.flip ? -Math.PI / 2 : Math.PI / 2, ph: 0.75, d: 13 }; this.render(); };
	View.prototype.camTarget = function () {
		var mode = this.camMode, z = this.zoomF, out = { eye: new THREE.Vector3(), look: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 1, 0) };
		var fov = this.cam.fov * Math.PI / 180, asp = Math.max(0.3, this.w / this.h);
		var fit = 5.4 / Math.tan(fov / 2) / Math.min(1, asp);        // distance at which the board (with frame) fits the narrow side
		if (mode === "orbit") {
			var o = this.orb;
			out.eye.set(o.d * Math.sin(o.ph) * Math.cos(o.th), o.d * Math.cos(o.ph), o.d * Math.sin(o.ph) * Math.sin(o.th));
			return out;
		}
		var th, ph, d = fit * z;
		if (mode === "top") { th = this.flip ? -Math.PI / 2 : Math.PI / 2; ph = 0.001; d = fit * 0.98 * z; }
		else if (mode === "side") { th = 0; ph = 0.95; d = fit * 1.05 * z; }
		else if (mode === "eye") { th = this.flip ? -Math.PI / 2 : Math.PI / 2; ph = 1.13; d = fit * 0.78 * z; }   // low, like sitting at the board: shows the venue
		else { var black = mode === "black" || (mode === "auto" && this.flip); th = black ? -Math.PI / 2 : Math.PI / 2; ph = 0.86; d = fit * 0.92 * z; }
		th += this.free.yaw; ph = Math.max(0.001, Math.min(1.45, ph + this.free.pitch));
		out.eye.set(d * Math.sin(ph) * Math.cos(th), d * Math.cos(ph), d * Math.sin(ph) * Math.sin(th));
		out.look.set(0, 0, 0);
		if (ph < 0.02) out.up.set(-Math.cos(th), 0, -Math.sin(th));   // straight down: keep "up" pointing away from the player
		return out;
	};
	View.prototype.size = function (w, h) {
		this.w = Math.max(1, w); this.h = Math.max(1, h);
		this.renderer.setSize(this.w, this.h, false);
		this.cam.aspect = this.w / this.h; this.cam.updateProjectionMatrix();
		this.render();
	};
	View.prototype.pick = function (cx, cy) {
		var r = this.renderer.domElement.getBoundingClientRect();
		if (!r.width || !r.height) return -1;
		var v = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
		this.ray.setFromCamera(v, this.cam);
		var o = this.ray.ray.origin, d = this.ray.ray.direction;
		// first try the pieces (a tall piece covers the square behind it), then the board plane
		var hits = this.ray.intersectObjects(this.pieceG.children, true);
		if (hits.length) { var ob = hits[0].object; while (ob.parent && ob.parent !== this.pieceG) ob = ob.parent; var s0 = this.pieces.indexOf(ob); if (s0 >= 0) return s0; }
		if (Math.abs(d.y) < 1e-6) return -1;
		var t = -o.y / d.y; if (t < 0) return -1;
		var x = o.x + d.x * t, zz = o.z + d.z * t, f = Math.floor(x + 4), rk = Math.floor(4 - zz);
		return f >= 0 && f < 8 && rk >= 0 && rk < 8 ? rk * 8 + f : -1;
	};
	View.prototype.png = function () { this._draw(true); return this.renderer.domElement.toDataURL("image/png"); };
	View.prototype.render = function () {
		var self = this;
		if (this.raf || this.dead) return;
		this.raf = requestAnimationFrame(function () { self.raf = 0; self._draw(false); });
	};
	View.prototype._draw = function (instant) {
		if (this.dead) return;
		var now = performance.now(), busy = false;
		this.anims = this.anims.filter(function (a) {
			var k = Math.max(0, Math.min(1, (now - a.t0) / a.dur)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
			if (instant) e = k = 1;
			a.m.position.set(sqX(a.from) + (sqX(a.to) - sqX(a.from)) * e, a.hop * Math.sin(Math.PI * e), sqZ(a.from) + (sqZ(a.to) - sqZ(a.from)) * e);
			return k < 1;
		});
		if (this.anims.length) busy = true;
		var tg = this.camTarget(), cur = this.cur, k = instant || REDUCED ? 1 : 0.16, moving = false;
		[["eye", tg.eye], ["look", tg.look], ["up", tg.up]].forEach(function (a) { var v = cur[a[0]]; if (v.distanceTo(a[1]) > 0.002) { v.lerp(a[1], k); moving = true; } else v.copy(a[1]); });
		this.cam.position.copy(cur.eye); this.cam.up.copy(cur.up).normalize(); this.cam.lookAt(cur.look);
		if (this.roomAnims.length && !REDUCED) { var tt = now / 1000; this.roomAnims.forEach(function (f) { f(tt); }); busy = true; }
		this.renderer.render(this.scene, this.cam);
		if ((moving || busy) && !instant && !document.hidden) this.render();
	};
	View.prototype.dispose = function () {
		this.dead = true; if (this.raf) cancelAnimationFrame(this.raf);
		disposeTree(this.scene);
		this.renderer.dispose();
		if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
	};

	/* ---------- rooms ---------- */
	function signTex(text, fg, bg, w, h, font) {
		return tex(w, h, function (c) { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = font || ("800 " + Math.round(h * 0.42) + "px system-ui,sans-serif"); c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, w / 2, h / 2 + 2); });
	}
	function miniBoard(g, x, y, z, s, ry) {   // a far table's board (one textured plane)
		var t = tex(64, 64, function (c) { for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) { c.fillStyle = (r + f) % 2 ? "#e8d1a8" : "#7c5232"; c.fillRect(f * 8, r * 8, 8, 8); } });
		var m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), std("#ffffff", 0.7, { map: t })); m.rotation.x = -Math.PI / 2; m.rotation.z = ry || 0; m.position.set(x, y, z); g.add(m);
	}
	function table(g, top, legMat, w, d, H, round) {   // the table under the main board; its top is 0.06 below Y = 0
		var y = -0.33 - 0.06;
		if (round) { var t = cyl(g, w / 2, w / 2, 0.5, top, 0, y - 0.25, 0, 48); t.receiveShadow = true; cyl(g, 0.9, 1.6, H - 0.5, legMat, 0, y - 0.5 - (H - 0.5) / 2, 0, 24); return y - H; }
		var tt = box(g, w, 0.5, d, top, 0, y - 0.25, 0, true); tt.receiveShadow = true;
		[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(g, 0.6, H - 0.5, 0.6, legMat, s[0] * (w / 2 - 0.8), y - 0.5 - (H - 0.5) / 2, s[1] * (d / 2 - 0.8)); });
		return y - H;
	}
	function chair(g, mat, x, F, z, ry) {
		var c = new THREE.Group(); c.position.set(x, F, z); c.rotation.y = ry;
		box(c, 8, 0.8, 8, mat, 0, 8, 0); box(c, 8, 9, 0.8, mat, 0, 12.5, -3.6);
		[[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]].forEach(function (s) { box(c, 0.7, 8, 0.7, mat, s[0], 4, s[1]); });
		g.add(c);
	}
	function walls(g, X, Z, H, F, mat, floorMat) {
		var fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * X, 2 * Z), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.y = F; fl.receiveShadow = true; g.add(fl);
		[[0, -Z, 0, 2 * X], [0, Z, Math.PI, 2 * X], [-X, 0, Math.PI / 2, 2 * Z], [X, 0, -Math.PI / 2, 2 * Z]].forEach(function (w) {
			var m = new THREE.Mesh(new THREE.PlaneGeometry(w[3], H), mat); m.position.set(w[0], F + H / 2, w[1]); m.rotation.y = w[2]; g.add(m);
		});
	}
	function bookshelf(g, x, F, z, ry, seed) {
		var s = new THREE.Group(), r = rng(seed), wood = std("#5b3a22", 0.8); s.position.set(x, F, z); s.rotation.y = ry;
		box(s, 30, 40, 6, wood, 0, 20, 0);
		var cols = ["#7b2d26", "#2f4f6f", "#3d6b3d", "#c49a3a", "#4a3a6a", "#8a8a7a", "#a0522d"];
		for (var sh = 0; sh < 4; sh++) {
			box(s, 28, 0.6, 5.6, wood, 0, 3 + sh * 9.5, 3.2);
			for (var x0 = -13; x0 < 13;) { var bw = 1 + r() * 1.6, bh = 6 + r() * 2.5; box(s, bw, bh, 4.5, std(cols[(r() * cols.length) | 0], 0.9), x0 + bw / 2, 3.3 + sh * 9.5 + bh / 2, 3.4); x0 += bw + 0.15; }
		}
		g.add(s);
	}
	function plant(g, x, F, z) {
		cyl(g, 2.4, 1.8, 4.5, std("#b5683d", 0.9), x, F + 2.25, z);
		var leaf = std("#2f7d3a", 0.8);
		for (var i = 0; i < 9; i++) { var l = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), leaf); l.scale.set(0.5, 1.6, 0.5); var a = i * 0.7; l.position.set(x + Math.cos(a) * 1.6, F + 7 + (i % 3) * 1.5, z + Math.sin(a) * 1.6); l.rotation.z = Math.cos(a) * 0.5; l.rotation.x = Math.sin(a) * 0.5; g.add(l); }
	}
	function lamp(g, x, F, z, H, glow) {
		var metal = std("#2b2b2b", 0.5, { metalness: 0.6 });
		cyl(g, 1.6, 2, 0.6, metal, x, F + 0.3, z); cyl(g, 0.25, 0.25, H, metal, x, F + H / 2, z);
		var sh = cyl(g, 1.5, 3, 3, std("#f3e5c0", 0.9, { emissive: glow ? "#ffcf80" : "#000000", emissiveIntensity: 0.6, side: THREE.DoubleSide }), x, F + H, z, 24); sh.material.side = THREE.DoubleSide;
	}

	/* AI-painted backdrops (mes.fm/chess/img/bg-<room>.jpg): two big pictures, one behind each player's side, so the far view is a real scene.
	   v0..v1 = the vertical slice of the picture to use (0 = bottom). Loaded once and kept; nothing breaks if a file is missing. */
	var bgCache = {};
	/** a copy of the picture (the v0..v1 slice) whose left / right (and top) edges fade out, so it blends into the sky behind it */
	function faded(t, o) {
		var img = t.image, W = img.width, Hh = img.height, y0 = Math.round(Hh * (1 - (o.v1 || 1))), h = Math.round(Hh * ((o.v1 || 1) - (o.v0 || 0)));
		var c = document.createElement("canvas"); c.width = W; c.height = h;
		var x = c.getContext("2d"); x.drawImage(img, 0, y0, W, h, 0, 0, W, h);
		x.globalCompositeOperation = "destination-in";
		var gx = x.createLinearGradient(0, 0, W, 0); gx.addColorStop(0, "rgba(0,0,0,0)"); gx.addColorStop(0.18, "#000"); gx.addColorStop(0.82, "#000"); gx.addColorStop(1, "rgba(0,0,0,0)");
		x.fillStyle = gx; x.fillRect(0, 0, W, h);
		if (o.fadeTop) { var gy = x.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, "rgba(0,0,0,0)"); gy.addColorStop(0.2, "#000"); gy.addColorStop(1, "#000"); x.fillStyle = gy; x.fillRect(0, 0, W, h); }
		var ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace; ct.anisotropy = 4;
		return ct;
	}
	function backdrop(view, g, file, o) {
		var url = (window.MES_CHESS_IMG || "/chess/img/") + file;
		function make(t) {
			if (view.room !== g) return;
			[-1, 1].forEach(function (side) {
				var tt = o.fade ? faded(t, o) : t.clone(); tt.needsUpdate = true;
				if (!o.fade) { tt.offset.set(0, o.v0 || 0); tt.repeat.set(1, (o.v1 || 1) - (o.v0 || 0)); }
				var m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshBasicMaterial({ map: tt, fog: false, color: o.tint || "#ffffff", transparent: !!o.fade, depthWrite: !o.fade }));
				m.position.set(0, o.y, side * o.d); m.rotation.y = side < 0 ? 0 : Math.PI;
				g.add(m);
			});
			view.render();
		}
		if (bgCache[url]) return make(bgCache[url]);
		new THREE.TextureLoader().load(url, function (t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; bgCache[url] = t; make(t); }, undefined, function () {});
	}

	View.prototype.setRoom = function (name) {
		if (!ROOMS.some(function (r) { return r.id === name; })) name = "club";
		this.roomName = name;
		if (this.room) { this.scene.remove(this.room); disposeTree(this.room); }
		(this.roomLights || []).forEach(function (l) { this.scene.remove(l); }, this);
		var g = this.room = new THREE.Group(), lights = this.roomLights = [], anims = this.roomAnims = [], scene = this.scene, r = rng(777), self = this;
		this.scene.add(g);
		function light(l) { scene.add(l); lights.push(l); return l; }
		this.key.intensity = 1.7; this.key.color.set("#fff3dd");
		var F;
		if (name === "dark") {
			scene.background = new THREE.Color("#15171a"); scene.fog = null;
			F = table(g, std("#2d2f33", 0.8), std("#1e1f22", 0.8), 16, 16, 13.5);
		} else if (name === "club") {
			scene.background = new THREE.Color("#1d140d"); scene.fog = new THREE.Fog("#1d140d", 60, 150);
			var panel = std("#ffffff", 0.85, { map: (function () { var t = tex(256, 256, function (c, w, h) { c.fillStyle = "#4a2c17"; c.fillRect(0, 0, w, h); for (var x = 0; x < w; x += 64) { c.fillStyle = "#3a2111"; c.fillRect(x, 0, 6, h); c.strokeStyle = "rgba(255,220,170,0.08)"; c.strokeRect(x + 14, 20, 36, h - 40); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 1); return t; })() });
			var floor = std("#ffffff", 0.8, { map: (function () { var t = tex(256, 256, function (c, w, h) { for (var y = 0; y < h; y += 32) for (var x = (y / 32 % 2) * 64; x < w + 128; x += 128) { var v = 90 + Math.random() * 30; c.fillStyle = "rgb(" + v + "," + (v * 0.62) + "," + (v * 0.38) + ")"; c.fillRect(x, y, 126, 31); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); return t; })() });
			F = table(g, std("#3b2414", 0.6), std("#2a190d", 0.7), 18, 16, 13.5);
			walls(g, 90, 80, 60, F, panel, floor);
			var wood = std("#3b2414", 0.6);
			[[-35, -18], [35, -18], [-35, 26], [35, 26], [0, -45]].forEach(function (p, i) {
				var tg = new THREE.Group(); tg.position.set(p[0], 0, p[1]);
				box(tg, 16, 0.6, 16, wood, 0, F + 13.2, 0, true); cyl(tg, 0.8, 1.4, 13, wood, 0, F + 6.5, 0);
				miniBoard(tg, 0, F + 13.55, 0, 9, i * 0.3); g.add(tg);
				chair(g, std("#5a3a22", 0.8), p[0], F, p[1] + 13, Math.PI); chair(g, std("#5a3a22", 0.8), p[0], F, p[1] - 13, 0);
			});
			chair(g, std("#5a3a22", 0.8), 0, F, 15, Math.PI); chair(g, std("#5a3a22", 0.8), 0, F, -15, 0);
			[-60, -20, 20, 60].forEach(function (x, i) { bookshelf(g, x, F, -77, 0, 31 + i); });
			bookshelf(g, -87, F, 10, Math.PI / 2, 9); bookshelf(g, 87, F, -20, -Math.PI / 2, 13);
			lamp(g, -22, F, 6, 30, true); lamp(g, 24, F, -5, 30, true);
			var pend = std("#1b5e3b", 0.5, { metalness: 0.3, side: THREE.DoubleSide });
			var shade = new THREE.Mesh(new THREE.ConeGeometry(4, 3, 24, 1, true), pend); shade.position.set(0, 26, 0); g.add(shade);
			var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: "#fff2c8" })); bulb.position.set(0, 24.8, 0); g.add(bulb);
			cyl(g, 0.12, 0.12, 30, std("#222", 0.6), 0, 42, 0);
			var pl = light(new THREE.PointLight("#ffd9a0", 160, 70, 1.6)); pl.position.set(0, 24, 0);
			this.key.intensity = 1.3;
		} else if (name === "tournament") {
			scene.background = new THREE.Color("#0d0f14"); scene.fog = new THREE.Fog("#0d0f14", 90, 260);
			var carpet = std("#ffffff", 1, { map: (function () { var t = tex(64, 64, function (c, w, h) { c.fillStyle = "#283246"; c.fillRect(0, 0, w, h); for (var i = 0; i < 300; i++) { c.fillStyle = "rgba(255,255,255," + Math.random() * 0.06 + ")"; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); return t; })() });
			F = table(g, std("#f2f2f2", 0.5), std("#9aa3ad", 0.4, { metalness: 0.5 }), 26, 16, 13.5);
			walls(g, 160, 140, 90, F, std("#1a1e27", 0.95), carpet);
			var cloth = std("#f4f4f4", 0.7), steel = std("#9aa3ad", 0.4, { metalness: 0.5 });
			for (var row = 0; row < 3; row++) for (var col = -3; col <= 3; col++) {
				if (row === 0 && col === 0) continue;
				var tx = col * 34, tz = -row * 30 - (row ? 0 : 0);
				if (row === 0) tz = 0;
				box(g, 26, 0.6, 16, cloth, tx, F + 13.2, tz, true);
				[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(g, 0.5, 13, 0.5, steel, tx + s[0] * 12, F + 6.5, tz + s[1] * 7); });
				miniBoard(g, tx, F + 13.55, tz, 9, 0);
				var clk = box(g, 4, 2, 1.6, std("#202020", 0.5), tx + 9, F + 14.5, tz); clk.rotation.y = Math.PI / 2;
			}
			var clock = box(g, 1.6, 2.2, 4.2, std("#202020", 0.5), 9.5, F + 14.6, 0, true);
			var ct = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.4), new THREE.MeshBasicMaterial({ map: signTex("05:00  04:58", "#7CFF8A", "#0a0a0a", 256, 80, "700 34px ui-monospace,monospace") })); ct.position.set(10.35, F + 14.8, 0); ct.rotation.y = Math.PI / 2; g.add(ct);
			var scr = new THREE.Mesh(new THREE.PlaneGeometry(80, 24), new THREE.MeshBasicMaterial({ map: signTex("MES CHESS OPEN · ROUND 5", "#ffffff", "#1d3557", 1024, 300) }));
			scr.position.set(0, F + 104, -137); scr.scale.set(0.6, 0.6, 1); g.add(scr);
			backdrop(this, g, "bg-tournament.jpg", { w: 280, h: 157, d: 139.5, y: F + 78.5, tint: "#d8d8d8" });
			// spectators behind a rope (instanced, they sway a little)
			var n = 140, bodyG = new THREE.CylinderGeometry(1.6, 2.2, 9, 8), headG = new THREE.SphereGeometry(1.6, 10, 8);
			var bodies = new THREE.InstancedMesh(bodyG, std("#ffffff", 0.9), n), heads = new THREE.InstancedMesh(headG, std("#ffffff", 0.8), n), spots = [], mt = new THREE.Matrix4(), cc = new THREE.Color();
			var shirt = ["#c0392b", "#2c3e50", "#27ae60", "#8e44ad", "#f39c12", "#7f8c8d", "#16a085", "#d35400"], skin = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
			for (var k = 0; k < n; k++) {
				var side = k % 2 ? 1 : -1, ring = (k / 2) | 0, x0 = side * (120 + (ring % 5) * 7), z0 = -110 + Math.floor(ring / 5) * 14 + r() * 3;
				spots.push([x0, z0, r() * 6]);
				bodies.setColorAt(k, cc.set(shirt[(r() * shirt.length) | 0])); heads.setColorAt(k, cc.set(skin[(r() * skin.length) | 0]));
			}
			g.add(bodies); g.add(heads);
			function place(t) { spots.forEach(function (s, k) { var sw = Math.sin(t * 0.8 + s[2]) * 0.6; mt.makeTranslation(s[0] + sw, F + 4.5, s[1]); bodies.setMatrixAt(k, mt); mt.makeTranslation(s[0] + sw * 1.3, F + 10.6, s[1]); heads.setMatrixAt(k, mt); }); bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true; }
			place(0); anims.push(place);
			var rope = std("#b71c1c", 0.6);
			[-1, 1].forEach(function (s) { box(g, 0.6, 0.6, 240, rope, s * 112, F + 8, 0); });
			[[-50, 40], [50, 40], [0, 70]].forEach(function (p) { var sp = light(new THREE.SpotLight("#ffffff", 900, 220, 0.5, 0.6, 1.2)); sp.position.set(p[0], 80, p[1]); sp.target.position.set(0, F, 0); scene.add(sp.target); lights.push(sp.target); });
			this.key.intensity = 1.5; this.key.color.set("#ffffff");
		} else if (name === "park") {
			scene.background = tex(16, 256, function (c, w, h) { var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#5aa0e6"); gr.addColorStop(0.6, "#bfe0ff"); gr.addColorStop(1, "#e8f4ff"); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
			scene.fog = new THREE.Fog("#cfe6fb", 140, 420);
			var stone = std("#ffffff", 0.9, { map: noiseTex("#9a9690", ["#7d7a75", "#b5b1aa"], 120, 5) });
			F = table(g, stone, stone, 22, 22, 13.5, true);
			var grass = new THREE.Mesh(new THREE.CircleGeometry(420, 48), std("#ffffff", 1, { map: (function () { var t = tex(128, 128, function (c, w, h) { c.fillStyle = "#4f8f3a"; c.fillRect(0, 0, w, h); for (var i = 0; i < 1500; i++) { c.fillStyle = Math.random() < 0.5 ? "#5fa046" : "#43802f"; c.fillRect(Math.random() * w, Math.random() * h, 1, 2); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); return t; })() }));
			grass.rotation.x = -Math.PI / 2; grass.position.y = F; grass.receiveShadow = true; g.add(grass);
			var path = new THREE.Mesh(new THREE.RingGeometry(18, 30, 48), std("#cdb98f", 1)); path.rotation.x = -Math.PI / 2; path.position.y = F + 0.05; g.add(path);
			[[0, 1], [0, -1]].forEach(function (s) { var st = cyl(g, 3.5, 3.5, 8, stone, 0, F + 4, s[1] * 16); st.castShadow = true; });
			var bark = std("#5b4030", 0.95), leaves = [std("#2f6f2a", 0.9), std("#3d8a33", 0.9), std("#28602a", 0.9)];
			for (var i2 = 0; i2 < 16; i2++) {
				var a = i2 / 16 * Math.PI * 2 + r() * 0.3, d = 70 + r() * 120, tx2 = Math.cos(a) * d, tz2 = Math.sin(a) * d, th2 = 30 + r() * 20;
				cyl(g, 1.6, 2.4, th2, bark, tx2, F + th2 / 2, tz2, 10);
				for (var b2 = 0; b2 < 3; b2++) { var cr = new THREE.Mesh(new THREE.SphereGeometry(10 + r() * 6, 12, 10), leaves[b2]); cr.position.set(tx2 + (r() - 0.5) * 8, F + th2 + (r() - 0.3) * 8, tz2 + (r() - 0.5) * 8); cr.castShadow = true; g.add(cr); }
			}
			var benchW = std("#7a4f2a", 0.8), iron = std("#2a2a2a", 0.6, { metalness: 0.5 });
			[[-45, 20, 0.6], [45, -25, -2.4], [10, 55, 3.4]].forEach(function (p) {
				var bg = new THREE.Group(); bg.position.set(p[0], F, p[1]); bg.rotation.y = p[2];
				for (var s2 = 0; s2 < 4; s2++) box(bg, 30, 0.6, 1.6, benchW, 0, 8, -2.4 + s2 * 1.7);
				for (s2 = 0; s2 < 3; s2++) box(bg, 30, 1.6, 0.6, benchW, 0, 11 + s2 * 2.2, -3.6);
				[-12, 12].forEach(function (x) { box(bg, 0.8, 8, 6, iron, x, 4, -1); }); g.add(bg);
			});
			var post = std("#1f2a22", 0.5, { metalness: 0.4 });
			cyl(g, 0.5, 0.8, 55, post, -26, F + 27.5, -24, 10);
			var lampHead = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 10), new THREE.MeshBasicMaterial({ color: "#fff6d8" })); lampHead.position.set(-26, F + 57, -24); g.add(lampHead);
			backdrop(this, g, "bg-park.jpg", { w: 900, h: 503, d: 400, y: 10 - 503 / 3 + 503 / 2, fade: true });
			this.key.intensity = 2.3; this.key.color.set("#fff8ea"); this.key.position.set(-9, 18, 4);
		} else if (name === "home") {
			scene.background = new THREE.Color("#2b2620"); scene.fog = null;
			var parquet = std("#ffffff", 0.8, { map: (function () { var t = tex(256, 256, function (c, w, h) { for (var y = 0; y < h; y += 16) for (var x = (y / 16 % 2) * 32; x < w + 64; x += 64) { var v = 150 + Math.random() * 40; c.fillStyle = "rgb(" + v + "," + (v * 0.72) + "," + (v * 0.45) + ")"; c.fillRect(x, y, 63, 15); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t; })() });
			F = table(g, std("#6b4423", 0.55), std("#4a2f18", 0.7), 18, 18, 8);   // a low coffee table
			walls(g, 70, 60, 50, F, std("#d9cbb4", 0.95), parquet);
			var rug = new THREE.Mesh(new THREE.PlaneGeometry(60, 44), std("#ffffff", 1, { map: tex(256, 190, function (c, w, h) { c.fillStyle = "#6e2b2b"; c.fillRect(0, 0, w, h); c.strokeStyle = "#e2c08d"; c.lineWidth = 8; c.strokeRect(12, 12, w - 24, h - 24); c.lineWidth = 3; c.strokeRect(30, 30, w - 60, h - 60); c.beginPath(); c.ellipse(w / 2, h / 2, 40, 28, 0, 0, 7); c.stroke(); }) }));
			rug.rotation.x = -Math.PI / 2; rug.position.y = F + 0.05; rug.receiveShadow = true; g.add(rug);
			var fabric = std("#47607a", 0.95), sofa = new THREE.Group(); sofa.position.set(0, F, -30);
			box(sofa, 44, 7, 14, fabric, 0, 5, 0, true); box(sofa, 44, 12, 4, fabric, 0, 12, -6, true); box(sofa, 4, 10, 14, fabric, -22, 9, 0, true); box(sofa, 4, 10, 14, fabric, 22, 9, 0, true);
			[-11, 11].forEach(function (x) { box(sofa, 20, 3, 12, std("#557090", 0.95), x, 10, 0.5, true); }); g.add(sofa);
			var win = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshBasicMaterial({ map: tex(256, 170, function (c, w, h) {
				var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#7fb7ea"); gr.addColorStop(1, "#d8ecfb"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
				c.fillStyle = "rgba(255,255,255,0.9)"; [[60, 50, 18], [78, 46, 22], [96, 52, 16], [190, 80, 15], [204, 76, 19]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], p[2], 0, 7); c.fill(); });
				c.fillStyle = "#4b7a3a"; c.fillRect(0, h - 30, w, 30); c.strokeStyle = "#f4efe6"; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
			}) }));
			win.position.set(69.5, F + 28, 0); win.rotation.y = -Math.PI / 2; g.add(win);
			// the painted garden view (AI art) replaces the drawn sky once it has loaded; a real frame goes over it
			new THREE.TextureLoader().load((window.MES_CHESS_IMG || "/chess/img/") + "bg-home.jpg", function (t) {
				if (self.room !== g) return;
				t.colorSpace = THREE.SRGBColorSpace; t.offset.set(0, 0.06); t.repeat.set(1, 0.88);
				win.material.map = t; win.material.needsUpdate = true; self.render();
			}, undefined, function () {});
			var wf = std("#f4efe6", 0.6);
			box(g, 0.8, 1.2, 31, wf, 69.2, F + 38, 0); box(g, 0.8, 1.2, 31, wf, 69.2, F + 18, 0); box(g, 0.8, 21, 1.2, wf, 69.2, F + 28, -15); box(g, 0.8, 21, 1.2, wf, 69.2, F + 28, 15);
			box(g, 0.6, 20, 0.7, wf, 69.2, F + 28, 0); box(g, 0.6, 0.7, 30, wf, 69.2, F + 28, 0);
			bookshelf(g, -69, F, 10, Math.PI / 2, 21); plant(g, 55, F, -48); lamp(g, -50, F, -45, 32, true);
			var pl2 = light(new THREE.PointLight("#ffe0b0", 120, 90, 1.5)); pl2.position.set(-50, F + 34, -42);
			this.key.position.set(12, 16, 3); this.key.intensity = 1.6;
		} else if (name === "screens") {
			// walls of video-call screens with fans watching, like the 2020 "virtual crowd" broadcasts; now and then a few of them cheer
			scene.background = new THREE.Color("#05070d"); scene.fog = new THREE.Fog("#05070d", 120, 260);
			F = table(g, std("#1c1f26", 0.6), std("#111318", 0.7), 18, 16, 13.5);
			var X5 = 72, Z5 = 62, H5 = 54;
			walls(g, X5, Z5, H5, F, std("#0a0d16", 0.9), std("#121212", 0.5));
			var skins = ["#f1c27d", "#c68642", "#8d5524", "#ffdbac", "#e0ac69", "#5c3a21"], hairs = ["#2b1b10", "#000000", "#7a4b1c", "#d9b25a", "#b3471e", "#888888"];
			var bgs = ["#3f51b5", "#00897b", "#6d4c41", "#455a64", "#8e24aa", "#c0ca33", "#1e88e5", "#5d4037", "#37474f", "#ad1457", "#2e7d32", "#ef6c00"];
			var shirts = ["#e53935", "#1e88e5", "#fdd835", "#43a047", "#ffffff", "#8e24aa", "#212121", "#fb8c00", "#00acc1"];
			var names = ["Sam", "Alex", "Jo", "Kim", "Lee", "Pat", "Max", "Ana", "Tom", "Mia", "Raj", "Zoe", "Ben", "Ivy", "Leo", "Ava"];
			var face = function (k, cheer) {
				var rr = rng(k * 7919 + 17), bg = bgs[k % bgs.length], skin = skins[(rr() * skins.length) | 0], hair = hairs[(rr() * hairs.length) | 0], shirt = shirts[(rr() * shirts.length) | 0], nm = names[k % names.length];
				var t2 = tex(256, 160, function (c, w, h) {
					var gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg); gr.addColorStop(1, "#111"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
					c.fillStyle = "rgba(255,255,255,0.12)"; c.fillRect(20, 20, 60, 40); c.fillRect(180, 30, 50, 70);
					c.fillStyle = shirt; c.beginPath(); c.ellipse(128, 168, 70, 50, 0, 0, 7); c.fill();
					if (cheer) { c.strokeStyle = skin; c.lineWidth = 16; c.lineCap = "round"; c.beginPath(); c.moveTo(70, 130); c.lineTo(45, 40); c.moveTo(186, 130); c.lineTo(211, 40); c.stroke(); }
					c.fillStyle = skin; c.beginPath(); c.arc(128, 82, 36, 0, 7); c.fill();
					c.fillStyle = hair; c.beginPath(); c.arc(128, 72, 37, Math.PI, 0); c.fill();
					c.fillStyle = "#111"; c.beginPath(); c.arc(116, 82, 4, 0, 7); c.arc(140, 82, 4, 0, 7); c.fill();
					c.strokeStyle = "#5a1a1a"; c.lineWidth = 3; c.beginPath();
					if (cheer) { c.fillStyle = "#5a1a1a"; c.ellipse(128, 100, 9, 8, 0, 0, 7); c.fill(); } else { c.arc(128, 94, 10, 0.2, Math.PI - 0.2); c.stroke(); }
					c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(6, h - 26, 70, 20); c.fillStyle = "#fff"; c.font = "600 14px system-ui,sans-serif"; c.textBaseline = "middle"; c.fillText(nm, 12, h - 16);
					c.strokeStyle = cheer ? "#4caf50" : "rgba(0,0,0,0)"; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
				});
				t2.userData.keep = false; return t2;
			};
			var NF = 16, calm = [], loud = [], scr = [], sw = 11, sh = 7, gap = 1.1, i5;
			for (i5 = 0; i5 < NF; i5++) { calm.push(face(i5, false)); loud.push(face(i5, true)); }
			var wallOf = function (len, place) {
				var cols = Math.floor((len - 6) / (sw + gap)), rows = 6;
				for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) {
					var u = (c2 - (cols - 1) / 2) * (sw + gap), y = F + 8 + r2 * (sh + gap), k = (r() * NF) | 0;
					var m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: calm[k] }));
					place(m, u, y); g.add(m); scr.push({ m: m, k: k, t: 0 });
				}
			};
			wallOf(2 * X5, function (m, u, y) { m.position.set(u, y, -Z5 + 0.3); });
			wallOf(2 * X5, function (m, u, y) { m.position.set(u, y, Z5 - 0.3); m.rotation.y = Math.PI; });
			wallOf(2 * Z5, function (m, u, y) { m.position.set(-X5 + 0.3, y, u); m.rotation.y = Math.PI / 2; });
			wallOf(2 * Z5, function (m, u, y) { m.position.set(X5 - 0.3, y, u); m.rotation.y = -Math.PI / 2; });
			var lastT = 0;
			anims.push(function (t) {
				if (t - lastT < 0.6) return; lastT = t;
				scr.forEach(function (o) {
					if (o.t && t > o.t) { o.m.material.map = calm[o.k]; o.t = 0; }
					else if (!o.t && Math.random() < 0.035) { o.m.material.map = loud[o.k]; o.t = t + 1 + Math.random() * 2; }
				});
			});
			var pl5 = light(new THREE.PointLight("#c9d8ff", 140, 120, 1.4)); pl5.position.set(0, F + 40, 0);
			this.key.intensity = 1.4; this.key.color.set("#eef3ff");
		} else if (name === "space") {
			scene.background = new THREE.Color("#02030a"); scene.fog = null;
			var starG = new THREE.BufferGeometry(), pts = [];
			for (var s3 = 0; s3 < 2500; s3++) { var u = r() * 2 - 1, th3 = r() * Math.PI * 2, R3 = 300 + r() * 200, q = Math.sqrt(1 - u * u); pts.push(R3 * q * Math.cos(th3), R3 * u, R3 * q * Math.sin(th3)); }
			starG.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
			var stars = new THREE.Points(starG, new THREE.PointsMaterial({ color: "#ffffff", size: 1.4, sizeAttenuation: false })); g.add(stars);
			var planet = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), std("#ffffff", 0.9, { map: tex(512, 256, function (c, w, h) { for (var y = 0; y < h; y += 4) { var v = Math.sin(y * 0.09) * 30 + Math.random() * 15; c.fillStyle = "rgb(" + (170 + v) + "," + (110 + v * 0.6) + "," + (70 + v * 0.3) + ")"; c.fillRect(0, y, w, 4); } }) }));
			planet.position.set(-140, -40, -220);
			backdrop(this, g, "bg-space.jpg", { w: 1100, h: 461, d: 430, y: 60, v0: 0.25, v1: 1, fade: true, fadeTop: true });
			var ringM = new THREE.Mesh(new THREE.RingGeometry(80, 120, 64), new THREE.MeshBasicMaterial({ color: "#d9c39a", transparent: true, opacity: 0.35, side: THREE.DoubleSide })); ringM.position.copy(planet.position); ringM.rotation.x = 1.2; ringM.rotation.y = 0.3;
			var edge = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.06, 9.5), new THREE.MeshBasicMaterial({ color: "#3fa9ff", transparent: true, opacity: 0.7 })); edge.position.y = -0.36; g.add(edge);
			var glow = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: tex(128, 128, function (c, w, h) { var gr = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(63,169,255,0.5)"); gr.addColorStop(1, "rgba(63,169,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false }));
			glow.rotation.x = -Math.PI / 2; glow.position.y = -0.5; g.add(glow);
			anims.push(function (t) { stars.rotation.y = t * 0.004; planet.rotation.y = t * 0.03; edge.material.opacity = 0.5 + 0.25 * Math.sin(t * 1.5); });
			var rim = light(new THREE.PointLight("#5ab0ff", 60, 40, 1.2)); rim.position.set(6, 3, -8);
			this.key.color.set("#f0f4ff"); this.key.intensity = 2;
		}
		if (name !== "park") this.key.position.set(-5, 14, 7);
		this.render();
	};

	window.CH3D = { ROOMS: ROOMS, SETS: SETS, create: create };
})();
