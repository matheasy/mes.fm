/* node tool_apps_src/audio-tests.js  --  pure parts of the MES Audio Editor (tool_apps_src/audio/lib.js = MESAudio)
 * and of the shared noise removal (mes.fm/main_js/denoise.js = MESDenoise.dsp). The neural networks themselves are not run here. */
"use strict";
var path = require("path"), DN = require(path.join(__dirname, "../mes.fm/main_js/denoise.js")), D = DN.dsp, A = require(path.join(__dirname, "audio/lib.js"));
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("FAIL: " + m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + " (got " + a + ", want " + b + ")"); }
function rng(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; }; }
function tone(sr, sec, f, amp) { var n = Math.round(sr * sec), x = new Float32Array(n), i; for (i = 0; i < n; i++) x[i] = (amp || 0.5) * Math.sin(2 * Math.PI * f * i / sr); return x; }
function rms(x, a, b) { var s = 0, i; a = a || 0; b = b || x.length; for (i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); }

/* ---- denoise.js DSP ---- */
(function () {
	[960, 1024, 2048, 480, 7 * 11].forEach(function (n) {
		var p = D.fftPlan(n), re = new Float64Array(n), im = new Float64Array(n), r = rng(n), i, k, x = [];
		for (i = 0; i < n; i++) { re[i] = r(); im[i] = r(); x.push([re[i], im[i]]); }
		p.fwd(re, im);
		var err = 0;
		[0, 1, 5, n >> 1, n - 1].forEach(function (k2) { var a = 0, b = 0; for (i = 0; i < n; i++) { var w = -2 * Math.PI * k2 * i / n; a += x[i][0] * Math.cos(w) - x[i][1] * Math.sin(w); b += x[i][0] * Math.sin(w) + x[i][1] * Math.cos(w); } err = Math.max(err, Math.abs(a - re[k2]), Math.abs(b - im[k2])); });
		ok(err < 1e-8, "FFT " + n + " matches the DFT");
		p.inv(re, im); err = 0; for (k = 0; k < n; k++) err = Math.max(err, Math.abs(re[k] / n - x[k][0]), Math.abs(im[k] / n - x[k][1]));
		ok(err < 1e-10, "inverse FFT " + n + " round trip");
	});
	var w = D.vorbisWindow(960), pr = 0, i;
	for (i = 0; i < 480; i++) pr = Math.max(pr, Math.abs(w[i] * w[i] + w[i + 480] * w[i + 480] - 1));
	ok(pr < 1e-6, "Vorbis window is power complementary (perfect reconstruction)");
	/* the canonical bands of the soniqo export's auxiliary file */
	ok(D.erbBands(48000, 960, 32, 2).join(",") === "2,2,2,2,2,2,2,2,2,2,2,2,2,5,5,7,7,8,10,12,13,15,18,20,24,28,31,37,42,50,56,67", "ERB bands = libDF erb_fb");
	ok(D.erbBands(48000, 960, 32, 2).reduce(function (a, b) { return a + b; }, 0) === 481, "ERB bands cover 481 bins");
	/* analysis -> identity mask / filter -> synthesis gives the input back */
	var x = new Float32Array(48000), r = rng(5); for (i = 0; i < x.length; i++) x[i] = 0.3 * r();
	var an = D.dfnAnalysis(x), m = new Float32Array(an.T * 32).fill(1), cf = new Float32Array(5 * an.T * 96 * 2), t, f;
	for (t = 0; t < an.T; t++) for (f = 0; f < 96; f++) cf[((2 * an.T + t) * 96 + f) * 2] = 1;
	var y = D.dfnSynthesis(an, m, cf, 100), e = 0; for (i = 0; i < x.length; i++) e = Math.max(e, Math.abs(y[i] - x[i]));
	ok(e < 1e-5, "DeepFilterNet STFT round trip is exact (" + e + ")");
	ok(an.T === Math.ceil((48000 + 960) / 480), "frame count includes the 960-sample tail");
	ok(an.erb.length === an.T * 32 && an.spec.length === 2 * an.T * 96, "feature tensor sizes");
	var allFinite = true; for (i = 0; i < an.erb.length; i++) if (!isFinite(an.erb[i])) allFinite = false; ok(allFinite, "ERB features are finite on noise");
	/* zero mask, zero coefficients -> silence; limit 12 dB -> 1/4 of the input survives */
	var z = D.dfnSynthesis(an, new Float32Array(an.T * 32), new Float32Array(cf.length), 100); ok(rms(z) < 1e-9, "zero mask = silence");
	var lim = D.dfnSynthesis(an, new Float32Array(an.T * 32), new Float32Array(cf.length), 12); near(rms(lim) / rms(x), Math.pow(10, -12 / 20), 0.002, "attenuation limit mixes the noisy signal back");
	/* resampler */
	var s = tone(48000, 1, 1000), up = D.resample(s, 48000, 44100), back = D.resample(up, 44100, 48000);
	ok(up.length === 44100, "resample length");
	ok(D.siSdr(s.subarray(2000, 46000), back.subarray(2000, 46000)) > 60, "resample 48k -> 44.1k -> 48k is transparent");
	near(rms(up, 2000, 40000), rms(s, 2000, 40000), 0.002, "resample keeps the level");
	var hf = tone(48000, 0.5, 20000), dn = D.resample(hf, 48000, 22050); ok(rms(dn, 500, dn.length - 500) < 0.01, "resampler removes content above the new Nyquist");
	/* hum */
	var sr = 48000, hum = new Float32Array(sr * 3), r2 = rng(9);
	for (i = 0; i < hum.length; i++) { var tt = i / sr; hum[i] = 0.05 * r2() + 0.2 * Math.sin(2 * Math.PI * 50 * tt) + 0.1 * Math.sin(2 * Math.PI * 150 * tt); }
	var det = D.detectHum([hum], sr); ok(det.base === 50, "detects 50 Hz hum (" + det.base + ", " + det.db.toFixed(1) + " dB)");
	ok(D.detectHum([tone(sr, 2, 440, 0.3)], sr).base === 0, "no hum in a 440 Hz tone");
	var cleaned = D.humRemove([hum], sr, { base: "auto" })[0];
	var h50 = function (a) { var c = 0, d = 0; for (var k = sr; k < 2 * sr; k++) { c += a[k] * Math.cos(2 * Math.PI * 50 * k / sr); d += a[k] * Math.sin(2 * Math.PI * 50 * k / sr); } return Math.hypot(c, d); };
	ok(h50(cleaned) < h50(hum) / 30, "hum removal cuts 50 Hz by > 30 dB");
	var drift = new Float32Array(sr * 4); for (i = 0; i < drift.length; i++) drift[i] = 0.2 * Math.sin(2 * Math.PI * 59.94 * i / sr) + 0.05 * Math.sin(2 * Math.PI * 119.88 * i / sr);
	near(D.refineHum([drift], sr, 60), 59.94, 0.021, "finds the exact hum frequency (59.94 Hz)");
	var voice = new Float32Array(sr * 2), r5 = rng(2); for (i = 0; i < voice.length; i++) { var tv = i / sr, f0 = 110 + 25 * Math.sin(tv * 2); voice[i] = 0.1 * (Math.sin(2 * Math.PI * f0 * tv) + 0.5 * Math.sin(4 * Math.PI * f0 * tv)) + 0.01 * r5(); }
	ok(D.siSdr(voice, D.humRemove([voice], sr, { base: 60, refine: false })[0]) > 20, "hum notches barely touch a voice-like signal");
	near(rms(D.humRemove([tone(sr, 1, 1000, 0.5)], sr, { base: 50 })[0], 2000, 46000), rms(tone(sr, 1, 1000, 0.5)), 0.01, "hum notches leave 1 kHz alone");
	/* spectral gate: noise-profile denoising improves a tone in white noise and learns from a noise sample */
	var clean = tone(sr, 3, 440, 0.3); for (i = 0; i < clean.length; i++) clean[i] *= i > sr && i < 2 * sr ? 1 : 0;
	var noisy = new Float32Array(clean.length), r3 = rng(4); for (i = 0; i < noisy.length; i++) noisy[i] = clean[i] + 0.05 * r3();
	var g1 = D.spectral([noisy], sr, { reduceDb: 24 })[0];
	ok(D.siSdr(clean, g1) > D.siSdr(clean, noisy) + 6, "spectral gate improves SI-SDR by > 6 dB (" + D.siSdr(clean, noisy).toFixed(1) + " -> " + D.siSdr(clean, g1).toFixed(1) + ")");
	var g2 = D.spectral([noisy], sr, { reduceDb: 24, noise: [noisy.subarray(0, sr)] })[0];
	ok(D.siSdr(clean, g2) > D.siSdr(clean, noisy) + 6, "spectral gate with a learned noise profile");
	ok(g1.length === noisy.length, "spectral keeps the length");
	ok(D.strengthDb(1) >= 99 && D.strengthDb(0) === 0 && near1(D.strengthDb(0.3), 12), "strength -> attenuation limit");
	function near1(a, b) { return Math.abs(a - b) < 1e-9; }
	ok(D.sameChannels([noisy, noisy]) && !D.sameChannels([noisy, clean]), "identical stereo channels are detected");
	ok(DN.models.map(function (q) { return q.id; }).join() === "deepfilter,rnnoise,spectral", "model list");
})();

