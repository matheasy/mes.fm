/* MES Photo Editor round 13: several documents open at once (tabs) + a style / layer clipboard that works across tabs and reloads.
 * - Each tab keeps its own document, undo history, selection, linked project / PSD file, zoom and unsaved flag. The tab that is shown lives in the
 *   usual globals (PE.doc, PE.hist, PE.sel, PE.dirty, the links in projects.js / psd.js); the others are parked in their tab record. Switching = park + restore.
 * - core.js calls PE.beforeNewDoc(pid) whenever a document is about to replace PE.doc (New image, Open picture / PSD / GIMP / project, Recent...):
 *   the open document is parked in its tab and the new one gets a new tab, except an untouched "New image" (replaced, like a browser's empty tab) and
 *   the same project reloaded ("Open theirs"), which stay in their tab.
 * - Layer style clipboard = {fx, adj, opacity, blend} in localStorage, so it survives tab switches AND reloads (the subscriber's report: "I can only have one
 *   file open at a time, and the copied style is lost when I refresh to move to the other file").
 * - Layer clipboard = several layers / whole groups (transforms, text, masks, crops, styles kept; text stays editable), in memory + IndexedDB ("layerclip").
 *   Move / Copy layers to another tab. */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel; if (!PE || !P) return;
	var el = function (t, c, h) { return PE.el(t, c, h); }, esc = function (s) { return PE.esc(s); };
	var tabs = [], cur = null, seq = 0, strip = null;
	var isMac = /Mac|iPhone|iPad/.test(navigator.platform), MOD = isMac ? "⌘" : "Ctrl+", SK = isMac ? "⌃⌥" : "Ctrl+Alt+";   // ⌘⌥C opens the browser's inspector on a Mac: Control+Option there
	PE.styleKey = function (k) { return SK + k; };

	/* ---------- tab records ---------- */
	function mk() { return { id: ++seq }; }
	function liveDirty() { return !!(PE.doc && PE.dirty && PE.hist.stack.length > 1); }
	function tabDirty(t) { return t === cur ? liveDirty() : !!(t.doc && t.dirty && t.stack && t.stack.length > 1); }
	function tabDoc(t) { return t === cur ? PE.doc : t.doc; }
	function park(t) {
		if (!t) return; var v = PE.view;
		t.doc = PE.doc; t.stack = PE.hist.stack; t.idx = PE.hist.idx; t.sel = PE.sel; t.dirty = PE.dirty;
		t.link = PE.projectLink ? PE.projectLink() : null; t.psd = PE.psdLink ? PE.psdLink() : null; t.psdDirty = PE.psdDirty ? PE.psdDirty() : false;
		t.view = { zoom: v.zoom, px: v.px, py: v.py, w: v.w, h: v.h, fit: !!PE.autoFit };
	}
	function restore(t) {
		PE.doc = t.doc || null; PE.hist.stack = t.stack || []; PE.hist.idx = t.idx == null ? -1 : t.idx; PE.sel = t.sel || null; if (PE.sel) PE.sel.ver = ++PE.selSeq; PE.dirty = !!t.dirty;
		if (PE.setProjectLink) PE.setProjectLink(t.link || null); if (PE.setPsdLink) PE.setPsdLink(t.psd || null, t.psdDirty);
		if (PE.doc) PE.relink();
		if (PE.setMulti) PE.setMulti([]);
		PE.emit("sel"); PE.emit("history"); PE.emit("layers"); PE.emit("comps"); PE.emit("active"); PE.emit("docsize");
		var v = PE.view, s = t.view;
		if (PE.doc) { if (!s || s.fit || s.w !== v.w || s.h !== v.h) PE.fit(); else { PE.autoFit = false; v.zoom = s.zoom; v.px = s.px; v.py = s.py; PE.emit("view"); } }
		if (PE.toolId && /^(crop|layercrop|text)$/.test(PE.toolId)) PE.setTool("move");
		PE.invalidate(); if (PE.invalidateOverlay) PE.invalidateOverlay(); if (PE.saveState) PE.saveState();
	}
	function canLeave() { if (PE.pointerBusy && PE.pointerBusy()) return false; if (PE.modalOpen && PE.modalOpen()) return false; return true; }
	function settle() {   // finish what is going on in the shown tab before it is parked
		PE.flushPending(); var tl = PE.tool && PE.tool(); if (tl && tl.cancel) { try { tl.cancel(); } catch (e) {} } if (PE.flushAutosave) PE.flushAutosave();
	}
	/* a "New image" nobody has touched yet: opening a file replaces it instead of keeping an empty tab around */
	function pristine() { var H = PE.hist; return !!PE.doc && H.stack.length === 1 && H.stack[0].label === "New document" && !PE.doc.file && !(PE.projectLink && PE.projectLink()) && !PE.dirty; }
	PE.beforeNewDoc = function (pid) {
		if (!PE.doc) { if (!cur) { cur = mk(); tabs.push(cur); } setTimeout(draw, 0); return; }
		if (pid && PE.doc.pid === pid) return;   // the same project read again (Open theirs, reopen): same tab
		var fresh = false;
		if (pid) tabs.slice().forEach(function (t) { if (t !== cur && t.doc && t.doc.pid === pid) { if (tabDirty(t)) fresh = true; else tabs.splice(tabs.indexOf(t), 1); } });
		if (pristine()) { setTimeout(draw, 0); return fresh ? "fresh" : undefined; }
		settle(); park(cur); var t = mk(); tabs.splice(tabs.indexOf(cur) + 1, 0, t); cur = t;
		if (PE.setProjectLink) PE.setProjectLink(null); if (PE.setPsdLink) PE.setPsdLink(null);   // the new document starts without a file link
		if (PE.setMulti) PE.setMulti([]);
		setTimeout(draw, 0); return fresh ? "fresh" : undefined;
	};
	PE.tabs = function () { return tabs.slice(); };
	PE.tabCurrent = function () { return cur; };
	PE.tabName = function (t) { var d = tabDoc(t); return d ? d.name || "Untitled" : "Empty"; };
	PE.switchTab = function (t) {
		if (!t || t === cur || tabs.indexOf(t) < 0) return true; if (!canLeave()) { PE.toast("Finish what you are doing first (close the dialog / let go of the mouse)"); return false; }
		settle(); park(cur); cur = t; restore(t); draw(); return true;
	};
	PE.closeTab = function (t) {
		t = t || cur; if (!t || tabs.indexOf(t) < 0) return;
		if (t === cur && !canLeave()) return;
		if (tabDirty(t) && !window.confirm("Close “" + PE.tabName(t) + "”?\n\nIt has changes that are not saved in a project file. The last autosave stays in File → Open recent.")) return;
		var i = tabs.indexOf(t);
		if (t !== cur) { tabs.splice(i, 1); draw(); return; }
		settle(); tabs.splice(i, 1); cur = null;
		var nx = tabs[i] || tabs[i - 1];
		if (nx) { cur = nx; restore(nx); } else restore({});
		draw();
	};
	PE.newTab = function () { PE.dlgNew(); };
	function step(d) { if (tabs.length < 2) return; var i = tabs.indexOf(cur); PE.switchTab(tabs[(i + d + tabs.length) % tabs.length]); }
	PE.stepTab = step;
	/* reopening a recent project that is already open just shows its tab */
	var _openRecent = PE.openRecent;
	if (_openRecent) PE.openRecent = function (e) {
		var t = e && tabs.filter(function (x) { var d = tabDoc(x); return d && d.pid === e.id; })[0];
		if (t) { PE.switchTab(t); PE.toast("“" + PE.tabName(t) + "” is already open in a tab"); return Promise.resolve(); }
		return _openRecent.apply(this, arguments);
	};
	window.addEventListener("beforeunload", function (e) { if (window.__mesCloudLeaving) return; if (tabs.some(function (t) { return t !== cur && tabDirty(t); })) { e.preventDefault(); e.returnValue = ""; } });

	/* ---------- the tab strip ---------- */
	function draw() {
		strip = strip || document.getElementById("pe-tabs"); if (!strip) return;
		var show = tabs.length > 0 && !!PE.doc; strip.hidden = !show; if (!show) { strip.innerHTML = ""; return; }
		var focused = strip.contains(document.activeElement) ? document.activeElement.getAttribute("data-tab") : null;
		strip.innerHTML = "";
		var list = el("div", "pe-tabl"); list.setAttribute("role", "tablist"); list.setAttribute("aria-label", "Open pictures and projects"); strip.appendChild(list);
		tabs.forEach(function (t) {
			var d = tabDoc(t), on = t === cur, dirty = tabDirty(t), w = el("div", "pe-tab" + (on ? " is-on" : "") + (dirty ? " is-dirty" : ""));
			var b = el("button", "pe-tab-b", '<span class="pe-tab-n">' + esc(PE.tabName(t)) + '</span><span class="pe-tab-dot" aria-hidden="true"></span>');
			b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; b.setAttribute("data-tab", String(t.id));
			var lk = on ? (PE.projectLink && PE.projectLink()) : t.link;
			b.title = PE.tabName(t) + (d ? " · " + d.w + " × " + d.h : "") + (lk ? " · " + lk.name : "") + (dirty ? " · unsaved changes" : "") + "\nRight-click: move / copy layers here, rename, close";
			b.addEventListener("click", function () { PE.switchTab(t); });
			b.addEventListener("auxclick", function (e) { if (e.button === 1) { e.preventDefault(); PE.closeTab(t); } });
			b.addEventListener("dblclick", function () { if (t === cur) renameTab(); });
			b.addEventListener("contextmenu", function (e) { e.preventDefault(); tabMenu(t, e.clientX, e.clientY); });
			b.addEventListener("keydown", function (e) {
				var i = tabs.indexOf(t), j = -1;
				if (e.key === "ArrowRight") j = (i + 1) % tabs.length; else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length; else if (e.key === "Home") j = 0; else if (e.key === "End") j = tabs.length - 1;
				else if (e.key === "Delete") { e.preventDefault(); PE.closeTab(t); return; } else return;
				e.preventDefault(); e.stopPropagation(); if (PE.switchTab(tabs[j])) { var nb = strip.querySelector('[data-tab="' + tabs[j].id + '"]'); if (nb) nb.focus(); }
			});
			var x = el("button", "pe-tab-x", "✕"); x.type = "button"; x.tabIndex = -1; x.title = "Close " + PE.tabName(t); x.setAttribute("aria-label", "Close " + PE.tabName(t));
			x.addEventListener("click", function (e) { e.stopPropagation(); PE.closeTab(t); });
			w.appendChild(b); w.appendChild(x); list.appendChild(w);
		});
		var add = el("button", "pe-tab-add", "＋"); add.type = "button"; add.title = "New image or open another picture / project in a new tab"; add.setAttribute("aria-label", "New tab");
		add.addEventListener("click", function () { var r = add.getBoundingClientRect(); PE.popMenu([{ label: "New image…", act: function () { PE.dlgNew(); } }, { label: "Open picture / PSD / project…", act: function () { PE.pickOpen(); } }, { label: "Open recent…", act: function () { PE.dlgRecent(); } }, "-", { label: "New image from the copied layers", dis: !hasLayerClip(), act: pasteAsNewDoc }], r.left, r.bottom + 2); });
		strip.appendChild(add);
		if (focused) { var fb = strip.querySelector('[data-tab="' + focused + '"]'); if (fb) fb.focus(); }
		var on = strip.querySelector(".pe-tab.is-on"); if (on && on.scrollIntoView && list.scrollWidth > list.clientWidth) { var lr = list.getBoundingClientRect(), orr = on.getBoundingClientRect(); if (orr.left < lr.left || orr.right > lr.right) list.scrollLeft += orr.left - lr.left - 20; }
	}
	PE.drawTabs = draw;
	var dq = 0; function soon() { if (dq) return; dq = setTimeout(function () { dq = 0; draw(); }, 30); }
	PE.on("history", soon); PE.on("docsize", soon); PE.on("psdlink", soon);
	function renameTab() {
		var d = PE.doc; if (!d) return; var v = window.prompt("Name of this picture / project:", d.name || "Untitled"); if (v == null) return; v = v.trim(); if (!v || v === d.name) return;
		d.name = v; PE.dirty = true; if (PE.saveState) PE.saveState(); if (PE.rememberProject) PE.rememberProject({}); draw();
	}
	function tabMenu(t, x, y) {
		var on = t === cur, others = tabs.filter(function (o) { return o !== cur; }), n = pickedRoots().length;
		var items = [];
		if (!on) {
			items.push({ label: "Show this tab", act: function () { PE.switchTab(t); } });
			items.push({ label: "Move " + (n > 1 ? n + " selected layers" : "the selected layer") + " here", dis: !n, act: function () { moveLayersTo(t, true); } });
			items.push({ label: "Copy " + (n > 1 ? n + " selected layers" : "the selected layer") + " here", dis: !n, act: function () { moveLayersTo(t, false); } });
			items.push("-");
		} else items.push({ label: "✎ Rename", act: renameTab });
		items.push({ label: "Close", act: function () { PE.closeTab(t); } });
		if (others.length && on) items.push({ label: "Close the other tabs", act: function () { closeOthers(); } });
		PE.popMenu(items, x, y);
	}
	function closeOthers() {
		var list = tabs.filter(function (o) { return o !== cur; }), dirty = list.filter(tabDirty);
		if (dirty.length && !window.confirm(dirty.length + " of the other tabs " + (dirty.length > 1 ? "have" : "has") + " changes that are not saved in a project file. Close them anyway? (Their last autosave stays in File → Open recent.)")) return;
		tabs = [cur]; draw();
	}
	/* drop files on the tab strip = open them in new tabs (a drop on the picture adds them as layers) */
	function wireStrip() {
		strip = document.getElementById("pe-tabs"); if (!strip) return;
		strip.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); strip.classList.add("is-drop"); } });
		strip.addEventListener("dragleave", function () { strip.classList.remove("is-drop"); });
		strip.addEventListener("drop", function (e) { strip.classList.remove("is-drop"); if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); PE.openFiles(e.dataTransfer.files, { how: "drop" }); });
		strip.addEventListener("wheel", function (e) { var l = strip.querySelector(".pe-tabl"); if (l && Math.abs(e.deltaY) > Math.abs(e.deltaX) && l.scrollWidth > l.clientWidth) { l.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireStrip); else wireStrip();

	/* ---------- layer style clipboard (survives tab switches and reloads) ---------- */
	var SKEY = "mes-photo-editor:style";
	function clone(o) { return o == null ? null : JSON.parse(JSON.stringify(o)); }
	function readStyle() { try { var s = JSON.parse(localStorage.getItem(SKEY) || "null"); return s && typeof s === "object" ? s : null; } catch (e) { return null; } }
	function styleText(s) { var a = []; if (s.fx && PE.hasFx({ fx: s.fx })) a.push("layer style"); if (s.adj && P.adjAny && P.adjAny(s.adj)) a.push("colour adjustments"); if (s.opacity != null && s.opacity < 1) a.push("opacity " + Math.round(s.opacity * 100) + "%"); if (s.blend && s.blend !== "source-over") a.push("blend mode"); return a.length ? a.join(", ") : "plain style (no effects)"; }
	PE.styleOf = function (L) { return { fx: clone(L.fx), adj: clone(L.adj), opacity: L.opacity == null ? 1 : L.opacity, blend: L.blend || "source-over" }; };
	PE.copyLayerStyle = function (L) {
		L = L || PE.active(); if (!L) { PE.toast("Select a layer first"); return; } if (PE.isGroup(L)) { PE.toast("Select a layer (not a group) to copy its style"); return; }
		var s = PE.styleOf(L); s.name = L.name; s.t = Date.now();
		try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { PE.toast("Could not keep the style (browser storage is full)"); return; }
		PE.toast("Copied the style of “" + L.name + "” (" + styleText(s) + "). Paste it on any layer, in any tab, even after a reload: " + SK + "V");
	};
	PE.hasStyleClip = function () { return !!readStyle(); };
	PE.styleClipText = function () { var s = readStyle(); return s ? "“" + (s.name || "a layer") + "”: " + styleText(s) : ""; };
	PE.pasteLayerStyle = function (L) {
		var s = readStyle(); if (!s) { PE.toast("Copy a style first: right-click a layer → Copy layer style (" + SK + "C)"); return; }
		if (!PE.doc) { PE.toast("Open an image first"); return; }
		var picked = PE.multi && PE.multi().length > 1 ? PE.multi() : [L || PE.active()], set = [];
		picked.forEach(function (x) { if (!x) return; (PE.isGroup(x) ? PE.descendants(x) : [x]).forEach(function (y) { if (!PE.isGroup(y) && set.indexOf(y) < 0) set.push(y); }); });
		var locked = set.filter(function (y) { return y.locked; }).length; set = set.filter(function (y) { return !y.locked; });
		if (!set.length) { PE.toast(locked ? "That layer is locked" : "Select a layer first"); return; }
		set.forEach(function (y) { y.fx = clone(s.fx); y.adj = clone(s.adj); y.opacity = s.opacity == null ? 1 : +s.opacity; y.blend = s.blend || "source-over"; });
		PE.invalidate(); PE.commit("Paste layer style"); PE.emit("layers"); PE.emit("active");
		PE.toast("Pasted the style of “" + (s.name || "a layer") + "” on " + (set.length > 1 ? set.length + " layers" : "“" + set[0].name + "”") + (locked ? " (" + locked + " locked layer" + (locked > 1 ? "s" : "") + " left alone)" : ""));
	};

	/* ---------- layer clipboard (several layers / groups), in memory + IndexedDB ---------- */
	var KEYS = ["name", "type", "cx", "cy", "sx", "sy", "rot", "visible", "opacity", "blend", "locked", "collapsed", "_pad", "_amw", "_drawnFont", "maskOff"];
	var JKEYS = ["text", "eq", "shape", "crop", "fx", "adj", "src"];
	var LC = null, lcRec = null, lcLoaded = false;
	function idb(fn) { return new Promise(function (res, rej) { var r = indexedDB.open("mes-photo-editor", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result; var st = db.transaction("kv", "readwrite").objectStore("kv"); Promise.resolve(fn(st)).then(res, rej); }; r.onerror = function () { rej(r.error); }; }); }
	function rq(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	try { idb(function (st) { return rq(st.get("layerclip")); }).then(function (r) { lcLoaded = true; if (r && r.items && !LC) lcRec = r; }).catch(function () { lcLoaded = true; }); } catch (e) { lcLoaded = true; }
	function hasLayerClip() { return !!(LC || lcRec); }
	PE.hasLayerClip = hasLayerClip;
	/* the selected layers, groups counted once (a layer inside a picked group comes with its group) */
	function pickedRoots() {
		if (!PE.doc) return []; var m = PE.multi ? PE.multi() : [], list = m.length > 1 ? m : (PE.active() ? [PE.active()] : []);
		return list.filter(function (L) { for (var p = L._p; p; p = p._p) if (list.indexOf(p) >= 0) return false; return true; });
	}
	function blockList(roots) { var set = new Set(); roots.forEach(function (R) { PE.blockOf(R).forEach(function (x) { set.add(x); }); }); return PE.doc.layers.filter(function (x) { return set.has(x); }); }
	function snapItem(L) {
		var m = {}; KEYS.forEach(function (k) { if (L[k] !== undefined) m[k] = L[k]; }); JKEYS.forEach(function (k) { if (L[k]) m[k] = clone(L[k]); });
		var c = PE.mk(L.canvas.width, L.canvas.height); c.getContext("2d").drawImage(L.canvas, 0, 0); var mk2 = null; if (L.mask) { mk2 = PE.mk(L.mask.width, L.mask.height); mk2.getContext("2d").drawImage(L.mask, 0, 0); }
		return { id: L.id, group: L.group || null, meta: m, canvas: c, mask: mk2 };
	}
	function makeClip(roots) { var list = blockList(roots); return { t: Date.now(), w: PE.doc.w, h: PE.doc.h, from: PE.doc.name || "Untitled", n: roots.length, items: list.map(snapItem) }; }
	function toBlob(c) { return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/png"); }); }
	function saveClip(clip) {
		var jobs = clip.items.map(function (it) { return Promise.all([toBlob(it.canvas), it.mask ? toBlob(it.mask) : null]).then(function (bs) { return { id: it.id, group: it.group, meta: it.meta, png: bs[0], mask: bs[1] }; }); });
		Promise.all(jobs).then(function (items) { if (LC !== clip) return; var rec = { t: clip.t, w: clip.w, h: clip.h, from: clip.from, n: clip.n, items: items }; return idb(function (st) { return rq(st.put(rec, "layerclip")); }); }).catch(function () {});
	}
	function loadClip() {
		if (LC) return Promise.resolve(LC); if (!lcRec) return Promise.resolve(null);
		var rec = lcRec;
		return Promise.all(rec.items.map(function (it) {
			var dec = function (b) { if (!b) return Promise.resolve(null); return createImageBitmap(b).then(function (bm) { var c = PE.mk(bm.width, bm.height); c.getContext("2d").drawImage(bm, 0, 0); return c; }); };
			return Promise.all([dec(it.png), dec(it.mask)]).then(function (cs) { return { id: it.id, group: it.group, meta: it.meta, canvas: cs[0], mask: cs[1] }; });
		})).then(function (items) { LC = { t: rec.t, w: rec.w, h: rec.h, from: rec.from, n: rec.n, items: items, newest: false }; return LC; });
	}
	PE.copyLayers = function (quiet) {
		if (!PE.doc) { PE.toast("Open an image first"); return null; } var roots = pickedRoots(); if (!roots.length) { PE.toast("Select a layer first"); return null; }
		LC = makeClip(roots); LC.newest = true; lcRec = null; saveClip(LC);
		if (!quiet) PE.toast("Copied " + (roots.length > 1 ? roots.length + " layers" : PE.isGroup(roots[0]) ? "the group “" + roots[0].name + "”" : "“" + roots[0].name + "”") + ". Paste in any tab: " + MOD + "V (or Layer → Paste layers)");
		return LC;
	};
	PE.layerClipNewest = function () { return !!(LC && LC.newest); };
	PE.layerClipOld = function () { if (LC) LC.newest = false; };   // a picture / single layer was copied since (app.js)
	/* put the clip's layers into the shown document, above the active layer, in its group. Same canvas size = same spot, else the same spot
	 * relative to the centre. Returns the new top-level layers. */
	function insertClip(clip, label) {
		var d = PE.doc; if (!d || !clip || !clip.items.length) return [];
		var dx = clip.w === d.w ? 0 : (d.w - clip.w) / 2, dy = clip.h === d.h ? 0 : (d.h - clip.h) / 2, map = {}, made = [];
		clip.items.forEach(function (it) {
			if (!it.canvas) return; var m = it.meta, L = PE.makeLayer({ canvas: it.canvas === null ? null : cloneC(it.canvas), type: m.type, name: m.name, text: m.text ? clone(m.text) : null });
			KEYS.forEach(function (k) { if (m[k] !== undefined) L[k] = m[k]; }); JKEYS.forEach(function (k) { if (m[k]) L[k] = clone(m[k]); });
			if (L.src) L.src = Object.assign({}, L.src, { copy: true }); L.mask = it.mask ? cloneC(it.mask) : null; L.cx += dx; L.cy += dy;
			map[it.id] = L; made.push({ L: L, g: it.group });
		});
		var A = PE.active(), at = A ? d.layers.indexOf(A) + 1 : d.layers.length, parent = A ? A.group || null : null;
		made.forEach(function (o) { o.L.group = o.g && map[o.g] ? map[o.g].id : parent; });
		var list = made.map(function (o) { return o.L; }); Array.prototype.splice.apply(d.layers, [at, 0].concat(list));
		var roots = list.filter(function (L) { return L.group === parent; }); d.activeId = roots[roots.length - 1].id; PE.relink();
		PE.commit(label || ("Paste " + (roots.length > 1 ? roots.length + " layers" : "layer"))); if (PE.setMulti) PE.setMulti(roots.length > 1 ? roots.map(function (L) { return L.id; }) : []);
		PE.emit("layers"); PE.invalidate(); if (PE.setTool) PE.setTool("move"); return roots;
	}
	function cloneC(c) { var n = PE.mk(c.width, c.height); n.getContext("2d").drawImage(c, 0, 0); return n; }
	PE.pasteLayers = function () {
		if (!PE.doc) { pasteAsNewDoc(); return; }
		if (!hasLayerClip()) { PE.toast("Copy layers first: select them and press " + MOD + "C (or Layer → Copy layers)"); return; }
		loadClip().then(function (clip) { if (!clip) { PE.toast("Nothing to paste"); return; } var r = insertClip(clip); if (r.length) PE.toast("Pasted " + (r.length > 1 ? r.length + " layers" : "“" + r[0].name + "”") + " from “" + clip.from + "”"); }).catch(function () { PE.toast("Could not read the copied layers"); });
	};
	/* a new tab the size of the copied layers' picture */
	function pasteAsNewDoc() {
		if (!hasLayerClip()) { PE.toast("Copy layers first (select them, " + MOD + "C)"); return; }
		loadClip().then(function (clip) { if (!clip) return; if (!PE.newDoc(clip.w, clip.h, null, (clip.from || "Untitled") + " (copy)")) return; var d = PE.doc, blank = d.layers[0]; insertClip(clip, "Paste layers"); d.layers = d.layers.filter(function (L) { return L !== blank; }); PE.relink(); PE.commit("New image from copied layers"); PE.historyStartHere(); PE.fit(); PE.emit("layers"); });
	}
	PE.pasteAsNewDoc = pasteAsNewDoc;
	/* Move / Copy the selected layers into another tab (the target tab is shown afterwards) */
	function moveLayersTo(t, move) {
		if (!t || t === cur) return; var roots = pickedRoots(); if (!roots.length) { PE.toast("Select the layers to " + (move ? "move" : "copy") + " first"); return; }
		var lockedRoot = move && roots.some(function (L) { return L.locked; }); if (lockedRoot) { PE.toast("A selected layer is locked: unlock it to move it (or copy it instead)"); return; }
		PE.flushPending(); var clip = makeClip(roots), name = PE.tabName(t), from = PE.doc.name || "Untitled";
		if (move) {
			var d = PE.doc, gone = new Set(blockList(roots)); d.layers = d.layers.filter(function (L) { return !gone.has(L); });
			if (!d.layers.length) d.layers.push(PE.makeLayer({ name: "Layer 1" })); d.activeId = d.layers[d.layers.length - 1].id; PE.relink(); if (PE.setMulti) PE.setMulti([]);
			PE.commit("Move " + (roots.length > 1 ? roots.length + " layers" : "layer") + " to “" + name + "”");
		}
		if (!PE.switchTab(t)) return;
		var r = insertClip(clip, (move ? "Move in " : "Copy in ") + (roots.length > 1 ? roots.length + " layers" : "layer") + " from “" + from + "”");
		PE.toast((move ? "Moved " : "Copied ") + (r.length > 1 ? r.length + " layers" : "“" + (r[0] && r[0].name) + "”") + " here from “" + from + "”" + (move ? " (Undo in each tab puts it back)" : ""));
	}
	PE.moveLayersTo = moveLayersTo;
	/* menu helpers for app.js */
	PE.tabTargets = function () { return tabs.filter(function (t) { return t !== cur; }).map(function (t) { return { t: t, name: PE.tabName(t) }; }); };
	PE.layerTabItems = function () {
		var o = PE.tabTargets(), items = [];
		o.forEach(function (x) { items.push({ label: "Move to “" + x.name + "”", act: function () { moveLayersTo(x.t, true); } }); });
		o.forEach(function (x) { items.push({ label: "Copy to “" + x.name + "”", act: function () { moveLayersTo(x.t, false); } }); });
		return items;
	};
	/* Layer → Move layers to… : a small chooser */
	PE.dlgMoveLayers = function (move) {
		var o = PE.tabTargets(); if (!o.length) { PE.toast("Open another picture or project first (File → Open, or ＋ next to the tabs): the layers move into that tab"); return; }
		if (!pickedRoots().length) { PE.toast("Select the layers first (Ctrl-click to pick several)"); return; }
		var w = el("div", "pe-fx"); w.appendChild(el("p", "pe-hint2", (move ? "Move" : "Copy") + " the selected layers into:"));
		var m; o.forEach(function (x) { var b = el("button", "pe-btn pe-tabpick", esc(x.name)); b.type = "button"; b.addEventListener("click", function () { m.close(); moveLayersTo(x.t, move); }); w.appendChild(b); });
		w.appendChild(el("p", "pe-hint2", "Their size, place, text, masks and styles come along. Text stays editable. Undo works in each tab."));
		m = PE.modal({ title: move ? "Move layers to another tab" : "Copy layers to another tab", body: w, buttons: [{ label: "Cancel", act: function (mm) { mm.close(); } }] });
	};
	if (window.PEdebug === undefined) window.PEtabs = { tabs: function () { return tabs; }, cur: function () { return cur; } };
})();
