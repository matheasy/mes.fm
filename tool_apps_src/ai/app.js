/* MES AI -- mes.fm/ai: AI chat (Claude) and pictures (GPT Image), paid per message in HBD.
 * Send: POST /api/ai {op:"quote"} -> exact price + memo "mesai:<id>" -> Keychain / HiveAuth transfer of that HBD to @mes
 * (MESHive.transfer) -> POST /api/ai {op:"run"} (402 while the transfer is not in a block yet: retried every 3 s) ->
 * NDJSON stream of the answer (pictures: JSON with base64 webp). A failed answer after payment offers one free Try again.
 * History only in this browser: localStorage "mes-ai:v1" (chats), IndexedDB "mes-ai" / "img" (pictures; list in "mes-ai:imgs").
 * Local preview (127.0.0.1 / localhost) or ?mock=1: an in-browser stand-in (fake account, fake payment, fake streamed answer
 * priced with the same rules), so the whole flow can be tried without keys or HBD. Rules + prices: lib.js (MESAI). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("ai");
	if (!root || !window.MESAI) return;
	var A = window.MESAI, H = window.MESHive;
	var LS = "mes-ai:v1", LS_IMG = "mes-ai:imgs";
	var mock = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1\b/.test(location.search);
	var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var status = { chat: mock, image: mock, video: mock, known: mock, prov: { anthropic: true, openai: true, xai: true } };
	if (mock && /[?&]soon=1\b/.test(location.search)) { status.image = false; status.video = false; status.prov = { anthropic: true, openai: false, xai: false }; }
	// is this company's key set? (unknown until the status call answers: then everything shows as on)
	function provOn(p) { return !status.known || !status.prov || !!status.prov[p]; }
	var busy = false;

	/* ---------- saved state ---------- */
	function load() { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
	var S = load() || {};
	if (!Array.isArray(S.chats)) S.chats = [];
	if (!A.MODELS[S.model]) S.model = A.DEFAULT_MODEL;
	if (!A.LENGTHS[S.len]) S.len = "medium";
	if (!A.IMAGES[S.imod]) S.imod = "gpt";
	if (!S.iq || typeof S.iq !== "object") S.iq = {};
	var qTab = /[?&]tab=(img|chat|vid)\b/.exec(location.search);
	if (qTab) S.tab = qTab[1];
	if (S.tab !== "img" && S.tab !== "vid") S.tab = "chat";
	function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { msg("This browser's storage is full: old chats could not be saved. Delete some.", "err"); } }
	function newChat() { var c = { id: A.newId(), title: "New chat", at: Date.now(), msgs: [] }; S.chats.unshift(c); S.cur = c.id; save(); return c; }
	function cur() { var c = S.chats.filter(function (x) { return x.id === S.cur; })[0]; return c || (S.chats[0] ? (S.cur = S.chats[0].id, S.chats[0]) : newChat()); }

	function msg(t, kind) { var m = $("ai-msg"); m.hidden = !t; m.textContent = t || ""; m.className = "tu-card ai-msg" + (kind ? " " + kind : ""); }

	/* ---------- account ---------- */
	var MOCK_USER = { name: "demo" };
	function who() { return mock ? MOCK_USER : (H && H.user()); }
	function paintAcct() {
		var u = who(), a = $("ai-acct");
		if (mock) { a.innerHTML = '<p class="ai-demo"><b>Local preview:</b> payments and answers are simulated (account @demo, no HBD moves).</p>'; $("ai-help").innerHTML = ""; return; }
		if (!H) { a.innerHTML = "<p>The Hive login could not load. Reload the page.</p>"; return; }
		if (u) {
			a.innerHTML = '<div class="ai-user"><img src="' + esc(H.avatar(u.name)) + '" alt="" width="32" height="32"><span>Paying as <a href="' + esc(H.peakd(u.name) + "/wallet") + '" target="_blank" rel="noopener">@' + esc(u.name) + '</a></span><button type="button" class="tu-btn tu-btn--ghost" data-a="logout">Log out</button></div>';
			$("ai-help").innerHTML = "";
		} else {
			a.innerHTML = '<div class="ai-loginrow"><label class="tu-label" for="ai-user">Your Hive username</label><input id="ai-user" class="tu-input" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. mes">' +
				'<button type="button" class="tu-btn tu-btn--primary" data-a="login">Log in with Keychain</button></div>';
			$("ai-user").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
			H.keychain(1500).then(function (k) { if (!k && !H.user()) $("ai-help").innerHTML = H.helpHtml(); });
		}
	}
	function doLogin() {
		var inp = $("ai-user");
		msg("Confirm the login in Hive Keychain…");
		H.login(inp ? inp.value : "").then(function (u) { msg("Logged in as @" + u.name + ".", "ok"); paintAcct(); paintPrice(); })
			.catch(function (e) { msg(e.message, "err"); if (e.code === "nokeychain") $("ai-help").innerHTML = H.helpHtml(); });
	}
	$("ai-acct").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"); if (!b) return;
		if (b.dataset.a === "login") doLogin();
		if (b.dataset.a === "logout") { H.logout(); paintAcct(); }
	});

	/* ---------- Markdown ---------- */
	var mdLib = null;
	function loadMd() {
		if (mdLib) return mdLib;
		function js(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
		mdLib = Promise.all([js("https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"), js("https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js")])
			.then(function () { return !!(window.marked && window.DOMPurify); }, function () { return false; });
		return mdLib;
	}
	var mdReady = false;
	loadMd().then(function (ok) { mdReady = ok; if (ok) renderLog(); });
	function plainMd(t) { // fallback when the CDN is blocked: code blocks + paragraphs, everything escaped
		return String(t).split(/```/).map(function (part, i) {
			if (i % 2) { var nl = part.indexOf("\n"); var lang = nl > 0 ? part.slice(0, nl).trim() : ""; return "<pre><code" + (lang ? ' class="language-' + esc(lang) + '"' : "") + ">" + esc(nl > 0 ? part.slice(nl + 1) : part) + "</code></pre>"; }
			return part.split(/\n{2,}/).map(function (p) { return p.trim() ? "<p>" + esc(p).replace(/\n/g, "<br>").replace(/`([^`]+)`/g, "<code>$1</code>") + "</p>" : ""; }).join("");
		}).join("");
	}
	function md(t) {
		if (mdReady) return window.DOMPurify.sanitize(window.marked.parse(String(t), { gfm: true, breaks: false }), { ADD_ATTR: ["target"] });
		return plainMd(t);
	}
	function addCopyButtons(el) {
		el.querySelectorAll("pre").forEach(function (pre) {
			if (pre.querySelector(".ai-copy")) return;
			var b = document.createElement("button");
			b.type = "button"; b.className = "ai-copy"; b.textContent = "Copy";
			b.addEventListener("click", function () {
				var code = pre.querySelector("code") || pre;
				copy(code.innerText, b);
			});
			pre.appendChild(b);
		});
		el.querySelectorAll("a[href^='http']").forEach(function (a) { a.target = "_blank"; a.rel = "noopener nofollow"; });
	}
	function copy(text, btn) {
		var done = function () { var o = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = o; }, 1200); };
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
		else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
	}

	/* ---------- files with a message (pictures, PDFs, text files) ---------- */
	// Pictures are shrunk here to at most 1568 px (what the models look at anyway), PDFs go as they are, text / code files are
	// added to the message as a code block. The files stay in this browser (IndexedDB 'f:<id>'); messages keep only their names.
	var PEND = [], TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|m?js|ts|py|java|c|cpp|h|cs|go|rs|rb|php|sh|sql|ya?ml|ini|log|srt|vtt|tex)$/i;
	var fileUrls = {};
	function b64(buf) { var b = new Uint8Array(buf), s = "", step = 0x8000; for (var i = 0; i < b.length; i += step) s += String.fromCharCode.apply(null, b.subarray(i, i + step)); return btoa(s); }
	function pdfPages(buf) { var t = new TextDecoder("latin1").decode(new Uint8Array(buf)), m = t.match(/\/Type\s*\/Page(?![s\w])/g); return m ? m.length : 1; }
	function pendChars() { return PEND.reduce(function (n, f) { return n + f.data.length; }, 0); }
	function shrinkImage(file) {
		var MAX = 1568;
		return createImageBitmap(file).then(function (bm) {
			var k = Math.min(1, MAX / Math.max(bm.width, bm.height)), w = Math.round(bm.width * k), h = Math.round(bm.height * k);
			// small JPEG / PNG / WebP / GIF that need no shrinking go as they are (keeps transparency and GIF animation)
			if (k === 1 && file.size < 900000 && A.FILES.img.indexOf(file.type) >= 0) return file.arrayBuffer().then(function (buf) { return { mt: file.type, data: b64(buf), w: w, h: h }; });
			var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
			var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(bm, 0, 0, w, h);
			return new Promise(function (res) { cv.toBlob(res, "image/jpeg", 0.86); }).then(function (bl) { return bl.arrayBuffer(); }).then(function (buf) { return { mt: "image/jpeg", data: b64(buf), w: w, h: h }; });
		});
	}
	function addFiles(list) {
		var files = [].slice.call(list || []);
		if (!files.length) return;
		var chain = Promise.resolve(), notes = [];
		files.forEach(function (f) {
			chain = chain.then(function () {
				var name = f.name || "picture", type = f.type || "";
				if (PEND.length >= A.FILES.perMsg) { notes.push("At most " + A.FILES.perMsg + " files in one message."); return; }
				if (/^image\//.test(type)) {
					return shrinkImage(f).then(function (r) {
						if (pendChars() + r.data.length > A.FILES.total) { notes.push(name + ": too big together with the other files."); return; }
						PEND.push({ id: A.newId(), t: "img", mt: r.mt, name: name, data: r.data });
					}, function () { notes.push(name + ": this picture type can't be read here. Use JPEG or PNG."); });
				}
				if (type === "application/pdf" || /\.pdf$/i.test(name)) {
					return f.arrayBuffer().then(function (buf) {
						var d = b64(buf);
						if (pendChars() + d.length > A.FILES.total) { notes.push(name + ": too big (PDFs up to about " + Math.round(A.FILES.total * 0.75 / 1e6 * 10) / 10 + " MB together)."); return; }
						PEND.push({ id: A.newId(), t: "pdf", mt: "application/pdf", name: name, data: d, pages: pdfPages(buf) });
					});
				}
				if (/^text\//.test(type) || TEXT_EXT.test(name) || /json|xml|javascript/.test(type)) {
					if (f.size > 200000) { notes.push(name + ": text files up to 200 KB."); return; }
					return f.text().then(function (t) {
						var inp = $("ai-in"), ext = (name.match(/\.(\w+)$/) || [, ""])[1].toLowerCase();
						inp.value = (inp.value.trim() ? inp.value.replace(/\s+$/, "") + "\n\n" : "") + name + ":\n```" + ext + "\n" + t.replace(/\s+$/, "") + "\n```\n";
					});
				}
				notes.push(name + ": only pictures, PDFs and text files can be added (save Word files as PDF).");
			});
		});
		chain.then(function () { paintFiles(); paintPrice(); if (notes.length) msg(notes.join(" "), "err"); else msg(""); });
	}
	function fileIcon(f) { return f.t === "pdf" ? "📄" : "🖼"; }
	function paintFiles() {
		var box = $("ai-files");
		box.hidden = !PEND.length;
		box.innerHTML = PEND.map(function (f, i) {
			var pic = f.t === "img" ? '<img alt="" src="data:' + f.mt + ";base64," + f.data + '">' : '<span class="ai-fic" aria-hidden="true">' + fileIcon(f) + "</span>";
			return '<span class="ai-file">' + pic + '<span class="ai-fname" title="' + esc(f.name) + '">' + esc(f.name) + (f.pages ? " · " + f.pages + " page" + (f.pages > 1 ? "s" : "") : "") + '</span><button type="button" data-unfile="' + i + '" aria-label="Remove ' + esc(f.name) + '" title="Remove">×</button></span>';
		}).join("");
	}
	$("ai-files").addEventListener("click", function (e) { var b = e.target.closest("[data-unfile]"); if (!b || busy) return; PEND.splice(+b.dataset.unfile, 1); paintFiles(); paintPrice(); });
	$("ai-attach").addEventListener("click", function () { $("ai-file").click(); });
	$("ai-file").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
	$("ai-in").addEventListener("paste", function (e) {
		var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []);
		if (fs.length && !e.clipboardData.getData("text/plain")) { e.preventDefault(); addFiles(fs); }
	});
	(function () {
		var zone = document.querySelector("#ai .ai-compose"), n = 0;
		if (!zone) return;
		zone.addEventListener("dragenter", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") >= 0) { n++; zone.classList.add("ai-drop"); } });
		zone.addEventListener("dragleave", function () { if (--n <= 0) { n = 0; zone.classList.remove("ai-drop"); } });
		zone.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") >= 0) e.preventDefault(); });
		zone.addEventListener("drop", function (e) { n = 0; zone.classList.remove("ai-drop"); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
	})();
	function fileGet(id) { return idbDo("readonly", function (s) { return s.get("f:" + id); }).catch(function () { return null; }); }
	function filePut(f) { return idbDo("readwrite", function (s) { return s.put({ t: f.t, mt: f.mt, name: f.name, data: f.data, pages: f.pages || 0 }, "f:" + f.id); }); }
	// fills in the pictures of the shown messages from IndexedDB
	function paintMsgFiles(log) {
		log.querySelectorAll("img[data-fk]").forEach(function (im) {
			var k = im.dataset.fk;
			im.onclick = function () { if (fileUrls[k]) window.open(fileUrls[k], "_blank", "noopener"); };
			if (fileUrls[k]) { im.src = fileUrls[k]; return; }
			fileGet(k).then(function (f) {
				if (!f) { im.replaceWith(Object.assign(document.createElement("span"), { className: "ai-sub", textContent: "(picture not in this browser)" })); return; }
				var bin = atob(f.data), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
				fileUrls[k] = URL.createObjectURL(new Blob([u], { type: f.mt })); im.src = fileUrls[k];
			});
		});
	}
	// the messages to send, with the files' data: the newest files first until the size cap, older ones are noted instead
	function withFileData(msgs) {
		var need = [];
		msgs.forEach(function (m) { (m.fmeta || []).forEach(function (f) { need.push(f.id); }); });
		return Promise.all(need.map(function (id) { var p = PEND.filter(function (x) { return x.id === id; })[0]; return p ? Promise.resolve(p) : fileGet(id); })).then(function (got) {
			var by = {}; need.forEach(function (id, i) { by[id] = got[i]; });
			var room = A.FILES.total, out = msgs.map(function (m) { return { role: m.role, content: m.content }; });
			for (var i = msgs.length - 1; i >= 0; i--) {
				var fm = msgs[i].fmeta; if (!fm || !fm.length) continue;
				var files = [], left = 0;
				fm.forEach(function (f) {
					var d = by[f.id];
					if (d && d.data.length <= room) { room -= d.data.length; files.push({ t: d.t, mt: d.mt, name: d.name, data: d.data, pages: d.pages || undefined }); }
					else left++;
				});
				if (files.length) out[i].files = files;
				if (left) out[i].content = (out[i].content ? out[i].content + "\n\n" : "") + "[" + left + " file" + (left > 1 ? "s" : "") + " sent with this message earlier " + (left > 1 ? "are" : "is") + " not included again.]";
			}
			return out;
		});
	}

	/* ---------- chat log ---------- */
	function modelName(k) { return (A.MODELS[k] && A.MODELS[k].name) || k; }
	function renderMsg(m, i) {
		var mine = m.role === "user";
		var meta = "";
		if (mine && m.price) meta = '<span class="ai-meta">' + esc(m.price) + " HBD · " + esc(modelName(m.model)) + " · " + esc(A.LENGTHS[m.len] || "") + (m.memo ? ' · <a href="' + (mock ? "#" : "https://hivehub.dev/@" + esc(m.acct || "") + "/wallet") + '" target="_blank" rel="noopener" title="Payment memo">' + esc(m.memo) + "</a>" : "") + "</span>";
		var mf = mine && m.files && m.files.length ? '<div class="ai-mfiles">' + m.files.map(function (f) {
			return f.t === "img" ? '<img data-fk="' + esc(f.id) + '" alt="' + esc(f.name || "picture") + '" title="' + esc(f.name || "") + '">' :
				'<span class="ai-file"><span class="ai-fic" aria-hidden="true">📄</span><span class="ai-fname">' + esc(f.name || "file.pdf") + (f.pages ? " · " + f.pages + " pages" : "") + "</span></span>";
		}).join("") + "</div>" : "";
		var body = mine ? mf + (m.content ? '<div class="ai-text ai-plain">' + esc(m.content) + "</div>" : "") : '<div class="ai-text ai-md">' + (m.content ? md(m.content) : m.error ? "" : m.thinking ? '<p class="ai-thinking">Thinking…</p>' : '<p class="ai-thinking">Waiting for the answer…</p>') + "</div>";
		var foot = "";
		if (!mine) {
			if (m.stop === "max_tokens") foot += '<p class="ai-note">The answer reached the length you paid for. Send "continue" for more, or pick a longer answer.</p>';
			if (m.stop === "refusal") foot += '<p class="ai-note">The AI declined to answer this.</p>';
			if (m.error) foot += '<p class="ai-note ai-err">' + esc(m.error) + "</p>" + (m.retryId ? '<button type="button" class="tu-btn tu-btn--primary" data-retry="' + i + '">Try again (free)</button>' : "");
			if (m.content && !m.pending) foot += '<div class="ai-macts"><button type="button" class="ai-mini" data-copy="' + i + '">Copy answer</button></div>';
		}
		return '<div class="ai-m ' + (mine ? "ai-m--me" : "ai-m--ai") + '" data-i="' + i + '"><div class="ai-who">' + (mine ? "You" : "MES AI") + meta + "</div>" + body + foot + "</div>";
	}
	function renderLog() {
		var c = cur(), log = $("ai-log");
		var nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
		if (!c.msgs.length) {
			log.innerHTML = '<div class="ai-empty"><p><b>Ask anything.</b> Each message is paid on its own; the price is next to the Send button.</p><p class="ai-try">Try: <button type="button" class="ai-mini" data-ex="Explain recursion with a short JavaScript example.">Explain recursion</button> <button type="button" class="ai-mini" data-ex="Write a polite email asking my landlord to fix the heating.">Write an email</button> <button type="button" class="ai-mini" data-ex="What is the derivative of x^2 sin x? Show the steps.">Derivative steps</button></p></div>';
		} else log.innerHTML = c.msgs.map(renderMsg).join("");
		addCopyButtons(log);
		paintMsgFiles(log);
		if (nearEnd || busy) log.scrollTop = log.scrollHeight;
		paintChats();
	}
	function paintChats() {
		var sel = $("ai-chats");
		sel.innerHTML = S.chats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === S.cur ? " selected" : "") + ">" + esc(c.title.slice(0, 60)) + (c.msgs.length ? " (" + Math.ceil(c.msgs.length / 2) + ")" : "") + "</option>"; }).join("");
	}
	$("ai-chats").addEventListener("change", function () { if (busy) return; S.cur = this.value; save(); renderLog(); paintPrice(); });
	$("ai-new").addEventListener("click", function () { if (busy) return; var c = cur(); if (c.msgs.length) newChat(); renderLog(); paintPrice(); $("ai-in").focus(); });
	$("ai-del").addEventListener("click", function () {
		if (busy) return;
		var c = cur();
		if (c.msgs.length && !confirm("Delete \"" + c.title + "\" from this browser?")) return;
		S.chats = S.chats.filter(function (x) { return x.id !== c.id; }); S.cur = null; save(); renderLog(); paintPrice();
	});
	$("ai-export").addEventListener("click", function () {
		var c = cur(); if (!c.msgs.length) return;
		var t = "# " + c.title + "\n\n" + c.msgs.map(function (m) { return "## " + (m.role === "user" ? "You" : "MES AI") + "\n\n" + (m.content || ""); }).join("\n\n");
		var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/markdown" }));
		a.download = c.title.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") + ".md" || "chat.md"; a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
	});
	$("ai-log").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.ex) { $("ai-in").value = b.dataset.ex; paintPrice(); $("ai-in").focus(); }
		if (b.dataset.copy) copy(cur().msgs[+b.dataset.copy].content, b);
		if (b.dataset.retry) retry(+b.dataset.retry);
	});

	/* ---------- options + live price ---------- */
	// model lists grouped by company; a company whose key is not set yet shows its models greyed out with "(soon)"
	function fillModels() {
		var groups = { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)" };
		$("ai-model").innerHTML = Object.keys(groups).map(function (p) {
			return '<optgroup label="' + groups[p] + '">' + Object.keys(A.MODELS).filter(function (k) { return A.MODELS[k].prov === p; }).map(function (k) {
				return '<option value="' + k + '"' + (provOn(p) ? "" : " disabled") + ">" + esc(A.MODELS[k].name.replace(/^ChatGPT: /, "")) + (provOn(p) ? "" : " (soon)") + "</option>";
			}).join("") + "</optgroup>";
		}).join("");
		if (!provOn(A.MODELS[S.model].prov)) { var alt = Object.keys(A.MODELS).filter(function (k) { return provOn(A.MODELS[k].prov); })[0]; if (alt) S.model = alt; }
		$("ai-model").value = S.model;
		$("ai-imod").innerHTML = Object.keys(A.IMAGES).map(function (k) { var im = A.IMAGES[k], on = provOn(im.prov); return '<option value="' + k + '"' + (on ? "" : " disabled") + ">" + esc(im.name) + (on ? "" : " (soon)") + "</option>"; }).join("");
		if (!provOn(A.IMAGES[S.imod].prov)) { var ia = Object.keys(A.IMAGES).filter(function (k) { return provOn(A.IMAGES[k].prov); })[0]; if (ia) S.imod = ia; }
		$("ai-imod").value = S.imod;
		fillQuality();
	}
	// picture quality: GPT Image = Draft / Good / Best, Grok Imagine = 1k / 2k; each company's last choice is remembered
	function fillQuality() {
		var im = A.IMAGES[S.imod], x = im.prov === "xai";
		var opts = x ? A.XIMAGE.res : { low: "Draft (fast, cheap)", medium: "Good", high: "Best" };
		var want = S.iq[im.prov] && opts[S.iq[im.prov]] ? S.iq[im.prov] : (x ? "1k" : "medium");
		$("ai-q").innerHTML = Object.keys(opts).map(function (k) { return '<option value="' + k + '"' + (k === want ? " selected" : "") + ">" + esc(opts[k]) + "</option>"; }).join("");
		$("ai-imodel").textContent = A.PROVIDERS[im.prov] + "'s " + im.name.replace(/ \(.*\)$/, "");
	}
	fillModels();
	$("ai-imod").addEventListener("change", function () { S.imod = this.value; save(); fillQuality(); paintPrice(); });
	$("ai-q").addEventListener("change", function () { S.iq[A.IMAGES[S.imod].prov] = this.value; save(); });
	$("ai-len").innerHTML = Object.keys(A.LENGTHS).map(function (k) { return '<button type="button" data-len="' + k + '" aria-pressed="' + (k === S.len) + '">' + A.LENGTHS[k] + "</button>"; }).join("");
	$("ai-model").addEventListener("change", function () { S.model = this.value; save(); paintPrice(); });
	$("ai-len").addEventListener("click", function (e) { var b = e.target.closest("[data-len]"); if (!b) return; S.len = b.dataset.len; save(); [].forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", x === b); }); paintPrice(); });
	function draftMessages() {
		var text = $("ai-in").value.trim();
		var hist = cur().msgs.filter(function (m) { return (m.content || (m.files && m.files.length)) && !m.error; }).map(function (m) { var o = { role: m.role, content: m.content || "" }; if (m.files && m.files.length) { o.fmeta = m.files; o.files = m.files; } return o; });
		// a failed / unanswered exchange is not sent again: keep turns valid
		var clean = [];
		hist.forEach(function (m) { if (clean.length % 2 === 0 ? m.role === "user" : m.role === "assistant") clean.push(m); });
		if (clean.length % 2) clean.pop();
		if (text || PEND.length) clean.push({ role: "user", content: text, fmeta: PEND.slice(), files: PEND.slice() });
		return clean;
	}
	function usdOf(q) { return A.fmtUsd(q.hbd * A.HBD_USD); }
	function paintPrice() {
		var m = A.MODELS[S.model];
		$("ai-modelnote").textContent = m.blurb + " Answer up to about " + Math.round(m.caps[S.len] * 0.75).toLocaleString("en-US") + " words" + (m.thinks ? " (its thinking counts too)." : ".");
		var msgs = draftMessages(), q = A.chatQuote(S.model, A.estimateChatTokens(msgs.length ? msgs : [{ role: "user", content: "" }]), S.len);
		var hist = msgs.length > 1 ? ' <span class="ai-sub">incl. ' + Math.floor(msgs.length / 2) + " earlier exchange" + (msgs.length > 3 ? "s" : "") + "</span>" : "";
		$("ai-price").innerHTML = "about <b>" + q.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(q) + ")</span>" + hist;
		var on = status.chat && provOn(m.prov) && !busy;
		$("ai-send").disabled = !on;
		$("ai-send").textContent = busy ? "Working…" : "Pay & send";
		var iq = A.imageQuote($("ai-q").value, $("ai-size").value, Math.ceil($("ai-prompt").value.length / 2) + 8, S.imod);
		$("ai-iprice").innerHTML = "<b>" + iq.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(iq) + ")</span>";
		var ion = status.image && provOn(A.IMAGES[S.imod].prov);
		$("ai-make").disabled = !(ion && !busy);
		$("ai-make").textContent = ion ? "Pay & create" : "Coming soon";
		if (typeof paintVprice === "function") paintVprice();
	}
	["ai-in", "ai-prompt"].forEach(function (id) { $(id).addEventListener("input", paintPrice); });
	["ai-q", "ai-size"].forEach(function (id) { $(id).addEventListener("change", paintPrice); });
	$("ai-in").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
	$("ai-send").addEventListener("click", send);

	/* ---------- price table in the "how" box ---------- */
	(function () {
		document.querySelectorAll("[data-margin]").forEach(function (x) { x.textContent = A.MARGIN; });
		$("ai-checked").textContent = A.PRICES_CHECKED;
		var rows = ["<tr><th>Model</th><th>Short</th><th>Medium</th><th>Long</th></tr>"];
		Object.keys(A.MODELS).forEach(function (k) {
			rows.push("<tr><td>" + esc(A.MODELS[k].name) + "</td>" + Object.keys(A.LENGTHS).map(function (l) { return "<td>" + A.chatQuote(k, 500, l).price + " HBD</td>"; }).join("") + "</tr>");
		});
		rows.push('<tr><td colspan="4" class="ai-sub">A new chat with a short question (about 500 tokens sent). Longer chats cost more.</td></tr>');
		rows.push("<tr><th>Picture (square)</th><th>Draft</th><th>Good</th><th>Best</th></tr><tr><td>" + esc(A.IMAGES.gpt.name) + "</td>" + ["low", "medium", "high"].map(function (ql) { return "<td>" + A.imageQuote(ql, "1024x1024", 40).price + " HBD</td>"; }).join("") + "</tr>");
		rows.push("<tr><th>Picture (any shape)</th><th>1k</th><th>2k</th><th></th></tr>");
		Object.keys(A.IMAGES).filter(function (k) { return A.IMAGES[k].prov === "xai"; }).forEach(function (k) { rows.push("<tr><td>" + esc(A.IMAGES[k].name) + "</td>" + ["1k", "2k"].map(function (rq) { return "<td>" + A.imageQuote(rq, "1024x1024", 0, k).price + " HBD</td>"; }).join("") + "<td></td></tr>"); });
		rows.push("<tr><th>Video (480p)</th><th>5 s</th><th>8 s</th><th>15 s</th></tr>");
		Object.keys(A.VIDEO.models).forEach(function (k) { rows.push("<tr><td>" + esc(A.VIDEO.models[k].name) + "</td>" + [5, 8, 15].map(function (d) { return "<td>" + A.videoQuote(k, d, "480p").price + " HBD</td>"; }).join("") + "</tr>"); });
		rows.push('<tr><td colspan="4" class="ai-sub">720p costs 1.5 times as much and 1080p 2.25 times.</td></tr>');
		$("ai-ptable").innerHTML = rows.join("");
	})();

	/* ---------- talking to the server (or the local stand-in) ---------- */
	function post(body) {
		return fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "omit" });
	}
	function jsonOf(r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); }
	var MOCK_Q = {};
	function quote(body) {
		if (mock) {
			return new Promise(function (res) {
				setTimeout(function () {
					var q = body.kind === "image" ? A.imageQuote(body.quality, body.size, Math.ceil(body.prompt.length / 2) + 8, body.model) : A.chatQuote(body.model, A.estimateChatTokens(body.messages), body.len);
					var id = A.newId(); MOCK_Q[id] = { body: body, q: q, tries: 0 };
					res({ status: 200, id: id, memo: A.memoFor(id), to: A.PAY_TO, price: q.price, usd: q.hbd, inTokens: q.inTokens, maxOut: q.maxOut || 0 });
				}, 250);
			});
		}
		return post(Object.assign({ op: "quote" }, body)).then(jsonOf);
	}
	function pay(q) {
		if (mock) return new Promise(function (res) { setTimeout(res, 500); });
		return H.transfer(A.PAY_TO, q.price, "HBD", q.memo);
	}
	function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
	// returns the fetch Response once the server found the payment (or a final error object)
	function runReq(id, acct, onWait) {
		if (mock) return Promise.resolve({ mock: id });
		var tries = 0;
		function go() {
			return post({ op: "run", id: id, acct: acct }).then(function (r) {
				if ((r.status === 402 || (r.status === 502 && !/ndjson/.test(r.headers.get("content-type") || ""))) && tries < 12) {
					return jsonOf(r).then(function (j) {
						if (!j.pending) return { error: j };
						tries++; onWait && onWait(tries);
						return sleep(3000).then(go);
					});
				}
				return r;
			});
		}
		return go();
	}
	var MOCK_ANSWER = "Here is a **simulated** answer (local preview: no AI was called and no HBD moved).\n\nRecursion is when a function calls itself on a smaller piece of the problem until it reaches a case it can answer directly:\n\n```js\nfunction factorial(n) {\n  if (n <= 1) return 1;      // the base case\n  return n * factorial(n - 1);\n}\nconsole.log(factorial(5)); // 120\n```\n\n- Every call waits for the smaller one to finish.\n- Without a base case it would never stop.\n\nOn mes.fm this answer would come from the model you picked.";
	function mockStream(id, onPiece) {
		var info = MOCK_Q[id]; info.tries++;
		if (/fail/i.test(JSON.stringify(info.body.messages || "")) && info.tries === 1) return sleep(600).then(function () { onPiece({ t: "error", msg: "Simulated failure after payment.", retry: true }); });
		var words = MOCK_ANSWER.split(/(?=\s)/), i = 0;
		if (info.body.model === "opus") onPiece({ t: "think" });
		return new Promise(function (res) {
			(function tick() {
				if (i >= words.length) { onPiece({ t: "done", stop: "end_turn" }); return res(); }
				onPiece({ t: "text", v: words.slice(i, i + 3).join("") }); i += 3;
				setTimeout(tick, 35);
			})();
		});
	}
	function readStream(r, onPiece) {
		if (r.mock) return mockStream(r.mock, onPiece);
		if (r.error) { onPiece({ t: "error", msg: r.error.error || "Could not get the answer.", retry: !!r.error.retry }); return Promise.resolve(); }
		var ct = r.headers.get("content-type") || "";
		if (!/ndjson/.test(ct)) return jsonOf(r).then(function (j) { onPiece({ t: "error", msg: j.msg || j.error || "Could not get the answer (HTTP " + j.status + ").", retry: !!j.retry }); });
		var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
		return (function pump() {
			return rd.read().then(function (x) {
				if (x.done) { if (buf.trim()) try { onPiece(JSON.parse(buf)); } catch (e) {} return; }
				buf += dec.decode(x.value, { stream: true });
				var lines = buf.split("\n"); buf = lines.pop();
				lines.forEach(function (l) { if (l.trim()) try { onPiece(JSON.parse(l)); } catch (e) {} });
				return pump();
			});
		})();
	}

	/* ---------- send a chat message ---------- */
	function setBusy(b) { busy = b; root.classList.toggle("ai-busy", b); paintPrice(); }
	function send() {
		if (busy) return;
		var u = who();
		var text = $("ai-in").value.trim();
		if (!text && !PEND.length) { $("ai-in").focus(); return; }
		if (!status.chat) { msg("MES AI chat is coming soon.", "err"); return; }
		if (!u) { msg("Log in with your Hive account first (above).", "err"); $("ai-acct-card").scrollIntoView({ block: "center" }); return; }
		var draft = draftMessages(), sentFiles = PEND.slice();
		var c = cur();
		// a failed exchange at the end is dropped before the new message
		while (c.msgs.length && (c.msgs[c.msgs.length - 1].error || c.msgs[c.msgs.length - 1].role === "user") && !c.msgs[c.msgs.length - 1].retryId) c.msgs.pop();
		setBusy(true);
		msg("Getting the exact price…");
		withFileData(draft).then(function (msgs) {
			var err = A.checkMessages(msgs);
			if (err) throw new Error(err);
			return quote({ acct: u.name, kind: "chat", model: S.model, len: S.len, messages: msgs });
		}).then(function (q) {
			if (q.status !== 200) throw new Error(q.error || "Could not get a price (HTTP " + q.status + ").");
			msg("Price: " + q.price + " HBD (" + A.fmtUsd(q.usd) + "). Confirm the payment in Hive Keychain…");
			return pay(q).then(function () { return q; });
		}).then(function (q) {
			var um = { role: "user", content: text, at: Date.now(), price: q.price, memo: q.memo, model: S.model, len: S.len, acct: u.name };
			if (sentFiles.length) {
				um.files = sentFiles.map(function (f) { var o = { id: f.id, t: f.t, name: f.name }; if (f.pages) o.pages = f.pages; return o; });
				sentFiles.forEach(function (f) { filePut(f).catch(function () {}); });
				PEND = PEND.filter(function (f) { return sentFiles.indexOf(f) < 0; }); paintFiles();
			}
			var am = { role: "assistant", content: "", at: Date.now(), pending: true, model: S.model };
			if (!c.msgs.length) c.title = (text || sentFiles.map(function (f) { return f.name; }).join(", ")).replace(/\s+/g, " ").slice(0, 60);
			c.msgs.push(um, am); c.at = Date.now();
			S.chats.sort(function (a, b) { return b.at - a.at; });
			$("ai-in").value = "";
			save(); renderLog();
			msg("Paid. Waiting for the blockchain (a few seconds)…");
			return answer(c, am, q.id, u.name);
		}).catch(function (e) {
			var m = e && e.message || String(e);
			msg(/cancel|declin|denied/i.test(m) ? "Payment cancelled: nothing was sent." : m, "err");
		}).then(function () { setBusy(false); });
	}
	function answer(c, am, id, acct) {
		var last = 0;
		return runReq(id, acct, function (n) { msg("Waiting for the blockchain… (" + n * 3 + " s)"); }).then(function (r) {
			msg("");
			return readStream(r, function (p) {
				if (p.t === "text") { am.content += p.v; am.thinking = false; if (Date.now() - last > 90) { last = Date.now(); renderLog(); } }
				else if (p.t === "think") { am.thinking = true; renderLog(); }
				else if (p.t === "done") { am.stop = p.stop; am.pending = false; }
				else if (p.t === "error") { am.error = p.msg; am.pending = false; am.retryId = p.retry ? id : null; }
			});
		}).catch(function () { am.error = "The connection broke before the answer finished."; am.retryId = id; }).then(function () {
			am.pending = false;
			if (!am.error && !am.content) { am.error = "No answer came back."; am.retryId = id; }
			if (am.error && am.content) am.content += "\n\n*(cut off)*";
			am.acct = acct;
			save(); renderLog();
		});
	}
	function retry(i) {
		if (busy) return;
		var c = cur(), am = c.msgs[i]; if (!am || !am.retryId) return;
		var id = am.retryId, acct = (c.msgs[i - 1] && c.msgs[i - 1].acct) || (who() || {}).name;
		am.error = null; am.retryId = null; am.content = ""; am.pending = true; am.stop = null;
		setBusy(true); renderLog();
		answer(c, am, id, acct).then(function () { setBusy(false); });
	}

	/* ---------- pictures ---------- */
	var db = null;
	function idb() {
		if (db) return db;
		db = new Promise(function (res, rej) {
			var o = indexedDB.open("mes-ai", 1);
			o.onupgradeneeded = function () { o.result.createObjectStore("img"); };
			o.onsuccess = function () { res(o.result); }; o.onerror = function () { rej(o.error); };
		});
		return db;
	}
	function idbDo(mode, fn) { return idb().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("img", mode), s = t.objectStore("img"), r = fn(s); t.oncomplete = function () { res(r && r.result); }; t.onerror = function () { rej(t.error); }; }); }); }
	function imgList() { try { return JSON.parse(localStorage.getItem(LS_IMG) || "[]"); } catch (e) { return []; } }
	function imgSave(l) { try { localStorage.setItem(LS_IMG, JSON.stringify(l)); } catch (e) {} }
	var urls = {};
	function paintGal() {
		var l = imgList(), g = $("ai-gal");
		if (!l.length) { g.innerHTML = ""; return; }
		g.innerHTML = l.map(function (it) {
			return '<figure class="ai-fig" data-id="' + it.id + '"><div class="ai-figimg"><img alt="' + esc(it.prompt) + '" data-k="' + it.id + '"></div><figcaption>' + esc(it.prompt.slice(0, 140)) + '<span class="ai-sub"> · ' + esc(it.price) + ' HBD</span></figcaption><div class="ai-macts"><button type="button" class="ai-mini" data-dl="' + it.id + '">Download</button><button type="button" class="ai-mini" data-again="' + it.id + '">Use this description</button><button type="button" class="ai-mini" data-rm="' + it.id + '">Delete</button></div></figure>';
		}).join("");
		g.querySelectorAll("img[data-k]").forEach(function (im) {
			var k = im.dataset.k;
			if (urls[k]) { im.src = urls[k]; return; }
			idbDo("readonly", function (s) { return s.get(k); }).then(function (blob) { if (blob) { urls[k] = URL.createObjectURL(blob); im.src = urls[k]; } });
		});
	}
	$("ai-gal").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		var l = imgList();
		if (b.dataset.dl) { var a = document.createElement("a"); a.href = urls[b.dataset.dl]; a.download = "mes-ai-" + b.dataset.dl + ".webp"; a.click(); }
		if (b.dataset.again) { var it = l.filter(function (x) { return x.id === b.dataset.again; })[0]; if (it) { $("ai-prompt").value = it.prompt; paintPrice(); $("ai-prompt").focus(); } }
		if (b.dataset.rm && confirm("Delete this picture from this browser?")) { var k = b.dataset.rm; idbDo("readwrite", function (s) { return s.delete(k); }); imgSave(l.filter(function (x) { return x.id !== k; })); paintGal(); }
	});
	function b64Blob(b64, mime) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }
	function mockImage(prompt, size) {
		var wh = size.split("x").map(Number), cv = document.createElement("canvas"); cv.width = wh[0] / 4; cv.height = wh[1] / 4;
		var x = cv.getContext("2d"), g = x.createLinearGradient(0, 0, cv.width, cv.height);
		g.addColorStop(0, "#5b3fd6"); g.addColorStop(1, "#0f766e"); x.fillStyle = g; x.fillRect(0, 0, cv.width, cv.height);
		x.fillStyle = "#fff"; x.font = "bold 14px sans-serif"; x.fillText("Simulated picture", 12, 24); x.font = "12px sans-serif"; x.fillText(prompt.slice(0, 40), 12, 44);
		return new Promise(function (res) { cv.toBlob(res, "image/webp", 0.85); });
	}
	var pendingImg = null; // {id, prompt, quality, size, price, acct} when a picture failed after payment
	$("ai-make").addEventListener("click", function () { makeImage(false); });
	function makeImage(isRetry) {
		if (busy) return;
		var u = who();
		var prompt = $("ai-prompt").value.trim(), quality = $("ai-q").value, size = $("ai-size").value, imod = S.imod;
		if (!status.image || !provOn(A.IMAGES[imod].prov)) { msg(A.IMAGES[imod].name + " pictures are coming soon.", "err"); return; }
		if (!u) { msg("Log in with your Hive account first (above).", "err"); return; }
		var err = isRetry ? null : A.checkImage(prompt, quality, size, imod);
		if (err) { msg(err, "err"); return; }
		setBusy(true);
		var job = isRetry ? Promise.resolve(pendingImg) : quote({ acct: u.name, kind: "image", model: imod, prompt: prompt, quality: quality, size: size }).then(function (q) {
			if (q.status !== 200) throw new Error(q.error || "Could not get a price (HTTP " + q.status + ").");
			msg("Price: " + q.price + " HBD (" + A.fmtUsd(q.usd) + "). Confirm the payment in Hive Keychain…");
			return pay(q).then(function () { return { id: q.id, model: imod, prompt: prompt, quality: quality, size: size, price: q.price, acct: u.name }; });
		});
		job.then(function (j) {
			pendingImg = null;
			msg("Paid. Making the picture (this takes up to a minute)…");
			if (mock) {
				var info = MOCK_Q[j.id]; info.tries++;
				if (/fail/i.test(j.prompt) && info.tries === 1) return { j: j, err: { msg: "Simulated failure after payment.", retry: true } };
				return sleep(1200).then(function () { return mockImage(j.prompt, j.size); }).then(function (blob) { return { j: j, blob: blob }; });
			}
			return runReq(j.id, j.acct, function (n) { msg("Waiting for the blockchain… (" + n * 3 + " s)"); }).then(function (r) {
				if (r.error) return { j: j, err: { msg: r.error.error, retry: r.error.retry } };
				return jsonOf(r).then(function (d) { return d.t === "image" ? { j: j, blob: b64Blob(d.b64, d.mime) } : { j: j, err: { msg: d.msg || d.error, retry: d.retry } }; });
			});
		}).then(function (out) {
			if (!out) return;
			if (out.err) {
				if (out.err.retry) { pendingImg = out.j; msg(out.err.msg + " ", "err"); addRetryImg(); }
				else msg(out.err.msg || "The picture failed.", "err");
				return;
			}
			var key = out.j.id;
			return idbDo("readwrite", function (s) { return s.put(out.blob, key); }).then(function () {
				var l = imgList(); l.unshift({ id: key, model: out.j.model, prompt: out.j.prompt, quality: out.j.quality, size: out.j.size, price: out.j.price, at: Date.now() }); imgSave(l.slice(0, 200));
				msg("Done. The picture is below (kept in this browser).", "ok"); paintGal();
			});
		}).catch(function (e) {
			var m = e && e.message || String(e);
			msg(/cancel|declin|denied/i.test(m) ? "Payment cancelled: nothing was sent." : m, "err");
		}).then(function () { setBusy(false); });
	}
	function addRetryImg() {
		var b = document.createElement("button"); b.type = "button"; b.className = "tu-btn tu-btn--primary"; b.textContent = "Try again (free)";
		b.addEventListener("click", function () { makeImage(true); });
		$("ai-msg").appendChild(b);
	}

	/* ---------- videos (Grok Imagine): pay, start a job, follow it every 5 s, fetch the file into IndexedDB ---------- */
	var V = A.VIDEO, LS_VJ = "mes-ai:vjobs", LS_VID = "mes-ai:vids";
	$("ai-vmodel").innerHTML = Object.keys(V.models).map(function (k) { return '<option value="' + k + '">' + esc(V.models[k].name) + "</option>"; }).join("");
	$("ai-vmodel").value = "lite";
	$("ai-vsec").innerHTML = V.durations.map(function (d) { return '<option value="' + d + '"' + (d === 5 ? " selected" : "") + ">" + d + " seconds</option>"; }).join("");
	function paintVres() {
		var m = V.models[$("ai-vmodel").value], cur = $("ai-vres").value || "480p", max = V.res.indexOf(m.maxRes);
		$("ai-vres").innerHTML = V.res.filter(function (r, i) { return i <= max; }).map(function (r) { return '<option value="' + r + '">' + r + "</option>"; }).join("");
		$("ai-vres").value = V.res.indexOf(cur) <= max ? cur : "480p";
	}
	paintVres();
	function vq() { return A.videoQuote($("ai-vmodel").value, +$("ai-vsec").value, $("ai-vres").value); }
	function paintVprice() {
		var q = vq();
		$("ai-vprice").innerHTML = "<b>" + q.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(q) + ")</span>";
		$("ai-vmake").disabled = !(status.video && !busy);
		$("ai-vmake").textContent = status.video ? "Pay & create" : "Coming soon";
	}
	$("ai-vmodel").addEventListener("change", function () { paintVres(); paintVprice(); });
	["ai-vsec", "ai-vres"].forEach(function (id) { $(id).addEventListener("change", paintVprice); });
	function vjobs() { try { return JSON.parse(localStorage.getItem(LS_VJ) || "[]"); } catch (e) { return []; } }
	function vjobsSave(l) { try { localStorage.setItem(LS_VJ, JSON.stringify(l)); } catch (e) {} }
	function vids() { try { return JSON.parse(localStorage.getItem(LS_VID) || "[]"); } catch (e) { return []; } }
	function vidsSave(l) { try { localStorage.setItem(LS_VID, JSON.stringify(l)); } catch (e) {} }
	function paintVjobs() {
		var l = vjobs();
		$("ai-vjobs").innerHTML = l.map(function (j) {
			var mins = Math.max(0, Math.round((Date.now() - j.at) / 60000));
			return '<div class="ai-vjob' + (j.err ? " ai-vjob--err" : "") + '"><b>' + (j.err ? "⚠ " : "⏳ ") + esc(j.prompt.slice(0, 90)) + '</b><span class="ai-sub"> · ' + esc(j.price) + " HBD · " +
				(j.err ? esc(j.err) : j.dl ? "downloading…" : "being made (" + mins + " min so far)") + "</span>" +
				(j.retry ? ' <button type="button" class="tu-btn tu-btn--primary" data-vretry="' + j.id + '">Try again (free)</button>' : "") +
				(j.err ? ' <button type="button" class="ai-mini" data-vdrop="' + j.id + '">Remove</button>' : "") + "</div>";
		}).join("");
	}
	var vurls = {};
	function paintVgal() {
		var l = vids(), g = $("ai-vgal");
		g.innerHTML = l.map(function (it) {
			return '<figure class="ai-fig"><div class="ai-figimg"><video controls playsinline preload="metadata" data-k="' + it.id + '"></video></div><figcaption>' + esc(it.prompt.slice(0, 140)) + '<span class="ai-sub"> · ' + esc(it.seconds + " s · " + it.res + " · " + it.price) + ' HBD</span></figcaption><div class="ai-macts"><button type="button" class="ai-mini" data-vdl="' + it.id + '">Download</button><button type="button" class="ai-mini" data-vagain="' + it.id + '">Use this description</button><button type="button" class="ai-mini" data-vrm="' + it.id + '">Delete</button></div></figure>';
		}).join("");
		g.querySelectorAll("video[data-k]").forEach(function (v) {
			var k = v.dataset.k;
			if (vurls[k]) { v.src = vurls[k]; return; }
			idbDo("readonly", function (s) { return s.get("v:" + k); }).then(function (blob) { if (blob) { vurls[k] = URL.createObjectURL(blob); v.src = vurls[k]; } });
		});
	}
	function mockVideo(prompt) {
		var cv = document.createElement("canvas"); cv.width = 320; cv.height = 180;
		var x = cv.getContext("2d"), st = cv.captureStream ? cv.captureStream(24) : null;
		if (!st || !window.MediaRecorder) return Promise.resolve(new Blob(["fake"], { type: "video/webm" }));
		var rec = new MediaRecorder(st, { mimeType: "video/webm" }), parts = [], t0 = performance.now();
		rec.ondataavailable = function (e) { parts.push(e.data); };
		return new Promise(function (res) {
			rec.onstop = function () { res(new Blob(parts, { type: "video/webm" })); };
			rec.start();
			(function draw() {
				var t = (performance.now() - t0) / 1000;
				x.fillStyle = "#3730a3"; x.fillRect(0, 0, 320, 180); x.fillStyle = "#fbbf24"; x.beginPath(); x.arc(40 + t * 110, 90, 22, 0, 7); x.fill();
				x.fillStyle = "#fff"; x.font = "bold 14px sans-serif"; x.fillText("Simulated video", 10, 20); x.font = "12px sans-serif"; x.fillText(prompt.slice(0, 40), 10, 168);
				if (t < 2) requestAnimationFrame(draw); else rec.stop();
			})();
		});
	}
	var MOCK_V = {};
	function vstatusReq(j) {
		if (mock) {
			var m = MOCK_V[j.id] || (MOCK_V[j.id] = { polls: 0 }); m.polls++;
			if (/fail/i.test(j.prompt) && !j.retried && m.polls > 1) return Promise.resolve({ status: "failed", retry: true, msg: "Simulated failure." });
			return Promise.resolve(m.polls > 2 ? { status: "done" } : { status: "pending" });
		}
		return post({ op: "vstatus", id: j.id, acct: j.acct }).then(jsonOf);
	}
	function vfetch(j) {
		if (mock) return mockVideo(j.prompt);
		return fetch("/api/ai?op=vfile&id=" + encodeURIComponent(j.id) + "&acct=" + encodeURIComponent(j.acct), { credentials: "omit" }).then(function (r) {
			if (!r.ok) return jsonOf(r).then(function (e) { throw new Error(e.error || "Could not download the video."); });
			return r.blob();
		});
	}
	var vtimer = null;
	function vpoll() {
		clearTimeout(vtimer);
		var l = vjobs().filter(function (j) { return !j.err && !j.dl; });
		paintVjobs();
		if (!l.length) return;
		Promise.all(l.map(function (j) {
			return vstatusReq(j).then(function (s) {
				var all = vjobs(), me = all.filter(function (x) { return x.id === j.id; })[0]; if (!me) return;
				if (s.status === "done") {
					me.dl = true; vjobsSave(all); paintVjobs();
					return vfetch(me).then(function (blob) {
						return idbDo("readwrite", function (st) { return st.put(blob, "v:" + me.id); }).then(function () {
							var v = vids(); v.unshift({ id: me.id, prompt: me.prompt, seconds: me.seconds, res: me.res, price: me.price, at: Date.now() }); vidsSave(v.slice(0, 100));
							vjobsSave(vjobs().filter(function (x) { return x.id !== me.id; })); paintVgal(); msg("Your video is ready (kept in this browser).", "ok");
						});
					}).catch(function (e) { var a = vjobs(), m2 = a.filter(function (x) { return x.id === me.id; })[0]; if (m2) { m2.dl = false; m2.err = e.message; vjobsSave(a); } });
				}
				if (s.status === "failed") { me.err = s.msg || "The video failed."; me.retry = !!s.retry; vjobsSave(all); }
				if (s.error) { me.err = s.error; vjobsSave(all); }
			}).catch(function () { /* network blip: next round */ });
		})).then(function () { paintVjobs(); if (vjobs().some(function (j) { return !j.err && !j.dl; })) vtimer = setTimeout(vpoll, mock ? 1500 : 5000); });
	}
	function startVideo(j, isRetry) {
		var go = mock ? Promise.resolve({ t: "video" }) : runReq(j.id, j.acct, function (n) { msg("Waiting for the blockchain… (" + n * 3 + " s)"); }).then(function (r) { return r.error ? { err: r.error } : jsonOf(r); });
		return go.then(function (d) {
			if (d.err || d.t !== "video") { var e = d.err || d; j.err = e.error || e.msg || "The video could not start."; j.retry = !!e.retry; }
			else { j.err = null; j.retry = false; j.at = Date.now(); if (isRetry) j.retried = true; msg("Paid. Your video is being made: it takes a few minutes.", "ok"); }
			var l = vjobs().filter(function (x) { return x.id !== j.id; }); l.unshift(j); vjobsSave(l); vpoll();
		});
	}
	$("ai-vmake").addEventListener("click", function () {
		if (busy) return;
		var u = who(), prompt = $("ai-vprompt").value.trim(), model = $("ai-vmodel").value, sec = +$("ai-vsec").value, res = $("ai-vres").value, audio = $("ai-vaudio").checked;
		if (!status.video) { msg("Videos are coming soon.", "err"); return; }
		if (!u) { msg("Log in with your Hive account first (above).", "err"); return; }
		var err = A.checkVideo(prompt, model, sec, res); if (err) { msg(err, "err"); return; }
		setBusy(true);
		var qreq = mock ? Promise.resolve((function () { var q = A.videoQuote(model, sec, res), id = A.newId(); return { status: 200, id: id, memo: A.memoFor(id), price: q.price, usd: q.hbd }; })())
			: quote({ acct: u.name, kind: "video", prompt: prompt, model: model, seconds: sec, res: res, audio: audio });
		qreq.then(function (q) {
			if (q.status !== 200) throw new Error(q.error || "Could not get a price (HTTP " + q.status + ").");
			msg("Price: " + q.price + " HBD (" + A.fmtUsd(q.usd) + "). Confirm the payment in Hive Keychain…");
			return pay(q).then(function () { return startVideo({ id: q.id, acct: u.name, prompt: prompt, seconds: sec, res: res, price: q.price, at: Date.now() }, false); });
		}).catch(function (e) { var m = e && e.message || String(e); msg(/cancel|declin|denied/i.test(m) ? "Payment cancelled: nothing was sent." : m, "err"); })
			.then(function () { setBusy(false); });
	});
	$("ai-vid").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.vretry) { var j = vjobs().filter(function (x) { return x.id === b.dataset.vretry; })[0]; if (j) { if (mock) MOCK_V[j.id] = { polls: 0 }; startVideo(j, true); } }
		if (b.dataset.vdrop) { vjobsSave(vjobs().filter(function (x) { return x.id !== b.dataset.vdrop; })); paintVjobs(); }
		if (b.dataset.vdl) { var a = document.createElement("a"); a.href = vurls[b.dataset.vdl]; a.download = "mes-ai-" + b.dataset.vdl + (mock ? ".webm" : ".mp4"); a.click(); }
		if (b.dataset.vagain) { var it = vids().filter(function (x) { return x.id === b.dataset.vagain; })[0]; if (it) { $("ai-vprompt").value = it.prompt; $("ai-vprompt").focus(); } }
		if (b.dataset.vrm && confirm("Delete this video from this browser?")) { var k = b.dataset.vrm; idbDo("readwrite", function (s) { return s.delete("v:" + k); }); vidsSave(vids().filter(function (x) { return x.id !== k; })); paintVgal(); }
	});

	/* ---------- 💾 saving: cloud file (MESCloud), Hive backup (MESHiveStore), file backup ---------- */
	function sig() { return S.chats.map(function (c) { return c.id + ":" + c.msgs.filter(function (m) { return !m.pending; }).length + ":" + c.at; }).join("|"); }
	function mergeIn(chats, how) {
		var r = A.mergeChats(S.chats, chats);
		S.chats = r.chats; if (!S.chats.some(function (c) { return c.id === S.cur; })) S.cur = S.chats[0] ? S.chats[0].id : null;
		save(); renderLog(); paintPrice();
		return (how ? how + ": " : "") + (r.added || r.updated ? r.added + " new chat" + (r.added === 1 ? "" : "s") + (r.updated ? ", " + r.updated + " updated" : "") + "." : "you already had all of them.");
	}
	$("ai-export").addEventListener("click", function () { var d = $("ai-save"); d.open = true; d.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
	function download(name, text, type) {
		var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
	}
	$("ai-dl-md").addEventListener("click", function () {
		var c = A.cleanChat(cur()); if (!c || !c.msgs.length) { msg("This chat is empty.", "err"); return; }
		download((c.title.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") || "chat") + ".md", A.chatMarkdown(c), "text/markdown");
	});
	$("ai-open-text").addEventListener("click", function () {
		var c = A.cleanChat(cur()); if (!c || !c.msgs.length) { msg("This chat is empty.", "err"); return; }
		var name = (c.title.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") || "chat") + ".md";
		var f = new File([A.chatMarkdown(c)], name, { type: "text/markdown" });
		if (!window.MESLinkOpen) { download(name, A.chatMarkdown(c), "text/markdown"); return; }
		window.MESLinkOpen.sendTo("text", f, { busy: true }).catch(function (e) { msg("Could not open it: " + e.message, "err"); });
	});
	$("ai-dl-all").addEventListener("click", function () {
		var b = A.backup(S.chats); if (!b.chats.length) { msg("No chats to back up yet.", "err"); return; }
		download("MES AI chats " + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(b, null, 1), "application/json");
	});
	$("ai-restore").addEventListener("change", function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		f.text().then(function (t) { msg(mergeIn(A.readBackup(t), "Restored"), "ok"); }).catch(function (e) { msg(e.message, "err"); });
	});

	// cloud: one file with every chat; auto-saved a few seconds after each change (MESCloud.changed)
	var cdoc = { name: "MES AI chats.json" }, cloudSig = null, CKEY = "mes-ai:cloud";
	function cloudKeep() {
		var l = cloud && cloud.link(cdoc);
		try { if (!l) localStorage.removeItem(CKEY); else localStorage.setItem(CKEY, JSON.stringify({ p: l.p, ref: l.p === "file" ? null : l.ref, hid: l.hid || null, name: l.name, ver: l.ver, dir: l.dir })); } catch (e) { /* ignore */ }
	}
	var cloud = window.MESCloud ? window.MESCloud.attach({
		app: "ai", folder: "MES Apps/AI", what: "chats file", title: "MES AI", defExt: "json", btnClass: "tu-btn tu-btn--ghost", mount: $("ai-cloudrow"), replaces: true,
		toast: function (t) { msg(t, "ok"); },
		exts: [".json"], accept: [{ description: "MES AI chats", accept: { "application/json": [".json"] } }],
		doc: function () { return cdoc; },
		name: function (d) { return d.name || "MES AI chats.json"; },
		bytes: function () { return Promise.resolve(new TextEncoder().encode(JSON.stringify(A.backup(S.chats)))); },
		open: function (u8, name) {
			var chats = A.readBackup(new TextDecoder().decode(u8));
			var note = mergeIn(chats, "From " + name);
			cdoc = { name: name }; cloudSig = null;      // our merged copy differs from the file: the next save writes it back
			setTimeout(function () { cloudKeep(); paintSaveState(); msg(note, "ok"); if (cloud) cloud.changed(cdoc); }, 0);
			return cdoc;
		},
		dirty: function () { return cloudSig !== sig(); },
		markDirty: function () { cloudSig = null; },
		saved: function (d, name) { d.name = name; cloudSig = sig(); cloudKeep(); paintSaveState(); }
	}) : null;
	(function () { // a cloud link survives a reload
		var k = null; try { k = JSON.parse(localStorage.getItem(CKEY) || "null"); } catch (e) { /* ignore */ }
		if (!k || !cloud) return;
		function put(ref) { cdoc = { name: k.name, __mcl: { p: k.p, ref: ref, name: k.name, ver: k.ver, at: Date.now(), hid: k.hid || undefined, dir: k.dir } }; cloudSig = sig(); cloud.refresh(); paintSaveState(); }
		if (k.p !== "file") return put(k.ref);
		if (!k.hid || !window.indexedDB) return;
		var q = indexedDB.open("mes-cloud", 1);
		q.onupgradeneeded = function () { q.result.createObjectStore("h"); };
		q.onsuccess = function () { try { var r = q.result.transaction("h").objectStore("h").get(k.hid); r.onsuccess = function () { if (r.result) { r.result.__mclId = k.hid; put(r.result); } }; } catch (e) { /* ignore */ } };
	})();
	if (!cloud) $("ai-cloudrow").innerHTML = '<p class="tu-note">The cloud script did not load. Reload the page to try again.</p>';
	var saveRaw = save;
	save = function () { saveRaw(); if (cloud && cloud.linked(cdoc)) { cloud.changed(cdoc); paintSaveState(); } };
	function paintSaveState() {
		var l = cloud && cloud.link(cdoc);
		$("ai-savestate").textContent = l ? "· ☁ " + (cloudSig === sig() ? "saved to " : "saving to ") + (l.p === "file" ? l.name : (cloud.providers[l.p] ? cloud.providers[l.p].name : l.p)) : "";
	}

	// Hive: custom_json "mes_store", app "mes-ai", name "chat" (one chat) or "all"; encrypted by default ("mes-ai:hiveenc" "0" = off)
	var HAPP = "mes-ai", ENC = "mes-ai:hiveenc", hvList = null, hvBusy = false;
	function HS() { return window.MESHiveStore; }
	function hmsg(t, cls) { var m = $("ai-hv-msg"); m.textContent = t || ""; m.className = "tu-note ai-hvmsg" + (cls ? " is-" + cls : ""); }
	function hvErr(e) { return e && e.code === "cancel" ? "Cancelled." : e && e.code === "toobig" ? "Too big for one Hive save (about 150 KB packed). Save one chat at a time, or use the cloud." : (e && e.message) || "Something went wrong."; }
	function hvKb(n) { return n < 1024 ? n + " bytes" : (n / 1024).toFixed(1) + " KB"; }
	function hvWhen(t) { var d = new Date(/Z$/.test(t) ? t : t + "Z"); return isNaN(d) ? t : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
	function paintHvWarn() {
		var w = $("ai-hv-warn"), enc = $("ai-hv-enc").checked;
		if (HS() && HS().canEncrypt && !HS().canEncrypt() && !(HS().lockMode && HS().lockMode() === "pass")) w.innerHTML = "⚠ <b>Logged in with the Keychain phone app:</b> it can't use your memo key, so pick <b>🛡 Passphrase</b> under the Encrypt tick, or the save would be public.";
		else w.innerHTML = enc ? (HS() && HS().lockMode && HS().lockMode() === "pass" ? "🛡 Locked with your passphrase (quantum-safe): only the passphrase opens it." : "🔒 Encrypted with your memo key: only you can open it.") + " Others can see that a backup exists, when, and its size."
			: "⚠ <b>Public:</b> the chat text will be readable by anyone on the Hive blockchain, forever.";
		w.className = "ai-hvwarn" + (enc ? "" : " is-open");
	}
	function hvReady() {
		if (mock) { hmsg("Local preview: Hive saving is switched off here (no real Keychain).", "err"); return null; }
		if (!HS() || !H) { hmsg("The Hive scripts did not load. Reload the page.", "err"); return null; }
		var u = H.user(); if (!u) { hmsg("Log in with Hive Keychain first (at the top of the page).", "err"); $("ai-acct-card").scrollIntoView({ block: "center" }); return null; }
		return u;
	}
	function hvBusySet(b) { hvBusy = b; $("ai-hv-save").disabled = b; $("ai-hv-load").disabled = b; }
	$("ai-hv-enc").checked = (function () { try { return localStorage.getItem(ENC) !== "0"; } catch (e) { return true; } })();
	$("ai-hv-enc").addEventListener("change", function () { try { localStorage.setItem(ENC, this.checked ? "1" : "0"); } catch (e) {} paintHvWarn(); });
	if (HS() && HS().encModeUI) HS().encModeUI($("ai-hv-enc"), paintHvWarn);
	paintHvWarn();
	$("ai-hv-save").addEventListener("click", function () {
		if (hvBusy) return;
		var u = hvReady(); if (!u) return;
		var one = $("ai-hv-what").value === "chat", b = A.backup(one ? [cur()] : S.chats);
		if (!b.chats.length) { hmsg(one ? "This chat is empty." : "No chats to save yet.", "err"); return; }
		var enc = $("ai-hv-enc").checked;
		if (!enc && !confirm("Save WITHOUT encryption?\n\nThe chat text will be public on the Hive blockchain, readable by anyone, and can never be deleted.")) return;
		hvBusySet(true);
		HS().save(HAPP, one ? "chat" : "all", b, { encrypt: enc, onProgress: function (m) { hmsg(m); } }).then(function (r) {
			hmsg("Saved " + (one ? "this chat" : b.chats.length + " chats") + " to @" + u.name + " on Hive (" + hvKb(r.bytes) + (enc ? ", encrypted" : ", public") + ").", "ok");
			hvList = null; setTimeout(function () { hvLoad(true); }, 4000);
		}).catch(function (e) { hmsg(hvErr(e), "err"); }).then(function () { hvBusySet(false); });
	});
	function hvLoad(quiet) {
		var u = hvReady(); if (!u || (hvBusy && !quiet)) return;
		hvBusySet(true); if (!quiet) hmsg("Looking for your saves on Hive…");
		HS().list(u.name, { app: HAPP, pages: 30 }).then(function (saves) {
			hvList = saves.filter(function (e) { return e.name === "chat" || e.name === "all"; }).slice(0, 15);
			$("ai-hv-list").innerHTML = hvList.length ? '<ul class="ai-hvl">' + hvList.map(function (e, i) {
				return "<li><span><b>" + esc(hvWhen(e.time)) + "</b> <span class=\"ai-sub\">" + (e.name === "chat" ? "One chat" : "All chats") + " · " + esc(HS().lockLabel ? HS().lockLabel(e) : (e.encrypted ? "encrypted" : "public")) + " · " + hvKb(e.bytes) + (e.complete ? "" : " · incomplete") + "</span></span>" +
					(e.complete ? '<button type="button" class="tu-btn tu-btn--ghost" data-hv="' + i + '">Add to my chats</button>' : "") + "</li>";
			}).join("") + "</ul>" : "";
			if (!quiet) hmsg(hvList.length ? "Pick a save to add its chats to yours." : "No MES AI saves found on @" + u.name + " yet.", hvList.length ? "" : "err");
		}).catch(function (e) { hmsg("Could not read from Hive: " + hvErr(e), "err"); }).then(function () { hvBusySet(false); });
	}
	$("ai-hv-load").addEventListener("click", function () { hvLoad(false); });
	$("ai-hv-list").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hv]"); if (!b || hvBusy) return;
		var it = hvList[+b.dataset.hv]; hvBusySet(true);
		hmsg(it.lock === "pass" ? "Unlocking with your passphrase…" : it.encrypted ? "Confirm in Keychain: decrypt with your memo key…" : "Opening the save…");
		HS().load(it).then(function (d) { hmsg(mergeIn(A.readBackup(d), "Loaded from Hive"), "ok"); }).catch(function (x) { hmsg(hvErr(x), "err"); }).then(function () { hvBusySet(false); });
	});

	/* ---------- tabs ---------- */
	function showTab(t) {
		S.tab = t; save();
		$("ai-tab-chat").setAttribute("aria-selected", t === "chat"); $("ai-tab-img").setAttribute("aria-selected", t === "img"); $("ai-tab-vid").setAttribute("aria-selected", t === "vid");
		$("ai-chat").hidden = t !== "chat"; $("ai-img").hidden = t !== "img"; $("ai-vid").hidden = t !== "vid";
		if (t === "img") paintGal();
		if (t === "vid") { paintVgal(); paintVjobs(); }
	}
	$("ai-tab-chat").addEventListener("click", function () { showTab("chat"); });
	$("ai-tab-img").addEventListener("click", function () { showTab("img"); });
	$("ai-tab-vid").addEventListener("click", function () { showTab("vid"); });

	/* ---------- switched on? ---------- */
	function paintOff() {
		var o = $("ai-off");
		// a service whose key is not set yet: "Coming soon" on its tab, a note in its panel, and its button off
		[["ai-tab-img", "ai-img", status.image, "🖼️ Picture", "Pictures"], ["ai-tab-vid", "ai-vid", status.video, "🎬 Video", "Videos"]].forEach(function (x) {
			var soon = status.known && !x[2];
			$(x[0]).innerHTML = x[3] + (soon ? ' <span class="ai-soon-tag">soon</span>' : "");
			var n = $(x[1]).querySelector(".ai-soon");
			if (soon && !n) { n = document.createElement("p"); n.className = "ai-soon"; n.innerHTML = "<b>" + x[4] + " are coming soon.</b> The page is ready; this AI service is being connected. Chat works now."; $(x[1]).insertBefore(n, $(x[1]).firstChild); }
			if (!soon && n) n.remove();
		});
		var off = status.known && !status.chat;
		o.hidden = !off;
		if (!off) return;
		o.innerHTML = '<b>MES AI is coming soon.</b> The page is ready; the AI services are being connected. <a href="?mock=1">Try the demo</a> (simulated payment and answer).';
	}
	if (!mock) {
		fetch("/api/ai?op=status", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) {
			status = { chat: !!j.chat, image: !!j.image, video: !!j.video, known: true, prov: j.prov || { anthropic: !!j.chat, openai: !!j.image, xai: !!j.video } }; fillModels(); paintOff(); paintPrice();
		}).catch(function () { status = { chat: false, image: false, video: false, known: true, prov: {} }; fillModels(); paintOff(); paintPrice(); });
	}

	/* ---------- Fill window for the chat ---------- */
	function addPanel() { if (window.MESPanel) window.MESPanel.add($("ai-chat"), { bar: $("ai-chatbar") }); }
	if (window.MESPanel) addPanel(); else window.addEventListener("load", addPanel);

	if (H && H.onChange) H.onChange(function () { paintAcct(); });
	paintAcct(); renderLog(); showTab(S.tab); paintOff(); paintPrice(); vjobsSave(vjobs().map(function (j) { j.dl = false; return j; })); vpoll();
	window.MESAIDebug = { S: S, status: status, send: send, mock: mock };
})();