/* ---- lib.js (MESAudio) ---- */
(function () {
	var sr = 48000, i;
	ok(A.fmtTime(62.5) === "1:02.500" && A.fmtTime(3661, 0) === "1:01:01" && A.fmtTime(59.9996) === "1:00.000", "time format");
	near(A.parseTime("1:02.5"), 62.5, 1e-9, "parse m:ss.s"); near(A.parseTime("90s"), 90, 0, "parse 90s"); near(A.parseTime("2m"), 120, 0, "parse 2m"); near(A.parseTime("1:00:02"), 3602, 0, "parse h:mm:ss");
	ok(isNaN(A.parseTime("abc")) && isNaN(A.parseTime("1:x")), "unreadable times are NaN");
	/* clip editing */
	var ramp = new Float32Array(1000); for (i = 0; i < 1000; i++) ramp[i] = i;
	var t = A.track({ nch: 1, clips: [A.clip(100, [ramp])] });
	ok(A.trackEnd(t) === 1100, "track end");
	var d = A.deleteRange(t, 300, 500, true); ok(A.trackEnd(d) === 900 && d.clips.length === 2, "ripple delete shortens and splits");
	var r = A.renderTrack(d, 100, 900)[0]; ok(r[199] === 199 && r[200] === 400 && r[799] === 999, "ripple delete joins the two sides");
	var nr = A.deleteRange(t, 300, 500, false); ok(A.trackEnd(nr) === 1100 && A.renderTrack(nr, 0, 1100)[0][350] === 0, "delete without ripple leaves a gap");
	var cp = A.copyRange(t, 50, 150); ok(cp.len === 100 && cp.clips.length === 1 && cp.clips[0].start === 50 && cp.clips[0].ch[0][0] === 0 && cp.clips[0].ch[0][49] === 49, "copy range with leading gap");
	var ins = A.insert(t, 600, A.copyRange(t, 100, 200)); ok(A.trackEnd(ins) === 1200, "paste moves later audio right");
	var ri = A.renderTrack(ins, 0, 1200)[0]; ok(ri[599] === 499 && ri[600] === 0 && ri[699] === 99 && ri[700] === 500, "paste content in order");
	var sp = A.split(t, 500); ok(sp.clips.length === 2 && sp.clips[1].start === 500 && sp.clips[1].ch[0][0] === 400, "split");
	var tr = A.trim(t, 200, 400); ok(tr.clips.length === 1 && tr.clips[0].start === 200 && A.clipLen(tr.clips[0]) === 200, "trim keeps the position");
	var mr = A.mapRange(t, 200, 300, function (seg) { return A.silence(seg); }); var rm = A.renderTrack(mr, 0, 1100)[0]; ok(rm[199] === 99 && rm[200] === 0 && rm[299] === 0 && rm[300] === 200, "silence a range");
	ok(t.clips[0].ch[0][250] === 250, "edits never change the original arrays");
	var st = A.insert(A.track({ nch: 2, clips: [A.clip(0, [new Float32Array(10), new Float32Array(10)])] }), 5, A.copyRange(t, 100, 104)); ok(st.clips.every(function (c) { return c.ch.length === 2; }), "mono pasted into stereo becomes stereo");
	near(A.conform([new Float32Array([1]), new Float32Array([0])], 1)[0][0], 0.5, 1e-9, "stereo to mono = average");
	/* mix: pan law and gain, solo, mute */
	var one = new Float32Array(10).fill(0.5), ta = A.track({ nch: 1, clips: [A.clip(0, [one])] }), tb = A.track({ nch: 1, gain: -6.0206, clips: [A.clip(0, [one])] });
	var mx = A.mix([ta, tb], 0, 10, 2); near(mx[0][3], 0.75, 1e-4, "mix sums tracks with gain"); near(mx[1][3], 0.75, 1e-4, "centre pan = unity both sides");
	ok(A.mix([ta, A.track({ nch: 1, mute: true, clips: [A.clip(0, [one])] })], 0, 10, 1)[0][0] === 0.5, "mute");
	ok(A.mix([ta, A.track({ nch: 1, solo: true, clips: [A.clip(0, [one])] })], 0, 10, 1)[0][0] === 0.5, "solo");
	var pl = A.pan(-1); near(pl[0], Math.SQRT2, 1e-9, "hard left pan"); near(pl[1], 0, 1e-9, "hard left pan mutes right");
	/* peaks */
	var pk = A.peaks(new Float32Array([0, 1, -2, 3, 0.5]), 2); ok(pk.min.length === 3 && pk.max[1] === 3 && pk.min[1] === -2, "peaks");
	var ps = A.peakSet([new Float32Array(5000).fill(0.25)]); ok(ps[0].length === 3 && ps[0][2].block === 4096 && ps[0][2].max[0] === 0.25, "peak pyramid");
	/* fades / gain */
	var f = A.fade([new Float32Array(100).fill(1)], "in", "linear")[0]; ok(f[0] < 0.01 && f[99] > 0.99 && Math.abs(f[49] - 0.495) < 1e-6, "linear fade in");
	var fo = A.fade([new Float32Array(100).fill(1)], "out", "equal")[0]; ok(fo[0] > 0.99 && fo[99] < 0.02, "equal-power fade out");
	var piece2 = A.fade([new Float32Array(50).fill(1)], "in", "linear", 100, 50)[0]; ok(Math.abs(piece2[0] - 0.505) < 1e-6, "fade piece knows its place in the range");
	near(A.peak(A.gain([new Float32Array([0.5])], 6.0206)), 1, 1e-4, "gain +6 dB doubles");
	near(A.normalizePeakGain([new Float32Array([0.25, -0.5])], -1), -1 - A.gainToDb(0.5), 1e-9, "normalize to -1 dBFS");
	/* EQ */
	var hp = A.biquad("highpass", 80, sr, 0.707); near(A.response(hp, 80, sr), -3.01, 0.05, "high-pass -3 dB at its corner"); ok(A.response(hp, 20, sr) < -20 && Math.abs(A.response(hp, 1000, sr)) < 0.1, "high-pass passband / stopband");
	var pkf = A.biquad("peak", 3000, sr, 1, 6); near(A.response(pkf, 3000, sr), 6, 0.01, "peak filter gain at centre");
	near(A.eqResponse(A.EQ_PRESETS.voice.bands, sr, 3200), 3, 0.6, "voice preset lifts presence");
	ok(A.eqResponse(A.EQ_PRESETS.lowcut.bands, sr, 30) < -12, "low cut removes rumble");
	var s1k = tone(sr, 1, 1000, 0.5), e1 = A.eq([s1k], sr, A.EQ_PRESETS.lowcut.bands)[0]; near(rms(e1, 4800, 48000), rms(s1k, 4800, 48000), 0.005, "low cut keeps 1 kHz");
	/* loudness: a full-scale 997 Hz sine is -3.01 LUFS (EBU Tech 3341), stereo +3 dB */
	var fs = tone(sr, 5, 997, 1); near(A.loudness([fs], sr).integrated, -3.01, 0.08, "1 kHz full-scale sine = -3.01 LUFS");
	near(A.loudness([fs, fs], sr).integrated, 0, 0.08, "stereo sums the channels");
	var q = tone(sr, 5, 997, 0.1); near(A.loudness([q], sr).integrated, -23.01, 0.08, "-20 dBFS sine = -23 LUFS");
	near(A.loudness([tone(44100, 5, 997, 1)], 44100).integrated, -3.01, 0.1, "K-weighting at 44.1 kHz");
	/* gating: silence is ignored */
	var gap = new Float32Array(sr * 10); gap.set(tone(sr, 5, 997, 0.1)); near(A.loudness([gap], sr).integrated, -23.01, 0.25, "silence is gated out");
	ok(A.loudness([new Float32Array(sr * 2)], sr).integrated === -Infinity, "silence = -inf LUFS");
	/* true peak: fs/4 sine at 45 degrees has sample peaks of 0.707 but a true peak of 1.0 */
	var tp = new Float32Array(4800); for (i = 0; i < tp.length; i++) tp[i] = Math.sin(2 * Math.PI * i / 4 + Math.PI / 4);
	near(A.peak([tp]), Math.SQRT1_2, 1e-6, "sample peak of the 45-degree fs/4 sine"); near(A.truePeak([tp]), 0, 0.15, "true peak finds the inter-sample peak");
	/* limiter never exceeds its ceiling */
	var loud = tone(sr, 1, 220, 1.6), lim = A.limiter([loud], sr, -1, 50, 5); ok(A.peak(lim) <= A.dbToGain(-1) + 1e-6, "limiter holds -1 dBFS (" + A.gainToDb(A.peak(lim)).toFixed(3) + ")");
	var spike = new Float32Array(sr).fill(0.1); spike[24000] = 2; var ls = A.limiter([spike], sr, -1, 50, 5)[0]; ok(Math.abs(ls[24000]) <= A.dbToGain(-1) + 1e-6 && Math.abs(ls[10000] - 0.1) < 1e-6, "limiter catches a single spike and leaves the rest");
	/* loudness normalisation to -16 LUFS with a -1 dBTP ceiling */
	var r9 = rng(3), mus = new Float32Array(sr * 6); for (i = 0; i < mus.length; i++) mus[i] = 0.05 * Math.sin(2 * Math.PI * 300 * i / sr) * (1 + Math.sin(i / sr * 3)) + 0.01 * r9();
	mus[sr * 3] = 0.9;
	var ln = A.loudnessNormalize([mus], sr, -16, -1); near(ln.after, -16, 0.5, "normalised to -16 LUFS (" + ln.after.toFixed(2) + ")"); ok(ln.tp <= -0.9, "true peak under the ceiling (" + ln.tp.toFixed(2) + ")");
	/* compressor */
	var cmp = A.compress([tone(sr, 1, 440, 1)], sr, { threshold: -20, ratio: 4, knee: 0, attack: 1, release: 50, makeup: 0 })[0];
	near(A.gainToDb(rms(cmp, 24000, 48000) * Math.SQRT2), -20 + 20 / 4, 1, "4:1 above -20 dB: 0 dB in -> about -15 dB out");
	near(A.compRedDb(0, { threshold: -20, ratio: 4, knee: 0 }), -15, 1e-9, "static curve");
	/* de-click */
	var s5 = tone(sr, 1, 300, 0.3), dirty = s5.slice(); [5000, 12000, 30001].forEach(function (p) { dirty[p] += 0.6; });
	var dc = A.declick([dirty], sr, 0.5); ok(dc.fixed >= 3, "found the clicks (" + dc.fixed + ")"); ok(DN.dsp.siSdr(s5, dc[0]) > DN.dsp.siSdr(s5, dirty) + 15, "de-click restores the waveform");
	ok(A.declick([s5], sr, 0.5).fixed === 0, "no clicks in a clean tone");
	/* WAV */
	var w16 = A.readWav(A.wav([new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([0.25, 0, 0, -1])], 44100, 16));
	ok(w16.sr === 44100 && w16.ch.length === 2 && Math.abs(w16.ch[0][1] - 0.5) < 1e-4 && Math.abs(w16.ch[1][3] + 1) < 1e-4, "WAV 16-bit round trip");
	var w24 = A.readWav(A.wav([new Float32Array([0.123456])], 48000, 24)); near(w24.ch[0][0], 0.123456, 1e-6, "WAV 24-bit");
	var w32 = A.readWav(A.wav([new Float32Array([1.5])], 48000, 32)); near(w32.ch[0][0], 1.5, 1e-7, "WAV 32-bit float keeps overs");
	ok(A.mp3Rate(48000) === 48000 && A.mp3Rate(96000) === 48000 && A.mp3Rate(22050) === 44100, "MP3 rates");
	ok(A.fileName("My talk.m4a", "mp3") === "My talk.mp3" && A.fileName("a/b?c", "wav") === "a-b-c.wav", "export names");
	/* history */
	var h = new A.History(1e9), s0 = { tracks: [t], markers: [] }; h.push("Open", A.snapshot(s0)); h.push("Cut", A.snapshot({ tracks: [d], markers: [] }));
	ok(h.canUndo() && h.undo().label === "Open" && !h.canUndo() && h.canRedo() && h.redo().label === "Cut", "undo / redo");
	var hb = new A.History(5000); for (i = 0; i < 6; i++) h.push("x", A.snapshot(s0)); for (i = 0; i < 6; i++) hb.push("e" + i, A.snapshot({ tracks: [A.track({ clips: [A.clip(0, [new Float32Array(500)])] })], markers: [] }));
	ok(hb.stack.length <= 3, "history drops old steps over its memory budget (" + hb.stack.length + ")");
	var cmds = [{ name: "Noise removal", keys: "denoise background hiss" }, { name: "Normalize", keys: "loudness lufs" }, { name: "Fade in" }];
	ok(A.match(cmds, "lufs")[0].name === "Normalize" && A.match(cmds, "hiss")[0].name === "Noise removal" && A.match(cmds, "fade")[0].name === "Fade in" && A.match(cmds, "zzz").length === 0, "command search");
})();

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
