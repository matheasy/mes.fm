/* MES PDF Editor: the model (sources, pages, annotations), library loading, page rendering, annotation painting, history. Global `PD`. */
(function () {
	"use strict";
	var M = window.PDM, PD = window.PD = { M: M, doc: null, zoom: 1, tool: "select", sel: null, cur: 0, dirty: false, images: {}, S: { thumbs: true, win: null }, hooks: {}, clip: null };
	var $ = PD.$ = function (id) { return document.getElementById(id); };
	var KEY = "mes-pdf-editor:v1";
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) { if (sv.thumbs === false) PD.S.thumbs = false; if (sv.win === false) PD.S.win = false; PD.S.prefs = sv.prefs || {}; } } catch (e) {}
	PD.S.prefs = PD.S.prefs || {};
	PD.saveS = function () { try { localStorage.setItem(KEY, JSON.stringify({ thumbs: PD.S.thumbs, win: PD.S.win, prefs: PD.S.prefs })); } catch (e) {} };
	PD.on = function (n, f) { (PD.hooks[n] = PD.hooks[n] || []).push(f); }; PD.emit = function (n, a) { (PD.hooks[n] || []).forEach(function (f) { try { f(a); } catch (e) { console.error(e); } }); };
	PD.toast = function (msg, ms) { var t = $("pd-toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(PD.toast._t); PD.toast._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2200); };
	PD.hint = function (s) { $("pd-hint").textContent = s || ""; };

	/* ---------- libraries (loaded on first use, from cdnjs, pinned) ---------- */
	var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js", PDFLIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
	function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Could not load " + src)); }; document.head.appendChild(s); }); }
	PD.ensureLibs = function () {
		if (!PD._libs) PD._libs = Promise.all([loadScript(PDFJS), loadScript(PDFLIB)]).then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }).catch(function (e) { PD._libs = null; throw e; });
		return PD._libs;
	};
	var dpr = function () { return Math.min(window.devicePixelRatio || 1, 2.5); };

	/* ---------- document model ---------- */
	function pageEntry(src, index, proxy) { var v = proxy.view; return { id: M.newId("p"), src: src, index: index, W: v[2] - v[0], H: v[3] - v[1], x0: v[0], y0: v[1], rot0: proxy.rotate || 0, rot: 0, annots: [], proxy: proxy }; }
	function blankEntry(w, h) { return { id: M.newId("p"), src: -1, index: -1, blank: true, W: w, H: h, x0: 0, y0: 0, rot0: 0, rot: 0, annots: [], proxy: null }; }
	PD.blankPage = blankEntry;
	function askPassword(reason) {
		return new Promise(function (res) {
			PD.dialog('<h3>This PDF is password protected</h3><p class="pd-note">' + (reason === 2 ? "That password was not right. Try again." : "Type the password to open it. It stays in your browser.") + '</p><div class="pd-row"><input type="password" id="pd-pw" autocomplete="off" aria-label="Password"></div><div class="pd-end"><button type="button" class="pd-btn" id="pd-pw-no">Cancel</button><button type="button" class="pd-btn pd-btn--primary" id="pd-pw-ok">Open</button></div>');
			var inp = $("pd-pw"); inp.focus(); function done(v) { PD.closeDialog(); res(v); }
			$("pd-pw-ok").onclick = function () { done(inp.value); }; $("pd-pw-no").onclick = function () { done(null); }; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") done(inp.value); });
		});
	}
	// load a file's bytes as a new source; returns { src index, pages entries }
	PD.loadSource = async function (bytes, name) {
		await PD.ensureLibs();
		var task = window.pdfjsLib.getDocument({ data: bytes.slice(0) });
		task.onPassword = function (update, reason) { askPassword(reason).then(function (pw) { if (pw == null) task.destroy(); else update(pw); }); };
		var pdf = await task.promise, n = pdf.numPages, proxies = [];
		if (n > 800) PD.toast("This PDF has " + n + " pages; it may feel slow.", 4000);
		for (var i = 1; i <= n; i++) proxies.push(await pdf.getPage(i));
		var s = { bytes: bytes, name: name, pdf: pdf, proxies: proxies, locked: false, libDoc: null };
		return s;
	};
	PD.open = async function (file) {
		try {
			PD.busy(true, "Opening " + file.name + "...");
			var bytes = new Uint8Array(await file.arrayBuffer()); if (String.fromCharCode.apply(null, bytes.slice(0, 5)) !== "%PDF-") { var head = String.fromCharCode.apply(null, bytes.slice(0, 1024)); if (head.indexOf("%PDF-") < 0) throw new Error("That does not look like a PDF file."); }
			var s = await PD.loadSource(bytes, file.name);
			PD.doc = { name: file.name, srcs: [s], pages: s.proxies.map(function (p, i) { return pageEntry(0, i, p); }) };
			PD.images = {}; PD.sel = null; PD.cur = 0; PD.dirty = false; PD.hist.reset(PD.snapshot()); PD.layout(true); PD.emit("open");
		} catch (e) { console.error(e); PD.toast((e && e.message) || "Could not open that PDF", 4500); } finally { PD.busy(false); }
	};
	PD.newBlank = async function () { await PD.ensureLibs(); PD.doc = { name: "Untitled.pdf", srcs: [], pages: [blankEntry(612, 792)] }; PD.images = {}; PD.sel = null; PD.cur = 0; PD.dirty = false; PD.hist.reset(PD.snapshot()); PD.layout(true); PD.emit("open"); };
	PD.addPdf = async function (file) {
		if (!PD.doc) return PD.open(file);
		try { PD.busy(true, "Adding pages..."); var bytes = new Uint8Array(await file.arrayBuffer()), s = await PD.loadSource(bytes, file.name), si = PD.doc.srcs.push(s) - 1; s.proxies.forEach(function (p, i) { PD.doc.pages.push(pageEntry(si, i, p)); }); PD.commit(); PD.layout(); PD.toast("Added " + s.proxies.length + (s.proxies.length === 1 ? " page" : " pages")); }
		catch (e) { PD.toast((e && e.message) || "Could not add that PDF", 4500); } finally { PD.busy(false); }
	};
	PD.busy = function (on, msg) { var e = $("pd-st-doc"); if (on) { e._old = e.textContent; e.textContent = msg || "Working..."; document.body.style.cursor = "progress"; } else { if (e._old != null) e.textContent = e._old; document.body.style.cursor = ""; PD.status(); } };
	PD.status = function () { var d = PD.doc; $("pd-st-doc").textContent = d ? d.pages.length + (d.pages.length === 1 ? " page" : " pages") + (PD.dirty ? " · unsaved changes" : "") : "No file"; $("pd-name").textContent = d ? d.name : "No file open"; document.title = (d && PD.dirty ? "* " : "") + (PD._title || (PD._title = document.title.replace(/^\* /, ""))); };
	PD.page = function (id) { return PD.doc ? PD.doc.pages.filter(function (p) { return p.id === id; })[0] : null; };
	PD.vp = function (p, scale) { return new M.Viewport(p.W, p.H, p.x0, p.y0, p.rot0 + p.rot, scale == null ? PD.zoom : scale); };

	/* ---------- history: JSON snapshots of the page list and every annotation ---------- */
	PD.hist = new M.History(80);
	PD.snapshot = function () { return JSON.stringify({ pages: PD.doc ? PD.doc.pages.map(function (p) { return { id: p.id, src: p.src, index: p.index, blank: !!p.blank, W: p.W, H: p.H, x0: p.x0, y0: p.y0, rot0: p.rot0, rot: p.rot, annots: p.annots }; }) : [] }); };
	PD.commit = function () { if (!PD.doc) return; PD.dirty = true; if (PD.hist.push(PD.snapshot())) PD.emit("history"); PD.status(); };
	function restore(snap) {
		if (!snap || !PD.doc) return; var d = JSON.parse(snap), selId = PD.sel && PD.sel.id;
		PD.doc.pages = d.pages.map(function (q) { var p = Object.assign({}, q); p.proxy = q.blank ? null : PD.doc.srcs[q.src].proxies[q.index]; return p; });
		PD.sel = null; if (selId) PD.doc.pages.forEach(function (p) { p.annots.forEach(function (a) { if (a.id === selId) PD.sel = { page: p.id, id: a.id }; }); });
		PD.cur = Math.min(PD.cur, PD.doc.pages.length - 1); PD.dirty = true; PD.layout(); PD.emit("history"); PD.status();
	}
	PD.undo = function () { var s = PD.hist.undo(); if (s) restore(s); }; PD.redo = function () { var s = PD.hist.redo(); if (s) restore(s); };

	/* ---------- text measuring with the real PDF font metrics (so the editor wraps exactly as the export will) ---------- */
	var FONTS = { sans: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"], serif: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"], mono: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"] };
	var CSSF = { sans: 'Helvetica, Arial, "Liberation Sans", sans-serif', serif: '"Times New Roman", Times, "Liberation Serif", serif', mono: '"Courier New", Courier, "Liberation Mono", monospace' };
	PD.fontName = function (a) { return FONTS[a.font || "sans"][(a.bold ? 1 : 0) + (a.italic ? 2 : 0)]; };
	PD.cssFont = function (a, px) { return (a.italic ? "italic " : "") + (a.bold ? "bold " : "") + px + "px " + CSSF[a.font || "sans"]; };
	var mctx = document.createElement("canvas").getContext("2d");
	PD.measure = function (a, str) { mctx.font = PD.cssFont(a, 100); return mctx.measureText(str).width / 100 * (a.size || 12); };   // widths of the standard fonts match their system look-alikes closely; the export wraps with the same function
	PD.layoutText = function (a) {
		var raster = !M.winAnsiOk(a.text || ""), inner = Math.max(8, a.w - M.PAD * 2); a.raster = raster; a.lines = M.wrapLines(a.text || "", inner, function (s) { return PD.measure(a, s); });
		var h = M.textHeight(a.lines.length, a.size); a.y = a.y + a.h - h; a.h = h; return a;   // grows downward: the top edge stays put
	};

	/* ---------- painting annotations (also used to flatten pages) ---------- */
	function poly(ctx, vp, pts) { ctx.beginPath(); pts.forEach(function (p, i) { var v = vp.toView(p[0], p[1]); if (i) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); }); ctx.closePath(); }
	function corners(a) { return [[a.x, a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h]]; }
	PD.image = function (id) { var r = PD.images[id]; if (!r) return null; if (!r.el) { r.el = new Image(); r.el.onload = function () { PD.emit("imgload"); }; r.el.src = r.data; } return r.el.complete && r.el.naturalWidth ? r.el : null; };
	PD.stampPath = function (kind) { return kind === "check" ? [[0.08, 0.55], [0.38, 0.88], [0.94, 0.12]] : kind === "cross" ? null : null; };
	PD.paintAnnot = function (ctx, vp, a, state) {
		var s = vp.scale; ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
		switch (a.t) {
			case "pen": ctx.globalAlpha = a.alpha || 1; ctx.strokeStyle = a.color; ctx.lineWidth = Math.max(0.5, vp.len(a.width)); ctx.beginPath(); a.pts.forEach(function (p, i) { var v = vp.toView(p[0], p[1]); if (i) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); }); if (a.pts.length === 1) { var v0 = vp.toView(a.pts[0][0], a.pts[0][1]); ctx.lineTo(v0[0] + 0.01, v0[1]); } ctx.stroke(); break;
			case "rect": ctx.globalAlpha = a.alpha || 1; poly(ctx, vp, corners(a)); if (a.fill) { ctx.fillStyle = a.fill; ctx.fill(); } if (a.stroke && a.sw > 0) { ctx.strokeStyle = a.stroke; ctx.lineWidth = vp.len(a.sw); ctx.lineJoin = "miter"; ctx.stroke(); } break;
			case "ellipse": ctx.globalAlpha = a.alpha || 1; { var c = vp.toView(a.x + a.w / 2, a.y + a.h / 2), q = vp.rot % 180 === 90; ctx.translate(c[0], c[1]); ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.5, (q ? a.h : a.w) / 2 * s), Math.max(0.5, (q ? a.w : a.h) / 2 * s), 0, 0, Math.PI * 2); } ctx.setTransform ? 0 : 0; if (a.fill) { ctx.fillStyle = a.fill; ctx.fill(); } if (a.stroke && a.sw > 0) { ctx.strokeStyle = a.stroke; ctx.lineWidth = vp.len(a.sw); ctx.stroke(); } break;
			case "line": case "arrow": {
				ctx.strokeStyle = a.color; ctx.lineWidth = vp.len(a.sw); var p1 = vp.toView(a.x1, a.y1), p2 = vp.toView(a.x2, a.y2); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
				if (a.t === "arrow") { var ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = Math.max(8, a.sw * 4); [Math.PI - 0.45, Math.PI + 0.45].forEach(function (d) { var q2 = vp.toView(a.x2 + Math.cos(ang + d) * L, a.y2 + Math.sin(ang + d) * L); ctx.beginPath(); ctx.moveTo(p2[0], p2[1]); ctx.lineTo(q2[0], q2[1]); ctx.stroke(); }); }
				break; }
			case "text": paintText(ctx, vp, a, state); break;
			case "img": { var im = PD.image(a.img); var o = vp.toView(a.x, a.y + a.h); ctx.translate(o[0], o[1]); ctx.rotate(vp.rot * Math.PI / 180); if (im) ctx.drawImage(im, 0, 0, a.w * s, a.h * s); else { ctx.fillStyle = "#ddd"; ctx.fillRect(0, 0, a.w * s, a.h * s); } break; }
			case "stamp": { ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = Math.max(1, a.w * s * 0.13); var P = function (u, v) { return vp.toView(a.x + u * a.w, a.y + (1 - v) * a.h); };
				if (a.kind === "check") { var pts = [[0.1, 0.55], [0.38, 0.85], [0.92, 0.15]].map(function (p) { return P(p[0], p[1]); }); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke(); }
				else if (a.kind === "cross") { var A = P(0.15, 0.15), B = P(0.85, 0.85), C = P(0.85, 0.15), D = P(0.15, 0.85); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.moveTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.stroke(); }
				else { var Cc = P(0.5, 0.5); ctx.beginPath(); ctx.arc(Cc[0], Cc[1], a.w * s * 0.36, 0, Math.PI * 2); ctx.fill(); } break; }
			case "note": { var n0 = vp.toView(a.x, a.y), r = vp.len(9); ctx.fillStyle = a.color || "#ffd54f"; ctx.strokeStyle = "#8a6d00"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(n0[0] + r, n0[1] - r, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#5d4a00"; ctx.fillRect(n0[0] + r * 0.5, n0[1] - r * 1.3, r, r * 0.16); ctx.fillRect(n0[0] + r * 0.5, n0[1] - r * 0.95, r, r * 0.16); ctx.fillRect(n0[0] + r * 0.5, n0[1] - r * 0.6, r * 0.65, r * 0.16); break; }
		}
		ctx.restore();
	};
	function paintText(ctx, vp, a, state) {
		var s = vp.scale, origin = vp.toView(a.x, a.y + a.h);
		if (a.bg) { ctx.save(); poly(ctx, vp, corners(a)); ctx.fillStyle = a.bg; ctx.fill(); ctx.restore(); }
		if (!(a.lines && a.lines.length)) return;
		if (a.raster) { var cv = PD.rasterText(a, Math.max(2, s * 2)); ctx.translate(origin[0], origin[1]); ctx.rotate(vp.rot * Math.PI / 180); ctx.drawImage(cv, 0, 0, a.w * s, a.h * s); return; }
		ctx.translate(origin[0], origin[1]); ctx.rotate(vp.rot * Math.PI / 180); ctx.fillStyle = a.color; ctx.font = PD.cssFont(a, a.size * s); ctx.textBaseline = "alphabetic";
		a.lines.forEach(function (line, i) { var w = PD.measure(a, line), dx = a.align === "center" ? (a.w - w) / 2 : a.align === "right" ? a.w - M.PAD - w : M.PAD; ctx.fillText(line, dx * s, (M.PAD + M.ASCENT * a.size + i * a.size * M.LINE_H) * s); });
	}
	// text with characters the standard PDF fonts cannot show (Cyrillic, Greek, CJK...) is drawn to a picture, in the editor and in the file alike
	PD.rasterText = function (a, k) {
		var cv = document.createElement("canvas"); cv.width = Math.ceil(a.w * k); cv.height = Math.ceil(a.h * k); var c = cv.getContext("2d"); c.fillStyle = a.color; c.font = PD.cssFont(a, a.size * k).replace(CSSF[a.font || "sans"], CSSF[a.font || "sans"] + ', "Noto Sans", "Segoe UI", sans-serif'); c.textBaseline = "alphabetic";
		a.lines.forEach(function (line, i) { var w = c.measureText(line).width / k, dx = a.align === "center" ? (a.w - w) / 2 : a.align === "right" ? a.w - M.PAD - w : M.PAD; c.fillText(line, dx * k, (M.PAD + M.ASCENT * a.size + i * a.size * M.LINE_H) * k); }); return cv;
	};
	PD.paintAll = function (ctx, vp, annots, state) { annots.forEach(function (a) { PD.paintAnnot(ctx, vp, a, state); }); };

	/* ---------- the pages on screen ---------- */
	var pagesEl, io, renderTasks = {};
	PD.pageEl = function (p) { return pagesEl.querySelector('.pd-page[data-id="' + p.id + '"]'); };
	PD.fitWidth = function () { var v = $("pd-view"), p = PD.doc && PD.doc.pages[Math.max(0, PD.cur)]; if (!p) return; var q = (p.rot0 + p.rot) % 180 === 90, w = q ? p.H : p.W; return Math.max(0.2, Math.min(4, (v.clientWidth - 40) / w)); };
	PD.setZoom = function (z, keepCenter) {
		z = Math.max(0.2, Math.min(5, z)); if (Math.abs(z - PD.zoom) < 0.001) return; var v = $("pd-view"), ratio = z / PD.zoom, cy = v.scrollTop + v.clientHeight / 2, cx = v.scrollLeft + v.clientWidth / 2; PD.zoom = z; PD.layout(false, true);
		v.scrollTop = cy * ratio - v.clientHeight / 2; v.scrollLeft = cx * ratio - v.clientWidth / 2; $("pd-zoom").textContent = Math.round(z * 100) + "%";
	};
	PD.layout = function (fresh, zoomOnly) {
		pagesEl = $("pd-pages"); var d = PD.doc; $("pd-empty").hidden = !!d; if (!d) { pagesEl.innerHTML = ""; return; }
		if (fresh) { PD.zoom = 1; var z = PD.fitWidth(); PD.zoom = z || 1; $("pd-zoom").textContent = Math.round(PD.zoom * 100) + "%"; }
		if (io) io.disconnect(); io = new IntersectionObserver(function (es) { es.forEach(function (e) { var p = PD.page(e.target.dataset.id); if (p) { if (e.isIntersecting) { p._vis = true; renderPage(p); } else { p._vis = false; } } }); if (!zoomOnly) {} }, { root: $("pd-view"), rootMargin: "700px 0px" });
		var existing = {}; [].forEach.call(pagesEl.children, function (el) { existing[el.dataset.id] = el; }); var frag = document.createDocumentFragment();
		d.pages.forEach(function (p, i) {
			var vp = PD.vp(p), el = existing[p.id]; delete existing[p.id];
			if (!el) { el = document.createElement("div"); el.className = "pd-page"; el.dataset.id = p.id; el.innerHTML = '<canvas class="pd-c"></canvas><canvas class="pd-o" tabindex="-1"></canvas><span class="pd-pagenum"></span>'; }
			el.style.width = Math.round(vp.width) + "px"; el.style.height = Math.round(vp.height) + "px"; el.querySelector(".pd-pagenum").textContent = i + 1; el.classList.toggle("is-cur", i === PD.cur);
			if (p._rkey !== zkey(p)) p._rendered = false; frag.appendChild(el); io.observe(el);
		});
		pagesEl.innerHTML = ""; pagesEl.appendChild(frag); d.pages.forEach(function (p) { if (!p._rendered) { sizeCanvas(p); } paintOverlay(p); });
		PD.emit("layout");
	};
	function zkey(p) { return PD.zoom.toFixed(3) + "|" + (p.rot0 + p.rot) + "|" + dpr(); }
	function sizeCanvas(p) { var el = PD.pageEl(p); if (!el) return; var vp = PD.vp(p), k = dpr(); [".pd-c", ".pd-o"].forEach(function (s) { var c = el.querySelector(s); c.style.width = Math.round(vp.width) + "px"; c.style.height = Math.round(vp.height) + "px"; if (s === ".pd-o") { c.width = Math.round(vp.width * k); c.height = Math.round(vp.height * k); } }); }
	async function renderPage(p) {
		var el = PD.pageEl(p); if (!el) return; var key = zkey(p); if (p._rendered && p._rkey === key) return; var cv = el.querySelector(".pd-c"), k = dpr(), vp = PD.vp(p);
		if (renderTasks[p.id]) { try { renderTasks[p.id].cancel(); } catch (e) {} }
		var w = Math.round(vp.width * k), h = Math.round(vp.height * k), off = document.createElement("canvas"); off.width = w; off.height = h; var ctx = off.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
		if (!p.blank) {
			try { var pv = p.proxy.getViewport({ scale: PD.zoom * k, rotation: (p.rot0 + p.rot) % 360 }), task = p.proxy.render({ canvasContext: ctx, viewport: pv }); renderTasks[p.id] = task; await task.promise; }
			catch (e) { if (e && e.name === "RenderingCancelledException") return; console.error(e); }
		}
		if (!PD.doc || PD.pageEl(p) !== el) return; cv.width = w; cv.height = h; cv.style.width = Math.round(vp.width) + "px"; cv.style.height = Math.round(vp.height) + "px"; cv.getContext("2d").drawImage(off, 0, 0); p._rendered = true; p._rkey = key; paintOverlay(p); PD.emit("rendered", p);
	}
	PD.renderPage = renderPage;
	// the page's own colour near a point, for the whiteout under edited text
	PD.sampleColor = function (p, x, y, w, h) {
		var el = PD.pageEl(p); if (!el || !p._rendered) return "#ffffff"; var cv = el.querySelector(".pd-c"), vp = PD.vp(p), k = cv.width / vp.width, a = vp.toView(x, y), b = vp.toView(x + w, y + h), ctx = cv.getContext("2d"), pts = [[Math.min(a[0], b[0]) - 3, Math.min(a[1], b[1]) - 3], [Math.max(a[0], b[0]) + 3, Math.min(a[1], b[1]) - 3], [Math.min(a[0], b[0]) - 3, Math.max(a[1], b[1]) + 3], [Math.max(a[0], b[0]) + 3, Math.max(a[1], b[1]) + 3]], r = 0, g = 0, bl = 0, n = 0;
		pts.forEach(function (q) { try { var d = ctx.getImageData(Math.max(0, Math.round(q[0] * k)), Math.max(0, Math.round(q[1] * k)), 1, 1).data; r += d[0]; g += d[1]; bl += d[2]; n++; } catch (e) {} }); return n ? M.rgbToHex(r / n, g / n, bl / n) : "#ffffff";
	};
	PD.selAnnot = function () { if (!PD.sel || !PD.doc) return null; var p = PD.page(PD.sel.page); if (!p) return null; for (var i = 0; i < p.annots.length; i++) if (p.annots[i].id === PD.sel.id) return p.annots[i]; return null; };
	// corner handles of the selected annotation in view pixels: { name: [px, py] }
	PD.handles = function (p, a, vp) {
		if (!a) return null; if (a.t === "line" || a.t === "arrow") return { p1: vp.toView(a.x1, a.y1), p2: vp.toView(a.x2, a.y2) };
		if (a.t === "pen" || a.t === "note" || a.t === "stamp" && false) return null; if (a.t === "note") return null;
		return { sw: vp.toView(a.x, a.y), se: vp.toView(a.x + a.w, a.y), ne: vp.toView(a.x + a.w, a.y + a.h), nw: vp.toView(a.x, a.y + a.h) };
	};
	function paintOverlay(p) {
		var el = PD.pageEl(p); if (!el) return; var cv = el.querySelector(".pd-o"), k = cv.width / (parseFloat(cv.style.width) || 1) || dpr(), ctx = cv.getContext("2d"), vp = PD.vp(p);
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(k, 0, 0, k, 0, 0);
		PD.paintAll(ctx, vp, p.annots); if (p._live) PD.paintAnnot(ctx, vp, p._live);
		var a = PD.sel && PD.sel.page === p.id ? PD.selAnnot() : null;
		if (a && !p._hideSel) {
			ctx.save(); ctx.strokeStyle = "#2f80ff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
			var b = M.bbox(a), pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(function (q) { return vp.toView(q[0], q[1]); }); ctx.beginPath(); pts.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
			var hs = PD.handles(p, a, vp); if (hs) Object.keys(hs).forEach(function (n) { ctx.beginPath(); ctx.rect(hs[n][0] - 5, hs[n][1] - 5, 10, 10); ctx.fill(); ctx.stroke(); }); ctx.restore();
			if (a.t === "note" && a.text) { var o = vp.toView(a.x + 20, a.y); ctx.save(); ctx.font = "12px sans-serif"; var tw = Math.min(220, ctx.measureText(a.text).width + 14); ctx.fillStyle = "#fff8d6"; ctx.strokeStyle = "#8a6d00"; ctx.fillRect(o[0], o[1] - 40, tw, 26); ctx.strokeRect(o[0], o[1] - 40, tw, 26); ctx.fillStyle = "#333"; ctx.fillText(a.text.slice(0, 40) + (a.text.length > 40 ? "..." : ""), o[0] + 7, o[1] - 23); ctx.restore(); }
		}
	}
	PD.paintOverlay = paintOverlay; PD.repaint = function (p) { if (p) paintOverlay(p); else if (PD.doc) PD.doc.pages.forEach(paintOverlay); };
	PD.on("imgload", function () { PD.repaint(); });
	PD.zoomTo = function (z) { PD.setZoom(z); };
	/* the current page = the one at the middle of the view */
	PD.trackCurrent = function () {
		if (!PD.doc) return; var v = $("pd-view"), mid = v.getBoundingClientRect().top + v.clientHeight / 2, best = PD.cur, bd = 1e9;
		[].forEach.call(pagesEl.children, function (el, i) { var r = el.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid); if (r.top <= mid && r.bottom >= mid) { bd = -1; best = i; } else if (bd >= 0 && d < bd) { bd = d; best = i; } });
		if (best !== PD.cur) { PD.cur = best; [].forEach.call(pagesEl.children, function (el, i) { el.classList.toggle("is-cur", i === best); }); PD.emit("cur"); }
	};
	PD.goPage = function (i) { var el = pagesEl && pagesEl.children[i]; if (el) { el.scrollIntoView({ block: "start", behavior: "smooth" }); PD.cur = i; PD.emit("cur"); } };

	/* ---------- annotation helpers ---------- */
	PD.addAnnot = function (p, a, noSelect) { a.id = a.id || M.newId("a"); p.annots.push(a); if (!noSelect) PD.sel = { page: p.id, id: a.id }; PD.repaint(p); return a; };
	PD.removeSel = function () { var a = PD.selAnnot(); if (!a) return; var p = PD.page(PD.sel.page); p.annots = p.annots.filter(function (x) { return x.id !== a.id; }); PD.sel = null; PD.repaint(p); PD.commit(); PD.emit("sel"); };
	PD.select = function (p, a) { var old = PD.sel && PD.page(PD.sel.page); PD.sel = a ? { page: p.id, id: a.id } : null; if (old) PD.repaint(old); if (p) PD.repaint(p); PD.emit("sel"); };

	/* ---------- dialogs ---------- */
	PD.dialog = function (html, onClose) { var m = $("pd-modal"), d = $("pd-dlg"); d.innerHTML = html; m.hidden = false; PD._onClose = onClose || null; };
	PD.closeDialog = function () { var m = $("pd-modal"); m.hidden = true; $("pd-dlg").innerHTML = ""; if (PD._onClose) { var f = PD._onClose; PD._onClose = null; f(); } };
	$("pd-modal").addEventListener("mousedown", function (e) { if (e.target === this && !PD.noBackdropClose) PD.closeDialog(); });
	window.addEventListener("beforeunload", function (e) { if (PD.dirty) { e.preventDefault(); e.returnValue = ""; } });
})();
