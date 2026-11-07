/* MES Clock -- pure helpers (no DOM). Browser global `CK`; node: require('./tool_apps_src/clock/lib.js'); tests: node tool_apps_src/clock-tests.js */
(function (root) {
	"use strict";
	var FMT = {};
	function fmt(tz) {
		if (!FMT[tz]) FMT[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
		return FMT[tz];
	}
	function valid(tz) { try { fmt(tz); return true; } catch (e) { return false; } }
	var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	// B.C. stays on UTC-7 all year from 1 Nov 2026 (clocks did not fall back). Browsers / node with older time-zone data
	// still put America/Vancouver on PST (UTC-8) after that date, so the zone is swapped for Etc/GMT+7 (= UTC-7) then.
	var BC_FROM = Date.UTC(2026, 10, 1, 9), BC_OLD = null;
	function bcOld() {
		if (BC_OLD === null) { try { BC_OLD = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", hour: "numeric", hourCycle: "h23" }).format(new Date(Date.UTC(2027, 0, 15, 12))).replace(/^0/, "") === "4"; } catch (e) { BC_OLD = false; } }
		return BC_OLD;
	}
	// the IANA name to hand Intl for `tz` at `date` ("" = the browser's own zone)
	function zoneAt(tz, date) {
		var z = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
		if (z === "America/Vancouver" && +date >= BC_FROM && bcOld()) return "Etc/GMT+7";
		return z;
	}
	// wall-clock parts of `date` in time zone `tz` ("" / null = the browser's own zone)
	function partsIn(date, tz) {
		var o = {}, ms = ((date.getTime() % 1000) + 1000) % 1000;
		var f = fmt(zoneAt(tz, date));
		f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
		var h = +o.hour; if (h === 24) h = 0;
		return { y: +o.year, mo: +o.month, d: +o.day, h: h, m: +o.minute, s: +o.second, ms: ms, wd: WD[o.weekday] };
	}
	// UTC offset in minutes (east positive), from the wall clock vs the real instant
	function offsetMin(date, tz) {
		var p = partsIn(date, tz), asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m, p.s);
		return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
	}
	function offsetLabel(min) { var sign = min < 0 ? "-" : "+", a = Math.abs(min), h = Math.floor(a / 60), m = a % 60; return "UTC" + sign + h + (m ? ":" + (m < 10 ? "0" : "") + m : ""); }
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	// "3:45:07 PM" / "15:45:07" / "3:45 PM"
	function timeText(p, h12, sec) {
		var h = p.h, suffix = "";
		if (h12) { suffix = h >= 12 ? " PM" : " AM"; h = h % 12; if (h === 0) h = 12; }
		return (h12 ? h : pad(h)) + ":" + pad(p.m) + (sec ? ":" + pad(p.s) : "") + suffix;
	}
	function angles(p, smooth) {
		var s = p.s + (smooth ? p.ms / 1000 : 0), m = p.m + s / 60, h = (p.h % 12) + m / 60;
		return { hour: h * 30, min: m * 6, sec: s * 6 };
	}
	function dayOfYear(y, mo, d) { return Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 86400000); }
	function isoWeek(y, mo, d) {
		var t = new Date(Date.UTC(y, mo - 1, d)), dow = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dow);
		return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
	}
	function city(tz) { return String(tz || "").split("/").pop().replace(/_/g, " "); }
	// "3 h ahead of", "5 h 30 min behind", "same time as"
	function diffText(minOther, minMain) {
		var d = minOther - minMain; if (d === 0) return "same time as";
		var a = Math.abs(d), h = Math.floor(a / 60), m = a % 60, s = (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : "");
		return s + (d > 0 ? " ahead of" : " behind");
	}
	function isDay(p) { return p.h >= 6 && p.h < 18; }
	var POPULAR = ["America/Vancouver", "America/Los_Angeles", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Africa/Cairo", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];
	var CK = { zoneAt: zoneAt, valid: valid, partsIn: partsIn, offsetMin: offsetMin, offsetLabel: offsetLabel, timeText: timeText, angles: angles, dayOfYear: dayOfYear, isoWeek: isoWeek, city: city, diffText: diffText, isDay: isDay, pad: pad, POPULAR: POPULAR };
	if (typeof module !== "undefined" && module.exports) module.exports = CK; else root.CK = CK;
})(typeof window !== "undefined" ? window : globalThis);

/* MES GTA 6 Hub: shared maths (pure, node-testable: node tool_apps_src/gta-tests.js).
   1. Stunt jump physics: a 2D rigid-body vehicle (raycast spring-damper suspension per axle, tyre grip limited by mu * N,
      engine power, brakes, quadratic air drag, wheel spin whose angular momentum is traded with the body in the air,
      penalty contacts for the body so it can crash, slide and flip) on a course of ramps, gaps and landings.
   2. Jump calculator (closed-form projectile + a drag integrator).
   3. Release countdown (midnight in any time zone, needs CK from the clock lib when present) and download / storage maths.
   Byte-identical copy at mes.fm/api/_gta-lib.js (the news function uses parseRss): cp after editing. */
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
		{ id: "roof", name: "Rooftop to rooftop", veh: "sports", kmh: 53, c: { ramp: "none", angle: 0, height: 0, gap: 8, pit: 14, land: "platform", landHeight: -2, plat: 25 }, note: "No ramp: straight off a roof edge onto a lower roof across the street. It lands nose first, so it is always hard." },
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
		var target = (opts.kmh || 0) / 3.6, x0 = opts.mode === "drive" ? co.rampStart - (opts.approach || 260) : co.rampStart - Math.max(25, Math.min(80, target * 1.6));
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
				if (brake > 0) want -= brake * v.mu * N * (vt >= 0 ? 1 : -1);
				want -= 0.013 * N * (vt > 0.05 ? 1 : vt < -0.05 ? -1 : 0); /* rolling resistance */
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

	var API = { G0: G0, FACTS: FACTS, VEHICLES: VEHICLES, vehicle: vehicle, bodyShape: bodyShape, PRESETS: PRESETS, COURSE_DEF: COURSE_DEF, buildCourse: buildCourse, groundAt: groundAt, rayHit: rayHit, closest: closest, inside: inside,
		Sim: Sim, simulate: simulate, sweepOne: sweepOne, summarize: summarize,
		projectile: projectile, speedNeeded: speedNeeded, bestAngle: bestAngle, dragFlight: dragFlight, speedNeededDrag: speedNeededDrag,
		CITIES: CITIES, offsetMin: offsetMin, zoned: zoned, midnight: midnight, parts: parts, unlockTimes: unlockTimes,
		SPEED_UNITS: SPEED_UNITS, downloadSeconds: downloadSeconds, durationText: durationText, CONSOLES: CONSOLES, CONNECTIONS: CONNECTIONS,
		parseRss: parseRss, aboutGta: aboutGta, NEWS_FEEDS: NEWS_FEEDS, decode: decode };
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESGTA = API;
})(typeof window !== "undefined" ? window : this);

/* MES Stunt Jump Simulator: page UI (physics in lib.js, global MESGTA). Runs only on #gt[data-page="jump"].
   State: localStorage "mes-gta-stunt:v1"; links ?v=&k=&m=&r=&a=&h=&gp=&pd=&pt=&l=&la=&lh=&pl=&gr=&ac=&u= */
