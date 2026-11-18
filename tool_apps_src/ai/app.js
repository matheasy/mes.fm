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
	var status = { chat: mock, image: mock, known: mock };
	var busy = false;

	/* ---------- saved state ---------- */
	function load() { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
	var S = load() || {};
	if (!Array.isArray(S.chats)) S.chats = [];
	if (!A.MODELS[S.model]) S.model = A.DEFAULT_MODEL;
	if (!A.LENGTHS[S.len]) S.len = "medium";
	var qTab = /[?&]tab=(img|chat)\b/.exec(location.search);
	if (qTab) S.tab = qTab[1];
	if (S.tab !== "img") S.tab = "chat";
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

	/* ---------- chat log ---------- */
	function modelName(k) { return (A.MODELS[k] && A.MODELS[k].name) || k; }
	function renderMsg(m, i) {
		var mine = m.role === "user";
		var meta = "";
		if (mine && m.price) meta = '<span class="ai-meta">' + esc(m.price) + " HBD · " + esc(modelName(m.model)) + " · " + esc(A.LENGTHS[m.len] || "") + (m.memo ? ' · <a href="' + (mock ? "#" : "https://hivehub.dev/@" + esc(m.acct || "") + "/wallet") + '" target="_blank" rel="noopener" title="Payment memo">' + esc(m.memo) + "</a>" : "") + "</span>";
		var body = mine ? '<div class="ai-text ai-plain">' + esc(m.content) + "</div>" : '<div class="ai-text ai-md">' + (m.content ? md(m.content) : m.error ? "" : m.thinking ? '<p class="ai-thinking">Thinking…</p>' : '<p class="ai-thinking">Waiting for the answer…</p>') + "</div>";
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
	$("ai-model").innerHTML = Object.keys(A.MODELS).map(function (k) { return '<option value="' + k + '">' + esc(A.MODELS[k].name) + "</option>"; }).join("");
	$("ai-model").value = S.model;
	$("ai-len").innerHTML = Object.keys(A.LENGTHS).map(function (k) { return '<button type="button" data-len="' + k + '" aria-pressed="' + (k === S.len) + '">' + A.LENGTHS[k] + "</button>"; }).join("");
	$("ai-model").addEventListener("change", function () { S.model = this.value; save(); paintPrice(); });
	$("ai-len").addEventListener("click", function (e) { var b = e.target.closest("[data-len]"); if (!b) return; S.len = b.dataset.len; save(); [].forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", x === b); }); paintPrice(); });
	function draftMessages() {
		var text = $("ai-in").value.trim();
		var hist = cur().msgs.filter(function (m) { return m.content && !m.error; }).map(function (m) { return { role: m.role, content: m.content }; });
		// a failed / unanswered exchange is not sent again: keep turns valid
		var clean = [];
		hist.forEach(function (m) { if (clean.length % 2 === 0 ? m.role === "user" : m.role === "assistant") clean.push(m); });
		if (clean.length % 2) clean.pop();
		if (text) clean.push({ role: "user", content: text });
		return clean;
	}
	function usdOf(q) { return A.fmtUsd(q.hbd * A.HBD_USD); }
	function paintPrice() {
		var m = A.MODELS[S.model];
		$("ai-modelnote").textContent = m.blurb + " Answer up to about " + Math.round(m.caps[S.len] * 0.75).toLocaleString("en-US") + " words" + (S.model === "opus" ? " (its thinking counts too)." : ".");
		var msgs = draftMessages(), q = A.chatQuote(S.model, A.estimateChatTokens(msgs.length ? msgs : [{ role: "user", content: "" }]), S.len);
		var hist = msgs.length > 1 ? ' <span class="ai-sub">incl. ' + Math.floor(msgs.length / 2) + " earlier exchange" + (msgs.length > 3 ? "s" : "") + "</span>" : "";
		$("ai-price").innerHTML = "about <b>" + q.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(q) + ")</span>" + hist;
		var on = status.chat && !busy;
		$("ai-send").disabled = !on;
		$("ai-send").textContent = busy ? "Working…" : "Pay & send";
		var iq = A.imageQuote($("ai-q").value, $("ai-size").value, Math.ceil($("ai-prompt").value.length / 2) + 8);
		$("ai-iprice").innerHTML = "<b>" + iq.price + " HBD</b> <span class=\"ai-sub\">(" + usdOf(iq) + ")</span>";
		$("ai-make").disabled = !(status.image && !busy);
	}
	["ai-in", "ai-prompt"].forEach(function (id) { $(id).addEventListener("input", paintPrice); });
	["ai-q", "ai-size"].forEach(function (id) { $(id).addEventListener("change", paintPrice); });
	$("ai-in").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
	$("ai-send").addEventListener("click", send);

	/* ---------- price table in the "how" box ---------- */
	(function () {
		document.querySelectorAll("[data-margin]").forEach(function (x) { x.textContent = A.MARGIN; });
		$("ai-checked").textContent = A.PRICES_CHECKED;
		$("ai-imodel").textContent = A.IMAGE.name;
		var rows = ["<tr><th>Model</th><th>Short</th><th>Medium</th><th>Long</th></tr>"];
		Object.keys(A.MODELS).forEach(function (k) {
			rows.push("<tr><td>" + esc(A.MODELS[k].name) + "</td>" + Object.keys(A.LENGTHS).map(function (l) { return "<td>" + A.chatQuote(k, 500, l).price + " HBD</td>"; }).join("") + "</tr>");
		});
		rows.push('<tr><td colspan="4" class="ai-sub">A new chat with a short question (about 500 tokens sent). Longer chats cost more.</td></tr>');
		rows.push("<tr><th>Picture (square)</th><th>Draft</th><th>Good</th><th>Best</th></tr><tr><td>" + esc(A.IMAGE.name) + "</td>" + ["low", "medium", "high"].map(function (ql) { return "<td>" + A.imageQuote(ql, "1024x1024", 40).price + " HBD</td>"; }).join("") + "</tr>");
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
					var q = body.kind === "image" ? A.imageQuote(body.quality, body.size, Math.ceil(body.prompt.length / 2) + 8) : A.chatQuote(body.model, A.estimateChatTokens(body.messages), body.len);
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
		if (!text) { $("ai-in").focus(); return; }
		if (!status.chat) { msg("MES AI chat is not switched on yet.", "err"); return; }
		if (!u) { msg("Log in with your Hive account first (above).", "err"); $("ai-acct-card").scrollIntoView({ block: "center" }); return; }
		var msgs = draftMessages();
		var err = A.checkMessages(msgs);
		if (err) { msg(err, "err"); return; }
		var c = cur();
		// a failed exchange at the end is dropped before the new message
		while (c.msgs.length && (c.msgs[c.msgs.length - 1].error || c.msgs[c.msgs.length - 1].role === "user") && !c.msgs[c.msgs.length - 1].retryId) c.msgs.pop();
		setBusy(true);
		msg("Getting the exact price…");
		quote({ acct: u.name, kind: "chat", model: S.model, len: S.len, messages: msgs }).then(function (q) {
			if (q.status !== 200) throw new Error(q.error || "Could not get a price (HTTP " + q.status + ").");
			msg("Price: " + q.price + " HBD (" + A.fmtUsd(q.usd) + "). Confirm the payment in Hive Keychain…");
			return pay(q).then(function () { return q; });
		}).then(function (q) {
			var um = { role: "user", content: text, at: Date.now(), price: q.price, memo: q.memo, model: S.model, len: S.len, acct: u.name };
			var am = { role: "assistant", content: "", at: Date.now(), pending: true, model: S.model };
			if (!c.msgs.length) c.title = text.replace(/\s+/g, " ").slice(0, 60);
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
		var prompt = $("ai-prompt").value.trim(), quality = $("ai-q").value, size = $("ai-size").value;
		if (!status.image) { msg("Pictures are not switched on yet.", "err"); return; }
		if (!u) { msg("Log in with your Hive account first (above).", "err"); return; }
		var err = isRetry ? null : A.checkImage(prompt, quality, size);
		if (err) { msg(err, "err"); return; }
		setBusy(true);
		var job = isRetry ? Promise.resolve(pendingImg) : quote({ acct: u.name, kind: "image", prompt: prompt, quality: quality, size: size }).then(function (q) {
			if (q.status !== 200) throw new Error(q.error || "Could not get a price (HTTP " + q.status + ").");
			msg("Price: " + q.price + " HBD (" + A.fmtUsd(q.usd) + "). Confirm the payment in Hive Keychain…");
			return pay(q).then(function () { return { id: q.id, prompt: prompt, quality: quality, size: size, price: q.price, acct: u.name }; });
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
				var l = imgList(); l.unshift({ id: key, prompt: out.j.prompt, quality: out.j.quality, size: out.j.size, price: out.j.price, at: Date.now() }); imgSave(l.slice(0, 200));
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

	/* ---------- tabs ---------- */
	function showTab(t) {
		S.tab = t; save();
		$("ai-tab-chat").setAttribute("aria-selected", t === "chat"); $("ai-tab-img").setAttribute("aria-selected", t === "img");
		$("ai-chat").hidden = t !== "chat"; $("ai-img").hidden = t !== "img";
		if (t === "img") paintGal();
	}
	$("ai-tab-chat").addEventListener("click", function () { showTab("chat"); });
	$("ai-tab-img").addEventListener("click", function () { showTab("img"); });

	/* ---------- switched on? ---------- */
	function paintOff() {
		var o = $("ai-off");
		var off = status.known && !status.chat && !status.image;
		o.hidden = !(status.known && (!status.chat || !status.image));
		if (o.hidden) return;
		o.innerHTML = off ? '<b>MES AI is not switched on yet.</b> The page is ready; the AI services are being connected. <a href="?mock=1">Try the demo</a> (simulated payment and answer).'
			: !status.chat ? "<b>Chat is not switched on yet.</b> Pictures work." : "<b>Pictures are not switched on yet.</b> Chat works.";
	}
	if (!mock) {
		fetch("/api/ai?op=status", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (j) {
			status = { chat: !!j.chat, image: !!j.image, known: true }; paintOff(); paintPrice();
		}).catch(function () { status = { chat: false, image: false, known: true }; paintOff(); paintPrice(); });
	}

	/* ---------- Fill window for the chat ---------- */
	function addPanel() { if (window.MESPanel) window.MESPanel.add($("ai-chat"), { bar: $("ai-chatbar") }); }
	if (window.MESPanel) addPanel(); else window.addEventListener("load", addPanel);

	if (H && H.onChange) H.onChange(function () { paintAcct(); });
	paintAcct(); renderLog(); showTab(S.tab); paintOff(); paintPrice();
	window.MESAIDebug = { S: S, status: status, send: send, mock: mock };
})();
