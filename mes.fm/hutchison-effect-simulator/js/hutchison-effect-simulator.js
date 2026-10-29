/* MESHut: Hutchison Effect Simulator model (pure, no DOM; node-testable: node tool_apps_src/hutchison-effect-simulator-tests.js).
   Two layers:
   1. Fields (ordinary electromagnetism, simplified to a top-down floor plan): every device is a point source with a quasi-static
      electrode field E = V a / r^2, an RF part (short-dipole near + far field), a magnetic dipole part B = (mu0 / 4 pi) 2 m / r^3,
      a frequency and a phase. Sources at the same frequency that are cabled together are phase-locked and add as vector phasors
      (interference: nodes and antinodes); free-running sources add in power. Spark gaps add pulses; RF sources can reflect off the walls.
   2. Effects (best estimates fitted to the reported phenomena): a "Hutchison drive" D (0..1) built from the field strength,
      how many sources overlap, how many different frequencies meet, a DC bias (the Van de Graaff) and spark pulses; per sample an
      event rate per hour for each reported effect, scaled by the material's response and the sample's mass. Calibrated so that a
      LADS-like active area gives roughly one to two events an hour (Hutchison: "up to every 30 minutes" by 1989; Hathaway's 1993
      goal: "more than once per hour"). */
(function (root) {
	"use strict";
	var C = 299792458, EPS0 = 8.854187817e-12, TAU = Math.PI * 2;

	/* ---------- equipment catalogue ---------- */
	// kind: hv (high-voltage electrode), rf (antenna), dc (static), pulse (spark gap), tank, mag (coil), sig (signal generator), pow (power), inst (instrument), op (person), zone, area (furniture), rad (radioactive source)
	var DEV = {
		tesla_large: {name: "Large Tesla coil", kind: "hv", color: "#f59e0b", size: 0.9, a: 0.22, mDip: 60, eff: 0.002,
			def: {kV: 250, f: 180e3, P: 500, duty: 100, phase: 0},
			spec: "1.2-1.5 m tall secondary of many hundred turns of fine wire, 15-25 turn primary of heavy wire (about 45 cm across), toroid or ball on top. 150-500 kV at 80-400 kHz.",
			used: "LADS Phase I: about 4.5 ft tall, primary of 21 turns of #8 enamelled wire about 1.5 ft across, a brass ring at the bottom fed from a Tesla discharge coil, a toroid at the top charged by the snapping gap. It was not driven directly: it was fed loosely, inductively and capacitively, through toroid-coupled coils from the main supply (George Hathaway, 1993).",
			plan: "A 100-300 kV spark-gap or solid-state coil is the core of every replication. Keep 3x the spark length clear around the top load and ground it to a dedicated ground rod."},
		tesla_small: {name: "Small Tesla coil (tube driven)", kind: "hv", color: "#fbbf24", size: 0.55, a: 0.07, mDip: 12, eff: 0.004,
			def: {kV: 60, f: 900e3, P: 150, duty: 100, phase: 0},
			spec: "30-60 cm secondary, vacuum-tube oscillator (CW, clean spectrum). 30-100 kV at 0.5-3 MHz.",
			used: "LADS Phase I: a small Tesla coil driven by twin 807 vacuum-tube oscillators, giving a clean spectrum (George Hathaway, 1993).",
			plan: "A vacuum-tube Tesla coil (VTTC) with 807, 811 or 833 tubes gives a continuous, clean wave; a solid-state (SSTC) coil is the modern equivalent."},
		tesla_dumbbell: {name: "Double-ended (dumbbell) Tesla coil", kind: "hv", color: "#f97316", size: 1.4, a: 0.1, mDip: 25, eff: 0.002, ends: 0.7,
			def: {kV: 150, f: 400e3, P: 300, duty: 100, phase: 0},
			spec: "A horizontal secondary with a large dome on each end (opposite polarity), fed in the middle by one or two single-turn toroidal primaries.",
			used: "LADS Phase I: two toroidal single-turn primaries, a multi-wound secondary and two 6-8 inch domes on the ends; hung from the ceiling. One end connected to the capacitively coupled toroidal coil stack (George Hathaway, 1993).",
			plan: "Two ends = two sources in antiphase: a field null in the middle and strong gradients at the domes. Hang it on insulators (nylon rope, acrylic rod)."},
		vdg: {name: "Van de Graaff generator", kind: "dc", color: "#38bdf8", size: 0.6, a: 0.15, mDip: 0, eff: 0,
			def: {kV: 180, f: 0, P: 50, duty: 100, phase: 0},
			spec: "Belt-charged sphere, 150-500 kV DC at a few microamps. Static field only.",
			used: "The first effects came when John added a Van de Graaff generator to two Tesla coils (1979-1981). LADS: 150,000-200,000 volts at microamps (George Hathaway, 1993).",
			plan: "A 200-400 kV teaching Van de Graaff (30-40 cm sphere) gives the DC bias. Polarity can be set with the sign of the voltage."},
		hvps: {name: "High-voltage DC power supply", kind: "pow", color: "#ef4444", size: 0.6, a: 0.04, mDip: 0, eff: 0,
			def: {kV: 21, f: 0, P: 400, duty: 100, phase: 0},
			spec: "15-30 kV DC, 10-50 mA (neon sign transformer + rectifier, X-ray or Hipotronics-type supply).",
			used: "LADS Phase I: high voltage entered the system at 21 kV DC through capacitively coupled toroid coils; a separate 15 kV DC supply fed the spark gap (George Hathaway, 1993).",
			plan: "Use a supply with current limiting, a bleeder resistor and an interlocked dump stick for the capacitors."},
		mains: {name: "Wall outlet (110-120 V)", kind: "pow", color: "#a3a3a3", size: 0.35, a: 0.01, mDip: 0, eff: 0,
			def: {kV: 0.12, f: 60, P: 1650, duty: 100, phase: 0},
			spec: "One 15 A branch circuit = 1,650 W at 110 V (a 20 A circuit = 2,200 W).",
			used: "The 1981-83 lab ran from a single 110 V, 10-15 A wall socket (George Hathaway, 1993). Hutchison's affidavit: total input 75 W to 4 kW at 110 V.",
			plan: "Count the watts: everything on one 15 A circuit must stay under about 1,650 W. Put the noisiest gear on its own circuit with a line filter."},
		sparkgap: {name: "Spark gap + capacitor", kind: "pulse", color: "#e879f9", size: 0.45, a: 0.05, mDip: 8, eff: 0,
			def: {kV: 15, f: 500e3, P: 30, duty: 100, phase: 0, C: 0.1, gap: 40},
			spec: "A capacitor (about 0.1 uF) charged to 10-15 kV and dumped through an air gap of about 1 cm (0.5 in) every 30-40 s: a broadband pulse ringing at the circuit's frequency.",
			used: "LADS Phase I: a spark gap arcing every 40 s or so, fed by a 15 kV DC supply through about a 0.1 uF capacitor with a wire gap across its terminals, and a snapping gap firing every 30-40 s at 10-15 kV with about a half-inch opening (George Hathaway, 1993).",
			plan: "0.1 uF at 15 kV stores 11 J: lethal. Use pulse-rated (film / mica) capacitors, a series charging resistor and a grounded enclosure."},
		tank: {name: "Tank circuit / tuning section", kind: "tank", color: "#a78bfa", size: 0.6, a: 0.05, mDip: 10, eff: 0,
			def: {kV: 15, f: 0, P: 100, duty: 100, phase: 0, C: 10, L: 80},
			spec: "High-voltage capacitors and an inductor in parallel; resonates at f = 1 / (2 pi sqrt(L C)) and drives a Tesla coil primary.",
			used: "LADS Phase I: a tank circuit of tuned capacitors and inductors in parallel, and a main tuning section of high-voltage capacitors (up to 15 kV, a few picofarads) controlling the energy into the large Tesla coil's primary (George Hathaway, 1993).",
			plan: "Cable a tank to a Tesla coil and the simulator tunes the coil's output by how close the tank's frequency is to the coil's."},
		inductor: {name: "Inductor / toroid coil", kind: "mag", color: "#22c55e", size: 0.5, a: 0.04, mDip: 40, eff: 0,
			def: {kV: 2, f: 180e3, P: 100, duty: 100, phase: 0, I: 10, N: 20, R: 0.15},
			spec: "Air-core or iron-core coils and toroids: a magnetic near field, B = (mu0 / 4 pi) 2 m / r^3 with m = N I pi R^2.",
			used: "LADS Phase I: capacitively coupled toroid coil stack, a Tesla discharge coil (double iron core) feeding the brass ring, inductors along the back wall (George Hathaway, 1993).",
			plan: "Toroids keep their field inside; open solenoids and pancake coils throw it out to the target."},
		rf_tx: {name: "RF transmitter", kind: "rf", color: "#0ea5e9", size: 0.5, a: 0.03, mDip: 2, eff: 0.6, dirK: 0.6,
			def: {kV: 0.3, f: 14e6, P: 100, duty: 100, phase: 0},
			spec: "Short-wave / amateur-radio transmitter, 1.8-30 MHz, 10-1,000 W into an antenna. Near the antenna the field is reactive (falls as 1/r^3); farther out it radiates (1/r).",
			used: "John used radio-frequency gear (later much of it salvaged Canadian Navy electronics, 1996). The RF interference reached TVs up to half a mile away, so the lab ran at night (George Hathaway, 1993).",
			plan: "Transmitting needs an amateur-radio licence and a shielded room or a dummy load; RF burns are real at 100 W near the antenna."},
		siggen: {name: "Signal generator", kind: "sig", color: "#60a5fa", size: 0.35, a: 0.02, mDip: 0.2, eff: 0.05,
			def: {kV: 0.02, f: 1000, P: 5, duty: 100, phase: 0},
			spec: "1 Hz-20 MHz function / RF generator, a few volts out. Cable it to a device to modulate that device (adds sidebands at f +/- the generator's frequency).",
			used: "Signal generators and audio oscillators set the modulation and pulse rates of the larger equipment.",
			plan: "A cheap DDS generator plus a gate-driver lets you modulate a solid-state Tesla coil; sweep slowly and log the time of every event."},
		fieldshaper: {name: "Field shaper (ball + halo ring)", kind: "hv", color: "#14b8a6", size: 0.5, a: 0.12, mDip: 6, eff: 0.002, dirK: 0.7,
			def: {kV: 80, f: 180e3, P: 0, duty: 100, phase: 0},
			spec: "A coil topped by an aluminium ball with a ring (annulus) around it: shapes and aims the field toward the target. Turn it to aim it.",
			used: "LADS Phase I: a field shaper unit with a coil and an aluminium ball with a halo ring annulus (George Hathaway, 1993).",
			plan: "Cable it from a Tesla coil to take that coil's frequency and phase."},
		dur: {name: "Radioactive source (depleted uranium)", kind: "rad", color: "#84cc16", size: 0.25, a: 0.01, mDip: 0, eff: 0,
			def: {kV: 0, f: 0, P: 0, duty: 100, phase: 0},
			spec: "A weak alpha / beta source ionises the air nearby, which makes gaps and corona fire more readily.",
			used: "John would put a small amount of depleted uranium near the power supply (George Hathaway, 1993).",
			plan: "Optional. In the model it adds to the pulse factor of spark gaps and supplies within 2 m."},
		camera: {name: "Video camera", kind: "inst", color: "#e5e7eb", size: 0.35, a: 0, mDip: 0, eff: 0,
			def: {kV: 0, f: 0, P: 10, duty: 100, phase: 0},
			spec: "Records the target area. Glitches (tearing, colour loss, dropouts) when the local field passes its immunity level, typically 3-10 V/m for consumer gear and 30 V/m or more for shielded gear.",
			used: "The 1988-1989 footage shows frequent EMF interference: rolling, colour loss and dropouts while the equipment ran.",
			plan: "Use a long lens from outside the strongest field, shielded cables and battery power, and a second camera as a control."},
		meter: {name: "Field meter / chart recorder", kind: "inst", color: "#d4d4d8", size: 0.35, a: 0, mDip: 0, eff: 0,
			def: {kV: 0, f: 0, P: 5, duty: 100, phase: 0},
			spec: "Reads |E| and |B| at its position (hover it or select it).",
			used: "George Hathaway's 1993 proposal: chart recorders and automated data acquisition to instrument every component.",
			plan: "Log field, supply current, gap firings and room temperature with a timestamp so events can be matched to conditions."},
		operator: {name: "Operator", kind: "op", color: "#fde68a", size: 0.45, a: 0, mDip: 0, eff: 0,
			def: {kV: 0, f: 0, P: 0, duty: 100, phase: 0},
			spec: "Shows the field where you stand, compared with the occupational reference level for that frequency (ICNIRP).",
			used: "John operated the equipment and held the camera at the same time in 1981 (George Hathaway, 1993); John is said to be sensitive to the fields.",
			plan: "Stand where the field is lowest. Keep one hand in your pocket near high voltage."},
		zone: {name: "Active (target) area", kind: "zone", color: "#facc15", size: 2.5,
			def: {kV: 0, f: 0, P: 0, duty: 100, phase: 0, w: 3, h: 2.5},
			spec: "The place where the fields cross. Samples inside it are shown in the target camera view.",
			used: "LADS Phase I: a marked active area between the large Tesla coil, the field shaper and the small Tesla coil.",
			plan: "A wooden or acrylic table (no metal) in the overlap zone, marked with a grid for measuring lifts."},
		area: {name: "Bench / cabinet / wall", kind: "area", color: "#64748b", size: 1,
			def: {kV: 0, f: 0, P: 0, duty: 100, phase: 0, w: 1.5, h: 0.6},
			spec: "Furniture and room partitions. No field of its own.",
			used: "Rows of heavy equipment around the target were said to reflect the field back into it (1988-1989 lab).",
			plan: "Metal cabinets near RF sources make reflections; the walls slider models that."}
	};
	var ORDER = ["tesla_large", "tesla_small", "tesla_dumbbell", "vdg", "fieldshaper", "rf_tx", "siggen", "sparkgap", "tank", "inductor", "hvps", "mains", "dur", "camera", "meter", "operator", "zone", "area"];
	var EMITS = {hv: 1, rf: 1, dc: 1, pulse: 1, tank: 1, mag: 1, sig: 1, pow: 1};

	/* ---------- materials and sample presets ---------- */
	// sus: response to each effect, 0..1 (best estimates from the reported samples)
	function S(l, w, j, f, g, u, b, z, v) { return {lev: l, wob: w, jel: j, frc: f, glo: g, fum: u, bub: b, fus: z, van: v}; }
	var MAT = {
		al: {name: "Aluminium", rho: 2700, metal: 1, ferro: 0, color: "#cbd5e1", sus: S(1, 1, 0.8, 0.9, 0.6, 0.5, 0, 0.5, 0.35)},
		steel: {name: "Steel", rho: 7850, metal: 1, ferro: 1, color: "#94a3b8", sus: S(0.9, 1, 0.9, 1, 0.7, 0.5, 0, 0.6, 0.3)},
		iron: {name: "Iron", rho: 7870, metal: 1, ferro: 1, color: "#78716c", sus: S(0.9, 1, 0.9, 0.9, 0.7, 0.4, 0, 0.6, 0.3)},
		cu: {name: "Copper", rho: 8960, metal: 1, ferro: 0, color: "#d97706", sus: S(0.9, 1, 0.7, 0.4, 0.6, 0.3, 0, 0.5, 0.3)},
		brass: {name: "Brass", rho: 8500, metal: 1, ferro: 0, color: "#ca8a04", sus: S(0.9, 1, 0.7, 0.5, 0.6, 0.3, 0, 0.5, 0.3)},
		mo: {name: "Molybdenum", rho: 10280, metal: 1, ferro: 0, color: "#9ca3af", sus: S(0.7, 0.9, 0.6, 0.5, 0.8, 0.3, 0, 0.4, 0.25)},
		wood: {name: "Wood", rho: 600, metal: 0, ferro: 0, color: "#a16207", sus: S(0.7, 0.9, 0.05, 0.1, 0.1, 0.6, 0, 0.6, 0.1)},
		water: {name: "Water", rho: 1000, metal: 0, ferro: 0, liquid: 1, color: "#3b82f6", sus: S(0.5, 1, 0, 0, 0.1, 0.3, 1, 0, 0.1)},
		paper: {name: "Paper", rho: 800, metal: 0, ferro: 0, color: "#f5f5f4", sus: S(0.8, 1, 0, 0.1, 0.1, 1, 0, 0.2, 0.15)},
		plastic: {name: "Plastic", rho: 1000, metal: 0, ferro: 0, color: "#f472b6", sus: S(0.7, 1, 0.2, 0.2, 0.1, 0.5, 0, 0.4, 0.1)},
		glass: {name: "Glass", rho: 2500, metal: 0, ferro: 0, color: "#a5f3fc", sus: S(0.6, 0.8, 0.1, 0.7, 0.3, 0.2, 0, 0.3, 0.1)},
		rubber: {name: "Rubber", rho: 1100, metal: 0, ferro: 0, color: "#1f2937", sus: S(0.6, 0.9, 0.3, 0.1, 0.1, 0.6, 0, 0.8, 0.1)},
		bto: {name: "Barium titanate", rho: 6020, metal: 0, ferro: 0, color: "#e2e8f0", sus: S(0.8, 1, 0.1, 0.5, 0.3, 0.3, 0, 0.3, 0.2)}
	};
	var SAMPLES = {
		al_bar: {name: "Aluminium bar", mat: "al", m: 0.3, shape: "bar"},
		steel_bar: {name: "Steel bar", mat: "steel", m: 0.8, shape: "bar"},
		iron_file: {name: "Iron file", mat: "iron", m: 0.15, shape: "bar"},
		cu_pipe: {name: "Copper pipe", mat: "cu", m: 0.4, shape: "rod"},
		mo_rod: {name: "Molybdenum rod", mat: "mo", m: 0.25, shape: "rod"},
		spoon: {name: "Steel spoon", mat: "steel", m: 0.04, shape: "spoon"},
		can: {name: "Aluminium drink can", mat: "al", m: 0.015, shape: "can"},
		wood: {name: "Wooden block", mat: "wood", m: 0.3, shape: "block"},
		bottle: {name: "Water in a sealed bottle", mat: "water", m: 0.6, shape: "bottle"},
		paper: {name: "Sheet of paper", mat: "paper", m: 0.005, shape: "sheet"},
		boat: {name: "Plastic toy boat", mat: "plastic", m: 0.1, shape: "boat"},
		jar: {name: "Glass jar", mat: "glass", m: 0.3, shape: "jar"},
		rubber: {name: "Rubber stopper", mat: "rubber", m: 0.05, shape: "block"},
		bto: {name: "Barium titanate disc", mat: "bto", m: 0.05, shape: "disc"},
		block20: {name: "20 kg steel block", mat: "steel", m: 20, shape: "block"},
		nail: {name: "Steel nail", mat: "steel", m: 0.008, shape: "rod"}
	};

	/* ---------- the reported effects ---------- */
	// base: events per hour at full drive (D = 1) for a 100 g sample with response 1; mass: grams at which the mass factor halves (0 = no mass dependence)
	var EFFECTS = [
		{id: "lev", name: "Levitation / lift", base: 0.125, mass: 250, pow: 0.7, color: "#facc15", dur: 6, note: "Light objects rise, hover or shoot up (\"ballistic lift\"); heavier ones rarely. Reported from a few grams to about 750 kg."},
		{id: "wob", name: "Hovering, wobbling, sliding", base: 0.225, mass: 2000, pow: 0.5, color: "#a3e635", dur: 4, note: "Samples shake, rotate, slide or hover a few millimetres off the table."},
		{id: "jel", name: "Jelly-metal plasticization / bending", base: 0.0625, mass: 1000, pow: 0.4, color: "#fb923c", dur: 5, note: "Metal goes soft and bends or sags while staying cold, then sets again (\"jelly metal\")."},
		{id: "frc", name: "Fracturing / dustification", base: 0.045, mass: 1000, pow: 0.4, color: "#f87171", dur: 3, note: "Bars split, crumble \"like a cookie\" or their tops turn to dust and white powder."},
		{id: "glo", name: "Glow / cold heating", base: 0.0875, mass: 0, pow: 0, color: "#fde047", dur: 4, note: "Metal glows or heats while wood touching it does not burn."},
		{id: "fum", name: "Smoking / fuming / white fog", base: 0.0875, mass: 0, pow: 0, color: "#e5e7eb", dur: 6, note: "Paper smokes; metals give off a grey mist (\"Carl the ghost\"); a persistent white fog."},
		{id: "bub", name: "Bubbling / foaming liquid", base: 0.2, mass: 0, pow: 0, color: "#60a5fa", dur: 6, note: "Water bubbles, foams or splashes in its container."},
		{id: "brt", name: "\"Breathing\" bottle", base: 0.15, mass: 0, pow: 0, color: "#93c5fd", dur: 6, note: "A sealed bottle swells and shrinks as if breathing."},
		{id: "fus", name: "Fusion of dissimilar materials", base: 0.015, mass: 0, pow: 0, color: "#c084fc", dur: 4, note: "Two different materials touching (wood and metal, rubber and steel) fuse into one piece with no displacement."},
		{id: "van", name: "Disappearance / reappearance", base: 0.003, mass: 500, pow: 0.3, color: "#e2e8f0", dur: 5, note: "Rare: a sample vanishes and reappears, sometimes elsewhere."}
	];
	var EFF = {}; EFFECTS.forEach(function (e) { EFF[e.id] = e; });

	/* ---------- helpers ---------- */
	function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
	function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
	function tankF(C_nF, L_uH) { if (!(C_nF > 0) || !(L_uH > 0)) return 0; return 1 / (TAU * Math.sqrt(C_nF * 1e-9 * L_uH * 1e-6)); }
	// output of a resonant secondary driven off its own frequency: a simple Q-limited response (Q ~ 12 for a loaded Tesla coil)
	function tuning(fDrive, fCoil, Q) { if (!(fDrive > 0) || !(fCoil > 0)) return 1; Q = Q || 12; var x = fDrive / fCoil - fCoil / fDrive; return 1 / Math.sqrt(1 + Q * Q * x * x); }
	function gapEnergy(C_uF, kV) { return 0.5 * C_uF * 1e-6 * kV * kV * 1e6; }
	function sameF(a, b) { if (a === 0 || b === 0) return a === b; return Math.abs(a - b) <= 0.005 * Math.max(a, b); }
	function fmtF(f) { if (!(f > 0)) return "DC"; if (f >= 1e6) return +(f / 1e6).toPrecision(3) + " MHz"; if (f >= 1e3) return +(f / 1e3).toPrecision(3) + " kHz"; return +f.toPrecision(3) + " Hz"; }
	function fmtE(v) { if (!(v >= 0)) return "-"; if (v >= 1e6) return (v / 1e6).toFixed(2) + " MV/m"; if (v >= 1e3) return (v >= 1e4 ? (v / 1e3).toFixed(0) : (v / 1e3).toFixed(1)) + " kV/m"; if (v >= 10) return v.toFixed(0) + " V/m"; return v.toFixed(1) + " V/m"; }
	function fmtB(v) { if (!(v >= 0)) return "-"; if (v >= 1000) return (v / 1000).toFixed(2) + " mT"; if (v >= 10) return v.toFixed(0) + " µT"; return v.toFixed(2) + " µT"; }
	// ICNIRP occupational reference level for E (V/m, rms) by frequency (1998/2010 tables, simplified); static: 25 kV/m is a common limit for the startle / spark threshold
	function eRef(f) {
		if (!(f > 0)) return 25000; if (f < 25) return 20000; if (f < 820) return 500e3 / f; if (f < 65e3) return 610; if (f < 1e6) return 610;
		if (f < 10e6) return 610 / (f / 1e6); if (f < 400e6) return 61; return 3 * Math.sqrt(f / 1e6);
	}

	/* ---------- turning a layout into field sources ---------- */
	// st = {room: {w, h, refl}, items: [{id, t, x, y, rot, on, kV, f, P, duty, phase, C, L, gap, I, N, R, label, ...}], cables: [[fromId, toId], ...]}
	function components(items, cables) {
		var p = {}; items.forEach(function (d) { p[d.id] = d.id; });
		function find(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
		(cables || []).forEach(function (c) { if (p[c[0]] != null && p[c[1]] != null) p[find(c[0])] = find(c[1]); });
		var out = {}; items.forEach(function (d) { out[d.id] = find(d.id); }); return out;
	}
	function feeders(id, items, cables) { var byId = {}; items.forEach(function (d) { byId[d.id] = d; }); return (cables || []).filter(function (c) { return c[1] === id && byId[c[0]]; }).map(function (c) { return byId[c[0]]; }); }

	// effective frequency, amplitude and notes for every device (tank tuning, field-shaper inheritance, modulation)
	function resolve(st) {
		var items = st.items || [], cables = st.cables || [], comp = components(items, cables), res = {};
		items.forEach(function (d) {
			var T = DEV[d.t]; if (!T) return; var r = {f: +d.f || 0, V: (+d.kV || 0) * 1000, P: +d.P || 0, tune: 1, mods: [], notes: [], comp: comp[d.id], on: d.on !== false};
			if (T.kind === "tank") r.f = tankF(+d.C, +d.L);
			if (T.kind === "dc" || T.kind === "pow" && d.t !== "mains") r.f = 0;
			res[d.id] = r;
		});
		// field shapers take the frequency (and phase) of a Tesla coil feeding them
		items.forEach(function (d) {
			if (d.t !== "fieldshaper") return; var fs = feeders(d.id, items, cables).filter(function (s) { return DEV[s.t] && DEV[s.t].kind === "hv"; });
			if (fs.length) { res[d.id].f = res[fs[0].id].f; res[d.id].phaseFrom = fs[0].id; res[d.id].notes.push("takes " + fmtF(res[d.id].f) + " from " + (fs[0].label || DEV[fs[0].t].name)); }
		});
		// a tank feeding a Tesla coil: the coil's output depends on how well the tank is tuned to it
		items.forEach(function (d) {
			var T = DEV[d.t]; if (!T || T.kind !== "hv" || d.t === "fieldshaper") return;
			var tk = feeders(d.id, items, cables).filter(function (s) { return s.t === "tank" && s.on !== false; });
			if (tk.length) { var ft = res[tk[0].id].f, k = tuning(ft, res[d.id].f); res[d.id].tune = k; res[d.id].notes.push("driven by a tank at " + fmtF(ft) + ": " + Math.round(k * 100) + "% of full output"); }
			var gp = feeders(d.id, items, cables).concat(tk.length ? feeders(tk[0].id, items, cables) : []).filter(function (s) { return s.t === "sparkgap"; });
			if (gp.length) { res[d.id].kicked = gp.map(function (g) { return g.id; }); res[d.id].notes.push("kicked by the spark gap every " + Math.round(+gp[0].gap || 40) + " s"); }
		});
		// a signal generator cabled to a device modulates it (sidebands)
		cables.forEach(function (c) {
			var a = null, b = null; items.forEach(function (d) { if (d.id === c[0]) a = d; if (d.id === c[1]) b = d; });
			if (a && b && a.t === "siggen" && a.on !== false && res[b.id] && b.t !== "siggen" && res[b.id].f > 0) { res[b.id].mods.push(+a.f || 0); res[b.id].notes.push("modulated at " + fmtF(+a.f || 0)); }
		});
		return res;
	}

	// sources = point emitters with everything needed for the field sum
	function sources(st) {
		var res = resolve(st), out = [], room = st.room || {w: 10, h: 8, refl: 0}, refl = clamp(+room.refl || 0, 0, 0.95);
		(st.items || []).forEach(function (d) {
			var T = DEV[d.t], r = res[d.id]; if (!T || !r || !EMITS[T.kind] || d.on === false) return;
			var duty = clamp((+d.duty || 100) / 100, 0.01, 1), f = r.f, V = r.V * r.tune, k = TAU * f / C;
			var base = {id: d.id, t: d.t, f: f, k: k, a: T.a || 0.05, duty: duty, phase: ((+d.phase || 0) + (r.phaseFrom ? 0 : 0)) * Math.PI / 180, comp: r.comp, rot: (+d.rot || 0) * Math.PI / 180, dirK: T.dirK || 0, mods: r.mods, kicked: r.kicked || null, pulse: 0};
			if (r.phaseFrom) { var src = (st.items || []).filter(function (x) { return x.id === r.phaseFrom; })[0]; if (src) base.phase = ((+src.phase || 0) + (+d.phase || 0)) * Math.PI / 180; }
			base.V = V; base.Prad = (T.eff || 0) * (+d.P || 0) * r.tune;
			base.m = (T.mDip || 0) * Math.sqrt(Math.max(0, +d.P || 0) / Math.max(1, T.def.P || 1)) * r.tune;
			if (d.t === "inductor") base.m = Math.max(0, +d.N || 0) * Math.max(0, +d.I || 0) * Math.PI * Math.pow(Math.max(0.01, +d.R || 0.1), 2);
			if (T.kind === "pulse") { base.pulseW = gapEnergy(+d.C || 0.1, +d.kV || 0); base.interval = Math.max(1, +d.gap || 40); base.V = (+d.kV || 0) * 1000 * 0.15; }
			if (d.t === "mains") { base.V = 170; base.a = 0.02; base.m = 0.5; }
			if (T.kind === "sig") { base.V = (+d.kV || 0.01) * 1000; }
			if (d.t === "tesla_dumbbell") {   // two domes in antiphase along the coil's axis
				var L = T.ends, cx = Math.cos(base.rot) * L, cy = Math.sin(base.rot) * L;
				out.push(Object.assign({}, base, {x: +d.x + cx, y: +d.y + cy, sub: 0}));
				out.push(Object.assign({}, base, {x: +d.x - cx, y: +d.y - cy, phase: base.phase + Math.PI, sub: 1, m: 0}));
			} else out.push(Object.assign({}, base, {x: +d.x, y: +d.y}));
		});
		// a radioactive source within 2 m of a gap or supply ionises the air there (depleted uranium near the supply, as reported)
		var rads = (st.items || []).filter(function (d) { return d.t === "dur" && d.on !== false; });
		out.forEach(function (s) { if (s.pulseW) s.ion = rads.some(function (d) { return Math.hypot(d.x - s.x, d.y - s.y) < 2; }) ? 1 : 0; });
		// wall reflections (first-order images) for RF, where the room is a sizeable fraction of a wavelength
		var imgs = [];
		if (refl > 0) out.forEach(function (s) {
			if (!(s.f >= 1e6)) return;
			[[-s.x, s.y], [2 * room.w - s.x, s.y], [s.x, -s.y], [s.x, 2 * room.h - s.y]].forEach(function (p, i) {
				imgs.push(Object.assign({}, s, {x: p[0], y: p[1], image: true, amp: refl, phase: s.phase + Math.PI, rot: i < 2 ? Math.PI - s.rot : -s.rot}));
			});
		});
		return out.concat(imgs);
	}

	/* ---------- the field at one point ---------- */
	// amplitude (peak V/m) of one source at distance r, angle th from its pointing direction
	function srcE(s, r, th) {
		var rr = Math.max(r, 0.12), a = s.a, Eel = r < a ? s.V / a : s.V * a / (rr * rr), Erad = 0;
		if (s.Prad > 0 && s.f > 0) {
			var kr = Math.max(0.03, s.k * rr), g = s.dirK ? (1 - s.dirK) + s.dirK * Math.pow(Math.max(0, Math.cos(th)), 2) * 2 : 1;
			Erad = Math.sqrt(60 * s.Prad * g) / rr * Math.sqrt(1 + 1 / (kr * kr) + 1 / (kr * kr * kr * kr));
			Erad = Math.min(Erad, 3e6);
		}
		if (s.dirK && !(s.Prad > 0)) Eel *= (1 - s.dirK) + s.dirK * 2 * Math.pow(Math.max(0, Math.cos(th)), 2);
		var e = Math.sqrt(Eel * Eel + Erad * Erad) * Math.sqrt(s.duty);
		return Math.min(e, 3e6) * (s.amp != null ? s.amp : 1);
	}
	function srcB(s, r) { var rr = Math.max(r, 0.12); return s.m > 0 ? 0.2 * s.m / (rr * rr * rr) * Math.sqrt(s.duty) * (s.amp != null ? s.amp : 1) : 0; }   // µT (peak)

	// everything at (x, y): rms E, rms B, static part, groups, overlap, richness, pulse, drive
	function fieldAt(src, x, y, opt) {
		var groups = [], ES = [0, 0], amps = [], Bsq = 0, pulse = 0, mods = 0;
		for (var i = 0; i < src.length; i++) {
			var s = src[i], dx = x - s.x, dy = y - s.y, r = Math.sqrt(dx * dx + dy * dy) || 1e-6, ux = dx / r, uy = dy / r, th = Math.atan2(dy, dx) - s.rot;
			var A = srcE(s, r, th), b = srcB(s, r); Bsq += b * b * (s.f > 0 ? 0.5 : 1);
			if (s.pulseW) { pulse += Math.min(1, Math.sqrt(s.pulseW) / (1 + r * r) / 1.5) * (1 + 0.5 * (s.ion || 0)); }
			if (!s.image) amps.push(A);
			if (!(s.f > 0)) { ES[0] += A * ux * Math.sign(s.V || 1); ES[1] += A * uy * Math.sign(s.V || 1); continue; }
			if (s.mods && s.mods.length) mods += s.mods.length * (A > 0 ? 1 : 0);
			var psi = s.phase - s.k * r, c = Math.cos(psi), sn = Math.sin(psi), key = s.f;
			var g = null; for (var j = 0; j < groups.length; j++) if (sameF(groups[j].f, s.f) && groups[j].comp === s.comp) { g = groups[j]; break; }
			if (!g) { g = {f: s.f, comp: s.comp, xr: 0, xi: 0, yr: 0, yi: 0, inc: 0, n: 0}; groups.push(g); }
			g.xr += A * ux * c; g.xi += A * ux * sn; g.yr += A * uy * c; g.yi += A * uy * sn; g.inc += A * A; g.n++;
		}
		var acSq = 0, cohNum = 0, cohDen = 0, freqs = [];
		groups.forEach(function (g) { g.amp = Math.sqrt(g.xr * g.xr + g.xi * g.xi + g.yr * g.yr + g.yi * g.yi); g.rms = g.amp / Math.SQRT2; acSq += g.rms * g.rms; if (g.n > 1) { cohNum += g.amp * g.amp; cohDen += g.inc; } });
		var Es = Math.sqrt(ES[0] * ES[0] + ES[1] * ES[1]), E = Math.sqrt(acSq + Es * Es), sumA = 0, sumA2 = 0;
		amps.forEach(function (a) { sumA += a; sumA2 += a * a; });
		var Neff = sumA2 > 0 ? sumA * sumA / sumA2 : 0, maxG = 0;
		groups.forEach(function (g) { if (g.rms > maxG) maxG = g.rms; });
		groups.forEach(function (g) { if (g.rms >= 0.1 * Math.max(maxG, Es) && g.rms > 1) { var have = freqs.some(function (f) { return sameF(f, g.f); }); if (!have) freqs.push(g.f); } });
		var richness = freqs.length + (Es > 0.1 * Math.max(E, 1) && Es > 1 ? 1 : 0) + Math.min(2, mods) + (pulse > 0.1 ? 1 : 0);
		var beats = [];
		for (var p = 0; p < groups.length; p++) for (var q = p + 1; q < groups.length; q++) {
			var gp = groups[p], gq = groups[q]; if (gp.rms < 0.2 * maxG || gq.rms < 0.2 * maxG) continue;
			beats.push({f1: gp.f, f2: gq.f, df: Math.abs(gp.f - gq.f), drift: sameF(gp.f, gq.f)});
		}
		var out = {E: E, Es: Es, Eac: Math.sqrt(acSq), B: Math.sqrt(Bsq), groups: groups, Neff: Neff, richness: richness, pulse: pulse, beats: beats, coh: cohDen > 0 ? cohNum / cohDen : 1, fDom: 0};
		groups.forEach(function (g) { if (g.rms === maxG) out.fDom = g.f; });
		var d = drive(out); out.H = d.H; out.D = d.D;
		return out;
	}

	/* ---------- the whole floor on a grid (heat maps + the animated time view) ---------- */
	// returns per cell: E (rms V/m), B (µT), D (drive), N (overlap), coh (standing-wave ratio), emf-ready E; plus every frequency group's phasors for the time view
	function grid(src, room, nx, ny) {
		var n = nx * ny, Eac = new Float32Array(n), E = new Float32Array(n), B = new Float32Array(n), D = new Float32Array(n), N = new Float32Array(n), coh = new Float32Array(n), Sx = new Float32Array(n), Sy = new Float32Array(n), gl = [], Zs = [];
		var dx = room.w / nx, dy = room.h / ny;
		for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
			var k = j * nx + i, fa = fieldAt(src, (i + 0.5) * dx, (j + 0.5) * dy);
			E[k] = fa.E; Eac[k] = fa.Eac; B[k] = fa.B; D[k] = fa.D; N[k] = fa.Neff; coh[k] = fa.coh;
			fa.groups.forEach(function (g) {
				var gi = -1; for (var q = 0; q < gl.length; q++) if (gl[q].comp === g.comp && sameF(gl[q].f, g.f)) { gi = q; break; }
				if (gi < 0) { gi = gl.length; gl.push({f: g.f, comp: g.comp}); Zs.push(new Float32Array(n * 4)); }
				var z = Zs[gi]; z[k * 4] = g.xr; z[k * 4 + 1] = g.xi; z[k * 4 + 2] = g.yr; z[k * 4 + 3] = g.yi;
			});
		}
		// static part again (fieldAt only returns its magnitude)
		for (var jj = 0; jj < ny; jj++) for (var ii = 0; ii < nx; ii++) {
			var kk = jj * nx + ii, x = (ii + 0.5) * dx, y = (jj + 0.5) * dy, sx = 0, sy = 0;
			for (var s = 0; s < src.length; s++) { var so = src[s]; if (so.f > 0) continue; var ddx = x - so.x, ddy = y - so.y, r = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-6, A = srcE(so, r, Math.atan2(ddy, ddx) - so.rot) * Math.sign(so.V || 1); sx += A * ddx / r; sy += A * ddy / r; }
			Sx[kk] = sx; Sy[kk] = sy;
		}
		return {nx: nx, ny: ny, E: E, Eac: Eac, B: B, D: D, N: N, coh: coh, Sx: Sx, Sy: Sy, groups: gl, Z: Zs};
	}

	/* ---------- the effect model ---------- */
	var E0 = 10e3, B0 = 100;   // field scale of the drive: 10 kV/m (rms) and 100 µT
	function drive(fa) {
		var e = Math.sqrt(Math.pow(fa.E / E0, 2) + Math.pow(fa.B / B0, 2));
		if (!(e > 0)) return {H: 0, D: 0};
		var over = 1 + 0.6 * Math.max(0, Math.min(fa.Neff, 6) - 1);
		var rich = 1 + 0.25 * Math.max(0, Math.min(fa.richness, 8) - 1);
		var bias = fa.Eac > 0 ? 1 + 0.6 * Math.min(1, fa.Es / (0.15 * Math.max(fa.E, 1))) : 0.4;
		var pul = 1 + 0.5 * Math.min(1.5, fa.pulse);
		var H = e * over * rich * bias * pul;
		return {H: H, D: 1 - Math.exp(-H / 3)};
	}
	function massFactor(e, grams) { if (!(e.mass > 0)) return 1; var raw = function (g) { return 1 / (1 + Math.pow(Math.max(g, 0.1) / e.mass, e.pow)); }; return raw(grams) / raw(100); }   // = 1 at 100 g, more for lighter samples
	// warm-up: the reports say the equipment had to run for a while before anything happened
	function warm(tMin, tau) { return 1 - Math.exp(-Math.max(0, tMin) / (tau || 20)); }
	// rates (events per hour at full warm-up) of every effect for one sample in a field
	function rates(obj, fa, ctx) {
		ctx = ctx || {}; var M = MAT[obj.mat] || MAT.al, g = (+obj.m || 0.1) * 1000, D = fa.D, out = {};
		EFFECTS.forEach(function (e) {
			var s = M.sus[e.id] || 0;
			if (e.id === "bub" && !M.liquid) s = 0;
			if (e.id === "brt") s = obj.shape === "bottle" ? 1 : 0;
			if (e.id === "fus") s = s * (ctx.neighbour ? 1 : 0);
			if (e.id === "glo" && M.metal && fa.fDom > 1e6) s *= 1.3;
			if ((e.id === "jel" || e.id === "frc") && M.ferro && fa.B > 50) s *= 1.2;
			out[e.id] = e.base * s * Math.pow(D, 2.2) * massFactor(e, g);
		});
		return out;
	}
	function probWithin(rate, minutes) { return 1 - Math.exp(-rate * minutes / 60); }
	// best-estimate size of an event
	function magnitude(eid, obj, D) {
		var g = (+obj.m || 0.1) * 1000, fm = 1 / (1 + Math.pow(g / 250, 0.7));
		switch (eid) {
			case "lev": return {v: 3 + 150 * D * fm, u: "cm", txt: "rises about " + Math.round(3 + 150 * D * fm) + " cm" + (D * fm > 0.35 ? " (may shoot up: ballistic lift)" : "")};
			case "wob": return {v: 1 + 25 * D / (1 + g / 2000), u: "mm", txt: "shakes about " + (1 + 25 * D / (1 + g / 2000)).toFixed(0) + " mm"};
			case "jel": return {v: 5 + 70 * D, u: "°", txt: "bends about " + Math.round(5 + 70 * D) + "°"};
			case "frc": return {v: 10 + 50 * D, u: "%", txt: "about " + Math.round(10 + 50 * D) + "% splits off or turns to dust"};
			case "glo": return {v: D, u: "", txt: "glows for a few seconds"};
			case "fum": return {v: D, u: "", txt: "smokes or fumes for a few seconds"};
			case "bub": return {v: D, u: "", txt: "bubbles and foams"};
			case "brt": return {v: 2 + 10 * D, u: "%", txt: "swells and shrinks by about " + Math.round(2 + 10 * D) + "%"};
			case "fus": return {v: D, u: "", txt: "fuses with the sample next to it"};
			case "van": return {v: D, u: "", txt: "vanishes for a moment"};
		}
		return {v: 0, u: "", txt: ""};
	}
	// ordinary electrostatic pull on a sample (pressure eps0 E^2 / 2 over its top face) as a fraction of its weight: shows how far the reported lifts are from ordinary field forces
	function classicalLift(E, obj) {
		var M = MAT[obj.mat] || MAT.al, m = Math.max(1e-4, +obj.m || 0.1), side = Math.cbrt(m / M.rho), F = 0.5 * EPS0 * E * E * side * side;
		return F / (m * 9.81);
	}
	// camera / instrument upset: probability per second of a visible glitch (use the AC field: a steady DC field does not upset electronics)
	function emfRisk(E, immunity) { var x = E / (immunity || 10); return 1 - Math.exp(-x * x / 9); }

	// camera picture noise level 0..1 from the AC field at the camera vs its immunity: 0 below 0.3x immunity, 1 at 30x and above (log scale)
	function camNoise(E, immunity) { var x = (E || 0) / (immunity || 10); return x <= 0.3 ? 0 : clamp(Math.log10(x / 0.3) / 2, 0, 1); }
	// intermittent dropouts: the picture drops out in short bursts (0.12-0.4 s) that start in some 1.5 s windows of real time; more often as the noise grows.
	// Deterministic in (time, seed) so a frame never flickers between two answers. Returns 0 (picture) .. 1 (full dropout).
	function hash01(a, b) { var h = Math.imul((a | 0) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
	function camDropout(level, tReal, seed) {
		if (!(level > 0.25)) return 0; var W = 1.5, k = Math.floor(tReal / W), u = tReal - k * W;
		if (hash01(k, seed || 0) >= 0.4 * level * level) return 0;
		var start = hash01(k, (seed || 0) + 7) * 0.8, len = 0.12 + 0.28 * hash01(k, (seed || 0) + 13) * level;
		return u >= start && u < start + len ? 1 : 0;
	}
	/* ---------- cameras: where they look ---------- */
	function camFov(d) { var f = +(d && d.fov); return clamp(isFinite(f) && f > 0 ? f : 50, 10, 120); }
	function wallDist(room, x, y, a) {   // distance from (x, y) along angle a (radians, y down) to the room's wall
		var cx = Math.cos(a), cy = Math.sin(a), t = Infinity;
		if (cx > 1e-12) t = Math.min(t, (room.w - x) / cx); else if (cx < -1e-12) t = Math.min(t, -x / cx);
		if (cy > 1e-12) t = Math.min(t, (room.h - y) / cy); else if (cy < -1e-12) t = Math.min(t, -y / cy);
		return Math.max(0, isFinite(t) ? t : 0);
	}
	function viewPoly(d, room, n) {   // the floor the camera sees: its position, then points on the walls across its field of view
		var a0 = (+d.rot || 0) * Math.PI / 180, h = camFov(d) * Math.PI / 360, out = [[d.x, d.y]]; n = Math.max(2, n || 24);
		for (var i = 0; i <= n; i++) { var a = a0 - h + 2 * h * i / n, r = wallDist(room, d.x, d.y, a); out.push([d.x + Math.cos(a) * r, d.y + Math.sin(a) * r]); }
		return out;
	}
	function viewAngle(d, x, y) {   // signed angle (degrees) of a point from the camera's centre line; negative = the left of its picture
		var a = Math.atan2(y - d.y, x - d.x) * 180 / Math.PI - (+d.rot || 0); a = ((a + 180) % 360 + 360) % 360 - 180; return a;
	}
	function inView(d, x, y) { return Math.hypot(x - d.x, y - d.y) > 1e-6 && Math.abs(viewAngle(d, x, y)) <= camFov(d) / 2 + 1e-9; }
	function zoneCoverage(d, z) { var n = 0, k = 0; for (var i = 0; i < 11; i++) for (var j = 0; j < 11; j++) { n++; if (inView(d, z.x + z.w * (i / 10 - 0.5), z.y + z.h * (j / 10 - 0.5))) k++; } return k / n; }
	function camSees(st, d) {
		var ids = [], zones = [];
		(st.items || []).forEach(function (o) { if (o === d || o.id === d.id) return; if (o.t === "zone" || o.t === "area") { var c = zoneCoverage(d, o); if (c > 0) zones.push({id: o.id, cover: c}); } else if (inView(d, o.x, o.y)) ids.push(o.id); });
		return {ids: ids, zones: zones};
	}

	/* ---------- room totals ---------- */
	function power(st) {
		var tot = 0, rows = [];
		(st.items || []).forEach(function (d) { var T = DEV[d.t]; if (!T || d.on === false || d.t === "mains" || d.t === "zone" || d.t === "area") return; var p = Math.max(0, +d.P || 0) * clamp((+d.duty || 100) / 100, 0, 1); if (p > 0) { tot += p; rows.push([d.label || T.name, p]); } });
		var outlets = (st.items || []).filter(function (d) { return d.t === "mains" && d.on !== false; }).reduce(function (a, d) { return a + (+d.P || 1650); }, 0);
		return {W: tot, outlets: outlets, rows: rows, amps110: tot / 110};
	}
	// all spectral lines seen at a point (for the spectrum chart)
	function spectrum(src, x, y) {
		var lines = [];
		src.forEach(function (s) {
			if (s.image) return; var dx = x - s.x, dy = y - s.y, r = Math.sqrt(dx * dx + dy * dy), A = srcE(s, r, Math.atan2(dy, dx) - s.rot) / (s.f > 0 ? Math.SQRT2 : 1);
			if (!(A > 0)) return;
			if (s.pulseW) { lines.push({f: s.f, A: A, kind: "pulse", id: s.id}); return; }
			lines.push({f: s.f, A: A, kind: s.f > 0 ? "line" : "dc", id: s.id});
			if (/^tesla/.test(s.t) && s.f > 0) { lines.push({f: 2 * s.f, A: A * 0.12, kind: "harm", id: s.id}); lines.push({f: 3 * s.f, A: A * 0.06, kind: "harm", id: s.id}); }
			(s.mods || []).forEach(function (fm) { if (fm > 0 && fm < s.f) { lines.push({f: s.f - fm, A: A * 0.3, kind: "side", id: s.id}); lines.push({f: s.f + fm, A: A * 0.3, kind: "side", id: s.id}); } });
		});
		return lines;
	}

	/* ---------- schematic layout: columns by depth along the cables ---------- */
	function schematic(st) {
		var items = (st.items || []).filter(function (d) { var T = DEV[d.t]; return T && T.kind !== "zone" && T.kind !== "area"; }), ids = {};
		items.forEach(function (d) { ids[d.id] = d; });
		var cables = (st.cables || []).filter(function (c) { return ids[c[0]] && ids[c[1]] && c[0] !== c[1]; }), depth = {}, linked = {};
		cables.forEach(function (c) { linked[c[0]] = linked[c[1]] = 1; });
		items.forEach(function (d) { depth[d.id] = 0; });
		for (var it = 0; it < items.length; it++) { var ch = false; cables.forEach(function (c) { if (depth[c[1]] < depth[c[0]] + 1 && depth[c[0]] + 1 < 12) { depth[c[1]] = depth[c[0]] + 1; ch = true; } }); if (!ch) break; }
		var cols = {}, free = [];
		items.forEach(function (d) { if (!linked[d.id]) { free.push(d); return; } (cols[depth[d.id]] = cols[depth[d.id]] || []).push(d); });
		var nodes = [], keys = Object.keys(cols).map(Number).sort(function (a, b) { return a - b; });
		keys.forEach(function (k, ci) { cols[k].sort(function (a, b) { return a.y - b.y || a.x - b.x; }).forEach(function (d, ri) { nodes.push({id: d.id, d: d, col: ci, row: ri}); }); });
		free.forEach(function (d, i) { nodes.push({id: d.id, d: d, col: -1, row: i}); });
		return {nodes: nodes, cables: cables, cols: keys.length, rows: Math.max.apply(null, [1].concat(keys.map(function (k) { return cols[k].length; }))), free: free.length};
	}

	/* ---------- share links ---------- */
	var KEYS = ["t", "x", "y", "rot", "on", "kV", "f", "P", "duty", "phase", "C", "L", "gap", "I", "N", "R", "w", "h", "label", "mat", "m", "shape", "imm", "fov"];
	function round(v) { return typeof v === "number" ? Math.round(v * 1000) / 1000 : v; }
	function pack(st) {
		var o = {r: [round(st.room.w), round(st.room.h), round(st.room.refl || 0)], i: [], c: st.cables || [], p: st.preset || ""};
		(st.items || []).forEach(function (d) { var row = {}; KEYS.forEach(function (k) { if (d[k] != null && d[k] !== "") row[k] = round(d[k]); }); row.id = d.id; o.i.push(row); });
		return o;
	}
	function unpack(o) {
		if (!o || !o.r || !Array.isArray(o.i)) return null;
		var st = {room: {w: clamp(+o.r[0] || 10, 2, 60), h: clamp(+o.r[1] || 8, 2, 60), refl: clamp(+o.r[2] || 0, 0, 0.95)}, items: [], cables: [], preset: typeof o.p === "string" ? o.p.slice(0, 40) : ""};
		o.i.slice(0, 120).forEach(function (r) {
			if (!r || (!DEV[r.t] && r.t !== "sample")) return; var d = {id: String(r.id || "").slice(0, 12) || ("x" + st.items.length)};
			KEYS.forEach(function (k) { if (r[k] != null) d[k] = (k === "t" || k === "label" || k === "mat" || k === "shape") ? String(r[k]).slice(0, 60) : (k === "on" ? !!r[k] : +r[k]); });
			if (d.t === "sample" && !MAT[d.mat]) d.mat = "al";
			if (!isFinite(d.x) || !isFinite(d.y)) return; st.items.push(d);
		});
		var ok = {}; st.items.forEach(function (d) { ok[d.id] = 1; });
		(Array.isArray(o.c) ? o.c : []).slice(0, 200).forEach(function (c) { if (Array.isArray(c) && ok[c[0]] && ok[c[1]]) st.cables.push([String(c[0]), String(c[1])]); });
		return st;
	}
	function b64e(str) { var b = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(str))) : Buffer.from(str, "utf8").toString("base64"); return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
	function b64d(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return typeof atob === "function" ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, "base64").toString("utf8"); }
	function encode(st) { return b64e(JSON.stringify(pack(st))); }
	function decode(s) { try { return unpack(JSON.parse(b64d(s))); } catch (e) { return null; } }

	/* ---------- presets ---------- */
	function dev(id, t, x, y, o) { var d = {id: id, t: t, x: x, y: y, rot: 0, on: true}; var D = DEV[t].def; Object.keys(D).forEach(function (k) { d[k] = D[k]; }); Object.keys(o || {}).forEach(function (k) { d[k] = o[k]; }); return d; }
	function smp(id, key, x, y, o) { var P = SAMPLES[key], d = {id: id, t: "sample", x: x, y: y, rot: 0, on: true, mat: P.mat, m: P.m, shape: P.shape, label: P.name}; Object.keys(o || {}).forEach(function (k) { d[k] = o[k]; }); return d; }
	var PRESETS = {
		lads: {name: "LADS Phase I (Hathaway, 1983)", note: "George Hathaway's LADS Phase I physical layout, a 70 ft room, redrawn from his 1993 presentation board: gaps, tanks and inductors along the back wall, the double-ended Tesla coil, the main supply and gap in the right alcove, the large Tesla coil, field shaper and Van de Graaff around the active area, and the small Tesla coil in its own room. A few labels on the board are hard to read and are best guesses.",
			build: function () {
				var I = [
					dev("w1", "area", 2.45, 2.05, {w: 4.9, h: 4.1, label: "Bench area"}), dev("w2", "area", 18.15, 1.7, {w: 6.3, h: 3.4, label: "Main supply + gap"}),
					dev("w3", "area", 7.1, 10.9, {w: 5, h: 3.9, label: "Control room"}), dev("w4", "area", 18.7, 11.1, {w: 5.2, h: 3.5, label: "Small Tesla room"}), dev("w5", "area", 1.7, 11.1, {w: 3.4, h: 2.6, label: "Store"}),
					dev("bn", "area", 1.4, 2.65, {w: 2, h: 0.45, label: "Bench"}), dev("sw", "area", 5.9, 3.0, {w: 1.1, h: 2.4, label: "Switchboard"}), dev("sto", "area", 13.8, 3.4, {w: 2.3, h: 2, label: "Storage"}),
					dev("rf", "rf_tx", 3.7, 2.7, {label: "Ham RF transmitters", f: 7.2e6, P: 100}),
					dev("g1", "sparkgap", 6.3, 0.9, {label: "Gaps", kV: 15, gap: 40}), dev("tk", "tank", 8.8, 0.9, {label: "Tanks", C: 10, L: 78}), dev("tu", "tank", 11.2, 0.9, {label: "Main tuning", kV: 15, C: 8, L: 98}),
					dev("ind", "inductor", 13.5, 0.9, {label: "Inductors / toroid stack", f: 180e3, I: 12, N: 20, R: 0.18}),
					dev("db", "tesla_dumbbell", 8.2, 2.9, {rot: 90, label: "2-end (dumbbell) Tesla", f: 180e3}),
					dev("ps", "hvps", 17.5, 1.5, {label: "Main HV supply", kV: 21}), dev("mg", "sparkgap", 20.0, 1.4, {label: "Main gap", kV: 15, gap: 35}), dev("ac", "mains", 20.6, 3.0, {label: "Wall outlet"}),
					dev("lt", "tesla_large", 8.3, 8.0, {label: "Large Tesla", f: 180e3}), dev("fs", "fieldshaper", 10.3, 8.9, {label: "Field shaper", rot: 0}),
					dev("za", "zone", 13.6, 9.05, {w: 3.4, h: 2.9, label: "Active area"}),
					dev("vg", "vdg", 8.8, 10.9, {label: "VdG generator"}), dev("sg", "sparkgap", 10.7, 10.5, {label: "Snapping gap", kV: 12, gap: 35, C: 0.05}),
					dev("op", "operator", 5.4, 9.8, {label: "Operator"}), dev("cm", "camera", 6.3, 10.2, {label: "Camera", rot: -15, imm: 10}),
					dev("st", "tesla_small", 16.8, 10.9, {label: "Small Tesla (twin 807)", f: 900e3}),
					dev("zb", "rf_tx", 19.7, 8.7, {label: "“Z-Boom” (label unclear)", f: 14e6, P: 50, rot: 180}),
					dev("du", "dur", 18.3, 2.4, {label: "Depleted uranium"}),
					smp("s1", "al_bar", 13.0, 8.6), smp("s2", "steel_bar", 14.2, 8.5), smp("s3", "bottle", 13.1, 9.6), smp("s4", "paper", 14.3, 9.7), smp("s5", "wood", 13.7, 10.1), smp("s6", "spoon", 12.6, 9.2)
				];
				return {room: {w: 21.3, h: 12.9, refl: 0.3}, items: I, cables: [["ac", "ps"], ["ps", "mg"], ["mg", "tu"], ["ps", "ind"], ["ind", "db"], ["ac", "g1"], ["g1", "tk"], ["tk", "lt"], ["tu", "lt"], ["lt", "fs"], ["sg", "lt"], ["ac", "st"], ["ac", "vg"], ["ac", "rf"]]};
			}},
		vancouver: {name: "Vancouver apartment (2000s)", note: "Hutchison's later setups were compact: Tesla coils, a Van de Graaff, RF and signal generators and salvaged navy electronics packed around a sample table in an apartment in New Westminster, with the equipment banked close so it reflected the fields back into the target. A best-estimate reconstruction from the 2000s footage.",
			build: function () {
				var I = [
					dev("w1", "area", 0.6, 3.0, {w: 1.1, h: 5.2, label: "Rack: salvaged navy gear"}), dev("w2", "area", 5.0, 0.45, {w: 5.4, h: 0.8, label: "Shelf of generators"}),
					dev("t1", "tesla_large", 2.2, 1.6, {label: "Tesla coil 1", kV: 200, f: 210e3, P: 400}), dev("t2", "tesla_small", 7.6, 1.8, {label: "Tesla coil 2 (tube)", f: 1.1e6}),
					dev("vg", "vdg", 7.4, 4.6, {label: "Van de Graaff", kV: 250}), dev("rf", "rf_tx", 1.3, 4.6, {label: "Navy RF transmitter", f: 3.9e6, P: 150, rot: 0}),
					dev("sg", "siggen", 4.2, 0.6, {label: "Signal generator", f: 2200}), dev("sg2", "siggen", 5.6, 0.6, {label: "Sweep generator", f: 60}),
					dev("gp", "sparkgap", 3.2, 1.0, {label: "Spark gap", kV: 12, gap: 30, C: 0.05}), dev("ac", "mains", 9.3, 0.4, {label: "Wall outlet"}),
					dev("za", "zone", 4.6, 3.3, {w: 2.0, h: 1.6, label: "Sample table"}), dev("cm", "camera", 4.6, 5.9, {label: "Camera", rot: -90, imm: 10}), dev("op", "operator", 8.6, 5.8, {label: "John"}),
					smp("s1", "can", 4.0, 3.0), smp("s2", "boat", 4.9, 2.9), smp("s3", "spoon", 5.2, 3.6), smp("s4", "bottle", 4.2, 3.7), smp("s5", "steel_bar", 4.7, 3.3), smp("s6", "bto", 5.4, 3.0)
				];
				return {room: {w: 9.8, h: 6.4, refl: 0.5}, items: I, cables: [["ac", "t1"], ["ac", "t2"], ["ac", "vg"], ["ac", "rf"], ["sg", "t2"], ["sg2", "rf"], ["gp", "t1"]]};
			}},
		toronto: {name: "Hathaway / Toronto test (1993 plan)", note: "George Hathaway's July 1993 proposal: rebuild the apparatus in Toronto with a reasonable minimum of robust components and instrument everything (chart recorders, data acquisition) to find the underlying principles. This reconstruction keeps the LADS core (large and small Tesla coils, Van de Graaff, field shaper, tank, gaps) in a smaller room with meters and two cameras.",
			build: function () {
				var I = [
					dev("ps", "hvps", 1.2, 0.8, {label: "HV supply", kV: 15}), dev("ac", "mains", 0.4, 0.4, {label: "Wall outlet (15 A)"}), dev("gp", "sparkgap", 2.6, 0.8, {label: "Spark gap", kV: 15, gap: 40}),
					dev("tk", "tank", 4.0, 0.8, {label: "Tank", C: 10, L: 78}), dev("lt", "tesla_large", 4.0, 3.0, {label: "Large Tesla", f: 180e3}), dev("fs", "fieldshaper", 5.6, 3.6, {label: "Field shaper", rot: 20}),
					dev("st", "tesla_small", 9.0, 2.6, {label: "Small Tesla (tube)", f: 900e3}), dev("vg", "vdg", 6.6, 6.0, {label: "Van de Graaff"}),
					dev("za", "zone", 7.0, 4.1, {w: 2.2, h: 1.8, label: "Target"}), dev("m1", "meter", 7.0, 2.9, {label: "E-field meter"}), dev("m2", "meter", 8.4, 5.4, {label: "Chart recorder"}),
					dev("c1", "camera", 7.0, 6.7, {label: "Camera 1 (shielded)", rot: -90, imm: 30}), dev("c2", "camera", 10.6, 4.3, {label: "Camera 2", rot: 180, imm: 10}), dev("op", "operator", 1.2, 6.4, {label: "Operator"}),
					smp("s1", "al_bar", 6.6, 3.8), smp("s2", "mo_rod", 7.4, 3.7), smp("s3", "iron_file", 6.6, 4.5), smp("s4", "bottle", 7.5, 4.5), smp("s5", "paper", 7.0, 4.1)
				];
				return {room: {w: 11.5, h: 7.5, refl: 0.2}, items: I, cables: [["ac", "ps"], ["ps", "gp"], ["gp", "tk"], ["tk", "lt"], ["lt", "fs"], ["ac", "st"], ["ac", "vg"]]};
			}},
		starter: {name: "Starter: two Tesla coils + Van de Graaff", note: "The minimal setup of the first effects (1979-1981): two Tesla coils and, as John found, a Van de Graaff generator added to them. A 4 x 4 m garage, one 15 A outlet, a sample table where the three fields cross. A good first build for a replication.",
			build: function () {
				var I = [
					dev("ac", "mains", 0.3, 0.3, {label: "Wall outlet (15 A)"}), dev("t1", "tesla_large", 0.9, 1.4, {label: "Tesla coil A", kV: 150, f: 250e3, P: 400}),
					dev("t2", "tesla_large", 3.1, 1.4, {label: "Tesla coil B", kV: 150, f: 262e3, P: 400}), dev("vg", "vdg", 2.0, 3.3, {label: "Van de Graaff", kV: 200}),
					dev("za", "zone", 2.0, 1.9, {w: 1.1, h: 0.9, label: "Sample table"}), dev("cm", "camera", 3.6, 3.6, {label: "Camera", rot: -135, imm: 10}), dev("op", "operator", 0.5, 3.6, {label: "Operator"}),
					smp("s1", "can", 1.7, 1.7), smp("s2", "spoon", 2.2, 1.7), smp("s3", "paper", 1.8, 2.1), smp("s4", "bottle", 2.3, 2.2)
				];
				return {room: {w: 4, h: 4, refl: 0}, items: I, cables: [["ac", "t1"], ["ac", "t2"], ["ac", "vg"]]};
			}}
	};

	var MESHut = {DEV: DEV, ORDER: ORDER, MAT: MAT, SAMPLES: SAMPLES, EFFECTS: EFFECTS, EFF: EFF, PRESETS: PRESETS, E0: E0, B0: B0,
		tankF: tankF, tuning: tuning, gapEnergy: gapEnergy, sameF: sameF, components: components, resolve: resolve, sources: sources, srcE: srcE, srcB: srcB,
		fieldAt: fieldAt, grid: grid, drive: drive, rates: rates, massFactor: massFactor, warm: warm, probWithin: probWithin, magnitude: magnitude, classicalLift: classicalLift,
		emfRisk: emfRisk, camNoise: camNoise, camDropout: camDropout, camFov: camFov, wallDist: wallDist, viewPoly: viewPoly, viewAngle: viewAngle, inView: inView, zoneCoverage: zoneCoverage, camSees: camSees, eRef: eRef, power: power, spectrum: spectrum, schematic: schematic, encode: encode, decode: decode, pack: pack, unpack: unpack,
		rng: rng, clamp: clamp, fmtF: fmtF, fmtE: fmtE, fmtB: fmtB, dev: dev, smp: smp};
	if (typeof module !== "undefined" && module.exports) module.exports = MESHut; else root.MESHut = MESHut;
})(this);

