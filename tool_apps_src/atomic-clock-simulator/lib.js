/* MES Atomic Clock Simulator -- physics + maths (pure JS, runs in the browser and in node: require('./tool_apps_src/atomic-clock-simulator/lib.js')).
 *
 * What is modelled
 *   - the caesium-133 hyperfine transition that defines the second: 9,192,631,770 cycles (nu0)
 *   - the two-level atom driven by microwaves: Rabi line shape (one pass through a cavity, a "beam clock")
 *     and Ramsey fringes (two pi/2 pulses separated by free flight T, a "fountain clock")
 *   - the stability of a locked clock: sigma_y(tau) = (1/pi) (dnu/nu0) (1/SNR) sqrt(Tc/tau)   (white frequency noise of the servo loop)
 *   - a quartz oscillator that wanders (random-walk frequency + temperature steps), and a servo that locks it to the atoms
 *   - a ladder of real clock types with published-ballpark accuracy / short-term stability, for the "race" and the stability chart
 *   - Allan deviation of a phase record, and the drift calculator (fractional error <-> seconds off, time until off by X)
 * Everything here is deterministic given a seed (mulberry32), so tests and shared links reproduce.
 */
(function (root) {
	"use strict";

	var NU0 = 9192631770;                 // Hz, the SI definition of the second
	var C = 299792458;                    // m/s
	var TWO_PI = 2 * Math.PI;

	/* ---------------- random numbers ---------------- */
	function rng(seed) {
		var a = (seed >>> 0) || 1;
		function u() { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
		var spare = null;
		u.normal = function () {
			if (spare !== null) { var s = spare; spare = null; return s; }
			var x, y, r;
			do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0);
			var m = Math.sqrt(-2 * Math.log(r) / r); spare = y * m; return x * m;
		};
		return u;
	}

	/* ---------------- line shapes ---------------- */
	// Two-level atom, resonant Rabi frequency omega (rad/s), detuning delta (rad/s), pulse length tau (s).
	function rabiP(delta, omega, tau) {
		var oe2 = omega * omega + delta * delta, oe = Math.sqrt(oe2);
		if (oe === 0) return 0;
		var s = Math.sin(oe * tau / 2);
		return (omega * omega / oe2) * s * s;
	}
	// Beam clock: one interaction region of length L with atoms at speed v; the pulse is pi at resonance (omega * tau = pi).
	function beamP(deltaHz, tauSec) { var omega = Math.PI / tauSec; return rabiP(TWO_PI * deltaHz, omega, tauSec); }

	// Ramsey: two pulses of length tau (pi/2 on resonance: omega * tau = pi/2) separated by free evolution T.
	function ramseyP(delta, omega, tau, T) {
		var oe = Math.sqrt(omega * omega + delta * delta);
		if (oe === 0) return 0;
		var a = oe * tau / 2, b = delta * T / 2;
		var inner = Math.cos(b) * Math.cos(a) - (delta / oe) * Math.sin(b) * Math.sin(a);
		var s = Math.sin(a);
		return 4 * (omega * omega / (oe * oe)) * s * s * inner * inner;
	}
	// Fountain clock fringes against detuning in Hz (pulse length is a small fraction of T, like a real microwave cavity pass of ~ 10 ms).
	function fountainP(deltaHz, T, tau) {
		tau = tau || Math.min(0.01, T / 5);
		var omega = Math.PI / (2 * tau);
		return ramseyP(TWO_PI * deltaHz, omega, tau, T);
	}
	// Width (FWHM) of the central fringe in Hz: about 1 / (2 T).
	function fringeWidth(T) { return 1 / (2 * T); }
	function beamWidth(tau) { return 0.8 / tau; }          // FWHM of the Rabi pedestal for a pi pulse, about 0.8 / tau

	/* ---------------- stability of a locked clock ---------------- */
	// Fractional frequency noise at 1 s of an atomic clock locked to a line of width dnu (Hz) with signal-to-noise snr per cycle of duration Tc (s).
	function sigma1s(dnu, snr, Tc) { return (1 / Math.PI) * (dnu / NU0) * (1 / snr) * Math.sqrt(Tc); }
	function sigmaAt(sig1, tau) { return sig1 / Math.sqrt(tau); }

	/* ---------------- clock ladder ----------------
	 * acc   = typical fractional frequency error (accuracy) of the standard when it leaves the factory / lab
	 * a     = sigma_y at 1 s (white frequency noise)
	 * floor = best stability reached after long averaging (flicker floor)
	 * Numbers are ballpark figures from manufacturer data sheets and NIST / PTB / JILA papers; they are for teaching, not metrology.
	 */
	var CLOCKS = [
		{ id: "quartz", name: "Quartz wristwatch", short: "Quartz watch", color: "#9aa5bb", acc: 5e-6, a: 1e-7, floor: 1e-8,
		  note: "A 32,768 Hz crystal. About 15 seconds a month, mostly from temperature.", year: "1969" },
		{ id: "tcxo", name: "Temperature-compensated crystal (phone / GPS receiver)", short: "TCXO", color: "#c084fc", acc: 5e-7, a: 2e-9, floor: 2e-10,
		  note: "The oscillator in a phone or a GPS receiver. Corrected by a thermometer.", year: "1980s" },
		{ id: "rb", name: "Rubidium atomic clock", short: "Rubidium", color: "#34d399", acc: 5e-11, a: 3e-11, floor: 1e-12,
		  note: "Rubidium-87 vapour cell. Small, cheap atomic clock used in telecom and test labs.", year: "1958" },
		{ id: "csbeam", name: "Caesium beam clock", short: "Caesium beam", color: "#fbbf24", acc: 5e-13, a: 5e-12, floor: 1e-14,
		  note: "Atoms fly through a one-metre tube. The commercial workhorse (HP / Symmetricom 5071A).", year: "1955" },
		{ id: "maser", name: "Hydrogen maser", short: "H maser", color: "#38bdf8", acc: 1e-12, a: 1.5e-13, floor: 1e-15,
		  note: "Best stability for hours to days. Not a primary standard (its frequency has to be calibrated).", year: "1960" },
		{ id: "fountain", name: "Caesium fountain (NIST-F2 class)", short: "Caesium fountain", color: "#f97316", acc: 1e-16, a: 1.2e-13, floor: 3e-16,
		  note: "Laser-cooled atoms tossed up about a metre. These realise the SI second.", year: "1999" },
		{ id: "optical", name: "Strontium optical lattice clock", short: "Optical (Sr)", color: "#f472b6", acc: 2e-18, a: 3e-16, floor: 1e-18,
		  note: "Atoms held in a lattice of laser light, probed with a laser at 429 THz. Candidate for the next definition of the second.", year: "2000s" }
	];
	var BYID = {}; CLOCKS.forEach(function (c) { BYID[c.id] = c; });

	function allanModel(clock, tau) { return Math.sqrt(clock.a * clock.a / tau + clock.floor * clock.floor); }

	/* ---------------- race simulation ----------------
	 * time error x (seconds) of each clock against a perfect one: x += y_offset * dt + a * sqrt(dt) * N(0,1)
	 * (white frequency noise integrates to a random walk of phase with std a*sqrt(dt)). */
	function raceInit(seed) {
		var r = rng(seed || 7), st = { t: 0, rnd: r, x: {}, off: {} };
		CLOCKS.forEach(function (c) {
			var sgn = r() < 0.5 ? -1 : 1;
			st.off[c.id] = sgn * c.acc * (0.45 + 0.55 * r());    // this particular clock's systematic offset
			st.x[c.id] = 0;
		});
		return st;
	}
	function raceStep(st, dt) {
		CLOCKS.forEach(function (c) {
			st.x[c.id] += st.off[c.id] * dt + c.a * Math.sqrt(dt) * st.rnd.normal();
		});
		st.t += dt;
	}
	// Mean-square-honest expected size of the error after t seconds (for the table).
	function expectedError(c, t) { return Math.sqrt(Math.pow(c.acc * t, 2) + c.a * c.a * t); }
	// Seconds until the clock is expected to be off by `target` seconds.
	function timeToError(c, target) {
		var lo = 0, hi = 1e25;
		for (var i = 0; i < 200; i++) { var mid = Math.sqrt(Math.max(lo, 1e-9) * hi); if (expectedError(c, mid) < target) lo = mid; else hi = mid; if (hi / Math.max(lo, 1e-9) < 1.0000001) break; }
		return Math.sqrt(Math.max(lo, 1e-9) * hi);
	}

	/* ---------------- servo loop: quartz locked to atoms ----------------
	 * y_free(t): fractional frequency error of the free-running quartz = y0 + random walk (sigma rw per sqrt s) + temperature steps (kick)
	 * locked: the servo estimates the quartz error from the atoms (noisy: white, sigma1 at 1 s) and removes it with an integrator of gain g per cycle. */
	function Loop(opts) {
		opts = opts || {};
		this.rnd = rng(opts.seed || 11);
		this.dt = opts.dt || 1;                   // seconds per servo cycle (one interrogation cycle Tc)
		this.sig1 = opts.sig1 != null ? opts.sig1 : 1e-12;   // atomic measurement noise at 1 s (fractional)
		this.rw = opts.rw != null ? opts.rw : 2e-11;           // quartz random walk of frequency (fractional per sqrt(s))
		this.gain = opts.gain != null ? opts.gain : 0.3;
		this.y0 = opts.y0 != null ? opts.y0 : 1.5e-6;          // quartz starts this far from the right frequency (fractional)
		this.free = this.y0;                       // y of the free-running quartz
		this.corr = 0;                             // servo correction (fractional)
		this.capture = opts.capture || Infinity;   // the servo only sees the atoms while the quartz is within this fractional error of resonance
		this.lost = false; this.locked = false; this.hold = 0;
		this.x = 0; this.xFree = 0;                // time errors (s): of the output with the servo as set, and of the free-running quartz
		this.t = 0; this.n = 0;
		this.yOut = this.free;
	}
	Loop.prototype.kick = function (dy) { this.free += dy; };
	Loop.prototype.step = function () {
		var dt = this.dt;
		this.free += this.rw * Math.sqrt(dt) * this.rnd.normal();
		if (this.locked) {
			var y = this.free + this.corr;                                          // what the quartz is doing after the correction
			if (Math.abs(y) <= this.capture) {
				var meas = y + (this.sig1 / Math.sqrt(dt)) * this.rnd.normal();     // atoms report it, with noise
				this.corr -= this.gain * meas;                                      // integrator: push it back to zero
				this.lost = false;
			} else this.lost = true;                                                // off the line: the atoms say nothing, the servo is blind
		}
		var out = this.free + (this.locked ? this.corr : 0);
		// when not locked the correction is frozen at its last value only if "hold" is on; otherwise it decays away (the servo is off)
		if (!this.locked && this.corr !== 0) { if (!this.hold) this.corr = 0; out = this.free + this.corr; }
		this.yOut = out; this.yAtoms = this.free + this.corr;
		this.x += out * dt; this.xFree += this.free * dt;
		this.t += dt; this.n++;
		return out;
	};
	Loop.prototype.setLock = function (on) { this.locked = !!on; if (!on) { this.corr = 0; this.lost = false; } };
	// sweep the microwave synthesiser back onto the line (what an operator does after losing lock)
	Loop.prototype.retune = function () { this.corr = -this.free; this.lost = false; };

	/* ---------------- Allan deviation of a series ---------------- */
	// y = array of fractional-frequency samples at spacing tau0; returns sigma_y(m * tau0) (overlapping estimator on frequency averages)
	function allan(y, m) {
		var n = y.length; if (m < 1 || n < 2 * m + 1) return NaN;
		var avg = new Array(n - m + 1), s = 0, i;
		for (i = 0; i < m; i++) s += y[i];
		avg[0] = s / m;
		for (i = 1; i <= n - m; i++) { s += y[i + m - 1] - y[i - 1]; avg[i] = s / m; }
		var sum = 0, cnt = 0;
		for (i = 0; i + m < avg.length; i++) { var d = avg[i + m] - avg[i]; sum += d * d; cnt++; }
		return cnt ? Math.sqrt(sum / (2 * cnt)) : NaN;
	}
	// phase (time error) record -> frequency samples
	function phaseToFreq(x, tau0) { var y = []; for (var i = 1; i < x.length; i++) y.push((x[i] - x[i - 1]) / tau0); return y; }

	/* ---------------- drift calculator ---------------- */
	var DAY = 86400, YEAR = 365.25 * DAY;
	var PERIODS = { second: 1, minute: 60, hour: 3600, day: DAY, week: 7 * DAY, month: YEAR / 12, year: YEAR, decade: 10 * YEAR, century: 100 * YEAR };
	var UNITS = { as: 1e-18, fs: 1e-15, ps: 1e-12, ns: 1e-9, "µs": 1e-6, us: 1e-6, ms: 1e-3, s: 1, min: 60, h: 3600, hr: 3600, d: DAY, day: DAY, days: DAY, w: 7 * DAY, mo: YEAR / 12, y: YEAR, yr: YEAR, year: YEAR, years: YEAR };

	// "5e-6", "5 ppm", "2 ppb", "3 ppt", "1.5e-13", "0.0005%", "1e-12" -> number (fractional). Returns NaN when it cannot read it.
	function parseFraction(s) {
		if (typeof s === "number") return s;
		s = String(s == null ? "" : s).trim().toLowerCase().replace(/,/g, "").replace(/×\s*10\s*\^?\s*(-?\d+)/g, "e$1").replace(/−/g, "-").replace(/x\s*10\s*\^?\s*(-?\d+)/g, "e$1").replace(/\s+/g, " ");
		var m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(ppm|ppb|ppt|ppq|%|percent)?$/.exec(s);
		if (!m) return NaN;
		var v = parseFloat(m[1]), u = m[2];
		if (u === "ppm") v *= 1e-6; else if (u === "ppb") v *= 1e-9; else if (u === "ppt") v *= 1e-12; else if (u === "ppq") v *= 1e-15; else if (u === "%" || u === "percent") v /= 100;
		return v;
	}
	// seconds gained / lost over a period (given as seconds) for fractional error y
	function secondsOff(y, period) { return y * period; }
	function fractionFrom(seconds, period) { return seconds / period; }
	// how long until a clock with fractional error |y| is off by `target` seconds
	function timeUntil(y, target) { y = Math.abs(y); return y > 0 ? target / y : Infinity; }
	// light travel distance for a timing error (GPS-style ranging)
	function lightDistance(seconds) { return C * Math.abs(seconds); }
	// cycles of the caesium transition counted in `seconds` (exact BigInt string where available)
	function cyclesIn(seconds) {
		if (typeof BigInt === "function" && isFinite(seconds) && Math.abs(seconds) < 9e15 && seconds === Math.round(seconds)) return (BigInt(9192631770) * BigInt(seconds)).toString();
		return (NU0 * seconds).toPrecision(6);
	}

	/* ---------------- number formatting ---------------- */
	var SI = [[1e-18, "as"], [1e-15, "fs"], [1e-12, "ps"], [1e-9, "ns"], [1e-6, "µs"], [1e-3, "ms"], [1, "s"]];
	function group(s) { return s.replace(/^(\d{4,})(\.\d+)?$/, function (m, i, f) { return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f || ""); }); }
	function fmtSig(x, d) { d = d || 3; if (!isFinite(x)) return x > 0 ? "∞" : String(x); if (x === 0) return "0"; var s = Math.abs(x).toPrecision(d); if (/e/.test(s)) return (x < 0 ? "-" : "") + group(Number(s).toString()); return (x < 0 ? "-" : "") + group(String(parseFloat(s))); }
	// 1.2e-7 s -> "120 ns"
	function fmtTime(sec, d) {
		if (!isFinite(sec)) return "∞";
		var a = Math.abs(sec), sgn = sec < 0 ? "-" : "";
		if (a === 0) return "0 s";
		if (a < 1) { for (var i = SI.length - 1; i >= 0; i--) if (a >= SI[i][0] * 0.9995) return sgn + fmtSig(a / SI[i][0], d) + " " + SI[i][1]; return sgn + fmtSig(a / 1e-18, d) + " as"; }
		if (a < 60) return sgn + fmtSig(a, d) + " s";
		if (a < 3600) return sgn + fmtSig(a / 60, d) + " min";
		if (a < DAY) return sgn + fmtSig(a / 3600, d) + " hours";
		if (a < 2 * YEAR / 12) return sgn + fmtSig(a / DAY, d) + " days";
		if (a < 2 * YEAR) return sgn + fmtSig(a / (YEAR / 12), d) + " months";
		return sgn + fmtSig(a / YEAR, d) + " years";
	}
	// a long span in plain words, with an age-of-the-universe comparison where it matters
	var UNIVERSE = 13.8e9 * YEAR;
	function fmtSpan(sec) {
		if (!isFinite(sec)) return "never";
		var a = Math.abs(sec);
		if (a < YEAR * 1e4) return fmtTime(sec, 3);
		var y = a / YEAR, s;
		if (y < 1e6) s = fmtSig(y, 3) + " years";
		else if (y < 1e9) s = fmtSig(y / 1e6, 3) + " million years";
		else if (y < 1e12) s = fmtSig(y / 1e9, 3) + " billion years";
		else s = fmtSig(y, 3) + " years";
		if (a > UNIVERSE * 0.5) s += " (" + fmtSig(a / UNIVERSE, 2) + "× the age of the universe)";
		return s;
	}
	function fmtFrac(y) {
		if (!isFinite(y)) return "–";
		if (y === 0) return "0";
		var a = Math.abs(y);
		if (a >= 1e-3) return fmtSig(y, 3);
		var e = Math.floor(Math.log10(a)), m = y / Math.pow(10, e);
		return fmtSig(m, 3) + "×10" + sup(e);
	}
	function sup(n) { var map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" }; return String(n).split("").map(function (c) { return map[c]; }).join(""); }
	function fmtDist(m) {
		var a = Math.abs(m);
		if (a >= 1000) return fmtSig(m / 1000, 3) + " km";
		if (a >= 1) return fmtSig(m, 3) + " m";
		if (a >= 1e-2) return fmtSig(m * 100, 3) + " cm";
		if (a >= 1e-3) return fmtSig(m * 1e3, 3) + " mm";
		if (a >= 1e-6) return fmtSig(m * 1e6, 3) + " µm";
		return fmtSig(m * 1e9, 3) + " nm";
	}
	// "10 ns", "1.5 ms", "2 min", "1 day" -> seconds
	function parseTime(s) {
		s = String(s == null ? "" : s).trim().toLowerCase().replace(/,/g, "").replace(/μ|µ/g, "µ").replace(/\s+/g, " ");
		var m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-zµ]+)?$/.exec(s);
		if (!m) return NaN;
		var v = parseFloat(m[1]), u = m[2] || "s";
		return UNITS[u] != null ? v * UNITS[u] : NaN;
	}

	var API = {
		NU0: NU0, C: C, DAY: DAY, YEAR: YEAR, PERIODS: PERIODS, UNIVERSE: UNIVERSE, CLOCKS: CLOCKS, BYID: BYID,
		rng: rng, rabiP: rabiP, beamP: beamP, ramseyP: ramseyP, fountainP: fountainP, fringeWidth: fringeWidth, beamWidth: beamWidth,
		sigma1s: sigma1s, sigmaAt: sigmaAt, allanModel: allanModel, raceInit: raceInit, raceStep: raceStep, expectedError: expectedError, timeToError: timeToError,
		Loop: Loop, allan: allan, phaseToFreq: phaseToFreq,
		parseFraction: parseFraction, parseTime: parseTime, secondsOff: secondsOff, fractionFrom: fractionFrom, timeUntil: timeUntil, lightDistance: lightDistance, cyclesIn: cyclesIn,
		fmtTime: fmtTime, fmtSpan: fmtSpan, fmtFrac: fmtFrac, fmtSig: fmtSig, fmtDist: fmtDist, sup: sup
	};
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESAtomic = API;
})(typeof window !== "undefined" ? window : this);
