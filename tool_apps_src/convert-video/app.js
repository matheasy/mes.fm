/* MES Video Converter (mes.fm/convert-video): a queue of videos -> MP4 (H.264 + AAC). The work is done by MESConvEngine (engine.js):
 * AVI + H.264 is remuxed by our own reader, everything else goes through ffmpeg.wasm. Nothing is uploaded. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("vc"); if (!root || !window.MESConvEngine) return;
	var C = window.MESConv, E = window.MESConvEngine, KEY = "mes-convert-video:v1";
	var S = { quality: "balanced", reenc: false, disk: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	var files = [], uid = 0, busy = false, dirHandle = null, usedNames = {}, canDir = !!window.showDirectoryPicker;
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function notice(msg, err) { var n = $("vc-notice"); n.hidden = !msg; n.textContent = msg || ""; n.classList.toggle("is-err", !!err); }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 30000); }

	$("vc-quality").value = S.quality; $("vc-reenc").checked = S.reenc; $("vc-disk").checked = S.disk && canDir; $("vc-disk").disabled = !canDir;
	$("vc-disknote").textContent = canDir ? "" : (navigator.brave ? "Brave has this turned off: brave://flags/#file-system-access-api (Enabled, then restart). " : "This browser cannot write into a folder, so results are downloaded. ") + "";
	["vc-quality", "vc-reenc", "vc-disk"].forEach(function (id) { $(id).addEventListener("change", function () { S.quality = $("vc-quality").value; S.reenc = $("vc-reenc").checked; S.disk = $("vc-disk").checked; if (!S.disk) dirHandle = null; save(); files.forEach(function (f) { if (f.state === "done" || f.state === "error") return; }); render(); }); });

	/* ---------- adding files ---------- */
	var drop = $("vc-drop"), input = $("vc-input");
	drop.addEventListener("click", function (e) { if (!e.target.closest("button")) input.click(); });
	drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
	$("vc-pick").onclick = function (e) { e.stopPropagation(); input.click(); }; $("vc-more").onclick = function () { input.click(); };
	input.onchange = function () { add([].slice.call(input.files)); input.value = ""; };
	["dragenter", "dragover"].forEach(function (t) { document.addEventListener(t, function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); drop.classList.add("is-over"); } }); });
	["dragleave", "drop"].forEach(function (t) { document.addEventListener(t, function (e) { if (t === "drop" && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); add([].slice.call(e.dataTransfer.files)); } if (t === "dragleave" && e.relatedTarget) return; drop.classList.remove("is-over"); }); });
	$("vc-clear").onclick = function () { if (busy) return; files.forEach(freeOut); files = []; usedNames = {}; $("vc-work").hidden = true; notice(""); };
	function freeOut(f) { if (f.url) { try { URL.revokeObjectURL(f.url); } catch (e) { /* ignore */ } f.url = null; } }
	function add(list) {
		var vids = list.filter(function (x) { return C.isVideo(x.name, x.type); }), bad = list.length - vids.length;
		notice(bad ? bad + " file" + (bad > 1 ? "s were" : " was") + " skipped: not a video." : "");
		if (!vids.length) return;
		$("vc-work").hidden = false;
		vids.forEach(function (file) { var f = { id: ++uid, file: file, state: "probing", pct: 0, note: "", out: C.outName(file.name, usedNames) }; files.push(f); probe(f); });
		render();
	}
	async function probe(f) {
		try { f.p = await E.probe(f.file); f.state = "ready"; }
		catch (e) { f.state = "error"; f.note = (e && e.message) || "This file could not be read."; }
		render();
	}
	function describe(f) {
		var p = f.p; if (!p) return "Reading...";
		var parts = [p.container.toUpperCase()];
		if (p.avi) { parts.push((p.avi.h264 ? "H.264" : p.avi.vcodec || "?") + " " + p.avi.width + "×" + p.avi.height + " " + Math.round(p.avi.fps * 100) / 100 + " fps"); if (p.avi.duration) parts.push(C.formatTime(p.avi.duration)); if (p.avi.audioKind !== "none") parts.push(p.avi.audioKind.toUpperCase() + " sound"); }
		return parts.join(" · ") + " · " + C.formatBytes(f.file.size);
	}
	function routeText(f) {
		if (!f.p) return "";
		var r = f.p.route;
		if (r.engine === "native" && !S.reenc) return '<span class="vc-eng is-fast">Fast copy</span> ' + esc(r.why);
		return '<span class="vc-eng">ffmpeg</span> ' + esc(S.reenc ? "the picture will be re-encoded with x264" : r.why === "read with ffmpeg" ? "read with ffmpeg; H.264 is copied, other pictures are re-encoded" : "read with ffmpeg: " + r.why);
	}

	/* ---------- list ---------- */
	function render() {
		var list = $("vc-list");
		list.innerHTML = files.map(function (f) {
			var right = "";
			if (f.state === "done") right = (f.url ? '<a class="tu-btn tu-btn--primary" href="' + f.url + '" download="' + esc(f.out) + '">Download</a> <button type="button" class="tu-btn tu-btn--ghost" data-play="' + f.id + '">Play</button>' : '<span class="vc-ok">Saved in the folder</span>');
			else if (f.state === "working") right = '<button type="button" class="tu-btn tu-btn--ghost" data-cancel="' + f.id + '">Cancel</button>';
			if (f.state !== "working") right += ' <button type="button" class="vc-x" data-rm="' + f.id + '" aria-label="Remove ' + esc(f.file.name) + '">&times;</button>';
			var st = f.state === "probing" ? "Reading the file..." : f.state === "ready" ? routeText(f) : f.state === "queued" ? "Waiting... " + routeText(f) : f.state === "working" ? esc(f.status || "Converting...") : f.state === "done" ? '<span class="vc-ok">Done</span> &rarr; <b>' + esc(f.out) + "</b>, " + C.formatBytes(f.size) + " " + esc(f.note || "") + (f.secs ? " in " + C.formatTime(f.secs) : "") : '<span class="vc-bad">' + esc(f.note || "Failed") + "</span>";
			return '<div class="vc-f" data-id="' + f.id + '"><div class="vc-th">' + esc((C.extOf(f.file.name) || "?").toUpperCase()) + '</div><div><div class="vc-fn" title="' + esc(f.file.name) + '">' + esc(f.file.name) + '</div><div class="vc-fm">' + esc(describe(f)) + '</div><div class="vc-fm">' + st + "</div>" +
				(f.state === "working" ? '<div class="vc-bar"><i style="width:' + Math.round(f.pct * 100) + '%"></i></div>' : "") + (f.play ? '<video class="vc-vid" controls src="' + f.url + '"></video>' : "") + '</div><div class="vc-fr">' + right + "</div></div>";
		}).join("");
		var done = files.filter(function (f) { return f.state === "done" && f.blob; }).length;
		$("vc-zip").hidden = done < 2;
		$("vc-go").disabled = busy || !files.some(function (f) { return f.state === "ready" || f.state === "error"; });
		$("vc-go").textContent = busy ? "Converting..." : "Convert to MP4";
	}
	$("vc-list").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var id;
		if ((id = b.getAttribute("data-rm"))) { var i = files.findIndex(function (f) { return f.id == id; }); if (i >= 0) { freeOut(files[i]); delete usedNames[files[i].out.toLowerCase()]; files.splice(i, 1); } if (!files.length) $("vc-work").hidden = true; render(); }
		else if ((id = b.getAttribute("data-cancel"))) { var f = files.find(function (x) { return x.id == id; }); if (f) { f.cancel = true; f.status = "Cancelling..."; render(); } }
		else if ((id = b.getAttribute("data-play"))) { var g = files.find(function (x) { return x.id == id; }); if (g) { g.play = !g.play; render(); } }
	});

	/* ---------- converting ---------- */
	$("vc-go").onclick = async function () {
		if (busy) return;
		if (S.disk && canDir && !dirHandle) { try { dirHandle = await window.showDirectoryPicker({ mode: "readwrite", id: "mes-convert-video" }); } catch (e) { return; } }
		busy = true; notice("");
		files.forEach(function (f) { if (f.state === "ready" || f.state === "error") { f.state = "queued"; f.cancel = false; } });
		render(); var t0 = Date.now(), n = 0;
		for (var j = 0; j < files.length; j++) {
			var f = files[j]; if (f.state !== "queued") continue;
			f.state = "working"; f.pct = 0; f.status = "Starting..."; render(); var start = Date.now();
			try {
				var handle = null;
				if (S.disk && dirHandle) handle = await dirHandle.getFileHandle(await freeName(dirHandle, f.out), { create: true });
				var res = await E.convert(f.file, {
					probe: f.p, handle: handle, quality: S.quality, reencode: S.reenc,
					cancelled: function () { return f.cancel; },
					onProgress: function (x) { f.pct = x; f.status = "Converting... " + Math.round(x * 100) + "%" + eta(start, x); paint(f); },
					onStatus: function (txt, x) { f.status = txt; if (x != null) f.pct = x; paint(f); }
				});
				f.state = "done"; f.size = res.size; f.note = res.note; f.secs = (Date.now() - start) / 1000;
				if (res.blob) { f.blob = res.blob; f.url = URL.createObjectURL(res.blob); }
				n++;
			} catch (e) { f.state = "error"; f.note = (e && e.message) || "Failed."; if (window.console) console.error("[video converter]", e); }
			render();
		}
		busy = false; render();
		$("vc-prog").textContent = n ? n + " converted in " + C.formatTime((Date.now() - t0) / 1000) + "." : "";
	};
	async function freeName(dir, name) {
		var base = name.replace(/\.mp4$/i, ""), cand = name, k = 2;
		while (true) { try { await dir.getFileHandle(cand); cand = base + " (" + (k++) + ").mp4"; } catch (e) { return cand; } }
	}
	function eta(start, x) { if (x < 0.03) return ""; var el = (Date.now() - start) / 1000, left = el / x - el; return left > 2 ? ", about " + C.formatTime(left) + " left" : ""; }
	function paint(f) {
		var row = $("vc-list").querySelector('.vc-f[data-id="' + f.id + '"]'); if (!row) return render();
		var bar = row.querySelector(".vc-bar i"); if (bar) bar.style.width = Math.round(f.pct * 100) + "%";
		var fm = row.querySelectorAll(".vc-fm")[1]; if (fm) fm.textContent = f.status;
	}
	$("vc-zip").onclick = function () {
		var outs = files.filter(function (f) { return f.state === "done" && f.blob; });
		if (!outs.length || !window.MESImg) return;
		var btn = $("vc-zip"); btn.disabled = true; btn.textContent = "Making the ZIP...";
		Promise.all(outs.map(function (f) { return f.blob.arrayBuffer().then(function (b) { return { name: f.out, data: new Uint8Array(b) }; }); })).then(function (list) {
			download(new Blob([window.MESImg.zipStore(list)], { type: "application/zip" }), "videos-mp4.zip");
		}).catch(function (e) { notice("The ZIP could not be made (too big for memory?). Download the files one by one.", true); }).then(function () { btn.disabled = false; btn.textContent = "Download all as ZIP"; });
	};
	window.addEventListener("beforeunload", function (e) { if (busy) { e.preventDefault(); e.returnValue = ""; } });
})();
