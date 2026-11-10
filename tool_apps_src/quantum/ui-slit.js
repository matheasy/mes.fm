/* MES Quantum Lab: Double slit tab (wave picture from MESQ.slit.Sim + single arrivals on a far screen from the exact Fraunhofer pattern) */
(function () {
	"use strict";
	var Q = window.MESQ; if (!Q || !document.getElementById("qm")) return;
	var S = Q.slit;
	var BOX = 256, LAM0 = 8, K0 = 2 * Math.PI / LAM0, WALLX = 96, WALLW = 4, X0 = 50, SX = 16, SY = 46, TMAX = 330;

	Q.reg("slit", {
		init: function (panel, api) {
			var $ = function (id) { return document.getElementById(id); };
			var st = api.st, q = api.query;
			var phone = Math.min(screen.width, window.innerWidth) < 700 || (window.matchMedia && matchMedia("(pointer:coarse)").matches);
			/* ---------- settings ---------- */
			var D0 = { p: "electron", E: S.PARTICLES.electron.E, n: 2, a: S.PARTICLES.electron.a, d: S.PARTICLES.electron.d, L: 1, rate: 30, view: "wide",
				wp: false, D: 1, col: "phase", spd: 2, res: phone ? 128 : 256, bohm: false, who: "slits", curve: true };
			Object.keys(D0).forEach(function (k) { if (st[k] == null) st[k] = D0[k]; });
			function qn(k) { var v = q.get(k); return v == null || v === "" ? null : Number(v); }
			if (q.get("ds_p") && S.PARTICLES[q.get("ds_p")]) st.p = q.get("ds_p");
			[["ds_E", "E"], ["ds_n", "n"], ["ds_a", "a"], ["ds_d", "d"], ["ds_L", "L"], ["ds_r", "rate"], ["ds_D", "D"]].forEach(function (m) { var v = qn(m[0]); if (v != null && isFinite(v) && v > 0 || (m[1] === "D" && v === 0)) st[m[1]] = v; });
			if (q.get("ds_wp")) st.wp = q.get("ds_wp") === "1";
			st.n = Q.clamp(Math.round(st.n), 1, 8);

			var wrap = $("qm-ds-wrap"), stage = $("qm-ds-stage"), cv = $("qm-ds-cv"), ctx = cv.getContext("2d"), hit = $("qm-ds-hit"), badge = $("qm-ds-badge");
			var running = true, raf = 0, shown = false, sim = null, sim1 = null, dirty = true, geomT = 0;
			var img = null, imgCv = document.createElement("canvas"), imgCtx = imgCv.getContext("2d");
			var pic = null; /* picture geometry */
			var tracers = null, trails = [], maxR = 1e-12, maxL = 1e-12;
			/* screen */
			var T = null, hist = null, bins = 120, count = 0, arrY = new Float32Array(60000), arrU = new Float32Array(60000), arrN = 0, flashes = [];
			var dotsCv = document.createElement("canvas"), dotsCtx = dotsCv.getContext("2d"), dotsKey = "";
			var rng = Q.rng(Date.now() & 0xffffff), acc = 0, lastT = 0, L = {};
			var audio = null;

			/* ---------- derived physics ---------- */
			function phys() {
				var P = S.PARTICLES[st.p], db = S.debroglie(st.p, st.E), n = st.n;
				var a = st.a, d = Math.max(st.d, a * 1.05);
				var V = st.wp && n === 2 ? S.visibility(st.D) : 1;
				return { P: P, db: db, lam: db.lambda, a: a, d: d, n: n, V: V, L: st.L };
			}
			function thMax(ph) {
				var s;
				if (st.view === "zoom") s = (ph.n > 1 ? 3.2 * ph.lam / ph.d : 0.8 * ph.lam / ph.a);
				else if (st.view === "mid") s = 1.15 * ph.lam / ph.a;
				else s = 2.6 * ph.lam / ph.a;
				return Math.asin(Math.min(0.985, s));
			}
			function rebuildScreen() {
				var ph = phys(), tm = thMax(ph);
				T = S.cdf({ a: ph.a, d: ph.d, n: ph.n, lambda: ph.lam, V: ph.V }, tm, 6000);
				var fringes = ph.n > 1 ? 2 * Math.sin(tm) * ph.d / ph.lam : 4;
				bins = Math.round(Q.clamp(fringes * 7, 60, 360));
				hist = new Float64Array(bins); count = 0; arrN = 0; flashes = []; dotsKey = "";
				$("qm-ds-r-n").textContent = "0";
			}
			/* picture: same shape (a : d, number of slits), wavelength enlarged when needed */
			function rebuildPicture() {
				var ph = phys(), n = ph.n, Ra = ph.a / ph.lam, Rd = ph.d / ph.lam;
				var dmax = n > 1 ? Math.min(60, 150 / (n - 1)) : 1e9, amax = n > 1 ? 40 : 44;
				var f = Math.min(1, n > 1 ? dmax / (Rd * LAM0) : 1, amax / (Ra * LAM0));
				var aU = Ra * LAM0 * f, dU = Rd * LAM0 * f, widened = false;
				if (aU < 3) { aU = 3; widened = true; }
				if (n > 1 && dU < aU + 3) dU = aU + 3;
				var cs = S.centres(n, dU, BOX / 2);
				pic = { f: f, aU: aU, dU: dU, cs: cs, widened: widened };
				var who = st.wp && n === 2 ? st.D : 0;
				var base = { n: st.res, L: BOX, dt: 0.6, k0: K0, wallX: WALLX, wallW: WALLW, V0: 3, x0: X0, y0: BOX / 2, sx: SX, sy: SY, absorb: 18, eta: 1.2 };
				var sl = cs.map(function (c) { return [c - aU / 2, c + aU / 2]; });
				sim = who < 1 ? new S.Sim(Object.assign({}, base, { slits: sl })) : null;
				sim1 = who > 0 ? new S.Sim(Object.assign({}, base, { slits: [sl[0]] })) : null;
				img = imgCtx.createImageData(st.res, st.res); imgCv.width = imgCv.height = st.res;
				maxR = maxL = 1e-12; newTracers();
				var txt = [];
				if (f < 0.999) txt.push("Wave picture: λ drawn " + (1 / f >= 100 ? Q.fmt(1 / f, 2) : Number((1 / f).toPrecision(2))) + "× larger than real");
				if (widened) txt.push("slits drawn wider than real so they show");
				if (st.wp && n === 2) txt.push(st.D >= 1 ? "which-path detector on: brightness only" : "partly marked paths");
				badge.textContent = txt.join(" · ");
				dirty = true;
			}
			function newTracers() {
				trails = []; tracers = null;
				var s = sim; if (!st.bohm || !s) return;
				var cnt = phone ? 140 : 260, o = { x0: X0, y0: BOX / 2, sx: SX, sy: SY };
				tracers = S.tracers(o, cnt * (st.who === "slits" ? 12 : 1), (Math.random() * 1e9) | 0);
				if (st.who === "slits") {
					var keepX = [], keepY = [];
					for (var i = 0; i < tracers.x.length && keepX.length < cnt; i++) {
						var y = tracers.y[i], ok = false;
						for (var j = 0; j < pic.cs.length; j++) if (Math.abs(y - pic.cs[j]) < pic.aU / 2 * 0.95) ok = true;
						if (ok) { keepX.push(tracers.x[i]); keepY.push(tracers.y[i]); }
					}
					tracers = { x: Float64Array.from(keepX), y: Float64Array.from(keepY), alive: new Uint8Array(keepX.length).fill(1) };
				}
				tracers.rmin = 1e-6 / (2 * Math.PI * SX * SY);
				for (var k = 0; k < tracers.x.length; k++) trails.push([tracers.x[k], tracers.y[k]]);
			}
			function restartWave() { if (sim) sim.packet(sim.o); if (sim1) sim1.packet(sim1.o); maxR = maxL = 1e-12; newTracers(); dirty = true; }

			/* ---------- UI binding ---------- */
			function logE(P, v) { return P.Emin * Math.pow(P.Emax / P.Emin, v / 1000); }
			function eSlider(P, E) { return Math.round(1000 * Math.log(E / P.Emin) / Math.log(P.Emax / P.Emin)); }
			function fmtE(E) { return E >= 1e3 ? Q.si(E, "eV") : E >= 0.01 ? Number(E.toPrecision(3)) + " eV" : Q.si(E, "eV"); }
			function syncInputs() {
				var P = S.PARTICLES[st.p];
				st.E = Q.clamp(st.E, P.Emin, P.Emax);
				$("qm-ds-part").value = st.p; $("qm-ds-E").value = eSlider(P, st.E);
				$("qm-ds-n").value = st.n; $("qm-ds-a").value = Math.log10(st.a) * 10; $("qm-ds-d").value = Math.log10(st.d) * 10;
				$("qm-ds-L").value = Math.log10(st.L); $("qm-ds-rate").value = Math.log10(st.rate); $("qm-ds-view").value = st.view;
				$("qm-ds-wp").checked = st.wp; $("qm-ds-D").value = st.D; $("qm-ds-col").value = st.col; $("qm-ds-spd").value = String(st.spd);
				$("qm-ds-res").value = String(st.res); $("qm-ds-who").value = st.who; $("qm-ds-curve").checked = st.curve;
				$("qm-ds-bohm").setAttribute("aria-pressed", st.bohm ? "true" : "false");
				labels();
			}
			function labels() {
				var ph = phys(), g = S.geometry({ a: ph.a, d: ph.d, lambda: ph.lam }, ph.L);
				$("qm-ds-Ev").textContent = fmtE(st.E) + (ph.P.m ? "" : " (" + Q.si(ph.lam, "m") + ")");
				$("qm-ds-nv").textContent = st.n; $("qm-ds-av").textContent = Q.si(ph.a, "m"); $("qm-ds-dv").textContent = Q.si(ph.d, "m") + (st.d < ph.d ? " (min)" : "");
				$("qm-ds-Lv").textContent = Q.si(st.L, "m"); $("qm-ds-ratev").textContent = st.rate >= 100 ? Math.round(st.rate).toLocaleString("en-US") : Number(st.rate.toPrecision(2));
				$("qm-ds-Dv").textContent = st.D.toFixed(2);
				$("qm-ds-d").disabled = st.n < 2; $("qm-ds-wp").disabled = st.n !== 2; $("qm-ds-D").disabled = st.n !== 2 || !st.wp;
				$("qm-ds-r-lam").textContent = Q.si(ph.lam, "m");
				$("qm-ds-r-v").textContent = ph.P.m ? (ph.db.v > 0.01 * Q.C.c ? Q.si(ph.db.v, "m/s") + " (" + (ph.db.v / Q.C.c).toFixed(2) + " c)" : Q.si(ph.db.v, "m/s")) : "c (light)";
				$("qm-ds-r-fr").textContent = st.n > 1 ? Q.si(g.fringe, "m") : "– (one slit)";
				$("qm-ds-r-env").textContent = ph.a > ph.lam ? Q.si(g.envelope, "m") : "fills the screen (a < λ)";
				$("qm-ds-r-per").textContent = st.n > 1 ? Number((2 * ph.d / ph.a).toPrecision(3)) : "–";
				$("qm-ds-r-vis").textContent = st.n > 1 ? Math.round(ph.V * 100) + "%" : "–";
				var notes = [ph.P.note];
				if (st.n > 1 && ph.d < ph.lam) notes.push("The slits are closer than one wavelength: no stripes can form.");
				if (ph.a < ph.lam) notes.push("The slit is narrower than the wavelength, so even one slit spreads the wave over the whole screen.");
				if (Math.asin(Math.min(1, 2.6 * ph.lam / ph.a)) > 0.3) notes.push("Wide angles: the far-field formula is a good guide, but a real screen this close would also show near-field effects.");
				$("qm-ds-note").textContent = notes.join(" ");
				$("qm-ds-wpnote").hidden = st.n !== 2;
			}
			var linkT = 0;
			function pushLink() {
				clearTimeout(linkT);
				linkT = setTimeout(function () {
					var P = S.PARTICLES[st.p];
					api.setQuery({ ds_p: st.p, ds_E: Number(st.E.toPrecision(4)), ds_n: st.n, ds_a: Number(st.a.toPrecision(3)), ds_d: st.n > 1 ? Number(st.d.toPrecision(3)) : null,
						ds_L: Number(st.L.toPrecision(3)), ds_r: Number(st.rate.toPrecision(3)), ds_wp: st.wp ? "1" : null, ds_D: st.wp ? st.D : null });
					void P;
				}, 400);
			}
			function changed(geom) {
				api.save(); labels(); rebuildScreen(); pushLink();
				if (geom) { clearTimeout(geomT); geomT = setTimeout(rebuildPicture, 120); }
				clearPresets(); dirty = true;
			}
			function clearPresets() { Array.prototype.forEach.call($("qm-ds-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", "false"); }); }
			$("qm-ds-part").addEventListener("change", function () {
				st.p = this.value; var P = S.PARTICLES[st.p]; st.E = P.E; st.a = P.a; st.d = P.d; st.L = P.L; syncInputs(); changed(true);
			});
			$("qm-ds-E").addEventListener("input", function () { st.E = logE(S.PARTICLES[st.p], +this.value); changed(true); });
			$("qm-ds-n").addEventListener("input", function () { st.n = +this.value; changed(true); });
			$("qm-ds-a").addEventListener("input", function () { st.a = Math.pow(10, this.value / 10); if (st.n > 1 && st.d < st.a * 1.05) { st.d = st.a * 1.05; $("qm-ds-d").value = Math.log10(st.d) * 10; } changed(true); });
			$("qm-ds-d").addEventListener("input", function () { st.d = Math.pow(10, this.value / 10); changed(true); });
			$("qm-ds-L").addEventListener("input", function () { st.L = Math.pow(10, +this.value); changed(false); });
			$("qm-ds-rate").addEventListener("input", function () { st.rate = Math.pow(10, +this.value); api.save(); labels(); pushLink(); });
			$("qm-ds-view").addEventListener("change", function () { st.view = this.value; changed(false); });
			$("qm-ds-wp").addEventListener("change", function () { st.wp = this.checked; changed(true); });
			$("qm-ds-D").addEventListener("input", function () { st.D = +this.value; changed(true); });
			$("qm-ds-col").addEventListener("change", function () { st.col = this.value; api.save(); dirty = true; });
			$("qm-ds-spd").addEventListener("change", function () { st.spd = +this.value; api.save(); });
			$("qm-ds-res").addEventListener("change", function () { st.res = +this.value; api.save(); rebuildPicture(); });
			$("qm-ds-who").addEventListener("change", function () { st.who = this.value; api.save(); newTracers(); dirty = true; });
			$("qm-ds-curve").addEventListener("change", function () { st.curve = this.checked; api.save(); dirty = true; });
			$("qm-ds-one").addEventListener("click", function () { arrive(1); dirty = true; });
			$("qm-ds-clear").addEventListener("click", function () { rebuildScreen(); dirty = true; });
			$("qm-ds-link").addEventListener("click", function () { pushLink(); setTimeout(function () { api.copy(location.href, "Link copied"); }, 450); });
			$("qm-ds-play").addEventListener("click", function () { running = !running; this.textContent = running ? "Pause" : "Play"; this.setAttribute("aria-pressed", running ? "true" : "false"); if (running) loop(); });
			$("qm-ds-again").addEventListener("click", restartWave);
			$("qm-ds-bohm").addEventListener("click", function () { st.bohm = !st.bohm; api.save(); this.setAttribute("aria-pressed", st.bohm ? "true" : "false"); newTracers(); if (st.bohm && !sim) api.toast("Paths need the undisturbed wave: switch the which-path detector off"); dirty = true; });
			$("qm-ds-fs").addEventListener("click", function () {
				if (document.fullscreenElement) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
			});
			document.addEventListener("fullscreenchange", function () { $("qm-ds-fs").textContent = document.fullscreenElement === wrap ? "Exit full screen" : "Full screen"; size(); });
			var sound = $("qm-ds-sound");
			/* presets */
			var PRE = {
				electron: { p: "electron", E: 5e4, n: 2, a: 0.3e-6, d: 1.5e-6, L: 1, rate: 300, wp: false, view: "wide" },
				oneatatime: { p: "electron", E: 5e4, n: 2, a: 0.3e-6, d: 1.5e-6, L: 1, rate: 3, wp: false, view: "mid" },
				neutron: { p: "neutron", E: 2.4e-4, n: 2, a: 22e-6, d: 125e-6, L: 5, rate: 200, wp: false, view: "mid" },
				c60: { p: "c60", E: 0.18, n: 5, a: 50e-9, d: 100e-9, L: 1.25, rate: 300, wp: false, view: "wide" },
				light: { p: "photon", E: 1.96, n: 2, a: 40e-6, d: 250e-6, L: 2, rate: 1000, wp: false, view: "mid" },
				single: { n: 1, rate: 500, wp: false, view: "wide" },
				grating: { n: 5, rate: 1000, wp: false, view: "wide" },
				which: { n: 2, wp: true, D: 1, rate: 500, view: "wide" },
				bohm: { n: 2, wp: false, bohm: true, who: "slits" }
			};
			$("qm-ds-pre").addEventListener("click", function (e) {
				var b = e.target.closest("button[data-p]"); if (!b) return; var p = PRE[b.dataset.p]; if (!p) return;
				Object.keys(p).forEach(function (k) { st[k] = p[k]; });
				if (b.dataset.p === "single" || b.dataset.p === "grating" || b.dataset.p === "which" || b.dataset.p === "bohm") { if (st.d < st.a * 1.5) st.d = st.a * 5; }
				syncInputs(); changed(true);
				b.setAttribute("aria-pressed", "true");
				if (!running) $("qm-ds-play").click();
			});

			/* ---------- arrivals ---------- */
			function arrive(k) {
				if (!T) return;
				var ph = phys(), Ymax = ph.L * Math.tan(T.thMax);
				for (var i = 0; i < k; i++) {
					var th = S.sample(T, rng()), y = ph.L * Math.tan(th), b = Math.floor((y + Ymax) / (2 * Ymax) * bins);
					if (b >= 0 && b < bins) hist[b]++;
					count++;
					var u = rng();
					if (arrN < arrY.length) { arrY[arrN] = y / Ymax; arrU[arrN] = u; arrN++; plotDot(y / Ymax, u); }
					if (k < 30 && st.rate < 60) flashes.push({ y: y / Ymax, u: u, t: performance.now() });
				}
				if (flashes.length > 40) flashes.splice(0, flashes.length - 40);
				$("qm-ds-r-n").textContent = count.toLocaleString("en-US");
				if (sound.checked && k > 0 && k < 6) click();
			}
			function click() {
				try {
					audio = audio || new (window.AudioContext || window.webkitAudioContext)();
					var o = audio.createOscillator(), g = audio.createGain(); o.type = "square"; o.frequency.value = 1800; g.gain.value = 0.04;
					o.connect(g); g.connect(audio.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.03); o.stop(audio.currentTime + 0.04);
				} catch (e) {}
			}
			function plotDot(yn, u) {
				if (!L.dw) return;
				var x = 2 + u * (L.dw - 4), y = L.top + (1 - (yn + 1) / 2) * L.sh;
				dotsCtx.fillRect(x * L.dpr - 0.8 * L.dpr, (y - L.top) * L.dpr - 0.8 * L.dpr, 1.7 * L.dpr, 1.7 * L.dpr);
			}
			function redrawDots() {
				dotsCv.width = Math.max(1, Math.round(L.dw * L.dpr)); dotsCv.height = Math.max(1, Math.round(L.sh * L.dpr));
				dotsCtx.clearRect(0, 0, dotsCv.width, dotsCv.height);
				dotsCtx.fillStyle = arrN > 8000 ? "rgba(250,204,21,0.45)" : "rgba(250,204,21,0.9)";
				for (var i = 0; i < arrN; i++) plotDot(arrY[i], arrU[i]);
				dotsKey = L.key;
			}

			/* ---------- layout + drawing ---------- */
			function size() {
				var W = stage.parentNode.clientWidth || 600, narrow = W <= 600, band = narrow ? 50 : 0;
				var nat = Math.round(narrow ? W * 0.62 + band : Q.clamp(W * 0.6, 220, 760)), H = nat;
				if (document.fullscreenElement === wrap) H = Math.max(240, window.innerHeight - wrap.querySelector(".qm-legend").offsetHeight - wrap.querySelector(".qm-readouts").offsetHeight);
				else if (window.MESStage) H = MESStage.sh(stage, nat);
				stage.style.height = H + "px"; stage.style.width = "100%";
				var dpr = Math.min(2, window.devicePixelRatio || 1);
				cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
				var Sq = Math.min(H - band, W * 0.64), wx = 0, wy = (H - band - Sq) / 2, sx0 = Sq + Math.max(6, W * 0.015), sw = W - sx0 - 4;
				var top = narrow ? 8 : 46, sh = H - band - top - 18;
				L = { W: W, H: H, dpr: dpr, S: Sq, wx: wx, wy: wy, sx0: sx0, sw: sw, dw: sw * 0.5, top: top, sh: sh, narrow: narrow };
				L.key = [W, H, dpr].join("x");
				/* wall hit strip */
				var wpx = wx + (WALLX + WALLW / 2) / BOX * Sq;
				hit.style.left = (wpx - 14) + "px"; hit.style.top = wy + "px"; hit.style.width = "28px"; hit.style.height = Sq + "px";
				dotsKey = ""; dirty = true;
			}
			var ro = new ResizeObserver(function () { size(); if (!running) draw(); }); ro.observe(stage.parentNode);
			window.addEventListener("resize", function () { if (shown) size(); });

			function render() {
				var n = st.res, d = img.data, mixed = !!sim1, useHeat = st.col === "heat" || mixed, wallCol = Math.round((WALLX + WALLW) / BOX * n);
				var s0 = sim || sim1, re = s0.re, im = s0.im, ph = phys(), V = ph.V;
				var r1 = sim1 && sim1.re, i1 = sim1 && sim1.im, solid = s0.solid;
				/* densities: left and right of the wall, separate auto-brightness (right is dimmer) */
				var curL = 1e-14, curR = 1e-14, x, y, j, rho;
				var dens = render.buf && render.buf.length === n * n ? render.buf : (render.buf = new Float32Array(n * n));
				for (y = 0; y < n; y++) {
					var ym = (n - 1 - y) * n;
					for (x = 0; x < n; x++) {
						j = y * n + x;
						if (!mixed) rho = re[j] * re[j] + im[j] * im[j];
						else {
							var a1 = r1[j] * r1[j] + i1[j] * i1[j];
							if (x < wallCol) rho = sim ? re[j] * re[j] + im[j] * im[j] : a1;
							else { var jm = ym + x, a2 = r1[jm] * r1[jm] + i1[jm] * i1[jm]; rho = (1 - V) * (a1 + a2) + (sim ? V * (re[j] * re[j] + im[j] * im[j]) : 0); }
						}
						dens[j] = rho;
						if (x < wallCol) { if (rho > curL) curL = rho; } else if (rho > curR) curR = rho;
					}
				}
				maxL = Math.max(curL, maxL * 0.97); maxR = Math.max(curR, maxR * 0.97);
				for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
					j = y * n + x; var p = j * 4;
					if (solid[j]) { d[p] = 120; d[p + 1] = 130; d[p + 2] = 150; d[p + 3] = 255; continue; }
					var b = Math.pow(dens[j] / (x < wallCol ? maxL : maxR), 0.36); b = b > 1 ? 1 : b;
					var cr, cg, cb;
					if (useHeat) { var hh = Q.heat(b); cr = hh[0]; cg = hh[1]; cb = hh[2]; }
					else {
						var phs = Math.atan2(im[j], re[j]), h = (phs / (2 * Math.PI) + 1) % 1 * 6, k = h | 0, f = h - k, v = b * 255;
						var qv = v * (1 - f), tv = v * f;
						if (k === 0) { cr = v; cg = tv; cb = 0; } else if (k === 1) { cr = qv; cg = v; cb = 0; } else if (k === 2) { cr = 0; cg = v; cb = tv; }
						else if (k === 3) { cr = 0; cg = qv; cb = v; } else if (k === 4) { cr = tv; cg = 0; cb = v; } else { cr = v; cg = 0; cb = qv; }
					}
					d[p] = cr; d[p + 1] = cg; d[p + 2] = cb; d[p + 3] = 255;
				}
				imgCtx.putImageData(img, 0, 0);
				render.gain = maxL / maxR;
			}
			function draw() {
				if (!L.W || !img) return;
				var g = ctx, dpr = L.dpr, Sq = L.S;
				g.setTransform(dpr, 0, 0, dpr, 0, 0);
				g.fillStyle = "#070a14"; g.fillRect(0, 0, L.W, L.H);
				render();
				g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
				g.drawImage(imgCv, L.wx, L.wy, Sq, Sq);
				var sc = Sq / BOX;
				/* absorbing border hint */
				g.strokeStyle = "rgba(154,166,192,0.25)"; g.setLineDash([4, 4]); g.strokeRect(L.wx + 18 * sc, L.wy + 18 * sc, (BOX - 36) * sc, (BOX - 36) * sc); g.setLineDash([]);
				/* slit handles */
				if (pic) {
					g.fillStyle = "rgba(250,204,21,0.9)";
					pic.cs.forEach(function (c) {
						var xw = L.wx + (WALLX + WALLW / 2) * sc;
						[c - pic.aU / 2, c + pic.aU / 2].forEach(function (yy) { g.fillRect(xw - 6, L.wy + yy * sc - 1, 12, 2); });
					});
				}
				/* tracers */
				if (tracers && sim) {
					g.lineWidth = 1;
					for (var i = 0; i < trails.length; i++) {
						var tr = trails[i]; if (tr.length < 4) continue;
						var hue = (i * 47) % 360, dead = tracers.alive[i] !== 1;
						g.strokeStyle = "hsla(" + hue + ",90%,70%," + (dead ? 0.35 : 0.85) + ")";
						g.beginPath(); g.moveTo(L.wx + tr[0] * sc, L.wy + tr[1] * sc);
						for (var k = 2; k < tr.length; k += 2) g.lineTo(L.wx + tr[k] * sc, L.wy + tr[k + 1] * sc);
						g.stroke();
						if (!dead) { g.fillStyle = "#fff"; g.fillRect(L.wx + tr[tr.length - 2] * sc - 1.5, L.wy + tr[tr.length - 1] * sc - 1.5, 3, 3); }
					}
				}
				g.font = "11px system-ui, sans-serif"; g.fillStyle = "rgba(231,235,246,0.85)"; g.textBaseline = "alphabetic";
				var gain = render.gain || 1;
				g.fillText(gain > 1.5 ? "brightened ×" + Q.fmt(gain, 2) : "", L.wx + (WALLX + 8) * sc, L.wy + (L.narrow ? Sq - 6 : 30 * sc));
				drawScreen(g);
			}
			function drawScreen(g) {
				var ph = phys(), x0 = L.sx0, top = L.top, sh = L.sh, dw = L.dw, hw = L.sw - dw - 4, hx = x0 + dw + 4;
				g.fillStyle = "#03050b"; g.fillRect(x0, top, dw, sh);
				g.strokeStyle = "#273049"; g.strokeRect(x0 + 0.5, top + 0.5, dw - 1, sh - 1);
				if (dotsKey !== L.key) redrawDots();
				g.drawImage(dotsCv, x0, top, dw, sh);
				var now = performance.now();
				for (var i = 0; i < flashes.length; i++) {
					var fl = flashes[i], age = (now - fl.t) / 700; if (age > 1) continue;
					g.fillStyle = "rgba(255,255,220," + (1 - age) + ")"; g.beginPath();
					g.arc(x0 + 2 + fl.u * (dw - 4), top + (1 - (fl.y + 1) / 2) * sh, 1.5 + 4 * (1 - age), 0, 7); g.fill();
				}
				/* histogram */
				var mx = 0; for (i = 0; i < bins; i++) if (hist[i] > mx) mx = hist[i];
				var bh = sh / bins;
				g.fillStyle = "rgba(34,211,238,0.75)";
				if (mx > 0) for (i = 0; i < bins; i++) { var w = hist[i] / mx * hw; if (w > 0) g.fillRect(hx, top + sh - (i + 1) * bh, w, Math.max(1, bh - (bh > 3 ? 0.5 : 0))); }
				/* prediction (expected counts per bin, scaled to the histogram) */
				if (st.curve && T) {
					var Ymax = ph.L * Math.tan(T.thMax), o = { a: ph.a, d: ph.d, n: ph.n, lambda: ph.lam, V: ph.V }, pmax = 0, pts = [], M = Math.min(900, Math.round(sh * 1.5));
					for (i = 0; i <= M; i++) {
						var yr = -Ymax + 2 * Ymax * i / M, th = Math.atan(yr / ph.L), p = S.intensity(Math.sin(th), o) * Math.pow(Math.cos(th), 2);
						pts.push(p); if (p > pmax) pmax = p;
					}
					/* when there are counts, scale to the expected peak count, else to the full width */
					var expPeak = count > 0 ? count * pmax / sumIntegral(pts) * (M / bins) : 0, scale = count > 20 && mx > 0 ? expPeak / mx : 1;
					g.strokeStyle = "rgba(244,114,182,0.95)"; g.lineWidth = 1.4; g.beginPath();
					for (i = 0; i <= M; i++) { var X = hx + Math.min(1.1, pts[i] / pmax * scale) * hw, Y = top + sh - i / M * sh; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
					g.stroke();
				}
				/* labels */
				g.fillStyle = "rgba(231,235,246,0.9)"; g.font = "11px system-ui, sans-serif"; g.textBaseline = "alphabetic";
								var Ym = ph.L * Math.tan(T ? T.thMax : 0.1);
				g.fillStyle = "rgba(154,166,192,0.95)";
				g.fillText("+" + Q.si(Ym, "m"), hx + 2, top + 11); g.fillText("−" + Q.si(Ym, "m"), hx + 2, top + sh - 3);
				g.fillText((count ? count.toLocaleString("en-US") + " hits" : "no hits yet") + (L.narrow ? "" : " · screen " + Q.si(ph.L, "m") + " away"), x0, top + sh + 12);
				/* centre tick */
				g.strokeStyle = "rgba(154,166,192,0.5)"; g.beginPath(); g.moveTo(x0 - 4, top + sh / 2); g.lineTo(x0, top + sh / 2); g.stroke();
			}
			function sumIntegral(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

			/* ---------- simulation loop ---------- */
			var stepMs = 4;
			function advance(steps) {
				var t0 = performance.now();
				for (var s = 0; s < steps; s++) {
					if (sim) sim.step(1); if (sim1) sim1.step(1);
					if (tracers && sim) {
						sim.moveTracers(tracers, sim.dt, 4 * K0);
						for (var i = 0; i < tracers.x.length; i++) if (tracers.alive[i] === 1 && (((sim.t / sim.dt) | 0) % 2 === 0)) trails[i].push(tracers.x[i], tracers.y[i]);
					}
				}
				stepMs = 0.8 * stepMs + 0.2 * (performance.now() - t0) / Math.max(1, steps);
				var s0 = sim || sim1; if (s0.t > TMAX) restartWave();
			}
			function loop() {
				cancelAnimationFrame(raf);
				if (!shown || !running) return;
				raf = requestAnimationFrame(function (now) {
					var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
					var steps = Math.max(1, Math.min(st.spd, Math.floor(11 / Math.max(0.5, stepMs))));
					advance(steps);
					acc += st.rate * dt; var k = Math.floor(acc); acc -= k; if (k > 0) arrive(Math.min(k, 3000));
					draw(); loop();
				});
			}

			/* ---------- drag the slits ---------- */
			var drag = null;
			function picY(e) { var r = stage.getBoundingClientRect(); return (e.clientY - r.top - L.wy) / L.S * BOX; }
			hit.addEventListener("pointerdown", function (e) {
				if (!pic) return; var y = picY(e), best = null;
				pic.cs.forEach(function (c, i) {
					[-1, 1].forEach(function (s) { var dd = Math.abs(y - (c + s * pic.aU / 2)); if (dd < 4 && (!best || dd < best.dd)) best = { kind: "a", c: c, dd: dd }; });
					if (Math.abs(y - c) < pic.aU / 2 && (!best || best.kind !== "a")) best = { kind: st.n > 1 ? "d" : "a", c: c, dd: 0 };
				});
				if (!best) return;
				e.preventDefault(); hit.setPointerCapture(e.pointerId);
				drag = { kind: best.kind, c: best.c, y0: y, a0: st.a, d0: st.d, aU: pic.aU, dU: pic.dU, off: best.c - BOX / 2 };
			});
			hit.addEventListener("pointermove", function (e) {
				var y = picY(e);
				if (!drag) {
					var near = false; if (pic) pic.cs.forEach(function (c) { if (Math.abs(Math.abs(y - c) - pic.aU / 2) < 4) near = true; });
					hit.style.cursor = near ? "ns-resize" : "grab"; return;
				}
				if (drag.kind === "a") {
					var half = Math.max(1.5, Math.abs(y - drag.c)), fa = 2 * half / drag.aU;
					st.a = Q.clamp(drag.a0 * fa, 1e-9, 3e-3); if (st.n > 1 && st.d < st.a * 1.05) st.d = st.a * 1.05;
				} else if (Math.abs(drag.off) > 0.5) {
					var fd = Math.abs((y - BOX / 2) / drag.off); st.d = Q.clamp(drag.d0 * Math.max(0.05, fd), st.a * 1.05, 1e-2);
				}
				syncInputs(); changed(true);
			});
			function endDrag() { drag = null; }
			hit.addEventListener("pointerup", endDrag); hit.addEventListener("pointercancel", endDrag);

			/* ---------- start ---------- */
			syncInputs(); size(); rebuildScreen(); rebuildPicture();
			this._go = function () { shown = true; lastT = 0; size(); loop(); };
			this._stop = function () { shown = false; cancelAnimationFrame(raf); lastT = 0; };
			window.MESQuantumDebug_slit = {
				step: function (n) { advance(n || 1); draw(); }, arrive: function (n) { arrive(n || 1); draw(); }, draw: draw,
				state: function () { return { st: st, count: count, hist: hist, pic: pic, sim: sim, sim1: sim1, tracers: tracers, T: T }; }
			};
		},
		show: function () { if (this._go) this._go(); },
		hide: function () { if (this._stop) this._stop(); }
	});
})();
