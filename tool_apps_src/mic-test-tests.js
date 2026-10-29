// node tool_apps_src/mic-test-tests.js -- MES Mic Test maths (tool_apps_src/mic-test/lib.js)
var M = require('./mic-test/lib.js'), n = 0, fails = 0;
function eq(a, b, m) { n++; if (a !== b) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
function near(a, b, m, tol) { n++; if (a == null || Math.abs(a - b) > (tol || 1e-6)) { fails++; console.log('FAIL ' + m + ': ' + a + ' vs ' + b); } }
near(M.linToDb(1), 0, '1.0 = 0 dBFS'); near(M.linToDb(0.5), -6.0206, 'half = -6 dB', 1e-3); near(M.linToDb(0.1), -20, 'tenth = -20 dB');
eq(M.linToDb(0), -Infinity, 'silence = -inf'); near(M.linToDb(-0.5), -6.0206, 'negative sample', 1e-3); near(M.dbToLin(-20), 0.1, 'dbToLin');
var sine = new Float32Array(4800); for (var i = 0; i < sine.length; i++) sine[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000);
near(M.peak(sine), 0.5, 'sine peak', 1e-3); near(M.linToDb(M.rms(sine)), M.linToDb(0.5) - 3.0103, 'sine RMS = peak - 3 dB', 0.01);
eq(M.rms(new Float32Array(0)), 0, 'empty rms');
eq(M.meterPos(-60), 0, 'floor'); eq(M.meterPos(0), 1, 'top'); eq(M.meterPos(-30), 0.5, 'middle'); eq(M.meterPos(-90), 0, 'clamped'); eq(M.meterPos(-Infinity), 0, '-inf');
eq(M.zone(-30), 'green', 'green'); eq(M.zone(-15), 'yellow', 'yellow'); eq(M.zone(-3), 'red', 'red'); eq(M.zone(-20), 'yellow', '-20 is yellow (OBS)'); eq(M.zone(-9), 'red', '-9 is red');
eq(M.decay(-10, -30, 500, 20), -20, 'falls 20 dB/s'); eq(M.decay(-30, -10, 16, 20), -10, 'jumps up at once'); eq(M.decay(-Infinity, -40, 16, 20), -40, 'from silence');
var h = new M.Hold(1000, 20); h.update(-6, 16); eq(h.update(-30, 900), -6, 'held'); near(h.update(-30, 200), -6 - 20 * 0.2, 'then falls', 1e-9); eq(h.update(-2, 16), -2, 'new peak');
eq(M.median([3, 1, 2]), 2, 'median odd'); eq(M.median([4, 1, 2, 3]), 2.5, 'median even'); eq(M.median([]), null, 'median empty');
eq(M.noiseFloor([-62, -61, -63, -40]), -61.5, 'floor ignores a single bump (median)');
eq(/Very quiet/.test(M.floorWord(-65)), true, 'floor word'); eq(/Noisy/.test(M.floorWord(-35)), true, 'noisy');
var fr = []; for (i = 0; i < 20; i++) fr.push(-65); for (i = 0; i < 20; i++) fr.push(-15);
near(M.speechLevel(fr, -65).db, -15, 'speech = loud frames only'); eq(M.speechLevel(fr, -65).frames, 20, 'speech frames');
near(M.speechLevel([-20, -10], null).db, 10 * Math.log10((0.01 + 0.1) / 2), 'power average', 1e-9);
eq(M.speechLevel([-70, -70], null).db, null, 'no speech');
eq(M.verdict({ peak: -8, speech: -15, clips: 0 }).k, 'good', 'good level');
eq(M.verdict({ peak: -0.1, speech: -15, clips: 0 }).k, 'clip', 'clip by peak'); eq(M.verdict({ peak: -5, speech: -15, clips: 2 }).k, 'clip', 'clip by count');
eq(M.verdict({ peak: -2, speech: -14, clips: 0 }).k, 'loud', 'too loud peak'); eq(M.verdict({ peak: -5, speech: -8, clips: 0 }).k, 'loud', 'too loud average');
eq(M.verdict({ peak: -30, speech: -38, clips: 0 }).k, 'quiet', 'too quiet'); eq(M.verdict({ peak: -12, speech: -24, clips: 0 }).k, 'low', 'a bit quiet');
eq(M.verdict({ peak: -70, speech: null, clips: 0 }).k, 'none', 'no sound'); eq(M.verdict({ peak: -40, speech: null, clips: 0 }).k, 'wait', 'say something');
var a = [1, 2, 3, 4], b = [2, 4, 6, 8], c = [4, 3, 2, 1];
near(M.correlation(a, b), 1, 'corr 1'); near(M.correlation(a, c), -1, 'corr -1'); eq(M.correlation([1, 1], [1, 2]), null, 'flat = null');
eq(M.stereoCheck(1).k, 'mono', 'mono'); eq(M.stereoCheck(2, -20, -60, 0).k, 'left', 'left only'); eq(M.stereoCheck(2, -60, -20, 0).k, 'right', 'right only');
eq(M.stereoCheck(2, -20, -20.3, 0.999).k, 'same', 'dual mono'); eq(M.stereoCheck(2, -20, -24, 0.4).k, 'stereo', 'stereo'); eq(M.stereoCheck(2, -80, -80, null).k, 'quiet', 'quiet');
var r = M.analyse([new Float32Array([0, 0.5, -1, 0.25])], 4); near(r.peak, 0, 'analyse peak'); eq(r.clips, 1, 'analyse clips'); eq(r.seconds, 1, 'analyse seconds');
var env = M.envelope(new Float32Array([0, 1, -1, 0.5]), 2); eq(env[0][1], 1, 'env max'); eq(env[1][0], -1, 'env min'); eq(env.length, 2, 'env buckets');
near(M.sweepFreq(20, 20000, 10, 0), 20, 'sweep start'); near(M.sweepFreq(20, 20000, 10, 10), 20000, 'sweep end', 1e-6); near(M.sweepFreq(20, 20000, 10, 5), 632.4555, 'sweep middle = geometric mean', 1e-3);
near(M.logY(1000, 10, 100000), 0.5, 'logY');
eq(M.fmtDb(-6.02), '-6.0', 'fmtDb'); eq(M.fmtDb(-Infinity), '-∞', 'fmtDb inf'); eq(M.fmtHz(440), '440 Hz', 'Hz'); eq(M.fmtHz(15000), '15 kHz', 'kHz'); eq(M.fmtHz(1250), '1.25 kHz', 'kHz 2dp');
var devs = [{ label: 'Yeti Stereo Microphone' }, { label: 'MacBook Pro Microphone' }, { label: 'BlackHole 2ch' }];
eq(M.filterDevices(devs, 'yeti').length, 1, 'device search'); eq(M.filterDevices(devs, 'MIC pro').length, 1, 'all words'); eq(M.filterDevices(devs, '').length, 3, 'empty search');
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
