/* MES Space Shuttle Simulator: the De-orbit & landing, Orbit calculator and Moon tabs. window.SXTabs */
(function () {
	"use strict";
	if (typeof document === "undefined") return;
	var S = window.MESShuttle, D = S.D2R, RE = S.RE;
	function $(id) { return document.getElementById(id); }
	function fmtN(x, dp) { return Number(x).toLocaleString("en-US", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }); }
	function dark() { return document.body.classList.contains("dark-mode"); }
	function pal() { return dark() ? { bg: "#16191f", grid: "rgba(255,255,255,0.09)", axis: "#9aa3b2", text: "#e4e7ec", a: "#6ea8fe", b: "#ffa94d", c: "#ff6b6b", d: "#69db7c", earth: "#2f6fb0", air: "rgba(110,168,254,0.18)" } :
		{ bg: "#ffffff", grid: "rgba(0,0,0,0.07)", axis: "#5b6575", text: "#1d2430", a: "#1e40af", b: "#c2410c", c: "#c92a2a", d: "#2b8a3e", earth: "#2f6fb0", air: "rgba(30,64,175,0.10)" }; }
	var inited = {}, T = window.SXTabs = { show: function (id) { if (!inited[id]) { inited[id] = true; if (INIT[id]) INIT[id](); } if (DRAW[id]) DRAW[id](); } };
	var INIT = {}, DRAW = {};
	function canvas(c) {
		var dpr = Math.min(2, window.devicePixelRatio || 1), W = c.clientWidth || 600, H = parseInt(c.getAttribute("height"), 10) || 230;
		c.style.height = H + "px"; if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
		var g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g: g, W: W, H: H };
	}
	function tbl(rows) { return '<table class="tu-table sx-t"><tbody>' + rows.map(function (r) { return "<tr><td>" + r[0] + (r[2] ? "<small>" + r[2] + "</small>" : "") + "</td><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table>"; }
	window.addEventListener("resize", function () { var t = document.querySelector('#sx .sx-tabs [aria-selected="true"]'); var id = t && t.getAttribute("data-tab"); if (id && DRAW[id] && inited[id]) DRAW[id](); });
	new MutationObserver(function () { var t = document.querySelector('#sx .sx-tabs [aria-selected="true"]'); var id = t && t.getAttribute("data-tab"); if (id && DRAW[id] && inited[id]) DRAW[id](); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	/* generic line chart: series = [{pts:[[x,y]], col, axis:'l'|'r', label}] */
	function chart(c, o) {
		var k = canvas(c), g = k.g, W = k.W, H = k.H, P = pal(), m = { l: 52, r: o.r ? 52 : 14, t: 14, b: 32 };
		g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
		var pw = W - m.l - m.r, ph = H - m.t - m.b;
		function ax(arr) { var lo = Infinity, hi = -Infinity; arr.forEach(function (s) { s.pts.forEach(function (p) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }); }); if (o.zero) lo = Math.min(0, lo); if (hi === lo) hi = lo + 1; return [lo, hi + (hi - lo) * 0.06]; }
		var L = o.series.filter(function (s) { return s.axis !== "r"; }), R = o.series.filter(function (s) { return s.axis === "r"; });
		var xl = o.x0 != null ? o.x0 : 0, xh = o.x1 || Math.max.apply(null, o.series.map(function (s) { return s.pts.length ? s.pts[s.pts.length - 1][0] : 1; }));
		var yl = ax(L), yr = R.length ? ax(R) : null;
		function X(x) { return m.l + (x - xl) / (xh - xl) * pw; }
		g.strokeStyle = P.grid; g.lineWidth = 1; g.fillStyle = P.axis; g.font = "11px system-ui, sans-serif"; g.textAlign = "right";
		for (var i = 0; i <= 4; i++) { var y = m.t + ph * i / 4, v = yl[1] - (yl[1] - yl[0]) * i / 4; g.beginPath(); g.moveTo(m.l, y); g.lineTo(m.l + pw, y); g.stroke(); g.fillText(o.fy(v), m.l - 5, y + 4);
			if (yr) { var v2 = yr[1] - (yr[1] - yr[0]) * i / 4; g.textAlign = "left"; g.fillText(o.fr(v2), m.l + pw + 5, y + 4); g.textAlign = "right"; } }
		g.textAlign = "center";
		for (var j = 0; j <= 5; j++) { var xv = xl + (xh - xl) * j / 5; g.fillText(o.fx(xv), X(xv), H - m.b + 15); }
		g.fillText(o.xl || "", m.l + pw / 2, H - 4);
		o.series.forEach(function (s) {
			var yy = s.axis === "r" ? yr : yl; g.strokeStyle = s.col; g.lineWidth = 2.2; g.setLineDash(s.dash ? [5, 4] : []); g.beginPath();
			s.pts.forEach(function (p, i) { var px = X(p[0]), py = m.t + ph * (1 - (p[1] - yy[0]) / (yy[1] - yy[0])); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); g.setLineDash([]);
		});
		var lx = m.l + 8; g.textAlign = "left"; g.font = "600 11px system-ui, sans-serif";
		o.series.forEach(function (s) { g.fillStyle = s.col; g.fillRect(lx, m.t + 4, 12, 3); g.fillStyle = P.text; g.fillText(s.label, lx + 16, m.t + 9); lx += g.measureText(s.label).width + 34; });
		(o.marks || []).forEach(function (mk) { var px = X(mk.x); g.strokeStyle = mk.col; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(px, m.t); g.lineTo(px, m.t + ph); g.stroke(); g.setLineDash([]); g.fillStyle = mk.col; g.fillText(mk.label, Math.min(px + 4, W - 80), m.t + ph - 6); });
	}

	/* ================= De-orbit tab ================= */
	var dS = { alt: 330, dv: 90, drag: 1, mass: 95000 }, DDEF = { alt: 330, dv: 90, drag: 1, mass: 95000 };
	INIT.deorbit = function () {
		[["alt", "sx-d-alt"], ["dv", "sx-d-dv"], ["drag", "sx-d-dr"], ["mass", "sx-d-m"]].forEach(function (p) {
			$(p[1]).value = dS[p[0]]; $(p[1]).addEventListener("input", function () { dS[p[0]] = parseFloat(this.value); DRAW.deorbit(); });
		});
		var tries = [["STS-135 style (370 km)", { alt: 370, dv: 95 }], ["ISS undock (390 km)", { alt: 390, dv: 100 }], ["Hubble (560 km)", { alt: 560, dv: 140 }], ["Too gentle", { alt: 330, dv: 55 }], ["Too steep", { alt: 330, dv: 300 }], ["Heavy, steep guidance", { drag: 1.8, mass: 105000 }]];
		var box = $("sx-d-try");
		tries.forEach(function (t) { var b = document.createElement("button"); b.type = "button"; b.textContent = t[0]; b.addEventListener("click", function () { Object.assign(dS, DDEF, t[1]); sync(); }); box.appendChild(b); });
		$("sx-d-reset").addEventListener("click", function () { Object.assign(dS, DDEF); sync(); });
		$("sx-d-solve").addEventListener("click", function () { dS.dv = Math.round(S.deorbitFor(dS.alt * 1000, -1.2 * D)); sync(); });
		$("sx-d-fly").addEventListener("click", function () { if (window.SXFly) window.SXFly.deorbit(dS.alt, dS.dv); });
		function sync() { $("sx-d-alt").value = dS.alt; $("sx-d-dv").value = dS.dv; $("sx-d-dr").value = dS.drag; $("sx-d-m").value = dS.mass; DRAW.deorbit(); }
	};
	DRAW.deorbit = function () {
		$("sx-d-alt-v").textContent = dS.alt + " km"; $("sx-d-dv-v").textContent = dS.dv + " m/s (" + Math.round(dS.dv / 0.3048) + " ft/s)";
		$("sx-d-dr-v").textContent = dS.drag.toFixed(2) + "× Shuttle"; $("sx-d-m-v").textContent = fmtN(dS.mass) + " kg";
		var beta = dS.mass / (S.SHUTTLE.cd * S.SHUTTLE.area), d = S.deorbit(dS.alt * 1000, dS.dv, { drag: dS.drag, beta: beta, vRot: 380 });
		var prop = S.propFor(S.SHUTTLE.mass, dS.dv, S.SHUTTLE.isp), stat = [], bar = "";
		var P = pal();
		if (!d.reaches) {
			bar = '<div class="sx-verdict sx-v-no">Stays in orbit: the low point is ' + Math.round(d.perigee / 1000) + " km, above the 120 km entry interface. Brake harder.</div>";
		} else {
			var e = d.entry, ok = e.out === "taem" && d.gammaEI / D > -2 && d.gammaEI / D < -0.7 && e.peakG < 2.5;
			bar = '<div class="sx-verdict ' + (ok ? "sx-v-ok" : "sx-v-warn") + '">' + (e.out === "skip" ? "⚠ Too shallow: it skips back out of the air." : e.out === "ground" ? "⚠ It hits the ground before slowing down." : ok ? "✅ A Shuttle-like entry." : d.gammaEI / D <= -2 ? "⚠ Steeper than the Shuttle ever flew: more g and heat." : "⚠ Shallow: long and hot, hard to aim.") + "</div>";
			stat = [["Burn", dS.dv + " m/s", fmtN(prop) + " kg of OMS propellant, about " + Math.round(prop / 30) + " s"], ["New low point", Math.round(d.perigee / 1000) + " km", "high point " + Math.round(d.apogee / 1000) + " km"],
				["Burn to entry interface", S.fmtTime(d.tEI), S.fmtKm(d.rangeEI, 0) + " around the Earth"], ["At 120 km", S.fmtV(d.vEI), (d.gammaEI / D).toFixed(2) + "° below horizontal (Shuttle ~ −1.2°)"],
				["Peak deceleration", e.peakG.toFixed(2) + " g", S.fmtTime(e.peakGt) + " after entry interface"], ["Peak nose heating", Math.round(e.peakQ) + " W/cm²", "≈ " + fmtN(e.peakT - 273) + " °C (radiating)"],
				["Entry to wheels stop", S.fmtTime(e.landTime), S.fmtKm(e.landRange, 0) + " of ground, ± " + S.fmtKm(S.crossRange(1), 0) + " to the side"], ["Burn to wheels stop", S.fmtTime(d.tEI + e.landTime), S.fmtKm(d.rangeEI + e.landRange, 0) + " from the burn point"]];
		}
		$("sx-dbar").innerHTML = bar;
		$("sx-dstat").innerHTML = stat.map(function (s) { return '<div class="sx-tile sx-tile--l"><span>' + s[0] + "</span><b>" + s[1] + "</b><small>" + s[2] + "</small></div>"; }).join("");
		drawTrip(d, P);
		if (d.reaches) {
			var pr = d.entry.prof;
			chart($("sx-d-hv"), { series: [{ pts: pr.map(function (p) { return [p.s / 1000, p.h / 1000]; }), col: P.a, label: "height (km)" }, { pts: pr.map(function (p) { return [p.s / 1000, p.v / 1000]; }), col: P.b, axis: "r", label: "speed (km/s)" }],
				fx: function (v) { return fmtN(v); }, fy: function (v) { return v.toFixed(0); }, fr: function (v) { return v.toFixed(1); }, r: true, zero: true, xl: "ground distance after entry interface (km)" });
			chart($("sx-d-gq"), { series: [{ pts: pr.map(function (p) { return [p.t / 60, p.g]; }), col: P.c, label: "g-force" }, { pts: pr.map(function (p) { return [p.t / 60, p.q]; }), col: P.b, axis: "r", label: "nose heating (W/cm²)" }],
				fx: function (v) { return v.toFixed(0); }, fy: function (v) { return v.toFixed(1); }, fr: function (v) { return v.toFixed(0); }, r: true, zero: true, xl: "minutes after entry interface",
				marks: [{ x: d.entry.peakGt / 60, col: P.c, label: "peak g" }] });
		} else { [$("sx-d-hv"), $("sx-d-gq")].forEach(function (c) { var k = canvas(c); k.g.fillStyle = P.bg; k.g.fillRect(0, 0, k.W, k.H); k.g.fillStyle = P.axis; k.g.font = "13px system-ui"; k.g.textAlign = "center"; k.g.fillText("No entry: the orbit stays above 120 km", k.W / 2, k.H / 2); }); }
	};
	/* side view of the whole trip: an "unrolled" Earth, height exaggerated */
	function drawTrip(d, P) {
		var k = canvas($("sx-d-trip")), g = k.g, W = k.W, H = k.H; g.fillStyle = P.bg; g.fillRect(0, 0, W, H);
		var rangeTot = d.reaches ? d.rangeEI + d.entry.landRange : Math.PI * RE, m = 18, x0 = m, x1 = W - m, gy = H - 30, top = 22;
		var hMax = Math.max(dS.alt, 140) * 1000;
		function X(s) { return x0 + s / rangeTot * (x1 - x0); } function Y(h) { return gy - Math.max(0, h) / hMax * (gy - top); }
		g.fillStyle = P.air; g.fillRect(x0, Y(120000), x1 - x0, gy - Y(120000));
		g.fillStyle = P.earth; g.fillRect(x0, gy, x1 - x0, 6);
		g.strokeStyle = P.axis; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x0, Y(120000)); g.lineTo(x1, Y(120000)); g.stroke(); g.setLineDash([]);
		g.fillStyle = P.axis; g.font = "11px system-ui, sans-serif"; g.textAlign = "left"; g.fillText("120 km entry interface", x0 + 4, Y(120000) - 4);
		g.strokeStyle = P.a; g.lineWidth = 2.4; g.beginPath();
		var a = d.a, e = d.e, p = a * (1 - e * e), n = 200, endNu = d.reaches ? Math.PI + d.angleEI : Math.PI * 2;
		for (var i = 0; i <= n; i++) { var nu = Math.PI + (endNu - Math.PI) * i / n, r = p / (1 + e * Math.cos(nu)), s = (nu - Math.PI) * RE; if (i) g.lineTo(X(s), Y(r - RE)); else g.moveTo(X(s), Y(r - RE)); }
		if (d.reaches) d.entry.prof.forEach(function (q) { g.lineTo(X(d.rangeEI + q.s), Y(q.h)); });
		g.stroke();
		if (d.reaches) { g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(d.rangeEI + d.entry.range), Y(d.entry.h)); g.lineTo(X(d.rangeEI + d.entry.landRange), gy); g.stroke(); g.setLineDash([]); }
		g.fillStyle = P.b; g.beginPath(); g.arc(X(0), Y(dS.alt * 1000), 5, 0, 7); g.fill(); g.fillText("🔥 burn", X(0) + 8, Y(dS.alt * 1000) + 4);
		if (d.reaches) { g.fillStyle = P.c; var ex = X(d.rangeEI); g.beginPath(); g.arc(ex, Y(120000), 4, 0, 7); g.fill(); g.textAlign = "center"; g.fillText("entry, " + S.fmtTime(d.tEI), ex, Y(120000) - 18 > top ? Y(120000) - 18 : top + 10); g.fillText("🛬 " + S.fmtTime(d.tEI + d.entry.landTime), X(rangeTot) - 30, gy - 8); }
		g.fillStyle = P.axis; g.textAlign = "center"; g.fillText(S.fmtKm(rangeTot, 0) + " of ground track (height ×" + Math.round((rangeTot / (W - 2 * m)) / (hMax / (gy - top))) + ")", W / 2, H - 6);
	}

	/* ================= Calculator tab ================= */
	INIT.calc = function () {
		var tries = [["ISS", ["415 km", "420 km", 51.6]], ["Shuttle (KSC)", ["300 km", "300 km", 28.5]], ["Hubble", ["535 km", "540 km", 28.5]], ["Sun-synchronous 700 km", ["700 km", "700 km", 98.2]], ["Molniya", ["600 km", "39700 km", 63.4]], ["GPS", ["20180 km", "20180 km", 55]], ["Geostationary", ["35786 km", "35786 km", 0]]];
		var box = $("sx-c-try");
		tries.forEach(function (t) { var b = document.createElement("button"); b.type = "button"; b.textContent = t[0]; b.addEventListener("click", function () { $("sx-c-hp").value = t[1][0]; $("sx-c-ha").value = t[1][1]; $("sx-c-i").value = t[1][2]; DRAW.calc(); }); box.appendChild(b); });
		["sx-c-hp", "sx-c-ha", "sx-c-i", "sx-c-h2", "sx-c-di", "sx-c-m", "sx-c-isp", "sx-c-b"].forEach(function (id) { $(id).addEventListener("input", DRAW.calc); });
	};
	DRAW.calc = function () {
		var hp = S.parseLen($("sx-c-hp").value), ha = S.parseLen($("sx-c-ha").value), inc = parseFloat($("sx-c-i").value) * D, h2 = S.parseLen($("sx-c-h2").value);
		var di = parseFloat($("sx-c-di").value) * D || 0, m0 = parseFloat($("sx-c-m").value), isp = parseFloat($("sx-c-isp").value), beta = parseFloat($("sx-c-b").value);
		var out = $("sx-c-out");
		if (!isFinite(hp) || !isFinite(ha) || hp < -RE * 0.9) { out.innerHTML = '<div class="tu-card"><p class="tu-note">Type heights like 400 km.</p></div>'; return; }
		if (ha < hp) { var x = ha; ha = hp; hp = x; }
		var rp = RE + hp, ra = RE + ha, a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), T = S.period(a), vp = S.visViva(rp, a), va = S.visViva(ra, a);
		var j = isFinite(inc) ? S.j2Rates(a, e, inc) : null, cross = T * S.WE * RE;
		var horizon = Math.sqrt(Math.pow(rp, 2) - RE * RE), cov = Math.acos(RE / rp);
		var orbit = [["Period", S.fmtTime(T), (86400 / T).toFixed(3) + " orbits a day"], ["Speed at the low point", S.fmtV(vp), fmtN(vp * 3.6) + " km/h, " + fmtN(vp * 2.23694) + " mph"],
			["Speed at the high point", S.fmtV(va)], ["Semi-major axis", S.fmtKm(a, 0), "eccentricity " + e.toFixed(5)], ["Escape speed from the low point", S.fmtV(S.escV(rp)), "you need " + S.fmtV(S.escV(rp) - vp) + " more"],
			["Gravity at the low point", (S.MU / (rp * rp)).toFixed(2) + " m/s²", Math.round(S.MU / (rp * rp) / S.G0 * 100) + "% of the surface's: astronauts float because they fall, not because gravity is gone"]];
		var earthRows = [["Ground track moves west each orbit", S.fmtKm(cross, 0), (T / 86400 * 360).toFixed(2) + "° of longitude"],
			["Node drift from Earth's bulge (J2)", j ? (j.raan / D * 86400).toFixed(3) + "°/day" : "–", j ? "perigee turns " + (j.argp / D * 86400).toFixed(3) + "°/day" : ""],
			["Sun-synchronous inclination here", isFinite(S.sunSyncInc(a - RE)) ? (S.sunSyncInc(a - RE) / D).toFixed(2) + "°" : "none", "node turns once a year, same local time every pass"],
			["Distance to the horizon", S.fmtKm(horizon, 0), "you see a circle " + S.fmtKm(2 * cov * RE, 0) + " across"], ["Longest time in shadow", S.fmtTime(T * Math.asin(RE / rp) / Math.PI), "per orbit, with the Sun in the orbit's plane"],
			["Orbital lifetime (rough)", hp < 120000 ? "comes down now" : (function () { var d = S.lifetime(Math.min(hp, ha), beta); return d > 365 * 30 ? "decades or more" : d > 365 ? (d / 365.25).toFixed(1) + " years" : Math.round(d) + " days"; })(), "for m/(Cd·A) = " + beta + " kg/m² (ISS ~ 100-150); solar activity can halve or double it"]];
		var tf = [], h = isFinite(h2) ? S.hohmann(rp, RE + h2) : null;
		if (h) { tf.push(["Hohmann transfer to " + S.fmtKm(h2, 0), S.fmtV(h.total), S.fmtV(Math.abs(h.dv1)) + " + " + S.fmtV(Math.abs(h.dv2)) + ", " + S.fmtTime(h.tof) + " of coasting"]); }
		var pc = S.planeChange(Math.sqrt(S.MU / rp), di); tf.push(["Plane change of " + (di / D).toFixed(2) + "° at " + S.fmtKm(hp, 0), S.fmtV(pc), "2 v sin(Δi/2)"]);
		if (h && di) { var hpc = S.hohmannPlane(rp, RE + h2, di); tf.push(["Transfer + plane change together", S.fmtV(hpc.total), "the tilt done in the second burn saves " + S.fmtV(h.total + pc - hpc.total)]); }
		var deo = S.deorbitFor(hp, -1.2 * D); tf.push(["De-orbit burn for a −1.2° entry", hp > 125000 && e < 0.01 ? S.fmtV(deo) : "–", "from a round orbit at the low point"]);
		var rk = [];
		if (m0 > 0 && isp > 0) {
			[["The transfer", h ? h.total : 0], ["The plane change", pc], ["The de-orbit", e < 0.01 ? deo : 0]].forEach(function (r) { if (r[1] > 0) rk.push([r[0], fmtN(S.propFor(m0, r[1], isp)) + " kg", "of propellant from " + fmtN(m0) + " kg at Isp " + isp + " s"]); });
			rk.push(["The Shuttle's OMS could give", S.fmtV(S.rocketDv(m0, Math.min(S.SHUTTLE.omsProp, m0 * 0.9), isp)), fmtN(S.SHUTTLE.omsProp) + " kg of propellant"]);
		}
		out.innerHTML = '<div class="tu-card"><h3 class="sx-h">The orbit</h3>' + tbl(orbit) + '</div><div class="tu-card"><h3 class="sx-h">Over the Earth</h3>' + tbl(earthRows) + '</div><div class="tu-card"><h3 class="sx-h">Burns</h3>' + tbl(tf) + (rk.length ? '<h3 class="sx-h">Propellant (rocket equation)</h3>' + tbl(rk) : "") + "</div>";
	};

	/* ================= Moon tab ================= */
	var mDv = 300;
	INIT.moon = function () {
		$("sx-m-dv").value = mDv; $("sx-m-dv").addEventListener("input", function () { mDv = parseFloat(this.value); DRAW.moon(); });
		var tli = Math.round(S.tli(185e3).dv);
		[["Shuttle OMS: 300 m/s", 300], ["1,000 m/s", 1000], ["2,500 m/s", 2500], ["Hohmann to the Moon: " + fmtN(tli), tli], ["Apollo TLI: 3,180 m/s", 3180], ["Escape: 3,230 m/s", 3230]].forEach(function (t) {
			var b = document.createElement("button"); b.type = "button"; b.textContent = t[0]; b.addEventListener("click", function () { mDv = t[1]; $("sx-m-dv").value = mDv; DRAW.moon(); }); $("sx-m-try").appendChild(b);
		});
	};
	DRAW.moon = function () {
		var P = pal(), b = S.boost(185e3, mDv, S.D_MOON), k = canvas($("sx-m-c")), g = k.g, W = k.W, H = k.H;
		$("sx-m-dv-v").textContent = fmtN(mDv) + " m/s";
		g.fillStyle = dark() ? "#05070d" : "#0b1020"; g.fillRect(0, 0, W, H);
		var scale = Math.min(W * 0.46, H * 0.46) / (S.D_MOON * 1.08), cx = W * 0.5, cy = H * 0.5;
		g.strokeStyle = "rgba(255,255,255,0.25)"; g.setLineDash([3, 5]); g.beginPath(); g.arc(cx, cy, S.D_MOON * scale, 0, 7); g.stroke(); g.setLineDash([]);
		g.strokeStyle = "rgba(255,255,255,0.10)"; g.beginPath(); g.arc(cx - S.D_MOON * scale, cy, S.SOI_MOON * scale, 0, 7); g.stroke();
		g.fillStyle = "#3b82f6"; g.beginPath(); g.arc(cx, cy, Math.max(3, RE * scale), 0, 7); g.fill();
		g.fillStyle = "#d9d9d9"; g.beginPath(); g.arc(cx - S.D_MOON * scale, cy, Math.max(2.5, S.R_MOON * scale * 1.5), 0, 7); g.fill();
		g.fillStyle = "#cfd6e2"; g.font = "11px system-ui, sans-serif"; g.textAlign = "center"; g.fillText("Moon's orbit (384,400 km)", cx, cy - S.D_MOON * scale - 6); g.fillText("Moon", cx - S.D_MOON * scale, cy + 16); g.fillText("Earth", cx, cy + 16);
		// path: periapsis on the right (burn), apogee on the left toward the Moon
		var r = RE + 185e3, v = Math.sqrt(S.MU / r) + mDv, o = new S.Orbit([r, 0, 0], [0, v, 0], 0, false), pts = [], tMax = b.escape ? 6 * 86400 : (b.T || 1e4) * (b.apo > S.D_MOON * 1.2 ? 0.5 : 1), lim = S.D_MOON * 1.15;
		for (var i = 0; i <= 400; i++) { var s = o.at(i / 400 * tMax).r; if (S.v.norm(s) > lim) break; pts.push(s); }
		g.strokeStyle = mDv >= S.tli(185e3).dv - 15 ? "#69db7c" : "#ffa94d"; g.lineWidth = 2.2; g.beginPath();
		pts.forEach(function (p, i) { var x = cx + p[0] * scale, y = cy - p[1] * scale; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
		// a dot every day
		g.fillStyle = "#fff"; for (var dday = 1; dday < 8; dday++) { var t = dday * 86400; if (t > tMax) break; var q = o.at(t).r; if (S.v.norm(q) > lim) break; g.beginPath(); g.arc(cx + q[0] * scale, cy - q[1] * scale, 2.5, 0, 7); g.fill(); g.fillText("day " + dday, cx + q[0] * scale, cy - q[1] * scale - 7); }
		// close-up of the Earth when the path stays small
		if (!b.escape && b.apo < 120000e3) {
			var bw = Math.min(170, W * 0.32), bx = W - bw - 10, by = 10, ext = Math.max(b.apo, RE * 1.6) * 1.15, sc2 = bw / 2 / ext, icx = bx + bw / 2, icy = by + bw / 2;
			g.fillStyle = "rgba(10,14,26,0.95)"; g.strokeStyle = "rgba(255,255,255,0.3)"; g.lineWidth = 1; g.fillRect(bx, by, bw, bw); g.strokeRect(bx, by, bw, bw);
			g.save(); g.beginPath(); g.rect(bx, by, bw, bw); g.clip();
			g.fillStyle = "#3b82f6"; g.beginPath(); g.arc(icx, icy, RE * sc2, 0, 7); g.fill();
			g.strokeStyle = "#ffa94d"; g.lineWidth = 2; g.beginPath();
			for (var j = 0; j <= 240; j++) { var q2 = o.at(j / 240 * b.T).r; var x2 = icx + q2[0] * sc2, y2 = icy - q2[1] * sc2; if (j) g.lineTo(x2, y2); else g.moveTo(x2, y2); } g.stroke();
			g.restore(); g.fillStyle = "#cfd6e2"; g.textAlign = "left"; g.fillText("close-up ×" + fmtN(S.D_MOON * scale > 0 ? sc2 / scale : 1), bx + 5, by + bw - 6);
		}
		var tli = S.tli(185e3), reach = b.escape || b.apo >= S.D_MOON;
		$("sx-m-read").innerHTML = '<div class="sx-tile"><span>Highest point</span><b>' + (b.escape ? "escapes Earth" : S.fmtKm(b.apo - RE, 0)) + "</b><small>" + (b.escape ? "leaves at " + S.fmtV(b.vinf) + " for good" : Math.round((b.apo) / S.D_MOON * 100) + "% of the way to the Moon") + "</small></div>" +
			'<div class="sx-tile"><span>Reaches the Moon’s distance?</span><b>' + (reach ? "yes, after " + S.fmtTime(b.t, true) : "no") + "</b><small>" + (reach ? "if the Moon is there when you arrive" : "you need " + fmtN(Math.max(0, tli.dv - mDv)) + " m/s more") + "</small></div>" +
			'<div class="sx-tile"><span>Compared with the Shuttle</span><b>' + (mDv / 300).toFixed(1) + "× its OMS</b><small>about 300 m/s from 10.8 t of propellant</small></div>";
		var bud = S.MOON_BUDGET, tot = bud.reduce(function (a, x) { return a + x.dv; }, 0), mx = 3200;
		$("sx-m-budget").innerHTML = '<div class="sx-bars">' + bud.map(function (x) { return '<div class="sx-bar"><span>' + x.name + '</span><i style="width:' + (x.dv / mx * 100).toFixed(1) + '%"></i><b>' + fmtN(x.dv) + " m/s</b></div>"; }).join("") +
			'<div class="sx-bar sx-bar--sh"><span>The Shuttle\'s whole OMS supply</span><i style="width:' + (300 / mx * 100).toFixed(1) + '%"></i><b>~300 m/s</b></div></div><p class="tu-note">Total about ' + fmtN(tot) + " m/s after reaching Earth orbit. Apollo split this between the S-IVB stage, the service module, and the lunar module's two stages.</p>";
		var dry = 100000, need = dry * (Math.exp(tli.dv / (S.SHUTTLE.isp * S.G0)) - 1), full = dry * (Math.exp(tot / (S.SHUTTLE.isp * S.G0)) - 1);
		$("sx-m-rocket").innerHTML = tbl([["Propellant just to leave for the Moon", fmtN(need / 1000, 0) + " t", "for a 100 t orbiter at Isp 316 s (it carried 10.8 t)"],
			["For the whole trip with one vehicle", fmtN(full / 1000, 0) + " t", "about " + Math.round(full / S.SHUTTLE.omsProp) + " times the OMS tanks: why missions use stages"],
			["Arriving back from the Moon", "~11 km/s", "the Shuttle's tiles were made for 7.8 km/s; heating grows about with speed cubed (" + Math.pow(11 / 7.8, 3).toFixed(1) + "×)"],
			["Time to the Moon (Hohmann-like)", S.fmtTime(tli.tof, true), "Apollo pushed a bit harder and took about 3 days"]]);
	};
})();
