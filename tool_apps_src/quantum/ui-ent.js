/* MES Quantum Lab, tab "ent": entangled pairs, Alice and Bob's dials, a live CHSH test against local hidden-variable models,
   the correlation curve and the no-signalling check. Physics in lib-ent.js (MESQ.ent). Link params: en_t, en_m, en_mode, en_a, en_ap, en_b, en_bp. */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var D = Math.PI / 180, TRAVEL = 0.9;

	Q.reg("ent", {
		init: function (panel, api) {
			var E = Q.ent, st = api.st, $ = function (id) { return document.getElementById(id); };
			/* ---------- settings ---------- */
			if (!st.type) st.type = "ph";
			if (!st.model) st.model = "q";
			if (!st.mode) st.mode = "chsh";
			if (!st.set || st.set.length !== 4) st.set = E.optimal(st.type).map(function (x) { return x / D; });
			if (st.rate == null) st.rate = 40;
			if (st.fly == null) st.fly = true;
			var q = api.query;
			if (q.get("en_t") === "ph" || q.get("en_t") === "el") st.type = q.get("en_t");
			if (E.MODELS[q.get("en_m")]) st.model = q.get("en_m");
			if (q.get("en_mode") === "free" || q.get("en_mode") === "chsh") st.mode = q.get("en_mode");
			["en_a", "en_ap", "en_b", "en_bp"].forEach(function (k, i) { var v = parseFloat(q.get(k)); if (isFinite(v)) st.set[i] = v; });

			var cv = $("qm-en-cv"), ctx = cv.getContext("2d"), stage = $("qm-en-stage"), wrap = $("qm-en-wrap");
			var pcv = $("qm-en-plot"), pctx = pcv.getContext("2d"), pstage = $("qm-en-pstage"), pwrap = $("qm-en-pwrap");
			var W = 600, H = 360, PW = 600, PH = 300, dpr = 1;
			var running = false, playing = true, raf = 0, last = 0, carry = 0, seed = (Date.now() % 1e9) | 0, rnd = Q.rng(seed);
			var flights = [], pulse = 0, dirtyUI = true, uiT = 0;
			/* data */
			var cells, free, bins, marg, margFree, tot, hist, lamp;
			function resetData(keepBins) {
				cells = E.newCounts(); free = E.newCounts()[0]; marg = [[0, 0, 0], [0, 0, 0]]; margFree = {};
				tot = { n: 0, ap: 0, bp: 0, same: 0 }; hist = []; flights = [];
				lamp = { A: { v: 0, t: -9, idx: 0 }, B: { v: 0, t: -9, idx: 0 } };
				if (!keepBins) bins = {};
				dirtyUI = true;
			}
			resetData();
			function period() { return st.type === "el" ? 360 : 180; }
			function rad(i) { return st.set[i] * D; }
			function rate() { return st.rate <= 0 ? 0.5 : 0.5 * Math.pow(10, st.rate / 25); }

			/* ---------- one pair ---------- */
			function measure(now) {
				var x, y, a, b;
				if (st.mode === "chsh") { x = rnd() < 0.5 ? 0 : 1; y = rnd() < 0.5 ? 0 : 1; if (drag) { if (drag.side === "A") x = drag.idx; else y = drag.idx; } a = rad(x); b = rad(2 + y); }
				else { x = 0; y = 0; a = rad(0); b = rad(2); }
				var r = E.pair(st.type, st.model, a, b, rnd), A = r[0], B = r[1];
				if (st.mode === "chsh") { E.add(cells[x * 2 + y], A, B); var m = marg[x]; m[0]++; if (B > 0) m[1]++; if (A > 0) m[2]++; }
				else {
					E.add(free, A, B); var key = (Math.round(st.set[0] * 2) / 2).toString(), mf = margFree[key] || (margFree[key] = [0, 0, 0, st.set[0]]);
					mf[0]++; if (B > 0) mf[1]++; if (A > 0) mf[2]++;
				}
				var dd = Math.round(E.wrap((b - a)) / D * 2) / 2; if (st.type === "ph") { dd = ((dd + 90) % 180 + 180) % 180 - 90; }
				var bc = bins[dd] || (bins[dd] = { n: 0, pp: 0, pm: 0, mp: 0, mm: 0 }); E.add(bc, A, B);
				tot.n++; if (A > 0) tot.ap++; if (B > 0) tot.bp++; if (A === B) tot.same++;
				hist.push([A, B, x, y]); if (hist.length > 24) hist.shift();
				if (now != null) { lamp.A = { v: A, t: now, idx: x }; lamp.B = { v: B, t: now, idx: y }; }
				dirtyUI = true;
			}
			function burst(n) { for (var i = 0; i < n; i++) measure(null); var h = hist[hist.length - 1]; if (h) { var t = performance.now() / 1000; lamp.A = { v: h[0], t: t, idx: h[2] }; lamp.B = { v: h[1], t: t, idx: h[3] }; } }

			/* ---------- layout ---------- */
			function runPad(stg) { var r = stg.querySelector(".qm-run"); if (!r) return [0, 0]; var cs = getComputedStyle(r), h = r.offsetHeight + 8; return cs.top === "auto" || parseFloat(cs.top) > stg.clientHeight / 2 ? [0, h] : [0, 0]; }
			var PAD = [0, 0];
			function natH(w) { return Math.round(Q.clamp(w * 0.46, 300, 460)); }
			function sizeOf(st0, wr, nat) {
				var w = st0.clientWidth || 600, h;
				if (document.fullscreenElement === wr) { var other = 0; Array.prototype.forEach.call(wr.children, function (c) { if (c !== st0) other += c.offsetHeight; }); h = Math.max(240, window.innerHeight - other); }
				else h = window.MESStage ? window.MESStage.sh(st0, nat(w)) : nat(w);
				return [w, Math.round(h)];
			}
			function layout() {
				dpr = Math.min(2, window.devicePixelRatio || 1);
				PAD = runPad(stage); var s = sizeOf(stage, wrap, function (w) { return natH(w) + PAD[0] + PAD[1]; }); W = s[0]; H = s[1]; stage.style.height = H + "px";
				cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
				s = sizeOf(pstage, pwrap, function (w) { return Math.round(Q.clamp(w * 0.42, 230, 380)); }); PW = s[0]; PH = s[1]; pstage.style.height = PH + "px";
				pcv.width = Math.round(PW * dpr); pcv.height = Math.round(PH * dpr);
				draw(performance.now() / 1000); drawPlot();
			}
			function geo() {
				var h = H - PAD[0] - PAD[1], R = Math.max(22, Math.min(h * 0.15, W * 0.1)), yc = PAD[0] + h * 0.4;
				return { R: R, yc: yc, bot: H - PAD[1], xA: Math.max(R + 14, W * 0.15), xB: Math.min(W - R - 14, W * 0.85), xS: W / 2 };
			}

			/* ---------- drawing ---------- */
			function lineAt(g, x, y, ang, len, w, col) {   // ang = setting in degrees; photons: axis from horizontal, spins: arrow from up
				var dx, dy; if (st.type === "ph") { dx = Math.cos(ang * D); dy = -Math.sin(ang * D); } else { dx = Math.sin(ang * D); dy = -Math.cos(ang * D); }
				g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.beginPath();
				if (st.type === "ph") { g.moveTo(x - dx * len, y - dy * len); g.lineTo(x + dx * len, y + dy * len); g.stroke(); }
				else {
					g.moveTo(x - dx * len * 0.55, y - dy * len * 0.55); g.lineTo(x + dx * len, y + dy * len); g.stroke();
					var hx = x + dx * len, hy = y + dy * len, px = -dy, py = dx, s = Math.max(6, len * 0.22);
					g.fillStyle = col; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - dx * s + px * s * 0.55, hy - dy * s + py * s * 0.55); g.lineTo(hx - dx * s - px * s * 0.55, hy - dy * s - py * s * 0.55); g.closePath(); g.fill();
				}
			}
			function station(g, side, G, now) {
				var x = side === "A" ? G.xA : G.xB, y = G.yc, R = G.R, i0 = side === "A" ? 0 : 2, L = lamp[side], age = now - L.t;
				var cur = st.mode === "chsh" ? (drag && drag.side === side ? drag.idx : L.idx) : 0, fs = Math.max(11, Math.min(15, R * 0.36));
				// dial
				var gr = g.createRadialGradient(x, y, R * 0.2, x, y, R * 1.1); gr.addColorStop(0, "#1a2140"); gr.addColorStop(1, "#0d1226");
				g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 2 * Math.PI); g.fill();
				g.strokeStyle = hover === side ? "#a5b4fc" : "#3a4466"; g.lineWidth = hover === side ? 2.5 : 1.5; g.stroke();
				g.strokeStyle = "#4b567a"; g.lineWidth = 1;
				for (var t = 0; t < 360; t += 15) { var c = Math.cos(t * D), s = Math.sin(t * D), k = t % 45 === 0 ? 0.82 : 0.9; g.beginPath(); g.moveTo(x + c * R * k, y + s * R * k); g.lineTo(x + c * R, y + s * R); g.stroke(); }
				// settings
				if (st.mode === "chsh") lineAt(g, x, y, st.set[i0 + 1 - cur], R * 0.86, 2, "rgba(165,180,252,0.35)");
				lineAt(g, x, y, st.set[i0 + cur], R * 0.86, 4, "#c7d2fe");
				g.fillStyle = "#e7ebf6"; g.beginPath(); g.arc(x, y, 3.5, 0, 2 * Math.PI); g.fill();
				// labels
				g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = "#e7ebf6"; g.font = "700 " + Math.round(fs * 1.15) + "px system-ui, sans-serif";
				g.fillText(side === "A" ? "Alice" : "Bob", x, y - R - fs * 1.75);
				g.font = Math.round(fs) + "px system-ui, sans-serif"; g.fillStyle = "#a5b4fc";
				var nm = (side === "A" ? "a" : "b") + (st.mode === "chsh" && cur ? "′" : "");
				g.fillText(nm + " = " + fmtA(st.set[i0 + cur]), x, y - R - fs * 0.5);
				g.fillStyle = "#9aa6c0"; g.font = Math.round(fs * 0.85) + "px system-ui, sans-serif";
				g.fillText(st.type === "ph" ? "polarizer" : "Stern-Gerlach magnet", x, y + R + fs * 1.2);
				// lamps
				var ly = y + R + fs * 3.0, lr = Math.max(9, Math.min(15, R * 0.34)), glow = Math.max(0, 1 - age / 0.45);
				[[1, "+1", "#4ade80", -1], [-1, "−1", "#f87171", 1]].forEach(function (Lp) {
					var lx = x + Lp[3] * lr * 1.6, on = L.v === Lp[0] ? glow : 0;
					if (on > 0) { g.fillStyle = Lp[2]; g.globalAlpha = on * 0.35; g.beginPath(); g.arc(lx, ly, lr * 2, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1; }
					g.fillStyle = on > 0 ? Lp[2] : "#1b2238"; g.beginPath(); g.arc(lx, ly, lr, 0, 2 * Math.PI); g.fill();
					g.strokeStyle = Lp[2]; g.lineWidth = 1.5; g.stroke();
					g.fillStyle = on > 0.3 ? "#08101e" : Lp[2]; g.font = "700 " + Math.round(lr * 0.95) + "px system-ui, sans-serif"; g.textBaseline = "middle"; g.fillText(Lp[1], lx, ly + 0.5);
				});
				g.textBaseline = "alphabetic";
			}
			function fmtA(v) { return (Math.round(v * 10) / 10).toString().replace("-", "−") + "°"; }
			function draw(now) {
				var g = ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
				var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#090d1c"); bg.addColorStop(1, "#05070f"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
				var G = geo();
				g.setLineDash([4, 6]); g.strokeStyle = "#273049"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(G.xA + G.R, G.yc); g.lineTo(G.xB - G.R, G.yc); g.stroke(); g.setLineDash([]);
				// source
				var pr = Math.max(14, G.R * 0.45), pg = Math.max(0, 1 - (now - pulse) / 0.35);
				var sg2 = g.createRadialGradient(G.xS, G.yc, 2, G.xS, G.yc, pr * (1.8 + pg)); sg2.addColorStop(0, "rgba(167,139,250," + (0.6 + 0.4 * pg) + ")"); sg2.addColorStop(1, "rgba(167,139,250,0)");
				g.fillStyle = sg2; g.beginPath(); g.arc(G.xS, G.yc, pr * (1.8 + pg), 0, 2 * Math.PI); g.fill();
				g.fillStyle = "#ede9fe"; g.beginPath(); g.arc(G.xS, G.yc, pr * 0.42, 0, 2 * Math.PI); g.fill();
				var fs = Math.max(11, Math.min(14, G.R * 0.34));
				g.fillStyle = "#c4b5fd"; g.font = "600 " + Math.round(fs) + "px system-ui, sans-serif"; g.textAlign = "center";
				g.fillText(st.model === "q" ? "entangled source" : "hidden-variable source", G.xS, G.yc - pr * 2.2);
				// flights
				for (var i = 0; i < flights.length; i++) {
					var f = flights[i], u = (now - f.t0) / TRAVEL; if (u < 0 || u > 1) continue;
					var dxA = G.xS + (G.xA - G.xS) * u, dxB = G.xS + (G.xB - G.xS) * u, col = "hsl(" + f.hue + ",90%,70%)";
					[dxA, dxB].forEach(function (px) { g.fillStyle = col; g.globalAlpha = 0.25; g.beginPath(); g.arc(px, G.yc, 7, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1; g.beginPath(); g.arc(px, G.yc, 3, 0, 2 * Math.PI); g.fill(); });
				}
				station(g, "A", G, now); station(g, "B", G, now);
				// last pair
				var h = hist[hist.length - 1], by = G.bot - Math.max(12, fs * 1.1);
				g.font = Math.round(fs) + "px system-ui, sans-serif"; g.fillStyle = "#9aa6c0";
				if (h) {
					var txt = "Last pair: Alice " + (h[0] > 0 ? "+1" : "−1") + ", Bob " + (h[1] > 0 ? "+1" : "−1") + (h[0] === h[1] ? "  (same)" : "  (different)");
					g.fillText(W < 420 ? txt.replace("Last pair: ", "") : txt, W / 2, by);
				} else g.fillText(W < 420 ? "Drag a dial to turn it" : "Press play, or drag a dial to turn it", W / 2, by);
			}

			/* ---------- correlation plot ---------- */
			function drawPlot() {
				var g = pctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#070a14"; g.fillRect(0, 0, PW, PH);
				var span = st.type === "ph" ? 90 : 180, ml = 44, mr = 14, mt = 16, mb = 36, w = PW - ml - mr, h = PH - mt - mb;
				var X = function (d) { return ml + (d + span) / (2 * span) * w; }, Y = function (e) { return mt + (1 - e) / 2 * h; };
				var fs = PW < 420 ? 10 : 12;
				g.font = fs + "px system-ui, sans-serif"; g.fillStyle = "#9aa6c0"; g.strokeStyle = "#1e2640"; g.lineWidth = 1; g.textAlign = "right"; g.textBaseline = "middle";
				[-1, -0.5, 0, 0.5, 1].forEach(function (e) { g.beginPath(); g.moveTo(ml, Y(e)); g.lineTo(ml + w, Y(e)); g.stroke(); g.fillText(e.toString().replace("-", "−"), ml - 6, Y(e)); });
				g.textAlign = "center"; g.textBaseline = "top"; var stp = span === 90 ? 22.5 : 45;
				for (var d = -span; d <= span + 1e-9; d += stp) { g.beginPath(); g.moveTo(X(d), mt); g.lineTo(X(d), mt + h); g.stroke(); if (PW >= 420 || d % (2 * stp) === 0) g.fillText(fmtA(d), X(d), mt + h + 5); }
				g.fillText("angle between the dials, b − a", ml + w / 2, mt + h + 5 + fs * 1.4);
				g.save(); g.translate(12, mt + h / 2); g.rotate(-Math.PI / 2); g.textBaseline = "middle"; g.fillText("correlation E", 0, 0); g.restore();
				// curves (E depends only on b - a)
				[["bell", "#facc15"], ["malus", "#f472b6"], ["q", "#22d3ee"]].forEach(function (c) {
					g.strokeStyle = c[1]; g.lineWidth = st.model === c[0] ? 3 : 1.5; g.globalAlpha = st.model === c[0] ? 1 : 0.75; g.beginPath();
					for (var i = 0; i <= 360; i++) { var dd = -span + 2 * span * i / 360, e = E.E(st.type, c[0], 0, dd * D); if (i) g.lineTo(X(dd), Y(e)); else g.moveTo(X(dd), Y(e)); }
					g.stroke(); g.globalAlpha = 1;
				});
				// CHSH angle markers
				if (st.mode === "chsh") {
					g.fillStyle = "rgba(165,180,252,0.18)";
					[[0, 2], [0, 3], [1, 2], [1, 3]].forEach(function (p) { var dd = norm(st.set[p[1]] - st.set[p[0]]); g.fillRect(X(dd) - 1.5, mt, 3, h); });
				}
				// measured points
				Object.keys(bins).forEach(function (k) {
					var c = bins[k]; if (c.n < 10) return; var e = E.cellE(c), er = E.cellErr(c), x = X(+k);
					g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, Y(Math.min(1, e + er))); g.lineTo(x, Y(Math.max(-1, e - er))); g.stroke();
					g.fillStyle = "#fff"; g.beginPath(); g.arc(x, Y(e), 3.2, 0, 2 * Math.PI); g.fill();
				});
			}
			function norm(dd) { var p = period(), hp = p / 2; dd = ((dd + hp) % p + p) % p - hp; return dd; }

			/* ---------- HTML readouts ---------- */
			function pct(a, b) { return b ? (100 * a / b).toFixed(1) + "%" : "–"; }
			function f3(x) { return isFinite(x) ? x.toFixed(3).replace("-", "−") : "–"; }
			function updUI() {
				$("qm-en-n").textContent = tot.n.toLocaleString("en-US");
				var S = E.stats(cells), few = cells.some(function (c) { return c.n < 10; }); if (few) { S.S = NaN; S.sigma = NaN; } var Sth = E.Stheory(st.type, st.model, st.set.map(function (x) { return x * D; }));
				if (st.mode === "chsh") {
					$("qm-en-s").textContent = isFinite(S.S) ? f3(S.S) + " ± " + S.dS.toFixed(3) : tot.n ? "needs 10+ per setting" : "–";
					var sg = $("qm-en-sig");
					if (!isFinite(S.sigma)) sg.textContent = "–";
					else if (S.S > 2) sg.textContent = (S.sigma >= 0 ? S.sigma.toFixed(1) : "0") + " σ above 2" + (S.sigma > 5 ? ": Bell broken" : "");
					else sg.textContent = "≤ 2: no violation";
					$("qm-en-st").textContent = f3(Sth) + (st.model === "q" && Math.abs(Sth - E.TSIRELSON) < 1e-6 ? " = 2√2" : "");
				} else { $("qm-en-s").textContent = "CHSH mode only"; $("qm-en-sig").textContent = "–"; $("qm-en-st").textContent = f3(Sth); }
				$("qm-en-m").textContent = pct(tot.ap, tot.n) + " / " + pct(tot.bp, tot.n);
				$("qm-en-same").textContent = pct(tot.same, tot.n);
				// meter
				var fill = $("qm-en-mfill"), er = $("qm-en-merr");
				if (st.mode === "chsh" && isFinite(S.S)) {
					fill.style.width = Q.clamp(S.S / 4 * 100, 0, 100) + "%"; fill.className = S.S > 2 ? "qm-en-meter__over" : "";
					er.style.left = Q.clamp((S.S - S.dS) / 4 * 100, 0, 100) + "%"; er.style.width = Q.clamp(2 * S.dS / 4 * 100, 0, 100) + "%"; er.hidden = false;
				} else { fill.style.width = "0"; er.hidden = true; }
				// table
				var names = [["a", "b"], ["a", "b′"], ["a′", "b"], ["a′", "b′"]], idx = [[0, 2], [0, 3], [1, 2], [1, 3]], rows = "";
				if (st.mode === "chsh") {
					for (var i = 0; i < 4; i++) {
						var c = cells[i], a = st.set[idx[i][0]], b = st.set[idx[i][1]];
						rows += "<tr><td>" + names[i][0] + " = " + fmtA(a) + ", " + names[i][1] + " = " + fmtA(b) + "</td><td>" + fmtA(norm(b - a)) + "</td><td>" + c.n.toLocaleString("en-US") +
							"</td><td>" + [c.pp, c.pm, c.mp, c.mm].join(" / ") + "</td><td>" + (c.n ? f3(E.cellE(c)) + (c.n > 1 ? " ± " + E.cellErr(c).toFixed(3) : "") : "–") +
							"</td><td>" + f3(E.E(st.type, st.model, a * D, b * D)) + "</td></tr>";
					}
				} else {
					var a0 = st.set[0], b0 = st.set[2];
					rows = "<tr><td>a = " + fmtA(a0) + ", b = " + fmtA(b0) + "</td><td>" + fmtA(norm(b0 - a0)) + "</td><td>" + free.n.toLocaleString("en-US") + "</td><td>" + [free.pp, free.pm, free.mp, free.mm].join(" / ") +
						"</td><td>" + (free.n ? f3(E.cellE(free)) + (free.n > 1 ? " ± " + E.cellErr(free).toFixed(3) : "") : "–") + "</td><td>" + f3(E.E(st.type, st.model, a0 * D, b0 * D)) + "</td></tr>";
				}
				$("qm-en-tbl").tBodies[0].innerHTML = rows;
				// no-signalling
				var nr = "";
				if (st.mode === "chsh") [0, 1].forEach(function (x) { var m = marg[x]; nr += "<tr><td>Alice chose " + (x ? "a′ = " : "a = ") + fmtA(st.set[x]) + "</td><td>" + m[0].toLocaleString("en-US") + "</td><td><b>" + pct(m[1], m[0]) + "</b></td><td>" + pct(m[2], m[0]) + "</td></tr>"; });
				else Object.keys(margFree).map(function (k) { return margFree[k]; }).sort(function (u, v) { return u[3] - v[3]; }).slice(-8).forEach(function (m) {
					nr += "<tr><td>Alice&rsquo;s dial at " + fmtA(m[3]) + "</td><td>" + m[0].toLocaleString("en-US") + "</td><td><b>" + pct(m[1], m[0]) + "</b></td><td>" + pct(m[2], m[0]) + "</td></tr>";
				});
				$("qm-en-nst").tBodies[0].innerHTML = nr || '<tr><td colspan="4">No pairs yet</td></tr>';
				var la = "", lb = "", lc = "", sub = st.mode === "chsh";
				hist.forEach(function (h) { la += (h[0] > 0 ? "+" : "−") + (sub ? (h[2] ? "′" : " ") : "") + " "; lb += (h[1] > 0 ? "+" : "−") + (sub ? (h[3] ? "′" : " ") : "") + " "; lc += (h[0] === h[1] ? "=" : "≠") + (sub ? " " : "") + " "; });
				$("qm-en-la").textContent = la || " "; $("qm-en-lb").textContent = lb || " "; $("qm-en-lc").textContent = lc || " ";
				$("qm-en-badge").textContent = (st.type === "ph" ? "Photons" : "Electron spins") + " · " + (st.model === "q" ? "quantum" : st.model === "bell" ? "Bell 1964 hidden variables" : "shared polarization (local)") + " · " + (st.mode === "chsh" ? "CHSH test" : "fixed dials");
				drawPlot(); dirtyUI = false;
			}

			/* ---------- controls ---------- */
			var angIds = ["a0", "a1", "b0", "b1"];
			function syncControls() {
				$("qm-en-type").value = st.type; $("qm-en-model").value = st.model; $("qm-en-mode").value = st.mode; $("qm-en-rate").value = st.rate; $("qm-en-fly").checked = !!st.fly;
				var r = rate(); $("qm-en-ratev").textContent = r < 10 ? r.toFixed(1) : Math.round(r).toLocaleString("en-US");
				angIds.forEach(function (id, i) { var rr = $("qm-en-" + id + "r"); rr.max = period(); rr.value = ((st.set[i] % period()) + period()) % period(); $("qm-en-" + id).value = Math.round(st.set[i] * 10) / 10; });
				$("qm-en-angles").classList.toggle("qm-en-free", st.mode !== "chsh");
				$("qm-en-qf").textContent = st.type === "ph" ? "cos 2(b − a)" : "−cos(b − a)";
				var o = E.optimal(st.type).map(function (x) { return fmtA(x / D); });
				$("qm-en-angnote").textContent = st.mode === "chsh"
					? "Best angles for " + (st.type === "ph" ? "photons" : "electron spins") + ": a = " + o[0] + ", a′ = " + o[1] + ", b = " + o[2] + ", b′ = " + o[3] + ". " + (st.type === "ph" ? "Polarizer angles repeat every 180°." : "Spin directions repeat every 360°.")
					: "Fixed dials: every pair is measured at a and b. Turn a dial to add points to the correlation curve below.";
			}
			function setAngle(i, v, quiet) {
				v = Math.round(v * 2) / 2; st.set[i] = v;
				if (st.mode === "chsh") { cells = E.newCounts(); marg = [[0, 0, 0], [0, 0, 0]]; } else free = E.newCounts()[0];
				if (!quiet) { syncControls(); api.save(); }
				dirtyUI = true;
			}
			angIds.forEach(function (id, i) {
				$("qm-en-" + id + "r").addEventListener("input", function () { setAngle(i, +this.value); });
				$("qm-en-" + id).addEventListener("change", function () { var v = parseFloat(this.value); if (isFinite(v)) setAngle(i, v); else syncControls(); });
			});
			function setPressed(p) { Array.prototype.forEach.call($("qm-en-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === p ? "true" : "false"); }); }
			$("qm-en-type").addEventListener("change", function () { st.type = this.value; st.set = E.optimal(st.type).map(function (x) { return x / D; }); resetData(); syncControls(); setPressed(""); api.save(); });
			$("qm-en-model").addEventListener("change", function () { st.model = this.value; resetData(); syncControls(); setPressed(""); api.save(); });
			$("qm-en-mode").addEventListener("change", function () { st.mode = this.value; resetData(true); syncControls(); setPressed(""); api.save(); });
			$("qm-en-rate").addEventListener("input", function () { st.rate = +this.value; syncControls(); api.save(); });
			$("qm-en-fly").addEventListener("change", function () { st.fly = this.checked; api.save(); });
			$("qm-en-opt").addEventListener("click", function () { st.set = E.optimal(st.type).map(function (x) { return x / D; }); if (st.mode !== "chsh") st.mode = "chsh"; resetData(true); syncControls(); api.save(); });
			$("qm-en-link").addEventListener("click", function () {
				var u = new URL(location.href); u.search = "";
				var p = { tab: "ent", en_t: st.type, en_m: st.model, en_mode: st.mode, en_a: st.set[0], en_ap: st.set[1], en_b: st.set[2], en_bp: st.set[3] };
				if (document.getElementById("qm").getAttribute("data-views").split(",")[0] === "ent") delete p.tab;
				Object.keys(p).forEach(function (k) { u.searchParams.set(k, p[k]); });
				api.copy(u.toString(), "Link copied");
			});
			$("qm-en-pre").addEventListener("click", function (e) {
				var b = e.target.closest("button"); if (!b) return; var p = b.dataset.p;
				if (p === "chsh") { st.model = "q"; st.mode = "chsh"; st.set = E.optimal(st.type).map(function (x) { return x / D; }); }
				else if (p === "same") { st.model = "q"; st.type = "ph"; st.mode = "free"; st.set = [30, 75, 30, 52.5]; }
				else if (p === "perp") { st.model = "q"; st.type = "ph"; st.mode = "free"; st.set = [0, 45, 90, 67.5]; }
				else if (p === "bell" || p === "malus") { st.model = p; st.mode = "chsh"; st.set = E.optimal(st.type).map(function (x) { return x / D; }); }
				else if (p === "el") { st.type = "el"; st.model = "q"; st.mode = "chsh"; st.set = E.optimal("el").map(function (x) { return x / D; }); }
				if (st.rate < 40) st.rate = 40;
				resetData(); syncControls(); setPressed(p); api.save(); setPlaying(true);
				if (p !== "same" && p !== "perp") burst(2000);
			});
			function setPlaying(v) { playing = v; var b = $("qm-en-play"); b.textContent = v ? "Pause" : "Play"; b.setAttribute("aria-pressed", v ? "true" : "false"); if (v) loop(); }
			$("qm-en-play").addEventListener("click", function () { setPlaying(!playing); });
			$("qm-en-one").addEventListener("click", function () { launch(performance.now() / 1000, true); if (!raf) loop(); });
			$("qm-en-burst").addEventListener("click", function () { burst(10000); updUI(); draw(performance.now() / 1000); });
			$("qm-en-reset").addEventListener("click", function () { resetData(); updUI(); draw(performance.now() / 1000); });
			function fs(wr) { if (document.fullscreenElement === wr) document.exitFullscreen(); else if (wr.requestFullscreen) wr.requestFullscreen().catch(function () { api.toast("Full screen is not available here"); }); }
			$("qm-en-fs").addEventListener("click", function () { fs(wrap); });
			$("qm-en-pfs").addEventListener("click", function () { fs(pwrap); });
			document.addEventListener("fullscreenchange", function () { setTimeout(layout, 50); });

			/* ---------- dial dragging ---------- */
			var drag = null, hover = null;
			function sideAt(px, py) { var G = geo(); if (Math.hypot(px - G.xA, py - G.yc) < G.R * 1.35) return "A"; if (Math.hypot(px - G.xB, py - G.yc) < G.R * 1.35) return "B"; return null; }
			function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
			function angleFrom(side, px, py) {
				var G = geo(), x = side === "A" ? G.xA : G.xB, dx = px - x, dy = py - G.yc, a;
				if (st.type === "ph") { a = Math.atan2(-dy, dx) / D; a = ((a % 180) + 180) % 180; } else { a = Math.atan2(dx, -dy) / D; a = ((a % 360) + 360) % 360; }
				var snap = Math.round(a / 22.5) * 22.5; if (Math.abs(a - snap) < 2.5) a = snap;
				return a % period();
			}
			cv.addEventListener("touchstart", function (e) { var t = e.touches[0], p = pos(t); if (sideAt(p[0], p[1])) e.preventDefault(); }, { passive: false });
			cv.addEventListener("pointerdown", function (e) {
				var p = pos(e), s = sideAt(p[0], p[1]); if (!s) return;
				drag = { side: s, idx: st.mode === "chsh" ? lamp[s].idx : 0 }; cv.setPointerCapture(e.pointerId); e.preventDefault();
				setAngle((s === "A" ? 0 : 2) + drag.idx, angleFrom(s, p[0], p[1]), true); draw(performance.now() / 1000);
			});
			cv.addEventListener("pointermove", function (e) {
				var p = pos(e);
				if (!drag) { var h = sideAt(p[0], p[1]); if (h !== hover) { hover = h; cv.style.cursor = h ? "grab" : ""; if (!running || !playing) draw(performance.now() / 1000); } return; }
				setAngle((drag.side === "A" ? 0 : 2) + drag.idx, angleFrom(drag.side, p[0], p[1]), true); if (!playing) draw(performance.now() / 1000);
			});
			function endDrag() { if (!drag) return; drag = null; syncControls(); api.save(); dirtyUI = true; }
			cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
			cv.addEventListener("keydown", function (e) {   // arrows turn Alice's dial, Shift+arrows Bob's
				if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault();
				var i = e.shiftKey ? 2 : 0, d = (e.key === "ArrowRight" || e.key === "ArrowUp") ? 2.5 : -2.5; setAngle(i + (st.mode === "chsh" ? lamp[e.shiftKey ? "B" : "A"].idx : 0), st.set[i] + d);
				draw(performance.now() / 1000);
			});

			/* ---------- animation ---------- */
			function launch(now, force) { pulse = now; if (st.fly || force) flights.push({ t0: now, hue: Math.floor(rnd() * 360) }); else measure(now); }
			function frame(ts) {
				raf = 0; if (!running) return;
				var now = ts / 1000, dt = last ? Math.min(0.1, now - last) : 0; last = now;
				if (playing) {
					var r = rate(); carry += r * dt; var n = Math.floor(carry); carry -= n; n = Math.min(n, 4000);
					if (n > 0) {
						var animate = st.fly && r <= 40, k;
						if (animate) for (k = 0; k < n; k++) launch(now);
						else { for (k = 0; k < n - (st.fly ? 1 : 0); k++) measure(now); if (st.fly) launch(now); pulse = now; }
					}
				}
				for (var i = flights.length - 1; i >= 0; i--) if (now - flights[i].t0 >= TRAVEL) { flights.splice(i, 1); measure(now); }
				draw(now);
				if (dirtyUI && now - uiT > 0.15) { uiT = now; updUI(); }
				if (playing || flights.length || now - Math.max(lamp.A.t, pulse) < 0.6) raf = requestAnimationFrame(frame);
			}
			function loop() { if (running && !raf) { last = 0; raf = requestAnimationFrame(frame); } }
			this._start = function () { running = true; layout(); updUI(); loop(); };
			this._stop = function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
			if (window.ResizeObserver) { new ResizeObserver(function () { if (running) layout(); }).observe(stage); new ResizeObserver(function () { if (running) layout(); }).observe(pstage); }
			window.addEventListener("resize", function () { if (running) layout(); });

			syncControls();
			window.MESQuantumDebug_ent = { run: function (n) { burst(n || 1000); updUI(); draw(performance.now() / 1000); return E.stats(cells); }, state: st,
				stats: function () { return { S: E.stats(cells), tot: tot, marg: marg }; }, frame: function (t) { running = true; frame(t || performance.now()); } };
		},
		show: function () { if (this._start) this._start(); },
		hide: function () { if (this._stop) this._stop(); }
	});
})();
