// node tool_apps_src/hologram-tests.js  -- MES Hologram Simulator (lib.js = MESHolo)
"use strict";
const H = require("./hologram/lib.js"); let f = 0, n = 0;
function ok(c, m) { n++; if (!c) { f++; console.log("FAIL", m); } }
function near(a, b, tol, m) { n++; const e = Math.abs(a - b); if (!(e <= tol)) { f++; console.log("FAIL", m, a, "vs", b); } }
const DEG = Math.PI / 180;

// 1. fringe spacing: d = λ / (2 sin(θ/2)), and on the plate for symmetric beams the same
near(H.fringeSpacing(0.6328, 30), 0.6328 / (2 * Math.sin(15 * DEG)), 1e-12, "fringe spacing formula");
near(H.fringeSpacing(0.5, 180), 0.25, 1e-12, "head-on beams: λ/2 (standing wave)");
near(H.plateSpacing(0.6328, 15, -15), H.fringeSpacing(0.6328, 30), 1e-12, "symmetric beams: plate spacing = fringe spacing");
near(H.plateSpacing(0.6328, 30, 0), 0.6328 / 0.5, 1e-12, "30 degrees off-axis: λ / sin 30");
ok(H.fringeSpacing(0.6, 0) === Infinity, "parallel beams: no fringes");
// measured on the recorded intensity: two plane-ish waves (object point very far away, straight ahead) -> period λ / sin θR
{
	const lam = 0.6328, th = 20, k = 2 * Math.PI / lam, far = { u: 0, v: 0, z: 1e9, a: 1, ph: -k * 1e9 }, d = lam / Math.sin(th * DEG);
	// find successive maxima of I(u) along u
	let prev = null, maxima = [];
	for (let u = 0; u < 6 * d; u += d / 400) { const I = H.recordAt([far], u, 0, { lam, thetaR: th, ampR: 1, Lc: Infinity }); if (prev && prev[1] > prev[0] && prev[1] >= I) maxima.push(u - d / 400); prev = prev ? [prev[1], I] : [I, I]; }
	near(maxima[2] - maxima[1], d, d / 200, "recorded fringes have period λ / sin θ");
	const Imax = H.recordAt([far], 0, 0, { lam, thetaR: th, ampR: 1 }), Imin = H.recordAt([far], d / 2, 0, { lam, thetaR: th, ampR: 1 });
	near((Imax - Imin) / (Imax + Imin), 1, 1e-6, "equal beams: full contrast");
	const I2 = H.recordAt([{ u: 0, v: 0, z: 1e9, a: 0.5, ph: -k * 1e9 }], 0, 0, { lam, thetaR: th, ampR: 1 }), I3 = H.recordAt([{ u: 0, v: 0, z: 1e9, a: 0.5, ph: -k * 1e9 }], d / 2, 0, { lam, thetaR: th, ampR: 1 });
	near((I2 - I3) / (I2 + I3), H.visibility(4), 1e-6, "beam ratio 4: visibility 2√4/5 = 0.8");
	near(H.visibility(4), 0.8, 1e-12, "visibility formula");
	ok(k > 0, "k");
}
// 2. coherence
near(H.coherence(0, 1), 1, 0, "zero path difference: full coherence");
near(H.coherence(2 * Math.LN2 / Math.PI, 1), 0.5, 1e-12, "half coherence at Lc·2ln2/π");
ok(H.coherence(3, 1) < 1e-8, "three coherence lengths: no fringes");
near(H.coherenceLength(0.6328, 0.6328 * 0.6328 / 2e5), 2e5, 1e-6, "Lc = λ²/Δλ");
{   // a short coherence length washes the fringes out in the recorded pattern too
	const lam = 0.6, pt = [{ u: 0, v: 0, z: 1e9, a: 1, ph: -2 * Math.PI / 0.6 * 1e9 }], d = lam / Math.sin(10 * DEG);
	const con = Lc => { const a = H.recordAt(pt, 0, 0, { lam, thetaR: 10, Lc, refPath: 1e9 + 30 }), b = H.recordAt(pt, d / 2, 0, { lam, thetaR: 10, Lc, refPath: 1e9 + 30 }); return (a - b) / (a + b); };
	near(con(Infinity), 1, 1e-6, "laser: full contrast"); near(con(100), H.coherence(30, 100), 1e-3, "contrast = |γ(ΔL)|"); ok(con(5) < 1e-3, "LED-like source with 30 µm path difference: no fringes");
}
near(H.motionContrast(0, 0.6), 1, 0, "no motion"); near(H.motionContrast(0.3, 0.6), 0, 1e-12, "moving λ/2 (path λ) wipes the fringes"); ok(H.motionContrast(0.6 / 8, 0.6) > 0.89, "λ/8 keeps ~90 %");
H.SOURCES.forEach(s => ok(H.coherenceLength(s.lam, s.dlam) > 0, "source " + s.id));

