/* MES Text Viewer -- mes.fm/text. Opens text-based files (txt, md, rtf, csv, json, html, logs, code ...) from a file, a drop, a paste,
   a link (?url=, /main_js/link-open.js), another MES page (?handoff=) or the MES Read Aloud extension (?ext=&k=), and shows them in a
   Reading view (formatted) or a Code view (line numbers, highlight.js colours). Helpers in lib.js (MESText). Nothing is uploaded.
   Libraries, loaded only when needed: marked 12.0.2 + DOMPurify 3.1.6 (Markdown / HTML), highlight.js 11.9.0 (code colours). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); }, root = $("tx"), T = window.MESText;
	if (!root || !T) return;
	var LO = window.MESLinkOpen, KEY = "mes-text:v1";
	var LIB = { marked: "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js", purify: "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js", hljs: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" };
	var S = { fs: 1, look: "auto", width: "normal", font: "sans", unwrap: "auto", wrap: false, nums: true, colors: true, views: {} };
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	var D = null;   // the open document: {name, bytes, text, enc, info, view, src, dirty}
	var readV = $("tx-readv"), codeV = $("tx-codev"), editor = $("tx-editor"), empty = $("tx-empty"), stage = $("tx-stage"), infoEl = $("tx-info");
	var scripts = {};
	function loadScript(u) {
		if (!scripts[u]) scripts[u] = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = u; s.async = true; s.onload = res; s.onerror = function () { delete scripts[u]; rej(new Error("Could not load a helper library. Check your connection.")); }; document.head.appendChild(s); });
		return scripts[u];
	}
	function esc(s) { return T.escapeHtml(s == null ? "" : s); }
	function toast(msg, ms) { var t = document.createElement("div"); t.className = "tu-toast tu-toast--show"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 2600); }
	function info(msg, err) { infoEl.textContent = msg || ""; infoEl.classList.toggle("is-err", !!err); }
	function fmtSize(n) { return n < 1024 ? n + " bytes" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }

	// ---------- settings ----------
	function applyLook() {
		root.dataset.look = S.look; root.dataset.width = S.width; root.dataset.font = S.font;
		root.style.setProperty("--tf", S.fs); root.classList.toggle("tx-wrap", !!S.wrap); root.classList.toggle("tx-nonums", !S.nums);
		readV.classList.toggle("tx-nocolor", !S.colors);
		$("tx-theme").value = S.look; $("tx-width").value = S.width; $("tx-font").value = S.font; $("tx-unwrap").value = S.unwrap;
		$("tx-wrap").checked = !!S.wrap; $("tx-nums").checked = !!S.nums; $("tx-colors").checked = !!S.colors;
	}
	applyLook();
	[["tx-theme", "look"], ["tx-width", "width"], ["tx-font", "font"]].forEach(function (p) { $(p[0]).onchange = function () { S[p[1]] = this.value; save(); applyLook(); }; });
	$("tx-unwrap").onchange = function () { S.unwrap = this.value; save(); if (D) render(); };
	$("tx-wrap").onchange = function () { S.wrap = this.checked; save(); applyLook(); };
	$("tx-nums").onchange = function () { S.nums = this.checked; save(); applyLook(); };
	$("tx-colors").onchange = function () { S.colors = this.checked; save(); applyLook(); };
	$("tx-enc").onchange = function () { if (!D || !D.bytes) return; if (D.dirty && !confirm("Re-reading the file with other characters drops your edits. Go on?")) { this.value = D.encPick || "auto"; return; } D.encPick = this.value; var r = T.decode(D.bytes, this.value); D.text = r.text; D.enc = r.enc; D.dirty = false; D.info = T.info(D.name, D.text); render(); };
	function setFs(v) { S.fs = Math.round(Math.max(0.6, Math.min(2.6, v)) * 100) / 100; save(); applyLook(); }
	$("tx-smaller").onclick = function () { setFs(S.fs - 0.1); }; $("tx-bigger").onclick = function () { setFs(S.fs + 0.1); };
	$("tx-more").onclick = function () { var m = $("tx-menu"); m.hidden = !m.hidden; this.setAttribute("aria-expanded", String(!m.hidden)); };

	// ---------- opening ----------
	function confirmDrop() { return !D || !D.dirty || confirm("You have unsaved edits. Open another file and drop them?"); }
	function openBytes(buf, name, opt) {
		opt = opt || {};
		var bytes = new Uint8Array(buf), r = T.decode(bytes);
		D = { name: name || "Untitled.txt", bytes: bytes, text: r.text, enc: r.enc, encPick: "auto", info: T.info(name, r.text), src: opt.src || "", dirty: false, size: bytes.length };
		D.view = S.views[D.info.kind] || (D.info.kind === "code" || D.info.kind === "json" ? "code" : "read");
		$("tx-enc").value = "auto";
		document.title = D.name + " · MES Text Viewer";
		render();
		stage.scrollTop = 0;
	}
	function openFile(f) {
		if (!f) return;
		var kind = LO ? LO.kindOf(f.name, f.type) : "text";
		if (kind === "pdf" || kind === "docx") return LO.sendTo(kind, f, { busy: !!D });
		f.arrayBuffer().then(function (b) {
			var k2 = LO ? LO.kindOf(f.name, f.type, b) : "text";
			if (k2 === "pdf" || k2 === "docx") return LO.sendTo(k2, f, { busy: !!D });
			if (k2 === "doc") return info("That is an old Word .doc file. Open it in Word or Google Docs and save it as .docx (then open it in the Word Viewer).", true);
			if (k2 === "other") return info((f.name || "That file") + " is not a text file (it has binary data in it).", true);
			if (!confirmDrop()) return;
			openBytes(b, f.name, { src: f.mesUrl });
			if (f.mesFromExt) toast("Opened from MES Read Aloud. Press Read aloud to listen.", 4500);
		}, function () { info("The file could not be read.", true); });
	}
	function openText(text, name) { if (!confirmDrop()) return; openBytes(new TextEncoder().encode(text), name || "Pasted text.txt"); }
	$("tx-open").onclick = $("tx-e-open").onclick = function (e) { e.stopPropagation(); $("tx-file").click(); };
	$("tx-drop").onclick = function () { $("tx-file").click(); };
	$("tx-drop").onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("tx-file").click(); } };
	$("tx-file").onchange = function () { openFile(this.files[0]); this.value = ""; };
	$("tx-pastego").onclick = function () { var v = $("tx-pastein").value; if (v.trim()) openText(v); };
	var depth = 0, hasFiles = function (e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0; };
	document.addEventListener("dragenter", function (e) { if (hasFiles(e)) { depth++; root.classList.add("is-over"); } });
	document.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) root.classList.remove("is-over"); });
	document.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
	document.addEventListener("drop", function (e) { depth = 0; root.classList.remove("is-over"); if (!hasFiles(e)) return; e.preventDefault(); openFile(e.dataTransfer.files[0]); });
	document.addEventListener("paste", function (e) {
		var t = e.target; if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
		var cd = e.clipboardData; if (!cd) return;
		if (cd.files && cd.files.length) { e.preventDefault(); openFile(cd.files[0]); return; }
		var x = cd.getData("text/plain"); if (!x) return;
		e.preventDefault();
		if (LO && LO.looksLikeLink(x)) openLink(x.trim()); else openText(x);
	});
	// links
	var linkTip = $("tx-linknote").textContent;
	function linkNote(m, err) { var n = $("tx-linknote"); n.textContent = m || linkTip; n.classList.toggle("is-err", !!err); }
	function openLink(raw) {
		if (!LO) return toast("Could not load the link opener");
		$("tx-linkgo").disabled = true; info("Fetching the file…");
		return LO.get(raw, { kind: "text", onStatus: function (m) { linkNote(m); info(m); } }).then(function (f) {
			linkNote(""); info(""); $("tx-link").value = "";
			if (f.mesKind === "pdf" || f.mesKind === "docx") return LO.sendTo(f.mesKind, f, { busy: false });
			if (!confirmDrop()) return;
			return f.arrayBuffer().then(function (b) { openBytes(b, f.name, { src: f.mesUrl }); });
		}).catch(function (e) { var m = (e && e.message || String(e)) + " You can also download the file and drop it here."; linkNote(m, true); info(m, true); })
			.then(function () { $("tx-linkgo").disabled = false; });
	}
	$("tx-linkform").onsubmit = function (e) { e.preventDefault(); openLink($("tx-link").value); };
	$("tx-openlink").onclick = function () { var v = prompt("Link to a text file (https://…)\nGitHub, Google Docs, Drive and Dropbox links work when the file is public.", ""); if (v) openLink(v); };

	// ---------- rendering ----------
	function setView(v) {
		if (!D) return;
		if (D.editing) finishEdit();
		D.view = v; S.views[D.info.kind] = v; save(); render();
	}
	$("tx-vread").onclick = function () { setView("read"); }; $("tx-vcode").onclick = function () { setView("code"); };
	function enable(on) { ["tx-read", "tx-edit", "tx-copy", "tx-dl", "tx-dltxt", "tx-print", "tx-close"].forEach(function (id) { $(id).disabled = !on; }); }
	var renderGen = 0;
	function render() {
		var my = ++renderGen;
		enable(!!D); empty.hidden = !!D;
		if (!D) { readV.hidden = codeV.hidden = editor.hidden = true; $("tx-name").textContent = "No file open"; info(""); $("tx-share").hidden = true; return; }
		$("tx-name").textContent = D.name + (D.dirty ? " •" : "");
		$("tx-vread").setAttribute("aria-pressed", String(D.view === "read")); $("tx-vcode").setAttribute("aria-pressed", String(D.view === "code"));
		$("tx-share").hidden = !/^https?:/.test(D.src || "");
		var st = T.stats(D.text);
		info(D.info.label + " · " + st.lines.toLocaleString() + " lines · " + st.words.toLocaleString() + " words · " + fmtSize(D.size || D.text.length) + " · " + (D.enc || "utf-8").toUpperCase());
		editor.hidden = true;
		if (D.view === "code") { readV.hidden = true; codeV.hidden = false; renderCode(my); }
		else { codeV.hidden = true; readV.hidden = false; renderRead(my).catch(function (e) { if (my === renderGen) readV.innerHTML = "<p>" + esc(e.message || e) + "</p>"; }); }
	}
	function purify(html, keepStyle) {
		return window.DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "link", "meta", "base", "form", "input", "button", "textarea", "select", "iframe", "object", "embed", "script"], FORBID_ATTR: keepStyle ? [] : ["style", "class", "id"], ALLOW_DATA_ATTR: false });
	}
	function fixLinks(el) { el.querySelectorAll("a[href]").forEach(function (a) { if (/^\s*javascript:/i.test(a.getAttribute("href"))) a.removeAttribute("href"); else if (!/^#/.test(a.getAttribute("href"))) { a.target = "_blank"; a.rel = "noopener nofollow ugc"; } }); }
	function renderRead(my) {
		var k = D.info.kind, t = D.text;
		if (k === "md" || k === "html") {
			readV.innerHTML = '<p class="tx-morenote">Formatting…</p>';
			return Promise.all([loadScript(LIB.purify), k === "md" ? loadScript(LIB.marked) : null]).then(function () {
				if (my !== renderGen) return;
				var html = k === "md" ? window.marked.parse(t, { gfm: true, breaks: false }) : t.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
				readV.innerHTML = purify(html); fixLinks(readV);
				readV.querySelectorAll("table").forEach(function (tb) { var w = document.createElement("div"); w.className = "tx-tablewrap"; tb.parentNode.insertBefore(w, tb); w.appendChild(tb); });
			});
		}
		if (k === "rtf") { var r = T.rtfToHtml(t); readV.innerHTML = r.html || "<p>(This RTF file has no text.)</p>"; return Promise.resolve(); }
		if (k === "csv" || k === "tsv") {
			var rows = T.parseCsv(t, k === "tsv" ? "\t" : null, 5001), MAX = 5000, more = rows.length > MAX; rows = rows.slice(0, MAX);
			var head = rows.shift() || [];
			readV.innerHTML = '<div class="tx-tablewrap"><table class="tx-csv"><thead><tr>' + head.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
				rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" +
				(more ? '<p class="tx-morenote">Showing the first ' + MAX.toLocaleString() + ' rows. Open it in <a href="/excel">MES Excel</a> to see them all.</p>' : "");
			return Promise.resolve();
		}
		if (k === "json" || k === "code") {   // code read as a page: monospace, coloured, no line numbers
			var src = t; if (k === "json") { try { src = JSON.stringify(JSON.parse(t), null, 2); } catch (e) { /* keep as written */ } }
			readV.innerHTML = '<pre><code>' + esc(src) + "</code></pre>";
			return highlight(src, D.info.lang).then(function (h) { if (my === renderGen && h) readV.querySelector("code").innerHTML = h; });
		}
		// plain text: paragraphs, links, comfortable lines; hard-wrapped e-texts joined back when asked (or found automatically)
		var unwrap = S.unwrap === "join" || (S.unwrap === "auto" && T.shouldUnwrap(t)), paras = T.paragraphs(t, unwrap), MAXP = 20000;
		var art = /[ ]{3,}\S|[─-╿]|^\s*[|+][-=+]{3,}/m.test(t.slice(0, 6000));   // tables / ASCII art: keep the spacing
		var html = paras.slice(0, MAXP).map(function (p) { return '<p' + (art ? ' class="tx-pre"' : "") + '>' + T.linkify(esc(p)).replace(/\n/g, "<br>") + "</p>"; }).join("");
		if (paras.length > MAXP) html += '<p class="tx-morenote">Showing the first ' + MAXP.toLocaleString() + " paragraphs. The Code view shows the whole file.</p>";
		readV.innerHTML = html || "<p>(Empty file)</p>";
		if (art && S.font === "sans") readV.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace"; else readV.style.fontFamily = "";
		return Promise.resolve();
	}
	function highlight(src, lang) {
		if (!src || src.length > 1.5e6) return Promise.resolve(null);
		return loadScript(LIB.hljs).then(function () {
			var H = window.hljs; if (!H) return null;
			try { if (lang && H.getLanguage(lang)) return H.highlight(src, { language: lang, ignoreIllegals: true }).value; if (src.length < 200000 && !lang) return null; } catch (e) { /* fall through */ }
			return null;
		}, function () { return null; });
	}
	var BATCH = 5000, codeLines = null, codeShown = 0;
	function renderCode(my) {
		var src = D.text, lang = D.info.kind === "text" ? "" : D.info.lang;
		codeLines = esc(src).split(/\r\n|\r|\n/); codeShown = 0; codeV.innerHTML = ""; addLines();
		highlight(src, lang).then(function (h) { if (my !== renderGen || !h) return; codeLines = T.splitHtmlLines(h.replace(/\r\n?/g, "\n")); var n = codeShown; codeShown = 0; codeV.innerHTML = ""; addLines(Math.max(n, Math.min(BATCH, codeLines.length))); });
	}
	function addLines(n) {
		var old = codeV.querySelector(".tx-moreb"); if (old) old.remove();
		var end = Math.min(codeLines.length, codeShown + (n || BATCH)), out = [];
		for (var i = codeShown; i < end; i++) out.push('<div class="tx-l"><span class="tx-n">' + (i + 1) + '</span><span class="tx-c">' + (codeLines[i] || " ") + "</span></div>");
		codeV.insertAdjacentHTML("beforeend", out.join("")); codeShown = end;
		if (codeShown < codeLines.length) { var b = document.createElement("button"); b.type = "button"; b.className = "tx-btn tx-moreb"; b.textContent = "Show more lines (" + (codeLines.length - codeShown).toLocaleString() + " left)"; b.onclick = function () { addLines(); }; codeV.appendChild(b); }
	}
	stage.addEventListener("scroll", function () { if (D && D.view === "code" && codeLines && codeShown < codeLines.length && stage.scrollTop + stage.clientHeight > stage.scrollHeight - 600) addLines(); });

	// ---------- edit / save ----------
	function startEdit() {
		if (!D) return; D.editing = true; readV.hidden = codeV.hidden = true; editor.hidden = false; editor.value = D.text; editor.focus();
		$("tx-edit").textContent = "Done editing"; $("tx-edit").setAttribute("aria-pressed", "true");
	}
	function finishEdit() {
		if (!D || !D.editing) return; D.editing = false;
		if (editor.value !== D.text) { D.text = editor.value; D.dirty = true; D.bytes = null; D.size = new Blob([D.text]).size; D.enc = "utf-8"; D.info = T.info(D.name, D.text); }
		$("tx-edit").textContent = "Edit"; $("tx-edit").setAttribute("aria-pressed", "false"); render();
	}
	$("tx-edit").onclick = function () { if (D && D.editing) finishEdit(); else startEdit(); };
	editor.addEventListener("keydown", function (e) { if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); var a = editor.selectionStart, b = editor.selectionEnd; editor.setRangeText("\t", a, b, "end"); } else if (e.key === "Escape") finishEdit(); });
	function download(asTxt) {
		if (!D) return; if (D.editing) finishEdit();
		var name = asTxt ? D.name.replace(/\.[a-z0-9]+$/i, "") + ".txt" : D.name, text = D.text;
		if (asTxt && D.info.kind === "rtf") text = T.rtfToHtml(D.text).text;
		var blob = !asTxt && !D.dirty && D.bytes ? new Blob([D.bytes]) : new Blob([text], { type: "text/plain;charset=utf-8" });
		var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
		D.dirty = false; $("tx-name").textContent = D.name;
	}
	$("tx-dl").onclick = function () { download(false); }; $("tx-dltxt").onclick = function () { download(true); };
	$("tx-copy").onclick = function () { if (!D) return; var t = D.info.kind === "rtf" ? T.rtfToHtml(D.text).text : D.text; navigator.clipboard.writeText(t).then(function () { toast("Copied"); }, function () { toast("The browser did not allow copying"); }); };
	$("tx-share").onclick = function () { if (!D || !D.src) return; var u = location.origin + "/text?url=" + encodeURIComponent(D.src); navigator.clipboard.writeText(u).then(function () { toast("Link copied: it opens this file here"); }, function () { prompt("Copy this link:", u); }); };
	$("tx-print").onclick = function () { if (D && D.editing) finishEdit(); window.print(); };
	$("tx-close").onclick = function () { if (!confirmDrop()) return; D = null; document.title = "MES Text Viewer"; render(); };
	window.addEventListener("beforeunload", function (e) { if (!window.__mesCloudLeaving && D && (D.dirty || (D.editing && editor.value !== D.text))) { e.preventDefault(); e.returnValue = ""; } });

	// ---------- ☁ Cloud: keep the file saved to a synced folder, Dropbox, OneDrive or Google Drive (main_js/cloud-files.js) ----------
	function syncEdit() {   // typed text counts at once (not only when "Done editing" is pressed), so auto-save sees it
		if (!D || !D.editing || editor.value === D.text) return;
		D.text = editor.value; D.dirty = true; D.bytes = null; D.size = new Blob([D.text]).size; D.enc = "utf-8"; $("tx-name").textContent = D.name + " •";
	}
	var cloud = window.MESCloud ? window.MESCloud.attach({
		app: "text", folder: "MES Apps/Text", what: "text file", title: "Text", defExt: "txt", btnClass: "tx-btn", before: $("tx-read"), toast: toast,
		exts: [".txt", ".md", ".markdown", ".rtf", ".csv", ".tsv", ".json", ".html", ".htm", ".xml", ".log", ".srt", ".vtt", ".ini", ".cfg", ".conf", ".yaml", ".yml", ".toml", ".js", ".mjs", ".ts", ".css", ".py", ".sh", ".bat", ".ps1", ".c", ".h", ".cpp", ".java", ".cs", ".go", ".rs", ".php", ".rb", ".sql", ".tex"],
		accept: [{ description: "Text file", accept: { "text/plain": [".txt", ".md", ".rtf", ".csv", ".tsv", ".json", ".html", ".log", ".xml", ".srt"] } }],
		doc: function () { return D; },
		name: function (d) { return d.name; },
		bytes: function (d) { if (d !== D) return Promise.reject(new Error("That file was closed.")); syncEdit(); return Promise.resolve(!d.dirty && d.bytes ? d.bytes : new TextEncoder().encode(d.text)); },
		open: function (u8, name) { openBytes(u8, name); return D; },
		dirty: function (d) { if (d === D) syncEdit(); return !!d.dirty; },
		markDirty: function (d) { d.dirty = true; render(); },
		saved: function (d, name) { if (name && name !== d.name) { d.name = name; document.title = d.name + " · MES Text Viewer"; } d.dirty = false; if (d === D) $("tx-name").textContent = d.name; },
		replaces: true
	}) : null;
	editor.addEventListener("input", function () { if (!D || !cloud || !cloud.linked(D)) return; syncEdit(); cloud.changed(D); });

	// ---------- read aloud: the MES Read Aloud engine (main_js/site-read-aloud.js) reads the reading or code view ----------
	function activeRoot() { return !D ? null : D.view === "code" ? codeV : readV; }
	function readStart() {
		var r = activeRoot(); if (!r) return null;
		try { var sel = window.getSelection(); if (sel && !sel.isCollapsed && sel.anchorNode && r.contains(sel.anchorNode)) return sel.anchorNode; } catch (e) { /* ignore */ }
		var vr = stage.getBoundingClientRect(), ps = r.querySelectorAll(D.view === "code" ? ".tx-c" : "p,li,h1,h2,h3,h4,td,pre");
		for (var i = 0; i < ps.length; i++) { var b = ps[i].getBoundingClientRect(); if (b.height && b.bottom > vr.top + 10) return i ? ps[i] : null; }
		return null;
	}
	window.__mesraSource = { roots: function () { var r = activeRoot(); return r ? [r] : []; }, start: readStart };
	var raLoading = false;
	function readAloud() {
		if (!D) return; if (D.editing) finishEdit();
		if (window.MESReadAloud) { if (window.MESReadAloud.isActive && window.MESReadAloud.isActive()) window.MESReadAloud.toggle(); else window.MESReadAloud.read(); return; }
		if (raLoading) return; raLoading = true;
		var sc = document.createElement("script"); sc.src = "/main_js/site-read-aloud.js?v=1";
		sc.onload = function () { raLoading = false; if (window.MESReadAloud) window.MESReadAloud.read(); };
		sc.onerror = function () { raLoading = false; toast("Read aloud could not load. Check your connection and try again."); };
		document.head.appendChild(sc);
	}
	$("tx-read").onclick = readAloud;

	// ---------- fill window / full screen ----------
	function setFill(on) { root.classList.toggle("tx-fill", on); document.body.classList.toggle("tx-filling", on); $("tx-fill").setAttribute("aria-pressed", String(on)); $("tx-fill").title = on ? "Back to the normal page (W or Esc)" : "Fill the browser window (W)"; }
	$("tx-fill").onclick = function () { setFill(!root.classList.contains("tx-fill")); };
	$("tx-fs").onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); };

	// ---------- keys ----------
	document.addEventListener("keydown", function (e) {
		var t = e.target, typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable), mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
		if (mod && k === "o") { e.preventDefault(); $("tx-file").click(); return; }
		if (mod && k === "s" && D) { e.preventDefault(); if (!(cloud && cloud.save(D))) download(false); return; }
		if (e.altKey && e.shiftKey && e.code === "KeyR" && D) { e.preventDefault(); readAloud(); return; }
		if (typing || mod || e.altKey) return;
		if (e.key === "Escape" && root.classList.contains("tx-fill")) { setFill(false); return; }
		if (k === "w") setFill(!root.classList.contains("tx-fill")); else if (k === "f") $("tx-fs").click();
		else if (k === "+" || k === "=") setFs(S.fs + 0.1); else if (k === "-") setFs(S.fs - 0.1); else if (k === "0") setFs(1);
		else if (k === "e" && D) { e.preventDefault(); startEdit(); }
		else if (k === "v" && D) setView(D.view === "code" ? "read" : "code");
	});

	render();
	// a file handed over by another MES page or the Read Aloud extension, else ?url=
	if (LO) LO.receive().then(function (f) { if (f) openFile(f); else if (LO.fromQuery()) { $("tx-link").value = LO.fromQuery(); openLink(LO.fromQuery()); } }, function (e) { info(e.message, true); });
	window.MESTextDebug = { open: openBytes, openText: openText, get doc() { return D; }, render: render, setView: setView };
})();
