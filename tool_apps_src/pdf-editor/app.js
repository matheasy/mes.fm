/* MES PDF Editor -- mes.fm/pdf (wiring: files, drag and drop, zoom, keyboard, window mode). The work is in core.js / tools.js / sign.js / export.js (global PD, helpers in lib.js as PDM). */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$, root = $("pd");
	if (!root) return;
	PD.init.buildTools(); PD.init.bindPointer(); PD.init.bindThumbs(); PD.setTool("select");
	function confirmDiscard() { return !PD.dirty || window.confirm("You have unsaved edits. Open another PDF and discard them?"); }
	function openFile(f) { if (!f) return; if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) return PD.toast("Please choose a PDF file"); if (!confirmDiscard()) return; PD.open(f); }
	["pd-open", "pd-e-open"].forEach(function (id) { $(id).addEventListener("click", function () { $("pd-file").click(); }); });
	$("pd-file").addEventListener("change", function () { openFile(this.files[0]); this.value = ""; });
	$("pd-addfile").addEventListener("change", function () { if (this.files[0]) PD.addPdf(this.files[0]); this.value = ""; });
	$("pd-e-blank").addEventListener("click", function () { PD.newBlank(); });
	$("pd-imgfile").addEventListener("change", async function () { var f = this.files[0]; this.value = ""; if (!f || !PD.doc) return; var r = await PD.loadImageFile(f); if (r) { PD.setTool("image"); PD.armed = { kind: "img", id: r.id, w: r.w, h: r.h }; PD.buildOpts(); PD.toast("Click where the picture should go", 3000); } });
	/* drag and drop: a PDF opens, a picture is placed on the page under the pointer */
	var view = $("pd-view"), depth = 0;
	function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
	view.addEventListener("dragenter", function (e) { if (hasFiles(e)) { depth++; view.classList.add("is-over"); } }); view.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) view.classList.remove("is-over"); });
	view.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
	view.addEventListener("drop", async function (e) {
		depth = 0; view.classList.remove("is-over"); if (!hasFiles(e)) return; e.preventDefault(); var f = e.dataTransfer.files[0]; if (!f) return;
		if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) return openFile(f);
		if (/^image\//.test(f.type) && PD.doc) { var pe = e.target.closest && e.target.closest(".pd-page"), p = (pe && PD.page(pe.dataset.id)) || PD.doc.pages[PD.cur], x = p.x0 + p.W / 2, y = p.y0 + p.H / 2; if (pe) { var r = pe.getBoundingClientRect(), pt = PD.vp(p).toPdf(e.clientX - r.left, e.clientY - r.top); x = pt[0]; y = pt[1]; } var im = await PD.loadImageFile(f); if (im) PD.placeImage(p, x, y, im.id, im.w, im.h, "img"); }
	});
	document.addEventListener("paste", async function (e) {
		if (!PD.doc || PD.isEditing() || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return; var cd = e.clipboardData, f = null; if (cd && cd.files) for (var i = 0; i < cd.files.length; i++) if (/^image\//.test(cd.files[i].type)) { f = cd.files[i]; break; }
		if (f) { e.preventDefault(); var p = PD.doc.pages[PD.cur], im = await PD.loadImageFile(f); if (im) PD.placeImage(p, p.x0 + p.W / 2, p.y0 + p.H / 2, im.id, im.w, im.h, "img"); } else if (PD.clip) { e.preventDefault(); PD.pasteClip(); }
	});
	/* undo / redo / history */
	$("pd-undo").onclick = function () { PD.endEdit(); PD.undo(); }; $("pd-redo").onclick = function () { PD.endEdit(); PD.redo(); };
	function histBtns() { $("pd-undo").disabled = !PD.hist.canUndo(); $("pd-redo").disabled = !PD.hist.canRedo(); } PD.on("history", histBtns); PD.on("open", histBtns);
	PD.on("open", function () { PD.setTool("select"); PD.status(); });   // no automatic Full window: the Standard / Wide / Theatre switch and the sidebar stay available (Full window is one click away, key F)
	PD.on("sel", function () { var a = PD.selAnnot(); $("pd-st-sel").textContent = a ? "Selected: " + a.t : ""; });
	/* zoom */
	$("pd-zin").onclick = function () { PD.setZoom(PD.zoom * 1.2); }; $("pd-zout").onclick = function () { PD.setZoom(PD.zoom / 1.2); }; $("pd-zoom").onclick = function () { var z = PD.fitWidth(); if (!z) return; if (Math.abs(PD.zoom - z) < 0.01) PD.setZoom(1); else { PD.setZoom(z); PD.fitMode = true; } };
	view.addEventListener("wheel", function (e) { if (!(e.ctrlKey || e.metaKey) || !PD.doc) return; e.preventDefault(); PD.setZoom(PD.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
	var scrollT; view.addEventListener("scroll", function () { clearTimeout(scrollT); scrollT = setTimeout(PD.trackCurrent, 80); });
	var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(refit, 200); });
	/* page list and window mode */
	function showThumbs() { $("pd-thumbbtn").setAttribute("aria-pressed", String(PD.S.thumbs)); $("pd-thumbs").classList.toggle("is-off", !PD.S.thumbs || !PD.doc); }
	$("pd-thumbbtn").onclick = function () { PD.S.thumbs = !PD.S.thumbs; PD.saveS(); showThumbs(); if (PD.S.thumbs) PD.layout(); }; showThumbs(); PD.on("open", showThumbs);
	function toggleWin(auto) { var on = !root.classList.contains("pd-win"); root.classList.toggle("pd-win", on); document.documentElement.classList.toggle("pd-win-on", on); $("pd-winbtn").setAttribute("aria-pressed", String(on)); if (!auto) { PD.S.win = on; PD.saveS(); } if (PD.doc) setTimeout(refit, 80); }
	$("pd-winbtn").onclick = function () { toggleWin(); };
	$("pd-print").onclick = function () { PD.printPdf(); }; $("pd-export").onclick = function () { PD.exportDialog(); };
	PD.fitMode = true; var oz = PD.setZoom; PD.setZoom = function (z) { PD.fitMode = false; oz.apply(PD, arguments); };
	// a refit (window mode, width mode, sidebar, resize) keeps the zoom in 'fit width' mode; only the person's own zoom choice turns it off
	function refit() { if (!PD.doc || !PD.fitMode) return; var z = PD.fitWidth(); if (z && Math.abs(z - PD.zoom) > 0.01) { oz.call(PD, z); PD.fitMode = true; } }
	/* keyboard */
	document.addEventListener("keydown", function (e) {
		if (!PD.doc && !(e.ctrlKey || e.metaKey)) return; var t = e.target, typing = t && /INPUT|TEXTAREA|SELECT/.test(t.tagName); if (typing || PD.isEditing() || !$("pd-modal").hidden) { if (e.key === "Escape" && !$("pd-modal").hidden) PD.closeDialog(); return; }
		var k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
		if (mod && k === "z") { e.preventDefault(); e.shiftKey ? PD.redo() : PD.undo(); return; } if (mod && k === "y") { e.preventDefault(); PD.redo(); return; }
		if (mod && k === "d") { e.preventDefault(); PD.duplicateSel(); return; } if (mod && k === "c") { if (PD.copySel()) e.preventDefault(); return; } if (mod && k === "s") { e.preventDefault(); PD.exportDialog(); return; } if (mod && k === "p") { if (PD.doc) { e.preventDefault(); PD.printPdf(); } return; } if (mod && k === "o") { e.preventDefault(); $("pd-file").click(); return; } if (mod) return;
		if (e.key === "Delete" || e.key === "Backspace") { if (PD.selAnnot()) { e.preventDefault(); PD.removeSel(); } return; }
		if (e.key === "Escape") { if (PD.selAnnot()) PD.select(null, null); else if (PD.tool !== "select") PD.setTool("select"); return; }
		var step = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]; if (mv && PD.nudge(mv[0], mv[1])) { e.preventDefault(); return; }
		if (k === "+" || k === "=") { PD.setZoom(PD.zoom * 1.2); return; } if (k === "-") { PD.setZoom(PD.zoom / 1.2); return; } if (k === "0") { var z = PD.fitWidth(); if (z) PD.setZoom(z); return; } if (k === "f") { toggleWin(); return; }
		PD.TOOLS.forEach(function (tl) { if (tl.key === k && PD.doc) PD.setTool(tl.id); });
	});
	/* the width mode (Standard / Wide / Theatre), the sidebar and Full window all change the room: keep a fit-to-width zoom fitted */
	if (window.ResizeObserver) { var ro, last = 0; new ResizeObserver(function () { var w = view.clientWidth; if (Math.abs(w - last) < 4) return; last = w; clearTimeout(ro); ro = setTimeout(refit, 150); }).observe(view); }
	/* ---- read aloud: the MES Read Aloud engine (main_js/site-read-aloud.js, the browser extension's reader) reads the PDF's own text.
	   Each page gets an invisible text layer (one span per line, from pdf.js getTextContent grouped by PDM.groupText), laid out at zoom 1
	   and scaled with the page, so the word being read is highlighted on the page itself. Reading starts at the page you are on. Text you
	   added with the tools is not read (only the PDF's own text). The header's speaker button uses the same source (window.__mesraSource). */
	var measureCtx = document.createElement("canvas").getContext("2d");
	async function textLayer(p) {
		var el = PD.pageEl(p); if (!el || p.blank || !p.proxy) return 0;
		var tl = el.querySelector(".pd-tl");
		if (!tl || tl._key !== (p.rot0 + p.rot)) {
			if (tl) tl.remove();
			if (!p._lines) { try { var tc = await p.proxy.getTextContent(); p._lines = M.groupText(tc.items, tc.styles); } catch (e) { p._lines = []; } }
			var vp = PD.vp(p, 1); tl = document.createElement("div"); tl.className = "pd-tl"; tl._key = p.rot0 + p.rot;
			tl.style.width = vp.width + "px"; tl.style.height = vp.height + "px"; tl.setAttribute("aria-hidden", "false");
			var q = (p.rot0 + p.rot) % 180 === 90;
			p._lines.forEach(function (l) {
				var a = vp.toView(l.x, l.y - 0.22 * l.size), b = vp.toView(l.x + l.w, l.y + 0.88 * l.size), x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), h = Math.abs(a[1] - b[1]);
				if (w < 1 || h < 1) return;
				var sp = document.createElement("span"), fs = (q ? w : h) * 0.9; sp.textContent = l.text + " ";   // the space keeps the last word of a line apart from the next line's first
				measureCtx.font = fs + "px sans-serif"; var mw = measureCtx.measureText(l.text).width || 1;
				sp.style.cssText = "left:" + x + "px;top:" + y + "px;font-size:" + fs + "px;height:" + (q ? w : h) + "px;transform:" + (q ? "translate(" + w + "px,0) rotate(90deg) " : "") + "scaleX(" + ((q ? h : w) / mw) + ")";
				tl.appendChild(sp);
			});
			el.appendChild(tl);
		}
		tl.style.transform = "scale(" + PD.zoom + ")";
		return tl.childNodes.length;
	}
	PD.on("layout", function () { if (PD.doc) PD.doc.pages.forEach(function (p) { var el = PD.pageEl(p), tl = el && el.querySelector(".pd-tl"); if (tl) { if (tl._key !== (p.rot0 + p.rot)) tl.remove(); else tl.style.transform = "scale(" + PD.zoom + ")"; } }); });
	function readStart() {
		var p = PD.doc && PD.doc.pages[Math.max(0, PD.cur)], v = $("pd-view").getBoundingClientRect();
		if (PD.doc) for (var i = 0; i < PD.doc.pages.length; i++) { var el = PD.pageEl(PD.doc.pages[i]); if (el && el.getBoundingClientRect().bottom > v.top + 40) { p = PD.doc.pages[i]; break; } }
		var el2 = p && PD.pageEl(p), tl = el2 && el2.querySelector(".pd-tl");
		return tl && PD.doc.pages.indexOf(p) > 0 ? tl : null;
	}
	window.__mesraSource = { roots: function () { return PD.doc ? [].slice.call(document.querySelectorAll("#pd-pages .pd-tl")) : []; }, start: readStart };
	var raLoading = false, raBtn = $("pd-read");
	async function readAloud() {
		if (!PD.doc) { PD.toast("Open a PDF first"); return; }
		if (window.MESReadAloud && window.MESReadAloud.isActive && window.MESReadAloud.isActive()) { window.MESReadAloud.toggle(); return; }
		if (raLoading) return; raLoading = true; raBtn.setAttribute("aria-busy", "true");
		var n = 0; if (PD.doc.pages.length > 20) PD.toast("Getting the text of " + PD.doc.pages.length + " pages…", 4000);
		for (var i = 0; i < PD.doc.pages.length; i++) n += await textLayer(PD.doc.pages[i]);
		if (!n) { raLoading = false; raBtn.removeAttribute("aria-busy"); PD.toast("This PDF has no text to read: it is probably a scan (pictures of pages). mes.fm/image-to-text can read text from a picture.", 6000); return; }
		var go = function () { raLoading = false; raBtn.removeAttribute("aria-busy"); if (window.MESReadAloud) window.MESReadAloud.read(); };
		if (window.MESReadAloud) { go(); return; }
		var sc = document.createElement("script"); sc.src = "/main_js/site-read-aloud.js?v=1"; sc.onload = go;
		sc.onerror = function () { raLoading = false; raBtn.removeAttribute("aria-busy"); PD.toast("Read aloud could not load. Check your connection and try again."); };
		document.head.appendChild(sc);
	}
	raBtn.onclick = readAloud;
	document.addEventListener("keydown", function (e) { if (e.altKey && e.shiftKey && e.code === "KeyR" && PD.doc) { e.preventDefault(); readAloud(); } });
	PD.on("open", function () { if (window.MESReadAloud) window.MESReadAloud.stop(); });
	PD.status();
})();
