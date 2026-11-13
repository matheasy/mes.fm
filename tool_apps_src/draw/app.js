/* MES Draw (mes.fm/draw): the page. The maths lives in lib.js (MESDraw). One canvas shows the desk, the page (background + paper lines),
 * the drawing (an "ink" canvas, so the eraser can rub out ink but never the paper) and the selection handles. Objects are never changed in
 * place: an edit replaces the object, so undo snapshots can share them. Drawings are kept in IndexedDB "mes-draw" (nothing is uploaded). */
(function () {
	"use strict";
	var D = window.MESDraw, root = document.getElementById("dr");
	if (!D || !root) return;
	function $(id) { return document.getElementById(id); }
	var KEY = "mes-draw:v1", EMOJI_FONT = "\"Apple Color Emoji\", \"Segoe UI Emoji\", \"Noto Color Emoji\", sans-serif";
	var PAL = ["#1e1e1e", "#ffffff", "#868e96", "#e03131", "#f76707", "#f59f00", "#ffd43b", "#8ce99a", "#2f9e44", "#12b886", "#1c7ed6", "#74c0fc", "#7048e8", "#ae3ec9", "#e64980", "#f783ac", "#8c5a2b", "#ffc078"];
	var FONTS = [["Arial, Helvetica, sans-serif", "Arial"], ["\"Comic Sans MS\", \"Chalkboard SE\", \"Comic Neue\", cursive", "Comic Sans"], ["Georgia, \"Times New Roman\", serif", "Georgia"], ["\"Times New Roman\", Times, serif", "Times"],
		["Impact, \"Arial Black\", \"Haettenschweiler\", sans-serif", "Impact"], ["Verdana, Geneva, sans-serif", "Verdana"], ["\"Trebuchet MS\", sans-serif", "Trebuchet"], ["\"Courier New\", Courier, monospace", "Courier"],
		["\"Brush Script MT\", \"Snell Roundhand\", \"Segoe Script\", cursive", "Script"], ["\"Segoe Print\", \"Bradley Hand\", \"Marker Felt\", cursive", "Handwriting"], ["system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif", "System"]];
	var TOOLS = [
		["select", "Select and move", "V", '<path d="M5 3l14 8-6 1.5L10 19z"/>'],
		["hand", "Hand: move around the page", "H", '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7s-5-2-7-5l-1.5-2.5a1.5 1.5 0 0 1 2.5-1.6L8 13"/>'],
		"-",
		["brush", "Brush (pen, marker, pencil, highlighter, calligraphy, neon, spray)", "B", '<path d="M18.5 2.5l3 3L11 16l-4-1-1-4z"/><path d="M6 15c-2 0-3 1.5-3 3.5S2 21 2 21s4 1 6-1 0-5-2-5z"/>'],
		["eraser", "Eraser", "E", '<path d="M20 20H9L3.5 14.5a2 2 0 0 1 0-2.8L12 3.2a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L11 20"/><path d="M8 9l7 7"/>'],
		"-",
		["shape", "Shape (pick one in the Shapes panel)", "S", '<rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16.5" cy="7.5" r="4.5"/>'],
		["rect", "Rectangle", "R", '<rect x="3" y="5" width="18" height="14" rx="1"/>'],
		["ellipse", "Circle / ellipse", "O", '<ellipse cx="12" cy="12" rx="9" ry="7.5"/>'],
		["line", "Line", "L", '<path d="M4 20L20 4"/>'],
		["arrow", "Arrow", "A", '<path d="M4 20L20 4M11 4h9v9"/>'],
		["text", "Text", "T", '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'],
		"-",
		["fill", "Paint bucket: click a shape, line or text to paint it, or the page to change its colour", "F", '<path d="M19 11L11 3 3 11l8 8z"/><path d="M3 11h16M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z"/>'],
		["picker", "Colour picker: take a colour from the drawing", "I", '<path d="M14 4l6 6-9.5 9.5H4.5v-6z"/><path d="M12 6l6 6"/>']
	];
	var SHAPE_TOOL = { rect: "rect", ellipse: "ellipse", line: "line", arrow: "arrow" };

	/* ---------- settings ---------- */
	var S = { tool: "brush", brush: "pen", c: "#1e1e1e", fOn: false, fc: "#ffd43b", w: 6, ew: 34, sw: 5, o: 1, kind: "rect", dash: false, font: FONTS[0][0], fs: 56, b: false, i: false, al: "l", sOn: false, sc: "#000000",
		sym: "off", smooth: 50, emode: "rub", recent: [], tab: "shapes", side: true, fmt: "png", scale: 1, what: "page", xbg: true, xpaper: true, last: "" };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) Object.keys(S).forEach(function (k) { if (sv[k] !== undefined) S[k] = sv[k]; }); } catch (e) {}
	var saveTimerS = 0;
	function saveS() { clearTimeout(saveTimerS); saveTimerS = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 250); }

	/* ---------- state ---------- */
	var doc = null, sel = [], hist = [], hpos = -1, op = null, live = null, editing = null, spaceDown = false, penSeen = false, active = false;
	var view = { s: 1, ox: 0, oy: 0, fit: true }, dpr = 1, W = 0, H = 0;
	var stage = $("dr-stage"), cv = $("dr-cv"), ctx = cv.getContext("2d"), ink = document.createElement("canvas"), ictx = ink.getContext("2d"), lv = document.createElement("canvas"), lctx = lv.getContext("2d");
	var hcv = document.createElement("canvas"), hctx = hcv.getContext("2d"), mcv = document.createElement("canvas"), mctx = mcv.getContext("2d");
	var pathCache = new WeakMap(), imgCache = {}, paperCache = { key: "", list: [] }, inkOk = false, need = false;
	function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
	function clone(o, patch) { var c = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; if (patch) for (var j in patch) c[j] = patch[j]; return c; }
	function byId(id) { for (var i = 0; i < doc.objs.length; i++) if (doc.objs[i].id === id) return doc.objs[i]; return null; }
	function selObjs() { return doc.objs.filter(function (o) { return sel.indexOf(o.id) >= 0; }); }
	function dirty(inkToo) { if (inkToo !== false) inkOk = false; if (!need) { need = true; requestAnimationFrame(render); } }

	/* ---------- text measuring ---------- */
	function fontOf(o, k) { return (o.i ? "italic " : "") + (o.b ? "700 " : "") + (o.size * (k || 1)) + "px " + (o.font || FONTS[0][0]); }
	function measure(o) {
		mctx.font = fontOf(o); var lines = String(o.s).split("\n"), w = 0;
		lines.forEach(function (l) { w = Math.max(w, mctx.measureText(l).width); });
		o.tw = Math.max(o.size * 0.3, w); o.th = lines.length * o.size * 1.2; return o;
	}
	function prep(o) { if (!o.id) o.id = uid(); if (!o.m) o.m = D.I.slice(); if (o.t === "text") measure(o); return o; }

	/* ---------- history ---------- */
	function snap() { return { objs: doc.objs.slice(), bg: { c: doc.bg.c, p: doc.bg.p }, w: doc.w, h: doc.h }; }
	function commit() {
		hist = hist.slice(0, hpos + 1); hist.push(snap()); if (hist.length > 200) hist.shift(); hpos = hist.length - 1;
		sel = sel.filter(byId); uiHist(); scheduleSave(); dirty(); uiSel(); cloudTick();
	}
	function restore(h) { doc.objs = h.objs.slice(); doc.bg = { c: h.bg.c, p: h.bg.p }; var sz = doc.w !== h.w || doc.h !== h.h; doc.w = h.w; doc.h = h.h; sel = sel.filter(byId); if (sz) fit(); uiPage(); uiHist(); uiSel(); scheduleSave(); dirty(); cloudTick(); }
	function undo() { if (op) return; finishText(); if (hpos > 0) { hpos--; restore(hist[hpos]); tip("Undone"); } }
	function redo() { if (op) return; if (hpos < hist.length - 1) { hpos++; restore(hist[hpos]); tip("Redone"); } }
	function uiHist() { $("dr-undo").disabled = hpos <= 0; $("dr-redo").disabled = hpos >= hist.length - 1; }

	/* ---------- storage (IndexedDB) ---------- */
	var dbP = null;
	function db() { if (!dbP) dbP = new Promise(function (res, rej) { if (!window.indexedDB) { rej(new Error("no IndexedDB")); return; } var r = indexedDB.open("mes-draw", 1); r.onupgradeneeded = function () { r.result.createObjectStore("docs", { keyPath: "id" }); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); return dbP; }
	function tx(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("docs", mode), st = t.objectStore("docs"), out = fn(st); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }
	function getAll() { return tx("readonly", function (st) { return st.getAll(); }).catch(function () { return []; }); }
	function getDoc(id) { return tx("readonly", function (st) { return st.get(id); }).catch(function () { return null; }); }
	var saveTimer = 0, saving = false;
	function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); status("Saving…"); }
	function saveNow() {
		clearTimeout(saveTimer); if (!doc) return Promise.resolve();
		var rec = { id: doc.id, name: doc.name, w: doc.w, h: doc.h, bg: doc.bg, objs: doc.objs.map(D.cleanObj).filter(Boolean), t: Date.now(), made: doc.made || Date.now(), thumb: thumb(doc, 260) };
		return tx("readwrite", function (st) { st.put(rec); }).then(function () { status("Saved in this browser · " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); if (S.tab === "mine") paneMine(); }, function () { status("Could not save in this browser (private window?). Use Export → Save as .mesdraw file."); });
	}
	function status(t) { $("dr-status").textContent = t; }

	/* ---------- loading a drawing ---------- */
	function setDoc(d, fresh) {
		doc = { id: d.id || uid(), name: d.name || "Untitled drawing", w: d.w, h: d.h, bg: { c: d.bg ? d.bg.c : "#ffffff", p: d.bg && d.bg.p || "none" }, objs: (d.objs || []).map(function (o) { return prep(clone(o)); }), made: d.made || Date.now() };
		sel = []; hist = []; hpos = -1; commitNoSave(); S.last = doc.id; saveS();
		$("dr-name").value = doc.name; uiPage(); fit(); dirty(); uiSel();
		if (fresh) scheduleSave();
	}
	function commitNoSave() { hist.push(snap()); hpos = hist.length - 1; uiHist(); }
	function newDoc(t, name) {
		var src = D.template(t) || D.template("blank"); src.name = name || "Untitled drawing";
		if (doc) saveNow(); setDoc(src, true);
	}

	/* ---------- view ---------- */
	function resize() {
		var r = stage.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2.5);
		var w = Math.max(50, Math.round(r.width)), h = Math.max(50, Math.round(r.height));
		if (w === W && h === H && cv.width === Math.round(w * dpr)) return;
		W = w; H = h; [cv, ink, lv].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
		if (view.fit) fit(); else dirty();
	}
	function fit() { if (!doc || !W) return; var pad = Math.min(36, W * 0.05); view.s = Math.min((W - pad * 2) / doc.w, (H - pad * 2) / doc.h); view.ox = (W - doc.w * view.s) / 2; view.oy = (H - doc.h * view.s) / 2; view.fit = true; uiZoom(); dirty(); }
	function zoomAt(f, sx, sy) { var ns = Math.max(0.03, Math.min(16, view.s * f)); f = ns / view.s; view.ox = sx - (sx - view.ox) * f; view.oy = sy - (sy - view.oy) * f; view.s = ns; view.fit = false; uiZoom(); dirty(); placeEditor(); }
	function uiZoom() { $("dr-zfit").textContent = Math.round(view.s * 100) + "%"; }
	function toBoard(cx, cy) { var r = cv.getBoundingClientRect(); return [(cx - r.left - view.ox) / view.s, (cy - r.top - view.oy) / view.s]; }
	function toScreen(x, y) { return [view.ox + x * view.s, view.oy + y * view.s]; }

	/* ---------- drawing objects ---------- */
	function p2d(o) { var p = pathCache.get(o); if (!p) { p = new Path2D(D.objD(o)); pathCache.set(o, p); } return p; }
	function img(src) { var im = imgCache[src]; if (!im) { im = new Image(); im.onload = function () { dirty(); }; im.src = src; imgCache[src] = im; } return im; }
	function strokeLine(c, o, cap) { c.lineWidth = o.w; c.lineCap = cap; c.lineJoin = "round"; c.strokeStyle = o.c; c.stroke(p2d(o)); }
	function drawObj(c, o, k) {
		if (editing && editing.id === o.id) return;
		var m = o.m; c.save(); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]); c.globalAlpha = o.o == null ? 1 : o.o;
		if (o.t === "path") {
			var b = o.brush;
			if (b === "erase") { c.globalCompositeOperation = "destination-out"; c.globalAlpha = 1; c.strokeStyle = "#000"; c.lineWidth = o.w; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(p2d(o)); }
			else if (D.isFilledBrush(b)) { c.fillStyle = o.c; c.fill(p2d(o)); }
			else if (b === "hl") { c.globalCompositeOperation = "multiply"; strokeLine(c, o, "butt"); }
			else if (b === "pencil") { c.globalAlpha *= 0.85; strokeLine(c, o, "round"); }
			else if (b === "neon") { c.shadowColor = o.c; c.shadowBlur = Math.max(2, o.w * 1.4 * k * D.mScale(m)); strokeLine(c, o, "round"); c.shadowBlur = 0; c.lineWidth = Math.max(1, o.w * 0.35); c.strokeStyle = "rgba(255,255,255,.9)"; c.stroke(p2d(o)); }
			else strokeLine(c, o, "round");
		} else if (o.t === "shape") {
			var p = p2d(o);
			if (o.f && !D.OPEN_KINDS[o.k]) { c.fillStyle = o.f; c.fill(p); }
			if (o.c && o.sw > 0) { c.lineWidth = o.sw; c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = o.c; if (o.dash) c.setLineDash([o.sw * 3, o.sw * 2]); c.stroke(p); }
		} else if (o.t === "text") drawText(c, o);
		else if (o.t === "img") { var im = img(o.src); if (im.complete && im.naturalWidth) c.drawImage(im, o.x, o.y, o.w, o.h); }
		c.restore();
	}
	function drawText(c, o) {
		var lines = String(o.s).split("\n"), lh = o.size * 1.2, tw = o.tw || D.estText(o).w, th = o.th || lines.length * lh;
		c.font = fontOf(o); c.textAlign = o.al === "c" ? "center" : o.al === "r" ? "right" : "left"; c.textBaseline = "alphabetic";
		if (o.bgc) { var bx = o.x + (o.al === "c" ? -tw / 2 : o.al === "r" ? -tw : 0), pad = o.size * 0.25; c.fillStyle = o.bgc; c.beginPath(); if (c.roundRect) c.roundRect(bx - pad, o.y - pad, tw + 2 * pad, th + 2 * pad, pad); else c.rect(bx - pad, o.y - pad, tw + 2 * pad, th + 2 * pad); c.fill(); }
		lines.forEach(function (l, i) {
			var y = o.y + i * lh + o.size * 0.92;
			if (o.sc) { c.lineWidth = Math.max(2, o.size * 0.08) * 2; c.lineJoin = "round"; c.strokeStyle = o.sc; c.strokeText(l, o.x, y); }
			c.fillStyle = o.c; c.fillText(l, o.x, y);
		});
	}
	function paperList() { var key = doc.bg.p + "|" + doc.w + "|" + doc.h; if (paperCache.key !== key) { paperCache.key = key; paperCache.list = D.paper(doc.bg.p, doc.w, doc.h).map(function (l) { return { p: new Path2D(l.d), l: l }; }); } return paperCache.list; }
	function drawPaper(c) { paperList().forEach(function (it) { if (it.l.fill) { c.fillStyle = it.l.fill; c.fill(it.p); } else { c.strokeStyle = it.l.stroke; c.lineWidth = it.l.sw; c.stroke(it.p); } }); }
	function checker(c, x, y, w, h, sz) { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = "#ffffff"; c.fillRect(x, y, w, h); c.fillStyle = "#e3e7ec"; for (var yy = 0, r = 0; yy < h; yy += sz, r++) for (var xx = (r % 2) * sz; xx < w; xx += sz * 2) c.fillRect(x + xx, y + yy, sz, sz); c.restore(); }

	var deskColor = "#e9ecf1";
	function readDesk() { deskColor = getComputedStyle(root).getPropertyValue("--dr-desk").trim() || "#e9ecf1"; }
	function render(noOverlay) {
		need = false; if (!doc || !W) return;
		var k = dpr * view.s, T = [k, 0, 0, k, view.ox * dpr, view.oy * dpr];
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = deskColor; ctx.fillRect(0, 0, cv.width, cv.height);
		var px = view.ox * dpr, py = view.oy * dpr, pw = doc.w * k, ph = doc.h * k;
		ctx.save(); ctx.shadowColor = "rgba(0,0,0,.22)"; ctx.shadowBlur = 14 * dpr; ctx.shadowOffsetY = 3 * dpr; ctx.fillStyle = doc.bg.c || "#fff"; ctx.fillRect(px, py, pw, ph); ctx.restore();
		if (!doc.bg.c) checker(ctx, px, py, pw, ph, 10 * dpr);
		ctx.save(); ctx.setTransform.apply(ctx, T); ctx.beginPath(); ctx.rect(0, 0, doc.w, doc.h); ctx.clip(); if (doc.bg.p && doc.bg.p !== "none") drawPaper(ctx); ctx.restore();
		if (!inkOk) {
			ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, ink.width, ink.height); ictx.setTransform.apply(ictx, T);
			doc.objs.forEach(function (o) { drawObj(ictx, o, k); }); inkOk = true;
		}
		var src = ink;
		if (live) {
			lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, lv.width, lv.height); lctx.drawImage(ink, 0, 0); lctx.setTransform.apply(lctx, T);
			(live.list || [live]).forEach(function (o) { drawObj(lctx, o, k); }); src = lv;
		}
		ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip(); ctx.drawImage(src, 0, 0); ctx.restore();
		// outside the page: faint, so things moved off the edge can still be found
		ctx.save(); ctx.globalAlpha = 0.22; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.rect(px, py, pw, ph); ctx.clip("evenodd"); ctx.drawImage(src, 0, 0); ctx.restore();
		if (noOverlay !== true) overlay(T);
	}
	/* handles + marquee + eraser ring */
	var HS = 9;
	function selBox() { var l = selObjs(); return l.length ? D.unionBox(l) : null; }
	function handles(b) {
		var a = toScreen(b.x, b.y), z = toScreen(b.x + b.w, b.y + b.h), mx = (a[0] + z[0]) / 2, my = (a[1] + z[1]) / 2;
		return { nw: [a[0], a[1]], n: [mx, a[1]], ne: [z[0], a[1]], e: [z[0], my], se: [z[0], z[1]], s: [mx, z[1]], sw: [a[0], z[1]], w: [a[0], my], rot: [mx, a[1] - 28] };
	}
	function overlay() {
		ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		var b = selBox();
		if (b && !editing && (S.tool === "select" || (op && (op.kind === "move" || op.kind === "scale" || op.kind === "rot")))) {
			var h = handles(b), a = toScreen(b.x, b.y);
			ctx.strokeStyle = "#7048e8"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(a[0], a[1], b.w * view.s, b.h * view.s); ctx.setLineDash([]);
			if (sel.length > 1) selObjs().forEach(function (o) { var wb = D.worldBox(o), p = toScreen(wb.x, wb.y); ctx.strokeStyle = "rgba(112,72,232,.45)"; ctx.strokeRect(p[0], p[1], wb.w * view.s, wb.h * view.s); });
			ctx.beginPath(); ctx.moveTo(h.n[0], h.n[1]); ctx.lineTo(h.rot[0], h.rot[1]); ctx.stroke();
			Object.keys(h).forEach(function (k) { var p = h[k]; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#7048e8"; ctx.lineWidth = 2; ctx.beginPath(); if (k === "rot") ctx.arc(p[0], p[1], 6.5, 0, 7); else ctx.rect(p[0] - HS / 2 - 1, p[1] - HS / 2 - 1, HS + 2, HS + 2); ctx.fill(); ctx.stroke(); });
		} else if (b && !editing) { var a2 = toScreen(b.x, b.y); ctx.strokeStyle = "rgba(112,72,232,.6)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.strokeRect(a2[0], a2[1], b.w * view.s, b.h * view.s); ctx.setLineDash([]); }
		if (op && op.kind === "marquee") { var q = toScreen(Math.min(op.x0, op.x1), Math.min(op.y0, op.y1)); ctx.fillStyle = "rgba(112,72,232,.1)"; ctx.strokeStyle = "#7048e8"; ctx.lineWidth = 1; var mw = Math.abs(op.x1 - op.x0) * view.s, mh = Math.abs(op.y1 - op.y0) * view.s; ctx.fillRect(q[0], q[1], mw, mh); ctx.strokeRect(q[0], q[1], mw, mh); }
		if (hover && (S.tool === "eraser" || S.tool === "brush") && !op) { var r = (S.tool === "eraser" ? S.ew : S.w) / 2 * view.s; if (r > 3) { ctx.strokeStyle = "rgba(128,128,128,.85)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hover[0], hover[1], r, 0, 7); ctx.stroke(); } }
		if (S.sym !== "off" && S.tool === "brush") { ctx.strokeStyle = "rgba(112,72,232,.35)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 1; symGuides(); ctx.setLineDash([]); }
		ctx.restore();
	}
	function symGuides() {
		var c = toScreen(doc.w / 2, doc.h / 2), R = Math.hypot(doc.w, doc.h) * view.s, n = { mx: [90], my: [0], m4: [0, 90], r6: [0, 30, 60, 90, 120, 150], r8: [0, 45, 90, 135], r12: [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165], k12: [0, 30, 60, 90, 120, 150] }[S.sym] || [];
		n.forEach(function (deg) { var a = deg * Math.PI / 180; ctx.beginPath(); ctx.moveTo(c[0] - Math.cos(a) * R, c[1] - Math.sin(a) * R); ctx.lineTo(c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R); ctx.stroke(); });
	}

	/* ---------- symmetry ---------- */
	function symMats() {
		var cx = doc.w / 2, cy = doc.h / 2, mX = D.mirrorX(cx), mY = D.mirrorY(cy), out = [D.I.slice()], i;
		if (S.sym === "mx") out.push(mX); else if (S.sym === "my") out.push(mY); else if (S.sym === "m4") out.push(mX, mY, D.mul(mX, mY));
		else if (/^r\d+$/.test(S.sym)) { var n = +S.sym.slice(1); for (i = 1; i < n; i++) out.push(D.rotateAt(i * 2 * Math.PI / n, cx, cy)); }
		else if (S.sym === "k12") { for (i = 1; i < 6; i++) out.push(D.rotateAt(i * Math.PI / 3, cx, cy)); out.slice().forEach(function (m) { out.push(D.mul(m, mX)); }); }
		return out;
	}

	/* ---------- hit testing ---------- */
	function hitObj(o, x, y, tolPx) {
		if (o.t === "path" && o.brush === "erase") return false;
		var wb = D.worldBox(o), tol = tolPx / view.s;
		if (x < wb.x - tol || x > wb.x + wb.w + tol || y < wb.y - tol || y > wb.y + wb.h + tol) return false;
		var l = D.ap(D.inv(o.m), x, y), lt = tol / D.mScale(o.m);
		if (o.t === "path") return D.distPolyline(o.pts, l[0], l[1]) <= o.w / 2 + lt;
		if (o.t === "shape") {
			var p = p2d(o); hctx.setTransform(1, 0, 0, 1, 0, 0);
			if (o.f && !D.OPEN_KINDS[o.k] && hctx.isPointInPath(p, l[0], l[1])) return true;
			hctx.lineWidth = Math.max(o.sw || 1, 1) + lt * 2; hctx.lineCap = "round"; hctx.lineJoin = "round"; return hctx.isPointInStroke(p, l[0], l[1]);
		}
		var b = D.localBox(o); return l[0] >= b.x - lt && l[0] <= b.x + b.w + lt && l[1] >= b.y - lt && l[1] <= b.y + b.h + lt;
	}
	function hit(x, y, tolPx) { for (var i = doc.objs.length - 1; i >= 0; i--) if (hitObj(doc.objs[i], x, y, tolPx || 6)) return doc.objs[i]; return null; }
	function withGroup(ids) { var gs = {}; doc.objs.forEach(function (o) { if (ids.indexOf(o.id) >= 0 && o.g) gs[o.g] = 1; }); return doc.objs.filter(function (o) { return ids.indexOf(o.id) >= 0 || (o.g && gs[o.g]); }).map(function (o) { return o.id; }); }
	function handleAt(sx, sy) { var b = selBox(); if (!b || S.tool !== "select") return null; var h = handles(b); for (var k in h) if (Math.abs(sx - h[k][0]) <= 9 && Math.abs(sy - h[k][1]) <= 9) return k; return null; }

	/* ---------- pointer ---------- */
	var ptrs = new Map(), hover = null, pinch = null;
	function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
	cv.addEventListener("pointerdown", function (e) {
		active = true; if (editing) { finishText(); if (S.tool === "text") return; }
		cv.focus({ preventScroll: true });
		var sp = local(e); ptrs.set(e.pointerId, sp); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
		if (ptrs.size === 2) { cancelOp(); var a = Array.from(ptrs.values()); pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), cx: (a[0][0] + a[1][0]) / 2, cy: (a[0][1] + a[1][1]) / 2 }; return; }
		if (ptrs.size > 2) return;
		if (e.pointerType === "pen") penSeen = true;
		var b = toBoard(e.clientX, e.clientY), pr = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
		if (e.button === 1 || spaceDown || S.tool === "hand" || (e.pointerType === "touch" && penSeen)) { op = { kind: "pan", sx: sp[0], sy: sp[1], ox: view.ox, oy: view.oy }; e.preventDefault(); return; }
		if (e.button === 2) return;
		e.preventDefault();
		var t = S.tool;
		if (t === "select") {
			var hk = handleAt(sp[0], sp[1]);
			if (hk) { startTransform(hk, b, e); return; }
			var o = hit(b[0], b[1]);
			if (o) {
				var ids = withGroup([o.id]);
				if (e.shiftKey || e.ctrlKey || e.metaKey) { if (sel.indexOf(o.id) >= 0) sel = sel.filter(function (id) { return ids.indexOf(id) < 0; }); else sel = sel.concat(ids.filter(function (id) { return sel.indexOf(id) < 0; })); uiSel(); dirty(false); return; }
				if (sel.indexOf(o.id) < 0) sel = ids;
				if (e.altKey) duplicate(true);
				uiSel(); startMove(b); return;
			}
			if (!e.shiftKey) sel = [];
			op = { kind: "marquee", x0: b[0], y0: b[1], x1: b[0], y1: b[1], add: e.shiftKey ? sel.slice() : [] }; uiSel(); dirty(false); return;
		}
		if (t === "brush" || (t === "eraser" && S.emode === "rub")) {
			var isE = t === "eraser", base = { t: "path", brush: isE ? "erase" : S.brush, pts: [b[0], b[1], pr], c: S.c, w: isE ? S.ew : S.w, o: isE ? 1 : S.o, sd: (Math.random() * 1e9) | 0, m: D.I.slice() };
			var mats = isE ? [D.I.slice()] : symMats();
			live = base; live.list = mats.map(function (m, i) { return i ? clone(base, { m: m, pts: base.pts }) : base; });
			op = { kind: "draw", x0: b[0], y0: b[1], last: [b[0], b[1]], mats: mats, shift: e.shiftKey }; dirty(false); return;
		}
		if (t === "eraser") { op = { kind: "objerase", hitAny: false }; eraseAt(b); return; }
		if (t === "shape" || SHAPE_TOOL[t]) {
			var k = SHAPE_TOOL[t] || S.kind;
			live = { t: "shape", k: k, x: b[0], y: b[1], w: 0, h: 0, c: S.c, sw: S.sw, f: S.fOn ? S.fc : null, dash: S.dash, o: S.o, m: D.I.slice() };
			op = { kind: "shape", x0: b[0], y0: b[1] }; dirty(false); return;
		}
		if (t === "text") { var ot = hit(b[0], b[1]); if (ot && ot.t === "text") editText(ot); else newText(b[0], b[1]); return; }
		if (t === "fill") { paint(b); return; }
		if (t === "picker") { pick(sp); return; }
	});
	cv.addEventListener("pointermove", function (e) {
		var sp = local(e);
		if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, sp);
		if (pinch && ptrs.size === 2) { var a = Array.from(ptrs.values()), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), cx = (a[0][0] + a[1][0]) / 2, cy = (a[0][1] + a[1][1]) / 2; view.ox += cx - pinch.cx; view.oy += cy - pinch.cy; zoomAt(d / (pinch.d || d), cx, cy); pinch.d = d; pinch.cx = cx; pinch.cy = cy; return; }
		hover = sp; cursor(sp);
		if (!op) { if (S.tool === "eraser" || S.tool === "brush") dirty(false); return; }
		var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; if (!evs.length) evs = [e];
		var b = toBoard(e.clientX, e.clientY);
		if (op.kind === "pan") { view.ox = op.ox + sp[0] - op.sx; view.oy = op.oy + sp[1] - op.sy; view.fit = false; dirty(false); placeEditor(); return; }
		if (op.kind === "draw") {
			if (e.shiftKey) { var pr0 = live.pts[2]; live.pts = [op.x0, op.y0, pr0, b[0], b[1], pr0]; }
			else {
				var sm = S.smooth / 100 * 0.75, minD = 0.6 / view.s;
				evs.forEach(function (ev) { var p = toBoard(ev.clientX, ev.clientY), lx = op.last[0], ly = op.last[1], nx = lx + (p[0] - lx) * (1 - sm), ny = ly + (p[1] - ly) * (1 - sm); if (Math.hypot(nx - lx, ny - ly) < minD) return; op.last = [nx, ny]; live.pts.push(nx, ny, ev.pointerType === "pen" ? (ev.pressure || 0.5) : 0.5); });
			}
			live.list.forEach(function (o, i) { if (i) o.pts = live.pts; pathCache.delete(o); }); dirty(false); return;
		}
		if (op.kind === "objerase") { eraseAt(b); return; }
		if (op.kind === "shape") { shapeDrag(b, e); return; }
		if (op.kind === "marquee") { op.x1 = b[0]; op.y1 = b[1]; var mb = { x: Math.min(op.x0, op.x1), y: Math.min(op.y0, op.y1), w: Math.abs(op.x1 - op.x0), h: Math.abs(op.y1 - op.y0) }; sel = withGroup(op.add.concat(doc.objs.filter(function (o) { return !(o.t === "path" && o.brush === "erase") && D.boxesTouch(D.worldBox(o), mb); }).map(function (o) { return o.id; }))); uiSel(); dirty(false); return; }
		if (op.kind === "move") { var dx = b[0] - op.b0[0], dy = b[1] - op.b0[1]; if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } applyM(D.tr(dx, dy)); op.moved = op.moved || Math.hypot(dx, dy) * view.s > 2; return; }
		if (op.kind === "scale") { scaleDrag(b, e); return; }
		if (op.kind === "rot") { var c = op.c, a1 = Math.atan2(b[1] - c[1], b[0] - c[0]), da = a1 - op.a0; if (e.shiftKey) da = Math.round(da / (Math.PI / 12)) * (Math.PI / 12); applyM(D.rotateAt(da, c[0], c[1])); tip(Math.round(((da * 180 / Math.PI) % 360 + 540) % 360 - 180) + "°"); }
	});
	function endPtr(e) {
		ptrs.delete(e.pointerId); if (pinch) { if (ptrs.size < 2) pinch = null; return; }
		if (!op) return; var o = op; op = null;
		if (o.kind === "draw") finishStroke(o);
		else if (o.kind === "shape") finishShape();
		else if (o.kind === "objerase") { if (o.hitAny) commit(); }
		else if (o.kind === "move" || o.kind === "scale" || o.kind === "rot") { if (o.kind !== "move" || o.moved) commit(); else dirty(false); }
		else if (o.kind === "marquee") { uiSel(); dirty(false); }
		else dirty(false);
	}
	cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", function (e) { if (op && op.kind === "draw") { live = null; op = null; dirty(false); } endPtr(e); });
	cv.addEventListener("pointerleave", function () { hover = null; if (!op) dirty(false); });
	cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
	cv.addEventListener("dblclick", function (e) { var b = toBoard(e.clientX, e.clientY), o = hit(b[0], b[1]); if (o && o.t === "text") editText(o); });
	function cancelOp() { if (op && (op.kind === "move" || op.kind === "scale" || op.kind === "rot")) { doc.objs = hist[hpos].objs.slice(); } live = null; op = null; dirty(); }
	function cursor(sp) {
		var c = "crosshair", t = S.tool;
		if (spaceDown || t === "hand") c = op && op.kind === "pan" ? "grabbing" : "grab";
		else if (t === "select") { var hk = handleAt(sp[0], sp[1]); if (hk) c = hk === "rot" ? "grab" : ({ nw: "nwse", se: "nwse", ne: "nesw", sw: "nesw", n: "ns", s: "ns", e: "ew", w: "ew" })[hk] + "-resize"; else { var b = toBoard(sp[0] + cv.getBoundingClientRect().left, sp[1] + cv.getBoundingClientRect().top); c = hit(b[0], b[1]) ? "move" : "default"; } }
		else if (t === "text") c = "text"; else if (t === "fill" || t === "picker") c = "cell";
		if (cv.style.cursor !== c) cv.style.cursor = c;
	}

	/* moving / scaling / rotating the selection: base objects are kept, a matrix is applied on top */
	function startMove(b) { op = { kind: "move", b0: b, base: baseMap() }; dirty(false); }
	function baseMap() { var m = {}; selObjs().forEach(function (o) { m[o.id] = o; }); return m; }
	function applyM(M) { var base = op.base; doc.objs = doc.objs.map(function (o) { var b = base[o.id]; return b ? clone(b, { m: D.mul(M, b.m) }) : o; }); dirty(); }
	function startTransform(hk, b, e) {
		var bx = selBox(); if (!bx) return;
		if (hk === "rot") { var c = [bx.x + bx.w / 2, bx.y + bx.h / 2]; op = { kind: "rot", c: c, a0: Math.atan2(b[1] - c[1], b[0] - c[0]), base: baseMap() }; return; }
		var ax = hk.indexOf("w") >= 0 ? bx.x + bx.w : hk.indexOf("e") >= 0 ? bx.x : bx.x + bx.w / 2, ay = hk.indexOf("n") >= 0 ? bx.y + bx.h : hk.indexOf("s") >= 0 ? bx.y : bx.y + bx.h / 2;
		op = { kind: "scale", hk: hk, box: bx, ax: ax, ay: ay, hx: hk.indexOf("w") >= 0 ? bx.x : bx.x + bx.w, hy: hk.indexOf("n") >= 0 ? bx.y : bx.y + bx.h, base: baseMap() };
	}
	function scaleDrag(b, e) {
		var o = op, hk = o.hk, sx = 1, sy = 1;
		if (hk.indexOf("e") >= 0 || hk.indexOf("w") >= 0) sx = (b[0] - o.ax) / ((o.hx - o.ax) || 1);
		if (hk.indexOf("n") >= 0 || hk.indexOf("s") >= 0) sy = (b[1] - o.ay) / ((o.hy - o.ay) || 1);
		var corner = hk.length === 2;
		if (corner && !e.shiftKey) { var s = Math.abs(sx) > Math.abs(sy) ? sx : sy; sx = Math.sign(sx || 1) * Math.abs(s); sy = Math.sign(sy || 1) * Math.abs(s); }
		if (e.altKey) { o.cx = o.box.x + o.box.w / 2; o.cy = o.box.y + o.box.h / 2; }
		var mn = 0.01; if (Math.abs(sx) < mn) sx = sx < 0 ? -mn : mn; if (Math.abs(sy) < mn) sy = sy < 0 ? -mn : mn;
		applyM(D.scaleAt(sx, sy, e.altKey ? o.box.x + o.box.w / 2 : o.ax, e.altKey ? o.box.y + o.box.h / 2 : o.ay));
		tip(Math.round(o.box.w * Math.abs(sx)) + " × " + Math.round(o.box.h * Math.abs(sy)));
	}

	/* strokes */
	function finishStroke(o) {
		var l = live; live = null; if (!l) return;
		var pts = l.pts;
		if (pts.length > 9 && !o.shift) pts = D.smoothPts(D.thinPts(pts, 0.35 / view.s), 1);
		var group = o.mats.length > 1 ? uid() : null, add = o.mats.map(function (m) { var n = clone(l, { pts: pts, m: m, id: uid() }); delete n.list; if (group) n.g = group; return n; });
		doc.objs = doc.objs.concat(add); commit();
	}
	/* whole-object eraser */
	function eraseAt(b) {
		var o = hit(b[0], b[1], Math.max(4, S.ew / 2 * view.s)); if (!o) return;
		var ids = withGroup([o.id]); doc.objs = doc.objs.filter(function (x) { return ids.indexOf(x.id) < 0; }); sel = sel.filter(function (id) { return ids.indexOf(id) < 0; }); op.hitAny = true; dirty();
	}
	/* shapes */
	function shapeDrag(b, e) {
		var x0 = op.x0, y0 = op.y0, dx = b[0] - x0, dy = b[1] - y0;
		if (D.LINE_KINDS[live.k]) {
			if (e.shiftKey) { var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy); dx = Math.cos(a) * L; dy = Math.sin(a) * L; }
			live = clone(live, { x: x0, y: y0, w: dx, h: dy });
		} else {
			if (e.shiftKey) { var m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
			if (e.altKey) live = clone(live, { x: x0 - dx, y: y0 - dy, w: dx * 2, h: dy * 2 }); else live = clone(live, { x: x0, y: y0, w: dx, h: dy });
		}
		tip(Math.round(Math.abs(live.w)) + " × " + Math.round(Math.abs(live.h))); dirty(false);
	}
	function finishShape() {
		var s = live; live = null; if (!s) return;
		if (Math.hypot(s.w, s.h) * view.s < 6) { var d = Math.min(doc.w, doc.h) * 0.18; s = D.LINE_KINDS[s.k] ? clone(s, { w: d * 1.4, h: 0 }) : clone(s, { x: s.x - d * 0.7, y: s.y - d / 2, w: d * 1.4, h: d }); if (s.k === "ellipse" || s.k === "star" || s.k === "heart" || /^(penta|hexa|octa|star6|burst)$/.test(s.k)) s = clone(s, { x: s.x + d * 0.2, w: d }); }
		if (!D.LINE_KINDS[s.k]) { var n = D.norm(s); s = clone(s, n); }
		s.id = uid(); doc.objs = doc.objs.concat([s]); sel = [s.id]; afterMake();
	}
	function afterMake() { setTool("select"); commit(); }

	/* paint bucket / picker */
	function paint(b) {
		var o = hit(b[0], b[1]), c = S.c;
		if (!o) { doc.bg = { c: c, p: doc.bg.p }; uiPage(); commit(); tip("Page colour changed"); return; }
		var p = o.t === "shape" ? (D.OPEN_KINDS[o.k] || (!o.f && !insideShape(o, b)) ? { c: c } : { f: c }) : o.t === "img" ? null : { c: c };
		if (!p) { tip("Pictures can't be painted"); return; }
		replace(o.id, p); commit();
	}
	function insideShape(o, b) { var l = D.ap(D.inv(o.m), b[0], b[1]); hctx.setTransform(1, 0, 0, 1, 0, 0); return hctx.isPointInPath(p2d(o), l[0], l[1]); }
	function pick(sp) {
		render(true); var d = ctx.getImageData(Math.round(sp[0] * dpr), Math.round(sp[1] * dpr), 1, 1).data; dirty(false);
		var hex = "#" + [d[0], d[1], d[2]].map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join(""); setColor(hex); tip("Picked " + hex);
	}
	function replace(id, patch) { doc.objs = doc.objs.map(function (o) { return o.id === id ? prep(clone(o, patch)) : o; }); }

	/* ---------- text ---------- */
	var ted = $("dr-ted");
	function newText(x, y) {
		var o = prep({ t: "text", s: "", x: x, y: y - S.fs * 0.6, size: S.fs, font: S.font, c: S.c, b: S.b, i: S.i, al: S.al, sc: S.sOn ? S.sc : null, bgc: S.fOn ? S.fc : null, o: S.o, m: D.I.slice() });
		editing = { id: o.id, obj: o, fresh: true }; openEditor(o);
	}
	function editText(o) { sel = [o.id]; editing = { id: o.id, obj: o, fresh: false }; openEditor(o); dirty(); }
	function openEditor(o) {
		ted.hidden = false; ted.value = o.s; placeEditor(); setTimeout(function () { ted.focus(); if (!editing.fresh) ted.select(); }, 0);
		tip("Type, then click outside or press Ctrl+Enter. Esc cancels.");
	}
	function placeEditor() {
		if (!editing) return; var o = editing.obj, sc = D.mScale(o.m), k = view.s * sc, p0 = D.ap(o.m, o.x, o.y), p = toScreen(p0[0], p0[1]);
		ted.style.font = fontOf(o, k); ted.style.color = o.c; ted.style.lineHeight = "1.2"; ted.style.textAlign = o.al === "c" ? "center" : o.al === "r" ? "right" : "left";
		ted.style.textShadow = o.sc ? "0 0 2px " + o.sc + ", 0 0 2px " + o.sc : "none"; ted.style.background = o.bgc || "rgba(255,255,255,.05)";
		var lines = ted.value.split("\n"), wpx = 0; mctx.font = fontOf(o, k); lines.forEach(function (l) { wpx = Math.max(wpx, mctx.measureText(l || " ").width); });
		wpx = Math.max(wpx + o.size * k * 0.6, 40); var hpx = lines.length * o.size * k * 1.2 + 4;
		var left = p[0] - (o.al === "c" ? wpx / 2 : o.al === "r" ? wpx : 0);
		ted.style.left = left + "px"; ted.style.top = p[1] + "px"; ted.style.width = wpx + "px"; ted.style.height = hpx + "px";
	}
	ted.addEventListener("input", function () { placeEditor(); });
	ted.addEventListener("keydown", function (e) {
		e.stopPropagation();
		if (e.key === "Escape") { e.preventDefault(); var fresh = editing && editing.fresh; editing = null; ted.hidden = true; if (fresh) { /* nothing made */ } dirty(); cv.focus(); return; }
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishText(); cv.focus(); }
	});
	ted.addEventListener("blur", function () { setTimeout(function () { if (editing && document.activeElement !== ted) finishText(); }, 0); });
	function finishText() {
		if (!editing) return; var ed = editing, s = ted.value.replace(/\s+$/, ""); editing = null; ted.hidden = true;
		if (ed.fresh) { if (!s) { dirty(); return; } var o = prep(clone(ed.obj, { s: s })); doc.objs = doc.objs.concat([o]); sel = [o.id]; afterMake(); return; }
		if (!s) { doc.objs = doc.objs.filter(function (x) { return x.id !== ed.id; }); sel = []; commit(); return; }
		if (s !== ed.obj.s) { replace(ed.id, { s: s }); commit(); } else dirty();
	}

	/* ---------- inserting things ---------- */
	function viewCentre() { var c = [(W / 2 - view.ox) / view.s, (H / 2 - view.oy) / view.s]; if (c[0] < 0 || c[0] > doc.w || c[1] < 0 || c[1] > doc.h) c = [doc.w / 2, doc.h / 2]; return c; }
	function insertChar(ch, isEmoji, at) {
		var c = at || viewCentre(), size = Math.round(Math.min(doc.w, doc.h) * (isEmoji ? 0.14 : 0.12));
		var o = prep({ t: "text", s: ch, x: c[0], y: c[1] - size * 0.6, size: size, font: isEmoji ? EMOJI_FONT : "\"Segoe UI Symbol\", \"Apple Symbols\", Arial, sans-serif", c: S.c, b: false, i: false, al: "c", sc: null, bgc: null, o: 1, m: D.I.slice() });
		doc.objs = doc.objs.concat([o]); sel = [o.id]; setTool("select"); commit(); tip("Drag it into place, or pull a corner to resize");
	}
	function insertObjs(list, offset) {
		var ids = [], gmap = {};
		list.forEach(function (o) { var n = prep(clone(o, { id: uid(), m: D.mul(D.tr(offset || 0, offset || 0), o.m || D.I) })); if (n.g) { gmap[n.g] = gmap[n.g] || uid(); n.g = gmap[n.g]; } doc.objs.push(n); ids.push(n.id); });
		doc.objs = doc.objs.slice(); sel = ids; setTool("select"); commit();
	}
	function addImageFile(file, at) {
		var url = URL.createObjectURL(file), im = new Image();
		im.onload = function () {
			var mx = 2048, w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, mx / Math.max(w, h)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
			c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
			var src = c.toDataURL("image/webp", 0.92); if (!/^data:image\/webp/.test(src)) src = c.toDataURL("image/png");
			var fitK = Math.min(doc.w * 0.7 / c.width, doc.h * 0.7 / c.height, 1), dw = c.width * fitK, dh = c.height * fitK, ctr = at || viewCentre();
			var o = prep({ t: "img", src: src, x: ctr[0] - dw / 2, y: ctr[1] - dh / 2, w: dw, h: dh, o: 1, m: D.I.slice() });
			doc.objs = doc.objs.concat([o]); sel = [o.id]; setTool("select"); commit(); tip("Picture added");
		};
		im.onerror = function () { URL.revokeObjectURL(url); toast("That picture could not be opened"); };
		im.src = url;
	}
	function openFiles(files, at) {
		Array.from(files || []).forEach(function (f) {
			if (/^image\//.test(f.type)) addImageFile(f, at);
			else if (/\.(mesdraw|json)$/i.test(f.name) || f.type === "application/json") f.text().then(function (t) { var d = D.parse(t); if (!d) { toast("That is not a MES Draw file"); return; } saveNow(); d.id = uid(); setDoc(d, true); toast("Opened " + d.name); });
		});
	}

	/* ---------- selection actions ---------- */
	function delSel() { if (!sel.length) return; doc.objs = doc.objs.filter(function (o) { return sel.indexOf(o.id) < 0; }); sel = []; commit(); }
	function duplicate(inPlace) { var l = selObjs(); if (!l.length) return; var d = inPlace ? 0 : 24 / view.s; insertObjs(l, d); }
	function order(front) { var l = selObjs(), rest = doc.objs.filter(function (o) { return sel.indexOf(o.id) < 0; }); doc.objs = front ? rest.concat(l) : l.concat(rest); commit(); }
	function flip(h) { var b = selBox(); if (!b) return; var M = h ? D.scaleAt(-1, 1, b.x + b.w / 2, 0) : D.scaleAt(1, -1, 0, b.y + b.h / 2); doc.objs = doc.objs.map(function (o) { return sel.indexOf(o.id) >= 0 ? clone(o, { m: D.mul(M, o.m) }) : o; }); commit(); }
	function group(un) {
		var l = selObjs(); if (!l.length) return;
		if (un || (l.every(function (o) { return o.g && o.g === l[0].g; }))) { doc.objs = doc.objs.map(function (o) { if (sel.indexOf(o.id) < 0) return o; var c = clone(o); delete c.g; return c; }); tip("Ungrouped"); }
		else { if (l.length < 2) { tip("Select two or more things to group them"); return; } var g = uid(); doc.objs = doc.objs.map(function (o) { return sel.indexOf(o.id) >= 0 ? clone(o, { g: g }) : o; }); tip("Grouped: they now move together"); }
		commit();
	}
	function nudge(dx, dy) { if (!sel.length) return; var M = D.tr(dx, dy); doc.objs = doc.objs.map(function (o) { return sel.indexOf(o.id) >= 0 ? clone(o, { m: D.mul(M, o.m) }) : o; }); dirty(); clearTimeout(nudge.t); nudge.t = setTimeout(commit, 400); }
	/* style changes go to the selection when there is one */
	function styleSel(kind, v) {
		var l = selObjs(); if (!l.length || S.tool !== "select") return false;
		l.forEach(function (o) {
			var p = null;
			if (kind === "c") p = o.t === "img" ? null : { c: v };
			else if (kind === "f") p = o.t === "shape" ? { f: v } : o.t === "text" ? { bgc: v } : null;
			else if (kind === "w") p = o.t === "path" ? { w: v } : o.t === "shape" ? { sw: v } : null;
			else if (kind === "o") p = { o: v };
			else if (kind === "dash") p = o.t === "shape" ? { dash: v } : null;
			else if (o.t === "text") { var map = { font: "font", fs: "size", b: "b", i: "i", al: "al", sc: "sc" }; if (map[kind]) { p = {}; p[map[kind]] = v; } }
			if (p) replace(o.id, p);
		});
		clearTimeout(styleSel.t); styleSel.t = setTimeout(commit, 350); dirty(); return true;
	}

	/* ---------- UI: tools + options ---------- */
	function buildTools() {
		var h = "";
		TOOLS.forEach(function (t) { if (t === "-") { h += '<span class="dr-tsep"></span>'; return; } h += '<button type="button" class="dr-tool" data-tool="' + t[0] + '" title="' + t[1] + " (" + t[2] + ')" aria-label="' + t[1] + '" aria-pressed="false"><svg viewBox="0 0 24 24">' + t[3] + '</svg><span class="dr-k">' + t[2] + "</span></button>"; });
		$("dr-tools").innerHTML = h;
		$("dr-tools").addEventListener("click", function (e) { var b = e.target.closest("[data-tool]"); if (b) setTool(b.getAttribute("data-tool")); });
	}
	function setTool(t) {
		if (editing && t !== "text") finishText();
		if (SHAPE_TOOL[t]) { S.kind = SHAPE_TOOL[t]; }
		S.tool = t; saveS();
		Array.prototype.forEach.call(document.querySelectorAll("#dr-tools [data-tool]"), function (b) { var bt = b.getAttribute("data-tool"); b.setAttribute("aria-pressed", String(bt === t || (bt === "shape" && SHAPE_TOOL[t] && false))); });
		var cls = SHAPE_TOOL[t] ? "shape" : t === "fill" || t === "picker" || t === "hand" ? "none" : t;
		Array.prototype.forEach.call(document.querySelectorAll("#dr-opts [data-for]"), function (g) { var f = " " + g.getAttribute("data-for") + " "; g.hidden = f.indexOf(" " + cls + " ") < 0 && !(cls === "select" && false); });
		// size slider label / range by tool
		var wl = $("dr-wl"), w2 = $("dr-w2");
		if (t === "eraser") { wl.textContent = "Size"; w2.min = 4; w2.max = 200; w2.value = S.ew; }
		else if (cls === "shape") { wl.textContent = "Line"; w2.min = 0; w2.max = 60; w2.value = S.sw; }
		else { wl.textContent = "Size"; w2.min = 1; w2.max = 120; w2.value = S.w; }
		$("dr-wv").textContent = w2.value;
		if (t !== "select") { /* keep the selection visible but faint */ }
		uiKind(); uiSel(); dirty(false);
		tip({ brush: "Draw. Hold Shift for a straight line.", eraser: S.emode === "rub" ? "Rub out (paper lines stay)" : "Touch a line, shape or text to remove it", fill: "Click something to paint it, or the page to change its colour", picker: "Click the drawing to take a colour", hand: "Drag to move around", text: "Click where the text should go", select: "Click or drag a box to select. Drag to move.", shape: "Drag to draw. Shift = square / circle, Alt = from the centre" }[cls] || (cls === "shape" ? "" : ""));
	}
	function uiSel() {
		var has = sel.length > 0 && S.tool === "select"; $("dr-selacts").hidden = !has;
		if (has) {
			var l = selObjs(), o = l[0];
			// show the options that fit the selection
			var types = {}; l.forEach(function (x) { types[x.t] = 1; });
			Array.prototype.forEach.call(document.querySelectorAll("#dr-opts [data-for]"), function (g) { var f = g.getAttribute("data-for"); g.hidden = !(f.indexOf("select") >= 0 || (types.text && f === "text")); });
			var allg = l.length > 1 && l.every(function (x) { return x.g && x.g === l[0].g; }); $("dr-group").textContent = allg ? "Ungroup" : "Group";
			if (o && l.length === 1) {
				if (o.c) setSw("dr-cdot", o.c);
				if (o.t === "shape") { $("dr-w2").min = 0; $("dr-w2").max = 60; $("dr-w2").value = o.sw; $("dr-wv").textContent = o.sw; $("dr-fon").checked = !!o.f; if (o.f) setSw("dr-fdot", o.f); }
				else if (o.t === "path") { $("dr-w2").min = 1; $("dr-w2").max = 120; $("dr-w2").value = o.w; $("dr-wv").textContent = Math.round(o.w); }
				if (o.t === "text") { $("dr-fs").value = Math.round(o.size); $("dr-font").value = o.font; $("dr-bold").setAttribute("aria-pressed", String(!!o.b)); $("dr-ital").setAttribute("aria-pressed", String(!!o.i)); segSet("dr-al", o.al || "l"); $("dr-son").checked = !!o.sc; $("dr-fon").checked = !!o.bgc; }
				$("dr-o").value = Math.round((o.o == null ? 1 : o.o) * 100); $("dr-ov").textContent = $("dr-o").value + "%";
			}
		} else if (S.tool === "select") Array.prototype.forEach.call(document.querySelectorAll("#dr-opts [data-for]"), function (g) { g.hidden = true; });
	}
	function setSw(id, c) { $(id).style.background = c; }
	function segSet(id, v) { Array.prototype.forEach.call($(id).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(v))); }); }
	function segWire(id, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; segSet(id, b.getAttribute("data-v")); fn(b.getAttribute("data-v")); }); }
	function setColor(c) {
		S.c = c; $("dr-c").value = c; setSw("dr-cdot", c); S.recent = [c].concat(S.recent.filter(function (x) { return x !== c; })).slice(0, 8); saveS(); buildPal(); styleSel("c", c);
	}
	function buildPal() {
		var h = PAL.map(function (c) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="Colour ' + c + '" aria-pressed="' + (c === S.c) + '"></button>'; }).join("");
		var rec = S.recent.filter(function (c) { return PAL.indexOf(c) < 0; });
		if (rec.length) h += '<span class="dr-palsep"></span>' + rec.map(function (c) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" title="Recent: ' + c + '" aria-label="Recent colour ' + c + '" aria-pressed="' + (c === S.c) + '"></button>'; }).join("");
		$("dr-pal").innerHTML = h;
	}
	function uiKind() { var k = S.kind, nm = (D.SHAPES.filter(function (s) { return s[0] === k; })[0] || ["", "Shape"])[1]; $("dr-kind").innerHTML = '<svg viewBox="0 0 100 100" width="18" height="18" style="vertical-align:-3px;fill:none;stroke:currentColor;stroke-width:8"><path d="' + D.shapeD(k, 12, 18, 76, 64, 8) + '"/></svg> ' + nm; paneShapes(true); }
	function wireOpts() {
		$("dr-cbtn").addEventListener("click", function () { $("dr-c").click(); });
		$("dr-c").addEventListener("input", function () { S.c = this.value; setSw("dr-cdot", S.c); styleSel("c", S.c); });
		$("dr-c").addEventListener("change", function () { setColor(this.value); });
		$("dr-pal").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (b) setColor(b.getAttribute("data-c")); });
		$("dr-fbtn").addEventListener("click", function () { $("dr-f").click(); });
		$("dr-f").addEventListener("input", function () { S.fc = this.value; setSw("dr-fdot", S.fc); S.fOn = true; $("dr-fon").checked = true; saveS(); styleSel("f", S.fc); });
		$("dr-fon").addEventListener("change", function () { S.fOn = this.checked; saveS(); styleSel("f", S.fOn ? S.fc : null); });
		$("dr-w2").addEventListener("input", function () {
			var v = +this.value; $("dr-wv").textContent = v;
			if (styleSel("w", v)) return;
			if (S.tool === "eraser") S.ew = v; else if (S.tool === "shape" || SHAPE_TOOL[S.tool]) S.sw = v; else S.w = v; saveS(); dirty(false);
		});
		$("dr-o").addEventListener("input", function () { var v = +this.value / 100; $("dr-ov").textContent = this.value + "%"; if (!styleSel("o", v)) { S.o = v; saveS(); } });
		$("dr-brush").innerHTML = D.BRUSHES.map(function (b) { return '<option value="' + b[0] + '" title="' + b[2] + '">' + b[1] + "</option>"; }).join("");
		$("dr-brush").value = S.brush; $("dr-brush").addEventListener("change", function () { S.brush = this.value; if (S.brush === "hl" && S.w < 14) { S.w = 22; $("dr-w2").value = 22; $("dr-wv").textContent = 22; } saveS(); });
		$("dr-sym").value = S.sym; $("dr-sym").addEventListener("change", function () { S.sym = this.value; saveS(); dirty(false); if (S.sym !== "off") tip("Symmetry around the middle of the page"); });
		$("dr-smooth").value = S.smooth; $("dr-smooth").addEventListener("input", function () { S.smooth = +this.value; saveS(); });
		segSet("dr-emode", S.emode); segWire("dr-emode", function (v) { S.emode = v; saveS(); setTool("eraser"); });
		$("dr-kind").addEventListener("click", function () { S.side = true; uiSide(); setTab("shapes"); });
		$("dr-dash").checked = S.dash; $("dr-dash").addEventListener("change", function () { S.dash = this.checked; saveS(); styleSel("dash", S.dash); });
		$("dr-font").innerHTML = FONTS.map(function (f) { return '<option value="' + f[0].replace(/"/g, "&quot;") + '" style="font-family:' + f[0].replace(/"/g, "&quot;") + '">' + f[1] + "</option>"; }).join("");
		$("dr-font").value = S.font; $("dr-font").addEventListener("change", function () { S.font = this.value; saveS(); styleSel("font", S.font); if (editing) { editing.obj = clone(editing.obj, { font: S.font }); placeEditor(); } });
		$("dr-fs").value = S.fs; $("dr-fs").addEventListener("input", function () { var v = Math.max(6, Math.min(600, +this.value || 48)); S.fs = v; saveS(); styleSel("fs", v); if (editing) { editing.obj = clone(editing.obj, { size: v }); placeEditor(); } });
		function tg(id, key) { var b = $(id); b.setAttribute("aria-pressed", String(!!S[key])); b.addEventListener("click", function () { var on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); S[key] = on; saveS(); styleSel(key, on); if (editing) { var p = {}; p[key] = on; editing.obj = clone(editing.obj, p); placeEditor(); } }); }
		tg("dr-bold", "b"); tg("dr-ital", "i");
		segSet("dr-al", S.al); segWire("dr-al", function (v) { S.al = v; saveS(); styleSel("al", v); if (editing) { editing.obj = clone(editing.obj, { al: v }); placeEditor(); } });
		$("dr-son").checked = S.sOn; $("dr-sc").value = S.sc;
		$("dr-son").addEventListener("change", function () { S.sOn = this.checked; saveS(); styleSel("sc", S.sOn ? S.sc : null); });
		$("dr-sc").addEventListener("input", function () { S.sc = this.value; S.sOn = true; $("dr-son").checked = true; saveS(); styleSel("sc", S.sc); });
		$("dr-dup").addEventListener("click", function () { duplicate(); });
		$("dr-front").addEventListener("click", function () { order(true); }); $("dr-back").addEventListener("click", function () { order(false); });
		$("dr-fliph").addEventListener("click", function () { flip(true); }); $("dr-flipv").addEventListener("click", function () { flip(false); });
		$("dr-group").addEventListener("click", function () { group(false); }); $("dr-del").addEventListener("click", delSel);
		setSw("dr-cdot", S.c); setSw("dr-fdot", S.fc); $("dr-c").value = S.c; $("dr-f").value = S.fc; $("dr-fon").checked = S.fOn; $("dr-o").value = Math.round(S.o * 100); $("dr-ov").textContent = $("dr-o").value + "%";
	}

	/* ---------- top bar, page, export ---------- */
	function pop(id, btn, open) {
		var p = $(id), on = open === undefined ? p.hidden : open; ["dr-pagepop", "dr-exppop"].forEach(function (x) { $(x).hidden = true; }); ["dr-pagebtn", "dr-expbtn"].forEach(function (x) { $(x).setAttribute("aria-expanded", "false"); });
		p.hidden = !on; $(btn).setAttribute("aria-expanded", String(on)); if (on && id === "dr-exppop") xinfo(); setTimeout(resize, 0);
	}
	function uiPage() {
		if (!doc) return; $("dr-w").value = doc.w; $("dr-h").value = doc.h; $("dr-paper").value = doc.bg.p || "none"; $("dr-bgt").checked = !doc.bg.c; if (doc.bg.c) $("dr-bgc").value = doc.bg.c;
		var m = D.SIZES.filter(function (s) { return s[2] === doc.w && s[3] === doc.h; })[0]; $("dr-size").value = m ? m[0] : "custom";
	}
	function wireBar() {
		$("dr-name").addEventListener("input", function () { doc.name = this.value.trim() || "Untitled drawing"; scheduleSave(); cloudTick(); });
		$("dr-new").addEventListener("click", function () { newDoc("blank"); toast("New drawing. Your last one is in My drawings."); });
		$("dr-undo").addEventListener("click", undo); $("dr-redo").addEventListener("click", redo);
		$("dr-zin").addEventListener("click", function () { zoomAt(1.25, W / 2, H / 2); }); $("dr-zout").addEventListener("click", function () { zoomAt(0.8, W / 2, H / 2); }); $("dr-zfit").addEventListener("click", fit);
		$("dr-pagebtn").addEventListener("click", function () { pop("dr-pagepop", "dr-pagebtn"); }); $("dr-pageok").addEventListener("click", function () { pop("dr-pagepop", "dr-pagebtn", false); });
		$("dr-expbtn").addEventListener("click", function () { pop("dr-exppop", "dr-expbtn"); });
		$("dr-sidebtn").addEventListener("click", function () { S.side = !S.side; saveS(); uiSide(); });
		$("dr-size").innerHTML = D.SIZES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + '<option value="custom">Custom</option>';
		$("dr-paper").innerHTML = D.PAPERS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + "</option>"; }).join("");
		$("dr-size").addEventListener("change", function () { var s = D.SIZES.filter(function (x) { return x[0] === this.value; }, this)[0]; if (s) setSize(s[2], s[3]); });
		function wh() { var w = Math.round(+$("dr-w").value), h = Math.round(+$("dr-h").value); if (w >= 16 && h >= 16 && w <= 8000 && h <= 8000) setSize(w, h); }
		$("dr-w").addEventListener("change", wh); $("dr-h").addEventListener("change", wh);
		$("dr-paper").addEventListener("change", function () { doc.bg = { c: doc.bg.c, p: this.value }; commit(); });
		$("dr-bgc").addEventListener("input", function () { doc.bg = { c: this.value, p: doc.bg.p }; $("dr-bgt").checked = false; dirty(); });
		$("dr-bgc").addEventListener("change", function () { commit(); });
		$("dr-bgt").addEventListener("change", function () { doc.bg = { c: this.checked ? null : $("dr-bgc").value, p: doc.bg.p }; commit(); });
		segSet("dr-fmt", S.fmt); segWire("dr-fmt", function (v) { S.fmt = v; saveS(); xinfo(); });
		segSet("dr-scale", String(S.scale)); segWire("dr-scale", function (v) { S.scale = +v; saveS(); xinfo(); });
		segSet("dr-what", S.what); segWire("dr-what", function (v) { S.what = v; saveS(); xinfo(); });
		$("dr-xbg").checked = S.xbg; $("dr-xpaper").checked = S.xpaper;
		$("dr-xbg").addEventListener("change", function () { S.xbg = this.checked; saveS(); xinfo(); }); $("dr-xpaper").addEventListener("change", function () { S.xpaper = this.checked; saveS(); });
		$("dr-xdl").addEventListener("click", download); $("dr-xcopy").addEventListener("click", copyImage); $("dr-xphoto").addEventListener("click", toPhoto);
		$("dr-xsave").addEventListener("click", function () { blobDl(new Blob([D.serialize(doc)], { type: "application/json" }), fileBase() + ".mesdraw"); toast("Saved " + fileBase() + ".mesdraw"); });
		$("dr-xopen").addEventListener("click", function () { $("dr-file").click(); });
		$("dr-file").addEventListener("change", function () { openFiles(this.files); this.value = ""; });
	}
	function setSize(w, h) { doc.w = w; doc.h = h; commit(); uiPage(); fit(); }
	function uiSide() { root.classList.toggle("dr-noside", !S.side); $("dr-sidebtn").setAttribute("aria-pressed", String(S.side)); setTimeout(resize, 0); }

	/* rendering a drawing to any canvas (export, thumbnails) */
	function cropBox() {
		if (S.what === "sel" && sel.length) return pad(selBox());
		if (S.what === "trim") { var l = doc.objs.filter(function (o) { return !(o.t === "path" && o.brush === "erase"); }); if (l.length) { var b = pad(D.unionBox(l)); var x0 = Math.max(0, b.x), y0 = Math.max(0, b.y); return { x: x0, y: y0, w: Math.min(doc.w, b.x + b.w) - x0, h: Math.min(doc.h, b.y + b.h) - y0 }; } }
		return { x: 0, y: 0, w: doc.w, h: doc.h };
	}
	function pad(b) { var p = Math.max(4, Math.min(b.w, b.h) * 0.03); return { x: Math.floor(b.x - p), y: Math.floor(b.y - p), w: Math.ceil(b.w + p * 2), h: Math.ceil(b.h + p * 2) }; }
	function renderTo(d, k, crop, o) {
		o = o || {}; var c = document.createElement("canvas"), w = Math.max(1, Math.round(crop.w * k)), h = Math.max(1, Math.round(crop.h * k)); c.width = w; c.height = h;
		var g = c.getContext("2d"), T = [k, 0, 0, k, -crop.x * k, -crop.y * k], onlySel = o.onlySel;
		if (o.bg && d.bg.c) { g.fillStyle = d.bg.c; g.fillRect(0, 0, w, h); } else if (o.white) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); }
		if (o.paper && d.bg.p && d.bg.p !== "none") { g.setTransform.apply(g, T); D.paper(d.bg.p, d.w, d.h).forEach(function (l) { var p = new Path2D(l.d); if (l.fill) { g.fillStyle = l.fill; g.fill(p); } else { g.strokeStyle = l.stroke; g.lineWidth = Math.max(l.sw, 0.7 / k); g.stroke(p); } }); g.setTransform(1, 0, 0, 1, 0, 0); }
		var ic = document.createElement("canvas"); ic.width = w; ic.height = h; var ig = ic.getContext("2d"); ig.setTransform.apply(ig, T);
		var ed = editing; editing = null;
		d.objs.forEach(function (ob) { if (onlySel && sel.indexOf(ob.id) < 0 && !(ob.t === "path" && ob.brush === "erase")) return; drawObj(ig, ob, k); });
		editing = ed; g.drawImage(ic, 0, 0); return c;
	}
	function thumb(d, max) { try { var k = Math.min(max / d.w, max / d.h); return renderTo(d, k, { x: 0, y: 0, w: d.w, h: d.h }, { bg: true, paper: true, white: false }).toDataURL("image/webp", 0.7); } catch (e) { return ""; } }
	function fileBase() { return (doc.name || "drawing").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "drawing"; }
	function xinfo() { var c = cropBox(), k = S.fmt === "svg" ? 1 : S.scale; $("dr-xinfo").textContent = S.fmt === "svg" ? "SVG: " + c.w + " × " + c.h + " (sharp at any size)" : Math.round(c.w * k) + " × " + Math.round(c.h * k) + " pixels" + (S.fmt === "png" && (!S.xbg || !doc.bg.c) ? " · see-through background" : ""); }
	function exportBlob() {
		var crop = cropBox(), onlySel = S.what === "sel" && sel.length > 0;
		if (S.fmt === "svg") {
			var sub = { w: crop.w, h: crop.h, bg: S.xbg ? doc.bg : { c: null, p: S.xpaper ? doc.bg.p : "none" }, objs: doc.objs.filter(function (o) { return !onlySel || sel.indexOf(o.id) >= 0 || (o.t === "path" && o.brush === "erase"); }).map(function (o) { return clone(o, { m: D.mul(D.tr(-crop.x, -crop.y), o.m) }); }) };
			if (!S.xpaper) sub.bg = { c: sub.bg.c, p: "none" };
			return Promise.resolve(new Blob([D.toSVG(sub, { bg: S.xbg, paper: S.xpaper })], { type: "image/svg+xml" }));
		}
		var c = renderTo(doc, S.scale, crop, { bg: S.xbg, paper: S.xpaper, white: S.fmt === "jpeg", onlySel: onlySel });
		return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error("too big")); }, S.fmt === "jpeg" ? "image/jpeg" : "image/png", 0.92); });
	}
	function blobDl(b, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
	function download() { exportBlob().then(function (b) { var ext = S.fmt === "jpeg" ? "jpg" : S.fmt; blobDl(b, fileBase() + "." + ext); toast("Downloaded " + fileBase() + "." + ext); }, function () { toast("That is too big for this browser: try a smaller size"); }); }
	function copyImage() {
		if (!navigator.clipboard || !window.ClipboardItem) { toast("This browser can't copy pictures: use Download"); return; }
		var keep = S.fmt; if (S.fmt !== "png") S.fmt = "png"; var p = exportBlob(); S.fmt = keep;
		navigator.clipboard.write([new ClipboardItem({ "image/png": p })]).then(function () { toast("Copied: paste it anywhere with Ctrl+V"); }, function () { toast("Could not copy: try Download"); });
	}
	function toPhoto() {
		var I = window.MESImg; var keep = S.fmt; S.fmt = "png"; var p = exportBlob(); S.fmt = keep;
		if (!I || !I.handoffSend) { window.open("/photo", "_blank"); return; }
		var w = null; try { w = window.open("about:blank", "_blank"); } catch (e) {}
		p.then(function (b) { return I.handoffPut([{ blob: b, name: fileBase() + ".png", type: "image/png" }]); }).then(function (id) { var url = "/photo?handoff=" + encodeURIComponent(id); if (w && !w.closed) { try { w.opener = null; } catch (e) {} w.location.href = url; toast("Opened in the Photo Editor in a new tab"); } else location.href = url; }, function () { if (w) w.close(); toast("Could not hand the picture over"); });
	}

	/* ---------- side panel ---------- */
	function setTab(t) {
		S.tab = t; saveS();
		Array.prototype.forEach.call(document.querySelectorAll("#dr-tabs [role=tab]"), function (b) { var on = b.getAttribute("data-t") === t; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
		["shapes", "emoji", "symbols", "tpl", "mine"].forEach(function (x) { $("dr-p-" + x).hidden = x !== t; });
		({ shapes: paneShapes, emoji: function () { paneChars("emoji"); }, symbols: function () { paneChars("symbols"); }, tpl: paneTpl, mine: paneMine })[t]();
	}
	function paneShapes(onlyMark) {
		var el = $("dr-p-shapes");
		if (!el.firstChild || !onlyMark) {
			el.innerHTML = '<div class="dr-gh">Pick a shape, then drag on the page</div><div class="dr-shgrid">' + D.SHAPES.map(function (s) { return '<button type="button" class="dr-sh" data-k="' + s[0] + '" title="' + s[1] + '" aria-label="' + s[1] + '" aria-pressed="false"><svg viewBox="0 0 100 100"><path d="' + D.shapeD(s[0], 12, 16, 76, 68, 6) + '"/></svg></button>'; }).join("") + "</div>" +
				'<p class="dr-empty" style="margin-top:.7em">Fill, line width, dashes and colour are in the bar above. Hold <b>Shift</b> while dragging for a perfect square, circle or straight line.</p>';
		}
		Array.prototype.forEach.call(el.querySelectorAll(".dr-sh"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-k") === S.kind)); });
	}
	var charState = { emoji: { q: "", g: "" }, symbols: { q: "", g: "" } };
	function paneChars(which) {
		var el = $("dr-p-" + which), data = which === "emoji" ? D.EMOJI : D.SYMBOLS, st = charState[which];
		if (!el.querySelector(".dr-search")) {
			el.innerHTML = '<input type="search" class="dr-search" placeholder="Search ' + (which === "emoji" ? "emoji (cat, heart, star…)" : "symbols (arrow, pi, check…)") + '" aria-label="Search"><div class="dr-chips"></div><div class="dr-cl"></div><p class="dr-empty" style="margin-top:.6em">Click to put it in the middle of the page, or drag it onto the page.</p>';
			el.querySelector(".dr-search").addEventListener("input", function () { st.q = this.value; listChars(which); });
			el.querySelector(".dr-chips").addEventListener("click", function (e) { var b = e.target.closest("[data-g]"); if (!b) return; st.g = st.g === b.getAttribute("data-g") ? "" : b.getAttribute("data-g"); listChars(which); });
			el.querySelector(".dr-cl").addEventListener("click", function (e) { var b = e.target.closest("[data-ch]"); if (b) insertChar(b.getAttribute("data-ch"), which === "emoji"); });
			el.querySelector(".dr-cl").addEventListener("dragstart", function (e) { var b = e.target.closest("[data-ch]"); if (b) { e.dataTransfer.setData("text/plain", b.getAttribute("data-ch")); e.dataTransfer.setData("application/x-mes-draw-kind", which); e.dataTransfer.effectAllowed = "copy"; } });
		}
		el.querySelector(".dr-chips").innerHTML = Object.keys(data).map(function (g) { return '<button type="button" class="dr-chip" data-g="' + g + '" aria-pressed="' + (st.g === g) + '">' + g + "</button>"; }).join("");
		listChars(which);
	}
	function listChars(which) {
		var el = $("dr-p-" + which), data = which === "emoji" ? D.EMOJI : D.SYMBOLS, st = charState[which], cls = which === "emoji" ? "dr-gi" : "dr-gi dr-gi--sym", h = "";
		Array.prototype.forEach.call(el.querySelectorAll(".dr-chip"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-g") === st.g)); });
		var list = D.search(data, st.q).filter(function (e) { return !st.g || e.group === st.g; }), lastG = "";
		list.forEach(function (e) { if (e.group !== lastG) { if (lastG) h += "</div>"; h += '<div class="dr-gh">' + e.group + '</div><div class="dr-grid">'; lastG = e.group; } h += '<button type="button" class="' + cls + '" data-ch="' + e.ch + '" title="' + e.words + '" aria-label="' + e.words + '" draggable="true">' + e.ch + "</button>"; });
		if (lastG) h += "</div>"; el.querySelector(".dr-cl").innerHTML = h || '<p class="dr-empty">Nothing found.</p>';
	}
	var tplThumbs = {}, tplCat = "";
	function paneTpl() {
		var el = $("dr-p-tpl"), cats = [];
		D.TEMPLATES.forEach(function (t) { if (cats.indexOf(t.cat) < 0) cats.push(t.cat); });
		var h = '<div class="dr-chips">' + ['<button type="button" class="dr-chip" data-cat="" aria-pressed="' + (!tplCat) + '">All</button>'].concat(cats.map(function (c) { return '<button type="button" class="dr-chip" data-cat="' + c + '" aria-pressed="' + (tplCat === c) + '">' + c + "</button>"; })).join("") + "</div>";
		cats.filter(function (c) { return !tplCat || c === tplCat; }).forEach(function (c) {
			h += '<div class="dr-gh">' + c + '</div><div class="dr-tgrid">' + D.TEMPLATES.filter(function (t) { return t.cat === c; }).map(function (t) { return '<button type="button" class="dr-tc" data-tpl="' + t.id + '"><span class="dr-tph" data-th="' + t.id + '"></span><span>' + t.name + "</span></button>"; }).join("") + "</div>";
		});
		h += '<p class="dr-empty" style="margin-top:.7em">A template starts a new drawing; the one you were working on stays in My drawings.</p>';
		el.innerHTML = h;
		el.onclick = function (e) {
			var cb = e.target.closest("[data-cat]"); if (cb) { tplCat = cb.getAttribute("data-cat"); paneTpl(); return; }
			var b = e.target.closest("[data-tpl]"); if (!b) return; var t = D.TEMPLATES.filter(function (x) { return x.id === b.getAttribute("data-tpl"); })[0];
			newDoc(t.id, t.name); toast("Started “" + t.name + "”. Your last drawing is in My drawings.");
		};
		var todo = Array.prototype.slice.call(el.querySelectorAll("[data-th]"));
		(function next() {
			var t0 = performance.now();
			while (todo.length && performance.now() - t0 < 25) { var sp = todo.shift(), id = sp.getAttribute("data-th"); if (!tplThumbs[id]) { var d = D.template(id); d.objs.forEach(prep); tplThumbs[id] = thumb(d, 200); } var im = new Image(); im.alt = ""; im.src = tplThumbs[id]; sp.replaceWith(im); }
			if (todo.length) setTimeout(next, 16);
		})();
	}
	var deleted = null;
	function paneMine() {
		var el = $("dr-p-mine");
		getAll().then(function (list) {
			list.sort(function (a, b) { return b.t - a.t; });
			if (!list.length) { el.innerHTML = '<p class="dr-empty">No drawings yet.</p>'; return; }
			el.innerHTML = '<div class="dr-gh">' + list.length + " drawing" + (list.length === 1 ? "" : "s") + ' in this browser</div><div class="dr-tgrid">' + list.map(function (d) {
				var when = new Date(d.t).toLocaleDateString([], { month: "short", day: "numeric" }) + " " + new Date(d.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
				return '<div class="dr-tc' + (doc && d.id === doc.id ? " is-cur" : "") + '" data-id="' + d.id + '" role="button" tabindex="0" title="Open ' + escA(d.name) + '">' + (d.thumb ? '<img src="' + d.thumb + '" alt="">' : '<span class="dr-tph"></span>') + "<span>" + escH(d.name) + "</span><small>" + when + '</small><span class="dr-mrow"><button type="button" data-act="dup">Copy</button><button type="button" data-act="del">Delete</button></span></div>';
			}).join("") + '</div><p class="dr-empty" style="margin-top:.7em">Kept in this browser only. To move a drawing to another computer, use Export → Save as .mesdraw file.</p>';
			el.onclick = function (e) {
				var card = e.target.closest("[data-id]"); if (!card) return; var id = card.getAttribute("data-id"), act = e.target.closest("[data-act]");
				if (act && act.getAttribute("data-act") === "del") {
					getDoc(id).then(function (rec) { deleted = rec; return tx("readwrite", function (st) { st.delete(id); }); }).then(function () {
						if (doc && doc.id === id) { setDoc(D.template("blank"), false); } paneMine(); toast("Deleted", "Undo", function () { if (deleted) tx("readwrite", function (st) { st.put(deleted); }).then(paneMine); });
					}); return;
				}
				if (act && act.getAttribute("data-act") === "dup") { getDoc(id).then(function (rec) { if (!rec) return; rec.id = uid(); rec.name = rec.name + " (copy)"; rec.t = Date.now(); return tx("readwrite", function (st) { st.put(rec); }); }).then(paneMine); return; }
				if (doc && id === doc.id) return; saveNow().then(function () { return getDoc(id); }).then(function (rec) { if (rec) { setDoc(rec, false); paneMine(); } });
			};
		});
	}
	function escH(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
	function escA(s) { return escH(s).replace(/"/g, "&quot;"); }

	/* ---------- toasts / tips ---------- */
	var tipT = 0;
	function tip(t) { var el = $("dr-tip"); if (!t) return; el.textContent = t; el.classList.add("is-on"); clearTimeout(tipT); tipT = setTimeout(function () { el.classList.remove("is-on"); }, 1800); }
	var toastT = 0;
	function toast(t, act, fn) { var el = $("dr-toast"); el.innerHTML = ""; el.appendChild(document.createTextNode(t)); if (act) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-btn"; b.style.marginLeft = "0.7em"; b.textContent = act; b.onclick = function () { fn(); el.classList.remove("tu-toast--show"); }; el.appendChild(b); } el.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("tu-toast--show"); }, act ? 6000 : 2600); }

	/* ---------- keyboard, clipboard, drop ---------- */
	document.addEventListener("pointerdown", function (e) { active = !!(e.target.closest && e.target.closest("#dr-view")); }, true);
	function typing(e) { var t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
	document.addEventListener("keydown", function (e) {
		if (!active || typing(e) || editing) return;
		var k = e.key, mod = e.ctrlKey || e.metaKey, done = true;
		if (mod && (k === "z" || k === "Z")) { if (e.shiftKey) redo(); else undo(); }
		else if (mod && (k === "y" || k === "Y")) redo();
		else if (mod && (k === "a" || k === "A")) { setTool("select"); sel = doc.objs.filter(function (o) { return !(o.t === "path" && o.brush === "erase"); }).map(function (o) { return o.id; }); uiSel(); dirty(false); }
		else if (mod && (k === "d" || k === "D")) duplicate();
		else if (mod && (k === "g" || k === "G")) group(e.shiftKey);
		else if (mod && (k === "e" || k === "E")) pop("dr-exppop", "dr-expbtn", true);
		else if (mod && (k === "s" || k === "S")) { saveNow(); if (!(cloud && cloud.save(doc))) toast("Saved in this browser. To keep it in OneDrive, Dropbox, Google Drive or a folder, press ☁ Cloud."); }
		else if (mod && k === "]") order(true); else if (mod && k === "[") order(false);
		else if (mod) done = false;
		else if (k === "Delete" || k === "Backspace") delSel();
		else if (k === "Escape") { if (op) cancelOp(); else { sel = []; uiSel(); dirty(false); } pop("dr-pagepop", "dr-pagebtn", false); }
		else if (k.indexOf("Arrow") === 0 && sel.length) { var st = (e.shiftKey ? 10 : 1); nudge(k === "ArrowLeft" ? -st : k === "ArrowRight" ? st : 0, k === "ArrowUp" ? -st : k === "ArrowDown" ? st : 0); }
		else if (k === " ") { if (!spaceDown) { spaceDown = true; cv.style.cursor = "grab"; } }
		else if (k === "+" || k === "=") zoomAt(1.25, W / 2, H / 2); else if (k === "-" || k === "_") zoomAt(0.8, W / 2, H / 2); else if (k === "0") fit();
		else if (k === "[" || k === "]") { var w2 = $("dr-w2"); w2.value = Math.max(+w2.min, Math.min(+w2.max, +w2.value + (k === "]" ? 1 : -1) * Math.max(1, Math.round(+w2.value * 0.15)))); w2.dispatchEvent(new Event("input")); tip("Size " + w2.value); }
		else { var map = { v: "select", h: "hand", b: "brush", p: "brush", e: "eraser", s: "shape", r: "rect", o: "ellipse", l: "line", a: "arrow", t: "text", f: "fill", i: "picker" }; var tl = map[k.toLowerCase()]; if (tl) setTool(tl); else done = false; }
		if (done) e.preventDefault();
	});
	document.addEventListener("keyup", function (e) { if (e.key === " ") { spaceDown = false; if (hover) cursor(hover); } });
	window.addEventListener("blur", function () { spaceDown = false; });
	document.addEventListener("copy", function (e) { if (!active || typing(e) || !sel.length) return; e.clipboardData.setData("text/plain", JSON.stringify({ app: "mes-draw-clip", objs: selObjs().map(D.cleanObj) })); e.preventDefault(); tip("Copied"); });
	document.addEventListener("cut", function (e) { if (!active || typing(e) || !sel.length) return; e.clipboardData.setData("text/plain", JSON.stringify({ app: "mes-draw-clip", objs: selObjs().map(D.cleanObj) })); e.preventDefault(); delSel(); });
	document.addEventListener("paste", function (e) {
		if (!active || typing(e) || editing) return; var cd = e.clipboardData; if (!cd) return;
		var files = Array.from(cd.files || []).filter(function (f) { return /^image\//.test(f.type); });
		if (files.length) { e.preventDefault(); files.forEach(function (f) { addImageFile(f); }); return; }
		var t = cd.getData("text/plain"); if (!t) return; e.preventDefault();
		try { var j = JSON.parse(t); if (j && j.app === "mes-draw-clip" && Array.isArray(j.objs)) { insertObjs(j.objs.map(D.cleanObj).filter(Boolean), 24 / view.s); return; } } catch (x) {}
		var c = viewCentre(), o = prep({ t: "text", s: t.slice(0, 2000), x: c[0], y: c[1], size: S.fs, font: S.font, c: S.c, b: S.b, i: S.i, al: "c", sc: S.sOn ? S.sc : null, bgc: null, o: 1, m: D.I.slice() });
		doc.objs = doc.objs.concat([o]); sel = [o.id]; setTool("select"); commit();
	});
	stage.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
	stage.addEventListener("drop", function (e) {
		e.preventDefault(); active = true; var at = toBoard(e.clientX, e.clientY);
		if (e.dataTransfer.files && e.dataTransfer.files.length) { openFiles(e.dataTransfer.files, at); return; }
		var ch = e.dataTransfer.getData("text/plain"), kind = e.dataTransfer.getData("application/x-mes-draw-kind");
		if (ch && ch.length <= 16) insertChar(ch, kind !== "symbols", at);
	});
	stage.addEventListener("wheel", function (e) {
		var full = $("dr-view").classList.contains("mes-pfill");
		if (!(e.ctrlKey || e.metaKey || full)) return; e.preventDefault(); var sp = local(e);
		if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), sp[0], sp[1]);
		else if (e.shiftKey) { view.ox -= e.deltaY; view.fit = false; dirty(false); } else { view.ox -= e.deltaX; view.oy -= e.deltaY; view.fit = false; dirty(false); }
	}, { passive: false });

	/* ---------- ☁ Cloud: keep a drawing (.mesdraw) saved to a synced folder, Dropbox, OneDrive or Google Drive (main_js/cloud-files.js).
	   Attached once the first drawing is on the page, so a return from signing in opens its kept drawing over it. ---------- */
	var cloud = null;
	function cloudTick() { if (!doc) return; doc.__cRev = (doc.__cRev || 0) + 1; if (cloud && cloud.linked(doc)) cloud.changed(doc); }
	function cloudInit() {
		if (cloud || !window.MESCloud) return;
		cloud = window.MESCloud.attach({
			app: "draw", folder: "MES Apps/Draw", what: "drawing", title: "Draw", defExt: "mesdraw", btnClass: "dr-b", before: $("dr-pagebtn"), toast: function (m) { toast(m); },
			exts: [".mesdraw"],
			accept: [{ description: "MES Draw drawing", accept: { "application/json": [".mesdraw"] } }],
			doc: function () { return doc; },
			name: function (d) { return fileBase() + ".mesdraw"; },
			writeName: function (n) { return /\.mesdraw$/i.test(n || "") ? n : String(n || "drawing").replace(/\.[A-Za-z0-9]{1,8}$/, "") + ".mesdraw"; },
			bytes: function (d) { if (d !== doc) return Promise.reject(new Error("That drawing was closed.")); finishText(); d.__cTry = d.__cRev || 0; return Promise.resolve(new TextEncoder().encode(D.serialize(d))); },
			open: function (u8, name) {
				var d = D.parse(new TextDecoder().decode(u8)); if (!d) throw new Error("That is not a MES Draw file");
				if (!d.name || d.name === "Drawing") d.name = String(name || "Drawing").replace(/\.mesdraw$/i, "");
				saveNow(); d.id = uid(); setDoc(d, true); doc.__cRev = doc.__cSaved = 0; return doc;
			},
			dirty: function (d) { return (d.__cRev || 0) !== (d.__cSaved || 0); },
			markDirty: function (d) { d.__cRev = (d.__cRev || 0) + 1; },
			saved: function (d) { d.__cSaved = d.__cTry != null ? d.__cTry : d.__cRev || 0; },
			replaces: false
		});
	}

	/* ---------- start ---------- */
	buildTools(); wireOpts(); wireBar(); buildPal();
	$("dr-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (b) setTab(b.getAttribute("data-t")); });
	$("dr-tabs").addEventListener("keydown", function (e) { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; var bs = Array.from(this.querySelectorAll("[data-t]")), i = bs.findIndex(function (b) { return b.getAttribute("aria-selected") === "true"; }); i = (i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length; setTab(bs[i].getAttribute("data-t")); bs[i].focus(); e.preventDefault(); });
	$("dr-p-shapes").addEventListener("click", function (e) { var b = e.target.closest("[data-k]"); if (!b) return; S.kind = b.getAttribute("data-k"); saveS(); setTool("shape"); uiKind(); tip("Now drag on the page to draw it"); });
	readDesk(); new MutationObserver(function () { readDesk(); dirty(false); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); window.addEventListener("resize", resize);
	uiSide(); resize();
	function startDoc(d) { if (d) setDoc(d, false); else newDoc("blank"); setTool(S.tool || "brush"); setTab(S.tab || "shapes"); handoff(); cloudInit(); }
	(S.last ? getDoc(S.last) : Promise.resolve(null)).then(startDoc, function () { startDoc(null); });
	function handoff() { var I = window.MESImg; if (I && I.handoffReceive && /[?&]handoff=/.test(location.search)) I.handoffReceive().then(function (files) { files.forEach(function (f) { addImageFile(f); }); }); }
	window.addEventListener("pagehide", function () { if (saveTimer) saveNow(); });
	document.addEventListener("visibilitychange", function () { if (document.hidden && saveTimer) saveNow(); });
	function panelInit() { if (window.MESPanel && window.MESPanel.add) window.MESPanel.add($("dr-view"), { bar: $("dr-bar"), stage: $("dr-main"), onChange: function () { setTimeout(function () { resize(); fit(); }, 30); } }); else setTimeout(panelInit, 200); }
	panelInit();
	window.MESDrawDebug = { get doc() { return doc; }, get sel() { return sel; }, set sel(v) { sel = v; uiSel(); dirty(false); }, setTool: setTool, render: function () { render(); }, toBoard: toBoard, toScreen: toScreen, view: view, insertChar: insertChar, newDoc: newDoc, exportBlob: exportBlob, S: S };
})();
