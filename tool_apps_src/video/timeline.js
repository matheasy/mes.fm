/* MES Video Editor timeline: tracks (video above, audio below), clips with thumbnails / waveforms, drag to move (snapping, no overlaps),
 * drag an edge to trim, click / drag the ruler to move the playhead, Ctrl + wheel or the slider to zoom, I / O marks, drop media from the bin. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V, $ = function (id) { return document.getElementById(id); };
	var HEAD = 128, RULER = 26, ROWH = { v: 62, a: 46 };
	var sc = $("vd-tlscroll"), inner = $("vd-tlinner"), rulerC = $("vd-ruler"), rows = $("vd-rows"), ph = $("vd-playhead"), markEl = $("vd-markzone");
	var T = VE.tl = { snap: true };
	function x2t(clientX) { var b = sc.getBoundingClientRect(); return Math.max(0, (clientX - b.left + sc.scrollLeft - HEAD) / VE.pps); }
	function t2x(t) { return HEAD + t * VE.pps; }
	T.x2t = x2t;

	/* ---------- render ---------- */
	T.render = function () {
		var p = VE.P, dur = V.duration(p), total = Math.max(dur + 20, (sc.clientWidth - HEAD) / VE.pps + 5);
		inner.style.width = (HEAD + total * VE.pps) + "px";
		var html = "", sel = {}; VE.sel.forEach(function (i) { sel[i] = 1; });
		var nV = p.tracks.filter(function (t) { return t.kind === "v"; }).length, nA = p.tracks.length - nV;
		p.tracks.forEach(function (tr) {
			var h = ROWH[tr.kind], canDel = (tr.kind === "v" ? nV : nA) > 1 && !p.clips.some(function (c) { return c.track === tr.id; });
			html += '<div class="vd-row vd-row--' + tr.kind + (tr.hide || tr.mute ? " is-off" : "") + (tr.lock ? " is-lock" : "") + '" data-track="' + tr.id + '" style="height:' + h + 'px">' +
				'<div class="vd-thead"><span class="vd-tname" title="Double-click to rename">' + VE.esc(tr.name) + "</span><span class=\"vd-tbtns\">" +
				(tr.kind === "v" ? '<button type="button" data-tact="hide" aria-pressed="' + !!tr.hide + '" title="' + (tr.hide ? "Show" : "Hide") + ' this track">' + (tr.hide ? "&#128065;&#824;" : "&#128065;") + "</button>" : "") +
				'<button type="button" data-tact="mute" aria-pressed="' + !!tr.mute + '" title="' + (tr.mute ? "Unmute" : "Mute") + ' this track">' + (tr.mute ? "&#128263;" : "&#128266;") + "</button>" +
				'<button type="button" data-tact="lock" aria-pressed="' + !!tr.lock + '" title="' + (tr.lock ? "Unlock" : "Lock") + ' this track">' + (tr.lock ? "&#128274;" : "&#128275;") + "</button>" +
				(canDel ? '<button type="button" data-tact="del" title="Delete this empty track">&times;</button>' : "") + "</span></div><div class=\"vd-lane\">";
			V.onTrack(p, tr.id).forEach(function (c) {
				var m = VE.media(c.media), x = c.start * VE.pps, w = Math.max(4, V.dur(c) * VE.pps), label = c.type === "text" ? "T  " + (c.text && c.text.s || "").split("\n")[0] : m ? m.name : "(missing)";
				var badges = (c.speed && c.speed !== 1 ? c.speed + "×  " : "") + (c.clean && c.clean.key ? "✓ clean  " : "") + (c.mute ? "muted  " : "");
				html += '<div class="vd-clip vd-clip--' + c.type + (sel[c.id] ? " is-sel" : "") + (m && m.state === "missing" ? " is-missing" : "") + '" data-id="' + c.id + '" style="left:' + x + "px;width:" + w + 'px" title="' + VE.esc(label) + " · " + V.short(V.dur(c)) + '">' +
					(c.xin > 0 ? '<i class="vd-xf" style="width:' + c.xin * VE.pps + 'px"></i>' : "") +
					'<canvas class="vd-cc" width="' + Math.min(4000, Math.ceil(w)) + '" height="' + (h - 4) + '"></canvas><span class="vd-cl">' + VE.esc(badges + label) + "</span>" +
					(c.fin > 0 ? '<i class="vd-fade vd-fade--in" style="width:' + c.fin * VE.pps + 'px"></i>' : "") + (c.fout > 0 ? '<i class="vd-fade vd-fade--out" style="width:' + c.fout * VE.pps + 'px"></i>' : "") + "</div>";
			});
			html += "</div></div>";
		});
		rows.innerHTML = html;
		rows.querySelectorAll(".vd-clip").forEach(function (el) { paintClip(el); });
		var mk = p.marks || {};
		if (mk.in != null && mk.out != null && mk.out > mk.in) { markEl.hidden = false; markEl.style.left = t2x(mk.in) + "px"; markEl.style.width = (mk.out - mk.in) * VE.pps + "px"; }
		else markEl.hidden = true;
		drawRuler(); T.playhead();
	};
	function paintClip(el) {
		var c = V.clip(VE.P, el.getAttribute("data-id")); if (!c) return;
		var cv = el.querySelector("canvas"), g = cv.getContext("2d"), W = cv.width, H = cv.height, m = VE.media(c.media), k = W / Math.max(1, V.dur(c) * VE.pps);
		g.clearRect(0, 0, W, H);
		if (c.type === "video" && m && m.thumbImg && m.thumbTimes) {
			var th = H - (m.hasAudio ? 14 : 0), tw = Math.max(8, th * m.thumbW / m.thumbH);
			for (var x = 0; x < W; x += tw) {
				var s = V.srcAt(c, c.start + (x + tw / 2) / k / VE.pps), idx = nearest(m.thumbTimes, s);
				g.drawImage(m.thumbImg, idx * m.thumbW, 0, m.thumbW, m.thumbH, x, 0, tw, th);
			}
		} else if (c.type === "image" && m && m.bitmap) {
			var ih = H, iw = ih * m.w / m.h; for (var x2 = 0; x2 < W; x2 += iw + 6) g.drawImage(m.bitmap, x2, 0, iw, ih);
		}
		if ((c.type === "video" || c.type === "audio") && m && m.peaks) {
			var top = c.type === "audio" ? 0 : H - 14, hh = c.type === "audio" ? H : 14, mid = top + hh / 2, gain = Math.min(2, c.vol == null ? 1 : c.vol);
			g.fillStyle = c.type === "audio" ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.75)"; if (c.type !== "audio") { g.fillStyle = "rgba(2,6,23,0.55)"; g.fillRect(0, top, W, hh); g.fillStyle = "#7dd3fc"; } else g.fillStyle = "rgba(255,255,255,0.8)";
			for (var px = 0; px < W; px++) {
				var s0 = V.srcAt(c, c.start + px / k / VE.pps), s1 = V.srcAt(c, c.start + (px + 1) / k / VE.pps), i0 = Math.floor(s0 * 50), i1 = Math.max(i0 + 1, Math.floor(s1 * 50)), mx = 0;
				for (var i = i0; i < i1 && i < m.peaks.length; i++) if (m.peaks[i] > mx) mx = m.peaks[i];
				var a = Math.min(1, mx / 255 * gain) * hh / 2 * (c.mute ? 0.25 : 1); if (a > 0.3) g.fillRect(px, mid - a, 1, a * 2);
			}
		}
	}
	function nearest(arr, v) { var lo = 0, hi = arr.length - 1; while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; } if (lo > 0 && Math.abs(arr[lo - 1] - v) < Math.abs(arr[lo] - v)) lo--; return lo; }
	function drawRuler() {
		var w = sc.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
		rulerC.width = Math.round(w * dpr); rulerC.height = Math.round(RULER * dpr); rulerC.style.width = w + "px"; rulerC.style.left = sc.scrollLeft + "px";
		var g = rulerC.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, RULER);
		var step = V.tickStep(VE.pps, 80), t0 = Math.max(0, (sc.scrollLeft - HEAD) / VE.pps), t1 = t0 + w / VE.pps, sub = step / 5;
		g.fillStyle = getComputedStyle(rulerC).color || "#cbd5e1"; g.font = "11px Arial, sans-serif"; g.textBaseline = "top";
		for (var t = Math.floor(t0 / sub) * sub; t <= t1 + step; t += sub) {
			var x = t2x(t) - sc.scrollLeft; if (x < HEAD - 1) continue;
			var major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
			g.fillRect(Math.round(x), major ? 12 : 19, 1, major ? 14 : 7);
			if (major) g.fillText(step < 1 ? V.tc(t, VE.P.fps) : V.short(t).replace(/\.0$/, ""), x + 3, 1);
		}
		var mk = VE.P.marks || {};
		[["in", "I"], ["out", "O"]].forEach(function (q) { var v = mk[q[0]]; if (v == null) return; var x = t2x(v) - sc.scrollLeft; if (x < HEAD) return; g.fillStyle = "#facc15"; g.fillRect(x - 1, 0, 2, RULER); g.fillText(q[1], x + 3, 13); });
	}
	T.playhead = function () {
		var x = t2x(VE.t); ph.style.left = x + "px";
		if (VE.preview && VE.preview.playing) { var v0 = sc.scrollLeft + HEAD, v1 = sc.scrollLeft + sc.clientWidth; if (x > v1 - 40 || x < v0) sc.scrollLeft = Math.max(0, x - HEAD - 60); }
	};
	sc.addEventListener("scroll", function () { drawRuler(); });
	T.zoom = function (pps, aroundClientX) {
		var old = VE.pps, b = sc.getBoundingClientRect(), ax = aroundClientX == null ? b.left + HEAD + (sc.clientWidth - HEAD) / 2 : aroundClientX, at = x2t(ax);
		VE.pps = V.clamp(pps, 1, 600); T.render();
		sc.scrollLeft = Math.max(0, HEAD + at * VE.pps - (ax - b.left));
		VE.emit("zoom", VE.pps); if (old !== VE.pps) { /* slider follows */ }
	};
	T.fit = function () { var d = V.duration(VE.P) || 10; T.zoom((sc.clientWidth - HEAD - 30) / d); sc.scrollLeft = 0; };
	sc.addEventListener("wheel", function (e) {
		if (!(e.ctrlKey || e.metaKey)) return;
		e.preventDefault(); T.zoom(VE.pps * Math.pow(1.0015, -e.deltaY), e.clientX);
	}, { passive: false });

	/* ---------- pointer: playhead, select, move, trim ---------- */
	var drag = null;
	function snapPts(ignore) { return V.snapPoints(VE.P, ignore, [VE.t]); }
	inner.addEventListener("pointerdown", function (e) {
		if (e.button > 0) return;
		var tb = e.target.closest("[data-tact]"); if (tb) return trackAction(tb);
		if (e.target.closest(".vd-thead")) return;
		var clipEl = e.target.closest(".vd-clip"), t = x2t(e.clientX);
		if (e.target.closest("#vd-rulerwrap") || !clipEl) {
			if (!e.target.closest("#vd-rulerwrap") && !e.shiftKey) { VE.sel = []; VE.emit("select"); }
			drag = { mode: "scrub" }; VE.preview.seek(t); inner.setPointerCapture(e.pointerId); e.preventDefault(); return;
		}
		var c = V.clip(VE.P, clipEl.getAttribute("data-id")); if (!c) return;
		var tr = V.track(VE.P, c.track);
		if (e.shiftKey || e.ctrlKey || e.metaKey) { var i = VE.sel.indexOf(c.id); if (i >= 0) VE.sel.splice(i, 1); else VE.sel.push(c.id); }
		else if (VE.sel.indexOf(c.id) < 0) VE.sel = [c.id];
		VE.emit("select"); markSel();
		if (tr && tr.lock) return;
		var r = clipEl.getBoundingClientRect(), edge = e.clientX - r.left < 7 ? "l" : r.right - e.clientX < 7 ? "r" : null;
		if (r.width < 22) edge = null;
		var group = VE.selected().filter(function (x) { var q = V.track(VE.P, x.track); return !(q && q.lock); });
		drag = { mode: edge ? "trim" : "move", edge: edge, c: c, x0: e.clientX, t0: t, orig: group.map(function (x) { return { c: x, start: x.start, in: x.in, out: x.out, track: x.track }; }), moved: false, el: clipEl };
		inner.setPointerCapture(e.pointerId); e.preventDefault();
	});
	inner.addEventListener("pointermove", function (e) {
		if (!drag) { var ce = e.target.closest && e.target.closest(".vd-clip"); if (ce) { var r = ce.getBoundingClientRect(); ce.style.cursor = (r.width >= 22 && (e.clientX - r.left < 7 || r.right - e.clientX < 7)) ? "ew-resize" : "grab"; } return; }
		if (drag.mode === "scrub") { VE.preview.seek(x2t(e.clientX)); return; }
		var dx = e.clientX - drag.x0; if (!drag.moved && Math.abs(dx) < 3 && drag.mode === "move" && !rowAt(e.clientY, drag.c)) return;
		drag.moved = true; var dt = dx / VE.pps, ign = {}; drag.orig.forEach(function (o) { ign[o.c.id] = 1; });
		if (drag.mode === "trim") {
			var c = drag.c, o = drag.orig.filter(function (q) { return q.c === c; })[0] || { start: c.start, in: c.in, out: c.out };
			Object.assign(c, { start: o.start, in: o.in, out: o.out });
			var want = (drag.edge === "l" ? o.start : V.end(c)) + dt;
			if (T.snap && !e.altKey) want = V.snap(want, snapPts(ign), 8 / VE.pps).t;
			var nb = V.onTrack(VE.P, c.track).filter(function (x) { return x !== c; }), lo = 0, hi = Infinity;
			nb.forEach(function (x) { if (V.end(x) <= o.start + 1e-4) lo = Math.max(lo, V.end(x)); if (x.start >= V.end(c) - 1e-4) hi = Math.min(hi, x.start); });
			Object.assign(c, V.trim(c, drag.edge, want, { mediaDur: VE.mediaDur(c), lo: lo, hi: hi, minDur: 1 / VE.P.fps }));
		} else {
			// move: the clip under the pointer snaps, the others keep their distance; a single clip may change track
			var p0 = drag.orig.filter(function (q) { return q.c === drag.c; })[0], ns = Math.max(0, p0.start + dt);
			if (T.snap && !e.altKey) { var d = V.dur(drag.c), pts = snapPts(ign), a = V.snap(ns, pts, 8 / VE.pps), b = V.snap(ns + d, pts, 8 / VE.pps); if (a.snapped) ns = a.t; else if (b.snapped) ns = b.t - d; }
			var shift = ns - p0.start; drag.orig.forEach(function (o) { if (o.start + shift < 0) shift = -o.start; });
			var newTrack = drag.orig.length === 1 ? rowAt(e.clientY, drag.c) : null;
			drag.orig.forEach(function (o) { o.c.start = o.start + shift; o.c.track = newTrack || o.track; });
			drag.bad = drag.orig.some(function (o) { return !V.canPlace(VE.P, o.c.track, o.c.start, V.dur(o.c), ign); });
			if (drag.bad && drag.orig.length === 1) { var f = V.fitOnTrack(VE.P, drag.c.track, drag.c.start, V.dur(drag.c), ign); if (f != null && Math.abs(f - drag.c.start) < 2.5 * Math.max(1, V.dur(drag.c))) { drag.c.start = f; drag.bad = false; } }
		}
		T.render(); var el = rows.querySelector('.vd-clip[data-id="' + drag.c.id + '"]'); if (el && drag.bad) el.classList.add("is-bad");
		VE.emit("live");
	});
	function rowAt(clientY, c) {
		var row = null; rows.querySelectorAll(".vd-row").forEach(function (r) { var b = r.getBoundingClientRect(); if (clientY >= b.top && clientY < b.bottom) row = r; });
		if (!row) return null; var tr = V.track(VE.P, row.getAttribute("data-track"));
		return tr && !tr.lock && tr.kind === V.kindFor(c.type) ? tr.id : null;
	}
	function finish() {
		if (!drag) return;
		var d = drag; drag = null;
		if (d.mode === "scrub" || !d.moved) { T.render(); return; }
		if (d.bad) { d.orig.forEach(function (o) { Object.assign(o.c, { start: o.start, in: o.in, out: o.out, track: o.track }); }); T.render(); VE.emit("notice", "There is no room there: clips on one track cannot overlap."); return; }
		VE.commit(d.mode === "trim" ? "Trim" : "Move");
	}
	inner.addEventListener("pointerup", finish); inner.addEventListener("pointercancel", finish);
	function markSel() { var s = {}; VE.sel.forEach(function (i) { s[i] = 1; }); rows.querySelectorAll(".vd-clip").forEach(function (el) { el.classList.toggle("is-sel", !!s[el.getAttribute("data-id")]); }); }
	T.markSel = markSel;
	function trackAction(b) {
		var row = b.closest(".vd-row"), tr = V.track(VE.P, row.getAttribute("data-track")), a = b.getAttribute("data-tact");
		if (a === "del") { VE.P.tracks = VE.P.tracks.filter(function (x) { return x !== tr; }); VE.commit("Delete track"); return; }
		tr[a] = !tr[a]; VE.commit(a === "hide" ? "Hide track" : a === "mute" ? "Mute track" : "Lock track");
	}
	rows.addEventListener("dblclick", function (e) {
		var n = e.target.closest(".vd-tname"); if (n) { var tr = V.track(VE.P, n.closest(".vd-row").getAttribute("data-track")), nm = window.prompt("Track name", tr.name); if (nm) { tr.name = nm.slice(0, 40); VE.commit("Rename track"); } return; }
		var ce = e.target.closest(".vd-clip"); if (ce) { var c = V.clip(VE.P, ce.getAttribute("data-id")); if (c && c.type === "text") VE.emit("editText", c); }
	});

	/* ---------- dropping media from the bin ---------- */
	// place media m at the time under clientX on the row under clientY (or the first fitting track); returns the new clip
	T.placeMedia = function (m, clientX, clientY, atTime) {
		var type = m.kind === "image" ? "image" : m.kind === "audio" ? "audio" : "video", kind = V.kindFor(type);
		var t = atTime != null ? atTime : clientX != null ? x2t(clientX) : VE.t, tr = null;
		if (clientY != null) { var row = null; rows.querySelectorAll(".vd-row").forEach(function (r) { var b = r.getBoundingClientRect(); if (clientY >= b.top && clientY < b.bottom) row = r; }); if (row) { var q = V.track(VE.P, row.getAttribute("data-track")); if (q && q.kind === kind && !q.lock) tr = q; } }
		var dur = type === "image" ? 5 : m.dur;
		var tracks = tr ? [tr] : VE.P.tracks.filter(function (x) { return x.kind === kind && !x.lock; });
		if (kind === "v" && !tr) tracks = tracks.slice().reverse();   // pictures go on the lowest free video track first
		var c = V.clipDefaults({ id: V.uid("c"), type: type, media: m.id, track: null, start: 0, in: 0, out: dur });
		for (var j = 0; j < tracks.length; j++) { var s = V.fitOnTrack(VE.P, tracks[j].id, Math.max(0, t), dur); if (s != null && (tr || Math.abs(s - t) < 1e-6)) { c.track = tracks[j].id; c.start = s; break; } }
		if (!c.track) { var nt = VE.addTrack(kind); c.track = nt.id; c.start = Math.max(0, t); }
		if (type === "image" && m.w && m.h) c.scale = Math.min(1, 1 / Math.min(VE.P.w / m.w, VE.P.h / m.h));   // a picture comes in at its own pixel size (at most the frame)
		VE.P.clips.push(c); VE.sel = [c.id];
		if (VE.P.clips.length === 1 && type === "video" && m.w) setProjectFromMedia(m);
		VE.commit("Add " + m.name);
		return c;
	};
	// append clips one after another at the end of a track (merging many videos in order)
	T.appendAll = function (list) {
		var vid = list.filter(function (m) { return m.kind !== "audio"; }), aud = list.filter(function (m) { return m.kind === "audio"; });
		var vtr = VE.P.tracks.filter(function (x) { return x.kind === "v" && !x.lock; }).slice(-1)[0], atr = VE.P.tracks.filter(function (x) { return x.kind === "a" && !x.lock; })[0];
		[[vid, vtr], [aud, atr]].forEach(function (q) {
			if (!q[0].length) return; var tr = q[1] || VE.addTrack(q[0][0].kind === "audio" ? "a" : "v");
			var at = V.onTrack(VE.P, tr.id).reduce(function (a, c) { return Math.max(a, V.end(c)); }, 0);
			q[0].forEach(function (m) {
				var type = m.kind === "image" ? "image" : m.kind === "audio" ? "audio" : "video", dur = type === "image" ? 5 : m.dur;
				var c = V.clipDefaults({ id: V.uid("c"), type: type, media: m.id, track: tr.id, start: at, in: 0, out: dur }); VE.P.clips.push(c); at += dur;
				if (VE.P.clips.length === 1 && type === "video" && m.w) setProjectFromMedia(m);
			});
		});
		VE.commit("Add " + list.length + " clips");
	};
	function setProjectFromMedia(m) { VE.P.w = Math.max(2, Math.round(m.w / 2) * 2); VE.P.h = Math.max(2, Math.round(m.h / 2) * 2); VE.P.fps = Math.round((m.fps || 30) * 100) / 100 > 59 ? 60 : Math.abs(m.fps - 29.97) < 0.005 ? 29.97 : Math.max(10, Math.round(m.fps || 30)); VE.emit("notice", "The project took the size of the first video: " + VE.P.w + "×" + VE.P.h + ", " + VE.P.fps + " fps (change it under Project)."); }
	VE.addTrack = function (kind) {
		var n = VE.P.tracks.filter(function (t) { return t.kind === kind; }).length + 1, tr = { id: V.uid(kind), kind: kind, name: (kind === "v" ? "Video " : "Audio ") + n };
		if (kind === "v") { var i = 0; VE.P.tracks.splice(i, 0, tr); } else VE.P.tracks.push(tr);
		return tr;
	};
	T.dragHint = function (clientX, clientY, on) {
		inner.classList.toggle("is-drop", !!on);
		if (on && clientX != null) { var t = x2t(clientX); $("vd-dropline").hidden = false; $("vd-dropline").style.left = t2x(t) + "px"; } else $("vd-dropline").hidden = true;
	};
	T.inside = function (clientX, clientY) { var b = sc.getBoundingClientRect(); return clientX >= b.left && clientX <= b.right && clientY >= b.top && clientY <= b.bottom; };

	VE.on("change", function () { T.render(); });
	VE.on("thumbs", function (m) { rows.querySelectorAll(".vd-clip").forEach(function (el) { var c = V.clip(VE.P, el.getAttribute("data-id")); if (c && c.media === m.id) paintClip(el); }); });
	VE.on("time", function () { T.playhead(); });
	VE.on("select", markSel);
	if (window.ResizeObserver) new ResizeObserver(function () { drawRuler(); }).observe(sc);
})();
