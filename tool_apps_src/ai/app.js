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
	// translations: language pages set window.AI_I18N = {code, name, locale, dir, s: {"English": "translation"}} before this script
	var L = window.AI_I18N || null, LANG = (L && L.code) || "en", LOC = (L && L.locale) || "en-US";
	function T(s, v) { var t = L && L.s && L.s[s]; if (typeof t !== "string" || !t) t = s; return v ? t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : t; }
	var LS = "mes-ai:v1", LS_IMG = "mes-ai:imgs";
	var mock = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1\b/.test(location.search);
	var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
	var status = { chat: mock, image: mock, video: mock, known: mock, prov: { anthropic: true, openai: true, xai: true, openrouter: true } };
	if (mock && /[?&]soon=1\b/.test(location.search)) { status.image = false; status.video = false; status.prov = { anthropic: true, openai: false, xai: false }; }
	// is this company's key set? (unknown until the status call answers: then everything shows as on)
	function provOn(p) { return !status.known || !status.prov || !!status.prov[p]; }
	var busy = false;
	// free daily messages (A.FREE): on / left come from /api/ai?op=free&acct=; in the local preview a counter in localStorage
	var FREEST = { on: mock, perDay: A.FREE.perDay, left: null };

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
	function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { msg(T("This browser's storage is full: old chats could not be saved. Delete some."), "err"); } }
	function newChat() { var c = { id: A.newId(), title: T("New chat"), at: Date.now(), msgs: [] }; S.chats.unshift(c); S.cur = c.id; save(); return c; }
	function cur() { var c = S.chats.filter(function (x) { return x.id === S.cur; })[0]; return c || (S.chats[0] ? (S.cur = S.chats[0].id, S.chats[0]) : newChat()); }

	function msg(t, kind) { var m = $("ai-msg"); m.hidden = !t; m.textContent = t || ""; m.className = "tu-card ai-msg" + (kind ? " " + kind : ""); }

	/* ---------- the "You pay per message" box can be hidden (mes-ai:payhide = "1"); "About paying" by the tabs brings it back ---------- */
	(function () {
		var K = "mes-ai:payhide";
		function paint(h) { $("ai-pay").hidden = h; $("ai-payshow").hidden = !h; }
		paint((function () { try { return localStorage.getItem(K) === "1"; } catch (e) { return false; } })());
		$("ai-payhide").addEventListener("click", function () { try { localStorage.setItem(K, "1"); } catch (e) {} paint(true); $("ai-payshow").focus(); });
		$("ai-payshow").addEventListener("click", function () { try { localStorage.removeItem(K); } catch (e) {} paint(false); $("ai-pay").scrollIntoView({ block: "nearest", behavior: "smooth" }); $("ai-payhide").focus(); });
	})();

	/* ---------- account ---------- */
	var MOCK_USER = { name: "demo" };
	function who() { return mock ? MOCK_USER : (H && H.user()); }
	function paintAcct() {
		var u = who(), a = $("ai-acct");
		if (mock) { a.innerHTML = '<p class="ai-demo">' + T("<b>Local preview:</b> payments and answers are simulated (account @demo, no HBD moves).") + '</p>'; $("ai-help").innerHTML = ""; return; }
		if (!H) { a.innerHTML = "<p>" + T("The Hive login could not load. Reload the page.") + "</p>"; return; }
		if (u) {
			a.innerHTML = '<div class="ai-user"><img src="' + esc(H.avatar(u.name)) + '" alt="" width="32" height="32"><span>' + T("Paying as {who}", { who: '<a href="' + esc(H.peakd(u.name) + "/wallet") + '" target="_blank" rel="noopener">@' + esc(u.name) + '</a>' }) + '</span><span class="ai-sw"></span><button type="button" class="tu-btn tu-btn--ghost" data-a="logout">' + T("Log out") + '</button></div>';
			$("ai-help").innerHTML = "";
			addSwitcher();
		} else {
			a.innerHTML = '<div class="ai-loginrow"><label class="tu-label" for="ai-user">' + T("Your Hive username") + '</label><input id="ai-user" class="tu-input" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="' + esc(T("e.g. mes")) + '">' +
				'<button type="button" class="tu-btn tu-btn--primary" data-a="login">' + T("Log in with Keychain") + '</button></div>';
			if (H.accounts && H.accounts().length) { a.querySelector(".ai-loginrow").insertAdjacentHTML("beforeend", '<span class="ai-sw"></span>'); addSwitcher(); }
			$("ai-user").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
			H.keychain(1500).then(function (k) { if (!k && !H.user()) $("ai-help").innerHTML = H.helpHtml(); });
		}
	}
	// "Switch account": the Hive accounts logged in on this browser (MESHive.switcher, shared by every Hive page)
	function addSwitcher() {
		var el = document.querySelector("#ai-acct .ai-sw");
		if (!el || !H.switcher) return;
		H.switcher(el, { onSwitch: function (u) { msg(u ? T("Now paying as @{name}.", { name: u.name }) : T("Logged out."), "ok"); paintAcct(); paintPrice(); }, onError: function (e) { msg(e.message, "err"); } });
	}
	if (H && H.onChange && !mock) H.onChange(function () { paintAcct(); if (FREEST.on) loadFree(); paintPrice(); });
	function doLogin() {
		var inp = $("ai-user");
		msg(T("Confirm the login in Hive Keychain…"));
		H.login(inp ? inp.value : "").then(function (u) { msg(T("Logged in as @{name}.", { name: u.name }), "ok"); paintAcct(); paintPrice(); })
			.catch(function (e) { msg(T(e.message), "err"); if (e.code === "nokeychain") $("ai-help").innerHTML = H.helpHtml(); });
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
	// rich answers (rich.js): Markdown + LaTeX ($...$, $$...$$), tables you can filter / sort / resize, ```chart blocks, code Copy
	var R = window.MESAIRich;
	if (R) R.setT(T);
	function md(t) { return R ? R.render(String(t), mdReady, plainMd) : mdReady ? window.DOMPurify.sanitize(window.marked.parse(String(t), { gfm: true, breaks: false }), { ADD_ATTR: ["target"] }) : plainMd(t); }
	function addCopyButtons(el, m) {
		if (R) R.enhance(el, { pending: !!(m && m.pending) }, copy);
		linkify(el);
		el.querySelectorAll("a[href^='http']").forEach(function (a) { a.target = "_blank"; a.rel = "noopener nofollow"; });
	}
	// any web address left as plain text (in answers and in your own messages) becomes a link: https://..., www.x.com, mes.fm/page
	var LINK_RE = /(\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'`]*|\b(?:[a-z0-9-]+\.)*(?:mes\.fm|peakd\.com|hive\.blog|ecency\.com|inleo\.io|3speak\.tv|youtube\.com|youtu\.be|github\.com|wikipedia\.org)(?:\/[^\s<>"'`]*)?)/gi;
	function linkify(root) {
		var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
			for (var p = n.parentNode; p && p !== root; p = p.parentNode) if (/^(A|CODE|PRE|BUTTON|SCRIPT|STYLE)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
			LINK_RE.lastIndex = 0; return LINK_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		} }), list = [], n;
		while ((n = w.nextNode())) list.push(n);
		list.forEach(function (node) {
			var t = node.nodeValue, frag = document.createDocumentFragment(), last = 0, m;
			LINK_RE.lastIndex = 0;
			while ((m = LINK_RE.exec(t))) {
				var url = m[0], tail = "";
				while (/[.,;:!?)\]]$/.test(url) && !(url.slice(-1) === ")" && url.split("(").length >= url.split(")").length)) { tail = url.slice(-1) + tail; url = url.slice(0, -1); }
				if (!url) continue;
				frag.appendChild(document.createTextNode(t.slice(last, m.index)));
				var a = document.createElement("a");
				a.href = /^https?:/i.test(url) ? url : "https://" + url;
				a.textContent = url;
				frag.appendChild(a);
				if (tail) frag.appendChild(document.createTextNode(tail));
				last = m.index + m[0].length;
			}
			frag.appendChild(document.createTextNode(t.slice(last)));
			node.parentNode.replaceChild(frag, node);
		});
	}
	function copy(text, btn) {
		var done = function () { var o = btn.textContent; btn.textContent = T("Copied"); setTimeout(function () { btn.textContent = o; }, 1200); };
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
	function shrinkImage(file, max) {
		var MAX = max || 1568;
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
				if (PEND.length >= A.FILES.perMsg) { notes.push(T("At most {n} files in one message.", { n: A.FILES.perMsg })); return; }
				if (/^image\//.test(type)) {
					return shrinkImage(f).then(function (r) {
						if (pendChars() + r.data.length > A.FILES.total) { notes.push(T("{name}: too big together with the other files.", { name: name })); return; }
						PEND.push({ id: A.newId(), t: "img", mt: r.mt, name: name, data: r.data });
					}, function () { notes.push(T("{name}: this picture type can't be read here. Use JPEG or PNG.", { name: name })); });
				}
				if (type === "application/pdf" || /\.pdf$/i.test(name)) {
					return f.arrayBuffer().then(function (buf) {
						var d = b64(buf);
						if (pendChars() + d.length > A.FILES.total) { notes.push(T("{name}: too big (PDFs up to about {mb} MB together).", { name: name, mb: (Math.round(A.FILES.total * 0.75 / 1e6 * 10) / 10).toLocaleString(LOC) })); return; }
						PEND.push({ id: A.newId(), t: "pdf", mt: "application/pdf", name: name, data: d, pages: pdfPages(buf) });
					});
				}
				if (/^text\//.test(type) || TEXT_EXT.test(name) || /json|xml|javascript/.test(type)) {
					if (f.size > 200000) { notes.push(T("{name}: text files up to 200 KB.", { name: name })); return; }
					return f.text().then(function (t) {
						var inp = $("ai-in"), ext = (name.match(/\.(\w+)$/) || [, ""])[1].toLowerCase();
						inp.value = (inp.value.trim() ? inp.value.replace(/\s+$/, "") + "\n\n" : "") + name + ":\n```" + ext + "\n" + t.replace(/\s+$/, "") + "\n```\n";
					});
				}
				notes.push(T("{name}: only pictures, PDFs and text files can be added (save Word files as PDF).", { name: name }));
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
			return '<span class="ai-file">' + pic + '<span class="ai-fname" title="' + esc(f.name) + '">' + esc(f.name) + (f.pages ? " · " + (f.pages === 1 ? T("{n} page", { n: 1 }) : T("{n} pages", { n: f.pages })) : "") + '</span><button type="button" data-unfile="' + i + '" aria-label="' + T("Remove {name}", { name: esc(f.name) }) + '" title="' + esc(T("Remove")) + '">×</button></span>';
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
				if (!f) { im.replaceWith(Object.assign(document.createElement("span"), { className: "ai-sub", textContent: T("(picture not in this browser)") })); return; }
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
		if (mine && m.free) meta = '<span class="ai-meta">' + T("🎁 free") + " · " + esc(modelName(m.model)) + "</span>";
		else if (mine && m.price) meta = '<span class="ai-meta">' + esc(m.price) + " HBD · " + esc(modelName(m.model)) + " · " + esc(T(A.LENGTHS[m.len] || "")) + (m.memo ? ' · <a href="' + (mock ? "#" : "https://hivehub.dev/@" + esc(m.acct || "") + "/wallet") + '" target="_blank" rel="noopener" title="' + esc(T("Payment memo")) + '">' + esc(m.memo) + "</a>" : "") + "</span>";
		var mf = mine && m.files && m.files.length ? '<div class="ai-mfiles">' + m.files.map(function (f) {
			return f.t === "img" ? '<img data-fk="' + esc(f.id) + '" alt="' + esc(f.name || T("picture")) + '" title="' + esc(f.name || "") + '">' :
				'<span class="ai-file"><span class="ai-fic" aria-hidden="true">📄</span><span class="ai-fname">' + esc(f.name || "file.pdf") + (f.pages ? " · " + (f.pages === 1 ? T("{n} page", { n: 1 }) : T("{n} pages", { n: f.pages })) : "") + "</span></span>";
		}).join("") + "</div>" : "";
		var body = mine ? mf + (m.content ? '<div class="ai-text ai-plain">' + esc(m.content) + "</div>" : "") : '<div class="ai-text ai-md">' + (m.content ? md(m.content) : m.error ? "" : m.thinking ? '<p class="ai-thinking">' + T("Thinking…") + '</p>' : '<p class="ai-thinking">' + T("Waiting for the answer…") + '</p>') + "</div>";
		var foot = "";
		if (!mine) {
			if (m.stop === "max_tokens") foot += '<p class="ai-note">' + T('The answer reached the length you paid for. Send "continue" for more, or pick a longer answer.') + '</p>';
			if (m.stop === "refusal") foot += '<p class="ai-note">' + T("The AI declined to answer this.") + '</p>';
			if (m.error) foot += '<p class="ai-note ai-err">' + esc(T(m.error)) + "</p>" + (m.retryId ? '<button type="button" class="tu-btn tu-btn--primary" data-retry="' + i + '">' + T("Try again (free)") + '</button>' : "");
			if (m.content && !m.pending) foot += '<div class="ai-macts"><button type="button" class="ai-mini" data-copy="' + i + '">' + T("Copy answer") + '</button><span class="ai-openin">' + T("Open in:") +
				' <button type="button" class="ai-mini" data-open="text" data-oi="' + i + '" title="' + esc(T("Formatted, with Read aloud and Print to PDF")) + '">' + T("Text Viewer") + '</button>' +
				'<button type="button" class="ai-mini" data-open="docx" data-oi="' + i + '" title="' + esc(T("A Word document of this answer")) + '">' + T("Word") + '</button>' +
				'<button type="button" class="ai-mini" data-open="pdf" data-oi="' + i + '" title="' + esc(T("A PDF of this answer, with its equations and charts")) + '">PDF</button>' +
				(R && R.texList(m.content).length ? '<button type="button" class="ai-mini" data-open="latex" data-oi="' + i + '" title="' + esc(T("Open the equations in MES LaTeX Render")) + '">LaTeX</button>' : "") + "</span></div>";
		}
		return '<div class="ai-m ' + (mine ? "ai-m--me" : "ai-m--ai") + '" data-i="' + i + '"><div class="ai-who">' + (mine ? T("You") : "MES AI") + meta + "</div>" + body + foot + "</div>";
	}
	var elCache = new WeakMap();
	function msgKey(m, i) { return [i, m.role, (m.content || "").length, (m.content || "").slice(-24), m.pending ? 1 : 0, m.thinking ? 1 : 0, m.error || "", m.retryId || "", m.stop || "", m.price || "", (m.files || []).length, mdReady ? 1 : 0].join("\u0001"); }
	function msgEl(m, i) {
		var k = msgKey(m, i), c = elCache.get(m);
		if (c && c.k === k) return c.el;
		var d = document.createElement("div"); d.innerHTML = renderMsg(m, i);
		var el = d.firstChild; if (m.pending) el.setAttribute("data-pending", "1"); addCopyButtons(el, m); paintMsgFiles(el);
		elCache.set(m, { k: k, el: el });
		return el;
	}
	function renderLog() {
		var c = cur(), log = $("ai-log");
		var nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
		if (!c.msgs.length) {
			log.innerHTML = '<div class="ai-empty"><p>' + T("<b>Ask anything.</b> Each message is paid on its own; the price is next to the Send button.") + '</p><p class="ai-try">' + T("Try:") +
				' <button type="button" class="ai-mini" data-ex="' + esc(T("Explain recursion with a short JavaScript example.")) + '">' + T("Explain recursion") + '</button>' +
				' <button type="button" class="ai-mini" data-ex="' + esc(T("Write a polite email asking my landlord to fix the heating.")) + '">' + T("Write an email") + '</button>' +
				' <button type="button" class="ai-mini" data-ex="' + esc(T("What is the derivative of x^2 sin x? Show the steps.")) + '">' + T("Derivative steps") + '</button></p></div>';
		} else {
			// each message is built once and kept (typeset math, sorted tables and charts survive the next repaint); only a changed one is rebuilt
			var els = c.msgs.map(msgEl);
			if (log.querySelector(".ai-empty")) log.innerHTML = "";
			var kids = [].slice.call(log.children);
			if (kids.length !== els.length || kids.some(function (k, j) { return k !== els[j]; })) { els.forEach(function (e, j) { if (log.children[j] !== e) log.insertBefore(e, log.children[j] || null); }); while (log.children.length > els.length) log.lastChild.remove(); }
		}
		if (nearEnd || busy) log.scrollTop = log.scrollHeight;
		if (R) R.typeset(log);
		paintChats();
	}
	/* ---------- the chat list (2026-11-20): search, pinned on top, folders, rename / move / delete with Undo, sort, left or right ---------- */
	// S.folders = [{n: name, c: collapsed}], S.csort = "recent" | "old" | "name", S.side = "l" | "r", S.sideOff = list hidden (wide view)
	if (!Array.isArray(S.folders)) S.folders = [];
	if (["recent", "old", "name"].indexOf(S.csort) < 0) S.csort = "recent";
	if (S.side !== "r") S.side = "l";
	var cq = "", menuFor = null, renaming = null, narrowOpen = {}, dragId = null;
	function folderNames() { return S.folders.map(function (f) { return f.n; }); }
	function ensureFolder(n) { n = A.cleanFolder(n); if (n && folderNames().indexOf(n) < 0) S.folders.push({ n: n, c: false }); return n; }
	S.chats.forEach(function (c) { if (c.folder) ensureFolder(c.folder); });
	function touch(c) { c.mt = Date.now(); }
	function when(t) {
		if (!t) return "";
		var d = new Date(t), now = new Date(), day = 864e5;
		if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(LOC, { hour: "numeric", minute: "2-digit" });
		if (now - d < 6 * day) return d.toLocaleDateString(LOC, { weekday: "short" });
		return d.toLocaleDateString(LOC, d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
	}
	function sorted(list) {
		var by = S.csort === "name" ? function (a, b) { return a.title.localeCompare(b.title, LOC, { numeric: true, sensitivity: "base" }); } : S.csort === "old" ? function (a, b) { return a.at - b.at; } : function (a, b) { return b.at - a.at; };
		return list.slice().sort(by);
	}
	function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
	// a search hit: every word must be in the title or the messages; returns a short snippet around the first word found in the text
	function hit(c, words) {
		var title = norm(c.title), text = c.msgs.map(function (m) { return m.content || ""; }).join("\n"), nt = norm(text);
		if (!words.every(function (w) { return title.indexOf(w) >= 0 || nt.indexOf(w) >= 0; })) return null;
		var w0 = words.filter(function (w) { return title.indexOf(w) < 0 && nt.indexOf(w) >= 0; })[0] || words.filter(function (w) { return nt.indexOf(w) >= 0; })[0];
		if (!w0) return { snip: "" };
		var at = nt.indexOf(w0), a = Math.max(0, at - 40), b = Math.min(text.length, at + w0.length + 60);
		return { snip: (a ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ") + (b < text.length ? "…" : ""), w: words };
	}
	function mark(s, words) { // escaped text with the searched words marked
		var e = esc(s); if (!words || !words.length) return e;
		words.forEach(function (w) { if (w.length < 2) return; e = e.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&amp;").replace(/</g, "&lt;") + ")", "gi"), "<mark>$1</mark>"); });
		return e;
	}
	function rowHtml(c, h, words) {
		var n = Math.ceil(c.msgs.length / 2), isCur = c.id === S.cur;
		var title = renaming === c.id ? '<input class="ai-crename" type="text" maxlength="120" value="' + esc(c.title) + '" aria-label="' + esc(T("Chat name")) + '">' : '<span class="ai-ctitle">' + mark(c.title, words) + "</span>";
		var sub = (n ? (n === 1 ? T("{n} message", { n: 1 }) : T("{n} messages", { n: n })) + " · " : "") + esc(when(c.at)) + (words && c.folder ? " · 📁 " + esc(c.folder) : "");
		var row = '<div class="ai-crow' + (isCur ? " is-cur" : "") + '" role="listitem" data-cid="' + esc(c.id) + '" draggable="' + (renaming === c.id ? "false" : "true") + '">' +
			(renaming === c.id ? '<div class="ai-copen">' + title + '</div>' : '<button type="button" class="ai-copen" data-copen="' + esc(c.id) + '"' + (isCur ? ' aria-current="true"' : "") + ">" + title + '<span class="ai-csub">' + sub + "</span>" + (h && h.snip ? '<span class="ai-csnip">' + mark(h.snip, words) + "</span>" : "") + "</button>") +
			'<button type="button" class="ai-cic ai-cpin" data-cpin="' + esc(c.id) + '" aria-pressed="' + !!c.pin + '" title="' + esc(c.pin ? T("Unpin") : T("Pin to the top")) + '" aria-label="' + esc(c.pin ? T("Unpin") : T("Pin to the top")) + '">📌</button>' +
			'<button type="button" class="ai-cic" data-cmore="' + esc(c.id) + '" aria-haspopup="true" aria-expanded="' + (menuFor === c.id) + '" title="' + esc(T("More")) + '" aria-label="' + esc(T("More for {title}", { title: c.title })) + '">⋯</button></div>';
		if (menuFor === c.id) {
			row += '<div class="ai-cmenu" role="menu">' +
				'<button type="button" role="menuitem" data-cact="rename">✎ ' + T("Rename") + "</button>" +
				'<button type="button" role="menuitem" data-cact="pin">📌 ' + (c.pin ? T("Unpin") : T("Pin to the top")) + "</button>" +
				'<label class="ai-cmove"><span>📁 ' + T("Move to") + '</span><select data-cmove data-native><option value="">' + esc(T("No folder")) + "</option>" + folderNames().map(function (f) { return '<option value="' + esc(f) + '"' + (c.folder === f ? " selected" : "") + ">" + esc(f) + "</option>"; }).join("") + '<option value="\u0001new">' + esc(T("New folder…")) + "</option></select></label>" +
				'<button type="button" role="menuitem" data-cact="del" class="ai-cdel">🗑 ' + T("Delete") + "</button></div>";
		}
		return row;
	}
	function paintChats() {
		var box = $("ai-clist"); if (!box) return;
		var words = norm(cq).split(/\s+/).filter(Boolean), html = [];
		if (words.length) {
			var hits = sorted(S.chats).map(function (c) { return { c: c, h: hit(c, words) }; }).filter(function (x) { return x.h; });
			html.push('<p class="ai-cnote">' + (hits.length ? (hits.length === 1 ? T("{n} chat found", { n: 1 }) : T("{n} chats found", { n: hits.length })) : T("No chat has that.")) + "</p>");
			hits.forEach(function (x) { html.push(rowHtml(x.c, x.h, words)); });
		} else {
			var pins = sorted(S.chats.filter(function (c) { return c.pin; }));
			if (pins.length) { html.push('<div class="ai-chead">📌 ' + T("Pinned") + "</div>"); pins.forEach(function (c) { html.push(rowHtml(c)); }); }
			var fnames = S.folders.slice().sort(function (a, b) { return a.n.localeCompare(b.n, LOC, { numeric: true, sensitivity: "base" }); });
			fnames.forEach(function (f) {
				var inF = sorted(S.chats.filter(function (c) { return c.folder === f.n && !c.pin; })), all = S.chats.filter(function (c) { return c.folder === f.n; }).length;
				html.push('<div class="ai-fhead" data-fold="' + esc(f.n) + '"><button type="button" class="ai-ftog" data-ftog="' + esc(f.n) + '" aria-expanded="' + !f.c + '"><span class="ai-fcar" aria-hidden="true">' + (f.c ? "▸" : "▾") + "</span> 📁 " + esc(f.n) + ' <span class="ai-fn">' + all + "</span></button>" +
					'<button type="button" class="ai-cic" data-fren="' + esc(f.n) + '" title="' + esc(T("Rename folder")) + '" aria-label="' + esc(T("Rename folder")) + '">✎</button>' +
					'<button type="button" class="ai-cic" data-fdel="' + esc(f.n) + '" title="' + esc(T("Delete folder (its chats stay)")) + '" aria-label="' + esc(T("Delete folder (its chats stay)")) + '">✕</button></div>');
				if (!f.c) { html.push('<div class="ai-fbody" data-fold="' + esc(f.n) + '">'); inF.forEach(function (c) { html.push(rowHtml(c)); }); if (!inF.length) html.push('<p class="ai-cnote">' + T("Empty: drag chats here, or use ⋯ › Move to.") + "</p>"); html.push("</div>"); }
			});
			var rest = sorted(S.chats.filter(function (c) { return !c.pin && !(c.folder && folderNames().indexOf(c.folder) >= 0); }));
			if ((pins.length || fnames.length) && (rest.length || dragId !== null)) html.push('<div class="ai-chead" data-fold="">💬 ' + T("Chats") + "</div>");
			else if (pins.length || fnames.length) html.push('<div class="ai-chead ai-chead--drop" data-fold="">💬 ' + T("Chats") + "</div>");
			html.push('<div class="ai-fbody" data-fold="">'); rest.forEach(function (c) { html.push(rowHtml(c)); }); html.push("</div>");
		}
		box.innerHTML = html.join("");
		var ct = cur(); $("ai-curtitle").textContent = ct.msgs.length ? ct.title : "";
		$("ai-sidebtn").querySelector(".ai-cn").textContent = S.chats.filter(function (c) { return c.msgs.length; }).length || "";
		var ri = box.querySelector(".ai-crename"); if (ri) { ri.focus(); ri.select(); }
		if (menuFor) { var mm = box.querySelector(".ai-cmenu button"); if (mm && document.activeElement && document.activeElement.closest && !document.activeElement.closest(".ai-cmenu")) mm.focus(); }
	}
	function openChat(id) { if (busy) return; S.cur = id; menuFor = null; save(); if (narrowOpen["ai-chat"]) { narrowOpen["ai-chat"] = false; paintSide(); } renderLog(); paintPrice(); }
	function byId(id) { return S.chats.filter(function (c) { return c.id === id; })[0]; }

	// Undo for deletes: the removed chat (or folder) is put back exactly where it was
	var undoT = null;
	function undoBar(text, undo) {
		var u = $("ai-undo"); clearTimeout(undoT);
		u.innerHTML = '<span></span><button type="button" class="tu-btn tu-btn--ghost">' + T("Undo") + '</button><button type="button" class="ai-cic" aria-label="' + esc(T("Close")) + '">✕</button>';
		u.firstChild.textContent = text; u.hidden = false;
		u.children[1].onclick = function () { u.hidden = true; undo(); };
		u.children[2].onclick = function () { u.hidden = true; };
		undoT = setTimeout(function () { u.hidden = true; }, 8000);
	}
	function delChat(id) {
		var i = -1; S.chats.forEach(function (c, j) { if (c.id === id) i = j; });
		if (i < 0 || busy) return;
		var c = S.chats[i], wasCur = S.cur === id;
		S.chats.splice(i, 1); if (wasCur) S.cur = null; menuFor = null; save(); renderLog(); paintPrice();
		if (!c.msgs.length) return;
		undoBar(T('Deleted "{title}".', { title: c.title.slice(0, 40) }), function () { S.chats.splice(Math.min(i, S.chats.length), 0, c); if (wasCur) S.cur = c.id; save(); renderLog(); paintPrice(); });
	}
	function askFolder(def) { var n = prompt(T("Folder name"), def || ""); return n == null ? null : A.cleanFolder(n); }
	function moveTo(c, f) { c.folder = f || undefined; if (!f) delete c.folder; touch(c); save(); paintChats(); }

	$("ai-csearch").addEventListener("input", function () { cq = this.value; menuFor = null; paintChats(); });
	$("ai-csearch").addEventListener("keydown", function (e) { if (e.key === "Escape" && this.value) { e.preventDefault(); this.value = cq = ""; paintChats(); } if (e.key === "Enter") { var f = $("ai-clist").querySelector("[data-copen]"); if (f) openChat(f.dataset.copen); } });
	$("ai-csort").value = S.csort;
	$("ai-csort").addEventListener("change", function () { S.csort = this.value; save(); paintChats(); });
	$("ai-addfolder").addEventListener("click", function () { var n = askFolder(); if (!n) return; ensureFolder(n); save(); paintChats(); });
	$("ai-clist").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		var d = b.dataset;
		if (d.copen) openChat(d.copen);
		else if (d.cpin) { var c = byId(d.cpin); if (c) { c.pin = !c.pin; if (!c.pin) delete c.pin; touch(c); save(); paintChats(); } }
		else if (d.cmore) { menuFor = menuFor === d.cmore ? null : d.cmore; paintChats(); }
		else if (d.cact) {
			var c2 = byId(menuFor); if (!c2) return;
			if (d.cact === "rename") { renaming = c2.id; menuFor = null; paintChats(); }
			if (d.cact === "pin") { c2.pin = !c2.pin; if (!c2.pin) delete c2.pin; touch(c2); menuFor = null; save(); paintChats(); }
			if (d.cact === "del") delChat(c2.id);
		}
		else if (d.ftog) { S.folders.forEach(function (f) { if (f.n === d.ftog) f.c = !f.c; }); save(); paintChats(); }
		else if (d.fren) {
			var n = askFolder(d.fren); if (!n || n === d.fren) return;
			var other = folderNames().indexOf(n) >= 0;
			S.folders = S.folders.filter(function (f) { return !(other && f.n === d.fren); }); S.folders.forEach(function (f) { if (f.n === d.fren) f.n = n; });
			S.chats.forEach(function (c) { if (c.folder === d.fren) { c.folder = n; touch(c); } }); save(); paintChats();
		}
		else if (d.fdel) {
			var fi = -1; S.folders.forEach(function (f, j) { if (f.n === d.fdel) fi = j; });
			if (fi < 0) return;
			var fo = S.folders[fi], members = S.chats.filter(function (c) { return c.folder === fo.n; });
			S.folders.splice(fi, 1); members.forEach(function (c) { delete c.folder; touch(c); }); save(); paintChats();
			undoBar(T('Deleted the folder "{name}" (its chats are under Chats).', { name: fo.n }), function () { S.folders.splice(fi, 0, fo); members.forEach(function (c) { c.folder = fo.n; touch(c); }); save(); paintChats(); });
		}
	});
	$("ai-clist").addEventListener("change", function (e) {
		if (!e.target.matches("[data-cmove]")) return;
		var c = byId(menuFor), v = e.target.value; if (!c) return;
		if (v === "\u0001new") { v = askFolder(); if (!v) { paintChats(); return; } ensureFolder(v); }
		menuFor = null; moveTo(c, v);
	});
	$("ai-clist").addEventListener("dblclick", function (e) { var r = e.target.closest("[data-copen]"); if (r && !busy) { renaming = r.dataset.copen; paintChats(); } });
	$("ai-clist").addEventListener("keydown", function (e) {
		if (e.target.matches(".ai-crename")) {
			if (e.key === "Enter") { e.preventDefault(); commitRename(e.target); }
			if (e.key === "Escape") { e.preventDefault(); renaming = null; paintChats(); }
			return;
		}
		if (e.key === "F2") { var r = e.target.closest("[data-cid]"); if (r) { renaming = r.dataset.cid; paintChats(); } }
		if (e.key === "Delete" && e.target.matches("[data-copen]")) delChat(e.target.dataset.copen);
		if (e.key === "Escape" && menuFor) { var id = menuFor; menuFor = null; paintChats(); var mb = $("ai-clist").querySelector('[data-cmore="' + id + '"]'); if (mb) mb.focus(); }
		if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.matches("[data-copen]")) {
			var all = [].slice.call($("ai-clist").querySelectorAll("[data-copen]")), k = all.indexOf(e.target) + (e.key === "ArrowDown" ? 1 : -1);
			if (all[k]) { e.preventDefault(); all[k].focus(); }
		}
	});
	function commitRename(inp) {
		if (!renaming) return;
		var c = byId(renaming), v = inp.value.replace(/\s+/g, " ").trim().slice(0, 120);
		renaming = null;
		if (c && v && v !== c.title) { c.title = v; touch(c); save(); }
		setTimeout(paintChats, 0);
	}
	$("ai-clist").addEventListener("focusout", function (e) { if (e.target.matches(".ai-crename")) commitRename(e.target); });
	// drag a chat onto a folder (or onto "Chats" to take it out)
	$("ai-clist").addEventListener("dragstart", function (e) { var r = e.target.closest("[data-cid]"); if (!r) return; dragId = r.dataset.cid; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", byId(dragId).title); } catch (x) {} r.classList.add("is-drag"); });
	$("ai-clist").addEventListener("dragend", function () { dragId = null; [].forEach.call($("ai-clist").querySelectorAll(".is-drag, .is-over"), function (x) { x.classList.remove("is-drag", "is-over"); }); });
	$("ai-clist").addEventListener("dragover", function (e) { var t = dragId && e.target.closest("[data-fold]"); if (!t) return; e.preventDefault(); [].forEach.call($("ai-clist").querySelectorAll(".is-over"), function (x) { if (x !== t) x.classList.remove("is-over"); }); t.classList.add("is-over"); });
	$("ai-clist").addEventListener("drop", function (e) { var t = dragId && e.target.closest("[data-fold]"); if (!t) return; e.preventDefault(); var c = byId(dragId); if (c) moveTo(c, t.dataset.fold); });
	document.addEventListener("click", function (e) { if (menuFor && !e.target.closest(".ai-cmenu, [data-cmore]")) { menuFor = null; paintChats(); } });

	// the list on the left or the right, shown or hidden; under ~720 px wide it folds above the chat (☰ opens it).
	// The Pictures and Videos tabs have the same side list (2026-11-21): one shared choice (S.side, S.sideOff) for all three tabs.
	var PANELS = ["ai-chat", "ai-img", "ai-vid"];
	function narrowOf(id) { return $(id).classList.contains("ai-narrow"); }
	function paintSide() {
		PANELS.forEach(function (id) {
			var ch = $(id), n = narrowOf(id), open = n ? !!narrowOpen[id] : !S.sideOff, fl = ch.querySelector("[data-flip]");
			ch.classList.toggle("ai-side-r", S.side === "r"); ch.classList.toggle("ai-side-off", !open);
			ch.querySelector("[data-side]").setAttribute("aria-expanded", open);
			fl.hidden = n;
			fl.title = S.side === "r" ? T("Put the list on the left") : T("Put the list on the right");
			fl.setAttribute("aria-label", fl.title);
		});
	}
	PANELS.forEach(function (id) {
		var ch = $(id), last = null;
		ch.querySelector("[data-side]").addEventListener("click", function () {
			if (narrowOf(id)) narrowOpen[id] = !narrowOpen[id]; else { S.sideOff = !S.sideOff; save(); }
			paintSide();
			if (!ch.classList.contains("ai-side-off")) { var se = ch.querySelector(".ai-csearch"); if (se) se.focus(); }
		});
		ch.querySelector("[data-flip]").addEventListener("click", function () { S.side = S.side === "r" ? "l" : "r"; save(); paintSide(); });
		function fit() { var w = ch.clientWidth; if (!w) return; var n = w < 720; if (n !== last) { last = n; ch.classList.toggle("ai-narrow", n); paintSide(); } }
		if (window.ResizeObserver) new ResizeObserver(fit).observe(ch); else window.addEventListener("resize", fit);
		fit();
	});
	paintSide();
	$("ai-new").addEventListener("click", function () { if (busy) return; var c = cur(); if (c.msgs.length) newChat(); if (cq) { cq = $("ai-csearch").value = ""; } renderLog(); paintPrice(); $("ai-in").focus(); });
	$("ai-log").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.ex) { $("ai-in").value = b.dataset.ex; paintPrice(); $("ai-in").focus(); }
		if (b.dataset.copy) copy(cur().msgs[+b.dataset.copy].content, b);
		if (b.dataset.open && R) {
			var mm = cur().msgs[+b.dataset.oi], box = b.closest(".ai-m"), md0 = box && box.querySelector(".ai-md");
			if (!mm || !md0) return;
			if (b.dataset.open !== "latex" && !window.indexedDB) { msg(T("This browser can't hand files to another page."), "err"); return; }
			R.openIn(b.dataset.open, mm.content, md0).then(function (r) { if (r === "some") msg(T("Only the first equations fit in one link."), "ok"); }, function (e) { msg(T(e.message), "err"); });
		}
		if (b.dataset.retry) retry(+b.dataset.retry);
	});

	/* ---------- options + live price ---------- */
	// model lists grouped by company; a company whose key is not set yet shows its models greyed out with "(soon)"
	function fillModels() {
		var groups = { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)", openrouter: T("Cheap (DeepSeek, Qwen, Llama)") };
		$("ai-model").innerHTML = Object.keys(groups).map(function (p) {
			return '<optgroup label="' + groups[p] + '">' + Object.keys(A.MODELS).filter(function (k) { return A.MODELS[k].prov === p; }).map(function (k) {
				return '<option value="' + k + '"' + (provOn(p) ? "" : " disabled") + ">" + esc(A.MODELS[k].name.replace(/^ChatGPT: /, "")) + (provOn(p) ? "" : " (" + T("soon") + ")") + "</option>";
			}).join("") + "</optgroup>";
		}).join("");
		if (!provOn(A.MODELS[S.model].prov)) { var alt = Object.keys(A.MODELS).filter(function (k) { return provOn(A.MODELS[k].prov); })[0]; if (alt) S.model = alt; }
		$("ai-model").value = S.model;
		$("ai-imod").innerHTML = Object.keys(A.IMAGES).map(function (k) { var im = A.IMAGES[k], on = provOn(im.prov); return '<option value="' + k + '"' + (on ? "" : " disabled") + ">" + esc(T(im.name)) + (on ? "" : " (" + T("soon") + ")") + "</option>"; }).join("");
		if (!provOn(A.IMAGES[S.imod].prov)) { var ia = Object.keys(A.IMAGES).filter(function (k) { return provOn(A.IMAGES[k].prov); })[0]; if (ia) S.imod = ia; }
		$("ai-imod").value = S.imod;
		fillQuality();
	}
	// picture quality: GPT Image = Draft / Good / Best, Grok Imagine = 1k / 2k; each company's last choice is remembered
	function fillQuality() {
		var im = A.IMAGES[S.imod], x = im.prov === "xai";
		var opts = x ? A.XIMAGE.res : { low: T("Draft (fast, cheap)"), medium: T("Good"), high: T("Best") };
		var want = S.iq[im.prov] && opts[S.iq[im.prov]] ? S.iq[im.prov] : (x ? "1k" : "medium");
		$("ai-q").innerHTML = Object.keys(opts).map(function (k) { return '<option value="' + k + '"' + (k === want ? " selected" : "") + ">" + esc(x ? T(opts[k]) : opts[k]) + "</option>"; }).join("");
		$("ai-imodel").textContent = T("{company}'s {model}", { company: A.PROVIDERS[im.prov], model: im.name.replace(/ \(.*\)$/, "") });
	}
	fillModels();
	$("ai-imod").addEventListener("change", function () { S.imod = this.value; save(); fillQuality(); paintRefs("img"); paintPrice(); });
	$("ai-q").addEventListener("change", function () { S.iq[A.IMAGES[S.imod].prov] = this.value; save(); });
	$("ai-len").innerHTML = Object.keys(A.LENGTHS).map(function (k) { return '<button type="button" data-len="' + k + '" aria-pressed="' + (k === S.len) + '">' + esc(T(A.LENGTHS[k])) + "</button>"; }).join("");
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
	// what this chat has cost so far + a rough price for the next message (history ~ characters / 4); only a hint, the quote is the price
	function paintCost() {
		var c = cur(), el = $("ai-cost"), k = A.chatCostSoFar(c, S.model, S.len);
		el.hidden = !c.msgs.length;
		if (!c.msgs.length) return;
		el.innerHTML = T("This chat so far: <b>{p} HBD</b>", { p: k.price }) + ' <span class="ai-sub">(' + (k.paid === 1 ? T("{n} paid message", { n: 1 }) : T("{n} paid messages", { n: k.paid })) + ")</span> · " +
			T("history about {t} tokens", { t: k.tokens.toLocaleString(LOC) }) + " · " + T("next message about <b>{p} HBD</b>", { p: k.next.price }) +
			'<br><span class="ai-sub">' + T("The whole history is sent again with every message, so long chats cost more. A new chat is cheaper.") + "</span>";
	}
	(function () { // "Typical costs" table, worked out from MESAI's prices so it follows them
		var sizes = [5000, 25000, 50000], rows = A.typicalCosts(["sonnet", "opus"], sizes, "medium");
		$("ai-ttable").innerHTML = "<tr><th>" + T("Model (Medium answer)") + "</th>" + sizes.map(function (t) { return "<th>" + T("{k}k tokens of history", { k: t / 1000 }) + "</th>"; }).join("") + "</tr>" +
			rows.map(function (r) { return "<tr><td>" + esc(r.name) + "</td>" + r.cells.map(function (c) { return "<td>" + T("about {p} HBD", { p: c.price }) + "</td>"; }).join("") + "</tr>"; }).join("");
		var ss = A.sessionCost("sonnet", "medium", 30, 50000);
		$("ai-tsession").textContent = T("A 30-message coding chat that grows to 50k tokens costs about {p} HBD in all on Sonnet. Starting a new chat when the topic changes keeps it cheap.", { p: (Math.round(ss.hbd * 10) / 10).toLocaleString(LOC) });
	})();
	function paintPrice() {
		var m = A.MODELS[S.model], fr = freeApplies();
		var words = Math.round((fr ? A.FREE.maxOut : m.caps[S.len]) * 0.75).toLocaleString(LOC);
		// a free message always gets a Short answer: the length buttons show that while free messages are on
		$("ai-len").classList.toggle("is-free", fr);
		[].forEach.call($("ai-len").children, function (x) { x.setAttribute("aria-pressed", fr ? x.dataset.len === "short" : x.dataset.len === S.len); });
		$("ai-modelnote").textContent = T(m.blurb) + " " + (m.thinks ? T("Answer up to about {n} words (its thinking counts too).", { n: words }) : T("Answer up to about {n} words.", { n: words }));
		paintFree();
		var msgs = draftMessages(), q = A.chatQuote(S.model, A.estimateChatTokens(msgs.length ? msgs : [{ role: "user", content: "" }]), S.len);
		var nEx = Math.floor(msgs.length / 2);
		var hist = msgs.length > 1 ? ' <span class="ai-sub">' + (nEx === 1 ? T("incl. {n} earlier exchange", { n: nEx }) : T("incl. {n} earlier exchanges", { n: nEx })) + "</span>" : "";
		$("ai-price").innerHTML = T("about <b>{p} HBD</b>", { p: q.price }) + " <span class=\"ai-sub\">(" + usdOf(q) + ")</span>" + hist;
		paintCost();
		var on = status.chat && provOn(m.prov) && !busy;
		$("ai-send").disabled = !on;
		$("ai-send").textContent = busy ? T("Working…") : freeApplies() ? T("Send free") : T("Pay & send");
		if (freeApplies()) $("ai-price").innerHTML = "<b>" + T("🎁 Free") + '</b> <span class="ai-sub">' + T("{n} of {m} left today · Short answer", { n: FREEST.left, m: FREEST.perDay }) + "</span>";
		var nr = M ? M.img.pend.length : 0, iq = A.imageQuote($("ai-q").value, $("ai-size").value, Math.ceil($("ai-prompt").value.length / 2) + 8, S.imod, nr);
		$("ai-iprice").innerHTML = "<b>" + iq.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(iq) + ")</span>" + (nr ? ' <span class="ai-sub">' + (nr === 1 ? T("incl. {n} picture", { n: 1 }) : T("incl. {n} pictures", { n: nr })) + "</span>" : "");
		var ion = status.image && provOn(A.IMAGES[S.imod].prov);
		$("ai-make").disabled = !(ion && !busy);
		$("ai-make").textContent = ion ? (nr ? T("Pay & change") : T("Pay & create")) : T("Coming soon");
		$("ai-iattach").hidden = !A.maxRefs("image", S.imod) && !nr;
		if (typeof paintVprice === "function") paintVprice();
	}
	["ai-in", "ai-prompt"].forEach(function (id) { $(id).addEventListener("input", paintPrice); });
	$("ai-vprompt").addEventListener("input", paintVprice);
	["ai-q", "ai-size"].forEach(function (id) { $(id).addEventListener("change", paintPrice); });
	$("ai-in").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
	$("ai-send").addEventListener("click", function () { send(); });

	/* ---------- price table in the "how" box ---------- */
	(function () {
		document.querySelectorAll("[data-margin]").forEach(function (x) { x.textContent = A.MARGIN; }); document.querySelectorAll("[data-freeday]").forEach(function (x) { x.textContent = A.FREE.perDay; });
		$("ai-checked").textContent = A.PRICES_CHECKED;
		var rows = ["<tr><th>" + T("Model") + "</th><th>" + T("Short") + "</th><th>" + T("Medium") + "</th><th>" + T("Long") + "</th></tr>"];
		Object.keys(A.MODELS).forEach(function (k) {
			rows.push("<tr><td>" + esc(A.MODELS[k].name) + "</td>" + Object.keys(A.LENGTHS).map(function (l) { return "<td>" + A.chatQuote(k, 500, l).price + " HBD</td>"; }).join("") + "</tr>");
		});
		rows.push('<tr><td colspan="4" class="ai-sub">' + T("A new chat with a short question (about 500 tokens sent). Longer chats cost more.") + '</td></tr>');
		rows.push("<tr><th>" + T("Picture (square)") + "</th><th>" + T("Draft") + "</th><th>" + T("Good") + "</th><th>" + T("Best") + "</th></tr><tr><td>" + esc(T(A.IMAGES.gpt.name)) + "</td>" + ["low", "medium", "high"].map(function (ql) { return "<td>" + A.imageQuote(ql, "1024x1024", 40).price + " HBD</td>"; }).join("") + "</tr>");
		rows.push("<tr><th>" + T("Picture (any shape)") + "</th><th>1k</th><th>2k</th><th></th></tr>");
		Object.keys(A.IMAGES).filter(function (k) { return A.IMAGES[k].prov === "xai"; }).forEach(function (k) { rows.push("<tr><td>" + esc(T(A.IMAGES[k].name)) + "</td>" + ["1k", "2k"].map(function (rq) { return "<td>" + A.imageQuote(rq, "1024x1024", 0, k).price + " HBD</td>"; }).join("") + "<td></td></tr>"); });
		rows.push("<tr><th>" + T("Video (480p)") + "</th><th>" + T("{n} s", { n: 5 }) + "</th><th>" + T("{n} s", { n: 8 }) + "</th><th>" + T("{n} s", { n: 15 }) + "</th></tr>");
		Object.keys(A.VIDEO.models).forEach(function (k) { rows.push("<tr><td>" + esc(T(A.VIDEO.models[k].name)) + "</td>" + [5, 8, 15].map(function (d) { return "<td>" + A.videoQuote(k, d, "480p").price + " HBD</td>"; }).join("") + "</tr>"); });
		rows.push('<tr><td colspan="4" class="ai-sub">' + T("720p costs 1.5 times as much and 1080p 2.25 times.") + '</td></tr>');
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
					var q = body.kind === "image" ? A.imageQuote(body.quality, body.size, Math.ceil(body.prompt.length / 2) + 8, body.model, (body.refs || []).length) : A.chatQuote(body.model, A.estimateChatTokens(body.messages), body.len);
					var id = A.newId(); MOCK_Q[id] = { body: body, q: q, tries: 0 };
					res({ status: 200, id: id, memo: A.memoFor(id), to: A.PAY_TO, price: q.price, usd: q.hbd, inTokens: q.inTokens, maxOut: q.maxOut || 0 });
				}, 250);
			});
		}
		return post(Object.assign({ op: "quote", lang: LANG }, body)).then(jsonOf);
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
		if (/fail/i.test(JSON.stringify(info.body.messages || "")) && info.tries === 1) return sleep(600).then(function () { onPiece({ t: "error", msg: T("Simulated failure after payment."), retry: true }); });
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
		if (r.error) { onPiece({ t: "error", msg: T(r.error.error) || T("Could not get the answer."), retry: !!r.error.retry }); return Promise.resolve(); }
		var ct = r.headers.get("content-type") || "";
		if (!/ndjson/.test(ct)) return jsonOf(r).then(function (j) { onPiece({ t: "error", msg: T(j.msg || j.error) || T("Could not get the answer (HTTP {s}).", { s: j.status }), retry: !!j.retry }); });
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

	/* ---------- free daily messages ---------- */
	function freeKey(a) { return "mes-ai:free:" + a; }
	function freeApplies() {
		var m = A.MODELS[S.model], u = who();
		return !!(FREEST.on && m && m.free && u && FREEST.left > 0 && S.free !== false && provOn(m.prov));
	}
	function paintFree() {
		var m = A.MODELS[S.model], box = $("ai-free"), u = who();
		var show = FREEST.on && m && m.free && u && FREEST.left != null;
		box.hidden = !show;
		if (!show) return;
		$("ai-freeuse").checked = S.free !== false;
		$("ai-freeuse").disabled = FREEST.left <= 0;
		$("ai-freetx").innerHTML = FREEST.left > 0 ? T("Use my free messages: <b>{n} of {m}</b> left today (Short answers, cheap models)", { n: FREEST.left, m: FREEST.perDay })
			: T("No free messages left today: they come back at 00:00 UTC. Paid messages on this model cost about 0.003 HBD.");
	}
	function loadFree() {
		var u = who(); if (!u) { FREEST.left = null; paintPrice(); return; }
		if (mock) {
			var d = null; try { d = JSON.parse(localStorage.getItem(freeKey(u.name) + ":mock") || "null"); } catch (e) {}
			FREEST.left = d && d.day === A.utcDay() ? d.left : A.FREE.perDay; paintPrice(); return;
		}
		fetch("/api/ai?op=free&acct=" + encodeURIComponent(u.name), { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) {
			FREEST.on = !!j.on; FREEST.perDay = j.perDay || A.FREE.perDay; FREEST.left = j.on ? j.left : null; paintPrice();
		}).catch(function () {});
	}
	$("ai-freeuse").addEventListener("change", function () { S.free = this.checked; save(); paintPrice(); });
	// the once-a-day proof of the account: a Keychain signature of A.freeMessage (no payment, no fee); kept for the day
	function daySig(acct, fresh) {
		var day = A.utcDay(), k = freeKey(acct) + ":sig", c = null;
		try { c = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) {}
		if (!fresh && c && c.day === day && c.sig) return Promise.resolve({ day: day, sig: c.sig });
		if (mock) return Promise.resolve({ day: day, sig: new Array(131).join("0") });
		msg(T("Confirm in Hive Keychain once today to use your free messages (a signature, no payment)…"));
		return H.keychain(1500).then(function (kc) {
			if (!kc) throw new Error(T("Hive Keychain is needed for free messages."));
			return new Promise(function (res, rej) {
				kc.requestSignBuffer(acct, A.freeMessage(acct, day), "Posting", function (r) {
					if (!r || !r.success || !r.result) return rej(H.kcError ? H.kcError(r || {}) : new Error((r && r.message) || "Cancelled"));
					try { localStorage.setItem(k, JSON.stringify({ day: day, sig: String(r.result) })); } catch (e) {}
					res({ day: day, sig: String(r.result) });
				}, null, "MES AI free messages");
			});
		});
	}
	function freeReq(body) {
		if (mock) {
			var u = who(), id = A.newId(); MOCK_Q[id] = { body: body, tries: 0 };
			FREEST.left = Math.max(0, FREEST.left - 1);
			try { localStorage.setItem(freeKey(u.name) + ":mock", JSON.stringify({ day: A.utcDay(), left: FREEST.left })); } catch (e) {}
			return Promise.resolve({ mock: id });
		}
		return post(body);
	}
	function sendFree(c, draft, text, u) {
		setBusy(true);
		var tries = 0;
		function go(fresh) {
			return daySig(u.name, fresh).then(function (ds) {
				msg(T("Sending your free message…"));
				return freeReq({ op: "free", acct: u.name, day: ds.day, sig: ds.sig, model: S.model, lang: LANG, messages: draft.map(function (m) { return { role: m.role, content: m.content }; }) });
			}).then(function (r) {
				if (r.mock) return r;
				if (/ndjson/.test(r.headers.get("content-type") || "")) { var l = r.headers.get("X-Free-Left"); if (l != null) FREEST.left = +l; return r; }
				return jsonOf(r).then(function (j) {
					if (j.resign && tries++ < 1) { try { localStorage.removeItem(freeKey(u.name) + ":sig"); } catch (e) {} return go(true); }
					if (j.left === 0) FREEST.left = 0;
					if (j.budget) FREEST.left = 0;
					throw new Error(j.resign ? T("Hive could not confirm the signature. Log in again with Keychain and retry.") : T(j.error || j.msg) || T("Could not send it (HTTP {s}).", { s: j.status }));
				});
			});
		}
		var err = A.checkMessages(draft) || A.checkTextOnly(S.model, draft);
		if (err) { msg(T(err), "err"); setBusy(false); return; }
		return go(false).then(function (r) {
			msg("");
			var um = { role: "user", content: text, at: Date.now(), free: true, model: S.model, len: "short", acct: u.name };
			var am = { role: "assistant", content: "", at: Date.now(), pending: true, model: S.model };
			if (!c.msgs.length) c.title = text.replace(/\s+/g, " ").slice(0, 60);
			c.msgs.push(um, am); c.at = Date.now();
			S.chats.sort(function (a, b) { return b.at - a.at; });
			$("ai-in").value = ""; save(); renderLog();
			var last = 0;
			return readStream(r, function (p) {
				if (p.t === "text") { am.content += p.v; if (Date.now() - last > 90) { last = Date.now(); renderLog(); } }
				else if (p.t === "done") { am.stop = p.stop; am.pending = false; }
				else if (p.t === "error") { am.error = p.msg; am.pending = false; if (p.free) FREEST.left++; }
			}).catch(function () { am.error = T("The connection broke before the answer finished."); }).then(function () {
				am.pending = false;
				if (!am.error && !am.content) am.error = T("No answer came back.");
				save(); renderLog();
			});
		}).catch(function (e) {
			var m = e && e.message || String(e);
			msg(/cancel|declin|denied/i.test(m) ? T("Cancelled: nothing was sent.") : T(m), "err");
		}).then(function () { setBusy(false); });
	}

	/* ---------- send a chat message ---------- */
	function setBusy(b) { busy = b; root.classList.toggle("ai-busy", b); paintPrice(); }
	function send(force) {
		if (busy) return;
		var u = who();
		var text = $("ai-in").value.trim();
		if (!text && !PEND.length) { $("ai-in").focus(); return; }
		// "make a picture of ..." in the chat: offer the Picture / Video tab instead (the chat models only write text)
		var wm = force === true ? null : A.wantsMedia(text);
		if (wm && (wm.kind === "image" ? status.image : status.video)) { offerMedia(wm, text); return; }
		if (!status.chat) { msg(T("MES AI chat is coming soon."), "err"); return; }
		if (!u) { msg(T("Log in with your Hive account first (above)."), "err"); $("ai-acct-card").scrollIntoView({ block: "center" }); return; }
		if (A.MODELS[S.model].text && PEND.length) { msg(T("This model reads text only. Pick Claude or ChatGPT for pictures and PDFs, or remove the files."), "err"); return; }
		var draft = draftMessages(), sentFiles = PEND.slice();
		var c = cur();
		// a failed exchange at the end is dropped before the new message
		while (c.msgs.length && (c.msgs[c.msgs.length - 1].error || c.msgs[c.msgs.length - 1].role === "user") && !c.msgs[c.msgs.length - 1].retryId) c.msgs.pop();
		if (freeApplies()) {
			draft = draftMessages();   // after dropping the failed exchange
			if (A.safeTokens(A.systemFor(S.model, LANG), draft) > A.FREE.maxIn) { msg(T("This chat is too long for a free message. Start a new chat, or untick free messages to pay for this one."), "err"); return; }
			return sendFree(c, draft, text, u);
		}
		setBusy(true);
		msg(T("Getting the exact price…"));
		withFileData(draft).then(function (msgs) {
			var err = A.checkMessages(msgs);
			if (err) throw new Error(T(err));
			return quote({ acct: u.name, kind: "chat", model: S.model, len: S.len, messages: msgs });
		}).then(function (q) {
			if (q.status !== 200) throw new Error(T(q.error) || T("Could not get a price (HTTP {s}).", { s: q.status }));
			msg(T("Price: {p} HBD ({usd}). Confirm the payment in Hive Keychain…", { p: q.price, usd: A.fmtUsd(q.usd) }));
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
			msg(T("Paid. Waiting for the blockchain (a few seconds)…"));
			return answer(c, am, q.id, u.name);
		}).catch(function (e) {
			var m = e && e.message || String(e);
			msg(/cancel|declin|denied/i.test(m) ? T("Payment cancelled: nothing was sent.") : T(m), "err");
		}).then(function () { setBusy(false); });
	}
	function answer(c, am, id, acct) {
		var last = 0;
		return runReq(id, acct, function (n) { msg(T("Waiting for the blockchain… ({s} s)", { s: n * 3 })); }).then(function (r) {
			msg("");
			return readStream(r, function (p) {
				if (p.t === "text") { am.content += p.v; am.thinking = false; if (Date.now() - last > 90) { last = Date.now(); renderLog(); } }
				else if (p.t === "think") { am.thinking = true; renderLog(); }
				else if (p.t === "done") { am.stop = p.stop; am.pending = false; }
				else if (p.t === "error") { am.error = p.msg; am.pending = false; am.retryId = p.retry ? id : null; }
			});
		}).catch(function () { am.error = T("The connection broke before the answer finished."); am.retryId = id; }).then(function () {
			am.pending = false;
			if (!am.error && !am.content) { am.error = T("No answer came back."); am.retryId = id; }
			if (am.error && am.content) am.content += "\n\n" + T("*(cut off)*");
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

	/* ---------- pictures and videos (2026-11-21: side list + search like the chats, reference pictures, edits) ---------- */
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
	function b64Blob(b64, mime) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }
	var urls = {};
	// an object URL for a stored blob (pictures: key = id, videos: "v:" + id, reference pictures: "f:" + id as base64)
	function blobUrl(key) {
		if (urls[key]) return Promise.resolve(urls[key]);
		return idbDo("readonly", function (s) { return s.get(key); }).then(function (v) {
			if (!v) return null;
			var blob = v instanceof Blob ? v : (v && v.data ? b64Blob(v.data, v.mt) : null);
			if (!blob) return null;
			return (urls[key] = URL.createObjectURL(blob));
		}).catch(function () { return null; });
	}
	function fillSrc(scope) {
		scope.querySelectorAll("[data-src]").forEach(function (el) {
			var k = el.getAttribute("data-src"); el.removeAttribute("data-src");
			blobUrl(k).then(function (u) { if (u) el.src = u; else if (el.tagName === "IMG") el.classList.add("ai-gone"); });
		});
	}

	/* reference pictures waiting to be sent: M.img.pend / M.vid.pend = [{id, mt, data, name}] */
	var M = {
		img: { pend: [], tab: "img", list: imgList, saveList: imgSave, sel: "isel", q: "", el: { refs: "ai-irefs", side: "ai-ilist", stage: "ai-istage", search: "ai-isearch", prompt: "ai-prompt", cur: "ai-icur", comp: "ai-icomp", label: "ai-plabel", file: "ai-ifile" } },
		vid: { pend: [], tab: "vid", list: function () { return vids(); }, saveList: function (l) { vidsSave(l); }, sel: "vsel", q: "", el: { refs: "ai-vrefs", side: "ai-vlist", stage: "ai-vstage", search: "ai-vsearch", prompt: "ai-vprompt", cur: "ai-vcur", comp: "ai-vcomp", label: "ai-vlabel", file: "ai-vfile" } }
	};
	function maxRefs(kind) { return kind === "img" ? A.maxRefs("image", S.imod) : A.maxRefs("video", $("ai-vmodel").value); }
	function refChars(kind) { return M[kind].pend.reduce(function (n, f) { return n + f.data.length; }, 0); }
	// adds pictures (Files or Blobs) as reference pictures 1, 2, ...; shrunk to at most REFS.side px
	function addRefs(kind, files, front) {
		files = [].slice.call(files || []).filter(function (f) { return /^image\//.test(f.type || "") || f instanceof Blob; });
		if (!files.length) return Promise.resolve();
		var notes = [], chain = Promise.resolve(), P = M[kind];
		files.forEach(function (f) {
			chain = chain.then(function () {
				var max = maxRefs(kind), name = f.name || T("picture");
				if (!max) { notes.push(T("This model can't take pictures. Pick another model.")); return; }
				if (P.pend.length >= max) {
					if (max === 1) P.pend = []; // a video starts from one picture: the new one replaces it
					else { notes.push(max === 1 ? T("One picture at most with this model.") : T("{n} pictures at most with this model.", { n: max })); return; }
				}
				return shrinkImage(f, A.REFS.side).then(function (r) {
					if (refChars(kind) + r.data.length > A.REFS.total) { notes.push(T("{name}: too big together with the other pictures.", { name: name })); return; }
					var o = { id: A.newId(), mt: r.mt, data: r.data, name: name };
					if (front) P.pend.unshift(o); else P.pend.push(o);
				}, function () { notes.push(T("{name}: this picture type can't be read here. Use JPEG or PNG.", { name: name })); });
			});
		});
		return chain.then(function () { paintRefs(kind); paintPrice(); if (notes.length) msg(notes.join(" "), "err"); });
	}
	function paintRefs(kind) {
		var P = M[kind], box = $(P.el.refs), max = maxRefs(kind);
		box.hidden = !P.pend.length;
		box.innerHTML = P.pend.map(function (f, i) {
			return '<span class="ai-ref"><img alt="" src="data:' + f.mt + ";base64," + f.data + '"><b class="ai-refn">' + (kind === "vid" ? "▶" : i + 1) + "</b>" +
				'<button type="button" data-unref="' + i + '" aria-label="' + esc(T("Remove picture {n}", { n: i + 1 })) + '" title="' + esc(T("Remove")) + '">×</button></span>';
		}).join("") + (P.pend.length ? '<span class="ai-refhint">' + (kind === "vid" ? T("The video starts from this picture. Say how it should move.") :
			P.pend.length === 1 ? T("Say what to change, or how to use it (picture 1).") : T("Refer to them as picture 1, picture 2… e.g. “put the person from picture 1 in front of picture 2”.")) + "</span>" : "") +
			(P.pend.length > max ? '<span class="ai-refhint ai-err">' + (max ? T("This model takes {n} at most: remove some, or pick another model.", { n: max }) : T("This model can't take pictures: pick another model.")) + "</span>" : "");
		var lab = $(P.el.label);
		if (kind === "img") { lab.textContent = P.pend.length ? T("What should the new picture be?") : T("Describe the picture"); }
		else lab.textContent = P.pend.length ? T("How should the picture move?") : T("Describe the video");
	}
	["img", "vid"].forEach(function (kind) {
		var P = M[kind];
		$(P.el.refs).addEventListener("click", function (e) { var b = e.target.closest("[data-unref]"); if (!b || busy) return; P.pend.splice(+b.dataset.unref, 1); paintRefs(kind); paintPrice(); });
		$(P.el.file).addEventListener("change", function () { addRefs(kind, this.files); this.value = ""; });
		$(P.el.prompt).addEventListener("paste", function (e) {
			var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
			if (fs.length && !e.clipboardData.getData("text/plain")) { e.preventDefault(); addRefs(kind, fs); }
		});
		var zone = $(P.el.comp), n = 0;
		zone.addEventListener("dragenter", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") >= 0) { n++; zone.classList.add("ai-drop"); } });
		zone.addEventListener("dragleave", function () { if (--n <= 0) { n = 0; zone.classList.remove("ai-drop"); } });
		zone.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") >= 0) e.preventDefault(); });
		zone.addEventListener("drop", function (e) { n = 0; zone.classList.remove("ai-drop"); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addRefs(kind, e.dataTransfer.files); } });
		$(P.el.search).addEventListener("input", function () { P.q = this.value; paintMedia(kind); });
		$(P.el.search).addEventListener("keydown", function (e) { if (e.key === "Escape" && this.value) { e.preventDefault(); this.value = P.q = ""; paintMedia(kind); } });
	});
	$("ai-iattach").addEventListener("click", function () { $("ai-ifile").click(); });
	$("ai-vattach").addEventListener("click", function () { $("ai-vfile").click(); });
	// saves the pictures sent with a creation (so "Again with these pictures" can bring them back) -> their ids
	function keepRefs(pend) { pend.forEach(function (f) { filePut({ id: f.id, t: "img", mt: f.mt, name: f.name, data: f.data }).catch(function () {}); }); return pend.map(function (f) { return f.id; }); }
	function refsBack(kind, ids) {
		return Promise.all((ids || []).map(fileGet)).then(function (got) {
			M[kind].pend = got.filter(Boolean).map(function (f, i) { return { id: A.newId(), mt: f.mt, data: f.data, name: f.name || T("picture") + " " + (i + 1) }; });
			paintRefs(kind); paintPrice();
		});
	}

	/* the side list and the big view */
	function mediaWords(kind) { return norm(M[kind].q).split(/\s+/).filter(Boolean); }
	function mediaShown(kind) {
		var w = mediaWords(kind);
		return M[kind].list().filter(function (it) { var t = norm(it.prompt); return w.every(function (x) { return t.indexOf(x) >= 0; }); });
	}
	function itemSub(kind, it) {
		var bits = [when(it.at), it.price + " HBD"];
		if (kind === "vid") bits.unshift(it.seconds + " s");
		if (it.refs && it.refs.length) bits.push(kind === "vid" ? "🖼️" : "✏️ " + it.refs.length);
		return bits.join(" · ");
	}
	function paintMedia(kind) {
		var P = M[kind], all = P.list(), shown = mediaShown(kind), words = mediaWords(kind), sel = S[P.sel], vid = kind === "vid";
		if (sel && !all.some(function (x) { return x.id === sel; })) sel = S[P.sel] = null;
		var side = $(P.el.side);
		side.innerHTML = (words.length ? '<p class="ai-cnote">' + (shown.length ? (shown.length === 1 ? T("{n} found", { n: 1 }) : T("{n} found", { n: shown.length })) : T("Nothing has that.")) + "</p>" : "") +
			(!all.length ? '<p class="ai-cnote">' + (vid ? T("Your videos will be listed here.") : T("Your pictures will be listed here.")) + "</p>" : "") +
			shown.map(function (it) {
				return '<div class="ai-crow ai-mrow' + (it.id === sel ? " is-cur" : "") + '" role="listitem"><button type="button" class="ai-copen" data-msel="' + esc(it.id) + '"' + (it.id === sel ? ' aria-current="true"' : "") + ">" +
					(vid ? '<span class="ai-mthumb ai-mthumb--v" aria-hidden="true">🎬</span>' : '<img class="ai-mthumb" alt="" data-src="' + esc(it.id) + '">') +
					'<span class="ai-mtx"><span class="ai-ctitle">' + mark(it.prompt.slice(0, 80), words) + '</span><span class="ai-csub">' + esc(itemSub(kind, it)) + "</span></span></button></div>";
			}).join("");
		$(kind === "img" ? "ai-img" : "ai-vid").querySelector(".ai-cn").textContent = all.length || "";
		var stage = $(P.el.stage), it = sel && all.filter(function (x) { return x.id === sel; })[0];
		$(P.el.cur).textContent = it ? it.prompt.slice(0, 80) : "";
		if (it) {
			var i = shown.indexOf(it);
			stage.innerHTML = '<figure class="ai-big">' +
				'<div class="ai-bigpic">' + (vid ? '<video controls playsinline preload="metadata" data-src="v:' + esc(it.id) + '"></video>' : '<img alt="' + esc(it.prompt) + '" data-src="' + esc(it.id) + '">') +
				(i > 0 ? '<button type="button" class="ai-nav ai-nav--l" data-mstep="-1" aria-label="' + esc(T("Previous")) + '">‹</button>' : "") +
				(i >= 0 && i < shown.length - 1 ? '<button type="button" class="ai-nav ai-nav--r" data-mstep="1" aria-label="' + esc(T("Next")) + '">›</button>' : "") + "</div>" +
				"<figcaption>" + (it.refs && it.refs.length ? '<span class="ai-usedrefs">' + it.refs.map(function (r, j) { return '<span class="ai-ref ai-ref--s"><img alt="" data-src="f:' + esc(r) + '"><b class="ai-refn">' + (vid ? "▶" : j + 1) + "</b></span>"; }).join("") + "</span>" : "") +
				'<span class="ai-bigtx">' + esc(it.prompt) + '</span><span class="ai-sub">' + esc(itemSub(kind, it)) + (it.model && !vid && A.IMAGES[it.model] ? " · " + esc(T(A.IMAGES[it.model].name)) : "") + (vid && it.res ? " · " + esc(it.res) : "") + "</span></figcaption>" +
				'<div class="ai-macts">' +
				(vid ? "" : '<button type="button" class="ai-mini ai-mini--hi" data-mact="edit">' + T("✏️ Change this picture") + "</button>" +
					'<button type="button" class="ai-mini" data-mact="addref">' + T("＋ Use with other pictures") + "</button>" +
					'<button type="button" class="ai-mini" data-mact="tovid">' + T("🎬 Make a video from it") + "</button>") +
				'<button type="button" class="ai-mini" data-mact="again">' + (it.refs && it.refs.length ? (vid ? T("↺ Again from this picture") : T("↺ Again with these pictures")) : T("↺ Use this description")) + "</button>" +
				'<button type="button" class="ai-mini" data-mact="dl">' + T("Download") + "</button>" +
				'<button type="button" class="ai-mini ai-cdel" data-mact="rm">' + T("Delete") + "</button></div></figure>";
		} else if (shown.length) {
			stage.innerHTML = '<div class="ai-gal">' + shown.map(function (x) {
				return '<button type="button" class="ai-tile" data-msel="' + esc(x.id) + '" title="' + esc(x.prompt.slice(0, 200)) + '">' +
					(vid ? '<video muted playsinline preload="metadata" data-src="v:' + esc(x.id) + '"></video>' : '<img alt="' + esc(x.prompt.slice(0, 120)) + '" data-src="' + esc(x.id) + '">') +
					'<span class="ai-tilecap">' + esc(x.prompt.slice(0, 70)) + "</span></button>";
			}).join("") + "</div>";
		} else if (words.length) {
			stage.innerHTML = '<div class="ai-empty"><p>' + T("Nothing has that.") + "</p></div>";
		} else {
			stage.innerHTML = vid ? '<div class="ai-empty"><p>' + T("<b>Describe a video</b>, or start it from a picture (🖼️ Start from a picture, or 🎬 on any of your pictures). Each video is paid on its own.") + "</p></div>"
				: '<div class="ai-empty"><p>' + T("<b>Describe a picture</b>, or add pictures to change or combine them. Each picture is paid on its own.") + '</p><p class="ai-try">' + T("Try:") +
				' <button type="button" class="ai-mini" data-iex="' + esc(T("A watercolour fox sitting in fresh snow at sunrise, soft light")) + '">' + T("Watercolour fox") + "</button>" +
				' <button type="button" class="ai-mini" data-iex="' + esc(T("A clean flat logo of a square-root sign inside a circle, blue and white")) + '">' + T("A logo") + "</button>" +
				' <button type="button" class="ai-mini" data-iex="' + esc(T("Put the person from picture 1 in front of the place in picture 2, matching the light")) + '">' + T("Combine two pictures") + "</button></p></div>";
		}
		fillSrc(side); fillSrc(stage);
		if (it && narrowOf(kind === "img" ? "ai-img" : "ai-vid") && narrowOpen[kind === "img" ? "ai-img" : "ai-vid"]) { narrowOpen[kind === "img" ? "ai-img" : "ai-vid"] = false; paintSide(); }
	}
	function selectMedia(kind, id) { S[M[kind].sel] = id || null; save(); paintMedia(kind); }
	function mediaItem(kind, id) { return M[kind].list().filter(function (x) { return x.id === id; })[0]; }
	function delMedia(kind, id) {
		var P = M[kind], l = P.list(), i = -1; l.forEach(function (x, j) { if (x.id === id) i = j; });
		if (i < 0) return;
		var it = l[i], key = kind === "vid" ? "v:" + id : id, blob = null;
		idbDo("readonly", function (s) { return s.get(key); }).then(function (b) {
			blob = b;
			return idbDo("readwrite", function (s) { return s.delete(key); });
		}).then(function () {
			P.saveList(P.list().filter(function (x) { return x.id !== id; }));
			if (S[P.sel] === id) S[P.sel] = null; save(); paintMedia(kind);
			undoBar(T('Deleted "{title}".', { title: it.prompt.slice(0, 40) }), function () {
				if (!blob) return;
				idbDo("readwrite", function (s) { return s.put(blob, key); }).then(function () { var l2 = P.list(); l2.splice(Math.min(i, l2.length), 0, it); P.saveList(l2); S[P.sel] = id; save(); paintMedia(kind); });
			});
		});
	}
	function mediaBlob(kind, id) { return idbDo("readonly", function (s) { return s.get(kind === "vid" ? "v:" + id : id); }); }
	function onMediaClick(kind, e) {
		var b = e.target.closest("button"); if (!b) return;
		var P = M[kind], d = b.dataset;
		if (d.msel) { selectMedia(kind, d.msel); return; }
		if (d.iex) { $("ai-prompt").value = d.iex; paintPrice(); $("ai-prompt").focus(); return; }
		if (d.mstep) { var sh = mediaShown(kind), i = sh.map(function (x) { return x.id; }).indexOf(S[P.sel]) + (+d.mstep); if (sh[i]) selectMedia(kind, sh[i].id); return; }
		var it = mediaItem(kind, S[P.sel]); if (!it || !d.mact) return;
		if (d.mact === "dl") mediaBlob(kind, it.id).then(function (blob) {
			if (!blob) return; var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
			a.download = "mes-ai-" + it.id + "." + ((blob.type.split("/")[1] || (kind === "vid" ? "mp4" : "webp")).replace("jpeg", "jpg"));
			a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
		});
		if (d.mact === "rm") delMedia(kind, it.id);
		if (d.mact === "again") { $(P.el.prompt).value = it.prompt; refsBack(kind, it.refs).then(function () { $(P.el.prompt).focus(); }); }
		if (d.mact === "edit" || d.mact === "addref" || d.mact === "tovid") {
			var to = d.mact === "tovid" ? "vid" : "img";
			mediaBlob("img", it.id).then(function (blob) {
				if (!blob) return;
				if (d.mact === "edit") { M.img.pend = []; $("ai-prompt").value = ""; }
				if (to === "vid") { M.vid.pend = []; showTab("vid"); }
				return addRefs(to, [new File([blob], "picture.webp", { type: blob.type || "image/webp" })]).then(function () {
					var pr = $(M[to].el.prompt);
					if (d.mact === "edit") pr.placeholder = T("e.g. Make the sky stormy and add a red umbrella");
					pr.focus(); $(M[to].el.comp).scrollIntoView({ block: "nearest", behavior: "smooth" });
				});
			});
		}
	}
	$("ai-img").addEventListener("click", function (e) { if (e.target.closest("#ai-istage, #ai-ilist")) onMediaClick("img", e); });
	$("ai-vid").addEventListener("click", function (e) { if (e.target.closest("#ai-vstage, #ai-vlist")) onMediaClick("vid", e); });
	$("ai-iall").addEventListener("click", function () { selectMedia("img", null); });
	$("ai-vall").addEventListener("click", function () { selectMedia("vid", null); });
	$("ai-inew").addEventListener("click", function () { if (busy) return; M.img.pend = []; paintRefs("img"); $("ai-prompt").value = ""; $("ai-prompt").placeholder = T("e.g. A watercolour fox sitting in fresh snow at sunrise, soft light"); selectMedia("img", null); paintPrice(); $("ai-prompt").focus(); });
	$("ai-vnew").addEventListener("click", function () { if (busy) return; M.vid.pend = []; paintRefs("vid"); $("ai-vprompt").value = ""; selectMedia("vid", null); paintPrice(); $("ai-vprompt").focus(); });
	document.addEventListener("keydown", function (e) {
		if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey) return;
		var t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(t.tagName))) return;
		var kind = S.tab === "img" ? "img" : S.tab === "vid" ? "vid" : null; if (!kind || !S[M[kind].sel]) return;
		var r = $(kind === "img" ? "ai-img" : "ai-vid").getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
		var sh = mediaShown(kind), i = sh.map(function (x) { return x.id; }).indexOf(S[M[kind].sel]) + (e.key === "ArrowRight" ? 1 : -1);
		if (sh[i]) { e.preventDefault(); selectMedia(kind, sh[i].id); }
	});

	function mockImage(prompt, size, refs) {
		var wh = size.split("x").map(Number), cv = document.createElement("canvas"); cv.width = wh[0] / 4; cv.height = wh[1] / 4;
		var x = cv.getContext("2d"), g = x.createLinearGradient(0, 0, cv.width, cv.height);
		g.addColorStop(0, "#5b3fd6"); g.addColorStop(1, "#0f766e"); x.fillStyle = g; x.fillRect(0, 0, cv.width, cv.height);
		x.fillStyle = "#fff"; x.font = "bold 14px sans-serif"; x.fillText(refs && refs.length ? "Simulated edit" : "Simulated picture", 12, 24); x.font = "12px sans-serif"; x.fillText(prompt.slice(0, 40), 12, 44);
		// the reference pictures drawn small along the bottom, so an edit visibly used them
		return Promise.all((refs || []).map(function (r) { return createImageBitmap(b64Blob(r.data, r.mt)).catch(function () { return null; }); })).then(function (bms) {
			var w = Math.min(70, (cv.width - 16) / Math.max(1, bms.length) - 6);
			bms.forEach(function (bm, i) { if (bm) x.drawImage(bm, 10 + i * (w + 6), cv.height - w - 10, w, w); });
			return new Promise(function (res) { cv.toBlob(res, "image/webp", 0.85); });
		});
	}
	var pendingImg = null; // {id, prompt, quality, size, price, acct, refs} when a picture failed after payment
	$("ai-make").addEventListener("click", function () { makeImage(false); });
	$("ai-prompt").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); makeImage(false); } });
	function makeImage(isRetry) {
		if (busy) return;
		var u = who();
		var prompt = $("ai-prompt").value.trim(), quality = $("ai-q").value, size = $("ai-size").value, imod = S.imod, refs = M.img.pend.slice();
		if (!status.image || !provOn(A.IMAGES[imod].prov)) { msg(T("{name} pictures are coming soon.", { name: T(A.IMAGES[imod].name) }), "err"); return; }
		if (!u) { msg(T("Log in with your Hive account first (above)."), "err"); return; }
		var err = isRetry ? null : A.checkImage(prompt, quality, size, imod) || A.checkRefs(refs, A.maxRefs("image", imod));
		if (err) { msg(T(err), "err"); return; }
		setBusy(true);
		var sendRefs = refs.map(function (f) { return { mt: f.mt, data: f.data }; });
		var job = isRetry ? Promise.resolve(pendingImg) : quote({ acct: u.name, kind: "image", model: imod, prompt: prompt, quality: quality, size: size, refs: sendRefs }).then(function (q) {
			if (q.status !== 200) throw new Error(T(q.error) || T("Could not get a price (HTTP {s}).", { s: q.status }));
			msg(T("Price: {p} HBD ({usd}). Confirm the payment in Hive Keychain…", { p: q.price, usd: A.fmtUsd(q.usd) }));
			return pay(q).then(function () { return { id: q.id, model: imod, prompt: prompt, quality: quality, size: size, price: q.price, acct: u.name, refs: refs }; });
		});
		job.then(function (j) {
			pendingImg = null;
			msg(j.refs && j.refs.length ? T("Paid. Changing the picture (this takes up to a minute)…") : T("Paid. Making the picture (this takes up to a minute)…"));
			if (mock) {
				var info = MOCK_Q[j.id]; info.tries++;
				if (/fail/i.test(j.prompt) && info.tries === 1) return { j: j, err: { msg: T("Simulated failure after payment."), retry: true } };
				return sleep(1200).then(function () { return mockImage(j.prompt, j.size, j.refs); }).then(function (blob) { return { j: j, blob: blob }; });
			}
			return runReq(j.id, j.acct, function (n) { msg(T("Waiting for the blockchain… ({s} s)", { s: n * 3 })); }).then(function (r) {
				if (r.error) return { j: j, err: { msg: r.error.error, retry: r.error.retry } };
				return jsonOf(r).then(function (d) { return d.t === "image" ? { j: j, blob: b64Blob(d.b64, d.mime) } : { j: j, err: { msg: d.msg || d.error, retry: d.retry } }; });
			});
		}).then(function (out) {
			if (!out) return;
			if (out.err) {
				if (out.err.retry) { pendingImg = out.j; msg(T(out.err.msg) + " ", "err"); addRetryImg(); }
				else msg(T(out.err.msg) || T("The picture failed."), "err");
				return;
			}
			var key = out.j.id, refIds = keepRefs(out.j.refs || []);
			return idbDo("readwrite", function (s) { return s.put(out.blob, key); }).then(function () {
				var l = imgList(), rec = { id: key, model: out.j.model, prompt: out.j.prompt, quality: out.j.quality, size: out.j.size, price: out.j.price, at: Date.now() };
				if (refIds.length) rec.refs = refIds;
				l.unshift(rec); imgSave(l.slice(0, 300));
				M.img.pend = []; paintRefs("img"); $("ai-prompt").value = "";
				msg(T("Done. Your picture is shown (kept in this browser): change it again with ✏️, or make a video from it."), "ok");
				S.isel = key; save(); paintMedia("img"); paintPrice();
			});
		}).catch(function (e) {
			var m = e && e.message || String(e);
			msg(/cancel|declin|denied/i.test(m) ? T("Payment cancelled: nothing was sent.") : T(m), "err");
		}).then(function () { setBusy(false); });
	}
	function addRetryImg() {
		var b = document.createElement("button"); b.type = "button"; b.className = "tu-btn tu-btn--primary"; b.textContent = T("Try again (free)");
		b.addEventListener("click", function () { makeImage(true); });
		$("ai-msg").appendChild(b);
	}

	/* ---------- videos (Grok Imagine): pay, start a job, follow it every 5 s, fetch the file into IndexedDB ---------- */
	var V = A.VIDEO, LS_VJ = "mes-ai:vjobs", LS_VID = "mes-ai:vids";
	$("ai-vmodel").innerHTML = Object.keys(V.models).map(function (k) { return '<option value="' + k + '">' + esc(T(V.models[k].name)) + "</option>"; }).join("");
	$("ai-vmodel").value = "lite";
	$("ai-vsec").innerHTML = V.durations.map(function (d) { return '<option value="' + d + '"' + (d === 5 ? " selected" : "") + ">" + T("{n} seconds", { n: d }) + "</option>"; }).join("");
	function paintVres() {
		var m = V.models[$("ai-vmodel").value], cur = $("ai-vres").value || "480p", max = V.res.indexOf(m.maxRes);
		$("ai-vres").innerHTML = V.res.filter(function (r, i) { return i <= max; }).map(function (r) { return '<option value="' + r + '">' + r + "</option>"; }).join("");
		$("ai-vres").value = V.res.indexOf(cur) <= max ? cur : "480p";
	}
	paintVres();
	function vq() { return A.videoQuote($("ai-vmodel").value, +$("ai-vsec").value, $("ai-vres").value, M ? M.vid.pend.length : 0); }
	function paintVprice() {
		var q = vq();
		$("ai-vprice").innerHTML = "<b>" + q.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(q) + ")</span>";
		$("ai-vmake").disabled = !(status.video && !busy);
		$("ai-vmake").textContent = status.video ? T("Pay & create") : T("Coming soon");
		$("ai-vattach").hidden = !A.maxRefs("video", $("ai-vmodel").value);
	}
	$("ai-vmodel").addEventListener("change", function () { paintVres(); paintRefs("vid"); paintVprice(); });
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
				(j.err ? esc(T(j.err)) : j.dl ? T("downloading…") : T("being made ({n} min so far)", { n: mins })) + "</span>" +
				(j.retry ? ' <button type="button" class="tu-btn tu-btn--primary" data-vretry="' + j.id + '">' + T("Try again (free)") + '</button>' : "") +
				(j.err ? ' <button type="button" class="ai-mini" data-vdrop="' + j.id + '">' + T("Remove") + '</button>' : "") + "</div>";
		}).join("");
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
			if (/fail/i.test(j.prompt) && !j.retried && m.polls > 1) return Promise.resolve({ status: "failed", retry: true, msg: T("Simulated failure.") });
			return Promise.resolve(m.polls > 2 ? { status: "done" } : { status: "pending" });
		}
		return post({ op: "vstatus", id: j.id, acct: j.acct }).then(jsonOf);
	}
	function vfetch(j) {
		if (mock) return mockVideo(j.prompt);
		return fetch("/api/ai?op=vfile&id=" + encodeURIComponent(j.id) + "&acct=" + encodeURIComponent(j.acct), { credentials: "omit" }).then(function (r) {
			if (!r.ok) return jsonOf(r).then(function (e) { throw new Error(T(e.error) || T("Could not download the video.")); });
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
							var v = vids(), rec = { id: me.id, prompt: me.prompt, seconds: me.seconds, res: me.res, price: me.price, at: Date.now() };
							if (me.refs && me.refs.length) rec.refs = me.refs;
							v.unshift(rec); vidsSave(v.slice(0, 100));
							vjobsSave(vjobs().filter(function (x) { return x.id !== me.id; })); S.vsel = me.id; save(); paintMedia("vid"); msg(T("Your video is ready (kept in this browser)."), "ok");
						});
					}).catch(function (e) { var a = vjobs(), m2 = a.filter(function (x) { return x.id === me.id; })[0]; if (m2) { m2.dl = false; m2.err = e.message; vjobsSave(a); } });
				}
				if (s.status === "failed") { me.err = s.msg || T("The video failed."); me.retry = !!s.retry; vjobsSave(all); }
				if (s.error) { me.err = s.error; vjobsSave(all); }
			}).catch(function () { /* network blip: next round */ });
		})).then(function () { paintVjobs(); if (vjobs().some(function (j) { return !j.err && !j.dl; })) vtimer = setTimeout(vpoll, mock ? 1500 : 5000); });
	}
	function startVideo(j, isRetry) {
		var go = mock ? Promise.resolve({ t: "video" }) : runReq(j.id, j.acct, function (n) { msg(T("Waiting for the blockchain… ({s} s)", { s: n * 3 })); }).then(function (r) { return r.error ? { err: r.error } : jsonOf(r); });
		return go.then(function (d) {
			if (d.err || d.t !== "video") { var e = d.err || d; j.err = e.error || e.msg || T("The video could not start."); j.retry = !!e.retry; }
			else { j.err = null; j.retry = false; j.at = Date.now(); if (isRetry) j.retried = true; msg(T("Paid. Your video is being made: it takes a few minutes."), "ok"); }
			var l = vjobs().filter(function (x) { return x.id !== j.id; }); l.unshift(j); vjobsSave(l); vpoll();
		});
	}
	$("ai-vmake").addEventListener("click", makeVideo);
	$("ai-vprompt").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); makeVideo(); } });
	function makeVideo() {
		if (busy) return;
		var u = who(), prompt = $("ai-vprompt").value.trim(), model = $("ai-vmodel").value, sec = +$("ai-vsec").value, res = $("ai-vres").value, audio = $("ai-vaudio").checked, refs = M.vid.pend.slice();
		if (!status.video) { msg(T("Videos are coming soon."), "err"); return; }
		if (!u) { msg(T("Log in with your Hive account first (above)."), "err"); return; }
		var err = A.checkVideo(prompt, model, sec, res, refs.length > 0) || A.checkRefs(refs, A.maxRefs("video", model)); if (err) { msg(T(err), "err"); return; }
		setBusy(true);
		var sendRefs = refs.map(function (f) { return { mt: f.mt, data: f.data }; });
		var qreq = mock ? Promise.resolve((function () { var q = A.videoQuote(model, sec, res, refs.length), id = A.newId(); return { status: 200, id: id, memo: A.memoFor(id), price: q.price, usd: q.hbd }; })())
			: quote({ acct: u.name, kind: "video", prompt: prompt, model: model, seconds: sec, res: res, audio: audio, refs: sendRefs });
		qreq.then(function (q) {
			if (q.status !== 200) throw new Error(T(q.error) || T("Could not get a price (HTTP {s}).", { s: q.status }));
			msg(T("Price: {p} HBD ({usd}). Confirm the payment in Hive Keychain…", { p: q.price, usd: A.fmtUsd(q.usd) }));
			return pay(q).then(function () {
				var refIds = keepRefs(refs); M.vid.pend = []; paintRefs("vid");
				var j = { id: q.id, acct: u.name, prompt: prompt, seconds: sec, res: res, price: q.price, at: Date.now() };
				if (refIds.length) j.refs = refIds;
				return startVideo(j, false);
			});
		}).catch(function (e) { var m = e && e.message || String(e); msg(/cancel|declin|denied/i.test(m) ? T("Payment cancelled: nothing was sent.") : T(m), "err"); })
			.then(function () { setBusy(false); });
	}
	$("ai-vjobs").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.vretry) { var j = vjobs().filter(function (x) { return x.id === b.dataset.vretry; })[0]; if (j) { if (mock) MOCK_V[j.id] = { polls: 0 }; startVideo(j, true); } }
		if (b.dataset.vdrop) { vjobsSave(vjobs().filter(function (x) { return x.id !== b.dataset.vdrop; })); paintVjobs(); }
	});

	/* ---------- chat -> Pictures / Videos: a chat model writes text; "make a picture of ..." is offered to the right tab ---------- */
	function offerMedia(wm, text) {
		var isV = wm.kind === "video", m = $("ai-msg");
		msg(isV ? T("This sounds like a video. The chat models write text; videos are made in the 🎬 Video tab.") : T("This sounds like a picture. The chat models write text; pictures are made in the 🖼️ Picture tab."));
		var go = document.createElement("button"); go.type = "button"; go.className = "tu-btn tu-btn--primary";
		go.textContent = isV ? T("🎬 Make it in Video") : T("🖼️ Make it in Picture");
		go.addEventListener("click", function () {
			var kind = isV ? "vid" : "img", pics = PEND.filter(function (f) { return f.t === "img"; });
			showTab(kind);
			$(M[kind].el.prompt).value = wm.prompt;
			$("ai-in").value = "";
			var add = pics.length ? addRefs(kind, pics.map(function (f) { return new File([b64Blob(f.data, f.mt)], f.name || "picture", { type: f.mt }); })) : Promise.resolve();
			PEND = PEND.filter(function (f) { return f.t !== "img"; }); paintFiles();
			add.then(function () { msg(T("Check the description and the price, then press Pay & create."), "ok"); paintPrice(); $(M[kind].el.prompt).focus(); });
		});
		var anyway = document.createElement("button"); anyway.type = "button"; anyway.className = "tu-btn tu-btn--ghost";
		anyway.textContent = T("Send it to the chat anyway");
		anyway.addEventListener("click", function () { msg(""); send(true); });
		m.appendChild(go); m.appendChild(anyway);
		go.focus();
	}

	/* ---------- 💾 saving: cloud file (MESCloud), Hive backup (MESHiveStore), file backup ---------- */
	function sig() { return S.chats.map(function (c) { return c.id + ":" + c.msgs.filter(function (m) { return !m.pending; }).length + ":" + c.at + ":" + (c.mt || 0); }).join("|") + "|" + folderNames().join("/"); }
	function mergeIn(chats, how, folders) {
		var r = A.mergeChats(S.chats, chats);
		S.chats = r.chats; (folders || []).forEach(ensureFolder); S.chats.forEach(function (c) { if (c.folder) ensureFolder(c.folder); }); if (!S.chats.some(function (c) { return c.id === S.cur; })) S.cur = S.chats[0] ? S.chats[0].id : null;
		save(); renderLog(); paintPrice();
		var body = r.added || r.updated ? (r.added === 1 ? T("{n} new chat", { n: r.added }) : T("{n} new chats", { n: r.added })) + (r.updated ? ", " + T("{n} updated", { n: r.updated }) : "") + "." : T("you already had all of them.");
		return (how ? how + ": " : "") + body;
	}
	$("ai-export").addEventListener("click", function () { var d = $("ai-save"); d.open = true; d.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
	function download(name, text, type) {
		var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
	}
	$("ai-dl-md").addEventListener("click", function () {
		var c = A.cleanChat(cur()); if (!c || !c.msgs.length) { msg(T("This chat is empty."), "err"); return; }
		download((c.title.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") || "chat") + ".md", A.chatMarkdown(c), "text/markdown");
	});
	$("ai-open-text").addEventListener("click", function () {
		var c = A.cleanChat(cur()); if (!c || !c.msgs.length) { msg(T("This chat is empty."), "err"); return; }
		var name = (c.title.replace(/[^\w -]+/g, "").trim().slice(0, 50).replace(/ +/g, "-") || "chat") + ".md";
		var f = new File([A.chatMarkdown(c)], name, { type: "text/markdown" });
		if (!window.MESLinkOpen) { download(name, A.chatMarkdown(c), "text/markdown"); return; }
		window.MESLinkOpen.sendTo("text", f, { busy: true }).catch(function (e) { msg(T("Could not open it: {m}", { m: T(e.message) }), "err"); });
	});
	$("ai-dl-all").addEventListener("click", function () {
		var b = A.backup(S.chats, 0, folderNames()); if (!b.chats.length) { msg(T("No chats to back up yet."), "err"); return; }
		download("MES AI chats " + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(b, null, 1), "application/json");
	});
	$("ai-restore").addEventListener("change", function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		f.text().then(function (t) { msg(mergeIn(A.readBackup(t), T("Restored"), A.readFolders(t)), "ok"); }).catch(function (e) { msg(T(e.message), "err"); });
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
		bytes: function () { return Promise.resolve(new TextEncoder().encode(JSON.stringify(A.backup(S.chats, 0, folderNames())))); },
		open: function (u8, name) {
			var txt = new TextDecoder().decode(u8), chats = A.readBackup(txt);
			var note = mergeIn(chats, T("From {name}", { name: name }), A.readFolders(txt));
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
	if (!cloud) $("ai-cloudrow").innerHTML = '<p class="tu-note">' + T("The cloud script did not load. Reload the page to try again.") + '</p>';
	var saveRaw = save;
	save = function () { saveRaw(); if (cloud && cloud.linked(cdoc)) { cloud.changed(cdoc); paintSaveState(); } };
	function paintSaveState() {
		var l = cloud && cloud.link(cdoc);
		var where = l ? (l.p === "file" ? l.name : (cloud.providers[l.p] ? cloud.providers[l.p].name : l.p)) : "";
		$("ai-savestate").textContent = l ? "· ☁ " + (cloudSig === sig() ? T("saved to {where}", { where: where }) : T("saving to {where}", { where: where })) : "";
	}

	// Hive: custom_json "mes_store", app "mes-ai", name "chat" (one chat) or "all"; encrypted by default ("mes-ai:hiveenc" "0" = off)
	var HAPP = "mes-ai", ENC = "mes-ai:hiveenc", hvList = null, hvBusy = false;
	function HS() { return window.MESHiveStore; }
	function hmsg(t, cls) { var m = $("ai-hv-msg"); m.textContent = t || ""; m.className = "tu-note ai-hvmsg" + (cls ? " is-" + cls : ""); }
	function hvErr(e) { return e && e.code === "cancel" ? T("Cancelled.") : e && e.code === "toobig" ? T("Too big for one Hive save (about 150 KB packed). Save one chat at a time, or use the cloud.") : (e && e.message && T(e.message)) || T("Something went wrong."); }
	function hvKb(n) { return n < 1024 ? T("{n} bytes", { n: n }) : (n / 1024).toLocaleString(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " KB"; }
	function hvWhen(t) { var d = new Date(/Z$/.test(t) ? t : t + "Z"); return isNaN(d) ? t : d.toLocaleString(L ? LOC : undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
	function paintHvWarn() {
		var w = $("ai-hv-warn"), enc = $("ai-hv-enc").checked;
		if (HS() && HS().canEncrypt && !HS().canEncrypt() && !(HS().lockMode && HS().lockMode() === "pass")) w.innerHTML = "⚠ " + T("<b>Logged in with the Keychain phone app:</b> it can't use your memo key, so pick <b>🛡 Passphrase</b> under the Encrypt tick, or the save would be public.");
		else w.innerHTML = enc ? (HS() && HS().lockMode && HS().lockMode() === "pass" ? "🛡 " + T("Locked with your passphrase (quantum-safe): only the passphrase opens it.") : "🔒 " + T("Encrypted with your memo key: only you can open it.")) + " " + T("Others can see that a backup exists, when, and its size.")
			: "⚠ " + T("<b>Public:</b> the chat text will be readable by anyone on the Hive blockchain, forever.");
		w.className = "ai-hvwarn" + (enc ? "" : " is-open");
	}
	function hvReady() {
		if (mock) { hmsg(T("Local preview: Hive saving is switched off here (no real Keychain)."), "err"); return null; }
		if (!HS() || !H) { hmsg(T("The Hive scripts did not load. Reload the page."), "err"); return null; }
		var u = H.user(); if (!u) { hmsg(T("Log in with Hive Keychain first (at the top of the page)."), "err"); $("ai-acct-card").scrollIntoView({ block: "center" }); return null; }
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
		var one = $("ai-hv-what").value === "chat", b = A.backup(one ? [cur()] : S.chats, 0, one ? [] : folderNames());
		if (!b.chats.length) { hmsg(one ? T("This chat is empty.") : T("No chats to save yet."), "err"); return; }
		var enc = $("ai-hv-enc").checked;
		if (!enc && !confirm(T("Save WITHOUT encryption?\n\nThe chat text will be public on the Hive blockchain, readable by anyone, and can never be deleted."))) return;
		hvBusySet(true);
		HS().save(HAPP, one ? "chat" : "all", b, { encrypt: enc, onProgress: function (m) { hmsg(T(m)); } }).then(function (r) {
			var what = one ? T("this chat") : (b.chats.length === 1 ? T("{n} chat", { n: 1 }) : T("{n} chats", { n: b.chats.length }));
			hmsg(T("Saved {what} to @{name} on Hive ({size}).", { what: what, name: u.name, size: hvKb(r.bytes) + ", " + (enc ? T("encrypted") : T("public")) }), "ok");
			hvList = null; setTimeout(function () { hvLoad(true); }, 4000);
		}).catch(function (e) { hmsg(hvErr(e), "err"); }).then(function () { hvBusySet(false); });
	});
	function hvLoad(quiet) {
		var u = hvReady(); if (!u || (hvBusy && !quiet)) return;
		hvBusySet(true); if (!quiet) hmsg(T("Looking for your saves on Hive…"));
		HS().list(u.name, { app: HAPP, pages: 30 }).then(function (saves) {
			hvList = saves.filter(function (e) { return e.name === "chat" || e.name === "all"; }).slice(0, 15);
			$("ai-hv-list").innerHTML = hvList.length ? '<ul class="ai-hvl">' + hvList.map(function (e, i) {
				return "<li><span><b>" + esc(hvWhen(e.time)) + "</b> <span class=\"ai-sub\">" + (e.name === "chat" ? T("One chat") : T("All chats")) + " · " + esc(HS().lockLabel ? T(HS().lockLabel(e)) : (e.encrypted ? T("encrypted") : T("public"))) + " · " + hvKb(e.bytes) + (e.complete ? "" : " · " + T("incomplete")) + "</span></span>" +
					(e.complete ? '<button type="button" class="tu-btn tu-btn--ghost" data-hv="' + i + '">' + T("Add to my chats") + '</button>' : "") + "</li>";
			}).join("") + "</ul>" : "";
			if (!quiet) hmsg(hvList.length ? T("Pick a save to add its chats to yours.") : T("No MES AI saves found on @{name} yet.", { name: u.name }), hvList.length ? "" : "err");
		}).catch(function (e) { hmsg(T("Could not read from Hive: {m}", { m: hvErr(e) }), "err"); }).then(function () { hvBusySet(false); });
	}
	$("ai-hv-load").addEventListener("click", function () { hvLoad(false); });
	$("ai-hv-list").addEventListener("click", function (e) {
		var b = e.target.closest("[data-hv]"); if (!b || hvBusy) return;
		var it = hvList[+b.dataset.hv]; hvBusySet(true);
		hmsg(it.lock === "pass" ? T("Unlocking with your passphrase…") : it.encrypted ? T("Confirm in Keychain: decrypt with your memo key…") : T("Opening the save…"));
		HS().load(it).then(function (d) { hmsg(mergeIn(A.readBackup(d), T("Loaded from Hive"), A.readFolders(d)), "ok"); }).catch(function (x) { hmsg(hvErr(x), "err"); }).then(function () { hvBusySet(false); });
	});

	/* ---------- tabs ---------- */
	function showTab(t) {
		S.tab = t; save();
		$("ai-tab-chat").setAttribute("aria-selected", t === "chat"); $("ai-tab-img").setAttribute("aria-selected", t === "img"); $("ai-tab-vid").setAttribute("aria-selected", t === "vid");
		$("ai-chat").hidden = t !== "chat"; $("ai-img").hidden = t !== "img"; $("ai-vid").hidden = t !== "vid";
		if (t === "chat" && R) R.typeset($("ai-log"));
		if (t === "img") paintMedia("img");
		if (t === "vid") { paintMedia("vid"); paintVjobs(); }
	}
	$("ai-tab-chat").addEventListener("click", function () { showTab("chat"); });
	$("ai-tab-img").addEventListener("click", function () { showTab("img"); });
	$("ai-tab-vid").addEventListener("click", function () { showTab("vid"); });

	/* ---------- switched on? ---------- */
	function paintOff() {
		var o = $("ai-off");
		// a service whose key is not set yet: "Coming soon" on its tab, a note in its panel, and its button off
		[["ai-tab-img", "ai-img", status.image, "🖼️ " + T("Picture"), T("Pictures are coming soon.")], ["ai-tab-vid", "ai-vid", status.video, "🎬 " + T("Video"), T("Videos are coming soon.")]].forEach(function (x) {
			var soon = status.known && !x[2];
			$(x[0]).innerHTML = x[3] + (soon ? ' <span class="ai-soon-tag">' + T("soon") + '</span>' : "");
			var n = $(x[1]).querySelector(".ai-soon");
			if (soon && !n) { n = document.createElement("p"); n.className = "ai-soon"; n.innerHTML = "<b>" + x[4] + "</b> " + T("The page is ready; this AI service is being connected. Chat works now."); $(x[1]).insertBefore(n, $(x[1]).firstChild); }
			if (!soon && n) n.remove();
		});
		var off = status.known && !status.chat;
		o.hidden = !off;
		if (!off) return;
		o.innerHTML = T('<b>MES AI is coming soon.</b> The page is ready; the AI services are being connected. <a href="?mock=1">Try the demo</a> (simulated payment and answer).');
	}
	if (!mock) {
		fetch("/api/ai?op=status", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) {
			status = { chat: !!j.chat, image: !!j.image, video: !!j.video, known: true, prov: j.prov || { anthropic: !!j.chat, openai: !!j.image, xai: !!j.video } };
			FREEST.on = !!(j.free && j.free.on); FREEST.perDay = (j.free && j.free.perDay) || A.FREE.perDay; if (FREEST.on) loadFree();
			fillModels(); paintOff(); paintPrice();
		}).catch(function () { status = { chat: false, image: false, video: false, known: true, prov: {} }; fillModels(); paintOff(); paintPrice(); });
	}

	/* ---------- Fill window: the whole app (account, the Chat / Picture / Video tabs and their panels), so the tabs work inside it ---------- */
	function addPanel() { if (window.MESPanel) window.MESPanel.add($("ai-app"), { bar: $("ai-modes"), t: T }); }
	if (window.MESPanel) addPanel(); else window.addEventListener("load", addPanel);

	if (H && H.onChange) H.onChange(function () { paintAcct(); });
	paintAcct(); renderLog(); showTab(S.tab); paintOff(); if (mock) loadFree(); paintPrice(); vjobsSave(vjobs().map(function (j) { j.dl = false; return j; })); vpoll();
	window.MESAIDebug = { S: S, status: status, send: send, mock: mock };
})();
