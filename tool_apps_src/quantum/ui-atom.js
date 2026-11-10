/* ui-atom: the "Hydrogen atom" tab (orbital slice / 3D cloud / radial probability, energy levels with electron jumps and the spectrum). Physics in lib-atom.js (MESQ.atom). */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var A, api, P, st, cv, ctx, stage, wrap, lcv, lctx, lstage, lwrap, raf = 0, on = false;
	var S = { n: 3, l: 2, m: 0, cplx: false, Z: 1, view: "slice", plane: "xz", zoom: 1, off: 0, gam: 0.5, pts: 12000, spin: true, nodes: true, showR: false, air: true, red: true, lev: 2 };
	var cache = { key: "", img: null, max: 1 }, cloud = null, cloudKey = "", yaw = 0.6, pitch = 0.35, dragging = null, hov = null, seed = 1;
	var jump = null, lastT = 0, lastJ = null, lastAB = null, W = 0, H = 0, LW = 0, LH = 0, dpr = 1;
	function $(id) { return document.getElementById(id); }
	function M() { return S.red ? A.MASS[["", "H", "He", "Li"][S.Z]] : Infinity; }
	function ext() { return A.radiusFor(S.n, S.l, 0.992, S.Z) * 1.08 / S.zoom; }

	/* ---------- controls ---------- */
	function fillSel(sel, lo, hi, val, fmt) { var h = ""; for (var i = lo; i <= hi; i++) h += '<option value="' + i + '"' + (i === val ? " selected" : "") + ">" + (fmt ? fmt(i) : i) + "</option>"; sel.innerHTML = h; }
	function syncSel() {
		fillSel($("qm-at-n"), 1, A.NMAX, S.n);
		fillSel($("qm-at-l"), 0, S.n - 1, S.l, function (l) { return l + " (" + A.letter(l) + ")"; });
		fillSel($("qm-at-m"), -S.l, S.l, S.m, function (m) { return m < 0 ? "−" + (-m) : String(m); });
		$("qm-at-cplx").checked = S.cplx; $("qm-at-z").value = String(S.Z);
		Array.prototype.forEach.call(P.querySelectorAll("#qm-at-chips button"), function (b) { var o = b.dataset.o.split(",").map(Number); b.setAttribute("aria-pressed", o[0] === S.n && o[1] === S.l && o[2] === S.m && !S.cplx ? "true" : "false"); });
	}
	function setOrb(n, l, m) {
		n = Q.clamp(n | 0, 1, A.NMAX); l = Q.clamp(l | 0, 0, n - 1); m = Q.clamp(m | 0, -l, l);
		S.n = n; S.l = l; S.m = m; syncSel(); changed();
	}
	function changed() {
		cache.key = ""; info(); persist(); draw();
	}
	function persist() {
		Object.keys(S).forEach(function (k) { st[k] = S[k]; }); api.save();
	}
	function info() {
		var nm = A.name(S.n, S.l, S.m, S.cplx), nd = A.nodes(S.n, S.l), E = A.energy(S.n, S.Z, M());
		var rmp = A.mostLikely(S.n, S.l, S.Z), rav = A.meanR(S.n, S.l, S.Z);
		$("qm-at-name").innerHTML = "<b>" + nm + "</b> &nbsp;·&nbsp; n = " + S.n + ", l = " + S.l + ", m = " + (S.m < 0 ? "−" + (-S.m) : S.m) + (S.Z > 1 ? " &nbsp;·&nbsp; Z = " + S.Z : "") +
			" &nbsp;·&nbsp; " + nd.radial + " radial + " + nd.angular + " angular = " + nd.total + " node" + (nd.total === 1 ? "" : "s");
		$("qm-at-ro-e").textContent = E.toFixed(4) + " eV";
		$("qm-at-ro-rmp").textContent = rmp.toFixed(3) + " a₀ = " + Q.si(rmp * Q.C.a0, "m");
		$("qm-at-ro-rav").textContent = rav.toFixed(2) + " a₀ = " + Q.si(rav * Q.C.a0, "m");
		$("qm-at-ro-rn").textContent = nd.radial + (nd.radial ? " (spheres)" : "");
		$("qm-at-ro-an").textContent = nd.angular + (nd.angular ? (S.cplx && S.m !== 0 && S.l === Math.abs(S.m) ? " (z axis)" : " (planes / cones)") : "");
		var v = S.view;
		Array.prototype.forEach.call(P.querySelectorAll("#qm-at-stage .qm-run [data-v]"), function (b) { b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); });
		$("qm-at-plane").hidden = v !== "slice";
		Array.prototype.forEach.call(P.querySelectorAll(".qm-at-only-slice"), function (e) { e.hidden = v !== "slice"; });
		Array.prototype.forEach.call(P.querySelectorAll(".qm-at-only-cloud"), function (e) { e.hidden = v !== "cloud"; });
		Array.prototype.forEach.call(P.querySelectorAll(".qm-at-only-radial"), function (e) { e.hidden = v !== "radial"; });
		$("qm-at-resample").hidden = v !== "cloud";
		cv.style.touchAction = v === "cloud" ? "none" : "pan-y";
		var L = ext();
		$("qm-at-zoom-v").textContent = "view " + (2 * L).toFixed(1) + " a₀ wide";
		$("qm-at-off-v").textContent = (S.off * L).toFixed(1) + " a₀";
		$("qm-at-gam-v").textContent = S.gam <= 0.3 ? "high" : S.gam >= 0.9 ? "true |ψ|²" : S.gam.toFixed(2);
		$("qm-at-pts-v").textContent = S.pts.toLocaleString("en-US");
		var leg = S.cplx ? '<span><i style="background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"></i>phase of ψ (colour wheel)</span>' :
			'<span><i style="background:#ff9a3c"></i>ψ positive</span><span><i style="background:#4a9bff"></i>ψ negative</span>';
		if (v === "slice") leg += '<span>brightness = |ψ|² (contrast ' + S.gam.toFixed(2) + ')</span>' + (S.nodes && !S.cplx ? '<span><i style="background:#fff"></i>node, ψ = 0</span>' : "");
		if (v === "cloud") leg = leg + "<span>each dot = one place the electron could be found · drag to turn</span>";
		if (v === "radial") leg = '<span><i style="background:#22d3ee"></i>P(r) = r²R²</span><span><i style="background:#facc15"></i>most likely r</span><span><i style="background:#f472b6"></i>average ⟨r⟩</span><span><i style="background:#a3e635"></i>Bohr orbit n²a₀/Z</span>' + (S.showR ? '<span><i style="background:#c4b5fd"></i>R(r)</span>' : "");
		$("qm-at-legend").innerHTML = leg;
		$("qm-at-hint").textContent = v === "slice" ? (S.l > 0 && S.plane === "xy" && S.m === 0 && !S.cplx && (S.l & 1) ? "This orbital has a node in the x-y plane, so this slice is dark: try the x-z plane or move the slice." : "Tip: a p_z orbital has nothing in the x-y plane (it is a node). Move the slice to see the lobes appear.")
			: v === "cloud" ? "Drag to turn the cloud (on a phone: one finger). Every dot is drawn at random with probability |ψ|², so dense regions are where the electron is most often found."
				: "Hover the curve to read the chance of finding the electron inside that radius.";
	}

	/* ---------- sizing ---------- */
	function full(w) { return document.fullscreenElement === w || w.classList.contains("mes-fill"); }
	function size() {
		dpr = Math.min(2, window.devicePixelRatio || 1);
		var w = wrap.clientWidth || 600, nat = w < 600 ? Math.max(320, w) : Math.max(300, Math.min(w * 0.66, 640)), h = full(wrap) ? (window.MESStage && MESStage.fillH ? MESStage.fillH(wrap) : innerHeight - 140) : (window.MESStage ? MESStage.sh(stage, nat) : nat);
		h = Math.round(h); stage.style.height = h + "px";
		if (W !== w || H !== h) { W = w; H = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cache.key = ""; }
		var lw = lwrap.clientWidth || 600, lnat = lw < 600 ? 470 : Math.max(380, Math.min(lw * 0.5, 520)), lh = full(lwrap) ? (window.MESStage && MESStage.fillH ? MESStage.fillH(lwrap) : innerHeight - 140) : (window.MESStage ? MESStage.sh(lstage, lnat) : lnat);
		lh = Math.round(lh); lstage.style.height = lh + "px";
		if (LW !== lw || LH !== lh) { LW = lw; LH = lh; lcv.width = Math.round(lw * dpr); lcv.height = Math.round(lh * dpr); }
	}

	/* ---------- slice ---------- */
	function planeMap(u, v, o) { /* screen (u right, v up) + offset -> x, y, z */
		return S.plane === "xz" ? [u, o, v] : S.plane === "xy" ? [u, v, o] : [o, u, v];
	}
	var AX = { xz: ["x", "z", "y"], xy: ["x", "y", "z"], yz: ["y", "z", "x"] };
	function renderSlice() {
		var L = ext(), key = [S.n, S.l, S.m, S.cplx, S.Z, S.plane, S.zoom, S.off, S.gam, S.nodes, W, H].join("|");
		if (cache.key !== key) {
			var gk = [S.n, S.l, S.m, S.cplx, S.Z].join("|");
			if (cache.gk !== gk) { cache.gk = gk; cache.gmax = globalMax(); }
			var cell = Math.max(1, Math.ceil(Math.max(W, H) / 300)), gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
			var sc = L / (Math.min(W, H) / 2) * cell, f = A.psiFn(S.n, S.l, S.m, S.cplx, S.Z), o = [0, 0], off = S.off * L;
			var re = new Float32Array(gw * gh), im = new Float32Array(gw * gh), mx = 0, i, j, k;
			for (j = 0; j < gh; j++) { var vv = (gh / 2 - j - 0.5) * sc; for (i = 0; i < gw; i++) { var p = planeMap((i + 0.5 - gw / 2) * sc, vv, off); f(p[0], p[1], p[2], o); k = j * gw + i; re[k] = o[0]; im[k] = o[1]; var d = o[0] * o[0] + o[1] * o[1]; if (d > mx) mx = d; } }
			var isNode = mx < 1e-9 * cache.gmax; if (isNode) mx = cache.gmax;
			var oc = cache.oc || (cache.oc = document.createElement("canvas")); oc.width = gw; oc.height = gh;
			var octx = oc.getContext("2d"), id = octx.createImageData(gw, gh), px = id.data;
			for (k = 0; k < gw * gh; k++) {
				var dd = (re[k] * re[k] + im[k] * im[k]) / (mx || 1), b = Math.pow(dd, S.gam), c;
				if (S.cplx) c = Q.phaseRGB(Math.atan2(im[k], re[k]), b);
				else c = re[k] >= 0 ? [255 * b, 154 * b, 60 * b] : [74 * b, 155 * b, 255 * b];
				px[4 * k] = c[0]; px[4 * k + 1] = c[1]; px[4 * k + 2] = c[2]; px[4 * k + 3] = 255;
			}
			if (S.nodes && !S.cplx) for (j = 0; j < gh - 1; j++) for (i = 0; i < gw - 1; i++) { k = j * gw + i; if (re[k] * re[k + 1] < 0 || re[k] * re[k + gw] < 0) { px[4 * k] = Math.max(px[4 * k], 150); px[4 * k + 1] = Math.max(px[4 * k + 1], 150); px[4 * k + 2] = Math.max(px[4 * k + 2], 150); } }
			octx.putImageData(id, 0, 0);
			cache.key = key; cache.max = mx; cache.node = isNode; cache.gw = gw; cache.gh = gh; cache.cell = cell;
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, cv.width, cv.height);
		ctx.imageSmoothingEnabled = true; ctx.drawImage(cache.oc, 0, 0, cache.gw * cache.cell * dpr, cache.gh * cache.cell * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		var ax = AX[S.plane], s = (Math.min(W, H) / 2) / L;
		ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
		ctx.fillStyle = "rgba(231,235,246,0.85)"; ctx.font = "13px system-ui,sans-serif"; ctx.fillText(ax[0] + " →", W - 34, H / 2 - 6); ctx.fillText("↑ " + ax[1], W / 2 + 6, 46);
		scaleBar(s);
		if (cache.node) { ctx.fillStyle = "#e7ebf6"; ctx.font = "15px system-ui,sans-serif"; var msg = "ψ = 0 everywhere in this plane: it is a node.", msg2 = "Move the slice or pick another plane."; ctx.fillText(msg, W / 2 - ctx.measureText(msg).width / 2, H / 2 - 30); ctx.fillText(msg2, W / 2 - ctx.measureText(msg2).width / 2, H / 2 - 10); }
		else { ctx.fillStyle = "rgba(231,235,246,0.7)"; ctx.font = "11px system-ui,sans-serif"; var pc = "brightest point here = " + Math.max(0.1, 100 * cache.max / cache.gmax).toFixed(cache.max / cache.gmax < 0.1 ? 1 : 0) + "% of the atom's peak"; ctx.fillText(pc, W - ctx.measureText(pc).width - 10, W < 600 ? 70 : H - 14); }
		$("qm-at-badge").textContent = A.name(S.n, S.l, S.m, S.cplx) + " · slice " + ax[0] + "-" + ax[1] + (S.off ? " at " + ax[2] + " = " + (S.off * L).toFixed(1) + " a₀" : " through the nucleus");
		if (hov) {
			var u = (hov.x - W / 2) / s, v = (H / 2 - hov.y) / s, pp = planeMap(u, v, S.off * L), o2 = A.psiFn(S.n, S.l, S.m, S.cplx, S.Z)(pp[0], pp[1], pp[2], [0, 0]);
			var d2 = o2[0] * o2[0] + o2[1] * o2[1];
			$("qm-at-ro-hov").textContent = ax[0] + " = " + u.toFixed(1) + ", " + ax[1] + " = " + v.toFixed(1) + " a₀ · |ψ|² " + (100 * d2 / (cache.max || 1)).toFixed(0) + "% of max" + (S.cplx ? "" : (o2[0] >= 0 ? " (+)" : " (−)"));
		}
	}
	/* largest |psi|^2 anywhere (coarse 3D grid + refinement around the best point), so a slice can say how bright it is compared with the whole atom */
	function globalMax() {
		var f = A.psiFn(S.n, S.l, S.m, S.cplx, S.Z), o = [0, 0], L = A.radiusFor(S.n, S.l, 0.99, S.Z), N = 28, best = 0, bx = 0, by = 0, bz = 0, h = 2 * L / N, i, j, k;
		for (i = 0; i <= N; i++) for (j = 0; j <= N; j++) for (k = 0; k <= N; k++) { var x = -L + i * h, y = -L + j * h, z = -L + k * h; f(x, y, z, o); var d = o[0] * o[0] + o[1] * o[1]; if (d > best) { best = d; bx = x; by = y; bz = z; } }
		for (var it = 0; it < 30; it++) { h *= 0.7; var nb = best, nx = bx, ny = by, nz = bz; for (i = -1; i <= 1; i++) for (j = -1; j <= 1; j++) for (k = -1; k <= 1; k++) { f(bx + i * h, by + j * h, bz + k * h, o); var d2 = o[0] * o[0] + o[1] * o[1]; if (d2 > nb) { nb = d2; nx = bx + i * h; ny = by + j * h; nz = bz + k * h; } } best = nb; bx = nx; by = ny; bz = nz; }
		return best;
	}
	function scaleBar(s) {
		var nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200], target = W * 0.18 / s, len = nice[0];
		nice.forEach(function (v) { if (v <= target) len = v; });
		var px = len * s, x = 14, y = W < 600 ? H - 58 : H - 18;
		ctx.strokeStyle = "#e7ebf6"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + px, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + px, y - 4); ctx.lineTo(x + px, y + 4); ctx.stroke();
		ctx.fillStyle = "#e7ebf6"; ctx.font = "12px system-ui,sans-serif"; ctx.fillText(len + " a₀ = " + Q.si(len * Q.C.a0, "m"), x, y - 8);
	}

	/* ---------- 3D cloud ---------- */
	function ensureCloud() {
		var key = [S.n, S.l, S.m, S.cplx, S.Z, S.pts, seed].join("|");
		if (cloudKey !== key) { cloud = A.sample(S.n, S.l, S.m, S.cplx, S.pts, seed, S.Z); cloudKey = key; }
	}
	function renderCloud() {
		ensureCloud();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var L = ext() * 0.95, s = (Math.min(W, H) / 2) / L, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), N = cloud.x.length;
		/* axes */
		var axes = [[1, 0, 0, "x"], [0, 1, 0, "y"], [0, 0, 1, "z"]];
		function proj(x, y, z) { var X = x * cy - y * sy, Y = x * sy + y * cy; var Zs = z * cp - Y * sp, D = z * sp + Y * cp; return [W / 2 + X * s, H / 2 - Zs * s, D]; }
		ctx.lineWidth = 1; ctx.font = "13px system-ui,sans-serif";
		axes.forEach(function (a) { var p0 = proj(-a[0] * L * 0.9, -a[1] * L * 0.9, -a[2] * L * 0.9), p1 = proj(a[0] * L * 0.9, a[1] * L * 0.9, a[2] * L * 0.9); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); ctx.fillStyle = "rgba(231,235,246,0.8)"; ctx.fillText(a[3], p1[0] + 4, p1[1]); });
		ctx.globalCompositeOperation = "lighter";
		var ds = Math.max(1.2, Math.min(2.6, 2.4 * Math.sqrt(12000 / N) * Math.min(W, H) / 600)), al = Math.max(0.18, Math.min(0.75, 0.55 * Math.sqrt(12000 / N)));
		var bins = S.cplx ? 12 : 2, groups = [];
		for (var b = 0; b < bins; b++) groups.push([]);
		for (var i = 0; i < N; i++) { var g = S.cplx ? Math.floor(((cloud.s[i] / (2 * Math.PI)) % 1 + 1) % 1 * 12) % 12 : (cloud.s[i] > 0 ? 0 : 1); groups[g].push(i); }
		for (b = 0; b < bins; b++) {
			var c = S.cplx ? Q.phaseRGB((b + 0.5) / 12 * 2 * Math.PI, 1) : b === 0 ? [255, 154, 60] : [74, 155, 255];
			var arr = groups[b];
			for (var t = 0; t < arr.length; t++) {
				var k = arr[t], p = proj(cloud.x[k], cloud.y[k], cloud.z[k]), dep = 0.55 + 0.45 * Q.clamp(0.5 - p[2] / (2 * L), 0, 1);
				ctx.fillStyle = "rgba(" + Math.round(c[0] * dep) + "," + Math.round(c[1] * dep) + "," + Math.round(c[2] * dep) + "," + al + ")";
				ctx.fillRect(p[0] - ds / 2, p[1] - ds / 2, ds, ds);
			}
		}
		ctx.globalCompositeOperation = "source-over";
		ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(W / 2, H / 2, 2.2, 0, 7); ctx.fill();
		scaleBar(s);
		$("qm-at-badge").textContent = A.name(S.n, S.l, S.m, S.cplx) + " · " + N.toLocaleString("en-US") + " random positions";
	}

	/* ---------- radial ---------- */
	function renderRadial() {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#070a14"; ctx.fillRect(0, 0, W, H);
		var rmax = A.radiusFor(S.n, S.l, 0.999, S.Z) * 1.05 / S.zoom, pl = 56, pr = 18, pt = 74, pb = W < 600 ? 92 : 46, gw = W - pl - pr, gh = H - pt - pb, N = 600, i, pmax = 0, rr = [];
		for (i = 0; i <= N; i++) { var r = rmax * i / N, p = A.P(S.n, S.l, r, S.Z); rr.push(p); if (p > pmax) pmax = p; }
		var rmp = A.mostLikely(S.n, S.l, S.Z); pmax = Math.max(pmax, A.P(S.n, S.l, rmp, S.Z)) * 1.12;
		var X = function (r) { return pl + r / rmax * gw; }, Y = function (p) { return pt + gh - p / pmax * gh; };
		/* grid + ticks */
		ctx.strokeStyle = "#273049"; ctx.fillStyle = "#9aa6c0"; ctx.font = "12px system-ui,sans-serif"; ctx.lineWidth = 1;
		var step = [0.5, 1, 2, 5, 10, 20, 50, 100].filter(function (v) { return rmax / v <= 10; })[0] || 100;
		for (var t = 0; t <= rmax + 1e-9; t += step) { var x = X(t); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + gh); ctx.stroke(); ctx.fillText(String(+t.toFixed(1)), x - 6, pt + gh + 16); }
		ctx.fillText("r (a₀ = " + Q.si(Q.C.a0, "m") + ")", pl + gw / 2 - 40, pt + gh + 34);
		ctx.save(); ctx.translate(16, pt + gh / 2 + 40); ctx.rotate(-Math.PI / 2); ctx.fillText("P(r)  per a₀", 0, 0); ctx.restore();
		ctx.strokeStyle = "#5a6588"; ctx.beginPath(); ctx.moveTo(pl, pt); ctx.lineTo(pl, pt + gh); ctx.lineTo(pl + gw, pt + gh); ctx.stroke();
		/* filled curve, inside-r shading when hovering */
		var hr = hov ? Q.clamp((hov.x - pl) / gw * rmax, 0, rmax) : -1;
		ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (i = 0; i <= N; i++) ctx.lineTo(X(rmax * i / N), Y(rr[i])); ctx.lineTo(X(rmax), Y(0)); ctx.closePath();
		ctx.fillStyle = "rgba(34,211,238,0.14)"; ctx.fill();
		if (hr >= 0) { ctx.save(); ctx.beginPath(); ctx.rect(pl, pt, X(hr) - pl, gh); ctx.clip(); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (i = 0; i <= N; i++) ctx.lineTo(X(rmax * i / N), Y(rr[i])); ctx.lineTo(X(rmax), Y(0)); ctx.fillStyle = "rgba(34,211,238,0.38)"; ctx.fill(); ctx.restore(); }
		ctx.beginPath(); for (i = 0; i <= N; i++) { var xx = X(rmax * i / N), yy = Y(rr[i]); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2.2; ctx.stroke();
		if (S.showR) {
			var rv = [], rmx = 0; for (i = 0; i <= N; i++) { var v = A.R(S.n, S.l, Math.max(rmax * i / N, 1e-9), S.Z); rv.push(v); rmx = Math.max(rmx, Math.abs(v)); }
			ctx.beginPath(); for (i = 0; i <= N; i++) { var y2 = pt + gh / 2 - rv[i] / rmx * gh * 0.45; if (i) ctx.lineTo(X(rmax * i / N), y2); else ctx.moveTo(X(0), y2); }
			ctx.setLineDash([5, 4]); ctx.strokeStyle = "#c4b5fd"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
			ctx.strokeStyle = "rgba(196,181,253,0.3)"; ctx.beginPath(); ctx.moveTo(pl, pt + gh / 2); ctx.lineTo(pl + gw, pt + gh / 2); ctx.stroke();
		}
		function vline(r, col, label, row) { if (r > rmax) return; var x = X(r); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + gh); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.font = "12px system-ui,sans-serif"; var tw = ctx.measureText(label).width; ctx.fillText(label, Math.max(4, Math.min(x + 4, W - pr - tw)), pt - 36 + 14 * row); }
		var rav = A.meanR(S.n, S.l, S.Z), bo = S.n * S.n / S.Z;
		var same = Math.abs(bo - rmp) < 1e-3 * bo;
		vline(rmp, "#facc15", "most likely " + rmp.toFixed(2) + (same ? " a₀ = Bohr's n²a₀/Z" : ""), 0);
		vline(rav, "#f472b6", "⟨r⟩ " + rav.toFixed(2), 1);
		if (!same) vline(bo, "#a3e635", "Bohr " + +bo.toFixed(2), 2);
		A.radialNodes(S.n, S.l, S.Z).forEach(function (r) { if (r <= rmax) { ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(X(r), Y(0), 3.5, 0, 7); ctx.fill(); } });
		$("qm-at-badge").textContent = A.name(S.n, S.l, S.m, S.cplx) + " · radial probability (white dots: radial nodes)";
		if (hr >= 0) {
			ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(X(hr), pt); ctx.lineTo(X(hr), pt + gh); ctx.stroke();
			$("qm-at-ro-hov").textContent = "r = " + hr.toFixed(2) + " a₀: inside " + (100 * A.inside(S.n, S.l, hr, S.Z)).toFixed(1) + "%";
		}
	}

	function draw() {
		if (!cv) return;
		if (S.view === "slice") renderSlice(); else if (S.view === "cloud") renderCloud(); else renderRadial();
		drawLevels();
	}

	/* ---------- energy levels ---------- */
	var NL = 7;
	function lv() {
		var top = 30, specH = Math.max(130, Math.min(180, LH * 0.36)), bot = LH - specH - 18, left = 70, right = Math.min(LW * 0.55, LW - 150);
		if (LW < 520) right = LW - 120;
		return { top: top, bot: bot, left: left, right: right, specH: specH, E1: A.energy(1, S.Z, M()) };
	}
	function yOf(E, g) { return g.top + Math.sqrt(Math.max(0, E / g.E1)) * (g.bot - g.top); } /* E = 0 at top, E1 at bottom; square-root scale so the upper levels do not pile up */
	function drawLevels() {
		if (!lctx) return;
		var g = lv(), c = lctx, i;
		c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#070a14"; c.fillRect(0, 0, LW, LH);
		c.font = "12px system-ui,sans-serif";
		/* ionization line */
		c.strokeStyle = "rgba(231,235,246,0.35)"; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(g.left, g.top); c.lineTo(g.right, g.top); c.stroke(); c.setLineDash([]);
		c.fillStyle = "#9aa6c0"; c.fillText("n = ∞   0 eV (free electron)", g.left + 4, g.top - 6);
		for (i = 1; i <= NL; i++) {
			var E = A.energy(i, S.Z, M()), y = yOf(E, g), sel = i === S.lev;
			c.strokeStyle = sel ? "#facc15" : "#7b88ad"; c.lineWidth = sel ? 3 : 1.6; c.beginPath(); c.moveTo(g.left, y); c.lineTo(g.right, y); c.stroke();
			if (i === 1 || yOf(A.energy(i - 1, S.Z, M()), g) - y > 15) { c.fillStyle = sel ? "#facc15" : "#e7ebf6"; c.fillText("n = " + i, 10, y + 4); c.fillStyle = "#9aa6c0"; var lab = E.toFixed(2) + " eV"; c.fillText(lab, g.right - c.measureText(lab).width, y - 5); }
		}
		/* electron + jump animation */
		var ex = g.left + (g.right - g.left) * 0.42, ey = yOf(S.lev ? A.energy(S.lev, S.Z, M()) : 0, g);
		if (jump) {
			var t = Q.clamp(jump.t, 0, 1), ya = yOf(jump.a ? A.energy(jump.a, S.Z, M()) : 0, g), yb = yOf(jump.b ? A.energy(jump.b, S.Z, M()) : 0, g);
			var te = Q.clamp(t / 0.35, 0, 1); ey = ya + (yb - ya) * (te * te * (3 - 2 * te));
			c.strokeStyle = "rgba(250,204,21,0.5)"; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(ex, ya); c.lineTo(ex, yb); c.stroke(); c.setLineDash([]);
			/* photon */
			var col = photonCol(jump.tr.lamVac), y0 = (ya + yb) / 2, x0 = ex + 14, x1 = LW - 20, lam = Math.max(6, Math.min(26, Math.log10(jump.tr.lamVac * 1e9) * 7 - 8));
			var head = jump.tr.emit ? x0 + (x1 - x0) * Q.clamp((t - 0.15) / 0.85, 0, 1) : x1 - (x1 - x0) * Q.clamp(t / 0.35, 0, 1);
			var tail = jump.tr.emit ? Math.max(x0, head - 140) : Math.min(x1, head + 140);
			if (jump.tr.emit ? t > 0.15 : t < 0.35) {
				c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath();
				for (var x = Math.min(head, tail); x <= Math.max(head, tail); x += 1.5) { var yy = y0 + 9 * Math.sin((x - head) / lam * 2 * Math.PI); if (x === Math.min(head, tail)) c.moveTo(x, yy); else c.lineTo(x, yy); }
				c.stroke();
				c.fillStyle = col; c.font = "bold 13px system-ui,sans-serif"; c.fillText((jump.tr.emit ? "photon out: " : "photon in: ") + lamText(jump.tr), Math.max(x0, Math.min(Math.max(head, tail) - 120, LW - 200)), y0 + 28);
			}
		}
		c.fillStyle = "#facc15"; c.beginPath(); c.arc(ex, ey, 6, 0, 7); c.fill(); c.strokeStyle = "#070a14"; c.lineWidth = 1.5; c.stroke();
		c.fillStyle = "#9aa6c0"; c.font = "11px system-ui,sans-serif"; c.fillText("spacing on a square-root scale", 10, g.top + 14); c.font = "12px system-ui,sans-serif"; c.fillText("click a level: the electron jumps there", g.left, g.bot + 18 > LH - g.specH - 4 ? g.bot - 8 : g.bot + 16);
		drawSpectrum(g);
	}
	function photonCol(lv) { var rgb = A.wavelengthRGB(lv * 1e9); return rgb ? "rgb(" + rgb.join(",") + ")" : lv < 380e-9 ? "#c4b5fd" : "#fb923c"; }
	function lamText(tr) { var l = S.air ? tr.lamAir : tr.lamVac; return (l * 1e9 >= 1000 ? (l * 1e6).toFixed(3) + " µm" : (l * 1e9).toFixed(2) + " nm"); }
	function drawSpectrum(g) {
		var c = lctx, y0 = LH - g.specH, h1 = g.specH * 0.42, x0 = 12, x1 = LW - 12, lo = Math.log10(80), hi = Math.log10(4200);
		var X = function (nm) { return x0 + (Math.log10(nm) - lo) / (hi - lo) * (x1 - x0); };
		c.fillStyle = "#0c1020"; c.fillRect(0, y0 - 8, LW, g.specH + 8);
		c.font = "11px system-ui,sans-serif"; c.fillStyle = "#9aa6c0";
		c.fillText("Whole spectrum (log scale): ultraviolet · visible · infrared", x0, y0 + 6);
		var yb = y0 + 12;
		/* visible band on log strip */
		for (var nm = 380; nm <= 750; nm += 2) { var rgb = A.wavelengthRGB(nm); c.fillStyle = "rgba(" + rgb.join(",") + ",0.35)"; c.fillRect(X(nm), yb, X(nm + 2) - X(nm) + 0.5, h1); }
		c.strokeStyle = "#273049"; c.strokeRect(x0, yb, x1 - x0, h1);
		[100, 200, 500, 1000, 2000, 4000].forEach(function (t) { c.fillStyle = "#9aa6c0"; c.fillText(t >= 1000 ? t / 1000 + " µm" : t + " nm", X(t) - 12, yb + h1 + 12); });
		var sel = jump ? jump.tr : lastJ, Z = S.Z, Mm = M();
		for (var nl = 1; nl <= 4; nl++) for (var up = nl + 1; up <= 9; up++) {
			var tr = A.transition(up, nl, Z, Mm), l = (S.air ? tr.lamAir : tr.lamVac) * 1e9; if (l < 80 || l > 4200) continue;
			var hit = sel && sel.lower === nl && sel.upper === up;
			c.strokeStyle = hit ? "#ffffff" : nl === 1 ? "#a78bfa" : nl === 2 ? photonCol(tr.lamVac) : nl === 3 ? "#fb923c" : "#f87171"; c.lineWidth = hit ? 3 : 1.4;
			c.beginPath(); c.moveTo(X(l), yb + 2); c.lineTo(X(l), yb + h1 - 2); c.stroke();
		}
		[["Lyman", 1], ["Balmer", 2], ["Paschen", 3], ["Brackett", 4]].forEach(function (s) { var a = A.transition(s[1] + 1, s[1], Z, Mm).lamVac * 1e9, b = A.seriesLimit(s[1], Z, Mm) * 1e9; var xm = X(Math.sqrt(a * b)); c.fillStyle = "#e7ebf6"; c.font = "11px system-ui,sans-serif"; var tw = c.measureText(s[0]).width; if (xm - tw / 2 > x0 && xm + tw / 2 < x1) c.fillText(s[0], xm - tw / 2, yb + h1 - 4); });
		/* visible spectroscope strip */
		var y2 = yb + h1 + 34, h2 = Math.max(22, g.specH - h1 - 48), v0 = 380, v1 = 750, XV = function (nm) { return x0 + (nm - v0) / (v1 - v0) * (x1 - x0); };
		c.fillStyle = "#000"; c.fillRect(x0, y2, x1 - x0, h2);
		for (var k = 3; k <= 9; k++) {
			var tb = A.transition(k, 2, Z, Mm);
			var lb = (S.air ? tb.lamAir : tb.lamVac) * 1e9; if (lb < v0 || lb > v1) continue;
			var rgb2 = A.wavelengthRGB(lb), hit2 = sel && sel.lower === 2 && sel.upper === k;
			c.fillStyle = "rgb(" + rgb2.join(",") + ")"; c.shadowColor = c.fillStyle; c.shadowBlur = hit2 ? 14 : 6; c.fillRect(XV(lb) - (hit2 ? 2.5 : 1.5), y2 + 2, hit2 ? 5 : 3, h2 - 4); c.shadowBlur = 0;
			if (k <= 6 || hit2) { c.fillStyle = "#e7ebf6"; c.font = "11px system-ui,sans-serif"; var t2 = lb.toFixed(1); c.fillText(t2, Math.min(XV(lb) + 4, x1 - 34), y2 + h2 - 4); }
		}
		c.fillStyle = "#9aa6c0"; c.font = "11px system-ui,sans-serif"; c.fillText("What a spectroscope shows: the visible (Balmer) lines of " + (Z === 1 ? "hydrogen" : Z === 2 ? "He⁺" : "Li²⁺"), x0, y2 - 4);
	}
	function doJump(a, b) {
		if (a === b) return;
		var tr = trOf(a, b);
		jump = { a: a, b: b, t: 0, tr: tr }; lastJ = tr; lastAB = [a, b]; S.lev = a; showJump(tr, a, b);
		if (!raf && on) loop();
	}
	function trOf(a, b) { return b === 0 ? ionTr(a) : A.transition(a, b, S.Z, M()); }
	function ionTr(a) { var e = -A.energy(a, S.Z, M()), lv2 = Q.C.h * Q.C.c / (e * Q.C.e); return { dE: e, lamVac: lv2, lamAir: A.toAir(lv2), f: e * Q.C.e / Q.C.h, emit: false, series: A.seriesName(a) + " limit (ionization)", lower: a, upper: 99, band: A.band(lv2) }; }
	function showJump(tr, a, b) {
		$("qm-at-ro-j").textContent = (a) + " → " + (b === 0 ? "∞" : b) + (tr.emit ? " (emits)" : " (absorbs)");
		$("qm-at-ro-de").textContent = tr.dE.toFixed(4) + " eV";
		$("qm-at-ro-lam").innerHTML = lamText(tr) + ' <i class="qm-at-sw" style="background:' + photonCol(tr.lamVac) + '"></i>' + (S.air && tr.lamVac >= 2e-7 ? " air" : " vacuum");
		$("qm-at-ro-f").textContent = Q.si(tr.f, "Hz");
		$("qm-at-ro-ser").textContent = tr.series + " · " + tr.band;
		Array.prototype.forEach.call(P.querySelectorAll("#qm-at-jchips button"), function (bt) { bt.setAttribute("aria-pressed", bt.dataset.j === a + "," + b ? "true" : "false"); });
	}
	function levelAt(y) {
		var g = lv(); if (Math.abs(y - g.top) < 10) return 0;
		var best = -1, bd = 14; for (var i = 1; i <= NL; i++) { var d = Math.abs(y - yOf(A.energy(i, S.Z, M()), g)); if (d < bd) { bd = d; best = i; } }
		return best;
	}

	/* ---------- animation ---------- */
	function loop(t) {
		raf = 0; if (!on) return;
		var dt = lastT && t ? Math.min(0.05, (t - lastT) / 1000) : 0.016; lastT = t || 0;
		var need = false;
		if (S.view === "cloud" && S.spin && !dragging) { yaw += dt * 0.35; need = true; }
		if (jump) { jump.t += dt / 2.2; need = true; if (jump.t >= 1) { S.lev = jump.b; jump = null; persist(); } }
		if (need) { if (S.view === "cloud") renderCloud(); drawLevels(); raf = requestAnimationFrame(loop); }
	}
	function kick() { if (on && !raf) raf = requestAnimationFrame(loop); }

	/* ---------- link ---------- */
	function linkObj() { return { at_n: S.n, at_l: S.l, at_m: S.m, at_c: S.cplx ? 1 : null, at_z: S.Z > 1 ? S.Z : null, at_v: S.view === "slice" ? null : S.view, at_p: S.plane === "xz" ? null : S.plane }; }

	function fsBtn(btn, w) { btn.addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); }); }

	Q.reg("atom", {
		init: function (panel, a) {
			api = a; P = panel; st = a.st; A = Q.atom;
			Object.keys(S).forEach(function (k) { if (st[k] != null && typeof st[k] === typeof S[k]) S[k] = st[k]; });
			var q = a.query, gi = function (k) { var v = q.get(k); return v == null ? null : parseInt(v, 10); };
			if (gi("at_n") != null) { S.n = gi("at_n"); S.l = gi("at_l") || 0; S.m = gi("at_m") || 0; S.cplx = q.get("at_c") === "1"; }
			if (gi("at_z")) S.Z = Q.clamp(gi("at_z"), 1, 3);
			if (q.get("at_v") && /^(slice|cloud|radial)$/.test(q.get("at_v"))) S.view = q.get("at_v");
			if (q.get("at_p") && /^(xz|xy|yz)$/.test(q.get("at_p"))) S.plane = q.get("at_p");
			if (!A.valid(S.n, S.l, S.m)) { S.n = 3; S.l = 2; S.m = 0; }
			S.lev = Q.clamp(S.lev | 0, 1, NL);
			cv = $("qm-at-cv"); ctx = cv.getContext("2d"); stage = $("qm-at-stage"); wrap = $("qm-at-wrap");
			lcv = $("qm-at-lcv"); lctx = lcv.getContext("2d"); lstage = $("qm-at-lstage"); lwrap = $("qm-at-lwrap");
			syncSel();
			$("qm-at-n").onchange = function () { setOrb(+this.value, S.l, S.m); };
			$("qm-at-l").onchange = function () { setOrb(S.n, +this.value, S.m); };
			$("qm-at-m").onchange = function () { setOrb(S.n, S.l, +this.value); };
			$("qm-at-cplx").onchange = function () { S.cplx = this.checked; syncSel(); changed(); };
			$("qm-at-z").onchange = function () { S.Z = +this.value; changed(); };
			P.querySelector("#qm-at-chips").addEventListener("click", function (e) { var b = e.target.closest("[data-o]"); if (!b) return; var o = b.dataset.o.split(",").map(Number); S.cplx = false; setOrb(o[0], o[1], o[2]); });
			P.querySelector("#qm-at-stage .qm-run").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; S.view = b.dataset.v; hov = null; $("qm-at-ro-hov").textContent = "–"; changed(); kick(); });
			$("qm-at-plane").value = S.plane; $("qm-at-plane").onchange = function () { S.plane = this.value; changed(); };
			[["zoom", "zoom"], ["off", "off"], ["gam", "gam"], ["pts", "pts"]].forEach(function (p) { var el = $("qm-at-" + p[0]); el.value = S[p[1]]; el.addEventListener("input", function () { S[p[1]] = +el.value; changed(); }); });
			[["spinon", "spin"], ["nodes", "nodes"], ["showR", "showR"], ["air", "air"], ["red", "red"]].forEach(function (p) { var el = $("qm-at-" + p[0]); el.checked = S[p[1]]; el.addEventListener("change", function () { S[p[1]] = el.checked; if (lastAB) { lastJ = trOf(lastAB[0], lastAB[1]); showJump(lastJ, lastAB[0], lastAB[1]); } changed(); kick(); }); });
			$("qm-at-resample").onclick = function () { seed = (seed * 7919 + 13) % 100000 + 1; draw(); };
			$("qm-at-link").onclick = function () { a.setQuery(linkObj()); a.copy(location.href, "Link copied"); };
			fsBtn($("qm-at-fs"), wrap); fsBtn($("qm-at-lfs"), lwrap);
			/* pointer on the orbital canvas */
			cv.addEventListener("pointerdown", function (e) { if (S.view !== "cloud") return; dragging = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
			cv.addEventListener("pointermove", function (e) {
				var r = cv.getBoundingClientRect();
				if (dragging) { yaw = dragging.yaw + (e.clientX - dragging.x) * 0.01; pitch = Q.clamp(dragging.pitch + (e.clientY - dragging.y) * 0.01, -1.55, 1.55); renderCloud(); return; }
				if (S.view !== "cloud") { hov = { x: e.clientX - r.left, y: e.clientY - r.top }; if (S.view === "slice") renderSlice(); else renderRadial(); }
			});
			var end = function () { if (dragging) { dragging = null; kick(); } };
			cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
			cv.addEventListener("pointerleave", function () { if (!dragging && hov) { hov = null; draw(); } });
			/* levels canvas */
			lcv.addEventListener("click", function (e) { var r = lcv.getBoundingClientRect(), y = e.clientY - r.top, L = levelAt(y); if (L < 0 || jump) return; if (L === S.lev) return; doJump(S.lev, L); });
			lcv.addEventListener("keydown", function (e) { if (jump) return; if (e.key === "ArrowUp" && S.lev < NL) { e.preventDefault(); doJump(S.lev, S.lev + 1); } else if (e.key === "ArrowDown" && S.lev > 1) { e.preventDefault(); doJump(S.lev, S.lev - 1); } });
			P.querySelector("#qm-at-jchips").addEventListener("click", function (e) { var b = e.target.closest("[data-j]"); if (!b) return; var j = b.dataset.j.split(",").map(Number); if (jump) jump = null; S.lev = j[0]; doJump(j[0], j[1]); });
			window.addEventListener("resize", function () { if (on) { size(); draw(); } });
			if (window.ResizeObserver) new ResizeObserver(function () { if (on) { size(); draw(); } }).observe(wrap);
			if (window.ResizeObserver) new ResizeObserver(function () { if (on) { size(); drawLevels(); } }).observe(lwrap);
			document.addEventListener("fullscreenchange", function () { if (on) setTimeout(function () { size(); draw(); }, 60); });
			a.onTheme(function () { if (on) draw(); });
			info();
			window.MESQuantumDebug_atom = { S: S, set: setOrb, draw: function () { size(); draw(); }, jump: doJump, step: function (n) { for (var i = 0; i < (n || 1); i++) { if (jump) { jump.t += 0.1; if (jump.t >= 1) { S.lev = jump.b; jump = null; } } yaw += 0.05; } draw(); }, state: function () { return { lev: S.lev, jump: jump, last: lastJ }; } };
		},
		show: function () { on = true; size(); info(); draw(); kick(); },
		hide: function () { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; lastT = 0; }
	});
})();
