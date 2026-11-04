/* Tests for tool_apps_src/youtube-audio/lib.js (MESYA). Run: node tool_apps_src/youtube-audio-tests.js
   Loudness reference signals follow EBU Tech 3341 / 3342; results are cross-checked with the Audio Editor's batch BS.1770 code. */
'use strict';
const Y = require('./youtube-audio/lib.js');
const A = require('./audio/lib.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL', m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + ' (got ' + a + ', want ' + b + ' ±' + tol + ')'); }

function sine(sr, sec, f, ampDb, phase) { const n = Math.round(sr * sec), a = Math.pow(10, ampDb / 20), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * f * i / sr + (phase || 0)); return x; }
function cat(...xs) { const n = xs.reduce((s, x) => s + x.length, 0), o = new Float32Array(n); let p = 0; xs.forEach((x) => { o.set(x, p); p += x.length; }); return o; }
function run(ch, sr, chunk) { const z = new Y.Analyzer(sr, ch.length); chunk = chunk || 4096; for (let i = 0; i < ch[0].length; i += chunk) z.feed(ch.map((c) => c.subarray(i, Math.min(c.length, i + chunk)))); return z; }

/* ---- links ---- */
let L = Y.parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s');
ok(L.ok && L.kind === 'youtube' && L.id === 'dQw4w9WgXcQ' && L.start === 65, 'youtube watch + t');
ok(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=65/.test(L.embed), 'youtube embed url');
ok(Y.parseLink('youtu.be/dQw4w9WgXcQ?t=42').start === 42, 'youtu.be bare + t');
ok(Y.parseLink('https://youtube.com/shorts/dQw4w9WgXcQ').id === 'dQw4w9WgXcQ', 'shorts');
ok(Y.parseLink('https://www.youtube.com/live/dQw4w9WgXcQ?si=x').id === 'dQw4w9WgXcQ', 'live');
ok(!Y.parseLink('https://www.youtube.com/watch?v=bad').ok, 'bad youtube id');
L = Y.parseLink('https://3speak.tv/watch?v=mes/ta0jgic7');
ok(L.kind === '3speak' && L.embed === 'https://play.3speak.tv/embed?v=mes/ta0jgic7', '3speak');
ok(Y.parseLink('https://play.3speak.tv/watch?v=mes/abc-def').id === 'mes/abc-def', 'play.3speak');
L = Y.parseLink('https://rumble.com/v6abc12-some-title.html');
ok(L.kind === 'rumble' && !L.embed, 'rumble page link: no embed');
ok(Y.parseLink('https://rumble.com/embed/v5x9yz/?pub=4').embed === 'https://rumble.com/embed/v5x9yz/', 'rumble embed');
L = Y.parseLink('https://odysee.com/@mestruth:9/my-video:3');
ok(L.kind === 'odysee' && L.embed === 'https://odysee.com/$/embed/' + encodeURIComponent('@mestruth:9') + '/' + encodeURIComponent('my-video:3'), 'odysee');
ok(!Y.parseLink('https://odysee.com/@mestruth:9').embed, 'odysee channel: no embed');
ok(Y.parseLink('https://www.bitchute.com/video/AbC123xyz/').embed === 'https://www.bitchute.com/embed/AbC123xyz/', 'bitchute');
L = Y.parseLink('https://x.com/mestruth/status/1850000000000000000');
ok(L.kind === 'x' && /platform\.twitter\.com\/embed\/Tweet\.html\?id=1850000000000000000/.test(L.embed), 'x status');
ok(Y.parseLink('https://twitter.com/a/status/12345').kind === 'x', 'twitter.com');
ok(Y.parseLink('https://mes.substack.com/p/hello').kind === 'substack', 'substack');
L = Y.parseLink('https://example.org/files/Talk%20one.mp3');
ok(L.kind === 'direct' && L.file === 'Talk one.mp3', 'direct mp3');
ok(Y.parseLink('https://example.org/page').kind === 'other', 'other');
ok(!Y.parseLink('javascript:alert(1)').ok && !Y.parseLink('').ok && !Y.parseLink('ftp://x.org/a.mp3').ok, 'refused links');
ok(Y.tParam('90') === 90 && Y.tParam('1h2m3s') === 3723 && Y.tParam('x') === 0, 'tParam');

/* ---- FFT ---- */
{ const re = new Float64Array(8), im = new Float64Array(8); re[1] = 1; Y.fft(re, im); near(Math.hypot(re[3], im[3]), 1, 1e-12, 'fft impulse magnitude'); near(re[0], 1, 1e-12, 'fft impulse dc'); }
{ const N = 64, re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = Math.cos(2 * Math.PI * 5 * i / N); Y.fft(re, im); near(re[5], N / 2, 1e-9, 'fft cosine bin'); near(Math.abs(re[6]), 0, 1e-9, 'fft cosine other bin'); }

