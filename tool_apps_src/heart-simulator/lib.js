/* MES Heart Simulator maths (pure; node: require('./tool_apps_src/heart-simulator/lib.js'), tests: node tool_apps_src/heart-simulator-tests.js).
   1. Circulation: a lumped (0-D) model of the left heart and the body.
      - Left ventricle and left atrium = time-varying elastance (Suga & Sagawa): P = e(t) Ees (V - V0) + (1 - e(t)) P_ED(V), with the
        exponential end-diastolic pressure-volume relation P_ED = A (exp(B (V - V0)) - 1). e(t) = the "double Hill" curve of
        Stergiopulos, Meister & Westerhof (1996), with time to peak Tmax = 0.32 √(RR / 0.8) s, which keeps electromechanical systole (QS2) close to Weissler's 546 - 2.1 HR ms.
      - Valves: ΔP = R Q + K Q|Q|, with K from the simplified Bernoulli law ΔP = 4 v² (v in m/s), so K = 1 / (2500 A²) for an opening of A cm².
        A leaking valve lets blood back through a hole of A_leak cm²: Q = 50 A_leak √ΔP (the same law). The aortic valve flow has inertance,
        so a little blood flows back before the valve shuts (that makes the dicrotic notch, and S2).
      - Arteries = 3-element Windkessel (Zc, C, R = SVR); veins + lungs + right heart = one big compliant pool that fills the left atrium.
      Units: ml, mmHg, s.
   2. ECG: lead II drawn as a sum of Gaussian waves per beat (McSharry et al. 2003 style), with a beat-by-beat rhythm generator for
      sinus rhythms, AF, flutter, SVT, AV blocks, PVCs, VT, VF, asystole, STEMI, hyperkalaemia and long QT.
   3. Bedside formulas: BSA, MAP, CO, CI, SVR, PVR, oxygen content / delivery, QTc. */
