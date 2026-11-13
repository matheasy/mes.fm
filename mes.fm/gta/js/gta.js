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
	var MAP_V = 2;
	/* v1 = the first hand-drawn sketch; v2 = the painted picture (img/leonida-map.jpg), laid out from that sketch.
	   upgradeXY moves a v1 spot onto the v2 picture (least-squares affine from 10 landmarks, ~20 units off at worst). */
	var V1TO2 = [1.050354, -0.031565, -18.8582, 0.001665, 1.025151, -65.0559];
	function upgradeXY(x, y, m) {
		if (m >= 2) return { x: x, y: y };
		var a = V1TO2, nx = a[0] * x + a[1] * y + a[2], ny = a[3] * x + a[4] * y + a[5];
		return { x: Math.round(Math.max(0, Math.min(1000, nx)) * 10) / 10, y: Math.round(Math.max(0, Math.min(1000, ny)) * 10) / 10 };
	}
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
	/* ---------- known places: a starter layer written by MES (our own words) from the trailers and Rockstar's region descriptions.
	   Spots are approximate (x, y in 0..1000 of the v1 sketch, moved onto the picture by upgradeXY); they move to the real spot when the map is redrawn after launch.
	   Not votable, never stored on the server. [id, x, y, cat, title, description, region] ---------- */
	var PLACES = [
		["k-vc-beach", 868, 690, "gem", "Vice Beach", "The ocean-front strip with art-deco hotels and neon signs, seen in both trailers.", "Vice City"],
		["k-vc-downtown", 822, 636, "other", "Downtown Vice City", "The high-rise city centre seen from the water and the air in the trailers.", "Vice City"],
		["k-vc-night", 832, 716, "activity", "Nightlife district", "Clubs, parties and crowded streets after dark, as shown in the trailers.", "Vice City"],
		["k-vc-marina", 852, 772, "vehicle", "Marina and yachts", "Boats, yachts and speedboats around the city's waterfront, as shown in the trailers.", "Vice City"],
		["k-vc-bridges", 798, 600, "stunt", "Bay bridges", "Long road bridges between the mainland and the beach islands.", "Vice City"],
		["k-keys-bridge", 618, 920, "stunt", "Overseas bridges", "A chain of islands joined by long road bridges heading south-west.", "Leonida Keys"],
		["k-keys-fish", 660, 905, "fishing", "Shallow-water fishing", "Clear, shallow water around the islands: a natural spot for fishing and boats.", "Leonida Keys"],
		["k-keys-boats", 700, 885, "vehicle", "Island boat traffic", "Boats are the quickest way between the islands.", "Leonida Keys"],
		["k-keys-end", 452, 957, "gem", "End of the Keys", "The last small islands at the far end of the chain.", "Leonida Keys"],
		["k-gr-airboat", 642, 652, "vehicle", "Airboats", "Airboats skimming through the wetlands, as shown in the trailers.", "Grassrivers"],
		["k-gr-gators", 600, 600, "animal", "Alligators", "Alligators were shown in the trailers: expect them near the water.", "Grassrivers"],
		["k-gr-river", 575, 612, "fishing", "Swamp river fishing", "Slow rivers and channels winding through the wetlands.", "Grassrivers"],
		["k-gr-birds", 700, 700, "animal", "Wetland birds", "Herons and other water birds in the swamp.", "Grassrivers"],
		["k-am-town", 700, 300, "other", "Ambrosia town", "A small inland town; Rockstar's region description puts its sugar industry here.", "Ambrosia"],
		["k-am-bikers", 760, 250, "activity", "Biker hangouts", "Rockstar's description of Ambrosia mentions bikers: look for their bars and clubhouses.", "Ambrosia"],
		["k-am-fields", 640, 360, "gem", "Cane fields", "Farmland and sugar cane fields around the town.", "Ambrosia"],
		["k-am-lake", 650, 465, "fishing", "Inland lake", "A lake on our sketch inland; good water for fishing and boats.", "Ambrosia"],
		["k-mk-hunt", 500, 175, "animal", "Hunting grounds", "Mount Kalaga National Park is the wild north: forests, wildlife and hunting.", "Mount Kalaga"],
		["k-mk-trails", 590, 200, "vehicle", "Off-road trails", "Dirt roads and trails through the park for trucks, ATVs and bikes.", "Mount Kalaga"],
		["k-mk-river", 440, 215, "fishing", "Mountain rivers", "Rivers in the national park for quiet fishing.", "Mount Kalaga"],
		["k-mk-view", 470, 150, "gem", "Park lookout", "High ground in the north with views over the park.", "Mount Kalaga"],
		["k-pg-town", 210, 205, "other", "Port Gellhorn", "Rockstar describes a run-down port town on the Gulf coast, past its best days.", "Port Gellhorn"],
		["k-pg-docks", 300, 150, "fishing", "Gulf docks", "Docks and piers on the Gulf coast.", "Port Gellhorn"],
		["k-pg-beach", 130, 225, "gem", "Gulf beaches", "Quieter beaches along the Gulf coast west of the town.", "Port Gellhorn"]
	].map(function (r) { var u = upgradeXY(r[1], r[2], 1); return { id: r[0], x: u.x, y: u.y, cat: r[3], title: r[4], desc: r[5], region: r[6], kind: "k", up: 0, dn: 0, c: 0 }; });
	/* group pins that sit closer than r map units (greedy, densest first): [{x, y, ids, pins}] (one entry = a single pin) */
	function clusterPins(list, r) {
		var out = [], used = {}, r2 = r * r, a = list.slice();
		a.forEach(function (p) { p._n = 0; list.forEach(function (q) { var dx = p.x - q.x, dy = p.y - q.y; if (dx * dx + dy * dy <= r2) p._n++; }); });
		a.sort(function (p, q) { return q._n - p._n; });
		a.forEach(function (p) {
			if (used[p.id]) return;
			var g = [p]; used[p.id] = 1;
			a.forEach(function (q) { if (used[q.id]) return; var dx = p.x - q.x, dy = p.y - q.y; if (dx * dx + dy * dy <= r2) { g.push(q); used[q.id] = 1; } });
			var sx = 0, sy = 0; g.forEach(function (q) { sx += q.x; sy += q.y; delete q._n; });
			out.push({ x: sx / g.length, y: sy / g.length, ids: g.map(function (q) { return q.id; }), pins: g });
		});
		a.forEach(function (p) { delete p._n; });
		return out;
	}
	/* the next pin in list order after curId that is not in found (wraps round); null when every pin is found */
	function nextUnfound(list, found, curId) {
		var n = list.length; if (!n) return null;
		var start = 0; for (var i = 0; i < n; i++) if (list[i].id === curId) { start = i + 1; break; }
		for (var j = 0; j < n; j++) { var p = list[(start + j) % n]; if (!(found && found[p.id])) return p; }
		return null;
	}
	/* a private marker (kept only in the browser): {m} or {error} */
	function cleanMarker(b) {
		var x = b && b.x, y = b && b.y;
		if (typeof x !== "number" || typeof y !== "number" || !(x >= 0 && x <= 1000 && y >= 0 && y <= 1000)) return { error: "pick a spot on the map" };
		var title = pinText(b.title, 70, false); if (title === null) return { error: "the title is too long (70 characters at most)" }; if (title.length < 1) return { error: "give it a short title" };
		var note = b.desc ? pinText(b.desc, 2000, true) : ""; if (note === null) return { error: "the note is too long (2,000 characters at most)" };
		var cat = PIN_CATS.some(function (c) { return c[0] === b.cat; }) ? b.cat : "other";
		return { m: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, cat: cat, title: title, desc: note, region: REGIONS.indexOf(b.region) >= 0 ? b.region : "" } };
	}
	function catName(id) { for (var i = 0; i < PIN_CATS.length; i++) if (PIN_CATS[i][0] === id) return PIN_CATS[i][1]; return "Other"; }
	var MAP = { MAP_V: MAP_V, upgradeXY: upgradeXY, V1TO2: V1TO2, PIN_CATS: PIN_CATS, REGIONS: REGIONS, pinText: pinText, hasLink: hasLink, cleanPin: cleanPin, clipId: clipId,
		pinStatus: pinStatus, pinRank: pinRank, sortPins: sortPins, filterPins: filterPins, catName: catName, BAD: BAD,
		HIVE_W: HIVE_W, wv: wv, statusOf: statusOf, hiveOk: hiveOk, scoreOf: scoreOf, explorers: explorers,
		HIVE_ID: HIVE_ID, hivePinJson: hivePinJson, hiveVoteJson: hiveVoteJson, parseHistory: parseHistory, pinFromRecord: pinFromRecord, voteFromRecord: voteFromRecord,
		PLACES: PLACES, clusterPins: clusterPins, nextUnfound: nextUnfound, cleanMarker: cleanMarker };

	var API = { G0: G0, FACTS: FACTS, VEHICLES: VEHICLES, vehicle: vehicle, bodyShape: bodyShape, PRESETS: PRESETS, COURSE_DEF: COURSE_DEF, buildCourse: buildCourse, groundAt: groundAt, rayHit: rayHit, closest: closest, inside: inside,
		Sim: Sim, simulate: simulate, sweepOne: sweepOne, summarize: summarize,
		projectile: projectile, speedNeeded: speedNeeded, bestAngle: bestAngle, dragFlight: dragFlight, speedNeededDrag: speedNeededDrag,
		CITIES: CITIES, offsetMin: offsetMin, zoned: zoned, midnight: midnight, parts: parts, unlockTimes: unlockTimes,
		SPEED_UNITS: SPEED_UNITS, downloadSeconds: downloadSeconds, durationText: durationText, CONSOLES: CONSOLES, CONNECTIONS: CONNECTIONS,
		parseRss: parseRss, aboutGta: aboutGta, NEWS_FEEDS: NEWS_FEEDS, decode: decode, MAP: MAP };
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESGTA = API;
})(typeof window !== "undefined" ? window : this);

/* MES Stunt Jump Simulator: 3D view (window.GJ3D). The physics is the same 2D side-plane simulation; this draws it in 3D:
   the course profile extruded into a road and land, timber ramps, water, buildings, palms and a sunset sky, the car body extruded from
   its side profile with spinning wheels on their suspension. three.js 0.170.0 is loaded from jsDelivr (unpkg fallback) only when 3D is chosen.
   Cameras: auto (chase on the run-up, a sweeping three-quarter view in the air), chase, side, driver, landing, orbit (drag / wheel / pinch). */
