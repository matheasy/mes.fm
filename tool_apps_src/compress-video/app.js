/* MES Video Compressor (mes.fm/compress-video). Fast path = WebCodecs: mp4box.js reads the MP4 / MOV, VideoDecoder -> (scale / drop frames) -> VideoEncoder,
 * AudioDecoder -> AudioEncoder (or the AAC is copied), mp4-muxer / webm-muxer write the file, straight to disk with the File System Access API when asked.
 * Slow path (no WebCodecs encoder, or a format the fast path cannot read) = play through a canvas and re-record with MediaRecorder, in real time.
 * Nothing is uploaded. Decisions live in lib.js (MESVid). Libraries (pinned) load from jsDelivr the first time Compress is pressed. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("cv"); if (!root || !window.MESVid) return;
	var V = window.MESVid, KEY = "mes-videocompressor:v1";
	var LIB = { box: "https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js", mp4: "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js", webm: "https://cdn.jsdelivr.net/npm/webm-muxer@5.1.4/build/webm-muxer.js" };
	var S = { goal: "target", target: "25 MB", preset: "balanced", cap: "auto", fps: "0", audio: "128", fmt: "mp4", disk: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	var qs = new URLSearchParams(location.search), FORCE_REC = qs.get("engine") === "recorder";
	var files = [], busy = false, uid = 0, cancelAll = false, caps = { cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0, fs: !!window.showSaveFilePicker, webcodecs: !!(window.VideoEncoder && window.VideoDecoder && window.EncodedVideoChunk), freeBytes: 0, quota: 0 };
	// a wake-up signal for the encode loops: a background tab runs setTimeout at most once a second (after 5 minutes once a minute), so the loops
	// wait for the codecs' "dequeue" events and for new samples instead; the timeout is only a safety net
	function signal() { var w = []; return { wait: function (ms) { return new Promise(function (r) { var t = setTimeout(done, ms || 250); function done() { clearTimeout(t); r(); } w.push(done); }); }, wake: function () { var a = w; w = []; for (var j = 0; j < a.length; j++) a[j](); } }; }
	var scripts = {};
	function loadScript(u) { if (!scripts[u]) scripts[u] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { delete scripts[u]; rej(new Error("Could not load " + u.split("/")[4] + ". Check your connection and try again.")); }; document.head.appendChild(s); }); return scripts[u]; }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function notice(msg, err) { var n = $("cv-notice"); n.hidden = !msg; n.textContent = msg || ""; n.classList.toggle("is-err", !!err); }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 20000); }

	/* ---------- what this computer can do ---------- */
	var support = { h264: false, hw: false, vp9: false, aac: false, opus: false, cq: false };
	function probeCaps() {
		var jobs = [];
		if (navigator.storage && navigator.storage.estimate) jobs.push(navigator.storage.estimate().then(function (e) { caps.quota = e.quota || 0; caps.freeBytes = Math.max(0, (e.quota || 0) - (e.usage || 0)); }).catch(function () { }));
		try { if (navigator.brave && navigator.brave.isBrave) jobs.push(navigator.brave.isBrave().then(function (b) { caps.brave = !!b; }, function () { })); } catch (e) { /* ignore */ }
		if (caps.webcodecs) {
			jobs.push(cqConfig(1920, 1080, 30).then(function (c) { support.cq = !!c; }));
			var ve = function (codec, extra) { return VideoEncoder.isConfigSupported(Object.assign({ codec: codec, width: 1920, height: 1080, bitrate: 5e6, framerate: 30 }, extra || {})).then(function (r) { return !!(r && r.supported); }, function () { return false; }); };
			jobs.push(ve("avc1.640028").then(function (b) { support.h264 = b; }), ve("avc1.640028", { hardwareAcceleration: "prefer-hardware" }).then(function (b) { support.hw = b; }), ve("vp09.00.40.08").then(function (b) { support.vp9 = b; }));
			if (window.AudioEncoder) {
				var ae = function (codec) { return AudioEncoder.isConfigSupported({ codec: codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }).then(function (r) { return !!(r && r.supported); }, function () { return false; }); };
				jobs.push(ae("mp4a.40.2").then(function (b) { support.aac = b; }), ae("opus").then(function (b) { support.opus = b; }));
			}
		}
		return Promise.all(jobs).then(function () { caps.h264 = support.h264; caps.vp9 = support.vp9; renderCaps(); });
	}
	function pill(ok, text) { return '<span class="cv-pill' + (ok ? "" : " is-no") + '">' + (ok ? "&#10003; " : "&#10007; ") + esc(text) + "</span>"; }
	function renderCaps() {
		var pr = V.profile(caps), h = "<b>This computer</b> &ndash; ";
		h += (caps.cores ? caps.cores + " processor cores" : "cores unknown") + ", " + (caps.mem ? "about " + (caps.mem >= 8 ? "8 GB or more" : caps.mem + " GB") + " memory" : "memory not reported by this browser") + ", " + (caps.freeBytes ? V.formatBytes(caps.freeBytes) + " free space reported" : "free space unknown") + ". ";
		h += "Rated <b>" + pr.level + "</b>: sensible pictures up to " + (pr.maxShort >= 2160 ? "4K" : pr.maxShort + "p") + ".<br>";
		h += pill(caps.webcodecs && support.h264, "H.264 (MP4) encoder" + (support.hw ? ", hardware" : "")) + pill(caps.webcodecs && support.vp9, "VP9 (WebM) encoder") + pill(support.aac || support.opus, "audio encoder" + (support.aac ? " (AAC)" : support.opus ? " (Opus)" : ""));
		h += pill(support.cq, "constant quality (the size follows the picture)");
		h += caps.fs ? pill(true, "save straight to disk") : caps.brave ? '<span class="cv-pill is-off">&#9888; save straight to disk: off in Brave</span>' : pill(false, "save straight to disk");
		if (!caps.webcodecs || (!support.h264 && !support.vp9)) h += "<br>This browser cannot encode video with WebCodecs, so videos are recorded again in real time (as long as the video plays). Chrome, Edge and Brave on a computer are much faster.";
		else if (!support.cq) h += "<br>This browser's H.264 encoder cannot keep a constant quality, so &ldquo;Choose a quality&rdquo; uses a fixed bitrate for the picture size here: the file size cannot follow how much detail the video has.";
		if (!caps.fs && caps.brave) h += '<p class="cv-hint">Brave turns off saving straight to disk. To turn it on, open <code>brave://flags/#file-system-access-api</code> in a new tab, set it to Enabled and restart Brave. Without it the result is kept in memory and downloaded at the end, which is fine unless the result is several GB. <button type="button" class="tu-btn tu-btn--ghost cv-copy" data-copy="brave://flags/#file-system-access-api">Copy the address</button></p>';
		$("cv-caps").innerHTML = h; fillOptions();
	}
	$("cv-caps").addEventListener("click", function (e) {
		var b = e.target.closest("[data-copy]"); if (!b) return; var txt = b.getAttribute("data-copy");
		var done = function () { var was = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = was; }, 1600); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { window.prompt("Copy this:", txt); }); else window.prompt("Copy this:", txt);
	});

	/* ---------- constant quality: an H.264 encoder that takes a quantizer for every frame ---------- */
	var cqCache = {};
	function cqConfig(w, h, fps) {
		var k = w + "x" + h + "@" + Math.round(fps);
		if (!cqCache[k]) cqCache[k] = (async function () {
			if (!caps.webcodecs) return null;
			var hws = ["prefer-hardware", "no-preference"];
			for (var j = 0; j < hws.length; j++) {
				var c = { codec: V.avcCodec(w, h, fps), width: w, height: h, framerate: Math.round(fps * 100) / 100, bitrateMode: "quantizer", latencyMode: "quality", hardwareAcceleration: hws[j], avc: { format: "avc" } };
				try { var r = await VideoEncoder.isConfigSupported(c); if (r && r.supported) return c; } catch (e) { /* try the next one */ }
			}
			return null;
		})();
		return cqCache[k];
	}

	/* ---------- options ---------- */
	function fillOptions() {
		var pr = V.profile(caps), cap = $("cv-cap");
		var rows = [["auto", "Automatic (" + (pr.defaultCap ? "up to " + pr.defaultCap + "p for this computer" : "keep original") + ")"], ["0", "Keep original"], ["2160", "Up to 4K"], ["1440", "Up to 1440p"], ["1080", "Up to 1080p"], ["720", "Up to 720p"], ["480", "Up to 480p"], ["360", "Up to 360p"]];
		cap.innerHTML = rows.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join(""); cap.value = S.cap;
		$("cv-fps").innerHTML = [["0", "Keep original"], ["60", "At most 60 fps"], ["30", "At most 30 fps"], ["24", "At most 24 fps"], ["15", "At most 15 fps"]].map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join(""); $("cv-fps").value = S.fps;
		var a = $("cv-audio"); a.innerHTML = Object.keys(V.AUDIO_CHOICES).map(function (k) { return '<option value="' + k + '">' + V.AUDIO_CHOICES[k] + "</option>"; }).join(""); a.value = S.audio;
		$("cv-preset").innerHTML = Object.keys(V.PRESETS).map(function (k) { return '<option value="' + k + '">' + V.PRESETS[k].label + "</option>"; }).join(""); $("cv-preset").value = S.preset;
		var f = $("cv-fmt"), rec = !caps.webcodecs || !(support.h264 || support.vp9);
		f.innerHTML = '<option value="mp4">MP4 (H.264, plays everywhere)</option><option value="webm"' + (!rec && !support.vp9 ? " disabled" : "") + '>WebM (VP9, smaller)</option>';
		if (!rec) { if (S.fmt === "webm" && !support.vp9) S.fmt = "mp4"; if (S.fmt === "mp4" && !support.h264 && support.vp9) S.fmt = "webm"; }
		f.value = S.fmt; $("cv-fmtnote").textContent = rec ? "Real-time recording: the browser decides the exact codec (usually WebM, sometimes MP4)." : "";
		$("cv-target").value = S.target; $("cv-g-" + S.goal).checked = true; $("cv-disk").checked = S.disk && caps.fs; $("cv-diskrow").hidden = !caps.fs; syncGoal(); updateAll();
	}
	function syncGoal() { $("cv-targetrow").style.opacity = S.goal === "target" ? 1 : 0.5; $("cv-presetrow").style.opacity = S.goal === "preset" ? 1 : 0.5; }
	function readOpts() {
		S.goal = $("cv-g-preset").checked ? "preset" : "target"; S.target = $("cv-target").value; S.preset = $("cv-preset").value; S.cap = $("cv-cap").value; S.fps = $("cv-fps").value; S.audio = $("cv-audio").value; S.fmt = $("cv-fmt").value; S.disk = $("cv-disk").checked; save(); syncGoal();
	}
	function capValue() { return S.cap === "auto" ? V.profile(caps).defaultCap : parseInt(S.cap, 10) || 0; }
	["cv-g-target", "cv-g-preset", "cv-target", "cv-preset", "cv-cap", "cv-fps", "cv-audio", "cv-fmt", "cv-disk"].forEach(function (id) { $(id).addEventListener("change", function () { readOpts(); updateAll(); }); });
	$("cv-target").addEventListener("input", function () { readOpts(); updateAll(); });
	$("cv-chips").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; $("cv-target").value = b.getAttribute("data-mb") + " MB"; $("cv-g-target").checked = true; readOpts(); updateAll(); });

	/* ---------- plan for one file ---------- */
	function plan(f) {
		var i = f.info; if (!i) return null;
		var cap = capValue(), rot = i.rot || 0, d = V.fitDims(i.w, i.h, cap), fps = V.outFps(i.fps, parseInt(S.fps, 10) || 0), fmt = S.fmt;
		var codec = fmt === "webm" ? "vp09" : "avc1", abps = i.hasAudio ? V.audioBps(S.audio, i.abps) : 0;
		if (S.audio === "keep" && i.hasAudio && !(fmt === "mp4" && i.acodecAac)) abps = V.audioBps("128", 0);
		var tb = V.parseSize(S.target), target = S.goal === "target" && tb, vbps, tbps = 0, info = "", tight = false, rc = null, why = "", notes = [];
		var engine = (!caps.webcodecs || FORCE_REC || !f.fast || !(fmt === "webm" ? support.vp9 : support.h264)) ? "recorder" : "webcodecs";
		// the probe (a few short stretches encoded at two quantizers) says how many bits this picture needs; it is redone when the size or frame rate changes
		var qkey = d.w + "x" + d.h + "@" + fps, qp = f.qps && f.qps[qkey] || null, probing = engine === "webcodecs" && !!(i.pw && i.pw.wins.length) && !qp, measured = !!(qp && qp.ok);
		if (target) { var t = V.targetBitrate(tb, i.dur, abps, d.w, d.h, fps); vbps = tbps = t.videoBps; tight = t.tight; if (!t.feasible) info = "That size is too small for this length: the picture will be very rough."; else if (t.tight) info = "A very small size for this length and picture: expect a blocky picture. A lower size setting or a longer limit looks better."; }
		else vbps = V.presetBitrate(d.w, d.h, fps, S.preset, codec, i.vbps);
		if (measured) {
			var ch = V.chooseQ(qp, { goal: target ? "target" : "preset", preset: S.preset, targetBps: tbps, capBps: i.vbps > 0 ? i.vbps * 0.85 : 0, dur: i.dur, fps: fps }); why = ch.why;
			if (fmt === "mp4") { rc = { q: ch.q, s: qp.s, hw: qp.hw }; vbps = ch.bps; }
			else vbps = target && why !== "roomy" ? Math.min(tbps, Math.round(ch.bps * V.VBR_FACTOR.vp9)) : Math.round(ch.bps * V.VBR_FACTOR.vp9);   // WebM: VP9 takes no quantizer here, so an average bitrate for the same look
			if (why === "roomy") notes.push("This video looks its best (High quality) at about " + V.formatBytes(V.estimateBytes(vbps, abps, i.dur)) + ", so it will come out smaller than the size you asked for.");
			if (why === "capped") notes.push("The original is already compressed efficiently (" + V.formatBitrate(i.vbps) + "): at this quality the result would be bigger than the original, so the quality is lowered to keep it smaller. A lower resolution saves more; or keep the original.");
			// the measured quantizer says how rough it will look (the bits-per-pixel guess above does not know the picture)
			info = ch.q >= 40 ? "That size is too small for this length: the picture will be very rough." : ch.q >= 34 ? "A small size for this length and picture: expect a blocky picture in busy scenes. A lower resolution often looks better at this size." : "";
		}
		var est = V.estimateBytes(vbps, abps, i.dur);
		var warn = V.warnings({ inputBytes: f.file.size, durationSec: i.dur, outW: d.w, outH: d.h, estBytes: est, toDisk: S.disk && caps.fs, engine: engine }, caps);
		if (target && tb >= f.file.size) warn.push("The original is already smaller than the size you asked for (" + V.formatBytes(f.file.size) + "): compressing may make it only slightly smaller or even larger.");
		if (info && why !== "roomy") warn.push(info);
		if (engine === "recorder" && target) warn.push("Real-time recording cannot promise an exact size.");
		return { w: d.w, h: d.h, fps: fps, vbps: vbps, tbps: tbps, abps: abps, est: est, engine: engine, rot: rot, fmt: fmt, warn: warn, notes: notes, tight: tight, scaled: d.scaled, rc: rc, why: why, qkey: qkey, probing: probing, measured: measured };
	}
	function updateAll() { files.forEach(function (f) { if (f.state === "ready" || f.state === "queued") f.plan = plan(f); }); render(); kick(); }

	/* ---------- how much detail does this video have? ---------- */
	// A few short stretches (each from a key frame) are decoded and encoded at quantizer 24 and, for two of them, at 30: the bits per frame give the
	// size at any quality, the drop between the two shows the encoder really obeys the quantizer. Nothing is kept. One file at a time, never while compressing.
	var qChain = Promise.resolve();
	function kick() { if (busy) return; files.forEach(function (f) { if (f.state === "ready" && f.plan && f.plan.probing) ensureProbe(f); }); }
	function ensureProbe(f) {
		var p = f.plan, key = p.qkey; if (f.qps && f.qps[key]) return Promise.resolve(f.qps[key]);
		f.qpRuns = f.qpRuns || {}; if (f.qpRuns[key]) return f.qpRuns[key];
		return f.qpRuns[key] = qChain = qChain.then(function () { return files.indexOf(f) < 0 ? null : runProbe(f, p.w, p.h, p.fps, key); }).then(function (r) {
			if (r) { (f.qps = f.qps || {})[r.key] = r; if (f.state === "ready" || f.state === "queued") f.plan = plan(f); render(); }
			return r;
		}, function () { return null; });
	}
	async function runProbe(f, w, h, fps, key) {
		var i = f.info, pw = i.pw, t0 = performance.now(), Q0 = 24, Q1 = 30;
		try {
			var cfg = await cqConfig(w, h, fps); if (!cfg) return { key: key, ok: false, reason: "no quantizer" };
			var useCanvas = !!f.need8 || w !== i.w || h !== i.h, all = [], k;
			async function encWin(win, q, cvs) {
				var err = null, n = 0, lastTs = null, r = { pb: 0, pn: 0, kb: 0, kn: 0 }, cv = null, cx = null, lo = Infinity, hi = 0;
				if (cvs) { cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h }); cx = cv.getContext("2d"); cx.imageSmoothingQuality = "high"; }
				var enc = new VideoEncoder({ output: function (c) { if (c.type === "key") { r.kb += c.byteLength * 8; r.kn++; } else { r.pb += c.byteLength * 8; r.pn++; } }, error: function (e) { err = err || e; } }), sg = signal();
				enc.configure(cfg); enc.addEventListener("dequeue", sg.wake);
				var dec = new VideoDecoder({ output: function (fr) {
					try {
						if (err || !V.keepFrame(fr.timestamp, lastTs, fps)) { fr.close(); return; }
						lastTs = fr.timestamp; var o = fr;
						if (cx) { cx.drawImage(fr, 0, 0, w, h); o = new VideoFrame(cv, { timestamp: fr.timestamp, duration: fr.duration || undefined }); fr.close(); }
						enc.encode(o, { keyFrame: n === 0, avc: { quantizer: q } }); o.close(); n++;
					} catch (e) { err = err || e; try { fr.close(); } catch (x) { /* ignore */ } }
				}, error: function (e) { err = err || e; } });
				dec.configure({ codec: pw.codec, codedWidth: pw.cw, codedHeight: pw.ch, description: pw.desc }); dec.addEventListener("dequeue", sg.wake);
				win.forEach(function (s) { lo = Math.min(lo, s.o); hi = Math.max(hi, s.o + s.s); });
				var buf = await f.file.slice(lo, hi).arrayBuffer();
				for (var j = 0; j < win.length && !err; j++) {
					var s = win[j]; while ((dec.decodeQueueSize > 12 || enc.encodeQueueSize > 8) && !err) await sg.wait(100);
					dec.decode(new EncodedVideoChunk({ type: j === 0 || s.k ? "key" : "delta", timestamp: s.c, duration: s.d, data: new Uint8Array(buf, s.o - lo, s.s) }));
				}
				try { await dec.flush(); await enc.flush(); } catch (e) { err = err || e; }
				try { dec.close(); } catch (e) { /* ignore */ } try { enc.close(); } catch (e) { /* ignore */ }
				if (err) throw err; return r;
			}
			try { all.push(await encWin(pw.wins[0], Q0, useCanvas)); }
			catch (e) { if (useCanvas) throw e; useCanvas = true; all.push(await encWin(pw.wins[0], Q0, true)); f.need8 = true; }   // 10-bit / HDR frames: the encoder only takes them through a canvas
			for (k = 1; k < pw.wins.length; k++) all.push(await encWin(pw.wins[k], Q0, useCanvas));
			var pick = pw.wins.length > 2 ? [0, Math.floor(pw.wins.length / 2)] : [0], p0 = 0, p1 = 0, k0 = 0, k1 = 0;
			for (k = 0; k < pick.length; k++) { var r1 = await encWin(pw.wins[pick[k]], Q1, useCanvas); p0 += all[pick[k]].pb; k0 += all[pick[k]].kb; p1 += r1.pb; k1 += r1.kb; }
			var s = V.probeSlope(Q0, p0 + k0, Q1, p1 + k1), pb = 0, pn = 0, kb = 0, kn = 0;
			all.forEach(function (r) { pb += r.pb; pn += r.pn; kb += r.kb; kn += r.kn; });
			if (!s) return { key: key, ok: false, reason: "the encoder did not follow the quantizer" };
			if (!pn || !kn) return { key: key, ok: false, reason: "too few frames" };
			var sP = V.slopeOf(Q0, p0, Q1, p1) || s, sK = V.slopeOf(Q0, k0, Q1, k1) || s;
			return { key: key, ok: true, q: Q0, s: sP, sP: sP, sK: sK, bitsP: pb / pn, bitsK: kb / kn, hw: cfg.hardwareAcceleration, ms: Math.round(performance.now() - t0), frames: pn + kn };
		} catch (e) { if (window.console) console.warn("[video compressor] probe failed", e); return { key: key, ok: false, reason: (e && e.message) || String(e) }; }
	}

	/* ---------- adding files, probing ---------- */
	var drop = $("cv-drop"), input = $("cv-input");
	drop.addEventListener("click", function (e) { if (!e.target.closest("button")) input.click(); });
	drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
	$("cv-pick").onclick = function (e) { e.stopPropagation(); input.click(); }; $("cv-more").onclick = function () { input.click(); };
	input.onchange = function () { add([].slice.call(input.files)); input.value = ""; };
	["dragenter", "dragover"].forEach(function (t) { document.addEventListener(t, function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); drop.classList.add("is-over"); } }); });
	["dragleave", "drop"].forEach(function (t) { document.addEventListener(t, function (e) { if (t === "drop") { e.preventDefault(); add([].slice.call(e.dataTransfer.files || [])); } if (t === "dragleave" && e.relatedTarget) return; drop.classList.remove("is-over"); }); });
	$("cv-clear").onclick = function () { if (busy) return; files.forEach(freeOut); files = []; $("cv-work").hidden = true; notice(""); };
	function freeOut(f) { if (f.out && f.out.url) { try { URL.revokeObjectURL(f.out.url); } catch (e) { /* ignore */ } } }

	function add(list) {
		var vids = list.filter(function (x) { return V.isVideo(x.name, x.type); }), bad = list.length - vids.length;
		if (!vids.length) { notice(list.length ? "Those are not video files. Choose MP4, MOV, WebM or MKV files." : "", !!list.length); return; }
		notice(bad ? bad + " file" + (bad > 1 ? "s were" : " was") + " skipped because it is not a video." : "");
		vids.forEach(function (file) { var f = { id: ++uid, file: file, state: "probing", info: null, fast: false, plan: null, pct: 0, note: "" }; files.push(f); probe(f); });
		$("cv-work").hidden = false; render();
	}
	function videoMeta(file) {
		return new Promise(function (res, rej) {
			var v = document.createElement("video"), u = URL.createObjectURL(file); v.preload = "metadata"; v.muted = true;
			var t = setTimeout(function () { URL.revokeObjectURL(u); rej(new Error("timeout")); }, 15000);
			v.onloadedmetadata = function () { clearTimeout(t); var r = { dur: v.duration, w: v.videoWidth, h: v.videoHeight }; URL.revokeObjectURL(u); res(r); };
			v.onerror = function () { clearTimeout(t); URL.revokeObjectURL(u); rej(new Error("This browser cannot play this video, so it cannot compress it.")); };
			v.src = u;
		});
	}
	async function probe(f) {
		try {
			var info = null;
			if (V.isMp4Family(f.file.name, f.file.type) && caps.webcodecs && window.VideoDecoder) {
				try { await loadScript(LIB.box); info = await mp4Info(f.file); f.fast = !!info; } catch (e) { info = null; }
			}
			if (!info) { var m = await videoMeta(f.file); info = { dur: m.dur, w: m.w, h: m.h, fps: 30, rot: 0, vbps: 0, hasAudio: true, abps: 0, rec: true }; f.fast = false; }
			f.info = info; f.need8 = V.needs8bit(info.vcodec); f.state = "ready"; f.plan = plan(f);
		} catch (e) { f.state = "error"; f.note = (e && e.message) || "This file could not be read."; }
		render(); kick();
	}
	function mp4Info(file) {
		return new Promise(function (resolve) {
			var mp4 = MP4Box.createFile(), off = 0, CH = 4194304, guard = 0, done = false;
			mp4.onError = function () { if (!done) { done = true; resolve(null); } };
			mp4.onReady = async function (i) {
				if (done) return; done = true;
				try {
					var vt = i.videoTracks[0], at = i.audioTracks[0]; if (!vt) return resolve(null);
					var trak = mp4.getTrackById(vt.id), desc = descOf(trak), dec = null;
					try { dec = await VideoDecoder.isConfigSupported({ codec: vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description: desc }); } catch (e) { /* ignore */ }
					if (!dec || !dec.supported) return resolve(null);
					var dur = (i.duration || vt.movie_duration) / (i.timescale || vt.movie_timescale || 1), fps = vt.nb_samples && dur ? vt.nb_samples / dur : 30;
					// where the quality probe will look: only those samples' positions are kept (a fragmented MP4 has none here, and then nothing is probed)
					var ss = trak.samples || [], times = [], sync = [], pw = null, dmin = Infinity, dmax = 0;
					for (var j = 0; j < ss.length; j++) { times.push(ss[j].dts / ss[j].timescale); sync.push(!!ss[j].is_sync); if (j < ss.length - 1) { dmin = Math.min(dmin, ss[j].duration); dmax = Math.max(dmax, ss[j].duration); } }
					var cfr = ss.length > 1 && dmin > 0 && dmax - dmin <= 1;   // every frame lasts the same (one tick of slack): a constant frame rate
					if (cfr) fps = ss[0].timescale / dmin;
					var wins = V.probeWindows(times, sync, dur).map(function (wn) { var a = []; for (var q = wn.i; q < wn.i + wn.n; q++) { var s = ss[q]; if (!(s.size > 0) || !(s.offset >= 0)) return null; a.push({ o: s.offset, s: s.size, c: Math.round(s.cts * 1e6 / s.timescale), d: Math.round(s.duration * 1e6 / s.timescale), k: !!s.is_sync }); } return a.length ? a : null; }).filter(Boolean);
					if (wins.length) pw = { codec: vt.codec, cw: vt.video.width, ch: vt.video.height, desc: desc, wins: wins };
					resolve({ dur: dur, w: vt.video.width, h: vt.video.height, fps: Math.round(fps * 100) / 100, rot: V.rotationFromMatrix(vt.matrix), vbps: vt.bitrate || 0, vcodec: vt.codec,
						hasAudio: !!at, abps: at ? at.bitrate || 0 : 0, acodec: at ? at.codec : "", acodecAac: !!at && /^mp4a\.40\./.test(at.codec), arate: at ? at.audio.sample_rate : 0, ach: at ? at.audio.channel_count : 0, nv: vt.nb_samples, pw: pw, cfr: cfr });
				} catch (e) { resolve(null); }
			};
			(async function () {
				while (!done && off < file.size && guard++ < 400) {
					var end = Math.min(file.size, off + CH), buf = await file.slice(off, end).arrayBuffer(); buf.fileStart = off;
					var next = mp4.appendBuffer(buf, end >= file.size); off = typeof next === "number" && next !== end ? next : end;
				}
				if (!done) { mp4.flush(); setTimeout(function () { if (!done) { done = true; resolve(null); } }, 800); }
			})();
		});
	}
	function descOf(trak) {
		var es = trak.mdia.minf.stbl.stsd.entries;
		for (var j = 0; j < es.length; j++) { var b = es[j].avcC || es[j].hvcC || es[j].vpcC || es[j].av1C; if (b) { var ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); b.write(ds); return new Uint8Array(ds.buffer, 8); } }
		return undefined;
	}
	function audioDescOf(trak) { var e = trak.mdia.minf.stbl.stsd.entries[0]; try { return new Uint8Array(e.esds.esd.descs[0].descs[0].data); } catch (x) { return undefined; } }

	/* ---------- list ---------- */
	function render() {
		var h = "";
		files.forEach(function (f) {
			var i = f.info, p = f.plan, name = esc(f.file.name), meta = "";
			if (i) meta = V.formatBytes(f.file.size) + " &middot; " + V.formatTime(i.dur) + " &middot; " + i.w + "&times;" + i.h + (i.fps && !i.rec ? " &middot; " + Math.round(i.fps) + " fps" : "") + (i.rot ? " &middot; rotated " + i.rot + "&deg;" : "");
			else meta = V.formatBytes(f.file.size);
			var st = "", act = "";
			if (f.state === "probing") st = "Reading...";
			else if (f.state === "ready" && p && p.probing) st = "Will become " + p.w + "&times;" + p.h + (p.fps ? ", " + Math.round(p.fps) + " fps" : "") + ". Checking how much detail this video has...";
			else if (f.state === "ready" && p) st = "Will become " + p.w + "&times;" + p.h + (p.fps ? ", " + Math.round(p.fps) + " fps" : "") + ", about " + V.formatBitrate(p.vbps) + ", roughly " + V.formatBytes(p.est) + (p.measured ? " (measured on samples of this video)" : "") + '<span class="cv-eng">' + (p.engine === "webcodecs" ? "fast" : "real time") + "</span>";
			else if (f.state === "queued") st = "Waiting...";
			else if (f.state === "working") st = esc(f.note || "Working...");
			else if (f.state === "done") st = '<span class="' + (f.out.size < f.file.size ? "cv-ok" : "cv-bad") + '">' + esc(V.formatBytes(f.out.size) + " - " + savedLine(f)) + "</span>" + (f.note ? " " + esc(f.note) : "");
			else if (f.state === "error" || f.state === "cancelled") st = '<span class="cv-bad">' + esc(f.note || "Stopped.") + "</span>";
			if (f.state === "working") act = '<button type="button" class="tu-btn tu-btn--ghost" data-a="cancel" data-id="' + f.id + '">Cancel</button>';
			else if (f.state === "done") act = (f.out.blob ? '<button type="button" class="tu-btn tu-btn--primary" data-a="dl" data-id="' + f.id + '">Download</button>' : "") + (f.out.saved ? '<span class="cv-note">Saved as ' + esc(f.out.name) + "</span>" : "");
			if (!busy && f.state !== "working") act += '<button type="button" class="cv-x" data-a="rm" data-id="' + f.id + '" aria-label="Remove ' + name + '">&times;</button>';
			h += '<div class="cv-f" data-fid="' + f.id + '"><div class="cv-th">VID</div><div><div class="cv-fn" title="' + name + '">' + name + '</div><div class="cv-fm">' + meta + '</div><div class="cv-fm" data-st>' + st + '</div>' +
				(f.state === "working" ? '<div class="cv-bar"><i style="width:' + (f.pct || 0) + '%"></i></div>' : "") + '</div><div class="cv-fr">' + act + "</div>";
			if (p && (f.state === "ready" || f.state === "queued") && (p.warn.length || p.notes.length)) h += '<div class="cv-fx">' + p.notes.map(function (w) { return '<p class="cv-info">' + esc(w) + "</p>"; }).join("") + p.warn.map(function (w) { return '<p class="cv-warn">' + esc(w) + "</p>"; }).join("") + "</div>";
			if (f.state === "done" && f.out.url) h += '<div class="cv-fx"><video class="cv-vid" controls preload="metadata" playsinline src="' + f.out.url + '"></video></div>';
			h += "</div>";
		});
		$("cv-list").innerHTML = h;
		var ready = files.filter(function (f) { return f.state === "ready"; }).length;
		$("cv-go").disabled = busy || !ready; $("cv-go").textContent = busy ? "Compressing..." : ready > 1 ? "Compress " + ready + " videos" : "Compress";
	}
	function savedLine(f) { var d = f.file.size - f.out.size; return d > 0 ? "smaller by " + Math.round(d / f.file.size * 100) + "% (was " + V.formatBytes(f.file.size) + ")" : "not smaller than the original (" + V.formatBytes(f.file.size) + ")"; }
	function setProgress(f, pct, note) {
		f.pct = Math.max(0, Math.min(100, pct)); if (note != null) f.note = note;
		var el = root.querySelector('[data-fid="' + f.id + '"]'); if (!el) return;
		var bar = el.querySelector(".cv-bar i"), st = el.querySelector("[data-st]"); if (bar) bar.style.width = f.pct + "%"; if (st) st.textContent = f.note;
	}
	$("cv-list").addEventListener("click", function (e) {
		var b = e.target.closest("button[data-a]"); if (!b) return; var f = files.filter(function (x) { return x.id === +b.getAttribute("data-id"); })[0]; if (!f) return; var a = b.getAttribute("data-a");
		if (a === "cancel") { f.cancel = true; } else if (a === "rm") { freeOut(f); files.splice(files.indexOf(f), 1); if (!files.length) $("cv-work").hidden = true; render(); } else if (a === "dl") download(f.out.blob, f.out.name);
	});

	/* ---------- running the queue ---------- */
	var wake = null;
	async function lockScreen() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) { /* ignore */ } }
	function unlock() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }
	$("cv-go").onclick = async function () {
		if (busy) return; readOpts();
		var todo = files.filter(function (f) { return f.state === "ready"; }); if (!todo.length) return;
		var dest = null;   // File System Access: ask where to save now, while the click still counts as a user gesture
		if (S.disk && caps.fs) {
			try {
				if (todo.length === 1) { var ext0 = (todo[0].plan.engine === "recorder" ? "webm" : todo[0].plan.fmt); dest = { file: await window.showSaveFilePicker({ suggestedName: V.outName(todo[0].file.name, ext0, {}), types: [{ description: "Video", accept: ext0 === "webm" ? { "video/webm": [".webm"] } : { "video/mp4": [".mp4"] } }] }) }; }
				else dest = { dir: await window.showDirectoryPicker({ mode: "readwrite" }) };
			} catch (e) { notice("Nothing was started: no place to save was chosen. Untick \"Save straight to disk\" to download instead.", true); return; }
		}
		busy = true; cancelAll = false; notice(""); todo.forEach(function (f) { f.state = "queued"; f.cancel = false; }); render(); await lockScreen();
		var used = {}, total = todo.length, n = 0;
		for (var i = 0; i < todo.length; i++) {
			var f = todo[i]; n++; if (cancelAll) { f.state = "cancelled"; f.note = "Stopped."; continue; }
			f.state = "working"; f.pct = 0; f.note = "Starting..."; f.started = Date.now(); $("cv-prog").textContent = "File " + n + " of " + total; render();
			try {
				var out = f.plan.engine === "webcodecs" ? await runFast(f, dest, used) : await runRecorder(f, dest, used);
				if (f.cancel) { f.state = "cancelled"; f.note = "Cancelled."; } else { f.out = out; f.state = "done"; f.note = out.note || ""; }
			} catch (e) {
				if (f.cancel || (e && e.cancelled)) { f.state = "cancelled"; f.note = "Cancelled."; } else { f.state = "error"; f.note = (e && e.message) || "Compression failed."; if (window.console) console.error(e); }
			}
			render();
		}
		busy = false; unlock(); $("cv-prog").textContent = ""; render(); kick();
		var done = files.filter(function (f) { return f.state === "done"; }), before = 0, after = 0; done.forEach(function (f) { before += f.file.size; after += f.out.size; });
		if (done.length) notice("Finished: " + V.formatBytes(before) + " became " + V.formatBytes(after) + (after < before ? " (" + Math.round((before - after) / before * 100) + "% smaller)." : "."));
	};
	function cancelled(f) { return f.cancel || cancelAll; }
	function eta(f, frac) { var el = (Date.now() - f.started) / 1000; if (frac < 0.03 || el < 2) return ""; return " - about " + V.formatTime(el / frac - el) + " left"; }

	// where the file is written: a File System Access writable, or memory
	async function openTarget(f, dest, used, fmt) {
		var ext = fmt, name = V.outName(f.file.name, ext, used), t = { name: name, saved: false };
		if (dest && dest.file) { t.handle = dest.file; t.name = dest.file.name; }
		else if (dest && dest.dir) { t.handle = await dest.dir.getFileHandle(name, { create: true }); }
		return t;
	}
	async function finishOut(t, bytesBlob, size, extra) {
		var o = { name: t.name, size: size, note: extra || "" };
		if (t.handle) { var file = await t.handle.getFile(); o.size = file.size; o.url = URL.createObjectURL(file); o.saved = true; }
		else { o.blob = bytesBlob; o.url = URL.createObjectURL(bytesBlob); }
		return o;
	}

	/* ---------- fast path: WebCodecs ---------- */
	async function runFast(f, dest, used) {
		await loadScript(LIB.box);
		if (f.plan.probing) { setProgress(f, 0, "Checking how much detail this video has..."); await ensureProbe(f); f.plan = plan(f); }
		var p = f.plan, fmt = p.fmt;
		await loadScript(fmt === "webm" ? LIB.webm : LIB.mp4);
		// rc = how the encoder is told the quality: { q } = a quantizer for every frame (constant quality), { bps } = an average bitrate
		var tgt = S.goal === "target" ? V.parseSize(S.target) : 0, rc = p.rc ? { q: p.rc.q, s: p.rc.s, hw: p.rc.hw } : { bps: p.vbps }, res = null, attempt = 0, t = await openTarget(f, dest, used, fmt), note = "", mode = { sw: false, canvas: !!f.need8 }, fixes = 0;
		var audioBytes = p.abps * f.info.dur / 8, bpsFor = function (k) { var b = Math.round(p.vbps * k); return tgt && p.tbps ? Math.min(b, p.tbps) : b; };
		while (true) {
			attempt++;
			try { res = await encodeOnce(f, p, rc, t, attempt > 1 ? "Second pass to hit the size... " : "", mode); }
			catch (e) {
				if (cancelled(f)) throw e;
				if (e && e.noCq && rc.q != null) { rc = { bps: bpsFor(V.VBR_FACTOR.hw) }; attempt--; continue; }   // the encoder refused a quantizer after all: an average bitrate for about the same look
				if (e && e.fromEncoder && fixes < 2) {
					fixes++; attempt--;
					if (!mode.canvas) { mode = { sw: false, canvas: true }; setProgress(f, 0, "The encoder could not take this video's frames; converting them to standard 8-bit video first..."); }
					else if (!mode.sw) { mode = { sw: true, canvas: true }; if (rc.q != null) rc = { bps: bpsFor(V.VBR_FACTOR.sw) }; setProgress(f, 0, "The hardware encoder could not take this video; trying the software encoder..."); }
					else throw e;
					continue;
				}
				throw e;
			}
			var next = null;
			if (tgt) next = rc.q != null ? V.retuneQ(rc.q, rc.s, tgt, res.size, audioBytes) : V.retuneBitrate(rc.bps, tgt, res.size);
			if (next && attempt < 2 && !cancelled(f)) { rc = rc.q != null ? { q: next, s: rc.s, hw: rc.hw } : { bps: next }; res.cleanup && res.cleanup(); continue; }
			break;
		}
		if (mode.canvas && (f.need8 || fixes)) note = "(converted to standard 8-bit video through a canvas because the encoder could not take this video's frames: an HDR or 10-bit video may look flatter)";
		if (mode.sw && rc.bps) note = (note ? note + " " : "") + "(made with the slower software encoder)";
		if (tgt && res.size > tgt * 1.03) note = (note ? note + " " : "") + "(" + Math.round((res.size / tgt - 1) * 100) + "% over the size you asked for)";
		if (res.audioNote) note = (note ? note + " " : "") + res.audioNote;
		return finishOut(t, res.blob, res.size, note);
	}
	async function encodeOnce(f, p, rc, t, label, mode) {
		var i = f.info, fmt = p.fmt, file = f.file, Q = [], demuxDone = false, failed = null, frames = 0, lastTs = null, kfEvery = V.keyEvery(p.fps), lastVideoTs = 0, audioNote = "", qNext = rc.q != null ? V.qStepper(rc.q) : null;
		var writable = null, target, M = fmt === "webm" ? WebMMuxer : Mp4Muxer;
		if (t.handle) { writable = await t.handle.createWritable(); target = new M.FileSystemWritableFileStreamTarget(writable); } else target = new M.ArrayBufferTarget();
		function fail(e, tag) { if (window.console) console.error("[video compressor]", tag || "", e); if (!failed) { failed = e instanceof Error ? e : new Error(String(e && e.message || e)); if (tag === "video encoder") failed.fromEncoder = true; } }
		function failer(tag) { return function (e) { fail(e, tag); }; }
		var swap = (fmt === "webm" && (p.rot === 90 || p.rot === 270)), ow = swap ? p.h : p.w, oh = swap ? p.w : p.h;   // WebM cannot carry a rotation flag: turn the pixels instead
		var needCanvas = mode.canvas || f.need8 || p.scaled || (fmt === "webm" && p.rot) || (p.w !== i.w || p.h !== i.h);
		var canvas = null, ctx = null; if (needCanvas) { canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(ow, oh) : Object.assign(document.createElement("canvas"), { width: ow, height: oh }); ctx = canvas.getContext("2d"); ctx.imageSmoothingQuality = "high"; }
		// audio plan
		var doAudio = i.hasAudio && p.abps > 0, passthru = doAudio && S.audio === "keep" && fmt === "mp4" && i.acodecAac, aenc = null, adec = null, aCodec = fmt === "webm" ? "opus" : (support.aac ? "mp4a.40.2" : "opus");
		if (doAudio && !passthru) {
			if (!window.AudioEncoder || !window.AudioDecoder || (aCodec === "mp4a.40.2" ? !support.aac : !support.opus)) { doAudio = false; audioNote = "(sound was removed: this browser cannot re-encode it)"; }
		}
		var vOpts = { codec: fmt === "webm" ? "V_VP9" : "avc", width: ow, height: oh }, mfr = V.muxFrameRate(i.fps, p.fps, i.cfr); if (mfr) vOpts.frameRate = mfr;
		if (fmt === "mp4" && p.rot) vOpts.rotation = p.rot;
		var mOpts = { target: target, video: vOpts, firstTimestampBehavior: "offset" };
		if (fmt === "mp4") mOpts.fastStart = t.handle ? false : "in-memory";
		var aMeta = { numberOfChannels: i.ach || 2, sampleRate: i.arate || 48000 };
		// a first audio chunk (AAC copy, or re-encoded) decides the real channel count / rate; the muxer needs them up front
		var muxerReady = null;
		function makeMuxer(chCount, rate) {
			if (doAudio) mOpts.audio = fmt === "webm" ? { codec: "A_OPUS", numberOfChannels: chCount, sampleRate: rate } : { codec: aCodec === "opus" ? "opus" : "aac", numberOfChannels: chCount, sampleRate: rate };
			muxerReady = new M.Muxer(mOpts);
		}
		var aChannels = Math.min(2, i.ach || 2), aRate = i.arate || 48000;
		makeMuxer(aChannels, aRate);
		var muxer = muxerReady;

		var venc = new VideoEncoder({ output: function (chunk, meta) { try { muxer.addVideoChunk(chunk, meta); } catch (e) { fail(e); } }, error: failer("video encoder") });
		var vcfg = { codec: fmt === "webm" ? V.vp9Codec(ow, oh) : V.avcCodec(ow, oh, p.fps), width: ow, height: oh, framerate: Math.round(p.fps * 100) / 100, latencyMode: "quality" };
		if (qNext) { vcfg.bitrateMode = "quantizer"; vcfg.hardwareAcceleration = mode.sw ? "prefer-software" : (rc.hw || "prefer-hardware"); }
		else { vcfg.bitrate = Math.round(rc.bps); vcfg.bitrateMode = "variable"; vcfg.hardwareAcceleration = mode.sw ? "prefer-software" : "no-preference"; }
		if (fmt === "mp4") vcfg.avc = { format: "avc" };
		async function bail(e) { try { venc.close(); } catch (x) { /* ignore */ } try { if (writable) await writable.abort(); } catch (x) { /* ignore */ } throw e; }
		var sup = await VideoEncoder.isConfigSupported(vcfg);
		if (!sup.supported && qNext) { var nq = new Error("This encoder does not take a quantizer."); nq.noCq = true; await bail(nq); }
		if (!sup.supported) { delete vcfg.bitrateMode; sup = await VideoEncoder.isConfigSupported(vcfg); }
		if (!sup.supported) await bail(new Error("This computer's encoder does not support " + ow + "×" + oh + ". Choose a smaller size and try again."));
		venc.configure(vcfg);
		var vdec = new VideoDecoder({ output: onFrame, error: failer("video decoder") }), sig = signal(), pumpSig = signal();
		venc.addEventListener("dequeue", sig.wake); vdec.addEventListener("dequeue", sig.wake);
		var mp4 = MP4Box.createFile(), vId = 0, aId = 0, vtrak, atrak;
		function onFrame(frame) {
			try {
				if (failed || cancelled(f)) { frame.close(); return; }
				lastVideoTs = frame.timestamp;
				if (!V.keepFrame(frame.timestamp, lastTs, p.fps)) { frame.close(); return; }
				lastTs = frame.timestamp; var out = frame, dur = frame.duration || undefined;
				if (needCanvas) {
					ctx.save();
					if (fmt === "webm" && p.rot) { ctx.translate(ow / 2, oh / 2); ctx.rotate(p.rot * Math.PI / 180); ctx.drawImage(frame, -p.w / 2, -p.h / 2, p.w, p.h); } else ctx.drawImage(frame, 0, 0, ow, oh);
					ctx.restore(); out = new VideoFrame(canvas, { timestamp: frame.timestamp, duration: dur }); frame.close();
				}
				var eo = { keyFrame: frames % kfEvery === 0 }; if (qNext) eo.avc = { quantizer: qNext() };
				venc.encode(out, eo); out.close(); frames++;
			} catch (e) { fail(e); }
		}
		var vSamples = 0;
		if (doAudio) {
			aenc = !passthru ? new AudioEncoder({ output: function (c, m) { try { muxer.addAudioChunk(c, m); } catch (e) { fail(e); } }, error: fail }) : null;
		}
		var firstAudio = true, readyFlag = false;
		mp4.onError = fail;
		var ready = new Promise(function (res) {
			mp4.onReady = function (info) {
				var vt = info.videoTracks[0], at = info.audioTracks[0]; vId = vt.id; vtrak = mp4.getTrackById(vId);
				vdec.configure({ codec: vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description: descOf(vtrak) });
				mp4.setExtractionOptions(vId, null, { nbSamples: 60 });
				if (doAudio && at) {
					aId = at.id; atrak = mp4.getTrackById(aId); var adesc = audioDescOf(atrak);
					try {
						if (!passthru) {
							adec = new AudioDecoder({ output: function (ad) { try { if (!failed && !cancelled(f)) aenc.encode(ad); } catch (e) { fail(e); } ad.close(); }, error: failer("audio decoder") });
							adec.configure({ codec: at.codec, sampleRate: at.audio.sample_rate, numberOfChannels: at.audio.channel_count, description: adesc });
							aenc.configure({ codec: aCodec, sampleRate: aRate, numberOfChannels: aChannels, bitrate: p.abps });
						}
						mp4.setExtractionOptions(aId, null, { nbSamples: 120 });
					} catch (e) { doAudio = false; aId = 0; audioNote = "(sound was removed: it could not be read)"; }
					f._adesc = adesc;
				}
				mp4.start(); readyFlag = true; res();
			};
		});
		var seen = {}, relOk = true, hold = {};   // relOk / hold: samples are released (memory) only once no seek-back is pending and never inside the part that is re-delivered after it   // after the seek-back below mp4box re-delivers the first samples: keep each one once
		mp4.onSamples = function (id, u, samples) { for (var j = 0; j < samples.length; j++) { var n = samples[j].number; if (seen[id] != null && n <= seen[id]) continue; seen[id] = n; Q.push({ id: id, s: samples[j] }); } sig.wake(); };
		// demux pump with backpressure
		(async function pump() {
			try {
				var off = 0, CH = 4194304, seeks = 0, jumped = false, restarted = false;
				while (off < file.size && !failed && !cancelled(f)) {
					while (Q.length > 200 && !failed && !cancelled(f)) await pumpSig.wait(250);
					var end = Math.min(file.size, off + CH), buf = await file.slice(off, end).arrayBuffer(); buf.fileStart = off;
					var next = mp4.appendBuffer(buf, end >= file.size);
					if (!restarted && typeof next === "number" && next !== end) { if (++seeks > 50) throw new Error("This file's structure could not be read."); jumped = true; relOk = false; off = next; } else off = end;
					// the index (moov) sits at the END of the file (phones, screen recorders): after jumping there, go back and read the pictures from the start
					if (readyFlag && jumped && !restarted) { restarted = true; relOk = true; for (var hk in seen) hold[hk] = seen[hk]; off = mp4.seek(0, true).offset; }
				}
				mp4.flush();
			} catch (e) { fail(e); }
			demuxDone = true; sig.wake();
		})();
		await ready;
		var firstAudioChunk = true, tMax = i.dur * 1e6;
		while (!failed && !cancelled(f)) {
			var it = Q.shift(); if (Q.length < 100) pumpSig.wake();
			if (!it) { if (demuxDone && !Q.length) break; await sig.wait(250); continue; }
			var s = it.s, ts = Math.round(s.cts * 1e6 / s.timescale), du = Math.round(s.duration * 1e6 / s.timescale);
			if (it.id === vId) {
				while ((vdec.decodeQueueSize > 24 || venc.encodeQueueSize > 12) && !failed && !cancelled(f)) await sig.wait(250);
				vdec.decode(new EncodedVideoChunk({ type: s.is_sync ? "key" : "delta", timestamp: ts, duration: du, data: s.data })); vSamples++;
				if (vSamples % 8 === 0) { var fr = Math.min(1, lastVideoTs / Math.max(1, tMax)); setProgress(f, fr * 98, label + "Compressing " + V.formatTime(lastVideoTs / 1e6) + " of " + V.formatTime(i.dur) + " (" + Math.round(fr * 100) + "%)" + eta(f, fr)); }
			} else if (it.id === aId && doAudio) {
				try {
					if (passthru) { var meta = firstAudioChunk ? { decoderConfig: { codec: "mp4a.40.2", numberOfChannels: aChannels, sampleRate: aRate, description: f._adesc } } : undefined; firstAudioChunk = false; muxer.addAudioChunk(new EncodedAudioChunk({ type: "key", timestamp: ts, duration: du, data: s.data }), meta); }
					else adec.decode(new EncodedAudioChunk({ type: "key", timestamp: ts, duration: du, data: s.data }));
				} catch (e) { fail(e); }
			}
			if (relOk && !(hold[it.id] != null && s.number <= hold[it.id])) { if (it.id === vId) mp4.releaseUsedSamples(vId, s.number + 1); else if (it.id === aId) mp4.releaseUsedSamples(aId, s.number + 1); }
		}
		function closeAll() { try { vdec.close(); } catch (e) { /* ignore */ } try { venc.close(); } catch (e) { /* ignore */ } try { if (adec) adec.close(); } catch (e) { /* ignore */ } try { if (aenc) aenc.close(); } catch (e) { /* ignore */ } }
		if (failed || cancelled(f)) { closeAll(); try { if (writable) await writable.abort(); } catch (e) { /* ignore */ } if (failed) throw failed; var ce = new Error("Cancelled."); ce.cancelled = true; throw ce; }
		setProgress(f, 99, label + "Finishing...");
		try {
			await vdec.flush(); await venc.flush(); if (adec) await adec.flush(); if (aenc) await aenc.flush();
			if (failed) throw failed;
			muxer.finalize(); closeAll();
			if (writable) { await writable.close(); var sf = await t.handle.getFile(); return { size: sf.size, blob: null, audioNote: audioNote }; }
		} catch (e) { closeAll(); try { if (writable) await writable.abort(); } catch (x) { /* ignore */ } throw e; }
		var buf2 = target.buffer, bl = new Blob([buf2], { type: fmt === "webm" ? "video/webm" : "video/mp4" });
		return { size: bl.size, blob: bl, audioNote: audioNote };
	}

	/* ---------- slow path: play through a canvas and record in real time ---------- */
	async function runRecorder(f, dest, used) {
		if (!window.MediaRecorder) throw new Error("This browser can neither encode video nor record it, so it cannot compress this file.");
		var p = f.plan, i = f.info, u = URL.createObjectURL(f.file), v = document.createElement("video"), ac = null;
		v.playsInline = true; v.preload = "auto"; v.src = u;
		await new Promise(function (res, rej) { v.onloadeddata = res; v.onerror = function () { rej(new Error("This browser cannot play this video.")); }; });
		var d = V.fitDims(v.videoWidth, v.videoHeight, capValue()), w = d.w, h = d.h;   // the element reports the picture as it is DISPLAYED (rotation applied)
		var canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; var ctx = canvas.getContext("2d");
		var fps = p.fps || 30, stream = canvas.captureStream(fps);
		if (S.audio !== "none") { try { ac = new (window.AudioContext || window.webkitAudioContext)(); var src = ac.createMediaElementSource(v), dst = ac.createMediaStreamDestination(); src.connect(dst); dst.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); }); } catch (e) { /* no sound */ } }
		var want = S.fmt === "mp4" ? ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"] : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
		var mime = want.filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0] || "", ext = /mp4/.test(mime) ? "mp4" : "webm";
		var rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: p.vbps, audioBitsPerSecond: Math.max(32000, p.abps || 96000) }), chunks = [];
		rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
		var stopped = new Promise(function (res) { rec.onstop = res; }), ended = false;
		function draw() { try { ctx.drawImage(v, 0, 0, w, h); } catch (e) { /* ignore */ } }
		function loop() {
			if (ended) return; draw(); var fr = v.duration ? v.currentTime / v.duration : 0; setProgress(f, fr * 98, "Recording in real time " + V.formatTime(v.currentTime) + " of " + V.formatTime(v.duration) + eta(f, fr));
			if (cancelled(f)) { ended = true; v.pause(); try { rec.stop(); } catch (e) { /* ignore */ } return; }
			setTimeout(loop, 1000 / fps);   // a timer, not requestVideoFrameCallback: that stops firing when the tab is not in front
		}
		v.onended = function () { ended = true; draw(); setTimeout(function () { try { rec.stop(); } catch (e) { /* ignore */ } }, 150); };
		if (ac && ac.state === "suspended") await ac.resume();
		rec.start(1000); await v.play(); loop(); await stopped;
		try { if (ac) ac.close(); } catch (e) { /* ignore */ } URL.revokeObjectURL(u); stream.getTracks().forEach(function (tr) { tr.stop(); });
		if (cancelled(f)) { var ce = new Error("Cancelled."); ce.cancelled = true; throw ce; }
		var bl = new Blob(chunks, { type: (mime || "video/webm").split(";")[0] }), t = await openTarget(f, dest, used, ext);
		if (t.handle) { var wr = await t.handle.createWritable(); await wr.write(bl); await wr.close(); }
		return finishOut(t, bl, bl.size, ext === "webm" && i.dur ? "(recorded in real time; some players cannot skip around in this file)" : "");
	}

	probeCaps(); fillOptions();
	if (qs.get("debug") === "1") window.MESVidDebug = { get files() { return files; }, support: support, caps: caps };   // for testing: the queue, probe results and plans
	window.addEventListener("beforeunload", function (e) { if (busy) { e.preventDefault(); e.returnValue = ""; } });
})();
