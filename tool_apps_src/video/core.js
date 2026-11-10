/* MES Video Editor core: state, storage (IndexedDB), importing media (anything the converter reads), MP4 sample tables (mp4box.js),
 * thumbnails, waveforms, sound access by time range (WebCodecs AudioDecoder, cached in 10 s windows) and the compositor that draws a frame
 * (used by the preview and by the export). Shares window.VE with preview.js / timeline.js / export.js / app.js. */
(function () {
	"use strict";
	var V = window.MESVed, C = window.MESConv, E = window.MESConvEngine; if (!V || !document.getElementById("vd")) return;
	var VE = window.VE = { V: V };
	VE.LIB = { box: "https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js", mp4: "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js" };
	VE.loadScript = E.loadScript;
	VE.P = V.newProject(); VE.bin = []; VE.sel = []; VE.t = 0; VE.pps = 60; VE.hist = new V.History(200);
	VE.esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
	VE.media = function (id) { for (var j = 0; j < VE.bin.length; j++) if (VE.bin[j].id === id) return VE.bin[j]; return null; };
	VE.signal = function () { var w = []; return { wait: function (ms) { return new Promise(function (r) { var t = setTimeout(done, ms || 250); function done() { clearTimeout(t); r(); } w.push(done); }); }, wake: function () { var a = w; w = []; for (var j = 0; j < a.length; j++) a[j](); } }; };
	var listeners = {};
	VE.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
	VE.emit = function (ev, a) { (listeners[ev] || []).forEach(function (fn) { try { fn(a); } catch (e) { if (window.console) console.error(e); } }); };

	/* ---------- edits + undo ---------- */
	// every change to the project goes through commit(): it records an undo step, saves (debounced) and redraws
	VE.commit = function (label) {
		V.applyMagnets(VE.P);
		VE.hist.push(JSON.stringify(VE.P)); VE.dirty = true; VE.lastLabel = label || "";
		VE.save(); VE.emit("change", label);
	};
	VE.undo = function () { var s = VE.hist.undo(); if (s) { VE.P = JSON.parse(s); VE.sel = VE.sel.filter(function (id) { return V.clip(VE.P, id); }); VE.save(); VE.emit("change", "undo"); } };
	VE.redo = function () { var s = VE.hist.redo(); if (s) { VE.P = JSON.parse(s); VE.save(); VE.emit("change", "redo"); } };
	VE.selected = function () { return VE.sel.map(function (id) { return V.clip(VE.P, id); }).filter(Boolean); };

	/* ---------- IndexedDB ---------- */
	var dbp = null;
	function db() {
		if (!dbp) dbp = new Promise(function (res, rej) {
			if (!window.indexedDB) return rej(new Error("no IndexedDB"));
			var r = indexedDB.open("mes-video-editor", 1);
			r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs"); };
			r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
		});
		return dbp;
	}
	function tx(store, mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = t.onabort = function () { rej(t.error); }; }); }); }
	VE.idbGet = function (store, k) { return db().then(function (d) { return new Promise(function (res, rej) { var r = d.transaction(store).objectStore(store).get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }); };
	VE.idbPut = function (store, k, v) { return tx(store, "readwrite", function (s) { s.put(v, k); }); };
	VE.idbDel = function (store, k) { return tx(store, "readwrite", function (s) { s.delete(k); }); };
	function binMeta() {
		return VE.bin.filter(function (m) { return m.state === "ready" || m.state === "working"; }).map(function (m) {
			return { id: m.id, name: m.name, size: m.size, kind: m.kind, dur: m.dur, w: m.w, h: m.h, fps: m.fps, rot: m.rot || 0, hasAudio: !!m.hasAudio, converted: !!m.converted, note: m.note || "", peaks: m.peaks || null, wave: m.wave || null, thumbTimes: m.thumbTimes || null, thumbW: m.thumbW || 0, thumbH: m.thumbH || 0, origName: m.origName || "" };
		});
	}
	var saveTimer = null;
	VE.save = function () {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(function () {
			VE.idbPut("kv", "project", JSON.stringify(VE.P)).then(function () { return VE.idbPut("kv", "bin", binMeta()); }).then(function () { VE.savedAt = Date.now(); VE.emit("saved"); }).catch(function (e) { VE.emit("saveError", e); });
		}, 900);
	};

	/* ---------- importing ---------- */
	var uidN = 0;
	VE.addFiles = function (files) {
		var out = [];
		files.forEach(function (f) {
			var kind = /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(f.name) ? "image" : C.isAudio(f.name, f.type) && !/\.(mp4|m4v|webm|mov)$/i.test(f.name) ? "audio" : C.isVideo(f.name, f.type) ? "video" : null;
			if (!kind) { VE.emit("notice", f.name + " was skipped: not a video, sound or picture."); return; }
			var m = { id: V.uid("m"), name: f.name, size: f.size, kind: kind, state: "working", pct: 0, status: "Reading...", file: f };
			VE.bin.push(m); out.push(m);
		});
		VE.emit("bin");
		var chain = Promise.resolve();
		out.forEach(function (m) { chain = chain.then(function () { return VE.prepare(m, true); }); });
		return chain.then(function () { return out; });
	};
	function status(m, s, pct) { m.status = s; if (pct != null) m.pct = pct; VE.emit("binItem", m); }
	// make a media item usable: decode / analyse / convert. fresh = it came from the user just now (store its file)
	VE.prepare = async function (m, fresh) {
		try {
			if (m.kind === "image") {
				var bmp = await createImageBitmap(m.file); m.bitmap = bmp; m.w = bmp.width; m.h = bmp.height; m.dur = Infinity;
			} else if (m.kind === "audio") {
				status(m, "Decoding the sound...");
				var buf = await m.file.arrayBuffer(), ctx = new OfflineAudioContext(2, 1, 48000), ab = await ctx.decodeAudioData(buf);
				m.pcm = { start: 0, rate: ab.sampleRate, ch: [] }; for (var c = 0; c < Math.min(2, ab.numberOfChannels); c++) m.pcm.ch.push(ab.getChannelData(c));
				m.dur = ab.duration; m.hasAudio = true; m.peaks = V.peaks(m.pcm.ch, m.pcm.rate, 50); m.wave = V.wave(m.pcm.ch, m.pcm.rate, V.WAVE_RATE);
			} else {
				await VE.loadScript(VE.LIB.box);
				var info = /\.(mp4|m4v|mov|3gp)$/i.test(m.file.name) || /mp4|quicktime/.test(m.file.type) || m.converted ? await VE.analyzeMp4(m.file).catch(function () { return null; }) : null;
				if (!info || !info.ok) {
					var why = info && info.why ? info.why : "";
					status(m, "Converting to MP4" + (why ? " (" + why + ")" : "") + "...", 0);
					var res = await E.convert(m.file, { onProgress: function (x) { status(m, "Converting to MP4... " + Math.round(x * 100) + "%", x); }, onStatus: function (s, x) { status(m, s, x); } });
					m.origName = m.file.name; m.file = new File([res.blob], C.outName(m.file.name), { type: "video/mp4" }); m.converted = true; m.note = res.note || "";
					info = await VE.analyzeMp4(m.file);
					if (!info.ok) throw new Error(info.why || "The converted file could not be read.");
				}
				Object.assign(m, { dur: info.dur, w: info.w, h: info.h, fps: info.fps, rot: info.rot, hasAudio: !!info.at, vt: info.vt, at: info.at });
			}
			if (fresh) { m.size = m.file.size; VE.idbPut("blobs", "m:" + m.id, m.file).catch(function (e) { VE.emit("notice", "This browser could not keep " + m.name + " for next time (" + (e && e.message || e) + "). It works until you close the tab."); }); }
			m.url = m.url || URL.createObjectURL(m.file);
			m.state = "ready"; m.status = ""; delete m.err;
			VE.emit("binItem", m); VE.emit("mediaReady", m); VE.save();
			if (m.kind === "video" && !m.thumbTimes) VE.makeThumbs(m).catch(function () { /* thumbnails are optional */ });
			else if (m.kind === "video" && m.thumbTimes) VE.loadThumbs(m);
			if (m.kind === "video" && m.hasAudio && (!m.peaks || !m.wave || m.wave.r !== V.WAVE_RATE)) VE.makePeaks(m).catch(function () { /* optional */ });
		} catch (e) {
			m.state = "error"; m.status = (e && e.message) || "This file could not be used."; if (window.console) console.error("[video editor]", e);
			VE.emit("binItem", m);
		}
	};
	// mp4box: sample tables of the first video and audio tracks -> { ok, dur, w, h, fps, rot, vt, at } (vt / at hold codec, description, and per-sample arrays in decode order)
	VE.analyzeMp4 = function (file) {
		return new Promise(function (resolve, reject) {
			var mp4 = MP4Box.createFile(), off = 0, CH = 4194304, done = false;
			mp4.onError = function (e) { if (!done) { done = true; resolve({ ok: false, why: "not an MP4" }); } };
			mp4.onReady = async function (i) {
				if (done) return; done = true;
				try {
					var vt = i.videoTracks[0], at = i.audioTracks[0]; if (!vt) return resolve({ ok: false, why: "no picture" });
					var vtr = mp4.getTrackById(vt.id), desc = descOf(vtr), sup = null;
					try { sup = await VideoDecoder.isConfigSupported({ codec: vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description: desc }); } catch (e) { /* ignore */ }
					if (!sup || !sup.supported) return resolve({ ok: false, why: "the picture format cannot be decoded here" });
					var dur = (i.duration || vt.movie_duration) / (i.timescale || vt.movie_timescale || 1);
					var V1 = tableOf(vtr.samples || []); V1.codec = vt.codec; V1.desc = desc; V1.cw = vt.video.width; V1.ch = vt.video.height;
					var ds = Array.prototype.slice.call(V1.dur, 0, Math.min(V1.n, 600)).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; }), md = ds.length ? ds[ds.length >> 1] : 1 / 30;
					var fps = Math.round(1000 / md) / 1000; if (Math.abs(fps - Math.round(fps)) < 0.02) fps = Math.round(fps);
					var A = null;
					if (at && window.AudioDecoder) {
						var atr = mp4.getTrackById(at.id), ad = audioDescOf(atr), as = null;
						if (!ad && /^mp4a/.test(at.codec)) { // .mov: the AAC settings hide in a QuickTime "wave" box mp4box skips
							var ent = atr.mdia.minf.stbl.stsd.entries[0], qa = null;
							try { if (ent && ent.start >= 0 && ent.size > 0 && ent.size < 65536) qa = V.esdsAac(new Uint8Array(await file.slice(ent.start, ent.start + ent.size).arrayBuffer())); } catch (e) { /* ignore */ }
							qa = qa || V.aacConfig(at.audio.sample_rate, at.audio.channel_count);
							if (qa) { ad = qa.desc; at.codec = qa.codec; }
						}
						try { as = await AudioDecoder.isConfigSupported({ codec: at.codec, sampleRate: at.audio.sample_rate, numberOfChannels: at.audio.channel_count, description: ad }); } catch (e) { /* ignore */ }
						if (as && as.supported) { A = tableOf(atr.samples || []); A.codec = at.codec; A.desc = ad; A.rate = at.audio.sample_rate; A.chs = at.audio.channel_count; }
					}
					if (at && !A) return resolve({ ok: false, why: "the sound format cannot be decoded here" });
					var rot = rotOf(vt.matrix), w = vt.video.width, h = vt.video.height;
					if (rot === 90 || rot === 270) { var tmp = w; w = h; h = tmp; }
					resolve({ ok: true, dur: dur, w: Math.round(w), h: Math.round(h), fps: Math.min(120, Math.max(1, fps)), rot: rot, vt: V1, at: A });
				} catch (e) { resolve({ ok: false, why: e.message }); }
			};
			(async function () {
				try {
					while (!done && off < file.size) {
						var end = Math.min(file.size, off + CH), buf = await file.slice(off, end).arrayBuffer(); buf.fileStart = off;
						var next = mp4.appendBuffer(buf, end >= file.size); off = typeof next === "number" && next > off ? next : end;
					}
					if (!done) { mp4.flush(); setTimeout(function () { if (!done) { done = true; resolve({ ok: false, why: "not an MP4" }); } }, 600); }
				} catch (e) { if (!done) { done = true; reject(e); } }
			})();
		});
	};
	function rotOf(m) { if (!m) return 0; var a = m[0] / 65536, b = m[1] / 65536; var deg = Math.round(Math.atan2(b, a) * 180 / Math.PI); return ((deg % 360) + 360) % 360; }
	function tableOf(ss) {
		var n = ss.length, t = { n: n, cts: new Float64Array(n), dts: new Float64Array(n), dur: new Float64Array(n), off: new Float64Array(n), size: new Uint32Array(n), key: new Uint8Array(n) };
		for (var j = 0; j < n; j++) { var s = ss[j], ts = s.timescale; t.cts[j] = s.cts / ts; t.dts[j] = s.dts / ts; t.dur[j] = s.duration / ts; t.off[j] = s.offset; t.size[j] = s.size; t.key[j] = s.is_sync ? 1 : 0; }
		return t;
	}
	function descOf(trak) {
		var es = trak.mdia.minf.stbl.stsd.entries;
		for (var j = 0; j < es.length; j++) { var b = es[j].avcC || es[j].hvcC || es[j].vpcC || es[j].av1C; if (b) { var ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); b.write(ds); return new Uint8Array(ds.buffer, 8); } }
		return undefined;
	}
	function audioDescOf(trak) { var e = trak.mdia.minf.stbl.stsd.entries[0]; try { return new Uint8Array(e.esds.esd.descs[0].descs[0].data); } catch (x) { return undefined; } }
	// index of the last key frame (decode order) whose presentation time is <= t
	VE.keyBefore = function (vt, t) { var best = 0; for (var j = 0; j < vt.n; j++) { if (vt.key[j] && vt.cts[j] <= t + 1e-4) best = j; else if (vt.key[j] && vt.cts[j] > t + 1e-4) break; } return best; };
	// read sample bytes [i, j) with as few file reads as possible
	VE.readSamples = async function (file, tb, i, j) {
		var lo = Infinity, hi = 0, k; for (k = i; k < j; k++) { lo = Math.min(lo, tb.off[k]); hi = Math.max(hi, tb.off[k] + tb.size[k]); }
		var out = [];
		if (hi - lo < 64 * 1048576) { var big = new Uint8Array(await file.slice(lo, hi).arrayBuffer()); for (k = i; k < j; k++) out.push(big.subarray(tb.off[k] - lo, tb.off[k] - lo + tb.size[k])); }
		else for (k = i; k < j; k++) out.push(new Uint8Array(await file.slice(tb.off[k], tb.off[k] + tb.size[k]).arrayBuffer()));
		return out;
	};

	/* ---------- thumbnails ---------- */
	VE.THUMB_H = 72;
	VE.makeThumbs = async function (m) {
		var vt = m.vt, count = Math.max(2, Math.min(80, Math.ceil(m.dur / 2))), want = [], seen = {}, j;
		for (j = 0; j < count; j++) { var k = VE.keyBefore(vt, (j + 0.5) * m.dur / count); if (!seen[k]) { seen[k] = 1; want.push(k); } }
		var th = VE.THUMB_H, tw = Math.max(16, Math.round(th * m.w / m.h)), sprite = document.createElement("canvas"); sprite.width = tw * want.length; sprite.height = th;
		var sx = sprite.getContext("2d"), times = [], got = 0, err = null;
		var dec = new VideoDecoder({ output: function (fr) { try { drawFrame(sx, fr, m.rot || 0, got * tw, 0, tw, th); times.push(fr.timestamp / 1e6); got++; } finally { fr.close(); } }, error: function (e) { err = e; } });
		dec.configure({ codec: vt.codec, codedWidth: vt.cw, codedHeight: vt.ch, description: vt.desc, optimizeForLatency: true });
		for (j = 0; j < want.length && !err; j++) {
			var data = (await VE.readSamples(m.file, vt, want[j], want[j] + 1))[0];
			dec.decode(new EncodedVideoChunk({ type: "key", timestamp: Math.round(vt.cts[want[j]] * 1e6), data: data }));
			if (dec.decodeQueueSize > 4) await dec.flush();
		}
		await dec.flush(); dec.close();
		if (!got) return;
		var c2 = document.createElement("canvas"); c2.width = tw * got; c2.height = th; c2.getContext("2d").drawImage(sprite, 0, 0);
		var blob = await new Promise(function (r) { c2.toBlob(r, "image/jpeg", 0.72); });
		m.thumbTimes = times; m.thumbW = tw; m.thumbH = th; m.thumbImg = await createImageBitmap(blob);
		VE.idbPut("blobs", "t:" + m.id, blob).catch(function () { /* fine */ }); VE.save();
		VE.emit("thumbs", m);
	};
	VE.loadThumbs = function (m) { VE.idbGet("blobs", "t:" + m.id).then(function (b) { if (b) return createImageBitmap(b).then(function (bmp) { m.thumbImg = bmp; VE.emit("thumbs", m); }); }).catch(function () { }); };
	// draw a decoded frame (unrotated) into a box, turned by rot degrees
	function drawFrame(ctx, fr, rot, x, y, w, h) {
		if (!rot) { ctx.drawImage(fr, x, y, w, h); return; }
		ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot * Math.PI / 180);
		var sw = rot % 180 ? h : w, sh = rot % 180 ? w : h; ctx.drawImage(fr, -sw / 2, -sh / 2, sw, sh); ctx.restore();
	}
	VE.drawFrame = drawFrame;

	/* ---------- sound by time range ---------- */
	var WIN = 10;
	// -> { start, rate, ch } covering at least [s0, s1] of the media's sound (source seconds); null when it has none
	VE.pcm = async function (m, s0, s1) {
		if (m.pcm) return m.pcm;
		if (!m.at) return null;
		var w0 = Math.floor(Math.max(0, s0) / WIN), w1 = Math.floor(Math.max(0, s1) / WIN);
		if (w0 === w1) return win(m, w0);
		var parts = []; for (var w = w0; w <= w1; w++) parts.push(await win(m, w));
		var rate = parts[0].rate, step = Math.round(WIN * rate), out = { start: w0 * WIN, rate: rate, ch: [] };
		for (var c = 0; c < parts[0].ch.length; c++) { var a = new Float32Array(step * parts.length); parts.forEach(function (p, k) { a.set(p.ch[c].subarray(0, step), k * step); }); out.ch.push(a); }
		return out;
	};
	// one 10 s window of decoded sound, cached (a few per media)
	function win(m, w) {
		m.wins = m.wins || {}; m.winOrder = m.winOrder || [];
		if (m.wins[w]) { m.winOrder = m.winOrder.filter(function (x) { return x !== w; }).concat([w]); return m.wins[w]; }
		var p = decodeWin(m, w); m.wins[w] = p; m.winOrder.push(w); m.winData = m.winData || {};
		while (m.winOrder.length > 8) { var old = m.winOrder.shift(); delete m.wins[old]; delete m.winData[old]; }
		p.then(function (d) { if (m.wins[w] === p) m.winData[w] = d; }, function () { delete m.wins[w]; });
		return p;
	}
	// decoded sound around source time s right now (no waiting), or null and it starts decoding (then fires "pcmReady" with the media)
	VE.pcmNow = function (m, s) {
		if (m.pcm) return m.pcm;
		if (!m.at || s < 0 || s > m.dur + 0.05) return null;
		var w = Math.floor(s / WIN); if (m.winData && m.winData[w]) return m.winData[w];
		if (!m.wins || !m.wins[w]) win(m, w).then(function () { VE.emit("pcmReady", m); }, function (e) { if (!m.pcmErr && window.console) console.warn("[video editor] sound of " + m.name + " could not be decoded for the zoomed waveform", e); m.pcmErr = 1; });
		return null;
	};
	async function decodeWin(m, w) {
		var at = m.at, t0 = w * WIN, t1 = t0 + WIN, i = 0, j = at.n;
		while (i < at.n && at.cts[i] + at.dur[i] < t0 - 0.05) i++;
		j = i; while (j < at.n && at.cts[j] < t1 + 0.05) j++;
		var rate = at.rate, nch = Math.min(2, at.chs || 2), len = Math.round(WIN * rate), out = { start: t0, rate: rate, ch: [] };
		for (var c = 0; c < nch; c++) out.ch.push(new Float32Array(len));
		if (j <= i) return out;
		var data = await VE.readSamples(m.file, at, i, j), err = null, tmp = null;
		var dec = new AudioDecoder({ output: function (ad) {
			try {
				var n = ad.numberOfFrames, pos = Math.round((ad.timestamp / 1e6 - t0) * rate);
				if (!tmp || tmp.length < n) tmp = new Float32Array(n);
				for (var c = 0; c < nch; c++) {
					ad.copyTo(tmp, { planeIndex: Math.min(c, ad.numberOfChannels - 1), format: "f32-planar" });
					var a = Math.max(0, -pos), b = Math.min(n, len - pos); if (b > a) out.ch[c].set(tmp.subarray(a, b), pos + a);
				}
			} catch (e) { err = e; } finally { ad.close(); }
		}, error: function (e) { err = e; } });
		dec.configure({ codec: at.codec, sampleRate: at.rate, numberOfChannels: at.chs, description: at.desc });
		for (var k = 0; k < data.length; k++) dec.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(at.cts[i + k] * 1e6), duration: Math.round(at.dur[i + k] * 1e6), data: data[k] }));
		await dec.flush(); dec.close();
		if (err) throw err;
		return out;
	}
	// a whole source range at 48 kHz (for noise removal / loudness): -> [Float32Array per channel]
	VE.pcmRange = async function (m, s0, s1, onProgress) {
		var rate = 48000, n = Math.max(1, Math.round((s1 - s0) * rate)), nch = m.pcm ? m.pcm.ch.length : Math.min(2, (m.at && m.at.chs) || 2), out = [];
		for (var c = 0; c < nch; c++) out.push(new Float32Array(n));
		for (var s = s0; s < s1; s += WIN) {
			var e = Math.min(s1, s + WIN), buf = await VE.pcm(m, s, e), i0 = Math.round((s - s0) * rate), cnt = Math.min(n - i0, Math.round((e - s) * rate));
			if (buf && cnt > 0) V.mixInto(out, i0, cnt, buf, s, 1 / rate, null);
			if (onProgress) onProgress((e - s0) / (s1 - s0));
		}
		return out;
	};
	VE.makePeaks = async function (m) {
		var parts = [], wp = [], total = 0, wt = 0;
		for (var w = 0; w * WIN < m.dur; w++) { var p = await win(m, w); var pk = V.peaks(p.ch, p.rate, 50); parts.push(pk); wp.push(V.wave(p.ch, p.rate, V.WAVE_RATE)); total += pk.length; wt += wp[wp.length - 1].pk.length; }
		var out = new Uint8Array(total), wpk = new Uint8Array(wt), wrm = new Uint8Array(wt), o = 0, o2 = 0;
		parts.forEach(function (p, k) { out.set(p, o); o += p.length; wpk.set(wp[k].pk, o2); wrm.set(wp[k].rms, o2); o2 += wp[k].pk.length; });
		m.peaks = out; m.wave = { pk: wpk, rms: wrm, r: V.WAVE_RATE }; VE.save(); VE.emit("thumbs", m);
	};

	/* ---------- noise-removed sound ---------- */
	VE.cleanCache = {};
	VE.cleanPcm = async function (key) {
		if (VE.cleanCache[key]) return VE.cleanCache[key];
		var v = await VE.idbGet("blobs", "c:" + key); if (!v) return null;
		var r = { start: v.a, rate: v.rate, ch: v.ch.map(function (b) { return new Float32Array(b); }) }; VE.cleanCache[key] = r; return r;
	};
	// the sound buffer a clip plays at source time s: noise-removed when it has one covering s
	VE.clipPcm = async function (c, s0, s1) {
		var m = VE.media(c.media); if (!m) return null;
		if (c.clean && c.clean.key) { var cp = await VE.cleanPcm(c.clean.key); if (cp && s0 >= cp.start - 0.01 && s1 <= cp.start + cp.ch[0].length / cp.rate + 0.35) return cp; }   // a little past the end = silence (the decoded sound can be a few frames shorter than the clip)
		return VE.pcm(m, s0, s1);
	};


	/* ---------- audio effects: sound levels (10 ms blocks) per media / noise-removed version, and the gain envelopes made from them ---------- */
	VE.levelCache = {}; var levelJobs = {}, envCache = {}, preCache = {};
	function lkey(c) { return c.media + "|" + (c.clean && c.clean.key ? c.clean.key : "o"); }
	VE.levelsFor = function (c) { return VE.levelCache[lkey(c)] || null; };
	// work out (once, then from IndexedDB) the levels of the sound a clip plays; resolves to them (null when there is no sound)
	VE.ensureLevels = function (c, onProgress) {
		var k = lkey(c); if (VE.levelCache[k]) return Promise.resolve(VE.levelCache[k]);
		if (levelJobs[k]) return levelJobs[k];
		var job = levelJobs[k] = (async function () {
			var saved = await VE.idbGet("blobs", "l:" + k).catch(function () { return null; });
			var lev = null;
			if (saved && saved.rms) lev = { start: saved.start, hop: saved.hop, rms: new Float32Array(saved.rms), peak: new Float32Array(saved.peak) };
			else {
				var m = VE.media(c.media); if (!m || !m.hasAudio) return null;
				var meter = new V.LevelMeter(48000, 0.01), start = 0, cp = c.clean && c.clean.key ? await VE.cleanPcm(c.clean.key) : null;
				if (cp) {
					start = cp.start; var n = cp.ch[0].length, step = 480000;
					for (var i = 0; i < n; i += step) { meter.push(cp.ch.map(function (x) { return x.subarray(i, Math.min(n, i + step)); })); if (onProgress) onProgress(i / n); await new Promise(function (r) { setTimeout(r, 0); }); }
				} else {
					for (var s = 0; s < m.dur; s += 10) { meter.push(await VE.pcmRange(m, s, Math.min(m.dur, s + 10))); if (onProgress) onProgress(s / m.dur); }
				}
				lev = meter.result(start);
				VE.idbPut("blobs", "l:" + k, { start: lev.start, hop: lev.hop, rms: lev.rms.buffer, peak: lev.peak.buffer }).catch(function () { /* kept in memory only */ });
			}
			VE.levelCache[k] = lev; VE.emit("levels", k);
			return lev;
		})();
		job.then(function () { delete levelJobs[k]; }, function () { delete levelJobs[k]; });
		return job;
	};
	// make sure every clip that needs levels has them (clips with effects on, and the clips a ducked clip listens to)
	VE.ensureAllFx = async function (onProgress) {
		var p = VE.P, need = [], duck = p.clips.some(function (c) { return VE.hasSound(c) && c.afx && c.afx.duck && c.afx.duck.on; });
		p.clips.forEach(function (c) { if (VE.hasSound(c) && (V.afxOn(c) || duck)) need.push(c); });
		for (var j = 0; j < need.length; j++) { try { await VE.ensureLevels(need[j], onProgress ? function (x) { onProgress((j + x) / need.length); } : null); } catch (e) { if (window.console) console.warn("[video editor] levels", e); } }
	};
	VE.fxBusy = function () { return Object.keys(levelJobs).length > 0; };
	VE.fxEnv = function (c) {
		var lev = VE.levelsFor(c); if (!lev) return null;
		var A = V.afxOf(c), key = lkey(c) + JSON.stringify([A.level.on ? A.level : 0, A.comp.on ? A.comp : 0]);
		if (envCache[key]) return envCache[key];
		var ks = Object.keys(envCache); if (ks.length > 60) envCache = {};
		return (envCache[key] = V.fxEnvelope(lev, A));
	};
	function prefixFor(o, lev, gate) { var k = lkey(o) + "@" + gate; return preCache[k] || (preCache[k] = V.activePrefix(lev, gate)); }
	// the effects' gain for clip c at timeline time t (1 when it has none, or its levels are not ready yet)
	VE.fxGainAt = function (c, t) {
		if (!V.afxOn(c)) return 1;
		var A = V.afxOf(c), g = 1, p = VE.P;
		if (A.level.on || A.comp.on) { var env = VE.fxEnv(c); if (env) g *= V.envAt(env, V.srcAt(c, t)); }
		if (A.duck.on) {
			var pres = 0;
			for (var j = 0; j < p.clips.length; j++) {
				var o = p.clips[j]; if (o === c || !VE.hasSound(o) || (o.afx && o.afx.duck && o.afx.duck.on) || !V.active(o, t)) continue;
				var lv = VE.levelsFor(o); if (!lv || V.gainAt(p, o, t) <= 0) continue;
				pres = Math.max(pres, V.presenceAt(lv, prefixFor(o, lv, A.duck.gate), V.srcAt(o, t), 0.25));
			}
			if (pres > 0) g *= V.fromDb(-A.duck.amt * pres);
		}
		return g;
	};
	VE.fxFn = function (c) { return V.afxOn(c) ? function (t) { return VE.fxGainAt(c, t); } : null; };

	/* ---------- the compositor ---------- */
	// draw the frame at t onto ctx (W x H). src(clip) -> { img, w, h, rot } for video / image clips (rot only for raw decoded frames)
	VE.draw = function (ctx, W, H, t, src, opt) {
		opt = opt || {};
		ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = VE.P.bg || "#000"; ctx.fillRect(0, 0, W, H);
		if (opt.clip) { ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); }
		var L = V.layersAt(VE.P, t);
		for (var j = 0; j < L.length; j++) {
			var c = L[j].clip, pos = L[j].pos || V.posAt(c, t); ctx.globalAlpha = L[j].alpha;
			if (c.type === "text") { drawText(ctx, c, W, H, pos); continue; }
			var s = src(c, L[j].src); if (!s || !s.img) continue;
			var r = V.place(s.w, s.h, pos, W, H), turned = !!pos.rot;
			if (turned) { ctx.save(); ctx.translate(r.dx + r.dw / 2, r.dy + r.dh / 2); ctx.rotate(pos.rot * Math.PI / 180); ctx.translate(-(r.dx + r.dw / 2), -(r.dy + r.dh / 2)); }
			try {
				if (s.rot) {   // a raw decoded frame of a turned phone video: crop in the turned picture, then draw
					var tmp = VE.tmpCanvas("rot", s.w, s.h); tmp.ctx.setTransform(1, 0, 0, 1, 0, 0); tmp.ctx.clearRect(0, 0, s.w, s.h); drawFrame(tmp.ctx, s.img, s.rot, 0, 0, s.w, s.h);
					ctx.drawImage(tmp.canvas, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
				} else ctx.drawImage(s.img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
			} catch (e) { /* a frame that is not ready yet */ }
			if (turned) ctx.restore();
		}
		ctx.restore();
		return L;
	};
	var tmps = {};
	VE.tmpCanvas = function (k, w, h) {
		var t = tmps[k]; if (!t) { var cv = document.createElement("canvas"); t = tmps[k] = { canvas: cv, ctx: cv.getContext("2d") }; }
		if (t.canvas.width !== w || t.canvas.height !== h) { t.canvas.width = w; t.canvas.height = h; }
		return t;
	};
	// a title: lines of text in a rounded box, centred at (x, y); returns its rectangle on the frame
	function textBox(ctx, c, W, H, pos) {
		pos = pos || c;
		var T = c.text || V.TEXT_DEFAULT, px = Math.max(4, T.size * H * (pos.scale || 1)), lines = String(T.s || "").split("\n");
		ctx.font = (T.italic ? "italic " : "") + (T.bold ? "700 " : "400 ") + px + "px " + (T.font || "Arial, sans-serif");
		var wmax = 0; lines.forEach(function (l) { wmax = Math.max(wmax, ctx.measureText(l).width); });
		var lh = px * 1.22, pad = px * 0.4, bw = wmax + pad * 2, bh = lines.length * lh + pad * 1.2;
		return { px: px, lines: lines, lh: lh, pad: pad, dx: pos.x * W - bw / 2, dy: pos.y * H - bh / 2, dw: bw, dh: bh, T: T };
	}
	function drawText(ctx, c, W, H, pos) {
		var b = textBox(ctx, c, W, H, pos), T = b.T, rot = pos && pos.rot;
		if (rot) { ctx.save(); ctx.translate(b.dx + b.dw / 2, b.dy + b.dh / 2); ctx.rotate(rot * Math.PI / 180); ctx.translate(-(b.dx + b.dw / 2), -(b.dy + b.dh / 2)); }
		if (T.bgOn) { ctx.save(); ctx.globalAlpha *= T.bgOp == null ? 0.55 : T.bgOp; ctx.fillStyle = T.bg || "#000"; roundRect(ctx, b.dx, b.dy, b.dw, b.dh, b.px * 0.25); ctx.fill(); ctx.restore(); }
		ctx.textBaseline = "middle"; ctx.textAlign = T.align || "center";
		var x = T.align === "left" ? b.dx + b.pad : T.align === "right" ? b.dx + b.dw - b.pad : b.dx + b.dw / 2;
		b.lines.forEach(function (l, k) {
			var y = b.dy + b.pad * 0.6 + b.lh * (k + 0.5);
			if (T.shadow) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = b.px * 0.12; ctx.shadowOffsetY = b.px * 0.05; ctx.fillStyle = T.color; ctx.fillText(l, x, y); ctx.restore(); }
			if (T.outline > 0) { ctx.lineWidth = T.outline * b.px * 0.08; ctx.strokeStyle = T.ocolor || "#000"; ctx.lineJoin = "round"; ctx.strokeText(l, x, y); }
			ctx.fillStyle = T.color || "#fff"; ctx.fillText(l, x, y);
		});
		if (rot) ctx.restore();
		return b;
	}
	function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
	// rectangle of a clip on a W x H frame (for selecting / dragging in the preview)
	// pos = the animated position to use (default: the one at the playhead); the result carries .rot (degrees, about its centre)
	VE.rectOf = function (ctx, c, W, H, pos) {
		pos = pos || V.posAt(c, VE.t);
		var r;
		if (c.type === "text") r = textBox(ctx, c, W, H, pos);
		else { var m = VE.media(c.media); if (!m || !m.w) return null; r = V.place(m.w, m.h, pos, W, H); }
		r.rot = pos.rot || 0; r.pos = pos;
		return r;
	};
	VE.mediaDur = function (c) { if (c.type === "text") return Infinity; var m = VE.media(c.media); return !m ? Infinity : m.kind === "image" ? Infinity : m.dur; };
	VE.hasSound = function (c) { if ((c.type !== "video" && c.type !== "audio") || c.noAudio) return false; var m = VE.media(c.media); return !!(m && m.hasAudio); };

	/* ---------- restore the last session ---------- */
	VE.restore = async function () {
		try {
			var pj = await VE.idbGet("kv", "project"), meta = await VE.idbGet("kv", "bin");
			if (!pj) return false;
			VE.P = V.normalize(JSON.parse(pj));
			VE.bin = (meta || []).map(function (x) { return Object.assign({}, x, { state: "working", status: "Opening..." }); });
			VE.hist = new V.History(200); VE.hist.push(JSON.stringify(VE.P));
			VE.emit("change", "restore"); VE.emit("bin");
			for (var j = 0; j < VE.bin.length; j++) {
				var m = VE.bin[j], f = await VE.idbGet("blobs", "m:" + m.id);
				if (!f) { m.state = "missing"; m.status = "Missing: add " + (m.origName || m.name) + " again to relink it."; VE.emit("binItem", m); continue; }
				m.file = f instanceof File ? f : new File([f], m.name, { type: f.type });
				VE.prepare(m, false);
			}
			return true;
		} catch (e) { if (window.console) console.warn("[video editor] restore", e); return false; }
	};
	// a dropped file that matches a missing media item (same name + size) fills it in
	VE.relink = function (file) {
		var m = VE.bin.filter(function (x) { return x.state === "missing" && (x.name === file.name || x.origName === file.name); })[0];
		if (!m) return false;
		m.file = file; m.state = "working"; m.status = "Opening..."; m.size = file.size; if (m.origName === file.name) { m.converted = false; m.thumbTimes = null; }
		VE.prepare(m, true); return true;
	};
	// point every clip that uses media `from` at media `to` (a missing file replaced by one already in the bin)
	VE.repoint = function (from, to) {
		var n = 0;
		VE.P.clips.forEach(function (c) { if (c.media === from) { c.media = to; n++; } });
		var old = VE.media(from); if (old && old.state === "missing") { VE.bin = VE.bin.filter(function (x) { return x !== old; }); VE.idbDel("blobs", "m:" + from).catch(function () { }); }
		if (n) VE.commit("Connect media"); VE.emit("bin");
		return n;
	};
	VE.clearAll = async function () {
		VE.bin.forEach(function (m) { if (m.url) try { URL.revokeObjectURL(m.url); } catch (e) { /* ignore */ } });
		VE.bin = []; VE.P = V.newProject(); VE.sel = []; VE.t = 0; VE.hist = new V.History(200); VE.hist.push(JSON.stringify(VE.P)); VE.cleanCache = {}; VE.levelCache = {}; envCache = {}; preCache = {};
		try { await tx("blobs", "readwrite", function (s) { s.clear(); }); await tx("kv", "readwrite", function (s) { s.clear(); }); } catch (e) { /* ignore */ }
		VE.emit("bin"); VE.emit("change", "new");
	};
})();
