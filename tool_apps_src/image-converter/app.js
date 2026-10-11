/* MES Bulk Image Converter -- mes.fm/image-converter. PNG / JPEG / WebP in bulk, in the browser (canvas); pure helpers in lib.js (MESImg, node-tested:
 * tool_apps_src/image-converter-tests.js). Settings in localStorage mes-image-converter:v1; links ?to=jpg|png|webp (the /png-to-jpg style redirects). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("cv"); if (!root) return;
	var M = window.MESImg, KEY = "mes-image-converter:v1";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var q = new URLSearchParams(location.search), saved = sget();
	var S = { fmt: M.FORMATS[q.get("to")] ? q.get("to") : (M.FORMATS[saved.fmt] ? saved.fmt : "jpg"), q: +saved.q || 90, rs: saved.rs || "keep", w: saved.w || "", h: saved.h || "", p: saved.p || 50, bg: saved.bg || "#ffffff", name: saved.name || "" };
	var items = [], seq = 0, running = false, again = false, timer = 0;

	function toast(t) { var e = document.querySelector(".tu-toast"); if (!e) { e = document.createElement("div"); e.className = "tu-toast"; document.body.appendChild(e); } e.textContent = t; e.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { e.classList.remove("tu-toast--show"); }, 2200); }

	function syncUI() {
		var seg = $("cv-fmt").querySelectorAll("button"); for (var i = 0; i < seg.length; i++) seg[i].setAttribute("aria-pressed", seg[i].dataset.f === S.fmt ? "true" : "false");
		var lossy = M.FORMATS[S.fmt].lossy; $("cv-q-f").hidden = !lossy; $("cv-bg-f").hidden = M.FORMATS[S.fmt].alpha;
		$("cv-q").value = S.q; $("cv-q-v").textContent = S.q; $("cv-rs").value = S.rs; $("cv-w").value = S.w; $("cv-h").value = S.h; $("cv-p").value = S.p; $("cv-bg").value = S.bg; $("cv-name").value = S.name;
		$("cv-rs-in").hidden = S.rs === "keep"; $("cv-w").hidden = !(S.rs === "width" || S.rs === "box"); $("cv-h").hidden = !(S.rs === "height" || S.rs === "box"); $("cv-p").hidden = S.rs !== "percent";
		$("cv-q-n").textContent = S.q >= 90 ? "90 and up looks identical to the original for most photos." : S.q >= 75 ? "75 to 85 gives much smaller files with almost no visible change." : "Below 70 you may see blocky areas or blur.";
	}
	function resizeOpts() { return { mode: S.rs, w: +S.w || 0, h: +S.h || 0, p: +S.p || 100 }; }

	function decode(file) {
		if (window.createImageBitmap && !/svg/.test(file.type)) return createImageBitmap(file).catch(function () { return viaImg(file); });
		return viaImg(file);
	}
	function viaImg(file) {
		return new Promise(function (res, rej) {
			var u = URL.createObjectURL(file), im = new Image();
			im.onload = function () { URL.revokeObjectURL(u); if (!im.naturalWidth) { rej(new Error("empty")); return; } res(im); };
			im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("unreadable")); };
			im.src = u;
		});
	}
	function dims(im) { return { w: im.naturalWidth || im.width, h: im.naturalHeight || im.height }; }

	function convert(it, idx) {
		return decode(it.file).then(function (im) {
			var d = dims(im), o = M.fitSize(d.w, d.h, resizeOpts());
			it.ow = d.w; it.oh = d.h;
			var c = document.createElement("canvas"); c.width = o.w; c.height = o.h; var x = c.getContext("2d");
			if (!M.FORMATS[S.fmt].alpha) { x.fillStyle = S.bg; x.fillRect(0, 0, o.w, o.h); }
			x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
			if (o.scale < 0.5) {      // step down by halves: a single big drawImage shrink aliases
				var cur = im, cw = d.w, ch = d.h;
				while (cw / 2 > o.w * 1.0001) {
					var nw = Math.max(o.w, Math.floor(cw / 2)), nh = Math.max(o.h, Math.floor(ch / 2)), t = document.createElement("canvas"); t.width = nw; t.height = nh;
					var tx = t.getContext("2d"); tx.imageSmoothingQuality = "high"; tx.drawImage(cur, 0, 0, nw, nh); cur = t; cw = nw; ch = nh;
				}
				x.drawImage(cur, 0, 0, o.w, o.h);
			} else x.drawImage(im, 0, 0, o.w, o.h);
			if (im.close) im.close();
			it.nw = o.w; it.nh = o.h;
			return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error("This browser can't save " + M.FORMATS[S.fmt].name)); }, M.FORMATS[S.fmt].mime, S.q / 100); });
		}).then(function (blob) {
			if (blob.type !== M.FORMATS[S.fmt].mime) throw new Error("This browser can't save " + M.FORMATS[S.fmt].name);
			it.blob = blob; it.fmt = S.fmt; it.err = ""; it.n = idx + 1;
			it.out = M.outName(S.name, it.file.name, idx + 1, S.fmt, it.nw, it.nh);
		}).catch(function (e) { it.blob = null; it.err = (e && e.message === "unreadable") ? "Can't read this file (HEIC or damaged?)" : (e && e.message) || "Failed"; });
	}

	function runAll() {
		if (running) { again = true; return; }
		running = true; again = false; var todo = items.slice(), done = 0, total = todo.length, idx = 0;
		todo.forEach(function (it) { it.busy = true; it.blob = null; }); render();
		$("cv-prog").hidden = false;
		function next() {
			if (again) return Promise.resolve();
			var it = todo[idx], my = idx++; if (!it) return Promise.resolve();
			return convert(it, items.indexOf(it) >= 0 ? items.indexOf(it) : my).then(function () { it.busy = false; done++; $("cv-prog-i").style.width = (100 * done / total) + "%"; renderItem(it); renderSum(); return next(); });
		}
		var workers = []; for (var w = 0; w < Math.min(2, total); w++) workers.push(next());
		Promise.all(workers).then(function () {
			running = false; $("cv-prog").hidden = true; $("cv-prog-i").style.width = "0";
			if (again) { runAll(); return; }
			todo.forEach(function (it) { it.busy = false; }); render();
		});
	}
	function schedule() { clearTimeout(timer); timer = setTimeout(function () { if (items.length) { if (running) again = true; else runAll(); } }, 350); }

	function add(files) {
		var imgs = []; for (var i = 0; i < files.length; i++) { var f = files[i]; if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif|svg|ico|heic|heif)$/i.test(f.name)) imgs.push(f); }
		if (!imgs.length) { toast("No images found in that selection"); return; }
		imgs.forEach(function (f) { items.push({ id: ++seq, file: f, thumb: URL.createObjectURL(f) }); });
		render(); schedule();
	}

	function renderSum() {
		var ok = items.filter(function (i) { return i.blob; }), a = 0, b = 0;
		ok.forEach(function (i) { a += i.file.size; b += i.blob.size; });
		var s = "<b>" + items.length + "</b> image" + (items.length === 1 ? "" : "s");
		if (ok.length) s += " · converted <b>" + ok.length + "</b> · " + M.formatBytes(a) + " → <b>" + M.formatBytes(b) + "</b>" + (a ? " (" + (b <= a ? "−" + Math.round(100 * (1 - b / a)) + "% smaller" : "+" + Math.round(100 * (b / a - 1)) + "% larger") + ")" : "");
		var bad = items.filter(function (i) { return i.err; }).length; if (bad) s += " · <span style='color:#b91c1c'>" + bad + " failed</span>";
		$("cv-sum").innerHTML = s; $("cv-zip").disabled = !ok.length;
	}
	function itemHTML(it) {
		var meta;
		if (it.busy) meta = "Converting…";
		else if (it.err) meta = '<span class="cv-err">' + esc(it.err) + "</span>";
		else if (it.blob) { var pct = it.file.size ? Math.round(100 * (1 - it.blob.size / it.file.size)) : 0; meta = esc(it.ow + "×" + it.oh) + (it.nw !== it.ow ? " → " + it.nw + "×" + it.nh : "") + " · " + M.formatBytes(it.file.size) + " → <b>" + M.formatBytes(it.blob.size) + "</b> " + (pct >= 0 ? '<span class="cv-save">−' + pct + "%</span>" : '<span class="cv-grow">+' + (-pct) + "%</span>"); }
		else meta = M.formatBytes(it.file.size) + " · waiting";
		return '<img class="cv-th" src="' + it.thumb + '" alt="" loading="lazy"><div class="cv-nm" title="' + esc(it.file.name) + '">' + esc(it.blob ? it.out : it.file.name) + '</div><div class="cv-meta">' + meta + '</div><div class="cv-btns"><button type="button" data-a="dl" ' + (it.blob ? "" : "disabled") + ' aria-label="Download ' + esc(it.out || it.file.name) + '">⬇</button><button type="button" data-a="rm" aria-label="Remove">✕</button></div>';
	}
	function renderItem(it) { var li = $("cv-list").querySelector('[data-id="' + it.id + '"]'); if (li) li.innerHTML = itemHTML(it); }
	function render() {
		$("cv-bar").hidden = !items.length;
		var l = $("cv-list"); l.innerHTML = "";
		items.forEach(function (it) { var li = document.createElement("li"); li.className = "cv-it"; li.dataset.id = it.id; li.innerHTML = itemHTML(it); l.appendChild(li); });
		renderSum();
	}
	function save(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }

	$("cv-list").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var li = b.closest("li"), it = items.filter(function (x) { return String(x.id) === li.dataset.id; })[0]; if (!it) return;
		if (b.dataset.a === "dl" && it.blob) save(it.blob, it.out);
		if (b.dataset.a === "rm") { URL.revokeObjectURL(it.thumb); items.splice(items.indexOf(it), 1); render(); }
	});
	$("cv-zip").addEventListener("click", function () {
		var ok = items.filter(function (i) { return i.blob; }); if (!ok.length) return;
		if (ok.length === 1) { save(ok[0].blob, ok[0].out); return; }
		var used = {}, btn = $("cv-zip"); btn.disabled = true; btn.textContent = "Making ZIP…";
		Promise.all(ok.map(function (i) { return i.blob.arrayBuffer().then(function (ab) { return { name: M.uniqueName(i.out, used), data: new Uint8Array(ab) }; }); })).then(function (files) {
			save(new Blob([M.zipStore(files)], { type: "application/zip" }), "converted-images.zip");
		}).catch(function () { toast("Could not make the ZIP"); }).then(function () { btn.disabled = false; btn.textContent = "⬇ Download all (ZIP)"; });
	});
	$("cv-clear").addEventListener("click", function () { items.forEach(function (i) { URL.revokeObjectURL(i.thumb); }); items = []; render(); });
	$("cv-redo").addEventListener("click", function () { if (items.length) runAll(); });

	var drop = $("cv-drop");
	drop.addEventListener("click", function (e) { if (e.target.closest("button")) return; $("cv-file").click(); });
	drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("cv-file").click(); } });
	$("cv-pick").addEventListener("click", function () { $("cv-file").click(); });
	$("cv-folder").addEventListener("click", function () { $("cv-dir").click(); });
	$("cv-file").addEventListener("change", function () { add(this.files); this.value = ""; });
	$("cv-dir").addEventListener("change", function () { add(this.files); this.value = ""; });
	["dragenter", "dragover"].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); drop.classList.add("is-over"); } }); });
	["dragleave", "drop"].forEach(function (ev) { document.addEventListener(ev, function (e) { if (ev === "dragleave" && e.relatedTarget) return; drop.classList.remove("is-over"); }); });
	document.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); add(e.dataTransfer.files); } });
	document.addEventListener("paste", function (e) { var f = []; var its = (e.clipboardData && e.clipboardData.items) || []; for (var i = 0; i < its.length; i++) if (its[i].kind === "file") { var x = its[i].getAsFile(); if (x) f.push(x.name === "image.png" ? new File([x], "pasted-" + Date.now() + ".png", { type: x.type }) : x); } if (f.length) add(f); });

	function change(k, v) { S[k] = v; var o = {}; o[k] = v; sset(o); syncUI(); if (items.length) { items.forEach(function (i) { i.blob = null; }); renderSum(); schedule(); } }
	$("cv-fmt").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) change("fmt", b.dataset.f); });
	$("cv-q").addEventListener("input", function () { change("q", +this.value); });
	$("cv-rs").addEventListener("change", function () { change("rs", this.value); });
	["w", "h", "p"].forEach(function (k) { $("cv-" + k).addEventListener("input", function () { change(k, this.value); }); });
	$("cv-bg").addEventListener("input", function () { change("bg", this.value); });
	$("cv-name").addEventListener("change", function () { change("name", this.value); });
	syncUI();
})();
