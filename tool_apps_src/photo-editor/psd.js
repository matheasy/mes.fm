/* MES Photo Editor round 9 -- a PSD as the working file. Open a .psd, edit, and Save writes back into that same .psd (Chrome / Edge / Opera:
 * File System Access API, like the linked .mesproj), or Save as a new PSD once and keep saving to it. Without that API (Firefox, Safari, Brave by
 * default) every Save is a download: the name gets a version number (header-v2.psd, header-v3.psd) instead of the browser's " (1)", or, if the
 * person prefers, the same name every time for a browser that asks where to save (pick Replace there).
 * Text layers made here stay editable through a PSD: their text, font and position are written into the PSD's XMP metadata (with a fingerprint of
 * the pixels), and read back when the pixels are unchanged; a text Photoshop changed opens as pixels. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel; if (!PE || !P) return;
	var KEY = "mes-photo-editor:v1", BRAVE_FLAG = "brave://flags/#file-system-access-api";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function el(t, c, h) { return PE.el(t, c, h); }
	function esc(s) { return PE.esc(s); }
	function canPicker() { return typeof window.showSaveFilePicker === "function"; }
	function isBrave() { return !!(navigator.brave && typeof navigator.brave.isBrave === "function"); }
	function errText(x) { return x && x.message ? x.message : String(x); }
	var edits = 0; PE.on("history", function () { edits++; });

	/* ---------- the link: {doc, handle (or null = downloads), name, base, n (version for downloads), lm, savedAt, savedEdits, conflict} ---------- */
	var link = null;
	function cur() { if (link && link.doc !== PE.doc) link = null; return link; }
	PE.psdLink = cur;
	PE.linkPsd = function (h, name, info) {
		info = info || {}; if (!PE.doc) return; var nv = P.nameVersion(h ? h.name : name || (PE.doc.name || "image") + ".psd");
		link = { doc: PE.doc, handle: h || null, name: h ? h.name : name, base: nv.base, n: nv.n, lm: info.lm || 0, savedAt: 0, savedEdits: edits, opened: !!info.opened };
		if (h && !link.lm && h.getFile) { var my = link; h.getFile().then(function (f) { if (link === my && !my.lm) my.lm = f.lastModified; }).catch(function () {}); }
		PE.emit("psdlink"); if (PE.saveState) PE.saveState();
	};
	/* Save (Ctrl / Cmd + S) goes to the PSD when the picture came from one (or was saved as one) and no .mesproj is linked */
	PE.psdHome = function () { return !!cur() && !(PE.projectLink && PE.projectLink()); };
	PE.psdDirty = function () { var L = cur(); return !!(L && edits !== L.savedEdits); };
	PE.psdWhere = function () { var L = cur(); return L ? (L.handle ? L.name : "Downloads (" + nextDownloadName(L) + " next)") : ""; };

	/* ---------- writing the PSD ---------- */
	var PSD_LIB = "https://cdn.jsdelivr.net/npm/ag-psd@30.1.1/dist/bundle.js";
	function lib() { return new Promise(function (res, rej) { if (window.agPsd) return res(window.agPsd); PE.toast("Loading PSD support…"); var s = document.createElement("script"); s.src = PSD_LIB; s.onload = function () { window.agPsd ? res(window.agPsd) : rej(new Error("PSD library failed")); }; s.onerror = function () { rej(new Error("Could not load the PSD library (offline?)")); }; document.head.appendChild(s); }); }
	PE.psdLib = lib;
	function sigOf(c) { try { var d = c.getContext("2d").getImageData(0, 0, c.width, c.height); return P.pixelSig(d.data, c.width, c.height); } catch (e) { return ""; } }
	/* the whole document as PSD bytes; text layers keep their text in the XMP */
	PE.psdBlob = function () {
		return lib().then(function (ag) {
			var d = PE.doc; if (PE.flushPending) PE.flushPending();
			var t = PE.psdTree(), nodes = t.nodes || [], nFx = t.nFx, meta = []; delete t.nFx; delete t.nodes; t.canvas = PE.flatten();
			nodes.forEach(function (pr, i) { var L = pr[0], o = pr[1]; if (L.type === "text" && L.text) meta.push({ i: i, name: L.name, sig: sigOf(o.canvas), text: JSON.parse(JSON.stringify(L.text)), cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, pad: L._pad, amw: L._amw }); });
			if (meta.length) t.imageResources.xmpMetadata = P.psdXmp(P.psdMetaEncode(meta));
			var buf = ag.writePsd(t, { generateThumbnail: false }), n = d.layers.filter(function (L) { return !PE.isGroup(L); }).length;
			return { blob: new Blob([buf], { type: "image/vnd.adobe.photoshop" }), layers: n, fx: nFx, texts: meta.length };
		});
	};
	/* after reading a PSD: our text layers (by position, name and unchanged pixels) */
	PE.psdTextMeta = function (psd) { var x = psd && psd.imageResources && psd.imageResources.xmpMetadata; if (!x || x.indexOf("mes-photo-editor") < 0) return {}; var by = {}; P.psdMetaDecode(x).forEach(function (m) { by[m.i] = m; }); return by; };
	PE.psdTextLayer = function (m, n) {
		if (!m || !n || !n.canvas || (m.name && n.name && m.name !== n.name)) return null; if (sigOf(n.canvas) !== m.sig) return null;
		var L = PE.makeLayer({ type: "text", name: n.name || m.name || "Text", text: Object.assign(JSON.parse(JSON.stringify(PE.TEXTDEF)), m.text), w: 4, h: 4 });
		if (m.pad != null) { L._pad = m.pad; L._amw = m.amw; } PE.renderText(L); L.cx = +m.cx; L.cy = +m.cy; L.sx = +m.sx || 1; L.sy = +m.sy || 1; L.rot = +m.rot || 0; L.rev++; return L;
	};

	function ensurePerm(h, ask) { var o = { mode: "readwrite" }; if (!h.queryPermission) return Promise.resolve(true); return h.queryPermission(o).then(function (p) { return p === "granted" ? true : ask ? h.requestPermission(o).then(function (q) { return q === "granted"; }) : false; }); }
	function writeHandle(h, blob) { return h.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }, function (e) { try { w.abort(); } catch (x) {} throw e; }); }); }
	var saving = null;
	function done(L, e0, where, r) {
		L.savedAt = Date.now(); L.savedEdits = e0; if (!(PE.projectLink && PE.projectLink())) PE.dirty = edits !== e0 ? PE.dirty : false;
		PE.toast("Saved " + where + " (" + r.layers + " layer" + (r.layers === 1 ? "" : "s") + (r.texts ? ", " + r.texts + " text" + (r.texts === 1 ? "" : "s") + " still editable here" : "") + ")");
		PE.emit("psdlink"); if (PE.saveState) PE.saveState();
	}
	/* Save: into the linked PSD; no link yet = Save as */
	PE.savePsdNow = function () {
		if (!PE.doc) { PE.toast("Open or create an image first"); return Promise.resolve(false); }
		var L = cur(); if (!L) return PE.savePsdAs();
		if (!L.handle) return downloadPsd(L);
		if (saving) return saving; var h = L.handle, e0 = edits;
		saving = ensurePerm(h, true).then(function (ok) {
			if (!ok) { PE.toast("The browser did not allow saving to " + L.name + ": use Save as a new PSD… to pick a place"); return false; }
			return h.getFile().then(function (f) {
				if (L.lm && P.diskChanged(L.lm, f.lastModified)) return askChanged(L);
				return "mine";
			}).then(function (ch) {
				if (ch === "copy") return PE.savePsdAs();
				if (ch !== "mine") return false;
				return PE.psdBlob().then(function (r) { return writeHandle(h, r.blob).then(function () { return h.getFile(); }).then(function (f2) { L.lm = f2.lastModified; done(L, e0, "to " + L.name, r); return true; }); });
			});
		}).catch(function (x) { PE.toast("Could not save " + L.name + ": " + errText(x)); return false; }).then(function (r) { saving = null; return r; });
		return saving;
	};
	function askChanged(L) {
		return new Promise(function (res) {
			var w = el("div", "pe-xcf-notes"); w.innerHTML = "<p><b>" + esc(L.name) + "</b> was changed by another program (or on another computer) after you opened it here.</p><p>Replace it with what you have here, or keep both by saving yours as a new file?</p>";
			var fin = false, end = function (m, v) { if (fin) return; fin = true; m.close(); res(v); };
			PE.modal({ title: "The PSD changed", body: w, onClose: function () { if (!fin) { fin = true; res("cancel"); } }, buttons: [{ label: "Cancel", act: function (m) { end(m, "cancel"); } }, { label: "Save mine as a new file…", act: function (m) { end(m, "copy"); } }, { label: "Replace it with mine", primary: true, act: function (m) { end(m, "mine"); } }] });
		});
	}
	/* Save as a new PSD: pick the place once (the file is linked, later Saves go there); without the API it is a download */
	PE.savePsdAs = function () {
		if (!PE.doc) { PE.toast("Open or create an image first"); return Promise.resolve(false); }
		var L = cur(), base = L ? L.base : (window.MESImg ? window.MESImg.cleanFileName(PE.doc.name) : PE.doc.name) || "image";
		if (!canPicker()) { if (!L) { PE.linkPsd(null, base + ".psd", {}); L = cur(); L.n = 0; } return downloadPsd(L); }
		var e0 = edits, dh = PE.folderHandle && PE.folderHandle(), o = { suggestedName: (L && L.handle ? P.versionedName(L.base, "psd", L.n + 1) : base + ".psd"), id: "mes-photo-psd", types: [{ description: "Photoshop file", accept: { "image/vnd.adobe.photoshop": [".psd"] } }] };
		if (L && L.handle) o.startIn = L.handle; else if (dh) o.startIn = dh;
		var pick = function (opt) { return window.showSaveFilePicker(opt).catch(function (x) { if (x && x.name === "TypeError" && opt.startIn) { var o2 = Object.assign({}, opt); delete o2.startIn; return window.showSaveFilePicker(o2); } throw x; }); };
		return pick(o).then(function (h) {
			return PE.psdBlob().then(function (r) { return writeHandle(h, r.blob).then(function () { return h.getFile(); }).then(function (f) { PE.linkPsd(h, h.name, { lm: f.lastModified }); var N = cur(); done(N, e0, "as " + h.name + " (" + PE.modKey() + "S now saves to it)", r); return true; }); });
		}).catch(function (x) { if (x && x.name === "AbortError") return false; PE.toast("Could not save the PSD: " + errText(x)); return false; });
	};

	/* ---------- downloads: the browser cannot write into the file you opened, so name each save clearly ---------- */
	function nameMode() { return sget().psdName === "same" ? "same" : "ver"; }
	function nextDownloadName(L) { return nameMode() === "same" ? L.base + ".psd" : P.versionedName(L.base, "psd", Math.max(L.opened ? 2 : 1, L.n + 1)); }
	function downloadPsd(L) {
		var go = function () {
			var e0 = edits, nm = nextDownloadName(L);
			return PE.psdBlob().then(function (r) { PE.download(r.blob, nm); if (nameMode() === "ver") L.n = P.nameVersion(nm).n; done(L, e0, nm + " to your Downloads", r); return true; }).catch(function (x) { PE.toast("Could not save the PSD: " + errText(x)); return false; });
		};
		if (sget().psdDlSeen || PE._psdExplained) return go();   // explained once per visit (or never again, if ticked)
		return explain(L).then(function (ok) { if (ok) PE._psdExplained = true; return ok ? go() : false; });
	}
	function explain(L) {
		return new Promise(function (res) {
			var br = isBrave(), w = el("div", "pe-xcf-notes pe-psdsave"), v = P.versionedName(L.base, "psd", Math.max(L.opened ? 2 : 1, L.n + 1));
			w.innerHTML = "<p>This browser can't write into a file on your computer, so <b>each Save downloads the PSD</b>. Pick how it is named:</p>"
				+ '<label class="pe-psdsave-o"><input type="radio" name="pe-psdnm" value="ver"' + (nameMode() === "ver" ? " checked" : "") + "> <span><b>" + esc(v) + "</b>, then <b>" + esc(P.versionedName(L.base, "psd", Math.max(L.opened ? 2 : 1, L.n + 1) + 1)) + "</b>…<br><small>A new numbered copy each time: the highest number is the newest. Delete old ones whenever you like.</small></span></label>"
				+ '<label class="pe-psdsave-o"><input type="radio" name="pe-psdnm" value="same"' + (nameMode() === "same" ? " checked" : "") + "> <span><b>" + esc(L.base) + ".psd</b> every time<br><small>Best when your browser asks where to save each file (Firefox: Settings → General → Files and Applications → “Always ask you where to save files”): choose the old file and press <b>Replace</b>. Otherwise the browser adds (1), (2)… to the name.</small></span></label>"
				+ "<p><small>To open a saved PSD again: File → Open, or drop it on the editor. Text you typed here stays editable.</small></p>"
				+ (br ? "<p><small>Brave can save straight into the same file if you switch on <b>" + BRAVE_FLAG + "</b> (then reopen this page).</small></p>" : "<p><small>Chrome, Edge and Opera save straight back into the same file, no downloads.</small></p>")
				+ '<label class="pe-check"><input type="checkbox" id="pe-psdnoask"> Don\'t show this again</label>';
			var fin = false, end = function (m, ok) { if (fin) return; fin = true; var r = w.querySelector('input[name="pe-psdnm"]:checked'); if (ok && r) sset({ psdName: r.value }); if (ok && w.querySelector("#pe-psdnoask").checked) sset({ psdDlSeen: true }); m.close(); res(ok); };
			PE.modal({ title: "Save the PSD", body: w, onClose: function () { if (!fin) { fin = true; res(false); } }, buttons: [{ label: "Cancel", act: function (m) { end(m, false); } }, { label: "Download the PSD", primary: true, act: function (m) { end(m, true); } }] });
		});
	}
	PE.psdNameMode = nameMode;
})();
