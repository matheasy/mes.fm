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
			'<canvas class="vd-mth" width="96" height="54" data-th="' + m.id + '"></canvas><div class="vd-mt"><div class="vd-mn" title="' + esc(m.name) + '">' + esc(m.name) + "</div><div class=\"vd-mm\">" + esc(meta) + (used ? " · on timeline" + (used > 1 ? " ×" + used : "") : "") + "</div><div class=\"vd-mm\">" + st + syncBadge(m) + "</div></div>" +
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
	/* clips whose file is missing: pick a file from the bin (or your computer) and every one of them uses it */
	function missGroups() {
		var g = {}, out = [];
		VE.P.clips.forEach(function (c) {
			if (c.type === "text" || !c.media) return; var m = VE.media(c.media); if (m && m.state !== "missing") return;
			var x = g[c.media]; if (!x) { x = g[c.media] = { id: c.media, m: m, n: 0, end: 0, img: c.type === "image" }; out.push(x); }
			x.n++; x.end = Math.max(x.end, c.out || 0);
		});
		return out;
	}
	function missCands(gr) { return VE.bin.filter(function (m) { return m.state === "ready" && (gr.img ? m.kind === "image" : m.kind !== "image"); }); }
	function missGuess(gr, cands) {
		var best = null, bs = -1, nm = gr.m && (gr.m.origName || gr.m.name);
		cands.forEach(function (m) { var sc = (nm && (m.name === nm || m.origName === nm) ? 100 : 0) + (m.dur && m.dur >= gr.end - 0.2 ? 10 : 0) + (gr.m && gr.m.dur && m.dur && Math.abs(m.dur - gr.m.dur) < 1 ? 20 : 0); if (sc > bs) { bs = sc; best = m; } });
		return best;
	}
	var missEl = document.createElement("div"); missEl.id = "vd-miss"; missEl.className = "vd-miss"; var bh = app.querySelector(".vd-binhead"); bh.parentNode.insertBefore(missEl, bh.nextSibling);   // first, so it is seen even in a short panel
	var missFile = document.createElement("input"); missFile.type = "file"; missFile.hidden = true; missFile.accept = "video/*,audio/*,image/*,.avi,.mkv,.wmv,.flv,.mts,.m2ts"; document.body.appendChild(missFile);
	function renderMiss() {
		var gs = missGroups();
		missEl.hidden = !gs.length; if (!gs.length) { missEl.innerHTML = ""; return; }
		missEl.innerHTML = gs.map(function (gr) {
			var cands = missCands(gr), g = missGuess(gr, cands);
			return '<div class="vd-missg"><b>⚠ ' + gr.n + " clip" + (gr.n > 1 ? "s" : "") + " can't find " + esc(gr.m ? gr.m.origName || gr.m.name : gr.n > 1 ? "their file" : "its file") + "</b>" +
				'<div class="vd-missr">' + (cands.length ? '<select data-ms="' + gr.id + '" aria-label="Use this file">' + cands.map(function (m) { return '<option value="' + m.id + '"' + (m === g ? " selected" : "") + ">" + esc(m.name) + "</option>"; }).join("") + '</select><button type="button" class="vd-btn vd-sm vd-primary" data-mc="' + gr.id + '">Use it</button>' : "") +
				'<button type="button" class="vd-btn vd-sm" data-mf="' + gr.id + '">' + (cands.length ? "Other file…" : "Choose the file…") + "</button></div></div>";
		}).join("");
	}
	missEl.addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var id;
		if ((id = b.getAttribute("data-mc"))) { var sel = missEl.querySelector('select[data-ms="' + id + '"]'), to = sel && VE.media(sel.value); if (to) { var n = VE.repoint(id, to.id); toast(n + " clip" + (n > 1 ? "s" : "") + " now use " + to.name + "."); } }
		else if ((id = b.getAttribute("data-mf"))) { missFile.dataset.id = id; missFile.click(); }
	});
	missFile.onchange = function () {
		var f = missFile.files && missFile.files[0], id = missFile.dataset.id; missFile.value = ""; if (!f || !id) return;
		VE.addFiles([f]).then(function (out) { var m = out[0]; if (m && m.state === "ready") { var n = VE.repoint(id, m.id); toast(n + " clip" + (n > 1 ? "s" : "") + " now use " + m.name + "."); } });
	};
	VE.on("bin", renderMiss); VE.on("change", renderMiss); VE.on("mediaReady", renderMiss);
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
		var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); importFiles(fs); return; }
		var ae = document.activeElement; if (ae && ae !== document.body && !app.contains(ae)) return;
		if (readClip()) { e.preventDefault(); VE.paste(); }   // Ctrl+V with copied clips
	});

	/* ---------- clip clipboard: cut / copy / paste (kept in this browser, so it also works between tabs and projects that share the media) ---------- */
	var CLIPKEY = "mes-video-editor:clipboard", clipMem = null;
	function readClipAny() { return readClip(); }
	function readClip() { if (clipMem) return clipMem; try { var c = JSON.parse(localStorage.getItem(CLIPKEY)); if (c && c.clips && c.clips.length) return (clipMem = c); } catch (e) { /* ignore */ } return null; }
	window.addEventListener("storage", function (e) { if (e.key === CLIPKEY) clipMem = null; });
	VE.copy = function (quiet) {
		var list = V.withLinks(VE.P, targets().map(function (c) { return c.id; })).map(function (id) { return V.clip(VE.P, id); }).filter(Boolean);
		if (!list.length) { toast("Select a clip first (click it; Shift-click adds more)."); return false; }
		var t0 = Math.min.apply(null, list.map(function (c) { return c.start; }));
		clipMem = { t0: t0, at: Date.now(), clips: list.map(function (c) {
			var tr = V.track(VE.P, c.track), kind = V.kindFor(c.type), same = VE.P.tracks.filter(function (t) { return t.kind === kind; });
			return { c: JSON.parse(JSON.stringify(c)), row: same.indexOf(tr) };
		}) };
		try { localStorage.setItem(CLIPKEY, JSON.stringify(clipMem)); } catch (e) { /* too big: kept in this tab only */ }
		if (!quiet) toast("Copied " + list.length + " clip" + (list.length === 1 ? "" : "s") + ". Ctrl+V pastes at the playhead (right-click a track: Paste here).");
		return true;
	};
	VE.cut = function () { if (!VE.copy(true)) return; var n = clipMem.clips.length; VE.del(false); toast("Cut " + n + " clip" + (n === 1 ? "" : "s") + ". Ctrl+V pastes them at the playhead."); };
	// paste at time at (default the playhead); onTrack = the track that was right-clicked (the copied clips move there, keeping their rows relative to each other)
	VE.paste = function (at, onTrack) {
		var cb = readClip(); if (!cb) { toast("Nothing copied yet: select clips and press Ctrl+C (or right-click → Copy)."); return; }
		var items = cb.clips.filter(function (q) { return q.c.type === "text" || VE.media(q.c.media); });
		if (!items.length) { toast("The copied clips use media that is not in this project's Media bin. Import the same files first."); return; }
		var t = at != null ? at : VE.t, links = {}, made = [], added = 0, kinds = { v: VE.P.tracks.filter(function (x) { return x.kind === "v"; }), a: VE.P.tracks.filter(function (x) { return x.kind === "a"; }) };
		// row offset per kind: the right-clicked track takes the top copied row of its kind
		var off = { v: 0, a: 0 };
		if (onTrack) { var k0 = onTrack.kind, rows0 = items.filter(function (q) { return V.kindFor(q.c.type) === k0; }).map(function (q) { return Math.max(0, q.row); }); if (rows0.length) off[k0] = kinds[k0].indexOf(onTrack) - Math.min.apply(null, rows0); }
		var placed = [];
		items.forEach(function (q) {
			var d = JSON.parse(JSON.stringify(q.c)), kind = V.kindFor(d.type), list = kinds[kind];
			d.id = V.uid("c"); d.start = Math.max(0, t + (q.c.start - cb.t0));
			if (d.link) d.link = links[d.link] || (links[d.link] = V.uid("L"));
			var want = list[V.clamp((q.row < 0 ? 0 : q.row) + off[kind], 0, list.length - 1)], dur = V.dur(d), tr = null;
			function free(x) { return x && !x.lock && (x.mag || (V.canPlace(VE.P, x.id, d.start, dur) && !placed.some(function (o) { return o.track === x.id && o.start < d.start + dur - 1e-6 && d.start < o.start + V.dur(o) - 1e-6; }))); }
			if (free(want)) tr = want; else for (var j = 0; j < list.length && !tr; j++) if (free(list[j])) tr = list[j];
			if (!tr) { tr = VE.addTrack(kind, want); list.splice(list.indexOf(want) + (kind === "v" ? 0 : 1), 0, tr); added++; }
			d.track = tr.id; placed.push(d);
		});
		placed.forEach(function (d) { VE.P.clips.push(d); made.push(d.id); var tr = V.track(VE.P, d.track); if (tr.mag) V.magnetInsert(VE.P, tr.id, d.id, d.start); });
		V.syncLinks(VE.P); VE.sel = made; VE.commit("Paste");
		var skipped = cb.clips.length - items.length;
		toast("Pasted " + made.length + " clip" + (made.length === 1 ? "" : "s") + (added ? " (" + added + " new track" + (added === 1 ? "" : "s") + ": there was no room on the others)" : "") + (skipped ? ". " + skipped + " skipped: their media is not in this project." : "."));
	};
	// move the selected clips one track up (-1) or down (1); a new track is made past the top video / bottom sound track. Linked partners of the other kind stay.
	VE.moveRow = function (dir) {
		var sel = targets().filter(function (c) { var tr = V.track(VE.P, c.track); return tr && !tr.lock; });
		if (!sel.length) { toast("Select a clip first."); return; }
		var snap = JSON.stringify(VE.P), ids = {}; sel.forEach(function (c) { ids[c.id] = 1; });
		var plan = [];
		["v", "a"].forEach(function (kind) {
			var mine = sel.filter(function (c) { return V.kindFor(c.type) === kind; }); if (!mine.length) return;
			var list = VE.P.tracks.filter(function (x) { return x.kind === kind; });
			var idx = mine.map(function (c) { return list.indexOf(V.track(VE.P, c.track)); }), lo = Math.min.apply(null, idx), hi = Math.max.apply(null, idx);
			if (lo + dir < 0) { var nt = VE.addTrack(kind, list[0], "above"); list.unshift(nt); idx = idx.map(function (i) { return i + 1; }); }
			else if (hi + dir >= list.length) { var nb = VE.addTrack(kind, list[list.length - 1], "below"); list.push(nb); }
			mine.forEach(function (c, i) { plan.push([c, list[idx[i] + dir]]); });
		});
		var bad = plan.some(function (q) { return q[1].lock; });
		plan.forEach(function (q) { q[0].track = q[1].id; });
		if (!bad) bad = plan.some(function (q) { return !q[1].mag && !V.canPlace(VE.P, q[1].id, q[0].start, V.dur(q[0]), ids); });
		if (bad) { VE.P = JSON.parse(snap); VE.tl.render(); toast("There is no room on that layer (clips on one layer cannot overlap): move the clips sideways first, or make that layer magnetic."); return; }
		plan.forEach(function (q) { if (q[1].mag) V.magnetInsert(VE.P, q[1].id, q[0].id, q[0].start); });
		VE.commit(dir < 0 ? "Move up a layer" : "Move down a layer");
	};
	VE.moveTrack = function (tr, dir) {
		var list = VE.P.tracks, i = list.indexOf(tr), j = i + dir; if (i < 0 || j < 0 || j >= list.length || list[j].kind !== tr.kind) return;
		list.splice(i, 1); list.splice(j, 0, tr); VE.commit("Move layer");
	};

	/* ---------- right-click menu on the timeline ---------- */
	var ctxEl = null;
	function ctxClose() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
	VE.ctxMenu = function (x, y, info) {
		ctxClose();
		var c = info.clip, tr = info.track || (c && V.track(VE.P, c.track)), sel = targets(), cb = readClip(), mac = /Mac|iP/.test(navigator.platform || ""), K = mac ? "⌘" : "Ctrl+", items = [];
		function it(label, key, fn, off) { items.push({ l: label, k: key || "", f: fn, off: !!off }); }
		function sep() { if (items.length && items[items.length - 1] !== "-") items.push("-"); }
		var tname = tr ? tr.name : "";
		if (c) {
			it("Cut", K + "X", VE.cut); it("Copy", K + "C", function () { VE.copy(); });
			it("Paste at the playhead", K + "V", function () { VE.paste(); }, !cb);
			it("Duplicate", K + "D", VE.duplicate);
			sep();
			it("Split at the playhead", "S", VE.split, !(V.active(c, VE.t) && VE.t > c.start));
			it("Delete", "Del", function () { VE.del(false); }); it("Ripple delete (close the gap)", "Shift+Del", function () { VE.del(true); });
			sep();
			it("Move up a layer", "Alt+↑", function () { VE.moveRow(-1); }); it("Move down a layer", "Alt+↓", function () { VE.moveRow(1); });
			sep();
			if (c.link) { it("Unlink (move them apart)", "", function () { V.unlink(VE.P, c.id); VE.commit("Unlink"); }); it("Put the sound back into the video", "", function () { var v = V.joinAudio(VE.P, c.id); VE.sel = v ? [v.id] : []; VE.commit("Put the sound back"); }); }
			else { var lp = V.linkCandidate(VE.P, sel.length > 1 ? sel : [c]); if (lp) it("Link video and sound", "", function () { VE.linkBack(lp); }); }
			if (!c.link && c.type === "video" && VE.hasSound(c)) it("Separate video and audio", K + "Shift+A", function () { VE.separate(sel); });
			it("Select everything on " + tname, "", function () { VE.sel = V.onTrack(VE.P, tr.id).map(function (q) { return q.id; }); VE.emit("select"); });
		} else if (tr) {
			it("Paste here (" + V.short(info.t) + ", " + tname + ")", "", function () { VE.paste(info.t, tr); }, !cb || tr.lock);
			it("Paste at the playhead", K + "V", function () { VE.paste(); }, !cb);
			if (!info.head && tr.kind === "v") it("Add a title here", "", function () { VE.addTitle(null, info.t, tr.id); }, tr.lock);
			it("Select everything on " + tname, "", function () { VE.sel = V.onTrack(VE.P, tr.id).map(function (q) { return q.id; }); VE.emit("select"); }, !V.onTrack(VE.P, tr.id).length);
			sep();
			it("Rename layer…", "", function () { var nm = window.prompt("Track name", tr.name); if (nm) { tr.name = nm.slice(0, 40); VE.commit("Rename layer"); } });
			it("Add a layer above", "", function () { VE.addTrack("v", tr, "above"); VE.commit("Add layer"); });
			it("Add a layer below", "", function () { VE.addTrack("v", tr, "below"); VE.commit("Add layer"); });
			var li = VE.P.tracks.indexOf(tr), up = VE.P.tracks[li - 1], dn = VE.P.tracks[li + 1];
			it("Move this layer up", "", function () { VE.moveTrack(tr, -1); }, !up);
			it("Move this layer down", "", function () { VE.moveTrack(tr, 1); }, !dn);
			var same = VE.P.tracks.filter(function (q) { return q.kind === tr.kind; }).length;
			it("Delete this layer", "", function () { VE.P.tracks = VE.P.tracks.filter(function (q) { return q !== tr; }); VE.commit("Delete layer"); }, same < 2 || V.onTrack(VE.P, tr.id).length > 0);
		} else {
			it("Paste at the playhead", K + "V", function () { VE.paste(); }, !cb);
		}
		if (items[items.length - 1] === "-") items.pop();
		var el = document.createElement("div"); el.className = "vd-ctx"; el.setAttribute("role", "menu");
		el.innerHTML = items.map(function (q, i) { return q === "-" ? '<hr role="separator">' : '<button type="button" role="menuitem" data-i="' + i + '"' + (q.off ? " disabled" : "") + "><span>" + esc(q.l) + "</span><kbd>" + esc(q.k) + "</kbd></button>"; }).join("");
		app.appendChild(el); ctxEl = el;
		var r = el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
		el.style.left = Math.max(4, Math.min(x, W - r.width - 4)) + "px"; el.style.top = Math.max(4, y + r.height > H - 4 ? y - r.height : y) + "px";
		el.addEventListener("click", function (e) { var b = e.target.closest("button[data-i]"); if (!b || b.disabled) return; var q = items[+b.getAttribute("data-i")]; ctxClose(); q.f(); });
		el.addEventListener("keydown", function (e) {
			var bs = [].slice.call(el.querySelectorAll("button:not([disabled])")), i = bs.indexOf(document.activeElement);
			if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); (bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length] || bs[0]).focus(); }
			else if (e.key === "Escape") { e.preventDefault(); ctxClose(); }
			e.stopPropagation();
		});
		var first = el.querySelector("button:not([disabled])"); if (first) first.focus({ preventScroll: true });
	};
	document.addEventListener("pointerdown", function (e) { if (ctxEl && !ctxEl.contains(e.target)) ctxClose(); }, true);
	window.addEventListener("blur", ctxClose); window.addEventListener("resize", ctxClose);
	document.addEventListener("scroll", function (e) { if (ctxEl && !ctxEl.contains(e.target)) ctxClose(); }, true);

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
		setTimeout(function () { if (V.active(c, VE.t)) VE.preview.editText(c); else { var ta = $("vd-ttext"); if (ta) { ta.focus(); ta.select(); } } }, 60);
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
	$("vd-addv").onclick = function () { VE.addTrack("v"); VE.commit("Add layer"); };
	$("vd-addtitle").onclick = function () { VE.addTitle(); };
	$("vd-undo").onclick = VE.undo; $("vd-redo").onclick = VE.redo; $("vd-undo2").onclick = VE.undo; $("vd-redo2").onclick = VE.redo;
	// one Snap setting for the timeline and the preview (remembered); Alt while dragging does the opposite
	VE.tl.snap = UI.snap !== false; $("vd-snapchk").checked = VE.tl.snap;
	$("vd-snapchk").onchange = function () { VE.tl.snap = this.checked; UI.snap = this.checked; saveUI(); };

	/* ---------- zoom ---------- */
	var zr = $("vd-zoom");
	// log scale from VE.PPS_MIN (about 10 hours across a screen) to 600 px a second
	var ZL0 = Math.log10(VE.PPS_MIN), ZL1 = Math.log10(600);
	function z2s(v) { return Math.pow(10, ZL0 + v / 1000 * (ZL1 - ZL0)); }
	function s2z(p) { return Math.round((Math.log10(Math.max(VE.PPS_MIN, p)) - ZL0) / (ZL1 - ZL0) * 1000); }
	zr.value = s2z(VE.pps);
	zr.addEventListener("input", function () { VE.tl.zoom(z2s(+zr.value)); });
	VE.on("zoom", function (p) { zr.value = s2z(p); });
	$("vd-zin").onclick = function () { VE.tl.zoom(VE.pps * 1.5); }; $("vd-zout").onclick = function () { VE.tl.zoom(VE.pps / 1.5); }; $("vd-zfit").onclick = function () { VE.tl.fit(); };

	/* ---------- transport ---------- */
	var P = VE.preview;
	$("vd-play").onclick = function () { P.toggle(); };
	// speed: - / + in 0.05 steps (hold = keeps going and speeds up), a preset list, "Type a speed..." for any value from 1 frame / s to 45x
	var spSel = $("vd-speed"), spIn = $("vd-spin");
	function fillSpeed() {
		var s = P.speed, fps = VE.P.fps, L = V.SPEED_PRESETS.slice(), min = V.speedMin(fps), h = "";
		if (L.indexOf(min) < 0) L.unshift(min);
		if (!L.some(function (x) { return Math.abs(x - s) < 1e-9; })) { L.push(s); L.sort(function (a, b) { return a - b; }); }
		L.forEach(function (x) { h += '<option value="' + x + '"' + (Math.abs(x - s) < 1e-9 ? " selected" : "") + ">" + V.speedLabel(x, fps) + "</option>"; });
		spSel.innerHTML = h + '<option value="type" title="Type any speed: 2.35, 300%, 1/2 or 5 fps">Type…</option>';
		spSel.classList.toggle("is-on", Math.abs(s - 1) > 1e-9);
		$("vd-spdn").disabled = s <= min + 1e-9; $("vd-spup").disabled = s >= V.SPEED_MAX - 1e-9;
	}
	P.speed = V.clampSpeed(UI.speed || 1, VE.P.fps); fillSpeed();
	spSel.onchange = function () {
		if (spSel.value !== "type") return P.setSpeed(+spSel.value);
		spSel.value = String(P.speed); spSel.hidden = true; spIn.hidden = false; spIn.value = V.speedLabel(P.speed, VE.P.fps).replace("×", ""); spIn.focus(); spIn.select();
	};
	function closeIn() { spIn.hidden = true; spSel.hidden = false; }
	spIn.addEventListener("keydown", function (e) {
		e.stopPropagation();
		if (e.key === "Escape") { e.preventDefault(); closeIn(); spSel.focus(); return; }
		if (e.key !== "Enter") return;
		e.preventDefault(); var v = V.parseSpeed(spIn.value, VE.P.fps);
		if (v == null) { toast("Type a speed like 2.35, 300%, 1/2 or 5 fps (from 1 frame per second up to 45×)."); return; }
		closeIn(); P.setSpeed(v); spSel.focus();
	});
	spIn.addEventListener("blur", function () { setTimeout(closeIn, 120); });
	// hold - / +: one step at once, then repeats after 0.4 s; 0.05 steps for the first second, then 0.25, then 1
	[["vd-spdn", -1], ["vd-spup", 1]].forEach(function (b) {
		var el = $(b[0]), t0 = 0, tm = 0, held = false;
		function stop() { clearTimeout(tm); tm = 0; }
		function rep() { var dt = performance.now() - t0; P.nudgeSpeed(b[1], dt > 2600 ? 1 : dt > 1400 ? 0.25 : 0.05); tm = setTimeout(rep, 90); }
		el.addEventListener("pointerdown", function (e) { if (e.button !== 0 || el.disabled) return; e.preventDefault(); held = true; t0 = performance.now(); P.nudgeSpeed(b[1]); tm = setTimeout(rep, 420); });
		["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { el.addEventListener(ev, stop); });
		el.addEventListener("click", function (e) { if (held) { held = false; return; } P.nudgeSpeed(b[1]); });   // keyboard Enter / Space
	});
	var spToastT = 0;
	VE.on("speed", function (s) {
		UI.speed = s; saveUI(); fillSpeed();
		leftText();
		clearTimeout(spToastT);
		spToastT = setTimeout(function () { if (Math.abs(s - 1) > 1e-9) toast("Preview speed " + V.speedLabel(s, VE.P.fps) + (s > 16 + 1e-9 || s < 0.0625 - 1e-9 ? ": the browser can't play this fast or slow, so frames are skipped and there is no sound" : "") + " (the exported video is not changed)", 3500); }, 250);
	});
	VE.on("change", function () { if (P.speed < V.speedMin(VE.P.fps) - 1e-9) P.setSpeed(P.speed); else fillSpeed(); });
	// previous / next clip edge (Camtasia: Ctrl+Alt+Left / Right)
	VE.goEdit = function (dir) { if (P.playing) P.pause(); var t = V.nextEdit(VE.P, VE.t, dir, 0.5 / VE.P.fps); if (t == null) t = dir > 0 ? V.duration(VE.P) : 0; P.seek(t); VE.tl.reveal(t); };
	// one frame back / forward; pressing and holding keeps stepping, waiting for each frame to show so it never runs ahead of the picture
	VE.stepFrame = function (dir, big) { if (P.playing) P.pause(); P.seek(VE.t + dir * (big ? 1 : 1 / VE.P.fps)); VE.tl.reveal(VE.t); };
	var hold = null;
	function stopHold() { if (hold) { clearTimeout(hold.timer); hold = null; } }
	document.querySelectorAll("[data-tp]").forEach(function (b) {
		var a = b.getAttribute("data-tp");
		if (a === "back" || a === "fwd" || a === "back1s" || a === "fwd1s") {
			var dir = a === "fwd" || a === "fwd1s" ? 1 : -1, sec = a.length > 4;
			b.addEventListener("pointerdown", function (e) {
				if (e.button > 0) return; e.preventDefault(); stopHold(); VE.stepFrame(dir, sec || e.shiftKey);
				var big = sec || e.shiftKey, h = hold = { last: performance.now() };
				(function next(delay) { h.timer = setTimeout(function () { if (hold !== h) return; if (P.seeking() && performance.now() - h.last < 400) return next(15); h.last = performance.now(); VE.stepFrame(dir, big); next(big ? 120 : 1000 / Math.min(30, VE.P.fps)); }, delay); })(380);
				try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			});
			["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { b.addEventListener(ev, stopHold); });
			b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); VE.stepFrame(dir, sec || e.shiftKey); } });
			return;
		}
		b.onclick = function () { if (a === "start") { P.seek(0); VE.tl.reveal(0); } else if (a === "end") { P.seek(V.duration(VE.P)); VE.tl.reveal(VE.t); } else if (a === "prevclip") VE.goEdit(-1); else if (a === "nextclip") VE.goEdit(1); };
	});
	// the time under the preview is a box: type a time (4:23;13, 1:02:03, 263, 2m30s, +10, -5) and press Enter to go there
	var tin = $("vd-tin");
	function timeText() { if (document.activeElement !== tin) tin.value = V.tc(VE.t, VE.P.fps); tin.style.width = Math.max(7, tin.value.length + 1) + "ch"; $("vd-tdur").textContent = V.tc(V.duration(VE.P), VE.P.fps); leftText(); }
	function leftText() { var d = V.duration(VE.P), sp = P.speed || 1, el = $("vd-tleft"); if (!(d > 0) || VE.t >= d - 1e-6) { el.textContent = ""; return; } el.textContent = V.watchLeft(VE.t, d, sp) + " left" + (Math.abs(sp - 1) > 1e-9 ? " at " + V.speedLabel(sp, VE.P.fps) : ""); }
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
		else if (a === "new") { if (window.confirm("Start a new, empty project? The current one and its media are removed from this browser (save a project file first if you want it).")) { P.pause(); VE.clearAll().then(function () { if (mdir.h) VE.idbPut("kv", "mediadir", mdir.h).catch(function () { }); }); linkProject(null); cloudUnlink(); } }
		else if (a === "snapshot") snapshot(); else if (a === "export") openExport(); else if (a === "narrate") openNarrate();
	});

	/* ---------- Edit menu: every common edit in one place, with the shortcut and what Undo / Redo would do ---------- */
	var em = $("vd-editmenu"), mac = /Mac|iP/.test(navigator.platform || ""), MK = mac ? "⌘" : "Ctrl+";
	function editItems() {
		var sel = VE.selected(), has = sel.length > 0, cb = (function () { try { return !!readClipAny(); } catch (e) { return false; } })(), c0 = sel[0], tr0 = c0 && V.track(VE.P, c0.track);
		var ul = VE.hist.undoLabel(), rl = VE.hist.redoLabel(), inClip = VE.P.clips.some(function (c) { return VE.t > c.start && VE.t < V.end(c); });
		return [
			["undo", "Undo" + (ul ? " " + ul.toLowerCase() : ""), MK + "Z", !VE.hist.canUndo()], ["redo", "Redo" + (rl ? " " + rl.toLowerCase() : ""), MK + (mac ? "⇧Z" : "Y"), !VE.hist.canRedo()], "-",
			["cut", "Cut", MK + "X", !has], ["copy", "Copy", MK + "C", !has], ["paste", "Paste at the playhead", MK + "V", !cb], ["dup", "Duplicate", MK + "D", !has], "-",
			["del", "Delete", "Del", !has], ["ripple", "Ripple delete (close the gap)", "Shift+Del", !has], ["split", "Split at the playhead", "S", !inClip], ["cutrange", "Cut out the marked part (I to O)", "", !marksOk()], "-",
			["all", "Select all", MK + "A", !VE.P.clips.length], ["track", "Select everything on " + (tr0 ? tr0.name : "this layer"), "", !tr0], ["after", "Select everything after the playhead", "", !VE.P.clips.length], ["none", "Select nothing", "Esc", !has], "-",
			["up", "Move up a layer", "Alt+↑", !has], ["down", "Move down a layer", "Alt+↓", !has], ["addlayer", "Add a layer", "", false], ["sep", c0 && c0.link ? "Unlink video and sound" : "Separate video and audio", c0 && c0.link ? "" : MK + "⇧A", !(c0 && (c0.link || (c0.type === "video" && VE.hasSound(c0))))], ["link", "Link video and sound", "", !V.linkCandidate(VE.P, sel.length > 1 ? sel : [c0])], "-",
			["narrate", "Add narration from text…", "N", false], ["title", "Add a title", "T", false], ["markin", "Mark in here", "I", false], ["markout", "Mark out here", "O", false], ["goto", "Go to a time…", MK + "G", false],
		];
	}
	function renderEdit() {
		em.innerHTML = editItems().map(function (q) { return q === "-" ? "<hr>" : '<button type="button" role="menuitem" data-ea="' + q[0] + '"' + (q[3] ? " disabled" : "") + ">" + esc(q[1]) + (q[2] ? " <kbd>" + esc(q[2]) + "</kbd>" : "") + "</button>"; }).join("");
	}
	$("vd-editbtn").onclick = function (e) { e.stopPropagation(); fm.hidden = true; if (em.hidden) renderEdit(); em.hidden = !em.hidden; this.setAttribute("aria-expanded", !em.hidden); var f = em.querySelector("button:not([disabled])"); if (!em.hidden && f) f.focus({ preventScroll: true }); };
	document.addEventListener("click", function (e) { if (!em.hidden && !e.target.closest(".vd-menu")) { em.hidden = true; $("vd-editbtn").setAttribute("aria-expanded", "false"); } });
	em.addEventListener("keydown", function (e) { var bs = [].slice.call(em.querySelectorAll("button:not([disabled])")), i = bs.indexOf(document.activeElement); if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); (bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length] || bs[0]).focus(); } else if (e.key === "Escape") { e.stopPropagation(); em.hidden = true; $("vd-editbtn").focus(); } });
	em.addEventListener("click", function (e) {
		var b = e.target.closest("[data-ea]"); if (!b || b.disabled) return; em.hidden = true; $("vd-editbtn").setAttribute("aria-expanded", "false");
		var a = b.getAttribute("data-ea"), sel = VE.selected(), c0 = sel[0];
		({
			undo: VE.undo, redo: VE.redo, cut: VE.cut, copy: function () { VE.copy(); }, paste: function () { VE.paste(); }, dup: VE.duplicate,
			del: function () { VE.del(false); }, ripple: function () { VE.del(true); }, split: VE.split, cutrange: function () { $("vd-cutrange").click(); },
			all: function () { VE.sel = VE.P.clips.map(function (c) { return c.id; }); VE.emit("select"); },
			track: function () { VE.sel = V.onTrack(VE.P, c0.track).map(function (c) { return c.id; }); VE.emit("select"); },
			after: function () { VE.sel = VE.P.clips.filter(function (c) { return V.end(c) > VE.t + 1e-6; }).map(function (c) { return c.id; }); VE.emit("select"); },
			none: function () { VE.sel = []; VE.emit("select"); },
			up: function () { VE.moveRow(-1); }, down: function () { VE.moveRow(1); }, addlayer: function () { VE.addTrack("v", c0 ? V.track(VE.P, c0.track) : null, "above"); VE.commit("Add layer"); },
			link: function () { VE.linkBack(V.linkCandidate(VE.P, sel.length > 1 ? sel : [c0])); },
			sep: function () { if (c0.link) { V.unlink(VE.P, c0.id); VE.commit("Unlink"); } else VE.separate(sel); },
			narrate: openNarrate, title: function () { VE.addTitle(); }, markin: function () { mark("in"); }, markout: function () { mark("out"); }, goto: function () { tin.focus(); },
		})[a]();
	});
	/* ---------- project file: like the Photo Editor, a project opened from or saved to a file stays linked to it, so Ctrl+S writes
	   that same file again (no new name each time). Needs the File System Access API (Chrome, Edge, Opera on a computer; Brave behind
	   brave://flags/#file-system-access-api); elsewhere every save is a download. The link survives a reload (handle in IndexedDB). */
	var proj = { h: null, name: "", lm: 0, savedRev: -1 }, FSA = !!window.showSaveFilePicker, rev = 0;
	VE.on("change", function (label) { rev++; if (label === "restore") { proj.savedRev = rev; cloudRev = rev; } projState(); if (cloud) cloud.changed(vdoc); renderSync(); });   // the autosave coming back is not a new change
	function projData() { return { format: "mes-video", v: 1, saved: new Date().toISOString(), project: VE.P, media: VE.bin.map(function (m) { return { id: m.id, name: m.name, origName: m.origName || "", size: m.size, kind: m.kind, dur: m.dur }; }) }; }
	function projBlob() { return new Blob([JSON.stringify(projData(), null, 1)], { type: "application/json" }); }
	function projFileName() { return (VE.P.name || "video").replace(/[\\/:*?"<>|]+/g, "-").replace(/(\.mesvideo)+$/i, "") + ".mesvideo"; }
	function linkProject(h, lm) {
		proj.h = h || null; proj.name = h ? h.name : ""; proj.lm = lm || 0; proj.savedRev = h ? rev : -1;
		if (h) cloudUnlink();   // one place to save to at a time
		(h ? VE.idbPut("kv", "projfile", { h: h, lm: proj.lm }) : VE.idbDel("kv", "projfile")).catch(function () { /* the link just won't survive a reload */ });
		projState();
	}
	VE.idbGet("kv", "projfile").then(function (v) { if (v && v.h && v.h.kind === "file") { proj.h = v.h; proj.name = v.h.name; proj.lm = v.lm || 0; proj.savedRev = rev; projState(); } }).catch(function () { });
	function projState() {
		var b = fm.querySelector('[data-act="saveproj"]'), st = $("vd-projst");
		if (cloud && cloud.linked(vdoc)) { var cl = cloud.link(vdoc); if (b) b.innerHTML = "Save to " + esc(cl.name) + " (" + esc(cl.p === "file" ? "file" : (cloud.providers[cl.p] || {}).name || cl.p) + ") <kbd>Ctrl+S</kbd>"; if (st) st.hidden = true; return; }
		if (b) b.innerHTML = (proj.h ? "Save to " + esc(proj.name) : "Save project file (.mesvideo)") + " <kbd>Ctrl+S</kbd>";
		if (st) { var dirty = proj.h && proj.savedRev !== rev; st.hidden = !proj.h; st.textContent = proj.h ? (dirty ? "● " : "") + proj.name : ""; st.title = proj.h ? (dirty ? "Changes not saved to " + proj.name + " yet (Ctrl+S saves them)" : "Linked to " + proj.name + ": Ctrl+S saves to it") : ""; st.classList.toggle("is-dirty", !!dirty); }
	}
	async function permOk(h) {
		try { var o = { mode: "readwrite" }; if (await h.queryPermission(o) === "granted") return true; return await h.requestPermission(o) === "granted"; } catch (e) { return false; }
	}
	async function writeTo(h) { var w = await h.createWritable(); await w.write(projBlob()); await w.close(); var f = await h.getFile(); return f.lastModified; }
	var dlNoted = false;
	async function saveProject(asNew) {
		if (!asNew && cloud && cloud.linked(vdoc)) { cloud.save(vdoc); return true; }
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
				toast("Saved to " + proj.name + "." + mediaWarnText()); return true;
			} catch (e) { if (e && e.name === "NotFoundError") { toast(proj.name + " is gone (moved or deleted): choose where to save it."); return saveProject(true); } toast("Could not save: " + (e && e.message || e)); return false; }
		}
		try { h = await window.showSaveFilePicker({ suggestedName: proj.name || projFileName(), types: [{ description: "MES Video Editor project", accept: { "application/json": [".mesvideo"] } }] }); }
		catch (e) { return false; }   // cancelled
		try { var lm2 = await writeTo(h); linkProject(h, lm2); toast("Saved to " + h.name + ". From now on Ctrl+S saves to this file. It holds the edit, not the media: keep the video files" + (mdir.h ? "." + mediaWarnText() : " (Media → Link my media folder keeps track of them)."), 9000); return true; }
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
	// the text is read before the question: a File snapshot goes stale if the file changes meanwhile (OneDrive / Dropbox touching it),
	// and the browser then refuses to read it ("could not be read") after the person clicks Open without saving
	async function readProjectFile(f, h) {
		try { return { txt: await f.text(), f: f }; }
		catch (e) {
			var hh = h && typeof h.then === "function" ? await h.catch(function () { return null; }) : h;
			if (hh && hh.getFile) { var f2 = await hh.getFile(); return { txt: await f2.text(), f: f2 }; }
			throw e;
		}
	}
	async function askOpenProject(f0, h) {
		var rd; try { rd = await readProjectFile(f0, h); } catch (e) { toast("Could not read " + (f0.name || "the project file") + ": " + (e && e.message || e) + " Try opening it again.", 9000); return; }
		var f = rd.f, txt = rd.txt;
		function go() { return openProjectText(txt, f.name, h, f.lastModified, false); }
		var n = VE.P.clips.length, nm = VE.bin.length;
		if (!n && !nm) return go();
		dialog("<h3>Open " + esc(f.name) + "?</h3><p class=\"vd-dtxt\">A project is already open: <b>" + esc(VE.P.name || "Untitled video") + "</b> (" + n + " clip" + (n === 1 ? "" : "s") + ", " + nm + " media file" + (nm === 1 ? "" : "s") + "). Opening the new one replaces it in this browser. Its media files stay in the library only if the new project uses them.</p>" +
			"<p class=\"vd-dtxt\">Save a project file of the current one first if you want to come back to it.</p>" +
			"<div class=\"vd-dlgact\"><button type=\"button\" class=\"vd-btn vd-primary\" id=\"vd-op-save\">Save current, then open</button> <button type=\"button\" class=\"vd-btn\" id=\"vd-op-go\">Open without saving</button> <button type=\"button\" class=\"vd-btn\" id=\"vd-op-no\">Cancel</button></div>");
		$("vd-op-save").onclick = async function () { closeDialog(); if (await saveProject()) go(); };
		$("vd-op-go").onclick = function () { closeDialog(); go(); };
		$("vd-op-no").onclick = closeDialog;
	}
	function openProject(f, h) { return f.text().then(function (txt) { return openProjectText(txt, f.name, h, f.lastModified, false); }); }
	// opens a project's text; h = the local file it came from (linked for Ctrl+S), cloud = it came through the ☁ Cloud button
	function openProjectText(txt, name, h, lm, cloud) {
		toast("Opening " + (name || "the project") + "…", 60000);
		return Promise.resolve().then(async function () {
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
			if (hh && hh.kind === "file") linkProject(hh, lm); else linkProject(null);
			if (!cloud) cloudUnlink();
			if (mdir.h && VE.bin.some(function (m) { return m.state === "missing"; })) toast("Project opened. Looking for its media files in " + mdir.h.name + "… (a big folder can take a while)", 120000);
			var got = await relinkFromFolder(false);
			var miss = VE.bin.filter(function (m) { return m.state === "missing"; }).length;
			toast((got ? "Found " + got + " media file" + (got > 1 ? "s" : "") + " in your media folder. " : "") + (miss ? miss + " media file" + (miss > 1 ? "s are" : " is") + " missing: " + (mdir.h ? "they are not in " + mdir.h.name + ". " : "") + "drop them in (same names) to relink" + (mdir.h ? "." : ", or link the folder they are in (Media → Link my media folder).") : "Project opened."), 9000);
			return true;
		}).catch(function (e) { toast("Could not open it: " + e.message); return false; });
	}
	/* ---------- media folder: the videos stay in a folder that OneDrive / Dropbox / Google Drive / iCloud syncs (their desktop app
	   uploads them, which is far better at multi-GB files than a web page). The editor remembers that folder (handle in IndexedDB),
	   checks which media files are in it, relinks missing ones from it by name when a project opens, and warns about media that is
	   only in this browser (with a button that copies them into the folder). Nothing is uploaded by mes.fm. */
	var mdir = { h: null, idx: null, perm: "", busy: false, err: "" }, FSD = !!window.showDirectoryPicker;
	async function scanDir(h) {
		var out = [], n = 0;
		async function walk(d, path, depth) {
			for await (var e of d.values()) {
				if (++n > 40000) return;
				if (e.kind === "file") { if (V.MEDIA_EXT.test(e.name)) { var f = await e.getFile(); out.push({ name: e.name, size: f.size, path: path + e.name, h: e }); } }
				else if (depth < 5 && !/^\.|^(node_modules|\$RECYCLE\.BIN)$/i.test(e.name)) await walk(e, path + e.name + "/", depth + 1);
			}
		}
		await walk(h, "", 0); return V.folderIndex(out);
	}
	async function folderPerm(ask, write) {
		if (!mdir.h) return false;
		var o = { mode: write ? "readwrite" : "read" };
		try { var st = await mdir.h.queryPermission(o); if (st !== "granted" && ask) st = await mdir.h.requestPermission(o); mdir.perm = st; return st === "granted"; } catch (e) { mdir.perm = "denied"; return false; }
	}
	async function rescan(ask) {
		if (!mdir.h || mdir.busy) return false;
		if (!(await folderPerm(ask))) { renderSync(); return false; }
		mdir.busy = true; mdir.err = ""; renderSync();
		try { mdir.idx = await scanDir(mdir.h); } catch (e) { mdir.err = e && e.name === "NotFoundError" ? mdir.h.name + " is gone (moved or deleted)." : String(e && e.message || e); mdir.idx = null; }
		mdir.busy = false; renderSync(); renderBin(); return !!mdir.idx;
	}
	// missing media that is in the folder: open it from there
	async function relinkFromFolder(ask) {
		if (!mdir.h) return 0;
		if (!mdir.idx && !(await rescan(ask))) return 0;
		var n = 0;
		for (var i = 0; i < VE.bin.length; i++) {
			var m = VE.bin[i], pl = V.mediaPlace(m, mdir.idx); if (pl.s !== "found") continue;
			try { var f = await pl.e.h.getFile(); if (VE.relink(f)) n++; } catch (e) { /* skip */ }
		}
		if (n) renderBin();
		return n;
	}
	async function linkFolder() {
		if (!FSD) return toast("This browser can't link a folder" + (navigator.brave ? " (Brave can: turn on brave://flags/#file-system-access-api)" : ": use Chrome, Edge or Opera on a computer") + ". You can still drop the files in to relink them.", 9000);
		var h; try { h = await window.showDirectoryPicker({ id: "mes-video-media", mode: "read" }); } catch (e) { return; }
		mdir.h = h; mdir.idx = null; mdir.perm = "granted";
		VE.idbPut("kv", "mediadir", h).catch(function () { });
		await rescan(false);
		var got = await relinkFromFolder(false);
		var sm = V.mediaSyncSummary(VE.bin, mdir.idx);
		toast("Linked " + h.name + (mdir.idx ? " (" + mdir.idx.n + " media files)" : "") + "." + (got ? " Relinked " + got + " missing file" + (got > 1 ? "s" : "") + "." : "") + (sm.out.length ? " " + sm.out.length + " of your media file" + (sm.out.length > 1 ? "s are" : " is") + " not in it yet." : ""), 8000);
	}
	function unlinkFolder() { mdir.h = null; mdir.idx = null; mdir.perm = ""; VE.idbDel("kv", "mediadir").catch(function () { }); renderSync(); renderBin(); }
	// copy media that is only in this browser into the folder, so the other computer gets it through the sync app
	async function copyIntoFolder() {
		var sm = V.mediaSyncSummary(VE.bin, mdir.idx), list = sm.out.filter(function (m) { return m.file && m.state !== "missing"; });
		if (!list.length) return toast("Nothing to copy: every media file here is in the folder (or missing).");
		if (!(await folderPerm(true, true))) return toast("The browser did not allow writing into " + mdir.h.name + ".");
		mdir.busy = true; renderSync(); var done = 0;
		for (var i = 0; i < list.length; i++) {
			var m = list[i]; $("vd-sync-st") && ($("vd-sync-st").textContent = "Copying " + m.name + " (" + (i + 1) + " of " + list.length + ")…");
			try {
				var nm = m.name; try { await mdir.h.getFileHandle(nm); nm = nm.replace(/(\.[^.]+)?$/, " (from MES)$1"); } catch (e) { /* free name */ }
				var fh = await mdir.h.getFileHandle(nm, { create: true }), w = await fh.createWritable(); await w.write(m.file); await w.close();
				if (nm !== m.name) { m.name = nm; VE.save(); }
				done++;
			} catch (e) { toast("Could not copy " + m.name + ": " + (e && e.message || e)); break; }
		}
		mdir.busy = false; await rescan(false);
		toast("Copied " + done + " file" + (done === 1 ? "" : "s") + " into " + mdir.h.name + ". Your sync app uploads " + (done === 1 ? "it" : "them") + " from there.", 8000);
	}
	function mediaWarnText() {
		if (!mdir.h || !mdir.idx) return "";
		var sm = V.mediaSyncSummary(VE.bin, mdir.idx), k = sm.out.length + sm.differs.length;
		return k ? " ⚠ " + k + " media file" + (k > 1 ? "s are" : " is") + " not in " + mdir.h.name + ", so another computer won't find " + (k > 1 ? "them" : "it") + " (Media panel: Copy into the folder)." : "";
	}
	function syncBadge(m) {
		if (!mdir.idx) return "";
		var pl = V.mediaPlace(m, mdir.idx);
		if (pl.s === "in") return '<span class="vd-msync is-in" title="In your media folder: ' + esc(pl.e.path) + '">✓ in folder</span>';
		if (pl.s === "differs") return '<span class="vd-msync is-warn" title="The folder has a file called ' + esc(pl.e.path) + ' but of another size: not the same file">⚠ different file in folder</span>';
		if (pl.s === "out") return '<span class="vd-msync is-warn" title="Only in this browser: another computer can\'t find it. Use Copy into the folder.">⚠ not in folder</span>';
		return "";
	}
	function renderSync() {
		var el = $("vd-sync"); if (!el || !mdir) return;
		var h;
		if (!mdir.h) {
			var k = VE.bin.filter(function (m) { return m.kind !== "text"; }).length;
			h = '<button type="button" class="vd-btn vd-sm" data-sy="link" title="Choose the folder your videos are in, ideally inside OneDrive / Dropbox / Google Drive / iCloud">&#128193; Link my media folder</button>' + (k ? '<span class="vd-sync-t">Keep your videos in a synced folder so the project opens on any computer.</span>' : "");
		} else {
			var sm = mdir.idx ? V.mediaSyncSummary(VE.bin, mdir.idx) : null, warn = sm ? sm.out.length + sm.differs.length : 0;
			h = '<span class="vd-sync-f" title="Your media folder">&#128193; ' + esc(mdir.h.name) + "</span>";
			if (mdir.busy) h += '<span class="vd-sync-t" id="vd-sync-st">Looking through the folder…</span>';
			else if (mdir.err) h += '<span class="vd-sync-t vd-bad">' + esc(mdir.err) + "</span>";
			else if (!mdir.idx) h += '<button type="button" class="vd-btn vd-sm" data-sy="allow">Allow access</button><span class="vd-sync-t">The browser asks again after a restart.</span>';
			else {
				h += '<span class="vd-sync-t' + (warn ? " is-warn" : "") + '">' + (sm.total ? sm.in + " of " + sm.total + " media files in the folder" : mdir.idx.n + " media files in the folder") + (warn ? " · ⚠ " + warn + " only in this browser" : sm.total ? " ✓" : "") + (sm.found.length ? " · " + sm.found.length + " can be relinked" : "") + "</span>";
				if (sm.out.length) h += '<button type="button" class="vd-btn vd-sm vd-primary" data-sy="copy" title="Copy the media files that are only in this browser into the folder">Copy into the folder</button>';
				if (sm.found.length) h += '<button type="button" class="vd-btn vd-sm" data-sy="relink">Relink from the folder</button>';
			}
			h += '<span class="vd-sp"></span><button type="button" class="vd-btn vd-sm vd-ico" data-sy="rescan" title="Look through the folder again" aria-label="Look through the folder again">&#8635;</button><button type="button" class="vd-btn vd-sm vd-ico" data-sy="unlink" title="Stop using this folder" aria-label="Stop using this folder">&times;</button>';
		}
		el.innerHTML = h; if (cloud && !document.getElementById("mcl-dlg").hidden) cloud.refresh();
	}
	$("vd-sync").addEventListener("click", function (e) {
		var b = e.target.closest("[data-sy]"); if (!b) return; var a = b.getAttribute("data-sy");
		if (a === "link") linkFolder(); else if (a === "unlink") unlinkFolder(); else if (a === "copy") copyIntoFolder();
		else if (a === "rescan" || a === "allow") rescan(true).then(function (ok) { if (ok) relinkFromFolder(false); });
		else if (a === "relink") relinkFromFolder(true).then(function (n) { toast(n ? "Relinked " + n + " file" + (n > 1 ? "s" : "") + "." : "Nothing to relink."); });
	});
	VE.on("bin", renderSync);
	VE.idbGet("kv", "mediadir").then(function (h) { if (h && h.kind === "directory") { mdir.h = h; renderSync(); rescan(false).then(function (ok) { if (ok) relinkFromFolder(false); }); } }).catch(function () { });
	renderSync();

	/* ---------- ☁ Cloud: the project file in the person's own OneDrive / Dropbox / Google Drive (or a synced folder), the same
	   MESCloud button and sign-in as /excel, /docx, /pdf and Copy Text. Saves 3 s after changes, notices a newer version saved on
	   another computer. Only the small project file goes this way; the videos sync through the media folder above. */
	var vdoc = { name: "" }, cloudRev = -1, CKEY = "mes-video-editor:cloud";
	function cloudKeep() {
		var l = cloud && cloud.link(vdoc);
		try { if (!l) localStorage.removeItem(CKEY); else localStorage.setItem(CKEY, JSON.stringify({ p: l.p, ref: l.p === "file" ? null : l.ref, hid: l.hid || null, name: l.name, ver: l.ver, dir: l.dir })); } catch (e) { /* ignore */ }
	}
	function cloudUnlink() { if (vdoc.__mcl) { vdoc = { name: "" }; cloudRev = -1; cloudKeep(); if (cloud) cloud.refresh(); } }
	var cloud = window.MESCloud ? window.MESCloud.attach({
		app: "video", folder: "MES Apps/Video", what: "video project", defExt: "mesvideo", btnClass: "vd-btn", before: $("vd-projst"), replaces: true, toast: toast,
		exts: [".mesvideo"], accept: [{ description: "MES Video Editor project", accept: { "application/json": [".mesvideo"] } }],
		doc: function () { return vdoc; },
		name: function (d) { return d.name || projFileName(); },
		bytes: function () { return projBlob().arrayBuffer().then(function (b) { return new Uint8Array(b); }); },
		open: function (u8, name) {
			return openProjectText(new TextDecoder().decode(u8), name, null, 0, true).then(function (ok) { if (!ok) return null; vdoc = { name: name }; cloudRev = rev; setTimeout(function () { cloudKeep(); projState(); }, 0); return vdoc; });
		},
		dirty: function () { return cloudRev !== rev; },
		saved: function (d, name) { d.name = name; cloudRev = rev; if (proj.h) linkProject(null); cloudKeep(); projState(); var w = mediaWarnText(); if (w) toast("Saved." + w, 9000); },
		// under the tabs: where the videos themselves are (they never go into the project file)
		extra: function () {
			var k = VE.bin.filter(function (m) { return m.kind !== "text"; }).length; if (!k) return "";
			if (!mdir.h) return '<p><b>Your videos</b> stay in their own files. <button type="button" class="mcl-b" data-a="x" data-x="link">&#128193; Link the folder they are in</button></p><p class="mcl-note">Use a folder OneDrive syncs: on another computer, link the same folder and everything is found.</p>';
			var sm = mdir.idx ? V.mediaSyncSummary(VE.bin, mdir.idx) : null, miss = sm ? sm.out.length + sm.differs.length : 0;
			return '<p><b>Videos:</b> &#128193; ' + esc(mdir.h.name) + " · " + (!sm ? '<button type="button" class="mcl-b" data-a="x" data-x="allow">Allow access</button>' : miss ? "⚠ " + miss + " not in this folder " + '<button type="button" class="mcl-b mcl-b--p" data-a="x" data-x="copy">Copy them in</button>' : "✓ all " + sm.total + " found") + ' <button type="button" class="mcl-b mcl-b--g" data-a="x" data-x="link">Change</button></p>';
		},
		onExtra: function (a) {
			var done = function () { if (cloud) cloud.refresh(); };
			if (a === "link") linkFolder().then(done); else if (a === "copy") copyIntoFolder().then(done); else if (a === "allow") rescan(true).then(function (ok) { if (ok) return relinkFromFolder(false); }).then(done);
		}
	}) : null;
	// a cloud link survives a reload (the autosaved project here is the same one)
	(function () {
		var k = null; try { k = JSON.parse(localStorage.getItem(CKEY) || "null"); } catch (e) { /* ignore */ }
		if (!k || !cloud) return;
		function put(ref) { vdoc = { name: k.name, __mcl: { p: k.p, ref: ref, name: k.name, ver: k.ver, at: Date.now(), hid: k.hid || undefined, dir: k.dir } }; cloudRev = rev; cloud.refresh(); projState(); }
		if (k.p !== "file") return put(k.ref);
		if (!k.hid || !window.indexedDB) return;
		var q = indexedDB.open("mes-cloud", 1);
		q.onupgradeneeded = function () { q.result.createObjectStore("h"); };
		q.onsuccess = function () { try { var r = q.result.transaction("h").objectStore("h").get(k.hid); r.onsuccess = function () { if (r.result) { r.result.__mclId = k.hid; put(r.result); } }; } catch (e) { /* ignore */ } };
	})();

	/* ---------- inspector ---------- */
	var insp = $("vd-insp");
	// searchable font list, each name drawn in its own font (Google ones load when the list opens)
	function fontPicker(btn, cur, onPick) {
		var old = document.querySelector(".vd-fontpop"); if (old) { old.remove(); if (old.__btn === btn) { btn.setAttribute("aria-expanded", "false"); return; } }
		var pop = document.createElement("div"); pop.className = "vd-fontpop"; pop.__btn = btn;
		pop.innerHTML = '<input type="search" placeholder="Search fonts" aria-label="Search fonts" spellcheck="false" autocomplete="off"><div class="vd-fontlist" role="listbox" aria-label="Fonts"></div>';
		btn.parentNode.appendChild(pop); btn.setAttribute("aria-expanded", "true");
		VE.FONTS.forEach(function (f) { if (f[2]) VE.linkFont(f[1]); });
		var q = pop.querySelector("input"), list = pop.querySelector(".vd-fontlist"), act = -1;
		function items() { return Array.prototype.slice.call(list.querySelectorAll("button")); }
		function render() {
			var t = q.value.trim().toLowerCase(), h = "", grp = "";
			VE.FONTS.forEach(function (f, i) {
				if (t && (f[0] + " " + f[3]).toLowerCase().indexOf(t) < 0) return;
				if (f[3] !== grp) { grp = f[3]; h += "<h5>" + esc(grp) + "</h5>"; }
				h += '<button type="button" role="option" data-i="' + i + '" aria-selected="' + (f[1] === cur) + '" style="font-family:' + esc(f[1]) + '">' + esc(f[0]) + (f[2] ? '<span class="vd-fg">Google</span>' : "") + "</button>";
			});
			list.innerHTML = h || '<p class="vd-sub">No font matches.</p>'; act = -1;
		}
		function close() { pop.remove(); btn.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", outside, true); }
		function outside(e) { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); }
		function pick(i) { var f = VE.FONTS[i]; close(); if (f) onPick(f[1]); }
		list.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) pick(+b.getAttribute("data-i")); });
		q.addEventListener("input", render);
		pop.addEventListener("keydown", function (e) {
			e.stopPropagation(); var L = items();
			if (e.key === "Escape") { e.preventDefault(); close(); btn.focus(); }
			else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!L.length) return; act = (act + (e.key === "ArrowDown" ? 1 : -1) + L.length) % L.length; L.forEach(function (b, k) { b.classList.toggle("is-act", k === act); }); L[act].scrollIntoView({ block: "nearest" }); }
			else if (e.key === "Enter") { e.preventDefault(); var b = L[act >= 0 ? act : 0]; if (b) pick(+b.getAttribute("data-i")); }
		});
		document.addEventListener("pointerdown", outside, true);
		render(); q.focus();
		var sel = list.querySelector('[aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: "center" });
	}
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
			h += '<div class="vd-sec"><b>Text</b><p class="vd-sub">Or double-click the title in the preview and type there. Drag the white side handles to change where lines wrap.</p><textarea id="vd-ttext" rows="3" aria-label="Title text">' + esc(T.s) + "</textarea>";
			var fInfo = VE.fontInfo(T.font);
			h += '<div class="vd-grid"><div class="vd-f vd-fontpick"><span>Font</span><button type="button" class="vd-btn vd-fontbtn" id="vd-t-fontbtn" aria-haspopup="listbox" aria-expanded="false" style="font-family:' + esc(T.font) + '"><span>' + esc(fInfo[0]) + '</span><span aria-hidden="true">&#9662;</span></button></div>' +
				num("vd-t-size", "Size", Math.round(T.size * 1000) / 10, 0.5, 1, 60, "%", "Height of the letters as a share of the picture height") + '<label class="vd-f"><span>Colour</span><input type="color" id="vd-t-color" value="' + esc(T.color) + '"></label>' +
				'<label class="vd-f"><span>Align</span><select id="vd-t-align">' + ["left", "center", "right"].map(function (a) { return '<option' + (T.align === a ? " selected" : "") + ">" + a + "</option>"; }).join("") + "</select></label>" +
				num("vd-t-ls", "Letter spacing", Math.round((T.ls || 0) * 1000) / 10, 1, -20, 100, "%", "Space between letters, as a share of the text size (0 = the font's own)") +
				num("vd-t-lh", "Line spacing", Math.round((T.lh || 1.22) * 100), 5, 60, 400, "%", "Distance from one line to the next, as a share of the text size (122% is normal)") +
				num("vd-t-wrap", "Box width", T.wrap > 0 ? Math.round(T.wrap * 1000) / 10 : "", 1, 5, 400, "%", "Lines wrap at this width (a share of the picture width). Empty = only your own line breaks.") +
				'<label class="vd-f vd-fck"><span>Wrap lines</span><input type="checkbox" id="vd-t-wrapon"' + (T.wrap > 0 ? " checked" : "") + '></label></div>';
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
		setNum("vd-i-start", function (v) { var s = Math.max(0, v); if (V.canPlace(VE.P, c.track, s, V.dur(c), (function () { var o = {}; o[c.id] = 1; return o; })())) c.start = s; else toast("There is no room there on this layer."); }, "Move");
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
			setNum("vd-t-size", function (v) { T.size = V.clamp(v / 100, 0.01, 0.6); }, "Text size");
			on("vd-t-fontbtn", "click", function () { fontPicker(this, T.font, function (stack) { T.font = stack; VE.ensureFont(T).then(function () { VE.preview.draw(); }); VE.commit("Font"); }); });
			setNum("vd-t-ls", function (v) { T.ls = V.clamp(v / 100, -0.2, 1); }, "Letter spacing"); setNum("vd-t-lh", function (v) { T.lh = V.clamp(v / 100, 0.6, 4); }, "Line spacing");
			on("vd-t-wrap", "change", function () { var v = parseFloat(this.value); T.wrap = isFinite(v) && v > 0 ? V.clamp(v / 100, 0.05, 4) : 0; VE.commit("Title box width"); });
			on("vd-t-wrapon", "change", function () { if (this.checked) T.wrap = T.lastWrap || 0.8; else { T.lastWrap = T.wrap; T.wrap = 0; } VE.commit(this.checked ? "Wrap lines" : "No line wrap"); });
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
	var fontT = 0; VE.on("change", function () { clearTimeout(fontT); fontT = setTimeout(function () { VE.ensureFonts().then(function () { VE.preview.draw(); }); }, 200); });
	VE.on("editText", function (c) { VE.sel = [c.id]; renderInsp(); var ta = $("vd-ttext"); if (ta) { ta.focus(); ta.select(); } });
	function updateButtons() {
		$("vd-undo").disabled = $("vd-undo2").disabled = !VE.hist.canUndo(); $("vd-redo").disabled = $("vd-redo2").disabled = !VE.hist.canRedo();
		var ul = VE.hist.undoLabel(), rl = VE.hist.redoLabel();
		["vd-undo", "vd-undo2"].forEach(function (id) { $(id).title = (ul ? "Undo " + ul.toLowerCase() : "Undo") + " (Ctrl+Z)"; });
		["vd-redo", "vd-redo2"].forEach(function (id) { $(id).title = (rl ? "Redo " + rl.toLowerCase() : "Redo") + " (Ctrl+Shift+Z)"; });
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
	// one clip: the fully cleaned sound is kept (c.clean.full) so a new strength later is instant; the sound the export plays =
	// cleaned + a little of the original mixed back (V.dnBlend: 100% = none, 50% = the noise 20 dB down, 0% = the original)
	async function cleanClip(c, strength, D, stEl, onFrac) {
		var m = VE.media(c.media); if (!m) return false;
		var a = c.clean && c.clean.full ? c.clean.a : Math.max(0, c.in - (c.xin || 0) * (c.speed || 1) - 0.25), b = c.clean && c.clean.full ? c.clean.b : Math.min(m.dur, c.out + 0.25);
		if (c.clean && c.clean.full && (a > c.in - (c.xin || 0) * (c.speed || 1) + 0.01 || b < c.out - 0.01)) { a = Math.max(0, c.in - (c.xin || 0) * (c.speed || 1) - 0.25); b = Math.min(m.dur, c.out + 0.25); }
		var wetKey = c.clean && c.clean.full && c.clean.a === a && c.clean.b === b ? c.clean.full : null, wet = wetKey ? await VE.cleanPcm(wetKey) : null, dry = null;
		if (!wet || strength < 0.995) { stEl("reading the sound..."); dry = await VE.pcmRange(m, a, b, function (x) { stEl("reading the sound... " + Math.round(x * 100) + "%"); }); }
		if (!wet) {
			stEl("removing noise...");
			var out = await D.process(dry, 48000, { model: UI.dnModel || "auto", strength: 1, onProgress: function (x) { var fx = x && x.progress != null ? x.progress : x; if (onFrac) onFrac(fx); stEl("removing noise... " + Math.round(fx * 100) + "%"); } });
			if (!out || !out.length) throw new Error("the noise remover returned no sound");
			wetKey = V.uid("k"); await VE.idbPut("blobs", "c:" + wetKey, { a: a, rate: 48000, ch: out.map(function (x) { return x.buffer.byteLength === x.length * 4 ? x.buffer : x.slice().buffer; }) });
			VE.cleanCache[wetKey] = wet = { start: a, rate: 48000, ch: out };
		}
		var key = wetKey;
		if (strength < 0.995) {
			var mixed = wet.ch.map(function (w, k) { return V.dnBlend(w, dry[k] || dry[0], strength); });
			key = V.uid("k"); await VE.idbPut("blobs", "c:" + key, { a: a, rate: 48000, ch: mixed.map(function (x) { return x.buffer; }) });
			VE.cleanCache[key] = { start: a, rate: 48000, ch: mixed };
		}
		c.clean = { key: key, full: wetKey, a: a, b: b, model: (D.lastModel || UI.dnModel || "auto"), strength: strength };
		return true;
	}
	async function denoise(list) {
		if (cleaning) return; var stEl = function (t) { var e = $("vd-dn-st"); if (e) e.textContent = t; };
		var D = await loadDenoise();
		if (!D || typeof D.process !== "function") { stEl("Noise removal could not load. Check your connection and try again."); return; }
		cleaning = true; var strength = UI.dnStr == null ? 1 : UI.dnStr, done = 0; var tp = tabTask("Removing noise" + (list.length > 1 ? " from " + list.length + " clips" : ""));
		try {
			if (D.load) { stEl("Loading the noise-removal model..."); await D.load({ model: UI.dnModel || "auto", onProgress: function (x) { stEl("Loading the noise-removal model... " + Math.round((x && x.progress != null ? x.progress : x) * 100) + "%"); } }); }
			for (var j = 0; j < list.length; j++) {
				var tag = list.length > 1 ? "Clip " + (j + 1) + " of " + list.length + ": " : "";
				if (await cleanClip(list[j], strength, D, function (t) { stEl(tag + t); }, function (fx) { tp.set((j + fx) / list.length); })) done++;
			}
			tp.done(); VE.commit("Remove noise"); toast("Noise removed from " + done + " clip" + (done > 1 ? "s" : "") + ". Press Play to hear it, or Compare before / after to hear exactly what was taken out.");
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
	// level scale, plus "What was taken out" when noise is removed. Play keeps going when you switch Before / After / Taken out (B / N), so you
	// hear the exact same moment each way. The Noise removal slider tries another strength on this part only (instant: the fully cleaned sound
	// is mixed with the original), and "Apply to the whole clip" makes it the clip's sound.
	VE.compareSound = function (c) {
		var m = VE.media(c.media); if (!m || !VE.hasSound(c)) { toast("This clip has no sound to compare."); return; }
		var RATE = 48000, cl = { len: UI.cmpLen || 10, t0: 0, mode: "b", match: !!UI.cmpMatch, loop: UI.cmpLoop !== false, pos: 0, data: null, tok: 0, str: c.clean ? c.clean.strength : 0, wetTok: 0 };
		var ac = null, srcs = [], gB = null, gA = null, gR = null, playAt = 0, playFrom = 0, raf = 0, help = false;
		function cs() { return c.start; } function ce() { return V.end(c); }
		function place(t) { var L = Math.min(cl.len, ce() - cs()); cl.t0 = Math.max(cs(), Math.min(ce() - L, t)); cl.t1 = cl.t0 + L; }
		function curStr() { return c.clean ? c.clean.strength : 0; }
		place(VE.t - cl.len / 2);
		dialog('<h3>Compare the sound: before and after</h3>' +
			'<div class="vd-cmp-bar"><button type="button" class="vd-btn vd-primary" id="vd-cmp-play" title="Play / pause (Space)">&#9654; Play</button>' +
			'<span class="vd-cmp-ab" role="radiogroup" aria-label="Listen to"><button type="button" class="vd-btn" data-ab="b" role="radio" title="The clip\'s own sound, untouched">Before (original)</button><button type="button" class="vd-btn" data-ab="a" role="radio" title="What the exported video plays">After (edited)</button><button type="button" class="vd-btn vd-cmp-rbtn" data-ab="r" role="radio" title="Only what the noise removal took out (N)">Taken out</button></span>' +
			'<span class="vd-sub">B / N switch without stopping</span><span class="vd-sp"></span>' +
			'<label class="vd-cmp-ck"><input type="checkbox" id="vd-cmp-match"' + (cl.match ? " checked" : "") + '> Match levels</label><button type="button" class="vd-q" id="vd-cmp-q" aria-expanded="false" title="What do these do?">?</button><label class="vd-cmp-ck"><input type="checkbox" id="vd-cmp-loop"' + (cl.loop ? " checked" : "") + '> Loop</label>' +
			'<label class="vd-cmp-ck">Show <select id="vd-cmp-len">' + [5, 10, 30, 60].map(function (x) { return '<option value="' + x + '"' + (x === cl.len ? " selected" : "") + ">" + x + " s</option>"; }).join("") + '</select></label>' +
			'<button type="button" class="vd-btn vd-sm" id="vd-cmp-prev" title="Earlier part of the clip">&#8249; Earlier</button><button type="button" class="vd-btn vd-sm" id="vd-cmp-next" title="Later part of the clip">Later &#8250;</button></div>' +
			'<div class="vd-cmp-help" id="vd-cmp-help" hidden><p><b>Match levels</b> turns the <i>After</i> sound up or down so its average loudness equals the original\'s, both in what you hear and in the waveform. Use it to judge only the noise clean-up, without the volume change fooling your ears (louder usually sounds &ldquo;better&rdquo;). It also raises <i>Taken out</i> to the same level so you can hear it clearly. It never changes your video: unticked, you hear exactly what the export will play.</p><p><b>Taken out</b> plays only what the noise removal removed. Hiss, hum and room noise there is good. If you hear words in it, the removal is too strong: lower the strength until the words are gone.</p></div>' +
			'<div class="vd-cmp-dn" id="vd-cmp-dn"><label for="vd-cmp-str"><b>Noise removal</b></label><input type="range" id="vd-cmp-str" min="0" max="100" step="1" value="' + Math.round(cl.str * 100) + '" aria-describedby="vd-cmp-dnst"><output id="vd-cmp-strout">' + Math.round(cl.str * 100) + '%</output>' +
			'<button type="button" class="vd-btn vd-sm" id="vd-cmp-strdn" title="1% less removal" aria-label="1% less removal">&minus;</button><button type="button" class="vd-btn vd-sm" id="vd-cmp-strup" title="1% more removal" aria-label="1% more removal">+</button>' +
			'<button type="button" class="vd-btn vd-sm vd-primary" id="vd-cmp-apply" disabled>Apply to the whole clip</button><button type="button" class="vd-btn vd-sm" id="vd-cmp-reset" disabled title="Back to the clip\'s current strength">Reset</button>' +
			'<span class="vd-sub" id="vd-cmp-dnst" aria-live="polite"></span></div>' +
			'<div class="vd-cmp-rows" id="vd-cmp-rows"><p class="vd-sub">Reading the sound...</p></div>' +
			'<p class="vd-sub" id="vd-cmp-note">Click or drag on a waveform to move. All waveforms use the same scale (' + (VE.tl.wave === "db" ? "dB" : "linear") + '), so a quieter background shows as a thinner band between the words. The slider tries a strength on this part only; nothing changes until you press Apply.</p>' +
			'<div class="vd-dlgact"><button type="button" class="vd-btn" id="vd-cmp-close">Close</button></div>');
		$("vd-dlg").classList.add("vd-dlg--cmp");
		dlgClose = function () { stop(); cl.tok++; cl.wetTok++; if (ac) { try { ac.close(); } catch (e) { /* ignore */ } ac = null; } UI.cmpLen = cl.len; UI.cmpMatch = cl.match; UI.cmpLoop = cl.loop; saveUI(); };
		function abBtns() { $("vd-dlg").querySelectorAll("[data-ab]").forEach(function (b) { var on = b.getAttribute("data-ab") === cl.mode; b.classList.toggle("vd-primary", on); b.setAttribute("aria-checked", on ? "true" : "false"); }); var rb = $("vd-dlg").querySelector('[data-ab="r"]'); if (rb) rb.disabled = !(cl.data && cl.data.removed); }
		abBtns();
		function dnSt(t) { var e = $("vd-cmp-dnst"); if (e) e.textContent = t; }
		function stats(ch) {
			var n = ch[0].length, blk = Math.round(RATE * 0.05), rms = [], pk = 0, e = 0;
			for (var i = 0; i < n; i += blk) { var be = 0, cnt = 0; for (var k = 0; k < ch.length; k++) { var x = ch[k]; for (var j = i, je = Math.min(n, i + blk); j < je; j++) { var v = x[j]; be += v * v; cnt++; if (v > pk) pk = v; else if (-v > pk) pk = -v; } } e += be; if (cnt) rms.push(be / cnt); }
			var sorted = rms.slice().sort(function (a, b) { return a - b; }), fl = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
			return { peak: V.db(pk), rms: V.db(Math.sqrt(e / Math.max(1, n * ch.length))), floor: V.db(Math.sqrt(fl)) };
		}
		function f1(d) { return isFinite(d) ? d.toFixed(1) + " dB" : "silent"; }
		function slice48(cp, sa, n, nch) { var out = []; for (var k = 0; k < nch; k++) out.push(new Float32Array(n)); V.mixInto(out, 0, n, cp, sa, 1 / RATE, null); return out; }
		async function load() {
			var tok = ++cl.tok; cl.wetTok++; stop(); $("vd-cmp-rows").innerHTML = '<p class="vd-sub">Reading the sound...</p>';
			try {
				var sp = c.speed || 1, sa = V.srcAt(c, cl.t0), sb = V.srcAt(c, cl.t1), n = Math.max(1, Math.round((sb - sa) * RATE));
				var orig = await VE.pcmRange(m, Math.max(0, sa), sb); if (tok !== cl.tok) return;
				var nch = orig.length, cleaned = null, wet = null;
				if (c.clean && c.clean.key) { var cp = await VE.cleanPcm(c.clean.key); if (cp) cleaned = slice48(cp, sa, n, nch); }
				if (c.clean && c.clean.full) { var wp = c.clean.full === c.clean.key ? null : await VE.cleanPcm(c.clean.full); wet = wp ? slice48(wp, sa, n, nch) : c.clean.strength >= 0.995 ? cleaned : null; }
				else if (c.clean && c.clean.strength >= 0.995) wet = cleaned;
				if (tok !== cl.tok) return;
				var gains = new Float32Array(Math.ceil(n / 480));
				for (var i = 0; i < gains.length; i++) { var t = cl.t0 + (i * 480 + 240) / RATE / sp; gains[i] = V.gainAt(VE.P, c, t) * VE.fxGainAt(c, t); }
				cl.data = { n: n, sp: sp, sa: sa, sb: sb, nch: nch, orig: orig, cleaned: cleaned, wet: wet, gains: gains };
				cl.pos = Math.max(0, Math.min(n / RATE / sp, VE.t - cl.t0));
				derive(); build(); dnButtons();
				if (cl.str > 0 && !needsOnlyStored() && !wet) makeWet();
			} catch (e) { if (tok === cl.tok) $("vd-cmp-rows").innerHTML = '<p class="vd-sub">Could not read the sound: ' + esc(e && e.message || String(e)) + "</p>"; }
		}
		// the slider is still at the clip's own strength: show exactly the stored sound (what the export plays)
		function needsOnlyStored() { return c.clean && Math.abs(cl.str - c.clean.strength) < 0.0051 && cl.data && cl.data.cleaned; }
		// the fully cleaned sound of this part (strength 100%), for trying strengths; 2 s of sound before it so the model has settled
		async function makeWet() {
			var D0 = cl.data; if (!D0 || D0.wet || D0.making) return;
			var wt = ++cl.wetTok; D0.making = true; dnSt("Loading the noise-removal model...");
			try {
				var D = await loadDenoise(); if (!D || typeof D.process !== "function") throw new Error("noise removal could not load");
				if (D.load) await D.load({ model: UI.dnModel || "auto", onProgress: function (x) { if (wt === cl.wetTok) dnSt("Loading the noise-removal model... " + Math.round((x && x.progress != null ? x.progress : x) * 100) + "%"); } });
				if (wt !== cl.wetTok) return;
				var pad = Math.min(2, D0.sa), dry = await VE.pcmRange(m, D0.sa - pad, D0.sb); if (wt !== cl.wetTok) return;
				dnSt("Removing noise from this part...");
				var out = await D.process(dry, RATE, { model: UI.dnModel || "auto", strength: 1 }); if (wt !== cl.wetTok) return;
				var off = Math.round(pad * RATE), w = [];
				for (var k = 0; k < D0.nch; k++) { var src = out[k] || out[0], a = new Float32Array(D0.n); a.set(src.subarray(off, Math.min(src.length, off + D0.n))); w.push(a); }
				D0.wet = w; D0.making = false; dnButtons(); derive(); build(); restart();
			} catch (e) { if (wt === cl.wetTok) dnSt("Could not remove noise: " + (e && e.message || e)); }
			D0.making = false;
		}
		// Before / After / Taken out from the original, the cleaned sound and the slider
		function derive() {
			var D = cl.data, n = D.n, nch = D.nch, base = D.orig, s = cl.str;
			if (needsOnlyStored()) base = D.cleaned;
			else if (s > 0 && D.wet) base = D.wet.map(function (w, k) { return V.dnBlend(w, D.orig[k] || D.orig[0], s); });
			else if (s > 0 && D.cleaned && !c.clean) base = D.cleaned;
			var after = [];
			for (var k = 0; k < nch; k++) { var src = base[k] || base[0], dst = new Float32Array(n); for (var i = 0; i < n; i++) dst[i] = src[i] * D.gains[i / 480 | 0]; after.push(dst); }
			var removed = null;
			if (base !== D.orig) { removed = []; for (var k4 = 0; k4 < nch; k4++) { var r = new Float32Array(n), o = D.orig[k4], cc = base[k4] || base[0]; for (var j2 = 0; j2 < n; j2++) r[j2] = o[j2] - cc[j2]; removed.push(r); } }
			D.after = after; D.removed = removed; D.sB = stats(D.orig); D.sA = stats(after); D.sR = removed ? stats(removed) : null;
			var lv = function (x) { return isFinite(D.sB.rms) && isFinite(x) ? V.fromDb(Math.max(-30, Math.min(30, D.sB.rms - x))) : 1; };
			D.match = lv(D.sA.rms); D.matchR = D.sR ? lv(D.sR.rms) : 1;
			bufs = null; if (!removed && cl.mode === "r") cl.mode = "a"; abBtns();
		}
		function row(id, label, info) { return '<div class="vd-cmp-row"><div class="vd-cmp-lab"><b>' + label + '</b><span>' + info + '</span></div><div class="vd-cmp-cv"><canvas id="' + id + '"></canvas><i class="vd-cmp-ph"></i></div></div>'; }
		function build() {
			var D = cl.data; if (!D) return; var eg = D.match !== 1 && cl.match ? " (shown " + (V.db(D.match) > 0 ? "+" : "") + V.db(D.match).toFixed(1) + " dB to match)" : "";
			var trial = Math.abs(cl.str - curStr()) > 0.0051;
			var h = '<div class="vd-cmp-time" id="vd-cmp-time"></div>' +
				row("vd-cmp-b", "Before: the original", "Peak " + f1(D.sB.peak) + " · average " + f1(D.sB.rms) + " · background " + f1(D.sB.floor)) +
				row("vd-cmp-a", trial ? "After: with " + Math.round(cl.str * 100) + "% removal (not applied yet)" : "After: what the export plays", "Peak " + f1(D.sA.peak) + " · average " + f1(D.sA.rms) + " · background " + f1(D.sA.floor) + eg);
			if (D.removed) h += row("vd-cmp-r", "What was taken out", "Average " + f1(D.sR.rms) + (cl.match && D.matchR !== 1 ? " (shown and played " + (V.db(D.matchR) > 0 ? "+" : "") + V.db(D.matchR).toFixed(1) + " dB louder)" : "") + ". Mostly noise is good; words here mean the clean-up is too strong.");
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
			if (!cv) return;
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
			var D = cl.data; if (!D || !D.after) return;
			paint($("vd-cmp-b"), D.orig, "rgba(147,197,253,0.6)", "#bfdbfe", 1);
			paint($("vd-cmp-a"), D.after, "rgba(110,231,183,0.62)", "#a7f3d0", cl.match ? D.match : 1);
			if (D.removed) paint($("vd-cmp-r"), D.removed, "rgba(251,191,36,0.55)", "#fde68a", cl.match ? D.matchR : 1);
		}
		function dur() { var D = cl.data; return D ? D.n / RATE / D.sp : 0; }
		function marker() {
			var D = cl.data; if (!D) return; var p = dur() ? cl.pos / dur() * 100 : 0;
			$("vd-cmp-rows").querySelectorAll(".vd-cmp-ph").forEach(function (el) { el.style.left = p + "%"; });
			var tm = $("vd-cmp-time"); if (tm) tm.textContent = V.tc(cl.t0 + cl.pos, VE.P.fps) + "   (" + V.tc(cl.t0, VE.P.fps) + " to " + V.tc(cl.t1, VE.P.fps) + ")";
		}
		var bufs = null;
		function mkBuf(ch, gain) { var b = ac.createBuffer(Math.max(1, ch.length), ch[0].length, RATE); for (var k = 0; k < ch.length; k++) { var d = b.getChannelData(k), s = ch[k]; if (gain === 1) d.set(s); else for (var j = 0; j < s.length; j++) d[j] = s[j] * gain; } return b; }
		function lvl(md) { return cl.mode === md ? 1 : 0; }
		function play() {
			var D = cl.data; if (!D || !D.after) return;
			if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { toast("This browser cannot play sound here."); return; } }
			if (ac.state === "suspended") ac.resume();
			if (!bufs || bufs.match !== cl.match) bufs = { b: mkBuf(D.orig, 1), a: mkBuf(D.after, cl.match ? D.match : 1), r: D.removed ? mkBuf(D.removed, cl.match ? D.matchR : 1) : null, match: cl.match };
			stop(true); if (cl.pos >= dur() - 0.02) cl.pos = 0;
			gB = ac.createGain(); gA = ac.createGain(); gR = ac.createGain(); gB.gain.value = lvl("b"); gA.gain.value = lvl("a"); gR.gain.value = lvl("r");
			[gB, gA, gR].forEach(function (g) { g.connect(ac.destination); });
			var when = ac.currentTime + 0.03, off = cl.pos * D.sp;
			[[bufs.b, gB], [bufs.a, gA], [bufs.r, gR]].forEach(function (q) { if (!q[0]) return; var s = ac.createBufferSource(); s.buffer = q[0]; s.playbackRate.value = D.sp; s.connect(q[1]); s.start(when, off); srcs.push(s); });
			srcs[0].onended = function () { if (!srcs.length) return; if (cl.loop) { cl.pos = 0; play(); } else { stop(); cl.pos = dur(); marker(); } };
			playAt = when; playFrom = cl.pos; $("vd-cmp-play").innerHTML = "&#10074;&#10074; Pause";
			cancelAnimationFrame(raf); (function tick() { if (!srcs.length) return; cl.pos = Math.max(0, Math.min(dur(), playFrom + (ac.currentTime - playAt))); marker(); raf = requestAnimationFrame(tick); })();
		}
		function stop(keep) {
			cancelAnimationFrame(raf); var list = srcs; srcs = [];
			list.forEach(function (s) { s.onended = null; try { s.stop(); } catch (e) { /* ignore */ } });
			if (!keep) { var b = $("vd-cmp-play"); if (b) b.innerHTML = "&#9654; Play"; }
		}
		function restart() { if (srcs.length) play(); }
		function seekTo(t) { cl.pos = t; marker(); if (srcs.length) play(); }
		function setMode(md) {
			if (md === "r" && !(cl.data && cl.data.removed)) return;
			cl.mode = md; abBtns(); if (gB && ac) { var now = ac.currentTime; gB.gain.setTargetAtTime(lvl("b"), now, 0.01); gA.gain.setTargetAtTime(lvl("a"), now, 0.01); gR.gain.setTargetAtTime(lvl("r"), now, 0.01); }
		}
		// strength slider: tries a strength on this part right away; Apply makes it the whole clip's sound
		var strT = 0;
		function dnButtons() {
			var trial = Math.abs(cl.str - curStr()) > 0.0051, ap = $("vd-cmp-apply");
			$("vd-cmp-strout").textContent = Math.round(cl.str * 100) + "%"; $("vd-cmp-str").value = Math.round(cl.str * 100);
			ap.disabled = !trial || applying; $("vd-cmp-reset").disabled = !trial || applying;
			ap.textContent = cl.str <= 0 && c.clean ? "Use the original sound for the whole clip" : "Apply " + Math.round(cl.str * 100) + "% to the whole clip";
			if (!applying && !(cl.data && cl.data.making)) dnSt(!c.clean && cl.str <= 0 ? "No noise removal on this clip yet: move the slider to try it on this part." : trial ? "Trying " + Math.round(cl.str * 100) + "% on this part (the clip has " + Math.round(curStr() * 100) + "%)." : "The clip has " + Math.round(curStr() * 100) + "% noise removal.");
		}
		function setStr(v) {
			cl.str = V.clamp(Math.round(v) / 100, 0, 1); dnButtons();
			clearTimeout(strT); strT = setTimeout(function () {
				var D = cl.data; if (!D) return;
				if (cl.str > 0 && !D.wet && !needsOnlyStored()) { makeWet(); return; }
				derive(); build(); restart();
			}, 60);
		}
		var applying = false;
		async function applyStr() {
			if (applying) return; applying = true; dnButtons(); var s = cl.str, tp = tabTask("Removing noise");
			try {
				if (s <= 0) { c.clean = null; VE.commit("Use the original sound"); toast("This clip plays its original sound again."); }
				else {
					var D = await loadDenoise(); if (!D || typeof D.process !== "function") throw new Error("noise removal could not load");
					if (D.load) await D.load({ model: UI.dnModel || "auto", onProgress: function (x) { dnSt("Loading the noise-removal model... " + Math.round((x && x.progress != null ? x.progress : x) * 100) + "%"); } });
					await cleanClip(c, s, D, function (t) { dnSt("Whole clip: " + t); }, function (fx) { tp.set(fx); });
					tp.done(); VE.commit("Noise removal " + Math.round(s * 100) + "%"); toast(Math.round(s * 100) + "% noise removal applied to the whole clip.");
				}
				applying = false; var keepPos = cl.pos; await load(); cl.pos = keepPos; marker();
			} catch (e) { tp.fail("Failed"); dnSt("Could not apply: " + (e && e.message || e)); applying = false; dnButtons(); }
		}
		$("vd-cmp-str").addEventListener("input", function () { setStr(+this.value); });
		$("vd-cmp-strdn").onclick = function () { setStr(Math.round(cl.str * 100) - 1); };
		$("vd-cmp-strup").onclick = function () { setStr(Math.round(cl.str * 100) + 1); };
		$("vd-cmp-reset").onclick = function () { setStr(Math.round(curStr() * 100)); };
		$("vd-cmp-apply").onclick = applyStr;
		$("vd-cmp-q").onclick = function () { help = !help; $("vd-cmp-help").hidden = !help; this.setAttribute("aria-expanded", help ? "true" : "false"); };
		$("vd-cmp-play").onclick = function () { if (srcs.length) stop(); else play(); };
		$("vd-dlg").querySelectorAll("[data-ab]").forEach(function (b) { b.onclick = function () { setMode(b.getAttribute("data-ab")); }; });
		$("vd-cmp-match").onchange = function () { cl.match = this.checked; if (cl.data) { bufs = null; build(); restart(); } };
		$("vd-cmp-loop").onchange = function () { cl.loop = this.checked; };
		$("vd-cmp-len").onchange = function () { cl.len = +this.value; place(cl.t0 + cl.pos - cl.len / 2); load(); };
		$("vd-cmp-prev").onclick = function () { place(cl.t0 - (cl.t1 - cl.t0)); load(); };
		$("vd-cmp-next").onclick = function () { place(cl.t1); load(); };
		$("vd-cmp-close").onclick = closeDialog;
		$("vd-dlg").addEventListener("keydown", function (e) {
			if (e.target.tagName === "SELECT" || (e.target.tagName === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox")) return;
			if (e.key === " ") { e.preventDefault(); e.stopPropagation(); $("vd-cmp-play").click(); }
			else if (e.key === "b" || e.key === "B") { e.preventDefault(); e.stopPropagation(); setMode(cl.mode === "b" ? "a" : "b"); }
			else if (e.key === "n" || e.key === "N") { e.preventDefault(); e.stopPropagation(); setMode(cl.mode === "r" ? "a" : "r"); }
		});
		var ro = window.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null; if (ro) ro.observe($("vd-cmp-rows"));
		var prevClose = dlgClose; dlgClose = function () { if (ro) ro.disconnect(); prevClose(); };
		dnButtons(); load();
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

	/* ---------- arrow keys after clicking the preview: move the selected picture / title (1 video pixel, Shift = 10) ---------- */
	VE.kbFocus = "tl";
	// a click on the preview or the timeline takes the keyboard away from a text box (else Ctrl+Z / arrows went to that box)
	document.addEventListener("pointerdown", function (e) {
		if (!app.contains(e.target)) return; var pv = !!e.target.closest("#vd-canvas"); VE.kbFocus = pv ? "pv" : "tl";
		var ae = document.activeElement; if ((pv || e.target.closest("#vd-tlscroll")) && ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae !== e.target) ae.blur();
	}, true);
	var nudgeT = 0;
	VE.flushPending = function () { if (nudgeT) { clearTimeout(nudgeT); nudgeT = 0; VE.commit("Nudge"); } };
	function nudgeTargets() { return VE.selected().filter(function (c) { var tr = V.track(VE.P, c.track); return c.type !== "audio" && !(tr && tr.lock) && V.active(c, VE.t); }); }
	VE.nudge = function (dx, dy) {
		var list = nudgeTargets(); if (!list.length) return false;
		var tol = 0.5 / VE.P.fps, blocked = false;
		list.forEach(function (c) {
			var rel = VE.t - c.start; if (c.anims && V.animRunning && V.animRunning(c, rel, tol)) { blocked = true; return; }
			var pos = V.posAt(c, VE.t);
			if (dx) V.setPropAt(c, rel, "x", Math.round((pos.x + dx / VE.P.w) * 10000) / 10000, tol);
			if (dy) V.setPropAt(c, rel, "y", Math.round((pos.y + dy / VE.P.h) * 10000) / 10000, tol);
		});
		if (blocked) toast("The playhead is inside an animation: move it to the animation's start or end to move the clip there.");
		VE.emit("live"); VE.preview.draw();
		clearTimeout(nudgeT); nudgeT = setTimeout(function () { nudgeT = 0; VE.commit("Nudge"); }, 450);   // one undo step for a burst of presses
		return true;
	};

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
		if (mod && !e.shiftKey && !e.altKey && /^[cx]$/i.test(k) && !String(window.getSelection && window.getSelection() || "")) { if (VE.selected().length) { e.preventDefault(); if (/x/i.test(k)) VE.cut(); else VE.copy(); } return; }
		if (e.altKey && !mod && (k === "ArrowUp" || k === "ArrowDown")) { e.preventDefault(); VE.moveRow(k === "ArrowUp" ? -1 : 1); return; }
		if (mod && e.shiftKey && (k === "a" || k === "A")) { e.preventDefault(); VE.separate(VE.selected()); return; }
		if (mod && (k === "a" || k === "A")) { e.preventDefault(); VE.sel = VE.P.clips.map(function (c) { return c.id; }); VE.emit("select"); return; }
		if ((mod || e.ctrlKey) && e.altKey && (k === "ArrowLeft" || k === "ArrowRight")) { e.preventDefault(); VE.goEdit(k === "ArrowRight" ? 1 : -1); return; }
		if (mod && (k === "g" || k === "G")) { e.preventDefault(); tin.focus(); return; }
		if (mod && (k === "Home" || k === "End")) { e.preventDefault(); P.seek(k === "Home" ? 0 : V.duration(VE.P)); VE.tl.reveal(VE.t); return; }
		if (mod || e.altKey) return;
		if (VE.kbFocus === "pv" && /^Arrow(Left|Right|Up|Down)$/.test(k)) {
			var st = e.shiftKey ? 10 : 1;
			if (VE.nudge(k === "ArrowLeft" ? -st : k === "ArrowRight" ? st : 0, k === "ArrowUp" ? -st : k === "ArrowDown" ? st : 0)) { e.preventDefault(); return; }
		}
		var h = true;
		switch (k) {
			case " ": if (e.repeat) break; if (P.hover && !P.playing) P.spaceDown(); else P.toggle(); break;   // over the preview: hold Space and drag to move the view
			case "g": case "G": $("vd-vzguide").click(); break;
			case "h": case "H": P.setHand(!P.hand); break;
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
			case "n": case "N": openNarrate(); break;
			case "b": case "B": VE.cycleBar(); break;
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
		vids.forEach(function (c) { var a = V.separateAudio(VE.P, c.id, V.uid("c"), V.uid("L"), function (vc) { return VE.addTrack("a", V.track(VE.P, vc.track), "below"); }); if (a) made.push(a.id); });
		VE.sel = made; VE.commit("Separate video and audio");
		toast("The sound is now its own clip on the layer below, linked to the video: moving, trimming, splitting or deleting one does the other too (Alt + drag moves just one). Drag the bottom edge of the track to make the waveform taller.", 9000);
	};
	$("vd-sep").onclick = function () { VE.separate(VE.selected()); };
	VE.linkBack = function (pair) {
		if (!V.linkPair(VE.P, pair, V.uid("L"))) return;
		VE.sel = [pair.v.id, pair.a.id]; VE.commit("Link video and sound");
		toast("Linked again: the sound follows the video (same start and trim), and moving, trimming, splitting or deleting one does the other too.", 7000);
	};
	function linkSection(c) {
		var h = "", parts = V.partners(VE.P, c);
		if (c.link && parts.length) {
			var o = parts[0], ot = V.track(VE.P, o.track);
			h += '<div class="vd-linkrow">&#128279; Linked to its ' + (o.type === "audio" ? "sound" : "video") + " on " + esc(ot ? ot.name : "another track") + '. Moving, trimming, splitting and deleting one does the other too (Alt + drag moves just this one).<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="unlink">Unlink</button>' +
				(c.type === "video" || o.type === "video" ? '<button type="button" class="vd-btn vd-sm" data-lk="join">Put the sound back into the video</button>' : "") + "</div></div>";
		} else if (c.type === "video" && c.noAudio) {
			h += '<div class="vd-linkrow">This clip plays no sound (it was separated).<div class="vd-row">' + (V.linkCandidate(VE.P, [c]) ? '<button type="button" class="vd-btn vd-sm" data-lk="relink">&#128279; Link to its sound again</button>' : "") + '<button type="button" class="vd-btn vd-sm" data-lk="sndon">Play its own sound again</button></div></div>';
		} else if (c.type === "video" && VE.hasSound(c)) {
			h += '<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="sep" title="Ctrl+Shift+A">Separate video and audio</button></div>';
		} else if (c.type === "audio" && !c.link && V.linkCandidate(VE.P, [c])) {
			h += '<div class="vd-row"><button type="button" class="vd-btn vd-sm" data-lk="relink">&#128279; Link to its video again</button></div>';
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
				else if (a === "relink") VE.linkBack(V.linkCandidate(VE.P, [c]));
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
		$("vd-pvwin").setAttribute("aria-pressed", on); $("vd-pvwin").innerHTML = on ? "&#10006; <span class=\"vd-lbl\">Leave</span>" : "&#10530; <span class=\"vd-lbl\">Fill window</span>";
		setTimeout(function () { P.fit(); }, 30);
		if (on) toast("The preview fills the window. Space plays, Esc leaves.", 3000);
	}
	$("vd-pvwin").onclick = function () { setPv(!app.classList.contains("vd-pvfill")); };

	/* ---------- bar size: the playback bar + timeline tools take a lot of height when you only want to watch and cut.
	   0 Normal, 1 Compact (one thin row each, seek bar beside the time, icons only), 2 Minimal (timeline tools hidden, keys
	   still work). Button / key B, double-click an empty part of a bar, or drag an empty part down (thinner) / up (taller). */
	var BAR_NAMES = ["Normal", "Compact", "Minimal"];
	function setBar(n, quiet) {
		n = Math.max(0, Math.min(2, n | 0)); UI.bar = n; saveUI();
		app.classList.toggle("vd-bar1", n >= 1); app.classList.toggle("vd-bar2", n === 2);
		$("vd-barlbl").textContent = BAR_NAMES[n]; $("vd-barbtn").setAttribute("aria-label", "Bar size: " + BAR_NAMES[n]);
		fitBars(); setTimeout(function () { fitBars(); P.fit(); if (VE.tl && VE.tl.render) VE.tl.render(); }, 30);
		if (!quiet) toast(n === 0 ? "Bars: normal size." : n === 1 ? "Bars: compact (B or a drag on an empty part of a bar changes it)." : "Bars: minimal. The timeline tools are hidden; S, Delete, I, O, + and - still work. Press B for normal.", 3500);
	}
	// Compact keeps the bars one row high but still shows the words (and the extra timeline buttons) when the row has room;
	// they are dropped only when they would make the play row wrap or the tools row scroll
	function fitBars() {
		app.classList.remove("vd-lblon", "vd-lblmid", "vd-xton");
		if (!app.classList.contains("vd-bar1")) return;
		var tr = app.querySelector(".vd-transport"), tools = app.querySelector(".vd-tools"), play = $("vd-play");
		function wraps() { var top = play.offsetTop; return [].some.call(tr.children, function (c) { return c.offsetParent && Math.abs(c.offsetTop - top) > 6; }); }
		// all words, else only Fill window / Full screen, else icons only
		if (!wraps()) { app.classList.add("vd-lblon"); if (wraps()) { app.classList.remove("vd-lblon"); app.classList.add("vd-lblmid"); if (wraps()) app.classList.remove("vd-lblmid"); } }
		if (tools && !app.classList.contains("vd-bar2")) { app.classList.add("vd-xton"); if (tools.scrollWidth > tools.clientWidth + 1) app.classList.remove("vd-xton"); }
	}
	var fitT = 0, lastW = "";
	if (window.ResizeObserver) new ResizeObserver(function () {
		var w = app.querySelector(".vd-transport").clientWidth + "x" + app.querySelector(".vd-tools").clientWidth;
		if (w === lastW) return; lastW = w; clearTimeout(fitT); fitT = setTimeout(fitBars, 60);
	}).observe(app.querySelector(".vd-center"));
	window.addEventListener("resize", function () { clearTimeout(fitT); fitT = setTimeout(fitBars, 60); });
	$("vd-barbtn").onclick = function () { setBar(((UI.bar | 0) + 1) % 3); };
	setBar(UI.bar | 0, true);
	VE.cycleBar = function () { setBar(((UI.bar | 0) + 1) % 3); };
	[app.querySelector(".vd-transport"), app.querySelector(".vd-tools")].forEach(function (bar) {
		if (!bar) return;
		function empty(t) { return t === bar || (t.classList && (t.classList.contains("vd-sp") || t.classList.contains("vd-div"))); }
		bar.addEventListener("dblclick", function (e) { if (empty(e.target)) setBar((UI.bar | 0) ? 0 : 1); });
		bar.addEventListener("pointerdown", function (e) {
			if (!empty(e.target) || e.button !== 0 || app.classList.contains("vd-pvfill")) return;
			var y0 = e.clientY, start = UI.bar | 0, done = false;
			bar.classList.add("is-drag");
			function mv(ev) { if (done) return; var dy = ev.clientY - y0; if (Math.abs(dy) >= 22) { done = true; setBar(start + (dy > 0 ? 1 : -1)); } }
			function up() { bar.classList.remove("is-drag"); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); }
			window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
		});
	});
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
	var vzs = $("vd-vzsel"), vzIn = $("vd-vzpct");
	function vzRender() {
		var v = P.view(), opts = V.ZOOM_STEPS.map(function (z) { return z * 100; });
		var html = '<option value="" hidden>' + "</option>" + '<option value="fit">Fit</option>' + opts.map(function (z) { return '<option value="' + z + '">' + Math.round(z) + "%</option>"; }).join("");
		if (vzs.getAttribute("data-h") !== html) { vzs.innerHTML = html; vzs.setAttribute("data-h", html); }
		vzs.value = "";
		if (document.activeElement !== vzIn) vzIn.value = (Math.round(v.pct * 10) / 10) + "%";
		vzIn.title = (v.fit ? "Fitted to the preview. " : "") + "Type a zoom and press Enter: 82, 150% or 1.5x. 100% = one video pixel per screen pixel. Up / Down arrows = 1% (Shift = 10%).";
		$("vd-vzfit").setAttribute("aria-pressed", v.fit); $("vd-vzfit2").setAttribute("aria-pressed", v.fitClear); $("vd-vzguide").setAttribute("aria-pressed", P.guides()); $("vd-vzdim").setAttribute("aria-pressed", P.dimOutside());
	}
	var vzLast = "";
	VE.on("view", function () { var v = P.view(), k = v.fit + "|" + v.pct; if (k !== vzLast) { vzLast = k; vzRender(); } });
	vzs.onchange = function () { if (vzs.value === "fit") P.zoomFit(); else if (vzs.value) P.zoomTo(+vzs.value); vzs.value = ""; };
	vzIn.addEventListener("focus", function () { vzIn.select(); });
	vzIn.addEventListener("keydown", function (e) {
		e.stopPropagation();
		if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); P.zoomTo(V.zoomNudge(P.view().pct, e.key === "ArrowUp" ? 1 : -1, e.shiftKey ? 10 : 1)); vzIn.value = P.view().pct + "%"; vzIn.select(); return; }
		if (e.key === "Escape") { e.preventDefault(); vzIn.blur(); return; }
		if (e.key !== "Enter") return;
		e.preventDefault(); var v = V.parseZoom(vzIn.value);
		if (v == null) { toast("Type a zoom like 82, 150% or 1.5x (from 2% to 4000%)."); vzIn.select(); return; }
		P.zoomTo(v); vzIn.blur();
	});
	vzIn.addEventListener("blur", function () { vzRender(); });
	$("vd-vzfit").onclick = function () { P.zoomFit(); };
	$("vd-vzfit2").onclick = function () { P.zoomFit(true); };
	// › hides the zoom bar down to this one button, ‹ brings it back (remembered)
	function vzBar(on) { var b = $("vd-vz"), t = $("vd-vzhide"); b.classList.toggle("is-min", !on); t.innerHTML = on ? "&#8250;" : "&#8249;"; t.setAttribute("aria-expanded", on); t.title = on ? "Hide these buttons" : "Show the zoom buttons (Fit, zoom, Guides)"; t.setAttribute("aria-label", t.title); }
	$("vd-vzhide").onclick = function () { var on = !P.barShown(); P.barShown(on); vzBar(on); };
	vzBar(P.barShown());
	// - / +: 1% a click; hold = keeps going, 1% steps for the first second, then 5%, then 25%
	[["vd-vzout", -1], ["vd-vzin", 1]].forEach(function (q) {
		var el = $(q[0]), t0 = 0, tm = 0, held = false;
		function nudge(step) { P.zoomTo(V.zoomNudge(P.view().pct, q[1], step || 1)); }
		function stop() { clearTimeout(tm); tm = 0; }
		function rep() { var dt = performance.now() - t0; nudge(dt > 2600 ? 25 : dt > 1200 ? 5 : 1); tm = setTimeout(rep, 70); }
		el.onclick = null;
		el.addEventListener("pointerdown", function (e) { if (e.button !== 0) return; e.preventDefault(); held = true; t0 = performance.now(); nudge(1); tm = setTimeout(rep, 400); });
		["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { el.addEventListener(ev, stop); });
		el.addEventListener("click", function () { if (held) { held = false; return; } nudge(1); });   // keyboard Enter / Space
	});
	$("vd-vzguide").onclick = function () { P.guides(!P.guides()); vzRender(); };
	$("vd-vzhand").onclick = function () { P.setHand(!P.hand); };
	VE.on("view", function () { $("vd-vzhand").setAttribute("aria-pressed", !!P.hand); });
	$("vd-vzdim").onclick = function () { P.dimOutside(!P.dimOutside()); vzRender(); };
	vzRender();

	/* ---------- narration from text (MES Narration engine /main_js/narrate.js, loaded on first use): the speech lands as a sound clip at the playhead ---------- */
	var NKEY = "mes-video-editor:narrate", NS = { eng: "kokoro", voice: "af_heart", cvoice: "", speed: 1, exag: 0.5, gap: 0.25, pgap: 0.7, text: "" };
	try { Object.assign(NS, JSON.parse(localStorage.getItem(NKEY)) || {}); } catch (e) { /* ignore */ }
	function loadNarrate() { if (window.MESNarrate) return Promise.resolve(window.MESNarrate); return new Promise(function (res, rej) { var sc = document.createElement("script"); sc.src = "/main_js/narrate.js?v=1"; sc.onload = function () { res(window.MESNarrate); }; sc.onerror = function () { rej(new Error("Could not load the narration engine.")); }; document.head.appendChild(sc); }); }
	function addAudioFile(file, at) {
		return importFiles([file]).then(function (ms) {
			var m = ms && ms[0]; if (!m) throw new Error("The sound could not be added.");
			return new Promise(function (res) { (function wait(n) { if (m.state === "ready" || n > 200) res(m); else setTimeout(function () { wait(n + 1); }, 100); })(0); });
		}).then(function (m) { if (m.state !== "ready") throw new Error("The sound could not be read."); return VE.tl.placeMedia(m, null, null, at); });
	}
	function openNarrate() {
		loadNarrate().then(function (N) {
			return N.listVoices().catch(function () { return []; }).then(function (mine) {
				var vopt = N.VOICES.map(function (v) { return '<option value="k:' + v[0] + '">' + esc(v[1]) + " (" + esc(v[2]) + ")</option>"; }).join("");
				var mopt = mine.map(function (v) { return '<option value="c:' + v.id + '">' + esc(v.name) + "</option>"; }).join("");
				var cur = NS.eng === "clone" && NS.cvoice ? "c:" + NS.cvoice : "k:" + NS.voice;
				dialog('<h3>Add narration from text</h3><p class="vd-sub">Type the script; it is spoken in this browser and added as a sound clip at the playhead (' + esc(V.tc(VE.t, VE.P.fps)) + '). A blank line = a longer pause, <code>[pause 2]</code> = 2 seconds.</p>' +
					'<textarea id="vd-nt" rows="7" class="vd-ta" spellcheck="true"></textarea>' +
					'<div class="vd-grid"><label>Voice<select id="vd-nv"><optgroup label="Ready-made voices">' + vopt + "</optgroup>" + (mopt ? '<optgroup label="My voices (copied from my recordings)">' + mopt + "</optgroup>" : "") + "</select></label>" +
					'<label>Speed (ready-made voices) <input type="range" id="vd-nsp" min="0.6" max="1.6" step="0.05"></label></div>' +
					'<p class="vd-sub">' + (mopt ? "My voices use a 1.5 GB model the first time (needs a computer with WebGPU). " : "") + 'To add your own voice, record it once on <a href="/narration" target="_blank" rel="noopener">MES Narration</a> (My own voice → Add a voice): it shows up here after.</p>' +
					'<div class="vd-nprog" id="vd-nprog" hidden><div class="vd-nbar"><i id="vd-nbf"></i></div><span id="vd-npt"></span></div>' +
					'<div class="vd-row"><button type="button" class="vd-btn vd-primary" id="vd-ngo">🗣 Make it and add it</button><button type="button" class="vd-btn" id="vd-nclose">Close</button></div>');
				var ta = $("vd-nt"), sel = $("vd-nv"), sp = $("vd-nsp");
				ta.value = NS.text || ""; sel.value = cur; if (!sel.value) sel.value = "k:af_heart"; sp.value = NS.speed;
				function keep() { NS.text = ta.value; var v = sel.value; if (v[0] === "c") { NS.eng = "clone"; NS.cvoice = v.slice(2); } else { NS.eng = "kokoro"; NS.voice = v.slice(2); } NS.speed = +sp.value; try { localStorage.setItem(NKEY, JSON.stringify(NS)); } catch (e) { /* ignore */ } }
				ta.oninput = sel.onchange = sp.oninput = keep;
				ta.addEventListener("keydown", function (e) { e.stopPropagation(); });
				$("vd-nclose").onclick = closeDialog;
				$("vd-ngo").onclick = function () {
					keep(); var text = ta.value.trim(); if (!text) { ta.focus(); return; }
					var b = this, at = VE.t; b.disabled = true; $("vd-nprog").hidden = false;
					function prog(f, t) { $("vd-nbf").style.width = Math.round(f * 100) + "%"; $("vd-npt").textContent = t; }
					N.speak(text, { engine: NS.eng, voice: NS.eng === "clone" ? NS.cvoice : NS.voice, speed: NS.speed, exaggeration: NS.exag, gap: NS.gap, paraGap: NS.pgap,
						onProgress: function (f, L, T) { prog(f, "Downloading the voice model, one time only: " + (T ? Math.round(L / 1048576) + " of " + Math.round(T / 1048576) + " MB" : Math.round(f * 100) + "%")); },
						onPiece: function (i, n) { prog(n ? i / n : 0, i < n ? "Speaking line " + (i + 1) + " of " + n + "…" : "Adding it to the timeline…"); } })
					.then(function (r) {
						var name = "Narration " + text.replace(/\s+/g, " ").slice(0, 32).replace(/[\\/:*?"<>|]+/g, "") + ".wav", f = new File([N.wav(r.audio, r.sr)], name, { type: "audio/wav" });
						return addAudioFile(f, at);
					}).then(function (c) { closeDialog(); if (c) { VE.sel = [c.id]; VE.emit("select"); } toast("Narration added at " + V.tc(at, VE.P.fps) + " on " + ((V.track(VE.P, c.track) || {}).name || "a sound track") + ". It is also in Media, so you can drag it again."); },
						function (e) { b.disabled = false; prog(0, "Could not make it: " + e.message); });
				};
				setTimeout(function () { ta.focus(); }, 40);
			});
		}, function (e) { toast(e.message); });
	}
	$("vd-narr") && ($("vd-narr").onclick = openNarrate);

	/* ---------- start ---------- */
	VE.hist.push(JSON.stringify(VE.P));
	VE.restore().then(function (had) {
		renderBin(); renderInsp(); updateButtons(); VE.tl.render(); VE.preview.fit(); timeText();
		if (had) { toast("Your last project is back."); setTimeout(function () { if (V.duration(VE.P)) VE.tl.fit(); }, 400); }
		receiveHandoff();
	});
	// sound handed over by another MES page (MES Narration's "Add to the Video Editor"): added at the playhead
	function receiveHandoff() {
		var m = /[?&]handoff=([\w-]+)/.exec(location.search); if (!m) return;
		try { var u = new URL(location.href); u.searchParams.delete("handoff"); history.replaceState(history.state, "", u.pathname + (u.search || "") + u.hash); } catch (e) { /* ignore */ }
		var got = null;
		handoffDb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction("h", "readwrite"), st = t.objectStore("h"), g = st.get(m[1]); g.onsuccess = function () { got = g.result || null; if (got) st.delete(m[1]); }; t.oncomplete = function () { db.close(); res(); }; t.onerror = function () { rej(t.error); }; }); })
			.then(function () {
				if (!got || !got.files || !got.files.length) return;
				var chain = Promise.resolve();
				got.files.forEach(function (f) { if (!f.blob) return; chain = chain.then(function () { return addAudioFile(new File([f.blob], f.name || "narration.wav", { type: f.type || "audio/wav" }), VE.t); }); });
				return chain.then(function () { toast("Added " + got.files.length + " file" + (got.files.length === 1 ? "" : "s") + " from MES Narration at the playhead."); });
			}).catch(function (e) { toast("Could not take the handed-over file: " + (e && e.message || e)); });
	}
	window.MESVideoEditor = VE;   // for testing from the console
})();
