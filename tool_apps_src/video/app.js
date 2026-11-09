/* MES Video Editor (mes.fm/video): the media bin, the inspector, menus, keyboard shortcuts, sound clean-up (noise removal through
 * window.MESDenoise from /main_js/denoise.js, loudness normalising with MESVed's R128 meter), project files and the export dialog.
 * The model / timeline maths are in lib.js (MESVed), the engine in core.js / preview.js / timeline.js / export.js. Nothing is uploaded. */
(function () {
	"use strict";
	var VE = window.VE; if (!VE) return;
	var V = VE.V, C = window.MESConv, $ = function (id) { return document.getElementById(id); }, app = $("vd-app"), esc = VE.esc;
	var KEY = "mes-video-editor:v1", UI = { win: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) Object.assign(UI, sv); } catch (e) { /* ignore */ }
	function saveUI() { try { localStorage.setItem(KEY, JSON.stringify(UI)); } catch (e) { /* ignore */ } }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); }
	var toastT = 0;
	function toast(msg, ms) { var t = $("vd-toast"); t.textContent = msg; t.hidden = !msg; clearTimeout(toastT); if (msg) toastT = setTimeout(function () { t.hidden = true; }, ms || 4200); }
	VE.on("notice", function (m) { toast(m, 6000); });
	var support = { webcodecs: !!(window.VideoEncoder && window.VideoDecoder && window.AudioDecoder) };
	if (!support.webcodecs) toast("This browser cannot edit video here (no WebCodecs). Use Chrome, Edge or Brave on a computer.", 15000);

	/* ---------- media bin ---------- */
	var binSel = {};
	function binRow(m) {
		var meta = m.kind === "image" ? (m.w ? m.w + "×" + m.h : "picture") : (m.dur ? V.short(m.dur).replace(/\.\d$/, "") : "") + (m.w ? " · " + m.w + "×" + m.h : "") + (m.kind === "audio" ? " · sound" : "");
		var st = m.state === "ready" ? (m.converted ? "converted from " + esc(m.origName || "") : "") : m.state === "error" ? '<span class="vd-bad">' + esc(m.status) + "</span>" : m.state === "missing" ? '<span class="vd-bad">' + esc(m.status) + "</span>" : esc(m.status || "") + (m.pct ? '<i class="vd-mbar"><i style="width:' + Math.round(m.pct * 100) + '%"></i></i>' : "");
		var used = VE.P.clips.filter(function (c) { return c.media === m.id; }).length;
		return '<div class="vd-mi' + (binSel[m.id] ? " is-sel" : "") + (m.state !== "ready" ? " is-wait" : "") + '" role="option" aria-selected="' + !!binSel[m.id] + '" data-mid="' + m.id + '" tabindex="0">' +
			'<canvas class="vd-mth" width="96" height="54" data-th="' + m.id + '"></canvas><div class="vd-mt"><div class="vd-mn" title="' + esc(m.name) + '">' + esc(m.name) + "</div><div class=\"vd-mm\">" + esc(meta) + (used ? " · on timeline" + (used > 1 ? " ×" + used : "") : "") + "</div><div class=\"vd-mm\">" + st + "</div></div>" +
			'<span class="vd-mact"><button type="button" class="vd-btn vd-ico vd-sm" data-madd="' + m.id + '" title="Put it at the playhead" aria-label="Add ' + esc(m.name) + ' at the playhead"' + (m.state !== "ready" ? " disabled" : "") + '>+</button><button type="button" class="vd-btn vd-ico vd-sm" data-mrm="' + m.id + '" title="Remove from the project" aria-label="Remove ' + esc(m.name) + '">&times;</button></span></div>';
	}
	function renderBin() {
		var q = ($("vd-binsearch").value || "").toLowerCase().trim(), list = VE.bin.filter(function (m) { return !q || m.name.toLowerCase().indexOf(q) >= 0; });
		$("vd-binlist").innerHTML = list.length ? list.map(binRow).join("") : '<p class="vd-empty">' + (VE.bin.length ? "Nothing matches." : "No media yet.") + "</p>";
		list.forEach(paintThumb);
		$("vd-addsel").disabled = !Object.keys(binSel).some(function (id) { var m = VE.media(id); return m && m.state === "ready"; });
		$("vd-binhint").hidden = VE.bin.length > 2;
	}
	function paintThumb(m) {
		var cv = $("vd-binlist").querySelector('canvas[data-th="' + m.id + '"]'); if (!cv) return;
		var g = cv.getContext("2d"); g.fillStyle = "#1e293b"; g.fillRect(0, 0, 96, 54);
		var img = m.kind === "image" ? m.bitmap : m.thumbImg, iw = m.kind === "image" ? m.w : m.thumbW, ih = m.kind === "image" ? m.h : m.thumbH;
		if (img && iw) { var k = Math.min(96 / iw, 54 / ih); g.drawImage(img, 0, 0, iw, ih, (96 - iw * k) / 2, (54 - ih * k) / 2, iw * k, ih * k); }
		else if (m.kind === "audio" && m.peaks) { g.fillStyle = "#7dd3fc"; for (var x = 0; x < 96; x++) { var v = m.peaks[Math.floor(x / 96 * m.peaks.length)] / 255 * 24; g.fillRect(x, 27 - v, 1, v * 2 + 1); } }
		else { g.fillStyle = "#94a3b8"; g.font = "bold 12px Arial"; g.textAlign = "center"; g.fillText(m.kind === "audio" ? "SOUND" : (C.extOf(m.name) || "").toUpperCase(), 48, 31); }
	}
	VE.on("bin", renderBin);
	VE.on("binItem", function (m) { var el = $("vd-binlist").querySelector('[data-mid="' + m.id + '"]'); if (!el) return renderBin(); var tmp = document.createElement("div"); tmp.innerHTML = binRow(m); el.replaceWith(tmp.firstChild); paintThumb(m); $("vd-addsel").disabled = !Object.keys(binSel).length; });
	VE.on("thumbs", function (m) { paintThumb(m); });
	$("vd-binsearch").addEventListener("input", renderBin);
	$("vd-binlist").addEventListener("click", function (e) {
		var b = e.target.closest("button"), id;
		if (b && (id = b.getAttribute("data-madd"))) { var m = VE.media(id); if (m && m.state === "ready") VE.tl.placeMedia(m, null, null, VE.t); return; }
		if (b && (id = b.getAttribute("data-mrm"))) { removeMedia(id); return; }
		var it = e.target.closest(".vd-mi"); if (!it) return; id = it.getAttribute("data-mid");
		if (!(e.ctrlKey || e.metaKey || e.shiftKey)) binSel = {};
		if (binSel[id]) delete binSel[id]; else binSel[id] = 1;
		renderBin();
	});
	$("vd-binlist").addEventListener("dblclick", function (e) { var it = e.target.closest(".vd-mi"); if (!it || e.target.closest("button")) return; var m = VE.media(it.getAttribute("data-mid")); if (m && m.state === "ready") VE.tl.placeMedia(m, null, null, VE.t); });
	$("vd-binlist").addEventListener("keydown", function (e) { var it = e.target.closest(".vd-mi"); if (!it) return; if (e.key === "Enter") { var m = VE.media(it.getAttribute("data-mid")); if (m && m.state === "ready") VE.tl.placeMedia(m, null, null, VE.t); e.preventDefault(); } });
	function removeMedia(id) {
		var m = VE.media(id); if (!m) return; var n = VE.P.clips.filter(function (c) { return c.media === id; }).length;
		if (n && !window.confirm(m.name + " is used by " + n + " clip" + (n > 1 ? "s" : "") + " on the timeline. Remove it and those clips?")) return;
		VE.P.clips = VE.P.clips.filter(function (c) { return c.media !== id; }); VE.bin = VE.bin.filter(function (x) { return x !== m; }); delete binSel[id];
		VE.idbDel("blobs", "m:" + id).catch(function () { }); VE.idbDel("blobs", "t:" + id).catch(function () { });
		if (m.url) try { URL.revokeObjectURL(m.url); } catch (x) { /* ignore */ }
		VE.commit("Remove media"); renderBin();
	}
	$("vd-addsel").onclick = function () { var list = VE.bin.filter(function (m) { return binSel[m.id] && m.state === "ready"; }); if (list.length) VE.tl.appendAll(list); binSel = {}; renderBin(); };
	// drag a bin item onto the timeline (pointer events: works with mouse, touch and pen)
	var bdrag = null;
	$("vd-binlist").addEventListener("pointerdown", function (e) {
		var it = e.target.closest(".vd-mi"); if (!it || e.target.closest("button") || e.button > 0) return;
		var m = VE.media(it.getAttribute("data-mid")); if (!m || m.state !== "ready") return;
		bdrag = { m: m, x: e.clientX, y: e.clientY, on: false, id: e.pointerId };
	});
	document.addEventListener("pointermove", function (e) {
		if (!bdrag || e.pointerId !== bdrag.id) return;
		if (!bdrag.on && Math.hypot(e.clientX - bdrag.x, e.clientY - bdrag.y) < 6) return;
		if (!bdrag.on) { bdrag.on = true; var g = bdrag.ghost = document.createElement("div"); g.className = "vd-ghost"; g.textContent = bdrag.m.name; app.appendChild(g); }
		bdrag.ghost.style.left = e.clientX + 12 + "px"; bdrag.ghost.style.top = e.clientY + 8 + "px";
		var over = VE.tl.inside(e.clientX, e.clientY); VE.tl.dragHint(e.clientX, e.clientY, over);
	});
	document.addEventListener("pointerup", function (e) {
		if (!bdrag || e.pointerId !== bdrag.id) return;
		var d = bdrag; bdrag = null; if (d.ghost) d.ghost.remove(); VE.tl.dragHint(null, null, false);
		if (d.on && VE.tl.inside(e.clientX, e.clientY)) VE.tl.placeMedia(d.m, e.clientX, e.clientY);
	});

	/* ---------- importing ---------- */
	function importFiles(list) {
		list = [].slice.call(list || []); if (!list.length) return Promise.resolve([]);
		var rest = list.filter(function (f) { return !VE.relink(f); });
		if (rest.length < list.length) toast("Relinked " + (list.length - rest.length) + " missing file" + (list.length - rest.length > 1 ? "s" : "") + ".");
		return rest.length ? VE.addFiles(rest) : Promise.resolve([]);
	}
	$("vd-import").onclick = function () { $("vd-file").click(); };
	$("vd-file").onchange = function () { importFiles(this.files); this.value = ""; };
	app.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); app.classList.add("is-over"); VE.tl.dragHint(e.clientX, e.clientY, VE.tl.inside(e.clientX, e.clientY)); } });
	app.addEventListener("dragleave", function (e) { if (!e.relatedTarget || !app.contains(e.relatedTarget)) { app.classList.remove("is-over"); VE.tl.dragHint(null, null, false); } });
	app.addEventListener("drop", function (e) {
		if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
		e.preventDefault(); app.classList.remove("is-over"); VE.tl.dragHint(null, null, false);
		var all = [].slice.call(e.dataTransfer.files), proj = all.filter(isProjectFile), media = all.filter(function (f) { return !isProjectFile(f); }), projH = null;
		// the file handle has to be asked for during the drop event itself: it lets Save write back into the dropped project file
		if (proj.length) [].some.call(e.dataTransfer.items || [], function (it) { if (it.kind === "file" && it.getAsFileSystemHandle && /\.mesvideo$/i.test((it.getAsFile() || {}).name || "")) { try { projH = it.getAsFileSystemHandle(); } catch (er) { projH = null; } return true; } return false; });
		if (proj.length) {
			if (proj.length > 1) toast("Only one project can be open: opening " + proj[0].name + ".");
			if (media.length) toast("Opening the project first; drop the media files again afterwards to relink or add them.", 7000);
			askOpenProject(proj[0], projH); return;
		}
		var x = e.clientX, y = e.clientY, onTl = VE.tl.inside(x, y), t = onTl ? VE.tl.x2t(x) : null;
		importFiles(media).then(function (ms) {
			if (!onTl) return; var at = t;
			ms.forEach(function (m) { if (m.state === "ready") { var c = VE.tl.placeMedia(m, null, y, at); at = V.end(c); } });
		});
	});
	document.addEventListener("paste", function (e) {
		if (/input|textarea|select/i.test((document.activeElement || {}).tagName || "")) return;
		var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); importFiles(fs); }
	});

	/* ---------- clip operations ---------- */
	function targets() { var s = VE.selected(); return s; }
	VE.split = function () {
		var t = VE.t, list = targets().filter(function (c) { return V.active(c, t) && t > c.start; });
		if (!list.length) list = VE.P.clips.filter(function (c) { var tr = V.track(VE.P, c.track); return tr && !tr.lock && t > c.start && t < V.end(c); });
		var selTr = VE.selected().map(function (c) { return c.track; }), newSel = V.splitAt(VE.P, list.map(function (c) { return c.id; }), t, function () { return V.uid("c"); }, 1 / VE.P.fps);
		if (!newSel.length) { toast("Put the playhead inside a clip to split it."); return; }
		VE.sel = newSel.filter(function (id) { var c = V.clip(VE.P, id); return c && selTr.indexOf(c.track) >= 0; });
		if (!VE.sel.length) VE.sel = newSel.slice();
		VE.commit("Split");
	};
	VE.del = function (ripple) {
		var ids = V.withLinks(VE.P, targets().map(function (c) { return c.id; })).filter(function (id) { var c = V.clip(VE.P, id), tr = c && V.track(VE.P, c.track); return c && !(tr && tr.lock); });
		if (!ids.length) { toast("Select a clip first."); return; }
		V.removeClips(VE.P, ids, ripple); VE.sel = []; VE.commit(ripple ? "Ripple delete" : "Delete");
	};
	VE.duplicate = function () {
		var list = V.withLinks(VE.P, targets().map(function (c) { return c.id; })).map(function (id) { return V.clip(VE.P, id); }).filter(Boolean); if (!list.length) return; var ns = [], links = {};
		var a0 = Math.min.apply(null, list.map(function (c) { return c.start; })), shift = Math.max.apply(null, list.map(V.end)) - a0;
		list.forEach(function (c) { var d = JSON.parse(JSON.stringify(c)); d.id = V.uid("c"); if (d.link) d.link = links[d.link] || (links[d.link] = V.uid("L")); var st = V.canPlace(VE.P, c.track, c.start + shift, V.dur(c)) ? c.start + shift : V.fitOnTrack(VE.P, c.track, V.end(c), V.dur(c)); d.start = st == null ? V.end(c) : st; VE.P.clips.push(d); ns.push(d.id); });
		VE.sel = ns; VE.commit("Duplicate");
	};
	VE.addTitle = function (preset, at, trackId) {
		var pr = preset || {}, t0 = at != null ? at : VE.t, vt = VE.P.tracks.filter(function (t) { return t.kind === "v" && !t.lock && !t.mag; }), tr = trackId ? V.track(VE.P, trackId) : null, dur = pr.dur || 4;
		if (tr && (tr.lock || tr.kind !== "v" || (!tr.mag && !V.canPlace(VE.P, tr.id, t0, dur)))) tr = null;
		for (var j = 0; !tr && j < vt.length; j++) if (V.canPlace(VE.P, vt[j].id, t0, dur)) tr = vt[j];
		if (!tr) tr = VE.addTrack("v");
		var c = V.clipDefaults({ id: V.uid("c"), type: "text", track: tr.id, start: t0, in: 0, out: dur, fin: 0.3, fout: 0.3, x: pr.x != null ? pr.x : 0.5, y: pr.y != null ? pr.y : 0.82, text: Object.assign({}, pr.text || {}) });
		if (tr.mag) { VE.P.clips.push(c); V.magnetInsert(VE.P, tr.id, c.id, t0); VE.sel = [c.id]; VE.commit("Add title"); return; }
		VE.P.clips.push(c); VE.sel = [c.id]; VE.commit("Add title");
		setTimeout(function () { var ta = $("vd-ttext"); if (ta) { ta.focus(); ta.select(); } }, 50);
	};
	function mark(which) {
		VE.P.marks = VE.P.marks || {}; VE.P.marks[which] = VE.t;
		if (VE.P.marks.in != null && VE.P.marks.out != null && VE.P.marks.out < VE.P.marks.in) { var x = VE.P.marks.in; VE.P.marks.in = VE.P.marks.out; VE.P.marks.out = x; }
		VE.commit("Mark " + which);
	}
	function marksOk() { var m = VE.P.marks || {}; return m.in != null && m.out != null && m.out - m.in > 1e-3; }
	$("vd-split").onclick = VE.split; $("vd-del").onclick = function () { VE.del(false); }; $("vd-ripple").onclick = function () { VE.del(true); };
	$("vd-in").onclick = function () { mark("in"); }; $("vd-out").onclick = function () { mark("out"); };
	$("vd-clearmarks").onclick = function () { VE.P.marks = { in: null, out: null }; VE.commit("Clear marks"); };
	$("vd-cutrange").onclick = function () { if (!marksOk()) return; var m = VE.P.marks; V.removeRange(VE.P, m.in, m.out, function () { return V.uid("c"); }); VE.P.marks = { in: null, out: null }; VE.preview.seek(m.in); VE.commit("Cut out marked part"); };
	$("vd-addv").onclick = function () { VE.addTrack("v"); VE.commit("Add video track"); };
	$("vd-adda").onclick = function () { VE.addTrack("a"); VE.commit("Add audio track"); };
	$("vd-addtitle").onclick = function () { VE.addTitle(); };
	$("vd-undo").onclick = VE.undo; $("vd-redo").onclick = VE.redo;
	$("vd-snapchk").onchange = function () { VE.tl.snap = this.checked; };

	/* ---------- zoom ---------- */
	var zr = $("vd-zoom");
	function z2s(v) { return Math.pow(10, v / 1000 * Math.log10(600) * 1); }
	function s2z(p) { return Math.round(Math.log10(Math.max(1, p)) / Math.log10(600) * 1000); }
	zr.value = s2z(VE.pps);
	zr.addEventListener("input", function () { VE.tl.zoom(z2s(+zr.value)); });
	VE.on("zoom", function (p) { zr.value = s2z(p); });
	$("vd-zin").onclick = function () { VE.tl.zoom(VE.pps * 1.5); }; $("vd-zout").onclick = function () { VE.tl.zoom(VE.pps / 1.5); }; $("vd-zfit").onclick = function () { VE.tl.fit(); };

	/* ---------- transport ---------- */
	var P = VE.preview;
	$("vd-play").onclick = function () { P.toggle(); };
	var spSel = $("vd-speed");
	if (spSel) { spSel.value = String(UI.speed || 1); P.speed = +spSel.value || 1; spSel.onchange = function () { P.setSpeed(+spSel.value); }; }
	VE.on("speed", function (s) { UI.speed = s; saveUI(); if (spSel) { spSel.value = String(s); spSel.classList.toggle("is-on", s !== 1); } if (s !== 1) toast("Preview speed " + s + "× (the exported video is not changed)"); });
	if (spSel) spSel.classList.toggle("is-on", P.speed !== 1);
	// previous / next clip edge (Camtasia: Ctrl+Alt+Left / Right)
	VE.goEdit = function (dir) { if (P.playing) P.pause(); var t = V.nextEdit(VE.P, VE.t, dir, 0.5 / VE.P.fps); if (t == null) t = dir > 0 ? V.duration(VE.P) : 0; P.seek(t); VE.tl.reveal(t); };
	// one frame back / forward; pressing and holding keeps stepping, waiting for each frame to show so it never runs ahead of the picture
	VE.stepFrame = function (dir, big) { if (P.playing) P.pause(); P.seek(VE.t + dir * (big ? 1 : 1 / VE.P.fps)); VE.tl.reveal(VE.t); };
	var hold = null;
	function stopHold() { if (hold) { clearTimeout(hold.timer); hold = null; } }
	document.querySelectorAll("[data-tp]").forEach(function (b) {
		var a = b.getAttribute("data-tp");
		if (a === "back" || a === "fwd") {
			var dir = a === "fwd" ? 1 : -1;
			b.addEventListener("pointerdown", function (e) {
				if (e.button > 0) return; e.preventDefault(); stopHold(); VE.stepFrame(dir, e.shiftKey);
				var big = e.shiftKey, h = hold = { last: performance.now() };
				(function next(delay) { h.timer = setTimeout(function () { if (hold !== h) return; if (P.seeking() && performance.now() - h.last < 400) return next(15); h.last = performance.now(); VE.stepFrame(dir, big); next(big ? 120 : 1000 / Math.min(30, VE.P.fps)); }, delay); })(380);
				try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			});
			["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { b.addEventListener(ev, stopHold); });
			b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); VE.stepFrame(dir, e.shiftKey); } });
			return;
		}
		b.onclick = function () { if (a === "start") P.seek(0); else if (a === "end") P.seek(V.duration(VE.P)); else if (a === "prevclip") VE.goEdit(-1); else if (a === "nextclip") VE.goEdit(1); };
	});
	// the time under the preview is a box: type a time (4:23;13, 1:02:03, 263, 2m30s, +10, -5) and press Enter to go there
	var tin = $("vd-tin");
	function timeText() { if (document.activeElement !== tin) tin.value = V.tc(VE.t, VE.P.fps); tin.style.width = Math.max(7, tin.value.length + 1) + "ch"; $("vd-tdur").textContent = V.tc(V.duration(VE.P), VE.P.fps); }
	tin.addEventListener("focus", function () { if (P.playing) P.pause(); tin.value = V.tc(VE.t, VE.P.fps); tin.select(); });
	// the first click selects the whole time (so typing replaces it); a click while it has focus places the caret as usual
	tin.addEventListener("mousedown", function (e) { if (document.activeElement !== tin) { e.preventDefault(); tin.focus(); } });
	tin.addEventListener("input", function () { tin.style.width = Math.max(7, tin.value.length + 1) + "ch"; tin.classList.toggle("is-bad", tin.value.trim() !== "" && V.parseGoto(tin.value, VE.P.fps, VE.t) == null); });
	tin.addEventListener("keydown", function (e) {
		if (e.key === "Enter") {
			e.preventDefault(); var t = V.parseGoto(tin.value, VE.P.fps, VE.t);
			if (t == null) { tin.classList.add("is-bad"); toast("Type a time like 4:23;13, 1:02:03, 263 (seconds), 2m30s, or +10 / -5 to move from here."); return; }
			var d = V.duration(VE.P); if (t > d) toast("That is after the end (" + V.tc(d, VE.P.fps) + "): went to the end.");
			tin.classList.remove("is-bad"); P.seek(Math.max(0, Math.min(t, d))); VE.tl.reveal(VE.t); tin.blur();
		} else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); tin.classList.remove("is-bad"); tin.blur(); }
		e.stopPropagation();
	});
	tin.addEventListener("blur", function () { tin.classList.remove("is-bad"); timeText(); });
	VE.on("time", timeText); VE.on("change", timeText);
	/* ---------- seek bar (Camtasia-style scrubber above the play buttons; also in Fill window / Full screen) ---------- */
	(function () {
		var bar = $("vd-seek"), fill = $("vd-seek-fill"), th = $("vd-seek-th"), tip = $("vd-seek-tip"), mk = $("vd-seek-mk"), ticks = $("vd-seek-ticks"), drag = false, wasPlay = false, tickKey = "";
		if (!bar) return;
		function dur() { return Math.max(0, V.duration(VE.P)); }
		function tAt(x) { var r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width))) * dur(); }
		function pct(t) { var d = dur(); return d > 0 ? Math.max(0, Math.min(100, t / d * 100)) : 0; }
		function show() {
			var p = pct(VE.t) + "%"; fill.style.width = p; th.style.left = p;
			bar.setAttribute("aria-valuemax", String(Math.round(dur() * 100) / 100)); bar.setAttribute("aria-valuenow", String(Math.round(VE.t * 100) / 100)); bar.setAttribute("aria-valuetext", V.tc(VE.t, VE.P.fps));
		}
		function marks() {
			var m = VE.P.marks || {};
			if (m.in != null && m.out != null && m.out > m.in) { mk.style.display = "block"; mk.style.left = pct(m.in) + "%"; mk.style.width = (pct(m.out) - pct(m.in)) + "%"; } else mk.style.display = "none";
			// thin ticks at clip edges, so you can see where the cuts are
			var d = dur(), ts = {}; VE.P.clips.forEach(function (c) { var a = c.start, b = c.start + V.dur(c); if (a > 0.01 && a < d - 0.01) ts[a.toFixed(3)] = 1; if (b > 0.01 && b < d - 0.01) ts[b.toFixed(3)] = 1; });
			var keys = Object.keys(ts).slice(0, 400), key = d.toFixed(3) + "|" + keys.join(",");
			if (key !== tickKey) { tickKey = key; ticks.innerHTML = keys.map(function (k) { return '<i style="left:' + pct(+k) + '%"></i>'; }).join(""); }
		}
		function tipAt(x) { var r = bar.getBoundingClientRect(), t = tAt(x); tip.hidden = false; tip.textContent = V.tc(t, VE.P.fps); tip.style.left = Math.max(30, Math.min(r.width - 30, x - r.left)) + "px"; }
		bar.addEventListener("pointerdown", function (e) {
			if (e.button !== 0 || !dur()) return; e.preventDefault(); bar.focus({ preventScroll: true });
			drag = true; wasPlay = P.playing && !P.rev; if (P.playing) P.pause(); bar.classList.add("is-drag");
			try { bar.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			P.seek(tAt(e.clientX)); tipAt(e.clientX);
		});
		bar.addEventListener("pointermove", function (e) { if (!dur()) return; tipAt(e.clientX); if (drag) P.seek(tAt(e.clientX)); });
		function end(e) { if (!drag) return; drag = false; bar.classList.remove("is-drag"); VE.tl.reveal(VE.t); if (wasPlay) P.play(P.rate); if (e.pointerType !== "mouse") tip.hidden = true; }
		bar.addEventListener("pointerup", end); bar.addEventListener("pointercancel", end);
		bar.addEventListener("pointerleave", function () { if (!drag) tip.hidden = true; });
		bar.addEventListener("keydown", function (e) {
			var f = 1 / VE.P.fps, st = e.shiftKey ? 1 : f, t = null;
			if (e.key === "ArrowLeft" || e.key === "ArrowDown") t = VE.t - st; else if (e.key === "ArrowRight" || e.key === "ArrowUp") t = VE.t + st;
			else if (e.key === "PageUp") t = VE.t - 10; else if (e.key === "PageDown") t = VE.t + 10; else if (e.key === "Home") t = 0; else if (e.key === "End") t = dur();
			if (t == null) return; e.preventDefault(); e.stopPropagation(); if (P.playing) P.pause(); P.seek(t); VE.tl.reveal(VE.t);
		});
		VE.on("time", show); VE.on("change", function () { show(); marks(); }); show(); marks();
	})();
	VE.on("play", function () { $("vd-play").innerHTML = '<svg class="vd-ti" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3.2" height="11" rx="0.6"/><rect x="9.3" y="2.5" width="3.2" height="11" rx="0.6"/></svg>'; $("vd-play").setAttribute("aria-label", "Pause"); });
	VE.on("pause", function () { $("vd-play").innerHTML = '<svg class="vd-ti" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11L13.5 8z"/></svg>'; $("vd-play").setAttribute("aria-label", "Play"); timeText(); });
	$("vd-fs").onclick = function () { var w = $("vd-stagewrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not allowed here."); }); };
	function snapshot() { VE.snapshot().then(function (b) { download(b, (VE.P.name || "frame").replace(/[\\/:*?"<>|]+/g, "-") + " " + V.tc(VE.t, VE.P.fps).replace(/[:;]/g, "-") + ".png"); }).catch(function (e) { toast("Could not save the frame: " + e.message); }); }
	$("vd-snap").onclick = snapshot;

	/* ---------- fill window ---------- */
	function setWin(on) { UI.win = on; saveUI(); app.classList.toggle("vd-winmode", on); document.documentElement.classList.toggle("vd-noscroll", on); $("vd-win").setAttribute("aria-pressed", on); $("vd-win").innerHTML = on ? "&#10006; Leave window" : "&#10530; Fill window"; setTimeout(function () { P.fit(); VE.tl.render(); }, 30); }
	$("vd-win").onclick = function () { setWin(!UI.win); };
	if (UI.win) setWin(true);
	$("vd-help").onclick = function () { var k = $("vd-keys"); k.hidden = !k.hidden; this.setAttribute("aria-expanded", !k.hidden); };

	/* ---------- file menu ---------- */
	var fm = $("vd-filemenu");
	$("vd-filebtn").onclick = function (e) { e.stopPropagation(); fm.hidden = !fm.hidden; this.setAttribute("aria-expanded", !fm.hidden); };
	document.addEventListener("click", function (e) { if (!fm.hidden && !e.target.closest(".vd-menu")) { fm.hidden = true; $("vd-filebtn").setAttribute("aria-expanded", "false"); } });
	fm.addEventListener("click", function (e) {
		var b = e.target.closest("[data-act]"); if (!b) return; fm.hidden = true; var a = b.getAttribute("data-act");
		if (a === "import") $("vd-file").click(); else if (a === "title") VE.addTitle(); else if (a === "saveproj") saveProject(); else if (a === "saveprojas") saveProject(true); else if (a === "openproj") pickProject();
		else if (a === "new") { if (window.confirm("Start a new, empty project? The current one and its media are removed from this browser (save a project file first if you want it).")) { P.pause(); VE.clearAll(); linkProject(null); } }
		else if (a === "snapshot") snapshot(); else if (a === "export") openExport();
	});
	/* ---------- project file: like the Photo Editor, a project opened from or saved to a file stays linked to it, so Ctrl+S writes
	   that same file again (no new name each time). Needs the File System Access API (Chrome, Edge, Opera on a computer; Brave behind
	   brave://flags/#file-system-access-api); elsewhere every save is a download. The link survives a reload (handle in IndexedDB). */
	var proj = { h: null, name: "", lm: 0, savedRev: -1 }, FSA = !!window.showSaveFilePicker, rev = 0;
	VE.on("change", function (label) { rev++; if (label === "restore") proj.savedRev = rev; projState(); });   // the autosave coming back is not a new change
	function projData() { return { format: "mes-video", v: 1, saved: new Date().toISOString(), project: VE.P, media: VE.bin.map(function (m) { return { id: m.id, name: m.name, origName: m.origName || "", size: m.size, kind: m.kind, dur: m.dur }; }) }; }
	function projBlob() { return new Blob([JSON.stringify(projData(), null, 1)], { type: "application/json" }); }
	function projFileName() { return (VE.P.name || "video").replace(/[\\/:*?"<>|]+/g, "-") + ".mesvideo"; }
	function linkProject(h, lm) {
		proj.h = h || null; proj.name = h ? h.name : ""; proj.lm = lm || 0; proj.savedRev = h ? rev : -1;
		(h ? VE.idbPut("kv", "projfile", { h: h, lm: proj.lm }) : VE.idbDel("kv", "projfile")).catch(function () { /* the link just won't survive a reload */ });
		projState();
	}
	VE.idbGet("kv", "projfile").then(function (v) { if (v && v.h && v.h.kind === "file") { proj.h = v.h; proj.name = v.h.name; proj.lm = v.lm || 0; proj.savedRev = rev; projState(); } }).catch(function () { });
	function projState() {
		var b = fm.querySelector('[data-act="saveproj"]'), st = $("vd-projst");
		if (b) b.innerHTML = (proj.h ? "Save to " + esc(proj.name) : "Save project file (.mesvideo)") + " <kbd>Ctrl+S</kbd>";
		if (st) { var dirty = proj.h && proj.savedRev !== rev; st.hidden = !proj.h; st.textContent = proj.h ? (dirty ? "● " : "") + proj.name : ""; st.title = proj.h ? (dirty ? "Changes not saved to " + proj.name + " yet (Ctrl+S saves them)" : "Linked to " + proj.name + ": Ctrl+S saves to it") : ""; st.classList.toggle("is-dirty", !!dirty); }
	}
	async function permOk(h) {
		try { var o = { mode: "readwrite" }; if (await h.queryPermission(o) === "granted") return true; return await h.requestPermission(o) === "granted"; } catch (e) { return false; }
	}
	async function writeTo(h) { var w = await h.createWritable(); await w.write(projBlob()); await w.close(); var f = await h.getFile(); return f.lastModified; }
	var dlNoted = false;
	async function saveProject(asNew) {
		if (!FSA) {
			download(projBlob(), projFileName());
			toast(dlNoted ? "Project file downloaded." : "Project file downloaded. This browser can't write back into a file, so each save is a new download" + (navigator.brave ? " (Brave can: turn on brave://flags/#file-system-access-api)" : "") + ". It holds the edit, not the media: keep the video files.", 9000);
			dlNoted = true; proj.savedRev = rev; return true;
		}
		var h = asNew ? null : proj.h;
		if (h) {
			if (!(await permOk(h))) { toast("The browser did not allow writing to " + proj.name + ". Use File → Save project as… to pick a file."); return false; }
			try {
				var cur = await h.getFile();
				if (proj.lm && cur.lastModified > proj.lm + 1000) {   // changed somewhere else (another computer through OneDrive / Dropbox, another tab)
					var pick = await askConflict(cur); if (pick === "cancel") return false;
					if (pick === "theirs") { openProject(cur, h); return false; }
				}
				var lm = await writeTo(h); proj.lm = lm; proj.savedRev = rev; VE.idbPut("kv", "projfile", { h: h, lm: lm }).catch(function () { }); projState();
				toast("Saved to " + proj.name + "."); return true;
			} catch (e) { if (e && e.name === "NotFoundError") { toast(proj.name + " is gone (moved or deleted): choose where to save it."); return saveProject(true); } toast("Could not save: " + (e && e.message || e)); return false; }
		}
		try { h = await window.showSaveFilePicker({ suggestedName: proj.name || projFileName(), types: [{ description: "MES Video Editor project", accept: { "application/json": [".mesvideo"] } }] }); }
		catch (e) { return false; }   // cancelled
		try { var lm2 = await writeTo(h); linkProject(h, lm2); toast("Saved to " + h.name + ". From now on Ctrl+S saves to this file. It holds the edit, not the media: keep the video files.", 8000); return true; }
		catch (e) { toast("Could not save: " + (e && e.message || e)); return false; }
	}
	function askConflict(f) {
		return new Promise(function (res) {
			dialog("<h3>" + esc(proj.name) + " was changed somewhere else</h3><p class=\"vd-dtxt\">The file was saved at " + esc(new Date(f.lastModified).toLocaleString()) + ", after you last opened or saved it here (another computer through OneDrive / Dropbox, or another tab).</p>" +
				"<div class=\"vd-dlgact\"><button type=\"button\" class=\"vd-btn vd-primary\" id=\"vd-cf-mine\">Keep mine (overwrite it)</button> <button type=\"button\" class=\"vd-btn\" id=\"vd-cf-theirs\">Open theirs</button> <button type=\"button\" class=\"vd-btn\" id=\"vd-cf-no\">Cancel</button></div>");
			$("vd-cf-mine").onclick = function () { closeDialog(); res("mine"); };
			$("vd-cf-theirs").onclick = function () { closeDialog(); res("theirs"); };
			$("vd-cf-no").onclick = function () { closeDialog(); res("cancel"); };
		});
	}
	async function pickProject() {
		if (!window.showOpenFilePicker) return $("vd-projfile").click();
		var hs; try { hs = await window.showOpenFilePicker({ types: [{ description: "MES Video Editor project", accept: { "application/json": [".mesvideo"] } }] }); } catch (e) { return; }
		var f = await hs[0].getFile(); askOpenProject(f, hs[0]);
	}
	$("vd-projfile").onchange = function () { var f = this.files[0]; this.value = ""; if (f) askOpenProject(f); };
	function isProjectFile(f) { return /\.mesvideo$/i.test(f.name || ""); }
	// another project is open (clips or media in it): say so before replacing it
	function askOpenProject(f, h) {
		var n = VE.P.clips.length, nm = VE.bin.length;
		if (!n && !nm) return openProject(f, h);
		dialog("<h3>Open " + esc(f.name) + "?</h3><p class=\"vd-dtxt\">A project is already open: <b>" + esc(VE.P.name || "Untitled video") + "</b> (" + n + " clip" + (n === 1 ? "" : "s") + ", " + nm + " media file" + (nm === 1 ? "" : "s") + "). Opening the new one replaces it in this browser. Its media files stay in the library only if the new project uses them.</p>" +
			"<p class=\"vd-dtxt\">Save a project file of the current one first if you want to come back to it.</p>" +
			"<div class=\"vd-dlgact\"><button type=\"button\" class=\"vd-btn vd-primary\" id=\"vd-op-save\">Save current, then open</button> <button type=\"button\" class=\"vd-btn\" id=\"vd-op-go\">Open without saving</button> <button type=\"button\" class=\"vd-btn\" id=\"vd-op-no\">Cancel</button></div>");
		$("vd-op-save").onclick = async function () { closeDialog(); if (await saveProject()) openProject(f, h); };
		$("vd-op-go").onclick = function () { closeDialog(); openProject(f, h); };
		$("vd-op-no").onclick = closeDialog;
	}
	function openProject(f, h) {
		f.text().then(async function (txt) {
			var d = JSON.parse(txt); if (!d || d.format !== "mes-video") throw new Error("This is not a MES Video Editor project file.");
			P.pause(); var p = V.normalize(d.project), keep = {};
			VE.bin.forEach(function (m) { keep[m.id] = m; });
			var bin = [];
			for (var j = 0; j < (d.media || []).length; j++) {
				var x = d.media[j]; if (keep[x.id]) { bin.push(keep[x.id]); continue; }
				var blob = await VE.idbGet("blobs", "m:" + x.id).catch(function () { return null; });
				var m = Object.assign({}, x, { state: blob ? "working" : "missing", status: blob ? "Opening..." : "Missing: add " + (x.origName || x.name) + " to relink it." });
				if (blob) m.file = blob instanceof File ? blob : new File([blob], x.name);
				bin.push(m);
			}
			VE.bin = bin; VE.P = p; VE.sel = []; VE.hist = new V.History(200); VE.hist.push(JSON.stringify(p));
			VE.bin.forEach(function (m) { if (m.state === "working" && m.file && !m.url) VE.prepare(m, false); });
			VE.emit("bin"); VE.commit("Open project");
			var hh = h && typeof h.then === "function" ? await h.catch(function () { return null; }) : h;   // a dropped file's handle arrives as a promise
			if (hh && hh.kind === "file") linkProject(hh, f.lastModified); else linkProject(null);
			var miss = VE.bin.filter(function (m) { return m.state === "missing"; }).length;
			toast(miss ? miss + " media file" + (miss > 1 ? "s are" : " is") + " missing: drop them in (same names) to relink." : "Project opened.", 8000);
		}).catch(function (e) { toast("Could not open it: " + e.message); });
	}

	/* ---------- inspector ---------- */
	var insp = $("vd-insp");
	function num(id, label, val, step, min, max, unit, title) { return '<label class="vd-f" title="' + esc(title || "") + '"><span>' + label + '</span><input type="number" id="' + id + '" value="' + val + '" step="' + step + '"' + (min != null ? ' min="' + min + '"' : "") + (max != null ? ' max="' + max + '"' : "") + ">" + (unit ? "<em>" + unit + "</em>" : "") + "</label>"; }
	function r1(x) { return Math.round(x * 100) / 100; }
	function tcBox(id, label, t, title) { return '<label class="vd-f" title="' + esc(title || "") + '"><span>' + label + '</span><input type="text" class="vd-tcin" id="' + id + '" value="' + esc(V.tc(t, VE.P.fps)) + '" spellcheck="false" autocomplete="off"></label>'; }
	function copyText(txt, msg) {
		var done = function () { toast(msg); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
		function fallback() { var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Could not copy: select the text and copy it yourself."); } ta.remove(); }
	}
	function clipName(c) { var m = VE.media(c.media); return m ? m.name : "(missing file)"; }
	function copyAllSources() {
		var lines = V.sourceList(VE.P, clipName);
		if (!lines.length) return toast("There are no video or sound clips on the timeline.");
		copyText(lines.join("\n"), "Copied the source times of " + lines.length + " clip" + (lines.length === 1 ? "" : "s") + ".");
	}
	function renderInsp() {
		var sel = VE.selected();
		if (!sel.length) return renderProject();
		if (sel.length > 1) return renderMulti(sel);
		var c = sel[0], m = VE.media(c.media), h = '<h3>' + esc(c.type === "text" ? "Title" : m ? m.name : "Clip") + '</h3><p class="vd-sub">' + ({ video: "Video clip", audio: "Sound clip", image: "Picture", text: "Title" })[c.type] + " · " + V.short(V.dur(c)) + "</p>";
		h += '<div class="vd-sec"><b>Time</b><div class="vd-grid">' + num("vd-i-start", "Starts at", r1(c.start), 0.01, 0, null, "s") + num("vd-i-dur", "Length", r1(V.dur(c)), 0.01, 0.05, null, "s") + "</div>";
		if (V.hasSource(c)) h += '<div class="vd-src"><b class="vd-srch">Source times <small>(where this clip is in its file)</small></b><div class="vd-grid">' + tcBox("vd-i-sin", "Begins at", c.in, "Where the clip begins in " + (m ? m.name : "its file") + ". Type a time (1:02:03;15, 263, 4m23s) and press Enter to trim the start.") + tcBox("vd-i-sout", "Ends at", c.out, "Where the clip ends in its file. Type a time and press Enter to trim the end.") + '</div><div class="vd-row"><button type="button" class="vd-btn vd-sm" id="vd-i-scopy" title="Copy the begin and end times in the file">Copy source times</button>' + (VE.P.clips.filter(V.hasSource).length > 1 ? '<button type="button" class="vd-btn vd-sm" id="vd-i-scopyall" title="Copy the source times of every video and sound clip, in timeline order">Copy for all clips</button>' : "") + "</div></div>";
		h += '<div class="vd-grid">' + num("vd-i-fin", "Fade in", r1(c.fin || 0), 0.1, 0, 30, "s") + num("vd-i-fout", "Fade out", r1(c.fout || 0), 0.1, 0, 30, "s") + "</div>";
		var prev = V.prevTouching(VE.P, c);
		h += num("vd-i-xin", "Cross-fade from the clip before", r1(c.xin || 0), 0.1, 0, 10, "s", prev ? "The clip starts showing this long before its start, fading in over the clip before it" : "Put this clip right after another one on the same track to cross-fade");
		if (!prev) h += '<p class="vd-sub">Cross-fades work when this clip starts exactly where another clip on its track ends.</p>';
		if (c.type === "video" || c.type === "audio") h += '<label class="vd-f"><span>Speed</span><select id="vd-i-speed">' + [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map(function (s) { return '<option value="' + s + '"' + (Math.abs((c.speed || 1) - s) < 1e-6 ? " selected" : "") + ">" + s + "×</option>"; }).join("") + "</select></label>";
		h += "</div>";
		if (c.type === "text") {
			var T = c.text;
			h += '<div class="vd-sec"><b>Text</b><textarea id="vd-ttext" rows="3" aria-label="Title text">' + esc(T.s) + "</textarea>";
			h += '<div class="vd-grid"><label class="vd-f"><span>Font</span><select id="vd-t-font">' + [["Arial, Helvetica, sans-serif", "Arial"], ["Georgia, serif", "Georgia"], ["'Times New Roman', serif", "Times"], ["Verdana, sans-serif", "Verdana"], ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Impact, sans-serif", "Impact"], ["'Courier New', monospace", "Courier"], ["system-ui, sans-serif", "System"]].map(function (f) { return '<option value="' + esc(f[0]) + '"' + (T.font === f[0] ? " selected" : "") + ">" + f[1] + "</option>"; }).join("") + "</select></label>" +
				num("vd-t-size", "Size", Math.round(T.size * 1000) / 10, 0.5, 1, 60, "%", "Height of the letters as a share of the picture height") + '<label class="vd-f"><span>Colour</span><input type="color" id="vd-t-color" value="' + esc(T.color) + '"></label>' +
				'<label class="vd-f"><span>Align</span><select id="vd-t-align">' + ["left", "center", "right"].map(function (a) { return '<option' + (T.align === a ? " selected" : "") + ">" + a + "</option>"; }).join("") + "</select></label></div>";
			h += '<div class="vd-checks"><label><input type="checkbox" id="vd-t-bold"' + (T.bold ? " checked" : "") + "> Bold</label><label><input type=\"checkbox\" id=\"vd-t-italic\"" + (T.italic ? " checked" : "") + "> Italic</label><label><input type=\"checkbox\" id=\"vd-t-shadow\"" + (T.shadow ? " checked" : "") + "> Shadow</label><label><input type=\"checkbox\" id=\"vd-t-bgon\"" + (T.bgOn ? " checked" : "") + "> Box behind</label></div>";
			h += '<div class="vd-grid"><label class="vd-f"><span>Box colour</span><input type="color" id="vd-t-bg" value="' + esc(T.bg) + '"></label>' + num("vd-t-bgop", "Box opacity", Math.round((T.bgOp == null ? 0.55 : T.bgOp) * 100), 5, 0, 100, "%") + num("vd-t-outline", "Outline", T.outline || 0, 0.5, 0, 10) + '<label class="vd-f"><span>Outline colour</span><input type="color" id="vd-t-ocolor" value="' + esc(T.ocolor || "#000000") + '"></label></div></div>';
		}
		if (c.type !== "audio") {
			var rel = VE.t - c.start, ptol = 0.5 / VE.P.fps, run = c.anims && V.active(c, VE.t) ? V.animRunning(c, rel, ptol) : null, st = V.active(c, VE.t) ? V.stateAt(c, rel) : V.baseState(c);
			var ownA = !run && c.anims && V.active(c, VE.t) ? V.animEndingAt(c, rel, ptol) || ["x", "y", "scale", "rot", "op"].map(function (k) { return V.propOwner(c, rel, k, ptol); }).filter(Boolean)[0] : null;
			h += '<div class="vd-sec"><b>Position</b><p class="vd-sub">' + (run ? "The playhead is inside the animation &ldquo;" + esc(V.animName(run)) + "&rdquo;: move it to the animation's start or end to change these." : ownA ? "At the playhead: the end of &ldquo;" + esc(V.animName(ownA)) + "&rdquo;. Changes here (or dragging in the preview) move where that animation ends." : "Or drag it in the preview: a corner resizes, the round handle turns it.") + '</p><fieldset class="vd-fs"' + (run ? " disabled" : "") + '><div class="vd-grid">' + num("vd-i-x", "Left / right", Math.round(st.x * 1000) / 10, 0.5, -500, 500, "%") + num("vd-i-y", "Up / down", Math.round(st.y * 1000) / 10, 0.5, -500, 500, "%") + num("vd-i-scale", "Size", Math.round(st.scale * 1000) / 10, 1, 1, 4000, "%") + num("vd-i-rot", "Turn", Math.round(st.rot * 10) / 10, 1, -3600, 3600, "°") + num("vd-i-op", "Opacity", Math.round(st.op * 100), 5, 0, 100, "%") + "</div>";
			if (c.type !== "text") h += '<div class="vd-grid">' + num("vd-i-cl", "Crop left", Math.round(st.cl * 1000) / 10, 0.5, 0, 95, "%") + num("vd-i-cr", "Crop right", Math.round(st.cr * 1000) / 10, 0.5, 0, 95, "%") + num("vd-i-ct", "Crop top", Math.round(st.ct * 1000) / 10, 0.5, 0, 95, "%") + num("vd-i-cb", "Crop bottom", Math.round(st.cb * 1000) / 10, 0.5, 0, 95, "%") + "</div>";
			h += "</fieldset>";
			h += '<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-pos="center">Centre</button><button type="button" class="vd-btn vd-sm" data-pos="fit">Fit the frame</button>' + (c.type !== "text" ? '<button type="button" class="vd-btn vd-sm" data-pos="fill">Fill the frame</button><button type="button" class="vd-btn vd-sm" data-pos="pip">Corner (picture in picture)</button>' : "") + "</div></div>";
		}
		if (c.type !== "audio") h += animSection(c);
		h += linkSection(c);
		if (VE.hasSound(c)) h += soundSection([c]);
		h += '<div class="vd-row vd-acts"><button type="button" class="vd-btn vd-sm" data-ca="split">Split at playhead</button><button type="button" class="vd-btn vd-sm" data-ca="dup">Duplicate</button><button type="button" class="vd-btn vd-sm" data-ca="del">Delete</button></div>';
		insp.innerHTML = h; bindInsp(c); bindLink(c); bindAnims(c);
	}
	function soundSection(list) {
		var c = list[0], db = Math.round(V.db(c.vol == null ? 1 : c.vol) * 10) / 10;
		var h = '<div class="vd-sec"><b>Sound</b>';
		if (list.length === 1) h += '<label class="vd-f vd-wide"><span>Volume <output id="vd-volout">' + (isFinite(db) ? (db > 0 ? "+" : "") + db + " dB" : "off") + '</output></span><input type="range" id="vd-i-vol" min="-40" max="20" step="0.5" value="' + (isFinite(db) ? db : -40) + '"></label><div class="vd-checks"><label><input type="checkbox" id="vd-i-mute"' + (c.mute ? " checked" : "") + "> Mute this clip</label></div>";
		h += "</div>" + fxSection(list) + '<div class="vd-sec"><b>Clean up</b>';
		var cleaned = list.filter(function (x) { return x.clean && x.clean.key; }).length;
		h += '<div class="vd-clean"><div class="vd-grid"><label class="vd-f"><span>Noise removal</span><select id="vd-dn-model"><option value="auto">Automatic (best available)</option><option value="deepfilter">DeepFilterNet (AI, best)</option><option value="rnnoise">RNNoise (AI, fast)</option><option value="spectral">Spectral (no download)</option></select></label>' + num("vd-dn-str", "Strength", Math.round((UI.dnStr == null ? 1 : UI.dnStr) * 100), 5, 0, 100, "%") + "</div>" +
			'<div class="vd-row"><button type="button" class="vd-btn vd-sm vd-primary" id="vd-dn-go">Remove noise' + (list.length > 1 ? " (" + list.length + " clips)" : "") + "</button>" + (cleaned ? '<button type="button" class="vd-btn vd-sm" id="vd-dn-off">Use the original sound</button>' : "") + '</div><p class="vd-sub" id="vd-dn-st">' + (cleaned ? (list.length > 1 ? cleaned + " of " + list.length + " clips have" : "This clip has") + " noise removed (" + esc((c.clean && c.clean.model) || "") + ")." : "Takes out hum, hiss and room noise. The first time, the AI model downloads (a few MB).") + "</p></div>";
		h += '<div class="vd-clean"><div class="vd-grid"><label class="vd-f"><span>Normalize loudness to</span><select id="vd-ln-tgt">' + [[-14, "-14 LUFS (YouTube, loud)"], [-16, "-16 LUFS (videos, podcasts)"], [-19, "-19 LUFS (quieter)"], [-23, "-23 LUFS (TV, EBU R128)"]].map(function (q) { return '<option value="' + q[0] + '"' + ((UI.lnTgt || -16) === q[0] ? " selected" : "") + ">" + q[1] + "</option>"; }).join("") + '</select></label></div><div class="vd-row"><button type="button" class="vd-btn vd-sm" id="vd-ln-go">Normalize loudness' + (list.length > 1 ? " (" + list.length + " clips)" : "") + '</button></div><p class="vd-sub" id="vd-ln-st">' + (c.lufs != null ? "Set to " + c.lufs + " LUFS." : "Sets the volume so the clip is as loud as the target, never clipping.") + "</p></div>" + (list.length === 1 ? '<div class="vd-row"><button type="button" class="vd-btn vd-sm" id="vd-cmp-go" title="See and hear the original and the edited sound one above the other (C)">&#8645; Compare before / after</button></div>' : "") + "</div>";
		return h;
	}
	function renderMulti(sel) {
		var snd = sel.filter(VE.hasSound);
		var h = "<h3>" + sel.length + ' clips selected</h3><p class="vd-sub">Shift- or Ctrl-click clips to add or remove them.</p>';
		if (snd.length) h += soundSection(snd);
		h += '<div class="vd-row vd-acts"><button type="button" class="vd-btn vd-sm" data-ca="split">Split at playhead</button><button type="button" class="vd-btn vd-sm" data-ca="dup">Duplicate</button><button type="button" class="vd-btn vd-sm" data-ca="del">Delete</button></div>';
		insp.innerHTML = h; bindSound(snd); bindActs();
	}
	function renderProject() {
		var p = VE.P, d = V.duration(p);
		var h = '<h3>Project</h3><p class="vd-sub">' + p.clips.length + " clip" + (p.clips.length === 1 ? "" : "s") + " · " + V.tc(d, p.fps) + "</p>";
		h += '<div class="vd-sec"><b>Picture size</b><div class="vd-grid">' + num("vd-p-w", "Width", p.w, 2, 16, 7680, "px") + num("vd-p-h", "Height", p.h, 2, 16, 4320, "px") + "</div>";
		var bin0 = VE.bin.filter(function (m) { return m.kind === "video" && m.w; })[0];
		h += '<div class="vd-row vd-wrap">' + V.CANVAS_PRESETS.map(function (s) { return '<button type="button" class="vd-btn vd-sm" data-size="' + s[0] + '"' + (p.w + "x" + p.h === s[0] ? ' aria-pressed="true"' : "") + ">" + s[1] + "</button>"; }).join("") + (bin0 ? '<button type="button" class="vd-btn vd-sm" data-size="' + (Math.round(bin0.w / 2) * 2) + "x" + (Math.round(bin0.h / 2) * 2) + '">Like ' + esc(bin0.name.slice(0, 18)) + " (" + bin0.w + "×" + bin0.h + ")</button>" : "") + "</div>";
		h += '<div class="vd-grid"><label class="vd-f"><span>Frame rate</span><select id="vd-p-fps">' + [24, 25, 29.97, 30, 50, 60].map(function (f) { return '<option value="' + f + '"' + (Math.abs(p.fps - f) < 0.01 ? " selected" : "") + ">" + f + " fps</option>"; }).join("") + (([24, 25, 29.97, 30, 50, 60].some(function (f) { return Math.abs(p.fps - f) < 0.01; })) ? "" : '<option selected value="' + p.fps + '">' + p.fps + " fps</option>") + '</select></label><label class="vd-f"><span>Background</span><input type="color" id="vd-p-bg" value="' + esc(p.bg) + '"></label></div></div>';
		var nsrc = p.clips.filter(V.hasSource).length;
		if (nsrc) h += '<div class="vd-sec"><b>Source times</b><p class="vd-sub">Where each video and sound clip begins and ends in its file (handy after splitting a long recording into parts).</p><ol class="vd-srclist">' + V.sourceList(p, clipName).slice(0, 40).map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ol>" + (nsrc > 40 ? '<p class="vd-sub">… and ' + (nsrc - 40) + " more (all of them are copied).</p>" : "") + '<div class="vd-row"><button type="button" class="vd-btn vd-sm" id="vd-p-scopy">Copy the list</button></div></div>';
		h += '<div class="vd-sec"><b>Start here</b><ol class="vd-steps"><li>Import videos, sound and pictures (or drop them in).</li><li>Drag them onto the timeline, or select several and press <i>Add selected in order</i> to join them.</li><li>Click a clip to trim, split (S), fade, move or clean up its sound here.</li><li>Press <i>Export MP4</i>.</li></ol><p class="vd-sub">Your work is saved in this browser as you go.</p></div>';
		insp.innerHTML = h;
		function setSize(w, hh) { VE.setCanvas(w, hh); }
		$("vd-p-w").onchange = function () { setSize(+this.value || p.w, p.h); }; $("vd-p-h").onchange = function () { setSize(p.w, +this.value || p.h); };
		insp.querySelectorAll("[data-size]").forEach(function (b) { b.onclick = function () { var s = b.getAttribute("data-size").split("x"); setSize(+s[0], +s[1]); }; });
		$("vd-p-fps").onchange = function () { p.fps = +this.value; VE.commit("Frame rate"); };
		$("vd-p-bg").onchange = function () { p.bg = this.value; VE.commit("Background"); };
		if ($("vd-p-scopy")) $("vd-p-scopy").onclick = copyAllSources;
	}
	function bindInsp(c) {
		function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }
		on("vd-cmp-go", "click", function () { VE.compareSound(c); });
		// source times: typing a new begin / end trims the clip in place (its start on the timeline stays put)
		function setSrc(id, which) {
			var el = $(id); if (!el) return;
			el.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); el.blur(); } else if (e.key === "Escape") { el.value = V.tc(which === "in" ? c.in : c.out, VE.P.fps); el.blur(); } e.stopPropagation(); });
			el.addEventListener("change", function () {
				var cur = which === "in" ? c.in : c.out, v = V.parseGoto(el.value, VE.P.fps, cur);
				if (v == null) { toast("Type a time like 1:02:03;15, 263 (seconds) or 4m23s."); return renderInsp(); }
				var sp = c.speed || 1, min = sp / VE.P.fps, md = VE.mediaDur(c), nIn = c.in, nOut = c.out;
				if (which === "in" ? v >= c.out - min : v <= c.in + min) { toast(which === "in" ? "The begin has to be before the end (" + V.tc(c.out, VE.P.fps) + ")." : "The end has to be after the begin (" + V.tc(c.in, VE.P.fps) + ")."); return renderInsp(); }
				if (which === "in") nIn = V.clamp(v, 0, c.out - min); else nOut = V.clamp(v, c.in + min, md < Infinity ? md : Infinity);
				var ign = {}; ign[c.id] = 1;
				if (!V.canPlace(VE.P, c.track, c.start, (nOut - nIn) / sp, ign)) { toast("That makes the clip run into the next clip on its track. Move that clip first."); return renderInsp(); }
				if (Math.abs(nIn - v) > 1e-6 && which === "in" || Math.abs(nOut - v) > 1e-6 && which === "out") toast("The file only goes from 0:00;00 to " + V.tc(md, VE.P.fps) + ": used the nearest time.");
				c.in = nIn; c.out = nOut; c.fin = Math.min(c.fin || 0, V.dur(c)); c.fout = Math.min(c.fout || 0, V.dur(c));
				VE.commit(which === "in" ? "Source begin" : "Source end");
			});
		}
		setSrc("vd-i-sin", "in"); setSrc("vd-i-sout", "out");
		on("vd-i-scopy", "click", function () { copyText(clipName(c) + ": " + V.srcText(c, VE.P.fps), "Copied: " + V.srcText(c, VE.P.fps)); });
		on("vd-i-scopyall", "click", copyAllSources);
		function setNum(id, fn, label) { on(id, "change", function () { var v = parseFloat(this.value); if (!isFinite(v)) return renderInsp(); fn(v); VE.commit(label); }); }
		setNum("vd-i-start", function (v) { var s = Math.max(0, v); if (V.canPlace(VE.P, c.track, s, V.dur(c), (function () { var o = {}; o[c.id] = 1; return o; })())) c.start = s; else toast("There is no room there on this track."); }, "Move");
		setNum("vd-i-dur", function (v) { var r = V.trim(c, "r", c.start + Math.max(0.05, v), { mediaDur: VE.mediaDur(c), hi: nextStart(c), minDur: 1 / VE.P.fps }); Object.assign(c, r); }, "Length");
		setNum("vd-i-fin", function (v) { c.fin = V.clamp(v, 0, V.dur(c)); }, "Fade in"); setNum("vd-i-fout", function (v) { c.fout = V.clamp(v, 0, V.dur(c)); }, "Fade out");
		setNum("vd-i-xin", function (v) { var prev = V.prevTouching(VE.P, c); c.xin = prev ? V.clamp(v, 0, Math.min(V.dur(prev), V.dur(c))) : 0; if (!prev && v > 0) toast("Put this clip right after another clip on the same track first."); }, "Cross-fade");
		on("vd-i-speed", "change", function () { var s = +this.value, d = V.dur(c), endS = c.in + d * s; c.speed = s; var md = VE.mediaDur(c); c.out = Math.min(md, endS); var ign = {}; ign[c.id] = 1; if (!V.canPlace(VE.P, c.track, c.start, V.dur(c), ign)) { var hi = nextStart(c); if (hi < Infinity) c.out = c.in + (hi - c.start) * s; } VE.commit("Speed"); });
		// position values are the ones seen at the playhead: at an animation's end they change that animation, else the clip itself
		function setP(k, v) { if (V.active(c, VE.t)) V.setPropAt(c, VE.t - c.start, k, v, 0.5 / VE.P.fps); else { var b = V.baseState(c); b[k] = v; V.setBase(c, b); } }
		setNum("vd-i-x", function (v) { setP("x", v / 100); }, "Position"); setNum("vd-i-y", function (v) { setP("y", v / 100); }, "Position"); setNum("vd-i-scale", function (v) { setP("scale", V.clamp(v / 100, 0.01, 40)); }, "Size"); setNum("vd-i-op", function (v) { setP("op", V.clamp(v / 100, 0, 1)); }, "Opacity");
		setNum("vd-i-rot", function (v) { setP("rot", V.clamp(v, -3600, 3600)); }, "Turn");
		["l", "r", "t", "b"].forEach(function (k) { setNum("vd-i-c" + k, function (v) { setP("c" + k, V.clamp(v / 100, 0, 0.95)); }, "Crop"); });
		insp.querySelectorAll("[data-pos]").forEach(function (b) { b.onclick = function () { var a = b.getAttribute("data-pos"), m = VE.media(c.media); c.x = 0.5; c.y = 0.5; if (a === "fit") c.scale = 1; if (a === "fill" && m && m.w) c.scale = Math.max(VE.P.w / m.w, VE.P.h / m.h) / Math.min(VE.P.w / m.w, VE.P.h / m.h); if (a === "pip") { c.scale = 0.3; c.x = 0.82; c.y = 0.8; } if (a === "center" && c.type === "text") c.y = 0.5; VE.commit("Position"); }; });
		if (c.type === "text") {
			var T = c.text, live = function () { VE.preview.draw(); };
			on("vd-ttext", "input", function () { T.s = this.value; live(); }); on("vd-ttext", "change", function () { VE.commit("Title text"); });
			on("vd-t-font", "change", function () { T.font = this.value; VE.commit("Font"); }); setNum("vd-t-size", function (v) { T.size = V.clamp(v / 100, 0.01, 0.6); }, "Text size");
			on("vd-t-color", "input", function () { T.color = this.value; live(); }); on("vd-t-color", "change", function () { VE.commit("Text colour"); });
			on("vd-t-align", "change", function () { T.align = this.value; VE.commit("Align"); });
			["bold", "italic", "shadow"].forEach(function (k) { on("vd-t-" + k, "change", function () { T[k] = this.checked; VE.commit("Text style"); }); });
			on("vd-t-bgon", "change", function () { T.bgOn = this.checked; VE.commit("Text box"); });
			on("vd-t-bg", "input", function () { T.bg = this.value; live(); }); on("vd-t-bg", "change", function () { VE.commit("Box colour"); });
			setNum("vd-t-bgop", function (v) { T.bgOp = V.clamp(v / 100, 0, 1); }, "Box opacity"); setNum("vd-t-outline", function (v) { T.outline = V.clamp(v, 0, 10); }, "Outline");
			on("vd-t-ocolor", "change", function () { T.ocolor = this.value; VE.commit("Outline colour"); });
		}
		if (VE.hasSound(c)) {
			on("vd-i-vol", "input", function () { var d = +this.value; c.vol = d <= -40 ? 0 : V.fromDb(d); c.lufs = null; $("vd-volout").textContent = d <= -40 ? "off" : (d > 0 ? "+" : "") + d + " dB"; VE.preview.sync(); });
			on("vd-i-vol", "change", function () { VE.commit("Volume"); });
			on("vd-i-mute", "change", function () { c.mute = this.checked; VE.commit(c.mute ? "Mute" : "Unmute"); });
			bindSound([c]);
		}
		bindActs();
	}
	function bindActs() { insp.querySelectorAll("[data-ca]").forEach(function (b) { b.onclick = function () { var a = b.getAttribute("data-ca"); if (a === "split") VE.split(); else if (a === "dup") VE.duplicate(); else VE.del(false); }; }); }
	function nextStart(c) { var hi = Infinity; V.onTrack(VE.P, c.track).forEach(function (x) { if (x !== c && x.start >= c.start + 1e-4) hi = Math.min(hi, x.start); }); return hi; }
	function bindSound(list) {
		var m = $("vd-dn-model"); if (m) m.value = UI.dnModel || "auto";
		if (m) m.onchange = function () { UI.dnModel = m.value; saveUI(); };
		var st = $("vd-dn-str"); if (st) st.onchange = function () { UI.dnStr = V.clamp((st.value === "" ? 100 : +st.value) / 100, 0, 1); saveUI(); };
		var go = $("vd-dn-go"); if (go) go.onclick = function () { denoise(list); };
		var off = $("vd-dn-off"); if (off) off.onclick = function () { list.forEach(function (c) { c.clean = null; }); VE.commit("Original sound"); };
		var lt = $("vd-ln-tgt"); if (lt) lt.onchange = function () { UI.lnTgt = +lt.value; saveUI(); };
		var lg = $("vd-ln-go"); if (lg) lg.onclick = function () { normalize(list); };
		bindFx(list);
	}
	var inspTimer = 0;
	VE.on("select", function () { renderInsp(); VE.tl.markSel(); });
	VE.on("change", function () { if (!insp.contains(document.activeElement) || document.activeElement.type === "button") renderInsp(); updateButtons(); timeText(); });
	VE.on("live", function () { clearTimeout(inspTimer); inspTimer = setTimeout(function () { if (!insp.contains(document.activeElement)) renderInsp(); }, 120); });
	var tInsp = 0;
	VE.on("time", function () { if (VE.preview.playing) return; var c = VE.selected()[0]; if (!c || c.type === "audio" || !c.anims) return; clearTimeout(tInsp); tInsp = setTimeout(function () { if (!insp.contains(document.activeElement) || document.activeElement.type === "button") renderInsp(); }, 90); });
	VE.on("editText", function (c) { VE.sel = [c.id]; renderInsp(); var ta = $("vd-ttext"); if (ta) { ta.focus(); ta.select(); } });
	function updateButtons() {
		$("vd-undo").disabled = !VE.hist.canUndo(); $("vd-redo").disabled = !VE.hist.canRedo();
		$("vd-cutrange").disabled = !marksOk(); $("vd-clearmarks").disabled = !(VE.P.marks && (VE.P.marks.in != null || VE.P.marks.out != null));
		var nm = $("vd-name"); if (document.activeElement !== nm) nm.value = VE.P.name;
		$("vd-sep").disabled = !VE.selected().some(function (c) { return c.type === "video" && VE.hasSound(c); });
		$("vd-status").textContent = VE.P.clips.length + " clip" + (VE.P.clips.length === 1 ? "" : "s") + " · " + VE.P.w + "×" + VE.P.h + " · " + VE.P.fps + " fps" + (VE.lastLabel ? " · " + VE.lastLabel : "");
	}
	$("vd-name").addEventListener("change", function () { VE.P.name = this.value.trim() || "Untitled video"; VE.commit("Rename"); });
	VE.on("saved", function () { $("vd-saved").textContent = "Saved in this browser"; });
	VE.on("saveError", function () { $("vd-saved").textContent = "Could not save in this browser"; });

	/* ---------- sound clean-up ---------- */
	function loadDenoise() {
		if (window.MESDenoise) return Promise.resolve(window.MESDenoise);
		return new Promise(function (res) {
			var s = document.createElement("script"); s.src = "/main_js/denoise.js?v=2"; s.onload = function () { res(window.MESDenoise || null); }; s.onerror = function () { res(null); }; document.head.appendChild(s);
		});
	}
	var cleaning = false;
	async function denoise(list) {
		if (cleaning) return; var stEl = function (t) { var e = $("vd-dn-st"); if (e) e.textContent = t; };
		var D = await loadDenoise();
		if (!D || typeof D.process !== "function") { stEl("Noise removal is not available yet: it is being added to mes.fm (the MES Audio Editor's engine). Normalize loudness works now."); return; }
		cleaning = true; var model = UI.dnModel || "auto", strength = UI.dnStr == null ? 1 : UI.dnStr, done = 0; var tp = tabTask("Removing noise" + (list.length > 1 ? " from " + list.length + " clips" : ""));
		try {
			if (D.load) { stEl("Loading the noise-removal model..."); await D.load({ model: model, onProgress: function (x) { stEl("Loading the noise-removal model... " + Math.round((x && x.progress != null ? x.progress : x) * 100) + "%"); } }); }
			for (var j = 0; j < list.length; j++) {
				var c = list[j], m = VE.media(c.media); if (!m) continue;
				var a = Math.max(0, c.in - (c.xin || 0) * (c.speed || 1) - 0.25), b = Math.min(m.dur, c.out + 0.25), tag = list.length > 1 ? "Clip " + (j + 1) + " of " + list.length + ": " : "";
				stEl(tag + "reading the sound...");
				var pcm = await VE.pcmRange(m, a, b, function (x) { stEl(tag + "reading the sound... " + Math.round(x * 100) + "%"); });
				stEl(tag + "removing noise...");
				var out = await D.process(pcm, 48000, { model: model, strength: strength, onProgress: function (x) { var fx = x && x.progress != null ? x.progress : x; tp.set((j + fx) / list.length); stEl(tag + "removing noise... " + Math.round(fx * 100) + "%"); } });
				if (!out || !out.length) throw new Error("the noise remover returned no sound");
				var key = V.uid("k"); await VE.idbPut("blobs", "c:" + key, { a: a, rate: 48000, ch: out.map(function (x) { return x.buffer.byteLength === x.length * 4 ? x.buffer : x.slice().buffer; }) });
				VE.cleanCache[key] = { start: a, rate: 48000, ch: out };
				c.clean = { key: key, a: a, b: b, model: (D.lastModel || model), strength: strength }; done++;
			}
			tp.done(); VE.commit("Remove noise"); toast("Noise removed from " + done + " clip" + (done > 1 ? "s" : "") + ". Press Play to hear it, or Compare before / after to see it.");
		} catch (e) { tp.fail("Failed"); stEl("Noise removal failed: " + (e && e.message || e)); if (window.console) console.error(e); }
		cleaning = false;
	}
	async function normalize(list) {
		var target = UI.lnTgt || -16, stEl = function (t) { var e = $("vd-ln-st"); if (e) e.textContent = t; }, n = 0;
		try {
			for (var j = 0; j < list.length; j++) {
				var c = list[j], m = VE.media(c.media); if (!m) continue;
				var meter = new V.LufsMeter(48000), tag = list.length > 1 ? "Clip " + (j + 1) + " of " + list.length + ": " : "";
				for (var s = c.in; s < c.out; s += 10) {
					var e2 = Math.min(c.out, s + 10), buf = await VE.clipPcm(c, s, e2), cnt = Math.round((e2 - s) * 48000);
					if (!buf || cnt <= 0) continue;
					var part = buf.ch.slice(0, 2).map(function () { return new Float32Array(cnt); }); V.mixInto(part, 0, cnt, buf, s, 1 / 48000, null); meter.push(part);
					stEl(tag + "measuring... " + Math.round((e2 - c.in) / (c.out - c.in) * 100) + "%");
				}
				var L = meter.result(); if (!isFinite(L)) { stEl(tag + "this clip is silent."); continue; }
				c.vol = V.normalizeGain(L, meter.peak, target, -1); c.lufs = target; n++;
				stEl(tag + "was " + L.toFixed(1) + " LUFS, volume now " + (V.db(c.vol) >= 0 ? "+" : "") + V.db(c.vol).toFixed(1) + " dB.");
			}
			if (n) { VE.commit("Normalize loudness"); toast(n + " clip" + (n > 1 ? "s" : "") + " set to " + target + " LUFS."); }
		} catch (e) { stEl("Could not measure: " + (e && e.message || e)); }
	}

	/* ---------- compare a clip's sound before / after its edits ---------- */
	// Original (the media's own sound) above Edited (noise removed, volume, fades, audio effects: what the export plays), on the same time and
	// level scale, plus "What was taken out" when noise was removed. Play keeps going when you switch Before / After (B), so you hear the
	// exact same words both ways. "Match levels" turns the edited sound up / down to the original's level so only the clean-up is compared.
	VE.compareSound = function (c) {
		var m = VE.media(c.media); if (!m || !VE.hasSound(c)) { toast("This clip has no sound to compare."); return; }
		var RATE = 48000, cl = { len: UI.cmpLen || 10, t0: 0, mode: "b", match: !!UI.cmpMatch, loop: UI.cmpLoop !== false, pos: 0, data: null, tok: 0 };
		var ac = null, srcs = [], gB = null, gA = null, playAt = 0, playFrom = 0, raf = 0;
		function cs() { return c.start; } function ce() { return V.end(c); }
		function place(t) { var L = Math.min(cl.len, ce() - cs()); cl.t0 = Math.max(cs(), Math.min(ce() - L, t)); cl.t1 = cl.t0 + L; }
		place(VE.t - cl.len / 2);
		dialog('<h3>Compare the sound: before and after</h3>' +
			'<div class="vd-cmp-bar"><button type="button" class="vd-btn vd-primary" id="vd-cmp-play" title="Play / pause (Space)">&#9654; Play</button>' +
			'<span class="vd-cmp-ab" role="radiogroup" aria-label="Listen to"><button type="button" class="vd-btn" data-ab="b" role="radio">Before (original)</button><button type="button" class="vd-btn" data-ab="a" role="radio">After (edited)</button></span>' +
			'<span class="vd-sub">B switches without stopping</span><span class="vd-sp"></span>' +
			'<label class="vd-cmp-ck"><input type="checkbox" id="vd-cmp-match"' + (cl.match ? " checked" : "") + '> Match levels</label><label class="vd-cmp-ck"><input type="checkbox" id="vd-cmp-loop"' + (cl.loop ? " checked" : "") + '> Loop</label>' +
			'<label class="vd-cmp-ck">Show <select id="vd-cmp-len">' + [5, 10, 30, 60].map(function (x) { return '<option value="' + x + '"' + (x === cl.len ? " selected" : "") + ">" + x + " s</option>"; }).join("") + '</select></label>' +
			'<button type="button" class="vd-btn vd-sm" id="vd-cmp-prev" title="Earlier part of the clip">&#8249; Earlier</button><button type="button" class="vd-btn vd-sm" id="vd-cmp-next" title="Later part of the clip">Later &#8250;</button></div>' +
			'<div class="vd-cmp-rows" id="vd-cmp-rows"><p class="vd-sub">Reading the sound...</p></div>' +
			'<p class="vd-sub" id="vd-cmp-note">Click or drag on a waveform to move. Both waveforms use the same scale (' + (VE.tl.wave === "db" ? "dB" : "linear") + '), so a quieter background shows as a thinner band between the words.</p>' +
			'<div class="vd-dlgact"><button type="button" class="vd-btn" id="vd-cmp-close">Close</button></div>');
		$("vd-dlg").classList.add("vd-dlg--cmp");
		dlgClose = function () { stop(); cl.tok++; if (ac) { try { ac.close(); } catch (e) { /* ignore */ } ac = null; } UI.cmpLen = cl.len; UI.cmpMatch = cl.match; UI.cmpLoop = cl.loop; saveUI(); };
		function abBtns() { $("vd-dlg").querySelectorAll("[data-ab]").forEach(function (b) { var on = b.getAttribute("data-ab") === cl.mode; b.classList.toggle("vd-primary", on); b.setAttribute("aria-checked", on ? "true" : "false"); }); }
		abBtns();
		function stats(ch) {
			var n = ch[0].length, blk = Math.round(RATE * 0.05), rms = [], pk = 0, e = 0;
			for (var i = 0; i < n; i += blk) { var be = 0, cnt = 0; for (var k = 0; k < ch.length; k++) { var x = ch[k]; for (var j = i, je = Math.min(n, i + blk); j < je; j++) { var v = x[j]; be += v * v; cnt++; if (v > pk) pk = v; else if (-v > pk) pk = -v; } } e += be; if (cnt) rms.push(be / cnt); }
			var sorted = rms.slice().sort(function (a, b) { return a - b; }), fl = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
			return { peak: V.db(pk), rms: V.db(Math.sqrt(e / Math.max(1, n * ch.length))), floor: V.db(Math.sqrt(fl)) };
		}
		function f1(d) { return isFinite(d) ? d.toFixed(1) + " dB" : "silent"; }
		async function load() {
			var tok = ++cl.tok; stop(); $("vd-cmp-rows").innerHTML = '<p class="vd-sub">Reading the sound...</p>';
			try {
				var sp = c.speed || 1, sa = V.srcAt(c, cl.t0), sb = V.srcAt(c, cl.t1), n = Math.max(1, Math.round((sb - sa) * RATE));
				var orig = await VE.pcmRange(m, Math.max(0, sa), sb); if (tok !== cl.tok) return;
				var nch = orig.length, cleaned = null;
				if (c.clean && c.clean.key) { var cp = await VE.cleanPcm(c.clean.key); if (cp) { cleaned = []; for (var k = 0; k < nch; k++) cleaned.push(new Float32Array(n)); V.mixInto(cleaned, 0, n, cp, sa, 1 / RATE, null); } }
				if (tok !== cl.tok) return;
				var base = cleaned || orig, after = [], blk = 480;
				for (var k2 = 0; k2 < nch; k2++) after.push(new Float32Array(n));
				for (var i = 0; i < n; i += blk) {
					var t = cl.t0 + (i + blk / 2) / RATE / sp, g = V.gainAt(VE.P, c, t) * VE.fxGainAt(c, t);
					for (var k3 = 0; k3 < nch; k3++) { var src = base[k3] || base[0], dst = after[k3]; for (var j = i, je = Math.min(n, i + blk); j < je; j++) dst[j] = src[j] * g; }
				}
				var removed = null;
				if (cleaned) { removed = []; for (var k4 = 0; k4 < nch; k4++) { var r = new Float32Array(n), o = orig[k4], cc = cleaned[k4]; for (var j2 = 0; j2 < n; j2++) r[j2] = o[j2] - cc[j2]; removed.push(r); } }
				var sB = stats(orig), sA = stats(after), match = isFinite(sB.rms) && isFinite(sA.rms) ? V.fromDb(Math.max(-30, Math.min(30, sB.rms - sA.rms))) : 1;
				cl.data = { n: n, sp: sp, orig: orig, after: after, removed: removed, sB: sB, sA: sA, sR: removed ? stats(removed) : null, match: match };
				cl.pos = Math.max(0, Math.min(n / RATE / sp, VE.t - cl.t0));
				build(); bufs = null;
			} catch (e) { if (tok === cl.tok) $("vd-cmp-rows").innerHTML = '<p class="vd-sub">Could not read the sound: ' + esc(e && e.message || String(e)) + "</p>"; }
		}
		function row(id, label, info) { return '<div class="vd-cmp-row"><div class="vd-cmp-lab"><b>' + label + '</b><span>' + info + '</span></div><div class="vd-cmp-cv"><canvas id="' + id + '"></canvas><i class="vd-cmp-ph"></i></div></div>'; }
		function build() {
			var D = cl.data, eg = D.match !== 1 && cl.match ? " (shown " + (V.db(D.match) > 0 ? "+" : "") + V.db(D.match).toFixed(1) + " dB to match)" : "";
			var h = '<div class="vd-cmp-time" id="vd-cmp-time"></div>' +
				row("vd-cmp-b", "Before: the original", "Peak " + f1(D.sB.peak) + " · average " + f1(D.sB.rms) + " · background " + f1(D.sB.floor)) +
				row("vd-cmp-a", "After: what the export plays", "Peak " + f1(D.sA.peak) + " · average " + f1(D.sA.rms) + " · background " + f1(D.sA.floor) + eg);
			if (D.removed) h += row("vd-cmp-r", "What was taken out", "Average " + f1(D.sR.rms) + ". Mostly noise is good; words here mean the clean-up was too strong.");
			var diff = D.sA.floor - D.sB.floor;
			h += '<p class="vd-cmp-sum">' + (isFinite(diff) ? "Background between the words: " + f1(D.sB.floor) + " &rarr; " + f1(D.sA.floor) + " (" + (diff <= 0 ? diff.toFixed(1) : "+" + diff.toFixed(1)) + " dB" + (cl.match ? "" : ", volume change included") + ")." : "") + "</p>";
			$("vd-cmp-rows").innerHTML = h; draw();
			$("vd-cmp-rows").querySelectorAll(".vd-cmp-cv").forEach(function (box) {
				function at(e) { var r = box.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * D.n / RATE / D.sp; }
				var down = false;
				box.addEventListener("pointerdown", function (e) { down = true; try { box.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } seekTo(at(e)); });
				box.addEventListener("pointermove", function (e) { if (down) seekTo(at(e)); });
				box.addEventListener("pointerup", function () { down = false; }); box.addEventListener("pointercancel", function () { down = false; });
			});
			marker();
		}
		function paint(cv, ch, color, color2, gain) {
			var box = cv.parentNode, W = Math.max(50, box.clientWidth), H = box.clientHeight || 90, dpr = Math.min(2, window.devicePixelRatio || 1);
			cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px";
			var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
			var mode = VE.tl.wave, mid = H / 2, half = H / 2 - 2, n = ch[0].length, gdb = V.db(gain || 1);
			g.font = "9px Arial, sans-serif"; g.textBaseline = "middle";
			(mode === "db" ? [0, -12, -24, -48] : [0, -6, -12]).forEach(function (d) { var y = V.waveY(d, mode) * half; g.fillStyle = d === 0 ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.09)"; g.fillRect(0, Math.round(mid - y), W, 1); g.fillRect(0, Math.round(mid + y), W, 1); if (d < 0 && y > 8) { g.fillStyle = "rgba(255,255,255,0.45)"; g.fillText(String(d), 3, mid - y + 6); } });
			g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(0, Math.round(mid), W, 1);
			for (var x = 0; x < W; x++) {
				var a = Math.floor(x * n / W), b = Math.max(a + 1, Math.floor((x + 1) * n / W)), mx = 0, e = 0, cnt = 0;
				for (var k = 0; k < ch.length; k++) { var xs = ch[k]; for (var j = a; j < b && j < n; j++) { var v = xs[j]; e += v * v; cnt++; if (v > mx) mx = v; else if (-v > mx) mx = -v; } }
				if (!cnt) continue;
				var ph = V.waveY(V.db(mx) + gdb, mode) * half, rh = V.waveY(V.db(Math.sqrt(e / cnt)) + gdb, mode) * half;
				if (ph > 0.3) { g.fillStyle = color; g.fillRect(x, mid - ph, 1, ph * 2); }
				if (rh > 0.3) { g.fillStyle = color2; g.fillRect(x, mid - rh, 1, rh * 2); }
			}
		}
		function draw() {
			var D = cl.data; if (!D) return;
			paint($("vd-cmp-b"), D.orig, "rgba(147,197,253,0.6)", "#bfdbfe", 1);
			paint($("vd-cmp-a"), D.after, "rgba(110,231,183,0.62)", "#a7f3d0", cl.match ? D.match : 1);
			if (D.removed) paint($("vd-cmp-r"), D.removed, "rgba(251,191,36,0.55)", "#fde68a", 1);
		}
		function dur() { var D = cl.data; return D ? D.n / RATE / D.sp : 0; }
		function marker() {
			var D = cl.data; if (!D) return; var p = dur() ? cl.pos / dur() * 100 : 0;
			$("vd-cmp-rows").querySelectorAll(".vd-cmp-ph").forEach(function (el) { el.style.left = p + "%"; });
			var tm = $("vd-cmp-time"); if (tm) tm.textContent = V.tc(cl.t0 + cl.pos, VE.P.fps) + "   (" + V.tc(cl.t0, VE.P.fps) + " to " + V.tc(cl.t1, VE.P.fps) + ")";
		}
		var bufs = null;
		function mkBuf(ch, gain) { var b = ac.createBuffer(Math.max(1, ch.length), ch[0].length, RATE); for (var k = 0; k < ch.length; k++) { var d = b.getChannelData(k), s = ch[k]; if (gain === 1) d.set(s); else for (var j = 0; j < s.length; j++) d[j] = s[j] * gain; } return b; }
		function play() {
			var D = cl.data; if (!D) return;
			if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { toast("This browser cannot play sound here."); return; } }
			if (ac.state === "suspended") ac.resume();
			if (!bufs || bufs.match !== cl.match) bufs = { b: mkBuf(D.orig, 1), a: mkBuf(D.after, cl.match ? D.match : 1), match: cl.match };
			stop(true); if (cl.pos >= dur() - 0.02) cl.pos = 0;
			gB = ac.createGain(); gA = ac.createGain(); gB.gain.value = cl.mode === "b" ? 1 : 0; gA.gain.value = cl.mode === "a" ? 1 : 0; gB.connect(ac.destination); gA.connect(ac.destination);
			var when = ac.currentTime + 0.03, off = cl.pos * D.sp;
			[[bufs.b, gB], [bufs.a, gA]].forEach(function (q) { var s = ac.createBufferSource(); s.buffer = q[0]; s.playbackRate.value = D.sp; s.connect(q[1]); s.start(when, off); srcs.push(s); });
			srcs[0].onended = function () { if (!srcs.length) return; if (cl.loop) { cl.pos = 0; play(); } else { stop(); cl.pos = dur(); marker(); } };
			playAt = when; playFrom = cl.pos; $("vd-cmp-play").innerHTML = "&#10074;&#10074; Pause";
			cancelAnimationFrame(raf); (function tick() { if (!srcs.length) return; cl.pos = Math.max(0, Math.min(dur(), playFrom + (ac.currentTime - playAt))); marker(); raf = requestAnimationFrame(tick); })();
		}
		function stop(keep) {
			cancelAnimationFrame(raf); var list = srcs; srcs = [];
			list.forEach(function (s) { s.onended = null; try { s.stop(); } catch (e) { /* ignore */ } });
			if (!keep) { var b = $("vd-cmp-play"); if (b) b.innerHTML = "&#9654; Play"; }
		}
		function seekTo(t) { cl.pos = t; marker(); if (srcs.length) play(); }
		function setMode(md) { cl.mode = md; abBtns(); if (gB && ac) { var now = ac.currentTime; gB.gain.setTargetAtTime(md === "b" ? 1 : 0, now, 0.01); gA.gain.setTargetAtTime(md === "a" ? 1 : 0, now, 0.01); } }
		$("vd-cmp-play").onclick = function () { if (srcs.length) stop(); else play(); };
		$("vd-dlg").querySelectorAll("[data-ab]").forEach(function (b) { b.onclick = function () { setMode(b.getAttribute("data-ab")); }; });
		$("vd-cmp-match").onchange = function () { cl.match = this.checked; if (cl.data) { build(); if (srcs.length) play(); } };
		$("vd-cmp-loop").onchange = function () { cl.loop = this.checked; };
		$("vd-cmp-len").onchange = function () { cl.len = +this.value; place(cl.t0 + cl.pos - cl.len / 2); load(); };
		$("vd-cmp-prev").onclick = function () { place(cl.t0 - (cl.t1 - cl.t0)); load(); };
		$("vd-cmp-next").onclick = function () { place(cl.t1); load(); };
		$("vd-cmp-close").onclick = closeDialog;
		$("vd-dlg").addEventListener("keydown", function (e) {
			if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
			if (e.key === " ") { e.preventDefault(); e.stopPropagation(); $("vd-cmp-play").click(); }
			else if (e.key === "b" || e.key === "B") { e.preventDefault(); e.stopPropagation(); setMode(cl.mode === "b" ? "a" : "b"); }
		});
		var ro = window.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null; if (ro) ro.observe($("vd-cmp-rows"));
		var prevClose = dlgClose; dlgClose = function () { if (ro) ro.disconnect(); prevClose(); };
		load();
	};

	/* ---------- export dialog ---------- */
	function tabTask(label) { return window.MESTabProgress ? window.MESTabProgress.task(label) : { set: function () {}, label: function () {}, done: function () {}, fail: function () {}, stop: function () {} }; }
	var exporting = null;
	/* ---------- hand the finished MP4 to the Video Compressor (same IndexedDB "mes-handoff" as the photo tools) ----------
	 * A file written to disk is passed as its file handle (nothing is copied, even for a 6 GB video); a file made in memory is passed as the blob.
	 * The tab is opened inside the Export click (pop-up blockers allow that) and waits until the export is done. */
	function waitTab(name) {
		var w = null; try { w = window.open("about:blank", "_blank"); } catch (e) { /* blocked */ }
		if (!w) return null;
		try { w.document.title = "Waiting for the export..."; w.document.body.style.cssText = "font:16px Arial,sans-serif;background:#11151c;color:#e2e8f0;padding:2em;line-height:1.5"; w.document.body.innerHTML = "<h2>MES Video Compressor</h2><p>Waiting for the MES Video Editor to finish exporting <b></b>.</p><p>Keep this tab open: the video opens here by itself when it is done.</p>"; w.document.querySelector("b").textContent = name; } catch (e) { /* ignore */ }
		return w;
	}
	function handoffDb() { return new Promise(function (res, rej) { var r = indexedDB.open("mes-handoff", 1); r.onupgradeneeded = function () { r.result.createObjectStore("h"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	async function sendToCompressor(handle, blob, name, tab) {
		if (!tab) { try { tab = window.open("about:blank", "_blank"); } catch (e) { tab = null; } }
		try {
			var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10), item = handle ? { name: name, type: "video/mp4", handle: handle } : { name: name, type: "video/mp4", blob: blob };
			var db = await handoffDb();
			await new Promise(function (res, rej) { var t = db.transaction("h", "readwrite"), st = t.objectStore("h"), cur = st.openCursor(); cur.onsuccess = function () { var c = cur.result; if (!c) return; if (!c.value || Date.now() - c.value.t > 3600e3) c.delete(); c.continue(); }; st.put({ t: Date.now(), files: [item] }, id); t.oncomplete = res; t.onerror = function () { rej(t.error); }; });
			db.close();
			var url = "/compress-video?handoff=" + encodeURIComponent(id);
			if (tab && !tab.closed) tab.location.href = url;
			else toast("Your browser blocked the new tab: press “Make it smaller in the Video Compressor” to open it.", 7000);
		} catch (e) { if (tab) { try { tab.close(); } catch (x) { /* ignore */ } } toast("Could not hand the video over: " + (e && e.message || e)); }
	}
	function openExport() {
		var p = VE.P, d = V.duration(p);
		if (!d) { toast("The timeline is empty: add a clip first."); return; }
		if (!window.VideoEncoder) { toast("This browser cannot export video. Use Chrome, Edge or Brave on a computer."); return; }
		P.pause();
		var mk = p.marks || {}, hasMarks = marksOk();
		var sizes = V.EXPORT_SIZES.map(function (s) { var z = V.exportSize(p, s[0]); return '<option value="' + s[0] + '"' + ((UI.exSize || "project") === s[0] ? " selected" : "") + ">" + s[1] + " · " + z.w + "×" + z.h + "</option>"; }).join("");
		var h = '<h3>Export MP4</h3><div class="vd-grid"><label class="vd-f"><span>Size</span><select id="vd-x-size">' + sizes + '</select></label><label class="vd-f"><span>Frame rate</span><select id="vd-x-fps">' + [p.fps].concat([24, 25, 30, 60].filter(function (f) { return Math.abs(f - p.fps) > 0.01; })).map(function (f, k) { return '<option value="' + f + '">' + f + " fps" + (k ? "" : " (project)") + "</option>"; }).join("") + '</select></label>' +
			'<label class="vd-f"><span>Quality</span><select id="vd-x-q"><option value="high">High (bigger file)</option><option value="balanced">Balanced</option><option value="small">Smaller file</option></select></label>' +
			'<label class="vd-f"><span>What</span><select id="vd-x-range"><option value="all">The whole video (' + V.tc(d, p.fps) + ')</option>' + (hasMarks ? '<option value="marks">Only the marked part (' + V.tc(mk.out - mk.in, p.fps) + ")</option>" : "") + "</select></label></div>" +
			'<label class="vd-f vd-wide"><span>File name</span><input type="text" id="vd-x-name" value="' + esc((p.name || "video").replace(/[\\/:*?"<>|]+/g, "-")) + '.mp4"></label>' +
			(window.showSaveFilePicker ? '<div class="vd-checks"><label><input type="checkbox" id="vd-x-disk"' + (UI.exDisk !== false ? " checked" : "") + "> Write it straight to a file I choose (best for long videos)</label></div>" : '<p class="vd-sub">The MP4 is made in memory and downloaded at the end.' + (navigator.brave ? " Brave can write straight to disk if you turn on brave://flags/#file-system-access-api." : "") + "</p>") +
			'<div class="vd-checks"><label title="A tab opens now and waits; when the export is done the MP4 opens in the MES Video Compressor (constant quality, usually much smaller). Nothing is uploaded."><input type="checkbox" id="vd-x-cmp"' + (UI.exCmp ? " checked" : "") + '> Then make it smaller in the Video Compressor</label><label title="While it exports, the browser tab shows the percent done and the time left. Remembered for every MES tool."><input type="checkbox" class="mes-tp-ck"' + (!window.MESTabProgress || window.MESTabProgress.enabled() ? " checked" : "") + '> Show progress in the browser tab</label></div>' + '<p class="vd-sub" id="vd-x-est"></p><div class="vd-xprog" id="vd-x-prog" hidden><div class="vd-bar"><i id="vd-x-bar"></i></div><p id="vd-x-txt" aria-live="polite"></p></div>' +
			'<div class="vd-row vd-end"><button type="button" class="vd-btn" id="vd-x-cancel">Close</button><button type="button" class="vd-btn vd-primary" id="vd-x-go">Export</button></div>';
		dialog(h);
		$("vd-x-q").value = UI.exQ || "balanced";
		function est() { var z = V.exportSize(p, $("vd-x-size").value), f = +$("vd-x-fps").value, len = $("vd-x-range").value === "marks" ? mk.out - mk.in : d, br = V.bitrate(z.w, z.h, f, $("vd-x-q").value) + 192000; $("vd-x-est").textContent = "About " + C.formatBytes(br * len / 8) + " (" + (br / 1e6).toFixed(1) + " Mbit/s)."; }
		["vd-x-size", "vd-x-fps", "vd-x-q", "vd-x-range"].forEach(function (id) { $(id).onchange = est; }); est();
		$("vd-x-cancel").onclick = function () { if (exporting) { exporting.cancel = true; return; } closeDialog(); };
		$("vd-x-go").onclick = async function () {
			var size = $("vd-x-size").value, z = V.exportSize(p, size), fps = +$("vd-x-fps").value, q = $("vd-x-q").value, range = $("vd-x-range").value, name = ($("vd-x-name").value || "video.mp4").replace(/[\\/:*?"<>|]+/g, "-"); if (!/\.mp4$/i.test(name)) name += ".mp4";
			var disk = $("vd-x-disk") && $("vd-x-disk").checked, wantCmp = $("vd-x-cmp").checked; UI.exSize = size; UI.exQ = q; UI.exDisk = disk; UI.exCmp = wantCmp; saveUI();
			var handle = null;
			if (disk) { try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }] }); } catch (e) { return; } }
			var cmpTab = wantCmp ? waitTab(name) : null;
			var go = $("vd-x-go"); go.disabled = true; $("vd-x-cancel").textContent = "Cancel"; $("vd-x-prog").hidden = false;
			exporting = { cancel: false }; var tp = tabTask("Exporting " + name);
			try {
				var res = await VE.exportVideo({ w: z.w, h: z.h, fps: fps, quality: q, a: range === "marks" ? mk.in : 0, b: range === "marks" ? mk.out : d, handle: handle,
					cancelled: function () { return exporting && exporting.cancel; },
					onProgress: function (f, txt) { tp.set(f); $("vd-x-bar").style.width = Math.round(f * 100) + "%"; $("vd-x-txt").textContent = Math.round(f * 100) + "% · " + txt; } });
				var url = res.blob ? URL.createObjectURL(res.blob) : null;
				$("vd-x-txt").innerHTML = "<b>Done</b>: " + esc(name) + ", " + C.formatBytes(res.size) + " in " + V.short(res.secs).replace(/\.\d$/, "") + (res.sound ? "" : " (without sound)") + "." + (url ? ' <a class="vd-btn vd-primary" href="' + url + '" download="' + esc(name) + '">Download</a>' : " Saved where you chose.");
				$("vd-x-bar").style.width = "100%"; tp.done(C.formatBytes(res.size));
				var cb = document.createElement("button"); cb.type = "button"; cb.className = "vd-btn vd-sm"; cb.textContent = "Make it smaller in the Video Compressor \u2197"; cb.title = "Opens the MES Video Compressor in a new tab with this MP4 already added";
				cb.onclick = function () { sendToCompressor(handle, res.blob, name, null); }; $("vd-x-txt").appendChild(document.createTextNode(" ")); $("vd-x-txt").appendChild(cb);
				if (cmpTab) { sendToCompressor(handle, res.blob, name, cmpTab); cmpTab = null; } else if (wantCmp) toast("Your browser blocked the Video Compressor tab: press \u201cMake it smaller in the Video Compressor\u201d.", 8000);
				if (url) { var v = document.createElement("video"); v.controls = true; v.src = url; v.className = "vd-xvid"; $("vd-x-prog").appendChild(v); }
			} catch (e) { tp.fail(/Cancelled/.test(e.message) ? "Cancelled" : "Failed"); $("vd-x-txt").textContent = /Cancelled/.test(e.message) ? "Export cancelled." : "Export failed: " + e.message; if (window.console) console.error(e); if (cmpTab) { try { cmpTab.close(); } catch (x) { /* ignore */ } } }
			exporting = null; go.disabled = false; $("vd-x-cancel").textContent = "Close";
		};
	}
	var dlgClose = null;
	function dialog(h) { if (dlgClose) { var f0 = dlgClose; dlgClose = null; f0(); } $("vd-dlg").className = "vd-dlg"; $("vd-dlg").innerHTML = h; $("vd-modal").hidden = false; setTimeout(function () { var f = $("vd-dlg").querySelector("select, input, button"); if (f) f.focus(); }, 30); }
	function closeDialog() { if (exporting) return; $("vd-modal").hidden = true; if (dlgClose) { var f0 = dlgClose; dlgClose = null; f0(); } }
	$("vd-modal").addEventListener("click", function (e) { if (e.target === this) closeDialog(); });
	$("vd-export").onclick = openExport;

	/* ---------- keyboard ---------- */
	document.addEventListener("keydown", function (e) {
		var tg = e.target, tn = (tg && tg.tagName) || "";
		if (/^(INPUT|TEXTAREA|SELECT)$/.test(tn) && !(e.key === "Escape")) { if (!((e.ctrlKey || e.metaKey) && /^[sez]$/i.test(e.key) && tn !== "TEXTAREA" && tn !== "INPUT")) return; }
		if (!app.contains(tg) && tg !== document.body && !UI.win && !app.classList.contains("vd-pvfill")) return;
		var k = e.key, mod = e.ctrlKey || e.metaKey, f = 1 / VE.P.fps;
		if (!$("vd-modal").hidden) { if (k === "Escape") closeDialog(); return; }
		if (mod && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) VE.redo(); else VE.undo(); return; }
		if (mod && (k === "y" || k === "Y")) { e.preventDefault(); VE.redo(); return; }
		if (mod && (k === "s" || k === "S")) { e.preventDefault(); saveProject(e.shiftKey); return; }
		if (mod && (k === "e" || k === "E")) { e.preventDefault(); openExport(); return; }
		if (mod && (k === "i" || k === "I")) { e.preventDefault(); $("vd-file").click(); return; }
		if (mod && (k === "d" || k === "D")) { e.preventDefault(); VE.duplicate(); return; }
		if (mod && e.shiftKey && (k === "a" || k === "A")) { e.preventDefault(); VE.separate(VE.selected()); return; }
		if (mod && (k === "a" || k === "A")) { e.preventDefault(); VE.sel = VE.P.clips.map(function (c) { return c.id; }); VE.emit("select"); return; }
		if ((mod || e.ctrlKey) && e.altKey && (k === "ArrowLeft" || k === "ArrowRight")) { e.preventDefault(); VE.goEdit(k === "ArrowRight" ? 1 : -1); return; }
		if (mod && (k === "g" || k === "G")) { e.preventDefault(); tin.focus(); return; }
		if (mod && (k === "Home" || k === "End")) { e.preventDefault(); P.seek(k === "Home" ? 0 : V.duration(VE.P)); VE.tl.reveal(VE.t); return; }
		if (mod || e.altKey) return;
		var h = true;
		switch (k) {
			case " ": if (e.repeat) break; if (P.hover && !P.playing) P.spaceDown(); else P.toggle(); break;   // over the preview: hold Space and drag to move the view
			case "g": case "G": $("vd-vzguide").click(); break;
			case "k": case "K": P.pause(); break;
			case "<": case ",": if (k === "<" || e.shiftKey) P.stepSpeed(-1); else VE.stepFrame(-1); break;
			case ">": case ".": if (k === ">" || e.shiftKey) P.stepSpeed(1); else VE.stepFrame(1); break;
			case "ArrowUp": VE.goEdit(-1); break; case "ArrowDown": VE.goEdit(1); break;
			case "l": case "L": if (P.playing && !P.rev) P.play(Math.min(8, P.rate * 2)); else P.play(1); break;
			case "j": case "J": if (P.playing && P.rev) P.reverse(Math.min(8, P.rate * 2)); else P.reverse(1); break;
			case "ArrowLeft": VE.stepFrame(-1, e.shiftKey); break;
			case "ArrowRight": VE.stepFrame(1, e.shiftKey); break;
			case "Home": P.seek(0); VE.tl.reveal(0); break; case "End": P.seek(V.duration(VE.P)); VE.tl.reveal(VE.t); break;
			case "s": case "S": VE.split(); break;
			case "Delete": case "Backspace": VE.del(e.shiftKey); break;
			case "i": case "I": mark("in"); break; case "o": case "O": mark("out"); break;
			case "t": case "T": VE.addTitle(); break;
			case "f": case "F": if (e.shiftKey) $("vd-fs").click(); else setPv(!app.classList.contains("vd-pvfill")); break;
			case "+": case "=": VE.tl.zoom(VE.pps * 1.5); break; case "-": case "_": VE.tl.zoom(VE.pps / 1.5); break;
			case "w": case "W": setWin(!UI.win); break;
			case "Escape": if (P.picking()) P.cancelPick(); else if (app.classList.contains("vd-pvfill")) setPv(false); else if (UI.win) setWin(false); else { VE.sel = []; VE.emit("select"); } break;
			default: h = false;
		}
		if (h) e.preventDefault();
	});
	window.addEventListener("beforeunload", function (e) { if (exporting || VE.bin.some(function (m) { return m.state === "working" && m.status && /Convert/.test(m.status); })) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- separate video and audio ---------- */
	VE.separate = function (list) {
		var vids = (list || []).filter(function (c) { return c.type === "video" && VE.hasSound(c) && !(V.track(VE.P, c.track) || {}).lock; });
		if (!vids.length) { toast("Select a video clip that has sound first."); return; }
		var made = [];
		vids.forEach(function (c) { var a = V.separateAudio(VE.P, c.id, V.uid("c"), V.uid("L"), function () { return VE.addTrack("a"); }); if (a) made.push(a.id); });
		VE.sel = made; VE.commit("Separate video and audio");
		toast("The sound is now its own clip on an audio track, linked to the video: moving, trimming, splitting or deleting one does the other too (Alt + drag moves just one). Drag the bottom edge of the track to make the waveform taller.", 9000);
	};
	$("vd-sep").onclick = function () { VE.separate(VE.selected()); };
	function linkSection(c) {
		var h = "", parts = V.partners(VE.P, c);
		if (c.link && parts.length) {
			var o = parts[0], ot = V.track(VE.P, o.track);
			h += '<div class="vd-linkrow">&#128279; Linked to its ' + (o.type === "audio" ? "sound" : "video") + " on " + esc(ot ? ot.name : "another track") + '. Moving, trimming, splitting and deleting one does the other too (Alt + drag moves just this one).<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="unlink">Unlink</button>' +
				(c.type === "video" || o.type === "video" ? '<button type="button" class="vd-btn vd-sm" data-lk="join">Put the sound back into the video</button>' : "") + "</div></div>";
		} else if (c.type === "video" && c.noAudio) {
			h += '<div class="vd-linkrow">This clip plays no sound (it was separated).<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="sndon">Play its own sound again</button></div></div>';
		} else if (c.type === "video" && VE.hasSound(c)) {
			h += '<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="sep" title="Ctrl+Shift+A">Separate video and audio</button></div>';
		}
		return h;
	}
	function bindLink(c) {
		insp.querySelectorAll("[data-lk]").forEach(function (b) {
			b.onclick = function () {
				var a = b.getAttribute("data-lk");
				if (a === "sep") VE.separate([c]);
				else if (a === "unlink") { V.unlink(VE.P, c.id); VE.commit("Unlink"); }
				else if (a === "join") { var v = V.joinAudio(VE.P, c.id); VE.sel = v ? [v.id] : []; VE.commit("Put the sound back"); }
				else if (a === "sndon") { c.noAudio = false; VE.commit("Sound on"); }
			};
		});
	}

	/* ---------- audio effects (properties) ---------- */
	var WINS = [[1, "Quick (1 s)"], [3, "Normal (3 s)"], [6, "Slow (6 s)"]], RATIOS = [1.5, 2, 3, 4, 6, 10];
	function fxSection(list) {
		var A = V.afxOf(list[0]), L = A.level, Cm = A.comp, D = A.duck;
		function chk(id, on, label) { return '<label><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "> " + label + "</label>"; }
		var h = '<div class="vd-sec"><b>Audio effects</b><p class="vd-sub">Worked out from the sound as you play and export; your files are not changed.</p>';
		h += '<div class="vd-fx' + (L.on ? " is-on" : "") + '">' + chk("vd-fx-lev", L.on, "Leveler (auto-level)") + '<p class="vd-sub">Brings quiet and loud parts to the same loudness over a few seconds.</p>' +
			(L.on ? '<div class="vd-grid">' + num("vd-fx-lt", "Target loudness", L.target, 1, -40, -6, "dB", "Average level (RMS, dBFS) the leveler aims for; -20 suits speech") + num("vd-fx-lu", "Most boost", L.maxUp, 1, 0, 30, "dB") + num("vd-fx-ld", "Most cut", L.maxDown, 1, 0, 30, "dB") +
				'<label class="vd-f"><span>Speed</span><select id="vd-fx-lw">' + WINS.map(function (w) { return '<option value="' + w[0] + '"' + (Math.abs(L.win - w[0]) < 1e-6 ? " selected" : "") + ">" + w[1] + "</option>"; }).join("") + "</select></label></div>" : "") + "</div>";
		h += '<div class="vd-fx' + (Cm.on ? " is-on" : "") + '">' + chk("vd-fx-cmp", Cm.on, "Compressor") + '<p class="vd-sub">Turns down the loudest moments (above the threshold) so peaks and shouts sit closer to the rest.</p>' +
			(Cm.on ? '<div class="vd-grid">' + num("vd-fx-ct", "Threshold", Cm.thr, 1, -60, 0, "dB") + '<label class="vd-f"><span>Ratio</span><select id="vd-fx-cr">' + RATIOS.map(function (r) { return '<option value="' + r + '"' + (Math.abs(Cm.ratio - r) < 1e-6 ? " selected" : "") + ">" + r + ":1</option>"; }).join("") + "</select></label>" +
				num("vd-fx-ca", "Attack", Math.round(Cm.att * 1000), 5, 10, 500, "ms") + num("vd-fx-cl", "Release", Math.round(Cm.rel * 1000), 10, 20, 3000, "ms") +
				'<label class="vd-f" title="Empty = automatic (' + V.compMakeup(Object.assign({}, Cm, { makeup: null }), L.on ? L.target : -18).toFixed(1) + ' dB)"><span>Make-up gain</span><input type="number" id="vd-fx-cm" step="0.5" min="-12" max="24" placeholder="auto ' + V.compMakeup(Object.assign({}, Cm, { makeup: null }), L.on ? L.target : -18).toFixed(1) + '" value="' + (Cm.makeup == null ? "" : Cm.makeup) + '"><em>dB</em></label></div>' : "") + "</div>";
		h += '<div class="vd-fx' + (D.on ? " is-on" : "") + '">' + chk("vd-fx-dk", D.on, "Ducking (lower it under other sound)") + '<p class="vd-sub">For music: it goes quieter by itself while another clip (a voice) is speaking.</p>' +
			(D.on ? '<div class="vd-grid">' + num("vd-fx-da", "Lower by", D.amt, 1, 1, 40, "dB") + num("vd-fx-dg", "Voice above", D.gate, 1, -70, -10, "dB", "Sound on other clips louder than this counts as speaking") + "</div>" : "") + "</div>";
		h += '<p class="vd-sub" id="vd-fx-st">' + fxStatus(list) + "</p></div>";
		return h;
	}
	function fxStatus(list) {
		if (!list.some(V.afxOn)) return "";
		var wait = list.some(function (c) { return V.afxOn(c) && !VE.levelsFor(c); });
		return wait ? "Analysing the sound..." : "Effects on: they play in the preview and go into the export. The waveform shows the result (bright) over the original (faint).";
	}
	function bindFx(list) {
		function set(group, patch, label) {
			list.forEach(function (c) { var A = V.afxOf(c); c.afx = c.afx || {}; c.afx[group] = Object.assign(A[group], patch); });
			VE.commit(label);
		}
		function on(id, fn) { var el = $(id); if (el) el.addEventListener("change", function () { fn(el); }); }
		function n(el) { return parseFloat(el.value); }
		on("vd-fx-lev", function (el) { set("level", { on: el.checked }, el.checked ? "Leveler on" : "Leveler off"); });
		on("vd-fx-lt", function (el) { if (isFinite(n(el))) set("level", { target: V.clamp(n(el), -40, -6) }, "Leveler target"); });
		on("vd-fx-lu", function (el) { if (isFinite(n(el))) set("level", { maxUp: V.clamp(n(el), 0, 30) }, "Leveler boost"); });
		on("vd-fx-ld", function (el) { if (isFinite(n(el))) set("level", { maxDown: V.clamp(n(el), 0, 30) }, "Leveler cut"); });
		on("vd-fx-lw", function (el) { set("level", { win: +el.value }, "Leveler speed"); });
		on("vd-fx-cmp", function (el) { set("comp", { on: el.checked }, el.checked ? "Compressor on" : "Compressor off"); });
		on("vd-fx-ct", function (el) { if (isFinite(n(el))) set("comp", { thr: V.clamp(n(el), -60, 0) }, "Compressor threshold"); });
		on("vd-fx-cr", function (el) { set("comp", { ratio: +el.value }, "Compressor ratio"); });
		on("vd-fx-ca", function (el) { if (isFinite(n(el))) set("comp", { att: V.clamp(n(el), 10, 500) / 1000 }, "Compressor attack"); });
		on("vd-fx-cl", function (el) { if (isFinite(n(el))) set("comp", { rel: V.clamp(n(el), 20, 3000) / 1000 }, "Compressor release"); });
		on("vd-fx-cm", function (el) { set("comp", { makeup: el.value === "" || !isFinite(n(el)) ? null : V.clamp(n(el), -12, 24) }, "Make-up gain"); });
		on("vd-fx-dk", function (el) { set("duck", { on: el.checked }, el.checked ? "Ducking on" : "Ducking off"); });
		on("vd-fx-da", function (el) { if (isFinite(n(el))) set("duck", { amt: V.clamp(n(el), 1, 40) }, "Ducking amount"); });
		on("vd-fx-dg", function (el) { if (isFinite(n(el))) set("duck", { gate: V.clamp(n(el), -70, -10) }, "Ducking voice level"); });
	}
	// work out the sound levels the effects need, then redraw the waveforms and update the preview
	var fxRun = null, fxAgain = false;
	function fxKick() {
		var need = VE.P.clips.some(function (c) { return VE.hasSound(c) && V.afxOn(c) && !VE.levelsFor(c); }) || (VE.P.clips.some(function (c) { return VE.hasSound(c) && c.afx && c.afx.duck && c.afx.duck.on; }) && VE.P.clips.some(function (c) { return VE.hasSound(c) && !VE.levelsFor(c); }));
		if (!need) return;
		if (fxRun) { fxAgain = true; return; }
		fxRun = VE.ensureAllFx(function (x) { var e = $("vd-fx-st"); if (e) e.textContent = "Analysing the sound... " + Math.round(x * 100) + "%"; }).then(function () {
			fxRun = null; var e = $("vd-fx-st"); if (e) e.textContent = fxStatus(VE.selected());
			if (fxAgain) { fxAgain = false; fxKick(); }
		});
	}
	var lvT = 0;
	VE.on("levels", function () { clearTimeout(lvT); lvT = setTimeout(function () { VE.tl.render(); VE.preview.sync(); }, 150); });
	VE.on("change", fxKick); VE.on("mediaReady", fxKick);

	/* ---------- canvas size ---------- */
	// size of the first video or picture on the timeline (else in the media list), even numbers
	function firstClipSize() {
		var cs = VE.P.clips.filter(function (c) { return c.type === "video" || c.type === "image"; }).sort(function (a, b) { return a.start - b.start; }), m = null;
		for (var j = 0; j < cs.length && !m; j++) { var q = VE.media(cs[j].media); if (q && q.w) m = q; }
		if (!m) m = VE.bin.filter(function (q) { return (q.kind === "video" || q.kind === "image") && q.w; })[0];
		return m ? { w: V.clamp(Math.round(m.w / 2) * 2, 16, 7680), h: V.clamp(Math.round(m.h / 2) * 2, 16, 4320), name: m.name } : null;
	}
	VE.on("mediaReady", function () { renderCvs(); });
	VE.setCanvas = function (w, h) { VE.P.w = V.clamp(Math.round(w / 2) * 2, 16, 7680); VE.P.h = V.clamp(Math.round(h / 2) * 2, 16, 4320); VE.commit("Canvas size"); };
	function renderCvs() {
		var sel = $("vd-cvsize"), pre = V.presetOf(VE.P.w, VE.P.h);
		var groups = [], first = firstClipSize();
		V.CANVAS_PRESETS.forEach(function (o) { var g = groups.filter(function (x) { return x.n === o[2]; })[0]; if (!g) groups.push(g = { n: o[2], o: [] }); g.o.push(o); });
		sel.innerHTML = groups.map(function (g) { return '<optgroup label="' + esc(g.n) + '">' + g.o.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</optgroup>"; }).join("") +
			'<optgroup label="Other">' + (pre === "custom" ? '<option value="cur">' + VE.P.w + "×" + VE.P.h + " (custom)</option>" : "") + (first ? '<option value="match">Match first clip (' + first.w + "×" + first.h + ")</option>" : '<option value="match" disabled>Match first clip (add a video or picture first)</option>') + '<option value="custom">Custom size&hellip;</option></optgroup>';
		sel.value = pre === "custom" ? "cur" : pre;
	}
	$("vd-cvsize").onchange = function () {
		var v = this.value;
		if (v === "cur") return;
		if (v === "match") { var f = firstClipSize(); if (f) { VE.setCanvas(f.w, f.h); toast("The canvas is now " + f.w + "×" + f.h + ", like " + f.name + "."); } renderCvs(); return; }
		if (v === "custom") { var r = V.parseSize(window.prompt("Canvas size in pixels, width × height (for example 1280x720):", VE.P.w + "x" + VE.P.h)); if (r) VE.setCanvas(r.w, r.h); else { toast("Type it as width x height, for example 1280x720 (16 to 7680 by 16 to 4320)."); } renderCvs(); return; }
		var q = V.parseSize(v); if (q) VE.setCanvas(q.w, q.h);
	};
	VE.on("change", renderCvs);

	/* ---------- preview filling the window ---------- */
	var pvT = 0;
	function setPv(on) {
		app.classList.toggle("vd-pvfill", on); document.documentElement.classList.toggle("vd-noscroll", on || UI.win);
		$("vd-pvwin").setAttribute("aria-pressed", on); $("vd-pvwin").innerHTML = on ? "&#10006; Leave" : "&#10530; Fill window";
		setTimeout(function () { P.fit(); }, 30);
		if (on) toast("The preview fills the window. Space plays, Esc leaves.", 3000);
	}
	$("vd-pvwin").onclick = function () { setPv(!app.classList.contains("vd-pvfill")); };
	app.querySelector(".vd-center").addEventListener("pointermove", function () { if (!app.classList.contains("vd-pvfill")) return; app.classList.add("vd-pvshow"); clearTimeout(pvT); pvT = setTimeout(function () { app.classList.remove("vd-pvshow"); }, 2200); });

	/* ---------- layout: library rail, panel widths, timeline height ---------- */
	function applyLayout() {
		app.style.setProperty("--vd-lw", V.clamp(UI.lw || 250, 170, 560) + "px"); app.style.setProperty("--vd-rw", V.clamp(UI.rw || 290, 200, 600) + "px");
		if (UI.tlh) app.style.setProperty("--vd-tlh", UI.tlh + "px"); else app.style.removeProperty("--vd-tlh");
		app.classList.toggle("vd-noleft", !!UI.noLeft); app.classList.toggle("vd-noright", !!UI.noRight);
		$("vd-tgl-left").setAttribute("aria-pressed", !UI.noLeft); $("vd-tgl-right").setAttribute("aria-pressed", !UI.noRight);
		var cat = UI.cat || "media";
		app.querySelectorAll("#vd-rail [data-cat]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-cat") === cat && !UI.noLeft); });
		app.querySelectorAll("#vd-left [data-pane]").forEach(function (s) { s.hidden = s.getAttribute("data-pane") !== cat; });
	}
	function relayout() { applyLayout(); saveUI(); setTimeout(function () { P.fit(); VE.tl.render(); }, 20); }
	$("vd-rail").addEventListener("click", function (e) {
		var b = e.target.closest("[data-cat]"); if (!b) return; var c = b.getAttribute("data-cat");
		if (c === (UI.cat || "media") && !UI.noLeft) UI.noLeft = true; else { UI.cat = c; UI.noLeft = false; }
		relayout();
	});
	$("vd-rail").addEventListener("keydown", function (e) {
		if (!/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.key)) return;
		var bs = [].slice.call(this.querySelectorAll("[data-cat]")), i = bs.indexOf(document.activeElement); if (i < 0) return;
		var j = (i + (/Down|Right/.test(e.key) ? 1 : -1) + bs.length) % bs.length; bs[j].focus(); UI.cat = bs[j].getAttribute("data-cat"); UI.noLeft = false; relayout(); e.preventDefault(); e.stopPropagation();
	});
	$("vd-tgl-left").onclick = function () { UI.noLeft = !UI.noLeft; relayout(); };
	$("vd-tgl-right").onclick = function () { UI.noRight = !UI.noRight; relayout(); };
	// a draggable divider: get() = size now, set(v) = new size (px), step for the arrow keys, reset on double-click
	function grip(el, axis, get, set, reset) {
		var d = null;
		el.addEventListener("pointerdown", function (e) { if (e.button > 0) return; d = { p: axis === "x" ? e.clientX : e.clientY, v: get() }; el.setPointerCapture(e.pointerId); el.classList.add("is-on"); e.preventDefault(); });
		el.addEventListener("pointermove", function (e) { if (!d) return; set(d.v, (axis === "x" ? e.clientX : e.clientY) - d.p); applyLayout(); });
		function up() { if (!d) return; d = null; el.classList.remove("is-on"); relayout(); }
		el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
		el.addEventListener("dblclick", function () { reset(); relayout(); });
		el.addEventListener("keydown", function (e) { var k = e.key, s = e.shiftKey ? 64 : 16, dd = { ArrowLeft: -s, ArrowRight: s, ArrowUp: -s, ArrowDown: s }[k]; if (dd == null) return; set(get(), dd); relayout(); e.preventDefault(); e.stopPropagation(); });
	}
	grip($("vd-lgrip"), "x", function () { return UI.lw || 250; }, function (v, dx) { UI.lw = V.clamp(Math.round(v + dx), 170, 560); }, function () { delete UI.lw; });
	grip($("vd-rgrip"), "x", function () { return UI.rw || 290; }, function (v, dx) { UI.rw = V.clamp(Math.round(v - dx), 200, 600); }, function () { delete UI.rw; });
	grip($("vd-tlgrip"), "y", function () { return UI.tlh || Math.round($("vd-tl").getBoundingClientRect().height); }, function (v, dy) {
		var max = Math.max(160, (app.clientHeight || 800) - 240); if (window.matchMedia("(max-width:900px)").matches && !UI.win) max = 1200;
		UI.tlh = V.clamp(Math.round(v - dy), 80, max);
	}, function () { delete UI.tlh; });

	/* ---------- waveform scale ---------- */
	VE.tl.wave = UI.wave || "db";
	function waveBtn() { $("vd-wavemode").textContent = "Waveform: " + (VE.tl.wave === "db" ? "dB" : "linear"); }
	$("vd-wavemode").onclick = function () { VE.tl.wave = UI.wave = VE.tl.wave === "db" ? "lin" : "db"; saveUI(); waveBtn(); VE.tl.render(); };
	waveBtn();

	/* ---------- library cards: titles, transitions, audio and visual effects ---------- */
	var TITLES = [
		{ id: "title", name: "Title", desc: "Text in a box", y: 0.82, text: {} },
		{ id: "headline", name: "Big headline", desc: "Large, outlined, no box", y: 0.45, text: { s: "Big headline", size: 0.14, bgOn: false, outline: 1.5 } },
		{ id: "lower", name: "Lower third", desc: "Name and role", x: 0.24, y: 0.84, text: { s: "Your Name\nWhat you do", size: 0.05, align: "left", bg: "#0f172a", bgOp: 0.82 } },
		{ id: "caption", name: "Caption", desc: "A subtitle line", y: 0.9, text: { s: "Caption text", size: 0.048, bold: false, bgOp: 0.6 } },
		{ id: "callout", name: "Callout", desc: "Coloured note", x: 0.76, y: 0.2, text: { s: "Look here!", size: 0.06, bg: "#e11d48", bgOp: 0.95 } },
		{ id: "step", name: "Step label", desc: "Top left corner", x: 0.14, y: 0.1, text: { s: "Step 1", size: 0.055, bg: "#1d4ed8", bgOp: 0.95 } },
		{ id: "end", name: "End card", desc: "Centred, 5 s", y: 0.5, dur: 5, text: { s: "Thanks for watching!\nmes.fm", size: 0.08, bgOp: 0.7 } }
	];
	var ANIM_ICO = { zoomin: "&#8853;", zoomout: "&#8854;", zoompan: "&#11034;", "slidein-l": "&#8680;", "slidein-r": "&#8678;", "slidein-b": "&#8679;", "slideout-l": "&#8678;", "slideout-r": "&#8680;", fadein: "&#9680;", fadeout: "&#9681;", scaleup: "&#10530;", scaledown: "&#10529;", popin: "&#10040;", spin: "&#10227;", tilt: "&#8635;", custom: "&#10148;" };
	var CARDS = {
		titles: TITLES.map(function (t) { return { id: t.id, name: t.name, desc: t.desc, title: t }; }),
		trans: [
			{ id: "fin", ico: "&#9698;", name: "Fade in", desc: "From black / silence" }, { id: "fout", ico: "&#9699;", name: "Fade out", desc: "To black / silence" },
			{ id: "fboth", ico: "&#9670;", name: "Fade in and out", desc: "Both ends" }, { id: "xfade", ico: "&#10697;", name: "Cross-fade", desc: "From the clip right before" },
			{ id: "nofade", ico: "&#9634;", name: "No fades", desc: "Remove fades and cross-fades" }
		],
		afx: [
			{ id: "voice", ico: "&#127897;", name: "Even out a voice", desc: "Leveler + compressor", snd: 1 }, { id: "level", ico: "&#8660;", name: "Leveler", desc: "Auto-level over time", snd: 1 },
			{ id: "comp", ico: "&#9636;", name: "Compressor", desc: "Tames the loud peaks", snd: 1 }, { id: "noise", ico: "&#10024;", name: "Remove noise", desc: "Hum, hiss, room noise (AI)", snd: 1 },
			{ id: "duck", ico: "&#127925;", name: "Ducking", desc: "Music dips under a voice", snd: 1 }, { id: "norm", ico: "&#128266;", name: "Normalize loudness", desc: "To -16 LUFS (or your choice)", snd: 1 },
			{ id: "afin", ico: "&#9698;", name: "Fade in", desc: "Sound and picture", snd: 1 }, { id: "afout", ico: "&#9699;", name: "Fade out", desc: "Sound and picture", snd: 1 },
			{ id: "sep", ico: "&#9986;", name: "Separate video and audio", desc: "Sound on its own track" }, { id: "off", ico: "&#10006;", name: "Remove audio effects", desc: "Leveler, compressor, ducking", snd: 1 }
		],
		vfx: [
			{ id: "fit", ico: "&#9634;", name: "Fit the frame", desc: "Whole picture, bars if needed" }, { id: "fill", ico: "&#9635;", name: "Fill the frame", desc: "No bars, edges cut" },
			{ id: "pip", ico: "&#9703;", name: "Picture in picture", desc: "Small, bottom right" }, { id: "pipl", ico: "&#9702;", name: "Picture in picture", desc: "Small, bottom left" },
			{ id: "centre", ico: "&#10753;", name: "Centre", desc: "Back to the middle" }, { id: "half", ico: "&#9681;", name: "Half see-through", desc: "Opacity 50%" },
			{ id: "solid", ico: "&#9679;", name: "Solid", desc: "Opacity 100%" }, { id: "nocrop", ico: "&#8862;", name: "Reset crop", desc: "Show it all again" }
		],
		anim: V.ANIM_PRESETS.map(function (q) { return { id: q.id, name: q.name, desc: q.desc, ico: ANIM_ICO[q.id] || "&#10148;" }; })
	};
	function cardHtml(cat, c) {
		var vis = cat === "titles" ? '<span style="font:' + (c.title.text.bold === false ? "400" : "700") + " " + Math.round(10 + (c.title.text.size || 0.09) * 70) + "px Arial,sans-serif;color:#fff;padding:0 0.3em;border-radius:3px;" + (c.title.text.bgOn === false ? "text-shadow:0 0 3px #000,0 0 1px #000;" : "background:" + (c.title.text.bg || "#000") + ";") + '">' + esc(c.name.split(" ")[0]) + "</span>" : c.ico;
		return '<button type="button" class="vd-card" data-card="' + cat + ":" + c.id + '" title="' + esc(c.desc) + '"><span class="vd-cv" aria-hidden="true">' + vis + "</span><b>" + esc(c.name) + "</b><small>" + esc(c.desc) + "</small></button>";
	}
	app.querySelectorAll("[data-cards]").forEach(function (box) { var cat = box.getAttribute("data-cards"); box.innerHTML = CARDS[cat].map(function (c) { return cardHtml(cat, c); }).join(""); });
	var trd = $("vd-trdur"); trd.value = String(UI.trDur || 1); trd.onchange = function () { UI.trDur = +trd.value; saveUI(); };
	function cardOf(key) { var k = key.split(":"); return { cat: k[0], c: CARDS[k[0]].filter(function (x) { return x.id === k[1]; })[0] }; }
	// use a card on clips (the selected ones, or the clip it was dropped on); a title card makes a title (at the drop place)
	function applyCard(key, clips, drop) {
		var q = cardOf(key), cat = q.cat, cd = q.c; if (!cd) return;
		if (cat === "titles") { VE.addTitle(cd.title, drop ? drop.t : null, drop ? drop.track : null); return; }
		if (cat === "anim") {
			var tgt = (clips || VE.selected()).filter(function (c) { var tr = V.track(VE.P, c.track); return c.type !== "audio" && !(tr && tr.lock); })[0];
			if (!tgt) { toast("Select a video, picture or title first (or drag the animation onto one)."); return; }
			VE.addAnim(cd.id, tgt, drop && drop.t != null ? drop.t : null); return;
		}
		var list = (clips || VE.selected()).filter(function (c) { var tr = V.track(VE.P, c.track); return !(tr && tr.lock); });
		if (cd.snd) list = list.filter(VE.hasSound);
		if (cat === "vfx") list = list.filter(function (c) { return c.type !== "audio"; });
		if (cd.id === "sep") { VE.separate(list); return; }
		if (!list.length) { toast(cd.snd ? "Select a clip with sound first (or drag the card onto one)." : cat === "vfx" ? "Select a video, picture or title first (or drag the card onto one)." : "Select a clip first (or drag the card onto one)."); return; }
		VE.sel = list.map(function (c) { return c.id; }); VE.emit("select");
		var d = UI.trDur || 1;
		function fx(c, g, patch) { var A = V.afxOf(c); c.afx = c.afx || {}; c.afx[g] = Object.assign(A[g], patch); }
		if (cd.id === "noise") { denoise(list); return; }
		if (cd.id === "norm") { normalize(list); return; }
		list.forEach(function (c) {
			var len = V.dur(c), m = VE.media(c.media);
			switch (cd.id) {
				case "fin": case "afin": c.fin = Math.min(d, len); break;
				case "fout": case "afout": c.fout = Math.min(d, len); break;
				case "fboth": c.fin = Math.min(d, len / 2); c.fout = Math.min(d, len / 2); break;
				case "xfade": var pv = V.prevTouching(VE.P, c); if (pv) c.xin = Math.min(d, V.dur(pv), len); break;
				case "nofade": c.fin = 0; c.fout = 0; c.xin = 0; break;
				case "voice": fx(c, "level", { on: true, target: -20 }); fx(c, "comp", { on: true, thr: -26, ratio: 3 }); break;
				case "level": fx(c, "level", { on: true }); break;
				case "comp": fx(c, "comp", { on: true }); break;
				case "duck": fx(c, "duck", { on: true }); break;
				case "off": c.afx = null; break;
				case "fit": c.scale = 1; c.x = 0.5; c.y = 0.5; break;
				case "fill": if (m && m.w) { c.scale = Math.max(VE.P.w / m.w, VE.P.h / m.h) / Math.min(VE.P.w / m.w, VE.P.h / m.h); c.x = 0.5; c.y = 0.5; } break;
				case "pip": c.scale = 0.3; c.x = 0.82; c.y = 0.8; break;
				case "pipl": c.scale = 0.3; c.x = 0.18; c.y = 0.8; break;
				case "centre": c.x = 0.5; c.y = 0.5; break;
				case "half": c.op = 0.5; break; case "solid": c.op = 1; break;
				case "nocrop": c.crop = { l: 0, t: 0, r: 0, b: 0 }; break;
			}
		});
		if (cd.id === "xfade" && !list.some(function (c) { return c.xin > 0; })) toast("A cross-fade needs the clip to start right where another clip on its track ends.");
		VE.commit(cd.name);
		if (cd.snd && cd.id !== "off" && !/^af/.test(cd.id)) { if (UI.noRight) { UI.noRight = false; relayout(); } toast(cd.name + " is on for " + list.length + " clip" + (list.length > 1 ? "s" : "") + ". Change its settings in the properties on the right.", 5000); }
	}
	var cdrag = null;
	app.addEventListener("pointerdown", function (e) {
		var cb = e.target.closest(".vd-card"); if (!cb || e.button > 0) return;
		cdrag = { key: cb.getAttribute("data-card"), x: e.clientX, y: e.clientY, on: false, id: e.pointerId }; e.preventDefault(); cb.focus();
	});
	document.addEventListener("pointermove", function (e) {
		if (!cdrag || e.pointerId !== cdrag.id) return;
		if (!cdrag.on && Math.hypot(e.clientX - cdrag.x, e.clientY - cdrag.y) < 6) return;
		if (!cdrag.on) { cdrag.on = true; var g = cdrag.ghost = document.createElement("div"); g.className = "vd-ghost"; g.textContent = cardOf(cdrag.key).c.name; app.appendChild(g); }
		cdrag.ghost.style.left = e.clientX + 12 + "px"; cdrag.ghost.style.top = e.clientY + 8 + "px";
		var el = document.elementFromPoint(e.clientX, e.clientY), ce = el && el.closest && el.closest(".vd-clip");
		app.querySelectorAll(".vd-clip.is-target").forEach(function (x) { if (x !== ce) x.classList.remove("is-target"); }); if (ce) ce.classList.add("is-target");
		VE.tl.dragHint(e.clientX, e.clientY, cdrag.key.indexOf("titles:") === 0 && VE.tl.inside(e.clientX, e.clientY));
	});
	document.addEventListener("pointerup", function (e) {
		if (!cdrag || e.pointerId !== cdrag.id) return;
		var d = cdrag; cdrag = null; if (d.ghost) d.ghost.remove(); VE.tl.dragHint(null, null, false);
		app.querySelectorAll(".vd-clip.is-target").forEach(function (x) { x.classList.remove("is-target"); });
		if (!d.on) { applyCard(d.key); return; }
		var el = document.elementFromPoint(e.clientX, e.clientY), ce = el && el.closest && el.closest(".vd-clip");
		if (d.key.indexOf("titles:") === 0) { if (VE.tl.inside(e.clientX, e.clientY)) { var row = el && el.closest && el.closest(".vd-trow"); applyCard(d.key, null, { t: VE.tl.x2t(e.clientX), track: row ? row.getAttribute("data-track") : null }); } return; }
		if (ce) { var c = V.clip(VE.P, ce.getAttribute("data-id")); if (c) applyCard(d.key, [c], d.key.indexOf("anim:") === 0 ? { t: VE.tl.x2t(e.clientX) } : null); }
	});
	app.addEventListener("keydown", function (e) { var cb = e.target.closest && e.target.closest(".vd-card"); if (cb && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); applyCard(cb.getAttribute("data-card")); } }, true);
	applyLayout();

	/* ---------- animations ---------- */
	var ad = $("vd-andur"), ae = $("vd-anease");
	ae.innerHTML = V.EASES.map(function (q) { return '<option value="' + q[0] + '">' + q[1] + "</option>"; }).join("");
	ad.value = String(UI.anDur || 1); ae.value = UI.anEase || "inout";
	ad.onchange = function () { UI.anDur = +ad.value; saveUI(); }; ae.onchange = function () { UI.anEase = ae.value; saveUI(); };
	var measure = document.createElement("canvas").getContext("2d"), anStop = null;
	VE.on("time", function () { if (anStop != null && P.playing && VE.t >= anStop) { anStop = null; P.pause(); } });
	VE.on("pause", function () { anStop = null; });
	function posOf(s) { return { x: s.x, y: s.y, scale: s.scale, rot: s.rot, op: s.op, crop: { l: s.cl, t: s.ct, r: s.cr, b: s.cb } }; }
	// add preset id to clip c (at timeline time "at", else the playhead); zoom-n-pan first asks for a box on the preview. Then it plays the new
	// animation once (custom / zoom-n-pan leave the playhead at its end instead, ready to drag the clip there)
	VE.addAnim = function (id, c, at) {
		var pre = V.animPreset(id); if (!pre || !c) return;
		var len = V.dur(c), d = UI.anDur || 1, here = (at != null ? at : VE.t) - c.start, slot = V.animSlot(pre.at, here, d, len);
		VE.sel = [c.id]; VE.emit("select");
		function make(rect) {
			var s = V.stateAt(c, slot.t), r = VE.rectOf(measure, c, VE.P.w, VE.P.h, posOf(s)), vals = V.animValues(id, s, r ? { w: r.dw, h: r.dh } : null, VE.P.w, VE.P.h, { rect: rect });
			if (!vals) return;
			var a = { id: V.uid("a"), t: slot.t, d: slot.d, ease: UI.anEase || "inout", kind: id }; if (vals.to) a.to = vals.to; if (vals.from) a.from = vals.from;
			c.anims = V.cleanAnims((c.anims || []).concat([a])); VE.animSel = a.id;
			VE.commit("Animation: " + V.animName(a));
			if (id === "custom" || id === "zoompan") { P.seek(Math.min(V.end(c) - 1e-3, c.start + slot.t + slot.d)); toast(id === "custom" ? "The playhead is at the end of the new animation: drag the clip in the preview (a corner resizes, the round handle turns it) to where it should end up." : "Zoom-n-pan added. The playhead is at its end: drag or resize the clip in the preview to fine-tune the framing.", 7000); }
			else { P.seek(c.start + slot.t); anStop = c.start + slot.t + slot.d + 0.3; P.play(1); }
		}
		if (pre.rect) {
			if (P.picking()) return;
			P.seek(c.start + slot.t); toast("Drag a box on the preview over the part to zoom to. Esc cancels.", 6000);
			P.pickRect(function (r) { if (r) make(r); });
		} else make(null);
	};
	function animSection(c) {
		var L = (c.anims || []).slice().sort(function (a, b) { return a.t - b.t; }), rel = VE.t - c.start, tol = 0.5 / VE.P.fps;
		var h = '<div class="vd-sec"><b>Animations</b>';
		if (!L.length) return h + '<p class="vd-sub">None yet. Open <i>Animations</i> in the library on the left: zoom in, zoom-n-pan, slide in, fade, spin&hellip;</p><div class="vd-row"><button type="button" class="vd-btn vd-sm" data-an-open>Show the animations</button></div></div>';
		var NAMES = { x: "left/right", y: "up/down", scale: "size", rot: "turn", op: "opacity", cl: "crop left", ct: "crop top", cr: "crop right", cb: "crop bottom" };
		L.forEach(function (a) {
			var at = Math.abs(rel - (a.t + a.d)) <= tol ? "end" : Math.abs(rel - a.t) <= tol ? "start" : rel > a.t && rel < a.t + a.d ? "in" : "", keys = Object.keys(a.to || {});
			h += '<div class="vd-an' + (VE.animSel === a.id ? " is-sel" : "") + '" data-aid="' + esc(a.id) + '"><div class="vd-anh"><b>' + esc(V.animName(a)) + '</b><small>' + (at === "end" ? "playhead at its end" : at === "start" ? "playhead at its start" : at === "in" ? "playhead inside it" : "") + '</small><span class="vd-sp"></span><button type="button" class="vd-btn vd-sm vd-ico" data-anact="start" title="Playhead to its start" aria-label="Playhead to its start">&#8676;</button><button type="button" class="vd-btn vd-sm vd-ico" data-anact="end" title="Playhead to its end (then drag the clip in the preview to change where it ends up)" aria-label="Playhead to its end">&#8677;</button><button type="button" class="vd-btn vd-sm vd-ico" data-anact="del" title="Delete this animation" aria-label="Delete this animation">&times;</button></div>' +
				'<div class="vd-grid">' + num("vd-an-t-" + a.id, "Starts", Math.round(a.t * 100) / 100, 0.05, null, null, "s", "Seconds after the clip starts") + num("vd-an-d-" + a.id, "Takes", Math.round(a.d * 100) / 100, 0.05, 0.05, 600, "s") +
				'<label class="vd-f vd-wide"><span>Easing</span><select data-anease aria-label="Easing">' + V.EASES.map(function (q) { return '<option value="' + q[0] + '"' + (a.ease === q[0] ? " selected" : "") + ">" + q[1] + "</option>"; }).join("") + "</select></label></div>" +
				(keys.length ? '<p class="vd-sub">Ends with ' + keys.map(function (k) { var v = a.to[k]; return NAMES[k] + " " + (k === "rot" ? Math.round(v * 10) / 10 + "°" : Math.round(v * 1000) / 10 + "%"); }).join(", ") + ".</p>" : "") +
				(a.from ? '<p class="vd-sub">Starts from ' + Object.keys(a.from).map(function (k) { var v = a.from[k]; return k === "op" ? "opacity " + Math.round(v * 100) + "%" : k === "x" ? (v < 0.5 ? "off the left" : "off the right") : k === "y" ? (v > 0.5 ? "below the frame" : "above the frame") : k === "scale" ? "tiny" : NAMES[k]; }).join(", ") + ".</p>" : "") + "</div>";
		});
		return h + '<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-an-open>+ Add an animation</button><button type="button" class="vd-btn vd-sm" data-an-clear>Remove all</button></div></div>';
	}
	function bindAnims(c) {
		insp.querySelectorAll("[data-an-open]").forEach(function (b) { b.onclick = function () { UI.cat = "anim"; UI.noLeft = false; relayout(); }; });
		var cl = insp.querySelector("[data-an-clear]"); if (cl) cl.onclick = function () { c.anims = null; VE.animSel = null; VE.commit("Remove animations"); };
		insp.querySelectorAll(".vd-an").forEach(function (box) {
			var id = box.getAttribute("data-aid"), a = (c.anims || []).filter(function (x) { return x.id === id; })[0]; if (!a) return;
			box.addEventListener("focusin", function () { if (VE.animSel !== id) { VE.animSel = id; insp.querySelectorAll(".vd-an").forEach(function (x) { x.classList.toggle("is-sel", x === box); }); VE.tl.markSel(); } });
			box.querySelectorAll("[data-anact]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-anact"); VE.animSel = id; if (k === "del") { c.anims = V.cleanAnims(c.anims.filter(function (x) { return x !== a; })); VE.animSel = null; VE.commit("Delete animation"); } else { P.seek(Math.min(V.end(c) - 1e-3, Math.max(c.start, c.start + a.t + (k === "end" ? a.d : 0)))); renderInsp(); VE.tl.markSel(); } }; });
			var ti = $("vd-an-t-" + id), di = $("vd-an-d-" + id), es = box.querySelector("[data-anease]");
			if (ti) ti.onchange = function () { var v = parseFloat(ti.value); if (!isFinite(v)) return renderInsp(); a.t = V.clamp(v, -a.d + 0.02, V.dur(c)); c.anims = V.cleanAnims(c.anims); VE.commit("Animation timing"); };
			if (di) di.onchange = function () { var v = parseFloat(di.value); if (!isFinite(v)) return renderInsp(); a.d = V.clamp(v, 0.05, 600); VE.commit("Animation length"); };
			if (es) es.onchange = function () { a.ease = es.value; VE.commit("Easing"); };
		});
	}

	/* ---------- preview zoom ---------- */
	var vzs = $("vd-vzsel");
	function vzRender() {
		var v = P.view(), opts = V.ZOOM_STEPS.map(function (z) { return z * 100; }), cur = v.pct, near = opts.filter(function (z) { return Math.abs(z - cur) < 0.6; })[0];
		var html = '<option value="fit">Fit' + (v.fit ? " (" + Math.round(cur) + "%)" : "") + "</option>" + (!v.fit && near == null ? '<option value="cur">' + Math.round(cur) + "%</option>" : "") + opts.map(function (z) { return '<option value="' + z + '">' + Math.round(z) + "%</option>"; }).join("");
		if (vzs.getAttribute("data-h") !== html) { vzs.innerHTML = html; vzs.setAttribute("data-h", html); }
		vzs.value = v.fit ? "fit" : near != null ? String(near) : "cur";
		$("vd-vzfit").setAttribute("aria-pressed", v.fit); $("vd-vzguide").setAttribute("aria-pressed", P.guides()); $("vd-vzdim").setAttribute("aria-pressed", P.dimOutside());
	}
	var vzLast = "";
	VE.on("view", function () { var v = P.view(), k = v.fit + "|" + v.pct; if (k !== vzLast) { vzLast = k; vzRender(); } });
	vzs.onchange = function () { if (vzs.value === "fit") P.zoomFit(); else if (vzs.value !== "cur") P.zoomTo(+vzs.value); };
	$("vd-vzfit").onclick = function () { P.zoomFit(); };
	$("vd-vzin").onclick = function () { P.zoomStep(1); }; $("vd-vzout").onclick = function () { P.zoomStep(-1); };
	$("vd-vzguide").onclick = function () { P.guides(!P.guides()); vzRender(); };
	$("vd-vzdim").onclick = function () { P.dimOutside(!P.dimOutside()); vzRender(); };
	vzRender();

	/* ---------- start ---------- */
	VE.hist.push(JSON.stringify(VE.P));
	VE.restore().then(function (had) {
		renderBin(); renderInsp(); updateButtons(); VE.tl.render(); VE.preview.fit(); timeText();
		if (had) { toast("Your last project is back."); setTimeout(function () { if (V.duration(VE.P)) VE.tl.fit(); }, 400); }
	});
	window.MESVideoEditor = VE;   // for testing from the console
})();
