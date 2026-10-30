/* MESVed: pure maths of the MES Video Editor (mes.fm/video). The project model, clip timing (trim, split, speed, cross-fades),
 * placing clips on tracks without overlaps, snapping, ripple deletes, what is visible / audible at a time, audio envelopes and mixing with
 * resampling, EBU R128 loudness (for "Normalize loudness"), picture placement, time codes and undo history. No DOM: node-tested by
 * tool_apps_src/video-tests.js. */
(function (root) {
	"use strict";
	var V = {}, EPS = 1e-6;
	var n = 0; V.uid = function (p) { return (p || "x") + Date.now().toString(36) + (++n).toString(36) + Math.floor(Math.random() * 1296).toString(36); };
	V.clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };

	/* ---------- project ---------- */
	V.TEXT_DEFAULT = { s: "Your title", font: "Arial, Helvetica, sans-serif", size: 0.09, color: "#ffffff", bgOn: true, bg: "#000000", bgOp: 0.55, bold: true, italic: false, align: "center", shadow: true, outline: 0, ocolor: "#000000" };
	V.newProject = function (o) {
		o = o || {};
		return { v: 1, name: o.name || "Untitled video", w: o.w || 1920, h: o.h || 1080, fps: o.fps || 30, bg: "#000000",
			tracks: [{ id: "v1", kind: "v", name: "Video 1" }, { id: "v2", kind: "v", name: "Video 2" }, { id: "a1", kind: "a", name: "Audio 1" }], clips: [], marks: { in: null, out: null } };
	};
	V.clipDefaults = function (c) {
		var d = { speed: 1, vol: 1, mute: false, fin: 0, fout: 0, xin: 0, x: 0.5, y: 0.5, scale: 1, op: 1, crop: { l: 0, t: 0, r: 0, b: 0 }, clean: null, lufs: null };
		for (var k in d) if (c[k] == null) c[k] = typeof d[k] === "object" && d[k] ? JSON.parse(JSON.stringify(d[k])) : d[k];
		if (c.type === "text") { c.text = Object.assign({}, V.TEXT_DEFAULT, c.text || {}); }
		return c;
	};
	// a project read from a file / storage: fill in defaults, drop clips whose track is gone, keep numbers sane
	V.normalize = function (p) {
		if (!p || typeof p !== "object") throw new Error("Not a project.");
		var q = V.newProject(p);
		q.name = String(p.name || q.name).slice(0, 120); q.bg = /^#[0-9a-f]{6}$/i.test(p.bg || "") ? p.bg : "#000000";
		q.w = V.clamp(Math.round(+p.w || 1920), 16, 7680) & ~1; q.h = V.clamp(Math.round(+p.h || 1080), 16, 4320) & ~1; q.fps = V.clamp(+p.fps || 30, 1, 120);
		if (Array.isArray(p.tracks) && p.tracks.length) q.tracks = p.tracks.filter(function (t) { return t && t.id && (t.kind === "v" || t.kind === "a"); }).map(function (t) { return { id: String(t.id), kind: t.kind, name: String(t.name || "Track").slice(0, 40), mute: !!t.mute, hide: !!t.hide, lock: !!t.lock }; });
		var ids = {}; q.tracks.forEach(function (t) { ids[t.id] = t; });
		q.clips = (Array.isArray(p.clips) ? p.clips : []).filter(function (c) { return c && c.id && ids[c.track] && isFinite(c.start) && isFinite(c.in) && isFinite(c.out) && c.out > c.in; }).map(function (c) { return V.clipDefaults(JSON.parse(JSON.stringify(c))); });
		q.marks = { in: p.marks && isFinite(p.marks.in) ? p.marks.in : null, out: p.marks && isFinite(p.marks.out) ? p.marks.out : null };
		return q;
	};
	V.track = function (p, id) { for (var j = 0; j < p.tracks.length; j++) if (p.tracks[j].id === id) return p.tracks[j]; return null; };
	V.clip = function (p, id) { for (var j = 0; j < p.clips.length; j++) if (p.clips[j].id === id) return p.clips[j]; return null; };
	V.kindFor = function (type) { return type === "audio" ? "a" : "v"; };

	/* ---------- clip timing ---------- */
	V.dur = function (c) { return (c.out - c.in) / (c.speed || 1); };
	V.end = function (c) { return c.start + V.dur(c); };
	V.srcAt = function (c, t) { return c.in + (t - c.start) * (c.speed || 1); };   // source time shown at timeline time t (before start = cross-fade pre-roll)
	V.timeAtSrc = function (c, s) { return c.start + (s - c.in) / (c.speed || 1); };
	V.onTrack = function (p, trackId, ignore) {
		return p.clips.filter(function (c) { return c.track === trackId && !(ignore && ignore[c.id]); }).sort(function (a, b) { return a.start - b.start; });
	};
	V.duration = function (p) { var d = 0; p.clips.forEach(function (c) { d = Math.max(d, V.end(c)); }); return d; };
	// can [start, start + dur) go on the track without touching another clip?
	V.canPlace = function (p, trackId, start, dur, ignore) {
		if (start < -EPS) return false;
		var cs = V.onTrack(p, trackId, ignore);
		for (var j = 0; j < cs.length; j++) if (start < V.end(cs[j]) - 1e-4 && start + dur > cs[j].start + 1e-4) return false;
		return true;
	};
	// the free start nearest to "want" where a clip of this length fits (null when the track has no such gap... it always has one after the last clip)
	V.fitOnTrack = function (p, trackId, want, dur, ignore) {
		var cs = V.onTrack(p, trackId, ignore), gaps = [], prev = 0, best = null, bd = Infinity;
		cs.forEach(function (c) { gaps.push([prev, c.start]); prev = Math.max(prev, V.end(c)); });
		gaps.push([prev, Infinity]);
		gaps.forEach(function (g) {
			if (g[1] - g[0] < dur - 1e-4) return;
			var s = V.clamp(want, g[0], g[1] - dur), d = Math.abs(s - want);
			if (d < bd) { bd = d; best = s; }
		});
		return best;
	};
	// snap t to the nearest point within tol; -> { t, snapped, point }
	V.snap = function (t, points, tol) {
		var best = null, bd = tol;
		for (var j = 0; j < points.length; j++) { var d = Math.abs(points[j] - t); if (d <= bd) { bd = d; best = points[j]; } }
		return best == null ? { t: t, snapped: false } : { t: best, snapped: true, point: best };
	};
	V.snapPoints = function (p, ignore, extra) {
		var pts = [0];
		p.clips.forEach(function (c) { if (ignore && ignore[c.id]) return; pts.push(c.start, V.end(c)); });
		if (p.marks) { if (p.marks.in != null) pts.push(p.marks.in); if (p.marks.out != null) pts.push(p.marks.out); }
		return pts.concat(extra || []);
	};
	// cut a clip in two at timeline time t: -> [left, right] (new objects, right gets newId) or null when t is not inside (min 1 frame each side)
	V.split = function (c, t, newId, minDur) {
		minDur = minDur || 1 / 60;
		if (t <= c.start + minDur || t >= V.end(c) - minDur) return null;
		var s = V.srcAt(c, t), L = JSON.parse(JSON.stringify(c)), R = JSON.parse(JSON.stringify(c));
		L.out = s; R.id = newId; R.in = s; R.start = t;
		if (c.type === "text" || c.type === "image") { L.in = 0; L.out = s - c.in; R.in = 0; R.out = c.out - s; }
		L.fout = 0; L.fin = Math.min(c.fin || 0, V.dur(L)); R.fin = 0; R.xin = 0; R.fout = Math.min(c.fout || 0, V.dur(R));
		return [L, R];
	};
	// drag an edge: edge "l" moves the start (and the in point), "r" the end. t = wanted timeline time of that edge.
	// lim = { mediaDur (Infinity for stills / titles), lo, hi (neighbours on the track), minDur }
	V.trim = function (c, edge, t, lim) {
		var sp = c.speed || 1, min = lim.minDur || 1 / 30, still = !(lim.mediaDur < Infinity), o = { start: c.start, in: c.in, out: c.out };
		if (edge === "l") {
			var endT = V.end(c), lo = Math.max(lim.lo != null ? lim.lo : 0, still ? -Infinity : c.start - c.in / sp, 0);
			var s = V.clamp(t, lo, endT - min);
			if (still) { o.start = s; o.in = 0; o.out = (endT - s) * sp; }
			else { o.in = c.in + (s - c.start) * sp; o.start = s; }
		} else {
			var hi = Math.min(lim.hi != null ? lim.hi : Infinity, still ? Infinity : c.start + (lim.mediaDur - c.in) / sp);
			var e = V.clamp(t, c.start + min, hi);
			o.out = c.in + (e - c.start) * sp;
		}
		return o;
	};
	// remove clips; ripple = move the later clips of the same track left by the removed length
	V.removeClips = function (p, ids, ripple) {
		var del = {}; ids.forEach(function (i) { del[i] = 1; });
		var gone = p.clips.filter(function (c) { return del[c.id]; });
		p.clips = p.clips.filter(function (c) { return !del[c.id]; });
		if (ripple) gone.sort(function (a, b) { return b.start - a.start; }).forEach(function (g) {
			var d = V.dur(g), e = g.start + d;
			p.clips.forEach(function (c) { if (c.track === g.track && c.start >= e - 1e-4) c.start = Math.max(0, c.start - d); });
		});
		return p;
	};
	// cut the range [a, b) out of every unlocked track and close the gap (Camtasia's "ripple delete selection")
	V.removeRange = function (p, a, b, newId) {
		if (!(b > a)) return p;
		var locked = {}; p.tracks.forEach(function (t) { if (t.lock) locked[t.id] = 1; });
		var out = [];
		p.clips.forEach(function (c) {
			if (locked[c.track]) { out.push(c); return; }
			var s = c.start, e = V.end(c);
			if (e <= a + 1e-6) { out.push(c); return; }
			if (s >= b - 1e-6) { c.start = s - (b - a); out.push(c); return; }
			if (s < a) { var L = JSON.parse(JSON.stringify(c)); L.out = V.srcAt(c, a); L.fout = 0; if (c.type === "text" || c.type === "image") { L.in = 0; L.out = (a - s) * (c.speed || 1); } out.push(L); }
			if (e > b) { var R = JSON.parse(JSON.stringify(c)); R.id = newId ? newId() : c.id + "r"; R.in = V.srcAt(c, b); R.start = a; R.fin = 0; R.xin = 0; if (c.type === "text" || c.type === "image") { R.in = 0; R.out = (e - b) * (c.speed || 1); } if (s >= a) R.id = c.id; out.push(R); }
		});
		p.clips = out;
		return p;
	};
	// the clip right after c on its track when they touch (for cross-fades)
	V.nextTouching = function (p, c) {
		var e = V.end(c), cs = V.onTrack(p, c.track);
		for (var j = 0; j < cs.length; j++) if (cs[j] !== c && Math.abs(cs[j].start - e) < 2e-3) return cs[j];
		return null;
	};
	V.prevTouching = function (p, c) {
		var cs = V.onTrack(p, c.track);
		for (var j = 0; j < cs.length; j++) if (cs[j] !== c && Math.abs(V.end(cs[j]) - c.start) < 2e-3) return cs[j];
		return null;
	};

	/* ---------- what shows and what sounds at time t ---------- */
	// fade-in / fade-out / cross-fade envelope of a clip at timeline time t (0..1). Cross-fade: the clip starts showing xin seconds early
	// (its pre-roll) over the clip before it, fading in; the clip before keeps going to its end underneath.
	V.envelope = function (c, t) {
		var s = c.start, e = V.end(c), g = 1;
		if (c.xin > 0 && t < s) g *= V.clamp((t - (s - c.xin)) / c.xin, 0, 1);
		else if (t < s) return 0;
		if (t >= e) return 0;
		if (c.fin > 0 && t >= s) g *= V.clamp((t - s) / c.fin, 0, 1);
		if (c.fout > 0) g *= V.clamp((e - t) / c.fout, 0, 1);
		return g;
	};
	V.active = function (c, t) { return t >= c.start - (c.xin || 0) - EPS && t < V.end(c) - EPS; };
	// visible layers at t, bottom first: [{ clip, src, alpha }]. tracks[0] is the top track.
	V.layersAt = function (p, t) {
		var out = [];
		for (var j = p.tracks.length - 1; j >= 0; j--) {
			var tr = p.tracks[j]; if (tr.kind !== "v" || tr.hide) continue;
			var cs = V.onTrack(p, tr.id);
			for (var k = 0; k < cs.length; k++) {
				var c = cs[k]; if (!V.active(c, t)) continue;
				var a = V.envelope(c, t) * (c.op == null ? 1 : c.op); if (a <= 0.001) continue;
				out.push({ clip: c, src: Math.max(0, V.srcAt(c, t)), alpha: Math.min(1, a) });
			}
		}
		return out;
	};
	// gain of a clip's sound at t (volume x fades x cross-fades in and out); 0 when silent
	V.gainAt = function (p, c, t) {
		var tr = V.track(p, c.track); if (!tr || tr.mute || c.mute) return 0;
		if (c.type !== "audio" && c.type !== "video") return 0;
		var g = V.envelope(c, t) * (c.vol == null ? 1 : c.vol);
		var nx = V.nextTouching(p, c);
		if (nx && nx.xin > 0) { var e = V.end(c); if (t > e - nx.xin) g *= V.clamp((e - t) / nx.xin, 0, 1); }
		return g;
	};
	V.audibleAt = function (p, t, hasAudio) {
		return p.clips.filter(function (c) { return (c.type === "audio" || c.type === "video") && (!hasAudio || hasAudio(c)) && V.active(c, t) && V.gainAt(p, c, t) > 0; });
	};
	// gain for n output samples at rate starting at t0 (one value per sample)
	V.gainCurve = function (p, c, t0, n, rate) {
		var g = new Float32Array(n), step = Math.max(1, Math.floor(rate / 400));   // envelope sampled every 2.5 ms and held: smooth enough, cheap
		for (var i = 0; i < n; i += step) { var v = V.gainAt(p, c, t0 + i / rate); for (var k = i; k < Math.min(n, i + step); k++) g[k] = v; }
		return g;
	};

	/* ---------- audio maths ---------- */
	// add a clip's sound into out channels. buf = { start (source seconds of sample 0), rate, ch: [Float32Array] }; s0 = source time at out[i0];
	// ds = source seconds per output sample (speed / out rate); gain per output sample. Catmull-Rom interpolation.
	V.mixInto = function (out, i0, n, buf, s0, ds, gain) {
		var chs = buf.ch, len = chs[0].length;
		for (var c = 0; c < out.length; c++) {
			var src = chs[Math.min(c, chs.length - 1)], dst = out[c];
			for (var i = 0; i < n; i++) {
				var g = gain ? gain[i] : 1; if (g === 0) continue;
				var x = (s0 + i * ds - buf.start) * buf.rate, k = Math.floor(x), f = x - k;
				if (k < 0 || k >= len) continue;
				var y0 = src[k > 0 ? k - 1 : 0], y1 = src[k], y2 = src[k + 1 < len ? k + 1 : k], y3 = src[k + 2 < len ? k + 2 : len - 1];
				var v = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
				dst[i0 + i] += v * g;
			}
		}
	};
	V.resample = function (chs, from, to) {
		if (from === to) return chs.map(function (x) { return x.slice(); });
		var n = Math.floor(chs[0].length * to / from), out = chs.map(function () { return new Float32Array(n); });
		V.mixInto(out, 0, n, { start: 0, rate: from, ch: chs }, 0, 1 / to, null);
		return out;
	};
	V.peak = function (chs) { var m = 0; chs.forEach(function (c) { for (var i = 0; i < c.length; i++) { var a = Math.abs(c[i]); if (a > m) m = a; } }); return m; };
	// soft limiter so a mix never clips: |x| <= 1
	V.limit = function (chs) { chs.forEach(function (c) { for (var i = 0; i < c.length; i++) { var x = c[i]; if (x > 0.95) c[i] = 0.95 + 0.05 * Math.tanh((x - 0.95) / 0.05); else if (x < -0.95) c[i] = -0.95 - 0.05 * Math.tanh((-x - 0.95) / 0.05); } }); };
	// biquad coefficients of ITU-R BS.1770 K-weighting at any sample rate (Brecht De Man's bilinear design: equals the standard's 48 kHz table)
	function biquad(type, fs, f0, G, Q) {
		var K = Math.tan(Math.PI * f0 / fs), a0 = 1 + K / Q + K * K;
		if (type === "shelf") {
			var Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
			return { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
		}
		return { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
	}
	// biquad over x; st (optional) carries the filter state between calls at st[o..o+3]
	function filt(x, f, st, o) {
		o = o || 0; var y = new Float32Array(x.length), x1 = st ? st[o] : 0, x2 = st ? st[o + 1] : 0, y1 = st ? st[o + 2] : 0, y2 = st ? st[o + 3] : 0, b = f.b, a = f.a;
		for (var i = 0; i < x.length; i++) { var v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
		if (st) { st[o] = x1; st[o + 1] = x2; st[o + 2] = y1; st[o + 3] = y2; }
		return y;
	}
	// integrated loudness in LUFS (EBU R128: 400 ms blocks, 75% overlap, -70 LUFS absolute and -10 LU relative gates). -Infinity for silence.
	// A meter so long clips can be measured window by window: push(channels) as often as needed, then result().
	V.LufsMeter = function (rate) {
		this.rate = rate; this.sh = biquad("shelf", rate, 1681.974450955533, 3.999843853973347, 0.7071752369554196); this.hp = biquad("hp", rate, 38.13547087602444, 0, 0.5003270373238773);
		this.st = []; this.q = Math.round(0.1 * rate); this.acc = 0; this.cnt = 0; this.sub = []; this.peak = 0;
	};
	V.LufsMeter.prototype.push = function (chs) {
		var n = chs[0].length, self = this;
		while (this.st.length < chs.length) this.st.push([0, 0, 0, 0, 0, 0, 0, 0]);
		var w = chs.map(function (x, c) { var s = self.st[c]; return filt(filt(x, self.sh, s, 0), self.hp, s, 4); });
		for (var c = 0; c < chs.length; c++) { var x = chs[c]; for (var k = 0; k < n; k++) { var a = x[k] < 0 ? -x[k] : x[k]; if (a > this.peak) this.peak = a; } }
		for (var i = 0; i < n; i++) {
			var e = 0; for (var c2 = 0; c2 < w.length; c2++) e += w[c2][i] * w[c2][i];
			this.acc += e; if (++this.cnt === this.q) { this.sub.push(this.acc / this.q); this.acc = 0; this.cnt = 0; }
		}
	};
	V.LufsMeter.prototype.result = function () {
		var z = [], s = this.sub; for (var j = 0; j + 4 <= s.length; j++) z.push((s[j] + s[j + 1] + s[j + 2] + s[j + 3]) / 4);
		var L = function (v) { return -0.691 + 10 * Math.log10(v); };
		var g1 = z.filter(function (v) { return L(v) > -70; }); if (!g1.length) return -Infinity;
		var m1 = g1.reduce(function (a, b) { return a + b; }, 0) / g1.length, rel = L(m1) - 10;
		var g2 = g1.filter(function (v) { return L(v) > rel; }); if (!g2.length) return -Infinity;
		return L(g2.reduce(function (a, b) { return a + b; }, 0) / g2.length);
	};
	V.lufs = function (chs, rate) { var m = new V.LufsMeter(rate); m.push(chs); return m.result(); };
	// volume (linear) that brings a clip to the target loudness without its peak going over ceilingDb
	V.normalizeGain = function (lufs, peak, target, ceilingDb) {
		if (!isFinite(lufs) || !(peak > 0)) return 1;
		var g = Math.pow(10, (target - lufs) / 20), cap = Math.pow(10, (ceilingDb == null ? -1 : ceilingDb) / 20) / peak;
		return V.clamp(Math.min(g, cap), 0.01, 16);
	};
	V.db = function (g) { return g > 0 ? 20 * Math.log10(g) : -Infinity; };
	V.fromDb = function (d) { return Math.pow(10, d / 20); };
	// planar Float32 channels -> 16-bit PCM WAV (ArrayBuffer); the preview plays noise-removed sound from it at other speeds with the pitch kept
	V.wav16 = function (ch, rate) {
		var n = ch[0].length, k = ch.length, buf = new ArrayBuffer(44 + n * k * 2), dv = new DataView(buf), i, c, o = 44;
		function str(p, s) { for (var j = 0; j < s.length; j++) dv.setUint8(p + j, s.charCodeAt(j)); }
		str(0, "RIFF"); dv.setUint32(4, 36 + n * k * 2, true); str(8, "WAVE"); str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, k, true);
		dv.setUint32(24, rate, true); dv.setUint32(28, rate * k * 2, true); dv.setUint16(32, k * 2, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, n * k * 2, true);
		for (i = 0; i < n; i++) for (c = 0; c < k; c++) { var v = Math.max(-1, Math.min(1, ch[c][i])); dv.setInt16(o, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true); o += 2; }
		return buf;
	};
	// waveform: max |x| per bin -> Uint8Array (0..255)
	V.peaks = function (chs, rate, perSec) {
		var bin = Math.max(1, Math.round(rate / perSec)), n = Math.ceil(chs[0].length / bin), out = new Uint8Array(n);
		for (var b = 0; b < n; b++) { var m = 0; for (var c = 0; c < chs.length; c++) { var x = chs[c]; for (var i = b * bin, e = Math.min(x.length, i + bin); i < e; i++) { var a = x[i] < 0 ? -x[i] : x[i]; if (a > m) m = a; } } out[b] = Math.min(255, Math.round(Math.sqrt(m) * 255)); }
		return out;
	};

	/* ---------- picture ---------- */
	// where a source picture lands on the W x H frame: fitted inside (contain), scaled about its centre, centred at (x, y) as fractions; crop as fractions
	V.place = function (sw, sh, c, W, H) {
		var cr = c.crop || { l: 0, t: 0, r: 0, b: 0 }, sx = sw * cr.l, sy = sh * cr.t, cw = sw * Math.max(0.01, 1 - cr.l - cr.r), ch = sh * Math.max(0.01, 1 - cr.t - cr.b);
		var k = Math.min(W / sw, H / sh) * (c.scale == null ? 1 : c.scale), dw = cw * k, dh = ch * k;
		// the crop keeps the remaining part where it was in the uncropped picture
		var fullW = sw * k, fullH = sh * k, left = (c.x == null ? 0.5 : c.x) * W - fullW / 2 + sx * k, top = (c.y == null ? 0.5 : c.y) * H - fullH / 2 + sy * k;
		return { sx: sx, sy: sy, sw: cw, sh: ch, dx: left, dy: top, dw: dw, dh: dh };
	};
	V.hit = function (r, x, y, pad) { pad = pad || 0; return x >= r.dx - pad && x <= r.dx + r.dw + pad && y >= r.dy - pad && y <= r.dy + r.dh + pad; };
	V.EXPORT_SIZES = [["project", "Same as the project"], ["2160", "4K (2160p)"], ["1440", "1440p"], ["1080", "1080p (Full HD)"], ["720", "720p"], ["480", "480p"]];
	// export size for a preset: the short side becomes the preset, aspect kept, even numbers
	V.exportSize = function (p, preset) {
		var w = p.w, h = p.h;
		if (preset && preset !== "project") { var k = (+preset) / Math.min(w, h); w = w * k; h = h * k; }
		return { w: Math.max(2, Math.round(w / 2) * 2), h: Math.max(2, Math.round(h / 2) * 2) };
	};
	V.QUALITY = { high: 0.14, balanced: 0.09, small: 0.055 };   // bits per pixel per frame
	V.bitrate = function (w, h, fps, q) { var bpp = V.QUALITY[q] || V.QUALITY.balanced; return Math.round(V.clamp(w * h * Math.min(fps, 60) * bpp * (fps > 30 ? 0.75 : 1), 400e3, 80e6)); };
	V.avcCodec = function (w, h, fps) {
		var mbs = Math.ceil(w / 16) * Math.ceil(h / 16), rate = mbs * fps, lv = [[11880, 396, "15"], [40500, 1620, "1e"], [108000, 3600, "1f"], [216000, 5120, "20"], [245760, 8192, "28"], [522240, 8704, "2a"], [589824, 22080, "32"], [983040, 36864, "33"], [2073600, 36864, "34"], [4177920, 139264, "3c"], [8355840, 139264, "3d"], [16711680, 139264, "3e"]];
		for (var j = 0; j < lv.length; j++) if (rate <= lv[j][0] && mbs <= lv[j][1]) return "avc1.6400" + lv[j][2];
		return "avc1.64003e";
	};

	/* ---------- time ---------- */
	V.tc = function (t, fps) {   // 1:02:03;15 style (frames after the semicolon)
		if (!(t >= 0)) t = 0; fps = fps || 30;
		var f = Math.floor(t * fps + 1e-6), fr = f % Math.round(fps), s = Math.floor(f / Math.round(fps)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x + ";" + (fr < 10 ? "0" : "") + fr;
	};
	V.short = function (t) { if (!(t >= 0)) t = 0; var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };
	V.parseTime = function (s, fps) {
		s = String(s || "").trim(); if (!s) return null;
		var fr = 0, m = /;(\d+)$/.exec(s); if (m) { fr = +m[1] / (fps || 30); s = s.slice(0, m.index); }
		var parts = s.split(":").map(Number); if (parts.some(function (x) { return !isFinite(x); })) return null;
		var t = 0; parts.forEach(function (x) { t = t * 60 + x; });
		return t + fr;
	};
	// ruler: a tick every "step" seconds so labels are at least minPx apart
	V.tickStep = function (pps, minPx) {
		var steps = [1 / 30, 1 / 10, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
		for (var j = 0; j < steps.length; j++) if (steps[j] * pps >= (minPx || 70)) return steps[j];
		return 7200;
	};
	V.frameSnap = function (t, fps) { return Math.round(t * fps) / fps; };

	/* ---------- undo ---------- */
	V.History = function (max) { this.max = max || 200; this.stack = []; this.i = -1; };
	V.History.prototype.push = function (s) { if (this.i >= 0 && this.stack[this.i] === s) return; this.stack = this.stack.slice(0, this.i + 1); this.stack.push(s); if (this.stack.length > this.max) this.stack.shift(); this.i = this.stack.length - 1; };
	V.History.prototype.undo = function () { if (this.i <= 0) return null; this.i--; return this.stack[this.i]; };
	V.History.prototype.redo = function () { if (this.i >= this.stack.length - 1) return null; this.i++; return this.stack[this.i]; };
	V.History.prototype.canUndo = function () { return this.i > 0; };
	V.History.prototype.canRedo = function () { return this.i < this.stack.length - 1; };

	if (typeof module !== "undefined" && module.exports) module.exports = V;
	root.MESVed = V;
})(typeof window !== "undefined" ? window : globalThis);