/* ---- loudness: EBU Tech 3341 case 1/2: stereo 1 kHz sine at -23 / -33 dBFS -> -23 / -33 LUFS ---- */
for (const sr of [48000, 44100]) {
  const s = sine(sr, 20, 1000, -23), z = run([s, s], sr);
  const sm = z.summary();
  near(sm.integrated, -23, 0.1, 'tech3341 -23 at ' + sr);
  near(sm.shortTermMax, -23, 0.1, 'short-term max ' + sr);
  near(sm.momentaryMax, -23, 0.1, 'momentary max ' + sr);
  const s2 = sine(sr, 20, 1000, -33), z2 = run([s2, s2], sr);
  near(z2.summary().integrated, -33, 0.1, 'tech3341 -33 at ' + sr);
  near(sm.samplePeak, -23, 0.01, 'sample peak');
  near(sm.rms, -26.01, 0.05, 'rms of a sine = peak - 3.01');
  ok(sm.clips === 0, 'no clips');
  ok(sm.stereo.kind === 'dualmono', 'identical channels = dual mono');
}
/* case 3: -36 / -23 / -36 dBFS, 10 / 60 / 10 s -> -23 (relative gate) */
{ const sr = 48000, s = cat(sine(sr, 10, 1000, -36), sine(sr, 60, 1000, -23), sine(sr, 10, 1000, -36)); near(run([s, s], sr).summary().integrated, -23, 0.1, 'tech3341 case 3 (gating)'); }
/* case 4: -72 / -36 / -23 / -36 / -72 dB, 10/10/60/10/10 s -> -23 */
{ const sr = 48000, s = cat(sine(sr, 10, 1000, -72), sine(sr, 10, 1000, -36), sine(sr, 60, 1000, -23), sine(sr, 10, 1000, -36), sine(sr, 10, 1000, -72)); near(run([s, s], sr).summary().integrated, -23, 0.1, 'tech3341 case 4 (absolute gate)'); }
/* mono: one channel only, half the power of a stereo pair -> -3 LU */
{ const sr = 48000, s = sine(sr, 10, 1000, -23); near(run([s], sr).summary().integrated, -26.0, 0.1, 'mono -23 dBFS sine = -26 LUFS'); }
/* LRA: EBU Tech 3342 case 1: -20 then -30 dBFS, 20 s each -> 10 LU; case 2: -20 / -15 -> 5 LU */
{ const sr = 48000, s = cat(sine(sr, 20, 1000, -20), sine(sr, 20, 1000, -30)); near(run([s, s], sr).summary().range, 10, 0.5, 'tech3342 LRA 10'); }
{ const sr = 48000, s = cat(sine(sr, 20, 1000, -20), sine(sr, 20, 1000, -15)); near(run([s, s], sr).summary().range, 5, 0.5, 'tech3342 LRA 5'); }
/* same answer as the Audio Editor's batch code, on noise-like music */
{ const sr = 44100, n = sr * 15, a = new Float32Array(n), b = new Float32Array(n); let r = 12345; const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296 - 0.5);
  for (let i = 0; i < n; i++) { const env = 0.3 + 0.25 * Math.sin(i / sr * 1.3); a[i] = env * (rnd() * 0.5 + 0.4 * Math.sin(2 * Math.PI * 220 * i / sr)); b[i] = env * (rnd() * 0.5 + 0.3 * Math.sin(2 * Math.PI * 330 * i / sr)); }
  const ref = A.loudness([a, b], sr), sm = run([a, b], sr, 1000).summary();
  near(sm.integrated, ref.integrated, 0.15, 'matches the Audio Editor integrated');
  near(sm.range, ref.range, 0.6, 'matches the Audio Editor LRA');
  near(sm.truePeak, A.truePeak([a, b]), 0.3, 'true peak matches the Audio Editor');
  ok(sm.stereo.kind === 'stereo' || sm.stereo.kind === 'narrow', 'stereo noise is stereo: ' + sm.stereo.kind);
}
/* chunk size does not matter */
{ const sr = 48000, s = sine(sr, 5, 440, -12), t = sine(sr, 5, 660, -18); const a = run([s, t], sr, 777).summary(), b = run([s, t], sr, 48000).summary();
  near(a.integrated, b.integrated, 1e-6, 'chunking: integrated'); near(a.truePeak, b.truePeak, 1e-6, 'chunking: true peak'); }

/* ---- true peak: fs/4 sine at 45° phase: samples read -3 dB, true peak 0 dB ---- */
{ const sr = 48000, n = sr, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * i / 4 + Math.PI / 4);
  const sm = run([x], sr).summary(); near(sm.samplePeak, -3.01, 0.02, 'fs/4 sample peak'); near(sm.truePeak, 0, 0.25, 'fs/4 true peak'); }

