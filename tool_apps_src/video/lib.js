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
		var d = { speed: 1, vol: 1, mute: false, fin: 0, fout: 0, xin: 0, x: 0.5, y: 0.5, scale: 1, op: 1, crop: { l: 0, t: 0, r: 0, b: 0 }, rot: 0, anims: null, clean: null, lufs: null, link: null, noAudio: false, afx: null };
		for (var k in d) if (c[k] == null) c[k] = typeof d[k] === "object" && d[k] ? JSON.parse(JSON.stringify(d[k])) : d[k];
		if (c.type === "text") { c.text = Object.assign({}, V.TEXT_DEFAULT, c.text || {}); }
		c.anims = V.cleanAnims(c.anims); c.rot = isFinite(+c.rot) ? +c.rot : 0;
		return c;
	};
	// a project read from a file / storage: fill in defaults, drop clips whose track is gone, keep numbers sane
	V.normalize = function (p) {
		if (!p || typeof p !== "object") throw new Error("Not a project.");
		var q = V.newProject(p);
		q.name = String(p.name || q.name).slice(0, 120); q.bg = /^#[0-9a-f]{6}$/i.test(p.bg || "") ? p.bg : "#000000";
		q.w = V.clamp(Math.round(+p.w || 1920), 16, 7680) & ~1; q.h = V.clamp(Math.round(+p.h || 1080), 16, 4320) & ~1; q.fps = V.clamp(+p.fps || 30, 1, 120);
		if (Array.isArray(p.tracks) && p.tracks.length) q.tracks = p.tracks.filter(function (t) { return t && t.id && (t.kind === "v" || t.kind === "a"); }).map(function (t) { var o = { id: String(t.id), kind: t.kind, name: String(t.name || "Track").slice(0, 40), mute: !!t.mute, hide: !!t.hide, lock: !!t.lock, mag: !!t.mag }; if (isFinite(t.h) && t.h > 0) o.h = V.clamp(Math.round(t.h), V.ROW_MIN, V.ROW_MAX); return o; });
		var ids = {}; q.tracks.forEach(function (t) { ids[t.id] = t; });
		q.clips = (Array.isArray(p.clips) ? p.clips : []).filter(function (c) { return c && c.id && ids[c.track] && isFinite(c.start) && isFinite(c.in) && isFinite(c.out) && c.out > c.in; }).map(function (c) { return V.clipDefaults(JSON.parse(JSON.stringify(c))); });
		q.marks = { in: p.marks && isFinite(p.marks.in) ? p.marks.in : null, out: p.marks && isFinite(p.marks.out) ? p.marks.out : null };
		return q;
	};
	V.ROW_MIN = 28; V.ROW_MAX = 420; V.ROW_DEFAULT = { v: 62, a: 84 };
	V.rowH = function (tr) { return tr && tr.h ? V.clamp(tr.h, V.ROW_MIN, V.ROW_MAX) : V.ROW_DEFAULT[tr && tr.kind === "a" ? "a" : "v"]; };
	V.track = function (p, id) { for (var j = 0; j < p.tracks.length; j++) if (p.tracks[j].id === id) return p.tracks[j]; return null; };
	V.clip = function (p, id) { for (var j = 0; j < p.clips.length; j++) if (p.clips[j].id === id) return p.clips[j]; return null; };
	V.kindFor = function (type) { return type === "audio" ? "a" : "v"; };

	/* ---------- clip timing ---------- */
	V.dur = function (c) { return (c.out - c.in) / (c.speed || 1); };
	V.end = function (c) { return c.start + V.dur(c); };
	V.srcAt = function (c, t) { return c.in + (t - c.start) * (c.speed || 1); };   // source time shown at timeline time t (before start = cross-fade pre-roll)
	V.timeAtSrc = function (c, s) { return c.start + (s - c.in) / (c.speed || 1); };
	// where in its file a clip begins and ends (the "source times"), e.g. after splitting a long recording into parts
	V.hasSource = function (c) { return !!c && (c.type === "video" || c.type === "audio"); };
	V.srcText = function (c, fps) { return V.tc(c.in, fps) + " \u2013 " + V.tc(c.out, fps); };
	// media folder (a folder inside OneDrive / Dropbox / Google Drive / iCloud that its desktop app syncs): which media files are in it
	V.MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|flv|mpg|mpeg|ts|mts|m2ts|3gp|ogv|mp3|wav|m4a|aac|ogg|oga|opus|flac|wma|aif|aiff|png|jpe?g|gif|webp|bmp|avif|heic)$/i;
	V.folderIndex = function (files) {   // [{name, size, path}] -> {n: count, by: {lower-case name: [entries]}}
		var by = {}; (files || []).forEach(function (f) { var k = String(f.name || "").toLowerCase(); (by[k] = by[k] || []).push(f); });
		return { n: (files || []).length, by: by };
	};
	// "in" = the same file is in the folder (same name and size, or the original of a converted file); "differs" = a file of that
	// name with another size; "out" = not in the folder; "found" = missing here but in the folder (can be relinked)
	V.mediaPlace = function (m, idx) {
		if (!idx || !m || m.kind === "text") return { s: "none" };
		var a = idx.by[String(m.name || "").toLowerCase()] || [], o = m.origName ? idx.by[String(m.origName).toLowerCase()] || [] : [];
		if (m.state === "missing") { var hit = a.concat(o).filter(function (e) { return !m.size || e.size === m.size; })[0] || o[0] || a[0]; return hit ? { s: "found", e: hit } : { s: "out" }; }
		var same = a.filter(function (e) { return e.size === m.size; })[0] || o[0];
		if (same) return { s: "in", e: same };
		if (a.length) return { s: "differs", e: a[0] };
		return { s: "out" };
	};
	V.mediaSyncSummary = function (bin, idx) {
		var r = { in: 0, out: [], differs: [], found: [], total: 0 };
		(bin || []).forEach(function (m) { var pl = V.mediaPlace(m, idx); if (pl.s === "none") return; r.total++; if (pl.s === "in") r.in++; else r[pl.s].push(m); });
		return r;
	};
	V.sourceList = function (p, nameOf) {   // one line per video / sound clip, in timeline order: "name: 1:23;10 - 4:56;00 (length 3:33;00)"
		return p.clips.filter(V.hasSource).slice().sort(function (a, b) { return a.start - b.start || String(a.track).localeCompare(String(b.track)); }).map(function (c) {
			return (nameOf ? nameOf(c) + ": " : "") + V.srcText(c, p.fps) + " (at " + V.tc(c.start, p.fps) + " on the timeline, length " + V.tc(c.out - c.in, p.fps) + ")";
		});
	};
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
		if (c.anims && c.anims.length) { var sa = V.splitAnims(c, t - c.start); L.anims = sa.left; V.setBase(R, sa.base); R.anims = sa.right; }
		return [L, R];
	};
	// drag an edge: edge "l" moves the start (and the in point), "r" the end. t = wanted timeline time of that edge.
	// lim = { mediaDur (Infinity for stills / titles), lo, hi (neighbours on the track), minDur }
	V.trim = function (c, edge, t, lim) {
		var sp = c.speed || 1, min = lim.minDur || 1 / 30, still = !(lim.mediaDur < Infinity), o = { start: c.start, in: c.in, out: c.out };
		if (edge === "l" && lim.mag) {
			// magnetic track (Camtasia): the clip keeps its place and its left edge brings back (or hides) the start of its media; the
			// track is packed afterwards, so the clips after it move along. t = where the pointer asks the edge to be.
			var grow = c.start - t;
			if (still) o.out = Math.max(min * sp, c.out + grow * sp);
			else o.in = V.clamp(c.in - grow * sp, 0, c.out - min * sp);
			if (c.anims && c.anims.length) o.anims = V.shiftAnims(c.anims, still ? (o.out - c.out) / sp : (c.in - o.in) / sp);
			return o;
		}
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
		// animations keep their place on the timeline (they belong to the picture), so a left trim shifts them inside the clip
		if (c.anims && c.anims.length) o.anims = V.shiftAnims(c.anims, c.start - o.start);
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
			if (s < a) { var L = JSON.parse(JSON.stringify(c)); L.out = V.srcAt(c, a); L.fout = 0; if (c.type === "text" || c.type === "image") { L.in = 0; L.out = (a - s) * (c.speed || 1); } if (c.anims && c.anims.length) L.anims = V.splitAnims(c, a - s).left; out.push(L); }
			if (e > b) { var R = JSON.parse(JSON.stringify(c)); R.id = newId ? newId() : c.id + "r"; R.in = V.srcAt(c, b); R.start = a; R.fin = 0; R.xin = 0; if (c.type === "text" || c.type === "image") { R.in = 0; R.out = (e - b) * (c.speed || 1); } if (s >= a) R.id = c.id; if (c.anims && c.anims.length) { var sr = V.splitAnims(c, b - s); V.setBase(R, sr.base); R.anims = sr.right; } out.push(R); }
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
				var pos = V.posAt(c, t), a = V.envelope(c, t) * pos.op; if (a <= 0.001) continue;
				out.push({ clip: c, src: Math.max(0, V.srcAt(c, t)), alpha: Math.min(1, a), pos: pos });
			}
		}
		return out;
	};
	// gain of a clip's sound at t (volume x fades x cross-fades in and out); 0 when silent
	V.gainAt = function (p, c, t) {
		var tr = V.track(p, c.track); if (!tr || tr.mute || c.mute) return 0;
		if ((c.type !== "audio" && c.type !== "video") || c.noAudio) return 0;
		var g = V.envelope(c, t) * (c.vol == null ? 1 : c.vol);
		var nx = V.nextTouching(p, c);
		if (nx && nx.xin > 0) { var e = V.end(c); if (t > e - nx.xin) g *= V.clamp((e - t) / nx.xin, 0, 1); }
		return g;
	};
	V.audibleAt = function (p, t, hasAudio) {
		return p.clips.filter(function (c) { return (c.type === "audio" || c.type === "video") && (!hasAudio || hasAudio(c)) && V.active(c, t) && V.gainAt(p, c, t) > 0; });
	};
	// gain for n output samples at rate starting at t0 (one value per sample)
	// extra(t) (optional) = a further gain at timeline time t (the clip's audio effects: leveler, compressor, ducking)
	V.gainCurve = function (p, c, t0, n, rate, extra) {
		var g = new Float32Array(n), step = Math.max(1, Math.floor(rate / 400));   // envelope sampled every 2.5 ms and held: smooth enough, cheap
		for (var i = 0; i < n; i += step) { var tt = t0 + i / rate, v = V.gainAt(p, c, tt); if (v > 0 && extra) v *= extra(tt); for (var k = i; k < Math.min(n, i + step); k++) g[k] = v; }
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


	/* ---------- animations (Camtasia-style: each one moves the clip from where it is to new values over a stretch of time) ---------- */
	// an animation: { id, t (start, seconds after the clip's start), d (length), ease, to: {props at its end}, from: {props at its start, optional},
	// kind (the preset it came from, for its name) }. Props: x, y (centre as a share of the frame), scale, rot (degrees), op (0..1), cl ct cr cb (crop).
	// The state before the first animation is the clip's own values; after an animation its "to" values hold. "from" values only apply while it
	// runs (a slide in starts off the frame and ends where the clip is). Preview and export both draw through posAt, so they always agree.
	V.ANIM_PROPS = ["x", "y", "scale", "rot", "op", "cl", "ct", "cr", "cb"];
	V.EASES = [["inout", "Smooth (ease in and out)"], ["linear", "Linear (steady)"], ["out", "Ease out (slows down at the end)"], ["in", "Ease in (speeds up)"], ["back", "Overshoot (bounces past, then settles)"]];
	V.ease = function (name, u) {
		u = V.clamp(u, 0, 1);
		switch (name) {
			case "linear": return u;
			case "in": return u * u * u;
			case "out": return 1 - Math.pow(1 - u, 3);
			case "back": var k = 1.70158, v = u - 1; return 1 + (k + 1) * v * v * v + k * v * v;
			default: return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
		}
	};
	function num(x, d) { x = +x; return isFinite(x) ? x : d; }
	function cleanProps(o) {
		if (!o || typeof o !== "object") return null;
		var r = {}, any = false;
		V.ANIM_PROPS.forEach(function (k) {
			if (o[k] == null || !isFinite(+o[k])) return;
			var v = +o[k];
			if (k === "scale") v = V.clamp(v, 0.01, 40); else if (k === "op") v = V.clamp(v, 0, 1); else if (k.length === 2 && k[0] === "c") v = V.clamp(v, 0, 0.95); else if (k === "rot") v = V.clamp(v, -36000, 36000); else v = V.clamp(v, -20, 20);
			r[k] = v; any = true;
		});
		return any ? r : null;
	}
	// animations read from a file / storage: keep only sane ones, sorted by start
	V.cleanAnims = function (arr) {
		if (!Array.isArray(arr) || !arr.length) return null;
		var out = arr.filter(function (a) { return a && typeof a === "object"; }).map(function (a) {
			var o = { id: String(a.id || V.uid("a")).slice(0, 40), t: num(a.t, 0), d: V.clamp(num(a.d, 1), 0.02, 3600), ease: V.EASES.some(function (e) { return e[0] === a.ease; }) ? a.ease : "inout", kind: String(a.kind || "custom").slice(0, 20) };
			var to = cleanProps(a.to), from = cleanProps(a.from); if (to) o.to = to; if (from) o.from = from;
			return o;
		}).filter(function (a) { return a.to || a.from; });
		out.sort(function (x, y) { return x.t - y.t; });
		return out.length ? out : null;
	};
	// the clip's own (un-animated) values
	V.baseState = function (c) {
		var cr = c.crop || {};
		return { x: c.x == null ? 0.5 : c.x, y: c.y == null ? 0.5 : c.y, scale: c.scale == null ? 1 : c.scale, rot: c.rot || 0, op: c.op == null ? 1 : c.op, cl: cr.l || 0, ct: cr.t || 0, cr: cr.r || 0, cb: cr.b || 0 };
	};
	V.setBase = function (c, s) { c.x = s.x; c.y = s.y; c.scale = s.scale; c.rot = s.rot; c.op = s.op; c.crop = { l: s.cl, t: s.ct, r: s.cr, b: s.cb }; return c; };
	function sortedAnims(c) { return (c.anims || []).slice().sort(function (a, b) { return a.t - b.t; }); }
	function lerpState(s, a, u) {
		var f = Object.assign({}, s, a.from || {}), g = Object.assign({}, s, a.to || {}), o = {};
		V.ANIM_PROPS.forEach(function (k) { o[k] = f[k] + (g[k] - f[k]) * u; });
		return o;
	}
	// state at rel seconds after the clip's start (flat props)
	V.stateAt = function (c, rel) {
		var s = V.baseState(c), L = sortedAnims(c);
		for (var j = 0; j < L.length; j++) {
			var a = L[j];
			if (rel >= a.t + a.d - EPS) { if (a.to) s = Object.assign(s, a.to); continue; }
			if (rel < a.t) break;
			s = lerpState(s, a, V.ease(a.ease, (rel - a.t) / a.d));
		}
		return s;
	};
	// what the compositor needs at timeline time t: { x, y, scale, rot, op, crop }
	V.posAt = function (c, t) {
		var s = c.anims && c.anims.length ? V.stateAt(c, t - c.start) : V.baseState(c);
		return { x: s.x, y: s.y, scale: s.scale, rot: s.rot, op: s.op, crop: { l: s.cl, t: s.ct, r: s.cr, b: s.cb } };
	};
	// the animation running at rel (strictly inside it, more than tol from both ends), or null
	V.animRunning = function (c, rel, tol) {
		tol = tol == null ? 1e-3 : tol; var L = c.anims || [];
		for (var j = 0; j < L.length; j++) if (rel > L[j].t + tol && rel < L[j].t + L[j].d - tol) return L[j];
		return null;
	};
	// who decides prop k at rel: the last animation that has ended by then and sets k in its "to" (edit that one's end value), else the clip itself
	V.propOwner = function (c, rel, k, tol) {
		tol = tol == null ? 1e-3 : tol; var L = sortedAnims(c), own = null;
		L.forEach(function (a) { if (a.t + a.d <= rel + tol && a.to && a.to[k] != null) { if (!own || a.t + a.d >= own.t + own.d) own = a; } });
		return own;
	};
	// set prop k to v as seen at rel: on the animation that decides it there, else on the clip (moving text at an animation's end moves that keyframe)
	// the animation that ends at rel (within tol), the latest-starting one when several do
	V.animEndingAt = function (c, rel, tol) {
		tol = tol == null ? 1e-3 : tol; var best = null;
		(c.anims || []).forEach(function (a) { if (Math.abs(a.t + a.d - rel) <= tol && (!best || a.t > best.t)) best = a; });
		return best;
	};
	// with the playhead at an animation's end, a change goes into that animation's end values (adding the prop if it had none: Camtasia's
	// "move it at the end of the arrow"); elsewhere it goes to whoever decides the value there
	V.setPropAt = function (c, rel, k, v, tol) {
		var e = V.animEndingAt(c, rel, tol); if (e) { e.to = e.to || {}; e.to[k] = v; return e; }
		var a = V.propOwner(c, rel, k, tol);
		if (a) { a.to[k] = v; return a; }
		var b = V.baseState(c); b[k] = v; V.setBase(c, b); return null;
	};
	// shift all animations by dt (seconds inside the clip)
	V.shiftAnims = function (anims, dt) { return (anims || []).map(function (a) { var o = JSON.parse(JSON.stringify(a)); o.t = Math.round((o.t + dt) * 1e6) / 1e6; return o; }); };
	// cut a clip's animations at rel: left = those starting before it, right = those still going (times from the cut; a running one keeps a
	// negative start so it carries on exactly), base = the right half's own values (everything that had ended by then)
	V.splitAnims = function (c, rel) {
		var L = sortedAnims(c), b = V.baseState(c), left = [], right = [];
		L.forEach(function (a) {
			if (a.t < rel - EPS) left.push(JSON.parse(JSON.stringify(a)));
			if (a.t + a.d <= rel + EPS) { if (a.to) Object.assign(b, a.to); }
			else { var o = JSON.parse(JSON.stringify(a)); o.t = Math.round((a.t - rel) * 1e6) / 1e6; right.push(o); }
		});
		return { left: left.length ? left : null, right: right.length ? right : null, base: b };
	};
	// zoom-n-pan: the values that make the frame show rect (frame pixels, as it looks with state s) filling the W x H frame
	V.zoomToRect = function (s, rect, W, H) {
		var z = Math.min(W / Math.max(1, rect.w), H / Math.max(1, rect.h)), rx = rect.x + rect.w / 2, ry = rect.y + rect.h / 2;
		return { x: (W / 2 + (s.x * W - rx) * z) / W, y: (H / 2 + (s.y * H - ry) * z) / H, scale: V.clamp(s.scale * z, 0.01, 40) };
	};
	// a rectangle of the frame's shape centred at (cx, cy), w wide, kept inside the frame where it fits
	V.frameRect = function (cx, cy, w, W, H) { w = V.clamp(w, 8, W); var h = w * H / W, x = V.clamp(cx - w / 2, 0, W - w), y = V.clamp(cy - h / 2, 0, H - h); return { x: x, y: y, w: w, h: h }; };
	V.ANIM_PRESETS = [
		{ id: "zoomin", name: "Zoom in", desc: "1.5× bigger", at: "here" }, { id: "zoomout", name: "Zoom out", desc: "Back to the full frame", at: "here" },
		{ id: "zoompan", name: "Zoom-n-pan", desc: "Draw a box on the preview", at: "here", rect: true },
		{ id: "slidein-l", name: "Slide in", desc: "From the left", at: "start" }, { id: "slidein-r", name: "Slide in", desc: "From the right", at: "start" },
		{ id: "slidein-b", name: "Slide in", desc: "From below", at: "start" }, { id: "slideout-l", name: "Slide out", desc: "To the left", at: "end" },
		{ id: "slideout-r", name: "Slide out", desc: "To the right", at: "end" }, { id: "fadein", name: "Fade in", desc: "From see-through", at: "start" },
		{ id: "fadeout", name: "Fade out", desc: "To see-through", at: "end" }, { id: "scaleup", name: "Scale up", desc: "1.25× bigger", at: "here" },
		{ id: "scaledown", name: "Scale down", desc: "0.8× smaller", at: "here" }, { id: "popin", name: "Pop in", desc: "Grows from nothing", at: "start" },
		{ id: "spin", name: "Spin", desc: "One full turn", at: "here" }, { id: "tilt", name: "Tilt", desc: "Turn 10°", at: "here" },
		{ id: "custom", name: "Custom", desc: "Then move it in the preview", at: "here" }
	];
	V.animPreset = function (id) { for (var j = 0; j < V.ANIM_PRESETS.length; j++) if (V.ANIM_PRESETS[j].id === id) return V.ANIM_PRESETS[j]; return null; };
	// make the animation for a preset: s = the clip's state where it starts, box = { w, h } of the clip on the frame (frame pixels), W x H frame,
	// o = { rect (zoom-n-pan) }. -> { to, from } (either may be missing)
	V.animValues = function (id, s, box, W, H, o) {
		o = o || {}; var bw = box ? box.w : W, bh = box ? box.h : H;
		switch (id) {
			case "zoomin": return { to: { scale: s.scale * 1.5 } };
			case "zoomout": return { to: { x: 0.5, y: 0.5, scale: 1, rot: 0 } };
			case "zoompan": return o.rect ? { to: V.zoomToRect(s, o.rect, W, H) } : null;
			case "scaleup": return { to: { scale: s.scale * 1.25 } };
			case "scaledown": return { to: { scale: s.scale * 0.8 } };
			case "slidein-l": return { from: { x: -(bw / 2) / W - 0.01 } };
			case "slidein-r": return { from: { x: 1 + (bw / 2) / W + 0.01 } };
			case "slidein-b": return { from: { y: 1 + (bh / 2) / H + 0.01 } };
			case "slideout-l": return { to: { x: -(bw / 2) / W - 0.01 } };
			case "slideout-r": return { to: { x: 1 + (bw / 2) / W + 0.01 } };
			case "fadein": return { from: { op: 0 } };
			case "fadeout": return { to: { op: 0 } };
			case "popin": return { from: { scale: Math.max(0.01, s.scale * 0.02), op: 0 } };
			case "spin": return { to: { rot: s.rot + 360 } };
			case "tilt": return { to: { rot: s.rot + 10 } };
			default: return { to: { x: s.x, y: s.y, scale: s.scale, rot: s.rot, op: s.op } };
		}
	};
	// where a new animation of length d goes inside a clip of length len: "start", "end", or at rel ("here"), kept inside the clip
	V.animSlot = function (at, rel, d, len) { d = Math.min(d, Math.max(0.05, len)); var t = at === "start" ? 0 : at === "end" ? len - d : V.clamp(rel, 0, Math.max(0, len - d)); return { t: Math.round(t * 1e6) / 1e6, d: d }; };
	V.animName = function (a) { var p = V.animPreset(a.kind); return p ? p.name + (/^slide/.test(p.id) ? " " + p.desc.toLowerCase() : "") : "Animation"; };

	/* ---------- preview view: zoom and pan of the canvas inside the stage ---------- */
	// fit the W x H frame into a cw x ch stage with margin pixels around it -> { k (stage px per frame px), ox, oy (frame origin) }
	V.viewFit = function (cw, ch, W, H, margin) {
		margin = margin == null ? 12 : margin; var k = Math.max(1e-4, Math.min((cw - 2 * margin) / W, (ch - 2 * margin) / H));
		return { k: k, ox: (cw - W * k) / 2, oy: (ch - H * k) / 2 };
	};
	// zoom to k2 keeping the stage point (px, py) over the same frame point
	V.viewZoomAt = function (v, k2, px, py) { var fx = (px - v.ox) / v.k, fy = (py - v.oy) / v.k; return { k: k2, ox: px - fx * k2, oy: py - fy * k2 }; };
	V.ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
	// rotate point (x, y) by deg degrees about (cx, cy)
	V.rotPt = function (x, y, cx, cy, deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }; };

	/* ---------- magnetic tracks (clips close up to the left, no gaps) ---------- */
	// lay the clips of one track end to end from 0, in their current order (by start; ties keep array order)
	V.pack = function (p, trackId) {
		var t = 0; V.onTrack(p, trackId).forEach(function (c) { c.start = t; t = V.end(c); });
		return p;
	};
	// put clip id on a magnetic track at the place nearest "want": the others are packed as if it were not there, it goes before the first
	// clip whose middle is after its own middle, then the track is packed again
	V.magnetInsert = function (p, trackId, id, want) {
		var c = V.clip(p, id); if (!c) return p;
		c.track = trackId;
		var ign = {}; ign[id] = 1;
		var others = V.onTrack(p, trackId, ign), t = 0, d = V.dur(c), mid = want + d / 2, k = others.length;
		others.forEach(function (o) { o.start = t; t = V.end(o); });
		for (var j = 0; j < others.length; j++) if (others[j].start + V.dur(others[j]) / 2 >= mid) { k = j; break; }
		var order = others.slice(0, k).concat([c], others.slice(k)); t = 0;
		order.forEach(function (o) { o.start = t; t = V.end(o); });
		return p;
	};
	// pack every magnetic track, then let linked partners follow (called on every edit)
	V.applyMagnets = function (p) {
		p.tracks.forEach(function (tr) { if (tr.mag) V.pack(p, tr.id); });
		V.syncLinks(p);
		return p;
	};

	/* ---------- linked clips (a video and its separated sound) ---------- */
	V.partners = function (p, c) { return c && c.link ? p.clips.filter(function (x) { return x !== c && x.link === c.link; }) : []; };
	// ids plus the ids of every clip linked to them
	V.withLinks = function (p, ids) {
		var set = {}, links = {}; ids.forEach(function (i) { set[i] = 1; var c = V.clip(p, i); if (c && c.link) links[c.link] = 1; });
		p.clips.forEach(function (c) { if (c.link && links[c.link]) set[c.id] = 1; });
		return Object.keys(set);
	};
	// partners keep the leader's timing: the leader is the video clip (else the first); a partner on a magnetic track is left where the track put it
	V.syncLinks = function (p) {
		var groups = {};
		p.clips.forEach(function (c) { if (c.link) (groups[c.link] = groups[c.link] || []).push(c); });
		Object.keys(groups).forEach(function (k) {
			var g = groups[k]; if (g.length < 2) { g[0].link = null; return; }
			var lead = g.filter(function (c) { return c.type === "video"; })[0] || g[0];
			g.forEach(function (c) {
				if (c === lead) return; var tr = V.track(p, c.track); if (tr && tr.mag && !(V.track(p, lead.track) || {}).mag) return;
				c.start = lead.start; c.in = lead.in; c.out = lead.out; c.speed = lead.speed; c.xin = lead.xin || 0;
			});
		});
		return p;
	};
	// "Separate video and audio": the video's sound becomes its own clip on an audio track (one where it fits, else makeTrack()), linked to it
	V.separateAudio = function (p, id, newId, linkId, makeTrack) {
		var c = V.clip(p, id); if (!c || c.type !== "video" || c.noAudio) return null;
		var d = V.dur(c), tr = null, as = p.tracks.filter(function (t) { return t.kind === "a" && !t.lock; });
		for (var j = 0; j < as.length; j++) if (as[j].mag ? !V.onTrack(p, as[j].id).length : V.canPlace(p, as[j].id, c.start, d)) { tr = as[j]; break; }
		if (!tr) tr = makeTrack ? makeTrack() : null; if (!tr) return null;
		var a = V.clipDefaults({ id: newId, type: "audio", media: c.media, track: tr.id, start: c.start, in: c.in, out: c.out, speed: c.speed, vol: c.vol, mute: c.mute, fin: c.fin, fout: c.fout, xin: c.xin,
			clean: c.clean ? JSON.parse(JSON.stringify(c.clean)) : null, lufs: c.lufs, afx: c.afx ? JSON.parse(JSON.stringify(c.afx)) : null, link: linkId });
		c.link = linkId; c.noAudio = true; c.clean = null; c.afx = null; c.lufs = null;
		p.clips.push(a);
		return a;
	};
	// put the sound back into the video clip (the separated audio clips of the group are removed)
	V.joinAudio = function (p, id) {
		var c = V.clip(p, id); if (!c) return null;
		var g = [c].concat(V.partners(p, c)), v = g.filter(function (x) { return x.type === "video"; })[0], a = g.filter(function (x) { return x.type === "audio" && x.media === (v && v.media); })[0];
		if (!v) return null;
		if (a) { v.vol = a.vol; v.mute = a.mute; v.clean = a.clean; v.afx = a.afx; v.lufs = a.lufs; p.clips = p.clips.filter(function (x) { return x !== a; }); }
		v.noAudio = false; if (!V.partners(p, v).length) v.link = null;
		return v;
	};
	V.unlink = function (p, id) { var c = V.clip(p, id); if (!c || !c.link) return p; var k = c.link; p.clips.forEach(function (x) { if (x.link === k) x.link = null; }); return p; };
	// split clips ids (and their partners) at t; a split pair gets a new link for its right halves. -> ids of the right halves
	V.splitAt = function (p, ids, t, newId, minDur) {
		var all = V.withLinks(p, ids), right = [], relink = {};
		all.forEach(function (id) {
			var c = V.clip(p, id); if (!c) return;
			var r = V.split(c, t, newId(), minDur); if (!r) return;
			if (c.link) { relink[c.link] = relink[c.link] || newId(); r[1].link = relink[c.link]; }
			p.clips.splice(p.clips.indexOf(c), 1, r[0], r[1]); right.push(r[1].id);
		});
		return right;
	};

	/* ---------- audio effects (non-destructive: a gain envelope worked out from the clip's own sound) ---------- */
	V.AFX_DEFAULT = {
		level: { on: false, target: -20, maxUp: 12, maxDown: 12, win: 3, gate: -50 },   // leveler: brings the loudness over a few seconds to the target (dBFS RMS)
		comp: { on: false, thr: -24, ratio: 3, knee: 6, att: 0.01, rel: 0.2, makeup: null },   // compressor (makeup null = automatic)
		duck: { on: false, amt: 12, gate: -45 }   // ducking: this clip is lowered while other clips have sound (music under a voice)
	};
	V.afxOf = function (c) {
		var a = (c && c.afx) || {}, o = {};
		Object.keys(V.AFX_DEFAULT).forEach(function (k) { o[k] = Object.assign({}, V.AFX_DEFAULT[k], a[k] || {}); });
		return o;
	};
	V.afxOn = function (c) { var a = c && c.afx; return !!(a && ((a.level && a.level.on) || (a.comp && a.comp.on) || (a.duck && a.duck.on))); };
	// streaming level meter: RMS and peak (dBFS) of every hop-second block of the (summed) channels
	V.LevelMeter = function (rate, hop) { this.rate = rate; this.hop = hop || 0.01; this.n = Math.max(1, Math.round(rate * this.hop)); this.acc = 0; this.pk = 0; this.cnt = 0; this.rms = []; this.peak = []; };
	V.LevelMeter.prototype.push = function (chs) {
		var nc = chs.length, len = chs[0].length;
		for (var i = 0; i < len; i++) {
			var e = 0, m = 0; for (var c = 0; c < nc; c++) { var x = chs[c][i]; e += x * x; if (x > m) m = x; else if (-x > m) m = -x; }
			this.acc += e / nc; if (m > this.pk) this.pk = m;
			if (++this.cnt === this.n) { this.rms.push(V.db(Math.sqrt(this.acc / this.n))); this.peak.push(V.db(this.pk)); this.acc = 0; this.pk = 0; this.cnt = 0; }
		}
	};
	V.LevelMeter.prototype.result = function (start) {
		var f = function (a) { var o = new Float32Array(a.length); for (var i = 0; i < a.length; i++) o[i] = isFinite(a[i]) ? Math.max(-120, a[i]) : -120; return o; };
		return { start: start || 0, hop: this.hop, rms: f(this.rms), peak: f(this.peak) };
	};
	V.levels = function (chs, rate, hop, start) { var m = new V.LevelMeter(rate, hop); m.push(chs); return m.result(start); };
	// compressor gain change (dB, <= 0) for an input level x (dB): threshold T, ratio R, soft knee W dB
	V.compStatic = function (x, T, R, W) {
		var s = 1 / R - 1, d = x - T; W = W || 0;
		if (2 * d < -W) return 0;
		if (W > 0 && 2 * Math.abs(d) <= W) return s * (d + W / 2) * (d + W / 2) / (2 * W);
		return s * d;
	};
	// automatic make-up gain: what the compressor takes off a sound at the reference level (the leveler's target, else -18 dBFS, a usual
	// speech level), so the average loudness stays about where it was and only the peaks come down
	V.compMakeup = function (o, ref) { return o.makeup != null && isFinite(o.makeup) ? o.makeup : -V.compStatic(ref == null ? -18 : ref, o.thr, o.ratio, o.knee); };
	// gain (dB) per block: static curve on the block level, smoothed with attack (gain going down) and release (gain coming back)
	V.compGain = function (lv, o, hop) {
		var n = lv.length, out = new Float32Array(n), aA = Math.exp(-hop / Math.max(1e-4, o.att)), aR = Math.exp(-hop / Math.max(1e-4, o.rel)), g = 0;
		for (var i = 0; i < n; i++) { var want = V.compStatic(lv[i], o.thr, o.ratio, o.knee), a = want < g ? aA : aR; g = a * g + (1 - a) * want; out[i] = g; }
		return out;
	};
	// leveler gain (dB) per block: target minus the loudness of the blocks above the gate within +-win/2 s (centred, so it looks ahead);
	// in silence the gain is held; then smoothed both ways (no lag) and limited to -maxDown..+maxUp
	V.levelGain = function (rms, o, hop) {
		var n = rms.length, E = new Float64Array(n + 1), N = new Float64Array(n + 1), w = Math.max(1, Math.round(o.win / 2 / hop)), raw = new Float32Array(n), last = 0, i;
		for (i = 0; i < n; i++) { var on = rms[i] > o.gate; E[i + 1] = E[i] + (on ? Math.pow(10, rms[i] / 10) : 0); N[i + 1] = N[i] + (on ? 1 : 0); }
		var have = false;
		for (i = 0; i < n; i++) {
			var a = Math.max(0, i - w), b = Math.min(n, i + w + 1), cnt = N[b] - N[a];
			if (cnt >= Math.max(1, 0.1 * (b - a))) { var L = 10 * Math.log10((E[b] - E[a]) / cnt); last = V.clamp(o.target - L, -o.maxDown, o.maxUp); if (!have) { for (var k = 0; k < i; k++) raw[k] = last; have = true; } }
			raw[i] = last;
		}
		var al = Math.exp(-hop / 0.25), y = 0;
		for (i = 0; i < n; i++) { y = i ? al * y + (1 - al) * raw[i] : raw[i]; raw[i] = y; }
		for (i = n - 1; i >= 0; i--) { y = i < n - 1 ? al * y + (1 - al) * raw[i] : raw[i]; raw[i] = y; }
		return raw;
	};
	// the whole envelope of a clip: { start, hop, g: linear gain per block } (leveler first, then the compressor on the levelled sound)
	V.fxEnvelope = function (lev, afx) {
		var n = lev.rms.length, tot = new Float32Array(n), A = afx, i;
		var lg = A.level && A.level.on ? V.levelGain(lev.rms, A.level, lev.hop) : null;
		if (A.comp && A.comp.on) {
			var x = new Float32Array(n); for (i = 0; i < n; i++) x[i] = lev.rms[i] + (lg ? lg[i] : 0);
			var cg = V.compGain(x, A.comp, lev.hop), mk = V.compMakeup(A.comp, A.level && A.level.on ? A.level.target : -18);
			for (i = 0; i < n; i++) tot[i] = (lg ? lg[i] : 0) + cg[i] + mk;
		} else if (lg) tot.set(lg);
		var g = new Float32Array(n); for (i = 0; i < n; i++) g[i] = Math.pow(10, Math.min(24, tot[i]) / 20);
		return { start: lev.start, hop: lev.hop, g: g };
	};
	// envelope value at source time s (linear between blocks; outside it the nearest end)
	V.envAt = function (env, s) {
		var g = env.g, n = g.length; if (!n) return 1;
		var x = (s - env.start) / env.hop - 0.5, k = Math.floor(x);
		if (k < 0) return g[0]; if (k >= n - 1) return g[n - 1];
		var f = x - k; return g[k] + (g[k + 1] - g[k]) * f;
	};
	// share (0..1) of the blocks within +-hw seconds of s that are above gate, doubled and capped: a smooth "is someone talking" signal
	V.activePrefix = function (lev, gate) { var r = lev.rms, a = new Uint32Array(r.length + 1); for (var i = 0; i < r.length; i++) a[i + 1] = a[i] + (r[i] > gate ? 1 : 0); return a; };
	V.presenceAt = function (lev, pre, s, hw) {
		var n = lev.rms.length, a = Math.max(0, Math.floor((s - hw - lev.start) / lev.hop)), b = Math.min(n, Math.ceil((s + hw - lev.start) / lev.hop));
		if (b <= a) return 0;
		return Math.min(1, 2 * (pre[b] - pre[a]) / (b - a));
	};

	/* ---------- waveform data ---------- */
	// levels stored as bytes: 0 = -96 dBFS or less, 255 = 0 dBFS (0.38 dB steps)
	V.encDb = function (a) { var d = V.db(a); return !isFinite(d) || d <= -96 ? 0 : Math.min(255, Math.round((d + 96) / 96 * 255)); };
	V.decDb = function (b) { return b <= 0 ? -Infinity : b / 255 * 96 - 96; };
	// peak and RMS per bin (perSec bins a second) -> { pk, rms, r } byte arrays (encDb). Bin edges are worked out from the exact sample
	// rate, so 44.1 kHz at 200 a second (220.5 samples) never drifts when 10 s windows are joined end to end
	V.WAVE_RATE = 200;
	V.wave = function (chs, rate, perSec) {
		perSec = perSec || V.WAVE_RATE;
		var len = chs[0].length, n = Math.max(1, Math.round(len * perSec / rate)), pk = new Uint8Array(n), rm = new Uint8Array(n), step = rate / perSec;
		for (var b = 0; b < n; b++) {
			var m = 0, e = 0, cnt = 0, i0 = Math.floor(b * step), i1 = Math.min(len, Math.max(i0 + 1, Math.floor((b + 1) * step)));
			for (var c = 0; c < chs.length; c++) { var x = chs[c]; for (var i = i0; i < i1; i++) { var v = x[i]; e += v * v; cnt++; if (v > m) m = v; else if (-v > m) m = -v; } }
			pk[b] = V.encDb(m); rm[b] = V.encDb(cnt ? Math.sqrt(e / cnt) : 0);
		}
		return { pk: pk, rms: rm, r: perSec };
	};
	// height (0..1) a level (dB) is drawn at: "db" = a -54..0 dB scale (quiet parts visible), "lin" = amplitude
	V.waveY = function (db, mode) {
		if (!isFinite(db)) return 0;
		if (mode === "lin") return V.clamp(Math.pow(10, db / 20), 0, 1);
		return V.clamp((db + 54) / 54, 0, 1);
	};

	/* ---------- canvas size ---------- */
	// [value, name, group]: the canvas size menu groups them
	V.CANVAS_PRESETS = [["854x480", "480p (854×480)", "16:9"], ["1280x720", "720p (1280×720)", "16:9"], ["1920x1080", "1080p Full HD (1920×1080)", "16:9"], ["2560x1440", "1440p (2560×1440)", "16:9"], ["3840x2160", "4K (3840×2160)", "16:9"],
		["1080x1920", "Vertical 9:16, 1080×1920 (Shorts, Reels, TikTok)", "Vertical and square"], ["720x1280", "Vertical 9:16, 720×1280", "Vertical and square"], ["1080x1080", "Square 1080×1080", "Vertical and square"], ["1080x1350", "Portrait 4:5, 1080×1350", "Vertical and square"],
		["640x480", "4:3, 640×480", "4:3"], ["1440x1080", "4:3, 1440×1080", "4:3"]];
	V.presetOf = function (w, h) { var k = w + "x" + h; for (var j = 0; j < V.CANVAS_PRESETS.length; j++) if (V.CANVAS_PRESETS[j][0] === k) return k; return "custom"; };
	// "1280x720", "1280 × 720", "1280,720" -> { w, h } (even, 16..7680 x 16..4320) or null
	V.parseSize = function (s) {
		var m = /^\s*(\d{2,5})\s*[x×*,: ]\s*(\d{2,5})\s*$/i.exec(String(s || "")); if (!m) return null;
		var w = +m[1], h = +m[2]; if (w < 16 || h < 16 || w > 7680 || h > 4320) return null;
		return { w: Math.round(w / 2) * 2, h: Math.round(h / 2) * 2 };
	};

	/* ---------- time ---------- */
	V.tc = function (t, fps) {   // 1:02:03;15 style (frames after the semicolon)
		if (!(t >= 0)) t = 0; fps = fps || 30;
		var f = Math.floor(t * fps + 1e-6), fr = f % Math.round(fps), s = Math.floor(f / Math.round(fps)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
		return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x + ";" + (fr < 10 ? "0" : "") + fr;
	};
	/* preview playback speed (preview only, never the export): from 1 source frame per second (1 / fps) up to 45x */
	V.SPEED_MAX = 45;
	V.speedMin = function (fps) { return 1 / (fps || 30); };
	V.clampSpeed = function (s, fps) { s = +s; if (!isFinite(s) || s <= 0) return 1; return Math.max(V.speedMin(fps), Math.min(V.SPEED_MAX, s)); };
	// one press of - / +: steps of inc (0.05 by default) on a 0.05 grid; below 0.05 the next step down is 1 frame per second
	V.stepSpeed = function (s, dir, fps, inc) {
		inc = inc || 0.05; var min = V.speedMin(fps), n;
		if (dir > 0 && s < 0.05 - 1e-9) n = 0.05;
		else n = dir > 0 ? Math.floor(s / inc + 1e-9) * inc + inc : Math.ceil(s / inc - 1e-9) * inc - inc;   // the next grid value up / down
		if (dir < 0 && n < 0.05 - 1e-9) n = min;
		return V.clampSpeed(Math.round(n * 1e6) / 1e6, fps);
	};
	// typed speeds: 3, 3x, 3×, 2.5, 300%, 1/2, 1 fps, 12fps (frames per second of the source)
	V.parseSpeed = function (txt, fps) {
		var t = String(txt || "").trim().toLowerCase().replace(/,/g, ".").replace(/\s+/g, ""), m;
		if (!t) return null;
		if ((m = /^(\d+(?:\.\d+)?)(?:fps|f\/s|frames?(?:\/s|persecond)?)$/.exec(t))) return V.clampSpeed(+m[1] / (fps || 30), fps);
		if ((m = /^(\d+(?:\.\d+)?)%$/.exec(t))) return +m[1] > 0 ? V.clampSpeed(+m[1] / 100, fps) : null;
		if ((m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)[x×]?$/.exec(t))) return +m[2] > 0 && +m[1] > 0 ? V.clampSpeed(+m[1] / +m[2], fps) : null;
		if ((m = /^[x×]?(\d+(?:\.\d+)?)[x×]?$/.exec(t))) return +m[1] > 0 ? V.clampSpeed(+m[1], fps) : null;
		return null;
	};
	V.speedLabel = function (s, fps) {
		fps = fps || 30; var f = s * fps;
		if (s < 0.05 - 1e-9) return (Math.round(f * 100) / 100) + " fps";
		return (Math.round(s * 1000) / 1000) + "×";
	};
	V.SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 6, 8, 12, 16, 24, 32, 45];
	V.short = function (t) { if (!(t >= 0)) t = 0; var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };
	V.parseTime = function (s, fps) {
		s = String(s || "").trim(); if (!s) return null;
		var fr = 0, m = /;(\d+)$/.exec(s); if (m) { fr = +m[1] / (fps || 30); s = s.slice(0, m.index); }
		var parts = s.split(":").map(Number); if (parts.some(function (x) { return !isFinite(x); })) return null;
		var t = 0; parts.forEach(function (x) { t = t * 60 + x; });
		return t + fr;
	};
	// the "go to" box: 4:23;13, 1:02:03.5, 263, 90s, 2m30s, 1h, ;15 (frames), +10 / -1:00 (from now). Returns seconds or null.
	V.parseGoto = function (s, fps, now) {
		s = String(s || "").trim().replace(/\s+/g, "").replace(/,/g, "."); if (!s) return null;
		fps = fps || 30;
		var rel = 0; if (/^[+-]/.test(s)) { rel = s[0] === "+" ? 1 : -1; s = s.slice(1); if (!s) return null; }
		var t = null, m;
		if ((m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)f)?$/i.exec(s)) && /[hmsf]/i.test(s)) t = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) + (+m[4] || 0) / fps;
		else if (/^;\d+$/.test(s)) t = +s.slice(1) / fps;
		else if (/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){0,2}(?:;\d+)?$/.test(s)) t = V.parseTime(s, fps);
		if (t == null || !isFinite(t)) return null;
		return rel ? (now || 0) + rel * t : t;
	};
	// every place something starts or ends (clips on shown / heard tracks, the I / O marks, 0), sorted: for "previous / next clip"
	V.editPoints = function (p) {
		var pts = [0];
		p.clips.forEach(function (c) { var tr = V.track(p, c.track); if (!tr) return; pts.push(c.start, V.end(c)); });
		if (p.marks) { if (p.marks.in != null) pts.push(p.marks.in); if (p.marks.out != null) pts.push(p.marks.out); }
		pts.sort(function (a, b) { return a - b; });
		return pts.filter(function (x, i) { return i === 0 || x - pts[i - 1] > 1e-6; });
	};
	V.nextEdit = function (p, t, dir, tol) {
		var pts = V.editPoints(p), e = tol == null ? 1e-3 : tol;
		if (dir > 0) { for (var i = 0; i < pts.length; i++) if (pts[i] > t + e) return pts[i]; return null; }
		for (var j = pts.length - 1; j >= 0; j--) if (pts[j] < t - e) return pts[j]; return null;
	};
	// ruler: a tick every "step" seconds so labels are at least minPx apart
	V.tickStep = function (pps, minPx) {
		var steps = [1 / 30, 1 / 10, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
		for (var j = 0; j < steps.length; j++) if (steps[j] * pps >= (minPx || 70)) return steps[j];
		return 7200;
	};
	V.frameSnap = function (t, fps) { return Math.round(t * fps) / fps; };

	/* ---------- AAC settings of a QuickTime (.mov) sound track ----------
	   OBS / QuickTime write a version-1 sound description with the esds box inside a "wave" box, which mp4box.js does not read
	   (codec comes back as plain "mp4a" with no description). bytes = the raw stsd entry (or any bytes holding an esds box).
	   -> { codec: "mp4a.40.2", desc: Uint8Array AudioSpecificConfig } or null. */
	V.esdsAac = function (bytes) {
		var b = bytes, n = b.length, i, p = -1;
		for (i = 4; i + 4 <= n; i++) if (b[i] === 0x65 && b[i + 1] === 0x73 && b[i + 2] === 0x64 && b[i + 3] === 0x73) { p = i + 8; break; } // "esds" + version/flags
		if (p < 0) return null;
		function len() { var l = 0, k = 0, c; do { c = b[p++]; l = (l << 7) | (c & 0x7f); k++; } while ((c & 0x80) && k < 4 && p < n); return l; }
		if (b[p++] !== 0x03) return null;
		len(); p += 2; var fl = b[p++];
		if (fl & 0x80) p += 2; if (fl & 0x40) p += 1 + b[p]; if (fl & 0x20) p += 2;
		if (b[p++] !== 0x04) return null;
		len(); var oti = b[p]; p += 13;
		if (b[p++] !== 0x05) return null;
		var l = len(); if (!l || p + l > n) return null;
		var desc = b.slice(p, p + l), aot = desc[0] >> 3;
		if (aot === 31 && l > 1) aot = 32 + (((desc[0] & 7) << 3) | (desc[1] >> 5));
		return { codec: "mp4a." + (oti || 0x40).toString(16) + "." + aot, desc: desc };
	};
	// no esds at all: an AAC-LC AudioSpecificConfig made from the rate and channel count
	V.aacConfig = function (rate, chs) {
		var R = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350], fi = R.indexOf(rate);
		if (fi < 0) return null;
		return { codec: "mp4a.40.2", desc: new Uint8Array([(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (Math.min(7, chs || 2) << 3)]) };
	};

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
