/* MES Video Editor timeline: tracks (video above, audio below), clips with thumbnails / waveforms, drag to move (snapping, no overlaps),
 * drag an edge to trim, click / drag the ruler to move the playhead, Ctrl + wheel or the slider to zoom, I / O marks, drop media from the bin. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V, $ = function (id) { return document.getElementById(id); };
	var HEAD = 150, RULER = 26;
	var sc = $("vd-tlscroll"), inner = $("vd-tlinner"), rulerC = $("vd-ruler"), rows = $("vd-rows"), ph = $("vd-playhead"), markEl = $("vd-markzone");
	var T = VE.tl = { snap: true, wave: "db" };
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
			var h = V.rowH(tr), canDel = (tr.kind === "v" ? nV : nA) > 1 && !p.clips.some(function (c) { return c.track === tr.id; });
			html += '<div class="vd-trow vd-trow--' + tr.kind + (tr.hide || tr.mute ? " is-off" : "") + (tr.lock ? " is-lock" : "") + (tr.mag ? " is-mag" : "") + '" data-track="' + tr.id + '" style="height:' + h + 'px">' +
				'<div class="vd-thead"><span class="vd-tgrip" title="Drag to move this track up or down" aria-hidden="true"></span><span class="vd-tname" title="Double-click to rename. Drag the empty part of this header up or down to move the track; right-click for more">' + VE.esc(tr.name) + "</span><span class=\"vd-tbtns\">" +
				(tr.kind === "v" ? '<button type="button" data-tact="hide" aria-pressed="' + !!tr.hide + '" title="' + (tr.hide ? "Show" : "Hide") + ' this track">' + (tr.hide ? "&#128065;&#824;" : "&#128065;") + "</button>" : "") +
				'<button type="button" data-tact="mute" aria-pressed="' + !!tr.mute + '" title="' + (tr.mute ? "Unmute" : "Mute") + ' this track">' + (tr.mute ? "&#128263;" : "&#128266;") + "</button>" +
				'<button type="button" data-tact="lock" aria-pressed="' + !!tr.lock + '" title="' + (tr.lock ? "Unlock" : "Lock") + ' this track">' + (tr.lock ? "&#128274;" : "&#128275;") + "</button>" +
				'<button type="button" data-tact="mag" aria-pressed="' + !!tr.mag + '" title="' + (tr.mag ? "Magnetic track: clips close up with no gaps (click to turn off)" : "Make this track magnetic: clips close up to the left with no gaps") + '"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 2h3v6a2 2 0 0 0 4 0V2h3v6a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M3 2h3v2H3zM10 2h3v2h-3z" fill="#f87171"/></svg></button>' +
				(canDel ? '<button type="button" data-tact="del" title="Delete this empty track">&times;</button>' : "") + "</span>" + (h >= 70 && tr.kind === "a" ? '<span class="vd-tsub">' + (T.wave === "db" ? "dB scale" : "linear scale") + "</span>" : "") + "</div><div class=\"vd-lane\">";
			V.onTrack(p, tr.id).forEach(function (c) {
				var m = VE.media(c.media), x = c.start * VE.pps, w = Math.max(4, V.dur(c) * VE.pps), label = c.type === "text" ? "T  " + (c.text && c.text.s || "").split("\n")[0] : m && m.state !== "missing" ? m.name : "⚠ missing file (fix it in Media)";
				var badges = (c.link ? "🔗 " : "") + (c.speed && c.speed !== 1 ? c.speed + "×  " : "") + (c.clean && c.clean.key ? "✓ clean  " : "") + (V.afxOn(c) ? "fx  " : "") + (c.mute ? "muted  " : "") + (c.type === "video" && c.noAudio ? "no sound  " : "");
				html += '<div class="vd-clip vd-clip--' + c.type + (sel[c.id] ? " is-sel" : "") + (m && m.state === "missing" ? " is-missing" : "") + '" data-id="' + c.id + '" style="left:' + x + "px;width:" + w + 'px" title="' + VE.esc(label) + " · " + V.short(V.dur(c)) + (V.hasSource(c) ? " · from " + VE.esc(V.srcText(c, p.fps)) + " of the file" : "") + '">' +
					(c.xin > 0 ? '<i class="vd-xf" style="width:' + c.xin * VE.pps + 'px"></i>' : "") +
					'<canvas class="vd-cc" data-h="' + (h - 4) + '"></canvas><span class="vd-cl">' + VE.esc(badges + label) + "</span>" + (V.hasSource(c) && w >= 150 && h >= 40 ? '<span class="vd-cst">' + VE.esc(V.srcText(c, p.fps)) + "</span>" : "") +
					(c.fin > 0 ? '<i class="vd-fade vd-fade--in" style="width:' + c.fin * VE.pps + 'px"></i>' : "") + (c.fout > 0 ? '<i class="vd-fade vd-fade--out" style="width:' + c.fout * VE.pps + 'px"></i>' : "") + animMarks(c, w) + "</div>";
			});
			html += '</div><i class="vd-rgrip" data-rgrip="' + tr.id + '" title="Drag the top edge to make this track taller or shorter (double-click: normal height)"></i></div>';
		});
		rows.innerHTML = html;
		rows.querySelectorAll(".vd-clip").forEach(function (el) { paintClip(el, true); });
		var mk = p.marks || {};
		if (mk.in != null && mk.out != null && mk.out > mk.in) { markEl.hidden = false; markEl.style.left = t2x(mk.in) + "px"; markEl.style.width = (mk.out - mk.in) * VE.pps + "px"; }
		else markEl.hidden = true;
		drawRuler(); T.playhead();
	};
	// each animation is an arrow along the top of its clip: a dot at its start, an arrowhead at its end
	function animMarks(c, w) {
		if (!c.anims || c.type === "audio") return "";
		return c.anims.map(function (a, i) {
			var x = a.t * VE.pps, aw = Math.max(10, a.d * VE.pps); if (x + aw < 0 || x > w) return "";
			return '<i class="vd-an-mk' + (VE.animSel === a.id ? " is-sel" : "") + '" data-aid="' + VE.esc(a.id) + '" style="left:' + x + "px;width:" + aw + "px;top:" + (2 + (i % 2) * 13) + 'px" title="' + VE.esc(V.animName(a)) + " · " + (Math.round(a.d * 100) / 100) + ' s. Drag to move, drag an end to change its length, click to jump to its end."><u></u><s></s><b></b></i>';
		}).join("");
	}
	// the canvas only covers the part of the clip that is on screen (plus a screen on each side), drawn at real size: a long clip zoomed
	// in is never one huge stretched picture. Scrolling repaints a clip when the view leaves the part it has painted.
	function view() { var m = sc.clientWidth || 800; return { v0: sc.scrollLeft - HEAD - m, v1: sc.scrollLeft - HEAD + 2 * m }; }
	function paintClip(el, force) {
		var c = V.clip(VE.P, el.getAttribute("data-id")); if (!c) return;
		var cv = el.querySelector("canvas"), m = VE.media(c.media), x0 = c.start * VE.pps, w = Math.max(4, V.dur(c) * VE.pps), vw = view();
		var a = Math.max(0, Math.floor(vw.v0 - x0)), b = Math.min(Math.ceil(w), Math.ceil(vw.v1 - x0));
		if (!force && cv._a != null && cv._a <= Math.max(0, sc.scrollLeft - HEAD - x0) && cv._b >= Math.min(w, sc.scrollLeft - HEAD + sc.clientWidth - x0)) return;
		if (b <= a) { cv.style.display = "none"; cv._a = cv._b = null; return; }
		var dpr = Math.min(2, window.devicePixelRatio || 1), H = +cv.getAttribute("data-h") || el.clientHeight, W = b - a;
		cv.style.display = ""; cv.style.left = a + "px"; cv.style.width = W + "px"; cv.style.right = "auto";
		cv.width = Math.min(16384, Math.round(W * dpr)); cv.height = Math.round(H * dpr); cv._a = a; cv._b = b;
		var g = cv.getContext("2d"); g.setTransform(cv.width / W, 0, 0, dpr, -a * cv.width / W, 0); g.clearRect(a, 0, W, H);
		if (c.type === "video" && m && m.thumbImg && m.thumbTimes) {
			var th = H - (VE.hasSound(c) ? 18 : 0), tw = Math.max(8, th * m.thumbW / m.thumbH);
			for (var x = Math.floor(a / tw) * tw; x < b; x += tw) {
				var s = V.srcAt(c, c.start + (x + tw / 2) / VE.pps), idx = nearest(m.thumbTimes, s);
				g.drawImage(m.thumbImg, idx * m.thumbW, 0, m.thumbW, m.thumbH, x, 0, tw, th);
			}
		} else if (c.type === "image" && m && m.bitmap) {
			var ih = H, iw = ih * m.w / m.h; for (var x2 = Math.floor(a / (iw + 6)) * (iw + 6); x2 < b; x2 += iw + 6) g.drawImage(m.bitmap, x2, 0, iw, ih);
		}
		if (VE.hasSound(c) && m && (m.wave || m.peaks)) {
			var big = c.type === "audio", hh = big ? H : 18, top = big ? 0 : H - 18;
			if (!big) { g.fillStyle = "rgba(2,6,23,0.6)"; g.fillRect(a, top, W, hh); }
			paintWave(g, c, m, a, b, top, hh, big);
		}
	}
	var scrollRaf = 0;
	function repaintVisible() { scrollRaf = 0; rows.querySelectorAll(".vd-clip").forEach(function (el) { paintClip(el); }); }
	// peak (light) and RMS (solid) of the clip's sound, mirrored; dB scale by default so quiet parts show too. With audio effects on, the
	// original is drawn faint and the processed sound over it; red ticks where it would clip
	function paintWave(g, c, m, A, B, top, hh, big) {
		var mode = T.wave, mid = top + hh / 2, half = hh / 2 - 1, vdb = V.db(c.vol == null ? 1 : c.vol), env = V.afxOn(c) ? VE.fxEnv(c) : null, w = m.wave, wr = (m.wave && m.wave.r) || 50, dim = c.mute ? 0.35 : 1;
		if (!isFinite(vdb)) vdb = -120;
		if (big && hh >= 56) {
			g.save(); g.font = "9px Arial, sans-serif"; g.textBaseline = "middle";
			(mode === "db" ? [0, -6, -12, -24, -48] : [0, -6, -12]).forEach(function (d) {
				var y = V.waveY(d, mode) * half; g.fillStyle = d === 0 ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.10)";
				g.fillRect(A, Math.round(mid - y), B - A, 1); g.fillRect(A, Math.round(mid + y), B - A, 1);
				if (d < 0 && y > 9 && y < half - 4) { g.fillStyle = "rgba(255,255,255,0.5)"; g.fillText(String(d), Math.max(3, sc.scrollLeft - HEAD - c.start * VE.pps + 3), mid - y + 6); }
			});
			g.restore();
		}
		g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(A, Math.round(mid), B - A, 1);
		var cols = env ? ["rgba(255,255,255,0.16)", "rgba(110,231,183,0.75)", "#d1fae5"] : big ? [null, "rgba(110,231,183,0.62)", "#a7f3d0"] : [null, "rgba(125,211,252,0.55)", "#7dd3fc"];
		// zoomed in past the stored 200-a-second levels: work each pixel out from the decoded sound itself, so it stays sharp
		var fine = Math.abs(V.srcAt(c, c.start + (A + 1) / VE.pps) - V.srcAt(c, c.start + A / VE.pps)) < 1 / 160;
		for (var px = A; px < B; px++) {
			var s0 = V.srcAt(c, c.start + px / VE.pps), s1 = V.srcAt(c, c.start + (px + 1) / VE.pps), i0 = Math.max(0, Math.floor(s0 * (w ? wr : 50))), i1 = Math.max(i0 + 1, Math.floor(s1 * (w ? wr : 50))), pk = -Infinity, rm = -Infinity;
			var buf = fine ? VE.pcmNow(m, s0) : null;
			if (buf) {
				var j0 = Math.max(0, Math.floor((s0 - buf.start) * buf.rate)), j1 = Math.max(j0 + 1, Math.ceil((s1 - buf.start) * buf.rate)), mx = 0, e = 0, cnt = 0;
				for (var ch = 0; ch < buf.ch.length; ch++) { var xs = buf.ch[ch]; for (var j = j0, je = Math.min(xs.length, j1); j < je; j++) { var v = xs[j]; e += v * v; cnt++; if (v > mx) mx = v; else if (-v > mx) mx = -v; } }
				if (!cnt) continue;
				pk = V.db(mx); rm = V.db(Math.sqrt(e / cnt));
			} else if (w) { for (var i = i0; i < i1 && i < w.pk.length; i++) { var a = V.decDb(w.pk[i]), b = V.decDb(w.rms[i]); if (a > pk) pk = a; if (b > rm) rm = b; } }
			else { var mx = 0; for (var i2 = i0; i2 < i1 && i2 < m.peaks.length; i2++) if (m.peaks[i2] > mx) mx = m.peaks[i2]; pk = V.db(Math.pow(mx / 255, 2)); rm = pk - 9; }
			if (!isFinite(pk)) continue;
			pk += vdb; rm += vdb;
			var eg = env ? V.db(V.envAt(env, (s0 + s1) / 2)) : 0, ph = V.waveY(pk + eg, mode) * half * dim, rh = V.waveY(rm + eg, mode) * half * dim;
			if (env) { var oh = V.waveY(pk, mode) * half * dim; g.fillStyle = cols[0]; g.fillRect(px, mid - oh, 1, oh * 2); }
			if (ph > 0.3) { g.fillStyle = cols[1]; g.fillRect(px, mid - ph, 1, ph * 2); }
			if (rh > 0.3) { g.fillStyle = cols[2]; g.fillRect(px, mid - rh, 1, rh * 2); }
			if (big && pk + eg > -0.5) { g.fillStyle = "#ef4444"; g.fillRect(px, top, 1, 3); g.fillRect(px, top + hh - 3, 1, 3); }
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
	// scroll the timeline so time t is on screen (keyboard / button jumps)
	T.reveal = function (t) { var x = t2x(t), v0 = sc.scrollLeft + HEAD, v1 = sc.scrollLeft + sc.clientWidth; if (x < v0 + 20 || x > v1 - 20) sc.scrollLeft = Math.max(0, x - HEAD - (sc.clientWidth - HEAD) / 3); };
	sc.addEventListener("scroll", function () { drawRuler(); if (!scrollRaf) scrollRaf = requestAnimationFrame(repaintVisible); });
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

	/* ---------- pointer: playhead, select, move, trim, track height ---------- */
	var drag = null;
	function snapPts(ignore) { return V.snapPoints(VE.P, ignore, [VE.t]); }
	function unlocked(c) { var q = V.track(VE.P, c.track); return !(q && q.lock); }
	inner.addEventListener("pointerdown", function (e) {
		if (e.button > 0) return;
		var tb = e.target.closest("[data-tact]"); if (tb) return trackAction(tb);
		var rg = e.target.closest("[data-rgrip]");
		if (rg) { var rtr = V.track(VE.P, rg.getAttribute("data-rgrip")); drag = { mode: "rowh", tr: rtr, y0: e.clientY, h0: V.rowH(rtr), moved: false }; inner.setPointerCapture(e.pointerId); e.preventDefault(); return; }
		var th = e.target.closest(".vd-thead");
		if (th) {   // drag a track's header up / down to reorder the tracks (video tracks stay among video tracks, sound among sound)
			if (e.target.closest("button, .vd-tname") && !e.target.closest(".vd-tgrip")) return;
			var hrow = th.closest(".vd-trow"), all = [].slice.call(rows.querySelectorAll(".vd-trow"));
			drag = { mode: "track", tr: V.track(VE.P, hrow.getAttribute("data-track")), y0: e.clientY, moved: false, row: hrow, all: all, from: all.indexOf(hrow), to: all.indexOf(hrow),
				rects: all.map(function (r) { var b = r.getBoundingClientRect(); return { top: b.top, h: b.height, kind: V.track(VE.P, r.getAttribute("data-track")).kind }; }) };
			inner.setPointerCapture(e.pointerId); e.preventDefault(); return;
		}
		var mk = e.target.closest(".vd-an-mk");
		if (mk) {
			var mc = V.clip(VE.P, mk.closest(".vd-clip").getAttribute("data-id")), ma = mc && (mc.anims || []).filter(function (x) { return x.id === mk.getAttribute("data-aid"); })[0];
			if (ma) {
				VE.sel = [mc.id]; VE.animSel = ma.id; VE.emit("select");
				var mr = mk.getBoundingClientRect(), medge = mr.width >= 18 && e.clientX - mr.left < 6 ? "l" : mr.width >= 18 && mr.right - e.clientX < 7 ? "r" : null, mtr = V.track(VE.P, mc.track);
				drag = { mode: "anim", c: mc, a: ma, edge: medge, x0: e.clientX, t0: ma.t, d0: ma.d, moved: false, locked: !!(mtr && mtr.lock) };
				inner.setPointerCapture(e.pointerId); e.preventDefault(); return;
			}
		}
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
		var prim = VE.selected().filter(unlocked), ids = e.altKey ? prim.map(function (x) { return x.id; }) : V.withLinks(VE.P, prim.map(function (x) { return x.id; }));   // linked partners move along (Alt: just this clip)
		var group = ids.map(function (id) { return V.clip(VE.P, id); }).filter(function (x) { return x && unlocked(x); });
		drag = { mode: edge ? "trim" : "move", edge: edge, c: c, x0: e.clientX, t0: t, snap: JSON.stringify(VE.P), prim: prim.length, orig: group.map(function (x) { return { c: x, start: x.start, in: x.in, out: x.out, track: x.track, anims: x.anims ? JSON.stringify(x.anims) : null }; }), moved: false, el: clipEl };
		inner.setPointerCapture(e.pointerId); e.preventDefault();
	});
	function mag(id) { var q = V.track(VE.P, id); return !!(q && q.mag); }
	inner.addEventListener("pointermove", function (e) {
		if (!drag) { var ce = e.target.closest && e.target.closest(".vd-clip"); if (ce) { var r = ce.getBoundingClientRect(); ce.style.cursor = (r.width >= 22 && (e.clientX - r.left < 7 || r.right - e.clientX < 7)) ? "ew-resize" : "grab"; } return; }
		if (drag.mode === "scrub") { VE.preview.seek(x2t(e.clientX)); return; }
		if (drag.mode === "anim") {
			var ddx = e.clientX - drag.x0; if (drag.locked || (!drag.moved && Math.abs(ddx) < 3)) return; drag.moved = true;
			var ac = drag.c, aa = drag.a, len = V.dur(ac), dta = ddx / VE.pps, lo = Math.min(0, drag.t0), sn = T.snap && !e.altKey ? 8 / VE.pps : 0;
			function snapRel(r) { if (!sn) return r; var pts = [VE.t - ac.start, 0, len]; (ac.anims || []).forEach(function (o) { if (o !== aa) pts.push(o.t, o.t + o.d); }); return V.snap(r, pts, sn).t; }
			if (drag.edge === "l") { var end = drag.t0 + drag.d0, nt = V.clamp(snapRel(drag.t0 + dta), lo, end - 0.05); aa.t = nt; aa.d = end - nt; }
			else if (drag.edge === "r") { var ne = V.clamp(snapRel(drag.t0 + drag.d0 + dta), drag.t0 + 0.05, Math.max(len, drag.t0 + drag.d0)); aa.d = ne - drag.t0; }
			else { var st = drag.t0 + dta, s1 = snapRel(st), s2 = snapRel(st + drag.d0) - drag.d0; st = Math.abs(s1 - st) <= Math.abs(s2 - st) ? s1 : s2; aa.t = V.clamp(st, lo, Math.max(lo, len - drag.d0)); }
			aa.t = Math.round(aa.t * 1e4) / 1e4; aa.d = Math.round(aa.d * 1e4) / 1e4;
			T.render(); VE.preview.draw(); VE.emit("live"); return;
		}
		if (drag.mode === "track") {
			// the grabbed row follows the pointer; the rows it passes slide out of its way; the order changes on release
			var dy0 = e.clientY - drag.y0; if (!drag.moved && Math.abs(dy0) < 4) return;
			if (!drag.moved) { drag.moved = true; rows.classList.add("is-tdragging"); drag.row.classList.add("is-tdrag"); }
			var R = drag.rects, f = drag.from, me = R[f], kind = drag.tr.kind, lo = f, hi = f;
			while (lo > 0 && R[lo - 1].kind === kind) lo--; while (hi < R.length - 1 && R[hi + 1].kind === kind) hi++;
			var minDy = R[lo].top - me.top, maxDy = R[hi].top + R[hi].h - (me.top + me.h), dy = V.clamp(dy0, minDy, maxDy), to = f;
			var topY = me.top + dy, botY = topY + me.h;   // passing half of a neighbour (with the grabbed row's top going up, its bottom going down) swaps them
			for (var i = lo; i <= hi; i++) { if (i < f && topY < R[i].top + R[i].h / 2) { to = i; break; } }
			for (var j = hi; j >= lo; j--) { if (j > f && botY > R[j].top + R[j].h / 2) { to = j; break; } }
			drag.to = to; drag.row.style.transform = "translateY(" + dy + "px)";
			drag.all.forEach(function (r, k) { if (k === f) return; var sh = (to < f && k >= to && k < f) ? me.h : (to > f && k > f && k <= to) ? -me.h : 0; r.style.transform = sh ? "translateY(" + sh + "px)" : ""; });
			return;
		}
		if (drag.mode === "rowh") { drag.moved = true; drag.tr.h = V.clamp(Math.round(drag.h0 - (e.clientY - drag.y0)), V.ROW_MIN, V.ROW_MAX); T.render(); return; }
		var dx = e.clientX - drag.x0; if (!drag.moved && Math.abs(dx) < 3 && drag.mode === "move" && !rowAt(e.clientY, drag.c)) return;
		drag.moved = true; var dt = dx / VE.pps, ign = {}; drag.orig.forEach(function (o) { ign[o.c.id] = 1; });
		if (drag.mode === "trim") {
			var c = drag.c, o = drag.orig.filter(function (q) { return q.c === c; })[0] || { start: c.start, in: c.in, out: c.out, anims: c.anims ? JSON.stringify(c.anims) : null };
			Object.assign(c, { start: o.start, in: o.in, out: o.out, anims: o.anims ? JSON.parse(o.anims) : null });
			var want = (drag.edge === "l" ? o.start : V.end(c)) + dt, isMag = mag(c.track);
			if (T.snap && !e.altKey) want = V.snap(want, snapPts(ign), 8 / VE.pps).t;
			var nb = V.onTrack(VE.P, c.track).filter(function (x) { return x !== c; }), lo = 0, hi = Infinity;
			if (!isMag) nb.forEach(function (x) { if (V.end(x) <= o.start + 1e-4) lo = Math.max(lo, V.end(x)); if (x.start >= V.end(c) - 1e-4) hi = Math.min(hi, x.start); });
			if (isMag && drag.edge === "l") want = o.start + dt;   // magnetic: the edge follows the pointer, no snapping
			Object.assign(c, V.trim(c, drag.edge, want, { mediaDur: VE.mediaDur(c), lo: lo, hi: hi, minDur: 1 / VE.P.fps, mag: isMag }));
			// linked partners get the same trim
			var grow = V.dur(c) - (o.out - o.in) / (c.speed || 1);
			if (isMag) {   // put the other clips back where they were, then let the partners' (non-magnetic) tracks ripple by the same amount
				var keep0 = JSON.parse(drag.snap), was = {}; keep0.clips.forEach(function (x) { was[x.id] = x; });
				VE.P.clips.forEach(function (x) { if (!ign[x.id] && was[x.id]) x.start = was[x.id].start; });
			}
			drag.orig.forEach(function (q) {
				if (q.c === c || !c.link || q.c.link !== c.link) return;
				q.c.start = c.start; q.c.in = c.in; q.c.out = c.out;
				if (isMag && !mag(q.c.track)) V.onTrack(VE.P, q.c.track).forEach(function (x) { if (!ign[x.id] && x.start >= q.start + (q.out - q.in) / (q.c.speed || 1) - 1e-4) x.start = Math.max(0, x.start + grow); });
			});
			drag.bad = drag.orig.some(function (q) { return q.c !== c && !mag(q.c.track) && !V.canPlace(VE.P, q.c.track, q.c.start, V.dur(q.c), ign); });
			if (isMag) V.pack(VE.P, c.track);
			V.syncLinks(VE.P);
		} else {
			// move: the clip under the pointer snaps, the others keep their distance; the clip under the pointer may change track
			var p0 = drag.orig.filter(function (q) { return q.c === drag.c; })[0], ns = Math.max(0, p0.start + dt);
			if (T.snap && !e.altKey) { var d = V.dur(drag.c), pts = snapPts(ign), a = V.snap(ns, pts, 8 / VE.pps), b = V.snap(ns + d, pts, 8 / VE.pps); if (a.snapped) ns = a.t; else if (b.snapped) ns = b.t - d; }
			var shift = ns - p0.start; drag.orig.forEach(function (o) { if (o.start + shift < 0) shift = -o.start; });
			// up / down: the clip under the pointer goes to the row under the pointer; the other clips of the same kind (video or sound) move the same number of rows, linked partners of the other kind stay on their track
			var newTrack = rowAt(e.clientY, drag.c), tmap = trackShift(drag, newTrack);
			// magnetic tracks: start from the state before the drag so their clips do not drift while the pointer moves
			var keep = JSON.parse(drag.snap), byId = {}; keep.clips.forEach(function (x) { byId[x.id] = x; });
			VE.P.clips.forEach(function (x) { if (!ign[x.id] && byId[x.id] && mag(x.track)) x.start = byId[x.id].start; });
			drag.orig.forEach(function (o) { o.c.start = o.start + shift; o.c.track = tmap && tmap[o.c.id] ? tmap[o.c.id] : o.track; });
			var touched = {};
			drag.orig.forEach(function (o) { touched[o.track] = 1; touched[o.c.track] = 1; });
			Object.keys(touched).forEach(function (tid) { if (!mag(tid)) return; var ms = drag.orig.filter(function (o) { return o.c.track === tid; }); if (ms.length === 1) V.magnetInsert(VE.P, tid, ms[0].c.id, ms[0].c.start); else V.pack(VE.P, tid); });
			if (drag.orig.some(function (o) { return mag(o.c.track); })) V.syncLinks(VE.P);
			drag.bad = drag.orig.some(function (o) { return !mag(o.c.track) && !V.canPlace(VE.P, o.c.track, o.c.start, V.dur(o.c), ign); });
			if (drag.bad && drag.orig.length === 1) { var f = V.fitOnTrack(VE.P, drag.c.track, drag.c.start, V.dur(drag.c), ign); if (f != null && Math.abs(f - drag.c.start) < 2.5 * Math.max(1, V.dur(drag.c))) { drag.c.start = f; drag.bad = false; } }
		}
		T.render(); var el = rows.querySelector('.vd-clip[data-id="' + drag.c.id + '"]'); if (el && drag.bad) el.classList.add("is-bad");
		VE.emit("live");
	});
	// new track per clip id when the dragged clip goes to row newTrack, or null (no vertical move / a clip would land outside or on a locked track)
	function trackShift(d, newTrack) {
		var p0 = d.orig.filter(function (q) { return q.c === d.c; })[0]; if (!newTrack || !p0 || newTrack === p0.track) return null;
		var kind = V.kindFor(d.c.type), list = VE.P.tracks.filter(function (t) { return t.kind === kind; }).map(function (t) { return t.id; });
		var delta = list.indexOf(newTrack) - list.indexOf(p0.track), out = {};
		for (var i = 0; i < d.orig.length; i++) {
			var o = d.orig[i]; if (V.kindFor(o.c.type) !== kind) continue;
			var j = list.indexOf(o.track) + delta, tr = V.track(VE.P, list[j]); if (j < 0 || j >= list.length || !tr || tr.lock) return null;
			out[o.c.id] = list[j];
		}
		return out;
	}
	function rowAt(clientY, c) {
		var row = null; rows.querySelectorAll(".vd-trow").forEach(function (r) { var b = r.getBoundingClientRect(); if (clientY >= b.top && clientY < b.bottom) row = r; });
		if (!row) return null; var tr = V.track(VE.P, row.getAttribute("data-track"));
		return tr && !tr.lock && tr.kind === V.kindFor(c.type) ? tr.id : null;
	}
	function finish() {
		if (!drag) return;
		var d = drag; drag = null;
		if (d.mode === "rowh") { if (d.moved) VE.commit("Track height"); return; }
		if (d.mode === "track") {
			rows.classList.remove("is-tdragging"); d.all.forEach(function (r) { r.style.transform = ""; });
			if (d.moved && d.to !== d.from) { var tg = V.track(VE.P, d.all[d.to].getAttribute("data-track")), L = VE.P.tracks; L.splice(L.indexOf(d.tr), 1); L.splice(L.indexOf(tg) + (d.to > d.from ? 1 : 0), 0, d.tr); VE.commit("Move track"); }
			else T.render();
			return;
		}
		if (d.mode === "anim") {
			if (d.moved) { d.c.anims = V.cleanAnims(d.c.anims); VE.commit(d.edge ? "Animation length" : "Move animation"); }
			else VE.preview.seek(Math.min(V.end(d.c) - 1e-3, d.c.start + d.a.t + d.a.d));   // a click jumps to its end, ready to drag the clip there in the preview
			return;
		}
		if (d.mode === "scrub" || !d.moved) { T.render(); return; }
		if (d.bad) { VE.P = JSON.parse(d.snap); T.render(); VE.emit("live"); VE.emit("notice", "There is no room there: clips on one track cannot overlap (turn on the magnet of a track to have clips close up instead)."); return; }
		VE.commit(d.mode === "trim" ? "Trim" : "Move");
	}
	// right-click: a menu for the clip / empty spot / track header (built in app.js)
	inner.addEventListener("contextmenu", function (e) {
		var row = e.target.closest(".vd-trow"), ce = e.target.closest(".vd-clip"), head = e.target.closest(".vd-thead");
		if (!row && !e.target.closest("#vd-rulerwrap")) return;
		e.preventDefault(); drag = null;
		var c = ce ? V.clip(VE.P, ce.getAttribute("data-id")) : null;
		if (c && VE.sel.indexOf(c.id) < 0) { VE.sel = [c.id]; VE.emit("select"); }
		if (VE.ctxMenu) VE.ctxMenu(e.clientX, e.clientY, { clip: c, track: row ? V.track(VE.P, row.getAttribute("data-track")) : null, head: !!head, t: head ? VE.t : Math.max(0, x2t(e.clientX)) });
	});
	inner.addEventListener("pointerup", finish); inner.addEventListener("pointercancel", finish);
	function markSel() { var s = {}; VE.sel.forEach(function (i) { s[i] = 1; }); rows.querySelectorAll(".vd-clip").forEach(function (el) { el.classList.toggle("is-sel", !!s[el.getAttribute("data-id")]); }); rows.querySelectorAll(".vd-an-mk").forEach(function (el) { el.classList.toggle("is-sel", el.getAttribute("data-aid") === VE.animSel); }); }
	T.markSel = markSel;
	function trackAction(b) {
		var row = b.closest(".vd-trow"), tr = V.track(VE.P, row.getAttribute("data-track")), a = b.getAttribute("data-tact");
		if (a === "del") { VE.P.tracks = VE.P.tracks.filter(function (x) { return x !== tr; }); VE.commit("Delete track"); return; }
		tr[a] = !tr[a];
		if (a === "mag" && tr.mag) VE.emit("notice", tr.name + " is magnetic: its clips close up to the left with no gaps.");
		VE.commit(a === "hide" ? "Hide track" : a === "mute" ? "Mute track" : a === "mag" ? (tr.mag ? "Magnetic track on" : "Magnetic track off") : "Lock track");
	}
	rows.addEventListener("dblclick", function (e) {
		var rg = e.target.closest("[data-rgrip]"); if (rg) { var gt = V.track(VE.P, rg.getAttribute("data-rgrip")); delete gt.h; VE.commit("Track height"); return; }
		var n = e.target.closest(".vd-tname"); if (n) { var tr = V.track(VE.P, n.closest(".vd-trow").getAttribute("data-track")), nm = window.prompt("Track name", tr.name); if (nm) { tr.name = nm.slice(0, 40); VE.commit("Rename track"); } return; }
		var ce = e.target.closest(".vd-clip"); if (ce) { var c = V.clip(VE.P, ce.getAttribute("data-id")); if (c && c.type === "text") VE.emit("editText", c); }
	});

	/* ---------- dropping media from the bin ---------- */
	// place media m at the time under clientX on the row under clientY (or the first fitting track); returns the new clip
	T.placeMedia = function (m, clientX, clientY, atTime) {
		var type = m.kind === "image" ? "image" : m.kind === "audio" ? "audio" : "video", kind = V.kindFor(type);
		var t = atTime != null ? atTime : clientX != null ? x2t(clientX) : VE.t, tr = null;
		if (clientY != null) { var row = null; rows.querySelectorAll(".vd-trow").forEach(function (r) { var b = r.getBoundingClientRect(); if (clientY >= b.top && clientY < b.bottom) row = r; }); if (row) { var q = V.track(VE.P, row.getAttribute("data-track")); if (q && q.kind === kind && !q.lock) tr = q; } }
		var dur = type === "image" ? 5 : m.dur;
		var tracks = tr ? [tr] : VE.P.tracks.filter(function (x) { return x.kind === kind && !x.lock; });
		if (kind === "v" && !tr) tracks = tracks.slice().reverse();   // pictures go on the lowest free video track first
		var c = V.clipDefaults({ id: V.uid("c"), type: type, media: m.id, track: null, start: 0, in: 0, out: dur });
		for (var j = 0; j < tracks.length; j++) {
			if (tracks[j].mag) { c.track = tracks[j].id; c.start = Math.max(0, t); break; }
			var s = V.fitOnTrack(VE.P, tracks[j].id, Math.max(0, t), dur); if (s != null && (tr || Math.abs(s - t) < 1e-6)) { c.track = tracks[j].id; c.start = s; break; }
		}
		if (!c.track) { var nt = VE.addTrack(kind); c.track = nt.id; c.start = Math.max(0, t); }
		if (type === "image" && m.w && m.h) c.scale = Math.min(1, 1 / Math.min(VE.P.w / m.w, VE.P.h / m.h));   // a picture comes in at its own pixel size (at most the frame)
		VE.P.clips.push(c); VE.sel = [c.id];
		if (V.track(VE.P, c.track).mag) V.magnetInsert(VE.P, c.track, c.id, c.start);
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
	// a new track with a name not in use yet ("Video 3"); next to = put it just above (video) / below (sound) that track instead of at the top / bottom
	VE.addTrack = function (kind, nextTo, where) {
		var base = kind === "v" ? "Video " : "Audio ", used = {}; VE.P.tracks.forEach(function (t) { used[t.name] = 1; });
		var n = 1; while (used[base + n]) n++;
		var tr = { id: V.uid(kind), kind: kind, name: base + n }, at = nextTo ? VE.P.tracks.indexOf(nextTo) : -1;
		if (at >= 0) VE.P.tracks.splice((where || (kind === "v" ? "above" : "below")) === "above" ? at : at + 1, 0, tr);
		else if (kind === "v") VE.P.tracks.splice(0, 0, tr); else VE.P.tracks.push(tr);
		return tr;
	};
	T.dragHint = function (clientX, clientY, on) {
		inner.classList.toggle("is-drop", !!on);
		if (on && clientX != null) { var t = x2t(clientX); $("vd-dropline").hidden = false; $("vd-dropline").style.left = t2x(t) + "px"; } else $("vd-dropline").hidden = true;
	};
	T.inside = function (clientX, clientY) { var b = sc.getBoundingClientRect(); return clientX >= b.left && clientX <= b.right && clientY >= b.top && clientY <= b.bottom; };

	VE.on("change", function () { T.render(); });
	var pcmRaf = {};
	VE.on("pcmReady", function (m) { if (pcmRaf[m.id]) return; pcmRaf[m.id] = requestAnimationFrame(function () { pcmRaf[m.id] = 0; rows.querySelectorAll(".vd-clip").forEach(function (el) { var c = V.clip(VE.P, el.getAttribute("data-id")); if (c && c.media === m.id) paintClip(el, true); }); }); });
	VE.on("thumbs", function (m) { rows.querySelectorAll(".vd-clip").forEach(function (el) { var c = V.clip(VE.P, el.getAttribute("data-id")); if (c && c.media === m.id) paintClip(el, true); }); });
	VE.on("time", function () { T.playhead(); });
	VE.on("select", markSel);
	if (window.ResizeObserver) new ResizeObserver(function () { drawRuler(); rows.querySelectorAll(".vd-clip").forEach(function (el) { paintClip(el, true); }); }).observe(sc);
})();
