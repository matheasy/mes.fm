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

/* MES Audio Editor (mes.fm/audio): multi-track timeline, editing, effects, AI noise removal (window.MESDenoise, /main_js/denoise.js), A/B preview,
 * recording, export (WAV, MP3 via lamejs, M4A via WebCodecs + mp4-muxer), IndexedDB autosave. Pure model + DSP = lib.js (MESAudio). Nothing is uploaded. */
(function () {
	"use strict";
	var A = window.MESAudio, DN = window.MESDenoise, D = DN && DN.dsp, root = document.getElementById("au");
	if (!root || !A) return;
	var LAME = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js", MUXER = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js";
	function $(id) { return document.getElementById(id); }
	function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("mes-audio:" + k)); localStorage.setItem("mes-audio:" + k, JSON.stringify(v)); } catch (e) { return null; } }
	function loadScript(u) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { rej(new Error("Could not load " + u.split("/")[2])); }; document.head.appendChild(s); }); }
	var isMac = /Mac|iPhone|iPad/.test(navigator.platform), MOD = isMac ? "⌘" : "Ctrl+";

	/* ---------------- state ---------------- */
	var S = { sr: 48000, tracks: [], markers: [], sel: null, selT: [], cursor: 0, start: 0, spp: 400, spec: false, name: "", laneH: 112 };
	var H = new A.History(1.5e9), clipboard = null, dirty = false;
	function snap() { return A.snapshot(S); }
	function commit(label) { H.push(label, snap()); dirty = true; afterChange(); schedSave(); }
	function restore(e) { S.tracks = e.snap.tracks.map(function (t) { var o = {}, k; for (k in t) o[k] = t[k]; o.clips = t.clips.slice(); return o; }); S.markers = e.snap.markers.map(function (m) { return { id: m.id, t: m.t, name: m.name }; }); S.selT = S.selT.filter(function (id) { return trackById(id); }); afterChange(); schedSave(); }
	function undo() { stopAll(); var e = H.undo(); if (e) { restore(e); toast("Undid " + H.stack[H.pos + 1].label); } }
	function redo() { stopAll(); var e = H.redo(); if (e) { restore(e); toast("Redid " + e.label); } }
	function trackById(id) { for (var i = 0; i < S.tracks.length; i++) if (S.tracks[i].id === id) return S.tracks[i]; return null; }
	function setTrack(t) { S.tracks = S.tracks.map(function (x) { return x.id === t.id ? t : x; }); }
	function projEnd() { return A.projectEnd(S.tracks); }
	function sec(n) { return n / S.sr; }
	function fmt(n, d) { return A.fmtTime(n / S.sr, d); }

	/* ---------------- toast / busy ---------------- */
	var toastT = null;
	function toast(msg, action) {
		var t = root.querySelector(".au-toast"); if (t) t.remove();
		t = el("div", { class: "au-toast", role: "status" }, esc(msg)); if (action) { var b = el("button", { type: "button", class: "au-btn au-btn--sm" }, esc(action.label)); b.onclick = function () { t.remove(); action.fn(); }; t.appendChild(b); }
		root.appendChild(t); clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, action ? 7000 : 2600);
	}
	var busyAbort = null;
	function busy(title) {
		var o = el("div", { class: "au-busy" }, '<div class="au-busy-in"><div class="au-busy-t">' + esc(title) + '</div><div class="au-prog"><i></i></div><div class="au-busy-m">Starting…</div><div><button type="button" class="au-btn au-btn--sm">Cancel</button></div></div>');
		root.appendChild(o); var ac = window.AbortController ? new AbortController() : { signal: { aborted: false }, abort: function () { this.signal.aborted = true; } };
		busyAbort = ac; o.querySelector("button").onclick = function () { ac.abort(); o.querySelector(".au-busy-m").textContent = "Stopping…"; };
		return { signal: ac.signal, set: function (f, m) { o.querySelector("i").style.width = Math.round(f * 100) + "%"; if (m) o.querySelector(".au-busy-m").textContent = m + " · " + Math.round(f * 100) + "%"; }, done: function () { o.remove(); busyAbort = null; } };
	}
	function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

	/* ---------------- audio context / decoding ---------------- */
	var ctx = null, master = null, analyser = null;
	function actx() {
		if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; ctx = new C(); master = ctx.createGain(); analyser = ctx.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser); analyser.connect(ctx.destination); master.gain.value = +$("au-vol").value; }
		if (ctx.state === "suspended") ctx.resume();
		return ctx;
	}
	function decode(buf) {
		var O = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new O(2, 1, S.sr);
		return new Promise(function (res, rej) { var p = oc.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
	}
	function abToCh(ab) { var o = [], k; for (k = 0; k < ab.numberOfChannels; k++) o.push(new Float32Array(ab.getChannelData(k))); if (o.length > 2) o = [o[0], o[1]]; if (o.length === 2 && D && D.sameChannels(o)) o = [o[0]]; return o; }
	function addTrackFrom(ch, name, at) {
		var t = A.track({ name: name, nch: ch.length, clips: [A.clip(at || 0, ch)] });
		S.tracks.push(t); return t;
	}
	function openFiles(files) {
		files = Array.prototype.slice.call(files || []).filter(function (f) { return f && f.size; }); if (!files.length) return;
		stopAll(); var b = busy("Opening " + (files.length === 1 ? files[0].name : files.length + " files")), i = 0, added = 0, firstEmpty = !S.tracks.length;
		function next() {
			if (i >= files.length || b.signal.aborted) {
				b.done(); if (added) { if (firstEmpty) { S.name = files[0].name.replace(/\.[^.]+$/, ""); zoomFit(); } commit(added > 1 ? "Open " + added + " files" : "Open " + files[0].name); }
				return;
			}
			var f = files[i++]; b.set((i - 1) / files.length, "Decoding " + f.name);
			if (/\.mesaudio$|\.json$/i.test(f.name)) { toast("Project files are not supported yet: the project is kept in this browser automatically"); return next(); }
			return f.arrayBuffer().then(decode).then(function (ab) {
				var ch = abToCh(ab); if (!ch[0].length) throw new Error("no audio");
				addTrackFrom(ch, f.name.replace(/\.[^.]+$/, ""), firstEmpty ? 0 : 0); added++;
			}).catch(function (e) { toast("Could not open " + f.name + (/video|mp4|mov|mkv|webm/i.test(f.type + f.name) ? " (this browser cannot read the sound of this video)" : "") + ": " + (e && e.message || "not an audio file")); }).then(tick).then(next);
		}
		next();
	}

	/* ---------------- view ---------------- */
	var cv = $("au-cv"), over = $("au-over"), ruler = $("au-ruler"), lanes = $("au-lanes"), heads = $("au-heads"), scrollBox = $("au-scroll"), W = 800, dpr = 1;
	function laneW() { return Math.max(100, lanes.clientWidth); }
	function xOf(n) { return (n - S.start) / S.spp; }
	function nOf(x) { return Math.round(S.start + x * S.spp); }
	function clampView() { var end = Math.max(projEnd(), S.sr * 10), maxStart = Math.max(0, end - laneW() * S.spp * 0.5); S.spp = Math.max(1 / 16, Math.min(S.spp, end / 50 + S.sr)); S.start = Math.max(0, Math.min(S.start, maxStart)); }
	function zoomAt(f, x) { var n = S.start + x * S.spp; S.spp = Math.max(1 / 16, Math.min(S.sr * 60, S.spp / f)); S.start = n - x * S.spp; clampView(); draw(); }
	function zoomFit() { var end = projEnd() || S.sr * 10; S.spp = Math.max(1 / 16, end / (laneW() - 20)); S.start = 0; clampView(); draw(); }
	function zoomSel() { if (!S.sel) return zoomFit(); var len = S.sel.b - S.sel.a; S.spp = Math.max(1 / 16, len / (laneW() * 0.9)); S.start = S.sel.a - len * 0.05; clampView(); draw(); }

	var peaksCache = new WeakMap();
	function peaksOf(c) { var key = c.ch[0], p = peaksCache.get(key); if (!p) { p = A.peakSet(c.ch); peaksCache.set(key, p); } return p; }
	var COLORS = ["#2dd4bf", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#4ade80", "#fb923c", "#38bdf8"];
	function trackColor(i) { return COLORS[i % COLORS.length]; }

	var raf = 0;
	function draw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawNow(); }); }
	function sizeCanvas(c, w, h) { if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); } c.style.width = w + "px"; c.style.height = h + "px"; }
	function drawNow() {
		dpr = window.devicePixelRatio || 1; W = laneW(); clampView();
		var nT = S.tracks.length, h = Math.max(1, nT) * S.laneH;
		sizeCanvas(cv, W, h); sizeCanvas(over, W, h); sizeCanvas(ruler, W, 28);
		lanes.style.height = h + "px";
		var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, h);
		S.tracks.forEach(function (t, ti) { drawLane(g, t, ti); });
		/* selection */
		if (S.sel) {
			var x0 = Math.max(-2, xOf(S.sel.a)), x1 = Math.min(W + 2, xOf(S.sel.b));
			S.tracks.forEach(function (t, ti) { if (S.selT.indexOf(t.id) < 0) return; g.fillStyle = "rgba(56,189,248,0.2)"; g.fillRect(x0, ti * S.laneH, Math.max(1, x1 - x0), S.laneH); g.fillStyle = "#7dd3fc"; g.fillRect(x0, ti * S.laneH, 1, S.laneH); g.fillRect(x1 - 1, ti * S.laneH, 1, S.laneH); });
		}
		/* markers */
		S.markers.forEach(function (m) { var x = xOf(m.t); if (x < -1 || x > W + 1) return; g.strokeStyle = "rgba(244,114,182,0.7)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); g.setLineDash([]); });
		drawRuler(); drawOver(); syncUi();
	}
	function drawLane(g, t, ti) {
		var y0 = ti * S.laneH, lh = S.laneH, col = trackColor(ti), sel = S.selT.indexOf(t.id) >= 0;
		g.fillStyle = sel ? "#161d24" : "#14161b"; g.fillRect(0, y0, W, lh);
		g.fillStyle = "#333948"; g.fillRect(0, y0 + lh - 1, W, 1);
		t.clips.forEach(function (c) {
			var cs = c.start, ce = cs + A.clipLen(c), x0 = xOf(cs), x1 = xOf(ce); if (x1 < 0 || x0 > W) return;
			var cx0 = Math.max(0, x0), cx1 = Math.min(W, x1);
			g.fillStyle = t.mute ? "#1d2027" : "#1b2b31"; g.fillRect(cx0, y0 + 2, Math.max(1, cx1 - cx0), lh - 4);
			g.fillStyle = t.mute ? "#2b2f38" : "#264a52"; g.fillRect(cx0, y0 + 2, Math.max(1, cx1 - cx0), 13);
			g.strokeStyle = "#2d5560"; g.strokeRect(x0 + 0.5, y0 + 2.5, Math.max(1, x1 - x0 - 1), lh - 5);
			if (x1 - x0 > 50) { g.fillStyle = "#cfe9ee"; g.font = "11px system-ui,sans-serif"; g.fillText(fmt(A.clipLen(c), 1), Math.max(cx0, x0) + 5, y0 + 12); }
			var top = y0 + 16, avail = lh - 20, nch = c.ch.length, chH = avail / nch;
			if (S.spec) { drawSpec(g, t, c, cx0, cx1, top, avail); return; }
			for (var k = 0; k < nch; k++) drawWave(g, c, k, cx0, cx1, top + k * chH, chH, t.mute ? "#5b6472" : col);
		});
	}
	function drawWave(g, c, k, cx0, cx1, top, hh, col) {
		var mid = top + hh / 2, amp = hh / 2 - 1, data = c.ch[k], len = data.length;
		g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(cx0, mid, cx1 - cx0, 1);
		g.fillStyle = col; g.strokeStyle = col;
		if (S.spp < 2) {
			g.beginPath(); var first = true;
			for (var x = Math.floor(cx0); x <= Math.ceil(cx1); x++) { var n = S.start + x * S.spp - c.start, i = Math.floor(n); if (i < 0 || i >= len) continue; var v = data[i]; if (first) { g.moveTo(x, mid - v * amp); first = false; } else g.lineTo(x, mid - v * amp); }
			g.stroke();
			if (S.spp < 0.25) for (x = Math.floor(cx0); x <= cx1; x++) { var n2 = S.start + x * S.spp - c.start; if (Math.abs(n2 - Math.round(n2)) < S.spp / 2) { var j = Math.round(n2); if (j >= 0 && j < len) g.fillRect(x - 1.5, mid - data[j] * amp - 1.5, 3, 3); } }
			return;
		}
		var P = peaksOf(c)[k], lvl = P[0];
		for (var L = 2; L >= 0; L--) if (P[L].block <= S.spp) { lvl = P[L]; break; }
		for (var xx = Math.floor(cx0); xx < cx1; xx++) {
			var a = S.start + xx * S.spp - c.start, b = a + S.spp; if (b <= 0 || a >= len) continue;
			var lo = 0, hi = 0, init = false;
			if (S.spp < 64) { var ia = Math.max(0, Math.floor(a)), ib = Math.min(len, Math.ceil(b)); for (var q = ia; q < ib; q++) { var vv = data[q]; if (!init) { lo = hi = vv; init = true; } else { if (vv < lo) lo = vv; if (vv > hi) hi = vv; } } }
			else { var pa = Math.max(0, Math.floor(a / lvl.block)), pb = Math.min(lvl.min.length, Math.ceil(b / lvl.block)); for (var p = pa; p < pb; p++) { if (!init) { lo = lvl.min[p]; hi = lvl.max[p]; init = true; } else { if (lvl.min[p] < lo) lo = lvl.min[p]; if (lvl.max[p] > hi) hi = lvl.max[p]; } } }
			if (!init) continue;
			var y1 = mid - Math.min(1, hi) * amp, y2 = mid - Math.max(-1, lo) * amp; g.fillRect(xx, y1, 1, Math.max(1, y2 - y1));
		}
	}
	/* spectrogram: 1024-point FFT per pixel column, log frequency 40 Hz .. Nyquist, -100 .. -20 dB */
	var specCache = new Map(), specPlan = null, specWin = null;
	function cmap(v) { v = Math.max(0, Math.min(1, v)); var r = Math.round(255 * Math.min(1, Math.max(0, 1.6 * v - 0.25))), gg = Math.round(255 * Math.max(0, Math.min(1, 2.2 * (v - 0.45)))), b = Math.round(255 * Math.max(0, Math.min(1, v < 0.5 ? 0.25 + v * 1.2 : 1.6 - 1.6 * v))); return [r, gg, b]; }
	function drawSpec(g, t, c, cx0, cx1, top, hh) {
		if (!D) return; var N = 1024; if (!specPlan) { specPlan = D.fftPlan(N); specWin = new Float64Array(N); for (var i = 0; i < N; i++) specWin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); }
		var w = Math.max(1, Math.round(cx1 - cx0)), h = Math.max(1, Math.round(hh)), key = c.ch[0].length + "|" + S.start + "|" + S.spp + "|" + Math.round(cx0) + "|" + w + "|" + h, cache = specCache.get(c.ch[0]);
		if (!cache || cache.key !== key) {
			var img = g.createImageData(w * 1, h), re = new Float64Array(N), im = new Float64Array(N), data = c.ch[0], d2 = c.ch[1], len = data.length, nyq = S.sr / 2, lmin = Math.log(40), lmax = Math.log(nyq), rows = new Int32Array(h);
			for (var y = 0; y < h; y++) { var fr = Math.exp(lmax - (y + 0.5) / h * (lmax - lmin)); rows[y] = Math.min(N / 2, Math.max(1, Math.round(fr / nyq * N / 2))); }
			for (var x = 0; x < w; x++) {
				var center = Math.round(S.start + (Math.round(cx0) + x + 0.5) * S.spp - c.start);
				for (var k = 0; k < N; k++) { var n = center - N / 2 + k, v = n >= 0 && n < len ? (d2 ? 0.5 * (data[n] + d2[n]) : data[n]) : 0; re[k] = v * specWin[k]; im[k] = 0; }
				specPlan.fwd(re, im);
				for (y = 0; y < h; y++) { var bin = rows[y], m = re[bin] * re[bin] + im[bin] * im[bin], db = 10 * Math.log10(m / (N * N / 16) + 1e-12), rgb = cmap((db + 100) / 80), o = (y * w + x) * 4; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255; }
			}
			cache = { key: key, img: img }; specCache.set(c.ch[0], cache);
		}
		g.putImageData(cache.img, Math.round(cx0) * dpr, Math.round(top) * dpr);
		if (dpr !== 1) { /* putImageData ignores the transform: redraw scaled */ var tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h; tmp.getContext("2d").putImageData(cache.img, 0, 0); g.clearRect(Math.round(cx0), Math.round(top), w, h); g.drawImage(tmp, Math.round(cx0), Math.round(top), w, h); }
	}
	function niceStep(spp) { var secPerPx = spp / S.sr, target = secPerPx * 90, steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]; for (var i = 0; i < steps.length; i++) if (steps[i] >= target) return steps[i]; return 7200; }
	function drawRuler() {
		var g = ruler.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#1c1f26"; g.fillRect(0, 0, W, 28);
		var st = niceStep(S.spp), t0 = Math.floor(sec(S.start) / st) * st, t1 = sec(S.start + W * S.spp), dg = st < 0.01 ? 3 : st < 0.1 ? 2 : st < 1 ? 1 : 0;
		g.fillStyle = "#a3aab8"; g.font = "11px system-ui,sans-serif"; g.strokeStyle = "#4b5263";
		for (var t = t0; t <= t1 + st; t += st) { var x = xOf(t * S.sr); if (x < -60) continue; g.beginPath(); g.moveTo(x + 0.5, 16); g.lineTo(x + 0.5, 28); g.stroke(); g.fillText(A.fmtTime(t, dg), x + 3, 13); for (var s = 1; s < 5; s++) { var xs = xOf((t + st * s / 5) * S.sr); g.beginPath(); g.moveTo(xs + 0.5, 23); g.lineTo(xs + 0.5, 28); g.stroke(); } }
		if (S.sel) { g.fillStyle = "rgba(56,189,248,0.35)"; g.fillRect(xOf(S.sel.a), 22, xOf(S.sel.b) - xOf(S.sel.a), 6); }
		S.markers.forEach(function (m) { var x = xOf(m.t); if (x < -80 || x > W) return; g.fillStyle = "#f472b6"; g.beginPath(); g.moveTo(x, 28); g.lineTo(x - 5, 18); g.lineTo(x + 5, 18); g.closePath(); g.fill(); g.font = "bold 10px system-ui,sans-serif"; g.fillText(m.name.slice(0, 24), x + 6, 25); });
	}
	function drawOver() {
		var g = over.getContext("2d"), h = over.height / dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, h);
		var p = playing ? playPos() : S.cursor, x = xOf(p);
		if (x >= -1 && x <= W + 1) { g.fillStyle = playing ? "#fbbf24" : "#e7e9ee"; g.fillRect(Math.round(x), 0, 1.5, h); }
		$("au-time").textContent = fmt(p);
	}

	/* ---------------- track headers ---------------- */
	function renderHeads() {
		heads.innerHTML = "";
		S.tracks.forEach(function (t, ti) {
			var h = el("div", { class: "au-head" + (S.selT.indexOf(t.id) >= 0 ? " is-sel" : ""), "data-id": t.id }); h.style.height = S.laneH + "px"; h.style.borderLeft = "3px solid " + trackColor(ti);
			h.innerHTML = '<input class="au-tname" type="text" aria-label="Track name" spellcheck="false"><div class="au-head-r"><button type="button" class="au-ib au-ms" aria-pressed="' + t.mute + '" title="Mute">M</button><button type="button" class="au-ib au-ms au-solo" aria-pressed="' + t.solo + '" title="Solo">S</button><span style="flex:1"></span><button type="button" class="au-ib au-ms au-del" title="Delete track" aria-label="Delete track">🗑</button></div>' +
				'<label title="Track volume">Vol<input type="range" min="-30" max="12" step="0.5" aria-label="Track volume"><span class="au-gv"></span></label><label class="au-pan" title="Pan">Pan<input type="range" min="-1" max="1" step="0.05" aria-label="Pan"></label>';
			var nm = h.querySelector(".au-tname"); nm.value = t.name;
			nm.onchange = function () { var o = Object.assign({}, trackById(t.id), { name: nm.value || "Track" }); setTrack(o); commit("Rename track"); };
			var bs = h.querySelectorAll("button");
			bs[0].onclick = function () { var o = Object.assign({}, trackById(t.id)); o.mute = !o.mute; setTrack(o); commit(o.mute ? "Mute" : "Unmute"); liveMix(); };
			bs[1].onclick = function () { var o = Object.assign({}, trackById(t.id)); o.solo = !o.solo; setTrack(o); commit(o.solo ? "Solo" : "Unsolo"); liveMix(); };
			bs[2].onclick = function () { deleteTrack(t.id); };
			var rs = h.querySelectorAll("input[type=range]"), gv = h.querySelector(".au-gv");
			rs[0].value = t.gain; gv.textContent = (t.gain > 0 ? "+" : "") + t.gain + " dB"; rs[1].value = t.pan;
			rs[0].oninput = function () { var o = Object.assign({}, trackById(t.id)); o.gain = +rs[0].value; setTrack(o); gv.textContent = (o.gain > 0 ? "+" : "") + o.gain + " dB"; liveMix(); };
			rs[0].onchange = function () { commit("Track volume"); };
			rs[1].oninput = function () { var o = Object.assign({}, trackById(t.id)); o.pan = +rs[1].value; setTrack(o); liveMix(); };
			rs[1].onchange = function () { commit("Pan"); };
			h.addEventListener("pointerdown", function (e) { if (e.target.closest("input,button")) return; selectTracks(e.shiftKey || e.metaKey || e.ctrlKey ? toggle(S.selT, t.id) : [t.id]); });
			heads.appendChild(h);
		});
	}
	function toggle(arr, id) { var a = arr.slice(), i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); return a; }
	function selectTracks(ids) { S.selT = ids; if (!S.sel && ids.length) { /* selecting a whole track */ } afterSel(); }
	function deleteTrack(id) { stopAll(); var t = trackById(id); S.tracks = S.tracks.filter(function (x) { return x.id !== id; }); S.selT = S.selT.filter(function (x) { return x !== id; }); commit("Delete track " + (t ? t.name : "")); }

	/* ---------------- UI sync ---------------- */
	function afterChange() { renderHeads(); updateEmpty(); syncUi(); draw(); }
	function afterSel() { renderHeads(); draw(); }
	function updateEmpty() { $("au-empty").hidden = S.tracks.length > 0; }
	function syncUi() {
		$("au-undo").disabled = !H.canUndo(); $("au-redo").disabled = !H.canRedo();
		var end = projEnd(); $("au-st-len").textContent = S.tracks.length ? S.tracks.length + " track" + (S.tracks.length > 1 ? "s" : "") + " · " + fmt(end, 1) : "No audio";
		$("au-st-rate").textContent = S.sr + " Hz";
		$("au-st-sel").textContent = S.sel ? "Selection " + fmt(S.sel.b - S.sel.a) + " on " + S.selT.length + " track" + (S.selT.length === 1 ? "" : "s") : "";
		if (document.activeElement !== $("au-sa")) $("au-sa").value = S.sel ? fmt(S.sel.a) : "";
		if (document.activeElement !== $("au-sb")) $("au-sb").value = S.sel ? fmt(S.sel.b) : "";
		$("au-slen").textContent = S.sel ? "(" + fmt(S.sel.b - S.sel.a, 2) + ")" : "";
		var tot = Math.max(end, S.sr * 10), vis = W * S.spp, hs = $("au-hs"); hs.max = 1000; hs.value = tot > vis ? Math.round(S.start / Math.max(1, tot - vis * 0.5) * 1000) : 0; hs.disabled = tot <= vis;
		$("au-vrange").textContent = fmt(S.start, 1) + " – " + fmt(S.start + vis, 1);
		$("au-zoomlab").textContent = S.spp < 1 ? Math.round(1 / S.spp) + " px/sample" : (S.sr / S.spp).toFixed(S.sr / S.spp < 10 ? 1 : 0) + " px/s";
		$("au-spec").setAttribute("aria-pressed", S.spec); $("au-loop").setAttribute("aria-pressed", loop);
	}

	/* ---------------- pointer: select / move clips / seek ---------------- */
	var drag = null;
	function laneAt(y) { var i = Math.floor(y / S.laneH); return i >= 0 && i < S.tracks.length ? i : -1; }
	function clipAt(t, n) { for (var i = t.clips.length - 1; i >= 0; i--) { var c = t.clips[i]; if (n >= c.start && n < c.start + A.clipLen(c)) return c; } return null; }
	var pointers = new Map(), pinch = null;
	cv.addEventListener("pointerdown", function (e) {
		if (e.button === 2) return; cv.focus({ preventScroll: true }); actx();
		pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
		if (pointers.size === 2) { var ps = Array.from(pointers.values()); pinch = { d: Math.abs(ps[0].x - ps[1].x) || 1, spp: S.spp, x: (ps[0].x + ps[1].x) / 2, start: S.start }; drag = null; return; }
		var ti = laneAt(e.offsetY); if (ti < 0) { setCursor(nOf(e.offsetX)); S.sel = null; afterSel(); return; }
		var t = S.tracks[ti], n = nOf(e.offsetX), yIn = e.offsetY - ti * S.laneH, c = clipAt(t, n);
		cv.setPointerCapture(e.pointerId);
		if (c && yIn < 16) { drag = { kind: "move", t: t, c: c, n0: n, s0: c.start, ti: ti, moved: false }; return; }
		if (e.shiftKey && S.sel) { var a0 = Math.abs(n - S.sel.a) < Math.abs(n - S.sel.b) ? S.sel.b : S.sel.a; drag = { kind: "sel", anchor: a0, ti0: ti, ids: S.selT.length ? S.selT : [t.id] }; moveSel(n, ti); return; }
		drag = { kind: "sel", anchor: n, ti0: ti, x0: e.offsetX, ids: (e.ctrlKey || e.metaKey) ? toggle(S.selT, t.id) : [t.id], moved: false };
	});
	function moveSel(n, ti) {
		var a = Math.max(0, Math.min(drag.anchor, n)), b = Math.max(0, Math.max(drag.anchor, n)), lo = Math.min(drag.ti0, ti), hi = Math.max(drag.ti0, ti), ids = [];
		for (var i = Math.max(0, lo); i <= Math.min(S.tracks.length - 1, hi); i++) ids.push(S.tracks[i].id);
		if (drag.ids && drag.ids.length > 1 && lo === hi) ids = drag.ids;
		S.selT = ids; S.sel = b - a > 0 ? { a: a, b: b } : null; draw(); renderHeadsLight();
	}
	function renderHeadsLight() { Array.prototype.forEach.call(heads.children, function (h) { h.classList.toggle("is-sel", S.selT.indexOf(h.getAttribute("data-id")) >= 0); }); }
	cv.addEventListener("pointermove", function (e) {
		if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
		if (pinch && pointers.size === 2) { var ps = Array.from(pointers.values()), d = Math.abs(ps[0].x - ps[1].x) || 1, mx = (ps[0].x + ps[1].x) / 2; S.spp = Math.max(1 / 16, pinch.spp * pinch.d / d); S.start = pinch.start + pinch.x * pinch.spp - mx * S.spp; clampView(); draw(); return; }
		if (!drag) { var ti0 = laneAt(e.offsetY); cv.style.cursor = ti0 >= 0 && clipAt(S.tracks[ti0], nOf(e.offsetX)) && e.offsetY - ti0 * S.laneH < 16 ? "grab" : "text"; return; }
		var n = nOf(e.offsetX), ti = Math.max(0, Math.min(S.tracks.length - 1, laneAt(Math.max(0, e.offsetY))));
		if (drag.kind === "move") {
			var ns = Math.max(0, drag.s0 + n - drag.n0); if (Math.abs(n - drag.n0) > 2 * S.spp) drag.moved = true;
			/* snap to other clips' edges / the cursor within 8 px */
			var best = 8 * S.spp, len = A.clipLen(drag.c);
			S.tracks.forEach(function (tt) { tt.clips.forEach(function (o) { if (o === drag.c) return; [o.start, o.start + A.clipLen(o)].forEach(function (edge) { [edge - ns, edge - (ns + len)].forEach(function (dd, i2) { if (Math.abs(dd) < best) { best = Math.abs(dd); drag.snap = i2 === 0 ? edge : edge - len; } }); }); }); });
			var start = drag.snap != null && Math.abs(drag.snap - ns) <= 8 * S.spp ? drag.snap : ns; drag.snap = null;
			var tsrc = trackById(drag.t.id), moved = { id: drag.c.id, start: start, ch: drag.c.ch };
			var others = tsrc.clips.filter(function (o) { return o.id !== drag.c.id; }); others.push(moved); setTrack(A.withClips(tsrc, others)); drag.c = moved; drag.toTi = ti; draw(); return;
		}
		if (!drag.moved && Math.abs(e.offsetX - drag.x0) < 3) return;
		drag.moved = true; moveSel(n, ti); autoEdgeScroll(e.offsetX);
	});
	function autoEdgeScroll(x) { if (x > W - 20) { S.start += S.spp * 12; draw(); } else if (x < 20 && S.start > 0) { S.start -= S.spp * 12; draw(); } }
	function endPointer(e) {
		pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
		if (!drag) return; var d = drag; drag = null;
		if (d.kind === "move") {
			if (d.toTi != null && d.toTi !== d.ti) { var src = trackById(d.t.id), dst = S.tracks[d.toTi]; setTrack(A.withClips(src, src.clips.filter(function (o) { return o.id !== d.c.id; }))); dst = trackById(dst.id); setTrack(A.withClips(dst, dst.clips.concat([{ id: d.c.id, start: d.c.start, ch: A.conform(d.c.ch, dst.nch) }]))); }
			if (d.moved || d.toTi !== d.ti) commit("Move clip"); else { S.sel = { a: d.c.start, b: d.c.start + A.clipLen(d.c) }; S.selT = [d.t.id]; afterSel(); }
			return;
		}
		if (!d.moved) { setCursor(d.anchor); S.sel = null; S.selT = d.ids; afterSel(); if (playing) playFrom(d.anchor); }
		else afterSel();
	}
	cv.addEventListener("pointerup", endPointer); cv.addEventListener("pointercancel", endPointer);
	cv.addEventListener("dblclick", function (e) { var ti = laneAt(e.offsetY); if (ti < 0) return; var t = S.tracks[ti], c = clipAt(t, nOf(e.offsetX)); if (c) { S.sel = { a: c.start, b: c.start + A.clipLen(c) }; S.selT = [t.id]; afterSel(); } });
	function onWheel(e) {
		if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0025), e.offsetX); return; }
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { e.preventDefault(); S.start += (e.shiftKey ? e.deltaY : e.deltaX) * S.spp; draw(); }
	}
	cv.addEventListener("wheel", onWheel, { passive: false }); ruler.addEventListener("wheel", onWheel, { passive: false });
	/* ruler: click = seek, drag = select on all tracks */
	var rdrag = null;
	ruler.addEventListener("pointerdown", function (e) { actx(); ruler.setPointerCapture(e.pointerId); rdrag = { a: nOf(e.offsetX), x0: e.offsetX, moved: false }; });
	ruler.addEventListener("pointermove", function (e) { if (!rdrag) return; if (Math.abs(e.offsetX - rdrag.x0) > 3) rdrag.moved = true; if (!rdrag.moved) return; var n = nOf(e.offsetX), a = Math.max(0, Math.min(rdrag.a, n)), b = Math.max(rdrag.a, n); S.sel = b > a ? { a: a, b: b } : null; S.selT = S.tracks.map(function (t) { return t.id; }); draw(); });
	ruler.addEventListener("pointerup", function (e) { if (!rdrag) return; var d = rdrag; rdrag = null; if (!d.moved) { var n = Math.max(0, nOf(e.offsetX)), mk = S.markers.filter(function (m) { return Math.abs(xOf(m.t) - e.offsetX) < 6; })[0]; setCursor(mk ? mk.t : n); if (playing) playFrom(S.cursor); } afterSel(); });
	$("au-hs").addEventListener("input", function () { var tot = Math.max(projEnd(), S.sr * 10), vis = W * S.spp; S.start = (+this.value / 1000) * Math.max(0, tot - vis * 0.5); draw(); });
	function setCursor(n) { S.cursor = Math.max(0, Math.round(n)); draw(); }
	function parseSelInputs() {
		var a = A.parseTime($("au-sa").value), b = A.parseTime($("au-sb").value);
		if (isFinite(a) && isFinite(b) && b > a) { S.sel = { a: Math.round(a * S.sr), b: Math.round(b * S.sr) }; if (!S.selT.length) S.selT = S.tracks.map(function (t) { return t.id; }); draw(); }
		else { toast("Type times like 1:02.5 or 75"); syncUi(); }
	}
	$("au-sa").addEventListener("change", parseSelInputs); $("au-sb").addEventListener("change", parseSelInputs);

	/* ---------------- playback ---------------- */
	var playing = false, loop = !!store("loop"), sources = [], tnodes = {}, playT0 = 0, playN0 = 0, playEnd = 0, playRaf = 0, abufCache = new WeakMap();
	function abufOf(c) { var b = abufCache.get(c.ch[0]); if (!b) { b = ctx.createBuffer(c.ch.length, A.clipLen(c), S.sr); c.ch.forEach(function (d, k) { b.copyToChannel ? b.copyToChannel(d, k) : b.getChannelData(k).set(d); }); abufCache.set(c.ch[0], b); } return b; }
	function playPos() { return playing ? playN0 + (ctx.currentTime - playT0) * S.sr : S.cursor; }
	function liveMix() {
		if (!playing) return; var anySolo = S.tracks.some(function (t) { return t.solo; });
		S.tracks.forEach(function (t) { var n = tnodes[t.id]; if (!n) return; var on = !t.mute && (!anySolo || t.solo); n.g.gain.setTargetAtTime(on ? A.dbToGain(t.gain) : 0, ctx.currentTime, 0.015); if (n.p) n.p.pan.setTargetAtTime(t.pan, ctx.currentTime, 0.015); });
	}
	function stopSources() { sources.forEach(function (s) { try { s.stop(); } catch (e) {} }); sources = []; Object.keys(tnodes).forEach(function (k) { try { tnodes[k].g.disconnect(); } catch (e) {} }); tnodes = {}; }
	function playFrom(n, end) {
		actx(); stopPreview(); stopSources(); if (!S.tracks.length) return;
		var from = Math.max(0, Math.round(n)), stop = end != null ? end : projEnd(); if (from >= stop) from = 0;
		var t0 = ctx.currentTime + 0.04, anySolo = S.tracks.some(function (t) { return t.solo; });
		S.tracks.forEach(function (t) {
			var g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, on = !t.mute && (!anySolo || t.solo);
			g.gain.value = on ? A.dbToGain(t.gain) : 0; if (p) { p.pan.value = t.pan; g.connect(p); p.connect(master); } else g.connect(master);
			tnodes[t.id] = { g: g, p: p };
			t.clips.forEach(function (c) {
				var cs = c.start, ce = cs + A.clipLen(c); if (ce <= from || cs >= stop) return;
				var s = ctx.createBufferSource(); s.buffer = abufOf(c); s.connect(g);
				var when = t0 + Math.max(0, cs - from) / S.sr, off = Math.max(0, from - cs) / S.sr, dur = (Math.min(ce, stop) - Math.max(cs, from)) / S.sr;
				s.start(when, off, dur); sources.push(s);
			});
		});
		playing = true; playT0 = t0; playN0 = from; playEnd = stop; $("au-play").textContent = "⏸"; $("au-play").setAttribute("aria-label", "Pause");
		cancelAnimationFrame(playRaf); playRaf = requestAnimationFrame(playLoop);
	}
	function playLoop() {
		if (!playing) return; var p = playPos();
		if (p >= playEnd) { if (loop && S.sel) { playFrom(S.sel.a, S.sel.b); return; } stopPlay(true); return; }
		var x = xOf(p); if (x > W - 10 || x < 0) { S.start = p - W * S.spp * 0.05; draw(); }
		drawOver(); meter(); playRaf = requestAnimationFrame(playLoop);
	}
	function stopPlay(keepCursor) { if (!playing) return; var p = playPos(); playing = false; stopSources(); cancelAnimationFrame(playRaf); $("au-play").textContent = "▶"; $("au-play").setAttribute("aria-label", "Play"); if (keepCursor === "here") S.cursor = Math.round(p); drawOver(); meterClear(); }
	function togglePlay() {
		if (preview && preview.playing) { stopPreview(); return; }
		if (playing) { stopPlay("here"); return; }
		if (S.sel && S.sel.b - S.sel.a > 0 && (S.cursor <= S.sel.a || S.cursor >= S.sel.b)) playFrom(S.sel.a, S.sel.b); else playFrom(S.cursor, S.sel && S.cursor < S.sel.b ? S.sel.b : null);
	}
	function stopAll() { stopPlay(); stopPreview(); }
	var mBuf = null;
	function meter() {
		var c = $("au-meter"), g = c.getContext("2d"); if (!analyser) return; mBuf = mBuf || new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(mBuf);
		var pk = 0; for (var i = 0; i < mBuf.length; i++) { var v = Math.abs(mBuf[i]); if (v > pk) pk = v; }
		var db = pk > 0 ? 20 * Math.log10(pk) : -90, f = Math.max(0, Math.min(1, (db + 60) / 60));
		g.fillStyle = "#0b0d11"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = db > -1 ? "#ef4444" : db > -9 ? "#fbbf24" : "#4ade80"; g.fillRect(0, 2, f * c.width, c.height - 4);
	}
	function meterClear() { var c = $("au-meter"), g = c.getContext("2d"); g.fillStyle = "#0b0d11"; g.fillRect(0, 0, c.width, c.height); }

	/* ---------------- edit commands ---------------- */
	function targets() { var ids = S.selT.length ? S.selT : S.tracks.map(function (t) { return t.id; }); return S.tracks.filter(function (t) { return ids.indexOf(t.id) >= 0; }); }
	function needSel() { if (!S.sel) { toast("Select some audio first: drag across a track"); return false; } return true; }
	function doCopy() { if (!needSel()) return false; clipboard = targets().map(function (t) { return A.copyRange(t, S.sel.a, S.sel.b); }); toast("Copied " + fmt(S.sel.b - S.sel.a, 2)); return true; }
	function doDelete(label) { if (!needSel()) return; stopAll(); var a = S.sel.a, b = S.sel.b; targets().forEach(function (t) { setTrack(A.deleteRange(t, a, b, true)); }); S.sel = null; S.cursor = a; commit(label || "Delete"); }
	function doCut() { if (doCopy()) doDelete("Cut"); }
	function doPaste() {
		if (!clipboard) { toast("Nothing copied yet"); return; } stopAll();
		var at = S.sel ? S.sel.a : S.cursor, tt = targets();
		if (S.sel) { var a = S.sel.a, b = S.sel.b; tt.forEach(function (t) { setTrack(A.deleteRange(t, a, b, true)); }); tt = targets(); }
		if (!tt.length) { clipboard.forEach(function (blk, i) { var t = A.track({ name: "Pasted " + (i + 1), nch: blk.nch }); S.tracks.push(A.insert(t, at, blk)); }); }
		else tt.forEach(function (t, i) { setTrack(A.insert(t, at, clipboard[Math.min(i, clipboard.length - 1)])); });
		var len = clipboard[0].len; S.sel = { a: at, b: at + len }; S.selT = (tt.length ? tt : S.tracks.slice(-clipboard.length)).map(function (t) { return t.id; }); commit("Paste");
	}
	function doSplit() { stopAll(); var at = S.sel ? [S.sel.a, S.sel.b] : [S.cursor], n = 0; targets().forEach(function (t) { var o = t; at.forEach(function (p) { o = A.split(o, p); }); if (o.clips.length !== t.clips.length) n++; setTrack(o); }); if (n) commit("Split"); else toast("Put the cursor inside a clip to split it"); }
	function doTrim() { if (!needSel()) return; stopAll(); var a = S.sel.a, b = S.sel.b; targets().forEach(function (t) { setTrack(A.trim(t, a, b)); }); commit("Trim"); }
	function doSilence() { if (!needSel()) return; stopAll(); var a = S.sel.a, b = S.sel.b; targets().forEach(function (t) { setTrack(A.mapRange(t, a, b, A.silence)); }); commit("Silence"); }
	function doInsertSilence() {
		var s = prompt("Insert how much silence at the cursor? (seconds, or like 1:30)", "2"); if (s == null) return; var d = A.parseTime(s); if (!(d > 0)) return toast("Type a duration like 2 or 0:05");
		stopAll(); var n = Math.round(d * S.sr), at = S.sel ? S.sel.a : S.cursor; targets().forEach(function (t) { setTrack(A.insert(t, at, { len: n, nch: t.nch, clips: [{ start: 0, ch: A.zeros(t.nch, n) }] })); }); commit("Insert silence");
	}
	function doDuplicate() { if (!needSel()) return; var a = S.sel.a; targets().forEach(function (t) { var blk = A.copyRange(t, S.sel.a, S.sel.b); var nt = A.track({ name: t.name + " (copy)", nch: t.nch }); S.tracks.push(A.insert(nt, a, blk)); }); commit("Duplicate to new track"); }
	function selectAll() { S.sel = { a: 0, b: projEnd() }; S.selT = S.tracks.map(function (t) { return t.id; }); if (S.sel.b <= 0) S.sel = null; afterSel(); }
	function addTrack() { S.tracks.push(A.track({ name: "Track " + (S.tracks.length + 1), nch: 1 })); commit("Add track"); }
	function addMarker() { var t = playing ? Math.round(playPos()) : S.cursor; S.markers.push({ id: A.uid("m"), t: t, name: "Marker " + (S.markers.length + 1) }); S.markers.sort(function (a, b) { return a.t - b.t; }); commit("Add marker"); toast("Marker at " + fmt(t, 2)); if (panel === "markers") openMarkers(); }
	function jumpMarker(dir) { var p = playing ? playPos() : S.cursor, list = S.markers.map(function (m) { return m.t; }).concat([0, projEnd()]).sort(function (a, b) { return a - b; }), t = dir > 0 ? list.filter(function (x) { return x > p + 1; })[0] : list.filter(function (x) { return x < p - S.sr * 0.05; }).pop(); if (t == null) return; setCursor(t); if (playing) playFrom(t); }

	/* ---------------- effects ---------------- */
	var FX_LS = store("fx") || {};
	var EQ_KEYS = Object.keys(A.EQ_PRESETS);
	var EFFECTS = [
		{ id: "noise", name: "Noise removal (AI)", icon: "✨", keys: "denoise background hiss fan hum deepfilternet rnnoise clean voice", desc: "Remove fans, hiss, traffic, room noise",
			params: [
				{ k: "model", type: "select", label: "Method", def: "deepfilter", opts: [["deepfilter", "DeepFilterNet 3 (AI, best for speech)"], ["rnnoise", "RNNoise (AI, faster, gentler)"], ["spectral", "Spectral gate (classic, uses a noise sample)"]] },
				{ k: "strength", type: "range", label: "Strength", def: 100, min: 0, max: 100, step: 1, unit: "%", cheap: true },
				{ k: "hum", type: "select", label: "Mains hum (after the noise removal)", def: "0", cheap: true, opts: [["0", "Leave"], ["auto", "Remove (detect 50 / 60 Hz)"], ["50", "Remove 50 Hz"], ["60", "Remove 60 Hz"]] }
			],
			note: function (v) { return v.model === "spectral" ? (noiseProfile ? "Noise sample: <b>" + fmt(noiseProfile[0].length, 1) + "</b> learned." : "Select a few seconds of <b>noise only</b> (no voice) and press Learn; otherwise the quietest moments are used.") + ' <button type="button" class="au-btn au-btn--sm" data-act="learn">Learn noise from selection</button>' : (v.model === "deepfilter" ? "Runs on this device. First use downloads the 8.6 MB model (kept by the browser). Speech models can remove music too: preview first." : "Runs on this device (4.8 MB download the first time)."); },
			run: function (buf, v, ctl) { return denoiseRun(buf, v, ctl); } },
		{ id: "enhance", name: "Enhance speech (one click)", icon: "🎙️", keys: "podcast voice clean chain improve auto", desc: "Noise removal + low cut + voice EQ + compressor + loudness",
			params: [{ k: "denoise", type: "check", label: "AI noise removal", def: true }, { k: "lowcut", type: "check", label: "Low cut (80 Hz)", def: true }, { k: "eq", type: "check", label: "Voice clarity EQ", def: true }, { k: "comp", type: "check", label: "Gentle compressor", def: true }, { k: "lufs", type: "select", label: "Loudness", def: "-16", opts: [["-14", "−14 LUFS (YouTube, Spotify)"], ["-16", "−16 LUFS (podcasts)"], ["-19", "−19 LUFS (quieter)"], ["none", "Leave"]] }],
			run: function (buf, v, ctl) {
				var p = v.denoise ? denoiseRun(buf, { model: "deepfilter", strength: 90, hum: "auto" }, ctl) : Promise.resolve(buf);
				return p.then(function (x) {
					if (v.lowcut) x = A.eq(x, S.sr, A.EQ_PRESETS.lowcut.bands); if (v.eq) x = A.eq(x, S.sr, A.EQ_PRESETS.voice.bands.slice(1));
					if (v.comp) x = A.compress(x, S.sr, { threshold: -24, ratio: 3, knee: 8, attack: 8, release: 150, makeup: 0 });
					if (v.lufs !== "none") x = A.loudnessNormalize(x, S.sr, +v.lufs, -1).ch; return x;
				});
			}, whole: true },
		{ id: "loud", name: "Normalize / loudness", icon: "📏", keys: "lufs loudness normalize normalise volume youtube podcast peak true peak ebu r128", desc: "Set LUFS loudness or peak level",
			params: [{ k: "mode", type: "select", label: "Mode", def: "lufs", opts: [["lufs", "Loudness (LUFS)"], ["peak", "Peak"]] }, { k: "lufs", type: "select", label: "Target", def: "-16", show: { mode: "lufs" }, opts: [["-14", "−14 LUFS (YouTube, Spotify)"], ["-16", "−16 LUFS (podcasts, Apple)"], ["-19", "−19 LUFS (mono podcast)"], ["-23", "−23 LUFS (EBU R128 broadcast)"], ["-24", "−24 LUFS (US TV, ATSC)"]] }, { k: "tp", type: "select", label: "True-peak ceiling", def: "-1", show: { mode: "lufs" }, opts: [["-1", "−1 dBTP"], ["-2", "−2 dBTP"], ["-0.1", "−0.1 dBTP"]] }, { k: "peak", type: "range", label: "Peak level", def: -1, min: -12, max: 0, step: 0.1, unit: " dBFS", show: { mode: "peak" } }],
			analyse: true, whole: true,
			run: function (buf, v) { if (v.mode === "peak") return A.gain(buf, A.normalizePeakGain(buf, v.peak)); return A.loudnessNormalize(buf, S.sr, +v.lufs, +v.tp).ch; } },
		{ id: "gain", name: "Amplify / gain", icon: "🔊", keys: "volume louder quieter amplify gain", desc: "Make it louder or quieter", params: [{ k: "db", type: "range", label: "Gain", def: 3, min: -24, max: 24, step: 0.5, unit: " dB" }], run: function (buf, v) { return A.gain(buf, v.db); } },
		{ id: "fadein", name: "Fade in", icon: "◢", keys: "fade in", desc: "Over the selection", params: [{ k: "curve", type: "select", label: "Curve", def: "equal", opts: [["linear", "Linear"], ["equal", "Equal power"], ["exp", "Logarithmic (slow start)"], ["s", "S-curve"]] }], run: function (buf, v) { return A.fade(buf, "in", v.curve); }, needSel: true },
		{ id: "fadeout", name: "Fade out", icon: "◣", keys: "fade out", desc: "Over the selection", params: [{ k: "curve", type: "select", label: "Curve", def: "equal", opts: [["linear", "Linear"], ["equal", "Equal power"], ["exp", "Logarithmic"], ["s", "S-curve"]] }], run: function (buf, v) { return A.fade(buf, "out", v.curve); }, needSel: true },
		{ id: "comp", name: "Compressor", icon: "🗜️", keys: "compressor dynamics even out level", desc: "Even out loud and quiet parts",
			params: [{ k: "preset", type: "select", label: "Preset", def: "voice", opts: [["voice", "Gentle voice (3:1)"], ["podcast", "Podcast (4:1)"], ["heavy", "Heavy (8:1)"], ["custom", "Custom"]], presets: { voice: { threshold: -24, ratio: 3, attack: 8, release: 150 }, podcast: { threshold: -20, ratio: 4, attack: 5, release: 120 }, heavy: { threshold: -28, ratio: 8, attack: 3, release: 80 } } },
				{ k: "threshold", type: "range", label: "Threshold", def: -24, min: -60, max: 0, step: 1, unit: " dB" }, { k: "ratio", type: "range", label: "Ratio", def: 3, min: 1, max: 20, step: 0.5, unit: ":1" }, { k: "attack", type: "range", label: "Attack", def: 8, min: 0.5, max: 100, step: 0.5, unit: " ms" }, { k: "release", type: "range", label: "Release", def: 150, min: 10, max: 1000, step: 10, unit: " ms" }, { k: "makeup", type: "range", label: "Make-up gain", def: 0, min: 0, max: 24, step: 0.5, unit: " dB" }],
			run: function (buf, v) { return A.compress(buf, S.sr, { threshold: v.threshold, ratio: v.ratio, knee: 6, attack: v.attack, release: v.release, makeup: v.makeup }); } },
		{ id: "limit", name: "Limiter", icon: "⛔", keys: "limiter peak ceiling clip", desc: "Nothing goes above the ceiling", params: [{ k: "ceil", type: "range", label: "Ceiling", def: -1, min: -12, max: 0, step: 0.1, unit: " dBFS" }, { k: "release", type: "range", label: "Release", def: 80, min: 10, max: 500, step: 10, unit: " ms" }], run: function (buf, v) { return A.limiter(buf, S.sr, v.ceil, v.release, 5); } },
		{ id: "eq", name: "EQ", icon: "🎚️", keys: "equalizer eq voice clarity low cut high pass bass treble muddy telephone", desc: "Voice clarity, low cut, presets",
			params: [{ k: "preset", type: "select", label: "Preset", def: "voice", opts: EQ_KEYS.map(function (k) { return [k, A.EQ_PRESETS[k].name]; }) }], curve: true,
			run: function (buf, v) { return A.eq(buf, S.sr, A.EQ_PRESETS[v.preset].bands); } },
		{ id: "hum", name: "Hum removal", icon: "〰️", keys: "hum buzz mains 50 60 hz notch ground loop", desc: "50 / 60 Hz mains hum and harmonics", params: [{ k: "base", type: "select", label: "Hum", def: "auto", opts: [["auto", "Detect 50 or 60 Hz"], ["50", "50 Hz (Europe, Asia, Africa)"], ["60", "60 Hz (Americas)"]] }, { k: "harm", type: "range", label: "Harmonics", def: 8, min: 1, max: 20, step: 1, unit: "" }],
			run: function (buf, v) { if (!D) return buf; var base = v.base === "auto" ? D.detectHum(buf, S.sr).base : +v.base; if (!base) { toast("No mains hum found"); return buf; } return D.humRemove(buf, S.sr, { base: base, harmonics: v.harm }); } },
		{ id: "declick", name: "De-click", icon: "✂", keys: "click pop crackle declick vinyl mouth", desc: "Repair short clicks and pops", params: [{ k: "sens", type: "range", label: "Sensitivity", def: 50, min: 0, max: 100, step: 1, unit: "%" }], run: function (buf, v) { var o = A.declick(buf, S.sr, v.sens / 100); toast(o.fixed + " click" + (o.fixed === 1 ? "" : "s") + " repaired"); return o.slice(); } },
		{ id: "reverse", name: "Reverse", icon: "⇆", keys: "reverse backwards", desc: "Play it backwards", params: [], run: function (buf) { return A.reverse(buf); } }
	];
	function fxById(id) { for (var i = 0; i < EFFECTS.length; i++) if (EFFECTS[i].id === id) return EFFECTS[i]; return null; }
	var noiseProfile = null, wetCache = null;
	function denoiseRun(buf, v, ctl) {
		if (!DN) return Promise.reject(new Error("Noise removal did not load"));
		var hum = v.hum && v.hum !== "0" ? v.hum : 0, s = (v.strength == null ? 100 : v.strength) / 100;
		function deHum(x) { return hum ? D.humRemove(x, S.sr, { base: hum === "auto" ? "auto" : +hum }) : x; }
		if (v.model === "spectral") return DN.process(buf, S.sr, { model: "spectral", strength: s, noise: noiseProfile, onProgress: ctl && ctl.prog, signal: ctl && ctl.signal }).then(deHum);
		var key = v.model + "|" + (ctl && ctl.key);
		if (ctl && ctl.key && wetCache && wetCache.key === key) return Promise.resolve(deHum(buf.map(function (c, k) { return D.mix(wetCache.wet[k], c, s); })));
		return DN.process(buf, S.sr, { model: v.model === "rnnoise" ? "rnnoise" : "auto", strength: 1, onProgress: ctl && ctl.prog, signal: ctl && ctl.signal }).then(function (wet) {
			if (DN.used && DN.used !== v.model && v.model === "deepfilter") toast("DeepFilterNet could not run here (" + (DN.fallbackReason || "error") + "), used " + DN.used);
			if (ctl && ctl.key) wetCache = { key: key, wet: wet };
			return deHum(buf.map(function (c, k) { return D.mix(wet[k], c, s); }));
		});
	}

	/* effect panel */
	var panel = null, curFx = null, vals = {};
	function openPanel(title, body) { $("au-side").hidden = false; $("au-ptitle").textContent = title; var pb = $("au-pbody"); pb.innerHTML = ""; if (typeof body === "string") pb.innerHTML = body; else pb.appendChild(body); draw(); return pb; }
	function closePanel() { stopPreview(); $("au-side").hidden = true; panel = null; curFx = null; draw(); }
	$("au-pclose").onclick = closePanel;
	function rangeText() {
		var tt = targets(); if (!tt.length) return "Nothing to apply to yet";
		var r = S.sel ? fmt(S.sel.a, 2) + " – " + fmt(S.sel.b, 2) + " (" + fmt(S.sel.b - S.sel.a, 2) + ")" : "the whole project (" + fmt(projEnd(), 1) + ")";
		return "Applies to <b>" + r + "</b> on " + (tt.length === S.tracks.length && S.tracks.length > 1 ? "all tracks" : tt.map(function (t) { return esc(t.name); }).join(", "));
	}
	function openFx(id) {
		var fx = fxById(id); if (!fx) return; panel = "fx"; curFx = fx; vals = Object.assign({}, defaultsOf(fx), FX_LS[id] || {});
		var box = el("div", { class: "au-pb" }); box.style.padding = "0";
		var tg = el("div", { class: "au-target" }, rangeText()); box.appendChild(tg);
		var form = el("div", { class: "au-pb" }); form.style.padding = "0"; box.appendChild(form);
		function build() {
			form.innerHTML = "";
			fx.params.forEach(function (p) {
				if (p.show) { var okShow = Object.keys(p.show).every(function (k) { return vals[k] === p.show[k]; }); if (!okShow) return; }
				var f;
				if (p.type === "check") { f = el("label", { class: "au-chk" }, '<input type="checkbox"><span>' + esc(p.label) + "</span>"); var cb = f.querySelector("input"); cb.checked = !!vals[p.k]; cb.onchange = function () { vals[p.k] = cb.checked; changed(p); }; }
				else if (p.type === "select") { f = el("label", { class: "au-f" }, "<span>" + esc(p.label) + "</span><select></select>"); var se = f.querySelector("select"); p.opts.forEach(function (o) { se.appendChild(el("option", { value: o[0] }, esc(o[1]))); }); se.value = vals[p.k]; se.onchange = function () { vals[p.k] = se.value; if (p.presets && p.presets[se.value]) Object.assign(vals, p.presets[se.value]); changed(p, true); }; }
				else { f = el("label", { class: "au-f" }, "<span>" + esc(p.label) + " <b></b></span><input type=range>"); var r = f.querySelector("input"), bv = f.querySelector("b"); r.min = p.min; r.max = p.max; r.step = p.step; r.value = vals[p.k]; bv.textContent = vals[p.k] + p.unit; r.oninput = function () { vals[p.k] = +r.value; bv.textContent = r.value + p.unit; if (fx.id === "comp" && p.k !== "preset") vals.preset = "custom"; changed(p); }; }
				form.appendChild(f);
			});
			if (fx.curve) { var cvs = el("canvas", { class: "au-eqcv", width: 600, height: 220, "aria-label": "EQ curve" }); form.appendChild(cvs); drawEq(cvs); }
			if (fx.note) { var nt = el("div", { class: "au-note" }, fx.note(vals)); form.appendChild(nt); var lb = nt.querySelector("[data-act=learn]"); if (lb) lb.onclick = learnNoise; }
		}
		function changed(p, rebuild) { FX_LS[fx.id] = vals; store("fx", FX_LS); if (rebuild || p.type === "select") build(); if (preview) previewParams(p && p.cheap); }
		build();
		if (fx.analyse) { var an = el("div", { class: "au-stats" }); an.id = "au-anal"; box.appendChild(el("div", { class: "au-row" }, '<button type="button" class="au-btn au-btn--sm" id="au-measure">Measure loudness</button>')); box.appendChild(an); }
		if (!fx.noPreview) {
			box.appendChild(el("div", { class: "au-row" }, '<button type="button" class="au-btn" id="au-pv">▶ Preview</button><span class="au-note" id="au-pvn">Plays up to 30 s</span>'));
			var ab = el("div", { class: "au-ab", role: "group", "aria-label": "Compare" }, '<button type="button" id="au-pa" aria-pressed="false" title="Original (B toggles)">A · Original</button><button type="button" id="au-pb2" aria-pressed="true" title="Processed (B toggles)">B · Processed</button>');
			box.appendChild(ab);
		}
		box.appendChild(el("div", { class: "au-row" }, '<button type="button" class="au-btn au-btn--primary" id="au-apply">Apply</button><button type="button" class="au-btn" id="au-cancel">Close</button>'));
		openPanel(fx.icon + " " + fx.name, box);
		$("au-apply").onclick = function () { applyFx(fx, Object.assign({}, vals)); };
		$("au-cancel").onclick = closePanel;
		if ($("au-pv")) { $("au-pv").onclick = function () { if (preview && preview.playing) stopPreview(); else startPreview(); }; $("au-pa").onclick = function () { setAB("A"); }; $("au-pb2").onclick = function () { setAB("B"); }; }
		if ($("au-measure")) $("au-measure").onclick = measure;
		wetCache = null;
	}
	function defaultsOf(fx) { var o = {}; fx.params.forEach(function (p) { o[p.k] = p.def; }); return o; }
	function drawEq(c) {
		var g = c.getContext("2d"), w = c.width, h = c.height, bands = A.EQ_PRESETS[vals.preset].bands; g.fillStyle = "#14161b"; g.fillRect(0, 0, w, h);
		g.strokeStyle = "#333948"; g.fillStyle = "#a3aab8"; g.font = "18px system-ui"; [-12, -6, 0, 6, 12].forEach(function (db) { var y = h / 2 - db * h / 30; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.fillText(db + " dB", 4, y - 3); });
		[100, 1000, 10000].forEach(function (f) { var x = Math.log(f / 20) / Math.log(1000) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.fillText(f >= 1000 ? f / 1000 + "k" : f, x + 3, h - 6); });
		g.strokeStyle = "#38bdf8"; g.lineWidth = 3; g.beginPath(); for (var x = 0; x <= w; x += 2) { var f = 20 * Math.pow(1000, x / w), db = A.eqResponse(bands, S.sr, f), y = h / 2 - Math.max(-15, Math.min(15, db)) * h / 30; if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.lineWidth = 1;
	}
	function learnNoise() {
		if (!S.sel) return toast("Select a few seconds where there is only noise, then press Learn");
		var t = targets()[0]; noiseProfile = A.renderTrack(t, S.sel.a, S.sel.b); toast("Learned " + fmt(S.sel.b - S.sel.a, 1) + " of noise. Now select what to clean (or nothing = everything) and Apply."); if (curFx) openFx(curFx.id);
	}
	function measure() {
		var tt = targets(); if (!tt.length) return; var a = S.sel ? S.sel.a : 0, b = S.sel ? S.sel.b : projEnd(), mix = A.mix(tt, a, b, tt.some(function (t) { return t.nch === 2 || t.pan; }) ? 2 : 1);
		var m = A.loudness(mix, S.sr), tp = A.truePeak(mix), f = function (x, u) { return isFinite(x) ? x.toFixed(1) + u : "–"; };
		$("au-anal").innerHTML = "<span>Integrated</span><span>" + f(m.integrated, " LUFS") + "</span><span>Loudness range</span><span>" + f(m.range, " LU") + "</span><span>Max short-term</span><span>" + f(m.shortTermMax, " LUFS") + "</span><span>True peak</span><span>" + f(tp, " dBTP") + "</span><span>Sample peak</span><span>" + f(A.gainToDb(A.peak(mix)), " dBFS") + "</span>";
	}
	/* apply: per target track, render [a, b), process, write back */
	function applyFx(fx, v, quiet) {
		var tt = targets(); if (!tt.length) return toast("Open some audio first");
		if (fx.needSel && !S.sel) return toast("Select the part to " + fx.name.toLowerCase() + " first");
		stopAll(); var a = S.sel ? S.sel.a : 0, b = S.sel ? S.sel.b : projEnd(); if (b <= a) return;
		var bz = busy(fx.name), i = 0, out = [];
		function next() {
			if (i >= tt.length) { bz.done(); out.forEach(function (t) { setTrack(t); }); commit(fx.name); if (!quiet) toast(fx.name + " applied", { label: "Undo", fn: undo }); return; }
			var t = trackById(tt[i].id), buf = A.renderTrack(t, a, b), base = i / tt.length;
			bz.set(base, "Processing " + t.name);
			return tick().then(function () { return fx.run(buf, v, { prog: function (f, m) { bz.set(base + f / tt.length, m || "Processing " + t.name); }, signal: bz.signal }); }).then(function (res) {
				if (bz.signal.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
				out.push(A.writeRange(t, a, b, res)); i++; return tick().then(next);
			});
		}
		Promise.resolve().then(next).catch(function (e) { bz.done(); toast(e.name === "AbortError" ? "Cancelled: nothing changed" : "Could not apply: " + (e.message || e)); });
	}

	/* A/B preview: mixdown of up to 30 s, original vs processed, both playing in sync */
	var preview = null;
	function previewRange() { var a = S.sel ? S.sel.a : (playing ? Math.round(playPos()) : S.cursor), b = S.sel ? S.sel.b : projEnd(); if (b - a < S.sr * 0.5) { a = 0; b = projEnd(); } return { a: a, b: Math.min(b, a + S.sr * 30) }; }
	function startPreview() {
		var fx = curFx; if (!fx) return; var tt = targets(); if (!tt.length) return; stopPlay(); actx();
		var r = previewRange(), ids = tt.map(function (t) { return t.id; }), bz = busy("Preparing the preview"), proc = {}, i = 0;
		var nOut = S.tracks.some(function (t) { return t.nch === 2 || t.pan; }) ? 2 : 1;
		function next() {
			if (i >= tt.length) {
				bz.done(); var orig = A.mix(S.tracks, r.a, r.b, nOut), procTracks = S.tracks.map(function (t) { return proc[t.id] ? proc[t.id] : t; });
				preview = { a: r.a, b: r.b, ids: ids, raw: proc.__raw, fx: fx, which: (preview && preview.which) || "B" };
				preview.orig = toAbuf(orig); preview.proc = toAbuf(A.mix(procTracks, r.a, r.b, nOut)); playPreview(0); return;
			}
			var t = tt[i], buf = A.renderTrack(t, r.a, r.b);
			return Promise.resolve(fx.run(buf, Object.assign({}, vals), { prog: function (f, m) { bz.set((i + f) / tt.length, m); }, signal: bz.signal, key: "pv" + t.id + r.a + "-" + r.b })).then(function (res) { proc[t.id] = A.writeRange(t, r.a, r.b, res); i++; return tick().then(next); });
		}
		wetCache = wetCache && wetCache.key.indexOf("pv" + tt[0].id + r.a + "-" + r.b) >= 0 ? wetCache : wetCache;
		Promise.resolve().then(next).catch(function (e) { bz.done(); toast(e.name === "AbortError" ? "Preview cancelled" : "Preview failed: " + (e.message || e)); });
	}
	function toAbuf(ch) { var b = ctx.createBuffer(ch.length, Math.max(1, ch[0].length), S.sr); ch.forEach(function (d, k) { b.getChannelData(k).set(d); }); return b; }
	function playPreview(offset) {
		stopPreviewSources(); var t0 = ctx.currentTime + 0.05;
		preview.ga = ctx.createGain(); preview.gb = ctx.createGain(); preview.ga.connect(master); preview.gb.connect(master);
		preview.ga.gain.value = preview.which === "A" ? 1 : 0; preview.gb.gain.value = preview.which === "B" ? 1 : 0;
		preview.sa = ctx.createBufferSource(); preview.sa.buffer = preview.orig; preview.sa.loop = true; preview.sa.connect(preview.ga);
		preview.sb = ctx.createBufferSource(); preview.sb.buffer = preview.proc; preview.sb.loop = true; preview.sb.connect(preview.gb);
		preview.sa.start(t0, offset || 0); preview.sb.start(t0, offset || 0); preview.t0 = t0 - (offset || 0); preview.playing = true;
		if ($("au-pv")) $("au-pv").textContent = "⏹ Stop preview"; syncAB(); cancelAnimationFrame(playRaf); playRaf = requestAnimationFrame(pvLoop);
	}
	function pvLoop() { if (!preview || !preview.playing) return; var dur = preview.orig.duration, p = preview.a + (((ctx.currentTime - preview.t0) % dur + dur) % dur) * S.sr; var x = xOf(p), g = over.getContext("2d"), h = over.height / dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, h); g.fillStyle = preview.which === "A" ? "#e7e9ee" : "#a78bfa"; g.fillRect(Math.round(x), 0, 2, h); $("au-time").textContent = fmt(p) + " " + preview.which; meter(); playRaf = requestAnimationFrame(pvLoop); }
	function stopPreviewSources() { if (!preview) return; ["sa", "sb"].forEach(function (k) { if (preview[k]) try { preview[k].stop(); } catch (e) {} }); ["ga", "gb"].forEach(function (k) { if (preview[k]) try { preview[k].disconnect(); } catch (e) {} }); }
	function stopPreview() { if (!preview) return; stopPreviewSources(); preview.playing = false; cancelAnimationFrame(playRaf); if ($("au-pv")) $("au-pv").textContent = "▶ Preview"; drawOver(); meterClear(); }
	function setAB(w) { if (!preview) { if ($("au-pa")) { $("au-pa").setAttribute("aria-pressed", w === "A"); $("au-pb2").setAttribute("aria-pressed", w === "B"); } preview = null; return; } preview.which = w; if (preview.playing) { var t = ctx.currentTime; preview.ga.gain.setTargetAtTime(w === "A" ? 1 : 0, t, 0.012); preview.gb.gain.setTargetAtTime(w === "B" ? 1 : 0, t, 0.012); } syncAB(); }
	function syncAB() { if ($("au-pa") && preview) { $("au-pa").setAttribute("aria-pressed", preview.which === "A"); $("au-pb2").setAttribute("aria-pressed", preview.which === "B"); } }
	var pvT = null;
	function previewParams(cheap) {
		if (!preview || !preview.playing) return; clearTimeout(pvT);
		pvT = setTimeout(function () {
			var off = ((ctx.currentTime - preview.t0) % preview.orig.duration + preview.orig.duration) % preview.orig.duration, r = { a: preview.a, b: preview.b }, nOut = preview.orig.numberOfChannels, tt = targets(), proc = {}, i = 0;
			var bz = cheap ? null : busy("Updating the preview");
			function next() {
				if (i >= tt.length) { if (bz) bz.done(); preview.proc = toAbuf(A.mix(S.tracks.map(function (t) { return proc[t.id] || t; }), r.a, r.b, nOut)); playPreview(off); return; }
				var t = tt[i], buf = A.renderTrack(t, r.a, r.b);
				return Promise.resolve(curFx.run(buf, Object.assign({}, vals), { key: "pv" + t.id + r.a + "-" + r.b, prog: function (f, m) { if (bz) bz.set(f, m); }, signal: bz ? bz.signal : null })).then(function (res) { proc[t.id] = A.writeRange(t, r.a, r.b, res); i++; return next(); });
			}
			Promise.resolve().then(next).catch(function (e) { if (bz) bz.done(); toast("Preview failed: " + e.message); });
		}, cheap ? 60 : 350);
	}

	/* effects list (searchable) */
	function openFxList() {
		panel = "fxlist"; var box = el("div", { class: "au-pb" }); box.style.padding = "0";
		box.innerHTML = '<input type="search" placeholder="Filter effects…" aria-label="Filter effects" id="au-fxq"><div class="au-fxlist" id="au-fxl"></div>';
		openPanel("Effects", box); var q = $("au-fxq"), l = $("au-fxl");
		function list() { l.innerHTML = ""; A.match(EFFECTS, q.value).forEach(function (fx) { var b = el("button", { type: "button" }, "<span>" + fx.icon + "</span><span>" + esc(fx.name) + "<small>" + esc(fx.desc || "") + "</small></span>"); b.onclick = function () { openFx(fx.id); }; l.appendChild(b); }); }
		q.oninput = list; list(); q.focus();
	}
	function openMarkers() {
		panel = "markers"; var box = el("div", { class: "au-pb" }); box.style.padding = "0";
		box.innerHTML = '<div class="au-row"><button type="button" class="au-btn au-btn--sm" id="au-mkadd">+ Marker at cursor (M)</button><button type="button" class="au-btn au-btn--sm" id="au-mkexp">Export as labels (.txt)</button></div><div class="au-marks" id="au-mkl"></div><div class="au-note">[ and ] jump between markers. The text file imports into Audacity (File → Import → Labels).</div>';
		openPanel("Markers", box); $("au-mkadd").onclick = addMarker; $("au-mkexp").onclick = exportLabels;
		var l = $("au-mkl"); if (!S.markers.length) l.innerHTML = '<div class="au-note">No markers yet.</div>';
		S.markers.forEach(function (m) {
			var r = el("div", { class: "au-mk" }, '<button type="button" class="au-mt" title="Go there">' + fmt(m.t, 2) + '</button><input type="text" aria-label="Marker name"><button type="button" class="au-btn au-btn--sm" title="Delete marker" aria-label="Delete marker">✕</button>');
			var inp = r.querySelector("input"); inp.value = m.name; inp.onchange = function () { m.name = inp.value; commit("Rename marker"); };
			r.querySelector(".au-mt").onclick = function () { setCursor(m.t); if (playing) playFrom(m.t); };
			r.querySelector(".au-btn").onclick = function () { S.markers = S.markers.filter(function (x) { return x !== m; }); commit("Delete marker"); openMarkers(); };
			l.appendChild(r);
		});
	}
	function exportLabels() { var txt = S.markers.map(function (m) { var s = (m.t / S.sr).toFixed(6); return s + "\t" + s + "\t" + m.name; }).join("\n") + "\n"; download(new Blob([txt], { type: "text/plain" }), A.fileName((S.name || "audio") + "-markers", "txt")); }
	function showHelp() {
		var k = [["Space", "Play / pause"], ["Home / End", "Start / end"], ["← / →", "Move 1 s (Shift = extend selection)"], [MOD + "Z", "Undo"], [MOD + "Shift+Z", "Redo"], [MOD + "X / C / V", "Cut, copy, paste"], ["Delete", "Delete selection"], [MOD + "I", "Split"], [MOD + "T", "Trim to selection"], [MOD + "L", "Silence selection"], [MOD + "D", "Duplicate to new track"], [MOD + "A", "Select all"], ["Esc", "Clear selection / close"], ["M", "Add marker"], ["[ / ]", "Previous / next marker"], ["R", "Record"], ["L", "Loop on / off"], ["+ / −", "Zoom in / out"], ["0", "Fit project"], [MOD + "3", "Zoom to selection"], ["S", "Spectrogram"], ["N", "Noise removal"], ["E", "Effects list"], ["B", "A / B while previewing"], [MOD + "E", "Export"], [MOD + "K", "Search commands"], ["F", "Fill window"], ["Shift+F", "Full screen"], ["?", "This list"]];
		openPanel("Keyboard shortcuts", '<div class="au-help">' + k.map(function (x) { return "<div><kbd>" + esc(x[0]) + "</kbd><span>" + esc(x[1]) + "</span></div>"; }).join("") + '</div><div class="au-note">Ctrl+wheel or pinch zooms; Shift+wheel scrolls sideways. Drag a clip by its title bar to move it (also to another track).</div>');
		panel = "help";
	}

	/* ---------------- recording ---------------- */
	var rec = null;
	function toggleRec() { if (rec) return stopRec(); startRec(); }
	function startRec() {
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast("Recording needs a secure (https) page and a microphone");
		stopAll(); actx();
		navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }).then(function (stream) {
			var src = ctx.createMediaStreamSource(stream), sp = ctx.createScriptProcessor(4096, 1, 1), chunks = [], zero = ctx.createGain(); zero.gain.value = 0;
			sp.onaudioprocess = function (e) { var d = new Float32Array(e.inputBuffer.getChannelData(0)); chunks.push(d); rec.n += d.length; var pk = 0; for (var i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]); rec.pk = pk; };
			src.connect(sp); sp.connect(zero); zero.connect(ctx.destination);
			rec = { stream: stream, src: src, sp: sp, chunks: chunks, n: 0, pk: 0, rate: ctx.sampleRate, at: S.sel ? S.sel.a : S.cursor, t0: Date.now() };
			$("au-recbar").hidden = false; $("au-rec").setAttribute("aria-pressed", "true"); $("au-empty").hidden = true;
			(function loopRec() { if (!rec) return; var s = (Date.now() - rec.t0) / 1000; $("au-rect").textContent = A.fmtTime(s, 0); var c = $("au-recmeter"), g = c.getContext("2d"), db = rec.pk > 0 ? 20 * Math.log10(rec.pk) : -90, f = Math.max(0, Math.min(1, (db + 60) / 60)); g.fillStyle = "#0b0d11"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = db > -1 ? "#ef4444" : db > -9 ? "#fbbf24" : "#4ade80"; g.fillRect(0, 2, f * c.width, c.height - 4); requestAnimationFrame(loopRec); })();
		}).catch(function (e) { toast("No microphone access: " + (e.message || e.name)); });
	}
	function stopRec() {
		if (!rec) return; var r = rec; rec = null; try { r.sp.disconnect(); r.src.disconnect(); } catch (e) {} r.stream.getTracks().forEach(function (t) { t.stop(); });
		$("au-recbar").hidden = true; $("au-rec").setAttribute("aria-pressed", "false");
		if (!r.n) { updateEmpty(); return; }
		var x = new Float32Array(r.n), p = 0; r.chunks.forEach(function (c) { x.set(c, p); p += c.length; });
		if (r.rate !== S.sr && D) x = D.resample(x, r.rate, S.sr);
		var first = !S.tracks.length; addTrackFrom([x], "Recording " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), r.at);
		if (first) { S.name = "Recording"; zoomFit(); }
		commit("Record"); toast("Recorded " + fmt(x.length, 1) + ". Tip: ✨ Remove noise cleans it up.");
	}

	/* ---------------- test clip ---------------- */
	function testClip() {
		var b = busy("Loading the test clip");
		fetch("/audio/sample-speech.mp3").then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(decode).then(function (ab) {
			var x = abToCh(ab)[0], n = x.length, y = new Float32Array(n), s = 7, br = 0, p1 = 0, e = 0, en = 0, nz = new Float32Array(n), i;
			for (i = 0; i < n; i++) { s = (s * 16807) % 2147483647; var w = s / 2147483647 * 2 - 1; br = 0.995 * br + 0.05 * w; p1 = 0.9 * p1 + 0.1 * w; var hum = 0; for (var h = 1; h <= 5; h++) hum += Math.sin(2 * Math.PI * 60 * h * i / S.sr + h) / h; nz[i] = br + 0.3 * p1 + 0.25 * w + 0.4 * hum; e += x[i] * x[i]; en += nz[i] * nz[i]; }
			var g = Math.sqrt(e / en / Math.pow(10, 0.5)); for (i = 0; i < n; i++) y[i] = x[i] + g * nz[i];
			b.done(); addTrackFrom([y], "Noisy test clip"); S.name = "noisy-test-clip"; zoomFit(); commit("Open test clip");
			toast("Speech (LibriVox, public domain) + fan, hiss and 60 Hz hum. Press ✨ Remove noise, then Preview and switch A / B.");
		}).catch(function (e) { b.done(); toast("Could not load the test clip: " + e.message); });
	}

	/* ---------------- export ---------------- */
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 30000); }
	var EX_LS = store("export") || { fmt: "mp3", bits: "16", kbps: "192", rate: "same", ch: "auto", range: "all", lufs: "none" };
	function openExport() {
		if (!S.tracks.length) return toast("Open or record some audio first"); panel = "export";
		var box = el("div", { class: "au-pb" }); box.style.padding = "0";
		var aac = typeof window.AudioEncoder === "function";
		box.innerHTML = '<label class="au-f"><span>Format</span><select id="ex-fmt"><option value="mp3">MP3</option><option value="wav">WAV</option><option value="m4a"' + (aac ? "" : " disabled") + '>M4A (AAC)' + (aac ? "" : " – not in this browser") + '</option></select></label>' +
			'<label class="au-f" id="ex-bitsw"><span>WAV depth</span><select id="ex-bits"><option value="16">16-bit</option><option value="24">24-bit</option><option value="32">32-bit float</option></select></label>' +
			'<label class="au-f" id="ex-kbpsw"><span>Bitrate</span><select id="ex-kbps"><option value="64">64 kbps (speech, small)</option><option value="96">96 kbps</option><option value="128">128 kbps</option><option value="192">192 kbps</option><option value="256">256 kbps</option><option value="320">320 kbps (MP3 best)</option></select></label>' +
			'<label class="au-f"><span>Sample rate</span><select id="ex-rate"><option value="same">Project (' + S.sr + ' Hz)</option><option value="44100">44,100 Hz</option><option value="48000">48,000 Hz</option><option value="22050">22,050 Hz</option></select></label>' +
			'<label class="au-f"><span>Channels</span><select id="ex-ch"><option value="auto">Automatic</option><option value="1">Mono</option><option value="2">Stereo</option></select></label>' +
			'<label class="au-f"><span>Range</span><select id="ex-range"><option value="all">Whole project</option><option value="sel"' + (S.sel ? "" : " disabled") + '>Selection only</option></select></label>' +
			'<label class="au-f"><span>Loudness on export</span><select id="ex-lufs"><option value="none">Leave as it is</option><option value="-14">−14 LUFS, −1 dBTP (YouTube, Spotify)</option><option value="-16">−16 LUFS, −1 dBTP (podcasts)</option><option value="-23">−23 LUFS, −1 dBTP (broadcast)</option></select></label>' +
			'<label class="au-f"><span>File name</span><input type="text" id="ex-name" spellcheck="false"></label>' +
			'<div class="au-row"><button type="button" class="au-btn au-btn--primary" id="ex-go">⬇ Export</button></div><div class="au-note" id="ex-note">Muted tracks are left out; track volume and pan are applied. Encoding happens in this browser.</div>';
		openPanel("Export", box);
		["fmt", "bits", "kbps", "rate", "ch", "range", "lufs"].forEach(function (k) { var s = $("ex-" + k); if (EX_LS[k] && s.querySelector('option[value="' + EX_LS[k] + '"]:not([disabled])')) s.value = EX_LS[k]; s.onchange = function () { EX_LS[k] = s.value; store("export", EX_LS); vis(); }; });
		$("ex-name").value = S.name || "audio";
		function vis() { var f = $("ex-fmt").value; $("ex-bitsw").hidden = f !== "wav"; $("ex-kbpsw").hidden = f === "wav"; }
		vis(); $("ex-go").onclick = doExport;
	}
	function doExport() {
		var f = $("ex-fmt").value, a = $("ex-range").value === "sel" && S.sel ? S.sel.a : 0, b = $("ex-range").value === "sel" && S.sel ? S.sel.b : projEnd();
		var nch = $("ex-ch").value === "auto" ? (S.tracks.some(function (t) { return !t.mute && (t.nch === 2 || Math.abs(t.pan) > 0.01); }) ? 2 : 1) : +$("ex-ch").value;
		var rate = $("ex-rate").value === "same" ? S.sr : +$("ex-rate").value, name = $("ex-name").value || "audio", lufs = $("ex-lufs").value;
		if (f === "mp3") rate = A.mp3Rate(rate);
		stopAll(); var bz = busy("Exporting");
		tick().then(function () {
			var mix = A.mix(S.tracks, a, b, nch);
			if (lufs !== "none") { bz.set(0.1, "Setting loudness"); mix = A.loudnessNormalize(mix, S.sr, +lufs, -1).ch; }
			if (rate !== S.sr && D) mix = mix.map(function (c) { return D.resample(c, S.sr, rate); });
			if (f === "wav") return new Blob([A.wav(mix, rate, +$("ex-bits").value)], { type: "audio/wav" });
			if (f === "mp3") return encMp3(mix, rate, +$("ex-kbps").value, bz);
			return encM4a(mix, rate, +$("ex-kbps").value, bz);
		}).then(function (blob) {
			bz.done(); var fn = A.fileName(name, f); download(blob, fn); toast("Saved " + fn + " (" + (blob.size / 1048576).toFixed(1) + " MB)");
		}).catch(function (e) { bz.done(); toast("Export failed: " + (e.message || e)); });
	}
	function encMp3(ch, rate, kbps, bz) {
		return (window.lamejs ? Promise.resolve() : loadScript(LAME)).then(function () {
			var enc = new window.lamejs.Mp3Encoder(ch.length, rate, kbps), out = [], BLK = 1152 * 40, n = ch[0].length, i = 0;
			return new Promise(function (res, rej) {
				function step() {
					if (bz.signal.aborted) return rej(new Error("Cancelled"));
					var e = Math.min(n, i + BLK * 8);
					for (; i < e; i += BLK) { var j = Math.min(n, i + BLK), l = A.toInt16(ch[0], i, j), r = ch.length > 1 ? A.toInt16(ch[1], i, j) : null, m = r ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l); if (m.length) out.push(new Uint8Array(m)); }
					bz.set(i / n, "Encoding MP3");
					if (i < n) return setTimeout(step, 0);
					var f = enc.flush(); if (f.length) out.push(new Uint8Array(f)); res(new Blob(out, { type: "audio/mpeg" }));
				}
				step();
			});
		});
	}
	function encM4a(ch, rate, kbps, bz) {
		return (window.Mp4Muxer ? Promise.resolve() : loadScript(MUXER)).then(function () {
			var cfg = { codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: ch.length, bitrate: Math.min(320, Math.max(64, kbps)) * 1000 };
			return AudioEncoder.isConfigSupported(cfg).then(function (s) {
				if (!s.supported) throw new Error("this browser has no AAC encoder at " + rate + " Hz; try WAV or MP3");
				var M = window.Mp4Muxer, target = new M.ArrayBufferTarget(), mux = new M.Muxer({ target: target, audio: { codec: "aac", numberOfChannels: ch.length, sampleRate: rate }, fastStart: "in-memory" }), err = null;
				var enc = new AudioEncoder({ output: function (c, m) { mux.addAudioChunk(c, m); }, error: function (e) { err = e; } });
				enc.configure(cfg); var n = ch[0].length, B = 4096 * 4, i = 0;
				return new Promise(function (res, rej) {
					function step() {
						if (err) return rej(err); if (bz.signal.aborted) return rej(new Error("Cancelled"));
						var e2 = Math.min(n, i + B * 16);
						for (; i < e2; i += B) { var j = Math.min(n, i + B), len = j - i, buf = new Float32Array(len * ch.length); ch.forEach(function (c, k) { buf.set(c.subarray(i, j), k * len); }); var ad = new AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: len, numberOfChannels: ch.length, timestamp: Math.round(i / rate * 1e6), data: buf }); enc.encode(ad); ad.close(); }
						bz.set(i / n, "Encoding AAC");
						if (i < n) return setTimeout(step, 0);
						enc.flush().then(function () { mux.finalize(); res(new Blob([target.buffer], { type: "audio/mp4" })); }, rej);
					}
					step();
				});
			});
		});
	}

	/* ---------------- autosave (IndexedDB) ---------------- */
	var DB = null, saveT = null;
	function db() { return DB = DB || new Promise(function (res, rej) { if (!window.indexedDB) return rej(new Error("no IndexedDB")); var r = indexedDB.open("mes-audio", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function idb(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction("kv", mode), st = tx.objectStore("kv"), q = fn(st); tx.oncomplete = function () { res(q && q.result); }; tx.onerror = function () { rej(tx.error); }; }); }); }
	function schedSave() { clearTimeout(saveT); saveT = setTimeout(save, 2500); }
	function save() {
		if (!S.tracks.length) { idb("readwrite", function (s) { return s.delete("auto"); }).catch(function () {}); return; }
		var data = { v: 1, t: Date.now(), sr: S.sr, name: S.name, markers: S.markers, tracks: S.tracks.map(function (t) { return { id: t.id, name: t.name, nch: t.nch, gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo, clips: t.clips.map(function (c) { return { id: c.id, start: c.start, ch: c.ch }; }) }; }) };
		idb("readwrite", function (s) { return s.put(data, "auto"); }).then(function () { dirty = false; }).catch(function (e) { toast("Could not autosave (" + (e && e.name || "storage full?") + ")"); });
	}
	function offerRestore() {
		idb("readonly", function (s) { return s.get("auto"); }).then(function (d) {
			if (!d || !d.tracks || !d.tracks.length || S.tracks.length) return;
			var len = d.tracks.reduce(function (m, t) { return Math.max(m, t.clips.reduce(function (mm, c) { return Math.max(mm, c.start + c.ch[0].length); }, 0)); }, 0), ago = Math.round((Date.now() - d.t) / 60000);
			var box = $("au-restore"); box.hidden = false; box.innerHTML = '<button type="button" class="au-btn">↺ Restore last session</button> <span class="au-note">' + esc(d.name || "Untitled") + " · " + d.tracks.length + " track" + (d.tracks.length > 1 ? "s" : "") + " · " + A.fmtTime(len / d.sr, 0) + " · saved " + (ago < 1 ? "just now" : ago < 120 ? ago + " min ago" : Math.round(ago / 60) + " h ago") + ' </span><button type="button" class="au-btn au-btn--sm" title="Delete the saved session">Forget</button>';
			var bs = box.querySelectorAll("button");
			bs[0].onclick = function () { S.sr = d.sr; S.name = d.name || ""; S.markers = d.markers || []; S.tracks = d.tracks.map(function (t) { return A.track(t); }); H = new A.History(1.5e9); H.push("Restore", snap()); box.hidden = true; afterChange(); zoomFit(); toast("Session restored"); };
			bs[1].onclick = function () { idb("readwrite", function (s) { return s.delete("auto"); }); box.hidden = true; };
		}).catch(function () {});
	}
	window.addEventListener("beforeunload", function () { if (dirty) save(); });

	/* ---------------- menus + command search ---------------- */
	var CMDS = [
		{ m: "File", name: "Open audio or video…", kb: MOD + "O", fn: function () { $("au-file").click(); } },
		{ m: "File", name: "Record from microphone", kb: "R", fn: toggleRec },
		{ m: "File", name: "Export…", kb: MOD + "E", fn: openExport },
		{ m: "File", name: "Export markers as labels (.txt)", fn: exportLabels },
		{ m: "File", name: "Load the noisy test clip", fn: testClip },
		{ m: "File", name: "New project (clear everything)", fn: function () { if (S.tracks.length && !confirm("Clear the whole project? (Undo can bring it back)")) return; stopAll(); S.tracks = []; S.markers = []; S.sel = null; S.selT = []; S.cursor = 0; commit("New project"); } },
		{ m: "Edit", name: "Undo", kb: MOD + "Z", fn: undo }, { m: "Edit", name: "Redo", kb: MOD + "Shift+Z", fn: redo }, { sep: "Edit" },
		{ m: "Edit", name: "Cut", kb: MOD + "X", fn: doCut }, { m: "Edit", name: "Copy", kb: MOD + "C", fn: doCopy }, { m: "Edit", name: "Paste", kb: MOD + "V", fn: doPaste },
		{ m: "Edit", name: "Delete", kb: "Del", keys: "remove", fn: function () { doDelete(); } }, { m: "Edit", name: "Silence selection", kb: MOD + "L", keys: "mute", fn: doSilence },
		{ m: "Edit", name: "Trim to selection", kb: MOD + "T", keys: "crop keep", fn: doTrim }, { m: "Edit", name: "Split at cursor / selection", kb: MOD + "I", keys: "cut clip", fn: doSplit },
		{ m: "Edit", name: "Insert silence…", fn: doInsertSilence }, { m: "Edit", name: "Duplicate selection to a new track", kb: MOD + "D", fn: doDuplicate }, { sep: "Edit" },
		{ m: "Edit", name: "Select all", kb: MOD + "A", fn: selectAll }, { m: "Edit", name: "Clear selection", kb: "Esc", fn: function () { S.sel = null; afterSel(); } },
		{ m: "Edit", name: "Add track", fn: addTrack }, { m: "Edit", name: "Add marker", kb: "M", fn: addMarker }, { m: "Edit", name: "Markers…", fn: openMarkers },
		{ m: "Effects", name: "Effects list…", kb: "E", fn: openFxList }
	].concat(EFFECTS.map(function (fx) { return { m: "Effects", name: fx.icon + " " + fx.name, keys: fx.keys, kb: fx.id === "noise" ? "N" : "", fn: function () { openFx(fx.id); } }; })).concat([
		{ m: "View", name: "Zoom in", kb: "+", fn: function () { zoomAt(2, W / 2); } }, { m: "View", name: "Zoom out", kb: "−", fn: function () { zoomAt(0.5, W / 2); } },
		{ m: "View", name: "Fit project", kb: "0", fn: zoomFit }, { m: "View", name: "Zoom to selection", kb: MOD + "3", fn: zoomSel },
		{ m: "View", name: "Spectrogram on / off", kb: "S", fn: function () { S.spec = !S.spec; store("spec", S.spec); draw(); } },
		{ m: "View", name: "Taller tracks", fn: function () { S.laneH = Math.min(320, S.laneH + 30); store("laneH", S.laneH); afterChange(); } }, { m: "View", name: "Shorter tracks", fn: function () { S.laneH = Math.max(64, S.laneH - 30); store("laneH", S.laneH); afterChange(); } },
		{ m: "View", name: "Fill window", kb: "F", fn: toggleWin }, { m: "View", name: "Full screen", kb: "Shift+F", fn: toggleFs },
		{ m: "Help", name: "Keyboard shortcuts", kb: "?", fn: showHelp }, { m: "Help", name: "About the noise removal", fn: function () { openPanel("About the noise removal", '<div class="au-note">' + DN.models.map(function (m) { return "<p><b>" + esc(m.name) + "</b> · " + esc(m.licence) + " · " + esc(m.size) + "<br>" + esc(m.note) + "</p>"; }).join("") + "<p>Everything runs on this device; nothing is uploaded. DeepFilterNet runs on the processor with WebAssembly (one thread).</p></div>"); panel = "about"; } }
	]);
	function buildMenus() {
		var bar = $("au-menus"); bar.innerHTML = "";
		["File", "Edit", "Effects", "View", "Help"].forEach(function (m) {
			var wrap = el("div", { class: "au-menu" }), b = el("button", { type: "button", "aria-haspopup": "true", "aria-expanded": "false" }, m), list = el("div", { class: "au-mlist", role: "menu" }); list.hidden = true;
			CMDS.forEach(function (c) { if (c.sep === m) { list.appendChild(el("hr")); return; } if (c.m !== m) return; var it = el("button", { type: "button", role: "menuitem" }, "<span>" + esc(c.name) + "</span><kbd>" + esc(c.kb || "") + "</kbd>"); it.onclick = function () { closeMenus(); c.fn(); }; list.appendChild(it); });
			b.onclick = function (e) { e.stopPropagation(); var open = list.hidden; closeMenus(); list.hidden = !open; b.setAttribute("aria-expanded", open); if (open) { var f = list.querySelector("button"); if (f) f.focus(); } };
			list.addEventListener("keydown", function (e) { var items = Array.prototype.slice.call(list.querySelectorAll("button")), i = items.indexOf(document.activeElement); if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); } if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } if (e.key === "Escape") { closeMenus(); b.focus(); } });
			wrap.appendChild(b); wrap.appendChild(list); bar.appendChild(wrap);
		});
	}
	function closeMenus() { root.querySelectorAll(".au-mlist").forEach(function (l) { l.hidden = true; }); root.querySelectorAll(".au-menu > button").forEach(function (b) { b.setAttribute("aria-expanded", "false"); }); }
	document.addEventListener("click", function (e) { if (!e.target.closest(".au-menu")) closeMenus(); if (!e.target.closest(".au-search")) $("au-sres").hidden = true; });
	var sq = $("au-search"), sres = $("au-sres"), sIdx = 0, sList = [];
	function searchRender() {
		sList = A.match(CMDS.filter(function (c) { return c.name; }).map(function (c) { return { name: c.name.replace(/^\S+ (?=[A-Z])/, function (x) { return /[A-Za-z]/.test(x[0]) ? x : x; }), keys: (c.keys || "") + " " + c.m, c: c }; }), sq.value).slice(0, 12);
		sres.innerHTML = ""; sIdx = Math.min(sIdx, sList.length - 1);
		sList.forEach(function (it, i) { var b = el("button", { type: "button", role: "option", "aria-selected": i === sIdx }, "<span>" + esc(it.c.name) + ' <small style="opacity:.6">' + esc(it.c.m) + "</small></span><kbd>" + esc(it.c.kb || "") + "</kbd>"); b.onclick = function () { runSearch(i); }; sres.appendChild(b); });
		sres.hidden = !sList.length;
	}
	function runSearch(i) { var it = sList[i]; if (!it) return; sres.hidden = true; sq.value = ""; sq.blur(); it.c.fn(); }
	sq.addEventListener("input", function () { sIdx = 0; searchRender(); }); sq.addEventListener("focus", searchRender);
	sq.addEventListener("keydown", function (e) { if (e.key === "ArrowDown") { e.preventDefault(); sIdx = Math.min(sList.length - 1, sIdx + 1); searchRender(); } else if (e.key === "ArrowUp") { e.preventDefault(); sIdx = Math.max(0, sIdx - 1); searchRender(); } else if (e.key === "Enter") { e.preventDefault(); runSearch(sIdx); } else if (e.key === "Escape") { sres.hidden = true; sq.blur(); } });

	/* ---------------- fill window / full screen ---------------- */
	function toggleWin() { var on = !root.classList.contains("au-win"); if (document.fullscreenElement) document.exitFullscreen(); root.classList.toggle("au-win", on); document.body.classList.toggle("au-noscroll", on); $("au-winbtn").setAttribute("aria-pressed", on); setTimeout(draw, 30); }
	function toggleFs() { if (document.fullscreenElement) return document.exitFullscreen(); if (root.requestFullscreen) root.requestFullscreen().then(function () { setTimeout(draw, 60); }).catch(function () { toggleWin(); }); else toggleWin(); }
	document.addEventListener("fullscreenchange", function () { setTimeout(draw, 60); });

	/* ---------------- keyboard ---------------- */
	document.addEventListener("keydown", function (e) {
		if (!root.isConnected) return; var tg = e.target, typing = tg && (tg.tagName === "INPUT" && !/range|checkbox|button/.test(tg.type) || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable);
		var inEditor = root.contains(tg) || tg === document.body || root.classList.contains("au-win");
		var mod = e.ctrlKey || e.metaKey, k = e.key;
		if (mod && (k === "k" || k === "K")) { if (!inEditor && !root.contains(document.activeElement)) return; e.preventDefault(); sq.focus(); sq.select(); return; }
		if (typing || !inEditor) return;
		if (k === " ") { e.preventDefault(); togglePlay(); return; }
		if (mod) {
			var lk = k.toLowerCase(), map = { z: e.shiftKey ? redo : undo, y: redo, x: doCut, c: doCopy, v: doPaste, a: selectAll, i: doSplit, t: doTrim, l: doSilence, d: doDuplicate, e: openExport, o: function () { $("au-file").click(); }, 3: zoomSel };
			if (map[lk]) { e.preventDefault(); map[lk](); } return;
		}
		if (e.altKey) return;
		var step = S.sr * (e.shiftKey ? 1 : 1);
		switch (k) {
			case "Delete": case "Backspace": e.preventDefault(); doDelete(); break;
			case "Escape": if (root.classList.contains("au-win") && !S.sel && !panel) toggleWin(); else if (panel) closePanel(); else { S.sel = null; afterSel(); } break;
			case "Home": e.preventDefault(); setCursor(0); S.start = 0; if (playing) playFrom(0); draw(); break;
			case "End": e.preventDefault(); setCursor(projEnd()); S.start = projEnd() - W * S.spp * 0.9; draw(); break;
			case "ArrowRight": case "ArrowLeft": e.preventDefault(); var d = (k === "ArrowRight" ? 1 : -1) * step;
				if (e.shiftKey) { var a0 = S.sel ? S.sel.a : S.cursor, b0 = S.sel ? S.sel.b : S.cursor; b0 = Math.max(a0, b0 + d); S.sel = b0 > a0 ? { a: a0, b: b0 } : null; if (!S.selT.length) S.selT = S.tracks.map(function (t) { return t.id; }); afterSel(); }
				else { setCursor(Math.max(0, (playing ? playPos() : S.cursor) + d)); if (playing) playFrom(S.cursor); } break;
			case "+": case "=": zoomAt(2, W / 2); break; case "-": case "_": zoomAt(0.5, W / 2); break; case "0": zoomFit(); break;
			case "m": case "M": addMarker(); break; case "[": jumpMarker(-1); break; case "]": jumpMarker(1); break;
			case "r": case "R": toggleRec(); break;
			case "l": case "L": loop = !loop; store("loop", loop); syncUi(); toast(loop ? "Loop on" : "Loop off"); break;
			case "s": case "S": S.spec = !S.spec; store("spec", S.spec); draw(); break;
			case "n": case "N": openFx("noise"); break;
			case "e": case "E": openFxList(); break;
			case "b": case "B": if (preview && preview.playing) setAB(preview.which === "A" ? "B" : "A"); break;
			case "f": if (!e.shiftKey) toggleWin(); break; case "F": toggleFs(); break;
			case "?": showHelp(); break;
			default: return;
		}
	});

	/* ---------------- drop / buttons ---------------- */
	var dragDepth = 0, dropEl = null;
	root.addEventListener("dragenter", function (e) { if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, "Files") < 0) return; e.preventDefault(); dragDepth++; if (!dropEl) { dropEl = el("div", { class: "au-drop" }, "Drop audio or video to add it as a track"); root.appendChild(dropEl); } });
	root.addEventListener("dragover", function (e) { if (dropEl) e.preventDefault(); });
	root.addEventListener("dragleave", function () { if (--dragDepth <= 0 && dropEl) { dropEl.remove(); dropEl = null; dragDepth = 0; } });
	root.addEventListener("drop", function (e) { if (!dropEl) return; e.preventDefault(); dropEl.remove(); dropEl = null; dragDepth = 0; openFiles(e.dataTransfer.files); });
	$("au-file").addEventListener("change", function () { openFiles(this.files); this.value = ""; });
	$("au-e-open").onclick = function () { $("au-file").click(); }; $("au-e-rec").onclick = toggleRec; $("au-e-tone").onclick = testClip;
	$("au-undo").onclick = undo; $("au-redo").onclick = redo; $("au-winbtn").onclick = toggleWin; $("au-fsbtn").onclick = toggleFs;
	$("au-noisebtn").onclick = function () { if (!S.tracks.length) { toast("Open, record or load the test clip first"); return; } openFx("noise"); };
	$("au-export").onclick = openExport;
	$("au-play").onclick = togglePlay; $("au-stop").onclick = function () { stopAll(); drawOver(); };
	$("au-home").onclick = function () { setCursor(0); S.start = 0; if (playing) playFrom(0); draw(); };
	$("au-end").onclick = function () { setCursor(projEnd()); draw(); };
	$("au-rec").onclick = toggleRec; $("au-recstop").onclick = stopRec;
	$("au-loop").onclick = function () { loop = !loop; store("loop", loop); syncUi(); };
	$("au-zin").onclick = function () { zoomAt(2, W / 2); }; $("au-zout").onclick = function () { zoomAt(0.5, W / 2); }; $("au-zfit").onclick = zoomFit; $("au-zsel").onclick = zoomSel;
	$("au-spec").onclick = function () { S.spec = !S.spec; store("spec", S.spec); draw(); };
	$("au-addtrack").onclick = addTrack;
	$("au-vol").oninput = function () { if (master) master.gain.value = +this.value; };
	if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe(lanes); else window.addEventListener("resize", draw);

	/* ---------------- start ---------------- */
	S.spec = !!store("spec"); S.laneH = store("laneH") || (window.innerWidth < 600 ? 92 : 112);
	buildMenus(); H.push("Start", snap()); afterChange(); meterClear(); offerRestore();
	window.MESAudioEditor = { state: S, openFiles: openFiles, applyFx: applyFx, effects: EFFECTS, commit: commit, testClip: testClip };
})();