(function () {
	"use strict";
	var THREE = null, loading = null;
	var URLS = ["https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js", "https://unpkg.com/three@0.170.0/build/three.module.min.js"];
	function load() {
		if (THREE) return Promise.resolve(THREE); if (loading) return loading;
		var imp = new Function("u", "return import(u)");
		loading = imp(URLS[0]).catch(function () { return imp(URLS[1]); }).then(function (m) { THREE = m; return m; });
		return loading;
	}
	function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
	function canvasTex(w, h, draw) { var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

	function create(container) {
		return load().then(function () {
			var test = document.createElement("canvas"); if (!(test.getContext("webgl2") || test.getContext("webgl"))) throw new Error("WebGL is off");
			return new View(container);
		});
	}

	function View(container) {
		var self = this; this.el = container;
		var R = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.outputColorSpace = THREE.SRGBColorSpace;
		R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
		container.appendChild(R.domElement); R.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
		this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000);
		this.camPos = new THREE.Vector3(-20, 6, 12); this.camLook = new THREE.Vector3();
		/* orbit control. Orbit mode: the camera circles the car. Every other mode: a drag turns the camera
		   around what it looks at (driver's seat: looks around), on top of that camera's own movement;
		   "Auto view" (resetFree) drops the offset. */
		this.orb = { yaw: -0.7, pitch: 0.25, dist: 16 }; this.free = { yaw: 0, pitch: 0, zoom: 1, on: false }; var ptr = {}, moved = 0;
		var d = R.domElement;
		function big() { return !!d.closest(".is-fill, .is-fs") || !!document.fullscreenElement; }
		function zoomBy(k) { if (self.mode === "orbit") self.orb.dist = Math.max(5, Math.min(120, self.orb.dist * k)); else if (self.mode === "driver") { self.free.zoom = Math.max(0.55, Math.min(1.55, self.free.zoom * k)); self.setFree(); } /* driver's seat: zoom = field of view (wider shows the wheel and dash) */
			else { self.free.zoom = Math.max(0.25, Math.min(6, self.free.zoom * k)); self.setFree(); } self.redraw(); }
		d.addEventListener("pointerdown", function (e) { ptr[e.pointerId] = [e.clientX, e.clientY]; moved = 0; self.dragged = false; try { d.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
		d.addEventListener("pointermove", function (e) {
			var p = ptr[e.pointerId]; if (!p) return;
			var ids = Object.keys(ptr);
			if (ids.length === 2) { var a = ptr[ids[0]], b = ptr[ids[1]]; ptr[e.pointerId] = [e.clientX, e.clientY]; var a2 = ptr[ids[0]], b2 = ptr[ids[1]], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]), d1 = Math.hypot(a2[0] - b2[0], a2[1] - b2[1]); self.dragged = true; if (d0 > 0 && d1 > 0) zoomBy(d0 / d1); return; }
			var dx = e.clientX - p[0], dy = e.clientY - p[1]; ptr[e.pointerId] = [e.clientX, e.clientY];
			moved += Math.abs(dx) + Math.abs(dy); if (moved < 5) return; self.dragged = true;
			if (self.mode === "orbit") { self.orb.yaw -= dx * 0.008; self.orb.pitch = Math.max(-0.1, Math.min(1.45, self.orb.pitch + dy * 0.006)); }
			else if (self.mode === "driver") { self.free.yaw = Math.max(-2.6, Math.min(2.6, self.free.yaw + dx * 0.005)); self.free.pitch = Math.max(-0.9, Math.min(0.9, self.free.pitch - dy * 0.004)); self.setFree(); }
			else { self.free.yaw -= dx * 0.008; self.free.pitch = Math.max(-1.2, Math.min(1.2, self.free.pitch + dy * 0.006)); self.setFree(); }
			self.redraw();
		});
		function up(e) { delete ptr[e.pointerId]; }
		d.addEventListener("pointerup", up); d.addEventListener("pointercancel", up);
		d.addEventListener("wheel", function (e) { if (self.mode !== "orbit" && !big() && !e.ctrlKey) return; e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: false });
		d.addEventListener("dblclick", function () { self.resetFree(); });
		this.zoomBy = zoomBy;
		this.buildWorld();
	}
	View.prototype.canvas = function () { return this.renderer.domElement; };
	View.prototype.resize = function (w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.redraw(); };
	View.prototype.setFree = function () { var f = this.free, on = Math.abs(f.yaw) > 0.01 || Math.abs(f.pitch) > 0.01 || Math.abs(f.zoom - 1) > 0.01; if (on !== f.on) { f.on = on; if (this.onFree) this.onFree(on); } };
	View.prototype.resetFree = function () { var f = this.free; f.yaw = f.pitch = 0; f.zoom = 1; this.setFree(); this.redraw(); };
	View.prototype.takeDrag = function () { var t = this.dragged; this.dragged = false; return t; };
	View.prototype.redraw = function () { if (this.last) this.draw(this.last[0], this.last[1]); };

	/* sky, sun, lights, far city: built once */
	View.prototype.buildWorld = function () {
		var sc = this.scene;
		this.skyTex = canvasTex(4, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#140f38"); gr.addColorStop(0.42, "#5b2470"); gr.addColorStop(0.68, "#d65a6a"); gr.addColorStop(0.82, "#ff9f62"); gr.addColorStop(1, "#ffcf8e"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
		var skyGeo = new THREE.SphereGeometry(1800, 32, 16), skyMat = new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, depthWrite: false, fog: false });
		this.sky = new THREE.Mesh(skyGeo, skyMat); sc.add(this.sky);
		sc.fog = new THREE.Fog(0xb8566f, 160, 1300);
		var sunTex = canvasTex(256, 256, function (g, w) { var r = g.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); r.addColorStop(0, "rgba(255,248,220,1)"); r.addColorStop(0.2, "rgba(255,214,140,0.95)"); r.addColorStop(0.45, "rgba(255,150,100,0.35)"); r.addColorStop(1, "rgba(255,120,90,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); });
		this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, depthWrite: false, fog: false, transparent: true })); this.sun.scale.set(420, 420, 1); sc.add(this.sun);
		this.hemi = new THREE.HemisphereLight(0xffc7d8, 0x3a2350, 1.25); sc.add(this.hemi);
		var dl = this.light = new THREE.DirectionalLight(0xffd2a0, 2.4); dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048);
		var c = dl.shadow.camera; c.left = -45; c.right = 45; c.top = 45; c.bottom = -45; c.near = 1; c.far = 300; dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.04; sc.add(dl); sc.add(dl.target);
		/* far skyline: instanced boxes with lit windows */
		var winTex = canvasTex(64, 128, function (g, w, h) { g.fillStyle = "#2a1838"; g.fillRect(0, 0, w, h); var r = rng(5); for (var y = 6; y < h; y += 10) for (var x = 5; x < w; x += 10) { g.fillStyle = r() < 0.35 ? "rgba(255,200,120," + (0.5 + r() * 0.5) + ")" : "rgba(60,40,80,0.9)"; g.fillRect(x, y, 5, 6); } });
		winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
		var bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
		var bMat = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.9, color: 0x6d5a80 });
		var r = rng(911), n = 260, inst = new THREE.InstancedMesh(bGeo, bMat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
		for (var i = 0; i < n; i++) { var side = i % 3 === 0 ? 1 : -1, x = -900 + r() * 2200, z = side * (220 + r() * 380), w = 18 + r() * 40, h = 15 + Math.pow(r(), 2.2) * 110; p.set(x, 0, z); s.set(w, h, 18 + r() * 30); m.compose(p, q, s); inst.setMatrixAt(i, m); }
		inst.frustumCulled = false; sc.add(inst); this.skyline = inst;
		this.course = new THREE.Group(); sc.add(this.course);
		this.carG = new THREE.Group(); sc.add(this.carG);
		this.trailGeo = new THREE.BufferGeometry(); this.trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 4000), 3)); this.trailGeo.setDrawRange(0, 0);
		this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 })); this.trail.frustumCulled = false; sc.add(this.trail);
	};

	function disposeGroup(g) { while (g.children.length) { var o = g.children.pop(); o.traverse(function (k) { if (k.geometry) k.geometry.dispose(); if (k.material) { (Array.isArray(k.material) ? k.material : [k.material]).forEach(function (mt) { if (mt.map && !mt.map.__keep) mt.map.dispose(); mt.dispose(); }); } }); } }
	function shapeFrom(pts, bottom) { var s = new THREE.Shape(); s.moveTo(pts[0][0], bottom); pts.forEach(function (p) { s.lineTo(p[0], p[1]); }); s.lineTo(pts[pts.length - 1][0], bottom); s.lineTo(pts[0][0], bottom); return s; }
	function extrude(shape, depth, mat, z0) { var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, curveSegments: 1 }); g.translate(0, 0, z0 == null ? -depth / 2 : z0); var mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

	/* the course: land (ramps flattened) as a wide slab, a road strip on it, timber ramps, a building for a platform, water */
	View.prototype.setScene = function (co, veh, color, grav) {
		var M = window.MESGTA, g = this.course, self = this; disposeGroup(g); this.co = co; this.veh = veh;
		var x0 = co.rampStart - 400, x1 = (isFinite(co.zone[1]) ? co.zone[1] : co.gap) + 500, bottom = co.floor - 40;
		var inRamp = function (x) { return (x >= co.rampStart - 1e-6 && x <= 1e-6 && co.opt.ramp !== "none" && co.lip.y > 0) || (co.landKind === "ramp" && x >= co.zone[0] - 1e-6 && x <= co.zone[1] + 1e-6); };
		var inPlat = function (x) { return co.landKind === "platform" && x >= co.zone[0] - 1e-6 && x <= co.zone[1] + 1e-6; };
		var raw = co.pts.filter(function (p) { return p[0] >= x0 && p[0] <= x1; }); raw.unshift([x0, M.groundAt(co, x0).y]); raw.push([x1, M.groundAt(co, x1).y]);
		/* road profile: ramp spans flattened to the ground under them (0), keeping the vertical faces where the ground itself steps */
		function flatten(pts, alsoPlat) {
			var out = [];
			pts.forEach(function (p) {
				var y = p[1]; if (inRamp(p[0])) y = Math.min(p[1], 0) < co.floor + 1e-6 && p[1] <= co.floor + 1e-6 ? p[1] : 0;
				if (alsoPlat && inPlat(p[0])) y = co.floor;
				var last = out[out.length - 1]; if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - y) > 1e-6) out.push([p[0], y]);
			});
			return out;
		}
		var road = flatten(raw, false), land = flatten(raw, true);
		var earth = grav && grav[0] < 2 ? 0x8d909a : grav && grav[0] < 5 ? 0xa45b38 : 0x4a3d58;
		var landMat = new THREE.MeshStandardMaterial({ color: earth, roughness: 1 });
		var landMesh = extrude(shapeFrom(land, bottom), 400, landMat); landMesh.position.y = -0.04; landMesh.castShadow = false; g.add(landMesh);
		/* road with a dashed centre line: side-wall UVs of an extrusion are (x, z), so the texture repeats every 12 m along x */
		var roadTex = canvasTex(256, 64, function (c, w, h) { c.fillStyle = "#2a2a31"; c.fillRect(0, 0, w, h); var r = rng(3); for (var i = 0; i < 900; i++) { c.fillStyle = "rgba(255,255,255," + r() * 0.06 + ")"; c.fillRect(r() * w, r() * h, 2, 2); } c.fillStyle = "#ffd36b"; c.fillRect(0, h / 2 - 1.5, w * 0.5, 3); c.fillStyle = "#d9d9de"; c.fillRect(0, 3, w, 2.5); c.fillRect(0, h - 5.5, w, 2.5); });
		roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(1 / 12, 1 / 9); roadTex.anisotropy = 8;
		var roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }), wallMat = new THREE.MeshStandardMaterial({ color: 0x3c3448, roughness: 1 });
		var roadMesh = extrude(shapeFrom(road, bottom + 5), 9, [wallMat, roadMat], -4.5); roadMesh.castShadow = false; g.add(roadMesh);
		/* timber ramps */
		var woodTex = canvasTex(256, 128, function (c, w, h) { c.fillStyle = "#b9773a"; c.fillRect(0, 0, w, h); for (var x = 0; x < w; x += 16) { c.fillStyle = "rgba(70,35,10,0.55)"; c.fillRect(x, 0, 2, h); } var r = rng(9); for (var i = 0; i < 300; i++) { c.fillStyle = "rgba(90,50,20," + r() * 0.25 + ")"; c.fillRect(r() * w, r() * h, 10 + r() * 30, 1); } });
		woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(1 / 3, 1 / 3);
		var woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 }), sideMat = new THREE.MeshStandardMaterial({ color: 0x7a4a1d, roughness: 0.9 });
		function rampMesh(xa, xb) {
			var pts = co.pts.filter(function (p) { return p[0] >= xa - 1e-6 && p[0] <= xb + 1e-6 && p[1] >= -1e-6; }); if (pts.length < 2) return;
			g.add(extrude(shapeFrom(pts, 0), 8.4, [sideMat, woodMat]));
			/* steel legs under the high end */
			var legMat = new THREE.MeshStandardMaterial({ color: 0x55505e, metalness: 0.6, roughness: 0.4 });
			pts.forEach(function (p, i) { if (i % 3 || p[1] < 0.8) return; [-4.3, 4.3].forEach(function (z) { var l = new THREE.Mesh(new THREE.BoxGeometry(0.15, p[1], 0.15), legMat); l.position.set(p[0], p[1] / 2, z); l.castShadow = true; g.add(l); }); });
		}
		if (co.opt.ramp !== "none" && co.lip.y > 0) rampMesh(co.rampStart, 0);
		if (co.landKind === "ramp") rampMesh(co.zone[0], co.zone[1]);
		/* platform = a building (lit windows), roof at the landing height */
		if (co.landKind === "platform") {
			var top = M.groundAt(co, co.zone[0] + 0.01).y, hgt = top - co.floor, wB = co.zone[1] - co.zone[0];
			var bt = canvasTex(128, 256, function (c, w, h) { c.fillStyle = "#3b2f4c"; c.fillRect(0, 0, w, h); var r = rng(11); for (var y = 8; y < h; y += 16) for (var x = 6; x < w; x += 14) { c.fillStyle = r() < 0.4 ? "#ffd59a" : "#1f1830"; c.fillRect(x, y, 8, 10); } });
			bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(wB / 12, hgt / 24);
			var bm = new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.9 });
			var b = new THREE.Mesh(new THREE.BoxGeometry(wB, hgt, 22), bm); b.position.set((co.zone[0] + co.zone[1]) / 2, co.floor + hgt / 2 - 0.06, 0); b.receiveShadow = true; g.add(b);
		}
		/* the takeoff roof when there is no ramp and the street is below: a building under the road edge */
		if (co.opt.ramp === "none" && co.floor < -2) {
			var bt2 = canvasTex(128, 256, function (c, w, h) { c.fillStyle = "#33283f"; c.fillRect(0, 0, w, h); var r = rng(12); for (var y = 8; y < h; y += 16) for (var x = 6; x < w; x += 14) { c.fillStyle = r() < 0.4 ? "#ffcf8a" : "#1d1729"; c.fillRect(x, y, 8, 10); } });
			bt2.wrapS = bt2.wrapT = THREE.RepeatWrapping; bt2.repeat.set(3, -co.floor / 24);
			var b2 = new THREE.Mesh(new THREE.BoxGeometry(40, -co.floor, 22), new THREE.MeshStandardMaterial({ map: bt2, emissiveMap: bt2, emissive: 0xffffff, emissiveIntensity: 0.25 })); b2.position.set(-20.05, co.floor / 2 - 0.05, 0); g.add(b2);
		}
		/* water */
		if (co.water) {
			var wm = new THREE.MeshStandardMaterial({ color: 0x1b8fb8, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 });
			var wp = new THREE.Mesh(new THREE.PlaneGeometry(co.water.x1 - co.water.x0, 400), wm); wp.rotation.x = -Math.PI / 2; wp.position.set((co.water.x0 + co.water.x1) / 2, co.water.y, 0); wp.receiveShadow = true; g.add(wp); this.water = wp;
		} else this.water = null;
		/* landing zone: green strips along both road edges */
		if (co.hasGap) {
			var z0 = co.zone[0], z1 = isFinite(co.zone[1]) ? co.zone[1] : co.zone[0] + 60, gm = new THREE.MeshBasicMaterial({ color: 0x3ee08a });
			[-4.25, 4.25].forEach(function (z) {
				var pos = [], N = Math.max(2, Math.round((z1 - z0) / 0.5));
				for (var i = 0; i <= N; i++) { var x = z0 + (z1 - z0) * i / N, y = M.groundAt(co, x).y + 0.06; pos.push(x, y, z - 0.18, x, y, z + 0.18); }
				var geo = new THREE.BufferGeometry(), idx = []; for (i = 0; i < N; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
				geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); g.add(new THREE.Mesh(geo, gm));
			});
		}
		/* distance boards every 10 m past the lip */
		for (var dm = 10; dm <= Math.min(200, (isFinite(co.zone[1]) ? co.zone[1] : co.gap + 60) + 20); dm += 10) {
			var gy = M.groundAt(co, dm).y; if (gy < -100) continue;
			var tx = canvasTex(128, 64, function (c, w, h) { c.fillStyle = "rgba(20,12,40,0.85)"; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "bold 34px system-ui,sans-serif"; c.textAlign = "center"; c.fillText(dm + " m", w / 2, 44); });
			var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx })); sp.scale.set(1.8, 0.9, 1); sp.position.set(dm, Math.max(gy, 0) + 1.7, -9); g.add(sp);
			var post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), new THREE.MeshStandardMaterial({ color: 0xdddddd })); post.position.set(dm, Math.max(gy, 0) + 0.6, -9); g.add(post);
		}
		/* palms beside the road (not in the gap) */
		var r = rng(7), trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3d2a, roughness: 1 }), leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d4f, roughness: 0.8, side: THREE.DoubleSide });
		var leafGeo = new THREE.PlaneGeometry(3.6, 0.9); leafGeo.translate(1.8, 0, 0);
		for (var px = x0 + 20; px < x1 - 20; px += 14 + r() * 22) {
			if (px > co.rampStart - 3 && px < (isFinite(co.zone[1]) ? co.zone[1] : co.gap) + 3) continue;
			var pz = (r() < 0.5 ? -1 : 1) * (8 + r() * 10), ph = 7 + r() * 6, gyy = M.groundAt(co, px).y; if (gyy < -100) continue;
			var palm = new THREE.Group(), trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, ph, 7), trunkMat); trunk.position.y = ph / 2; trunk.castShadow = true; palm.add(trunk);
			for (var k = 0; k < 8; k++) { var lf = new THREE.Mesh(leafGeo, leafMat); lf.position.y = ph; lf.rotation.y = k / 8 * Math.PI * 2 + r(); lf.rotation.z = -0.35 - r() * 0.3; lf.castShadow = true; palm.add(lf); }
			palm.position.set(px, gyy, pz); palm.rotation.z = (r() - 0.5) * 0.15; g.add(palm);
		}
		/* sky per planet */
		this.sky.visible = !(grav && grav[0] < 2); this.scene.background = grav && grav[0] < 2 ? new THREE.Color(0x05060c) : null; this.scene.fog.color.set(grav && grav[0] < 2 ? 0x05060c : grav && grav[0] < 5 ? 0xc07a50 : 0xb8566f);
		this.sun.visible = !(grav && grav[0] < 2); this.skyline.visible = !(grav && grav[0] < 5);
		this.buildCar(veh, color);
		this.redraw();
	};

	/* the vehicle: body extruded from the side profile, glass, lights, wheels with rims */
	View.prototype.buildCar = function (veh, color) {
		var g = this.carG; disposeGroup(g); var M = window.MESGTA, sh = M.bodyShape(veh), bike = !!veh.bike, w = bike ? 0.5 : veh.body === "monster" ? 2.6 : veh.body === "suv" || veh.body === "pickup" ? 1.95 : 1.82;
		var paint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 });
		var body = new THREE.Group(); g.add(body); this.body = body;
		if (!bike) {
			var s = new THREE.Shape(); sh.pts.forEach(function (p, i) { if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); });
			var bg = new THREE.ExtrudeGeometry(s, { depth: w - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 1 }); bg.translate(0, 0, -(w - 0.12) / 2);
			var bm = new THREE.Mesh(bg, paint); bm.castShadow = true; bm.receiveShadow = true; body.add(bm);
			var win = M.windowPoly ? M.windowPoly(veh, sh) : null;
			if (win) { var ws = new THREE.Shape(); win.forEach(function (p, i) { if (i) ws.lineTo(p[0], p[1]); else ws.moveTo(p[0], p[1]); }); var wg = new THREE.ExtrudeGeometry(ws, { depth: w + 0.02, bevelEnabled: false }); wg.translate(0, 0, -(w + 0.02) / 2); body.add(new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({ color: 0x141a2e, metalness: 0.2, roughness: 0.05, transmission: 0, clearcoat: 1 }))); }
			var front = sh.pts.reduce(function (b, p) { return p[0] > b[0] ? p : b; }), rear = sh.pts.reduce(function (b, p) { return p[0] < b[0] ? p : b; });
			var hlM = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff2c0, emissiveIntensity: 2 }), tlM = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 1.6 });
			[-1, 1].forEach(function (sd) {
				var hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.32), hlM); hl.position.set(front[0] - 0.02, front[1] + 0.12, sd * (w / 2 - 0.3)); body.add(hl);
				var tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.36), tlM); tl.position.set(rear[0] + 0.02, rear[1] + 0.16, sd * (w / 2 - 0.28)); body.add(tl);
			});
		} else {
			/* bike: tank / seat block, forks, rider */
			var low = -veh.hcg + veh.r * 1.1, seat = low + 0.35, rearX = -veh.wb * veh.fr, frontX = veh.wb * (1 - veh.fr);
			var bs = new THREE.Shape(); [[rearX + 0.25, seat], [frontX - 0.35, seat + 0.18], [frontX - 0.05, seat - 0.05], [frontX - 0.4, low], [rearX + 0.4, low - 0.02]].forEach(function (p, i) { if (i) bs.lineTo(p[0], p[1]); else bs.moveTo(p[0], p[1]); });
			var bkg = new THREE.ExtrudeGeometry(bs, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }); bkg.translate(0, 0, -0.18); var bk = new THREE.Mesh(bkg, paint); bk.castShadow = true; body.add(bk);
			var suit = new THREE.MeshStandardMaterial({ color: 0x1d1f2e, roughness: 0.7 });
			function limb(a, b, r0) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), m = new THREE.Mesh(new THREE.CapsuleGeometry(r0, L, 4, 8), suit); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0); m.rotation.z = Math.atan2(dy, dx) - Math.PI / 2; m.castShadow = true; body.add(m); }
			var hip = [rearX + 0.5, seat + 0.12], knee = [frontX - 0.62, seat - 0.05], foot = [rearX + 0.62, low + 0.02], sho = [frontX - 0.62, seat + 0.62], hand = [frontX - 0.28, seat + 0.32];
			limb(foot, knee, 0.07); limb(knee, hip, 0.08); limb(hip, sho, 0.14); limb(sho, hand, 0.06);
			var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), paint); helmet.position.set(frontX - 0.52, seat + 0.86, 0); helmet.castShadow = true; body.add(helmet);
			var forkM = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.8, roughness: 0.3 }); this.fork = forkM;
		}
		/* wheels (positions set every frame) */
		var tyre = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.9 }), rim = new THREE.MeshStandardMaterial({ color: 0xb8c0ca, metalness: 0.85, roughness: 0.25 }), spokeM = new THREE.MeshStandardMaterial({ color: 0x4b525a, metalness: 0.6 });
		var tw = bike ? 0.16 : veh.body === "monster" ? 0.7 : 0.26, zs = bike ? [0] : [-(w / 2 - tw / 2 + 0.04), (w / 2 - tw / 2 + 0.04)];
		this.wheels = [];
		for (var ax = 0; ax < 2; ax++) {
			var axle = new THREE.Group(); g.add(axle);
			zs.forEach(function (z) {
				var wg = new THREE.Group(); wg.position.z = z;
				var t = new THREE.Mesh(new THREE.CylinderGeometry(veh.r, veh.r, tw, 28), tyre); t.rotation.x = Math.PI / 2; t.castShadow = true; wg.add(t);
				var rm = new THREE.Mesh(new THREE.CylinderGeometry(veh.r * 0.6, veh.r * 0.6, tw + 0.02, 20), rim); rm.rotation.x = Math.PI / 2; wg.add(rm);
				for (var k = 0; k < 5; k++) { var sp = new THREE.Mesh(new THREE.BoxGeometry(veh.r * 1.1, veh.r * 0.12, tw + 0.04), spokeM); sp.rotation.z = k * Math.PI / 5; wg.add(sp); }
				axle.add(wg);
			});
			this.wheels.push(axle);
		}
		this.buildCockpit(veh, sh, w, bike, paint);
	};

	/* driver's-seat interior (only shown in the Driver's seat camera): pillars, roof edge, windshield glass, mirror,
	   dashboard with a live speedometer, steering wheel; on a bike handlebars + a small gauge. Body-local frame: x forward, y up. */
	View.prototype.buildCockpit = function (veh, sh, w, bike, paint) {
		var ck = this.ck = { g: new THREE.Group(), full: new THREE.Group(), glass: new THREE.Group(), last: "" }; this.body.add(ck.g); ck.g.add(ck.full); ck.g.add(ck.glass); ck.g.visible = false;
		var trim = new THREE.MeshStandardMaterial({ color: 0x24252c, roughness: 0.75 }), dark = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.6 }), chrome = new THREE.MeshStandardMaterial({ color: 0xaab2bc, metalness: 0.85, roughness: 0.3 });
		var e = bike ? [0.1, veh.ht - veh.hcg + 0.05, 0] : [0.2, veh.ht - veh.hcg - 0.22, -0.35]; ck.eye = e;
		function box(par, sx, sy, sz, x, y, z, mat, rz) { var m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); if (rz) m.rotation.z = rz; par.add(m); return m; }
		function bar(par, a, b, z, t, d, mat) { var dx = b[0] - a[0], dy = b[1] - a[1]; return box(par, Math.hypot(dx, dy), t, d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z, mat, Math.atan2(dy, dx)); }
		/* gauge texture (redrawn when the shown number changes) */
		var cv = document.createElement("canvas"); cv.width = 256; cv.height = 128; ck.cv = cv; ck.tex = new THREE.CanvasTexture(cv); ck.tex.colorSpace = THREE.SRGBColorSpace;
		var gaugeM = new THREE.MeshBasicMaterial({ map: ck.tex, toneMapped: false });
		/* steering wheel / handlebars, in a group tilted toward the driver; ck.steer rocks on hard landings */
		var sw = new THREE.Group(), steer = ck.steer = new THREE.Group(); sw.add(steer);
		if (!bike) {
			var roofF = sh.roof.reduce(function (b, p) { return p[0] > b[0] ? p : b; }, sh.roof[0] || [0.5, e[1] + 0.2]);
			var fwd = sh.pts.filter(function (p) { return p[0] > roofF[0] + 0.05 && p[1] < roofF[1] - 0.05; }).sort(function (a, b) { return a[0] - b[0]; });
			var cowl = fwd[0] || [roofF[0] + 0.8, roofF[1] - 0.5], hw = w / 2 - 0.1;
			e[0] = Math.min(e[0], cowl[0] - 0.75); /* sit far enough behind the windshield base for a dash (the muscle car's cabin is set back) */
			/* A-pillars, roof header, liner, glass, mirror */
			[-hw, hw].forEach(function (z) { bar(ck.glass, cowl, roofF, z, 0.07, 0.1, trim); });
			box(ck.glass, 0.16, 0.09, w - 0.14, roofF[0] - 0.06, roofF[1] - 0.07, 0, trim);
			box(ck.glass, Math.max(0.2, roofF[0] - e[0] + 0.5), 0.02, w - 0.16, (roofF[0] - 0.1 + e[0] - 0.6) / 2, roofF[1] - 0.1, 0, new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.95 }));
			var gl = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(roofF[0] - cowl[0], roofF[1] - cowl[1]), w - 0.22), new THREE.MeshPhysicalMaterial({ color: 0xa8cbe6, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }));
			gl.position.set((roofF[0] + cowl[0]) / 2, (roofF[1] + cowl[1]) / 2, 0); gl.rotation.set(Math.PI / 2, 0, Math.atan2(roofF[1] - cowl[1], roofF[0] - cowl[0]), "ZXY"); ck.glass.add(gl);
			var mir = box(ck.glass, 0.04, 0.07, 0.24, roofF[0] - 0.12, roofF[1] - 0.17, -0.04, dark); box(mir, 0.005, 0.055, 0.22, -0.023, 0, 0, chrome);
			box(ck.glass, 0.02, 0.1, 0.02, roofF[0] - 0.1, roofF[1] - 0.11, -0.04, dark);
			/* dashboard + door sills */
			var dTop = e[1] - 0.3, xd = Math.max(e[0] + 0.45, Math.min(e[0] + 0.6, cowl[0] - 0.1)); /* placed from the eye so the gauge and wheel sit in view in every body */
			bar(ck.full, [xd, dTop], [cowl[0] + 0.08, cowl[1] + 0.012], 0, 0.07, w - 0.12, dark); /* dash top runs into the base of the windshield, so no road shows between dash and bonnet */
			box(ck.full, 0.1, 0.4, w - 0.12, xd, dTop - 0.2, 0, trim);
			box(ck.full, 0.2, 0.035, 0.44, xd - 0.06, dTop + 0.075, e[2], dark); box(ck.full, 0.1, 0.13, 0.44, xd - 0.03, dTop, e[2], dark); /* cluster hood + back */
			var cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), gaugeM); cl.position.set(xd - 0.09, dTop - 0.005, e[2]); cl.rotation.set(0, -Math.PI / 2, 0); cl.rotateX(-0.25); ck.full.add(cl);
			box(ck.full, 0.04, 0.12, 0.26, xd - 0.04, dTop - 0.1, 0.12, trim); /* centre vents */
			[-1, 1].forEach(function (sd) { box(ck.full, Math.max(0.3, cowl[0] - e[0] + 0.6), 0.08, 0.1, (cowl[0] + e[0] - 0.6) / 2, dTop + 0.03, sd * (w / 2 - 0.07), trim); });
			/* steering wheel */
			var R = 0.2, rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 10, 40), dark); steer.add(rim);
			[[0, 0], [Math.PI, 0], [-Math.PI / 2, 0]].forEach(function (a) { var sp = new THREE.Mesh(new THREE.BoxGeometry(R, 0.03, 0.015), trim); sp.position.set(Math.cos(a[0]) * R / 2, Math.sin(a[0]) * R / 2, 0); sp.rotation.z = a[0]; steer.add(sp); });
			var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 20), trim); hub.rotation.x = Math.PI / 2; steer.add(hub);
			var badge = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(paint.color), metalness: 0.6, roughness: 0.3 })); badge.position.z = 0.027; steer.add(badge);
			steer.rotation.y = -Math.PI / 2;
			var col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.42, 12), trim); col.rotation.z = -Math.PI / 2; col.position.x = 0.21; sw.add(col);
			sw.position.set(Math.max(e[0] + 0.32, xd - 0.2), e[1] - 0.52, e[2]); sw.rotation.z = -0.45; ck.full.add(sw);
		} else {
			/* handlebars with grips, risers, a small gauge pod */
			var hbx = e[0] + 0.5, hby = e[1] - 0.44;
			var hb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.72, 10), chrome); hb.rotation.x = Math.PI / 2; steer.add(hb);
			[-1, 1].forEach(function (sd) { var gr = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 10), dark); gr.rotation.x = Math.PI / 2; gr.position.z = sd * 0.31; steer.add(gr); var rs = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8), chrome); rs.position.set(0.02, -0.06, sd * 0.1); steer.add(rs); });
			var pod = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), gaugeM); pod.position.set(0.07, 0.04, 0); pod.rotation.set(0, -Math.PI / 2, 0); pod.rotateX(-0.6); steer.add(pod);
			box(steer, 0.04, 0.11, 0.21, 0.1, 0.022, 0, dark).rotation.z = -0.6;
			sw.position.set(hbx, hby, 0); ck.full.add(sw);
		}
	};
	View.prototype.paintGauge = function (sp, g, mph) {
		var ck = this.ck, v = Math.round(sp * (mph ? 2.236936 : 3.6)), gg = Math.round(g * 10) / 10, key = v + "|" + gg + "|" + mph; if (key === ck.last) return; ck.last = key;
		var c = ck.cv.getContext("2d"), max = mph ? 200 : 320; c.fillStyle = "#07090f"; c.fillRect(0, 0, 256, 128);
		c.lineWidth = 9; c.lineCap = "round"; c.strokeStyle = "#232838"; c.beginPath(); c.arc(70, 72, 48, Math.PI * 0.75, Math.PI * 2.25); c.stroke();
		var f = Math.min(1, v / max); c.strokeStyle = f > 0.8 ? "#ff4d5e" : "#ff9f43"; c.beginPath(); c.arc(70, 72, 48, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * f)); c.stroke();
		c.fillStyle = "#fff"; c.textAlign = "center"; c.font = "bold 34px system-ui,sans-serif"; c.fillText(String(v), 70, 82); c.font = "13px system-ui,sans-serif"; c.fillStyle = "#9aa3b8"; c.fillText(mph ? "mph" : "km/h", 70, 104);
		c.textAlign = "left"; c.font = "12px system-ui,sans-serif"; c.fillText("FELT", 150, 40); c.font = "bold 30px system-ui,sans-serif"; c.fillStyle = gg >= 6 ? "#ff4d5e" : gg >= 3 ? "#ffd166" : "#7ee0a1"; c.fillText(gg.toFixed(1) + " g", 150, 74);
		ck.tex.needsUpdate = true;
	};

	/* one frame: car pose from the physics state, camera, shadows follow the car */
	View.prototype.draw = function (st, o) {
		this.last = [st, o]; if (!this.co) return; var sim = o.sim, veh = this.veh, mode = this.mode = o.cam;
		var cs = Math.cos(st.th), sn = Math.sin(st.th);
		this.carG.position.set(0, 0, 0); this.body.position.set(st.x, st.y, 0); this.body.rotation.set(0, 0, st.th);
		for (var i = 0; i < 2; i++) { var A = sim.ax[i], by = A.ya - (A.L0 - (st.comp[i] || 0)), wxp = st.x + A.bx * cs - by * sn, wyp = st.y + A.bx * sn + by * cs; this.wheels[i].position.set(wxp, wyp, 0); this.wheels[i].rotation.set(0, 0, st.th + st.ang[i]); }
		/* trail */
		var tr = o.track || [], arr = this.trailGeo.attributes.position.array, n = 0;
		for (var k = 0; k < tr.length && n < 4000; k += 2) { if (tr[k][10] > 0 && tr[Math.min(tr.length - 1, k + 2)][10] > 0) continue; arr[n * 3] = tr[k][1]; arr[n * 3 + 1] = tr[k][2]; arr[n * 3 + 2] = 0; n++; }
		this.trailGeo.attributes.position.needsUpdate = true; this.trailGeo.setDrawRange(0, n);
		if (this.water) this.water.position.y = this.co.water.y + Math.sin(st.t * 2) * 0.03;
		/* camera */
		var car = new THREE.Vector3(st.x, st.y, 0), pos = new THREE.Vector3(), look = new THREE.Vector3(), air = st.state === "air" || (sim.ev.takeoff && !sim.ev.land && st.x > this.co.lip.x);
		var m = mode, ckMode = o.cockpit || "full", ckOn = m === "driver" && ckMode !== "off", ck = this.ck;
		if (ck) { ck.g.visible = ckOn; ck.full.visible = ckMode === "full"; if (ckOn && ckMode === "full") { this.paintGauge(st.sp || 0, st.g == null ? 1 : st.g, !!o.mph); ck.steer.rotation.x = Math.max(-0.25, Math.min(0.25, ((st.g || 1) - 1.5) * 0.02)) * Math.sin(st.t * 38); } }
		var fov = ckOn ? 70 : 55; if (m === "driver" && this.free.on) fov = Math.max(36, Math.min(108, fov * this.free.zoom)); if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
		if (m === "auto") m = air ? "auto-air" : sim.ev.land && st.state !== "approach" ? "chase" : "chase";
		if (m === "chase") { pos.set(st.x - 9 - veh.len, st.y + 3.2 + veh.ht * 0.6, 5.5); look.set(st.x + 8, st.y + 0.6, 0); }
		else if (m === "auto-air") { var a = 0.9 + Math.min(1.2, (st.t - (sim.ev.takeoff ? sim.ev.takeoff.t : st.t)) * 0.35); pos.set(st.x - Math.cos(a) * 16, st.y + 3.5, Math.sin(a) * 16 + 2); look.set(st.x + 4, st.y, 0); }
		else if (m === "side") { pos.set(st.x + 3, st.y + 2.5, 24); look.set(st.x + 3, st.y + 0.5, 0); }
		else if (m === "driver") { var hx = ck && ck.eye ? ck.eye[0] : veh.bike ? 0.1 : 0.2, hy = veh.ht - veh.hcg - (veh.bike ? -0.05 : 0.22), dn = ckOn ? 0.17 : 0; pos.set(st.x + hx * cs - hy * sn, st.y + hx * sn + hy * cs, veh.bike ? 0 : -0.35); look.set(pos.x + 20 * Math.cos(st.th - dn), pos.y + 20 * Math.sin(st.th - dn), pos.z); }
		else if (m === "landing") { var lz = this.co.zone[0] + 6, gy = window.MESGTA.groundAt(this.co, lz).y; pos.set(lz, Math.max(gy, 0) + 2.2, 13); look.copy(car); }
		else { var ob = this.orb; pos.set(st.x + Math.cos(ob.yaw) * Math.cos(ob.pitch) * ob.dist, st.y + Math.sin(ob.pitch) * ob.dist + 0.5, Math.sin(ob.yaw) * Math.cos(ob.pitch) * ob.dist); look.copy(car); }
		if (o.snap || m === "driver" || m === "orbit") { this.camPos.copy(pos); this.camLook.copy(look); }
		else { this.camPos.lerp(pos, 0.12); this.camLook.lerp(look, 0.2); }
		var cp = this.camPos.clone(), cl = this.camLook.clone(), f = this.free;
		if (f.on && m !== "orbit") {
			if (m === "driver") { /* turn the head: rotate the look point around the eye */
				var v0 = cl.clone().sub(cp), hz = Math.hypot(v0.x, v0.z), yw = Math.atan2(v0.z, v0.x) + f.yaw, pt = Math.atan2(v0.y, hz) + f.pitch, L0 = v0.length();
				cl.set(cp.x + Math.cos(yw) * Math.cos(pt) * L0, cp.y + Math.sin(pt) * L0, cp.z + Math.sin(yw) * Math.cos(pt) * L0);
			} else { /* swing the camera around the point it looks at */
				var v = cp.clone().sub(cl), r = v.length() * f.zoom, h0 = Math.hypot(v.x, v.z), yaw = Math.atan2(v.z, v.x) + f.yaw, pitch = Math.max(-0.05, Math.min(1.5, Math.atan2(v.y, h0) + f.pitch));
				cp.set(cl.x + Math.cos(yaw) * Math.cos(pitch) * r, cl.y + Math.sin(pitch) * r, cl.z + Math.sin(yaw) * Math.cos(pitch) * r);
			}
		}
		this.camera.position.copy(cp); this.camera.lookAt(cl);
		this.sky.position.copy(this.camera.position);
		this.sun.position.set(this.camera.position.x + 900, 120, this.camera.position.z - 500);
		this.light.position.set(st.x + 60, st.y + 70, st.z || 40); this.light.target.position.set(st.x, st.y, 0); this.light.target.updateMatrixWorld();
		this.renderer.render(this.scene, this.camera);
	};

	window.GJ3D = { create: create, load: load };
})();

