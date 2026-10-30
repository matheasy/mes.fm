/* MES Audio Editor: pure model + DSP (window.MESAudio; node: require('./lib.js')). No DOM here.
 * Times inside the model are whole samples at the project rate. A track = {id, name, nch, gain (dB), pan (-1..1), mute, solo, clips: [{id, start, ch: Float32Array[]}]}.
 * Clips and their arrays are never changed in place: every edit returns new objects and keeps untouched arrays shared, so undo snapshots are cheap. */
(function (root) {
	"use strict";
	var A = {}, seq = 1;
	A.uid = function (p) { return (p || "c") + (seq++).toString(36) + Math.random().toString(36).slice(2, 6); };

	/* ---------- time ---------- */
	A.fmtTime = function (sec, digits) {
		if (!isFinite(sec)) sec = 0; var neg = sec < 0; sec = Math.abs(sec); digits = digits == null ? 3 : digits;
		var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec - Math.floor(sec / 60) * 60, ss = s.toFixed(digits);
		if (+ss >= 60) { ss = (0).toFixed(digits); m++; if (m === 60) { m = 0; h++; } }
		if (ss.indexOf(".") === 1 || (digits === 0 && ss.length === 1)) ss = "0" + ss;
		return (neg ? "-" : "") + (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + ss;
	};
	/* "1:02.5", "62.5", "1:00:02", "90s", "2m" -> seconds (NaN when unreadable) */
	A.parseTime = function (s) {
		s = String(s || "").trim().toLowerCase(); if (!s) return NaN;
		var m = s.match(/^(-?\d+(?:\.\d+)?)\s*(ms|s|sec|m|min|h)?$/);
		if (m) { var v = +m[1], u = m[2] || "s"; return u === "ms" ? v / 1000 : u === "m" || u === "min" ? v * 60 : u === "h" ? v * 3600 : v; }
		var p = s.split(":"); if (p.length < 2 || p.length > 3 || p.some(function (x) { return !/^\d+(\.\d+)?$/.test(x); })) return NaN;
		return p.reduce(function (acc, x) { return acc * 60 + +x; }, 0);
	};
	A.dbToGain = function (db) { return Math.pow(10, db / 20); };
	A.gainToDb = function (g) { return g > 0 ? 20 * Math.log10(g) : -Infinity; };

	/* ---------- channels ---------- */
	A.conform = function (ch, n) {
		if (ch.length === n) return ch;
		if (n === 1) { var a = ch[0], b = ch[1], m = new Float32Array(a.length), i; for (i = 0; i < a.length; i++) m[i] = (a[i] + b[i]) * 0.5; return [m]; }
		return [ch[0], ch[0]];
	};
	A.slice = function (ch, a, b) { return ch.map(function (c) { return c.slice(a, b); }); };
	A.concat = function (list) {
		var n = list.reduce(function (s, ch) { return s + ch[0].length; }, 0), nch = list[0].length, out = [], k;
		for (k = 0; k < nch; k++) { var o = new Float32Array(n), p = 0; list.forEach(function (ch) { o.set(ch[k], p); p += ch[k].length; }); out.push(o); }
		return out;
	};
	A.zeros = function (nch, n) { var o = [], k; for (k = 0; k < nch; k++) o.push(new Float32Array(n)); return o; };

	/* ---------- tracks / clips ---------- */
	A.track = function (o) {
		o = o || {};
		return { id: o.id || A.uid("t"), name: o.name || "Track", nch: o.nch || 1, gain: o.gain || 0, pan: o.pan || 0, mute: !!o.mute, solo: !!o.solo, clips: o.clips || [] };
	};
	A.clip = function (start, ch) { return { id: A.uid("c"), start: Math.round(start), ch: ch }; };
	A.clipLen = function (c) { return c.ch[0].length; };
	A.trackEnd = function (t) { return t.clips.reduce(function (m, c) { return Math.max(m, c.start + A.clipLen(c)); }, 0); };
	A.projectEnd = function (tracks) { return tracks.reduce(function (m, t) { return Math.max(m, A.trackEnd(t)); }, 0); };
	function withClips(t, clips) { var n = {}, k; for (k in t) n[k] = t[k]; n.clips = clips.filter(function (c) { return A.clipLen(c) > 0; }).sort(function (a, b) { return a.start - b.start; }); return n; }
	A.withClips = withClips;
	function piece(c, a, b, start) { return { id: A.uid("c"), start: start, ch: A.slice(c.ch, a, b) }; }

	/* split every clip that crosses `at` */
	A.split = function (t, at) {
		var out = [];
		t.clips.forEach(function (c) {
			var e = c.start + A.clipLen(c);
			if (at > c.start && at < e) { out.push(piece(c, 0, at - c.start, c.start)); out.push(piece(c, at - c.start, e - c.start, at)); }
			else out.push(c);
		});
		return withClips(t, out);
	};
	/* copy of [a, b) as clips whose starts are relative to a */
	A.copyRange = function (t, a, b) {
		var out = [];
		t.clips.forEach(function (c) {
			var s = c.start, e = s + A.clipLen(c), x = Math.max(a, s), y = Math.min(b, e);
			if (y > x) out.push(piece(c, x - s, y - s, x - a));
		});
		return { len: b - a, nch: t.nch, clips: out };
	};
	/* delete [a, b); ripple = later audio moves left */
	A.deleteRange = function (t, a, b, ripple) {
		var out = [], d = b - a;
		t.clips.forEach(function (c) {
			var s = c.start, e = s + A.clipLen(c);
			if (e <= a) { out.push(c); return; }
			if (s >= b) { out.push(ripple ? { id: c.id, start: s - d, ch: c.ch } : c); return; }
			if (s < a) out.push(piece(c, 0, a - s, s));
			if (e > b) out.push(piece(c, b - s, e - s, ripple ? a : b));
		});
		return withClips(t, out);
	};
	/* keep only [a, b) (positions unchanged) */
	A.trim = function (t, a, b) {
		var out = [];
		t.clips.forEach(function (c) { var s = c.start, e = s + A.clipLen(c), x = Math.max(a, s), y = Math.min(b, e); if (y > x) out.push(x === s && y === e ? c : piece(c, x - s, y - s, x)); });
		return withClips(t, out);
	};
	/* insert a copied block at `at` (later audio moves right) */
	A.insert = function (t, at, block) {
		var sp = A.split(t, at), out = sp.clips.map(function (c) { return c.start >= at ? { id: c.id, start: c.start + block.len, ch: c.ch } : c; });
		block.clips.forEach(function (c) { out.push({ id: A.uid("c"), start: at + c.start, ch: A.conform(c.ch, t.nch) }); });
		return withClips(t, out);
	};
	/* apply fn(segmentChannels, absStart) -> new channels (same length) to [a, b) */
	A.mapRange = function (t, a, b, fn) {
		var out = [];
		t.clips.forEach(function (c) {
			var s = c.start, e = s + A.clipLen(c), x = Math.max(a, s), y = Math.min(b, e);
			if (y <= x) { out.push(c); return; }
			var seg = fn(A.slice(c.ch, x - s, y - s), x), parts = [];
			if (x > s) parts.push(A.slice(c.ch, 0, x - s));
			parts.push(seg);
			if (y < e) parts.push(A.slice(c.ch, y - s, e - s));
			out.push({ id: A.uid("c"), start: s, ch: A.concat(parts) });
		});
		return withClips(t, out);
	};
	/* the audio of [a, b) of one track as one buffer (gaps = silence), no gain / pan */
	A.renderTrack = function (t, a, b) {
		var out = A.zeros(t.nch, Math.max(0, b - a));
		t.clips.forEach(function (c) {
			var s = c.start, e = s + A.clipLen(c), x = Math.max(a, s), y = Math.min(b, e), k;
			if (y > x) for (k = 0; k < t.nch; k++) out[k].set(c.ch[Math.min(k, c.ch.length - 1)].subarray(x - s, y - s), x - a);
		});
		return out;
	};
	/* write a full-range buffer back into the clips that cover [a, b) */
	A.writeRange = function (t, a, b, buf) { return A.mapRange(t, a, b, function (seg, x) { return seg.map(function (c, k) { return buf[k].slice(x - a, x - a + c.length); }); }); };
	A.pan = function (p) { var x = (p + 1) * Math.PI / 4; return [Math.cos(x) * Math.SQRT2, Math.sin(x) * Math.SQRT2]; }; // equal power, 0 = unity both sides
	/* mixdown of [a, b) to nchOut channels with track gain / pan / mute / solo */
	A.mix = function (tracks, a, b, nchOut) {
		var anySolo = tracks.some(function (t) { return t.solo; }), out = A.zeros(nchOut, Math.max(0, b - a));
		tracks.forEach(function (t) {
			if (t.mute || (anySolo && !t.solo)) return;
			var g = A.dbToGain(t.gain), pg = A.pan(Math.max(-1, Math.min(1, t.pan))), buf = A.renderTrack(t, a, b), i, k;
			for (k = 0; k < nchOut; k++) {
				var src = buf[Math.min(k, buf.length - 1)], o = out[k], gk = g * (nchOut === 2 ? (t.nch === 1 ? pg[k] : (k === 0 ? Math.min(1, pg[0]) : Math.min(1, pg[1]))) : 1);
				if (nchOut === 1 && buf.length === 2) { for (i = 0; i < o.length; i++) o[i] += g * 0.5 * (buf[0][i] + buf[1][i]); continue; }
				for (i = 0; i < o.length; i++) o[i] += gk * src[i];
			}
		});
		return out;
	};

	/* ---------- waveform peaks (min / max per block) ---------- */
	A.peaks = function (x, block) {
		var n = Math.ceil(x.length / block), mn = new Float32Array(n), mx = new Float32Array(n), i, j;
		for (i = 0; i < n; i++) { var lo = 1e9, hi = -1e9, e = Math.min(x.length, (i + 1) * block); for (j = i * block; j < e; j++) { var v = x[j]; if (v < lo) lo = v; if (v > hi) hi = v; } mn[i] = lo === 1e9 ? 0 : lo; mx[i] = hi === -1e9 ? 0 : hi; }
		return { block: block, min: mn, max: mx };
	};
	/* peak pyramid: block 64, 512, 4096 */
	A.peakSet = function (ch) { return ch.map(function (c) { var p1 = A.peaks(c, 64); return [p1, merge(p1, 8), merge(merge(p1, 8), 8)]; }); };
	function merge(p, f) { var n = Math.ceil(p.min.length / f), mn = new Float32Array(n), mx = new Float32Array(n), i, j; for (i = 0; i < n; i++) { var lo = 1e9, hi = -1e9; for (j = i * f; j < Math.min(p.min.length, (i + 1) * f); j++) { if (p.min[j] < lo) lo = p.min[j]; if (p.max[j] > hi) hi = p.max[j]; } mn[i] = lo; mx[i] = hi; } return { block: p.block * f, min: mn, max: mx }; }

	/* ---------- effects (each: Float32Array[] -> new Float32Array[]) ---------- */
	A.gain = function (ch, db) { var g = A.dbToGain(db); return ch.map(function (c) { var o = new Float32Array(c.length), i; for (i = 0; i < c.length; i++) o[i] = c[i] * g; return o; }); };
	A.reverse = function (ch) { return ch.map(function (c) { return c.slice().reverse(); }); };
	A.silence = function (ch) { return ch.map(function (c) { return new Float32Array(c.length); }); };
	/* curve: 'linear' | 'equal' (equal power: sin) | 'exp' (logarithmic-sounding, -60 dB start) | 's' (smooth step) */
	A.fadeShape = function (x, curve) {
		x = Math.max(0, Math.min(1, x));
		if (curve === "equal") return Math.sin(x * Math.PI / 2);
		if (curve === "exp") return x <= 0 ? 0 : Math.pow(10, -3 * (1 - x)) * (x < 0.02 ? x / 0.02 : 1);
		if (curve === "s") return x * x * (3 - 2 * x);
		return x;
	};
	/* fade over the whole buffer; total = full length of the faded range, off = where this piece starts inside it */
	A.fade = function (ch, dir, curve, total, off) {
		total = total || ch[0].length; off = off || 0;
		return ch.map(function (c) { var o = new Float32Array(c.length), i; for (i = 0; i < c.length; i++) { var p = (off + i + 0.5) / total; o[i] = c[i] * A.fadeShape(dir === "in" ? p : 1 - p, curve); } return o; });
	};
	A.peak = function (ch) { var m = 0; ch.forEach(function (c) { for (var i = 0; i < c.length; i++) { var v = Math.abs(c[i]); if (v > m) m = v; } }); return m; };
	/* background-noise level: the quietest 10% of 50 ms blocks (mono mix), as RMS in dBFS. Used to show what the noise removal did. */
	A.noiseFloor = function (ch, sr) {
		var n = ch[0] ? ch[0].length : 0, B = Math.max(64, Math.round((sr || 48000) * 0.05)), v = [], i, k;
		for (i = 0; i + B <= n; i += B) { var e = 0; for (var j = i; j < i + B; j++) { var x = 0; for (k = 0; k < ch.length; k++) x += ch[k][j]; x /= ch.length; e += x * x; } v.push(e / B); }
		if (!v.length) return -Infinity; v.sort(function (a, b) { return a - b; });
		var m = Math.max(1, Math.floor(v.length * 0.1)), s = 0; for (i = 0; i < m; i++) s += v[i];
		return s > 0 ? 10 * Math.log10(s / m) : -Infinity;
	};
	/* plain-English summary of a before / after noise floor */
	A.noiseReport = function (before, after) {
		if (!isFinite(before)) return { db: 0, text: "This part is silent: there is no noise to remove." };
		var aft = isFinite(after) ? after : -120, d = before - aft;
		if (d < 3) return { db: d, text: "Background noise " + before.toFixed(0) + " dB → " + aft.toFixed(0) + " dB: almost no steady noise was found to remove." };
		return { db: d, text: "Background noise " + before.toFixed(0) + " dB → " + aft.toFixed(0) + " dB (" + d.toFixed(0) + " dB quieter)." };
	};
	A.normalizePeakGain = function (ch, targetDb) { var p = A.peak(ch); return p > 0 ? targetDb - A.gainToDb(p) : 0; };

	/* biquad (RBJ cookbook) */
	A.biquad = function (type, f0, sr, q, gainDb) {
		var Ag = Math.pow(10, (gainDb || 0) / 40), w = 2 * Math.PI * Math.min(f0, sr * 0.49) / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), b0, b1, b2, a0, a1, a2;
		if (type === "highpass") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
		else if (type === "lowpass") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
		else if (type === "peak") { b0 = 1 + al * Ag; b1 = -2 * cw; b2 = 1 - al * Ag; a0 = 1 + al / Ag; a1 = -2 * cw; a2 = 1 - al / Ag; }
		else if (type === "notch") { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
		else {
			var sa = 2 * Math.sqrt(Ag) * al;
			if (type === "highshelf") { b0 = Ag * ((Ag + 1) + (Ag - 1) * cw + sa); b1 = -2 * Ag * ((Ag - 1) + (Ag + 1) * cw); b2 = Ag * ((Ag + 1) + (Ag - 1) * cw - sa); a0 = (Ag + 1) - (Ag - 1) * cw + sa; a1 = 2 * ((Ag - 1) - (Ag + 1) * cw); a2 = (Ag + 1) - (Ag - 1) * cw - sa; }
			else { b0 = Ag * ((Ag + 1) - (Ag - 1) * cw + sa); b1 = 2 * Ag * ((Ag - 1) - (Ag + 1) * cw); b2 = Ag * ((Ag + 1) - (Ag - 1) * cw - sa); a0 = (Ag + 1) + (Ag - 1) * cw + sa; a1 = -2 * ((Ag - 1) + (Ag + 1) * cw); a2 = (Ag + 1) + (Ag - 1) * cw - sa; }
		}
		return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
	};
	A.filt = function (c, f) { var o = new Float32Array(c.length), x1 = 0, x2 = 0, y1 = 0, y2 = 0, i; for (i = 0; i < c.length; i++) { var v = c[i], y = f.b0 * v + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; o[i] = y; } return o; };
	/* biquad magnitude response in dB at frequency f */
	A.response = function (f, freq, sr) {
		var w = 2 * Math.PI * freq / sr, cr = Math.cos(w), ci = -Math.sin(w), c2r = Math.cos(2 * w), c2i = -Math.sin(2 * w);
		var nr = f.b0 + f.b1 * cr + f.b2 * c2r, ni = f.b1 * ci + f.b2 * c2i, dr = 1 + f.a1 * cr + f.a2 * c2r, di = f.a1 * ci + f.a2 * c2i;
		return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
	};
	/* EQ: bands = [{type, f, q, db}] */
	A.EQ_PRESETS = {
		voice: { name: "Voice clarity", bands: [{ type: "highpass", f: 80, q: 0.707 }, { type: "peak", f: 250, q: 1, db: -3 }, { type: "peak", f: 3200, q: 1, db: 3 }, { type: "highshelf", f: 9000, q: 0.707, db: 2 }] },
		lowcut: { name: "Low cut (rumble, 80 Hz)", bands: [{ type: "highpass", f: 80, q: 0.707 }] },
		lowcut120: { name: "Low cut (wind / handling, 120 Hz)", bands: [{ type: "highpass", f: 120, q: 0.707 }, { type: "highpass", f: 120, q: 0.707 }] },
		podcast: { name: "Podcast warmth", bands: [{ type: "highpass", f: 70, q: 0.707 }, { type: "lowshelf", f: 150, q: 0.707, db: 2 }, { type: "peak", f: 400, q: 1.2, db: -2 }, { type: "peak", f: 4000, q: 1, db: 2 }] },
		demud: { name: "Remove muddiness", bands: [{ type: "peak", f: 300, q: 1.2, db: -5 }] },
		bright: { name: "Brighter", bands: [{ type: "highshelf", f: 6000, q: 0.707, db: 4 }] },
		telephone: { name: "Telephone", bands: [{ type: "highpass", f: 400, q: 0.707 }, { type: "highpass", f: 400, q: 0.707 }, { type: "lowpass", f: 3200, q: 0.707 }, { type: "lowpass", f: 3200, q: 0.707 }] },
		bass: { name: "Bass boost", bands: [{ type: "lowshelf", f: 120, q: 0.707, db: 5 }] }
	};
	A.eq = function (ch, sr, bands) {
		var fs = bands.map(function (b) { return A.biquad(b.type, b.f, sr, b.q || 0.707, b.db || 0); });
		return ch.map(function (c) { var o = c; fs.forEach(function (f) { o = A.filt(o, f); }); return o === c ? c.slice() : o; });
	};
	A.eqResponse = function (bands, sr, freq) { return bands.reduce(function (s, b) { return s + A.response(A.biquad(b.type, b.f, sr, b.q || 0.707, b.db || 0), freq, sr); }, 0); };

	/* ---------- loudness (ITU-R BS.1770-4 / EBU R128) ---------- */
	function kFilters(sr) {
		var G = 4.0, Q1 = 1 / Math.SQRT2, f1 = 1500, Ag = Math.pow(10, G / 40), w = 2 * Math.PI * f1 / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * Q1), sa = 2 * Math.sqrt(Ag) * al;
		var a0 = (Ag + 1) - (Ag - 1) * cw + sa, s1 = { b0: Ag * ((Ag + 1) + (Ag - 1) * cw + sa) / a0, b1: -2 * Ag * ((Ag - 1) + (Ag + 1) * cw) / a0, b2: Ag * ((Ag + 1) + (Ag - 1) * cw - sa) / a0, a1: 2 * ((Ag - 1) - (Ag + 1) * cw) / a0, a2: ((Ag + 1) - (Ag - 1) * cw - sa) / a0 };
		var w2 = 2 * Math.PI * 38 / sr, c2 = Math.cos(w2), al2 = Math.sin(w2) / (2 * 0.5), b0 = 1 + al2, s2 = { b0: (1 + c2) / 2 / b0, b1: -(1 + c2) / b0, b2: (1 + c2) / 2 / b0, a1: -2 * c2 / b0, a2: (1 - al2) / b0 };
		return [s1, s2];
	}
	/* -> {integrated LUFS, momentaryMax, shortTermMax, range LU, blocks} */
	A.loudness = function (ch, sr) {
		var kf = kFilters(sr), w = ch.map(function (c) { return A.filt(A.filt(c, kf[0]), kf[1]); }), n = ch[0].length;
		var bl = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), blocks = [], i, k;
		if (n < bl) { var s0 = 0; w.forEach(function (c) { for (i = 0; i < n; i++) s0 += c[i] * c[i]; }); var z = n ? s0 / n : 0; return { integrated: z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity, blocks: [] }; }
		/* running sums of squares per channel */
		var cs = w.map(function (c) { var s = new Float64Array(n + 1); for (i = 0; i < n; i++) s[i + 1] = s[i] + c[i] * c[i]; return s; });
		for (i = 0; i + bl <= n; i += hop) { var z2 = 0; for (k = 0; k < cs.length; k++) z2 += (cs[k][i + bl] - cs[k][i]) / bl; blocks.push(z2); }
		var L = function (z) { return -0.691 + 10 * Math.log10(z); };
		var abs = blocks.filter(function (z) { return z > 0 && L(z) > -70; });
		if (!abs.length) return { integrated: -Infinity, blocks: blocks, momentaryMax: -Infinity };
		var mean = abs.reduce(function (a, b) { return a + b; }, 0) / abs.length, rel = L(mean) - 10, gated = abs.filter(function (z) { return L(z) > rel; });
		var integ = L(gated.reduce(function (a, b) { return a + b; }, 0) / gated.length);
		var mom = blocks.reduce(function (m, z) { return Math.max(m, z > 0 ? L(z) : -Infinity); }, -Infinity);
		/* loudness range: short-term (3 s) blocks, -70 abs gate, -20 rel gate, 10th..95th percentile */
		var st = [], bl3 = 3 * sr; for (i = 0; i + bl3 <= n; i += hop) { var z3 = 0; for (k = 0; k < cs.length; k++) z3 += (cs[k][i + bl3] - cs[k][i]) / bl3; if (z3 > 0 && L(z3) > -70) st.push(z3); }
		var lra = 0, stMax = -Infinity;
		if (st.length > 1) { var sm = L(st.reduce(function (a, b) { return a + b; }, 0) / st.length) - 20, sg = st.filter(function (z) { return L(z) > sm; }).map(L).sort(function (a, b) { return a - b; }); if (sg.length > 1) lra = sg[Math.round(0.95 * (sg.length - 1))] - sg[Math.round(0.1 * (sg.length - 1))]; stMax = st.reduce(function (m, z) { return Math.max(m, L(z)); }, -Infinity); }
		return { integrated: integ, momentaryMax: mom, shortTermMax: stMax, range: lra, blocks: blocks };
	};
	/* true peak (dBTP) by 4x windowed-sinc oversampling */
	var tpTab = null;
	function tpTable() {
		if (tpTab) return tpTab; var H = 12, P = 4, t = [], ph, j;
		for (ph = 1; ph < P; ph++) { var row = [], fr = ph / P; for (j = -H + 1; j <= H; j++) { var d = j - fr, s = Math.sin(Math.PI * d) / (Math.PI * d), wv = 0.5 + 0.5 * Math.cos(Math.PI * d / H); row.push(s * wv); } t.push(row); }
		return tpTab = t;
	}
	A.truePeak = function (ch) {
		var t = tpTable(), H = 12, m = 0;
		ch.forEach(function (c) {
			var n = c.length, i, j, r;
			for (i = 0; i < n; i++) {
				var v = Math.abs(c[i]); if (v > m) m = v;
				if (i + 1 >= n) continue;
				/* only interpolate where neighbours are loud enough to matter */
				if (Math.max(Math.abs(c[i]), Math.abs(c[i + 1])) < m * 0.5) continue;
				for (r = 0; r < t.length; r++) { var acc = 0, row = t[r]; for (j = 0; j < row.length; j++) { var k = i + j - H + 1; if (k >= 0 && k < n) acc += c[k] * row[j]; } acc = Math.abs(acc); if (acc > m) m = acc; }
			}
		});
		return m > 0 ? A.gainToDb(m) : -Infinity;
	};

	/* ---------- dynamics ---------- */
	/* lookahead peak limiter (stereo linked): nothing goes above ceilingDb; attack = lookahead, release in ms */
	A.limiter = function (ch, sr, ceilingDb, releaseMs, lookMs) {
		var c = A.dbToGain(ceilingDb), n = ch[0].length, la = Math.max(1, Math.round((lookMs || 5) * sr / 1000)), rel = Math.exp(-1 / ((releaseMs || 80) * sr / 1000)), i, k;
		var need = new Float32Array(n);
		for (i = 0; i < n; i++) { var p = 0; for (k = 0; k < ch.length; k++) { var v = Math.abs(ch[k][i]); if (v > p) p = v; } need[i] = p > c ? c / p : 1; }
		/* h[o] = min(need[o .. o + la]); s = moving average of h over la + 1 samples (a linear ramp that still reaches every peak); exponential release */
		var h = new Float32Array(n), dq = new Int32Array(n), hd = 0, tl = 0, o2;
		for (i = 0; i < n; i++) { while (tl > hd && need[dq[tl - 1]] >= need[i]) tl--; dq[tl++] = i; o2 = i - la; if (o2 >= 0) { while (dq[hd] < o2) hd++; h[o2] = need[dq[hd]]; } }
		for (o2 = Math.max(0, n - la); o2 < n; o2++) { while (dq[hd] < o2) hd++; h[o2] = need[dq[hd]]; }
		var out = ch.map(function () { return new Float32Array(n); }), g = 1, sum = 0;
		for (i = 0; i < n; i++) {
			sum += h[i]; if (i > la) sum -= h[i - la - 1];
			var cnt = Math.min(i + 1, la + 1), sm = (sum + (la + 1 - cnt) * h[0]) / (la + 1);
			g = sm < g ? sm : sm + (g - sm) * rel;
			for (k = 0; k < ch.length; k++) out[k][i] = ch[k][i] * g;
		}
		return out;
	};
	/* feed-forward compressor, stereo linked, soft knee. o: {threshold dB, ratio, attack ms, release ms, knee dB, makeup dB | 'auto'} */
	A.compress = function (ch, sr, o) {
		var th = o.threshold, ra = Math.max(1, o.ratio), kn = o.knee == null ? 6 : o.knee, at = Math.exp(-1 / ((o.attack || 10) * sr / 1000)), rl = Math.exp(-1 / ((o.release || 120) * sr / 1000));
		var mk = o.makeup === "auto" ? -(th - th / ra) * 0.5 : (o.makeup || 0), n = ch[0].length, env = -120, i, k, out = ch.map(function () { return new Float32Array(n); });
		for (i = 0; i < n; i++) {
			var p = 0; for (k = 0; k < ch.length; k++) { var v = Math.abs(ch[k][i]); if (v > p) p = v; }
			var x = p > 1e-6 ? 20 * Math.log10(p) : -120;
			env = x > env ? x + (env - x) * at : x + (env - x) * rl;
			var over = env - th, red;
			if (2 * over < -kn) red = 0; else if (2 * Math.abs(over) <= kn) red = (1 / ra - 1) * Math.pow(over + kn / 2, 2) / (2 * kn); else red = (1 / ra - 1) * over;
			var g = Math.pow(10, (red + mk) / 20); for (k = 0; k < ch.length; k++) out[k][i] = ch[k][i] * g;
		}
		return out;
	};
	A.compRedDb = function (inDb, o) { var ra = Math.max(1, o.ratio), kn = o.knee == null ? 6 : o.knee, over = inDb - o.threshold; if (2 * over < -kn) return 0; if (2 * Math.abs(over) <= kn) return (1 / ra - 1) * Math.pow(over + kn / 2, 2) / (2 * kn); return (1 / ra - 1) * over; };
	/* loudness normalisation: gain to target LUFS, then true-peak limiting to the ceiling. -> {ch, before, after, gain, tp} */
	A.loudnessNormalize = function (ch, sr, targetLufs, tpCeilDb) {
		var m = A.loudness(ch, sr); if (!isFinite(m.integrated)) return { ch: ch.map(function (c) { return c.slice(); }), before: m.integrated, after: m.integrated, gain: 0, tp: A.truePeak(ch) };
		var g = targetLufs - m.integrated, y = A.gain(ch, g), tp = A.truePeak(y), ceil = tpCeilDb, it = 0;
		while (tp > tpCeilDb + 0.05 && it < 4) { y = A.limiter(A.gain(ch, g), sr, ceil - 0.1, 100, 5); tp = A.truePeak(y); ceil -= (tp - tpCeilDb) + 0.1; it++; }
		return { ch: y, before: m.integrated, after: A.loudness(y, sr).integrated, gain: g, tp: tp };
	};

	/* ---------- de-click: second-difference outliers -> cubic interpolation ---------- */
	A.declick = function (ch, sr, sensitivity) {
		var k = 30 - 22 * Math.max(0, Math.min(1, sensitivity == null ? 0.5 : sensitivity)), fixed = 0;
		var out = ch.map(function (c) {
			var n = c.length, y = c.slice(), d = new Float32Array(n), i, B = 2048;
			for (i = 1; i < n - 1; i++) d[i] = Math.abs(c[i - 1] - 2 * c[i] + c[i + 1]);
			var bad = new Uint8Array(n);
			for (var s = 0; s < n; s += B) {
				var e = Math.min(n, s + B), arr = Array.prototype.slice.call(d.subarray(s, e)).sort(function (a, b) { return a - b; }), med = arr[arr.length >> 1] || 0, thr = Math.max(1e-4, med * k);
				for (i = s; i < e; i++) if (d[i] > thr) { for (var j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) bad[j] = 1; }
			}
			i = 0;
			while (i < n) {
				if (!bad[i]) { i++; continue; }
				var a = i; while (i < n && bad[i]) i++; var b = i; // [a, b) bad
				if (b - a > Math.round(sr * 0.003) || a < 2 || b > n - 2) continue;
				var p0 = y[a - 2], p1 = y[a - 1], p2 = y[b], p3 = y[b + 1], m1 = p1 - p0, m2 = p3 - p2, L = b - a + 1;
				for (var q = a; q < b; q++) { var t = (q - a + 1) / L, t2 = t * t, t3 = t2 * t; y[q] = (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 * L + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2 * L; }
				fixed++;
			}
			return y;
		});
		out.fixed = fixed;
		return out;
	};

	/* ---------- export ---------- */
	/* interleaved WAV: bits 16 | 24 | 32 (float) */
	A.wav = function (ch, sr, bits) {
		bits = bits || 16; var nch = ch.length, n = ch[0].length, bps = bits / 8, size = n * nch * bps, buf = new ArrayBuffer(44 + size), v = new DataView(buf), p = 44, i, k;
		function s(o, t) { for (var j = 0; j < t.length; j++) v.setUint8(o + j, t.charCodeAt(j)); }
		s(0, "RIFF"); v.setUint32(4, 36 + size, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, nch, true);
		v.setUint32(24, sr, true); v.setUint32(28, sr * nch * bps, true); v.setUint16(32, nch * bps, true); v.setUint16(34, bits, true); s(36, "data"); v.setUint32(40, size, true);
		for (i = 0; i < n; i++) for (k = 0; k < nch; k++) {
			var x = Math.max(-1, Math.min(1, ch[k][i]));
			if (bits === 32) { v.setFloat32(p, ch[k][i], true); p += 4; }
			else if (bits === 24) { var q = Math.round(x * 8388607); v.setUint8(p, q & 255); v.setUint8(p + 1, (q >> 8) & 255); v.setUint8(p + 2, (q >> 16) & 255); p += 3; }
			else { v.setInt16(p, Math.round(x < 0 ? x * 32768 : x * 32767), true); p += 2; }
		}
		return buf;
	};
	/* 16-bit PCM WAV reader (tests and project files) -> {sr, ch} */
	A.readWav = function (buf) {
		var v = new DataView(buf), p = 12, fmt = null, ch = null;
		while (p + 8 <= v.byteLength) {
			var id = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3)), sz = v.getUint32(p + 4, true);
			if (id === "fmt ") fmt = { tag: v.getUint16(p + 8, true), nch: v.getUint16(p + 10, true), sr: v.getUint32(p + 12, true), bits: v.getUint16(p + 22, true) };
			if (id === "data" && fmt) {
				var bps = fmt.bits / 8, n = Math.floor(sz / bps / fmt.nch), i, k; ch = [];
				for (k = 0; k < fmt.nch; k++) ch.push(new Float32Array(n));
				for (i = 0; i < n; i++) for (k = 0; k < fmt.nch; k++) {
					var o = p + 8 + (i * fmt.nch + k) * bps;
					ch[k][i] = fmt.tag === 3 ? v.getFloat32(o, true) : fmt.bits === 24 ? (((v.getUint8(o + 2) << 24) | (v.getUint8(o + 1) << 16) | (v.getUint8(o) << 8)) >> 8) / 8388608 : v.getInt16(o, true) / 32768;
				}
			}
			p += 8 + sz + (sz & 1);
		}
		return fmt && ch ? { sr: fmt.sr, ch: ch } : null;
	};
	/* Float32 -> Int16 for the MP3 encoder */
	A.toInt16 = function (c, a, b) { var o = new Int16Array(b - a), i; for (i = a; i < b; i++) { var x = Math.max(-1, Math.min(1, c[i])); o[i - a] = x < 0 ? x * 32768 : x * 32767; } return o; };
	/* lamejs: MPEG-1 for 32 / 44.1 / 48 kHz allows 320 kbps */
	A.mp3Rate = function (sr) { return [48000, 44100, 32000].indexOf(sr) >= 0 ? sr : sr > 44100 ? 48000 : 44100; };
	A.fileName = function (name, ext) { var b = String(name || "audio").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "audio"; return b + "." + ext; };

	/* ---------- history ---------- */
	/* a snapshot is the track list + markers; arrays are shared, so its cost = arrays not in the newer state */
	A.snapshot = function (st) { return { tracks: st.tracks.map(function (t) { var o = {}, k; for (k in t) o[k] = t[k]; o.clips = t.clips.slice(); return o; }), markers: st.markers.map(function (m) { return { t: m.t, name: m.name, id: m.id }; }) }; };
	A.bytesOf = function (snap, seen) { var b = 0; snap.tracks.forEach(function (t) { t.clips.forEach(function (c) { c.ch.forEach(function (a) { if (!seen.has(a)) { seen.add(a); b += a.byteLength; } }); }); }); return b; };
	A.History = function (budget) {
		this.stack = []; this.pos = -1; this.budget = budget || 1.5e9;
	};
	A.History.prototype.push = function (label, snap) {
		this.stack.length = this.pos + 1; this.stack.push({ label: label, snap: snap }); this.pos++;
		while (this.stack.length > 2) { var seen = new Set(), tot = 0, i; for (i = this.stack.length - 1; i >= 0; i--) tot += A.bytesOf(this.stack[i].snap, seen); if (tot <= this.budget && this.stack.length <= 100) break; this.stack.shift(); this.pos--; }
	};
	A.History.prototype.undo = function () { if (this.pos <= 0) return null; this.pos--; return this.stack[this.pos]; };
	A.History.prototype.redo = function () { if (this.pos >= this.stack.length - 1) return null; this.pos++; return this.stack[this.pos]; };
	A.History.prototype.canUndo = function () { return this.pos > 0; };
	A.History.prototype.canRedo = function () { return this.pos < this.stack.length - 1; };

	/* ---------- search over commands ---------- */
	A.norm = function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };
	A.match = function (items, q) {
		q = A.norm(q).trim(); if (!q) return items.slice();
		var words = q.split(/\s+/);
		return items.map(function (it) { var h = A.norm(it.name + " " + (it.keys || "")), sc = 0; for (var i = 0; i < words.length; i++) { var p = h.indexOf(words[i]); if (p < 0) return null; sc += p === 0 || h[p - 1] === " " ? 2 : 1; } return { it: it, sc: sc }; })
			.filter(Boolean).sort(function (a, b) { return b.sc - a.sc; }).map(function (x) { return x.it; });
	};

	if (typeof module === "object" && module.exports) module.exports = A;
	else root.MESAudio = A;
})(typeof window !== "undefined" ? window : this);
