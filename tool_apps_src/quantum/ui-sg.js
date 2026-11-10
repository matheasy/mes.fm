/* MES Quantum Lab, tab "sg": a chain of up to four Stern-Gerlach magnets. Atoms are fired one by one (paths sampled from the exact
   quantum probabilities, MESQ.sg in lib-ent.js), hits pile up on a screen, the beam's spin is drawn under every gap.
   Link params: sg_s (1 = spin 1/2, 2 = spin 1), sg_src (oven | z | x), sg_m ("0:0,90:c,0:-": angle:pass, pass = output index, c = recombined, w = recombined + watched). */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var D = Math.PI / 180;

	Q.reg("sg", {
		init: function (panel, api) {
			var G = Q.sg, st = api.st, $ = function (id) { return document.getElementById(id); };
			function dflt() { st.spin = 1; st.src = "oven"; st.mags = [{ th: 0, pass: 0 }, { th: 90, pass: 0 }]; }
			if (!st.mags || !st.mags.length) dflt();
			if (st.rate == null) st.rate = 40;
			var q = api.query;
			if (q.get("sg_s") === "1" || q.get("sg_s") === "2") st.spin = +q.get("sg_s");
			if (/^(oven|z|x)$/.test(q.get("sg_src") || "")) st.src = q.get("sg_src");
			if (q.get("sg_m")) {
				var mm = q.get("sg_m").split(",").slice(0, 4).map(function (s) { var p = s.split(":"), th = parseFloat(p[0]); return { th: isFinite(th) ? th : 0, pass: p[1] === "c" ? "coh" : p[1] === "w" ? "peek" : (parseInt(p[1], 10) || 0) }; });
				if (mm.length) st.mags = mm;
			}
			function fixPass() { var n = G.dim(st.spin); st.mags.forEach(function (m) { if (typeof m.pass === "number" && (m.pass < 0 || m.pass >= n)) m.pass = 0; }); }
			fixPass();

			var cv = $("qm-sg-cv"), ctx = cv.getContext("2d"), stage = $("qm-sg-stage"), wrap = $("qm-sg-wrap");
			var W = 700, H = 380, dpr = 1, running = false, raf = 0, last = 0, carry = 0, beam = false, rnd = Q.rng((Date.now() % 1e9) | 7);
			var atoms = [], hits = [], cnt, theory, sel = 0, dirty = true, uiT = 0;
			function resetCounts() { cnt = { fired: 0, spots: [0, 0, 0], blocked: 0, block: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], cl: 0 }; hits = []; atoms = []; dirty = true; }
			resetCounts();
			function mags() { return st.mags.map(function (m) { return { th: m.th * D, pass: m.pass }; }); }
			function classical() { return st.cl && st.mags.length === 1; }
			function recompute() { theory = G.theory(st.spin, st.src, mags()); }
			recompute();
			function rate() { return st.rate <= 0 ? 0.5 : 0.5 * Math.pow(10, st.rate / 25); }

			/* ---------- geometry ---------- */
			function runPad(stg) { var r = stg.querySelector(".qm-run"); if (!r) return [0, 0]; var cs = getComputedStyle(r), h = r.offsetHeight + 8; return cs.top === "auto" || parseFloat(cs.top) > stg.clientHeight / 2 ? [0, h] : [0, 0]; }
			var PAD = [0, 0];
			function geo() {
				var n = st.mags.length, xSrc = Math.max(34, W * 0.06), xScr = W - Math.max(22, W * 0.035), x0 = xSrc + Math.max(30, W * 0.06), x1 = xScr - Math.max(56, W * 0.13);
				var cell = (x1 - x0) / n, mw = Math.min(120, cell * 0.5), xs = [];
				for (var k = 0; k < n; k++) xs.push(x0 + (k + 0.5) * cell);
				var t0 = PAD[0], h = H - PAD[0] - PAD[1], yc = t0 + h * 0.52, dy = h * 0.08, wide = W > 600;
				return { n: n, xSrc: xSrc, xScr: xScr, xs: xs, mw: mw, cell: cell, yc: yc, dy: dy, yd: t0 + Math.max(wide ? 82 : 46, h * (wide ? 0.21 : 0.13)), rd: Math.max(13, Math.min(24, h * 0.065, mw * 0.4)), yb: t0 + h - Math.max(30, h * 0.11), rb: Math.max(11, Math.min(20, h * 0.055, cell * 0.17)) };
			}
			function off(g, m) { var n = G.dim(st.spin); return n === 2 ? (m === 0 ? -g.dy : g.dy) : (m - 1) * g.dy; }
			function gapEnd(g, k) { return k + 1 < g.n ? g.xs[k + 1] - g.mw / 2 : g.xScr; }

			/* ---------- tracks ---------- */
			function buildTrack(res, clU) {
				var g = geo(), legs = [], k, x = g.xSrc + 16, ndim = G.dim(st.spin), ms;
				legs.push({ x0: x, x1: g.xs[0] - g.mw / 2, paths: [[[x, g.yc], [g.xs[0] - g.mw / 2, g.yc]]] });
				for (k = 0; k < g.n; k++) {
					var xin = g.xs[k] - g.mw / 2, xe = g.xs[k] + g.mw / 2, o = res.out[k], lastM = k === g.n - 1, xn = gapEnd(g, k), gap = xn - xe;
					if (lastM) {
						var oy = clU != null ? clU * Math.abs(off(g, 0)) * (ndim === 3 ? 1 : 1) : off(g, o);
						legs.push({ x0: xin, x1: g.xScr, paths: [[[xin, g.yc], [xe, g.yc + oy], [g.xScr, g.yc + oy * 2.2]]] });
						return { legs: legs, xEnd: g.xScr, spot: res.spot, cl: clU };
					}
					if (o === "coh") {
						var ps = []; for (ms = 0; ms < ndim; ms++) { var oo = off(g, ms); ps.push([[xin, g.yc], [xe, g.yc + oo], [xe + gap * 0.3, g.yc + oo], [xe + gap * 0.62, g.yc], [xn, g.yc]]); }
						legs.push({ x0: xin, x1: xn, paths: ps, ghost: true }); continue;
					}
					var oy2 = off(g, o);
					if (res.block === k) { legs.push({ x0: xin, x1: xe + gap * 0.22, paths: [[[xin, g.yc], [xe, g.yc + oy2], [xe + gap * 0.22, g.yc + oy2]]] }); return { legs: legs, xEnd: xe + gap * 0.22, block: k, o: o }; }
					legs.push({ x0: xin, x1: xn, paths: [[[xin, g.yc], [xe, g.yc + oy2], [xe + gap * 0.3, g.yc + oy2], [xe + gap * 0.62, g.yc], [xn, g.yc]]] });
				}
				return { legs: legs, xEnd: x };
			}
			function yAt(pts, x) { for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i], u = b[0] > a[0] ? (x - a[0]) / (b[0] - a[0]) : 1; return a[1] + (b[1] - a[1]) * u; } return pts[pts.length - 1][1]; }
			function sampleOne() {
				if (classical()) { var u = G.classical(rnd); return { res: { out: [0], block: -1, spot: -1 }, cl: u }; }
				return { res: G.sample(st.spin, st.src, mags(), rnd), cl: null };
			}
			function land(res, cl) {
				if (cl != null) { cnt.cl++; hits.push({ cl: cl, jx: Q.gauss(rnd), jy: Q.gauss(rnd) }); }
				else if (res.spot >= 0) { cnt.spots[res.spot]++; hits.push({ m: res.spot, jx: Q.gauss(rnd), jy: Q.gauss(rnd) }); }
				else if (res.block >= 0) { cnt.blocked++; cnt.block[res.block][res.out[res.block]]++; }
				if (hits.length > 5000) hits.splice(0, hits.length - 5000);
				dirty = true;
			}
			function fireAnimated() { var s = sampleOne(); cnt.fired++; var tr = buildTrack(s.res, s.cl); atoms.push({ x: tr.legs[0].x0, tr: tr, res: s.res, cl: s.cl, seed: rnd() }); dirty = true; }
			function fireInstant(n) { for (var i = 0; i < n; i++) { var s = sampleOne(); cnt.fired++; land(s.res, s.cl); } }

			/* ---------- drawing ---------- */
			function angTxt(th) { th = ((Math.round(th * 10) / 10) % 360 + 360) % 360; return th === 0 ? "Z" : th === 90 ? "X" : th === 180 ? "−Z" : th === 270 ? "−X" : th + "°"; }
			function draw() {
				var g = ctx, P = geo(), ndim = G.dim(st.spin), labels = G.labels(st.spin), k, m;
				g.setTransform(dpr, 0, 0, dpr, 0, 0);
				var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#090d1c"); bg.addColorStop(1, "#05070f"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
				var fs = Math.max(10, Math.min(13, H * 0.035, P.cell * 0.11));
				g.font = fs + "px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
				// oven
				g.fillStyle = "#3b2414"; g.strokeStyle = "#f97316"; g.lineWidth = 1.5; var ow = Math.max(22, P.xSrc * 0.7), oh = Math.max(30, H * 0.12);
				g.fillRect(P.xSrc - ow / 2, P.yc - oh / 2, ow, oh); g.strokeRect(P.xSrc - ow / 2, P.yc - oh / 2, ow, oh);
				g.fillStyle = "#fdba74"; g.fillText(st.src === "oven" ? "oven" : "prep.", P.xSrc, P.yc + oh / 2 + fs);
				if (st.src !== "oven") g.fillText(st.src === "z" ? "↑ Z" : "→ X", P.xSrc, P.yc - oh / 2 - fs);
				// static beam guides (theory: faint where atoms can go)
				var T = theory, beamCol = "rgba(148,163,184,";
				g.lineWidth = 2;
				for (k = 0; k < P.n; k++) {
					var xin = P.xs[k] - P.mw / 2, xe = P.xs[k] + P.mw / 2, xn = gapEnd(P, k), gap = xn - xe, sk = T.stages[k], lastM = k === P.n - 1, pass = st.mags[k].pass;
					var xprev = k ? P.xs[k - 1] + P.mw / 2 : P.xSrc + ow / 2;
					if (sk.arrive > 1e-9) { g.strokeStyle = beamCol + "0.35)"; g.beginPath(); g.moveTo(k ? xprev + (xin - xprev) * 0.62 : xprev, P.yc); g.lineTo(xin, P.yc); g.stroke(); }
					for (m = 0; m < ndim; m++) {
						var oy = off(P, m), alive = sk.arrive * sk.p[m] > 1e-9; if (classical()) alive = false;
						g.strokeStyle = beamCol + (alive ? "0.35)" : "0.08)");
						g.beginPath(); g.moveTo(xin, P.yc); g.lineTo(xe, P.yc + oy);
						if (lastM) g.lineTo(P.xScr, P.yc + oy * 2.2);
						else if (pass === "coh" || pass === "peek" || pass === m) { g.lineTo(xe + gap * 0.3, P.yc + oy); g.lineTo(xe + gap * 0.62, P.yc); }
						else g.lineTo(xe + gap * 0.22, P.yc + oy);
						g.stroke();
						if (!lastM && typeof pass === "number" && pass !== m) {   // blocker
							var bx = xe + gap * 0.22, bh = Math.max(10, P.dy * 0.55);
							g.fillStyle = "#3f1d1d"; g.fillRect(bx, P.yc + oy - bh / 2, 6, bh); g.fillStyle = "#f87171"; g.fillRect(bx, P.yc + oy - bh / 2, 2, bh);
							var nb = cnt.block[k][m]; if (nb) { g.fillStyle = "#fca5a5"; g.textAlign = "left"; g.fillText(nb.toLocaleString("en-US"), bx + 9, P.yc + oy); g.textAlign = "center"; }
						}
						if (!lastM && P.mw > 34) { g.fillStyle = "#94a3b8"; g.fillText(labels[m].replace("½", ""), xe + Math.max(9, gap * 0.08), P.yc + oy - fs * 0.9); }
					}
					if (!lastM && (pass === "coh" || pass === "peek")) {   // recombiner
						var rx = xe + gap * 0.46; g.strokeStyle = "#64748b"; g.lineWidth = 1; g.strokeRect(rx - gap * 0.16, P.yc - P.dy * 1.25, gap * 0.32, P.dy * 2.5); g.lineWidth = 2;
						g.fillStyle = pass === "peek" ? "#fbbf24" : "#94a3b8"; g.fillText(pass === "peek" ? "watched" : "recombine", rx, P.yc - P.dy * 1.25 - fs * 0.8);
						if (pass === "peek") { g.strokeStyle = "#fbbf24"; g.beginPath(); g.ellipse(rx, P.yc + P.dy * 1.25 + fs * 0.9, fs * 0.75, fs * 0.42, 0, 0, 2 * Math.PI); g.stroke(); g.beginPath(); g.arc(rx, P.yc + P.dy * 1.25 + fs * 0.9, fs * 0.2, 0, 2 * Math.PI); g.fill(); }
					}
				}
				// magnets
				for (k = 0; k < P.n; k++) {
					var x = P.xs[k], mh = P.dy * 2 + Math.max(24, H * 0.1), th = st.mags[k].th;
					var mg = g.createLinearGradient(0, P.yc - mh / 2, 0, P.yc + mh / 2); mg.addColorStop(0, "#7f1d1d"); mg.addColorStop(0.42, "#2b3350"); mg.addColorStop(0.58, "#2b3350"); mg.addColorStop(1, "#1e3a8a");
					g.globalAlpha = 0.85; g.fillStyle = mg; g.fillRect(x - P.mw / 2, P.yc - mh / 2, P.mw, mh); g.globalAlpha = 1;
					g.strokeStyle = k === sel ? "#a5b4fc" : "#475569"; g.lineWidth = k === sel ? 2 : 1; g.strokeRect(x - P.mw / 2, P.yc - mh / 2, P.mw, mh);
					g.fillStyle = "#e2e8f0"; g.fillText((P.mw > 60 ? "magnet " : "") + (k + 1), x, P.yc + mh / 2 + fs);
					// dial
					var yd = P.yd, rd = P.rd;
					g.fillStyle = "#0f1530"; g.beginPath(); g.arc(x, yd, rd, 0, 2 * Math.PI); g.fill(); g.strokeStyle = hover === k ? "#a5b4fc" : "#3a4466"; g.lineWidth = hover === k ? 2.5 : 1.5; g.stroke();
					var dx = Math.sin(th * D), dyy = -Math.cos(th * D);
					g.strokeStyle = "#c7d2fe"; g.lineWidth = 3; g.lineCap = "round"; g.beginPath(); g.moveTo(x - dx * rd * 0.55, yd - dyy * rd * 0.55); g.lineTo(x + dx * rd * 0.8, yd + dyy * rd * 0.8); g.stroke();
					g.fillStyle = "#c7d2fe"; g.beginPath(); var hx = x + dx * rd * 0.95, hy = yd + dyy * rd * 0.95, s2 = rd * 0.3; g.moveTo(hx, hy); g.lineTo(hx - dx * s2 - dyy * s2 * 0.6, hy - dyy * s2 + dx * s2 * 0.6); g.lineTo(hx - dx * s2 + dyy * s2 * 0.6, hy - dyy * s2 - dx * s2 * 0.6); g.closePath(); g.fill();
					g.fillStyle = "#e7ebf6"; g.font = "700 " + Math.round(fs * 1.05) + "px system-ui, sans-serif"; g.fillText(angTxt(th), x, yd - rd - fs * 0.9); g.font = fs + "px system-ui, sans-serif";
				}
				// spin of the beam arriving at each magnet
				for (k = 0; k < P.n; k++) {
					var bx2 = P.xs[k] - P.mw / 2 - Math.min(P.cell * 0.25, Math.max(P.rb + 4, (P.cell - P.mw) * 0.5)), by = P.yb, rb = P.rb, sk2 = T.stages[k];
					if (k === 0) bx2 = Math.max(rb + 4, (P.xSrc + ow / 2 + P.xs[0] - P.mw / 2) / 2);
					g.strokeStyle = "#334155"; g.lineWidth = 1; g.beginPath(); g.arc(bx2, by, rb, 0, 2 * Math.PI); g.stroke();
					g.beginPath(); g.moveTo(bx2, by - rb); g.lineTo(bx2, by + rb); g.moveTo(bx2 - rb, by); g.lineTo(bx2 + rb, by); g.strokeStyle = "#1e293b"; g.stroke();
					if (sk2.arrive < 1e-9) { g.fillStyle = "#64748b"; g.fillText("none", bx2, by); continue; }
					var v = sk2.vec;
					if (v.len < 0.02) { g.fillStyle = "#facc15"; g.beginPath(); g.arc(bx2, by, 3, 0, 2 * Math.PI); g.fill(); g.fillStyle = "#94a3b8"; g.fillText(sk2.amp ? "no net spin" : "mixed", bx2, by + rb + fs * 0.9); }
					else {
						var ex = bx2 + v.x * rb, ey = by - v.z * rb; g.strokeStyle = "#facc15"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(bx2, by); g.lineTo(ex, ey); g.stroke();
						g.fillStyle = "#facc15"; g.beginPath(); g.arc(ex, ey, 3, 0, 2 * Math.PI); g.fill();
						if (!sk2.amp) { g.fillStyle = "#94a3b8"; g.fillText("partly mixed", bx2, by + rb + fs * 0.9); }
					}
				}
				// screen
				var sw = Math.max(8, W * 0.012); g.fillStyle = "#11172b"; g.fillRect(P.xScr - sw / 2, P.yc - P.dy * 3.2, sw, P.dy * 6.4); g.strokeStyle = "#475569"; g.lineWidth = 1; g.strokeRect(P.xScr - sw / 2, P.yc - P.dy * 3.2, sw, P.dy * 6.4);
				if (classical()) { g.fillStyle = "rgba(244,114,182,0.12)"; g.fillRect(P.xScr - sw * 1.6, P.yc - Math.abs(off(P, 0)) * 2.2, sw * 3.2, Math.abs(off(P, 0)) * 4.4); }
				var sig = Math.max(1.5, P.dy * 0.16), alpha = Math.max(0.25, Math.min(0.9, 400 / (hits.length + 1)));
				g.fillStyle = "rgba(226,232,240," + alpha + ")";
				for (var i = 0; i < hits.length; i++) { var h = hits[i], yy = h.cl != null ? P.yc + h.cl * Math.abs(off(P, 0)) * 2.2 + h.jy * sig * 0.4 : P.yc + off(P, h.m) * 2.2 + h.jy * sig; g.fillRect(P.xScr + h.jx * sw * 0.22 - 1, yy - 1, 2, 2); }
				// spot counts
				var done = cnt.spots[0] + cnt.spots[1] + cnt.spots[2];
				g.textAlign = "right"; g.fillStyle = "#e2e8f0";
				if (!classical()) for (m = 0; m < ndim; m++) {
					var yy2 = P.yc + off(P, m) * 2.2, txt = cnt.spots[m].toLocaleString("en-US") + (done ? " (" + (100 * cnt.spots[m] / done).toFixed(1) + "%)" : "");
					g.fillText(txt, P.xScr - sw - 6, yy2 + (ndim === 3 && m === 1 ? fs * 1.1 : (off(P, m) < 0 ? -fs * 1.1 : fs * 1.1)));
				}
				else if (cnt.cl) { g.fillText(cnt.cl.toLocaleString("en-US") + " atoms: a smear", P.xScr - sw - 6, P.yc - P.dy * 3.2 - fs * 0.2); }
				g.textAlign = "center";
				// atoms in flight
				for (i = 0; i < atoms.length; i++) {
					var a = atoms[i], leg = null; for (var L = 0; L < a.tr.legs.length; L++) if (a.x <= a.tr.legs[L].x1) { leg = a.tr.legs[L]; break; }
					if (!leg) continue;
					leg.paths.forEach(function (pts) {
						var y = yAt(pts, a.x), r = leg.ghost ? 3.2 : 3.5; g.globalAlpha = leg.ghost ? 0.5 : 1;
						g.fillStyle = "rgba(226,232,240,0.25)"; g.beginPath(); g.arc(a.x, y, r * 2.2, 0, 2 * Math.PI); g.fill();
						g.fillStyle = leg.ghost ? "#c4b5fd" : "#f1f5f9"; g.beginPath(); g.arc(a.x, y, r, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1;
					});
				}
			}

			/* ---------- HTML ---------- */
			function pc(x) { return (100 * x).toFixed(x < 0.0995 && x > 0 ? 2 : 1).replace(/\.0+$/, "") + "%"; }
			function updUI() {
				var T = theory, ndim = G.dim(st.spin), labels = G.labels(st.spin), done = cnt.spots[0] + cnt.spots[1] + cnt.spots[2] + cnt.blocked;
				$("qm-sg-n").textContent = cnt.fired.toLocaleString("en-US");
				if (classical()) {
					$("qm-sg-thr").textContent = cnt.cl ? "100%" : "–"; $("qm-sg-thrt").textContent = "100%";
					$("qm-sg-spots").textContent = cnt.cl ? "a continuous smear" : "–"; $("qm-sg-spotst").textContent = "classical: a smear (real atoms: 2 spots)";
				} else {
					var reach = cnt.spots[0] + cnt.spots[1] + cnt.spots[2];
					$("qm-sg-thr").textContent = done ? reach.toLocaleString("en-US") + " (" + pc(reach / done) + ")" : "–";
					$("qm-sg-thrt").textContent = pc(T.through) + " of all atoms";
					var a = [], b = []; for (var m = 0; m < ndim; m++) { a.push(labels[m] + " " + (reach ? pc(cnt.spots[m] / reach) : "–")); b.push(labels[m] + " " + (T.through > 1e-12 ? pc(T.screen[m] / T.through) : "–")); }
					$("qm-sg-spots").textContent = a.join(" · "); $("qm-sg-spotst").textContent = b.join(" · ");
				}
				var rows = "";
				T.stages.forEach(function (s, k) {
					var mg = st.mags[k], beamTxt = s.arrive < 1e-12 ? "none" : !s.amp ? (s.vec.len < 0.02 ? "unpolarized mixture" : "partly mixed") : (s.vec.len < 0.02 ? "pure, no net spin" : "pure, spin at " + angTxt(Math.round(((Math.atan2(s.vec.x, s.vec.z) / D) % 360 + 360) % 360 * 10) / 10));
					var amp = s.amp ? s.amp.map(function (x, m) { return labels[m] + ": " + Q.fmt(Math.abs(x) < 1e-12 ? 0 : x, 3).replace("-", "−"); }).join(", ") : "–";
					var pr = s.arrive < 1e-12 ? "–" : s.p.map(function (x, m) { return labels[m] + ": " + pc(x); }).join(", ");
					rows += "<tr><td>" + (k + 1) + "</td><td>" + angTxt(mg.th) + "</td><td>" + beamTxt + "</td><td>" + amp + "</td><td>" + pr + "</td><td>" + pc(s.arrive) + "</td></tr>";
				});
				$("qm-sg-tbl").tBodies[0].innerHTML = rows;
				$("qm-sg-badge").textContent = (st.spin === 1 ? "Spin ½" : "Spin 1") + " · " + (st.src === "oven" ? "hot oven" : st.src === "z" ? "prepared ↑ Z" : "prepared → X") + (classical() ? " · classical prediction" : "");
				dirty = false;
			}
			function passLabel(p, ndim) { var L = G.labels(st.spin); return typeof p === "number" ? "Let " + L[p] + " through" + (ndim === 2 ? " (block " + L[1 - p] + ")" : "") : p === "coh" ? "Recombine all (nothing records the path)" : "Recombine, but watch which path"; }
			function buildRows() {
				var box = $("qm-sg-mags"), ndim = G.dim(st.spin), h = "";
				st.mags.forEach(function (mg, k) {
					var last = k === st.mags.length - 1, opts = "";
					if (!last) { for (var m = 0; m < ndim; m++) opts += '<option value="' + m + '">' + passLabel(m, ndim) + "</option>"; opts += '<option value="coh">' + passLabel("coh") + '</option><option value="peek">' + passLabel("peek") + "</option>"; }
					else opts = "<option>All outputs go to the screen</option>";
					h += '<div class="qm-sg-mrow"><b>Magnet ' + (k + 1) + '</b><input type="range" min="0" max="360" step="1" data-k="' + k + '" class="qm-sg-ang" aria-label="Magnet ' + (k + 1) + ' angle"><input type="number" step="1" data-k="' + k + '" class="qm-sg-angn tu-input" aria-label="Magnet ' + (k + 1) + ' angle in degrees"><span>&deg;</span>' +
						'<select data-k="' + k + '" class="qm-sg-pass tu-input" aria-label="Magnet ' + (k + 1) + ' outputs"' + (last ? " disabled" : "") + ">" + opts + "</select></div>";
				});
				box.innerHTML = h; syncControls();
			}
			function syncControls() {
				$("qm-sg-spin").value = st.spin; $("qm-sg-src").value = st.src; $("qm-sg-rate").value = st.rate; $("qm-sg-cnt").textContent = st.mags.length; $("qm-sg-cl").checked = !!st.cl;
				$("qm-sg-cl").disabled = st.mags.length !== 1; $("qm-sg-clwrap").style.opacity = st.mags.length === 1 ? "" : "0.55";
				var r = rate(); $("qm-sg-ratev").textContent = r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString("en-US");
				st.mags.forEach(function (mg, k) {
					var a = panel.querySelector('.qm-sg-ang[data-k="' + k + '"]'), n = panel.querySelector('.qm-sg-angn[data-k="' + k + '"]'), s = panel.querySelector('.qm-sg-pass[data-k="' + k + '"]');
					if (a) a.value = mg.th; if (n && document.activeElement !== n) n.value = mg.th; if (s && k < st.mags.length - 1) s.value = String(mg.pass);
				});
				$("qm-sg-beam").textContent = beam ? "Beam off" : "Beam on"; $("qm-sg-beam").setAttribute("aria-pressed", beam ? "true" : "false");
			}
			function changed(rows) { fixPass(); recompute(); resetCounts(); if (rows) buildRows(); else syncControls(); api.save(); updUI(); draw(); setPressed(null); }
			function setPressed(p) { Array.prototype.forEach.call($("qm-sg-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === p ? "true" : "false"); }); }
			function setAngle(k, v) { v = Math.round(v); v = ((v % 360) + 360) % 360; if (st.mags[k].th === v) return; st.mags[k].th = v; fixPass(); recompute(); resetCounts(); syncControls(); dirty = true; draw(); }
			$("qm-sg-mags").addEventListener("input", function (e) { var t = e.target, k = +t.dataset.k; if (t.classList.contains("qm-sg-ang")) { sel = k; setAngle(k, +t.value); api.save(); } });
			$("qm-sg-mags").addEventListener("change", function (e) {
				var t = e.target, k = +t.dataset.k;
				if (t.classList.contains("qm-sg-angn")) { var v = parseFloat(t.value); if (isFinite(v)) { setAngle(k, v); api.save(); updUI(); } }
				if (t.classList.contains("qm-sg-pass")) { st.mags[k].pass = t.value === "coh" || t.value === "peek" ? t.value : +t.value; changed(false); }
			});
			$("qm-sg-spin").addEventListener("change", function () { st.spin = +this.value; changed(true); });
			$("qm-sg-src").addEventListener("change", function () { st.src = this.value; changed(false); });
			$("qm-sg-rate").addEventListener("input", function () { st.rate = +this.value; syncControls(); api.save(); });
			$("qm-sg-cl").addEventListener("change", function () { st.cl = this.checked; changed(false); });
			$("qm-sg-plus").addEventListener("click", function () { if (st.mags.length >= 4) { api.toast("Up to four magnets"); return; } var lastM = st.mags[st.mags.length - 1]; lastM.pass = lastM.pass == null ? 0 : lastM.pass; st.mags.push({ th: 0, pass: 0 }); changed(true); });
			$("qm-sg-minus").addEventListener("click", function () { if (st.mags.length <= 1) return; st.mags.pop(); changed(true); });
			$("qm-sg-link").addEventListener("click", function () {
				var u = new URL(location.href); u.search = "";
				if ($("qm").getAttribute("data-views").split(",")[0] !== "sg") u.searchParams.set("tab", "sg");
				u.searchParams.set("sg_s", st.spin); u.searchParams.set("sg_src", st.src);
				u.searchParams.set("sg_m", st.mags.map(function (m) { return m.th + ":" + (m.pass === "coh" ? "c" : m.pass === "peek" ? "w" : m.pass); }).join(","));
				api.copy(u.toString(), "Link copied");
			});
			var PRE = {
				"1922": { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }] }, zz: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 0, pass: 0 }] },
				zx: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: 0 }] }, zxz: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: 0 }, { th: 0, pass: 0 }] },
				coh: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: "coh" }, { th: 0, pass: 0 }] }, peek: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: "peek" }, { th: 0, pass: 0 }] },
				z60: { spin: 1, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 60, pass: 0 }] }, s1: { spin: 2, src: "oven", mags: [{ th: 0, pass: 0 }, { th: 90, pass: 0 }] }
			};
			$("qm-sg-pre").addEventListener("click", function (e) {
				var b = e.target.closest("button"); if (!b) return; var p = PRE[b.dataset.p]; if (!p) return;
				st.spin = p.spin; st.src = p.src; st.mags = JSON.parse(JSON.stringify(p.mags)); st.cl = false; sel = 0;
				changed(true); setPressed(b.dataset.p); setBeam(true);
			});
			function setBeam(v) { beam = v; syncControls(); if (v) loop(); }
			$("qm-sg-beam").addEventListener("click", function () { setBeam(!beam); });
			$("qm-sg-one").addEventListener("click", function () { fireAnimated(); loop(); });
			$("qm-sg-k").addEventListener("click", function () { fireInstant(1000); updUI(); draw(); });
			$("qm-sg-reset").addEventListener("click", function () { resetCounts(); updUI(); draw(); });
			$("qm-sg-fs").addEventListener("click", function () { if (document.fullscreenElement === wrap) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); });
			document.addEventListener("fullscreenchange", function () { setTimeout(layout, 50); });

			/* ---------- pointer: dials and outputs ---------- */
			var drag = null, hover = null;
			function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
			function dialAt(px, py) { var P = geo(); for (var k = 0; k < P.n; k++) if (Math.hypot(px - P.xs[k], py - P.yd) < P.rd * 1.5) return k; return -1; }
			function outputAt(px, py) {
				var P = geo(), ndim = G.dim(st.spin);
				for (var k = 0; k < P.n - 1; k++) { var xe = P.xs[k] + P.mw / 2, gap = gapEnd(P, k) - xe; if (px < xe - 4 || px > xe + gap * 0.4) continue; for (var m = 0; m < ndim; m++) if (Math.abs(py - (P.yc + off(P, m))) < Math.max(10, P.dy * 0.45)) return [k, m]; }
				return null;
			}
			function angleAt(k, px, py) { var P = geo(), a = Math.atan2(px - P.xs[k], -(py - P.yd)) / D; a = ((a % 360) + 360) % 360; var sn = Math.round(a / 15) * 15; if (Math.abs(a - sn) < 3) a = sn; return a; }
			cv.addEventListener("touchstart", function (e) { var p = pos(e.touches[0]); if (dialAt(p[0], p[1]) >= 0) e.preventDefault(); }, { passive: false });
			cv.addEventListener("pointerdown", function (e) {
				var p = pos(e), k = dialAt(p[0], p[1]);
				if (k >= 0) { drag = k; sel = k; cv.setPointerCapture(e.pointerId); e.preventDefault(); setAngle(k, angleAt(k, p[0], p[1])); return; }
				var o = outputAt(p[0], p[1]);
				if (o) { var mg = st.mags[o[0]]; mg.pass = mg.pass === o[1] ? "coh" : o[1]; sel = o[0]; changed(false); }
			});
			cv.addEventListener("pointermove", function (e) {
				var p = pos(e);
				if (drag != null) { setAngle(drag, angleAt(drag, p[0], p[1])); return; }
				var k = dialAt(p[0], p[1]), o = k < 0 ? outputAt(p[0], p[1]) : null, h = k >= 0 ? k : null;
				cv.style.cursor = k >= 0 ? "grab" : o ? "pointer" : "";
				if (h !== hover) { hover = h; if (!raf) draw(); }
			});
			function endDrag() { if (drag == null) return; drag = null; api.save(); updUI(); }
			cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
			cv.addEventListener("keydown", function (e) {
				if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setAngle(sel, st.mags[sel].th + (e.key === "ArrowRight" ? 5 : -5)); api.save(); updUI(); }
				else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : st.mags.length - 1)) % st.mags.length; draw(); }
				else if (e.key === " " || e.key === "Enter") { e.preventDefault(); fireAnimated(); loop(); }
			});

			/* ---------- layout + loop ---------- */
			function layout() {
				dpr = Math.min(2, window.devicePixelRatio || 1); W = stage.clientWidth || 700;
				PAD = runPad(stage); var nat = Math.round(Q.clamp(W * 0.5, 320, 470)) + PAD[0] + PAD[1];
				if (document.fullscreenElement === wrap) { var other = 0; Array.prototype.forEach.call(wrap.children, function (c) { if (c !== stage) other += c.offsetHeight; }); H = Math.max(260, window.innerHeight - other); }
				else H = Math.round(window.MESStage ? window.MESStage.sh(stage, nat) : nat);
				stage.style.height = H + "px"; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
				atoms.forEach(function (a) { var f = (a.x - a.tr.legs[0].x0) / Math.max(1, a.tr.xEnd - a.tr.legs[0].x0); a.tr = buildTrack(a.res, a.cl); a.x = a.tr.legs[0].x0 + f * (a.tr.xEnd - a.tr.legs[0].x0); });
				draw();
			}
			function frame(ts) {
				raf = 0; if (!running) return;
				var now = ts / 1000, dt = last ? Math.min(0.1, now - last) : 0; last = now;
				if (beam) {
					var r = rate(); carry += r * dt; var n = Math.min(4000, Math.floor(carry)); carry -= n;
					if (n > 0) { if (r <= 30 && atoms.length < 80) { for (var i = 0; i < n; i++) fireAnimated(); } else { fireInstant(n - 1); fireAnimated(); } }
				}
				var v = W / 1.7;
				for (var j = atoms.length - 1; j >= 0; j--) { var a = atoms[j]; a.x += v * dt; if (a.x >= a.tr.xEnd) { atoms.splice(j, 1); land(a.res, a.cl); } }
				draw();
				if (dirty && now - uiT > 0.15) { uiT = now; updUI(); }
				if (beam || atoms.length) raf = requestAnimationFrame(frame); else if (dirty) updUI();
			}
			function loop() { if (running && !raf) { last = 0; raf = requestAnimationFrame(frame); } }
			this._start = function () { running = true; layout(); updUI(); loop(); };
			this._stop = function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
			if (window.ResizeObserver) new ResizeObserver(function () { if (running) layout(); }).observe(stage);
			window.addEventListener("resize", function () { if (running) layout(); });
			buildRows();
			window.MESQuantumDebug_sg = { fire: function (n) { fireInstant(n || 1000); updUI(); draw(); return { cnt: cnt, theory: theory }; }, state: st, theory: function () { return theory; },
				step: function (sec) { var t = performance.now(); running = true; last = t; frame(t + (sec || 0.1) * 1000); } };
		},
		show: function () { if (this._start) this._start(); },
		hide: function () { if (this._stop) this._stop(); }
	});
})();
