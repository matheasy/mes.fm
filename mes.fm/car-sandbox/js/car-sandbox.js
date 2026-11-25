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

	/* ---------- aircraft ----------
	   A plane is a "car" with fly: {...}: the same Rapier vehicle controller carries it on its wheels (two main wheels + a twin nose wheel,
	   wxf = nose half track), and C.aero adds the air forces every physics step. Body axes as for the cars: +Z nose, +Y up, +X left wing.
	   fly: S wing area (m^2), b span, c chord, e span efficiency, CL0 lift at zero angle, CLa lift slope (/rad, finite wing), aS stall angle,
	   CD0 parasite drag, flap = [lift, drag, stall-angle change, nose-down pitch] per notch (0, 1, 2), P engine power (W) + eta propeller
	   efficiency (thrust = eta P / v, capped at the static thrust T0) or jet: true (thrust T0 falling 10% by 250 m/s),
	   Cm* pitch (0 / angle / elevator / pitch-rate damping), Cl* roll (aileron / damping / dihedral), Cn* yaw (weathervane / rudder / damping),
	   CY sideways force, I = [pitch, yaw, roll] moments of inertia (kg m^2), cols = fuselage boxes [half x, half y, half z, y, z]
	   (the tail box sits higher, like the upswept tail, so the plane can rotate ~15 degrees before the tail touches). Values are typical light-aircraft / small-jet numbers. */
	C.CARS.plane = { name: "Light plane", mass: 1100, l: 7.6, w: 1.15, h: 1.3, cab: null, wr: 0.28, ww: 0.16, wx: 1.25, wxf: 0.1, wf: 2.2, wb: -0.42, ry: -0.6, rest: 0.42, k: 46,
		drive: "rwd", F: 3300, vmax: 70, cdA: 0.5, grip: 0.9, steer: 0.5, color: "#f4f4f2",
		fly: { S: 16.2, b: 11, c: 1.5, e: 0.8, CL0: 0.3, CLa: 5.0, aS: 0.27, CD0: 0.032, flap: [[0, 0, 0, 0], [0.35, 0.014, -0.02, 0.03], [0.62, 0.045, -0.035, 0.06]],
			P: 120000, eta: 0.8, T0: 3300, Cm0: 0.04, Cma: -0.9, Cme: 0.36, Cmq: -12, Cla: 0.09, Clp: -0.45, Clb: 0.09, Cnb: 0.12, Cnr: -0.15, Cnd: 0.075, CY: -0.6, I: [1350, 2450, 1300],
			wingY: 0.78, wingZ: -0.15, fz: -0.8, tail: [1.7, 0.22, -3.95], eye: [0.28, 0.62, 0.3], cols: [[0.575, 0.65, 2.4, 0.05, 0.6], [0.3, 0.3, 1.4, 0.35, -3.2]], vRot: 28, desc: "A four-seat, 160 hp single-engine plane like a Cessna 172: lifts off at about 100 km/h, cruises near 210 km/h." } };
	C.CARS.jet = { name: "Stunt jet", mass: 4800, l: 11.5, w: 1.5, h: 1.5, cab: null, wr: 0.32, ww: 0.2, wx: 1.6, wxf: 0.12, wf: 3.6, wb: -0.6, ry: -0.75, rest: 0.45, k: 50,
		drive: "rwd", F: 36000, vmax: 260, cdA: 1.0, grip: 0.9, steer: 0.45, color: "#3d5a80",
		fly: { S: 24, b: 9.4, c: 2.8, e: 0.75, CL0: 0.1, CLa: 4.2, aS: 0.3, CD0: 0.022, flap: [[0, 0, 0, 0], [0.3, 0.02, -0.02, 0.02], [0.55, 0.06, -0.04, 0.04]],
			jet: true, T0: 36000, Cm0: 0.01, Cma: -0.6, Cme: 0.3, Cmq: -14, Cla: 0.05,  Clp: -0.35, Clb: 0.04, Cnb: 0.1, Cnr: -0.18, Cnd: 0.06, CY: -0.7, I: [28000, 33000, 6500],
			wingY: 0.05, wingZ: -0.8, fz: -0.45, tail: [2.3, 0.3, -5.3], eye: [0, 0.74, 2.3], cols: [[0.75, 0.75, 3.0, 0.05, 2.35], [0.6, 0.45, 2.8, 0.2, -3.45]], vRot: 60, desc: "A small aerobatic jet trainer with 36 kN of thrust: needs about 200 km/h to lift off, rolls fast and climbs straight up." } };
	C.PLANE_ORDER = ["plane", "jet"];
	C.isPlane = function (k) { return !!(C.CARS[k] && C.CARS[k].fly); };
	C.FLAPS = ["Up", "Takeoff (10°)", "Landing (30°)"];
	C.AIR_EARTH = 1.225;

	/* lift coefficient at angle of attack a (rad) with flaps notch f: straight line up to the stall angle, then it falls away towards
	   the flat-plate value 1.1 sin 2a (what a wing does after the airflow breaks away from its top). Returns {CL, s (0 = flying, 1 = stalled)} */
	C.liftCoef = function (A, a, f) {
		var F = A.flap[f | 0] || A.flap[0], aP = A.aS + F[2], aN = -(A.aS * 0.8), CL0 = A.CL0 + F[0];
		var lin = CL0 + A.CLa * a, plate = 1.1 * Math.sin(2 * a);
		if (a <= aP && a >= aN) return { CL: lin, s: 0 };
		var edge = a > aP ? aP : aN, peak = CL0 + A.CLa * edge, k = Math.exp(-Math.abs(a - edge) / 0.09);
		return { CL: peak * k + plate * (1 - k), s: 1 - k };
	};
	C.dragCoef = function (A, a, f, CL, s) {
		var F = A.flap[f | 0] || A.flap[0], AR = A.b * A.b / A.S, sn = Math.sin(a);
		return A.CD0 + F[1] + CL * CL / (Math.PI * A.e * AR) + 1.28 * sn * sn * s;
	};
	C.thrust = function (A, v, thr) { thr = Math.max(0, Math.min(1, thr)); if (A.jet) return thr * A.T0 * Math.max(0.6, 1 - Math.abs(v) / 2500); return thr * Math.min(A.T0, A.eta * A.P / Math.max(1, Math.abs(v))); };
	/* stall speed in level flight: weight = lift at the biggest CL. rho 0 (the Moon) = Infinity */
	C.stallSpeed = function (A, mass, g, rho, f) {
		if (!(rho > 0)) return Infinity; if (g <= 0) return 0;
		var F = A.flap[f | 0] || A.flap[0], clMax = A.CL0 + F[0] + A.CLa * (A.aS + F[2]);
		return Math.sqrt(2 * mass * g / (rho * A.S * clMax));
	};
	/* fastest level flight: thrust = drag (bisection over speed); 0 if it can never hold itself up */
	C.topSpeed = function (A, mass, g, rho) {
		if (!(rho > 0)) return 0;
		function excess(v) { var q = 0.5 * rho * v * v, CL = mass * g / (q * A.S), D = q * A.S * (A.CD0 + CL * CL / (Math.PI * A.e * A.b * A.b / A.S)); return C.thrust(A, v, 1) - D; }
		var vs = C.stallSpeed(A, mass, g, rho, 0), hi = 400, lo = vs * 1.02;
		if (excess(lo) < 0) { var best = -1; for (var v = lo; v < hi; v += 2) if (excess(v) >= 0) { best = v; break; } if (best < 0) return 0; lo = best; }
		if (excess(hi) > 0) return hi;
		for (var i = 0; i < 50; i++) { var m = (lo + hi) / 2; if (excess(m) > 0) lo = m; else hi = m; }
		return lo;
	};
	/* the air forces on an aircraft. vb = velocity through the air in body axes {x, y, z}, wb = turn rate in body axes (rad/s),
	   ctl = {elev (+1 = stick back = nose up), ail (+1 = roll right), rud (+1 = yaw right), flap 0..2, thr 0..1}, rho = air density,
	   I + dt (optional) = cap each damping torque so it can never reverse a turn within one physics step.
	   Returns force F and torque T in body axes (N, N m) plus alpha, beta (rad), V, q (dynamic pressure), CL, stall (0..1). */
	C.aero = function (A, vb, wb, ctl, rho, dt, I) {
		var V = Math.sqrt(vb.x * vb.x + vb.y * vb.y + vb.z * vb.z), out = { F: { x: 0, y: 0, z: 0 }, T: { x: 0, y: 0, z: 0 }, alpha: 0, beta: 0, V: V, q: 0, CL: 0, stall: 0, thrust: 0 };
		var f = ctl.flap | 0, Fl = A.flap[f] || A.flap[0];
		out.thrust = C.thrust(A, vb.z, ctl.thr); out.F.z += out.thrust;
		if (!(rho > 0) || V < 0.5) return out;
		var q = 0.5 * rho * V * V, S = A.S, a = Math.atan2(-vb.y, vb.z), bt = Math.asin(Math.max(-1, Math.min(1, vb.x / V)));
		/* flying backwards (a > 90 degrees) keeps the flat-plate behaviour */
		var aw = a > Math.PI / 2 ? Math.PI - a : a < -Math.PI / 2 ? -Math.PI - a : a;
		var L = C.liftCoef(A, aw, f), CD = C.dragCoef(A, aw, f, L.CL, L.s) + 0.4 * bt * bt;
		out.alpha = a; out.beta = bt; out.q = q; out.CL = L.CL; out.stall = L.s;
		/* lift: at right angles to the airflow and to the wing span, in the plane's symmetry plane; drag: against the airflow */
		var vyz = Math.sqrt(vb.y * vb.y + vb.z * vb.z) || 1, lift = q * S * L.CL * (vyz * vyz) / (V * V), drag = q * S * CD, side = q * S * A.CY * bt;
		out.F.y += lift * vb.z / vyz; out.F.z += lift * -vb.y / vyz;
		out.F.x += -drag * vb.x / V + side; out.F.y += -drag * vb.y / V; out.F.z += -drag * vb.z / V;
		/* turning moments. Damping uses the turn rate scaled by span or chord / 2V (V at least 8 m/s so it stays sensible while taxiing) */
		var Vd = Math.max(8, V), pitchUp = -wb.x, rollR = wb.z, yawL = wb.y, auth = 1 - 0.55 * L.s; /* controls go soft in a stall */
		var CmU = A.Cm0 - Fl[3] + A.Cma * aw + A.Cme * (ctl.elev || 0) * auth, ClR = A.Cla * (ctl.ail || 0) * auth + A.Clb * bt, CnL = A.Cnb * bt - A.Cnd * (ctl.rud || 0);
		var dP = q * S * A.c * A.Cmq * pitchUp * A.c / (2 * Vd), dR = q * S * A.b * A.Clp * rollR * A.b / (2 * Vd), dY = q * S * A.b * A.Cnr * yawL * A.b / (2 * Vd);
		if (dt && I) { /* never more than 80% of the way to stopping the turn in one step */
			var cap = function (d, w, i) { var m = 0.8 * i * Math.abs(w) / dt; return Math.max(-m, Math.min(m, d)); };
			dP = cap(dP, pitchUp, I[0]); dY = cap(dY, yawL, I[1]); dR = cap(dR, rollR, I[2]);
		}
		out.T.x = -(q * S * A.c * CmU + dP); out.T.z = q * S * A.b * ClR + dR; out.T.y = q * S * A.b * CnL + dY;
		return out;
	};
	/* the throttle, flaps etc. are kept on the plane; this turns held keys into smooth control positions */
	C.ease = function (cur, want, rate, dt) { var d = want - cur, m = rate * dt; return cur + Math.max(-m, Math.min(m, d)); };
	/* artificial horizon numbers from the plane's forward / up vectors (world, Y up): pitch (+ = nose up) and bank (+ = right wing down), radians */
	C.attitude = function (f, u) {
		var pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
		/* left wing = up x forward; bank = how far the left wing is raised */
		var lx = u.y * f.z - u.z * f.y, ly = u.z * f.x - u.x * f.z, lz = u.x * f.y - u.y * f.x;
		var bank = Math.atan2(ly, u.y);
		void lx; void lz; return { pitch: pitch, bank: bank };
	};
	/* Easy flying: the stick asks for a turn and a climb, and this flies the real controls for you (the air forces stay the same).
	   P = memory kept on the plane {i, hold, toff}; s = {pitch, bank (+ = right wing down), V (air speed), vs (climb, m/s), alpha, q (nose-up
	   rate), p (roll-right rate), beta, agl, y, ground, vs0 (stall speed, flaps up), vRot, top, aLim (stall angle with the flaps now)};
	   inp = {climb (+1 = up), turn (+1 = right), spd 0..1 (cruise speed between safe-slow and fast), go (take-off pressed), brk}.
	   Let go of the stick and it levels the wings and holds its height; it never lets the wing stall, flares by itself near the
	   ground, and on the ground it brakes unless you are taking off. Returns {elev, ail, rud, thr, flap, brk, toff}. */
	C.easyPilot = function (P, s, inp, dt) {
		var D = Math.PI / 180, cl = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
		var climb = cl(inp.climb || 0, -1, 1), turn = cl(inp.turn || 0, -1, 1), V = Math.max(0, s.V || 0);
		var vMin = s.vs0 * 1.3, vMax = Math.max(vMin + 8, (s.top || vMin * 2) * 0.9), vc = vMin + cl(inp.spd == null ? 0.15 : inp.spd, 0, 1) * (vMax - vMin);
		var out = { elev: 0, ail: 0, rud: 0, thr: 0, flap: 1, brk: 0, toff: !!P.toff };
		/* after a touchdown it stays landed (small bounces included) until you take off again */
		var ground = s.ground || (s.agl < 2 && V < s.vs0 * 0.6); /* just put down, still settling on its wheels */
		if (ground && !P.toff) P.landed = true;
		if (P.landed && !ground && (s.agl > 4 || climb > 0.3 || inp.go)) P.landed = false;
		if (ground || P.landed) {
			if (inp.go || climb > 0.3) { P.toff = true; P.landed = false; }
			P.hold = null; P.i = 0;
			if (P.toff) {
				out.thr = 1; out.rud = turn * 0.7;
				/* rotate at lift-off speed: nose up to ~9 degrees */
				if (V > s.vRot) out.elev = cl(7 * (10 * D - s.pitch) - 1.5 * s.q, -1, 1);
			} else { out.brk = 1; out.rud = turn; out.elev = -0.6; out.flap = 0; } /* flaps up + nose down = the wing stops lifting, so the brakes can grip */
			out.toff = !!P.toff; return out;
		}
		if (P.toff && s.agl > 30) { P.toff = false; P.hold = s.y + Math.max(0, s.vs) * 1.5; }
		var gT;
		if (P.toff) gT = 8 * D;
		else if (Math.abs(climb) > 0.05) { gT = climb > 0 ? climb * 14 * D : climb * 20 * D; P.hold = null; }
		else { if (P.hold == null) P.hold = s.y + s.vs * 1.2; gT = Math.asin(cl((P.hold - s.y) * 0.2, -5, 5) / Math.max(V, 12)); }
		/* too slow: lower the nose to get speed back; near the ground: never sink faster than a gentle flare allows */
		if (V < s.vs0 * 1.15) gT = Math.min(gT, -4 * D);
		/* aglA = clearance over the highest ground in the next ~3 s of flight: rising ground ahead makes it climb */
		var clr = s.aglA == null ? s.agl : Math.min(s.agl, s.aglA);
		var vsMax = 1.1 + Math.max(0, clr) * 0.3; gT = Math.max(gT, -Math.asin(cl(vsMax / Math.max(V, 1), 0, 1)));
		if (s.aglA != null && s.aglA < 14 && s.agl - s.aglA > 1.5) { gT = Math.max(gT, Math.asin(cl((14 - s.aglA) / 3 / Math.max(V, 1), 0, 0.3))); P.rise = true; } else P.rise = false;
		var g = Math.asin(cl(s.vs / Math.max(V, 1), -1, 1)), err = gT - g;
		P.i = cl((P.i || 0) + err * dt * 2.5, -0.6, 0.6);
		/* a banked wing needs more lift (1 / cos bank) to hold its height: pull a little more in turns */
		/* the elevator bites harder the faster it flies (force ~ V^2), so the gains shrink with speed: no porpoising when fast */
		var kv = cl(Math.pow(s.vs0 * 1.5 / Math.max(V, 1), 2), 0.12, 1.4);
		var cb = Math.max(0.3, Math.cos(s.bank)), elev = (2.4 * err + P.i) * kv - 1.1 * s.q * Math.sqrt(kv) + 0.5 * (1 / cb - 1) * kv;
		/* stall protection: the stick can't pull the wing past ~80% of its stall angle */
		var aCap = (s.aLim || 0.25) * 0.75; if (s.alpha > aCap) elev -= 9 * (s.alpha - aCap);
		out.elev = cl(elev, -1, 1);
		var bankT = turn * 40 * D;
		out.ail = cl(2.2 * (bankT - s.bank) - 0.4 * s.p, -1, 1);
		out.rud = cl(-3 * (s.beta || 0), -1, 1);
		out.thr = P.toff ? 1 : cl(0.45 + 0.1 * (vc - V) + 2.5 * Math.sin(gT), 0, 1);
		/* landing flaps low down on the way in (more drag = slower touchdown), take-off flaps when slow, else up */
		out.flap = s.agl < 40 && s.vs < -0.5 && !P.toff ? 2 : V < s.vs0 * 1.45 ? 1 : 0;
		if (out.flap === 2) out.thr = V > s.vs0 * 1.35 ? 0 : Math.min(out.thr, 0.3);
		if (P.rise) out.thr = 1;
		out.toff = !!P.toff;
		return out;
	};
	/* how a touchdown went, from the sink rate (m/s, positive = down) */
	C.landingRate = function (vs) { return vs < 1 ? "Butter! Perfect landing" : vs < 2.5 ? "Good landing" : vs < 4 ? "Firm landing" : vs < 6 ? "Hard landing" : "Crash landing"; };
	/* the runway on the test-track worlds: along X, north of the oval */
	C.RUNWAY = { x: 0, z: 180, len: 470, w: 26 };
	C.onRunway = function (x, z, pad) { var R = C.RUNWAY; pad = pad || 0; return Math.abs(x - R.x) <= R.len / 2 + pad && Math.abs(z - R.z) <= R.w / 2 + pad; };
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
	C.lapStep = function (st, s, d, now, Lc, wc) {
		var L = Lc || C.trackLength(), n = C.SECTORS, sec = Math.min(n - 1, Math.floor(s / (L / n))), ev = [];
		if (d > (wc || C.TRACK.width) * 1.5) return ev; /* off the track: positions there don't count */
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
	C.lapKey = function (world, car, g, extra) { return world + "|" + car + "|" + (+g).toFixed(2) + (extra ? "|" + extra : ""); };

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
				var R = C.RUNWAY, rd = Math.max(Math.abs(x - R.x) - R.len / 2, Math.abs(z - R.z) - R.w / 2); /* the runway and its grass strip are flat */
				if (rd < 40) flat = Math.min(flat, Math.max(0, (rd - 10) / 30));
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

	/* ---------- game speed + how lively the cars are ----------
	   SPEEDS = how fast time runs (1 = real time). DRIVE = engine force / top speed / tyre grip multipliers: "real" is the car table as it is,
	   "fast" and "arcade" are livelier (more power, more grip) for play; lap records are kept apart per setting. */
	C.SPEEDS = [[0.25, "¼× slow motion"], [0.5, "½×"], [0.75, "¾×"], [1, "1× real time"], [1.25, "1¼×"], [1.5, "1½×"], [2, "2× fast"], [3, "3× very fast"]];
	C.DRIVE = {
		real: { name: "Realistic", F: 1, v: 1, grip: 1 },
		fast: { name: "Lively", F: 1.7, v: 1.15, grip: 1.12 },
		arcade: { name: "Arcade", F: 2.6, v: 1.35, grip: 1.3 }
	};
	C.DRIVE_ORDER = ["real", "fast", "arcade"];

	/* ---------- map editor: pieces you can place ----------
	   Every piece is a plain object {t (shape), k (catalogue key), x, z, yaw, ...size}; the built-in stunt pieces use the same shapes. */
	C.PIECES = {
		kicker: { name: "Kicker", icon: "◢", t: "ramp", w: 7, l: 8, h: 1.6 },
		ramp: { name: "Ramp", icon: "📐", t: "ramp", w: 8, l: 14, h: 3.5 },
		bigramp: { name: "Big ramp", icon: "⛰️", t: "ramp", w: 10, l: 20, h: 6 },
		mega: { name: "Mega ramp", icon: "🗻", t: "ramp", w: 14, l: 30, h: 8 },
		gap: { name: "Gap jump", icon: "↗↘", t: "gap", w: 8, l: 12, h: 3, gap: 20 },
		table: { name: "Table top", icon: "⏢", t: "table", w: 9, l: 30, h: 3 },
		whoops: { name: "Bumps", icon: "〰️", t: "whoops", w: 8, l: 30, h: 0.7, n: 6 },
		loop: { name: "Loop", icon: "➰", t: "loop", r: 9, w: 7 },
		pipe: { name: "Half pipe", icon: "◡", t: "pipe", r: 10, l: 40 },
		bank: { name: "Banked wall", icon: "◣", t: "bank", w: 6, l: 30, h: 4 },
		block: { name: "Low block", icon: "▬", t: "block", w: 12, l: 4, h: 1.2 },
		wall: { name: "Wall", icon: "🧱", t: "block", w: 16, l: 1, h: 3 },
		platform: { name: "Platform", icon: "⬛", t: "block", w: 14, l: 14, h: 2.5 },
		spring: { name: "Spring (auto)", icon: "🌀", t: "pad", pad: "spring", w: 6, l: 6, v: 22 },
		launchpad: { name: "Launch pad (press L)", icon: "🚀", t: "pad", pad: "press", w: 6, l: 6, v: 30 },
		boost: { name: "Boost strip", icon: "⏩", t: "pad", pad: "boost", w: 6, l: 10, v: 45 }
	};
	C.PIECE_ORDER = ["spring", "launchpad", "boost", "kicker", "ramp", "bigramp", "mega", "gap", "table", "whoops", "loop", "pipe", "bank", "block", "wall", "platform"];
	/* editable sizes: [label, min, max, step] */
	C.PARAMS = { w: ["Width", 1, 40, 0.5], l: ["Length", 1, 80, 0.5], h: ["Height", 0.2, 20, 0.1], r: ["Radius", 4, 20, 0.5], gap: ["Gap", 2, 80, 1], n: ["Bumps", 2, 20, 1], v: ["Launch", 4, 70, 1] };
	C.SHAPE_PARAMS = { ramp: ["h", "l", "w"], gap: ["gap", "h", "l", "w"], table: ["h", "l", "w"], whoops: ["n", "h", "l", "w"], loop: ["r", "w"], pipe: ["r", "l"], bank: ["h", "l", "w"], block: ["h", "l", "w"], pad: ["v", "l", "w"] };
	C.newPiece = function (k, x, z, yaw) { var P = C.PIECES[k], o = { k: k, x: x, z: z, yaw: yaw || 0 }; Object.keys(P).forEach(function (q) { if (q !== "name" && q !== "icon") o[q] = P[q]; }); return o; };
	C.pieceName = function (p) { if (p.k && C.PIECES[p.k]) return C.PIECES[p.k].name; var n = { ramp: "Ramp", gap: "Gap jump", table: "Table top", whoops: "Bumps", loop: "Loop", pipe: "Half pipe", bank: "Banked wall", block: "Block", pad: "Pad" }; return n[p.t] || p.t; };
	C.clampPiece = function (p) { (C.SHAPE_PARAMS[p.t] || []).forEach(function (q) { var D = C.PARAMS[q]; var v = +p[q]; if (!isFinite(v)) v = D[1]; p[q] = Math.max(D[1], Math.min(D[2], q === "n" ? Math.round(v) : v)); }); return p; };
	/* the piece's footprint as a rectangle in its own frame (x across, z along its facing direction): {cx, cz, hx, hz} */
	C.pieceRect = function (p) {
		if (p.t === "gap") return { cx: 0, cz: 0, hx: p.w / 2, hz: p.l + p.gap / 2 };
		if (p.t === "loop") return { cx: (p.w + 1.5) / 2, cz: 0, hx: p.w + 0.75, hz: p.r };
		if (p.t === "pipe") return { cx: 0, cz: 0, hx: p.r, hz: p.l / 2 };
		return { cx: 0, cz: 0, hx: p.w / 2, hz: p.l / 2 };
	};
	/* local (piece frame) to world: yaw 0 faces +z */
	C.toWorld = function (p, lx, lz) { var c = Math.cos(p.yaw), s = Math.sin(p.yaw); return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]; };
	C.toLocal = function (p, x, z) { var c = Math.cos(p.yaw), s = Math.sin(p.yaw), dx = x - p.x, dz = z - p.z; return [dx * c - dz * s, dx * s + dz * c]; };
	C.pieceCorners = function (p) { var R = C.pieceRect(p); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) { return C.toWorld(p, R.cx + k[0] * R.hx, R.cz + k[1] * R.hz); }); };
	C.pieceHit = function (p, x, z, pad) { var R = C.pieceRect(p), q = C.toLocal(p, x, z); pad = pad || 0; return Math.abs(q[0] - R.cx) <= R.hx + pad && Math.abs(q[1] - R.cz) <= R.hz + pad; };
	/* pads: what a car standing on one gets. spring = straight up at v (m/s) every time it lands on it; press = the same when the driver presses
	   launch; boost = pushed along the pad's direction up to v. Returns the new velocity {x, y, z} or null. lv = car velocity, up = gravity sign (1 or -1). */
	C.PAD_COOLDOWN = 1.0;
	C.padLaunch = function (p, lv, pressed, gsign) {
		var up = gsign < 0 ? -1 : 1;
		if (p.pad === "spring" || (p.pad === "press" && pressed)) return { x: lv.x * 0.9, y: up * p.v, z: lv.z * 0.9 };
		if (p.pad === "boost") {
			var fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), along = lv.x * fx + lv.z * fz; if (along >= p.v) return null;
			var add = Math.max(0, p.v - Math.max(0, along)); return { x: lv.x + fx * add, y: lv.y, z: lv.z + fz * add };
		}
		return null;
	};
	/* how high / how long a spring throws the car straight up in gravity g */
	C.springHeight = function (v, g) { return g > 0 ? v * v / (2 * g) : Infinity; };

	/* the side profile [[z, y], ...] (convex, anticlockwise) of the prism shapes, extruded across their width */
	C.prismParts = function (p) {
		var b, out = [];
		if (p.t === "ramp") out.push({ dz: 0, flip: false, prof: [[-p.l / 2, 0], [p.l / 2, 0], [p.l / 2, p.h]] });
		else if (p.t === "gap") { b = p.gap / 2 + p.l / 2; out.push({ dz: -b, flip: false, prof: [[-p.l / 2, 0], [p.l / 2, 0], [p.l / 2, p.h]] }); out.push({ dz: b, flip: true, prof: [[-p.l / 2, 0], [p.l / 2, 0], [p.l / 2, p.h * 0.9]] }); }
		else if (p.t === "table") { var r = Math.min(p.l / 3, p.h * 3.2); out.push({ dz: 0, flip: false, prof: [[-p.l / 2, 0], [p.l / 2, 0], [p.l / 2 - r, p.h], [-p.l / 2 + r, p.h]] }); }
		else if (p.t === "whoops") {
			var n = Math.max(2, Math.round(p.n)), a = p.l / n / 2;
			for (var i = 0; i < n; i++) { var c = -p.l / 2 + a * (2 * i + 1), pr = []; for (var j = 0; j <= 8; j++) { var t = Math.PI * j / 8; pr.push([-Math.cos(t) * a, Math.sin(t) * p.h]); } out.push({ dz: c, flip: false, prof: pr }); }
		}
		else if (p.t === "bank") { /* a slope that rises across its width: drive along it, leaning in */ out.push({ dz: 0, flip: false, across: true, prof: [[-p.w / 2, 0], [p.w / 2, 0], [p.w / 2, p.h]] }); }
		return out;
	};

	/* ---------- roads you draw ----------
	   a road = {w (width m), closed, pts [[x, z], ...]} drawn as a smooth Catmull-Rom curve through the points. */
	C.ROAD_WIDTHS = [[6, "Narrow (6 m)"], [10, "Normal (10 m)"], [16, "Wide (16 m)"], [24, "Very wide (24 m)"]];
	C.roadPath = function (pts, closed, step) {
		step = step || 2;
		var n = pts.length, out = [], s = 0; if (n < 2) return { pts: [], L: 0, closed: !!closed };
		function P(i) { if (closed) return pts[((i % n) + n) % n]; return pts[Math.max(0, Math.min(n - 1, i))]; }
		var segs = closed ? n : n - 1;
		for (var i = 0; i < segs; i++) {
			var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(1, Math.ceil(len / step));
			for (var j = 0; j < m; j++) {
				var t = j / m, t2 = t * t, t3 = t2 * t;
				var x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
				var z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
				out.push({ x: x, z: z });
			}
		}
		if (!closed) out.push({ x: pts[n - 1][0], z: pts[n - 1][1] });
		for (i = 0; i < out.length; i++) {
			var a = out[i], nb = out[i + 1] || (closed ? out[0] : null), pv = out[i - 1] || (closed ? out[out.length - 1] : null);
			var dx = (nb ? nb.x : a.x) - (pv ? pv.x : a.x), dz = (nb ? nb.z : a.z) - (pv ? pv.z : a.z);
			a.dir = Math.atan2(dx, dz); if (i) s += Math.hypot(a.x - out[i - 1].x, a.z - out[i - 1].z); a.s = s;
		}
		var L = s + (closed && out.length ? Math.hypot(out[0].x - out[out.length - 1].x, out[0].z - out[out.length - 1].z) : 0);
		return { pts: out, L: L, closed: !!closed };
	};
	/* nearest point of a road path: {s, d, i} */
	C.pathNearest = function (path, x, z) {
		var P = path.pts, best = 0, bd = 1e18;
		for (var i = 0; i < P.length; i++) { var dx = P[i].x - x, dz = P[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
		if (!P.length) return { s: 0, d: Infinity, i: 0 };
		/* refine on the two segments next to the nearest sample */
		var res = { s: P[best].s, d: Math.sqrt(bd), i: best };
		[best - 1, best].forEach(function (k) {
			var a = P[k], b = P[k + 1] || (path.closed ? P[0] : null); if (!a || !b) return;
			var ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez; if (!l2) return;
			var t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2)), px = a.x + ex * t, pz = a.z + ez * t, d = Math.hypot(x - px, z - pz);
			if (d < res.d) res = { s: a.s + Math.sqrt(l2) * t, d: d, i: k };
		});
		return res;
	};
	C.pathPoint = function (path, s) {
		var P = path.pts, L = path.L; if (!P.length) return { x: 0, z: 0, dir: 0 };
		if (path.closed) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(P[P.length - 1].s, s));
		var lo = 0, hi = P.length - 1; if (s >= P[hi].s) { var a0 = P[hi], b0 = path.closed ? P[0] : P[hi], seg = L - a0.s; var f0 = seg > 0 ? (s - a0.s) / seg : 0; return { x: a0.x + (b0.x - a0.x) * f0, z: a0.z + (b0.z - a0.z) * f0, dir: a0.dir }; }
		while (hi - lo > 1) { var m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
		var a = P[lo], b = P[hi], f = (s - a.s) / ((b.s - a.s) || 1);
		return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dir: a.dir };
	};

	/* ---------- layouts (map presets) ---------- */
	C.MAP_PRESETS = [["original", "Original layout"], ["empty", "Empty (no pieces)"], ["jumps", "Jump lines"], ["arena", "Stunt arena"], ["race", "Race circuit (road)"]];
	C.mapPreset = function (kind, wid) {
		var W = C.WORLDS[wid], m = { p: [], r: [], oval: true };
		if (kind === "original") { m.p = C.statics(wid).map(function (s) { return Object.assign({}, s); }); return m; }
		if (kind === "empty") return m;
		var ox = 0, oz = W.track ? C.TRACK.cz : 40, P = function (k, x, z, yaw, o) { var p = C.newPiece(k, ox + x, oz + z, yaw); if (o) Object.assign(p, o); m.p.push(p); };
		if (kind === "jumps") {
			var e = Math.PI / 2, wv = -Math.PI / 2;
			P("kicker", -95, 25, e); P("gap", -55, 25, e); P("table", 0, 25, e); P("whoops", 45, 25, e); P("bigramp", 85, 25, e);
			P("ramp", 90, -25, wv); P("gap", 45, -25, wv, { gap: 28, h: 4 }); P("loop", -5, -25, wv); P("kicker", -50, -25, wv); P("mega", -85, -25, wv, { l: 26, h: 7 });
			P("boost", -112, 25, e); P("spring", 110, 0, 0); P("launchpad", -110, -25, wv);
			if (!W.track) m.p.forEach(function (p) { var t = p.x; p.x = p.z - oz; p.z = oz + t * 0.6 + 40; p.yaw = p.yaw > 0 ? 0 : Math.PI; p.x *= 1.4; });
		} else if (kind === "arena") {
			for (var i = 0; i < 8; i++) { var a = i / 8 * 2 * Math.PI; P(i % 2 ? "ramp" : "bigramp", Math.sin(a) * 55, Math.cos(a) * 55, a + Math.PI); }
			P("loop", -12, 0, 0); P("pipe", 22, 0, 0, { l: 30 }); P("platform", 0, 30, 0, { w: 10, l: 10, h: 2 }); P("kicker", 0, 18, Math.PI);
			P("spring", -30, -30, 0); P("spring", 30, -30, 0, { v: 32 }); P("launchpad", 0, -38, 0); P("boost", -40, 20, Math.PI / 2);
		} else if (kind === "race") {
			m.oval = false; m.p = [];
			var pts = [[-150, 20], [-60, 40], [30, 10], [110, 40], [160, -20], [120, -100], [40, -80], [-20, -130], [-110, -120], [-170, -60]];
			if (!W.track) pts = pts.map(function (q) { return [q[0] * 0.9, q[1] * 0.9 + 60]; });
			m.r.push({ w: 12, closed: true, pts: pts });
			var path = C.roadPath(pts, true, 2), j1 = C.pathPoint(path, path.L * 0.32), j2 = C.pathPoint(path, path.L * 0.7);
			m.p.push(C.newPiece("kicker", j1.x, j1.z, j1.dir)); m.p.push(C.newPiece("whoops", j2.x, j2.z, j2.dir));
			m.p[0].w = 10; m.p[1].w = 11;
		}
		return m;
	};

	/* ---------- a map in a link: compact JSON in base64url ---------- */
	function r1(v) { return Math.round(v * 10) / 10; }
	C.mapEncode = function (m) {
		var o = { v: 1, p: (m.p || []).map(function (p) { var a = [p.k || p.t, r1(p.x), r1(p.z), Math.round(p.yaw * 180 / Math.PI)]; (C.SHAPE_PARAMS[p.t] || []).forEach(function (q) { a.push(r1(p[q])); }); return a; }), r: (m.r || []).map(function (r) { var a = [r.w, r.closed ? 1 : 0]; r.pts.forEach(function (q) { a.push(Math.round(q[0]), Math.round(q[1])); }); return a; }) };
		if (m.oval === false) o.o = 0;
		var js = JSON.stringify(o), b = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(js))) : Buffer.from(js, "utf8").toString("base64");
		return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	};
	C.mapDecode = function (str) {
		try {
			var b = String(str).replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
			var js = typeof atob === "function" ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, "base64").toString("utf8"), o = JSON.parse(js);
			if (!o || o.v !== 1) return null;
			var m = { p: [], r: [], oval: o.o !== 0 };
			(o.p || []).slice(0, 200).forEach(function (a) {
				var k = a[0], t; if (C.PIECES[k]) t = C.PIECES[k].t; else if (C.SHAPE_PARAMS[k]) { t = k; k = null; } else return;
				var p = k ? C.newPiece(k, +a[1], +a[2], (+a[3] || 0) * Math.PI / 180) : { t: t, x: +a[1], z: +a[2], yaw: (+a[3] || 0) * Math.PI / 180 };
				if (!isFinite(p.x) || !isFinite(p.z)) return;
				(C.SHAPE_PARAMS[t] || []).forEach(function (q, i) { if (a[4 + i] != null) p[q] = +a[4 + i]; });
				m.p.push(C.clampPiece(p));
			});
			(o.r || []).slice(0, 20).forEach(function (a) { var r = { w: Math.max(3, Math.min(40, +a[0] || 10)), closed: !!a[1], pts: [] }; for (var i = 2; i + 1 < a.length && r.pts.length < 200; i += 2) if (isFinite(+a[i]) && isFinite(+a[i + 1])) r.pts.push([+a[i], +a[i + 1]]); if (r.pts.length >= 2) m.r.push(r); });
			return m;
		} catch (e) { return null; }
	};

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
		var sp = parseFloat(p.get("spd")); if (C.SPEEDS.some(function (x) { return x[0] === sp; })) o.speed = sp;
		if (C.DRIVE[p.get("dr")]) o.drive = p.get("dr");
		return o;
	};
	C.query = function (s) { var p = new URLSearchParams(); p.set("w", s.world); if (s.car && C.CARS[s.car]) p.set("car", s.car); if (s.g != null && Math.abs(s.g - C.WORLDS[s.world].g) > 1e-6) p.set("g", String(+s.g.toFixed(3))); if (s.traffic) p.set("cars", s.traffic); if (s.ai && s.ai !== "cruise") p.set("ai", s.ai); if (s.weather && s.weather !== "clear" && C.weatherFor(s.world).indexOf(s.weather) >= 0) p.set("wx", s.weather); if (s.tod != null && Math.abs(s.tod - 13) > 0.01) p.set("t", String(+(+s.tod).toFixed(2))); if (s.speed && s.speed !== 1) p.set("spd", String(s.speed)); if (s.drive && s.drive !== "fast") p.set("dr", s.drive); return p.toString(); };

	/* ---------- online with friends: WebRTC rooms (signalling in mes.fm/api/car-room.js) ----------
	   Every browser runs its own physics; each one sends its own car's pose ~15 times a second over an unreliable data channel
	   (68-byte binary packets, below) and draws the others as smoothly interpolated "remote" cars about 120 ms in the past.
	   Events (names, chat, room settings, race start, laps) are small JSON objects on a second, reliable channel. Star layout:
	   joiners connect only to the host, who passes every packet / event on to the others. */
	C.NET = { V: 1, ABC: "abcdefghjkmnpqrstuvwxyz23456789", HZ: 15, DELAY: 120, MAXP: 8, EXTRA: 250, STALE: 8000, LEN: 68 };
	C.NET.TYPES = C.CAR_ORDER.concat(C.PLANE_ORDER);
	C.netCodeOk = function (s) { return typeof s === "string" && /^[a-hj-km-np-z2-9]{6}$/.test(s); };
	C.netPeerOk = function (s) { return typeof s === "string" && /^[A-Za-z0-9]{12}$/.test(s); };
	C.netCode = function (rnd) { rnd = rnd || Math.random; var s = ""; for (var i = 0; i < 6; i++) s += C.NET.ABC[Math.floor(rnd() * C.NET.ABC.length) % C.NET.ABC.length]; return s; };
	C.netPeerId = function (rnd) { rnd = rnd || Math.random; var a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", s = ""; for (var i = 0; i < 12; i++) s += a[Math.floor(rnd() * 62) % 62]; return s; };
	/* a room code typed by hand or a whole share link pasted in */
	C.netParseCode = function (t) { t = String(t || "").trim(); var m = /[?&#]room=([A-Za-z0-9]{6})/.exec(t); if (m) t = m[1]; t = t.toLowerCase().replace(/[\s-]/g, ""); return C.netCodeOk(t) ? t : null; };
	C.netName = function (v) { if (typeof v !== "string") return "Driver"; var s = v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/[​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim().slice(0, 20); return s || "Driver"; };
	C.netText = function (v) { if (typeof v !== "string") return ""; return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim().slice(0, 200); };
	C.netColor = function (v) { return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null; };
	/* one car's state -> 68 bytes. o = {slot, seq, t (ms), type, brake, boost, air, thr 0..1, flap 0..2, p:[x,y,z], q:[x,y,z,w], v:[x,y,z], w:[[y, steer, rot] x4]} */
	C.netEncode = function (o) {
		var b = new ArrayBuffer(C.NET.LEN), d = new DataView(b), ti = C.NET.TYPES.indexOf(o.type);
		d.setUint8(0, 0x43); d.setUint8(1, o.slot & 255); d.setUint16(2, o.seq & 65535); d.setUint32(4, Math.max(0, Math.round(o.t)) >>> 0);
		d.setUint8(8, ti < 0 ? 0 : ti); d.setUint8(9, (o.brake ? 1 : 0) | (o.boost ? 2 : 0) | (o.air ? 4 : 0));
		d.setUint8(10, Math.max(0, Math.min(255, Math.round((o.thr || 0) * 255)))); d.setUint8(11, Math.max(0, Math.min(2, o.flap | 0)));
		for (var i = 0; i < 3; i++) d.setFloat32(12 + i * 4, o.p[i]);
		var q = o.q, qn = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
		for (i = 0; i < 4; i++) d.setInt16(24 + i * 2, Math.round(q[i] / qn * 32767));
		for (i = 0; i < 3; i++) d.setFloat32(32 + i * 4, Math.max(-2000, Math.min(2000, (o.v && o.v[i]) || 0)));
		for (i = 0; i < 4; i++) { var w = (o.w && o.w[i]) || [0, 0, 0], r = ((w[2] % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; d.setInt16(44 + i * 6, Math.max(-32767, Math.min(32767, Math.round(w[0] * 1000)))); d.setInt16(46 + i * 6, Math.max(-32767, Math.min(32767, Math.round(w[1] * 10000)))); d.setInt16(48 + i * 6, Math.round(r * 10000)); }
		return b;
	};
	C.netDecode = function (b) {
		if (!b || b.byteLength !== C.NET.LEN) return null;
		var d = new DataView(b); if (d.getUint8(0) !== 0x43) return null;
		var ti = d.getUint8(8); if (ti >= C.NET.TYPES.length) return null;
		var f = d.getUint8(9), o = { slot: d.getUint8(1), seq: d.getUint16(2), t: d.getUint32(4), type: C.NET.TYPES[ti], brake: !!(f & 1), boost: !!(f & 2), air: !!(f & 4), thr: d.getUint8(10) / 255, flap: Math.min(2, d.getUint8(11)), p: [], q: [], v: [], w: [] };
		for (var i = 0; i < 3; i++) { o.p.push(d.getFloat32(12 + i * 4)); o.v.push(d.getFloat32(32 + i * 4)); }
		for (i = 0; i < 4; i++) o.q.push(d.getInt16(24 + i * 2) / 32767);
		var qn = Math.hypot(o.q[0], o.q[1], o.q[2], o.q[3]); if (!(qn > 0.5)) return null; o.q = o.q.map(function (x) { return x / qn; });
		for (i = 0; i < 4; i++) o.w.push([d.getInt16(44 + i * 6) / 1000, d.getInt16(46 + i * 6) / 10000, d.getInt16(48 + i * 6) / 10000]);
		if (!o.p.concat(o.v).every(isFinite) || o.p.some(function (x) { return Math.abs(x) > 1e5; })) return null;
		return o;
	};
	/* the slot byte is rewritten by the host before passing a packet on, so a joiner can't pretend to be another car */
	C.netSetSlot = function (b, slot) { var c = b.slice(0); new DataView(c).setUint8(1, slot & 255); return c; };
	/* clock: receive time minus send time, kept at its lowest (= the fastest packet), creeping up 1 ms a second so it follows clock drift */
	C.netClock = function (est, sendT, recvT) {
		var o = recvT - sendT;
		if (est.off == null || o < est.off || recvT - est.last > 20000) est.off = o; else est.off = Math.min(o, est.off + (recvT - est.last) * 0.001);
		est.last = recvT; return est.off;
	};
	/* a remote car's packets, oldest first; old / repeated / out-of-order packets are dropped */
	C.netPush = function (buf, s, max) {
		max = max || 40;
		if (buf.length && s.t <= buf[buf.length - 1].t) { if (buf.some(function (x) { return x.t === s.t; })) return false; buf.push(s); buf.sort(function (a, b) { return a.t - b.t; }); }
		else buf.push(s);
		while (buf.length > max) buf.shift();
		return true;
	};
	function nlerpQ(a, b, k) { var dt = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], sg = dt < 0 ? -1 : 1, q = [0, 1, 2, 3].map(function (i) { return a[i] + (b[i] * sg - a[i]) * k; }), n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map(function (x) { return x / n; }); }
	function lerpA(a, b, k) { var d = b - a; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; }
	C.netNlerp = nlerpQ;
	/* the pose at sender time t: between two packets = interpolated, after the last one = carried on along its velocity for at most
	   NET.EXTRA ms (then it waits), before the first = the first. Returns null for an empty buffer. */
	C.netSample = function (buf, t) {
		if (!buf.length) return null;
		var first = buf[0], last = buf[buf.length - 1], r;
		if (t <= first.t) r = { p: first.p.slice(), q: first.q.slice(), w: first.w, src: first, k: "first" };
		else if (t >= last.t) { var e = Math.min(t - last.t, C.NET.EXTRA) / 1000; r = { p: last.p.map(function (x, i) { return x + last.v[i] * e; }), q: last.q.slice(), w: last.w, src: last, k: t - last.t > C.NET.EXTRA ? "late" : "extra" }; }
		else {
			for (var i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= t) break;
			var a = buf[i - 1], b = buf[i], k = (t - a.t) / Math.max(1, b.t - a.t);
			if (Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]) > 30) k = 1; /* a reset: jump, don't slide across the map */
			r = { p: a.p.map(function (x, j) { return x + (b.p[j] - x) * k; }), q: nlerpQ(a.q, b.q, k), w: a.w.map(function (wa, j) { var wb = b.w[j]; return [wa[0] + (wb[0] - wa[0]) * k, wa[1] + (wb[1] - wa[1]) * k, lerpA(wa[2], wb[2], k)]; }), src: k < 0.5 ? a : b, k: "lerp" };
		}
		r.v = r.src.v; r.type = r.src.type; r.brake = r.src.brake; r.boost = r.src.boost; r.air = r.src.air; r.thr = r.src.thr; r.flap = r.src.flap;
		return r;
	};
	/* JSON events on the reliable channel: only these kinds and fields get through */
	C.netClean = function (o) {
		if (!o || typeof o !== "object" || typeof o.t !== "string") return null;
		var e = { t: o.t };
		if (typeof o.s === "number" && o.s >= 0 && o.s < 16) e.s = o.s | 0;
		switch (o.t) {
			case "hello": case "me": e.name = C.netName(o.name); e.car = C.CARS[o.car] ? o.car : "sports"; e.color = C.netColor(o.color) || "#d9480f"; if (o.v != null) e.v = o.v | 0; break;
			case "welcome": e.slot = Math.max(1, Math.min(15, o.slot | 0)); e.room = C.netRoom(o.room); if (!e.room) return null; break;
			case "room": e.room = C.netRoom(o.room); if (!e.room) return null; break;
			case "peers": e.list = (Array.isArray(o.list) ? o.list : []).slice(0, 16).map(function (p) { return { s: Math.max(0, Math.min(15, p.s | 0)), name: C.netName(p.name), car: C.CARS[p.car] ? p.car : "sports", color: C.netColor(p.color) || "#d9480f" }; }); break;
			case "chat": e.txt = C.netText(o.txt); if (!e.txt) return null; break;
			case "race": e.laps = Math.max(1, Math.min(10, o.laps | 0)); e.cd = Math.max(3, Math.min(10, o.cd | 0)); e.id = String(o.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 10); break;
			case "stop": break;
			case "lap": e.id = String(o.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 10); e.n = Math.max(0, Math.min(99, o.n | 0)); e.time = +o.time; e.total = +o.total; if (!(e.time > 0 && e.time < 36000 && e.total > 0 && e.total < 36000)) return null; e.fin = !!o.fin; break;
			case "bye": case "full": break;
			default: return null;
		}
		return e;
	};
	C.netRoom = function (r) {
		if (!r || typeof r !== "object" || !C.WORLDS[r.w]) return null;
		var g = +r.g; if (!isFinite(g) || g < 0 || g > 300) g = C.WORLDS[r.w].g;
		var o = { w: r.w, g: g, host: C.netName(r.host) };
		if (typeof r.map === "string" && /^[A-Za-z0-9_-]{1,12000}$/.test(r.map)) o.map = r.map;
		if (C.WEATHER[r.wx]) o.wx = r.wx;
		return o;
	};
	/* race grid: two lanes behind the start line, 9 m apart, a car's position by its slot */
	C.netGrid = function (slot) { return { s: -12 - Math.floor(slot / 2) * 9, lane: slot % 2 ? 3 : -3 }; };
	/* race results: finished first (by total time), then most laps, then who got there first */
	C.raceOrder = function (rows) {
		return rows.slice().sort(function (a, b) {
			if (!!a.fin !== !!b.fin) return a.fin ? -1 : 1;
			if (a.fin) return a.total - b.total;
			if ((b.n || 0) !== (a.n || 0)) return (b.n || 0) - (a.n || 0);
			return (a.total || 1e9) - (b.total || 1e9);
		});
	};

	if (typeof module !== "undefined" && module.exports) module.exports = C; else root.MESCar = C;
})(typeof window !== "undefined" ? window : this);

/* MES Car Sandbox: free-roam 3D driving with real rigid-body physics.
   Physics = Rapier 0.14.0 (rapier3d-compat, WebAssembly, jsDelivr): raycast-vehicle cars with springs, tyre grip limited by the load on
   each wheel (so braking and cornering really are 6 times weaker on the Moon), a heightfield terrain, ramps, a loop, a half pipe and
   loose objects. Drawing = three.js 0.170.0 (jsDelivr, unpkg fallback). Both load when the page starts.
   Car bodies dent where they are hit (vertices pushed in by the size of the sudden change in velocity), engines weaken with damage.
   Settings: localStorage mes-car-sandbox:v1; records: mes-car-sandbox:rec. window.MESCarSandbox = debug hooks. */
(function () {
	"use strict";
	var C = window.MESCar, root = document.getElementById("cs");
	if (!C || !root) return;
	function $(id) { return document.getElementById(id); }
	var KEY = "mes-car-sandbox:v1", RKEY = "mes-car-sandbox:rec";
	function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v && typeof v === "object" ? Object.assign(d, v) : d; } catch (e) { return d; } }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
	var usLocale = /^en-(US|LR|MM)/.test(navigator.language || "");
	var S = load(KEY, { world: "earth", car: null, color: null, cam: "chase", traffic: 3, ai: "cruise", g: null, sound: true, units: usLocale ? "mph" : "kmh", shadows: true, damage: true, touch: "auto", slow: false, help: true, tod: 13, cycle: false, cycleMin: 6, weather: "clear", vol: 0.7, show: { info: true, lap: true, speed: true, msg: true, ghost: true, map: true }, speed: 1, drive: "fast", mm: { z: 1, rot: true, big: false }, pEasy: true });
	if (!S.show || typeof S.show !== "object") S.show = { info: true, lap: true, speed: true, msg: true, ghost: true };
	if (S.ghost === false) { S.show.ghost = false; delete S.ghost; }
	if (typeof S.vol !== "number") S.vol = 0.7;
	if (typeof S.tod !== "number") S.tod = S.night ? 22 : 13; delete S.night;
	if (S.slow) { S.speed = 0.25; } delete S.slow;
	if (!C.SPEEDS.some(function (x) { return x[0] === S.speed; })) S.speed = 1;
	if (!C.DRIVE[S.drive]) S.drive = "fast";
	if (typeof S.pEasy !== "boolean") S.pEasy = true;
	if (!S.mm || typeof S.mm !== "object") S.mm = { z: 1, rot: true, big: false };
	if (S.show.map === undefined) S.show.map = true;
	/* custom maps per world (pieces, roads, oval on / off), kept in this browser */
	var MKEY = "mes-car-sandbox:maps", MAPS = load(MKEY, {});
	function saveMaps() { try { localStorage.setItem(MKEY, JSON.stringify(MAPS)); } catch (e) { /* storage full */ } }
	var REC = load(RKEY, { top: 0, jump: 0, air: 0, crash: 0, laps: {} }); if (!REC.laps) REC.laps = {};
	var Q = C.parseQuery(location.search);
	if (Q.world) { S.world = Q.world; S.g = null; S.car = null; }
	if (Q.car) S.car = Q.car; if (Q.g != null) S.g = Q.g; if (Q.traffic != null) S.traffic = Q.traffic; if (Q.ai) S.ai = Q.ai; if (Q.weather) S.weather = Q.weather; if (Q.tod != null) S.tod = Q.tod; if (Q.speed) S.speed = Q.speed; if (Q.drive) S.drive = Q.drive;
	if (!C.WORLDS[S.world]) S.world = "earth";

	var THREE = null, RAPIER = null;
	var stage = $("cs-stage"), view = $("cs-view");
	function msg(t) { var el = $("cs-load"); if (el) { el.textContent = t; el.hidden = !t; } }

	function imp(u) { return new Function("u", "return import(u)")(u); }
	function loadLibs() {
		var t = imp("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js").catch(function () { return imp("https://unpkg.com/three@0.170.0/build/three.module.min.js"); });
		var r = imp("https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js").catch(function () { return imp("https://unpkg.com/@dimforge/rapier3d-compat@0.14.0/rapier.es.js"); })
			.then(function (m) { var R = m.default || m; return R.init().then(function () { return R; }); });
		return Promise.all([t, r]);
	}

	/* ===================== renderer, scene, camera ===================== */
	var lampMat = null;
	var renderer, scene, camera, sunLight, hemi, worldGroup, skyGroup, clockLast = 0;
	var phys = null, eventQ = null, groundH = null, ter = null, W = null;
	var cars = [], objs = [], player = 0, statics = [];
	var gravity = 9.81, gFlip = 0, paused = false, subLast = true;
	var tmpV, tmpQ, tmpM;

	function initRenderer() {
		renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia("(pointer:coarse)").matches ? 1.5 : 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
		renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		var cv = renderer.domElement; cv.className = "cs-canvas"; cv.tabIndex = 0; cv.setAttribute("aria-label", "3D driving view. Click it, then drive with W A S D or the arrow keys.");
		stage.insertBefore(cv, stage.firstChild);
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 4000);
		sunLight = new THREE.DirectionalLight(0xffffff, 2.4); sunLight.castShadow = true;
		var sc = sunLight.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
		sunLight.shadow.mapSize.set(2048, 2048); sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03;
		scene.add(sunLight); scene.add(sunLight.target);
		hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); scene.add(hemi);
		tmpV = new THREE.Vector3(); tmpQ = new THREE.Quaternion(); tmpM = new THREE.Matrix4();
		resize();
		new ResizeObserver(resize).observe(stage);
	}
	function resize() {
		if (!renderer) return;
		var w = stage.clientWidth || 640, h = stage.clientHeight || 360;
		root.classList.toggle("cs-narrow", w < 900);
		var sb = stage.querySelector(".cs-sbtns"); if (sb) stage.style.setProperty("--cs-spt", (sb.offsetTop + sb.offsetHeight + 8) + "px");
		renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
	}

	/* ---------- textures drawn on a canvas ---------- */
	function canvasTex(w, h, draw, rep) {
		var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
		var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
		if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
		return t;
	}
	function noiseTex(seed, base, spread) {
		var r = C.rng(seed);
		return canvasTex(256, 256, function (g, w, h) {
			var id = g.createImageData(w, h);
			for (var i = 0; i < w * h; i++) { var v = base + (r() - 0.5) * spread + (C.noise((i % w) / 16, Math.floor(i / w) / 16, seed) - 0.5) * spread * 1.4; v = Math.max(0, Math.min(255, v)); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
			g.putImageData(id, 0, 0);
		});
	}

	/* ===================== the world ===================== */
	function clearWorld() {
		if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
		if (skyGroup) scene.remove(skyGroup); skyGroup = null; skyRef = null;
		cars.forEach(function (c) { scene.remove(c.group); }); objs.forEach(function (o) { scene.remove(o.mesh); }); netWorldCleared();
		cars = []; objs = []; statics = []; pieceBodies = []; ovalBodies = []; lapPath = null; mmBg = null; parts.clear(); lampMat = null; groundMat = trackMat = null; if (heads && heads.group.parent) heads.group.parent.remove(heads.group); replayStop(true); recFrames = [];
		if (phys) { phys.free(); phys = null; }
	}

	function buildWorld() {
		clearWorld();
		W = C.WORLDS[S.world];
		gravity = S.g != null ? S.g : W.g; gFlip = 0;
		phys = new RAPIER.World({ x: 0, y: -gravity, z: 0 }); phys.timestep = 1 / 60;
		eventQ = new RAPIER.EventQueue(true);
		worldGroup = new THREE.Group(); scene.add(worldGroup);
		ter = C.makeTerrain(S.world); groundH = C.heightGrid(ter);
		ovalGroup = new THREE.Group(); worldGroup.add(ovalGroup); ovalBodies = [];
		pieceGroup = new THREE.Group(); worldGroup.add(pieceGroup); pieceBodies = [];
		buildSky(); collect = ovalBodies; buildGround(); collect = null; buildBorder(); buildDecor();
		buildMapContent(false);
		applyLighting();
		/* the player's car at the start, then the computer cars */
		var ptype = S.car && C.CARS[S.car] ? S.car : W.car, start = C.isPlane(ptype) ? planeStart() : startPose(0);
		cars.push(makeCar(ptype, S.color || null, start, true));
		buildRunway();
		player = 0; lapReset(); if (ghostMesh) { scene.remove(ghostMesh); ghostMesh = null; } ghostKey = ""; ghost = null;
		setTraffic(S.traffic);
		camSnap = true;
		updateGravityUI(); updateHud(true); applyShow();
		netWorldBuilt();
	}
	function startPose(i) {
		if (lapPath) { var q = C.pathPoint(lapPath, i ? 30 + i * 16 : (lapPath.closed ? -8 : 4)), ln = (i % 2 ? 1 : -1) * (i ? Math.min(3.5, lapPath.w / 3) : 0); return { x: q.x + Math.cos(q.dir) * ln, z: q.z - Math.sin(q.dir) * ln, yaw: q.dir }; }
		if (W.track) { var p = C.trackPoint(i ? 30 + i * 16 : -8), lane = (i % 2 ? 1 : -1) * (i ? 3.5 : 0); return { x: p.x + Math.cos(p.dir) * lane, z: p.z - Math.sin(p.dir) * lane, yaw: p.dir }; }
		var a = i * 0.9; return { x: Math.sin(a) * (i ? 14 + i * 3 : 0), z: -Math.cos(a) * (i ? 14 + i * 3 : 0), yaw: 0 };
	}
	function hAt(x, z) { return C.gridHeight(ter, groundH, x, z); }
	/* a plane starts at the west end of the runway on the test-track worlds, facing down it (+X) */
	function planeStart() { if (W.track) { var R = C.RUNWAY; return { x: R.x - R.len / 2 + 22, z: R.z, yaw: Math.PI / 2 }; } return startPose(0); }
	/* ---------- day and night ---------- */
	var NIGHT_SKY = { earth: ["#01030a", "#0c1730"], jupiter: ["#030208", "#1a1420"], mars: ["#04030a", "#1e1418"], moon: ["#000000", "#020308"], ceres: ["#000000", "#020205"] };
	var dayK = 1, skyRef = null;
	function applyLighting() { applyGround(); buildWeather(); sunLight.castShadow = !!S.shadows; if (!skyGroup) buildSky(); applyTime(); }
	/* everything that depends on the hour: sun / moon light, sky colours, stars, fog, lamps. Cheap, so it runs every frame while the day cycles. */
	var tmpC1, tmpC2, tmpC3;
	function applyTime() {
		if (!W || !skyRef) return;
		tmpC1 = tmpC1 || new THREE.Color(); tmpC2 = tmpC2 || new THREE.Color(); tmpC3 = tmpC3 || new THREE.Color();
		var st = C.sunAt(S.tod, W.sun), d = st.day, X = wx(), ov = X.over, dusk = st.dusk * (1 - ov * 0.8);
		dayK = d;
		var sunDir = new THREE.Vector3(st.dir[0], st.dir[1], st.dir[2]), moonDir = new THREE.Vector3(-st.dir[0], Math.max(0.35, Math.abs(st.dir[1]) * 0.6 + 0.3), -st.dir[2]).normalize();
		var dayI = (W.amb < 0.3 ? 3.2 : 2.4) * (1 - ov * 0.65), nightI = W.planet === "earth" ? 0.55 : 0.4;
		if (st.sunK >= st.moonK) { sunLight.userData.dir = sunDir; sunLight.intensity = dayI * st.sunK; sunLight.color.set(W.sunCol).lerp(tmpC1.set("#ff9b5c"), Math.min(1, dusk * 1.1)); }
		else { sunLight.userData.dir = moonDir; sunLight.intensity = nightI * st.moonK * (1 - ov * 0.6); sunLight.color.set(W.planet === "earth" ? "#9fc0ff" : "#a9bdf5"); }
		var dayHemi = ov ? W.amb * (1 + ov * 0.4) : W.amb;
		hemi.intensity = 0.12 + (dayHemi - 0.12) * d;
		hemi.color.set(0x1d2a48).lerp(tmpC1.set(W.amb < 0.3 ? 0x8899aa : W.sky[1]), d); hemi.groundColor.set(0x050608).lerp(tmpC1.set(W.ground[0]), d);
		hemiBase = hemi.intensity;
		renderer.toneMappingExposure = 1.25 + ((W.amb < 0.3 ? 0.95 : 1.0) - 1.25) * d;
		/* sky: night colours -> day colours (greyer under cloud), with an orange horizon at sunrise / sunset */
		var dsky = W.sky, nsky = NIGHT_SKY[S.world] || ["#000", "#050810"];
		var top = tmpC1.set(dsky[0]), hor = tmpC2.set(dsky[1]);
		if (ov) { var grey = S.world === "mars" ? ["#8f6a4c", "#c79a72"] : X.snowy ? ["#9aa4b0", "#d5dbe2"] : ["#4f5863", "#8b949e"]; top.lerp(tmpC3.set(grey[0]), ov); hor.lerp(tmpC3.set(grey[1]), ov); }
		top.lerp(tmpC3.set(ov ? "#0a0c10" : nsky[0]), 1 - d); hor.lerp(tmpC3.set(ov ? "#111419" : nsky[1]), 1 - d);
		if (W.rho) hor.lerp(tmpC3.set(S.world === "mars" ? "#7fa6c9" /* Mars sunsets are blue */ : "#ff8a45"), dusk * 0.85);
		var col = skyRef.geo.attributes.color, ys = skyRef.ys, c = tmpC3;
		for (var i = 0; i < ys.length; i++) { c.copy(hor).lerp(top, Math.pow(ys[i], 0.55)); col.setXYZ(i, c.r, c.g, c.b); }
		col.needsUpdate = true;
		skyRef.sun.position.copy(sunDir).multiplyScalar(1500); skyRef.sun.visible = st.elev > -0.06 && ov < 0.55; skyRef.sun.material.color.set("#ffffff").lerp(tmpC3.set("#ffb070"), dusk);
		if (skyRef.moon) { skyRef.moon.position.copy(moonDir).multiplyScalar(1500); skyRef.moon.material.opacity = Math.max(0, 1 - d * 1.4); skyRef.moon.visible = skyRef.moon.material.opacity > 0.02 && ov < 0.55; }
		var so = W.stars ? 1 : Math.pow(1 - d, 2) * (ov < 0.55 ? 1 : 0); skyRef.stars.material.opacity = so; skyRef.stars.visible = so > 0.02;
		/* fog follows the sky */
		var fogDay = X.fogCol || (W.fog && W.fog[0]);
		if (fogDay) {
			var fcol = tmpC3.set(fogDay); if (W.rho) fcol.lerp(tmpC2.set("#e79a6a"), dusk * 0.35); fcol.lerp(tmpC1.set("#05070d"), 1 - d);
			var f1 = (W.fog ? W.fog[1] : 300) * Math.max(0.05, X.fog) * (0.6 + 0.4 * d), f2 = (W.fog ? W.fog[2] : 900) * X.fog * (0.7 + 0.3 * d);
			if (!scene.fog) scene.fog = new THREE.Fog(fcol, f1, f2); else { scene.fog.color.copy(fcol); scene.fog.near = f1; scene.fog.far = f2; }
		} else scene.fog = null;
		if (lampMat) lampMat.emissiveIntensity = 3 * Math.max(0, Math.min(1, (0.55 - d) / 0.35));
		var dark = d < 0.45, b = $("cs-night"); if (b) { b.setAttribute("aria-pressed", String(dark)); b.textContent = dark ? "☀️" : "🌙"; }
		todUI();
	}
	function todUI() {
		root.querySelectorAll("[data-tod]").forEach(function (x) { if (document.activeElement !== x) x.value = String(S.tod); });
		root.querySelectorAll("[data-todlab]").forEach(function (x) { x.textContent = C.fmtTime(S.tod) + " · " + C.timeName(S.tod); });
		root.querySelectorAll("[data-cycle]").forEach(function (x) { x.textContent = S.cycle ? "❚❚ Stop the clock" : "▶ Run the day"; x.setAttribute("aria-pressed", String(!!S.cycle)); });
		root.querySelectorAll("[data-cyspd]").forEach(function (x) { x.value = String(S.cycleMin); });
	}
	function setTod(h, quiet) { S.tod = ((h % 24) + 24) % 24; if (!quiet) save(); applyTime(); }
	/* ---------- weather ---------- */
	function wx() { return C.WEATHER[C.weatherFor(S.world).indexOf(S.weather) >= 0 ? S.weather : "clear"]; }
	var hemiBase = 0.5, groundMat = null, trackMat = null, groundMap = null, snowMap = null, wxObj = null, rainSnd = null, nextBolt = 0, flash = 0;
	function applyGround() {
		var X = wx();
		if (groundMat) {
			if (X.snowy) { snowMap = snowMap || canvasTex(256, 256, function (g, w, h) { var r = C.rng(8), id = g.createImageData(w, h); for (var i = 0; i < w * h; i++) { var v = 232 + (r() - 0.5) * 26 + (C.noise((i % w) / 20, Math.floor(i / w) / 20, 3) - 0.5) * 30; id.data[i * 4] = v - 6; id.data[i * 4 + 1] = v - 2; id.data[i * 4 + 2] = Math.min(255, v + 8); id.data[i * 4 + 3] = 255; } g.putImageData(id, 0, 0); }, [1, 1]); groundMat.map = snowMap; groundMat.color.set(S.world === "mars" ? "#f2e2d2" : "#ffffff"); }
			else { groundMat.map = groundMap; groundMat.color.set(X.p === "rain" ? "#b5b5b5" : "#ffffff"); }
			groundMat.needsUpdate = true;
		}
		if (trackMat) { var wet = X.p === "rain"; trackMat.roughness = wet ? 0.28 : 0.85; trackMat.metalness = wet ? 0.25 : 0; trackMat.color.set(X.snowy ? "#d9dde3" : wet ? "#8a8a8a" : (W.g > 20 ? "#c8b89a" : "#ffffff")); }
	}
	function buildWeather() {
		if (wxObj) { scene.remove(wxObj); wxObj.geometry.dispose(); wxObj = null; }
		var X = wx(); if (!X.p) return;
		var n = X.n, rain = X.p === "rain", pos = new Float32Array(n * (rain ? 6 : 3)), cam = camera.position, r = C.rng(4);
		var P = new Float32Array(n * 3); for (var i = 0; i < n; i++) { P[i * 3] = cam.x + (r() - 0.5) * WXB; P[i * 3 + 1] = cam.y + (r() - 0.5) * WXH; P[i * 3 + 2] = cam.z + (r() - 0.5) * WXB; }
		var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		if (rain) wxObj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc8d6e4, transparent: true, opacity: 0.7, depthWrite: false }));
		else wxObj = new THREE.Points(geo, new THREE.PointsMaterial({ color: X.p === "dust" ? 0xc98a55 : 0xffffff, size: X.p === "dust" ? 0.16 : 0.28, transparent: true, opacity: X.p === "dust" ? 0.55 : 0.95, depthWrite: false, map: flakeTex(), alphaTest: 0.05 }));
		wxObj.frustumCulled = false; wxObj.userData = { P: P, X: X, phase: new Float32Array(n).map(function () { return r() * 6.28; }) }; scene.add(wxObj);
	}
	var WXB = 50, WXH = 26, flakeT = null;
	function flakeTex() { return flakeT || (flakeT = canvasTex(32, 32, function (g) { var gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,0.7)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); })); }
	function stepWeather(dt) {
		if (!wxObj) return;
		var U = wxObj.userData, X = U.X, P = U.P, n = X.n, pos = wxObj.geometry.attributes.position.array, cam = camera.position, rain = X.p === "rain", t = performance.now() / 1000;
		var wind = X.wind, fall = X.fall * Math.min(1.6, Math.sqrt(Math.max(0.3, gravity) / 9.81)), hb = WXB / 2, hh = WXH / 2;
		for (var i = 0; i < n; i++) {
			var k = i * 3, sw = X.p === "snow" ? Math.sin(t * 1.3 + U.phase[i]) * 0.6 : 0;
			P[k] += (wind + sw) * dt; P[k + 1] -= fall * dt; P[k + 2] += (X.p === "dust" ? wind * 0.3 : sw * 0.6) * dt;
			if (X.p === "dust") P[k + 1] += Math.sin(t * 2 + U.phase[i]) * dt * 1.5;
			var dx = P[k] - cam.x, dy = P[k + 1] - cam.y, dz = P[k + 2] - cam.z;
			if (dx > hb) P[k] -= WXB; else if (dx < -hb) P[k] += WXB;
			if (dz > hb) P[k + 2] -= WXB; else if (dz < -hb) P[k + 2] += WXB;
			if (dy < -hh) P[k + 1] += WXH; else if (dy > hh) P[k + 1] -= WXH;
			if (rain) { var j = i * 6; pos[j] = P[k]; pos[j + 1] = P[k + 1]; pos[j + 2] = P[k + 2]; pos[j + 3] = P[k] - wind * 0.045; pos[j + 4] = P[k + 1] + fall * 0.045; pos[j + 5] = P[k + 2]; }
			else { pos[k] = P[k]; pos[k + 1] = P[k + 1]; pos[k + 2] = P[k + 2]; }
		}
		wxObj.geometry.attributes.position.needsUpdate = true;
		/* lightning */
		if (X.lightning && !replay) {
			if (simT > nextBolt) { nextBolt = simT + 5 + Math.random() * 10; flash = 0.35; setTimeout(function () { sfx("thunder", 0.6 + Math.random() * 0.4); }, 600 + Math.random() * 2400); }
			if (flash > 0) { flash -= dt; hemi.intensity = (flash % 0.12 > 0.06 ? 4 : 0.6); if (flash <= 0) hemi.intensity = hemiBase; }
		}
	}
	function rainSound() {
		if (!ac || !noiseBuf) return; var X = wx(), on = S.sound && !document.hidden && stageVisible() && (X.p === "rain" || X.p === "dust");
		if (on && !rainSnd) { var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = noiseBuf; src.loop = true; f.type = X.p === "dust" ? "lowpass" : "bandpass"; f.frequency.value = X.p === "dust" ? 500 : 1600; g.gain.value = 0; src.connect(f); f.connect(g); g.connect(eng.master); src.start(); rainSnd = { src: src, g: g, f: f }; }
		if (rainSnd) { rainSnd.g.gain.setTargetAtTime(on ? (X.n > 6000 ? 0.32 : 0.2) : 0, ac.currentTime, 0.3); if (!on && rainSnd.g.gain.value < 0.01) { rainSnd.src.stop(); rainSnd = null; } }
	}
	function setWeather(k) {
		if (C.weatherFor(S.world).indexOf(k) < 0) { toast(W.rho ? "Not on this world" : "No air on " + W.name.replace(/ \(.*/, "") + ", so no weather"); return; }
		S.weather = k; save(); applyLighting(); updateGravityUI(); syncUrl(); netRoomChanged();
		var X = wx(); $("cs-wx").value = k;
		toast(X.name + (X.grip < 1 ? ": tyre grip " + Math.round(X.grip * 100) + "% of dry, so brake earlier" : ""));
	}
	function setNight(on) { setTod(on ? 22 : 12.5); syncUrl(); toast(on ? (W.stars ? "Night: only the light of the " + (W.planet === "earth" ? "Earth" : "stars") + " and your headlights" : "Night: headlights on") : "Daytime"); }
	/* headlights: two real spot lights on the player's car (only at night) + faint beams */
	var heads = null;
	function headlights() {
		if (!heads) {
			heads = { group: new THREE.Group(), lights: [] };
			[-1, 1].forEach(function (sx) {
				var L = new THREE.SpotLight(0xfff0d0, 260, 110, 0.42, 0.55, 1.3), tg = new THREE.Object3D();
				L.position.set(sx * 0.6, 0, 0); tg.position.set(sx * 1.2, -2.2, 30); L.target = tg; heads.group.add(L, tg); heads.lights.push(L);
			});
			var beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 20, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.022, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
			beam.rotation.x = -Math.PI / 2; beam.position.set(0, -0.5, 10); heads.group.add(beam);
		}
		var c = cars[player]; if (!c) return;
		heads.group.visible = dayK < 0.45;
		if (heads.group.parent !== c.group) { c.group.add(heads.group); heads.group.position.set(0, c.d.windows ? -c.d.h * 0.3 : c.d.h * 0.15, c.d.l / 2 + 0.05); }
	}

	function buildSky() {
		skyGroup = new THREE.Group(); scene.add(skyGroup);
		var geo = new THREE.SphereGeometry(1800, 32, 16), p = geo.attributes.position, ys = new Float32Array(p.count);
		for (var i = 0; i < p.count; i++) ys[i] = Math.max(0, p.getY(i) / 1800);
		geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3));
		skyGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
		var sunTex = canvasTex(128, 128, function (g) { var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,250,1)"); gr.addColorStop(0.18, "rgba(255,250,230,0.95)"); gr.addColorStop(0.4, "rgba(255,230,180,0.25)"); gr.addColorStop(1, "rgba(255,220,160,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
		var sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true })); sun.scale.setScalar(W.amb < 0.3 ? 120 : 260); skyGroup.add(sun);
		var moonS = null;
		if (!W.stars) { /* a moon for the night sky */
			var mt = canvasTex(128, 128, function (g) { var gr = g.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, "rgba(235,240,255,1)"); gr.addColorStop(0.42, "rgba(220,228,250,1)"); gr.addColorStop(0.5, "rgba(180,200,255,0.25)"); gr.addColorStop(1, "rgba(150,180,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = "rgba(160,170,190,.5)"; [[52, 50, 9], [74, 70, 7], [60, 78, 5]].forEach(function (c) { g.beginPath(); g.arc(c[0], c[1], c[2], 0, 7); g.fill(); }); });
			moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, fog: false, depthWrite: false, transparent: true })); moonS.scale.setScalar(150); skyGroup.add(moonS);
		}
		var r = C.rng(99), pts = [];
		for (var k = 0; k < 2500; k++) { var u = r() * 2 - 1, a = r() * Math.PI * 2, s2 = Math.sqrt(1 - u * u); if (u < -0.05) continue; pts.push(Math.cos(a) * s2 * 1700, u * 1700, Math.sin(a) * s2 * 1700); }
		var sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
		var stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true }));
		skyGroup.add(stars);
		skyRef = { geo: geo, ys: ys, sun: sun, moon: moonS, stars: stars };
		if (W.planet === "earth") {
			var et = canvasTex(512, 256, function (g, w, h) { g.fillStyle = "#1d4f91"; g.fillRect(0, 0, w, h); var r2 = C.rng(5); g.fillStyle = "#3f7d3a"; for (var i = 0; i < 26; i++) { g.beginPath(); g.ellipse(r2() * w, h * (0.2 + r2() * 0.6), 20 + r2() * 60, 12 + r2() * 30, r2() * 3, 0, 7); g.fill(); } g.fillStyle = "rgba(255,255,255,.75)"; for (i = 0; i < 60; i++) { g.beginPath(); g.ellipse(r2() * w, r2() * h, 10 + r2() * 40, 3 + r2() * 8, r2() * 0.5, 0, 7); g.fill(); } g.fillStyle = "#f4f7fb"; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); });
			var earth = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 24), new THREE.MeshStandardMaterial({ map: et, roughness: 0.8, fog: false }));
			earth.position.set(-600, 520, -900); earth.rotation.z = 0.4; skyGroup.add(earth);
		}
		if (W.planet === "saturn") {
			var st = canvasTex(256, 128, function (g, w, h) { for (var y = 0; y < h; y++) { g.fillStyle = "hsl(38," + (35 + 15 * Math.sin(y * 0.35)) + "%," + (62 + 10 * Math.sin(y * 0.17)) + "%)"; g.fillRect(0, y, w, 1); } });
			var sat = new THREE.Group(); sat.add(new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), new THREE.MeshStandardMaterial({ map: st, fog: false })));
			var ring = new THREE.Mesh(new THREE.RingGeometry(115, 190, 96), new THREE.MeshBasicMaterial({ color: 0xd8c39a, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false })); ring.rotation.x = -Math.PI / 2 + 0.35; sat.add(ring);
			sat.position.set(700, 420, -800); sat.rotation.z = -0.3; skyGroup.add(sat);
		}
	}

	function buildGround() {
		var n = ter.n, s = ter.size, k = n + 1, pos = new Float32Array(k * k * 3), col = new Float32Array(k * k * 3), uv = new Float32Array(k * k * 2), idx = [];
		/* the ground picture (AI-made seamless photo textures, tex-<name>.jpg) carries the colour; vertex colours only shade it */
		var TX = { earth: ["grass", 5, [1, 1, 1]], moon: ["moon", 11, [1, 1, 1]], mars: ["mars", 9, [1, 1, 1]], ceres: ["ceres", 9, [1, 1, 1]], jupiter: ["mars", 9, [0.86, 0.8, 0.7]] }[S.world] || ["grass", 5, [1, 1, 1]];
		var tint = TX[2], c = new THREE.Color();
		for (var ix = 0; ix <= n; ix++) for (var iz = 0; iz <= n; iz++) {
			var i = ix * k + iz, x = -s / 2 + ix * s / n, z = -s / 2 + iz * s / n, y = groundH[i];
			pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; uv[i * 2] = x / TX[1]; uv[i * 2 + 1] = z / TX[1];
			var sl = Math.min(1, Math.hypot(groundH[Math.min(n, ix + 1) * k + iz] - groundH[Math.max(0, ix - 1) * k + iz], groundH[ix * k + Math.min(n, iz + 1)] - groundH[ix * k + Math.max(0, iz - 1)]) / (2 * s / n) * 1.5);
			var nz = C.noise(x / 30, z / 30, 77);
			var b = 0.84 + (nz - 0.5) * 0.34 + (C.noise(x / 7, z / 7, 78) - 0.5) * 0.12 - sl * 0.22;
			if (W.craters) { var cr = 0; ter.craters.forEach(function (q) { var d = Math.hypot(x - q.x, z - q.z) / q.R; if (d < 1) cr = Math.max(cr, 1 - d); }); b -= cr * 0.18; }
			if (W.track) { var dry = Math.max(0, C.noise(x / 55, z / 55, 79) - 0.55) * 1.4; c.setRGB(b * (1 + dry * 0.25), b * (1 - dry * 0.05), b * (1 - dry * 0.35)); } else c.setRGB(b, b, b);
			c.r *= tint[0]; c.g *= tint[1]; c.b *= tint[2];
			col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
		}
		for (ix = 0; ix < n; ix++) for (iz = 0; iz < n; iz++) { var a = ix * k + iz, b = (ix + 1) * k + iz, cc = ix * k + iz + 1, d = (ix + 1) * k + iz + 1; idx.push(a, cc, b, b, cc, d); }
		var geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
		geo.setIndex(idx); geo.computeVertexNormals();
		var tex = new THREE.TextureLoader().load("/car-sandbox/img/tex-" + TX[0] + ".jpg?v=1", function () { /* drawn on the next frame */ });
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
		groundMap = tex; groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.97, metalness: 0 });
		var mesh = new THREE.Mesh(geo, groundMat);
		mesh.receiveShadow = true; worldGroup.add(mesh);
		/* physics */
		var body = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
		phys.createCollider(RAPIER.ColliderDesc.heightfield(n, n, groundH, { x: s, y: 1, z: s }).setFriction(W.track ? 1.0 : 0.85).setRestitution(0.05), body);
		if (W.track) buildTrack();
	}
	var ovalGroup = null, ovalBodies = [], pieceGroup = null, pieceBodies = [], collect = null, roadMat = null, lapPath = null, mmBg = null;

	function buildTrack() {
		var T = C.TRACK, L = C.trackLength(), N = Math.ceil(L / 2), pos = [], uv = [], idx = [];
		for (var i = 0; i <= N; i++) {
			var p = C.trackPoint(i / N * L), lx = Math.cos(p.dir), lz = -Math.sin(p.dir);
			pos.push(p.x + lx * T.width / 2, 0.03, p.z + lz * T.width / 2, p.x - lx * T.width / 2, 0.03, p.z - lz * T.width / 2);
			uv.push(0, i / N * L / 8, 1, i / N * L / 8);
			if (i < N) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
		}
		var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
		var tex = canvasTex(128, 256, function (g, w, h) {
			var r = C.rng(3), id = g.createImageData(w, h);
			for (var q = 0; q < w * h; q++) { var v = 62 + r() * 22; id.data[q * 4] = v; id.data[q * 4 + 1] = v; id.data[q * 4 + 2] = v + 3; id.data[q * 4 + 3] = 255; }
			g.putImageData(id, 0, 0); g.fillStyle = "#f2f2f2"; g.fillRect(3, 0, 5, h); g.fillRect(w - 8, 0, 5, h); g.fillRect(w / 2 - 2, 0, 4, h * 0.45);
		});
		tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
		trackMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
		var m = new THREE.Mesh(geo, trackMat);
		if (W.g > 20) m.material.color.set("#c8b89a");
		m.receiveShadow = true; ovalGroup.add(m);
		/* start line */
		var p0 = C.trackPoint(0), chk = canvasTex(64, 16, function (g) { for (var x = 0; x < 16; x++) for (var y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? "#111" : "#fff"; g.fillRect(x * 4, y * 4, 4, 4); } });
		var line = new THREE.Mesh(new THREE.PlaneGeometry(T.width, 2), new THREE.MeshStandardMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -4 }));
		line.rotation.x = -Math.PI / 2; line.rotation.z = p0.dir; line.position.set(p0.x, 0.04, p0.z); ovalGroup.add(line);
	}

	function fixedBox(hx, hy, hz, x, y, z, q, fric) {
		var b = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q));
		phys.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(fric == null ? 0.9 : fric), b); if (collect) collect.push(b); return b;
	}
	function qYaw(y) { return { x: 0, y: Math.sin(y / 2), z: 0, w: Math.cos(y / 2) }; }
	var matCache = {};
	function mat(col, o) { var k = col + JSON.stringify(o || {}); return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.8 }, o || {}))); }

	/* ---------- map pieces (ramps, loops, half pipes ...) and drawn roads: rebuilt whenever the map is edited ---------- */
	var pads = [], launchKey = false, rampTex = null, roadTex = null, defMaps = {}, roadCache = typeof WeakMap === "function" ? new WeakMap() : null;
	function mapOf() { if (sharedMap && sharedMap.world === S.world) return sharedMap.m; return MAPS[S.world] || null; }
	function curMap() { return mapOf() || defMaps[S.world] || (defMaps[S.world] = C.mapPreset("original", S.world)); }
	function ovalOn() { return !!(W && W.track && curMap().oval !== false); }
	function hasLap() { return !!lapPath || ovalOn(); }
	function roadPathOf(r) { var k = r.w + "|" + (r.closed ? 1 : 0) + "|" + r.pts.join(";"), c = roadCache && roadCache.get(r); if (c && c.k === k) return c.p; var pth = C.roadPath(r.pts, r.closed, 2); pth.w = r.w; if (roadCache) roadCache.set(r, { k: k, p: pth }); return pth; }
	function hashStr(t) { var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
	function disposeKids(gr) { while (gr.children.length) { var o = gr.children.pop(); o.traverse(function (q) { if (q.geometry) q.geometry.dispose(); }); } }
	function buildMapContent(rebuild) {
		if (rebuild) netRoomChanged();
		pieceBodies.forEach(function (b) { phys.removeRigidBody(b); }); pieceBodies = []; disposeKids(pieceGroup); statics = []; pads = [];
		var m = curMap(), on = ovalOn();
		ovalGroup.visible = on; ovalBodies.forEach(function (b) { b.setEnabled(on); });
		collect = pieceBodies; buildStatics(m.p || []); buildRoads(m.r || []); collect = null;
		lapPath = null;
		if (!on) (m.r || []).some(function (r) { if (!r.closed || r.pts.length < 3) return false; var pth = roadPathOf(r); if (pth.L < 60) return false; lapPath = pth; lapPath.id = hashStr(r.pts.join(";") + r.w); return true; });
		if (lapPath) startLine(lapPath);
		mmBg = null;
		if (rebuild) { lapReset(); ghostKey = ""; ghost = null; if (ghostMesh) ghostMesh.visible = false; updateHud(true); }
	}
	/* a car standing inside a new piece would be shot out of it: move it to the start (or where the editor put it) */
	function clearCarsFromPieces(pose) {
		var ps = curMap().p || [];
		cars.forEach(function (c, i) {
			if (i === player && pose) { c.body.setTranslation({ x: pose.x, y: groundBelow(pose.x, pose.z) + c.d.wr + c.d.rest + 1.2, z: pose.z }, true); c.body.setRotation(qYaw(pose.yaw), true); c.body.setLinvel({ x: 0, y: 0, z: 0 }, true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true); c.lastV = null; c.born = simT; camSnap = true; return; }
			var t = c.body.translation(); if (ps.some(function (p) { return C.pieceHit(p, t.x, t.z, 1.5); })) { resetCar(c, false); if (i === player) camSnap = true; }
		});
	}
	function pieceGround(p, dz, flip) {
		var R = C.pieceRect(p), pts = [[0, dz], [R.cx - R.hx, dz - R.hz], [R.cx + R.hx, dz - R.hz], [R.cx - R.hx, dz + R.hz], [R.cx + R.hx, dz + R.hz]];
		if (p.t === "gap") pts = [[0, dz], [-p.w / 2, dz - p.l / 2], [p.w / 2, dz - p.l / 2], [-p.w / 2, dz + p.l / 2], [p.w / 2, dz + p.l / 2]];
		var h = 1e9; pts.forEach(function (q) { var w2 = C.toWorld(p, q[0], q[1]); h = Math.min(h, hAt(w2[0], w2[1])); }); return h - 0.02;
	}
	function planarUV(geo) {
		geo.computeVertexNormals();
		var pos = geo.attributes.position, nor = geo.attributes.normal, uv = new Float32Array(pos.count * 2);
		for (var i = 0; i < pos.count; i++) {
			var nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
			if (ny >= nx && ny >= nz) { uv[i * 2] = pos.getX(i) / 4; uv[i * 2 + 1] = pos.getZ(i) / 4; }
			else if (nx >= nz) { uv[i * 2] = pos.getZ(i) / 4; uv[i * 2 + 1] = pos.getY(i) / 4; }
			else { uv[i * 2] = pos.getX(i) / 4; uv[i * 2 + 1] = pos.getY(i) / 4; }
		}
		geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
		return geo;
	}
	/* a convex prism: side profile [[z, y], ...] extruded across the width (or, across = true, a profile [[x, y], ...] extruded along the length) */
	function buildPrism(p, part, matl) {
		var w = part.across ? p.l : p.w, dz = part.dz || 0, wpos = C.toWorld(p, 0, dz), yaw = p.yaw + (part.flip ? Math.PI : 0), gy = pieceGround(p, dz, part.flip);
		var sh = new THREE.Shape(part.prof.map(function (q) { return new THREE.Vector2(q[0], q[1]); }));
		var geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 1 });
		if (part.across) geo.translate(0, 0, -w / 2); else { geo.rotateY(-Math.PI / 2); geo.translate(w / 2, 0, 0); }
		planarUV(geo);
		var q = qYaw(yaw), mesh = new THREE.Mesh(geo, matl); mesh.position.set(wpos[0], gy, wpos[1]); mesh.quaternion.set(q.x, q.y, q.z, q.w); mesh.castShadow = mesh.receiveShadow = true; pieceGroup.add(mesh);
		var pts = []; part.prof.forEach(function (pp) { [-w / 2, w / 2].forEach(function (e) { if (part.across) pts.push(pp[0], pp[1], e); else pts.push(e, pp[1], pp[0]); }); });
		var body = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(wpos[0], gy, wpos[1]).setRotation(q));
		phys.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setFriction(1.0), body); if (collect) collect.push(body);
	}
	function buildStatics(list) {
		if (!rampTex) rampTex = canvasTex(64, 64, function (g, w, h) { g.fillStyle = "#c9c2b5"; g.fillRect(0, 0, w, h); g.fillStyle = "#e8a400"; for (var i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 16, h); g.lineTo(i * 16 + 8, h); g.lineTo(i * 16 + 8 + h, 0); g.lineTo(i * 16 + h, 0); g.fill(); } }, [1, 1]);
		var rampMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.85, side: THREE.DoubleSide });
		var bumpMat = mat("#d9822b", { roughness: 0.8, side: THREE.DoubleSide }), bankMat = mat("#8fb3d9", { roughness: 0.6, side: THREE.DoubleSide });
		list.forEach(function (st) {
			var q = qYaw(st.yaw), tq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
			if (st.t === "ramp" || st.t === "gap" || st.t === "table" || st.t === "whoops" || st.t === "bank") {
				C.prismParts(st).forEach(function (part) { buildPrism(st, part, st.t === "whoops" ? bumpMat : st.t === "bank" ? bankMat : rampMat); });
			} else if (st.t === "block") {
				var gy = pieceGround(st, 0);
				fixedBox(st.w / 2, st.h / 2, st.l / 2, st.x, gy + st.h / 2, st.z, q);
				var bm = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.l), mat(st.k === "wall" ? "#a2412b" : "#9aa0a6")); bm.position.set(st.x, gy + st.h / 2, st.z); bm.quaternion.copy(tq); bm.castShadow = bm.receiveShadow = true; pieceGroup.add(bm);
			} else if (st.t === "pad") {
				var gpd = pieceGround(st, 0), th = 0.22, col = st.pad === "spring" ? "#2fb344" : st.pad === "press" ? "#9b5de5" : "#15aabf";
				fixedBox(st.w / 2, th / 2, st.l / 2, st.x, gpd + th / 2, st.z, q, 1.0);
				var pg = new THREE.Group(); pg.position.set(st.x, gpd, st.z); pg.quaternion.copy(tq); pieceGroup.add(pg);
				var base = new THREE.Mesh(new THREE.BoxGeometry(st.w + 0.3, th * 0.6, st.l + 0.3), mat("#2b2f36", { metalness: 0.5, roughness: 0.5 })); base.position.y = th * 0.3; base.receiveShadow = true; pg.add(base);
				var face = padTex(st.pad), top = new THREE.Mesh(new THREE.BoxGeometry(st.w, 0.06, st.l), [mat(col), mat(col), new THREE.MeshStandardMaterial({ map: face, color: "#ffffff", emissive: col, emissiveMap: face, emissiveIntensity: 0.35, roughness: 0.5 }), mat(col), mat(col), mat(col)]);
				top.position.y = th + 0.03; top.castShadow = top.receiveShadow = true; pg.add(top);
				var coil = null;
				if (st.pad !== "boost") { /* springs peeking out at the corners */
					coil = new THREE.Group(); var cm = mat("#c9ccd1", { metalness: 0.9, roughness: 0.25 });
					[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { var tor = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 14), cm); for (var ci = 0; ci < 3; ci++) { var tc = tor.clone(); tc.rotation.x = Math.PI / 2; tc.position.set(k[0] * (st.w / 2 + 0.05), 0.08 + ci * 0.12, k[1] * (st.l / 2 + 0.05)); coil.add(tc); } });
					pg.add(coil);
				}
				pads.push({ p: st, gy: gpd + th, top: top, coil: coil, kick: 0 });
			} else if (st.t === "loop") {
				var gl = pieceGround(st, 0), planks = C.loopPlanks(st.r, st.w, 44), geoP = new THREE.BoxGeometry(st.w, 0.4, 1), im = new THREE.InstancedMesh(geoP, mat("#e04b2a", { roughness: 0.6 }), planks.length);
				planks.forEach(function (pk, j) {
					/* local: x lateral (left of the travel direction), loop starts at z = 0 going +z; plank pushed 0.2 m outward so its top is the driving surface */
					var lq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pk.angle);
					var nrm = new THREE.Vector3(0, 1, 0).applyQuaternion(lq);
					var lp = new THREE.Vector3(pk.x, pk.y, pk.z).addScaledVector(nrm, -0.2);
					var wp = lp.applyQuaternion(tq).add(new THREE.Vector3(st.x, gl, st.z)), wq = tq.clone().multiply(lq);
					fixedBox(st.w / 2, 0.2, pk.len / 2, wp.x, wp.y, wp.z, { x: wq.x, y: wq.y, z: wq.z, w: wq.w }, 1.1);
					tmpM.compose(wp, wq, new THREE.Vector3(1, 1, pk.len)); im.setMatrixAt(j, tmpM);
				});
				im.castShadow = im.receiveShadow = true; pieceGroup.add(im);
			} else if (st.t === "pipe") {
				var gp0 = pieceGround(st, 0), pp = C.pipePlanks(st.r, 20), gp = new THREE.BoxGeometry(1, 0.4, st.l), ip = new THREE.InstancedMesh(gp, mat("#8fb3d9", { roughness: 0.5 }), pp.length);
				pp.forEach(function (pk, j) {
					var lq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pk.angle), nrm = new THREE.Vector3(0, 1, 0).applyQuaternion(lq);
					var wp = new THREE.Vector3(pk.x, pk.y, 0).addScaledVector(nrm, -0.2).applyQuaternion(tq).add(new THREE.Vector3(st.x, gp0, st.z)), wq = tq.clone().multiply(lq);
					fixedBox(pk.len / 2, 0.2, st.l / 2, wp.x, wp.y, wp.z, { x: wq.x, y: wq.y, z: wq.z, w: wq.w }, 1.0);
					tmpM.compose(wp, wq, new THREE.Vector3(pk.len, 1, 1)); ip.setMatrixAt(j, tmpM);
				});
				ip.castShadow = ip.receiveShadow = true; pieceGroup.add(ip);
			}
			statics.push(st);
		});
	}
	var padTexs = {};
	function padTex(kind) {
		if (padTexs[kind]) return padTexs[kind];
		return (padTexs[kind] = canvasTex(128, 128, function (g, w, h) {
			g.fillStyle = "#222"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineWidth = 10; g.lineJoin = "round";
			if (kind === "boost") { [0, 40].forEach(function (o) { g.beginPath(); g.moveTo(24, 96 - o); g.lineTo(64, 60 - o); g.lineTo(104, 96 - o); g.stroke(); }); }
			else { g.beginPath(); g.moveTo(64, 20); g.lineTo(100, 60); g.lineTo(76, 60); g.lineTo(76, 104); g.lineTo(52, 104); g.lineTo(52, 60); g.lineTo(28, 60); g.closePath(); g.fill(); if (kind === "press") { g.fillStyle = "#222"; g.font = "bold 30px sans-serif"; g.textAlign = "center"; g.fillText("L", 64, 92); } }
		}));
	}
	/* a car on a pad: springs throw it up, launch pads wait for L, boost strips push it forward */
	var padHintT = 0;
	function padTick(dt) {
		if (!pads.length) { launchKey = false; return; }
		var onPress = false, gs = gravity < 0 ? -1 : 1;
		pads.forEach(function (P) { if (P.kick > 0) { P.kick = Math.max(0, P.kick - dt * 3); if (P.coil) P.coil.scale.y = 1 + P.kick * 2.5; P.top.position.y = 0.25 + P.kick * 0.6; } });
		cars.forEach(function (c, ci) {
			if (!c.anyContact) return;
			var t = c.body.translation();
			for (var i = 0; i < pads.length; i++) {
				var P = pads[i], p = P.p; if (!C.pieceHit(p, t.x, t.z, 0.3) || Math.abs(t.y - P.gy) > c.d.wr + c.d.rest + c.d.h + 1.2) continue;
				var me = ci === player && !autoPilot, pressed = me && launchKey;
				if (p.pad === "press" && me) onPress = true;
				if (p.pad === "press" && c.ai) pressed = Math.random() < dt * 1.5; /* computer drivers press it now and then */
				c.padT = c.padT || {}; if (p.pad !== "boost" && simT - (c.padT[i] || -9) < C.PAD_COOLDOWN) continue;
				var nv = C.padLaunch(p, c.body.linvel(), pressed, gs); if (!nv) continue;
				c.body.setLinvel(nv, true); c.padT[i] = simT; c.lastV = null;
				if (p.pad !== "boost") { var av = c.body.angvel(); c.body.setAngvel({ x: av.x * 0.3, y: av.y, z: av.z * 0.3 }, true); P.kick = 1; if (me) { sfx("boing", 1); toast((p.pad === "spring" ? "Boing! " : "Launch! ") + "Up to about " + C.fmtDist(C.springHeight(p.v, Math.abs(gravity)), S.units)); } }
				else if (me && simT - padHintT > 1.5) { padHintT = simT; sfx("boost", 1); toast("Boost!"); }
				if (me) launchKey = false;
			}
		});
		var tb = $("cs-t-launch"); if (tb) tb.hidden = !onPress;
		if (onPress && simT - padHintT > 3) { padHintT = simT; toast("On a launch pad: press L" + (root.classList.contains("cs-has-touch") ? " or 🚀" : "") + " to fly"); }
		if (!onPress) launchKey = false;
	}
	function roadTexture() {
		if (roadTex) return roadTex;
		roadTex = canvasTex(128, 256, function (g, w, h) {
			var r = C.rng(4), id = g.createImageData(w, h);
			for (var q = 0; q < w * h; q++) { var v = 58 + r() * 22; id.data[q * 4] = v; id.data[q * 4 + 1] = v; id.data[q * 4 + 2] = v + 3; id.data[q * 4 + 3] = 255; }
			g.putImageData(id, 0, 0); g.fillStyle = "#f2f2f2"; g.fillRect(3, 0, 5, h); g.fillRect(w - 8, 0, 5, h); g.fillStyle = "#f5c518"; g.fillRect(w / 2 - 2, 0, 4, h * 0.45);
		});
		roadTex.wrapS = THREE.ClampToEdgeWrapping; roadTex.wrapT = THREE.RepeatWrapping;
		return roadTex;
	}
	/* a drawn road: a ribbon a few cm above the ground, following the terrain (no physics needed: the ground carries the car) */
	function buildRoads(list) {
		if (!list.length) return;
		roadMat = roadMat || new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3 });
		list.forEach(function (r) {
			var pth = roadPathOf(r), P = pth.pts, K = 4, pos = [], uv = [], idx = [], cols = K + 1, n = P.length + (r.closed ? 1 : 0);
			if (P.length < 2) return;
			for (var i = 0; i < n; i++) {
				var a = P[i % P.length], s = i < P.length ? a.s : pth.L, lx = Math.cos(a.dir), lz = -Math.sin(a.dir);
				for (var k = 0; k <= K; k++) { var f = k / K - 0.5, x = a.x + lx * r.w * f, z = a.z + lz * r.w * f; pos.push(x, groundUnder(x, z) + 0.06, z); uv.push(k / K, s / 8); }
				if (i < n - 1) for (k = 0; k < K; k++) { var b0 = i * cols + k; idx.push(b0, b0 + cols, b0 + 1, b0 + 1, b0 + cols, b0 + cols + 1); }
			}
			var geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
			var m = new THREE.Mesh(geo, roadMat); m.receiveShadow = true; pieceGroup.add(m);
		});
	}
	/* terrain or a flat piece top under a road vertex (roads may run over a platform) */
	function groundUnder(x, z) { return hAt(x, z); }
	var chkTex = null;
	function startLine(pth) {
		var p0 = C.pathPoint(pth, 0); chkTex = chkTex || canvasTex(64, 16, function (g) { for (var x = 0; x < 16; x++) for (var y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? "#111" : "#fff"; g.fillRect(x * 4, y * 4, 4, 4); } });
		var line = new THREE.Mesh(new THREE.PlaneGeometry(pth.w, 2), new THREE.MeshStandardMaterial({ map: chkTex, polygonOffset: true, polygonOffsetFactor: -5 }));
		line.rotation.order = "YXZ"; line.rotation.y = p0.dir + Math.PI / 2; line.rotation.x = -Math.PI / 2; line.position.set(p0.x, hAt(p0.x, p0.z) + 0.08, p0.z); pieceGroup.add(line);
		/* an arch over the line */
		var lx = Math.cos(p0.dir), lz = -Math.sin(p0.dir), half = pth.w / 2 + 0.6, poleM = mat("#e5e5e5", { metalness: 0.4 });
		[-1, 1].forEach(function (sd) { var pl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), poleM), x = p0.x + lx * half * sd, z = p0.z + lz * half * sd; pl.position.set(x, hAt(x, z) + 2.5, z); pl.castShadow = true; pieceGroup.add(pl); });
		var ban = new THREE.Mesh(new THREE.BoxGeometry(pth.w + 1.4, 0.9, 0.2), new THREE.MeshStandardMaterial({ map: chkTex })); ban.position.set(p0.x, hAt(p0.x, p0.z) + 5, p0.z); ban.rotation.y = p0.dir; pieceGroup.add(ban);
	}
	/* the runway on the test-track worlds: asphalt with edge lines, centre-line dashes, threshold bars and the numbers 09 / 27,
	   edge lights, a hangar and a windsock. The ground under it is flat (C.makeTerrain), so the physics needs nothing extra. */
	function buildRunway() {
		if (!W.track) return;
		var R = C.RUNWAY, PX = 2048, PY = Math.round(PX * R.w / R.len), mpp = R.len / PX;
		var tex = canvasTex(PX, PY, function (g, w, h) {
			var r = C.rng(17), id = g.createImageData(w, h);
			for (var q = 0; q < w * h; q++) { var v = 58 + r() * 18; id.data[q * 4] = v; id.data[q * 4 + 1] = v; id.data[q * 4 + 2] = v + 4; id.data[q * 4 + 3] = 255; }
			g.putImageData(id, 0, 0); g.fillStyle = "#eeeeea";
			var m = function (v) { return v / mpp; };
			g.fillRect(0, m(1), w, m(0.9)); g.fillRect(0, h - m(1.9), w, m(0.9)); /* edge lines */
			for (var x = m(70); x < w - m(70); x += m(50)) g.fillRect(x, h / 2 - m(0.45), m(30), m(0.9)); /* centre line */
			[m(6), w - m(6) - m(30)].forEach(function (x0) { for (var b = 0; b < 8; b++) { var y = m(2.4) + b * m(1.45); if (b >= 4) y += h - 2 * m(2.4) - 8 * m(1.45) + m(0.1); g.fillRect(x0, y, m(30), m(1.0)); } }); /* threshold bars */
			g.font = "bold " + Math.round(m(9)) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
			g.save(); g.translate(m(50), h / 2); g.rotate(Math.PI / 2); g.fillText("09", 0, 0); g.restore();
			g.save(); g.translate(w - m(50), h / 2); g.rotate(-Math.PI / 2); g.fillText("27", 0, 0); g.restore();
		});
		tex.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
		var geo = new THREE.PlaneGeometry(R.len, R.w); geo.rotateX(-Math.PI / 2);
		var rm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
		if (W.g > 20) rm.material.color.set("#d8ccb4");
		rm.position.set(R.x, 0.035, R.z); rm.receiveShadow = true; worldGroup.add(rm);
		/* edge lights every 30 m (they glow at night like the lamp posts) */
		var n = Math.floor(R.len / 30) + 1, lg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), n * 2), k = 0;
		for (var i = 0; i < n; i++) [-1, 1].forEach(function (sd) { tmpM.compose(new THREE.Vector3(R.x - R.len / 2 + i * 30, 0.2, R.z + sd * (R.w / 2 + 1)), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); lg.setMatrixAt(k++, tmpM); });
		worldGroup.add(lg);
		/* hangar north of the west end + windsock */
		var hx = R.x - R.len / 2 + 70, hz = R.z - R.w / 2 - 34, hg = new THREE.Group();
		var hb = new THREE.Mesh(new THREE.BoxGeometry(30, 7, 22), mat("#9aa5b1", { metalness: 0.4, roughness: 0.6 })); hb.position.y = 3.5; hb.castShadow = hb.receiveShadow = true; hg.add(hb);
		var roofG = new THREE.CylinderGeometry(11, 11, 30, 18, 1, false, -Math.PI / 2, Math.PI); roofG.rotateZ(Math.PI / 2); roofG.scale(1, 0.35, 1);
		var rf = new THREE.Mesh(roofG, mat("#7d8893", { metalness: 0.5, roughness: 0.5 })); rf.position.y = 7; rf.castShadow = true; hg.add(rf);
		var door = new THREE.Mesh(new THREE.PlaneGeometry(22, 6), mat("#3a4048")); door.position.set(0, 3, 11.01); hg.add(door);
		hg.position.set(hx, 0, hz); worldGroup.add(hg); fixedBox(15, 5, 11, hx, 5, hz, { x: 0, y: 0, z: 0, w: 1 });
		var sx = R.x - R.len / 2 + 40, sz = R.z + R.w / 2 + 12;
		var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 6), mat("#dddddd")); pole.position.set(sx, 3, sz); worldGroup.add(pole);
		var sock = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.12, 2.2, 10, 1, true), mat("#ff6b1a", { side: THREE.DoubleSide })); sock.rotation.z = -Math.PI / 2 + 0.25; sock.position.set(sx + 1.1, 5.7, sz); worldGroup.add(sock);
	}
	function buildBorder() {
		var s = ter.size / 2, h = 80;
		[[s, 0, 1, s], [-s, 0, 1, s], [0, s, s, 1], [0, -s, s, 1]].forEach(function (b) { fixedBox(b[2], h, b[3], b[0], h - 10, b[1], { x: 0, y: 0, z: 0, w: 1 }, 0.2); });
	}
	function buildDecor() {
		var r = C.rng(W.seed + 3), half = ter.size / 2 - 50;
		if (W.trees) {
			var N = 260, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), mat("#6b4a2b"), N), crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 6, 8), mat("#2f6b2f"), N), n = 0;
			for (var t = 0; t < 2000 && n < N; t++) {
				var x = (r() * 2 - 1) * half, z = (r() * 2 - 1) * half;
				if (C.trackDist(x, z) < 22 || Math.hypot(x, z - 70) < 55 || C.onRunway(x, z, 45) || (Math.abs(x) < C.TRACK.half + C.TRACK.r && Math.abs(z - C.TRACK.cz) < C.TRACK.r)) continue;
				var y = hAt(x, z), sc = 0.7 + r() * 0.8;
				tmpM.compose(new THREE.Vector3(x, y + 1.2 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)); trunk.setMatrixAt(n, tmpM);
				tmpM.compose(new THREE.Vector3(x, y + 5 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)); crown.setMatrixAt(n, tmpM);
				var b = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + 1.5, z)); phys.createCollider(RAPIER.ColliderDesc.cylinder(1.5, 0.35 * sc), b);
				n++;
			}
			trunk.count = crown.count = n; trunk.castShadow = crown.castShadow = true; worldGroup.add(trunk, crown);
			/* lamp posts along the track: their heads glow at night */
			lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe2a0, emissiveIntensity: 0 });
			var LN = Math.floor(C.trackLength() / 40), poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 6), mat("#8a9099", { metalness: 0.6 }), LN), lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.18, 0.4), lampMat, LN);
			for (var li = 0; li < LN; li++) { var lp = C.trackPoint(li * 40 + 10), ox = Math.cos(lp.dir), oz = -Math.sin(lp.dir), side = C.TRACK.width / 2 + 1.5, px = lp.x + ox * side, pz = lp.z + oz * side;
				tmpM.compose(new THREE.Vector3(px, 3.5, pz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); poles.setMatrixAt(li, tmpM);
				tmpM.compose(new THREE.Vector3(px - ox * 0.6, 7, pz - oz * 0.6), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lp.dir), new THREE.Vector3(1, 1, 1)); lamps.setMatrixAt(li, tmpM);
				var lb = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(px, 3.5, pz)); phys.createCollider(RAPIER.ColliderDesc.cylinder(3.5, 0.12), lb); ovalBodies.push(lb); }
			poles.castShadow = true; ovalGroup.add(poles, lamps);
			/* grandstand by the start straight */
			var p0 = C.trackPoint(0), gs = new THREE.Group();
			for (var row = 0; row < 6; row++) { var bx = new THREE.Mesh(new THREE.BoxGeometry(60, 0.9, 1.6), mat(row % 2 ? "#9aa3ad" : "#b8c0c8")); bx.position.set(0, row * 0.9 + 0.45, row * 1.5); bx.castShadow = bx.receiveShadow = true; gs.add(bx); }
			var roof = new THREE.Mesh(new THREE.BoxGeometry(62, 0.3, 11), mat("#c0392b")); roof.position.set(0, 9, 4); roof.castShadow = true; gs.add(roof);
			gs.position.set(p0.x + 30, 0, p0.z + 14); ovalGroup.add(gs);
			ovalBodies.push(fixedBox(30, 3, 5, p0.x + 30, 3, p0.z + 18, { x: 0, y: 0, z: 0, w: 1 }));
		}
		if (W.rocks) {
			var NR = W.rocks, rk = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(W.ground[2], { roughness: 1, flatShading: true }), NR);
			for (var k = 0; k < NR; k++) {
				var rx = (r() * 2 - 1) * half, rz = (r() * 2 - 1) * half; if (Math.hypot(rx, rz) < 30) { k--; continue; }
				var s = 0.6 + Math.pow(r(), 2) * 3, ry = hAt(rx, rz);
				tmpM.compose(new THREE.Vector3(rx, ry + s * 0.3, rz), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(s, s * 0.7, s * 1.1)); rk.setMatrixAt(k, tmpM);
				var rb = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(rx, ry + s * 0.3, rz)); phys.createCollider(RAPIER.ColliderDesc.ball(s * 0.75), rb);
			}
			rk.castShadow = rk.receiveShadow = true; worldGroup.add(rk);
		}
		if (W.stars) { /* a flag at the start */
			var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), mat("#dddddd", { metalness: 0.6 })); pole.position.set(6, 1.2, 4); worldGroup.add(pole);
			var fl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), mat("#ffffff", { side: THREE.DoubleSide, map: canvasTex(64, 40, function (g) { g.fillStyle = "#1a5fb4"; g.fillRect(0, 0, 64, 40); g.fillStyle = "#fff"; g.font = "bold 18px sans-serif"; g.fillText("MES", 12, 27); }) })); fl.position.set(6.56, 2.0, 4); worldGroup.add(fl);
		}
	}

	/* ===================== cars ===================== */
	function shapeBox(geo, f) { var p = geo.attributes.position, v = new THREE.Vector3(); for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); f(v); p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); return geo; }
	/* a closed car body: its side profile (with wheel arches cut into the bottom edge) extruded across the width, bevelled, plus glass */
	function profileBody(d, P, paint, glass, g) {
		var H = d.h + (d.cab ? d.cab[0] : 0), y0 = -d.h / 2, L = d.l, W2 = d.w - 0.1;
		var pts = P.body.map(function (p) { return [p[0] * L, y0 + p[1] * H]; }), yb = pts[0][1];
		/* bottom edge from the front back to the rear, with an arch over each axle */
		var ar = d.wr + 0.07, yw = d.ry - d.rest * 0.8, out = pts.slice();
		[d.wf, d.wb].forEach(function (z) {
			if (yw + ar <= yb + 0.02) return; var dy = yb - yw, hc = dy > -ar ? Math.sqrt(Math.max(0, ar * ar - dy * dy)) : 0; if (!hc) return;
			var a1 = Math.atan2(dy, hc), a2 = Math.PI - a1;
			out.push([z + hc, yb]); for (var k = 1; k < 12; k++) { var a = a1 + (a2 - a1) * k / 12; out.push([z + Math.cos(a) * ar, yw + Math.sin(a) * ar]); } out.push([z - hc, yb]);
		});
		/* more points along long straight edges, so dents have something to bend */
		var dense = [];
		for (var i = 0; i < out.length; i++) { var p0 = out[i], p1 = out[(i + 1) % out.length], n = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.28)); for (var j = 0; j < n; j++) dense.push(new THREE.Vector2(p0[0] + (p1[0] - p0[0]) * j / n, p0[1] + (p1[1] - p0[1]) * j / n)); }
		var geo = new THREE.ExtrudeGeometry(new THREE.Shape(dense), { depth: W2, steps: 6, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 });
		geo.translate(0, 0, -W2 / 2); geo.rotateY(-Math.PI / 2); geo.computeVertexNormals();
		var body = new THREE.Mesh(geo, paint);
		if (P.win) {
			var wg = new THREE.ExtrudeGeometry(new THREE.Shape(P.win.map(function (p) { return new THREE.Vector2(p[0] * L, y0 + p[1] * H); })), { depth: d.w + 0.02, bevelEnabled: false });
			wg.translate(0, 0, -(d.w + 0.02) / 2); wg.rotateY(-Math.PI / 2); body.add(new THREE.Mesh(wg, glass));
		}
		[P.ws, P.rs].forEach(function (e) {
			if (!e) return; var z1 = e[0][0] * L, y1 = y0 + e[0][1] * H, z2 = e[1][0] * L, y2 = y0 + e[1][1] * H, nz = y2 - y1, ny = -(z2 - z1), nl = Math.hypot(nz, ny) || 1, s = z1 > 0 ? 1 : -1;
			var ox = nz / nl * 0.03 * s, oy = ny / nl * 0.03 * s, x = d.w / 2 - 0.14;
			var v = new Float32Array([-x, y1 + oy, z1 + ox, x, y1 + oy, z1 + ox, x, y2 + oy, z2 + ox, -x, y1 + oy, z1 + ox, x, y2 + oy, z2 + ox, -x, y2 + oy, z2 + ox]);
			var qg = new THREE.BufferGeometry(); qg.setAttribute("position", new THREE.BufferAttribute(v, 3)); qg.computeVertexNormals(); body.add(new THREE.Mesh(qg, glass));
		});
		void g; return body;
	}
	function makeCarMesh(d, color) {
		if (d.fly) return makePlaneMesh(d, color);
		var g = new THREE.Group(), paint = new THREE.MeshStandardMaterial({ color: color, metalness: 0.35, roughness: 0.42 }), dents = [];
		var hw = d.w / 2, hh = d.h / 2, hl = d.l / 2;
		var glass = new THREE.MeshStandardMaterial({ color: 0x18222e, metalness: 0.7, roughness: 0.08, side: THREE.DoubleSide });
		var P = C.PROFILES[C.STYLE[d.key]];
		var body;
		if (P) { body = profileBody(d, P, paint, glass, g); }
		else body = new THREE.Mesh(shapeBox(new THREE.BoxGeometry(d.w, d.h, d.l, 6, 3, 12), function (v) { if (Math.abs(v.x) > hw * 0.99 && v.y > 0) v.x *= 0.95; if (Math.abs(v.z) > hl * 0.99) v.x *= 0.96; }), paint);
		body.castShadow = true; body.receiveShadow = true; g.add(body); dents.push(body);
		if (d.bed) { [-1, 1].forEach(function (s) { var rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, d.l * 0.42), paint); rail.position.set(s * (hw - 0.04), hh + 0.17, -d.l * 0.27); g.add(rail); }); }
		if (d.cage || d.rover || d.kart) {
			var tube = mat(d.rover ? "#d9d9d9" : "#333333", { metalness: 0.7, roughness: 0.35 });
			if (d.cage) [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (c) { var t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), tube); t.position.set(c[0] * hw * 0.7, hh + 0.55, c[1] * 0.45); g.add(t); });
			if (d.cage) { var top = new THREE.Mesh(new THREE.BoxGeometry(d.w * 0.75, 0.06, 1.0), tube); top.position.set(0, hh + 1.1, 0); g.add(top); }
			if (d.rover) {
				var dish = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, 1.0), mat("#e8e8e8", { side: THREE.DoubleSide, metalness: 0.4 })); dish.position.set(-0.5, hh + 1.3, 0.9); dish.rotation.x = -0.7; g.add(dish);
				var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), tube); mast.position.set(-0.5, hh + 0.7, 0.9); g.add(mast);
				var foil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), mat("#d4a017", { metalness: 0.9, roughness: 0.3 })); foil.position.set(0.4, hh + 0.12, -1.1); g.add(foil);
				[-0.45, 0.45].forEach(function (x) { var seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.12), mat("#555")); seat.position.set(x, hh + 0.35, -0.25); g.add(seat); });
			}
		}
		/* driver (helmet) for open cars */
		if (!d.cab && !d.windows) { var helm = new THREE.Mesh(new THREE.SphereGeometry(d.kart ? 0.17 : 0.2, 16, 12), mat(d.rover ? "#f5f5f5" : "#1f4fbf", { metalness: 0.3, roughness: 0.3 })); helm.position.set(d.rover ? 0.45 : 0, hh + (d.kart ? 0.55 : 0.75), d.kart ? -0.2 : -0.25); g.add(helm); var tor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), mat(d.rover ? "#eeeeee" : "#222")); tor.position.set(helm.position.x, hh + (d.kart ? 0.25 : 0.4), helm.position.z); g.add(tor); }
		/* lights */
		var lightF = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 1.2 }), lightR = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.6 });
		[-1, 1].forEach(function (s) {
			var hf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), lightF); hf.position.set(s * hw * 0.7, d.windows ? -hh * 0.6 : hh * 0.2, hl + 0.01); g.add(hf);
			var tr = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), lightR); tr.position.set(s * hw * 0.7, d.windows ? -hh * 0.6 : hh * 0.3, -hl - 0.01); g.add(tr);
		});
		/* wheels */
		var tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }), rim = mat(d.rover ? "#b9a46a" : "#c8ccd2", { metalness: 0.8, roughness: 0.3 });
		var wheels = [];
		[[d.wx, d.wf], [-d.wx, d.wf], [d.wx, d.wb], [-d.wx, d.wb]].forEach(function (p) {
			var piv = new THREE.Group(), spin = new THREE.Group();
			var tg = new THREE.CylinderGeometry(d.wr, d.wr, d.ww, 20, 1); tg.rotateZ(Math.PI / 2);
			var t = new THREE.Mesh(tg, tyre); t.castShadow = true; spin.add(t);
			var rg = new THREE.CylinderGeometry(d.wr * 0.62, d.wr * 0.62, d.ww + 0.02, 10, 1); rg.rotateZ(Math.PI / 2); spin.add(new THREE.Mesh(rg, rim));
			if (d.rover) { var mesh = new THREE.Mesh(new THREE.TorusGeometry(d.wr * 0.98, 0.03, 4, 20), mat("#999", { metalness: 0.8 })); mesh.rotation.y = Math.PI / 2; spin.add(mesh); }
			piv.add(spin); piv.position.set(p[0], d.ry - d.rest, p[1]); g.add(piv); wheels.push({ piv: piv, spin: spin });
		});
		/* boost flame */
		var flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 10), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 }));
		flame.rotation.x = -Math.PI / 2; flame.position.set(0, -hh * 0.3, -hl - 0.45); flame.visible = false; g.add(flame);
		dents.forEach(function (m) { m.userData.orig = m.geometry.attributes.position.array.slice(); });
		return { group: g, wheels: wheels, dents: dents, flame: flame, paint: paint, lightF: lightF, lightR: lightR };
	}

	/* ---------- aircraft mesh (low-poly, body axes: +Z nose, +Y up, +X left wing) ----------
	   returns the same parts as a car (wheels with piv / spin, dents, flame, lights) plus surf = moving control surfaces + propeller */
	function makePlaneMesh(d, color) {
		var A = d.fly, jet = !!A.jet, g = new THREE.Group(), dents = [];
		var paint = new THREE.MeshStandardMaterial({ color: color, metalness: 0.3, roughness: 0.45 });
		var trim = mat(jet ? "#e8eef5" : "#b3261e", { metalness: 0.3, roughness: 0.45 }), dark = mat("#22262c", { roughness: 0.6, metalness: 0.4 });
		var glass = new THREE.MeshStandardMaterial({ color: 0x2a3d52, metalness: 0.5, roughness: 0.08, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
		function add(m, x, y, z) { m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; g.add(m); return m; }
		function cyl(a, b, r, mt) { var v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = v.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 6), mt); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.castShadow = true; g.add(m); return m; }
		/* a flat outline (u = across / along, v) extruded to a thin plate; axis "x" = plate lies in the y-z plane (fin), "y" = in the x-z plane (wings) */
		function plate(pts, th, axis, mt) {
			var geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); })), { depth: th, bevelEnabled: false });
			geo.translate(0, 0, -th / 2); if (axis === "x") geo.rotateY(-Math.PI / 2); else geo.rotateX(Math.PI / 2);
			geo.computeVertexNormals(); var m = new THREE.Mesh(geo, mt); m.castShadow = true; g.add(m); return m;
		}
		function hinge(x, y, z, w, h, l, mt) { var piv = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mt); m.position.z = -l / 2; m.castShadow = true; piv.add(m); piv.position.set(x, y, z); g.add(piv); return piv; }
		/* fuselage: a lathe outline turned to lie along Z, a bit taller than wide, the tail cone swept up */
		var prof = jet ? [[0, -6.25], [0.42, -6.2], [0.6, -5], [0.72, -2], [0.75, 0], [0.7, 2], [0.56, 3.5], [0.34, 4.6], [0.1, 5.25], [0, 5.35]]
			: [[0, -4.62], [0.08, -4.6], [0.24, -4.0], [0.4, -2.9], [0.53, -1.6], [0.6, -0.6], [0.6, 0.6], [0.57, 1.6], [0.5, 2.45], [0.36, 2.95], [0, 3.0]];
		var fg = new THREE.LatheGeometry(prof.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 16); fg.rotateX(Math.PI / 2);
		var fp = fg.attributes.position; for (var i = 0; i < fp.count; i++) { var y = fp.getY(i) * (jet ? 1.1 : 1.18), z = fp.getZ(i); if (!jet && z < -1.4) y += (-1.4 - z) * 0.11; fp.setY(i, y + 0.05); }
		fg.computeVertexNormals(); var fus = add(new THREE.Mesh(fg, paint)); dents.push(fus);
		var surf = {};
		if (!jet) {
			/* cabin windows + windscreen, high wing on struts, cowling with spinner and a two-blade propeller */
			[-1, 1].forEach(function (sx) { add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 1.45), glass), sx * 0.5, 0.42, 0.2); });
			var ws = new THREE.BufferGeometry(); ws.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.44, 0.42, 1.05, 0.44, 0.42, 1.05, 0.3, 0.77, 0.6, -0.44, 0.42, 1.05, 0.3, 0.77, 0.6, -0.3, 0.77, 0.6]), 3)); ws.computeVertexNormals(); add(new THREE.Mesh(ws, glass));
			var wing = add(new THREE.Mesh(shapeBox(new THREE.BoxGeometry(A.b, 0.14, A.c - 0.3, 10, 1, 2), function (v) { var k = Math.abs(v.x) / (A.b / 2); if (k > 0.55) { v.z *= 1 - (k - 0.55) * 0.5; v.y *= 1 - (k - 0.55) * 0.5; } }), paint), 0, A.wingY, A.wingZ + 0.15);
			wing.receiveShadow = true;
			add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, A.c * 0.55), trim), A.b / 2 - 0.05, A.wingY, A.wingZ + 0.25); add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, A.c * 0.55), trim), -A.b / 2 + 0.05, A.wingY, A.wingZ + 0.25);
			var te = A.wingZ + 0.15 - (A.c - 0.3) / 2;
			surf.ailL = hinge(A.b * 0.34, A.wingY, te, A.b * 0.28, 0.07, 0.34, paint); surf.ailR = hinge(-A.b * 0.34, A.wingY, te, A.b * 0.28, 0.07, 0.34, paint);
			surf.flapL = hinge(1.55, A.wingY - 0.02, te, 2.0, 0.07, 0.34, paint); surf.flapR = hinge(-1.55, A.wingY - 0.02, te, 2.0, 0.07, 0.34, paint);
			[-1, 1].forEach(function (sx) { cyl([sx * 0.52, -0.25, -0.05], [sx * 2.5, A.wingY - 0.06, -0.15], 0.035, dark); });
			add(new THREE.Mesh(new THREE.BoxGeometry(A.tail[0] * 2, 0.07, 0.72), paint), 0, A.tail[1], A.tail[2] + 0.1);
			surf.elev = hinge(0, A.tail[1], A.tail[2] - 0.26, A.tail[0] * 2 - 0.2, 0.05, 0.36, trim);
			plate([[-3.45, 0.42], [-4.42, 1.72], [-4.72, 1.72], [-4.68, 0.35]], 0.08, "x", paint);
			surf.rud = hinge(0, 1.05, -4.7, 0.06, 1.3, 0.32, trim);
			add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 2.6), trim), 0, 0.02, 0.3).scale.set(1, 1, 1); /* stripe */
			var sp = new THREE.ConeGeometry(0.17, 0.38, 12); sp.rotateX(Math.PI / 2); add(new THREE.Mesh(sp, trim), 0, 0.05, 3.18);
			var prop = new THREE.Group(); prop.position.set(0, 0.05, 3.08); g.add(prop);
			surf.blades = [0, Math.PI].map(function (a) { var bl = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.92, 0.03), dark); bl.position.set(0, Math.cos(a) * 0.48, 0); bl.rotation.y = 0.25; prop.add(bl); return bl; });
			var disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); disc.position.z = 0.01; prop.add(disc);
			surf.prop = prop; surf.disc = disc;
			add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.06), dark), 0, 0.06, 1.0); /* instrument panel, seen from the cockpit */
			add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.5), mat("#4a3b30")), 0.28, -0.02, 0.1); add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.5), mat("#4a3b30")), -0.28, -0.02, 0.1); /* seats */
		} else {
			/* bubble canopy, swept wings and tail, side intakes, nozzle with an afterburner flame */
			var cg = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); var can = add(new THREE.Mesh(cg, glass), 0, 0.55, 2.2); can.scale.set(0.46, 0.42, 1.35);
			var wl = plate([[0.6, 1.0], [4.7, -1.5], [4.7, -2.55], [0.6, -2.6]], 0.14, "y", paint), wr = plate([[-0.6, 1.0], [-4.7, -1.5], [-4.7, -2.55], [-0.6, -2.6]], 0.14, "y", paint);
			wl.position.y = wr.position.y = A.wingY; wl.receiveShadow = wr.receiveShadow = true;
			surf.ailL = hinge(3.5, A.wingY, -2.45, 2.2, 0.07, 0.4, trim); surf.ailR = hinge(-3.5, A.wingY, -2.45, 2.2, 0.07, 0.4, trim);
			surf.flapL = hinge(1.6, A.wingY - 0.02, -2.5, 1.7, 0.07, 0.4, paint); surf.flapR = hinge(-1.6, A.wingY - 0.02, -2.5, 1.7, 0.07, 0.4, paint);
			var hl = plate([[0.4, -4.6], [2.3, -5.5], [2.3, -5.95], [0.4, -6.0]], 0.08, "y", paint), hr = plate([[-0.4, -4.6], [-2.3, -5.5], [-2.3, -5.95], [-0.4, -6.0]], 0.08, "y", paint);
			hl.position.y = hr.position.y = A.tail[1];
			surf.elev = hinge(0, A.tail[1], -5.95, 4.2, 0.05, 0.35, trim);
			plate([[-3.9, 0.55], [-5.5, 2.4], [-6.15, 2.4], [-6.2, 0.55]], 0.1, "x", paint);
			surf.rud = hinge(0, 1.5, -6.15, 0.07, 1.6, 0.35, trim);
			[-1, 1].forEach(function (sx) { add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 2.2), paint), sx * 0.72, -0.05, -0.6); add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.05), dark), sx * 0.72, -0.05, 0.52); });
			var nz = new THREE.CylinderGeometry(0.38, 0.45, 0.7, 14, 1, true); nz.rotateX(Math.PI / 2); add(new THREE.Mesh(nz, dark), 0, 0.05, -6.4);
			[-1, 1].forEach(function (sx) { add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 2.8), trim), sx * 0.74, 0.25, 1.0); });
			add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.08), dark), 0, 0.5, 2.95);
		}
		/* landing gear: legs + the four wheels (two close together at the nose) */
		var tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }), rim = mat("#c8ccd2", { metalness: 0.8, roughness: 0.3 }), wheels = [], wy = d.ry - d.rest;
		[[d.wxf, d.wf], [-d.wxf, d.wf], [d.wx, d.wb], [-d.wx, d.wb]].forEach(function (p) {
			var piv = new THREE.Group(), spin = new THREE.Group(), tg = new THREE.CylinderGeometry(d.wr, d.wr, d.ww, 16, 1); tg.rotateZ(Math.PI / 2);
			var t = new THREE.Mesh(tg, tyre); t.castShadow = true; spin.add(t);
			var rg = new THREE.CylinderGeometry(d.wr * 0.55, d.wr * 0.55, d.ww + 0.02, 10, 1); rg.rotateZ(Math.PI / 2); spin.add(new THREE.Mesh(rg, rim));
			piv.add(spin); piv.position.set(p[0], wy, p[1]); g.add(piv); wheels.push({ piv: piv, spin: spin });
		});
		cyl([0, d.ry + 0.1, d.wf], [0, wy, d.wf], 0.05, dark);
		[-1, 1].forEach(function (sx) { cyl([sx * 0.35, d.ry + 0.1, d.wb], [sx * d.wx, wy, d.wb], 0.05, dark); });
		/* lights: red nav light on the left wing tip, green on the right, landing light (lightF), red beacon on the fin (lightR) */
		var lightF = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 1.2 }), lightR = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.6 });
		var tipX = jet ? 4.7 : A.b / 2, tipZ = jet ? 2.1 : A.wingZ + 0.4;
		add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat("#ff3030", { emissive: 0xff2020, emissiveIntensity: 1.5 })), tipX, A.wingY, tipZ);
		add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat("#30ff60", { emissive: 0x20ff50, emissiveIntensity: 1.5 })), -tipX, A.wingY, tipZ);
		add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.05), lightF), jet ? 0 : 1.6, jet ? -0.45 : A.wingY - 0.02, jet ? 3.6 : A.wingZ + (A.c - 0.3) / 2 + 0.16);
		add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lightR), 0, jet ? 2.45 : 1.78, jet ? -5.9 : -4.6);
		var flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, jet ? 2.2 : 0.1, 12), new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.85 }));
		flame.rotation.x = -Math.PI / 2; flame.position.set(0, 0.05, jet ? -7.8 : -5); flame.visible = false; g.add(flame);
		dents.forEach(function (m) { m.userData.orig = m.geometry.attributes.position.array.slice(); });
		return { group: g, wheels: wheels, dents: dents, flame: flame, paint: paint, lightF: lightF, lightR: lightR, surf: surf };
	}

	function makeCar(type, color, pose, isPlayer) {
		var d = C.CARS[type]; color = color || (isPlayer ? d.color : C.PAINT[(cars.length * 3 + 1) % C.PAINT.length]);
		var y0 = hAt(pose.x, pose.z) + d.wr + d.rest - d.ry + 0.4;
		var A = d.fly, I = A ? A.I : [d.mass * (d.h * d.h + d.l * d.l) / 12 * 1.4, d.mass * (d.w * d.w + d.l * d.l) / 12 * 1.4, d.mass * (d.w * d.w + d.h * d.h) / 12 * 1.4];
		var q = qYaw(pose.yaw);
		if (pose.y != null) y0 = pose.y;
		/* planes: centre of mass on the body origin, almost no built-in damping (the air does it, and on the Moon nothing does) */
		var body = phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pose.x, y0, pose.z).setRotation(q)
			.setAdditionalMassProperties(d.mass, { x: 0, y: A ? 0 : -d.h * 0.45, z: 0 }, { x: I[0], y: I[1], z: I[2] }, { x: 0, y: 0, z: 0, w: 1 }).setCcdEnabled(true).setAngularDamping(A ? 0.05 : 0.4).setLinearDamping(A ? 0 : 0.02));
		if (pose.v) body.setLinvel({ x: Math.sin(pose.yaw) * pose.v, y: 0, z: Math.cos(pose.yaw) * pose.v }, true);
		if (A) { /* fuselage, wing, tailplane */
			A.cols.forEach(function (b) { phys.createCollider(RAPIER.ColliderDesc.cuboid(b[0], b[1], b[2]).setTranslation(0, b[3], b[4]).setDensity(0).setFriction(0.4).setRestitution(0.1), body); });
			phys.createCollider(RAPIER.ColliderDesc.cuboid(A.b / 2, 0.07, A.c / 2).setTranslation(0, A.wingY, A.wingZ).setDensity(0).setFriction(0.4).setRestitution(0.1), body);
			phys.createCollider(RAPIER.ColliderDesc.cuboid(A.tail[0], 0.05, 0.4).setTranslation(0, A.tail[1], A.tail[2]).setDensity(0).setFriction(0.4), body);
		} else phys.createCollider(RAPIER.ColliderDesc.cuboid(d.w / 2, d.h / 2, d.l / 2).setDensity(0).setFriction(0.45).setRestitution(0.15), body);
		if (d.cab) phys.createCollider(RAPIER.ColliderDesc.cuboid(d.w * 0.4, d.cab[0] / 2, d.l * d.cab[1] / 2).setTranslation(0, d.h / 2 + d.cab[0] / 2, d.l * d.cab[2]).setDensity(0).setFriction(0.4), body);
		var veh = phys.createVehicleController(body), k = d.k;
		veh.indexUpAxis = 1; veh.setIndexForwardAxis = 2; /* Rapier's default forward axis is X; our cars face +Z */
		var wxf = d.wxf != null ? d.wxf : d.wx;
		[[wxf, d.wf], [-wxf, d.wf], [d.wx, d.wb], [-d.wx, d.wb]].forEach(function (p, i) {
			veh.addWheel({ x: p[0], y: d.ry, z: p[1] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, d.rest, d.wr);
			veh.setWheelSuspensionStiffness(i, k); veh.setWheelSuspensionCompression(i, 0.69 * Math.sqrt(k)); veh.setWheelSuspensionRelaxation(i, 1.0 * Math.sqrt(k));
			veh.setWheelMaxSuspensionTravel(i, d.rest * 1.2); veh.setWheelFrictionSlip(i, gripOf(d)); veh.setWheelSideFrictionStiffness(i, 1.0);
		});
		d.key = type; var vis = makeCarMesh(d, color); scene.add(vis.group);
		var car = { type: type, d: d, body: body, veh: veh, group: vis.group, wheels: vis.wheels, dents: vis.dents, flame: vis.flame, paint: vis.paint, lightF: vis.lightF, lightR: vis.lightR, color: color, surf: vis.surf || null,
			fly: A ? { thr: pose.thr || 0, flap: pose.y != null ? 0 : 1, elev: 0, ail: 0, rud: 0, brk: 0, o: null, air: pose.y != null, airT: 0, t0: simT, x0: pose.x, z0: pose.z, lastVy: 0, maxAgl: 0, dead: false } : null,
			ai: !isPlayer, lane: (cars.length % 3) - 1, steer: 0, in: { th: 0, br: 0, st: 0, hb: 0, boost: 0 }, damage: 0, lastV: null, gS: 1, gPeak: 0, air: null, upsideT: 0, stuckT: 0, revT: 0, smokeT: 0, id: cars.length, born: simT };
		setSuspForce(car);
		return car;
	}
	function gripOf(d) { return d.grip > 1.6 ? d.grip / 2.3 : d.grip; } /* the table holds old-style numbers for some cars; real tyres are mu ~ 1 */
	/* springs follow gravity: above Earth's g they stiffen in proportion (same ride height and damping ratio), so a car on the Sun
	   (28 g) does not sit on its belly with the springs crushed */
	function setSuspForce(car) {
		var gk = Math.max(1, Math.abs(gravity) / 9.81), k = car.d.k * gk;
		for (var i = 0; i < 4; i++) {
			car.veh.setWheelMaxSuspensionForce(i, car.d.mass * Math.max(9.81, Math.abs(gravity)) * 2.5 + 10);
			car.veh.setWheelSuspensionStiffness(i, k); car.veh.setWheelSuspensionCompression(i, 0.69 * Math.sqrt(k)); car.veh.setWheelSuspensionRelaxation(i, 1.0 * Math.sqrt(k));
		}
	}
	function removeCar(c) { phys.removeVehicleController(c.veh); phys.removeRigidBody(c.body); scene.remove(c.group); c.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }

	function setTraffic(n) {
		n = Math.max(0, Math.min(12, n | 0));
		var ai = cars.filter(function (c, i) { return i !== player; });
		while (ai.length > n) { var c = ai.pop(); removeCar(c); cars.splice(cars.indexOf(c), 1); }
		player = cars.findIndex(function (c) { return !c.ai; }); if (player < 0) player = 0;
		var types = W.stars ? ["rover", "buggy", "kart", "monster"] : ["sports", "suv", "truck", "buggy", "kart", "monster", "bus"];
		for (var i = ai.length; i < n; i++) {
			var p = startPose(cars.length); var car = makeCar(types[(i * 5 + 2) % types.length], null, p, false); cars.push(car);
		}
		cars.forEach(function (c, i) { c.id = i; });
	}

	function resetCar(c, here) {
		var t = c.body.translation(), r = c.body.rotation();
		var yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
		var p = here ? { x: t.x, z: t.z, yaw: yaw } : c.d.fly && !c.ai ? planeStart() : startPose(c.id);
		c.body.setTranslation({ x: p.x, y: Math.max(hAt(p.x, p.z), here ? t.y - 1 : -1e9) + c.d.wr + c.d.rest - c.d.ry + (here ? 1.2 : 0.4), z: p.z }, true);
		c.body.setRotation(qYaw(p.yaw), true); c.body.setLinvel({ x: 0, y: 0, z: 0 }, true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		c.lastV = null; c.upsideT = 0; c.air = null; c.born = simT;
		if (c.fly) { c.fly.air = false; c.fly.thr = 0; c.fly.elev = c.fly.ail = c.fly.rud = 0; if (!here) c.fly.flap = 1; c.body.resetTorques(true); }
		if (c === cars[player]) lapReset();
	}
	function repair(c) {
		c.damage = 0;
		c.dents.forEach(function (m) { var a = m.geometry.attributes.position; a.array.set(m.userData.orig); a.needsUpdate = true; m.geometry.computeVertexNormals(); });
		c.paint.color.set(c.color);
	}

	/* dent the body: impact point p (car-local), push direction dir (car-local, unit), size s (m) */
	function dent(c, p, dir, s) {
		var rad = Math.max(0.5, Math.min(1.6, 0.35 + s * 0.12)), push = Math.min(0.45, s * 0.035);
		c.dents.forEach(function (m) {
			var a = m.geometry.attributes.position, arr = a.array, o = m.userData.orig, op = m.position, any = false;
			for (var i = 0; i < arr.length; i += 3) {
				var x = arr[i] + op.x, y = arr[i + 1] + op.y, z = arr[i + 2] + op.z, dd = Math.hypot(x - p.x, y - p.y, z - p.z);
				if (dd > rad) continue;
				var f = Math.pow(1 - dd / rad, 1.5) * push;
				var nx = arr[i] + dir.x * f, ny = arr[i + 1] + dir.y * f, nz = arr[i + 2] + dir.z * f;
				/* never more than 45% of the way to the middle */
				if (Math.abs(nx - o[i]) < Math.abs(o[i]) * 0.45 + 0.05 && Math.abs(nz - o[i + 2]) < Math.abs(o[i + 2]) * 0.45 + 0.05 && Math.abs(ny - o[i + 1]) < Math.abs(o[i + 1]) * 0.5 + 0.05) { arr[i] = nx; arr[i + 1] = ny; arr[i + 2] = nz; any = true; }
			}
			if (any) { a.needsUpdate = true; m.geometry.computeVertexNormals(); }
		});
	}

	/* ===================== loose objects ===================== */
	var brickDef = { name: "Brick", shape: "box", size: [1, 0.5, 0.5], mass: 8, color: "#a2412b" };
	var objGeoCache = {};
	function objMesh(def) {
		var s = def.size, geo;
		if (def.shape === "box") geo = new THREE.BoxGeometry(s[0], s[1], s[2]);
		else if (def.shape === "cyl") geo = new THREE.CylinderGeometry(s[0], s[0], s[1], 18);
		else if (def.shape === "ball") geo = new THREE.SphereGeometry(s[0], 24, 16);
		else if (def.shape === "cone") geo = new THREE.ConeGeometry(s[0], s[1], 16);
		else if (def.shape === "tyre") { geo = new THREE.TorusGeometry(s[0] * 0.72, s[0] * 0.3, 10, 24); }
		else if (def.shape === "rock") geo = new THREE.DodecahedronGeometry(s[0], 1);
		else if (def.shape === "pin") geo = new THREE.LatheGeometry(pinProfile(s[0], s[1]).map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 16);
		var m;
		if (def === C.OBJECTS.ball) m = new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, function (g) { ["#e63946", "#f1faee", "#ffbe0b", "#3a86ff", "#f1faee", "#06d6a0"].forEach(function (c, i) { g.fillStyle = c; g.fillRect(i * 128 / 6, 0, 128 / 6 + 1, 64); }); }), roughness: 0.5 });
		else if (def === C.OBJECTS.melon) m = new THREE.MeshStandardMaterial({ map: canvasTex(64, 32, function (g) { g.fillStyle = "#2f8f3a"; g.fillRect(0, 0, 64, 32); g.fillStyle = "#16511f"; for (var i = 0; i < 8; i++) g.fillRect(i * 8, 0, 3, 32); }), roughness: 0.6 });
		else if (def === C.OBJECTS.crate || def === C.OBJECTS.bigcrate) m = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, function (g) { g.fillStyle = def.color; g.fillRect(0, 0, 64, 64); g.strokeStyle = "#6b4520"; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58); g.beginPath(); g.moveTo(4, 4); g.lineTo(60, 60); g.stroke(); }), roughness: 0.85 });
		else if (def === C.OBJECTS.cone) m = new THREE.MeshStandardMaterial({ map: canvasTex(16, 64, function (g) { g.fillStyle = "#ff6b00"; g.fillRect(0, 0, 16, 64); g.fillStyle = "#fff"; g.fillRect(0, 18, 16, 8); g.fillRect(0, 38, 16, 8); }), roughness: 0.6 });
		else if (def === C.OBJECTS.barrel) m = new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.5, roughness: 0.4 });
		else if (def.glass) m = new THREE.MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.35, metalness: 0.2, roughness: 0.05 });
		else if (def.shape === "rock") m = new THREE.MeshStandardMaterial({ color: def.color, roughness: 1, flatShading: true });
		else m = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 });
		var mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = !def.glass;
		if (def === C.OBJECTS.pin) { var band = new THREE.Mesh(new THREE.CylinderGeometry(s[0] * 0.56, s[0] * 0.56, 0.1, 16), mat("#d62828")); band.position.y = s[1] * 0.66; mesh.add(band); }
		return mesh;
	}
	function pinProfile(r, h) { return [[0, 0], [r * 0.55, 0], [r * 0.85, h * 0.18], [r, h * 0.36], [r * 0.8, h * 0.55], [r * 0.45, h * 0.68], [r * 0.5, h * 0.82], [r * 0.45, h * 0.94], [0, h]]; }
	function spawnObj(kind, x, y, z, yaw) {
		var def = kind === "brick" ? brickDef : C.OBJECTS[kind]; if (!def) return null;
		if (objs.length >= 360) { var old = objs.shift(); phys.removeRigidBody(old.body); scene.remove(old.mesh); }
		var body = phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(qYaw(yaw || 0)).setCcdEnabled(def.mass < 10).setAngularDamping(0.15).setLinearDamping(0.01));
		var s = def.size, cd;
		if (def.shape === "box") cd = RAPIER.ColliderDesc.cuboid(s[0] / 2, s[1] / 2, s[2] / 2);
		else if (def.shape === "cyl") cd = RAPIER.ColliderDesc.cylinder(s[1] / 2, s[0]);
		else if (def.shape === "ball") cd = RAPIER.ColliderDesc.ball(s[0]);
		else if (def.shape === "cone") cd = RAPIER.ColliderDesc.cone(s[1] / 2, s[0]);
		else if (def.shape === "tyre") cd = RAPIER.ColliderDesc.cylinder(s[0] * 0.3, s[0]).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
		else if (def.shape === "rock") { var r = Math.random, pts = []; for (var i = 0; i < 14; i++) { var u = r() * 2 - 1, a = r() * 6.283, q = Math.sqrt(1 - u * u); pts.push(Math.cos(a) * q * s[0], u * s[0] * 0.8, Math.sin(a) * q * s[0]); } cd = RAPIER.ColliderDesc.convexHull(new Float32Array(pts)); }
		else if (def.shape === "pin") { var pp = []; pinProfile(s[0], s[1]).forEach(function (p) { for (var k = 0; k < 8; k++) pp.push(Math.cos(k * 0.785) * p[0], p[1] - s[1] / 2, Math.sin(k * 0.785) * p[0]); }); cd = RAPIER.ColliderDesc.convexHull(new Float32Array(pp)); }
		cd.setMass(def.mass).setFriction(0.7).setRestitution(def.bounce || 0.2);
		var col = phys.createCollider(cd, body);
		var mesh = objMesh(def);
		void col;
		if (def.shape === "pin") mesh.geometry.translate(0, -s[1] / 2, 0);
		if (def.shape === "tyre") mesh.rotation.set(0, 0, 0);
		scene.add(mesh);
		var o = { id: ++objSeq, kind: kind, def: def, body: body, mesh: mesh, lastV: null, born: performance.now() };
		objs.push(o); return o;
	}
	function aheadOfPlayer(dist) {
		var c = cars[player], t = c.body.translation(), r = c.body.rotation(), f = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)); f.y = 0; f.normalize();
		return { x: t.x + f.x * dist, z: t.z + f.z * dist, yaw: Math.atan2(f.x, f.z), f: f };
	}
	function spawnKind(kind) {
		var a = aheadOfPlayer(14 + Math.random() * 8), def = C.OBJECTS[kind];
		var x = a.x + (Math.random() - 0.5) * 4, z = a.z + (Math.random() - 0.5) * 4;
		spawnObj(kind, x, groundBelow(x, z) + 1.5 + def.size[0] * (def.shape === "rock" ? 1 : 0.5) + (def.size[1] || 0) / 2, z, a.yaw);
		sfx("pop");
	}
	function spawnLayout(kind) {
		var a = aheadOfPlayer(kind === "rain" ? 6 : 22), list = C.layout(kind), cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
		list.forEach(function (o) {
			var x = a.x + o.x * cy + o.z * sy, z = a.z - o.x * sy + o.z * cy;
			spawnObj(o.k, x, (kind === "rain" ? hAt(x, z) : groundBelow(x, z)) + o.y + 0.02, z, a.yaw + (o.yaw || 0));
		});
		sfx("pop");
	}
	/* the highest solid surface under (x, z): terrain or a ramp (a ray cast down) */
	function groundBelow(x, z) {
		var ray = new RAPIER.Ray({ x: x, y: 200, z: z }, { x: 0, y: -1, z: 0 }), hit = phys.castRay(ray, 400, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);
		return hit ? 200 - hit.timeOfImpact : hAt(x, z);
	}
	function clearObjs() { objs.forEach(function (o) { phys.removeRigidBody(o.body); scene.remove(o.mesh); }); objs = []; }

	/* ===================== particles (sparks, debris, dust, smoke) ===================== */
	var parts = {
		max: 900, list: [], mesh: null, glow: null,
		init: function () {
			this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.max);
			this.glow = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }), this.max);
			this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			this.mesh.count = this.glow.count = 0; this.mesh.frustumCulled = this.glow.frustumCulled = false;
			var c = new THREE.Color(1, 1, 1); for (var i = 0; i < this.max; i++) { this.mesh.setColorAt(i, c); this.glow.setColorAt(i, c); }
			scene.add(this.mesh, this.glow);
		},
		clear: function () { this.list.length = 0; },
		add: function (p) { if (this.list.length >= this.max * 2 - 4) this.list.shift(); this.list.push(p); },
		/* type: glow (sparks, fire) or solid (debris, dust, smoke) */
		burst: function (x, y, z, n, o) {
			for (var i = 0; i < n; i++) {
				var a = Math.random() * 6.283, u = Math.random() * 2 - 1, sp = (o.speed || 6) * (0.3 + Math.random() * 0.9), q = Math.sqrt(1 - u * u);
				this.add({ x: x, y: y, z: z, vx: Math.cos(a) * q * sp + (o.vx || 0), vy: Math.abs(u) * sp * (o.up || 1) + (o.vy || 0), vz: Math.sin(a) * q * sp + (o.vz || 0),
					life: (o.life || 1) * (0.6 + Math.random() * 0.8), age: 0, size: (o.size || 0.08) * (0.6 + Math.random() * 0.8), glow: !!o.glow, col: o.cols ? o.cols[(Math.random() * o.cols.length) | 0] : (o.col || "#ffffff"), grav: o.grav == null ? 1 : o.grav, drag: o.drag || 0, grow: o.grow || 0, bounce: o.bounce == null ? 0.3 : o.bounce });
			}
		},
		step: function (dt) {
			var g = phys ? phys.gravity.y : -9.81, nm = 0, ng = 0, col = this._c || (this._c = new THREE.Color()), m = tmpM, pos = tmpV, s = this._s || (this._s = new THREE.Vector3()), qi = this._q || (this._q = new THREE.Quaternion());
			for (var i = this.list.length - 1; i >= 0; i--) {
				var p = this.list[i]; p.age += dt; if (p.age > p.life) { this.list.splice(i, 1); continue; }
				p.vy += g * p.grav * dt; var dk = Math.exp(-p.drag * dt); p.vx *= dk; p.vy *= dk; p.vz *= dk;
				p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
				var gh = ter ? hAt(p.x, p.z) : 0; if (p.y < gh + p.size / 2) { p.y = gh + p.size / 2; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; }
				var k = p.glow ? 1 - p.age / p.life : 1, sz = p.size * (1 + p.grow * p.age) * (p.glow ? k : (p.age > p.life * 0.7 ? (p.life - p.age) / (p.life * 0.3) : 1));
				pos.set(p.x, p.y, p.z); s.set(sz, sz, sz); m.compose(pos, qi, s); col.set(p.col);
				if (p.glow) { if (ng < this.max) { this.glow.setMatrixAt(ng, m); this.glow.setColorAt(ng, col); ng++; } }
				else if (nm < this.max) { this.mesh.setMatrixAt(nm, m); this.mesh.setColorAt(nm, col); nm++; }
			}
			this.mesh.count = nm; this.glow.count = ng;
			this.mesh.instanceMatrix.needsUpdate = this.glow.instanceMatrix.needsUpdate = true;
			if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
		}
	};

	/* ===================== input ===================== */
	var keys = {}, touch = { th: 0, br: 0, l: 0, r: 0, hb: 0, boost: 0, pit: 0, rol: 0, rudl: 0, rudr: 0, fbrk: 0 }, kbActive = false;
	function inField(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
	function driving() { return kbActive || view.classList.contains("mes-pfill") || !!document.fullscreenElement; }
	document.addEventListener("keydown", function (e) {
		if (edOpen && phys) { edKey(e); return; }
		if (inField(e) || !phys) return;
		if (e.key === "Enter" && NET && NET.live && !e.repeat) { e.preventDefault(); netChatOpen(); return; }
		var k = e.key.toLowerCase(), flying = !!(cars[player] && cars[player].d.fly), drive = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift"].indexOf(k) >= 0 || (flying && ["q", "e", "z", "control"].indexOf(k) >= 0);
		if (!driving()) { if (drive && stageVisible() && !e.ctrlKey && !e.metaKey && document.activeElement === document.body && k !== " ") { /* allow driving without clicking first if the picture is mostly on screen */ kbActive = true; } else return; }
		if (drive) e.preventDefault();
		if (e.repeat && !drive) return;
		if (replay) { /* replay controls */
			if (k === " ") { e.preventDefault(); rpToggle(); } else if (k === "y" || k === "escape") replayStop(); else if (k === "arrowleft") { replay.t = Math.max(0, replay.t - 1); } else if (k === "arrowright") { replay.t = Math.min(replay.len, replay.t + 1); } else if (k === "c") { var cs = ["tv", "chase", "orbit"]; replay.cam = cs[(cs.indexOf(replay.cam) + 1) % 3]; replayCamPref = replay.cam; $("cs-rpcam").value = replay.cam; replay.tv = replay.cp = null; }
			return;
		}
		keys[k] = true;
		if (k === "y") { replayStart(); return; }
		if (k === "b") { edOpenNow(); return; }
		if (k === "l") { launchKey = true; return; }
		if (k === "j") { togglePlane(); return; }
		if (k === "v") { if (flying) flapPress = true; else toast("V = flaps, in a plane (press J to fly one)"); return; }
		if (k === "[" || k === "]") { stepSpeed(k === "]" ? 1 : -1); return; }
		if (k === "n") { setNight(dayK >= 0.45); return; }
		if (k === "k") { var wl = C.weatherFor(S.world); if (wl.length < 2) { setWeather("rain"); return; } setWeather(wl[(wl.indexOf(S.weather) + 1) % wl.length]); return; }
		if (k === "r") playerReset();
		else if (k === "t") restartAll();
		else if (k === "x") repairHere();
		else if (k === "c") cycleCam(1);
		else if (k === "tab") { e.preventDefault(); switchCar(e.shiftKey ? -1 : 1); }
		else if (k === "g") flipGravity();
		else if (k === "o") spawnKind(C.OBJ_ORDER[(Math.random() * C.OBJ_ORDER.length) | 0]);
		else if (k === "p") togglePause();
		else if (k === "h") horn();
		else if (k === "m") { setSound(!S.sound); toast(S.sound ? "Sound on" : "Sound off"); }
		else if (k === "f" && !e.ctrlKey && !e.metaKey) { var b = view.querySelector(".mes-pbtn"); if (b) b.click(); }
		else if (k === "escape") { if (replay) replayStop(); else kbActive = false; }
	});
	document.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });
	window.addEventListener("blur", function () { keys = {}; });
	/* the player's car on its roof or side: a big "Flip back over" button after 1.2 s, and it flips back by itself after 6 s */
	function playerReset() {
		if (replay) replayStop(true); var c = cars[player];
		if (c.d.fly && !c.anyContact && planeAgl(c, c.body.translation()) > 3) { planeLevel(c); toast("Wings level · flying on"); }
		else { resetCar(c, true); toast("Back on its wheels"); }
		$("cs-unflip").hidden = true;
	}
	/* Restart: every car back to its start spot, fully repaired, gravity flip and pause ended (T). Repair: the car you drive, where it is (X). */
	function restartAll() {
		if (replay) replayStop(true);
		if (paused) { paused = false; $("cs-pause").textContent = "❚❚ Pause"; }
		if (gFlip > 0) { gFlip = 0; setGravity(gravity); }
		cars.forEach(function (c) { resetCar(c, false); repair(c); c.stuckT = c.revT = 0; c.gPeak = 0; if (c.fly) { c.fly.ap = null; c.fly.toff = false; c.fly.dead = false; } });
		camSnap = true; camBackNow(); $("cs-unflip").hidden = true; updateHud(true);
		toast("⟲ Back to the start · everything repaired");
	}
	function repairHere() {
		var c = cars[player]; if (!c) return; var was = c.damage;
		repair(c); c.gPeak = 0; if (c.fly) c.fly.dead = false; updateHud(true);
		toast(was > 0.5 ? "🔧 Repaired: dents gone, engine like new" : "🔧 Nothing to repair: the car is like new");
	}
	var unflipShown = -1;
	function unflipTick(c) {
		var el = $("cs-unflip"), t = c.upsideT, show = t > 1.2 && !autoPilot;
		if (show && t > 6) { playerReset(); return; }
		var n = show ? Math.ceil(6 - t) : -1;
		if (n !== unflipShown) { unflipShown = n; el.hidden = !show; if (show) $("cs-unflipn").textContent = "(by itself in " + n + " s)"; }
	}
	function stageVisible() { var r = stage.getBoundingClientRect(); return r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5; }

	function setupTouch() {
		var map = { "cs-t-left": "l", "cs-t-right": "r", "cs-t-gas": "th", "cs-t-brake": "br", "cs-t-boost": "boost", "cs-t-hb": "hb" };
		Object.keys(map).forEach(function (id) {
			var el = $(id); if (!el) return;
			function on(e) { e.preventDefault(); touch[map[id]] = 1; el.classList.add("on"); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } initAudio(); }
			function off() { touch[map[id]] = 0; el.classList.remove("on"); }
			el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("lostpointercapture", off);
			el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
		});
		/* the gas pedal pulses until it is first pressed, so a newcomer sees which one makes the car go */
		var gasEl = $("cs-t-gas"); if (gasEl) { gasEl.classList.add("cs-hint"); gasEl.addEventListener("pointerdown", function () { gasEl.classList.remove("cs-hint"); }, { once: true }); }
		var lb = $("cs-t-launch"); if (lb) { lb.addEventListener("pointerdown", function (e) { e.preventDefault(); launchKey = true; initAudio(); }); lb.addEventListener("contextmenu", function (e) { e.preventDefault(); }); }
		/* plane: a stick that springs back to the middle, a throttle that stays where you leave it, rudder / brake / flaps buttons */
		var stick = $("cs-stick"), knob = $("cs-knob");
		if (stick) {
			var sid = null, smove = function (e) { var r = stick.getBoundingClientRect(), R = r.width / 2, dx = (e.clientX - r.left - R) / (R * 0.75), dy = (e.clientY - r.top - R) / (R * 0.75), m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } touch.rol = dx; touch.pit = dy; knob.style.transform = "translate(" + (dx * R * 0.6) + "px," + (dy * R * 0.6) + "px)"; };
			stick.addEventListener("pointerdown", function (e) { e.preventDefault(); sid = e.pointerId; try { stick.setPointerCapture(sid); } catch (x) { /* ignore */ } smove(e); initAudio(); });
			stick.addEventListener("pointermove", function (e) { if (e.pointerId === sid) smove(e); });
			var send = function () { sid = null; touch.rol = touch.pit = 0; knob.style.transform = ""; };
			stick.addEventListener("pointerup", send); stick.addEventListener("pointercancel", send); stick.addEventListener("lostpointercapture", send);
		}
		var thr = $("cs-thr");
		if (thr) {
			var tid = null, tset = function (e) { var r = thr.getBoundingClientRect(), v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); var c = cars[player]; if (c && c.fly) { if (easyActive()) c.fly.spd = v; else c.fly.thr = v; updatePlaneHud(c); } };
			thr.addEventListener("pointerdown", function (e) { e.preventDefault(); tid = e.pointerId; try { thr.setPointerCapture(tid); } catch (x) { /* ignore */ } tset(e); initAudio(); });
			thr.addEventListener("pointermove", function (e) { if (e.pointerId === tid) tset(e); });
			thr.addEventListener("pointerup", function () { tid = null; }); thr.addEventListener("pointercancel", function () { tid = null; });
			thr.addEventListener("keydown", function (e) { var c = cars[player]; if (!c || !c.fly) return; var k = easyActive() ? "spd" : "thr"; if (c.fly[k] == null) c.fly[k] = 0.15; if (e.key === "ArrowUp") c.fly[k] = Math.min(1, c.fly[k] + 0.1); else if (e.key === "ArrowDown") c.fly[k] = Math.max(0, c.fly[k] - 0.1); else return; e.preventDefault(); e.stopPropagation(); updatePlaneHud(c); });
		}
		[["cs-t-rudl", "rudl"], ["cs-t-rudr", "rudr"], ["cs-t-fbrk", "fbrk"]].forEach(function (p) {
			var el = $(p[0]); if (!el) return;
			var on = function (e) { e.preventDefault(); touch[p[1]] = 1; el.classList.add("on"); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }, off = function () { touch[p[1]] = 0; el.classList.remove("on"); };
			el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("lostpointercapture", off); el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
		});
		var fl = $("cs-t-flap"); if (fl) fl.addEventListener("pointerdown", function (e) { e.preventDefault(); flapPress = true; });
		var fr = $("cs-t-freset"); if (fr) fr.addEventListener("click", playerReset);
		var to = $("cs-t-toff"); if (to) { to.addEventListener("pointerdown", function (e) { e.preventDefault(); toffPress = true; initAudio(); }); to.addEventListener("contextmenu", function (e) { e.preventDefault(); }); }
		var pm = $("cs-t-pmode"); if (pm) pm.addEventListener("click", function () { setPEasy(!easyOn()); });
		var rs = $("cs-t-reset"); if (rs) { rs.addEventListener("click", playerReset); rs.addEventListener("contextmenu", function (e) { e.preventDefault(); }); }
		showTouch();
	}
	function showTouch() { var on = S.touch === "on" || (S.touch === "auto" && matchMedia("(pointer:coarse)").matches); $("cs-touch").hidden = !on; root.classList.toggle("cs-has-touch", on); }
	function readInput() {
		var gp = navigator.getGamepads ? Array.prototype.find.call(navigator.getGamepads(), function (p) { return p && p.connected; }) : null;
		var th = (keys.w || keys.arrowup ? 1 : 0) || touch.th, br = (keys.s || keys.arrowdown ? 1 : 0) || touch.br;
		var st = ((keys.a || keys.arrowleft || touch.l) ? 1 : 0) - ((keys.d || keys.arrowright || touch.r) ? 1 : 0);
		var hb = keys[" "] || touch.hb ? 1 : 0, boost = keys.shift || touch.boost ? 1 : 0;
		if (gp) {
			var ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) st = -ax;
			var rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
			if (rt > 0.05) th = rt; if (lt > 0.05) br = lt;
			if (gp.buttons[0] && gp.buttons[0].pressed) hb = 1; if (gp.buttons[3] && gp.buttons[3].pressed) launchKey = true; if (gp.buttons[2] && gp.buttons[2].pressed) boost = 1;
		}
		/* plane: W / S (arrows) pitch, A / D roll, Q / E rudder, Shift / Z (or Ctrl) throttle, Space brakes, V flaps */
		var pit = ((keys.s || keys.arrowdown) ? 1 : 0) - ((keys.w || keys.arrowup) ? 1 : 0) + (touch.pit || 0);
		var rol = ((keys.d || keys.arrowright) ? 1 : 0) - ((keys.a || keys.arrowleft) ? 1 : 0) + (touch.rol || 0);
		var yaw = (keys.e || touch.rudr ? 1 : 0) - (keys.q || touch.rudl ? 1 : 0), thrD = (keys.shift ? 1 : 0) - (keys.z || keys.control ? 1 : 0), brk = keys[" "] || touch.fbrk ? 1 : 0;
		if (gp) {
			var a0 = gp.axes[0] || 0, a1 = gp.axes[1] || 0, a2 = gp.axes[2] || 0;
			if (Math.abs(a0) > 0.1) rol = a0; if (Math.abs(a1) > 0.1) pit = a1; if (Math.abs(a2) > 0.15) yaw = a2;
			if (gp.buttons[4] && gp.buttons[4].pressed) yaw = -1; if (gp.buttons[5] && gp.buttons[5].pressed) yaw = 1;
			if (rt > 0.05 || lt > 0.05) thrD = rt - lt; if (gp.buttons[0] && gp.buttons[0].pressed) brk = 1;
			var xb = gp.buttons[2] && gp.buttons[2].pressed; if (xb && !gpFlap) flapPress = true; gpFlap = xb;
		}
		return { th: th, br: br, st: st, hb: hb, boost: boost, pit: Math.max(-1, Math.min(1, pit)), rol: Math.max(-1, Math.min(1, rol)), yaw: yaw, thrD: thrD, brk: brk };
	}
	var gpFlap = false;

	/* ===================== driving one car ===================== */
	function fwdOf(c) { var r = c.body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w); return new THREE.Vector3(0, 0, 1).applyQuaternion(tmpQ); }
	function upOf(c) { var r = c.body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w); return new THREE.Vector3(0, 1, 0).applyQuaternion(tmpQ); }
	function aiInput(c, dt) {
		if (c.d.fly) return { th: 0, br: 1, st: 0, hb: 1, boost: 0, pit: 0, rol: 0, yaw: 0, thrD: -1, brk: 1 }; /* a plane nobody flies: engine off, brakes on */
		var t = c.body.translation(), f = fwdOf(c), yaw = Math.atan2(f.x, f.z), v = c.veh.currentVehicleSpeed(), d = c.d;
		var me = cars[player], target, mode = S.ai;
		if (mode === "park") return { th: 0, br: 0.4, st: 0, hb: 1, boost: 0 };
		if (mode === "chase" && me !== c) { var mt = me.body.translation(), mv = me.body.linvel(); target = { x: mt.x + mv.x * 0.6, z: mt.z + mv.z * 0.6 }; }
		else target = aiTarget(t.x, t.z, c.lane, 16 + Math.abs(v) * 0.8);
		var o = C.aiDrive({ x: t.x, z: t.z, yaw: yaw, v: v }, target.x, target.z, { vmax: Math.min(d.vmax * 0.75, mode === "chase" ? 40 : 24) * Math.sqrt((C.DRIVE[S.drive] || C.DRIVE.real).F) * Math.min(1, Math.sqrt(Math.max(0.3, Math.abs(gravity)) / 9.81) * 1.2 + 0.25) * Math.sqrt(wx().grip), aggr: mode === "chase" });
		/* stuck: back off for a moment */
		if (c.revT > 0) { c.revT -= dt; return { th: 0, br: 1, st: -o.steer, hb: 0, boost: 0, rev: true }; }
		if (Math.abs(v) < 0.8 && o.throttle > 0.3) { c.stuckT += dt; if (c.stuckT > 2.2) { c.stuckT = 0; c.revT = 1.6; } } else c.stuckT = 0;
		if (o.reverse) return { th: 0, br: 1, st: o.steer, hb: 0, boost: 0, rev: true };
		/* keep clear of cars in front (not in derby mode) */
		if (mode !== "chase") {
			var lx = Math.cos(yaw), lz = -Math.sin(yaw);
			for (var j = 0; j < cars.length; j++) {
				var oc = cars[j]; if (oc === c) continue; var ot = oc.body.translation(), rx = ot.x - t.x, rz = ot.z - t.z;
				var fw = rx * f.x + rz * f.z, lat = rx * lx + rz * lz;
				if (fw > 0 && fw < 8 + Math.abs(v) * 0.9 && Math.abs(lat) < 3) { o.steer = Math.max(-1, Math.min(1, o.steer - (lat >= 0 ? 0.9 : -0.9))); if (fw < 4 + Math.abs(v) * 0.5) { o.throttle = 0; o.brake = 0.7; } }
			}
		}
		return { th: o.throttle, br: o.brake, st: o.steer, hb: 0, boost: mode === "chase" && Math.abs(o.ang || 0) < 0.15 ? 1 : 0 };
	}
	/* ===================== flying a plane ===================== */
	var flapPress = false, toffPress = false, planeV3 = null;
	/* the air moving over the ground: a steady breeze plus gusts in rain, storms and Martian dust (m/s, world axes) */
	function windAt(t) {
		var X = wx(), w = X.wind || 0; if (!w || !W.rho) return { x: 0, y: 0, z: 0 };
		var a = simT * 0.35, gx = (C.noise(a, t.z * 0.01, 5) - 0.5) * 2, gz = (C.noise(t.x * 0.01, a, 9) - 0.5) * 2, gy = (C.noise(a * 1.7, t.x * 0.02, 13) - 0.5) * 2;
		return { x: w * (0.5 + 0.8 * gx), y: w * 0.35 * gy, z: w * 0.8 * gz };
	}
	function aheadClear(c, t, lv) { var hm = hAt(t.x, t.z), half = ter.size / 2 - 28; for (var k = 0.6; k <= 2.41; k += 0.6) { var px = t.x + lv.x * k, pz = t.z + lv.z * k; if (Math.abs(px) > half || Math.abs(pz) > half) break; /* past the wrap line the plane comes back in on the other side */ hm = Math.max(hm, hAt(px, pz)); } var d = c.d; return t.y - hm + (d.ry - d.rest * 0.75 - d.wr); }
	function planeAgl(c, t) { var d = c.d; return Math.max(0, t.y - hAt(t.x, t.z) + (d.ry - d.rest * 0.75 - d.wr)); }
	function flyPlane(c, inp, dt) {
		var d = c.d, A = d.fly, F = c.fly, dmg = c.damage / 100, me = c === cars[player] && !c.ai;
		if (!planeV3) planeV3 = { q: new THREE.Quaternion(), qi: new THREE.Quaternion(), a: new THREE.Vector3(), b: new THREE.Vector3() };
		var r = c.body.rotation(), q = planeV3.q.set(r.x, r.y, r.z, r.w), qi = planeV3.qi.copy(q).invert(), t = c.body.translation(), lv = c.body.linvel(), av = c.body.angvel(), wd = windAt(t);
		var vb = planeV3.a.set(lv.x - wd.x, lv.y - wd.y, lv.z - wd.z).applyQuaternion(qi), wb = planeV3.b.set(av.x, av.y, av.z).applyQuaternion(qi);
		/* Easy flying (the default): the stick asks for a turn and a climb and C.easyPilot works the real controls */
		var ap = null;
		if (me && S.pEasy !== false && W.rho > 0 && Math.abs(gravity) > 0.05) {
			if (F.spd == null) F.spd = 0.15;
			if (inp.thrD) F.spd = Math.max(0, Math.min(1, F.spd + inp.thrD * 0.4 * dt));
			var fv = new THREE.Vector3(0, 0, 1).applyQuaternion(q), uv = new THREE.Vector3(0, 1, 0).applyQuaternion(q), at = C.attitude(fv, uv), Vb = vb.length();
			var cIn = -(inp.pit || 0) * (S.pinv ? -1 : 1);
			ap = C.easyPilot(F.ap || (F.ap = {}), { pitch: at.pitch, bank: at.bank, V: Vb, vs: lv.y, alpha: Math.atan2(-vb.y, Math.max(0.5, vb.z)), q: -wb.x, p: wb.z, beta: Vb > 1 ? Math.asin(Math.max(-1, Math.min(1, vb.x / Vb))) : 0,
				agl: planeAgl(c, t), aglA: aheadClear(c, t, lv), y: t.y, ground: !!c.anyContact, vs0: C.stallSpeed(A, d.mass, Math.abs(gravity), W.rho, 0), vRot: A.vRot * Math.sqrt(C.AIR_EARTH / W.rho) * Math.sqrt(Math.abs(gravity) / 9.81), top: C.topSpeed(A, d.mass, Math.abs(gravity), W.rho), aLim: A.aS + A.flap[F.flap][2] },
				{ climb: cIn, turn: inp.rol || 0, spd: F.spd, go: toffPress, brk: inp.brk }, dt);
			toffPress = false;
			F.elev = C.ease(F.elev, ap.elev, 8, dt); F.ail = C.ease(F.ail, ap.ail, 8, dt); F.rud = C.ease(F.rud, ap.rud, 6, dt);
			F.thr = C.ease(F.thr, ap.thr, 0.8, dt);
			if (F.flap !== ap.flap) { F.flap = ap.flap; syncPlaneTouch(); }
			F.brk = ap.brk || inp.brk ? 1 : 0; F.toff = ap.toff;
			if (flapPress) flapPress = false;
		} else {
			if (F.ap) { F.ap = null; F.toff = false; }
			/* controls move at a real speed, never jump */
			var pit = (inp.pit || 0) * (S.pinv ? -1 : 1);
			F.elev = C.ease(F.elev, Math.max(-1, Math.min(1, pit)), pit ? 2.6 : 4, dt);
			F.ail = C.ease(F.ail, Math.max(-1, Math.min(1, inp.rol || 0)), inp.rol ? 3 : 5, dt);
			F.rud = C.ease(F.rud, Math.max(-1, Math.min(1, inp.yaw || 0)), inp.yaw ? 3 : 5, dt);
			if (inp.thrD) F.thr = Math.max(0, Math.min(1, F.thr + inp.thrD * 0.5 * dt));
			if (me && flapPress) { flapPress = false; F.flap = (F.flap + 1) % 3; toast("Flaps: " + C.FLAPS[F.flap] + (F.flap ? " · more lift, more drag, lower stall speed" : "")); syncPlaneTouch(); }
			F.brk = inp.brk ? 1 : 0;
			if (me) toffPress = false;
		}
		if (c.damage < 100) F.dead = false;
		if (c.damage >= 100 && !F.dead) { F.dead = true; if (me) toast("💥 The engine is wrecked: glide down and land (🔧 Repair = X)"); }
		var thrEff = F.dead ? 0 : F.thr * (1 - dmg * 0.5);
		/* wheels: nose-wheel steering (rudder, and the aileron keys too while on the ground), brakes on the main wheels */
		var v = c.veh.currentVehicleSpeed(), grip = gripOf(d) * wx().grip;
		var steerIn = Math.max(-1, Math.min(1, ap && c.anyContact ? (inp.rol || 0) * 0.8 : F.rud + (c.anyContact ? F.ail * 0.7 : 0)));
		c.steer += (-steerIn * d.steer / (1 + Math.abs(v) / 9) - c.steer) * Math.min(1, dt * 8);
		c.veh.setWheelSteering(0, c.steer); c.veh.setWheelSteering(1, c.steer);
		var anyContact = false;
		for (var i = 0; i < 4; i++) {
			var N = Math.max(0, c.veh.wheelSuspensionForce(i) || 0), lim = grip * N, e = 0;
			if (c.veh.wheelIsInContact(i)) anyContact = true;
			if ((i > 1 || ap) && F.brk && Math.abs(v) > 0.3) /* easy flying brakes the nose wheel too */ e = -Math.sign(v) * d.mass * Math.abs(gravity) * 0.4;
			c.veh.setWheelEngineForce(i, Math.max(-lim, Math.min(lim, e)));
			c.veh.setWheelFrictionSlip(i, grip);
			c.veh.setWheelBrake(i, (F.brk || thrEff < 0.02) && Math.abs(v) < 1.2 ? d.mass * 0.004 : 0);
		}
		/* the air: velocity and turn rate in the plane's own axes -> lift, drag, thrust and turning moments -> back to world axes */
		var o = C.aero(A, { x: vb.x, y: vb.y, z: vb.z }, { x: wb.x, y: wb.y, z: wb.z }, { elev: F.elev, ail: F.ail, rud: F.rud, flap: F.flap, thr: thrEff }, W.rho, dt, A.I);
		F.o = o;
		var fw = planeV3.a.set(o.F.x, o.F.y, o.F.z).applyQuaternion(q);
		c.body.resetForces(true); c.body.resetTorques(true);
		var roll = anyContact && Math.hypot(lv.x, lv.z) > 0.3 ? d.mass * Math.abs(gravity) * 0.015 / Math.max(0.3, Math.hypot(lv.x, lv.z)) : 0; /* tyre rolling resistance */
		c.body.addForce({ x: fw.x - lv.x * roll, y: fw.y, z: fw.z - lv.z * roll }, true);
		var tw = planeV3.b.set(o.T.x, o.T.y, o.T.z).applyQuaternion(q); c.body.addTorque({ x: tw.x, y: tw.y, z: tw.z }, true);
		c.anyContact = anyContact; c.airT = anyContact ? 0 : (c.airT || 0) + dt;
		c.in = { th: thrEff, br: F.brk, st: 0, hb: 0, boost: thrEff > 0.95 && A.jet ? 1 : 0 };
		c.flame.visible = !!A.jet && thrEff > 0.9;
		c.lightR.emissiveIntensity = (simT % 1.2) < 0.12 ? 4 : 0.3; c.lightF.emissiveIntensity = dayK < 0.45 || F.flap ? 4 : 1;
		if (me) planeEvents(c, t, lv, dt);
	}
	/* take-off, touchdown (graded by the sink rate), records, and flying round the edge of the map */
	function planeEvents(c, t, lv, dt) {
		var F = c.fly, agl = planeAgl(c, t);
		if (!c.anyContact && agl > 1.5) {
			if (!F.air) { F.air = true; F.t0 = simT; F.x0 = t.x; F.z0 = t.z; F.maxAgl = 0; if (W.rho && simT - (c.born || 0) > 1 && (!F.o || F.o.V > C.stallSpeed(c.d.fly, c.d.mass, Math.abs(gravity), W.rho, 2) * 0.8)) toast("🛫 Lift-off at " + C.fmtSpeed(F.o ? F.o.V : Math.hypot(lv.x, lv.z), S.units) + (W.rho ? "" : " (thrown, not flying: no air!)")); }
			F.maxAgl = Math.max(F.maxAgl, agl); F.lastVy = lv.y;
		} else if (c.anyContact && F.air) {
			F.air = false;
			var sink = Math.max(0, -F.lastVy), tf = simT - F.t0, dist = Math.hypot(t.x - F.x0, t.z - F.z0);
			if (tf > 1.5) {
				var grade = C.landingRate(sink), rw = W.track && C.onRunway(t.x, t.z) ? " on the runway" : "";
				if (sink >= 6 && S.damage) { c.damage = Math.min(100, c.damage + (sink - 5) * 12); dent(c, new THREE.Vector3(0, -c.d.h / 2, 0), new THREE.Vector3(0, 1, 0), sink); sfx("crash", Math.min(1, sink / 12)); shake = Math.min(1, sink / 12); }
				var best = REC.landing == null || sink < REC.landing ? (REC.landing = sink, " · best landing yet!") : "";
				if (tf > (REC.flight || 0)) REC.flight = tf; if (F.maxAgl > (REC.alt || 0)) REC.alt = F.maxAgl; saveRec();
				toast((sink < 4 ? "🛬 " : "💥 ") + grade + rw + " · sank at " + sink.toFixed(1) + " m/s · flew " + C.fmtDist(dist, S.units) + " in " + C.fmtLap(tf) + best);
			}
		}
		/* the world is only a few hundred metres across: fly off one edge and come back in at the other */
		var half = ter.size / 2 - 28;
		if (F.air && (Math.abs(t.x) > half || Math.abs(t.z) > half)) {
			var nx = Math.abs(t.x) > half ? -Math.sign(t.x) * (half - 2) : t.x, nz = Math.abs(t.z) > half ? -Math.sign(t.z) * (half - 2) : t.z, ny = Math.max(t.y, hAt(nx, nz) + 25);
			c.body.setTranslation({ x: nx, y: ny, z: nz }, true); if (c.pv) c.pv.ok = false; camSnap = true;
			if (!F.wrapTold) { F.wrapTold = true; toast("Edge of the map: you flew round to the other side"); }
		}
	}
	/* a plane reset: in the air = wings level, keep flying; on the ground = upright where it is */
	function planeLevel(c) {
		var t = c.body.translation(), f = fwdOf(c), yaw = Math.atan2(f.x, f.z), A = c.d.fly, v = Math.max(A.vRot * 1.4, Math.hypot(c.body.linvel().x, c.body.linvel().z));
		c.body.setRotation(qYaw(yaw), true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		c.body.setLinvel({ x: Math.sin(yaw) * v, y: 0, z: Math.cos(yaw) * v }, true); c.body.setTranslation({ x: t.x, y: Math.max(t.y, hAt(t.x, t.z) + 30), z: t.z }, true);
		c.fly.elev = c.fly.ail = c.fly.rud = 0; c.fly.thr = Math.max(c.fly.thr, 0.75); c.lastV = null; c.born = simT;
	}
	function driveCar(c, inp, dt) {
		if (c.d.fly) { flyPlane(c, inp, dt); return; }
		var d = c.d, v = c.veh.currentVehicleSpeed(), dmg = c.damage / 100;
		var maxSt = d.steer / (1 + Math.abs(v) / 22);
		c.steer += (inp.st * maxSt - c.steer) * Math.min(1, dt * (inp.st ? 7 : 9));
		c.veh.setWheelSteering(0, c.steer); c.veh.setWheelSteering(1, c.steer);
		var DR = C.DRIVE[S.drive] || C.DRIVE.real;
		var grip = gripOf(d) * wx().grip * DR.grip, drive = d.drive === "awd" ? [0, 1, 2, 3] : d.drive === "fwd" ? [0, 1] : [2, 3], i;
		var eng = [0, 0, 0, 0];
		var wantRev = inp.br > 0 && v < 0.6 && !inp.th, braking = inp.br > 0 && v >= 0.6, braking2 = inp.th > 0 && v < -0.6;
		/* heavy-gravity worlds: the engine grows with g (a sandbox car on the Sun would otherwise never beat its own rolling resistance) */
		var power = C.engineForce(d.F * DR.F, v, d.vmax * DR.v, inp.boost) * (1 - dmg * 0.6) * (d.drive === "awd" ? 0.5 : 1) * Math.sqrt(Math.max(1, Math.abs(gravity) / 9.81));
		if (inp.th > 0 && !braking2) drive.forEach(function (k) { eng[k] = power * inp.th; });
		if (wantRev) drive.forEach(function (k) { eng[k] = -C.engineForce(d.F, -v, d.vmax * 0.3, false) * 0.6 * inp.br * (d.drive === "awd" ? 0.5 : 1) * Math.sqrt(Math.max(1, Math.abs(gravity) / 9.81)); });
		if (braking || braking2) for (i = 0; i < 4; i++) eng[i] = -Math.sign(v) * d.mass * 9.81 * 0.3 * Math.max(inp.br, inp.th);
		var anyContact = false;
		for (i = 0; i < 4; i++) {
			var N = Math.max(0, c.veh.wheelSuspensionForce(i) || 0), lim = grip * N * (i > 1 && inp.hb ? 0.25 : 1);
			if (c.veh.wheelIsInContact(i)) anyContact = true;
			if (i > 1 && inp.hb) eng[i] = Math.abs(v) > 0.3 ? -Math.sign(v) * lim : 0;
			c.veh.setWheelEngineForce(i, Math.max(-lim, Math.min(lim, eng[i])));
			c.veh.setWheelFrictionSlip(i, grip * (i > 1 && inp.hb ? 0.5 : 1));
			c.veh.setWheelBrake(i, !inp.th && !inp.br && Math.abs(v) < 1.5 ? d.mass * 0.004 : 0);
		}
		/* air drag (none on the Moon) + rolling resistance */
		var lv = c.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z), rho = S.world === "earth" || S.world === "jupiter" ? W.rho : W.rho;
		c.body.resetForces(true);
		if (sp > 0.5) { var fd = C.dragForce(rho, d.cdA * (1 + dmg * 0.4), sp) + (anyContact ? d.mass * Math.abs(gravity) * 0.012 : 0), k2 = -fd / sp; c.body.addForce({ x: lv.x * k2, y: lv.y * k2, z: lv.z * k2 }, true); }
		/* no air control: in the air the pedals and steering do nothing to the car's rotation (pure physics; it used to tip the car) */
		if (!anyContact) c.airT = (c.airT || 0) + dt; else c.airT = 0;
		c.flame.visible = !!inp.boost && inp.th > 0;
		var brk = (inp.br > 0 && v > 0.5) || (inp.th > 0 && v < -0.5) || inp.hb;
		c.lightR.emissiveIntensity = brk ? 3.2 : (dayK < 0.45 ? 1.1 : 0.5); c.lightF.emissiveIntensity = dayK < 0.45 ? 5 : 1.2;
		c.in = inp; c.anyContact = anyContact;
	}

	/* ===================== simulation step ===================== */
	/* ---------- instant replay: the last 12 s of every car and object, 30 frames a second ---------- */
	var recFrames = [], REC_SEC = 12, replay = null, objSeq = 0;
	function recordFrame() {
		var f = { t: simT, cars: [], objs: {} };
		cars.forEach(function (c) {
			var t = c.body.translation(), r = c.body.rotation(), a = new Float32Array(19); a[0] = t.x; a[1] = t.y; a[2] = t.z; a[3] = r.x; a[4] = r.y; a[5] = r.z; a[6] = r.w;
			for (var i = 0; i < 4; i++) { var sl = c.veh.wheelSuspensionLength(i), cp = c.veh.wheelChassisConnectionPointCs(i); a[7 + i * 3] = cp && sl != null ? cp.y - sl : c.d.ry - c.d.rest; a[8 + i * 3] = c.veh.wheelSteering(i) || 0; a[9 + i * 3] = c.veh.wheelRotation(i) || 0; }
			f.cars.push([c, a]);
		});
		objs.forEach(function (o) { var t = o.body.translation(), r = o.body.rotation(); f.objs[o.id] = [o, new Float32Array([t.x, t.y, t.z, r.x, r.y, r.z, r.w])]; });
		recFrames.push(f); while (recFrames.length && recFrames[0].t < simT - REC_SEC) recFrames.shift();
	}
	function replayStart() {
		if (replay) { replayStop(); return; }
		if (recFrames.length < 20) { toast("Drive for a moment first: nothing to replay yet"); return; }
		replay = { frames: recFrames.slice(), t: 0, speed: 1, playing: true, cam: replayCamPref || "tv", tv: null, cp: null };
		replay.len = replay.frames[replay.frames.length - 1].t - replay.frames[0].t;
		$("cs-replay").hidden = false; root.classList.add("cs-replaying"); $("cs-toast").classList.remove("show"); $("cs-rpcam").value = replay.cam; $("cs-rpspeed").value = "1";
		parts.mesh.visible = parts.glow.visible = false; if (ghostMesh) ghostMesh.visible = false;
		$("cs-rpplay").textContent = "❚❚"; if (eng) eng.g.gain.value = 0;
	}
	var replayCamPref = null;
	function replayStop(silent) {
		if (!replay) return; replay = null;
		var rp = $("cs-replay"); if (rp) rp.hidden = true; root.classList.remove("cs-replaying");
		cars.forEach(function (c) { c.group.visible = true; }); objs.forEach(function (o) { o.mesh.visible = true; });
		if (parts.mesh) parts.mesh.visible = parts.glow.visible = true;
		camSnap = true; if (!silent) syncMeshes();
	}
	function replayApply() {
		var R = replay, fr = R.frames, t0 = fr[0].t, tt = t0 + R.t, lo = 0, hi = fr.length - 1;
		while (hi - lo > 1) { var m = (lo + hi) >> 1; if (fr[m].t <= tt) lo = m; else hi = m; }
		var A = fr[lo], B = fr[hi], k = B.t > A.t ? Math.max(0, Math.min(1, (tt - A.t) / (B.t - A.t))) : 0;
		var seen = new Set();
		A.cars.forEach(function (e) {
			var c = e[0], a = e[1], bb = null; B.cars.forEach(function (x) { if (x[0] === c) bb = x[1]; }); bb = bb || a; seen.add(c);
			c.group.position.set(a[0] + (bb[0] - a[0]) * k, a[1] + (bb[1] - a[1]) * k, a[2] + (bb[2] - a[2]) * k);
			setQ(c.group.quaternion, a, bb, 3, k);
			for (var i = 0; i < 4; i++) { var w = c.wheels[i]; w.piv.position.y = a[7 + i * 3] + (bb[7 + i * 3] - a[7 + i * 3]) * k; w.piv.rotation.y = a[8 + i * 3]; w.spin.rotation.x = a[9 + i * 3] + (bb[9 + i * 3] - a[9 + i * 3]) * k; }
		});
		cars.forEach(function (c) { c.group.visible = seen.has(c); });
		objs.forEach(function (o) {
			var e = A.objs[o.id]; if (!e) { o.mesh.visible = false; return; }
			var a = e[1], eb = B.objs[o.id], bb = eb ? eb[1] : a; o.mesh.visible = true;
			o.mesh.position.set(a[0] + (bb[0] - a[0]) * k, a[1] + (bb[1] - a[1]) * k, a[2] + (bb[2] - a[2]) * k); setQ(o.mesh.quaternion, a, bb, 3, k);
		});
		$("cs-rpbar").value = String(Math.round(R.t / Math.max(0.01, R.len) * 1000));
		$("cs-rptime").textContent = "−" + Math.max(0, R.len - R.t).toFixed(1) + " s";
	}
	function setQ(q, a, b, o, k) { var d = a[o] * b[o] + a[o + 1] * b[o + 1] + a[o + 2] * b[o + 2] + a[o + 3] * b[o + 3], sg = d < 0 ? -1 : 1; q.set(a[o] + (b[o] * sg - a[o]) * k, a[o + 1] + (b[o + 1] * sg - a[o + 1]) * k, a[o + 2] + (b[o + 2] * sg - a[o + 2]) * k, a[o + 3] + (b[o + 3] * sg - a[o + 3]) * k).normalize(); }
	function replayAdvance(dt) {
		var R = replay; if (R.playing) { R.t += dt * R.speed; if (R.t >= R.len) { R.t = R.len; R.playing = false; $("cs-rpplay").textContent = "↺"; } }
		replayApply(); replayCamera(dt);
	}
	function replayCamera(dt) {
		var c = cars[player]; if (!c || !c.group.visible) { c = cars.find(function (x) { return x.group.visible; }); if (!c) return; }
		var p = c.group.position, R = replay, look = p.clone(); look.y += c.d.h * 0.5 + 0.4;
		if (R.cam === "tv") {
			if (!R.tv || R.tv.distanceTo(p) > 55) { var fw = new THREE.Vector3(0, 0, 1).applyQuaternion(c.group.quaternion).setY(0).normalize(); R.tv = p.clone().addScaledVector(fw, 22).add(new THREE.Vector3(-fw.z, 0, fw.x).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 9)); R.tv.y = hAt(R.tv.x, R.tv.z) + 1.4 + Math.random() * 3; }
			camera.position.copy(R.tv); camera.fov = Math.max(16, Math.min(60, 800 / Math.max(8, R.tv.distanceTo(p))));
		} else if (R.cam === "chase") {
			var f2 = new THREE.Vector3(0, 0, 1).applyQuaternion(c.group.quaternion).setY(0); if (f2.lengthSq() < 0.01) f2.set(0, 0, 1); f2.normalize();
			var want = p.clone().addScaledVector(f2, -(c.d.l * 1.6 + 3)); want.y += c.d.l * 0.6 + 1.2;
			if (!R.cp) R.cp = want.clone(); R.cp.lerp(want, 1 - Math.exp(-dt * 5)); camera.position.copy(R.cp); camera.fov = 62;
		} else { var od = orbit.dist * free.zoom; camera.position.set(p.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * od, p.y + 1 + Math.sin(orbit.pitch) * od, p.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * od); camera.fov = 62; if (R.playing) orbit.yaw += dt * 0.25; }
		var gh = hAt(camera.position.x, camera.position.z) + 0.5; if (camera.position.y < gh) camera.position.y = gh;
		camera.up.set(0, 1, 0); camera.updateProjectionMatrix(); camera.lookAt(look);
	}
	var simT = 0, lap = C.lapNew(), wrongT = 0, autoPilot = false;
	function lapReset() { lap = C.lapNew(); ghostRec = []; }
	/* ---------- ghost of the best lap (stored per world | car | gravity in localStorage mes-car-sandbox:ghost:<key>) ---------- */
	var GKEY = "mes-car-sandbox:ghost:", ghostRec = [], ghost = null, ghostKey = "", ghostMesh = null, ghostMat = null;
	function ghostLoad() {
		var k = lapKey(); if (!W || !hasLap() || k === ghostKey) return; ghostKey = k;
		try { ghost = JSON.parse(localStorage.getItem(GKEY + k)); } catch (e) { ghost = null; }
		ghostBuild();
	}
	function ghostBuild() {
		if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); ghostMesh = null; }
		if (!ghost || !W.track || !cars[player]) return;
		ghostMat = ghostMat || new THREE.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.3, depthWrite: false });
		var vis = makeCarMesh(C.CARS[cars[player].type], "#7fd3ff");
		vis.group.traverse(function (o) { if (o.isMesh) { o.material = ghostMat; o.castShadow = o.receiveShadow = false; } });
		vis.flame.visible = false; ghostMesh = vis.group; ghostMesh.visible = false; scene.add(ghostMesh);
	}
	function ghostSave(rec) {
		ghost = rec; try { localStorage.setItem(GKEY + lapKey(), JSON.stringify(rec)); } catch (e) { /* storage full: the ghost lasts until the page closes */ }
		if (!ghostMesh) ghostBuild();
	}
	function lapKey() { var c = cars[player]; if (!c) return ""; var ex = []; if (S.drive !== "real") ex.push("dr:" + S.drive); if (lapPath) ex.push("road:" + lapPath.id); return C.lapKey(S.world, c.type, gravity, ex.join("|")); }
	function lapTick(c, t) {
		if (!hasLap()) return;
		var n = lapPath ? C.pathNearest(lapPath, t.x, t.z) : C.trackNearest(t.x, t.z);
		C.lapStep(lap, n.s, n.d, simT, lapPath ? lapPath.L : 0, lapPath ? lapPath.w : 0).forEach(function (e) {
			var best = REC.laps[lapKey()];
			if (e.t === "start") { toast("Lap timer started: go!" + (ghost && S.show.ghost !== false ? " Race your ghost" : "")); ghostRec = []; }
			else if (e.t === "sector") { var b = best && best.splits[e.n - 1], dd = b != null ? e.time - b : null; toast("Sector " + e.n + ": " + C.fmtLap(e.time) + (dd != null ? "  (" + (dd <= 0 ? "−" : "+") + Math.abs(dd).toFixed(2) + ")" : "")); }
			else if (e.t === "lap") {
				var isBest = !best || e.time < best.time;
				if (isBest) { REC.laps[lapKey()] = { time: e.time, splits: e.splits }; saveRec(); var r = c.body.rotation(); ghostRec.push(C.ghostSample(e.time, t, r)); ghostSave(ghostRec); }
				ghostRec = [];
				toast("Lap " + lap.laps + ": " + C.fmtLap(e.time) + (isBest ? (best ? "  · new best by " + (best.time - e.time).toFixed(2) + " s!" : "  · first lap set!") : "  (+" + (e.time - best.time).toFixed(2) + ")"));
				sfx("pop", 1); if (NET) netLap(e);
			}
			else if (e.t === "wrong" && simT - wrongT > 4) { wrongT = simT; toast("Wrong way! Laps run the other way round"); }
		});
		/* record this lap at 20 samples a second for a possible new ghost */
		if (lap.t0 != null && lap.valid && ghostRec.length < 6000 && (Math.round(simT * 60) % 3 === 0) && subLast) ghostRec.push(C.ghostSample(simT - lap.t0, t, c.body.rotation()));
	}
	/* Energy guard. Rapier sometimes pushes a fast-landing chassis out of the ground (heightfield) with a huge impulse: the car shot
	   off at 3x its landing speed and tumbled. Per kg: kinetic (moving + turning) + potential energy may grow in one step only by what
	   the springs (4 x max suspension force) and the engine can add; anything more is a solver glitch and is taken back out by scaling
	   both velocities down. Normal driving, jumps and crashes (which lose energy) never come near the limit. */
	function carEnergy(c) {
		var d = c.d, lv = c.body.linvel(), av = c.body.angvel(), t = c.body.translation(), ir = (d.w * d.w + d.h * d.h + d.l * d.l) / 18 * 1.4;
		var kl = 0.5 * (lv.x * lv.x + lv.y * lv.y + lv.z * lv.z), ka = 0.5 * ir * (av.x * av.x + av.y * av.y + av.z * av.z);
		return { k: kl + ka, p: -phys.gravity.y * t.y, v: Math.sqrt(2 * kl) };
	}
	function energyGuard(c) {
		var a = c.preE; if (!a) return;
		var b = carEnergy(c), dt = phys.timestep, d = c.d;
		var acc = 4 * (d.mass * Math.max(9.81, Math.abs(gravity)) * 2.5 + 10) / d.mass + C.engineForce(d.F * (C.DRIVE[S.drive] || C.DRIVE.real).F, 0, d.vmax, true) * Math.sqrt(Math.max(1, Math.abs(gravity) / 9.81)) / d.mass;
		var dv = acc * dt * 1.5, allow = dv * (a.v + dv) + 0.5;
		var target = a.k + a.p + allow - b.p;
		if (b.k <= target) return;
		var s = target > 0 ? Math.sqrt(target / b.k) : 0, lv = c.body.linvel(), av = c.body.angvel();
		c.body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
		c.body.setAngvel({ x: av.x * s, y: av.y * s, z: av.z * s }, true);
		c.glitches = (c.glitches || 0) + 1;
	}
	function step(dt) {
		var pin = readInput();
		netHold(); netDrive(dt);
		cars.forEach(function (c, i) { driveCar(c, i === player && !autoPilot ? pin : aiInput(c, dt), dt); c.veh.updateVehicle(dt); c.preE = carEnergy(c); });
		phys.step(eventQ);
		cars.forEach(energyGuard);
		padTick(dt);
		/* impacts: a velocity change much bigger than gravity + springs can give in one step = a crash */
		var gy = phys.gravity.y;
		cars.forEach(function (c, ci) {
			var lv = c.body.linvel(), t = c.body.translation();
			if (c.lastV) {
				var ax = (lv.x - c.lastV.x) / dt, ay = (lv.y - c.lastV.y) / dt, az = (lv.z - c.lastV.z) / dt;
				/* felt g over an 80 ms window (a real crash pulse lasts ~ 70-120 ms; the solver stops a body in one step) */
				var nx = ax, ny = ay - gy, nz = az, dv = Math.hypot(nx, ny, nz) * dt;
				var rb = c.ring || (c.ring = []); rb.push([nx * dt, ny * dt, nz * dt]); if (rb.length > 5) rb.shift();
				var sx = 0, sy = 0, sz = 0; rb.forEach(function (q) { sx += q[0]; sy += q[1]; sz += q[2]; });
				var felt = Math.hypot(sx, sy, sz) / (rb.length * dt) / C.G0;
				c.gS += (felt - c.gS) * Math.min(1, dt * 6); if (felt > c.gPeak && simT - (c.born || 0) > 1.5) c.gPeak = felt;
				/* the crash threshold grows with gravity: on the Sun (28 g) just resting on the springs is a 4.6 m/s push every step */
				var gThr = Math.abs(gravity) * dt * 4;
				if (dv > 2.2 + gThr && simT - (c.born || 0) > 1) impact(c, ci, nx * dt, ny * dt, nz * dt, dv - gThr, t, felt);
			}
			c.lastV = { x: lv.x, y: lv.y, z: lv.z };
			/* flipped / lost: computer cars put themselves back */
			var up = upOf(c);
			if (up.y < 0.25 && Math.hypot(lv.x, lv.z) < 2) c.upsideT += dt; else c.upsideT = 0;
			if (c.ai && c.upsideT > 3) resetCar(c, true);
			if (ci === player) unflipTick(c);
			if (t.y < -60 || t.y > 4000 && gravity > 0.5) resetCar(c, false);
			if (ci === player && !c.d.fly) { trackAir(c, t, lv); lapTick(c, t); }
			/* dust behind wheels on dusty worlds, smoke from wrecks */
			var XW = wx();
			if (W.track && (XW.p === "rain" || XW.snowy) && c.anyContact && Math.hypot(lv.x, lv.z) > 5 && Math.random() < 0.7) {
				var wj = 2 + ((Math.random() * 2) | 0), cq = c.veh.wheelContactPoint(wj);
				if (cq) parts.burst(cq.x, cq.y + 0.15, cq.z, XW.snowy ? 2 : 1, { speed: 1.2, vx: -lv.x * 0.12, vy: Math.hypot(lv.x, lv.z) * 0.12, vz: -lv.z * 0.12, life: 0.9, size: XW.snowy ? 0.1 : 0.07, cols: XW.snowy ? ["#ffffff", "#e6edf5"] : ["#c9d6e3", "#9fb2c4"], drag: 2, grow: 1.5, bounce: 0 });
			}
			if (!W.track && c.anyContact && Math.hypot(lv.x, lv.z) > 4 && Math.random() < 0.5) {
				var wi = 2 + ((Math.random() * 2) | 0), cp = c.veh.wheelContactPoint(wi);
				if (cp) parts.burst(cp.x, cp.y + 0.1, cp.z, 1, { speed: 1.5, vx: -lv.x * 0.15, vy: Math.hypot(lv.x, lv.z) * 0.18, vz: -lv.z * 0.15, life: W.rho ? 1.5 : 4, size: 0.12, cols: XW.snowy ? ["#ffffff", "#f0e6dc"] : [W.ground[1], W.ground[0]], drag: W.rho ? 1.2 : 0, grow: W.rho ? 1.2 : 0.2, bounce: 0.05 });
			}
			if (c.damage > 60) { c.smokeT -= dt; if (c.smokeT < 0) { c.smokeT = 0.08 + (100 - c.damage) / 300; var fw = fwdOf(c); parts.burst(t.x + fw.x * c.d.l * 0.35, t.y + c.d.h * 0.6, t.z + fw.z * c.d.l * 0.35, 1, { speed: 0.4, vy: 1.6, life: 2.4, size: 0.4, cols: c.damage > 90 ? ["#222", "#333"] : ["#666", "#888"], grav: gravity > 0.5 ? -0.05 : 0, drag: 0.8, grow: 1.6, bounce: 0 }); } }
		});
		objs.forEach(function (o) {
			var lv = o.body.linvel();
			if (o.def.breaks && o.lastV) { var dv = Math.hypot(lv.x - o.lastV.x, lv.y - o.lastV.y - gy * dt, lv.z - o.lastV.z); if (dv > o.def.breaks && performance.now() - o.born > 400) { o.broken = true; } }
			o.lastV = { x: lv.x, y: lv.y, z: lv.z };
		});
		for (var i = objs.length - 1; i >= 0; i--) if (objs[i].broken) breakObj(objs[i], i);
		if (subLast && Math.round(simT * 60) % 2 === 0) recordFrame();
	}
	function impact(c, ci, ix, iy, iz, dv, t, felt) {
		/* where: the side of the car facing the hit (opposite the push), in car coordinates */
		var r = c.body.rotation(), q = new THREE.Quaternion(r.x, r.y, r.z, r.w), qi = q.clone().invert();
		var push = new THREE.Vector3(ix, iy, iz).normalize().applyQuaternion(qi), d = c.d;
		var landing = push.y > 0.85 && dv < 9; /* a hard landing mostly squashes the springs */
		if (!landing && S.damage) {
			var p = new THREE.Vector3(-push.x * d.w / 2, -push.y * d.h / 2, -push.z * d.l / 2);
			var m = Math.max(Math.abs(push.x) / (d.w / 2), Math.abs(push.y) / (d.h / 2), Math.abs(push.z) / (d.l / 2)); p.set(-push.x / m, -push.y / m, -push.z / m);
			dent(c, p, push, dv);
			c.damage = Math.min(100, c.damage + Math.max(0, dv - 2) * (2.2 * 1200 / Math.max(400, d.mass * 0.6 + 600)));
			if (c.damage >= 100) c.paint.color.set(c.color).lerp(new THREE.Color("#2a2420"), 0.65);
			var wp = p.clone().applyQuaternion(q).add(new THREE.Vector3(t.x, t.y, t.z));
			parts.burst(wp.x, wp.y, wp.z, Math.min(40, (dv * 3) | 0), { speed: 3 + dv * 0.5, life: 0.5, size: 0.06, glow: true, cols: ["#ffd166", "#ffb703", "#fff1b8"], grav: 1, bounce: 0.4 });
			if (dv > 8) parts.burst(wp.x, wp.y, wp.z, Math.min(30, dv | 0), { speed: 2 + dv * 0.3, life: 2.5, size: 0.07, cols: ["#cfe8ff", "#9fc8ef", c.color], bounce: 0.2 });
		}
		if (ci === player || dist2(t, cars[player].body.translation()) < 900) sfx(landing ? "thud" : "crash", Math.min(1, dv / 18));
		if (ci === player && !landing) {
			felt = Math.max(felt, dv / 0.08 / C.G0 * 0.6);
			if (felt > REC.crash) { REC.crash = felt; saveRec(); }
			if (dv > 5) toast("Crash! " + felt.toFixed(0) + " g" + (c.damage >= 100 ? " · wrecked (🔧 Repair = X)" : " · damage " + Math.round(c.damage) + "%") + (dv > 9 ? " · Y = instant replay" : ""));
			shake = Math.min(1, dv / 20);
		}
	}
	function dist2(a, b) { return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z); }
	function breakObj(o, i) {
		var t = o.body.translation(), lv = o.body.linvel();
		var cols = o.def.glass ? ["#d7efff", "#a8dcff", "#ffffff"] : ["#e63946", "#ff6b81", "#2f8f3a", "#1b5e20", "#111"];
		parts.burst(t.x, t.y, t.z, o.def.glass ? 60 : 45, { speed: 4, vx: lv.x * 0.5, vy: lv.y * 0.5 + 1, vz: lv.z * 0.5, life: 3, size: o.def.glass ? 0.12 : 0.09, cols: cols, bounce: 0.25 });
		sfx(o.def.glass ? "glass" : "splat", 0.8);
		phys.removeRigidBody(o.body); scene.remove(o.mesh); objs.splice(i, 1);
	}
	/* air time + jump distance for the player */
	function trackAir(c, t, lv) {
		var air = !c.anyContact;
		if (air && !c.air) c.air = { t0: simT, x: t.x, z: t.z, y: t.y, p: 0, yw: 0, r: 0 };
		if (air && c.air) { /* turns in the car's own frame, for stunts */ var av = c.body.angvel(), rq = c.body.rotation(); tmpQ.set(rq.x, rq.y, rq.z, rq.w).invert(); var w = new THREE.Vector3(av.x, av.y, av.z).applyQuaternion(tmpQ); c.air.p += w.x / 60; c.air.yw += w.y / 60; c.air.r += w.z / 60; }
		if (!air && c.air) {
			var tAir = simT - c.air.t0, dist = Math.hypot(t.x - c.air.x, t.z - c.air.z);
			var st = C.stuntName(c.air.p, c.air.yw, c.air.r), upright = upOf(c).y > 0.5;
			if (st.name) {
				var best = "";
				if (upright && st.turns > (REC.stuntTurns || 0)) { REC.stuntTurns = st.turns; REC.stunt = st.name; saveRec(); best = " · new stunt record!"; }
				toast((upright ? "🏆 " + st.name.charAt(0).toUpperCase() + st.name.slice(1) + "! Landed it" : "💥 " + st.name + ", but you didn't land it") + " · " + C.fmtDist(dist, S.units) + ", " + tAir.toFixed(1) + " s" + best);
				if (upright) sfx("pop", 1);
				c.air = null; return;
			}
			if (tAir > 0.6 && dist > 6) {
				var rec = "";
				if (dist > REC.jump) { REC.jump = dist; rec = " · new record!"; }
				if (tAir > REC.air) REC.air = tAir;
				saveRec(); toast("Jump: " + C.fmtDist(dist, S.units) + ", " + tAir.toFixed(1) + " s in the air" + rec);
			}
			c.air = null;
		}
	}

	/* ===================== camera ===================== */
	var CAMS = [["chase", "Chase"], ["far", "Far chase"], ["hood", "Driver's seat / cockpit"], ["side", "Side"], ["top", "Top down"], ["tv", "TV cameras"], ["orbit", "Orbit (drag)"]];
	var camHeld = false, camIdle = 9, camBack = false;
	var camSnap = true, camPos = null, camLook = null, camHead = 0, tvPos = null, shake = 0, free = { yaw: 0, pitch: 0, zoom: 1 }, orbit = { yaw: 0.6, pitch: 0.35, dist: 14 };
	function cycleCam(dir) { var i = CAMS.findIndex(function (c) { return c[0] === S.cam; }); S.cam = CAMS[(i + dir + CAMS.length) % CAMS.length][0]; $("cs-cam").value = S.cam; camSnap = true; camBackNow(); save(); toast("Camera: " + CAMS.find(function (c) { return c[0] === S.cam; })[1]); }
	function updateCamera(dt) {
		var c = cars[player]; if (!c) return;
		var ip = ipose(c), t = ip.t.clone(), lv = c.body.linvel(), cq = ip.q.clone(), pos = t.clone();
		var fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(cq), sp = Math.hypot(lv.x, lv.z);
		var head = sp > 3 && c.veh.currentVehicleSpeed() > 0 ? Math.atan2(lv.x, lv.z) : Math.atan2(fwd.x, fwd.z);
		if (c.veh.currentVehicleSpeed() < -1) head = Math.atan2(fwd.x, fwd.z);
		if (camSnap) camHead = head; else camHead += C.wrap(head - camHead) * Math.min(1, dt * 3);
		camEase(dt, sp);
		var hd = camHead + free.yaw, size = Math.max(c.d.l, 3), want = new THREE.Vector3(), look = pos.clone();
		var mode = S.cam;
		if (c.d.fly && (mode === "chase" || mode === "far" || mode === "hood")) { planeCamera(c, t, cq, mode, dt); return; }
		if (c.d.fly) size = Math.max(size, c.d.fly.b * 0.8);
		if (mode === "chase" || mode === "far") {
			var dist = (mode === "far" ? 2.6 : 1.45) * size * free.zoom + 2, hgt = (mode === "far" ? 1.0 : 0.55) * size + 1 + free.pitch * dist;
			want.set(t.x - Math.sin(hd) * dist, t.y + hgt, t.z - Math.cos(hd) * dist); look.y += c.d.h + 0.6;
		} else if (mode === "hood") {
			var eye = new THREE.Vector3(c.d.cab ? -0.35 : 0, c.d.h / 2 + (c.d.cab ? c.d.cab[0] * 0.55 : (c.d.kart ? 0.6 : 0.9)), c.d.cab ? c.d.l * c.d.cab[2] : -0.2).applyQuaternion(cq).add(pos);
			camera.position.copy(eye); var lk = new THREE.Vector3(Math.sin(free.yaw) * 10, -1 + free.pitch * 10, Math.cos(free.yaw) * 10).applyQuaternion(cq).add(eye);
			camera.up.set(0, 1, 0).applyQuaternion(cq); camera.lookAt(lk); camera.fov = 70 * free.zoom; camera.updateProjectionMatrix(); camSnap = false; return;
		} else if (mode === "side") { want.set(t.x + Math.cos(hd) * size * 2.2 * free.zoom, t.y + 1.5 + free.pitch * 8, t.z - Math.sin(hd) * size * 2.2 * free.zoom); }
		else if (mode === "top") { want.set(t.x - Math.sin(hd) * 0.5, t.y + 45 * free.zoom, t.z - Math.cos(hd) * 0.5); }
		else if (mode === "orbit") { var od = orbit.dist * free.zoom; want.set(t.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * od, t.y + 1 + Math.sin(orbit.pitch) * od, t.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * od); }
		else if (mode === "tv") {
			if (!tvPos || tvPos.distanceTo(pos) > 75 || camSnap) { var ahead = new THREE.Vector3(lv.x, 0, lv.z); if (ahead.length() < 2) ahead.copy(fwd).setY(0); ahead.normalize(); tvPos = pos.clone().addScaledVector(ahead, 35).add(new THREE.Vector3(-ahead.z, 0, ahead.x).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 10)); tvPos.y = hAt(tvPos.x, tvPos.z) + 1.6 + Math.random() * 4; }
			want.copy(tvPos); camera.fov = Math.max(18, Math.min(62, 900 / Math.max(10, tvPos.distanceTo(pos))));
		}
		if (mode !== "tv") camera.fov = 62;
		camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
		var k = camSnap || mode === "top" || mode === "orbit" || mode === "tv" ? 1 : 1 - Math.exp(-dt * 8);
		if (!camPos) camPos = want.clone(); camPos.lerp(want, k);
		/* keep the camera above the ground */
		var gh = hAt(camPos.x, camPos.z) + 0.6; if (camPos.y < gh) camPos.y = gh;
		camera.position.copy(camPos);
		if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.6; camera.position.y += (Math.random() - 0.5) * shake * 0.6; shake = Math.max(0, shake - dt * 2.5); }
		camera.lookAt(look); camSnap = false;
	}
	/* plane cameras: the chase camera sits behind the plane along its (smoothed) nose direction, so it follows climbs, dives and
	   loops; the horizon stays level until the nose points nearly straight up or down, then the camera rolls with the plane so it
	   never flips. Cockpit = the pilot's seat, rolling with the plane. */
	var pcF = null, pcOff = null;
	function planeCamera(c, t, cq, mode, dt) {
		var A = c.d.fly, f = new THREE.Vector3(0, 0, 1).applyQuaternion(cq), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cq);
		if (mode === "hood") {
			var eye = new THREE.Vector3(A.eye[0], A.eye[1], A.eye[2]).applyQuaternion(cq).add(t);
			var lk = new THREE.Vector3(Math.sin(free.yaw) * 10, -0.6 + free.pitch * 10, Math.cos(free.yaw) * 10).applyQuaternion(cq).add(eye);
			camera.position.copy(eye); camera.up.copy(u); camera.lookAt(lk); camera.fov = 72 * free.zoom; camera.updateProjectionMatrix(); camSnap = false; return;
		}
		if (!pcF || camSnap) pcF = f.clone(); else pcF.lerp(f, 1 - Math.exp(-dt * 3.5)).normalize();
		var dir = pcF.clone(); if (free.yaw) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), free.yaw);
		var size = Math.max(c.d.l, A.b * 0.85), far = mode === "far", dist = (far ? 2.4 : 1.3) * size * free.zoom + 3, hgt = (far ? 0.55 : 0.3) * size + 1.2 + free.pitch * dist;
		var off = dir.clone().multiplyScalar(-dist); off.y += hgt;
		if (!pcOff || camSnap) pcOff = off.clone(); else pcOff.lerp(off, 1 - Math.exp(-dt * 9));
		var pos = t.clone().add(pcOff), gh = hAt(pos.x, pos.z) + 0.8; if (pos.y < gh) pos.y = gh;
		camera.position.copy(pos);
		if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.8; camera.position.y += (Math.random() - 0.5) * shake * 0.8; shake = Math.max(0, shake - dt * 2.5); }
		var kk = Math.max(0, Math.min(1, (Math.abs(dir.y) - 0.6) / 0.35)), upv = new THREE.Vector3(0, 1, 0).multiplyScalar(1 - kk).addScaledVector(u, kk);
		if (upv.lengthSq() < 1e-4) upv.copy(u); camera.up.copy(upv.normalize());
		camera.fov = 62; camera.updateProjectionMatrix(); camera.lookAt(t.clone().addScaledVector(dir, 12).addScaledVector(u, 1.2)); camSnap = false; /* aim a little ahead of the plane so more sky and horizon show */
	}
	function setupCamDrag() {
		var cv = renderer.domElement, ptr = {}, moved = 0;
		cv.addEventListener("pointerdown", function (e) { ptr[e.pointerId] = [e.clientX, e.clientY]; moved = 0; camHeld = true; camBack = false; kbActive = true; cv.focus({ preventScroll: true }); initAudio(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
		cv.addEventListener("pointermove", function (e) {
			var p = ptr[e.pointerId]; if (!p) return; var ids = Object.keys(ptr);
			if (ids.length === 2) { var a = ptr[ids[0]], b = ptr[ids[1]], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); ptr[e.pointerId] = [e.clientX, e.clientY]; a = ptr[ids[0]]; b = ptr[ids[1]]; var d1 = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d0 && d1) zoom(d0 / d1); return; }
			var dx = e.clientX - p[0], dy = e.clientY - p[1]; ptr[e.pointerId] = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy); if (moved < 4) return;
			if (S.cam === "orbit" || (replay && replay.cam === "orbit")) { orbit.yaw -= dx * 0.008; orbit.pitch = Math.max(-0.05, Math.min(1.4, orbit.pitch + dy * 0.006)); }
			else { free.yaw = C.wrap(free.yaw - dx * 0.006 * (S.cam === "hood" ? -0.8 : 1)); free.pitch = Math.max(-0.6, Math.min(1.2, free.pitch + dy * 0.004 * (S.cam === "hood" ? -1 : 1))); }
			camIdle = 0;
		});
		function up(e) { delete ptr[e.pointerId]; camHeld = Object.keys(ptr).length > 0; camIdle = 0; }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("wheel", function (e) { if (!e.ctrlKey && !view.classList.contains("mes-pfill") && !document.fullscreenElement) return; e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
		cv.addEventListener("dblclick", camReset);
	}
	function zoom(k) { free.zoom = Math.max(0.4, Math.min(3, free.zoom * k)); }
	/* "Behind the car": glide back to the normal view (also double-click / double-tap the picture). After you let go of a drag the
	   camera also drifts back behind by itself once the car is moving (1.6 s later), so you never have to orbit back by hand. */
	function camReset() { camBack = true; }
	function camBackNow() { free.yaw = free.pitch = 0; free.zoom = 1; camBack = false; orbit.yaw = camHead + Math.PI; orbit.pitch = 0.35; }
	function camEase(dt, sp) {
		camIdle += dt; var auto = !camHeld && camIdle > 1.6 && sp > 2.5 && (S.cam === "chase" || S.cam === "far" || S.cam === "hood" || S.cam === "side");
		if (camBack || auto) {
			var kb = 1 - Math.exp(-dt * (camBack ? 7 : 2.2));
			free.yaw += (0 - free.yaw) * kb; free.pitch += (0 - free.pitch) * kb;
			if (camBack) { free.zoom += (1 - free.zoom) * kb; if (S.cam === "orbit") { orbit.yaw += C.wrap(camHead + Math.PI - orbit.yaw) * kb; orbit.pitch += (0.35 - orbit.pitch) * kb; } }
			if (Math.abs(free.yaw) < 0.004 && Math.abs(free.pitch) < 0.004) { free.yaw = free.pitch = 0; if (camBack && Math.abs(free.zoom - 1) < 0.01 && (S.cam !== "orbit" || Math.abs(C.wrap(camHead + Math.PI - orbit.yaw)) < 0.01)) { free.zoom = 1; camBack = false; } }
		}
		var off = Math.abs(free.yaw) > 0.06 || Math.abs(free.pitch) > 0.06 || Math.abs(free.zoom - 1) > 0.06 || (S.cam === "orbit" && Math.abs(C.wrap(camHead + Math.PI - orbit.yaw)) > 0.3), b = $("cs-camreset");
		if (b.hidden === off) b.hidden = !off;
	}

	/* ===================== sound (Web Audio) ===================== */
	var ac = null, eng = null, noiseBuf = null;
	function initAudio() {
		if (ac || !S.sound) { if (ac && ac.state === "suspended") ac.resume(); return; }
		try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
		var o1 = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain(), master = ac.createGain();
		o1.type = "sawtooth"; o2.type = "square"; lp.type = "lowpass"; lp.frequency.value = 600; g.gain.value = 0; master.gain.value = 0.5;
		master.gain.value = 0.5 * S.vol; o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); master.connect(ac.destination); o1.start(); o2.start();
		eng = { o1: o1, o2: o2, lp: lp, g: g, master: master };
		noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	}
	function engineSound(c) {
		if (!eng || !ac) return;
		var on = S.sound && !paused && !replay && stageVisible() && !document.hidden;
		if (c.fly) { /* propeller drone or jet whine, following the throttle */
			var th = c.fly.dead ? 0 : c.fly.thr, jf = c.d.fly.jet ? 120 + th * 460 : 46 + th * 58;
			eng.o1.frequency.setTargetAtTime(jf, ac.currentTime, 0.12); eng.o2.frequency.setTargetAtTime(jf * (c.d.fly.jet ? 1.5 : 0.5), ac.currentTime, 0.12);
			eng.lp.frequency.setTargetAtTime(W.rho ? (c.d.fly.jet ? 900 + th * 2500 : 420 + th * 900) : 220, ac.currentTime, 0.1);
			eng.g.gain.setTargetAtTime(on ? (c.fly.dead ? 0 : 0.045 + th * 0.1) : 0, ac.currentTime, 0.15); return;
		}
		var v = Math.abs(c.veh.currentVehicleSpeed()), gearSpan = c.d.vmax / 5, ratio = (v % gearSpan) / gearSpan, gear = Math.min(5, Math.floor(v / gearSpan));
		var rpm = 0.25 + ratio * 0.75 * (gear ? 1 : 1.2) + (c.in.th && !c.anyContact ? 0.4 : 0);
		var base = c.d.mass > 5000 ? 32 : c.d.mass < 400 ? 70 : 45, f = base + rpm * base * 2.2;
		eng.o1.frequency.setTargetAtTime(f, ac.currentTime, 0.05); eng.o2.frequency.setTargetAtTime(f * 0.5, ac.currentTime, 0.05);
		eng.lp.frequency.setTargetAtTime(W.rho ? 380 + c.in.th * 900 : 220 + c.in.th * 300, ac.currentTime, 0.08); /* no air: you only hear it through the seat */
		eng.g.gain.setTargetAtTime(on ? (0.05 + c.in.th * 0.09 + (c.in.boost ? 0.04 : 0)) : 0, ac.currentTime, 0.1);
	}
	function sfx(kind, amt) {
		if (!ac || !S.sound || !noiseBuf) return; amt = amt == null ? 0.5 : amt;
		if (kind === "stall") { /* the stall warning horn: a short reedy beep */
			var so = ac.createOscillator(), sg = ac.createGain(), s0 = ac.currentTime; so.type = "square"; so.frequency.value = 880;
			sg.gain.setValueAtTime(0.0001, s0); sg.gain.exponentialRampToValueAtTime(0.09 * amt, s0 + 0.01); sg.gain.setValueAtTime(0.09 * amt, s0 + 0.18); sg.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.24);
			so.connect(sg); sg.connect(eng.master); so.start(s0); so.stop(s0 + 0.26); return;
		}
		if (kind === "boing" || kind === "boost") { /* a pitch sweep: a spring's boing / a whoosh up */
			var o = ac.createOscillator(), og = ac.createGain(), t0 = ac.currentTime, up = kind === "boost";
			o.type = up ? "sawtooth" : "sine"; o.frequency.setValueAtTime(up ? 180 : 120, t0); o.frequency.exponentialRampToValueAtTime(up ? 900 : 520, t0 + (up ? 0.35 : 0.12)); if (!up) o.frequency.exponentialRampToValueAtTime(180, t0 + 0.45);
			og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.18 * amt, t0 + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
			o.connect(og); og.connect(eng.master); o.start(t0); o.stop(t0 + 0.55); return;
		}
		var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), now = ac.currentTime;
		src.buffer = noiseBuf; src.playbackRate.value = kind === "glass" ? 1.6 : 1;
		f.type = kind === "glass" ? "highpass" : "lowpass"; f.frequency.value = { crash: 900, thud: 180, glass: 3000, splat: 500, pop: 1200 }[kind] || 800;
		var dur = { crash: 0.45, thud: 0.18, glass: 0.6, splat: 0.25, pop: 0.06, thunder: 2.6 }[kind] || 0.2;
		if (kind === "thunder") { f.frequency.value = 140; src.playbackRate.value = 0.5; src.loop = true; }
		g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.001, (kind === "pop" ? 0.15 : kind === "thunder" ? 0.9 : 0.55) * amt * (W.rho ? 1 : 0.35)), now + (kind === "thunder" ? 0.25 : 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
		src.connect(f); f.connect(g); g.connect(eng.master); src.start(now); src.stop(now + dur + 0.05);
	}
	function horn() {
		initAudio(); if (!ac) return; var now = ac.currentTime;
		[392, 494].forEach(function (fq) { var o = ac.createOscillator(), g = ac.createGain(); o.type = "square"; o.frequency.value = fq; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now + 0.02); g.gain.setValueAtTime(0.12, now + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45); o.connect(g); g.connect(eng.master); o.start(now); o.stop(now + 0.5); });
		if (!W.rho) toast("No air on " + W.name.replace(/ \(.*/, "") + ": nobody outside your car hears the horn");
	}

	/* ===================== gravity ===================== */
	function setGravity(g) {
		if (NET && !NET.host && !netApplying && NET.live) { updateGravityUI(); toast("In an online room the host sets the gravity"); return; }
		if (Math.abs(g - gravity) > 1e-6) lap.valid = false; /* a new gravity starts a new set of best laps */
		gravity = g; S.g = Math.abs(g - W.g) < 1e-6 ? null : g; save();
		phys.gravity = { x: 0, y: gFlip > 0 ? Math.abs(g) * 0.6 : -g, z: 0 };
		cars.forEach(function (c) { c.body.wakeUp(); setSuspForce(c); }); objs.forEach(function (o) { o.body.wakeUp(); });
		updateGravityUI(); netRoomChanged();
	}
	function flipGravity() {
		if (NET && NET.live && !NET.host) { toast("In an online room the host sets the gravity"); return; }
		if (gFlip > 0) { gFlip = 0; setGravity(gravity); return; }
		gFlip = 2.5; lap.valid = false; phys.gravity = { x: 0, y: Math.max(1.5, gravity) * 0.6, z: 0 };
		cars.forEach(function (c) { c.body.wakeUp(); }); objs.forEach(function (o) { o.body.wakeUp(); });
		toast("Gravity points UP for 2.5 seconds!"); updateGravityUI();
	}
	function updateGravityUI() {
		var g = gravity, nm = C.gName(g);
		$("cs-g").value = g <= 30 ? g : 30; $("cs-gnum").value = +g.toFixed(2);
		$("cs-gname").textContent = (nm ? nm + " · " : "") + (g / C.G0).toFixed(2) + " × Earth";
		document.querySelectorAll("#cs-gpre button").forEach(function (b) { b.setAttribute("aria-pressed", Math.abs(+b.dataset.g - g) < 0.005 ? "true" : "false"); });
		var st = C.stopDist(27.78, wx().grip, g), jp = C.jump(25, 0.35, g);
		$("cs-gfacts").textContent = g > 0 ? "At this gravity a car stopping from 100 km/h needs about " + C.fmtDist(st, S.units) + ", and a 90 km/h jump off a 20° ramp flies about " + C.fmtDist(jp.range, S.units) + " for " + jp.time.toFixed(1) + " s." : "Zero gravity: nothing pushes the tyres onto the ground, so there is no grip at all. Anything you bump floats away forever.";
		$("cs-hgrav").textContent = gFlip > 0 ? "↑ gravity!" : (nm || (g / C.G0).toFixed(2) + " g") + " · " + g.toFixed(2) + " m/s²";
	}

	/* ===================== HUD ===================== */
	var hudT = 0, toastT = null;
	function toast(t) { var el = $("cs-toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("show"); }, 2600); }
	function saveRec() { try { localStorage.setItem(RKEY, JSON.stringify(REC)); } catch (e) { /* ignore */ } }
	/* ---------- switching to / from a plane ---------- */
	function togglePlane(kind) {
		var c = cars[player], isP = !!(c && c.d.fly);
		if (kind) { if (isP && c.type === kind) return; if (!isP) S.lastCar = S.car || null; S.car = kind; }
		else if (isP) S.car = S.lastCar && !C.isPlane(S.lastCar) ? S.lastCar : null;
		else { S.lastCar = S.car || null; S.car = S.plane && C.isPlane(S.plane) ? S.plane : "plane"; }
		if (C.isPlane(S.car)) S.plane = S.car;
		save(); $("cs-car").value = S.car || ""; swapPlayerCar(); syncUrl();
		if (C.isPlane(S.car)) { planeHello(); fhelpShow(); } else { toast("Back in a car: " + C.CARS[cars[player].type].name); $("cs-fhelp").hidden = true; }
	}
	function easyOn() { return S.pEasy !== false; }
	/* easy flying only works where there is air and weight to fly against (not on the Moon / Ceres or at zero g) */
	function easyActive() { return easyOn() && W && W.rho > 0 && Math.abs(gravity) > 0.05; }
	function setPEasy(on, quiet) {
		S.pEasy = !!on; save(); root.classList.toggle("cs-peasy", easyActive());
		$("cs-peasy").setAttribute("aria-pressed", String(S.pEasy)); $("cs-preal").setAttribute("aria-pressed", String(!S.pEasy));
		var pm = $("cs-t-pmode"); if (pm) pm.innerHTML = (S.pEasy ? "Easy" : "Real") + "<small>flying</small>";
		$("cs-thrlab").textContent = easyActive() ? "SPEED" : "THR"; fhelpFill();
		var c = cars[player]; if (c && c.fly) { if (!S.pEasy) { c.fly.ap = null; c.fly.toff = false; } else if (c.fly.spd == null) c.fly.spd = 0.15; updatePlaneHud(c); }
		if (!quiet) toast(S.pEasy ? "Easy flying: the stick turns and climbs, let go = level flight" : "Realistic flying: elevator, ailerons, rudder, throttle and flaps are yours");
	}
	function fhelpFill() {
		var tch = root.classList.contains("cs-has-touch"), e = easyOn(), li;
		if (e) li = tch ? ["Tap <b>🛫 Take off</b> (or push the stick up): the plane speeds down the runway and lifts off by itself", "<b>Stick left / right</b> = turn, <b>up / down</b> = climb / dive", "<b>Let go</b> and it flies level, holding its height. It won't stall", "<b>SPEED</b> slider = how fast it cruises", "To land: line up with the runway and dive gently; it flares by itself and brakes when the wheels touch", "↺ Reset in the air = wings level"]
			: ["Hold <b>W</b> (or ↑) on the runway: it speeds up and lifts off by itself", "<b>A</b> / <b>D</b> = turn, <b>W</b> / <b>S</b> = climb / dive", "<b>Let go</b> and it flies level, holding its height. It won't stall", "<b>Shift</b> / <b>Z</b> = faster / slower", "To land: line up with the runway and dive gently; it flares by itself and brakes when the wheels touch", "<b>R</b> in the air = wings level · <b>T</b> = back to the runway"];
		else li = tch ? ["Throttle up (THR slider), flaps T/O, and at lift-off speed pull the stick down (back) gently", "Stick = elevator and ailerons, ◀ ▶ = rudder", "Too slow or too steep and the wing stalls", "Land at under 2.5 m/s sink rate"]
			: ["Flaps T/O (<b>V</b>), full throttle (hold <b>Shift</b>), at lift-off speed pull back (<b>S</b>)", "<b>W</b> / <b>S</b> = nose down / up, <b>A</b> / <b>D</b> = roll, <b>Q</b> / <b>E</b> = rudder, <b>Z</b> = less throttle", "Too slow or too steep and the wing stalls", "Land at under 2.5 m/s sink rate"];
		$("cs-fhtitle").textContent = e ? "Easy flying" : "Realistic flying";
		$("cs-fhlist").innerHTML = li.map(function (x) { return "<li>" + x + "</li>"; }).join("");
		$("cs-fhmode").textContent = e ? "Switch to realistic" : "Switch to easy";
	}
	function fhelpShow(force) { if (!force && S.fhelpSeen) return; fhelpFill(); $("cs-fhelp").hidden = false; $("cs-help").hidden = true; }
	function planeHello() {
		var c = cars[player]; if (!c || !c.d.fly) return;
		toast(!W.rho ? "✈ " + c.d.name + " on " + W.name.replace(/ \(.*/, "") + ": no air here, so it can't fly. Watch the note at the bottom." : easyOn() ? "✈ " + c.d.name + ": " + (root.classList.contains("cs-has-touch") ? "tap 🛫 Take off" : "hold W to take off") : "✈ " + c.d.name + ": hold Shift for full throttle, pull back (S) at about " + C.fmtSpeed(C.stallSpeed(c.d.fly, c.d.mass, Math.abs(gravity), W.rho, 1) * 1.1, S.units));
	}
	/* a fresh plane 150 m up, already flying, over the runway (or the middle of the world) */
	function airStart() {
		var c = cars[player], type = c && c.d.fly ? c.type : S.plane && C.isPlane(S.plane) ? S.plane : "plane", A = C.CARS[type].fly;
		var st = planeStart(), y = hAt(st.x, st.z) + 150, v = W.rho ? Math.max(A.vRot * 1.7, C.stallSpeed(A, C.CARS[type].mass, Math.abs(gravity), W.rho, 0) * 1.4) : A.vRot;
		if (!c.d.fly) { S.lastCar = S.car || null; S.car = type; S.plane = type; save(); $("cs-car").value = type; syncUrl(); }
		var nc = makeCar(type, null, { x: st.x, z: st.z, yaw: st.yaw, y: y, v: v, thr: 0.75 }, true);
		removeCar(c); cars[player] = nc; nc.id = player; camSnap = true; lapReset(); ghostKey = ""; updateHud(true);
		toast("☁ Flying at 150 m · " + C.fmtSpeed(v, S.units) + (W.rho ? "" : " · no air: it just falls"));
	}
	/* what the wings can do here, as a one-line lesson under the flight HUD */
	var lessonKey = "";
	function planeLesson(c) {
		var A = c.d.fly, rho = W.rho, g = Math.abs(gravity), m = c.d.mass, nm = W.name.replace(/ \(.*/, "").replace(/^The /, "the "), f = c.fly.flap, k = [S.world, c.type, g.toFixed(2), f, S.units].join("|");
		if (k === lessonKey) return null; lessonKey = k;
		var fs = function (v) { return C.fmtSpeed(v, S.units); };
		if (!(rho > 0)) return "No air on " + nm + ": the wings make no lift and the elevator, ailerons and rudder push on nothing, so it can only roll along (a real engine would need air too; this one keeps pushing). A launch pad 🚀 can throw it.";
		if (g < 0.05) return "Zero gravity: there is no weight to hold up, so any speed is flying speed.";
		var vs = C.stallSpeed(A, m, g, rho, f), top = C.topSpeed(A, m, g, rho), air = rho < 0.5 ? "Thin air (" + (rho / C.AIR_EARTH * 100).toFixed(1) + "% of Earth's): " : "";
		if (!top) return "Too heavy for these wings: at " + (g / 9.81).toFixed(1) + " × Earth's gravity it needs over " + fs(vs) + " to fly and the engine can't push it that fast. Lower gravity, or take the stunt jet.";
		if (rho < 0.5) return air + "it would need about " + fs(vs * 1.1) + " to lift off, a very long run; real Mars aircraft use huge, very light wings or spinning rotors (Ingenuity).";
		return "Lift-off ≈ " + fs(vs * 1.1) + " · stall " + fs(vs) + " with these flaps · top speed ≈ " + fs(top);
	}
	var ahiCtx = null;
	function drawHorizon(c) {
		var cv = $("cs-ahi"); if (!cv || !c.d.fly) return; var g = ahiCtx || (ahiCtx = cv.getContext("2d")), W2 = cv.width, R = W2 / 2;
		var ip = ipose(c), f = new THREE.Vector3(0, 0, 1).applyQuaternion(ip.q), u = new THREE.Vector3(0, 1, 0).applyQuaternion(ip.q), at = C.attitude(f, u), pp = R / 0.6; /* pixels per radian: ±35 degrees fills the dial */
		g.save(); g.clearRect(0, 0, W2, W2); g.beginPath(); g.arc(R, R, R, 0, 7); g.clip(); g.translate(R, R); g.rotate(-at.bank);
		var y0 = at.pitch * pp; g.fillStyle = "#3b8fe0"; g.fillRect(-W2, -W2 * 2 + y0, W2 * 2, W2 * 2); g.fillStyle = "#8a5a2b"; g.fillRect(-W2, y0, W2 * 2, W2 * 2);
		g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.moveTo(-W2, y0); g.lineTo(W2, y0); g.stroke();
		g.lineWidth = 1; g.font = "9px sans-serif"; g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle";
		for (var d = -30; d <= 30; d += 10) { if (!d) continue; var yy = y0 - d * Math.PI / 180 * pp, wl = d % 20 ? 10 : 18; g.beginPath(); g.moveTo(-wl, yy); g.lineTo(wl, yy); g.stroke(); g.fillText(String(Math.abs(d)), wl + 2, yy); }
		g.restore(); g.save(); g.translate(R, R);
		g.strokeStyle = "#ffd43b"; g.lineWidth = 3; g.beginPath(); g.moveTo(-R * 0.6, 0); g.lineTo(-R * 0.18, 0); g.lineTo(-R * 0.08, R * 0.1); g.moveTo(R * 0.6, 0); g.lineTo(R * 0.18, 0); g.lineTo(R * 0.08, R * 0.1); g.stroke();
		g.fillStyle = "#ffd43b"; g.beginPath(); g.arc(0, 0, 2.5, 0, 7); g.fill();
		g.rotate(-at.bank); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(0, -R + 3); g.lineTo(-5, -R + 12); g.lineTo(5, -R + 12); g.closePath(); g.fill(); g.restore();
		g.save(); g.translate(R, R); g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 2; [-60, -30, -20, -10, 0, 10, 20, 30, 60].forEach(function (b) { var a = b * Math.PI / 180 - Math.PI / 2, r1 = R - 1, r2 = R - (b % 30 ? 5 : 9); g.beginPath(); g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); g.stroke(); }); g.restore();
	}
	var stallBeepT = 0;
	function updatePlaneHud(c) {
		var F = c.fly, A = c.d.fly, o = F.o || { V: 0, alpha: 0, stall: 0 }, t = c.body.translation(), lv = c.body.linvel(), agl = planeAgl(c, t), us = S.units === "mph";
		$("cs-fias").textContent = W.rho ? C.fmtSpeed(o.V, S.units) + (us ? "" : " · " + Math.round(o.V * 1.943844) + " kt") : "no air";
		$("cs-falt").textContent = us ? Math.round(agl * 3.28084) + " ft" : (agl < 10 ? agl.toFixed(1) : Math.round(agl)) + " m";
		$("cs-fvs").textContent = (lv.y >= 0 ? "+" : "−") + (us ? Math.round(Math.abs(lv.y) * 196.85) + " ft/min" : Math.abs(lv.y).toFixed(1) + " m/s");
		var ez = easyActive(); root.classList.toggle("cs-peasy", ez); if ($("cs-thrlab").textContent !== (ez ? "SPEED" : "THR")) $("cs-thrlab").textContent = ez ? "SPEED" : "THR";
		$("cs-fthr").style.width = Math.round(F.thr * 100) + "%"; $("cs-fthrn").textContent = (F.dead ? "dead " : "") + Math.round(F.thr * 100) + "%" + (ez ? " auto" : "");
		root.classList.toggle("cs-pground", !!c.anyContact && !F.toff && ez);
		$("cs-fflap").textContent = ["Up", "T/O", "Landing"][F.flap]; $("cs-fbrk").textContent = F.brk ? "· BRAKES" : "";
		var aLim = A.aS + A.flap[F.flap][2], warn = W.rho > 0 && !c.anyContact && agl > 2 && (o.stall > 0.05 || (o.alpha > aLim - 0.035 && o.V > 3));
		$("cs-fstall").hidden = !warn;
		if (warn) { stallBeepT -= 0.1; if (stallBeepT <= 0) { stallBeepT = 0.5; sfx("stall", 0.7); } } else stallBeepT = 0;
		var les = planeLesson(c); if (les != null) $("cs-flesson").textContent = les;
		var tv = $("cs-thrfill"), tval = ez ? (F.spd == null ? 0.15 : F.spd) : F.thr; if (tv) { tv.style.height = Math.round(tval * 100) + "%"; $("cs-thrn").textContent = Math.round(tval * 100) + "%"; $("cs-thr").setAttribute("aria-valuenow", String(Math.round(tval * 100))); }
	}
	function syncPlaneTouch() { var c = cars[player]; if (c && c.fly) $("cs-t-flapn").textContent = ["Up", "T/O", "Land"][c.fly.flap]; }
	function updateHud(force) {
		var c = cars[player]; if (!c) return;
		var v = c.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
		if (sp > REC.top && sp < 400) { REC.top = sp; if (sp > 5 && (force || Math.random() < 0.05)) saveRec(); }
		$("cs-speed").textContent = S.units === "mph" ? Math.round(sp * 2.236936) : Math.round(sp * 3.6);
		$("cs-sunit").textContent = S.units === "mph" ? "mph" : "km/h";
		$("cs-hg").textContent = c.gS.toFixed(1) + " g";
		$("cs-hpeak").textContent = c.gPeak.toFixed(1) + " g";
		$("cs-dmg").style.width = c.damage + "%"; $("cs-dmg").style.background = c.damage > 75 ? "#e03131" : c.damage > 40 ? "#f08c00" : "#37b24d";
		$("cs-hdmg").textContent = Math.round(c.damage) + "%";
		$("cs-hcar").textContent = C.CARS[c.type].name + (cars.length > 1 ? " (" + (player + 1) + "/" + cars.length + ")" : "");
		var flying = !!c.d.fly; root.classList.toggle("cs-flying", flying); $("cs-fhud").hidden = !flying; $("cs-prow").hidden = !flying;
		if (flying) { updatePlaneHud(c); syncPlaneTouch(); } else lessonKey = "";
		var pf = C.PLANE_ORDER.map(function (k) { var P = C.CARS[k], vs = C.stallSpeed(P.fly, P.mass, Math.abs(gravity), W.rho, 1); return P.name + ": " + (W.rho > 0 && Math.abs(gravity) > 0.05 ? (C.topSpeed(P.fly, P.mass, Math.abs(gravity), W.rho) ? "lifts off at about " + C.fmtSpeed(vs * 1.1, S.units) + " here" : "too heavy to fly at this gravity") : !W.rho ? "can't fly: no air" : "floats: no gravity"); }).join(" · ");
		if ($("cs-pfacts").textContent !== pf) $("cs-pfacts").textContent = pf;
		$("cs-pname").textContent = flying ? c.d.name : "";
		var lb = $("cs-lap"); lb.hidden = !hasLap(); ghostLoad();
		if (hasLap()) {
			var best = REC.laps[lapKey()];
			$("cs-lapnow").textContent = lap.t0 != null && lap.valid ? "Lap " + (lap.laps + 1) + " · " + C.fmtLap(simT - lap.t0) : (lap.t0 != null ? "Lap not counted · cross the line again" : "Cross the start line to start the timer");
			$("cs-lapbest").textContent = "Last " + C.fmtLap(lap.last && lap.last.time) + " · Best " + C.fmtLap(best && best.time);
		}
		$("cs-air").textContent = c.air ? "In the air " + (simT - c.air.t0).toFixed(1) + " s" : "";
		var bl = REC.laps[lapKey()];
		$("cs-rec").textContent = (hasLap() ? "Best lap here (" + C.CARS[c.type].name + ", " + gravity.toFixed(2) + " m/s²): " + C.fmtLap(bl && bl.time) + " · " : "") + "Top " + C.fmtSpeed(REC.top, S.units) + " · longest jump " + C.fmtDist(REC.jump, S.units) + " · most air " + REC.air.toFixed(1) + " s · biggest crash " + REC.crash.toFixed(0) + " g" + (REC.stunt ? " · best stunt: " + REC.stunt : "") + (REC.flight ? " · longest flight " + C.fmtLap(REC.flight) + ", highest " + C.fmtDist(REC.alt || 0, S.units) + (REC.landing != null ? ", softest landing " + REC.landing.toFixed(1) + " m/s" : "") : "");
	}

	/* ===================== main loop ===================== */
	var todSave = 3, acc = 0, lastFrame = 0, frames = 0, mmT = 0, frameDt = 1 / 60;
	function frame(now) {
		requestAnimationFrame(frame);
		if (!phys) return;
		var dt = Math.min(0.1, (now - (lastFrame || now)) / 1000); lastFrame = now; frameDt = dt;
		var vis = !document.hidden && stageOnScreen();
		if (!vis) return;
		advance(dt);
		if (edOpen) return;
		render();
		mmT -= dt; if (mmT <= 0) { mmT = 1 / 30; drawMini(); }
	}
	function advance(dt) {
		if (S.cycle && !paused && !replay) { S.tod = (S.tod + dt * S.speed * 24 / (S.cycleMin * 60)) % 24; applyTime(); todSave -= dt; if (todSave < 0) { todSave = 3; save(); } }
		stepWeather(paused && !replay ? 0 : dt * S.speed * (replay ? replay.speed * (replay.playing ? 1 : 0) : 1)); rainSound();
		if (edOpen) { drawEditor(); return; }
		if (replay) { replayAdvance(dt); if (skyGroup) skyGroup.position.copy(camera.position); headlights(); return; }
		if (!paused) {
			acc += dt * S.speed;
			/* heavy gravity makes the (gravity-scaled) springs stiff: take smaller physics steps so they stay stable (Sun: 6 a tick) */
			var sub = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(Math.abs(gravity) / 9.81)))), sdt = 1 / 60 / sub;
			phys.timestep = sdt;
			var nMax = Math.ceil(4 * Math.max(1, S.speed)), n = 0; while (acc >= 1 / 60 && n < nMax) { keepPrev(); for (var si = 0; si < sub; si++) { subLast = si === sub - 1; step(sdt); simT += sdt; } acc -= 1 / 60; n++; }
			if (n >= nMax) acc = 0;
			if (gFlip > 0) { gFlip -= dt; if (gFlip <= 0) { gFlip = 0; setGravity(gravity); toast("Gravity is back"); } }
		}
		parts.step(paused ? 0 : dt * S.speed);
		syncMeshes(); updateCamera(dt);
		if (cars[player] && cars[player].fly && S.show.info !== false) drawHorizon(cars[player]);
		hudT -= dt; if (hudT < 0) { hudT = 0.1; updateHud(); }
		if (cars[player]) engineSound(cars[player]);
	}
	/* Physics runs in fixed 1/60 s ticks but frames come at the screen's rate (120 Hz on ProMotion screens, and rAF timing wobbles),
	   so a frame gets 0, 1 or 2 ticks: at speed the car jumped unevenly while the camera followed smoothly = the picture shook.
	   Each frame now draws every body part of the way from its pose before the last tick to its pose after it (alpha = acc * 60). */
	function keepPrev() {
		function k(o) { var t = o.body.translation(), r = o.body.rotation(); if (!o.pv) o.pv = { t: new THREE.Vector3(), q: new THREE.Quaternion() }; o.pv.t.set(t.x, t.y, t.z); o.pv.q.set(r.x, r.y, r.z, r.w); o.pv.ok = true; }
		cars.forEach(k); objs.forEach(k);
	}
	var ipT = null, ipQ = null;
	function ipose(o) {
		if (!ipT) { ipT = new THREE.Vector3(); ipQ = new THREE.Quaternion(); }
		var t = o.body.translation(), r = o.body.rotation(); ipT.set(t.x, t.y, t.z); ipQ.set(r.x, r.y, r.z, r.w);
		var a = paused ? 1 : Math.max(0, Math.min(1, acc * 60));
		if (o.pv && o.pv.ok && a < 1 && o.pv.t.distanceToSquared(ipT) < 100) { ipT.lerpVectors(o.pv.t, ipT, a); ipQ.slerpQuaternions(o.pv.q, ipQ, a); }
		return { t: ipT, q: ipQ };
	}
	function stageOnScreen() { var r = stage.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
	function syncMeshes() {
		cars.forEach(function (c) {
			var ip = ipose(c); c.group.position.copy(ip.t); c.group.quaternion.copy(ip.q);
			for (var i = 0; i < 4; i++) {
				var w = c.wheels[i], sl = c.veh.wheelSuspensionLength(i), cp = c.veh.wheelChassisConnectionPointCs(i);
				if (sl == null || !cp) continue;
				w.piv.position.set(cp.x, cp.y - sl, cp.z); w.piv.rotation.y = c.veh.wheelSteering(i) || 0; w.spin.rotation.x = c.veh.wheelRotation(i) || 0;
			}
			if (c.surf && c.fly) { /* control surfaces follow the controls; the propeller turns with the throttle (or windmills in the airflow) */
				var Fp = c.fly, su = c.surf, fa = [0, 0.18, 0.5][Fp.flap];
				su.ailL.rotation.x = -Fp.ail * 0.35; su.ailR.rotation.x = Fp.ail * 0.35; su.elev.rotation.x = Fp.elev * 0.4; su.rud.rotation.y = Fp.rud * 0.4;
				su.flapL.rotation.x = su.flapR.rotation.x = su.flapL.rotation.x + (-fa - su.flapL.rotation.x) * 0.08;
				if (su.prop) { var rps = Fp.dead ? (Fp.o ? Fp.o.V * 0.15 : 0) : 6 + Fp.thr * 40; su.prop.rotation.z += rps * frameDt * (paused ? 0 : 1); var blur = !Fp.dead && Fp.thr > 0.25; su.disc.material.opacity = blur ? 0.16 : 0; su.blades.forEach(function (b) { b.visible = !blur; }); }
			}
		});
		objs.forEach(function (o) { var ip = ipose(o); o.mesh.position.copy(ip.t); o.mesh.quaternion.copy(ip.q); });
		if (ghostMesh) {
			var gp = S.show.ghost !== false && lap.t0 != null && lap.valid ? C.ghostPose(ghost, simT - lap.t0) : null;
			ghostMesh.visible = !!gp; if (gp) { ghostMesh.position.set(gp.x, gp.y, gp.z); ghostMesh.quaternion.set(gp.q[0], gp.q[1], gp.q[2], gp.q[3]); }
		}
		var c = cars[player];
		if (c && sunLight.userData.dir) { var t2 = c.body.translation(); sunLight.target.position.set(t2.x, t2.y, t2.z); sunLight.position.set(t2.x, t2.y, t2.z).addScaledVector(sunLight.userData.dir, 150); }
		if (skyGroup) skyGroup.position.copy(camera.position);
		netSync();
		headlights();
	}
	function render() { renderer.render(scene, camera); }
	function togglePause() { paused = !paused; $("cs-pause").textContent = paused ? "▶ Play" : "❚❚ Pause"; toast(paused ? "Paused" : "Playing"); }
	function switchCar(dir) {
		if (cars.length < 2) { toast("Add computer cars to switch between them"); return; }
		cars[player].ai = true; player = (player + dir + cars.length) % cars.length; cars[player].ai = false; camSnap = true; lapReset(); ghostKey = "";
		toast("Now driving: " + C.CARS[cars[player].type].name);
	}

	/* ===================== UI wiring ===================== */
	function opt(sel, list, val) { sel.innerHTML = list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? " selected" : "") + ">" + o[1] + "</option>"; }).join(""); }
	function rpToggle() { if (!replay) return; if (!replay.playing && replay.t >= replay.len - 0.01) replay.t = 0; replay.playing = !replay.playing; $("cs-rpplay").textContent = replay.playing ? "❚❚" : "▶"; }
	function setSound(on) { S.sound = !!on; save(); if (S.sound) initAudio(); else if (eng) eng.g.gain.value = 0; syncSoundUI(); }
	function setVolume(v) { S.vol = Math.max(0, Math.min(1, v)); save(); if (eng) eng.master.gain.setTargetAtTime(0.5 * S.vol, ac.currentTime, 0.03); if (S.vol > 0 && !S.sound) { S.sound = true; initAudio(); } syncSoundUI(); }
	function syncSoundUI() {
		root.querySelectorAll("[data-snd]").forEach(function (b) { b.checked = !!S.sound; });
		root.querySelectorAll("[data-vol]").forEach(function (b) { if (document.activeElement !== b) b.value = Math.round(S.vol * 100); });
		root.querySelectorAll("[data-volnum]").forEach(function (b) { b.textContent = Math.round(S.vol * 100) + "%"; });
		var m = $("cs-mute"); m.textContent = !S.sound || S.vol === 0 ? "🔇" : S.vol < 0.4 ? "🔉" : "🔊"; m.setAttribute("aria-pressed", String(!S.sound));
	}
	function applyShow() {
		["info", "lap", "speed", "msg"].forEach(function (k) { root.classList.toggle("cs-hide-" + k, S.show[k] === false); });
		if ($("cs-mm")) applyMini();
		root.querySelectorAll("[data-show]").forEach(function (b) { b.checked = S.show[b.dataset.show] !== false; });
		var hud = root.querySelector(".cs-hud"); if (hud) hud.hidden = S.show.info === false && (S.show.lap === false || !(W && W.track));
	}
	function setupUI() {
		opt($("cs-world"), C.WORLD_ORDER.map(function (w) { return [w, C.WORLDS[w].name]; }), S.world);
		var og = function (lab, ks) { return '<optgroup label="' + lab + '">' + ks.map(function (k) { return '<option value="' + k + '">' + C.CARS[k].name + "</option>"; }).join("") + "</optgroup>"; };
		$("cs-car").innerHTML = '<option value="">Best for this world</option>' + og("Cars", C.CAR_ORDER) + og("Aircraft ✈", C.PLANE_ORDER); $("cs-car").value = S.car || "";
		opt($("cs-cam"), CAMS, S.cam);
		function wxOpts() { opt($("cs-wx"), Object.keys(C.WEATHER).map(function (k) { return [k, C.WEATHER[k].icon + " " + C.WEATHER[k].name]; }), C.weatherFor(S.world).indexOf(S.weather) >= 0 ? S.weather : "clear"); Array.prototype.forEach.call($("cs-wx").options, function (o) { o.disabled = C.weatherFor(S.world).indexOf(o.value) < 0; }); }
		wxOpts(); $("cs-world").addEventListener("change", wxOpts);
		$("cs-wx").addEventListener("change", function () { setWeather(this.value); });
		$("cs-wdesc").textContent = C.WORLDS[S.world].desc;
		$("cs-world").addEventListener("change", function () { if (NET && NET.live && !NET.host) { this.value = S.world; toast("In an online room the host picks the world"); return; } S.world = this.value; S.g = null; S.car = null; $("cs-car").value = ""; save(); $("cs-wdesc").textContent = C.WORLDS[S.world].desc; buildWorld(); syncUrl(); });
		$("cs-car").addEventListener("change", function () { var v = this.value || null; if (C.isPlane(v)) { togglePlane(v); this.blur(); return; } S.car = v; if (v) S.lastCar = v; save(); swapPlayerCar(); syncUrl(); });
		$("cs-fly").addEventListener("click", function () { togglePlane("plane"); }); $("cs-flyjet").addEventListener("click", function () { togglePlane("jet"); });
		$("cs-backcar").addEventListener("click", function () { if (cars[player].d.fly) togglePlane(); });
		$("cs-runway").addEventListener("click", function () { var c = cars[player]; if (!c.d.fly) return; if (!W.track) { toast("Only the test-track worlds have a runway: any long flat road works too"); return; } resetCar(c, false); camSnap = true; toast(easyActive() ? "🛫 On the runway: " + (root.classList.contains("cs-has-touch") ? "tap Take off" : "hold W to take off") : "🛫 On the runway: flaps T/O, full throttle (Shift), pull back (S) at lift-off speed"); });
		$("cs-airstart").addEventListener("click", function () { airStart(); fhelpShow(); });
		$("cs-peasy").addEventListener("click", function () { setPEasy(true); }); $("cs-preal").addEventListener("click", function () { setPEasy(false); });
		$("cs-phow").addEventListener("click", function () { fhelpShow(true); });
		$("cs-fhok").addEventListener("click", function () { $("cs-fhelp").hidden = true; S.fhelpSeen = true; save(); });
		$("cs-fhelpx").addEventListener("click", function () { $("cs-fhelp").hidden = true; S.fhelpSeen = true; save(); });
		$("cs-fhmode").addEventListener("click", function () { setPEasy(!easyOn()); });
		$("cs-pinv").checked = !!S.pinv; $("cs-pinv").addEventListener("change", function () { S.pinv = this.checked; save(); });
		$("cs-cam").addEventListener("change", function () { S.cam = this.value; camSnap = true; camBackNow(); save(); });
		$("cs-camreset").addEventListener("click", camReset);
		var sw = $("cs-paint"); sw.innerHTML = C.PAINT.map(function (c) { return '<button type="button" style="background:' + c + '" data-c="' + c + '" aria-label="Paint ' + c + '"></button>'; }).join("");
		sw.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.color = b.dataset.c; save(); var c = cars[player]; c.color = S.color; c.paint.color.set(S.color); });
		/* gravity */
		$("cs-gpre").innerHTML = C.GRAVITY.map(function (p) { return '<button type="button" data-g="' + p[1] + '">' + p[0] + "</button>"; }).join("");
		$("cs-gpre").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; setGravity(+b.dataset.g); syncUrl(); if (+b.dataset.g > 100) toast("Sun gravity: 28 times Earth. The springs give up."); });
		$("cs-g").addEventListener("input", function () { setGravity(+this.value); });
		$("cs-g").addEventListener("change", syncUrl);
		$("cs-gnum").addEventListener("change", function () { var g = Math.max(0, Math.min(300, +this.value || 0)); setGravity(g); syncUrl(); });
		$("cs-flip").addEventListener("click", flipGravity);
		/* traffic */
		/* the same car controls in the panel and in the 🚗 Cars pop-up on the picture stay in step */
		function trafficUI() { $("cs-traffic").value = S.traffic; $("cs-tnum").textContent = S.traffic; $("cs-ctraffic").value = S.traffic; $("cs-ctnum").textContent = S.traffic; $("cs-ai").value = S.ai; root.querySelectorAll("#cs-cai [data-ai]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.ai === S.ai)); }); }
		function setTrafficN(n) { n = Math.max(0, Math.min(12, n | 0)); if (n === S.traffic && cars.length - 1 === n) return; S.traffic = n; setTraffic(n); save(); trafficUI(); }
		function setAi(v) { S.ai = v; save(); syncUrl(); trafficUI(); toast(v === "chase" ? "💥 Demolition derby: they are coming for you" + (S.traffic ? "" : " (add some cars)") : v === "park" ? "🅿 Computer cars parked" : "🛣 Computer cars drive around the track"); }
		opt($("cs-ai"), [["cruise", "Drive around"], ["chase", "Chase and ram me (derby)"], ["park", "Parked"]], S.ai);
		trafficUI();
		$("cs-traffic").addEventListener("input", function () { setTrafficN(+this.value); });
		$("cs-ctraffic").addEventListener("input", function () { setTrafficN(+this.value); });
		$("cs-traffic").addEventListener("change", syncUrl); $("cs-ctraffic").addEventListener("change", syncUrl);
		root.querySelectorAll("[data-cstep]").forEach(function (b) { b.addEventListener("click", function () { setTrafficN(S.traffic + +b.dataset.cstep); syncUrl(); toast(S.traffic ? S.traffic + " computer car" + (S.traffic > 1 ? "s" : "") : "No computer cars"); }); });
		$("cs-ai").addEventListener("change", function () { setAi(this.value); });
		$("cs-cai").addEventListener("click", function (e) { var b = e.target.closest("[data-ai]"); if (b) setAi(b.dataset.ai); });
		$("cs-carsbtn").addEventListener("click", function () { var p = $("cs-cpop"); p.hidden = !p.hidden; this.setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) { $("cs-pop").hidden = true; trafficUI(); } });
		$("cs-cpopx").addEventListener("click", function () { $("cs-cpop").hidden = true; $("cs-carsbtn").setAttribute("aria-expanded", "false"); });
		$("cs-cswitch").addEventListener("click", function () { switchCar(1); });
		$("cs-switch").addEventListener("click", function () { switchCar(1); });
		/* objects */
		$("cs-objs").innerHTML = C.OBJ_ORDER.map(function (k) { var o = C.OBJECTS[k]; return '<button type="button" data-k="' + k + '"><span aria-hidden="true">' + o.icon + "</span> " + o.name + "</button>"; }).join("");
		$("cs-objs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) spawnKind(b.dataset.k); });
		$("cs-lays").innerHTML = Object.keys(C.LAYOUTS).map(function (k) { var o = C.LAYOUTS[k]; return '<button type="button" data-k="' + k + '"><span aria-hidden="true">' + o.icon + "</span> " + o.name + "</button>"; }).join("");
		$("cs-lays").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) spawnLayout(b.dataset.k); });
		$("cs-clear").addEventListener("click", function () { clearObjs(); toast("Objects cleared"); });
		/* car actions */
		$("cs-reset").addEventListener("click", playerReset); $("cs-sreset").addEventListener("click", playerReset); $("cs-unflip").addEventListener("click", playerReset);
		$("cs-start").addEventListener("click", restartAll); $("cs-restart").addEventListener("click", restartAll); $("cs-srepair").addEventListener("click", repairHere);
		$("cs-repair").addEventListener("click", function () { cars.forEach(repair); toast("All cars repaired"); });
		$("cs-pause").addEventListener("click", togglePause);
		/* sound + what to show: the same controls on the picture (⚙) and in the panel stay in step */
		root.addEventListener("change", function (e) {
			var t = e.target;
			if (t.matches("[data-snd]")) setSound(t.checked);
			else if (t.matches("[data-show]")) { S.show[t.dataset.show] = t.checked; save(); applyShow(); }
		});
		root.addEventListener("input", function (e) { if (e.target.matches("[data-vol]")) setVolume(+e.target.value / 100); });
		$("cs-mute").addEventListener("click", function () { setSound(!S.sound); toast(S.sound ? "Sound on" : "Sound off"); });
		$("cs-optbtn").addEventListener("click", function () { var p = $("cs-pop"); p.hidden = !p.hidden; this.setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) $("cs-cpop").hidden = true; });
		$("cs-popx").addEventListener("click", function () { $("cs-pop").hidden = true; $("cs-optbtn").setAttribute("aria-expanded", "false"); });
		applyShow(); syncSoundUI();
		$("cs-rpbtn").addEventListener("click", replayStart);
		$("cs-night").addEventListener("click", function () { setNight(dayK >= 0.45); });
		root.addEventListener("input", function (e) { if (e.target.matches("[data-tod]")) setTod(+e.target.value, true); });
		root.addEventListener("change", function (e) { if (e.target.matches("[data-tod]")) { save(); syncUrl(); } else if (e.target.matches("[data-cyspd]")) { S.cycleMin = +e.target.value; save(); todUI(); } });
		root.addEventListener("click", function (e) { var b = e.target.closest("[data-cycle]"); if (b) { S.cycle = !S.cycle; save(); todUI(); toast(S.cycle ? "The day is running: one day = " + C.CYCLES.find(function (x) { return x[0] === S.cycleMin; })[1] : "Clock stopped at " + C.fmtTime(S.tod)); } });
		root.querySelectorAll("[data-cyspd]").forEach(function (sel) { sel.innerHTML = C.CYCLES.map(function (x) { return '<option value="' + x[0] + '">1 day = ' + x[1] + "</option>"; }).join(""); });
		$("cs-rpplay").addEventListener("click", rpToggle);
		$("cs-rpx").addEventListener("click", function () { replayStop(); });
		$("cs-rpbar").addEventListener("input", function () { if (!replay) return; replay.t = +this.value / 1000 * replay.len; replay.playing = false; $("cs-rpplay").textContent = "▶"; });
		$("cs-rpspeed").addEventListener("change", function () { if (replay) replay.speed = +this.value; });
		$("cs-rpcam").addEventListener("change", function () { if (!replay) return; replay.cam = this.value; replayCamPref = this.value; replay.tv = replay.cp = null; });
		$("cs-units").value = S.units; $("cs-units").addEventListener("change", function () { S.units = this.value; save(); updateGravityUI(); updateHud(true); });
		$("cs-shadow").checked = !!S.shadows; $("cs-shadow").addEventListener("change", function () { S.shadows = this.checked; save(); sunLight.castShadow = S.shadows; });
		$("cs-dmgon").checked = !!S.damage; $("cs-dmgon").addEventListener("change", function () { S.damage = this.checked; save(); });
		$("cs-touchsel").value = S.touch; $("cs-touchsel").addEventListener("change", function () { S.touch = this.value; save(); showTouch(); });
		$("cs-png").addEventListener("click", function () { render(); var a = document.createElement("a"); a.download = "mes-car-sandbox.png"; a.href = renderer.domElement.toDataURL("image/png"); a.click(); });
		$("cs-link").addEventListener("click", function () { var u = location.origin + location.pathname + "?" + C.query(S); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link", u); }); });
		$("cs-recclear").addEventListener("click", function () { REC = { top: 0, jump: 0, air: 0, crash: 0, laps: {} }; try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(GKEY) === 0) localStorage.removeItem(k); }); } catch (e) { /* ignore */ } ghost = null; ghostKey = ''; ghostBuild(); saveRec(); updateHud(true); });
		$("cs-helpbtn").addEventListener("click", function () { var h = $("cs-help"); h.hidden = !h.hidden; S.help = !h.hidden; save(); });
		$("cs-helpx").addEventListener("click", function () { $("cs-help").hidden = true; S.help = false; save(); });
		$("cs-help").hidden = !S.help;
		$("cs-camnext").addEventListener("click", function () { cycleCam(1); });
		if (window.MESPanel) window.MESPanel.add(view, { bar: $("cs-pbar"), stage: stage, onChange: function () { setTimeout(resize, 30); kbActive = true; } });
		else document.addEventListener("DOMContentLoaded", function () { if (window.MESPanel) window.MESPanel.add(view, { bar: $("cs-pbar"), stage: stage, onChange: function () { setTimeout(resize, 30); } }); });
		setupTouch();
		setPEasy(easyOn(), true);
	}
	function swapPlayerCar() {
		var old = cars[player], t = old.body.translation(), f = fwdOf(old), type = S.car && C.CARS[S.car] ? S.car : W.car;
		var pose = C.isPlane(type) && W.track && !old.d.fly ? planeStart() : { x: t.x, z: t.z, yaw: Math.atan2(f.x, f.z) };
		var c = makeCar(type, C.isPlane(type) ? null : S.color, pose, true);
		removeCar(old); cars[player] = c; c.id = player; camSnap = true; lapReset(); ghostKey = ""; updateHud(true);
	}
	function syncUrl() { try { history.replaceState(null, "", location.pathname + "?" + C.query(S) + (sharedMap && sharedMap.world === S.world && /map=/.test(location.hash) ? location.hash : "")); } catch (e) { /* ignore */ } }

	/* ===================== computer cars on drawn roads ===================== */
	function aiPath() { if (lapPath) return lapPath; var r = (curMap().r || [])[0]; return r && r.pts.length >= 2 ? roadPathOf(r) : null; }
	function aiTarget(x, z, lane, ahead) {
		var pth = aiPath();
		if (pth && (!ovalOn() || lapPath)) {
			var n = C.pathNearest(pth, x, z), s = n.s + ahead;
			if (!pth.closed && s > pth.L - 2) s = 0; /* end of an open road: back to its start */
			var q = C.pathPoint(pth, s), off = (lane || 0) * Math.min(3.5, pth.w / 3);
			return { x: q.x + Math.cos(q.dir) * off, z: q.z - Math.sin(q.dir) * off };
		}
		return C.cruiseTarget(ovalOn() ? S.world : "moon", x, z, lane, ahead);
	}

	/* ===================== map pictures (mini-map + editor) ===================== */
	var sharedMap = null;
	(function () { var h = /[#&]map=([A-Za-z0-9_-]+)/.exec(location.hash || ""); if (h) { var m = C.mapDecode(h[1]); if (m) sharedMap = { world: S.world, m: m }; } })();
	/* the terrain (and the oval when shown), drawn once per world into a picture the maps paint from */
	function mapBackground() {
		if (mmBg) return mmBg;
		var N = 384, cv = document.createElement("canvas"); cv.width = cv.height = N;
		var g = cv.getContext("2d"), id = g.createImageData(N, N), s = ter.size, c0 = new THREE.Color(W.ground[0]), c1 = new THREE.Color(W.ground[1]), hs = [];
		for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) hs.push(hAt(-s / 2 + (i + 0.5) * s / N, -s / 2 + (j + 0.5) * s / N));
		var lo = Infinity, hi = -Infinity; hs.forEach(function (h) { lo = Math.min(lo, h); hi = Math.max(hi, h); }); var span = Math.max(1, hi - lo), px = s / N;
		for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
			var k = j * N + i, h = hs[k], sx = (hs[k + (i < N - 1 ? 1 : 0)] - hs[k - (i > 0 ? 1 : 0)]) / (2 * px), sz = (hs[k + (j < N - 1 ? N : 0)] - hs[k - (j > 0 ? N : 0)]) / (2 * px);
			var shade = Math.max(0.55, Math.min(1.35, 1 - (sx * 0.6 + sz * 0.8) * 1.2)), f = (h - lo) / span;
			id.data[k * 4] = Math.min(255, (c0.r + (c1.r - c0.r) * f) * 255 * shade); id.data[k * 4 + 1] = Math.min(255, (c0.g + (c1.g - c0.g) * f) * 255 * shade); id.data[k * 4 + 2] = Math.min(255, (c0.b + (c1.b - c0.b) * f) * 255 * shade); id.data[k * 4 + 3] = 255;
		}
		g.putImageData(id, 0, 0);
		if (ovalOn()) {
			g.save(); g.scale(N / s, N / s); g.translate(s / 2, s / 2);
			g.strokeStyle = "#4a4d52"; g.lineWidth = C.TRACK.width; g.lineJoin = "round"; g.beginPath();
			for (var q = 0; q <= 200; q++) { var tp = C.trackPoint(q / 200 * C.trackLength()); if (q) g.lineTo(tp.x, tp.z); else g.moveTo(tp.x, tp.z); }
			g.closePath(); g.stroke(); var p0 = C.trackPoint(0); g.fillStyle = "#fff"; g.fillRect(p0.x - 1, p0.z - C.TRACK.width / 2, 2, C.TRACK.width); g.restore();
		}
		if (W.track) { var RW = C.RUNWAY; g.save(); g.scale(N / s, N / s); g.translate(s / 2, s / 2); g.fillStyle = "#3e4045"; g.fillRect(RW.x - RW.len / 2, RW.z - RW.w / 2, RW.len, RW.w); g.fillStyle = "#e8e8e4"; for (var rx = RW.x - RW.len / 2 + 60; rx < RW.x + RW.len / 2 - 60; rx += 50) g.fillRect(rx, RW.z - 0.8, 30, 1.6); g.restore(); }
		return (mmBg = cv);
	}
	var PCOL = { pad: "#2fb344", ramp: "#e8a400", gap: "#e8a400", table: "#d9822b", whoops: "#d9822b", loop: "#e04b2a", pipe: "#5b8fc7", bank: "#5b8fc7", block: "#8a9099" };
	function yawOfBody(c) { var f = fwdOf(c); return Math.atan2(f.x, f.z); }
	/* paint the world top-down: x right, z down, centred on (cx, cz), sc = pixels per metre, rot = turn of the picture */
	function paintMap(g, Wd, Hd, cx, cz, sc, rot, o) {
		o = o || {};
		var m = o.map || curMap(), s = ter.size;
		g.save(); g.fillStyle = W.ground[2]; g.fillRect(0, 0, Wd, Hd);
		g.translate(Wd / 2, Hd / 2); g.rotate(rot); g.scale(sc, sc); g.translate(-cx, -cz);
		g.imageSmoothingEnabled = true; g.drawImage(mapBackground(), -s / 2, -s / 2, s, s);
		var px = 1 / sc;
		if (o.grid) { g.strokeStyle = "rgba(255,255,255,0.10)"; g.lineWidth = px; g.beginPath(); var st = sc > 3 ? 10 : 50; for (var gx = -s / 2; gx <= s / 2; gx += st) { g.moveTo(gx, -s / 2); g.lineTo(gx, s / 2); g.moveTo(-s / 2, gx); g.lineTo(s / 2, gx); } g.stroke(); }
		/* roads */
		(m.r || []).forEach(function (r, ri) {
			var P = roadPathOf(r).pts; if (P.length < 2) return;
			g.lineJoin = g.lineCap = "round"; g.beginPath(); P.forEach(function (q, i) { if (i) g.lineTo(q.x, q.z); else g.moveTo(q.x, q.z); }); if (r.closed) g.closePath();
			var sel = o.sel && o.sel.type === "r" && o.sel.i === ri;
			if (sel) { g.strokeStyle = "#4dabf7"; g.lineWidth = r.w + 6 * px; g.stroke(); }
			g.strokeStyle = "#45484d"; g.lineWidth = r.w; g.stroke();
			g.strokeStyle = "rgba(245,197,24,0.8)"; g.lineWidth = Math.max(0.3, px); g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
			if (r.closed && P.length > 2) { var a = P[0], lx = Math.cos(a.dir), lz = -Math.sin(a.dir); g.strokeStyle = "#fff"; g.lineWidth = Math.max(1.2, 2 * px); g.beginPath(); g.moveTo(a.x - lx * r.w / 2, a.z - lz * r.w / 2); g.lineTo(a.x + lx * r.w / 2, a.z + lz * r.w / 2); g.stroke(); }
			if (sel && o.editor) r.pts.forEach(function (q, i) { g.fillStyle = i ? "#fff" : "#37b24d"; g.strokeStyle = "#1c7ed6"; g.lineWidth = 2 * px; g.beginPath(); g.arc(q[0], q[1], 6 * px, 0, 7); g.fill(); g.stroke(); });
		});
		/* pieces */
		(m.p || []).forEach(function (p, pi) {
			var cs = C.pieceCorners(p), sel = o.sel && o.sel.type === "p" && o.sel.i === pi;
			g.beginPath(); cs.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath();
			g.fillStyle = p.t === "pad" ? (p.pad === "press" ? "#9b5de5" : p.pad === "boost" ? "#15aabf" : "#2fb344") : PCOL[p.t] || "#999"; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
			g.strokeStyle = sel ? "#4dabf7" : "rgba(0,0,0,0.55)"; g.lineWidth = (sel ? 3 : 1) * px; g.stroke();
			if (sc > 0.7 || o.editor) { /* arrow = the way up the ramp / the way to drive */
				var R = C.pieceRect(p), L = Math.max(3, R.hz * 0.7), a0 = C.toWorld(p, 0, -L), a1 = C.toWorld(p, 0, L), h1 = C.toWorld(p, -Math.min(2.5, R.hx * 0.6), L - 2.5), h2 = C.toWorld(p, Math.min(2.5, R.hx * 0.6), L - 2.5);
				g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = Math.max(0.5, 1.5 * px); g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.moveTo(h1[0], h1[1]); g.lineTo(a1[0], a1[1]); g.lineTo(h2[0], h2[1]); g.stroke();
			}
			if (sel && o.editor) { var hd = rotHandle(p, sc); g.strokeStyle = "#4dabf7"; g.lineWidth = 2 * px; g.beginPath(); var fc = C.toWorld(p, C.pieceRect(p).cx, C.pieceRect(p).cz); g.moveTo(fc[0], fc[1]); g.lineTo(hd[0], hd[1]); g.stroke(); g.fillStyle = "#fff"; g.beginPath(); g.arc(hd[0], hd[1], 7 * px, 0, 7); g.fill(); g.stroke(); g.fillStyle = "#1c7ed6"; g.font = (11 * px) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("↻", hd[0], hd[1] + 0.5 * px); }
		});
		if (o.ghostPiece) { var gc = C.pieceCorners(o.ghostPiece); g.beginPath(); gc.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.fillStyle = "rgba(77,171,247,0.45)"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2 * px; g.setLineDash([4 * px, 3 * px]); g.stroke(); g.setLineDash([]); }
		if (o.draft && o.draft.length) { g.strokeStyle = "#4dabf7"; g.lineWidth = Math.max(o.draftW || 10, 3 * px); g.globalAlpha = 0.55; g.lineJoin = g.lineCap = "round"; g.beginPath(); o.draft.concat(o.hover ? [o.hover] : []).forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); g.globalAlpha = 1; o.draft.forEach(function (q, i) { g.fillStyle = i ? "#fff" : "#37b24d"; g.beginPath(); g.arc(q[0], q[1], (i ? 5 : 8) * px, 0, 7); g.fill(); }); }
		/* objects + cars */
		if (!o.noDyn) {
			g.fillStyle = "#ffd43b"; objs.forEach(function (ob) { var t = ob.body.translation(); g.fillRect(t.x - 1.5 * px - 0.4, t.z - 1.5 * px - 0.4, 3 * px + 0.8, 3 * px + 0.8); });
			cars.forEach(function (c, i) {
				var t = c.body.translation(), yw = yawOfBody(c), me = i === player, Lm = Math.max(c.d.l, (me ? 12 : 7) * px), Wm = Math.max(c.d.w, (me ? 7 : 4) * px);
				g.save(); g.translate(t.x, t.z); g.rotate(-yw);
				if (me) { g.fillStyle = "#fff"; g.strokeStyle = "#111"; g.lineWidth = 1.5 * px; g.beginPath(); g.moveTo(0, Lm * 0.6); g.lineTo(Wm * 0.75, -Lm * 0.45); g.lineTo(0, -Lm * 0.2); g.lineTo(-Wm * 0.75, -Lm * 0.45); g.closePath(); g.fill(); g.stroke(); }
				else { g.fillStyle = c.color; g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = px; g.fillRect(-Wm / 2, -Lm / 2, Wm, Lm); g.strokeRect(-Wm / 2, -Lm / 2, Wm, Lm); }
				g.restore();
			});
			if (o.carGhost) { g.save(); g.translate(o.carGhost[0], o.carGhost[1]); g.fillStyle = "rgba(255,255,255,0.6)"; g.beginPath(); g.arc(0, 0, 6 * px, 0, 7); g.fill(); g.restore(); }
		}
		g.restore();
	}
	function rotHandle(p, sc) { var R = C.pieceRect(p); return C.toWorld(p, R.cx, R.cz + R.hz + 22 / sc); }

	/* ---------- the mini-map in the corner ---------- */
	var MM_R = [40, 80, 160, 320];
	function drawMini() {
		var box = $("cs-mm"), cv = $("cs-mmc"); if (!box || box.hidden || !ter || !cars[player]) return;
		var dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
		if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
		var g = cv.getContext("2d"), c = cars[player], t = c.body.translation(), r = MM_R[S.mm.z] || 80, sc = cv.width / (2 * r);
		g.setTransform(1, 0, 0, 1, 0, 0);
		paintMap(g, cv.width, cv.height, t.x, t.z, sc, S.mm.rot ? yawOfBody(c) - Math.PI : 0, {});
		/* north marker */
		var ang = S.mm.rot ? yawOfBody(c) - Math.PI : 0, R2 = cv.width / 2 - 9 * dpr;
		g.save(); g.translate(cv.width / 2 - Math.sin(ang) * R2, cv.height / 2 - Math.cos(ang) * R2); g.fillStyle = "#e03131"; g.font = "bold " + (10 * dpr) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("N", 0, 0); g.restore();
		$("cs-mmscale").textContent = r * 2 >= 1000 ? (r * 2 / 1000) + " km" : r * 2 + " m";
	}
	function applyMini() {
		var on = S.show.map !== false; $("cs-mm").hidden = !on; $("cs-mm").classList.toggle("big", !!S.mm.big); mmPlace();
		$("cs-mmrot").textContent = S.mm.rot ? "⬆" : "N"; $("cs-mmrot").title = S.mm.rot ? "The map turns with the car (click: north up)" : "North is up (click: turn with the car)";
		var mb = $("cs-mapbtn"); if (mb) mb.setAttribute("aria-pressed", String(on));
		root.querySelectorAll("[data-show=map]").forEach(function (b) { b.checked = on; });
		mmT = 0;
	}

	/* the mini-map can be dragged anywhere on the picture; its spot (S.mm.pos = share of the free room across / down) is kept */
	function mmPlace() {
		var el = $("cs-mm"), p = S.mm.pos; $("cs-mmhome").hidden = !p;
		if (!p) { el.style.left = el.style.top = el.style.right = el.style.bottom = ""; return; }
		var W2 = stage.clientWidth - el.offsetWidth, H2 = stage.clientHeight - el.offsetHeight;
		el.style.right = el.style.bottom = "auto"; el.style.left = Math.round(Math.max(0, W2) * p.x) + "px"; el.style.top = Math.round(Math.max(0, H2) * p.y) + "px";
	}
	function setupMiniDrag() {
		var el = $("cs-mm"), cv = $("cs-mmc"), d = null, dragged = false;
		cv.addEventListener("pointerdown", function (e) {
			var r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
			d = { id: e.pointerId, x0: e.clientX, y0: e.clientY, l: r.left - sr.left, t: r.top - sr.top, on: false }; dragged = false;
			try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
		});
		cv.addEventListener("pointermove", function (e) {
			if (!d || e.pointerId !== d.id) return; var dx = e.clientX - d.x0, dy = e.clientY - d.y0;
			if (!d.on && Math.hypot(dx, dy) < 7) return;
			if (!d.on) { d.on = true; el.classList.add("cs-mmdrag"); }
			var W2 = Math.max(1, stage.clientWidth - el.offsetWidth), H2 = Math.max(1, stage.clientHeight - el.offsetHeight);
			S.mm.pos = { x: Math.max(0, Math.min(1, (d.l + dx) / W2)), y: Math.max(0, Math.min(1, (d.t + dy) / H2)) }; mmPlace();
		});
		function end(e) { if (!d || (e && e.pointerId !== d.id)) return; if (d.on) { dragged = true; el.classList.remove("cs-mmdrag"); save(); toast("Map moved · ⌂ on the map puts it back"); } d = null; }
		cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end); cv.addEventListener("lostpointercapture", end);
		/* a drag is not a click (a click still opens the editor) */
		cv.addEventListener("click", function (e) { if (dragged) { dragged = false; e.stopImmediatePropagation(); } }, true);
	}
	/* ---------- the map editor ---------- */
	var edOpen = false, ed = null;
	function emap() { return ed.m; }
	function edOpenNow() {
		if (!phys || edOpen) return;
		if (replay) replayStop(true);
		var c = cars[player], t = c.body.translation();
		ed = { m: JSON.parse(JSON.stringify(curMap())), cx: t.x, cz: t.z, sc: 1.4, tool: "select", add: null, sel: null, draft: [], hover: null, hist: [], changed: false, carPose: null, yaw: yawOfBody(c), roadW: 10, ptr: {}, drag: null };
		edOpen = true; $("cs-ed").hidden = false; root.classList.add("cs-editing"); keys = {}; setTimeout(function () { resize(); if (ed) ed.needFit = true; }, 30);
		var em = $("cs-edlay"); em.value = "";
		ed.needFit = true; edTool("select"); edSide(); toast("Map editor: the game is paused");
	}
	function edClose() {
		if (!edOpen) return;
		edOpen = false; $("cs-ed").hidden = true; root.classList.remove("cs-editing");
		if (ed.changed) { MAPS[S.world] = ed.m; sharedMap = null; saveMaps(); buildMapContent(true); clearCarsFromPieces(ed.carPose); toast("Map saved in this browser"); }
		else if (ed.carPose) clearCarsFromPieces(ed.carPose);
		ed = null; lastFrame = 0; camSnap = true; mmT = 0; setTimeout(resize, 30);
	}
	function edPush() { ed.hist.push(JSON.stringify(ed.m)); if (ed.hist.length > 80) ed.hist.shift(); ed.changed = true; }
	function edUndo() { if (!ed.hist.length) { toast("Nothing to undo"); return; } ed.m = JSON.parse(ed.hist.pop()); ed.sel = null; ed.changed = true; edSide(); }
	function edCanvas() { return $("cs-edc"); }
	function edSize() { var cv = edCanvas(), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } return { w: w, h: h, dpr: dpr }; }
	function edFit(nearCar) {
		var z = edSize(), s = ter.size;
		if (!z.w || !z.h) { ed.needFit = true; return; }
		if (nearCar) { ed.sc = Math.min(z.w, z.h) / 260; }
		else { ed.sc = Math.min(z.w, z.h) / s; ed.cx = 0; ed.cz = 0; }
	}
	function edToWorld(ex, ey) { var cv = edCanvas(), r = cv.getBoundingClientRect(); return [ed.cx + (ex - r.left - r.width / 2) / ed.sc, ed.cz + (ey - r.top - r.height / 2) / ed.sc]; }
	function drawEditor() {
		if (!ed) return;
		var z = edSize(), cv = edCanvas(), g = cv.getContext("2d");
		if (!z.w || !z.h) return;
		if (ed.needFit) { ed.needFit = false; edFit(true); }
		g.setTransform(1, 0, 0, 1, 0, 0);
		var gp = null;
		if (ed.tool === "add" && ed.add && ed.hover) { gp = C.newPiece(ed.add, ed.hover[0], ed.hover[1], ed.yaw); }
		paintMap(g, cv.width, cv.height, ed.cx, ed.cz, ed.sc * z.dpr, 0, { map: ed.m, sel: ed.sel, editor: true, grid: true, ghostPiece: gp, draft: ed.tool === "road" ? ed.draft : null, draftW: ed.roadW, hover: ed.tool === "road" ? ed.hover : null, carGhost: ed.tool === "car" ? ed.hover : (ed.carPose ? [ed.carPose.x, ed.carPose.z] : null) });
		/* scale bar */
		var m = [5, 10, 20, 50, 100, 200, 500].find(function (v) { return v * ed.sc > 70; }) || 500, bw = m * ed.sc * z.dpr;
		g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(10 * z.dpr, cv.height - 26 * z.dpr, bw + 46 * z.dpr, 18 * z.dpr); g.fillStyle = "#fff"; g.fillRect(16 * z.dpr, cv.height - 18 * z.dpr, bw, 3 * z.dpr);
		g.font = (11 * z.dpr) + "px sans-serif"; g.textBaseline = "middle"; g.fillText(m + " m", bw + 20 * z.dpr, cv.height - 17 * z.dpr);
	}
	var ED_HINT = { select: "Drag a piece to move it, the ↻ handle to turn it (Shift = no snapping). Click a road to edit its points. Drag empty ground to pan, scroll or pinch to zoom.", add: "Click on the map to place it · R turns it · Esc stops adding", road: "Click to add points · click the green first point to close a circuit (laps get timed!) · Enter or double-click to finish · Backspace = remove last point", car: "Click where your car should start (it faces the same way as now)" };
	function edTool(t, k) {
		if (ed.tool === "road" && t !== "road" && ed.draft.length >= 2) edFinishRoad(false);
		ed.tool = t; ed.add = t === "add" ? k : null; if (t !== "road") ed.draft = [];
		root.querySelectorAll("#cs-ed [data-tool]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tool === t)); });
		root.querySelectorAll("#cs-edpal button").forEach(function (b) { b.setAttribute("aria-pressed", String(t === "add" && b.dataset.k === k)); });
		$("cs-edhint").textContent = (t === "add" ? C.PIECES[k].name + ": " : "") + ED_HINT[t];
		edCanvas().style.cursor = t === "select" ? "default" : "crosshair";
	}
	function edFinishRoad(closed) {
		if (ed.draft.length >= 2) { edPush(); ed.m.r = ed.m.r || []; ed.m.r.push({ w: ed.roadW, closed: !!closed && ed.draft.length >= 3, pts: ed.draft.map(function (q) { return [Math.round(q[0]), Math.round(q[1])]; }) }); ed.sel = { type: "r", i: ed.m.r.length - 1 }; if (closed && ed.m.oval !== false && W.track && C.roadPath(ed.draft, true, 4).L > 60) toast("Tip: switch the test-track oval off to time laps on your circuit"); }
		ed.draft = []; if (ed.tool === "road") edTool("select"); edSide();
	}
	function edHit(x, z) {
		var m = ed.m, px = 1 / ed.sc;
		if (ed.sel && ed.sel.type === "p" && m.p[ed.sel.i]) { var hd = rotHandle(m.p[ed.sel.i], ed.sc); if (Math.hypot(x - hd[0], z - hd[1]) < 12 * px) return { kind: "rot", i: ed.sel.i }; }
		if (ed.sel && ed.sel.type === "r" && m.r[ed.sel.i]) { var pts = m.r[ed.sel.i].pts; for (var k = 0; k < pts.length; k++) if (Math.hypot(x - pts[k][0], z - pts[k][1]) < 10 * px) return { kind: "rpt", i: ed.sel.i, k: k }; }
		for (var i = m.p.length - 1; i >= 0; i--) if (C.pieceHit(m.p[i], x, z, 2 * px)) return { kind: "p", i: i };
		for (i = (m.r || []).length - 1; i >= 0; i--) { var n = C.pathNearest(roadPathOf(m.r[i]), x, z); if (n.d < m.r[i].w / 2 + 4 * px) return { kind: "r", i: i }; }
		return null;
	}
	function snap(v, st, free) { return free ? v : Math.round(v / st) * st; }
	function setupEditor() {
		var cv = edCanvas(), pinch = null;
		$("cs-edpal").innerHTML = C.PIECE_ORDER.map(function (k) { var P = C.PIECES[k]; return '<button type="button" data-k="' + k + '" title="Add: ' + P.name + '"><span aria-hidden="true">' + P.icon + "</span> " + P.name + "</button>"; }).join("");
		$("cs-edpal").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (ed.tool === "add" && ed.add === b.dataset.k) edTool("select"); else edTool("add", b.dataset.k); });
		$("cs-ed").addEventListener("click", function (e) {
			var b = e.target.closest("[data-tool],[data-ed]"); if (!b || !ed) return;
			if (b.dataset.tool) { edTool(b.dataset.tool); return; }
			var a = b.dataset.ed, m = ed.m, sp = ed.sel && ed.sel.type === "p" ? m.p[ed.sel.i] : null, sr = ed.sel && ed.sel.type === "r" ? m.r[ed.sel.i] : null;
			if (a === "done") edClose();
			else if (a === "undo") edUndo();
			else if (a === "fit") edFit(false);
			else if (a === "zin") ed.sc *= 1.4; else if (a === "zout") ed.sc /= 1.4;
			else if (a === "clear") { if (!m.p.length && !(m.r || []).length) return; edPush(); m.p = []; m.r = []; ed.sel = null; edSide(); toast("Everything removed (Undo brings it back)"); }
			else if (a === "rotl" && sp) { edPush(); sp.yaw -= Math.PI / 12; }
			else if (a === "rotr" && sp) { edPush(); sp.yaw += Math.PI / 12; }
			else if (a === "flip" && sp) { edPush(); sp.yaw += Math.PI; }
			else if (a === "dup" && sp) { edPush(); var cp = JSON.parse(JSON.stringify(sp)), R = C.pieceRect(sp), off = C.toWorld(sp, R.hx * 2 + 3, 0); cp.x = off[0]; cp.z = off[1]; m.p.push(cp); ed.sel = { type: "p", i: m.p.length - 1 }; edSide(); }
			else if (a === "del" && (sp || sr)) { edPush(); if (sp) m.p.splice(ed.sel.i, 1); else m.r.splice(ed.sel.i, 1); ed.sel = null; edSide(); }
			else if (a === "close" && sr) { edPush(); sr.closed = !sr.closed && sr.pts.length >= 3; edSide(); }
			else if (a === "reverse" && sr) { edPush(); sr.pts.reverse(); }
			else if (a === "finish") edFinishRoad(false);
			else if (a === "share") { var u = location.origin + location.pathname + "?" + C.query(S) + "#map=" + C.mapEncode(m); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link to this map copied"); }, function () { prompt("Copy this link", u); }); }
		});
		$("cs-ed").addEventListener("input", function (e) {
			var t = e.target; if (!ed) return;
			if (t.dataset.prm && ed.sel && ed.sel.type === "p") { var p = ed.m.p[ed.sel.i]; if (!t._pushed) { edPush(); t._pushed = true; } p[t.dataset.prm] = +t.value; C.clampPiece(p); var o = t.parentNode.querySelector("output"); if (o) o.textContent = fmtPrm(t.dataset.prm, p[t.dataset.prm]); }
		});
		$("cs-ed").addEventListener("change", function (e) {
			var t = e.target; if (!ed) return; t._pushed = false;
			if (t.id === "cs-edlay" && t.value) { edPush(); ed.m = C.mapPreset(t.value, S.world); ed.sel = null; edSide(); toast("Layout: " + t.options[t.selectedIndex].text + " (Undo goes back)"); t.value = ""; }
			else if (t.id === "cs-edoval") { edPush(); ed.m.oval = t.checked; mmBg = null; }
			else if (t.dataset.rw != null) { var w = +t.value; ed.roadW = w; if (ed.sel && ed.sel.type === "r") { edPush(); ed.m.r[ed.sel.i].w = w; } }
		});
		cv.addEventListener("pointerdown", function (e) {
			if (!ed) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); ed.ptr[e.pointerId] = [e.clientX, e.clientY];
			var ids = Object.keys(ed.ptr);
			if (ids.length === 2) { var a = ed.ptr[ids[0]], b = ed.ptr[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), sc: ed.sc, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, cx: ed.cx, cz: ed.cz }; ed.drag = null; return; }
			var w = edToWorld(e.clientX, e.clientY), free = e.shiftKey;
			if (e.button === 1 || e.button === 2) { ed.drag = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: ed.cx, cz: ed.cz }; return; }
			if (ed.tool === "add") { edPush(); var np = C.newPiece(ed.add, snap(w[0], 0.5, free), snap(w[1], 0.5, free), ed.yaw); ed.m.p.push(np); ed.sel = { type: "p", i: ed.m.p.length - 1 }; if (!e.ctrlKey && !e.metaKey) edTool("select"); edSide(); return; }
			if (ed.tool === "road") {
				if (ed.draft.length >= 3 && Math.hypot(w[0] - ed.draft[0][0], w[1] - ed.draft[0][1]) < 12 / ed.sc) { edFinishRoad(true); return; }
				ed.draft.push([w[0], w[1]]); return;
			}
			if (ed.tool === "car") { ed.carPose = { x: w[0], z: w[1], yaw: ed.yaw }; edTool("select"); toast("Your car will start there when you close the editor"); return; }
			var h = edHit(w[0], w[1]);
			if (!h) { ed.sel = null; edSide(); ed.drag = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: ed.cx, cz: ed.cz }; return; }
			if (h.kind === "p") { ed.sel = { type: "p", i: h.i }; var p = ed.m.p[h.i]; ed.drag = { kind: "p", i: h.i, ox: w[0] - p.x, oz: w[1] - p.z, pushed: false }; edSide(); }
			else if (h.kind === "rot") ed.drag = { kind: "rot", i: h.i, pushed: false };
			else if (h.kind === "rpt") ed.drag = { kind: "rpt", i: h.i, k: h.k, pushed: false };
			else if (h.kind === "r") { ed.sel = { type: "r", i: h.i }; ed.drag = { kind: "rmove", i: h.i, sx: w[0], sz: w[1], orig: JSON.stringify(ed.m.r[h.i].pts), pushed: false }; edSide(); }
		});
		cv.addEventListener("pointermove", function (e) {
			if (!ed) return; var w = edToWorld(e.clientX, e.clientY), free = e.shiftKey; ed.hover = w;
			if (ed.ptr[e.pointerId]) ed.ptr[e.pointerId] = [e.clientX, e.clientY];
			if (pinch) { var ids = Object.keys(ed.ptr); if (ids.length < 2) return; var a = ed.ptr[ids[0]], b = ed.ptr[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); ed.sc = Math.max(0.1, Math.min(30, pinch.sc * d / Math.max(1, pinch.d))); ed.cx = pinch.cx - ((a[0] + b[0]) / 2 - pinch.mx) / ed.sc; ed.cz = pinch.cz - ((a[1] + b[1]) / 2 - pinch.my) / ed.sc; return; }
			var D = ed.drag; if (!D) return;
			if (D.kind === "pan") { ed.cx = D.cx - (e.clientX - D.sx) / ed.sc; ed.cz = D.cz - (e.clientY - D.sy) / ed.sc; return; }
			if (!D.pushed) { edPush(); D.pushed = true; }
			if (D.kind === "p") { var p = ed.m.p[D.i]; p.x = snap(w[0] - D.ox, 0.5, free); p.z = snap(w[1] - D.oz, 0.5, free); }
			else if (D.kind === "rot") { var q = ed.m.p[D.i], R = C.pieceRect(q), cc = C.toWorld(q, R.cx, R.cz), yw = Math.atan2(w[0] - cc[0], w[1] - cc[1]); q.yaw = free ? yw : Math.round(yw / (Math.PI / 12)) * (Math.PI / 12); ed.yaw = q.yaw; var cc2 = C.toWorld(q, R.cx, R.cz); q.x += cc[0] - cc2[0]; q.z += cc[1] - cc2[1]; }
			else if (D.kind === "rpt") { ed.m.r[D.i].pts[D.k] = [Math.round(w[0]), Math.round(w[1])]; }
			else if (D.kind === "rmove") { var o = JSON.parse(D.orig), dx = Math.round(w[0] - D.sx), dz = Math.round(w[1] - D.sz); ed.m.r[D.i].pts = o.map(function (q2) { return [q2[0] + dx, q2[1] + dz]; }); }
		});
		function up(e) { if (!ed) return; delete ed.ptr[e.pointerId]; if (Object.keys(ed.ptr).length < 2) pinch = null; if (ed.drag && ed.drag.kind === "p" && !ed.drag.pushed) { /* a click: nothing moved */ } ed.drag = null; }
		cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("pointerleave", function () { if (ed) ed.hover = null; });
		cv.addEventListener("dblclick", function () { if (ed && ed.tool === "road") { if (ed.draft.length > 2) ed.draft.pop(); edFinishRoad(false); } });
		cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
		cv.addEventListener("wheel", function (e) { if (!ed) return; e.preventDefault(); var w0 = edToWorld(e.clientX, e.clientY); ed.sc = Math.max(0.1, Math.min(30, ed.sc * Math.exp(-e.deltaY * 0.0015))); var w1 = edToWorld(e.clientX, e.clientY); ed.cx += w0[0] - w1[0]; ed.cz += w0[1] - w1[1]; }, { passive: false });
	}
	function fmtPrm(q, v) { return q === "n" ? String(Math.round(v)) : q === "v" ? C.fmtSpeed(v, S.units) : (+v).toFixed(1) + " m"; }
	function edSide() {
		var el = $("cs-edside"), m = ed.m, h = "";
		if (ed.sel && ed.sel.type === "p" && m.p[ed.sel.i]) {
			var p = m.p[ed.sel.i];
			h += "<b>" + C.pieceName(p) + "</b>";
			(C.SHAPE_PARAMS[p.t] || []).forEach(function (q) { var D = C.PARAMS[q]; h += '<label class="cs-edprm"><span>' + D[0] + '</span><input type="range" data-prm="' + q + '" min="' + D[1] + '" max="' + D[2] + '" step="' + D[3] + '" value="' + p[q] + '"><output>' + fmtPrm(q, p[q]) + "</output></label>"; });
			h += '<div class="cs-edbtns"><button type="button" data-ed="rotl" title="Turn left 15° (Shift+R)">↺ 15°</button><button type="button" data-ed="rotr" title="Turn right 15° (R)">↻ 15°</button><button type="button" data-ed="flip" title="Turn round">⇅ 180°</button><button type="button" data-ed="dup" title="Copy it next to this one (Ctrl+D)">⧉ Copy</button><button type="button" data-ed="del" class="cs-eddel" title="Delete (Del)">🗑 Delete</button></div>';
		} else if (ed.sel && ed.sel.type === "r" && m.r[ed.sel.i]) {
			var r = m.r[ed.sel.i];
			h += "<b>Road" + (r.closed ? " (circuit)" : "") + "</b><p>" + C.fmtDist(roadPathOf(r).L, S.units) + " long · " + r.pts.length + " points. Drag the white dots to reshape it, or drag the road to move it.</p>";
			h += '<label class="cs-edprm"><span>Width</span><select data-rw>' + C.ROAD_WIDTHS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === r.w ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>";
			h += '<div class="cs-edbtns"><button type="button" data-ed="close">' + (r.closed ? "Open the loop" : "Close into a circuit") + '</button><button type="button" data-ed="reverse" title="Drive it the other way (laps)">⇄ Reverse</button><button type="button" data-ed="del" class="cs-eddel">🗑 Delete</button></div>';
		} else if (ed.tool === "road") {
			h += '<b>Drawing a road</b><p>' + ed.draft.length + ' point' + (ed.draft.length === 1 ? "" : "s") + ' so far.</p><label class="cs-edprm"><span>Width</span><select data-rw>' + C.ROAD_WIDTHS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === ed.roadW ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + '</select></label><div class="cs-edbtns"><button type="button" data-ed="finish">✓ Finish road</button></div>';
		} else {
			h += "<b>" + (m.p.length + (m.r || []).length ? m.p.length + " piece" + (m.p.length === 1 ? "" : "s") + ", " + (m.r || []).length + " road" + ((m.r || []).length === 1 ? "" : "s") : "Empty map") + "</b>";
			h += "<p>Pick a piece above and click on the map to place it. Click a piece to change its size. Draw roads with 🛣. A closed road becomes a timed circuit when the oval is off.</p>";
			if (W.track) h += '<label class="cs-edchk"><input type="checkbox" id="cs-edoval"' + (m.oval !== false ? " checked" : "") + "> Test-track oval, lamp posts and grandstand</label>";
			h += '<div class="cs-edbtns"><button type="button" data-ed="share">🔗 Copy a link to this map</button><button type="button" data-ed="clear" class="cs-eddel">🗑 Remove everything</button></div>';
		}
		el.innerHTML = h;
	}
	function edKey(e) {
		if (inField(e) && e.target.tagName !== "INPUT") return;
		var k = e.key.toLowerCase(), m = ed.m, sp = ed.sel && ed.sel.type === "p" ? m.p[ed.sel.i] : null;
		if (e.target.tagName === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox") return;
		if (k === "escape") { e.preventDefault(); if (ed.tool === "road" && ed.draft.length) { ed.draft = []; edTool("select"); } else if (ed.tool !== "select") edTool("select"); else edClose(); }
		else if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); edUndo(); }
		else if ((e.ctrlKey || e.metaKey) && k === "d" && sp) { e.preventDefault(); $("cs-ed").querySelector('[data-ed=dup]').click(); }
		else if (k === "enter") { if (ed.tool === "road") { e.preventDefault(); edFinishRoad(false); } }
		else if (k === "backspace" && ed.tool === "road") { e.preventDefault(); ed.draft.pop(); edSide(); }
		else if ((k === "delete" || k === "backspace") && ed.sel) { e.preventDefault(); edPush(); if (ed.sel.type === "p") m.p.splice(ed.sel.i, 1); else m.r.splice(ed.sel.i, 1); ed.sel = null; edSide(); }
		else if (k === "r") { e.preventDefault(); var dy = (e.shiftKey ? -1 : 1) * Math.PI / 12; if (sp) { edPush(); sp.yaw += dy; ed.yaw = sp.yaw; } else ed.yaw += dy; }
		else if (k === "b") { e.preventDefault(); edClose(); }
		else if (sp && k.indexOf("arrow") === 0) { e.preventDefault(); edPush(); var st = e.shiftKey ? 5 : 0.5; if (k === "arrowleft") sp.x -= st; if (k === "arrowright") sp.x += st; if (k === "arrowup") sp.z -= st; if (k === "arrowdown") sp.z += st; }
	}
	/* quick add: a piece in front of the car, without opening the editor */
	function quickPiece(k) {
		var c = cars[player]; if (!c) return;
		var P = C.newPiece(k, 0, 0, yawOfBody(c)), R = C.pieceRect(P), a = aheadOfPlayer(R.hz + 18);
		P.x = Math.round(a.x * 2) / 2; P.z = Math.round(a.z * 2) / 2;
		var m = JSON.parse(JSON.stringify(curMap())); m.p.push(P); MAPS[S.world] = m; sharedMap = null; saveMaps(); buildMapContent(true);
		toast(C.PIECES[k].name + " placed ahead · edit it on the map (B)");
	}
	function applyLayout(kind) { MAPS[S.world] = C.mapPreset(kind, S.world); sharedMap = null; saveMaps(); buildMapContent(true); clearCarsFromPieces(null); resetCar(cars[player], false); camSnap = true; toast("Layout: " + C.MAP_PRESETS.find(function (x) { return x[0] === kind; })[1]); }
	function setSpeed(v) { S.speed = v; save(); syncUrl(); syncGameUI(); }
	function setDrive(v) { S.drive = v; save(); syncUrl(); lapReset(); ghostKey = ""; syncGameUI(); updateHud(true); }
	function syncGameUI() {
		root.querySelectorAll("[data-speed]").forEach(function (x) { x.value = String(S.speed); });
		root.querySelectorAll("[data-drive]").forEach(function (x) { x.value = S.drive; });
	}
	function stepSpeed(dir) { var i = C.SPEEDS.findIndex(function (x) { return x[0] === S.speed; }), j = Math.max(0, Math.min(C.SPEEDS.length - 1, i + dir)); setSpeed(C.SPEEDS[j][0]); toast("Game speed: " + C.SPEEDS[j][1]); }
	function setupMapUI() {
		setupEditor();
		root.querySelectorAll("[data-speed]").forEach(function (x) { x.innerHTML = C.SPEEDS.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join(""); });
		root.querySelectorAll("[data-drive]").forEach(function (x) { x.innerHTML = C.DRIVE_ORDER.map(function (k) { return '<option value="' + k + '">' + C.DRIVE[k].name + "</option>"; }).join(""); });
		root.addEventListener("change", function (e) { var t = e.target; if (t.matches("[data-speed]")) setSpeed(+t.value); else if (t.matches("[data-drive]")) { setDrive(t.value); toast("Cars: " + C.DRIVE[S.drive].name + (S.drive === "real" ? " (the real numbers)" : " (more power and grip)")); } });
		syncGameUI();
		$("cs-mmb").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return; var a = b.dataset.mm;
			if (a === "in") S.mm.z = Math.max(0, S.mm.z - 1); else if (a === "out") S.mm.z = Math.min(MM_R.length - 1, S.mm.z + 1);
			else if (a === "rot") S.mm.rot = !S.mm.rot; else if (a === "big") S.mm.big = !S.mm.big; else if (a === "home") { delete S.mm.pos; toast("Map back in its corner"); } else if (a === "edit") edOpenNow(); else if (a === "hide") { S.show.map = false; toast("Map hidden · bring it back with 🗺"); }
			save(); applyMini();
		});
		$("cs-mmc").addEventListener("click", function () { edOpenNow(); });
		$("cs-mapbtn").addEventListener("click", function () { S.show.map = S.show.map === false; save(); applyMini(); });
		$("cs-edit").addEventListener("click", edOpenNow);
		$("cs-quick").innerHTML = C.PIECE_ORDER.map(function (k) { var P = C.PIECES[k]; return '<button type="button" data-k="' + k + '"><span aria-hidden="true">' + P.icon + "</span> " + P.name + "</button>"; }).join("");
		$("cs-quick").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) quickPiece(b.dataset.k); });
		var ls = $("cs-layout"); ls.innerHTML = '<option value="">Choose a layout…</option>' + C.MAP_PRESETS.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + "</option>"; }).join("");
		ls.addEventListener("change", function () { if (this.value) applyLayout(this.value); this.value = ""; });
		var el = $("cs-edlay"); el.innerHTML = '<option value="">Layout…</option>' + C.MAP_PRESETS.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + "</option>"; }).join("");
		$("cs-mapreset").addEventListener("click", function () { delete MAPS[S.world]; sharedMap = null; saveMaps(); buildMapContent(true); toast("Back to the original map of " + W.name); });
		window.addEventListener("resize", function () { mmT = 0; mmPlace(); });
		if (window.ResizeObserver) new ResizeObserver(function () { mmPlace(); }).observe(stage);
		setupMiniDrag();
		applyMini();
		if (sharedMap) setTimeout(function () { toast("A shared map is loaded · edit it to keep it, or ⟲ Original map in the panel"); }, 1200);
	}

	/* ===================== start ===================== */
	setupDomOnly();
	/* ===================== online with friends (WebRTC) =====================
	   Signalling (offer / answer, every ICE candidate inside the SDP: no trickle) goes through mes.fm/api/car-room.js; on 127.0.0.1 /
	   localhost / ?mock=1 a localStorage stand-in does the same, so two tabs can test it. Star layout: each joiner has one
	   RTCPeerConnection to the host with two data channels: "s" (unreliable, unordered: 68-byte car packets, C.netEncode) and "r"
	   (reliable: JSON events, C.netClean). The host passes packets and events on to the others. Every browser runs its own physics;
	   another player's car is a dynamic body with no gravity steered by its velocity towards where that player says it is, so bumps
	   push both cars a little and then it slides back to its true place. Computer cars and loose objects stay on each screen. */
	var NET = null, remotes = {}, netApplying = false, netIv = null, netRoomT = null, NKEY = "mes-car-sandbox:net";
	var NETP = load(NKEY, { name: "" });
	var MOCK = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];
	function netMyName() { return C.netName(NETP.name || ""); }
	/* ---------- signalling client (real API or the localStorage stand-in) ---------- */
	var MK = "mes-car-sandbox:mock:";
	function mget(k) { try { return JSON.parse(localStorage.getItem(MK + k)); } catch (e) { return null; } }
	function mset(k, v) { try { if (v == null) localStorage.removeItem(MK + k); else localStorage.setItem(MK + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
	function mockSig(op, b) {
		var r = b.code ? mget("r:" + b.code) : null;
		if (op === "info") return r ? { ok: true, body: { host: r.host, name: r.name, room: r.room } } : { ok: false, status: 404, body: { error: "No room with that code (rooms close 3 hours after the host leaves)." } };
		if (op === "new") { var code = C.netCode(); mset("r:" + code, { host: b.peer, name: C.netName(b.name), room: b.room, created: Date.now() }); return { ok: true, body: { code: code } }; }
		if (op === "send") { if (!r) return { ok: false, status: 404, body: { error: "That room has closed." } }; var box = mget("m:" + b.code + ":" + b.to) || []; box.push({ from: b.from, kind: b.kind, sdp: b.sdp || null, name: C.netName(b.name), at: Date.now() }); mset("m:" + b.code + ":" + b.to, box.slice(-30)); return { ok: true, body: { ok: true } }; }
		if (op === "recv") { var m = mget("m:" + b.code + ":" + b.peer) || []; mset("m:" + b.code + ":" + b.peer, null); return { ok: true, body: { msgs: m, alive: !!r } }; }
		if (op === "room") { if (r && r.host === b.peer) { r.room = b.room; mset("r:" + b.code, r); } return { ok: true, body: { ok: true } }; }
		if (op === "close") { if (r && r.host === b.peer) mset("r:" + b.code, null); return { ok: true, body: { ok: true } }; }
		return { ok: false, status: 400, body: { error: "?" } };
	}
	function sig(op, b) {
		if (MOCK) return new Promise(function (res) { setTimeout(function () { res(mockSig(op, b)); }, 30); });
		var f = op === "info" ? fetch("/api/car-room?code=" + encodeURIComponent(b.code), { cache: "no-store" })
			: fetch("/api/car-room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ act: op }, b)), keepalive: op === "close" });
		return f.then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }, function () { return { ok: false, status: r.status, body: { error: "The room server did not answer properly." } }; }); }, function () { return { ok: false, status: 0, body: { error: "Could not reach the room server: check your connection." } }; });
	}
	/* ---------- connections ---------- */
	function gathered(pc) {
		return new Promise(function (res) {
			if (pc.iceGatheringState === "complete") { res(); return; }
			var t = setTimeout(res, 3500);
			pc.addEventListener("icegatheringstatechange", function () { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } });
		});
	}
	function wireChan(L, dc) {
		dc.binaryType = "arraybuffer";
		if (dc.label === "s") L.s = dc; else L.r = dc;
		dc.onopen = function () { if (dc.label === "r") netLinkOpen(L); };
		dc.onclose = function () { if (dc.label === "r") netLinkGone(L); };
		dc.onmessage = function (ev) { if (dc.label === "s") netGotState(L, ev.data); else netGotEvent(L, ev.data); };
	}
	function newLink(peer) {
		var L = { peer: peer, pc: new RTCPeerConnection({ iceServers: ICE }), s: null, r: null, slot: 0, name: "", car: "sports", color: "#888888", born: performance.now(), open: false };
		L.pc.onconnectionstatechange = function () { var st = L.pc.connectionState; if (st === "failed" || st === "closed") netLinkGone(L); };
		return L;
	}
	function sendR(L, e) { if (L && L.r && L.r.readyState === "open") { try { L.r.send(JSON.stringify(e)); } catch (x) { /* closing */ } } }
	function sendS(L, b) { if (L && L.s && L.s.readyState === "open" && L.s.bufferedAmount < 64000) { try { L.s.send(b); } catch (x) { /* closing */ } } }
	function links() { return NET && NET.host ? Object.keys(NET.links).map(function (k) { return NET.links[k]; }) : NET && NET.hostLink ? [NET.hostLink] : []; }
	function bcastR(e, except) { links().forEach(function (L) { if (L !== except && L.open) sendR(L, e); }); }
	/* ---------- host ---------- */
	function netMake() {
		if (NET) return;
		if (!window.RTCPeerConnection) { netStatus("This browser can't do peer-to-peer connections (WebRTC)."); return; }
		var peer = C.netPeerId();
		netStatus("Making a room…");
		sig("new", { peer: peer, name: netMyName(), room: netRoomObj() }).then(function (r) {
			if (!r.ok) { netStatus(r.body.error || "Could not make a room."); return; }
			NET = { code: r.body.code, peer: peer, host: true, slot: 0, links: {}, roster: {}, live: true, t0: performance.now(), seq: 0, pend: 0, race: null };
			NET.roster[0] = { name: netMyName(), car: cars[player].type, color: cars[player].color };
			netStart(); netPoll();
			toast("Room " + r.body.code + " is open: send the link to your friends");
			netCopyLink(true);
		});
	}
	function netPoll() {
		if (!NET || !NET.host) return;
		sig("recv", { code: NET.code, peer: NET.peer }).then(function (r) {
			if (!NET || !NET.host) return;
			if (r.ok) {
				if (r.body.alive === false) { netStatus("The room expired: make a new one."); }
				(r.body.msgs || []).forEach(function (m) { if (m.kind === "offer" && C.netPeerOk(m.from) && typeof m.sdp === "string") netAccept(m); });
			}
			var full = Object.keys(NET.links).length >= C.NET.MAXP - 1;
			NET.pollT = setTimeout(netPoll, NET.pend > 0 ? 1000 : full ? 8000 : document.hidden ? 5000 : 2000);
		});
	}
	function freeSlot() { for (var s = 1; s < C.NET.MAXP; s++) { var used = false; for (var k in NET.links) if (NET.links[k].slot === s) used = true; if (!used) return s; } return 0; }
	function netAccept(m) {
		var old = NET.links[m.from]; if (old) { try { old.pc.close(); } catch (e) { /* ignore */ } delete NET.links[m.from]; }
		var slot = freeSlot();
		if (!slot) { sig("send", { code: NET.code, from: NET.peer, to: m.from, kind: "bye" }); return; }
		var L = newLink(m.from); L.slot = slot; L.name = C.netName(m.name); NET.links[m.from] = L; NET.pend++;
		L.pc.ondatachannel = function (ev) { wireChan(L, ev.channel); };
		L.pc.setRemoteDescription({ type: "offer", sdp: m.sdp }).then(function () { return L.pc.createAnswer(); }).then(function (a) { return L.pc.setLocalDescription(a); }).then(function () { return gathered(L.pc); })
			.then(function () { return sig("send", { code: NET.code, from: NET.peer, to: m.from, kind: "answer", sdp: L.pc.localDescription.sdp, name: netMyName() }); })
			.catch(function (e) { console.warn("car-room accept", e); netLinkGone(L); });
		setTimeout(function () { if (NET && NET.links[L.peer] === L && !L.open) { netLinkGone(L); } }, 30000);
		netStatus(L.name + " is connecting…");
	}
	/* ---------- joiner ---------- */
	function netJoin(code) {
		if (NET) return;
		code = C.netParseCode(code); if (!code) { netStatus("That isn't a room code: 6 letters and digits, like k7m2pq."); return; }
		if (!window.RTCPeerConnection) { netStatus("This browser can't do peer-to-peer connections (WebRTC)."); return; }
		netStatus("Looking for room " + code + "…");
		sig("info", { code: code }).then(function (r) {
			if (!r.ok) { netStatus(r.body.error || "No room with that code."); return; }
			var peer = C.netPeerId(), L = newLink(r.body.host);
			NET = { code: code, peer: peer, host: false, slot: -1, hostLink: L, roster: {}, live: false, t0: performance.now(), seq: 0, race: null, hostName: C.netName(r.body.name) };
			wireChan(L, L.pc.createDataChannel("s", { ordered: false, maxRetransmits: 0 }));
			wireChan(L, L.pc.createDataChannel("r", { ordered: true }));
			netStatus("Connecting to " + NET.hostName + "'s room (" + (C.WORLDS[r.body.room.w] || C.WORLDS.earth).name + ")…");
			netUi();
			L.pc.createOffer().then(function (o) { return L.pc.setLocalDescription(o); }).then(function () { return gathered(L.pc); })
				.then(function () { return sig("send", { code: code, from: peer, to: r.body.host, kind: "offer", sdp: L.pc.localDescription.sdp, name: netMyName() }); })
				.then(function (s) { if (!s.ok) throw new Error(s.body.error || "send failed"); netWaitAnswer(L, Date.now()); })
				.catch(function (e) { netFail("Could not start the connection: " + (e && e.message || e)); });
		});
	}
	function netWaitAnswer(L, since) {
		if (!NET || NET.hostLink !== L || L.open) return;
		if (Date.now() - since > 30000) { netFail("No answer from the host after 30 seconds. They may have left, or one of your networks blocks direct connections."); return; }
		sig("recv", { code: NET.code, peer: NET.peer }).then(function (r) {
			if (!NET || NET.hostLink !== L) return;
			var got = false;
			if (r.ok) {
				if (r.body.alive === false) { netFail("That room has closed."); return; }
				(r.body.msgs || []).forEach(function (m) {
					if (m.from !== L.peer) return;
					if (m.kind === "bye") { got = true; netFail("That room is full (8 players)."); }
					else if (m.kind === "answer" && !L.answered) { got = true; L.answered = true; L.pc.setRemoteDescription({ type: "answer", sdp: m.sdp }).catch(function (e) { netFail("Bad answer from the host: " + e.message); }); netStatus("Answer received: opening the direct connection…"); }
				});
			}
			if (!got && !L.answered) setTimeout(function () { netWaitAnswer(L, since); }, 1000);
			else if (L.answered) setTimeout(function () { if (NET && NET.hostLink === L && !L.open) netFail("The direct connection did not open. One of your networks (school, work or some mobile networks) probably blocks peer-to-peer connections; there is no relay server here."); }, 15000);
		});
	}
	function netFail(t) { netLeave(true); netStatus(t); toast("Online: " + t.split(".")[0]); }
	/* ---------- a connection opened / closed ---------- */
	function netLinkOpen(L) {
		L.open = true;
		if (NET.host) { NET.pend = Math.max(0, NET.pend - 1); return; } /* the joiner speaks first (hello) */
		var c = cars[player]; sendR(L, { t: "hello", name: netMyName(), car: c.type, color: c.color, v: C.NET.V });
	}
	function netLinkGone(L) {
		if (!NET || L.gone) return; L.gone = true;
		try { L.pc.close(); } catch (e) { /* ignore */ }
		if (NET.host) {
			if (NET.links[L.peer] === L) delete NET.links[L.peer];
			if (!L.open) NET.pend = Math.max(0, NET.pend - 1);
			if (L.slot && NET.roster[L.slot]) { toast((L.name || "A player") + " left"); delete NET.roster[L.slot]; remoteDrop(remotes[L.slot]); delete remotes[L.slot]; netPeers(); }
			netUi();
		} else if (NET.hostLink === L && L.open) { netLeave(true); netStatus("The host closed the room (or the connection dropped)."); toast("Online: the room closed"); }
	}
	/* ---------- data in ---------- */
	function netGotState(L, data) {
		if (!(data instanceof ArrayBuffer)) return;
		var pk = C.netDecode(data); if (!pk) return;
		if (NET.host) {
			if (!L.slot || !L.hello) return;
			pk.slot = L.slot; var fw = C.netSetSlot(data, L.slot);
			links().forEach(function (o) { if (o !== L && o.open) sendS(o, fw); });
		} else if (pk.slot === NET.slot) return;
		netState(pk);
	}
	function netGotEvent(L, data) {
		if (typeof data !== "string" || data.length > 20000) return;
		var o; try { o = JSON.parse(data); } catch (e) { return; }
		var e = C.netClean(o); if (!e) return;
		if (NET.host) {
			e.s = L.slot;
			if (e.t === "hello") {
				L.hello = true; L.name = e.name; L.car = e.car; L.color = e.color;
				NET.roster[L.slot] = { name: e.name, car: e.car, color: e.color };
				sendR(L, { t: "welcome", slot: L.slot, room: netRoomObj() });
				if (NET.race) sendR(L, { t: "race", laps: NET.race.laps, cd: 3, id: NET.race.id, late: 1 });
				netPeers(); toast(e.name + " joined"); netSay(null, e.name + " joined the room"); netStatus(""); netUi(); return;
			}
			if (!L.hello) return;
			if (e.t === "me") { L.name = e.name; L.car = e.car; L.color = e.color; NET.roster[L.slot] = { name: e.name, car: e.car, color: e.color }; netPeers(); return; }
			if (e.t === "chat" || e.t === "lap") bcastR(e, L);
			if (e.t === "bye") { netLinkGone(L); return; }
			if (["chat", "lap"].indexOf(e.t) < 0) return; /* joiners may not send room / race / peers events */
		}
		netEvent(e);
	}
	function netState(pk) {
		var R = remotes[pk.slot], now = performance.now();
		if (!R) { var ro = NET.roster[pk.slot] || {}; R = remotes[pk.slot] = { slot: pk.slot, buf: [], est: {}, name: ro.name || "Player", color: ro.color || "#888888", type: null }; }
		R.lastRecv = now; C.netClock(R.est, pk.t, now); C.netPush(R.buf, pk);
		if (phys && R.type !== pk.type) remoteBuild(R, pk.type);
	}
	function netEvent(e) {
		if (e.t === "welcome") {
			NET.slot = e.slot; NET.live = true; NET.roster[e.slot] = { name: netMyName(), car: cars[player].type, color: cars[player].color };
			netApplyRoom(e.room); netStart(); netStatus(""); netSpot();
			toast("You're in " + (e.room.host || "the host") + "'s room"); netSay(null, "Joined " + (e.room.host || "the host") + "'s room. Press Enter to chat.");
		} else if (e.t === "room") netApplyRoom(e.room);
		else if (e.t === "peers") {
			var keep = {}; NET.roster = {};
			e.list.forEach(function (p) { NET.roster[p.s] = { name: p.name, car: p.car, color: p.color }; keep[p.s] = 1; var R = remotes[p.s]; if (R) remoteLook(R, p.name, p.color); });
			Object.keys(remotes).forEach(function (s) { if (!keep[s]) { remoteDrop(remotes[s]); delete remotes[s]; } });
			/* the first list: same paint as someone already in the room and no paint picked = take another one for this room */
			if (!NET.painted && NET.slot > 0) {
				NET.painted = true;
				var mc = cars[player], taken = e.list.filter(function (p) { return p.s !== NET.slot; }).map(function (p) { return p.color; });
				if (!S.color && taken.indexOf(mc.color) >= 0) { var free = C.PAINT.filter(function (x) { return taken.indexOf(x) < 0; }), pc = free[(NET.slot * 3) % free.length] || mc.color; mc.color = pc; mc.paint.color.set(pc); }
			}
			netUi();
		} else if (e.t === "chat") { var ro = NET.roster[e.s]; netSay(ro ? ro.name : "Player", e.txt); sfx("pop", 0.4); }
		else if (e.t === "race") raceStart(e);
		else if (e.t === "stop") { NET.race = null; $("cs-ncount").hidden = true; netBoard(); netUi(); toast("Race ended"); }
		else if (e.t === "lap" && NET.race && e.id === NET.race.id) { var rr = NET.race.rows[e.s] || (NET.race.rows[e.s] = {}); rr.n = e.n; rr.total = e.total; rr.fin = e.fin; rr.time = e.time; netBoard(); if (e.fin) { var rn = NET.roster[e.s]; toast((rn ? rn.name : "Someone") + " finished: " + C.fmtLap(e.total)); } }
	}
	/* the host's peers list (with the host itself as slot 0) */
	function netPeers() {
		if (!NET || !NET.host) return;
		var c = cars[player]; NET.roster[0] = { name: netMyName(), car: c.type, color: c.color };
		var list = Object.keys(NET.roster).map(function (s) { var r = NET.roster[s]; if (remotes[s]) remoteLook(remotes[s], r.name, r.color); return { s: +s, name: r.name, car: r.car, color: r.color }; });
		bcastR({ t: "peers", list: list }); netUi();
	}
	/* ---------- the room's world ---------- */
	function netRoomObj() { return { w: S.world, g: gravity, map: C.mapEncode(curMap()), wx: S.weather, dr: S.drive, host: netMyName() }; }
	function netRoomChanged() {
		if (!NET || !NET.host || netApplying) return;
		clearTimeout(netRoomT);
		netRoomT = setTimeout(function () { if (!NET || !NET.host) return; var r = netRoomObj(); bcastR({ t: "room", room: r }); sig("room", { code: NET.code, peer: NET.peer, room: r }); }, 500);
	}
	function netApplyRoom(r) {
		if (!r) return;
		netApplying = true;
		try {
			var wasMap = W ? C.mapEncode(curMap()) : "", newWorld = S.world !== r.w;
			S.world = r.w; if (r.dr && C.DRIVE[r.dr]) S.drive = r.dr;
			var m = r.map ? C.mapDecode(r.map) : null;
			sharedMap = m ? { world: r.w, m: m } : null;
			S.g = Math.abs(r.g - C.WORLDS[r.w].g) < 1e-6 ? null : r.g;
			if (r.wx && C.weatherFor(r.w).indexOf(r.wx) >= 0) S.weather = r.wx;
			$("cs-world").value = S.world; $("cs-wdesc").textContent = C.WORLDS[S.world].desc;
			if (newWorld || !W || (r.map && r.map !== wasMap)) buildWorld();
			else { if (Math.abs(gravity - r.g) > 1e-6) setGravity(r.g); applyLighting(); }
			$("cs-wx").value = S.weather; syncGameUI();
		} finally { netApplying = false; }
	}
	/* ---------- other players' cars ---------- */
	function remoteBuild(R, type) {
		remoteDrop(R); R.type = type; var d = R.d = C.CARS[type];
		R.vis = makeCarMesh(d, R.color); scene.add(R.vis.group);
		R.label = netLabel(R.name); scene.add(R.label);
		if (!phys) return;
		var s = R.buf.length ? R.buf[R.buf.length - 1] : null, p = s ? s.p : [0, -500, 0], q = s ? s.q : [0, 0, 0, 1];
		var w = d.w || 1.8, h = d.h || 1.4, l = d.l || 4.5;
		R.body = phys.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p[0], p[1], p[2]).setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }).setGravityScale(0).setCcdEnabled(true).setLinearDamping(0).setAngularDamping(0.5));
		R.col = phys.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, l / 2).setDensity(d.mass / (w * h * l)).setFriction(0.4).setRestitution(0.15), R.body);
		R.col.setSensor(true); R.passT = performance.now() + 600; /* starts as a ghost until it is clear of my car */
	}
	function remoteDrop(R) {
		if (!R) return;
		if (R.vis) { scene.remove(R.vis.group); R.vis.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); R.vis = null; }
		if (R.label) { scene.remove(R.label); R.label.material.map.dispose(); R.label.material.dispose(); R.label = null; }
		if (R.body && phys) { try { phys.removeRigidBody(R.body); } catch (e) { /* world already freed */ } }
		R.body = null; R.type = null;
	}
	function remoteLook(R, name, color) {
		if (name !== R.name) { R.name = name; if (R.label) { scene.remove(R.label); R.label.material.map.dispose(); R.label.material.dispose(); R.label = netLabel(name); scene.add(R.label); } }
		if (color !== R.color) { R.color = color; if (R.vis) R.vis.paint.color.set(color); }
	}
	function netLabel(name) {
		var cv = document.createElement("canvas"), g = cv.getContext("2d"); g.font = "bold 34px system-ui, sans-serif";
		var w = Math.ceil(g.measureText(name).width) + 30; cv.width = w; cv.height = 52; g.font = "bold 34px system-ui, sans-serif";
		g.fillStyle = "rgba(10,14,22,0.72)"; var r = 14; g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, 52, r); g.arcTo(w, 52, 0, 52, r); g.arcTo(0, 52, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
		g.fillStyle = "#fff"; g.textBaseline = "middle"; g.fillText(name, 15, 27);
		var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
		var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true }));
		sp.scale.set(0.06 * w / 52, 0.06, 1); sp.renderOrder = 10; sp.center.set(0.5, 0);
		return sp;
	}
	function remoteSample(R, now) { return R.buf.length && R.est.off != null ? C.netSample(R.buf, now - R.est.off - C.NET.DELAY) : null; }
	/* called before every physics step: steer each remote body towards its player's pose (a bump pushes it, then it slides back) */
	var nq1 = null, nq2 = null;
	function netDrive(dt) {
		if (!NET) return;
		if (!nq1) { nq1 = new THREE.Quaternion(); nq2 = new THREE.Quaternion(); }
		var now = performance.now();
		for (var k in remotes) {
			var R = remotes[k]; if (!R.body) continue;
			var s = remoteSample(R, now); if (!s) continue;
			var t = R.body.translation(), dx = s.p[0] - t.x, dy = s.p[1] - t.y, dz = s.p[2] - t.z, err = Math.hypot(dx, dy, dz);
			/* a jump (reset, lag): move it there as a ghost, solid again only once it is clear of my car, so it never explodes out of it */
			if (err > 4) { R.body.setTranslation({ x: s.p[0], y: s.p[1], z: s.p[2] }, true); R.body.setRotation({ x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] }, true); R.body.setLinvel({ x: s.v[0], y: s.v[1], z: s.v[2] }, true); R.body.setAngvel({ x: 0, y: 0, z: 0 }, true); R.col.setSensor(true); R.passT = now + 600; continue; }
			if (R.passT && now > R.passT) { var mc = cars[player], mt = mc && mc.body.translation(), rr = (R.d.l || 4.5) / 2 + (mc ? mc.d.l / 2 : 2.5) + 0.5; if (!mt || Math.hypot(mt.x - t.x, mt.y - t.y, mt.z - t.z) > rr) { R.col.setSensor(false); R.passT = 0; } }
			var kk = 8, still = s.k === "late";
			R.body.setLinvel({ x: (still ? 0 : s.v[0]) + dx * kk, y: (still ? 0 : s.v[1]) + dy * kk, z: (still ? 0 : s.v[2]) + dz * kk }, true);
			var r = R.body.rotation(); nq1.set(s.q[0], s.q[1], s.q[2], s.q[3]); nq2.set(r.x, r.y, r.z, r.w).invert(); nq1.multiply(nq2);
			if (nq1.w < 0) { nq1.x = -nq1.x; nq1.y = -nq1.y; nq1.z = -nq1.z; nq1.w = -nq1.w; }
			var ang = 2 * Math.acos(Math.min(1, nq1.w)), sn = Math.sqrt(Math.max(1e-12, 1 - nq1.w * nq1.w)), wk = Math.min(ang * 10, 20) / sn;
			R.body.setAngvel({ x: nq1.x * wk, y: nq1.y * wk, z: nq1.z * wk }, true);
		}
	}
	/* every frame: draw each remote car where its player says it is (interpolated), wheels, lights, name tag */
	function netSync() {
		if (!NET) return;
		var now = performance.now();
		for (var k in remotes) {
			var R = remotes[k]; if (!R.vis) continue;
			var s = remoteSample(R, now); if (!s) { R.vis.group.visible = false; if (R.label) R.label.visible = false; continue; }
			var g = R.vis.group, d = R.d; g.visible = true; g.position.set(s.p[0], s.p[1], s.p[2]); g.quaternion.set(s.q[0], s.q[1], s.q[2], s.q[3]);
			var wxf = d.wxf != null ? d.wxf : d.wx, cp = [[wxf, d.wf], [-wxf, d.wf], [d.wx, d.wb], [-d.wx, d.wb]];
			for (var i = 0; i < 4; i++) { var w = R.vis.wheels[i]; if (!w || !s.w[i]) continue; w.piv.position.set(cp[i][0], s.w[i][0], cp[i][1]); w.piv.rotation.y = s.w[i][1]; w.spin.rotation.x = s.w[i][2]; }
			if (R.vis.flame) R.vis.flame.visible = !!s.boost;
			if (R.vis.lightR) R.vis.lightR.emissiveIntensity = s.brake ? 3.2 : (dayK < 0.45 ? 1.1 : 0.5);
			if (R.vis.lightF) R.vis.lightF.emissiveIntensity = dayK < 0.45 ? 5 : 1.2;
			if (R.vis.surf && R.vis.surf.prop) R.vis.surf.prop.rotation.z += (6 + s.thr * 40) * frameDt;
			if (R.label) { R.label.visible = true; R.label.position.set(s.p[0], s.p[1] + (d.h || 1.4) + 1.1, s.p[2]); R.label.material.opacity = now - R.lastRecv > 3000 ? 0.45 : 1; }
		}
	}
	function netWorldCleared() { for (var k in remotes) remoteDrop(remotes[k]); }
	function netWorldBuilt() {
		if (!NET) return;
		for (var k in remotes) { var R = remotes[k], t = R.buf.length ? R.buf[R.buf.length - 1].type : null; if (t) remoteBuild(R, t); }
		netRoomChanged(); if (NET.race) { NET.race = null; netBoard(); }
		if (!NET.host && NET.live) netSpot();
	}
	/* ---------- sending my car, 15 times a second (a timer, so it carries on when the picture is off screen) ---------- */
	function netStart() {
		clearInterval(netIv);
		netIv = setInterval(netSend, Math.round(1000 / C.NET.HZ));
		netUi();
	}
	function netSend() {
		if (!NET || !NET.live || !phys) return;
		var c = cars[player]; if (!c) return;
		var t = c.body.translation(), r = c.body.rotation(), lv = c.body.linvel(), w = [];
		for (var i = 0; i < 4; i++) { var sl = c.veh.wheelSuspensionLength(i), cp = c.veh.wheelChassisConnectionPointCs(i); w.push([cp && sl != null ? cp.y - sl : c.d.ry - c.d.rest, c.veh.wheelSteering(i) || 0, c.veh.wheelRotation(i) || 0]); }
		var b = C.netEncode({ slot: NET.slot, seq: NET.seq++, t: performance.now() - NET.t0, type: c.type, brake: !!(c.in && (c.in.br > 0 || c.in.hb)), boost: !!(c.in && c.in.boost && c.in.th > 0), air: !!(c.fly && c.fly.air), thr: c.fly ? c.fly.thr : (c.in ? c.in.th : 0), flap: c.fly ? c.fly.flap : 0, p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w], v: [lv.x, lv.y, lv.z], w: w });
		links().forEach(function (L) { if (L.open && (!NET.host || L.hello)) sendS(L, b); });
		/* tell the others when my car or paint changes */
		if (c.type !== NET.myCar || c.color !== NET.myColor) {
			NET.myCar = c.type; NET.myColor = c.color;
			if (NET.host) netPeers(); else sendR(NET.hostLink, { t: "me", name: netMyName(), car: c.type, color: c.color });
		}
		/* forget players whose packets stopped long ago */
		var now = performance.now();
		for (var k in remotes) if (now - remotes[k].lastRecv > 20000) { remoteDrop(remotes[k]); delete remotes[k]; }
		netCountdown();
	}
	/* ---------- races ---------- */
	function netRaceStart() {
		if (!NET || !NET.host) return;
		if (!hasLap()) { toast("Races need a lap circuit: the Earth or Jupiter-g test track, or a closed road"); return; }
		var e = { t: "race", laps: +$("cs-nlaps").value || 3, cd: 5, id: Math.random().toString(36).slice(2, 10) };
		bcastR(e); raceStart(e);
	}
	function netRaceStop() { if (!NET || !NET.host) return; bcastR({ t: "stop" }); netEvent({ t: "stop" }); }
	function raceStart(e) {
		if (!hasLap()) { toast("The host started a race, but there is no lap circuit on your map"); return; }
		if (cars[player] && cars[player].d.fly) togglePlane();
		var rows = {}; Object.keys(NET.roster).forEach(function (s) { rows[s] = { n: 0, total: null, fin: false }; });
		NET.race = { id: e.id, laps: e.laps, goAt: performance.now() + e.cd * 1000, go: false, t0: null, rows: rows };
		if (replay) replayStop(true); paused = false; $("cs-pause").textContent = "❚❚ Pause";
		lapReset(); repair(cars[player]); camSnap = true;
		toast("🏁 Race: " + e.laps + " lap" + (e.laps > 1 ? "s" : "") + ". Get ready!"); netBoard(); netUi();
	}
	function gridPose(slot) {
		var g = C.netGrid(slot), q = lapPath ? C.pathPoint(lapPath, lapPath.closed ? g.s : Math.max(0, 4 + g.s + 12)) : C.trackPoint(g.s);
		return { x: q.x + Math.cos(q.dir) * g.lane, z: q.z - Math.sin(q.dir) * g.lane, yaw: q.dir };
	}
	/* a joiner starts on its own spot (the grid on a lap circuit, else beside the start), not on top of the host */
	function netSpot() {
		var c = cars[player]; if (!c || NET.slot < 1) return;
		var p = hasLap() && !c.d.fly ? gridPose(NET.slot) : (function () { var s0 = c.d.fly ? planeStart() : startPose(0), off = NET.slot * 7; return { x: s0.x + Math.cos(s0.yaw) * off, z: s0.z - Math.sin(s0.yaw) * off, yaw: s0.yaw }; })();
		c.body.setTranslation({ x: p.x, y: hAt(p.x, p.z) + c.d.wr + c.d.rest - c.d.ry + 0.4, z: p.z }, true);
		c.body.setRotation(qYaw(p.yaw), true); c.body.setLinvel({ x: 0, y: 0, z: 0 }, true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true); c.lastV = null; camSnap = true; lapReset();
	}
	/* in step(): hold my car on the grid until the countdown ends */
	function netHold() {
		var R = NET && NET.race; if (!R || R.go) return;
		var c = cars[player]; if (!c || c.d.fly) return;
		if (performance.now() >= R.goAt) { R.go = true; R.t0 = simT; lapReset(); toast("GO!"); sfx("pop", 1); return; }
		var p = gridPose(Math.max(0, NET.slot));
		c.body.setTranslation({ x: p.x, y: hAt(p.x, p.z) + c.d.wr + c.d.rest - c.d.ry + 0.05, z: p.z }, true);
		c.body.setRotation(qYaw(p.yaw), true); c.body.setLinvel({ x: 0, y: 0, z: 0 }, true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true); c.lastV = null;
	}
	function netCountdown() {
		var R = NET && NET.race, el = $("cs-ncount");
		if (!R || R.go) { if (!el.hidden && (!R || performance.now() - R.goAt > 900)) el.hidden = true; else if (R && R.go && !el.hidden) el.textContent = "GO!"; return; }
		var left = Math.ceil((R.goAt - performance.now()) / 1000); el.hidden = false; el.textContent = left > 0 ? String(left) : "GO!";
	}
	/* from lapTick: a lap I finished */
	function netLap(e) {
		var R = NET && NET.race; if (!R || !R.go || R.t0 == null) return;
		var me = R.rows[NET.slot] || (R.rows[NET.slot] = {}); if (me.fin) return;
		me.n = lap.laps; me.time = e.time; me.total = simT - R.t0; me.fin = me.n >= R.laps;
		var ev = { t: "lap", id: R.id, n: me.n, time: e.time, total: me.total, fin: me.fin };
		if (NET.host) bcastR(Object.assign({ s: 0 }, ev)); else sendR(NET.hostLink, ev);
		if (me.fin) { var pos = C.raceOrder(raceRows()).findIndex(function (x) { return x.s === NET.slot; }) + 1; setTimeout(function () { toast("🏁 You finished " + (["1st", "2nd", "3rd"][pos - 1] || pos + "th") + " in " + C.fmtLap(me.total)); }, 1300); }
		netBoard();
	}
	function raceRows() { var R = NET.race; return Object.keys(R.rows).map(function (s) { var r = R.rows[s], ro = NET.roster[s]; return { s: +s, name: ro ? ro.name : "Player", n: r.n || 0, total: r.total, fin: r.fin }; }); }
	function netBoard() {
		var el = $("cs-nboard");
		if (!NET || !NET.race) { el.hidden = true; return; }
		var R = NET.race;
		el.hidden = false;
		el.innerHTML = '<div class="cs-nbh">🏁 Race · ' + R.laps + ' lap' + (R.laps > 1 ? "s" : "") + '</div>' + C.raceOrder(raceRows()).map(function (r, i) {
			var me = r.s === NET.slot;
			return '<div class="cs-nbr' + (me ? " me" : "") + '"><span>' + (i + 1) + '.</span><b>' + esc(r.name) + '</b><i>' + (r.fin ? "🏁 " + C.fmtLap(r.total) : "Lap " + Math.min(R.laps, (r.n || 0) + 1) + "/" + R.laps + (r.total ? " · " + C.fmtLap(r.total) : "")) + '</i></div>';
		}).join("");
	}
	/* ---------- chat ---------- */
	function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function netSay(who, txt) {
		var log = $("cs-nlog"), d = document.createElement("div"); d.className = "cs-nl" + (who ? "" : " sys");
		d.innerHTML = who ? "<b>" + esc(who) + ":</b> " + esc(txt) : esc(txt);
		log.appendChild(d); while (log.children.length > 6) log.removeChild(log.firstChild);
		setTimeout(function () { d.classList.add("old"); }, 12000);
	}
	function netChatSend(txt) {
		txt = C.netText(txt); if (!txt || !NET || !NET.live) return;
		var e = { t: "chat", txt: txt };
		if (NET.host) bcastR(Object.assign({ s: 0 }, e)); else sendR(NET.hostLink, e);
		netSay(netMyName(), txt);
	}
	function netChatOpen() { var n = $("cs-net"); n.classList.add("cs-chatting"); var i = $("cs-nmsg"); i.focus(); }
	function netChatClose() { $("cs-net").classList.remove("cs-chatting"); $("cs-nmsg").blur(); }
	/* ---------- leaving ---------- */
	function netLeave(quiet) {
		if (!NET) return;
		var N = NET;
		links().forEach(function (L) { sendR(L, { t: "bye" }); });
		setTimeout(function () { (N.host ? Object.keys(N.links).map(function (k) { return N.links[k]; }) : [N.hostLink]).forEach(function (L) { L.gone = true; try { L.pc.close(); } catch (e) { /* ignore */ } }); }, 80);
		if (N.host) { clearTimeout(N.pollT); sig("close", { code: N.code, peer: N.peer }); }
		clearInterval(netIv); clearTimeout(netRoomT);
		NET = null;
		for (var k in remotes) remoteDrop(remotes[k]); remotes = {};
		$("cs-ncount").hidden = true; $("cs-nlog").innerHTML = ""; netBoard();
		if (!quiet) toast("You left the room");
		netUi();
	}
	window.addEventListener("pagehide", function () { if (NET) netLeave(true); });
	/* ---------- UI ---------- */
	function netStatus(t) { $("cs-nstat").textContent = t || ""; $("cs-nstat2").textContent = t || ""; }
	function netLink() { return location.origin + "/car-sandbox?room=" + NET.code; }
	function netCopyLink(silent) {
		if (!NET) return; var u = netLink();
		(navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { if (!silent) toast("Room link copied: send it to your friends"); else netStatus("Link copied. Send it to your friends, or tell them the code."); }, function () { if (!silent) prompt("Copy this link", u); });
	}
	function netUi() {
		var on = !!NET, live = on && NET.live;
		$("cs-noff").hidden = on; $("cs-non").hidden = !on;
		$("cs-net").hidden = !live;
		var n = live ? Object.keys(NET.roster).length : 0;
		$("cs-netn").textContent = live ? " " + n : ""; $("cs-netbtn").classList.toggle("cs-on", live);
		$("cs-nlabel").textContent = live ? "room " + NET.code + " · " + n + " player" + (n === 1 ? "" : "s") : "";
		$("cs-nopen").textContent = live ? "🌐 Room " + NET.code + " (open)" : "🌐 Play online";
		if (!on) return;
		$("cs-ncodeb").textContent = NET.code;
		var list = Object.keys(NET.roster).map(function (s) { var r = NET.roster[s]; return '<li><i style="background:' + r.color + '"></i>' + esc(r.name) + (+s === 0 ? " <small>host</small>" : "") + (+s === NET.slot ? " <small>you</small>" : "") + ' <small>' + esc((C.CARS[r.car] || {}).name || "") + '</small></li>'; }).join("");
		$("cs-nlist").innerHTML = list || "<li><small>Waiting for players…</small></li>";
		$("cs-nhostrow").hidden = !NET.host; $("cs-njoinrow").hidden = NET.host;
		$("cs-nstart").hidden = !!NET.race; $("cs-nstop").hidden = !NET.race;
		$("cs-nwait").textContent = NET.host ? "" : "The host picks the world, gravity and map, and starts races.";
	}
	function netPop(open) { var p = $("cs-npop"); p.hidden = open == null ? !p.hidden : !open; $("cs-netbtn").setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) { $("cs-pop").hidden = true; $("cs-cpop").hidden = true; $("cs-nname").value = NETP.name || ""; netUi(); } }
	function setupNet() {
		$("cs-netbtn").addEventListener("click", function () { netPop(); });
		$("cs-nopen").addEventListener("click", function () { netPop(true); stage.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
		$("cs-npopx").addEventListener("click", function () { netPop(false); });
		$("cs-nname").addEventListener("change", function () { NETP.name = C.netName(this.value); this.value = NETP.name; try { localStorage.setItem(NKEY, JSON.stringify(NETP)); } catch (e) { /* ignore */ } if (NET && NET.live) { if (NET.host) netPeers(); else sendR(NET.hostLink, { t: "me", name: netMyName(), car: cars[player].type, color: cars[player].color }); } });
		$("cs-nmake").addEventListener("click", function () { $("cs-nname").dispatchEvent(new Event("change")); netMake(); });
		$("cs-njoin").addEventListener("click", function () { $("cs-nname").dispatchEvent(new Event("change")); netJoin($("cs-ncode").value); });
		$("cs-ncode").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("cs-njoin").click(); } });
		$("cs-ncopy").addEventListener("click", function () { netCopyLink(false); });
		$("cs-nleave").addEventListener("click", function () { netLeave(false); netStatus(""); });
		$("cs-nstart").addEventListener("click", netRaceStart);
		$("cs-nstop").addEventListener("click", netRaceStop);
		$("cs-nchatbtn").addEventListener("click", function () { if ($("cs-net").classList.contains("cs-chatting")) netChatClose(); else netChatOpen(); });
		$("cs-nform").addEventListener("submit", function (e) { e.preventDefault(); var i = $("cs-nmsg"); netChatSend(i.value); i.value = ""; netChatClose(); });
		$("cs-nmsg").addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); netChatClose(); } e.stopPropagation(); });
		netUi();
		var q = /[?&]room=([A-Za-z0-9]{6})/.exec(location.search);
		if (q) { netPop(true); $("cs-ncode").value = q[1]; netJoin(q[1]); }
	}
	function setupDomOnly() { msg("Loading the 3D engine and the physics (about 1 MB)…"); }
	var test = document.createElement("canvas");
	if (!(test.getContext("webgl2") || test.getContext("webgl"))) { msg("Your browser has WebGL switched off, so the 3D view can't start. Try another browser, or turn on hardware acceleration."); return; }
	loadLibs().then(function (m) {
		THREE = m[0]; RAPIER = m[1];
		initRenderer(); parts.init(); setupUI(); setupMapUI(); setupCamDrag();
		buildWorld(); msg(""); setupNet();
		if (Q.world || Q.car || Q.g != null) syncUrl();
		requestAnimationFrame(frame);
	}).catch(function (e) { console.error(e); msg("The 3D engine could not load (" + (e && e.message || e) + "). Check your connection and reload the page."); });

	window.MESCarSandbox = {
		state: function () { var c = cars[player]; return c ? { cam: camera.position.toArray().map(Math.round), pos: c.body.translation(), v: c.veh.currentVehicleSpeed(), damage: c.damage, cars: cars.length, objs: objs.length, g: phys.gravity.y, contact: c.anyContact } : null; },
		/* run the simulation forward without animation frames (a hidden tab has none): MESCarSandbox.run(seconds, {th, st, br, boost}) */
		run: function (sec, inp) { var saved = touch; touch = Object.assign({ th: 0, br: 0, l: 0, r: 0, hb: 0, boost: 0 }, inp || {}); for (var i = 0; i < sec * 60; i++) advance(1 / 60); touch = saved; render(); return this.state(); },
		/* let the computer drive the player's car (testing the lap timer): MESCarSandbox.auto(seconds) */
		auto: function (sec) { var a = S.ai; S.ai = "cruise"; autoPilot = true; for (var i = 0; i < sec * 60; i++) advance(1 / 60); autoPilot = false; S.ai = a; render(); return { laps: lap.laps, last: lap.last, best: REC.laps[lapKey()], hud: $("cs-lapnow").textContent + " | " + $("cs-lapbest").textContent, toast: $("cs-toast").textContent }; },
		car: function () { return cars[player]; }, replay: function () { replayStart(); return replay ? { len: replay.len, frames: replay.frames.length } : null; }, replayStep: function (sec) { for (var i = 0; i < sec * 60; i++) advance(1 / 60); render(); return replay ? replay.t : null; }, night: setNight, weather: setWeather, tod: function (h) { setTod(h); return { day: dayK, sun: sunLight.intensity, hemi: hemi.intensity }; }, ghostShown: function () { return !!(ghostMesh && ghostMesh.visible); },
		/* planes: fly("plane" | "jet"), airStart(), plane() = its state, setThr(0..1), flap(n); run(sec, {pit, rol, rudl, rudr, fbrk}) flies it */
		fly: function (k) { togglePlane(k || "plane"); return this.plane(); }, airStart: function () { airStart(); return this.plane(); },
		plane: function () { var c = cars[player]; if (!c || !c.fly) return null; var t = c.body.translation(), lv = c.body.linvel(), F = c.fly, ip = { q: new THREE.Quaternion(c.body.rotation().x, c.body.rotation().y, c.body.rotation().z, c.body.rotation().w) }, at = C.attitude(new THREE.Vector3(0, 0, 1).applyQuaternion(ip.q), new THREE.Vector3(0, 1, 0).applyQuaternion(ip.q));
			return { type: c.type, x: +t.x.toFixed(1), y: +t.y.toFixed(1), z: +t.z.toFixed(1), agl: +planeAgl(c, t).toFixed(1), vs: +lv.y.toFixed(2), V: F.o ? +F.o.V.toFixed(1) : 0, alpha: F.o ? +(F.o.alpha * 57.3).toFixed(1) : 0, stall: F.o ? +F.o.stall.toFixed(2) : 0, pitch: +(at.pitch * 57.3).toFixed(1), bank: +(at.bank * 57.3).toFixed(1), thr: F.thr, flap: F.flap, air: F.air, contact: c.anyContact, damage: Math.round(c.damage), hud: $("cs-fias").textContent + " | " + $("cs-falt").textContent + " | " + $("cs-fvs").textContent, lesson: $("cs-flesson").textContent, toast: $("cs-toast").textContent }; },
		setThr: function (v) { var c = cars[player]; if (c && c.fly) c.fly.thr = v; }, flap: function (n) { var c = cars[player]; if (c && c.fly) c.fly.flap = n; },
		net: function () { return NET ? { code: NET.code, host: NET.host, slot: NET.slot, live: NET.live, roster: NET.roster, race: NET.race, remotes: Object.keys(remotes).map(function (k) { var R = remotes[k], s = remoteSample(R, performance.now()); return { slot: R.slot, name: R.name, type: R.type, n: R.buf.length, p: s && s.p.map(function (x) { return +x.toFixed(2); }), body: !!R.body }; }), log: $("cs-nlog").textContent, board: $("cs-nboard").textContent } : null; }, netMake: netMake, netJoin: netJoin, netLeave: netLeave, netChat: netChatSend, netRace: function (n) { $("cs-nlaps").value = String(n || 1); netRaceStart(); }, netSend: netSend,
		render: function () { render(); drawMini(); }, editor: function () { edOpenNow(); return ed; }, editorDraw: function () { drawEditor(); }, advance: function (dt) { advance(dt); }, camera: function () { return camera; }, spawn: spawnKind, layout: spawnLayout, gravity: setGravity, cam: function (m) { S.cam = m; camSnap = true; }
	};
})();
