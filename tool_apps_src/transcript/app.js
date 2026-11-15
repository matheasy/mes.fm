/* MES Transcript & Timestamps (mes.fm/transcript). YouTube captions through /api/yt-transcript; 3Speak / Odysee / files through Whisper in the
   browser (transformers.js); chapters + exports from MESTx (lib.js). MESYA (youtube-audio lib) parses links and reads 3Speak's sound. */
(function () {
	"use strict";
	var X = window.MESTx, Y = window.MESYA, root = document.getElementById("tx");
	if (!root || !X || !Y) return;
	var $ = function (id) { return document.getElementById(id); };
	var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var KEY = "mes-transcript:v1", S = { model: "base", lang: "", mode: "paras", showt: true, follow: true, fmt: "paras", chhead: false, chdash: false };
	try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
	var save = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
	var TF = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6", HLS = "https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js";
	var dynImport = new Function("u", "return import(u)");
	var D = null;      /* {cues, title, sub, src: {kind, id, watch, file}, tracks, lang, desc, len} */
	var CH = [];       /* chapters [{t, title}] */
	var job = null, link = null, player = null;

	function toast(m) { var t = document.querySelector(".tu-toast"); if (!t) { t = document.createElement("div"); t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copy(text, what) {
		var ok = function () { toast((what || "Text") + " copied"); };
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fall); else fall();
		function fall() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) { toast("Could not copy"); } ta.remove(); }
	}
	function msg(html, err) { var m = $("tx-linkmsg"); m.innerHTML = html || ""; m.classList.toggle("tx-err", !!err); }
	function prog(text, f) { $("tx-prog").hidden = false; $("tx-progtext").textContent = text; $("tx-bar").style.width = Math.round(Math.max(0, Math.min(1, f || 0)) * 100) + "%"; }
	function progOff() { $("tx-prog").hidden = true; }
	function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

	/* ---------- source tabs ---------- */
	var tabs = [].slice.call(root.querySelectorAll(".tx-tabs [role=tab]"));
	function setTab(name) {
		tabs.forEach(function (b) { var on = b.dataset.tab === name; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; $("tx-p-" + b.dataset.tab).hidden = !on; });
	}
	tabs.forEach(function (b, i) {
		b.addEventListener("click", function () { setTab(b.dataset.tab); });
		b.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { var n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); setTab(n.dataset.tab); } });
	});

	/* ---------- Whisper options ---------- */
	Object.keys(X.MODELS).forEach(function (k) { var m = X.MODELS[k], o = document.createElement("option"); o.value = k; o.textContent = m.name + " · about " + m.mb[0] + " MB"; $("tx-model").appendChild(o); });
	X.LANGS.forEach(function (l) { var o = document.createElement("option"); o.value = l[0]; o.textContent = l[1]; $("tx-lang").appendChild(o); });
	$("tx-model").value = X.MODELS[S.model] ? S.model : "base"; $("tx-lang").value = S.lang || "";
	$("tx-model").addEventListener("change", function () { S.model = this.value; save(); });
	$("tx-lang").addEventListener("change", function () { S.lang = this.value; save(); });
	var asrSource = null; /* function () -> Promise<{audio Float32Array 16 kHz, title, player?}> */
	function offerAsr(why, getAudio) { asrSource = getAudio; $("tx-asrwhy").innerHTML = why; $("tx-asr").hidden = false; }
	function hideAsr() { $("tx-asr").hidden = true; asrSource = null; }
	$("tx-asrgo").addEventListener("click", function () { if (asrSource && !job) runAsr(asrSource); });
	$("tx-cancel").addEventListener("click", function () { if (job) job.cancel = true; });

	/* ---------- links ---------- */
	$("tx-form").addEventListener("submit", function (e) { e.preventDefault(); openLink($("tx-url").value); });
	async function openLink(text) {
		hideAsr(); msg("");
		var L = Y.parseLink(text); link = L;
		if (!L.ok) return msg(esc(L.reason), true);
		if (L.kind === "youtube") return openYouTube(L, "", "");
		if (L.kind === "3speak") return offerAsr("3Speak has no captions to read, so the transcript is made from the sound. The page reads the video's sound track straight from 3Speak (no playing needed).", function (j) { return speakAudio(L, j); });
		if (L.kind === "odysee" && L.id) return offerAsr("Odysee has no captions to read, so the transcript is made from the sound. The page downloads the video file from Odysee first.", function (j) { return odyseeAudio(L, j); });
		if (L.kind === "direct") return offerAsr("The transcript is made from the sound of that file. The page downloads it first (if that site allows other pages to read it).", function (j) { return urlAudio(L.watch, L.file || "audio", j, L.watch); });
		var name = Y.SITES[L.kind] || "That site";
		msg(esc(name) + " doesn't let other pages read its videos. Download the video (or its sound), then drop the file in the <b>File</b> tab: the transcript is made right here." + (L.kind === "other" ? " If this is a page with a video, look for a direct .mp4 or .mp3 link instead." : ""), true);
	}

	async function openYouTube(L, lang, kind) {
		msg("Reading the captions from YouTube…");
		try {
			var r = await fetch("/api/yt-transcript?v=" + L.id + (lang ? "&lang=" + encodeURIComponent(lang) : "") + (kind ? "&kind=" + kind : ""), { credentials: "omit" });
			var j = await r.json().catch(function () { return {}; });
			if (!r.ok && !j.title) throw new Error(j.error || ("The transcript service answered " + r.status + "."));
			if (!j.cues || !j.cues.length) {
				msg((j.title ? "<b>" + esc(j.title) + "</b> has no captions" : "That video has no captions") + (j.error ? " (" + esc(j.error) + ")" : "") + ". If it's your own video, download it in YouTube Studio (Content → ⋮ → Download) and drop the file in the <b>File</b> tab to make a transcript with speech recognition.", true);
				return;
			}
			msg("");
			show({ cues: X.norm(j.cues), title: j.title, sub: [j.author, X.fmt(j.len, j.len >= 3600), (j.auto ? "YouTube's automatic captions" : "Captions") + " (" + j.lang + ")"], src: { kind: "youtube", id: L.id, watch: L.watch, start: L.start }, tracks: j.tracks, lang: j.lang, auto: j.auto, desc: j.desc, len: j.len });
		} catch (e) {
			var local = /^(localhost|127\.)/.test(location.hostname);
			if (!local && /sign in|not a bot|confirm you/i.test(e.message || "")) return botMsg(L);
			msg(esc(local ? "The caption reader only runs on mes.fm itself (this is a local copy)." : (e.message || String(e))) + " You can still copy YouTube's own transcript (under the video: …more → Show transcript) and paste it in the <b>Paste captions</b> tab.", true);
		}
	}

	/* YouTube sometimes answers our server (a data-centre address) with "Sign in to confirm you're not a bot". That is about the server,
	   not the visitor, and signing in to anything here would not help, so say so and offer the two ways that do work. */
	function botMsg(L) {
		var w = L.watch || ("https://www.youtube.com/watch?v=" + L.id);
		msg("<b>YouTube is blocking our caption reader right now.</b> It asked mes.fm's server to prove it isn't a robot. This is not about you: you don't need an account or to sign in anywhere. Get the transcript from YouTube yourself in 3 steps:" +
			'<ol class="tx-steps"><li>Open the video on YouTube (button below).</li><li>Under the video tap <b>…more</b>, scroll down and tap <b>Show transcript</b>. Select all of it and copy.</li><li>Come back and paste it in the <b>Paste captions</b> tab.</li></ol>' +
			'<span class="tx-acts"><a class="tu-btn tu-btn--primary" href="' + esc(w) + '" target="_blank" rel="noopener">▶ Open the video on YouTube</a> ' +
			'<button type="button" class="tu-btn" id="tx-gopaste">📋 Go to Paste captions</button> <button type="button" class="tu-btn" id="tx-retry">↻ Try again</button></span>', true);
		$("tx-gopaste").addEventListener("click", function () { setTab("paste"); $("tx-paste").focus(); });
		$("tx-retry").addEventListener("click", function () { openLink($("tx-url").value); });
	}

	/* ---------- getting 16 kHz mono sound ---------- */
	var AC = window.AudioContext || window.webkitAudioContext, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
	function mono(ab) { var n = ab.length, out = new Float32Array(n), c, k = ab.numberOfChannels; for (c = 0; c < k; c++) { var d = ab.getChannelData(c); for (var i = 0; i < n; i++) out[i] += d[i] / k; } return out; }
	function decode16(bytes) {
		if (!OAC) return Promise.reject(new Error("This browser can't decode audio."));
		var oc = new OAC(1, 1, 16000), buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
		return new Promise(function (res, rej) { var p = oc.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); }).then(mono);
	}
	async function fileAudio(file, j) {
		prog("Reading the sound of " + file.name + "…", 0);
		if (file.size < 700e6) { try { return await decode16(await file.arrayBuffer()); } catch (e) { if (j.cancel) throw new Error("Cancelled"); } }
		var E = window.MESConvEngine;
		if (!E || !E.extractAudio) throw new Error("The browser could not read the sound of this file.");
		prog("The browser can't read " + file.name + " itself: loading the converter (about 30 MB, once)…", 0);
		var r = await E.extractAudio(file, { onStatus: function (m, x) { prog(m, x || 0); }, onProgress: function (x) { prog("Reading the sound of " + file.name + "…", x); } });
		if (j.cancel) throw new Error("Cancelled");
		if (r.encoded) return decode16(r.encoded);
		/* raw channels at r.sampleRate -> resample through an offline context */
		var n = r.channels[0].length, oc = new OAC(1, Math.ceil(n * 16000 / r.sampleRate), 16000), b = oc.createBuffer(r.channels.length, n, r.sampleRate);
		r.channels.forEach(function (c, i) { b.copyToChannel(c, i); });
		var s = oc.createBufferSource(); s.buffer = b; s.connect(oc.destination); s.start();
		return (await oc.startRendering()).getChannelData(0);
	}
	async function fetchBytes(url, name, j) {
		var r;
		try { r = await fetch(url, { credentials: "omit", mode: "cors" }); } catch (e) { throw new Error("That site doesn't let other pages download its files. Download it yourself and drop it in the File tab."); }
		if (!r.ok) throw new Error("The other site answered " + r.status + ".");
		var total = +r.headers.get("content-length") || 0, parts = [], got = 0;
		if (r.body && r.body.getReader) {
			var rd = r.body.getReader();
			for (;;) { var y = await rd.read(); if (y.done) break; if (j.cancel) { try { rd.cancel(); } catch (e) {} throw new Error("Cancelled"); } parts.push(y.value); got += y.value.length; prog("Downloading " + name + "… " + (got / 1e6).toFixed(1) + (total ? " of " + (total / 1e6).toFixed(0) : "") + " MB", total ? got / total : 0); }
			var all = new Uint8Array(got), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; }); return all;
		}
		return new Uint8Array(await r.arrayBuffer());
	}
	async function urlAudio(url, name, j, page) {
		var bytes = await fetchBytes(url, name, j);
		prog("Reading the sound…", 1);
		var audio = await decode16(bytes).catch(function () { throw new Error("The browser could not read the sound of that file."); });
		return { audio: audio, title: name, player: { kind: "media", url: url }, page: page };
	}
	async function odyseeAudio(L, j) {
		prog("Finding the video file on Odysee…", 0);
		var r = await fetch("https://api.na-backend.odysee.com/api/v1/proxy?m=get", { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ jsonrpc: "2.0", method: "get", params: { uri: Y.lbryUrl(L.id), save_file: false }, id: 1 }) });
		var o = await r.json(), u = o && o.result && o.result.streaming_url;
		if (!u) throw new Error((o && o.error && o.error.message) || "Odysee did not give a file for that video.");
		var name = decodeURIComponent((L.id.split("/").pop() || "video").replace(/:[0-9a-f]+$/i, ""));
		var res = await urlAudio(u, name, j, L.watch);
		res.title = (o.result.metadata && o.result.metadata.title) || name;
		return res;
	}
	async function speakAudio(L, j) {
		prog("Finding the video's sound track on 3Speak…", 0);
		var r = await fetch("https://play.3speak.tv/api/embed?v=" + encodeURIComponent(L.id).replace("%2F", "/"), { credentials: "omit" });
		if (!r.ok) throw new Error("3Speak answered " + r.status + ".");
		var info = await r.json(), u0 = info && (info.videoUrl || info.videoUrlFallback1 || info.videoUrlFallback2);
		if (!u0) throw new Error("3Speak has no video for that link.");
		var url = Y.speakUrl(u0), get = async function (u) { var x = await fetch(u, { credentials: "omit" }); if (!x.ok) throw new Error("3Speak answered " + x.status + "."); return x; };
		var pl = Y.parseM3U8(await (await get(url)).text(), url);
		if (pl.variants.length) { var vv = Y.lightest(pl.variants); pl = Y.parseM3U8(await (await get(vv.url)).text(), vv.url); }
		var segs = pl.segments; if (!segs.length) throw new Error("That 3Speak video has no parts to read.");
		var st = {}, parts = [], len = 0, got = 0, secs = 0, fetches = [], ahead = 3;
		for (var k = 0; k < Math.min(ahead, segs.length); k++) fetches.push(get(segs[k].url).then(function (x) { return x.arrayBuffer(); }));
		for (var i = 0; i < segs.length; i++) {
			if (j.cancel) throw new Error("Cancelled");
			var b = new Uint8Array(await fetches[i]); got += b.length;
			if (i + ahead < segs.length) fetches.push(get(segs[i + ahead].url).then(function (x) { return x.arrayBuffer(); }));
			var a = Y.tsAudio(b, st); if (a) { parts.push(a); len += a.length; }
			secs += segs[i].dur || 0;
			prog("Reading the sound of “" + (info.title || L.id) + "”… " + X.fmt(secs) + " of " + X.fmt(pl.total) + " (" + (got / 1e6).toFixed(0) + " MB)", (i + 1) / segs.length * 0.9);
		}
		if (!len) throw new Error("That 3Speak video has no sound track.");
		var all = new Uint8Array(len), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; });
		/* AAC frames decoded in batches (a whole hour at once can run out of memory), resampled to 16 kHz by the offline context */
		var A = Y.adtsFrames(all), n = A.frames.length, sr = A.sr || 44100, BATCH = 2600, OV = 8, out = new Float32Array(Math.ceil(n * 1024 * 16000 / sr) + 16000), pos = 0;
		for (var f = 0; f < n; f += BATCH) {
			if (j.cancel) throw new Error("Cancelled");
			var from = Math.max(0, f - OV), to = Math.min(n, f + BATCH), last = A.frames[to - 1];
			var pcm = await decode16(all.subarray(A.frames[from].o, last.o + last.l));
			var want = Math.min(pcm.length, Math.round((to - f) * 1024 * 16000 / sr));
			out.set(pcm.subarray(pcm.length - want), pos); pos += want;
			prog("Decoding the sound…", 0.9 + 0.1 * to / n);
		}
		return { audio: out.subarray(0, pos), title: info.title || L.id, player: { kind: "3speak", url: url }, page: L.watch };
	}

	/* ---------- Whisper ---------- */
	var asr = null, asrKey = "";
	async function loadAsr(model, j) {
		var M = X.MODELS[model] || X.MODELS.base;
		var gpu = false;
		try { gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch (e) {}
		var key = M.id + (gpu ? "|gpu" : "|cpu");
		if (asr && asrKey === key) return asr;
		prog("Loading speech recognition…", 0);
		var T = await dynImport(TF + "/dist/transformers.min.js").catch(function () { return dynImport("https://unpkg.com/@huggingface/transformers@3.7.6/dist/transformers.min.js"); });
		var files = {};
		var cb = function (p) {
			if (j.cancel) return;
			if (p.status === "progress" && p.file) { files[p.file] = [p.loaded || 0, p.total || 0]; var a = 0, b = 0; for (var k in files) { a += files[k][0]; b += files[k][1]; } prog("Downloading the " + M.name.toLowerCase() + " speech model (once; your browser keeps it)… " + (a / 1e6).toFixed(0) + (b ? " of " + (b / 1e6).toFixed(0) : "") + " MB", b ? a / b : 0); }
		};
		var opts = gpu ? { device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback: cb } : { device: "wasm", dtype: "q8", progress_callback: cb };
		try { asr = await T.pipeline("automatic-speech-recognition", M.id, opts); }
		catch (e) { if (!gpu) throw e; asr = await T.pipeline("automatic-speech-recognition", M.id, { device: "wasm", dtype: "q8", progress_callback: cb }); key = M.id + "|cpu"; }
		asrKey = key; asr.__gpu = /gpu/.test(key);
		return asr;
	}
	async function runAsr(getAudio) {
		var j = job = { cancel: false };
		$("tx-asrgo").disabled = true;
		try {
			var src = await getAudio(j);
			if (src instanceof Float32Array) src = { audio: src };
			var audio = src.audio, total = audio.length / 16000;
			if (total < 1) throw new Error("There is almost no sound in that file.");
			var p = await loadAsr(S.model, j);
			if (j.cancel) throw new Error("Cancelled");
			var blocks = X.blocks(total, 120, 5), cues = [], t0 = Date.now(), lang = S.lang || null;
			var model = X.MODELS[S.model] || X.MODELS.base;
			for (var i = 0; i < blocks.length; i++) {
				if (j.cancel) throw new Error("Cancelled");
				var b = blocks[i], el = (Date.now() - t0) / 1000, done = b.s / total;
				var left = i && done > 0 ? el / done * (1 - done) : 0;
				prog("Listening (" + (p.__gpu ? "graphics card" : "processor") + ", " + model.name.toLowerCase() + ")… " + X.fmt(b.s) + " of " + X.fmt(total) + (left ? " · about " + X.fmt(left) + " left" : ""), done);
				await yieldUI();
				var o = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
				if (lang && !/\.en$/.test(model.id)) { o.language = lang; o.task = "transcribe"; }
				var r = await p(audio.subarray(Math.floor(b.s * 16000), Math.floor(b.e * 16000)), o);
				cues = cues.concat(X.whisperCues(r.chunks, b.s, b.keepFrom, b.keepTo));
				if (cues.length) show(Object.assign(baseFrom(src, total), { cues: X.norm(cues), partial: true }), true);
			}
			if (!cues.length) throw new Error("No speech was found.");
			show(Object.assign(baseFrom(src, total), { cues: X.norm(cues) }), true);
			toast("Transcript ready: " + X.fmt((Date.now() - t0) / 1000) + " for " + X.fmt(total));
			hideAsr();
		} catch (e) {
			if (!/Cancelled/.test(e.message)) msg(esc(e.message || String(e)), true);
		} finally { job = null; $("tx-asrgo").disabled = false; progOff(); }
	}
	function baseFrom(src, total) {
		return { title: src.title || "Transcript", sub: [X.fmt(total, total >= 3600), "Made with Whisper (" + (X.MODELS[S.model] || X.MODELS.base).name + ")"], src: { kind: src.player ? src.player.kind : "none", url: src.player && src.player.url, watch: src.page }, len: total };
	}

	/* ---------- files and pasted text ---------- */
	var CAPS = /\.(srt|vtt|sbv|txt|json)$/i;
	function openFile(file) {
		if (!file) return;
		hideAsr(); msg("");
		if (CAPS.test(file.name) || /^text\//.test(file.type)) {
			file.text().then(function (t) { openText(t, file.name.replace(/\.[^.]+$/, "")); });
			return;
		}
		var url = URL.createObjectURL(file);
		offerAsr("<b>" + esc(file.name) + "</b> (" + (file.size / 1e6).toFixed(1) + " MB): press Start to turn its speech into text.", async function (j) {
			var audio = await fileAudio(file, j);
			return { audio: audio, title: file.name.replace(/\.[^.]+$/, ""), player: { kind: /^audio\//.test(file.type) ? "audio" : "media", url: url } };
		});
	}
	function openText(t, title) {
		var p = X.parseText(t);
		if (!p.cues.length) return toast("No captions found in that text.");
		if (p.kind === "plain") toast("No times found: showing it as plain text.");
		show({ cues: p.cues, title: title || "Pasted captions", sub: [X.fmt(X.end(p.cues)), ({ srt: "SRT", vtt: "WebVTT", json: "JSON", stamps: "Times + text", plain: "Plain text" })[p.kind] || p.kind], src: { kind: "none" }, len: X.end(p.cues) });
	}
	$("tx-file").addEventListener("change", function () { openFile(this.files[0]); this.value = ""; });
	var drop = $("tx-drop");
	["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("tx-over"); }); });
	["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("tx-over"); }); });
	drop.addEventListener("drop", function (e) { e.preventDefault(); openFile(e.dataTransfer && e.dataTransfer.files[0]); });
	root.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) e.preventDefault(); });
	root.addEventListener("drop", function (e) { if (e.defaultPrevented) return; var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); setTab("file"); openFile(f); } });
	$("tx-pastego").addEventListener("click", function () { openText($("tx-paste").value); });

	/* ---------- player ---------- */
	var ytReady = null;
	function loadYT() {
		if (ytReady) return ytReady;
		ytReady = new Promise(function (res) {
			if (window.YT && window.YT.Player) return res();
			var prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) {} res(); };
			var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
		});
		return ytReady;
	}
	var curPlayerKey = "";
	function setPlayer(src) {
		var box = $("tx-player"), key = src.kind + "|" + (src.id || src.url || "");
		if (key === curPlayerKey) return;
		curPlayerKey = key; box.innerHTML = ""; player = null;
		if (src.kind === "youtube") {
			var d = document.createElement("div"); d.className = "tx-yt"; box.appendChild(d);
			loadYT().then(function () {
				if (curPlayerKey !== key) return;
				var yp = new YT.Player(d, { videoId: src.id, host: "https://www.youtube-nocookie.com", playerVars: { rel: 0, playsinline: 1, start: src.start || 0 } });
				player = { time: function () { try { return yp.getCurrentTime() || 0; } catch (e) { return 0; } }, seek: function (t) { try { yp.seekTo(t, true); yp.playVideo(); } catch (e) {} }, playing: function () { try { return yp.getPlayerState() === 1; } catch (e) { return false; } } };
			});
		} else if (src.kind === "media" || src.kind === "audio" || src.kind === "3speak") {
			var v = document.createElement(src.kind === "audio" ? "audio" : "video"); v.controls = true; v.playsInline = true; v.preload = "metadata"; box.appendChild(v);
			if (src.kind === "3speak" && !Y.hlsNative(v)) {
				var x = document.createElement("script"); x.src = HLS; x.onload = function () { if (window.Hls && Hls.isSupported()) { var h = new Hls(); h.loadSource(src.url); h.attachMedia(v); } }; document.head.appendChild(x);
			} else v.src = src.url;
			player = { time: function () { return v.currentTime || 0; }, seek: function (t) { v.currentTime = t; var p = v.play(); if (p && p.catch) p.catch(function () {}); }, playing: function () { return !v.paused; } };
		}
		$("tx-followl").hidden = src.kind === "none";
	}

	/* ---------- showing a transcript ---------- */
	function show(d, keepCh) {
		var first = !D || D.title !== d.title || !keepCh;
		D = d;
		$("tx-res").hidden = false;
		$("tx-title").textContent = d.title || "Transcript";
		var words = X.wordCount(d.cues);
		$("tx-sub").textContent = (d.sub || []).filter(Boolean).concat([words.toLocaleString() + " words", d.partial ? "still listening…" : ""]).filter(Boolean).join(" · ");
		setPlayer(d.src || { kind: "none" });
		/* caption tracks */
		var tr = d.tracks || [];
		$("tx-trackrow").hidden = tr.length < 2;
		if (tr.length >= 2) {
			$("tx-track").innerHTML = tr.map(function (t, i) { return '<option value="' + i + '"' + (t.code === d.lang && !!t.auto === !!d.auto ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("");
		}
		$("tx-autonote").textContent = d.auto ? "Automatic captions: names and technical words may be wrong." : "";
		related();
		renderList();
		if (first || !CH.length) makeChapters(true);
		renderExport();
		var dc = d.desc ? X.descChapters(d.desc) : [];
		$("tx-descch").hidden = !dc.length;
		if (dc.length) { $("tx-descch").innerHTML = "This video's description already has <b>" + dc.length + " chapters</b>. <button type='button' class='tu-btn tu-btn--ghost' id='tx-usedesc'>Show them here</button>"; $("tx-usedesc").onclick = function () { setChapters(dc); }; }
		$("tx-ailen").textContent = "The request is about " + Math.round(X.prompt(d.cues, { title: d.title }).length / 1000) + "k characters" + (X.end(d.cues) > 5400 ? ": long videos may need a chatbot with a big context (Claude, Gemini, ChatGPT)." : ".");
		var q = X.text(d.cues).slice(0, 1800);
		$("tx-tolate").href = "/translate?q=" + encodeURIComponent(q);
		if (first && d.src && d.src.kind !== "none") { try { $("tx-res").scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
	}
	$("tx-track").addEventListener("change", function () { var t = (D.tracks || [])[+this.value]; if (t && link) openYouTube(link, t.code, t.auto ? "asr" : ""); });
	function related() {
		var s = D.src || {}, u = s.watch;
		var h = [];
		if (u) {
			var q = encodeURIComponent(u);
			h.push('<a href="' + esc(u) + '" target="_blank" rel="noopener">Open the video ↗</a>');
			if (/youtube|3speak|odysee|rumble/.test(u)) h.push('<a href="/youtube-thumbnail?url=' + q + '">Get the thumbnail</a>');
			h.push('<a href="/youtube-audio?u=' + q + '">Measure its loudness</a>');
			h.push('<a href="/watch?v=' + q + '">Watch it on MES Watch</a>');
			$("tx-x-thumb").href = "/youtube-thumbnail?url=" + q; $("tx-x-audio").href = "/youtube-audio?u=" + q; $("tx-x-watch").href = "/watch?v=" + q;
		}
		$("tx-related").innerHTML = h.join("");
	}

	/* transcript list */
	var segs = [], hits = [], hitAt = -1;
	function segments() {
		if (S.mode === "paras") return X.paragraphs(D.cues).map(function (p) { return { t: p.t, text: p.text }; });
		return D.cues.map(function (c) { return { t: c[0], text: c[2] }; });
	}
	function hl(text, q) {
		if (!q) return esc(text);
		var low = text.toLowerCase(), out = "", i = 0, k;
		while ((k = low.indexOf(q, i)) >= 0) { out += esc(text.slice(i, k)) + "<mark>" + esc(text.slice(k, k + q.length)) + "</mark>"; i = k + q.length; }
		return out + esc(text.slice(i));
	}
	function renderList() {
		segs = segments();
		var q = $("tx-q").value.trim().toLowerCase(), long = X.end(D.cues) >= 3600;
		root.classList.toggle("tx-not", !S.showt);
		$("tx-list").innerHTML = segs.map(function (s, i) { return '<div class="tx-ln' + (S.mode === "paras" ? " tx-para" : "") + '" data-i="' + i + '"><a class="tx-t" href="#t=' + Math.floor(s.t) + '" tabindex="-1">' + X.fmt(s.t, long) + "</a><span>" + hl(s.text, q) + "</span></div>"; }).join("");
		hits = [].slice.call($("tx-list").querySelectorAll("mark")); hitAt = -1;
		$("tx-qn").textContent = q ? (hits.length ? hits.length + " found" : "none found") : "";
		nowI = -1;
	}
	[].forEach.call($("tx-mode").querySelectorAll("button"), function (b) {
		b.addEventListener("click", function () { S.mode = b.dataset.m; save(); modeUI(); renderList(); });
	});
	function modeUI() { [].forEach.call($("tx-mode").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.dataset.m === S.mode); b.classList.toggle("is-on", b.dataset.m === S.mode); }); }
	$("tx-showt").checked = !!S.showt; $("tx-follow").checked = !!S.follow;
	$("tx-showt").addEventListener("change", function () { S.showt = this.checked; save(); root.classList.toggle("tx-not", !S.showt); });
	$("tx-follow").addEventListener("change", function () { S.follow = this.checked; save(); });
	var qt = null;
	$("tx-q").addEventListener("input", function () { clearTimeout(qt); qt = setTimeout(function () { renderList(); if (hits.length) step(1); }, 160); });
	$("tx-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === "Escape") { this.value = ""; renderList(); } });
	$("tx-qx").addEventListener("click", function () { step(1); });
	$("tx-qp").addEventListener("click", function () { step(-1); });
	function step(d) {
		if (!hits.length) return;
		if (hits[hitAt]) hits[hitAt].classList.remove("tx-cur");
		hitAt = (hitAt + d + hits.length) % hits.length;
		var m = hits[hitAt]; m.classList.add("tx-cur"); scrollInto(m.closest(".tx-ln"));
		$("tx-qn").textContent = (hitAt + 1) + " of " + hits.length;
	}
	function scrollInto(el) { var L = $("tx-list"); if (!el) return; L.scrollTop = el.offsetTop - L.offsetTop - L.clientHeight / 3; }
	$("tx-list").addEventListener("click", function (e) {
		var ln = e.target.closest(".tx-ln"); if (!ln) return; e.preventDefault();
		if (window.getSelection && String(window.getSelection()).length > 2) return; /* selecting text, not seeking */
		var s = segs[+ln.dataset.i]; if (s && player) player.seek(s.t);
		else if (s && D.src && D.src.watch && D.src.kind === "youtube") window.open("https://www.youtube.com/watch?v=" + D.src.id + "&t=" + Math.floor(s.t) + "s", "_blank", "noopener");
	});
	/* follow the playing video */
	var nowI = -1;
	setInterval(function () {
		if (!D || !player || $("tx-res").hidden) return;
		var t = player.time(), i = -1;
		for (var k = 0; k < segs.length; k++) { if (segs[k].t <= t + 0.2) i = k; else break; }
		if (i === nowI) return;
		var L = $("tx-list"), old = L.querySelector(".tx-now"); if (old) old.classList.remove("tx-now");
		nowI = i; var el = L.querySelector('[data-i="' + i + '"]');
		if (el) { el.classList.add("tx-now"); if (S.follow && player.playing() && !$("tx-q").value) scrollInto(el); }
	}, 300);
	$("tx-copyall").addEventListener("click", function () { copy(S.mode === "paras" ? X.toTXT(D.cues, { paras: true }) : X.text(D.cues), "Transcript"); });
	$("tx-copyt").addEventListener("click", function () { copy(X.toTXT(D.cues, { stamps: true, paras: S.mode === "paras" }), "Transcript with times"); });

	/* ---------- results tabs ---------- */
	var vtabs = [].slice.call(root.querySelectorAll(".tx-vtabs [role=tab]"));
	function setView(v) { vtabs.forEach(function (b) { var on = b.dataset.v === v; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; $("tx-v-" + b.dataset.v).hidden = !on; }); if (v === "ex") renderExport(); }
	vtabs.forEach(function (b, i) {
		b.addEventListener("click", function () { setView(b.dataset.v); });
		b.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { var n = vtabs[(i + d + vtabs.length) % vtabs.length]; n.focus(); setView(n.dataset.v); } });
	});

	/* ---------- chapters ---------- */
	for (var n = 3; n <= 40; n++) { var o = document.createElement("option"); o.value = n; o.textContent = n + " chapters"; $("tx-chn").appendChild(o); }
	$("tx-chhead").checked = !!S.chhead; $("tx-chdash").checked = !!S.chdash;
	function makeChapters(quiet) { if (!D) return; setChapters(X.chapters(D.cues, { n: +$("tx-chn").value || 0 })); if (!quiet) toast("New draft: " + CH.length + " chapters"); }
	$("tx-chmake").addEventListener("click", function () { makeChapters(false); });
	$("tx-chn").addEventListener("change", function () { makeChapters(false); });
	$("tx-chadd").addEventListener("click", function () {
		var t = player ? Math.floor(player.time()) : (CH.length ? CH[CH.length - 1].t + 60 : 0);
		CH.push({ t: t, title: "New chapter" }); CH.sort(function (a, b) { return a.t - b.t; }); renderChapters();
	});
	function setChapters(c) { CH = c.map(function (x) { return { t: x.t, title: x.title }; }); renderChapters(); }
	function renderChapters() {
		var long = X.end(D.cues) >= 3600;
		$("tx-chlist").innerHTML = CH.map(function (c, i) {
			return '<li data-i="' + i + '"><button type="button" class="tx-chgo" title="Play from here" aria-label="Play from ' + X.fmt(c.t, long) + '">▶</button><input class="tx-cht" value="' + X.fmt(c.t, long) + '" aria-label="Time of chapter ' + (i + 1) + '"><input class="tx-chti" value="' + esc(c.title) + '" aria-label="Title of chapter ' + (i + 1) + '"><button type="button" class="tx-ib tx-chdel" title="Delete" aria-label="Delete chapter ' + (i + 1) + '">✕</button></li>';
		}).join("");
		chOut();
	}
	function chOut() {
		var why = X.checkChapters(CH, D ? X.end(D.cues) : 0), el = $("tx-chcheck");
		el.className = "tx-chcheck " + (why.length ? "tx-no" : "tx-ok");
		el.textContent = why.length ? "⚠ " + why.join(" ") : "✓ Follows YouTube's rules for chapters (" + CH.length + " chapters).";
		$("tx-chout").value = (S.chhead ? "Timestamps:\n" : "") + X.fmtChapters(CH, { dash: S.chdash });
	}
	$("tx-chlist").addEventListener("input", function (e) {
		var li = e.target.closest("li"); if (!li) return; var c = CH[+li.dataset.i];
		if (e.target.classList.contains("tx-chti")) c.title = e.target.value;
		else { var t = X.parseTime(e.target.value); e.target.classList.toggle("tx-bad", !isFinite(t)); if (isFinite(t)) c.t = Math.floor(t); }
		chOut();
	});
	$("tx-chlist").addEventListener("change", function (e) { if (e.target.classList.contains("tx-cht")) { CH.sort(function (a, b) { return a.t - b.t; }); renderChapters(); } });
	$("tx-chlist").addEventListener("click", function (e) {
		var li = e.target.closest("li"); if (!li) return; var i = +li.dataset.i;
		if (e.target.classList.contains("tx-chdel")) { CH.splice(i, 1); renderChapters(); }
		else if (e.target.classList.contains("tx-chgo") && player) player.seek(CH[i].t);
	});
	$("tx-chout").addEventListener("change", function () { var c = X.parseChapters(this.value); if (c.length) setChapters(c); });
	$("tx-chhead").addEventListener("change", function () { S.chhead = this.checked; save(); chOut(); });
	$("tx-chdash").addEventListener("change", function () { S.chdash = this.checked; save(); chOut(); });
	$("tx-chcopy").addEventListener("click", function () { copy($("tx-chout").value, "Chapters"); });
	$("tx-aicopy").addEventListener("click", function () { copy(X.prompt(D.cues, { title: D.title, n: +$("tx-chn").value || 0 }), "Request"); });
	$("tx-aiuse").addEventListener("click", function () {
		var c = X.parseChapters($("tx-aians").value);
		if (!c.length) return toast("No \"0:00 Title\" lines found in that answer.");
		setChapters(c); toast(c.length + " chapters from the AI");
	});
	/* Chrome's built-in model (Prompt API), when the browser has it */
	var LM = window.LanguageModel;
	if (LM && LM.availability) LM.availability().then(function (a) { $("tx-nano").hidden = a === "unavailable"; }).catch(function () {});
	$("tx-nanogo").addEventListener("click", async function () {
		var btn = this; btn.disabled = true;
		try {
			var s = await LM.create({ initialPrompts: [{ role: "system", content: "You write short YouTube chapter titles (2 to 6 words, no quotes, no time) from a piece of a video transcript." }] });
			for (var i = 0; i < CH.length; i++) {
				var e = CH[i + 1] ? CH[i + 1].t : Infinity;
				var text = D.cues.filter(function (c) { return c[0] >= CH[i].t && c[0] < e; }).map(function (c) { return c[2]; }).join(" ").slice(0, 3500);
				btn.textContent = "🧠 Writing title " + (i + 1) + " of " + CH.length + "…";
				var t = (await s.prompt("Transcript piece:\n" + text + "\n\nChapter title:")).split("\n")[0].replace(/^["'*\s]+|["'*\s.]+$/g, "").slice(0, 80);
				if (t) { CH[i].title = t; renderChapters(); }
			}
			toast("Titles written on this computer");
		} catch (err) { toast("The browser's AI said: " + (err.message || err)); }
		finally { btn.disabled = false; btn.textContent = "🧠 Write titles with the AI built into this browser"; }
	});

	/* ---------- export ---------- */
	$("tx-fmt").value = S.fmt;
	$("tx-fmt").addEventListener("change", function () { S.fmt = this.value; save(); renderExport(); });
	function exportText() {
		var c = D.cues, f = S.fmt;
		if (f === "srt") return X.toSRT(c);
		if (f === "vtt") return X.toVTT(c);
		if (f === "json") return X.toJSON(c, { title: D.title, source: D.src && D.src.watch || "" });
		if (f === "lines") return X.toTXT(c, { stamps: true });
		if (f === "paras") return X.toTXT(c, { paras: true });
		if (f === "parast") return X.toTXT(c, { paras: true, stamps: true });
		if (f === "md") {
			var long = X.end(c) >= 3600, out = "# " + (D.title || "Transcript") + "\n\n" + (D.src && D.src.watch ? D.src.watch + "\n\n" : "");
			var paras = X.paragraphs(c), chs = CH.length ? CH : [{ t: 0, title: "Transcript" }];
			chs.forEach(function (ch, i) {
				var e = chs[i + 1] ? chs[i + 1].t : Infinity;
				out += "## " + X.fmt(ch.t, long) + " " + ch.title + "\n\n" + paras.filter(function (p) { return p.t >= ch.t - 0.5 && p.t < e - 0.5; }).map(function (p) { return p.text; }).join("\n\n") + "\n\n";
			});
			return out.trim() + "\n";
		}
		return X.text(c);
	}
	function renderExport() { if (!D) return; var t = exportText(); $("tx-exout").value = t; $("tx-exinfo").textContent = t.length.toLocaleString() + " characters"; }
	$("tx-excopy").addEventListener("click", function () { copy($("tx-exout").value, "Text"); });
	$("tx-exdl").addEventListener("click", function () {
		var ext = { srt: "srt", vtt: "vtt", json: "json", md: "md" }[S.fmt] || "txt";
		var name = String(D.title || "transcript").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 90) || "transcript";
		var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([$("tx-exout").value], { type: "text/plain;charset=utf-8" })); a.download = name + "." + ext;
		document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
	});

	modeUI();
	/* Fill window / Full screen for the results */
	window.addEventListener("load", function () { if (window.MESPanel) window.MESPanel.add($("tx-res"), { bar: $("tx-head") }); });
	/* ?v=<link> (or ?url=) opens straight away */
	try {
		var sp = new URLSearchParams(location.search), pre = sp.get("v") || sp.get("url") || sp.get("u");
		if (pre) { if (/^[A-Za-z0-9_-]{11}$/.test(pre)) pre = "https://www.youtube.com/watch?v=" + pre; $("tx-url").value = pre; openLink(pre); }
	} catch (e) {}
	window.MESTranscriptDebug = { show: show, openText: openText, get D() { return D; }, get CH() { return CH; } };
})();
