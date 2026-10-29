/* MES Video Editor export: every frame is drawn by the compositor from frames decoded with WebCodecs (one VideoDecoder per visible clip,
 * read straight from the file's sample table), encoded to H.264 with VideoEncoder; the sound is mixed in 48 kHz blocks (volume, fades,
 * cross-fades, speed, noise-removed versions) and encoded to AAC; mp4-muxer writes the MP4, straight to disk when a file was chosen. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V;

	/* ---------- frames of one clip, in order ---------- */
	function VReader(m) { this.m = m; this.vt = m.vt; this.frames = []; this.sig = VE.signal(); this.dec = null; this.lastReq = -1; }
	VReader.prototype.start = function (s) {
		this.close(); var self = this, vt = this.vt;
		this.next = VE.keyBefore(vt, s); this.done = false; this.flushing = false; this.err = null;
		this.dec = new VideoDecoder({ output: function (f) { self.frames.push(f); self.sig.wake(); }, error: function (e) { self.err = e; self.sig.wake(); } });
		this.dec.configure({ codec: vt.codec, codedWidth: vt.cw, codedHeight: vt.ch, description: vt.desc });
		this.dec.addEventListener("dequeue", this.sig.wake);
	};
	VReader.prototype.feed = async function () {
		var vt = this.vt, i = this.next, j = Math.min(vt.n, i + 8), data = await VE.readSamples(this.m.file, vt, i, j);
		for (var k = 0; k < data.length; k++) this.dec.decode(new EncodedVideoChunk({ type: vt.key[i + k] ? "key" : "delta", timestamp: Math.round(vt.cts[i + k] * 1e6), duration: Math.round(vt.dur[i + k] * 1e6), data: data[k] }));
		this.next = j;
	};
	VReader.prototype.frameAt = async function (s) {
		var eps = 1e-4, vt = this.vt;
		if (!this.dec || s < this.lastReq - 1e-3) this.start(s);
		else { var kb = VE.keyBefore(vt, s); if (kb > this.next + 2 && this.frames.length && s > this.frames[this.frames.length - 1].timestamp / 1e6 + 1) this.start(s); }
		this.lastReq = s;
		while (true) {
			while (this.frames.length >= 2 && this.frames[1].timestamp / 1e6 <= s + eps) this.frames.shift().close();
			var last = this.frames.length ? this.frames[this.frames.length - 1].timestamp / 1e6 : -Infinity;
			if (last > s + eps || this.done) break;
			if (this.err) throw this.err;
			if (this.next < vt.n && this.dec.decodeQueueSize < 10) { await this.feed(); continue; }
			if (this.next >= vt.n && !this.flushing) { var self = this; this.flushing = true; this.dec.flush().then(function () { self.done = true; self.sig.wake(); }, function (e) { self.err = self.err || e; self.sig.wake(); }); continue; }
			await this.sig.wait(250);
		}
		return this.frames[0] || null;
	};
	VReader.prototype.close = function () { this.frames.forEach(function (f) { try { f.close(); } catch (e) { /* ignore */ } }); this.frames = []; if (this.dec) { try { this.dec.close(); } catch (e) { /* ignore */ } } this.dec = null; };

	/* ---------- sound ---------- */
	var RATE = 48000;
	async function mix(t0, n) {
		var out = [new Float32Array(n), new Float32Array(n)], p = VE.P, t1 = t0 + n / RATE;
		for (var j = 0; j < p.clips.length; j++) {
			var c = p.clips[j]; if (!VE.hasSound(c)) continue;
			if (t1 <= c.start - (c.xin || 0) || t0 >= V.end(c)) continue;
			var g = V.gainCurve(p, c, t0, n, RATE), any = false; for (var k = 0; k < n; k += 64) if (g[k] > 0) { any = true; break; }
			if (!any) continue;
			var sp = c.speed || 1, s0 = V.srcAt(c, t0), s1 = V.srcAt(c, t1), buf = await VE.clipPcm(c, Math.max(0, s0 - 0.02), Math.max(0, s1) + 0.02);
			if (buf) V.mixInto(out, 0, n, buf, s0, sp / RATE, g);
		}
		V.limit(out);
		return out;
	}
	VE.mixAudio = mix;

	/* ---------- export ---------- */
	// o: { w, h, fps, quality, a, b (timeline range), handle (FileSystemFileHandle), onProgress(frac, text), cancelled() }
	VE.exportVideo = async function (o) {
		await VE.loadScript(VE.LIB.mp4);
		var p = VE.P, W = o.w, H = o.h, fps = o.fps, a = o.a || 0, b = o.b || V.duration(p), N = Math.max(1, Math.round((b - a) * fps)), failed = null, t00 = performance.now();
		if (!(b > a)) throw new Error("There is nothing to export: the timeline is empty.");
		var missing = p.clips.filter(function (c) { if (c.type === "text") return false; var m = VE.media(c.media); return !m || m.state !== "ready"; });
		if (missing.length) throw new Error("Some clips' media is missing or still being prepared (" + missing.map(function (c) { var m = VE.media(c.media); return m ? m.name : "?"; }).filter(function (x, i, s) { return s.indexOf(x) === i; }).slice(0, 3).join(", ") + "). Wait for it, or add the file again.");
		var cfg = { codec: V.avcCodec(W, H, fps), width: W, height: H, bitrate: V.bitrate(W, H, fps, o.quality), bitrateMode: "variable", framerate: fps, latencyMode: "quality", avc: { format: "avc" } }, sup = null;
		var hws = ["prefer-hardware", "no-preference", "prefer-software"];
		for (var q = 0; q < hws.length; q++) { cfg.hardwareAcceleration = hws[q]; try { sup = await VideoEncoder.isConfigSupported(cfg); } catch (e) { sup = null; } if (sup && sup.supported) break; }
		if (!sup || !sup.supported) throw new Error("This browser cannot make H.264 video at " + W + "×" + H + ". Choose a smaller size.");
		var hasSound = p.clips.some(function (c) { return VE.hasSound(c); }), aOk = false;
		if (hasSound && window.AudioEncoder) { try { var as = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: 192000 }); aOk = !!(as && as.supported); } catch (e) { aOk = false; } }
		var writable = null, target;
		if (o.handle) { writable = await o.handle.createWritable(); target = new Mp4Muxer.FileSystemWritableFileStreamTarget(writable); } else target = new Mp4Muxer.ArrayBufferTarget();
		var mopt = { target: target, video: { codec: "avc", width: W, height: H }, fastStart: o.handle ? false : "in-memory", firstTimestampBehavior: "offset" };
		if (Math.abs(fps - Math.round(fps)) < 1e-6) mopt.video.frameRate = Math.round(fps);
		if (aOk) mopt.audio = { codec: "aac", numberOfChannels: 2, sampleRate: RATE };
		var muxer = new Mp4Muxer.Muxer(mopt), sig = VE.signal();
		function fail(e) { if (!failed) failed = e instanceof Error ? e : new Error(String(e && e.message || e)); sig.wake(); }
		var venc = new VideoEncoder({ output: function (ch, meta) { try { muxer.addVideoChunk(ch, meta); } catch (e) { fail(e); } }, error: fail });
		venc.configure(sup.config || cfg); venc.addEventListener("dequeue", sig.wake);
		var aenc = null;
		if (aOk) { aenc = new AudioEncoder({ output: function (ch, meta) { try { muxer.addAudioChunk(ch, meta); } catch (e) { fail(e); } }, error: fail }); aenc.configure({ codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: 192000 }); }
		var canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
		var ctx = canvas.getContext("2d", { alpha: false }); ctx.imageSmoothingQuality = "high";
		var readers = {}, audioPos = 0, total = b - a, keyEvery = Math.max(1, Math.round(fps * 2));
		async function audioUpTo(tt) {
			if (!aenc) return;
			while (!failed && audioPos < Math.min(tt, total) - 1e-9) {
				var n = Math.min(RATE, Math.round((Math.min(tt + 1, total) - audioPos) * RATE)); if (n <= 0) break;
				var L = await mix(a + audioPos, n), buf = new Float32Array(n * 2); buf.set(L[0], 0); buf.set(L[1], n);
				aenc.encode(new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(audioPos * 1e6), data: buf }));
				audioPos += n / RATE;
				while (!failed && aenc.encodeQueueSize > 8) await sig.wait(200);
			}
		}
		try {
			for (var i = 0; i < N; i++) {
				if (failed) throw failed;
				if (o.cancelled && o.cancelled()) throw new Error("Cancelled.");
				var t = a + i / fps, layers = V.layersAt(p, t), frames = {};
				for (var j = 0; j < layers.length; j++) {
					var c = layers[j].clip; if (c.type !== "video") continue;
					var m = VE.media(c.media), rd = readers[c.id] || (readers[c.id] = new VReader(m));
					frames[c.id] = await rd.frameAt(Math.min(layers[j].src, Math.max(0, m.dur - 1e-3)));
				}
				VE.draw(ctx, W, H, t, function (cl) {
					var m2 = VE.media(cl.media); if (!m2) return null;
					if (m2.kind === "image") return { img: m2.bitmap, w: m2.w, h: m2.h };
					var f = frames[cl.id]; return f ? { img: f, w: m2.w, h: m2.h, rot: m2.rot || 0 } : null;
				});
				var vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
				venc.encode(vf, { keyFrame: i % keyEvery === 0 }); vf.close();
				while (!failed && venc.encodeQueueSize > 4) await sig.wait(200);
				// readers of clips that are over
				Object.keys(readers).forEach(function (id) { var cc = V.clip(p, id); if (!cc || V.end(cc) < t - 0.2) { readers[id].close(); delete readers[id]; } });
				await audioUpTo((i + 1) / fps);
				if (o.onProgress && (i % 3 === 0 || i === N - 1)) {
					var el = (performance.now() - t00) / 1000, fr = (i + 1) / N;
					o.onProgress(fr, "Frame " + (i + 1) + " of " + N + (fr > 0.02 ? " · about " + V.short(el / fr - el).replace(/\.\d$/, "") + " left" : "") + " · " + (el > 0.5 ? ((i + 1) / el).toFixed(1) + " fps" : ""));
				}
			}
			await audioUpTo(total);
			await venc.flush(); if (aenc) await aenc.flush();
			if (failed) throw failed;
			muxer.finalize();
		} catch (e) {
			try { if (writable) await writable.abort(); } catch (x) { /* ignore */ }
			throw e;
		} finally {
			Object.keys(readers).forEach(function (id) { readers[id].close(); });
			try { venc.close(); } catch (e) { /* ignore */ } try { if (aenc) aenc.close(); } catch (e) { /* ignore */ }
		}
		var secs = (performance.now() - t00) / 1000;
		if (writable) { await writable.close(); var f = await o.handle.getFile(); return { size: f.size, handle: o.handle, secs: secs, sound: aOk }; }
		var blob = new Blob([target.buffer], { type: "video/mp4" });
		return { blob: blob, size: blob.size, secs: secs, sound: aOk };
	};
	// one frame at project size from the preview's current state (PNG "snapshot")
	VE.snapshot = async function () {
		var p = VE.P, c = document.createElement("canvas"); c.width = p.w; c.height = p.h;
		var layers = V.layersAt(p, VE.t), frames = {}, readers = [];
		for (var j = 0; j < layers.length; j++) { var cl = layers[j].clip; if (cl.type !== "video") continue; var m = VE.media(cl.media); if (!m || !m.vt) continue; var rd = new VReader(m); readers.push(rd); frames[cl.id] = await rd.frameAt(layers[j].src); }
		VE.draw(c.getContext("2d"), p.w, p.h, VE.t, function (cl) { var m = VE.media(cl.media); if (!m) return null; if (m.kind === "image") return { img: m.bitmap, w: m.w, h: m.h }; var f = frames[cl.id]; return f ? { img: f, w: m.w, h: m.h, rot: m.rot || 0 } : null; });
		readers.forEach(function (r) { r.close(); });
		return new Promise(function (r) { c.toBlob(r, "image/png"); });
	};
})();
