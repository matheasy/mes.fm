/* MES PDF Editor: export with pdf-lib (text and shapes stay vector), flatten mode (pages become pictures), print. Uses PD. */
(function () {
	"use strict";
	var PD = window.PD, M = PD.M, $ = PD.$;
	var STD = { "Helvetica": "Helvetica", "Helvetica-Bold": "HelveticaBold", "Helvetica-Oblique": "HelveticaOblique", "Helvetica-BoldOblique": "HelveticaBoldOblique", "Times-Roman": "TimesRoman", "Times-Bold": "TimesRomanBold", "Times-Italic": "TimesRomanItalic", "Times-BoldItalic": "TimesRomanBoldItalic", "Courier": "Courier", "Courier-Bold": "CourierBold", "Courier-Oblique": "CourierOblique", "Courier-BoldOblique": "CourierBoldOblique" };
	function dataBytes(url) { var b = atob(url.split(",")[1]), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
	function col(L, hex) { var c = M.hexToRgb(hex); return L.rgb(c[0], c[1], c[2]); }

	async function vector() {
		var L = window.PDFLib, out = await L.PDFDocument.create(), src = {}, fonts = {}, imgs = {};
		async function getSrc(i) { if (!src[i]) src[i] = await L.PDFDocument.load(PD.doc.srcs[i].bytes, { updateMetadata: false }); return src[i]; }
		async function font(a) { var n = PD.fontName(a); if (!fonts[n]) fonts[n] = await out.embedFont(L.StandardFonts[STD[n]]); return fonts[n]; }
		async function image(id) { if (!imgs[id]) { var d = PD.images[id].data, b = dataBytes(d); imgs[id] = /^data:image\/png/.test(d) ? await out.embedPng(b) : await out.embedJpg(b); } return imgs[id]; }
		async function pngImage(canvas) { var d = canvas.toDataURL("image/png"); return out.embedPng(dataBytes(d)); }
		for (var pi = 0; pi < PD.doc.pages.length; pi++) {
			var p = PD.doc.pages[pi], page;
			if (p.blank) page = out.addPage([p.W, p.H]); else { var s = await getSrc(p.src), cp = await out.copyPages(s, [p.index]); page = out.addPage(cp[0]); }
			if (p.rot) page.setRotation(L.degrees((((page.getRotation().angle + p.rot) % 360) + 360) % 360));
			for (var ai = 0; ai < p.annots.length; ai++) await draw(L, out, page, p.annots[ai], font, image, pngImage);
			if (pi % 8 === 7) await new Promise(function (r) { setTimeout(r, 0); });
		}
		out.setProducer("MES PDF Editor (mes.fm/pdf)"); out.setModificationDate(new Date());
		return out.save();
	}
	async function draw(L, out, page, a, font, image, pngImage) {
		var O = function (v) { return v == null ? 1 : v; };
		switch (a.t) {
			case "pen": {
				if (a.pts.length === 1) { page.drawCircle({ x: a.pts[0][0], y: a.pts[0][1], size: a.width / 2, color: col(L, a.color), opacity: O(a.alpha) }); break; }
				var d = "M " + a.pts.map(function (q) { return q[0].toFixed(2) + " " + (-q[1]).toFixed(2); }).join(" L ");
				page.drawSvgPath(d, { x: 0, y: 0, borderColor: col(L, a.color), borderWidth: a.width, borderOpacity: O(a.alpha), borderLineCap: L.LineCapStyle.Round }); break; }
			case "rect": { var o = { x: a.x, y: a.y, width: a.w, height: a.h }; if (a.fill) { o.color = col(L, a.fill); o.opacity = O(a.alpha); } if (a.stroke && a.sw > 0) { o.borderColor = col(L, a.stroke); o.borderWidth = a.sw; } if (a.fill || (a.stroke && a.sw > 0)) page.drawRectangle(o); break; }
			case "ellipse": { var e = { x: a.x + a.w / 2, y: a.y + a.h / 2, xScale: a.w / 2, yScale: a.h / 2 }; if (a.fill) { e.color = col(L, a.fill); e.opacity = O(a.alpha); } if (a.stroke && a.sw > 0) { e.borderColor = col(L, a.stroke); e.borderWidth = a.sw; } if (a.fill || (a.stroke && a.sw > 0)) page.drawEllipse(e); break; }
			case "line": case "arrow": {
				var c = col(L, a.color), seg = function (x1, y1, x2, y2) { page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: a.sw, color: c, lineCap: L.LineCapStyle.Round }); }; seg(a.x1, a.y1, a.x2, a.y2);
				if (a.t === "arrow") { var ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), len = Math.max(8, a.sw * 4); [Math.PI - 0.45, Math.PI + 0.45].forEach(function (dd) { seg(a.x2, a.y2, a.x2 + Math.cos(ang + dd) * len, a.y2 + Math.sin(ang + dd) * len); }); } break; }
			case "text": {
				if (a.bg) page.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: col(L, a.bg) });
				if (!(a.lines && a.lines.length)) break;
				if (a.raster) { var img = await pngImage(PD.rasterText(a, 3)); page.drawImage(img, { x: a.x, y: a.y, width: a.w, height: a.h }); break; }
				var f = await font(a), top = a.y + a.h;
				a.lines.forEach(function (line, i) { var t = line.replace(/\t/g, "    "), w = f.widthOfTextAtSize(t, a.size), dx = a.align === "center" ? (a.w - w) / 2 : a.align === "right" ? a.w - M.PAD - w : M.PAD; if (t) page.drawText(t, { x: a.x + dx, y: top - M.PAD - M.ASCENT * a.size - i * a.size * M.LINE_H, size: a.size, font: f, color: col(L, a.color) }); }); break; }
			case "img": { var im = await image(a.img); page.drawImage(im, { x: a.x, y: a.y, width: a.w, height: a.h }); break; }
			case "stamp": {
				var sc = col(L, a.color), th = Math.max(1, a.w * 0.13), P2 = function (u, v) { return { x: a.x + u * a.w, y: a.y + v * a.h }; }, ln = function (p1, p2) { page.drawLine({ start: p1, end: p2, thickness: th, color: sc, lineCap: L.LineCapStyle.Round }); };
				if (a.kind === "check") { ln(P2(0.1, 0.45), P2(0.38, 0.15)); ln(P2(0.38, 0.15), P2(0.92, 0.85)); } else if (a.kind === "cross") { ln(P2(0.15, 0.85), P2(0.85, 0.15)); ln(P2(0.85, 0.85), P2(0.15, 0.15)); } else page.drawCircle({ x: a.x + a.w / 2, y: a.y + a.h / 2, size: a.w * 0.36, color: sc }); break; }
			case "note": {
				var rgb = M.hexToRgb(a.color || "#ffd54f"), ctx = out.context, annot = ctx.obj({ Type: "Annot", Subtype: "Text", Rect: [a.x, a.y - 18, a.x + 18, a.y], Contents: L.PDFHexString.fromText(a.text || ""), T: L.PDFHexString.fromText("Comment"), Name: "Comment", C: rgb, F: 4 }), ref = ctx.register(annot), arr = page.node.Annots();
				if (arr) arr.push(ref); else page.node.set(L.PDFName.of("Annots"), ctx.obj([ref])); break; }
		}
	}
	// flatten: every page becomes a picture (hidden text under covers is gone, file is bigger, text is no longer selectable)
	async function flatten(dpi, onProgress) {
		var L = window.PDFLib, out = await L.PDFDocument.create(), scale = dpi / 72, q = dpi >= 200 ? 0.9 : dpi >= 150 ? 0.86 : 0.8;
		for (var i = 0; i < PD.doc.pages.length; i++) {
			var p = PD.doc.pages[i], vp = PD.vp(p, scale), cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
			if (!p.blank) await p.proxy.render({ canvasContext: ctx, viewport: p.proxy.getViewport({ scale: scale, rotation: (p.rot0 + p.rot) % 360 }) }).promise;
			PD.paintAll(ctx, vp, p.annots);
			var blob = await new Promise(function (r) { cv.toBlob(r, "image/jpeg", q); }), bytes = new Uint8Array(await blob.arrayBuffer()), img = await out.embedJpg(bytes), page = out.addPage([vp.width / scale, vp.height / scale]); page.drawImage(img, { x: 0, y: 0, width: vp.width / scale, height: vp.height / scale }); cv.width = cv.height = 1;
			if (onProgress) onProgress(i + 1, PD.doc.pages.length); await new Promise(function (r) { setTimeout(r, 0); });
		}
		out.setProducer("MES PDF Editor (mes.fm/pdf)"); return out.save();
	}
	PD.exportBytes = async function (opts, onProgress) {
		await PD.ensureLibs(); if (opts.flatten) return { bytes: await flatten(opts.dpi || 150, onProgress), flattened: true };
		try { return { bytes: await vector(), flattened: false }; }
		catch (e) { console.error(e); var enc = /encrypt/i.test(String(e && (e.name + e.message))); PD.toast(enc ? "This PDF is password protected, so the edited copy is saved as flattened pages." : "Could not keep the original page content, so the copy is saved as flattened pages.", 5000); return { bytes: await flatten(opts.dpi || 150, onProgress), flattened: true }; }
	};
	function save(bytes, name) { var blob = new Blob([bytes], { type: "application/pdf" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 20000); }
	PD.exportDialog = function () {
		if (!PD.doc) return PD.toast("Open a PDF first"); PD.endEdit();
		var hasBlack = PD.doc.pages.some(function (p) { return p.annots.some(function (a) { return a.t === "rect" && /^#0{6}$/.test(a.fill || "") && !a.alpha; }); }), hasCover = PD.doc.pages.some(function (p) { return p.annots.some(function (a) { return a.t === "rect" && a.fill && !a.alpha && !a.stroke; }); });
		PD.dialog('<h3>Download your PDF</h3><div class="pd-row"><input type="text" id="pd-x-name" aria-label="File name" value="' + M.esc(M.editedName(PD.doc.name)) + '"></div>' + (hasBlack ? '<p class="pd-note pd-warn"><b>You have black cover boxes.</b> They hide text on screen, but the words are still inside the file unless you flatten it.</p>' : hasCover ? '<p class="pd-note">Cover boxes hide what is under them on screen. To remove the hidden text from the file, flatten it.</p>' : "") + '<label class="pd-chk"><input type="checkbox" id="pd-x-flat" ' + (hasBlack ? "checked" : "") + '><span><b>Flatten pages</b> (removes hidden text, so redactions are permanent; the file gets bigger and its text can no longer be selected)</span></label><div class="pd-row" id="pd-x-q" ' + (hasBlack ? "" : "hidden") + '><label class="pd-note">Quality <select id="pd-x-dpi" style="width:auto"><option value="100">Small (100 dpi)</option><option value="150" selected>Standard (150 dpi)</option><option value="220">High (220 dpi)</option></select></label></div><div class="pd-note" id="pd-x-st"></div><div class="pd-end"><button type="button" class="pd-btn" id="pd-x-no">Cancel</button><button type="button" class="pd-btn pd-btn--primary" id="pd-x-go">Download</button></div>');
		var flat = $("pd-x-flat"); flat.onchange = function () { $("pd-x-q").hidden = !flat.checked; }; $("pd-x-no").onclick = PD.closeDialog;
		$("pd-x-go").onclick = async function () {
			var name = ($("pd-x-name").value || "document.pdf").trim(); if (!/\.pdf$/i.test(name)) name += ".pdf"; $("pd-x-go").disabled = true; var st = $("pd-x-st");
			try { st.textContent = "Building the PDF..."; var r = await PD.exportBytes({ flatten: flat.checked, dpi: +$("pd-x-dpi").value }, function (i, n) { st.textContent = "Rendering page " + i + " of " + n + "..."; }); save(r.bytes, name); PD.dirty = false; PD.status(); PD.closeDialog(); PD.toast("Downloaded " + name + " (" + M.formatBytes(r.bytes.length) + ")", 3500); }
			catch (e) { console.error(e); st.textContent = "Something went wrong: " + ((e && e.message) || e); $("pd-x-go").disabled = false; }
		};
	};
	PD.printPdf = async function () {
		if (!PD.doc) return PD.toast("Open a PDF first"); PD.endEdit(); var win = window.open("", "_blank"); try { PD.toast("Preparing to print..."); var r = await PD.exportBytes({ flatten: false }), url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" })); if (win) { win.location.href = url; } else { var a = document.createElement("a"); a.href = url; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove(); } setTimeout(function () { URL.revokeObjectURL(url); }, 120000); }
		catch (e) { if (win) win.close(); PD.toast("Could not prepare the PDF for printing", 4000); }
	};
})();
