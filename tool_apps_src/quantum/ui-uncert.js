/* MES Quantum Lab: Uncertainty tab (wave packet <-> momentum distribution via FFT, free spreading, single slit, real-scale calculator) */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var U = Q.uncert, S = Q.slit, C = Q.C;

	Q.reg("uncert", {
		init: function (panel, api) {
			var $ = function (id) { return document.getElementById(id); };
			var st = api.st, q = api.query;
			var D0 = { shape: "gauss", w: 1, k: 0, spd: 0, reim: false, sa: -7, sE: 2, ex: "atom", m: C.me, x: 1e-10 };
			Object.keys(D0).forEach(function (k) { if (st[k] == null) st[k] = D0[k]; });
			if (q.get("un_s") && U.SHAPES[q.get("un_s")]) st.shape = q.get("un_s");
			var qw = Number(q.get("un_w")); if (q.get("un_w") && qw > 0) st.w = Q.clamp(qw, 0.32, 7);
			var qk = Number(q.get("un_k")); if (q.get("un_k") && isFinite(qk)) st.k = Q.clamp(qk, -3, 3);

			var G = U.grid(2048, 400), psi0, s0, phi0, cur, t = 0, playing = false, raf = 0, lastT = 0, shown = false, hist = [], XR = 24, PR = 5;
			var wrap = $("qm-un-wrap"), stage = $("qm-un-stage"), cv = $("qm-un-cv"), ctx = cv.getContext("2d"), L = {};

			function build() {
				psi0 = U.make(G, st.shape, st.w, st.k); s0 = U.stats(G, psi0); phi0 = s0.phi; cur = s0; t = 0; hist = [[0, s0.dx]]; XR = 24; PR = 5;
				if (playing) toggle(false);
				readouts(); draw();
			}
			function at(time) { t = time; cur = time === 0 ? s0 : U.stats(G, U.evolve(G, phi0, time)); }
			function readouts() {
				$("qm-un-r-dx").textContent = Q.fmt(cur.dx, 3) + " u";
				$("qm-un-r-dp").textContent = Q.fmt(cur.dk, 3) + " ħ/u";
				$("qm-un-r-pr").textContent = Q.fmt(cur.dx * cur.dk, 4) + " ħ";
				var r = cur.dx * cur.dk / 0.5;
				$("qm-un-r-ratio").textContent = r < 1.0005 ? "1.000 × ħ/2 (the minimum)" : r.toFixed(3) + " × ħ/2" + (t > 0 ? " (Δx grows, Δp stays)" : "");
				$("qm-un-r-t").textContent = Q.fmt(t, 3);
				$("qm-un-r-f").textContent = Q.fmt(U.spread(s0.dx, s0.dk, t), 3) + " u";
				$("qm-un-wv").textContent = st.w.toFixed(2) + " u"; $("qm-un-kv").textContent = st.k.toFixed(2) + " ħ/u";
				$("qm-un-spdv").textContent = Number(Math.pow(10, st.spd).toPrecision(2)) + "×";
			}
			function sync() {
				$("qm-un-w").value = Math.log10(st.w); $("qm-un-k").value = st.k; $("qm-un-spd").value = st.spd; $("qm-un-reim").checked = st.reim;
				Array.prototype.forEach.call($("qm-un-shape").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.s === st.shape ? "true" : "false"); });
			}
			var linkT = 0;
			function link() { clearTimeout(linkT); linkT = setTimeout(function () { api.setQuery({ un_s: st.shape === "gauss" ? null : st.shape, un_w: Number(st.w.toPrecision(3)), un_k: st.k ? st.k : null }); }, 400); }
			function changed() { api.save(); link(); build(); }
			$("qm-un-shape").addEventListener("click", function (e) { var b = e.target.closest("button[data-s]"); if (!b) return; st.shape = b.dataset.s; sync(); changed(); });
			$("qm-un-w").addEventListener("input", function () { st.w = Math.pow(10, +this.value); changed(); });
			$("qm-un-k").addEventListener("input", function () { st.k = +this.value; changed(); });
			$("qm-un-spd").addEventListener("input", function () { st.spd = +this.value; api.save(); readouts(); });
			$("qm-un-reim").addEventListener("change", function () { st.reim = this.checked; api.save(); draw(); });
			$("qm-un-link").addEventListener("click", function () { link(); setTimeout(function () { api.copy(location.href, "Link copied"); }, 450); });
			$("qm-un-go").addEventListener("click", function () { toggle(!playing); });
			$("qm-un-reset").addEventListener("click", build);
			$("qm-un-fs").addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {}); });
			document.addEventListener("fullscreenchange", function () { $("qm-un-fs").textContent = document.fullscreenElement === wrap ? "Exit full screen" : "Full screen"; size(); draw(); });
			function toggle(on) {
				playing = on; var b = $("qm-un-go"); b.textContent = on ? "Pause" : (t > 0 ? "Continue" : "Let it go"); b.setAttribute("aria-pressed", on ? "true" : "false");
				lastT = 0; if (on) loop(); else cancelAnimationFrame(raf);
			}
			function loop() {
				cancelAnimationFrame(raf); if (!shown || !playing) return;
				raf = requestAnimationFrame(function (now) {
					var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
					stepTime(dt * 3 * Math.pow(10, st.spd)); loop();
				});
			}
			function stepTime(dt) {
				at(t + dt);
				if (!hist.length || t - hist[hist.length - 1][0] > 0.02 * Math.max(1, t)) hist.push([t, cur.dx]);
				var need = Math.abs(cur.x) + 3.3 * cur.dx;
				if (need > XR) XR = Math.min(190, need * 1.25);
				if (Math.abs(cur.x) + 4 * cur.dx > 180) toggle(false); /* stop before the packet wraps around the box */
				readouts(); draw();
			}

			/* ---------- drawing ---------- */
			function size() {
				var W = stage.parentNode.clientWidth || 600, phone = W < 560, nat = Math.round(phone ? W * 1.3 + 46 : Q.clamp(W * 0.48, 300, 600)), H = nat;
				if (document.fullscreenElement === wrap) H = Math.max(260, window.innerHeight - wrap.querySelector(".qm-legend").offsetHeight - wrap.querySelector(".qm-readouts").offsetHeight);
				else if (window.MESStage) H = MESStage.sh(stage, nat);
				stage.style.height = H + "px";
				var dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
				var pad = 8, gap = 10;
				if (phone) { var Hb = H - 46, h1 = (Hb - 3 * gap) * 0.36, h3 = Hb - 3 * gap - 2 * h1; L = { x: [pad, gap, W - 2 * pad, h1], p: [pad, 2 * gap + h1, W - 2 * pad, h1], c: [pad, 3 * gap + 2 * h1, W - 2 * pad, h3 - 4] }; }
				else { var top = (H - 2 * gap) * 0.62, half = (W - 2 * pad - gap) / 2; L = { x: [pad, gap, half, top], p: [pad + half + gap, gap, half, top], c: [pad, 2 * gap + top, W - 2 * pad, H - 3 * gap - top] }; }
				L.W = W; L.H = H; L.dpr = dpr;
			}
			new ResizeObserver(function () { size(); draw(); }).observe(stage.parentNode);
			function frame(g, r, title) {
				g.fillStyle = "#0c1020"; g.fillRect(r[0], r[1], r[2], r[3]);
				g.strokeStyle = "#273049"; g.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
				g.fillStyle = "rgba(231,235,246,0.9)"; g.font = "12px system-ui, sans-serif"; g.textBaseline = "top"; g.fillText(title, r[0] + 8, r[1] + 6);
			}
			function curve(g, r, xs, ys, lo, hi, col, fill) {
				var ax = r[0] + 6, aw = r[2] - 12, base = r[1] + r[3] - 18, ah = r[3] - 60, mx = 0, i;
				for (i = 0; i < ys.length; i++) if (ys[i] > mx) mx = ys[i];
				if (!mx) return;
				g.beginPath(); g.moveTo(ax + (xs[0] - lo) / (hi - lo) * aw, base);
				for (i = 0; i < xs.length; i++) g.lineTo(ax + (xs[i] - lo) / (hi - lo) * aw, base - ys[i] / mx * ah);
				g.lineTo(ax + (xs[xs.length - 1] - lo) / (hi - lo) * aw, base);
				if (fill) { g.fillStyle = fill; g.fill(); }
				g.strokeStyle = col; g.lineWidth = 1.6; g.stroke();
			}
			function axis(g, r, lo, hi, unit) {
				var ax = r[0] + 6, aw = r[2] - 12, base = r[1] + r[3] - 18, span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 4))), m = span / step;
				if (m > 20) step *= 5; else if (m > 8) step *= 2;
				g.strokeStyle = "#3a4562"; g.beginPath(); g.moveTo(ax, base); g.lineTo(ax + aw, base); g.stroke();
				g.fillStyle = "rgba(154,166,192,0.95)"; g.font = "10px system-ui, sans-serif"; g.textBaseline = "top"; g.textAlign = "center";
				for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) { var X = ax + (v - lo) / span * aw; g.fillRect(X, base, 1, 3); g.fillText(Number(v.toPrecision(3)) + "", X, base + 4); }
				g.textAlign = "right"; g.fillText(unit, ax + aw, r[1] + 7); g.textAlign = "left";
			}
			function spread(g, r, mean, sd, lo, hi, label) {
				var ax = r[0] + 6, aw = r[2] - 12, base = r[1] + r[3] - 18, y = r[1] + 44, x1 = ax + (mean - sd - lo) / (hi - lo) * aw, x2 = ax + (mean + sd - lo) / (hi - lo) * aw;
				g.strokeStyle = "rgba(250,204,21,0.9)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x1, y); g.lineTo(x1, base); g.moveTo(x2, y); g.lineTo(x2, base); g.stroke(); g.setLineDash([]);
				g.beginPath(); g.moveTo(x1, y + 4); g.lineTo(x2, y + 4); g.stroke();
				g.fillStyle = "#facc15"; g.font = "11px system-ui, sans-serif"; g.textBaseline = "bottom"; g.textAlign = "center";
				g.fillText(label, Q.clamp((x1 + x2) / 2, ax + 40, ax + aw - 40), y + 2); g.textAlign = "left";
			}
			function draw() {
				if (!L.W || !cur) return;
				var g = ctx; g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.fillStyle = "#070a14"; g.fillRect(0, 0, L.W, L.H);
				var i, xs = [], ys = [], rs = [], psi = t === 0 ? psi0 : U.evolve(G, phi0, t), lo = -XR, hi = XR;
				var i0 = Math.max(0, Math.floor((lo + 200) / G.dx)), i1 = Math.min(G.n - 1, Math.ceil((hi + 200) / G.dx)), stp = Math.max(1, Math.round((i1 - i0) / 900));
				for (i = i0; i <= i1; i += stp) { xs.push(G.x[i]); ys.push(cur.px[i]); rs.push(psi.re[i]); }
				frame(g, L.x, "Position  |ψ(x)|²"); axis(g, L.x, lo, hi, "x (u)");
				if (st.reim) {
					var mx = 0; for (i = 0; i < ys.length; i++) mx = Math.max(mx, ys[i]);
					var ax = L.x[0] + 6, aw = L.x[2] - 12, base = L.x[1] + L.x[3] - 18, ah = L.x[3] - 60, sq = Math.sqrt(mx);
					g.strokeStyle = "rgba(167,139,250,0.85)"; g.lineWidth = 1; g.beginPath();
					for (i = 0; i < xs.length; i++) { var X = ax + (xs[i] - lo) / (hi - lo) * aw, Y = base - ah / 2 - rs[i] / sq * ah / 2; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
					g.stroke();
				}
				curve(g, L.x, xs, ys, lo, hi, "#22d3ee", "rgba(34,211,238,0.22)");
				spread(g, L.x, cur.x, cur.dx, lo, hi, "Δx = " + Q.fmt(cur.dx, 3));
				/* momentum: FFT bins sorted */
				var ks = [], kp = [], n = G.n, plo = cur.k - PR, phi = PR + cur.k;
				plo = Math.min(-PR, st.k - PR); phi = Math.max(PR, st.k + PR);
				for (i = n / 2; i < n; i++) if (G.k[i] >= plo) { ks.push(G.k[i]); kp.push(cur.pk[i]); }
				for (i = 0; i < n / 2; i++) if (G.k[i] <= phi) { ks.push(G.k[i]); kp.push(cur.pk[i]); }
				frame(g, L.p, "Momentum  |φ(p)|²"); axis(g, L.p, plo, phi, "p (ħ/u)");
				curve(g, L.p, ks, kp, plo, phi, "#f472b6", "rgba(244,114,182,0.22)");
				spread(g, L.p, cur.k, cur.dk, plo, phi, "Δp = " + Q.fmt(cur.dk, 3));
				/* Δx(t) chart */
				var r = L.c; frame(g, r, "Spreading: Δx(t)");
				var tmax = Math.max(4, t * 1.15), xmax = Math.max(U.spread(s0.dx, s0.dk, tmax), s0.dx * 1.5) * 1.1, cx = r[0] + 44, cw = r[2] - 56, cb = r[1] + r[3] - 18, ch = r[3] - 40;
				g.strokeStyle = "#3a4562"; g.beginPath(); g.moveTo(cx, r[1] + 22); g.lineTo(cx, cb); g.lineTo(cx + cw, cb); g.stroke();
				g.fillStyle = "rgba(154,166,192,0.95)"; g.font = "10px system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "right";
				g.fillText(Q.fmt(xmax, 2), cx - 4, r[1] + 26); g.fillText("0", cx - 4, cb); g.textAlign = "left"; g.textBaseline = "top";
				g.fillText("t = " + Q.fmt(tmax, 2), cx + cw - 60, cb + 4);
				g.strokeStyle = "#a3e635"; g.lineWidth = 1.5; g.beginPath();
				for (i = 0; i <= 120; i++) { var tt = tmax * i / 120, X2 = cx + tt / tmax * cw, Y2 = cb - U.spread(s0.dx, s0.dk, tt) / xmax * ch; if (i) g.lineTo(X2, Y2); else g.moveTo(X2, Y2); }
				g.stroke();
				g.fillStyle = "#facc15";
				for (i = 0; i < hist.length; i++) { g.beginPath(); g.arc(cx + hist[i][0] / tmax * cw, cb - hist[i][1] / xmax * ch, 2.4, 0, 7); g.fill(); }
				g.fillStyle = "rgba(231,235,246,0.85)"; g.font = "11px system-ui, sans-serif";
				g.fillText(t > 0 ? "simulation (dots) vs formula √(Δx₀² + (Δp t/m)²) (line)" : "press “Let it go” to release the packet", cx + 8, r[1] + 24);
			}
			/* drag sideways on the position plot: change the width */
			var drag = null;
			cv.addEventListener("pointerdown", function (e) {
				var rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, b = L.x;
				if (!b || x < b[0] || x > b[0] + b[2] || y < b[1] || y > b[1] + b[3]) return;
				drag = { x: e.clientX, w: st.w }; cv.setPointerCapture(e.pointerId);
			});
			cv.addEventListener("pointermove", function (e) { if (!drag) return; var f = Math.exp((e.clientX - drag.x) / 160); st.w = Q.clamp(drag.w * f, 0.32, 7); sync(); changed(); });
			cv.addEventListener("pointerup", function () { drag = null; }); cv.addEventListener("pointercancel", function () { drag = null; });

			/* ---------- single slit ---------- */
			var scv = $("qm-un-slitcv"), sctx = scv.getContext("2d");
			function slit() {
				var a = Math.pow(10, st.sa), E = Math.pow(10, st.sE), db = S.debroglie("electron", E), lam = db.lambda, s = lam / a, th = Math.asin(Math.min(1, s));
				$("qm-un-sav").textContent = Q.si(a, "m"); $("qm-un-sEv").textContent = E >= 1000 ? Q.si(E, "eV") : Number(E.toPrecision(3)) + " eV";
				$("qm-un-s-lam").textContent = Q.si(lam, "m");
				$("qm-un-s-th").textContent = s >= 1 ? "no dark fringe (λ > a): spreads to 90°" : (th * 180 / Math.PI < 0.01 ? Q.fmt(th, 3) + " rad" : Number((th * 180 / Math.PI).toPrecision(3)) + "°");
				var dp = C.hbar / (2 * a / Math.sqrt(12));
				$("qm-un-s-dp").textContent = Q.fmt(dp, 3) + " kg·m/s (" + Number((dp / db.p * 100).toPrecision(2)) + "% of p)";
				$("qm-un-s-w").textContent = s >= 1 ? "whole screen" : Q.si(2 * Math.tan(th), "m");
				var W = scv.clientWidth || 300, H = 150, dpr = Math.min(2, window.devicePixelRatio || 1); scv.width = W * dpr; scv.height = H * dpr;
				var g = sctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#070a14"; g.fillRect(0, 0, W, H);
				var sx = W * 0.3, cy = H / 2, gapPx = Q.clamp(10 + (st.sa + 10) * 12, 8, 70), shown = Math.min(1.45, Math.max(th, 0.035));
				g.fillStyle = "rgba(34,211,238,0.25)"; g.fillRect(8, cy - gapPx * 1.6, sx - 8, gapPx * 3.2);
				var len = W - sx - 10;
				var grd = g.createLinearGradient(sx, 0, W, 0); grd.addColorStop(0, "rgba(34,211,238,0.55)"); grd.addColorStop(1, "rgba(34,211,238,0.08)");
				g.fillStyle = grd; g.beginPath(); g.moveTo(sx, cy - gapPx / 2); g.lineTo(sx + len, cy - gapPx / 2 - len * Math.tan(shown)); g.lineTo(sx + len, cy + gapPx / 2 + len * Math.tan(shown)); g.lineTo(sx, cy + gapPx / 2); g.fill();
				g.fillStyle = "#9aa6c0"; g.fillRect(sx - 3, 0, 6, cy - gapPx / 2); g.fillRect(sx - 3, cy + gapPx / 2, 6, H);
				g.fillStyle = "rgba(231,235,246,0.9)"; g.font = "11px system-ui, sans-serif"; g.textBaseline = "top";
				g.fillText("a = " + Q.si(a, "m"), sx + 8, 6); g.fillText("electrons " + (E >= 1000 ? Q.si(E, "eV") : Number(E.toPrecision(3)) + " eV"), 10, 6);
				if (th < 0.035) g.fillText("angle drawn bigger than real", sx + 8, H - 18);
			}
			$("qm-un-sa").value = st.sa; $("qm-un-sE").value = st.sE;
			$("qm-un-sa").addEventListener("input", function () { st.sa = +this.value; api.save(); slit(); });
			$("qm-un-sE").addEventListener("input", function () { st.sE = +this.value; api.save(); slit(); });
			new ResizeObserver(function () { slit(); }).observe(scv);

			/* ---------- real-scale calculator ---------- */
			var exBox = $("qm-un-ex");
			exBox.innerHTML = U.EXAMPLES.map(function (e) { return '<button type="button" data-e="' + e.id + '">' + e.name + "</button>"; }).join("");
			function num(s) { s = String(s).replace(/\s/g, "").replace(/[×x]10\^?/i, "e").replace(/−/g, "-"); var v = Number(s); return isFinite(v) && v > 0 ? v : NaN; }
			function calc() {
				var m = num($("qm-un-m").value), dx = num($("qm-un-x").value), tb = $("qm-un-tab").tBodies[0];
				Array.prototype.forEach.call(exBox.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.e === st.ex ? "true" : "false"); });
				if (!(m > 0) || !(dx > 0)) { tb.innerHTML = "<tr><td>Type a mass and a length above (for example 9.11e-31 and 1e-10).</td></tr>"; $("qm-un-say").textContent = ""; return; }
				var dp = U.minDp(dx), dv = dp / m, tdbl = 2 * Math.sqrt(3) * m * dx * dx / C.hbar;
				var rows = [["Smallest momentum spread Δp = ħ/(2Δx)", Q.fmt(dp, 3) + " kg·m/s"], ["Smallest speed spread Δv = Δp/m", Q.si(dv, "m/s")],
					["Extra position spread after 1 s (Δv × 1 s)", Q.si(dv, "m")], ["Time for a Gaussian packet to double in width", tdbl < 1e7 ? Q.si(tdbl, "s") : Q.fmt(tdbl / 3.156e7, 3) + " years"]];
				tb.innerHTML = rows.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("");
				var say = dv > 1e5 ? "Huge: the particle cannot sit still in so small a space. This is why electrons in atoms move at hundreds of km/s and do not fall into the nucleus." :
					dv > 1 ? "Large enough to matter: quantum effects are part of everyday physics at this scale." :
					dv > 1e-9 ? "Small but not zero: careful experiments can see it." : "Far too small to ever notice: big objects behave classically because their mass makes Δv tiny.";
				$("qm-un-say").textContent = say;
			}
			function setEx(id) { var e = U.EXAMPLES.filter(function (x) { return x.id === id; })[0]; if (!e) return; st.ex = id; st.m = e.m; st.x = e.dx; $("qm-un-m").value = e.m < 1e-3 ? e.m.toExponential(3) : String(e.m); $("qm-un-x").value = String(e.dx); api.save(); calc(); }
			exBox.addEventListener("click", function (e) { var b = e.target.closest("button[data-e]"); if (b) setEx(b.dataset.e); });
			$("qm-un-m").addEventListener("input", function () { st.ex = ""; st.m = num(this.value) || st.m; api.save(); calc(); });
			$("qm-un-x").addEventListener("input", function () { st.ex = ""; st.x = num(this.value) || st.x; api.save(); calc(); });
			$("qm-un-m").value = st.m < 1e-3 ? Number(st.m).toExponential(3) : String(st.m); $("qm-un-x").value = String(st.x);

			sync(); size(); build(); slit(); calc();
			this._go = function () { shown = true; size(); draw(); if (playing) loop(); };
			this._stop = function () { shown = false; cancelAnimationFrame(raf); lastT = 0; };
			window.MESQuantumDebug_uncert = { advance: function (dt) { stepTime(dt); }, state: function () { return { st: st, t: t, cur: cur, s0: s0, hist: hist }; } };
		},
		show: function () { if (this._go) this._go(); },
		hide: function () { if (this._stop) this._stop(); }
	});
})();
