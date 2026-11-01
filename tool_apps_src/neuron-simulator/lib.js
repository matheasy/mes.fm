/* MES Neuron Simulator maths (pure; node: require('./tool_apps_src/neuron-simulator/lib.js')). Tests: node tool_apps_src/neuron-simulator-tests.js
   Units: V mV, t ms, current density uA/cm^2, conductance mS/cm^2, capacitance uF/cm^2, concentrations mmol/L.
   1. Hodgkin-Huxley (1952) membrane, modern sign convention (rest about -65 mV), RK4, temperature factor 3^((T-6.3)/10), drugs as simplified blocks.
   2. A cable (axon) of HH and passive compartments, backward-Euler tridiagonal solve (so myelin's tiny capacitance does not need a tiny step), gates by Rush-Larsen.
   3. A conductance-based integrate-and-fire neuron for synaptic summation, and a neuromuscular-junction train model (quantal release, depletion, facilitation).
   4. Nernst and Goldman-Hodgkin-Katz equations. */
(function (root) {
	"use strict";
	var R = 8.314462618, F = 96485.33212;
	function rtf(TC) { return R * (TC + 273.15) / F * 1000; } /* RT/F in mV */

	/* ------------------------------------------------------------------ 1. Hodgkin-Huxley */
	var HH = { C: 1, gNa: 120, gK: 36, gL: 0.3, ENa: 50, EK: -77, EL: -54.387, T0: 6.3 };
	function vtrap(x, y) { return Math.abs(x / y) < 1e-6 ? y * (1 - x / y / 2) : x / (Math.exp(x / y) - 1); }
	/* alpha/beta per ms at 6.3 degC */
	function rates(V, out) {
		out = out || {};
		out.am = 0.1 * vtrap(-(V + 40), 10); out.bm = 4 * Math.exp(-(V + 65) / 18);
		out.ah = 0.07 * Math.exp(-(V + 65) / 20); out.bh = 1 / (1 + Math.exp(-(V + 35) / 10));
		out.an = 0.01 * vtrap(-(V + 55), 10); out.bn = 0.125 * Math.exp(-(V + 65) / 80);
		return out;
	}
	function phiOf(TC) { return Math.pow(3, (TC - HH.T0) / 10); }
	function inf(V) { var r = rates(V); return { m: r.am / (r.am + r.bm), h: r.ah / (r.ah + r.bh), n: r.an / (r.an + r.bn), tm: 1 / (r.am + r.bm), th: 1 / (r.ah + r.bh), tn: 1 / (r.an + r.bn) }; }
	/* E_K follows extracellular K: the model's -77 mV is moved by exactly what the Nernst equation predicts for the change (Ki fixed). */
	function ekShift(Ko, TC) { return rtf(TC == null ? 37 : TC) * Math.log((Ko || 4) / 4); }
	/* Model parameters with conditions applied.
	   o = {T degC, ttx 0..1 (Na block), tea 0..1 (K block), lido 0..1 (lidocaine dose, simplified), Ko mmol/L, gNa, gK, gL} */
	function params(o) {
		o = o || {}; var T = o.T == null ? HH.T0 : o.T;
		return { C: HH.C, gNa: (o.gNa == null ? HH.gNa : o.gNa) * (1 - (o.ttx || 0)), gK: (o.gK == null ? HH.gK : o.gK) * (1 - (o.tea || 0)), gL: o.gL == null ? HH.gL : o.gL,
			ENa: HH.ENa, EK: HH.EK + ekShift(o.Ko == null ? 4 : o.Ko), EL: HH.EL, phi: phiOf(T), T: T, lido: o.lido || 0,
			kon: 0.15, kr: 0.0004, koff: 1 / 300 };   /* lidocaine: binds open/inactivated channels while depolarised (kon x dose per ms), a little at rest (kr), lets go with tau 300 ms (Hondeghem-Katzung "modulated receptor" idea, numbers illustrative) */
	}
	/* state = [V, m, h, n, b] (b = fraction of Na channels with lidocaine bound) */
	function deriv(s, P, I, out) {
		var V = s[0], m = s[1], h = s[2], n = s[3], b = s[4], r = rates(V), ph = P.phi;
		var gna = P.gNa * m * m * m * h * (1 - b), gk = P.gK * n * n * n * n;
		var iNa = gna * (V - P.ENa), iK = gk * (V - P.EK), iL = P.gL * (V - P.EL);
		out[0] = (I - iNa - iK - iL) / P.C;
		out[1] = ph * (r.am * (1 - m) - r.bm * m);
		out[2] = ph * (r.ah * (1 - h) - r.bh * h);
		out[3] = ph * (r.an * (1 - n) - r.bn * n);
		out[4] = P.lido > 0 ? P.lido * (P.kon * (1 - h) / (1 + Math.exp(-(V + 40) / 5)) + P.kr) * (1 - b) - P.koff * b : 0;
		return out;
	}
	var k1 = [0, 0, 0, 0, 0], k2 = [0, 0, 0, 0, 0], k3 = [0, 0, 0, 0, 0], k4 = [0, 0, 0, 0, 0], tmp = [0, 0, 0, 0, 0];
	function rk4(s, P, I, dt) {
		var i; deriv(s, P, I, k1);
		for (i = 0; i < 5; i++) tmp[i] = s[i] + dt / 2 * k1[i]; deriv(tmp, P, I, k2);
		for (i = 0; i < 5; i++) tmp[i] = s[i] + dt / 2 * k2[i]; deriv(tmp, P, I, k3);
		for (i = 0; i < 5; i++) tmp[i] = s[i] + dt * k3[i]; deriv(tmp, P, I, k4);
		for (i = 0; i < 5; i++) s[i] += dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
		if (s[4] < 0) s[4] = 0;
		return s;
	}
	/* resting state: integrate with no current until settled (the gates' steady state at the rest voltage) */
	function rest(P) {
		/* the resting (equilibrium) voltage: total current zero with every gate at its steady state; found by bisection. If it is unstable (e.g. strong K block)
		   the simulation starts there and fires by itself, as the model really does. */
		function itot(V) { var g = inf(V), gna = P.gNa * g.m * g.m * g.m * g.h; return gna * (V - P.ENa) + P.gK * Math.pow(g.n, 4) * (V - P.EK) + P.gL * (V - P.EL); }
		var lo = -120, hi = -20; for (var k = 0; k < 60; k++) { var mid = (lo + hi) / 2; if (itot(mid) < 0) lo = mid; else hi = mid; }
		var V = (lo + hi) / 2, g = inf(V), s = [V, g.m, g.h, g.n, 0];
		if (P.lido > 0) { var kb = P.lido * (P.kon * (1 - g.h) / (1 + Math.exp(-(V + 40) / 5)) + P.kr); s[4] = kb / (kb + P.koff); }
		return s;
	}
	/* Stimulus protocol: {amp uA/cm^2, dur ms, n pulses, gap ms (start to start), t0 ms, amp2 (optional second-pulse amplitude), hold (constant current)} */
	function stimAt(t, S) {
		var I = S.hold || 0; if (!S.amp && !S.amp2) return I;
		var t0 = S.t0 == null ? 5 : S.t0, n = S.n || 1, gap = S.gap || 0;
		for (var k = 0; k < n; k++) { var a = t0 + k * gap; if (t >= a && t < a + S.dur) return I + (k > 0 && S.amp2 != null ? S.amp2 : S.amp); }
		return I;
	}
	/* Current clamp run. Returns typed arrays sampled every `every` steps. */
	function simulate(P, S, tEnd, dt, every) {
		dt = dt || 0.01; every = every || 5;
		var s = rest(P), N = Math.round(tEnd / dt), M = Math.floor(N / every) + 1;
		var o = { t: new Float32Array(M), V: new Float32Array(M), m: new Float32Array(M), h: new Float32Array(M), n: new Float32Array(M), b: new Float32Array(M),
			gNa: new Float32Array(M), gK: new Float32Array(M), iNa: new Float32Array(M), iK: new Float32Array(M), I: new Float32Array(M), rest: s[0] };
		var j = 0;
		function rec(t, I) {
			var V = s[0], m = s[1], h = s[2], n = s[3], b = s[4], gna = P.gNa * m * m * m * h * (1 - b), gk = P.gK * n * n * n * n;
			o.t[j] = t; o.V[j] = V; o.m[j] = m; o.h[j] = h; o.n[j] = n; o.b[j] = b; o.gNa[j] = gna; o.gK[j] = gk; o.iNa[j] = gna * (V - P.ENa); o.iK[j] = gk * (V - P.EK); o.I[j] = I; j++;
		}
		rec(0, stimAt(0, S));
		for (var i = 1; i <= N; i++) { var t = (i - 1) * dt, I = stimAt(t + dt / 2, S); rk4(s, P, I, dt); if (i % every === 0 && j < M) rec(i * dt, I); }
		o.len = j; return o;
	}
	/* spikes: upward crossings of 0 mV; threshold = V where dV/dt first exceeds 20 mV/ms before each spike */
	function analyse(o) {
		var sp = [], V = o.V, t = o.t, n = o.len;
		for (var i = 1; i < n; i++) if (V[i - 1] < 0 && V[i] >= 0) {
			var pk = i; while (pk + 1 < n && V[pk + 1] > V[pk]) pk++;
			if (o.gNa[pk] < 0.5 * o.gK[pk]) continue;   /* pushed over 0 mV by the stimulus alone, no regenerative Na current: not a spike */
			var th = null; for (var k = i; k > 1; k--) { var d = (V[k] - V[k - 1]) / (t[k] - t[k - 1]); if (d < 20) { th = V[k]; break; } }
			var half = (V[pk] + o.rest) / 2, a = pk, b = pk; while (a > 0 && V[a] > half) a--; while (b < n - 1 && V[b] > half) b++;
			var mx = 0; for (k = Math.max(1, i - 200); k <= pk; k++) mx = Math.max(mx, (V[k] - V[k - 1]) / (t[k] - t[k - 1]));
			sp.push({ t: t[i], peak: V[pk], tPeak: t[pk], thr: th, width: t[b] - t[a], dvdt: mx });
		}
		var lo = Infinity; for (i = 0; i < n; i++) lo = Math.min(lo, V[i]);
		return { spikes: sp, rest: o.rest, min: lo };
	}
	function spikes(P, S, tEnd) { return analyse(simulate(P, S, tEnd || 40, 0.01, 2)).spikes.length; }
	/* smallest pulse amplitude (uA/cm^2) that fires one spike, by bisection */
	function threshold(P, dur, hi) {
		dur = dur || 1; var lo = 0; hi = hi || 400;
		if (!spikes(P, { amp: hi, dur: dur })) return null;
		for (var k = 0; k < 22; k++) { var mid = (lo + hi) / 2; if (spikes(P, { amp: mid, dur: dur })) hi = mid; else lo = mid; }
		return hi;
	}
	/* Refractory test: first pulse (1 ms, 2 x threshold) then a second pulse after `gap` ms; returns the second pulse's threshold (null = no spike even at 20 x the
	   normal threshold: the absolute refractory period, as usually defined in practice) */
	function secondThreshold(P, gap, thr1) {
		var dur = 1, a1 = 2 * thr1, lo = 0, hi = 20 * thr1;
		function fires(a2) { return spikes(P, { amp: a1, amp2: a2, dur: dur, n: 2, gap: gap }, 5 + gap + 25) >= 2; }
		if (!fires(hi)) return null;
		for (var k = 0; k < 18; k++) { var mid = (lo + hi) / 2; if (fires(mid)) hi = mid; else lo = mid; }
		return hi;
	}
	/* Voltage clamp: hold at Vh, step to Vs at t0 for dur. Gates evolve at the clamped voltage (exact exponentials). */
	function vclamp(P, Vh, Vs, tEnd, t0, dur, dt) {
		dt = dt || 0.01; t0 = t0 == null ? 2 : t0; dur = dur == null ? tEnd : dur;
		var g = inf(Vh), m = g.m, h = g.h, n = g.n, N = Math.round(tEnd / dt), o = { t: new Float32Array(N + 1), V: new Float32Array(N + 1), iNa: new Float32Array(N + 1), iK: new Float32Array(N + 1), iL: new Float32Array(N + 1), gNa: new Float32Array(N + 1), gK: new Float32Array(N + 1), len: N + 1 };
		for (var i = 0; i <= N; i++) {
			var t = i * dt, V = t >= t0 && t < t0 + dur ? Vs : Vh;
			var gna = P.gNa * m * m * m * h, gk = P.gK * n * n * n * n;
			o.t[i] = t; o.V[i] = V; o.gNa[i] = gna; o.gK[i] = gk; o.iNa[i] = gna * (V - P.ENa); o.iK[i] = gk * (V - P.EK); o.iL[i] = P.gL * (V - P.EL);
			var r = rates(V), ph = P.phi, f = function (x, a, b) { var ti = 1 / (ph * (a + b)), xi = a / (a + b); return xi + (x - xi) * Math.exp(-dt / ti); };
			m = f(m, r.am, r.bm); h = f(h, r.ah, r.bh); n = f(n, r.an, r.bn);
		}
		return o;
	}

	/* ------------------------------------------------------------------ 2. Cable */
	/* Model axon: squid-sized (radius 238 um, axoplasm 35.4 ohm cm) with HH kinetics, as in HH 1952 part 5. Lengths in cm.
	   opt = {myelin: bool, T: degC, nodes, internodeLen (cm), seg (compartments per internode), wrap (myelin factor = how much myelin cuts capacitance and leak; 1 = bare),
	          lesion: [fromFraction, toFraction] internodes with damaged myelin, damage 0..1 (0 healthy, 1 = myelin gone), len (cm, unmyelinated), dx (cm)} */
	var CAB = { a: 0.0238, Ri: 0.0354 };
	function cable(opt) {
		opt = opt || {};
		var P = params({ T: opt.T == null ? 18.5 : opt.T, ttx: opt.ttx, tea: opt.tea, Ko: opt.Ko }), a = opt.a || CAB.a, Ri = opt.Ri || CAB.Ri;
		var comp = []; /* {x, dx, active, cm, gL, myelin} */
		if (!opt.myelin) {
			var len = opt.len || 6, dx = opt.dx || 0.025, n = Math.round(len / dx);
			for (var i = 0; i < n; i++) comp.push({ x: (i + 0.5) * dx, dx: dx, active: true, cm: 1, gL: P.gL, kind: 0 });
		} else {
			var nodes = opt.nodes || 30, L = opt.internodeLen || 1.0, seg = opt.seg || 8, nlen = opt.nodeLen || 0.01, wrap = opt.wrap || 200, dmg = opt.damage || 0, les = opt.lesion || [0.4, 0.7];
			var x = 0;
			for (var k = 0; k < nodes; k++) {
				comp.push({ x: x + nlen / 2, dx: nlen, active: true, cm: 1, gL: P.gL, kind: 1, node: k, gch: opt.nodeDensity || 1 }); x += nlen;
				if (k === nodes - 1) break;
				var f = k / (nodes - 1), hurt = f >= les[0] && f < les[1] ? dmg : 0;
				var w = Math.max(1, wrap * Math.pow(1 - hurt, 2) + (1 - hurt) * 0);   /* myelin factor falls with damage; 1 = bare membrane */
				if (hurt >= 0.999) w = 1;
				for (var j = 0; j < seg; j++) { comp.push({ x: x + L / seg / 2, dx: L / seg, active: false, cm: 1 / w, gL: P.gL / w, kind: hurt > 0 ? 3 : 2, w: w }); x += L / seg; }
			}
		}
		var N = comp.length, gax = new Float64Array(N), area = new Float64Array(N), C = new Float64Array(N);
		for (i = 0; i < N; i++) { area[i] = 2 * Math.PI * a * comp[i].dx; C[i] = comp[i].cm * area[i]; }
		for (i = 0; i < N - 1; i++) { var dd = (comp[i].dx + comp[i + 1].dx) / 2; gax[i] = Math.PI * a * a / (Ri * dd); } /* between i and i+1, mS */
		var V = new Float64Array(N), m = new Float64Array(N), h = new Float64Array(N), nn = new Float64Array(N);
		var g = inf(-65); for (i = 0; i < N; i++) { V[i] = -65; m[i] = g.m; h[i] = g.h; nn[i] = g.n; }
		var A = new Float64Array(N), B = new Float64Array(N), Cc = new Float64Array(N), D = new Float64Array(N), cp = new Float64Array(N), dp = new Float64Array(N);
		var cab = { P: P, comp: comp, N: N, V: V, m: m, h: h, n: nn, t: 0, length: comp[N - 1].x + comp[N - 1].dx / 2, myelin: !!opt.myelin };
		/* leak reversal per compartment so that every compartment rests at the same V (passive ones at EL) */
		cab.step = function (dt, Istim, istim) {
			var ph = P.phi, i;
			for (i = 0; i < N; i++) {
				var c = comp[i], Gi, Ei;
				if (c.active) {
					var r = rates(V[i]); var e = function (x, al, be) { var s = al + be, xi = al / s; return xi + (x - xi) * Math.exp(-dt * ph * s); };
					m[i] = e(m[i], r.am, r.bm); h[i] = e(h[i], r.ah, r.bh); nn[i] = e(nn[i], r.an, r.bn);
					var dens = c.gch || 1, gna = P.gNa * dens * m[i] * m[i] * m[i] * h[i], gk = P.gK * dens * nn[i] * nn[i] * nn[i] * nn[i];
					Gi = (gna + gk + c.gL) * area[i]; Ei = (gna * P.ENa + gk * P.EK + c.gL * P.EL) * area[i];
				} else { Gi = c.gL * area[i]; Ei = c.gL * -65 * area[i]; }
				var gl = i > 0 ? gax[i - 1] : 0, gr = i < N - 1 ? gax[i] : 0;
				A[i] = -dt * gl; Cc[i] = -dt * gr; B[i] = C[i] + dt * (Gi + gl + gr); D[i] = C[i] * V[i] + dt * (Ei + (i === istim ? Istim : 0));
			}
			cp[0] = Cc[0] / B[0]; dp[0] = D[0] / B[0];
			for (i = 1; i < N; i++) { var den = B[i] - A[i] * cp[i - 1]; cp[i] = Cc[i] / den; dp[i] = (D[i] - A[i] * dp[i - 1]) / den; }
			V[N - 1] = dp[N - 1]; for (i = N - 2; i >= 0; i--) V[i] = dp[i] - cp[i] * V[i + 1];
			cab.t += dt;
		};
		/* settle the passive/active mix at rest */
		return cab;
	}
	/* Run the cable: stimulate the first compartment (current in uA, 0.2 ms pulse), record V at every compartment every `every` steps and the
	   time each compartment first crosses -20 mV. */
	function runCable(opt, tEnd, dt) {
		var c = cable(opt), N = c.N; dt = dt || 0.01; tEnd = tEnd || 10;
		var steps = Math.round(tEnd / dt), every = opt.every || 5, frames = [], cross = new Float64Array(N).fill(NaN), peak = new Float64Array(N).fill(-200);
		var Ist = opt.stim == null ? (c.myelin ? 0.02 : 1.5) : opt.stim;
		for (var s = 0; s < steps; s++) {
			var t = s * dt; c.step(dt, t >= 0.2 && t < 0.4 ? Ist : 0, 0);
			for (var i = 0; i < N; i++) { var v = c.V[i]; if (v > peak[i]) peak[i] = v; if (isNaN(cross[i]) && v > -20) cross[i] = c.t; }
			if (s % every === 0) frames.push(Float32Array.from(c.V));
		}
		return { cable: c, frames: frames, dtFrame: dt * every, cross: cross, peak: peak, tEnd: tEnd };
	}
	/* conduction speed (m/s) between two fractions of the length (by -20 mV crossing). cm/ms * 10 = m/s */
	function speedOf(run, f1, f2) {
		var c = run.cable, list = [];
		for (var i = 0; i < c.N; i++) if (c.comp[i].active) list.push(i);
		var i1 = list[Math.round((list.length - 1) * f1)], i2 = list[Math.round((list.length - 1) * f2)];
		var t1 = run.cross[i1], t2 = run.cross[i2];
		if (isNaN(t1) || isNaN(t2) || t2 <= t1) return null;
		return (c.comp[i2].x - c.comp[i1].x) / (t2 - t1) * 10;
	}
	/* did the impulse reach the far end? */
	function reached(run) { var c = run.cable; for (var i = c.N - 1; i >= 0; i--) if (c.comp[i].active) return !isNaN(run.cross[i]) && run.peak[i] > 0; return false; }

	/* Human fibre speed laws (approximate). Myelinated: Hursh (1939) ~6 m/s per um of outer diameter. Unmyelinated: speed grows with the square root of the
	   diameter, ~1.5 m/s at 1 um (C fibres 0.4-1.2 um conduct about 0.5-2 m/s). */
	function humanSpeed(dUm, myelin) { return myelin ? 6 * dUm : 1.5 * Math.sqrt(dUm); }
	var FIBRES = [
		{ id: "Aa", name: "A-alpha (Ia, motor)", d: [12, 20], v: [70, 120], my: true, does: "muscle spindles, motor nerves to skeletal muscle" },
		{ id: "Ab", name: "A-beta (II)", d: [6, 12], v: [35, 75], my: true, does: "touch, pressure, vibration" },
		{ id: "Ag", name: "A-gamma", d: [3, 6], v: [15, 30], my: true, does: "motor to muscle spindles" },
		{ id: "Ad", name: "A-delta (III)", d: [1, 5], v: [5, 30], my: true, does: "sharp first pain, cold" },
		{ id: "B", name: "B (preganglionic autonomic)", d: [1, 3], v: [3, 15], my: true, does: "autonomic preganglionic" },
		{ id: "C", name: "C (IV)", d: [0.2, 1.5], v: [0.5, 2], my: false, does: "slow burning pain, warmth, itch, autonomic postganglionic" }
	];
	function fibreOf(dUm, myelin) {
		for (var i = 0; i < FIBRES.length; i++) { var f = FIBRES[i]; if (f.my === !!myelin && dUm >= f.d[0] && dUm <= f.d[1]) return f; }
		return null;
	}

	/* ------------------------------------------------------------------ 3. Synapses */
	/* Conductance-based integrate-and-fire soma: C dV/dt = -gL(V-EL) - gE(V-EE) - gI(V-EI). tau_m 20 ms, rest -70, threshold -55 (axon hillock), reset -70, 2 ms refractory.
	   Synaptic conductance (relative to gL) after each release: difference of exponentials, AMPA rise 0.5 decay 3 ms, GABA-A rise 0.5 decay 8 ms. Distance on the dendrite
	   attenuates by exp(-x/lambda), lambda = 300 um (passive dendrite, illustrative). */
	var SYN = { tau: 20, EL: -70, EE: 0, EI: -75, Vth: -55, Vreset: -70, ref: 2, lam: 300 };
	function synKernel(t, rise, decay) { if (t < 0) return 0; var tp = rise * decay / (decay - rise) * Math.log(decay / rise), nf = Math.exp(-tp / decay) - Math.exp(-tp / rise); return (Math.exp(-t / decay) - Math.exp(-t / rise)) / nf; }
	function Neuron(o) {
		o = o || {}; this.V = SYN.EL; this.t = 0; this.refUntil = -1; this.events = []; this.spikes = []; this.w = o.w || 0.6; this.gE = 0; this.gI = 0;
	}
	/* add a release at time t: kind "E" or "I", weight (peak conductance / gL), distance um */
	Neuron.prototype.input = function (kind, weight, dist, t) { this.events.push({ k: kind, g: weight * Math.exp(-(dist || 0) / SYN.lam), t: t == null ? this.t : t }); };
	Neuron.prototype.step = function (dt) {
		var gE = 0, gI = 0, keep = [], t = this.t;
		for (var i = 0; i < this.events.length; i++) { var e = this.events[i], age = t - e.t; if (age > 80) continue; keep.push(e); if (e.k === "E") gE += e.g * synKernel(age, 0.5, 3); else gI += e.g * synKernel(age, 0.5, 8); }
		this.events = keep; this.gE = gE; this.gI = gI;
		var spiked = false;
		if (t < this.refUntil) this.V = SYN.Vreset;
		else {
			var dV = (-(this.V - SYN.EL) - gE * (this.V - SYN.EE) - gI * (this.V - SYN.EI)) / SYN.tau;
			this.V += dt * dV;
			if (this.V >= SYN.Vth) { this.spikes.push(t); this.V = SYN.Vreset; this.refUntil = t + SYN.ref; spiked = true; }
		}
		this.t += dt; return spiked;
	};
	/* single EPSP size at the soma (mV) for a weight and distance, by simulation */
	function psp(kind, weight, dist) { var n = new Neuron(); n.input(kind, weight, dist, 0); var best = 0; for (var i = 0; i < 6000; i++) { n.step(0.01); best = kind === "E" ? Math.max(best, n.V - SYN.EL) : Math.min(best, n.V - SYN.EL); } return best; }

	/* Neuromuscular junction (illustrative, numbers chosen to match the textbook picture: safety factor ~3-4, normal train-of-four ratio ~1, myasthenia decrement).
	   Each nerve impulse releases p x pool quanta; the pool refills with tau 1.5 s; facilitation adds to p and fades with tau 60 ms.
	   Endplate potential (mV) = quanta x quantal size x fraction of free receptors x AChE factor, saturating towards the ACh reversal (~ -5 mV, from -85 mV rest).
	   A population of 200 muscle fibres with spread-out thresholds gives the twitch (fraction of fibres whose EPP crosses its threshold). */
	var NMJ_COND = {
		normal: { p: 0.2, rec: 1, q: 1, ache: 1, name: "Normal" },
		ache: { p: 0.2, rec: 1, q: 1, ache: 1.8, name: "AChE inhibitor (e.g. neostigmine)" },
		mg: { p: 0.2, rec: 0.4, q: 1, ache: 1, name: "Myasthenia gravis (about 60% fewer working receptors)" },
		mgache: { p: 0.2, rec: 0.4, q: 1, ache: 1.8, name: "Myasthenia gravis + AChE inhibitor" },
		roc: { p: 0.2, rec: 0.25, q: 1, ache: 1, name: "Non-depolarising blocker (e.g. rocuronium, partial)" },
		lems: { p: 0.04, rec: 1, q: 1, ache: 1, name: "Lambert-Eaton (less release)" }
	};
	function nmjTrain(cond, freqHz, n, opt) {
		opt = opt || {}; var c = typeof cond === "string" ? NMJ_COND[cond] : cond, pool = 1, fac = 0, last = null, out = [];
		var Q0 = opt.quanta || 300, qmv = opt.qmv || 1.2, tauRec = 1500, tauF = 60, dF = c.p < 0.1 ? 0.045 : 0.01;
		for (var k = 0; k < n; k++) {
			var t = k * 1000 / freqHz;
			if (last != null) { var dt = t - last; fac *= Math.exp(-dt / tauF); pool = 1 - (1 - pool) * Math.exp(-dt / (tauRec / (1 + 300 * fac))); }   /* residual calcium speeds up refilling at high rates (mobilisation) */
			var p = Math.min(0.9, c.p + fac), Q = Q0 * p * pool;
			pool -= p * pool; fac += dF;
			var drive = Q * qmv * c.rec * c.ache, epp = 80 * drive / (drive + 80); /* saturates at 80 mV above rest */
			out.push({ t: t, quanta: Q, epp: epp, twitch: twitchFrac(epp) });
			last = t;
		}
		return out;
	}
	/* fibres need an EPP of 10-20 mV to fire (normal EPP ~ 38 mV here: a safety factor of about 2-4) */
	function twitchFrac(epp) { var lo = 10, hi = 20; return Math.max(0, Math.min(1, (epp - lo) / (hi - lo))); }

	/* ------------------------------------------------------------------ 4. Nernst / GHK */
	function nernst(z, out, inn, TC) { if (!(out > 0) || !(inn > 0) || !z) return NaN; return rtf(TC == null ? 37 : TC) / z * Math.log(out / inn); }
	/* c = {Ko, Ki, Nao, Nai, Clo, Cli}, p = {K, Na, Cl} relative permeabilities */
	function ghk(c, p, TC) {
		var num = p.K * c.Ko + p.Na * c.Nao + p.Cl * c.Cli, den = p.K * c.Ki + p.Na * c.Nai + p.Cl * c.Clo;
		if (!(num > 0) || !(den > 0)) return NaN; return rtf(TC == null ? 37 : TC) * Math.log(num / den);
	}
	var ION_PRESETS = {
		neuron: { name: "Mammalian neuron (normal)", T: 37, c: { Ko: 4, Ki: 140, Nao: 145, Nai: 12, Clo: 110, Cli: 10, Cao: 2.5, Cai: 0.0001 }, p: { K: 1, Na: 0.04, Cl: 0.45 } },
		hyperK: { name: "Hyperkalaemia (K 7 mmol/L)", T: 37, c: { Ko: 7, Ki: 140, Nao: 145, Nai: 12, Clo: 110, Cli: 10, Cao: 2.5, Cai: 0.0001 }, p: { K: 1, Na: 0.04, Cl: 0.45 } },
		severeK: { name: "Severe hyperkalaemia (K 9 mmol/L)", T: 37, c: { Ko: 9, Ki: 140, Nao: 145, Nai: 12, Clo: 110, Cli: 10, Cao: 2.5, Cai: 0.0001 }, p: { K: 1, Na: 0.04, Cl: 0.45 } },
		hypoK: { name: "Hypokalaemia (K 2.5 mmol/L)", T: 37, c: { Ko: 2.5, Ki: 140, Nao: 145, Nai: 12, Clo: 110, Cli: 10, Cao: 2.5, Cai: 0.0001 }, p: { K: 1, Na: 0.04, Cl: 0.45 } },
		hypoNa: { name: "Hyponatraemia (Na 120 mmol/L)", T: 37, c: { Ko: 4, Ki: 140, Nao: 120, Nai: 12, Clo: 90, Cli: 10, Cao: 2.5, Cai: 0.0001 }, p: { K: 1, Na: 0.04, Cl: 0.45 } },
		muscle: { name: "Skeletal muscle fibre", T: 37, c: { Ko: 4, Ki: 155, Nao: 145, Nai: 12, Clo: 123, Cli: 4.2, Cao: 2.5, Cai: 0.0001 }, p: { K: 1, Na: 0.01, Cl: 2 } },
		squid: { name: "Squid giant axon (HH, 6.3 °C)", T: 6.3, c: { Ko: 20, Ki: 400, Nao: 440, Nai: 50, Clo: 560, Cli: 52, Cao: 10, Cai: 0.0001 }, p: { K: 1, Na: 0.04, Cl: 0.45 } }
	};

	var api = { HH: HH, rtf: rtf, rates: rates, inf: inf, phiOf: phiOf, ekShift: ekShift, params: params, deriv: deriv, rk4: rk4, rest: rest, stimAt: stimAt, simulate: simulate, analyse: analyse,
		threshold: threshold, secondThreshold: secondThreshold, vclamp: vclamp, CAB: CAB, cable: cable, runCable: runCable, speedOf: speedOf, reached: reached, humanSpeed: humanSpeed,
		FIBRES: FIBRES, fibreOf: fibreOf, SYN: SYN, synKernel: synKernel, Neuron: Neuron, psp: psp, NMJ_COND: NMJ_COND, nmjTrain: nmjTrain, twitchFrac: twitchFrac,
		nernst: nernst, ghk: ghk, ION_PRESETS: ION_PRESETS };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESNeuro = api;
})(this);
