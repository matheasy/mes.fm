/* node tool_apps_src/atomic-clock-simulator-tests.js -- line shapes, Ramsey fringe width, locked-clock stability, Allan deviation, drift maths, formatting */
const A = require("./atomic-clock-simulator/lib.js");
let fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); }
function near(a, b, rel, msg) { ok(Math.abs(a - b) <= rel * Math.abs(b), msg + " (" + a + " vs " + b + ")"); }

// 1. the definition
ok(A.NU0 === 9192631770, "caesium hyperfine frequency is 9,192,631,770 Hz");
ok(A.cyclesIn(1) === "9192631770" && A.cyclesIn(2) === "18385263540", "cycles in 1 s and 2 s (exact)");

// 2. Rabi / beam line shape: full transfer on resonance, symmetric, falls off, first zero at |delta| = sqrt(3) * pi / tau (rad/s)
{
	const tau = 0.01;
	near(A.beamP(0, tau), 1, 1e-12, "beam clock: pi pulse flips every atom on resonance");
	near(A.beamP(30, tau), A.beamP(-30, tau), 1e-12, "beam line shape is symmetric");
	ok(A.beamP(50, tau) < A.beamP(10, tau), "beam line shape falls away from resonance");
	const z = Math.sqrt(3) / (2 * tau);                       // first zero in Hz: Omega_e tau = 2 pi  ->  delta = sqrt(3) pi / tau rad/s
	ok(A.beamP(z, tau) < 1e-12, "first zero of the Rabi pedestal at sqrt(3)/(2 tau) Hz");
	// FWHM is about 0.8/tau
	let lo = 0; for (let d = 0; d < 400; d += 0.01) if (A.beamP(d, tau) < 0.5) { lo = d; break; }
	near(2 * lo, A.beamWidth(tau), 0.04, "beam FWHM is about 0.8 / tau");
}

// 3. Ramsey fringes: on-resonance P = 1, first minimum at +/- 1/(2T), neighbouring maximum at +/- 1/T, FWHM about 1/(2T)
{
	const T = 0.5, tau = 0.005;
	near(A.fountainP(0, T, tau), 1, 1e-9, "fountain: on resonance every atom has flipped");
	near(A.fountainP(0.3, T, tau), A.fountainP(-0.3, T, tau), 1e-9, "fountain fringes are symmetric");
	ok(A.fountainP(1 / (2 * T), T, tau) < 0.01, "first minimum at 1/(2T) from the centre");
	ok(A.fountainP(1 / T, T, tau) > 0.5, "next maximum near 1/T away (fringe spacing = 1/T)");
	let half = 0; for (let d = 0; d < 2; d += 0.0005) if (A.fountainP(d, T, tau) < 0.5) { half = d; break; }
	near(2 * half, A.fringeWidth(T), 0.1, "central fringe FWHM is about 1/(2T) = 1 Hz for T = 0.5 s");
	// longer flight = narrower fringe
	let half2 = 0; for (let d = 0; d < 2; d += 0.0002) if (A.fountainP(d, 5 * T, tau) < 0.5) { half2 = d; break; }
	ok(half2 < half / 4, "10x less... five times the flight time gives a fringe about five times narrower");
}

// 3b. Bloch sphere reproduces the Ramsey formula
{
	const T = 0.5, tau = 0.005; let worst = 0;
	for (let d = -4; d <= 4; d += 0.137) { const path = A.blochPath(d, T, tau, 60, 120), P = A.blochP(path[path.length - 1].r), want = A.fountainP(d, T, tau); worst = Math.max(worst, Math.abs(P - want)); }
	ok(worst < 1e-3, "Bloch-sphere evolution equals the Ramsey fringe formula at every detuning, both signs (worst " + worst.toExponential(2) + ")");
	const p0 = A.blochPath(0, T, tau); near(A.blochP(p0[p0.length - 1].r), 1, 1e-6, "on resonance the arrow ends at the north pole");
	const mid = p0.find(q => q.seg === 1 && q.f === 1); ok(Math.abs(mid.r[2]) < 1e-9 && Math.abs(Math.hypot(mid.r[0], mid.r[1]) - 1) < 1e-9, "after the first pulse the arrow lies on the equator");
	const half = A.blochPath(1 / (2 * T), T, tau); ok(A.blochP(half[half.length - 1].r) < 0.01, "half a fringe away (1/(2T)) the arrow returns to the south pole");
	ok(p0.every(q => Math.abs(Math.hypot(q.r[0], q.r[1], q.r[2]) - 1) < 1e-9), "the arrow stays on the sphere");
	near(A.waitPhase(0.25, 2), Math.PI, 1e-12, "wait phase = 2 pi delta T");
}