/* MES Stunt Jump Simulator: page UI (physics in lib.js = MESGTA, 3D renderer in sim3d.js = GJ3D). Runs only on #gt[data-page="jump"].
   Layout: #gj-app holds the stage + readouts + the options drawer. Fill window = .is-fill (fixed, z-index max, ads hidden), native full screen
   adds .is-fs; in both the options card (#gj-panel) moves into the drawer and the readouts float over the bottom of the picture.
   In the picture: a quick bar (vehicle, speed, handles on/off) and, in 2D while stopped, drag handles on the ramps (height, angle, gap,
   landing height / slope, platform length, drop into the gap).
   State: localStorage "mes-gta-stunt:v1"; links ?v=&k=&m=&r=&a=&h=&gp=&pd=&pt=&l=&la=&lh=&pl=&gr=&ac=&u=&view= */
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
	function r1(x) { return Math.round(x * 10) / 10; }
	function dark() { return document.body.classList.contains("dark-mode"); }
	var touchDev = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

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
		view: pick("view", "2d") === "3d" ? "3d" : "2d", cam2: sv.cam2 || "auto", cam3: sv.cam3 || "auto", ck: sv.ck || "full", slow: num(sv.slow, 1), color: sv.color || "", pre: fromLink ? "" : (sv.pre || P0.id),
		stats: sv.stats !== false, edit: sv.edit !== false
	};
	if (!M.VEHICLES.some(function (v) { return v.id === S.v; })) S.v = P0.veh;
	if (!/^(none|straight|curved)$/.test(S.r)) S.r = "straight"; if (!/^(ramp|platform|flat)$/.test(S.l)) S.l = "ramp"; if (!/^(earth|moon|mars|jupiter)$/.test(S.gr)) S.gr = "earth";
	if (!/^(auto|whole|follow)$/.test(S.cam2)) S.cam2 = "auto"; if (!/^(auto|chase|side|orbit|landing|driver)$/.test(S.cam3)) S.cam3 = "auto"; if (!/^(full|glass|off)$/.test(S.ck)) S.ck = "full";
	var GRAV = { earth: [9.80665, 1.2, "Earth"], moon: [1.62, 0, "Moon (no air)"], mars: [3.71, 0.02, "Mars"], jupiter: [24.79, 0.16, "Jupiter (if it had a floor)"] };
	function save() { var o = {}; "v k m r a h gp pd pt l la lh pl gr ac u view cam2 cam3 ck slow color pre stats edit".split(" ").forEach(function (k) { o[k] = S[k]; }); o.drawer = sv.drawer; sset(o); }
	function courseOpts() { return { ramp: S.r, angle: S.a, height: S.h, gap: S.gp, pit: S.pd, pitType: S.pt, land: S.l, landAngle: S.la, landHeight: S.lh, plat: S.pl }; }

	/* ---------------- units ---------------- */
	function spd(ms, d) { return S.u === "i" ? (ms / 0.44704).toFixed(d == null ? 0 : d) + " mph" : (ms * 3.6).toFixed(d == null ? 0 : d) + " km/h"; }
	function len(m, d) { if (!isFinite(m)) return "–"; return S.u === "i" ? (m / 0.3048).toFixed(d == null ? 0 : d) + " ft" : m.toFixed(d == null ? 1 : d) + " m"; }
	function kmhToUnit(k) { return S.u === "i" ? k / 1.609344 : k; }
	function unitToKmh(x) { return S.u === "i" ? x * 1.609344 : x; }

	/* ---------------- controls ---------------- */
	var vehSel = $("gj-veh"), qveh = $("gj-qveh");
	M.VEHICLES.forEach(function (v) { [vehSel, qveh].forEach(function (sel) { var o = document.createElement("option"); o.value = v.id; o.textContent = v.name; sel.appendChild(o); }); });
	["gj-pre", "gj-pre2"].forEach(function (id) { var box = $(id); M.PRESETS.forEach(function (p) { var b = document.createElement("button"); b.type = "button"; b.className = "gj-chip"; b.textContent = p.name; b.setAttribute("data-pre", p.id); b.title = p.note; box.appendChild(b); }); });
	function topSpeed(v, g, rho) { var lo = 1, hi = 150; for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2, need = 0.5 * rho * v.cda * mid * mid * mid + 0.013 * v.m * g * mid; if (need < v.P * 1000) lo = mid; else hi = mid; } return lo; }
	function seg(id, key, after) {
		var box = $(id); if (!box) return;
		box.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; if (S[key] === b.getAttribute("data-v")) return; S[key] = b.getAttribute("data-v"); paintSeg(); if (key !== "u" && key !== "view") S.pre = ""; after && after(); if (key !== "view") changed(); else save(); });
	}
	function paintSeg() {
		[["gj-mode", "m"], ["gj-ramp", "r"], ["gj-land", "l"], ["gj-units", "u"], ["gj-view", "view"]].forEach(function (p) {
			var box = $(p[0]); if (!box) return; Array.prototype.forEach.call(box.querySelectorAll("button[data-v]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === S[p[1]] ? "true" : "false"); });
		});
	}
	var PAIRS = [
		["gj-spd", "k", 10, 260, 1, "spd"], ["gj-a", "a", 0, 50, 1, "deg"], ["gj-h", "h", 0.3, 15, 0.1, "len"], ["gj-gp", "gp", 0, 120, 0.5, "len"],
		["gj-pd", "pd", 0, 60, 0.5, "len"], ["gj-la", "la", 5, 50, 1, "deg"], ["gj-lh", "lh", -20, 20, 0.1, "len"], ["gj-pl", "pl", 3, 80, 0.5, "len"]
	];
	function toShown(kind, x) { return kind === "spd" ? kmhToUnit(x) : kind === "len" && S.u === "i" ? x / 0.3048 : x; }
	function fromShown(kind, x) { return kind === "spd" ? unitToKmh(x) : kind === "len" && S.u === "i" ? x * 0.3048 : x; }
	function unitLabel(kind) { return kind === "spd" ? (S.u === "i" ? "mph" : "km/h") : kind === "deg" ? "°" : S.u === "i" ? "ft" : "m"; }
	function fmtIn(kind, x) { return kind === "deg" || kind === "spd" ? Math.round(x) : Math.round(x * 10) / 10; }
	PAIRS.forEach(function (p) {
		var r = $(p[0] + "-r"), n = $(p[0] + "-n"); if (!r || !n) return;
		r.addEventListener("input", function () { S[p[1]] = fromShown(p[5], +r.value); n.value = fmtIn(p[5], +r.value); S.pre = ""; changed(true); });
		r.addEventListener("change", function () { changed(); });
		n.addEventListener("change", function () { var x = num(n.value, NaN); if (!isFinite(x)) { paintInputs(); return; } S[p[1]] = clamp(fromShown(p[5], x), p[2], p[3] * (p[5] === "spd" ? 1.6 : 1)); S.pre = ""; paintInputs(); changed(); });
	});
	function paintInputs() {
		vehSel.value = S.v;
		PAIRS.forEach(function (p) {
			var r = $(p[0] + "-r"), n = $(p[0] + "-n"), u = $(p[0] + "-u"); if (!r || !n) return;
			var lo = toShown(p[5], p[2]), hi = toShown(p[5], p[3]); r.min = lo; r.max = hi; r.step = p[5] === "len" && S.u === "i" ? 0.5 : p[4];
			var sh = toShown(p[5], S[p[1]]); r.value = clamp(sh, lo, hi); if (document.activeElement !== n) n.value = fmtIn(p[5], sh); if (u) u.textContent = unitLabel(p[5]);
		});
		$("gj-pt").value = S.pt; $("gj-gr").value = S.gr; $("gj-ac").checked = S.ac; $("gj-slow").value = String(S.slow);
		$("gj-rampf").hidden = S.r === "none"; $("gj-landf").hidden = S.l === "flat"; $("gj-laf").hidden = S.l !== "ramp"; $("gj-plf").hidden = S.l !== "platform";
		$("gj-ptf").hidden = S.pd <= 0;
		$("gj-spdl").textContent = S.m === "drive" ? "Speed (Drive mode: you hold the gas instead)" : "Speed at the ramp";
		$("gj-spdf").classList.toggle("gj-dim", S.m === "drive");
		var v = M.vehicle(S.v), gg = GRAV[S.gr];
		$("gj-vinfo").textContent = v.m.toLocaleString() + " kg · " + v.P + " kW · wheelbase " + len(v.wb, 2) + " · suspension travel " + (S.u === "i" ? (v.trav / 0.0254).toFixed(1) + " in" : Math.round(v.trav * 100) + " cm") + " · top speed about " + spd(topSpeed(v, gg[0], gg[1] || 0.0001));
		Array.prototype.forEach.call(document.querySelectorAll("#gj-pre [data-pre], #gj-pre2 [data-pre]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-pre") === S.pre ? "true" : "false"); });
		paintSeg(); paintCamSel(); paintQuick();
	}
	/* quick bar in the picture: vehicle, speed, handles */
	function paintQuick() {
		qveh.value = S.v; var r = $("gj-qspd"); r.min = Math.round(kmhToUnit(10)); r.max = Math.round(kmhToUnit(260)); if (!qDragging) r.value = Math.round(kmhToUnit(S.k));
		$("gj-qspdv").textContent = S.m === "drive" ? "you drive" : spd(S.k / 3.6); $("gj-qspdf").classList.toggle("gj-dim", S.m === "drive"); r.disabled = S.m === "drive";
		$("gj-edit").setAttribute("aria-pressed", S.edit ? "true" : "false"); $("gj-edit").hidden = S.view !== "2d";
	}
	var qDragging = false;
	function setVehicle(id) { S.v = id; S.pre = ""; S.color = ""; $("gj-col").value = M.vehicle(S.v).color; changed(); }
	qveh.addEventListener("change", function () { setVehicle(qveh.value); });
	function cycleVeh(d) { var i = M.VEHICLES.findIndex(function (v) { return v.id === S.v; }); setVehicle(M.VEHICLES[(i + d + M.VEHICLES.length) % M.VEHICLES.length].id); toast(M.vehicle(S.v).name); }
	$("gj-qprev").addEventListener("click", function () { cycleVeh(-1); }); $("gj-qnext").addEventListener("click", function () { cycleVeh(1); });
	$("gj-qspd").addEventListener("input", function (e) { qDragging = true; S.k = unitToKmh(+e.target.value); S.pre = ""; changed(true); });
	$("gj-qspd").addEventListener("change", function () { qDragging = false; changed(); });
	$("gj-edit").addEventListener("click", function () { S.edit = !S.edit; save(); paintQuick(); frame(); toast(S.edit ? "Drag the white handles on the ramps to reshape the jump." : "Handles hidden."); });
	var CAMS = { "2d": [["auto", "Auto cam"], ["whole", "Whole jump"], ["follow", "Follow"]], "3d": [["auto", "Auto cam"], ["chase", "Chase"], ["side", "Side"], ["driver", "Driver's seat"], ["landing", "Landing"], ["orbit", "Orbit (drag)"]] };
	function paintCamSel() {
		var sel = $("gj-camsel"), list = CAMS[S.view], cur = S.view === "3d" ? S.cam3 : S.cam2;
		if (sel.getAttribute("data-for") !== S.view) { sel.innerHTML = list.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + "</option>"; }).join(""); sel.setAttribute("data-for", S.view); }
		sel.value = cur;
		var ckSel = $("gj-ck"); if (ckSel) { ckSel.value = S.ck; ckSel.parentNode.hidden = !(S.view === "3d" && S.cam3 === "driver"); ckSel.options[0].textContent = veh && veh.bike ? "Handlebars + gauge" : "Wheel + dashboard"; ckSel.options[1].textContent = "Windshield only"; ckSel.options[1].hidden = ckSel.options[1].disabled = !!(veh && veh.bike); if (veh && veh.bike && S.ck === "glass") ckSel.value = "off"; }
		var cr = $("gj-camreset"); if (cr) cr.hidden = !(S.view === "3d" && r3 && r3.free.on && S.cam3 !== "orbit");
	}
	$("gj-camsel").addEventListener("change", function (e) { if (S.view === "3d") { S.cam3 = e.target.value; if (r3) r3.resetFree(); } else S.cam2 = e.target.value; save(); paintCamSel(); camSnap = true; frame(); });
	$("gj-ck").addEventListener("change", function (e) { S.ck = e.target.value; save(); frame(); });
	seg("gj-mode", "m", function () { reset(); }); seg("gj-ramp", "r"); seg("gj-land", "l");
	seg("gj-units", "u", function () { paintInputs(); paintRuns(); paintRo(); drawCharts(); paintSweep(); drawSweep(); });
	seg("gj-view", "view", function () { setView(); });
	vehSel.addEventListener("change", function () { setVehicle(vehSel.value); });
	$("gj-pt").addEventListener("change", function (e) { S.pt = e.target.value; S.pre = ""; changed(); });
	$("gj-gr").addEventListener("change", function (e) { S.gr = e.target.value; S.pre = ""; changed(); });
	$("gj-ac").addEventListener("change", function (e) { S.ac = e.target.checked; changed(); });
	$("gj-slow").addEventListener("change", function (e) { S.slow = +e.target.value; save(); });
	function onPreset(e) {
		var b = e.target.closest("button[data-pre]"); if (!b) return; var p = M.PRESETS.filter(function (x) { return x.id === b.getAttribute("data-pre"); })[0]; if (!p) return;
		loadPreset(p); S.color = ""; $("gj-col").value = M.vehicle(S.v).color; paintInputs(); changed(); toast(p.note); if (isFill() && narrow()) openDrawer(false); go();
	}
	$("gj-pre").addEventListener("click", onPreset); $("gj-pre2").addEventListener("click", onPreset);
	function loadPreset(p) {
		var c = p.c; S.pre = p.id; S.v = p.veh; S.k = p.kmh; S.m = "auto"; S.r = c.ramp; S.a = c.angle || 0; S.h = c.height || 0; S.gp = c.gap || 0; S.pd = c.pit || 0; S.pt = c.pitType || "ground"; S.l = c.land; S.la = c.landAngle || 25; S.lh = c.landHeight != null ? c.landHeight : 3; S.pl = c.plat || 12; S.gr = "earth";
	}
	var tTimer = 0;
	function toast(msg) { var t = $("gj-toast"); if (!t || !msg) return; t.textContent = msg; t.classList.add("is-on"); clearTimeout(tTimer); tTimer = setTimeout(function () { t.classList.remove("is-on"); }, 4200); }

	/* ---------------- simulation ---------------- */
	var co, veh, sim = null, running = false, acc = 0, lastT = 0, replay = null, runs = [], best = null, ghost = null, sweepData = null;
	try { runs = JSON.parse(localStorage.getItem(KEY + ":runs") || "[]") || []; } catch (e) { runs = []; }
	function simOpts() { var gg = GRAV[S.gr]; return { mode: S.m, kmh: S.k, g: gg[0], rho: gg[1], airControl: S.ac, approach: 140 }; }
	function rebuild() { co = M.buildCourse(courseOpts()); veh = M.vehicle(S.v); if (r3) r3.setScene(co, veh, S.color || veh.color, GRAV[S.gr]); paintCamSel(); }
	function reset() { cancelAnimationFrame(replayTimer); rebuild(); sim = new M.Sim(co, veh, simOpts()); running = false; replay = null; acc = 0; $("gj-verdict").hidden = true; scrubSetup(); paintRun(); camSnap = true; paintRo(); frame(); }
	/* the centre tip shows until the first run (or ×), separately for Go and Drive-it-yourself; remembered */
	var hintSeen = {}; try { hintSeen = JSON.parse(localStorage.getItem(KEY + ":hints") || "{}") || {}; } catch (e) { hintSeen = {}; }
	function hintKey() { return S.m === "drive" ? "d" : "g"; }
	function hintDone() { if (hintSeen[hintKey()]) return; hintSeen[hintKey()] = 1; try { localStorage.setItem(KEY + ":hints", JSON.stringify(hintSeen)); } catch (e) { /* private mode */ } }
	function go() { hintDone();
		if (running) { running = false; paintRun(); return; }
		if (!sim || sim.done || replay) reset();
		if (touchDev && window.innerHeight < 520 && !isFill()) enterFill(); /* a phone held sideways: play in the whole window */
		replay = null; running = true; lastT = 0; paintRun(); try { cv.focus({ preventScroll: true }); } catch (e) { /* old browser */ } requestAnimationFrame(loop);
	}
	function changed(live) {
		save(); paintInputs(); sweepData = null; paintSweep();
		if (!running) { rebuild(); sim = new M.Sim(co, veh, simOpts()); replay = null; $("gj-verdict").hidden = true; scrubSetup(); if (!drag) camSnap = true; frame(); paintRo(); paintRun(); }
		if (!live) history.replaceState(null, "", writeUrl());
	}
	function writeUrl() {
		var p = new URLSearchParams(); p.set("v", S.v); p.set("k", Math.round(S.k)); if (S.m === "drive") p.set("m", "drive");
		p.set("r", S.r); if (S.r !== "none") { p.set("a", S.a); p.set("h", +S.h.toFixed(2)); } p.set("gp", +S.gp.toFixed(2));
		if (S.pd > 0) { p.set("pd", +S.pd.toFixed(2)); if (S.pt === "water") p.set("pt", "water"); }
		p.set("l", S.l); if (S.l !== "flat") p.set("lh", +S.lh.toFixed(2)); if (S.l === "ramp") p.set("la", S.la); if (S.l === "platform") p.set("pl", +S.pl.toFixed(2));
		if (S.gr !== "earth") p.set("gr", S.gr); if (S.ac) p.set("ac", "1"); if (S.view === "3d") p.set("view", "3d");
		return location.pathname + "?" + p.toString();
	}

	/* ---------------- loop ---------------- */
	var keys = { gas: 0, brake: 0, tl: 0, tr: 0 }, touch = { gas: 0, brake: 0, tl: 0, tr: 0 };
	function loop(ts) {
		if (!running) return;
		requestAnimationFrame(loop);
		if (!lastT) { lastT = ts; return; }
		var real = Math.min(0.05, (ts - lastT) / 1000); lastT = ts; acc += real * S.slow;
		var inp = sim.input; inp.gas = Math.max(keys.gas, touch.gas); inp.brake = Math.max(keys.brake, touch.brake); inp.tilt = (Math.max(keys.tl, touch.tl) - Math.max(keys.tr, touch.tr));
		var n = 0; while (acc >= DT && n < 600 && !sim.done) { sim.step(DT); acc -= DT; n++; }
		if (sim.done) { running = false; finished(); }
		frame(); paintRo(); paintTouch();
	}
	function finished() {
		var r = sim.result; paintRun();
		var rec = { n: runs.length ? runs[runs.length - 1].n + 1 : 1, v: veh.name, k: S.k, code: r.code, title: r.title, to: r.takeoff ? r.takeoff.v : 0, ang: r.takeoff ? r.takeoff.ang / RAD : 0, air: r.air, dist: r.dist, h: r.maxH, g: r.landG, rot: r.rot / RAD, ok: r.ok };
		if (r.takeoff) { runs.push(rec); if (runs.length > 30) runs.shift(); try { localStorage.setItem(KEY + ":runs", JSON.stringify(runs)); } catch (e) { /* full */ } }
		if (r.ok && r.takeoff && (!best || r.landG < best.g || (best.code !== "clean" && r.code === "clean"))) { best = { g: r.landG, code: r.code }; ghost = { track: sim.track.slice(), key: courseKey() }; }
		showVerdict(r); paintRuns(); drawCharts(); scrubSetup(); paintTouch(); frame();
	}
	function courseKey() { return JSON.stringify(courseOpts()) + S.v; }

	/* ---------------- verdict + readouts ---------------- */
	var VER = { clean: ["good", "🏆"], hard: ["warn", "💥"], brutal: ["bad", "🚑"], crash: ["bad", "💀"], short: ["bad", "⬇"], splash: ["bad", "🌊"], fell: ["bad", "⬇"], nojump: ["warn", "…"] };
	var verdictTimer = 0;
	function showVerdict(r) {
		var box = $("gj-verdict"), v = VER[r.code] || ["warn", ""];
		box.className = "gj-verdict gj-verdict--" + v[0]; box.hidden = false;
		var tip = advice(r);
		box.innerHTML = "<b>" + v[1] + " " + esc(r.title) + "</b><span>" + esc(r.detail || "") + "</span>" + (tip ? "<em>" + esc(tip) + "</em>" : "") + '<button type="button" class="gj-vx" aria-label="Close">✕</button>';
		$("gj-badge").textContent = r.title;
		clearTimeout(verdictTimer); verdictTimer = setTimeout(function () { box.classList.add("gj-verdict--small"); }, 4500);
	}
	$("gj-verdict").addEventListener("click", function (e) { if (e.target.closest(".gj-vx")) this.hidden = true; else this.classList.toggle("gj-verdict--small"); });
	function advice(r) {
		if (r.code === "nojump") return S.m === "drive" ? "Hold Gas (↑) all the way up the ramp." : "Give it more speed.";
		if (r.code === "short" || r.code === "splash" || r.code === "fell") return "More speed, or a steeper or higher takeoff ramp. “Find the right speed” below shows the window.";
		if (r.code === "crash" && Math.abs(r.rot) > 60 * RAD) return r.rot < 0 ? "It nose-dived. Hold Gas (↑) in the air to lift the nose: the spinning wheels turn the car the other way." : "It rotated backwards. Brake (↓) in the air drops the nose; a straight ramp helps too.";
		if (r.over) return "It flew past the landing. Try a little less speed.";
		if (r.code === "brutal" || r.code === "hard") return co.landKind === "ramp" ? "Land on the down slope, not the flat after it: the slope turns the fall into rolling." : "Landing on flat ground is always hard. Add a landing ramp.";
		return "";
	}
	function ro(label, val, sub, cls) { return '<div class="gj-ro' + (cls ? " gj-ro--" + cls : "") + '"><span>' + label + "</span><b>" + val + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; }
	function paintRo() {
		if (!sim) return; var e = sim.ev, to = e.takeoff, r = sim.result, sp = Math.hypot(sim.vx, sim.vy), h = [];
		var air = sim.state === "air" ? sim.t - to.t : e.land && e.land.air ? e.land.air : 0;
		h.push(ro("Speed", spd(sp), sim.state === "approach" ? "on the run-up" : sim.state === "air" ? "in the air" : "after landing"));
		h.push(ro("Takeoff", to ? spd(to.v) : "–", to ? "at " + (to.ang / RAD).toFixed(1) + "° up" : "leaves the lip"));
		h.push(ro("Airtime", air ? air.toFixed(2) + " s" : "–", ""));
		h.push(ro("Distance", r && r.takeoff ? len(r.dist) : e.land && e.land.x != null ? len(e.land.x - co.lip.x) : to ? len(sim.x - co.lip.x) : "–", "from the lip"));
		h.push(ro("Height", to ? len(Math.max(0, e.maxH - co.lip.y)) : "–", "above the lip"));
		var lg = r ? r.landG : e.landPeakG; h.push(ro("Landing", lg ? lg.toFixed(1) + " g" : "–", "peak g-force", lg ? (lg < 6 ? "ok" : lg < 12 ? "warn" : "bad") : ""));
		h.push(ro("Rotation", to ? ((sim.th - (sim.th0 != null ? sim.th0 : sim.th)) / RAD).toFixed(0) + "°" : "–", "in the air"));
		$("gj-ro").innerHTML = h.join("");
		$("gj-clock").textContent = "t = " + sim.t.toFixed(2) + " s" + (S.slow !== 1 ? " · " + (S.slow < 1 ? "slow motion " + S.slow + "×" : S.slow + "×") : "");
		if (!r) $("gj-badge").textContent = sim.state === "approach" ? (running ? (S.m === "drive" ? "Driving: hold Gas" : "Run-up…") : "Ready") : sim.state === "air" ? "Airborne " + air.toFixed(1) + " s" : "Touchdown";
		hud(stateNow());
	}
	function paintRun() {
		var b = $("gj-go"); b.textContent = running ? "❚❚ Pause" : sim && sim.done ? "▶︎ Again" : sim && sim.t > 0 ? "▶︎ Resume" : (S.m === "drive" ? "▶︎ Start" : "▶︎ Go");
		var hint = $("gj-hint");
		if (!running && sim && sim.t === 0 && !hintSeen[hintKey()]) {
			hint.hidden = false;
			hint.innerHTML = S.m === "drive" ? "<b>Drive it yourself</b>Hold <kbd>Gas</kbd> or <kbd>↑</kbd> to drive at the ramp. <kbd>↓</kbd> brakes." + (S.ac ? " <kbd>←</kbd> <kbd>→</kbd> tilt in the air." : " In the air, gas lifts the nose and brake drops it.")
				: "<b>Press Go</b>" + (touchDev && window.innerHeight < 520 ? "It opens in the whole window. " : "") + (S.edit && S.view === "2d" ? "Drag the white handles to reshape the ramps." : "Pick an example or open ⚙︎ Options to build your own jump.");
			hint.insertAdjacentHTML("afterbegin", '<button type="button" class="gj-hintx" aria-label="Hide this tip" title="Hide this tip">×</button>');
		} else hint.hidden = true;
		$("gj-quick").classList.toggle("gj-quick--run", running);
		$("gj-replay").hidden = !(sim && sim.done && sim.track.length); /* nothing to replay before a run */
		paintTouch();
	}
	function paintTouch() {
		var show = S.m === "drive" || (running && sim && sim.state === "air" && touchDev);
		$("gj-touch").hidden = !show; $("gj-touch").classList.toggle("gj-touch--tilt", S.ac);
	}

	/* ---------------- fill window / full screen / drawer ---------------- */
	var app = $("gj-app"), drawer = $("gj-drawer"), panel = $("gj-panel"), ph = $("gj-ph");
	function isFill() { return app.classList.contains("is-fill"); }
	function narrow() { return window.innerWidth < 760; }
	function enterFill() {
		if (isFill()) return; app.classList.add("is-fill"); document.documentElement.classList.add("gj-fill-on"); document.body.classList.add("gj-filling");
		$("gj-dbody").appendChild(panel); openDrawer(!narrow() && sv.drawer === true); $("gj-fill").setAttribute("aria-pressed", "true"); $("gj-fill").title = "Back to the page (Esc)"; camSnap = true; setTimeout(size, 30);
		if (window.innerHeight < 500) { S.stats = false; paintStats(); }
	}
	function leaveFill() {
		if (!isFill()) return; if (document.fullscreenElement) { document.exitFullscreen().catch(function () { /* ignore */ }); }
		app.classList.remove("is-fill", "is-fs", "gj-drawer-open"); document.documentElement.classList.remove("gj-fill-on"); document.body.classList.remove("gj-filling");
		ph.parentNode.insertBefore(panel, ph.nextSibling); $("gj-fill").setAttribute("aria-pressed", "false"); $("gj-fill").title = "Fill the browser window (W)"; $("gj-opt").setAttribute("aria-expanded", "false"); S.stats = sv.stats !== false; paintStats(); camSnap = true; setTimeout(size, 30);
	}
	function openDrawer(on) { app.classList.toggle("gj-drawer-open", on); $("gj-opt").setAttribute("aria-expanded", on ? "true" : "false"); setTimeout(size, 260); }
	$("gj-fill").addEventListener("click", function () { if (isFill()) leaveFill(); else enterFill(); });
	$("gj-fs").addEventListener("click", function () {
		if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
		enterFill(); var req = app.requestFullscreen || app.webkitRequestFullscreen;
		if (req) { try { var pr = req.call(app); if (pr && pr.then) pr.then(function () { app.classList.add("is-fs"); if (screen.orientation && screen.orientation.lock && touchDev) screen.orientation.lock("landscape").catch(function () { /* not allowed */ }); size(); }).catch(function () { toast("Full screen is not available here, so the simulator fills the window instead. Turn the phone sideways for more room."); }); else app.classList.add("is-fs"); } catch (e) { /* fill only */ } }
		else toast("This browser has no full screen for web pages, so the simulator fills the window. Turn the phone sideways for more room.");
	});
	function fsChange() { if (!document.fullscreenElement && !document.webkitFullscreenElement) { var was = app.classList.contains("is-fs"); app.classList.remove("is-fs"); if (was) leaveFill(); } setTimeout(size, 50); } /* leaving native full screen (Esc, Back) goes back to the page */
	document.addEventListener("fullscreenchange", fsChange); document.addEventListener("webkitfullscreenchange", fsChange);
	$("gj-opt").addEventListener("click", function () {
		if (isFill()) { var on = !app.classList.contains("gj-drawer-open"); openDrawer(on); sv.drawer = on; save(); }
		else { panel.scrollIntoView({ behavior: "smooth", block: "start" }); }
	});
	$("gj-dclose").addEventListener("click", function () { openDrawer(false); sv.drawer = false; save(); });
	$("gj-statsb").addEventListener("click", function () { S.stats = !S.stats; paintStats(); if (!isFill() || window.innerHeight >= 500) save(); setTimeout(size, 20); });
	function paintStats() { app.classList.toggle("gj-nostats", !S.stats); $("gj-statsb").setAttribute("aria-pressed", S.stats ? "true" : "false"); }
	window.addEventListener("orientationchange", function () { setTimeout(size, 250); });

	/* ---------------- 2D / 3D ---------------- */
	var r3 = null, r3loading = false;
	function setView() {
		paintCamSel(); paintQuick(); var is3 = S.view === "3d";
		$("gj-3d").hidden = !is3; cv.style.visibility = is3 ? "hidden" : "visible";
		if (is3 && !r3 && !r3loading) {
			if (!window.GJ3D) { S.view = "2d"; paintSeg(); setView(); return; }
			r3loading = true; $("gj-load").hidden = false;
			window.GJ3D.create($("gj-3d")).then(function (r) { r3 = r; r3loading = false; r3.onFree = function () { paintCamSel(); }; $("gj-load").hidden = true; r3.setScene(co, veh, S.color || veh.color, GRAV[S.gr]); size(); camSnap = true; frame(); },
				function (err) { r3loading = false; $("gj-load").hidden = true; S.view = "2d"; paintSeg(); setView(); toast("3D could not start here (" + (err && err.message || "no WebGL") + "). Showing 2D."); });
		}
		paintRun(); size(); frame();
	}

	/* ---------------- 2D drawing ---------------- */
	var cv = $("gj-c"), ctx = cv.getContext("2d"), dpr = 1, W = 800, H = 450, cam = { x: 0, y: 3, s: 12 }, camSnap = true, skyline = null, palms = null;
	function size() {
		var stage = $("gj-st"), w, h;
		if (isFill()) { stage.style.height = ""; w = stage.clientWidth || window.innerWidth; h = stage.clientHeight || window.innerHeight; app.style.setProperty("--gj-bh", (document.querySelector(".gj-bar").offsetHeight + 8) + "px"); app.style.setProperty("--gj-ub", ($("gj-ro").offsetHeight + (scrub.parentNode.hidden ? 0 : scrub.parentNode.offsetHeight)) + "px"); }
		else { w = stage.parentNode.clientWidth || 800; h = Math.round(w / (w < 560 ? 1.15 : w < 900 ? 1.5 : 2.0)); h = Math.max(300, Math.min(h, Math.round(window.innerHeight * (w < 560 ? 0.62 : 0.78)))); stage.style.height = h + "px"; }
		dpr = Math.min(2, window.devicePixelRatio || 1); if (W !== w || H !== h) camSnap = true; W = w; H = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
		if (r3) r3.resize(w, h);
		frame();
	}
	function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
	function makeScenery() {
		var r = rng(911), b = [], x = -2000; while (x < 3000) { var w = 12 + r() * 30, h = 15 + Math.pow(r(), 2) * 110; b.push([x, w, h, r() < 0.3]); x += w + r() * 6; } skyline = b;
		var r2 = rng(7), p = []; for (var px = -400; px < 900; px += 9 + r2() * 26) p.push([px, 7 + r2() * 6, r2() * 0.6 - 0.3, r2()]); palms = p;
	}
	function wx(x) { return (x - cam.x) * cam.s + W / 2; }
	function wy(y) { return H / 2 - (y - cam.y) * cam.s; }
	/* how much of the picture the overlays cover at the top and bottom (measured, so the camera keeps the jump clear of them) */
	function overlayPads() {
		var st = $("gj-st").getBoundingClientRect(), top = 46, bot = 8;
		var bar = document.querySelector(".gj-bar"), br = bar && bar.getBoundingClientRect();
		if (br && br.height) { if (br.top - st.top < H * 0.45) top = br.bottom - st.top + 8; else { bot = Math.max(bot, st.bottom - br.top + 8); top = 56; } }
		var q = $("gj-quick"), qr = q && q.getBoundingClientRect();
		if (qr && qr.height && getComputedStyle(q).position !== "static" && qr.top < st.bottom && qr.bottom > st.top) { if (qr.top - st.top < H * 0.45) top = Math.max(top, qr.bottom - st.top + 8); else bot = Math.max(bot, st.bottom - qr.top + 8); }
		var u = document.querySelector(".gj-under"); if (isFill() && u && S.stats) { var ur = $("gj-ro").getBoundingClientRect(); if (ur.height) bot = Math.max(bot, st.bottom - ur.top + 8); }
		if (S.m === "drive") bot = Math.max(bot, 84);
		return [top, bot];
	}
	function topPad() { return overlayPads()[0]; }
	function botPad() { return overlayPads()[1]; }
	function frameBox() {
		var x0 = co.rampStart - 12, x1, top = Math.max(co.lip.y, S.l !== "flat" ? S.lh : 0) + 6, bot = Math.min(co.floor, 0) - 1.5;
		var gg = GRAV[S.gr][0], pr = M.dragFlight(Math.max(5, S.k / 3.6), co.lip.angle / RAD, co.lip.y, 0.5 * (GRAV[S.gr][1]) * veh.cda / veh.m, gg, false);
		x1 = isFinite(co.zone[1]) ? Math.max(co.zone[1], Math.min(pr.x, 400)) + 12 : Math.max(co.gap + 25, Math.min(pr.x, 400) + 20);
		top = Math.max(top, co.lip.y + pr.apex + 4);
		return { x0: x0, x1: x1, top: top, bot: bot };
	}
	function updateCam(pos) {
		if (drag) return; /* keep the picture still while a handle is dragged */
		var tx, ty, ts, fb = frameBox(), mode = S.cam2, span = fb.x1 - fb.x0, avail = H - topPad() - botPad();
		/* the ground sits just above the bottom bars; follow the car up when it climbs */
		function vert(s, carY) { var cy = fb.bot + (H / 2 - botPad()) / s; if (carY != null) cy = Math.max(cy, carY - (H / 2 - topPad() - 30) / s); return cy; }
		var pre = !running && sim && sim.t === 0 && !replay;
		if (pre && S.m !== "drive") { fb.x0 = Math.min(fb.x0, pos.x - 6); fb.x0 -= (fb.x1 - fb.x0) * 0.1; span = fb.x1 - fb.x0; } /* before the run: the whole jump and the car, so the handles can be dragged */
		var farOff = pos.x < fb.x0 + 4 && !(pre && S.m !== "drive");
		if (mode === "whole" && !farOff) { ts = Math.min(W / span, avail / (fb.top - fb.bot)); tx = (fb.x0 + fb.x1) / 2; ty = vert(ts, null); }
		else if (mode === "follow" || farOff) { ts = clamp(Math.min(W / 30, avail / 12), 6, 60); tx = pos.x + W / ts * 0.2; ty = vert(ts, pos.y); }
		else {
			var vw = clamp(span * 0.45, 24, 50); ts = Math.min(W / 22, Math.max(W / vw, avail / (fb.top - fb.bot + 6))); vw = W / ts;
			var lo = fb.x0 + vw / 2, hi = Math.max(lo, fb.x1 - vw / 2); if (pos.x + vw * 0.22 > hi && sim && sim.state === "landed") hi = pos.x + vw * 0.22;
			tx = clamp(pos.x + vw * 0.22, lo, hi); ty = vert(ts, pos.y);
			if (pre) { ts = Math.min(W / span, avail / (fb.top - fb.bot)); tx = (fb.x0 + fb.x1) / 2; ty = vert(ts, null); }
		}
		if (!(ts > 0.5)) ts = 0.5; /* a very short stage (toolbar taller than the picture) would give a negative scale */
		if (camSnap) { cam.x = tx; cam.y = ty; cam.s = ts; camSnap = false; }
		else { var k = 0.1; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.s += (ts - cam.s) * k; }
	}
	function stateNow() {
		if (replay && replay.i != null) { var tr = replay.track[replay.i]; return { x: tr[1], y: tr[2], th: tr[3], sp: tr[4], g: tr[5], comp: [tr[6], tr[7]], ang: [tr[8], tr[9]], t: tr[0], state: "replay" }; }
		return { x: sim.x, y: sim.y, th: sim.th, sp: Math.hypot(sim.vx, sim.vy), g: sim.gNow, comp: [sim.ax[0].comp, sim.ax[1].comp], ang: [sim.ax[0].ang, sim.ax[1].ang], t: sim.t, state: sim.state };
	}
	function frame() {
		if (!co || !sim) return; var st = stateNow();
		if (S.view === "3d" && r3) { r3.draw(st, { sim: sim, co: co, veh: veh, cam: S.cam3, cockpit: S.ck, mph: S.u === "i", snap: camSnap, running: running, track: replay ? replay.track.slice(0, replay.i + 1) : sim.track }); camSnap = false; return; }
		if (!skyline) makeScenery();
		updateCam(st);
		var c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
		var sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#1b1446"); sky.addColorStop(0.45, "#7b2d7a"); sky.addColorStop(0.75, "#ef6a5b"); sky.addColorStop(1, "#ffb46b");
		if (S.gr === "moon") { sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#05060c"); sky.addColorStop(1, "#151827"); }
		else if (S.gr === "mars") { sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#3b2418"); sky.addColorStop(1, "#d08a5a"); }
		c.fillStyle = sky; c.fillRect(0, 0, W, H);
		var hz = wy(0);
		if (S.gr === "earth" || S.gr === "jupiter") {
			var sx = W * 0.72, sy = Math.min(H * 0.62, hz - 20); var sun = c.createRadialGradient(sx, sy, 2, sx, sy, Math.min(W, H) * 0.22); sun.addColorStop(0, "rgba(255,240,200,1)"); sun.addColorStop(0.18, "rgba(255,200,120,0.95)"); sun.addColorStop(1, "rgba(255,140,90,0)");
			c.fillStyle = sun; c.fillRect(0, 0, W, H);
			c.fillStyle = "rgba(46,18,70,0.75)";
			skyline.forEach(function (b) { var X = (b[0] - cam.x * 0.25) * 1.2 + W / 2, bw = b[1] * 1.2, bh = b[2] * 1.2 * (H / 500); if (X + bw < 0 || X > W) return; c.fillRect(X, hz - bh * 0.9 + 6, bw, bh); if (b[3]) c.fillRect(X + bw * 0.45, hz - bh * 0.9 - 14 + 6, 2, 14); });
		} else if (S.gr === "moon") { c.fillStyle = "#c9d3ea"; c.beginPath(); c.arc(W * 0.78, H * 0.2, Math.min(W, H) * 0.06, 0, 7); c.fill(); c.fillStyle = "rgba(255,255,255,0.7)"; var rr = rng(3); for (var i = 0; i < 80; i++) c.fillRect(rr() * W, rr() * H * 0.6, 1.2, 1.2); }
		if (S.gr === "earth") palms.forEach(function (p) { if (inPit(p[0])) return; drawPalm(c, p[0], M.groundAt(co, p[0]).y, p[1], p[2], p[3]); });
		if (co.water) { var w0 = wx(co.water.x0), w1 = wx(co.water.x1), wyy = wy(co.water.y); var wg = c.createLinearGradient(0, wyy, 0, H); wg.addColorStop(0, "#1fa2c7"); wg.addColorStop(1, "#08395a"); c.fillStyle = wg; c.fillRect(w0, wyy, w1 - w0, H - wyy + 2);
			c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5; c.beginPath(); for (var X = w0; X < w1; X += 6) { var Y = wyy + Math.sin(X * 0.08 + st.t * 3) * 1.5; if (X === w0) c.moveTo(X, Y); else c.lineTo(X, Y); } c.stroke(); }
		var pts = co.pts; c.beginPath(); c.moveTo(wx(pts[0][0]), H + 10); pts.forEach(function (p) { c.lineTo(wx(p[0]), wy(p[1])); }); c.lineTo(wx(pts[pts.length - 1][0]), H + 10); c.closePath();
		var gg = c.createLinearGradient(0, hz, 0, H); gg.addColorStop(0, S.gr === "moon" ? "#8b8f98" : S.gr === "mars" ? "#9b5634" : "#3a3346"); gg.addColorStop(1, S.gr === "moon" ? "#4a4d55" : S.gr === "mars" ? "#5a2c18" : "#1e1a26"); c.fillStyle = gg; c.fill();
		drawRamp(c, co.rampStart, 0.001, "#c9853f", "#7a4a1d");
		if (S.l === "ramp") drawRamp(c, co.zone[0] - 0.001, co.zone[1], "#c9853f", "#7a4a1d");
		if (S.l === "platform") drawBlock(c, co.zone[0], co.zone[1], M.groundAt(co, co.zone[0] + 0.01).y);
		c.strokeStyle = S.gr === "earth" ? "#ffcf8a" : "#d5d8de"; c.lineWidth = 2; c.beginPath(); pts.forEach(function (p, i) { var X = wx(p[0]), Y = wy(p[1]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke();
		c.strokeStyle = "rgba(255,230,160,0.45)"; c.lineWidth = 2; for (var dxm = Math.floor((cam.x - W / cam.s) / 6) * 6; dxm < cam.x + W / cam.s; dxm += 6) { if (dxm > co.rampStart - 1) break; c.beginPath(); c.moveTo(wx(dxm), wy(0) + 5); c.lineTo(wx(dxm + 3), wy(0) + 5); c.stroke(); }
		if (co.hasGap && co.zone) { var z0 = co.zone[0], z1 = isFinite(co.zone[1]) ? co.zone[1] : co.zone[0] + 60; c.strokeStyle = "rgba(80,230,140,0.9)"; c.lineWidth = 5; c.beginPath(); var first = true; for (var zx = z0; zx <= z1; zx += 0.5) { var gy = M.groundAt(co, zx).y; if (first) { c.moveTo(wx(zx), wy(gy) - 2); first = false; } else c.lineTo(wx(zx), wy(gy) - 2); } c.stroke(); }
		c.font = "11px system-ui,sans-serif"; c.textAlign = "center"; var step = cam.s > 12 ? 5 : cam.s > 5 ? 10 : 25;
		for (var dm = step; dm < 400; dm += step) { var gx = co.lip.x + dm, X2 = wx(gx); if (X2 < -20 || X2 > W + 20) continue; var gyy = M.groundAt(co, gx).y; c.fillStyle = "rgba(255,255,255,0.75)"; c.fillRect(X2 - 0.5, wy(gyy), 1, 8); c.fillText(S.u === "i" ? Math.round(dm / 0.3048) + " ft" : dm + " m", X2, wy(gyy) + 20); }
		if (sim.state === "approach" && !replay && S.m !== "drive") { var kd = 0.5 * GRAV[S.gr][1] * veh.cda / veh.m, path = M.dragFlight(Math.max(1, S.k / 3.6), co.lip.angle / RAD, co.lip.y - co.floor, kd, GRAV[S.gr][0], true).path;
			c.setLineDash([3, 6]); c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1.5; c.beginPath(); path.forEach(function (p, i) { var X = wx(co.lip.x + p[0]), Y = wy(co.lip.y + p[1] + veh.hcg); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.stroke(); c.setLineDash([]); }
		if (ghost && ghost.key === courseKey()) trail(c, ghost.track, ghost.track.length, "rgba(255,255,255,0.28)");
		var tr = replay ? replay.track : sim.track, upto = replay ? replay.i + 1 : tr.length; trail(c, tr, upto, null);
		var e = sim.ev;
		if (e.takeoff && !replay) mark(c, e.takeoff.x, e.takeoff.y, "takeoff " + spd(e.takeoff.v), "below");
		if (e.apex && e.takeoff && !replay && sim.state !== "approach" && (e.apex.x - e.takeoff.x) * cam.s > 90) mark(c, e.apex.x, e.apex.y, "top: " + len(e.maxH - co.lip.y) + " above the lip", "above");
		if (e.land && e.land.x != null && !replay && sim.result) mark(c, e.land.x, e.land.y, len(sim.result.dist) + " jump", "below");
		drawVehicle(c, st);
		drawHandles(c);
	}
	function inPit(x) { return x > co.rampStart - 2 && x < (isFinite(co.zone[1]) ? co.zone[1] + 3 : co.gap + 3); }
	function drawPalm(c, x, gy, h, lean, ph) {
		var X = wx(x), Y = wy(gy), s = cam.s; if (X < -60 || X > W + 60) return; var tx = X + lean * h * s, ty = Y - h * s;
		c.strokeStyle = "rgba(30,12,40,0.85)"; c.lineWidth = Math.max(1.5, 0.35 * s); c.beginPath(); c.moveTo(X, Y); c.quadraticCurveTo(X + lean * h * s * 0.2, Y - h * s * 0.6, tx, ty); c.stroke();
		c.fillStyle = "rgba(30,12,40,0.85)"; for (var i = 0; i < 7; i++) { var a = -Math.PI + i * Math.PI / 6 + (ph - 0.5) * 0.3, L = (2.6 + (i % 2) * 0.8) * s; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 0.6 * s, tx + Math.cos(a) * L, ty + Math.sin(a) * L * 0.4 + 0.9 * s); c.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 + 0.1 * s, tx, ty); c.fill(); }
	}
	function drawRamp(c, x0, x1, top, side) {
		var pts = co.pts.filter(function (p) { return p[0] >= x0 - 1e-6 && p[0] <= x1 + 1e-6; }); if (pts.length < 2) return;
		var base = 0, bx0 = pts[0][0], bx1 = pts[pts.length - 1][0];
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
	/* AI-made side views (Gemini, 2026-11-11) for the car bodies: mes.fm/gta-stunt-jump-simulator/img/cars/<body>.png, facing +x.
	   [w, h, rear wheel x, front wheel x, wheel centre y, wheel radius] in image pixels; the wheels stay code-drawn (they spin and ride the suspension).
	   A picked colour re-tints the picture ("color" blend keeps its shading). Falls back to the drawn outline until the picture loads. */
	var SPR = {"hatch":[298,109,51,236,84,24],"coupe":[311,98,59.5,248.5,73,24],"super":[320,87,57.5,245,61.5,24.5],"muscle":[319,102,69,256.5,76.5,24.5],"suv":[312,129,68,255.5,103,25],"pickup":[315,138,71.5,259,105,32],"monster":[306,185,65,252,133,51]}, sprImg = {}, sprTint = {};
	function sprite(body) {
		var m = SPR[body]; if (!m) return null; var im = sprImg[body];
		if (!im) { im = sprImg[body] = new Image(); im.onload = function () { if (!running) frame(); }; im.src = "/gta-stunt-jump-simulator/img/cars/" + body + ".png?v=1"; }
		return im.complete && im.naturalWidth ? { m: m, img: im } : null;
	}
	function tinted(body, im, col) {
		if (!col) return im; var key = body + col; if (sprTint[key]) return sprTint[key];
		var cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; var x = cv.getContext("2d");
		x.drawImage(im, 0, 0); x.globalCompositeOperation = "color"; x.fillStyle = col; x.fillRect(0, 0, cv.width, cv.height); x.globalCompositeOperation = "destination-in"; x.drawImage(im, 0, 0);
		return (sprTint[key] = cv);
	}
	function drawSprite(c, st, sp, wheels) {
		var v = veh, m = sp.m, s = cam.s, k = v.wb / (m[3] - m[2]), rs = m[5] * k, dy = rs - v.r, r0 = sim.ax[0].bx;
		var bx0 = r0 - m[2] * k, by0 = v.r - v.hcg + dy + m[4] * k;
		c.save(); c.translate(wx(st.x), wy(st.y)); c.rotate(-st.th);
		c.fillStyle = "#0b0b0e"; [m[2], m[3]].forEach(function (u) { c.beginPath(); c.arc((bx0 + u * k) * s, -(by0 - m[4] * k) * s, rs * 1.03 * s, 0, 7); c.fill(); });
		c.drawImage(tinted(v.body, sp.img, S.color && S.color !== v.color ? S.color : ""), bx0 * s, -by0 * s, m[0] * k * s, m[1] * k * s);
		c.restore();
		var up = [-Math.sin(st.th), Math.cos(st.th)];
		wheels.forEach(function (w) { drawWheel(c, { x: w.x + up[0] * dy, y: w.y + up[1] * dy, ang: w.ang }, rs); });
	}
	function drawVehicle(c, st) {
		var v = veh, sh = sim.shape, col = S.color || v.color, cs = Math.cos(st.th), sn = Math.sin(st.th), dnx = sn, dny = -cs;
		var gy = M.groundAt(co, st.x).y, alt = st.y - gy; if (gy > -1e8) { c.fillStyle = "rgba(0,0,0," + clamp(0.35 - alt * 0.02, 0.05, 0.35) + ")"; c.beginPath(); c.ellipse(wx(st.x), wy(gy) - 1, Math.max(0.1, v.len * 0.5 * cam.s * (1 + alt * 0.03)), Math.max(1.5, 0.18 * cam.s), 0, 0, 7); c.fill(); }
		var wheels = sim.ax.map(function (A, i) { var att = [st.x + A.bx * cs - A.ya * sn, st.y + A.bx * sn + A.ya * cs], d = A.L0 - (st.comp[i] || 0); return { x: att[0] + dnx * d, y: att[1] + dny * d, ax: att, ang: st.ang[i] }; });
		c.strokeStyle = "#555"; c.lineWidth = Math.max(1, v.r * 0.18 * cam.s); wheels.forEach(function (w) { c.beginPath(); c.moveTo(wx(w.ax[0]), wy(w.ax[1])); c.lineTo(wx(w.x), wy(w.y)); c.stroke(); });
		if (v.bike) { drawBike(c, st, wheels, col); return; }
		var sp = sprite(v.body); if (sp) { drawSprite(c, st, sp, wheels); return; }
		c.beginPath(); sh.pts.forEach(function (p, i) { var q = bodyPt(st, p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath();
		var top = bodyPt(st, 0, v.ht - v.hcg), bot = bodyPt(st, 0, -v.hcg + sh.gc), grd = c.createLinearGradient(top[0], top[1], bot[0], bot[1]);
		grd.addColorStop(0, shade(col, 1.25)); grd.addColorStop(0.55, col); grd.addColorStop(1, shade(col, 0.55)); c.fillStyle = grd; c.fill();
		c.strokeStyle = "rgba(0,0,0,0.55)"; c.lineWidth = 1; c.stroke();
		var win = windowPoly(v, sh);
		if (win) { c.beginPath(); win.forEach(function (p, i) { var q = bodyPt(st, p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fillStyle = "rgba(25,30,60,0.8)"; c.fill(); }
		var hl = sh.pts.reduce(function (b, p) { return p[0] > b[0] ? p : b; }), tl = sh.pts.reduce(function (b, p) { return p[0] < b[0] ? p : b; });
		var qh = bodyPt(st, hl[0] - 0.06, hl[1] + 0.1), qt = bodyPt(st, tl[0] + 0.05, tl[1] + 0.15); c.fillStyle = "#fff6c8"; c.beginPath(); c.arc(qh[0], qh[1], Math.max(1.5, 0.08 * cam.s), 0, 7); c.fill(); c.fillStyle = "#ff3b3b"; c.beginPath(); c.arc(qt[0], qt[1], Math.max(1.5, 0.07 * cam.s), 0, 7); c.fill();
		wheels.forEach(function (w) { drawWheel(c, w, v.r); });
	}
	/* the glass: the upper part of the outline pulled in towards its centre (the 3D model uses it too) */
	function windowPoly(v, sh) {
		if (v.body === "monster" || v.bike) return null;
		var cut = (sh.gc - v.hcg) + (v.ht - sh.gc) * 0.58, up = sh.pts.filter(function (p) { return p[1] > cut; });
		if (up.length < 3) return null; var cx = up.reduce(function (s, p) { return s + p[0]; }, 0) / up.length, cy = up.reduce(function (s, p) { return s + p[1]; }, 0) / up.length;
		return up.map(function (p) { return [cx + (p[0] - cx) * 0.82, cy + (p[1] - cy) * 0.7]; });
	}
	M.windowPoly = windowPoly;
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
		c.fillStyle = col; c.beginPath(); var a = P(rear + 0.25, seat), b = P(front - 0.35, seat + 0.18), d = P(front - 0.05, seat - 0.05), e = P(front - 0.4, low), f = P(rear + 0.4, low - 0.02);
		[a, b, d, e, f].forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fill(); c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1; c.stroke();
		c.strokeStyle = "#c8ccd2"; c.lineWidth = Math.max(1.5, 0.06 * cam.s); var fw = wheels[1], rw = wheels[0], fk = P(front - 0.18, seat + 0.1), sw = P(rear + 0.45, low + 0.05);
		c.beginPath(); c.moveTo(fk[0], fk[1]); c.lineTo(wx(fw.x), wy(fw.y)); c.moveTo(sw[0], sw[1]); c.lineTo(wx(rw.x), wy(rw.y)); c.stroke();
		var hip = P(rear + 0.5, seat + 0.12), knee = P(front - 0.62, seat - 0.05), foot = P(rear + 0.62, low + 0.02), sho = P(front - 0.62, seat + 0.62), hand = P(front - 0.28, seat + 0.32), head = P(front - 0.52, seat + 0.86);
		c.strokeStyle = "#1d1f2e"; c.lineWidth = Math.max(2, 0.16 * cam.s); c.beginPath(); c.moveTo(foot[0], foot[1]); c.lineTo(knee[0], knee[1]); c.lineTo(hip[0], hip[1]); c.lineTo(sho[0], sho[1]); c.lineTo(hand[0], hand[1]); c.stroke();
		c.fillStyle = "#f4f4f8"; c.beginPath(); c.arc(head[0], head[1], Math.max(3, 0.15 * cam.s), 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(head[0], head[1], Math.max(3, 0.15 * cam.s), Math.PI * 0.9 - st.th, Math.PI * 1.9 - st.th); c.fill();
	}
	function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; function f(x) { return Math.round(clamp(k > 1 ? x + (255 - x) * (k - 1) : x * k, 0, 255)); } return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")"; }
	M.shade = shade;
	function hud(st) {
		$("gj-hs").textContent = Math.round(S.u === "i" ? st.sp / 0.44704 : st.sp * 3.6); $("gj-hu").textContent = S.u === "i" ? "mph" : "km/h";
		var g = st.g; $("gj-hg").style.width = (clamp(g / 12, 0, 1) * 100).toFixed(1) + "%"; $("gj-hg").style.background = g < 6 ? "#3ee08a" : g < 12 ? "#ffc145" : "#ff4d4d"; $("gj-hgt").textContent = g.toFixed(1) + " g";
	}

	/* ---------------- drag handles on the ramps (2D, while stopped) ---------------- */
	var drag = null, hoverH = null, downAt = null;
	function editable() { return S.edit && S.view === "2d" && !running && !replay && sim && (sim.t === 0 || sim.done); }
	function landTop() { return M.groundAt(co, co.gap + 0.01).y; }
	function handles() {
		if (!editable()) return [];
		var hs = [];
		if (S.r !== "none") { hs.push({ id: "lip", x: 0, y: co.lip.y, ax: "v", tip: "Ramp height " + len(S.h) }); hs.push({ id: "rs", x: co.rampStart, y: 0, ax: "h", tip: "Ramp angle " + Math.round(S.a) + "°" }); }
		if (S.pd > 0 || S.l !== "flat") hs.push({ id: "gap", x: co.gap, y: S.l === "flat" ? 0 : landTop(), ax: S.l === "flat" ? "h" : "hv", tip: "Gap " + len(S.gp) + (S.l !== "flat" ? ", landing height " + len(S.lh) : "") });
		if (S.l === "ramp") hs.push({ id: "lend", x: co.zone[1], y: 0, ax: "h", tip: "Landing slope " + Math.round(S.la) + "°" });
		if (S.l === "platform") hs.push({ id: "pend", x: co.zone[1], y: landTop(), ax: "h", tip: "Platform length " + len(S.pl) });
		if (co.gap > 1.5) hs.push({ id: "pit", x: co.gap / 2, y: co.floor, ax: "v", tip: S.pd > 0 ? "Drop " + len(S.pd) : "Drag down to dig a drop" });
		var kept = [], room = touchDev ? 30 : 22; /* zoomed far out, handles would sit on top of each other: keep the first of a crowd */
		hs.forEach(function (h) { if (!kept.some(function (k) { return Math.hypot(wx(k.x) - wx(h.x), wy(k.y) - wy(h.y)) < room; })) kept.push(h); });
		return kept;
	}
	function drawHandles(c) {
		var hs = handles(); if (!hs.length) return;
		hs.forEach(function (h) {
			var X = wx(h.x), Y = wy(h.y), on = (drag && drag.h.id === h.id) || (hoverH && hoverH.id === h.id), R = touchDev ? 11 : 8;
			if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) return;
			c.save(); c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = 6;
			c.fillStyle = on ? "#ff4fa3" : "#fff"; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill(); c.restore();
			c.strokeStyle = on ? "#fff" : "#c2185b"; c.lineWidth = 2.5; c.beginPath(); c.arc(X, Y, R, 0, 7); c.stroke();
			/* arrows showing which way it moves */
			c.strokeStyle = on ? "#fff" : "#8e1145"; c.lineWidth = 1.8; c.beginPath();
			if (h.ax.indexOf("h") >= 0) { c.moveTo(X - R + 3, Y); c.lineTo(X + R - 3, Y); c.moveTo(X - R + 3, Y); c.lineTo(X - R + 6, Y - 3); c.moveTo(X - R + 3, Y); c.lineTo(X - R + 6, Y + 3); c.moveTo(X + R - 3, Y); c.lineTo(X + R - 6, Y - 3); c.moveTo(X + R - 3, Y); c.lineTo(X + R - 6, Y + 3); }
			if (h.ax.indexOf("v") >= 0) { c.moveTo(X, Y - R + 3); c.lineTo(X, Y + R - 3); c.moveTo(X, Y - R + 3); c.lineTo(X - 3, Y - R + 6); c.moveTo(X, Y - R + 3); c.lineTo(X + 3, Y - R + 6); c.moveTo(X, Y + R - 3); c.lineTo(X - 3, Y + R - 6); c.moveTo(X, Y + R - 3); c.lineTo(X + 3, Y + R - 6); }
			c.stroke();
			if (on) { c.font = "600 12px system-ui,sans-serif"; var w = c.measureText(h.tip).width, bx = clamp(X - w / 2 - 6, 4, W - w - 16), by = Y - R - 26; c.fillStyle = "rgba(15,10,30,0.85)"; c.fillRect(bx, by, w + 12, 20); c.fillStyle = "#fff"; c.textAlign = "left"; c.fillText(h.tip, bx + 6, by + 14); }
		});
	}
	function toWorld(e) { var r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top; return { sx: sx, sy: sy, x: (sx - W / 2) / cam.s + cam.x, y: cam.y - (sy - H / 2) / cam.s }; }
	function hitH(p) { var tol = touchDev ? 26 : 16, best = null, bd = tol * tol; handles().forEach(function (h) { var dx = wx(h.x) - p.sx, dy = wy(h.y) - p.sy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = h; } }); return best; }
	function applyDrag(id, p) {
		if (id === "lip") S.h = clamp(r1(p.y), 0.3, 15);
		else if (id === "rs") { var run = Math.max(0.4, -p.x); S.a = clamp(Math.round((S.r === "curved" ? 2 * Math.atan(S.h / run) : Math.atan(S.h / run)) / RAD), 3, 50); }
		else if (id === "gap") { S.gp = clamp(Math.round(p.x * 2) / 2, 0, 120); if (S.l !== "flat") S.lh = clamp(r1(p.y), S.l === "platform" ? Math.max(-20, -S.pd + 0.5) : 0.3, 20); }
		else if (id === "lend") S.la = clamp(Math.round(Math.atan(Math.max(0.3, landTop()) / Math.max(0.4, p.x - co.gap)) / RAD), 5, 50);
		else if (id === "pend") S.pl = clamp(Math.round(p.x - co.gap), 3, 80);
		else if (id === "pit") { S.pd = clamp(r1(-p.y), 0, 60); }
		S.pre = ""; changed(true);
	}
	cv.addEventListener("pointerdown", function (e) {
		var p = toWorld(e), h = hitH(p);
		if (h) { drag = { h: h }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } e.preventDefault(); $("gj-hint").hidden = true; frame(); return; }
		downAt = { x: e.clientX, y: e.clientY };
	});
	cv.addEventListener("pointermove", function (e) {
		var p = toWorld(e);
		if (drag) { applyDrag(drag.h.id, p); drag.h = handles().filter(function (x) { return x.id === drag.h.id; })[0] || drag.h; frame(); return; }
		var h = hitH(p); if ((h && h.id) !== (hoverH && hoverH.id)) { hoverH = h; cv.style.cursor = h ? (h.ax === "h" ? "ew-resize" : h.ax === "v" ? "ns-resize" : "move") : "pointer"; frame(); }
	});
	function endDrag(e) {
		if (drag) { drag = null; changed(); camSnap = true; frame(); return; }
		if (downAt && e && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8 && !running && (!sim || !sim.done) && !replay) go();
		downAt = null;
	}
	cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", function () { drag = null; downAt = null; });
	cv.addEventListener("pointerleave", function () { if (hoverH && !drag) { hoverH = null; frame(); } });
	/* touch: a finger on a handle must not scroll the page */
	cv.addEventListener("touchstart", function (e) { var t = e.touches[0]; if (t && hitH(toWorld(t))) e.preventDefault(); }, { passive: false });
	cv.addEventListener("touchmove", function (e) { if (drag) e.preventDefault(); }, { passive: false });

	/* ---------------- replay / scrub ---------------- */
	var scrub = $("gj-scrub"), replayTimer = 0;
	function scrubSetup() { if (!sim || !sim.done || !sim.track.length) { scrub.parentNode.hidden = true; return; } scrub.parentNode.hidden = false; scrub.max = sim.track.length - 1; scrub.value = sim.track.length - 1; }
	scrub.addEventListener("input", function () { running = false; cancelAnimationFrame(replayTimer); replay = { track: sim.track, i: +scrub.value }; paintRun(); frame(); hud(stateNow()); $("gj-clock").textContent = "replay t = " + sim.track[+scrub.value][0].toFixed(2) + " s"; });
	$("gj-replay").addEventListener("click", function () {
		if (!sim || !sim.track.length || !sim.done) { toast("Do a jump first, then replay it."); return; }
		running = false; $("gj-verdict").hidden = true; var tr = sim.track, i0 = 0, t0 = performance.now();
		if (sim.ev.takeoff) for (var i = 0; i < tr.length; i++) if (tr[i][0] >= sim.ev.takeoff.t - 1) { i0 = i; break; }
		replay = { track: tr, i: i0 }; cancelAnimationFrame(replayTimer); camSnap = true; var rate = S.slow < 1 ? S.slow : 0.35;
		(function tick(now) { if (!replay) return; var t = tr[i0][0] + (now - t0) / 1000 * rate; var j = replay.i; while (j < tr.length - 1 && tr[j + 1][0] <= t) j++; replay.i = j; scrub.value = j; frame(); hud(stateNow()); $("gj-clock").textContent = "replay t = " + tr[j][0].toFixed(2) + " s · slow motion"; if (j < tr.length - 1) replayTimer = requestAnimationFrame(tick); else showVerdict(sim.result); })(t0);
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
	$("gj-link").addEventListener("click", function () { copy(location.origin + writeUrl(), "Link copied: it opens this exact jump."); });
	$("gj-png").addEventListener("click", function () {
		var use3 = S.view === "3d" && r3, src = use3 ? r3.canvas() : cv; if (use3) frame();
		src.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "stunt-jump.png"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); });
	});

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
		if (!sweepData) return; var c = $("gj-swc"); if (!c.parentNode.clientWidth) return; var o = prepC(c, 2.4, 220), x = o.x, col = chartCol(), L = 52, R = 12, T = 12, B = 36, w = o.w - L - R, h = o.h - T - B;
		x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var list = sweepData.list, kmax = list[list.length - 1].kmh, dmax = 10;
		list.forEach(function (r) { if (r.code !== "nojump") dmax = Math.max(dmax, r.dist); }); if (isFinite(co.zone[1])) dmax = Math.max(dmax, co.zone[1] * 1.15); dmax = Math.min(dmax * 1.05, 500);
		function X(k) { return L + (k - 10) / (kmax - 10) * w; } function Y(d) { return T + h - clamp(d / dmax, 0, 1) * h; }
		if (co.hasGap) { var z1 = isFinite(co.zone[1]) ? co.zone[1] : dmax; x.fillStyle = col.zone; x.fillRect(L, Y(z1), w, Y(co.zone[0]) - Y(z1)); x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.textAlign = "right"; x.fillText("landing", L + w - 4, Y(co.zone[0]) - 4); }
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; x.lineWidth = 1;
		for (var i = 0; i <= 5; i++) { var gy = T + h * i / 5, gx = L + w * i / 5; x.beginPath(); x.moveTo(L, gy); x.lineTo(L + w, gy); x.moveTo(gx, T); x.lineTo(gx, T + h); x.stroke(); x.textAlign = "right"; x.fillText(len(dmax * (5 - i) / 5, 0).replace(" m", "").replace(" ft", ""), L - 5, gy + 4); x.textAlign = "center"; x.fillText(Math.round(kmhToUnit(10 + (kmax - 10) * i / 5)), gx, T + h + 15); }
		x.textAlign = "center"; x.fillText("speed at the ramp (" + (S.u === "i" ? "mph" : "km/h") + ")", L + w / 2, o.h - 4); x.save(); x.translate(12, T + h / 2); x.rotate(-Math.PI / 2); x.fillText("distance (" + (S.u === "i" ? "ft" : "m") + ")", 0, 0); x.restore();
		x.strokeStyle = col.text; x.globalAlpha = 0.35; x.beginPath(); var first = true; list.forEach(function (r) { if (r.code === "nojump") return; if (first) { x.moveTo(X(r.kmh), Y(r.dist)); first = false; } else x.lineTo(X(r.kmh), Y(r.dist)); }); x.stroke(); x.globalAlpha = 1;
		swHit = [];
		list.forEach(function (r) { var px = X(r.kmh), py = Y(r.code === "nojump" ? 0 : r.dist); x.fillStyle = CODECOL[r.code] || "#888"; x.beginPath(); x.arc(px, py, 4.5, 0, 7); x.fill(); swHit.push([px, py, r]); });
		x.strokeStyle = col.strong; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(X(S.k), T); x.lineTo(X(S.k), T + h); x.stroke(); x.setLineDash([]);
		$("gj-swlg").innerHTML = ["clean", "hard", "brutal", "crash", "short", "splash"].filter(function (k) { return list.some(function (r) { return r.code === k; }); }).map(function (k) { return '<span><i style="background:' + CODECOL[k] + '"></i>' + k + "</span>"; }).join("");
	}
	function swPick(e, tol) { var r = $("gj-swc").getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = tol; swHit.forEach(function (p) { var d = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my); if (d < bd) { bd = d; best = p[2]; } }); return best; }
	$("gj-swc").addEventListener("click", function (e) { var b = swPick(e, 500); if (b) { S.k = b.kmh; S.m = "auto"; S.pre = ""; changed(); drawSweep(); $("gj-st").scrollIntoView({ behavior: "smooth", block: "center" }); go(); } });
	$("gj-swc").addEventListener("mousemove", function (e) { var b = swPick(e, 300); this.title = b ? spd(b.kmh / 3.6) + ": " + b.title + (b.code !== "nojump" && b.dist ? ", " + len(b.dist) : "") + (b.ok ? ", " + b.landG.toFixed(1) + " g" : "") : ""; });

	/* ---------------- charts of the last run ---------------- */
	function drawCharts() {
		var tr = sim && sim.track, c1 = $("gj-ch1"), c2 = $("gj-ch2"); if (!c1 || !tr || tr.length < 2 || !sim.ev.takeoff || !sim.done) { $("gj-charts").hidden = true; return; }
		$("gj-charts").hidden = false; if (!c1.parentNode.clientWidth) return; var col = chartCol();
		var o = prepC(c1, 2.2, 200), x = o.x, L = 48, R = 10, T = 10, B = 32, w = o.w - L - R, h = o.h - T - B; x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var x0 = co.rampStart - 5, x1 = Math.max(tr[tr.length - 1][1], co.lip.x + 10), ymin = Math.min(co.floor, 0) - 1, ymax = 1;
		tr.forEach(function (p) { if (p[1] >= x0 && p[1] <= x1) ymax = Math.max(ymax, p[2] + 1); });
		var sx = w / (x1 - x0), sy = h / (ymax - ymin); function X(v) { return L + (v - x0) * sx; } function Y(v) { return T + h - (v - ymin) * sy; }
		x.fillStyle = dark() ? "#2a2533" : "#e9e3f2"; x.beginPath(); x.moveTo(X(x0), T + h); for (var gx = x0; gx <= x1; gx += (x1 - x0) / 300) x.lineTo(X(gx), Y(Math.max(ymin, M.groundAt(co, gx).y))); x.lineTo(X(x1), T + h); x.closePath(); x.fill();
		x.strokeStyle = col.grid; x.fillStyle = col.text; x.font = "11px system-ui,sans-serif"; for (var i = 0; i <= 4; i++) { var yy = T + h * i / 4, vv = ymax - (ymax - ymin) * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + w, yy); x.stroke(); x.textAlign = "right"; x.fillText(len(vv, 0), L - 4, yy + 4); var xv = x0 + (x1 - x0) * i / 4; x.textAlign = "center"; x.fillText(len(xv - co.lip.x, 0), X(xv), T + h + 14); }
		x.textAlign = "center"; x.fillText("distance from the lip", L + w / 2, o.h - 3);
		if (ghost && ghost.key === courseKey()) { x.strokeStyle = col.text; x.globalAlpha = 0.35; x.setLineDash([4, 4]); x.beginPath(); ghost.track.forEach(function (p, i) { if (i) x.lineTo(X(p[1]), Y(p[2])); else x.moveTo(X(p[1]), Y(p[2])); }); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
		x.lineWidth = 2.5; for (i = 1; i < tr.length; i++) { if (tr[i][1] < x0) continue; x.strokeStyle = speedCol(tr[i][4]); x.beginPath(); x.moveTo(X(tr[i - 1][1]), Y(tr[i - 1][2])); x.lineTo(X(tr[i][1]), Y(tr[i][2])); x.stroke(); } x.lineWidth = 1;
		o = prepC(c2, 2.2, 200); x = o.x; w = o.w - L - R; h = o.h - T - B; x.fillStyle = col.bg; x.fillRect(0, 0, o.w, o.h);
		var t0 = Math.max(0, sim.ev.takeoff.t - 1.2), t1 = tr[tr.length - 1][0], gmax = 6; tr.forEach(function (p) { if (p[0] >= t0) gmax = Math.max(gmax, p[5] * 1.1); }); gmax = Math.min(gmax, 80);
		function TX(t) { return L + (t - t0) / (t1 - t0 || 1) * w; } function GY(g) { return T + h - clamp(g / gmax, 0, 1) * h; }
		[[6, "rgba(230,162,26,0.12)"], [12, "rgba(226,69,60,0.12)"]].forEach(function (b, k) { var top = k ? gmax : 12; if (b[0] >= gmax) return; x.fillStyle = b[1]; x.fillRect(L, GY(Math.min(top, gmax)), w, GY(b[0]) - GY(Math.min(top, gmax))); });
		x.strokeStyle = col.grid; x.fillStyle = col.text; for (i = 0; i <= 4; i++) { yy = T + h * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + w, yy); x.stroke(); x.textAlign = "right"; x.fillText((gmax * (4 - i) / 4).toFixed(0) + " g", L - 4, yy + 4); x.textAlign = "center"; x.fillText((t0 + (t1 - t0) * i / 4 - sim.ev.takeoff.t).toFixed(1) + " s", L + w * i / 4, T + h + 14); }
		x.textAlign = "center"; x.fillText("time from takeoff", L + w / 2, o.h - 3);
		x.strokeStyle = dark() ? "#ff9a6b" : "#c2185b"; x.lineWidth = 2; x.beginPath(); var f = true; tr.forEach(function (p) { if (p[0] < t0) return; if (f) { x.moveTo(TX(p[0]), GY(p[5])); f = false; } else x.lineTo(TX(p[0]), GY(p[5])); }); x.stroke(); x.lineWidth = 1;
		x.setLineDash([3, 3]); x.strokeStyle = col.text; x.beginPath(); x.moveTo(L, GY(1)); x.lineTo(L + w, GY(1)); x.stroke(); x.setLineDash([]); x.textAlign = "left"; x.fillText("1 g = sitting still", L + 4, GY(1) - 4);
	}

	/* ---------------- keyboard + touch driving ---------------- */
	function typing(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
	var KM = { ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", ArrowLeft: "tl", KeyA: "tl", ArrowRight: "tr", KeyD: "tr" };
	function inView() { var r = app.getBoundingClientRect(); return isFill() || (r.bottom > 0 && r.top < innerHeight); }
	function startIfDrive(k) { if (!running && S.m === "drive" && k === "gas" && sim && !sim.done && !replay) go(); }
	document.addEventListener("keydown", function (e) {
		if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || !inView()) return;
		var mine = isFill() || document.activeElement === cv || app.contains(document.activeElement) || running;
		if (!mine) return;
		if (KM[e.code]) { keys[KM[e.code]] = 1; startIfDrive(KM[e.code]); e.preventDefault(); return; }
		if (e.code === "Space" && !(document.activeElement && document.activeElement.tagName === "BUTTON")) { e.preventDefault(); go(); }
		else if (e.code === "KeyR") { e.preventDefault(); reset(); }
		else if (e.code === "KeyF") { e.preventDefault(); $("gj-fs").click(); }
		else if (e.code === "Escape" && isFill() && !document.fullscreenElement) { e.preventDefault(); leaveFill(); }
		else if (e.code === "KeyO") { $("gj-opt").click(); }
		else if (S.view === "3d" && r3 && (e.code === "Minus" || e.code === "NumpadSubtract")) { e.preventDefault(); r3.zoomBy(1.1); } /* - = zoom out (wider) */
		else if (S.view === "3d" && r3 && (e.code === "Equal" || e.code === "NumpadAdd")) { e.preventDefault(); r3.zoomBy(1 / 1.1); }
		else if (S.view === "3d" && r3 && e.code === "Digit0") { e.preventDefault(); r3.resetFree(); }
	});
	document.addEventListener("keyup", function (e) { if (KM[e.code]) keys[KM[e.code]] = 0; });
	window.addEventListener("blur", function () { keys = { gas: 0, brake: 0, tl: 0, tr: 0 }; touch = { gas: 0, brake: 0, tl: 0, tr: 0 }; });
	Array.prototype.forEach.call(document.querySelectorAll("#gj-touch [data-k]"), function (b) {
		var k = b.getAttribute("data-k");
		function on(e) { e.preventDefault(); touch[k] = 1; b.classList.add("is-on"); try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } startIfDrive(k); }
		function off() { touch[k] = 0; b.classList.remove("is-on"); }
		b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("lostpointercapture", off);
		b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	});
	$("gj-go").addEventListener("click", go);
	$("gj-reset").addEventListener("click", reset);
	$("gj-camreset").addEventListener("click", function () { if (r3) r3.resetFree(); });
	$("gj-3d").addEventListener("click", function () { if (r3 && r3.takeDrag()) return; if (S.cam3 !== "orbit" && !running && (!sim || !sim.done) && !replay) go(); });
	$("gj-hint").addEventListener("click", function (e) { if (e.target.closest(".gj-hintx")) { hintDone(); $("gj-hint").hidden = true; return; } if (S.m !== "drive") go(); });
	$("gj-col").addEventListener("input", function (e) { S.color = e.target.value; save(); if (r3) r3.setScene(co, veh, S.color, GRAV[S.gr]); frame(); });

	/* ---------------- start ---------------- */
	if (S.pre && !fromLink) { var pp = M.PRESETS.filter(function (x) { return x.id === S.pre; })[0]; if (pp && !sv.k) loadPreset(pp); }
	$("gj-col").value = S.color || M.vehicle(S.v).color;
	paintStats(); paintInputs(); paintRuns(); reset(); paintSweep(); size(); setView();
	window.addEventListener("resize", function () { size(); if (!isFill()) { drawCharts(); drawSweep(); } });
	if (window.ResizeObserver) new ResizeObserver(function () { size(); }).observe($("gj-st"));
	new MutationObserver(function () { drawCharts(); drawSweep(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	window.MESStunt = { S: S, go: go, reset: reset, get sim() { return sim; }, get r3() { return r3; }, get cam() { return cam; }, frame: frame, enterFill: enterFill, leaveFill: leaveFill, handles: handles, wx: wx, wy: wy,
		setView: function (v) { S.view = v; paintSeg(); setView(); },
		step: function (n) { for (var i = 0; i < (n || 1); i++) if (!sim.done) sim.step(DT); if (sim.done && !sim._f) { sim._f = 1; finished(); } frame(); paintRo(); } };
})();

/* MES GTA 6 community map (mes.fm/gta-6-map, #gt[data-page="map"]): an original rough fan sketch of Leonida with pins people add
   (secrets, animals, fishing spots ...) and up / down votes. Data: mes.fm/api/gta-map.js; validation + ordering = MESGTA.MAP (lib.js).
   On 127.0.0.1 / localhost (no /api) or with ?mock=1 an in-browser stand-in (localStorage "mes-gta-map:mock") answers instead.
   State: localStorage "mes-gta-map:v1" = {vid, mine:{id: key}, votes:{id: 1|-1}, hvotes:{"acct|id": 1|-1}, hsign, sort, ver, cats, grid, labels,
   found:{id: ms} (pins ticked "Found it"), notes:{id: text} (private notes), my:[private markers, kind "m"], places (show MES known places), hideFound}.
   Three kinds of pins share one list: community pins (from the API), known places (MAP.PLACES, kind "k", read-only) and private markers (kind "m",
   only in this browser). Pins closer than ~36 screen px are drawn as one numbered bubble (MAP.clusterPins); click it to zoom in.
   Hive (optional): sign in through main_js/hive.js (MESHive: Keychain extension 4.x, or the Keychain phone app through HiveAuth);
   then a pin or a vote is signed as one custom_json (MESGTA.MAP.HIVE_ID) and only the account + transaction id go to the API,
   which checks the operation on the chain. Debug: window.MESGTAMapDebug. */
(function () {
	"use strict";
	var root = document.getElementById("gt");
	if (!root || root.getAttribute("data-page") !== "map" || !window.MESGTA) return;
	var stage = document.getElementById("gm-stage");
	var MAP = window.MESGTA.MAP, KEY = "mes-gta-map:v1", SVGNS = "http://www.w3.org/2000/svg";
	var $ = function (id) { return document.getElementById(id); };
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function el(tag, attrs, parent) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
	function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var S = load();
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
	if (!/^[a-f0-9]{32}$/.test(S.vid || "")) { var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256; }); S.vid = Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); save(); }
	S.mine = S.mine || {}; S.votes = S.votes || {}; S.hvotes = S.hvotes || {}; S.cats = S.cats || []; if (S.hsign == null) S.hsign = true;
	S.found = S.found || {}; S.notes = S.notes || {}; S.my = Array.isArray(S.my) ? S.my : []; if (S.places == null) S.places = true;
	(function () { var ch = false; S.my.forEach(function (m) { if (!(m.m >= 2)) { var u = MAP.upgradeXY(m.x, m.y, m.m || 1); m.x = u.x; m.y = u.y; m.m = MAP.MAP_V; ch = true; } }); if (ch) save(); })();
	function upPins(list) { (list || []).forEach(function (p) { if (!(p.m >= 2)) { var u = MAP.upgradeXY(p.x, p.y, p.m || 1); p.x = u.x; p.y = u.y; } }); return list || []; }
	var T0 = Date.now();
	function toast(m) { var t = $("gj-toast"); if (!t) return; t.textContent = m; t.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("is-on"); }, 3600); }
	var ICON = { secret: "🤫", animal: "🦌", fishing: "🎣", gem: "💎", egg: "🥚", collect: "⭐", activity: "🎯", vehicle: "🚗", stunt: "🏁", other: "📍" };
	function catColor(id) { for (var i = 0; i < MAP.PIN_CATS.length; i++) if (MAP.PIN_CATS[i][0] === id) return MAP.PIN_CATS[i][2]; return "#6d4c41"; }

	/* ======================= the base map (original sketch; 0..1000) ======================= */
	var LAND = "M70,130 C150,95 260,110 330,128 C420,150 470,118 560,110 C660,100 760,120 870,108 L905,120 C900,190 860,240 850,300 " +
		"C845,380 870,440 880,520 C890,600 900,660 870,740 C850,800 800,840 745,860 C705,872 668,850 650,812 C630,770 600,735 575,690 " +
		"C548,640 530,590 520,530 C512,480 498,420 470,380 C440,335 405,300 360,285 C300,265 245,282 190,268 C140,255 95,232 70,205 Z";
	var LAKE = "M600,430 C640,410 690,420 700,455 C708,490 670,515 630,505 C595,497 580,455 600,430 Z";
	var KEYS = [[700, 885, 22, 9], [660, 905, 18, 7], [618, 920, 20, 7], [574, 932, 17, 6], [532, 942, 19, 7], [490, 950, 15, 6], [450, 957, 18, 6], [410, 962, 14, 5]];
	var ISLES = [[905, 640, 26, 60], [255, 330, 30, 14]];
	var REG = [  /* name, label x, y, shaded area path (rough) */
		["Port Gellhorn", 210, 190, "M90,150 C170,120 300,130 360,150 L380,270 C300,262 230,280 170,262 C120,250 90,220 90,150 Z", "#9fb8a6"],
		["Mount Kalaga", 500, 165, "M400,140 C470,120 560,118 640,120 L660,240 C580,250 500,250 430,235 Z", "#b9a98e"],
		["Ambrosia", 700, 300, "M640,180 C720,150 820,150 860,170 L850,330 C860,390 870,420 860,430 C790,430 700,400 640,390 C560,380 520,330 560,260 Z", "#c9c08f"],
		["Grassrivers", 640, 640, "M540,520 C600,540 700,560 760,580 C770,650 760,720 730,780 C690,790 650,770 620,730 C580,680 548,610 540,520 Z", "#8fb38a"],
		["Vice City", 830, 700, "M790,560 C830,560 870,570 885,610 C892,680 880,740 850,790 C820,800 780,790 770,750 C770,690 775,620 790,560 Z", "#c7a0b3"],
		["Leonida Keys", 540, 900, null, null]];
	var ROADS = ["M150,210 C300,205 450,190 600,180 C700,175 800,190 870,200", "M760,180 C780,300 820,420 840,560 C850,640 845,720 830,780",
		"M600,180 C590,280 600,380 620,470 C640,560 700,640 780,700", "M745,860 C700,890 620,920 520,945 C470,955 430,960 400,962"];
	/* the v1 shapes above are moved onto the painted v2 picture (affine), so region hit tests and names line up */
	function upPath(d) { var a = MAP.V1TO2, i = 0, prev = 0; return d.replace(/-?\d+(\.\d+)?/g, function (n) { var v = +n; if (i++ % 2 === 0) { prev = v; return "\u0000" + n; } var x = prev, y = v; return (Math.round((a[0] * x + a[1] * y + a[2]) * 10) / 10) + "," + (Math.round((a[3] * x + a[4] * y + a[5]) * 10) / 10); }).replace(/\u0000-?\d+(\.\d+)?,/g, ""); }
	LAND = upPath(LAND); LAKE = upPath(LAKE);
	REG.forEach(function (r) { var u = MAP.upgradeXY(r[1], r[2], 1); r[1] = u.x; r[2] = u.y; if (r[3]) r[3] = upPath(r[3]); });
	var PAINTED = "/gta-6-map/img/leonida-map.jpg?v=1";
	function drawBase() {
		var g = $("gm-base"); g.innerHTML = "";
		/* painted picture (MAP_V 2); the vector regions stay as invisible hit areas */
		el("image", { href: PAINTED, x: 0, y: 0, width: 1000, height: 1000, preserveAspectRatio: "none", "class": "gm-pic" }, g);
		REG.forEach(function (r) { if (r[3]) el("path", { d: r[3], "class": "gm-reg gm-hit", fill: r[4] }, g); });
		return drawGrid();
	}
	function drawSketch() {
		var g = $("gm-base"); g.innerHTML = "";
		el("path", { d: LAND, "class": "gm-land" }, g);
		ISLES.forEach(function (i) { el("ellipse", { cx: i[0], cy: i[1], rx: i[2], ry: i[3], "class": "gm-land" }, g); });
		KEYS.forEach(function (k) { el("ellipse", { cx: k[0], cy: k[1], rx: k[2], ry: k[3], "class": "gm-land" }, g); });
		REG.forEach(function (r) { if (r[3]) el("path", { d: r[3], "class": "gm-reg", fill: r[4] }, g); });
		el("path", { d: LAKE, "class": "gm-water" }, g);
		el("path", { d: "M520,560 C560,600 600,640 620,700 M560,540 C610,590 660,600 700,640", "class": "gm-river" }, g);
		for (var i = 0; i < 5; i++) el("path", { d: "M" + (450 + i * 38) + ",200 l14,-26 l14,26", "class": "gm-mtn" }, g);
		ROADS.forEach(function (d) { el("path", { d: d, "class": "gm-road" }, g); });
		/* city blocks for Vice City */
		for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) el("rect", { x: 805 + c * 16, y: 650 + r * 18, width: 11, height: 13, rx: 1.5, "class": "gm-block" }, g);
		el("path", { d: LAND, "class": "gm-coast" }, g);
		drawGrid();
	}
	function drawGrid() {
		var n = $("gm-names"); n.innerHTML = "";
		REG.forEach(function (r) { var t = el("text", { x: r[1], y: r[2], "class": "gm-name", "text-anchor": "middle" }, n); t.textContent = r[0]; });
		var gg = $("gm-gridg"); gg.innerHTML = "";
		for (var j = 0; j <= 10; j++) {
			el("line", { x1: j * 100, y1: 0, x2: j * 100, y2: 1000, "class": "gm-gl" }, gg);
			el("line", { x1: 0, y1: j * 100, x2: 1000, y2: j * 100, "class": "gm-gl" }, gg);
			if (j < 10) {
				var a = el("text", { x: j * 100 + 50, y: 16, "class": "gm-gt", "text-anchor": "middle" }, gg); a.textContent = "ABCDEFGHIJ"[j];
				var d = el("text", { x: 8, y: j * 100 + 56, "class": "gm-gt" }, gg); d.textContent = String(j + 1);
			}
		}
	}
	function gridRef(x, y) { return "ABCDEFGHIJ"[Math.min(9, Math.floor(x / 100))] + (Math.min(9, Math.floor(y / 100)) + 1); }
	function nearRegion(x, y) {
		/* inside a shaded area first, else the nearest label */
		var svg = $("gm-svg"), best = "", bd = 1e9;
		for (var i = 0; i < REG.length; i++) {
			var r = REG[i];
			if (r[3] && svg.createSVGPoint) { var p = $("gm-base").querySelectorAll(".gm-reg")[i]; if (p && p.isPointInFill) { var pt = svg.createSVGPoint(); pt.x = x; pt.y = y; try { if (p.isPointInFill(pt)) return r[0]; } catch (e) { /* old browser */ } } }
			var dd = (r[1] - x) * (r[1] - x) + (r[2] - y) * (r[2] - y); if (dd < bd) { bd = dd; best = r[0]; }
		}
		return bd < 240 * 240 ? best : "Somewhere else";
	}

	/* ======================= view: pan and zoom ======================= */
	var V = { z: 1, tx: 0, ty: 0 }, ZMIN = 1, ZMAX = 8;
	var lastZ = 0;
	function unit() { return 1000 / Math.max(160, Math.min(stage.clientWidth || 600, stage.clientHeight || 600)); }
	function applyView() {
		V.z = Math.max(ZMIN, Math.min(ZMAX, V.z));
		if (lastZ && Math.abs(Math.log(V.z / lastZ)) > 0.08) { drawPins(); return; }
		var lim = 1000 * (V.z - 1); V.tx = Math.min(80, Math.max(-lim - 80, V.tx)); V.ty = Math.min(80, Math.max(-lim - 80, V.ty));
		$("gm-vp").setAttribute("transform", "translate(" + V.tx.toFixed(2) + "," + V.ty.toFixed(2) + ") scale(" + V.z.toFixed(4) + ")");
		var u = 1000 / Math.max(160, Math.min(stage.clientWidth || 600, stage.clientHeight || 600)), k = (0.95 * u / V.z).toFixed(4);   /* u = map units per screen px: pins keep their size on screen */
		Array.prototype.forEach.call(document.querySelectorAll("#gm-pins > g, #gm-draft > g"), function (p) { p.setAttribute("transform", "translate(" + p.getAttribute("data-x") + "," + p.getAttribute("data-y") + ") scale(" + k + ")"); });
		$("gm-names").setAttribute("font-size", (14 * u / V.z).toFixed(2));
		$("gm-gridg").setAttribute("font-size", (11 * u / V.z).toFixed(2));
		placePop();
	}
	function svgPt(cx, cy) { var svg = $("gm-svg"), pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; var m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
	function mapPt(cx, cy) { var p = svgPt(cx, cy); return { x: (p.x - V.tx) / V.z, y: (p.y - V.ty) / V.z }; }
	function zoomAt(f, cx, cy) {
		var p = cx == null ? { x: 500, y: 500 } : svgPt(cx, cy), nz = Math.max(ZMIN, Math.min(ZMAX, V.z * f));
		V.tx = p.x - (p.x - V.tx) * nz / V.z; V.ty = p.y - (p.y - V.ty) * nz / V.z; V.z = nz; applyView();
	}
	function fit() { V.z = 1; V.tx = 0; V.ty = 0; applyView(); }
	function centreOn(x, y, z) { V.z = Math.max(V.z, z || 2.5); V.tx = 500 - x * V.z; V.ty = 500 - y * V.z; applyView(); }

	var ptrs = {}, drag = null;
	stage.addEventListener("pointerdown", function (e) {
		if (e.target.closest(".gm-pop, .gm-ask")) return;
		ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
		var ids = Object.keys(ptrs);
		if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, tx: V.tx, ty: V.ty, moved: false, pin: e.target.closest("[data-pin]"), cl: e.target.closest("[data-cl]") };
		else if (ids.length === 2) { var a = ptrs[ids[0]], b2 = ptrs[ids[1]]; drag = { pinch: Math.hypot(a.x - b2.x, a.y - b2.y), z: V.z, moved: true }; }
		try { stage.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
	});
	stage.addEventListener("pointermove", function (e) {
		if (!ptrs[e.pointerId] || !drag) return;
		ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
		var ids = Object.keys(ptrs);
		if (drag.pinch && ids.length === 2) {
			var a = ptrs[ids[0]], b2 = ptrs[ids[1]], d = Math.hypot(a.x - b2.x, a.y - b2.y);
			zoomAt(drag.z * d / drag.pinch / V.z, (a.x + b2.x) / 2, (a.y + b2.y) / 2); return;
		}
		if (drag.pinch) return;
		var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
		if (!drag.moved && Math.hypot(dx, dy) < 6) return;
		drag.moved = true; stage.classList.add("is-drag");
		var s = 1000 / Math.max(1, Math.min(stage.clientWidth, stage.clientHeight));   /* screen px -> svg units (meet) */
		V.tx = drag.tx + dx * s; V.ty = drag.ty + dy * s; applyView();
	});
	function up(e) {
		if (!ptrs[e.pointerId]) return;
		delete ptrs[e.pointerId];
		var d = drag; if (Object.keys(ptrs).length) return;
		drag = null; stage.classList.remove("is-drag");
		if (!d || d.moved || d.pinch) return;
		if (d.cl) { openCluster(d.cl); return; }
		if (d.pin) { openPin(d.pin.getAttribute("data-pin")); return; }
		var p = mapPt(e.clientX, e.clientY);
		if (p.x < 0 || p.y < 0 || p.x > 1000 || p.y > 1000) return;
		if (mode === "add") setDraft(p.x, p.y);
		else { closePop(); askAt(p.x, p.y); }
	}
	stage.addEventListener("pointerup", up);
	stage.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; drag = null; stage.classList.remove("is-drag"); });
	stage.addEventListener("wheel", function (e) {
		var full = $("gm-view").classList.contains("mes-pfill");
		if (!full && !e.ctrlKey && !e.metaKey) { hint("Hold Ctrl and scroll to zoom (or use + and −)"); return; }
		e.preventDefault(); zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)), e.clientX, e.clientY);
	}, { passive: false });
	function hint(m) { var h = $("gm-status"); h.textContent = m; h.classList.add("is-on"); clearTimeout(hint.t); hint.t = setTimeout(function () { h.classList.remove("is-on"); }, 1800); }
	$("gm-zin").onclick = function () { zoomAt(1.5); };
	$("gm-zout").onclick = function () { zoomAt(1 / 1.5); };
	$("gm-fit").onclick = fit;
	stage.tabIndex = 0;
	stage.addEventListener("keydown", function (e) {
		if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
		var k = e.key, step = 60;
		if (k === "+" || k === "=") zoomAt(1.4); else if (k === "-" || k === "_") zoomAt(1 / 1.4); else if (k === "0") fit();
		else if (k === "ArrowLeft") { V.tx += step; applyView(); } else if (k === "ArrowRight") { V.tx -= step; applyView(); }
		else if (k === "ArrowUp") { V.ty += step; applyView(); } else if (k === "ArrowDown") { V.ty -= step; applyView(); }
		else if (k === "Escape") { closePop(); $("gm-ask").hidden = true; } else return;
		e.preventDefault();
	});
	function opt(id, key, cls) {
		var c = $(id); c.checked = S[key] !== false;
		var f = function () { $("gm-svg").classList.toggle(cls, !c.checked); S[key] = c.checked; save(); };
		c.addEventListener("change", f); f();
	}
	opt("gm-grid", "grid", "no-grid"); opt("gm-labels", "labels", "no-names");

	/* ======================= data (API or the local stand-in) ======================= */
	var MOCK = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) || /[?&]mock=1\b/.test(location.search), API = "/api/gta-map";
	var mock = {
		get: function () { try { return JSON.parse(localStorage.getItem("mes-gta-map:mock") || "null"); } catch (e) { return null; } },
		put: function (d) { try { localStorage.setItem("mes-gta-map:mock", JSON.stringify(d)); } catch (e) { /* fine */ } },
		db: function () {
			var d = mock.get();
			if (!d) {
				var t = Date.now(); d = { p: {}, v: {} };
				[["mk00001a", 812, 745, "secret", "Rooftop with a view", "Climb the fire escape behind the pink hotel at night.", "Vice City", 9, 1],
					["mk00002b", 650, 690, "animal", "White alligator", "Sometimes at dawn near the airboat dock. Sample data on this test copy.", "Grassrivers", 3, 4],
					["mk00003c", 560, 925, "fishing", "Tarpon spot", "Off the end of the old bridge.", "Leonida Keys", 1, 0]].forEach(function (r, i) {
					d.p[r[0]] = { x: r[1], y: r[2], cat: r[3], title: r[4], desc: r[5], region: r[6], clip: "", m: 1, c: t - (i + 1) * 3600e3, up: r[7], dn: r[8] };
				});
				mock.put(d);
			}
			return d;
		},
		hive: function (d, b) {
			var rec = b.mockRec; if (!rec) return { error: "that operation is not on the chain yet" };
			if (b.act === "hpin") { var c = MAP.pinFromRecord(rec); if (c.error) return { error: c.error }; var id = "mk" + Math.random().toString(36).slice(2, 8); d.p[id] = Object.assign(c.pin, { c: Date.now(), up: 0, dn: 0, own: 1, ha: b.acct, trx: b.trx }); mock.put(d); return { id: id, key: S.vid.split("").reverse().join(""), pin: Object.assign({ id: id }, d.p[id]) }; }
			var vt = MAP.voteFromRecord(rec); if (vt.error) return { error: vt.error };
			var p = d.p[vt.id]; if (!p) return { error: "pin not found" }; if (p.own || p.ha === b.acct) return { error: "you can’t vote on your own pin" };
			d.hv = d.hv || {}; var k = vt.id + "|" + b.acct, prev = d.hv[k] || 0, g = d.v[vt.id] || 0;
			if (g === 1) p.up--; if (g === -1) p.dn--; d.v[vt.id] = 0;
			p.hup = p.hup || 0; p.hdn = p.hdn || 0; if (prev === 1) p.hup--; if (prev === -1) p.hdn--; if (vt.v === 1) p.hup++; if (vt.v === -1) p.hdn++; d.hv[k] = vt.v; mock.put(d);
			return { up: p.up, dn: p.dn, hup: p.hup, hdn: p.hdn, mine: vt.v, hive: true };
		},
		call: function (body) {
			var d = mock.db();
			return new Promise(function (res) { setTimeout(function () { res(mock.answer(d, body)); }, 120); });
		},
		answer: function (d, b) {
			if (!b) { return { pins: Object.keys(d.p).map(function (id) { var p = d.p[id]; return Object.assign({ id: id }, p); }).filter(function (p) { return MAP.scoreOf(p) > -5; }), now: Date.now() }; }
			if (b.act === "new") { var c = MAP.cleanPin(b); if (c.error) return { error: c.error }; var id = "mk" + Math.random().toString(36).slice(2, 8); var key = S.vid.split("").reverse().join(""); d.p[id] = Object.assign(c.pin, { c: Date.now(), up: 0, dn: 0, own: 1 }); mock.put(d); return { id: id, key: key, pin: Object.assign({ id: id }, d.p[id]) }; }
			if (b.act === "hpin" || b.act === "hvote") return mock.hive(d, b);
			var p = d.p[b.id]; if (!p) return { error: "pin not found" };
			if (b.act === "vote") { if (p.own) return { error: "you can’t vote on your own pin" }; var prev = d.v[b.id] || 0; if (prev === 1) p.up--; if (prev === -1) p.dn--; if (b.v === 1) p.up++; if (b.v === -1) p.dn++; d.v[b.id] = b.v; mock.put(d); return { up: p.up, dn: p.dn, mine: b.v }; }
			if (b.act === "report") return { ok: true };
			if (b.act === "del") { delete d.p[b.id]; mock.put(d); return { ok: true }; }
			return { error: "unknown action" };
		}
	};
	function call(body) {
		if (MOCK) return mock.call(body);
		var o = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" };
		return fetch(API, o).then(function (r) { return r.json().catch(function () { return { error: "the server did not answer (" + r.status + ")" }; }); }, function () { return { error: "no connection, try again" }; });
	}
	var PINS = [], byId = {};
	function myPins() { return S.my.map(function (m) { return Object.assign({ kind: "m", up: 0, dn: 0 }, m); }); }
	function allPins() { return PINS.concat(S.places !== false ? MAP.PLACES : [], myPins()); }
	function index() { byId = {}; PINS.forEach(function (p) { byId[p.id] = p; }); MAP.PLACES.forEach(function (p) { byId[p.id] = p; }); myPins().forEach(function (p) { byId[p.id] = p; }); }
	function refresh(quiet) {
		return call(null).then(function (d) {
			if (d.error) { if (!quiet) $("gm-count").textContent = d.error === "not set up" ? "The pin store isn’t switched on yet." : "Could not load the pins: " + d.error; return; }
			PINS = upPins(d.pins); index();
			Object.keys(S.mine).forEach(function (id) { if (!byId[id] && !quiet) { /* deleted or hidden: keep the key a while */ } });
			drawPins(); renderList(); if (openId && byId[openId]) openPin(openId, true);
		});
	}

	/* ======================= pins on the map ======================= */
	function pinG(p, parent, cls) {
		var g = el("g", { "class": "gm-pin " + (cls || "") + (p.kind ? " gm-pin--" + p.kind : "") + (S.found[p.id] ? " gm-pin--found" : ""), "data-x": p.x, "data-y": p.y }, parent);
		var st = p.kind ? "" : MAP.statusOf(p);
		el("path", { d: "M0,0 C-4,-9 -15,-14 -15,-26 A15,15 0 1 1 15,-26 C15,-14 4,-9 0,0 Z", "class": "gm-pinb", fill: catColor(p.cat) }, g);
		if (st === "verified") el("circle", { cx: 11, cy: -37, r: 6.5, "class": "gm-pinv" }, g);
		if (st === "disputed") el("circle", { cx: 11, cy: -37, r: 6.5, "class": "gm-pind" }, g);
		if (p.ha) el("circle", { cx: -11, cy: -37, r: 5.5, "class": "gm-pinh" }, g);
		if (p.kind === "k") el("path", { d: "M-11,-44 l6,6 l-6,6 l-6,-6 Z", "class": "gm-pink" }, g);
		if (p.kind === "m") el("rect", { x: -17, y: -43, width: 11, height: 9, rx: 2, "class": "gm-pinm" }, g);
		if (S.found[p.id]) { el("circle", { cx: 0, cy: 3, r: 7, "class": "gm-pinf" }, g); el("path", { d: "M-3.5,3 l2.5,2.6 l4.8,-5", "class": "gm-pinfk" }, g); }
		var t = el("text", { x: 0, y: -21, "text-anchor": "middle", "class": "gm-pini" }, g); t.textContent = ICON[p.cat] || "📍";
		return g;
	}
	function shownAll() {
		var list = MAP.filterPins(allPins(), { q: $("gm-q").value, cats: S.cats, verified: S.ver, hive: S.hiveOnly });
		if (S.mineOnly) list = list.filter(function (p) { return S.mine[p.id] || p.kind === "m"; });
		return MAP.sortPins(list, S.sort || "top");
	}
	function shown() { var l = shownAll(); return S.hideFound ? l.filter(function (p) { return !S.found[p.id]; }) : l; }
	function drawPins() {
		var g = $("gm-pins"); g.innerHTML = "";
		lastZ = V.z;
		var list = shown().filter(function (p) { return p.id !== openId; }), open = openId && byId[openId];
		var groups = MAP.clusterPins(list, 34 * unit() / V.z).sort(function (a, b) { return a.y - b.y; });   /* lower pins drawn on top */
		groups.forEach(function (c) {
			if (c.ids.length === 1) { pinOn(c.pins[0], g); return; }
			var cats = {}; c.pins.forEach(function (p) { cats[p.cat] = 1; }); var one = Object.keys(cats).length === 1;
			var e = el("g", { "class": "gm-cl", "data-x": c.x, "data-y": c.y, "data-cl": c.ids.join(","), tabindex: "0", role: "button", "aria-label": c.ids.length + " pins here: zoom in" }, g);
			el("circle", { r: 15 + Math.min(7, c.ids.length), "class": "gm-clb", fill: one ? catColor(c.pins[0].cat) : "#2b2350" }, e);
			var t = el("text", { y: 5, "text-anchor": "middle", "class": "gm-clt" }, e); t.textContent = c.ids.length;
		});
		if (open && list.length !== shown().length) pinOn(open, g);
		applyView();
	}
	function pinOn(p, g) { var e = pinG(p, g); e.setAttribute("data-pin", p.id); e.setAttribute("tabindex", "0"); e.setAttribute("role", "button"); e.setAttribute("aria-label", p.title); if (p.id === openId) e.classList.add("is-open"); return e; }
	function openCluster(node) {
		var ids = node.getAttribute("data-cl").split(","), xs = [], ys = [];
		ids.forEach(function (id) { var p = byId[id]; if (p) { xs.push(p.x); ys.push(p.y); } });
		if (!xs.length) return;
		var w = Math.max(20, Math.max.apply(null, xs) - Math.min.apply(null, xs)), h = Math.max(20, Math.max.apply(null, ys) - Math.min.apply(null, ys));
		var z = Math.min(ZMAX, Math.max(V.z * 2, 600 / Math.max(w, h)));
		if (V.z >= ZMAX - 0.01) { openPin(ids[0]); return; }
		V.z = z; V.tx = 500 - (Math.min.apply(null, xs) + w / 2) * z; V.ty = 500 - (Math.min.apply(null, ys) + h / 2) * z; applyView();
	}
	$("gm-pins").addEventListener("keydown", function (e) {
		if (e.key !== "Enter" && e.key !== " ") return;
		var c = e.target.closest("[data-cl]"), p = e.target.closest("[data-pin]");
		if (c) { e.preventDefault(); openCluster(c); } else if (p) { e.preventDefault(); openPin(p.getAttribute("data-pin")); }
	});

	/* ======================= pin card ======================= */
	var openId = null;
	function hiveBadge(p) { return MAP.hiveOk(p) ? ' <span class="gm-st gm-st--h" title="At least 2 Hive accounts say it\'s real">Hive ✓</span>' : ""; }
	function byLine(p) { return p.ha ? '<a class="gm-by" href="https://peakd.com/@' + esc(p.ha) + '" target="_blank" rel="noopener">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(p.ha)) + '" width="18" height="18" loading="lazy">') + "@" + esc(p.ha) + "</a>" : ""; }
	function statusText(st) { return { verified: '<span class="gm-st gm-st--v">✓ Verified</span>', disputed: '<span class="gm-st gm-st--d">Disputed</span>', "new": '<span class="gm-st gm-st--n">New</span>' }[st] || ""; }
	function ago(ms) { var s = (Date.now() - ms) / 1000; if (s < 90) return "just now"; if (s < 5400) return Math.round(s / 60) + " min ago"; if (s < 129600) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " days ago"; }
	function openPin(id, keep) {
		var p = byId[id]; if (!p) return;
		var wasClustered = openId !== id; openId = id; $("gm-ask").hidden = true;
		var k = p.kind || "", pop = $("gm-pop"), fd = S.found[id];
		var head = '<button type="button" class="gm-x" data-a="close" aria-label="Close">×</button>' +
			'<p class="gm-pk"><span class="gm-dot" style="background:' + catColor(p.cat) + '"></span>' + esc(MAP.catName(p.cat)) + (p.region ? " · " + esc(p.region) : "") + " · " + gridRef(p.x, p.y) + " " +
			(k === "k" ? '<span class="gm-st gm-st--k">MES guide</span>' : k === "m" ? '<span class="gm-st gm-st--m">🔒 Only you</span>' : statusText(MAP.statusOf(p)) + hiveBadge(p)) + "</p>";
		var found = '<div class="gm-fr"><button type="button" class="gm-fb' + (fd ? " is-on" : "") + '" data-a="found" aria-pressed="' + !!fd + '">' + (fd ? "✓ Found" : "☐ Mark as found") + "</button>" +
			(fd ? '<small>' + ago(fd) + "</small>" : "") + "</div>";
		var note = k === "m" ? "" : '<details class="gm-note"' + (S.notes[id] ? " open" : "") + '><summary>📝 My note' + (S.notes[id] ? "" : " (only you see it)") + '</summary><textarea data-a="note" rows="3" maxlength="2000" placeholder="Only saved in this browser">' + esc(S.notes[id] || "") + "</textarea></details>";
		var body;
		if (k === "m") {
			body = '<div class="gm-medit"><input type="text" data-a="mtitle" maxlength="70" value="' + esc(p.title) + '" aria-label="Title">' +
				'<textarea data-a="mnote" rows="4" maxlength="2000" placeholder="Your note (only saved in this browser)">' + esc(p.desc || "") + "</textarea></div>" + found +
				'<p class="gm-pf">Private marker · saved ' + ago(p.c) + ' · <button type="button" class="gm-lnk" data-a="mshare">Share it as a public pin</button> · <button type="button" class="gm-lnk" data-a="mdel">Delete</button></p>';
		} else if (k === "k") {
			body = "<h3>" + esc(p.title) + '</h3><p class="gm-pd">' + esc(p.desc) + "</p>" + found + note +
				'<p class="gm-pf">Approximate spot on our sketch, from the trailers and Rockstar’s region descriptions. It moves to the real spot when the map is redrawn after launch.</p>';
		} else {
			var mine = S.mine[id] || (p.ha && p.ha === me()), v = (signing() ? S.hvotes[me() + "|" + id] : S.votes[id]) || 0, sc = MAP.scoreOf(p), hu = p.hup || 0, hd = p.hdn || 0;
			body = "<h3>" + esc(p.title) + "</h3>" + (p.desc ? '<p class="gm-pd">' + esc(p.desc).replace(/\n/g, "<br>") + "</p>" : "") +
				(p.clip ? '<a class="gm-clip" href="https://www.youtube.com/watch?v=' + esc(p.clip) + '" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/' + esc(p.clip) + '/mqdefault.jpg" alt="" loading="lazy" width="160" height="90"><span>▶ Watch the clip</span></a>' : "") +
				(p.ha ? '<p class="gm-pby">Added by ' + byLine(p) + (p.trx && !/^mock/.test(p.trx) ? ' · <a href="https://hivehub.dev/tx/' + esc(p.trx) + '" target="_blank" rel="noopener">on Hive</a>' : "") + "</p>" : "") +
				'<div class="gm-votes">' + (mine ? '<span class="gm-own">Your pin · score ' + (sc >= 0 ? "+" : "") + sc + " (" + p.up + " up, " + p.dn + " down" + (hu || hd ? "; Hive " + hu + " up, " + hd + " down" : "") + ")</span>" :
					'<button type="button" class="gm-vb gm-vb--up' + (v === 1 ? " is-on" : "") + '" data-a="up" aria-pressed="' + (v === 1) + '" title="It\'s real">▲ <b>' + (p.up + hu) + "</b>" + (hu ? '<small class="gm-hc">' + hu + " Hive</small>" : "") + "</button>" +
					'<button type="button" class="gm-vb gm-vb--dn' + (v === -1 ? " is-on" : "") + '" data-a="dn" aria-pressed="' + (v === -1) + '" title="Fake / not there">▼ <b>' + (p.dn + hd) + "</b>" + (hd ? '<small class="gm-hc">' + hd + " Hive</small>" : "") + "</button>" +
					'<span class="gm-vh">' + (signing() ? "Signed with Hive as @" + esc(me()) + " (counts double)" : v ? "Click again to take your vote back" : "Is it real?") + "</span>") + "</div>" + found + note +
				'<p class="gm-pf">Added ' + ago(p.c) + ' · <button type="button" class="gm-lnk" data-a="share">Copy link</button>' +
				(mine ? ' · <button type="button" class="gm-lnk" data-a="del">Delete my pin</button>' : ' · <button type="button" class="gm-lnk" data-a="report">Report</button>') + "</p>";
		}
		pop.innerHTML = head + body;
		pop.hidden = false; placePop();
		if (wasClustered && !keep) drawPins();
		Array.prototype.forEach.call(document.querySelectorAll("#gm-pins > g"), function (g) { g.classList.toggle("is-open", g.getAttribute("data-pin") === id); });
		Array.prototype.forEach.call(document.querySelectorAll("#gm-list li"), function (li) { li.classList.toggle("is-open", li.getAttribute("data-id") === id); });
		if (!keep && k !== "m") { var u = new URL(location.href); u.searchParams.set("pin", id); history.replaceState(null, "", u); }
	}
	function saveMy(id, f) { S.my.forEach(function (m) { if (m.id === id) f(m); }); save(); index(); }
	var noteT;
	$("gm-pop").addEventListener("input", function (e) {
		var a = e.target.getAttribute("data-a"), id = openId; if (!id) return;
		clearTimeout(noteT);
		noteT = setTimeout(function () {
			if (a === "note") { var t = e.target.value.trim(); if (t) S.notes[id] = e.target.value.slice(0, 2000); else delete S.notes[id]; save(); renderList(); }
			else if (a === "mtitle" && e.target.value.trim()) { saveMy(id, function (m) { m.title = e.target.value.trim().slice(0, 70); }); drawPins(); renderList(); }
			else if (a === "mnote") saveMy(id, function (m) { m.desc = e.target.value.slice(0, 2000); });
		}, 400);
	});
	function toggleFound(id) {
		if (S.found[id]) delete S.found[id]; else S.found[id] = Date.now();
		save(); drawPins(); renderList(); if (byId[id] && openId === id) openPin(id, true);
	}
	function closePop() {
		var had = openId; openId = null; $("gm-pop").hidden = true;
		if (had) drawPins();
		Array.prototype.forEach.call(document.querySelectorAll(".is-open"), function (e) { if (e.closest("#gm-pins, #gm-list")) e.classList.remove("is-open"); });
		var u = new URL(location.href); if (u.searchParams.has("pin")) { u.searchParams.delete("pin"); history.replaceState(null, "", u); }
	}
	function screenOf(x, y) {   /* map coords -> px inside the stage */
		var svg = $("gm-svg"), m = svg.getScreenCTM(), r = stage.getBoundingClientRect(); if (!m) return null;
		var sx = V.tx + x * V.z, sy = V.ty + y * V.z;
		return { x: m.a * sx + m.e - r.left, y: m.d * sy + m.f - r.top };
	}
	function placePop() {
		var pop = $("gm-pop"), p = openId && byId[openId];
		[[pop, p], [$("gm-ask"), askPt]].forEach(function (pair) {
			var box = pair[0], at = pair[1]; if (box.hidden || !at) return;
			var s = screenOf(at.x, at.y); if (!s) return;
			var w = box.offsetWidth, h = box.offsetHeight, W = stage.clientWidth, H = stage.clientHeight;
			var left = Math.max(6, Math.min(W - w - 6, s.x - w / 2)), top = s.y - h - 48;
			if (top < 6) top = Math.min(H - h - 6, s.y + 14);
			box.style.left = left + "px"; box.style.top = Math.max(6, top) + "px";
		});
	}
	$("gm-pop").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"); if (!b) return;
		var a = b.getAttribute("data-a"), id = openId, p = byId[id];
		if (a === "close") return closePop();
		if (!p) return;
		if (a === "found") return toggleFound(id);
		if (a === "mdel") { if (!confirm("Delete your private marker “" + p.title + "”?")) return; S.my = S.my.filter(function (m) { return m.id !== id; }); delete S.found[id]; save(); index(); closePop(); drawPins(); renderList(); toast("Marker deleted"); return; }
		if (a === "mshare") { var m = p; closePop(); setMode("add"); setPriv(false); $("gm-ftitle").value = m.title; $("gm-fdesc").value = m.desc || ""; pickCat(m.cat); setDraft(m.x, m.y); toast("Check the details, then press Pin it to share it with everyone."); return; }
		if (a === "up" || a === "dn") {
			var want = a === "up" ? 1 : -1, cur = (signing() ? S.hvotes[me() + "|" + id] : S.votes[id]) || 0, v = cur === want ? 0 : want;
			if (Date.now() - T0 < 900) return;
			var job = signing() ? signed("hvote", MAP.hiveVoteJson(id, v), (v === 1 ? "Vote real: " : v === -1 ? "Vote fake: " : "Take back my vote on: ") + p.title.slice(0, 60), b)
				: call({ act: "vote", id: id, vid: S.vid, v: v, t: Date.now() - T0 });
			job.then(function (d) {
				if (!d) return;
				if (d.error) { toast(d.error); return; }
				p.up = d.up; p.dn = d.dn; if (d.hup != null) { p.hup = d.hup; p.hdn = d.hdn; }
				var store = d.hive ? S.hvotes : S.votes, sk = d.hive ? me() + "|" + id : id; if (d.hive) delete S.votes[id];
				if (d.mine) store[sk] = d.mine; else delete store[sk]; save();
				drawPins(); renderList(); openPin(id, true);
				if (v) toast(v === 1 ? "Thanks: marked real" : "Thanks: marked fake");
			});
		} else if (a === "share") {
			var url = location.origin + location.pathname + "?pin=" + id;
			(navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", url); });
		} else if (a === "report") {
			if (!confirm("Report this pin as spam, rude or nonsense? Pins reported by several people are hidden.")) return;
			call({ act: "report", id: id, vid: S.vid }).then(function (d) { toast(d.error || "Reported. Thank you."); });
		} else if (a === "del") {
			if (!confirm("Delete your pin “" + p.title + "”? This can’t be undone.")) return;
			call({ act: "del", id: id, key: S.mine[id] }).then(function (d) {
				if (d.error) { toast(d.error); return; }
				delete S.mine[id]; save(); closePop(); PINS = PINS.filter(function (x) { return x.id !== id; }); delete byId[id]; drawPins(); renderList(); toast("Pin deleted");
			});
		}
	});

	/* "add a pin here?" bubble (explore mode) */
	var askPt = null;
	function askAt(x, y) { askPt = { x: x, y: y }; $("gm-ask").hidden = false; placePop(); }
	$("gm-askno").onclick = function () { $("gm-ask").hidden = true; askPt = null; };
	$("gm-askyes").onclick = function () { var p = askPt; $("gm-ask").hidden = true; setMode("add"); if (p) setDraft(p.x, p.y); };

	/* ======================= list ======================= */
	function chips() {
		var all = allPins(), counts = {}; all.forEach(function (p) { counts[p.cat] = (counts[p.cat] || 0) + 1; });
		$("gm-cats").innerHTML = '<button type="button" class="gm-chip' + (!S.cats.length ? " is-on" : "") + '" data-c="">All <small>' + all.length + "</small></button>" +
			MAP.PIN_CATS.map(function (c) { return '<button type="button" class="gm-chip' + (S.cats.indexOf(c[0]) >= 0 ? " is-on" : "") + (counts[c[0]] ? "" : " is-empty") + '" data-c="' + c[0] + '" aria-pressed="' + (S.cats.indexOf(c[0]) >= 0) + '"><span class="gm-dot" style="background:' + c[2] + '"></span>' + esc(c[1]) + " <small>" + (counts[c[0]] || 0) + "</small></button>"; }).join("");
	}
	$("gm-cats").addEventListener("click", function (e) {
		var b = e.target.closest("[data-c]"); if (!b) return;
		var c = b.getAttribute("data-c");
		if (!c) S.cats = []; else { var i = S.cats.indexOf(c); if (i >= 0) S.cats.splice(i, 1); else S.cats.push(c); }
		save(); drawPins(); renderList();
	});
	function renderList() {
		chips(); renderExplorers(); myCount();
		var list = shown(), base = shownAll(), all = allPins(), ol = $("gm-list"), nf = base.filter(function (p) { return S.found[p.id]; }).length;
		$("gm-count").textContent = all.length ? list.length + (list.length === 1 ? " pin" : " pins") + (list.length < all.length ? " of " + all.length : "") + (PINS.length ? "" : " · no community pins yet: be the first!") : "No pins yet: be the first! Click the map to add one.";
		var pr = $("gm-prog"); if (pr) { pr.hidden = !base.length; $("gm-progt").textContent = "Found " + nf + " of " + base.length + (S.cats.length || $("gm-q").value ? " in this list" : ""); $("gm-progb").style.width = (base.length ? 100 * nf / base.length : 0).toFixed(1) + "%"; }
		ol.innerHTML = list.slice(0, 300).map(function (p) {
			var k = p.kind, st = k ? "" : MAP.statusOf(p), sc = MAP.scoreOf(p), f = S.found[p.id];
			return '<li data-id="' + p.id + '" class="' + (p.id === openId ? "is-open" : "") + (f ? " is-found" : "") + '"><button type="button"><span class="gm-li-i" style="background:' + catColor(p.cat) + '">' + (ICON[p.cat] || "📍") + "</span>" +
				'<span class="gm-li-t"><b>' + esc(p.title) + "</b><small>" + esc(MAP.catName(p.cat)) + (p.region ? " · " + esc(p.region) : "") + (p.ha ? " · @" + esc(p.ha) : "") + (S.mine[p.id] ? " · yours" : "") + (S.notes[p.id] ? " · 📝" : "") + " " +
				(k === "k" ? '<span class="gm-st gm-st--k">MES guide</span>' : k === "m" ? '<span class="gm-st gm-st--m">🔒 Only you</span>' : statusText(st) + hiveBadge(p)) + "</small></span>" +
				(f ? '<span class="gm-li-f" title="Found">✓</span>' : k ? "" : '<span class="gm-li-s' + (sc > 0 ? " is-pos" : sc < 0 ? " is-neg" : "") + '">' + (sc > 0 ? "+" : "") + sc + "</span>") + "</button></li>";
		}).join("");
	}
	$("gm-list").addEventListener("click", function (e) { var li = e.target.closest("li[data-id]"); if (!li) return; var p = byId[li.getAttribute("data-id")]; if (!p) return; centreOn(p.x, p.y); openPin(p.id); if (window.innerWidth < 900) stage.scrollIntoView({ behavior: "smooth", block: "center" }); });
	var qT; $("gm-q").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { drawPins(); renderList(); }, 120); });
	$("gm-sort").value = S.sort || "top"; $("gm-sort").addEventListener("change", function () { S.sort = this.value; save(); renderList(); });
	$("gm-ver").checked = !!S.ver; $("gm-ver").addEventListener("change", function () { S.ver = this.checked; save(); drawPins(); renderList(); });
	$("gm-hiveonly").checked = !!S.hiveOnly; $("gm-hiveonly").addEventListener("change", function () { S.hiveOnly = this.checked; save(); drawPins(); renderList(); });
	function renderExplorers() {
		var ex = MAP.explorers(PINS).slice(0, 20), ol = $("gm-explist");
		$("gm-exp").hidden = !ex.length;
		ol.innerHTML = ex.map(function (e) { return '<li><button type="button" data-acct="' + esc(e.acct) + '">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(e.acct)) + '" width="22" height="22" loading="lazy">') + "<b>@" + esc(e.acct) + "</b><small>" + e.verified + " verified · " + e.pins + (e.pins === 1 ? " pin" : " pins") + "</small></button></li>"; }).join("");
	}
	$("gm-explist").addEventListener("click", function (e) { var b = e.target.closest("[data-acct]"); if (!b) return; $("gm-q").value = "@" + b.getAttribute("data-acct"); S.hiveOnly = false; $("gm-hiveonly").checked = false; drawPins(); renderList(); });
	function flag(id, key, def) { var c = $(id); if (!c) return; c.checked = S[key] == null ? def : !!S[key]; c.addEventListener("change", function () { S[key] = c.checked; save(); if (openId && !byId[openId]) closePop(); drawPins(); renderList(); }); }
	flag("gm-places", "places", true); flag("gm-hidefound", "hideFound", false);
	$("gm-next").onclick = function () {
		var p = MAP.nextUnfound(shownAll(), S.found, openId);
		if (!p) { toast("You have found everything in this list!"); return; }
		centreOn(p.x, p.y, 3); openPin(p.id);
	};
	/* my map: backup / restore of finds, notes and private markers (nothing leaves the browser otherwise) */
	function myCount() { var m = $("gm-mycount"); if (m) m.textContent = S.my.length + " private " + (S.my.length === 1 ? "marker" : "markers") + " · " + Object.keys(S.found).length + " found · " + Object.keys(S.notes).length + (Object.keys(S.notes).length === 1 ? " note" : " notes"); }
	$("gm-backup").onclick = function () {
		var blob = new Blob([JSON.stringify({ app: "mes-gta-map", v: 1, saved: new Date().toISOString(), found: S.found, notes: S.notes, my: S.my }, null, 1)], { type: "application/json" });
		var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gta-6-map-my-finds.json"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
	};
	$("gm-restore").onclick = function () { $("gm-restorefile").click(); };
	$("gm-restorefile").onchange = function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		f.text().then(function (t) {
			var d; try { d = JSON.parse(t); } catch (e) { d = null; }
			if (!d || d.app !== "mes-gta-map") { toast("That is not a GTA 6 map backup file."); return; }
			var n = 0;
			Object.keys(d.found || {}).forEach(function (id) { if (!S.found[id] && typeof d.found[id] === "number") { S.found[id] = d.found[id]; n++; } });
			Object.keys(d.notes || {}).forEach(function (id) { if (!S.notes[id] && typeof d.notes[id] === "string") { S.notes[id] = d.notes[id].slice(0, 2000); n++; } });
			var have = {}; S.my.forEach(function (m) { have[m.id] = 1; });
			(Array.isArray(d.my) ? d.my : []).forEach(function (m) { if (!m || have[m.id] || !/^m-[a-z0-9]{4,12}$/.test(m.id || "")) return; var c = MAP.cleanMarker(m); if (c.error) return; S.my.push(Object.assign(c.m, { id: m.id, c: m.c || Date.now() })); n++; });
			save(); index(); drawPins(); renderList(); toast(n ? "Added " + n + " things from the backup." : "Nothing new in that backup.");
		});
	};
	$("gm-mineonly").checked = !!S.mineOnly; $("gm-mineonly").addEventListener("change", function () { S.mineOnly = this.checked; save(); drawPins(); renderList(); });

	/* ======================= add mode ======================= */
	var mode = "explore", draft = null, fcat = "";
	function setMode(m) {
		mode = m;
		Array.prototype.forEach.call(document.querySelectorAll(".gm-modebtn"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-mode") === m ? "true" : "false"); });
		Array.prototype.forEach.call(document.querySelectorAll(".gm-panel"), function (p) { p.hidden = p.getAttribute("data-panel") !== m; });
		root.classList.toggle("gm-adding", m === "add");
		$("gm-hint").textContent = m === "add" ? "Click the map where it is · drag to move · Ctrl + scroll or pinch to zoom" : "Drag to move · Ctrl + scroll or pinch to zoom · click a pin to open it";
		if (m === "add") { closePop(); $("gm-ask").hidden = true; } else { draft = null; $("gm-draft").innerHTML = ""; }
		updWhere();
	}
	root.querySelector(".gm-mode").addEventListener("click", function (e) { var b = e.target.closest("[data-mode]"); if (b) setMode(b.getAttribute("data-mode")); });
	function setDraft(x, y) {
		draft = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
		var g = $("gm-draft"); g.innerHTML = ""; pinG({ x: draft.x, y: draft.y, cat: fcat || "other", up: 0, dn: 0 }, g, "gm-pin--draft");
		var r = nearRegion(draft.x, draft.y); if (!$("gm-freg").dataset.touched) $("gm-freg").value = r;
		applyView(); updWhere();
		if (window.innerWidth < 900 && !$("gm-ftitle").value) setTimeout(function () { $("gm-form").scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 60);
	}
	function updWhere() {
		var fh = $("gm-fhive");
		if (fh) { fh.hidden = priv || !signing(); fh.innerHTML = signing() ? "This pin will be signed on Hive as <b>@" + esc(me()) + "</b>: a public, permanent record. mes.fm can hide it from the map but not erase it from the blockchain." : ""; } $("gm-where").innerHTML = draft ? "<b>1.</b> Spot picked: " + gridRef(draft.x, draft.y) + " (" + esc($("gm-freg").value) + "). Click again to move it." : "<b>1.</b> Click the map where it is."; $("gm-where").classList.toggle("is-done", !!draft); }
	$("gm-fcat").innerHTML = MAP.PIN_CATS.map(function (c) { return '<button type="button" class="gm-chip" role="radio" aria-checked="false" data-c="' + c[0] + '"><span>' + ICON[c[0]] + "</span> " + esc(c[1]) + "</button>"; }).join("");
	function pickCat(c) {
		fcat = c;
		Array.prototype.forEach.call($("gm-fcat").querySelectorAll("[data-c]"), function (x) { var on = x.getAttribute("data-c") === c; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", on); });
		if (draft) setDraft(draft.x, draft.y);
	}
	$("gm-fcat").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (b) pickCat(b.getAttribute("data-c")); });
	var priv = false;
	function setPriv(on) {
		priv = !!on;
		Array.prototype.forEach.call(document.querySelectorAll("#gm-who [data-who]"), function (b) { var sel = (b.getAttribute("data-who") === "me") === priv; b.classList.toggle("is-on", sel); b.setAttribute("aria-checked", sel); });
		root.classList.toggle("gm-priv", priv);
		$("gm-fsave").textContent = priv ? "Save my marker" : "Pin it";
		$("gm-fdlab").firstChild.nodeValue = priv ? "My note " : "How to find it ";
		updWhere();
	}
	$("gm-who").addEventListener("click", function (e) { var b = e.target.closest("[data-who]"); if (b) setPriv(b.getAttribute("data-who") === "me"); });
	$("gm-freg").innerHTML = MAP.REGIONS.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("");
	$("gm-freg").addEventListener("change", function () { this.dataset.touched = "1"; updWhere(); });
	$("gm-fcancel").onclick = function () { $("gm-form").reset(); fcat = ""; setPriv(false); delete $("gm-freg").dataset.touched; Array.prototype.forEach.call($("gm-fcat").querySelectorAll(".is-on"), function (x) { x.classList.remove("is-on"); }); $("gm-ferr").textContent = ""; setMode("explore"); };
	$("gm-form").addEventListener("submit", function (e) {
		e.preventDefault();
		var err = $("gm-ferr"); err.textContent = "";
		if (!draft) { err.textContent = "Click the map first to put the pin where it is."; return; }
		if (priv) {
			var mk = MAP.cleanMarker({ x: draft.x, y: draft.y, cat: fcat || "other", title: $("gm-ftitle").value, desc: $("gm-fdesc").value, region: $("gm-freg").value });
			if (mk.error) { err.textContent = mk.error.charAt(0).toUpperCase() + mk.error.slice(1) + "."; return; }
			var mid = "m-" + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "0");
			S.my.push(Object.assign(mk.m, { id: mid, c: Date.now() })); save(); index();
			$("gm-fcancel").onclick(); drawPins(); renderList(); openPin(mid); toast("Saved. Only you can see this marker.");
			return;
		}
		if (!fcat) { err.textContent = "Pick what kind of thing it is."; return; }
		var body = { act: "new", x: draft.x, y: draft.y, cat: fcat, title: $("gm-ftitle").value, desc: $("gm-fdesc").value, region: $("gm-freg").value, clip: $("gm-fclip").value.trim(), vid: S.vid, t: Date.now() - T0 };
		if ($("gm-fhp").value) body.hp = $("gm-fhp").value;
		if (signing() && !body.hp) {
			var hc = MAP.cleanPin({ x: body.x, y: body.y, cat: body.cat, title: body.title, desc: body.desc, region: body.region, clip: body.clip });
			if (hc.error) { err.textContent = hc.error.charAt(0).toUpperCase() + hc.error.slice(1) + "."; return; }
			$("gm-fsave").disabled = true;
			signed("hpin", MAP.hivePinJson(hc.pin), "Pin on the GTA 6 map: " + hc.pin.title, $("gm-fsave"), err).then(function (d) {
				$("gm-fsave").disabled = false;
				if (!d) return;
				if (d.error) { err.textContent = d.error.charAt(0).toUpperCase() + d.error.slice(1) + "."; return; }
				err.textContent = "";
				S.mine[d.id] = d.key; save();
				if (d.pin) { PINS.push(d.pin); byId[d.id] = d.pin; }
				$("gm-fcancel").onclick(); drawPins(); renderList(); openPin(d.id); toast("Pinned and signed on Hive as @" + me() + ".");
			});
			return;
		}
		var chk = MAP.cleanPin({ x: body.x, y: body.y, cat: body.cat, title: body.title, desc: body.desc, region: body.region, clip: body.clip });
		if (chk.error) { err.textContent = chk.error.charAt(0).toUpperCase() + chk.error.slice(1) + "."; return; }
		$("gm-fsave").disabled = true;
		call(body).then(function (d) {
			$("gm-fsave").disabled = false;
			if (d.error) { err.textContent = d.error.charAt(0).toUpperCase() + d.error.slice(1) + "."; return; }
			S.mine[d.id] = d.key; save();
			if (d.pin) { PINS.push(d.pin); byId[d.id] = d.pin; }
			$("gm-fcancel").onclick(); drawPins(); renderList(); openPin(d.id); toast("Pinned! Others can now vote on it.");
		});
	});

	/* ======================= Hive (optional) ======================= */
	var HV = window.MESHive || null, MOCKACCT = "mes-gta-map:mockacct";
	function me() { var u = HV && HV.user && HV.user(); if (u) return u.name; if (MOCK) try { return sessionStorage.getItem(MOCKACCT) || ""; } catch (e) {} return ""; }
	function signing() { return !!me() && S.hsign !== false; }
	function avatar(n) { return HV && HV.avatar ? HV.avatar(n, "small") : "https://images.hive.blog/u/" + encodeURIComponent(n) + "/avatar/small"; }
	function realUser() { return !!(HV && HV.user && HV.user()); }
	function renderHive() {
		var box = $("gm-hive"), u = me(); if (!box) return;
		if (u) {
			box.innerHTML = '<div class="gm-hrow">' + (realUser() ? '<img alt="" src="' + esc(avatar(u)) + '" width="26" height="26">' : "") + "<b>@" + esc(u) + '</b><button type="button" class="gm-lnk" data-h="out">Log out</button></div>' +
				'<label class="gm-chk"><input type="checkbox" data-h="sign"' + (S.hsign !== false ? " checked" : "") + "> Sign my pins and votes with Hive (votes count double)</label>";
			box.querySelector('[data-h="out"]').onclick = function () { if (realUser()) HV.logout(); else try { sessionStorage.removeItem(MOCKACCT); } catch (e) {} renderHive(); updWhere(); if (openId) openPin(openId, true); };
			box.querySelector('[data-h="sign"]').onchange = function () { S.hsign = this.checked; save(); updWhere(); if (openId) openPin(openId, true); };
		} else {
			box.innerHTML = '<details class="gm-hlog"><summary><b>Sign in with Hive</b> <small>(optional: your name on pins, votes count double)</small></summary>' +
				'<div class="gm-hrow"><input type="text" data-h="user" placeholder="Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn" data-h="in">Log in</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test copy: any username works and nothing is signed." : "Hive Keychain (the extension, or the Keychain phone app) proves the account is yours by signing a message. Your keys never leave Keychain.") + '</p><div data-h="help"></div></details>';
			var inp = box.querySelector('[data-h="user"]'), btn = box.querySelector('[data-h="in"]');
			var go = function () {
				var n = (inp.value || "").trim().replace(/^@/, "").toLowerCase();
				if (!/^[a-z][a-z0-9.-]{2,15}$/.test(n)) { toast("That is not a Hive username."); return; }
				if (MOCK && !(HV && HV.hasKeychain && HV.hasKeychain())) { try { sessionStorage.setItem(MOCKACCT, n); } catch (e) {} renderHive(); updWhere(); return; }
				if (!HV) { toast("The Hive helpers did not load: reload the page."); return; }
				btn.disabled = true; btn.textContent = "Check Keychain…";
				HV.login(n).then(function () { toast("Signed in as @" + n + "."); renderHive(); updWhere(); if (openId) openPin(openId, true); }, function (e) {
					btn.disabled = false; btn.textContent = "Log in";
					toast((e && e.message) || "Could not log in.");
					if (e && e.code === "nokeychain" && HV.helpHtml) box.querySelector('[data-h="help"]').innerHTML = HV.helpHtml();
				});
			};
			btn.onclick = go; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
		}
	}
	if (HV && HV.onChange) HV.onChange(function () { renderHive(); renderList(); updWhere(); });
	/* sign one custom_json, then let the API check it on the chain (it retries while the block is not in yet) */
	function signed(act, json, label, btn, msgEl) {
		var u = me(), say = function (t) { if (msgEl) msgEl.textContent = t; else toast(t); };
		say("Waiting for Hive Keychain…");
		var p = MOCK && !realUser() ? Promise.resolve({ trx: "mock" + Date.now().toString(16), mockRec: JSON.parse(json) }) : (HV ? HV.keychain() : Promise.resolve(null)).then(function (kc) {
			if (!kc) { var e = new Error("Hive Keychain is not available in this browser. Log in again, or untick “Sign my pins and votes with Hive”."); e.code = "nokeychain"; throw e; }
			return new Promise(function (ok, no) {
				kc.requestCustomJson(u, MAP.HIVE_ID, "Posting", json, label, function (r) {
					if (r && r.success) { var x = r.result || {}; ok({ trx: String(x.id || x.tx_id || x.trx_id || "").toLowerCase() }); }
					else no(HV.kcError ? HV.kcError(r, "Cancelled in Keychain") : new Error((r && r.message) || "Cancelled in Keychain"));
				});
			});
		});
		return p.then(function (res) {
			if (!res.trx) return { error: "Keychain did not return a transaction id" };
			say("Signed. Checking it on the Hive blockchain…");
			return (function check(tries) {
				return call({ act: act, acct: u, trx: res.trx, vid: S.vid, mockRec: res.mockRec }).then(function (d) {
					if (d && d.error && /not on the chain yet/.test(d.error) && tries < 8) { say("Waiting for the next Hive block… (" + (tries + 1) + ")"); return new Promise(function (r) { setTimeout(r, 3500); }).then(function () { return check(tries + 1); }); }
					if (msgEl && !(d && d.error)) msgEl.textContent = "";
					return d;
				});
			})(0);
		}, function (e) {
			say((e && e.message) || "Not signed.");
			if (btn) btn.disabled = false;
			return null;
		});
	}

	/* ======================= fill window, start ======================= */
	function boot() {
		if (window.MESPanel) window.MESPanel.add($("gm-view"), { bar: $("gm-bar").querySelector(".gm-tools"), stage: stage, onChange: function () { setTimeout(applyView, 30); } });
		else setTimeout(boot, 150);
	}
	drawBase(); fit(); setMode("explore"); renderList(); renderHive(); boot();
	window.addEventListener("resize", function () { applyView(); });
	var want = new URLSearchParams(location.search).get("pin");
	refresh().then(function () { if (want && byId[want]) { centreOn(byId[want].x, byId[want].y, 3); openPin(want, true); } });
	setInterval(function () { if (!document.hidden && mode === "explore" && !drag) refresh(true); }, 60000);
	window.MESGTAMapDebug = { me: me, signing: signing, signed: signed, V: V, S: S, pins: function () { return PINS; }, refresh: refresh, setDraft: setDraft, setMode: setMode, openPin: openPin, mapPt: mapPt, mock: mock };
})();

/* MES GTA 6 Hub: hub, countdown, download pages + the tabs and jump calculator of the simulator page (the simulator itself is sim.js).
   #gt[data-page] = hub | jump | countdown | download | music. State: localStorage "mes-gta:v1" (countdown mode / zone, download inputs). */
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

	/* ---------------- equation boxes: scale each typeset formula down to fit its box (no scroll bars) ---------------- */
	(function () {
		var els = Array.prototype.slice.call(root.querySelectorAll(".gj-eq__f")); if (!els.length) return;
		function fit() {
			els.forEach(function (e) {
				var c = e.querySelector("mjx-container"); if (!c || !e.clientWidth) return;
				e.style.fontSize = "";
				var avail = e.clientWidth - 2, w = c.getBoundingClientRect().width;
				if (w > avail) e.style.fontSize = (1.05 * avail / w).toFixed(3) + "em";
			});
		}
		if (window.MutationObserver) els.forEach(function (e) { new MutationObserver(fit).observe(e, { attributes: true, attributeFilter: ["class"], childList: true }); });
		if (window.ResizeObserver) { var lw = 0; new ResizeObserver(function () { var w = root.clientWidth; if (Math.abs(w - lw) > 4) { lw = w; fit(); } }).observe(root); }
		else window.addEventListener("resize", fit);
		var mc = document.getElementById("main-content");
		if (mc && window.MutationObserver) new MutationObserver(function () { setTimeout(fit, 30); }).observe(mc, { attributes: true, attributeFilter: ["style", "class"] });
		window.addEventListener("resize", function () { setTimeout(fit, 50); });
		fit();
	})();

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

	if (PAGE === "music") {
		/* ---------------- music (GTA Radio) ----------------
		    the list is static HTML (data-3s / data-yt / data-sp on each button); nothing loads from 3Speak / YouTube / Spotify until Play. */
		(function () {
		var list = $("gm-list"); if (!list) return;
		var SRC = {"3s": "3Speak", yt: "YouTube", sp: "Spotify"}, cur = null, src = null, mkey = "mes-gta:music";
		function pick(b) { var o = {}; try { o = JSON.parse(localStorage.getItem(mkey) || "{}"); } catch (e) {} return b.getAttribute("data-" + o.src) ? o.src : (b.dataset["3s"] ? "3s" : "yt"); }
		function url(k, v) {
		if (k === "yt") return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(v) + "?autoplay=1&rel=0";
		return "https://open.spotify.com/embed/album/" + encodeURIComponent(v) + "?utm_source=generator&theme=0";
		}
		function link(t, h) { return h ? '<a href="' + esc(h) + '" target="_blank" rel="noopener">' + t + "</a>" : ""; }
		function name(b) { return b.dataset.st ? b.dataset.st.replace(/^GTA ([345]) /, function (m, g) { return "GTA " + {5: "V", 4: "IV", 3: "III"}[g] + " · "; }).replace(/^GTA (Vice City Stories|Vice City|San Andreas) /, "GTA $1 · ") : b.querySelector("b").textContent; }
		function show(b, play) {
		cur = b; src = pick(b);
		[].forEach.call(root.querySelectorAll(".gm-item, .gm-chip[data-yt]"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
		$("gm-title").textContent = name(b); $("gm-note").textContent = b.getAttribute("data-note") || (b.dataset.st ? "The full radio station, uploaded to YouTube by a fan." : "");
		var d = b.dataset, seg = "";
		["3s", "yt", "sp"].forEach(function (k) { if (d[k]) seg += '<button type="button" data-k="' + k + '" aria-pressed="' + (k === src) + '">' + SRC[k] + "</button>"; });
		$("gm-src").innerHTML = seg; $("gm-src").hidden = seg.split("<button").length < 3;
		$("gm-links").innerHTML = [d.q && link("More versions on YouTube", "https://www.youtube.com/results?search_query=" + d.q), link("Hive post", d.hive), d["3s"] && link("3Speak", "https://3speak.tv/watch?v=" + d["3s"]), d.yt && link("YouTube", "https://www.youtube.com/watch?v=" + d.yt), d.sp && link("Spotify", "https://open.spotify.com/album/" + d.sp), link("Apple Music", d.apple), link("Amazon Music", d.amazon), link("Deezer", d.deezer)].filter(Boolean).join(" · ");
		if (play) load(); else poster();
		}
		function posterOf(b) { return b.dataset.st ? "https://i.ytimg.com/vi/" + b.dataset.yt + "/hqdefault.jpg" : b.querySelector("img").getAttribute("src").replace("/320x0/", "/640x0/").replace("/mqdefault.", "/hqdefault."); }
		function poster() {
		stopHls(); var img = posterOf(cur);
		$("gm-screen").className = "gm-screen";
		$("gm-screen").innerHTML = '<button type="button" class="gm-poster" id="gm-poster"><img src="' + esc(img) + '" alt=""><span class="gm-play" aria-hidden="true">▶</span><span class="gm-ptxt">Play on ' + SRC[src] + "</span></button>";
		$("gm-poster").addEventListener("click", load);
		}
		/* 3Speak: never iframe play.3speak.tv/embed (it is a whole 3Speak page now, shown squashed with white bars).
		    Like every other MES page: ask play.3speak.tv/api/embed for the current HLS manifest and play it in our own
		    <video> (native HLS on Safari / iOS, else hls.js); if that fails, fall back to the YouTube upload. */
		var hlsP = null, hlsObj = null;
		function hlsLib() { return hlsP || (hlsP = new Promise(function (ok, no) { if (window.Hls) return ok(window.Hls); var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js"; s.onload = function () { ok(window.Hls); }; s.onerror = function () { hlsP = null; no(); }; document.head.appendChild(s); })); }
		function stopHls() { if (hlsObj) { try { hlsObj.destroy(); } catch (e) {} hlsObj = null; } }
		function load3s(b) {
		var scr = $("gm-screen"), poster = posterOf(b);
		scr.className = "gm-screen";
		scr.innerHTML = '<video controls playsinline preload="auto" poster="' + esc(poster) + '"></video>';
		var vid = scr.querySelector("video"), dead = false;
		function fail() { if (dead || cur !== b) return; dead = true; stopHls(); if (b.dataset.yt) { src = "yt"; loadFrame(b); } else scr.innerHTML = '<p class="gm-err">This video could not be played here. <a href="https://3speak.tv/watch?v=' + esc(b.dataset["3s"]) + '" target="_blank" rel="noopener">Watch it on 3Speak</a>.</p>'; }
		function start(u) {
			if (cur !== b) return;
			function native() { if (!vid.canPlayType("application/vnd.apple.mpegurl")) return fail(); vid.src = u; vid.addEventListener("error", fail); vid.play().catch(function () {}); }
			/* hls.js first wherever Media Source works (some desktop Chromes now answer "maybe" for HLS and then fail); native HLS for iPhone Safari */
			if (!window.MediaSource && !window.ManagedMediaSource) return native();
			hlsLib().then(function (H) {
			if (cur !== b) return; if (!H || !H.isSupported()) return native();
			hlsObj = new H(); hlsObj.loadSource(u); hlsObj.attachMedia(vid);
			hlsObj.on(H.Events.MANIFEST_PARSED, function () { vid.play().catch(function () {}); });
			hlsObj.on(H.Events.ERROR, function (e, d) { if (d && d.fatal) fail(); });
			}, native);
		}
		fetch("https://play.3speak.tv/api/embed?v=" + encodeURIComponent(b.dataset["3s"]).replace("%2F", "/")).then(function (r) { return r.json(); })
			.then(function (d) { if (d && d.videoUrl) start(d.videoUrl); else fail(); }, fail);
		}
		function load() { stopHls(); if (src === "3s") load3s(cur); else loadFrame(cur); }
		function loadFrame(b) {
		var v = b.dataset[src], sp = src === "sp";
		$("gm-screen").className = "gm-screen" + (sp ? " is-sp" : "");
		$("gm-screen").innerHTML = '<iframe src="' + esc(url(src, v)) + '" title="' + esc(name(b)) + '" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
		}
		list.addEventListener("click", function (e) { var b = e.target.closest(".gm-item"); if (b) show(b, cur !== b || !$("gm-screen").querySelector("iframe, video")); });
		root.querySelector(".gm-games").addEventListener("click", function (e) {
			var b = e.target.closest(".gm-chip[data-yt]"); if (!b) return;
			show(b, true);
			var r = $("gm-screen").getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight) window.scrollTo({top: scrollY + r.top - 80, behavior: "smooth"});
		});
		$("gm-src").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-k]"); if (!b) return;
		try { localStorage.setItem(mkey, JSON.stringify({src: b.getAttribute("data-k")})); } catch (er) {}
		var playing = !!$("gm-screen").querySelector("iframe, video"); show(cur, playing);
		});
		show(list.querySelector(".gm-item"), false);
		})();
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
