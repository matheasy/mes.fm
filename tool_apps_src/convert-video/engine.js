/* MESConvEngine: turn any video file into an MP4 (H.264 + AAC). Shared by mes.fm/convert-video and the MES Video Editor (mes.fm/video).
 *  - "native": an AVI whose picture is already H.264 is re-packed (remuxed) without touching the picture: our own AVI reader (MESConv) walks the
 *    file once in big slices (OpenDML files over 1 GB too), H.264 is copied into MP4 (B-frames get their presentation order from the slice headers),
 *    MP3 / PCM sound is decoded and made AAC with WebCodecs, AAC is copied. mp4-muxer writes the MP4, straight to disk when given a file handle.
 *  - "ffmpeg": everything else (MKV, WMV, FLV, MPG, MOV, WebM, other AVIs) goes through ffmpeg.wasm (@ffmpeg/ffmpeg 0.12.15, self-hosted in
 *    /main_js/ffmpeg/ so its worker is same-origin; @ffmpeg/core 0.12.10 single-threaded from jsDelivr, ~31 MB, downloaded on first use).
 *    The input is mounted (WORKERFS: not copied into memory); H.264 is copied, anything else is encoded with x264; the result is held in memory.
 * Nothing is uploaded. */
(function () {
	"use strict";
	var C = window.MESConv; if (!C) return;
	var LIB = { mp4: "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js" };
	var FF_MOD = "/main_js/ffmpeg/0.12.15/index.js", FF_CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/";
	var scripts = {};
	function loadScript(u) { if (!scripts[u]) scripts[u] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { delete scripts[u]; rej(new Error("Could not load a converter library. Check your connection and try again.")); }; document.head.appendChild(s); }); return scripts[u]; }
	function signal() { var w = []; return { wait: function (ms) { return new Promise(function (r) { var t = setTimeout(done, ms || 250); function done() { clearTimeout(t); r(); } w.push(done); }); }, wake: function () { var a = w; w = []; for (var j = 0; j < a.length; j++) a[j](); } }; }

	/* ---------- a sequential reader over a File with a big window ---------- */
	function Reader(file, win) { this.f = file; this.win = win || 16777216; this.base = 0; this.buf = new Uint8Array(0); }
	Reader.prototype.read = async function (off, len) {
		if (off >= this.base && off + len <= this.base + this.buf.length) return this.buf.subarray(off - this.base, off - this.base + len);
		if (len > this.win / 2) return new Uint8Array(await this.f.slice(off, off + len).arrayBuffer());
		var end = Math.min(this.f.size, off + Math.max(this.win, len));
		this.buf = new Uint8Array(await this.f.slice(off, end).arrayBuffer()); this.base = off;
		return this.buf.subarray(0, Math.min(len, this.buf.length));
	};

	/* ---------- probe ---------- */
	// -> { container, route: {engine, why}, avi?, hdr?, h264?, size, name }
	async function probe(file) {
		var ext = C.extOf(file.name), head = new Uint8Array(await file.slice(0, 1048576).arrayBuffer()), r = { name: file.name, size: file.size, container: ext };
		if (head.length >= 12 && C.fourcc(head, 0) === "RIFF" && C.fourcc(head, 8) === "AVI ") {
			r.container = "avi";
			var hdr = C.parseAviHeader(head);
			if (!hdr.ok && hdr.needBytes) hdr = C.parseAviHeader(new Uint8Array(await file.slice(0, hdr.needBytes).arrayBuffer()));
			if (hdr.ok) {
				r.hdr = hdr; r.avi = C.describeAvi(hdr);
				if (r.avi.h264 && !r.avi.reasons.length) {
					try { var sc = await scanH264(file, hdr, r.avi, 400); Object.assign(r, sc); } catch (e) { r.avi.reasons.push("the H.264 picture could not be read (" + (e.message || e) + ")"); }
					if (r.avi.audioKind === "mp3" || r.avi.audioKind === "pcm" || r.avi.audioKind === "pcmf") {
						var ok = await audioPathOk(r.avi.audio);
						if (!ok) r.avi.reasons.push("this browser cannot convert the sound");
					}
					if (r.hasB && r.pocType !== 0) r.avi.reasons.push("B-frames of a kind this page cannot reorder");
				}
			}
		}
		r.route = C.route(r);
		return r;
	}
	async function audioPathOk(a) {
		if (!window.AudioEncoder) return false;
		var ch = Math.min(2, a.channels || 2), sr = a.sampleRate || 48000;
		try { var e = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: sr, numberOfChannels: ch, bitrate: 192000 }); if (!e || !e.supported) return false; } catch (x) { return false; }
		if (a.kind === "mp3") { try { var d = await AudioDecoder.isConfigSupported({ codec: "mp3", sampleRate: sr, numberOfChannels: ch }); return !!(d && d.supported); } catch (x) { return false; } }
		return true;
	}
	// walk every chunk of the movi lists (and the AVIX parts of an OpenDML file); cb(id, stream, offset, size) -> false to stop
	async function walk(file, hdr, cb, onBytes) {
		var rd = new Reader(file), pos = 12, n = file.size, guard = 0;
		while (pos + 8 <= n) {
			var h = await rd.read(pos, 12), id = C.fourcc(h, 0), size = C.u32le(h, 4);
			if (!/^[\x20-\x7e]{4}$/.test(id)) { pos++; if (++guard > 65536) break; continue; }   // damaged: look for the next chunk
			guard = 0;
			if (id === "RIFF") { pos += 12; continue; }
			if (id === "LIST") { var lt = C.fourcc(h, 8); if (lt === "movi" || lt === "rec ") { pos += 12; continue; } pos += 8 + size + (size & 1); continue; }
			var st = C.streamOf(id);
			if (st >= 0) {
				if (pos + 8 + size > n) break;   // a cut-off file: stop at the last whole chunk
				var go = await cb(id, st, pos + 8, size, rd);
				if (go === false) return;
			}
			pos += 8 + size + (size & 1);
			if (onBytes) onBytes(pos);
		}
	}
	function nalsOf(data, lenSize) { return C.isAnnexB(data) ? C.splitAnnexB(data) : C.splitAvcc(data, lenSize || 4); }
	// read the first frames: parameter sets, B-frames, how far frames are reordered
	async function scanH264(file, hdr, avi, max) {
		var r = { sps: null, spsList: [], ppsList: [], lenSize: 4, hasB: false, pocType: -1, delay: 0, firstKey: -1 }, ex = avi.extra, info = null;
		if (ex && ex.length) {
			var ac = C.parseAvcC(ex);
			if (ac) { r.spsList = ac.sps; r.ppsList = ac.pps; r.lenSize = ac.lenSize; }
			else if (C.isAnnexB(ex)) C.splitAnnexB(ex).forEach(function (n) { var t = n[0] & 31; if (t === 7) r.spsList.push(n.slice()); if (t === 8) r.ppsList.push(n.slice()); });
		}
		var count = 0, pocState = {}, pairs = [], dIdx = 0, ro = new C.Reorder(function (d, p) { pairs.push([d, p]); }, 16);
		await walk(file, hdr, async function (id, st, off, size, rd) {
			if (st !== avi.videoStream || !size) return true;
			var data = await rd.read(off, size), nals = nalsOf(data, r.lenSize), au = C.inspectAU(nals);
			if (au.sps.length && !r.spsList.length) r.spsList = au.sps.map(function (x) { return x.slice(); });
			if (au.pps.length && !r.ppsList.length) r.ppsList = au.pps.map(function (x) { return x.slice(); });
			if (!info && r.spsList.length) { info = C.parseSps(r.spsList[0]); r.sps = info; r.pocType = info.pocType; }
			if (au.vcl && info) {
				var sl = C.parseSlice(au.vcl, info);
				if (r.firstKey < 0 && (au.idr || sl.type === 2)) r.firstKey = count;
				if (sl.type === 1) r.hasB = true;
				if (info.pocType === 0 && r.firstKey >= 0) ro.push(dIdx++, C.pocType0(pocState, sl, info), au.idr);
			}
			return ++count < max;
		});
		ro.flush();
		if (!r.spsList.length || !r.ppsList.length) throw new Error("no SPS / PPS");
		r.delay = r.hasB ? C.reorderDelay(pairs) : 0;
		r.codedWidth = info.width; r.codedHeight = info.height; r.codec = C.codecString(r.spsList[0]); r.bitDepth = info.bitDepth || 8;
		return r;
	}

	/* ---------- native AVI (H.264) -> MP4 remux ---------- */
	async function remuxAvi(file, p, opts) {
		await loadScript(LIB.mp4);
		var avi = p.avi, dur = avi.frameDur, us = function (s) { return Math.round(s * 1e6); }, failed = null, notes = [];
		var writable = null, target;
		if (opts.handle) { writable = await opts.handle.createWritable(); target = new Mp4Muxer.FileSystemWritableFileStreamTarget(writable); } else target = new Mp4Muxer.ArrayBufferTarget();
		var a = avi.audio, kind = avi.audioKind, hasAudio = kind === "mp3" || kind === "pcm" || kind === "pcmf" || kind === "aac";
		var ach = a ? Math.min(2, a.channels || 2) : 2, asr = a ? a.sampleRate : 48000;
		var w = p.codedWidth || avi.width, h = p.codedHeight || avi.height, fpsInt = Math.abs(avi.fps - Math.round(avi.fps)) < 1e-6 ? Math.round(avi.fps) : 0;
		var vOpts = { codec: "avc", width: w, height: h }; if (fpsInt && !p.hasB) vOpts.frameRate = fpsInt;
		var mOpts = { target: target, video: vOpts, fastStart: opts.handle ? false : "in-memory", firstTimestampBehavior: "offset" };
		var aacAsc = null;
		if (hasAudio) mOpts.audio = { codec: "aac", numberOfChannels: ach, sampleRate: asr };
		var muxer = new Mp4Muxer.Muxer(mOpts), sig = signal();
		function fail(e) { if (!failed) failed = e instanceof Error ? e : new Error(String(e && e.message || e)); sig.wake(); }
		// sound
		var adec = null, aenc = null, aIdx = 0, aSamples = 0, mp3 = null, aStart = a ? a.start * a.scale / a.rate : 0;
		if (hasAudio && kind !== "aac") {
			aenc = new AudioEncoder({ output: function (c, m) { try { muxer.addAudioChunk(c, m); } catch (e) { fail(e); } }, error: fail });
			aenc.configure({ codec: "mp4a.40.2", sampleRate: asr, numberOfChannels: ach, bitrate: ach > 1 ? 192000 : 128000 });
			aenc.addEventListener("dequeue", sig.wake);
			if (kind === "mp3") {
				mp3 = new C.Mp3Splitter();
				adec = new AudioDecoder({ output: function (ad) { try { if (!failed) aenc.encode(downmix(ad, ach)); } catch (e) { fail(e); } ad.close(); }, error: fail });
				adec.configure({ codec: "mp3", sampleRate: asr, numberOfChannels: a.channels || 2 });
				adec.addEventListener("dequeue", sig.wake);
			}
		} else if (kind === "aac" && a.extra && a.extra.length >= 2) aacAsc = a.extra;
		function downmix(ad, ch) {
			if (ad.numberOfChannels <= ch && ad.format === "f32-planar") return ad;
			var n = ad.numberOfFrames, out = new Float32Array(n * ch), tmp = new Float32Array(n);
			for (var c = 0; c < ch; c++) { ad.copyTo(tmp, { planeIndex: Math.min(c, ad.numberOfChannels - 1), format: "f32-planar" }); out.set(tmp, c * n); }
			return new AudioData({ format: "f32-planar", sampleRate: ad.sampleRate, numberOfFrames: n, numberOfChannels: ch, timestamp: ad.timestamp, data: out });
		}
		async function waitQueues() {
			while (!failed && ((aenc && aenc.encodeQueueSize > 24) || (adec && adec.decodeQueueSize > 24))) await sig.wait(500);
		}
		async function onAudio(data) {
			if (kind === "aac") {
				var d = data;
				if (d.length > 7 && d[0] === 0xff && (d[1] & 0xf0) === 0xf0) {   // ADTS: take the config from the header, strip it
					if (!aacAsc) { var prof = ((d[2] >> 6) & 3) + 1, sri = (d[2] >> 2) & 15, chc = ((d[2] & 1) << 2) | (d[3] >> 6); aacAsc = new Uint8Array([(prof << 3) | (sri >> 1), ((sri & 1) << 7) | (chc << 3)]); }
					d = d.subarray((d[1] & 1) ? 7 : 9);
				}
				if (!aacAsc) { aacAsc = new Uint8Array([0x12, 0x10]); notes.push("(the AAC sound had no setup data; assumed 44.1 kHz stereo)"); }
				var ts = aStart + aIdx * 1024 / asr, meta = aIdx === 0 ? { decoderConfig: { codec: "mp4a.40.2", sampleRate: asr, numberOfChannels: ach, description: aacAsc } } : undefined;
				muxer.addAudioChunkRaw(d.slice(), "key", us(ts), us(1024 / asr), meta); aIdx++;
				return;
			}
			if (kind === "mp3") {
				var frames = mp3.push(data);
				for (var j = 0; j < frames.length; j++) {
					var fr = frames[j];
					adec.decode(new EncodedAudioChunk({ type: "key", timestamp: us(aStart + aSamples / fr.h.sampleRate), duration: us(fr.h.samples / fr.h.sampleRate), data: fr.data }));
					aSamples += fr.h.samples;
				}
				await waitQueues(); return;
			}
			var bits = a.bits || 16, planar = C.pcmToPlanar(data, a.channels || 2, bits, kind === "pcmf");
			if (!planar[0].length) return;
			var n = planar[0].length, buf = new Float32Array(n * ach);
			for (var c = 0; c < ach; c++) buf.set(planar[Math.min(c, planar.length - 1)], c * n);
			aenc.encode(new AudioData({ format: "f32-planar", sampleRate: asr, numberOfFrames: n, numberOfChannels: ach, timestamp: us(aStart + aSamples / asr), data: buf }));
			aSamples += n; await waitQueues();
		}
		// picture
		var spsKey = p.spsList.map(function (x) { return x.join(","); }).join("|"), avcc = C.avcC(p.spsList, p.ppsList), first = true, slot = -1, dIdx = 0, seen = false, skipped = 0;
		var pend = [], ro = null, vStart = 0, D = p.delay || 0, info = p.sps, pocState = {};
		var vs = p.hdr.streams[avi.videoStream]; if (vs) vStart = vs.start * vs.scale / vs.rate;
		if (p.hasB) ro = new C.Reorder(function (d, disp) {
			var f = pend.shift();   // frames come out in decode order: the oldest pending one is d
			var pts = (disp + D) * dur, dts = d * dur; if (pts < dts) pts = dts;
			addVideo(f.data, f.key, pts, dts);
		}, 16);
		function addVideo(data, key, pts, dts) {
			var meta = first ? { decoderConfig: { codec: p.codec, codedWidth: w, codedHeight: h, description: avcc } } : undefined; first = false;
			try { muxer.addVideoChunkRaw(data, key ? "key" : "delta", us(vStart + pts), us(dur), meta, ro ? us(pts - dts) : undefined); } catch (e) { fail(e); }
		}
		function onVideo(data) {
			slot++;
			if (!data.length) return;   // a dropped / repeated frame: the previous one stays on screen longer
			var nals = nalsOf(data, p.lenSize), au = C.inspectAU(nals), sl = au.vcl && info ? C.parseSlice(au.vcl, info) : null;
			var key = au.idr || (!seen && sl && sl.type === 2) || (au.recovery && sl && sl.type === 2);
			if (!seen) { if (!key) { skipped++; return; } seen = true; }
			// parameter sets live in the MP4 header (avcC); keep them in the frame only when they change mid-stream
			var newPs = au.sps.length > 0 && au.sps.map(function (x) { return x.join(","); }).join("|") !== spsKey;
			var keep = nals.filter(function (n) { var t = n[0] & 31; if (t === 9 || t === 12) return false; if (t === 7 || t === 8) return newPs; return true; });
			var out = C.toAvcc(keep);
			if (ro) { pend.push({ data: out, key: key }); ro.push(dIdx++, C.pocType0(pocState, sl, info), au.idr); }
			else addVideo(out, key, (slot - firstSlot()) * dur, 0);
		}
		var fs = -1; function firstSlot() { if (fs < 0) fs = slot; return fs; }
		var lastPct = -1;
		await walk(file, p.hdr, async function (id, st, off, size, rd) {
			if (failed || (opts.cancelled && opts.cancelled())) return false;
			if (st === avi.videoStream) onVideo(size ? (await rd.read(off, size)).slice() : new Uint8Array(0));
			else if (hasAudio && st === avi.audioStream && size) await onAudio((await rd.read(off, size)).slice());
			return true;
		}, function (pos) { var pc = Math.floor(pos / file.size * 1000); if (pc !== lastPct) { lastPct = pc; opts.onProgress && opts.onProgress(pos / file.size); } });
		if (ro) ro.flush();
		if (opts.cancelled && opts.cancelled()) { try { if (writable) await writable.abort(); } catch (e) { /* ignore */ } throw new Error("Cancelled."); }
		if (adec) { if (mp3) { /* the last frame left in the splitter */ var tail = mp3.push(new Uint8Array(0)); tail.forEach(function (fr) { adec.decode(new EncodedAudioChunk({ type: "key", timestamp: us(aStart + aSamples / fr.h.sampleRate), data: fr.data })); aSamples += fr.h.samples; }); } await adec.flush(); }
		if (aenc) await aenc.flush();
		if (failed) { try { if (writable) await writable.abort(); } catch (e) { /* ignore */ } throw failed; }
		if (first) throw new Error("No picture frames were found in this AVI.");
		muxer.finalize();
		if (skipped) notes.push("(" + skipped + " frame" + (skipped > 1 ? "s" : "") + " before the first key frame could not be shown and were left out)");
		if (p.hasB) notes.push("(B-frames reordered)");
		if (writable) { await writable.close(); var fh = await opts.handle.getFile(); return { size: fh.size, handle: opts.handle, note: notes.join(" "), engine: "native" }; }
		var blob = new Blob([target.buffer], { type: "video/mp4" });
		return { blob: blob, size: blob.size, note: notes.join(" "), engine: "native" };
	}

	/* ---------- ffmpeg.wasm ---------- */
	var ff = null, ffLoading = null, ffLog = [], ffJob = 0;
	function ffmpeg(onStatus) {
		if (ff) return Promise.resolve(ff);
		if (!ffLoading) ffLoading = (async function () {
			var mod = await import(FF_MOD), inst = new mod.FFmpeg();
			inst.on("log", function (e) { ffLog.push(e.message); if (ffLog.length > 4000) ffLog.splice(0, 2000); if (ffmpeg.onLog) ffmpeg.onLog(e.message); });
			// the 31 MB core, with a progress bar (the browser keeps it in its cache for next time)
			var res = await fetch(FF_CORE + "ffmpeg-core.wasm"); if (!res.ok) throw new Error("Could not download the converter (" + res.status + ").");
			var total = +res.headers.get("content-length") || 32232419, got = 0, parts = [], rdr = res.body.getReader();
			while (true) { var x = await rdr.read(); if (x.done) break; parts.push(x.value); got += x.value.length; if (onStatus) onStatus("Downloading the converter, once: " + Math.min(99, Math.round(got / total * 100)) + "% of about 31 MB", got / total); }
			var wasmURL = URL.createObjectURL(new Blob(parts, { type: "application/wasm" }));
			if (onStatus) onStatus("Starting the converter...", 1);
			await inst.load({ coreURL: FF_CORE + "ffmpeg-core.js", wasmURL: wasmURL });
			ff = inst; return inst;
		})().catch(function (e) { ffLoading = null; throw e; });
		return ffLoading;
	}
	async function ffProbe(file, dir) {
		ffLog = []; await ff.exec(["-hide_banner", "-i", dir + "/" + file.name]);
		return C.parseFfmpegLog(ffLog.join("\n"));
	}
	async function convertFfmpeg(file, p, opts) {
		var inst = await ffmpeg(opts.onStatus), dir = "/in" + (++ffJob), out = "/out" + ffJob + ".mp4", cancelled = false, tick = null;
		await inst.createDir(dir); await inst.mount("WORKERFS", { files: [file] }, dir);
		try {
			var probe = await ffProbe(file, dir), plan = C.ffmpegPlan(probe, dir + "/" + file.name, out, { quality: opts.quality, reencode: opts.reencode });
			if (!plan.ok) throw new Error(plan.error);
			if (opts.onPlan) opts.onPlan(plan);
			ffmpeg.onLog = function (line) { var t = C.ffmpegTime(line); if (t != null && plan.duration && opts.onProgress) opts.onProgress(Math.min(0.99, t / plan.duration)); };
			if (opts.cancelled) tick = setInterval(function () { if (opts.cancelled() && !cancelled) { cancelled = true; try { inst.terminate(); } catch (e) { /* ignore */ } ff = null; ffLoading = null; } }, 300);
			ffLog = [];
			var code = await inst.exec(plan.args);
			if (cancelled) throw new Error("Cancelled.");
			if (code !== 0) { var errLine = ffLog.filter(function (l) { return /error|invalid|not supported|could not/i.test(l); }).slice(-2).join(" "); throw new Error("ffmpeg could not convert this file" + (errLine ? ": " + errLine : ".")); }
			var data = await inst.readFile(out); try { await inst.deleteFile(out); } catch (e) { /* ignore */ }
			var note = plan.copyVideo ? "(picture copied as it is" + (plan.hasAudio ? plan.copyAudio ? ", sound copied)" : ", sound made AAC)" : ")") : "(picture re-encoded with x264" + (plan.video ? " from " + plan.video.codec : "") + ")";
			var res = { size: data.length, note: note, engine: "ffmpeg", plan: plan };
			if (opts.handle) { var wr = await opts.handle.createWritable(); await wr.write(data); await wr.close(); res.handle = opts.handle; }
			else res.blob = new Blob([data], { type: "video/mp4" });
			return res;
		} catch (e) {
			if (cancelled) throw new Error("Cancelled.");
			if (/memory|OOM|Aborted/i.test(String(e && e.message))) { ff = null; ffLoading = null; throw new Error("The converter ran out of memory. ffmpeg in a web page can only hold about 1.5 GB: try a smaller file."); }
			throw e;
		} finally {
			clearInterval(tick); ffmpeg.onLog = null;
			if (ff) { try { await inst.unmount(dir); await inst.deleteDir(dir); } catch (e) { /* ignore */ } }
		}
	}

	/* ---------- sound only (for the Audio Editor and the Video Editor) ---------- */
	// -> { channels: Float32Array[], sampleRate } (PCM, ffmpeg) or { encoded: ArrayBuffer, kind } (MP3 / ADTS AAC bytes for decodeAudioData).
	// opts: { onStatus(text, f), onProgress(f) }. AVI with MP3 / PCM / AAC sound: our own reader, no download. Anything else: ffmpeg.wasm.
	async function extractAudio(file, opts) {
		opts = opts || {};
		var p = null;
		try { p = await probe(file); } catch (e) { p = null; }
		var avi = p && p.avi, kind = avi && avi.audioKind;
		if (p && p.container === "avi" && p.hdr) {
			if (kind === "none") throw new Error("this video has no sound track");
			if (["mp3", "pcm", "pcmf", "aac"].indexOf(kind) >= 0) {
				try { return await aviAudio(file, p, opts); }
				catch (e) { if (window.console) console.warn("[audio] AVI reader failed, trying ffmpeg", e); }
			}
		}
		return ffAudio(file, opts);
	}
	async function aviAudio(file, p, opts) {
		var avi = p.avi, a = avi.audio, kind = avi.audioKind, parts = [], total = 0, lastPct = -1;
		await walk(file, p.hdr, async function (id, st, off, size, rd) {
			if (st !== avi.audioStream || !size) return;
			var d = (await rd.read(off, size)).slice();
			if (kind === "aac" && !C.isAdts(d)) d = C.adtsFrame(d, a.extra && a.extra.length >= 2 ? a.extra : null);
			parts.push(d); total += d.length;
		}, function (pos) { var pc = Math.floor(pos / file.size * 100); if (pc !== lastPct) { lastPct = pc; if (opts.onProgress) opts.onProgress(pos / file.size); } });
		if (!total) throw new Error("this video has no sound track");
		var all = new Uint8Array(total), o = 0; parts.forEach(function (x) { all.set(x, o); o += x.length; });
		if (kind === "pcm" || kind === "pcmf") return { channels: C.pcmToPlanar(all, a.channels || 2, a.bits || 16, kind === "pcmf"), sampleRate: a.sampleRate, engine: "avi" };
		return { encoded: all.buffer, kind: kind, engine: "avi" };
	}
	async function ffAudio(file, opts) {
		var inst = await ffmpeg(opts.onStatus), dir = "/in" + (++ffJob), out = "/aud" + ffJob + ".raw";
		await inst.createDir(dir); await inst.mount("WORKERFS", { files: [file] }, dir);
		try {
			var info = await ffProbe(file, dir), dur = info.duration;
			if (!info.streams.some(function (s) { return s.type === "audio"; })) throw new Error("this file has no sound track");
			if (opts.onStatus) opts.onStatus("Reading the sound with ffmpeg", 0);
			ffmpeg.onLog = function (line) { var t = C.ffmpegTime(line); if (t != null && dur && opts.onProgress) opts.onProgress(Math.min(0.99, t / dur)); };
			ffLog = [];
			var code = await inst.exec(["-hide_banner", "-i", dir + "/" + file.name, "-vn", "-sn", "-dn", "-ac", "2", "-ar", "48000", "-f", "s16le", "-c:a", "pcm_s16le", out]);
			if (code !== 0) { var errLine = ffLog.filter(function (l) { return /error|invalid|not supported|could not/i.test(l); }).slice(-2).join(" "); throw new Error("ffmpeg could not read the sound" + (errLine ? ": " + errLine : ".")); }
			var data = await inst.readFile(out); try { await inst.deleteFile(out); } catch (e) { /* ignore */ }
			return { channels: C.s16Planar(data, 2), sampleRate: 48000, engine: "ffmpeg" };
		} catch (e) {
			if (/memory|OOM|Aborted/i.test(String(e && e.message))) { ff = null; ffLoading = null; throw new Error("the converter ran out of memory (ffmpeg in a web page holds about 1.5 GB)"); }
			throw e;
		} finally {
			ffmpeg.onLog = null;
			if (ff) { try { await inst.unmount(dir); await inst.deleteDir(dir); } catch (e) { /* ignore */ } }
		}
	}

	/* ---------- public ---------- */
	// opts: { handle (FileSystemFileHandle to write to), quality, reencode, onProgress(0..1), onStatus(text, pct), onPlan(plan), cancelled() }
	async function convert(file, opts) {
		opts = opts || {};
		var p = opts.probe || await probe(file);
		if (p.route.engine === "native" && !opts.reencode) {
			try { return await remuxAvi(file, p, opts); }
			catch (e) { if (/Cancelled/.test(e.message)) throw e; if (window.console) console.warn("[converter] native remux failed, trying ffmpeg", e); }
		}
		if (file.size > C.FFMPEG_SAFE_BYTES && opts.onStatus) opts.onStatus("This is a big file for ffmpeg in a web page (about 1.5 GB at most); it may run out of memory.", 0);
		return convertFfmpeg(file, p, opts);
	}
	window.MESConvEngine = { probe: probe, convert: convert, extractAudio: extractAudio, ffmpeg: ffmpeg, loadScript: loadScript, Reader: Reader };
})();