/* ---- clipping, DC, stereo kinds ---- */
{ const sr = 48000, x = sine(sr, 2, 100, 3); for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i])); const sm = run([x], sr).summary();
  ok(sm.clips >= 300 && sm.clips <= 500, 'clipped 100 Hz sine: ~400 clipped spots, got ' + sm.clips); ok(sm.clipAt.length > 0 && sm.clipAt[0] < 0.01, 'first clip time'); }
{ const sr = 48000, x = sine(sr, 2, 100, -10); for (let i = 0; i < x.length; i++) x[i] += 0.05; near(run([x], sr).summary().dc[0], 0.05, 1e-3, 'dc offset'); }
{ const sr = 48000, s = sine(sr, 2, 500, -10), z = new Float32Array(s.length); ok(run([s, z], sr).summary().stereo.kind === 'oneside', 'one side only'); }
{ const sr = 48000, s = sine(sr, 2, 500, -10), m = s.map((v) => -v); ok(run([s, m], sr).summary().stereo.kind === 'phase', 'out of phase'); }
{ const sr = 48000, s = sine(sr, 2, 500, -10), q = sine(sr, 2, 700, -16); const st = run([s, q], sr).summary().stereo; ok(st.kind === 'unbalanced' && /Left/.test(st.text), 'left louder: ' + st.text); }

/* ---- series, silences, loudest ---- */
{ const sr = 48000, quiet = new Float32Array(sr * 2), s = cat(sine(sr, 3, 1000, -20), quiet, sine(sr, 3, 1000, -10), new Float32Array(sr / 4), sine(sr, 3, 1000, -20));
  const z = run([s], sr), ser = z.series(), sm = z.summary();
  ok(ser.momentary.length === Math.floor(s.length / (sr / 10)), 'series length');
  const sil = Y.silences(ser.rms, -60, 0.5);
  ok(sil.length === 1 && Math.abs(sil[0].a - 3) < 0.05 && Math.abs(sil[0].b - 5) < 0.05, 'one silence 3-5 s: ' + JSON.stringify(sil));
  ok(Y.silences(ser.rms, -60, 0.2).length === 2, 'shorter min length finds the 0.25 s gap too');
  near(sm.digitalSilence, 2.2, 0.15, 'digital silence ~2.2 s');
  const lo = Y.loudest(ser.shortTerm, 2, 3);
  ok(lo.length === 2 && Math.abs(lo[0].t - 5) < 0.2, 'loudest moment at 5 s: ' + JSON.stringify(lo[0]));
  const csv = Y.csv(ser).split('\n'); ok(csv[0] === 'time_s,momentary_lufs,short_term_lufs,rms_dbfs' && csv[1].startsWith('0.1,'), 'csv');
}

/* ---- spectrogram: a 1 kHz tone lands in the right band at about its level ---- */
{ const sr = 48000, z = run([sine(sr, 1, 1000, -6)], sr); ok(z.cols === Math.floor(sr / Y.SPEC_N), 'spectrogram columns');
  let best = 0; for (let b = 0; b < z.NB; b++) if (z.last[b] > z.last[best]) best = b;
  const f = Y.bandFreq(sr, z.NB, best); ok(f > 900 && f < 1120, '1 kHz tone in its band: ' + f.toFixed(0));
  near(z.last[best], -6, 2, 'tone level in the spectrum');
  let bin = Math.round(1000 * Y.SPEC_N / sr); near(Y.pdb(z.ltas[bin] / z.ltasN), -6, 2, 'long-term spectrum level'); }

/* ---- targets, verdict, formatting ---- */
{ const t = Y.targets(-9, -0.2), yt = t.find((x) => x.id === 'youtube'), sp = t.find((x) => x.id === 'spotify'), ebu = t.find((x) => x.id === 'ebu');
  near(yt.change, -5, 1e-9, 'youtube turns -9 down 5'); near(sp.change, -5, 1e-9, 'spotify down'); near(ebu.change, -14, 1e-9, 'ebu');
  const q = Y.targets(-20, -6); ok(q.find((x) => x.id === 'youtube').change === 0, 'youtube leaves quiet alone'); near(q.find((x) => x.id === 'spotify').change, 5, 1e-9, 'spotify turns up to the peak limit'); near(q.find((x) => x.id === 'apple').change, 4, 1e-9, 'apple up 4');
  ok(Y.verdict({ integrated: -14, clips: 0 }).cls === 'good' && Y.verdict({ integrated: -9, clips: 0 }).cls === 'loud' && Y.verdict({ integrated: -24, clips: 0 }).cls === 'quiet' && Y.verdict({ integrated: -14, clips: 3 }).cls === 'clip', 'verdicts');
  ok(Y.fmtTime(3725.4) === '1:02:05' && Y.fmtTime(65) === '1:05' && Y.fmtTime(5.25, 1) === '0:05.3', 'fmtTime');
  ok(Y.fmtDb(-14.04) === '−14.0' && Y.fmtDb(-Infinity) === '−∞' && Y.fmtDb(0.5) === '+0.5', 'fmtDb');
  ok(Y.fmtHz(440) === '440 Hz' && Y.fmtHz(1500) === '1.5 kHz' && Y.fmtHz(12000) === '12 kHz', 'fmtHz');
  const sm = run([sine(48000, 4, 1000, -20)], 48000).summary(); ok(/Integrated loudness −23\.0 LUFS/.test(Y.reportText(sm)), 'report text');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
