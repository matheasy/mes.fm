/* MES Word Viewer (mes.fm/docx): open .docx files in the browser (several as tabs), page layout view with docx-preview,
 * outline / find / info / comments / pictures panel, print / save as PDF, and an Edit mode (mammoth.js -> contentEditable)
 * that saves a new .docx written by MESDocx.toDocxParts (lib.js). Nothing is uploaded.
 * Libraries (loaded on first use): JSZip 3.10.1 + mammoth 1.13.0 (cdnjs), docx-preview 0.4.1 (jsDelivr). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("dx");
	if (!root || !window.MESDocx) return;
	var D = window.MESDocx, KEY = "mes-docx:v1";
	var JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
		DOCXP = "https://cdn.jsdelivr.net/npm/docx-preview@0.4.1/dist/docx-preview.min.js",
		MAMMOTH = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.13.0/mammoth.browser.min.js";
	var S = { side: window.innerWidth > 760, tab: "outline", comments: true, changes: true, dark: false, remember: true, zoom: 0 };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	if (window.innerWidth <= 760) S.side = false;
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	var app = $("dx-app"), view = $("dx-view"), empty = $("dx-empty"), docs = [], cur = null, uid = 0;
	var scripts = {};
	function loadScript(u) {
		if (!scripts[u]) scripts[u] = new Promise(function (res, rej) {
			var s = document.createElement("script"); s.src = u; s.async = true; s.onload = res;
			s.onerror = function () { delete scripts[u]; rej(new Error("Could not load a helper library. Check your connection and try again.")); };
			document.head.appendChild(s);
		});
		return scripts[u];
	}
	var libZip = function () { return loadScript(JSZIP); };
	var libView = function () { return libZip().then(function () { return loadScript(DOCXP); }); };
	var libMammoth = function () { return loadScript(MAMMOTH); };
	function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function note(html, err) { var n = $("dx-note"); n.hidden = !html; n.innerHTML = html || ""; n.classList.toggle("is-err", !!err); }
	function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); }
	function toast(msg) { var t = document.createElement("div"); t.className = "tu-toast tu-toast--show"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
	var debounce = function (fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; };
	var DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

	/* ---------- recent files (IndexedDB, this device only) ---------- */
	var idb = null;
	function db() {
		if (idb) return idb;
		idb = new Promise(function (res, rej) {
			if (!window.indexedDB) return rej(new Error("no IndexedDB"));
			var r = indexedDB.open("mes-docx", 1);
			r.onupgradeneeded = function () { r.result.createObjectStore("files", { keyPath: "key" }); };
			r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
		});
		idb.catch(function () { idb = null; });
		return idb;
	}
	function store(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction("files", mode), st = tx.objectStore("files"), out = fn(st); tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; tx.onerror = function () { rej(tx.error); }; }); }); }
	function recentList() { return store("readonly", function (st) { return st.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return y.time - x.time; }); }).catch(function () { return []; }); }
	function recentPut(rec) {
		if (!S.remember) return Promise.resolve();
		return store("readwrite", function (st) { st.put(rec); }).then(function () {
			return recentList().then(function (all) {          // keep the 8 newest and at most ~60 MB
				var total = 0, drop = [];
				var seen = {};
				all.forEach(function (r, i) {
					var id = r.name + "|" + r.size;               // the same file opened again: keep only the newest copy
					if (seen[id] && !r.draft) { drop.push(r.key); return; } seen[id] = 1;
					total += r.bytes ? r.bytes.byteLength : 0; if (i >= 8 || total > 60e6) drop.push(r.key);
				});
				if (drop.length) return store("readwrite", function (st) { drop.forEach(function (k) { st.delete(k); }); });
			});
		}).catch(function () { /* storage full or blocked: not important */ });
	}
	function recentDel(key) { return store("readwrite", function (st) { if (key) st.delete(key); else st.clear(); }).catch(function () { }); }
	function recentDraft(d) {
		if (!S.remember || !d.key || !d.editEl) return;
		store("readwrite", function (st) { var g = st.get(d.key); g.onsuccess = function () { var r = g.result; if (r) { r.draft = d.editEl.innerHTML; r.draftTime = Date.now(); st.put(r); } }; }).catch(function () { });
	}
	function showRecent() {
		$("dx-remember").checked = !!S.remember;
		recentList().then(function (all) {
			var box = $("dx-recent"); box.hidden = !all.length || !S.remember;
			$("dx-rlist").innerHTML = all.map(function (r) {
				return '<div class="dx-ritem"><button type="button" class="dx-ropen" data-k="' + esc(r.key) + '"><b>' + esc(r.name) + "</b><small>" + esc(D.fmtBytes(r.size || 0)) + " &middot; " + esc(new Date(r.time).toLocaleString()) + (r.draft ? " &middot; has unsaved edits" : "") + '</small></button><button type="button" class="dx-link" data-del="' + esc(r.key) + '" aria-label="Forget ' + esc(r.name) + '">Forget</button></div>';
			}).join("");
		});
	}
	$("dx-rlist").addEventListener("click", function (e) {
		var o = e.target.closest("[data-k]"), d = e.target.closest("[data-del]");
		if (d) { recentDel(d.getAttribute("data-del")).then(showRecent); return; }
		if (o) recentList().then(function (all) { var r = all.find(function (x) { return x.key === o.getAttribute("data-k"); }); if (r) openBytes(new Uint8Array(r.bytes), r.name, { key: r.key, draft: r.draft }); });
	});
	$("dx-rclear").onclick = function () { if (confirm("Forget all recent files on this device?")) recentDel(null).then(showRecent); };
	$("dx-remember").onchange = function () { S.remember = this.checked; save(); if (!S.remember) recentDel(null).then(showRecent); };

	/* ---------- opening files ---------- */
	var input = $("dx-input");
	function pick() { input.click(); }
	$("dx-open").onclick = pick; $("dx-e-open").onclick = function (e) { e.stopPropagation(); pick(); };
	$("dx-new").onclick = $("dx-e-new").onclick = function (e) { e.stopPropagation(); newDoc(); };
	$("dx-drop").addEventListener("click", function (e) { if (!e.target.closest("button")) pick(); });
	$("dx-drop").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
	input.onchange = function () { addFiles([].slice.call(input.files)); input.value = ""; };
	var hasFiles = function (e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0; };
	["dragenter", "dragover"].forEach(function (t) { document.addEventListener(t, function (e) { if (hasFiles(e)) { e.preventDefault(); app.classList.add("is-over"); } }); });
	document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) app.classList.remove("is-over"); });
	document.addEventListener("drop", function (e) { if (!hasFiles(e)) return; e.preventDefault(); app.classList.remove("is-over"); addFiles([].slice.call(e.dataTransfer.files || [])); });
	document.addEventListener("paste", function (e) {
		if (cur && cur.mode === "edit" && cur.editEl && cur.editEl.contains(document.activeElement)) return;      // the editor handles its own paste
		var fs = []; [].forEach.call((e.clipboardData && e.clipboardData.items) || [], function (it) { if (it.kind === "file") { var f = it.getAsFile(); if (f && /\.(docx|docm|dotx|dotm|doc)$/i.test(f.name || "") || (f && f.type === DOCX_MIME)) fs.push(f); } });
		if (fs.length) { e.preventDefault(); addFiles(fs); }
	});
	function addFiles(list) {
		var chain = Promise.resolve();
		list.forEach(function (f) { chain = chain.then(function () { return f.arrayBuffer().then(function (b) { return openBytes(new Uint8Array(b), f.name, { size: f.size, lastModified: f.lastModified }); }); }); });
		return chain;
	}
	function mainPath(zip) {
		var rel = zip.file("_rels/.rels");
		return (rel ? rel.async("string") : Promise.resolve("")).then(function (x) {
			var m = /<Relationship\b[^>]*Type="[^"]*\/officeDocument"[^>]*>/.exec(x || ""), t = m && /Target="([^"]+)"/.exec(m[0]);
			var p = t ? t[1].replace(/^\//, "") : "word/document.xml";
			return zip.file(p) ? p : zip.file("word/document.xml") ? "word/document.xml" : null;
		});
	}
	function openBytes(u8, name, opt) {
		opt = opt || {};
		var kind = D.sniff(u8, name);
		if (kind !== "zip") { note(esc(name) + ": " + esc(D.SNIFF_MSG[kind] || D.SNIFF_MSG.unknown) + (kind === "pdf" ? ' <a href="/pdf">Open the PDF Editor</a>.' : ""), true); return Promise.resolve(); }
		note("Opening " + esc(name) + "&hellip;");
		return libView().then(function () { return window.JSZip.loadAsync(u8); }).then(function (zip) {
			return mainPath(zip).then(function (mp) {
				if (!mp) throw new Error(D.SNIFF_MSG.zip);
				var dir = mp.replace(/[^/]*$/, ""), get = function (p) { var f = zip.file(p); return f ? f.async("string") : Promise.resolve(""); };
				return Promise.all([get(mp), get("docProps/core.xml"), get("docProps/app.xml"), get(dir + "styles.xml"), get(dir + "comments.xml")]).then(function (x) {
					var d = { id: ++uid, name: name || "document.docx", size: u8.length, bytes: u8, zip: zip, dir: dir, mode: "view", src: "orig",
						props: D.parseProps(x[1], x[2]), page: D.pageSetup(x[0]), heads: D.headingStyles(x[3]), comments: D.parseComments(x[4]),
						stats: D.docStats(x[0], x[4]), text: D.docText(x[0]), key: opt.key || ("f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), zoom: S.zoom || 0 };
					d.media = Object.keys(zip.files).filter(function (p) { return p.indexOf(dir + "media/") === 0 && !zip.files[p].dir; });
					docs.push(d);
					if (!opt.key) recentPut({ key: d.key, name: d.name, size: d.size, time: Date.now(), bytes: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) });
					else store("readwrite", function (st) { var g = st.get(d.key); g.onsuccess = function () { var r = g.result; if (r) { r.time = Date.now(); st.put(r); } }; }).catch(function () { });
					showDoc(d);
					note("");
					if (opt.draft) {
						note('This file has edits you did not download yet. <button type="button" class="dx-link" id="dx-draftgo">Continue editing them</button> <button type="button" class="dx-link" id="dx-draftno">Discard them</button>');
						$("dx-draftgo").onclick = function () { note(""); setMode(d, "edit", opt.draft).then(function () { d.dirty = d.everEdited = true; d.src = "edited"; renderTabs(); status(); }); };
						$("dx-draftno").onclick = function () { note(""); store("readwrite", function (st) { var g = st.get(d.key); g.onsuccess = function () { var r = g.result; if (r) { delete r.draft; st.put(r); } }; }).catch(function () { }); };
					}
					return d;
				});
			});
		}).catch(function (err) { note(esc(name) + ": " + esc(err && err.message ? (/zip|central|end of data/i.test(err.message) ? "this file is damaged or is not a real .docx." : err.message) : "could not be opened."), true); });
	}
	function newDoc() {
		var d = { id: ++uid, name: "Untitled.docx", size: 0, bytes: null, mode: "edit", src: "edited", props: {}, page: D.pageSetup(""), heads: {}, comments: [], stats: null, text: "", media: [], key: null, zoom: S.zoom || 0, blank: true };
		docs.push(d);
		showDoc(d, true);
		setMode(d, "edit", "<p><br></p>");
	}

	/* ---------- tabs ---------- */
	function renderTabs() {
		$("dx-tabs").innerHTML = docs.map(function (d) {
			return '<div class="dx-tab' + (d === cur ? " is-on" : "") + '" role="tab" aria-selected="' + (d === cur) + '" data-id="' + d.id + '" title="' + esc(d.name) + '"><span class="dx-tn">' + esc(d.name) + "</span>" + (d.dirty ? '<span class="dx-tdot" title="Edited">&bull;</span>' : "") + '<button type="button" class="dx-tx" data-x="' + d.id + '" aria-label="Close ' + esc(d.name) + '">&times;</button></div>';
		}).join("");
	}
	$("dx-tabs").addEventListener("click", function (e) {
		var x = e.target.closest("[data-x]"), t = e.target.closest("[data-id]");
		if (x) { closeDoc(docs.find(function (d) { return d.id === +x.getAttribute("data-x"); })); return; }
		if (t) showDoc(docs.find(function (d) { return d.id === +t.getAttribute("data-id"); }));
	});
	function closeDoc(d) {
		if (!d) return;
		if (d.dirty && !confirm("Close " + d.name + "? Your edits have not been downloaded.")) return;
		if (d.host) d.host.remove(); if (d.edwrap) d.edwrap.remove();
		(d.fontStyles || []).forEach(function (s) { s.remove(); });
		docs.splice(docs.indexOf(d), 1);
		if (cur === d) { cur = null; if (docs.length) showDoc(docs[docs.length - 1]); else { empty.hidden = false; refreshUi(); showRecent(); } }
		renderTabs();
	}
	function showDoc(d, noRender) {
		if (cur && cur !== d) { cur.scroll = view.scrollTop; if (cur.host) cur.host.hidden = true; if (cur.edwrap) cur.edwrap.hidden = true; }
		cur = d; empty.hidden = true;
		renderTabs();
		clearFind();
		if (d.mode === "edit" && d.edwrap) { d.edwrap.hidden = false; modeNote(d); refreshUi(); applyZoom(); view.scrollTop = d.scroll || 0; return; }
		if (noRender) { refreshUi(); return; }
		if (d.host && d.rendered === d.src) { d.host.hidden = false; modeNote(d); refreshUi(); applyZoom(); view.scrollTop = d.scroll || 0; return; }
		renderView(d);
	}

	/* ---------- page layout view (docx-preview inside a shadow root) ---------- */
	var SHADOW_CSS = ":host{display:block;color:#000;contain:content}" +
		".sty{display:none}" +
		"[data-dxw]{background:transparent!important;padding:16px!important;padding-bottom:4px!important}" +
		"[data-dxw]>section{box-shadow:0 1px 4px rgba(0,0,0,.35)!important;margin-bottom:16px!important}" +
		":host(.is-dark) [data-dxw]>section{filter:invert(1) hue-rotate(180deg)}" +
		":host(.is-dark) [data-dxw]>section img,:host(.is-dark) [data-dxw]>section svg,:host(.is-dark) [data-dxw]>section canvas{filter:invert(1) hue-rotate(180deg)}" +
		"::highlight(dx-hit){background-color:#fde047;color:#000}::highlight(dx-cur){background-color:#f97316;color:#fff}" +
		"a[href]{cursor:pointer}";
	function renderView(d) {
		var bytes = d.src === "edited" ? d.editedBytes : d.bytes;
		if (!bytes) { refreshUi(); return Promise.resolve(); }
		if (!d.host) {
			d.host = document.createElement("div"); d.host.className = "dx-host"; view.appendChild(d.host);
			d.shadow = d.host.attachShadow({ mode: "open" });
		}
		d.host.hidden = false; d.host.classList.toggle("is-dark", !!S.dark);
		d.shadow.innerHTML = "<style>" + SHADOW_CSS + '</style><div class="sty"></div><div class="body"></div>';
		var sty = d.shadow.querySelector(".sty"), body = d.shadow.querySelector(".body"), cls = "d" + d.id;
		note("Laying out the pages&hellip;");
		var opts = { className: cls, inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false, experimental: true, renderAltChunks: false,
			renderComments: !!S.comments && !!window.Highlight, renderChanges: !!S.changes, useBase64URL: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true };
		return libView().then(function () {
			return window.docx.renderAsync(bytes, body, sty, opts).catch(function (err) {
				if (!opts.renderComments && !opts.renderChanges) throw err;     // the experimental comments / changes code failed: try once without it
				body.innerHTML = ""; sty.innerHTML = ""; opts.renderComments = opts.renderChanges = false;
				return window.docx.renderAsync(bytes, body, sty, opts);
			});
		}).then(function () {
			modeNote(d);
			var w = body.querySelector("." + cls + "-wrapper"); if (w) w.setAttribute("data-dxw", "");
			// list bullets from the Symbol / Wingdings fonts are private-use characters most computers can't draw: use the Unicode look-alikes
			var PUA = { "\uF0B7": "\u2022", "\uF0A7": "\u25AA", "\uF0D8": "\u27A2", "\uF0FC": "\u2714", "\uF076": "\u2756", "\uF06E": "\u25A0", "\uF071": "\u2751", "\uF0A8": "\u25A1", "\uF0E0": "\u2794", "\uF0D2": "\u00AE", "\uF0E8": "\u2794", "\uF06C": "\u25CF", "\uF0B2": "\u2606" };
			[].forEach.call(sty.querySelectorAll("style"), function (s) { if (/[\uF000-\uF0FF]/.test(s.textContent)) s.textContent = s.textContent.replace(/[\uF000-\uF0FF]/g, function (c) { return PUA[c] || "\u2022"; }); });
			// fonts declared inside the shadow root are ignored by browsers: copy @font-face rules to the page
			(d.fontStyles || []).forEach(function (s) { s.remove(); }); d.fontStyles = [];
			[].forEach.call(sty.querySelectorAll("style"), function (s) { if (/@font-face/.test(s.textContent)) { var c = document.createElement("style"); c.textContent = s.textContent; document.head.appendChild(c); d.fontStyles.push(c); } });
			// links from the file: only http(s) / mailto / tel / in-document anchors, opened in a new tab
			[].forEach.call(body.querySelectorAll("a"), function (a) {
				var h = a.getAttribute("href") || "", safe = D.safeHref(h);
				if (!safe) { a.removeAttribute("href"); return; }
				if (safe.charAt(0) !== "#") { a.target = "_blank"; a.rel = "noopener noreferrer"; }
			});
			body.addEventListener("click", function (e) {
				var a = e.target.closest("a[href^='#']"); if (!a) return;
				var t = body.querySelector("[id='" + CSS.escape(a.getAttribute("href").slice(1)) + "'], a[name='" + CSS.escape(a.getAttribute("href").slice(1)) + "']");
				e.preventDefault(); if (t) scrollToEl(t);
			});
			d.rendered = d.src;
			d.pages = body.querySelectorAll("section." + cls).length;
			refreshUi(); applyZoom();
		}).catch(function (err) { note("Could not lay out " + esc(d.name) + ": " + esc(err && err.message || err) + ". You can still try Edit, or download it as text.", true); refreshUi(); });
	}
	function modeNote(d) {
		if (d !== cur) return;
		if (d.mode === "edit") { note(d.blank ? "" : "<b>Edit mode:</b> a simplified copy of the document. Words, headings, bold / italic / underline, lists, links, tables and pictures are kept; page design (fonts, colours, spacing, page breaks, columns, text boxes, headers, footers, comments, tracked changes) is simplified. Your original file is not changed. <a href=\"#dx-lossy\" id=\"dx-why\">Details</a>"); var why = $("dx-why"); if (why) why.onclick = function (e) { e.preventDefault(); var t = $("dx-lossy"); if (t) t.scrollIntoView({ behavior: "smooth" }); }; return; }
		note(d.src === "edited" ? 'You are looking at your <b>edited</b> version, laid out the way it will be saved. <button type="button" class="dx-link" id="dx-showorig">Show the original</button>' : (d.everEdited ? 'You are looking at the <b>original</b>. <button type="button" class="dx-link" id="dx-showed">Show my edited version</button>' : ""));
		var so = $("dx-showorig"), se = $("dx-showed");
		if (so) so.onclick = function () { d.src = "orig"; renderView(d); };
		if (se) se.onclick = function () { buildEdited(d).then(function () { d.src = "edited"; renderView(d); }); };
	}
	function activeRoot() { if (!cur) return null; if (cur.mode === "edit") return cur.editEl; return cur.shadow ? cur.shadow.querySelector(".body") : null; }

	/* ---------- zoom ---------- */
	function pagePx(d) { return Math.round(d.page.w / 15); }
	function fitZoom(d) { var w = view.clientWidth - 34; return Math.max(0.25, Math.min(2, w / pagePx(d))); }
	function zoomOf(d) { return d.zoom ? d.zoom : fitZoom(d); }
	function applyZoom() {
		if (!cur) return;
		var z = zoomOf(cur), r = activeRoot();
		$("dx-zoom").textContent = Math.round(z * 100) + "%";
		$("dx-fit").setAttribute("aria-pressed", String(!cur.zoom));
		if (cur.mode === "edit" && cur.editEl) cur.editEl.style.zoom = z;
		else if (r) { var w = r.querySelector("[data-dxw]"); if (w) w.style.zoom = z; }
	}
	function setZoom(z) { if (!cur) return; cur.zoom = z ? Math.max(0.25, Math.min(4, Math.round(z * 100) / 100)) : 0; S.zoom = cur.zoom; save(); applyZoom(); }
	var STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
	function stepZoom(dir) { if (!cur) return; var z = zoomOf(cur), n = dir > 0 ? STEPS.find(function (s) { return s > z + 0.001; }) : STEPS.slice().reverse().find(function (s) { return s < z - 0.001; }); setZoom(n || z); }
	$("dx-zin").onclick = function () { stepZoom(1); }; $("dx-zout").onclick = function () { stepZoom(-1); };
	$("dx-zoom").onclick = $("dx-fit").onclick = function () { setZoom(0); };
	if (window.ResizeObserver) new ResizeObserver(debounce(function () { if (cur && !cur.zoom) applyZoom(); }, 80)).observe(view);
	view.addEventListener("wheel", function (e) { if ((e.ctrlKey || e.metaKey) && cur) { e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1); } }, { passive: false });

	/* ---------- panel ---------- */
	function setSide(on) { S.side = on; save(); app.classList.toggle("no-side", !on); $("dx-side").setAttribute("aria-pressed", String(on)); if (cur && !cur.zoom) setTimeout(applyZoom, 30); }
	$("dx-side").onclick = function () { setSide(!S.side); };
	function setTab(t) {
		S.tab = t; save();
		[].forEach.call(root.querySelectorAll(".dx-stab"), function (b) { var on = b.getAttribute("data-tab") === t; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", String(on)); });
		[].forEach.call(root.querySelectorAll(".dx-spane"), function (p) { p.hidden = p.getAttribute("data-pane") !== t; });
		if (t === "find") setTimeout(function () { $("dx-q").focus(); $("dx-q").select(); }, 20);
		fillPane();
	}
	[].forEach.call(root.querySelectorAll(".dx-stab"), function (b) { b.onclick = function () { setTab(b.getAttribute("data-tab")); }; });
	function fillPane() {
		if (S.tab === "outline") fillOutline();
		else if (S.tab === "info") fillInfo();
		else if (S.tab === "notes") fillNotes();
		else if (S.tab === "pics") fillPics();
		else if (S.tab === "find") { $("dx-repl").hidden = !(cur && cur.mode === "edit"); $("dx-qhint").hidden = !(cur && cur.mode !== "edit"); }
	}
	function headings() {
		var r = activeRoot(), out = []; if (!r || !cur) return out;
		if (cur.mode === "edit") { [].forEach.call(r.querySelectorAll("h1,h2,h3,h4,h5,h6"), function (h) { out.push({ el: h, lv: h.classList.contains("dx-title") ? 0 : +h.tagName.charAt(1), t: h.textContent }); }); return out; }
		var heads = cur.src === "edited" ? { Title: 0, Heading1: 1, Heading2: 2, Heading3: 3, Heading4: 4, Heading5: 5, Heading6: 6 } : cur.heads, map = {};
		Object.keys(heads).forEach(function (id) { map[D.styleClass("d" + cur.id, id)] = heads[id]; });
		[].forEach.call(r.querySelectorAll("section > article p, section > article h1, section > article h2, section > article h3, section > article h4, section > article h5, section > article h6"), function (p) {
			for (var i = 0; i < p.classList.length; i++) { var lv = map[p.classList[i]]; if (lv != null) { if (/\S/.test(p.textContent)) out.push({ el: p, lv: lv, t: p.textContent }); return; } }
		});
		return out;
	}
	function fillOutline() {
		var hs = headings(), box = $("dx-outline");
		if (!cur) { box.innerHTML = '<p class="dx-hint">Open a document to see its headings here.</p>'; return; }
		if (!hs.length) { box.innerHTML = '<p class="dx-hint">This document has no headings. Headings made with Word\'s Heading styles (Heading 1, Heading 2&hellip;) are listed here so you can jump to them.</p>'; return; }
		var minLv = Math.min.apply(null, hs.map(function (h) { return h.lv; }));
		box.innerHTML = hs.map(function (h, i) { var lv = h.lv - minLv; return '<a href="#" data-i="' + i + '" class="l' + Math.min(lv, 1) + '" style="padding-left:' + (6 + Math.min(lv, 6) * 14) + 'px">' + esc(h.t.trim().slice(0, 140)) + "</a>"; }).join("");
		box.onclick = function (e) { var a = e.target.closest("[data-i]"); if (!a) return; e.preventDefault(); var h = headings()[+a.getAttribute("data-i")]; if (h) { scrollToEl(h.el); if (window.innerWidth <= 760) setSide(false); } };
	}
	function scrollToEl(el) { var vr = view.getBoundingClientRect(), er = el.getBoundingClientRect(); view.scrollTo({ top: view.scrollTop + er.top - vr.top - 24, behavior: "smooth" }); }
	function docTextNow() {
		if (!cur) return "";
		if (cur.mode === "edit" && cur.editEl) { if (cur.edText == null) cur.edText = cur.editEl.innerText || ""; return cur.edText; }
		return cur.src === "edited" && cur.editedText != null ? cur.editedText : cur.text;
	}
	function kv(rows) { return '<table class="dx-kv">' + rows.filter(function (r) { return r[1] !== "" && r[1] != null; }).map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</table>"; }
	function dt(s) { var d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toLocaleString() : ""; }
	function fillInfo() {
		var box = $("dx-info");
		if (!cur) { box.innerHTML = '<p class="dx-hint">Open a document to see its word count and properties.</p>'; return; }
		var c = D.countText(docTextNow()), p = cur.props, st = cur.stats, ps = cur.page, n = function (x) { return x.toLocaleString(); };
		var h = '<div class="dx-h">Counts</div>' + kv([["Words", n(c.words)], ["Characters", n(c.chars)], ["Characters (no spaces)", n(c.charsNoSpaces)], ["Paragraphs", n(c.paragraphs)], ["Sentences", n(c.sentences)],
			["Pages", cur.mode === "view" && cur.pages ? cur.pages + " as laid out here" + (p.pages ? " (Word saved " + p.pages + ")" : "") : (p.pages ? p.pages + " (as Word saved it)" : "")],
			["Reading time", D.minutes(c.readMin)], ["Speaking time", D.minutes(c.speakMin)]]);
		h += '<div class="dx-h">File</div>' + kv([["Name", cur.name], ["Size", cur.size ? D.fmtBytes(cur.size) : "not saved yet"], ["Page", D.paperName(ps) + ", " + (ps.w / 1440 * 2.54).toFixed(1) + " \u00D7 " + (ps.h / 1440 * 2.54).toFixed(1) + " cm"],
			["Margins", [ps.top, ps.right, ps.bottom, ps.left].map(function (t) { return (t / 1440 * 2.54).toFixed(1); }).join(" / ") + " cm (top / right / bottom / left)"]]);
		if (Object.keys(p).length) h += '<div class="dx-h">Properties</div>' + kv([["Title", p.title], ["Subject", p.subject], ["Author", p.author], ["Last saved by", p.lastModifiedBy], ["Company", p.company], ["Manager", p.manager], ["Keywords", p.keywords], ["Category", p.category], ["Comments", p.description],
			["Created", dt(p.created)], ["Last saved", dt(p.modified)], ["Last printed", dt(p.lastPrinted)], ["Revision", p.revision], ["Editing time", p.totalTime ? p.totalTime + " min" : ""], ["Made with", [p.application, p.appVersion].filter(Boolean).join(" ")], ["Template", p.template]]);
		if (st) h += '<div class="dx-h">Inside</div>' + kv([["Tables", st.tables], ["Pictures", cur.media.length || st.pictures], ["Comments", st.comments], ["Tracked insertions", st.insertions], ["Tracked deletions", st.deletions], ["Formatting changes", st.formatChanges], ["Footnotes", st.footnotes], ["Equations", st.equations], ["Sections", st.sections], ["Manual page breaks", st.pageBreaks]].map(function (r) { return [r[0], r[1] ? String(r[1]) : ""]; }));
		if (cur.mode === "edit") h += '<p class="dx-hint">Counts follow your edits. Properties and the &ldquo;Inside&rdquo; list describe the file you opened.</p>';
		box.innerHTML = h;
	}
	function fillNotes() {
		var box = $("dx-notes");
		$("dx-ocom").checked = !!S.comments; $("dx-ochg").checked = !!S.changes;
		if (!cur) { box.innerHTML = ""; return; }
		var st = cur.stats, h = "";
		if (st && (st.insertions || st.deletions)) h += '<p class="dx-hint">' + st.insertions + " tracked insertion" + (st.insertions === 1 ? "" : "s") + " and " + st.deletions + " deletion" + (st.deletions === 1 ? "" : "s") + (S.changes ? " are shown in the pages (deleted text struck through)." : " are hidden: the pages show the text with every change accepted.") + "</p>";
		if (!cur.comments.length) h += '<p class="dx-hint">No comments in this document.</p>';
		else h += cur.comments.map(function (c) { return '<div class="dx-com"><div class="dx-com-a">' + esc(c.author || "Unknown") + '</div><div class="dx-com-d">' + esc(dt(c.date)) + '</div><div class="dx-com-t">' + esc(c.text) + "</div></div>"; }).join("");
		if (cur.mode === "edit") h += '<p class="dx-hint">Comments and tracked changes are not kept when you edit.</p>';
		box.innerHTML = h;
	}
	$("dx-ocom").onchange = function () { S.comments = this.checked; save(); rerenderAll(); };
	$("dx-ochg").onchange = function () { S.changes = this.checked; save(); rerenderAll(); };
	function rerenderAll() { docs.forEach(function (d) { d.rendered = null; }); if (cur && cur.mode === "view") renderView(cur); fillNotes(); }
	var picUrls = [];
	function fillPics() {
		var box = $("dx-pics");
		picUrls.forEach(URL.revokeObjectURL); picUrls = [];
		if (!cur || !cur.zip || !cur.media.length) { box.innerHTML = '<p class="dx-hint">' + (cur ? "No pictures in this document." : "Open a document to list its pictures.") + "</p>"; return; }
		box.innerHTML = '<p><button type="button" class="dx-btn" id="dx-picall">Download all (' + cur.media.length + ') as ZIP</button></p><div class="dx-pics" id="dx-picgrid"></div>';
		var grid = $("dx-picgrid"), d = cur;
		d.media.forEach(function (p, i) {
			var nm = p.replace(/^.*\//, ""), b = document.createElement("button"); b.type = "button"; b.className = "dx-pic"; b.title = "Download " + nm;
			b.innerHTML = /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(nm) ? '<img alt="" loading="lazy">' : '<div class="dx-noimg">' + esc(nm.replace(/^.*\./, "").toUpperCase()) + "</div>";
			b.appendChild(document.createTextNode(nm));
			grid.appendChild(b);
			d.zip.file(p).async("uint8array").then(function (u) {
				var type = /\.svg$/i.test(nm) ? "image/svg+xml" : /\.png$/i.test(nm) ? "image/png" : /\.gif$/i.test(nm) ? "image/gif" : /\.bmp$/i.test(nm) ? "image/bmp" : /\.webp$/i.test(nm) ? "image/webp" : /\.jpe?g$/i.test(nm) ? "image/jpeg" : "application/octet-stream";
				var blob = new Blob([u], { type: type }), url = URL.createObjectURL(blob); picUrls.push(url);
				var im = b.querySelector("img"); if (im && type !== "image/svg+xml") im.src = url; else if (im) im.replaceWith(Object.assign(document.createElement("div"), { className: "dx-noimg", textContent: "SVG" }));
				b.onclick = function () { download(blob, nm); };
			});
		});
		$("dx-picall").onclick = function () {
			var z = new window.JSZip(), base = D.baseName(d.name);
			Promise.all(d.media.map(function (p) { return d.zip.file(p).async("uint8array").then(function (u) { z.file(p.replace(/^.*\//, ""), u); }); }))
				.then(function () { return z.generateAsync({ type: "blob" }); }).then(function (b) { download(b, base + " pictures.zip"); });
		};
	}

	/* ---------- find ---------- */
	var hits = [], hitAt = -1;
	function textIndex(rootEl) {
		var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentNode; return !p || /^(STYLE|SCRIPT)$/.test(p.nodeName) || (p.closest && p.closest("[class$='-comment-popover']")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
		var nodes = [], s = "", n;
		while ((n = walker.nextNode())) { nodes.push({ n: n, at: s.length }); s += n.nodeValue; }
		return { s: s, nodes: nodes };
	}
	function rangeAt(ix, a, b) {
		var r = document.createRange(), i = 0;
		function pos(o) { while (i < ix.nodes.length - 1 && ix.nodes[i + 1].at <= o) i++; return ix.nodes[i]; }
		var na = pos(a); r.setStart(na.n, a - na.at);
		var nb = pos(b); if (b - nb.at === 0 && i > 0 && nb.at === b) { nb = ix.nodes[i - 1]; r.setEnd(nb.n, nb.n.nodeValue.length); } else r.setEnd(nb.n, Math.min(nb.n.nodeValue.length, b - nb.at));
		return r;
	}
	function clearFind() { hits = []; hitAt = -1; if (window.CSS && CSS.highlights) { CSS.highlights.delete("dx-hit"); CSS.highlights.delete("dx-cur"); } $("dx-qn").textContent = ""; $("dx-qlist").innerHTML = ""; }
	function runFind(keep) {
		var q = $("dx-q").value, r = activeRoot();
		var was = hitAt; clearFind();
		if (!q || !r) return;
		var ix = textIndex(r), found = D.findAll(ix.s, q, { caseSensitive: $("dx-qcase").checked, wholeWord: $("dx-qword").checked });
		hits = found.slice(0, 2000).map(function (m) { return { r: rangeAt(ix, m[0], m[1]), a: m[0], b: m[1] }; });
		if (window.Highlight && CSS.highlights) { var hl = new Highlight(); hits.forEach(function (h) { hl.add(h.r); }); CSS.highlights.set("dx-hit", hl); }
		$("dx-qlist").innerHTML = hits.slice(0, 200).map(function (h, i) { var a = Math.max(0, h.a - 30), pre = ix.s.slice(a, h.a), post = ix.s.slice(h.b, h.b + 40); return '<button type="button" data-i="' + i + '">' + (a > 0 ? "&hellip;" : "") + esc(pre) + "<mark>" + esc(ix.s.slice(h.a, h.b)) + "</mark>" + esc(post) + "</button>"; }).join("");
		if (!hits.length) { $("dx-qn").textContent = "No matches"; return; }
		go(keep && was >= 0 ? Math.min(was, hits.length - 1) : 0);
	}
	function go(i) {
		if (!hits.length) return;
		hitAt = (i + hits.length) % hits.length;
		var h = hits[hitAt];
		if (window.Highlight && CSS.highlights) CSS.highlights.set("dx-cur", new Highlight(h.r));
		else { var sel = getSelection(); sel.removeAllRanges(); sel.addRange(h.r); }
		$("dx-qn").textContent = (hitAt + 1) + " of " + hits.length + (hits.length >= 2000 ? "+" : "");
		[].forEach.call($("dx-qlist").children, function (b, k) { b.classList.toggle("is-on", k === hitAt); });
		var vr = view.getBoundingClientRect(), rr = h.r.getBoundingClientRect();
		if (rr.top < vr.top + 20 || rr.bottom > vr.bottom - 20) view.scrollTo({ top: view.scrollTop + rr.top - vr.top - vr.height / 3 });
	}
	$("dx-q").addEventListener("input", debounce(function () { runFind(false); }, 180));
	$("dx-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (!hits.length) runFind(false); else go(hitAt + (e.shiftKey ? -1 : 1)); } if (e.key === "Escape") { this.value = ""; clearFind(); } });
	$("dx-qcase").onchange = $("dx-qword").onchange = function () { runFind(false); };
	$("dx-qnext").onclick = function () { if (!hits.length) runFind(false); else go(hitAt + 1); };
	$("dx-qprev").onclick = function () { if (!hits.length) runFind(false); else go(hitAt - 1); };
	$("dx-qlist").onclick = function (e) { var b = e.target.closest("[data-i]"); if (b) go(+b.getAttribute("data-i")); };
	function replaceHit(h, text) {
		var sel = getSelection(); sel.removeAllRanges(); sel.addRange(h.r);
		cur.editEl.focus({ preventScroll: true });
		sel.removeAllRanges(); sel.addRange(h.r);
		if (!document.execCommand("insertText", false, text)) { h.r.deleteContents(); h.r.insertNode(document.createTextNode(text)); }
	}
	$("dx-r1").onclick = function () { if (!cur || cur.mode !== "edit") return; if (!hits.length) runFind(false); if (!hits.length) return; replaceHit(hits[hitAt], $("dx-r").value); markDirty(); runFind(true); };
	$("dx-rall").onclick = function () {
		if (!cur || cur.mode !== "edit") return; runFind(false); var n = hits.length; if (!n) return;
		for (var i = hits.length - 1; i >= 0; i--) replaceHit(hits[i], $("dx-r").value);
		markDirty(); clearFind(); $("dx-qn").textContent = n + " replaced";
	};

	/* ---------- edit mode ---------- */
	var ALLOW = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, UL: 1, OL: 1, LI: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, SUP: 1, SUB: 1, A: 1, BR: 1, IMG: 1, TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1, TD: 1, TH: 1, BLOCKQUOTE: 1, PRE: 1, CODE: 1, HR: 1, SPAN: 1, MARK: 1 };
	var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, META: 1, LINK: 1, TITLE: 1, HEAD: 1, FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, SVG: 1, MATH: 1, VIDEO: 1, AUDIO: 1, CANVAS: 1, NOSCRIPT: 1, TEMPLATE: 1 };
	var STYLE_OK = { "text-align": /^(left|right|center|justify)$/, "font-weight": /^(bold|[6-9]00|normal|400)$/, "font-style": /^italic$/, "text-decoration": /^(underline|line-through)/, "vertical-align": /^(super|sub)$/ };
	function cleanHtml(html) {
		var doc = new DOMParser().parseFromString("<body>" + html, "text/html");
		(function walk(el) {
			[].slice.call(el.childNodes).forEach(function (n) {
				if (n.nodeType === 8) { n.remove(); return; }
				if (n.nodeType !== 1) return;
				var tag = n.nodeName.toUpperCase();
				if (DROP[tag]) { n.remove(); return; }
				walk(n);
				if (!ALLOW[tag]) {
					if (/^(DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|FIGURE|FIGCAPTION|DT|DD|ADDRESS)$/.test(tag) && ![].some.call(n.children, function (c) { return /^(P|DIV|H\d|UL|OL|TABLE|BLOCKQUOTE|PRE)$/.test(c.nodeName); })) {
						var p = doc.createElement("p"); while (n.firstChild) p.appendChild(n.firstChild); n.replaceWith(p);
					} else { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); }
					return;
				}
				[].slice.call(n.attributes).forEach(function (a) {
					var nm = a.name.toLowerCase(), v = a.value, keep = false;
					if (tag === "A" && nm === "href") { var h = D.safeHref(v); if (h) { n.setAttribute("href", h); keep = true; } }
					else if (tag === "IMG" && nm === "src") keep = /^(data:image\/(png|jpe?g|gif|bmp|webp);|blob:|https:)/i.test(v);
					else if (tag === "IMG" && (nm === "alt" || nm === "width" || nm === "height")) keep = true;
					else if ((tag === "TD" || tag === "TH") && nm === "colspan") keep = true;
					else if (tag === "OL" && nm === "start") keep = true;
					else if (nm === "class" && tag === "H1" && /\bdx-title\b/.test(v)) { n.setAttribute("class", "dx-title"); keep = true; }
					else if (nm === "style") {
						var ok = []; v.split(";").forEach(function (dcl) { var i = dcl.indexOf(":"); if (i < 0) return; var p = dcl.slice(0, i).trim().toLowerCase(), val = dcl.slice(i + 1).trim().toLowerCase(); if (STYLE_OK[p] && STYLE_OK[p].test(val)) ok.push(p + ":" + val); });
						if (ok.length) { n.setAttribute("style", ok.join(";")); keep = true; }
					}
					if (!keep) n.removeAttribute(a.name);
				});
				if (tag === "A" && !n.getAttribute("href")) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); }
				else if (tag === "IMG" && !n.getAttribute("src")) n.remove();
				else if (tag === "SPAN" && !n.attributes.length) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); }
			});
		})(doc.body);
		return doc.body.innerHTML;
	}
	var STYLE_MAP = ["p[style-name='Title'] => h1.dx-title:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Quote'] => blockquote > p:fresh", "p[style-name='Intense Quote'] => blockquote > p:fresh", "u => u", "strike => s"];
	function setMode(d, mode, html) {
		if (!d) return;
		if (mode === "edit") {
			var ready = d.editEl ? Promise.resolve() : (html != null ? Promise.resolve(html) : (note("Preparing the editor&hellip;"), libMammoth().then(function () {
				return window.mammoth.convertToHtml({ arrayBuffer: d.bytes.buffer.slice(d.bytes.byteOffset, d.bytes.byteOffset + d.bytes.byteLength) }, { styleMap: STYLE_MAP });
			}).then(function (res) { d.mWarn = (res.messages || []).filter(function (m) { return m.type === "warning"; }).length; return res.value; }))).then(function (h) { if (h != null) makeEditor(d, h); });
			return ready.then(function () {
				d.scroll = view.scrollTop; d.mode = "edit"; if (d.host) d.host.hidden = true; d.edwrap.hidden = false;
				clearFind();
				modeNote(d);
				refreshUi(); applyZoom(); view.scrollTop = 0;
				setTimeout(function () { d.editEl.focus({ preventScroll: true }); }, 30);
			}).catch(function (err) { note("Could not open the editor: " + esc(err && err.message || err), true); });
		}
		// back to the page view: lay out the edited version the way it will be saved
		var go = d.dirty || d.blank ? buildEdited(d).then(function () { d.src = "edited"; }) : Promise.resolve();
		return go.then(function () {
			d.mode = "view"; if (d.edwrap) d.edwrap.hidden = true; hideImgBar(); clearFind();
			if (d.host && d.rendered === d.src) { d.host.hidden = false; modeNote(d); refreshUi(); applyZoom(); }
			else renderView(d);
		});
	}
	function makeEditor(d, html) {
		d.edwrap = document.createElement("div"); d.edwrap.className = "dx-edwrap"; d.edwrap.classList.toggle("is-dark", !!S.dark);
		var ed = document.createElement("div"); ed.className = "dx-ed"; ed.contentEditable = "true"; ed.spellcheck = true; ed.setAttribute("role", "textbox"); ed.setAttribute("aria-multiline", "true"); ed.setAttribute("aria-label", "Document text");
		var ps = d.page; ed.style.width = Math.round(ps.w / 15) + "px"; ed.style.minHeight = Math.round(ps.h / 15) + "px";
		ed.style.padding = Math.round(ps.top / 15) + "px " + Math.round(ps.right / 15) + "px " + Math.round(ps.bottom / 15) + "px " + Math.round(ps.left / 15) + "px";
		ed.innerHTML = cleanHtml(html) || "<p><br></p>";
		d.edwrap.appendChild(ed); view.appendChild(d.edwrap); d.editEl = ed;
		try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* old browsers */ }
		ed.addEventListener("input", function () { markDirty(); });
		ed.addEventListener("paste", function (e) {
			var cd = e.clipboardData; if (!cd) return;
			var file = [].find.call(cd.items || [], function (it) { return it.kind === "file" && /^image\//.test(it.type); });
			if (file) { e.preventDefault(); insertImageFile(file.getAsFile()); return; }
			var h = cd.getData("text/html");
			if (h) { e.preventDefault(); document.execCommand("insertHTML", false, cleanHtml(h.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, ""))); markDirty(); }
		});
		ed.addEventListener("keydown", function (e) {
			if (e.key === "Tab") { var li = sel().anchorNode; li = li && (li.nodeType === 1 ? li : li.parentNode); li = li && li.closest ? li.closest("li") : null; if (li) { e.preventDefault(); document.execCommand(e.shiftKey ? "outdent" : "indent"); markDirty(); } }
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); cmd("link"); }
		});
		ed.addEventListener("click", function (e) { if (e.target.nodeName === "IMG") showImgBar(e.target); else hideImgBar(); });
		ed.addEventListener("keyup", syncBar); ed.addEventListener("mouseup", syncBar);
	}
	function sel() { return getSelection(); }
	var saveDraft = debounce(function () { if (cur && cur.dirty) recentDraft(cur); }, 2500);
	var refreshSoon = debounce(function () { if (cur) cur.edText = null; if (S.tab === "outline" || S.tab === "info") fillPane(); status(); }, 600);
	function markDirty() { if (!cur) return; var was = cur.dirty; cur.dirty = cur.everEdited = true; cur.src = cur.mode === "edit" ? "edited" : cur.src; cur.editedBytes = null; if (!was) renderTabs(); saveDraft(); refreshSoon(); }
	function inEditor(node) { return cur && cur.editEl && node && cur.editEl.contains(node.nodeType === 1 ? node : node.parentNode); }
	function syncBar() {
		if (!cur || cur.mode !== "edit") return;
		["bold", "italic", "underline", "strikeThrough", "superscript", "subscript", "insertUnorderedList", "insertOrderedList"].forEach(function (c) { var b = root.querySelector('[data-cmd="' + c + '"]'); try { b.classList.toggle("is-on", document.queryCommandState(c)); } catch (e) { /* ignore */ } });
		var n = sel().anchorNode; if (!inEditor(n)) return;
		var blk = (n.nodeType === 1 ? n : n.parentNode).closest("h1,h2,h3,h4,h5,h6,blockquote,pre,p,li,td,th");
		var v = !blk ? "p" : blk.matches("h1.dx-title") ? "title" : /^H[1-4]$/.test(blk.nodeName) ? blk.nodeName.toLowerCase() : blk.closest("blockquote") ? "blockquote" : blk.closest("pre") ? "pre" : "p";
		$("dx-block").value = v;
	}
	document.addEventListener("selectionchange", debounce(function () { syncBar(); status(); }, 120));
	function cmd(c) {
		if (!cur || cur.mode !== "edit") return;
		var ed = cur.editEl; ed.focus({ preventScroll: true });
		if (c === "link") {
			var s = sel(), a = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest("a");
			var u = prompt("Link address (https://\u2026 or mailto:\u2026):", a ? a.getAttribute("href") : "https://");
			if (u == null) return; u = u.trim(); if (!u) { document.execCommand("unlink"); markDirty(); return; }
			if (!/^[a-z]+:/i.test(u) && !/^#/.test(u)) u = (/@/.test(u) && !/\//.test(u) ? "mailto:" : "https://") + u;
			if (!D.safeHref(u)) { toast("Only web, email and phone links can be added."); return; }
			if (s.isCollapsed && !a) document.execCommand("insertHTML", false, '<a href="' + esc(u) + '">' + esc(u) + "</a>");
			else if (a && s.isCollapsed) a.setAttribute("href", u); else document.execCommand("createLink", false, u);
		} else if (c === "image") { $("dx-imgin").click(); return; }
		else if (c === "table") {
			var r = prompt("Table size: columns x rows", "3 x 3"); if (!r) return;
			var m = /(\d+)\D+(\d+)/.exec(r) || [0, 3, 3], cols = Math.max(1, Math.min(12, +m[1])), rows = Math.max(1, Math.min(60, +m[2]));
			var h = "<table><tbody>"; for (var i = 0; i < rows; i++) { h += "<tr>"; for (var j = 0; j < cols; j++) h += "<td><br></td>"; h += "</tr>"; } h += "</tbody></table><p><br></p>";
			document.execCommand("insertHTML", false, h);
		} else if (c === "hilite") {
			var sl = sel(); if (sl.isCollapsed) return;
			var an = sl.anchorNode && (sl.anchorNode.nodeType === 1 ? sl.anchorNode : sl.anchorNode.parentNode).closest("mark");
			if (an) { while (an.firstChild) an.parentNode.insertBefore(an.firstChild, an); an.remove(); }
			else { var rg = sl.getRangeAt(0), mk = document.createElement("mark"); try { rg.surroundContents(mk); } catch (e) { mk.appendChild(rg.extractContents()); rg.insertNode(mk); } }
		} else document.execCommand(c, false, null);
		markDirty(); syncBar();
	}
	[].forEach.call(root.querySelectorAll("[data-cmd]"), function (b) { b.addEventListener("mousedown", function (e) { e.preventDefault(); }); b.onclick = function () { cmd(b.getAttribute("data-cmd")); }; });
	$("dx-block").onchange = function () {
		if (!cur || cur.mode !== "edit") return;
		cur.editEl.focus({ preventScroll: true });
		var v = this.value;
		document.execCommand("formatBlock", false, v === "title" ? "h1" : v);
		var n = sel().anchorNode, b = n && (n.nodeType === 1 ? n : n.parentNode).closest("h1");
		if (b) b.classList.toggle("dx-title", v === "title");
		markDirty();
	};
	function insertImageFile(f) {
		if (!f || !/^image\//.test(f.type)) return;
		var rd = new FileReader();
		rd.onload = function () {
			toPngIfNeeded(rd.result).then(function (src) {
				if (!cur || cur.mode !== "edit") return;
				cur.editEl.focus({ preventScroll: true });
				document.execCommand("insertHTML", false, '<img src="' + esc(src) + '" alt="' + esc(f.name.replace(/\.[^.]*$/, "")) + '">'); markDirty();
			});
		};
		rd.readAsDataURL(f);
	}
	$("dx-imgin").onchange = function () { insertImageFile(this.files[0]); this.value = ""; };
	function toPngIfNeeded(src) {
		if (/^data:image\/(png|jpe?g|gif);/i.test(src)) return Promise.resolve(src);
		return new Promise(function (res) {
			var im = new Image(); im.onload = function () { try { var c = document.createElement("canvas"); c.width = im.naturalWidth || 300; c.height = im.naturalHeight || 200; c.getContext("2d").drawImage(im, 0, 0); res(c.toDataURL("image/png")); } catch (e) { res(""); } };
			im.onerror = function () { res(""); }; im.src = src;
		});
	}
	var imgSel = null, imgBar = $("dx-imgbar");
	function showImgBar(img) {
		if (imgSel) imgSel.classList.remove("is-sel"); imgSel = img; img.classList.add("is-sel");
		var ar = app.getBoundingClientRect(), r = img.getBoundingClientRect();
		imgBar.hidden = false; imgBar.style.left = Math.max(6, r.left - ar.left) + "px"; imgBar.style.top = Math.max(6, r.top - ar.top - 40) + "px";
	}
	function hideImgBar() { imgBar.hidden = true; if (imgSel) imgSel.classList.remove("is-sel"); imgSel = null; }
	imgBar.addEventListener("mousedown", function (e) { e.preventDefault(); });
	imgBar.onclick = function (e) {
		var b = e.target.closest("[data-w]"); if (!b || !imgSel || !cur) return;
		var w = +b.getAttribute("data-w");
		if (!w) { imgSel.remove(); hideImgBar(); markDirty(); return; }
		var text = Math.round((cur.page.w - cur.page.left - cur.page.right) / 15), nw = imgSel.naturalWidth || text, nh = imgSel.naturalHeight || text * 0.66, px = Math.round(text * w / 100);
		imgSel.removeAttribute("style"); imgSel.setAttribute("width", px); imgSel.setAttribute("height", Math.round(px * nh / nw));
		markDirty(); showImgBar(imgSel);
	};
	view.addEventListener("scroll", function () { if (!imgBar.hidden) hideImgBar(); });

	/* ---------- building the edited .docx ---------- */
	function editModel(d) {
		var clone = d.editEl.cloneNode(true), live = d.editEl.querySelectorAll("img"), imgs = clone.querySelectorAll("img"), text = Math.round((d.page.w - d.page.left - d.page.right) / 15);
		return Promise.all([].map.call(imgs, function (im, i) {
			var src = live[i] ? live[i] : im, w = +im.getAttribute("width") || Math.min(src.naturalWidth || text, text), h = +im.getAttribute("height") || (src.naturalWidth ? Math.round(w * src.naturalHeight / src.naturalWidth) : 0);
			im.setAttribute("width", w); if (h) im.setAttribute("height", h);
			if (/^data:image\/(png|jpe?g|gif);/i.test(im.getAttribute("src"))) return null;
			return toPngIfNeeded(im.getAttribute("src")).then(function (u) { if (u) im.setAttribute("src", u); else im.replaceWith(document.createTextNode(im.getAttribute("alt") ? "[" + im.getAttribute("alt") + "]" : "")); });
		})).then(function () { return D.fromDom(clone); });
	}
	function buildEdited(d) {
		if (d.editedBytes) return Promise.resolve(d.editedBytes);
		if (!d.editEl) return Promise.resolve(d.bytes);
		return Promise.all([libZip(), editModel(d)]).then(function (x) {
			var model = x[1], p = d.props;
			var parts = D.toDocxParts(model, { title: p.title || (d.blank ? "" : D.baseName(d.name)), subject: p.subject, author: p.author, keywords: p.keywords, description: p.description, created: p.created, page: d.page });
			var z = new window.JSZip(); parts.forEach(function (f) { z.file(f.name, f.data, { createFolders: false }); });
			return z.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: DOCX_MIME }).then(function (u8) {
				d.editedBytes = u8; d.editedText = D.toText(model); d.model = model; return u8;
			});
		});
	}

	/* ---------- export / download / print ---------- */
	function currentModel(d) {
		if (d.editEl) return editModel(d);
		return libMammoth().then(function () { return window.mammoth.convertToHtml({ arrayBuffer: d.bytes.buffer.slice(d.bytes.byteOffset, d.bytes.byteOffset + d.bytes.byteLength) }, { styleMap: STYLE_MAP }); })
			.then(function (res) { var box = document.createElement("div"); box.innerHTML = cleanHtml(res.value); return D.fromDom(box); });
	}
	var menu = $("dx-menu"), dlBtn = $("dx-dl");
	dlBtn.onclick = function (e) { e.stopPropagation(); var open = menu.hidden; menu.hidden = !open; dlBtn.setAttribute("aria-expanded", String(open)); if (open) { $("dx-dl-docx-s").textContent = cur && (cur.everEdited || cur.blank) ? "your edited version" : "the document as opened"; $("dx-dl-orig").hidden = !(cur && cur.bytes && cur.everEdited); var f = menu.querySelector("button:not([hidden])"); if (f) f.focus(); } };
	document.addEventListener("click", function (e) { if (!menu.hidden && !e.target.closest(".dx-dlwrap")) { menu.hidden = true; dlBtn.setAttribute("aria-expanded", "false"); } });
	menu.addEventListener("keydown", function (e) { if (e.key === "Escape") { menu.hidden = true; dlBtn.focus(); } });
	menu.onclick = function (e) {
		var b = e.target.closest("[data-dl]"); if (!b) return;
		menu.hidden = true; dlBtn.setAttribute("aria-expanded", "false");
		if (!cur) { toast("Open a document first."); return; }
		var d = cur, kind = b.getAttribute("data-dl"), base = D.baseName(d.name);
		if (kind === "orig") { download(new Blob([d.bytes], { type: DOCX_MIME }), d.name); return; }
		if (kind === "pdf") { printDoc(); return; }
		if (kind === "docx") {
			if (!d.everEdited && !d.blank) { download(new Blob([d.bytes], { type: DOCX_MIME }), d.name); return; }
			buildEdited(d).then(function (u8) { download(new Blob([u8], { type: DOCX_MIME }), base + (d.blank ? "" : " (edited)") + ".docx"); d.dirty = false; renderTabs(); recentClearDraft(d); toast("Saved " + base + ".docx to your downloads"); }).catch(fail);
			return;
		}
		currentModel(d).then(function (model) {
			if (kind === "html") download(new Blob([D.toHtml(model, d.props.title || base)], { type: "text/html;charset=utf-8" }), base + ".html");
			else if (kind === "md") download(new Blob([D.toMarkdown(model)], { type: "text/markdown;charset=utf-8" }), base + ".md");
			else if (kind === "txt") download(new Blob([D.toText(model)], { type: "text/plain;charset=utf-8" }), base + ".txt");
			else if (kind === "copy") { var t = D.toText(model); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("Copied " + D.countText(t).words.toLocaleString() + " words"); }, function () { toast("Copy was blocked by the browser."); }); }
		}).catch(fail);
	};
	function recentClearDraft(d) { if (!d.key) return; store("readwrite", function (st) { var g = st.get(d.key); g.onsuccess = function () { var r = g.result; if (r && r.draft) { delete r.draft; st.put(r); } }; }).catch(function () { }); }
	function fail(err) { note("Something went wrong: " + esc(err && err.message || err), true); }
	function printDoc() {
		if (!cur) { toast("Open a document first."); return; }
		var d = cur, ps = d.page, fr = document.createElement("iframe");
		fr.setAttribute("aria-hidden", "true"); fr.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
		document.body.appendChild(fr);
		var w = fr.contentWindow, doc = w.document, html;
		if (d.mode === "edit") {
			html = "<style>@page{size:" + (ps.w / 1440) + "in " + (ps.h / 1440) + "in;margin:" + [ps.top, ps.right, ps.bottom, ps.left].map(function (t) { return t / 1440 + "in"; }).join(" ") + "}body{margin:0;font:11pt/1.45 Calibri,Carlito,'Segoe UI',Arial,sans-serif;color:#000}" +
				"h1,h2,h3,h4{color:#1f3864;font-weight:400;margin:14pt 0 4pt}h1{font-size:20pt}h1.dx-title{font-size:28pt;color:#000}h2{font-size:16pt}h3{font-size:14pt;font-weight:700}p{margin:0 0 8pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #7a7a7a;padding:3pt 5pt;vertical-align:top}td p,th p{margin:0}img{max-width:100%;height:auto}blockquote{margin:8pt .5in;font-style:italic}pre{background:#f2f2f2;padding:6pt;white-space:pre-wrap;font:10pt Consolas,monospace}a{color:#0563c1}</style>" + d.editEl.innerHTML;
		} else {
			var r = activeRoot(); if (!r) return;
			var sty = d.shadow.querySelector(".sty").innerHTML, body = r.innerHTML;
			html = sty + "<style>@page{size:" + (ps.w / 1440) + "in " + (ps.h / 1440) + "in;margin:0}html,body{margin:0;padding:0;background:#fff}[data-dxw]{background:none!important;padding:0!important;display:block!important;zoom:1!important}[data-dxw]>section{box-shadow:none!important;margin:0 auto!important;break-after:page;page-break-after:always}[data-dxw]>section:last-child{break-after:auto;page-break-after:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>" + body;
		}
		doc.open(); doc.write("<!doctype html><html><head><meta charset='utf-8'><title>" + esc(D.baseName(d.name)) + "</title></head><body>" + html + "</body></html>"); doc.close();
		var imgs = [].slice.call(doc.images), done = false;
		var fire = function () { if (done) return; done = true; try { w.focus(); w.print(); } catch (e) { fail(e); } setTimeout(function () { fr.remove(); }, 60000); };
		Promise.all(imgs.map(function (im) { return im.complete ? 0 : new Promise(function (res) { im.onload = im.onerror = res; }); })).then(function () { setTimeout(fire, 150); });
		setTimeout(fire, 4000);
		toast("In the print window, choose \u201CSave as PDF\u201D to make a PDF.");
	}
	$("dx-print").onclick = printDoc;

	/* ---------- mode / dark paper / fill window / full screen ---------- */
	$("dx-mview").onclick = function () { if (cur && cur.mode !== "view") setMode(cur, "view"); };
	$("dx-medit").onclick = function () { if (cur && cur.mode !== "edit") setMode(cur, "edit"); };
	$("dx-paper").onclick = function () { S.dark = !S.dark; save(); docs.forEach(function (d) { if (d.host) d.host.classList.toggle("is-dark", S.dark); if (d.edwrap) d.edwrap.classList.toggle("is-dark", S.dark); }); this.setAttribute("aria-pressed", String(S.dark)); };
	function setFill(on) { app.classList.toggle("is-fill", on); document.body.classList.toggle("dx-filled", on); $("dx-fill").setAttribute("aria-pressed", String(on)); if (cur && !cur.zoom) setTimeout(applyZoom, 30); }
	$("dx-fill").onclick = function () { setFill(!app.classList.contains("is-fill")); };
	function toggleFs() { if (document.fullscreenElement) document.exitFullscreen(); else if (app.requestFullscreen) app.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); }
	$("dx-fs").onclick = toggleFs;
	document.addEventListener("fullscreenchange", function () { if (cur && !cur.zoom) setTimeout(applyZoom, 60); });
	document.addEventListener("keydown", function (e) {
		var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.nodeName)), inApp = app.contains(t) || app.classList.contains("is-fill");
		var mod = e.ctrlKey || e.metaKey;
		if (e.key === "Escape" && app.classList.contains("is-fill") && !document.fullscreenElement) { setFill(false); return; }
		if (!inApp) return;
		if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); pick(); return; }
		if (!cur) return;
		if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); if (!S.side) setSide(true); setTab("find"); return; }
		if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); menu.querySelector('[data-dl="docx"]').click(); return; }
		if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); printDoc(); return; }
		if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); stepZoom(1); return; }
		if (mod && e.key === "-") { e.preventDefault(); stepZoom(-1); return; }
		if (mod && e.key === "0") { e.preventDefault(); setZoom(1); return; }
		if (typing || mod || e.altKey) return;
		if (e.key === "w" || e.key === "W") setFill(!app.classList.contains("is-fill"));
		else if (e.key === "f" || e.key === "F") toggleFs();
	});

	/* ---------- status line + toolbar state ---------- */
	function status() {
		var el = $("dx-status");
		if (!cur) { el.textContent = docs.length ? "" : "No document open"; return; }
		var c = D.countText(docTextNow()), bits = [];
		bits.push("<b>" + (cur.mode === "edit" ? "Editing" : cur.src === "edited" ? "Page view (edited)" : "Page view") + "</b>");
		if (cur.mode === "view" && cur.pages) bits.push(cur.pages + " page" + (cur.pages === 1 ? "" : "s"));
		bits.push(c.words.toLocaleString() + " word" + (c.words === 1 ? "" : "s"), c.chars.toLocaleString() + " characters");
		var s = cur.shadow && cur.mode === "view" && cur.shadow.getSelection ? cur.shadow.getSelection() : getSelection(), st = s && !s.isCollapsed ? String(s) : "";
		if (st && (cur.mode === "edit" ? inEditor(s.anchorNode) : true)) { var sc = D.countText(st); if (sc.words) bits.push(sc.words.toLocaleString() + " selected"); }
		if (cur.dirty) bits.push("edited, not downloaded yet");
		el.innerHTML = bits.join(" &middot; ");
	}
	function refreshUi() {
		var on = !!cur, edit = on && cur.mode === "edit";
		$("dx-mview").setAttribute("aria-pressed", String(!edit)); $("dx-medit").setAttribute("aria-pressed", String(edit));
		$("dx-edbar").hidden = !edit;
		["dx-mview", "dx-medit", "dx-zin", "dx-zout", "dx-zoom", "dx-fit", "dx-print", "dx-dl"].forEach(function (id) { $(id).disabled = !on; });
		$("dx-medit").disabled = !on || (!cur.bytes && !cur.editEl);
		$("dx-paper").setAttribute("aria-pressed", String(!!S.dark));
		if (!on) $("dx-zoom").textContent = "100%";
		fillPane(); status();
	}
	window.addEventListener("beforeunload", function (e) { if (docs.some(function (d) { return d.dirty; })) { e.preventDefault(); e.returnValue = ""; } });

	setSide(S.side); setTab(S.tab); refreshUi(); showRecent();
	window.MESDocxApp = { docs: docs, open: openBytes, build: buildEdited, current: function () { return cur; }, setMode: setMode };     // for testing in the console
})();