// 4. Stability formula: narrower line, better signal -> lower noise; and it scales as 1/sqrt(tau)
{
	const s = A.sigma1s(1, 300, 1);
	ok(s > 5e-14 && s < 3e-13, "fountain-like clock: sigma_y(1 s) is around 1e-13 (" + s.toExponential(2) + ")");
	ok(A.sigma1s(0.5, 300, 1) < s, "narrower line is more stable");
	ok(A.sigma1s(1, 600, 1) < s, "higher signal-to-noise is more stable");
	near(A.sigmaAt(s, 100), s / 10, 1e-12, "averaging 100x longer improves sigma by 10x");
}

// 5. Allan deviation of white frequency noise falls as 1/sqrt(tau); constant offset does not matter
{
	const r = A.rng(5), y = []; for (let i = 0; i < 40000; i++) y.push(1e-12 * r.normal() + 3e-9);
	const a1 = A.allan(y, 1), a10 = A.allan(y, 10), a100 = A.allan(y, 100);
	near(a1, 1e-12, 0.05, "Allan deviation of white noise at tau0 equals the noise sigma");
	near(a10 / a1, 1 / Math.sqrt(10), 0.1, "...and falls by sqrt(10) when averaging 10x longer");
	near(a100 / a10, 1 / Math.sqrt(10), 0.15, "...and again");
	ok(isNaN(A.allan([1, 2, 3], 5)), "too short a record gives NaN");
	// a pure linear frequency drift gives sigma proportional to tau
	const d = []; for (let i = 0; i < 2000; i++) d.push(1e-12 * i);
	near(A.allan(d, 20) / A.allan(d, 10), 2, 0.02, "linear frequency drift: Allan deviation grows as tau");
	// phase -> frequency
	const x = [0, 1e-6, 2e-6, 3e-6]; const yy = A.phaseToFreq(x, 1);
	ok(yy.length === 3 && Math.abs(yy[0] - 1e-6) < 1e-18, "phase record converts to frequency");
}

// 6. Servo loop: locking removes the quartz error and its drift
{
	const L = new A.Loop({ seed: 3, dt: 1, sig1: 1e-12, rw: 2e-11, gain: 0.3, y0: 1.5e-6 });
	for (let i = 0; i < 100; i++) L.step();
	const freeErr = Math.abs(L.free);
	ok(freeErr > 1e-7, "free-running quartz is far off (" + freeErr.toExponential(2) + ")");
	L.setLock(true);
	const out = []; for (let i = 0; i < 4000; i++) out.push(L.step());
	const tail = out.slice(-2000), rms = Math.sqrt(tail.reduce((s, v) => s + v * v, 0) / tail.length);
	ok(rms < 1e-10, "locked output is within 1e-10 of the atoms (rms " + rms.toExponential(2) + ")");
	ok(Math.abs(L.free) > 1e-7, "the quartz underneath is still wandering; the servo is doing the work");
	ok(A.allan(out, 1000) < 1e-10, "locked clock Allan deviation at 1000 s is below 1e-10 (" + A.allan(out, 1000).toExponential(2) + ")");
	L.setLock(false);
	L.step();
	ok(Math.abs(L.yOut) > 1e-7, "switching the lock off lets the quartz error come straight back");
	// a temperature kick is removed within a few tens of cycles
	const K = new A.Loop({ seed: 4, dt: 1, y0: 0 }); K.setLock(true); for (let i = 0; i < 200; i++) K.step();
	K.kick(5e-7); let worst = 0; for (let i = 0; i < 80; i++) { const o = Math.abs(K.step()); if (i > 60) worst = Math.max(worst, o); }
	ok(worst < 1e-9, "a 5e-7 temperature kick is gone within 60 cycles (" + worst.toExponential(2) + ")");
}

// 7. Clock ladder and race
{
	const ids = A.CLOCKS.map(c => c.id);
	ok(ids.length === 7 && new Set(ids).size === 7, "seven distinct clocks");
	for (let i = 1; i < A.CLOCKS.length; i++) {
		const better = A.CLOCKS[i].id === "maser" ? true : A.CLOCKS[i].acc <= A.CLOCKS[i - 1].acc;
		ok(better, A.CLOCKS[i].short + " is at least as accurate as the one before it");
	}
	const quartz = A.BYID.quartz, opt = A.BYID.optical;
	const secPerMonth = A.expectedError(quartz, A.PERIODS.month);
	ok(secPerMonth > 5 && secPerMonth < 30, "quartz watch is off by seconds per month (" + secPerMonth.toFixed(1) + " s)");
	const tOpt = A.timeToError(opt, 1);
	ok(tOpt / A.YEAR > 5e9 && tOpt / A.YEAR < 5e11, "optical clock needs billions of years to be off by 1 s (" + (tOpt / A.YEAR / 1e9).toFixed(1) + " Gyr)");
	const tQ = A.timeToError(quartz, 1);
	ok(tQ / A.DAY > 1 && tQ / A.DAY < 10, "quartz is off by a second within days (" + (tQ / A.DAY).toFixed(1) + " d)");
	ok(Math.abs(A.allanModel(opt, 1) - Math.sqrt(opt.a * opt.a + opt.floor * opt.floor)) < 1e-30, "model Allan curve at 1 s");
	const st = A.raceInit(9); for (let i = 0; i < 1000; i++) A.raceStep(st, 3600);
	ok(Math.abs(st.x.quartz) > 1000 * Math.abs(st.x.fountain), "after 1,000 hours quartz is off by far more than a fountain");
	const st2 = A.raceInit(9); for (let i = 0; i < 1000; i++) A.raceStep(st2, 3600);
	ok(st.x.quartz === st2.x.quartz, "race is deterministic for a seed");
}