// 3. FFT
{
	const N = 64, re = new Float64Array(N * N), im = new Float64Array(N * N), r = H.rng(3);
	for (let i = 0; i < re.length; i++) { re[i] = r() - 0.5; im[i] = r() - 0.5; }
	const r0 = Float64Array.from(re), i0 = Float64Array.from(im), E = H.energy(re, im);
	H.fft2(re, im, N, false); near(H.energy(re, im) / (N * N), E, 1e-9 * E, "Parseval");
	H.fft2(re, im, N, true); let m = 0; for (let i = 0; i < re.length; i++) m = Math.max(m, Math.abs(re[i] - r0[i]), Math.abs(im[i] - i0[i])); ok(m < 1e-12, "FFT round trip " + m);
	const a = new Float64Array(8), b = new Float64Array(8); a[1] = 1; H.fft(a, b); near(a[2], Math.cos(-2 * 2 * Math.PI / 8), 1e-12, "1D FFT of a delta at 1"); near(b[2], Math.sin(-2 * 2 * Math.PI / 8), 1e-12, "1D FFT phase");
}
// 4. angular spectrum: band-limited field keeps its energy, back-propagation undoes forward
{
	const N = 64, dx = 1, lam = 0.5, re = new Float64Array(N * N), im = new Float64Array(N * N);
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const g = Math.exp(-((x - 32) ** 2 + (y - 30) ** 2) / 30); re[y * N + x] = g; }
	const E = H.energy(re, im), p = H.propagate(re, im, N, dx, lam, 400); near(H.energy(p[0], p[1]), E, 1e-9 * E, "propagation keeps energy");
	const q = H.propagate(p[0], p[1], N, dx, lam, -400); let m = 0; for (let i = 0; i < re.length; i++) m = Math.max(m, Math.abs(q[0][i] - re[i]), Math.abs(q[1][i])); ok(m < 1e-9, "forward then backward = original " + m);
	let wide = 0, pk = 0; for (let i = 0; i < re.length; i++) { const v = p[0][i] ** 2 + p[1][i] ** 2; if (v > 0.25 * pk) wide++; pk = Math.max(pk, v); } ok(pk < 1, "the beam spreads (peak falls)");
	near(H.maxAngle(0.6328, 0.8), Math.asin(0.6328 / 1.6) / DEG, 1e-9, "grid angle limit");
}
// 5. numerical hologram: record a point, light the plate with the reference, look back at the point's distance: a sharp spot exactly there
{
	const opt = { N: 128, dx: 0.8, lam: 0.6328, thetaR: 6, ratio: 3 }, pt = { u: 12, v: -8, z: 800, a: 1 }, rec = H.makeHologram(opt, [pt]);
	const S = H.illuminate(opt, rec.H, { 0: false, 1: true, "-1": false }, 1, null);
	const peakOf = I => { let b = 0, j = 0; for (let i = 0; i < I.length; i++) if (I[i] > b) { b = I[i]; j = i; } return { b, x: (j % opt.N - opt.N / 2) * opt.dx, y: (Math.floor(j / opt.N) - opt.N / 2) * opt.dx }; };
	const at = peakOf(H.imageAt(opt, S, -800)), off = peakOf(H.imageAt(opt, S, -400));
	near(at.x, pt.u, 1.7, "virtual image at the right place (u)"); near(at.y, pt.v, 1.7, "virtual image at the right place (v)");
	ok(at.b > 3 * off.b, "the image is sharp only at the recorded distance");
	// the reversed reference gives the real image in front of the plate
	const S2 = H.illuminate(opt, rec.H, { 0: false, 1: false, "-1": true }, -1, null), re2 = peakOf(H.imageAt(opt, S2, 800));
	near(re2.x, pt.u, 1.7, "real image (reversed reference) at +z"); ok(re2.b > 3 * peakOf(H.imageAt(opt, S2, 400)).b, "real image in focus at +z");
	// the spectrum lobes
	near(H.lobeCentre(0.6328, 6), Math.sin(6 * DEG) / 0.6328, 1e-12, "lobe centre"); ok(H.lobeOf(0, 0, 0.1) === 0 && H.lobeOf(-0.1, 0, 0.1) === 1 && H.lobeOf(0.1, 0, 0.1) === -1, "lobe classes"); ok(H.lobeOf(0.1, 0, 0) === 0, "in-line: everything is one lobe");
	// a camera aperture moved sideways: a point out of focus shifts (parallax), the one in focus does not
	const two = [{ u: 0, v: 0, z: 600, a: 1 }, { u: 0, v: 0, z: 1000, a: 1 }], r2 = H.makeHologram(opt, two);
	const look = e => { const S3 = H.illuminate(opt, r2.H, { 0: false, 1: true, "-1": false }, 1, { u: e, v: 0, r: 22 }), I = H.imageAt(opt, S3, -1000); let c = 0, s = 0; for (let y = 0; y < opt.N; y++) for (let x = 0; x < opt.N; x++) { const w = I[y * opt.N + x]; s += w; c += w * (x - opt.N / 2) * opt.dx; } return { pk: peakOf(I), cx: c / s }; };
	const L = look(-25), R = look(25);
	near(L.pk.x, 0, 2.5, "the far point (in focus) stays put from the left"); near(R.pk.x, 0, 2.5, "and from the right");
	ok(Math.abs(L.cx - R.cx) > 3, "the near point's blur moves as the camera moves (parallax) " + (L.cx - R.cx));
	near(H.resolution(0.6328, 1000, 100), 6.328, 1e-12, "resolution λz/D");
}
// 6. Bragg selection in a reflection hologram
{
	const lam = 0.532, n = 1.5, L = H.reflectionSpacing(lam, n, 0);
	near(L, lam / 3, 1e-12, "Λ = λ / 2n"); near(H.braggLambda(L, n, 0), lam, 1e-12, "replays the recording colour");
	const g = { Lambda: L, n, dn: 0.02, T: 10, thetaIn: 0 };
	near(H.reflectionEff(lam, g), Math.tanh(Math.PI * 0.02 * 10 / lam) ** 2, 1e-12, "on Bragg: η = tanh²ν");
	let best = 0, bl = 0; for (let l = 0.4; l < 0.7; l += 0.0002) { const e = H.reflectionEff(l, g); if (e > best) { best = e; bl = l; } } near(bl, lam, 0.001, "white light: the reflected peak is the recording colour");
	ok(H.reflectionEff(0.62, g) < 0.02, "red is not reflected by a green hologram");
	const shr = { Lambda: L * 0.95, n, dn: 0.02, T: 10 }; let b2 = 0, l2 = 0; for (let l = 0.4; l < 0.7; l += 0.0002) { const e = H.reflectionEff(l, shr); if (e > b2) { b2 = e; l2 = l; } } near(l2, lam * 0.95, 0.001, "5 % shrinkage shifts the colour 5 % bluer");
	const tilt = H.insideAngle(30, n); near(H.braggLambda(L, n, tilt), lam * Math.cos(tilt * DEG), 1e-12, "tilting shifts the colour blue: λ cos θ");
	const thick = { Lambda: L, n, dn: 0.002, T: 40 }, thin = { Lambda: L, n, dn: 0.008, T: 10 }, width = gg => { let c = 0; for (let l = 0.45; l < 0.62; l += 0.0001) if (H.reflectionEff(l, gg) > 0.5 * H.reflectionEff(lam, gg)) c++; return c; };
	ok(width(thick) < width(thin), "thicker emulsion: narrower colour band");
	ok(H.kleinCook(lam, 10, n, L) > 10, "a reflection hologram is thick (volume)"); ok(H.kleinCook(0.6, 0.3, 1.5, 1.5) < 1, "an embossed relief is thin");
	near(H.reflectionBand(0.5, 1.5, 10), 0.25 / 30, 1e-12, "band width estimate");
}
// 7. thin gratings
near(H.gratingOut(0.5, 1, 0), -30, 1e-9, "first order at 30 degrees"); ok(H.gratingOut(0.8, 0.5, 0) === null, "no order when λ > Λ");
near(H.gratingLambda(1, 30, 0), 0.5, 1e-12, "the colour seen in a direction");
near(H.besselJ(0, 0), 1, 1e-12, "J0(0)"); near(H.besselJ(1, 1.8412), 0.58187, 1e-4, "J1 max"); near(H.besselJ(0, 2.4048), 0, 1e-4, "J0 first zero");
near(H.thinPhaseEff(2 * 1.8412), 0.3386, 1e-3, "thin sinusoidal phase grating: at most 33.9 %");
near(H.reliefPhase(0.1, 0.5), 2 * Math.PI * 0.4, 1e-12, "relief depth to phase (reflection, path 2h)");
{   // energy: all thin-grating orders add to 1
	let s = 0; for (let m = -12; m <= 12; m++) s += H.thinPhaseEff(3, m); near(s, 1, 1e-9, "orders of a thin phase grating add up to 1");
}
// 8. Pepper's ghost
{ const p = H.reflectPoint({ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }); near(p.x, 0, 1e-12, "mirror x"); near(p.y, 2, 1e-12, "mirror y"); }
near(H.fresnelR(1.5, 0), 0.04, 1e-12, "glass reflects 4 % head on"); ok(H.fresnelR(1.5, 45) > 0.04 && H.fresnelR(1.5, 45) < 0.07, "about 5 % at 45 degrees");
// 9. Gerchberg-Saxton
{
	const N = 64, T = new Float64Array(N * N); for (let y = 10; y < 24; y++) for (let x = 36; x < 52; x++) if ((x + y) % 3) T[y * N + x] = 1;
	const g = H.gs(T, N, { iters: 25, seed: 5 }), e = g.err;
	ok(e[e.length - 1] < e[0] * 0.8, "GS error falls " + e[0].toFixed(3) + " -> " + e[e.length - 1].toFixed(3));
	ok(e[10] <= e[1] + 1e-9, "GS error does not grow");
	ok(g.eff > 0.6, "most of the light lands on the picture " + g.eff.toFixed(3));
	const b = H.gs(T, N, { iters: 25, seed: 5, levels: 2 }); ok(b.eff < g.eff, "binary phase loses light");
	const I = H.cghReplay(b.phase, N, 1); let tw = 0, tg = 0; for (let y = 10; y < 24; y++) for (let x = 36; x < 52; x++) { tg += I[y * N + x]; tw += I[((N - y) % N) * N + (N - x) % N]; }
	near(tw / tg, 1, 0.02, "binary phase hologram makes an equally bright twin, point-mirrored");
	const Ic = H.cghReplay(g.phase, N, 1); let tw2 = 0, tg2 = 0; for (let y = 10; y < 24; y++) for (let x = 36; x < 52; x++) { tg2 += Ic[y * N + x]; tw2 += Ic[((N - y) % N) * N + (N - x) % N]; } ok(tw2 < 0.2 * tg2, "continuous phase: weak twin");
	let tot = 0; for (const v of Ic) tot += v; near(tot, N * N, 1e-6 * N * N, "replay keeps the light (energy)");
	const Iz = H.cghReplay(g.phase, N, 0.7); ok(Iz[(N / 2) * N + N / 2] > 10 * Ic[(N / 2) * N + N / 2], "too little phase depth makes a bright zero-order spot");
	near(H.quantize(1.0, 4), Math.PI / 2, 1e-12, "quantize to 4 levels");
}
// 10. formatting / colour
ok(H.len(0.5) === "500 nm" && H.len(2500) === "2.5 mm", "length format"); ok(H.waveRGB(532)[1] > 200, "532 nm is green"); ok(H.colourName(650) === "red", "colour name");

console.log((f ? f + " of " + n + " checks FAILED" : "all " + n + " checks passed"));
process.exit(f ? 1 : 0);
