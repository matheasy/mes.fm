/* MES GTA 6 Hub: shared maths (pure, node-testable: node tool_apps_src/gta-tests.js).
   1. Stunt jump physics: a 2D rigid-body vehicle (raycast spring-damper suspension per axle, tyre grip limited by mu * N,
      engine power, brakes, quadratic air drag, wheel spin whose angular momentum is traded with the body in the air,
      penalty contacts for the body so it can crash, slide and flip) on a course of ramps, gaps and landings.
   2. Jump calculator (closed-form projectile + a drag integrator).
   3. Release countdown (midnight in any time zone, needs CK from the clock lib when present) and download / storage maths.
   4. Community map: pin validation, vote verdicts and ordering (MAP; also used by api/gta-map.js).
   Byte-identical copy at mes.fm/api/_gta-lib.js (the news function uses parseRss, the map function MAP): cp after editing. */
(function (root) {
	"use strict";
	var G0 = 9.80665, RAD = Math.PI / 180;

	/* ======================= facts (checked 2026-11-07) ======================= */
	var FACTS = {
		release: "2026-11-19", preload: "2026-11-10", sizeGB: 212, platforms: "PS5 and Xbox Series X|S",
		checked: "2026-11-07",
		sources: [["Rockstar's file size and preload announcement (Forbes, 3 Nov 2026)", "https://www.forbes.com/sites/paultassi/2026/11/03/gta-6-pre-load-date-and-time-revealed-huge-file-size-confirmed/"],
			["GameSpot: GTA 6 file size", "https://www.gamespot.com/articles/gta-6-file-size-revealed-and-its-massive/"],
			["Push Square: release times and preload", "https://www.pushsquare.com/guides/gta-6-release-times-and-preload-when-can-you-start-playing"]]
	};

	/* ======================= vehicles (generic, not game vehicles) ======================= */
	/* m kg, len / ht body m, wb wheelbase, fr front weight share, hcg CoM height, r wheel radius, trav suspension travel, sag share of travel at rest,
	   P engine kW, cda drag area m2, mu tyre grip, drive "r" | "a" | "f", body profile, bike = two wheels drawn as a motorbike */
	var VEHICLES = [
		{ id: "hatch", name: "Hatchback", m: 1200, len: 4.0, ht: 1.45, wb: 2.5, fr: 0.6, hcg: 0.55, r: 0.31, trav: 0.22, sag: 0.48, P: 85, cda: 0.65, mu: 0.95, drive: "f", body: "hatch", color: "#f2c94c" },
		{ id: "sports", name: "Sports coupe", m: 1450, len: 4.4, ht: 1.3, wb: 2.5, fr: 0.52, hcg: 0.48, r: 0.33, trav: 0.2, sag: 0.45, P: 300, cda: 0.6, mu: 1.1, drive: "r", body: "coupe", color: "#e8335a" },
		{ id: "super", name: "Supercar", m: 1500, len: 4.6, ht: 1.15, wb: 2.7, fr: 0.42, hcg: 0.42, r: 0.34, trav: 0.18, sag: 0.45, P: 470, cda: 0.62, mu: 1.2, drive: "a", body: "super", color: "#ff8a1f" },
		{ id: "muscle", name: "Muscle car", m: 1700, len: 4.8, ht: 1.35, wb: 2.8, fr: 0.55, hcg: 0.52, r: 0.34, trav: 0.23, sag: 0.48, P: 340, cda: 0.75, mu: 1.0, drive: "r", body: "muscle", color: "#2f80ed" },
		{ id: "suv", name: "SUV", m: 2200, len: 4.8, ht: 1.75, wb: 2.9, fr: 0.54, hcg: 0.72, r: 0.38, trav: 0.26, sag: 0.48, P: 220, cda: 1.0, mu: 0.95, drive: "a", body: "suv", color: "#6c7a89" },
		{ id: "truck", name: "Off-road pickup", m: 2400, len: 5.6, ht: 1.95, wb: 3.4, fr: 0.55, hcg: 0.8, r: 0.43, trav: 0.4, sag: 0.4, P: 300, cda: 1.15, mu: 0.95, drive: "a", body: "pickup", color: "#27ae60" },
		{ id: "monster", name: "Monster truck", m: 5000, len: 5.2, ht: 3.4, wb: 3.8, fr: 0.5, hcg: 1.5, r: 0.84, trav: 0.7, sag: 0.35, P: 1100, cda: 2.6, mu: 1.0, drive: "a", body: "monster", color: "#9b51e0" },
		{ id: "bike", name: "Sport bike + rider", m: 280, len: 2.1, ht: 1.25, wb: 1.42, fr: 0.52, hcg: 0.62, r: 0.31, trav: 0.13, sag: 0.3, P: 150, cda: 0.42, mu: 1.15, drive: "r", body: "bike", color: "#eb5757", bike: true },
		{ id: "dirt", name: "Dirt bike + rider", m: 190, len: 2.2, ht: 1.35, wb: 1.48, fr: 0.5, hcg: 0.75, r: 0.36, trav: 0.3, sag: 0.33, P: 40, cda: 0.5, mu: 1.0, drive: "r", body: "dirt", color: "#f2994a", bike: true }
	];
	function vehicle(id) { for (var i = 0; i < VEHICLES.length; i++) if (VEHICLES[i].id === id) return VEHICLES[i]; return VEHICLES[1]; }

	/* body outline in body coordinates (x forward, y up, origin at the CoM), from the vehicle's size; also the contact points */
	function bodyShape(v) {
		var L = v.len, H = v.ht, gc = Math.max(0.12, v.r * (v.bike ? 0.9 : 0.55)), y0 = gc - v.hcg, cx = (0.5 - v.fr) * v.wb * 0.6, P;
		function pt(fx, fy) { return [cx + (fx - 0.5) * L, y0 + fy * (H - gc)]; }
		switch (v.body) {
			case "hatch": P = [[0, 0.1], [0.02, 0.45], [0.18, 0.55], [0.38, 1], [0.84, 1], [0.97, 0.62], [1, 0.3], [0.98, 0.05]]; break;
			case "coupe": P = [[0, 0.12], [0.02, 0.5], [0.3, 0.62], [0.45, 1], [0.72, 0.98], [0.9, 0.62], [1, 0.4], [0.99, 0.06]]; break;
			case "super": P = [[0, 0.1], [0.01, 0.42], [0.32, 0.55], [0.48, 1], [0.66, 0.98], [0.86, 0.66], [1, 0.42], [0.99, 0.08]]; break;
			case "muscle": P = [[0, 0.12], [0.01, 0.58], [0.35, 0.62], [0.47, 1], [0.7, 1], [0.84, 0.64], [1, 0.58], [0.99, 0.1]]; break;
			case "suv": P = [[0, 0.08], [0.02, 0.55], [0.2, 0.62], [0.3, 1], [0.86, 1], [0.97, 0.7], [1, 0.38], [0.98, 0.05]]; break;
			case "pickup": P = [[0, 0.1], [0.01, 0.55], [0.22, 0.6], [0.3, 1], [0.58, 1], [0.6, 0.6], [0.98, 0.58], [1, 0.3], [0.99, 0.06]]; break;
			case "monster": P = [[0.02, 0.45], [0.04, 0.72], [0.25, 0.76], [0.33, 1], [0.7, 1], [0.8, 0.76], [0.98, 0.72], [1, 0.45]]; break;
			default: P = [[0.05, 0.15], [0.12, 0.6], [0.4, 0.68], [0.55, 1], [0.75, 0.95], [0.95, 0.55], [1, 0.25], [0.8, 0.05]]; /* bikes: rider + machine */
		}
		if (!v.bike) P = P.map(function (p) { return [1 - p[0], p[1]]; }).reverse(); /* profiles are written tail-first: mirror so the bonnet faces forward (+x) */
		var pts = P.map(function (p) { return pt(p[0], p[1]); });
		var top = pts.filter(function (p, i) { return P[i][1] >= 0.95; }); /* roof points: touching = crashed */
		return { pts: pts, roof: top, gc: gc };
	}

	/* ======================= courses ======================= */
	var COURSE_DEF = { ramp: "curved", angle: 25, height: 2, gap: 25, pit: 0, pitType: "ground", land: "ramp", landAngle: 25, landHeight: 2, plat: 12 };
	/* tuned with the speed sweep (2026-11-07): each preset's speed sits inside its window of clean / hard landings */
	var PRESETS = [
		{ id: "kicker", name: "Kicker on flat ground", veh: "hatch", kmh: 45, c: { ramp: "straight", angle: 8, height: 0.6, gap: 0, pit: 0, land: "flat" }, note: "A small kicker with nowhere soft to land: every landing on flat ground is hard. Compare it with Pro landing ramp." },
		{ id: "pro", name: "Pro landing ramp", veh: "super", kmh: 78, c: { ramp: "straight", angle: 10, height: 4, gap: 15, pit: 0, land: "ramp", landAngle: 10, landHeight: 4 }, note: "Matching takeoff and landing ramps, like a real stunt show: clean from about 77 to 80 km/h, hard up to 86, then brutal." },
		{ id: "canal", name: "Over the canal", veh: "muscle", kmh: 90, c: { ramp: "straight", angle: 10, height: 2, gap: 20, pit: 5, pitType: "water", land: "ramp", landAngle: 10, landHeight: 2 }, note: "A 20 m canal with a small landing ramp on the far bank. The window is only a few km/h wide." },
		{ id: "roof", name: "Rooftop to rooftop", veh: "muscle", kmh: 46, c: { ramp: "none", angle: 0, height: 0, gap: 6, pit: 14, land: "platform", landHeight: -2, plat: 25 }, note: "No ramp: straight off a roof edge, over a 6 m street, onto a lower roof. A flat landing is always hard, and a few km/h either way is a wreck." },
		{ id: "canyon", name: "Canyon jump", veh: "super", kmh: 105, c: { ramp: "straight", angle: 10, height: 4, gap: 30, pit: 40, land: "ramp", landAngle: 10, landHeight: 4 }, note: "A 30 m canyon with a 40 m drop. Too slow and there is no second try." },
		{ id: "mega", name: "Mega ramp", veh: "dirt", kmh: 78, c: { ramp: "straight", angle: 20, height: 8, gap: 30, pit: 0, land: "ramp", landAngle: 20, landHeight: 8 }, note: "A dirt bike over a 30 m gap between 8 m towers: long airtime, big height." },
		{ id: "monster", name: "Monster truck show", veh: "monster", kmh: 83, c: { ramp: "straight", angle: 15, height: 4, gap: 15, pit: 0, land: "ramp", landAngle: 8, landHeight: 6 }, note: "Five tonnes on 0.7 m of suspension travel: the widest window of any vehicle here." },
		{ id: "whoop", name: "Dirt bike double", veh: "dirt", kmh: 65, c: { ramp: "straight", angle: 15, height: 3, gap: 10, pit: 0, land: "ramp", landAngle: 8, landHeight: 4 }, note: "A motocross double: clear the gap and touch down on the down slope." },
		{ id: "curved", name: "Why car ramps are straight", veh: "sports", kmh: 130, c: { ramp: "curved", angle: 30, height: 3, gap: 15, pit: 0, land: "ramp", landAngle: 10, landHeight: 3 }, note: "A curved kicker squashes the suspension. As the front wheels leave the lip, the still-squashed rear springs kick the tail up (riders call it bucking) and the car nose-dives into a flip. Car-jump ramps are long and straight at the lip." }
	];


	function arcPts(out, x0, y0, a0, a1, R, n) { /* tangent-continuous arc from slope a0 to a1 (radians), concave up when a1 > a0 */
		var s = a1 > a0 ? 1 : -1, cx = x0 - s * R * Math.sin(a0), cy = y0 + s * R * Math.cos(a0);
		for (var i = 1; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; out.push([cx + s * R * Math.sin(a), cy - s * R * Math.cos(a)]); }
		return out[out.length - 1];
	}
	/* course params -> polyline (x increasing, vertical steps allowed) + landmarks; the lip of the takeoff is at x = 0 */
	function buildCourse(o) {
		var c = {}, k; for (k in COURSE_DEF) c[k] = COURSE_DEF[k]; for (k in o || {}) if (o[k] != null) c[k] = o[k];
		var th = Math.max(0, Math.min(60, +c.angle || 0)) * RAD, H = Math.max(0, Math.min(40, +c.height || 0)), ramp = c.ramp;
		if (ramp === "none" || th < 0.5 * RAD || H < 0.05) { ramp = "none"; th = 0; H = 0; }
		var D = Math.max(0, Math.min(200, +c.pit || 0)), G = Math.max(0, Math.min(400, +c.gap || 0)), pts = [], p;
		/* takeoff ramp ends at (0, H) */
		var rampStart;
		if (ramp === "curved") {
			var R = H / (1 - Math.cos(th)), run = R * Math.sin(th); rampStart = -run;
			pts.push([-3000, 0], [rampStart, 0]); arcPts(pts, rampStart, 0, 0, th, R, 28);
		} else if (ramp === "straight") {
			var Rt = Math.min(40, 0.5 * H / (1 - Math.cos(th))), ax = Rt * Math.sin(th), ay = Rt * (1 - Math.cos(th)), runS = (H - ay) / Math.tan(th) + ax; rampStart = -runS; /* half the height in a gentle transition, then straight to the lip */
			pts.push([-3000, 0], [rampStart, 0]); p = arcPts(pts, rampStart, 0, 0, th, Rt, 16); pts.push([0, H]);
		} else { rampStart = 0; pts.push([-3000, 0], [0, 0]); }
		var lip = { x: 0, y: H, angle: th };
		pts[pts.length - 1] = [0, H];
		/* drop at the lip down to the pit floor (or the ground) */
		var floor = -D, land = c.land, LH = +c.landHeight || 0, la = Math.max(3, Math.min(60, +c.landAngle || 25)) * RAD, xL = G, zone, water = null;
		if (land === "flat" && D === 0 && H > 0) G = Math.max(G, 0);
		if (H > 0 || D > 0) pts.push([0, floor]);
		if (land === "flat") {
			if (D > 0) { pts.push([xL, floor], [xL, 0]); zone = [xL, xL + 80]; }
			else zone = [G > 0 ? xL : 0, Infinity];
			pts.push([xL + 1500, 0]);
		} else if (land === "platform") {
			LH = Math.max(-D + 0.5, Math.min(40, LH)); var PL = Math.max(3, Math.min(200, +c.plat || 12));
			pts.push([xL, floor], [xL, LH], [xL + PL, LH]);
			if (LH !== 0) pts.push([xL + PL, 0 > LH ? Math.max(floor, Math.min(0, LH)) : 0]);
			if (D > 0 && LH > floor && LH < 0) { /* lower roof: drop back to the street, then up to ground level later */
				pts.push([xL + PL, floor], [xL + PL + 30, floor], [xL + PL + 30, 0]);
			}
			pts.push([xL + PL + 1500, 0]); zone = [xL, xL + PL];
		} else { /* landing ramp: top deck edge at (xL, LH), slopes down at la, curved run-out into the ground */
			LH = Math.max(0.3, Math.min(40, LH || 2));
			pts.push([xL, floor], [xL, LH]);
			var Rb = 60, drop = Rb * (1 - Math.cos(la)), runL = Math.max(0, (LH - drop) / Math.tan(la));
			pts.push([xL + runL, LH - runL * Math.tan(la)]);
			p = arcPts(pts, xL + runL, LH - runL * Math.tan(la), -la, 0, Rb, 14);
			pts[pts.length - 1] = [p[0], 0];
			if (D > 0) { /* the landing ramp sits on the far bank at ground level */ }
			pts.push([p[0] + 1500, 0]); zone = [xL, p[0]];
		}
		if (D > 0 && c.pitType === "water") water = { x0: 0, x1: xL, y: floor + Math.min(D * 0.55, Math.max(0, D - 1.2)) }; /* water fills the pit about half way */
		/* clean: no zero-length segments, x never decreasing */
		var clean = [pts[0]];
		for (var i = 1; i < pts.length; i++) { var a = clean[clean.length - 1], b = pts[i]; if (b[0] < a[0]) b = [a[0], b[1]]; if (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) > 1e-6) clean.push(b); }
		var segs = [];
		for (i = 0; i + 1 < clean.length; i++) {
			var A = clean[i], B = clean[i + 1], dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy);
			segs.push({ ax: A[0], ay: A[1], bx: B[0], by: B[1], tx: dx / l, ty: dy / l, nx: -dy / l, ny: dx / l, len: l, x0: Math.min(A[0], B[0]), x1: Math.max(A[0], B[0]), y0: Math.min(A[1], B[1]), y1: Math.max(A[1], B[1]) });
		}
		return { opt: c, pts: clean, segs: segs, lip: lip, rampStart: rampStart, zone: zone, water: water, floor: floor, gap: xL, landKind: land, hasGap: D > 0 || (land !== "flat" && LH > 0.3) || (land === "flat" && D > 0) };
	}
	/* ground height at x (top-most non-vertical segment covering x) and its slope */
	function groundAt(co, x) {
		var best = -1e9, sl = 0;
		for (var i = 0; i < co.segs.length; i++) {
			var s = co.segs[i]; if (s.x1 - s.x0 < 1e-9 || x < s.x0 || x > s.x1) continue;
			var y = s.ay + (x - s.ax) * (s.by - s.ay) / (s.bx - s.ax); if (y > best) { best = y; sl = Math.atan2(s.by - s.ay, s.bx - s.ax); }
		}
		return { y: best, slope: sl };
	}
	/* first hit of the ray o + t d (|d| = 1) with the ground for 0 <= t <= max: {t, x, y, seg} or null */
	function rayHit(co, ox, oy, dx, dy, max) {
		var best = null, bt = max, ex = ox + dx * max, ey = oy + dy * max, xa = Math.min(ox, ex) - 0.01, xb = Math.max(ox, ex) + 0.01;
		for (var i = 0; i < co.segs.length; i++) {
			var s = co.segs[i]; if (s.x1 < xa || s.x0 > xb) continue;
			var sx = s.bx - s.ax, sy = s.by - s.ay, den = dx * sy - dy * sx; if (Math.abs(den) < 1e-12) continue;
			var qx = s.ax - ox, qy = s.ay - oy, t = (qx * sy - qy * sx) / den, u = (qx * dy - qy * dx) / den;
			if (t >= 0 && t <= bt && u >= -1e-9 && u <= 1 + 1e-9) { bt = t; best = { t: t, x: ox + dx * t, y: oy + dy * t, seg: s }; }
		}
		return best;
	}
	/* closest ground segment to a point: {d, qx, qy, seg} (d = distance) */
	function closest(co, px, py, reach) {
		var best = null, bd = reach * reach;
		for (var i = 0; i < co.segs.length; i++) {
			var s = co.segs[i]; if (s.x1 < px - reach || s.x0 > px + reach || s.y1 < py - reach || s.y0 > py + reach) continue;
			var u = ((px - s.ax) * s.tx + (py - s.ay) * s.ty); u = Math.max(0, Math.min(s.len, u));
			var qx = s.ax + s.tx * u, qy = s.ay + s.ty * u, d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
			if (d2 < bd) { bd = d2; best = { d: Math.sqrt(d2), qx: qx, qy: qy, seg: s }; }
		}
		return best;
	}
	function inside(co, px, py) { var g = groundAt(co, px); return py < g.y - 1e-9; }

	/* ======================= the vehicle simulation ======================= */
	/* opts: mode "auto" (cruise control holds kmh until the lip) | "drive"; kmh; g (m/s2); rho (air density); airControl (game-style mid-air tilt); rolling (start near the ramp at speed) */
	function Sim(co, veh, opts) {
		opts = opts || {}; this.co = co; this.v = veh; this.o = opts;
		this.g = opts.g != null ? opts.g : G0; this.rho = opts.rho != null ? opts.rho : 1.2;
		var v = veh, m = v.m;
		this.I = m * (v.len * v.len + v.ht * v.ht) / 12 * (v.bike ? 1.1 : 0.85);
		var a = v.wb * (1 - v.fr), b = v.wb * v.fr, sag = v.trav * v.sag, self = this;
		/* rear then front axle; CoM sits b behind the front axle, so the static load on the rear is a / wb and on the front b / wb */
		this.ax = [{ bx: -b, load: a / v.wb }, { bx: a, load: b / v.wb }];
		this.ax.forEach(function (A, i) {
			A.L0 = v.trav; A.ya = v.r - v.hcg + v.trav - sag; /* attachment height in body coordinates */
			A.k = A.load * m * self.g / sag; A.c = 2 * 0.38 * Math.sqrt(A.k * A.load * m);
			A.driven = v.drive === "a" || (v.drive === "r" && i === 0) || (v.drive === "f" && i === 1);
			A.Iw = (v.bike ? 0.6 : 2.2) * Math.pow(v.r / 0.32, 2) * (v.id === "monster" ? 6 : 1); /* axle + wheels + driveline */
			A.spin = 0; A.ang = 0; A.comp = sag; A.hit = null; A.F = 0; A.on = false; A.cx = 0; A.cy = 0;
		});
		this.shape = bodyShape(v);
		this.reset(opts);
	}
	Sim.prototype.reset = function (opts) {
		opts = opts || this.o; var co = this.co, v = this.v;
		var target = (opts.kmh || 0) / 3.6, x0 = opts.mode === "drive" ? co.rampStart - (opts.approach || 140) : co.rampStart - Math.max(25, Math.min(80, target * 1.6));
		this.x = x0; this.y = v.hcg; this.th = 0; this.vx = opts.mode === "drive" ? 0 : target; this.vy = 0; this.w = 0; this.t = 0;
		var self = this; this.ax.forEach(function (A) { A.spin = self.vx / v.r; A.comp = v.trav * v.sag; A.ang = 0; });
		this.target = target; this.state = "approach"; this.ev = { scrape: false, bodyG: 0, takeoff: null, land: null, apex: null, firstTouch: null, maxH: -1e9, peakG: 0, peakGair: 0, landPeakG: 0, roof: false, body: false, splash: false, flips: 0 };
		this.gs = []; this.gNow = 1; this.landT = -1; this.stopT = 0; this.done = false; this.airT = 0; this.rot = 0; this.result = null;
		this.input = { gas: 0, brake: 0, tilt: 0 };
		this.track = []; this.recEvery = 1 / 60; this.recNext = 0;
	};
	/* shock absorber: linear at low shaft speed, blow-off valves open above 0.25 m/s (digressive, as real dampers are) */
	function damp(c, rate) { var a = Math.abs(rate), k = 0.25; return (a < k ? c * a : c * (k + 0.3 * (a - k))) * (rate < 0 ? -1 : 1); }
	Sim.prototype.body2w = function (bx, by) { var c = Math.cos(this.th), s = Math.sin(this.th); return [this.x + bx * c - by * s, this.y + bx * s + by * c]; };
	Sim.prototype.velAt = function (px, py) { return [this.vx - this.w * (py - this.y), this.vy + this.w * (px - this.x)]; };
	Sim.prototype.step = function (dt) {
		var co = this.co, v = this.v, m = v.m, g = this.g, self = this, c = Math.cos(this.th), s = Math.sin(this.th);
		var Fx = 0, Fy = 0, T = 0, dnx = s, dny = -c, wheels = 0, speed = Math.hypot(this.vx, this.vy), inp = this.input;
		function force(px, py, fx, fy) { Fx += fx; Fy += fy; T += (px - self.x) * fy - (py - self.y) * fx; }
		/* controls */
		var gas = inp.gas, brake = inp.brake;
		if (this.o.mode !== "drive" && this.state !== "air") { /* cruise control on the ground; in the air the player's gas / brake still spin the wheels */
			gas = 0; brake = 0;
			if (this.state === "approach") { var err = this.target - this.vx; if (err > 0) gas = Math.min(1, err * 0.9 + 0.25); else if (err < -0.6) brake = Math.min(1, -err * 0.15); }
			else if (this.state === "landed" && this.t - this.landT > 0.5) brake = 0.55;
		}
		var Pw = v.P * 1000;
		/* suspension + tyres, per axle */
		this.ax.forEach(function (A) {
			var att = self.body2w(A.bx, A.ya), max = A.L0 + v.r, hit = rayHit(co, att[0], att[1], dnx, dny, max);
			A.hit = hit; A.on = !!hit; A.F = 0;
			if (hit && hit.seg.ny < 0.2) { hit = null; A.on = false; A.hit = null; } /* walls are left to the wheel / body contacts */
			if (hit) {
				wheels++;
				var comp = max - hit.t, va = self.velAt(att[0], att[1]), rate = va[0] * dnx + va[1] * dny, F = A.k * comp + damp(A.c, rate);
				if (comp > A.L0) F += A.k * 12 * (comp - A.L0) + damp(A.c, rate) * 2; /* rubber bump stop */
				F = Math.max(0, F); A.comp = Math.min(comp, A.L0 + v.r * 0.5); A.F = F;
				force(att[0], att[1], -dnx * F, -dny * F);
				/* tyre: ground normal load ~ F * (strut . normal) */
				var sg = hit.seg, N = F * Math.max(0, -(dnx * sg.nx + dny * sg.ny)), vc = self.velAt(hit.x, hit.y), vt = vc[0] * sg.tx + vc[1] * sg.ty;
				var want = 0;
				if (A.driven && gas > 0) want += gas * Math.min(Pw / Math.max(Math.abs(vt), 2.5), A.load * m * g * v.mu * 1.4) * (v.drive === "a" ? 0.5 : 1);
				var stopF = vt * A.load * m / dt; /* the force that would stop this axle in one step: brakes and rolling resistance never go past it */
				if (brake > 0) want -= Math.max(-brake * v.mu * N, Math.min(brake * v.mu * N, stopF));
				want -= Math.max(-0.013 * N, Math.min(0.013 * N, stopF)); /* rolling resistance */
				var slip = A.spin * v.r - vt, fix = slip * A.Iw / (v.r * v.r * dt) * 0.5, Ft = want + fix, lim = v.mu * N;
				if (Ft > lim) Ft = lim; else if (Ft < -lim) Ft = -lim;
				force(hit.x, hit.y, sg.tx * Ft, sg.ty * Ft);
				/* wheel spins to match the ground unless the brake locks it */
				if (brake > 0.85 && Math.abs(vt) > 2) A.spin = A.spin * 0.6; else A.spin = vt / v.r;
				A.cx = att[0] + dnx * (hit.t - v.r); A.cy = att[1] + dny * (hit.t - v.r); /* wheel centre: one radius above the hit along the strut */
			} else {
				/* in the air: engine and brake trade angular momentum with the body (gas lifts the nose, braking drops it) */
				var dw = 0;
				if (A.driven && gas > 0) { var Te = gas * Math.min(Pw / Math.max(Math.abs(A.spin) * v.r, 3), A.load * m * g * v.mu * 1.4) * v.r * (v.drive === "a" ? 0.5 : 1); dw += Te / A.Iw * dt; }
				if (brake > 0) { var Tb = brake * 2.5 * A.load * m * g * v.r; dw -= Math.min(Math.abs(A.spin), Tb / A.Iw * dt) * (A.spin >= 0 ? 1 : -1); }
				var cap = (self.ev.takeoff ? self.ev.takeoff.v : speed) * 1.25 / v.r + 8; if (A.spin + dw > cap) dw = Math.max(0, cap - A.spin);
				A.spin += dw; T += A.Iw * dw / dt;
				A.comp = Math.max(0, A.comp - dt * 1.5);
				var wc = self.body2w(A.bx, A.ya - A.L0); A.cx = wc[0]; A.cy = wc[1];
				/* wheel as a circle against walls / faces / ground it reaches sideways */
				var cl = closest(co, A.cx, A.cy, v.r + 0.5);
				if (cl) {
					var inS = inside(co, A.cx, A.cy), pen = inS ? v.r + cl.d : v.r - cl.d;
					if (pen > 0) {
						var nx = inS ? (cl.qx - A.cx) : (A.cx - cl.qx), ny = inS ? (cl.qy - A.cy) : (A.cy - cl.qy), nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
						if (cl.d < 1e-6) { nx = cl.seg.nx; ny = cl.seg.ny; }
						var vw = self.velAt(A.cx, A.cy), vn = vw[0] * nx + vw[1] * ny, kk = A.k * 6, Fn = Math.max(0, kk * pen - 2 * 0.5 * Math.sqrt(kk * A.load * m) * vn);
						var tx = ny, ty = -nx, vtt = vw[0] * tx + vw[1] * ty, Ff = -0.6 * Fn * vtt / Math.sqrt(vtt * vtt + 0.3);
						force(A.cx - nx * v.r, A.cy - ny * v.r, nx * Fn + tx * Ff, ny * Fn + ty * Ff); A.F = Fn; A.on = true;
					}
				}
			}
			A.ang -= A.spin * dt;
		});
		/* body contacts (bumpers, roof, belly) */
		var bodyF = 0, roofHit = false;
		for (var i = 0; i < this.shape.pts.length; i++) {
			var bp = this.shape.pts[i], P = this.body2w(bp[0], bp[1]);
			if (P[1] > groundAt(co, P[0]).y + 0.4 && !this.near(P[0])) continue;
			var cl = closest(co, P[0], P[1], 2.5); if (!cl) continue;
			var ins = inside(co, P[0], P[1]); if (!ins) continue;
			var nx = cl.qx - P[0], ny = cl.qy - P[1], nl = Math.hypot(nx, ny); if (nl < 1e-9) { nx = cl.seg.nx; ny = cl.seg.ny; } else { nx /= nl; ny /= nl; }
			var pen = cl.d, vp = this.velAt(P[0], P[1]), vn = vp[0] * nx + vp[1] * ny, kc = m * 900, Fn = Math.max(0, kc * pen - 2 * 0.55 * Math.sqrt(kc * m * 0.3) * vn);
			var tx = ny, ty = -nx, vt2 = vp[0] * tx + vp[1] * ty, Ff = -0.5 * Fn * vt2 / Math.sqrt(vt2 * vt2 + 0.3);
			force(P[0], P[1], nx * Fn + tx * Ff, ny * Fn + ty * Ff); bodyF += Fn;
			if (this.shape.roof.indexOf(bp) >= 0 && Fn > m * g * 0.3) roofHit = true;
		}
		/* air drag at the CoM, game-style air control */
		if (speed > 0) { var Fd = 0.5 * this.rho * v.cda * speed * speed; Fx -= Fd * this.vx / speed; Fy -= Fd * this.vy / speed; }
		if (this.o.airControl && wheels === 0 && bodyF === 0) T += inp.tilt * this.I * 3.2;
		/* water: drag + buoyancy, the run ends */
		var wt = co.water, inWater = wt && this.x > wt.x0 && this.x < wt.x1 + 1 && this.y < wt.y + 0.2;
		if (inWater) { Fx -= 900 * this.vx * m / 1000 * 3; Fy += m * g * 0.9 - 900 * this.vy * m / 1000 * 3; this.ev.splash = true; }
		/* integrate (semi-implicit Euler) */
		this.vx += Fx / m * dt; this.vy += (Fy / m - g) * dt; this.w += T / this.I * dt;
		this.x += this.vx * dt; this.y += this.vy * dt; this.th += this.w * dt; this.t += dt;
		/* felt g: non-gravity acceleration, smoothed over ~25 ms (crash-test style filtering) */
		var gf = Math.hypot(Fx, Fy) / m / G0; this.gs.push(gf); var nG = Math.max(1, Math.round(0.025 / dt)); if (this.gs.length > nG) this.gs.shift();
		var gsm = 0; for (i = 0; i < this.gs.length; i++) gsm += this.gs[i]; gsm /= this.gs.length; this.gNow = gsm;
		this.wheels = wheels; this.bodyF = bodyF;
		this.events(dt, wheels, bodyF, roofHit, gsm, speed);
		if (this.t >= this.recNext) { this.recNext += this.recEvery; this.track.push([this.t, this.x, this.y, this.th, speed, gsm, this.ax[0].comp, this.ax[1].comp, this.ax[0].ang, this.ax[1].ang, wheels]); }
	};
	Sim.prototype.near = function (x) { return x > this.co.rampStart - 10 && x < (this.co.zone[1] === Infinity ? this.co.gap + 200 : this.co.zone[1] + 60); };
	Sim.prototype.events = function (dt, wheels, bodyF, roofHit, gsm, speed) {
		var e = this.ev, co = this.co, up = Math.cos(this.th);
		if (this.state === "approach") {
			if (wheels === 0 && bodyF === 0 && this.x > co.lip.x - this.v.wb - 1) {
				this.state = "air"; e.takeoff = { t: this.t, x: this.x, y: this.y, v: speed, ang: Math.atan2(this.vy, this.vx), w: this.w };
				e.maxH = this.y; this.th0 = this.th; e.apex = { x: this.x, y: this.y, t: this.t };
			}
			if (this.x > co.lip.x + 3 && wheels > 0 && !e.takeoff) { this.state = "landed"; this.landT = this.t; e.land = { t: this.t, x: this.x, rolled: true, kind: "wheels" }; }
		} else if (this.state === "air") {
			if (this.y > e.maxH) { e.maxH = this.y; e.apex = { x: this.x, y: this.y, t: this.t }; }
			e.peakGair = Math.max(e.peakGair, gsm);
			var airborne = this.t - e.takeoff.t;
			if ((wheels > 0 || bodyF > 0 || e.splash) && airborne > 0.06) {
				var gr = groundAt(co, this.x);
				this.state = "landed"; this.landT = this.t;
				e.land = { t: this.t, x: this.x, y: this.y, v: speed, vy: this.vy, kind: e.splash ? "water" : bodyF > this.v.m * G0 * 1.5 && wheels === 0 ? "body" : "wheels", pitch: this.th - gr.slope, slope: gr.slope, air: airborne };
				e.rot = this.th - this.th0;
			}
		}
		if (this.state === "landed" && this.t - this.landT < 0.6) e.landPeakG = Math.max(e.landPeakG, gsm);
		if (this.state !== "approach") e.peakG = Math.max(e.peakG, gsm);
		if (roofHit) e.roof = true;
		if (bodyF > this.v.m * G0 * 3 && this.state === "landed") { e.scrape = true; e.bodyG = Math.max(e.bodyG || 0, bodyF / this.v.m / G0); }
		/* stop conditions */
		if (speed < 0.6 && this.state !== "approach") this.stopT += dt; else this.stopT = 0;
		var landedFor = this.state === "landed" ? this.t - this.landT : 0;
		if (e.splash && landedFor > 0.8 || this.stopT > 1.2 || landedFor > 4.5 || this.t > 60 || this.y < co.floor - 30 || (this.state === "approach" && this.o.mode !== "drive" && this.t > 25)) this.finish();
	};
	Sim.prototype.finish = function () {
		if (this.done) return; this.done = true; this.result = summarize(this);
	};
	Sim.prototype.run = function (dt, maxT) { dt = dt || 1 / 500; maxT = maxT || 60; while (!this.done && this.t < maxT) this.step(dt); if (!this.done) this.finish(); return this.result; };

	/* verdict from the events */
	function summarize(sim) {
		var e = sim.ev, co = sim.co, r = { ok: false, code: "", title: "", detail: "" }, to = e.takeoff, ld = e.land;
		r.takeoff = to; r.land = ld; r.peakG = e.peakG; r.landG = e.landPeakG; r.maxH = to ? e.maxH - co.lip.y : 0; r.apex = e.apex;
		r.air = ld && ld.air ? ld.air : 0; r.dist = ld && to ? ld.x - co.lip.x : 0; r.rot = e.rot || 0;
		var flipped = Math.cos(sim.th - groundAt(co, sim.x).slope) < 0;
		if (!to) { r.code = "nojump"; r.title = "Never left the ground"; r.detail = sim.state === "approach" ? "The run ended before the ramp." : "The car rolled over the edge instead of flying."; return r; }
		if (e.splash) { r.code = "splash"; r.title = "Splash! Into the water"; r.detail = "It needed more speed to reach the far bank."; return r; }
		if (!ld) { r.code = "fell"; r.title = "Fell into the gap"; return r; }
		var z = co.zone;
		if (co.hasGap && ld.x < z[0] - 0.3) { r.code = "short"; r.title = "Came up short"; r.detail = ld.kind === "body" || ld.x > z[0] - sim.v.len ? "It hit the face of the landing." : "It landed in the gap."; return r; }
		if (e.roof || flipped) { r.code = "crash"; r.title = e.roof ? "Crashed: landed on the roof" : "Crashed: flipped over"; r.detail = "It rotated too far in the air (" + Math.round(Math.abs(r.rot) / RAD) + "°)."; return r; }
		if ((e.bodyG || 0) > 22 || e.landPeakG > 20) { r.code = "crash"; r.title = (e.bodyG || 0) > 22 ? (ld.pitch < 0 ? "Wrecked: the nose dug in" : "Wrecked: the tail slammed down") : "Wrecked: too hard a landing"; r.detail = (e.bodyG || 0) > 22 ? "The body took the landing (" + Math.round(e.bodyG) + " g), pitched " + Math.round(Math.abs(ld.pitch) / RAD) + "° to the ground." : "Peak " + Math.round(e.landPeakG) + " g: the suspension bottomed out hard. A real car would be wrecked and the driver hurt."; return r; }
		var g = e.landPeakG, over = z[1] !== Infinity && ld.x > z[1] + 0.5, scr = e.scrape;
		r.ok = true; r.scrape = !!scr;
		if (g < 6 && !scr) { r.code = "clean"; r.title = over ? "Overshot, but landed it" : "Clean landing"; }
		else if (g < 12) { r.code = "hard"; r.title = (over ? "Overshot: hard landing" : "Hard landing") + (scr ? ", the " + (ld.pitch < 0 ? "nose" : "tail") + " scraped" : ""); }
		else { r.code = "brutal"; r.title = over ? "Overshot: brutal landing" : "Brutal landing"; r.ok = true; }
		r.over = over;
		r.detail = "Peak " + g.toFixed(1) + " g on touchdown" + (over ? ", past the end of the landing" : "") + (scr ? "; the body touched the ground" : "") + ".";
		return r;
	}
	/* run the whole jump without drawing; returns the summary plus the path */
	function simulate(co, veh, opts, dt) { var s = new Sim(co, veh, opts); var r = s.run(dt || 1 / 500, 60); r.track = s.track; r.t = s.t; return r; }
	/* speed sweep: one headless run per speed (km/h list) -> [{kmh, code, dist, landG, air}] */
	function sweepOne(co, veh, opts, kmh) { var o = {}; for (var k in opts) o[k] = opts[k]; o.kmh = kmh; o.mode = "auto"; var r = simulate(co, veh, o, 1 / 400); return { kmh: kmh, code: r.code, ok: r.ok, dist: r.dist, landG: r.landG, air: r.air, maxH: r.maxH, title: r.title }; }

	/* ======================= jump calculator (point mass) ======================= */
	/* drop h = how far the landing is BELOW the lip (negative = above). Range on that level, airtime, apex, landing angle and speed */
	function projectile(v, thDeg, h, g) {
		g = g || G0; var th = thDeg * RAD, vx = v * Math.cos(th), vy = v * Math.sin(th), disc = vy * vy + 2 * g * h;
		if (disc < 0) return null; var t = (vy + Math.sqrt(disc)) / g, vyl = vy - g * t;
		return { t: t, x: vx * t, apex: vy > 0 ? vy * vy / (2 * g) : 0, tApex: Math.max(0, vy / g), vLand: Math.hypot(vx, vyl), angLand: Math.atan2(vyl, vx) / RAD };
	}
	/* minimum takeoff speed to cover horizontal x landing h below the lip, at angle th (no drag) */
	function speedNeeded(x, thDeg, h, g) {
		g = g || G0; var th = thDeg * RAD, den = 2 * Math.cos(th) * Math.cos(th) * (x * Math.tan(th) + h);
		return den <= 0 ? Infinity : Math.sqrt(g * x * x / den);
	}
	/* the angle that gives the longest jump for speed v landing h below the lip (no drag): tan(th) = v / sqrt(v^2 + 2 g h) */
	function bestAngle(v, h, g) { g = g || G0; var q = v * v + 2 * g * h; return q <= 0 ? 45 : Math.atan(v / Math.sqrt(q)) / RAD; }
	/* with quadratic drag k = rho Cd A / (2 m): integrate until y = -h on the way down. Returns {t, x, apex, vLand, path} */
	function dragFlight(v, thDeg, h, k, g, wantPath) {
		g = g || G0; var th = thDeg * RAD, x = 0, y = 0, vx = v * Math.cos(th), vy = v * Math.sin(th), t = 0, dt = 0.002, ap = 0, path = wantPath ? [[0, 0]] : null, n = 0;
		function acc(vx, vy) { var s = Math.hypot(vx, vy); return [-k * s * vx, -g - k * s * vy]; }
		while (t < 120) {
			var a1 = acc(vx, vy), a2 = acc(vx + a1[0] * dt / 2, vy + a1[1] * dt / 2), a3 = acc(vx + a2[0] * dt / 2, vy + a2[1] * dt / 2), a4 = acc(vx + a3[0] * dt, vy + a3[1] * dt);
			var nvx = vx + dt / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]), nvy = vy + dt / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
			var nx = x + (vx + nvx) / 2 * dt, ny = y + (vy + nvy) / 2 * dt;
			if (ny <= -h && nvy < 0) { var f = (y + h) / (y - ny); x += (nx - x) * f; t += dt * f; vx = vx + (nvx - vx) * f; vy = vy + (nvy - vy) * f; y = -h; if (path) path.push([x, y]); break; }
			x = nx; y = ny; vx = nvx; vy = nvy; t += dt; if (y > ap) ap = y; if (path && ++n % 10 === 0) path.push([x, y]);
		}
		return { t: t, x: x, apex: ap, vLand: Math.hypot(vx, vy), angLand: Math.atan2(vy, vx) / RAD, path: path };
	}
	/* drag version of speedNeeded by bisection */
	function speedNeededDrag(x, thDeg, h, k, g) {
		var lo = 0.5, hi = 400; if (dragFlight(hi, thDeg, h, k, g).x < x) return Infinity;
		for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (dragFlight(mid, thDeg, h, k, g).x >= x) hi = mid; else lo = mid; }
		return hi;
	}

	/* ======================= countdown ======================= */
	var CITIES = [["Auckland", "Pacific/Auckland"], ["Sydney", "Australia/Sydney"], ["Tokyo", "Asia/Tokyo"], ["Manila", "Asia/Manila"], ["Ho Chi Minh City", "Asia/Ho_Chi_Minh"], ["Delhi", "Asia/Kolkata"], ["Dubai", "Asia/Dubai"],
		["Johannesburg", "Africa/Johannesburg"], ["Berlin", "Europe/Berlin"], ["London", "Europe/London"], ["São Paulo", "America/Sao_Paulo"], ["Toronto", "America/Toronto"], ["New York", "America/New_York"],
		["Chicago", "America/Chicago"], ["Denver", "America/Denver"], ["Vancouver", "America/Vancouver"], ["Los Angeles", "America/Los_Angeles"], ["Honolulu", "Pacific/Honolulu"]];
	/* minutes east of UTC for tz at instant ms (uses the clock lib's CK when present: it fixes B.C.'s permanent UTC-7 on old tz data) */
	function offsetMin(tz, ms) {
		var ck = typeof CK !== "undefined" ? CK : root.CK; /* the clock lib (lib_from) */
		if (ck && ck.offsetMin) return ck.offsetMin(new Date(ms), tz);
		var f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
		var p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = +x.value; });
		return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000);
	}
	/* the UTC instant of a wall-clock time in tz */
	function zoned(tz, y, mo, d, h, mi) {
		var guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0), t = guess - offsetMin(tz, guess) * 60000;
		return guess - offsetMin(tz, t) * 60000;
	}
	function midnight(tz, iso) { var p = iso.split("-").map(Number); return zoned(tz, p[0], p[1], p[2], 0, 0); }
	function parts(ms) { ms = Math.max(0, ms); var s = Math.floor(ms / 1000); return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60, total: ms }; }
	/* the moments it unlocks: midnight local (how PlayStation and most digital stores release by region), and the first moment anywhere (New Zealand) */
	function unlockTimes(tz, iso) { iso = iso || FACTS.release; return { local: midnight(tz, iso), first: midnight("Pacific/Auckland", iso), last: midnight("Pacific/Honolulu", iso) }; }

	/* ======================= download + storage ======================= */
	var SPEED_UNITS = { mbps: [1e6, "Mbps"], gbps: [1e9, "Gbps"], mbs: [8e6, "MB/s"], kbps: [1e3, "kbps"] };
	/* time in seconds to download gb (decimal gigabytes, as the stores show) at speed in the unit, with an efficiency (0..1) for overheads and Wi-Fi */
	function downloadSeconds(gb, speed, unit, eff) { var bps = speed * (SPEED_UNITS[unit] || SPEED_UNITS.mbps)[0] * (eff == null ? 0.85 : eff); return bps > 0 ? gb * 8e9 / bps : Infinity; }
	function durationText(sec) {
		if (!isFinite(sec)) return "never"; if (sec < 60) return Math.ceil(sec) + " seconds";
		var m = Math.round(sec / 60), d = Math.floor(m / 1440), h = Math.floor(m / 60) % 24, mm = m % 60, out = [];
		if (d) out.push(d + (d === 1 ? " day" : " days")); if (h) out.push(h + (h === 1 ? " hour" : " hours")); if (mm && d < 3) out.push(mm + (mm === 1 ? " minute" : " minutes"));
		return out.join(" ") || "under a minute";
	}
	/* consoles: advertised size and roughly how much is free for games out of the box (system software takes the rest) */
	var CONSOLES = [
		{ id: "ps5", name: "PS5 (original, 825 GB)", total: 825, usable: 667 },
		{ id: "ps5slim", name: "PS5 Slim (1 TB)", total: 1000, usable: 848 },
		{ id: "ps5pro", name: "PS5 Pro (2 TB)", total: 2000, usable: 1860 },
		{ id: "xsx", name: "Xbox Series X (1 TB)", total: 1000, usable: 802 },
		{ id: "xss", name: "Xbox Series S (512 GB)", total: 512, usable: 364 },
		{ id: "xss1", name: "Xbox Series S (1 TB)", total: 1000, usable: 802 },
		{ id: "xsx2", name: "Xbox Series X (2 TB)", total: 2000, usable: 1800 }
	];
	var CONNECTIONS = [["Slow DSL", 10], ["Typical DSL", 25], ["4G mobile", 40], ["Basic cable", 100], ["5G mobile", 250], ["Fast cable", 500], ["Gigabit fibre", 1000], ["2 Gig fibre", 2000]];

	/* ======================= news feed parsing (shared with api/gta-news.js) ======================= */
	function decode(s) {
		return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
			.replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
	}
	function tag(x, t) { var m = x.match(new RegExp("<" + t + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + t + ">", "i")); return m ? m[1] : ""; }
	/* RSS -> [{title, link, source, date (ms)}]; Google News titles end with " - Source": split it off. Only http(s) links are kept. */
	function parseRss(xml, n) {
		var out = [], items = String(xml || "").split(/<item[\s>]/i).slice(1);
		items.forEach(function (it) {
			var title = decode(tag(it, "title")), link = decode(tag(it, "link")), src = decode(tag(it, "source")), d = Date.parse(decode(tag(it, "pubDate")));
			if (!title || !/^https?:\/\//i.test(link)) return;
			if (src && title.slice(-(src.length + 3)) === " - " + src) title = title.slice(0, -(src.length + 3));
			out.push({ title: title, link: link, source: src, date: isFinite(d) ? d : 0 });
		});
		out.sort(function (a, b) { return b.date - a.date; });
		var seen = {}; out = out.filter(function (x) { var k = x.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60); if (seen[k]) return false; seen[k] = 1; return true; });
		return out.slice(0, n || 30);
	}
	/* keep only items that are about GTA / Rockstar */
	function aboutGta(title) { return /\b(gta|grand theft auto|rockstar games|rockstar's|vice city)\b/i.test(title); }
	/* the publishers' own RSS feeds (headline + link only is how they offer them); checked 2026-11-07 */
	var NEWS_FEEDS = [["GameSpot", "https://www.gamespot.com/feeds/news/"], ["Push Square", "https://www.pushsquare.com/feeds/latest"], ["Pure Xbox", "https://www.purexbox.com/feeds/latest"],
		["Eurogamer", "https://www.eurogamer.net/feed"], ["Rock Paper Shotgun", "https://www.rockpapershotgun.com/feed"], ["Kotaku", "https://kotaku.com/rss"], ["IGN", "https://feeds.feedburner.com/ign/games-all"],
		["Polygon", "https://www.polygon.com/rss/index.xml"], ["VGC", "https://www.videogameschronicle.com/feed/"], ["GamesRadar+", "https://www.gamesradar.com/feeds/all/"], ["PC Gamer", "https://www.pcgamer.com/rss/"]];


	/* ======================= community map (mes.fm/gta-6-map, api/gta-map.js) ======================= */
	/* Map coordinates are 0..1000 on both axes of the map picture (MAP_V = its version: a new picture gets a new number,
	   and pins keep the version they were made on). Regions are the names Rockstar has published; the picture is a rough fan sketch. */
	var MAP_V = 1;
	var PIN_CATS = [["secret", "Secret", "#c2185b"], ["animal", "Animal", "#2e7d32"], ["fishing", "Fishing", "#0277bd"], ["gem", "Hidden gem", "#f9a825"],
		["egg", "Easter egg", "#7b1fa2"], ["collect", "Collectible", "#ef6c00"], ["activity", "Activity", "#00838f"], ["vehicle", "Vehicle", "#455a64"],
		["stunt", "Stunt jump", "#d84315"], ["other", "Other", "#6d4c41"]];
	var REGIONS = ["Vice City", "Leonida Keys", "Grassrivers", "Port Gellhorn", "Ambrosia", "Mount Kalaga", "Somewhere else"];
	var BAD = /\b(n[i1!]gg(a|er|uh)s?|f[a@]gg?(ot|s)?|r[e3]t[a@]rds?|k[i1]kes?|ch[i1]nks?|sp[i1]cs?|tr[a@]nn(y|ies))\b/i;
	function pinText(v, max, lines) {
		if (typeof v !== "string") return null;
		var s = v.replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ").replace(/[​-‏‪-‮⁦-⁩]/g, "");
		s = lines ? s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim() : s.replace(/\s+/g, " ").trim();
		return s.length <= max ? s : null;
	}
	/* links are not allowed (spam); a YouTube / Twitch clip id is fine only through the "clip" field below */
	function hasLink(s) { return /https?:|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|gg|ly|me|tv|co|xyz|ru|info|biz|fm|app|link|site|shop|top)\b/i.test(s); }
	/* validate a new pin: returns {pin} or {error} */
	function cleanPin(b) {
		var allowed = ["act", "x", "y", "cat", "title", "desc", "region", "clip", "vid", "t", "hp", "m"];
		for (var k in b) if (allowed.indexOf(k) < 0) return { error: "unknown field " + String(k).slice(0, 20) };
		var x = b.x, y = b.y;
		if (typeof x !== "number" || typeof y !== "number" || !(x >= 0 && x <= 1000 && y >= 0 && y <= 1000)) return { error: "pick a spot on the map" };
		if (!PIN_CATS.some(function (c) { return c[0] === b.cat; })) return { error: "pick a type" };
		var title = pinText(b.title, 70, false);
		if (title === null) return { error: "the title is too long (70 characters at most)" };
		if (title.length < 3) return { error: "give it a short title" };
		var desc = b.desc === undefined || b.desc === "" ? "" : pinText(b.desc, 600, true);
		if (desc === null) return { error: "the description is too long (600 characters at most)" };
		if (hasLink(title) || hasLink(desc)) return { error: "links are not allowed (paste a YouTube video id in the clip box instead)" };
		if (BAD.test(title) || BAD.test(desc)) return { error: "please keep it friendly" };
		var region = b.region === undefined || b.region === "" ? "" : b.region;
		if (region && REGIONS.indexOf(region) < 0) return { error: "pick a region from the list" };
		var clip = b.clip === undefined || b.clip === "" ? "" : clipId(b.clip);
		if (clip === null) return { error: "the clip must be a YouTube link or video id" };
		return { pin: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, cat: b.cat, title: title, desc: desc, region: region, clip: clip, m: MAP_V } };
	}
	/* YouTube link / id -> 11-character id; "" stays ""; anything else null */
	function clipId(v) {
		if (typeof v !== "string") return null;
		var s = v.trim(); if (!s) return "";
		if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
		var m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/);
		return m ? m[1] : null;
	}
	/* Votes: guest votes count 1, votes signed with Hive (p.hup / p.hdn) count HIVE_W. wv(p) = weighted {u, d}. */
	var HIVE_W = 2;
	function wv(p) { return { u: (p.up || 0) + HIVE_W * (p.hup || 0), d: (p.dn || 0) + HIVE_W * (p.hdn || 0) }; }
	/* verdict from the (weighted) votes: "verified" | "disputed" | "fake" | "new" | "" */
	function pinStatus(up, dn) {
		up = up || 0; dn = dn || 0; var n = up + dn, s = up - dn;
		if (s <= -5) return "fake";
		if (s >= 5 && up >= 0.75 * n) return "verified";
		if (n >= 4 && up < 0.6 * n) return "disputed";
		if (n < 3) return "new";
		return "";
	}
	function statusOf(p) { var w = wv(p); return pinStatus(w.u, w.d); }
	/* "Verified on Hive": at least 2 Hive accounts say it's real and at most 1 in 4 Hive votes say fake */
	function hiveOk(p) { var u = p.hup || 0, d = p.hdn || 0; return u >= 2 && d * 3 <= u; }
	/* Wilson lower bound (95%) of the share of up votes: a fair "top" order that does not favour pins with one vote */
	function pinRank(up, dn) {
		var n = (up || 0) + (dn || 0); if (!n) return 0;
		var z = 1.96, p = up / n;
		return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
	}
	function rankOf(p) { var w = wv(p); return pinRank(w.u, w.d); }
	function scoreOf(p) { var w = wv(p); return w.u - w.d; }
	function sortPins(list, how) {
		var a = list.slice();
		if (how === "new") a.sort(function (p, q) { return q.c - p.c; });
		else if (how === "disputed") a.sort(function (p, q) { var x = wv(p), y = wv(q); return (Math.min(y.u, y.d) - Math.min(x.u, x.d)) || (y.u + y.d - x.u - x.d); });
		else a.sort(function (p, q) { return (rankOf(q) - rankOf(p)) || (scoreOf(q) - scoreOf(p)) || (q.c - p.c); });
		return a;
	}
	function filterPins(list, f) {
		f = f || {}; var q = String(f.q || "").toLowerCase().trim(), words = q ? q.split(/\s+/) : [];
		return list.filter(function (p) {
			if (f.cats && f.cats.length && f.cats.indexOf(p.cat) < 0) return false;
			if (f.verified && statusOf(p) !== "verified" && !hiveOk(p)) return false;
			if (f.hive && !p.ha) return false;
			if (f.region && p.region !== f.region) return false;
			if (words.length) { var t = (p.title + " " + p.desc + " " + p.region + " " + catName(p.cat) + (p.ha ? " @" + p.ha : "")).toLowerCase(); for (var i = 0; i < words.length; i++) if (t.indexOf(words[i]) < 0) return false; }
			return true;
		});
	}
	/* top explorers: Hive accounts by verified finds, then total score, then pins */
	function explorers(list) {
		var by = {};
		list.forEach(function (p) {
			if (!p.ha) return;
			var e = by[p.ha] || (by[p.ha] = { acct: p.ha, pins: 0, verified: 0, score: 0 });
			e.pins++; e.score += scoreOf(p); if (statusOf(p) === "verified" || hiveOk(p)) e.verified++;
		});
		return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return (b.verified - a.verified) || (b.score - a.score) || (b.pins - a.pins) || (a.acct < b.acct ? -1 : 1); });
	}
	/* ---------- Hive records (custom_json id HIVE_ID, posting key) ---------- */
	var HIVE_ID = "mes_gtamap";
	function hivePinJson(pin) { return JSON.stringify({ v: 1, a: "pin", x: pin.x, y: pin.y, cat: pin.cat, title: pin.title, desc: pin.desc || "", region: pin.region || "", clip: pin.clip || "", m: pin.m || MAP_V }); }
	function hiveVoteJson(id, v) { return JSON.stringify({ v: 1, a: "vote", id: id, vt: v }); }
	/* account history entries -> [{trx, ts, acct, rec}] of HIVE_ID ops signed with acct's posting authority only */
	function parseHistory(entries, acct) {
		var out = [];
		(entries || []).forEach(function (e) {
			var x = e && e[1] || {}, op = x.op;
			if (!op || op[0] !== "custom_json" || !op[1] || op[1].id !== HIVE_ID) return;
			var auths = op[1].required_posting_auths || [];
			if (auths.length !== 1 || auths[0] !== acct || (op[1].required_auths || []).length) return;
			var j; try { j = typeof op[1].json === "string" ? JSON.parse(op[1].json) : op[1].json; } catch (er) { return; }
			if (!j || typeof j !== "object" || j.v !== 1) return;
			out.push({ trx: x.trx_id || "", ts: Date.parse(String(x.timestamp || "") + (/Z$/.test(x.timestamp || "") ? "" : "Z")) || 0, acct: acct, rec: j });
		});
		return out;
	}
	/* a Hive pin record -> {pin} or {error} (same rules as a guest pin) */
	function pinFromRecord(rec) {
		if (!rec || rec.a !== "pin") return { error: "that is not a pin" };
		return cleanPin({ x: rec.x, y: rec.y, cat: rec.cat, title: rec.title, desc: rec.desc, region: rec.region, clip: rec.clip });
	}
	function voteFromRecord(rec) {
		if (!rec || rec.a !== "vote" || typeof rec.id !== "string" || !/^[a-z0-9]{8}$/.test(rec.id) || [1, -1, 0].indexOf(rec.vt) < 0) return { error: "that is not a vote" };
		return { id: rec.id, v: rec.vt };
	}
	function catName(id) { for (var i = 0; i < PIN_CATS.length; i++) if (PIN_CATS[i][0] === id) return PIN_CATS[i][1]; return "Other"; }
	var MAP = { MAP_V: MAP_V, PIN_CATS: PIN_CATS, REGIONS: REGIONS, pinText: pinText, hasLink: hasLink, cleanPin: cleanPin, clipId: clipId,
		pinStatus: pinStatus, pinRank: pinRank, sortPins: sortPins, filterPins: filterPins, catName: catName, BAD: BAD,
		HIVE_W: HIVE_W, wv: wv, statusOf: statusOf, hiveOk: hiveOk, scoreOf: scoreOf, explorers: explorers,
		HIVE_ID: HIVE_ID, hivePinJson: hivePinJson, hiveVoteJson: hiveVoteJson, parseHistory: parseHistory, pinFromRecord: pinFromRecord, voteFromRecord: voteFromRecord };

	var API = { G0: G0, FACTS: FACTS, VEHICLES: VEHICLES, vehicle: vehicle, bodyShape: bodyShape, PRESETS: PRESETS, COURSE_DEF: COURSE_DEF, buildCourse: buildCourse, groundAt: groundAt, rayHit: rayHit, closest: closest, inside: inside,
		Sim: Sim, simulate: simulate, sweepOne: sweepOne, summarize: summarize,
		projectile: projectile, speedNeeded: speedNeeded, bestAngle: bestAngle, dragFlight: dragFlight, speedNeededDrag: speedNeededDrag,
		CITIES: CITIES, offsetMin: offsetMin, zoned: zoned, midnight: midnight, parts: parts, unlockTimes: unlockTimes,
		SPEED_UNITS: SPEED_UNITS, downloadSeconds: downloadSeconds, durationText: durationText, CONSOLES: CONSOLES, CONNECTIONS: CONNECTIONS,
		parseRss: parseRss, aboutGta: aboutGta, NEWS_FEEDS: NEWS_FEEDS, decode: decode, MAP: MAP };
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESGTA = API;
})(typeof window !== "undefined" ? window : this);
