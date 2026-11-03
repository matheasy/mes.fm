/* MESHolo: the physics behind the MES Hologram Simulator (mes.fm/hologram). Pure functions, no DOM; runs in node too:
 *   node tool_apps_src/hologram-tests.js
 * Units: lengths in micrometres (µm), angles in degrees unless a name ends in "Rad", wavelengths in µm (0.633 = 633 nm).
 * Fields are complex numbers stored as separate real / imaginary Float64Arrays (row-major, N x N). */
(function (root) {
	"use strict";
	var PI = Math.PI, TAU = 2 * PI, DEG = PI / 180;
	var H = {};

	/* ---------------------------------------------------------------- interference basics */
	// spacing of the fringes made by two plane waves that cross at a full angle theta (degrees): d = λ / (2 sin(θ/2))
	H.fringeSpacing = function (lam, thetaDeg) { var s = Math.sin(Math.abs(thetaDeg) * DEG / 2); return s < 1e-12 ? Infinity : lam / (2 * s); };
	// spacing ON THE PLATE for two plane waves arriving at angles a and b from the plate's normal: d = λ / |sin a − sin b|
	H.plateSpacing = function (lam, aDeg, bDeg) { var s = Math.abs(Math.sin(aDeg * DEG) - Math.sin(bDeg * DEG)); return s < 1e-12 ? Infinity : lam / s; };
	// fringe visibility (contrast) for a beam intensity ratio K = I_ref / I_obj and a coherence factor g (0..1): V = 2 g √K / (1 + K)
	H.visibility = function (K, g) { if (!(K > 0)) return 0; return 2 * (g == null ? 1 : g) * Math.sqrt(K) / (1 + K); };
	// coherence length of light with a Gaussian spectrum, centre λ and full width Δλ: Lc = λ² / Δλ
	H.coherenceLength = function (lam, dlam) { return dlam > 0 ? lam * lam / dlam : Infinity; };
	// degree of coherence for a path difference dL (same units as Lc), Gaussian spectrum: |γ| = exp(−(π dL / Lc)² / (4 ln 2)), so |γ| = 1/2 at dL = Lc·(2 ln2)/π ≈ 0.44 Lc
	H.coherence = function (dL, Lc) { if (!isFinite(Lc)) return 1; if (!(Lc > 0)) return 0; var x = PI * dL / Lc; return Math.exp(-x * x / (4 * Math.LN2)); };
	// fringe contrast left after the object moves steadily by d (along the line of sight, light goes there and back) during the exposure: |sinc(2d/λ)|
	H.motionContrast = function (d, lam) { var x = 2 * d / lam; if (Math.abs(x) < 1e-9) return 1; return Math.abs(Math.sin(PI * x) / (PI * x)); };
	// light sources with typical numbers (λ and spectral width in µm); real lasers vary a lot, these are ballpark figures
	H.SOURCES = [
		{ id: "ideal", name: "Ideal single-colour laser", lam: 0.6328, dlam: 0 },
		{ id: "hene1", name: "Single-frequency (stabilised) laser", lam: 0.6328, dlam: 0.6328 * 0.6328 / 1e8 },   // ~100 m
		{ id: "hene", name: "Helium-neon laser (ordinary, a few modes)", lam: 0.6328, dlam: 0.6328 * 0.6328 / 2e5 },   // ~20 cm
		{ id: "dpss", name: "Green laser pointer", lam: 0.532, dlam: 0.532 * 0.532 / 5e3 },   // ~5 mm
		{ id: "diode", name: "Cheap red laser diode (several modes)", lam: 0.650, dlam: 0.650 * 0.650 / 500 },   // ~0.5 mm
		{ id: "led", name: "Red LED", lam: 0.630, dlam: 0.020 },   // ~20 µm
		{ id: "white", name: "White light (sunlight, white LED)", lam: 0.550, dlam: 0.300 }   // ~1 µm
	];

	/* ---------------------------------------------------------------- waves on the plate */
	// spherical wave from a point p = {u, v, z, a, ph} (z > 0 = distance in front of the plate), at plate point (u, v). Amplitude a at the foot of the point. Returns [re, im] and the path r.
	H.pointWave = function (p, u, v, k) {
		var du = u - p.u, dv = v - (p.v || 0), r = Math.sqrt(du * du + dv * dv + p.z * p.z), A = (p.a == null ? 1 : p.a) * p.z / r, ph = k * r + (p.ph || 0);
		return [A * Math.cos(ph), A * Math.sin(ph), r];
	};
	// tilted plane reference wave: amplitude A, angle thetaDeg in the u direction
	H.refWave = function (A, thetaDeg, u, k) { var ph = k * u * Math.sin(thetaDeg * DEG); return [A * Math.cos(ph), A * Math.sin(ph)]; };
	// recorded intensity at (u, v) for a reference R and object points, with partial coherence:
	//   I = |R|² + Σ|O_j|² + 2 Σ γ(ΔL) Re(E_i E_j*), where ΔL is the difference of the paths travelled. opt: {lam, thetaR, ampR, Lc, refPath}
	//   refPath = length of the reference arm compared with an object point at zero distance; an object point's path = its distance r to the plate pixel.
	H.recordAt = function (pts, u, v, opt) {
		var k = TAU / opt.lam, R = H.refWave(opt.ampR == null ? 1 : opt.ampR, opt.thetaR || 0, u, k), n = pts.length, E = [R], L = [opt.refPath || 0], I = R[0] * R[0] + R[1] * R[1], i, j;
		for (i = 0; i < n; i++) { var w = H.pointWave(pts[i], u, v, k); E.push(w); L.push(w[2]); I += w[0] * w[0] + w[1] * w[1]; }
		for (i = 0; i <= n; i++) for (j = i + 1; j <= n; j++) {
			var g = isFinite(opt.Lc) ? H.coherence(L[i] - L[j], opt.Lc) : 1; if (g < 1e-6) continue;
			I += 2 * g * (E[i][0] * E[j][0] + E[i][1] * E[j][1]);
		}
		return I;
	};

	/* ---------------------------------------------------------------- FFT (radix 2) */
	H.isPow2 = function (n) { return n > 0 && (n & (n - 1)) === 0; };
	// in-place complex FFT of length n (power of two); inverse = true divides by n
	H.fft = function (re, im, inv, off, stride, n) {
		off = off || 0; stride = stride || 1; n = n || re.length;
		var i, j, k, m, half, len, wr, wi, tr, ti, ur, ui, a, b, sign = inv ? 1 : -1;
		for (i = 1, j = 0; i < n; i++) {   // bit reversal
			var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
			if (i < j) { a = off + i * stride; b = off + j * stride; tr = re[a]; re[a] = re[b]; re[b] = tr; ti = im[a]; im[a] = im[b]; im[b] = ti; }
		}
		for (len = 2; len <= n; len <<= 1) {
			half = len >> 1; var ang = sign * TAU / len, cr = Math.cos(ang), ci = Math.sin(ang);
			for (i = 0; i < n; i += len) {
				wr = 1; wi = 0;
				for (k = 0; k < half; k++) {
					a = off + (i + k) * stride; b = a + half * stride;
					ur = re[b] * wr - im[b] * wi; ui = re[b] * wi + im[b] * wr;
					re[b] = re[a] - ur; im[b] = im[a] - ui; re[a] += ur; im[a] += ui;
					m = wr * cr - wi * ci; wi = wr * ci + wi * cr; wr = m;
				}
			}
		}
		if (inv) for (i = 0; i < n; i++) { a = off + i * stride; re[a] /= n; im[a] /= n; }
	};
	// 2D FFT of an N x N field, in place
	H.fft2 = function (re, im, N, inv) { var i; for (i = 0; i < N; i++) H.fft(re, im, inv, i * N, 1, N); for (i = 0; i < N; i++) H.fft(re, im, inv, i, N, N); };
	// spatial frequency (cycles per unit) of FFT index i for N samples spaced dx
	H.freq = function (i, N, dx) { return (i < N / 2 ? i : i - N) / (N * dx); };
	H.energy = function (re, im) { var s = 0; for (var i = 0; i < re.length; i++) s += re[i] * re[i] + im[i] * im[i]; return s; };

	/* ---------------------------------------------------------------- angular spectrum propagation */
	// multiply a spectrum (already FFT'd) by the free-space transfer function for a distance z, into new arrays. Evanescent waves (f > 1/λ) are dropped.
	H.propagateSpectrum = function (Sr, Si, N, dx, lam, z, outR, outI) {
		var n2 = N * N, oR = outR || new Float64Array(n2), oI = outI || new Float64Array(n2), il2 = 1 / (lam * lam), fx = new Float64Array(N), x, y;
		for (x = 0; x < N; x++) fx[x] = H.freq(x, N, dx);
		for (y = 0; y < N; y++) {
			var fy2 = fx[y] * fx[y];
			for (x = 0; x < N; x++) {
				var q = il2 - fx[x] * fx[x] - fy2, i = y * N + x;
				if (q <= 0) { oR[i] = 0; oI[i] = 0; continue; }
				var ph = TAU * z * Math.sqrt(q), c = Math.cos(ph), s = Math.sin(ph);
				oR[i] = Sr[i] * c - Si[i] * s; oI[i] = Sr[i] * s + Si[i] * c;
			}
		}
		return [oR, oI];
	};
	// propagate a field by z (negative = backwards), returns new [re, im]
	H.propagate = function (re, im, N, dx, lam, z) {
		var r = Float64Array.from(re), i = Float64Array.from(im); H.fft2(r, i, N, false);
		var o = H.propagateSpectrum(r, i, N, dx, lam, z); H.fft2(o[0], o[1], N, true); return o;
	};
	// largest angle (from the normal) a grid with pixel dx can carry without aliasing: sin θ = λ / (2 dx)
	H.maxAngle = function (lam, dx) { var s = lam / (2 * dx); return s >= 1 ? 90 : Math.asin(s) / DEG; };

	/* ---------------------------------------------------------------- numerical holography (the Reconstruction tab) */
	// record a hologram of point objects (pts: {u, v, z, a}) and/or a flat object (flat: {re, im, z}: a field in the plane z in front) on an N x N plate of pixel dx.
	// Returns {H: Float64Array intensity, O: [re, im] object wave on the plate}. opt: {N, dx, lam, thetaR, ratio (I_ref / I_obj, measured as mean intensities)}
	H.makeHologram = function (opt, pts, flat) {
		var N = opt.N, dx = opt.dx, lam = opt.lam, k = TAU / lam, n2 = N * N, Or = new Float64Array(n2), Oi = new Float64Array(n2), x, y, i, j;
		if (flat) { var p = H.propagate(flat.re, flat.im, N, dx, lam, flat.z); for (i = 0; i < n2; i++) { Or[i] += p[0][i]; Oi[i] += p[1][i]; } }
		if (pts && pts.length) for (y = 0; y < N; y++) { var v = (y - N / 2) * dx; for (x = 0; x < N; x++) { var u = (x - N / 2) * dx; i = y * N + x; for (j = 0; j < pts.length; j++) { var w = H.pointWave(pts[j], u, v, k); Or[i] += w[0]; Oi[i] += w[1]; } } }
		var Io = H.energy(Or, Oi) / n2, A = Math.sqrt((opt.ratio || 1) * (Io > 0 ? Io : 1)), s = Math.sin((opt.thetaR || 0) * DEG), Hh = new Float64Array(n2);
		for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
			i = y * N + x; var ph = k * (x - N / 2) * dx * s, rr = A * Math.cos(ph) + Or[i], ri = A * Math.sin(ph) + Oi[i];
			Hh[i] = rr * rr + ri * ri;
		}
		return { H: Hh, O: [Or, Oi], A: A };
	};
	// centres (cycles per µm, u direction) of the three parts of a hologram's spectrum: zero order at 0, the two images at ∓ sin θR / λ
	H.lobeCentre = function (lam, thetaR) { return Math.sin(thetaR * DEG) / lam; };
	// which part of the spectrum frequency fu belongs to: 0 = zero order, 1 = the virtual-image term (R* O, centre −fR), −1 = the twin / real-image term (R O*, centre +fR)
	H.lobeOf = function (fu, fv, fR, rDC) {
		if (Math.abs(fR) < 1e-12) return 0;
		var d0 = fu * fu + fv * fv; if (rDC && d0 <= rDC * rDC) return 0;
		var dm = (fu + fR) * (fu + fR) + fv * fv, dp = (fu - fR) * (fu - fR) + fv * fv;
		if (d0 <= dm && d0 <= dp) return 0; return dm < dp ? 1 : -1;
	};
	// the illuminated plate: U = filter(H) × light × pupil. light: +1 = the reference beam again, −1 = its reversed (phase-conjugate) twin. keep = {0: bool, 1: bool, "-1": bool}
	// pupil = {u, v, r} (a camera aperture on the plate, µm) or null. Returns the spectrum of U (ready for H.propagateSpectrum).
	H.illuminate = function (opt, Hh, keep, light, pupil) {
		var N = opt.N, dx = opt.dx, n2 = N * N, re = Float64Array.from(Hh), im = new Float64Array(n2), x, y, i;
		H.fft2(re, im, N, false);
		var fR = H.lobeCentre(opt.lam, opt.thetaR || 0), rDC = opt.rDC || 0;
		if (keep && !(keep[0] && keep[1] && keep[-1])) for (y = 0; y < N; y++) { var fv = H.freq(y, N, dx); for (x = 0; x < N; x++) { var l = H.lobeOf(H.freq(x, N, dx), fv, fR, rDC); if (!keep[l]) { i = y * N + x; re[i] = 0; im[i] = 0; } } }
		H.fft2(re, im, N, true);
		var k = TAU / opt.lam, s = Math.sin((opt.thetaR || 0) * DEG) * (light < 0 ? -1 : 1);
		for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
			i = y * N + x; var u = (x - N / 2) * dx, v = (y - N / 2) * dx;
			if (pupil && ((u - pupil.u) * (u - pupil.u) + (v - pupil.v) * (v - pupil.v) > pupil.r * pupil.r)) { re[i] = 0; im[i] = 0; continue; }
			var ph = k * u * s, c = Math.cos(ph), sn = Math.sin(ph), a = re[i];
			re[i] = a * c - im[i] * sn; im[i] = a * sn + im[i] * c;
		}
		H.fft2(re, im, N, false);
		return [re, im];
	};
	// intensity picture after propagating the illuminated plate's spectrum S by z (negative = look behind the plate)
	H.imageAt = function (opt, S, z) { var o = H.propagateSpectrum(S[0], S[1], opt.N, opt.dx, opt.lam, z); H.fft2(o[0], o[1], opt.N, true); var I = new Float64Array(opt.N * opt.N); for (var i = 0; i < I.length; i++) I[i] = o[0][i] * o[0][i] + o[1][i] * o[1][i]; return I; };
	// smallest detail the hologram can show: about λ z / D (D = width of the part of the plate used)
	H.resolution = function (lam, z, D) { return lam * Math.abs(z) / D; };

	/* ---------------------------------------------------------------- thick (volume) holograms: Bragg selection */
	// layer spacing of a reflection hologram made by two beams meeting head on inside an emulsion of index n (angle thetaIn from the normal, inside): Λ = λ / (2 n cos θ)
	H.reflectionSpacing = function (lam, n, thetaInDeg) { return lam / (2 * n * Math.cos((thetaInDeg || 0) * DEG)); };
	// the colour a stack of layers with spacing Λ reflects best, light at angle thetaIn inside: λ = 2 n Λ cos θ (Bragg's law)
	H.braggLambda = function (Lambda, n, thetaInDeg) { return 2 * n * Lambda * Math.cos((thetaInDeg || 0) * DEG); };
	// angle inside the emulsion for light arriving at thetaAir from the normal (Snell)
	H.insideAngle = function (thetaAirDeg, n) { return Math.asin(Math.sin(thetaAirDeg * DEG) / n) / DEG; };
	// Kogelnik's coupled-wave diffraction efficiency of a lossless reflection grating (planes parallel to the surface) for wavelength lam.
	// g = {Lambda, n, dn (index modulation), T (thickness), thetaIn}. ν = π Δn T / (λ cos θ), ξ = (2 n k cos θ − K) T / 2. η = 1 / (1 + (1 − ξ²/ν²) / sinh²√(ν² − ξ²))
	H.reflectionEff = function (lam, g) {
		var c = Math.cos((g.thetaIn || 0) * DEG), nu = PI * g.dn * g.T / (lam * c), xi = (2 * g.n * (TAU / lam) * c - TAU / g.Lambda) * g.T / 2;
		if (nu <= 0) return 0;
		var q = nu * nu - xi * xi, r = xi * xi / (nu * nu);
		if (Math.abs(q) < 1e-9) return 1 / (1 + 1 / (nu * nu));   // limit ξ → ν: sinh² x / x² → 1
		if (q > 0) { var sh = Math.sinh(Math.sqrt(q)); return 1 / (1 + (1 - r) / (sh * sh)); }
		var sn = Math.sin(Math.sqrt(-q)); if (Math.abs(sn) < 1e-12) return 0; return 1 / (1 + (r - 1) / (sn * sn));
	};
	// thin or thick? Klein-Cook parameter Q = 2π λ T / (n Λ²): Q > 10 behaves as a volume (Bragg) grating, Q < 1 as a thin one
	H.kleinCook = function (lam, T, n, Lambda) { return TAU * lam * T / (n * Lambda * Lambda); };
	// rough width of the reflected band: Δλ ≈ λ² / (2 n T) (first zeros of the Kogelnik curve for a weak grating are at ±λ²/(2nT))
	H.reflectionBand = function (lam, n, T) { return lam * lam / (2 * n * T); };

	/* ---------------------------------------------------------------- thin gratings: rainbow and embossed holograms */
	// first-order transmission grating: sin θout = sin θin − m λ / Λ (angles from the normal, same sign convention for both). Returns degrees or null (no such order)
	H.gratingOut = function (lam, Lambda, thetaInDeg, m) { var s = Math.sin(thetaInDeg * DEG) - (m == null ? 1 : m) * lam / Lambda; return Math.abs(s) > 1 ? null : Math.asin(s) / DEG; };
	// the wavelength a grating sends from thetaIn into the direction thetaOut (first order): λ = Λ (sin θin − sin θout)
	H.gratingLambda = function (Lambda, thetaInDeg, thetaOutDeg) { return Lambda * (Math.sin(thetaInDeg * DEG) - Math.sin(thetaOutDeg * DEG)); };
	// Bessel function J_n(x) by its series (fine for |x| < 20)
	H.besselJ = function (n, x) { var s = 0, t = Math.pow(x / 2, n), f = 1, i; for (i = 2; i <= n; i++) f *= i; t /= f; for (var m = 0; m < 60; m++) { s += t; t *= -(x * x / 4) / ((m + 1) * (m + 1 + n)); if (Math.abs(t) < 1e-17) break; } return s; };
	// first-order efficiency of a thin sinusoidal phase grating with peak-to-peak phase φpp: η1 = J1²(φpp / 2). Max 33.9 % at φpp ≈ 3.68 rad
	H.thinPhaseEff = function (phiPP, m) { var j = H.besselJ(m == null ? 1 : Math.abs(m), phiPP / 2); return j * j; };
	// a surface relief of depth h seen in reflection changes the path by 2h: φpp = 2π · 2h / λ
	H.reliefPhase = function (h, lam) { return TAU * 2 * h / lam; };

	/* ---------------------------------------------------------------- Pepper's ghost: a plain reflection */
	// mirror image of point p in the line through a and b (2D). The audience sees the hidden figure at this point.
	H.reflectPoint = function (p, a, b) {
		var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, fx = a.x + t * dx, fy = a.y + t * dy;
		return { x: 2 * fx - p.x, y: 2 * fy - p.y };
	};
	// Fresnel reflectance of unpolarised light on glass of index n at incidence thetaDeg
	H.fresnelR = function (n, thetaDeg) {
		var t = thetaDeg * DEG, ci = Math.cos(t), s = Math.sin(t) / n; if (s >= 1) return 1; var ct = Math.sqrt(1 - s * s);
		var rs = (ci - n * ct) / (ci + n * ct), rp = (n * ci - ct) / (n * ci + ct); return (rs * rs + rp * rp) / 2;
	};

	/* ---------------------------------------------------------------- computer-generated holograms: Gerchberg-Saxton */
	H.rng = function (seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
	// round a phase to `levels` equal steps (0 or Infinity = keep it continuous)
	H.quantize = function (ph, levels) { if (!levels || !isFinite(levels)) return ph; var st = TAU / levels, q = Math.round(ph / st) * st; return q; };
	// far-field picture (|FFT|², shifted so the zero order is in the middle) of a phase-only hologram. depth = fraction of the full phase the device really applies (1 = perfect).
	H.cghReplay = function (phase, N, depth) {
		var re = new Float64Array(N * N), im = new Float64Array(N * N), d = depth == null ? 1 : depth, i;
		for (i = 0; i < re.length; i++) { re[i] = Math.cos(phase[i] * d); im[i] = Math.sin(phase[i] * d); }
		H.fft2(re, im, N, false); var I = new Float64Array(N * N);
		for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) { var j = ((y + N / 2) % N) * N + (x + N / 2) % N; I[y * N + x] = (re[j] * re[j] + im[j] * im[j]) / (N * N); }
		return I;
	};
	// one Gerchberg-Saxton run. target: Float64Array of amplitudes (N x N, zero order in the middle). opt: {iters, levels, seed, phase (start, optional)}.
	// Returns {phase, err: [...] (normalised error of the replay vs the target after each iteration), eff (share of light landing on the target pixels)}
	H.gs = function (target, N, opt) {
		opt = opt || {}; var n2 = N * N, rnd = H.rng(opt.seed || 7), ph = opt.phase ? Float64Array.from(opt.phase) : new Float64Array(n2), T = new Float64Array(n2), i, x, y, it;
		if (!opt.phase) for (i = 0; i < n2; i++) ph[i] = rnd() * TAU;
		var tsum = 0; for (y = 0; y < N; y++) for (x = 0; x < N; x++) { var j = ((y + N / 2) % N) * N + (x + N / 2) % N; T[j] = target[y * N + x]; tsum += T[j] * T[j]; }   // unshift the target
		var tnorm = Math.sqrt(tsum) || 1, re = new Float64Array(n2), im = new Float64Array(n2), errs = [], iters = opt.iters == null ? 30 : opt.iters;
		for (it = 0; it < iters; it++) {
			for (i = 0; i < n2; i++) { var q = H.quantize(ph[i], opt.levels); re[i] = Math.cos(q); im[i] = Math.sin(q); }
			H.fft2(re, im, N, false);
			errs.push(H.cghError(re, im, T, tnorm, n2));
			for (i = 0; i < n2; i++) { var a = Math.atan2(im[i], re[i]); re[i] = T[i] * Math.cos(a); im[i] = T[i] * Math.sin(a); }
			H.fft2(re, im, N, true);
			for (i = 0; i < n2; i++) ph[i] = Math.atan2(im[i], re[i]);
		}
		for (i = 0; i < n2; i++) { ph[i] = H.quantize(ph[i], opt.levels); ph[i] = ((ph[i] % TAU) + TAU) % TAU; }
		for (i = 0; i < n2; i++) { re[i] = Math.cos(ph[i]); im[i] = Math.sin(ph[i]); }
		H.fft2(re, im, N, false); var fin = H.cghError(re, im, T, tnorm, n2), on = 0, all = 0;
		for (i = 0; i < n2; i++) { var e = re[i] * re[i] + im[i] * im[i]; all += e; if (T[i] > 0) on += e; }
		return { phase: ph, err: errs.concat([fin]), eff: all > 0 ? on / all : 0 };
	};
	// error between the replay amplitude (scaled to best fit) and the target amplitude, as a fraction of the target's size
	H.cghError = function (re, im, T, tnorm, n2) {
		var dot = 0, aa = 0, i, a; for (i = 0; i < n2; i++) { a = Math.sqrt(re[i] * re[i] + im[i] * im[i]); dot += a * T[i]; aa += a * a; }
		var s = aa > 0 ? dot / aa : 0, e = 0; for (i = 0; i < n2; i++) { a = s * Math.sqrt(re[i] * re[i] + im[i] * im[i]) - T[i]; e += a * a; }
		return Math.sqrt(e) / tnorm;
	};

	/* ---------------------------------------------------------------- colours */
	// sRGB colour of a wavelength in nm (380-780), gamma corrected; [r, g, b] 0..255
	H.waveRGB = function (nm) {
		var r = 0, g = 0, b = 0;
		if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
		else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else if (nm <= 780) { r = 1; }
		var f = nm < 380 || nm > 780 ? 0 : nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
		function c(v) { return Math.round(255 * Math.pow(v * f, 0.8)); }
		return [c(r), c(g), c(b)];
	};
	H.colourName = function (nm) { return nm < 380 ? "ultraviolet (invisible)" : nm < 450 ? "violet" : nm < 485 ? "blue" : nm < 500 ? "cyan" : nm < 565 ? "green" : nm < 590 ? "yellow" : nm < 625 ? "orange" : nm <= 750 ? "red" : "infrared (invisible)"; };
	H.sig = function (v, d) { if (v == null || !isFinite(v)) return v === Infinity ? "∞" : "–"; if (v === 0) return "0"; d = d || 3; var a = Math.abs(v); if (a >= 1e5 || a < 1e-3) return v.toExponential(d - 1).replace("e+", "e"); return String(Number(v.toPrecision(d))); };
	// a length in µm written in the best unit
	H.len = function (um, d) { var a = Math.abs(um); if (!isFinite(um)) return "∞"; if (a < 1) return H.sig(um * 1000, d) + " nm"; if (a < 1000) return H.sig(um, d) + " µm"; if (a < 1e6) return H.sig(um / 1000, d) + " mm"; return H.sig(um / 1e6, d) + " m"; };

	if (typeof module !== "undefined" && module.exports) module.exports = H; else root.MESHolo = H;
})(typeof window !== "undefined" ? window : this);
