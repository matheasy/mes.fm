/* MES noise removal (window.MESDenoise), shared by the MES Audio Editor (mes.fm/audio) and the video editor.
 *
 *   MESDenoise.load({model, onProgress}) -> Promise            (optional: warm up a model before the first process call)
 *   MESDenoise.process(channels, sampleRate, {model: 'auto'|'deepfilter'|'rnnoise'|'spectral', strength: 0..1,
 *                      noise: Float32Array[] (optional noise-only sample for 'spectral'), hum: 0|50|60|'auto',
 *                      onProgress(f, message), signal: AbortSignal}) -> Promise<Float32Array[]>   (same length and rate as the input; input untouched;
 *                      an aborted signal rejects with an AbortError at the next chunk)
 *   MESDenoise.models  = [{id, name, licence, size, note}]
 *   MESDenoise.dsp     = the pure DSP below (node: require('./denoise.js').dsp)
 *
 * Models (all permissively licensed, the site carries ads):
 *   deepfilter = DeepFilterNet3 (Hendrik Schroeter, MIT / Apache-2.0), the "soniqo/DeepFilterNet3-ONNX" single-graph export (MIT, 8.6 MB,
 *                dynamic frame axis), served from mes.fm/main_js/denoise/ with the Hugging Face file as a fallback. The network only maps
 *                features to an ERB-band mask + deep-filter coefficients; the 48 kHz STFT (960 / 480, Vorbis window), ERB features with
 *                exponential mean / unit normalisation and the order-5 deep filter are ours (port of libDF), below.
 *   rnnoise    = RNNoise (Xiph, BSD-3) via @shiguredo/rnnoise-wasm (Apache-2.0), 48 kHz, 480-sample frames.
 *   spectral   = classic noise-profile spectral gate (decision-directed Wiener gain), learns the noise from a sample or from the quietest frames.
 * onnxruntime-web 1.22.0 (jsDelivr) runs the network on WebAssembly (single thread: the site is not cross-origin isolated). Nothing is uploaded. */
