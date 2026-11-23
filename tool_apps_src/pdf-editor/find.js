/* PDF Editor: Find (Ctrl/Cmd+F) and the "Page [ n ] / N" box (2026-11-23). The shared bar is main_js/find-bar.js (MESFind).
   It searches the PDF's own text of every page (pdf.js getTextContent, grouped into lines by PDM.groupText, cached on the page as
   p._lines), lists the matches by page with a snippet, and highlights them on the page through the invisible text layer that
   Read aloud already uses (PD.textLayer: one span per line, span._li = line index). Text added with the tools is not searched.
   Pages with no text at all (scanned pictures) are counted and named in the note. */
(function () {
	"use strict";
	var F = window.MESFind, PD = window.PD, M = window.PDM, $ = function (id) { return document.getElementById(id); };
	if (!F || !PD || !M) return;
	var root = $("pd"), view = $("pd-view"), wrap = $("pd-findwrap");
	if (!root || !wrap) return;
	async function linesOf(p) {
		if (p.blank || !p.proxy) return [];
		if (!p._lines) { try { var tc = await p.proxy.getTextContent(); p._lines = M.groupText(tc.items, tc.styles); } catch (e) { p._lines = []; } }
		return p._lines;
	}
	var shown = [];   // hits currently painted
	async function search(q, o, progress) {
		if (!PD.doc) return { hits: [], note: "Open a PDF first" };
		var pages = PD.doc.pages, hits = [], empty = 0, total = 0, t0 = Date.now(), capped = false;
		for (var i = 0; i < pages.length; i++) {
			var p = pages[i]; if (p.blank) continue;
			if (!p._lines && Date.now() - t0 > 250) progress("Page " + (i + 1) + "/" + pages.length);
			var lines = await linesOf(p), pt = M.pageText(lines);
			if (!lines.length) { empty++; continue; }
			total++;
			var found = F.find(pt.s, q, { caseSensitive: o.caseSensitive, wholeWord: o.wholeWord, max: 5000 - hits.length });
			found.forEach(function (m) { hits.push({ g: i, gl: "Page " + (i + 1), text: pt.s, a: m[0], b: m[1], p: p, starts: pt.starts, lens: lines.map(function (l) { return l.text.length + 1; }) }); });
			if (hits.length >= 5000) { capped = true; break; }
		}
		var note = empty ? (empty === pages.length ? "This PDF has no text to search: its pages are pictures (a scan). Bookmarks → Make bookmarks can read them with OCR." : empty + (empty === 1 ? " page has" : " pages have") + " no text (scanned pictures) and could not be searched.") : "";
		var start = 0; for (var k = 0; k < hits.length; k++) if (hits[k].g >= PD.cur) { start = k; break; }
		return { hits: hits, note: note, capped: capped, start: start };
	}
	function rangesFor(h) {
		var el = PD.pageEl(h.p), tl = el && el.querySelector(".pd-tl"); if (!tl) return [];
		var byLi = {}; [].forEach.call(tl.childNodes, function (sp) { byLi[sp._li] = sp; });
		var parts = M.lineParts(h.starts, h.lens, h.a, h.b), out = [];
		parts.forEach(function (pt) { var sp = byLi[pt.li], tn = sp && sp.firstChild; if (!tn) return; var r = document.createRange(); r.setStart(tn, Math.min(pt.a, tn.length)); r.setEnd(tn, Math.min(pt.b, tn.length)); out.push(r); });
		return out;
	}
	var curHit = null;
	async function paintAll(scroll) {
		var hits = bar.hits(), pages = {};
		hits.forEach(function (h) { pages[h.g] = h.p; });
		for (var g in pages) await PD.textLayer(pages[g]);
		var all = [], cur = [];
		hits.forEach(function (h) { var rs = rangesFor(h); all = all.concat(rs); if (h === curHit) cur = rs; });
		F.paint(all, null);
		if (window.Highlight && CSS.highlights) { var hc = new Highlight(); cur.forEach(function (r) { hc.add(r); }); CSS.highlights.set("mes-find-cur", hc); }
		if (scroll && cur[0]) F.reveal(view, cur[0].getBoundingClientRect());
		else if (scroll && curHit) { var el = PD.pageEl(curHit.p); if (el) F.reveal(view, el.getBoundingClientRect()); }
	}
	var paintT = 0;
	function go(h) {
		curHit = h;
		var i = PD.doc.pages.indexOf(h.p); if (i >= 0 && i !== PD.cur) { PD.cur = i; PD.emit("cur"); }
		var el = PD.pageEl(h.p); if (el && !el.querySelector(".pd-tl")) F.reveal(view, el.getBoundingClientRect());
		clearTimeout(paintT); paintT = setTimeout(function () { paintAll(true); }, 0);
	}
	function clear() { curHit = null; F.unpaint(); }
	var bar = F.bar({ mount: wrap, theme: "dark", groupWord: "pages", placeholder: "Find in this PDF…", search: search, go: go, clear: clear,
		onOpen: function () { wrap.hidden = false; $("pd-findbtn").setAttribute("aria-pressed", "true"); },
		onClose: function () { wrap.hidden = true; $("pd-findbtn").setAttribute("aria-pressed", "false"); } });
	function openFind() { if (!PD.doc) { PD.toast("Open a PDF first"); return; } var sel = String(getSelection() || ""); bar.open(sel); }
	$("pd-findbtn").onclick = function () { if (bar.isOpen()) bar.close(); else openFind(); };
	F.keys(root, { open: openFind, next: function () { if (bar.isOpen()) bar.next(); else openFind(); }, prev: function () { if (bar.isOpen()) bar.prev(); else openFind(); }, when: function () { return !!PD.doc; } });
	PD.on("open", function () { if (bar.isOpen()) bar.refresh(false); else clear(); });
	PD.on("layout", function () { if (bar.isOpen() && bar.hits().length) { clearTimeout(paintT); paintT = setTimeout(function () { paintAll(false); }, 60); } });
	/* page box */
	var pb = F.pageBox({ label: "Page", theme: "dark", aria: "Page number: type one and press Enter", onGo: function (n) { PD.goPage(n - 1); } });
	$("pd-pagebox").appendChild(pb.el);
	function syncPage() { pb.set(PD.doc ? PD.cur + 1 : 0, PD.doc ? PD.doc.pages.length : 0); }
	PD.on("cur", syncPage); PD.on("open", syncPage); PD.on("layout", syncPage); PD.on("history", syncPage); syncPage();
})();
