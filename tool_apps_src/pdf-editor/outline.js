/* MES PDF Editor: 🔖 Bookmarks. Reads the PDF's own outline when it opens, makes bookmarks from a table of contents or the headings
   (PDM.makeBookmarks; scanned books are read with Tesseract.js first), lets you rename / move / indent / delete them, and writes them
   into the downloaded PDF as a real outline (PD.writeOutline, called by export.js). A bookmark = { id, t, pg (page id), y (PDF y or null), lv }. */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$, root = $("pd"), panel = $("pd-bm"), btn = $("pd-bmbtn"), selId = null, busy = null, made = null;
	function esc(s) { return M.esc(String(s == null ? "" : s)); }
	function compact() { return root.classList.contains("pd-compact"); }
	PD.bmOn = function () { return compact() ? !!PD.S.bmM : !!PD.S.bm; };
	function bms() { return PD.doc ? (PD.doc.bms = PD.doc.bms || []) : []; }
	function pageIndex(id) { if (!PD.doc) return -1; for (var i = 0; i < PD.doc.pages.length; i++) if (PD.doc.pages[i].id === id) return i; return -1; }
	function changed(note) { if (note != null) made = note; PD.commit(); render(); }

	/* ---------- the PDF's own outline ---------- */
	async function readOutline(doc) {
		var s = doc.srcs[0]; if (!s || !s.pdf) return;
		var ol; try { ol = await s.pdf.getOutline(); } catch (e) { return; } if (!ol || !ol.length || PD.doc !== doc) return;
		var out = [];
		async function walk(list, lv) {
			for (var i = 0; i < list.length && out.length < 3000; i++) {
				var it = list[i], dest = it.dest, pi = -1, y = null;
				try {
					if (typeof dest === "string") dest = await s.pdf.getDestination(dest);
					if (Array.isArray(dest) && dest.length) { var ref = dest[0]; pi = typeof ref === "number" ? ref : await s.pdf.getPageIndex(ref); var kind = dest[1] && dest[1].name; if (kind === "XYZ" && typeof dest[3] === "number") y = dest[3]; else if ((kind === "FitH" || kind === "FitBH") && typeof dest[2] === "number") y = dest[2]; }
				} catch (e) { pi = -1; }
				var page = pi >= 0 ? doc.pages.filter(function (p) { return p.src === 0 && p.index === pi; })[0] : null;
				out.push({ id: M.newId("b"), t: String(it.title || "Untitled").replace(/\s+/g, " ").trim() || "Untitled", pg: page ? page.id : null, y: y, lv: Math.min(lv, 5) });
				if (it.items && it.items.length) await walk(it.items, lv + 1);
			}
		}
		await walk(ol, 0);
		if (PD.doc !== doc || !out.length) return;
		doc.bms = out; doc.bmFrom = "pdf"; made = "These are the bookmarks saved in the PDF.";
		PD.hist.reset(PD.snapshot()); render();
		if (!PD.S.bmAsked && !PD.bmOn() && out.length >= 3) PD.toast("This PDF has " + out.length + " bookmarks: tap 🔖 to see them", 3500);
	}
	PD.on("open", function () { selId = null; made = null; if (busy) busy.stop = true; render(); var d = PD.doc; readOutline(d).then(function () { if (PD.doc === d && !bms().length && d.pages.length >= 12) made = "This PDF has no bookmarks. Make them from its table of contents or headings:"; render(); }); });
	PD.on("history", render); PD.on("layout", function () { if (PD.bmOn()) markCur(); }); PD.on("cur", markCur);

	/* ---------- making them ---------- */
	async function textPages(stopper, prog) {
		var pages = [], n = PD.doc.pages.length;
		for (var i = 0; i < n; i++) {
			if (stopper.stop) return null; var p = PD.doc.pages[i];
			if (p.blank || !p.proxy) { pages.push({ lines: [], rows: [], H: p.H }); continue; }
			try { var tc = await p.proxy.getTextContent(); pages.push({ lines: M.groupText(tc.items, tc.styles), rows: M.rowsOf(tc.items), H: p.H }); } catch (e) { pages.push({ lines: [], rows: [], H: p.H }); }
			if (i % 10 === 9) { prog((i + 1) / n, "Reading page " + (i + 1) + " of " + n + "..."); await new Promise(function (r) { setTimeout(r, 0); }); }
		}
		return pages;
	}
	var tess = null;
	function loadTess() { if (window.Tesseract) return Promise.resolve(); if (tess) return tess; tess = new Promise(function (res, rej) { var sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js"; sc.onload = res; sc.onerror = function () { tess = null; rej(new Error("Could not load the text reader. Check your connection.")); }; document.head.appendChild(sc); }); return tess; }
	async function ocrPages(stopper, prog) {
		await loadTess(); prog(0.01, "Getting the text reader ready (about 5 MB, once)...");
		var worker = await window.Tesseract.createWorker("eng"), n = PD.doc.pages.length, pages = [];
		try {
			for (var i = 0; i < n; i++) {
				if (stopper.stop) break; var p = PD.doc.pages[i]; prog(i / n, "Reading the pictures of the pages: " + (i + 1) + " of " + n + "... (Stop keeps what is read so far)");
				if (p.blank || !p.proxy) { pages.push({ lines: [], rows: [], H: p.H }); continue; }
				var vp0 = p.proxy.getViewport({ scale: 1, rotation: (p.rot0 + p.rot) % 360 }), sc = Math.min(2.2, 1500 / vp0.width), vp = p.proxy.getViewport({ scale: sc, rotation: (p.rot0 + p.rot) % 360 }), cv = document.createElement("canvas");
				cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
				await p.proxy.render({ canvasContext: ctx, viewport: vp }).promise;
				var r = await worker.recognize(cv, {}, { blocks: true, text: false }), lines = [], H = cv.height / sc;
				((r.data && r.data.blocks) || []).forEach(function (b) { (b.paragraphs || []).forEach(function (pa) { (pa.lines || []).forEach(function (l) { var t = String(l.text || "").replace(/\s+/g, " ").trim(), bb = l.bbox; if (!t || !bb || (l.confidence != null && l.confidence < 45)) return; var h = (bb.y1 - bb.y0) / sc; lines.push({ text: t, x: bb.x0 / sc, y: H - bb.y1 / sc, size: Math.max(4, h * 0.82) }); }); }); });
				pages.push({ lines: lines, rows: lines, H: H }); cv.width = cv.height = 1;
			}
		} finally { try { await worker.terminate(); } catch (e) {} }
		while (pages.length < n) pages.push({ lines: [], rows: [], H: 0 });
		return pages;
	}
	function adopt(res, how) {
		var list = res.items.map(function (b) { var p = PD.doc.pages[b.pi]; return { id: M.newId("b"), t: b.t, pg: p ? p.id : null, y: b.y, lv: b.lv | 0 }; });
		PD.doc.bms = list; PD.doc.bmFrom = how;
		var note = res.how === "toc" ? "Made from the table of contents" + (res.sure ? "." : ". The page numbers are a best guess: check a few and fix them with ⇅ or Set page.") : "Made from the headings. Check them: rename, indent or delete with the buttons under a bookmark.";
		changed(note + (how === "ocr" ? " (read from the pictures of the pages)" : "") + " They are saved into the PDF when you download it.");
		PD.toast(list.length + " bookmarks made", 2500);
	}
	async function make(useOcr) {
		if (!PD.doc) return PD.toast("Open a PDF first"); if (busy) return;
		if (bms().length && !window.confirm("Replace the " + bms().length + " bookmarks you have with new ones?")) return;
		var stopper = busy = { stop: false }, doc = PD.doc; render();
		var prog = function (f, msg) { if (busy !== stopper) return; var bar = panel.querySelector(".pd-bm-prog i"), nt = panel.querySelector(".pd-bm-note"); if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + "%"; if (nt) nt.textContent = msg; };
		try {
			var pages = useOcr ? await ocrPages(stopper, prog) : await textPages(stopper, prog);
			if (PD.doc !== doc) return; if (!pages) { made = "Stopped."; return; }
			var res = M.makeBookmarks(pages);
			if (res.how === "scanned" && !useOcr) { made = "This PDF is scanned (its pages are pictures), so there is no text to find headings in. Read the pictures first (OCR). It takes a few seconds a page."; busy = null; render(true); return; }
			if (!res.items.length) { made = "No table of contents or headings were found. Add bookmarks yourself with + Add."; return; }
			adopt(res, useOcr ? "ocr" : "text");
		} catch (e) { console.error(e); made = "Something went wrong: " + ((e && e.message) || e); }
		finally { if (busy === stopper) busy = null; render(); }
	}

	/* ---------- the panel ---------- */
	function show(on) { if (compact()) PD.S.bmM = on; else PD.S.bm = on; PD.S.bmAsked = true; PD.saveS(); render(); if (PD.doc) setTimeout(function () { PD.emit("room"); }, 30); }
	PD.toggleBookmarks = function () { show(!PD.bmOn()); };
	btn.onclick = PD.toggleBookmarks;
	function curPageId() { var p = PD.doc && PD.doc.pages[PD.cur]; return p && p.id; }
	function markCur() {
		if (!PD.bmOn() || !PD.doc) return; var list = bms(), cur = PD.cur, best = null;
		list.forEach(function (b) { var i = pageIndex(b.pg); if (i >= 0 && i <= cur && (!best || i >= pageIndex(best.pg))) best = b; });
		[].forEach.call(panel.querySelectorAll(".pd-bmr"), function (r) { r.classList.toggle("is-cur", !!best && r.dataset.id === best.id); });
	}
	function render(scanned) {
		var on = PD.bmOn() && !!PD.doc; panel.hidden = !on; btn.setAttribute("aria-pressed", String(on)); if (!on) return;
		var list = bms(), html = '<div class="pd-bm-h"><b>Bookmarks</b><span class="pd-note">' + (list.length || "") + '</span><button type="button" class="pd-ib pd-bm-x" data-a="close" aria-label="Close bookmarks">&#10005;</button></div>';
		html += '<div class="pd-bm-act">' + (busy ? '<button type="button" class="pd-btn" data-a="stop">Stop</button>' : '<button type="button" class="pd-btn pd-btn--primary" data-a="make" title="Find the table of contents or the headings and make bookmarks">&#10024; Make bookmarks</button><button type="button" class="pd-btn" data-a="add" title="Add a bookmark for the page you are on">+ Add</button>' + (list.length ? '<button type="button" class="pd-btn" data-a="clear" title="Delete all bookmarks">Clear</button>' : "")) + '</div>';
		if (scanned === true && !busy) html += '<div class="pd-bm-act"><button type="button" class="pd-btn pd-btn--primary" data-a="ocr">Read the pages (OCR)</button></div>';
		html += busy ? '<div class="pd-bm-prog"><i></i></div><div class="pd-bm-note">Working...</div>' : '<div class="pd-bm-note">' + esc(made || "") + '</div>';
		html += '<div class="pd-bm-list" role="tree">';
		if (!list.length) html += '<div class="pd-bm-empty">No bookmarks yet. <b>&#10024; Make bookmarks</b> finds the table of contents or the headings; <b>+ Add</b> marks the page you are on.</div>';
		list.forEach(function (b, i) {
			var pi = pageIndex(b.pg), sel = b.id === selId;
			html += '<div class="pd-bmr' + (sel ? " is-sel" : "") + (pi < 0 ? " is-gone" : "") + '" data-id="' + b.id + '" data-lv="' + b.lv + '" role="treeitem" aria-level="' + (b.lv + 1) + '"><button type="button" class="pd-bmr-t" data-a="go" style="padding-left:' + (0.55 + b.lv * 1.1) + 'em" title="' + (pi < 0 ? "Its page was deleted" : "Go to page " + (pi + 1)) + '"><span class="pd-bmr-n">' + esc(b.t) + '</span><span class="pd-bmr-p">' + (pi < 0 ? "&ndash;" : pi + 1) + "</span></button>";
			if (sel) html += '<div class="pd-bmr-tools" style="padding-left:' + (0.55 + b.lv * 1.1) + 'em"><button type="button" data-a="ren" title="Rename" aria-label="Rename">&#9998;</button><button type="button" data-a="out" title="Move left (one level up)" aria-label="Move left" ' + (b.lv ? "" : "disabled") + '>&#8676;</button><button type="button" data-a="in" title="Move right (under the one above)" aria-label="Move right" ' + (i && b.lv <= list[i - 1].lv ? "" : "disabled") + '>&#8677;</button><button type="button" data-a="up" title="Move up" aria-label="Move up" ' + (i ? "" : "disabled") + '>&#8593;</button><button type="button" data-a="down" title="Move down" aria-label="Move down" ' + (i < list.length - 1 ? "" : "disabled") + '>&#8595;</button><button type="button" data-a="here" title="Point it at the page you are on now">Set page</button><button type="button" data-a="del" title="Delete" aria-label="Delete">&#10005;</button></div>';
			html += "</div>";
		});
		panel.innerHTML = html + "</div>"; markCur();
		var s = panel.querySelector(".pd-bmr.is-sel"); if (s && s.scrollIntoViewIfNeeded) s.scrollIntoViewIfNeeded(false);
	}
	function goTo(b) {
		var pi = pageIndex(b.pg); if (pi < 0) return PD.toast("The page of this bookmark was deleted");
		var p = PD.doc.pages[pi], el = PD.pageEl(p), v = $("pd-view"); if (!el) return PD.goPage(pi);
		var dy = 0; if (b.y != null) { var pt = PD.vp(p).toView(p.x0, b.y); dy = Math.max(0, pt[1] - 12); }
		v.scrollTo({ top: el.offsetTop + dy - 8, behavior: "smooth" }); PD.cur = pi; PD.emit("cur");
		if (compact()) show(false);
	}
	function rename(b) {
		var row = panel.querySelector('.pd-bmr[data-id="' + b.id + '"] .pd-bmr-t'); if (!row) return;
		row.outerHTML = '<input type="text" class="pd-bm-ed" value="' + esc(b.t) + '" aria-label="Bookmark name">';
		var inp = panel.querySelector(".pd-bm-ed"); inp.focus(); inp.select(); var done = false;
		function fin(ok) { if (done) return; done = true; var v = inp.value.replace(/\s+/g, " ").trim(); if (ok && v && v !== b.t) { b.t = v; changed(); } else render(); }
		inp.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") fin(true); else if (e.key === "Escape") fin(false); }); inp.addEventListener("blur", function () { fin(true); });
	}
	panel.addEventListener("click", function (e) {
		var b0 = e.target.closest("button"); if (!b0) return; var a = b0.dataset.a, row = b0.closest(".pd-bmr"), list = bms(), i = row ? list.findIndex(function (x) { return x.id === row.dataset.id; }) : -1, b = list[i];
		if (a === "close") return show(false); if (a === "make") return make(false); if (a === "ocr") return make(true); if (a === "stop") { if (busy) busy.stop = true; return; }
		if (a === "clear") { if (window.confirm("Delete all " + list.length + " bookmarks?")) { PD.doc.bms = []; selId = null; changed(""); } return; }
		if (a === "add") { var p = PD.doc.pages[PD.cur], nb = { id: M.newId("b"), t: "Page " + (PD.cur + 1), pg: p.id, y: null, lv: 0 }, at = list.length; for (var k = 0; k < list.length; k++) if (pageIndex(list[k].pg) > PD.cur) { at = k; break; } if (at > 0) nb.lv = Math.min(list[at - 1].lv, 5); list.splice(at, 0, nb); selId = nb.id; changed(); rename(nb); return; }
		if (!b) return;
		if (a === "go") { selId = b.id; render(); goTo(b); return; }
		if (a === "ren") return rename(b);
		if (a === "del") { list.splice(i, 1); selId = null; return changed(); }
		if (a === "out") { b.lv = Math.max(0, b.lv - 1); return changed(); } if (a === "in") { if (i) b.lv = Math.min(list[i - 1].lv + 1, b.lv + 1, 5); return changed(); }
		if (a === "up" && i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); return changed(); } if (a === "down" && i < list.length - 1) { list.splice(i + 1, 0, list.splice(i, 1)[0]); return changed(); }
		if (a === "here") { b.pg = curPageId(); b.y = null; PD.toast("Now goes to page " + (PD.cur + 1)); return changed(); }
	});
	panel.addEventListener("keydown", function (e) { e.stopPropagation(); });
	document.addEventListener("keydown", function (e) { var t = e.target; if (e.ctrlKey || e.metaKey || e.altKey || !PD.doc || (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) || PD.isEditing()) return; if (e.key === "b" || e.key === "B") PD.toggleBookmarks(); });
	PD.renderBookmarks = render;

	/* ---------- writing them into the downloaded PDF (pdf-lib low level: /Outlines with /First /Last /Next /Prev /Parent /Count, /Dest [page /XYZ null top null]) ---------- */
	PD.writeOutline = function (L, out, destOf) {
		var list = bms().filter(function (b) { return pageIndex(b.pg) >= 0; }); if (!list.length) return;
		var ctx = out.context, tree = M.bmTree(list), rootRef = ctx.nextRef(), pages = out.getPages();
		function build(nodes, parentRef) {
			var refs = nodes.map(function () { return ctx.nextRef(); }), total = 0;
			nodes.forEach(function (nd, k) {
				var b = nd.b, pi = pageIndex(b.pg), d = destOf(pi, b.y), dict = { Title: L.PDFHexString.fromText(b.t), Parent: parentRef, Dest: [pages[pi].ref, L.PDFName.of("XYZ"), null, d == null ? null : L.PDFNumber.of(Math.round(d * 100) / 100), null] };
				if (k > 0) dict.Prev = refs[k - 1]; if (k < nodes.length - 1) dict.Next = refs[k + 1];
				if (nd.kids.length) { var sub = build(nd.kids, refs[k]); dict.First = sub.first; dict.Last = sub.last; dict.Count = L.PDFNumber.of(-nd.kids.length); }
				ctx.assign(refs[k], ctx.obj(dict)); total++;
			});
			return { first: refs[0], last: refs[refs.length - 1], count: total };
		}
		var top = build(tree, rootRef);
		ctx.assign(rootRef, ctx.obj({ Type: "Outlines", First: top.first, Last: top.last, Count: L.PDFNumber.of(top.count) }));
		out.catalog.set(L.PDFName.of("Outlines"), rootRef);
	};
	render();
})();
