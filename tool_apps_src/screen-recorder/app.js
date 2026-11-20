/* MES Screen Recorder: screens / windows / tabs (getDisplayMedia), cameras and microphones (getUserMedia) on one picture. Video captures are drawn on a
 * canvas (the output, recorded with canvas.captureStream) at their boxes, which you drag / resize on the preview (an overlay of DOM boxes, so the handles
 * are never recorded). Ticks come from a Web Worker timer, so a hidden tab keeps drawing. Sound: every capture with sound goes through its own GainNode
 * into one MediaStreamDestination. MediaRecorder writes MP4 or WebM, into memory or straight into a chosen folder (File System Access). Nothing is uploaded.
 * Pure maths in lib.js (MESRec). */
(function () {
	"use strict";
	var R = window.MESRec, I = window.MESImg, $ = function (id) { return document.getElementById(id); };
	if (!R || !$("sr")) return;
	var KEY = "mes-screen-recorder:v1";
	var S = { size: "auto", layout: "pip", bg: "#111111", fmt: "mp4", q: "1", fps: "30", cd: "3", to: "mem", sys: true, clean: true, direct: true };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "{}"); for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function fmtB(n) { return I && I.formatBytes ? I.formatBytes(n) : Math.round(n / 1048576) + " MB"; }
	function toast(msg, ms) { var t = document.createElement("div"); t.className = "tu-toast tu-toast--show"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 3600); }
	var caps = R.caps(navigator, window);
	var cv = $("sr-cv"), ctx = cv.getContext("2d"), W = 1920, H = 1080;
	var srcs = [], seq = 0, sel = -1, manual = false;
	var ac = null, dest = null;
	var rec = null, recInfo = null, timer = new R.Timer(), counting = false, results = [], usedNames = [];
	var dirHandle = null, pip = null;

	/* ---------- small IndexedDB for the chosen folder ---------- */
	function kv(mode, fn) { return new Promise(function (res, rej) { if (!window.indexedDB) return rej(new Error("no IndexedDB")); var r = indexedDB.open("mes-screen-recorder", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result, t = db.transaction("kv", mode), out = fn(t.objectStore("kv")); t.oncomplete = function () { db.close(); res(out && out.result); }; t.onerror = function () { db.close(); rej(t.error); }; }; r.onerror = function () { rej(r.error); }; }); }
	kv("readonly", function (st) { return st.get("dir"); }).then(function (h) { if (h) { dirHandle = h; showDir(); } }).catch(function () {});

	/* ---------- what this browser can do ---------- */
	(function () {
		var t = [];
		if (!caps.rec) t.push("This browser cannot record (no MediaRecorder).");
		if (!caps.screen) { $("sr-add-screen").disabled = true; t.push(caps.mobile ? "Phones and tablets don't let web pages record the screen: you can record the camera and the microphone." : "This browser can't share the screen."); }
		else if (!caps.tabAudio) t.push("This browser records no tab or computer sound: add a microphone for your voice.");
		else if (!caps.systemAudio) t.push("Sound: share a tab and tick \"Also share tab audio\" to record its sound. Other apps' sound can only be recorded on Windows.");
		else t.push("Sound: share a screen and tick \"Also share system audio\", or a tab with \"Also share tab audio\".");
		if (!caps.cam) { $("sr-add-cam").disabled = $("sr-add-mic").disabled = true; }
		$("sr-caps").textContent = t.join(" ");
		if (caps.pip) $("sr-pop").hidden = false;
	})();

	/* ---------- options ---------- */
	function seg(id, key, after) {
		var box = $(id);
		function paint() { [].forEach.call(box.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === String(S[key]))); }); }
		box.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b || b.disabled) return; S[key] = b.dataset.v; save(); paint(); if (after) after(); });
		paint();
	}
	function fmtNote() {
		var p = R.pickType(S.fmt, true, function (t) { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); });
		$("sr-fmt-n").textContent = !p ? "" : p.fallback ? "This browser can't record " + S.fmt.toUpperCase() + ": it will record " + p.ext.toUpperCase() + "." : "Records " + p.type.split(";")[0] + ".";
	}
	seg("sr-fmt", "fmt", fmtNote); seg("sr-q", "q"); seg("sr-fps", "fps", restartTick); seg("sr-cd", "cd");
	seg("sr-to", "to", showDir); fmtNote();
	$("sr-o-sys").checked = !!S.sys; $("sr-o-clean").checked = !!S.clean; $("sr-o-direct").checked = !!S.direct;
	$("sr-o-sys").onchange = function () { S.sys = this.checked; save(); };
	$("sr-o-clean").onchange = function () { S.clean = this.checked; save(); };
	$("sr-o-direct").onchange = function () { S.direct = this.checked; save(); };
	R.LAYOUTS.forEach(function (l) { $("sr-layout").add(new Option(l[1], l[0])); });
	R.SIZES.forEach(function (l) { $("sr-size").add(new Option(l[1], l[0])); });
	$("sr-layout").value = S.layout; $("sr-size").value = S.size; $("sr-bg").value = S.bg;
	$("sr-layout").onchange = function () { S.layout = this.value; save(); manual = false; relayout(true); };
	$("sr-size").onchange = function () { if (rec) { this.value = S.size; toast("The size can't change while recording."); return; } S.size = this.value; save(); relayout(true); };
	$("sr-bg").oninput = function () { S.bg = this.value; save(); };
	function showDir() {
		$("sr-dirbox").hidden = S.to !== "dir";
		$("sr-dirname").textContent = dirHandle ? "Saving into “" + dirHandle.name + "”" : "No folder chosen yet";
		if (S.to === "dir" && !caps.folder) $("sr-to-n").textContent = "This browser can't write into a folder (Brave: turn on brave://flags/#file-system-access-api; Firefox and Safari can't), so recordings are kept here for you to download.";
	}
	$("sr-dirbtn").onclick = function () { pickDir().catch(function () {}); };
	function pickDir() {
		if (!caps.folder) { toast("This browser can't write into a folder."); return Promise.reject(new Error("no folder")); }
		return window.showDirectoryPicker({ id: "mes-screen-recorder", mode: "readwrite" }).then(function (h) { dirHandle = h; kv("readwrite", function (st) { st.put(h, "dir"); }).catch(function () {}); showDir(); return h; });
	}
	/* make sure we may write into the folder; must run inside the click */
	function readyDir() {
		if (S.to !== "dir" || !caps.folder) return Promise.resolve(null);
		if (!dirHandle) return pickDir().catch(function () { return null; });
		return dirHandle.queryPermission({ mode: "readwrite" }).then(function (p) { return p === "granted" ? p : dirHandle.requestPermission({ mode: "readwrite" }); })
			.then(function (p) { return p === "granted" ? dirHandle : null; }).catch(function () { return null; });
	}

	/* ---------- adding captures ---------- */
	function vidEl(stream) { var v = document.createElement("video"); v.muted = true; v.playsInline = true; v.autoplay = true; v.srcObject = stream; var p = v.play(); if (p && p.catch) p.catch(function () {}); return v; }
	function audioCtx() {
		if (!ac) { var C = window.AudioContext || window.webkitAudioContext; ac = new C({ latencyHint: "interactive" }); dest = ac.createMediaStreamDestination(); }
		if (ac.state === "suspended") ac.resume().catch(function () {});
		return ac;
	}
	function hookAudio(s, track) {
		if (!track) return;
		audioCtx(); s.atrack = track;
		s.node = ac.createMediaStreamSource(new MediaStream([track])); s.gain = ac.createGain(); s.an = ac.createAnalyser(); s.an.fftSize = 1024;
		s.node.connect(s.gain); s.gain.connect(s.an); s.gain.connect(dest); setGain(s);
		track.addEventListener("ended", function () { if (s.kind === "mic") removeSrc(s.id); else { unhookAudio(s); renderList(); } });
	}
	function unhookAudio(s) { try { s.node.disconnect(); s.gain.disconnect(); } catch (e) {} s.node = s.gain = s.an = s.atrack = null; }
	function setGain(s) { if (s.gain) s.gain.gain.value = s.muted ? 0 : R.gain(s.vol); }
	function addSrc(s) {
		s.id = ++seq; s.vol = s.vol == null ? 100 : s.vol; s.hide = false; s.crop = null;
		srcs.push(s);
		if (s.vtrack) {
			s.video = vidEl(new MediaStream([s.vtrack]));
			s.video.addEventListener("loadedmetadata", function () { relayout(false, s); });
			s.vtrack.addEventListener("ended", function () { removeSrc(s.id); });
		}
		relayout(false, s); renderList(); state(); ensureTick();
		return s;
	}
	$("sr-add-screen").onclick = function () {
		var o = { video: { frameRate: { ideal: +S.fps, max: 60 } }, audio: S.sys && caps.tabAudio ? { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
			systemAudio: S.sys ? "include" : "exclude", surfaceSwitching: "include", selfBrowserSurface: "exclude", monitorTypeSurfaces: "include" };
		if (S.sys) audioCtx();
		navigator.mediaDevices.getDisplayMedia(o).then(function (st) {
			var vt = st.getVideoTracks()[0], at = st.getAudioTracks()[0], set = vt && vt.getSettings ? vt.getSettings() : {};
			var surf = set.displaySurface, label = surf === "browser" ? "Tab" : surf === "window" ? "Window" : "Screen";
			if (vt && "contentHint" in vt) vt.contentHint = "detail";
			var s = addSrc({ kind: "screen", label: label + (vt && vt.label && !/^(screen|window):/.test(vt.label) ? ": " + vt.label : ""), stream: st, vtrack: vt });
			if (at) hookAudio(s, at); else if (S.sys && caps.tabAudio) toast(surf === "browser" ? "No sound: tick \"Also share tab audio\" in the share box next time." : caps.systemAudio ? "No sound: tick \"Also share system audio\" in the share box next time." : "Only tabs can share their sound on this computer.", 5200);
			renderList();
		}).catch(function (e) { if (e && e.name !== "NotAllowedError" && e.name !== "AbortError") toast("Could not share the screen: " + (e.message || e.name)); });
	};
	function camConstraints(id) { var v = { width: { ideal: 1280 }, height: { ideal: 720 } }; if (id) v.deviceId = { exact: id }; return { video: v, audio: false }; }
	function micConstraints(id) { var a = { echoCancellation: S.clean, noiseSuppression: S.clean, autoGainControl: S.clean }; if (id) a.deviceId = { exact: id }; return { audio: a, video: false }; }
	$("sr-add-cam").onclick = function () {
		navigator.mediaDevices.getUserMedia(camConstraints()).then(function (st) {
			var vt = st.getVideoTracks()[0];
			addSrc({ kind: "camera", label: "Camera", stream: st, vtrack: vt, shape: "circle", mirror: true, dev: vt.getSettings ? vt.getSettings().deviceId : "" });
			listDevices();
		}).catch(function (e) { toast("Could not use the camera: " + (e.name === "NotAllowedError" ? "permission was refused (allow the camera in the address bar)." : e.message || e.name), 5200); });
	};
	$("sr-add-mic").onclick = function () {
		navigator.mediaDevices.getUserMedia(micConstraints()).then(function (st) {
			var at = st.getAudioTracks()[0], n = srcs.filter(function (x) { return x.kind === "mic"; }).length;
			var s = addSrc({ kind: "mic", label: n ? "Microphone " + (n + 1) : "Microphone", stream: st, dev: at.getSettings ? at.getSettings().deviceId : "" });
			hookAudio(s, at); listDevices(); renderList();
		}).catch(function (e) { toast("Could not use the microphone: " + (e.name === "NotAllowedError" ? "permission was refused (allow the microphone in the address bar)." : e.message || e.name), 5200); });
	};
	var devices = [];
	function listDevices() { if (!navigator.mediaDevices.enumerateDevices) return; navigator.mediaDevices.enumerateDevices().then(function (d) { devices = d; renderList(); }).catch(function () {}); }
	if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", listDevices);
	function switchDevice(s, id) {
		var c = s.kind === "camera" ? camConstraints(id) : micConstraints(id);
		navigator.mediaDevices.getUserMedia(c).then(function (st) {
			s.stream.getTracks().forEach(function (t) { t.onended = null; t.stop(); });
			s.stream = st; s.dev = id;
			if (s.kind === "camera") { s.vtrack = st.getVideoTracks()[0]; s.video.srcObject = new MediaStream([s.vtrack]); s.video.play().catch(function () {}); s.vtrack.addEventListener("ended", function () { removeSrc(s.id); }); }
			else { unhookAudio(s); hookAudio(s, st.getAudioTracks()[0]); if (rec) toast("Switched. The new microphone is in the recording from now."); }
			renderList();
		}).catch(function (e) { toast("Could not switch: " + (e.message || e.name)); renderList(); });
	}
	function removeSrc(id) {
		var i = srcs.findIndex(function (x) { return x.id === id; }); if (i < 0) return;
		var s = srcs[i]; srcs.splice(i, 1);
		unhookAudio(s);
		if (s.stream) s.stream.getTracks().forEach(function (t) { t.stop(); });
		if (s.video) s.video.srcObject = null;
		if (sel === i) sel = -1; else if (sel > i) sel--;
		if (recInfo && recInfo.direct && recInfo.direct === s.vtrack) stopRec();
		else if (rec && !srcs.length) stopRec();
		renderList(); state(); paintOv(); ensureTick();
	}

	/* ---------- layout ---------- */
	function vids() { return srcs.filter(function (s) { return s.vtrack; }); }
	function natSize(s) { var w = s.video && s.video.videoWidth || 1280, h = s.video && s.video.videoHeight || 720, c = R.cropPx(s.crop, w, h); return { w: c.w, h: c.h }; }
	function relayout(all, only) {
		var vs = vids(), first = vs.filter(function (s) { return s.kind === "screen"; })[0] || vs[0];
		if (!rec) { var o = R.outSize(S.size, first ? natSize(first) : null); if (o.w !== W || o.h !== H) { W = cv.width = o.w; H = cv.height = o.h; all = true; } }
		var L = R.layout(vs.map(function (s) { var n = natSize(s); return { kind: s.kind, w: n.w, h: n.h }; }), W, H, S.layout);
		vs.forEach(function (s, i) { if (all || !manual || !s.r || s === only) s.r = L[i]; });
		fitStage(); paintOv();
	}
	/* when a crop changes, keep the box's width and centre, change its height to the new shape */
	function reshape(s) { var n = natSize(s); if (!s.r) return; var cx = s.r.x + s.r.w / 2, cy = s.r.y + s.r.h / 2, h = s.r.w * n.h / n.w; s.r = { x: s.r.x, y: cy - h / 2, w: s.r.w, h: h, hide: s.r.hide }; if (s.kind === "camera" && s.shape === "circle") s.r.h = s.r.w; void cx; }

	/* ---------- drawing (worker ticks keep going in a hidden tab) ---------- */
	var tickW = null, tickOn = 0;
	function tick() { draw(); if (rec) tickRec(); }
	function restartTick() { tickOn = 0; ensureTick(); }
	function ensureTick() {
		var want = vids().length || rec ? Math.round(1000 / (+S.fps || 30)) : 0;
		if (want === tickOn) return; tickOn = want;
		if (!tickW) {
			try { tickW = new Worker(URL.createObjectURL(new Blob(["var t=null;onmessage=function(e){clearInterval(t);t=null;if(e.data>0)t=setInterval(function(){postMessage(0)},e.data)}"], { type: "text/javascript" }))); tickW.onmessage = tick; }
			catch (e) { tickW = { iv: null, postMessage: function (ms) { clearInterval(this.iv); if (ms > 0) this.iv = setInterval(tick, ms); } }; }
		}
		tickW.postMessage(want);
		if (!want) draw();
	}
	function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
	function drawSrc(c, s) {
		var v = s.video, r = s.r; if (!v || !r || r.hide || !(v.videoWidth > 0)) return;
		var cp = R.cropPx(s.crop, v.videoWidth, v.videoHeight), f = R.fit(cp.w, cp.h, r, s.kind === "camera" ? "cover" : "contain");
		c.save();
		if (s.kind === "camera" && vids().length === 1) {   // camera alone = a plain webcam video, no bubble
			c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
			if (s.mirror) { c.translate(f.x * 2 + f.w, 0); c.scale(-1, 1); }
		} else if (s.kind === "camera") {
			var rad = s.shape === "circle" ? Math.min(r.w, r.h) / 2 : s.shape === "round" ? Math.min(r.w, r.h) * 0.12 : 0;
			if (s.shape === "circle") { c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h / 2, rad, 0, Math.PI * 2); } else rr(c, r.x, r.y, r.w, r.h, rad);
			c.save(); c.shadowColor = "rgba(0,0,0,0.45)"; c.shadowBlur = Math.min(r.w, r.h) * 0.06; c.fillStyle = "#000"; c.fill(); c.restore();
			c.clip();
			if (s.mirror) { c.translate(f.x * 2 + f.w, 0); c.scale(-1, 1); }
		} else { c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip(); }
		c.drawImage(v, cp.x, cp.y, cp.w, cp.h, f.x, f.y, f.w, f.h);
		c.restore();
	}
	function draw() {
		ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
		srcs.forEach(function (s) { drawSrc(ctx, s); });
		$("sr-empty").hidden = srcs.length > 0;
		if (pip) paintPip();
	}

	/* ---------- preview sizing + overlay boxes ---------- */
	function fitStage() {
		var st = $("sr-stage"), fill = $("sr-view").classList.contains("mes-pfill");
		var aw = st.clientWidth - 2, ah = fill ? Math.max(120, st.clientHeight - 2) : Math.min(window.innerHeight * 0.7, 900);
		var k = Math.min(aw / W, ah / H), w = Math.max(80, Math.floor(W * k)), h = Math.max(45, Math.floor(H * k));
		cv.style.width = w + "px"; cv.style.height = h + "px";
		paintOv();
	}
	if (window.ResizeObserver) new ResizeObserver(fitStage).observe($("sr-stage")); else window.addEventListener("resize", fitStage);
	function scale() { return cv.getBoundingClientRect().width / W || 1; }
	function paintOv() {
		var ov = $("sr-ov"), k = scale(), vs = vids(), html = "";
		vs.forEach(function (s, i) {
			if (!s.r || s.r.hide) return;
			var on = srcs.indexOf(s) === sel, r = s.r, round = s.kind === "camera" && s.shape === "circle" && vs.length > 1;
			html += '<div class="sr-box' + (on ? " is-on" : "") + (round ? " is-round" : "") + '" style="left:' + (r.x * k) + "px;top:" + (r.y * k) + "px;width:" + (r.w * k) + "px;height:" + (r.h * k) + 'px">' +
				(on ? '<i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i><span class="sr-boxl">' + esc(s.label) + "</span>" : "") + "</div>";
			void i;
		});
		ov.innerHTML = html + '<div class="sr-guide" id="sr-gv" hidden></div><div class="sr-guide sr-gh" id="sr-gh" hidden></div>';
	}
	(function () {
		var wrap = $("sr-cvwrap"), drag = null;
		function pt(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * W / b.width, y: (e.clientY - b.top) * H / b.height }; }
		wrap.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return;
			var p = pt(e), vs = vids(), rects = vs.map(function (s) { return s.r; }), cur = sel >= 0 ? srcs[sel] : null, h = null, i;
			if (cur && cur.r && cur.vtrack) h = R.handleAt(cur.r, p.x, p.y, 14 / scale());
			if (h) i = vs.indexOf(cur); else i = R.hit(rects, p.x, p.y);
			if (i < 0) { sel = -1; paintOv(); renderList(); return; }
			sel = srcs.indexOf(vs[i]); e.preventDefault();
			drag = { s: vs[i], h: h, p0: p, r0: vs[i].r, id: e.pointerId };
			try { wrap.setPointerCapture(e.pointerId); } catch (er) {}
			paintOv(); renderList();
		});
		wrap.addEventListener("pointermove", function (e) {
			if (!drag || e.pointerId !== drag.id) { if (!drag) { var p0 = pt(e), cur = sel >= 0 ? srcs[sel] : null; wrap.style.cursor = cur && cur.r && cur.vtrack && R.handleAt(cur.r, p0.x, p0.y, 14 / scale()) ? "nwse-resize" : R.hit(vids().map(function (s) { return s.r; }), p0.x, p0.y) >= 0 ? "move" : ""; } return; }
			var p = pt(e), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y, s = drag.s, gv = $("sr-gv"), gh = $("sr-gh");
			if (drag.h) { s.r = R.resize(drag.r0, drag.h, dx, dy, { free: e.shiftKey && !(s.kind === "camera" && s.shape === "circle"), min: Math.min(W, H) * 0.06 }); gv.hidden = gh.hidden = true; }
			else {
				var m = R.move(drag.r0, dx, dy, W, H, 24), sn = e.altKey ? { r: m, lines: [] } : R.snap(m, W, H, Math.min(W, H) * 0.015);
				s.r = sn.r; var k = scale(); gv.hidden = gh.hidden = true;
				sn.lines.forEach(function (l) { var g = l[0] === "v" ? gv : gh; g.hidden = false; if (l[0] === "v") g.style.left = (l[1] * k) + "px"; else g.style.top = (l[1] * k) + "px"; });
			}
			manual = true; positionSel();
		});
		function end() { if (!drag) return; drag = null; var g1 = $("sr-gv"), g2 = $("sr-gh"); if (g1) g1.hidden = true; if (g2) g2.hidden = true; paintOv(); }
		wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end);
		function positionSel() { var b = $("sr-ov").querySelector(".sr-box.is-on"), s = srcs[sel], k = scale(); if (!b || !s || !s.r) return paintOv(); b.style.left = s.r.x * k + "px"; b.style.top = s.r.y * k + "px"; b.style.width = s.r.w * k + "px"; b.style.height = s.r.h * k + "px"; }
	})();

	/* ---------- list of captures ---------- */
	var ICON = { screen: "🖥", camera: "📷", mic: "🎤" };
	function devOptions(s) {
		var kind = s.kind === "camera" ? "videoinput" : "audioinput", list = devices.filter(function (d) { return d.kind === kind && d.deviceId; });
		if (list.length < 2) return "";
		return '<label class="sr-dev">Device <select data-a="dev">' + list.map(function (d, i) { return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === s.dev ? " selected" : "") + ">" + esc(d.label || (kind === "videoinput" ? "Camera " : "Microphone ") + (i + 1)) + "</option>"; }).join("") + "</select></label>";
	}
	function renderList() {
		var ul = $("sr-list"); $("sr-none").hidden = srcs.length > 0;
		ul.innerHTML = srcs.map(function (s, i) {
			var v = !!s.vtrack, a = !!s.gain;
			return '<li class="sr-it' + (i === sel ? " is-on" : "") + '" data-id="' + s.id + '">' +
				'<div class="sr-ith"><span class="sr-ico" aria-hidden="true">' + ICON[s.kind] + '</span><b class="sr-name">' + esc(s.label) + "</b>" +
				(v ? '<span class="sr-dim">' + (s.video && s.video.videoWidth ? natSize(s).w + " × " + natSize(s).h : "") + "</span>" : "") +
				'<span class="sr-sp"></span>' +
				(v ? '<button type="button" class="sr-mini" data-a="hide" aria-pressed="' + !(s.r && s.r.hide) + '" title="Show or hide on the picture">' + (s.r && s.r.hide ? "Hidden" : "Shown") + "</button>" : "") +
				(v ? '<button type="button" class="sr-mini" data-a="front" title="Bring to the front">Front</button><button type="button" class="sr-mini" data-a="back" title="Send to the back">Back</button>' : "") +
				(v ? '<button type="button" class="sr-mini" data-a="shot" title="Screenshot of this capture at full size">📸</button>' : "") +
				(s.kind === "screen" ? '<button type="button" class="sr-mini" data-a="crop" title="Record only part of it">✂ Crop' + (s.crop ? " ✓" : "") + "</button>" : "") +
				'<button type="button" class="sr-mini sr-del" data-a="del" title="Stop and remove">✕</button></div>' +
				'<div class="sr-itb">' +
				(s.kind === "camera" ? '<label class="sr-dev">Shape <select data-a="shape"><option value="circle"' + (s.shape === "circle" ? " selected" : "") + '>Round</option><option value="round"' + (s.shape === "round" ? " selected" : "") + '>Rounded box</option><option value="rect"' + (s.shape === "rect" ? " selected" : "") + '>Box</option></select></label><label class="sr-chk"><input type="checkbox" data-a="mirror"' + (s.mirror ? " checked" : "") + "> Mirror</label>" : "") +
				(s.kind !== "screen" ? devOptions(s) : "") +
				(a ? '<span class="sr-vol"><button type="button" class="sr-mini" data-a="mute" aria-pressed="' + !!s.muted + '">' + (s.muted ? "🔇 Muted" : "🔊") + '</button><input type="range" min="0" max="200" step="5" value="' + s.vol + '" data-a="vol" aria-label="Volume of ' + esc(s.label) + '"><b class="sr-volv">' + s.vol + '%</b><canvas class="sr-meter" width="160" height="10" aria-hidden="true"></canvas></span>' : (s.kind === "screen" ? '<span class="sr-dim">No sound from this one</span>' : "")) +
				"</div></li>";
		}).join("");
	}
	$("sr-list").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"), li = e.target.closest(".sr-it"); if (!li) return;
		var s = srcs.find(function (x) { return x.id === +li.dataset.id; }); if (!s) return;
		if (!b) { sel = srcs.indexOf(s); paintOv(); renderList(); return; }
		var a = b.dataset.a, i = srcs.indexOf(s);
		if (a === "del") removeSrc(s.id);
		else if (a === "hide" && s.r) { s.r.hide = !s.r.hide; paintOv(); renderList(); }
		else if (a === "front" || a === "back") { srcs.splice(i, 1); if (a === "front") srcs.push(s); else srcs.unshift(s); sel = srcs.indexOf(s); paintOv(); renderList(); }
		else if (a === "mute") { s.muted = !s.muted; setGain(s); renderList(); }
		else if (a === "crop") openCrop(s);
		else if (a === "shot") shotOf(s);
	});
	$("sr-list").addEventListener("input", function (e) {
		var t = e.target, li = t.closest(".sr-it"); if (!li || t.dataset.a !== "vol") return;
		var s = srcs.find(function (x) { return x.id === +li.dataset.id; }); if (!s) return;
		s.vol = +t.value; setGain(s); li.querySelector(".sr-volv").textContent = s.vol + "%";
	});
	$("sr-list").addEventListener("change", function (e) {
		var t = e.target, li = t.closest(".sr-it"); if (!li) return;
		var s = srcs.find(function (x) { return x.id === +li.dataset.id; }); if (!s) return;
		if (t.dataset.a === "shape") { s.shape = t.value; if (s.r && s.shape === "circle") { var m = Math.min(s.r.w, s.r.h); s.r.w = s.r.h = m; } paintOv(); }
		else if (t.dataset.a === "mirror") s.mirror = t.checked;
		else if (t.dataset.a === "dev") switchDevice(s, t.value);
	});
	/* level meters (UI only, animation frames) */
	(function meters() {
		var buf = new Float32Array(1024);
		function f() {
			[].forEach.call($("sr-list").querySelectorAll(".sr-it"), function (li) {
				var s = srcs.find(function (x) { return x.id === +li.dataset.id; }), c = li.querySelector(".sr-meter"); if (!s || !s.an || !c) return;
				s.an.getFloatTimeDomainData(buf); var sum = 0, pk = 0; for (var i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; if (Math.abs(buf[i]) > pk) pk = Math.abs(buf[i]); }
				var m = R.meter(Math.sqrt(sum / buf.length)), x = c.getContext("2d"), w = c.width, h = c.height;
				x.clearRect(0, 0, w, h); x.fillStyle = "rgba(128,128,128,0.25)"; x.fillRect(0, 0, w, h);
				x.fillStyle = pk > 0.98 ? "#dc2626" : m > 0.85 ? "#eab308" : "#16a34a"; x.fillRect(0, 0, Math.round(w * m), h);
			});
			requestAnimationFrame(f);
		}
		requestAnimationFrame(f);
	})();

	/* ---------- recording ---------- */
	function state() {
		var any = srcs.length > 0, r = !!rec;
		$("sr-rec").disabled = !caps.rec || (!any && !r) || counting; $("sr-rec").textContent = r ? "■ Stop" : "● Record"; $("sr-rec").classList.toggle("is-on", r);
		$("sr-pause").disabled = !r; $("sr-pause").textContent = rec && rec.state === "paused" ? "▶ Resume" : "❚❚ Pause";
		$("sr-stop").disabled = !r; $("sr-shot").disabled = !vids().length;
		$("sr-recdot").hidden = !r; $("sr-recdot").classList.toggle("is-paused", !!(rec && rec.state === "paused"));
		$("sr-view").classList.toggle("is-rec", r);
		if (pip) paintPip();
	}
	var baseTitle = document.title;
	function tickRec() {
		var t = R.fmtTime(timer.elapsed(performance.now()));
		if ($("sr-time").textContent !== t) { $("sr-time").textContent = t; document.title = (rec.state === "paused" ? "❚❚ " : "● ") + t + " · " + baseTitle; }
	}
	setInterval(function () { if (rec) tickRec(); }, 500);
	$("sr-rec").onclick = function () { if (rec) stopRec(); else startRec(); };
	$("sr-stop").onclick = function () { stopRec(); };
	$("sr-pause").onclick = pauseRec;
	function pauseRec() {
		if (!rec) return; var now = performance.now();
		if (rec.state === "recording") { rec.pause(); timer.pause(now); } else if (rec.state === "paused") { rec.resume(); timer.resume(now); }
		tickRec(); state();
	}
	function startRec() {
		if (rec || counting || !srcs.length) return;
		if (ac && ac.state === "suspended") ac.resume().catch(function () {});
		readyDir().then(function (dir) {
			if (S.to === "dir" && caps.folder && !dir) toast("No folder: the recording is kept here for you to download.");
			var n = +S.cd || 0; if (!n) return go(dir);
			counting = true; state(); var box = $("sr-count"); box.hidden = false;
			(function step() { if (!counting) { box.hidden = true; return; } if (n <= 0) { box.hidden = true; counting = false; go(dir); return; } box.textContent = n--; box.classList.remove("is-pop"); void box.offsetWidth; box.classList.add("is-pop"); setTimeout(step, 1000); })();
		});
	}
	function go(dir) {
		if (!srcs.length) { state(); return; }
		var vs = vids(), audio = srcs.some(function (s) { return s.gain; }), direct = null;
		if (S.direct && vs.length === 1 && vs[0].kind === "screen" && !vs[0].crop) direct = vs[0].vtrack;
		var tracks = [];
		if (vs.length) tracks.push(direct || cv.captureStream(+S.fps || 30).getVideoTracks()[0]);
		if (audio) tracks.push(dest.stream.getAudioTracks()[0]);
		if (!tracks.length) { toast("Nothing to record."); return; }
		var video = vs.length > 0, p = R.pickType(S.fmt, video, function (t) { return MediaRecorder.isTypeSupported(t); });
		var ds = direct && direct.getSettings ? direct.getSettings() : null, ow = ds && ds.width || W, oh = ds && ds.height || H;
		var opt = { audioBitsPerSecond: 160000 }; if (p) opt.mimeType = p.type; if (video) opt.videoBitsPerSecond = R.bitrate(ow, oh, +S.fps, +S.q);
		var stream = new MediaStream(tracks), r;
		try { r = new MediaRecorder(stream, opt); } catch (e) { try { r = new MediaRecorder(stream); } catch (e2) { toast("This browser could not start recording: " + (e2.message || e2.name)); return; } }
		var type = (r.mimeType || (p && p.type) || (video ? "video/webm" : "audio/webm")), ext = R.extOf(type);
		var what = !video ? "Voice recording" : vs.every(function (s) { return s.kind === "camera"; }) ? "Camera recording" : "Screen recording";
		var name = R.unique(R.fileName(what, new Date(), ext), usedNames); usedNames.push(name);
		recInfo = { name: name, type: type, chunks: [], size: 0, video: video, direct: direct, w: ow, h: oh, writer: null, fh: null, wq: Promise.resolve(), canvasTrack: direct ? null : tracks[0] };
		var start = function () {
			r.ondataavailable = function (e) {
				if (!e.data || !e.data.size) return; recInfo.size += e.data.size;
				if (recInfo.writer) { var d = e.data, w = recInfo.writer; recInfo.wq = recInfo.wq.then(function () { return w.write(d); }).catch(function (er) { recInfo.werr = er; }); }
				else recInfo.chunks.push(e.data);
			};
			r.onstop = function () { finish(r, recInfo); };
			r.onerror = function (e) { toast("Recording error: " + (e.error && e.error.message || "unknown")); };
			rec = r; r.start(1000); timer.start(performance.now()); $("sr-time").textContent = "0:00"; state(); ensureTick();
		};
		if (dir) dir.getFileHandle(name, { create: true }).then(function (fh) { recInfo.fh = fh; return fh.createWritable(); }).then(function (w) { recInfo.writer = w; recInfo.dir = dir.name; start(); }, function (e) { toast("Could not write into the folder (" + (e.message || e.name) + "): keeping it here."); start(); });
		else start();
	}
	function stopRec() {
		if (counting) { counting = false; state(); return; }
		if (!rec) return;
		var r = rec; timer.stop(performance.now()); try { r.stop(); } catch (e) { finish(r, recInfo); }
	}
	function finish(r, info) {
		if (info.done) return; info.done = true;
		if (rec === r) rec = null;
		if (info.canvasTrack) info.canvasTrack.stop();
		document.title = baseTitle; state(); ensureTick();
		var dur = timer.acc;
		var out = { kind: info.video ? "video" : "audio", name: info.name, type: info.type, dur: dur, w: info.w, h: info.h, dir: null };
		var p = info.writer ? info.wq.then(function () { return info.writer.close(); }).then(function () { out.dir = info.dir; out.fh = info.fh; return info.fh.getFile(); })
			: Promise.resolve(new File(info.chunks, info.name, { type: info.type.split(";")[0] }));
		p.then(function (file) { out.file = file; out.size = file.size; addResult(out); toast(out.dir ? "Saved “" + info.name + "” in " + out.dir + "." : "Recording ready below: " + fmtB(file.size) + "."); })
			.catch(function (e) { toast("Could not finish the file: " + (e.message || e.name)); if (info.chunks.length) { out.file = new File(info.chunks, info.name, { type: info.type.split(";")[0] }); out.size = out.file.size; addResult(out); } });
	}
	window.addEventListener("beforeunload", function (e) { if (rec || results.some(function (x) { return !x.dir && !x.saved; })) { e.preventDefault(); e.returnValue = ""; } });

	/* keys */
	document.addEventListener("keydown", function (e) {
		var t = e.target; if (e.ctrlKey || e.metaKey || e.altKey || (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))) return;
		if (!$("sr-shotm").hidden || !$("sr-cropm").hidden) { if (e.key === "Escape") closeModals(); return; }
		var k = e.key.toLowerCase();
		if (k === "r" && !$("sr-rec").disabled) { e.preventDefault(); $("sr-rec").click(); }
		else if (k === "p" && rec) { e.preventDefault(); pauseRec(); }
		else if (k === "s" && vids().length) { e.preventDefault(); shotAll(); }
		else if ((k === "delete" || k === "backspace") && sel >= 0 && srcs[sel] && srcs[sel].r) { e.preventDefault(); srcs[sel].r.hide = true; paintOv(); renderList(); }
	});

	/* ---------- results ---------- */
	function addResult(o) {
		o.id = ++seq; o.url = URL.createObjectURL(o.file); results.unshift(o); renderResults();
	}
	function renderResults() {
		$("sr-out").hidden = !results.length;
		$("sr-res").innerHTML = results.map(function (o) {
			var media = o.kind === "video" ? '<video src="' + o.url + '" controls preload="metadata" playsinline></video>' : o.kind === "audio" ? '<audio src="' + o.url + '" controls preload="metadata"></audio>' : '<img src="' + o.url + '" alt="Screenshot">';
			var info = [o.kind === "shot" ? o.w + " × " + o.h : (o.kind === "video" ? o.w + " × " + o.h + " · " : "") + R.fmtTime(o.dur), fmtB(o.size)];
			return '<li class="sr-r sr-r--' + o.kind + '" data-id="' + o.id + '"><div class="sr-rm">' + media + '</div><div class="sr-ri"><b class="sr-rn">' + esc(o.name) + '</b><span class="sr-dim">' + esc(info.join(" · ")) + (o.dir ? " · saved in “" + esc(o.dir) + "”" : o.saved ? " · downloaded" : "") + "</span>" +
				'<div class="sr-ra">' + (o.dir ? "" : '<button type="button" class="tu-btn tu-btn--primary" data-a="dl">⬇ Download</button>') +
				(o.kind === "shot" ? '<button type="button" class="tu-btn" data-a="copy">Copy</button><button type="button" class="tu-btn" data-a="open">Open / crop</button><button type="button" class="tu-btn" data-a="photo">Edit in Photo Editor</button>'
					: (o.kind === "video" ? '<button type="button" class="tu-btn" data-a="video">Open in Video Editor</button>' : "") + '<button type="button" class="tu-btn" data-a="audio">Open in Audio Editor</button>' + (o.kind === "video" && /webm/.test(o.type) ? '<a class="tu-btn tu-btn--ghost" href="/convert-video" target="_blank" rel="noopener">Make it MP4</a>' : "")) +
				'<button type="button" class="tu-btn tu-btn--ghost" data-a="del">Remove</button></div></div></li>';
		}).join("");
	}
	function download(file, name) { var a = document.createElement("a"), u = URL.createObjectURL(file); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }
	function handTo(page, o) {
		if (!I || !I.handoffSend) { toast("Download it, then open it in the editor."); return; }
		I.handoffSend(page, [{ blob: o.file, name: o.name, type: o.file.type }], function (url) { toast("Your browser blocked the new tab: allow pop-ups, or open " + url); }).catch(function (e) { toast("Could not hand it over: " + (e.message || e)); });
	}
	$("sr-res").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"), li = e.target.closest(".sr-r"); if (!b || !li) return;
		var o = results.find(function (x) { return x.id === +li.dataset.id; }); if (!o) return;
		var a = b.dataset.a;
		if (a === "dl") { download(o.file, o.name); o.saved = true; renderResults(); }
		else if (a === "video") handTo("/video", o);
		else if (a === "audio") handTo("/audio", o);
		else if (a === "photo") handTo("/photo", o);
		else if (a === "copy") copyPng(o.file);
		else if (a === "open") { var im = new Image(); im.onload = function () { var c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0); openShot(c, o); }; im.src = o.url; }
		else if (a === "del") { if (!o.dir && !o.saved && o.kind !== "shot" && !confirm("Remove “" + o.name + "”? It was not downloaded.")) return; URL.revokeObjectURL(o.url); results.splice(results.indexOf(o), 1); renderResults(); }
	});

	/* ---------- screenshots ---------- */
	function copyPng(blobOrCanvas) {
		if (!navigator.clipboard || !window.ClipboardItem) { toast("This browser can't copy pictures: use Save PNG."); return; }
		var p = blobOrCanvas instanceof Blob ? Promise.resolve(blobOrCanvas) : new Promise(function (res) { blobOrCanvas.toBlob(res, "image/png"); });
		navigator.clipboard.write([new ClipboardItem({ "image/png": p })]).then(function () { toast("Copied. Paste it anywhere with Ctrl+V."); }, function (e) { toast("Could not copy: " + (e.message || e.name)); });
	}
	function shotAll() { draw(); var c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(cv, 0, 0); openShot(c); }
	function shotOf(s) {
		var v = s.video; if (!v || !v.videoWidth) return;
		var cp = R.cropPx(s.crop, v.videoWidth, v.videoHeight), c = document.createElement("canvas"); c.width = cp.w; c.height = cp.h;
		var x = c.getContext("2d"); if (s.kind === "camera" && s.mirror) { x.translate(cp.w, 0); x.scale(-1, 1); } x.drawImage(v, cp.x, cp.y, cp.w, cp.h, 0, 0, cp.w, cp.h); openShot(c);
	}
	$("sr-shot").onclick = shotAll;
	var shot = null;
	function openShot(c, existing) {
		shot = { c: c, box: null, res: existing || null };
		var sc = $("sr-shotcv"); sc.width = c.width; sc.height = c.height; sc.getContext("2d").drawImage(c, 0, 0);
		$("sr-shotbox").hidden = true; $("sr-shotcrop").disabled = true; $("sr-shotsize").textContent = c.width + " × " + c.height + " px";
		$("sr-shotm").hidden = false; document.documentElement.classList.add("sr-modal-on");
		if (!existing) keepShot();
	}
	function shotName() { return R.unique(R.fileName("Screenshot", new Date(), "png"), usedNames); }
	function keepShot() {
		var c = shot.c, s = shot;
		c.toBlob(function (b) {
			if (!b) return;
			if (s.res) { URL.revokeObjectURL(s.res.url); s.res.file = new File([b], s.res.name, { type: "image/png" }); s.res.size = b.size; s.res.url = URL.createObjectURL(b); s.res.w = c.width; s.res.h = c.height; s.res.saved = false; s.res.dir = null; renderResults(); saveShotToDir(s.res); return; }
			var name = shotName(); usedNames.push(name);
			var o = { kind: "shot", name: name, type: "image/png", file: new File([b], name, { type: "image/png" }), size: b.size, w: c.width, h: c.height };
			addResult(o); s.res = o; saveShotToDir(o);
		}, "image/png");
	}
	function saveShotToDir(o) {
		if (S.to !== "dir" || !dirHandle || !caps.folder) return;
		dirHandle.queryPermission({ mode: "readwrite" }).then(function (p) {
			if (p !== "granted") return;
			return dirHandle.getFileHandle(o.name, { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(o.file).then(function () { return w.close(); }); }).then(function () { o.dir = dirHandle.name; renderResults(); });
		}).catch(function () {});
	}
	function boxDrag(wrapId, boxId, getC, setC, onChange) {
		var wrap = $(wrapId), box = $(boxId), d = null;
		function fr(e) { var b = wrap.querySelector("canvas").getBoundingClientRect(); return { x: R.clamp((e.clientX - b.left) / b.width, 0, 1), y: R.clamp((e.clientY - b.top) / b.height, 0, 1) }; }
		wrap.addEventListener("pointerdown", function (e) {
			if (e.button > 0) return; e.preventDefault(); var p = fr(e), c = getC(), h = e.target.dataset && e.target.dataset.h;
			if (h && c) d = { m: h, p: p, c: c }; else if (c && e.target === box) d = { m: "move", p: p, c: c }; else d = { m: "new", p: p };
			try { wrap.setPointerCapture(e.pointerId); } catch (er) {}
		});
		wrap.addEventListener("pointermove", function (e) {
			if (!d) return; var p = fr(e);
			if (d.m === "new") setC(R.cropFromDrag(d.p.x, d.p.y, p.x, p.y, 0.005)); else setC(R.cropEdit(d.c, d.m, p.x - d.p.x, p.y - d.p.y));
			paint();
		});
		function up() { if (d) { d = null; onChange(); } }
		wrap.addEventListener("pointerup", up); wrap.addEventListener("pointercancel", up);
		function paint() { var c = getC(); box.hidden = !c; if (!c) return; box.style.left = c.x * 100 + "%"; box.style.top = c.y * 100 + "%"; box.style.width = c.w * 100 + "%"; box.style.height = c.h * 100 + "%"; onChange(true); }
		return paint;
	}
	var paintShotBox = boxDrag("sr-shotwrap", "sr-shotbox", function () { return shot && shot.box; }, function (c) { if (shot) shot.box = c; }, function () {
		var b = shot && shot.box; $("sr-shotcrop").disabled = !b;
		$("sr-shotsize").textContent = b ? Math.round(b.w * shot.c.width) + " × " + Math.round(b.h * shot.c.height) + " px selected" : shot ? shot.c.width + " × " + shot.c.height + " px" : "";
	});
	$("sr-shotcrop").onclick = function () {
		if (!shot || !shot.box) return; var px = R.cropPx(shot.box, shot.c.width, shot.c.height), c = document.createElement("canvas"); c.width = px.w; c.height = px.h;
		c.getContext("2d").drawImage(shot.c, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h); var res = shot.res; openShot(c, res); keepShot(); paintShotBox();
	};
	$("sr-shotcopy").onclick = function () { if (shot) copyPng(shot.c); };
	$("sr-shotsave").onclick = function () { if (!shot || !shot.res) return; download(shot.res.file, shot.res.name); shot.res.saved = true; renderResults(); };
	$("sr-shotedit").onclick = function () { if (shot && shot.res) handTo("/photo", shot.res); };

	/* ---------- crop a capture ---------- */
	var cropS = null, cropBox = null;
	function openCrop(s) {
		var v = s.video; if (!v || !v.videoWidth) { toast("Wait until the capture shows a picture."); return; }
		cropS = s; cropBox = s.crop ? { x: s.crop.x, y: s.crop.y, w: s.crop.w, h: s.crop.h } : null;
		var c = $("sr-cropcv"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
		$("sr-cropm").hidden = false; document.documentElement.classList.add("sr-modal-on"); paintCrop();
	}
	var paintCrop = boxDrag("sr-cropwrap", "sr-cropbox", function () { return cropBox; }, function (c) { cropBox = c; }, function () {
		var v = cropS && cropS.video; if (!v) return; var px = R.cropPx(cropBox, v.videoWidth, v.videoHeight);
		$("sr-cropsize").textContent = cropBox ? px.w + " × " + px.h + " px of " + v.videoWidth + " × " + v.videoHeight : "Whole capture: " + v.videoWidth + " × " + v.videoHeight + " px";
	});
	$("sr-cropok").onclick = function () { if (cropS) { cropS.crop = cropBox; reshape(cropS); if (!manual) relayout(true); paintOv(); renderList(); } closeModals(); };
	$("sr-cropnone").onclick = function () { cropBox = null; paintCrop(); };
	function closeModals() { $("sr-shotm").hidden = $("sr-cropm").hidden = true; document.documentElement.classList.remove("sr-modal-on"); shot = null; cropS = null; }
	[].forEach.call(document.querySelectorAll(".sr-modal [data-close]"), function (b) { b.addEventListener("click", closeModals); });
	[].forEach.call(document.querySelectorAll(".sr-modal"), function (m) { m.addEventListener("click", function (e) { if (e.target === m) closeModals(); }); });

	/* ---------- pop-out controls (Document Picture-in-Picture, Chrome / Edge) ---------- */
	$("sr-pop").onclick = function () {
		if (pip) { pip.close(); return; }
		window.documentPictureInPicture.requestWindow({ width: 320, height: 96 }).then(function (w) {
			pip = w; var d = w.document;
			d.body.innerHTML = '<style>body{margin:0;font:14px/1.2 system-ui,sans-serif;background:#16181d;color:#eee;display:flex;align-items:center;gap:6px;padding:8px;height:100vh;box-sizing:border-box}button{font:inherit;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;background:#2c313a;color:#fff}button:disabled{opacity:.4}#r.on{background:#dc2626}#t{font-variant-numeric:tabular-nums;font-weight:700;min-width:3.6em;text-align:center}</style>' +
				'<button id="r">● Rec</button><button id="p">❚❚</button><span id="t">0:00</span><button id="s" title="Screenshot">📸</button>';
			d.getElementById("r").onclick = function () { if (rec) stopRec(); else startRec(); };
			d.getElementById("p").onclick = pauseRec;
			d.getElementById("s").onclick = function () { if (vids().length) shotAll(); };
			w.addEventListener("pagehide", function () { pip = null; $("sr-pop").textContent = "⧉ Pop out the controls"; });
			$("sr-pop").textContent = "Close the pop-out"; paintPip();
		}).catch(function (e) { toast("Could not pop out: " + (e.message || e.name)); });
	};
	function paintPip() {
		if (!pip) return; var d = pip.document, r = d.getElementById("r"); if (!r) return;
		r.textContent = rec ? "■ Stop" : "● Rec"; r.className = rec ? "on" : ""; r.disabled = !rec && !srcs.length;
		d.getElementById("p").disabled = !rec; d.getElementById("p").textContent = rec && rec.state === "paused" ? "▶" : "❚❚";
		d.getElementById("t").textContent = rec ? R.fmtTime(timer.elapsed(performance.now())) : "0:00";
		d.getElementById("s").disabled = !vids().length;
	}
	setInterval(function () { if (pip) paintPip(); }, 500);

	/* Fill window / Full screen of the picture card */
	(function panel() {
		if (!window.MESPanel) return setTimeout(panel, 300);
		window.MESPanel.add($("sr-view"), { bar: $("sr-vbar").querySelector(".sr-vbtns"), stage: $("sr-stage"), onChange: function () { setTimeout(fitStage, 40); } });
	})();

	relayout(true); renderList(); state(); draw();
	/* testing: MESRecDebug.addStream(stream, "screen"|"camera"|"mic") adds a capture without the browser's picker */
	window.MESRecDebug = {
		addStream: function (st, kind) { var vt = st.getVideoTracks()[0], at = st.getAudioTracks()[0]; var s = addSrc({ kind: kind || "screen", label: kind === "camera" ? "Camera" : kind === "mic" ? "Microphone" : "Screen: test", stream: st, vtrack: vt, shape: "circle", mirror: true }); if (at) hookAudio(s, at); renderList(); return s; },
		srcs: srcs, results: results, start: function () { S.cd = "0"; go(null); }, stop: stopRec, state: function () { return { W: W, H: H, rec: rec && rec.state, sel: sel }; }
	};
})();
