/* MES Font Finder (mes.fm/font-finder): find a font from a picture, in the browser.
 * picture -> (turn / straighten / crop) -> ink -> lines -> letters (+ optional Tesseract reading) -> fingerprints
 * stage 1: compare with the letter files of 3,300+ free font styles (data/g/<code>.bin)
 * stage 2: draw the best ~40 families (and nearby weights, and the fonts on this computer) right here and compare again.
 * Pure maths: lib.js (MESFF). Font names of this computer: MESFont.LOCAL (tool_apps_src/fonts/lib.js). */
(function () {
	"use strict";
	var F = window.MESFF, $ = function (id) { return document.getElementById(id); }, root = $("ff"); if (!root || !F) return;
	var DATA = "/font-finder/data/", KEY = "mes-font-finder:v1", TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
	var S = { local: true, deep: true, view: "cards", overlay: false, ocr: true, saved: [] };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) Object.assign(S, sv); } catch (e) { /* private window */ }
	if (!Array.isArray(S.saved)) S.saved = [];
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	var toastEl = document.createElement("div"); toastEl.className = "tu-toast ff-toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl);
	var toastT; function toast(m) { toastEl.textContent = m; toastEl.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("tu-toast--show"); }, 2800); }
	function step(n) { root.querySelectorAll(".ff-steps span").forEach(function (s) { s.classList.toggle("is-on", +s.dataset.step <= n); }); }
	function seg(id, v, fn) { var el = $(id); el.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); b.onclick = function () { el.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); fn(b.dataset.v); }; }); }

	/* ---------- the font library (fonts.json + letter files, fetched on demand) ---------- */
	var meta = null, shards = {}, metaP = null;
	function getMeta() { return metaP || (metaP = fetch(DATA + "fonts.json").then(function (r) { if (!r.ok) throw new Error("font list " + r.status); return r.json(); }).then(function (m) { meta = m; return m; })); }
	function getShard(ch) {
		if (shards[ch]) return Promise.resolve(shards[ch]);
		return fetch(DATA + "g/" + ch.charCodeAt(0) + ".bin?v=" + (meta ? meta.built : "")).then(function (r) { if (!r.ok) throw new Error("letter " + ch); return r.arrayBuffer(); }).then(function (b) { return (shards[ch] = F.parseShard(b)); });
	}
	function famOfRec(r) { var st = meta.styles[meta.prim[r]]; return { fam: meta.fams[st[0]], fi: st[0], w: st[1], it: !!st[2], si: meta.prim[r] }; }
	function famObj(fa) { return { id: fa[0], family: fa[1], cat: fa[2], google: !!fa[3], weights: fa[4], italic: !!fa[5], license: fa[6] }; }
	function copiesOf(si) { var out = []; meta.styles.forEach(function (s) { if (s[3] === si) { var n = meta.fams[s[0]][1]; if (out.indexOf(n) < 0) out.push(n); } }); return out; }

	/* ---------- the picture ---------- */
	var script = false, src = null, work = null, rot = 0, tilt = 0, ink = "auto", thr = 0, sel = null, autoLines = [], letters = [], baseGlyphs = [], crop = null;
	var cv = $("ff-cv"), cx = cv.getContext("2d");
	function loadBlob(blob, name) {
		if (!blob || !/^image\//.test(blob.type || "image/")) { toast("That is not a picture"); return; }
		var p = window.createImageBitmap ? createImageBitmap(blob, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(blob); }) : new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = URL.createObjectURL(blob); });
		p.then(function (bm) { useImage(bm, name); }).catch(function () { toast("This picture could not be opened (try a PNG or JPEG)"); });
	}
	function useImage(img, name) {
		var w = img.width || img.naturalWidth, h = img.height || img.naturalHeight, s = Math.min(1, 2400 / Math.max(w, h));
		src = document.createElement("canvas"); src.width = Math.max(1, Math.round(w * s)); src.height = Math.max(1, Math.round(h * s));
		var c = src.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, src.width, src.height); c.drawImage(img, 0, 0, src.width, src.height);
		rot = 0; tilt = 0; $("ff-tilt").value = 0; $("ff-tiltv").textContent = "0°"; sel = null; $("ff-text").value = ""; letters = []; baseGlyphs = [];
		$("ff-s2").hidden = false; $("ff-s3").hidden = true; step(2); rebuildWork(true);
		setTimeout(function () { $("ff-s2").scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
		if (S.ocr) setTimeout(function () { if (letters.length && !$("ff-text").value) readLetters(true); }, 300);
	}
	function edgeColour(c) {
		var d = c.getContext("2d"), w = c.width, h = c.height, pts = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [w >> 1, h - 1]], r = 0, g = 0, b = 0;
		pts.forEach(function (p) { var px = d.getImageData(p[0], p[1], 1, 1).data; r += px[0]; g += px[1]; b += px[2]; });
		return "rgb(" + Math.round(r / 6) + "," + Math.round(g / 6) + "," + Math.round(b / 6) + ")";
	}
	function rebuildWork(auto) {
		if (!src) return;
		var a = (rot + tilt) * Math.PI / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a)), W = Math.round(src.width * cs + src.height * sn), H = Math.round(src.width * sn + src.height * cs);
		work = document.createElement("canvas"); work.width = W; work.height = H; var c = work.getContext("2d");
		c.fillStyle = edgeColour(src); c.fillRect(0, 0, W, H); c.imageSmoothingQuality = "high"; c.translate(W / 2, H / 2); c.rotate(a); c.drawImage(src, -src.width / 2, -src.height / 2);
		findLines();
		if (auto || !sel) sel = bestLine();
		analyse();
	}
	// the text lines of the whole picture (on a smaller copy), so a click picks one and the biggest line is chosen at first
	function findLines() {
		var s = Math.min(1, 1000 / Math.max(work.width, work.height)), w = Math.max(1, Math.round(work.width * s)), h = Math.max(1, Math.round(work.height * s)), c = document.createElement("canvas"); c.width = w; c.height = h;
		var x = c.getContext("2d"); x.drawImage(work, 0, 0, w, h); var b = F.binarise(F.grayOf(x.getImageData(0, 0, w, h).data), ink, thrOf(x, w, h));
		var res = F.segment(b, w, h); autoLines = [];
		res.lines.forEach(function (L) {
			if (L.glyphs.length < 2) return; var x0 = 1e9, x1 = -1; L.glyphs.forEach(function (g) { x0 = Math.min(x0, g.x0); x1 = Math.max(x1, g.x1); });
			var gh = F.median(L.glyphs.map(function (g) { return g.y1 - g.y0 + 1; }));
			if (gh < 4 || (x1 - x0) > w * 0.995 && (L.y1 - L.y0) > h * 0.9) return;
			autoLines.push({ x: x0 / s, y: L.y0 / s, w: (x1 - x0 + 1) / s, h: (L.y1 - L.y0 + 1) / s, score: gh * Math.sqrt(Math.min(L.glyphs.length, 16)) });
		});
	}
	function bestLine() {
		if (!autoLines.length) return { x: 0, y: 0, w: work.width, h: work.height };
		var b = autoLines.slice().sort(function (p, q) { return q.score - p.score; })[0]; return pad(b);
	}
	function pad(b) { var p = Math.max(4, b.h * 0.12); var x = Math.max(0, b.x - p), y = Math.max(0, b.y - p); return { x: x, y: y, w: Math.min(work.width - x, b.w + 2 * p), h: Math.min(work.height - y, b.h + 2 * p) }; }
	function thrOf(ctx, w, h) { if (!thr) return null; var g = F.grayOf(ctx.getImageData(0, 0, w, h).data); return Math.max(1, Math.min(254, F.otsu(g) + thr)); }

	/* ---------- the picture on screen: drag a box, click a line ---------- */
	var view = { s: 1 }, drag = null;
	function draw() {
		if (!work) return; var maxW = $("ff-stage").clientWidth || 800, maxH = Math.max(220, Math.min(window.innerHeight * 0.55, 640)), s = Math.min(maxW / work.width, maxH / work.height, 2);
		view.s = s; cv.width = Math.round(work.width * s); cv.height = Math.round(work.height * s);
		cx.imageSmoothingQuality = "high"; cx.drawImage(work, 0, 0, cv.width, cv.height);
		cx.save(); cx.setLineDash([4, 4]); cx.strokeStyle = "rgba(124,45,146,.55)"; cx.lineWidth = 1;
		autoLines.forEach(function (L) { cx.strokeRect(L.x * s + .5, L.y * s + .5, L.w * s, L.h * s); }); cx.restore();
		var b = drag && drag.box ? drag.box : sel;
		if (b) {
			cx.fillStyle = "rgba(15,15,30,.3)"; cx.beginPath(); cx.rect(0, 0, cv.width, cv.height); cx.rect(b.x * s, b.y * s, b.w * s, b.h * s); cx.fill("evenodd");
			cx.strokeStyle = "#f59e0b"; cx.lineWidth = 2; cx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
		}
		if (!drag && crop) {
			letters.forEach(function (L, i) {
				var g = L.g, k = 1 / crop.s, x = (crop.x + g.x0 * k) * s, y = (crop.y + g.y0 * k) * s, w = (g.x1 - g.x0 + 1) * k * s, h = (g.y1 - g.y0 + 1) * k * s;
				cx.strokeStyle = L.off ? "rgba(150,150,150,.8)" : (L.ch && meta && meta.chars.indexOf(L.ch) < 0) ? "#ef4444" : "#22c55e"; cx.lineWidth = 1.5; cx.strokeRect(x, y, w, h);
				if (!L.off) { cx.font = "bold 13px system-ui,sans-serif"; cx.lineWidth = 3; cx.strokeStyle = "rgba(0,0,0,.85)"; cx.strokeText(L.ch || String(i + 1), x + 1, y - 4); cx.fillStyle = "#4ade80"; cx.fillText(L.ch || String(i + 1), x + 1, y - 4); }
			});
		}
	}
	function pt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width) / view.s, y: (e.clientY - r.top) * (cv.height / r.height) / view.s }; }
	cv.addEventListener("pointerdown", function (e) { if (!work) return; cv.setPointerCapture(e.pointerId); var p = pt(e); drag = { x: p.x, y: p.y, box: null }; e.preventDefault(); });
	cv.addEventListener("pointermove", function (e) { if (!drag) return; var p = pt(e), x0 = Math.max(0, Math.min(drag.x, p.x)), y0 = Math.max(0, Math.min(drag.y, p.y)); drag.box = { x: x0, y: y0, w: Math.min(work.width, Math.max(drag.x, p.x)) - x0, h: Math.min(work.height, Math.max(drag.y, p.y)) - y0 }; draw(); });
	cv.addEventListener("pointerup", function (e) {
		if (!drag) return; var b = drag.box, p = pt(e); drag = null;
		if (b && b.w * view.s > 8 && b.h * view.s > 6) sel = b;
		else { var hit = autoLines.filter(function (L) { return p.x >= L.x && p.x <= L.x + L.w && p.y >= L.y && p.y <= L.y + L.h; })[0]; if (hit) sel = pad(hit); else { draw(); return; } }
		$("ff-text").value = ""; analyse(); if (S.ocr && ocrReady) readLetters(true);
	});
	window.addEventListener("resize", function () { draw(); });

	/* ---------- letters in the chosen box ---------- */
	function analyse() {
		if (!work || !sel) return;
		var s = sel.h < 100 ? Math.min(4, 100 / sel.h) : sel.h > 700 ? 700 / sel.h : 1, w = Math.max(1, Math.round(sel.w * s)), h = Math.max(1, Math.round(sel.h * s)), c = document.createElement("canvas"); c.width = w; c.height = h;
		var x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(work, sel.x, sel.y, sel.w, sel.h, 0, 0, w, h);
		var b = F.binarise(F.grayOf(x.getImageData(0, 0, w, h).data), ink, thrOf(x, w, h)), res = F.segment(b, w, h);
		crop = { x: sel.x, y: sel.y, s: s, w: w, h: h, b: b };
		baseGlyphs = []; res.lines.forEach(function (L, li) { L.glyphs.forEach(function (g) { g.line = li; baseGlyphs.push(g); }); });
		letters = baseGlyphs.map(function (g) { return { g: g, ch: "", off: false }; });
		$("ff-hint").hidden = !!letters.length;
		$("ff-hint").textContent = letters.length ? "" : "No letters found in the box. Drag a box around one line of text (or try Light text / the Ink slider).";
		applyTyped(); renderGlyphs(); draw();
	}
	// the typed letters go onto the boxes in order; when the counts differ, broken letters are joined / joined-up letters split
	function applyTyped() {
		var t = $("ff-text").value.replace(/\s+/g, ""), chars = Array.from(t), note = "";
		if (!chars.length) { script = false; letters.forEach(function (L) { L.ch = ""; }); $("ff-saynote").textContent = letters.length ? letters.length + " letters found. Type what they say, or press “Read it for me”." : ""; updateGo(); return; }
		var on = letters.filter(function (L) { return !L.off; }), nLines = {}; on.forEach(function (L) { nLines[L.g.line] = 1; });
		script = on.length < chars.length * 0.8 && Object.keys(nLines).length === 1;
		if (on.length !== chars.length) {
			var byLine = {}; on.forEach(function (L) { (byLine[L.g.line] = byLine[L.g.line] || []).push(L.g); });
			var gl = [].concat.apply([], Object.keys(byLine).map(function (k) { return byLine[k]; })), fitted = F.fitCount(gl, chars.length, crop.w);
			if (fitted.length === chars.length) { note = "Found " + on.length + " shapes; " + (on.length > chars.length ? "joined" : "split") + " some to match your " + chars.length + " letters. Check them below."; letters = fitted.map(function (g) { return { g: g, ch: "", off: false }; }); on = letters; }
			else note = "Found " + on.length + " shapes but you typed " + chars.length + " letters: fix the boxes below (join / split / leave out).";
		}
		on.forEach(function (L, i) { L.ch = chars[i] || ""; });
		var bad = chars.filter(function (c) { return meta && meta.chars.indexOf(c) < 0; });
		if (bad.length) note += (note ? " " : "") + "Not compared (not in the letter library): " + bad.join(" ") + ". Letters, digits, & ? ! are.";
		if (script) note = "The letters are joined up (handwriting or script), so the whole word is compared instead of single letters. This also checks every handwriting font, so it takes a little longer.";
		$("ff-saynote").textContent = note; updateGo();
	}
	function glyphCanvas(g, maxH, colour) {
		var cg = F.cutGlyph(g, crop.w), s = Math.min(maxH / cg.h, 2.5 * maxH / Math.max(cg.w, 1)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(cg.w * s)); c.height = Math.max(1, Math.round(cg.h * s));
		var t = document.createElement("canvas"); t.width = cg.w; t.height = cg.h; var tx = t.getContext("2d"), id = tx.createImageData(cg.w, cg.h), rgb = colour || [17, 17, 17];
		for (var i = 0; i < cg.m.length; i++) if (cg.m[i]) { id.data[i * 4] = rgb[0]; id.data[i * 4 + 1] = rgb[1]; id.data[i * 4 + 2] = rgb[2]; id.data[i * 4 + 3] = 255; }
		tx.putImageData(id, 0, 0); var x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.drawImage(t, 0, 0, c.width, c.height); return c;
	}
	function renderGlyphs() {
		var box = $("ff-glyphs"); box.innerHTML = "";
		letters.forEach(function (L, i) {
			var t = document.createElement("div"); t.className = "ff-g" + (L.off ? " is-off" : ""); t.dataset.i = i;
			var pic = document.createElement("div"); pic.className = "ff-gpic"; pic.appendChild(glyphCanvas(L.g, 46)); t.appendChild(pic);
			var inp = document.createElement("input"); inp.type = "text"; inp.maxLength = 2; inp.className = "ff-gin"; inp.value = L.ch; inp.setAttribute("aria-label", "Letter " + (i + 1)); inp.disabled = L.off;
			inp.oninput = function () { L.ch = Array.from(inp.value.trim()).slice(-1).join(""); inp.value = L.ch; syncText(); updateGo(); draw(); if (L.ch) { var nx = box.querySelectorAll(".ff-gin")[i + 1]; if (nx) nx.focus(); } };
			inp.onkeydown = function (e) { if (e.key === "Backspace" && !inp.value) { var pv = box.querySelectorAll(".ff-gin")[i - 1]; if (pv) { pv.focus(); e.preventDefault(); } } };
			t.appendChild(inp);
			var acts = document.createElement("div"); acts.className = "ff-gact";
			acts.innerHTML = (i < letters.length - 1 ? '<button type="button" data-a="join" title="Join with the next letter">&#8853;</button>' : "") + '<button type="button" data-a="split" title="Split in two">&#9986;&#65038;</button><button type="button" data-a="off" title="' + (L.off ? "Use this letter again" : "Leave this out") + '">' + (L.off ? "&#8634;" : "&#10005;") + "</button>";
			acts.onclick = function (e) {
				var a = e.target.closest("button"); if (!a) return; a = a.dataset.a;
				if (a === "off") L.off = !L.off;
				else if (a === "join") { var n = letters[i + 1]; letters.splice(i, 2, { g: F.mergeGlyphs(L.g, n.g), ch: L.ch || n.ch, off: false }); letters[i].g.line = L.g.line; }
				else if (a === "split") { var parts = F.splitGlyph(L.g, crop.w); if (!parts) { toast("Too small to split"); return; } parts.forEach(function (p) { p.line = L.g.line; }); letters.splice(i, 1, { g: parts[0], ch: L.ch, off: false }, { g: parts[1], ch: "", off: false }); }
				syncText(); renderGlyphs(); draw(); updateGo();
			};
			t.appendChild(acts); box.appendChild(t);
		});
	}
	function syncText() { $("ff-text").value = letters.filter(function (L) { return !L.off; }).map(function (L) { return L.ch || "?"; }).join("").replace(/\?+$/, ""); }
	function usable() { return letters.filter(function (L) { return !L.off && L.ch && meta && meta.chars.indexOf(L.ch) >= 0; }); }
	function updateGo() { var n = usable().length; $("ff-go").disabled = !n; $("ff-go").textContent = n ? "Find the font (" + n + " letter" + (n > 1 ? "s" : "") + ")" : "Find the font"; }
	$("ff-text").addEventListener("input", function () { if (!crop) return; letters = baseGlyphs.map(function (g) { return { g: g, ch: "", off: false }; }); applyTyped(); renderGlyphs(); draw(); });
	$("ff-text").addEventListener("keydown", function (e) { if (e.key === "Enter" && !$("ff-go").disabled) find(); });

	/* ---------- "Read it for me": Tesseract.js reads the letters (downloaded the first time) ---------- */
	var worker = null, ocrReady = false, ocrBusy = false;
	function loadScript(u) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = function () { rej(new Error("script")); }; document.head.appendChild(s); }); }
	function getWorker() {
		if (worker) return Promise.resolve(worker);
		return (window.Tesseract ? Promise.resolve() : loadScript(TESS_URL)).then(function () {
			return window.Tesseract.createWorker("eng", 1, { logger: function (m) { if (/loading|initializ/i.test(m.status)) $("ff-saynote").textContent = "Getting the letter reader ready (first time only)… " + Math.round((m.progress || 0) * 100) + "%"; }, errorHandler: function () {} });
		}).then(function (w) { worker = w; return w.setParameters({ tessedit_pageseg_mode: "7" }).then(function () { ocrReady = true; return w; }); });
	}
	function readLetters(quiet) {
		if (!crop || !letters.length || ocrBusy) return; ocrBusy = true; var my = crop;
		var pad = 20, c = document.createElement("canvas"); c.width = crop.w + pad * 2; c.height = crop.h + pad * 2; var x = c.getContext("2d"), id = x.createImageData(c.width, c.height);
		for (var i = 0; i < id.data.length; i += 4) { id.data[i] = id.data[i + 1] = id.data[i + 2] = 255; id.data[i + 3] = 255; }
		letters.forEach(function (L) { if (L.off) return; L.g.px.forEach(function (p) { var px = p % crop.w, py = (p - px) / crop.w, q = ((py + pad) * c.width + px + pad) * 4; id.data[q] = id.data[q + 1] = id.data[q + 2] = 0; }); });
		x.putImageData(id, 0, 0);
		$("ff-ocr").disabled = true; if (!quiet || ocrReady) $("ff-saynote").textContent = "Reading the letters…";
		getWorker().then(function (w) { return w.recognize(c, {}, { text: true, blocks: true }); }).then(function (r) {
			ocrBusy = false; $("ff-ocr").disabled = false; if (my !== crop) return;
			var syms = []; (r.data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { (l.words || []).forEach(function (wd) { (wd.symbols || []).forEach(function (s) { syms.push(s); }); }); }); }); });
			var text = (r.data.text || "").replace(/\s+/g, ""), on = letters.filter(function (L) { return !L.off; });
			if (Array.from(text).length === on.length) on.forEach(function (L, k) { L.ch = Array.from(text)[k]; });
			else on.forEach(function (L) {   // match each box with the symbol that overlaps it most
				var g = L.g, best = null, bo = 0;
				syms.forEach(function (s) { var b = s.bbox, o = Math.max(0, Math.min(g.x1, b.x1 - pad) - Math.max(g.x0, b.x0 - pad)) * Math.max(0, Math.min(g.y1, b.y1 - pad) - Math.max(g.y0, b.y0 - pad)); if (o > bo) { bo = o; best = s; } });
				L.ch = best && best.text ? Array.from(best.text.trim()).slice(0, 1).join("") : "";
			});
			var spaced = (r.data.text || "").replace(/\s+/g, " ").trim();
			if (Array.from(spaced.replace(/ /g, "")).join("") === on.map(function (L) { return L.ch; }).join("")) $("ff-text").value = spaced; else syncText();
			renderGlyphs(); draw(); updateGo();
			var nRead = on.filter(function (L) { return L.ch; }).length;
			$("ff-saynote").textContent = nRead ? "Read " + nRead + " of " + on.length + " letters. Check them (especially l / I / 1 and O / 0) and fix any that are wrong." : "The reader could not make out these letters: type them in.";
		}).catch(function () { ocrBusy = false; $("ff-ocr").disabled = false; $("ff-saynote").textContent = quiet ? "Type the letters you see." : "The letter reader could not be loaded. Type the letters instead."; });
	}
	$("ff-ocr").onclick = function () { readLetters(false); };

	/* ---------- drawing a font's letters here (stage 2 and the result cards) ---------- */
	var rc = document.createElement("canvas"); rc.width = 520; rc.height = 400; var rx = rc.getContext("2d", { willReadFrequently: true });
	function drawLetter(font, ch) {
		rx.clearRect(0, 0, 520, 400); rx.font = font; rx.textBaseline = "alphabetic"; rx.fillStyle = "#000"; rx.fillText(ch, 110, 270);
		var d = rx.getImageData(0, 0, 520, 400).data, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, i, x, y;
		for (y = 0; y < 400; y++) for (x = 0; x < 520; x++) if (d[(y * 520 + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
		if (x1 < 0) return null; var w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) m[y * w + x] = d[((y + y0) * 520 + x + x0) * 4 + 3] > 127 ? 1 : 0;
		return { m: m, w: w, h: h, top: 270 - y0, x0: x0, y0: y0 };
	}
	var wc = document.createElement("canvas"), wx = wc.getContext("2d", { willReadFrequently: true });
	function drawWord(font, text) {
		wx.font = font; var tw = Math.ceil(wx.measureText(text).width), W = Math.min(4000, tw + 240), H = 300; wc.width = W; wc.height = H;
		wx.font = font; wx.textBaseline = "alphabetic"; wx.fillStyle = "#000"; wx.fillText(text, 120, 200);
		var d = wx.getImageData(0, 0, W, H).data, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, x, y;
		for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
		if (x1 < 0) return null; var w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) m[y * w + x] = d[((y + y0) * W + x + x0) * 4 + 3] > 127 ? 1 : 0;
		return { m: m, w: w, h: h };
	}
	function lineMask(ls) {   // the person's letters of one line as one picture
		var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; ls.forEach(function (L) { x0 = Math.min(x0, L.g.x0); y0 = Math.min(y0, L.g.y0); x1 = Math.max(x1, L.g.x1); y1 = Math.max(y1, L.g.y1); });
		var w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
		ls.forEach(function (L) { L.g.px.forEach(function (p) { var x = p % crop.w, y = (p - x) / crop.w; m[(y - y0) * w + x - x0] = 1; }); });
		return { m: m, w: w, h: h };
	}
	function maskCanvas(o, H, rgb) {
		var s = H / o.h, c = document.createElement("canvas"); c.width = Math.max(1, Math.round(o.w * s)); c.height = H;
		var t = document.createElement("canvas"); t.width = o.w; t.height = o.h; var tx = t.getContext("2d"), id = tx.createImageData(o.w, o.h);
		for (var i = 0; i < o.m.length; i++) if (o.m[i]) { id.data[i * 4] = rgb[0]; id.data[i * 4 + 1] = rgb[1]; id.data[i * 4 + 2] = rgb[2]; id.data[i * 4 + 3] = 255; }
		tx.putImageData(id, 0, 0); var cxx = c.getContext("2d"); cxx.imageSmoothingQuality = "high"; cxx.drawImage(t, 0, 0, c.width, c.height); return c;
	}
	function fontStr(fam, w, it, size) { return (it ? "italic " : "") + w + " " + (size || 160) + "px " + fam; }
	var faces = {};
	function loadFace(f, w, it, text) {   // -> Promise<alias or null>
		var key = f.id + "|" + w + "|" + (it ? 1 : 0) + "|" + (text ? "t" : "f"); if (faces[key]) return faces[key];
		var alias = "MESff" + Object.keys(faces).length, desc = { weight: String(w), style: it ? "italic" : "normal" };
		function add(url) { var ff = new FontFace(alias, "url(" + url + ")", desc); return ff.load().then(function (x) { document.fonts.add(x); return "'" + alias + "'"; }); }
		var p = (f.google && text ? fetch(F.googleCss(f.family, w, it, text)).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (css) { var m = /url\(([^)]+)\)/.exec(css); if (!m) throw 0; return add(m[1].replace(/['"]/g, "")); }) : Promise.reject())
			.catch(function () { return add(F.fontsourceFile(f.id, w, it)); }).catch(function () { return null; });
		return (faces[key] = p);
	}
	// person's letters vs a font: lower = closer (same maths as MESFF.rank, but on letters drawn here at full detail)
	function score2(font, use) {
		var s = 0, fh = [], ft = [], mh = 0, drawn = [];
		use.forEach(function (L) { mh += L.h; }); mh /= use.length;
		use.forEach(function (L) {
			var r = drawLetter(font, L.ch); drawn.push(r);
			if (!r) { s += F.MISSING; fh.push(NaN); ft.push(NaN); return; }
			var fp = F.fingerprint(r.m, r.w, r.h), d = 0; for (var i = 0; i < fp.length; i++) { var e = fp[i] - L.fp[i]; d += e * e; }
			var la = Math.log((r.w / r.h) / (L.w / L.h)); s += d / shards[L.ch].v + F.W_ASP * la * la; fh.push(r.h / 160); ft.push(r.top / 160);
		});
		return { score: s / use.length + F.W_REL * 0.25 * F.relTerm(use, fh, ft, mh), drawn: drawn };
	}
	var mctx = document.createElement("canvas").getContext("2d"), SAMPLE = "mmmmmmmmmmlli0Oo", BASES = ["monospace", "sans-serif", "serif"], baseW = null;
	function installed(name) { if (!baseW) baseW = BASES.map(function (b) { mctx.font = "72px " + b; return mctx.measureText(SAMPLE).width; }); for (var i = 0; i < BASES.length; i++) { mctx.font = "72px '" + name + "', " + BASES[i]; if (Math.abs(mctx.measureText(SAMPLE).width - baseW[i]) > 0.01) return true; } return false; }

	/* ---------- find ---------- */
	var results = [], shown = 0, findTok = 0, curUse = null, catSel = "all";
	function prog(f, t) { $("ff-prog").hidden = false; $("ff-barv").style.width = Math.round(f * 100) + "%"; $("ff-progt").textContent = t; }
	function nextFrame() { return new Promise(function (r) { setTimeout(r, 0); }); }
	function find() {
		var my = ++findTok, picked = usable(); if (!picked.length) return;
		$("ff-go").disabled = true; prog(0.02, "Getting the font list…");
		var lines = {}; picked.forEach(function (L) { (lines[L.g.line] = lines[L.g.line] || []).push(L); });
		var base = {}; Object.keys(lines).forEach(function (k) { var ls = lines[k], nd = ls.filter(function (L) { return !F.descender(L.ch); }); base[k] = F.median((nd.length ? nd : ls).map(function (L) { return L.g.y1; })); });
		var use = picked.map(function (L) { var cg = F.cutGlyph(L.g, crop.w); return { ch: L.ch, fp: F.fingerprint(cg.m, cg.w, cg.h), w: cg.w, h: cg.h, top: base[L.g.line] - L.g.y0 + 1, g: L.g }; });
		curUse = use;
		var uniq = Array.from(new Set(use.map(function (L) { return L.ch; }))), got = 0;
		getMeta().then(function () {
			return Promise.all(uniq.map(function (ch) { return getShard(ch).then(function (s) { got++; prog(0.05 + 0.4 * got / uniq.length, "Downloading letter data " + got + " / " + uniq.length + "…"); return s; }); }));
		}).then(function () {
			if (my !== findTok) return; prog(0.47, "Comparing with " + meta.prim.length.toLocaleString() + " font styles…"); return nextFrame();
		}).then(function () {
			if (my !== findTok) return;
			var sc = F.rank(use, shards, meta.prim.length), order = Array.from(sc.keys()).sort(function (a, b) { return sc[a] - sc[b]; }), cand = [], seen = {}, limit = S.deep ? 40 : 30;
			if (script) limit = 60;
			for (var i = 0; i < order.length && cand.length < limit; i++) { var o = famOfRec(order[i]); if (seen[o.fi]) continue; seen[o.fi] = 1; cand.push({ f: famObj(o.fam), w: o.w, it: o.it, si: o.si, s1: sc[order[i]] }); }
			if (script) {   // joined-up writing: every handwriting font (its regular style) is drawn and compared word for word
				for (var r = 0; r < meta.prim.length; r++) { var q = famOfRec(r); if (seen[q.fi] || q.fam[2] !== "hand" || q.it) continue; seen[q.fi] = 1; cand.push({ f: famObj(q.fam), w: q.w, it: false, si: q.si }); }
				return stageWord(my, use, cand);
			}
			return stage2(my, use, cand);
		}).catch(function (e) { $("ff-go").disabled = false; prog(0, "Something went wrong (" + (e && e.message || e) + "). Check your connection and try again."); });
	}
	function stage2(my, use, cand) {
		var text = Array.from(new Set(use.map(function (L) { return L.ch; }))).join(""), jobs = [];
		cand.forEach(function (c) {
			var ws = [c.w];
			if (S.deep) c.f.weights.slice().sort(function (a, b) { return Math.abs(a - c.w) - Math.abs(b - c.w); }).forEach(function (w) { if (ws.length < 3 && w !== c.w && Math.abs(w - c.w) <= 200) ws.push(w); });
			ws.forEach(function (w) { jobs.push({ c: c, w: w, it: c.it }); });
		});
		var out = [], done = 0, idx = 0;
		function worker() {
			if (my !== findTok || idx >= jobs.length) return Promise.resolve();
			var j = jobs[idx++];
			return loadFace(j.c.f, j.w, j.it, text).then(function (alias) {
				done++; prog(0.5 + 0.42 * done / jobs.length, "Drawing the closest fonts here to check them… " + done + " / " + jobs.length);
				if (alias && my === findTok) { var r = score2(fontStr(alias, j.w, j.it), use); out.push({ f: j.c.f, w: j.w, it: j.it, si: j.c.si, score: r.score, drawn: r.drawn, src: "lib" }); }
			}).then(worker);
		}
		var pool = []; for (var k = 0; k < 6; k++) pool.push(worker());
		return Promise.all(pool).then(function () {
			if (my !== findTok) return;
			if (S.local && window.MESFont) {
				prog(0.94, "Checking the fonts on this computer…");
				var lib = {}; meta.fams.forEach(function (fa) { lib[fa[1]] = 1; });
				window.MESFont.LOCAL.forEach(function (x) {
					if (lib[x[0]] || !installed(x[0])) return;
					[400, 700].forEach(function (w) { var fam = "'" + x[0] + "'", r = score2(fontStr(fam, w, false), use); out.push({ f: { id: "", family: x[0], cat: x[1], google: false, weights: [400, 700], local: true }, w: w, it: false, score: r.score, drawn: r.drawn, src: "local", fam: fam }); });
				});
			}
			var best = {}; out.forEach(function (r) { var k = r.f.family; if (!best[k] || r.score < best[k].score) best[k] = r; });
			results = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return a.score - b.score; });
			$("ff-go").disabled = false; $("ff-prog").hidden = true; updateGo(); showResults();
		});
	}

	var userWord = null;
	function stageWord(my, use, cand) {
		var typed = $("ff-text").value.trim().replace(/\s+/g, " "), text = Array.from(new Set(typed.replace(/\s/g, ""))).join(""), out = [], done = 0, idx = 0;
		userWord = lineMask(letters.filter(function (L) { return !L.off; }));
		function one() {
			if (my !== findTok || idx >= cand.length) return Promise.resolve();
			var c = cand[idx++];
			return loadFace(c.f, c.w, c.it, text).then(function (alias) {
				done++; prog(0.5 + 0.44 * done / cand.length, "Drawing the words in " + cand.length + " fonts to compare… " + done + " / " + cand.length);
				if (!alias || my !== findTok) return; var wd = drawWord(fontStr(alias, c.w, c.it, 120), typed); if (wd) out.push({ f: c.f, w: c.w, it: c.it, si: c.si, score: F.wordScore(userWord, wd), word: wd, mode: "word", drawn: [] });
			}).then(one);
		}
		var pool = []; for (var k = 0; k < 8; k++) pool.push(one());
		return Promise.all(pool).then(function () {
			if (my !== findTok) return;
			if (S.local && window.MESFont) { var lib = {}; meta.fams.forEach(function (fa) { lib[fa[1]] = 1; }); window.MESFont.LOCAL.forEach(function (x) { if (lib[x[0]] || !installed(x[0])) return; var fam = "'" + x[0] + "'", wd = drawWord(fontStr(fam, 400, false, 120), typed); if (wd) out.push({ f: { id: "", family: x[0], cat: x[1], google: false, weights: [400], local: true }, w: 400, it: false, score: F.wordScore(userWord, wd), word: wd, mode: "word", drawn: [], fam: fam }); }); }
			results = out.sort(function (a, b) { return a.score - b.score; });
			$("ff-go").disabled = false; $("ff-prog").hidden = true; updateGo(); showResults();
		});
	}
	function pctOf(r) { return r.mode === "word" ? F.wordPercent(r.score) : F.percent(r.score); }

	/* ---------- results ---------- */
	function pvText() { return $("ff-pvtext").value || $("ff-text").value || "Hamburgefonts"; }
	function showResults() {
		$("ff-s3").hidden = false; step(3); shown = 0; catSel = "all";
		if (!$("ff-pvtext").value) $("ff-pvtext").value = $("ff-text").value.trim() || curUse.map(function (L) { return L.ch; }).join("");
		var counts = { all: results.length }; results.forEach(function (r) { counts[r.f.cat] = (counts[r.f.cat] || 0) + 1; });
		$("ff-cats").innerHTML = F.CATS.filter(function (c) { return counts[c[0]]; }).map(function (c) { return '<button type="button" class="tu-chip" data-c="' + c[0] + '" aria-pressed="' + (c[0] === "all") + '">' + c[1] + " <span>" + counts[c[0]] + "</span></button>"; }).join("");
		var top = results[0];
		$("ff-rnote").innerHTML = top ? (top.mode === "word" ? "Compared your words with " + results.length + " fonts (every handwriting font and the closest others)" : "Compared " + curUse.length + " letter" + (curUse.length > 1 ? "s" : "") + " with " + meta.prim.length.toLocaleString() + " free font styles") + (S.local ? " and the fonts on this computer" : "") + ". Best match: <b>" + esc(top.f.family) + "</b> (" + pctOf(top) + "%)." + (pctOf(top) < 70 ? " Nothing is very close: see “Not the right font?” below." : "") : "No fonts to show.";
		$("ff-results").innerHTML = ""; more();
		setTimeout(function () { $("ff-s3").scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
	}
	function filtered() { return results.filter(function (r) { return catSel === "all" || r.f.cat === catSel; }); }
	function more() {
		var list = filtered(), box = $("ff-results"), n = Math.min(list.length, shown + 12);
		box.classList.toggle("ff-list", S.view === "list");
		for (var i = shown; i < n; i++) box.appendChild(card(list[i], i));
		shown = n; $("ff-more").hidden = shown >= Math.min(list.length, 60);
	}
	$("ff-more").onclick = more;
	$("ff-cats").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; catSel = b.dataset.c; $("ff-cats").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); $("ff-results").innerHTML = ""; shown = 0; more(); };
	function savedIdx(r) { for (var i = 0; i < S.saved.length; i++) if (S.saved[i].family === r.f.family) return i; return -1; }
	function card(r, i) {
		var a = document.createElement("article"), f = r.f, pct = pctOf(r), twins = F.twinOf(f.family), cop = r.si != null ? copiesOf(r.si) : [];
		a.className = "ff-res"; a.dataset.cat = f.cat;
		var get = f.local ? "" : '<a class="tu-btn" href="' + (f.google ? F.googlePage(f.family) : F.fontsourcePage(f.id)) + '" target="_blank" rel="noopener">Get it free ↗</a>';
		var dl = f.local ? "" : '<a class="tu-btn tu-btn--ghost" href="' + F.fontsourceFile(f.id, r.w, r.it) + '" download>Download .woff2</a>';
		var badges = [f.local ? '<span class="ff-b ff-b--loc">On this computer</span>' : '<span class="ff-b">' + (f.google ? "Google Fonts" : "Fontsource") + "</span>", f.local ? "" : '<span class="ff-b ff-b--ok" title="' + esc(F.licName(f.license)) + '">Free, also for business</span>'];
		twins.forEach(function (t) { badges.push('<span class="ff-b ff-b--twin">Free look-alike of ' + esc(t) + "</span>"); });
		a.innerHTML = '<div class="ff-rtop"><span class="ff-rank">' + (i + 1) + '</span><div class="ff-rname"><h3>' + esc(f.family) + '</h3><span class="ff-style">' + F.styleName(r.w, r.it) + " &middot; " + esc((F.CATS.filter(function (c) { return c[0] === f.cat; })[0] || ["", ""])[1]) + '</span></div><div class="ff-pct" title="How closely the letters match"><b>' + pct + '%</b><span class="ff-meter"><i style="width:' + pct + '%"></i></span></div></div>' +
			'<div class="ff-sample" aria-label="Preview">' + esc(pvText()) + "</div>" +
			'<div class="ff-cmp" aria-label="Your letters next to this font\'s letters"></div>' +
			'<div class="ff-badges">' + badges.join("") + (cop.length ? '<span class="ff-copies">Same letters as ' + esc(cop.slice(0, 5).join(", ")) + (cop.length > 5 ? " and " + (cop.length - 5) + " more" : "") + "</span>" : "") + "</div>" +
			'<div class="ff-acts">' + get + dl + (f.local ? "" : '<a class="tu-btn tu-btn--ghost" href="/fonts?f=' + encodeURIComponent(f.family) + "&amp;g=" + (f.google ? 1 : 0) + "&amp;c=" + f.cat + "&amp;t=" + encodeURIComponent(pvText()) + '" target="_blank" rel="noopener">Open in Font Preview</a>') +
			'<button type="button" class="tu-btn tu-btn--ghost" data-a="css">Copy CSS</button><button type="button" class="tu-btn tu-btn--ghost ff-star" data-a="save" aria-pressed="' + (savedIdx(r) >= 0) + '">' + (savedIdx(r) >= 0 ? "★ Saved" : "☆ Save") + "</button></div>";
		var sample = a.querySelector(".ff-sample");
		(f.local ? Promise.resolve(r.fam) : loadFace(f, r.w, r.it, null)).then(function (alias) { if (alias) { sample.style.fontFamily = alias + ", sans-serif"; sample.style.fontWeight = r.w; sample.style.fontStyle = r.it ? "italic" : "normal"; } });
		drawCompare(a.querySelector(".ff-cmp"), r);
		a.querySelector(".ff-acts").onclick = function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.dataset.a === "css") { var t = f.local ? "font-family: '" + f.family + "';\nfont-weight: " + r.w + ";" : F.cssSnippet(f, r.w, r.it); navigator.clipboard && navigator.clipboard.writeText(t).then(function () { toast("CSS copied"); }, function () { toast("Could not copy"); }); }
			if (b.dataset.a === "save") { var k = savedIdx(r); if (k >= 0) S.saved.splice(k, 1); else S.saved.unshift({ family: f.family, id: f.id, google: f.google, cat: f.cat, w: r.w, it: r.it, local: !!f.local }); S.saved = S.saved.slice(0, 40); save(); b.setAttribute("aria-pressed", k < 0); b.textContent = k < 0 ? "★ Saved" : "☆ Save"; renderSaved(); toast(k < 0 ? "Saved " + f.family : "Removed"); }
		};
		return a;
	}
	function drawCompare(box, r) {
		var H = 46; box.innerHTML = "";
		if (r.mode === "word") {
			var a = maskCanvas(userWord, 40, [17, 17, 17]), b = maskCanvas(r.word, 40, [124, 45, 146]), wrap = document.createElement("span"); wrap.className = "ff-pair ff-wordpair";
			if (S.overlay) { var o = document.createElement("canvas"); o.width = a.width; o.height = 40; var ox = o.getContext("2d"); ox.globalAlpha = 0.85; ox.drawImage(a, 0, 0); ox.globalAlpha = 0.6; ox.drawImage(b, 0, 0, a.width, 40); wrap.appendChild(o); }
			else { wrap.appendChild(a); wrap.appendChild(b); }
			wrap.title = "Your words (black) and this font (purple)"; box.appendChild(wrap); return;
		}
		curUse.forEach(function (L, k) {
			var d = r.drawn[k], pair = document.createElement("span"); pair.className = "ff-pair";
			var mine = glyphCanvas(L.g, H, [17, 17, 17]);
			if (!d) { pair.appendChild(mine); var x = document.createElement("span"); x.className = "ff-none"; x.textContent = "–"; pair.appendChild(x); box.appendChild(pair); return; }
			var s = H / d.h, c = document.createElement("canvas"); c.width = Math.max(1, Math.round(d.w * s)); c.height = H;
			var t = document.createElement("canvas"); t.width = d.w; t.height = d.h; var tx = t.getContext("2d"), id = tx.createImageData(d.w, d.h);
			for (var i = 0; i < d.m.length; i++) if (d.m[i]) { id.data[i * 4] = 124; id.data[i * 4 + 1] = 45; id.data[i * 4 + 2] = 146; id.data[i * 4 + 3] = 255; }
			tx.putImageData(id, 0, 0); c.getContext("2d").drawImage(t, 0, 0, c.width, c.height);
			if (S.overlay) {
				var o = document.createElement("canvas"), W = Math.max(mine.width, c.width); o.width = W; o.height = H; var ox = o.getContext("2d");
				ox.globalAlpha = 0.85; ox.drawImage(mine, (W - mine.width) / 2, 0); ox.globalAlpha = 0.6; ox.drawImage(c, (W - c.width) / 2, 0, c.width, H);
				pair.appendChild(o); pair.classList.add("is-ov");
			} else { pair.appendChild(mine); pair.appendChild(c); }
			pair.title = "Your “" + L.ch + "” and the font's"; box.appendChild(pair);
		});
	}
	$("ff-overlay").checked = S.overlay;
	$("ff-overlay").onchange = function () { S.overlay = this.checked; save(); $("ff-results").querySelectorAll(".ff-res").forEach(function (a, i) { var r = filtered()[i]; if (r) drawCompare(a.querySelector(".ff-cmp"), r); }); };
	$("ff-pvtext").addEventListener("input", function () { var t = pvText(); $("ff-results").querySelectorAll(".ff-sample").forEach(function (s) { s.textContent = t; }); });
	seg("ff-view", S.view, function (v) { S.view = v; save(); $("ff-results").classList.toggle("ff-list", v === "list"); });

	/* ---------- saved fonts + famous look-alikes ---------- */
	function renderSaved() {
		$("ff-saved").hidden = !S.saved.length; var box = $("ff-savedlist"); box.innerHTML = "";
		S.saved.forEach(function (s, i) {
			var d = document.createElement("div"); d.className = "ff-sv";
			d.innerHTML = '<span class="ff-svs">' + esc(s.family) + "</span><small>" + F.styleName(s.w, s.it) + "</small>" + (s.local ? "<small>on this computer</small>" : '<a href="' + (s.google ? F.googlePage(s.family) : F.fontsourcePage(s.id)) + '" target="_blank" rel="noopener">Get it ↗</a>') + '<button type="button" aria-label="Remove ' + esc(s.family) + '">&#10005;</button>';
			d.querySelector("button").onclick = function () { S.saved.splice(i, 1); save(); renderSaved(); };
			if (!s.local) loadFace({ id: s.id, family: s.family, google: s.google }, s.w, s.it, null).then(function (al) { if (al) { var e = d.querySelector(".ff-svs"); e.style.fontFamily = al; e.style.fontWeight = s.w; e.style.fontStyle = s.it ? "italic" : "normal"; } });
			else d.querySelector(".ff-svs").style.fontFamily = "'" + s.family + "'";
			box.appendChild(d);
		});
	}
	function renderTwins() {
		$("ff-twinlist").innerHTML = F.TWINS.map(function (t) { return '<div class="ff-tw"><b>' + esc(t[0]) + "</b> → " + t[1].map(function (n) { return '<a href="/fonts?f=' + encodeURIComponent(n) + '&amp;g=1" target="_blank" rel="noopener">' + esc(n) + "</a>"; }).join(", ") + "</div>"; }).join("");
	}

	/* ---------- inputs: file, drop, paste, link, camera, examples, photo editor ---------- */
	var drop = $("ff-drop");
	drop.onclick = function () { $("ff-file").click(); };
	drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("ff-file").click(); } };
	$("ff-file").onchange = function () { if (this.files[0]) loadBlob(this.files[0], this.files[0].name); this.value = ""; };
	["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
	["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("is-over"); }); });
	document.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") >= 0) e.preventDefault(); });
	document.addEventListener("drop", function (e) {
		if (!e.dataTransfer) return; var f = e.dataTransfer.files && e.dataTransfer.files[0];
		if (f) { e.preventDefault(); loadBlob(f, f.name); return; }
		var u = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"); if (/^https?:\/\//.test(u || "")) { e.preventDefault(); openLink(u.trim()); }
	});
	document.addEventListener("paste", function (e) {
		var it = Array.from((e.clipboardData && e.clipboardData.items) || []).filter(function (x) { return /^image\//.test(x.type); })[0];
		if (it) { e.preventDefault(); loadBlob(it.getAsFile(), "pasted picture"); return; }
		var t = e.clipboardData && e.clipboardData.getData("text"); var a = document.activeElement;
		if (/^https?:\/\/\S+$/.test((t || "").trim()) && !(a && /INPUT|TEXTAREA/.test(a.tagName))) { e.preventDefault(); openLink(t.trim()); }
	});
	function openLink(u) {
		toast("Opening the picture…");
		fetch(u, { mode: "cors", credentials: "omit" }).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
			.catch(function () { return fetch("/api/image-fetch?url=" + encodeURIComponent(u), { credentials: "omit" }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }); })
			.then(function (b) { loadBlob(b, u); }).catch(function () { toast("Could not open that link: save the picture and drop it here instead"); });
	}
	$("ff-urlform").onsubmit = function (e) { e.preventDefault(); var u = $("ff-url").value.trim(); if (/^https?:\/\//.test(u)) openLink(u); else toast("Paste a link that starts with https://"); };
	if (matchMedia("(pointer: coarse)").matches) { $("ff-cam").hidden = false; $("ff-cam").onclick = function () { $("ff-camfile").click(); }; $("ff-camfile").onchange = function () { if (this.files[0]) loadBlob(this.files[0], "photo"); this.value = ""; }; }
	$("ff-edit").onclick = function () {
		if (!src || !window.MESPhotoPrep) { toast("The picture editor is still loading"); return; }
		window.MESPhotoPrep.open(work, { title: "Edit the picture", tool: "crop" }).then(function (r) { if (r && r.canvas) { var keep = S.ocr; S.ocr = false; useImage(r.canvas, "edited"); S.ocr = keep; } });
	};
	$("ff-new").onclick = function () { $("ff-file").click(); };
	$("ff-rotl").onclick = function () { rot = (rot + 270) % 360; rebuildWork(true); };
	$("ff-rotr").onclick = function () { rot = (rot + 90) % 360; rebuildWork(true); };
	var tiltT; $("ff-tilt").oninput = function () { tilt = +this.value; $("ff-tiltv").textContent = tilt + "°"; clearTimeout(tiltT); tiltT = setTimeout(function () { rebuildWork(true); }, 120); };
	var thrT; $("ff-thr").oninput = function () { thr = +this.value; clearTimeout(thrT); thrT = setTimeout(function () { findLines(); analyse(); }, 120); };
	seg("ff-ink", ink, function (v) { ink = v; if (work) { findLines(); sel = bestLine(); analyse(); } });
	$("ff-local").checked = S.local; $("ff-local").onchange = function () { S.local = this.checked; save(); };
	$("ff-deep").checked = S.deep; $("ff-deep").onchange = function () { S.deep = this.checked; save(); };
	$("ff-go").onclick = find;

	// examples: drawn here with a real free font, so the right answer is known
	var EX = [["Bebas Neue", 400, "GRAND OPENING", "#111827", "#facc15", -1.5], ["Playfair Display", 700, "Hamburgefonts", "#fdf6e3", "#3b2f2f", 0], ["Pacifico", 400, "Sunday Brunch", "#ffe4e6", "#be123c", 2], ["Space Mono", 400, "Code 42", "#0f172a", "#38bdf8", 0]];
	$("ff-examples").innerHTML = EX.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[2]) + "</button>"; }).join("");
	$("ff-examples").onclick = function (e) {
		var b = e.target.closest("button"); if (!b) return; var x = EX[+b.dataset.i], fo = { id: x[0].toLowerCase().replace(/ /g, "-"), family: x[0], google: true };
		b.disabled = true;
		loadFace(fo, x[1], false, null).then(function (al) {
			b.disabled = false; if (!al) { toast("Could not load the example font"); return; }
			var c = document.createElement("canvas"); c.width = 1000; c.height = 300; var g = c.getContext("2d"); g.fillStyle = x[3]; g.fillRect(0, 0, 1000, 300);
			g.translate(500, 150); g.rotate(x[5] * Math.PI / 180); g.font = fontStr(al, x[1], false, 110); var tw = g.measureText(x[2]).width, size = Math.min(110, 110 * 860 / tw);
			g.font = fontStr(al, x[1], false, size); g.fillStyle = x[4]; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(x[2], 0, 0);
			useImage(c, "example");
			setTimeout(function () { if (!$("ff-text").value) { $("ff-text").value = x[2]; $("ff-text").dispatchEvent(new Event("input")); } }, 50);
		});
	};

	renderSaved(); renderTwins(); getMeta().catch(function () {});
	window.MESFFDebug = { useImage: useImage, find: find, get results() { return results; }, get letters() { return letters; }, get sel() { return sel; } };
})();
