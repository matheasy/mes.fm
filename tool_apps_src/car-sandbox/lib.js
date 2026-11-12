/* MES Car Sandbox: pure data and maths (window.MESCar; also require()-able in node for the tests).
   Worlds (gravity, air, sky, terrain recipe), cars, gravity presets, seeded terrain heights, the Earth test track,
   built-in stunt pieces, object spawn layouts, computer-driver steering and felt g-force.
   Conventions: metres, kg, seconds; Y is up; a car with yaw 0 faces +Z; positive steer = turn left (towards +X when facing +Z). */
(function (root) {
	"use strict";
	var C = {};
	C.G0 = 9.80665;

	/* ---------- gravity presets (surface gravity, m/s^2) ---------- */
	C.GRAVITY = [
		["Zero g", 0], ["Ceres", 0.28], ["Pluto", 0.62], ["Moon", 1.62], ["Mars", 3.71], ["Mercury", 3.70], ["Venus", 8.87],
		["Earth", 9.81], ["Saturn", 10.44], ["Neptune", 11.15], ["Jupiter", 24.79], ["Sun", 274]
	];

	/* ---------- worlds ---------- */
	C.WORLDS = {
		earth: { name: "Test track (Earth)", g: 9.81, rho: 1.225, car: "sports", seed: 7, size: 640, n: 160,
			sky: ["#5d9be0", "#cfe3f5"], fog: ["#cfe3f5", 220, 700], ground: ["#5f8f3e", "#7aa64e", "#8a7c55"], sun: [0.55, 0.75, 0.35], sunCol: "#fff6e5", amb: 0.55,
			track: true, trees: true, desc: "Grass, an asphalt oval, jumps, a loop and a stunt park." },
		moon: { name: "The Moon", g: 1.62, rho: 0, car: "rover", seed: 11, size: 700, n: 175,
			sky: ["#000000", "#05060a"], fog: null, ground: ["#8d8d8a", "#a8a8a3", "#6e6e6b"], sun: [-0.4, 0.45, 0.6], sunCol: "#ffffff", amb: 0.18,
			stars: true, planet: "earth", craters: 70, desc: "1/6 of Earth's gravity, no air, craters and the Earth in a black sky." },
		mars: { name: "Mars", g: 3.71, rho: 0.020, car: "rover", seed: 23, size: 700, n: 175,
			sky: ["#c9905f", "#e8c49a"], fog: ["#d9ad80", 160, 640], ground: ["#a5532c", "#c06b3c", "#7d3d22"], sun: [0.3, 0.6, -0.5], sunCol: "#fff0dc", amb: 0.5,
			dunes: true, rocks: 60, craters: 18, desc: "38% of Earth's gravity, thin air, red dunes and rocks." },
		ceres: { name: "Ceres (dwarf planet)", g: 0.28, rho: 0, car: "buggy", seed: 31, size: 600, n: 150,
			sky: ["#000000", "#020205"], fog: null, ground: ["#55524f", "#6c6864", "#3e3c3a"], sun: [0.7, 0.3, 0.3], sunCol: "#ffffff", amb: 0.16,
			stars: true, planet: "saturn", craters: 110, bumpy: true, desc: "3% of Earth's gravity: one bump and you fly for half a minute." },
		jupiter: { name: "Heavy world (Jupiter g)", g: 24.79, rho: 1.225, car: "monster", seed: 41, size: 640, n: 160,
			sky: ["#b08a5d", "#e6cfa6"], fog: ["#dcc39a", 180, 640], ground: ["#8c7a5a", "#a08c66", "#6b5c43"], sun: [0.5, 0.7, 0.2], sunCol: "#fff3d6", amb: 0.5,
			track: true, desc: "An imaginary solid surface with Jupiter's gravity (2.5 times Earth's): everything is heavy." }
	};
	C.WORLD_ORDER = ["earth", "moon", "mars", "ceres", "jupiter"];

	/* ---------- cars ----------
	   l/w/h = body box (m); cab = [height, length share, z offset share] or null; wr = wheel radius, ww = wheel width,
	   wx = half track, wf / wb = front / rear axle z, ry = wheel mount height (body-local), rest = suspension rest length,
	   k = spring stiffness (per unit mass, Rapier units), drive: "rwd" | "fwd" | "awd", F = engine force per driven wheel (N) at standstill,
	   vmax = engine top speed (m/s), cdA = drag area (m^2), grip = tyre friction slip. */
	C.CARS = {
		sports: { name: "Sports car", mass: 1250, l: 4.3, w: 1.85, h: 0.55, cab: [0.5, 0.45, -0.05], wr: 0.34, ww: 0.26, wx: 0.82, wf: 1.35, wb: -1.35, ry: -0.05, rest: 0.30, k: 34, drive: "rwd", F: 3400, vmax: 72, cdA: 0.62, grip: 2.4, steer: 0.55, color: "#d62828" },
		suv: { name: "SUV", mass: 2100, l: 4.7, w: 1.95, h: 0.8, cab: [0.7, 0.6, -0.1], wr: 0.40, ww: 0.28, wx: 0.86, wf: 1.45, wb: -1.4, ry: -0.15, rest: 0.42, k: 28, drive: "awd", F: 2600, vmax: 55, cdA: 0.95, grip: 2.0, steer: 0.5, color: "#2b6cb0" },
		truck: { name: "Pickup truck", mass: 2500, l: 5.6, w: 2.0, h: 0.85, cab: [0.75, 0.32, 0.18], wr: 0.42, ww: 0.3, wx: 0.88, wf: 1.85, wb: -1.75, ry: -0.15, rest: 0.45, k: 30, drive: "awd", F: 3000, vmax: 50, cdA: 1.1, grip: 2.0, steer: 0.48, color: "#e5e5e5", bed: true },
		bus: { name: "Bus", mass: 11000, l: 11, w: 2.5, h: 2.6, cab: null, wr: 0.5, ww: 0.34, wx: 1.05, wf: 3.6, wb: -3.2, ry: -1.1, rest: 0.4, k: 34, drive: "rwd", F: 16000, vmax: 30, cdA: 6.5, grip: 2.0, steer: 0.5, color: "#f2b705", windows: true },
		monster: { name: "Monster truck", mass: 4200, l: 4.6, w: 2.2, h: 0.75, cab: [0.7, 0.45, -0.05], wr: 0.95, ww: 0.75, wx: 1.35, wf: 1.65, wb: -1.65, ry: 0.15, rest: 0.85, k: 22, drive: "awd", F: 7500, vmax: 42, cdA: 1.6, grip: 2.6, steer: 0.55, color: "#7b2cbf" },
		buggy: { name: "Dune buggy", mass: 700, l: 3.3, w: 1.7, h: 0.4, cab: null, cage: true, wr: 0.42, ww: 0.32, wx: 0.85, wf: 1.15, wb: -1.1, ry: 0.0, rest: 0.5, k: 26, drive: "rwd", F: 2200, vmax: 45, cdA: 0.8, grip: 2.4, steer: 0.6, color: "#ff8800" },
		rover: { name: "Lunar rover", mass: 700, l: 3.1, w: 1.9, h: 0.3, cab: null, rover: true, wr: 0.41, ww: 0.24, wx: 0.95, wf: 1.15, wb: -1.15, ry: 0.0, rest: 0.45, k: 22, drive: "awd", F: 1200, vmax: 22, cdA: 0.9, grip: 2.2, steer: 0.6, color: "#c9b27c" },
		kart: { name: "Go-kart", mass: 160, l: 1.8, w: 1.25, h: 0.25, cab: null, kart: true, wr: 0.15, ww: 0.18, wx: 0.58, wf: 0.6, wb: -0.6, ry: -0.05, rest: 0.12, k: 60, drive: "rwd", F: 520, vmax: 28, cdA: 0.5, grip: 2.6, steer: 0.55, color: "#16a34a" }
	};
	/* side profiles for the closed cars (drawn by extruding them across the car's width): z from the rear (-0.5) to the front (+0.5) of the length,
	   y from the bottom (0) to the top (1) of body + cabin height. win = side window, ws / rs = front / rear screen edge (bottom, top). */
	C.PROFILES = {
		coupe: { body: [[-.5, .12], [-.5, .45], [-.46, .52], [-.3, .55], [-.13, .88], [.06, .92], [.24, .6], [.46, .47], [.5, .38], [.5, .12]], win: [[-.12, .6], [-.05, .82], [.06, .85], [.2, .6]], ws: [[.235, .6], [.075, .905]], rs: [[-.29, .56], [-.135, .875]] },
		suv: { body: [[-.5, .1], [-.5, .82], [-.46, .93], [.16, .95], [.3, .62], [.47, .55], [.5, .45], [.5, .1]], win: [[-.44, .62], [-.42, .86], [.14, .88], [.26, .63]], ws: [[.295, .63], [.165, .935]] },
		pickup: { body: [[-.5, .1], [-.5, .55], [-.06, .55], [-.05, .94], [.14, .95], [.27, .62], [.47, .55], [.5, .45], [.5, .1]], win: [[-.03, .62], [-.025, .86], [.12, .88], [.235, .63]], ws: [[.265, .63], [.145, .935]] },
		bus: { body: [[-.5, .06], [-.5, .96], [-.48, 1], [.47, 1], [.5, .95], [.5, .06]], win: [[-.46, .55], [-.46, .86], [.38, .86], [.38, .55]], ws: [[.5, .5], [.5, .9]] }
	};
	C.STYLE = { sports: "coupe", suv: "suv", truck: "pickup", bus: "bus", monster: "suv" };
	C.CAR_ORDER = ["sports", "suv", "truck", "bus", "monster", "buggy", "rover", "kart"];
	C.PAINT = ["#d62828", "#2b6cb0", "#f2b705", "#16a34a", "#7b2cbf", "#ff8800", "#e5e5e5", "#222222", "#0ea5e9", "#db2777"];

	/* ---------- weather ----------
	   grip = share of dry tyre grip (wet asphalt ~0.7, packed snow ~0.3), fog = fog distance factor, over = how overcast (0-1),
	   p = particles ("rain" streaks, "snow" flakes, "dust"), n = how many, fall = falling speed m/s, wind = sideways drift m/s. */
	C.WEATHER = {
		clear: { name: "Clear", icon: "☀️", grip: 1, fog: 1, over: 0, p: null },
		rain: { name: "Rain", icon: "🌧️", grip: 0.7, fog: 0.4, over: 0.65, p: "rain", n: 4500, fall: 9, wind: 1.5, fogCol: "#8d969f" },
		storm: { name: "Thunderstorm", icon: "⛈️", grip: 0.6, fog: 0.28, over: 0.85, p: "rain", n: 7500, fall: 11, wind: 5, fogCol: "#5d656e", lightning: true },
		snow: { name: "Snow", icon: "🌨️", grip: 0.32, fog: 0.33, over: 0.6, p: "snow", n: 6500, fall: 1.3, wind: 1.2, fogCol: "#d8dee6", snowy: true },
		fog: { name: "Thick fog", icon: "🌫️", grip: 0.9, fog: 0.09, over: 0.5, p: null, fogCol: "#b4bcc4" },
		dust: { name: "Dust storm", icon: "🌪️", grip: 0.8, fog: 0.12, over: 0.6, p: "dust", n: 5000, fall: 0.4, wind: 14, fogCol: "#c98a55" },
		co2snow: { name: "CO₂ snow (Mars poles)", icon: "❄️", grip: 0.4, fog: 0.4, over: 0.4, p: "snow", n: 4500, fall: 0.6, wind: 2, fogCol: "#e6d3c0", snowy: true }
	};
	/* which weather each world can have (no air = no weather) */
	C.weatherFor = function (wid) { var W = C.WORLDS[wid]; if (!W || !W.rho) return ["clear"]; if (wid === "mars") return ["clear", "dust", "co2snow"]; return ["clear", "rain", "storm", "snow", "fog"]; };

	/* ---------- time of day ----------
	   sun direction at hour h (0-24) for a world whose midday-ish sun points along base (its W.sun): rises at 6, highest at 12 (about 67°),
	   sets at 18, swinging across the sky. day = how much daylight (0 night .. 1 full day), dusk = how strong sunrise / sunset colours are,
	   sunK / moonK = strength of direct sun light / moon light (0..1). */
	function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
	C.sunAt = function (h, base) {
		var a = ((h - 6) / 24) * 2 * Math.PI, elev = Math.sin(a) * 0.92, ce = Math.sqrt(1 - elev * elev);
		var az0 = Math.atan2(base[0], base[2]), az = az0 + (a - Math.PI / 2) * 0.9;
		return { dir: [Math.sin(az) * ce, elev, Math.cos(az) * ce], elev: elev, day: sstep(-0.17, 0.09, elev), dusk: elev > -0.14 ? Math.max(0, 1 - Math.abs(elev - 0.02) / 0.17) : 0, sunK: sstep(0, 0.16, elev), moonK: sstep(0.02, -0.12, elev) };
	};
	C.fmtTime = function (h) { h = ((h % 24) + 24) % 24; var hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm; };
	C.timeName = function (h) { h = ((h % 24) + 24) % 24; return h < 4.5 ? "Night" : h < 5.6 ? "Before dawn" : h < 7.2 ? "Sunrise" : h < 11 ? "Morning" : h < 13.5 ? "Midday" : h < 16.8 ? "Afternoon" : h < 18.6 ? "Sunset" : h < 19.6 ? "Dusk" : "Night"; };
	/* how long a whole game day takes when the clock runs (minutes) */
	C.CYCLES = [[2, "2 minutes"], [6, "6 minutes"], [15, "15 minutes"], [60, "1 hour"], [1440, "24 hours (real time)"]];

	/* ---------- seeded randomness + noise ---------- */
	C.rng = function (seed) { var s = (seed >>> 0) || 1; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
	function hash2(ix, iz, seed) { var h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
	function smooth(t) { return t * t * (3 - 2 * t); }
	C.noise = function (x, z, seed) {
		var ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
		var a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
		return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz; /* 0..1 */
	};
	C.fbm = function (x, z, seed, oct) { var s = 0, a = 0.5, f = 1, n = 0; for (var i = 0; i < (oct || 4); i++) { s += a * (C.noise(x * f, z * f, seed + i * 17) * 2 - 1); n += a; a *= 0.5; f *= 2.03; } return s / n; /* -1..1 */ };

	/* ---------- the Earth test track: a stadium oval (two straights + two half circles) ---------- */
	C.TRACK = { half: 110, r: 72, width: 16, cz: -40 };
	/* point at distance s (0..length) along the centre line, anticlockwise seen from above, starting at the middle of the near straight */
	C.trackLength = function () { var T = C.TRACK; return 4 * T.half + 2 * Math.PI * T.r; };
	C.trackPoint = function (s) {
		var T = C.TRACK, L = C.trackLength(); s = ((s % L) + L) % L;
		var h = T.half, r = T.r, arc = Math.PI * r;
		/* near straight: z = cz + r, x from 0 to +h (heading +x), then arc round x=+h, far straight from +h to -h, arc round x=-h, back to 0 */
		if (s < h) return { x: s, z: T.cz + r, dir: Math.PI / 2 };
		s -= h; if (s < arc) { var a = s / r; return { x: h + r * Math.sin(a), z: T.cz + r * Math.cos(a), dir: Math.PI / 2 + a }; }
		s -= arc; if (s < 2 * h) return { x: h - s, z: T.cz - r, dir: -Math.PI / 2 };
		s -= 2 * h; if (s < arc) { var b = s / r; return { x: -h - r * Math.sin(b), z: T.cz - r * Math.cos(b), dir: -Math.PI / 2 + b }; }
		s -= arc; return { x: -h + s, z: T.cz + r, dir: Math.PI / 2 };
	};
	/* distance from (x, z) to the track centre line */
	C.trackDist = function (x, z) {
		var T = C.TRACK, h = T.half, dz = z - T.cz;
		if (x >= -h && x <= h) return Math.abs(Math.abs(dz) - T.r);
		var cx = x > h ? h : -h; return Math.abs(Math.hypot(x - cx, dz) - T.r);
	};

	/* nearest point on the track centre line: {s (distance along it, 0 = start line), d (distance from it)}. Exact for the stadium shape. */
	C.trackNearest = function (x, z) {
		var T = C.TRACK, h = T.half, r = T.r, arc = Math.PI * r, dz = z - T.cz, s;
		if (x >= -h && x <= h) s = dz >= 0 ? (x >= 0 ? x : 4 * h + 2 * arc + x) : h + arc + (h - x);
		else if (x > h) { var a = Math.atan2(x - h, dz); if (a < 0) a += 2 * Math.PI; s = h + Math.min(a, Math.PI) * r; }
		else { var b = Math.atan2(-h - x, -dz); if (b < 0) b += 2 * Math.PI; s = 3 * h + arc + Math.min(b, Math.PI) * r; }
		var L = C.trackLength(); s = ((s % L) + L) % L;
		return { s: s, d: C.trackDist(x, z) };
	};
	/* lap timing: a lap counts only when the four quarters of the track are entered in order and the car crosses the start line going forward.
	   lap = state object (start with C.lapNew()); feed it the car's track position each step: returns events [{t: "start"|"sector"|"lap"|"wrong", ...}]. */
	C.SECTORS = 4;
	C.lapNew = function () { return { sec: -1, t0: null, splits: [], next: 0, laps: 0, last: null, valid: false }; };
	C.lapStep = function (st, s, d, now) {
		var L = C.trackLength(), n = C.SECTORS, sec = Math.min(n - 1, Math.floor(s / (L / n))), ev = [];
		if (d > C.TRACK.width * 1.5) return ev; /* off the track: positions there don't count */
		if (st.sec === -1) { st.sec = sec; return ev; }
		if (sec === st.sec) return ev;
		if (sec === (st.sec + 1) % n) {
			if (sec === 0) { /* crossed the start line forward */
				if (st.valid && st.next === 0 && st.t0 != null) { var lt = now - st.t0; st.splits.push(lt); st.laps++; st.last = { time: lt, splits: st.splits.slice() }; ev.push({ t: "lap", time: lt, splits: st.splits.slice() }); }
				else ev.push({ t: "start" });
				st.t0 = now; st.splits = []; st.next = 1; st.valid = true;
			} else if (st.valid && sec === st.next) { st.splits.push(now - st.t0); st.next = (sec + 1) % n; ev.push({ t: "sector", n: sec, time: now - st.t0 }); }
			else st.valid = false;
		} else { st.valid = false; if (sec === (st.sec + n - 1) % n) ev.push({ t: "wrong" }); }
		st.sec = sec; return ev;
	};
	/* ghost of the best lap: samples [t, x, y, z, qx, qy, qz, qw]; pose at time t (linear position, normalised linear quaternion blend) */
	C.ghostPose = function (g, t) {
		if (!g || !g.length || t < g[0][0] || t > g[g.length - 1][0]) return null;
		var lo = 0, hi = g.length - 1; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (g[m][0] <= t) lo = m; else hi = m; }
		var a = g[lo], b = g[hi], f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0, dot = a[4] * b[4] + a[5] * b[5] + a[6] * b[6] + a[7] * b[7], sg = dot < 0 ? -1 : 1, q = [], n = 0, i;
		for (i = 4; i < 8; i++) { q.push(a[i] + (b[i] * sg - a[i]) * f); n += q[i - 4] * q[i - 4]; }
		n = Math.sqrt(n) || 1;
		return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, z: a[3] + (b[3] - a[3]) * f, q: [q[0] / n, q[1] / n, q[2] / n, q[3] / n] };
	};
	C.ghostSample = function (t, p, q) { var r2 = function (v) { return Math.round(v * 100) / 100; }, r3 = function (v) { return Math.round(v * 1000) / 1000; }; return [r2(t), r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)]; };
	/* stunt name from the turns made in the air (radians about the car's own x = pitch, y = yaw, z = roll; + pitch = nose down = front flip) */
	C.stuntName = function (pitch, yaw, roll) {
		function n(a) { return Math.floor(Math.abs(a) / (2 * Math.PI) + 0.2); }
		var parts = [], words = ["", "", "Double ", "Triple ", "Quadruple "];
		var fp = n(pitch), fr = n(roll), fy = Math.floor(Math.abs(yaw) / Math.PI + 0.15);
		if (fp) parts.push((words[fp] !== undefined ? words[fp] : fp + "x ") + (pitch > 0 ? "front flip" : "backflip"));
		if (fr) parts.push((words[fr] !== undefined ? words[fr] : fr + "x ") + "barrel roll");
		if (fy >= 2) parts.push(fy * 180 + "° spin"); else if (fy === 1 && (fp || fr)) parts.push("180");
		return { name: parts.join(" + "), turns: fp + fr + Math.floor(fy / 2) };
	};
	C.fmtLap = function (t) { if (t == null || !isFinite(t)) return "–"; var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); };
	C.lapKey = function (world, car, g) { return world + "|" + car + "|" + (+g).toFixed(2); };

	/* ---------- craters (seeded list) ---------- */
	C.craters = function (wid) {
		var W = C.WORLDS[wid], out = []; if (!W.craters) return out;
		var r = C.rng(W.seed * 977 + 5), half = W.size / 2 - 20;
		for (var i = 0; i < W.craters; i++) {
			var R = 4 + Math.pow(r(), 2.2) * 38, x = (r() * 2 - 1) * half, z = (r() * 2 - 1) * half;
			if (Math.hypot(x, z) < 30 + R) continue; /* keep the start clear */
			out.push({ x: x, z: z, R: R, d: R * (0.18 + r() * 0.12) });
		}
		return out;
	};
	function craterH(cs, x, z) {
		var h = 0;
		for (var i = 0; i < cs.length; i++) {
			var c = cs[i], q = Math.hypot(x - c.x, z - c.z) / c.R; if (q > 1.6) continue;
			if (q < 1) h += c.d * (q * q - 1) + c.d * 0.25 * Math.pow(q, 8); /* bowl, rim rising at the edge */
			else h += c.d * 0.25 * Math.exp(-Math.pow((q - 1) / 0.22, 2)); /* rim falling away outside */
		}
		return h;
	}

	/* ---------- terrain height (deterministic per world) ---------- */
	C.makeTerrain = function (wid) {
		var W = C.WORLDS[wid], seed = W.seed, cs = C.craters(wid), half = W.size / 2;
		function edge(x, z) { var e = Math.max(Math.abs(x), Math.abs(z)) - (half - 60); return e > 0 ? e * e * 0.012 : 0; } /* the land rises at the border */
		var f;
		if (W.track) {
			f = function (x, z) {
				var hills = C.fbm(x / 90, z / 90, seed, 4) * 9 + C.fbm(x / 22, z / 22, seed + 3, 2) * 0.8;
				var d = C.trackDist(x, z), T = C.TRACK;
				var inField = (Math.abs(x) < T.half + T.r - 10 && Math.abs(z - T.cz) < T.r - 8) || (Math.abs(x) < T.half && Math.abs(z - T.cz) < T.r);
				var flat = inField ? 0 : Math.min(1, Math.max(0, (d - T.width * 0.5 - 6) / 26));
				if (Math.hypot(x, z - 70) < 50) flat = Math.min(flat, Math.max(0, (Math.hypot(x, z - 70) - 30) / 20));
				return Math.max(0, hills + 3) * flat * flat + edge(x, z);
			};
		} else if (W.dunes) {
			f = function (x, z) {
				var start = Math.min(1, Math.hypot(x, z) / 45);
				var dune = Math.pow(Math.abs(Math.sin(x / 26 + C.fbm(x / 120, z / 120, seed, 3) * 3)), 1.6) * 5;
				return (dune + C.fbm(x / 70, z / 70, seed + 2, 4) * 7 + C.fbm(x / 9, z / 9, seed + 5, 2) * 0.35) * start + craterH(cs, x, z) + edge(x, z);
			};
		} else {
			var amp = W.bumpy ? 12 : 4;
			f = function (x, z) {
				var start = Math.min(1, Math.hypot(x, z) / 45); start *= start;
				return (C.fbm(x / 80, z / 80, seed, 5) * amp + C.fbm(x / 12, z / 12, seed + 9, 2) * (W.bumpy ? 0.9 : 0.35)) * start + craterH(cs, x, z) + edge(x, z);
			};
		}
		return { size: W.size, n: W.n, height: f, craters: cs };
	};
	/* the height grid laid out the way Rapier's heightfield wants it: index = ix * (n + 1) + iz, x and z from -size/2 to +size/2 */
	C.heightGrid = function (ter) {
		var n = ter.n, s = ter.size, H = new Float32Array((n + 1) * (n + 1));
		for (var ix = 0; ix <= n; ix++) for (var iz = 0; iz <= n; iz++) H[ix * (n + 1) + iz] = ter.height(-s / 2 + ix * s / n, -s / 2 + iz * s / n);
		return H;
	};
	/* height between grid points, interpolated on the same two triangles per cell the physics uses (good to a few cm) */
	C.gridHeight = function (ter, H, x, z) {
		var n = ter.n, s = ter.size, gx = (x + s / 2) / s * n, gz = (z + s / 2) / s * n;
		gx = Math.max(0, Math.min(n - 1e-6, gx)); gz = Math.max(0, Math.min(n - 1e-6, gz));
		var ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, k = n + 1;
		var a = H[ix * k + iz], b = H[(ix + 1) * k + iz], c = H[ix * k + iz + 1], d = H[(ix + 1) * k + iz + 1];
		return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
	};

	/* ---------- built-in stunt pieces per world ----------
	   ramp: {t:"ramp", x, z, yaw, w, l, h} (wedge rising along its facing direction); loop: {t:"loop", x, z, yaw, r, w};
	   block: {t:"block", x, z, yaw, w, l, h}; tube: a half pipe made of planks. */
	C.statics = function (wid) {
		var W = C.WORLDS[wid], s = [];
		if (W.track) {
			var T = C.TRACK, zn = T.cz + T.r;
			s.push({ t: "ramp", x: -60, z: zn - 3, yaw: Math.PI / 2, w: 7, l: 12, h: 2.4 });
			s.push({ t: "ramp", x: 40, z: T.cz - T.r + 3, yaw: -Math.PI / 2, w: 7, l: 10, h: 1.6 });
			/* stunt park inside the oval */
			s.push({ t: "ramp", x: -70, z: T.cz + 10, yaw: Math.PI / 2, w: 10, l: 18, h: 5 });
			s.push({ t: "ramp", x: -30, z: T.cz + 10, yaw: -Math.PI / 2, w: 10, l: 22, h: 4.4 }); /* landing ramp facing back */
			s.push({ t: "loop", x: 40, z: T.cz + 15, yaw: Math.PI / 2, r: 9, w: 7 });
			s.push({ t: "ramp", x: 0, z: T.cz - 30, yaw: 0, w: 6, l: 9, h: 3.2 });
			s.push({ t: "ramp", x: 70, z: T.cz - 25, yaw: Math.PI, w: 14, l: 30, h: 8 }); /* the mega ramp */
			s.push({ t: "pipe", x: -5, z: 70, yaw: 0, r: 10, l: 40 });
			s.push({ t: "block", x: 25, z: 70, yaw: 0.3, w: 12, l: 4, h: 1.2 });
		} else {
			s.push({ t: "ramp", x: 0, z: 40, yaw: 0, w: 8, l: 14, h: 3.5 });
			s.push({ t: "ramp", x: -30, z: -10, yaw: -Math.PI / 2, w: 8, l: 18, h: 6 });
			s.push({ t: "ramp", x: 35, z: -30, yaw: 2.4, w: 10, l: 24, h: 9 });
		}
		return s;
	};
	/* the corners of a wedge ramp (local: x across, y up, z along; high end at +z), for a convex hull */
	C.rampPoints = function (w, l, h) {
		var a = w / 2, b = l / 2;
		return [-a, 0, -b, a, 0, -b, -a, 0, b, a, 0, b, -a, h, b, a, h, b];
	};
	/* a corkscrew loop as planks: each {x, y, z (local, loop starts at z=0 going +z), angle (about x), len, w} */
	C.loopPlanks = function (r, w, n) {
		var out = [], N = n || 40, run = 2 * Math.PI * r / N * 1.04;
		for (var i = 0; i < N; i++) {
			var a = (i + 0.5) / N * 2 * Math.PI; /* 0 at the bottom, going forward then up */
			out.push({ x: (i + 0.5) / N * (w + 1.5), y: r - r * Math.cos(a), z: r * Math.sin(a), angle: -a, len: run, w: w });
		}
		return out;
	};
	/* half pipe cross-section planks: {x, y, angle (about z), len} with the pipe running along z */
	C.pipePlanks = function (r, n) {
		var out = [], N = n || 18;
		for (var i = 0; i <= N; i++) { var a = -Math.PI * 0.47 + i / N * Math.PI * 0.94; out.push({ x: r * Math.sin(a), y: r - r * Math.cos(a), angle: a, len: Math.PI * 0.94 * r / N * 1.08 }); }
		return out;
	};

	/* ---------- spawnable objects ---------- */
	C.OBJECTS = {
		crate: { name: "Crate", icon: "📦", shape: "box", size: [1, 1, 1], mass: 25, color: "#b07a3c" },
		bigcrate: { name: "Big crate", icon: "🟫", shape: "box", size: [2.2, 2.2, 2.2], mass: 160, color: "#9a6630" },
		barrel: { name: "Barrel", icon: "🛢️", shape: "cyl", size: [0.42, 1.2], mass: 40, color: "#c0392b" },
		ball: { name: "Beach ball", icon: "🏐", shape: "ball", size: [0.6], mass: 1.5, color: "#f5f5f5", bounce: 0.85 },
		bigball: { name: "Giant ball", icon: "🔴", shape: "ball", size: [2.6], mass: 400, color: "#e63946", bounce: 0.6 },
		cone: { name: "Traffic cone", icon: "🔺", shape: "cone", size: [0.25, 0.75], mass: 3, color: "#ff6b00" },
		tyre: { name: "Tyre", icon: "⭕", shape: "tyre", size: [0.5, 0.28], mass: 12, color: "#1c1c1c", bounce: 0.5 },
		boulder: { name: "Boulder", icon: "🪨", shape: "rock", size: [1.6], mass: 4000, color: "#7a7470" },
		melon: { name: "Watermelon", icon: "🍉", shape: "ball", size: [0.22], mass: 7, color: "#2f8f3a", breaks: 7 },
		glass: { name: "Glass pane", icon: "🪟", shape: "box", size: [2.4, 1.8, 0.06], mass: 30, color: "#9fd3ff", breaks: 4, glass: true },
		pin: { name: "Giant bowling pin", icon: "🎳", shape: "pin", size: [0.4, 2.0], mass: 30, color: "#fafafa" },
		domino: { name: "Domino", icon: "🁢", shape: "box", size: [1.2, 2.4, 0.3], mass: 60, color: "#f1f1f1" }
	};
	C.OBJ_ORDER = ["crate", "bigcrate", "barrel", "ball", "bigball", "cone", "tyre", "boulder", "melon", "glass", "pin"];
	/* group layouts, relative to a base point; the base faces +z (rows go across x) */
	C.LAYOUTS = {
		pyramid: { name: "Crate pyramid", icon: "🔼" }, wall: { name: "Brick wall", icon: "🧱" }, dominoes: { name: "Domino run", icon: "🁢" },
		pins: { name: "Bowling pins", icon: "🎳" }, cones: { name: "Cone slalom", icon: "🚧" }, rain: { name: "Rain of random stuff", icon: "🌧️" }
	};
	C.layout = function (kind, rnd) {
		var out = [], i, j;
		if (kind === "pyramid") { for (j = 0; j < 5; j++) for (i = 0; i < 5 - j; i++) out.push({ k: "crate", x: (i - (4 - j) / 2) * 1.02, y: 0.5 + j * 1.0, z: 0 }); }
		else if (kind === "wall") { for (j = 0; j < 6; j++) for (i = 0; i < 9; i++) out.push({ k: "brick", x: (i - 4 + (j % 2) * 0.5) * 1.02, y: 0.25 + j * 0.5, z: 0 }); }
		else if (kind === "dominoes") { for (i = 0; i < 24; i++) { var a = i / 23 * Math.PI * 1.2; out.push({ k: "domino", x: Math.sin(a) * 14 - 0, y: 1.2, z: 14 - Math.cos(a) * 14 + i * 0.2, yaw: a }); } }
		else if (kind === "pins") { for (j = 0; j < 4; j++) for (i = 0; i <= j; i++) out.push({ k: "pin", x: (i - j / 2) * 1.3, y: 1.0, z: j * 1.15 }); }
		else if (kind === "cones") { for (i = 0; i < 10; i++) out.push({ k: "cone", x: (i % 2 ? 1 : -1) * 2.2, y: 0.4, z: i * 6 }); }
		else if (kind === "rain") { rnd = rnd || Math.random; for (i = 0; i < 24; i++) out.push({ k: C.OBJ_ORDER[Math.floor(rnd() * C.OBJ_ORDER.length)], x: (rnd() * 2 - 1) * 10, y: 14 + rnd() * 16, z: (rnd() * 2 - 1) * 10 }); }
		return out;
	};

	/* ---------- angles + computer drivers ---------- */
	C.wrap = function (a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
	/* yaw of a direction (x, z) in our convention (0 = +z, positive towards +x) */
	C.yawOf = function (x, z) { return Math.atan2(x, z); };
	/* steering + pedals for a computer driver heading for target (tx, tz). car = {x, z, yaw, v (forward speed m/s)}; o = {vmax, steer, aggr} */
	C.aiDrive = function (car, tx, tz, o) {
		o = o || {};
		var ang = C.wrap(C.yawOf(tx - car.x, tz - car.z) - car.yaw), dist = Math.hypot(tx - car.x, tz - car.z);
		var steer = Math.max(-1, Math.min(1, ang * 1.8));
		var want = (o.vmax || 20) * (1 - Math.min(0.75, Math.abs(ang) / 1.6));
		if (o.aggr) want = (o.vmax || 20) * (Math.abs(ang) > 1.3 ? 0.45 : 1);
		if (Math.abs(ang) > 2.2 && dist < 18 && !o.aggr) return { steer: -steer, throttle: 0, brake: 0, reverse: true };
		var dv = want - car.v;
		return { steer: steer, throttle: dv > 0 ? Math.min(1, dv / 4 + 0.15) : 0, brake: dv < -3 ? Math.min(1, -dv / 8) : 0, reverse: false, ang: ang };
	};
	/* where a cruising computer car aims: a point a little ahead of it on the track (Earth) or on a big circle (elsewhere) */
	C.cruiseTarget = function (wid, x, z, lane, ahead) {
		var W = C.WORLDS[wid];
		if (W.track) {
			var best = 0, bd = 1e9, L = C.trackLength();
			for (var s = 0; s < L; s += 6) { var p = C.trackPoint(s), d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < bd) { bd = d; best = s; } }
			var q = C.trackPoint(best + (ahead || 18)), off = (lane || 0) * 3.5;
			return { x: q.x + Math.cos(q.dir) * off, z: q.z - Math.sin(q.dir) * off };
		}
		var R = 70 + (lane || 0) * 8, a = Math.atan2(z, x) + (ahead || 18) / R;
		return { x: Math.cos(a) * R, z: Math.sin(a) * R };
	};

	/* ---------- felt g-force ----------
	   accel = change of velocity per second (m/s^2, world); gy = gravity's y component. What a passenger feels = accel - gravity, in g. */
	C.feltG = function (ax, ay, az, gy) { var fy = ay - gy; return Math.sqrt(ax * ax + fy * fy + az * az) / C.G0; };
	/* jump estimates for the explanation: flat-ground range and peak height of a launch at speed v and angle a in gravity g */
	C.jump = function (v, a, g) { if (g <= 0) return { range: Infinity, height: Infinity, time: Infinity }; var vy = v * Math.sin(a), vx = v * Math.cos(a); return { range: 2 * vx * vy / g, height: vy * vy / (2 * g), time: 2 * vy / g }; };
	/* braking distance from v with tyre grip mu in gravity g (no aero) */
	C.stopDist = function (v, mu, g) { return g > 0 ? v * v / (2 * mu * g) : Infinity; };
	/* engine force after the speed taper: full at 0, nothing at vmax */
	C.engineForce = function (F, v, vmax, boost) { var top = vmax * (boost ? 1.35 : 1); var k = Math.max(0, 1 - Math.abs(v) / top); return F * (boost ? 1.8 : 1) * (0.25 + 0.75 * k) * (Math.abs(v) >= top ? 0 : 1); };
	C.dragForce = function (rho, cdA, v) { return 0.5 * rho * cdA * v * Math.abs(v); };
	C.fmtSpeed = function (ms, unit) { return unit === "mph" ? Math.round(ms * 2.236936) + " mph" : Math.round(ms * 3.6) + " km/h"; };
	C.fmtDist = function (m, unit) { if (!isFinite(m)) return "∞"; return unit === "mph" ? (m * 3.28084 >= 1000 ? (m / 1609.344).toFixed(2) + " mi" : Math.round(m * 3.28084) + " ft") : (m >= 1000 ? (m / 1000).toFixed(2) + " km" : (m < 10 ? m.toFixed(1) : Math.round(m)) + " m"); };
	C.gName = function (g) { var best = null; C.GRAVITY.forEach(function (p) { if (Math.abs(p[1] - g) < 0.02) best = p[0]; }); return best; };

	/* ---------- settings in a link ---------- */
	C.parseQuery = function (q) {
		var o = {}, p = new URLSearchParams(q || "");
		if (C.WORLDS[p.get("w")]) o.world = p.get("w");
		if (C.CARS[p.get("car")]) o.car = p.get("car");
		var g = parseFloat(p.get("g")); if (isFinite(g) && g >= 0 && g <= 300) o.g = g;
		var t = parseInt(p.get("cars"), 10); if (t >= 0 && t <= 12) o.traffic = t;
		if (["cruise", "chase", "park"].indexOf(p.get("ai")) >= 0) o.ai = p.get("ai");
		if (C.WEATHER[p.get("wx")]) o.weather = p.get("wx");
		var tt = parseFloat(p.get("t")); if (isFinite(tt) && tt >= 0 && tt < 24) o.tod = tt;
		return o;
	};
	C.query = function (s) { var p = new URLSearchParams(); p.set("w", s.world); if (s.car && C.CARS[s.car]) p.set("car", s.car); if (s.g != null && Math.abs(s.g - C.WORLDS[s.world].g) > 1e-6) p.set("g", String(+s.g.toFixed(3))); if (s.traffic) p.set("cars", s.traffic); if (s.ai && s.ai !== "cruise") p.set("ai", s.ai); if (s.weather && s.weather !== "clear" && C.weatherFor(s.world).indexOf(s.weather) >= 0) p.set("wx", s.weather); if (s.tod != null && Math.abs(s.tod - 13) > 0.01) p.set("t", String(+(+s.tod).toFixed(2))); return p.toString(); };

	if (typeof module !== "undefined" && module.exports) module.exports = C; else root.MESCar = C;
})(typeof window !== "undefined" ? window : this);
