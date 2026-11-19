/* MES Space Shuttle Simulator: the 3D view (three.js 0.170.0, loaded by app.js through the page's import map). window.SXView.
   Units: 1 = Earth's equatorial radius. Inertial x, y, z (metres) map to three's (x, z, -y), so three's +Y is the North Pole. */
(function () {
	"use strict";
	if (typeof document === "undefined") return;
	var RE = 6378137;
	window.SXView = { create: create };

	function create(stage, THREE, OrbitControls) {
		var V = {}, cap = 2400;
		var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		var cv = renderer.domElement; cv.className = "sx-canvas"; cv.tabIndex = 0;
		cv.setAttribute("aria-label", "3D view of the Earth and the Shuttle's orbit. Drag to turn the view, wheel or pinch to zoom. Drag the burn marker along the orbit or its arrows to change a burn.");
		stage.insertBefore(cv, stage.firstChild);
		var scene = new THREE.Scene();
		var camera = new THREE.PerspectiveCamera(45, 16 / 9, 1e-5, 2000);
		camera.position.set(1.6, 1.6, 3.2);
		var controls = new OrbitControls(camera, cv);
		controls.enableDamping = true; controls.dampingFactor = 0.09; controls.minDistance = 0.002; controls.maxDistance = 200; controls.rotateSpeed = 0.7;
		V.camera = camera; V.controls = controls; V.canvas = cv; V.renderer = renderer;

		function T(p) { return new THREE.Vector3(p[0] / RE, p[2] / RE, -p[1] / RE); }
		V.T = T;

		/* sky */
		var sg = new THREE.BufferGeometry(), sp = [], sc = [];
		var rnd = mulberry(7);
		for (var i = 0; i < 2600; i++) {
			var u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = Math.sqrt(1 - u * u), b = 0.35 + rnd() * 0.65;
			sp.push(rr * Math.cos(th) * 600, u * 600, rr * Math.sin(th) * 600);
			var tint = rnd(); sc.push(b * (tint > 0.85 ? 1 : 0.85), b * 0.9, b * (tint < 0.2 ? 0.75 : 1));
		}
		sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
		scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));

		/* sun light + a soft fill so the night side is not pitch black */
		var sun = new THREE.DirectionalLight(0xffffff, 2.6); scene.add(sun);
		scene.add(new THREE.AmbientLight(0x3a4a66, 0.35));
		var sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE, "255,240,200"), color: 0xffffff, depthWrite: false, blending: THREE.AdditiveBlending }));
		sunSprite.scale.set(40, 40, 1); scene.add(sunSprite);

		/* Earth */
		var earth = new THREE.Group(); scene.add(earth);
		var earthMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 14, specular: 0x223344 });
		var globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMat); earth.add(globe);
		var atm = new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 64), new THREE.ShaderMaterial({
			transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
			vertexShader: "varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }",
			fragmentShader: "varying vec3 vN; varying vec3 vP; void main(){ float f = pow(clamp(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 0.0, 1.0), 4.0); gl_FragColor = vec4(0.32,0.6,1.0,1.0) * min(f, 1.2); }"
		}));
		scene.add(atm);
		V.setTexture = function (c) { var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; earthMat.map = t; earthMat.needsUpdate = true; };

		/* lines with a fixed capacity */
		function line(color, dashed, opacity) {
			var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cap * 3), 3)); g.setDrawRange(0, 0);
			var m = dashed ? new THREE.LineDashedMaterial({ color: color, dashSize: 0.025, gapSize: 0.018, transparent: true, opacity: opacity || 1 }) : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity || 1 });
			var l = new THREE.Line(g, m); l.frustumCulled = false; l.userData.dashed = dashed; return l;
		}
		function setLine(l, pts, surface) {
			var a = l.geometry.attributes.position, n = Math.min(cap, pts ? pts.length : 0);
			for (var i = 0; i < n; i++) { var v = surface ? pts[i] : T(pts[i]); a.array[i * 3] = v.x; a.array[i * 3 + 1] = v.y; a.array[i * 3 + 2] = v.z; }
			a.needsUpdate = true; l.geometry.setDrawRange(0, n); l.geometry.computeBoundingSphere();
			if (l.userData.dashed && n > 1) l.computeLineDistances();
			l.visible = n > 1;
		}
		var orbitL = line(0x8ec5ff), planL = line(0xffa94d, true), targetL = line(0x69db7c, false, 0.55), trailL = line(0xffffff, false, 0.35);
		scene.add(orbitL, planL, targetL, trailL);
		var surfL = line(0xffd43b, false, 0.9); earth.add(surfL);   // entry ground path, on the surface (turns with the Earth)
		var footL = line(0xff6b6b, false, 0.95); earth.add(footL);

		/* the Shuttle: built from simple shapes, forward = +Z, up = +Y */
		var shuttle = new THREE.Group(); scene.add(shuttle);
		(function () {
			var white = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.55, metalness: 0.05 });
			var black = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.7 });
			var grey = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.6 });
			var body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.05, 18), white); body.rotation.x = Math.PI / 2; shuttle.add(body);
			var nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 18), white); nose.rotation.x = Math.PI / 2; nose.position.z = 0.675; shuttle.add(nose);
			var tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 12), black); tip.rotation.x = Math.PI / 2; tip.position.z = 0.79; shuttle.add(tip);
			var belly = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 1.0), black); belly.position.set(0, -0.11, 0.02); shuttle.add(belly);
			var wing = new THREE.Shape(); wing.moveTo(0, 0.35); wing.lineTo(0.58, -0.42); wing.lineTo(0.58, -0.52); wing.lineTo(0, -0.52); wing.closePath();
			[1, -1].forEach(function (s) {
				var g = new THREE.ExtrudeGeometry(wing, { depth: 0.025, bevelEnabled: false });
				var m = new THREE.Mesh(g, white); m.rotation.x = -Math.PI / 2; if (s < 0) m.scale.x = -1; m.position.set(0, -0.08, 0); shuttle.add(m);
				var e = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.12), black); e.position.set(s * 0.3, -0.1, -0.44); shuttle.add(e);
			});
			var fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-0.34, 0); fin.lineTo(-0.5, 0.42); fin.lineTo(-0.38, 0.42); fin.closePath();
			var fm = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.02, bevelEnabled: false }), white); fm.rotation.y = -Math.PI / 2; fm.position.set(0.01, 0.1, -0.18); shuttle.add(fm);
			[[0, 0.06], [-0.07, -0.03], [0.07, -0.03]].forEach(function (p) { var n = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 12), grey); n.rotation.x = Math.PI / 2; n.position.set(p[0], p[1], -0.57); shuttle.add(n); });
			[1, -1].forEach(function (s) { var p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12), white); p.rotation.x = Math.PI / 2; p.position.set(s * 0.12, 0.08, -0.38); shuttle.add(p); });
		})();
		var plasma = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE, "255,150,60"), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
		plasma.scale.set(2.2, 2.2, 1); plasma.position.set(0, -0.15, 0.35); shuttle.add(plasma);
		var flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE, "120,180,255"), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
		flame.scale.set(0.7, 0.7, 1); flame.position.set(0, 0.02, -0.8); shuttle.add(flame);

		/* the station */
		var station = new THREE.Group(); scene.add(station);
		(function () {
			var truss = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.6 });
			var panel = new THREE.MeshStandardMaterial({ color: 0x2b4a8a, roughness: 0.4, metalness: 0.3, emissive: 0x0a1428, side: THREE.DoubleSide });
			var mod = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 });
			var tr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.05), truss); station.add(tr);
			[-0.7, -0.45, 0.45, 0.7].forEach(function (x) { [1, -1].forEach(function (s) { var p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.55), panel); p.position.set(x, 0, s * 0.32); p.rotation.x = Math.PI / 2; station.add(p); }); });
			var m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 14), mod); m1.rotation.x = Math.PI / 2; station.add(m1);
			var m2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 14), mod); m2.rotation.z = Math.PI / 2; m2.position.z = 0.28; station.add(m2);
		})();

		/* markers: burn node, entry interface, landing, sites */
		var nodeM = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffa94d, depthTest: false, transparent: true }));
		nodeM.renderOrder = 10; scene.add(nodeM);
		var nodeOthers = [];
		var arrows = {}, ACOL = { pro: 0xffd43b, retro: 0xffd43b, nrm: 0xd0a2ff, anti: 0xd0a2ff, rad: 0x66d9e8, radin: 0x66d9e8 };
		Object.keys(ACOL).forEach(function (k) {
			var a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, ACOL[k], 0.28, 0.16);
			a.traverse(function (o) { if (o.material) { o.material.depthTest = false; o.material.transparent = true; o.material.opacity = k === "retro" || k === "anti" || k === "radin" ? 0.6 : 1; } o.renderOrder = 11; });
			scene.add(a); arrows[k] = a;
		});
		function dot(color, size) { var m = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), new THREE.MeshBasicMaterial({ color: color })); return m; }
		var eiM = dot(0xffd43b, 0.012), landM = dot(0xff6b6b, 0.014);
		earth.add(eiM, landM);
		var siteMs = [];
		V.setSites = function (sites) {
			siteMs.forEach(function (m) { earth.remove(m); }); siteMs = [];
			sites.forEach(function (s) { var m = dot(0x51cf66, 0.009); m.position.copy(ll(s.lat * Math.PI / 180, s.lon * Math.PI / 180, 1.002)); earth.add(m); siteMs.push(m); });
		};
		function ll(lat, lon, r) { return new THREE.Vector3(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon)); }
		V.ll = ll;

		var size = { w: 1, h: 1 };
		V.resize = function () {
			var w = stage.clientWidth || 640, h = stage.clientHeight || 360;
			if (w === size.w && h === size.h) return;
			size.w = w; size.h = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
		};
		V.screen = function (v3) { var p = v3.clone().project(camera); return { x: (p.x + 1) / 2 * size.w, y: (1 - p.y) / 2 * size.h, vis: p.z < 1 && p.z > -1 }; };
		V.screenOf = function (eci) { return V.screen(T(eci)); };

		var follow = "earth", lastFollow = null, followPos = new THREE.Vector3();
		V.setFollow = function (f) { follow = f; lastFollow = null; };
		V.followTarget = function () { return follow; };
		V.aim = function (dir, dist) { var d = T([dir[0] * RE, dir[1] * RE, dir[2] * RE]).normalize(); if (follow === "earth") { controls.target.set(0, 0, 0); camera.position.copy(d.multiplyScalar(dist || 3.3)); } lastFollow = null; };
		V.reset = function () {
			lastFollow = null;
			if (follow === "earth") { controls.target.set(0, 0, 0); camera.position.set(1.6, 1.6, 3.2); }
		};
		function pxScale(obj, px) { var d = camera.position.distanceTo(obj.position), f = 2 * Math.tan(camera.fov * Math.PI / 360) * d / size.h; return f * px; }

		V.render = function (st) {
			V.resize();
			earth.rotation.y = st.gmst;
			var s3 = T([st.sun[0] * 1e12, st.sun[1] * 1e12, st.sun[2] * 1e12]).normalize();
			sun.position.copy(s3).multiplyScalar(50); sunSprite.position.copy(s3).multiplyScalar(500);
			setLine(orbitL, st.orbit); setLine(planL, st.plan); setLine(targetL, st.targetOrbit); setLine(trailL, st.trail);
			setLine(surfL, st.surfPath ? st.surfPath.map(function (p) { return ll(p.lat, p.lon, 1.003); }) : null, true);
			setLine(footL, st.footprint ? st.footprint.map(function (p) { return ll(p.lat, p.lon, 1.003); }) : null, true);
			eiM.visible = !!st.ei; if (st.ei) eiM.position.copy(ll(st.ei.lat, st.ei.lon, 1.004));
			landM.visible = !!st.land; if (st.land) landM.position.copy(ll(st.land.lat, st.land.lon, 1.004));
			// camera follow
			var fp = follow === "shuttle" && st.shuttle ? T(st.shuttle.r) : follow === "target" && st.target ? T(st.target.r) : null;
			if (fp) {
				if (!lastFollow) { controls.target.copy(fp); var off = camera.position.clone().sub(controls.target); if (off.length() > 0.6) off.setLength(0.12); camera.position.copy(fp).add(off); }
				else { var d = fp.clone().sub(lastFollow); camera.position.add(d); controls.target.add(d); }
				lastFollow = fp.clone();
			} else if (follow === "earth" && lastFollow) { lastFollow = null; }
			controls.update();
			// shuttle
			shuttle.visible = !!st.shuttle;
			if (st.shuttle) {
				shuttle.position.copy(T(st.shuttle.r));
				var fwd = T(st.shuttle.v).normalize(), up = T(st.shuttle.r).normalize();
				if (st.shuttle.nose) fwd = T(st.shuttle.nose).normalize();
				var x = new THREE.Vector3().crossVectors(up, fwd).normalize(), y = new THREE.Vector3().crossVectors(fwd, x).normalize();
				shuttle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, fwd));
				var k = pxScale(shuttle, st.shuttle.px || 40); shuttle.scale.setScalar(k);
				plasma.visible = st.shuttle.plasma > 0; plasma.material.opacity = Math.min(1, st.shuttle.plasma || 0);
				flame.visible = !!st.shuttle.firing;
			}
			station.visible = !!st.target;
			if (st.target) {
				station.position.copy(T(st.target.r));
				var tf = T(st.target.v).normalize(), tu = T(st.target.r).normalize(), tx = new THREE.Vector3().crossVectors(tu, tf).normalize(), ty = new THREE.Vector3().crossVectors(tf, tx);
				station.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tf, ty, tx.negate()));
				station.scale.setScalar(pxScale(station, 30));
			}
			// burn node + arrows
			nodeM.visible = !!st.node;
			Object.keys(arrows).forEach(function (k) { arrows[k].visible = !!st.node; });
			if (st.node) {
				nodeM.position.copy(T(st.node.r)); nodeM.scale.setScalar(pxScale(nodeM, 8));
				var L = pxScale(nodeM, 62);
				var dirs = { pro: st.node.f.pro, retro: neg(st.node.f.pro), nrm: st.node.f.nrm, anti: neg(st.node.f.nrm), rad: st.node.f.rad, radin: neg(st.node.f.rad) };
				Object.keys(dirs).forEach(function (k) { var d = T(dirs[k]).normalize(); arrows[k].position.copy(nodeM.position); arrows[k].setDirection(d); arrows[k].setLength(L, L * 0.28, L * 0.16); });
				V.arrowTips = Object.keys(dirs).map(function (k) { var d = T(dirs[k]).normalize(); return { k: k, p: V.screen(nodeM.position.clone().add(d.multiplyScalar(L * 0.92))), o: V.screen(nodeM.position) }; });
			} else V.arrowTips = [];
			while (nodeOthers.length < (st.others || []).length) { var m = dot(0xffa94d, 1); m.material.transparent = true; m.material.opacity = 0.55; m.material.depthTest = false; scene.add(m); nodeOthers.push(m); }
			nodeOthers.forEach(function (m, i) { var o = (st.others || [])[i]; m.visible = !!o; if (o) { m.position.copy(T(o)); m.scale.setScalar(pxScale(m, 6)); } });
			renderer.render(scene, camera);
		};
		V.png = function () { return cv.toDataURL("image/png"); };
		return V;
	}
	function neg(a) { return [-a[0], -a[1], -a[2]]; }
	function glowTex(THREE, rgb) {
		var c = document.createElement("canvas"); c.width = c.height = 128; var g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
		gr.addColorStop(0, "rgba(" + rgb + ",1)"); gr.addColorStop(0.25, "rgba(" + rgb + ",0.55)"); gr.addColorStop(1, "rgba(" + rgb + ",0)");
		g.fillStyle = gr; g.fillRect(0, 0, 128, 128); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
	}
	function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
})();
