/* MES Photo Editor: GIMP (.xcf) export, and File -> "Files and folders": where each layer came from, the autosave in this browser, and a folder on this computer
 * (File System Access API: Chrome and Edge on a computer, Brave only after brave://flags/#file-system-access-api; elsewhere a read-only folder through <input webkitdirectory>). */
(function () {
	"use strict";
	var PE = window.PE, X = window.MESXcf, P = window.MESPixel, I = window.MESImg, el = PE.el, esc = PE.esc;

	/* ---------- save as GIMP ---------- */
	PE.saveXcf = function () {
		var d = PE.doc; if (!d) { PE.toast("Open or create an image first"); return; } PE.relink();
		var out = [], skipped = 0;
		d.layers.forEach(function (L) {
			if (PE.isGroup(L)) return; var b = PE.bounds(L), fr = PE.fxReach ? PE.fxReach(L) : 0; b = { x: b.x - fr, y: b.y - fr, w: b.w + fr * 2, h: b.h + fr * 2 }; var x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y)), x1 = Math.min(d.w, Math.ceil(b.x + b.w)), y1 = Math.min(d.h, Math.ceil(b.y + b.h));
			if (x1 <= x0 || y1 <= y0) { skipped++; return; }
			var w = x1 - x0, h = y1 - y0, c = PE.mk(w, h), x = c.getContext("2d");
			PE.drawLayer(x, Object.assign({}, L, { _p: null, opacity: 1, blend: "source-over", visible: true }), [1, 0, 0, 1, -x0, -y0], "xcf", w, h);
			var id = x.getImageData(0, 0, w, h); out.push({ name: L.name, x: x0, y: y0, w: w, h: h, data: new Uint8Array(id.data.buffer), opacity: L.opacity, visible: PE.effVisible(L), mode: X.MODES[L.blend] || 0 });
		});
		if (!out.length) { PE.toast("Nothing to save: every layer is outside the canvas"); return; }
		var bytes = X.write({ w: d.w, h: d.h, layers: out });
		PE.download(new Blob([bytes], { type: "image/x-xcf" }), window.MESImg.cleanFileName(d.name) + ".xcf"); PE.toast("Saved a GIMP file with " + out.length + " layer" + (out.length === 1 ? "" : "s") + (skipped ? " (" + skipped + " outside the canvas skipped)" : "") + ". Text became pixels; groups and masks are flattened.");
	};

	/* ---------- open a GIMP file: layers, groups, masks, offsets, opacity, modes (MESXcf.read). place = add into the open image as a group named after the file ---------- */
	PE.loadXcf = function (buf, name, meta, place) {
		var r; try { r = X.read(buf); } catch (e) { PE.toast("Can't open " + name + ": " + (e && e.message || e)); return false; }
		var notes = r.notes.slice(), d, made = [], skipped = 0;
		if (place && PE.doc) d = PE.doc; else { if (!PE.newDoc(r.w, r.h, null, I.baseName(name))) return false; d = PE.doc; d.layers = []; d.file = PE.mkSrc(Object.assign({ file: name }, meta || {}, { how: "xcf" })); }
		var src = PE.mkSrc(Object.assign({}, meta || {}, { how: "xcf", file: name }));
		r.layers.forEach(function (n) {   // top-first, like the file
			var L;
			if (n.group) { L = PE.makeGroup(n.name); L.collapsed = true; }
			else {
				if (!n.data || n.w > PE.MAXPX || n.h > PE.MAXPX || n.w * n.h > PE.MAXAREA) { if (n.data) { skipped++; notes.push("“" + n.name + "” is too large for a browser (" + n.w + " × " + n.h + "): left out"); } made.push(null); return; }
				var c = PE.mk(n.w, n.h); c.getContext("2d").putImageData(new ImageData(n.data, n.w, n.h), 0, 0);
				L = PE.makeLayer({ canvas: c, name: n.name, x: n.x, y: n.y, src: Object.assign({}, src, { w: n.w, h: n.h }) });
				L.blend = n.blend || "source-over";
				if (n.mask) { var mc = PE.mk(n.w, n.h), mx = mc.getContext("2d"), id = mx.createImageData(n.w, n.h), a = id.data, m = n.mask.data; for (var i = 0; i < m.length; i++) a[i * 4 + 3] = m[i]; mx.putImageData(id, 0, 0); L.mask = mc; }
			}
			L.visible = n.visible; L.opacity = n.opacity; made.push(L);
		});
		r.layers.forEach(function (n, i) { var L = made[i]; if (!L) return; var p = n.parent >= 0 ? made[n.parent] : null; L.group = p ? p.id : null; });
		var list = made.filter(Boolean).reverse();   // the editor keeps layers bottom-first, a group's header after its members
		if (!list.some(function (L) { return !PE.isGroup(L); })) { if (!place) { d.layers.push(PE.makeLayer({ name: "Layer 1" })); d.activeId = d.layers[0].id; PE.commit("Open GIMP file"); PE.fit(); PE.emit("docsize"); } PE.toast("No layers could be read from " + name + (notes.length ? ": " + notes[0] : "")); return false; }
		if (place) {
			var G = PE.makeGroup(I.baseName(name)); G.collapsed = true;   // the file becomes one group on top of everything, outside any other group
			list.forEach(function (L) { if (L.group == null) L.group = G.id; }); list.push(G);
			Array.prototype.push.apply(d.layers, list); d.activeId = G.id; PE.relink(); PE.commit("Add GIMP file " + name); PE.emit("layers"); PE.invalidate();
		} else {
			d.layers = list; d.activeId = list[list.length - 1].id; PE.relink(); PE.commit("Open GIMP file"); PE.dirty = false; PE.fit(); PE.emit("docsize"); PE.emit("layers");
		}
		PE.setTool("move");
		var nl = list.filter(function (L) { return !PE.isGroup(L); }).length, ng = list.length - nl - (place ? 1 : 0);
		var msg = (place ? "Added " : "Opened ") + nl + " layer" + (nl === 1 ? "" : "s") + (ng ? " and " + ng + " group" + (ng === 1 ? "" : "s") : "") + " from the GIMP file" + (r.precision.indexOf("8-bit") !== 0 || / linear/.test(r.precision) ? " (" + r.precision + ", shown in 8-bit)" : "");
		var info = notes.filter(function (t) { return /^Text layers/.test(t); }); notes = notes.filter(function (t) { return info.indexOf(t) < 0; });
		if (info.length) msg += ". Text layers are now pixels (the text is the layer name)";
		if (!notes.length) { PE.toast(msg); return true; }
		var w = el("div", "pe-xcf-notes"); w.innerHTML = "<p>" + esc(msg) + ". A few things in it work differently here:</p><ul>" + notes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
		PE.modal({ title: "Opened “" + name + "”", body: w, buttons: [{ label: "OK", primary: true, act: function (m) { m.close(); } }] });
		return true;
	};

	/* ---------- files and folders ---------- */
	var IMG = /\.(png|jpe?g|webp|gif|bmp|avif|psd|xcf|mesproj|zip)$/i, BRAVE_FLAG = "brave://flags/#file-system-access-api", dirHandle = null, roFiles = null, roName = "";
	var handles = PE.srcHandles = {}, hseq = 0;   // memory only: file handles of pictures added from the connected folder (a handle cannot go into a project file)
	function canFS() { return typeof window.showDirectoryPicker === "function"; }
	function isBrave() { return !!(navigator.brave && typeof navigator.brave.isBrave === "function"); }
	function isMobile() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || "")); }
	function idb(fn) { return new Promise(function (res, rej) { var r = indexedDB.open("mes-photo-editor", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result; Promise.resolve(fn(db.transaction("kv", "readwrite").objectStore("kv"))).then(res, rej); }; r.onerror = function () { rej(r.error); }; }); }
	function rq(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function perm(h, write, ask) { var o = { mode: write ? "readwrite" : "read" }; if (!h || !h.queryPermission) return Promise.resolve("granted"); return h.queryPermission(o).then(function (p) { return p === "granted" || !ask ? p : h.requestPermission(o); }); }
	function permText(p) { return p === "granted" ? "the editor can open and save files there" : p === "prompt" ? "the browser will ask again before the editor saves there" : "the browser blocks saving there"; }
	function errText(x) { return x && x.message ? x.message : String(x); }
	function namesIn(dir) { return (async function () { var used = {}; for await (var k of dir.keys()) used[String(k).toLowerCase()] = 1; return used; })(); }
	function writeFile(dir, name, blob) { return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }, function (e) { try { w.abort(); } catch (x) {} throw e; }); }).then(function () { return fh; }); }); }
	function regHandle(fh, dir) { var k = "h" + (++hseq); handles[k] = { fh: fh, dir: dir, name: fh.name, dirName: dir ? dir.name : "" }; return k; }
	/* a layer's provenance, with the live location of a picture that was moved since it was added */
	function srcOf(s) { var h = s && s.hk && handles[s.hk]; return h ? Object.assign({}, s, { dir: h.dirName, file: h.name }) : s; }
	function retarget(hk, dirName, fileName) { var d = PE.doc; if (!d) return; var fix = function (s) { return s && s.hk === hk ? Object.assign({}, s, { dir: dirName, file: fileName }) : s; }; d.layers.forEach(function (L) { L.src = fix(L.src); }); d.file = fix(d.file); }
	/* move = FileSystemHandle.move() when the browser has it for files on disk, else copy, check the size, then remove the original */
	function moveOne(fh, src, target, name, newName) {
		var copy = function () { return fh.getFile().then(function (f) { return writeFile(target, newName, f).then(function (nfh) { return nfh.getFile().then(function (c) { if (c.size !== f.size) throw new Error("the copy in “" + target.name + "” is incomplete, so the original was kept"); return src.removeEntry(name); }).then(function () { return nfh; }); }); }); };
		if (typeof fh.move !== "function") return copy();
		return fh.move(target, newName).then(function () { return fh; }, function () { return src.getFileHandle(name).then(copy, function () { return target.getFileHandle(newName); }); });
	}
	function thumbOf(L, n) { var c = PE.mk(n, n), x = c.getContext("2d"), w = L.canvas.width, h = L.canvas.height, s = Math.min(n / w, n / h); x.fillStyle = "#4a4a55"; x.fillRect(0, 0, n, n); x.fillStyle = "#6a6a76"; for (var i = 0; i < n; i += 6) for (var j = 0; j < n; j += 6) if (((i + j) / 6) % 2 === 0) x.fillRect(i, j, 6, 6); x.drawImage(L.canvas, (n - w * s) / 2, (n - h * s) / 2, w * s, h * s); c.className = "pe-fx-th"; return c; }
	function btn(t, title) { var b = el("button", "pe-btn pe-btn--sm", esc(t)); b.type = "button"; if (title) b.title = title; return b; }

	/* ---------- folder-access reminder: a chip in the status bar while this site can change files in a folder ----------
	 * The page reaches a folder only through its handle (kept in memory while connected, and in IndexedDB "dir" so Reconnect works next time).
	 * Disconnect drops both, so the editor can no longer reach the folder at all; the browser's own permission entry is removed in its site settings. */
	var folderListeners = []; PE.on("folder", function () { folderListeners = folderListeners.filter(function (f) { return f() !== false; }); });
	var remembered = null, chip = null;   // remembered = the stored handle when the browser still grants write access to it without asking
	var REVOKE = "In Brave or Chrome you can also remove it there: click the icon left of the address (lock or sliders) › Site settings › File editing (or the folder listed in that pop-up).";
	function accessName() { return dirHandle ? dirHandle.name : remembered ? remembered.name : ""; }
	function drawChip() {
		var st = document.querySelector("#pe .pe-status"); if (!st) return; var nm = accessName();
		if (!nm) { if (chip) chip.hidden = true; return; }
		if (!chip) {
			chip = el("span", "pe-fchip"); chip.setAttribute("role", "status"); st.insertBefore(chip, st.firstChild);
			chip.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button"); if (!b) return; if (b.dataset.a === "off") PE.disconnectFolder(); else PE.dlgFolder("folder"); });
		}
		chip.hidden = false; chip.title = "This site can open and change files in “" + nm + "” while folder access is on. " + REVOKE;
		chip.innerHTML = '<button type="button" class="pe-fchip-n" data-a="open">📁 Folder access: <b>' + esc(nm) + '</b></button><span aria-hidden="true">·</span><button type="button" class="pe-fchip-x" data-a="off">Disconnect</button>';
	}
	PE.folderAccess = function () { return accessName(); };
	PE.folderHandle = function () { return dirHandle || remembered || null; };   // the connected folder (for Save as / Open pickers to start in, and to show a project file's folder)
	PE.disconnectFolder = function () {
		var nm = accessName(); dirHandle = null; remembered = null; roFiles = null; for (var k in handles) delete handles[k];
		idb(function (st) { return rq(st.delete("dir")); }).catch(function () {}).then(function () { drawChip(); PE.emit("folder"); PE.toast(nm ? "Disconnected “" + nm + "”: the editor can no longer open or change files there" : "No folder is connected"); });
	};
	/* on load: a folder from an earlier visit that the browser still lets the page write to (Chrome's "Allow on every visit") gets the chip too */
	if (canFS()) setTimeout(function () {
		idb(function (st) { return rq(st.get("dir")); }).then(function (h) { if (!h || dirHandle) return; return perm(h, true, false).then(function (p) { if (p === "granted" && !dirHandle) { remembered = h; drawChip(); } }); }).catch(function () {});
	}, 400);

	/* focus: "folder" scrolls to the folder section, anything else opens at the top ("Where your images are") */
	PE.dlgFolder = function (focus) {
		var wrap = el("div", "pe-fx"), token = 0, entries = [], stored = null;
		function sec(title, help) { var s = el("section", "pe-fx-sec"), h = el("h3", "pe-fx-h", esc(title)); if (help) h.appendChild(PE.helpBtn(title, esc(help))); s.appendChild(h); wrap.appendChild(s); return s; }

		/* 1. where the images are */
		var sW = sec("Where your images are"), docP = el("p", "pe-fx-doc"), list = el("div", "pe-fx-list");
		sW.appendChild(el("p", "pe-hint2", "Browsers never show where a file is on your disk (its full path), only its name, and for a connected folder the folder's name. This is everything the editor knows about the open image:"));
		sW.appendChild(docP); sW.appendChild(list);
		function drawWhere() {
			var d = PE.doc; list.innerHTML = ""; if (!d) { docP.textContent = "No image is open."; return; }
			var f = d.file ? P.describeSource(srcOf(d.file)) : null;
			docP.innerHTML = "<b>This image</b>: " + esc(d.name) + " · " + d.w + " × " + d.h + " px · " + esc(f ? f.text : "Made in the editor (New image)");
			var rows = d.layers.slice().reverse().filter(function (L) { return !PE.isGroup(L); }), shown = rows.slice(0, 80); PE.relink();
			shown.forEach(function (L) {
				var s = srcOf(L.src), info = P.describeSource(s), r = el("div", "pe-fx-row"), m = el("div", "pe-fx-m"), grp = PE.ancestorsOf(L).map(function (g) { return g.name; }).reverse().join(" › ");
				r.appendChild(thumbOf(L, 34));
				m.innerHTML = '<b class="pe-fx-n">' + esc(L.name) + "</b>" + (grp ? '<span class="pe-fx-g">in ' + esc(grp) + "</span>" : "") + '<span class="pe-fx-from pe-fx-from--' + info.how + '">' + esc(info.text) + '</span><span class="pe-fx-px">' + L.canvas.width + " × " + L.canvas.height + " px" + (s && s.w && (s.w !== L.canvas.width || s.h !== L.canvas.height) ? " (the file: " + s.w + " × " + s.h + ")" : "") + (L.type === "text" ? " · text layer" : L.eq ? " · equation" : "") + "</span>";
				r.appendChild(m);
				var h = s && s.hk && handles[s.hk];
				if (h && canFS()) { var b = btn("Move to another folder…", "Move the file " + h.name + " out of “" + h.dirName + "” into a folder you choose (you confirm first)"); b.addEventListener("click", function () { moveFile(s.hk, b); }); r.appendChild(b); }
				list.appendChild(r);
			});
			if (!rows.length) list.appendChild(el("p", "pe-hint2", "No layers."));
			if (rows.length > shown.length) list.appendChild(el("p", "pe-hint2", "…and " + (rows.length - shown.length) + " more layers."));
		}

		/* 2. a folder on this computer */
		var sF = sec("Folder on this computer", "Connect a folder and the editor lists its pictures. Click one to add it as a layer (or to open it, if nothing is open); Shift-click opens it as a new image. Nothing is uploaded: the editor reads the files straight from your disk, and only with the permission you give in the browser's pop-up.");
		var stP = el("p", "pe-fx-st"), note = el("div", "pe-fx-note"), bar = el("div", "pe-fold-h"), saveRow = el("div", "pe-fx-save"), search = el("input", "pe-fold-s"), msg = el("p", "pe-hint2"), grid = el("div", "pe-fold-g");
		var acc = el("div", "pe-fx-acc"); acc.hidden = true; acc.setAttribute("role", "note");
		function drawAccess(name) {   // the calm reminder of what "connected" allows, and how to switch it off
			if (!name) { acc.hidden = true; return; } acc.hidden = false;
			acc.innerHTML = "<b>🔓 Folder access is on for “" + esc(name) + "”.</b> While it is, this site can read and change files in that folder (and its subfolders); the editor only writes when you press Save or Move. "
				+ "Turn it off with <i>Disconnect</i>, which forgets the folder here. " + esc(REVOKE) + " <span class=\"pe-fx-tip\">Tip: connect a dedicated folder (say, <i>Thumbnails</i>) rather than your whole OneDrive or Documents.</span> ";
			var off = btn("Disconnect", "Forget this folder: the editor can no longer open or change files in it"); off.addEventListener("click", function () { PE.disconnectFolder(); }); acc.appendChild(off);
		}
		var offL = function () { if (!wrap.isConnected) return false; stored = null; entries = []; grid.innerHTML = ""; msg.textContent = canFS() ? "Choose a folder to see its pictures." : ""; drawAccess(""); refreshState(); drawWhere(); };
		folderListeners.push(offL);
		search.type = "search"; search.placeholder = "Filter by name…"; search.setAttribute("aria-label", "Filter pictures by name");
		var bPick = btn("📂 Choose a folder…", "Pick a folder; the browser asks whether the editor may see and save files in it"), bAgain = btn("↺ Reconnect", "Use the folder from last time again (the browser asks for permission once more)"), bRo = btn("📂 Open a folder (read only)…", "List the pictures of a folder. This browser cannot save into it: saving goes to your Downloads folder"), roInp = el("input");
		roInp.type = "file"; roInp.multiple = true; roInp.setAttribute("webkitdirectory", ""); roInp.hidden = true; roInp.setAttribute("aria-hidden", "true"); bAgain.hidden = true;
		var nameIn = el("input"), kind = el("select"), bSave = btn("⬇ Save"), saveHint = el("p", "pe-hint2");
		nameIn.type = "text"; nameIn.value = PE.doc ? PE.doc.name : "image"; nameIn.setAttribute("aria-label", "File name"); nameIn.spellcheck = false; kind.setAttribute("aria-label", "Save as");
		kind.innerHTML = '<option value="png">PNG picture (flattened)</option><option value="proj">Project .mesproj (keeps layers; it is a ZIP)</option>';
		saveRow.appendChild(el("span", "pe-fx-l", "Save this image as")); saveRow.appendChild(nameIn); saveRow.appendChild(kind); saveRow.appendChild(bSave);
		if (canFS()) { bar.appendChild(bPick); bar.appendChild(bAgain); note.hidden = true; }
		else {
			note.innerHTML = (isBrave() ? "<b>Brave has folder access switched off.</b> To switch it on, copy <code>" + BRAVE_FLAG + "</code> into the address bar, set <i>File System Access API</i> to <i>Enabled</i> and press <i>Relaunch</i>. Then this window can open, save and move files in a folder."
				: isMobile() ? "<b>Phones and tablets cannot connect a folder</b> to a web page. On a computer, Chrome and Edge can (Brave after switching it on)."
				: "<b>This browser cannot connect a folder.</b> Chrome and Edge on a computer can, and Brave after switching on <code>" + BRAVE_FLAG + "</code>. Safari and Firefox cannot.")
				+ " You can still open a folder read only: its pictures are listed below and can be added as layers, but saving goes to your Downloads folder.";
			if (isBrave()) { var bCopy = btn("Copy the address", "Copies " + BRAVE_FLAG + " so you can paste it into Brave's address bar"); bCopy.addEventListener("click", function () { var fail = function () { window.prompt("Copy this address:", BRAVE_FLAG); }; try { navigator.clipboard.writeText(BRAVE_FLAG).then(function () { PE.toast("Copied. Paste it into the address bar"); }, fail); } catch (x) { fail(); } }); note.appendChild(document.createTextNode(" ")); note.appendChild(bCopy); }
			bar.appendChild(bRo); bar.appendChild(roInp);
		}
		[stP, acc, note, bar, saveRow, saveHint, search, msg, grid].forEach(function (x) { sF.appendChild(x); });

		function refreshState() {
			if (canFS()) {
				bPick.textContent = dirHandle ? "📂 Choose another folder…" : "📂 Choose a folder…"; bAgain.hidden = !(stored && !dirHandle); if (stored) bAgain.textContent = "↺ Reconnect to “" + stored.name + "”";
				bSave.textContent = dirHandle ? "⬇ Save into “" + dirHandle.name + "”" : "⬇ Save into a folder…"; saveHint.textContent = dirHandle ? "If a file with that name is already there, you are asked before it is replaced." : "You pick the folder first.";
				if (dirHandle) { var h = dirHandle; perm(h, true, false).then(function (p) { if (h === dirHandle) { stP.innerHTML = "Connected: <b>“" + esc(h.name) + "”</b> · " + esc(permText(p)) + "."; drawAccess(p === "granted" ? h.name : ""); } }).catch(function () {}); }
				else { stP.textContent = remembered ? "“" + remembered.name + "” from last time is not listed yet (press Reconnect), but the browser still lets this site use it." : "No folder is connected." + (stored ? " Last time it was “" + stored.name + "”." : ""); drawAccess(remembered ? remembered.name : ""); }
			} else {
				stP.textContent = roFiles ? "Open read only: “" + roName + "”, " + roFiles.length + " picture" + (roFiles.length === 1 ? "" : "s") + " (subfolders included)." : ""; stP.hidden = !roFiles;
				bSave.textContent = "⬇ Download"; saveHint.textContent = "This browser cannot write into a folder, so the file goes to your Downloads folder.";
			}
		}
		function count(name, n) { msg.textContent = n + " picture" + (n === 1 ? "" : "s") + " in “" + name + "”" + (n > 400 ? " (showing the first 400: use the filter)" : "") + (n ? ". Click: add as a layer · Shift-click: open as a new image." : "."); }
		function roEntries() { return roFiles.map(function (f) { var rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name; return { name: f.name, label: rel, file: function () { return Promise.resolve(f); } }; }); }
		function load(h) {
			dirHandle = h; remembered = null; drawChip(); roFiles = null; var my = ++token; entries = []; grid.innerHTML = ""; msg.textContent = "Reading “" + h.name + "”…"; refreshState();
			(async function () { var out = []; try { var nd = 0; for await (var e of h.values()) { if (e.kind === "file" && IMG.test(e.name)) out.push(e); else if (e.kind === "directory" && nd++ < 300 && !/^(\.|__MACOSX)/.test(e.name)) { try { await e.getFileHandle("project.json"); out.push(e); } catch (x2) { } } } } catch (x) { if (my === token) msg.textContent = "Could not read the folder: " + errText(x); return; }
				if (my !== token) return; out.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); }); entries = out.map(function (fh) { return fh.kind === "directory" ? { name: fh.name, label: fh.name + " (project folder)", dirProj: fh, file: function () { return Promise.reject(new Error("a folder")); } } : { name: fh.name, label: fh.name, fh: fh, file: function () { return fh.getFile(); } }; }); count(h.name, entries.length); render(); })();
		}
		function render() {
			var q = search.value.trim().toLowerCase(), shown = entries.filter(function (e) { return !q || e.label.toLowerCase().indexOf(q) >= 0; }).slice(0, 400); grid.innerHTML = "";
			var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { io.unobserve(x.target); x.target._load(); } }); }, { root: grid, rootMargin: "200px" }) : null;
			shown.forEach(function (e) {
				var t = el("button", "pe-fold-t"), c = el("canvas"), n = el("span", "pe-fold-n", esc(e.label)); t.type = "button"; c.width = 120; c.height = 90; t.appendChild(c); t.appendChild(n); t.title = e.label + " · click: add as a layer · Shift-click: open as a new image";
				t._load = function () { if (e.dirProj) { var xd = c.getContext("2d"); xd.fillStyle = "#2b2540"; xd.fillRect(0, 0, 120, 90); xd.font = "34px sans-serif"; xd.textAlign = "center"; xd.fillText("📁", 60, 48); xd.fillStyle = "#c4b5fd"; xd.font = "bold 12px sans-serif"; xd.fillText("PROJECT", 60, 74); return; }
					if (/\.(psd|xcf|mesproj|zip)$/i.test(e.name)) { var x = c.getContext("2d"); x.fillStyle = "#26262e"; x.fillRect(0, 0, 120, 90); x.fillStyle = "#9b9bab"; x.font = "bold 14px sans-serif"; x.textAlign = "center"; x.fillText(e.name.split(".").pop().toUpperCase(), 60, 50); return; }
					e.file().then(function (f) { return createImageBitmap(f, { resizeWidth: 120, resizeQuality: "medium" }).catch(function () { return PE.decodeFile(f); }); }).then(function (im) { var x = c.getContext("2d"), w = im.width || im.naturalWidth, h = im.height || im.naturalHeight, s = Math.min(120 / w, 90 / h); x.drawImage(im, (120 - w * s) / 2, (90 - h * s) / 2, w * s, h * s); }).catch(function () { n.textContent = "⚠ " + e.label; }); };
				if (io) io.observe(t); else t._load();
				if (e.dirProj) t.title = e.name + " · an unzipped project (project.json + layer PNGs): click to open it; Save then writes back into this folder";
				t.addEventListener("click", function (ev) { if (e.dirProj) { m.close(); PE.openFolderHandle(e.dirProj, "folder").catch(function (x) { PE.toast("Could not open " + e.name + ": " + errText(x)); }); return; } var o = { place: !!PE.doc && !ev.shiftKey }; if (e.fh) { o.how = "folder"; o.dir = dirHandle ? dirHandle.name : ""; o.hk = regHandle(e.fh, dirHandle); o.fh = e.fh; } else { o.how = "folder-ro"; o.dir = roName; }
					e.file().then(function (f) { PE.openFiles([f], o); m.close(); }).catch(function (x) { PE.toast("Could not open " + e.name + ": " + errText(x)); }); });
				grid.appendChild(t);
			});
		}
		search.addEventListener("input", render);
		bPick.addEventListener("click", function () { window.showDirectoryPicker({ id: "mes-photo-folder", mode: "readwrite" }).then(function (h) { stored = h; idb(function (st) { return rq(st.put(h, "dir")); }).catch(function () {}); load(h); }).catch(function (x) { if (!x || x.name !== "AbortError") msg.textContent = "Could not open the folder: " + errText(x); }); });
		bAgain.addEventListener("click", function () { var h = stored; if (!h) return; perm(h, true, true).then(function (p) { if (p === "granted") load(h); else msg.textContent = "The browser did not give access to “" + h.name + "”. Press Reconnect again, or choose the folder."; }).catch(function (x) { msg.textContent = "Could not reconnect: " + errText(x); }); });
		bRo.addEventListener("click", function () { roInp.click(); });
		roInp.addEventListener("change", function () {
			var fs = Array.prototype.slice.call(roInp.files || []); roInp.value = ""; if (!fs.length) return; roName = (fs[0].webkitRelativePath || "").split("/")[0] || "folder"; dirHandle = null; ++token;
			roFiles = fs.filter(function (f) { return IMG.test(f.name); }).sort(function (a, b) { return (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }); });
			entries = roEntries(); count(roName, entries.length); render(); refreshState();
		});
		function saveTo(dh, k, name) {
			return perm(dh, true, true).then(function (p) { if (p !== "granted") throw new Error("the browser did not allow saving into “" + dh.name + "”"); return namesIn(dh); })
				.then(function (used) { if (used[name.toLowerCase()] && !window.confirm("“" + name + "” is already in “" + dh.name + "”. Replace it?")) throw "cancel"; return k === "proj" ? PE.projectBlob() : PE.exportBlob("png", 1, {}); })
				.then(function (b) { return writeFile(dh, name, b); })
				.then(function (fh) { if (k === "proj" && PE.linkProject) return fh.getFile().then(function (f) { PE.doc.name = P.projectBase(name); PE.linkProject(fh, { dir: dh.name, lm: f.lastModified, savedAt: Date.now() }); return fh; }); return fh; });
		}
		bSave.addEventListener("click", function () {
			if (!PE.doc) { PE.toast("Open or create an image first"); return; }
			var k = kind.value, base = I.cleanFileName((nameIn.value || "").trim().replace(/\.(png|mesproj)$/i, "") || PE.doc.name || "image"), name = base + (k === "proj" ? ".mesproj" : ".png");
			var ok = function (where) { if (k === "proj") { PE.dirty = false; if (PE.saveState) PE.saveState(); } PE.toast("Saved " + name + " " + where); };
			if (!canFS()) { (k === "proj" ? PE.projectBlob() : PE.exportBlob("png", 1, {})).then(function (b) { PE.download(b, name); ok("to your Downloads"); }).catch(function (x) { PE.toast("Could not save: " + errText(x)); }); return; }
			bSave.disabled = true;
			(dirHandle ? Promise.resolve(dirHandle) : window.showDirectoryPicker({ id: "mes-photo-folder", mode: "readwrite" }).then(function (h) { stored = h; idb(function (st) { return rq(st.put(h, "dir")); }).catch(function () {}); load(h); return h; }))
				.then(function (dh) { return saveTo(dh, k, name).then(function () { ok("into “" + dh.name + "”"); if (dh === dirHandle) load(dh); }); })
				.catch(function (x) { if (x === "cancel") { PE.toast("Not saved. Change the name to keep both files."); return; } if (x && x.name === "AbortError") return; PE.toast("Could not save: " + errText(x)); })
				.then(function () { bSave.disabled = false; });
		});
		nameIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); bSave.click(); } });
		function moveFile(hk, b) {
			var H = handles[hk]; if (!H) return; var src = H.dir, target, newName; b.disabled = true;
			perm(src, true, true).then(function (p) { if (p !== "granted") throw new Error("the browser did not allow changes in “" + src.name + "”"); return window.showDirectoryPicker({ id: "mes-photo-move", mode: "readwrite", startIn: src }); })
				.then(function (t) { target = t; return src.isSameEntry ? src.isSameEntry(t) : false; })
				.then(function (same) { if (same) throw new Error("that is the folder it is in already"); return namesIn(target); })
				.then(function (used) { newName = I.uniqueName(H.name, used);
					var q = "Move “" + H.name + "” from “" + src.name + "” to “" + target.name + "”?" + (newName !== H.name ? "\n\n“" + target.name + "” already has a file called “" + H.name + "”, so the moved one will be called “" + newName + "”." : "") + "\n\nThe original is removed from “" + src.name + "” only after the copy in “" + target.name + "” is complete.";
					if (!window.confirm(q)) throw "cancel"; return moveOne(H.fh, src, target, H.name, newName); })
				.then(function (nfh) { handles[hk] = { fh: nfh, dir: target, name: newName, dirName: target.name }; retarget(hk, target.name, newName); PE.toast("Moved " + newName + " to “" + target.name + "”"); if (dirHandle && src === dirHandle) load(dirHandle); drawWhere(); })
				.catch(function (x) { if (x === "cancel" || (x && x.name === "AbortError")) return; PE.toast(x && x.name === "SecurityError" ? "Press Move again: the browser needs a fresh click to open the folder chooser" : "Could not move: " + errText(x)); })
				.then(function () { b.disabled = false; });
		}

		/* 3. the autosaves in this browser (one per recent project) */
		var sA = sec("Autosave in this browser"), aP = el("p", "pe-fx-auto"), uP = el("p", "pe-hint2"), ab = el("div", "pe-fold-h"), bClear = btn("🗑 Clear all autosaves", "Delete the autosaved copies of your projects from this browser (you are asked first; project files on your disk are not touched)"), bRec = btn("Recent projects…", "Open one of the projects autosaved here or saved to a file");
		sA.appendChild(el("p", "pe-hint2", "While you work, the editor keeps a copy of each project in this browser's own storage (the IndexedDB database “mes-photo-editor” of mes.fm), 5 seconds after each change, so a reload or a crash does not lose your work. The last " + 8 + " projects are kept (500 MB at most) and listed under File → Open recent. They stay on this computer, in this browser only, and are not files you can find in a folder."));
		ab.appendChild(bRec); ab.appendChild(bClear); sA.appendChild(aP); sA.appendChild(ab); sA.appendChild(uP);
		var lk = PE.projectLink && PE.projectLink();
		sA.appendChild(el("p", "pe-hint2", lk ? "💾 This project is saved in the file <b>" + esc(PE.projectWhere()) + "</b>: " + esc(PE.modKey()) + "S writes it there" + (PE.autoFileOn() ? " (and Auto-save does, 20 s after you stop)" : "") + "." : "💾 Save project makes a real file (a .mesproj, which is an ordinary ZIP): in a folder you choose where the browser allows it, else in your Downloads folder. Export makes a flat picture."));
		function drawAuto() {
			(PE.recentReady ? PE.recentReady() : Promise.resolve([])).then(function () { var l = PE.recentList ? PE.recentList() : [], a = l.filter(function (e) { return e.bytes > 0; }), tot = 0; a.forEach(function (e) { tot += e.bytes; });
				bClear.disabled = !a.length; bRec.disabled = !l.length; aP.innerHTML = a.length ? "<b>" + a.length + "</b> project" + (a.length === 1 ? "" : "s") + " autosaved here (" + esc(P.bytesText(tot)) + "), the newest <b>" + esc(a[0].name || "Untitled") + "</b>, " + esc(new Date(a[0].at || a[0].t).toLocaleString()) + "." : "Nothing is autosaved at the moment."; })
				.catch(function () { bClear.disabled = true; aP.textContent = "This browser's storage cannot be read here (a private window, or site data is blocked), so nothing is autosaved."; });
			if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { uP.textContent = "All of mes.fm (every tool) uses about " + P.bytesText(e.usage || 0) + " of this browser's storage."; }).catch(function () {});
		}
		bRec.addEventListener("click", function () { m.close(); PE.dlgRecent(); });
		bClear.addEventListener("click", function () { if (!window.confirm("Delete the autosaved copies of all your projects from this browser?\n\nThe image that is open now stays open, and it is autosaved again 5 seconds after your next change. Project files on your disk are not touched.")) return; PE.clearAutosaves().then(function () { PE.toast("Autosaves cleared"); drawAuto(); }).catch(function (x) { PE.toast("Could not clear the autosaves: " + errText(x)); }); });

		/* 4. keep working on another computer */
		var sM = sec("Keep working on another computer", "Three ways to carry a project between computers and browsers. Nothing is stored on mes.fm's servers.");
		if (PE.moveHelpEl) sM.appendChild(PE.moveHelpEl());

		var m = PE.modal({ title: "Files and folders", wide: true, cls: "pe-dlg--files", body: wrap, noFocus: true, buttons: [{ label: "Close", act: function (mm) { mm.close(); } }] });
		drawWhere(); drawAuto(); refreshState();
		if (canFS() && dirHandle) load(dirHandle);
		else if (canFS()) { msg.textContent = "Choose a folder to see its pictures."; idb(function (st) { return rq(st.get("dir")); }).then(function (h) { stored = h || null; refreshState(); }).catch(function () {}); }
		else if (roFiles) { entries = roEntries(); count(roName, entries.length); render(); }
		if (focus === "folder" || focus === "move") setTimeout(function () { var t = focus === "move" ? sM : sF; m.body.scrollTop += t.getBoundingClientRect().top - m.body.getBoundingClientRect().top - 4; }, 0);
		return m;
	};
})();
