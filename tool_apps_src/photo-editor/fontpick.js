/* MES Photo Editor round 8 -- the font picker (PE.fontButton): a button showing the font in its own face; it opens a searchable list where every font
 * is drawn in itself. Sources: the basic stacks (PE.FONTS), fonts found on this computer (a canvas width probe of ~290 common Windows / Mac / Linux /
 * Office names, so Firefox and Opera users get theirs too; plus queryLocalFonts() in Chrome / Edge behind the "Show all fonts on my computer"
 * button), fonts loaded from a file, and ~530 Google Fonts families. A Google family is fetched only when its row scrolls into view (a tiny preview
 * with just the letters of its name, under a private alias so it never shadows the real font) or when it is picked (the whole family, bold and
 * italic when it has them). Text layers re-render when their font finishes loading; projects keep the family name (PE.ensureFonts on load / undo). */
(function () {
	"use strict";
	var PE = window.PE, F = window.MESFontCat; if (!PE || !F) return;
	var KEY = "mes-photo-editor:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

	/* ---------- which fonts exist ---------- */
	var fonts = null, byName = {};
	function add(name, cat, src, value) { var k = name.toLowerCase(); if (byName[k]) return byName[k]; var f = { name: name, cat: cat, src: src, value: value || F.stack(name, cat) }; byName[k] = f; fonts.push(f); return f; }
	var mctx = null, SAMPLE = "mmmmmmmmmmlli0OoWw@#", BASES = ["monospace", "sans-serif", "serif"], baseW = null;
	function width(f) { mctx.font = f; return mctx.measureText(SAMPLE).width; }
	function installed(name) { if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); baseW = BASES.map(function (b) { return width("72px " + b); }); } for (var i = 0; i < BASES.length; i++) if (Math.abs(width("72px " + F.quote(name) + ", " + BASES[i]) - baseW[i]) > 0.01) return true; return false; }
	function build() {
		if (fonts) return; fonts = [];
		(PE.FONTS || []).forEach(function (x) { var nm = x[1].replace(/ \(yours\)$/, ""), cat = /mono|courier/i.test(x[0]) ? "mono" : /cursive/i.test(x[0]) ? "hand" : /serif/.test(x[0]) && !/sans-serif/.test(x[0]) ? "serif" : /impact/i.test(x[0]) ? "display" : "sans"; add(nm, cat, / \(yours\)$/.test(x[1]) ? "file" : "basic", x[0]); });
		F.LOCAL.forEach(function (x) { if (installed(x[0])) add(x[0], x[1], "local"); });
		(sget().lfonts || []).forEach(function (n) { if (typeof n === "string" && n) add(n, F.guessCat(n), "local"); });
		F.GOOGLE.forEach(function (x) { add(x[0], x[1], "google"); });
	}
	PE.fontList = function () { build(); return fonts; };
	PE.on("fonts", function () { if (!fonts) return; (PE.FONTS || []).forEach(function (x) { if (/ \(yours\)$/.test(x[1])) { var f = add(x[1].replace(/ \(yours\)$/, ""), "sans", "file", x[0]); f.src = "file"; f.value = x[0]; } }); });
	/* Chrome / Edge: every font on the computer (asks for permission once); the names are kept in this browser so the list is there next time */
	function queryLocal() {
		if (!window.queryLocalFonts) { PE.toast("This browser can't list every font. Fonts it can find on your computer are already in the list."); return Promise.resolve(0); }
		return window.queryLocalFonts().then(function (fd) {
			build(); var seen = {}, names = []; fd.forEach(function (d) { if (d.family && !seen[d.family]) { seen[d.family] = 1; names.push(d.family); } });
			var n0 = fonts.length; names.forEach(function (n) { var f = byName[n.toLowerCase()]; if (f && f.src === "google") { f.src = "local"; f.pv = null; } else add(n, F.guessCat(n), "local"); }); sset({ lfonts: names.slice(0, 3000) });
			PE.toast(names.length + " fonts on this computer" + (fonts.length > n0 ? " (" + (fonts.length - n0) + " new in the list)" : "")); return names.length;
		}).catch(function (x) { PE.toast(x && x.name === "NotAllowedError" ? "The browser did not allow it (you can allow fonts in the site settings)" : "Could not read the fonts: " + (x && x.message || x)); return 0; });
	}

	/* ---------- Google Fonts: previews and the real thing ---------- */
	var PV_ABC = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz0123456789 .,:;!?'&-";   // a preview has the letters of a typed sample too
	var pvQ = [], pvBusy = 0, loaded = {}, loading = {};
	function pvAlias(f) { return F.safeFamily("MESpv", f.name); }   // round 10: no spaces / digits (Firefox parses a FontFace family as CSS and threw on "MESpv Press Start 2P")
	/* round 9: every row that shows a font is repainted when its preview arrives (the list may have been rebuilt meanwhile: search, chips), the rows
	 * on screen jump the queue (urgent = true puts them first), and a failed preview is tried once more before the row is marked */
	function previewFont(f, cb, urgent) {
		if (f.src !== "google" || f.pv === "ok" || f.pv === "bad" || loaded[f.name.toLowerCase()]) { cb && cb(); return; }
		if (f.pv === "q") { if (urgent) { var j = -1; for (var i = 0; i < pvQ.length; i++) if (pvQ[i].f === f) { j = i; break; } if (j > 0) pvQ.unshift(pvQ.splice(j, 1)[0]); } return; }
		f.pv = "q"; var job = { f: f, cb: cb }; if (urgent) pvQ.unshift(job); else pvQ.push(job); pump();
	}
	function pump() {
		while (pvBusy < 6 && pvQ.length) (function (job) {
			pvBusy++; var f = job.f, done = function (ok) { pvBusy--; if (!ok && !f.retry) { f.retry = 1; f.pv = "q"; pvQ.push(job); pump(); return; } f.pv = ok ? "ok" : "bad"; if (job.cb) job.cb(); if (pop && pop.repaint) pop.repaint(f); pump(); };
			fetch(F.googleUrls(f.name, f.name + PV_ABC)[0]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (css) {
				var u = F.firstFontUrl(css); if (!u || !window.FontFace) throw new Error("no font"); var ff = new FontFace(pvAlias(f), "url(" + u + ")"); return ff.load().then(function () { document.fonts.add(ff); done(true); });
			}).catch(function () { done(false); });
		})(pvQ.shift());
	}
	/* load a Google family for real (bold / italic too when the family has them); resolves true when it can be drawn */
	PE.loadGoogleFont = function (name) {
		var k = String(name).toLowerCase(); if (loaded[k]) return Promise.resolve(true); if (loading[k]) return loading[k];
		var urls = F.googleUrls(name), i = 0;
		function next() {
			if (i >= urls.length) return Promise.resolve(false); var u = urls[i++];
			return fetch(u).then(function (r) { if (!r.ok) return next(); return r.text().then(function (css) {
				var st = el("style"); st.setAttribute("data-gfont", name); st.textContent = css; document.head.appendChild(st);
				var q = F.quote(name); return Promise.all(["16px " + q, "bold 16px " + q, "italic 16px " + q].map(function (s) { return document.fonts.load(s).catch(function () {}); })).then(function () { return true; });
			}); }).catch(function () { return next(); });
		}
		var cap = new Promise(function (res) { setTimeout(function () { res(false); }, 12000); });   // round 12: a load that hangs counts as failed
		loading[k] = Promise.race([next(), cap]).then(function (ok) { delete loading[k]; if (PE.fontFailed) PE.fontFailed(name, !ok); if (PE.fontForget) PE.fontForget(); if (ok) { loaded[k] = true; } rerender(name); return ok; }); return loading[k];   // round 11: a failed load lets held texts fall back (P.textHold)
	};
	/* a font finished loading: every text layer that uses it is drawn again (no undo step: the text itself did not change) */
	function rerender(name) {
		if (!PE.doc || !PE.renderText) return; var k = name.toLowerCase(), any = false;
		PE.doc.layers.forEach(function (L) { if (L.type === "text" && L.text && F.familyOf(L.text.font).toLowerCase() === k) { L._lay = null; PE.renderText(L); L.rev++; any = true; } });
		if (any) { PE.invalidate(); PE.emit("layers"); }
		document.querySelectorAll(".pe-fbtn").forEach(function (b) { if (b.dataset.fam && b.dataset.fam.toLowerCase() === k) b.style.fontFamily = F.quote(name) + ", sans-serif"; });
	}
	/* round 10: a catch-all for fonts that arrive late (Firefox loads a bold / italic face only when it is first drawn; a project opened before its
	 * fonts): whenever the browser finishes loading font faces, every text layer using one of those families is measured and drawn again */
	if (document.fonts && document.fonts.addEventListener) {
		var lateFams = {}, lateT = 0;
		document.fonts.addEventListener("loadingdone", function (ev) {
			(ev.fontfaces || []).forEach(function (ff) { var n = String(ff.family || "").replace(/^['"]|['"]$/g, "").toLowerCase(); if (n && n.indexOf("mespv") !== 0) lateFams[n] = 1; });
			clearTimeout(lateT); lateT = setTimeout(function () { var fams = lateFams; lateFams = {}; if (!PE.doc || !PE.renderText) return; var any = false;
				PE.doc.layers.forEach(function (L) { if (L.type === "text" && L.text && fams[F.familyOf(L.text.font).toLowerCase()]) { L._lay = null; PE.renderText(L); L.rev++; any = true; } });
				if (any) { PE.invalidate(); PE.invalidateOverlay && PE.invalidateOverlay(); } }, 30);
		});
	}
	/* make sure every Google font used by the text layers is loaded (after opening a project, undo, paste...) */
	var ensureWarned = false;
	PE.ensureFonts = function () {
		if (!PE.doc) return; var seen = {};
		var fileGone = 0; PE.doc.layers.forEach(function (L) { if (L.type === "text" && L.text && /^MESfile/.test(F.familyOf(L.text.font)) && document.fonts && !document.fonts.check("12px " + F.normStack(L.text.font).split(",")[0])) fileGone++; });
		if (fileGone && !ensureWarned) { ensureWarned = true; PE.toast("A text uses a font file you loaded earlier: load the same file again (Text tool → Load font file…) to see it; until then a similar font is shown"); }
		if (PE.opt && PE.opt.text) { var dn = F.familyOf(PE.opt.text.font); if (F.googleCat(dn) && !loaded[dn.toLowerCase()] && !loading[dn.toLowerCase()] && !installed(dn)) PE.loadGoogleFont(dn); }
		PE.doc.layers.forEach(function (L) { if (L.type !== "text" || !L.text) return; var n = F.familyOf(L.text.font), k = n.toLowerCase(); if (seen[k] || loaded[k] || loading[k] || !F.googleCat(n)) return; seen[k] = 1; if (installed(n)) { loaded[k] = true; return; } PE.loadGoogleFont(n); });
	};
	var ensT = 0; PE.on("layers", function () { clearTimeout(ensT); ensT = setTimeout(PE.ensureFonts, 50); });

	function recent() { var r = sget().frecent; return Array.isArray(r) ? r.filter(function (x) { return typeof x === "string"; }) : []; }
	function faceOf(f) { if (f.src === "google" && !loaded[f.name.toLowerCase()]) return f.pv === "ok" ? "'" + pvAlias(f) + "', sans-serif" : null; return f.value; }

	/* ---------- the button in the option bar ---------- */
	PE.fontButton = function (value, onPick, opt) {
		build(); var fam = F.familyOf(value), f = byName[fam.toLowerCase()];
		if (!f) for (var fi = 0; fi < fonts.length; fi++) if (fonts[fi].value === value) { f = fonts[fi]; break; }   // a font file of your own: shown by its file name, not the internal family
		if (f) fam = f.name; else if (/^MESfile/.test(fam)) { var nm2 = F.splitStack(value)[1]; fam = (nm2 && !/^(sans-serif|serif|cursive|monospace)$/.test(nm2) ? nm2 : "Your font") + " (font file: load it again)"; }
		var b = el("button", "pe-fbtn"); b.type = "button"; b.dataset.noico = "1"; b.dataset.fam = fam; b.setAttribute("aria-haspopup", "listbox"); b.title = "Font: " + fam + " (click for the list: search, preview, " + fonts.length + " fonts)";
		b.innerHTML = '<span class="pe-fbtn-n"></span><span class="pe-fbtn-a" aria-hidden="true">▾</span>'; b.firstChild.textContent = fam;
		var setFace = function () { var face = f ? faceOf(f) : value; b.firstChild.style.fontFamily = face || "inherit"; };
		if (f && f.src === "google" && !loaded[f.name.toLowerCase()]) { previewFont(f, setFace); if (PE.doc) PE.loadGoogleFont(f.name); } setFace();
		b.addEventListener("mousedown", function (e) { e.preventDefault(); });
		b.addEventListener("click", function (e) { e.preventDefault(); openPicker(b, value, onPick, opt); });
		return b;
	};

	/* ---------- the list ---------- */
	var pop = null;
	function closePicker() { if (!pop) return; if (pop.unpv) pop.unpv(); pop.el.remove(); document.removeEventListener("pointerdown", pop.out, true); var b = pop.btn; pop = null; if (b && b.isConnected) b.focus({ preventScroll: true }); }
	PE.fontPickerClose = closePicker;
	function openPicker(btn, value, onPick, opt) {
		if (pop) { var same = pop.btn === btn; closePicker(); if (same) return; }
		build(); var ui = sget().fpick || {}, st = { q: "", cat: ui.cat || "all", src: ui.src || "all", hi: 0, list: [], g: ui.g !== false, sort: /^(az|za|src|kind)$/.test(ui.sort || "") ? ui.sort : "", hv: ui.hv !== false, hvF: null };
		var e = el("div", "pe-fpop"); e.setAttribute("role", "dialog"); e.setAttribute("aria-label", "Choose a font"); e.dataset.noico = "1";
		e.innerHTML = '<div class="pe-fp-drag" title="Drag to move this window (double-click: put it back under the button)"><span class="pe-fp-grip" aria-hidden="true">⠿</span><span class="pe-fp-t">Fonts</span><button type="button" class="pe-fp-less" title="Show fewer / more filters">Less</button></div><div class="pe-fp-h"><input type="search" class="pe-fp-q" placeholder="Search ' + fonts.length + ' fonts…" aria-label="Search fonts" autocomplete="off" spellcheck="false"><button type="button" class="pe-fp-x" aria-label="Close" title="Close (Esc)">×</button></div>'
			+ '<div class="pe-fp-chips pe-fp-cats" role="group" aria-label="Kind of font"></div><div class="pe-fp-chips pe-fp-srcs" role="group" aria-label="Where the font comes from"></div>'
			+ '<div class="pe-fp-sample"><label>Sample <input type="text" class="pe-fp-st" maxlength="40" placeholder="(the font name)" aria-label="Sample text shown in every font"></label></div>'
			+ '<div class="pe-fp-list" role="listbox" tabindex="-1" aria-label="Fonts"></div><div class="pe-fp-f"><span class="pe-fp-n"></span><span class="pe-fp-b"></span></div>';
		(PE.els.root || document.body).appendChild(e);
		var gtl = el("label", "pe-fp-gt"), gt = el("input"); gt.type = "checkbox"; gtl.appendChild(gt); gtl.appendChild(document.createTextNode(" Show Google Fonts")); gtl.title = "Untick to list only the fonts on this computer (Google Fonts are downloaded only when you pick one)"; e.querySelector(".pe-fp-sample").appendChild(gtl);
		gt.addEventListener("change", function () { st.g = gt.checked; st.hi = 0; render(); });
		/* round 13: hovering a font (or moving to it with the arrow keys) draws the selected text in it, like Photopea; nothing is kept until you click it */
		var hvl = el("label", "pe-fp-gt"), hvc = el("input"); hvc.type = "checkbox"; hvc.checked = st.hv; hvl.appendChild(hvc); hvl.appendChild(document.createTextNode(" Preview on my text")); hvl.title = "Hover a font to see the selected text in it. Nothing changes until you click a font; moving off the list puts the text back."; hvl.hidden = !(opt && opt.preview); e.querySelector(".pe-fp-sample").appendChild(hvl);
		hvc.addEventListener("change", function () { st.hv = hvc.checked; if (!st.hv) { st.hvF = null; unpreview(); } sset({ fpick: Object.assign({}, sget().fpick || {}, { hv: st.hv }) }); });
		var pv = null, hvT = 0;
		function pvTarget() { if (!opt || !opt.preview || !st.hv || !PE.doc) return null; var L = PE.active(); return L && L.type === "text" && L.text ? L : null; }
		function unpreview() { clearTimeout(hvT); if (!pv) return; var s = pv, L = s.L; pv = null; if (!PE.doc || PE.doc.layers.indexOf(L) < 0) return;
			var o = JSON.parse(s.text); for (var k in o) L.text[k] = o[k]; L.canvas = s.canvas; L.cx = s.cx; L.cy = s.cy; L._pad = s.pad; L._amw = s.amw; L._drawnFont = s.df; L.mask = s.mask; L.crop = s.crop; L._lay = null; L.rev++; PE.invalidate(); }
		function applyPreview(f) {
			if (!f || st.hvF !== f || !pop) return; if (f.value === value) { unpreview(); return; }
			var L = pv ? pv.L : pvTarget(); if (!L) return; var face = faceOf(f);
			if (!face) { if (f.src === "google" && f.pv !== "bad") previewFont(f, function () { applyPreview(f); }, true); return; }
			if (!pv) pv = { L: L, text: JSON.stringify(L.text), canvas: L.canvas, cx: L.cx, cy: L.cy, pad: L._pad, amw: L._amw, df: L._drawnFont, mask: L.mask, crop: L.crop ? JSON.parse(JSON.stringify(L.crop)) : L.crop };
			if (L.text.font === face) return; L.text.font = face; L._lay = null; if (PE.renderText(L) === false) { unpreview(); return; } PE.invalidate();
		}
		function hoverFont(f) { if (!pvTarget() && !pv) return; st.hvF = f; clearTimeout(hvT); hvT = setTimeout(function () { applyPreview(f); }, 50); }
		var sol = el("label", "pe-fp-sort"), so = el("select"); sol.appendChild(document.createTextNode("Order ")); sol.appendChild(so); so.setAttribute("aria-label", "Order of the font list"); so.dataset.native = "1";
		[["", "Suggested (no download first)"], ["az", "A to Z"], ["za", "Z to A"], ["src", "Where it comes from, A to Z"], ["kind", "Kind of font, A to Z"]].forEach(function (o) { var op = el("option"); op.value = o[0]; op.textContent = o[1]; so.appendChild(op); });
		so.value = st.sort; sol.title = "Suggested: fonts that need no download first (search matches first while you type). A to Z / Z to A: by name. Recent keeps the order you used them in unless you pick another order.";
		e.querySelector(".pe-fp-sample").appendChild(sol); so.addEventListener("change", function () { st.sort = so.value; st.hi = 0; render(); });
		var q = e.querySelector(".pe-fp-q"), listEl = e.querySelector(".pe-fp-list"), cnt = e.querySelector(".pe-fp-n"), sampleIn = e.querySelector(".pe-fp-st");
		sampleIn.value = ui.sample || "";
		var cats = e.querySelector(".pe-fp-cats"), srcs = e.querySelector(".pe-fp-srcs");
		F.CATS.forEach(function (c) { var b = el("button", null, esc(c[1])); b.type = "button"; b.dataset.v = c[0]; cats.appendChild(b); });
		[["all", "All"], ["recent", "Recent"], ["local", "On this computer"], ["google", "Google Fonts"]].forEach(function (c) { var b = el("button", null, esc(c[1])); b.type = "button"; b.dataset.v = c[0]; srcs.appendChild(b); });
		var fb = e.querySelector(".pe-fp-b");
		if (window.queryLocalFonts) { var lb = el("button", "pe-btn pe-btn--sm", "Show all fonts on my computer"); lb.type = "button"; lb.title = "Chrome and Edge can list every installed font (the browser asks once)"; lb.addEventListener("click", function () { queryLocal().then(function () { st.src = "local"; render(true); }); }); fb.appendChild(lb); }
		var ff = el("button", "pe-btn pe-btn--sm", "Load a font file…"); ff.type = "button"; ff.title = "Use a .ttf, .otf or .woff file from your computer"; ff.addEventListener("click", function () { closePicker(); PE.pickFontFile && PE.pickFontFile(); }); fb.appendChild(ff);
		// previews only for the rows on screen (and a few around them): measured on render and while scrolling (no IntersectionObserver: it does not run in some background tabs)
		var io = null, scT = 0;
		function scanVisible() { var lr = listEl.getBoundingClientRect(), top = lr.top - 200, bot = lr.bottom + 200, kids = listEl.children, lo = 0, hi = kids.length - 1;
			while (lo < hi) { var mid = (lo + hi) >> 1; if (kids[mid].getBoundingClientRect().bottom < top) lo = mid + 1; else hi = mid; }
			var vis = []; for (var i = lo; i < kids.length; i++) { var r = kids[i], b = r.getBoundingClientRect(); if (b.top > bot) break; if (r._f && r._f.src === "google" && (!r._f.pv || r._f.pv === "q")) vis.push(r._f); }
			for (var k = vis.length - 1; k >= 0; k--) previewFont(vis[k], null, true); }   // in reverse, so the top row ends up first in the queue
		listEl.addEventListener("scroll", function () { clearTimeout(scT); scT = setTimeout(scanVisible, 60); });
		function paintRow(r) { var face = faceOf(r._f); r.firstChild.style.fontFamily = face || "inherit"; r.classList.toggle("is-wait", !face && r._f.pv !== "bad"); r.classList.toggle("is-bad", r._f.pv === "bad"); }
		function pick(f) {
			sset({ frecent: F.pushRecent(recent(), f.value, 12) }); closePicker(); onPick(f.value);
			if (f.src === "google" && !loaded[f.name.toLowerCase()]) { PE.toast("Loading " + f.name + " from Google Fonts…"); PE.loadGoogleFont(f.name).then(function (ok) { if (!ok) PE.toast("Could not load " + f.name + " (offline?): a similar font is used for now"); }); }
		}
		function render(keepScroll) {
			Array.prototype.forEach.call(cats.children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === st.cat ? "true" : "false"); });
			Array.prototype.forEach.call(srcs.children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === st.src ? "true" : "false"); });
			st.list = F.sortFonts(F.filter(fonts, st.q, st.cat, st.src, recent(), { google: st.g }), st.sort); listEl.innerHTML = ""; if (!keepScroll) listEl.scrollTop = 0;
			gt.checked = st.g; gtl.hidden = st.src === "google" || st.src === "recent";
			var cur = F.familyOf(value).toLowerCase(), sample = sampleIn.value.trim(), frag = document.createDocumentFragment();
			var divDone = false;
			st.list.forEach(function (f, i) {
				if (!divDone && f.src === "google" && st.src === "all" && (!st.sort || st.sort === "src") && i > 0) { divDone = true; var dv = el("div", "pe-fp-div"); dv.setAttribute("role", "presentation"); dv.textContent = "Google Fonts (downloaded only when you pick one)"; frag.appendChild(dv); }
				var r = el("div", "pe-frow" + (f.name.toLowerCase() === cur ? " is-cur" : "")); r.setAttribute("role", "option"); r.id = "pe-fr-" + i; r._f = f; r.dataset.i = i;
				var nm = el("span", "pe-frow-s"); nm.textContent = sample || f.name; r.appendChild(nm);
				var meta = el("span", "pe-frow-m"); meta.textContent = (sample ? f.name + " · " : "") + (f.src === "google" ? "Google" : f.src === "file" ? "your file" : f.src === "basic" ? "basic" : "this computer"); r.appendChild(meta);
				r.title = f.name + (f.src === "google" ? " (Google Fonts: loaded when you pick it)" : ""); paintRow(r); frag.appendChild(r);
			});
			listEl.appendChild(frag); if (!st.list.length) listEl.innerHTML = '<div class="pe-fp-none">No font matches. Try another word or "All".</div>';
			cnt.textContent = st.list.length + (st.list.length === 1 ? " font" : " fonts"); st.hi = Math.max(0, Math.min(st.hi, st.list.length - 1)); hilite(false);
			sset({ fpick: { cat: st.cat, src: st.src, sample: sampleIn.value.trim(), g: st.g, sort: st.sort, hv: st.hv } }); setTimeout(scanVisible, 0);
		}
		function hilite(scroll) { Array.prototype.forEach.call(listEl.querySelectorAll(".is-hi"), function (r) { r.classList.remove("is-hi"); r.setAttribute("aria-selected", "false"); }); var r = document.getElementById("pe-fr-" + st.hi); if (r && r._f) { r.classList.add("is-hi"); r.setAttribute("aria-selected", "true"); listEl.setAttribute("aria-activedescendant", r.id); if (scroll) r.scrollIntoView({ block: "nearest" }); } }
		cats.addEventListener("click", function (ev) { var b = ev.target.closest("button"); if (!b) return; st.cat = b.dataset.v; st.hi = 0; render(); q.focus(); });
		srcs.addEventListener("click", function (ev) { var b = ev.target.closest("button"); if (!b) return; st.src = b.dataset.v; st.hi = 0; render(); q.focus(); });
		var qt = 0; q.addEventListener("input", function () { clearTimeout(qt); qt = setTimeout(function () { st.q = q.value; st.hi = 0; render(); }, 60); });
		var stt = 0; sampleIn.addEventListener("input", function () { clearTimeout(stt); stt = setTimeout(function () { render(true); }, 150); });
		listEl.addEventListener("click", function (ev) { var r = ev.target.closest(".pe-frow"); if (r && r._f) pick(r._f); });
		listEl.addEventListener("pointerover", function (ev) { if (ev.pointerType === "touch") return; var r = ev.target.closest(".pe-frow"); if (r && r._f) hoverFont(r._f); });
		listEl.addEventListener("pointerleave", function (ev) { if (ev.pointerType === "touch") return; st.hvF = null; unpreview(); });
		e.addEventListener("keydown", function (ev) {
			ev.stopPropagation(); var n = st.list.length;
			if (ev.key === "Escape") { ev.preventDefault(); closePicker(); }
			else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); if (n) { st.hi = (st.hi + (ev.key === "ArrowDown" ? 1 : -1) + n) % n; hilite(true); hoverFont(st.list[st.hi]); } }
			else if (ev.key === "PageDown" || ev.key === "PageUp") { ev.preventDefault(); if (n) { st.hi = Math.max(0, Math.min(n - 1, st.hi + (ev.key === "PageDown" ? 10 : -10))); hilite(true); hoverFont(st.list[st.hi]); } }
			else if (ev.key === "Enter" && ev.target !== sampleIn) { ev.preventDefault(); if (st.list[st.hi]) pick(st.list[st.hi]); }
		});
		e.querySelector(".pe-fp-x").addEventListener("click", closePicker);
		var out = function (ev) { if (!pop || ev.target.closest(".pe-fpop") || ev.target.closest(".pe-fbtn") === btn) return; closePicker(); };
		document.addEventListener("pointerdown", out, true);
		pop = { el: e, btn: btn, io: io, out: out, unpv: function () { st.hvF = null; unpreview(); }, repaint: function (f) { Array.prototype.forEach.call(listEl.children, function (r) { if (r._f === f) paintRow(r); }); if (st.hvF === f) applyPreview(f); } };
		// place it under the button (fixed, so it works in Full window and full screen too); on a phone it fills the width
		var r = btn.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 16), h = Math.min(420, window.innerHeight - 16);
		e.style.width = w + "px"; e.style.maxHeight = h + "px"; var x = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), y = r.bottom + 4; if (y + 260 > window.innerHeight) y = Math.max(8, window.innerHeight - h - 8);
		e.style.left = x + "px"; e.style.top = y + "px"; e.style.maxHeight = Math.min(h, window.innerHeight - y - 8) + "px";
		// move / resize (round 12: it covered most of the picture and could not be moved). Position and size are remembered (fpos, viewport px).
		var pos = sget().fpos || null, keep = function () { var b = e.getBoundingClientRect(); sset({ fpos: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), less: e.classList.contains("is-less") } }); };
		var fit = function (x, y, w2, h2) { var W = window.innerWidth, H = window.innerHeight; w2 = Math.max(240, Math.min(w2, W - 8)); h2 = Math.max(220, Math.min(h2, H - 8)); x = Math.max(4 - w2 + 80, Math.min(x, W - 80)); y = Math.max(4, Math.min(y, H - 40)); e.style.left = x + "px"; e.style.top = y + "px"; e.style.width = w2 + "px"; e.style.height = h2 + "px"; e.style.maxHeight = "none"; };
		if (pos && pos.w) fit(pos.x, pos.y, pos.w, pos.h);
		if (pos && pos.less) e.classList.add("is-less");
		var lessB = e.querySelector(".pe-fp-less"), setLess = function () { lessB.textContent = e.classList.contains("is-less") ? "More" : "Less"; }; setLess();
		lessB.addEventListener("click", function () { e.classList.toggle("is-less"); setLess(); keep(); });
		var drag = function (handle, resize) {
			handle.addEventListener("pointerdown", function (ev) { if (ev.button || ev.target.closest("button")) return; ev.preventDefault(); var b = e.getBoundingClientRect(), x0 = ev.clientX, y0 = ev.clientY; try { handle.setPointerCapture(ev.pointerId); } catch (_) {}
				var mv = function (m) { var dx = m.clientX - x0, dy = m.clientY - y0; if (resize) fit(b.left, b.top, b.width + dx, b.height + dy); else fit(b.left + dx, b.top + dy, b.width, b.height); };
				var up = function () { handle.removeEventListener("pointermove", mv); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up); keep(); };
				handle.addEventListener("pointermove", mv); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up); });
		};
		var dh = e.querySelector(".pe-fp-drag"); drag(dh, false);
		dh.addEventListener("dblclick", function () { sset({ fpos: null }); var b = btn.getBoundingClientRect(); e.style.height = ""; fit(Math.max(8, Math.min(b.left, window.innerWidth - 348)), b.bottom + 4, 340, Math.min(420, window.innerHeight - b.bottom - 12)); e.style.height = ""; e.style.maxHeight = Math.min(420, window.innerHeight - b.bottom - 12) + "px"; });
		var rz = el("div", "pe-fp-rz"); rz.title = "Drag to make this window bigger or smaller"; rz.setAttribute("aria-hidden", "true"); e.appendChild(rz); drag(rz, true);
		render(); var ci = st.list.findIndex(function (f) { return f.name.toLowerCase() === F.familyOf(value).toLowerCase(); }); if (ci >= 0) { st.hi = ci; hilite(true); }
		q.focus({ preventScroll: true });
	}
	window.addEventListener("resize", function () { if (!pop) return; var b = pop.el.getBoundingClientRect(); if (b.left > window.innerWidth - 80 || b.top > window.innerHeight - 40) closePicker(); });
	window.addEventListener("scroll", function (e) { if (pop && !(e.target && e.target.closest && e.target.closest(".pe-fpop"))) closePicker(); }, true);   // the page scrolled away from the button
})();