(function (root) {
	"use strict";
	var H = {};

	/* ---------------- 1. circulation ---------------- */
	H.hill = function (tn) { if (tn <= 0) return 0; var a = Math.pow(tn / 0.7, 1.9), b = Math.pow(tn / 1.17, 21.9); return 1.55 * (a / (1 + a)) * (1 / (1 + b)); };
	H.DEFAULTS = {
		hr: 75,            // beats per minute
		ees: 2.5,          // LV end-systolic elastance (contractility), mmHg/ml
		v0: 10,            // LV volume at zero end-systolic pressure, ml
		edA: 0.3,          // EDPVR scale, mmHg
		edB: 0.03,         // EDPVR stiffness, 1/ml (higher = stiffer ventricle)
		svr: 0.9,          // systemic vascular resistance, mmHg·s/ml (1 mmHg·s/ml = 1333 dyn·s·cm⁻⁵)
		ca: 1.6,           // arterial compliance, ml/mmHg
		zc: 0.04,          // aortic characteristic impedance, mmHg·s/ml
		vol: 660,          // "stressed" blood volume shared by heart, arteries and the venous pool, ml (the preload knob)
		ava: 3.5,          // aortic valve area, cm²
		mva: 4.5,          // mitral valve area, cm²
		mr: 0,             // mitral regurgitant orifice, cm²
		ar: 0,             // aortic regurgitant orifice, cm²
		laKick: 1          // atrial contraction strength (0 = atrial fibrillation: no atrial kick)
	};
	var CV = 40, RVEN = 0.02, LAE = 0.12, LAV0 = 5, LAEA = 0.32, LAV = 0.11, RAV = 0.003, RMV = 0.002, LAO = 0.0006;
	H.prInterval = function (hr) { return Math.max(0.11, Math.min(0.2, 0.16 - 0.0004 * (hr - 75))); };
	H.params = function (o) { var p = {}, k; for (k in H.DEFAULTS) p[k] = H.DEFAULTS[k]; if (o) for (k in o) if (o[k] != null && isFinite(o[k])) p[k] = +o[k]; return p; };
	H.edpvr = function (p, V) { return p.edA * (Math.exp(p.edB * (V - p.v0)) - 1); };
	H.espvr = function (p, V) { return p.ees * (V - p.v0); };
	function valveK(a) { return a > 0 ? 1 / (2500 * a * a) : 1e9; }
	function fwd(dp, R, K) { if (dp <= 0) return 0; return K < 1e-12 ? dp / R : (-R + Math.sqrt(R * R + 4 * K * dp)) / (2 * K); }   // solve R Q + K Q² = ΔP
	function leak(dp, a) { if (a <= 0 || dp <= 0) return 0; return dp < 1 ? 50 * a * dp : 50 * a * Math.sqrt(dp); }
	function timing(p) {
		var T = 60 / p.hr, pr = H.prInterval(p.hr);
		return { T: T, tmax: 0.32 * Math.sqrt(T / 0.8), pr: pr, a0: T - pr + 0.03, adur: Math.min(0.14, 0.18 * T + 0.02) };
	}
	H.timing = timing;
	function eV(tm, t) { return H.hill(t / tm.tmax); }
	function eA(tm, t, p) { var x = t - tm.a0; if (x < 0) x += tm.T; if (x > tm.adur) return 0; return p.laKick * Math.pow(Math.sin(Math.PI * x / tm.adur), 2); }
	function pLV(p, V, e) { return e * p.ees * (V - p.v0) + (1 - e) * H.edpvr(p, V); }
	function pLA(V, ea) { return (LAE + (LAEA - LAE) * ea) * (V - LAV0); }

	/* run the model to a steady state and record the last beat; o.beats = how many to run at most */
	H.simulate = function (pin, o) {
		o = o || {};
		var p = H.params(pin), tm = timing(p), dt = o.dt || 0.00025, T = tm.T, nb = o.beats || 60;
		var Kav = valveK(p.ava), Kmv = valveK(p.mva);
		/* state: LV volume, LA volume, arterial (compliance) pressure, venous pool stressed volume, aortic valve flow + open flag */
		var s = o.state ? o.state.slice() : [120, 55, 85, 0, 0, 0];
		if (!o.state) s[3] = p.vol - s[0] - s[1] - s[2] * p.ca;
		var rec = null, prevEdv = -1, beat = 0, closeVol = 0, steady = false, beats = [];
		var volFn = o.volFn || null, rvenFn = o.rvenFn || null, rven = RVEN;   // optional per-beat blood volume change / inflow obstruction (caval occlusion)
		function deriv(t, x, out) {
			var e = eV(tm, t), ea = eA(tm, t, p);
			var plv = pLV(p, x[0], e), pla = pLA(x[1], ea), pv = x[3] / CV;
			var qmv = fwd(pla - plv, RMV, Kmv) - leak(plv - pla, p.mr);
			var qav = x[5] ? x[4] : 0, qar = x[5] ? 0 : leak(x[2] - plv, p.ar);
			var qs = (x[2] - pv) / p.svr, qven = (pv - pla) / rven;
			out[0] = qmv - qav + qar; out[1] = qven - qmv; out[2] = (qav - qar - qs) / p.ca; out[3] = qs - qven;
			out[4] = x[5] ? (plv - x[2] - (p.zc + RAV) * x[4] - Kav * x[4] * Math.abs(x[4])) / LAO : 0; out[5] = 0;
			return { plv: plv, pla: pla, pv: pv, qmv: qmv, qav: qav, qar: qar, pao: x[2] + p.zc * qav, e: e, ea: ea, qs: qs, qven: qven };
		}
		var k1 = [0, 0, 0, 0, 0, 0], k2 = [0, 0, 0, 0, 0, 0], mid = [0, 0, 0, 0, 0, 0];
		for (beat = 0; beat < nb; beat++) {
			var last = (o.record === "all") || steady || beat === nb - 1;
			var r = last ? { t: [], plv: [], pao: [], pla: [], vlv: [], vla: [], qmv: [], qav: [], pv: [], e: [], ea: [] } : null;
			var vmin = 1e9, vmax = -1, ev = { mc: -1, ao: -1, ac: -1, mo: -1 }, wasMv = true, wasAv = false, avMax = 0, mvSum = 0, grad = 0, gradN = 0, mvGrad = 0, mvGradN = 0, regurg = 0, arRegurg = 0, fwdAo = 0, laSum = 0, aoMax = -1, aoMin = 1e9, aoSum = 0, n = 0;
			var plvStart = 0, edv = s[0], esv = s[0], esp = 0, edp = 0, sw = 0, pPrev = null, vPrev = null, plvMax = 0, eaw = 0;
			var steps = Math.round(T / dt), every = Math.max(1, Math.round(0.002 / dt));
			if (volFn) { var dv = volFn(beat); s[3] += dv; }
			rven = rvenFn ? RVEN * rvenFn(beat) : RVEN;
			for (var i = 0; i < steps; i++) {
				var t = i * dt;
				/* valve opening is decided at the start of each step */
				var e0 = eV(tm, t), plv0 = pLV(p, s[0], e0);
				if (!s[5] && plv0 > s[2]) { s[5] = 1; s[4] = 0; closeVol = 0; if (ev.ao < 0 && t < tm.tmax * 1.5) ev.ao = t; }
				var open0 = s[5];
				var d = deriv(t, s, k1);
				for (var j = 0; j < 5; j++) mid[j] = s[j] + 0.5 * dt * k1[j]; mid[5] = s[5];
				deriv(t + 0.5 * dt, mid, k2);
				for (j = 0; j < 5; j++) s[j] += dt * k2[j];
				if (s[5] && s[4] < 0) { closeVol += -s[4] * dt; if (closeVol > 1.2) { s[5] = 0; s[4] = 0; } }
				if (open0 && !s[5] && ev.ao >= 0 && ev.ac < 0) ev.ac = t;
				/* bookkeeping */
				var mvOpen = d.qmv > 0.5;
				if (i === 0) plvStart = d.plv;
				if (ev.mc < 0 && ev.ao < 0 && d.plv > d.pla && d.plv > plvStart + 1) ev.mc = t;
				if (!wasMv && mvOpen && ev.mo < 0 && ev.ac >= 0) ev.mo = t;
				wasMv = mvOpen;
				if (s[0] > vmax) { vmax = s[0]; }
				if (s[0] < vmin) { vmin = s[0]; esv = s[0]; esp = d.plv; }
				if (d.plv > plvMax) plvMax = d.plv;
				if (d.qav > 0) { fwdAo += d.qav * dt; if (d.plv > d.pao) { grad += d.plv - d.pao; gradN++; } }
				if (d.qmv > 0) { mvSum += d.qmv * dt; mvGrad += d.pla - d.plv; mvGradN++; }
				if (d.qmv < 0) regurg += -d.qmv * dt;
				if (d.qar > 0) arRegurg += d.qar * dt;
				laSum += d.pla; aoSum += d.pao; n++; if (d.pao > aoMax) aoMax = d.pao; if (d.pao < aoMin) aoMin = d.pao;
				if (pPrev !== null) sw += 0.5 * (d.plv + pPrev) * (s[0] - vPrev);
				pPrev = d.plv; vPrev = s[0];
				if (i === 0) { edv = s[0]; edp = d.plv; }
				if (r && i % every === 0) { r.t.push(t); r.plv.push(d.plv); r.pao.push(d.pao); r.pla.push(d.pla); r.vlv.push(s[0]); r.vla.push(s[1]); r.qmv.push(d.qmv); r.qav.push(d.qav - d.qar); r.pv.push(d.pv); r.e.push(d.e); r.ea.push(d.ea); }
			}
			/* end-diastolic = the largest volume (just before the ventricle starts to squeeze) */
			edv = vmax; edp = H.edpvr(p, vmax);
			var res = { edv: edv, esv: esv, sv: edv - esv, ef: (edv - esv) / edv, esp: esp, edp: edp, sw: -sw, plvMax: plvMax, sbp: aoMax, dbp: aoMin, map: aoSum / n,
				la: laSum / n, fwdSv: fwdAo, mrVol: regurg, arVol: arRegurg, avGrad: gradN ? grad / gradN : 0, mvGrad: mvGradN ? mvGrad / mvGradN : 0, ev: ev, T: T, tm: tm };
			res.netSv = res.fwdSv - res.arVol;
			res.co = res.netSv * p.hr / 1000; res.ea = res.esp / Math.max(1, res.sv); res.rf = res.sv > 0 ? (res.mrVol + res.arVol) / Math.max(1, res.fwdSv + res.mrVol) : 0;
			if (o.record === "all") { res.rec = r; beats.push(res); }
			if (r && (steady || beat === nb - 1) && o.record !== "all") { res.rec = r; res.p = p; res.state = s.slice(); res.beats = beat + 1; return res; }
			if (!o.record && prevEdv > 0 && Math.abs(edv - prevEdv) < 0.05 && beat > 8) steady = true;
			prevEdv = edv;
		}
		return { beats: beats, p: p, state: s.slice() };
	};
	/* end-systole = the corner where the loop touches the ESPVR; mitral closure etc. come from the valve flows */
	H.phases = function (b) {
		var ev = b.ev, T = b.T, tm = b.tm, a0 = tm.a0 % T;
		return [
			{ id: "ivc", name: "Isovolumic contraction", a: ev.mc, b: ev.ao },
			{ id: "ej", name: "Ejection", a: ev.ao, b: ev.ac },
			{ id: "ivr", name: "Isovolumic relaxation", a: ev.ac, b: ev.mo },
			{ id: "rf", name: "Rapid filling", a: ev.mo, b: Math.min(a0, ev.mo + 0.12 + 0.05 * (T - 0.8)) },
			{ id: "dia", name: "Diastasis", a: Math.min(a0, ev.mo + 0.12 + 0.05 * (T - 0.8)), b: a0 },
			{ id: "as", name: "Atrial contraction", a: a0, b: T + Math.max(0, ev.mc) }
		];
	};
	/* simple bedside "rules of thumb" for extra heart sounds, from the simulated numbers (not acoustics) */
	H.extraSounds = function (b, p) {
		return { s3: b.ef < 0.4 && b.edp > 14 || p.mr >= 0.3, s4: p.laKick > 0.2 && (p.edB >= 0.045 || p.ava < 1.2) };
	};
	H.PRESETS = [
		{ id: "normal", name: "Normal", p: {}, note: "A healthy resting adult: about 120 ml in the ventricle before it squeezes, 50 ml left after, so stroke volume ≈ 70 ml and ejection fraction ≈ 60%. Blood pressure about 120/80." },
		{ id: "hfref", name: "Heart failure, reduced EF", p: { ees: 0.8, v0: 40, edB: 0.022, vol: 900, hr: 90, svr: 1.15 }, note: "A weak ventricle (low Ees, a flatter ESPVR line). Over months the ventricle stretches (remodelling: both curves move right) and the body holds on to fluid, so the heart is big and the filling pressure is high: the loop sits far to the right. EF falls below 40%." },
		{ id: "hfpef", name: "Heart failure, preserved EF", p: { edB: 0.055, edA: 0.5, ees: 3.2, vol: 850, svr: 1.35, hr: 78 }, note: "A stiff ventricle (a steep EDPVR curve). It still squeezes well, so EF is normal, but it needs a high pressure to fill: the bottom of the loop rides up the curve." },
		{ id: "as", name: "Aortic stenosis (severe)", p: { ava: 0.75, ees: 3.2, edB: 0.04, vol: 760 }, note: "A narrow aortic valve (0.75 cm²). The ventricle must make a much higher pressure than the aorta to push blood through, so the loop is tall. Severe means area < 1 cm², mean gradient > 40 mmHg (ACC/AHA)." },
		{ id: "ms", name: "Mitral stenosis", p: { mva: 1.0, vol: 950, hr: 80 }, note: "A narrow mitral valve (1.0 cm²). The left atrium must push hard to fill the ventricle: high atrial pressure, a small ventricle and a smaller stroke volume." },
		{ id: "mr", name: "Mitral regurgitation (severe)", p: { mr: 0.45, vol: 860, svr: 1.0 }, note: "A leaking mitral valve (regurgitant hole 0.45 cm²). Part of each squeeze goes back into the atrium, so there is no true isovolumic contraction: the loop leans. Severe = hole ≥ 0.4 cm², regurgitant volume ≥ 60 ml." },
		{ id: "ar", name: "Aortic regurgitation (severe)", p: { ar: 0.35, vol: 900, edB: 0.02, edA: 0.3 }, note: "A leaking aortic valve. Blood flows back from the aorta in diastole, so the ventricle fills from both ends and becomes large; the diastolic pressure falls and the pulse pressure is wide." },
		{ id: "ex", name: "Exercise", p: { hr: 150, ees: 4.5, svr: 0.35, vol: 950, ca: 1.3 }, note: "Heart rate up, stronger squeeze (higher Ees) and wide-open muscle arteries (lower SVR): the loop gets wider to the left and the cardiac output roughly doubles (fit athletes reach 4 to 6 times rest)." },
		{ id: "dob", name: "Dobutamine", p: { hr: 95, ees: 3.6, svr: 0.8 }, note: "A drug that makes the heart squeeze harder (inotrope) and a little faster, and opens arteries slightly: smaller end-systolic volume, higher EF." },
		{ id: "af", name: "Atrial fibrillation", p: { laKick: 0, hr: 110 }, note: "The atria only quiver, so the 'atrial kick' at the end of filling is gone, and the rate is fast: less filling, lower stroke volume. (The real rhythm is also irregular: see the ECG tab.)" },
		{ id: "hem", name: "Blood loss", p: { vol: 480, ees: 3.0, hr: 115, svr: 1.3 }, note: "Low blood volume: the heart fills less (small EDV), so stroke volume falls (Frank-Starling). The body raises the heart rate and tightens the arteries to hold the pressure up." }
	];
	/* caval occlusion: take blood out of the venous pool beat by beat; returns one loop per beat (the classic way to measure the ESPVR) */
	H.cavalOcclusion = function (pin, o) {
		o = o || {}; var base = H.simulate(pin), n = o.beats || 10, f = o.factor || 25;   // the inflow to the heart is squeezed off over n beats (like a balloon in the vena cava)
		var r = H.simulate(pin, { state: base.state, beats: n, record: "all", rvenFn: function (k) { return Math.pow(f, k / (n - 1)); } });
		return r.beats;
	};
	/* end-systolic points of a set of loops -> least squares line P = slope (V - V0) */
	H.fitLine = function (pts) {
		var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0; pts.forEach(function (q) { sx += q[0]; sy += q[1]; sxx += q[0] * q[0]; sxy += q[0] * q[1]; });
		var m = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - m * sx) / n; return { slope: m, v0: -c / m };
	};

	/* ---------------- 2. ECG (lead II) ---------------- */
	function rng(seed) { var a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	H.rng = rng;
	H.qtFor = function (rr, qtc) { return (qtc || 0.40) * Math.sqrt(rr); };   // a normal QT for a given RR (Bazett, QTc 400 ms)
	/* waves of one ventricular complex, times relative to QRS onset (s), amplitudes mV */
	H.complex = function (b) {
		var w = [], d = b.qrs || 0.09, qt = b.qt || 0.4, ta = b.ta == null ? 0.3 : b.ta;
		if (b.m === "w") {   /* wide, ventricular: broad monophasic QRS, discordant T */
			w.push({ c: 0.35 * d, a: (b.ra || 1.3), s: 0.2 * d }); w.push({ c: 0.7 * d, a: -(b.ra || 1.3) * 0.45, s: 0.17 * d });
			w.push({ c: qt - 0.12, a: b.ta == null ? -0.45 : b.ta, s: 0.055 });
		} else {
			var k = d / 0.09;
			w.push({ c: 0.016 * k, a: -0.08, s: 0.006 * k }); w.push({ c: 0.04 * k, a: b.ra || 1.15, s: 0.0085 * k }); w.push({ c: 0.066 * k, a: -0.22, s: 0.008 * k });
			if (b.st) w.push({ c: d + 0.07, a: b.st, s: 0.05 });
			w.push({ c: qt - (b.tw ? 2.4 * b.tw : 0.11), a: ta, s: b.tw || 0.045 });
		}
		return w;
	};
	H.pwave = function (pa) { return [{ c: 0.045, a: pa == null ? 0.15 : pa, s: 0.02 }]; };   // relative to P onset
	function gsum(waves, t0, t) { var y = 0; for (var i = 0; i < waves.length; i++) { var x = (t - t0 - waves[i].c) / waves[i].s; if (x > -6 && x < 6) y += waves[i].a * Math.exp(-0.5 * x * x); } return y; }
	H.gsum = gsum;
	H.RHYTHMS = [
		{ id: "sinus", name: "Normal sinus rhythm", grp: "Sinus", hint: "Regular, 60-100 per minute, every P followed by a QRS, PR 120-200 ms, narrow QRS." },
		{ id: "brady", name: "Sinus bradycardia", grp: "Sinus", hint: "Sinus rhythm slower than 60 per minute." },
		{ id: "tachy", name: "Sinus tachycardia", grp: "Sinus", hint: "Sinus rhythm faster than 100 per minute: P waves still there, sometimes riding on the T." },
		{ id: "af", name: "Atrial fibrillation", grp: "Atrial", hint: "Irregularly irregular, no P waves, a wavy (fibrillating) baseline." },
		{ id: "flutter", name: "Atrial flutter (4:1)", grp: "Atrial", hint: "Sawtooth flutter waves at about 300 per minute; here every 4th one is conducted (ventricles at 75)." },
		{ id: "svt", name: "SVT (AV nodal re-entry)", grp: "Atrial", hint: "Regular narrow-complex tachycardia, 150-250 per minute, no visible P waves." },
		{ id: "avb1", name: "1st degree AV block", grp: "AV block", hint: "Every P conducted, but PR > 200 ms (here 280 ms)." },
		{ id: "mob1", name: "2nd degree, Mobitz I (Wenckebach)", grp: "AV block", hint: "PR gets longer each beat until one P is not conducted (a dropped QRS), then the cycle restarts." },
		{ id: "mob2", name: "2nd degree, Mobitz II", grp: "AV block", hint: "PR stays the same, then suddenly a P with no QRS. Often a wide QRS. Can progress to complete block." },
		{ id: "avb3", name: "3rd degree (complete) AV block", grp: "AV block", hint: "P waves and QRS complexes march at their own rates (AV dissociation); slow, often wide escape rhythm." },
		{ id: "pvc", name: "Sinus rhythm with PVCs", grp: "Ventricular", hint: "Early, wide, odd-shaped beats with no P wave and a T pointing the other way, followed by a compensatory pause." },
		{ id: "vt", name: "Ventricular tachycardia", grp: "Ventricular", hint: "Regular wide-complex tachycardia, usually 120-250 per minute, no P waves you can link to the QRS." },
		{ id: "vf", name: "Ventricular fibrillation", grp: "Ventricular", hint: "Chaotic waves of changing size and shape, no QRS at all. No pulse: defibrillate." },
		{ id: "asys", name: "Asystole", grp: "Ventricular", hint: "A (nearly) flat line. Check the leads and gain before you believe it." },
		{ id: "stemi", name: "Inferior STEMI (ST elevation in II)", grp: "Other", hint: "ST segment raised above the baseline (≥ 1 mm in two contiguous leads); lead II looks at the inferior wall." },
		{ id: "hyperk", name: "Hyperkalaemia", grp: "Other", hint: "Tall, narrow, peaked T waves; flat P waves, longer PR and a wider QRS as potassium rises." },
		{ id: "longqt", name: "Long QT", grp: "Other", hint: "QT too long for the rate (QTc > 450 ms in men, > 460 ms in women; > 500 ms is high risk)." }
	];
	/* a rhythm generator: g.until(t) makes beats up to time t; g.at(t) = voltage (mV); g.truth = the answers for the calipers / quiz */
	H.rhythm = function (id, seed) {
		var R = rng(seed || 7), beats = [], ps = [], tA = 0.3, tV = 0, k = 0, hrv = 0.012;
		var base = { mod: 0 }, cfg = { rate: 75, pr: 0.16, qrs: 0.09, qtc: 0.40 };
		var fib = [];
		if (id === "brady") cfg.rate = 46; if (id === "tachy") cfg.rate = 125; if (id === "avb1") cfg.pr = 0.28;
		if (id === "stemi") { cfg.rate = 80; cfg.st = 0.28; cfg.ta = 0.5; } if (id === "hyperk") { cfg.rate = 68; cfg.pr = 0.21; cfg.qrs = 0.12; cfg.pa = 0.05; cfg.ta = 0.95; cfg.tw = 0.028; cfg.qtc = 0.38; }
		if (id === "longqt") { cfg.rate = 62; cfg.qtc = 0.56; cfg.ta = 0.28; cfg.tw = 0.06; }
		if (id === "mob2") cfg.qrs = 0.13;
		if (id === "af" || id === "vf") for (var f = 0; f < 4; f++) fib.push({ f: (id === "vf" ? 3.8 : 5.2) + R() * (id === "vf" ? 2.2 : 3), ph: R() * 6.283, a: id === "vf" ? 0.25 + R() * 0.25 : 0.025 + R() * 0.02 });
		var truth = { id: id, rate: cfg.rate, pr: cfg.pr, qrs: cfg.qrs, qt: null, regular: true, pRate: null };
		var rr0 = 60 / cfg.rate;
		truth.qt = H.qtFor(rr0, cfg.qtc); truth.pRate = cfg.rate;
		if (id === "af") { truth.rate = 105; truth.pr = null; truth.regular = false; truth.pRate = null; truth.qt = null; }
		if (id === "flutter") { truth.rate = 75; truth.pr = null; truth.pRate = 300; truth.qt = H.qtFor(0.8); }
		if (id === "svt") { truth.rate = 180; truth.pr = null; truth.pRate = null; truth.qt = H.qtFor(60 / 180); }
		if (id === "mob1") { truth.pr = [0.16, 0.26, 0.31]; truth.regular = false; truth.rate = 75 * 3 / 4; }
		if (id === "mob2") { truth.regular = false; truth.rate = 75 * 2 / 3; }
		if (id === "avb3") { truth.rate = 36; truth.pRate = 80; truth.pr = null; truth.qrs = 0.14; truth.qt = H.qtFor(60 / 36, 0.42); }
		if (id === "pvc") { truth.regular = false; }
		if (id === "vt") { truth.rate = 170; truth.pr = null; truth.pRate = null; truth.qrs = 0.16; truth.qt = 0.30; }
		if (id === "vf" || id === "asys") { truth.rate = 0; truth.pr = null; truth.qrs = null; truth.qt = null; truth.pRate = null; truth.regular = false; }
		function addV(t, b) { b.t = t; beats.push(b); }
		function sinusNext() {   /* one atrial beat + its conducted QRS, with the rhythm's conduction rule */
			var rr = 60 / cfg.rate * (1 + hrv * (R() * 2 - 1)), pr = cfg.pr, cond = true, m = "n", qrs = cfg.qrs;
			if (id === "mob1") { var c = k % 4; pr = [0.16, 0.26, 0.31][c] || 0; cond = c < 3; }
			if (id === "mob2") cond = k % 3 !== 2;
			ps.push({ t: tA, pa: cfg.pa });
			if (id === "pvc" && k % 5 === 3) {   /* a PVC well before this P's QRS; this P is hidden in it and not conducted */
				var prev = beats.length ? beats[beats.length - 1].t : tA - rr;
				addV(prev + 0.52 * rr, { m: "w", qrs: 0.15, qt: 0.42, pvc: true });
			} else if (cond) addV(tA + pr, { m: m, qrs: qrs, qt: H.qtFor(rr, cfg.qtc), st: cfg.st, ta: cfg.ta, tw: cfg.tw, pr: pr });
			tA += rr; k++;
		}
		var g = {
			truth: truth, beats: beats, ps: ps,
			until: function (tEnd) {
				while (true) {
					if (id === "sinus" || id === "brady" || id === "tachy" || id === "avb1" || id === "mob1" || id === "mob2" || id === "pvc" || id === "stemi" || id === "hyperk" || id === "longqt") { if (tA > tEnd + 1) break; sinusNext(); }
					else if (id === "af") { if (tV > tEnd + 1) break; tV += 0.32 + R() * 0.62; addV(tV, { m: "n", qrs: 0.09, qt: 0.34, ta: 0.25 }); }
					else if (id === "flutter") { if (tV > tEnd + 1) break; tV += 0.8; addV(tV, { m: "n", qrs: 0.09, qt: H.qtFor(0.8), ta: 0.2 }); }
					else if (id === "svt") { if (tV > tEnd + 1) break; tV += 60 / 180; addV(tV, { m: "n", qrs: 0.08, qt: H.qtFor(60 / 180), ta: 0.22 }); }
					else if (id === "vt") { if (tV > tEnd + 1) break; tV += 60 / 170; addV(tV, { m: "w", qrs: 0.16, qt: 0.30, ra: 1.5, ta: -0.5 }); }
					else if (id === "avb3") { if (tA > tEnd + 1 && tV > tEnd + 1) break; if (tA <= tV) { ps.push({ t: tA }); tA += 60 / 80; } else { tV += 60 / 36; addV(tV + 0.35, { m: "w", qrs: 0.14, qt: H.qtFor(60 / 36, 0.42), ra: 1.0, ta: -0.3 }); } }
					else break;
				}
				return g;
			},
			at: function (t) {
				var y = 0, i;
				for (i = beats.length - 1; i >= 0; i--) { var b = beats[i]; if (b.t > t + 0.05) continue; if (b.t < t - 0.9) break; if (!b.w) b.w = H.complex(b); y += gsum(b.w, b.t, t); }
				for (i = ps.length - 1; i >= 0; i--) { var q = ps[i]; if (q.t > t + 0.05) continue; if (q.t < t - 0.3) break; if (!q.w) q.w = H.pwave(q.pa); y += gsum(q.w, q.t, t); }
				if (id === "af" || id === "vf") { var mod = id === "vf" ? 0.55 + 0.45 * Math.sin(t * 0.9 + fib[0].ph) : 1; for (i = 0; i < fib.length; i++) y += mod * fib[i].a * Math.sin(6.2832 * fib[i].f * t + fib[i].ph); }
				if (id === "flutter") { var ph = (t * 5) % 1; y += ph < 0.75 ? 0.1 - 0.32 * ph / 0.75 : -0.22 + 0.32 * (ph - 0.75) / 0.25; }
				y += 0.006 * Math.sin(t * 47.1) + 0.015 * Math.sin(t * 1.3);   // tiny noise and baseline wander
				return y;
			}
		};
		return g;
	};
	/* QTc (s in, s out) */
	H.qtc = function (qt, rr) { return { bazett: qt / Math.sqrt(rr), fridericia: qt / Math.cbrt(rr), framingham: qt + 0.154 * (1 - rr), hodges: qt + 0.00175 * (60 / rr - 60) }; };
	H.rateFromBoxes = function (big, small) { return { big: big > 0 ? 300 / big : 0, small: small > 0 ? 1500 / small : 0 }; };

	/* ---------------- 3. bedside formulas ---------------- */
	H.bsa = function (cm, kg) { return { mosteller: Math.sqrt(cm * kg / 3600), dubois: 0.007184 * Math.pow(cm, 0.725) * Math.pow(kg, 0.425) }; };
	H.map = function (sbp, dbp) { return dbp + (sbp - dbp) / 3; };
	H.hemo = function (x) {
		var o = {}, co = x.co || (x.hr && x.sv ? x.hr * x.sv / 1000 : 0);
		o.co = co; o.bsa = x.cm && x.kg ? H.bsa(x.cm, x.kg).mosteller : 0; o.ci = o.bsa ? co / o.bsa : 0;
		o.sv = x.sv || (x.hr ? co * 1000 / x.hr : 0); o.svi = o.bsa ? o.sv / o.bsa : 0;
		o.map = x.map || (x.sbp && x.dbp ? H.map(x.sbp, x.dbp) : 0); o.pp = x.sbp && x.dbp ? x.sbp - x.dbp : 0;
		o.svr = co ? 80 * (o.map - (x.cvp || 0)) / co : 0; o.svri = o.bsa ? o.svr * o.bsa : 0;
		o.pvr = co && x.mpap ? 80 * (x.mpap - (x.pcwp || 0)) / co : 0; o.pvrWU = o.pvr / 80; o.tpg = x.mpap ? x.mpap - (x.pcwp || 0) : 0;
		o.ef = x.edv && x.esv ? (x.edv - x.esv) / x.edv : 0;
		o.cao2 = x.hb ? 1.34 * x.hb * (x.sao2 / 100) + 0.003 * (x.pao2 || 0) : 0;   // ml O2 per dl (Hb g/dl, PaO2 mmHg)
		o.cvo2 = x.hb && x.svo2 ? 1.34 * x.hb * (x.svo2 / 100) + 0.003 * (x.pvo2 || 40) : 0;
		o.do2 = co * o.cao2 * 10; o.do2i = o.bsa ? o.do2 / o.bsa : 0;   // ml O2 / min
		o.vo2 = o.cvo2 ? co * (o.cao2 - o.cvo2) * 10 : 0; o.o2er = o.cvo2 ? (o.cao2 - o.cvo2) / o.cao2 : 0;
		o.cpp = x.dbp && x.pcwp != null ? x.dbp - x.pcwp : 0; o.rpp = x.hr && x.sbp ? x.hr * x.sbp : 0; o.si = x.hr && x.sbp ? x.hr / x.sbp : 0;
		o.sw = o.sv && o.map ? o.sv * (o.map - (x.pcwp || 0)) * 0.0136 : 0;   // LV stroke work, g·m (SV ml × (MAP - PCWP) mmHg × 0.0136)
		return o;
	};
	H.NORMALS = {   /* adult resting ranges, as commonly taught */
		co: [4, 8, "L/min"], ci: [2.5, 4, "L/min/m²"], sv: [60, 100, "ml"], svi: [33, 47, "ml/m²"], map: [70, 105, "mmHg"], svr: [800, 1200, "dyn·s·cm⁻⁵"], svri: [1970, 2390, "dyn·s·cm⁻⁵·m²"],
		pvr: [20, 120, "dyn·s·cm⁻⁵"], ef: [0.52, 0.72, ""], cao2: [17, 20, "ml/dl"], do2: [950, 1150, "ml/min"], do2i: [500, 600, "ml/min/m²"], vo2: [200, 250, "ml/min"], o2er: [0.22, 0.30, ""], si: [0.5, 0.7, ""]
	};

	if (typeof module !== "undefined" && module.exports) module.exports = H; else root.MESHeart = H;
})(typeof window !== "undefined" ? window : this);