// 8. Parsing
{
	near(A.parseFraction("5 ppm"), 5e-6, 1e-12, "5 ppm"); near(A.parseFraction("2 ppb"), 2e-9, 1e-12, "2 ppb");
	near(A.parseFraction("3 ppt"), 3e-12, 1e-12, "3 ppt"); near(A.parseFraction("1.5e-13"), 1.5e-13, 1e-12, "1.5e-13");
	near(A.parseFraction("0.0005%"), 5e-6, 1e-12, "0.0005%"); near(A.parseFraction("2×10⁻9".replace("⁻9", "-9")), 2e-9, 1e-12, "2x10-9");
	ok(isNaN(A.parseFraction("abc")) && isNaN(A.parseFraction("")), "garbage -> NaN");
	near(A.parseTime("10 ns"), 1e-8, 1e-12, "10 ns"); near(A.parseTime("1.5 ms"), 1.5e-3, 1e-12, "1.5 ms"); near(A.parseTime("2 min"), 120, 1e-12, "2 min");
	near(A.parseTime("1 day"), 86400, 1e-12, "1 day"); near(A.parseTime("3"), 3, 1e-12, "bare number is seconds"); ok(isNaN(A.parseTime("3 parsecs")), "unknown unit -> NaN");
}

// 9. Drift maths
{
	near(A.secondsOff(5e-6, A.PERIODS.month), 13.15, 0.01, "5 ppm = about 13 s a month");
	near(A.secondsOff(1e-9, A.PERIODS.day), 8.64e-5, 1e-9, "1 ppb = 86.4 us a day");
	near(A.fractionFrom(1, A.DAY), 1 / 86400, 1e-12, "1 s per day = 11.6 ppm");
	near(A.timeUntil(1e-9, 1), 1e9, 1e-12, "1 ppb takes a billion seconds to be off by a second");
	ok(A.timeUntil(0, 1) === Infinity, "a perfect clock is never off");
	near(A.lightDistance(1e-9), 0.299792458, 1e-9, "1 ns = 30 cm of light travel");
}

// 10. Formatting
{
	ok(A.fmtTime(1.2e-7) === "120 ns", "120 ns: " + A.fmtTime(1.2e-7));
	ok(A.fmtTime(3.5e-4) === "350 µs", "350 us: " + A.fmtTime(3.5e-4));
	ok(A.fmtTime(90) === "1.5 min", "90 s: " + A.fmtTime(90));
	ok(A.fmtTime(2e-15) === "2 fs", "2 fs: " + A.fmtTime(2e-15));
	ok(/billion years/.test(A.fmtSpan(1e17)) && /age of the universe/.test(A.fmtSpan(1e18)), "spans in billions of years: " + A.fmtSpan(1e18));
	ok(A.fmtFrac(5e-6) === "5×10⁻⁶", "fraction format: " + A.fmtFrac(5e-6));
	ok(A.fmtDist(0.2998) === "30 cm" || A.fmtDist(0.2998) === "30.0 cm" || /cm/.test(A.fmtDist(0.2998)), "distance format: " + A.fmtDist(0.2998));
}

// 6b. capture range: a kick bigger than the line loses the lock, a re-tune finds it again
{
	const K = new A.Loop({ seed: 8, dt: 1, y0: 0, capture: 1e-8 }); K.setLock(true); for (let i = 0; i < 100; i++) K.step();
	K.kick(3e-8); for (let i = 0; i < 50; i++) K.step();
	ok(K.lost && Math.abs(K.yOut) > 2e-8, "kick beyond the capture range loses the lock");
	K.retune(); for (let i = 0; i < 50; i++) K.step();
	ok(!K.lost && Math.abs(K.yOut) < 1e-9, "re-tune puts it back on the line");
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
