/* MES Photo Editor: project files across computers (round 5).
 * - the open project can be LINKED to a file on disk (a FileSystemFileHandle from File -> Open, a drop, the connected folder, Save as, or a recent project):
 *   Save (Ctrl/Cmd+S) then overwrites that file in place, Save as (Ctrl/Cmd+Alt+Shift+S) picks a new one; without the File System Access API Save downloads.
 * - optional auto-save to the linked file 20 s after changes stop (never during a stroke / text edit / dialog); before every write the file's lastModified is
 *   compared with what we last read or wrote, and a change made elsewhere (another computer, synced by OneDrive) asks Keep mine / Open theirs.
 * - recent projects: autosaves per project id ("auto:<pid>" in IndexedDB "mes-photo-editor" / "kv") + the list "recent" (name, size, thumbnail, time,
 *   remembered file handle); pruned to 8 entries / 500 MB by MESPixel.pruneRecent. The old single "auto" entry is migrated once.
 * - Download project as .zip (same bytes), Export every layer as PNG (ZIP + layers.json). */
(function () {
	"use strict";
	var PE = window.PE, P = window.MESPixel, I = window.MESImg; if (!PE || !P) return;
	var el = function (t, c, h) { return PE.el(t, c, h); }, esc = function (s) { return PE.esc(s); };
	var KEY = "mes-photo-editor:v1", AUTO_FILE_MS = 20000, MAX_RECENT = 8, BUDGET = 500e6, BRAVE_FLAG = "brave://flags/#file-system-access-api";
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	function idb(fn) { return new Promise(function (res, rej) { var r = indexedDB.open("mes-photo-editor", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { var db = r.result; Promise.resolve(fn(db.transaction("kv", "readwrite").objectStore("kv"))).then(res, rej); }; r.onerror = function () { rej(r.error); }; }); }
	function rq(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
	function errText(x) { return x && x.message ? x.message : String(x); }
	function needDoc() { if (!PE.doc) { PE.toast("Open or create an image first"); return false; } return true; }
	function canSavePicker() { return typeof window.showSaveFilePicker === "function"; }
	PE.canOpenPicker = function () { return typeof window.showOpenFilePicker === "function"; };
	function isBrave() { return !!(navigator.brave && typeof navigator.brave.isBrave === "function"); }
	var edits = 0; PE.on("history", function () { edits++; });

	/* ---------- the link between the open project and a file on disk ---------- */
	var link = null;   // {doc, handle, name, dir, lm (file's lastModified as we last read / wrote it), savedAt, conflict, needPerm}
	function cur() { if (link && link.doc !== PE.doc) link = null; return link; }
	PE.projectLink = cur;
	function whereText(L) { return L ? (L.dir ? L.dir + "/" : "") + L.name : ""; }
	PE.projectWhere = function () { return whereText(cur()); };
	/* the folder path of a file inside the connected folder ("Thumbnail Meta" when that folder is connected), else "" */
	function dirOf(h) { var dh = PE.folderHandle && PE.folderHandle(); if (!dh || !dh.resolve) return Promise.resolve(""); return dh.resolve(h._folder || h).then(function (p) { return p ? [dh.name].concat(p.slice(0, -1)).join("/") : ""; }).catch(function () { return ""; }); }
	/* call right after a project (or anything) became PE.doc: info = {dir, lm, savedAt, dirty} */
	PE.linkProject = function (h, info) {
		info = info || {}; if (!PE.doc || !h) return; var my = { doc: PE.doc, handle: h, name: h.name, dir: info.dir || "", lm: info.lm || 0, savedAt: info.savedAt || 0 }; link = my;
		if (!info.dir) dirOf(h).then(function (d) { if (d && link === my) { my.dir = d; drawBar(); } });
		if (!my.lm && h.getFile) h.getFile().then(function (f) { if (link === my && !my.lm) my.lm = f.lastModified; }).catch(function () {});
		remember({ fh: h, file: { name: h.name, dir: info.dir || "" } }); drawBar();
	};
	PE.unlinkProject = function () { link = null; drawBar(); };
	function ensurePerm(h, ask) { var o = { mode: "readwrite" }; if (!h.queryPermission) return Promise.resolve(true); return h.queryPermission(o).then(function (p) { return p === "granted" ? true : ask ? h.requestPermission(o).then(function (q) { return q === "granted"; }) : false; }); }
	function writeHandle(h, blob) { return h.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }, function (e) { try { w.abort(); } catch (x) {} throw e; }); }); }

	/* ---------- Save / Save as / download ---------- */
	var saving = null;
	function markSaved(L, e0) { if (edits === e0) { PE.dirty = false; } if (PE.saveState) PE.saveState(); drawBar(); remember({}); }
	/* write the open project into its linked file. interactive = the person pressed Save (may ask for permission and show the conflict question) */
	function saveToLink(interactive) {
		var L = cur(); if (!L) return Promise.resolve(false); if (saving) return saving.then(function () { return interactive ? saveToLink(true) : false; });
		var h = L.handle, e0 = edits;
		saving = ensurePerm(h, interactive).then(function (ok) {
			if (!ok) { L.needPerm = true; drawBar(); if (interactive) PE.toast("The browser did not allow saving to “" + L.name + "”. Use Save project as… to pick a place"); return false; }
			L.needPerm = false; return h.getFile().then(function (f) {
				if (P.diskChanged(L.lm, f.lastModified)) { if (!interactive && L.conflict) return "skip"; L.conflict = true; drawBar(); return askConflict(L, f); }
				return "mine";
			}).then(function (choice) {
				if (choice === "theirs") { L.conflict = false; return openHandle(h, { dir: L.dir }).then(function () { return false; }); }
				if (choice !== "mine") return false;
				L.conflict = false;
				return PE.projectBlob().then(function (b) { return writeHandle(h, b).then(function () { return h.getFile(); }); }).then(function (f2) {
					L.lm = f2.lastModified; L.savedAt = Date.now(); markSaved(L, e0);
					PE.toast((interactive ? "Saved to " : "Auto-saved to ") + whereText(L)); return true;
				});
			});
		}).catch(function (x) { if (x && x.name === "NotAllowedError" && !interactive) { L.needPerm = true; drawBar(); return false; } PE.toast("Could not save to “" + L.name + "”: " + errText(x)); return false; })
			.then(function (r) { saving = null; drawBar(); return r; });
		return saving;
	}
	function askConflict(L, f) {
		return new Promise(function (res) {
			var w = el("div", "pe-fx"); w.innerHTML = "<p><b>“" + esc(L.name) + "” was changed on disk</b> (" + esc(new Date(f.lastModified).toLocaleString()) + ") since it was opened or saved here, maybe on another computer that OneDrive or another sync service brought over.</p>"
				+ "<p class=\"pe-hint2\"><b>Keep mine</b> writes what is open here over that file. <b>Open theirs</b> opens the file as it is on disk now (what is open here is kept in Recent projects as an autosave).</p>";
			var done = false, fin = function (m, v) { if (done) return; done = true; m.close(); res(v); };
			PE.modal({ title: "The project file changed", body: w, sticky: true, onClose: function () { if (!done) { done = true; res("cancel"); } }, buttons: [{ label: "Cancel", act: function (m) { fin(m, "cancel"); } }, { label: "Open theirs", act: function (m) { keepMineAsCopy().then(function () { fin(m, "theirs"); }); } }, { label: "Keep mine", primary: true, act: function (m) { fin(m, "mine"); } }] });
		});
	}
	/* before "Open theirs" replaces it, what is open here goes into Recent projects as its own autosave ("… (my version)"), not linked to the file */
	function keepMineAsCopy() { var d = PE.doc; if (!d) return Promise.resolve(); d.pid = P.newProjectId(); d.name = (d.name || "Untitled") + " (my version)"; return autosaveNow({ fh: null, file: null }, true); }
	PE.saveProject = function () { if (!needDoc()) return; var L = cur(); if (L) return saveToLink(true); return PE.saveProjectAs(); };
	PE.saveProjectAs = function (kind) {
		if (!needDoc()) return; var L = cur(), base = PE.doc.name || "Untitled";
		if (!canSavePicker()) {
			if (!sget().dlNoAsk && !PE._dlExplained) return explainDownload().then(function (go) { if (go) { PE._dlExplained = true; return PE.saveProjectAs(kind); } });
			return PE.projectBlob().then(function (b) { var n = P.projectFileName(base, kind || "mesproj"); PE.download(b, n); PE.dirty = false; if (PE.saveState) PE.saveState(); drawBar();
				PE.toast("Saved " + n + " to your Downloads" + (isBrave() ? " (to save straight into a folder, switch on " + BRAVE_FLAG + ")" : "")); }).catch(function (e) { PE.toast("Could not save the project: " + errText(e)); });
		}
		var dh = PE.folderHandle && PE.folderHandle(), opts = { suggestedName: P.projectFileName(base, kind || (L && P.projectKind(L.name)) || "mesproj"), id: "mes-photo-proj", types: [{ description: "MES Photo Editor project", accept: { "application/zip": [".mesproj", ".zip"] } }] };
		if (L && L.handle) opts.startIn = L.handle._folder || L.handle; else if (dh) opts.startIn = dh;
		var e0 = edits, pick = function (o) { return window.showSaveFilePicker(o).catch(function (x) { if (x && x.name === "TypeError" && o.startIn) { var o2 = Object.assign({}, o); delete o2.startIn; return window.showSaveFilePicker(o2); } throw x; }); };
		return pick(opts).then(function (h) {
			if (L && L.handle && h !== L.handle) PE.doc.pid = P.newProjectId();   // a copy under a new name is its own project in Recent projects
			PE.doc.name = P.projectBase(h.name);
			return PE.projectBlob().then(function (b) { return writeHandle(h, b); }).then(function () { return h.getFile(); }).then(function (f) {
				PE.linkProject(h, { lm: f.lastModified, savedAt: Date.now() }); markSaved(cur(), e0); PE.emit("docsize"); PE.toast("Saved " + h.name + ": " + PE.modKey() + "S now saves to this file");
			});
		}).catch(function (x) { if (x && x.name === "AbortError") return; PE.toast("Could not save the project: " + errText(x)); });
	};
	/* Brave (by default), Safari and Firefox have no way for a page to write to a file it opened: every Save is a NEW download. When the browser is set to
	   "ask where to save each file", that looks like a Save As dialog on every Save. Say so once, and how to get silent saving. */
	function explainDownload() {
		return new Promise(function (res) {
			var br = isBrave(), w = el("div", "pe-fx"), done = false;
			w.innerHTML = "<p><b>This browser can't save over the project file.</b> Each Save makes a new download of <i>" + esc(P.projectFileName(PE.doc.name || "Untitled", "mesproj")) + "</i>. If your browser asks where to save every download, you will see a Save dialog each time: that is the browser, not a new project.</p>"
				+ (br ? "<p><b>In Brave you can switch it on:</b> open <code>" + BRAVE_FLAG + "</code> (copy it into the address bar), set it to <b>Enabled</b> and relaunch Brave. Then the first Save asks once where to put the file, and every later Save (" + PE.modKey() + "S) writes that same file silently, also in a OneDrive folder.</p>"
					: "<p>Chrome and Edge on a computer can write to the same file with no questions. Safari and Firefox can't.</p>")
				+ "<p class=\"pe-hint2\">To stop the Save dialog for downloads: browser Settings → Downloads → turn off “Ask where to save each file”. The project then goes straight to your Downloads folder.</p>"
				+ '<label class="pe-chk"><input type="checkbox" id="pe-dlnoask"> Always download without showing this again</label>';
			var fin = function (m, v) { if (done) return; done = true; if (w.querySelector("#pe-dlnoask").checked) sset({ dlNoAsk: true }); m.close(); res(v); };
			var btns = [{ label: "Cancel", act: function (m) { fin(m, false); } }];
			if (br) btns.push({ label: "Copy the Brave setting link", act: function () { try { navigator.clipboard.writeText(BRAVE_FLAG); PE.toast("Copied: paste it into the address bar"); } catch (x) {} } });
			btns.push({ label: "⬇ Download the project", primary: true, act: function (m) { fin(m, true); } });
			PE.modal({ title: "Saving in this browser", body: w, onClose: function () { if (!done) { done = true; res(false); } }, buttons: btns });
		});
	}
	PE.downloadProjectZip = function () {
		if (!needDoc()) return; PE.projectBlob().then(function (b) { var n = P.projectFileName(PE.doc.name, "zip"); PE.download(b, n); PE.toast("Downloaded " + n + ": a normal ZIP (project.json + one PNG per layer). Drop it on the editor to keep working"); }).catch(function (e) { PE.toast("Could not make the ZIP: " + errText(e)); });
	};
	PE.modKey = function () { return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"; };

	/* ---------- opening a project from a file handle ---------- */
	function openHandle(h, info) {
		info = info || {};
		return h.getFile().then(function (f) { return f.arrayBuffer().then(function (b) {
			return PE.loadProject(b, f.name, { file: f.name, bytes: f.size, dir: info.dir || "" }).then(function () { PE.linkProject(h, { dir: info.dir, lm: f.lastModified, savedAt: 0 }); if (PE.setTool) PE.setTool("move"); PE.toast("Opened " + f.name + (PE.canOpenPicker() ? " · " + PE.modKey() + "S saves back to it" : "")); });
		}); });
	}
	PE.openProjectHandle = openHandle;
	/* File -> Open project…: a picker that hands back a file handle, so Save can write to the same file later */
	PE.openProjectPicker = function () {
		if (!PE.canOpenPicker()) { PE.pickOpen(); return; }
		var dh = PE.folderHandle && PE.folderHandle(), o = { id: "mes-photo-proj", multiple: false, types: [{ description: "MES Photo Editor project", accept: { "application/zip": [".mesproj", ".zip"] } }] }; if (dh) o.startIn = dh;
		window.showOpenFilePicker(o).then(function (hs) { var h = hs[0]; if (!h) return; if (PE.confirmReplace && !PE.confirmReplace()) return; return openHandle(h, {}); }).catch(function (x) { if (x && x.name === "AbortError") return; PE.toast("Could not open the project: " + errText(x)); });
	};

	/* ---------- auto-save to the project file ---------- */
	var afTimer = 0;
	PE.autoFileOn = function () { return !!sget().autoFile; };
	PE.setAutoFile = function (on) { sset({ autoFile: !!on }); drawBar(); if (on) { var L = cur(); PE.toast(L ? "Auto-save on: changes are written to " + whereText(L) + " " + AUTO_FILE_MS / 1000 + " s after you stop" : "Auto-save on: it starts once the project is saved to a file (Save project as…)"); scheduleFile(); } else PE.toast("Auto-save to the project file is off"); if (PE.rebuildMenus) PE.rebuildMenus(); };
	function scheduleFile(ms) {
		clearTimeout(afTimer); var L = cur(); if (!L || !PE.autoFileOn()) return;
		afTimer = setTimeout(function () {
			var L2 = cur(); if (!L2 || !PE.autoFileOn() || !PE.dirty) return;
			if ((PE.pointerBusy && PE.pointerBusy()) || (PE.textEditing && PE.textEditing()) || (PE.modalOpen && PE.modalOpen()) || saving) { scheduleFile(3000); return; }   // never in the middle of a stroke, a text edit or a dialog
			if (L2.conflict) return;   // waiting for the person to answer Keep mine / Open theirs (or press Save)
			saveToLink(false);
		}, ms || AUTO_FILE_MS);
	}
	PE.on("history", function () { scheduleFile(); setTimeout(drawBar, 0); });

	/* ---------- recent projects (IndexedDB) ---------- */
	var recent = [], chain = Promise.resolve(), ready = null;
	function getList() { return idb(function (st) { return rq(st.get("recent")); }).then(function (l) { return Array.isArray(l) ? l : []; }); }
	function putList(list) { return idb(function (st) { return rq(st.put(list, "recent")); }); }
	/* run list changes one after another (an autosave and a save may finish together) */
	function update(fn) { chain = chain.then(function () { return getList().then(function (list) { return fn(list); }).then(function (list) { if (!list) return; var pr = P.pruneRecent(list, MAX_RECENT, BUDGET), gone = pr.drop.concat(pr.dropAuto); recent = pr.keep; return putList(pr.keep).then(function () { return gone.length ? idb(function (st) { return Promise.all(gone.map(function (id) { return rq(st.delete("auto:" + id)); })); }) : null; }); }); }).catch(function () {}).then(function () { PE.emit("recent"); }); return chain; }
	function thumbOf() { var d = PE.doc, s = Math.min(1, 160 / Math.max(d.w, d.h)); try { return PE.flatten({ scale: s, fill: "#2b2b33" }).toDataURL("image/jpeg", 0.72); } catch (e) { return ""; } }
	/* note the open project in the list (fields = extra fields: fh / file / bytes) */
	function remember(fields) {
		var d = PE.doc; if (!d || !d.pid) return chain; var L = cur(), e = Object.assign({ id: d.pid, name: d.name || "Untitled", w: d.w, h: d.h, t: Date.now(), thumb: thumbOf() }, fields || {});
		if (L && !("fh" in (fields || {}))) { e.fh = L.handle; e.file = { name: L.name, dir: L.dir }; }
		if (e.fh && e.fh._folder) { e.fh = e.fh._folder; e.file = Object.assign({}, e.file || { name: e.fh.name }, { folder: true }); }   // a project folder: IndexedDB keeps the real folder handle
		return update(function (list) { return P.upsertRecent(list, e); });
	}
	PE.rememberProject = remember;
	var asTimer = 0;
	function autosaveNow(extra, always) {
		var d = PE.doc; if (!d || (PE.hist.stack.length < 2 && !always)) return Promise.resolve();
		return PE.projectBlob().then(function (b) { return idb(function (st) { return rq(st.put({ blob: b, t: Date.now(), name: d.name, w: d.w, h: d.h, pid: d.pid }, "auto:" + d.pid)); }).then(function () { return remember(Object.assign({ bytes: b.size, at: Date.now() }, extra || {})); }); }).catch(function () {});
	}
	PE.autosaveNow = autosaveNow;
	PE.scheduleAutosave = function () { clearTimeout(asTimer); asTimer = setTimeout(function () { autosaveNow(); }, 5000); };
	/* the single "auto" autosave of rounds 1-4 becomes the first recent project */
	function migrate() {
		return idb(function (st) { return rq(st.get("auto")); }).then(function (r) {
			if (!r || !r.blob) return; var pid = P.newProjectId();
			return idb(function (st) { return rq(st.put({ blob: r.blob, t: r.t, name: r.name, w: r.w, h: r.h, pid: pid, migrated: true }, "auto:" + pid)); })
				.then(function () { return update(function (list) { return P.upsertRecent(list, { id: pid, name: r.name || "Untitled", w: r.w, h: r.h, t: r.t || Date.now(), bytes: r.blob.size, at: r.t, thumb: "" }); }); })
				.then(function () { return idb(function (st) { return rq(st.delete("auto")); }); });
		}).catch(function () {});
	}
	PE.recentReady = function () { if (!ready) { try { ready = migrate().then(getList).then(function (l) { recent = l; PE.emit("recent"); return l; }).catch(function () { return []; }); } catch (e) { ready = Promise.resolve([]); } } return ready; };
	PE.recentList = function () { return recent.slice(); };
	PE.forgetRecent = function (id) { return idb(function (st) { return rq(st.delete("auto:" + id)); }).catch(function () {}).then(function () { return update(function (list) { return list.filter(function (e) { return e.id !== id; }); }); }); };
	/* delete every autosave (remembered project files stay in the list) */
	PE.clearAutosaves = function () {
		return idb(function (st) { return rq(st.getAllKeys()).then(function (ks) { return Promise.all(ks.filter(function (k) { return k === "auto" || /^auto:/.test(String(k)); }).map(function (k) { return rq(st.delete(k)); })); }); })
			.then(function () { return update(function (list) { return list.filter(function (e) { return e.fh; }).map(function (e) { return Object.assign({}, e, { bytes: 0, at: 0 }); }); }); });
	};
	/* reopen a recent project. The click is the user gesture the browser needs to give the file back (one permission prompt). */
	PE.openRecent = function (e) {
		if (!e) return; if (PE.confirmReplace && !PE.confirmReplace()) return;
		if (e.fh && e.file && e.file.folder && !e.fh._folder) e = Object.assign({}, e, { fh: PE.folderProjectHandle(e.fh) });
		var permP = e.fh ? ensurePerm(e.fh, true).catch(function () { return false; }) : Promise.resolve(false);   // called right away, inside the click
		var autoP = e.bytes > 0 ? idb(function (st) { return rq(st.get("auto:" + e.id)); }).catch(function () { return null; }) : Promise.resolve(null);
		return Promise.all([permP, autoP]).then(function (r) {
			var ok = r[0], a = r[1];
			var fileP = ok ? e.fh.getFile().catch(function () { return null; }) : Promise.resolve(null);
			return fileP.then(function (f) {
				var dir = e.file && e.file.dir || "";
				if (f && (!a || f.lastModified > a.t + 2000)) return openHandle(e.fh, { dir: dir });   // the file is newer (saved here, or changed on another computer): open it
				if (!a) { PE.toast(e.fh ? "The browser did not give the file “" + (e.file && e.file.name || e.name) + "” back. Try again, or open it with File → Open" : "That autosave is gone"); return; }
				return a.blob.arrayBuffer().then(function (b) { return PE.loadProject(b, "autosave", null, { pid: e.id }); }).then(function () {
					if (f) { PE.linkProject(e.fh, { dir: dir, lm: f.lastModified }); PE.dirty = a.t > f.lastModified + 2000; if (PE.saveState) PE.saveState(); drawBar(); }
					if (PE.setTool) PE.setTool("move"); PE.toast("Opened “" + (a.name || e.name) + "” from this browser's autosave (" + new Date(a.t).toLocaleString() + ")" + (f ? " · linked to " + f.name : ""));
				});
			});
		}).catch(function (x) { PE.toast("Could not open it: " + errText(x)); });
	};
	/* a list of recent projects (empty start screen and File -> Open recent) */
	PE.recentEl = function (opts) {
		opts = opts || {}; var box = el("div", "pe-rec" + (opts.compact ? " pe-rec--compact" : ""));
		function draw() {
			box.innerHTML = ""; var list = recent.slice(0, opts.limit || MAX_RECENT); box.hidden = !list.length && !opts.always;
			if (!list.length) { if (opts.always) box.appendChild(el("p", "pe-hint2", "No recent projects in this browser yet. They appear here once you edit something (autosave) or save a project file.")); return; }
			if (opts.title) box.appendChild(el("div", "pe-rec-t", esc(opts.title)));
			var g = el("div", "pe-rec-g"); box.appendChild(g);
			list.forEach(function (e) {
				var it = el("div", "pe-rec-i"), b = el("button", "pe-rec-b"), x = el("button", "pe-rec-x", "✕"); b.type = "button"; x.type = "button"; x.title = "Remove from this list (deletes its autosave; a project file on disk is not touched)"; x.setAttribute("aria-label", "Remove " + (e.name || "project") + " from recent projects");
				var where = e.file ? (e.file.folder ? "📁 " : "📄 ") + (e.file.dir ? e.file.dir + "/" : "") + e.file.name : "", saved = e.bytes > 0 ? "autosave " + P.bytesText(e.bytes) : "";
				b.innerHTML = (e.thumb ? '<img class="pe-rec-th" alt="" src="' + esc(e.thumb) + '">' : '<span class="pe-rec-th pe-rec-th--none" aria-hidden="true">🖼</span>') + '<span class="pe-rec-m"><b class="pe-rec-n">' + esc(e.name || "Untitled") + "</b>"
					+ '<span class="pe-rec-s">' + esc([e.w && e.h ? e.w + " × " + e.h : "", saved, P.agoText(e.t)].filter(Boolean).join(" · ")) + "</span>" + (where ? '<span class="pe-rec-f">' + esc(where) + "</span>" : "") + "</span>";
				b.title = "Open " + (e.name || "this project") + (e.file ? " (the browser may ask once to let the editor use " + e.file.name + " again)" : " from this browser's autosave");
				b.addEventListener("click", function () { if (opts.onPick) opts.onPick(); PE.openRecent(e); });
				x.addEventListener("click", function (ev) { ev.stopPropagation(); if (!window.confirm("Remove “" + (e.name || "Untitled") + "” from Recent projects?" + (e.bytes > 0 ? "\n\nIts autosave in this browser is deleted." : "") + (e.file ? "\n\nThe file " + e.file.name + " on your disk is not touched." : ""))) return; PE.forgetRecent(e.id); });
				it.appendChild(b); it.appendChild(x); g.appendChild(it);
			});
		}
		var off = false; PE.on("recent", function () { if (!off && (box.isConnected || opts.keep)) draw(); }); draw(); box.detach = function () { off = true; };
		return box;
	};
	PE.dlgRecent = function () {
		PE.recentReady().then(function () {
			var w = el("div", "pe-fx"), m; w.appendChild(PE.recentEl({ always: true, onPick: function () { if (m) m.close(); } }));
			w.appendChild(el("p", "pe-hint2", "Each project here is kept in this browser (autosave, up to " + MAX_RECENT + " projects / " + Math.round(BUDGET / 1e6) + " MB) and, once saved to a file, remembered by its file: opening it reads the file again when it is newer than the autosave (for example after you saved it on another computer)."));
			m = PE.modal({ title: "Recent projects", wide: true, body: w, buttons: [{ label: "Open a project file…", act: function (mm) { mm.close(); PE.openProjectPicker(); } }, { label: "Close", primary: true, act: function (mm) { mm.close(); } }] });
		});
	};

	/* ---------- top bar: linked file + saved time + auto-save ---------- */
	var bar = null;
	function drawBar() {
		bar = bar || document.getElementById("pe-projst"); if (!bar) return; var d = PE.doc, L = cur();
		if (!d) { bar.hidden = true; return; } bar.hidden = false;
		var dirty = !!(PE.dirty && PE.hist.stack.length > 1), st = !L && !canSavePicker() ? (dirty ? "Save = new download" : "") : L ? (L.conflict ? "changed on disk" : L.needPerm && dirty ? "press Save to allow saving" : dirty ? "unsaved changes" : L.savedAt ? "saved " + P.agoText(L.savedAt) : "opened") : dirty ? "not saved to a file" : "";
		var af = PE.autoFileOn(), title = L ? "This project is linked to the file " + whereText(L) + ". " + PE.modKey() + "S writes it there." + (af ? " Auto-save writes changes there " + AUTO_FILE_MS / 1000 + " s after you stop." : "") : "This project is not saved in a file yet: Save project makes one (in a folder you choose, or your Downloads).";
		bar.className = "pe-projst" + (dirty ? " is-dirty" : "") + (L && L.conflict ? " is-warn" : "");
		bar.innerHTML = (L ? '<span class="pe-projst-f">' + (L.handle && L.handle._folder ? "📁 " : "📄 ") + esc(L.name) + "</span>" : "") + (st ? '<span class="pe-projst-s">' + esc(st) + "</span>" : "")
			+ (L ? '<label class="pe-projst-a" title="Write changes to ' + esc(whereText(L)) + " " + AUTO_FILE_MS / 1000 + ' s after you stop editing (handy when the folder is synced by OneDrive)"><input type="checkbox"' + (af ? " checked" : "") + "> Auto-save</label>" : "");
		bar.title = title; var cb = bar.querySelector("input"); if (cb) cb.addEventListener("change", function () { PE.setAutoFile(cb.checked); });
	}
	PE.drawProjectBar = drawBar;
	setInterval(drawBar, 30000); PE.on("docsize", function () { setTimeout(drawBar, 0); });

	/* ---------- Export every layer as PNG (ZIP) ---------- */
	function canvasBytes(c) { return new Promise(function (res, rej) { c.toBlob(function (b) { if (!b) { rej(new Error("a layer is too large to save as PNG")); return; } b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, "image/png"); }); }
	PE.dlgExportLayers = function () {
		if (!needDoc()) return; var d = PE.doc, w = el("div", "pe-fx"), f = PE.form([{ k: "size", label: "Each PNG", type: "seg", options: [["doc", "Image size"], ["own", "Layer's own size"]], val: sget().lexSize || "doc", help: "Image size: every PNG is " + d.w + " × " + d.h + " with the layer in its place, so stacking them in another app rebuilds the picture. Layer's own size: each PNG is just big enough for that layer; layers.json says where it goes." }, { k: "hidden", label: "Include hidden layers", type: "check", val: sget().lexHidden !== false }], null);
		w.appendChild(f.el); w.appendChild(el("p", "pe-hint2", "One PNG per layer (groups are not pictures, their layers are), named after the layers and numbered bottom to top, plus <b>layers.json</b> with each layer's position, size, opacity, blend mode, visibility and group. Masks are applied. For use in GIMP, Photoshop, Figma, Canva, video editors…"));
		PE.modal({ title: "Export every layer as PNG", body: w, buttons: [{ label: "Cancel", act: function (m) { m.close(); } }, { label: "Make ZIP", primary: true, act: function (m) { var v = f.get(); sset({ lexSize: v.size, lexHidden: !!v.hidden }); m.close(); exportLayers(v.size, !!v.hidden); } }] });
	};
	function exportLayers(mode, hidden) {
		var d = PE.doc; PE.relink(); var L0 = d.layers.filter(function (L) { return !PE.isGroup(L) && (hidden || PE.effVisible(L)); });
		if (!L0.length) { PE.toast("No layers to export"); return; }
		var names = P.layerFileNames(L0.map(function (L) { return L.name; })), files = [], meta = [];
		PE.toast("Making " + L0.length + " PNGs…");
		var job = Promise.resolve();
		L0.forEach(function (L, i) { job = job.then(function () {
			var b = PE.bounds(L), x0 = 0, y0 = 0, W = d.w, H = d.h;
			if (mode === "own") { x0 = Math.floor(b.x); y0 = Math.floor(b.y); W = Math.max(1, Math.ceil(b.x + b.w) - x0); H = Math.max(1, Math.ceil(b.y + b.h) - y0); }
			if (W * H > 268e6) throw new Error("“" + L.name + "” is too large for one PNG");
			var c = PE.mk(W, H), x = c.getContext("2d"); x.imageSmoothingQuality = "high";
			PE.drawLayer(x, Object.assign({}, L, { _p: null, visible: true, opacity: 1, blend: "source-over", live: null, preview: null }), [1, 0, 0, 1, -x0, -y0], "lexp", W, H);
			var grp = PE.ancestorsOf ? PE.ancestorsOf(L).map(function (g) { return g.name; }).reverse() : [];
			meta.push({ file: names[i], name: L.name, type: L.type, x: x0, y: y0, w: W, h: H, visible: PE.effVisible(L), opacity: L.opacity, blend: L.blend === "source-over" ? "normal" : L.blend, group: grp, order: i, text: L.type === "text" && L.text ? L.text.str : undefined });
			return canvasBytes(c).then(function (u) { files.push({ name: names[i], data: u }); });
		}); });
		job.then(function () {
			files.push({ name: "layers.json", data: new TextEncoder().encode(JSON.stringify({ app: "MES Photo Editor", note: "One PNG per layer, bottom (first) to top (last). x / y = where the PNG's top-left corner goes on the image.", image: { name: d.name, w: d.w, h: d.h }, mode: mode === "own" ? "layer size" : "image size", layers: meta }, null, 1)) });
			var n = I.cleanFileName(d.name || "image") + " layers.zip"; PE.download(new Blob([I.zipStore(files)], { type: "application/zip" }), n); PE.toast("Downloaded " + n + " (" + L0.length + " PNGs + layers.json)");
		}).catch(function (x) { PE.toast("Could not export the layers: " + errText(x)); });
	}

	/* ---------- a project kept as a FOLDER (an unzipped .mesproj: project.json + layer-N.png + mask-N.png) ----------
	 * A .mesproj is a ZIP. Unzipped (Finder / Explorer / OneDrive sometimes hand it over that way) it is a folder; dropping that folder, choosing it with
	 * File -> Open project folder…, or clicking it in the connected folder opens it with the same loader as the ZIP (the files are put back into one).
	 * With a real folder handle (Chrome / Edge / Brave with the flag) the project is LINKED to the folder: Save writes project.json and the PNGs back into it
	 * (stale layer PNGs are removed). Without one (Safari, Firefox, or the read-only folder input) it opens, and Save makes a new .mesproj file. */
	var FOLDER_MAX = 4000, SKIP_DIR = /^(__MACOSX|\..*|node_modules)$/;
	/* every file under a FileSystemDirectoryHandle, a few folders deep -> [{path, fh}] */
	function listHandle(dh, pre, depth, out) {
		out = out || []; pre = pre || ""; depth = depth || 0;
		return (async function () { for await (var e of dh.values()) { if (out.length >= FOLDER_MAX) break; if (e.kind === "file") out.push({ path: pre + e.name, fh: e }); else if (depth < 4 && !SKIP_DIR.test(e.name)) await listHandle(e, pre + e.name + "/", depth + 1, out); } return out; })();
	}
	/* the same for a dropped FileSystemDirectoryEntry (webkitGetAsEntry: every browser) -> [{path, file}] */
	function listEntry(de, pre, depth, out) {
		out = out || []; pre = pre || ""; depth = depth || 0;
		return new Promise(function (res) {
			var rd = de.createReader(), all = [];
			var next = function () { rd.readEntries(function (es) { if (!es.length) return done(); all = all.concat(Array.prototype.slice.call(es)); next(); }, done); };
			var done = function () { var ch = Promise.resolve(); all.forEach(function (e) { ch = ch.then(function () { if (out.length >= FOLDER_MAX) return; if (e.isFile) return new Promise(function (r2) { e.file(function (f) { out.push({ path: pre + e.name, file: f }); r2(); }, function () { r2(); }); }); if (e.isDirectory && depth < 4 && !SKIP_DIR.test(e.name)) return listEntry(e, pre + e.name + "/", depth + 1, out); }); }); ch.then(function () { res(out); }); };
			next();
		});
	}
	function fileOf(it) { return it.file ? Promise.resolve(it.file) : it.fh.getFile(); }
	/* the project files of a folder listing as one stored ZIP (what PE.loadProject reads) + project.json's lastModified */
	function zipFromList(list, prefix, names) {
		var sel = list.filter(function (it) { return names.indexOf(it.path) >= 0; }), lm = 0;
		return Promise.all(sel.map(function (it) { return fileOf(it).then(function (f) { if (/(^|\/)project\.json$/.test(it.path)) lm = f.lastModified; return f.arrayBuffer().then(function (b) { return { name: it.path.slice(prefix.length), data: new Uint8Array(b) }; }); }); }))
			.then(function (files) { files.sort(function (a, b) { return a.name === "project.json" ? -1 : b.name === "project.json" ? 1 : 0; }); return { zip: I.zipStore(files), lm: lm, n: files.length }; });
	}
	function subDir(dh, prefix) { var parts = prefix.split("/").filter(Boolean), p = Promise.resolve(dh); parts.forEach(function (n) { p = p.then(function (d) { return d.getDirectoryHandle(n); }); }); return p; }
	/* open a folder listing: a project when it has a project.json (the one closest to the top), else its pictures as layers / a new image.
	 * info = {name (the folder's name), dirHandle (a real folder handle, or null), how} */
	PE.openProjectFolder = function (list, info) {
		info = info || {}; var fp = P.folderProject(list.map(function (it) { return it.path; }));
		if (!fp) {
			var imgs = list.filter(function (it) { return /\.(png|jpe?g|webp|gif|bmp|avif|svg|psd|xcf|mesproj|zip)$/i.test(it.path) && !/(^|\/)(__MACOSX\/|\._)/.test(it.path); }).slice(0, 60);
			if (!imgs.length) { PE.toast("“" + (info.name || "That folder") + "” has no MES project (project.json) and no pictures in it"); return Promise.resolve(); }
			return Promise.all(imgs.map(fileOf)).then(function (fs) { PE.toast("“" + (info.name || "folder") + "” is not a MES project (no project.json): its " + fs.length + " picture" + (fs.length === 1 ? "" : "s") + " are opened instead"); PE.openFiles(fs, { place: !!PE.doc, how: info.how || "drop", dir: info.name || "" }); });
		}
		if (PE.confirmReplace && !PE.confirmReplace()) return Promise.resolve();
		var folderName = fp.prefix ? fp.prefix.replace(/\/$/, "").split("/").pop() : info.name || "project";
		PE.toast("Opening the project folder “" + folderName + "”…");
		return zipFromList(list, fp.prefix, fp.files).then(function (z) {
			return PE.loadProject(z.zip, folderName, { file: folderName, dir: info.name && fp.prefix ? info.name : "", bytes: z.zip.length }).then(function () {
				if (!info.dirHandle || !info.dirHandle.getFileHandle) { PE.rememberProject({}); if (PE.setTool) PE.setTool("move"); PE.toast("Opened the project folder “" + folderName + "”. This browser cannot write into a dropped folder, so Save project makes a new .mesproj file" + (PE.canOpenPicker() ? " (File → Open project folder… links the folder instead)" : "")); return; }
				return subDir(info.dirHandle, fp.prefix).then(function (sd) {
					PE.linkProject(PE.folderProjectHandle(sd), { lm: z.lm, dir: fp.prefix ? info.name : "" }); if (PE.setTool) PE.setTool("move");
					PE.toast("Opened the project folder “" + folderName + "”: " + PE.modKey() + "S saves back into it (the browser asks once to allow changes)");
				});
			});
		}).catch(function (x) { PE.toast("Could not open the project folder: " + errText(x)); });
	};
	/* a folder handle that behaves like the project file handle the rest of this file uses (getFile, createWritable, permissions) */
	PE.folderProjectHandle = function (dir) {
		var H = { kind: "file", name: dir.name, _folder: dir,
			queryPermission: function (o) { return dir.queryPermission ? dir.queryPermission(o) : Promise.resolve("granted"); },
			requestPermission: function (o) { return dir.requestPermission ? dir.requestPermission(o) : Promise.resolve("granted"); },
			getFile: function () { return listHandle(dir, "", 3).then(function (list) { var fp = P.folderProject(list.map(function (it) { return it.path; })); if (!fp || fp.prefix) throw new Error("project.json is missing from the folder “" + dir.name + "”"); return zipFromList(list, "", fp.files); })
				.then(function (z) { return { name: dir.name, lastModified: z.lm, size: z.zip.length, arrayBuffer: function () { return Promise.resolve(z.zip.buffer.slice(z.zip.byteOffset, z.zip.byteOffset + z.zip.byteLength)); } }; }); },
			createWritable: function () { var parts = []; return Promise.resolve({ write: function (b) { parts.push(b); return Promise.resolve(); }, close: function () { return writeFolder(dir, new Blob(parts)); }, abort: function () {} }); },
			isSameEntry: function (o) { return Promise.resolve(!!o && (o === H || o._folder === dir)); } };
		return H;
	};
	function writeOne(dir, name, data) { return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(data).then(function () { return w.close(); }); }); }
	/* write a project ZIP into a project folder: the PNGs first, project.json last (its time is the project's time), then remove PNGs no layer uses any more */
	function writeFolder(dir, blob) {
		return blob.arrayBuffer().then(function (ab) {
			var ents = P.zipEntries(new Uint8Array(ab)); if (!ents) throw new Error("could not prepare the project"); var keep = {}, pj = null;
			var ch = Promise.resolve(); ents.forEach(function (e) { keep[e.name] = 1; if (e.name === "project.json") { pj = e; return; } ch = ch.then(function () { return writeOne(dir, e.name, e.data); }); });
			return ch.then(function () { return pj ? writeOne(dir, "project.json", pj.data) : null; }).then(function () {
				return (async function () { var gone = []; for await (var e of dir.values()) if (e.kind === "file" && /^(layer|mask)-[^\/]+\.png$/.test(e.name) && !keep[e.name]) gone.push(e.name); for (var i = 0; i < gone.length; i++) { try { await dir.removeEntry(gone[i]); } catch (x) { } } })();
			});
		});
	}
	/* a drop that contains a folder: the first folder (a real handle when the browser gives one, so Save can write back) */
	PE.openDroppedFolder = function (entry, handleP) {
		return Promise.resolve(handleP).catch(function () { return null; }).then(function (h) {
			if (h && h.kind === "directory") return listHandle(h).then(function (list) { return PE.openProjectFolder(list, { name: h.name, dirHandle: h, how: "drop" }); });
			return listEntry(entry).then(function (list) { return PE.openProjectFolder(list, { name: entry.name, how: "drop" }); });
		}).catch(function (x) { PE.toast("Could not read the folder: " + errText(x)); });
	};
	PE.openFolderHandle = function (h, how) { return listHandle(h).then(function (list) { return PE.openProjectFolder(list, { name: h.name, dirHandle: h, how: how || "folder" }); }); };
	/* File -> Open project folder…: a folder picker that can also save (Chrome / Edge), else the read-only folder input (Safari, Firefox, Brave without the flag) */
	PE.openProjectFolderPicker = function () {
		if (typeof window.showDirectoryPicker === "function") {
			var dh = PE.folderHandle && PE.folderHandle(), o = { id: "mes-photo-projdir", mode: "readwrite" }; if (dh) o.startIn = dh;
			window.showDirectoryPicker(o).then(function (h) { return PE.openFolderHandle(h, "open"); }).catch(function (x) { if (x && x.name === "AbortError") return; PE.toast("Could not open the folder: " + errText(x)); });
			return;
		}
		var inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.setAttribute("webkitdirectory", ""); inp.style.display = "none"; document.body.appendChild(inp);
		inp.addEventListener("change", function () { var fs = Array.prototype.slice.call(inp.files || []); inp.remove(); if (!fs.length) return; var top = (fs[0].webkitRelativePath || "").split("/")[0] || "folder";
			PE.openProjectFolder(fs.map(function (f) { return { path: (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name, file: f }; }), { name: top, how: "open" }); });
		inp.click();
	};
	PE.listFolderHandle = listHandle;

	/* ---------- moving to another computer (in File -> Files and folders) ---------- */
	PE.moveHelpEl = function () {
		var s = el("div", "pe-fx-move");
		s.innerHTML = "<p><b>A. The synced folder way</b> (best with OneDrive, Dropbox, Google Drive for desktop, iCloud Drive): keep your projects in a folder that syncs. On each computer, connect that folder here (or open the project with File → Open), press <b>Save project</b> once and tick <b>Auto-save</b> in the top bar: every change is written to the same file " + AUTO_FILE_MS / 1000 + " s after you stop, the sync service copies it, and on the other computer File → Open recent (or the folder) opens the latest. If both computers changed it, the editor asks <i>Keep mine</i> or <i>Open theirs</i>."
			+ (isBrave() || !canSavePicker() ? " <span class=\"pe-fx-tip\">Brave: this needs <code>" + BRAVE_FLAG + "</code> set to Enabled (then Relaunch). Without it, Save downloads a copy instead.</span>" : "") + "</p>"
			+ "<p><b>B. The file way</b> (any browser, phones too): <b>Save project</b> (or <i>Download project as .zip</i>) makes one file. Copy it to the other computer by USB stick, email, a chat app or any cloud drive, then drag it onto the editor there (or File → Open). A <b>.mesproj is an ordinary ZIP</b> (project.json + one PNG per layer and mask): rename it to .zip to look inside; a .zip like that opens here too.</p>"
			+ "<p><b>C. Not on mes.fm's servers.</b> The editor never uploads your projects: autosaves and Recent projects live only in this browser on this computer, so on another computer they are not there until you bring the file over.</p>";
		return s;
	};

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { PE.recentReady(); }); else setTimeout(function () { PE.recentReady(); }, 0);
})();