/* Hutchison Effect Simulator page: lab floor (canvas), target camera, editor, charts, schematic and equipment views. Model: lib.js (MESHut). */
(function () {
	"use strict";
	var H = window.MESHut, root = document.getElementById("hx"); if (!H || !root) return;
	function $(id) { return document.getElementById(id); }
	var KEY = "mes-hutchison-effect-simulator:v1", DEV = H.DEV, MAT = H.MAT;
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c]; }); }
	function nameOf(d) { return d.label || (d.t === "sample" ? (H.SAMPLES[d.shape] ? H.SAMPLES[d.shape].name : "Sample") : (DEV[d.t] ? DEV[d.t].name : d.t)); }
	function isDark() { return document.body.classList.contains("dark-mode"); }
	var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	/* ================= state ================= */
	var SPEEDS = [1, 10, 60, 600, 3600];
	function nearestSpeed(v) { var best = 60; SPEEDS.forEach(function (x) { if (Math.abs(Math.log(x / v)) < Math.abs(Math.log(best / v))) best = x; }); return isFinite(v) && v > 0 ? best : 60; }
	var st = null, ui = {tool: "move", sel: null, add: null, map: "D", speed: 60, run: true, opts: {cab: true, lab: true, cam: true, arr: false, ring: true, view: true, disp: true}, show: {plan: true, rec: true, tl: true, ro: true, tb: true, leg: true}, showOpen: false, selCab: -1, hovCab: -1, cableFrom: null, tab: "lab", recCam: null}, zm = {z: 1, px: 0, py: 0}, view0 = {s: 40, ox: 20, oy: 20}, VB = 0, simT = 0, events = [], anims = [], parts = [], gapNext = {}, ostate = {}, rnd = H.rng(1989), idn = 0;
	function newId() { var id; do { id = "u" + (++idn).toString(36); } while (st.items.some(function (d) { return d.id === id; })); return id; }
	function byId(id) { for (var i = 0; i < st.items.length; i++) if (st.items[i].id === id) return st.items[i]; return null; }
	function loadPreset(k) { var P = H.PRESETS[k]; st = P.build(); st.preset = k; resetRun(); ui.sel = null; ui.recCam = null; zm = {z: 1, px: 0, py: 0}; dirty(true); renderAll(); pnote(P.note); }
	function pnote(t) { var n = $("hx-pnote"); if (n) n.textContent = t || ""; }
	function resetRun() { simT = 0; events = []; anims = []; parts = []; gapNext = {}; ostate = {}; rnd = H.rng(1989); }
	function save() { try { localStorage.setItem(KEY, JSON.stringify({s: H.pack(st), ui: {map: ui.map, speed: ui.speed, opts: ui.opts, show: ui.show}})); } catch (e) { /* ignore */ } }
	var saveT = 0; function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 400); }
	function init() {
		var q = new URLSearchParams(location.search), s = q.get("s"), saved = null;
		try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { /* ignore */ }
		if (saved && saved.ui) { if (saved.ui.map) ui.map = saved.ui.map; if (saved.ui.speed) ui.speed = nearestSpeed(+saved.ui.speed); if (saved.ui.opts) Object.keys(ui.opts).forEach(function (k) { if (saved.ui.opts[k] != null) ui.opts[k] = !!saved.ui.opts[k]; });
			if (saved.ui.show) Object.keys(ui.show).forEach(function (k) { if (saved.ui.show[k] != null) ui.show[k] = !!saved.ui.show[k]; });
			else { if (ui.opts.disp === false) ui.show.rec = ui.show.tl = ui.show.ro = false; if (ui.opts.cam === false) ui.show.rec = ui.show.tl = false; }   // older saves: the Displays / Camera recording switches
			ui.opts.disp = true; ui.opts.cam = true; }
		if (s) st = H.decode(s);
		if (!st && q.get("p") && H.PRESETS[q.get("p")]) { st = H.PRESETS[q.get("p")].build(); st.preset = q.get("p"); }
		if (!st && saved && saved.s) st = H.unpack(saved.s);
		if (!st) { st = H.PRESETS.lads.build(); st.preset = "lads"; }
		var tb = q.get("tab"); if (tb && /^(lab|sch|eq)$/.test(tb)) ui.tab = tb;
		if (s || q.get("p")) { try { history.replaceState(null, "", location.pathname + (tb ? "?tab=" + tb : "")); } catch (e) { /* ignore */ } }
	}

	/* ================= field cache ================= */
	var src = [], gridC = null, gridLo = false, gridT = 0, mapImg = document.createElement("canvas"), mapDirty = true, info = null;
	function dirty(now) { paintLegend(); src = H.sources(st); info = H.resolve(st); if (st) st.items.forEach(function (d) { delete d.__fa; }); clearTimeout(gridT); if (now) computeGrid(false); else { computeGrid(true); gridT = setTimeout(function () { computeGrid(false); redrawStatic(); }, 220); } saveSoon(); }
	function computeGrid(lo) {
		var r = st.room, n = lo ? 56 : 132, nx = r.w >= r.h ? n : Math.max(12, Math.round(n * r.w / r.h)), ny = r.w >= r.h ? Math.max(12, Math.round(n * r.h / r.w)) : n;
		gridC = H.grid(src, r, nx, ny); gridLo = lo; mapDirty = true;
	}
	function fieldAtObj(d) { return H.fieldAt(src, d.x, d.y); }
	function samples() { return st.items.filter(function (d) { return d.t === "sample"; }); }
	function zone() { return st.items.filter(function (d) { return d.t === "zone"; })[0] || null; }
	function neighbour(o) { return samples().some(function (p) { return p !== o && p.mat !== o.mat && Math.hypot(p.x - o.x, p.y - o.y) < 0.6; }); }

	/* ================= colour maps ================= */
	var STOPS = {
		hot: [[0, 8, 6, 20], [0.25, 60, 15, 90], [0.5, 170, 30, 90], [0.75, 245, 130, 30], [1, 255, 245, 160]],
		drive: [[0, 6, 8, 18], [0.3, 40, 20, 90], [0.55, 120, 40, 160], [0.8, 230, 120, 60], [1, 255, 236, 120]],
		cool: [[0, 5, 10, 20], [0.35, 10, 60, 110], [0.7, 30, 170, 190], [1, 210, 255, 240]],
		div: [[0, 40, 90, 220], [0.5, 12, 14, 22], [1, 235, 70, 50]]
	};
	function cmap(name, t) { var s = STOPS[name]; t = t < 0 ? 0 : t > 1 ? 1 : t; for (var i = 1; i < s.length; i++) if (t <= s[i][0]) { var a = s[i - 1], b = s[i], u = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u]; } var l = s[s.length - 1]; return [l[1], l[2], l[3]]; }
	var MAPS = {
		D: {name: "Hutchison drive (best estimate)", leg: ["0", "drive", "1"], map: "drive", v: function (g, k) { return g.D[k]; }},
		E: {name: "Electric field |E| (rms)", leg: ["10 V/m", "log scale", "300 kV/m"], map: "hot", v: function (g, k) { return (Math.log10(Math.max(10, g.E[k])) - 1) / 4.48; }},
		B: {name: "Magnetic field |B|", leg: ["0.01 µT", "log scale", "1 mT"], map: "cool", v: function (g, k) { return (Math.log10(Math.max(0.01, g.B[k])) + 2) / 5; }},
		N: {name: "Overlap: how many sources meet", leg: ["1 source", "", "5+ equal sources"], map: "cool", v: function (g, k) { return (g.N[k] - 1) / 4; }},
		W: {name: "Standing waves (locked sources)", leg: ["node", "no interference", "antinode"], map: "div", v: function (g, k) { var c = g.coh[k]; return 0.5 + 0.5 * Math.max(-1, Math.min(1, Math.log(c) / Math.log(4))); }},
		I: {name: "Camera / instrument glitch risk (10 V/m gear)", leg: ["0%", "", "100%"], map: "hot", v: function (g, k) { return H.emfRisk(g.Eac[k], 10); }},
		T: {name: "Field in time (slowed right down)", leg: ["0", "|E(t)|", "peak"], map: "hot", v: null}
	};
	function paintMap() {
		var g = gridC; if (!g) return; var m = MAPS[ui.map] || MAPS.D; mapImg.width = g.nx; mapImg.height = g.ny;
		var cx = mapImg.getContext("2d"), im = cx.createImageData(g.nx, g.ny), p = im.data;
		if (ui.map === "T") return paintTime(cx, im);
		for (var k = 0; k < g.nx * g.ny; k++) { var c = cmap(m.map, m.v(g, k)); p[k * 4] = c[0]; p[k * 4 + 1] = c[1]; p[k * 4 + 2] = c[2]; p[k * 4 + 3] = 255; }
		cx.putImageData(im, 0, 0); mapDirty = false;
	}
	// time view: every frequency group turns at a slowed-down display rate that keeps their order and their beats visible; free-running groups drift
	function dispRate(f, fmin) { return 0.7 + 2.4 * Math.tanh(8 * Math.log10(f / fmin) / 2.4); }
	var tview = 0, peakT = 1;
	function paintTime(cx, im) {
		var g = gridC, p = im.data, n = g.nx * g.ny, fmin = Infinity; g.groups.forEach(function (q) { if (q.f > 0 && q.f < fmin) fmin = q.f; });
		var w = g.groups.map(function (q, i) { return TAU * (dispRate(q.f, fmin) + 0.07 * (i % 3)); }), cs = w.map(function (x) { return Math.cos(x * tview); }), sn = w.map(function (x) { return Math.sin(x * tview); }), mx = 0;
		var val = new Float32Array(n);
		for (var k = 0; k < n; k++) {
			var ex = g.Sx[k], ey = g.Sy[k];
			for (var q = 0; q < g.Z.length; q++) { var z = g.Z[q], b = k * 4; ex += z[b] * cs[q] - z[b + 1] * sn[q]; ey += z[b + 2] * cs[q] - z[b + 3] * sn[q]; }
			var v = Math.sqrt(ex * ex + ey * ey); val[k] = v; if (v > mx) mx = v;
		}
		peakT = Math.max(peakT * 0.98, mx);
		for (var kk = 0; kk < n; kk++) { var c = cmap("hot", Math.pow(Math.log10(1 + 99 * val[kk] / peakT) / 2, 1.2)); p[kk * 4] = c[0]; p[kk * 4 + 1] = c[1]; p[kk * 4 + 2] = c[2]; p[kk * 4 + 3] = 255; }
		cx.putImageData(im, 0, 0);
	}
	var TAU = Math.PI * 2;

	/* ================= symbols (shared by floor, schematic, equipment) ================= */
	function sym(c, t, x, y, s, col, o) {
		o = o || {}; c.save(); c.translate(x, y); c.lineWidth = Math.max(1, s * 0.07); c.strokeStyle = col; c.fillStyle = col; c.lineJoin = "round"; c.lineCap = "round";
		var u = s / 2;
		function coil(x0, y0, x1, y1, n, amp) { c.beginPath(); for (var i = 0; i <= n * 8; i++) { var t2 = i / (n * 8), xx = x0 + (x1 - x0) * t2, yy = y0 + (y1 - y0) * t2, a = Math.sin(t2 * n * TAU) * amp, nx2 = -(y1 - y0), ny2 = (x1 - x0), L = Math.hypot(nx2, ny2) || 1; c.lineTo(xx + nx2 / L * a, yy + ny2 / L * a); } c.stroke(); }
		function ball(xx, yy, r) { var g = c.createRadialGradient(xx - r * 0.35, yy - r * 0.35, r * 0.1, xx, yy, r); g.addColorStop(0, "#fff"); g.addColorStop(1, col); c.fillStyle = g; c.beginPath(); c.arc(xx, yy, r, 0, TAU); c.fill(); c.fillStyle = col; }
		switch (t) {
			case "tesla_large": case "tesla_small":
				coil(0, u * 0.75, 0, -u * 0.35, t === "tesla_large" ? 7 : 5, u * 0.22); c.beginPath(); c.ellipse(0, -u * 0.55, u * 0.6, u * 0.2, 0, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(0, u * 0.75, u * 0.45, u * 0.12, 0, 0, TAU); c.stroke();
				if (t === "tesla_small") { c.beginPath(); c.arc(u * 0.62, u * 0.45, u * 0.18, 0, TAU); c.stroke(); c.beginPath(); c.arc(u * 0.62, u * 0.45, u * 0.05, 0, TAU); c.fill(); }
				break;
			case "tesla_dumbbell": coil(-u * 0.5, 0, u * 0.5, 0, 6, u * 0.18); ball(-u * 0.72, 0, u * 0.24); ball(u * 0.72, 0, u * 0.24); c.beginPath(); c.ellipse(0, 0, u * 0.12, u * 0.32, 0, 0, TAU); c.stroke(); break;
			case "vdg": c.beginPath(); c.moveTo(-u * 0.14, u * 0.85); c.lineTo(-u * 0.14, -u * 0.1); c.moveTo(u * 0.14, u * 0.85); c.lineTo(u * 0.14, -u * 0.1); c.stroke(); c.beginPath(); c.moveTo(-u * 0.45, u * 0.85); c.lineTo(u * 0.45, u * 0.85); c.stroke(); ball(0, -u * 0.38, u * 0.42); break;
			case "fieldshaper": coil(0, u * 0.8, 0, u * 0.05, 4, u * 0.18); ball(0, -u * 0.25, u * 0.3); c.beginPath(); c.ellipse(0, -u * 0.25, u * 0.75, u * 0.2, 0, 0, TAU); c.stroke(); break;
			case "hvps": c.strokeRect(-u * 0.75, -u * 0.55, u * 1.5, u * 1.1); c.font = "700 " + Math.round(u * 0.5) + "px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("HV", 0, -u * 0.08); c.beginPath(); c.moveTo(-u * 0.4, u * 0.32); c.lineTo(u * 0.4, u * 0.32); c.stroke(); break;
			case "mains": c.strokeRect(-u * 0.5, -u * 0.65, u, u * 1.3); c.fillRect(-u * 0.25, -u * 0.35, u * 0.09, u * 0.3); c.fillRect(u * 0.16, -u * 0.35, u * 0.09, u * 0.3); c.beginPath(); c.arc(0, u * 0.25, u * 0.1, 0, TAU); c.fill(); break;
			case "sparkgap": c.beginPath(); c.moveTo(-u * 0.85, 0); c.lineTo(-u * 0.22, 0); c.moveTo(u * 0.85, 0); c.lineTo(u * 0.22, 0); c.stroke(); ball(-u * 0.2, 0, u * 0.13); ball(u * 0.2, 0, u * 0.13);
				c.beginPath(); c.moveTo(-u * 0.08, -u * 0.35); c.lineTo(u * 0.05, -u * 0.12); c.lineTo(-u * 0.05, -u * 0.05); c.lineTo(u * 0.1, u * 0.2); c.stroke();
				c.beginPath(); c.moveTo(-u * 0.6, u * 0.45); c.lineTo(u * 0.6, u * 0.45); c.moveTo(-u * 0.6, u * 0.62); c.lineTo(u * 0.6, u * 0.62); c.stroke(); break;
			case "tank": c.beginPath(); c.moveTo(-u * 0.5, -u * 0.7); c.lineTo(-u * 0.5, -u * 0.12); c.moveTo(-u * 0.82, -u * 0.12); c.lineTo(-u * 0.18, -u * 0.12); c.moveTo(-u * 0.82, u * 0.08); c.lineTo(-u * 0.18, u * 0.08); c.moveTo(-u * 0.5, u * 0.08); c.lineTo(-u * 0.5, u * 0.7); c.stroke(); coil(u * 0.45, -u * 0.6, u * 0.45, u * 0.6, 4, u * 0.2);
				c.beginPath(); c.moveTo(-u * 0.5, -u * 0.7); c.lineTo(u * 0.45, -u * 0.7); c.moveTo(-u * 0.5, u * 0.7); c.lineTo(u * 0.45, u * 0.7); c.stroke(); break;
			case "inductor": c.beginPath(); c.ellipse(0, 0, u * 0.75, u * 0.75, 0, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(0, 0, u * 0.38, u * 0.38, 0, 0, TAU); c.stroke(); for (var i = 0; i < 14; i++) { var a = i / 14 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * u * 0.38, Math.sin(a) * u * 0.38); c.lineTo(Math.cos(a) * u * 0.75, Math.sin(a) * u * 0.75); c.stroke(); } break;
			case "rf_tx": c.strokeRect(-u * 0.75, -u * 0.05, u * 0.9, u * 0.7); c.beginPath(); c.moveTo(-u * 0.3, -u * 0.05); c.lineTo(-u * 0.3, -u * 0.85); c.stroke(); for (var w = 1; w <= 3; w++) { c.beginPath(); c.arc(-u * 0.3, -u * 0.85, u * 0.2 * w, -0.9, 0.9); c.stroke(); } c.beginPath(); c.arc(-u * 0.5, u * 0.3, u * 0.08, 0, TAU); c.fill(); break;
			case "siggen": c.strokeRect(-u * 0.8, -u * 0.5, u * 1.6, u); c.beginPath(); for (var k = 0; k <= 40; k++) { var xx = -u * 0.6 + k / 40 * u * 1.2; c.lineTo(xx, Math.sin(k / 40 * TAU * 2) * u * 0.25); } c.stroke(); break;
			case "dur": c.beginPath(); c.arc(0, 0, u * 0.14, 0, TAU); c.fill(); for (var b = 0; b < 3; b++) { var a0 = b * TAU / 3 - Math.PI / 2 - 0.5; c.beginPath(); c.arc(0, 0, u * 0.75, a0, a0 + 1); c.arc(0, 0, u * 0.24, a0 + 1, a0, true); c.closePath(); c.fill(); } break;
			case "camera": c.strokeRect(-u * 0.7, -u * 0.4, u * 1.05, u * 0.8); c.beginPath(); c.moveTo(u * 0.35, -u * 0.15); c.lineTo(u * 0.8, -u * 0.4); c.lineTo(u * 0.8, u * 0.4); c.lineTo(u * 0.35, u * 0.15); c.closePath(); c.stroke(); c.beginPath(); c.arc(-u * 0.45, -u * 0.6, u * 0.18, 0, TAU); c.arc(-u * 0.05, -u * 0.6, u * 0.18, 0, TAU); c.stroke(); break;
			case "meter": c.beginPath(); c.arc(0, u * 0.15, u * 0.7, Math.PI, TAU); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(0, u * 0.15); c.lineTo(u * 0.4, -u * 0.35); c.stroke(); c.strokeRect(-u * 0.8, u * 0.15, u * 1.6, u * 0.45); break;
			case "operator": c.beginPath(); c.arc(0, -u * 0.55, u * 0.25, 0, TAU); c.fill(); c.beginPath(); c.moveTo(0, -u * 0.3); c.lineTo(0, u * 0.35); c.moveTo(-u * 0.45, -u * 0.05); c.lineTo(u * 0.45, -u * 0.05); c.moveTo(0, u * 0.35); c.lineTo(-u * 0.32, u * 0.85); c.moveTo(0, u * 0.35); c.lineTo(u * 0.32, u * 0.85); c.stroke(); break;
			case "zone": c.setLineDash([u * 0.18, u * 0.12]); c.strokeRect(-u * 0.8, -u * 0.6, u * 1.6, u * 1.2); c.setLineDash([]); break;
			case "area": c.strokeRect(-u * 0.8, -u * 0.5, u * 1.6, u); break;
			case "sample": c.fillRect(-u * 0.7, -u * 0.18, u * 1.4, u * 0.36); break;
		}
		c.restore();
	}

	/* ================= the lab floor ================= */
	var stage = $("hx-stage"), cv = $("hx-c"), cx = cv.getContext("2d"), W = 800, Hh = 500, dpr = 1, view = {s: 40, ox: 20, oy: 20};
	var camC = $("hx-cam"), camX = camC.getContext("2d"), CW = 800, CH = 200;
	function layout() {
		var wrap = stage.parentNode, w = wrap.clientWidth || 800; dpr = Math.min(2, window.devicePixelRatio || 1);
		stage.style.width = w + "px";
		// which sections show (the Show menu): set them first, so the fill-window height below sees what is really there
		var S = ui.show, camwrap = camC.parentNode, tlC = $("hx-tl"), ro = root.querySelector(".hx-readouts"), tb = $("hx-tb"), lg = $("hx-leg");
		camC.style.display = S.rec ? "" : "none"; if (tlC) tlC.style.display = S.tl ? "" : "none"; camwrap.style.display = (S.rec || S.tl) ? "" : "none";
		if (ro) ro.style.display = S.ro ? "" : "none"; if (tb) tb.hidden = !S.tb; if (lg) lg.hidden = !S.leg || !S.plan;
		root.classList.toggle("hx-noplan", !S.plan); root.classList.toggle("hx-notb", !S.tb);   // on the root: stage-ctl finds the stage by its class ending in "-stage"
		var band = S.tb && tb ? tb.offsetHeight : 0, pill = $("hx-showpill"); if (pill) pill.hidden = S.tb;
		var menu = $("hx-showpop"), mTop = S.tb ? band : 38, menuH = ui.showOpen && menu ? menu.offsetHeight + 12 + (S.tb ? 0 : 38) : 0;
		var fullish = document.fullscreenElement === wrap || wrap.classList.contains("mes-fill"), top0 = (wrap.classList.contains("mes-fill") || wrap.classList.contains("mes-fs")) ? 34 : 0;
		CW = w; var tlH = S.tl ? 38 : 0, roH = S.ro && ro ? ro.offsetHeight : 0, h;
		if (!S.plan) {   // no floor: the stage is just the toolbar (or the Show pill), and in Fill window the recording takes the room
			h = Math.max(band || 40, menuH + band);
			CH = Math.round(Math.max(150, Math.min(260, w * 0.28)));
			if (fullish && S.rec) CH = Math.max(150, window.innerHeight - top0 - h - tlH - roH - 4);
		} else {
			CH = Math.round(Math.max(150, Math.min(260, w * 0.28)));
			var asp = Math.max(1.1, Math.min(2.2, st.room.w / st.room.h)); h = Math.round(w / asp + 24);
			if (w < 600 && !fullish) h = Math.max(h, Math.round(w * 0.82));
			h += band;   // the toolbar sits over the top of the stage: the floor is drawn below it, never under it
			wrap.setAttribute("data-mes-free", "1"); if (window.MESStage && window.MESStage.sh) h = window.MESStage.sh(stage, h);
			if (S.rec) camC.style.height = CH + "px";
			if (fullish) h = window.MESStage && window.MESStage.fillH ? window.MESStage.fillH(wrap) : window.innerHeight - 260;
			h = Math.max(260 + band, h, menuH + band);
		}
		stage.style.height = h + "px"; W = w; Hh = h; VB = band;
		var cw = Math.round(w * dpr), ch = Math.round(h * dpr); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
		var pad = 26, avail = h - band, s = Math.max(1, Math.min((w - 2 * pad) / st.room.w, (avail - 2 * pad - 10) / st.room.h)); view0 = {s: s, ox: (w - s * st.room.w) / 2, oy: band + (avail - s * st.room.h) / 2 + 4};
		applyView();
		if (lg) lg.style.top = (band + 6) + "px";
		var pop = $("hx-addpop"); if (pop) { pop.style.top = (band + 4) + "px"; pop.style.maxHeight = Math.max(120, h - band - 12) + "px"; }
		if (menu) menu.style.top = (mTop + 4) + "px";
		camC.style.height = CH + "px"; camC.width = Math.round(CW * dpr); camC.height = Math.round(CH * dpr);
		if (tlC) { tlC.width = Math.round(CW * dpr); tlC.height = Math.round(38 * dpr); }
		drawCharts(); drawTL();
	}
	/* zoom and pan: view0 = the whole room fitted below the toolbar; zm scales it about the middle of the floor area and shifts it */
	function applyView() {
		var cx0 = W / 2, cy0 = VB + (Hh - VB) / 2;
		view = {s: view0.s * zm.z, ox: cx0 + (view0.ox - cx0) * zm.z + zm.px, oy: cy0 + (view0.oy - cy0) * zm.z + zm.py};
		var b = $("hx-zfit"); if (b) b.textContent = Math.round(zm.z * 100) + "%";
	}
	function zoomAt(f, sx, sy) {
		if (sx == null) { sx = W / 2; sy = VB + (Hh - VB) / 2; }
		var m = toM(sx, sy); zm.z = H.clamp(zm.z * f, 0.5, 12); applyView();
		var p2 = toPx(m[0], m[1]); zm.px += sx - p2[0]; zm.py += sy - p2[1];
		if (Math.abs(zm.z - 1) < 1e-6) { zm.px = 0; zm.py = 0; }
		applyView();
	}
	function zoomFit() { zm = {z: 1, px: 0, py: 0}; applyView(); }
	function toPx(x, y) { return [view.ox + x * view.s, view.oy + y * view.s]; }
	function toM(px, py) { return [(px - view.ox) / view.s, (py - view.oy) / view.s]; }
	function itemR(d) { var T = DEV[d.t]; if (d.t === "sample") return Math.max(9, 0.22 * view.s); return Math.max(11, (T ? T.size : 0.5) * view.s * 0.5); }

	var flash = {};   // spark gap id -> real time of the last firing (for the drawing)
	function drawFloor(now) {
		var c = cx, dark = true; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#07090f"; c.fillRect(0, 0, W, Hh);
		if (!ui.show.plan) return;
		var r = st.room, p0 = toPx(0, 0), sw = r.w * view.s, sh = r.h * view.s;
		if (ui.map === "T" || mapDirty) paintMap();
		c.imageSmoothingEnabled = true; c.globalAlpha = 0.92; c.drawImage(mapImg, p0[0], p0[1], sw, sh); c.globalAlpha = 1;
		// grid (1 m) + walls
		c.strokeStyle = "rgba(255,255,255,0.06)"; c.lineWidth = 1; c.beginPath();
		var step = view.s < 18 ? 2 : 1;
		for (var x = step; x < r.w; x += step) { var px = p0[0] + x * view.s; c.moveTo(px, p0[1]); c.lineTo(px, p0[1] + sh); }
		for (var y = step; y < r.h; y += step) { var py = p0[1] + y * view.s; c.moveTo(p0[0], py); c.lineTo(p0[0] + sw, py); }
		c.stroke(); c.strokeStyle = "#cbd5e1"; c.lineWidth = 3; c.strokeRect(p0[0], p0[1], sw, sh);
		if (ui.opts.lab) { c.fillStyle = "#94a3b8"; c.font = "11px system-ui,sans-serif"; c.textAlign = "center"; c.fillText(r.w.toFixed(1) + " m (" + Math.round(r.w * 3.281) + " ft)", p0[0] + sw / 2, p0[1] + sh + 15);
		c.save(); c.translate(p0[0] - 12, p0[1] + sh / 2); c.rotate(-Math.PI / 2); c.fillText(r.h.toFixed(1) + " m", 0, 0); c.restore(); }
		// areas and zones first
		st.items.forEach(function (d) { if (d.t === "area" || d.t === "zone") drawArea(c, d); });
		if (ui.opts.view) drawViews(c);
		if (ui.opts.cab) drawCables(c, now);
		st.items.forEach(function (d) { if (d.t !== "area" && d.t !== "zone" && d.t !== "sample") drawDevice(c, d, now); });
		samples().forEach(function (d) { drawSampleTop(c, d, now); });
		if (ui.opts.cab) cableTag(c);
		if (ui.opts.view) drawSeen(c);
		// sparks while a gap fires
		Object.keys(flash).forEach(function (id) { var d = byId(id), age = (now - flash[id]) / 1000; if (!d || age > 0.45) { delete flash[id]; return; } var p = toPx(d.x, d.y); c.save(); c.globalAlpha = 1 - age / 0.45; var g = c.createRadialGradient(p[0], p[1], 2, p[0], p[1], 60); g.addColorStop(0, "rgba(255,240,255,0.9)"); g.addColorStop(1, "rgba(200,120,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], 60, 0, TAU); c.fill(); c.restore(); });
		drawParts(c, "floor");
		// cable being drawn
		if (ui.tool === "cable" && ui.cableFrom && hover) { var a = byId(ui.cableFrom); if (a) { var pa = toPx(a.x, a.y); c.strokeStyle = "#fde047"; c.setLineDash([6, 5]); c.lineWidth = 2; c.beginPath(); c.moveTo(pa[0], pa[1]); c.lineTo(hover.px, hover.py); c.stroke(); c.setLineDash([]); } }
		// scale bar
		var bar = view.s >= 30 ? 1 : view.s >= 12 ? 2 : 5; c.strokeStyle = "#e2e8f0"; c.lineWidth = 2; c.beginPath(); c.moveTo(12, Hh - 12); c.lineTo(12 + bar * view.s, Hh - 12); c.stroke(); c.fillStyle = "#e2e8f0"; c.textAlign = "left"; c.font = "11px system-ui,sans-serif"; c.fillText(bar + " m", 14, Hh - 17);
		// placement ghost
		if (ui.add && hover) { c.globalAlpha = 0.55; var t = ui.add.t; sym(c, t === "sample" ? "sample" : t, hover.px, hover.py, Math.max(22, (DEV[t] ? DEV[t].size : 0.4) * view.s), "#fde047"); c.globalAlpha = 1; }
	}
	function drawArea(c, d) {
		var p = toPx(d.x - d.w / 2, d.y - d.h / 2), w = d.w * view.s, h = d.h * view.s, sel = ui.sel === d.id;
		c.save(); if (d.t === "zone") { c.setLineDash([7, 5]); c.strokeStyle = "#facc15"; c.lineWidth = 2; c.fillStyle = "rgba(250,204,21,0.06)"; c.fillRect(p[0], p[1], w, h); c.strokeRect(p[0], p[1], w, h); }
		else if (d.w * d.h > 6) { c.strokeStyle = "rgba(203,213,225,0.55)"; c.lineWidth = 2; c.strokeRect(p[0], p[1], w, h); }
		else { c.fillStyle = "rgba(71,85,105,0.55)"; c.strokeStyle = "rgba(148,163,184,0.7)"; c.lineWidth = 1; c.fillRect(p[0], p[1], w, h); c.strokeRect(p[0], p[1], w, h); }
		c.setLineDash([]);
		if (showLab(d)) { c.fillStyle = d.t === "zone" ? "#fde68a" : "#cbd5e1"; c.font = "600 11px system-ui,sans-serif"; c.textAlign = "left"; c.textBaseline = "top"; label(c, nameOf(d), p[0] + 5, p[1] + 4); c.textBaseline = "alphabetic"; }
		if (sel) { c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.strokeRect(p[0] - 3, p[1] - 3, w + 6, h + 6); c.fillStyle = "#fff"; c.fillRect(p[0] + w - 4, p[1] + h - 4, 9, 9); }
		c.restore();
	}
	function cableEnds(c0) { var a = byId(c0[0]), b = byId(c0[1]); return a && b ? [a, b] : null; }
	/* cables: typed by what feeds them, drawn as a bright line on a dark halo so they read on every colour map; arrows show the way power / signal flows */
	var CABT = {pow: {name: "Power", col: "#ff6b6b", w: 3, dash: null}, hv: {name: "High voltage", col: "#ffd23f", w: 3, dash: null}, sig: {name: "Signal", col: "#5ab0ff", w: 2.4, dash: [8, 5]}, rf: {name: "RF", col: "#e08bff", w: 2.4, dash: [3, 4]}};
	function cabType(a) { var k = DEV[a.t] ? DEV[a.t].kind : ""; return k === "pow" ? "pow" : k === "sig" ? "sig" : k === "rf" ? "rf" : "hv"; }
	function cabGeom(cb) {
		var e = cableEnds(cb); if (!e) return null; var a = toPx(e[0].x, e[0].y), b = toPx(e[1].x, e[1].y), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
		var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.min(40, L * 0.12);
		return {e: e, a: a, b: b, m: [mx, my], L: L, ty: cabType(e[0]), at: function (t) { var u = 1 - t; return [u * u * a[0] + 2 * u * t * mx + t * t * b[0], u * u * a[1] + 2 * u * t * my + t * t * b[1]]; }, dir: function (t) { var dx = 2 * (1 - t) * (mx - a[0]) + 2 * t * (b[0] - mx), dy = 2 * (1 - t) * (my - a[1]) + 2 * t * (b[1] - my); return Math.atan2(dy, dx); }};
	}
	function cabHit(px, py) {
		if (!ui.opts.cab || !ui.show.plan) return -1; var best = -1, bd = 7;
		st.cables.forEach(function (cb, i) { var g = cabGeom(cb); if (!g) return; for (var k = 1; k < 24; k++) { var q = g.at(k / 24), dd = Math.hypot(q[0] - px, q[1] - py); if (dd < bd) { bd = dd; best = i; } } });
		return best;
	}
	function arrowHead(c, x, y, ang, sz) { c.beginPath(); c.moveTo(x + Math.cos(ang) * sz, y + Math.sin(ang) * sz); c.lineTo(x + Math.cos(ang + 2.5) * sz, y + Math.sin(ang + 2.5) * sz); c.lineTo(x + Math.cos(ang - 2.5) * sz, y + Math.sin(ang - 2.5) * sz); c.closePath(); }
	function cabLit(cb, i) { return i === ui.selCab || i === ui.hovCab || (ui.sel && (cb[0] === ui.sel || cb[1] === ui.sel)); }
	function drawCables(c, now) {
		var any = ui.selCab >= 0 || ui.hovCab >= 0 || (ui.sel && st.cables.some(function (cb) { return cb[0] === ui.sel || cb[1] === ui.sel; }));
		st.cables.forEach(function (cb, i) {
			var g = cabGeom(cb); if (!g) return; var T = CABT[g.ty], lit = cabLit(cb, i), off = g.e[0].on === false, w = T.w + (lit ? 1.6 : 0);
			c.save(); c.lineCap = "round"; c.lineJoin = "round"; c.globalAlpha = any && !lit ? 0.55 : 1;
			function path() { c.beginPath(); c.moveTo(g.a[0], g.a[1]); c.quadraticCurveTo(g.m[0], g.m[1], g.b[0], g.b[1]); }
			if (lit) { c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = w + 9; path(); c.stroke(); }
			c.strokeStyle = "rgba(3,5,10,0.92)"; c.lineWidth = w + 4.5; path(); c.stroke();   // the halo
			c.strokeStyle = off ? "#9ca3af" : T.col; c.lineWidth = w; if (T.dash) c.setLineDash(T.dash); path(); c.stroke(); c.setLineDash([]);
			// arrows along the cable (one per ~140 px), each with its own halo
			var n = Math.max(1, Math.min(4, Math.round(g.L / 140))), sz = lit ? 9 : 7.5;
			for (var k = 0; k < n; k++) { var t = (k + 0.5) / n * 0.8 + 0.1, q = g.at(t), an = g.dir(t); c.fillStyle = "rgba(3,5,10,0.95)"; arrowHead(c, q[0], q[1], an, sz + 2.5); c.fill(); c.fillStyle = off ? "#9ca3af" : T.col; arrowHead(c, q[0], q[1], an, sz); c.fill(); }
			// flow: dots travel from the feeding device to the fed one while the experiment runs and the feeder is on
			if (ui.run && !off && !reduce) {
				var nd = Math.max(2, Math.round(g.L / 70)), sp = g.ty === "rf" ? 900 : g.ty === "sig" ? 1300 : 1800;
				for (var j = 0; j < nd; j++) { var tt = ((now / sp) + j / nd + (cb[0].length * 0.13)) % 1, p2 = g.at(tt); c.fillStyle = "rgba(3,5,10,0.9)"; c.beginPath(); c.arc(p2[0], p2[1], 3.6, 0, TAU); c.fill(); c.fillStyle = "#ffffff"; c.beginPath(); c.arc(p2[0], p2[1], 2.2, 0, TAU); c.fill(); }
			}
			c.restore();
		});
	}
	// the hovered / selected cable gets a tag at its middle: type and which way it runs
	function cableTag(c) {
		var i = ui.hovCab >= 0 ? ui.hovCab : ui.selCab; if (i < 0 || !st.cables[i]) return; var g = cabGeom(st.cables[i]); if (!g) return; var q = g.at(0.5), T = CABT[g.ty];
		c.save(); c.font = "600 11px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "top"; c.fillStyle = T.col; label(c, T.name + ": " + nameOf(g.e[0]) + " → " + nameOf(g.e[1]), q[0], q[1] + 10); c.restore();
	}
	function cablesUsed() { var u = {}; st.cables.forEach(function (cb) { var e = cableEnds(cb); if (e) u[cabType(e[0])] = 1; }); return Object.keys(CABT).filter(function (k) { return u[k]; }); }
	function devColor(d) { return d.on === false ? "#4b5563" : (DEV[d.t] ? DEV[d.t].color : "#ccc"); }
	function drawDevice(c, d, now) {
		var T = DEV[d.t]; if (!T) return; var p = toPx(d.x, d.y), R = itemR(d), sel = ui.sel === d.id, col = devColor(d), rot = (+d.rot || 0) * Math.PI / 180;
		c.save();
		if (d.t === "tesla_dumbbell") {
			var L = 0.7 * view.s, ex = Math.cos(rot) * L, ey = Math.sin(rot) * L;
			c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.moveTo(p[0] - ex, p[1] - ey); c.lineTo(p[0] + ex, p[1] + ey); c.stroke();
			[[1, "+"], [-1, "−"]].forEach(function (q) { var x = p[0] + ex * q[0], y = p[1] + ey * q[0], rr = Math.max(7, 0.12 * view.s); c.fillStyle = "#0b0f17"; c.beginPath(); c.arc(x, y, rr + 2, 0, TAU); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); });
		}
		if (d.on !== false && T.kind !== "inst" && T.kind !== "op" && T.kind !== "rad" && d.t !== "mains" && ui.opts.ring && T.kind !== "pow") {   // a breathing ring: the source is live
			var ph = ((now / 1000) * 0.9 + (d.x + d.y) * 0.1) % 1; c.strokeStyle = col; c.globalAlpha = 0.45 * (1 - ph); c.lineWidth = 2; c.beginPath(); c.arc(p[0], p[1], R + ph * R * 1.6, 0, TAU); c.stroke(); c.globalAlpha = 1;
		}
		c.fillStyle = "rgba(9,12,20,0.85)"; c.strokeStyle = sel ? "#fff" : col; c.lineWidth = sel ? 2.5 : 1.5; c.beginPath(); c.arc(p[0], p[1], R, 0, TAU); c.fill(); c.stroke();
		sym(c, d.t, p[0], p[1], R * 1.45, col);
		if (d.t === "rf_tx" || d.t === "fieldshaper" || d.t === "camera") {   // pointing direction
			c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2; var ax = p[0] + Math.cos(rot) * (R + 12), ay = p[1] + Math.sin(rot) * (R + 12);
			if (d.t === "camera") { if (!ui.opts.view) { c.globalAlpha = 0.18; c.beginPath(); c.moveTo(p[0], p[1]); c.arc(p[0], p[1], R + 60, rot - 0.4, rot + 0.4); c.closePath(); c.fill(); c.globalAlpha = 1; } }
			else { c.beginPath(); c.moveTo(p[0] + Math.cos(rot) * R, p[1] + Math.sin(rot) * R); c.lineTo(ax, ay); c.stroke(); c.beginPath(); c.moveTo(ax + Math.cos(rot) * 5, ay + Math.sin(rot) * 5); c.lineTo(ax + Math.cos(rot + 2.5) * 6, ay + Math.sin(rot + 2.5) * 6); c.lineTo(ax + Math.cos(rot - 2.5) * 6, ay + Math.sin(rot - 2.5) * 6); c.closePath(); c.fill(); }
		}
		if (d.t === "camera" || d.t === "meter" || d.t === "operator") {   // instrument status
			var fa = H.fieldAt(src, d.x, d.y), risk = d.t === "camera" ? H.emfRisk(fa.Eac, +d.imm || 10) : d.t === "operator" ? Math.min(1, fa.E / H.eRef(fa.fDom)) : 0;
			if (risk > 0.05) { c.fillStyle = risk > 0.5 ? "#ef4444" : "#f59e0b"; c.beginPath(); c.arc(p[0] + R * 0.75, p[1] - R * 0.75, 4.5, 0, TAU); c.fill(); }
		}
		if (showLab(d)) { c.fillStyle = d.on === false ? "#6b7280" : "#e5e7eb"; c.font = "600 11px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "top"; label(c, nameOf(d), p[0], p[1] + R + 3); c.textBaseline = "alphabetic"; }
		if (sel && (d.t === "rf_tx" || d.t === "fieldshaper" || (d.t === "camera" && !ui.opts.view) || d.t === "tesla_dumbbell" || d.t === "sample")) { var hp = rotHandle(d); c.strokeStyle = "#fff"; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(hp[0], hp[1]); c.stroke(); c.setLineDash([]); c.fillStyle = "#fde047"; c.beginPath(); c.arc(hp[0], hp[1], 6, 0, TAU); c.fill(); }
		if (ui.cableFrom === d.id) { c.strokeStyle = "#fde047"; c.lineWidth = 3; c.beginPath(); c.arc(p[0], p[1], R + 5, 0, TAU); c.stroke(); }
		c.restore();
	}
	/* ================= camera views ================= */
	var CAMCOL = ["#fde047", "#5eead4", "#f9a8d4", "#93c5fd", "#fdba74", "#c4b5fd"];
	function cams() { return st.items.filter(function (d) { return d.t === "camera"; }); }
	function camIndex(d) { return Math.max(0, cams().indexOf(d)); }
	function camCol(d) { return CAMCOL[camIndex(d) % CAMCOL.length]; }
	function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
	function viewHandles(d) {
		var p = toPx(d.x, d.y), a = (+d.rot || 0) * Math.PI / 180, h = H.camFov(d) * Math.PI / 360, wd = H.wallDist(st.room, d.x, d.y, a) * view.s;
		var L = Math.max(itemR(d) + 28, Math.min(wd * 0.7, 120)), Lf = L * 0.8;
		return {rot: [p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L], fov: [p[0] + Math.cos(a - h) * Lf, p[1] + Math.sin(a - h) * Lf]};
	}
	function focusCam() { var d = ui.sel ? byId(ui.sel) : null; return d && d.t === "camera" ? d : recCam(); }
	function drawViews(c) {
		var fc = focusCam();
		cams().forEach(function (d) {
			var col = camCol(d), off = d.on === false, foc = d === fc, poly = H.viewPoly(d, st.room, 40).map(function (q) { return toPx(q[0], q[1]); });
			c.save(); c.fillStyle = rgba(col, off ? 0.04 : foc ? 0.14 : 0.08); c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); for (var i = 1; i < poly.length; i++) c.lineTo(poly[i][0], poly[i][1]); c.closePath(); c.fill();
			c.strokeStyle = rgba(col, off ? 0.35 : 0.85); c.lineWidth = foc ? 2 : 1.3; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); c.lineTo(poly[1][0], poly[1][1]); c.moveTo(poly[0][0], poly[0][1]); c.lineTo(poly[poly.length - 1][0], poly[poly.length - 1][1]); c.stroke();
			var a = (+d.rot || 0) * Math.PI / 180, wd = H.wallDist(st.room, d.x, d.y, a) * view.s; c.setLineDash([2, 4]); c.strokeStyle = rgba(col, 0.5); c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); c.lineTo(poly[0][0] + Math.cos(a) * wd, poly[0][1] + Math.sin(a) * wd); c.stroke(); c.setLineDash([]);
			var hd = viewHandles(d);
			c.fillStyle = "#0b0f17"; c.beginPath(); c.arc(hd.rot[0], hd.rot[1], 9, 0, TAU); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(hd.rot[0], hd.rot[1], 7, 0, TAU); c.fill();
			c.strokeStyle = "#0b0f17"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(hd.rot[0] - 3.5, hd.rot[1]); c.lineTo(hd.rot[0] + 3.5, hd.rot[1]); c.moveTo(hd.rot[0], hd.rot[1] - 3.5); c.lineTo(hd.rot[0], hd.rot[1] + 3.5); c.stroke();
			c.fillStyle = "#0b0f17"; c.fillRect(hd.fov[0] - 6, hd.fov[1] - 6, 12, 12); c.fillStyle = "#f8fafc"; c.fillRect(hd.fov[0] - 4.5, hd.fov[1] - 4.5, 9, 9);
			c.font = "600 11px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "top"; c.fillStyle = col; if (ui.opts.lab) label(c, "Cam " + (camIndex(d) + 1) + " · " + Math.round(H.camFov(d)) + "°", hd.rot[0], hd.rot[1] + 11); c.textBaseline = "alphabetic";
			c.restore();
		});
	}
	function drawSeen(c) {
		var fc = focusCam(); if (!fc) return; var sees = H.camSees(st, fc), col = camCol(fc);
		c.save(); c.strokeStyle = col; c.lineWidth = 1.6; c.setLineDash([3, 3]);
		sees.ids.forEach(function (id) { var d = byId(id); if (!d) return; var p = toPx(d.x, d.y); c.beginPath(); c.arc(p[0], p[1], itemR(d) + 6, 0, TAU); c.stroke(); });
		sees.zones.forEach(function (z) { var d = byId(z.id); if (!d) return; var p = toPx(d.x - d.w / 2, d.y - d.h / 2); c.lineWidth = 2.2; c.strokeRect(p[0] - 3, p[1] - 3, d.w * view.s + 6, d.h * view.s + 6); });
		c.restore();
	}
	function seesText(d) {
		var s0 = H.camSees(st, d), nS = 0, nD = 0; s0.ids.forEach(function (id) { var o = byId(id); if (!o) return; if (o.t === "sample") nS++; else nD++; });
		var z = s0.zones.filter(function (q) { var o = byId(q.id); return o && o.t === "zone"; })[0];
		return "Sees " + nS + " sample" + (nS === 1 ? "" : "s") + " and " + nD + " other item" + (nD === 1 ? "" : "s") + (z ? "; " + Math.round(z.cover * 100) + "% of the active area" : "; not the active area") + ".";
	}
	// a label on a dark rounded plate with a dark outline round the letters, so it reads on any colour map (top-baseline callers; others get the plate around the text box too)
	function label(c, t, x, y) {
		var w = c.measureText(t).width, al = c.textAlign, x0 = al === "left" || al === "start" ? x : al === "right" || al === "end" ? x - w : x - w / 2, bl = c.textBaseline, fs = parseFloat(/(\d+(?:\.\d+)?)px/.exec(c.font) ? /(\d+(?:\.\d+)?)px/.exec(c.font)[1] : 11), y0 = bl === "top" ? y - 2 : bl === "middle" ? y - fs / 2 - 2 : y - fs;
		c.save(); c.fillStyle = "rgba(5,7,12,0.84)"; c.beginPath(); if (c.roundRect) c.roundRect(x0 - 4, y0, w + 8, fs + 5, 4); else c.rect(x0 - 4, y0, w + 8, fs + 5); c.fill();
		c.strokeStyle = "rgba(0,0,0,0.9)"; c.lineWidth = 3; c.lineJoin = "round"; c.strokeText(t, x, y); c.restore(); c.fillText(t, x, y);
	}
	// on a small floor (a phone) only the selected item, the hovered one and the zones keep their labels
	function showLab(d) { if (!ui.opts.lab) return ui.sel === d.id; if (view.s >= 22 || ui.sel === d.id || d.t === "zone") return true; if (hover) { var p = toPx(d.x, d.y); return Math.hypot(hover.px - p[0], hover.py - p[1]) < 40; } return false; }
	function rotHandle(d) { var p = toPx(d.x, d.y), R = itemR(d) + (d.t === "tesla_dumbbell" ? 0.7 * view.s : 0) + 18, a = (+d.rot || 0) * Math.PI / 180; return [p[0] + Math.cos(a) * R, p[1] + Math.sin(a) * R]; }

	// samples seen from above, with their live state
	function os(id) { return ostate[id] || (ostate[id] = {bend: 0, broken: 0, fused: 0, n: 0}); }
	function animOf(id, now) { var out = {}; anims.forEach(function (a) { if (a.id === id) { var u = (now - a.t0) / (a.dur * 1000); if (u >= 0 && u <= 1) out[a.e] = u; } }); return out; }
	function liftAt(u) { return u < 0.3 ? u / 0.3 : u < 0.75 ? 1 + 0.06 * Math.sin((u - 0.3) * 30) : Math.max(0, 1 - (u - 0.75) / 0.25); }
	function drawSampleTop(c, d, now) {
		var M = MAT[d.mat] || MAT.al, p = toPx(d.x, d.y), s = Math.max(10, 0.32 * view.s), a = animOf(d.id, now), o = os(d.id), sel = ui.sel === d.id, rot = (+d.rot || 0) * Math.PI / 180;
		var lift = a.lev != null ? liftAt(a.lev) : 0, wob = a.wob != null ? Math.sin(a.wob * 60) * (1 - a.wob) * 0.25 : 0, gone = a.van != null ? (a.van > 0.2 && a.van < 0.8) : false;
		c.save();
		if (lift > 0) { c.fillStyle = "rgba(0,0,0,0.45)"; c.beginPath(); c.ellipse(p[0] + lift * 6, p[1] + lift * 8, s * 0.6, s * 0.3, 0, 0, TAU); c.fill(); }
		c.translate(p[0], p[1] - lift * s * 1.4); c.rotate(rot + wob); var sc = 1 + lift * 0.35; c.scale(sc, sc);
		if (gone) c.globalAlpha = 0.12;
		if (a.glo != null) { var gg = c.createRadialGradient(0, 0, 2, 0, 0, s * 1.6); gg.addColorStop(0, "rgba(255,230,120," + (0.8 * Math.sin(a.glo * Math.PI)) + ")"); gg.addColorStop(1, "rgba(255,120,40,0)"); c.fillStyle = gg; c.beginPath(); c.arc(0, 0, s * 1.6, 0, TAU); c.fill(); }
		c.fillStyle = M.color; c.strokeStyle = sel ? "#fff" : "rgba(0,0,0,0.6)"; c.lineWidth = sel ? 2 : 1;
		shapeTop(c, d.shape, s, o);
		if (o.broken) { c.strokeStyle = "#111"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-s * 0.1, -s * 0.2); c.lineTo(s * 0.05, 0); c.lineTo(-s * 0.05, s * 0.2); c.stroke(); }
		if (o.fused) { c.strokeStyle = "#c084fc"; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, s * 0.75, 0, TAU); c.stroke(); }
		c.restore();
		if (showLab(d)) { c.fillStyle = "#e5e7eb"; c.font = "11px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "top"; label(c, nameOf(d), p[0], p[1] + s * 0.7 + 2); c.textBaseline = "alphabetic"; }
		if (sel) { var hp = rotHandle(d); c.fillStyle = "#fde047"; c.beginPath(); c.arc(hp[0], hp[1], 5, 0, TAU); c.fill(); }
		// drive badge
		var fa = d.__fa; if (fa && fa.D > 0.05) { c.fillStyle = "rgba(250,204,21," + (0.25 + 0.6 * fa.D) + ")"; c.beginPath(); c.arc(p[0] + s * 0.6, p[1] - s * 0.6, 3 + 3 * fa.D, 0, TAU); c.fill(); }
	}
	function shapeTop(c, sh, s, o) {
		var bend = (o.bend || 0) * Math.PI / 180;
		if (sh === "bar" || sh === "rod" || sh === "spoon") {
			var L = s * (sh === "spoon" ? 1.1 : 1.4), T = sh === "rod" ? s * 0.18 : sh === "spoon" ? s * 0.12 : s * 0.3;
			c.beginPath(); c.moveTo(-L / 2, -T / 2); c.quadraticCurveTo(0, -T / 2 + Math.sin(bend) * L * 0.4, L / 2, -T / 2); c.lineTo(L / 2, T / 2); c.quadraticCurveTo(0, T / 2 + Math.sin(bend) * L * 0.4, -L / 2, T / 2); c.closePath(); c.fill(); c.stroke();
			if (sh === "spoon") { c.beginPath(); c.ellipse(L / 2, 0, s * 0.3, s * 0.22, 0, 0, TAU); c.fill(); c.stroke(); }
		} else if (sh === "can" || sh === "disc" || sh === "jar") { c.beginPath(); c.arc(0, 0, s * (sh === "can" ? 0.3 : 0.4), 0, TAU); c.fill(); c.stroke(); }
		else if (sh === "bottle") { c.beginPath(); c.arc(0, 0, s * 0.38, 0, TAU); c.fill(); c.stroke(); c.fillStyle = "#e5e7eb"; c.beginPath(); c.arc(0, 0, s * 0.14, 0, TAU); c.fill(); }
		else if (sh === "sheet") { c.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7); c.strokeRect(-s * 0.5, -s * 0.35, s, s * 0.7); }
		else if (sh === "boat") { c.beginPath(); c.moveTo(-s * 0.6, -s * 0.22); c.lineTo(s * 0.45, -s * 0.22); c.lineTo(s * 0.7, 0); c.lineTo(s * 0.45, s * 0.22); c.lineTo(-s * 0.6, s * 0.22); c.closePath(); c.fill(); c.stroke(); }
		else { c.fillRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84); c.strokeRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84); }
	}

	/* ================= particles (smoke, dust, bubbles, sparks) ================= */
	function puff(where, x, y, kind, n) { for (var i = 0; i < n; i++) parts.push({w: where, x: x, y: y, vx: (Math.random() - 0.5) * (kind === "dust" ? 60 : 14), vy: kind === "bub" ? -10 - Math.random() * 20 : kind === "dust" ? -30 * Math.random() : -12 - Math.random() * 18, life: 0, max: 1.2 + Math.random() * 1.6, k: kind}); if (parts.length > 900) parts.splice(0, parts.length - 900); }
	function stepParts(dt) { for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.life += dt; if (p.life > p.max) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === "dust") p.vy += 40 * dt; if (p.k === "smoke") p.vx *= 0.99; } }
	function drawParts(c, where) {
		parts.forEach(function (p) {
			if (p.w !== where) return; var u = p.life / p.max;
			if (p.k === "smoke") { c.fillStyle = "rgba(220,225,235," + (0.35 * (1 - u)) + ")"; c.beginPath(); c.arc(p.x, p.y, 3 + u * 12, 0, TAU); c.fill(); }
			else if (p.k === "dust") { c.fillStyle = "rgba(245,245,240," + (0.9 * (1 - u)) + ")"; c.fillRect(p.x, p.y, 2, 2); }
			else if (p.k === "bub") { c.strokeStyle = "rgba(186,230,253," + (1 - u) + ")"; c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, 1.5 + u * 3, 0, TAU); c.stroke(); }
			else if (p.k === "spark") { c.fillStyle = "rgba(255,240,180," + (1 - u) + ")"; c.fillRect(p.x, p.y, 2, 2); }
		});
	}

	/* ================= the target camera (side view) ================= */
	var camCur = null;
	function recCam() {
		var cs = cams().filter(function (d) { return d.on !== false; }), sd = ui.sel ? byId(ui.sel) : null;
		if (sd && sd.t === "camera" && sd.on !== false) { ui.recCam = sd.id; return sd; }
		if (ui.recCam) { var r = byId(ui.recCam); if (r && r.t === "camera" && r.on !== false) return r; }
		return cs[0] || null;
	}
	function camDevice() { return recCam(); }
	function camSamples() {
		var cam = recCam();
		if (cam) return samples().filter(function (d) { return H.inView(cam, d.x, d.y); }).sort(function (a, b) { return H.viewAngle(cam, a.x, a.y) - H.viewAngle(cam, b.x, b.y); }).slice(0, 8);
		var z = zone(), list = samples();
		if (z) { var inZ = list.filter(function (d) { return Math.abs(d.x - z.x) <= z.w / 2 + 0.2 && Math.abs(d.y - z.y) <= z.h / 2 + 0.2; }); if (inZ.length) list = inZ; }
		return list.slice().sort(function (a, b) { return a.x - b.x; }).slice(0, 8);
	}
	function seedOf(d) { var h = 7; String(d.id).split("").forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) | 0; }); return h; }
	var replay = null;
	function drawCam(now) {
		if (!ui.show.rec) return; var c = camX; c.setTransform(dpr, 0, 0, dpr, 0, 0);
		var cam = recCam(), fa = cam ? H.fieldAt(src, cam.x, cam.y) : null, imm = cam ? (+cam.imm || 10) : 10, noise = cam ? H.camNoise(fa.Eac, imm) : 0;
		var bg = c.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, "#151a22"); bg.addColorStop(1, "#05070b"); c.fillStyle = bg; c.fillRect(0, 0, CW, CH);
		// the high-voltage gear this camera can see, as silhouettes behind the table
		var hv = st.items.filter(function (d) { return d.on !== false && DEV[d.t] && /hv|dc/.test(DEV[d.t].kind) && (!cam || H.inView(cam, d.x, d.y)); }).slice(0, 4);
		hv.forEach(function (d, i) { var x = cam ? CW * (0.5 + 0.9 * H.viewAngle(cam, d.x, d.y) / H.camFov(cam)) : CW * (0.12 + 0.76 * (i + 0.5) / Math.max(1, hv.length)), sz = CH * 0.55; c.globalAlpha = 0.28; sym(c, d.t, x, CH * 0.38, sz, "#94a3b8"); c.globalAlpha = 1; if (Math.random() < 0.06) { c.strokeStyle = "rgba(200,180,255,0.7)"; c.lineWidth = 1; c.beginPath(); var yx = x, yy = CH * 0.12; c.moveTo(yx, yy); for (var k = 0; k < 6; k++) { yx += (Math.random() - 0.5) * 30; yy += 10; c.lineTo(yx, yy); } c.stroke(); } });
		var ty = CH * 0.78; c.fillStyle = "#3f2e1e"; c.fillRect(CW * 0.04, ty, CW * 0.92, 8); c.fillStyle = "#2a1f15"; c.fillRect(CW * 0.08, ty + 8, 8, CH - ty); c.fillRect(CW * 0.9, ty + 8, 8, CH - ty);
		var list = camSamples(), n = list.length;
		list.forEach(function (d, i) { drawSampleSide(c, d, CW * (0.1 + 0.8 * (i + 0.5) / Math.max(1, n)), ty, Math.min(CW / Math.max(4, n) * 0.55, CH * 0.38), now); });
		drawParts(c, "cam");
		// interference: snow and torn lines grow with the field at the camera; dropouts come in short bursts (more often in stronger fields) and with spark-gap shots
		var gapShot = Object.keys(flash).some(function (id) { return now - flash[id] < 250; }), drop = 0;
		if (cam && noise > 0 && !reduce) {
			var g = noise;
			if (Math.random() < g * 0.45) { var by = Math.random() * CH, bh = 3 + Math.random() * 18 * g, sh = (Math.random() - 0.5) * 40 * g; try { c.drawImage(camC, 0, by * dpr, CW * dpr, bh * dpr, sh, by, CW, bh); } catch (e) { /* ignore */ } }
			c.fillStyle = "rgba(255,255,255," + (0.03 + 0.06 * g) + ")"; for (var k = 0; k < 30 * g; k++) c.fillRect(Math.random() * CW, Math.random() * CH, Math.random() * 40, 1);
			drop = H.camDropout(noise, now / 1000, seedOf(cam)); if (gapShot && noise > 0.15) drop = 1;
			if (drop) { c.fillStyle = "rgba(0,0,0,0.88)"; c.fillRect(0, 0, CW, CH); for (var q = 0; q < 6; q++) { c.fillStyle = "rgba(255,255,255," + (0.05 + 0.08 * Math.random()) + ")"; c.fillRect(0, Math.random() * CH, CW, 1 + Math.random() * 3); } c.fillStyle = "#e5e7eb"; c.font = "700 14px ui-monospace,monospace"; c.textAlign = "center"; c.fillText(gapShot ? "SPARK GAP: SIGNAL LOST" : "SIGNAL DROPOUT", CW / 2, CH / 2); }
		}
		var narrow = CW < 560;
		c.fillStyle = "#e5e7eb"; c.font = "12px ui-monospace,monospace"; c.textAlign = "left"; c.fillText((Math.floor(now / 600) % 2 ? "● " : "  ") + "REC  " + fmtT(simT) + (ui.run ? "" : "  ❚❚ PAUSED"), 10, 18);
		var q2 = !cam ? "" : noise === 0 ? "clean picture" : noise < 0.35 ? "light interference" : noise < 0.7 ? "heavy interference" : "frequent dropouts";
		c.textAlign = "right"; c.font = (narrow ? "10px" : "12px") + " ui-monospace,monospace";
		c.fillText(cam ? (nameOf(cam) + " · " + H.fmtE(fa.Eac) + " AC" + (narrow ? "" : " (" + (fa.Eac / imm >= 10 ? Math.round(fa.Eac / imm) : (fa.Eac / imm).toFixed(1)) + "× its " + imm + " V/m immunity)") + " · " + q2) : "no camera on: add one to record", CW - 10, narrow ? 34 : 18);
		if (replay && now < replay.until) { var E = H.EFF[replay.ev.e]; c.textAlign = "left"; c.fillStyle = "#fde047"; c.font = "700 11px ui-monospace,monospace"; c.fillText("▶ REPLAY " + fmtT(replay.ev.t) + " · " + (E ? E.name : "") + (list.some(function (d) { return d.id === replay.ev.id; }) ? "" : " (not in this camera's view)"), 10, narrow ? 50 : 34); }
		if (!n && !drop) { c.textAlign = "center"; c.fillStyle = "#e5e7eb"; c.font = (narrow ? "11px" : "12px") + " system-ui,sans-serif"; c.fillText(cam ? (narrow ? nameOf(cam) + " sees no samples: turn it" : nameOf(cam) + " is not pointed at any samples: turn it with the round handle at the end of its view") : "Place samples in the active area to watch them here", CW / 2, CH / 2); }
	}
	/* timeline under the recording: every event as a dot; click one to replay it */
	function drawTL() {
		var tl = $("hx-tl"); if (!tl || !ui.show.tl) return; var c = tl.getContext("2d"), w = CW, h = 38; c.setTransform(dpr, 0, 0, dpr, 0, 0);
		c.fillStyle = "#0a0d14"; c.fillRect(0, 0, w, h); var T = Math.max(60, simT), x0 = 10, x1 = w - 10;
		c.strokeStyle = "#263042"; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, 24); c.lineTo(x1, 24); c.stroke();
		c.fillStyle = "#9aa5bb"; c.font = "10px system-ui,sans-serif"; c.textAlign = "left"; c.fillText("0:00", x0, 36); c.textAlign = "right"; c.fillText(fmtT(T) + (events.length ? "  ·  " + events.length + " events: click a dot to replay" : "  ·  events appear here"), x1, 36);
		events.forEach(function (ev) { var E = H.EFF[ev.e], x = x0 + (x1 - x0) * ev.t / T; c.fillStyle = E ? E.color : "#fff"; c.beginPath(); c.arc(x, 14 + (H.EFFECTS.indexOf(E) % 3) * 4, 3.2, 0, TAU); c.fill(); });
		c.strokeStyle = "#fde047"; c.beginPath(); c.moveTo(x0 + (x1 - x0) * simT / T, 4); c.lineTo(x0 + (x1 - x0) * simT / T, 28); c.stroke();
	}
	function evAtTL(px) { var T = Math.max(60, simT), x0 = 10, x1 = CW - 10, best = null, bd = 12; events.forEach(function (ev) { var dx = Math.abs(x0 + (x1 - x0) * ev.t / T - px); if (dx < bd) { bd = dx; best = ev; } }); return best; }
	function doReplay(ev) {
		var E = H.EFF[ev.e]; if (!E || !byId(ev.id)) { note("That sample is no longer on the floor."); return; }
		var now = performance.now(); anims.push({id: ev.id, e: ev.e, t0: now, dur: E.dur}); replay = {ev: ev, until: now + E.dur * 1000 + 600};
		var cam = recCam(); if (cam && !H.inView(cam, byId(ev.id).x, byId(ev.id).y)) note("Replaying " + fmtT(ev.t) + ": " + ev.txt + ". The sample is outside " + nameOf(cam) + "'s view: turn the camera to see it."); else note("Replaying " + fmtT(ev.t) + ": " + ev.txt);
	}
	function drawSampleSide(c, d, x, ty, s, now) {
		var M = MAT[d.mat] || MAT.al, a = animOf(d.id, now), o = os(d.id), lift = a.lev != null ? liftAt(a.lev) : 0, sh = d.shape;
		var dy = -lift * s * (1.3 + (((d.id.charCodeAt(d.id.length - 1) || 0) % 3) * 0.3)), wob = a.wob != null ? Math.sin(a.wob * 70) * (1 - a.wob) : 0;
		if (a.van != null && a.van > 0.2 && a.van < 0.8) { if (Math.random() < 0.3) puff("cam", x, ty - s * 0.3, "spark", 1); return; }
		c.save(); c.translate(x + wob * 6, ty + dy); c.rotate(wob * 0.15);
		if (lift > 0) { c.save(); c.translate(0, -dy); c.fillStyle = "rgba(0,0,0," + (0.5 - 0.3 * lift) + ")"; c.beginPath(); c.ellipse(0, 2, s * 0.5 * (1 - lift * 0.4), 3, 0, 0, TAU); c.fill(); c.restore(); }
		if (a.glo != null) { var gg = c.createRadialGradient(0, -s * 0.2, 2, 0, -s * 0.2, s * 1.2); gg.addColorStop(0, "rgba(255,225,130," + (0.85 * Math.sin(a.glo * Math.PI)) + ")"); gg.addColorStop(1, "rgba(255,90,30,0)"); c.fillStyle = gg; c.beginPath(); c.arc(0, -s * 0.2, s * 1.2, 0, TAU); c.fill(); }
		c.fillStyle = M.color; c.strokeStyle = "rgba(0,0,0,0.7)"; c.lineWidth = 1;
		var bend = ((o.bend || 0) + (a.jel != null ? 40 * Math.sin(a.jel * Math.PI) : 0)) * Math.PI / 180, breathe = a.brt != null ? 1 + 0.12 * Math.sin(a.brt * TAU * 3) : 1;
		if (sh === "bar" || sh === "rod" || sh === "spoon") {
			var L = s * 1.3, T = sh === "rod" ? s * 0.12 : sh === "spoon" ? s * 0.08 : s * 0.2, sag = Math.sin(bend) * L * 0.45, half = o.broken ? 0.42 : 0.5;
			c.beginPath(); c.moveTo(-L * half, -T); c.quadraticCurveTo(0, -T + sag, L * half, -T - (o.broken ? 4 : 0)); c.lineTo(L * half, 0 - (o.broken ? 4 : 0)); c.quadraticCurveTo(0, sag, -L * half, 0); c.closePath(); c.fill(); c.stroke();
			if (sh === "spoon") { c.beginPath(); c.ellipse(L * 0.55, -T, s * 0.22, s * 0.1, 0, 0, TAU); c.fill(); c.stroke(); }
			if (o.broken) { c.fillStyle = M.color; c.fillRect(L * 0.48, -T * 0.8, L * 0.12, T * 0.8); c.fillStyle = "rgba(240,240,235,0.9)"; for (var k = 0; k < 6; k++) c.fillRect(L * 0.45 + k * 3, -1, 2, 1); }
		} else if (sh === "bottle") {
			c.save(); c.scale(breathe, 1); c.fillStyle = "rgba(186,230,253,0.35)"; c.beginPath(); c.moveTo(-s * 0.28, 0); c.lineTo(-s * 0.28, -s * 0.8); c.quadraticCurveTo(-s * 0.28, -s * 1.0, -s * 0.1, -s * 1.05); c.lineTo(-s * 0.1, -s * 1.2); c.lineTo(s * 0.1, -s * 1.2); c.lineTo(s * 0.1, -s * 1.05); c.quadraticCurveTo(s * 0.28, -s * 1.0, s * 0.28, -s * 0.8); c.lineTo(s * 0.28, 0); c.closePath(); c.fill(); c.strokeStyle = "rgba(186,230,253,0.8)"; c.stroke();
			c.fillStyle = "rgba(59,130,246,0.75)"; var lvl = -s * 0.62 + (a.bub != null ? Math.sin(now / 60) * 3 : 0); c.fillRect(-s * 0.26, lvl, s * 0.52, -lvl); c.restore();
			if (a.bub != null && Math.random() < 0.7) puff("cam", x + (Math.random() - 0.5) * s * 0.4, ty + dy - 4, "bub", 2);
		} else if (sh === "sheet") { c.fillRect(-s * 0.55, -3, s * 1.1, 3); c.strokeRect(-s * 0.55, -3, s * 1.1, 3); }
		else if (sh === "can") { c.fillRect(-s * 0.18, -s * 0.6, s * 0.36, s * 0.6); c.strokeRect(-s * 0.18, -s * 0.6, s * 0.36, s * 0.6); c.fillStyle = "#1e3a8a"; c.fillRect(-s * 0.18, -s * 0.45, s * 0.36, s * 0.2); }
		else if (sh === "boat") { c.beginPath(); c.moveTo(-s * 0.55, -s * 0.3); c.lineTo(s * 0.55, -s * 0.3); c.lineTo(s * 0.35, 0); c.lineTo(-s * 0.35, 0); c.closePath(); c.fill(); c.stroke(); c.fillRect(-s * 0.04, -s * 0.75, s * 0.06, s * 0.45); }
		else if (sh === "jar") { c.fillStyle = "rgba(165,243,252,0.35)"; c.fillRect(-s * 0.3, -s * 0.7, s * 0.6, s * 0.7); c.strokeStyle = "rgba(165,243,252,0.9)"; c.strokeRect(-s * 0.3, -s * 0.7, s * 0.6, s * 0.7); }
		else if (sh === "disc") { c.fillRect(-s * 0.35, -s * 0.12, s * 0.7, s * 0.12); c.strokeRect(-s * 0.35, -s * 0.12, s * 0.7, s * 0.12); }
		else { var bs = (+d.m || 0.3) > 5 ? s * 0.9 : s * 0.5; c.fillRect(-bs / 2, -bs, bs, bs); c.strokeRect(-bs / 2, -bs, bs, bs); }
		if (o.fused) { c.strokeStyle = "#c084fc"; c.lineWidth = 2; c.beginPath(); c.moveTo(-s * 0.6, -1); c.lineTo(s * 0.6, -1); c.stroke(); }
		c.restore();
		if (a.fum != null && Math.random() < 0.6) puff("cam", x + (Math.random() - 0.5) * s * 0.3, ty + dy - s * 0.3, "smoke", 1);
		if (a.frc != null && a.frc < 0.3 && Math.random() < 0.8) puff("cam", x + s * 0.4, ty + dy - 6, "dust", 4);
		if (CW / Math.max(1, camSamples().length) > 78) { c.fillStyle = "#cbd5e1"; c.font = "10px system-ui,sans-serif"; c.textAlign = "center"; c.fillText(nameOf(d), x, ty + 22); }
	}

	/* ================= running the experiment ================= */
	function fmtT(t) { var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60; return (h ? h + ":" : "") + (m < 10 && h ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s; }
	function tick(dtReal, now) {
		if (!ui.run) return; var dt = dtReal * ui.speed; simT += dt;
		// spark gaps fire every few tens of seconds
		var boost = {};
		st.items.forEach(function (d) {
			if (d.t !== "sparkgap" || d.on === false) return; var iv = Math.max(1, +d.gap || 40);
			if (gapNext[d.id] == null) gapNext[d.id] = simT + iv * (0.3 + 0.7 * rnd());
			if (simT >= gapNext[d.id]) { gapNext[d.id] = simT + iv * (0.8 + 0.4 * rnd()); flash[d.id] = now; boost[d.id] = 1; var p = toPx(d.x, d.y); puff("floor", p[0], p[1], "spark", 10); lastGap = simT; }
		});
		var w = H.warm(simT / 60, 20), recent = simT - lastGap < 4 ? 3 : 1;
		samples().forEach(function (d) {
			var fa = d.__fa || (d.__fa = fieldAtObj(d)), r = H.rates(d, fa, {neighbour: neighbour(d)}), o = os(d.id);
			H.EFFECTS.forEach(function (e) {
				var lam = r[e.id] * w * recent; if (!(lam > 0)) return;
				if (o.broken && e.id === "frc") lam *= 0.2;
				var p = 1 - Math.exp(-lam * dt / 3600);
				if (rnd() < p) fire(d, e, fa, now);
			});
		});
	}
	var lastGap = -1e9;
	function fire(d, e, fa, now) {
		if (anims.some(function (a) { return a.id === d.id && a.e === e.id && (now - a.t0) < a.dur * 1000; })) return;
		var mag = H.magnitude(e.id, d, fa.D), o = os(d.id);
		anims.push({id: d.id, e: e.id, t0: now, dur: e.dur}); if (anims.length > 60) anims.shift();
		if (e.id === "jel") o.bend = Math.min(80, (o.bend || 0) + mag.v * 0.4);
		if (e.id === "frc") o.broken = 1;
		if (e.id === "fus") o.fused = 1;
		o.n++;
		events.push({t: simT, id: d.id, e: e.id, txt: nameOf(d) + ": " + mag.txt}); if (events.length > 400) events.shift();
		var p = toPx(d.x, d.y);
		if (e.id === "fum") puff("floor", p[0], p[1], "smoke", 14); if (e.id === "frc") puff("floor", p[0], p[1], "dust", 30); if (e.id === "bub") puff("floor", p[0], p[1], "bub", 12);
		logEvent(events[events.length - 1]);
	}
	function logEvent(ev) {
		var ul = $("hx-log"); if (!ul) return; var li = document.createElement("li"), E = H.EFF[ev.e];
		li.innerHTML = "<span class=\"hx-dot\" style=\"background:" + E.color + "\"></span><b>" + fmtT(ev.t) + "</b> " + esc(E.name) + ": " + esc(ev.txt) + " <button type=\"button\" class=\"hx-rp\" title=\"Replay this event on the camera recording\">▶ replay</button>"; li.querySelector(".hx-rp").onclick = function () { doReplay(ev); };
		ul.insertBefore(li, ul.firstChild); while (ul.children.length > 40) ul.removeChild(ul.lastChild);
		var c = $("hx-r-ev"); if (c) c.textContent = events.length;
	}

	/* ================= pointer interaction ================= */
	var hover = null, drag = null;
	function hit(px, py) {
		for (var i = st.items.length - 1; i >= 0; i--) { var d = st.items[i]; if (d.t === "zone" || d.t === "area") continue; var p = toPx(d.x, d.y), R = itemR(d) + 4; if (Math.hypot(px - p[0], py - p[1]) <= R) return d; if (d.t === "tesla_dumbbell") { var a = (+d.rot || 0) * Math.PI / 180, L = 0.7 * view.s; for (var q = -1; q <= 1; q += 2) if (Math.hypot(px - p[0] - Math.cos(a) * L * q, py - p[1] - Math.sin(a) * L * q) < 12) return d; } }
		for (var j = st.items.length - 1; j >= 0; j--) { var z = st.items[j]; if (z.t !== "zone" && z.t !== "area") continue; var pz = toPx(z.x - z.w / 2, z.y - z.h / 2); if (px >= pz[0] && px <= pz[0] + z.w * view.s && py >= pz[1] && py <= pz[1] + z.h * view.s) return z; }
		return null;
	}
	function evPos(e) { var b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
	var ptrs = {};
	function startPinch() { var k = Object.keys(ptrs); if (k.length < 2) return; var a = ptrs[k[0]], b = ptrs[k[1]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; drag = {mode: "pinch", d0: Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])), z0: zm.z, wm: toM(mid[0], mid[1])}; }
	function viewHit(p, touch) {
		if (!ui.opts.view) return null; var r = touch ? 18 : 11, cs = cams();
		for (var i = cs.length - 1; i >= 0; i--) { var hd = viewHandles(cs[i]); if (Math.hypot(p[0] - hd.rot[0], p[1] - hd.rot[1]) < r) return {mode: "crot", d: cs[i]}; if (Math.hypot(p[0] - hd.fov[0], p[1] - hd.fov[1]) < r) return {mode: "fov", d: cs[i]}; }
		return null;
	}
	cv.addEventListener("pointerdown", function (e) {
		var p = evPos(e), m = toM(p[0], p[1]); cv.focus({preventScroll: true});
		ptrs[e.pointerId] = p; if (Object.keys(ptrs).length >= 2) { try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } startPinch(); return; }
		if (ui.add) { place(ui.add, m[0], m[1]); return; }
		if (ui.tool === "move") { var vh = viewHit(p, e.pointerType === "touch"); if (vh) { drag = vh; select(vh.d.id); ui.recCam = vh.d.id; cv.setPointerCapture(e.pointerId); return; } }
		var d = hit(p[0], p[1]), sd = ui.sel ? byId(ui.sel) : null;
		if (ui.tool === "move" && sd) {
			if (sd.t === "zone" || sd.t === "area") { var pz = toPx(sd.x + sd.w / 2, sd.y + sd.h / 2); if (Math.abs(p[0] - pz[0]) < 10 && Math.abs(p[1] - pz[1]) < 10) { drag = {mode: "size", d: sd}; cv.setPointerCapture(e.pointerId); return; } }
			else if (/^(rf_tx|fieldshaper|camera|tesla_dumbbell|sample)$/.test(sd.t)) { var hp = rotHandle(sd); if (Math.hypot(p[0] - hp[0], p[1] - hp[1]) < 10) { drag = {mode: "rot", d: sd}; cv.setPointerCapture(e.pointerId); return; } }
		}
		var ci = d ? -1 : cabHit(p[0], p[1]);
		if (ui.tool === "del") { if (d) remove(d.id); else if (ci >= 0) { var cb0 = st.cables[ci]; toggleCable(cb0[0], cb0[1]); } return; }
		if (ui.tool === "cable") {
			if (!d || d.t === "zone" || d.t === "area" || d.t === "sample") { ui.cableFrom = null; note("Cable: click the device that feeds, then the device it feeds."); return; }
			if (!ui.cableFrom) { ui.cableFrom = d.id; note("Now click the device that " + nameOf(d) + " feeds."); return; }
			if (ui.cableFrom === d.id) { ui.cableFrom = null; return; }
			toggleCable(ui.cableFrom, d.id); ui.cableFrom = null; return;
		}
		if (ui.tool === "move" && !d && ci >= 0) { select(null); ui.selCab = ci; var g0 = cabGeom(st.cables[ci]); if (g0) note(CABT[g0.ty].name + " cable: " + nameOf(g0.e[0]) + " → " + nameOf(g0.e[1]) + ". Delete removes it."); return; }
		select(d ? d.id : null); if (d && d.t === "camera") ui.recCam = d.id;
		if (d) { drag = {mode: "move", d: d, dx: m[0] - d.x, dy: m[1] - d.y, moved: false}; cv.setPointerCapture(e.pointerId); }
		else { drag = {mode: "pan", sx: p[0], sy: p[1], px0: zm.px, py0: zm.py}; cv.setPointerCapture(e.pointerId); }
	});
	cv.addEventListener("pointermove", function (e) {
		var p = evPos(e), m = toM(p[0], p[1]); hover = {px: p[0], py: p[1], x: m[0], y: m[1]};
		ui.hovCab = !drag && (ui.tool === "move" || ui.tool === "del") && !hit(p[0], p[1]) ? cabHit(p[0], p[1]) : -1;
		if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
		if (drag && drag.mode === "pinch") { var k = Object.keys(ptrs); if (k.length >= 2) { var a = ptrs[k[0]], b = ptrs[k[1]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; zm.z = H.clamp(drag.z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / drag.d0, 0.5, 12); applyView(); var p2 = toPx(drag.wm[0], drag.wm[1]); zm.px += mid[0] - p2[0]; zm.py += mid[1] - p2[1]; applyView(); } return; }
		if (drag && drag.mode === "pan") { zm.px = drag.px0 + p[0] - drag.sx; zm.py = drag.py0 + p[1] - drag.sy; applyView(); cv.style.cursor = "grabbing"; return; }
		if (drag && (drag.mode === "crot" || drag.mode === "fov")) {
			var dc = drag.d;
			if (drag.mode === "crot") { var c1 = toPx(dc.x, dc.y), a1 = Math.atan2(p[1] - c1[1], p[0] - c1[0]) * 180 / Math.PI; if (!e.shiftKey) a1 = Math.round(a1 / 5) * 5; dc.rot = Math.round(a1); }
			else dc.fov = Math.round(H.clamp(2 * Math.abs(H.viewAngle(dc, m[0], m[1])), 10, 120));
			saveSoon(); editor(); pointerReadout(); return;
		}
		if (drag) {
			var d = drag.d;
			if (drag.mode === "move") { d.x = H.clamp(m[0] - drag.dx, 0, st.room.w); d.y = H.clamp(m[1] - drag.dy, 0, st.room.h); drag.moved = true; delete d.__fa; if (d.t !== "zone" && d.t !== "area" && d.t !== "sample") dirty(false); else samplesChanged(); }
			else if (drag.mode === "rot") { var c0 = toPx(d.x, d.y), a = Math.atan2(p[1] - c0[1], p[0] - c0[0]) * 180 / Math.PI; if (!e.shiftKey) a = Math.round(a / 5) * 5; d.rot = Math.round(a); if (d.t === "camera") saveSoon(); else dirty(false); }
			else if (drag.mode === "size") { d.w = Math.max(0.3, (m[0] - d.x) * 2); d.h = Math.max(0.3, (m[1] - d.y) * 2); samplesChanged(); }
			editor();
		}
		pointerReadout();
		cv.style.cursor = drag ? "grabbing" : ui.add ? "copy" : ui.tool === "del" ? "not-allowed" : ui.tool === "cable" ? "crosshair" : (hit(p[0], p[1]) || (ui.tool === "move" && viewHit(p, false))) ? "grab" : ui.hovCab >= 0 ? "pointer" : "default";
	});
	function endDrag(e) { if (e && e.pointerId != null) delete ptrs[e.pointerId]; if (drag && drag.mode === "pinch") { if (Object.keys(ptrs).length < 2) drag = null; return; } if (drag && (drag.mode === "pan" || drag.mode === "crot" || drag.mode === "fov")) { drag = null; saveSoon(); return; } if (drag) { var d = drag.d; drag = null; if (d.t !== "zone" && d.t !== "area" && d.t !== "sample") dirty(true); samplesChanged(); renderPanels(); } }
	cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
	cv.addEventListener("pointerleave", function () { hover = null; ui.hovCab = -1; pointerReadout(); });
	cv.addEventListener("wheel", function (e) {
		var wrap = stage.parentNode, big = wrap.classList.contains("mes-fill") || document.fullscreenElement === wrap;
		if (!e.ctrlKey && !big) return; e.preventDefault(); var p = evPos(e); zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), p[0], p[1]);
	}, {passive: false});
	cv.addEventListener("keydown", function (e) {
		var d = ui.sel ? byId(ui.sel) : null;
		if (e.key === "Escape") { ui.add = null; ui.cableFrom = null; ui.selCab = -1; closeShow(); setTool("move"); select(null); closeAdd(); return; }
		if (!e.ctrlKey && !e.metaKey && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoomAt(1.25); return; }
		if (!e.ctrlKey && !e.metaKey && (e.key === "-" || e.key === "_")) { e.preventDefault(); zoomAt(0.8); return; }
		if (!e.ctrlKey && !e.metaKey && e.key === "0") { e.preventDefault(); zoomFit(); return; }
		if (!d && ui.selCab >= 0 && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); var cb1 = st.cables[ui.selCab]; if (cb1) toggleCable(cb1[0], cb1[1]); return; }
		if (!d) return;
		if (d.t === "camera" && (e.key === "[" || e.key === "]" || e.key === "{" || e.key === "}" || (e.altKey && /^Arrow/.test(e.key)))) {
			e.preventDefault();
			if (e.key === "ArrowUp" || e.key === "ArrowDown") d.fov = H.clamp(H.camFov(d) + (e.key === "ArrowUp" ? 5 : -5), 10, 120);
			else { var step = (e.key === "{" || e.key === "}" || e.shiftKey) ? 1 : 5, dir = (e.key === "]" || e.key === "}" || e.key === "ArrowRight") ? 1 : -1, r0 = (+d.rot || 0) + dir * step; d.rot = ((r0 + 180) % 360 + 360) % 360 - 180; }
			saveSoon(); editor(); return;
		}
		if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(d.id); }
		else if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); duplicate(d.id); }
		else if (e.key === "r" || e.key === "R") { d.rot = ((+d.rot || 0) + (e.shiftKey ? -15 : 15)) % 360; dirty(true); editor(); }
		else if (/^Arrow/.test(e.key)) { e.preventDefault(); var st0 = e.shiftKey ? 1 : 0.1; if (e.key === "ArrowLeft") d.x -= st0; if (e.key === "ArrowRight") d.x += st0; if (e.key === "ArrowUp") d.y -= st0; if (e.key === "ArrowDown") d.y += st0; d.x = H.clamp(d.x, 0, st.room.w); d.y = H.clamp(d.y, 0, st.room.h); delete d.__fa; dirty(true); samplesChanged(); editor(); }
	});
	document.addEventListener("keydown", function (e) {
		if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
		var here = e.target === cv || e.target === document.body || (e.target.closest && e.target.closest("#hx .hx-wrap"));
		if (e.key === " " && ui.tab === "lab" && (e.target === cv || e.target === document.body)) { e.preventDefault(); setRun(!ui.run); }
		if ((e.key === "l" || e.key === "L") && !e.ctrlKey && !e.metaKey && !e.altKey && ui.tab === "lab" && here) { e.preventDefault(); toggleLabels(); }
	});
	function place(a, x, y) {
		var d;
		if (a.t === "sample") d = H.smp(newId(), a.k, x, y); else d = H.dev(newId(), a.t, x, y, {label: ""});
		d.x = H.clamp(x, 0, st.room.w); d.y = H.clamp(y, 0, st.room.h); delete d.label; if (a.t === "sample") d.label = H.SAMPLES[a.k].name;
		st.items.push(d); ui.add = null; paintPalette(); select(d.id); if (d.t === "sample" || d.t === "zone" || d.t === "area") samplesChanged(); dirty(true); renderPanels();
	}
	function remove(id) { if (ui.sel === id) { var db = $("hx-delsel"); if (db) db.hidden = true; } st.items = st.items.filter(function (d) { return d.id !== id; }); st.cables = st.cables.filter(function (c) { return c[0] !== id && c[1] !== id; }); ui.selCab = ui.hovCab = -1; if (ui.sel === id) ui.sel = null; dirty(true); samplesChanged(); renderPanels(); }
	function duplicate(id) { var d = byId(id); if (!d) return; var n = JSON.parse(JSON.stringify(d)); delete n.__fa; n.id = newId(); n.x = H.clamp(d.x + 0.5, 0, st.room.w); n.y = H.clamp(d.y + 0.5, 0, st.room.h); st.items.push(n); select(n.id); dirty(true); samplesChanged(); renderPanels(); }
	function toggleCable(a, b) { ui.selCab = -1; ui.hovCab = -1; var i = st.cables.findIndex(function (c) { return c[0] === a && c[1] === b; }); if (i >= 0) { st.cables.splice(i, 1); note("Cable removed."); } else { st.cables.push([a, b]); note("Cable: " + nameOf(byId(a)) + " → " + nameOf(byId(b)) + "."); } dirty(true); renderPanels(); }
	function select(id) { ui.sel = id; ui.selCab = -1; var db = $("hx-delsel"); if (db) db.hidden = !id; editor(); }
	function samplesChanged() { samples().forEach(function (d) { delete d.__fa; }); saveSoon(); }

	/* ================= palette + toolbar ================= */
	function iconCanvas(t, size, col) { var c = document.createElement("canvas"), r = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = size * r; c.style.width = c.style.height = size + "px"; var x = c.getContext("2d"); x.scale(r, r); sym(x, t, size / 2, size / 2, size * 0.9, col); return c; }
	function paintPalette() {
		var box = $("hx-pal"); if (!box.__built) {
			box.__built = 1;
			H.ORDER.forEach(function (t) { [box, $("hx-ppal")].forEach(function (box) { if (!box) return; var b = document.createElement("button"); b.type = "button"; b.className = "hx-pb"; b.dataset.t = t; b.title = "Add: " + DEV[t].name; b.appendChild(iconCanvas(t, 26, DEV[t].color)); var sp = document.createElement("span"); sp.textContent = DEV[t].name.replace(/ \(.+\)$/, ""); b.appendChild(sp); b.onclick = function () { armAdd({t: t}); }; box.appendChild(b); }); });
			Object.keys(H.SAMPLES).forEach(function (k) { [$("hx-spal"), $("hx-pspal")].forEach(function (sbox) { if (!sbox) return; var P = H.SAMPLES[k], b = document.createElement("button"); b.type = "button"; b.className = "hx-pb hx-pb--s"; b.dataset.k = k; var dot = document.createElement("i"); dot.style.background = MAT[P.mat].color; b.appendChild(dot); var sp = document.createElement("span"); sp.textContent = P.name; b.appendChild(sp); b.title = "Add: " + P.name + " (" + MAT[P.mat].name + ", " + fmtMass(P.m) + ")"; b.onclick = function () { armAdd({t: "sample", k: k}); }; sbox.appendChild(b); }); });
		}
		Array.prototype.forEach.call(document.querySelectorAll("#hx .hx-pb"), function (b) { var on = ui.add && (ui.add.t === b.dataset.t || (ui.add.k && ui.add.k === b.dataset.k)); b.setAttribute("aria-pressed", on ? "true" : "false"); });
	}
	function armAdd(a) { closeAdd(); if (ui.add && ui.add.t === a.t && ui.add.k === a.k) { ui.add = null; note(""); } else { ui.add = a; setTool("move", true); note("Click on the floor to place: " + (a.t === "sample" ? H.SAMPLES[a.k].name : DEV[a.t].name) + ". Esc to cancel."); } paintPalette(); }
	function openAdd() { var p = $("hx-addpop"), b = $("hx-addbtn"); if (!p) return; if (ui.showOpen) closeShow(); p.hidden = false; b.setAttribute("aria-expanded", "true"); }
	function closeAdd() { var p = $("hx-addpop"), b = $("hx-addbtn"); if (!p) return; p.hidden = true; if (b) b.setAttribute("aria-expanded", "false"); }
	$("hx-addbtn").onclick = function () { if ($("hx-addpop").hidden) openAdd(); else closeAdd(); };
	$("hx-addx").onclick = closeAdd;
	$("hx-delsel").onclick = function () { if (ui.sel) remove(ui.sel); };
	function fmtMass(m) { return m >= 1 ? (+m.toPrecision(3)) + " kg" : Math.round(m * 1000) + " g"; }
	function setTool(t, keepAdd) { ui.tool = t; if (!keepAdd) ui.add = null; ui.cableFrom = null; Array.prototype.forEach.call(document.querySelectorAll("#hx-tools button[data-tool]"), function (b) { b.setAttribute("aria-pressed", b.dataset.tool === t ? "true" : "false"); }); paintPalette(); if (t === "cable") note("Connect: click the device that feeds (e.g. the power supply), then the device it feeds: a cable with an arrow appears. Click the same pair again to remove it. Esc stops."); else if (t === "del") note("Click anything to remove it."); }
	Array.prototype.forEach.call(document.querySelectorAll("#hx-tools button[data-tool]"), function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });
	function note(t) { var n = $("hx-note"); if (n) n.textContent = t || ""; }

	/* ================= editor of the selected item ================= */
	function parseF(s) { var m = String(s).trim().replace(/,/g, "").match(/^([0-9.]+(?:e[+-]?\d+)?)\s*([kKmMgG]?)\s*(hz)?$/i); if (!m) return NaN; var v = parseFloat(m[1]), u = m[2]; return v * (u === "k" || u === "K" ? 1e3 : u === "M" ? 1e6 : u === "G" || u === "g" ? 1e9 : u === "m" ? 1e6 : 1); }
	function row(label, html, help) { return "<div class=\"hx-er\"><label>" + label + "</label><div class=\"hx-ev\">" + html + "</div>" + (help ? "<small>" + help + "</small>" : "") + "</div>"; }
	function num(key, d, min, max, step, unit) { return "<input type=\"number\" class=\"tu-input hx-num\" data-k=\"" + key + "\" value=\"" + (d[key] != null ? +(+d[key]).toPrecision(6) : "") + "\" min=\"" + min + "\" max=\"" + max + "\" step=\"" + step + "\"><span class=\"hx-u\">" + unit + "</span><input type=\"range\" class=\"hx-rng\" data-k=\"" + key + "\" min=\"" + min + "\" max=\"" + max + "\" step=\"" + step + "\" value=\"" + (+d[key] || 0) + "\" aria-label=\"" + key + "\">"; }
	function editor() {
		var box = $("hx-edit"), d = ui.sel ? byId(ui.sel) : null; if (!box) return;
		if (!d) { box.innerHTML = "<h3 class=\"hx-h\">Nothing selected</h3><p class=\"tu-note\">Click a device or sample on the floor to edit it. Add equipment and samples from the palettes above the floor; use <b>Cable</b> to connect a device to the one it feeds.</p>" + statsHtml(); return; }
		var T = DEV[d.t], h = "<h3 class=\"hx-h\">" + esc(d.t === "sample" ? "Sample" : T.name) + "</h3>";
		h += row("Label", "<input type=\"text\" class=\"tu-input\" data-k=\"label\" maxlength=\"60\" value=\"" + esc(d.label || "") + "\" placeholder=\"" + esc(d.t === "sample" ? "Sample" : T.name) + "\">");
		if (d.t === "sample") {
			h += row("Material", "<select class=\"tu-select\" data-k=\"mat\">" + Object.keys(MAT).map(function (k) { return "<option value=\"" + k + "\"" + (d.mat === k ? " selected" : "") + ">" + MAT[k].name + "</option>"; }).join("") + "</select>");
			h += row("Shape", "<select class=\"tu-select\" data-k=\"shape\">" + ["bar", "rod", "spoon", "can", "block", "bottle", "sheet", "boat", "jar", "disc"].map(function (k) { return "<option" + (d.shape === k ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select>");
			h += row("Mass", num("m", d, 0.001, 750, 0.001, "kg"));
			h += row("Turn", num("rot", d, -180, 180, 5, "°"));
			h += "<div class=\"hx-rep\">" + sampleReport(d) + "</div>";
		} else {
			if (T.kind !== "zone" && T.kind !== "area") h += row("Switched on", "<label class=\"hx-ck\"><input type=\"checkbox\" data-k=\"on\"" + (d.on !== false ? " checked" : "") + "> on</label>");
			var k = T.kind;
			if (k === "zone" || k === "area") { h += row("Width", num("w", d, 0.2, 30, 0.1, "m")) + row("Depth", num("h", d, 0.2, 30, 0.1, "m")); }
			if (/hv|rf|dc|pow|pulse|tank|mag|sig/.test(k) && d.t !== "mains") h += row(k === "sig" ? "Output" : "Voltage", num("kV", d, k === "sig" ? 0.001 : -500, k === "dc" ? 500 : k === "hv" ? 600 : k === "rf" ? 5 : 60, k === "sig" ? 0.001 : 0.5, "kV"), k === "dc" ? "Negative = negative polarity." : k === "hv" ? "Peak voltage on the top electrode." : "");
			if (/hv|rf|mag|sig|pulse/.test(k)) h += row(k === "pulse" ? "Ring frequency" : "Frequency", "<input type=\"text\" class=\"tu-input hx-num\" data-k=\"f\" data-f=\"1\" value=\"" + H.fmtF(+d.f).replace(" ", "") + "\" inputmode=\"decimal\"> <span class=\"hx-u\">e.g. 180k, 14M</span>", info[d.id] && info[d.id].notes.length ? esc(info[d.id].notes.join("; ")) : "");
			if (k === "tank") h += row("Capacitance", num("C", d, 0.001, 1000, 0.1, "nF")) + row("Inductance", num("L", d, 0.1, 5000, 1, "µH"), "Resonates at " + H.fmtF(H.tankF(+d.C, +d.L)) + ". Cable it to a Tesla coil to drive it.");
			if (k === "pulse") h += row("Capacitor", num("C", d, 0.001, 2, 0.001, "µF"), "Stores " + H.gapEnergy(+d.C, +d.kV).toFixed(1) + " J per shot.") + row("Fires every", num("gap", d, 1, 600, 1, "s"));
			if (d.t === "inductor") h += row("Current", num("I", d, 0, 200, 0.5, "A")) + row("Turns", num("N", d, 1, 2000, 1, "")) + row("Radius", num("R", d, 0.01, 1, 0.01, "m"));
			if (/hv|rf|dc|pow|pulse|tank|mag|sig/.test(k)) h += row(d.t === "mains" ? "Circuit capacity" : "Input power", num("P", d, 0, d.t === "mains" ? 3000 : 5000, 5, "W"));
			if (/hv|rf|mag|sig/.test(k)) h += row("Duty / pulsing", num("duty", d, 1, 100, 1, "%")) + row("Phase", num("phase", d, -180, 180, 5, "°"), "Matters for devices on the same frequency that are cabled together (locked).");
			if (d.t === "rf_tx" || d.t === "fieldshaper" || d.t === "camera" || d.t === "tesla_dumbbell") h += row("Points at", num("rot", d, -180, 180, 5, "°"), d.t === "camera" ? "Or drag the round handle at the end of its view cone; [ and ] turn it by 5°." : "Or drag the yellow handle; R turns it.");
			if (d.t === "camera") { if (d.fov == null) d.fov = H.camFov(d); h += row("Field of view", num("fov", d, 10, 120, 1, "°"), "Drag the square handle on the edge of its view; Alt + Up / Down. " + esc(seesText(d)) + (ui.opts.view ? "" : " Turn on Camera views to see it on the floor.")); }
			if (d.t === "camera") h += row("Immunity", num("imm", d, 1, 200, 1, "V/m"), "Consumer cameras: 3-10 V/m. Shielded industrial: 30 V/m or more.");
			h += "<div class=\"hx-rep\">" + deviceReport(d) + "</div>";
		}
		h += "<div class=\"hx-eb\"><button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-act=\"dup\">⧉ Duplicate</button><button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-act=\"del\">✕ Remove</button>" + (d.t !== "sample" && d.t !== "zone" && d.t !== "area" ? "<button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-act=\"cab\">⇢ Cable from here</button><button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-act=\"eq\">About this device</button>" : "") + "</div>";
		var cabs = st.cables.filter(function (c) { return c[0] === d.id || c[1] === d.id; });
		if (cabs.length) h += "<div class=\"hx-cabs\"><b>Cables</b>" + cabs.map(function (c, i) { var o = byId(c[0] === d.id ? c[1] : c[0]); return "<span>" + (c[0] === d.id ? "→ " : "← ") + esc(o ? nameOf(o) : "?") + " <button type=\"button\" data-uncab=\"" + esc(c[0]) + "|" + esc(c[1]) + "\" aria-label=\"Remove this cable\">✕</button></span>"; }).join("") + "</div>";
		box.innerHTML = h;
	}
	function statsHtml() {
		var pw = H.power(st), z = zone(), fa = z ? H.fieldAt(src, z.x, z.y) : null;
		return "<div class=\"hx-mini\">" + (z ? "<div><span>Active area</span><b>" + Math.round(fa.D * 100) + "% drive</b><small>" + H.fmtE(fa.E) + ", " + fa.groups.length + " frequencies, overlap " + fa.Neff.toFixed(1) + "</small></div>" : "") + "<div><span>Power drawn</span><b>" + Math.round(pw.W) + " W</b><small>" + pw.amps110.toFixed(1) + " A at 110 V" + (pw.outlets ? " · outlets give " + pw.outlets + " W" : "") + "</small></div></div>";
	}
	function deviceReport(d) {
		var T = DEV[d.t], fa = H.fieldAt(src, d.x, d.y), out = "<div class=\"hx-mini\">";
		if (T.kind === "inst" || T.kind === "op") {
			out += "<div><span>Field here</span><b>" + H.fmtE(fa.E) + "</b><small>" + H.fmtB(fa.B) + (fa.fDom ? " · strongest " + H.fmtF(fa.fDom) : "") + "</small></div>";
			if (d.t === "camera") out += "<div><span>Glitch risk</span><b>" + Math.round(H.emfRisk(fa.Eac, +d.imm || 10) * 100) + "%</b><small>per second, at " + (+d.imm || 10) + " V/m immunity</small></div>";
			if (d.t === "operator") { var lim = H.eRef(fa.fDom); out += "<div><span>vs occupational level</span><b>" + Math.round(fa.E / lim * 100) + "%</b><small>ICNIRP reference " + H.fmtE(lim) + " at " + H.fmtF(fa.fDom) + "</small></div>"; }
		} else if (T.kind !== "zone" && T.kind !== "area") {
			var s = src.filter(function (x) { return x.id === d.id && !x.image; })[0];
			if (s) out += "<div><span>Field at 1 m</span><b>" + H.fmtE(H.srcE(s, 1, 0) / (s.f > 0 ? Math.SQRT2 : 1)) + "</b><small>at 2 m " + H.fmtE(H.srcE(s, 2, 0) / (s.f > 0 ? Math.SQRT2 : 1)) + (s.m ? " · B at 1 m " + H.fmtB(H.srcB(s, 1) / Math.SQRT2) : "") + "</small></div>";
			if (info[d.id] && info[d.id].f > 0) out += "<div><span>Wavelength</span><b>" + fmtLen(299792458 / info[d.id].f) + "</b><small>the room is " + (st.room.w / (299792458 / info[d.id].f)).toPrecision(2) + " wavelengths wide</small></div>";
		} else if (d.t === "zone") { out += "<div><span>Drive in the middle</span><b>" + Math.round(fa.D * 100) + "%</b><small>" + H.fmtE(fa.E) + " · overlap " + fa.Neff.toFixed(1) + "</small></div>"; }
		return out + "</div>";
	}
	function fmtLen(m) { return m >= 1000 ? (m / 1000).toPrecision(3) + " km" : m >= 1 ? m.toPrecision(3) + " m" : (m * 100).toPrecision(3) + " cm"; }
	function sampleReport(d) {
		var fa = d.__fa || (d.__fa = fieldAtObj(d)), r = H.rates(d, fa, {neighbour: neighbour(d)}), w = H.warm(simT / 60, 20), cl = H.classicalLift(fa.E, d);
		var rows = H.EFFECTS.map(function (e) { var p = H.probWithin(r[e.id], 10); if (p < 0.0005) return ""; return "<li><i style=\"background:" + e.color + "\"></i><span>" + esc(e.name) + "</span><b>" + pct(p) + "</b><small>" + esc(H.magnitude(e.id, d, fa.D).txt) + "</small></li>"; }).join("");
		return "<div class=\"hx-mini\"><div><span>Drive here</span><b>" + Math.round(fa.D * 100) + "%</b><small>" + H.fmtE(fa.E) + " · " + fa.groups.length + " frequencies · overlap " + fa.Neff.toFixed(1) + "</small></div><div><span>Ordinary field pull</span><b>" + fmtPct(cl) + "</b><small>of its weight (ε₀E²/2 on its top face)</small></div></div>" +
			"<p class=\"tu-note\">Chance of each effect in the next 10 minutes once warmed up" + (w < 0.95 ? " (warming up: " + Math.round(w * 100) + "%)" : "") + ":</p><ul class=\"hx-eff\">" + (rows || "<li><span>Too little drive here for any effect.</span></li>") + "</ul>";
	}
	function pct(p) { return p >= 0.995 ? ">99%" : p >= 0.1 ? Math.round(p * 100) + "%" : p >= 0.001 ? (p * 100).toFixed(1) + "%" : "<0.1%"; }
	function fmtPct(x) { return x >= 0.01 ? (x * 100).toFixed(1) + "%" : x >= 1e-6 ? (x * 100).toExponential(1).replace("e", "×10^") + "%" : "≈0%"; }
	$("hx-edit").addEventListener("input", function (e) {
		var t = e.target, k = t.dataset.k, d = ui.sel ? byId(ui.sel) : null; if (!k || !d) return;
		var v;
		if (t.type === "checkbox") v = t.checked; else if (k === "label" || k === "mat" || k === "shape") v = t.value; else if (t.dataset.f) { v = parseF(t.value); if (!(v >= 0)) return; } else { v = parseFloat(t.value); if (!isFinite(v)) return; }
		d[k] = v; delete d.__fa;
		if (t.classList.contains("hx-rng")) { var nb = t.parentNode.querySelector(".hx-num[data-k=\"" + k + "\"]"); if (nb) nb.value = v; } else if (t.classList.contains("hx-num") && !t.dataset.f) { var rg = t.parentNode.querySelector(".hx-rng[data-k=\"" + k + "\"]"); if (rg) rg.value = v; }
		if (d.t === "sample" || d.t === "zone" || d.t === "area" || (d.t === "camera" && (k === "rot" || k === "fov"))) samplesChanged(); else { samplesChanged(); dirty(false); }
		clearTimeout(edT); edT = setTimeout(function () { if (inEditor()) refreshEditorReports(); else editor(); renderPanels(); }, 450);
	});
	var edT = 0;
	function inEditor() { var a = document.activeElement; return !!(a && a.closest && a.closest("#hx-edit")); }
	function refreshEditorReports() { var d = ui.sel ? byId(ui.sel) : null, rep = $("hx-edit").querySelector(".hx-rep"); if (!d || !rep) return; rep.innerHTML = d.t === "sample" ? sampleReport(d) : deviceReport(d); }
	$("hx-edit").addEventListener("change", function (e) { var k = e.target.dataset.k; if (k === "on" || k === "mat" || k === "shape") editor(); });
	$("hx-edit").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var d = ui.sel ? byId(ui.sel) : null; if (!d) return;
		if (b.dataset.act === "dup") duplicate(d.id); else if (b.dataset.act === "del") remove(d.id);
		else if (b.dataset.act === "cab") { setTool("cable"); ui.cableFrom = d.id; note("Now click the device that " + nameOf(d) + " feeds."); }
		else if (b.dataset.act === "eq") { setTab("eq"); var card = $("hx-eq-" + d.t); if (card) card.scrollIntoView({behavior: "smooth", block: "start"}); }
		else if (b.dataset.uncab) { var pr = b.dataset.uncab.split("|"); toggleCable(pr[0], pr[1]); editor(); }
	});

	/* ================= readouts ================= */
	function pointerReadout() {
		var p = $("hx-r-p"), e = $("hx-r-e"), es = $("hx-r-es"), dd = $("hx-r-d"), ds = $("hx-r-ds"), bt = $("hx-r-b"), bs = $("hx-r-bs");
		if (!hover || hover.x < 0 || hover.y < 0 || hover.x > st.room.w || hover.y > st.room.h) { p.textContent = "–"; e.textContent = "–"; es.textContent = "move over the floor"; dd.textContent = "–"; ds.textContent = ""; bt.textContent = "–"; bs.textContent = ""; return; }
		var fa = H.fieldAt(src, hover.x, hover.y); p.textContent = hover.x.toFixed(1) + ", " + hover.y.toFixed(1) + " m";
		e.textContent = H.fmtE(fa.E); es.textContent = "B " + H.fmtB(fa.B) + (fa.Es > 1 ? " · DC " + H.fmtE(fa.Es) : "");
		dd.textContent = Math.round(fa.D * 100) + "%"; ds.textContent = "overlap " + fa.Neff.toFixed(1) + " · " + fa.richness + " spectral parts" + (fa.coh !== 1 ? (fa.coh > 1.15 ? " · antinode" : fa.coh < 0.85 ? " · node" : "") : "");
		var beats = fa.beats.slice().sort(function (a, b) { return a.df - b.df; });
		if (beats.length) { var b0 = beats[0]; bt.textContent = b0.drift ? "drifting" : H.fmtF(b0.df); bs.textContent = beats.length + " pair" + (beats.length > 1 ? "s" : "") + ": " + beats.slice(0, 3).map(function (b) { return b.drift ? H.fmtF(b.f1) + " ×2 (free-running)" : H.fmtF(b.f1) + " vs " + H.fmtF(b.f2); }).join("; "); }
		else { bt.textContent = "none"; bs.textContent = "only one frequency here"; }
	}
	function updateReadouts() {
		$("hx-r-t").textContent = fmtT(simT); $("hx-r-ts").textContent = ui.run ? ui.speed + "× · warm-up " + Math.round(H.warm(simT / 60, 20) * 100) + "%" : "paused";
		$("hx-r-ev").textContent = events.length; var pw = H.power(st); $("hx-r-w").textContent = Math.round(pw.W) + " W"; $("hx-r-ws").textContent = pw.amps110.toFixed(1) + " A at 110 V" + (pw.W > 1650 ? " · over one 15 A circuit" : "");
		$("hx-r-ws").classList.toggle("hx-warn", pw.W > 1650);
	}

	/* ================= tables, charts, explainer ================= */
	function renderPanels() { renderTable(); drawCharts(); explain(); statsInEditor(); }
	function statsInEditor() { if (!ui.sel) editor(); }
	function renderTable() {
		var tb = $("hx-tbody"); if (!tb) return; var list = samples();
		$("hx-thead").innerHTML = "<tr><th>Sample</th><th>Drive</th>" + H.EFFECTS.map(function (e) { return "<th title=\"" + esc(e.name + ": " + e.note) + "\"><i style=\"background:" + e.color + "\"></i>" + esc(e.name.split(/[ /]/)[0]) + "</th>"; }).join("") + "<th title=\"Ordinary electrostatic pull as a share of the sample's weight\">Ordinary pull</th></tr>";
		if (!list.length) { tb.innerHTML = "<tr><td colspan=\"14\">No samples yet: add some from the Samples palette.</td></tr>"; return; }
		tb.innerHTML = list.map(function (d) {
			var fa = d.__fa || (d.__fa = fieldAtObj(d)), r = H.rates(d, fa, {neighbour: neighbour(d)});
			return "<tr data-id=\"" + esc(d.id) + "\"" + (ui.sel === d.id ? " class=\"hx-on\"" : "") + "><th><button type=\"button\" class=\"hx-link\" data-sel=\"" + esc(d.id) + "\">" + esc(nameOf(d)) + "</button><small>" + esc(MAT[d.mat] ? MAT[d.mat].name : "") + ", " + fmtMass(+d.m) + "</small></th><td><b>" + Math.round(fa.D * 100) + "%</b></td>" +
				H.EFFECTS.map(function (e) { var p = H.probWithin(r[e.id], 10); return "<td style=\"--p:" + Math.min(1, p * 2).toFixed(2) + ";--c:" + e.color + "\" class=\"hx-pc\">" + (p < 0.0005 ? "·" : pct(p)) + "</td>"; }).join("") + "<td>" + fmtPct(H.classicalLift(fa.E, d)) + "</td></tr>";
		}).join("");
	}
	$("hx-table").addEventListener("click", function (e) { var b = e.target.closest("[data-sel]"); if (b) { select(b.dataset.sel); renderTable(); } });

	function chartBase(c, w, h, dark) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "11px system-ui,sans-serif"; }
	function chartCanvas(id, h) { var cvs = $(id); if (!cvs) return null; var w = cvs.parentNode.clientWidth || 300; cvs.style.height = h + "px"; cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); return {c: cvs.getContext("2d"), w: w, h: h}; }
	function ink() { return isDark() ? {fg: "#e5e7eb", dim: "#9ca3af", grid: "rgba(255,255,255,0.08)"} : {fg: "#1f2937", dim: "#6b7280", grid: "rgba(0,0,0,0.08)"}; }
	function probePoint() { var d = ui.sel ? byId(ui.sel) : null; if (d && d.t === "sample") return {x: d.x, y: d.y, name: nameOf(d)}; var z = zone(); if (z) return {x: z.x, y: z.y, name: nameOf(z)}; var s0 = samples()[0]; if (s0) return {x: s0.x, y: s0.y, name: nameOf(s0)}; return {x: st.room.w / 2, y: st.room.h / 2, name: "the middle of the room"}; }
	function drawCharts() { if (ui.tab !== "lab") return; chartDistance(); chartSpectrum(); chartTimeline(); }
	function fitText(c, t, x, y, mw) { if (c.measureText(t).width > mw) { while (t.length > 4 && c.measureText(t + "…").width > mw) t = t.slice(0, -1); t += "…"; } c.fillText(t, x, y); }
	function chartDistance() {
		var k = chartCanvas("hx-ch1", 220); if (!k) return; var c = k.c, w = k.w, h = k.h, I = ink(); chartBase(c, w, h);
		var d = ui.sel ? byId(ui.sel) : null; if (!d || !DEV[d.t] || !src.some(function (s) { return s.id === d.id; })) d = st.items.filter(function (x) { return /^tesla/.test(x.t) && x.on !== false; })[0] || st.items.filter(function (x) { return src.some(function (s) { return s.id === x.id; }); })[0];
		if (!d) { c.fillStyle = I.dim; c.fillText("Add a field source to see this chart.", 10, 20); return; }
		var pp = probePoint(), ang = Math.atan2(pp.y - d.y, pp.x - d.x); if (Math.hypot(pp.y - d.y, pp.x - d.x) < 0.3) ang = 0;
		var L = Math.max(2, Math.min(12, Math.hypot(st.room.w, st.room.h) * 0.6)), ml = 46, mr = 36, mt = 24, mb = 26, pw = w - ml - mr, ph = h - mt - mb, N = 140;
		var lo = 1, hi = 6; function Y(v) { return mt + ph * (1 - (Math.log10(Math.max(10, v)) - lo) / (hi - lo)); } function X(r) { return ml + pw * r / L; }
		c.strokeStyle = I.grid; c.fillStyle = I.dim; c.textAlign = "right"; for (var e = lo; e <= hi; e++) { var y = Y(Math.pow(10, e)); c.beginPath(); c.moveTo(ml, y); c.lineTo(ml + pw, y); c.stroke(); c.fillText(e >= 3 ? Math.pow(10, e - 3) + "k" : Math.pow(10, e) + "", ml - 4, y + 4); }
		c.textAlign = "center"; for (var m = 0; m <= L; m += L > 6 ? 2 : 1) c.fillText(m + " m", X(m), h - 8);
		var ids = []; src.forEach(function (s) { if (!s.image && ids.indexOf(s.id) < 0) ids.push(s.id); });
		ids.forEach(function (id) {
			var dd = byId(id), col = DEV[dd.t] ? DEV[dd.t].color : "#999"; c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 1; c.beginPath();
			for (var i = 0; i <= N; i++) { var r = L * i / N, x = d.x + Math.cos(ang) * r, y2 = d.y + Math.sin(ang) * r, v = 0; src.forEach(function (s) { if (s.id === id && !s.image) { var dx = x - s.x, dy = y2 - s.y; v += H.srcE(s, Math.hypot(dx, dy), Math.atan2(dy, dx) - s.rot) / (s.f > 0 ? Math.SQRT2 : 1); } }); if (i) c.lineTo(X(r), Y(v)); else c.moveTo(X(r), Y(v)); }
			c.stroke(); c.globalAlpha = 1;
		});
		c.strokeStyle = I.fg; c.lineWidth = 2.2; c.beginPath(); var dl = [];
		for (var i2 = 0; i2 <= N; i2++) { var r2 = L * i2 / N, fa = H.fieldAt(src, d.x + Math.cos(ang) * r2, d.y + Math.sin(ang) * r2); dl.push(fa.D); if (i2) c.lineTo(X(r2), Y(fa.E)); else c.moveTo(X(r2), Y(fa.E)); }
		c.stroke(); c.strokeStyle = "#eab308"; c.setLineDash([5, 4]); c.lineWidth = 1.8; c.beginPath(); dl.forEach(function (v, i) { var x = X(L * i / N), y = mt + ph * (1 - v); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); c.setLineDash([]);
		c.fillStyle = "#eab308"; c.textAlign = "right"; c.fillText("dashed: drive 0-100%", ml + pw - 4, mt + 12); c.fillStyle = I.fg; c.textAlign = "left"; fitText(c, "|E| (V/m) from " + nameOf(d) + " toward " + pp.name + ": thick = total, thin = each source", ml - 40, mt - 8, w - ml);
		c.save(); c.translate(w - 8, mt + ph / 2); c.rotate(Math.PI / 2); c.textAlign = "center"; c.fillStyle = "#eab308"; c.fillText("drive", 0, 0); c.restore();
	}
	function chartSpectrum() {
		var k = chartCanvas("hx-ch2", 200); if (!k) return; var c = k.c, w = k.w, h = k.h, I = ink(); chartBase(c, w, h);
		var pp = probePoint(), lines = H.spectrum(src, pp.x, pp.y), ml = 46, mr = 12, mt = 22, mb = 26, pw = w - ml - mr - 30, ph = h - mt - mb, f0 = 1, f1 = 9;
		function X(f) { return ml + 30 + pw * (Math.log10(Math.max(10, f)) - f0) / (f1 - f0); } function Y(v) { return mt + ph * (1 - (Math.log10(Math.max(1, v)) - 0) / 6); }
		c.strokeStyle = I.grid; c.fillStyle = I.dim; c.textAlign = "center";
		["10 Hz", "100", "1 kHz", "10k", "100k", "1 MHz", "10M", "100M", "1 GHz"].forEach(function (t, i) { var x = X(Math.pow(10, i + 1)); c.beginPath(); c.moveTo(x, mt); c.lineTo(x, mt + ph); c.stroke(); if (pw > 420 || i % 2 === 0) c.fillText(t, x, h - 8); });
		c.textAlign = "right"; for (var e = 0; e <= 6; e += 2) c.fillText(e >= 3 ? Math.pow(10, e - 3) + "k" : Math.pow(10, e) + "", ml - 4, Y(Math.pow(10, e)) + 4);
		c.fillText("DC", ml + 14, h - 8);
		lines.forEach(function (l) {
			var dd = byId(l.id), col = dd && DEV[dd.t] ? DEV[dd.t].color : "#999";
			if (l.kind === "pulse") { c.fillStyle = col; c.globalAlpha = 0.25; c.beginPath(); c.moveTo(X(l.f / 30), Y(1)); for (var i = 0; i <= 40; i++) { var ff = l.f / 30 * Math.pow(900, i / 40), a = l.A * Math.exp(-Math.pow(Math.log(ff / l.f), 2) / 2.4); c.lineTo(X(ff), Y(a)); } c.lineTo(X(l.f * 30), Y(1)); c.fill(); c.globalAlpha = 1; return; }
			var x = l.kind === "dc" ? ml + 16 : X(l.f); c.strokeStyle = col; c.lineWidth = l.kind === "line" || l.kind === "dc" ? 3 : 1.5; c.globalAlpha = l.kind === "harm" ? 0.6 : 1; c.beginPath(); c.moveTo(x, Y(1)); c.lineTo(x, Y(l.A)); c.stroke(); c.globalAlpha = 1;
		});
		c.fillStyle = I.fg; c.textAlign = "left"; fitText(c, "Spectrum at " + pp.name + " (V/m rms, with harmonics, sidebands and spark pulses)", 6, mt - 8, w - 12);
	}
	function chartTimeline() {
		var k = chartCanvas("hx-ch3", 160); if (!k) return; var c = k.c, w = k.w, h = k.h, I = ink(); chartBase(c, w, h);
		var list = samples(), ml = 110, mr = 10, mt = 20, mb = 22, pw = w - ml - mr, ph = h - mt - mb, T = Math.max(600, simT * 1.05);
		c.fillStyle = I.fg; c.textAlign = "left"; c.fillText("Events over experiment time (" + events.length + " so far)", 6, 13);
		c.fillStyle = I.dim; c.textAlign = "center"; for (var i = 0; i <= 4; i++) { var t = T * i / 4, x = ml + pw * i / 4; c.strokeStyle = I.grid; c.beginPath(); c.moveTo(x, mt); c.lineTo(x, mt + ph); c.stroke(); c.fillText(fmtT(t), x, h - 6); }
		var n = Math.max(1, list.length); c.textAlign = "right";
		list.forEach(function (d, j) { var y = mt + ph * (j + 0.5) / n; c.fillStyle = I.dim; c.fillText(nameOf(d).slice(0, 16), ml - 6, y + 4); });
		var wx = ml + pw * Math.min(1, 20 * 60 / T); c.fillStyle = isDark() ? "rgba(250,204,21,0.06)" : "rgba(234,179,8,0.08)"; c.fillRect(ml, mt, wx - ml, ph);
		events.forEach(function (ev) { var j = list.findIndex(function (d) { return d.id === ev.id; }); if (j < 0) return; var x = ml + pw * ev.t / T, y = mt + ph * (j + 0.5) / n; c.fillStyle = H.EFF[ev.e].color; c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); });
		c.strokeStyle = "#ef4444"; c.beginPath(); var xn = ml + pw * simT / T; c.moveTo(xn, mt); c.lineTo(xn, mt + ph); c.stroke();
	}
	function explain() {
		var box = $("hx-explain-b"); if (!box) return; var on = st.items.filter(function (d) { return d.on !== false && DEV[d.t]; }), z = zone(), out = [];
		var coils = on.filter(function (d) { return /^tesla/.test(d.t); }), vdg = on.filter(function (d) { return d.t === "vdg"; }), gaps = on.filter(function (d) { return d.t === "sparkgap"; }), rf = on.filter(function (d) { return d.t === "rf_tx"; }), sig = on.filter(function (d) { return d.t === "siggen"; });
		out.push("<p><b>" + coils.length + " Tesla coil" + (coils.length === 1 ? "" : "s") + "</b>" + (coils.length ? " (" + coils.map(function (d) { return esc(nameOf(d)) + " at " + H.fmtF(info[d.id].f) + (info[d.id].tune < 0.9 ? ", " + Math.round(info[d.id].tune * 100) + "% tuned" : ""); }).join(", ") + ")" : "") + ", <b>" + vdg.length + " Van de Graaff</b>, " + gaps.length + " spark gap" + (gaps.length === 1 ? "" : "s") + ", " + rf.length + " RF transmitter" + (rf.length === 1 ? "" : "s") + " and " + sig.length + " signal generator" + (sig.length === 1 ? "" : "s") + ".</p>");
		var chains = st.cables.map(function (c) { var a = byId(c[0]), b = byId(c[1]); return a && b ? esc(nameOf(a)) + " → " + esc(nameOf(b)) : ""; }).filter(Boolean);
		if (chains.length) out.push("<p><b>Power and coupling:</b> " + chains.join("; ") + ". Devices cabled together share their phase, so on the same frequency their fields interfere (fixed nodes and antinodes); free-running ones drift.</p>");
		if (z) {
			var fa = H.fieldAt(src, z.x, z.y); out.push("<p><b>Active area:</b> " + H.fmtE(fa.E) + " (DC part " + H.fmtE(fa.Es) + "), " + fa.groups.length + " frequency group" + (fa.groups.length === 1 ? "" : "s") + ", overlap " + fa.Neff.toFixed(1) + " sources, drive <b>" + Math.round(fa.D * 100) + "%</b>." + (fa.beats.length ? " Beats: " + fa.beats.slice(0, 4).map(function (b) { return b.drift ? "free-running pair at " + H.fmtF(b.f1) : H.fmtF(b.df) + " (" + H.fmtF(b.f1) + " vs " + H.fmtF(b.f2) + ")"; }).join(", ") + "." : "") + "</p>");
			var tips = [];
			if (!vdg.length) tips.push("Add a Van de Graaff near the active area: the first effects appeared when John added one to two Tesla coils, and the model rewards a DC bias under the AC fields.");
			if (coils.length < 2) tips.push("Two or more Tesla coils whose fields cross in the active area raise the overlap.");
			if (fa.Neff < 2.2 && on.length > 2) tips.push("One source dominates the active area: move the others closer, or turn the field shaper toward it, so the fields meet with similar strength.");
			if (fa.coh < 0.8) tips.push("The active area sits on a node of locked sources: change one coil's phase by 180° or move it.");
			if (!gaps.length) tips.push("A spark gap firing every 30-40 s adds the pulses seen in the LADS circuit; events cluster after a firing in this model.");
			if (fa.D > 0.85) tips.push("The drive is near its maximum here: further gains come from waiting (the reports describe effects taking hours to days to appear in the early years).");
			coils.forEach(function (d) { if (info[d.id].tune < 0.6) tips.push(esc(nameOf(d)) + " is badly tuned to its tank (" + Math.round(info[d.id].tune * 100) + "%): set the tank's L and C so it resonates at " + H.fmtF(info[d.id].f) + "."); });
			var pw = H.power(st); if (pw.W > 1650) tips.push("The gear draws " + Math.round(pw.W) + " W: more than one 15 A circuit at 110 V (1,650 W). Hutchison's affidavit gives 75 W to 4 kW for his setups.");
			var ops = on.filter(function (d) { return d.t === "operator"; }); ops.forEach(function (d) { var f2 = H.fieldAt(src, d.x, d.y), lim = H.eRef(f2.fDom); if (f2.E > lim * 0.5) tips.push(esc(nameOf(d)) + " stands in " + H.fmtE(f2.E) + ", " + Math.round(f2.E / lim * 100) + "% of the occupational reference level: move the control position back."); });
			var cams = on.filter(function (d) { return d.t === "camera"; }); cams.forEach(function (d) { var f3 = H.fieldAt(src, d.x, d.y), rk = H.emfRisk(f3.Eac, +d.imm || 10); if (rk > 0.3) tips.push(esc(nameOf(d)) + " will glitch often (" + H.fmtE(f3.E) + "): move it back, shield it, or use a camera rated for stronger fields. Glitches are also part of the record: the 1988-89 footage is full of them."); });
			if (tips.length) out.push("<p><b>Suggestions for this layout:</b></p><ul>" + tips.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>");
		} else out.push("<p>Add an <b>Active (target) area</b> from the palette to get a report on the place where the fields should cross.</p>");
		var tot = 0; samples().forEach(function (d) { var fa2 = d.__fa || (d.__fa = fieldAtObj(d)), r = H.rates(d, fa2, {neighbour: neighbour(d)}); Object.keys(r).forEach(function (k2) { tot += r[k2]; }); });
		out.push("<p><b>Expected rate:</b> about " + (tot >= 0.95 ? tot.toFixed(1) + " events an hour" : tot > 0.02 ? "one event every " + Math.round(60 / tot) + " minutes" : "almost none") + " across all samples once warmed up. For comparison, Hutchison's own rate improved from hours apart (1981) to about every 30 minutes (1989), and George Hathaway's 1993 plan aimed for more than one an hour.</p>");
		box.innerHTML = out.join("");
	}

	/* ================= schematic view ================= */
	function drawSchematic() {
		var cvs = $("hx-sch"); if (!cvs) return; var L = H.schematic(st), w = cvs.parentNode.clientWidth || 800, cols = Math.max(1, L.cols), bw = Math.max(110, Math.min(170, (w - 40) / Math.max(cols, 1) - 30)), bh = 86, gx = (w - 40 - cols * bw) / Math.max(1, cols - 1 || 1), rowsMain = L.rows, gy = 30;
		var freeN = L.nodes.filter(function (n) { return n.col < 0; }).length, perRow = Math.max(1, Math.floor((w - 20) / (bw + 16))), freeRows = Math.ceil(freeN / perRow);
		var h = 40 + (L.cols ? rowsMain * (bh + gy) : 0) + (freeN ? 40 + freeRows * (bh + 16) : 0) + 20; cvs.style.height = h + "px"; cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
		var c = cvs.getContext("2d"), I = ink(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "12px system-ui,sans-serif";
		var pos = {}; if (cols === 1) gx = 0;
		L.nodes.forEach(function (n) { if (n.col >= 0) pos[n.id] = {x: 20 + n.col * (bw + (cols > 1 ? gx : 0)) + (cols === 1 ? (w - 40 - bw) / 2 : 0), y: 30 + n.row * (bh + gy)}; });
		var fi = 0; L.nodes.forEach(function (n) { if (n.col < 0) { pos[n.id] = {x: 10 + (fi % perRow) * (bw + 16), y: 40 + (L.cols ? rowsMain * (bh + gy) : 0) + 30 + Math.floor(fi / perRow) * (bh + 16)}; fi++; } });
		c.fillStyle = I.dim; c.textAlign = "left"; if (L.cols) c.fillText("Power and signal flow, left to right (from the cables you drew)", 20, 18);
		if (freeN) c.fillText("Field-only devices (no cables): they act on the target through the air", 10, 40 + (L.cols ? rowsMain * (bh + gy) : 0) + 18);
		// wires
		L.cables.forEach(function (cb) {
			var a = pos[cb[0]], b = pos[cb[1]]; if (!a || !b) return; var ad = byId(cb[0]), sig = ad && ad.t === "siggen";
			var x1 = a.x + bw, y1 = a.y + bh / 2, x2 = b.x, y2 = b.y + bh / 2, mx = x2 > x1 ? (x1 + x2) / 2 : x1 + 14;
			c.strokeStyle = sig ? "#3b82f6" : "#dc2626"; c.lineWidth = 2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(mx, y1); c.lineTo(mx, y2); c.lineTo(x2, y2); c.stroke();
			c.fillStyle = c.strokeStyle; c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 8, y2 - 4); c.lineTo(x2 - 8, y2 + 4); c.closePath(); c.fill();
		});
		L.nodes.forEach(function (n) {
			var p = pos[n.id], d = n.d, T = DEV[d.t]; c.fillStyle = isDark() ? "#111827" : "#f8fafc"; c.strokeStyle = d.on === false ? "#9ca3af" : T.color; c.lineWidth = 2; rr(c, p.x, p.y, bw, bh, 8); c.fill(); c.stroke();
			sym(c, d.t, p.x + 26, p.y + bh / 2, 40, isDark() ? T.color : shade(T.color));
			c.fillStyle = I.fg; c.textAlign = "left"; c.font = "600 12px system-ui,sans-serif"; wrapText(c, nameOf(d), p.x + 52, p.y + 18, bw - 58, 14, 2);
			c.font = "11px system-ui,sans-serif"; c.fillStyle = I.dim; var sp = specLine(d); wrapText(c, sp, p.x + 52, p.y + 50, bw - 58, 13, 3);
			if (d.on === false) { c.fillStyle = "#ef4444"; c.fillText("off", p.x + bw - 22, p.y + 14); }
		});
		if (!L.nodes.length) { c.fillStyle = I.dim; c.fillText("Nothing to draw yet.", 20, 30); }
	}
	function shade(hex) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return "rgb(" + Math.round(r * 0.6) + "," + Math.round(g * 0.6) + "," + Math.round(b * 0.6) + ")"; }
	function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
	function wrapText(c, t, x, y, mw, lh, maxL) { var words = String(t).split(" "), line = "", n = 0; for (var i = 0; i < words.length; i++) { var test = line ? line + " " + words[i] : words[i]; if (c.measureText(test).width > mw && line) { c.fillText(line, x, y); y += lh; line = words[i]; if (++n >= maxL - 1) { var rest = words.slice(i).join(" "); while (c.measureText(rest + "…").width > mw && rest.length > 1) rest = rest.slice(0, -1); c.fillText(rest + (rest !== words.slice(i).join(" ") ? "…" : ""), x, y); return; } } else line = test; } if (line) c.fillText(line, x, y); }
	function specLine(d) {
		var T = DEV[d.t], r = info[d.id] || {}, k = T.kind, parts2 = [];
		if (k === "tank") parts2.push(+d.C + " nF, " + +d.L + " µH → " + H.fmtF(r.f));
		else if (k === "pulse") parts2.push(+d.kV + " kV, " + +d.C + " µF, every " + +d.gap + " s");
		else if (d.t === "mains") parts2.push((+d.P || 1650) + " W");
		else if (/hv|rf|dc|pow|mag|sig/.test(k)) { if (+d.kV) parts2.push((Math.abs(+d.kV) >= 1 ? +d.kV + " kV" : Math.round(+d.kV * 1000) + " V")); if (r.f > 0) parts2.push(H.fmtF(r.f)); else if (k === "dc" || k === "pow") parts2.push("DC"); if (+d.P) parts2.push(+d.P + " W"); if (r.tune != null && r.tune < 0.95) parts2.push(Math.round(r.tune * 100) + "% tuned"); }
		else if (d.t === "camera") parts2.push("immunity " + (+d.imm || 10) + " V/m");
		return parts2.join(" · ");
	}

	/* ================= equipment view ================= */
	function buildEquipment() {
		var box = $("hx-eqgrid"); if (!box || box.__built) return; box.__built = 1;
		H.ORDER.forEach(function (t) {
			var T = DEV[t], card = document.createElement("article"); card.className = "tu-card hx-eqc"; card.id = "hx-eq-" + t;
			var cvs = document.createElement("canvas"); cvs.className = "hx-eqpic"; cvs.setAttribute("role", "img"); cvs.setAttribute("aria-label", "Drawing of a " + T.name);
			card.appendChild(cvs);
			var d = T.def, specs = [];
			if (d.kV) specs.push((Math.abs(d.kV) >= 1 ? d.kV + " kV" : Math.round(d.kV * 1000) + " V")); if (d.f) specs.push(H.fmtF(d.f)); if (d.P) specs.push(d.P + " W"); if (d.C) specs.push(t === "tank" ? d.C + " nF, " + d.L + " µH" : d.C + " µF"); if (d.gap) specs.push("every " + d.gap + " s");
			card.insertAdjacentHTML("beforeend", "<h3>" + esc(T.name) + "</h3>" + (specs.length ? "<p class=\"hx-eqs\">Default in the simulator: " + esc(specs.join(" · ")) + "</p>" : "") + "<p>" + esc(T.spec) + "</p><p><b>What Hutchison used.</b> " + esc(T.used) + "</p><p><b>Planning a replication.</b> " + esc(T.plan) + "</p><button type=\"button\" class=\"tu-btn tu-btn--ghost\" data-addeq=\"" + t + "\">+ Add to the lab floor</button>");
			box.appendChild(card);
		});
		box.addEventListener("click", function (e) { var b = e.target.closest("[data-addeq]"); if (!b) return; setTab("lab"); armAdd({t: b.dataset.addeq}); stage.scrollIntoView({behavior: "smooth", block: "center"}); });
		var mt = $("hx-mattable"); if (mt) mt.innerHTML = "<thead><tr><th>Material</th><th>Density</th>" + H.EFFECTS.map(function (e) { return "<th title=\"" + esc(e.name) + "\">" + esc(e.name.split(/[ /]/)[0]) + "</th>"; }).join("") + "</tr></thead><tbody>" + Object.keys(MAT).map(function (k) { var M = MAT[k]; return "<tr><th>" + esc(M.name) + "</th><td>" + M.rho + " kg/m³</td>" + H.EFFECTS.map(function (e) { var v = e.id === "bub" ? (M.liquid ? 1 : 0) : e.id === "brt" ? (M.liquid ? 1 : 0) : (M.sus[e.id] || 0); return "<td class=\"hx-pc\" style=\"--p:" + v + ";--c:" + e.color + "\">" + (v ? v.toFixed(2) : "·") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody>";
		var et = $("hx-efftable"); if (et) et.innerHTML = "<thead><tr><th>Effect</th><th>Events / hour at full drive (100 g)</th><th>Mass dependence</th><th>As reported</th></tr></thead><tbody>" + H.EFFECTS.map(function (e) { return "<tr><th><i class=\"hx-dot\" style=\"background:" + e.color + "\"></i> " + esc(e.name) + "</th><td>" + e.base + "</td><td>" + (e.mass ? "halves near " + (e.mass >= 1000 ? e.mass / 1000 + " kg" : e.mass + " g") : "none") + "</td><td>" + esc(e.note) + "</td></tr>"; }).join("") + "</tbody>";
		paintEquipment();
	}
	function paintEquipment() { Array.prototype.forEach.call(document.querySelectorAll("#hx .hx-eqpic"), function (cvs) { var t = cvs.parentNode.id.replace("hx-eq-", ""), w = cvs.parentNode.clientWidth - 2 || 260, h = 120; cvs.style.height = h + "px"; cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); var c = cvs.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = "#0b0f17"; c.fillRect(0, 0, w, h); sym(c, t, w / 2, h / 2, 96, DEV[t].color); }); }

	/* ================= tabs, controls, share ================= */
	function setTab(t) {
		ui.tab = t; Array.prototype.forEach.call(document.querySelectorAll("#hx .hx-tabs [role=tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
		Array.prototype.forEach.call(document.querySelectorAll("#hx section[data-panel]"), function (s) { s.hidden = s.dataset.panel !== t; });
		if (t === "lab") { layout(); renderPanels(); } else if (t === "sch") drawSchematic(); else if (t === "eq") { buildEquipment(); paintEquipment(); }
	}
	Array.prototype.forEach.call(document.querySelectorAll("#hx .hx-tabs [role=tab]"), function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
	function renderAll() { layout(); setRoomInputs(); editor(); renderPanels(); if (ui.tab === "sch") drawSchematic(); paintPreset(); var sel = $("hx-map"); if (sel) sel.value = ui.map; paintLegend(); }
	function paintPreset() { Array.prototype.forEach.call(document.querySelectorAll("#hx-pre button"), function (b) { b.setAttribute("aria-pressed", b.dataset.p === st.preset ? "true" : "false"); }); }
	(function () { var box = $("hx-pre"); Object.keys(H.PRESETS).forEach(function (k) { var b = document.createElement("button"); b.type = "button"; b.dataset.p = k; b.textContent = H.PRESETS[k].name; b.onclick = function () { loadPreset(k); }; box.appendChild(b); }); var cl = document.createElement("button"); cl.type = "button"; cl.textContent = "Empty room"; cl.onclick = function () { st = {room: {w: st.room.w, h: st.room.h, refl: st.room.refl}, items: [], cables: [], preset: ""}; resetRun(); ui.sel = null; dirty(true); renderAll(); note("An empty room: add equipment from the palette."); }; box.appendChild(cl); })();
	function paintLegend() { var m = MAPS[ui.map], lg = $("hx-leg"); if (!lg) return; var g = STOPS[m.map].map(function (s) { return "rgb(" + s[1] + "," + s[2] + "," + s[3] + ") " + Math.round(s[0] * 100) + "%"; }).join(","); lg.innerHTML = "<b>" + esc(m.name) + "</b><span class=\"hx-lgbar\" style=\"background:linear-gradient(90deg," + g + ")\"></span><span class=\"hx-lgt\"><i>" + esc(m.leg[0]) + "</i><i>" + esc(m.leg[1]) + "</i><i>" + esc(m.leg[2]) + "</i></span>" + (ui.opts.cab ? cablesUsed().map(function (k) { var T = CABT[k]; return "<span class=\"hx-lgc\"><svg width=\"26\" height=\"10\" aria-hidden=\"true\"><line x1=\"2\" y1=\"5\" x2=\"24\" y2=\"5\" stroke=\"#03050a\" stroke-width=\"" + (T.w + 4) + "\" stroke-linecap=\"round\"/><line x1=\"2\" y1=\"5\" x2=\"24\" y2=\"5\" stroke=\"" + T.col + "\" stroke-width=\"" + T.w + "\" stroke-linecap=\"round\"" + (T.dash ? " stroke-dasharray=\"" + T.dash.join(",") + "\"" : "") + "/></svg>" + esc(T.name) + " cable</span>"; }).join("") : ""); }
	$("hx-map").onchange = function () { ui.map = this.value; mapDirty = true; paintLegend(); saveSoon(); };
	["cab", "lab", "cam", "ring", "view"].forEach(function (k) { var el = $("hx-o-" + k); if (!el) return; el.checked = ui.opts[k]; el.onchange = function () { if (k === "cam") { ui.show.rec = el.checked; paintShow(); layout(); saveSoon(); return; } ui.opts[k] = el.checked; if (k === "view") { paintToggles(); editor(); } if (k === "lab" || k === "cab") { paintToggles(); paintLegend(); } saveSoon(); }; });
	function paintToggles() { $("hx-views").setAttribute("aria-pressed", ui.opts.view ? "true" : "false"); $("hx-labs").setAttribute("aria-pressed", ui.opts.lab ? "true" : "false"); var v = $("hx-o-view"); if (v) v.checked = ui.opts.view; var l = $("hx-o-lab"); if (l) l.checked = ui.opts.lab; var cb = $("hx-o-cab"); if (cb) cb.checked = ui.opts.cab; var rg = $("hx-o-ring"); if (rg) rg.checked = ui.opts.ring; }
	$("hx-views").onclick = function () { ui.opts.view = !ui.opts.view; paintToggles(); editor(); saveSoon(); };
	function toggleLabels() { ui.opts.lab = !ui.opts.lab; paintToggles(); note(ui.opts.lab ? "Labels on (L)." : "Labels off (L): only the selected item keeps its name."); saveSoon(); }
	$("hx-labs").onclick = toggleLabels;
	/* the Show menu: each section of the box can be shown or hidden on its own (inline, in Fill window and full screen alike); the floor grows into the freed space */
	var SHOWS = [["plan", "Lab floor (the plan)"], ["leg", "Legend"], ["tb", "Toolbar"], ["rec", "Camera recording"], ["tl", "Event timeline"], ["ro", "Readouts (pointer, field, drive...)"]];
	(function () {
		var box = $("hx-showlist"); if (!box) return;
		SHOWS.forEach(function (q) { var lb = document.createElement("label"), ip = document.createElement("input"); ip.type = "checkbox"; ip.dataset.s = q[0]; ip.onchange = function () { setShow(q[0], ip.checked); }; lb.className = "hx-ck"; lb.appendChild(ip); lb.appendChild(document.createTextNode(" " + q[1])); box.appendChild(lb); });
		var all = $("hx-showall"); if (all) all.onclick = function () { SHOWS.forEach(function (q) { ui.show[q[0]] = true; }); paintShow(); layout(); saveSoon(); };
		var fo = $("hx-showfloor"); if (fo) fo.onclick = function () { ui.show.rec = ui.show.tl = ui.show.ro = false; ui.show.plan = true; paintShow(); layout(); saveSoon(); };
	})();
	function setShow(k, on) {
		ui.show[k] = on;
		if (!ui.show.plan && !ui.show.rec && !ui.show.tl && !ui.show.ro) { ui.show.plan = true; note("Something has to show: the floor is back."); }
		if (k === "tb" && !on) note("");
		paintShow(); layout(); saveSoon();
	}
	function paintShow() {
		Array.prototype.forEach.call(document.querySelectorAll("#hx-showlist input"), function (ip) { ip.checked = !!ui.show[ip.dataset.s]; });
		var hidden = SHOWS.filter(function (q) { return !ui.show[q[0]]; }).length, b = $("hx-show"); if (b) b.textContent = "▤ Show" + (hidden ? " (" + hidden + " hidden)" : "") + " ▾";
		var o = $("hx-o-cam"); if (o) o.checked = ui.show.rec;
	}
	function openShow() { var m = $("hx-showpop"); if (!m) return; closeAdd(); m.hidden = false; ui.showOpen = true; $("hx-show").setAttribute("aria-expanded", "true"); var pl = $("hx-showpill"); if (pl) pl.setAttribute("aria-expanded", "true"); layout(); var f = m.querySelector("input"); if (f) f.focus({preventScroll: true}); }
	function closeShow() { var m = $("hx-showpop"); if (!m || m.hidden) return; m.hidden = true; ui.showOpen = false; $("hx-show").setAttribute("aria-expanded", "false"); var pl = $("hx-showpill"); if (pl) pl.setAttribute("aria-expanded", "false"); layout(); }
	$("hx-show").onclick = function () { if (ui.showOpen) closeShow(); else openShow(); };
	$("hx-showpill").onclick = function () { if (ui.showOpen) closeShow(); else openShow(); };
	$("hx-showx").onclick = closeShow;
	$("hx-showpop").addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); closeShow(); var b = ui.show.tb ? $("hx-show") : $("hx-showpill"); if (b) b.focus(); } });
	document.addEventListener("pointerdown", function (e) { if (ui.showOpen && !e.target.closest("#hx-showpop, #hx-show, #hx-showpill")) closeShow(); });
	paintShow();
	$("hx-zin").onclick = function () { zoomAt(1.25); }; $("hx-zout").onclick = function () { zoomAt(0.8); }; $("hx-zfit").onclick = zoomFit;
	$("hx-tl").addEventListener("click", function (e) { var b = this.getBoundingClientRect(), ev = evAtTL(e.clientX - b.left); if (ev) doReplay(ev); });
	$("hx-tl").addEventListener("mousemove", function (e) { var b = this.getBoundingClientRect(), ev = evAtTL(e.clientX - b.left); this.title = ev ? fmtT(ev.t) + " " + (H.EFF[ev.e] ? H.EFF[ev.e].name : "") + ": " + ev.txt + " (click to replay)" : ""; });
	paintToggles();
	function setRoomInputs() { $("hx-rw").value = st.room.w; $("hx-rh").value = st.room.h; $("hx-rr").value = st.room.refl || 0; $("hx-rr-v").textContent = Math.round((st.room.refl || 0) * 100) + "%"; }
	$("hx-rw").onchange = $("hx-rh").onchange = function () { var w = parseFloat($("hx-rw").value), h = parseFloat($("hx-rh").value); if (w >= 2 && w <= 60) st.room.w = w; if (h >= 2 && h <= 60) st.room.h = h; st.items.forEach(function (d) { d.x = H.clamp(d.x, 0, st.room.w); d.y = H.clamp(d.y, 0, st.room.h); }); samplesChanged(); dirty(true); layout(); renderPanels(); };
	$("hx-rr").oninput = function () { st.room.refl = parseFloat(this.value) || 0; $("hx-rr-v").textContent = Math.round(st.room.refl * 100) + "%"; samplesChanged(); dirty(false); clearTimeout(edT); edT = setTimeout(renderPanels, 300); };
	function setRun(r) { ui.run = r; var b = $("hx-play"); b.textContent = r ? "❚❚ Pause" : "▶ Run"; b.setAttribute("aria-pressed", r ? "true" : "false"); updateReadouts(); }
	$("hx-play").onclick = function () { setRun(!ui.run); };
	$("hx-restart").onclick = function () { resetRun(); var l = $("hx-log"); if (l) l.innerHTML = ""; samplesChanged(); renderPanels(); updateReadouts(); note("Experiment restarted: the warm-up starts again from zero."); };
	function paintSpeed() { Array.prototype.forEach.call(document.querySelectorAll("#hx-spd button"), function (b) { b.setAttribute("aria-pressed", +b.dataset.v === ui.speed ? "true" : "false"); }); }
	SPEEDS.forEach(function (v) { var b = document.createElement("button"); b.type = "button"; b.dataset.v = v; b.textContent = v + "×"; b.title = v === 1 ? "Real time" : v + " times real time (" + (v >= 60 ? fmtT(v) + " of experiment per second" : v + " s per second") + ")"; b.onclick = function () { ui.speed = v; paintSpeed(); if (!ui.run) setRun(true); saveSoon(); }; $("hx-spd").appendChild(b); });
	$("hx-png").onclick = function () {
		var c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height + Math.round(28 * dpr); var x = c2.getContext("2d"); x.drawImage(cv, 0, 0); x.fillStyle = "#0b0f17"; x.fillRect(0, cv.height, c2.width, c2.height - cv.height); x.fillStyle = "#e5e7eb"; x.font = Math.round(13 * dpr) + "px system-ui,sans-serif"; x.fillText("MES Hutchison Effect Simulator · " + MAPS[ui.map].name + " · mes.fm/hutchison-effect-simulator", 10 * dpr, cv.height + 19 * dpr);
		c2.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "hutchison-lab-" + (st.preset || "layout") + ".png"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); });
	};
	$("hx-sch-png").onclick = function () { var c0 = $("hx-sch"); c0.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "hutchison-schematic.png"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }); };
	$("hx-full").onclick = function () { var w = stage.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () {}); };
	document.addEventListener("fullscreenchange", function () { setTimeout(layout, 60); });
	$("hx-link").onclick = function () {
		var url = location.origin + location.pathname + "?s=" + H.encode(st);
		function done() { note("Link copied: it holds the whole layout (" + url.length + " characters)."); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};
	$("hx-sch-go").onclick = function () { setTab("lab"); };

	/* formula boxes: shrink a formula that is wider than its box (down to 72%) so it fits without a scroll bar */
	function eqFit() {
		var els = root.querySelectorAll(".hx-eq__f"); if (!els.length) return;
		function fit() { Array.prototype.forEach.call(els, function (el) { if (!el.classList.contains("mes-tex--done")) return; el.style.fontSize = ""; var w = el.clientWidth, sw = el.scrollWidth; if (w > 0 && sw > w + 1) el.style.fontSize = Math.max(72, Math.floor(100 * w / sw)) + "%"; }); }
		new MutationObserver(fit).observe(root.querySelector(".hx-eq"), {subtree: true, attributes: true, attributeFilter: ["class"]});
		var fw = 0; window.addEventListener("resize", function () { clearTimeout(fw); fw = setTimeout(fit, 120); }); fit();
	}
	/* ================= loop ================= */
	var last = performance.now(), frame = 0;
	function redrawStatic() { drawFloor(performance.now()); }
	function loop(now) {
		var dt = Math.min(0.1, (now - last) / 1000); last = now; frame++;
		if (ui.tab === "lab") {
			tick(dt, now); stepParts(dt); if (ui.map === "T" && ui.run) tview += dt;
			drawFloor(now); drawCam(now);
			if (frame % 15 === 0) { updateReadouts(); drawTL(); }
			if (frame % 90 === 0) { chartTimeline(); if (ui.sel) { var d = byId(ui.sel); if (d && d.t === "sample") refreshEditorReports(); } }
		}
		requestAnimationFrame(loop);
	}

	/* ================= start ================= */
	init(); paintPalette(); paintSpeed(); setRun(true); paintToggles(); paintShow(); dirty(true);
	var tabWanted = ui.tab; setTab(tabWanted); renderAll();
	if (st.preset && H.PRESETS[st.preset]) pnote(H.PRESETS[st.preset].note);
	if (window.ResizeObserver && $("hx-tb")) { var tbH = 0; new ResizeObserver(function () { var h2 = $("hx-tb").offsetHeight; if (h2 !== tbH) { tbH = h2; layout(); } }).observe($("hx-tb")); }
	eqFit();
	window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(function () { layout(); if (ui.tab === "sch") drawSchematic(); if (ui.tab === "eq") paintEquipment(); }, 80); });
	var rzT = 0; if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rzT); rzT = setTimeout(function () { layout(); }, 80); }).observe(stage.parentNode);
	new MutationObserver(function () { renderPanels(); if (ui.tab === "sch") drawSchematic(); }).observe(document.body, {attributes: true, attributeFilter: ["class"]});
	requestAnimationFrame(loop);
})();
