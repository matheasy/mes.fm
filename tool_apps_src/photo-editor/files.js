/* MES Photo Editor: GIMP (.xcf) export and a connected folder on this computer (File System Access API, Chrome / Edge / Brave): browse its pictures, add them as layers, save into it. */
(function () {
	"use strict";
	var PE = window.PE, X = window.MESXcf, el = PE.el, esc = PE.esc;

	/* ---------- save as GIMP ---------- */
	PE.saveXcf = function () {
		var d = PE.doc; if (!d) { PE.toast("Open or create an image first"); return; } PE.relink();
		var out = [], skipped = 0;
		d.layers.forEach(function (L) {
			if (PE.isGroup(L)) return; var b = PE.bounds(L), x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y)), x1 = Math.min(d.w, Math.ceil(b.x + b.w)), y1 = Math.min(d.h, Math.ceil(b.y + b.h));
			if (x1 <= x0 || y1 <= y0) { skipped++; return; }
			var w = x1 - x0, h = y1 - y0, c = PE.mk(w, h), x = c.getContext("2d");
			PE.drawLayer(x, Object.assign({}, L, { _p: null, opacity: 1, blend: "source-over", visible: true }), [1, 0, 0, 1, -x0, -y0], "xcf", w, h);
			var id = x.getImageData(0, 0, w, h); out.push({ name: L.name, x: x0, y: y0, w: w, h: h, data: new Uint8Array(id.data.buffer), opacity: L.opacity, visible: PE.effVisible(L), mode: X.MODES[L.blend] || 0 });
		});
		if (!out.length) { PE.toast("Nothing to save: every layer is outside the canvas"); return; }
		var bytes = X.write({ w: d.w, h: d.h, layers: out });
		PE.download(new Blob([bytes], { type: "image/x-xcf" }), window.MESImg.cleanFileName(d.name) + ".xcf"); PE.toast("Saved a GIMP file with " + out.length + " layer" + (out.length === 1 ? "" : "s") + (skipped ? " (" + skipped + " outside the canvas skipped)" : "") + ". Text became pixels; groups and masks are flattened.");
	};

	/* ---------- connected folder ---------- */
	var IMG = /\.(png|jpe?g|webp|gif|bmp|avif|psd|mesproj)$/i, dirHandle = null;
	function idb(fn) { return new Promise(function (res, rej) { var r = indexedDB.open("mes-photo-editor", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result; Promise.resolve(fn(db.transaction("kv", "readwrite").objectStore("kv"))).then(res, rej); }; r.onerror = function () { rej(r.error); }; }); }
	function rq(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function perm(h, write) { var o = { mode: write ? "readwrite" : "read" }; return (h.queryPermission ? h.queryPermission(o) : Promise.resolve("granted")).then(function (p) { return p === "granted" ? p : h.requestPermission(o); }); }
	PE.dlgFolder = function () {
		if (!window.showDirectoryPicker) { PE.toast("This browser cannot connect to a folder. Use Chrome, Edge or Brave on a computer."); return; }
		var wrap = el("div", "pe-fold"), head = el("div", "pe-fold-h"), grid = el("div", "pe-fold-g"), msg = el("p", "pe-hint2"), search = el("input", "pe-fold-s");
		search.type = "search"; search.placeholder = "Filter by name…"; search.setAttribute("aria-label", "Filter pictures by name");
		var bPick = el("button", "pe-btn pe-btn--sm", "📂 Choose a folder…"), bAgain = el("button", "pe-btn pe-btn--sm", "↺ Reconnect to last folder"), bSave = el("button", "pe-btn pe-btn--sm", "⬇ Save this image here"); [bPick, bAgain, bSave].forEach(function (b) { b.type = "button"; });
		bSave.title = "Writes the current image as a PNG into the connected folder";
		head.appendChild(bPick); head.appendChild(bAgain); head.appendChild(bSave); head.appendChild(PE.helpBtn("Connected folder", "Connect a folder on your computer and the editor lists its pictures. Click one to add it as a layer (or open it as the image if nothing is open); hold Shift to open it as a new image instead. Nothing is uploaded: the editor reads the files straight from your disk, and only with the permission you give in the browser's pop-up. Chrome, Edge and Brave only."));
		wrap.appendChild(head); wrap.appendChild(search); wrap.appendChild(msg); wrap.appendChild(grid);
		var m = PE.modal({ title: "Folder on this computer", wide: true, body: wrap, noFocus: true, buttons: [{ label: "Close", primary: true, act: function (mm) { mm.close(); } }] });
		var entries = [], token = 0;
		function load(h) {
			dirHandle = h; var my = ++token; grid.innerHTML = ""; entries = []; msg.textContent = "Reading " + h.name + "…"; bAgain.hidden = true;
			(async function () { try { for await (var e of h.values()) { if (e.kind === "file" && IMG.test(e.name)) entries.push(e); } } catch (x) { msg.textContent = "Could not read the folder: " + x.message; return; }
				if (my !== token) return; entries.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); }); msg.textContent = h.name + ": " + entries.length + " picture" + (entries.length === 1 ? "" : "s") + (entries.length > 400 ? " (showing the first 400, use the filter)" : ""); render(); })();
		}
		function render() {
			var q = search.value.trim().toLowerCase(), list = entries.filter(function (e) { return !q || e.name.toLowerCase().indexOf(q) >= 0; }).slice(0, 400); grid.innerHTML = "";
			var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { io.unobserve(x.target); x.target._load(); } }); }, { root: grid, rootMargin: "200px" }) : null;
			list.forEach(function (e) {
				var t = el("button", "pe-fold-t"), c = el("canvas"), n = el("span", "pe-fold-n", esc(e.name)); t.type = "button"; c.width = 120; c.height = 90; t.appendChild(c); t.appendChild(n); t.title = e.name + " — click: add as layer · Shift-click: open as new image";
				t._load = function () { if (/\.(psd|mesproj)$/i.test(e.name)) { var x = c.getContext("2d"); x.fillStyle = "#26262e"; x.fillRect(0, 0, 120, 90); x.fillStyle = "#9b9bab"; x.font = "bold 14px sans-serif"; x.textAlign = "center"; x.fillText(e.name.split(".").pop().toUpperCase(), 60, 50); return; }
					e.getFile().then(function (f) { return createImageBitmap(f, { resizeWidth: 120, resizeQuality: "medium" }).catch(function () { return PE.decodeFile(f); }); }).then(function (im) { var x = c.getContext("2d"), w = im.width || im.naturalWidth, h = im.height || im.naturalHeight, s = Math.min(120 / w, 90 / h); x.drawImage(im, (120 - w * s) / 2, (90 - h * s) / 2, w * s, h * s); }).catch(function () { n.textContent = "⚠ " + e.name; }); };
				if (io) io.observe(t); else t._load();
				t.addEventListener("click", function (ev) { e.getFile().then(function (f) { PE.openFiles([f], { place: !!PE.doc && !ev.shiftKey }); m.close(); }); });
				grid.appendChild(t);
			});
		}
		search.addEventListener("input", render);
		bPick.addEventListener("click", function () { window.showDirectoryPicker({ id: "mes-photo-folder", mode: "readwrite" }).then(function (h) { idb(function (st) { return rq(st.put(h, "dir")); }).catch(function () {}); load(h); }).catch(function () {}); });
		bAgain.addEventListener("click", function () { idb(function (st) { return rq(st.get("dir")); }).then(function (h) { return h ? perm(h, false).then(function (p) { if (p === "granted") load(h); else msg.textContent = "Permission was not given."; }) : null; }).catch(function (x) { msg.textContent = "Could not reconnect: " + x.message; }); });
		bSave.addEventListener("click", function () {
			if (!PE.doc) { PE.toast("Open or create an image first"); return; } if (!dirHandle) { PE.toast("Choose a folder first"); return; }
			perm(dirHandle, true).then(function (p) { if (p !== "granted") throw new Error("no permission"); return PE.exportBlob("png", 1, {}); }).then(function (b) { var name = window.MESImg.cleanFileName(PE.doc.name || "image") + ".png"; return dirHandle.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(b).then(function () { return w.close(); }); }).then(function () { PE.toast("Saved " + name + " into " + dirHandle.name); load(dirHandle); }); }).catch(function (x) { PE.toast("Could not save: " + x.message); });
		});
		if (dirHandle) { load(dirHandle); } else { msg.textContent = "Choose a folder to see its pictures."; idb(function (st) { return rq(st.get("dir")); }).then(function (h) { bAgain.hidden = !h; if (h) bAgain.textContent = "↺ Reconnect to “" + h.name + "”"; }).catch(function () { bAgain.hidden = true; }); }
	};
})();
