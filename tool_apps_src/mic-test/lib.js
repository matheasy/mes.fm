/* MES Mic Test maths (pure; runs in the browser and in node: require('./tool_apps_src/mic-test/lib.js')).
   Levels are dBFS: 0 dBFS = the loudest sample the recording can hold (1.0), so every real level is negative. */
var MESMic = (function () {
	'use strict';
	var FLOOR = -60; /* bottom of the meter, like OBS */
	/* Target for spoken voice on a stream (the usual broadcast advice): average (RMS) about -18 to -12 dBFS while you talk,
	   loudest peaks about -6, never touching 0. */
	var TARGET = { rmsLo: -20, rmsHi: -10, rmsIdealLo: -18, rmsIdealHi: -12, peakIdeal: -6, peakMax: -3, clip: -0.5, quietPeak: -24, silent: -50 };
	function num(x) { return typeof x === 'number' && isFinite(x); }
	function linToDb(x) { x = Math.abs(x); return x > 0 ? 20 * Math.log10(x) : -Infinity; }
	function dbToLin(db) { return Math.pow(10, db / 20); }
	function peak(buf) { var m = 0; for (var i = 0; i < buf.length; i++) { var a = buf[i] < 0 ? -buf[i] : buf[i]; if (a > m) m = a; } return m; }
	function rms(buf) { if (!buf.length) return 0; var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
	/* 0..1 position of a dB value on a meter from `floor` to 0 dB (linear in dB, as OBS draws it) */
	function meterPos(db, floor) { floor = floor || FLOOR; if (!num(db)) return 0; return Math.max(0, Math.min(1, (db - floor) / -floor)); }
	/* OBS meter colours: green up to -20 dB, yellow -20 to -9, red above -9 */
	function zone(db) { return !num(db) || db < -20 ? 'green' : db < -9 ? 'yellow' : 'red'; }
	/* meter needle that jumps up at once and falls at `rate` dB per second (OBS "fast" decay is about 20 dB/s) */
	function decay(prev, now, dtMs, rate) {
		if (!num(prev)) prev = -Infinity; if (!num(now)) now = -Infinity;
		var fallen = num(prev) ? prev - (rate || 20) * dtMs / 1000 : -Infinity;
		return Math.max(now, fallen);
	}
	/* peak hold: keeps the highest value for holdMs, then lets it fall */
	function Hold(holdMs, rate) { this.v = -Infinity; this.age = 0; this.holdMs = holdMs || 1500; this.rate = rate || 20; }
	Hold.prototype.update = function (db, dtMs) {
		if (num(db) && db >= this.v) { this.v = db; this.age = 0; return this.v; }
		this.age += dtMs;
		if (this.age > this.holdMs && num(this.v)) { this.v = this.v - this.rate * dtMs / 1000; if (this.v < FLOOR - 10) this.v = -Infinity; }
		if (num(db) && db > this.v) { this.v = db; this.age = 0; }
		return this.v;
	};
	function median(a) { a = a.filter(num).slice().sort(function (x, y) { return x - y; }); if (!a.length) return null; var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
	/* noise floor = the median RMS level of a quiet stretch */
	function noiseFloor(rmsDbs) { return median(rmsDbs); }
	function floorWord(db) {
		if (!num(db)) return 'No sound at all: the mic may be muted.';
		if (db < -70) return 'Silent (the mic or its gain may be off).';
		if (db < -60) return 'Very quiet room. Excellent.';
		if (db < -50) return 'Quiet. Good for streaming.';
		if (db < -40) return 'Some background noise: a fan, computer or room hum.';
		return 'Noisy: viewers will hear the background. Try a noise gate or move the mic closer to your mouth.';
	}
	/* level while talking: the power-average of the frames that are clearly louder than the room (floor + 10 dB, or -45 dBFS) */
	function speechLevel(rmsDbs, floorDb) {
		var gate = num(floorDb) ? Math.max(floorDb + 10, -60) : -45, p = 0, n = 0;
		rmsDbs.forEach(function (d) { if (num(d) && d > gate) { p += Math.pow(10, d / 10); n++; } });
		return n ? { db: 10 * Math.log10(p / n), frames: n, gate: gate } : { db: null, frames: 0, gate: gate };
	}
	/* verdict from the last few seconds: peak = loudest peak, speech = speechLevel().db, clips = samples at full scale */
	function verdict(o) {
		var pk = o.peak, sp = o.speech, T = TARGET;
		if (o.clips > 0 || (num(pk) && pk >= T.clip)) return { k: 'clip', word: 'Too loud: clipping', tip: 'Your peaks hit 0 dBFS, which sounds distorted. Turn the gain down a little (Yeti knob or macOS Input volume).' };
		if (!num(pk) || pk < T.silent) return { k: 'none', word: 'No sound', tip: 'We hear almost nothing. Check the right microphone is picked, the mute button, and the gain.' };
		if (!num(sp)) return { k: 'wait', word: 'Say something', tip: 'Talk in your normal streaming voice for a few seconds (count to ten).' };
		if (pk > T.peakMax || sp > T.rmsHi) return { k: 'loud', word: 'Too loud', tip: 'Close to the top. Lower the gain a little so loud moments (laughing, shouting) don\'t clip.' };
		if (pk < T.quietPeak || sp < -30) return { k: 'quiet', word: 'Too quiet', tip: 'Viewers will have to turn you up. Raise the gain: Yeti knob first, then macOS Input volume, then an OBS Gain filter.' };
		if (sp < T.rmsLo) return { k: 'low', word: 'A bit quiet', tip: 'Usable, but a little more gain would help. Aim for an average of -18 to -12 dBFS.' };
		return { k: 'good', word: 'Good level', tip: 'Nice: your voice sits in the target zone.' };
	}
	/* Pearson correlation of two channels (1 = the same signal, i.e. mono) */
	function correlation(a, b) {
		var n = Math.min(a.length, b.length); if (!n) return null;
		var sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
		for (var i = 0; i < n; i++) { sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; }
		var va = saa - sa * sa / n, vb = sbb - sb * sb / n; if (va <= 1e-12 || vb <= 1e-12) return null;
		return (sab - sa * sb / n) / Math.sqrt(va * vb);
	}
	/* channels: 1 or 2; lDb/rDb = recent RMS of each side; corr = correlation */
	function stereoCheck(channels, lDb, rDb, corr) {
		if (channels < 2) return { k: 'mono', text: 'This microphone sends one channel (mono). That is normal for a voice mic.' };
		if (!num(lDb) && !num(rDb) || Math.max(num(lDb) ? lDb : -200, num(rDb) ? rDb : -200) < -55) return { k: 'quiet', text: 'Make some sound to compare left and right.' };
		if (!num(rDb) || rDb < lDb - 20) return { k: 'left', text: 'Only the LEFT side has sound. In OBS, Advanced Audio Properties > Mono fixes a one-sided voice.' };
		if (!num(lDb) || lDb < rDb - 20) return { k: 'right', text: 'Only the RIGHT side has sound. In OBS, Advanced Audio Properties > Mono fixes a one-sided voice.' };
		if (num(corr) && corr > 0.98 && Math.abs(lDb - rDb) < 1.5) return { k: 'same', text: 'Left and right are the same (mono sound on two channels). Fine for a voice.' };
		return { k: 'stereo', text: 'Real stereo: left and right differ (difference ' + Math.abs(lDb - rDb).toFixed(1) + ' dB).' };
	}
	/* a whole recording: channel arrays -> peak / rms dBFS, clipped samples, seconds */
	function analyse(channels, sampleRate) {
		var pk = 0, s = 0, n = 0, clips = 0;
		channels.forEach(function (d) { for (var i = 0; i < d.length; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > pk) pk = a; if (a >= 0.999) clips++; s += d[i] * d[i]; n++; } });
		return { peak: linToDb(pk), rms: n ? linToDb(Math.sqrt(s / n)) : -Infinity, clips: clips, seconds: channels.length && sampleRate ? channels[0].length / sampleRate : 0 };
	}
	/* min/max per bucket for drawing a waveform */
	function envelope(d, buckets) {
		var out = [], per = d.length / buckets;
		for (var b = 0; b < buckets; b++) {
			var lo = 0, hi = 0, s = Math.floor(b * per), e = Math.max(s + 1, Math.floor((b + 1) * per));
			for (var i = s; i < e && i < d.length; i++) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; }
			out.push([lo, hi]);
		}
		return out;
	}
	/* frequency of a logarithmic sweep from f0 to f1 over T seconds, at time t */
	function sweepFreq(f0, f1, T, t) { return f0 * Math.pow(f1 / f0, Math.max(0, Math.min(1, t / T))); }
	/* y position (0 top .. 1 bottom) of a frequency on a log axis from lo to hi Hz */
	function logY(f, lo, hi) { return 1 - (Math.log(f / lo) / Math.log(hi / lo)); }
	function fmtDb(db, d) { if (!num(db)) return '-∞'; return (db > 0 ? '+' : '') + db.toFixed(d == null ? 1 : d); }
	function fmtHz(f) { return f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + ' kHz' : Math.round(f) + ' Hz'; }
	/* filter a device list by words typed in a search box (every word must match the label) */
	function filterDevices(list, q) {
		var w = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
		return list.filter(function (d) { var l = String(d.label || '').toLowerCase(); return w.every(function (x) { return l.indexOf(x) >= 0; }); });
	}
	return { FLOOR: FLOOR, TARGET: TARGET, linToDb: linToDb, dbToLin: dbToLin, peak: peak, rms: rms, meterPos: meterPos, zone: zone, decay: decay, Hold: Hold,
		median: median, noiseFloor: noiseFloor, floorWord: floorWord, speechLevel: speechLevel, verdict: verdict, correlation: correlation, stereoCheck: stereoCheck,
		analyse: analyse, envelope: envelope, sweepFreq: sweepFreq, logY: logY, fmtDb: fmtDb, fmtHz: fmtHz, filterDevices: filterDevices };
})();
if (typeof module !== 'undefined') module.exports = MESMic;
