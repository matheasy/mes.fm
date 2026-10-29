/* MES Video Editor preview: one <video> / <audio> element per clip near the playhead (kept in step with the timeline clock), drawn through
 * the shared compositor onto a canvas; their sound goes through Web Audio gain nodes (volume, fades, cross-fades, mute). Noise-removed sound
 * plays from AudioBuffers. Drag a picture or title in the preview to move it, its corner to resize it. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V, $ = function (id) { return document.getElementById(id); };
	var P = VE.preview = { playing: false, rate: 1, rev: false, t0: 0, p0: 0 };
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
	function release(id) { var e = els[id]; if (!e) return; try { e.el.pause(); e.el.removeAttribute("src"); e.el.load(); if (e.node) e.node.disconnect(); if (e.gain) e.gain.disconnect(); } catch (x) { /* ignore */ } delete els[id]; }

	/* ---------- clock ---------- */
	P.time = function () { return P.playing ? P.t0 + (performance.now() - P.p0) / 1000 * P.rate * (P.rev ? -1 : 1) : VE.t; };
	P.play = function (rate) {
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
	P.toggle = function () { if (P.playing && !P.rev) P.pause(); else P.play(1); };
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
			if (playing && active) {
				var pr = Math.max(0.0625, Math.min(16, (c.speed || 1) * P.rate));
				if (Math.abs(e.el.playbackRate - pr) > 1e-3) e.el.playbackRate = pr;
				if (e.el.paused) { if (Math.abs(e.el.currentTime - src) > 0.02) e.el.currentTime = src; var pp = e.el.play(); if (pp && pp.catch) pp.catch(function () { }); }
				else if (Math.abs(e.el.currentTime - src) > 0.3 * Math.max(1, P.rate)) e.el.currentTime = src;
			} else {
				if (!e.el.paused) e.el.pause();
				var fps = (m && m.fps) || 30;
				if (Math.abs(e.el.currentTime - src) > 0.5 / fps && !e.el.seeking) e.el.currentTime = src;
			}
			if (e.gain && ac) { var g = playing && active && !(c.clean && c.clean.key && cleanOn(c)) ? V.gainAt(p, c, t) : 0; e.gain.gain.setTargetAtTime(g, ac.currentTime, 0.012); }
		});
		Object.keys(els).forEach(function (k) { if (!want[k] && now - els[k].used > 4000) release(k); else if (!want[k]) { els[k].el.pause(); if (els[k].gain && ac) els[k].gain.gain.setTargetAtTime(0, ac.currentTime, 0.01); } });
		cleanNodes.forEach(function (n) { var c = V.clip(p, n.id); if (!c || !ac) return; n.gain.gain.setTargetAtTime(V.gainAt(p, c, t), ac.currentTime, 0.012); });
	}
	P.sync = sync;
	function cleanOn(c) { return !!cleanBufs[c.clean.key]; }
	// noise-removed sound: AudioBuffer sources scheduled from the playhead
	async function scheduleClean() {
		stopClean();
		var p = VE.P, t = VE.t, a = audio(); if (!a) return;
		var list = p.clips.filter(function (c) { return c.clean && c.clean.key && VE.hasSound(c) && V.end(c) > t; });
		for (var j = 0; j < list.length; j++) {
			var c = list[j], cp = await VE.cleanPcm(c.clean.key); if (!cp || !P.playing) continue;
			var buf = cleanBufs[c.clean.key];
			if (!buf) { buf = a.createBuffer(cp.ch.length, cp.ch[0].length, cp.rate); cp.ch.forEach(function (x, k) { buf.copyToChannel(x, k); }); cleanBufs[c.clean.key] = buf; }
			var now = P.time(), from = Math.max(now, c.start - (c.xin || 0)), src = V.srcAt(c, from), off = src - cp.start;
			if (off < 0) { from += -off / (c.speed || 1); off = 0; }
			var len = (V.end(c) - from) * (c.speed || 1); if (len <= 0 || off >= buf.duration) continue;
			var node = a.createBufferSource(), gain = a.createGain(); node.buffer = buf; node.playbackRate.value = (c.speed || 1) * P.rate; gain.gain.value = 0;
			node.connect(gain).connect(a.destination);
			node.start(a.currentTime + Math.max(0, (from - now) / P.rate), off, Math.min(len, buf.duration - off));
			cleanNodes.push({ id: c.id, node: node, gain: gain });
		}
		sync();
	}
	function stopClean() { cleanNodes.forEach(function (n) { try { n.node.stop(); n.node.disconnect(); n.gain.disconnect(); } catch (e) { /* ignore */ } }); cleanNodes = []; }
	P.forgetClean = function (key) { delete cleanBufs[key]; };

	/* ---------- drawing ---------- */
	function source(c) {
		var m = VE.media(c.media); if (!m) return null;
		if (m.kind === "image") return m.bitmap ? { img: m.bitmap, w: m.w, h: m.h } : null;
		var e = els[c.id]; if (!e || e.el.readyState < 2) return P.lastFrame(c);
		return { img: e.el, w: m.w, h: m.h };
	}
	P.lastFrame = function () { return null; };
	function draw() { needDraw = true; if (!P.playing) requestAnimationFrame(paint); else paint(); }
	P.draw = draw;
	function paint() {
		if (!needDraw) return; needDraw = false;
		var W = cv.width, H = cv.height;
		VE.draw(ctx, W, H, VE.t, source);
		// selection frame
		var sel = VE.selected().filter(function (c) { return c.type !== "audio" && V.active(c, VE.t); });
		if (sel.length && !P.playing) {
			var c = sel[0], k = W / VE.P.w, r = VE.rectOf(ctx, c, VE.P.w, VE.P.h);
			if (r) {
				ctx.save(); ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(r.dx * k, r.dy * k, r.dw * k, r.dh * k); ctx.setLineDash([]);
				ctx.fillStyle = "#38bdf8"; [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (q) { ctx.fillRect(r.dx * k + q[0] * r.dw * k - 6, r.dy * k + q[1] * r.dh * k - 6, 12, 12); });
				ctx.restore();
			}
		}
		if (!VE.P.clips.length) {
			ctx.save(); ctx.fillStyle = "#94a3b8"; ctx.font = Math.round(H / 18) + "px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
			ctx.fillText("Add videos, sound or pictures, then drag them onto the timeline", W / 2, H / 2); ctx.restore();
		}
	}
	// canvas size follows the stage box and the project's shape
	function fit() {
		var bw = wrap.clientWidth || 640, bh = wrap.clientHeight || 360, a = VE.P.w / VE.P.h, w = bw, h = w / a;
		if (h > bh) { h = bh; w = h * a; }
		var dpr = Math.min(2, window.devicePixelRatio || 1), pw = Math.max(2, Math.min(VE.P.w, Math.round(w * dpr))), ph = Math.max(2, Math.round(pw / a));
		cv.style.width = Math.round(w) + "px"; cv.style.height = Math.round(h) + "px";
		if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
		draw();
	}
	P.fit = fit;
	if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap); else window.addEventListener("resize", fit);

	/* ---------- move / resize in the preview ---------- */
	var drag = null;
	function toProject(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * VE.P.w, y: (e.clientY - b.top) / b.height * VE.P.h }; }
	cv.addEventListener("pointerdown", function (e) {
		if (P.playing) P.pause();
		var pt = toProject(e), L = V.layersAt(VE.P, VE.t), hitC = null, corner = false, sel = VE.selected()[0];
		if (sel && sel.type !== "audio" && V.active(sel, VE.t)) {
			var r0 = VE.rectOf(ctx, sel, VE.P.w, VE.P.h), tol = 14 * VE.P.w / cv.getBoundingClientRect().width;
			if (r0) [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (q) { if (Math.abs(pt.x - (r0.dx + q[0] * r0.dw)) < tol && Math.abs(pt.y - (r0.dy + q[1] * r0.dh)) < tol) { hitC = sel; corner = true; } });
		}
		if (!hitC) for (var j = L.length - 1; j >= 0; j--) { var c = L[j].clip, tr = V.track(VE.P, c.track); if (tr && tr.lock) continue; var r = VE.rectOf(ctx, c, VE.P.w, VE.P.h); if (r && V.hit(r, pt.x, pt.y)) { hitC = c; break; } }
		if (!hitC) { VE.sel = []; VE.emit("select"); draw(); return; }
		if (VE.sel.indexOf(hitC.id) < 0) { VE.sel = [hitC.id]; VE.emit("select"); }
		var rr = VE.rectOf(ctx, hitC, VE.P.w, VE.P.h), cx = hitC.x * VE.P.w, cy = hitC.y * VE.P.h;
		drag = { c: hitC, corner: corner, x0: hitC.x, y0: hitC.y, s0: hitC.scale || 1, p0: pt, d0: Math.max(4, Math.hypot(pt.x - cx, pt.y - cy)), moved: false };
		cv.setPointerCapture(e.pointerId); e.preventDefault(); draw();
	});
	cv.addEventListener("pointermove", function (e) {
		if (!drag) { if (!P.playing) cv.style.cursor = "default"; return; }
		var pt = toProject(e), c = drag.c; drag.moved = true;
		if (drag.corner) {
			var cx = c.x * VE.P.w, cy = c.y * VE.P.h, d = Math.hypot(pt.x - cx, pt.y - cy);
			c.scale = V.clamp(Math.round(drag.s0 * d / drag.d0 * 1000) / 1000, 0.05, 8);
		} else {
			var nx = drag.x0 + (pt.x - drag.p0.x) / VE.P.w, ny = drag.y0 + (pt.y - drag.p0.y) / VE.P.h;
			if (!e.altKey) { if (Math.abs(nx - 0.5) < 0.012) nx = 0.5; if (Math.abs(ny - 0.5) < 0.012) ny = 0.5; }
			c.x = Math.round(nx * 10000) / 10000; c.y = Math.round(ny * 10000) / 10000;
		}
		VE.emit("live"); draw();
	});
	function end() { if (drag && drag.moved) VE.commit(drag.corner ? "Resize" : "Move"); drag = null; }
	cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
	cv.addEventListener("dblclick", function () { var c = VE.selected()[0]; if (c && c.type === "text") VE.emit("editText", c); });

	VE.on("change", function () { if (P.playing && !P.rev) { stopClean(); scheduleClean(); } fit(); sync(); draw(); });
	VE.on("select", draw); VE.on("mediaReady", function () { sync(); draw(); }); VE.on("thumbs", function () { });
	document.addEventListener("visibilitychange", function () { if (document.hidden && P.playing) P.pause(); });
})();
