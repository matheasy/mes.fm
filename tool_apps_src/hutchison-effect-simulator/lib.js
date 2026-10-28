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
