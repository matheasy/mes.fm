/* MES Car Sandbox: free-roam 3D driving with real rigid-body physics.
   Physics = Rapier 0.14.0 (rapier3d-compat, WebAssembly, jsDelivr): raycast-vehicle cars with springs, tyre grip limited by the load on
   each wheel (so braking and cornering really are 6 times weaker on the Moon), a heightfield terrain, ramps, a loop, a half pipe and
   loose objects. Drawing = three.js 0.170.0 (jsDelivr, unpkg fallback). Both load when the page starts.
   Car bodies dent where they are hit (vertices pushed in by the size of the sudden change in velocity), engines weaken with damage.
   Settings: localStorage mes-car-sandbox:v1; records: mes-car-sandbox:rec. window.MESCarSandbox = debug hooks. */
(function () {
	"use strict";
	var C = window.MESCar, root = document.getElementById("cs");
	if (!C || !root) return;
	function $(id) { return document.getElementById(id); }
	var KEY = "mes-car-sandbox:v1", RKEY = "mes-car-sandbox:rec";
	function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v && typeof v === "object" ? Object.assign(d, v) : d; } catch (e) { return d; } }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
	var usLocale = /^en-(US|LR|MM)/.test(navigator.language || "");
	var S = load(KEY, { world: "earth", car: null, color: null, cam: "chase", traffic: 3, ai: "cruise", g: null, sound: true, units: usLocale ? "mph" : "kmh", shadows: true, damage: true, touch: "auto", slow: false, help: true, tod: 13, cycle: false, cycleMin: 6, weather: "clear", vol: 0.7, show: { info: true, lap: true, speed: true, msg: true, ghost: true } });
	if (!S.show || typeof S.show !== "object") S.show = { info: true, lap: true, speed: true, msg: true, ghost: true };
	if (S.ghost === false) { S.show.ghost = false; delete S.ghost; }
	if (typeof S.vol !== "number") S.vol = 0.7;
	if (typeof S.tod !== "number") S.tod = S.night ? 22 : 13; delete S.night;
	var REC = load(RKEY, { top: 0, jump: 0, air: 0, crash: 0, laps: {} }); if (!REC.laps) REC.laps = {};
	var Q = C.parseQuery(location.search);
	if (Q.world) { S.world = Q.world; S.g = null; S.car = null; }
	if (Q.car) S.car = Q.car; if (Q.g != null) S.g = Q.g; if (Q.traffic != null) S.traffic = Q.traffic; if (Q.ai) S.ai = Q.ai; if (Q.weather) S.weather = Q.weather; if (Q.tod != null) S.tod = Q.tod;
	if (!C.WORLDS[S.world]) S.world = "earth";

	var THREE = null, RAPIER = null;
	var stage = $("cs-stage"), view = $("cs-view");
	function msg(t) { var el = $("cs-load"); if (el) { el.textContent = t; el.hidden = !t; } }

	function imp(u) { return new Function("u", "return import(u)")(u); }
	function loadLibs() {
		var t = imp("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js").catch(function () { return imp("https://unpkg.com/three@0.170.0/build/three.module.min.js"); });
		var r = imp("https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js").catch(function () { return imp("https://unpkg.com/@dimforge/rapier3d-compat@0.14.0/rapier.es.js"); })
			.then(function (m) { var R = m.default || m; return R.init().then(function () { return R; }); });
		return Promise.all([t, r]);
	}

	/* ===================== renderer, scene, camera ===================== */
	var lampMat = null;
	var renderer, scene, camera, sunLight, hemi, worldGroup, skyGroup, clockLast = 0;
	var phys = null, eventQ = null, groundH = null, ter = null, W = null;
	var cars = [], objs = [], player = 0, statics = [];
	var gravity = 9.81, gFlip = 0, paused = false, subLast = true;
	var tmpV, tmpQ, tmpM;

	function initRenderer() {
		renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia("(pointer:coarse)").matches ? 1.5 : 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
		renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		var cv = renderer.domElement; cv.className = "cs-canvas"; cv.tabIndex = 0; cv.setAttribute("aria-label", "3D driving view. Click it, then drive with W A S D or the arrow keys.");
		stage.insertBefore(cv, stage.firstChild);
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 4000);
		sunLight = new THREE.DirectionalLight(0xffffff, 2.4); sunLight.castShadow = true;
		var sc = sunLight.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
		sunLight.shadow.mapSize.set(2048, 2048); sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03;
		scene.add(sunLight); scene.add(sunLight.target);
		hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); scene.add(hemi);
		tmpV = new THREE.Vector3(); tmpQ = new THREE.Quaternion(); tmpM = new THREE.Matrix4();
		resize();
		new ResizeObserver(resize).observe(stage);
	}
	function resize() {
		if (!renderer) return;
		var w = stage.clientWidth || 640, h = stage.clientHeight || 360;
		root.classList.toggle("cs-narrow", w < 900);
		var sb = stage.querySelector(".cs-sbtns"); if (sb) stage.style.setProperty("--cs-spt", (sb.offsetTop + sb.offsetHeight + 8) + "px");
		renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
	}

	/* ---------- textures drawn on a canvas ---------- */
	function canvasTex(w, h, draw, rep) {
		var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
		var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
		if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
		return t;
	}
	function noiseTex(seed, base, spread) {
		var r = C.rng(seed);
		return canvasTex(256, 256, function (g, w, h) {
			var id = g.createImageData(w, h);
			for (var i = 0; i < w * h; i++) { var v = base + (r() - 0.5) * spread + (C.noise((i % w) / 16, Math.floor(i / w) / 16, seed) - 0.5) * spread * 1.4; v = Math.max(0, Math.min(255, v)); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
			g.putImageData(id, 0, 0);
		});
	}

	/* ===================== the world ===================== */
	function clearWorld() {
		if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
		if (skyGroup) scene.remove(skyGroup); skyGroup = null; skyRef = null;
		cars.forEach(function (c) { scene.remove(c.group); }); objs.forEach(function (o) { scene.remove(o.mesh); });
		cars = []; objs = []; statics = []; parts.clear(); lampMat = null; groundMat = trackMat = null; if (heads && heads.group.parent) heads.group.parent.remove(heads.group); replayStop(true); recFrames = [];
		if (phys) { phys.free(); phys = null; }
	}

	function buildWorld() {
		clearWorld();
		W = C.WORLDS[S.world];
		gravity = S.g != null ? S.g : W.g; gFlip = 0;
		phys = new RAPIER.World({ x: 0, y: -gravity, z: 0 }); phys.timestep = 1 / 60;
		eventQ = new RAPIER.EventQueue(true);
		worldGroup = new THREE.Group(); scene.add(worldGroup);
		ter = C.makeTerrain(S.world); groundH = C.heightGrid(ter);
		buildSky(); buildGround(); buildStatics(); buildBorder(); buildDecor();
		applyLighting();
		/* the player's car at the start, then the computer cars */
		var start = startPose(0);
		cars.push(makeCar(S.car && C.CARS[S.car] ? S.car : W.car, S.color || null, start, true));
		player = 0; lapReset(); if (ghostMesh) { scene.remove(ghostMesh); ghostMesh = null; } ghostKey = ""; ghost = null;
		setTraffic(S.traffic);
		camSnap = true;
		updateGravityUI(); updateHud(true); applyShow();
	}
	function startPose(i) {
		if (W.track) { var p = C.trackPoint(i ? 30 + i * 16 : -8), lane = (i % 2 ? 1 : -1) * (i ? 3.5 : 0); return { x: p.x + Math.cos(p.dir) * lane, z: p.z - Math.sin(p.dir) * lane, yaw: p.dir }; }
		var a = i * 0.9; return { x: Math.sin(a) * (i ? 14 + i * 3 : 0), z: -Math.cos(a) * (i ? 14 + i * 3 : 0), yaw: 0 };
	}
	function hAt(x, z) { return C.gridHeight(ter, groundH, x, z); }
	/* ---------- day and night ---------- */
	var NIGHT_SKY = { earth: ["#01030a", "#0c1730"], jupiter: ["#030208", "#1a1420"], mars: ["#04030a", "#1e1418"], moon: ["#000000", "#020308"], ceres: ["#000000", "#020205"] };
	var dayK = 1, skyRef = null;
	function applyLighting() { applyGround(); buildWeather(); sunLight.castShadow = !!S.shadows; if (!skyGroup) buildSky(); applyTime(); }
	/* everything that depends on the hour: sun / moon light, sky colours, stars, fog, lamps. Cheap, so it runs every frame while the day cycles. */
	var tmpC1, tmpC2, tmpC3;
	function applyTime() {
		if (!W || !skyRef) return;
		tmpC1 = tmpC1 || new THREE.Color(); tmpC2 = tmpC2 || new THREE.Color(); tmpC3 = tmpC3 || new THREE.Color();
		var st = C.sunAt(S.tod, W.sun), d = st.day, X = wx(), ov = X.over, dusk = st.dusk * (1 - ov * 0.8);
		dayK = d;
		var sunDir = new THREE.Vector3(st.dir[0], st.dir[1], st.dir[2]), moonDir = new THREE.Vector3(-st.dir[0], Math.max(0.35, Math.abs(st.dir[1]) * 0.6 + 0.3), -st.dir[2]).normalize();
		var dayI = (W.amb < 0.3 ? 3.2 : 2.4) * (1 - ov * 0.65), nightI = W.planet === "earth" ? 0.55 : 0.4;
		if (st.sunK >= st.moonK) { sunLight.userData.dir = sunDir; sunLight.intensity = dayI * st.sunK; sunLight.color.set(W.sunCol).lerp(tmpC1.set("#ff9b5c"), Math.min(1, dusk * 1.1)); }
		else { sunLight.userData.dir = moonDir; sunLight.intensity = nightI * st.moonK * (1 - ov * 0.6); sunLight.color.set(W.planet === "earth" ? "#9fc0ff" : "#a9bdf5"); }
		var dayHemi = ov ? W.amb * (1 + ov * 0.4) : W.amb;
		hemi.intensity = 0.12 + (dayHemi - 0.12) * d;
		hemi.color.set(0x1d2a48).lerp(tmpC1.set(W.amb < 0.3 ? 0x8899aa : W.sky[1]), d); hemi.groundColor.set(0x050608).lerp(tmpC1.set(W.ground[0]), d);
		hemiBase = hemi.intensity;
		renderer.toneMappingExposure = 1.25 + ((W.amb < 0.3 ? 0.95 : 1.0) - 1.25) * d;
		/* sky: night colours -> day colours (greyer under cloud), with an orange horizon at sunrise / sunset */
		var dsky = W.sky, nsky = NIGHT_SKY[S.world] || ["#000", "#050810"];
		var top = tmpC1.set(dsky[0]), hor = tmpC2.set(dsky[1]);
		if (ov) { var grey = S.world === "mars" ? ["#8f6a4c", "#c79a72"] : X.snowy ? ["#9aa4b0", "#d5dbe2"] : ["#4f5863", "#8b949e"]; top.lerp(tmpC3.set(grey[0]), ov); hor.lerp(tmpC3.set(grey[1]), ov); }
		top.lerp(tmpC3.set(ov ? "#0a0c10" : nsky[0]), 1 - d); hor.lerp(tmpC3.set(ov ? "#111419" : nsky[1]), 1 - d);
		if (W.rho) hor.lerp(tmpC3.set(S.world === "mars" ? "#7fa6c9" /* Mars sunsets are blue */ : "#ff8a45"), dusk * 0.85);
		var col = skyRef.geo.attributes.color, ys = skyRef.ys, c = tmpC3;
		for (var i = 0; i < ys.length; i++) { c.copy(hor).lerp(top, Math.pow(ys[i], 0.55)); col.setXYZ(i, c.r, c.g, c.b); }
		col.needsUpdate = true;
		skyRef.sun.position.copy(sunDir).multiplyScalar(1500); skyRef.sun.visible = st.elev > -0.06 && ov < 0.55; skyRef.sun.material.color.set("#ffffff").lerp(tmpC3.set("#ffb070"), dusk);
		if (skyRef.moon) { skyRef.moon.position.copy(moonDir).multiplyScalar(1500); skyRef.moon.material.opacity = Math.max(0, 1 - d * 1.4); skyRef.moon.visible = skyRef.moon.material.opacity > 0.02 && ov < 0.55; }
		var so = W.stars ? 1 : Math.pow(1 - d, 2) * (ov < 0.55 ? 1 : 0); skyRef.stars.material.opacity = so; skyRef.stars.visible = so > 0.02;
		/* fog follows the sky */
		var fogDay = X.fogCol || (W.fog && W.fog[0]);
		if (fogDay) {
			var fcol = tmpC3.set(fogDay); if (W.rho) fcol.lerp(tmpC2.set("#e79a6a"), dusk * 0.35); fcol.lerp(tmpC1.set("#05070d"), 1 - d);
			var f1 = (W.fog ? W.fog[1] : 300) * Math.max(0.05, X.fog) * (0.6 + 0.4 * d), f2 = (W.fog ? W.fog[2] : 900) * X.fog * (0.7 + 0.3 * d);
			if (!scene.fog) scene.fog = new THREE.Fog(fcol, f1, f2); else { scene.fog.color.copy(fcol); scene.fog.near = f1; scene.fog.far = f2; }
		} else scene.fog = null;
		if (lampMat) lampMat.emissiveIntensity = 3 * Math.max(0, Math.min(1, (0.55 - d) / 0.35));
		var dark = d < 0.45, b = $("cs-night"); if (b) { b.setAttribute("aria-pressed", String(dark)); b.textContent = dark ? "☀️" : "🌙"; }
		todUI();
	}
	function todUI() {
		root.querySelectorAll("[data-tod]").forEach(function (x) { if (document.activeElement !== x) x.value = String(S.tod); });
		root.querySelectorAll("[data-todlab]").forEach(function (x) { x.textContent = C.fmtTime(S.tod) + " · " + C.timeName(S.tod); });
		root.querySelectorAll("[data-cycle]").forEach(function (x) { x.textContent = S.cycle ? "❚❚ Stop the clock" : "▶ Run the day"; x.setAttribute("aria-pressed", String(!!S.cycle)); });
		root.querySelectorAll("[data-cyspd]").forEach(function (x) { x.value = String(S.cycleMin); });
	}
	function setTod(h, quiet) { S.tod = ((h % 24) + 24) % 24; if (!quiet) save(); applyTime(); }
	/* ---------- weather ---------- */
	function wx() { return C.WEATHER[C.weatherFor(S.world).indexOf(S.weather) >= 0 ? S.weather : "clear"]; }
	var hemiBase = 0.5, groundMat = null, trackMat = null, groundMap = null, snowMap = null, wxObj = null, rainSnd = null, nextBolt = 0, flash = 0;
	function applyGround() {
		var X = wx();
		if (groundMat) {
			if (X.snowy) { snowMap = snowMap || canvasTex(256, 256, function (g, w, h) { var r = C.rng(8), id = g.createImageData(w, h); for (var i = 0; i < w * h; i++) { var v = 232 + (r() - 0.5) * 26 + (C.noise((i % w) / 20, Math.floor(i / w) / 20, 3) - 0.5) * 30; id.data[i * 4] = v - 6; id.data[i * 4 + 1] = v - 2; id.data[i * 4 + 2] = Math.min(255, v + 8); id.data[i * 4 + 3] = 255; } g.putImageData(id, 0, 0); }, [1, 1]); groundMat.map = snowMap; groundMat.color.set(S.world === "mars" ? "#f2e2d2" : "#ffffff"); }
			else { groundMat.map = groundMap; groundMat.color.set(X.p === "rain" ? "#b5b5b5" : "#ffffff"); }
			groundMat.needsUpdate = true;
		}
		if (trackMat) { var wet = X.p === "rain"; trackMat.roughness = wet ? 0.28 : 0.85; trackMat.metalness = wet ? 0.25 : 0; trackMat.color.set(X.snowy ? "#d9dde3" : wet ? "#8a8a8a" : (W.g > 20 ? "#c8b89a" : "#ffffff")); }
	}
	function buildWeather() {
		if (wxObj) { scene.remove(wxObj); wxObj.geometry.dispose(); wxObj = null; }
		var X = wx(); if (!X.p) return;
		var n = X.n, rain = X.p === "rain", pos = new Float32Array(n * (rain ? 6 : 3)), cam = camera.position, r = C.rng(4);
		var P = new Float32Array(n * 3); for (var i = 0; i < n; i++) { P[i * 3] = cam.x + (r() - 0.5) * WXB; P[i * 3 + 1] = cam.y + (r() - 0.5) * WXH; P[i * 3 + 2] = cam.z + (r() - 0.5) * WXB; }
		var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		if (rain) wxObj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc8d6e4, transparent: true, opacity: 0.7, depthWrite: false }));
		else wxObj = new THREE.Points(geo, new THREE.PointsMaterial({ color: X.p === "dust" ? 0xc98a55 : 0xffffff, size: X.p === "dust" ? 0.16 : 0.28, transparent: true, opacity: X.p === "dust" ? 0.55 : 0.95, depthWrite: false, map: flakeTex(), alphaTest: 0.05 }));
		wxObj.frustumCulled = false; wxObj.userData = { P: P, X: X, phase: new Float32Array(n).map(function () { return r() * 6.28; }) }; scene.add(wxObj);
	}
	var WXB = 50, WXH = 26, flakeT = null;
	function flakeTex() { return flakeT || (flakeT = canvasTex(32, 32, function (g) { var gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,0.7)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); })); }
	function stepWeather(dt) {
		if (!wxObj) return;
		var U = wxObj.userData, X = U.X, P = U.P, n = X.n, pos = wxObj.geometry.attributes.position.array, cam = camera.position, rain = X.p === "rain", t = performance.now() / 1000;
		var wind = X.wind, fall = X.fall * Math.min(1.6, Math.sqrt(Math.max(0.3, gravity) / 9.81)), hb = WXB / 2, hh = WXH / 2;
		for (var i = 0; i < n; i++) {
			var k = i * 3, sw = X.p === "snow" ? Math.sin(t * 1.3 + U.phase[i]) * 0.6 : 0;
			P[k] += (wind + sw) * dt; P[k + 1] -= fall * dt; P[k + 2] += (X.p === "dust" ? wind * 0.3 : sw * 0.6) * dt;
			if (X.p === "dust") P[k + 1] += Math.sin(t * 2 + U.phase[i]) * dt * 1.5;
			var dx = P[k] - cam.x, dy = P[k + 1] - cam.y, dz = P[k + 2] - cam.z;
			if (dx > hb) P[k] -= WXB; else if (dx < -hb) P[k] += WXB;
			if (dz > hb) P[k + 2] -= WXB; else if (dz < -hb) P[k + 2] += WXB;
			if (dy < -hh) P[k + 1] += WXH; else if (dy > hh) P[k + 1] -= WXH;
			if (rain) { var j = i * 6; pos[j] = P[k]; pos[j + 1] = P[k + 1]; pos[j + 2] = P[k + 2]; pos[j + 3] = P[k] - wind * 0.045; pos[j + 4] = P[k + 1] + fall * 0.045; pos[j + 5] = P[k + 2]; }
			else { pos[k] = P[k]; pos[k + 1] = P[k + 1]; pos[k + 2] = P[k + 2]; }
		}
		wxObj.geometry.attributes.position.needsUpdate = true;
		/* lightning */
		if (X.lightning && !replay) {
			if (simT > nextBolt) { nextBolt = simT + 5 + Math.random() * 10; flash = 0.35; setTimeout(function () { sfx("thunder", 0.6 + Math.random() * 0.4); }, 600 + Math.random() * 2400); }
			if (flash > 0) { flash -= dt; hemi.intensity = (flash % 0.12 > 0.06 ? 4 : 0.6); if (flash <= 0) hemi.intensity = hemiBase; }
		}
	}
	function rainSound() {
		if (!ac || !noiseBuf) return; var X = wx(), on = S.sound && !document.hidden && stageVisible() && (X.p === "rain" || X.p === "dust");
		if (on && !rainSnd) { var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = noiseBuf; src.loop = true; f.type = X.p === "dust" ? "lowpass" : "bandpass"; f.frequency.value = X.p === "dust" ? 500 : 1600; g.gain.value = 0; src.connect(f); f.connect(g); g.connect(eng.master); src.start(); rainSnd = { src: src, g: g, f: f }; }
		if (rainSnd) { rainSnd.g.gain.setTargetAtTime(on ? (X.n > 6000 ? 0.32 : 0.2) : 0, ac.currentTime, 0.3); if (!on && rainSnd.g.gain.value < 0.01) { rainSnd.src.stop(); rainSnd = null; } }
	}
	function setWeather(k) {
		if (C.weatherFor(S.world).indexOf(k) < 0) { toast(W.rho ? "Not on this world" : "No air on " + W.name.replace(/ \(.*/, "") + ", so no weather"); return; }
		S.weather = k; save(); applyLighting(); updateGravityUI(); syncUrl();
		var X = wx(); $("cs-wx").value = k;
		toast(X.name + (X.grip < 1 ? ": tyre grip " + Math.round(X.grip * 100) + "% of dry, so brake earlier" : ""));
	}
	function setNight(on) { setTod(on ? 22 : 12.5); syncUrl(); toast(on ? (W.stars ? "Night: only the light of the " + (W.planet === "earth" ? "Earth" : "stars") + " and your headlights" : "Night: headlights on") : "Daytime"); }
	/* headlights: two real spot lights on the player's car (only at night) + faint beams */
	var heads = null;
	function headlights() {
		if (!heads) {
			heads = { group: new THREE.Group(), lights: [] };
			[-1, 1].forEach(function (sx) {
				var L = new THREE.SpotLight(0xfff0d0, 260, 110, 0.42, 0.55, 1.3), tg = new THREE.Object3D();
				L.position.set(sx * 0.6, 0, 0); tg.position.set(sx * 1.2, -2.2, 30); L.target = tg; heads.group.add(L, tg); heads.lights.push(L);
			});
			var beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 20, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.022, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
			beam.rotation.x = -Math.PI / 2; beam.position.set(0, -0.5, 10); heads.group.add(beam);
		}
		var c = cars[player]; if (!c) return;
		heads.group.visible = dayK < 0.45;
		if (heads.group.parent !== c.group) { c.group.add(heads.group); heads.group.position.set(0, c.d.windows ? -c.d.h * 0.3 : c.d.h * 0.15, c.d.l / 2 + 0.05); }
	}

	function buildSky() {
		skyGroup = new THREE.Group(); scene.add(skyGroup);
		var geo = new THREE.SphereGeometry(1800, 32, 16), p = geo.attributes.position, ys = new Float32Array(p.count);
		for (var i = 0; i < p.count; i++) ys[i] = Math.max(0, p.getY(i) / 1800);
		geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3));
		skyGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
		var sunTex = canvasTex(128, 128, function (g) { var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,250,1)"); gr.addColorStop(0.18, "rgba(255,250,230,0.95)"); gr.addColorStop(0.4, "rgba(255,230,180,0.25)"); gr.addColorStop(1, "rgba(255,220,160,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
		var sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true })); sun.scale.setScalar(W.amb < 0.3 ? 120 : 260); skyGroup.add(sun);
		var moonS = null;
		if (!W.stars) { /* a moon for the night sky */
			var mt = canvasTex(128, 128, function (g) { var gr = g.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, "rgba(235,240,255,1)"); gr.addColorStop(0.42, "rgba(220,228,250,1)"); gr.addColorStop(0.5, "rgba(180,200,255,0.25)"); gr.addColorStop(1, "rgba(150,180,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = "rgba(160,170,190,.5)"; [[52, 50, 9], [74, 70, 7], [60, 78, 5]].forEach(function (c) { g.beginPath(); g.arc(c[0], c[1], c[2], 0, 7); g.fill(); }); });
			moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, fog: false, depthWrite: false, transparent: true })); moonS.scale.setScalar(150); skyGroup.add(moonS);
		}
		var r = C.rng(99), pts = [];
		for (var k = 0; k < 2500; k++) { var u = r() * 2 - 1, a = r() * Math.PI * 2, s2 = Math.sqrt(1 - u * u); if (u < -0.05) continue; pts.push(Math.cos(a) * s2 * 1700, u * 1700, Math.sin(a) * s2 * 1700); }
		var sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
		var stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true }));
		skyGroup.add(stars);
		skyRef = { geo: geo, ys: ys, sun: sun, moon: moonS, stars: stars };
		if (W.planet === "earth") {
			var et = canvasTex(512, 256, function (g, w, h) { g.fillStyle = "#1d4f91"; g.fillRect(0, 0, w, h); var r2 = C.rng(5); g.fillStyle = "#3f7d3a"; for (var i = 0; i < 26; i++) { g.beginPath(); g.ellipse(r2() * w, h * (0.2 + r2() * 0.6), 20 + r2() * 60, 12 + r2() * 30, r2() * 3, 0, 7); g.fill(); } g.fillStyle = "rgba(255,255,255,.75)"; for (i = 0; i < 60; i++) { g.beginPath(); g.ellipse(r2() * w, r2() * h, 10 + r2() * 40, 3 + r2() * 8, r2() * 0.5, 0, 7); g.fill(); } g.fillStyle = "#f4f7fb"; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); });
			var earth = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 24), new THREE.MeshStandardMaterial({ map: et, roughness: 0.8, fog: false }));
			earth.position.set(-600, 520, -900); earth.rotation.z = 0.4; skyGroup.add(earth);
		}
		if (W.planet === "saturn") {
			var st = canvasTex(256, 128, function (g, w, h) { for (var y = 0; y < h; y++) { g.fillStyle = "hsl(38," + (35 + 15 * Math.sin(y * 0.35)) + "%," + (62 + 10 * Math.sin(y * 0.17)) + "%)"; g.fillRect(0, y, w, 1); } });
			var sat = new THREE.Group(); sat.add(new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), new THREE.MeshStandardMaterial({ map: st, fog: false })));
			var ring = new THREE.Mesh(new THREE.RingGeometry(115, 190, 96), new THREE.MeshBasicMaterial({ color: 0xd8c39a, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false })); ring.rotation.x = -Math.PI / 2 + 0.35; sat.add(ring);
			sat.position.set(700, 420, -800); sat.rotation.z = -0.3; skyGroup.add(sat);
		}
	}

	function buildGround() {
		var n = ter.n, s = ter.size, k = n + 1, pos = new Float32Array(k * k * 3), col = new Float32Array(k * k * 3), uv = new Float32Array(k * k * 2), idx = [];
		/* the ground picture (AI-made seamless photo textures, tex-<name>.jpg) carries the colour; vertex colours only shade it */
		var TX = { earth: ["grass", 5, [1, 1, 1]], moon: ["moon", 11, [1, 1, 1]], mars: ["mars", 9, [1, 1, 1]], ceres: ["ceres", 9, [1, 1, 1]], jupiter: ["mars", 9, [0.86, 0.8, 0.7]] }[S.world] || ["grass", 5, [1, 1, 1]];
		var tint = TX[2], c = new THREE.Color();
		for (var ix = 0; ix <= n; ix++) for (var iz = 0; iz <= n; iz++) {
			var i = ix * k + iz, x = -s / 2 + ix * s / n, z = -s / 2 + iz * s / n, y = groundH[i];
			pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; uv[i * 2] = x / TX[1]; uv[i * 2 + 1] = z / TX[1];
			var sl = Math.min(1, Math.hypot(groundH[Math.min(n, ix + 1) * k + iz] - groundH[Math.max(0, ix - 1) * k + iz], groundH[ix * k + Math.min(n, iz + 1)] - groundH[ix * k + Math.max(0, iz - 1)]) / (2 * s / n) * 1.5);
			var nz = C.noise(x / 30, z / 30, 77);
			var b = 0.84 + (nz - 0.5) * 0.34 + (C.noise(x / 7, z / 7, 78) - 0.5) * 0.12 - sl * 0.22;
			if (W.craters) { var cr = 0; ter.craters.forEach(function (q) { var d = Math.hypot(x - q.x, z - q.z) / q.R; if (d < 1) cr = Math.max(cr, 1 - d); }); b -= cr * 0.18; }
			if (W.track) { var dry = Math.max(0, C.noise(x / 55, z / 55, 79) - 0.55) * 1.4; c.setRGB(b * (1 + dry * 0.25), b * (1 - dry * 0.05), b * (1 - dry * 0.35)); } else c.setRGB(b, b, b);
			c.r *= tint[0]; c.g *= tint[1]; c.b *= tint[2];
			col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
		}
		for (ix = 0; ix < n; ix++) for (iz = 0; iz < n; iz++) { var a = ix * k + iz, b = (ix + 1) * k + iz, cc = ix * k + iz + 1, d = (ix + 1) * k + iz + 1; idx.push(a, cc, b, b, cc, d); }
		var geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
		geo.setIndex(idx); geo.computeVertexNormals();
		var tex = new THREE.TextureLoader().load("/car-sandbox/img/tex-" + TX[0] + ".jpg?v=1", function () { /* drawn on the next frame */ });
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
		groundMap = tex; groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.97, metalness: 0 });
		var mesh = new THREE.Mesh(geo, groundMat);
		mesh.receiveShadow = true; worldGroup.add(mesh);
		/* physics */
		var body = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
		phys.createCollider(RAPIER.ColliderDesc.heightfield(n, n, groundH, { x: s, y: 1, z: s }).setFriction(W.track ? 1.0 : 0.85).setRestitution(0.05), body);
		if (W.track) buildTrack();
	}

	function buildTrack() {
		var T = C.TRACK, L = C.trackLength(), N = Math.ceil(L / 2), pos = [], uv = [], idx = [];
		for (var i = 0; i <= N; i++) {
			var p = C.trackPoint(i / N * L), lx = Math.cos(p.dir), lz = -Math.sin(p.dir);
			pos.push(p.x + lx * T.width / 2, 0.03, p.z + lz * T.width / 2, p.x - lx * T.width / 2, 0.03, p.z - lz * T.width / 2);
			uv.push(0, i / N * L / 8, 1, i / N * L / 8);
			if (i < N) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
		}
		var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
		var tex = canvasTex(128, 256, function (g, w, h) {
			var r = C.rng(3), id = g.createImageData(w, h);
			for (var q = 0; q < w * h; q++) { var v = 62 + r() * 22; id.data[q * 4] = v; id.data[q * 4 + 1] = v; id.data[q * 4 + 2] = v + 3; id.data[q * 4 + 3] = 255; }
			g.putImageData(id, 0, 0); g.fillStyle = "#f2f2f2"; g.fillRect(3, 0, 5, h); g.fillRect(w - 8, 0, 5, h); g.fillRect(w / 2 - 2, 0, 4, h * 0.45);
		});
		tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
		trackMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
		var m = new THREE.Mesh(geo, trackMat);
		if (W.g > 20) m.material.color.set("#c8b89a");
		m.receiveShadow = true; worldGroup.add(m);
		/* start line */
		var p0 = C.trackPoint(0), chk = canvasTex(64, 16, function (g) { for (var x = 0; x < 16; x++) for (var y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? "#111" : "#fff"; g.fillRect(x * 4, y * 4, 4, 4); } });
		var line = new THREE.Mesh(new THREE.PlaneGeometry(T.width, 2), new THREE.MeshStandardMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -4 }));
		line.rotation.x = -Math.PI / 2; line.rotation.z = p0.dir; line.position.set(p0.x, 0.04, p0.z); worldGroup.add(line);
	}

	function fixedBox(hx, hy, hz, x, y, z, q, fric) {
		var b = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q));
		phys.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(fric == null ? 0.9 : fric), b); return b;
	}
	function qYaw(y) { return { x: 0, y: Math.sin(y / 2), z: 0, w: Math.cos(y / 2) }; }
	var matCache = {};
	function mat(col, o) { var k = col + JSON.stringify(o || {}); return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.8 }, o || {}))); }

	function buildStatics() {
		matCache = {};
		var ramp = canvasTex(64, 64, function (g, w, h) { g.fillStyle = "#c9c2b5"; g.fillRect(0, 0, w, h); g.fillStyle = "#e8a400"; for (var i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 16, h); g.lineTo(i * 16 + 8, h); g.lineTo(i * 16 + 8 + h, 0); g.lineTo(i * 16 + h, 0); g.fill(); } }, [1, 1]);
		C.statics(S.world).forEach(function (st) {
			var gy = Math.min(hAt(st.x, st.z), hAt(st.x + 5, st.z + 5), hAt(st.x - 5, st.z - 5)) - 0.02;
			var q = qYaw(st.yaw), tq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
			if (st.t === "ramp") {
				var pts = C.rampPoints(st.w, st.l, st.h);
				var b = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(st.x, gy, st.z).setRotation(q));
				phys.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setFriction(1.0), b);
				var a = st.w / 2, l = st.l / 2, h = st.h;
				var v = [-a, 0, -l, a, 0, -l, a, h, l, -a, 0, -l, a, h, l, -a, h, l, /* slope */ -a, 0, -l, -a, h, l, -a, 0, l, a, 0, -l, a, 0, l, a, h, l, /* sides */ -a, 0, l, -a, h, l, a, h, l, -a, 0, l, a, h, l, a, 0, l /* back */];
				var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
				var uvs = []; for (var i = 0; i < v.length; i += 3) uvs.push((v[i] + a) / 4, (v[i + 2] + l) / 4); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
				geo.computeVertexNormals();
				var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ramp, roughness: 0.85, side: THREE.DoubleSide })); m.position.set(st.x, gy, st.z); m.quaternion.copy(tq); m.castShadow = m.receiveShadow = true; worldGroup.add(m);
			} else if (st.t === "block") {
				fixedBox(st.w / 2, st.h / 2, st.l / 2, st.x, gy + st.h / 2, st.z, q);
				var bm = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.l), mat("#9aa0a6")); bm.position.set(st.x, gy + st.h / 2, st.z); bm.quaternion.copy(tq); bm.castShadow = bm.receiveShadow = true; worldGroup.add(bm);
			} else if (st.t === "loop") {
				var planks = C.loopPlanks(st.r, st.w, 44), geoP = new THREE.BoxGeometry(st.w, 0.4, 1), im = new THREE.InstancedMesh(geoP, mat("#e04b2a", { roughness: 0.6 }), planks.length);
				planks.forEach(function (pk, j) {
					/* local: x lateral (left of the travel direction), loop starts at z = 0 going +z; plank pushed 0.2 m outward so its top is the driving surface */
					var lq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pk.angle);
					var nrm = new THREE.Vector3(0, 1, 0).applyQuaternion(lq);
					var lp = new THREE.Vector3(pk.x, pk.y, pk.z).addScaledVector(nrm, -0.2);
					var wp = lp.applyQuaternion(tq).add(new THREE.Vector3(st.x, gy, st.z)), wq = tq.clone().multiply(lq);
					fixedBox(st.w / 2, 0.2, pk.len / 2, wp.x, wp.y, wp.z, { x: wq.x, y: wq.y, z: wq.z, w: wq.w }, 1.1);
					tmpM.compose(wp, wq, new THREE.Vector3(1, 1, pk.len)); im.setMatrixAt(j, tmpM);
				});
				im.castShadow = im.receiveShadow = true; worldGroup.add(im);
			} else if (st.t === "pipe") {
				var pp = C.pipePlanks(st.r, 20), gp = new THREE.BoxGeometry(1, 0.4, st.l), ip = new THREE.InstancedMesh(gp, mat("#8fb3d9", { roughness: 0.5 }), pp.length);
				pp.forEach(function (pk, j) {
					var lq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pk.angle), nrm = new THREE.Vector3(0, 1, 0).applyQuaternion(lq);
					var wp = new THREE.Vector3(pk.x, pk.y, 0).addScaledVector(nrm, -0.2).applyQuaternion(tq).add(new THREE.Vector3(st.x, gy, st.z)), wq = tq.clone().multiply(lq);
					fixedBox(pk.len / 2, 0.2, st.l / 2, wp.x, wp.y, wp.z, { x: wq.x, y: wq.y, z: wq.z, w: wq.w }, 1.0);
					tmpM.compose(wp, wq, new THREE.Vector3(pk.len, 1, 1)); ip.setMatrixAt(j, tmpM);
				});
				ip.castShadow = ip.receiveShadow = true; worldGroup.add(ip);
			}
			statics.push(st);
		});
	}
	function buildBorder() {
		var s = ter.size / 2, h = 80;
		[[s, 0, 1, s], [-s, 0, 1, s], [0, s, s, 1], [0, -s, s, 1]].forEach(function (b) { fixedBox(b[2], h, b[3], b[0], h - 10, b[1], { x: 0, y: 0, z: 0, w: 1 }, 0.2); });
	}
	function buildDecor() {
		var r = C.rng(W.seed + 3), half = ter.size / 2 - 50;
		if (W.trees) {
			var N = 260, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), mat("#6b4a2b"), N), crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 6, 8), mat("#2f6b2f"), N), n = 0;
			for (var t = 0; t < 2000 && n < N; t++) {
				var x = (r() * 2 - 1) * half, z = (r() * 2 - 1) * half;
				if (C.trackDist(x, z) < 22 || Math.hypot(x, z - 70) < 55 || (Math.abs(x) < C.TRACK.half + C.TRACK.r && Math.abs(z - C.TRACK.cz) < C.TRACK.r)) continue;
				var y = hAt(x, z), sc = 0.7 + r() * 0.8;
				tmpM.compose(new THREE.Vector3(x, y + 1.2 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)); trunk.setMatrixAt(n, tmpM);
				tmpM.compose(new THREE.Vector3(x, y + 5 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)); crown.setMatrixAt(n, tmpM);
				var b = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + 1.5, z)); phys.createCollider(RAPIER.ColliderDesc.cylinder(1.5, 0.35 * sc), b);
				n++;
			}
			trunk.count = crown.count = n; trunk.castShadow = crown.castShadow = true; worldGroup.add(trunk, crown);
			/* lamp posts along the track: their heads glow at night */
			lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe2a0, emissiveIntensity: 0 });
			var LN = Math.floor(C.trackLength() / 40), poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 6), mat("#8a9099", { metalness: 0.6 }), LN), lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.18, 0.4), lampMat, LN);
			for (var li = 0; li < LN; li++) { var lp = C.trackPoint(li * 40 + 10), ox = Math.cos(lp.dir), oz = -Math.sin(lp.dir), side = C.TRACK.width / 2 + 1.5, px = lp.x + ox * side, pz = lp.z + oz * side;
				tmpM.compose(new THREE.Vector3(px, 3.5, pz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); poles.setMatrixAt(li, tmpM);
				tmpM.compose(new THREE.Vector3(px - ox * 0.6, 7, pz - oz * 0.6), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lp.dir), new THREE.Vector3(1, 1, 1)); lamps.setMatrixAt(li, tmpM);
				var lb = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(px, 3.5, pz)); phys.createCollider(RAPIER.ColliderDesc.cylinder(3.5, 0.12), lb); }
			poles.castShadow = true; worldGroup.add(poles, lamps);
			/* grandstand by the start straight */
			var p0 = C.trackPoint(0), gs = new THREE.Group();
			for (var row = 0; row < 6; row++) { var bx = new THREE.Mesh(new THREE.BoxGeometry(60, 0.9, 1.6), mat(row % 2 ? "#9aa3ad" : "#b8c0c8")); bx.position.set(0, row * 0.9 + 0.45, row * 1.5); bx.castShadow = bx.receiveShadow = true; gs.add(bx); }
			var roof = new THREE.Mesh(new THREE.BoxGeometry(62, 0.3, 11), mat("#c0392b")); roof.position.set(0, 9, 4); roof.castShadow = true; gs.add(roof);
			gs.position.set(p0.x + 30, 0, p0.z + 14); worldGroup.add(gs);
			fixedBox(30, 3, 5, p0.x + 30, 3, p0.z + 18, { x: 0, y: 0, z: 0, w: 1 });
		}
		if (W.rocks) {
			var NR = W.rocks, rk = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(W.ground[2], { roughness: 1, flatShading: true }), NR);
			for (var k = 0; k < NR; k++) {
				var rx = (r() * 2 - 1) * half, rz = (r() * 2 - 1) * half; if (Math.hypot(rx, rz) < 30) { k--; continue; }
				var s = 0.6 + Math.pow(r(), 2) * 3, ry = hAt(rx, rz);
				tmpM.compose(new THREE.Vector3(rx, ry + s * 0.3, rz), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(s, s * 0.7, s * 1.1)); rk.setMatrixAt(k, tmpM);
				var rb = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(rx, ry + s * 0.3, rz)); phys.createCollider(RAPIER.ColliderDesc.ball(s * 0.75), rb);
			}
			rk.castShadow = rk.receiveShadow = true; worldGroup.add(rk);
		}
		if (W.stars) { /* a flag at the start */
			var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), mat("#dddddd", { metalness: 0.6 })); pole.position.set(6, 1.2, 4); worldGroup.add(pole);
			var fl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), mat("#ffffff", { side: THREE.DoubleSide, map: canvasTex(64, 40, function (g) { g.fillStyle = "#1a5fb4"; g.fillRect(0, 0, 64, 40); g.fillStyle = "#fff"; g.font = "bold 18px sans-serif"; g.fillText("MES", 12, 27); }) })); fl.position.set(6.56, 2.0, 4); worldGroup.add(fl);
		}
	}

	/* ===================== cars ===================== */
	function shapeBox(geo, f) { var p = geo.attributes.position, v = new THREE.Vector3(); for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); f(v); p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); return geo; }
	/* a closed car body: its side profile (with wheel arches cut into the bottom edge) extruded across the width, bevelled, plus glass */
	function profileBody(d, P, paint, glass, g) {
		var H = d.h + (d.cab ? d.cab[0] : 0), y0 = -d.h / 2, L = d.l, W2 = d.w - 0.1;
		var pts = P.body.map(function (p) { return [p[0] * L, y0 + p[1] * H]; }), yb = pts[0][1];
		/* bottom edge from the front back to the rear, with an arch over each axle */
		var ar = d.wr + 0.07, yw = d.ry - d.rest * 0.8, out = pts.slice();
		[d.wf, d.wb].forEach(function (z) {
			if (yw + ar <= yb + 0.02) return; var dy = yb - yw, hc = dy > -ar ? Math.sqrt(Math.max(0, ar * ar - dy * dy)) : 0; if (!hc) return;
			var a1 = Math.atan2(dy, hc), a2 = Math.PI - a1;
			out.push([z + hc, yb]); for (var k = 1; k < 12; k++) { var a = a1 + (a2 - a1) * k / 12; out.push([z + Math.cos(a) * ar, yw + Math.sin(a) * ar]); } out.push([z - hc, yb]);
		});
		/* more points along long straight edges, so dents have something to bend */
		var dense = [];
		for (var i = 0; i < out.length; i++) { var p0 = out[i], p1 = out[(i + 1) % out.length], n = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.28)); for (var j = 0; j < n; j++) dense.push(new THREE.Vector2(p0[0] + (p1[0] - p0[0]) * j / n, p0[1] + (p1[1] - p0[1]) * j / n)); }
		var geo = new THREE.ExtrudeGeometry(new THREE.Shape(dense), { depth: W2, steps: 6, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 });
		geo.translate(0, 0, -W2 / 2); geo.rotateY(-Math.PI / 2); geo.computeVertexNormals();
		var body = new THREE.Mesh(geo, paint);
		if (P.win) {
			var wg = new THREE.ExtrudeGeometry(new THREE.Shape(P.win.map(function (p) { return new THREE.Vector2(p[0] * L, y0 + p[1] * H); })), { depth: d.w + 0.02, bevelEnabled: false });
			wg.translate(0, 0, -(d.w + 0.02) / 2); wg.rotateY(-Math.PI / 2); body.add(new THREE.Mesh(wg, glass));
		}
		[P.ws, P.rs].forEach(function (e) {
			if (!e) return; var z1 = e[0][0] * L, y1 = y0 + e[0][1] * H, z2 = e[1][0] * L, y2 = y0 + e[1][1] * H, nz = y2 - y1, ny = -(z2 - z1), nl = Math.hypot(nz, ny) || 1, s = z1 > 0 ? 1 : -1;
			var ox = nz / nl * 0.03 * s, oy = ny / nl * 0.03 * s, x = d.w / 2 - 0.14;
			var v = new Float32Array([-x, y1 + oy, z1 + ox, x, y1 + oy, z1 + ox, x, y2 + oy, z2 + ox, -x, y1 + oy, z1 + ox, x, y2 + oy, z2 + ox, -x, y2 + oy, z2 + ox]);
			var qg = new THREE.BufferGeometry(); qg.setAttribute("position", new THREE.BufferAttribute(v, 3)); qg.computeVertexNormals(); body.add(new THREE.Mesh(qg, glass));
		});
		void g; return body;
	}
	function makeCarMesh(d, color) {
		var g = new THREE.Group(), paint = new THREE.MeshStandardMaterial({ color: color, metalness: 0.35, roughness: 0.42 }), dents = [];
		var hw = d.w / 2, hh = d.h / 2, hl = d.l / 2;
		var glass = new THREE.MeshStandardMaterial({ color: 0x18222e, metalness: 0.7, roughness: 0.08, side: THREE.DoubleSide });
		var P = C.PROFILES[C.STYLE[d.key]];
		var body;
		if (P) { body = profileBody(d, P, paint, glass, g); }
		else body = new THREE.Mesh(shapeBox(new THREE.BoxGeometry(d.w, d.h, d.l, 6, 3, 12), function (v) { if (Math.abs(v.x) > hw * 0.99 && v.y > 0) v.x *= 0.95; if (Math.abs(v.z) > hl * 0.99) v.x *= 0.96; }), paint);
		body.castShadow = true; body.receiveShadow = true; g.add(body); dents.push(body);
		if (d.bed) { [-1, 1].forEach(function (s) { var rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, d.l * 0.42), paint); rail.position.set(s * (hw - 0.04), hh + 0.17, -d.l * 0.27); g.add(rail); }); }
		if (d.cage || d.rover || d.kart) {
			var tube = mat(d.rover ? "#d9d9d9" : "#333333", { metalness: 0.7, roughness: 0.35 });
			if (d.cage) [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (c) { var t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), tube); t.position.set(c[0] * hw * 0.7, hh + 0.55, c[1] * 0.45); g.add(t); });
			if (d.cage) { var top = new THREE.Mesh(new THREE.BoxGeometry(d.w * 0.75, 0.06, 1.0), tube); top.position.set(0, hh + 1.1, 0); g.add(top); }
			if (d.rover) {
				var dish = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, 1.0), mat("#e8e8e8", { side: THREE.DoubleSide, metalness: 0.4 })); dish.position.set(-0.5, hh + 1.3, 0.9); dish.rotation.x = -0.7; g.add(dish);
				var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), tube); mast.position.set(-0.5, hh + 0.7, 0.9); g.add(mast);
				var foil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), mat("#d4a017", { metalness: 0.9, roughness: 0.3 })); foil.position.set(0.4, hh + 0.12, -1.1); g.add(foil);
				[-0.45, 0.45].forEach(function (x) { var seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.12), mat("#555")); seat.position.set(x, hh + 0.35, -0.25); g.add(seat); });
			}
		}
		/* driver (helmet) for open cars */
		if (!d.cab && !d.windows) { var helm = new THREE.Mesh(new THREE.SphereGeometry(d.kart ? 0.17 : 0.2, 16, 12), mat(d.rover ? "#f5f5f5" : "#1f4fbf", { metalness: 0.3, roughness: 0.3 })); helm.position.set(d.rover ? 0.45 : 0, hh + (d.kart ? 0.55 : 0.75), d.kart ? -0.2 : -0.25); g.add(helm); var tor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), mat(d.rover ? "#eeeeee" : "#222")); tor.position.set(helm.position.x, hh + (d.kart ? 0.25 : 0.4), helm.position.z); g.add(tor); }
		/* lights */
		var lightF = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 1.2 }), lightR = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.6 });
		[-1, 1].forEach(function (s) {
			var hf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), lightF); hf.position.set(s * hw * 0.7, d.windows ? -hh * 0.6 : hh * 0.2, hl + 0.01); g.add(hf);
			var tr = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), lightR); tr.position.set(s * hw * 0.7, d.windows ? -hh * 0.6 : hh * 0.3, -hl - 0.01); g.add(tr);
		});
		/* wheels */
		var tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }), rim = mat(d.rover ? "#b9a46a" : "#c8ccd2", { metalness: 0.8, roughness: 0.3 });
		var wheels = [];
		[[d.wx, d.wf], [-d.wx, d.wf], [d.wx, d.wb], [-d.wx, d.wb]].forEach(function (p) {
			var piv = new THREE.Group(), spin = new THREE.Group();
			var tg = new THREE.CylinderGeometry(d.wr, d.wr, d.ww, 20, 1); tg.rotateZ(Math.PI / 2);
			var t = new THREE.Mesh(tg, tyre); t.castShadow = true; spin.add(t);
			var rg = new THREE.CylinderGeometry(d.wr * 0.62, d.wr * 0.62, d.ww + 0.02, 10, 1); rg.rotateZ(Math.PI / 2); spin.add(new THREE.Mesh(rg, rim));
			if (d.rover) { var mesh = new THREE.Mesh(new THREE.TorusGeometry(d.wr * 0.98, 0.03, 4, 20), mat("#999", { metalness: 0.8 })); mesh.rotation.y = Math.PI / 2; spin.add(mesh); }
			piv.add(spin); piv.position.set(p[0], d.ry - d.rest, p[1]); g.add(piv); wheels.push({ piv: piv, spin: spin });
		});
		/* boost flame */
		var flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 10), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 }));
		flame.rotation.x = -Math.PI / 2; flame.position.set(0, -hh * 0.3, -hl - 0.45); flame.visible = false; g.add(flame);
		dents.forEach(function (m) { m.userData.orig = m.geometry.attributes.position.array.slice(); });
		return { group: g, wheels: wheels, dents: dents, flame: flame, paint: paint, lightF: lightF, lightR: lightR };
	}

	function makeCar(type, color, pose, isPlayer) {
		var d = C.CARS[type]; color = color || (isPlayer ? d.color : C.PAINT[(cars.length * 3 + 1) % C.PAINT.length]);
		var y0 = hAt(pose.x, pose.z) + d.wr + d.rest - d.ry + 0.4;
		var I = [d.mass * (d.h * d.h + d.l * d.l) / 12 * 1.4, d.mass * (d.w * d.w + d.l * d.l) / 12 * 1.4, d.mass * (d.w * d.w + d.h * d.h) / 12 * 1.4];
		var q = qYaw(pose.yaw);
		var body = phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pose.x, y0, pose.z).setRotation(q)
			.setAdditionalMassProperties(d.mass, { x: 0, y: -d.h * 0.45, z: 0 }, { x: I[0], y: I[1], z: I[2] }, { x: 0, y: 0, z: 0, w: 1 }).setCcdEnabled(true).setAngularDamping(0.4).setLinearDamping(0.02));
		phys.createCollider(RAPIER.ColliderDesc.cuboid(d.w / 2, d.h / 2, d.l / 2).setDensity(0).setFriction(0.45).setRestitution(0.15), body);
		if (d.cab) phys.createCollider(RAPIER.ColliderDesc.cuboid(d.w * 0.4, d.cab[0] / 2, d.l * d.cab[1] / 2).setTranslation(0, d.h / 2 + d.cab[0] / 2, d.l * d.cab[2]).setDensity(0).setFriction(0.4), body);
		var veh = phys.createVehicleController(body), k = d.k;
		veh.indexUpAxis = 1; veh.setIndexForwardAxis = 2; /* Rapier's default forward axis is X; our cars face +Z */
		[[d.wx, d.wf], [-d.wx, d.wf], [d.wx, d.wb], [-d.wx, d.wb]].forEach(function (p, i) {
			veh.addWheel({ x: p[0], y: d.ry, z: p[1] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, d.rest, d.wr);
			veh.setWheelSuspensionStiffness(i, k); veh.setWheelSuspensionCompression(i, 0.69 * Math.sqrt(k)); veh.setWheelSuspensionRelaxation(i, 1.0 * Math.sqrt(k));
			veh.setWheelMaxSuspensionTravel(i, d.rest * 1.2); veh.setWheelFrictionSlip(i, gripOf(d)); veh.setWheelSideFrictionStiffness(i, 1.0);
		});
		d.key = type; var vis = makeCarMesh(d, color); scene.add(vis.group);
		var car = { type: type, d: d, body: body, veh: veh, group: vis.group, wheels: vis.wheels, dents: vis.dents, flame: vis.flame, paint: vis.paint, lightF: vis.lightF, lightR: vis.lightR, color: color,
			ai: !isPlayer, lane: (cars.length % 3) - 1, steer: 0, in: { th: 0, br: 0, st: 0, hb: 0, boost: 0 }, damage: 0, lastV: null, gS: 1, gPeak: 0, air: null, upsideT: 0, stuckT: 0, revT: 0, smokeT: 0, id: cars.length, born: simT };
		setSuspForce(car);
		return car;
	}
	function gripOf(d) { return d.grip > 1.6 ? d.grip / 2.3 : d.grip; } /* the table holds old-style numbers for some cars; real tyres are mu ~ 1 */
	/* springs follow gravity: above Earth's g they stiffen in proportion (same ride height and damping ratio), so a car on the Sun
	   (28 g) does not sit on its belly with the springs crushed */
	function setSuspForce(car) {
		var gk = Math.max(1, Math.abs(gravity) / 9.81), k = car.d.k * gk;
		for (var i = 0; i < 4; i++) {
			car.veh.setWheelMaxSuspensionForce(i, car.d.mass * Math.max(9.81, Math.abs(gravity)) * 2.5 + 10);
			car.veh.setWheelSuspensionStiffness(i, k); car.veh.setWheelSuspensionCompression(i, 0.69 * Math.sqrt(k)); car.veh.setWheelSuspensionRelaxation(i, 1.0 * Math.sqrt(k));
		}
	}
	function removeCar(c) { phys.removeVehicleController(c.veh); phys.removeRigidBody(c.body); scene.remove(c.group); c.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }

	function setTraffic(n) {
		n = Math.max(0, Math.min(12, n | 0));
		var ai = cars.filter(function (c, i) { return i !== player; });
		while (ai.length > n) { var c = ai.pop(); removeCar(c); cars.splice(cars.indexOf(c), 1); }
		player = cars.findIndex(function (c) { return !c.ai; }); if (player < 0) player = 0;
		var types = W.stars ? ["rover", "buggy", "kart", "monster"] : ["sports", "suv", "truck", "buggy", "kart", "monster", "bus"];
		for (var i = ai.length; i < n; i++) {
			var p = startPose(cars.length); var car = makeCar(types[(i * 5 + 2) % types.length], null, p, false); cars.push(car);
		}
		cars.forEach(function (c, i) { c.id = i; });
	}

	function resetCar(c, here) {
		var t = c.body.translation(), r = c.body.rotation();
		var yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
		var p = here ? { x: t.x, z: t.z, yaw: yaw } : startPose(c.id);
		c.body.setTranslation({ x: p.x, y: Math.max(hAt(p.x, p.z), here ? t.y - 1 : -1e9) + c.d.wr + c.d.rest + 1.2, z: p.z }, true);
		c.body.setRotation(qYaw(p.yaw), true); c.body.setLinvel({ x: 0, y: 0, z: 0 }, true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		c.lastV = null; c.upsideT = 0; c.air = null; c.born = simT;
		if (c === cars[player]) lapReset();
	}
	function repair(c) {
		c.damage = 0;
		c.dents.forEach(function (m) { var a = m.geometry.attributes.position; a.array.set(m.userData.orig); a.needsUpdate = true; m.geometry.computeVertexNormals(); });
		c.paint.color.set(c.color);
	}

	/* dent the body: impact point p (car-local), push direction dir (car-local, unit), size s (m) */
	function dent(c, p, dir, s) {
		var rad = Math.max(0.5, Math.min(1.6, 0.35 + s * 0.12)), push = Math.min(0.45, s * 0.035);
		c.dents.forEach(function (m) {
			var a = m.geometry.attributes.position, arr = a.array, o = m.userData.orig, op = m.position, any = false;
			for (var i = 0; i < arr.length; i += 3) {
				var x = arr[i] + op.x, y = arr[i + 1] + op.y, z = arr[i + 2] + op.z, dd = Math.hypot(x - p.x, y - p.y, z - p.z);
				if (dd > rad) continue;
				var f = Math.pow(1 - dd / rad, 1.5) * push;
				var nx = arr[i] + dir.x * f, ny = arr[i + 1] + dir.y * f, nz = arr[i + 2] + dir.z * f;
				/* never more than 45% of the way to the middle */
				if (Math.abs(nx - o[i]) < Math.abs(o[i]) * 0.45 + 0.05 && Math.abs(nz - o[i + 2]) < Math.abs(o[i + 2]) * 0.45 + 0.05 && Math.abs(ny - o[i + 1]) < Math.abs(o[i + 1]) * 0.5 + 0.05) { arr[i] = nx; arr[i + 1] = ny; arr[i + 2] = nz; any = true; }
			}
			if (any) { a.needsUpdate = true; m.geometry.computeVertexNormals(); }
		});
	}

	/* ===================== loose objects ===================== */
	var brickDef = { name: "Brick", shape: "box", size: [1, 0.5, 0.5], mass: 8, color: "#a2412b" };
	var objGeoCache = {};
	function objMesh(def) {
		var s = def.size, geo;
		if (def.shape === "box") geo = new THREE.BoxGeometry(s[0], s[1], s[2]);
		else if (def.shape === "cyl") geo = new THREE.CylinderGeometry(s[0], s[0], s[1], 18);
		else if (def.shape === "ball") geo = new THREE.SphereGeometry(s[0], 24, 16);
		else if (def.shape === "cone") geo = new THREE.ConeGeometry(s[0], s[1], 16);
		else if (def.shape === "tyre") { geo = new THREE.TorusGeometry(s[0] * 0.72, s[0] * 0.3, 10, 24); }
		else if (def.shape === "rock") geo = new THREE.DodecahedronGeometry(s[0], 1);
		else if (def.shape === "pin") geo = new THREE.LatheGeometry(pinProfile(s[0], s[1]).map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 16);
		var m;
		if (def === C.OBJECTS.ball) m = new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, function (g) { ["#e63946", "#f1faee", "#ffbe0b", "#3a86ff", "#f1faee", "#06d6a0"].forEach(function (c, i) { g.fillStyle = c; g.fillRect(i * 128 / 6, 0, 128 / 6 + 1, 64); }); }), roughness: 0.5 });
		else if (def === C.OBJECTS.melon) m = new THREE.MeshStandardMaterial({ map: canvasTex(64, 32, function (g) { g.fillStyle = "#2f8f3a"; g.fillRect(0, 0, 64, 32); g.fillStyle = "#16511f"; for (var i = 0; i < 8; i++) g.fillRect(i * 8, 0, 3, 32); }), roughness: 0.6 });
		else if (def === C.OBJECTS.crate || def === C.OBJECTS.bigcrate) m = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, function (g) { g.fillStyle = def.color; g.fillRect(0, 0, 64, 64); g.strokeStyle = "#6b4520"; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58); g.beginPath(); g.moveTo(4, 4); g.lineTo(60, 60); g.stroke(); }), roughness: 0.85 });
		else if (def === C.OBJECTS.cone) m = new THREE.MeshStandardMaterial({ map: canvasTex(16, 64, function (g) { g.fillStyle = "#ff6b00"; g.fillRect(0, 0, 16, 64); g.fillStyle = "#fff"; g.fillRect(0, 18, 16, 8); g.fillRect(0, 38, 16, 8); }), roughness: 0.6 });
		else if (def === C.OBJECTS.barrel) m = new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.5, roughness: 0.4 });
		else if (def.glass) m = new THREE.MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.35, metalness: 0.2, roughness: 0.05 });
		else if (def.shape === "rock") m = new THREE.MeshStandardMaterial({ color: def.color, roughness: 1, flatShading: true });
		else m = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 });
		var mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = !def.glass;
		if (def === C.OBJECTS.pin) { var band = new THREE.Mesh(new THREE.CylinderGeometry(s[0] * 0.56, s[0] * 0.56, 0.1, 16), mat("#d62828")); band.position.y = s[1] * 0.66; mesh.add(band); }
		return mesh;
	}
	function pinProfile(r, h) { return [[0, 0], [r * 0.55, 0], [r * 0.85, h * 0.18], [r, h * 0.36], [r * 0.8, h * 0.55], [r * 0.45, h * 0.68], [r * 0.5, h * 0.82], [r * 0.45, h * 0.94], [0, h]]; }
	function spawnObj(kind, x, y, z, yaw) {
		var def = kind === "brick" ? brickDef : C.OBJECTS[kind]; if (!def) return null;
		if (objs.length >= 360) { var old = objs.shift(); phys.removeRigidBody(old.body); scene.remove(old.mesh); }
		var body = phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(qYaw(yaw || 0)).setCcdEnabled(def.mass < 10).setAngularDamping(0.15).setLinearDamping(0.01));
		var s = def.size, cd;
		if (def.shape === "box") cd = RAPIER.ColliderDesc.cuboid(s[0] / 2, s[1] / 2, s[2] / 2);
		else if (def.shape === "cyl") cd = RAPIER.ColliderDesc.cylinder(s[1] / 2, s[0]);
		else if (def.shape === "ball") cd = RAPIER.ColliderDesc.ball(s[0]);
		else if (def.shape === "cone") cd = RAPIER.ColliderDesc.cone(s[1] / 2, s[0]);
		else if (def.shape === "tyre") cd = RAPIER.ColliderDesc.cylinder(s[0] * 0.3, s[0]).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
		else if (def.shape === "rock") { var r = Math.random, pts = []; for (var i = 0; i < 14; i++) { var u = r() * 2 - 1, a = r() * 6.283, q = Math.sqrt(1 - u * u); pts.push(Math.cos(a) * q * s[0], u * s[0] * 0.8, Math.sin(a) * q * s[0]); } cd = RAPIER.ColliderDesc.convexHull(new Float32Array(pts)); }
		else if (def.shape === "pin") { var pp = []; pinProfile(s[0], s[1]).forEach(function (p) { for (var k = 0; k < 8; k++) pp.push(Math.cos(k * 0.785) * p[0], p[1] - s[1] / 2, Math.sin(k * 0.785) * p[0]); }); cd = RAPIER.ColliderDesc.convexHull(new Float32Array(pp)); }
		cd.setMass(def.mass).setFriction(0.7).setRestitution(def.bounce || 0.2);
		var col = phys.createCollider(cd, body);
		var mesh = objMesh(def);
		void col;
		if (def.shape === "pin") mesh.geometry.translate(0, -s[1] / 2, 0);
		if (def.shape === "tyre") mesh.rotation.set(0, 0, 0);
		scene.add(mesh);
		var o = { id: ++objSeq, kind: kind, def: def, body: body, mesh: mesh, lastV: null, born: performance.now() };
		objs.push(o); return o;
	}
	function aheadOfPlayer(dist) {
		var c = cars[player], t = c.body.translation(), r = c.body.rotation(), f = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)); f.y = 0; f.normalize();
		return { x: t.x + f.x * dist, z: t.z + f.z * dist, yaw: Math.atan2(f.x, f.z), f: f };
	}
	function spawnKind(kind) {
		var a = aheadOfPlayer(14 + Math.random() * 8), def = C.OBJECTS[kind];
		var x = a.x + (Math.random() - 0.5) * 4, z = a.z + (Math.random() - 0.5) * 4;
		spawnObj(kind, x, groundBelow(x, z) + 1.5 + def.size[0] * (def.shape === "rock" ? 1 : 0.5) + (def.size[1] || 0) / 2, z, a.yaw);
		sfx("pop");
	}
	function spawnLayout(kind) {
		var a = aheadOfPlayer(kind === "rain" ? 6 : 22), list = C.layout(kind), cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
		list.forEach(function (o) {
			var x = a.x + o.x * cy + o.z * sy, z = a.z - o.x * sy + o.z * cy;
			spawnObj(o.k, x, (kind === "rain" ? hAt(x, z) : groundBelow(x, z)) + o.y + 0.02, z, a.yaw + (o.yaw || 0));
		});
		sfx("pop");
	}
	/* the highest solid surface under (x, z): terrain or a ramp (a ray cast down) */
	function groundBelow(x, z) {
		var ray = new RAPIER.Ray({ x: x, y: 200, z: z }, { x: 0, y: -1, z: 0 }), hit = phys.castRay(ray, 400, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
		return hit ? 200 - hit.timeOfImpact : hAt(x, z);
	}
	function clearObjs() { objs.forEach(function (o) { phys.removeRigidBody(o.body); scene.remove(o.mesh); }); objs = []; }

	/* ===================== particles (sparks, debris, dust, smoke) ===================== */
	var parts = {
		max: 900, list: [], mesh: null, glow: null,
		init: function () {
			this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.max);
			this.glow = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }), this.max);
			this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			this.mesh.count = this.glow.count = 0; this.mesh.frustumCulled = this.glow.frustumCulled = false;
			var c = new THREE.Color(1, 1, 1); for (var i = 0; i < this.max; i++) { this.mesh.setColorAt(i, c); this.glow.setColorAt(i, c); }
			scene.add(this.mesh, this.glow);
		},
		clear: function () { this.list.length = 0; },
		add: function (p) { if (this.list.length >= this.max * 2 - 4) this.list.shift(); this.list.push(p); },
		/* type: glow (sparks, fire) or solid (debris, dust, smoke) */
		burst: function (x, y, z, n, o) {
			for (var i = 0; i < n; i++) {
				var a = Math.random() * 6.283, u = Math.random() * 2 - 1, sp = (o.speed || 6) * (0.3 + Math.random() * 0.9), q = Math.sqrt(1 - u * u);
				this.add({ x: x, y: y, z: z, vx: Math.cos(a) * q * sp + (o.vx || 0), vy: Math.abs(u) * sp * (o.up || 1) + (o.vy || 0), vz: Math.sin(a) * q * sp + (o.vz || 0),
					life: (o.life || 1) * (0.6 + Math.random() * 0.8), age: 0, size: (o.size || 0.08) * (0.6 + Math.random() * 0.8), glow: !!o.glow, col: o.cols ? o.cols[(Math.random() * o.cols.length) | 0] : (o.col || "#ffffff"), grav: o.grav == null ? 1 : o.grav, drag: o.drag || 0, grow: o.grow || 0, bounce: o.bounce == null ? 0.3 : o.bounce });
			}
		},
		step: function (dt) {
			var g = phys ? phys.gravity.y : -9.81, nm = 0, ng = 0, col = this._c || (this._c = new THREE.Color()), m = tmpM, pos = tmpV, s = this._s || (this._s = new THREE.Vector3()), qi = this._q || (this._q = new THREE.Quaternion());
			for (var i = this.list.length - 1; i >= 0; i--) {
				var p = this.list[i]; p.age += dt; if (p.age > p.life) { this.list.splice(i, 1); continue; }
				p.vy += g * p.grav * dt; var dk = Math.exp(-p.drag * dt); p.vx *= dk; p.vy *= dk; p.vz *= dk;
				p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
				var gh = ter ? hAt(p.x, p.z) : 0; if (p.y < gh + p.size / 2) { p.y = gh + p.size / 2; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; }
				var k = p.glow ? 1 - p.age / p.life : 1, sz = p.size * (1 + p.grow * p.age) * (p.glow ? k : (p.age > p.life * 0.7 ? (p.life - p.age) / (p.life * 0.3) : 1));
				pos.set(p.x, p.y, p.z); s.set(sz, sz, sz); m.compose(pos, qi, s); col.set(p.col);
				if (p.glow) { if (ng < this.max) { this.glow.setMatrixAt(ng, m); this.glow.setColorAt(ng, col); ng++; } }
				else if (nm < this.max) { this.mesh.setMatrixAt(nm, m); this.mesh.setColorAt(nm, col); nm++; }
			}
			this.mesh.count = nm; this.glow.count = ng;
			this.mesh.instanceMatrix.needsUpdate = this.glow.instanceMatrix.needsUpdate = true;
			if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
		}
	};

	/* ===================== input ===================== */
	var keys = {}, touch = { th: 0, br: 0, l: 0, r: 0, hb: 0, boost: 0 }, kbActive = false;
	function inField(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
	function driving() { return kbActive || view.classList.contains("mes-pfill") || !!document.fullscreenElement; }
	document.addEventListener("keydown", function (e) {
		if (inField(e) || !phys) return;
		var k = e.key.toLowerCase(), drive = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift"].indexOf(k) >= 0;
		if (!driving()) { if (drive && stageVisible() && !e.ctrlKey && !e.metaKey && document.activeElement === document.body && k !== " ") { /* allow driving without clicking first if the picture is mostly on screen */ kbActive = true; } else return; }
		if (drive) e.preventDefault();
		if (e.repeat && !drive) return;
		if (replay) { /* replay controls */
			if (k === " ") { e.preventDefault(); rpToggle(); } else if (k === "y" || k === "escape") replayStop(); else if (k === "arrowleft") { replay.t = Math.max(0, replay.t - 1); } else if (k === "arrowright") { replay.t = Math.min(replay.len, replay.t + 1); } else if (k === "c") { var cs = ["tv", "chase", "orbit"]; replay.cam = cs[(cs.indexOf(replay.cam) + 1) % 3]; replayCamPref = replay.cam; $("cs-rpcam").value = replay.cam; replay.tv = replay.cp = null; }
			return;
		}
		keys[k] = true;
		if (k === "y") { replayStart(); return; }
		if (k === "n") { setNight(dayK >= 0.45); return; }
		if (k === "k") { var wl = C.weatherFor(S.world); if (wl.length < 2) { setWeather("rain"); return; } setWeather(wl[(wl.indexOf(S.weather) + 1) % wl.length]); return; }
		if (k === "r") playerReset();
		else if (k === "c") cycleCam(1);
		else if (k === "tab") { e.preventDefault(); switchCar(e.shiftKey ? -1 : 1); }
		else if (k === "g") flipGravity();
		else if (k === "o") spawnKind(C.OBJ_ORDER[(Math.random() * C.OBJ_ORDER.length) | 0]);
		else if (k === "p") togglePause();
		else if (k === "h") horn();
		else if (k === "m") { setSound(!S.sound); toast(S.sound ? "Sound on" : "Sound off"); }
		else if (k === "f" && !e.ctrlKey && !e.metaKey) { var b = view.querySelector(".mes-pbtn"); if (b) b.click(); }
		else if (k === "escape") { if (replay) replayStop(); else kbActive = false; }
	});
	document.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });
	window.addEventListener("blur", function () { keys = {}; });
	/* the player's car on its roof or side: a big "Flip back over" button after 1.2 s, and it flips back by itself after 6 s */
	function playerReset() { if (replay) replayStop(true); resetCar(cars[player], true); toast("Back on its wheels"); $("cs-unflip").hidden = true; }
	var unflipShown = -1;
	function unflipTick(c) {
		var el = $("cs-unflip"), t = c.upsideT, show = t > 1.2 && !autoPilot;
		if (show && t > 6) { playerReset(); return; }
		var n = show ? Math.ceil(6 - t) : -1;
		if (n !== unflipShown) { unflipShown = n; el.hidden = !show; if (show) $("cs-unflipn").textContent = "(by itself in " + n + " s)"; }
	}
	function stageVisible() { var r = stage.getBoundingClientRect(); return r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5; }

	function setupTouch() {
		var map = { "cs-t-left": "l", "cs-t-right": "r", "cs-t-gas": "th", "cs-t-brake": "br", "cs-t-boost": "boost", "cs-t-hb": "hb" };
		Object.keys(map).forEach(function (id) {
			var el = $(id); if (!el) return;
			function on(e) { e.preventDefault(); touch[map[id]] = 1; el.classList.add("on"); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } initAudio(); }
			function off() { touch[map[id]] = 0; el.classList.remove("on"); }
			el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("lostpointercapture", off);
			el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
		});
		/* the gas pedal pulses until it is first pressed, so a newcomer sees which one makes the car go */
		var gasEl = $("cs-t-gas"); if (gasEl) { gasEl.classList.add("cs-hint"); gasEl.addEventListener("pointerdown", function () { gasEl.classList.remove("cs-hint"); }, { once: true }); }
		var rs = $("cs-t-reset"); if (rs) { rs.addEventListener("click", playerReset); rs.addEventListener("contextmenu", function (e) { e.preventDefault(); }); }
		showTouch();
	}
	function showTouch() { var on = S.touch === "on" || (S.touch === "auto" && matchMedia("(pointer:coarse)").matches); $("cs-touch").hidden = !on; root.classList.toggle("cs-has-touch", on); }
	function readInput() {
		var gp = navigator.getGamepads ? Array.prototype.find.call(navigator.getGamepads(), function (p) { return p && p.connected; }) : null;
		var th = (keys.w || keys.arrowup ? 1 : 0) || touch.th, br = (keys.s || keys.arrowdown ? 1 : 0) || touch.br;
		var st = ((keys.a || keys.arrowleft || touch.l) ? 1 : 0) - ((keys.d || keys.arrowright || touch.r) ? 1 : 0);
		var hb = keys[" "] || touch.hb ? 1 : 0, boost = keys.shift || touch.boost ? 1 : 0;
		if (gp) {
			var ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) st = -ax;
			var rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
			if (rt > 0.05) th = rt; if (lt > 0.05) br = lt;
			if (gp.buttons[0] && gp.buttons[0].pressed) hb = 1; if (gp.buttons[2] && gp.buttons[2].pressed) boost = 1;
		}
		return { th: th, br: br, st: st, hb: hb, boost: boost };
	}

	/* ===================== driving one car ===================== */
	function fwdOf(c) { var r = c.body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w); return new THREE.Vector3(0, 0, 1).applyQuaternion(tmpQ); }
	function upOf(c) { var r = c.body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w); return new THREE.Vector3(0, 1, 0).applyQuaternion(tmpQ); }
	function aiInput(c, dt) {
		var t = c.body.translation(), f = fwdOf(c), yaw = Math.atan2(f.x, f.z), v = c.veh.currentVehicleSpeed(), d = c.d;
		var me = cars[player], target, mode = S.ai;
		if (mode === "park") return { th: 0, br: 0.4, st: 0, hb: 1, boost: 0 };
		if (mode === "chase" && me !== c) { var mt = me.body.translation(), mv = me.body.linvel(); target = { x: mt.x + mv.x * 0.6, z: mt.z + mv.z * 0.6 }; }
		else target = C.cruiseTarget(S.world, t.x, t.z, c.lane, 16 + Math.abs(v) * 0.8);
		var o = C.aiDrive({ x: t.x, z: t.z, yaw: yaw, v: v }, target.x, target.z, { vmax: Math.min(d.vmax * 0.75, mode === "chase" ? 40 : 24) * Math.min(1, Math.sqrt(Math.max(0.3, Math.abs(gravity)) / 9.81) * 1.2 + 0.25) * Math.sqrt(wx().grip), aggr: mode === "chase" });
		/* stuck: back off for a moment */
		if (c.revT > 0) { c.revT -= dt; return { th: 0, br: 1, st: -o.steer, hb: 0, boost: 0, rev: true }; }
		if (Math.abs(v) < 0.8 && o.throttle > 0.3) { c.stuckT += dt; if (c.stuckT > 2.2) { c.stuckT = 0; c.revT = 1.6; } } else c.stuckT = 0;
		if (o.reverse) return { th: 0, br: 1, st: o.steer, hb: 0, boost: 0, rev: true };
		/* keep clear of cars in front (not in derby mode) */
		if (mode !== "chase") {
			var lx = Math.cos(yaw), lz = -Math.sin(yaw);
			for (var j = 0; j < cars.length; j++) {
				var oc = cars[j]; if (oc === c) continue; var ot = oc.body.translation(), rx = ot.x - t.x, rz = ot.z - t.z;
				var fw = rx * f.x + rz * f.z, lat = rx * lx + rz * lz;
				if (fw > 0 && fw < 8 + Math.abs(v) * 0.9 && Math.abs(lat) < 3) { o.steer = Math.max(-1, Math.min(1, o.steer - (lat >= 0 ? 0.9 : -0.9))); if (fw < 4 + Math.abs(v) * 0.5) { o.throttle = 0; o.brake = 0.7; } }
			}
		}
		return { th: o.throttle, br: o.brake, st: o.steer, hb: 0, boost: mode === "chase" && Math.abs(o.ang || 0) < 0.15 ? 1 : 0 };
	}
	function driveCar(c, inp, dt) {
		var d = c.d, v = c.veh.currentVehicleSpeed(), dmg = c.damage / 100;
		var maxSt = d.steer / (1 + Math.abs(v) / 22);
		c.steer += (inp.st * maxSt - c.steer) * Math.min(1, dt * (inp.st ? 7 : 9));
		c.veh.setWheelSteering(0, c.steer); c.veh.setWheelSteering(1, c.steer);
		var grip = gripOf(d) * wx().grip, drive = d.drive === "awd" ? [0, 1, 2, 3] : d.drive === "fwd" ? [0, 1] : [2, 3], i;
		var eng = [0, 0, 0, 0];
		var wantRev = inp.br > 0 && v < 0.6 && !inp.th, braking = inp.br > 0 && v >= 0.6, braking2 = inp.th > 0 && v < -0.6;
		/* heavy-gravity worlds: the engine grows with g (a sandbox car on the Sun would otherwise never beat its own rolling resistance) */
		var power = C.engineForce(d.F, v, d.vmax, inp.boost) * (1 - dmg * 0.6) * (d.drive === "awd" ? 0.5 : 1) * Math.sqrt(Math.max(1, Math.abs(gravity) / 9.81));
		if (inp.th > 0 && !braking2) drive.forEach(function (k) { eng[k] = power * inp.th; });
		if (wantRev) drive.forEach(function (k) { eng[k] = -C.engineForce(d.F, -v, d.vmax * 0.3, false) * 0.6 * inp.br * (d.drive === "awd" ? 0.5 : 1) * Math.sqrt(Math.max(1, Math.abs(gravity) / 9.81)); });
		if (braking || braking2) for (i = 0; i < 4; i++) eng[i] = -Math.sign(v) * d.mass * 9.81 * 0.3 * Math.max(inp.br, inp.th);
		var anyContact = false;
		for (i = 0; i < 4; i++) {
			var N = Math.max(0, c.veh.wheelSuspensionForce(i) || 0), lim = grip * N * (i > 1 && inp.hb ? 0.25 : 1);
			if (c.veh.wheelIsInContact(i)) anyContact = true;
			if (i > 1 && inp.hb) eng[i] = Math.abs(v) > 0.3 ? -Math.sign(v) * lim : 0;
			c.veh.setWheelEngineForce(i, Math.max(-lim, Math.min(lim, eng[i])));
			c.veh.setWheelFrictionSlip(i, grip * (i > 1 && inp.hb ? 0.5 : 1));
			c.veh.setWheelBrake(i, !inp.th && !inp.br && Math.abs(v) < 1.5 ? d.mass * 0.004 : 0);
		}
		/* air drag (none on the Moon) + rolling resistance */
		var lv = c.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z), rho = S.world === "earth" || S.world === "jupiter" ? W.rho : W.rho;
		c.body.resetForces(true);
		if (sp > 0.5) { var fd = C.dragForce(rho, d.cdA * (1 + dmg * 0.4), sp) + (anyContact ? d.mass * Math.abs(gravity) * 0.012 : 0), k2 = -fd / sp; c.body.addForce({ x: lv.x * k2, y: lv.y * k2, z: lv.z * k2 }, true); }
		/* no air control: in the air the pedals and steering do nothing to the car's rotation (pure physics; it used to tip the car) */
		if (!anyContact) c.airT = (c.airT || 0) + dt; else c.airT = 0;
		c.flame.visible = !!inp.boost && inp.th > 0;
		var brk = (inp.br > 0 && v > 0.5) || (inp.th > 0 && v < -0.5) || inp.hb;
		c.lightR.emissiveIntensity = brk ? 3.2 : (dayK < 0.45 ? 1.1 : 0.5); c.lightF.emissiveIntensity = dayK < 0.45 ? 5 : 1.2;
		c.in = inp; c.anyContact = anyContact;
	}

	/* ===================== simulation step ===================== */
	/* ---------- instant replay: the last 12 s of every car and object, 30 frames a second ---------- */
	var recFrames = [], REC_SEC = 12, replay = null, objSeq = 0;
	function recordFrame() {
		var f = { t: simT, cars: [], objs: {} };
		cars.forEach(function (c) {
			var t = c.body.translation(), r = c.body.rotation(), a = new Float32Array(19); a[0] = t.x; a[1] = t.y; a[2] = t.z; a[3] = r.x; a[4] = r.y; a[5] = r.z; a[6] = r.w;
			for (var i = 0; i < 4; i++) { var sl = c.veh.wheelSuspensionLength(i), cp = c.veh.wheelChassisConnectionPointCs(i); a[7 + i * 3] = cp && sl != null ? cp.y - sl : c.d.ry - c.d.rest; a[8 + i * 3] = c.veh.wheelSteering(i) || 0; a[9 + i * 3] = c.veh.wheelRotation(i) || 0; }
			f.cars.push([c, a]);
		});
		objs.forEach(function (o) { var t = o.body.translation(), r = o.body.rotation(); f.objs[o.id] = [o, new Float32Array([t.x, t.y, t.z, r.x, r.y, r.z, r.w])]; });
		recFrames.push(f); while (recFrames.length && recFrames[0].t < simT - REC_SEC) recFrames.shift();
	}
	function replayStart() {
		if (replay) { replayStop(); return; }
		if (recFrames.length < 20) { toast("Drive for a moment first: nothing to replay yet"); return; }
		replay = { frames: recFrames.slice(), t: 0, speed: 1, playing: true, cam: replayCamPref || "tv", tv: null, cp: null };
		replay.len = replay.frames[replay.frames.length - 1].t - replay.frames[0].t;
		$("cs-replay").hidden = false; root.classList.add("cs-replaying"); $("cs-toast").classList.remove("show"); $("cs-rpcam").value = replay.cam; $("cs-rpspeed").value = "1";
		parts.mesh.visible = parts.glow.visible = false; if (ghostMesh) ghostMesh.visible = false;
		$("cs-rpplay").textContent = "❚❚"; if (eng) eng.g.gain.value = 0;
	}
	var replayCamPref = null;
	function replayStop(silent) {
		if (!replay) return; replay = null;
		var rp = $("cs-replay"); if (rp) rp.hidden = true; root.classList.remove("cs-replaying");
		cars.forEach(function (c) { c.group.visible = true; }); objs.forEach(function (o) { o.mesh.visible = true; });
		if (parts.mesh) parts.mesh.visible = parts.glow.visible = true;
		camSnap = true; if (!silent) syncMeshes();
	}
	function replayApply() {
		var R = replay, fr = R.frames, t0 = fr[0].t, tt = t0 + R.t, lo = 0, hi = fr.length - 1;
		while (hi - lo > 1) { var m = (lo + hi) >> 1; if (fr[m].t <= tt) lo = m; else hi = m; }
		var A = fr[lo], B = fr[hi], k = B.t > A.t ? Math.max(0, Math.min(1, (tt - A.t) / (B.t - A.t))) : 0;
		var seen = new Set();
		A.cars.forEach(function (e) {
			var c = e[0], a = e[1], bb = null; B.cars.forEach(function (x) { if (x[0] === c) bb = x[1]; }); bb = bb || a; seen.add(c);
			c.group.position.set(a[0] + (bb[0] - a[0]) * k, a[1] + (bb[1] - a[1]) * k, a[2] + (bb[2] - a[2]) * k);
			setQ(c.group.quaternion, a, bb, 3, k);
			for (var i = 0; i < 4; i++) { var w = c.wheels[i]; w.piv.position.y = a[7 + i * 3] + (bb[7 + i * 3] - a[7 + i * 3]) * k; w.piv.rotation.y = a[8 + i * 3]; w.spin.rotation.x = a[9 + i * 3] + (bb[9 + i * 3] - a[9 + i * 3]) * k; }
		});
		cars.forEach(function (c) { c.group.visible = seen.has(c); });
		objs.forEach(function (o) {
			var e = A.objs[o.id]; if (!e) { o.mesh.visible = false; return; }
			var a = e[1], eb = B.objs[o.id], bb = eb ? eb[1] : a; o.mesh.visible = true;
			o.mesh.position.set(a[0] + (bb[0] - a[0]) * k, a[1] + (bb[1] - a[1]) * k, a[2] + (bb[2] - a[2]) * k); setQ(o.mesh.quaternion, a, bb, 3, k);
		});
		$("cs-rpbar").value = String(Math.round(R.t / Math.max(0.01, R.len) * 1000));
		$("cs-rptime").textContent = "−" + Math.max(0, R.len - R.t).toFixed(1) + " s";
	}
	function setQ(q, a, b, o, k) { var d = a[o] * b[o] + a[o + 1] * b[o + 1] + a[o + 2] * b[o + 2] + a[o + 3] * b[o + 3], sg = d < 0 ? -1 : 1; q.set(a[o] + (b[o] * sg - a[o]) * k, a[o + 1] + (b[o + 1] * sg - a[o + 1]) * k, a[o + 2] + (b[o + 2] * sg - a[o + 2]) * k, a[o + 3] + (b[o + 3] * sg - a[o + 3]) * k).normalize(); }
	function replayAdvance(dt) {
		var R = replay; if (R.playing) { R.t += dt * R.speed; if (R.t >= R.len) { R.t = R.len; R.playing = false; $("cs-rpplay").textContent = "↺"; } }
		replayApply(); replayCamera(dt);
	}
	function replayCamera(dt) {
		var c = cars[player]; if (!c || !c.group.visible) { c = cars.find(function (x) { return x.group.visible; }); if (!c) return; }
		var p = c.group.position, R = replay, look = p.clone(); look.y += c.d.h * 0.5 + 0.4;
		if (R.cam === "tv") {
			if (!R.tv || R.tv.distanceTo(p) > 55) { var fw = new THREE.Vector3(0, 0, 1).applyQuaternion(c.group.quaternion).setY(0).normalize(); R.tv = p.clone().addScaledVector(fw, 22).add(new THREE.Vector3(-fw.z, 0, fw.x).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 9)); R.tv.y = hAt(R.tv.x, R.tv.z) + 1.4 + Math.random() * 3; }
			camera.position.copy(R.tv); camera.fov = Math.max(16, Math.min(60, 800 / Math.max(8, R.tv.distanceTo(p))));
		} else if (R.cam === "chase") {
			var f2 = new THREE.Vector3(0, 0, 1).applyQuaternion(c.group.quaternion).setY(0); if (f2.lengthSq() < 0.01) f2.set(0, 0, 1); f2.normalize();
			var want = p.clone().addScaledVector(f2, -(c.d.l * 1.6 + 3)); want.y += c.d.l * 0.6 + 1.2;
			if (!R.cp) R.cp = want.clone(); R.cp.lerp(want, 1 - Math.exp(-dt * 5)); camera.position.copy(R.cp); camera.fov = 62;
		} else { var od = orbit.dist * free.zoom; camera.position.set(p.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * od, p.y + 1 + Math.sin(orbit.pitch) * od, p.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * od); camera.fov = 62; if (R.playing) orbit.yaw += dt * 0.25; }
		var gh = hAt(camera.position.x, camera.position.z) + 0.5; if (camera.position.y < gh) camera.position.y = gh;
		camera.up.set(0, 1, 0); camera.updateProjectionMatrix(); camera.lookAt(look);
	}
	var simT = 0, lap = C.lapNew(), wrongT = 0, autoPilot = false;
	function lapReset() { lap = C.lapNew(); ghostRec = []; }
	/* ---------- ghost of the best lap (stored per world | car | gravity in localStorage mes-car-sandbox:ghost:<key>) ---------- */
	var GKEY = "mes-car-sandbox:ghost:", ghostRec = [], ghost = null, ghostKey = "", ghostMesh = null, ghostMat = null;
	function ghostLoad() {
		var k = lapKey(); if (!W || !W.track || k === ghostKey) return; ghostKey = k;
		try { ghost = JSON.parse(localStorage.getItem(GKEY + k)); } catch (e) { ghost = null; }
		ghostBuild();
	}
	function ghostBuild() {
		if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); ghostMesh = null; }
		if (!ghost || !W.track || !cars[player]) return;
		ghostMat = ghostMat || new THREE.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.3, depthWrite: false });
		var vis = makeCarMesh(C.CARS[cars[player].type], "#7fd3ff");
		vis.group.traverse(function (o) { if (o.isMesh) { o.material = ghostMat; o.castShadow = o.receiveShadow = false; } });
		vis.flame.visible = false; ghostMesh = vis.group; ghostMesh.visible = false; scene.add(ghostMesh);
	}
	function ghostSave(rec) {
		ghost = rec; try { localStorage.setItem(GKEY + lapKey(), JSON.stringify(rec)); } catch (e) { /* storage full: the ghost lasts until the page closes */ }
		if (!ghostMesh) ghostBuild();
	}
	function lapKey() { var c = cars[player]; return c ? C.lapKey(S.world, c.type, gravity) : ""; }
	function lapTick(c, t) {
		if (!W.track) return;
		var n = C.trackNearest(t.x, t.z);
		C.lapStep(lap, n.s, n.d, simT).forEach(function (e) {
			var best = REC.laps[lapKey()];
			if (e.t === "start") { toast("Lap timer started: go!" + (ghost && S.show.ghost !== false ? " Race your ghost" : "")); ghostRec = []; }
			else if (e.t === "sector") { var b = best && best.splits[e.n - 1], dd = b != null ? e.time - b : null; toast("Sector " + e.n + ": " + C.fmtLap(e.time) + (dd != null ? "  (" + (dd <= 0 ? "−" : "+") + Math.abs(dd).toFixed(2) + ")" : "")); }
			else if (e.t === "lap") {
				var isBest = !best || e.time < best.time;
				if (isBest) { REC.laps[lapKey()] = { time: e.time, splits: e.splits }; saveRec(); var r = c.body.rotation(); ghostRec.push(C.ghostSample(e.time, t, r)); ghostSave(ghostRec); }
				ghostRec = [];
				toast("Lap " + lap.laps + ": " + C.fmtLap(e.time) + (isBest ? (best ? "  · new best by " + (best.time - e.time).toFixed(2) + " s!" : "  · first lap set!") : "  (+" + (e.time - best.time).toFixed(2) + ")"));
				sfx("pop", 1);
			}
			else if (e.t === "wrong" && simT - wrongT > 4) { wrongT = simT; toast("Wrong way! Laps run the other way round"); }
		});
		/* record this lap at 20 samples a second for a possible new ghost */
		if (lap.t0 != null && lap.valid && ghostRec.length < 6000 && (Math.round(simT * 60) % 3 === 0) && subLast) ghostRec.push(C.ghostSample(simT - lap.t0, t, c.body.rotation()));
	}
	/* Energy guard. Rapier sometimes pushes a fast-landing chassis out of the ground (heightfield) with a huge impulse: the car shot
	   off at 3x its landing speed and tumbled. Per kg: kinetic (moving + turning) + potential energy may grow in one step only by what
	   the springs (4 x max suspension force) and the engine can add; anything more is a solver glitch and is taken back out by scaling
	   both velocities down. Normal driving, jumps and crashes (which lose energy) never come near the limit. */
	function carEnergy(c) {
		var d = c.d, lv = c.body.linvel(), av = c.body.angvel(), t = c.body.translation(), ir = (d.w * d.w + d.h * d.h + d.l * d.l) / 18 * 1.4;
		var kl = 0.5 * (lv.x * lv.x + lv.y * lv.y + lv.z * lv.z), ka = 0.5 * ir * (av.x * av.x + av.y * av.y + av.z * av.z);
		return { k: kl + ka, p: -phys.gravity.y * t.y, v: Math.sqrt(2 * kl) };
	}
	function energyGuard(c) {
		var a = c.preE; if (!a) return;
		var b = carEnergy(c), dt = phys.timestep, d = c.d;
		var acc = 4 * (d.mass * Math.max(9.81, Math.abs(gravity)) * 2.5 + 10) / d.mass + C.engineForce(d.F, 0, d.vmax, true) * Math.sqrt(Math.max(1, Math.abs(gravity) / 9.81)) / d.mass;
		var dv = acc * dt * 1.5, allow = dv * (a.v + dv) + 0.5;
		var target = a.k + a.p + allow - b.p;
		if (b.k <= target) return;
		var s = target > 0 ? Math.sqrt(target / b.k) : 0, lv = c.body.linvel(), av = c.body.angvel();
		c.body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
		c.body.setAngvel({ x: av.x * s, y: av.y * s, z: av.z * s }, true);
		c.glitches = (c.glitches || 0) + 1;
	}
	function step(dt) {
		var pin = readInput();
		cars.forEach(function (c, i) { driveCar(c, i === player && !autoPilot ? pin : aiInput(c, dt), dt); c.veh.updateVehicle(dt); c.preE = carEnergy(c); });
		phys.step(eventQ);
		cars.forEach(energyGuard);
		/* impacts: a velocity change much bigger than gravity + springs can give in one step = a crash */
		var gy = phys.gravity.y;
		cars.forEach(function (c, ci) {
			var lv = c.body.linvel(), t = c.body.translation();
			if (c.lastV) {
				var ax = (lv.x - c.lastV.x) / dt, ay = (lv.y - c.lastV.y) / dt, az = (lv.z - c.lastV.z) / dt;
				/* felt g over an 80 ms window (a real crash pulse lasts ~ 70-120 ms; the solver stops a body in one step) */
				var nx = ax, ny = ay - gy, nz = az, dv = Math.hypot(nx, ny, nz) * dt;
				var rb = c.ring || (c.ring = []); rb.push([nx * dt, ny * dt, nz * dt]); if (rb.length > 5) rb.shift();
				var sx = 0, sy = 0, sz = 0; rb.forEach(function (q) { sx += q[0]; sy += q[1]; sz += q[2]; });
				var felt = Math.hypot(sx, sy, sz) / (rb.length * dt) / C.G0;
				c.gS += (felt - c.gS) * Math.min(1, dt * 6); if (felt > c.gPeak && simT - (c.born || 0) > 1.5) c.gPeak = felt;
				/* the crash threshold grows with gravity: on the Sun (28 g) just resting on the springs is a 4.6 m/s push every step */
				var gThr = Math.abs(gravity) * dt * 4;
				if (dv > 2.2 + gThr && simT - (c.born || 0) > 1) impact(c, ci, nx * dt, ny * dt, nz * dt, dv - gThr, t, felt);
			}
			c.lastV = { x: lv.x, y: lv.y, z: lv.z };
			/* flipped / lost: computer cars put themselves back */
			var up = upOf(c);
			if (up.y < 0.25 && Math.hypot(lv.x, lv.z) < 2) c.upsideT += dt; else c.upsideT = 0;
			if (c.ai && c.upsideT > 3) resetCar(c, true);
			if (ci === player) unflipTick(c);
			if (t.y < -60 || t.y > 4000 && gravity > 0.5) resetCar(c, false);
			if (ci === player) { trackAir(c, t, lv); lapTick(c, t); }
			/* dust behind wheels on dusty worlds, smoke from wrecks */
			var XW = wx();
			if (W.track && (XW.p === "rain" || XW.snowy) && c.anyContact && Math.hypot(lv.x, lv.z) > 5 && Math.random() < 0.7) {
				var wj = 2 + ((Math.random() * 2) | 0), cq = c.veh.wheelContactPoint(wj);
				if (cq) parts.burst(cq.x, cq.y + 0.15, cq.z, XW.snowy ? 2 : 1, { speed: 1.2, vx: -lv.x * 0.12, vy: Math.hypot(lv.x, lv.z) * 0.12, vz: -lv.z * 0.12, life: 0.9, size: XW.snowy ? 0.1 : 0.07, cols: XW.snowy ? ["#ffffff", "#e6edf5"] : ["#c9d6e3", "#9fb2c4"], drag: 2, grow: 1.5, bounce: 0 });
			}
			if (!W.track && c.anyContact && Math.hypot(lv.x, lv.z) > 4 && Math.random() < 0.5) {
				var wi = 2 + ((Math.random() * 2) | 0), cp = c.veh.wheelContactPoint(wi);
				if (cp) parts.burst(cp.x, cp.y + 0.1, cp.z, 1, { speed: 1.5, vx: -lv.x * 0.15, vy: Math.hypot(lv.x, lv.z) * 0.18, vz: -lv.z * 0.15, life: W.rho ? 1.5 : 4, size: 0.12, cols: XW.snowy ? ["#ffffff", "#f0e6dc"] : [W.ground[1], W.ground[0]], drag: W.rho ? 1.2 : 0, grow: W.rho ? 1.2 : 0.2, bounce: 0.05 });
			}
			if (c.damage > 60) { c.smokeT -= dt; if (c.smokeT < 0) { c.smokeT = 0.08 + (100 - c.damage) / 300; var fw = fwdOf(c); parts.burst(t.x + fw.x * c.d.l * 0.35, t.y + c.d.h * 0.6, t.z + fw.z * c.d.l * 0.35, 1, { speed: 0.4, vy: 1.6, life: 2.4, size: 0.4, cols: c.damage > 90 ? ["#222", "#333"] : ["#666", "#888"], grav: gravity > 0.5 ? -0.05 : 0, drag: 0.8, grow: 1.6, bounce: 0 }); } }
		});
		objs.forEach(function (o) {
			var lv = o.body.linvel();
			if (o.def.breaks && o.lastV) { var dv = Math.hypot(lv.x - o.lastV.x, lv.y - o.lastV.y - gy * dt, lv.z - o.lastV.z); if (dv > o.def.breaks && performance.now() - o.born > 400) { o.broken = true; } }
			o.lastV = { x: lv.x, y: lv.y, z: lv.z };
		});
		for (var i = objs.length - 1; i >= 0; i--) if (objs[i].broken) breakObj(objs[i], i);
		if (subLast && Math.round(simT * 60) % 2 === 0) recordFrame();
	}
	function impact(c, ci, ix, iy, iz, dv, t, felt) {
		/* where: the side of the car facing the hit (opposite the push), in car coordinates */
		var r = c.body.rotation(), q = new THREE.Quaternion(r.x, r.y, r.z, r.w), qi = q.clone().invert();
		var push = new THREE.Vector3(ix, iy, iz).normalize().applyQuaternion(qi), d = c.d;
		var landing = push.y > 0.85 && dv < 9; /* a hard landing mostly squashes the springs */
		if (!landing && S.damage) {
			var p = new THREE.Vector3(-push.x * d.w / 2, -push.y * d.h / 2, -push.z * d.l / 2);
			var m = Math.max(Math.abs(push.x) / (d.w / 2), Math.abs(push.y) / (d.h / 2), Math.abs(push.z) / (d.l / 2)); p.set(-push.x / m, -push.y / m, -push.z / m);
			dent(c, p, push, dv);
			c.damage = Math.min(100, c.damage + Math.max(0, dv - 2) * (2.2 * 1200 / Math.max(400, d.mass * 0.6 + 600)));
			if (c.damage >= 100) c.paint.color.set(c.color).lerp(new THREE.Color("#2a2420"), 0.65);
			var wp = p.clone().applyQuaternion(q).add(new THREE.Vector3(t.x, t.y, t.z));
			parts.burst(wp.x, wp.y, wp.z, Math.min(40, (dv * 3) | 0), { speed: 3 + dv * 0.5, life: 0.5, size: 0.06, glow: true, cols: ["#ffd166", "#ffb703", "#fff1b8"], grav: 1, bounce: 0.4 });
			if (dv > 8) parts.burst(wp.x, wp.y, wp.z, Math.min(30, dv | 0), { speed: 2 + dv * 0.3, life: 2.5, size: 0.07, cols: ["#cfe8ff", "#9fc8ef", c.color], bounce: 0.2 });
		}
		if (ci === player || dist2(t, cars[player].body.translation()) < 900) sfx(landing ? "thud" : "crash", Math.min(1, dv / 18));
		if (ci === player && !landing) {
			felt = Math.max(felt, dv / 0.08 / C.G0 * 0.6);
			if (felt > REC.crash) { REC.crash = felt; saveRec(); }
			if (dv > 5) toast("Crash! " + felt.toFixed(0) + " g" + (c.damage >= 100 ? " · wrecked (Repair or R)" : " · damage " + Math.round(c.damage) + "%") + (dv > 9 ? " · Y = instant replay" : ""));
			shake = Math.min(1, dv / 20);
		}
	}
	function dist2(a, b) { return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z); }
	function breakObj(o, i) {
		var t = o.body.translation(), lv = o.body.linvel();
		var cols = o.def.glass ? ["#d7efff", "#a8dcff", "#ffffff"] : ["#e63946", "#ff6b81", "#2f8f3a", "#1b5e20", "#111"];
		parts.burst(t.x, t.y, t.z, o.def.glass ? 60 : 45, { speed: 4, vx: lv.x * 0.5, vy: lv.y * 0.5 + 1, vz: lv.z * 0.5, life: 3, size: o.def.glass ? 0.12 : 0.09, cols: cols, bounce: 0.25 });
		sfx(o.def.glass ? "glass" : "splat", 0.8);
		phys.removeRigidBody(o.body); scene.remove(o.mesh); objs.splice(i, 1);
	}
	/* air time + jump distance for the player */
	function trackAir(c, t, lv) {
		var air = !c.anyContact;
		if (air && !c.air) c.air = { t0: simT, x: t.x, z: t.z, y: t.y, p: 0, yw: 0, r: 0 };
		if (air && c.air) { /* turns in the car's own frame, for stunts */ var av = c.body.angvel(), rq = c.body.rotation(); tmpQ.set(rq.x, rq.y, rq.z, rq.w).invert(); var w = new THREE.Vector3(av.x, av.y, av.z).applyQuaternion(tmpQ); c.air.p += w.x / 60; c.air.yw += w.y / 60; c.air.r += w.z / 60; }
		if (!air && c.air) {
			var tAir = simT - c.air.t0, dist = Math.hypot(t.x - c.air.x, t.z - c.air.z);
			var st = C.stuntName(c.air.p, c.air.yw, c.air.r), upright = upOf(c).y > 0.5;
			if (st.name) {
				var best = "";
				if (upright && st.turns > (REC.stuntTurns || 0)) { REC.stuntTurns = st.turns; REC.stunt = st.name; saveRec(); best = " · new stunt record!"; }
				toast((upright ? "🏆 " + st.name.charAt(0).toUpperCase() + st.name.slice(1) + "! Landed it" : "💥 " + st.name + ", but you didn't land it") + " · " + C.fmtDist(dist, S.units) + ", " + tAir.toFixed(1) + " s" + best);
				if (upright) sfx("pop", 1);
				c.air = null; return;
			}
			if (tAir > 0.6 && dist > 6) {
				var rec = "";
				if (dist > REC.jump) { REC.jump = dist; rec = " · new record!"; }
				if (tAir > REC.air) REC.air = tAir;
				saveRec(); toast("Jump: " + C.fmtDist(dist, S.units) + ", " + tAir.toFixed(1) + " s in the air" + rec);
			}
			c.air = null;
		}
	}

	/* ===================== camera ===================== */
	var CAMS = [["chase", "Chase"], ["far", "Far chase"], ["hood", "Driver's seat"], ["side", "Side"], ["top", "Top down"], ["tv", "TV cameras"], ["orbit", "Orbit (drag)"]];
	var camSnap = true, camPos = null, camLook = null, camHead = 0, tvPos = null, shake = 0, free = { yaw: 0, pitch: 0, zoom: 1 }, orbit = { yaw: 0.6, pitch: 0.35, dist: 14 };
	function cycleCam(dir) { var i = CAMS.findIndex(function (c) { return c[0] === S.cam; }); S.cam = CAMS[(i + dir + CAMS.length) % CAMS.length][0]; $("cs-cam").value = S.cam; camSnap = true; free.yaw = free.pitch = 0; save(); toast("Camera: " + CAMS.find(function (c) { return c[0] === S.cam; })[1]); }
	function updateCamera(dt) {
		var c = cars[player]; if (!c) return;
		var ip = ipose(c), t = ip.t.clone(), lv = c.body.linvel(), cq = ip.q.clone(), pos = t.clone();
		var fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(cq), sp = Math.hypot(lv.x, lv.z);
		var head = sp > 3 && c.veh.currentVehicleSpeed() > 0 ? Math.atan2(lv.x, lv.z) : Math.atan2(fwd.x, fwd.z);
		if (c.veh.currentVehicleSpeed() < -1) head = Math.atan2(fwd.x, fwd.z);
		if (camSnap) camHead = head; else camHead += C.wrap(head - camHead) * Math.min(1, dt * 3);
		var hd = camHead + free.yaw, size = Math.max(c.d.l, 3), want = new THREE.Vector3(), look = pos.clone();
		var mode = S.cam;
		if (mode === "chase" || mode === "far") {
			var dist = (mode === "far" ? 2.6 : 1.45) * size * free.zoom + 2, hgt = (mode === "far" ? 1.0 : 0.55) * size + 1 + free.pitch * dist;
			want.set(t.x - Math.sin(hd) * dist, t.y + hgt, t.z - Math.cos(hd) * dist); look.y += c.d.h + 0.6;
		} else if (mode === "hood") {
			var eye = new THREE.Vector3(c.d.cab ? -0.35 : 0, c.d.h / 2 + (c.d.cab ? c.d.cab[0] * 0.55 : (c.d.kart ? 0.6 : 0.9)), c.d.cab ? c.d.l * c.d.cab[2] : -0.2).applyQuaternion(cq).add(pos);
			camera.position.copy(eye); var lk = new THREE.Vector3(Math.sin(free.yaw) * 10, -1 + free.pitch * 10, Math.cos(free.yaw) * 10).applyQuaternion(cq).add(eye);
			camera.up.set(0, 1, 0).applyQuaternion(cq); camera.lookAt(lk); camera.fov = 70 * free.zoom; camera.updateProjectionMatrix(); camSnap = false; return;
		} else if (mode === "side") { want.set(t.x + Math.cos(hd) * size * 2.2 * free.zoom, t.y + 1.5 + free.pitch * 8, t.z - Math.sin(hd) * size * 2.2 * free.zoom); }
		else if (mode === "top") { want.set(t.x - Math.sin(hd) * 0.5, t.y + 45 * free.zoom, t.z - Math.cos(hd) * 0.5); }
		else if (mode === "orbit") { var od = orbit.dist * free.zoom; want.set(t.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * od, t.y + 1 + Math.sin(orbit.pitch) * od, t.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * od); }
		else if (mode === "tv") {
			if (!tvPos || tvPos.distanceTo(pos) > 75 || camSnap) { var ahead = new THREE.Vector3(lv.x, 0, lv.z); if (ahead.length() < 2) ahead.copy(fwd).setY(0); ahead.normalize(); tvPos = pos.clone().addScaledVector(ahead, 35).add(new THREE.Vector3(-ahead.z, 0, ahead.x).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 10)); tvPos.y = hAt(tvPos.x, tvPos.z) + 1.6 + Math.random() * 4; }
			want.copy(tvPos); camera.fov = Math.max(18, Math.min(62, 900 / Math.max(10, tvPos.distanceTo(pos))));
		}
		if (mode !== "tv") camera.fov = 62;
		camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
		var k = camSnap || mode === "top" || mode === "orbit" || mode === "tv" ? 1 : 1 - Math.exp(-dt * 8);
		if (!camPos) camPos = want.clone(); camPos.lerp(want, k);
		/* keep the camera above the ground */
		var gh = hAt(camPos.x, camPos.z) + 0.6; if (camPos.y < gh) camPos.y = gh;
		camera.position.copy(camPos);
		if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.6; camera.position.y += (Math.random() - 0.5) * shake * 0.6; shake = Math.max(0, shake - dt * 2.5); }
		camera.lookAt(look); camSnap = false;
	}
	function setupCamDrag() {
		var cv = renderer.domElement, ptr = {}, moved = 0;
		cv.addEventListener("pointerdown", function (e) { ptr[e.pointerId] = [e.clientX, e.clientY]; moved = 0; kbActive = true; cv.focus({ preventScroll: true }); initAudio(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
		cv.addEventListener("pointermove", function (e) {
			var p = ptr[e.pointerId]; if (!p) return; var ids = Object.keys(ptr);
			if (ids.length === 2) { var a = ptr[ids[0]], b = ptr[ids[1]], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); ptr[e.pointerId] = [e.clientX, e.clientY]; a = ptr[ids[0]]; b = ptr[ids[1]]; var d1 = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d0 && d1) zoom(d0 / d1); return; }
			var dx = e.clientX - p[0], dy = e.clientY - p[1]; ptr[e.pointerId] = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy); if (moved < 4) return;
			if (S.cam === "orbit" || (replay && replay.cam === "orbit")) { orbit.yaw -= dx * 0.008; orbit.pitch = Math.max(-0.05, Math.min(1.4, orbit.pitch + dy * 0.006)); }
			else { free.yaw -= dx * 0.006 * (S.cam === "hood" ? -0.8 : 1); free.pitch = Math.max(-0.6, Math.min(1.2, free.pitch + dy * 0.004 * (S.cam === "hood" ? -1 : 1))); $("cs-camreset").hidden = false; }
		});
		function up(e) { delete ptr[e.pointerId]; }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("wheel", function (e) { if (!e.ctrlKey && !view.classList.contains("mes-pfill") && !document.fullscreenElement) return; e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
		cv.addEventListener("dblclick", camReset);
	}
	function zoom(k) { free.zoom = Math.max(0.4, Math.min(3, free.zoom * k)); $("cs-camreset").hidden = false; }
	function camReset() { free.yaw = free.pitch = 0; free.zoom = 1; $("cs-camreset").hidden = true; }

	/* ===================== sound (Web Audio) ===================== */
	var ac = null, eng = null, noiseBuf = null;
	function initAudio() {
		if (ac || !S.sound) { if (ac && ac.state === "suspended") ac.resume(); return; }
		try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
		var o1 = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain(), master = ac.createGain();
		o1.type = "sawtooth"; o2.type = "square"; lp.type = "lowpass"; lp.frequency.value = 600; g.gain.value = 0; master.gain.value = 0.5;
		master.gain.value = 0.5 * S.vol; o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); master.connect(ac.destination); o1.start(); o2.start();
		eng = { o1: o1, o2: o2, lp: lp, g: g, master: master };
		noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	}
	function engineSound(c) {
		if (!eng || !ac) return;
		var on = S.sound && !paused && !replay && stageVisible() && !document.hidden;
		var v = Math.abs(c.veh.currentVehicleSpeed()), gearSpan = c.d.vmax / 5, ratio = (v % gearSpan) / gearSpan, gear = Math.min(5, Math.floor(v / gearSpan));
		var rpm = 0.25 + ratio * 0.75 * (gear ? 1 : 1.2) + (c.in.th && !c.anyContact ? 0.4 : 0);
		var base = c.d.mass > 5000 ? 32 : c.d.mass < 400 ? 70 : 45, f = base + rpm * base * 2.2;
		eng.o1.frequency.setTargetAtTime(f, ac.currentTime, 0.05); eng.o2.frequency.setTargetAtTime(f * 0.5, ac.currentTime, 0.05);
		eng.lp.frequency.setTargetAtTime(W.rho ? 380 + c.in.th * 900 : 220 + c.in.th * 300, ac.currentTime, 0.08); /* no air: you only hear it through the seat */
		eng.g.gain.setTargetAtTime(on ? (0.05 + c.in.th * 0.09 + (c.in.boost ? 0.04 : 0)) : 0, ac.currentTime, 0.1);
	}
	function sfx(kind, amt) {
		if (!ac || !S.sound || !noiseBuf) return; amt = amt == null ? 0.5 : amt;
		var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), now = ac.currentTime;
		src.buffer = noiseBuf; src.playbackRate.value = kind === "glass" ? 1.6 : 1;
		f.type = kind === "glass" ? "highpass" : "lowpass"; f.frequency.value = { crash: 900, thud: 180, glass: 3000, splat: 500, pop: 1200 }[kind] || 800;
		var dur = { crash: 0.45, thud: 0.18, glass: 0.6, splat: 0.25, pop: 0.06, thunder: 2.6 }[kind] || 0.2;
		if (kind === "thunder") { f.frequency.value = 140; src.playbackRate.value = 0.5; src.loop = true; }
		g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.001, (kind === "pop" ? 0.15 : kind === "thunder" ? 0.9 : 0.55) * amt * (W.rho ? 1 : 0.35)), now + (kind === "thunder" ? 0.25 : 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
		src.connect(f); f.connect(g); g.connect(eng.master); src.start(now); src.stop(now + dur + 0.05);
	}
	function horn() {
		initAudio(); if (!ac) return; var now = ac.currentTime;
		[392, 494].forEach(function (fq) { var o = ac.createOscillator(), g = ac.createGain(); o.type = "square"; o.frequency.value = fq; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now + 0.02); g.gain.setValueAtTime(0.12, now + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45); o.connect(g); g.connect(eng.master); o.start(now); o.stop(now + 0.5); });
		if (!W.rho) toast("No air on " + W.name.replace(/ \(.*/, "") + ": nobody outside your car hears the horn");
	}

	/* ===================== gravity ===================== */
	function setGravity(g) {
		if (Math.abs(g - gravity) > 1e-6) lap.valid = false; /* a new gravity starts a new set of best laps */
		gravity = g; S.g = Math.abs(g - W.g) < 1e-6 ? null : g; save();
		phys.gravity = { x: 0, y: gFlip > 0 ? Math.abs(g) * 0.6 : -g, z: 0 };
		cars.forEach(function (c) { c.body.wakeUp(); setSuspForce(c); }); objs.forEach(function (o) { o.body.wakeUp(); });
		updateGravityUI();
	}
	function flipGravity() {
		if (gFlip > 0) { gFlip = 0; setGravity(gravity); return; }
		gFlip = 2.5; lap.valid = false; phys.gravity = { x: 0, y: Math.max(1.5, gravity) * 0.6, z: 0 };
		cars.forEach(function (c) { c.body.wakeUp(); }); objs.forEach(function (o) { o.body.wakeUp(); });
		toast("Gravity points UP for 2.5 seconds!"); updateGravityUI();
	}
	function updateGravityUI() {
		var g = gravity, nm = C.gName(g);
		$("cs-g").value = g <= 30 ? g : 30; $("cs-gnum").value = +g.toFixed(2);
		$("cs-gname").textContent = (nm ? nm + " · " : "") + (g / C.G0).toFixed(2) + " × Earth";
		document.querySelectorAll("#cs-gpre button").forEach(function (b) { b.setAttribute("aria-pressed", Math.abs(+b.dataset.g - g) < 0.005 ? "true" : "false"); });
		var st = C.stopDist(27.78, wx().grip, g), jp = C.jump(25, 0.35, g);
		$("cs-gfacts").textContent = g > 0 ? "At this gravity a car stopping from 100 km/h needs about " + C.fmtDist(st, S.units) + ", and a 90 km/h jump off a 20° ramp flies about " + C.fmtDist(jp.range, S.units) + " for " + jp.time.toFixed(1) + " s." : "Zero gravity: nothing pushes the tyres onto the ground, so there is no grip at all. Anything you bump floats away forever.";
		$("cs-hgrav").textContent = gFlip > 0 ? "↑ gravity!" : (nm || (g / C.G0).toFixed(2) + " g") + " · " + g.toFixed(2) + " m/s²";
	}

	/* ===================== HUD ===================== */
	var hudT = 0, toastT = null;
	function toast(t) { var el = $("cs-toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("show"); }, 2600); }
	function saveRec() { try { localStorage.setItem(RKEY, JSON.stringify(REC)); } catch (e) { /* ignore */ } }
	function updateHud(force) {
		var c = cars[player]; if (!c) return;
		var v = c.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
		if (sp > REC.top && sp < 400) { REC.top = sp; if (sp > 5 && (force || Math.random() < 0.05)) saveRec(); }
		$("cs-speed").textContent = S.units === "mph" ? Math.round(sp * 2.236936) : Math.round(sp * 3.6);
		$("cs-sunit").textContent = S.units === "mph" ? "mph" : "km/h";
		$("cs-hg").textContent = c.gS.toFixed(1) + " g";
		$("cs-hpeak").textContent = c.gPeak.toFixed(1) + " g";
		$("cs-dmg").style.width = c.damage + "%"; $("cs-dmg").style.background = c.damage > 75 ? "#e03131" : c.damage > 40 ? "#f08c00" : "#37b24d";
		$("cs-hdmg").textContent = Math.round(c.damage) + "%";
		$("cs-hcar").textContent = C.CARS[c.type].name + (cars.length > 1 ? " (" + (player + 1) + "/" + cars.length + ")" : "");
		var lb = $("cs-lap"); lb.hidden = !W.track; ghostLoad();
		if (W.track) {
			var best = REC.laps[lapKey()];
			$("cs-lapnow").textContent = lap.t0 != null && lap.valid ? "Lap " + (lap.laps + 1) + " · " + C.fmtLap(simT - lap.t0) : (lap.t0 != null ? "Lap not counted · cross the line again" : "Cross the start line to start the timer");
			$("cs-lapbest").textContent = "Last " + C.fmtLap(lap.last && lap.last.time) + " · Best " + C.fmtLap(best && best.time);
		}
		$("cs-air").textContent = c.air ? "In the air " + (simT - c.air.t0).toFixed(1) + " s" : "";
		var bl = REC.laps[lapKey()];
		$("cs-rec").textContent = (W.track ? "Best lap here (" + C.CARS[c.type].name + ", " + gravity.toFixed(2) + " m/s²): " + C.fmtLap(bl && bl.time) + " · " : "") + "Top " + C.fmtSpeed(REC.top, S.units) + " · longest jump " + C.fmtDist(REC.jump, S.units) + " · most air " + REC.air.toFixed(1) + " s · biggest crash " + REC.crash.toFixed(0) + " g" + (REC.stunt ? " · best stunt: " + REC.stunt : "");
	}

	/* ===================== main loop ===================== */
	var todSave = 3, acc = 0, lastFrame = 0, frames = 0;
	function frame(now) {
		requestAnimationFrame(frame);
		if (!phys) return;
		var dt = Math.min(0.1, (now - (lastFrame || now)) / 1000); lastFrame = now;
		var vis = !document.hidden && stageOnScreen();
		if (!vis) return;
		advance(dt);
		render();
	}
	function advance(dt) {
		if (S.cycle && !paused && !replay) { S.tod = (S.tod + dt * (S.slow ? 0.25 : 1) * 24 / (S.cycleMin * 60)) % 24; applyTime(); todSave -= dt; if (todSave < 0) { todSave = 3; save(); } }
		stepWeather(paused && !replay ? 0 : dt * (S.slow ? 0.25 : 1) * (replay ? replay.speed * (replay.playing ? 1 : 0) : 1)); rainSound();
		if (replay) { replayAdvance(dt); if (skyGroup) skyGroup.position.copy(camera.position); headlights(); return; }
		if (!paused) {
			acc += dt * (S.slow ? 0.25 : 1);
			/* heavy gravity makes the (gravity-scaled) springs stiff: take smaller physics steps so they stay stable (Sun: 6 a tick) */
			var sub = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(Math.abs(gravity) / 9.81)))), sdt = 1 / 60 / sub;
			phys.timestep = sdt;
			var n = 0; while (acc >= 1 / 60 && n < 4) { keepPrev(); for (var si = 0; si < sub; si++) { subLast = si === sub - 1; step(sdt); simT += sdt; } acc -= 1 / 60; n++; }
			if (n >= 4) acc = 0;
			if (gFlip > 0) { gFlip -= dt; if (gFlip <= 0) { gFlip = 0; setGravity(gravity); toast("Gravity is back"); } }
		}
		parts.step(paused ? 0 : dt * (S.slow ? 0.25 : 1));
		syncMeshes(); updateCamera(dt);
		hudT -= dt; if (hudT < 0) { hudT = 0.1; updateHud(); }
		if (cars[player]) engineSound(cars[player]);
	}
	/* Physics runs in fixed 1/60 s ticks but frames come at the screen's rate (120 Hz on ProMotion screens, and rAF timing wobbles),
	   so a frame gets 0, 1 or 2 ticks: at speed the car jumped unevenly while the camera followed smoothly = the picture shook.
	   Each frame now draws every body part of the way from its pose before the last tick to its pose after it (alpha = acc * 60). */
	function keepPrev() {
		function k(o) { var t = o.body.translation(), r = o.body.rotation(); if (!o.pv) o.pv = { t: new THREE.Vector3(), q: new THREE.Quaternion() }; o.pv.t.set(t.x, t.y, t.z); o.pv.q.set(r.x, r.y, r.z, r.w); o.pv.ok = true; }
		cars.forEach(k); objs.forEach(k);
	}
	var ipT = null, ipQ = null;
	function ipose(o) {
		if (!ipT) { ipT = new THREE.Vector3(); ipQ = new THREE.Quaternion(); }
		var t = o.body.translation(), r = o.body.rotation(); ipT.set(t.x, t.y, t.z); ipQ.set(r.x, r.y, r.z, r.w);
		var a = paused ? 1 : Math.max(0, Math.min(1, acc * 60));
		if (o.pv && o.pv.ok && a < 1 && o.pv.t.distanceToSquared(ipT) < 100) { ipT.lerpVectors(o.pv.t, ipT, a); ipQ.slerpQuaternions(o.pv.q, ipQ, a); }
		return { t: ipT, q: ipQ };
	}
	function stageOnScreen() { var r = stage.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
	function syncMeshes() {
		cars.forEach(function (c) {
			var ip = ipose(c); c.group.position.copy(ip.t); c.group.quaternion.copy(ip.q);
			for (var i = 0; i < 4; i++) {
				var w = c.wheels[i], sl = c.veh.wheelSuspensionLength(i), cp = c.veh.wheelChassisConnectionPointCs(i);
				if (sl == null || !cp) continue;
				w.piv.position.set(cp.x, cp.y - sl, cp.z); w.piv.rotation.y = c.veh.wheelSteering(i) || 0; w.spin.rotation.x = c.veh.wheelRotation(i) || 0;
			}
		});
		objs.forEach(function (o) { var ip = ipose(o); o.mesh.position.copy(ip.t); o.mesh.quaternion.copy(ip.q); });
		if (ghostMesh) {
			var gp = S.show.ghost !== false && lap.t0 != null && lap.valid ? C.ghostPose(ghost, simT - lap.t0) : null;
			ghostMesh.visible = !!gp; if (gp) { ghostMesh.position.set(gp.x, gp.y, gp.z); ghostMesh.quaternion.set(gp.q[0], gp.q[1], gp.q[2], gp.q[3]); }
		}
		var c = cars[player];
		if (c && sunLight.userData.dir) { var t2 = c.body.translation(); sunLight.target.position.set(t2.x, t2.y, t2.z); sunLight.position.set(t2.x, t2.y, t2.z).addScaledVector(sunLight.userData.dir, 150); }
		if (skyGroup) skyGroup.position.copy(camera.position);
		headlights();
	}
	function render() { renderer.render(scene, camera); }
	function togglePause() { paused = !paused; $("cs-pause").textContent = paused ? "▶ Play" : "❚❚ Pause"; toast(paused ? "Paused" : "Playing"); }
	function switchCar(dir) {
		if (cars.length < 2) { toast("Add computer cars to switch between them"); return; }
		cars[player].ai = true; player = (player + dir + cars.length) % cars.length; cars[player].ai = false; camSnap = true; lapReset(); ghostKey = "";
		toast("Now driving: " + C.CARS[cars[player].type].name);
	}

	/* ===================== UI wiring ===================== */
	function opt(sel, list, val) { sel.innerHTML = list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? " selected" : "") + ">" + o[1] + "</option>"; }).join(""); }
	function rpToggle() { if (!replay) return; if (!replay.playing && replay.t >= replay.len - 0.01) replay.t = 0; replay.playing = !replay.playing; $("cs-rpplay").textContent = replay.playing ? "❚❚" : "▶"; }
	function setSound(on) { S.sound = !!on; save(); if (S.sound) initAudio(); else if (eng) eng.g.gain.value = 0; syncSoundUI(); }
	function setVolume(v) { S.vol = Math.max(0, Math.min(1, v)); save(); if (eng) eng.master.gain.setTargetAtTime(0.5 * S.vol, ac.currentTime, 0.03); if (S.vol > 0 && !S.sound) { S.sound = true; initAudio(); } syncSoundUI(); }
	function syncSoundUI() {
		root.querySelectorAll("[data-snd]").forEach(function (b) { b.checked = !!S.sound; });
		root.querySelectorAll("[data-vol]").forEach(function (b) { if (document.activeElement !== b) b.value = Math.round(S.vol * 100); });
		root.querySelectorAll("[data-volnum]").forEach(function (b) { b.textContent = Math.round(S.vol * 100) + "%"; });
		var m = $("cs-mute"); m.textContent = !S.sound || S.vol === 0 ? "🔇" : S.vol < 0.4 ? "🔉" : "🔊"; m.setAttribute("aria-pressed", String(!S.sound));
	}
	function applyShow() {
		["info", "lap", "speed", "msg"].forEach(function (k) { root.classList.toggle("cs-hide-" + k, S.show[k] === false); });
		root.querySelectorAll("[data-show]").forEach(function (b) { b.checked = S.show[b.dataset.show] !== false; });
		var hud = root.querySelector(".cs-hud"); if (hud) hud.hidden = S.show.info === false && (S.show.lap === false || !(W && W.track));
	}
	function setupUI() {
		opt($("cs-world"), C.WORLD_ORDER.map(function (w) { return [w, C.WORLDS[w].name]; }), S.world);
		opt($("cs-car"), [["", "Best for this world"]].concat(C.CAR_ORDER.map(function (k) { return [k, C.CARS[k].name]; })), S.car || "");
		opt($("cs-cam"), CAMS, S.cam);
		function wxOpts() { opt($("cs-wx"), Object.keys(C.WEATHER).map(function (k) { return [k, C.WEATHER[k].icon + " " + C.WEATHER[k].name]; }), C.weatherFor(S.world).indexOf(S.weather) >= 0 ? S.weather : "clear"); Array.prototype.forEach.call($("cs-wx").options, function (o) { o.disabled = C.weatherFor(S.world).indexOf(o.value) < 0; }); }
		wxOpts(); $("cs-world").addEventListener("change", wxOpts);
		$("cs-wx").addEventListener("change", function () { setWeather(this.value); });
		$("cs-wdesc").textContent = C.WORLDS[S.world].desc;
		$("cs-world").addEventListener("change", function () { S.world = this.value; S.g = null; S.car = null; $("cs-car").value = ""; save(); $("cs-wdesc").textContent = C.WORLDS[S.world].desc; buildWorld(); syncUrl(); });
		$("cs-car").addEventListener("change", function () { S.car = this.value || null; save(); swapPlayerCar(); syncUrl(); });
		$("cs-cam").addEventListener("change", function () { S.cam = this.value; camSnap = true; camReset(); save(); });
		$("cs-camreset").addEventListener("click", camReset);
		var sw = $("cs-paint"); sw.innerHTML = C.PAINT.map(function (c) { return '<button type="button" style="background:' + c + '" data-c="' + c + '" aria-label="Paint ' + c + '"></button>'; }).join("");
		sw.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.color = b.dataset.c; save(); var c = cars[player]; c.color = S.color; c.paint.color.set(S.color); });
		/* gravity */
		$("cs-gpre").innerHTML = C.GRAVITY.map(function (p) { return '<button type="button" data-g="' + p[1] + '">' + p[0] + "</button>"; }).join("");
		$("cs-gpre").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; setGravity(+b.dataset.g); syncUrl(); if (+b.dataset.g > 100) toast("Sun gravity: 28 times Earth. The springs give up."); });
		$("cs-g").addEventListener("input", function () { setGravity(+this.value); });
		$("cs-g").addEventListener("change", syncUrl);
		$("cs-gnum").addEventListener("change", function () { var g = Math.max(0, Math.min(300, +this.value || 0)); setGravity(g); syncUrl(); });
		$("cs-flip").addEventListener("click", flipGravity);
		/* traffic */
		$("cs-traffic").value = S.traffic; $("cs-tnum").textContent = S.traffic;
		$("cs-traffic").addEventListener("input", function () { S.traffic = +this.value; $("cs-tnum").textContent = S.traffic; setTraffic(S.traffic); save(); });
		$("cs-traffic").addEventListener("change", syncUrl);
		opt($("cs-ai"), [["cruise", "Drive around"], ["chase", "Chase and ram me (derby)"], ["park", "Parked"]], S.ai);
		$("cs-ai").addEventListener("change", function () { S.ai = this.value; save(); syncUrl(); toast(S.ai === "chase" ? "Demolition derby: they are coming for you" : "Computer cars: " + this.options[this.selectedIndex].text); });
		$("cs-switch").addEventListener("click", function () { switchCar(1); });
		/* objects */
		$("cs-objs").innerHTML = C.OBJ_ORDER.map(function (k) { var o = C.OBJECTS[k]; return '<button type="button" data-k="' + k + '"><span aria-hidden="true">' + o.icon + "</span> " + o.name + "</button>"; }).join("");
		$("cs-objs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) spawnKind(b.dataset.k); });
		$("cs-lays").innerHTML = Object.keys(C.LAYOUTS).map(function (k) { var o = C.LAYOUTS[k]; return '<button type="button" data-k="' + k + '"><span aria-hidden="true">' + o.icon + "</span> " + o.name + "</button>"; }).join("");
		$("cs-lays").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) spawnLayout(b.dataset.k); });
		$("cs-clear").addEventListener("click", function () { clearObjs(); toast("Objects cleared"); });
		/* car actions */
		$("cs-reset").addEventListener("click", playerReset); $("cs-sreset").addEventListener("click", playerReset); $("cs-unflip").addEventListener("click", playerReset);
		$("cs-start").addEventListener("click", function () { resetCar(cars[player], false); repair(cars[player]); });
		$("cs-repair").addEventListener("click", function () { cars.forEach(repair); toast("All cars repaired"); });
		$("cs-pause").addEventListener("click", togglePause);
		$("cs-slow").checked = !!S.slow; $("cs-slow").addEventListener("change", function () { S.slow = this.checked; save(); });
		/* sound + what to show: the same controls on the picture (⚙) and in the panel stay in step */
		root.addEventListener("change", function (e) {
			var t = e.target;
			if (t.matches("[data-snd]")) setSound(t.checked);
			else if (t.matches("[data-show]")) { S.show[t.dataset.show] = t.checked; save(); applyShow(); }
		});
		root.addEventListener("input", function (e) { if (e.target.matches("[data-vol]")) setVolume(+e.target.value / 100); });
		$("cs-mute").addEventListener("click", function () { setSound(!S.sound); toast(S.sound ? "Sound on" : "Sound off"); });
		$("cs-optbtn").addEventListener("click", function () { var p = $("cs-pop"); p.hidden = !p.hidden; this.setAttribute("aria-expanded", String(!p.hidden)); });
		$("cs-popx").addEventListener("click", function () { $("cs-pop").hidden = true; $("cs-optbtn").setAttribute("aria-expanded", "false"); });
		applyShow(); syncSoundUI();
		$("cs-rpbtn").addEventListener("click", replayStart);
		$("cs-night").addEventListener("click", function () { setNight(dayK >= 0.45); });
		root.addEventListener("input", function (e) { if (e.target.matches("[data-tod]")) setTod(+e.target.value, true); });
		root.addEventListener("change", function (e) { if (e.target.matches("[data-tod]")) { save(); syncUrl(); } else if (e.target.matches("[data-cyspd]")) { S.cycleMin = +e.target.value; save(); todUI(); } });
		root.addEventListener("click", function (e) { var b = e.target.closest("[data-cycle]"); if (b) { S.cycle = !S.cycle; save(); todUI(); toast(S.cycle ? "The day is running: one day = " + C.CYCLES.find(function (x) { return x[0] === S.cycleMin; })[1] : "Clock stopped at " + C.fmtTime(S.tod)); } });
		root.querySelectorAll("[data-cyspd]").forEach(function (sel) { sel.innerHTML = C.CYCLES.map(function (x) { return '<option value="' + x[0] + '">1 day = ' + x[1] + "</option>"; }).join(""); });
		$("cs-rpplay").addEventListener("click", rpToggle);
		$("cs-rpx").addEventListener("click", function () { replayStop(); });
		$("cs-rpbar").addEventListener("input", function () { if (!replay) return; replay.t = +this.value / 1000 * replay.len; replay.playing = false; $("cs-rpplay").textContent = "▶"; });
		$("cs-rpspeed").addEventListener("change", function () { if (replay) replay.speed = +this.value; });
		$("cs-rpcam").addEventListener("change", function () { if (!replay) return; replay.cam = this.value; replayCamPref = this.value; replay.tv = replay.cp = null; });
		$("cs-units").value = S.units; $("cs-units").addEventListener("change", function () { S.units = this.value; save(); updateGravityUI(); updateHud(true); });
		$("cs-shadow").checked = !!S.shadows; $("cs-shadow").addEventListener("change", function () { S.shadows = this.checked; save(); sunLight.castShadow = S.shadows; });
		$("cs-dmgon").checked = !!S.damage; $("cs-dmgon").addEventListener("change", function () { S.damage = this.checked; save(); });
		$("cs-touchsel").value = S.touch; $("cs-touchsel").addEventListener("change", function () { S.touch = this.value; save(); showTouch(); });
		$("cs-png").addEventListener("click", function () { render(); var a = document.createElement("a"); a.download = "mes-car-sandbox.png"; a.href = renderer.domElement.toDataURL("image/png"); a.click(); });
		$("cs-link").addEventListener("click", function () { var u = location.origin + location.pathname + "?" + C.query(S); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link", u); }); });
		$("cs-recclear").addEventListener("click", function () { REC = { top: 0, jump: 0, air: 0, crash: 0, laps: {} }; try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(GKEY) === 0) localStorage.removeItem(k); }); } catch (e) { /* ignore */ } ghost = null; ghostKey = ''; ghostBuild(); saveRec(); updateHud(true); });
		$("cs-helpbtn").addEventListener("click", function () { var h = $("cs-help"); h.hidden = !h.hidden; S.help = !h.hidden; save(); });
		$("cs-helpx").addEventListener("click", function () { $("cs-help").hidden = true; S.help = false; save(); });
		$("cs-help").hidden = !S.help;
		$("cs-camnext").addEventListener("click", function () { cycleCam(1); });
		if (window.MESPanel) window.MESPanel.add(view, { bar: $("cs-pbar"), stage: stage, onChange: function () { setTimeout(resize, 30); kbActive = true; } });
		else document.addEventListener("DOMContentLoaded", function () { if (window.MESPanel) window.MESPanel.add(view, { bar: $("cs-pbar"), stage: stage, onChange: function () { setTimeout(resize, 30); } }); });
		setupTouch();
	}
	function swapPlayerCar() {
		var old = cars[player], t = old.body.translation(), f = fwdOf(old);
		var c = makeCar(S.car && C.CARS[S.car] ? S.car : W.car, S.color, { x: t.x, z: t.z, yaw: Math.atan2(f.x, f.z) }, true);
		removeCar(old); cars[player] = c; c.id = player; camSnap = true; lapReset(); ghostKey = ""; updateHud(true);
	}
	function syncUrl() { try { history.replaceState(null, "", location.pathname + "?" + C.query(S)); } catch (e) { /* ignore */ } }

	/* ===================== start ===================== */
	setupDomOnly();
	function setupDomOnly() { msg("Loading the 3D engine and the physics (about 1 MB)…"); }
	var test = document.createElement("canvas");
	if (!(test.getContext("webgl2") || test.getContext("webgl"))) { msg("Your browser has WebGL switched off, so the 3D view can't start. Try another browser, or turn on hardware acceleration."); return; }
	loadLibs().then(function (m) {
		THREE = m[0]; RAPIER = m[1];
		initRenderer(); parts.init(); setupUI(); setupCamDrag();
		buildWorld(); msg("");
		if (Q.world || Q.car || Q.g != null) syncUrl();
		requestAnimationFrame(frame);
	}).catch(function (e) { console.error(e); msg("The 3D engine could not load (" + (e && e.message || e) + "). Check your connection and reload the page."); });

	window.MESCarSandbox = {
		state: function () { var c = cars[player]; return c ? { cam: camera.position.toArray().map(Math.round), pos: c.body.translation(), v: c.veh.currentVehicleSpeed(), damage: c.damage, cars: cars.length, objs: objs.length, g: phys.gravity.y, contact: c.anyContact } : null; },
		/* run the simulation forward without animation frames (a hidden tab has none): MESCarSandbox.run(seconds, {th, st, br, boost}) */
		run: function (sec, inp) { var saved = touch; touch = Object.assign({ th: 0, br: 0, l: 0, r: 0, hb: 0, boost: 0 }, inp || {}); for (var i = 0; i < sec * 60; i++) advance(1 / 60); touch = saved; render(); return this.state(); },
		/* let the computer drive the player's car (testing the lap timer): MESCarSandbox.auto(seconds) */
		auto: function (sec) { var a = S.ai; S.ai = "cruise"; autoPilot = true; for (var i = 0; i < sec * 60; i++) advance(1 / 60); autoPilot = false; S.ai = a; render(); return { laps: lap.laps, last: lap.last, best: REC.laps[lapKey()], hud: $("cs-lapnow").textContent + " | " + $("cs-lapbest").textContent, toast: $("cs-toast").textContent }; },
		car: function () { return cars[player]; }, replay: function () { replayStart(); return replay ? { len: replay.len, frames: replay.frames.length } : null; }, replayStep: function (sec) { for (var i = 0; i < sec * 60; i++) advance(1 / 60); render(); return replay ? replay.t : null; }, night: setNight, weather: setWeather, tod: function (h) { setTod(h); return { day: dayK, sun: sunLight.intensity, hemi: hemi.intensity }; }, ghostShown: function () { return !!(ghostMesh && ghostMesh.visible); },
		render: function () { render(); }, advance: function (dt) { advance(dt); }, camera: function () { return camera; }, spawn: spawnKind, layout: spawnLayout, gravity: setGravity, cam: function (m) { S.cam = m; camSnap = true; }
	};
})();