(function (root) {
	"use strict";

	/* ---------------- pure DSP ---------------- */
	var D = {};

	/* mixed-radix complex FFT (factors 2, 3, 4, 5, any prime) with precomputed twiddles; fwd = e^{-i}, no scaling */
	D.fftPlan = function (n) {
		var f = [], m = n, p;
		while (m % 4 === 0) { f.push(4); m /= 4; }
		while (m % 2 === 0) { f.push(2); m /= 2; }
		for (p = 3; p * p <= m; p += 2) while (m % p === 0) { f.push(p); m /= p; }
		if (m > 1) f.push(m);
		var cr = new Float64Array(n), ci = new Float64Array(n), i;
		for (i = 0; i < n; i++) { cr[i] = Math.cos(2 * Math.PI * i / n); ci[i] = -Math.sin(2 * Math.PI * i / n); }
		var tr = new Float64Array(n), ti = new Float64Array(n), sr = new Float64Array(16), si = new Float64Array(16);
		function rec(N, ir, ii, off, st, or, oi, oo, fi, sign) {
			if (N === 1) { or[oo] = ir[off]; oi[oo] = ii[off]; return; }
			var P = f[fi], M = N / P, q, k, r, step = n / N;
			for (q = 0; q < P; q++) rec(M, ir, ii, off + q * st, st * P, or, oi, oo + q * M, fi + 1, sign);
			for (k = 0; k < M; k++) {
				for (q = 0; q < P; q++) { var a = or[oo + q * M + k], b = oi[oo + q * M + k], w = (q * k * step) % n, wr = cr[w], wi = sign * ci[w]; sr[q] = a * wr - b * wi; si[q] = a * wi + b * wr; }
				if (P === 2) { or[oo + k] = sr[0] + sr[1]; oi[oo + k] = si[0] + si[1]; or[oo + M + k] = sr[0] - sr[1]; oi[oo + M + k] = si[0] - si[1]; continue; }
				if (P === 4) {
					var t0r = sr[0] + sr[2], t0i = si[0] + si[2], t1r = sr[0] - sr[2], t1i = si[0] - si[2], t2r = sr[1] + sr[3], t2i = si[1] + si[3], t3r = sign * (si[1] - si[3]), t3i = -sign * (sr[1] - sr[3]);
					or[oo + k] = t0r + t2r; oi[oo + k] = t0i + t2i; or[oo + 2 * M + k] = t0r - t2r; oi[oo + 2 * M + k] = t0i - t2i;
					or[oo + M + k] = t1r + t3r; oi[oo + M + k] = t1i + t3i; or[oo + 3 * M + k] = t1r - t3r; oi[oo + 3 * M + k] = t1i - t3i; continue;
				}
				for (r = 0; r < P; r++) { var ar = 0, ai = 0; for (q = 0; q < P; q++) { var w2 = ((q * r) % P) * (n / P), xr = cr[w2], xi = sign * ci[w2]; ar += sr[q] * xr - si[q] * xi; ai += sr[q] * xi + si[q] * xr; } tr[r] = ar; ti[r] = ai; }
				for (r = 0; r < P; r++) { or[oo + r * M + k] = tr[r]; oi[oo + r * M + k] = ti[r]; }
			}
		}
		var br = new Float64Array(n), bi = new Float64Array(n);
		return {
			n: n, factors: f,
			/* in place on Float64Array re / im */
			fwd: function (re, im) { rec(n, re, im, 0, 1, br, bi, 0, 0, 1); re.set(br); im.set(bi); },
			inv: function (re, im) { rec(n, re, im, 0, 1, br, bi, 0, 0, -1); re.set(br); im.set(bi); }
		};
	};

	/* DeepFilterNet's Vorbis window (libDF): w[i] = sin(pi/2 * sin^2(pi (i + 0.5) / N)) */
	D.vorbisWindow = function (n) {
		var w = new Float32Array(n), h = n / 2, i;
		for (i = 0; i < n; i++) { var s = Math.sin(0.5 * Math.PI * (i + 0.5) / h); w[i] = Math.sin(0.5 * Math.PI * s * s); }
		return w;
	};

	/* libDF erb_fb: band sizes in FFT bins (Math.fround keeps it f32-faithful) */
	D.erbBands = function (sr, fft, nb, minNb) {
		var F = Math.fround, f2e = function (f) { return F(9.265 * Math.log1p(F(f / F(24.7 * 9.265)))); }, e2f = function (e) { return F(24.7 * 9.265 * (Math.exp(F(e / 9.265)) - 1)); };
		var width = F(sr / fft), lo = f2e(0), hi = f2e(sr / 2), step = F((hi - lo) / nb), erb = [], prev = 0, over = 0, i;
		for (i = 1; i <= nb; i++) {
			var fb = Math.round(F(e2f(F(lo + i * step)) / width)), k = fb - prev - over;
			if (k < minNb) { over = minNb - k; k = minNb; } else over = 0;
			erb.push(k); prev = fb;
		}
		erb[nb - 1] += 1;
		var sum = erb.reduce(function (a, b) { return a + b; }, 0), big = sum - (fft / 2 + 1);
		if (big > 0) erb[nb - 1] -= big;
		return erb;
	};

	D.DFN = { sr: 48000, fft: 960, hop: 480, bins: 481, nbErb: 32, nbDf: 96, order: 5, lookahead: 2, alpha: 0.99 };
	var dfnCache = null;
	function dfnConst() {
		if (dfnCache) return dfnCache;
		var C = D.DFN, erb = D.erbBands(C.sr, C.fft, C.nbErb, 2), band = new Int32Array(C.bins), b, j, p = 0;
		for (b = 0; b < erb.length; b++) for (j = 0; j < erb[b]; j++) band[p++] = b;
		dfnCache = { erb: erb, band: band, win: D.vorbisWindow(C.fft), plan: D.fftPlan(C.fft) };
		return dfnCache;
	}

	/* STFT + features for the DeepFilterNet graph. x = mono Float32Array at 48 kHz.
	 * -> {T, L, re, im (T x 481 noisy spectrum), erb (T x 32 = feat_erb [1,1,T,32]), spec (2 x T x 96 = feat_spec [1,2,T,96])} */
	D.dfnAnalysis = function (x) {
		var C = D.DFN, K = dfnConst(), N = C.fft, H = C.hop, F = C.bins, L = x.length, T = Math.ceil((L + N) / H), t, i, f;
		var re = new Float32Array(T * F), im = new Float32Array(T * F), fe = new Float32Array(T * C.nbErb), fs = new Float32Array(2 * T * C.nbDf);
		var br = new Float64Array(N), bi = new Float64Array(N), win = K.win, erb = K.erb, norm = 1 / N, a = C.alpha;
		var mean = new Float64Array(C.nbErb), unit = new Float64Array(C.nbDf);
		for (i = 0; i < C.nbErb; i++) mean[i] = -60 + (-90 + 60) * i / (C.nbErb - 1);
		for (i = 0; i < C.nbDf; i++) unit[i] = 0.001 + (0.0001 - 0.001) * i / (C.nbDf - 1);
		for (t = 0; t < T; t++) {
			var s0 = t * H - H;
			for (i = 0; i < N; i++) { var n = s0 + i; br[i] = (n >= 0 && n < L ? x[n] : 0) * win[i]; bi[i] = 0; }
			K.plan.fwd(br, bi);
			var o = t * F;
			for (f = 0; f < F; f++) { re[o + f] = br[f] * norm; im[o + f] = bi[f] * norm; }
			var p = 0, eo = t * C.nbErb;
			for (var b = 0; b < erb.length; b++) {
				var sz = erb[b], acc = 0;
				for (j = 0; j < sz; j++, p++) { var r = re[o + p], q = im[o + p]; acc += (r * r + q * q) / sz; }
				var v = 10 * Math.log10(acc + 1e-10);
				mean[b] = v * (1 - a) + mean[b] * a;
				fe[eo + b] = (v - mean[b]) / 40;
			}
			for (f = 0; f < C.nbDf; f++) {
				var rr = re[o + f], ii = im[o + f], mag = Math.sqrt(rr * rr + ii * ii);
				unit[f] = mag * (1 - a) + unit[f] * a;
				var sq = Math.sqrt(unit[f]);
				fs[t * C.nbDf + f] = rr / sq; fs[T * C.nbDf + t * C.nbDf + f] = ii / sq;
			}
		}
		var j;
		return { T: T, L: L, re: re, im: im, erb: fe, spec: fs };
	};

	/* apply the network output and resynthesise. mask: T x 32 (Float32Array), coefs: [5, T, 96, 2] flattened (the graph's df_coefs layout).
	 * limDb: attenuation limit (libDF's atten_lim_db): the noisy spectrum is mixed back in at 10^(-limDb/20). -> Float32Array length L */
	D.dfnSynthesis = function (an, mask, coefs, limDb) {
		var C = D.DFN, K = dfnConst(), N = C.fft, H = C.hop, F = C.bins, T = an.T, L = an.L, nd = C.nbDf, O = C.order, la = C.lookahead;
		var re = an.re, im = an.im, band = K.band, win = K.win, out = new Float32Array(T * H + N), br = new Float64Array(N), bi = new Float64Array(N);
		var lim = limDb == null || limDb >= 99 ? 0 : Math.pow(10, -limDb / 20), t, f, k;
		for (t = 0; t < T; t++) {
			var o = t * F;
			for (f = 0; f < F; f++) {
				var yr, yi;
				if (f < nd) {
					yr = 0; yi = 0;
					for (k = 0; k < O; k++) {
						var tt = t - (O - 1 - la) + k; if (tt < 0 || tt >= T) continue;
						var xr = re[tt * F + f], xi = im[tt * F + f], ci = ((k * T + t) * nd + f) * 2, cr = coefs[ci], cim = coefs[ci + 1];
						yr += xr * cr - xi * cim; yi += xr * cim + xi * cr;
					}
				} else { var g = mask[t * C.nbErb + band[f]]; yr = re[o + f] * g; yi = im[o + f] * g; }
				if (lim) { yr = yr * (1 - lim) + re[o + f] * lim; yi = yi * (1 - lim) + im[o + f] * lim; }
				br[f] = yr; bi[f] = yi;
			}
			for (f = 1; f < N / 2; f++) { br[N - f] = br[f]; bi[N - f] = -bi[f]; }
			bi[0] = 0; bi[N / 2] = 0;
			K.plan.inv(br, bi);
			for (i = 0; i < N; i++) out[t * H + i] += br[i] * win[i];
		}
		var i, y = new Float32Array(L);
		/* frame t covers input [tH - H, tH + H): the overlap-add output is delayed by one hop */
		for (i = 0; i < L; i++) y[i] = out[i + H];
		return y;
	};

	/* polyphase windowed-sinc resampler (zero phase; Kaiser beta 8, 24 zero crossings each side) */
	function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }
	function bessel0(x) { var s = 1, t = 1, k; for (k = 1; k < 30; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; } return s; }
	D.resample = function (x, from, to) {
		if (from === to) return new Float32Array(x);
		var g = gcd(from, to), up = to / g, dn = from / g, Hw = 24, cut = Math.min(1, to / from) * 0.97, beta = 8, ib = bessel0(beta);
		var taps = 2 * Hw, phases = up, tab = new Float32Array(phases * taps), ph, j;
		var scale = Math.min(1, to / from) / 1; // keeps unity gain for down-sampling (cut already includes the ratio)
		for (ph = 0; ph < phases; ph++) {
			var frac = ph / up, sum = 0;
			for (j = 0; j < taps; j++) {
				var d = (j - Hw + 1) - frac, xx = d / (Hw / Math.max(cut, 1e-9)), wv = Math.abs(d) * cut >= Hw ? 0 : bessel0(beta * Math.sqrt(1 - Math.pow(d * cut / Hw, 2))) / ib;
				var s = d === 0 ? cut : Math.sin(Math.PI * cut * d) / (Math.PI * d);
				tab[ph * taps + j] = s * wv; sum += s * wv;
			}
			for (j = 0; j < taps; j++) tab[ph * taps + j] /= sum || 1;
		}
		var n = Math.round(x.length * to / from), y = new Float32Array(n), L = x.length, i;
		for (i = 0; i < n; i++) {
			var pos = i * dn, base = Math.floor(pos / up), p2 = pos - base * up, row = p2 * taps, acc = 0, k0 = base - Hw + 1;
			if (k0 >= 0 && k0 + taps <= L) for (j = 0; j < taps; j++) acc += x[k0 + j] * tab[row + j];
			else for (j = 0; j < taps; j++) { var kk = k0 + j; if (kk >= 0 && kk < L) acc += x[kk] * tab[row + j]; }
			y[i] = acc;
		}
		void scale;
		return y;
	};

	/* RBJ biquad, direct form I on a Float32Array (in place). type: 'notch'|'peak'|'lowshelf'|'highshelf'|'highpass'|'lowpass' */
	D.biquad = function (type, f0, sr, q, gainDb) {
		var A = Math.pow(10, (gainDb || 0) / 40), w = 2 * Math.PI * f0 / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), b0, b1, b2, a0, a1, a2;
		if (type === "notch") { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
		else if (type === "peak") { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
		else if (type === "highpass") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
		else if (type === "lowpass") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
		else { var sa = 2 * Math.sqrt(A) * al, s = type === "lowshelf" ? 1 : -1;
			b0 = A * ((A + 1) - s * (A - 1) * cw + sa); b1 = s * 2 * A * ((A - 1) - s * (A + 1) * cw); b2 = A * ((A + 1) - s * (A - 1) * cw - sa);
			a0 = (A + 1) + s * (A - 1) * cw + sa; a1 = -s * 2 * ((A - 1) + s * (A + 1) * cw); a2 = (A + 1) + s * (A - 1) * cw - sa; }
		return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
	};
	D.filter = function (x, c, twoPass) {
		function run(a, rev) {
			var x1 = 0, x2 = 0, y1 = 0, y2 = 0, n = a.length, i, k;
			for (k = 0; k < n; k++) { i = rev ? n - 1 - k : k; var v = a[i], y = c.b0 * v + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; a[i] = y; }
		}
		run(x, false); if (twoPass) run(x, true);
		return x;
	};

	/* hum: energy at 50 / 60 Hz and harmonics vs the bins next to them (Goertzel on up to 60 s) -> {base: 0|50|60, db} */
	function goertzel(x, f, sr, n) { var w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w), s1 = 0, s2 = 0, i; for (i = 0; i < n; i++) { var s = x[i] + c * s1 - s2; s2 = s1; s1 = s; } return s1 * s1 + s2 * s2 - c * s1 * s2; }
	D.detectHum = function (ch, sr) {
		var x = ch[0], n = Math.min(x.length, sr * 60), best = { base: 0, db: 0 };
		[50, 60].forEach(function (b) {
			var on = 0, off = 0, h;
			for (h = 1; h <= 4; h++) { var f = b * h; if (f > sr / 2 - 50) break; on += goertzel(x, f, sr, n); off += (goertzel(x, f - 4, sr, n) + goertzel(x, f + 4, sr, n)) / 2; }
			var db = 10 * Math.log10((on + 1e-20) / (off + 1e-20)), amp = 2 * Math.sqrt(on) / n;
			if (amp > 3e-4 && db > best.db) best = { base: b, db: db, amp: amp };
		});
		if (best.db < 6) best.base = 0;
		return best;
	};
	/* exact hum frequency: Goertzel scan +-1.2 Hz around the nominal base (mains drifts; analogue gear can sit at 59.94) */
	D.refineHum = function (ch, sr, base) {
		var x = ch[0], n = Math.min(x.length, sr * 30), best = base, bp = -1, f;
		for (f = base - 1.2; f <= base + 1.2001; f += 0.02) { var p = goertzel(x, f, sr, n) + goertzel(x, 2 * f, sr, n) * 0.5 + goertzel(x, 3 * f, sr, n) * 0.33; if (p > bp) { bp = p; best = f; } }
		return Math.round(best * 100) / 100;
	};
	/* notch the base frequency and its harmonics (zero phase: forward + backward). Constant bandwidth `bw` Hz (default 0.8) per notch:
	 * narrow enough that a voice loses almost nothing (SI-SDR of clean speech through 8 notches > 20 dB), wide enough for slow mains drift. */
	D.humRemove = function (ch, sr, opt) {
		opt = opt || {};
		var base = opt.base === "auto" || !opt.base ? D.detectHum(ch, sr).base : +opt.base, H = opt.harmonics || 8, bw = opt.bw || 0.8;
		if (!base) return ch.map(function (c) { return new Float32Array(c); });
		if (opt.refine !== false) base = D.refineHum(ch, sr, base);
		return ch.map(function (c) {
			var y = new Float32Array(c), h;
			for (h = 1; h <= H; h++) { var f = base * h; if (f > sr / 2 - 100) break; D.filter(y, D.biquad("notch", f, sr, f / bw), true); }
			return y;
		});
	};

	/* classic spectral gate: STFT 2048 / 512 (Hann^0.5 analysis + synthesis), noise PSD from `noise` (a noise-only sample) or from the quietest
	 * 10% of frames per bin, decision-directed Wiener gain with a floor of -reduceDb, smoothed across frequency. -> Float32Array[] */
	D.spectral = function (ch, sr, opt) {
		opt = opt || {};
		var N = sr > 32000 ? 2048 : 1024, H = N / 4, plan = D.fftPlan(N), win = new Float64Array(N), i, f, t;
		for (i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
		var wsum = 0; for (i = 0; i < N; i += H) wsum += win[i] * win[i]; // overlap normaliser
		var olaN = 0; for (i = 0; i < N; i++) olaN += win[i] * win[i]; olaN = olaN / H;
		var reduceDb = opt.reduceDb != null ? opt.reduceDb : 18, floor = Math.pow(10, -reduceDb / 20), over = opt.over || 1.5, B = N / 2 + 1;
		function frames(x, fn) {
			var T = Math.ceil((x.length + N) / H), br = new Float64Array(N), bi = new Float64Array(N);
			for (t = 0; t < T; t++) { var s0 = t * H - N + H; for (i = 0; i < N; i++) { var n = s0 + i; br[i] = (n >= 0 && n < x.length ? x[n] : 0) * win[i]; bi[i] = 0; } plan.fwd(br, bi); fn(t, br, bi, s0); }
			return T;
		}
		function psdOf(x, quant) {
			var cols = [], P = new Float64Array(B);
			frames(x, function (t, br, bi) { var p = new Float32Array(B); for (f = 0; f < B; f++) p[f] = br[f] * br[f] + bi[f] * bi[f]; cols.push(p); });
			if (!cols.length) return P;
			if (quant == null) { cols.forEach(function (p) { for (f = 0; f < B; f++) P[f] += p[f] / cols.length; }); return P; }
			/* quantile per bin of frame energies: use the frames with the lowest total energy (noise-only moments) */
			var en = cols.map(function (p, k) { var s = 0; for (f = 0; f < B; f++) s += p[f]; return [s, k]; }).filter(function (e) { return e[0] > 0; }).sort(function (a, b) { return a[0] - b[0]; });
			var take = Math.max(3, Math.floor(en.length * quant));
			for (var k = 0; k < Math.min(take, en.length); k++) { var p2 = cols[en[k][1]]; for (f = 0; f < B; f++) P[f] += p2[f] / Math.min(take, en.length); }
			return P;
		}
		return ch.map(function (x, ci) {
			var noise = opt.noise && opt.noise[Math.min(ci, opt.noise.length - 1)], Pn = noise && noise.length > N ? psdOf(noise, null) : psdOf(x, 0.1);
			var y = new Float64Array(x.length + 2 * N), prevS = new Float64Array(B), G = new Float64Array(B), Gs = new Float64Array(B);
			frames(x, function (t, br, bi, s0) {
				for (f = 0; f < B; f++) {
					var p = br[f] * br[f] + bi[f] * bi[f], nz = Pn[f] * over + 1e-20, post = p / nz, prio = 0.98 * prevS[f] / nz + 0.02 * Math.max(post - 1, 0);
					G[f] = Math.max(prio / (1 + prio), floor);
				}
				for (f = 0; f < B; f++) { var a = G[Math.max(0, f - 1)], b = G[f], c = G[Math.min(B - 1, f + 1)]; Gs[f] = 0.25 * a + 0.5 * b + 0.25 * c; }
				for (f = 0; f < B; f++) { var g = Gs[f], pr = br[f] * br[f] + bi[f] * bi[f]; prevS[f] = g * g * pr; br[f] *= g; bi[f] *= g; }
				for (f = 1; f < N / 2; f++) { br[N - f] = br[f]; bi[N - f] = -bi[f]; }
				plan.inv(br, bi);
				for (i = 0; i < N; i++) { var n = s0 + i; if (n >= 0 && n < x.length) y[n] += br[i] * win[i] / N / olaN; }
			});
			var out = new Float32Array(x.length); for (i = 0; i < x.length; i++) out[i] = y[i];
			return out;
		});
		void wsum;
	};

	/* strength 0..1 -> attenuation limit in dB (how far the noise may be pushed down); 1 = no limit */
	D.strengthDb = function (s) { s = Math.max(0, Math.min(1, s == null ? 1 : +s)); return s >= 0.995 ? 100 : 40 * s; };
	D.mix = function (wet, dry, s) {
		if (s >= 0.995) return wet;
		var lim = Math.pow(10, -D.strengthDb(s) / 20), y = new Float32Array(wet.length), i;
		for (i = 0; i < wet.length; i++) y[i] = wet[i] * (1 - lim) + dry[i] * lim;
		return y;
	};
	/* channels that are (nearly) the same are processed once */
	D.sameChannels = function (ch) {
		if (ch.length < 2) return false;
		var a = ch[0], b = ch[1], n = Math.min(a.length, b.length), d = 0, e = 0, i;
		for (i = 0; i < n; i += 7) { var x = a[i] - b[i]; d += x * x; e += a[i] * a[i]; }
		return d <= e * 1e-6;
	};
	/* SNR / SI-SDR helpers for tests */
	D.siSdr = function (ref, est) {
		var n = Math.min(ref.length, est.length), rr = 0, re = 0, i; for (i = 0; i < n; i++) { rr += ref[i] * ref[i]; re += ref[i] * est[i]; }
		var a = re / (rr || 1), s = 0, e = 0; for (i = 0; i < n; i++) { var t = a * ref[i], d = est[i] - t; s += t * t; e += d * d; }
		return 10 * Math.log10(s / (e || 1e-20));
	};

	/* ---------------- browser engine ---------------- */
	var ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.all.min.js", ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
		DFN_URLS = ["/main_js/denoise/deepfilter.onnx", "https://huggingface.co/soniqo/DeepFilterNet3-ONNX/resolve/63d8ba442ba900143c468b798e94a04009b2f0c9/deepfilter.onnx"],
		RNN_URL = "https://cdn.jsdelivr.net/npm/@shiguredo/rnnoise-wasm@2025.1.5/dist/rnnoise.js", CACHE = "mes-denoise-models", CHUNK = 1000, WARM = 200;
	var M = {
		models: [
			{ id: "deepfilter", name: "DeepFilterNet 3 (AI, best)", licence: "MIT / Apache-2.0", size: "8.6 MB", note: "Neural network made for speech; removes fans, traffic, hiss, keyboard and room noise; runs on this device." },
			{ id: "rnnoise", name: "RNNoise (AI, fast)", licence: "BSD-3 (wasm build Apache-2.0)", size: "4.8 MB", note: "Small, fast neural network from Xiph; gentler and less clean than DeepFilterNet." },
			{ id: "spectral", name: "Spectral gate (classic)", licence: "MES, no download", size: "0 MB", note: "Learns the noise from a noise-only selection (or the quietest moments) and gates it; best for steady hiss and hum, works on music too." }
		],
		dsp: D, status: {}
	};
	var ortP = null, sessP = null, rnnP = null;
	function loadScript(u) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { rej(new Error("Could not load " + u.split("/")[2] + " (offline?)")); }; document.head.appendChild(s); }); }
	function ort() {
		if (window.ort && window.ort.InferenceSession) return Promise.resolve(window.ort);
		return ortP = ortP || loadScript(ORT).then(function () { window.ort.env.wasm.wasmPaths = ORT_WASM; return window.ort; }, function (e) { ortP = null; throw e; });
	}
	function fetchCached(urls, mb, onProg) {
		var c = window.caches ? caches.open(CACHE).catch(function () { return null; }) : Promise.resolve(null);
		return c.then(function (cache) {
			function attempt(i) {
				var url = urls[i];
				return (cache ? cache.match(urls[urls.length - 1]) : Promise.resolve(null)).then(function (hit) {
					if (hit) return hit.arrayBuffer();
					return fetch(url).then(function (r) {
						if (!r.ok) throw new Error("download failed (" + r.status + ")");
						var total = +r.headers.get("content-length") || mb * 1e6, rd = r.body.getReader(), got = 0, parts = [];
						function pump() { return rd.read().then(function (x) { if (x.done) return; parts.push(x.value); got += x.value.length; if (onProg) onProg(Math.min(1, got / total)); return pump(); }); }
						return pump().then(function () {
							var buf = new Uint8Array(got), p = 0; parts.forEach(function (a) { buf.set(a, p); p += a.length; });
							if (got < 1e6) throw new Error("model file too small");
							if (cache) cache.put(urls[urls.length - 1], new Response(buf, { headers: { "content-type": "application/octet-stream" } })).catch(function () {});
							return buf.buffer;
						});
					});
				}).catch(function (e) { if (i + 1 < urls.length) return attempt(i + 1); throw e; });
			}
			return attempt(0);
		});
	}
	function dfnSession(onProg) {
		return sessP = sessP || Promise.all([ort(), fetchCached(DFN_URLS, 8.6, onProg)]).then(function (r) {
			var o = r[0];
			o.env.wasm.numThreads = window.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
			return o.InferenceSession.create(r[1], { executionProviders: ["wasm"], graphOptimizationLevel: "all" }).then(function (s) { M.status.deepfilter = "wasm"; return { ort: o, s: s }; });
		}).catch(function (e) { sessP = null; throw e; });
	}
	function rnnoise() {
		return rnnP = rnnP || new Function("u", "return import(u)")(RNN_URL).then(function (m) { return m.Rnnoise.load(); }).catch(function (e) { rnnP = null; throw new Error("Could not load RNNoise (" + e.message + ")"); });
	}
	var curSignal = null;
	function tick() { return new Promise(function (r, j) { setTimeout(function () { if (curSignal && curSignal.aborted) { var e = new Error("Cancelled"); e.name = "AbortError"; j(e); } else r(); }, 0); }); }

	/* run the network on frame range [a, b) with warm-up before a and the lookahead after; writes mask / coefs for [a, b) */
	function dfnRunChunks(S, an, onProg) {
		var C = D.DFN, T = an.T, mask = new Float32Array(T * C.nbErb), coefs = new Float32Array(C.order * T * C.nbDf * 2), a = 0;
		function step() {
			if (a >= T) return Promise.resolve({ mask: mask, coefs: coefs });
			var b = Math.min(T, a + CHUNK), s = Math.max(0, a - WARM), e = Math.min(T, b + 4), n = e - s;
			var fe = an.erb.subarray(s * C.nbErb, e * C.nbErb), fs = new Float32Array(2 * n * C.nbDf);
			fs.set(an.spec.subarray(s * C.nbDf, e * C.nbDf), 0); fs.set(an.spec.subarray(T * C.nbDf + s * C.nbDf, T * C.nbDf + e * C.nbDf), n * C.nbDf);
			var feeds = { feat_erb: new S.ort.Tensor("float32", new Float32Array(fe), [1, 1, n, C.nbErb]), feat_spec: new S.ort.Tensor("float32", fs, [1, 2, n, C.nbDf]) };
			return S.s.run(feeds).then(function (out) {
				var m = out.erb_mask.data, cf = out.df_coefs.data, t, k;
				mask.set(m.subarray((a - s) * C.nbErb, (b - s) * C.nbErb), a * C.nbErb);
				for (k = 0; k < C.order; k++) for (t = a; t < b; t++) {
					var src = ((k * n + (t - s)) * C.nbDf) * 2, dst = ((k * T + t) * C.nbDf) * 2;
					coefs.set(cf.subarray(src, src + C.nbDf * 2), dst);
				}
				a = b; if (onProg) onProg(a / T);
				return tick().then(step);
			});
		}
		return step();
	}

	function procDeepFilter(ch, sr, opt, prog) {
		return dfnSession(function (f) { prog(0.15 * f, "Downloading the AI model"); }).then(function (S) {
			var outs = [], same = D.sameChannels(ch), list = same ? [ch[0]] : ch, i = 0;
			function next() {
				if (i >= list.length) return Promise.resolve(same ? ch.map(function () { return outs[0]; }) : outs);
				var base = 0.15 + 0.85 * i / list.length, span = 0.85 / list.length, x48 = D.resample(list[i], sr, 48000), an = D.dfnAnalysis(x48);
				return dfnRunChunks(S, an, function (f) { prog(base + span * 0.95 * f, "Removing noise (AI)"); }).then(function (r) {
					var y = D.dfnSynthesis(an, r.mask, r.coefs, D.strengthDb(opt.strength)), back = D.resample(y, 48000, sr);
					outs.push(back.length === list[i].length ? back : fit(back, list[i].length)); i++;
					return tick().then(next);
				});
			}
			return next();
		});
	}
	function fit(y, n) { var z = new Float32Array(n); z.set(y.subarray(0, Math.min(n, y.length))); return z; }
	function procRnnoise(ch, sr, opt, prog) {
		prog(0.02, "Loading RNNoise");
		return rnnoise().then(function (R) {
			var outs = [], same = D.sameChannels(ch), list = same ? [ch[0]] : ch, i = 0, F = R.frameSize || 480;
			function next() {
				if (i >= list.length) return Promise.resolve(same ? ch.map(function () { return outs[0]; }) : outs);
				var x = D.resample(list[i], sr, 48000), st = R.createDenoiseState(), y = new Float32Array(x.length + 3 * F), buf = new Float32Array(F), p = 0;
				function run() {
					var stop = Math.min(x.length + 2 * F, p + F * 400);
					for (; p < stop; p += F) {
						for (var k = 0; k < F; k++) { var v = p + k < x.length ? x[p + k] : 0; buf[k] = v * 32768; }
						st.processFrame(buf);
						for (k = 0; k < F; k++) y[p + k] = buf[k] / 32768;
					}
					prog(0.05 + 0.95 * (i + p / (x.length + 2 * F)) / list.length, "Removing noise (RNNoise)");
					if (p < x.length + 2 * F) return tick().then(run);
					st.destroy();
					/* this RNNoise build delays the output by two frames (960 samples at 48 kHz; measured by cross-correlation) */
					var al = new Float32Array(x.length); al.set(y.subarray(2 * F, 2 * F + x.length));
					var back = fit(D.resample(al, 48000, sr), list[i].length);
					outs.push(D.mix(back, list[i], opt.strength)); i++;
					return tick().then(next);
				}
				return run();
			}
			return next();
		});
	}
	M.load = function (opts) {
		opts = opts || {};
		var m = opts.model || "deepfilter";
		if (m === "rnnoise") return rnnoise();
		if (m === "spectral") return Promise.resolve();
		return dfnSession(opts.onProgress);
	};
	M.process = function (channels, sampleRate, opts) {
		opts = opts || {};
		var prog = function (f, msg) { if (opts.onProgress) opts.onProgress(Math.max(0, Math.min(1, f)), msg); }, model = opts.model || "auto", s = opts.strength == null ? 1 : +opts.strength;
		var ch = channels.map(function (c) { return c; });
		curSignal = opts.signal || null;
		var src = ch;
		return Promise.resolve().then(function () {
			if (s <= 0) return src.map(function (c) { return new Float32Array(c); });
			if (model === "spectral") { prog(0.1, "Removing noise (spectral)"); return tick().then(function () { var o = D.spectral(src, sampleRate, { noise: opts.noise, reduceDb: 6 + 24 * s }); prog(1); return o; }); }
			if (model === "rnnoise") return procRnnoise(src, sampleRate, { strength: s }, prog);
			return procDeepFilter(src, sampleRate, { strength: s }, prog).then(function (o) { M.used = "deepfilter"; return o; }, function (e) {
				if (model !== "auto" || e.name === "AbortError") throw e;
				M.used = "rnnoise"; M.fallbackReason = e.message;
				return procRnnoise(src, sampleRate, { strength: s }, prog).catch(function () { M.used = "spectral"; return D.spectral(src, sampleRate, { reduceDb: 6 + 24 * s }); });
			});
		}).then(function (o) {
			/* hum after the model: DeepFilterNet already removes most of the fundamental, the notches catch what is left without touching the voice first */
			if (opts.hum && opts.hum !== "0") o = D.humRemove(o, sampleRate, { base: opts.hum });
			prog(1, "Done"); return o;
		});
	};

	if (typeof module === "object" && module.exports) module.exports = M;
	else root.MESDenoise = M;
})(typeof window !== "undefined" ? window : this);