(function () {
	"use strict";
	var root = document.getElementById("gt"); if (!root || root.getAttribute("data-page") !== "jump" || !window.MESGTA) return;
	var M = window.MESGTA, KEY = "mes-gta-stunt:v1", RAD = Math.PI / 180, DT = 1 / 500;
	var $ = function (id) { return document.getElementById(id); };
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode */ } }
	function num(v, d) { var x = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) ? x : d; }
	function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
	function dark() { return document.body.classList.contains("dark-mode"); }

	/* ---------------- state ---------------- */
	var q = new URLSearchParams(location.search), sv = sget(), fromLink = q.has("v") || q.has("k") || q.has("r");
	function pick(k, d) { if (q.has(k)) return q.get(k); if (!fromLink && sv[k] != null) return sv[k]; return d; }
	var P0 = M.PRESETS[1];
	var S = {
		v: pick("v", P0.veh), k: num(pick("k", P0.kmh), P0.kmh), m: pick("m", "auto") === "drive" ? "drive" : "auto",
		r: pick("r", P0.c.ramp || "straight"), a: num(pick("a", P0.c.angle), 20), h: num(pick("h", P0.c.height), 2),
		gp: num(pick("gp", P0.c.gap), 20), pd: num(pick("pd", P0.c.pit || 0), 0), pt: pick("pt", P0.c.pitType || "ground") === "water" ? "water" : "ground",
		l: pick("l", P0.c.land || "ramp"), la: num(pick("la", P0.c.landAngle || 25), 25), lh: num(pick("lh", P0.c.landHeight || 4), 4), pl: num(pick("pl", P0.c.plat || 12), 12),
		gr: pick("gr", "earth"), ac: pick("ac", "0") === "1", u: pick("u", (navigator.language || "").toLowerCase() === "en-us" ? "i" : "m"),
		cam: sv.cam || "auto", slow: num(sv.slow, 1), color: sv.color || "", pre: fromLink ? "" : (sv.pre || P0.id)
	};
	if (!/^(none|straight|curved)$/.test(S.r)) S.r = "straight"; if (!/^(ramp|platform|flat)$/.test(S.l)) S.l = "ramp"; if (!/^(earth|moon|mars|jupiter)$/.test(S.gr)) S.gr = "earth";
	var GRAV = { earth: [9.80665, 1.2, "Earth"], moon: [1.62, 0, "Moon (no air)"], mars: [3.71, 0.02, "Mars"], jupiter: [24.79, 0.16, "Jupiter (if it had a floor)"] };
	function save() { var o = {}; "v k m r a h gp pd pt l la lh pl gr ac u cam slow color pre".split(" ").forEach(function (k) { o[k] = S[k]; }); sset(o); }
	function courseOpts() { return { ramp: S.r, angle: S.a, height: S.h, gap: S.gp, pit: S.pd, pitType: S.pt, land: S.l, landAngle: S.la, landHeight: S.lh, plat: S.pl }; }

	/* ---------------- units ---------------- */
	function spd(ms, d) { return S.u === "i" ? (ms / 0.44704).toFixed(d == null ? 0 : d) + " mph" : (ms * 3.6).toFixed(d == null ? 0 : d) + " km/h"; }
	function len(m, d) { if (!isFinite(m)) return "–"; return S.u === "i" ? (m / 0.3048).toFixed(d == null ? 0 : d) + " ft" : m.toFixed(d == null ? 1 : d) + " m"; }
	function kmhToUnit(k) { return S.u === "i" ? k / 1.609344 : k; }
	function unitToKmh(x) { return S.u === "i" ? x * 1.609344 : x; }

	/* ---------------- build controls ---------------- */
	var vehSel = $("gj-veh");
	M.VEHICLES.forEach(function (v) { var o = document.createElement("option"); o.value = v.id; o.textContent = v.name; vehSel.appendChild(o); });
	var preBox = $("gj-pre");
	M.PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "gj-chip"; b.textContent = p.name; b.setAttribute("data-pre", p.id); b.title = p.note; preBox.appendChild(b); });
	function topSpeed(v, g, rho) { var lo = 1, hi = 150; for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2, need = 0.5 * rho * v.cda * mid * mid * mid + 0.013 * v.m * g * mid; if (need < v.P * 1000) lo = mid; else hi = mid; } return lo; }

	/* seg buttons */
	function seg(id, key, after) {
		var box = $(id); if (!box) return;
		box.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; S[key] = b.getAttribute("data-v"); paintSeg(); S.pre = ""; after && after(); changed(); });
	}
	function paintSeg() {
		[["gj-mode", "m"], ["gj-ramp", "r"], ["gj-land", "l"], ["gj-units", "u"], ["gj-cam", "cam"]].forEach(function (p) {
			var box = $(p[0]); if (!box) return; Array.prototype.forEach.call(box.querySelectorAll("button[data-v]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S[p[1]] ? "true" : "false"); });
		});
	}
	/* slider + number pairs */
	var PAIRS = [ /* id, key, min, max, step, unit kind */
		["gj-spd", "k", 10, 260, 1, "spd"], ["gj-a", "a", 0, 50, 1, "deg"], ["gj-h", "h", 0.3, 15, 0.1, "len"], ["gj-gp", "gp", 0, 120, 0.5, "len"],
		["gj-pd", "pd", 0, 60, 0.5, "len"], ["gj-la", "la", 5, 50, 1, "deg"], ["gj-lh", "lh", -20, 20, 0.1, "len"], ["gj-pl", "pl", 3, 80, 0.5, "len"]
	];
	function toShown(kind, x) { return kind === "spd" ? kmhToUnit(x) : kind === "len" && S.u === "i" ? x / 0.3048 : x; }
	function fromShown(kind, x) { return kind === "spd" ? unitToKmh(x) : kind === "len" && S.u === "i" ? x * 0.3048 : x; }
	function unitLabel(kind) { return kind === "spd" ? (S.u === "i" ? "mph" : "km/h") : kind === "deg" ? "°" : S.u === "i" ? "ft" : "m"; }
	PAIRS.forEach(function (p) {
		var r = $(p[0] + "-r"), n = $(p[0] + "-n"); if (!r || !n) return;
		r.addEventListener("input", function () { S[p[1]] = fromShown(p[5], +r.value); n.value = fmtIn(p[5], +r.value); S.pre = ""; changed(true); });
		r.addEventListener("change", function () { changed(); });
		n.addEventListener("change", function () { var x = num(n.value, NaN); if (!isFinite(x)) { paintInputs(); return; } S[p[1]] = clamp(fromShown(p[5], x), p[2], p[3] * (p[5] === "spd" ? 1.6 : 1)); S.pre = ""; paintInputs(); changed(); });
	});
	function fmtIn(kind, x) { return kind === "deg" ? Math.round(x) : kind === "spd" ? Math.round(x) : (Math.round(x * 10) / 10); }
	function paintInputs() {
		vehSel.value = S.v;
		PAIRS.forEach(function (p) {
			var r = $(p[0] + "-r"), n = $(p[0] + "-n"), u = $(p[0] + "-u"); if (!r || !n) return;
			var lo = toShown(p[5], p[2]), hi = toShown(p[5], p[3]); r.min = lo; r.max = hi; r.step = p[5] === "len" && S.u === "i" ? 0.5 : p[4];
			var sh = toShown(p[5], S[p[1]]); r.value = clamp(sh, lo, hi); n.value = fmtIn(p[5], sh); if (u) u.textContent = unitLabel(p[5]);
		});
		$("gj-pt").value = S.pt; $("gj-gr").value = S.gr; $("gj-ac").checked = S.ac; $("gj-slow").value = String(S.slow);
		$("gj-rampf").hidden = S.r === "none"; $("gj-landf").hidden = S.l === "flat"; $("gj-laf").hidden = S.l !== "ramp"; $("gj-plf").hidden = S.l !== "platform";
		$("gj-ptf").hidden = S.pd <= 0;
		$("gj-spdl").textContent = S.m === "drive" ? "Top speed the cruise control would aim for (Drive mode ignores it)" : "Speed at the ramp";
		$("gj-spdf").classList.toggle("gj-dim", S.m === "drive");
		var v = M.vehicle(S.v), gg = GRAV[S.gr];
		$("gj-vinfo").textContent = v.m.toLocaleString() + " kg · " + v.P + " kW · wheelbase " + len(v.wb, 2) + " · suspension travel " + (S.u === "i" ? (v.trav / 0.0254).toFixed(1) + " in" : Math.round(v.trav * 100) + " cm") + " · top speed about " + spd(topSpeed(v, gg[0], gg[1] || 0.0001));
		Array.prototype.forEach.call(preBox.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-pre") === S.pre ? "true" : "false"); });
		paintSeg();
	}
	seg("gj-mode", "m", function () { reset(); }); seg("gj-ramp", "r"); seg("gj-land", "l");
	seg("gj-units", "u", function () { paintInputs(); paintRuns(); paintRo(); drawCharts(); });
	seg("gj-cam", "cam");
	vehSel.addEventListener("change", function () { S.v = vehSel.value; S.pre = ""; changed(); });
	$("gj-pt").addEventListener("change", function (e) { S.pt = e.target.value; S.pre = ""; changed(); });
	$("gj-gr").addEventListener("change", function (e) { S.gr = e.target.value; S.pre = ""; changed(); });
	$("gj-ac").addEventListener("change", function (e) { S.ac = e.target.checked; changed(); });
	$("gj-slow").addEventListener("change", function (e) { S.slow = +e.target.value; save(); });
	preBox.addEventListener("click", function (e) {
		var b = e.target.closest("button[data-pre]"); if (!b) return; var p = M.PRESETS.filter(function (x) { return x.id === b.getAttribute("data-pre"); })[0]; if (!p) return;
		loadPreset(p); paintInputs(); changed(); toast(p.note); go();
	});
	function loadPreset(p) {
		var c = p.c; S.pre = p.id; S.v = p.veh; S.k = p.kmh; S.m = "auto"; S.r = c.ramp; S.a = c.angle || 0; S.h = c.height || 0; S.gp = c.gap || 0; S.pd = c.pit || 0; S.pt = c.pitType || "ground"; S.l = c.land; S.la = c.landAngle || 25; S.lh = c.landHeight != null ? c.landHeight : 3; S.pl = c.plat || 12; S.gr = "earth";
	}
	var tTimer = 0;
	function toast(msg) { var t = $("gj-toast"); if (!t || !msg) return; t.textContent = msg; t.classList.add("is-on"); clearTimeout(tTimer); tTimer = setTimeout(function () { t.classList.remove("is-on"); }, 4200); }

	/* ---------------- simulation state ---------------- */
	var co, veh, sim = null, running = false, acc = 0, lastT = 0, replay = null, runs = [], best = null, ghost = null, sweepData = null, dirtyCourse = true;
	try { runs = JSON.parse(localStorage.getItem(KEY + ":runs") || "[]") || []; } catch (e) { runs = []; }
	function simOpts() { var gg = GRAV[S.gr]; return { mode: S.m, kmh: S.k, g: gg[0], rho: gg[1], airControl: S.ac, approach: 260 }; }
	function rebuild() { co = M.buildCourse(courseOpts()); veh = M.vehicle(S.v); dirtyCourse = false; }
	function reset() { rebuild(); sim = new M.Sim(co, veh, simOpts()); running = false; replay = null; acc = 0; $("gj-verdict").hidden = true; $("gj-badge").textContent = ""; scrubSetup(); paintRun(); camSnap = true; paintRo(); frame(); }
	function go() {
		if (running) { running = false; paintRun(); return; }
		if (!sim || sim.done || sim.t > 0 && replay) reset();
		replay = null; running = true; lastT = 0; paintRun(); $("gj-c").focus({ preventScroll: true }); loop();
	}
	var changeTimer = 0;
	function changed(live) {
		save(); paintInputs(); sweepData = null; paintSweep();
		if (!running) { rebuild(); sim = new M.Sim(co, veh, simOpts()); replay = null; camSnap = true; frame(); paintRo(); }
		else dirtyCourse = true;
		if (!live) writeUrl();
	}
	function writeUrl() {
		var p = new URLSearchParams(); p.set("v", S.v); p.set("k", Math.round(S.k)); if (S.m === "drive") p.set("m", "drive");
		p.set("r", S.r); if (S.r !== "none") { p.set("a", S.a); p.set("h", +S.h.toFixed(2)); } p.set("gp", +S.gp.toFixed(2));
		if (S.pd > 0) { p.set("pd", +S.pd.toFixed(2)); if (S.pt === "water") p.set("pt", "water"); }
		p.set("l", S.l); if (S.l !== "flat") p.set("lh", +S.lh.toFixed(2)); if (S.l === "ramp") p.set("la", S.la); if (S.l === "platform") p.set("pl", +S.pl.toFixed(2));
		if (S.gr !== "earth") p.set("gr", S.gr); if (S.ac) p.set("ac", "1");
		return location.origin + location.pathname + "?" + p.toString();
	}

	/* ---------------- loop ---------------- */
	var keys = { gas: 0, brake: 0, tl: 0, tr: 0 }, touch = { gas: 0, brake: 0, tl: 0, tr: 0 };
	function loop(ts) {
		if (!running) return;
		requestAnimationFrame(loop);
		if (ts == null) return;
		if (!lastT) { lastT = ts; return; }
		var real = Math.min(0.05, (ts - lastT) / 1000); lastT = ts; acc += real * S.slow;
		var inp = sim.input; inp.gas = Math.max(keys.gas, touch.gas); inp.brake = Math.max(keys.brake, touch.brake); inp.tilt = (Math.max(keys.tl, touch.tl) - Math.max(keys.tr, touch.tr));
		var n = 0; while (acc >= DT && n < 600 && !sim.done) { sim.step(DT); acc -= DT; n++; }
		if (sim.done) { running = false; finished(); }
		frame(); paintRo();
	}
	function finished() {
		var r = sim.result; r.track = sim.track; paintRun();
		var rec = { n: runs.length ? runs[runs.length - 1].n + 1 : 1, v: veh.name, k: S.k, code: r.code, title: r.title, to: r.takeoff ? r.takeoff.v : 0, ang: r.takeoff ? r.takeoff.ang / RAD : 0, air: r.air, dist: r.dist, h: r.maxH, g: r.landG, rot: r.rot / RAD, ok: r.ok };
		if (r.takeoff) { runs.push(rec); if (runs.length > 30) runs.shift(); try { localStorage.setItem(KEY + ":runs", JSON.stringify(runs)); } catch (e) { /* full */ } }
		if (r.ok && r.takeoff && (!best || r.landG < best.g || (best.code !== "clean" && r.code === "clean"))) { best = { g: r.landG, code: r.code }; ghost = { track: sim.track.slice(), key: courseKey() }; }
		showVerdict(r); paintRuns(); drawCharts(); scrubSetup();
	}
	function courseKey() { return JSON.stringify(courseOpts()) + S.v; }

	/* ---------------- verdict + readouts ---------------- */
	var VER = { clean: ["good", "🏆"], hard: ["warn", "💥"], brutal: ["bad", "🚑"], crash: ["bad", "💀"], short: ["bad", "⬇"], splash: ["bad", "🌊"], fell: ["bad", "⬇"], nojump: ["warn", "…"] };
	function showVerdict(r) {
		var box = $("gj-verdict"), v = VER[r.code] || ["warn", ""];
		box.className = "gj-verdict gj-verdict--" + v[0]; box.hidden = false;
		var tip = advice(r);
		box.innerHTML = "<b>" + v[1] + " " + esc(r.title) + "</b><span>" + esc(r.detail || "") + "</span>" + (tip ? "<em>" + esc(tip) + "</em>" : "");
		$("gj-badge").textContent = r.title;
	}
	function advice(r) {
		if (r.code === "short" || r.code === "splash" || r.code === "fell") return "Try more speed, or a steeper or higher takeoff ramp. Find the right speed below shows the window.";
		if (r.code === "crash" && Math.abs(r.rot) > 60 * RAD) return r.rot < 0 ? "It nose-dived. Press ↑ (gas) in the air to lift the nose: the spinning wheels turn the car the other way." : "It rotated backwards. Press ↓ (brake) in the air to drop the nose, or use a straight ramp instead of a curved one.";
		if (r.over) return "It flew past the landing. Try a little less speed.";
		if (r.code === "brutal" || r.code === "hard") return co.landKind === "ramp" ? "Land on the down slope, not on the flat after it: it turns the fall into rolling." : "Landing on flat ground is always hard. Add a landing ramp.";
		return "";
	}
	function ro(label, val, sub, cls) { return '<div class="gj-ro' + (cls ? " gj-ro--" + cls : "") + '"><span>' + label + "</span><b>" + val + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; }
	function paintRo() {
		if (!sim) return; var e = sim.ev, to = e.takeoff, r = sim.result, sp = Math.hypot(sim.vx, sim.vy);
		var gNow = sim.gNow, h = []; var air = sim.state === "air" ? sim.t - to.t : r ? r.air : 0;
		h.push(ro("Speed", spd(sp), sim.state === "approach" ? "on the approach" : sim.state === "air" ? "in the air" : "after landing"));
		h.push(ro("Takeoff", to ? spd(to.v) : "–", to ? "at " + (to.ang / RAD).toFixed(1) + "° up" : "leaves the lip"));
		h.push(ro("Airtime", air ? air.toFixed(2) + " s" : "–", ""));
		h.push(ro("Distance", r && r.takeoff ? len(r.dist) : to ? len(sim.x - co.lip.x) : "–", "from the lip"));
		h.push(ro("Height", to ? len(Math.max(0, e.maxH - co.lip.y)) : "–", "above the lip"));
		var lg = r ? r.landG : e.landPeakG; h.push(ro("Landing", lg ? lg.toFixed(1) + " g" : "–", "peak g-force felt", lg ? (lg < 5 ? "ok" : lg < 10 ? "warn" : "bad") : ""));
		h.push(ro("Now", gNow.toFixed(1) + " g", gNow < 0.15 ? "weightless" : "felt by the driver"));
		h.push(ro("Rotation", to ? ((sim.th - (sim.th0 != null ? sim.th0 : sim.th)) / RAD).toFixed(0) + "°" : "–", "pitch change in the air"));
		$("gj-ro").innerHTML = h.join("");
		$("gj-clock").textContent = "t = " + sim.t.toFixed(2) + " s" + (S.slow !== 1 ? " · " + (S.slow < 1 ? "slow motion " + S.slow + "×" : "fast " + S.slow + "×") : "");
		if (!r) $("gj-badge").textContent = sim.state === "approach" ? (running ? "Run-up…" : "Ready: press Go") : sim.state === "air" ? "Airborne " + air.toFixed(1) + " s" : "Touchdown";
	}
	function paintRun() {
		var b = $("gj-go"); b.textContent = running ? "⏸ Pause" : sim && sim.done ? "▶ Again" : sim && sim.t > 0 ? "▶ Resume" : "▶ Go";
		$("gj-touch").hidden = !(S.m === "drive" || (running && sim && sim.state === "air")); if (!running) $("gj-touch").hidden = S.m !== "drive";
		if (running) $("gj-verdict").hidden = true;
	}

	/* ---------------- drawing ---------------- */
	var cv = $("gj-c"), ctx = cv.getContext("2d"), dpr = 1, W = 800, H = 450, cam = { x: 0, y: 3, s: 12 }, camSnap = true, skyline = null, palms = null;
	function size() {
		var stage = $("gj-st"), wrap = stage.parentNode, w = wrap.clientWidth || 800, h = Math.round(w / (w < 560 ? 1.05 : w < 900 ? 1.6 : 2.1));
		wrap.setAttribute("data-mes-free", "1"); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
		if (document.fullscreenElement === wrap || wrap.classList.contains("mes-fill") || wrap.classList.contains("mes-fs")) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 120;
		h = Math.max(260, h); stage.style.height = h + "px"; dpr = Math.min(2, window.devicePixelRatio || 1); W = w; H = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
		frame();
	}
	function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
	function makeScenery() {
		var r = rng(911), b = [], x = -2000; while (x < 3000) { var w = 12 + r() * 30, h = 15 + Math.pow(r(), 2) * 110; b.push([x, w, h, r() < 0.3]); x += w + r() * 6; } skyline = b;
		var r2 = rng(7), p = []; for (var px = -400; px < 900; px += 9 + r2() * 26) p.push([px, 7 + r2() * 6, r2() * 0.6 - 0.3, r2()]); palms = p;
	}
	function wx(x) { return (x - cam.x) * cam.s + W / 2; }
	function wy(y) { return H / 2 - (y - cam.y) * cam.s; }
	function frameBox() {
		var x0 = co.rampStart - 12, x1, top = Math.max(co.lip.y, S.l !== "flat" ? S.lh : 0) + 6, bot = Math.min(co.floor, 0) - 1.5;
		var gg = GRAV[S.gr][0], pr = M.dragFlight(Math.max(5, S.k / 3.6), co.lip.angle / RAD, co.lip.y, 0.5 * (GRAV[S.gr][1]) * veh.cda / veh.m, gg, false);
		x1 = isFinite(co.zone[1]) ? Math.max(co.zone[1], Math.min(pr.x, 400)) + 12 : Math.max(co.gap + 25, Math.min(pr.x, 400) + 20);
		top = Math.max(top, co.lip.y + pr.apex + 4);
		return { x0: x0, x1: x1, top: top, bot: bot };
	}
	function updateCam(pos) {
		var tx, ty, ts, fb = frameBox(), mode = S.cam, span = fb.x1 - fb.x0;
		/* keep the ground low in the picture (82 % down) unless the car climbs: then follow it up */
		function vert(s, carY) { var hm = H / s, cy = fb.bot + 0.32 * hm; if (carY != null) cy = Math.max(cy, carY - 0.25 * hm); return cy; }
		if (mode === "whole") { ts = Math.min(W / span, (H - 40) / (fb.top - fb.bot)); tx = (fb.x0 + fb.x1) / 2; ty = vert(ts, null); if (fb.top > ty + (H / ts) * 0.5 - 30 / ts) ty = (fb.top + fb.bot) / 2 + 10 / ts; }
		else if (mode === "follow") { ts = clamp(W / 32, 6, 50); tx = pos.x + 4; ty = vert(ts, pos.y); }
		else { /* auto: zoom to about 3/4 of the jump (never wider than 90 m), slide along with the car inside the jump area */
			var vw = clamp(span * 0.45, 24, 50); ts = Math.min(W / 22, Math.max(W / vw, (H - 60) / (fb.top - fb.bot + 8))); vw = W / ts;
			var lo = fb.x0 + vw / 2, hi = Math.max(lo, fb.x1 - vw / 2); if (pos.x + vw * 0.22 > hi && sim && sim.state === "landed") hi = pos.x + vw * 0.22; /* keep following it down the run-out */
			tx = clamp(pos.x + vw * 0.22, lo, hi); ty = vert(ts, pos.y);
		}
		if (camSnap) { cam.x = tx; cam.y = ty; cam.s = ts; camSnap = false; }
		else { var k = 0.1; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.s += (ts - cam.s) * k; }
	}
	function stateNow() {
		if (replay && replay.i != null) { var tr = replay.track[replay.i]; return { x: tr[1], y: tr[2], th: tr[3], sp: tr[4], g: tr[5], comp: [tr[6], tr[7]], ang: [tr[8], tr[9]], t: tr[0] }; }
		return { x: sim.x, y: sim.y, th: sim.th, sp: Math.hypot(sim.vx, sim.vy), g: sim.gNow, comp: [sim.ax[0].comp, sim.ax[1].comp], ang: [sim.ax[0].ang, sim.ax[1].ang], t: sim.t };
	}
	function frame() {
		if (!co || !sim) return; if (!skyline) makeScenery();
		var st = stateNow(); updateCam(st);
		var c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
		/* sky: sunset gradient (fixed colours: the canvas is not touched by the derived dark theme) */
		var sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#1b1446"); sky.addColorStop(0.45, "#7b2d7a"); sky.addColorStop(0.75, "#ef6a5b"); sky.addColorStop(1, "#ffb46b");
		if (S.gr === "moon") { sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#05060c"); sky.addColorStop(1, "#151827"); }
		else if (S.gr === "mars") { sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#3b2418"); sky.addColorStop(1, "#d08a5a"); }
		c.fillStyle = sky; c.fillRect(0, 0, W, H);
		var hz = wy(0);
		if (S.gr === "earth") {
			var sx = W * 0.72, sy = Math.min(H * 0.62, hz - 20); var sun = c.createRadialGradient(sx, sy, 2, sx, sy, Math.min(W, H) * 0.22); sun.addColorStop(0, "rgba(255,240,200,1)"); sun.addColorStop(0.18, "rgba(255,200,120,0.95)"); sun.addColorStop(1, "rgba(255,140,90,0)");
			c.fillStyle = sun; c.fillRect(0, 0, W, H);
			/* skyline, parallax 0.25 */
			c.fillStyle = "rgba(46,18,70,0.75)";
			skyline.forEach(function (b) { var X = (b[0] - cam.x * 0.25) * 1.2 + W / 2, bw = b[1] * 1.2, bh = b[2] * 1.2 * (H / 500); if (X + bw < 0 || X > W) return; c.fillRect(X, hz - bh * 0.9 + 6, bw, bh); if (b[3]) c.fillRect(X + bw * 0.45, hz - bh * 0.9 - 14 + 6, 2, 14); });
		} else if (S.gr === "moon") { c.fillStyle = "#c9d3ea"; c.beginPath(); c.arc(W * 0.78, H * 0.2, Math.min(W, H) * 0.06, 0, 7); c.fill(); c.fillStyle = "rgba(255,255,255,0.7)"; var rr = rng(3); for (var i = 0; i < 80; i++) c.fillRect(rr() * W, rr() * H * 0.6, 1.2, 1.2); }
		/* palms (world, behind the course) */
		if (S.gr === "earth") palms.forEach(function (p) { if (inPit(p[0])) return; drawPalm(c, p[0], M.groundAt(co, p[0]).y, p[1], p[2], p[3]); });
		/* water in the pit */
		if (co.water) { var w0 = wx(co.water.x0), w1 = wx(co.water.x1), wyy = wy(co.water.y); var wg = c.createLinearGradient(0, wyy, 0, H); wg.addColorStop(0, "#1fa2c7"); wg.addColorStop(1, "#08395a"); c.fillStyle = wg; c.fillRect(w0, wyy, w1 - w0, H - wyy + 2);
			c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5; c.beginPath(); for (var X = w0; X < w1; X += 6) { var Y = wyy + Math.sin(X * 0.08 + (sim ? sim.t * 3 : 0)) * 1.5; if (X === w0) c.moveTo(X, Y); else c.lineTo(X, Y); } c.stroke(); }
		/* ground */
		var pts = co.pts; c.beginPath(); c.moveTo(wx(pts[0][0]), H + 10); pts.forEach(function (p) { c.lineTo(wx(p[0]), wy(p[1])); }); c.lineTo(wx(pts[pts.length - 1][0]), H + 10); c.closePath();
		var gg = c.createLinearGradient(0, hz, 0, H); gg.addColorStop(0, S.gr === "moon" ? "#8b8f98" : S.gr === "mars" ? "#9b5634" : "#3a3346"); gg.addColorStop(1, S.gr === "moon" ? "#4a4d55" : S.gr === "mars" ? "#5a2c18" : "#1e1a26"); c.fillStyle = gg; c.fill();
		/* ramps as timber / steel structures */
		drawRamp(c, co.rampStart, 0.001, "#c9853f", "#7a4a1d");
		if (S.l === "ramp") drawRamp(c, co.zone[0] - 0.001, co.zone[1], "#c9853f", "#7a4a1d");
		if (S.l === "platform") drawBlock(c, co.zone[0], co.zone[1], S.lh);
		/* surface line + road marks */
		c.strokeStyle = S.gr === "earth" ? "#ffcf8a" : "#d5d8de"; c.lineWidth = 2; c.beginPath(); pts.forEach(function (p, i) { var X = wx(p[0]), Y = wy(p[1]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke();
		/* landing zone */
		if (co.hasGap && co.zone) { var z0 = co.zone[0], z1 = isFinite(co.zone[1]) ? co.zone[1] : co.zone[0] + 60; c.strokeStyle = "rgba(80,230,140,0.9)"; c.lineWidth = 5; c.beginPath(); var first = true; for (var zx = z0; zx <= z1; zx += 0.5) { var gy = M.groundAt(co, zx).y; if (first) { c.moveTo(wx(zx), wy(gy) - 2); first = false; } else c.lineTo(wx(zx), wy(gy) - 2); } c.stroke(); }
		/* distance marks from the lip */
		c.font = "11px system-ui,sans-serif"; c.textAlign = "center"; var step = cam.s > 12 ? 5 : cam.s > 5 ? 10 : 25;
		for (var dm = step; dm < 400; dm += step) { var gx = co.lip.x + dm, X2 = wx(gx); if (X2 < -20 || X2 > W + 20) continue; var gyy = M.groundAt(co, gx).y; c.fillStyle = "rgba(255,255,255,0.75)"; c.fillRect(X2 - 0.5, wy(gyy), 1, 8); c.fillText(S.u === "i" ? Math.round(dm / 0.3048) + " ft" : dm + " m", X2, wy(gyy) + 20); }
		/* ideal point-mass path */
		if (sim.state === "approach" && !replay) { var kd = 0.5 * GRAV[S.gr][1] * veh.cda / veh.m, path = M.dragFlight(Math.max(1, S.k / 3.6), co.lip.angle / RAD, co.lip.y - co.floor + 0, kd, GRAV[S.gr][0], true).path;
			c.setLineDash([3, 6]); c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1.5; c.beginPath(); path.forEach(function (p, i) { var X = wx(co.lip.x + p[0]), Y = wy(co.lip.y + p[1] + veh.hcg); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke(); c.setLineDash([]); }
		/* ghost of the best run */
		if (ghost && ghost.key === courseKey()) trail(c, ghost.track, ghost.track.length, "rgba(255,255,255,0.28)");
		/* trail of this run */
		var tr = replay ? replay.track : sim.track, upto = replay ? replay.i + 1 : tr.length; trail(c, tr, upto, null);
		/* markers */
		var e = sim.ev;
		if (e.takeoff && !replay) mark(c, e.takeoff.x, e.takeoff.y, "takeoff " + spd(e.takeoff.v), "below");
		if (e.apex && e.takeoff && !replay && sim.state !== "approach" && (e.apex.x - e.takeoff.x) * cam.s > 90) mark(c, e.apex.x, e.apex.y, "top: " + len(e.maxH - co.lip.y) + " above the lip", "above");
		if (e.land && e.land.x != null && !replay && sim.result) mark(c, e.land.x, e.land.y, len(sim.result.dist) + " jump", "below");
		/* the vehicle */
		drawVehicle(c, st);
		/* HUD */
		hud(c, st);
	}
	function inPit(x) { return x > co.rampStart - 2 && x < (isFinite(co.zone[1]) ? co.zone[1] + 3 : co.gap + 3); }
	function drawPalm(c, x, gy, h, lean, ph) {
		var X = wx(x), Y = wy(gy), s = cam.s; if (X < -60 || X > W + 60) return; var tx = X + lean * h * s, ty = Y - h * s;
		c.strokeStyle = "rgba(30,12,40,0.85)"; c.lineWidth = Math.max(1.5, 0.35 * s); c.beginPath(); c.moveTo(X, Y); c.quadraticCurveTo(X + lean * h * s * 0.2, Y - h * s * 0.6, tx, ty); c.stroke();
		c.fillStyle = "rgba(30,12,40,0.85)"; for (var i = 0; i < 7; i++) { var a = -Math.PI + i * Math.PI / 6 + (ph - 0.5) * 0.3, L = (2.6 + (i % 2) * 0.8) * s; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 0.6 * s, tx + Math.cos(a) * L, ty + Math.sin(a) * L * 0.4 + 0.9 * s); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 + 0.1 * s, tx, ty); c.fill(); }
	}
	function drawRamp(c, x0, x1, top, side) {
		var pts = co.pts.filter(function (p) { return p[0] >= x0 - 1e-6 && p[0] <= x1 + 1e-6; }); if (pts.length < 2) return;
		var base = Math.max(0, co.floor) === 0 ? 0 : co.floor, bx0 = pts[0][0], bx1 = pts[pts.length - 1][0];
		c.beginPath(); c.moveTo(wx(bx0), wy(base)); pts.forEach(function (p) { c.lineTo(wx(p[0]), wy(Math.max(p[1], base))); }); c.lineTo(wx(bx1), wy(base)); c.closePath();
		var g = c.createLinearGradient(0, wy(Math.max.apply(null, pts.map(function (p) { return p[1]; }))), 0, wy(base)); g.addColorStop(0, top); g.addColorStop(1, side); c.fillStyle = g; c.fill();
		c.save(); c.clip(); c.strokeStyle = "rgba(60,30,10,0.55)"; c.lineWidth = Math.max(1, cam.s * 0.08);
		var n = Math.max(2, Math.round((bx1 - bx0) / 1.6)); for (var i = 0; i <= n; i++) { var xx = bx0 + (bx1 - bx0) * i / n; c.beginPath(); c.moveTo(wx(xx), wy(base)); c.lineTo(wx(xx), wy(base + 60)); c.stroke(); }
		for (i = 0; i < n; i++) { var xa = bx0 + (bx1 - bx0) * i / n, xb = bx0 + (bx1 - bx0) * (i + 1) / n; c.beginPath(); c.moveTo(wx(xa), wy(base)); c.lineTo(wx(xb), wy(M.groundAt(co, xb).y)); c.stroke(); }
		c.restore();
	}
	function drawBlock(c, x0, x1, h) { var base = co.floor; c.fillStyle = "#3d3550"; c.fillRect(wx(x0), wy(h), wx(x1) - wx(x0), wy(base) - wy(h)); c.fillStyle = "rgba(255,210,140,0.35)"; for (var yy = h - 1.2; yy > base + 0.5; yy -= 3) for (var xx = x0 + 1; xx < x1 - 1; xx += 2.4) c.fillRect(wx(xx), wy(yy), Math.max(2, cam.s * 0.9), Math.max(2, cam.s * 1.1)); }
	function trail(c, tr, upto, col) {
		if (!tr || upto < 2) return; c.lineWidth = 2.5; c.lineCap = "round";
		for (var i = 1; i < upto; i++) { var a = tr[i - 1], b = tr[i]; if (a[10] > 0 && b[10] > 0 && !col) continue; c.strokeStyle = col || speedCol(b[4]); c.beginPath(); c.moveTo(wx(a[1]), wy(a[2])); c.lineTo(wx(b[1]), wy(b[2])); c.stroke(); }
	}
	function speedCol(v) { var t = clamp(v / 50, 0, 1); return "hsl(" + Math.round(190 - 190 * t) + ",95%,62%)"; }
	function mark(c, x, y, label, where) {
		var X = wx(x), Y = wy(y); if (X < -4 || X > W + 4 || Y < -4 || Y > H + 4) return; c.fillStyle = "#fff"; c.beginPath(); c.arc(X, Y, 3.5, 0, 7); c.fill(); if (!label) return;
		c.font = "600 12px system-ui,sans-serif"; c.textAlign = "left"; var w = c.measureText(label).width, bx = clamp(X - w / 2 - 5, 4, W - w - 14), by = where === "above" ? Y - 30 : Y + 12;
		c.fillStyle = "rgba(15,10,30,0.72)"; c.fillRect(bx, by, w + 10, 18); c.fillStyle = "#fff"; c.fillText(label, bx + 5, by + 13);
	}
	function bodyPt(st, bx, by) { var cs = Math.cos(st.th), sn = Math.sin(st.th); return [wx(st.x + bx * cs - by * sn), wy(st.y + bx * sn + by * cs)]; }
	function drawVehicle(c, st) {
		var v = veh, sh = sim.shape, col = S.color || v.color, cs = Math.cos(st.th), sn = Math.sin(st.th), dnx = sn, dny = -cs;
		/* shadow on the ground */
		var gy = M.groundAt(co, st.x).y, alt = st.y - gy; if (gy > -1e8) { c.fillStyle = "rgba(0,0,0," + clamp(0.35 - alt * 0.02, 0.05, 0.35) + ")"; c.beginPath(); c.ellipse(wx(st.x), wy(gy) - 1, v.len * 0.5 * cam.s * (1 + alt * 0.03), Math.max(1.5, 0.18 * cam.s), 0, 0, 7); c.fill(); }
		/* wheels */
		var wheels = sim.ax.map(function (A, i) { var att = [st.x + A.bx * cs - A.ya * sn, st.y + A.bx * sn + A.ya * cs], d = A.L0 - (st.comp[i] || 0); return { x: att[0] + dnx * d, y: att[1] + dny * d, ax: att, ang: st.ang[i] }; });
		/* suspension struts */
		c.strokeStyle = "#555"; c.lineWidth = Math.max(1, v.r * 0.18 * cam.s); wheels.forEach(function (w) { c.beginPath(); c.moveTo(wx(w.ax[0]), wy(w.ax[1])); c.lineTo(wx(w.x), wy(w.y)); c.stroke(); });
		if (v.bike) { drawBike(c, st, wheels, col); return; }
		/* body */
		c.beginPath(); sh.pts.forEach(function (p, i) { var q = bodyPt(st, p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath();
		var top = bodyPt(st, 0, v.ht - v.hcg), bot = bodyPt(st, 0, -v.hcg + sh.gc), grd = c.createLinearGradient(top[0], top[1], bot[0], bot[1]);
		grd.addColorStop(0, shade(col, 1.25)); grd.addColorStop(0.55, col); grd.addColorStop(1, shade(col, 0.55)); c.fillStyle = grd; c.fill();
		c.strokeStyle = "rgba(0,0,0,0.55)"; c.lineWidth = 1; c.stroke();
		/* windows: the upper part of the outline pulled in */
		var up = sh.pts.filter(function (p) { return p[1] > (v.ht - v.hcg) * 0.25 - 0.05 + (sh.gc - v.hcg) * 0.4; });
		if (up.length >= 3 && v.body !== "monster") { var cx = up.reduce(function (s, p) { return s + p[0]; }, 0) / up.length, cy = up.reduce(function (s, p) { return s + p[1]; }, 0) / up.length;
			c.beginPath(); up.forEach(function (p, i) { var q = bodyPt(st, cx + (p[0] - cx) * 0.78, cy + (p[1] - cy) * 0.72); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fillStyle = "rgba(25,30,60,0.78)"; c.fill(); }
		/* lights */
		var hl = sh.pts.reduce(function (b, p) { return p[0] > b[0] ? p : b; }), tl = sh.pts.reduce(function (b, p) { return p[0] < b[0] ? p : b; });
		var qh = bodyPt(st, hl[0] - 0.05, hl[1] + 0.12), qt = bodyPt(st, tl[0] + 0.05, tl[1] + 0.15); c.fillStyle = "#fff6c8"; c.beginPath(); c.arc(qh[0], qh[1], Math.max(1.5, 0.08 * cam.s), 0, 7); c.fill(); c.fillStyle = "#ff3b3b"; c.beginPath(); c.arc(qt[0], qt[1], Math.max(1.5, 0.07 * cam.s), 0, 7); c.fill();
		wheels.forEach(function (w) { drawWheel(c, w, v.r); });
	}
	function drawWheel(c, w, r) {
		var X = wx(w.x), Y = wy(w.y), R = r * cam.s; c.fillStyle = "#15151a"; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill(); c.fillStyle = "#9aa3ad"; c.beginPath(); c.arc(X, Y, R * 0.58, 0, 7); c.fill();
		c.strokeStyle = "#4b525a"; c.lineWidth = Math.max(1, R * 0.12); for (var i = 0; i < 5; i++) { var a = w.ang + i * 2 * Math.PI / 5; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * R * 0.55, Y - Math.sin(a) * R * 0.55); c.stroke(); }
		c.fillStyle = "#2b2f35"; c.beginPath(); c.arc(X, Y, R * 0.14, 0, 7); c.fill();
	}
	function drawBike(c, st, wheels, col) {
		var v = veh; wheels.forEach(function (w) { drawWheel(c, w, v.r); });
		function P(bx, by) { return bodyPt(st, bx, by); }
		var rear = sim.ax[0].bx, front = sim.ax[1].bx, low = -v.hcg + v.r * 1.1, seat = low + 0.35;
		c.lineCap = "round"; c.lineJoin = "round";
		/* frame + tank + fairing */
		c.fillStyle = col; c.beginPath(); var a = P(rear + 0.25, seat), b = P(front - 0.35, seat + 0.18), d = P(front - 0.05, seat - 0.05), e = P(front - 0.4, low), f = P(rear + 0.4, low - 0.02);
		[a, b, d, e, f].forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fill(); c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1; c.stroke();
		/* forks + swingarm */
		c.strokeStyle = "#c8ccd2"; c.lineWidth = Math.max(1.5, 0.06 * cam.s); var fw = wheels[1], rw = wheels[0], fk = P(front - 0.18, seat + 0.1), sw = P(rear + 0.45, low + 0.05);
		c.beginPath(); c.moveTo(fk[0], fk[1]); c.lineTo(wx(fw.x), wy(fw.y)); c.moveTo(sw[0], sw[1]); c.lineTo(wx(rw.x), wy(rw.y)); c.stroke();
		/* rider: leg, torso, arm, helmet */
		var hip = P(rear + 0.5, seat + 0.12), knee = P(front - 0.62, seat - 0.05), foot = P(rear + 0.62, low + 0.02), sho = P(front - 0.62, seat + 0.62), hand = P(front - 0.28, seat + 0.32), head = P(front - 0.52, seat + 0.86);
		c.strokeStyle = "#1d1f2e"; c.lineWidth = Math.max(2, 0.16 * cam.s); c.beginPath(); c.moveTo(foot[0], foot[1]); c.lineTo(knee[0], knee[1]); c.lineTo(hip[0], hip[1]); c.lineTo(sho[0], sho[1]); c.lineTo(hand[0], hand[1]); c.stroke();
		c.fillStyle = "#f4f4f8"; c.beginPath(); c.arc(head[0], head[1], Math.max(3, 0.15 * cam.s), 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(head[0], head[1], Math.max(3, 0.15 * cam.s), Math.PI * 0.9 - st.th, Math.PI * 1.9 - st.th); c.fill();
	}
	function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; function f(x) { return Math.round(clamp(k > 1 ? x + (255 - x) * (k - 1) : x * k, 0, 255)); } return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")"; }
	function hud(c, st) {
		var x = 12, y = H - 14; c.textAlign = "left"; c.fillStyle = "rgba(10,8,25,0.6)"; c.fillRect(x - 6, y - 40, 150, 48); c.fillStyle = "#fff"; c.font = "700 24px system-ui,sans-serif";
		var s = S.u === "i" ? st.sp / 0.44704 : st.sp * 3.6; c.fillText(Math.round(s), x, y - 12); c.font = "11px system-ui,sans-serif"; c.fillStyle = "#cfd3e6"; c.fillText(S.u === "i" ? "mph" : "km/h", x + c.measureText("000").width + 22, y - 12);
		/* g bar */
		var gv = clamp(st.g / 12, 0, 1); c.fillStyle = "rgba(255,255,255,0.15)"; c.fillRect(x, y - 4, 130, 6); c.fillStyle = st.g < 5 ? "#3ee08a" : st.g < 10 ? "#ffc145" : "#ff4d4d"; c.fillRect(x, y - 4, 130 * gv, 6); c.fillStyle = "#cfd3e6"; c.fillText(st.g.toFixed(1) + " g", x + 92, y - 12 + 0);
		if (S.m === "drive" && running) { c.textAlign = "right"; c.fillStyle = "rgba(255,255,255,0.75)"; c.fillText("↑ gas · ↓ brake" + (S.ac ? " · ←/→ tilt" : ""), W - 12, H - 12); }
	}

	/* ---------------- replay / scrub ---------------- */
	var scrub = $("gj-scrub");
	function scrubSetup() { if (!sim || !sim.track.length) { scrub.parentNode.hidden = true; return; } scrub.parentNode.hidden = false; scrub.max = sim.track.length - 1; scrub.value = sim.track.length - 1; }
	scrub.addEventListener("input", function () { running = false; replay = { track: sim.track, i: +scrub.value }; paintRun(); frame(); var tr = sim.track[+scrub.value]; $("gj-clock").textContent = "replay t = " + tr[0].toFixed(2) + " s"; });
	var replayTimer = 0;
	$("gj-replay").addEventListener("click", function () {
		if (!sim || !sim.track.length) return; running = false; var tr = sim.track, i0 = 0, t0 = performance.now();
		/* start a second before takeoff */
		if (sim.ev.takeoff) for (var i = 0; i < tr.length; i++) if (tr[i][0] >= sim.ev.takeoff.t - 0.8) { i0 = i; break; }
		replay = { track: tr, i: i0 }; cancelAnimationFrame(replayTimer);
		(function tick(now) { var t = tr[i0][0] + (now - t0) / 1000 * Math.min(S.slow, 1) * (S.slow >= 1 ? 0.35 : 1); var j = replay.i; while (j < tr.length - 1 && tr[j + 1][0] <= t) j++; replay.i = j; scrub.value = j; frame(); $("gj-clock").textContent = "replay t = " + tr[j][0].toFixed(2) + " s · slow motion"; if (j < tr.length - 1 && replay) replayTimer = requestAnimationFrame(tick); })(t0);
	});

	/* ---------------- runs table ---------------- */
	function paintRuns() {
		var tb = $("gj-runs"); if (!runs.length) { tb.innerHTML = '<tr><td colspan="8" class="gj-empty">Your jumps will be listed here.</td></tr>'; return; }
		tb.innerHTML = runs.slice().reverse().map(function (r) {
			var cl = r.code === "clean" ? "ok" : r.code === "hard" ? "warn" : "bad";
			return "<tr><td>" + r.n + "</td><td>" + esc(r.v) + "</td><td>" + spd(r.to) + "</td><td>" + (r.ang || 0).toFixed(0) + "°</td><td>" + (r.air || 0).toFixed(2) + " s</td><td>" + len(r.dist) + "</td><td>" + (r.g || 0).toFixed(1) + " g</td><td><span class=\"gj-tag gj-tag--" + cl + "\">" + esc(r.title) + "</span></td></tr>";
		}).join("");
	}
	$("gj-clear").addEventListener("click", function () { runs = []; try { localStorage.removeItem(KEY + ":runs"); } catch (e) { /* ignore */ } best = null; ghost = null; paintRuns(); frame(); });
	$("gj-csv").addEventListener("click", function () {
		var rows = [["run", "vehicle", "takeoff km/h", "takeoff angle", "airtime s", "distance m", "height m", "landing g", "rotation deg", "result"]].concat(runs.map(function (r) { return [r.n, r.v, (r.to * 3.6).toFixed(1), r.ang.toFixed(1), r.air.toFixed(2), r.dist.toFixed(2), r.h.toFixed(2), r.g.toFixed(2), r.rot.toFixed(0), r.title]; }));
		copy(rows.map(function (r) { return r.join("\t"); }).join("\n"), "Copied: paste it into a spreadsheet.");
	});
	function copy(text, msg) { (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg); }, function () { prompt("Copy this:", text); }); }
	$("gj-link").addEventListener("click", function () { copy(writeUrl(), "Link copied: it opens this exact jump."); });
	$("gj-png").addEventListener("click", function () { cv.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "stunt-jump.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }); });

	/* ---------------- speed sweep ---------------- */
	var sweepBusy = false;
	$("gj-sweep").addEventListener("click", function () {
		if (sweepBusy) return; sweepBusy = true; rebuild();
		var gg = GRAV[S.gr], top = topSpeed(veh, gg[0], gg[1] || 0.0001) * 3.6, kmax = Math.min(260, Math.max(60, top)), list = [], step = kmax > 160 ? 4 : 2, k;
		for (k = 10; k <= kmax; k += step) list.push(k);
		var out = [], i = 0, btn = $("gj-sweep"), opts = simOpts(), cKey = courseKey(); btn.disabled = true;
		(function chunk() {
			var t0 = performance.now();
			while (i < list.length && performance.now() - t0 < 30) { out.push(M.sweepOne(co, veh, opts, list[i])); i++; }
			btn.textContent = "Working… " + Math.round(i / list.length * 100) + "%";
			if (i < list.length) { setTimeout(chunk, 0); return; }
			sweepBusy = false; btn.disabled = false; btn.textContent = "↻ Find the right speed again"; sweepData = { list: out, key: cKey }; paintSweep(); drawSweep();
		})();
	});
	function windows(list, codes) { var w = [], cur = null; list.forEach(function (r) { var hit = codes.indexOf(r.code) >= 0 && !(r.over && codes.length === 1); if (hit) { if (!cur) { cur = [r.kmh, r.kmh]; w.push(cur); } else cur[1] = r.kmh; } else cur = null; }); return w; }
	function paintSweep() {
		var box = $("gj-sweeptxt"); if (!sweepData) { box.innerHTML = "Runs this exact jump at every speed (a few seconds) and shows where it lands and how hard."; $("gj-swwrap").hidden = true; return; }
		$("gj-swwrap").hidden = false;
		var cl = windows(sweepData.list, ["clean"]), ok = windows(sweepData.list, ["clean", "hard"]);
		function txt(w) { return w.map(function (a) { return a[0] === a[1] ? spd(a[0] / 3.6) : spd(a[0] / 3.6) + " to " + spd(a[1] / 3.6); }).join(", "); }
		var s = cl.length ? "<b>Clean landings: " + txt(cl) + ".</b> " : "<b>No clean landing at any speed.</b> ";
		s += ok.length ? "Survivable (clean or hard): " + txt(ok) + ". " : "";
		if (!ok.length) s += "Change the ramps: a landing ramp at about the takeoff angle and height gives the widest window.";
		s += " Click a dot to try that speed.";
		box.innerHTML = s;
	}
	var swHit = [];
	function chartCol() { var d = dark(); return { bg: d ? "#16181f" : "#ffffff", grid: d ? "#2c313c" : "#e6e9ee", text: d ? "#c9ced6" : "#4a5260", strong: d ? "#f1f3f6" : "#1f2530", zone: d ? "rgba(70,200,120,0.18)" : "rgba(40,170,90,0.14)" }; }
	var CODECOL = { clean: "#22b35a", hard: "#e6a21a", brutal: "#e2453c", crash: "#7a1fa2", short: "#5b6576", splash: "#1f8fd6", fell: "#5b6576", nojump: "#aab" };
	function prepC(c, aspect, minH) { var w = c.parentNode.clientWidth || 600, h = Math.max(minH, Math.round(w / aspect)); c.style.height = h + "px"; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); var x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); return { x: x, w: w, h: h }; }
	function drawSweep() {
		if (!sweepData) return; var c = $("gj-swc"), o = prepC(c, 2.4, 220), x = o.x, col = chartCol(), L = 52, R = 12, T = 12, B = 36, w = o.w - L - R, h = o.h - T - B;
		x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var list = sweepData.list, kmax = list[list.length - 1].kmh, dmax = 10;
		list.forEach(function (r) { if (r.code !== "nojump") dmax = Math.max(dmax, r.dist); }); if (isFinite(co.zone[1])) dmax = Math.max(dmax, co.zone[1] * 1.15); dmax = Math.min(dmax * 1.05, 500);
		function X(k) { return L + (k - 10) / (kmax - 10) * w; } function Y(d) { return T + h - clamp(d / dmax, 0, 1) * h; }
		if (co.hasGap) { var z1 = isFinite(co.zone[1]) ? co.zone[1] : dmax; x.fillStyle = col.zone; x.fillRect(L, Y(z1), w, Y(co.zone[0]) - Y(z1)); x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.textAlign = "right"; x.fillText("landing", L + w - 4, Y(co.zone[0]) - 4); }
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.lineWidth = 1;
		for (var i = 0; i <= 5; i++) { var gy = T + h * i / 5, gx = L + w * i / 5; x.beginPath(); x.moveTo(L, gy); x.lineTo(L + w, gy); x.moveTo(gx, T); x.lineTo(gx, T + h); x.stroke(); x.textAlign = "right"; x.fillText(len(dmax * (5 - i) / 5, 0).replace(" m", "").replace(" ft", ""), L - 5, gy + 4); x.textAlign = "center"; x.fillText(Math.round(kmhToUnit(10 + (kmax - 10) * i / 5)), gx, T + h + 15); }
		x.textAlign = "center"; x.fillText("speed at the ramp (" + (S.u === "i" ? "mph" : "km/h") + ")", L + w / 2, o.h - 4); x.save(); x.translate(12, T + h / 2); x.rotate(-Math.PI / 2); x.fillText("distance (" + (S.u === "i" ? "ft" : "m") + ")", 0, 0); x.restore();
		/* line + dots */
		x.strokeStyle = col.text; x.globalAlpha = 0.35; x.beginPath(); var first = true; list.forEach(function (r) { if (r.code === "nojump") return; if (first) { x.moveTo(X(r.kmh), Y(r.dist)); first = false; } else x.lineTo(X(r.kmh), Y(r.dist)); }); x.stroke(); x.globalAlpha = 1;
		swHit = [];
		list.forEach(function (r) { var px = X(r.kmh), py = Y(r.code === "nojump" ? 0 : r.dist); x.fillStyle = CODECOL[r.code] || "#888"; x.beginPath(); x.arc(px, py, 4.5, 0, 7); x.fill(); swHit.push([px, py, r]); });
		/* current speed */
		x.strokeStyle = col.strong; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(X(S.k), T); x.lineTo(X(S.k), T + h); x.stroke(); x.setLineDash([]);
		var lg = $("gj-swlg"); lg.innerHTML = ["clean", "hard", "brutal", "crash", "short", "splash"].filter(function (k) { return list.some(function (r) { return r.code === k; }); }).map(function (k) { return '<span><i style="background:' + CODECOL[k] + '"></i>' + { clean: "clean", hard: "hard", brutal: "brutal", crash: "crash", short: "short", splash: "splash" }[k] + "</span>"; }).join("");
	}
	$("gj-swc").addEventListener("click", function (e) {
		var r = this.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = 400;
		swHit.forEach(function (p) { var d = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my); if (d < bd) { bd = d; best = p[2]; } });
		if (best) { S.k = best.kmh; S.m = "auto"; S.pre = ""; changed(); drawSweep(); go(); }
	});
	$("gj-swc").addEventListener("mousemove", function (e) {
		var r = this.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = 300;
		swHit.forEach(function (p) { var d = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my); if (d < bd) { bd = d; best = p[2]; } });
		this.title = best ? spd(best.kmh / 3.6) + ": " + best.title + (best.code !== "nojump" && best.dist ? ", " + len(best.dist) : "") + (best.ok ? ", " + best.landG.toFixed(1) + " g" : "") : "";
	});

	/* ---------------- charts of the last run ---------------- */
	function drawCharts() {
		var tr = sim && sim.track, c1 = $("gj-ch1"), c2 = $("gj-ch2"); if (!c1 || !tr || tr.length < 2 || !sim.ev.takeoff) { $("gj-charts").hidden = true; return; }
		$("gj-charts").hidden = false; var col = chartCol();
		/* 1: path (height vs distance) with the ground */
		var o = prepC(c1, 2.2, 200), x = o.x, L = 48, R = 10, T = 10, B = 32, w = o.w - L - R, h = o.h - T - B; x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var x0 = co.rampStart - 5, x1 = Math.max(tr[tr.length - 1][1], co.lip.x + 10), ymin = Math.min(co.floor, 0) - 1, ymax = 1;
		tr.forEach(function (p) { if (p[1] >= x0 && p[1] <= x1) ymax = Math.max(ymax, p[2] + 1); });
		var sx = w / (x1 - x0), sy = h / (ymax - ymin), s = Math.min(sx, sy * 3); function X(v) { return L + (v - x0) * sx; } function Y(v) { return T + h - (v - ymin) * sy; }
		x.fillStyle = dark() ? "#2a2533" : "#e9e3f2"; x.beginPath(); x.moveTo(X(x0), T + h); for (var gx = x0; gx <= x1; gx += (x1 - x0) / 300) x.lineTo(X(gx), Y(Math.max(ymin, M.groundAt(co, gx).y))); x.lineTo(X(x1), T + h); x.closePath(); x.fill();
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; for (var i = 0; i <= 4; i++) { var yy = T + h * i / 4, vv = ymax - (ymax - ymin) * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + w, yy); x.stroke(); x.textAlign = "right"; x.fillText(len(vv, 0), L - 4, yy + 4); var xv = x0 + (x1 - x0) * i / 4; x.textAlign = "center"; x.fillText(len(xv - co.lip.x, 0), X(xv), T + h + 14); }
		x.textAlign = "center"; x.fillText("distance from the lip", L + w / 2, o.h - 3);
		if (ghost && ghost.key === courseKey()) { x.strokeStyle = col.text; x.globalAlpha = 0.35; x.setLineDash([4, 4]); x.beginPath(); ghost.track.forEach(function (p, i) { if (i) x.lineTo(X(p[1]), Y(p[2])); else x.moveTo(X(p[1]), Y(p[2])); }); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
		x.lineWidth = 2.5; for (i = 1; i < tr.length; i++) { if (tr[i][1] < x0) continue; x.strokeStyle = speedCol(tr[i][4]); x.beginPath(); x.moveTo(X(tr[i - 1][1]), Y(tr[i - 1][2])); x.lineTo(X(tr[i][1]), Y(tr[i][2])); x.stroke(); } x.lineWidth = 1;
		/* 2: g-force vs time */
		o = prepC(c2, 2.2, 200); x = o.x; w = o.w - L - R; h = o.h - T - B; x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var t0 = Math.max(0, sim.ev.takeoff.t - 1.2), t1 = tr[tr.length - 1][0], gmax = 6; tr.forEach(function (p) { if (p[0] >= t0) gmax = Math.max(gmax, p[5] * 1.1); }); gmax = Math.min(gmax, 80);
		function TX(t) { return L + (t - t0) / (t1 - t0 || 1) * w; } function GY(g) { return T + h - clamp(g / gmax, 0, 1) * h; }
		[[5, "rgba(230,162,26,0.12)"], [10, "rgba(226,69,60,0.12)"]].forEach(function (b, k) { var top = k ? gmax : 10; x.fillStyle = b[1]; x.fillRect(L, GY(top), w, GY(b[0]) - GY(top)); });
		x.strokeStyle = col.grid; x.fillStyle = col.text; for (i = 0; i <= 4; i++) { yy = T + h * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + w, yy); x.stroke(); x.textAlign = "right"; x.fillText((gmax * (4 - i) / 4).toFixed(0) + " g", L - 4, yy + 4); x.textAlign = "center"; x.fillText((t0 + (t1 - t0) * i / 4 - sim.ev.takeoff.t).toFixed(1) + " s", L + w * i / 4, T + h + 14); }
		x.textAlign = "center"; x.fillText("time from takeoff", L + w / 2, o.h - 3);
		x.strokeStyle = dark() ? "#ff9a6b" : "#c2185b"; x.lineWidth = 2; x.beginPath(); var f = true; tr.forEach(function (p) { if (p[0] < t0) return; if (f) { x.moveTo(TX(p[0]), GY(p[5])); f = false; } else x.lineTo(TX(p[0]), GY(p[5])); }); x.stroke(); x.lineWidth = 1;
		x.setLineDash([3, 3]); x.strokeStyle = col.text; x.beginPath(); x.moveTo(L, GY(1)); x.lineTo(L + w, GY(1)); x.stroke(); x.setLineDash([]); x.textAlign = "left"; x.fillText("1 g = sitting still", L + 4, GY(1) - 4);
	}

	/* ---------------- input ---------------- */
	function typing(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
	var KM = { ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", ArrowLeft: "tl", KeyA: "tl", ArrowRight: "tr", KeyD: "tr" };
	function inView() { var r = root.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
	document.addEventListener("keydown", function (e) {
		if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || !inView()) return;
		if (KM[e.code] && (running || document.activeElement === cv)) { keys[KM[e.code]] = 1; e.preventDefault(); return; }
		if (e.code === "Space" && document.activeElement === cv) { e.preventDefault(); go(); }
		else if (e.code === "KeyR" && (document.activeElement === cv || running)) { e.preventDefault(); reset(); }
	});
	document.addEventListener("keyup", function (e) { if (KM[e.code]) keys[KM[e.code]] = 0; });
	window.addEventListener("blur", function () { keys = { gas: 0, brake: 0, tl: 0, tr: 0 }; });
	Array.prototype.forEach.call(document.querySelectorAll("#gj-touch [data-k]"), function (b) {
		var k = b.getAttribute("data-k");
		function on(e) { e.preventDefault(); touch[k] = 1; b.classList.add("is-on"); } function off() { touch[k] = 0; b.classList.remove("is-on"); }
		b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
	});
	$("gj-go").addEventListener("click", go);
	$("gj-reset").addEventListener("click", reset);
	cv.addEventListener("click", function () { if (!running && (!sim || !sim.done)) go(); });
	cv.addEventListener("wheel", function (e) { if (!(e.ctrlKey || e.metaKey || document.querySelector(".mes-fill") || document.fullscreenElement)) return; e.preventDefault(); S.cam = "follow"; paintSeg(); }, { passive: false });
	$("gj-col").addEventListener("input", function (e) { S.color = e.target.value; save(); frame(); });

	/* ---------------- start ---------------- */
	if (S.pre && !fromLink) { var pp = M.PRESETS.filter(function (x) { return x.id === S.pre; })[0]; if (pp && !sv.k) loadPreset(pp); }
	$("gj-col").value = S.color || M.vehicle(S.v).color;
	paintInputs(); paintRuns(); reset(); paintSweep(); size();
	window.addEventListener("resize", size); if (window.ResizeObserver) new ResizeObserver(function () { size(); drawCharts(); drawSweep(); }).observe($("gj-st").parentNode);
	new MutationObserver(function () { drawCharts(); drawSweep(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	window.MESStunt = { S: S, go: go, reset: reset, get sim() { return sim; }, frame: frame, step: function (n) { for (var i = 0; i < (n || 1); i++) if (!sim.done) sim.step(DT); if (sim.done && !sim._f) { sim._f = 1; finished(); } frame(); paintRo(); } };
})();

/* MES GTA 6 Hub: hub, countdown, download pages + the tabs and jump calculator of the simulator page (the simulator itself is sim.js).
   #gt[data-page] = hub | jump | countdown | download. State: localStorage "mes-gta:v1" (countdown mode / zone, download inputs). */
(function () {
	"use strict";
	var root = document.getElementById("gt"); if (!root || !window.MESGTA) return;
	var M = window.MESGTA, PAGE = root.getAttribute("data-page"), KEY = "mes-gta:v1";
	var $ = function (id) { return document.getElementById(id); };
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var s = sget(); for (var k in o) s[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }
	function num(v, d) { var x = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isFinite(x) ? x : d; }
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	var myTz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();
	function fmtIn(ms, tz, o) { try { return new Intl.DateTimeFormat(undefined, Object.assign({ timeZone: tz }, o)).format(new Date(ms)); } catch (e) { return new Date(ms).toUTCString(); } }
	function whenText(ms, tz) { return fmtIn(ms, tz, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }); }
	function toast(msg) { var t = $("gj-toast"); if (!t) return; t.textContent = msg; t.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("is-on"); }, 3200); }
	function copy(text, msg) { (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg); }, function () { prompt("Copy this:", text); }); }
	function srcLine(el) { if (!el) return; el.innerHTML = "Checked " + M.FACTS.checked + ": " + M.FACTS.sources.map(function (s) { return '<a href="' + s[1] + '" target="_blank" rel="noopener">' + esc(s[0]) + "</a>"; }).join(" · ") + "."; }

	/* ---------------- tabs (simulator page) ---------------- */
	var tabs = root.querySelector(".gt-tabs");
	if (tabs) {
		var setTab = function (t, push) {
			Array.prototype.forEach.call(tabs.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
			Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.getAttribute("data-panel") !== t; });
			if (push) { var u = new URL(location.href); if (t === "sim") u.searchParams.delete("tab"); else u.searchParams.set("tab", t); history.replaceState(null, "", u); }
			window.dispatchEvent(new Event("resize")); if (t === "calc") calc();
		};
		tabs.addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) setTab(b.getAttribute("data-tab"), true); });
		var qt = new URLSearchParams(location.search).get("tab"); if (qt === "calc") setTimeout(function () { setTab("calc"); }, 0); /* after the calculator below is set up */
	}

	/* ---------------- jump calculator ---------------- */
	var DRAGS = [["none", "No air (vacuum)", 0], ["car", "Car (Cd·A 0.65 m², 1,400 kg)", 0.5 * 1.2 * 0.65 / 1400], ["bike", "Motorbike + rider (0.45 m², 280 kg)", 0.5 * 1.2 * 0.45 / 280], ["truck", "Big truck (2.6 m², 5,000 kg)", 0.5 * 1.2 * 2.6 / 5000], ["person", "A person (0.7 m², 80 kg)", 0.5 * 1.2 * 0.7 / 80]];
	function calc() {
		if (!$("jc-out")) return;
		var vu = $("jc-vu").value, v = num($("jc-v").value, NaN) * (vu === "kmh" ? 1 / 3.6 : vu === "mph" ? 0.44704 : 1), th = num($("jc-a").value, NaN), hu = $("jc-hu").value, hf = hu === "ft" ? 0.3048 : 1;
		var h = num($("jc-h").value, 0) * hf, x = num($("jc-x").value, 0) * hf, g = num($("jc-g").value, 9.80665), dk = DRAGS.filter(function (d) { return d[0] === $("jc-drag").value; })[0], k = dk ? dk[2] : 0;
		$("jc-xu").textContent = hu; sset({ jc: [$("jc-v").value, vu, $("jc-a").value, $("jc-h").value, hu, $("jc-x").value, $("jc-drag").value, $("jc-g").value] });
		var out = $("jc-out");
		if (!(v > 0) || !isFinite(th) || th < -45 || th > 85) { out.innerHTML = '<div class="tu-card gj-calcerr">Type a speed and an angle between −45° and 85°.</div>'; return; }
		var p = M.projectile(v, th, h, g), d = M.dragFlight(v, th, h, k, g, true), need = x > 0 ? M.speedNeeded(x, th, h, g) : NaN, needD = x > 0 && k ? M.speedNeededDrag(x, th, h, k, g) : need, best = M.bestAngle(v, h, g);
		function L(m) { return hu === "ft" ? (m / 0.3048).toFixed(1) + " ft" : m.toFixed(1) + " m"; }
		function V(ms) { return vu === "mph" ? (ms / 0.44704).toFixed(1) + " mph" : vu === "ms" ? ms.toFixed(1) + " m/s" : (ms * 3.6).toFixed(1) + " km/h"; }
		function tile(l, a, s, cls) { return '<div class="gj-tile' + (cls ? " gj-tile--" + cls : "") + '"><span>' + l + "</span><b>" + a + "</b>" + (s ? "<small>" + s + "</small>" : "") + "</div>"; }
		if (!p) { out.innerHTML = '<div class="tu-card gj-calcerr">It never gets that high: the landing is above the top of the jump.</div>'; return; }
		var r = k ? d : p, clears = x > 0 ? r.x >= x : null;
		var html = '<div class="gj-tiles">' +
			tile("Distance", L(r.x), k ? "no air: " + L(p.x) : "on the landing level") +
			tile("Airtime", r.t.toFixed(2) + " s", k ? "no air: " + p.t.toFixed(2) + " s" : "") +
			tile("Highest point", L(k ? d.apex : p.apex), "above the lip") +
			tile("Landing speed", V(r.vLand), "at " + Math.abs(r.angLand).toFixed(0) + "° down") +
			(x > 0 ? tile("Clears " + L(x) + "?", clears ? "Yes" : "No", clears ? "with " + L(r.x - x) + " to spare" : "short by " + L(x - r.x), clears ? "ok" : "bad") : "") +
			(x > 0 ? tile("Speed needed", isFinite(needD) ? V(needD) : "impossible", isFinite(need) && k ? "no air: " + V(need) : "") : "") +
			tile("Best angle at this speed", best.toFixed(1) + "°", "longest jump (no air)") + "</div>";
		out.innerHTML = html;
		/* chart */
		var c = $("jc-c"), dpr = Math.min(2, window.devicePixelRatio || 1), w = c.parentNode.clientWidth || 600, hh = Math.max(220, Math.round(w / 2.6));
		c.style.height = hh + "px"; c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); var ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		var dk2 = document.body.classList.contains("dark-mode"), bg = dk2 ? "#16181f" : "#fff", grid = dk2 ? "#2c313c" : "#e6e9ee", text = dk2 ? "#c9ced6" : "#4a5260";
		ctx.fillStyle = bg; ctx.fillRect(0, 0, w, hh);
		var vac = M.dragFlight(v, th, h, 0, g, true).path, xmax = Math.max(p.x, x, 1) * 1.08, ymax = Math.max(p.apex, 0.5) * 1.15, ymin = Math.min(-h, 0) - 0.5;
		var Lm = 46, Rm = 10, T = 10, B = 28, cw = w - Lm - Rm, ch = hh - T - B, s = Math.min(cw / xmax, ch / (ymax - ymin));
		function X(v2) { return Lm + v2 * s; } function Y(v2) { return T + (ymax - v2) * s; }
		ctx.strokeStyle = grid; ctx.fillStyle = text; ctx.font = "11px system-ui,sans-serif"; ctx.lineWidth = 1;
		var step = Math.pow(10, Math.floor(Math.log10(xmax / 4))); if (xmax / step > 10) step *= 2; if (xmax / step > 10) step *= 2.5;
		for (var gx = 0; gx <= xmax; gx += step) { ctx.beginPath(); ctx.moveTo(X(gx), T); ctx.lineTo(X(gx), T + ch); ctx.stroke(); ctx.textAlign = "center"; ctx.fillText(L(gx).replace(".0 ", " "), X(gx), T + ch + 15); }
		ctx.fillStyle = dk2 ? "#3a3346" : "#e9e3f2"; ctx.fillRect(X(-0.5), Y(0), X(0) - X(-0.5) + 2, Y(ymin) - Y(0)); ctx.fillRect(X(x || p.x), Y(-h), w, Y(ymin) - Y(-h) + 40);
		if (x > 0) { ctx.strokeStyle = "#22b35a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(x), Y(-h)); ctx.lineTo(X(xmax), Y(-h)); ctx.stroke(); }
		function line(path, col, dash) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash(dash || []); ctx.beginPath(); path.forEach(function (q, i) { if (i) ctx.lineTo(X(q[0]), Y(q[1])); else ctx.moveTo(X(q[0]), Y(q[1])); }); ctx.stroke(); ctx.setLineDash([]); }
		line(vac, "#7a8699", k ? [5, 5] : null); if (k) line(d.path, "#c2185b");
	}
	if ($("jc-out")) {
		var ds = $("jc-drag"); DRAGS.forEach(function (d) { var o = document.createElement("option"); o.value = d[0]; o.textContent = d[1]; ds.appendChild(o); }); ds.value = "car";
		var jc = sget().jc; if (jc && jc.length === 8) { $("jc-v").value = jc[0]; $("jc-vu").value = jc[1]; $("jc-a").value = jc[2]; $("jc-h").value = jc[3]; $("jc-hu").value = jc[4]; $("jc-x").value = jc[5]; $("jc-drag").value = jc[6]; $("jc-g").value = jc[7]; }
		["jc-v", "jc-vu", "jc-a", "jc-h", "jc-hu", "jc-x", "jc-drag", "jc-g"].forEach(function (id) { $(id).addEventListener("input", calc); $(id).addEventListener("change", calc); });
		window.addEventListener("resize", function () { if (!$("jc-out").closest("[hidden]")) calc(); });
	}

	/* ---------------- shared countdown maths ---------------- */
	var REL = M.FACTS.release, PRE = M.FACTS.preload;
	function countParts(target) { return M.parts(target - Date.now()); }

	/* ---------------- hub ---------------- */
	if (PAGE === "hub") {
		var target = M.midnight(myTz, REL);
		(function tick() {
			var p = countParts(target); $("gh-d").textContent = p.d; $("gh-h").textContent = pad(p.h); $("gh-m").textContent = pad(p.m); $("gh-s").textContent = pad(p.s);
			if (p.total <= 0) $("gh-cdl").textContent = "It's out! Unlocked at midnight where you are.";
			setTimeout(tick, 1000 - Date.now() % 1000 + 5);
		})();
		srcLine($("gh-src"));
		var allNews = [], shown = 8;
		function paintNews() {
			var ul = $("gh-news"); if (!allNews.length) { ul.innerHTML = '<li class="gh-load">No GTA headlines right now. Check back soon.</li>'; $("gh-more").hidden = true; return; }
			ul.innerHTML = allNews.slice(0, shown).map(function (n) { var ago = n.date ? agoText(n.date) : ""; return '<li><a href="' + esc(n.link) + '" target="_blank" rel="noopener nofollow">' + esc(n.title) + '</a><span>' + esc(n.source) + (ago ? " · " + ago : "") + "</span></li>"; }).join("");
			$("gh-more").hidden = shown >= allNews.length;
		}
		function agoText(ms) { var s = (Date.now() - ms) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; var d = Math.round(s / 86400); return d === 1 ? "yesterday" : d + " days ago"; }
		$("gh-more").addEventListener("click", function () { shown += 12; paintNews(); });
		var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).has("mock");
		fetch(local ? "/gta/data/news-sample.json" : "/api/gta-news").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) { allNews = (d.items || []).filter(function (n) { return /^https?:\/\//.test(n.link); }); paintNews(); })
			.catch(function () { $("gh-news").innerHTML = '<li class="gh-load">Could not load the headlines right now.</li>'; $("gh-more").hidden = true; });
	}

	/* ---------------- countdown ---------------- */
	if (PAGE === "countdown") {
		var st = sget(), q = new URLSearchParams(location.search), CM = { mode: q.get("mode") || st.cmode || "local", zone: q.get("tz") || st.czone || "Pacific/Auckland" };
		if (!/^(local|first|zone)$/.test(CM.mode)) CM.mode = "local";
		var zsel = $("gc-zone"), zones = M.CITIES.slice();
		if (!zones.some(function (z) { return z[1] === myTz; })) zones.unshift([myTz.split("/").pop().replace(/_/g, " ") + " (you)", myTz]);
		zones.forEach(function (z) { var o = document.createElement("option"); o.value = z[1]; o.textContent = z[0] + " (" + z[1] + ")"; zsel.appendChild(o); });
		if (!zones.some(function (z) { return z[1] === CM.zone; })) { var o = document.createElement("option"); o.value = CM.zone; o.textContent = CM.zone; zsel.appendChild(o); }
		zsel.value = CM.zone;
		function targetTz() { return CM.mode === "first" ? "Pacific/Auckland" : CM.mode === "zone" ? CM.zone : myTz; }
		function tgt() { return M.midnight(targetTz(), REL); }
		function paintMode() {
			Array.prototype.forEach.call($("gc-mode").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === CM.mode ? "true" : "false"); });
			$("gc-zonef").hidden = CM.mode !== "zone"; sset({ cmode: CM.mode, czone: CM.zone }); world(); links();
		}
		$("gc-mode").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; CM.mode = b.getAttribute("data-v"); paintMode(); tick(true); });
		zsel.addEventListener("change", function () { CM.zone = zsel.value; paintMode(); tick(true); });
		var announced = Date.UTC(2023, 11, 5); /* first trailer: the progress bar runs from there to launch */
		function tick(once) {
			var t = tgt(), p = countParts(t), tz = targetTz();
			$("gc-d").textContent = p.d; $("gc-h").textContent = pad(p.h); $("gc-m").textContent = pad(p.m); $("gc-s").textContent = pad(p.s);
			var label = CM.mode === "first" ? "GTA 6 unlocks first in New Zealand in" : CM.mode === "zone" ? "GTA 6 unlocks in " + zsel.options[zsel.selectedIndex].text.replace(/ \(.*/, "") + " in" : "GTA 6 unlocks where you are in";
			if (p.total <= 0) { label = "GTA 6 is out!"; var since = Math.floor((Date.now() - t) / 86400000); $("gc-when").textContent = since >= 1 ? "Day " + (since + 1) + " since it unlocked." : "It unlocked at midnight."; }
			else $("gc-when").textContent = "That is " + whenText(t, myTz) + " your time" + (tz !== myTz ? " (midnight on Nov 19 in " + tz.split("/").pop().replace(/_/g, " ") + ")" : " (midnight)") + ".";
			$("gc-what").textContent = label;
			$("gc-prog").style.width = Math.max(0, Math.min(100, (Date.now() - announced) / (t - announced) * 100)).toFixed(3) + "%";
			var pre = M.midnight(myTz, PRE), pp = countParts(pre);
			$("gc-pre").textContent = pp.total > 0 ? "Preload opens " + fmtIn(pre, myTz, { weekday: "long", month: "long", day: "numeric" }) + ": " + pp.d + " days " + pp.h + " hours away (the date is official, the hour may vary by store)." : "Preload is open: you can download it now and it unlocks on the 19th.";
			if (!once) setTimeout(tick, 1000 - Date.now() % 1000 + 5);
		}
		function world() {
			var tb = $("gc-world"), rows = M.CITIES.map(function (c) { return [c[0], c[1], M.midnight(c[1], REL)]; }).sort(function (a, b) { return a[2] - b[2]; });
			tb.innerHTML = rows.map(function (r) { var mine = r[1] === myTz; return "<tr" + (mine ? ' class="gc-me"' : "") + "><td>" + esc(r[0]) + (mine ? " <small>(you)</small>" : "") + "</td><td>" + esc(fmtIn(r[2], myTz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + '</td><td data-t="' + r[2] + '"></td></tr>'; }).join("");
			refreshWorld();
		}
		function refreshWorld() { Array.prototype.forEach.call($("gc-world").querySelectorAll("td[data-t]"), function (td) { var p = countParts(+td.getAttribute("data-t")); td.textContent = p.total <= 0 ? "out now" : p.d + "d " + p.h + "h " + p.m + "m"; }); }
		setInterval(refreshWorld, 30000);
		function links() {
			var tz = targetTz(), title = "GTA 6 unlocks";
			$("gc-remind").href = "/reminder?title=" + encodeURIComponent(title) + "&t=" + REL + "T00:00&tz=" + encodeURIComponent(tz) + "&u=/gta-6-countdown";
			var t = tgt(), d = new Date(t), e = new Date(t + 3600000), f = function (x) { return x.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); };
			$("gc-gcal").href = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + f(d) + "/" + f(e) + "&details=" + encodeURIComponent("Countdown: https://mes.fm/gta-6-countdown");
		}
		$("gc-ics").addEventListener("click", function () {
			var t = tgt(), f = function (x) { return new Date(x).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); };
			var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MES//GTA 6 Countdown//EN", "BEGIN:VEVENT", "UID:gta6-" + t + "@mes.fm", "DTSTAMP:" + f(Date.now()), "DTSTART:" + f(t), "DTEND:" + f(t + 3600000), "SUMMARY:GTA 6 unlocks", "DESCRIPTION:Countdown: https://mes.fm/gta-6-countdown", "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:GTA 6 unlocks in 15 minutes", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
			var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "gta-6-unlock.ics"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
		});
		$("gc-share").addEventListener("click", function () { var u = location.origin + location.pathname + (CM.mode === "local" ? "" : "?mode=" + CM.mode + (CM.mode === "zone" ? "&tz=" + encodeURIComponent(CM.zone) : "")); copy(u, "Link copied."); });
		/* fill window / full screen (Esc closes) */
		var box = $("gc-box");
		function setFill(on) { box.classList.toggle("gc-filled", on); document.documentElement.classList.toggle("gc-fill-on", on); $("gc-fill").textContent = on ? "✕ Close (Esc)" : "⤢ Fill window"; }
		$("gc-fill").addEventListener("click", function () { setFill(!box.classList.contains("gc-filled")); });
		$("gc-fs").addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); });
		document.addEventListener("keydown", function (e) { if (e.target.closest && e.target.closest("input,select,textarea")) return; if (e.key === "Escape" && box.classList.contains("gc-filled")) setFill(false); else if ((e.key === "w" || e.key === "W") && !e.ctrlKey && !e.metaKey) setFill(!box.classList.contains("gc-filled")); else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey) $("gc-fs").click(); });
		srcLine($("gc-src")); paintMode(); tick();
	}

	/* ---------------- download time + storage ---------------- */
	if (PAGE === "download") {
		var ds0 = sget().dl || {}, qd = new URLSearchParams(location.search);
		if (qd.get("mbps")) { ds0.spd = qd.get("mbps"); ds0.unit = "mbps"; }
		["size", "patch", "spd"].forEach(function (k) { if (ds0[k] != null) $("gd-" + k).value = ds0[k]; }); if (ds0.unit) $("gd-unit").value = ds0.unit; if (ds0.eff) $("gd-eff").value = ds0.eff;
		var con = $("gd-con"); M.CONSOLES.forEach(function (c) { var o = document.createElement("option"); o.value = c.id; o.textContent = c.name; con.appendChild(o); }); con.value = ds0.con || "ps5";
		$("gd-free").value = ds0.free != null ? ds0.free : M.CONSOLES.filter(function (c) { return c.id === con.value; })[0].usable;
		var chips = $("gd-chips"); M.CONNECTIONS.forEach(function (c) { var b = document.createElement("button"); b.type = "button"; b.className = "gj-chip"; b.textContent = c[0] + " · " + (c[1] >= 1000 ? c[1] / 1000 + " Gbps" : c[1] + " Mbps"); b.setAttribute("data-mbps", c[1]); chips.appendChild(b); });
		chips.addEventListener("click", function (e) { var b = e.target.closest("[data-mbps]"); if (!b) return; $("gd-spd").value = b.getAttribute("data-mbps"); $("gd-unit").value = "mbps"; dl(); });
		function gb() { return Math.max(0, num($("gd-size").value, 212)) + Math.max(0, num($("gd-patch").value, 0)); }
		function mbpsNow() { var s = num($("gd-spd").value, 0), u = $("gd-unit").value; return s * M.SPEED_UNITS[u][0] / 1e6; }
		function dl() {
			var size = gb(), sp = num($("gd-spd").value, 0), unit = $("gd-unit").value, eff = num($("gd-eff").value, 0.75), sec = M.downloadSeconds(size, sp, unit, eff), raw = M.downloadSeconds(size, sp, unit, 1);
			sset({ dl: { size: $("gd-size").value, patch: $("gd-patch").value, spd: $("gd-spd").value, unit: unit, eff: $("gd-eff").value, con: con.value, free: $("gd-free").value } });
			var out = $("gd-out");
			if (!(sp > 0) || !(size > 0)) { out.innerHTML = '<div class="tu-card">Type your internet speed above.</div>'; return; }
			var now = Date.now(), fin = now + sec * 1000, pre = M.midnight(myTz, PRE), rel = M.midnight(myTz, REL), finPre = Math.max(now, pre) + sec * 1000;
			var mbs = mbpsNow() * eff / 8;
			function t(l, a, s, cls) { return '<div class="gj-tile' + (cls ? " gj-tile--" + cls : "") + '"><span>' + l + "</span><b>" + a + "</b>" + (s ? "<small>" + s + "</small>" : "") + "</div>"; }
			out.innerHTML = '<div class="gj-tiles">' +
				t("Download time", M.durationText(sec), "at about " + mbs.toFixed(mbs < 10 ? 1 : 0) + " MB/s real speed", "big") +
				t("Best case", M.durationText(raw), "if you got the plan's full speed") +
				t("Start now, done", fmtIn(fin, myTz, { weekday: "short", hour: "numeric", minute: "2-digit" }), "your time") +
				t("Start at preload, done", fmtIn(finPre, myTz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), finPre < rel ? "ready before launch" : "after it unlocks", finPre < rel ? "ok" : "bad") +
				t("Data used", size.toFixed(0) + " GB", "≈ " + Math.round(size / 1200 * 100) + "% of a 1.2 TB monthly cap") + "</div>";
			/* other speeds */
			var rows = M.CONNECTIONS.map(function (c) { return [c[0], c[1], M.downloadSeconds(size, c[1], "mbps", eff)]; }), mine = mbpsNow(), maxS = Math.min(rows[0][2], 3 * 86400);
			rows.push(["Your speed", mine, sec]); rows.sort(function (a, b) { return a[1] - b[1]; });
			$("gd-bars").innerHTML = rows.map(function (r) { var you = r[0] === "Your speed"; return '<div class="gd-bar' + (you ? " gd-bar--you" : "") + '"><span>' + esc(r[0]) + " <small>" + (r[1] >= 1000 ? (r[1] / 1000).toFixed(1) + " Gbps" : Math.round(r[1]) + " Mbps") + '</small></span><i style="width:' + Math.max(1.5, Math.min(100, r[2] / maxS * 100)).toFixed(1) + '%"></i><b>' + M.durationText(r[2]) + "</b></div>"; }).join("");
			store();
		}
		function store() {
			var c = M.CONSOLES.filter(function (x) { return x.id === con.value; })[0], free = Math.max(0, num($("gd-free").value, c.usable)), need = gb(), used = Math.max(0, c.usable - free), spare = free - need;
			var pct = function (x) { return Math.max(0, Math.min(100, x / c.usable * 100)).toFixed(1) + "%"; };
			$("gd-disk").innerHTML = '<div class="gd-diskbar"><i class="gd-used" style="width:' + pct(used) + '" title="Already used"></i><i class="gd-game' + (spare < 0 ? " gd-over" : "") + '" style="width:' + pct(Math.min(need, free)) + '" title="GTA 6"></i></div><div class="gj-lg"><span><i style="background:#8a93a6"></i>already used ' + Math.round(used) + ' GB</span><span><i style="background:#c2185b"></i>GTA 6 ' + Math.round(need) + " GB</span><span>space for games " + c.usable + " GB (of " + (c.total >= 1000 ? c.total / 1000 + " TB" : c.total + " GB") + " advertised)</span></div>";
			$("gd-fit").innerHTML = spare >= 50 ? "<b>✓ It fits</b>, with " + Math.round(spare) + " GB to spare." : spare >= 0 ? "<b>It just fits</b> (" + Math.round(spare) + " GB left), but updates need room too: free up about " + Math.round(50 - spare) + " GB more." : "<b>✕ It doesn't fit yet.</b> Free up at least <b>" + Math.round(-spare) + " GB</b> (better " + Math.round(-spare + 50) + " GB for updates), or add storage: an M.2 SSD on PS5, an expansion card on Xbox.";
			$("gd-fit").className = "gd-fit gd-fit--" + (spare >= 50 ? "ok" : spare >= 0 ? "warn" : "bad");
		}
		con.addEventListener("change", function () { $("gd-free").value = M.CONSOLES.filter(function (c) { return c.id === con.value; })[0].usable; dl(); });
		["gd-size", "gd-patch", "gd-spd", "gd-unit", "gd-eff", "gd-free"].forEach(function (id) { $(id).addEventListener("input", dl); $(id).addEventListener("change", dl); });
		/* speed test: timed download from Cloudflare's speed endpoint (CORS-open), up to 50 MB or 8 s */
		$("gd-test").addEventListener("click", function () {
			var btn = this, note = $("gd-testn"); btn.disabled = true; note.textContent = "Testing…";
			var t0 = performance.now(), got = 0, ctl = window.AbortController ? new AbortController() : null, stop = setTimeout(function () { ctl && ctl.abort(); }, 8000);
			fetch("https://speed.cloudflare.com/__down?bytes=50000000&r=" + Math.random(), { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
				if (!r.body || !r.body.getReader) return r.arrayBuffer().then(function (b) { got = b.byteLength; });
				var rd = r.body.getReader(); return (function pump() { return rd.read().then(function (x) { if (x.done) return; got += x.value.length; var dt = (performance.now() - t0) / 1000; note.textContent = "Testing… " + (got * 8 / dt / 1e6).toFixed(0) + " Mbps"; return pump(); }); })();
			}).catch(function () { /* aborted after 8 s: use what arrived */ }).then(function () {
				clearTimeout(stop); var dt = (performance.now() - t0) / 1000, mbps = got * 8 / dt / 1e6; btn.disabled = false;
				if (got < 1e6) { note.textContent = "The test could not run (blocked or offline). Try fast.com or your provider's speed test."; return; }
				$("gd-spd").value = Math.round(mbps); $("gd-unit").value = "mbps"; $("gd-eff").value = "0.92"; dl();
				note.textContent = "About " + Math.round(mbps) + " Mbps in this browser. A console on the same connection may differ, especially over Wi-Fi.";
			});
		});
		dl();
	}
})();
