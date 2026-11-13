/* MES Narration engine (window.MESNarrate), shared by mes.fm/narration and the Video Editor (mes.fm/video).
 * Text -> speech in this browser through /main_js/narrate-worker.js (Kokoro stock voices or Chatterbox "my voice"),
 * plus the pure helpers (script splitting with [pause] marks, silence trimming, joining, WAV / MP3 / M4A encoding)
 * and the saved voice samples (IndexedDB "mes-narrate"). Nothing is uploaded. In node: require() gives the pure helpers. */
(function (root) {
	"use strict";
	var SR = 24000;
	var VOICES = [   // Kokoro-82M v1.0 English voices: id, name, accent / who
		["af_heart", "Heart", "US · woman"], ["af_bella", "Bella", "US · woman"], ["af_nicole", "Nicole", "US · woman, soft"], ["af_sarah", "Sarah", "US · woman"], ["af_sky", "Sky", "US · woman"],
		["af_nova", "Nova", "US · woman"], ["af_alloy", "Alloy", "US · woman"], ["af_aoede", "Aoede", "US · woman"], ["af_jessica", "Jessica", "US · woman"], ["af_kore", "Kore", "US · woman"], ["af_river", "River", "US · woman"],
		["am_michael", "Michael", "US · man"], ["am_adam", "Adam", "US · man"], ["am_eric", "Eric", "US · man"], ["am_liam", "Liam", "US · man"], ["am_onyx", "Onyx", "US · man, deep"], ["am_echo", "Echo", "US · man"],
		["am_fenrir", "Fenrir", "US · man"], ["am_puck", "Puck", "US · man"], ["am_santa", "Santa", "US · man, jolly"],
		["bf_emma", "Emma", "UK · woman"], ["bf_isabella", "Isabella", "UK · woman"], ["bf_alice", "Alice", "UK · woman"], ["bf_lily", "Lily", "UK · woman"],
		["bm_george", "George", "UK · man"], ["bm_lewis", "Lewis", "UK · man"], ["bm_daniel", "Daniel", "UK · man"], ["bm_fable", "Fable", "UK · man"],
	];

	/* ---------- pure helpers ---------- */
	// "[pause]" = 1 s, "[pause 2.5]" / "[pause 2.5s]" = that many seconds (max 30)
	var PAUSE = /\[\s*pause(?:\s+(\d+(?:[.,]\d+)?)\s*s?)?\s*\]/gi;
	function sentences(t) {
		var out = [], re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g, m;
		while ((m = re.exec(t)) && m[0]) { var s = m[0].trim(); if (s) out.push(s); if (re.lastIndex >= t.length) break; }
		return out.length ? out : [t.trim()];
	}
	// cut a long sentence at commas / semicolons, then at spaces, so no piece is longer than max
	function cutLong(s, max) {
		if (s.length <= max) return [s];
		var parts = [], cur = "";
		s.split(/(?<=[,;:—–])\s+/).forEach(function (w) {
			if (w.length > max) { w.split(/\s+/).forEach(function (x) { if ((cur + " " + x).trim().length > max && cur) { parts.push(cur.trim()); cur = x; } else cur = (cur + " " + x).trim(); }); return; }
			if ((cur + " " + w).trim().length > max && cur) { parts.push(cur.trim()); cur = w; } else cur = (cur + " " + w).trim();
		});
		if (cur) parts.push(cur.trim());
		return parts;
	}
	// script -> [{text} | {pause: seconds}]; paragraphs (blank lines) become {para: true} after their last piece
	// one: each sentence is its own piece (used for the voice copy, which can lose its way on two sentences at once)
	function split(script, max, one) {
		max = max || 220; var items = [];
		String(script || "").replace(/\r/g, "").split(/\n\s*\n/).forEach(function (para, pi, all) {
			var bits = para.split(PAUSE), i;   // split with a capture group: text, seconds, text, ...
			for (i = 0; i < bits.length; i++) {
				if (i % 2 === 1) { if (bits[i] !== undefined) items.push({ pause: Math.min(30, parseFloat(String(bits[i] || "1").replace(",", ".")) || 1) }); else items.push({ pause: 1 }); continue; }
				var txt = bits[i].replace(/\s+/g, " ").trim(); if (!txt) continue;
				var buf = "";
				sentences(txt).forEach(function (s) {
					cutLong(s, max).forEach(function (p) {
						if (buf && (one || (buf + " " + p).length > max)) { items.push({ text: buf }); buf = p; } else buf = buf ? buf + " " + p : p;
					});
				});
				if (buf) items.push({ text: buf });
			}
			if (pi < all.length - 1 && items.length && !items[items.length - 1].pause) items[items.length - 1].para = true;
		});
		return items;
	}
	// drop silence at both ends (keeps pad seconds), so the gaps between pieces are the ones we choose
	function trim(a, sr, thr, pad) {
		thr = thr || 0.01; pad = pad == null ? 0.04 : pad; var n = a.length, s = 0, e = n - 1, P = Math.round(pad * sr);
		while (s < n && Math.abs(a[s]) < thr) s++; while (e > s && Math.abs(a[e]) < thr) e--;
		if (s >= e) return new Float32Array(0);
		return a.slice(Math.max(0, s - P), Math.min(n, e + 1 + P));
	}
	// join pieces [{audio, gap (seconds after it)}] into one Float32Array
	function join(pieces, sr) {
		var n = 0; pieces.forEach(function (p) { n += (p.audio ? p.audio.length : 0) + Math.round((p.gap || 0) * sr); });
		var out = new Float32Array(n), o = 0;
		pieces.forEach(function (p) { if (p.audio) { out.set(p.audio, o); o += p.audio.length; } o += Math.round((p.gap || 0) * sr); });
		return out;
	}
	function peakNormalize(a, peak) { var m = 0; for (var i = 0; i < a.length; i++) { var v = Math.abs(a[i]); if (v > m) m = v; } if (!m) return a; var k = (peak || 0.89) / m, o = new Float32Array(a.length); for (var j = 0; j < a.length; j++) o[j] = a[j] * k; return o; }
	function resample(a, from, to) {
		if (from === to) return a; var n = Math.round(a.length * to / from), o = new Float32Array(n), r = from / to;
		for (var i = 0; i < n; i++) { var x = i * r, k = Math.floor(x), f = x - k, p0 = a[Math.max(0, k - 1)] || 0, p1 = a[k] || 0, p2 = a[k + 1] || p1, p3 = a[k + 2] || p2; o[i] = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0))); }
		return o;
	}
	function wav(a, sr) {
		var n = a.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
		function s(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
		s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
		v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
		for (var i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, a[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
		return buf;
	}
	// a take shorter than ~25 ms per letter is broken (speech runs at ~65-80 ms per letter)
	function tooShort(sec, text) { var n = String(text || "").replace(/[^A-Za-z0-9]/g, "").length; return n >= 12 && sec < n * 0.025; }
	function halves(t) {
		t = String(t || "").trim(); var w = t.split(/\s+/); if (w.length < 4) return null;
		var mid = t.length / 2, best = -1, re = /[,;:—–]\s+/g, m;
		while ((m = re.exec(t))) { var at = m.index + 1; if (at > t.length * 0.25 && at < t.length * 0.75 && (best < 0 || Math.abs(at - mid) < Math.abs(best - mid))) best = at; }
		if (best > 0) return [t.slice(0, best).trim(), t.slice(best).trim()];
		var k = Math.ceil(w.length / 2); return [w.slice(0, k).join(" "), w.slice(k).join(" ")];
	}
	function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
	var pure = { tooShort: tooShort, halves: halves, SR: SR, VOICES: VOICES, split: split, sentences: sentences, cutLong: cutLong, trim: trim, join: join, peakNormalize: peakNormalize, resample: resample, wav: wav, hash: hash };
	if (typeof module === "object" && module.exports) { module.exports = pure; return; }

	/* ---------- browser: workers ---------- */
	var W = {}, seq = 0, pending = {};
	function worker(engine) {
		if (W[engine]) return W[engine];
		var w = new Worker("/main_js/narrate-worker.js?v=2", { type: "module", name: "mes-narrate-" + engine });
		w.onmessage = function (e) { var d = e.data, p = pending[d.id]; if (!p) return; if (d.progress) { if (p.onProgress) p.onProgress(d.progress); return; } delete pending[d.id]; if (d.ok) p.res(d.r); else p.rej(new Error(d.error)); };
		w.onerror = function (e) { Object.keys(pending).forEach(function (k) { if (pending[k].engine === engine) { pending[k].rej(new Error(e.message || "The speech engine stopped")); delete pending[k]; } }); W[engine] = null; };
		return (W[engine] = w);
	}
	function call(engine, op, a, onProgress, transfer) {
		return new Promise(function (res, rej) { var id = ++seq; pending[id] = { res: res, rej: rej, onProgress: onProgress, engine: engine }; worker(engine).postMessage({ id: id, op: op, a: a || {} }, transfer || []); });
	}
	// one progress number for a download made of several files
	function progressTracker(cb) {
		var files = {};
		return function (p) { if (!p.file) return; var f = files[p.file] = files[p.file] || { l: 0, t: 0 }; if (p.total) f.t = p.total; if (p.loaded) f.l = p.loaded; if (p.status === "done" && f.t) f.l = f.t; var L = 0, T = 0; Object.keys(files).forEach(function (k) { L += files[k].l; T += files[k].t; }); if (cb) cb(T ? L / T : 0, L, T); };
	}
	var loaded = {}, loading = {};
	function load(engine, opts) {
		opts = opts || {}; var key = engine + (opts.gpu ? ":gpu" : "");
		if (loaded[engine]) return Promise.resolve(loaded[engine]);
		if (loading[engine]) return loading[engine];
		var tr = progressTracker(opts.onProgress);
		return (loading[engine] = call(engine, engine === "clone" ? "loadClone" : "loadKokoro", { gpu: !!opts.gpu, cpu: !!opts.cpu }, tr).then(function (r) { loaded[engine] = r; loading[engine] = null; return r; }, function (e) { loading[engine] = null; throw e; }));
	}
	// cache of finished pieces: same engine + voice + settings + text = no new work
	var cache = new Map();
	function ckey(text, o) { return [o.engine, o.voice, o.engine === "clone" ? 1 : o.speed || 1, o.engine === "clone" ? (o.exaggeration == null ? 0.5 : o.exaggeration) : 0, text].join("|"); }
	function forget(o, text) { cache.delete(ckey(text, o)); }
	function speakOne(text, o) {
		var key = ckey(text, o);
		if (cache.has(key)) return Promise.resolve(cache.get(key));
		var p;
		if (o.engine === "clone") {
			p = call("clone", "clone", { text: text, voiceId: o.voice, exaggeration: o.exaggeration }).catch(function (e) {
				if (!/need-voice/.test(e.message)) throw e;
				return getVoice(o.voice).then(function (v) { if (!v) throw new Error("That voice is not saved in this browser any more."); return call("clone", "clone", { text: text, voiceId: o.voice, samples: v.samples, exaggeration: o.exaggeration }); });
			});
		} else p = call("kokoro", "kokoro", { text: text, voice: o.voice, speed: o.speed || 1 });
		return p.then(function (r) {
			var a = trim(r.sr === SR ? r.audio : resample(r.audio, r.sr, SR), SR);
			// the voice copy (Chatterbox) sometimes "speaks" a line as near-silence and returns a fraction of a second; such a take is never
			// kept: the line is said again in two halves (at a comma if there is one, else at the middle word)
			if (o.engine === "clone" && tooShort(a.length / SR, text)) {
				var h = halves(text), depth = o._depth || 0;
				if (h && depth < 2) {
					var o2 = Object.assign({}, o, { _depth: depth + 1 });
					return speakOne(h[0], o2).then(function (a1) { return speakOne(h[1], o2).then(function (a2) { return join([{ audio: a1, gap: 0.12 }, { audio: a2 }], SR); }); });
				}
				return a;   // still short: give it back, but don't cache it, so "Again" makes a new take
			}
			if (cache.size > 400) cache.delete(cache.keys().next().value); cache.set(key, a); return a;
		});
	}
	// the whole script -> {audio (24 kHz mono), pieces: [{text, start, end}]}; o: engine, voice, speed, exaggeration, gap, paraGap, onPiece(i, n, item), signal
	function speak(script, o) {
		o = o || {}; var items = split(script, o.engine === "clone" ? 150 : 260, o.engine === "clone"), n = items.filter(function (x) { return x.text; }).length, done = 0, out = [];
		var chain = load(o.engine, o);
		items.forEach(function (it) {
			chain = chain.then(function () {
				if (o.signal && o.signal.aborted) throw new Error("Stopped");
				if (it.pause) { out.push({ audio: null, gap: it.pause }); return; }
				if (o.onPiece) o.onPiece(done, n, it);
				return speakOne(it.text, o).then(function (a) { done++; out.push({ audio: a, gap: it.para ? (o.paraGap == null ? 0.7 : o.paraGap) : (o.gap == null ? 0.25 : o.gap), text: it.text }); if (o.onPiece) o.onPiece(done, n, it); });
			});
		});
		return chain.then(function () {
			var t = 0, pieces = [];
			out.forEach(function (p) { if (p.audio) { pieces.push({ text: p.text, start: t, end: t + p.audio.length / SR }); t += p.audio.length / SR; } t += p.gap || 0; });
			if (out.length && out[out.length - 1].gap && !items[items.length - 1].pause) out[out.length - 1].gap = 0.15;
			var a = join(out, SR); return { audio: o.normalize === false ? a : peakNormalize(a, 0.89), sr: SR, pieces: pieces };
		});
	}

	/* ---------- encoders ---------- */
	function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Could not load " + src)); }; document.head.appendChild(s); }); }
	var LAME = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js", MUXER = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js";
	function toInt16(a, i, j) { var o = new Int16Array(j - i); for (var k = i; k < j; k++) { var x = Math.max(-1, Math.min(1, a[k])); o[k - i] = x < 0 ? x * 0x8000 : x * 0x7fff; } return o; }
	function encode(a, sr, fmt, kbps) {
		if (fmt === "wav") return Promise.resolve(new Blob([wav(a, sr)], { type: "audio/wav" }));
		if (fmt === "mp3") {
			var rate = 24000;   // lamejs accepts 24 kHz (MPEG-2); bitrates above 160 kbps are not allowed there
			return (window.lamejs ? Promise.resolve() : loadScript(LAME)).then(function () {
				var x = sr === rate ? a : resample(a, sr, rate), enc = new window.lamejs.Mp3Encoder(1, rate, Math.min(160, kbps || 128)), out = [], B = 1152 * 20;
				for (var i = 0; i < x.length; i += B) { var m = enc.encodeBuffer(toInt16(x, i, Math.min(x.length, i + B))); if (m.length) out.push(new Uint8Array(m)); }
				var f = enc.flush(); if (f.length) out.push(new Uint8Array(f)); return new Blob(out, { type: "audio/mpeg" });
			});
		}
		if (typeof window.AudioEncoder !== "function") return Promise.reject(new Error("This browser cannot make M4A files: choose MP3 or WAV."));
		var r2 = 48000, y = resample(a, sr, r2);
		return (window.Mp4Muxer ? Promise.resolve() : loadScript(MUXER)).then(function () {
			var cfg = { codec: "mp4a.40.2", sampleRate: r2, numberOfChannels: 1, bitrate: Math.min(320, Math.max(64, kbps || 128)) * 1000 };
			return AudioEncoder.isConfigSupported(cfg).then(function (s) {
				if (!s.supported) throw new Error("This browser has no AAC encoder: choose MP3 or WAV.");
				var M = window.Mp4Muxer, target = new M.ArrayBufferTarget(), mux = new M.Muxer({ target: target, audio: { codec: "aac", numberOfChannels: 1, sampleRate: r2 }, fastStart: "in-memory" }), err = null;
				var enc = new AudioEncoder({ output: function (c, m) { mux.addAudioChunk(c, m); }, error: function (e) { err = e; } });
				enc.configure(cfg);
				for (var i = 0; i < y.length; i += 4096) { var j = Math.min(y.length, i + 4096), ad = new AudioData({ format: "f32-planar", sampleRate: r2, numberOfFrames: j - i, numberOfChannels: 1, timestamp: Math.round(i / r2 * 1e6), data: y.slice(i, j) }); enc.encode(ad); ad.close(); }
				return enc.flush().then(function () { if (err) throw err; mux.finalize(); return new Blob([target.buffer], { type: "audio/mp4" }); });
			});
		});
	}

	/* ---------- voice samples: decode any audio file / recording to 24 kHz mono, keep 4-25 s ---------- */
	function decodeSample(blob) {
		return blob.arrayBuffer().then(function (buf) {
			var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
			return ac.decodeAudioData(buf).then(function (b) {
				ac.close(); var n = b.length, m = new Float32Array(n);
				for (var c = 0; c < b.numberOfChannels; c++) { var d = b.getChannelData(c); for (var i = 0; i < n; i++) m[i] += d[i] / b.numberOfChannels; }
				var a = trim(resample(m, b.sampleRate, SR), SR, 0.008, 0.1);
				if (a.length > SR * 25) a = a.slice(0, SR * 25);
				return peakNormalize(a, 0.9);
			}, function () { ac.close(); throw new Error("This file could not be read as audio."); });
		});
	}
	var DBP = null;
	function db() { return DBP = DBP || new Promise(function (res, rej) { var r = indexedDB.open("mes-narrate", 1); r.onupgradeneeded = function () { r.result.createObjectStore("voices", { keyPath: "id" }); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function tx(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("voices", mode), q = fn(t.objectStore("voices")); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); }); }
	function listVoices() { return tx("readonly", function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return b.t - a.t; }); }); }
	function getVoice(id) { return tx("readonly", function (s) { return s.get(id); }); }
	function saveVoice(v) { v.id = v.id || "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); v.t = v.t || Date.now(); return tx("readwrite", function (s) { return s.put(v); }).then(function () { return v; }); }
	function deleteVoice(id) { cache.forEach(function (v, k) { if (k.indexOf("clone|" + id + "|") === 0) cache.delete(k); }); if (W.clone) call("clone", "forget", { voiceId: id }).catch(function () {}); return tx("readwrite", function (s) { return s.delete(id); }); }
	function info() { return call("kokoro", "info"); }

	root.MESNarrate = Object.assign({}, pure, { load: load, speak: speak, speakOne: speakOne, forget: forget, encode: encode, decodeSample: decodeSample, listVoices: listVoices, getVoice: getVoice, saveVoice: saveVoice, deleteVoice: deleteVoice, info: info, workerUrls: function (e) { return call(e || "kokoro", "urls"); }, isLoaded: function (e) { return !!loaded[e]; }, CLONE_MB: 1500, KOKORO_MB: 92 });
})(typeof window !== "undefined" ? window : this);
