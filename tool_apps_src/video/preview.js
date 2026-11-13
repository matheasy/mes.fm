/* MES Video Editor preview: one <video> / <audio> element per clip near the playhead (kept in step with the timeline clock), drawn through
 * the shared compositor onto a canvas; their sound goes through Web Audio gain nodes (volume, fades, cross-fades, mute). Noise-removed sound
 * plays from AudioBuffers. Drag a picture or title in the preview to move it, its corner to resize it. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V, $ = function (id) { return document.getElementById(id); };
	var P = VE.preview = { playing: false, rate: 1, rev: false, t0: 0, p0: 0, speed: 1 };   // speed = the "Playback speed" menu (preview only)
	var cv = $("vd-canvas"), ctx = cv.getContext("2d"), wrap = $("vd-stagewrap"), els = {}, ac = null, cleanNodes = [], cleanBufs = {}, raf = 0, needDraw = true;

	function audio() {
		if (!ac) {
			try { ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" }); } catch (e) { return null; }
			Object.keys(els).forEach(function (k) { connect(els[k]); });
		}
		if (ac.state === "suspended") ac.resume();
		return ac;
	}
	function connect(e) { if (!ac || e.gain) return; try { e.node = ac.createMediaElementSource(e.el); e.gain = ac.createGain(); e.gain.gain.value = 0; e.node.connect(e.gain).connect(ac.destination); } catch (x) { /* already connected */ } }
	function elFor(c) {
		var e = els[c.id], m = VE.media(c.media);
		if (e && e.media === c.media) { e.used = performance.now(); return e; }
		if (e) release(c.id);
		if (!m || !m.url) return null;
		var el = document.createElement(c.type === "audio" ? "audio" : "video");
		el.preload = "auto"; el.playsInline = true; el.muted = false; el.preservesPitch = false; el.src = m.url;
		el.addEventListener("seeked", draw); el.addEventListener("loadeddata", draw);
		e = els[c.id] = { el: el, media: c.media, used: performance.now() };
		connect(e);
		return e;
	}
	// a video element that was just told to go somewhere has no picture of that place yet (drawing it then can give a black frame):
	// until the browser shows the new frame, the preview uses the last frame it gave
	function setTime(e, t) {
		e.el.currentTime = t; e.fresh = false;
		var done = function () { e.fresh = true; draw(); };
		if (e.el.requestVideoFrameCallback) { var n = e.vfc = (e.vfc || 0) + 1; e.el.requestVideoFrameCallback(function () { if (e.vfc === n) done(); }); setTimeout(function () { if (e.vfc === n && !e.el.seeking) done(); }, 400); }
		else e.el.addEventListener("seeked", done, { once: true });
	}
	function release(id) { var e = els[id]; delete frames[id]; if (!e) return; try { e.el.pause(); e.el.removeAttribute("src"); e.el.load(); if (e.node) e.node.disconnect(); if (e.gain) e.gain.disconnect(); } catch (x) { /* ignore */ } delete els[id]; }

	/* ---------- clock ---------- */
	P.time = function () { return P.playing ? P.t0 + (performance.now() - P.p0) / 1000 * P.rate * (P.rev ? -1 : 1) : VE.t; };
	P.play = function (rate) {
		if (ed) P.endEdit();
		var d = V.duration(VE.P); if (!d) return;
		if (VE.t >= d - 1e-3) VE.t = 0;
		audio(); P.rate = rate || 1; P.rev = false; P.t0 = VE.t; P.p0 = performance.now(); P.playing = true;
		scheduleClean(); VE.emit("play"); loop();
	};
	P.reverse = function (rate) { P.pause(); P.rate = rate || 1; P.rev = true; P.t0 = VE.t; P.p0 = performance.now(); P.playing = true; muteAll(); VE.emit("play"); loop(); };
	P.pause = function () {
		if (!P.playing) return;
		VE.t = Math.max(0, P.time()); P.playing = false; P.rev = false;
		Object.keys(els).forEach(function (k) { var e = els[k]; e.el.pause(); if (e.gain && ac) e.gain.gain.setTargetAtTime(0, ac.currentTime, 0.01); });
		stopClean(); VE.emit("pause"); sync(); draw();
	};
	P.toggle = function () { if (P.playing && !P.rev) P.pause(); else P.play(P.speed); };
	// preview playback speed (1 frame / s up to 45x): the edit and the export are not changed; video / audio elements keep their pitch at this
	// speed. Browsers only play media at 1/16x-16x, so outside that the clips are shown by seeking frame after frame, without sound ("jump" mode).
	P.setSpeed = function (s) {
		s = V.clampSpeed(s, VE.P.fps); P.speed = s;
		if (P.playing && !P.rev) { P.pause(); P.play(s); }
		VE.emit("speed", s);
	};
	P.stepSpeed = function (dir) { var L = V.SPEED_PRESETS, i = 0; while (i < L.length - 1 && L[i] < P.speed - 1e-9) i++; var n = dir > 0 ? (L[i] > P.speed + 1e-9 ? L[i] : L[Math.min(L.length - 1, i + 1)]) : (i > 0 ? L[i - 1] : V.speedMin(VE.P.fps)); P.setSpeed(n); };
	P.nudgeSpeed = function (dir, inc) { P.setSpeed(V.stepSpeed(P.speed, dir, VE.P.fps, inc)); };
	function jumpRate(pr) { return pr > 16 + 1e-9 || pr < 0.0625 - 1e-9; }
	P.jumping = function () { return P.playing && jumpRate(P.rate); };
	P.seek = function (t) {
		var was = P.playing && !P.rev; if (P.playing) P.pause();
		VE.t = Math.max(0, Math.min(t, Math.max(V.duration(VE.P), 0)));
		VE.emit("time", VE.t); sync(); draw();
		if (was) P.play(P.rate);
	};
	P.restart = function () { if (P.playing && !P.rev) { var r = P.rate; P.pause(); P.play(r); } else { sync(); draw(); } };
	function muteAll() { Object.keys(els).forEach(function (k) { var e = els[k]; e.el.pause(); if (e.gain && ac) e.gain.gain.setTargetAtTime(0, ac.currentTime, 0.01); }); stopClean(); }
	function loop() {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(function step() {
			if (!P.playing) return;
			var t = P.time(), d = V.duration(VE.P);
			if ((!P.rev && t >= d) || (P.rev && t <= 0)) { P.t0 = P.rev ? 0 : d; P.p0 = performance.now(); P.pause(); VE.emit("time", VE.t); return; }
			VE.t = t; sync(); draw(); VE.emit("time", t);
			raf = requestAnimationFrame(step);
		});
	}

	/* ---------- keeping the elements in step ---------- */
	function sync() {
		var t = VE.t, p = VE.P, playing = P.playing && !P.rev, want = {}, now = performance.now();
		if (playing && ac && ac.state !== "running" && ac.state !== "closed" && now - (P.resumeAt || 0) > 1000) { P.resumeAt = now; ac.resume().catch(function () { }); }
		p.clips.forEach(function (c) {
			if (c.type !== "video" && c.type !== "audio") return;
			var tr = V.track(p, c.track); if (!tr) return;
			var visible = c.type === "video" && !tr.hide, audible = VE.hasSound(c) && !tr.mute && !c.mute;
			if (!visible && !audible) return;
			var s0 = c.start - (c.xin || 0), e1 = V.end(c), near = t >= s0 - (playing ? 2.5 : 0.05) && t < e1 + 0.05;
			if (!near) return;
			var e = elFor(c); if (!e) return; want[c.id] = 1;
			var m = VE.media(c.media), active = V.active(c, t), src = V.srcAt(c, Math.max(t, s0));
			if (src < 0) src = 0; if (m && m.dur && src > m.dur - 0.01) src = m.dur - 0.01;
			var jump = playing && active && jumpRate((c.speed || 1) * P.rate);
			if (jump) {   // faster than 16x or slower than 1/16x: no sound, the frame at the playhead is sought again as soon as the last seek is done
				if (!e.el.paused) e.el.pause();
				var jf = (m && m.fps) || 30;
				if (!e.el.seeking && Math.abs(e.el.currentTime - src) > 0.5 / jf) setTime(e, src);
			} else if (playing && active) {
				var pr = Math.max(0.0625, Math.min(16, (c.speed || 1) * P.rate));
				if (Math.abs(e.el.playbackRate - pr) > 1e-3) e.el.playbackRate = pr;
				var keep = Math.abs(P.rate - 1) > 1e-3 && Math.abs(P.rate - P.speed) < 1e-3;   // the speed menu: keep the voice's pitch (J / L shuttle and clip speed do not)
				if (e.el.preservesPitch !== keep) e.el.preservesPitch = keep;
				if (e.el.paused) { if (Math.abs(e.el.currentTime - src) > 0.02) setTime(e, src); var pp = e.el.play(); if (pp && pp.catch) pp.catch(function () { }); }
				else if (Math.abs(e.el.currentTime - src) > 0.3 * Math.max(1, P.rate)) setTime(e, src);
			} else {
				if (!e.el.paused) e.el.pause();
				var fps = (m && m.fps) || 30;
				if (Math.abs(e.el.currentTime - src) > 0.5 / fps && !e.el.seeking) setTime(e, src);
			}
			if (e.gain && ac) { var g = playing && active && !jump && !cleanCovers(c, t) ? V.gainAt(p, c, t) * VE.fxGainAt(c, t + 0.015) : 0; e.gain.gain.setTargetAtTime(g, ac.currentTime, 0.012); }
		});
		Object.keys(els).forEach(function (k) { if (!want[k] && now - els[k].used > 4000) release(k); else if (!want[k]) { els[k].el.pause(); if (els[k].gain && ac) els[k].gain.gain.setTargetAtTime(0, ac.currentTime, 0.01); } });
		cleanNodes.forEach(function (n) { var c = V.clip(p, n.id); if (!c || !ac) return; n.gain.gain.setTargetAtTime(V.gainAt(p, c, t) * VE.fxGainAt(c, t + 0.015), ac.currentTime, 0.012); });
	}
	P.sync = sync;
	P.seeking = function () { return Object.keys(els).some(function (k) { return els[k].el.seeking; }); };
	// the noise-removed copy plays instead of the clip's own sound only where it exists (a clip trimmed wider than the cleaned part plays the
	// original outside it) and only once its source is really scheduled (while it is being restarted the original keeps playing: never silence)
	function cleanCovers(c, t) {
		if (!c.clean || !c.clean.key) return false;
		var buf = cleanBufs[c.clean.key], cp = VE.cleanCache[c.clean.key]; if (!buf || !cp) return false;
		if (!cleanNodes.some(function (n) { return n.id === c.id; })) return false;
		var s = V.srcAt(c, t); return s >= cp.start - 0.01 && s < cp.start + buf.duration - 0.03;
	}
	// noise-removed sound: AudioBuffer sources scheduled from the playhead
	var cleanGen = 0;
	async function scheduleClean() {
		stopClean();
		var gen = ++cleanGen, p = VE.P, t = VE.t, a = audio(); if (!a) return;
		var list = p.clips.filter(function (c) { return c.clean && c.clean.key && VE.hasSound(c) && V.end(c) > t; });
		for (var j = 0; j < list.length; j++) {
			var c = list[j], cp = await VE.cleanPcm(c.clean.key); if (gen !== cleanGen || !P.playing || P.rev) return; if (!cp) continue;
			if (jumpRate((c.speed || 1) * P.rate)) continue;   // jump mode plays no sound
			var buf = cleanBufs[c.clean.key];
			if (!buf) { buf = a.createBuffer(cp.ch.length, cp.ch[0].length, cp.rate); cp.ch.forEach(function (x, k) { buf.copyToChannel(x, k); }); cleanBufs[c.clean.key] = buf; }
			var now = P.time(), from = Math.max(now, c.start - (c.xin || 0)), src = V.srcAt(c, from), off = src - cp.start;
			if (off < 0) { from += -off / (c.speed || 1); off = 0; }
			var len = (V.end(c) - from) * (c.speed || 1); if (len <= 0 || off >= buf.duration) continue;
			if (Math.abs(P.rate - 1) > 1e-3 && Math.abs(P.rate - P.speed) < 1e-3 && window.HTMLMediaElement) { cleanEl(a, c, cp, from, now, off, len); continue; }
			var node = a.createBufferSource(), gain = a.createGain(); node.buffer = buf; node.playbackRate.value = (c.speed || 1) * P.rate; gain.gain.value = 0;
			node.connect(gain).connect(a.destination);
			node.start(a.currentTime + Math.max(0, (from - now) / P.rate), off, Math.min(len, buf.duration - off));
			cleanNodes.push({ id: c.id, node: node, gain: gain });
		}
		sync();
	}
	// at a menu speed other than 1x the noise-removed sound plays from an <audio> element (a WAV of it) so the voice keeps its pitch
	var cleanUrls = {};
	function cleanEl(a, c, cp, from, now, off, len) {
		var url = cleanUrls[c.clean.key] || (cleanUrls[c.clean.key] = URL.createObjectURL(new Blob([V.wav16(cp.ch, cp.rate)], { type: "audio/wav" })));
		var el = new Audio(); el.preload = "auto"; el.src = url; el.preservesPitch = true; el.playbackRate = Math.max(0.0625, Math.min(16, (c.speed || 1) * P.rate));
		var sn = a.createMediaElementSource(el), gain = a.createGain(); gain.gain.value = 0; sn.connect(gain).connect(a.destination);
		var timer = setTimeout(function () { el.currentTime = off; var pp = el.play(); if (pp && pp.catch) pp.catch(function () { }); }, Math.max(0, (from - now) / P.rate * 1000));
		cleanNodes.push({ id: c.id, gain: gain, node: { stop: function () { clearTimeout(timer); el.pause(); el.removeAttribute("src"); }, disconnect: function () { sn.disconnect(); } } });
		void len;
	}
	function stopClean() { cleanGen++; cleanNodes.forEach(function (n) { try { n.node.stop(); n.node.disconnect(); n.gain.disconnect(); } catch (e) { /* ignore */ } }); cleanNodes = []; }
	P.forgetClean = function (key) { delete cleanBufs[key]; if (cleanUrls[key]) { URL.revokeObjectURL(cleanUrls[key]); delete cleanUrls[key]; } };

	/* ---------- drawing: the frame on a zoomable, movable pasteboard ---------- */
	// The canvas covers the whole stage. view = { k (canvas px per frame px), ox, oy (frame origin in canvas px) }; fit = keep the frame
	// fitted with a margin. Parts of clips that hang outside the frame are drawn on the pasteboard, dimmed, so it is obvious what is cut off.
	function source(c) {
		var m = VE.media(c.media); if (!m) return null;
		if (m.kind === "image") return m.bitmap ? { img: m.bitmap, w: m.w, h: m.h } : null;
		var e = els[c.id], fc = frames[c.id];
		// while a video element seeks (frame steps, a jump, the start of playback) it has no picture for a moment: show the last
		// frame it gave instead of a black flash
		if (!e || e.el.readyState < 2 || e.el.seeking || e.fresh === false) return fc && fc.media === c.media ? { img: fc.cv, w: m.w, h: m.h } : P.lastFrame(c);
		keepFrame(c, e.el);
		return { img: e.el, w: m.w, h: m.h };
	}
	var frames = {};
	function keepFrame(c, el) {
		var fc = frames[c.id], now = performance.now(), w = el.videoWidth, h = el.videoHeight; if (!w || !h) return;
		if (fc && fc.media === c.media && fc.at === el.currentTime) return;
		if (fc && P.playing && now - fc.t < 300) return;   // while playing a copy now and then is enough (a seek during playback is rare)
		if (!fc || fc.media !== c.media) { fc = frames[c.id] = { cv: document.createElement("canvas"), media: c.media }; }
		if (fc.cv.width !== w || fc.cv.height !== h) { fc.cv.width = w; fc.cv.height = h; }
		try { fc.cv.getContext("2d").drawImage(el, 0, 0, w, h); fc.at = el.currentTime; fc.t = now; } catch (x) { /* not ready */ }
	}
	P.lastFrame = function () { return null; };
	var VKEY = "mes-video-editor:view", VS = { guides: false, dim: true, bar: true };
	try { Object.assign(VS, JSON.parse(localStorage.getItem(VKEY)) || {}); } catch (e) { /* ignore */ }
	function saveVS() { try { localStorage.setItem(VKEY, JSON.stringify({ guides: VS.guides, dim: VS.dim, bar: VS.bar })); } catch (e) { /* ignore */ } }
	var guides = null, view = { k: 1, ox: 0, oy: 0 }, isFit = true, fitClear = false, dpr = 1, pattern = null, pick = null;
	P.view = function () { return { k: view.k, ox: view.ox, oy: view.oy, fit: isFit && !fitClear, fitClear: isFit && fitClear, dpr: dpr, pct: Math.round(view.k / dpr * 1000) / 10 }; };
	function draw() { needDraw = true; if (!P.playing) requestAnimationFrame(paint); else paint(); }
	P.draw = draw;
	function pasteboard() {
		if (pattern && pattern.d === dpr) return pattern.p;
		var s = Math.round(10 * dpr), t = document.createElement("canvas"); t.width = t.height = s * 2; var g = t.getContext("2d");
		g.fillStyle = "#14181f"; g.fillRect(0, 0, s * 2, s * 2); g.fillStyle = "#1b2029"; g.fillRect(0, 0, s, s); g.fillRect(s, s, s, s);
		pattern = { d: dpr, p: ctx.createPattern(t, "repeat") }; return pattern.p;
	}
	// the 4 corners of a clip's rectangle (frame px), turned by its rotation, in canvas px
	function corners(r) {
		var cx = r.dx + r.dw / 2, cy = r.dy + r.dh / 2;
		return [[r.dx, r.dy], [r.dx + r.dw, r.dy], [r.dx + r.dw, r.dy + r.dh], [r.dx, r.dy + r.dh]].map(function (q) { var p = V.rotPt(q[0], q[1], cx, cy, r.rot || 0); return { x: view.ox + p.x * view.k, y: view.oy + p.y * view.k }; });
	}
	// middle of the left and right edges of a title: drag to set the width where its lines wrap
	function sideHandles(r) { var cx = r.dx + r.dw / 2, cy = r.dy + r.dh / 2; return [[r.dx, cy], [r.dx + r.dw, cy]].map(function (q) { var p = V.rotPt(q[0], q[1], cx, cy, r.rot || 0); return { x: view.ox + p.x * view.k, y: view.oy + p.y * view.k }; }); }
	function rotHandle(r) { var cx = r.dx + r.dw / 2, cy = r.dy + r.dh / 2, p = V.rotPt(cx, r.dy - 28 * dpr / view.k, cx, cy, r.rot || 0); return { x: view.ox + p.x * view.k, y: view.oy + p.y * view.k }; }
	function paint() {
		if (!needDraw) return; needDraw = false;
		var CW = cv.width, CH = cv.height, PW = VE.P.w, PH = VE.P.h, k = view.k, fx = view.ox, fy = view.oy, fw = PW * k, fh = PH * k;
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = pasteboard(); ctx.fillRect(0, 0, CW, CH);
		ctx.setTransform(k, 0, 0, k, fx, fy); ctx.imageSmoothingQuality = k < 0.6 ? "medium" : "high";
		VE.draw(ctx, PW, PH, VE.t, source);
		if (ed) place();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		// dim everything outside the frame: what hangs over the edge is still visible, but clearly not in the video
		ctx.save(); ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.rect(fx, fy, fw, fh); ctx.fillStyle = VS.dim ? "rgba(6,8,12,0.66)" : "rgba(6,8,12,0.25)"; ctx.fill("evenodd");
		// frame edge: a thin light line with a dark line outside it, so it shows on any picture
		ctx.lineWidth = Math.max(1, dpr); ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeRect(Math.round(fx) - 1.5 * dpr, Math.round(fy) - 1.5 * dpr, Math.round(fw) + 3 * dpr, Math.round(fh) + 3 * dpr);
		ctx.strokeStyle = "rgba(226,232,240,0.85)"; ctx.strokeRect(Math.round(fx) - 0.5 * dpr, Math.round(fy) - 0.5 * dpr, Math.round(fw) + dpr, Math.round(fh) + dpr);
		if (VS.guides) {
			ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.lineWidth = dpr;
			[[0.05, "rgba(250,204,21,0.8)"], [0.1, "rgba(56,189,248,0.8)"]].forEach(function (q) { ctx.strokeStyle = q[1]; ctx.strokeRect(fx + fw * q[0], fy + fh * q[0], fw * (1 - 2 * q[0]), fh * (1 - 2 * q[0])); });
			ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath();
			var mx = fx + fw / 2, my = fy + fh / 2, a = 12 * dpr; ctx.moveTo(mx - a, my); ctx.lineTo(mx + a, my); ctx.moveTo(mx, my - a); ctx.lineTo(mx, my + a);
			for (var g = 1; g < 3; g++) { ctx.moveTo(fx + fw * g / 3, fy); ctx.lineTo(fx + fw * g / 3, fy + fh); ctx.moveTo(fx, fy + fh * g / 3); ctx.lineTo(fx + fw, fy + fh * g / 3); }
			ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.stroke();
			ctx.font = Math.round(10 * dpr) + "px Arial, sans-serif"; ctx.fillStyle = "rgba(250,204,21,0.9)"; ctx.textBaseline = "top"; ctx.fillText("action safe 90%", fx + fw * 0.05 + 4 * dpr, fy + fh * 0.05 + 3 * dpr);
			ctx.fillStyle = "rgba(56,189,248,0.95)"; ctx.fillText("title safe 80%", fx + fw * 0.1 + 4 * dpr, fy + fh * 0.1 + 3 * dpr);
		}
		ctx.restore();
		if (guides && drag && drag.mode === "move") {   // snap guide lines across the whole stage
			ctx.save(); ctx.strokeStyle = "#f472b6"; ctx.lineWidth = Math.max(1, dpr); ctx.setLineDash([]); ctx.beginPath();
			if (guides.x != null) { var gxp = Math.round(fx + guides.x * k) + 0.5; ctx.moveTo(gxp, 0); ctx.lineTo(gxp, CH); }
			if (guides.y != null) { var gyp = Math.round(fy + guides.y * k) + 0.5; ctx.moveTo(0, gyp); ctx.lineTo(CW, gyp); }
			ctx.stroke(); ctx.restore();
		}
		// selection frame (turned with the clip), corner handles and the turn handle
		var sel = VE.selected().filter(function (c) { return c.type !== "audio" && V.active(c, VE.t); });
		if (sel.length && !P.playing && !pick) {
			var c = sel[0], r = VE.rectOf(ctx, c, PW, PH);
			if (r) {
				var cs = corners(r), rh = rotHandle(r), top = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 }, hs = 6 * dpr;
				ctx.save(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = "#38bdf8"; ctx.setLineDash([6 * dpr, 4 * dpr]);
				ctx.beginPath(); cs.forEach(function (q, i) { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
				ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rh.x, rh.y); ctx.stroke();
				ctx.fillStyle = "#38bdf8"; cs.forEach(function (q) { ctx.fillRect(q.x - hs, q.y - hs, hs * 2, hs * 2); });
				ctx.beginPath(); ctx.arc(rh.x, rh.y, hs, 0, Math.PI * 2); ctx.fillStyle = "#0c4a6e"; ctx.fill(); ctx.stroke();
				if (c.type === "text") sideHandles(r).forEach(function (q) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate((r.rot || 0) * Math.PI / 180); ctx.fillStyle = "#f8fafc"; ctx.strokeStyle = "#0284c7"; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-3.5 * dpr, -11 * dpr, 7 * dpr, 22 * dpr, 3.5 * dpr); else ctx.rect(-3.5 * dpr, -11 * dpr, 7 * dpr, 22 * dpr); ctx.fill(); ctx.stroke(); ctx.restore(); });
				if (drag && drag.mode === "wrap" && drag.c === c) { var T0 = c.text, lab = T0.wrap > 0 ? "Box width " + Math.round(T0.wrap * 100) + "% · lines wrap" : "No wrapping"; ctx.font = "700 " + Math.round(11 * dpr) + "px Arial, sans-serif"; ctx.textBaseline = "bottom"; var lw2 = ctx.measureText(lab).width, lx = (cs[0].x + cs[1].x) / 2 - lw2 / 2, ly = Math.min(cs[0].y, cs[1].y) - 34 * dpr; ctx.fillStyle = "rgba(2,6,23,0.85)"; ctx.fillRect(lx - 5 * dpr, ly - 15 * dpr, lw2 + 10 * dpr, 18 * dpr); ctx.fillStyle = "#e0f2fe"; ctx.fillText(lab, lx, ly); }
				var rel = VE.t - c.start, run = c.anims && V.animRunning(c, rel, 0.5 / VE.P.fps), own = c.anims && !run && V.animEndingAt(c, rel, 0.5 / VE.P.fps);
				if (run || own) { ctx.font = "700 " + Math.round(11 * dpr) + "px Arial, sans-serif"; ctx.textBaseline = "bottom"; var tx = run ? "Inside an animation: move the playhead to its start or end to change it" : "At the end of \u201c" + V.animName(own) + "\u201d: moving it sets where the animation ends"; var tw = ctx.measureText(tx).width; var bx = 10 * dpr, by = CH - 8 * dpr; /* bottom left of the stage, clear of the zoom bar */ ctx.fillStyle = "rgba(2,6,23,0.85)"; ctx.fillRect(bx - 4 * dpr, by - 15 * dpr, tw + 8 * dpr, 17 * dpr); ctx.fillStyle = run ? "#fca5a5" : "#fde68a"; ctx.fillText(tx, bx, by); }
				ctx.restore();
			}
		}
		if (pick) {
			ctx.save(); ctx.fillStyle = "rgba(2,6,23,0.35)"; ctx.fillRect(fx, fy, fw, fh);
			if (pick.r) { var R = pick.r; ctx.clearRect(0, 0, 0, 0); ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2 * dpr; ctx.setLineDash([8 * dpr, 5 * dpr]); ctx.strokeRect(fx + R.x * k, fy + R.y * k, R.w * k, R.h * k); }
			ctx.font = "700 " + Math.round(13 * dpr) + "px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top"; var msg = "Drag a box over the part to zoom to · Esc cancels", mw = ctx.measureText(msg).width;
			ctx.fillStyle = "rgba(2,6,23,0.85)"; ctx.fillRect(CW / 2 - mw / 2 - 8 * dpr, 8 * dpr, mw + 16 * dpr, 22 * dpr); ctx.fillStyle = "#fde68a"; ctx.fillText(msg, CW / 2, 12 * dpr); ctx.restore();
		}
		if (!VE.P.clips.length) {
			ctx.save(); ctx.fillStyle = "#94a3b8"; ctx.font = Math.round(Math.min(fh / 18, 22 * dpr)) + "px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
			ctx.fillText("Add videos, sound or pictures, then drag them onto the timeline", fx + fw / 2, fy + fh / 2); ctx.restore();
		}
		VE.emit("view");
	}
	// the canvas covers the stage; the frame is fitted (with a margin) or kept where it was, zoomed
	function fit() {
		var bw = Math.max(2, wrap.clientWidth || 640), bh = Math.max(2, wrap.clientHeight || 360), d = Math.min(2, window.devicePixelRatio || 1);
		var pw = Math.round(bw * d), ph = Math.round(bh * d), ow = cv.width, oh = cv.height;
		var cxF = ow ? (ow / 2 - view.ox) / view.k : 0, cyF = oh ? (oh / 2 - view.oy) / view.k : 0;
		cv.style.width = bw + "px"; cv.style.height = bh + "px";
		if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
		if (isFit || !ow) {
			// "Fit clear" keeps the frame below the zoom bar; both fits keep it above a transport bar that floats over the stage (Fill window)
			var m = Math.round(14 * d), top = Math.max(m, fitClear ? clearTop() * d : 0), bot = Math.max(m, clearBottom() * d);
			view = V.viewFit(pw, Math.max(2 * m + 2, ph - top - bot + 2 * m), VE.P.w, VE.P.h, m); view.oy += top - m;
		}
		else { view.k = view.k / dpr * d; view.ox = pw / 2 - cxF * view.k; view.oy = ph / 2 - cyF * view.k; }
		dpr = d; draw();
	}
	P.fit = fit;
	if (window.ResizeObserver) { var ro = new ResizeObserver(function () { fit(); }); ro.observe(wrap); var tb = wrap.parentNode && wrap.parentNode.querySelector(".vd-transport"); if (tb) ro.observe(tb); } else window.addEventListener("resize", fit);
	// how far down the zoom bar reaches inside the stage (CSS px)
	function clearTop() { var bar = document.getElementById("vd-vz"); if (!bar || bar.offsetParent === null) return 0; var a = bar.getBoundingClientRect(), b = wrap.getBoundingClientRect(); return Math.max(0, a.bottom - b.top + 6); }
	// how far a bar floating over the bottom of the stage (the Fill window transport) reaches up into it (CSS px)
	function clearBottom() { var bar = wrap.parentNode && wrap.parentNode.querySelector(".vd-transport"); if (!bar || bar.offsetParent === null || getComputedStyle(bar).position !== "absolute") return 0; var a = bar.getBoundingClientRect(), b = wrap.getBoundingClientRect(); return Math.max(0, b.bottom - a.top + 6); }
	P.zoomFit = function (clear) { isFit = true; fitClear = !!clear; fit(); };
	P.barShown = function (on) { if (on != null) { VS.bar = !!on; saveVS(); if (isFit && fitClear) requestAnimationFrame(fit); } return VS.bar !== false; };
	// zoom to pct (100 = one frame pixel per screen pixel) around a stage point (canvas px; default the middle)
	P.zoomTo = function (pct, px, py) {
		var k2 = V.clamp(pct / 100 * dpr, 0.02, 40); isFit = false;
		view = V.viewZoomAt(view, k2, px == null ? cv.width / 2 : px, py == null ? cv.height / 2 : py); draw();
	};
	P.zoomStep = function (dir, px, py) {
		var cur = view.k / dpr, L = V.ZOOM_STEPS, n = dir > 0 ? L.filter(function (z) { return z > cur * 1.01; })[0] : L.filter(function (z) { return z < cur / 1.01; }).pop();
		if (n) P.zoomTo(n * 100, px, py);
	};
	P.guides = function (on) { if (on != null) { VS.guides = !!on; saveVS(); draw(); } return VS.guides; };
	P.dimOutside = function (on) { if (on != null) { VS.dim = !!on; saveVS(); draw(); } return VS.dim; };
	// zoom-n-pan: let the person draw a box of the frame's shape on the preview; cb(rect in frame px) or cb(null) when cancelled
	P.pickRect = function (cb) { if (P.playing) P.pause(); pick = { cb: cb, r: null }; cv.style.cursor = "crosshair"; draw(); };
	P.picking = function () { return !!pick; };
	P.cancelPick = function () { if (!pick) return; var cb = pick.cb; pick = null; cv.style.cursor = ""; draw(); cb(null); };

	/* ---------- pointer: move / resize / turn clips, pan (middle button, Space, empty pasteboard, two fingers), pinch and Ctrl+wheel zoom ---------- */
	var drag = null, touches = {}, pinch = null;
	function canvasPt(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * cv.width / Math.max(1, b.width), y: (e.clientY - b.top) * cv.height / Math.max(1, b.height) }; }
	function toFrame(e) { var q = canvasPt(e); return { x: (q.x - view.ox) / view.k, y: (q.y - view.oy) / view.k, cx: q.x, cy: q.y }; }
	// is frame point pt inside clip rect r (turned about its centre)?
	function inside(r, pt) { var p = V.rotPt(pt.x, pt.y, r.dx + r.dw / 2, r.dy + r.dh / 2, -(r.rot || 0)); return V.hit(r, p.x, p.y); }
	P.hover = false; P.space = null;
	wrap.addEventListener("pointerenter", function () { P.hover = true; }); wrap.addEventListener("pointerleave", function () { P.hover = false; });
	P.spaceDown = function () { if (!P.space) { P.space = { used: false }; cv.style.cursor = "grab"; } };
	// Space is watched here too (capture phase, whatever has the keyboard focus, except while typing), so Space + drag always pans,
	// even over a clip, while playing, or with a button / time box focused
	var spaceHeld = false;
	function typing(t) { return t && (/^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === "INPUT" && !/^(checkbox|radio|range|button)$/i.test(t.type)) || t.isContentEditable); }
	window.addEventListener("keydown", function (e) { if (e.key === " " && !typing(e.target)) spaceHeld = true; }, true);
	window.addEventListener("keyup", function (e) { if (e.key === " ") spaceHeld = false; }, true);
	window.addEventListener("blur", function () { spaceHeld = false; });
	// hand tool: every drag in the preview moves the view (the zoom bar's ✋ button, key H)
	P.hand = false;
	P.setHand = function (on) { P.hand = !!on; cv.style.cursor = P.hand ? "grab" : ""; VE.emit("view"); };
	document.addEventListener("keyup", function (e) { if (e.key !== " " || !P.space) return; var used = P.space.used; P.space = null; cv.style.cursor = ""; if (!used) P.toggle(); });
	function startPan(e) { drag = { pan: true, x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; isFit = false; fitClear = false; cv.style.cursor = "grabbing"; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
	cv.addEventListener("pointerdown", function (e) {
		if (e.pointerType === "touch") { touches[e.pointerId] = canvasPt(e); var ids = Object.keys(touches); if (ids.length === 2) { if (drag && drag.c && drag.moved) VE.commit(drag.corner ? "Resize" : "Move"); drag = null; var a = touches[ids[0]], b = touches[ids[1]]; pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v: Object.assign({}, view) }; isFit = false; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; } }
		if (e.button === 1 || ((P.space || spaceHeld || P.hand) && e.button === 0)) { if (P.space) P.space.used = true; startPan(e); return; }
		if (e.button > 0) return;
		var pt = toFrame(e);
		if (pick) { pick.p0 = pt; pick.r = null; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
		if (P.playing) P.pause();
		var PW = VE.P.w, PH = VE.P.h, L = V.layersAt(VE.P, VE.t), hitC = null, mode = "move", sel = VE.selected()[0], tol = 9 * dpr;
		if (sel && sel.type !== "audio" && V.active(sel, VE.t)) {
			var r0 = VE.rectOf(ctx, sel, PW, PH);
			if (r0) {
				var rh = rotHandle(r0); if (Math.hypot(pt.cx - rh.x, pt.cy - rh.y) < tol * 1.4) { hitC = sel; mode = "turn"; }
				if (!hitC) corners(r0).forEach(function (q) { if (Math.abs(pt.cx - q.x) < tol && Math.abs(pt.cy - q.y) < tol) { hitC = sel; mode = "corner"; } });
				if (!hitC && sel.type === "text") sideHandles(r0).forEach(function (q) { if (Math.abs(pt.cx - q.x) < tol * 1.2 && Math.abs(pt.cy - q.y) < tol * 1.8) { hitC = sel; mode = "wrap"; } });
			}
		}
		if (!hitC) for (var j = L.length - 1; j >= 0; j--) { var c = L[j].clip, tr = V.track(VE.P, c.track); if (tr && tr.lock) continue; var r = VE.rectOf(ctx, c, PW, PH, L[j].pos); if (r && inside(r, pt)) { hitC = c; break; } }
		if (!hitC) {
			VE.sel = []; VE.emit("select"); draw();
			if (pt.x < 0 || pt.y < 0 || pt.x > PW || pt.y > PH || !isFit) startPan(e);   // drag the empty pasteboard (or a zoomed view) to move it
			return;
		}
		if (VE.sel.indexOf(hitC.id) < 0) { VE.sel = [hitC.id]; VE.emit("select"); }
		var rel = VE.t - hitC.start, fpsTol = 0.5 / VE.P.fps;
		if (hitC.anims && V.animRunning(hitC, rel, fpsTol)) { VE.emit("notice", "The playhead is inside an animation. Move it to the animation's start or end (double-click its arrow on the timeline) to move the clip there."); draw(); return; }
		var pos = V.posAt(hitC, VE.t), cxp = pos.x * PW, cyp = pos.y * PH;
		drag = { c: hitC, mode: mode, rel: rel, tol: fpsTol, x0: pos.x, y0: pos.y, s0: pos.scale, r0: pos.rot, p0: pt, d0: Math.max(4, Math.hypot(pt.x - cxp, pt.y - cyp)), a0: Math.atan2(pt.y - cyp, pt.x - cxp), cx: cxp, cy: cyp, moved: false };
		if (mode === "move") {   // snap targets: the frame's edges and middle, and the edges / middles of the other pictures showing now
			var rb = VE.rectOf(ctx, hitC, PW, PH, pos);
			if (rb) { drag.bw = rb.dw; drag.bh = rb.dh; drag.bx = rb.dx + rb.dw / 2 - cxp; drag.by = rb.dy + rb.dh / 2 - cyp; }
			drag.tx = [0, PW / 2, PW]; drag.ty = [0, PH / 2, PH];
			L.forEach(function (l) { if (l.clip === hitC) return; var ro = VE.rectOf(ctx, l.clip, PW, PH, l.pos); if (!ro || ro.rot) return; drag.tx.push(ro.dx, ro.dx + ro.dw / 2, ro.dx + ro.dw); drag.ty.push(ro.dy, ro.dy + ro.dh / 2, ro.dy + ro.dh); });
		}
		cv.setPointerCapture(e.pointerId); e.preventDefault(); draw();
	});
	cv.addEventListener("pointermove", function (e) {
		if (e.pointerType === "touch" && touches[e.pointerId]) touches[e.pointerId] = canvasPt(e);
		if (pinch) {
			var ids = Object.keys(touches); if (ids.length < 2) return; var a = touches[ids[0]], b = touches[ids[1]], d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			view = V.viewZoomAt(pinch.v, V.clamp(pinch.v.k * d / pinch.d, 0.02, 40), pinch.m.x, pinch.m.y); view.ox += m.x - pinch.m.x; view.oy += m.y - pinch.m.y; draw(); return;
		}
		if (pick && pick.p0) {
			var q = toFrame(e), W = VE.P.w, H = VE.P.h, w = Math.max(Math.abs(q.x - pick.p0.x), Math.abs(q.y - pick.p0.y) * W / H);
			pick.r = V.frameRect(Math.min(q.x, pick.p0.x) + Math.abs(q.x - pick.p0.x) / 2, Math.min(q.y, pick.p0.y) + Math.abs(q.y - pick.p0.y) / 2, Math.max(8, w), W, H); draw(); return;
		}
		if (!drag) { if (!pick) cv.style.cursor = P.space || spaceHeld || P.hand ? "grab" : ""; return; }
		if (drag.pan) { var b2 = cv.getBoundingClientRect(), sx = cv.width / Math.max(1, b2.width); view.ox = drag.ox + (e.clientX - drag.x) * sx; view.oy = drag.oy + (e.clientY - drag.y) * sx; draw(); return; }
		var pt = toFrame(e), c = drag.c, rel = drag.rel, tol = drag.tol; drag.moved = true;
		if (drag.mode === "wrap") {
			var T = c.text, pp = V.rotPt(pt.x, pt.y, drag.cx, drag.cy, -(drag.r0 || 0)), half = Math.abs(pp.x - drag.cx), sc = Math.max(0.01, drag.s0 || 1);
			T.wrap = V.clamp(Math.round(2 * half / (VE.P.w * sc) * 1000) / 1000, 0.05, 4); VE.emit("live"); draw(); return;
		}
		else if (drag.mode === "corner") V.setPropAt(c, rel, "scale", V.clamp(Math.round(drag.s0 * Math.hypot(pt.x - drag.cx, pt.y - drag.cy) / drag.d0 * 1000) / 1000, 0.02, 20), tol);
		else if (drag.mode === "turn") { var ang = drag.r0 + (Math.atan2(pt.y - drag.cy, pt.x - drag.cx) - drag.a0) * 180 / Math.PI; if (!e.shiftKey) ang = Math.round(ang / 5) * 5; if (!e.shiftKey && Math.abs(ang % 90) < 3) ang = Math.round(ang / 90) * 90; V.setPropAt(c, rel, "rot", Math.round(ang * 100) / 100, tol); }
		else {
			var nx = drag.x0 + (pt.x - drag.p0.x) / VE.P.w, ny = drag.y0 + (pt.y - drag.p0.y) / VE.P.h;
			// Snap (the timeline's Snap box; Alt = the opposite while dragging): the box's left / middle / right and top / middle / bottom
			// stick to the frame and the other pictures within ~7 screen pixels, with a pink guide line
			var snapOn = (VE.tl.snap !== false) !== !!e.altKey; guides = null;
			if (snapOn && drag.bw) {
				var th = 7 * dpr / view.k, gx = null, gy = null;
				function best(c0, half, list) { var b = null; [-half, 0, half].forEach(function (o) { list.forEach(function (L0) { var d = L0 - (c0 + o); if (Math.abs(d) <= th && (!b || Math.abs(d) < Math.abs(b.d))) b = { d: d, at: L0 }; }); }); return b; }
				var bxs = best(nx * VE.P.w + drag.bx, drag.bw / 2, drag.tx), bys = best(ny * VE.P.h + drag.by, drag.bh / 2, drag.ty);
				if (bxs) { nx += bxs.d / VE.P.w; gx = bxs.at; } if (bys) { ny += bys.d / VE.P.h; gy = bys.at; }
				if (gx != null || gy != null) guides = { x: gx, y: gy };
			}
			V.setPropAt(c, rel, "x", Math.round(nx * 10000) / 10000, tol); V.setPropAt(c, rel, "y", Math.round(ny * 10000) / 10000, tol);
		}
		VE.emit("live"); draw();
	});
	function end(e) {
		if (e && e.pointerType === "touch") { delete touches[e.pointerId]; if (pinch && Object.keys(touches).length < 2) pinch = null; }
		if (pick && pick.p0) { var r = pick.r, cb = pick.cb; pick = null; cv.style.cursor = ""; draw(); cb(r && r.w > 8 ? r : null); return; }
		if (drag && drag.pan) { drag = null; cv.style.cursor = P.space || spaceHeld || P.hand ? "grab" : ""; return; }
		guides = null; if (drag && drag.moved) { var a = V.animEndingAt(drag.c, drag.rel, drag.tol) || V.propOwner(drag.c, drag.rel, drag.mode === "corner" ? "scale" : drag.mode === "turn" ? "rot" : "x", drag.tol); if (drag.mode === "wrap") VE.commit("Title box width"); else VE.commit((drag.mode === "corner" ? "Resize" : drag.mode === "turn" ? "Turn" : "Move") + (a ? " (animation end)" : "")); }
		drag = null;
	}
	cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
	cv.addEventListener("dblclick", function (e) { var c = VE.selected()[0]; if (c && c.type === "text" && V.active(c, VE.t)) P.editText(c, e); });

	/* ---------- type a title straight into the picture ---------- */
	// a text box laid over the title (same font, size, spacing, colours, turned with it); the canvas leaves that title out while you type
	var ed = null;
	P.editing = function () { return ed ? ed.c : null; };
	P.editText = function (c, ev) {
		if (!c || c.type !== "text") return; if (ed) P.endEdit();
		if (!V.active(c, VE.t)) { VE.emit("notice", "Move the playhead over the title to type in it."); return; }
		if (P.playing) P.pause();
		var ta = document.createElement("textarea"); ta.className = "vd-tedit"; ta.spellcheck = true; ta.setAttribute("aria-label", "Title text: Esc or click outside when done");
		ta.value = c.text.s || ""; wrap.appendChild(ta);
		ed = { c: c, ta: ta, before: ta.value }; VE.editingTextId = c.id; VE.sel = [c.id]; VE.emit("select");
		ta.addEventListener("input", function () { c.text.s = ta.value; place(); VE.emit("live"); draw(); });
		ta.addEventListener("keydown", function (e) {
			e.stopPropagation();
			if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); P.endEdit(); }
		});
		["pointerdown", "dblclick", "wheel"].forEach(function (k) { ta.addEventListener(k, function (e) { e.stopPropagation(); }); });
		ta.addEventListener("blur", function () { setTimeout(function () { if (ed && ed.ta === ta && document.activeElement !== ta) P.endEdit(); }, 0); });
		place(); draw(); ta.focus();
		if (ev && ev.type === "dblclick") { ta.select(); } else ta.select();
		if (VE.ensureFont) VE.ensureFont(c.text).then(function () { if (ed && ed.c === c) place(); });
	};
	P.endEdit = function () {
		if (!ed) return; var e0 = ed; ed = null; VE.editingTextId = null;
		if (e0.ta.parentNode) e0.ta.parentNode.removeChild(e0.ta);
		if (e0.c.text.s !== e0.before) VE.commit("Title text"); else draw();
	};
	function place() {
		if (!ed) return; var c = ed.c, ta = ed.ta, T = c.text;
		if (!V.active(c, VE.t) || VE.P.clips.indexOf(c) < 0) { P.endEdit(); return; }
		var r = VE.rectOf(ctx, c, VE.P.w, VE.P.h); if (!r) return;
		var cb = cv.getBoundingClientRect(), wb = wrap.getBoundingClientRect(), s = cb.width / Math.max(1, cv.width), k = view.k * s;
		var bw = (r.wrapW > 0 ? Math.max(r.wrapW, r.dw) : r.dw + r.px) * k, bh = r.dh * k, cx = cb.left - wb.left + (view.ox + (r.dx + r.dw / 2) * view.k) * s, cy = cb.top - wb.top + (view.oy + (r.dy + r.dh / 2) * view.k) * s;
		var st = ta.style, bgA = T.bgOn ? (T.bgOp == null ? 0.55 : T.bgOp) : 0, hex = (T.bg || "#000000").replace("#", ""), rgb = [0, 2, 4].map(function (i) { return parseInt(hex.substr(i, 2), 16) || 0; });
		st.width = bw + "px"; st.minHeight = bh + "px"; st.height = bh + "px";
		st.left = (cx - bw / 2) + "px"; st.top = (cy - bh / 2) + "px";
		st.font = VE.textFont(T, r.px * k); st.lineHeight = (r.lh * k) + "px"; st.letterSpacing = ((T.ls || 0) * r.px * k) + "px";
		st.padding = (r.pad * 0.6 * k) + "px " + (r.pad * k) + "px"; st.textAlign = T.align || "center"; st.color = T.color || "#fff"; st.caretColor = T.color || "#fff";
		st.whiteSpace = r.wrapW > 0 ? "pre-wrap" : "pre"; st.background = "rgba(" + rgb.join(",") + "," + bgA + ")"; st.borderRadius = (r.px * 0.25 * k) + "px";
		st.textShadow = T.outline > 0 ? "0 0 " + Math.max(1, T.outline * r.px * k * 0.05) + "px " + (T.ocolor || "#000") : T.shadow ? "0 " + (r.px * k * 0.05) + "px " + (r.px * k * 0.12) + "px rgba(0,0,0,0.6)" : "none";
		st.transform = r.rot ? "rotate(" + r.rot + "deg)" : "";
		if (ta.scrollHeight > ta.clientHeight + 1) { st.height = ta.scrollHeight + "px"; st.top = (cy - ta.scrollHeight / 2) + "px"; }
	}
	P.placeEditor = place;
	cv.addEventListener("wheel", function (e) {
		var q = canvasPt(e);
		if (e.ctrlKey || e.metaKey) { e.preventDefault(); isFit = false; view = V.viewZoomAt(view, V.clamp(view.k * Math.pow(1.0018, -e.deltaY), 0.02, 40), q.x, q.y); draw(); return; }   // trackpad pinch arrives as Ctrl + wheel
		if (isFit) return;   // fitted: the page scrolls as usual
		e.preventDefault(); var s = cv.width / Math.max(1, cv.getBoundingClientRect().width); view.ox -= e.deltaX * s; view.oy -= e.deltaY * s; draw();
	}, { passive: false });
	cv.addEventListener("auxclick", function (e) { if (e.button === 1) e.preventDefault(); });

	VE.on("change", function () { if (P.playing && !P.rev) { stopClean(); scheduleClean(); } fit(); sync(); draw(); });
	VE.on("select", draw); VE.on("mediaReady", function () { sync(); draw(); }); VE.on("thumbs", function () { });
	document.addEventListener("visibilitychange", function () { if (document.hidden && P.playing) P.pause(); });
})();
