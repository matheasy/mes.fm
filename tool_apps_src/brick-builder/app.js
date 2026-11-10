/* MES Brick Builder page. Engine = window.MESBrick (lib.js), examples = window.BB_EXAMPLES (templates.js).
 * three.js 0.170.0 + addons come from jsDelivr through the page's import map. Units in the scene: millimetres, Y up. */
(function () {
	'use strict';
	var root = document.getElementById('bb'); if (!root) return;
	var M = window.MESBrick, EX = window.BB_EXAMPLES || [];
	var $ = function (id) { return document.getElementById(id); };
	var imp; try { imp = new Function('u', 'return import(u)'); } catch (e) { imp = null; }
	var T, OrbitControls, BGU;
	var KEY = 'mes-brick-builder:v1', BKEY = 'mes-brick-builder:build';
	var S = { part: 'b2x4', color: 0, rot: 0, tool: 'build', cat: 'brick', size: 32, bcol: 3, shadow: true, ghost: true, studs: true, stress: false, anchored: true, grip: 'normal', lw: 200, tab: 'test' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	if (!M.BY[S.part]) S.part = 'b2x4';
	function saveS() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

	var W = new M.World(S.size), loads = {}, fixed = {}, chal = null, testU = 0, stepN = null, hist = [], fut = [], analysis = null;
	var renderer, scene, camera, orbit, view = $('bb-view'), meshes = {}, ghost, baseGroup, pickList = [], dirty = true, sun;
	var GEO = {}, MAT = {}, SMAT = {};
	var PX = M.STUD, PY = M.PLATE;

	// ---------- small helpers ----------
	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	var toastT;
	function toast(msg, ms) { var t = $('bb-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 2600); }
	function status(msg) { $('bb-status').textContent = msg || ''; }
	function colHex(i) { return M.COLORS[i] ? M.COLORS[i][1] : '#888888'; }
	function partLabel(p) { return M.BY[p.t].name + ' (' + M.COLORS[p.c][0].toLowerCase() + ')'; }

	// ---------- history / saving ----------
	function snap() { return { p: W.list(), l: loadList(), f: Object.keys(fixed).length ? W.parts.map(function (p) { return fixed[p.u] ? 1 : 0; }) : null }; }
	function loadList() { var out = []; W.parts.forEach(function (p, i) { if (loads[p.u]) out.push([i, loads[p.u]]); }); return out; }
	function restore(s) {
		W.load(s.p); loads = {}; fixed = {};
		(s.l || []).forEach(function (x) { var p = W.parts[x[0]]; if (p) loads[p.u] = x[1]; });
		if (s.f) s.f.forEach(function (v, i) { if (v && W.parts[i]) fixed[W.parts[i].u] = 1; });
		if (testU && !W.byU[testU]) testU = 0;
	}
	function commit() { hist.push(lastSnap); if (hist.length > 300) hist.shift(); fut = []; lastSnap = snap(); persist(); refresh(); }
	var lastSnap = snap(), persistT;
	function persist() {
		clearTimeout(persistT);
		persistT = setTimeout(function () { try { localStorage.setItem(BKEY, JSON.stringify({ size: S.size, s: lastSnap, chal: chal ? chal.id : null })); } catch (e) {} }, 300);
	}
	function undo() { if (!hist.length) return toast('Nothing to undo'); fut.push(lastSnap); lastSnap = hist.pop(); restore(lastSnap); persist(); refresh(); }
	function redo() { if (!fut.length) return toast('Nothing to redo'); hist.push(lastSnap); lastSnap = fut.pop(); restore(lastSnap); persist(); refresh(); }

	// ---------- left panel ----------
	function buildPalette() {
		var c = $('bb-colors');
		c.innerHTML = M.COLORS.map(function (x, i) { return '<button type="button" class="bb-sw" role="radio" data-c="' + i + '" style="background:' + x[1] + '" title="' + esc(x[0]) + '" aria-label="' + esc(x[0]) + '"></button>'; }).join('');
		c.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; S.color = +b.dataset.c; saveS(); markPalette(); if (S.tool === 'pick' || S.tool === 'remove' || S.tool === 'load') setTool(S.tool === 'pick' ? 'build' : S.tool); updateGhostMat(); });
		$('bb-cats').innerHTML = M.CATS.map(function (x) { return '<button type="button" class="bb-cat" role="tab" data-cat="' + x[0] + '">' + x[1] + '</button>'; }).join('');
		$('bb-cats').addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; S.cat = b.dataset.cat; $('bb-psearch').value = ''; saveS(); drawParts(); });
		$('bb-psearch').addEventListener('input', drawParts);
		$('bb-parts').addEventListener('click', function (e) { var b = e.target.closest('[data-part]'); if (!b) return; S.part = b.dataset.part; saveS(); if (S.tool !== 'build') setTool('build'); markPalette(); rebuildGhost(); });
		drawParts(); markPalette();
	}
	function partIcon(def) {
		// a little isometric drawing of the part
		var sz = [def.w, def.d], h = def.h, s = Math.min(9, 40 / (sz[0] + sz[1] + 1)), hy = s * 0.42 * h;
		var ox = 24, oy = 6 + Math.max(0, 22 - hy) / 2 + 2;
		function P(x, z, y) { return [(ox + (x - z) * s * 0.87).toFixed(1), (oy + (x + z) * s * 0.5 - y).toFixed(1)]; }
		var col = colHex(S.color), a = P(0, 0, hy), b = P(sz[0], 0, hy), c = P(sz[0], sz[1], hy), d = P(0, sz[1], hy), e = P(sz[0], 0, 0), f = P(sz[0], sz[1], 0), g = P(0, sz[1], 0);
		var top = def.shape === 'round' || def.shape === 'cone' ? '' : '<path d="M' + a + 'L' + b + 'L' + c + 'L' + d + 'Z" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>';
		var sides = '<path d="M' + b + 'L' + e + 'L' + f + 'L' + c + 'Z" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6" style="filter:brightness(.78)"/><path d="M' + d + 'L' + c + 'L' + f + 'L' + g + 'Z" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6" style="filter:brightness(.62)"/>';
		if (def.shape === 'round' || def.shape === 'cone' || def.shape === 'wheel') {
			var cx = (+a[0] + +c[0]) / 2, cy = (+a[1] + +c[1]) / 2, rr = s * sz[0] * 0.62;
			if (def.shape === 'wheel') return '<svg viewBox="0 0 48 40" aria-hidden="true"><ellipse cx="24" cy="20" rx="' + (s * 1.2 * def.h / 3) + '" ry="' + (s * 1.2 * def.h / 3) + '" fill="' + col + '" stroke="rgba(0,0,0,.4)"/><circle cx="24" cy="20" r="' + (s * 0.5) + '" fill="rgba(255,255,255,.55)"/></svg>';
			sides = '<path d="M' + (cx - rr) + ',' + cy + 'V' + (cy + hy) + 'A' + rr + ',' + rr * 0.5 + ' 0 0 0 ' + (cx + rr) + ',' + (cy + hy) + 'V' + cy + 'Z" fill="' + col + '" style="filter:brightness(.72)" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>';
			top = def.shape === 'cone' ? '<path d="M' + (cx - rr) + ',' + (cy + hy) + 'L' + cx + ',' + (cy - 2) + 'L' + (cx + rr) + ',' + (cy + hy) + 'Z" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>' : '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rr + '" ry="' + rr * 0.5 + '" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>';
			if (def.shape === 'cone') sides = '';
		}
		var studs = '';
		def.studCells.forEach(function (sc) { if (def.shape === 'round' && def.w > 1) return; var p = P(sc[0] + 0.5, sc[1] + 0.5, hy); studs += '<ellipse cx="' + p[0] + '" cy="' + (p[1] - 1.2) + '" rx="' + (s * 0.33) + '" ry="' + (s * 0.19) + '" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>'; });
		var label = def.shape === 'slope' || def.shape === 'inv' ? '<text x="40" y="38" font-size="8" fill="currentColor">◢</text>' : def.shape === 'arch' ? '<text x="40" y="38" font-size="8" fill="currentColor">⌒</text>' : '';
		return '<svg viewBox="0 0 48 40" aria-hidden="true">' + sides + top + studs + label + '</svg>';
	}
	function drawParts() {
		var q = $('bb-psearch').value.trim().toLowerCase(), list = M.PARTS.filter(function (p) { return q ? (p.name + ' ' + p.id + ' ' + p.cat).toLowerCase().indexOf(q) >= 0 : p.cat === S.cat; });
		$('bb-parts').innerHTML = list.length ? list.map(function (p) { return '<button type="button" class="bb-part" role="option" data-part="' + p.id + '" title="' + esc(p.name) + '">' + partIcon(p) + '<span>' + esc(p.name.replace(/^(Brick|Plate|Smooth tile) /, '')) + '</span></button>'; }).join('') : '<p class="bb-small">No part matches.</p>';
		Array.prototype.forEach.call($('bb-cats').children, function (b) { b.setAttribute('aria-selected', !q && b.dataset.cat === S.cat ? 'true' : 'false'); });
		markPalette();
	}
	function markPalette() {
		Array.prototype.forEach.call($('bb-colors').children, function (b) { b.setAttribute('aria-checked', +b.dataset.c === S.color ? 'true' : 'false'); });
		Array.prototype.forEach.call($('bb-parts').querySelectorAll('[data-part]'), function (b) { b.setAttribute('aria-selected', b.dataset.part === S.part ? 'true' : 'false'); });
		$('bb-cname').textContent = M.COLORS[S.color][0];
		if (markPalette._c !== S.color) { markPalette._c = S.color; Array.prototype.forEach.call($('bb-parts').querySelectorAll('[data-part]'), function (b) { b.firstChild.outerHTML = partIcon(M.BY[b.dataset.part]); }); }
	}
	function setTool(t) {
		S.tool = t; saveS();
		Array.prototype.forEach.call(root.querySelectorAll('.bb-tool'), function (b) { b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'); });
		view.dataset.tool = t;
		if (ghost) ghost.visible = false;
		var tip = { build: 'Click to add a ' + M.BY[S.part].name + '. Shift-click removes. R turns it.', paint: 'Click a brick to paint it ' + M.COLORS[S.color][0].toLowerCase() + '.', remove: 'Click a brick to take it off.', pick: 'Click a brick to copy its part and colour.', load: 'Click a brick to put ' + M.fmtG(S.lw) + ' on it (click again to take it off).' };
		status(tip[t]);
	}

	// ---------- geometry ----------
	function profileGeo(pts, depth) {
		var sh = new T.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
		var g = new T.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: false, curveSegments: 16 });
		g.translate(0, 0, -depth / 2); return g;
	}
	function geoFor(id) {
		if (GEO[id]) return GEO[id];
		var d = M.BY[id], w = d.w * PX, dp = d.d * PX, h = d.h * PY, gap = 0.12, parts = [], g;
		if (d.shape === 'box') { g = new T.BoxGeometry(w - gap, h - 0.06, dp - gap); g.translate(0, h / 2, 0); parts.push(g); }
		else if (d.shape === 'slope' || d.shape === 'inv') {
			// profile across the depth (j = 0 is the high/back row), extruded along the width
			var D = dp - gap, y0 = 0, pts = d.shape === 'slope' ? [[-D / 2, y0], [D / 2, y0], [D / 2, PY], [-D / 2 + PX, h - 0.06], [-D / 2, h - 0.06]] : [[-D / 2, 0], [-D / 2 + PX - gap, 0], [D / 2, h - PY], [D / 2, h - 0.06], [-D / 2, h - 0.06]];
			g = profileGeo(pts, w - gap); g.rotateY(-Math.PI / 2); parts.push(g);
		} else if (d.shape === 'round') { g = new T.CylinderGeometry(w / 2 - gap, w / 2 - gap, h - 0.06, 32); g.translate(0, h / 2, 0); parts.push(g); }
		else if (d.shape === 'cone') { g = new T.CylinderGeometry(2.2, w / 2 - gap, h - 0.06, 28); g.translate(0, h / 2, 0); parts.push(g); }
		else if (d.shape === 'arch') {
			var a = (d.w - 2) / 2 * PX, b = (d.h - 1) * PY, W2 = (w - gap) / 2, H = h - 0.06, ap = [[-W2, 0], [-W2, H], [W2, H], [W2, 0], [a, 0]];
			for (var i = 1; i < 24; i++) { var t = i / 24 * Math.PI; ap.push([a * Math.cos(t), b * Math.sin(t)]); }
			ap.push([-a, 0]);
			parts.push(profileGeo(ap, dp - gap));
		} else if (d.shape === 'wheel') {
			var r = h / 2; g = new T.CylinderGeometry(r - 0.2, r - 0.2, w - 0.6, 36); g.rotateZ(Math.PI / 2); g.translate(0, r, 0); parts.push(g);
			var hub = new T.CylinderGeometry(r * 0.45, r * 0.45, w + 0.4, 20); hub.rotateZ(Math.PI / 2); hub.translate(0, r, 0); parts.push(hub);
		}
		d.studCells.forEach(function (sc) {
			if (d.shape === 'round' && d.w > 1 && !(sc[0] === 0 && sc[1] === 0)) return;
			var st = new T.CylinderGeometry(2.4, 2.4, 1.7, 18), cx = d.shape === 'round' && d.w > 1 ? 0 : (sc[0] + 0.5) * PX - w / 2, cz = d.shape === 'round' && d.w > 1 ? 0 : (sc[1] + 0.5) * PX - dp / 2;
			if (d.shape === 'round' && d.w > 1) st = new T.CylinderGeometry(4.8, 4.8, 1.7, 28);
			st.translate(cx, h + 0.85, cz); parts.push(st);
		});
		parts = parts.map(function (x) { var n = x.index ? x.toNonIndexed() : x; n.clearGroups(); ['uv1', 'uv2'].forEach(function (a) { if (n.attributes[a]) n.deleteAttribute(a); }); if (!n.attributes.uv) n.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; });
		g = parts.length > 1 ? BGU.mergeGeometries(parts, false) : parts[0];
		g.computeBoundingBox(); g.computeBoundingSphere();
		GEO[id] = g; return g;
	}
	function matFor(c) {
		if (MAT[c]) return MAT[c];
		var o = { color: new T.Color(colHex(c)), roughness: 0.32, metalness: 0.0 };
		if (c === M.GLASS) { o.transparent = true; o.opacity = 0.45; o.roughness = 0.08; o.depthWrite = false; }
		if (M.COLORS[c][0] === 'Gold') { o.metalness = 0.65; o.roughness = 0.28; }
		return (MAT[c] = new T.MeshStandardMaterial(o));
	}
	function stressMat(s, floating) {
		var k = floating ? 'f' : Math.min(20, Math.round(Math.min(1.25, s) * 16));
		if (SMAT[k]) return SMAT[k];
		var col = new T.Color();
		if (floating) col.set('#d946ef');
		else { var x = Math.min(1, s); if (x < 0.5) col.set('#3b82f6').lerp(new T.Color('#eab308'), x * 2); else col.set('#eab308').lerp(new T.Color('#ef4444'), (x - 0.5) * 2); if (s >= 1) col.set('#b91c1c'); }
		return (SMAT[k] = new T.MeshStandardMaterial({ color: col, roughness: 0.5 }));
	}

	// ---------- scene ----------
	function initScene() {
		renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
		renderer.domElement.className = 'bb-canvas';
		view.insertBefore(renderer.domElement, view.firstChild);
		scene = new T.Scene(); scene.background = new T.Color('#cfe3f4');
		camera = new T.PerspectiveCamera(36, 1, 2, 8000);
		scene.add(new T.HemisphereLight(0xffffff, 0x8a8f99, 1.5));
		sun = new T.DirectionalLight(0xffffff, 2.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
		scene.add(sun); scene.add(sun.target);
		orbit = new OrbitControls(camera, renderer.domElement);
		orbit.enableDamping = false; orbit.screenSpacePanning = true; orbit.zoomToCursor = true; orbit.maxPolarAngle = Math.PI * 0.495;
		orbit.addEventListener('change', function () { dirty = true; });
		baseGroup = new T.Group(); scene.add(baseGroup);
		buildBase(); setView('iso', true);
		new ResizeObserver(resize).observe(view); resize();
		pointerSetup();
		requestAnimationFrame(loop);
	}
	function resize() { var w = Math.max(60, view.clientWidth), h = Math.max(60, view.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
	function buildBase() {
		while (baseGroup.children.length) { var c = baseGroup.children.pop(); if (c.geometry && c.geometry !== GEO._stud) c.geometry.dispose(); }
		var N = S.size, L = N * PX, col = new T.Color(colHex(S.bcol));
		var plate = new T.Mesh(new T.BoxGeometry(L, PY, L), new T.MeshStandardMaterial({ color: col, roughness: 0.6 }));
		plate.position.set(L / 2, -PY / 2, L / 2); plate.receiveShadow = true; plate.userData.base = true; baseGroup.add(plate);
		if (S.studs) {
			var sg = new T.CylinderGeometry(2.4, 2.4, 1.7, 14), im = new T.InstancedMesh(sg, plate.material, N * N), m4 = new T.Matrix4(), i = 0;
			for (var x = 0; x < N; x++) for (var z = 0; z < N; z++) { m4.makeTranslation((x + 0.5) * PX, 0.85, (z + 0.5) * PX); im.setMatrixAt(i++, m4); }
			im.receiveShadow = true; im.userData.base = true; baseGroup.add(im);
		}
		sun.position.set(L * 0.2, L * 1.6, L * 1.1); sun.target.position.set(L / 2, 0, L / 2);
		var sc = sun.shadow.camera, r = L * 0.9; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 10; sc.far = L * 4; sc.updateProjectionMatrix();
		renderer.shadowMap.enabled = S.shadow;
		pickList = null; dirty = true;
	}
	function placeMesh(m, p) {
		var sz = M.size(M.BY[p.t], p.r);
		m.position.set((p.x + sz[0] / 2) * PX, p.y * PY, (p.z + sz[1] / 2) * PX);
		m.rotation.set(0, -p.r * Math.PI / 2, 0);
	}
	function sync() {
		var seen = {}, vis = stepN == null ? null : {};
		if (vis) W.parts.forEach(function (p, i) { if (i < stepN) vis[p.u] = 1; });
		W.parts.forEach(function (p) {
			seen[p.u] = 1;
			var m = meshes[p.u];
			if (!m || m.userData.t !== p.t) { if (m) scene.remove(m); m = new T.Mesh(geoFor(p.t), matFor(p.c)); m.castShadow = true; m.receiveShadow = true; m.userData.u = p.u; m.userData.t = p.t; scene.add(m); meshes[p.u] = m; }
			placeMesh(m, p);
			var mat = matFor(p.c);
			if (S.stress && analysis) { var fl = analysis.floating.indexOf(p.u) >= 0; mat = stressMat(analysis.stress[p.u] || 0, fl); }
			if (vis && W.parts[stepN - 1] === p) mat = highlightMat(p.c);
			m.material = mat; m.visible = !vis || !!vis[p.u];
		});
		Object.keys(meshes).forEach(function (u) { if (!seen[u]) { scene.remove(meshes[u]); delete meshes[u]; } });
		pickList = null; dirty = true;
	}
	var HMAT = {};
	function highlightMat(c) { if (HMAT[c]) return HMAT[c]; var m = matFor(c).clone(); m.emissive = new T.Color('#ffd166'); m.emissiveIntensity = 0.45; return (HMAT[c] = m); }

	// ---------- ghost ----------
	function rebuildGhost() {
		if (!T) return;
		if (ghost) scene.remove(ghost);
		ghost = new T.Mesh(geoFor(S.part), new T.MeshStandardMaterial({ color: new T.Color(colHex(S.color)), transparent: true, opacity: 0.55, depthWrite: false, emissive: new T.Color('#ffffff'), emissiveIntensity: 0.15 }));
		ghost.visible = false; ghost.renderOrder = 2; scene.add(ghost); dirty = true;
		status(S.tool === 'build' ? 'Click to add a ' + M.BY[S.part].name + '. Shift-click removes. R turns it.' : $('bb-status').textContent);
	}
	function updateGhostMat() { if (ghost) { ghost.material.color.set(colHex(S.color)); dirty = true; } }

	// ---------- pointer: where would the brick go? ----------
	var ray, ndc, hover = null;
	function picks() {
		if (pickList) return pickList;
		pickList = baseGroup.children.slice();
		W.parts.forEach(function (p) { var m = meshes[p.u]; if (m && m.visible) pickList.push(m); });
		return pickList;
	}
	function hitAt(ev) {
		var r = renderer.domElement.getBoundingClientRect();
		ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
		ray.setFromCamera(ndc, camera);
		var h = ray.intersectObjects(picks(), false)[0]; if (!h) return null;
		var n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new T.Vector3(0, 1, 0), pt = h.point;
		if (h.object.userData.base) return { cx: Math.floor(pt.x / PX), cz: Math.floor(pt.z / PX), y: 0, u: 0, n: new T.Vector3(0, 1, 0) };
		var p = W.byU[h.object.userData.u], d = M.BY[p.t], top = (p.y + d.h) * PY;
		if (n.y > 0.5 || pt.y >= top - 0.05) return { cx: Math.floor(pt.x / PX), cz: Math.floor(pt.z / PX), y: Math.floor((pt.y + 0.3) / PY), u: p.u, n: new T.Vector3(0, 1, 0) };
		if (n.y < -0.5) return { cx: Math.floor(pt.x / PX), cz: Math.floor(pt.z / PX), y: Math.round(pt.y / PY), under: true, u: p.u, n: n };
		return { cx: Math.floor((pt.x + n.x * 4) / PX), cz: Math.floor((pt.z + n.z * 4) / PX), y: Math.max(0, Math.floor((pt.y - 0.05) / PY)), u: p.u, n: n, side: true };
	}
	function spot(h) {
		var d = M.BY[S.part], sz = M.size(d, S.rot), x0, z0;
		x0 = h.side && h.n.x > 0.5 ? h.cx : h.side && h.n.x < -0.5 ? h.cx - sz[0] + 1 : h.cx - Math.floor((sz[0] - 1) / 2);
		z0 = h.side && h.n.z > 0.5 ? h.cz : h.side && h.n.z < -0.5 ? h.cz - sz[1] + 1 : h.cz - Math.floor((sz[1] - 1) / 2);
		x0 = Math.max(0, Math.min(W.size - sz[0], x0)); z0 = Math.max(0, Math.min(W.size - sz[1], z0));
		var want = h.under ? h.y - d.h : h.side ? h.y - Math.max(0, d.h - 1) : h.y;
		if (h.side) { var y1 = W.placeY(S.part, S.rot, x0, z0, h.y); if (y1 === h.y) return { x: x0, z: z0, y: y1 }; }
		return { x: x0, z: z0, y: W.placeY(S.part, S.rot, x0, z0, want) };
	}
	function showGhost(ev) {
		if (!ghost) return;
		if (S.tool !== 'build' || stepN != null || !S.ghost || ev.pointerType === 'touch') { if (ghost.visible) { ghost.visible = false; dirty = true; } hover = null; return; }
		var h = hitAt(ev); if (!h) { ghost.visible = false; dirty = true; hover = null; return; }
		var s = spot(h); hover = s;
		placeMesh(ghost, { t: S.part, x: s.x, y: s.y, z: s.z, r: S.rot }); ghost.visible = true; dirty = true;
		var hh = (s.y * PY / 10).toFixed(1);
		$('bb-chip').textContent = M.BY[S.part].name + ' · stud ' + s.x + ', ' + s.z + ' · ' + hh + ' cm up';
	}
	function clickAt(ev) {
		var h = hitAt(ev);
		if (stepN != null) { toast('Showing building steps. Press "Show all" to build again.'); return; }
		if (S.tool === 'build' && !ev.shiftKey) {
			if (!h) return;
			var s = spot(h);
			if (!W.fits({ u: -1, t: S.part, x: s.x, y: s.y, z: s.z, r: S.rot })) return toast('That spot is taken.');
			W.add({ t: S.part, x: s.x, y: s.y, z: s.z, r: S.rot, c: S.color });
			if (s.y > 300) toast('That is very high!');
			commit(); showGhost(ev); return;
		}
		if (!h || !h.u) return;
		var q = W.byU[h.u];
		if (fixed[q.u] && S.tool !== 'pick' && S.tool !== 'load') return toast('That part belongs to the challenge and cannot be changed.');
		if (S.tool === 'remove' || (S.tool === 'build' && ev.shiftKey)) { W.remove(q.u); delete loads[q.u]; if (testU === q.u) testU = 0; commit(); return; }
		if (S.tool === 'paint') { if (q.c === S.color) return; q.c = S.color; commit(); return; }
		if (S.tool === 'pick') { S.part = q.t; S.color = q.c; S.rot = q.r; S.cat = M.BY[q.t].cat; saveS(); drawParts(); setTool('build'); rebuildGhost(); toast('Picked ' + partLabel(q)); return; }
		if (S.tool === 'load') { testU = q.u; if (loads[q.u]) delete loads[q.u]; else loads[q.u] = S.lw; commit(); return; }
	}
	function pointerSetup() {
		ray = new T.Raycaster(); ndc = new T.Vector2();
		var el = renderer.domElement, down = null;
		el.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, b: e.button, t: Date.now(), touches: 1 }; view.focus({ preventScroll: true }); });
		el.addEventListener('pointermove', function (e) { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true; if (!down) showGhost(e); else if (!down.moved) showGhost(e); });
		el.addEventListener('pointerleave', function () { if (ghost) { ghost.visible = false; dirty = true; } $('bb-chip').textContent = ''; });
		el.addEventListener('pointerup', function (e) {
			var d = down; down = null; if (!d || d.moved || d.b !== 0) return;
			if (e.pointerType === 'touch' && Date.now() - d.t > 650) return;
			clickAt(e);
		});
		el.addEventListener('pointercancel', function () { down = null; });
		el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
	}

	// ---------- camera ----------
	function bounds() {
		var b = new T.Box3();
		W.parts.forEach(function (p) { var d = M.BY[p.t], sz = M.size(d, p.r); b.expandByPoint(new T.Vector3(p.x * PX, p.y * PY, p.z * PX)); b.expandByPoint(new T.Vector3((p.x + sz[0]) * PX, (p.y + d.h) * PY, (p.z + sz[1]) * PX)); });
		if (b.isEmpty()) b.set(new T.Vector3(0, 0, 0), new T.Vector3(S.size * PX, 40, S.size * PX));
		return b;
	}
	function setView(v, instant) {
		var b = v === 'fit' ? bounds() : (function () { var bb = bounds(), L = S.size * PX; bb.expandByPoint(new T.Vector3(0, 0, 0)); bb.expandByPoint(new T.Vector3(L, 0, L)); return bb; })();
		var c = b.getCenter(new T.Vector3()), r = b.getSize(new T.Vector3()).length() / 2, dist = r / Math.sin(camera.fov * Math.PI / 360) * 0.95;
		var dir = v === 'top' ? new T.Vector3(0, 1, 0.0001) : v === 'front' ? new T.Vector3(0, 0.12, 1) : v === 'side' ? new T.Vector3(1, 0.12, 0) : new T.Vector3(0.75, 0.75, 1.05);
		if (v === 'fit') dir = camera.position.clone().sub(orbit.target).normalize();
		camera.position.copy(c).add(dir.normalize().multiplyScalar(Math.max(60, dist)));
		orbit.target.copy(c); orbit.update(); dirty = true;
	}

	// ---------- labels for weights ----------
	function drawLabels() {
		var box = $('bb-labels'), html = '', w = view.clientWidth, h = view.clientHeight, v = new T.Vector3();
		Object.keys(loads).forEach(function (u) {
			var p = W.byU[u]; if (!p) return; var d = M.BY[p.t], sz = M.size(d, p.r);
			if (stepN != null && W.parts.indexOf(p) >= stepN) return;
			v.set((p.x + sz[0] / 2) * PX, (p.y + d.h) * PY + 3, (p.z + sz[1] / 2) * PX).project(camera);
			if (v.z > 1) return;
			html += '<span class="bb-wt" style="left:' + ((v.x + 1) / 2 * w).toFixed(0) + 'px;top:' + ((1 - v.y) / 2 * h).toFixed(0) + 'px">⚖ ' + esc(M.fmtG(loads[u])) + '</span>';
		});
		if (testU && W.byU[testU] && !loads[testU]) {
			var p = W.byU[testU], d = M.BY[p.t], sz = M.size(d, p.r);
			v.set((p.x + sz[0] / 2) * PX, (p.y + d.h) * PY + 3, (p.z + sz[1] / 2) * PX).project(camera);
			if (v.z <= 1) html += '<span class="bb-wt bb-wt--t" style="left:' + ((v.x + 1) / 2 * w).toFixed(0) + 'px;top:' + ((1 - v.y) / 2 * h).toFixed(0) + 'px">test here</span>';
		}
		if (box._h !== html) { box.innerHTML = html; box._h = html; }
	}
	var stepPulse = 0;
	function loop(t) {
		requestAnimationFrame(loop);
		if (document.hidden) return;
		if (stepN != null && W.parts[stepN - 1]) { var m = meshes[W.parts[stepN - 1].u]; if (m) { m.material.emissiveIntensity = 0.25 + 0.25 * Math.sin(t / 220); dirty = true; } }
		if (!dirty) return; dirty = false;
		renderer.render(scene, camera); drawLabels();
	}

	// ---------- refresh everything after a change ----------
	function opts() { return { anchored: S.anchored, clutch: M.CLUTCH[S.grip], loads: loads }; }
	function refresh() {
		analysis = M.analyze(W, opts());
		if (T) sync();
		$('bb-empty').hidden = W.parts.length > 0 || !T;
		drawResults(); drawSteps(); drawBom(); drawChallenge();
		root.querySelector('[data-act=undo]').disabled = !hist.length; root.querySelector('[data-act=redo]').disabled = !fut.length;
	}
	function drawResults() {
		var a = analysis, st = M.stats(W), n = W.parts.length, wt = 0; Object.keys(loads).forEach(function (u) { wt += loads[u]; });
		var weak = a.weakest && W.byU[a.weakest], pct = a.max === Infinity ? '∞' : Math.round(a.max * 100) + '%';
		var why = { overhang: 'sticks out too far for its studs', bending: 'bends too much over its gap', hanging: 'hangs from its studs' };
		var verdict = !n ? '' : a.tips ? '<div class="bb-bad">⚠ The whole build tips over (its weight is not over where it touches the ground).</div>'
			: a.max >= 1 ? '<div class="bb-bad">⚠ Something breaks: ' + esc(partLabel(weak)) + ' ' + esc(why[a.why[a.weakest]] || '') + ' (' + pct + ').</div>'
			: a.floating.length ? '' : '<div class="bb-good">✓ It stands' + (wt ? ' and holds its weights' : '') + '.</div>';
		$('bb-res').innerHTML = (n ? '<table class="bb-kv">' +
			'<tr><th>Parts</th><td>' + n + '</td></tr>' +
			'<tr><th>Separate pieces</th><td>' + a.groups + (a.groups > 1 ? ' <span class="bb-dim">(not joined to each other)</span>' : '') + '</td></tr>' +
			(a.floating.length ? '<tr><th>Floating</th><td class="bb-badt">' + a.floating.length + ' part' + (a.floating.length > 1 ? 's' : '') + ' not joined to the ground (pink)</td></tr>' : '') +
			'<tr><th>Size</th><td>' + st.wide + ' x ' + st.deep + ' studs, ' + (st.heightMm / 10).toFixed(1) + ' cm tall</td></tr>' +
			'<tr><th>Weight</th><td>' + M.fmtG(st.mass) + ' of bricks' + (wt ? ' + ' + M.fmtG(wt) + ' on top' : '') + '</td></tr>' +
			(weak ? '<tr><th>Hardest working</th><td>' + esc(partLabel(weak)) + ': ' + pct + '</td></tr>' : '') +
			'</table>' : '<p class="bb-small">Add some bricks to test them.</p>') + verdict;
		var tp = testU && W.byU[testU];
		$('bb-btest').innerHTML = tp ? 'Testing: <b>' + esc(partLabel(tp)) + '</b>' + (loads[testU] ? ' (carrying ' + esc(M.fmtG(loads[testU])) + ')' : '') : 'Click a brick with the ⚖ Weight tool, then find out how much it can hold.';
	}
	function breakTest() {
		var u = testU;
		if (!u || !W.byU[u]) {
			// pick the highest part near the middle of the build
			var b = M.stats(W); if (!W.parts.length) return toast('Build something first.');
			var cx = 0, cz = 0; W.parts.forEach(function (p) { cx += p.x; cz += p.z; }); cx /= W.parts.length; cz /= W.parts.length;
			var best = null; W.parts.forEach(function (p) { var s = (p.y + M.BY[p.t].h) * 2 - Math.hypot(p.x - cx, p.z - cz); if (!best || s > best[0]) best = [s, p.u]; });
			u = testU = best[1];
		}
		var L = {}; for (var k in loads) if (+k !== u) L[k] = loads[k];
		var r = M.breakLoad(W, u, { anchored: S.anchored, clutch: M.CLUTCH[S.grip], loads: L });
		var p = W.byU[u], wk = r.weakest && W.byU[r.weakest], why = { overhang: 'it sticks out too far for its studs', bending: 'it bends too much', hanging: 'it pulls off its studs', 'tips over': 'the whole build tips over' };
		var msg = r.g === 0 ? 'It already fails without any extra weight.' : !isFinite(r.g) ? 'It holds more than 50 kg here (in this model). Arches and parts resting flat on others mostly get squeezed, not bent.' : 'It can hold about <b>' + esc(M.fmtG(r.g)) + '</b> on the ' + esc(partLabel(p)) + '.';
		if (wk || r.why === 'tips over') msg += ' Then ' + (r.why === 'tips over' ? 'the whole build tips over.' : 'the ' + esc(partLabel(wk)) + ' gives up: ' + esc(why[r.why] || r.why) + '.');
		$('bb-bres').innerHTML = msg;
		drawResults(); dirty = true;
	}

	// ---------- steps ----------
	var playT = null;
	function drawSteps() {
		var n = W.parts.length, r = $('bb-step'); r.max = n; r.value = stepN == null ? n : stepN;
		var now = $('bb-stepnow');
		if (stepN == null) now.innerHTML = n ? '<b>' + n + ' steps.</b> Press Next or move the slider to build it one part at a time.' : 'No parts yet.';
		else if (!stepN) now.innerHTML = 'Step 0 of ' + n + ': an empty baseplate.';
		else { var p = W.parts[stepN - 1], sz = M.size(M.BY[p.t], p.r); now.innerHTML = '<span class="bb-swd" style="background:' + colHex(p.c) + '"></span><b>Step ' + stepN + ' of ' + n + ':</b> add a ' + esc(partLabel(p)) + (p.y ? ', ' + (p.y % 3 === 0 ? (p.y / 3) + ' brick' + (p.y / 3 === 1 ? '' : 's') : p.y + ' plates') + ' up' : ' on the baseplate') + '.'; }
	}
	function setStep(v) {
		stepN = v == null || v >= W.parts.length ? (v == null ? null : W.parts.length) : Math.max(0, v);
		if (v == null) stepN = null;
		if (stepN != null && ghost) ghost.visible = false;
		root.classList.toggle('bb-stepping', stepN != null);
		sync(); drawSteps();
	}
	function play() {
		if (playT) { clearInterval(playT); playT = null; $('bb-splay').textContent = '▶ Play'; return; }
		if (stepN == null || stepN >= W.parts.length) setStep(0);
		$('bb-splay').textContent = '❚❚ Pause';
		playT = setInterval(function () { if (stepN >= W.parts.length) { play(); return; } setStep(stepN + 1); }, Math.max(120, Math.min(700, 12000 / Math.max(1, W.parts.length))));
	}

	// ---------- parts list ----------
	function drawBom() {
		var b = M.bom(W.list()), st = M.stats(W);
		$('bb-sum').innerHTML = W.parts.length ? '<b>' + W.parts.length + ' parts</b>, ' + b.length + ' different kinds. ' + (st.heightMm / 10).toFixed(1) + ' cm tall.' : 'No parts yet.';
		$('bb-bom').innerHTML = b.length ? '<table class="bb-bomt"><thead><tr><th></th><th>Part</th><th>Colour</th><th>How many</th></tr></thead><tbody>' + b.map(function (r) { return '<tr><td><span class="bb-swd" style="background:' + colHex(r.c) + '"></span></td><td>' + esc(r.name) + '</td><td>' + esc(r.color) + '</td><td>' + r.n + '</td></tr>'; }).join('') + '</tbody></table>' : '';
	}
	function bomText(sep) { return ['Part', 'Colour', 'How many'].join(sep) + '\n' + M.bom(W.list()).map(function (r) { return [r.name, r.color, r.n].join(sep); }).join('\n'); }

	// ---------- challenges ----------
	function drawChallenge() {
		var box = $('bb-chal');
		if (!chal) { box.innerHTML = ''; return; }
		box.innerHTML = '<div class="bb-cbox"><b>' + esc(chal.emoji + ' ' + chal.name.replace('Challenge: ', '')) + '</b><p>' + esc(chal.desc) + '</p><div class="bb-btns"><button type="button" class="bb-b bb-b--pri" id="bb-ccheck">Check my build</button> <button type="button" class="bb-b" id="bb-cquit">Leave the challenge</button></div><div id="bb-cres" aria-live="polite"></div></div>';
		$('bb-ccheck').onclick = checkChallenge;
		$('bb-cquit').onclick = function () { chal = null; fixed = {}; lastSnap = snap(); persist(); refresh(); };
	}
	function checkChallenge() {
		var c = chal.challenge, out = $('bb-cres'), added = W.parts.filter(function (p) { return !fixed[p.u]; });
		function say(okk, msg) { out.innerHTML = '<p class="' + (okk ? 'bb-good' : 'bb-bad') + '">' + msg + '</p>'; if (okk) toast('🎉 Challenge done!', 4000); }
		if (!added.length) return say(false, 'Add some parts first.');
		var gs = M.groups(W);
		if (c.kind === 'span') {
			var left = W.parts.filter(function (p) { return fixed[p.u] && p.x + M.size(M.BY[p.t], p.r)[0] - 1 <= c.from && p.x <= c.from; }), right = W.parts.filter(function (p) { return fixed[p.u] && p.x >= c.to; });
			var joined = gs.some(function (g) { return g.parts.some(function (u) { return left.some(function (p) { return p.u === u; }); }) && g.parts.some(function (u) { return right.some(function (p) { return p.u === u; }); }); });
			if (!joined) return say(false, 'The bridge does not join the two banks yet. It must touch the grey stone on both sides.');
			var mid = null; added.forEach(function (p) { var sz = M.size(M.BY[p.t], p.r); if (c.mid[0] >= p.x && c.mid[0] < p.x + sz[0] && c.mid[1] >= p.z && c.mid[1] < p.z + sz[1] && (!mid || p.y > mid.y)) mid = p; });
			if (!mid) return say(false, 'Put the bridge deck over the middle of the river (stud ' + c.mid[0] + ', ' + c.mid[1] + ').');
			var r = M.breakLoad(W, mid.u, opts());
			testU = mid.u;
			return say(r.g >= c.need, r.g >= c.need ? 'Yes! Your bridge holds ' + esc(M.fmtG(r.g)) + ' in the middle (it needed ' + M.fmtG(c.need) + ').' : 'It joins the banks, but holds only ' + esc(M.fmtG(r.g)) + ' in the middle. It needs ' + M.fmtG(c.need) + '. Tip: a deeper deck (plates stacked on top of each other) bends much less.');
		}
		if (c.kind === 'reach') {
			if (added.some(function (p) { return p.y === 0; })) return say(false, 'No propping it up from the ground: only the wall may hold your arm.');
			var wallG = gs.filter(function (g) { return g.parts.some(function (u) { return fixed[u] && W.byU[u].t !== 't1x2'; }); })[0];
			var far = null; added.forEach(function (p) { if (wallG && wallG.parts.indexOf(p.u) < 0) return; var e = p.x + M.size(M.BY[p.t], p.r)[0] - 1; if (!far || e > far[0]) far = [e, p]; });
			if (!far) return say(false, 'Your parts are not joined to the wall.');
			if (far[0] < c.x) return say(false, 'It reaches stud ' + far[0] + '. Keep going until it passes the red line at stud ' + c.x + '.');
			var r2 = M.breakLoad(W, far[1].u, opts()); testU = far[1].u;
			return say(r2.g >= c.need, r2.g >= c.need ? 'Yes! It reaches past the line and holds ' + esc(M.fmtG(r2.g)) + ' at the end.' : 'It reaches the line, but its end holds only ' + esc(M.fmtG(r2.g)) + ' (needs ' + M.fmtG(c.need) + '). Tip: weight on the back of the wall side, or more studs where it joins, helps.');
		}
	}

	// ---------- examples dialog ----------
	var thumbs = {}, thumbR = null;
	function thumbFor(e) {
		if (thumbs[e.id] || !T) return thumbs[e.id] || '';
		try {
			if (!thumbR) { thumbR = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); thumbR.setSize(240, 170); thumbR.setPixelRatio(1); }
			var sc = new T.Scene(); sc.background = new T.Color('#dbe9f6'); sc.add(new T.HemisphereLight(0xffffff, 0x8a8f99, 1.6)); var dl = new T.DirectionalLight(0xffffff, 1.8); dl.position.set(200, 400, 300); sc.add(dl);
			var m = e.make(), b = new T.Box3();
			m.parts.forEach(function (p) { var me = new T.Mesh(geoFor(p.t), matFor(p.c)); placeMesh(me, p); sc.add(me); b.expandByObject(me); });
			var cam = new T.PerspectiveCamera(32, 240 / 170, 1, 5000), c = b.getCenter(new T.Vector3()), r = b.getSize(new T.Vector3()).length() / 2;
			cam.position.copy(c).add(new T.Vector3(0.8, 0.62, 1).normalize().multiplyScalar(r / Math.sin(16 * Math.PI / 180) * 0.9)); cam.lookAt(c);
			thumbR.render(sc, cam); thumbs[e.id] = thumbR.domElement.toDataURL('image/png');
		} catch (er) { thumbs[e.id] = ''; }
		return thumbs[e.id];
	}
	function dialog(html, cls) {
		var w = $('bb-dlgw'), d = $('bb-dlg'); d.className = 'bb-dlg ' + (cls || ''); d.innerHTML = '<button type="button" class="bb-x" aria-label="Close" data-close>✕</button>' + html; w.hidden = false;
		var f = d.querySelector('button:not([data-close]), input'); (f || d.querySelector('[data-close]')).focus();
	}
	function closeDlg() { $('bb-dlgw').hidden = true; view.focus({ preventScroll: true }); }
	function examplesDlg(cat) {
		cat = cat || examplesDlg.cat || 'kids'; examplesDlg.cat = cat;
		var tabs = [['kids', 'For kids'], ['eng', 'Bridges & engineering'], ['chal', 'Challenges']];
		dialog('<h3>Example builds</h3><div class="bb-etabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" class="bb-cat" role="tab" data-ecat="' + t[0] + '" aria-selected="' + (t[0] === cat) + '">' + t[1] + '</button>'; }).join('') + '</div><div class="bb-egrid" id="bb-egrid">' +
			EX.filter(function (e) { return e.cat === cat; }).map(function (e) { var n = e.make().parts.length; return '<button type="button" class="bb-ex" data-ex="' + e.id + '"><span class="bb-exi"><img alt="" data-thumb="' + e.id + '" width="240" height="170"></span><b>' + esc(e.emoji + ' ' + e.name) + '</b><span class="bb-small">' + esc(e.desc) + '</span><span class="bb-dim">' + n + ' parts</span></button>'; }).join('') + '</div>', 'bb-dlg--wide');
		var imgs = Array.prototype.slice.call($('bb-egrid').querySelectorAll('img[data-thumb]')), i = 0;
		(function next() { if (i >= imgs.length || $('bb-dlgw').hidden) return; var im = imgs[i++], e = EX.filter(function (x) { return x.id === im.dataset.thumb; })[0]; im.src = thumbFor(e) || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; setTimeout(next, 10); })();
	}
	function loadExample(id) {
		var e = EX.filter(function (x) { return x.id === id; })[0]; if (!e) return;
		var m = e.make();
		hist.push(lastSnap); fut = [];
		if (S.size < 32) setSize(32, true);
		W.load(m.parts); loads = {}; fixed = {}; testU = 0;
		(m.loads || []).forEach(function (x) { if (W.parts[x[0]]) loads[W.parts[x[0]].u] = x[1]; });
		if (m.test != null && W.parts[m.test]) testU = W.parts[m.test].u;
		if (m.fixed) W.parts.forEach(function (p) { fixed[p.u] = 1; });
		chal = e.challenge ? e : null;
		S.anchored = m.anchored !== false; S.grip = m.grip || 'normal'; syncControls();
		$('bb-bres').textContent = '';
		stepN = null; root.classList.remove('bb-stepping');
		lastSnap = snap(); persist(); refresh(); closeDlg();
		if (T) setView('fit');
		if (e.cat === 'eng' || e.cat === 'chal') { tab('test'); if (e.cat === 'eng') { S.stress = true; syncControls(); refresh(); } }
		toast(e.emoji + ' ' + e.name + ' (' + W.parts.length + ' parts)');
	}

	// ---------- files / links ----------
	function fileObj() { return { app: 'mes-brick-builder', v: 1, size: S.size, parts: W.list(), loads: loadList(), anchored: S.anchored, grip: S.grip }; }
	function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
	function openObj(o) {
		if (!o || !Array.isArray(o.parts)) throw new Error('not a Brick Builder file');
		var list = M.decode(M.encode(o.parts.filter(function (p) { return p && M.BY[p.t]; })));
		hist.push(lastSnap); fut = [];
		if ([16, 32, 48].indexOf(o.size) >= 0) setSize(o.size, true);
		W.load(list); loads = {}; fixed = {}; chal = null; testU = 0;
		(o.loads || []).forEach(function (x) { if (W.parts[x[0]] && +x[1] > 0) loads[W.parts[x[0]].u] = Math.min(100000, +x[1]); });
		if (o.anchored != null) S.anchored = !!o.anchored; if (M.CLUTCH[o.grip] != null) S.grip = o.grip; syncControls();
		lastSnap = snap(); persist(); refresh(); if (T) setView('fit');
	}
	function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
	function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
	function linkCode() {
		var txt = M.encode(W.list()) + '|' + S.size + '|' + loadList().map(function (x) { return x.join(':'); }).join(',') + '|' + (S.anchored ? 1 : 0) + { normal: 'n', strong: 's', none: 'o' }[S.grip];
		var raw = new TextEncoder().encode(txt);
		if (typeof CompressionStream === 'undefined') return Promise.resolve('p' + b64u(raw));
		var cs = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		return new Response(cs).arrayBuffer().then(function (ab) { return 'z' + b64u(new Uint8Array(ab)); });
	}
	function readLink(code) {
		var bytes = unb64u(code.slice(1));
		var p = code.charAt(0) === 'z' ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : Promise.resolve(new TextDecoder().decode(bytes));
		return p.then(function (txt) {
			var f = txt.split('|'), list = M.decode(f[0]); if (!list) throw new Error('bad link');
			var o = { parts: list, size: +f[1] || 32, loads: (f[2] || '').split(',').filter(Boolean).map(function (x) { return x.split(':').map(Number); }) };
			if (f[3]) { o.anchored = f[3].charAt(0) === '1'; o.grip = { n: 'normal', s: 'strong', o: 'none' }[f[3].charAt(1)] || 'normal'; }
			return o;
		});
	}
	function share() {
		if (!W.parts.length) return toast('Build something first.');
		linkCode().then(function (code) {
			var url = location.origin + location.pathname + '#b=' + code;
			if (url.length > 60000) return toast('This build is too big for a link. Use Save instead.', 4000);
			var done = function () { toast('Link copied (' + W.parts.length + ' parts inside it).'); };
			if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); });
			else prompt('Copy this link:', url);
		});
	}
	function setSize(n, quiet) {
		var too = W.parts.some(function (p) { var sz = M.size(M.BY[p.t], p.r); return p.x + sz[0] > n || p.z + sz[1] > n; });
		if (too && !quiet) { toast('Some parts are outside a ' + n + ' x ' + n + ' baseplate. Remove them first.', 4000); $('bb-size').value = S.size; return; }
		S.size = n; saveS(); var list = W.list(), L = loadList(), F = snap().f; W = new M.World(n); W.load(list);
		loads = {}; L.forEach(function (x) { if (W.parts[x[0]]) loads[W.parts[x[0]].u] = x[1]; }); fixed = {}; if (F) F.forEach(function (v, i) { if (v && W.parts[i]) fixed[W.parts[i].u] = 1; });
		if (T) { buildBase(); if (!quiet) setView('iso'); }
		if (!quiet) { lastSnap = snap(); persist(); refresh(); }
	}

	// ---------- picture / STL ----------
	function shot() {
		if (!T) return; ghost && (ghost.visible = false);
		renderer.render(scene, camera);
		renderer.domElement.toBlob(function (b) { if (b) download('brick-build.png', b); });
	}
	function stl() {
		if (!W.parts.length) return toast('Build something first.');
		imp('three/addons/exporters/STLExporter.js').then(function (mod) {
			var g = new T.Group(); W.parts.forEach(function (p) { var m = new T.Mesh(geoFor(p.t)); placeMesh(m, p); g.add(m); });
			g.updateMatrixWorld(true);
			var data = new mod.STLExporter().parse(g, { binary: true });
			download('brick-build.stl', new Blob([data], { type: 'model/stl' })); toast('STL saved (millimetres).');
		}).catch(function (e) { toast('Could not load the STL exporter: ' + e.message); });
	}

	// ---------- fill window / full screen ----------
	function fill(on) {
		on = on == null ? !root.classList.contains('bb-fill') : on;
		root.classList.toggle('bb-fill', on); document.documentElement.classList.toggle('bb-fill-on', on);
		$('bb-fillbtn').setAttribute('aria-pressed', on ? 'true' : 'false'); $('bb-fillbtn').textContent = on ? '✕ Close' : '⤢ Fill window';
		setTimeout(resize, 30);
	}
	function full() {
		var fe = document.fullscreenElement || document.webkitFullscreenElement;
		if (fe) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
		var rq = root.requestFullscreen || root.webkitRequestFullscreen; if (!rq) return fill(true);
		fill(true); rq.call(root);
	}
	document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && root.classList.contains('bb-fill') && fill._fs) fill(false); fill._fs = !!document.fullscreenElement; setTimeout(resize, 50); });

	// ---------- help ----------
	function help() {
		dialog('<h3>How to use the Brick Builder</h3><ul class="bb-help">' +
			'<li><b>Build:</b> pick a part and colour, then click. Bricks drop onto what is under them; click the side of a brick to build next to it, or under an overhang to hang a part below it.</li>' +
			'<li><b>Look around:</b> drag to turn, right-drag (or two fingers) to move, scroll or pinch to zoom. Views: 3D, Top, Front, Side, Fit.</li>' +
			'<li><b>Strength:</b> turn on stress colours, put weights on with ⚖ Weight and press Find the breaking load.</li>' +
			'<li><b>Steps:</b> the Steps tab shows the build one part at a time, like instructions.</li></ul>' +
			'<table class="bb-kv"><tr><th>R</th><td>Turn the brick</td></tr><tr><th>B P X I W</th><td>Build, Paint, Remove, Pick, Weight</td></tr><tr><th>Shift-click</th><td>Remove a brick</td></tr><tr><th>Ctrl+Z / Ctrl+Y</th><td>Undo / redo</td></tr><tr><th>[ ]</th><td>Previous / next colour</td></tr><tr><th>0 7 1 3 .</th><td>3D, top, front, side, fit</td></tr><tr><th>F / Shift+F</th><td>Fill window / full screen</td></tr><tr><th>← →</th><td>Previous / next step (Steps tab)</td></tr></table>');
	}

	// ---------- controls ----------
	function tab(t) {
		S.tab = t; saveS();
		Array.prototype.forEach.call(root.querySelectorAll('.bb-tab'), function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
		['test', 'steps', 'list', 'set'].forEach(function (x) { $('bb-tp-' + x).hidden = x !== t; });
		if (t !== 'steps' && stepN != null) { if (playT) play(); setStep(null); }
	}
	function syncControls() {
		$('bb-stress').checked = S.stress; $('bb-anch').checked = S.anchored; $('bb-grip').value = S.grip; $('bb-lw').value = String(S.lw);
		$('bb-size').value = String(S.size); $('bb-bcol').value = String(S.bcol); $('bb-shadow').checked = S.shadow; $('bb-ghost').checked = S.ghost; $('bb-studs').checked = S.studs;
		saveS();
	}
	function wire() {
		root.querySelector('.bb-bar').addEventListener('click', function (e) {
			var b = e.target.closest('[data-act],[data-tool]'); if (!b) return;
			if (b.dataset.tool) return setTool(b.dataset.tool);
			act(b.dataset.act);
		});
		$('bb-empty').addEventListener('click', function (e) { if (e.target.closest('[data-act=examples]')) examplesDlg(); });
		root.querySelector('.bb-vtools').addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (b && T) setView(b.dataset.view); });
		root.querySelector('.bb-tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) tab(b.dataset.tab); });
		$('bb-stress').onchange = function () { S.stress = this.checked; saveS(); sync(); };
		$('bb-anch').onchange = function () { S.anchored = this.checked; saveS(); refresh(); };
		$('bb-grip').onchange = function () { S.grip = this.value; saveS(); refresh(); };
		$('bb-lw').onchange = function () { S.lw = +this.value; saveS(); if (S.tool === 'load') setTool('load'); };
		$('bb-break').onclick = breakTest;
		$('bb-clearw').onclick = function () { if (!Object.keys(loads).length) return; loads = {}; commit(); };
		$('bb-step').oninput = function () { setStep(+this.value); };
		$('bb-snext').onclick = function () { setStep(stepN == null ? 1 : stepN + 1); };
		$('bb-sprev').onclick = function () { setStep(stepN == null ? W.parts.length - 1 : stepN - 1); };
		$('bb-splay').onclick = play;
		$('bb-sall').onclick = function () { if (playT) play(); setStep(null); };
		$('bb-ssort').onclick = function () { if (W.parts.length < 2) return; var s0 = snap(), order = M.sortSteps(W.parts.map(function (p, i) { return { p: p, i: i, y: p.y }; })); hist.push(lastSnap); fut = []; var nl = order.map(function (o) { return s0.p[o.i]; }), nlL = []; order.forEach(function (o, j) { var L = s0.l.filter(function (x) { return x[0] === o.i; })[0]; if (L) nlL.push([j, L[1]]); }); var f = s0.f ? order.map(function (o) { return s0.f[o.i]; }) : null; restore({ p: nl, l: nlL, f: f }); lastSnap = snap(); persist(); refresh(); toast('Steps now go from the bottom up.'); };
		$('bb-bomcopy').onclick = function () { var t = bomText('\t'); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Parts list copied.'); }, function () { prompt('Copy:', t); }); };
		$('bb-bomcsv').onclick = function () { download('brick-parts-list.csv', new Blob([bomText(',')], { type: 'text/csv' })); };
		$('bb-size').onchange = function () { setSize(+this.value); };
		$('bb-bcol').onchange = function () { S.bcol = +this.value; saveS(); if (T) buildBase(); };
		$('bb-shadow').onchange = function () { S.shadow = this.checked; saveS(); if (T) { renderer.shadowMap.enabled = S.shadow; scene.traverse(function (o) { if (o.material) o.material.needsUpdate = true; }); dirty = true; } };
		$('bb-ghost').onchange = function () { S.ghost = this.checked; saveS(); };
		$('bb-studs').onchange = function () { S.studs = this.checked; saveS(); if (T) buildBase(); };
		$('bb-file').onchange = function () { var f = this.files[0]; this.value = ''; if (!f) return; f.text().then(function (t) { openObj(JSON.parse(t)); toast('Opened ' + f.name); }).catch(function (e) { toast('Could not open it: ' + e.message, 4000); }); };
		$('bb-dlgw').addEventListener('click', function (e) {
			if (e.target === this || e.target.closest('[data-close]')) return closeDlg();
			var t = e.target.closest('[data-ecat]'); if (t) return examplesDlg(t.dataset.ecat);
			var x = e.target.closest('[data-ex]'); if (x) loadExample(x.dataset.ex);
		});
		document.addEventListener('keydown', function (e) {
			if (!$('bb-dlgw').hidden) { if (e.key === 'Escape') closeDlg(); return; }
			var tg = e.target; if (tg && (tg.tagName === 'INPUT' && tg.type !== 'checkbox' && tg.type !== 'range' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
			var inside = root.contains(tg) || root.classList.contains('bb-fill') || tg === document.body;
			if (!inside) return;
			var k = e.key, ctrl = e.ctrlKey || e.metaKey;
			if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
			if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
			if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); act('save'); return; }
			if (ctrl || e.altKey) return;
			if (k === 'Escape' && root.classList.contains('bb-fill') && !document.fullscreenElement) { fill(false); return; }
			if (S.tab === 'steps' && stepN != null && (k === 'ArrowRight' || k === 'ArrowLeft')) { e.preventDefault(); setStep(stepN + (k === 'ArrowRight' ? 1 : -1)); return; }
			var map = { r: function () { act('rotate'); }, R: function () { act('rotate'); }, b: function () { setTool('build'); }, p: function () { setTool('paint'); }, x: function () { setTool('remove'); }, i: function () { setTool('pick'); }, w: function () { setTool('load'); },
				f: function () { fill(); }, F: function () { full(); }, '?': help, '[': function () { S.color = (S.color + M.COLORS.length - 1) % M.COLORS.length; saveS(); markPalette(); updateGhostMat(); }, ']': function () { S.color = (S.color + 1) % M.COLORS.length; saveS(); markPalette(); updateGhostMat(); },
				'0': function () { setView('iso'); }, '7': function () { setView('top'); }, '1': function () { setView('front'); }, '3': function () { setView('side'); }, '.': function () { setView('fit'); } };
			if (map[k] && (T || !/[0137.]/.test(k))) { e.preventDefault(); map[k](); }
		});
	}
	function act(a) {
		if (a === 'examples') examplesDlg();
		else if (a === 'new') { if (W.parts.length && !confirm('Start a new, empty build? (Undo brings it back.)')) return; hist.push(lastSnap); fut = []; W.clear(); loads = {}; fixed = {}; chal = null; testU = 0; stepN = null; root.classList.remove('bb-stepping'); lastSnap = snap(); persist(); refresh(); if (T) setView('iso'); }
		else if (a === 'open') $('bb-file').click();
		else if (a === 'save') { if (!W.parts.length) return toast('Build something first.'); download('brick-build.json', new Blob([JSON.stringify(fileObj())], { type: 'application/json' })); toast('Saved brick-build.json'); }
		else if (a === 'share') share();
		else if (a === 'undo') undo(); else if (a === 'redo') redo();
		else if (a === 'rotate') { S.rot = (S.rot + 1) & 3; saveS(); if (ghost && ghost.visible && hover) { var h = hover; placeMesh(ghost, { t: S.part, x: h.x, y: h.y, z: h.z, r: S.rot }); dirty = true; } toast('Turned: ' + ['0°', '90°', '180°', '270°'][S.rot], 900); }
		else if (a === 'shot') shot(); else if (a === 'stl') stl();
		else if (a === 'fill') fill(); else if (a === 'full') full(); else if (a === 'help') help();
	}

	// ---------- start ----------
	function start() {
		buildPalette(); wire(); syncControls(); setTool(S.tool); tab(S.tab === 'steps' ? 'test' : S.tab);
		if (!(root.requestFullscreen || root.webkitRequestFullscreen)) $('bb-fsbtn').hidden = true;
		var h = /#b=([A-Za-z0-9_-]+)/.exec(location.hash), saved = null;
		try { saved = JSON.parse(localStorage.getItem(BKEY) || 'null'); } catch (e) {}
		var ready = Promise.resolve();
		if (h) ready = readLink(h[1]).then(function (o) { openObj(o); hist = []; toast('Opened a shared build (' + W.parts.length + ' parts).'); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }).catch(function () { toast('That link could not be read.', 4000); });
		else if (saved && saved.s) { if ([16, 32, 48].indexOf(saved.size) >= 0) { S.size = saved.size; W = new M.World(S.size); } restore(saved.s); lastSnap = snap(); chal = saved.chal ? EX.filter(function (e) { return e.id === saved.chal; })[0] || null : null; }
		else if (!h) { var first = EX[0].make(); W.load(first.parts); lastSnap = snap(); }
		ready.then(function () {
			refresh();
			if (!imp) { $('bb-loading').innerHTML = '<div>This browser cannot load the 3D view.</div>'; return; }
			imp('three').then(function (t) { T = t; return Promise.all([imp('three/addons/controls/OrbitControls.js'), imp('three/addons/utils/BufferGeometryUtils.js')]); })
				.then(function (m) {
					OrbitControls = m[0].OrbitControls; BGU = m[1];
					try { initScene(); } catch (e) { $('bb-loading').innerHTML = '<div>The 3D view could not start (WebGL is off or not supported): ' + esc(e.message) + '</div>'; return; }
					$('bb-loading').hidden = true; rebuildGhost(); refresh(); setView(W.parts.length ? 'fit' : 'iso', true);
				})
				.catch(function (e) { $('bb-loading').innerHTML = '<div>Could not load the 3D engine (' + esc(e.message) + '). Check the connection and reload.</div>'; });
		});
	}
	window.MESBrickBuilder = { world: function () { return W; }, loadExample: loadExample, analysis: function () { return analysis; }, render: function () { dirty = true; if (renderer) renderer.render(scene, camera); }, setView: function (v) { setView(v); } };
	start();
})();
