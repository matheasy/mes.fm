/* MES Copy Text -- mes.fm/copy-text
 * A clipboard shelf: save texts as notes on boards, click a note to copy it. Pin, colour, drag to reorder, search across
 * boards, {date}/{time}/... placeholders filled in at copy time, undo for deletes, .txt / .json export, JSON restore.
 * Everything lives in localStorage ("mes-copytext:v1"); nothing leaves the browser. Other tabs stay in sync via the storage event.
 * Optional "☁ Hive backup": CTLib.snapshot(state) saved through MESHiveStore (/main_js/hive-store.js, custom_json "mes_store",
 * app "copy-text", name "boards"), encrypted to the person's own memo key by default; loading merges (CTLib.merge) or replaces.
 * Encrypt choice: localStorage KEY + ":hiveenc" ("0" = off).
 * Optional "☁ Sync": sync.js keeps a copy-text.json up to date in a cloud folder / Dropbox / OneDrive / Google Drive (save() calls syncApi.changed()).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("cp");
	if (!root) return;
	var KEY = "mes-copytext:v1";
	var COLORS = ["", "y", "g", "b", "p", "r"];            // "" = plain
	var COLOR_NAMES = { "": "Plain", y: "Yellow", g: "Green", b: "Blue", p: "Purple", r: "Red" };

	/* ---------- state + storage (storage may be unavailable) ---------- */
	function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
	var memOnly = false, state;
	function load() {
		try {
			var raw = localStorage.getItem(KEY);
			if (raw) { var s = JSON.parse(raw); if (s && Array.isArray(s.boards) && s.boards.length) return s; }
		} catch (e) { memOnly = true; }
		return { v: 1, boards: [{ id: uid(), name: "My texts", notes: [] }], cur: null };
	}
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(state)); memOnly = false; } catch (e) { memOnly = true; }
		status();
		if (syncApi) syncApi.changed();
	}
	var syncApi = null;
	state = load();
	if (!state.cur || !board(state.cur)) state.cur = state.boards[0].id;
	function board(id) { for (var i = 0; i < state.boards.length; i++) if (state.boards[i].id === id) return state.boards[i]; return null; }
	function cur() { return board(state.cur); }
	function findNote(id) {
		for (var i = 0; i < state.boards.length; i++) {
			var n = state.boards[i].notes;
			for (var j = 0; j < n.length; j++) if (n[j].id === id) return { b: state.boards[i], n: n[j], i: j };
		}
		return null;
	}

	/* ---------- helpers ---------- */
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function words(t) { var m = t.trim().match(/\S+/g); return m ? m.length : 0; }
	var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	function expand(t) {
		var d = new Date(), map = {
			date: function () { try { return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); } catch (e) { return d.toDateString(); } },
			time: function () { try { return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); } },
			weekday: function () { return DAYS[d.getDay()]; },
			year: function () { return String(d.getFullYear()); },
			iso: function () { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
		};
		return t.replace(/\{\{(date|time|weekday|year|iso)\}\}|\{(date|time|weekday|year|iso)\}/g, function (m, esc1, k) { return esc1 ? "{" + esc1 + "}" : map[k](); });
	}
	function dynamic(t) { return /(^|[^{])\{(date|time|weekday|year|iso)\}/.test(t); }
	var toastT, undoFn = null;
	function toast(msg, undo) {
		var t = $("cp-toast");
		$("cp-toast-msg").textContent = msg;
		undoFn = undo || null;
		$("cp-toast-undo").hidden = !undo;
		t.classList.add("tu-toast--show");
		clearTimeout(toastT);
		toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); undoFn = null; }, undo ? 6000 : 1500);
	}
	$("cp-toast-undo").onclick = function () { if (undoFn) { var f = undoFn; undoFn = null; f(); $("cp-toast").classList.remove("tu-toast--show"); } };
	function copy(text) {
		if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
		return Promise.resolve(fallback());
		function fallback() {
			var ta = document.createElement("textarea");
			ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
			document.body.appendChild(ta); ta.select();
			var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
			ta.remove(); return ok;
		}
	}
	function download(name, text, type) {
		var a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
		a.href = url; a.download = name; document.body.appendChild(a); a.click();
		setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 500);
	}
	function slug(s) { return (s || "texts").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "texts"; }

	/* ---------- render ---------- */
	var query = "", editing = null, expanded = {};
	/* What the last Hive backup made / loaded in THIS browser held (CTLib.record: hashes of title + text, never the text) */
	var REC_KEY = KEY + ":hiverec", hrec = null, hst = null;
	try { hrec = JSON.parse(localStorage.getItem(REC_KEY) || "null"); } catch (e) {}
	function setRec(r) { hrec = r; try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {} }
	function day(ms, withTime) {
		var d = new Date(ms); if (!ms || isNaN(d)) return "";
		var o = { month: "short", day: "numeric" }; if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
		if (withTime) { o.hour = "numeric"; o.minute = "2-digit"; }
		try { return d.toLocaleString(undefined, o); } catch (e) { return d.toDateString(); }
	}
	function hiveSummary() {
		var el = $("cp-hivestate"); if (!el) return;
		hst = CTLib.status(state, hrec);
		if (!hrec) { el.hidden = true; return; }
		var t = "☁ Last Hive backup: " + day(hrec.t, true) + (hrec.acct ? " (@" + hrec.acct + ")" : "") + ". ";
		if (!hst.off && !hst.gone) { t += "Everything here is backed up."; el.className = "tu-note cp-hivestate is-ok"; }
		else {
			var bits = [];
			if (hst.off) bits.push(hst.off + (hst.off === 1 ? " text is" : " texts are") + " new or changed since then");
			if (hst.gone) bits.push(hst.gone + (hst.gone === 1 ? " backed-up text is" : " backed-up texts are") + " no longer here (deleted or edited)");
			t += bits.join("; ") + ": "; el.className = "tu-note cp-hivestate is-due";
		}
		el.textContent = t;
		if (hst.off || hst.gone) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = "Back up now"; b.onclick = function () { openHive(true); }; el.appendChild(b); }
		el.hidden = false;
		var hb = $("cp-hivebtn"); if (hb) hb.textContent = "☁ Hive backup" + (hst.off || hst.gone ? " •" : " ✓");
	}
	function status() {
		var total = 0, bytes = 0;
		state.boards.forEach(function (b) { total += b.notes.length; });
		try { bytes = JSON.stringify(state).length; } catch (e) {}
		var kb = bytes > 1024 ? (bytes / 1024).toFixed(bytes > 10240 ? 0 : 1) + " KB" : bytes + " bytes";
		$("cp-status").textContent = memOnly ? "Your browser is blocking storage, so these texts will be lost when you close the tab. Use More ▾ → Back up everything."
			: total + (total === 1 ? " text" : " texts") + " on " + state.boards.length + (state.boards.length === 1 ? " board" : " boards") + " · " + kb + " of about 5 MB used in this browser";
		$("cp-status").classList.toggle("cp-warn", memOnly);
		hiveSummary();
	}
	function renderBoards() {
		var h = state.boards.map(function (b) {
			var on = b.id === state.cur && !query;
			return '<button type="button" role="tab" class="cp-tab" data-id="' + b.id + '" aria-selected="' + on + '">' + esc(b.name) + ' <span class="cp-n">' + b.notes.length + "</span></button>";
		}).join("");
		h += '<button type="button" class="cp-tab cp-tab--add" id="cp-addboard">+ Board</button>';
		$("cp-boards").innerHTML = h;
	}
	var GRIP = '<span class="cp-wgrip" role="separator" aria-orientation="vertical" tabindex="0" title="Drag to make this box wider or narrower (double-click: full width / normal; or ← →)" aria-label="Box width"></span>';
	function noteHtml(n, b, showBoard) {
		var long = n.text.length > 280 || n.text.split("\n").length > 7, ex = !!expanded[n.id];
		if (editing === n.id) {
			var opts = state.boards.map(function (x) { return '<option value="' + x.id + '"' + (x.id === b.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("");
			return '<div class="cp-note cp-edit c-' + (n.c || "x") + '" data-id="' + n.id + '"><input class="tu-input cp-e-title" type="text" maxlength="80" placeholder="Title (optional)" value="' + esc(n.title || "") + '" aria-label="Title">' +
				'<textarea class="tu-input cp-e-text" rows="7" aria-label="Text">' + esc(n.text) + "</textarea>" +
				'<div class="cp-e-row"><span class="cp-swatches" role="group" aria-label="Colour">' + COLORS.map(function (c) {
					return '<button type="button" class="cp-sw c-' + (c || "x") + '" data-c="' + c + '" aria-pressed="' + ((n.c || "") === c) + '" title="' + COLOR_NAMES[c] + '" aria-label="' + COLOR_NAMES[c] + '"></button>';
				}).join("") + '</span><label class="cp-move">Board <select class="tu-select cp-e-board">' + opts + "</select></label></div>" +
				'<div class="cp-e-row"><span class="cp-ins">Insert: ' + ["date", "time", "weekday", "year", "iso"].map(function (k) { return '<button type="button" class="tu-chip" data-ins="{' + k + '}">{' + k + "}</button>"; }).join("") + "</span></div>" +
				'<div class="cp-foot"><button type="button" class="tu-btn tu-btn--primary cp-e-save">Save</button><button type="button" class="tu-btn tu-btn--ghost cp-e-cancel">Cancel</button>' +
				'<span class="cp-sp"></span><button type="button" class="tu-btn tu-btn--ghost cp-up" title="Move up" aria-label="Move up">↑</button><button type="button" class="tu-btn tu-btn--ghost cp-down" title="Move down" aria-label="Move down">↓</button></div>' + GRIP + '</div>';
		}
		return '<div class="cp-note c-' + (n.c || "x") + (n.pin ? " is-pin" : "") + '" data-id="' + n.id + '" draggable="' + (!query) + '">' +
			'<div class="cp-nh"><span class="cp-grip" title="Drag to reorder" aria-hidden="true">⠿</span><b class="cp-title">' + (n.title ? esc(n.title) : '<i>' + esc(n.text.split("\n")[0].slice(0, 40) || "Empty") + (n.text.length > 40 ? "…" : "") + "</i>") + "</b>" +
			(showBoard ? '<span class="cp-bname">' + esc(b.name) + "</span>" : "") + (dynamic(n.text) ? '<span class="cp-dyn" title="Contains {date}/{time} placeholders that are filled in when you copy">live</span>' : "") + '<span class="cp-sp"></span>' +
			'<button type="button" class="cp-ibtn cp-pin" aria-pressed="' + !!n.pin + '" title="' + (n.pin ? "Unpin" : "Pin to the top") + '" aria-label="' + (n.pin ? "Unpin" : "Pin to the top") + '">★</button></div>' +
			'<div class="cp-body' + (long && !ex ? " is-clamped" : "") + '" tabindex="0" role="button" title="Click to copy" aria-label="Copy: ' + esc(n.title || n.text.slice(0, 30)) + '"><pre>' + esc(n.text) + "</pre></div>" +
			(long ? '<button type="button" class="cp-more">' + (ex ? "Show less" : "Show more") + "</button>" : "") +
			'<div class="cp-foot"><button type="button" class="tu-btn tu-btn--primary cp-copy">Copy</button><button type="button" class="tu-btn tu-btn--ghost cp-show-btn" title="Show big: this text alone, filling the window (to show someone)" aria-label="Show big">⤢</button><button type="button" class="tu-btn tu-btn--ghost cp-read-btn" title="Read this text aloud" aria-label="Read aloud">🔊</button><button type="button" class="tu-btn tu-btn--ghost cp-edit-btn" title="Edit" aria-label="Edit">✎</button>' +
			'<button type="button" class="tu-btn tu-btn--ghost cp-dup" title="Duplicate" aria-label="Duplicate">⧉</button><button type="button" class="tu-btn tu-btn--ghost cp-del" title="Delete" aria-label="Delete">🗑</button>' +
			'<span class="cp-sp"></span><span class="cp-count">' + n.text.length + " chars · " + words(n.text) + " words</span></div>" + metaHtml(n) + GRIP + "</div>";
	}
	function metaHtml(n) {
		var bits = [];
		if (n.t) bits.push('<span title="' + esc(day(n.t, true)) + '">Added ' + esc(day(n.t)) + "</span>");
		if (n.m && n.m - (n.t || 0) > 60000) bits.push('<span title="' + esc(day(n.m, true)) + '">edited ' + esc(day(n.m)) + "</span>");
		var hs = hst && hst.rec ? hst.by[n.id] : null;
		if (hs === "on") bits.push('<span class="cp-hs is-on" title="This exact text is in your Hive backup of ' + esc(day(hst.rec.t, true)) + '">☁ On Hive</span>');
		else if (hs === "off") bits.push('<span class="cp-hs is-off" title="New or changed after your last Hive backup (' + esc(day(hst.rec.t, true)) + '): back up to keep this version">☁ Not backed up</span>');
		return bits.length ? '<div class="cp-meta">' + bits.join(" · ") + "</div>" : "";
	}
	function sorted(list) { // pinned first, otherwise the saved order
		return list.map(function (n, i) { return { n: n, i: i }; }).sort(function (a, b) { return (b.n.pin ? 1 : 0) - (a.n.pin ? 1 : 0) || a.i - b.i; }).map(function (x) { return x.n; });
	}
	function render() {
		hst = CTLib.status(state, hrec);
		renderBoards();
		var h = "", shown = 0;
		if (query) {
			var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
			state.boards.forEach(function (b) {
				sorted(b.notes).forEach(function (n) {
					var hay = ((n.title || "") + "\n" + n.text).toLowerCase();
					if (terms.every(function (t) { return hay.indexOf(t) >= 0; })) { h += noteHtml(n, b, true); shown++; }
				});
			});
			if (!shown) h = '<div class="cp-empty">No texts match “' + esc(query) + '”.</div>';
		} else {
			var b = cur();
			sorted(b.notes).forEach(function (n) { h += noteHtml(n, b, false); shown++; });
			if (!shown) h = '<div class="cp-empty"><b>Nothing on this board yet.</b><br>Paste something into the box above and press Save, or <button type="button" class="tu-chip" id="cp-empty-examples">add a few examples</button> to see how it works.</div>';
		}
		$("cp-out").innerHTML = h;
		layoutSoon(true);
		$("cp-copyall").hidden = !!query;
		var ta = $("cp-out").querySelector(".cp-e-text"); if (ta && !render.noFocus) { ta.focus(); }
		status();
	}

	/* ---------- adding ---------- */
	function addNote(text, title, atTop) {
		var b = cur(), n = { id: uid(), title: (title || "").trim(), text: text, c: "", pin: false, t: Date.now() };
		if (atTop) b.notes.unshift(n); else b.notes.push(n);
		save(); return n;
	}
	function saveNew() {
		var t = $("cp-new-text").value;
		if (!t.trim()) { toast("Type or paste some text first"); $("cp-new-text").focus(); return; }
		query = ""; $("cp-search").value = "";
		addNote(t.replace(/\s+$/, ""), $("cp-new-title").value, true);
		$("cp-new-text").value = ""; $("cp-new-title").value = ""; draft();
		render(); toast("Saved to “" + cur().name + "”");
	}
	function draft() { try { localStorage.setItem(KEY + ":draft", JSON.stringify({ t: $("cp-new-text").value, h: $("cp-new-title").value })); } catch (e) {} }
	$("cp-save").onclick = saveNew;
	$("cp-new-text").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNew(); } });
	$("cp-new-title").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if ($("cp-new-text").value.trim()) saveNew(); else $("cp-new-text").focus(); } });
	$("cp-new-text").addEventListener("input", draft);
	$("cp-new-title").addEventListener("input", draft);
	$("cp-new-clear").onclick = function () { $("cp-new-text").value = ""; $("cp-new-title").value = ""; draft(); $("cp-new-text").focus(); };
	$("cp-paste").onclick = function () {
		if (!navigator.clipboard || !navigator.clipboard.readText) { toast("This browser can't read the clipboard: paste into the box instead"); $("cp-new-text").focus(); return; }
		navigator.clipboard.readText().then(function (t) {
			if (!t || !t.trim()) { toast("The clipboard is empty"); return; }
			query = ""; $("cp-search").value = "";
			addNote(t.replace(/\s+$/, ""), "", true); render(); toast("Clipboard saved to “" + cur().name + "”");
		}, function () { toast("Clipboard access was blocked: paste into the box instead"); $("cp-new-text").focus(); });
	};

	/* ---------- split one pasted text into several notes ---------- */
	function hashWords(t) { var o = []; (t.match(/#[\p{L}\p{N}_]+/gu) || []).forEach(function (w) { if (o.indexOf(w) < 0) o.push(w); }); return o; }
	function splitParts(raw) {
		var t = raw.replace(/\r/g, "").trim(), parts = [];
		if (!t) return parts;
		var urls = [];
		t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (m, l, u) { urls.push(u); return l; });
		(t.match(/https?:\/\/[^\s<>"')\]]+/g) || []).forEach(function (u) { u = u.replace(/[.,;:!?]+$/, ""); if (urls.indexOf(u) < 0) urls.push(u); });
		var lines = t.split("\n"), first = "";
		for (var i = 0; i < lines.length; i++) if (lines[i].trim()) { first = lines[i].trim(); break; }
		var title = first.replace(/https?:\/\/\S+/g, " ").replace(/\*\*|__/g, "").replace(/^#+\s+/, "").replace(/\s+/g, " ").replace(/[\s:–—|-]+$/, "").trim();
		if (/^(#[\p{L}\p{N}_]+\s*)+$/u.test(title)) title = "";
		var rest = t.slice(t.indexOf(first) + first.length);
		var paras = rest.split(/\n\s*\n/).map(function (p) {
			return p.split("\n").filter(function (l) { return !/^\s*https?:\/\/\S+\s*$/.test(l); }).join("\n").trim();
		}).filter(function (p) { return p && !/^(#[\p{L}\p{N}_]+\s*)+$/u.test(p); }).map(function (p) { return p.replace(/(\s#[\p{L}\p{N}_]+)+\s*$/u, "").trim(); }).filter(Boolean);
		var tags = hashWords(t);
		parts.push({ title: "Full text", text: raw.replace(/\s+$/, ""), on: true });
		if (title) parts.push({ title: "Title", text: title, on: true });
		urls.forEach(function (u, i) { parts.push({ title: urls.length > 1 ? "Link " + (i + 1) : "Link", text: u, on: i === 0 || urls.length < 4 }); });
		if (paras.length) parts.push({ title: "Description", text: paras.join("\n\n"), on: true });
		if (tags.length) parts.push({ title: "Hashtags", text: tags.join(" "), on: true });
		if (title && urls.length) parts.push({ title: "Title + link", text: title + " " + urls[0], on: false });
		if (paras.length > 1) paras.forEach(function (p, i) { parts.push({ title: "Paragraph " + (i + 1), text: p, on: false }); });
		if (tags.length > 1) parts.push({ title: "Hashtags (no #)", text: tags.map(function (w) { return w.slice(1); }).join(" "), on: false });
		return parts;
	}
	var splitting = [];
	function renderSplit() {
		var box = $("cp-splitbox");
		box.hidden = !splitting.length;
		if (!splitting.length) { box.innerHTML = ""; return; }
		box.innerHTML = '<div class="cp-split-h"><b>Split into ' + splitting.length + ' texts</b> <span class="tu-note" style="margin:0;">Tick the ones to save to “' + esc(cur().name) + '”. Edit the name or text if you like.</span></div>' +
			splitting.map(function (p, i) {
				return '<div class="cp-sp-row" data-i="' + i + '"><label class="cp-sp-on"><input type="checkbox" class="cp-sp-chk"' + (p.on ? " checked" : "") + ' aria-label="Save this text"></label>' +
					'<div class="cp-sp-main"><input class="tu-input cp-sp-title" type="text" maxlength="80" value="' + esc(p.title) + '" aria-label="Name">' +
					'<textarea class="tu-input cp-sp-text" rows="' + Math.min(6, Math.max(1, p.text.split("\n").length)) + '" aria-label="Text">' + esc(p.text) + "</textarea></div>" +
					'<button type="button" class="tu-btn tu-btn--ghost cp-sp-copy" title="Copy this text" aria-label="Copy this text">Copy</button></div>';
			}).join("") +
			'<div class="cp-foot" style="margin-top:0.7em;"><button type="button" class="tu-btn tu-btn--primary" id="cp-sp-save">Save ticked</button><button type="button" class="tu-btn tu-btn--ghost" id="cp-sp-cancel">Cancel</button>' +
			'<span class="cp-sp"></span><button type="button" class="tu-btn tu-btn--ghost" id="cp-sp-all">Tick all</button><button type="button" class="tu-btn tu-btn--ghost" id="cp-sp-none">Tick none</button></div>';
	}
	$("cp-split").onclick = function () {
		var parts = splitParts($("cp-new-text").value);
		if (!parts.length) { toast("Paste some text first"); $("cp-new-text").focus(); return; }
		if (parts.length < 2) { toast("Nothing to split: it is just one text"); return; }
		splitting = parts; renderSplit(); $("cp-splitbox").scrollIntoView({ block: "nearest", behavior: "smooth" });
	};
	$("cp-splitbox").addEventListener("input", function (e) {
		var row = e.target.closest(".cp-sp-row"); if (!row) return;
		var p = splitting[+row.dataset.i];
		if (e.target.classList.contains("cp-sp-chk")) p.on = e.target.checked;
		else if (e.target.classList.contains("cp-sp-title")) p.title = e.target.value;
		else if (e.target.classList.contains("cp-sp-text")) p.text = e.target.value;
	});
	$("cp-splitbox").addEventListener("click", function (e) {
		var btn = e.target.closest("button"); if (!btn) return;
		if (btn.classList.contains("cp-sp-copy")) {
			var p = splitting[+btn.closest(".cp-sp-row").dataset.i];
			copy(p.text).then(function (ok) { toast(ok ? "Copied “" + p.title + "”" : "Copy failed: select the text instead"); });
		} else if (btn.id === "cp-sp-cancel") { splitting = []; renderSplit(); }
		else if (btn.id === "cp-sp-all" || btn.id === "cp-sp-none") { splitting.forEach(function (p) { p.on = btn.id === "cp-sp-all"; }); renderSplit(); }
		else if (btn.id === "cp-sp-save") {
			var pick = splitting.filter(function (p) { return p.on && p.text.trim(); });
			if (!pick.length) { toast("Tick at least one text"); return; }
			query = ""; $("cp-search").value = "";
			for (var i = pick.length - 1; i >= 0; i--) addNote(pick[i].text.replace(/\s+$/, ""), pick[i].title, true);  // keeps the list's order at the top
			$("cp-new-text").value = ""; $("cp-new-title").value = ""; draft();
			splitting = []; renderSplit(); render(); toast("Saved " + pick.length + (pick.length === 1 ? " text" : " texts") + " to “" + cur().name + "”");
		}
	});

	/* ---------- boards ---------- */
	$("cp-boards").addEventListener("click", function (e) {
		var add = e.target.closest("#cp-addboard");
		if (add) {
			var name = prompt("Name for the new board:", "");
			if (!name || !name.trim()) return;
			var b = { id: uid(), name: name.trim().slice(0, 40), notes: [] };
			state.boards.push(b); state.cur = b.id; query = ""; $("cp-search").value = ""; editing = null; save(); render(); return;
		}
		var t = e.target.closest(".cp-tab"); if (!t) return;
		state.cur = t.dataset.id; query = ""; $("cp-search").value = ""; editing = null; save(); render();
	});
	$("cp-search").addEventListener("input", function () { query = this.value.trim(); editing = null; render.noFocus = true; render(); render.noFocus = false; });
	$("cp-copyall").onclick = function () {
		var list = sorted(cur().notes).map(function (n) { return expand(n.text); });
		if (!list.length) { toast("This board is empty"); return; }
		copy(list.join("\n\n")).then(function (ok) { toast(ok ? "Copied all " + list.length + " texts" : "Copy failed"); });
	};
	function delLabel() { var d = document.querySelector('#cp-menu [data-act="delboard"]'); if (d) d.textContent = state.boards.length < 2 ? "🗑 Clear this board" : "🗑 Delete this board"; }
	$("cp-menu").addEventListener("toggle", delLabel);
	function menu(act) {
		$("cp-menu").open = false;
		var b = cur();
		if (act === "rename") {
			var name = prompt("Rename this board:", b.name);
			if (name && name.trim()) { b.name = name.trim().slice(0, 40); save(); render(); }
		} else if (act === "txt") {
			if (!b.notes.length) { toast("This board is empty"); return; }
			download(slug(b.name) + ".txt", sorted(b.notes).map(function (n) { return (n.title ? n.title + "\n" + new Array(n.title.length + 1).join("-") + "\n" : "") + n.text; }).join("\n\n====\n\n") + "\n");
		} else if (act === "export") {
			download("mes-copy-text-backup-" + expand("{iso}") + ".json", JSON.stringify(state, null, 1), "application/json");
		} else if (act === "import") {
			$("cp-file").click();
		} else if (act === "sync") {
			var sb = $("cp-syncbtn"); if ($("cp-sync").hidden) sb.click(); else $("cp-sync").scrollIntoView({ block: "nearest" });
		} else if (act === "hive") {
			openHive(true);
		} else if (act === "examples") {
			examples(); render(); toast("Added examples");
		} else if (act === "delboard") {
			var snap = JSON.stringify(state);
			if (state.boards.length < 2) {
				if (!b.notes.length) { toast("This board is already empty"); return; }
				if (!confirm("Clear all " + b.notes.length + " texts from “" + b.name + "”?")) return;
				b.notes = []; save(); render();
				toast("Board cleared", function () { state = JSON.parse(snap); save(); render(); });
				return;
			}
			if (b.notes.length && !confirm("Delete the board “" + b.name + "” and its " + b.notes.length + " texts?")) return;
			state.boards = state.boards.filter(function (x) { return x.id !== b.id; });
			state.cur = state.boards[0].id; save(); render();
			toast("Board deleted", function () { state = JSON.parse(snap); save(); render(); });
		}
	}
	$("cp-menu").addEventListener("click", function (e) { var b = e.target.closest("button[data-act]"); if (b) menu(b.dataset.act); });
	document.addEventListener("click", function (e) { var m = $("cp-menu"); if (m.open && !m.contains(e.target)) m.open = false; });
	$("cp-file").onchange = function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		var r = new FileReader();
		r.onload = function () {
			try {
				var added = CTLib.merge(state, JSON.parse(r.result), uid).added;
				save(); render(); toast(added ? "Restored " + added + (added === 1 ? " text" : " texts") : "Nothing new in that file");
			} catch (e) { toast("That doesn't look like a Copy Text backup"); }
		};
		r.readAsText(f);
	};
	function examples() {
		var b = cur();
		[["Email sign-off", "Thanks again, and have a great {weekday}!\n\nBest regards,\nYour Name", "g"],
		 ["Today's date", "{date}", "b"],
		 ["Meeting reply", "Hi,\n\nThanks for the invite. {weekday} works for me. I'll bring the notes and we can go through them together.\n\nSee you then.", "y"],
		 ["Hashtags", "#math #learning #education #science", "p"]].forEach(function (x) { b.notes.push({ id: uid(), title: x[0], text: x[1], c: x[2], pin: false, t: Date.now() }); });
		save();
	}

	/* ---------- note actions ---------- */
	function copyNote(id) {
		var f = findNote(id); if (!f) return;
		copy(expand(f.n.text)).then(function (ok) { toast(ok ? "Copied" + (f.n.title ? " “" + f.n.title + "”" : "") : "Copy failed: select the text instead"); });
		var el = $("cp-out").querySelector('[data-id="' + id + '"]'); if (el) { el.classList.add("is-flash"); setTimeout(function () { el.classList.remove("is-flash"); }, 450); }
	}
	$("cp-out").addEventListener("click", function (e) {
		if (e.target.closest("#cp-empty-examples")) { examples(); render(); return; }
		var card = e.target.closest(".cp-note"); if (!card) return;
		var id = card.dataset.id, f = findNote(id); if (!f) return;
		var btn = e.target.closest("button");
		if (card.classList.contains("cp-edit")) {
			if (!btn) return;
			if (btn.dataset.ins) { insertAtCursor(card.querySelector(".cp-e-text"), btn.dataset.ins); return; }
			if (btn.classList.contains("cp-sw")) { card.dataset.pc = btn.dataset.c; card.className = card.className.replace(/c-\w+/, "c-" + (btn.dataset.c || "x")); Array.prototype.forEach.call(card.querySelectorAll(".cp-sw"), function (s) { s.setAttribute("aria-pressed", String(s === btn)); }); return; }
			if (btn.classList.contains("cp-e-save")) { commitEdit(card, f); return; }
			if (btn.classList.contains("cp-e-cancel")) { editing = null; render(); return; }
			if (btn.classList.contains("cp-up") || btn.classList.contains("cp-down")) {
				commitEdit(card, f, true);
				var j = f.i + (btn.classList.contains("cp-up") ? -1 : 1), arr = f.b.notes;
				if (j >= 0 && j < arr.length) { arr.splice(j, 0, arr.splice(f.i, 1)[0]); }
				save(); render(); return;
			}
			return;
		}
		if (btn && btn.classList.contains("cp-pin")) { f.n.pin = !f.n.pin; save(); render(); return; }
		if (btn && btn.classList.contains("cp-more")) { expanded[id] = !expanded[id]; render.noFocus = true; render(); render.noFocus = false; return; }
		if (btn && btn.classList.contains("cp-show-btn")) { showBig(id, btn); return; }
		if (btn && btn.classList.contains("cp-read-btn")) {
			if (card.querySelector(".cp-body.is-clamped")) { expanded[id] = true; render.noFocus = true; render(); render.noFocus = false; }
			var pre = $("cp-out").querySelector('.cp-note[data-id="' + id + '"] .cp-body pre');
			readAloud(pre, $("cp-out").querySelector('.cp-note[data-id="' + id + '"] .cp-read-btn'));
			return;
		}
		if (btn && btn.classList.contains("cp-edit-btn")) { editing = id; render(); return; }
		if (btn && btn.classList.contains("cp-dup")) { var c = JSON.parse(JSON.stringify(f.n)); c.id = uid(); c.title = c.title ? c.title + " (copy)" : ""; c.pin = false; f.b.notes.splice(f.i + 1, 0, c); save(); render(); toast("Duplicated"); return; }
		if (btn && btn.classList.contains("cp-del")) {
			var snap = JSON.stringify(state);
			f.b.notes.splice(f.i, 1); save(); render();
			toast("Deleted", function () { state = JSON.parse(snap); save(); render(); });
			return;
		}
		if (btn && !btn.classList.contains("cp-copy")) return;
		if (e.target.closest(".cp-nh") && !btn) return;
		if (e.target.closest(".cp-body") || (btn && btn.classList.contains("cp-copy"))) copyNote(id);
	});
	$("cp-out").addEventListener("keydown", function (e) {
		var body = e.target.closest && e.target.closest(".cp-body");
		if (body && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); copyNote(body.closest(".cp-note").dataset.id); return; }
		var card = e.target.closest && e.target.closest(".cp-edit");
		if (!card) return;
		if (e.key === "Escape") { editing = null; render(); }
		else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { var f = findNote(card.dataset.id); if (f) commitEdit(card, f); }
	});
	function insertAtCursor(ta, s) {
		var a = ta.selectionStart || 0, z = ta.selectionEnd || 0;
		ta.value = ta.value.slice(0, a) + s + ta.value.slice(z); ta.focus(); ta.selectionStart = ta.selectionEnd = a + s.length;
	}
	function commitEdit(card, f, quiet) {
		var text = card.querySelector(".cp-e-text").value, title = card.querySelector(".cp-e-title").value.trim(), to = card.querySelector(".cp-e-board").value;
		if (!text.trim()) { toast("A text can't be empty (use Delete to remove it)"); return; }
		var nt = text.replace(/\s+$/, "");
		if (nt !== f.n.text || title !== (f.n.title || "")) f.n.m = Date.now();
		f.n.text = nt; f.n.title = title; if (card.dataset.pc != null) f.n.c = card.dataset.pc;
		if (to !== f.b.id && board(to)) { f.b.notes.splice(f.i, 1); board(to).notes.unshift(f.n); toast("Moved to “" + board(to).name + "”"); }
		if (!quiet) { editing = null; save(); render(); } else save();
	}

	/* ---------- Show big: one note alone, filling the window ----------
	 * For showing someone an address, a phone number, a code... Text = what Copy gives (placeholders filled in), line breaks
	 * kept, font size fitted to the window (binary search). ‹ › / arrow keys / swipe go through the notes shown on the page
	 * (this board, or the search results). Light / dark is the overlay's own choice (KEY:show); colours are set inline so the
	 * derived TOOL-DARK block never touches them. Full screen = the real Fullscreen API; the screen is kept awake while open. */
	var SHOW_KEY = KEY + ":show", SIZE_KEY = KEY + ":showsize", sv = null;
	/* text size: "fit" (largest size that fits, the default) or a fixed size in px chosen with A− / A+ (saved, used for every note;
	   a fixed size larger than the window scrolls) */
	function showSize() { try { var v = localStorage.getItem(SIZE_KEY); if (v && v !== "fit" && +v >= 12 && +v <= 600) return +v; } catch (e) {} return "fit"; }
	function setShowSize(v) { try { localStorage.setItem(SIZE_KEY, String(v)); } catch (e) {} sizeLabel(); fitShow(); }
	function stepSize(d) {
		var cur = parseFloat(sv.t.style.fontSize) || 48, nx = d > 0 ? cur * 1.2 : cur / 1.2;
		setShowSize(Math.round(Math.max(12, Math.min(600, nx))));
	}
	function sizeLabel() {
		var v = showSize(), f = sv.el.querySelector('[data-a="fit"]');
		f.setAttribute("aria-pressed", v === "fit" ? "true" : "false");
		f.title = v === "fit" ? "Text fills the window (0)" : "Fit the text to the window again (0); now " + v + " px";
		paintShow();
	}
	var THEMES = {
		dark: { bg: "#000", fg: "#fff", mut: "#b8bec7", line: "#555", btn: "#1c1c1c", acc: "#ffd34d", accFg: "#111" },
		light: { bg: "#fff", fg: "#000", mut: "#4a525d", line: "#9aa3af", btn: "#f1f3f6", acc: "#7a4a05", accFg: "#fff" }
	};
	function showTheme() {
		try { var t = localStorage.getItem(SHOW_KEY); if (t === "dark" || t === "light") return t; } catch (e) {}
		return document.body.classList.contains("dark-mode") ? "dark" : "light";
	}
	function showIds() { return Array.prototype.map.call($("cp-out").querySelectorAll(".cp-note[data-id]:not(.cp-edit)"), function (el) { return el.dataset.id; }); }
	function showBig(id, from) {
		if (!findNote(id)) return;
		if (!sv) buildShow();
		sv.ids = showIds(); sv.id = id; sv.from = from || null;
		sv.el.hidden = false;
		document.documentElement.classList.add("cp-show-open");
		paintShow(); fsLabel(); sizeLabel(); showNote();
		sv.close.focus();
		wake(true);
	}
	function buildShow() {
		var el = document.createElement("div");
		el.className = "cp-show"; el.hidden = true;
		el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Text shown big");
		el.innerHTML = '<div class="cp-show-bar">' +
			'<button type="button" class="cp-show-b" data-a="prev" title="Previous text (←)" aria-label="Previous text">‹</button>' +
			'<span class="cp-show-pos" aria-live="polite"></span>' +
			'<button type="button" class="cp-show-b" data-a="next" title="Next text (→)" aria-label="Next text">›</button>' +
			'<b class="cp-show-title"></b><span class="cp-show-br" aria-hidden="true"></span>' +
			'<span class="cp-show-sz" role="group" aria-label="Text size">' +
			'<button type="button" class="cp-show-b" data-a="smaller" title="Smaller text (−)" aria-label="Smaller text">A−</button>' +
			'<button type="button" class="cp-show-b" data-a="bigger" title="Bigger text (+)" aria-label="Bigger text">A+</button>' +
			'<button type="button" class="cp-show-b cp-show-fit" data-a="fit" aria-pressed="true">Fit</button></span>' +
			'<span class="cp-show-sp"></span>' +
			'<button type="button" class="cp-show-b" data-a="read" title="Read aloud (R)" aria-label="Read aloud">🔊</button>' +
			'<button type="button" class="cp-show-b cp-show-copy" data-a="copy" title="Copy this text (C)">Copy</button>' +
			'<button type="button" class="cp-show-b" data-a="theme" title="Light / dark (T)" aria-label="Switch light / dark">◐</button>' +
			'<button type="button" class="cp-show-b" data-a="fs" title="Full screen (F)" aria-label="Full screen">⛶</button>' +
			'<button type="button" class="cp-show-b" data-a="close" title="Close (Esc)" aria-label="Close">✕</button></div>' +
			'<div class="cp-show-box"><div class="cp-show-t"></div></div>' +
			'<div class="cp-show-hint">‹ › or swipe for the other texts · Esc closes</div>';
		document.body.appendChild(el);
		sv = { el: el, box: el.querySelector(".cp-show-box"), t: el.querySelector(".cp-show-t"), close: el.querySelector('[data-a="close"]'), ids: [], id: null };
		el.addEventListener("click", function (e) {
			var b = e.target.closest("[data-a]"); if (!b) return;
			var a = b.dataset.a;
			if (a === "close") closeShow();
			else if (a === "prev") stepShow(-1);
			else if (a === "next") stepShow(1);
			else if (a === "copy") copyNote(sv.id);
			else if (a === "read") readAloud(sv.t, b);
			else if (a === "theme") { try { localStorage.setItem(SHOW_KEY, showTheme() === "dark" ? "light" : "dark"); } catch (x) {} paintShow(); }
			else if (a === "fs") toggleFs();
			else if (a === "smaller") stepSize(-1);
			else if (a === "bigger") stepSize(1);
			else if (a === "fit") setShowSize("fit");
		});
		el.addEventListener("keydown", function (e) {
			if (e.key !== "Tab") return; // keep focus inside the overlay
			var f = el.querySelectorAll("button:not([disabled]):not([hidden])"), first = f[0], last = f[f.length - 1];
			if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
			else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
		});
		document.addEventListener("keydown", function (e) {
			if (!sv || sv.el.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
			var k = e.key;
			if (k === "Escape") { e.preventDefault(); closeShow(); }
			else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); stepShow(-1); }
			else if (k === "ArrowRight" || k === "PageDown") { e.preventDefault(); stepShow(1); }
			else if (k === "c" || k === "C") copyNote(sv.id);
			else if (k === "r" || k === "R") readAloud(sv.t, sv.el.querySelector('[data-a="read"]'));
			else if (k === "t" || k === "T") sv.el.querySelector('[data-a="theme"]').click();
			else if (k === "f" || k === "F") toggleFs();
			else if (k === "+" || k === "=") { e.preventDefault(); stepSize(1); }
			else if (k === "-" || k === "_") { e.preventDefault(); stepSize(-1); }
			else if (k === "0") { e.preventDefault(); setShowSize("fit"); }
		});
		var sx = null, sy = 0;
		sv.box.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse") { sx = null; return; } sx = e.clientX; sy = e.clientY; }); // a mouse drag selects text: only a finger / pen swipes
		sv.box.addEventListener("pointerup", function (e) {
			if (sx === null) return;
			var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
			var sel = window.getSelection && window.getSelection(); if (sel && !sel.isCollapsed && /\S/.test(String(sel))) return;
			if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) stepShow(dx < 0 ? 1 : -1);
		});
		sv.box.addEventListener("pointercancel", function () { sx = null; });
		window.addEventListener("resize", function () { if (!sv.el.hidden) fitShow(); });
		["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) { document.addEventListener(ev, function () { if (sv && !sv.el.hidden) { fsLabel(); fitShow(); } }); });
		document.addEventListener("visibilitychange", function () { if (sv && !sv.el.hidden && document.visibilityState === "visible") wake(true); });
		if (!(el.requestFullscreen || el.webkitRequestFullscreen)) el.querySelector('[data-a="fs"]').hidden = true;
	}
	function paintShow() {
		var th = THEMES[showTheme()], el = sv.el;
		el.style.background = th.bg; el.style.color = th.fg;
		sv.t.style.color = th.fg; el.querySelector(".cp-show-title").style.color = th.fg; // the page's reset paints div / b #333
		el.querySelector(".cp-show-hint").style.color = th.mut;
		el.querySelector(".cp-show-pos").style.color = th.mut;
		Array.prototype.forEach.call(el.querySelectorAll(".cp-show-b"), function (b) {
			var acc = b.classList.contains("cp-show-copy") || b.getAttribute("aria-pressed") === "true";
			b.style.background = acc ? th.acc : th.btn; b.style.color = acc ? th.accFg : th.fg; b.style.borderColor = acc ? th.acc : th.line;
		});
	}
	function showNote() {
		var f = findNote(sv.id); if (!f) { closeShow(); return; }
		var i = sv.ids.indexOf(sv.id), n = sv.ids.length;
		sv.el.querySelector(".cp-show-title").textContent = f.n.title || "";
		sv.el.querySelector(".cp-show-pos").textContent = i >= 0 && n > 1 ? (i + 1) + " / " + n : "";
		sv.el.querySelector('[data-a="prev"]').disabled = !(i > 0);
		sv.el.querySelector('[data-a="next"]').disabled = !(i >= 0 && i < n - 1);
		sv.el.querySelector(".cp-show-hint").hidden = n < 2;
		sv.t.textContent = expand(f.n.text);
		fitShow();
	}
	function stepShow(d) {
		var i = sv.ids.indexOf(sv.id) + d;
		if (i < 0 || i >= sv.ids.length) return;
		sv.id = sv.ids[i]; showNote();
	}
	function fitShow() { // largest font size (px) at which the text fits the box without scrolling
		var box = sv.box, t = sv.t;
		box.classList.remove("is-scroll");
		t.style.removeProperty("line-height"); t.style.removeProperty("font-size"); // a reader's A+ (Read Aloud) leaves px sizes: start clean so lines never overlap
		var cs = getComputedStyle(box);
		var W = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
		var H = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
		if (W <= 0 || H <= 0) return;
		var fixed = showSize();
		if (fixed !== "fit") { // a chosen size: lines wrap at the window's width, a text taller than the window scrolls
			t.classList.remove("is-nowrap"); t.classList.add("is-fixed"); t.style.fontSize = fixed + "px";
			box.classList.toggle("is-scroll", t.offsetHeight > H + 0.5);
			return;
		}
		t.classList.remove("is-fixed");
		var fits = function (px) { t.style.fontSize = px + "px"; return t.scrollWidth <= W + 0.5 && t.offsetHeight <= H + 0.5; };
		var best = function () {
			var lo = 12, hi = Math.max(14, Math.min(480, H)), ok = lo;
			if (fits(hi)) return hi;
			for (var k = 0; k < 14 && hi - lo > 0.5; k++) { var mid = (lo + hi) / 2; if (fits(mid)) { ok = mid; lo = mid; } else hi = mid; }
			return Math.floor(ok);
		};
		// Keep the note's own lines when that costs little size (an address stays one line per line); else let long lines wrap.
		t.classList.add("is-nowrap"); var keep = best(), keepOk = fits(keep);
		t.classList.remove("is-nowrap"); var wrap = best();
		var useKeep = keepOk && keep >= 0.7 * wrap;
		t.classList.toggle("is-nowrap", useKeep);
		box.classList.toggle("is-scroll", !fits(useKeep ? keep : wrap)); // a very long text at the smallest size: it scrolls instead
	}
	function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
	function toggleFs() {
		var el = sv.el;
		try {
			if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
			else { var r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (r && r.catch) r.catch(function () { toast("Full screen was refused by the browser"); }); }
		} catch (e) { toast("Full screen is not available here"); }
	}
	function fsLabel() {
		var b = sv.el.querySelector('[data-a="fs"]'), on = !!fsEl();
		b.textContent = on ? "⤡" : "⛶"; b.title = on ? "Leave full screen (F)" : "Full screen (F)"; b.setAttribute("aria-label", on ? "Leave full screen" : "Full screen");
	}
	var lock = null;
	function wake(on) { // keep the screen on while a text is shown (where the browser allows it)
		if (!on) { if (lock) { try { lock.release(); } catch (e) {} lock = null; } return; }
		if (!navigator.wakeLock || lock) return;
		navigator.wakeLock.request("screen").then(function (l) { lock = l; l.addEventListener("release", function () { if (lock === l) lock = null; }); }, function () {});
	}
	function closeShow() {
		if (!sv || sv.el.hidden) return;
		if (fsEl()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
		sv.el.hidden = true;
		document.documentElement.classList.remove("cp-show-open");
		wake(false);
		var back = $("cp-out").querySelector('.cp-note[data-id="' + sv.id + '"] .cp-show-btn') || sv.from;
		if (back && back.isConnected) back.focus();
	}

	/* ---------- read aloud: the MES Read Aloud engine (main_js/site-read-aloud.js = the browser extension's reader, no install needed)
	   reads one note (or the Show big text) with its own player: voices, speed, word highlighting. A selection inside it is read instead.
	   The note is handed over through window.__mesraSource only while the reader starts, so the header's speaker button still reads the page. */
	var raLoading = false, raClear = 0;
	function readAloud(el, btn) {
		if (!el || raLoading) return;
		if (!("speechSynthesis" in window)) { toast("This browser can't read text aloud"); return; }
		window.__mesraSource = { roots: function () { return el.isConnected ? [el] : []; }, start: function () { return null; } };
		clearTimeout(raClear);
		var go = function () {
			raLoading = false; if (btn) btn.removeAttribute("aria-busy");
			if (window.MESReadAloud) window.MESReadAloud.read();
			raClear = setTimeout(function () { try { delete window.__mesraSource; } catch (e) { window.__mesraSource = undefined; } }, 3000);
		};
		if (window.MESReadAloud) { go(); return; }
		raLoading = true; if (btn) btn.setAttribute("aria-busy", "true");
		var sc = document.createElement("script"); sc.src = "/main_js/site-read-aloud.js?v=1"; sc.onload = go;
		sc.onerror = function () { raLoading = false; if (btn) btn.removeAttribute("aria-busy"); toast("Read aloud could not load. Check your connection and try again."); };
		document.head.appendChild(sc);
	}

	/* ---------- box widths: drag a box's right edge to make it span 1, 2, 3... columns (the others move along / below).
	   The grid is CSS grid with 4px rows; each box spans as many rows as it is tall (a masonry layout that keeps the saved order).
	   Widths are this device's layout choice (KEY:w = {id: columns}), not part of the texts, so they never touch sync / Hive. */
	var W_KEY = KEY + ":w", widths = {}, ROW = 4;
	try { widths = JSON.parse(localStorage.getItem(W_KEY) || "{}") || {}; } catch (e) { widths = {}; }
	function saveWidths() { try { localStorage.setItem(W_KEY, JSON.stringify(widths)); } catch (e) {} }
	function gridInfo() {
		var g = $("cp-out"), cs = getComputedStyle(g), cols = cs.gridTemplateColumns.split(" ").filter(function (x) { return x && x !== "none"; }).length || 1;
		var gap = parseFloat(cs.columnGap) || 0, cw = (g.clientWidth - gap * (cols - 1)) / cols;
		return { g: g, cols: cols, gap: gap, cw: cw, rgap: parseFloat(cs.fontSize) * 0.8 };
	}
	var layT = 0;
	function layoutSoon(now) { if (now) { cancelAnimationFrame(layT); layout(); return; } cancelAnimationFrame(layT); layT = requestAnimationFrame(layout); }
	function layout() {
		var gi = gridInfo(), cards = gi.g.querySelectorAll(".cp-note[data-id]");
		gi.g.dataset.cols = gi.cols;
		Array.prototype.forEach.call(cards, function (c) {
			var sp = Math.min(widths[c.dataset.id] || 1, gi.cols);
			c.style.gridColumnEnd = sp > 1 ? "span " + sp : "";
			var gr = c.querySelector(".cp-wgrip"); if (gr) { gr.setAttribute("aria-valuenow", sp); gr.setAttribute("aria-valuemin", 1); gr.setAttribute("aria-valuemax", gi.cols); gr.setAttribute("aria-valuetext", sp + (sp === 1 ? " column" : " columns")); }
		});
		Array.prototype.forEach.call(cards, function (c) { c.style.gridRowEnd = "span " + Math.max(1, Math.ceil((c.offsetHeight + gi.rgap) / ROW)); });
		if (window.ResizeObserver) Array.prototype.forEach.call(cards, function (c) { if (!c._ro) { c._ro = 1; ro.observe(c); } });
	}
	var ro = window.ResizeObserver ? new ResizeObserver(function () { layoutSoon(); }) : null;
	if (ro) ro.observe($("cp-out")); else window.addEventListener("resize", function () { layoutSoon(); });
	function setSpan(id, sp, cols) {
		sp = Math.max(1, Math.min(cols, sp));
		if (sp > 1) widths[id] = sp; else delete widths[id];
		saveWidths(); layoutSoon(true);
	}
	var wd = null;
	$("cp-out").addEventListener("pointerdown", function (e) {
		var gr = e.target.closest && e.target.closest(".cp-wgrip"); if (!gr || e.button > 0) return;
		var card = gr.closest(".cp-note"), gi = gridInfo(); if (gi.cols < 2) return;
		e.preventDefault();
		wd = { card: card, id: card.dataset.id, x: e.clientX, w: card.getBoundingClientRect().width, gi: gi, sp: Math.min(widths[card.dataset.id] || 1, gi.cols), drag: card.draggable };
		card.draggable = false; card.classList.add("is-wide-drag");
		try { gr.setPointerCapture(e.pointerId); } catch (x) {}
	});
	$("cp-out").addEventListener("pointermove", function (e) {
		if (!wd) return;
		var gi = wd.gi, w = wd.w + (e.clientX - wd.x), sp = Math.max(1, Math.min(gi.cols, Math.round((w + gi.gap) / (gi.cw + gi.gap))));
		if (sp !== wd.sp) { wd.sp = sp; if (sp > 1) widths[wd.id] = sp; else delete widths[wd.id]; layoutSoon(true); }
	});
	function endWide() { if (!wd) return; wd.card.draggable = wd.drag; wd.card.classList.remove("is-wide-drag"); saveWidths(); wd = null; }
	$("cp-out").addEventListener("pointerup", endWide);
	$("cp-out").addEventListener("pointercancel", endWide);
	$("cp-out").addEventListener("dblclick", function (e) {
		var gr = e.target.closest && e.target.closest(".cp-wgrip"); if (!gr) return;
		var id = gr.closest(".cp-note").dataset.id, gi = gridInfo(), cur = Math.min(widths[id] || 1, gi.cols);
		setSpan(id, cur > 1 ? 1 : gi.cols, gi.cols);
	});
	$("cp-out").addEventListener("keydown", function (e) {
		var gr = e.target.closest && e.target.closest(".cp-wgrip"); if (!gr) return;
		var id = gr.closest(".cp-note").dataset.id, gi = gridInfo(), cur = Math.min(widths[id] || 1, gi.cols), nx = null;
		if (e.key === "ArrowRight") nx = cur + 1; else if (e.key === "ArrowLeft") nx = cur - 1; else if (e.key === "Home") nx = 1; else if (e.key === "End") nx = gi.cols;
		if (nx == null) return;
		e.preventDefault(); e.stopPropagation(); setSpan(id, nx, gi.cols);
		var g2 = $("cp-out").querySelector('.cp-note[data-id="' + id + '"] .cp-wgrip'); if (g2) g2.focus();
	});

	/* ---------- drag to reorder (desktop) ---------- */
	var dragId = null;
	$("cp-out").addEventListener("dragstart", function (e) {
		var card = e.target.closest && e.target.closest(".cp-note");
		if (!card || query || editing) { e.preventDefault(); return; }
		dragId = card.dataset.id; card.classList.add("is-drag");
		try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); } catch (x) {}
	});
	$("cp-out").addEventListener("dragover", function (e) { if (dragId && e.target.closest(".cp-note")) { e.preventDefault(); } });
	$("cp-out").addEventListener("dragend", function () { dragId = null; render.noFocus = true; render(); render.noFocus = false; });
	$("cp-out").addEventListener("drop", function (e) {
		var over = e.target.closest(".cp-note"); if (!dragId || !over) return;
		e.preventDefault();
		var a = findNote(dragId), b = findNote(over.dataset.id);
		if (!a || !b || a.n === b.n || a.b !== b.b) { dragId = null; return; }
		var arr = a.b.notes; arr.splice(a.i, 1);
		var k = arr.indexOf(b.n); arr.splice(k >= 0 ? (a.i < b.i ? k + 1 : k) : arr.length, 0, a.n);
		dragId = null; save(); render();
	});


	/* ---------- ☁ Hive backup (MESHive + MESHiveStore; both optional: the panel explains if they are missing) ---------- */
	var HAPP = "copy-text", HNAME = "boards", ENC_KEY = KEY + ":hiveenc", hiveList = null, hiveBusy = false;
	function HV() { return window.MESHive; }
	function HS() { return window.MESHiveStore; }
	function hmsg(t, cls) { var m = $("cp-hive-msg"); m.textContent = t || ""; m.className = "tu-note cp-hive-msg" + (cls ? " is-" + cls : ""); }
	function encOn() { return $("cp-hive-encrypt").checked; }
	function paintWarn() {
		var w = $("cp-hive-warn");
		if (HS() && HS().canEncrypt && !HS().canEncrypt()) { w.className = "cp-hive-warn is-open"; w.innerHTML = "⚠ <b>Logged in with the Keychain phone app:</b> it can't use your memo key (pick <b>🛡 Passphrase</b> under the Encrypt tick to encrypt anyway), so a backup made here is <b>not encrypted</b>: every text will be public on the Hive blockchain, readable by anyone, forever. For encrypted backups (and to open them) use a computer with the Keychain extension, or open mes.fm in the Keychain app's own browser."; return; }
		if (encOn()) { w.className = "cp-hive-warn"; w.innerHTML = (HS().lockMode && HS().lockMode() === "pass" ? "🛡 Locked with your passphrase (quantum-safe): only the passphrase opens it." : "🔒 Encrypted: only your memo key can open it.") + " Others can still see that a backup exists, when, and its size. Saved permanently."; }
		else { w.className = "cp-hive-warn is-open"; w.innerHTML = "⚠ <b>Not encrypted:</b> every text and title will be <b>public on the Hive blockchain, readable by anyone, forever</b>. It can't be deleted later."; }
	}
	function paintUser() {
		var box = $("cp-hive-user"), u = HV() && HV().user();
		if (!HV() || !HS()) { box.innerHTML = '<p class="cp-hive-warn is-open">The Hive scripts did not load (blocked or offline). Reload the page to try again.</p>'; $("cp-hive-main").hidden = true; return; }
		if (u) {
			box.innerHTML = '<span class="cp-hive-who"><img src="' + HV().avatar(u.name) + '" alt="" width="24" height="24" loading="lazy"> Logged in as <b>@' + esc(u.name) + '</b></span> <button type="button" class="tu-btn tu-btn--ghost" data-h="logout">Log out</button>';
			$("cp-hive-main").hidden = false; $("cp-hive-help").innerHTML = "";
			var ce = $("cp-hive-encrypt"), can = !HS().canEncrypt || HS().canEncrypt();
			if (!can) ce.checked = false; else if (ce.disabled) { try { ce.checked = localStorage.getItem(ENC_KEY) !== "0"; } catch (e) { ce.checked = true; } }
			ce.disabled = !can; paintWarn();
		} else {
			box.innerHTML = '<div class="cp-hive-login"><input class="tu-input" id="cp-hive-name" type="text" placeholder="Your Hive username" aria-label="Your Hive username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="17">' +
				' <button type="button" class="tu-btn tu-btn--primary" data-h="login">Log in with Keychain</button></div>';
			$("cp-hive-main").hidden = true;
			HV().keychain(1500).then(function (k) { if (!k && !HV().user()) $("cp-hive-help").innerHTML = HV().helpHtml(); });
		}
	}
	function openHive(focus) {
		var p = $("cp-hive"); p.hidden = false; $("cp-hivebtn").setAttribute("aria-expanded", "true");
		try { $("cp-hive-encrypt").checked = localStorage.getItem(ENC_KEY) !== "0"; } catch (e) {}
		paintWarn(); paintUser();
		if (focus) { p.scrollIntoView({ block: "nearest", behavior: "smooth" }); var n = $("cp-hive-name"); (n || $("cp-hive-save")).focus(); }
	}
	function closeHive() { $("cp-hive").hidden = true; $("cp-hivebtn").setAttribute("aria-expanded", "false"); $("cp-hivebtn").focus(); }
	$("cp-hivebtn").onclick = function () { if ($("cp-hive").hidden) openHive(true); else closeHive(); };
	$("cp-hive-close").onclick = closeHive;
	$("cp-hive-encrypt").onchange = function () { try { localStorage.setItem(ENC_KEY, this.checked ? "1" : "0"); } catch (e) {} paintWarn(); };
	if (HS() && HS().encModeUI) HS().encModeUI($("cp-hive-encrypt"), function () { paintUser(); });
	if (window.MESHive) MESHive.onChange(function () { if (!$("cp-hive").hidden) { hiveList = null; $("cp-hive-list").innerHTML = ""; paintUser(); } });
	function kb(n) { return n < 1024 ? n + " bytes" : (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB"; }
	function when(iso) { var d = new Date(/Z$/.test(iso) ? iso : iso + "Z"); return isNaN(d) ? "" : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
	function errText(e) { return e && e.code === "cancel" ? "Cancelled." : (e && e.message) || "Something went wrong."; }
	function busy(on) { hiveBusy = on; ["cp-hive-save", "cp-hive-load"].forEach(function (id) { $(id).disabled = on; }); }
	function hiveSave() {
		if (hiveBusy) return;
		var snapData = CTLib.pickBoards(CTLib.snapshot(state), bkOff()), n = CTLib.count(snapData);
		if (!n) { hmsg(CTLib.anyOff(bkOff()) ? "The ticked boards are empty (see What to back up)." : "There is nothing to save yet.", "err"); return; }
		var enc = encOn();
		if (!enc && !confirm("Save WITHOUT encryption?\n\nAll " + n + " texts will be public on the Hive blockchain, readable by anyone, and can never be deleted.")) return;
		busy(true);
		var u = HV().user();
		HS().rcPercent(u.name).catch(function () { return null; }).then(function (rc) {
			if (rc != null && rc < 3) throw new Error("Your account's Resource Credits are at " + rc.toFixed(0) + "%. They refill over about five days; try again later.");
			return HS().save(HAPP, HNAME, snapData, { encrypt: enc, onProgress: function (m) { hmsg(m); } }).then(function (r) {
				setRec(CTLib.record(snapData, Date.now(), u.name)); render.noFocus = true; render(); render.noFocus = false;
				hmsg("Saved " + n + (n === 1 ? " text" : " texts") + " to @" + u.name + " on Hive (" + kb(r.bytes) + (enc ? (r.header && r.header.e === 2 ? ", locked with your passphrase (quantum-safe)" : ", encrypted") : ", NOT encrypted") + ")." +
					(rc != null ? " Resource Credits before: " + rc.toFixed(0) + "%." : "") + " It shows up in the list within a few seconds.", "ok");
				toast("Saved to Hive");
				hiveList = null; setTimeout(function () { hiveLoad(true); }, 4000);
			});
		}).catch(function (e) { hmsg(errText(e), "err"); }).then(function () { busy(false); });
	}
	function hiveLoad(quiet) {
		if (hiveBusy && !quiet) return;
		var u = HV().user(); if (!u) return;
		busy(true); if (!quiet) hmsg("Looking for your backups on Hive…");
		HS().list(u.name, { app: HAPP, name: HNAME, pages: 30, onProgress: function (i, of) { if (!quiet && i > 1) hmsg("Looking for your backups on Hive… (" + i + " pages of account history read)"); } }).then(function (saves) {
			hiveList = saves.slice(0, 12);
			paintList();
			var nw = saves[0], nt = nw ? Date.parse(/Z$/.test(nw.time) ? nw.time : nw.time + "Z") : 0;
			var other = nw && nw.complete && (!hrec || hrec.acct !== u.name || nt - hrec.t > 120000);
			if (!quiet) hmsg(saves.length ? "Found " + saves.length + (saves.length === 1 ? " backup" : " backups") + ". Pick one to load." +
				(other ? " The newest one (" + when(nw.time) + ") was not made or loaded in this browser: press Add to mine on it to see which of your texts are in it." : "") : "No Copy Text backups found on @" + u.name + " yet.", saves.length ? "" : "err");
		}).catch(function (e) { hmsg("Could not read from Hive: " + errText(e), "err"); }).then(function () { busy(false); });
	}
	var hivePick = {}; // save id -> ticked (to hide several at once)
	function shortWhen(t) {
		var d = new Date(/Z$/.test(t) ? t : t + "Z"); if (isNaN(d)) return when(t);
		var o = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
		if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
		return d.toLocaleString(undefined, o);
	}
	function paintList() {
		var box = $("cp-hive-list");
		if (!hiveList || !hiveList.length) { box.innerHTML = ""; hivePick = {}; return; }
		var ids = hiveList.map(function (e) { return e.s; });
		Object.keys(hivePick).forEach(function (k) { if (ids.indexOf(k) < 0) delete hivePick[k]; });
		var n = Object.keys(hivePick).filter(function (k) { return hivePick[k]; }).length, all = n === hiveList.length;
		box.innerHTML = '<div class="cp-hb-bar"><label class="cp-hb-all"><input type="checkbox" data-hp="all"' + (all ? " checked" : "") + '> Select all</label>' +
			'<button type="button" class="tu-btn tu-btn--ghost cp-hb-hide" data-h="forgetsel"' + (n ? "" : " disabled") + ' title="Hide the ticked backups from this list (the data stays on the blockchain)">Hide selected' + (n ? " (" + n + ")" : "") + '</button></div>' +
			'<ul class="cp-hb">' + hiveList.map(function (e, i) {
				var meta = HS().lockLabel(e) + " · " + esc(kb(e.bytes)) + (e.complete ? "" : " · incomplete");
				return '<li class="cp-hb-row' + (hivePick[e.s] ? " is-on" : "") + '"><input type="checkbox" class="cp-hb-ck" data-hp="' + i + '"' + (hivePick[e.s] ? " checked" : "") + ' aria-label="Select the backup of ' + esc(when(e.time)) + '">' +
					'<span class="cp-hb-when" title="' + esc(when(e.time)) + (e.encrypted ? " · encrypted" : " · not encrypted: public") + '"><b>' + esc(shortWhen(e.time)) + (i === 0 ? ' <span class="cp-hive-new">newest</span>' : "") + "</b>" +
					'<small>' + meta + (e.trx ? ' · <a href="' + HS().explorer(e.trx) + '" target="_blank" rel="noopener" class="cp-hive-tx" title="See this backup on the blockchain">chain ↗</a>' : "") + "</small></span>" +
					(e.complete ? '<span class="cp-hb-acts"><button type="button" class="tu-btn tu-btn--primary" data-h="merge" data-i="' + i + '" title="Add the texts you don\'t have yet; keeps yours">Add</button><button type="button" class="tu-btn" data-h="replace" data-i="' + i + '" title="Replace everything here with this backup">Replace</button></span>' : "") + "</li>";
			}).join("") + "</ul>";
	}
	$("cp-hive-list").addEventListener("change", function (e) {
		var k = e.target.dataset && e.target.dataset.hp; if (k == null || !hiveList) return;
		if (k === "all") hiveList.forEach(function (x) { hivePick[x.s] = e.target.checked; });
		else { var it = hiveList[+k]; if (it) hivePick[it.s] = e.target.checked; }
		paintList();
		var f = $("cp-hive-list").querySelector('[data-hp="' + k + '"]'); if (f) f.focus();
	});
	function restoreFrom(i, mode) {
		var e = hiveList && hiveList[i]; if (!e || hiveBusy) return;
		busy(true); hmsg(e.lock === "pass" ? "Unlocking with your passphrase…" : e.encrypted ? "Confirm in Keychain: decrypt the backup key with your memo key…" : "Opening the backup…");
		HS().load(e).then(function (data) {
			var snap = JSON.stringify(state), n = CTLib.count(data), et = Date.parse(/Z$/.test(e.time) ? e.time : e.time + "Z");
			if (i === 0 && (!hrec || !(et < hrec.t - 120000))) setRec(CTLib.record(data, et || Date.now(), HV().user() ? HV().user().name : ""));
			if (mode === "replace") {
				if (!confirm("Replace everything here with this backup (" + n + " texts)?\nYou can undo right after.")) { hmsg(""); return; }
				state = CTLib.replace(CTLib.replacePart(CTLib.snapshot(state), data), uid); save(); render();
				toast("Replaced with the Hive backup", function () { state = JSON.parse(snap); save(); render(); });
				hmsg("Loaded " + n + (n === 1 ? " text" : " texts") + " from the backup.", "ok");
			} else {
				var r = CTLib.merge(state, data, uid); save(); render();
				toast(r.added ? "Added " + r.added + " from Hive" : "Nothing new in that backup", r.added ? function () { state = JSON.parse(snap); save(); render(); } : null);
				hmsg(r.added ? "Added " + r.added + (r.added === 1 ? " text" : " texts") + (r.boards ? " and " + r.boards + (r.boards === 1 ? " board" : " boards") : "") + " you didn't have. Your own texts were kept." : "You already have every text in that backup.", "ok");
			}
		}).catch(function (x) { hmsg(errText(x), "err"); }).then(function () { busy(false); });
	}
	$("cp-hive").addEventListener("click", function (e) {
		var b = e.target.closest("[data-h]"); if (!b) return;
		var a = b.dataset.h;
		if (a === "login") {
			var name = ($("cp-hive-name").value || "").trim();
			if (!name) { $("cp-hive-name").focus(); hmsg("Type your Hive username first.", "err"); return; }
			hmsg("Confirm the login in Hive Keychain (the browser extension, or the phone app if this browser has no extension)…");
			HV().login(name).then(function () { hmsg(""); paintUser(); hiveLoad(true); }).catch(function (x) {
				hmsg(x.code === "nokeychain" ? "Hive Keychain is not installed in this browser (see below)." : errText(x), "err");
				if (x.code === "nokeychain") $("cp-hive-help").innerHTML = HV().helpHtml();
			});
		} else if (a === "logout") { HV().logout(); hiveList = null; $("cp-hive-list").innerHTML = ""; hmsg(""); paintUser(); }
		else if (a === "merge" || a === "replace") restoreFrom(+b.dataset.i, a);
		else if (a === "forgetsel") {
			var sel = hiveList.filter(function (x) { return hivePick[x.s]; }); if (!sel.length || hiveBusy) return;
			var pub = sel.some(function (x) { return !x.encrypted; });
			if (!confirm("Hide " + sel.length + (sel.length === 1 ? " backup" : " backups") + " from the list?\n\nThis only adds a 'hidden' note on Hive: the backups themselves stay in the blockchain's history forever" + (pub ? " (the public ones stay readable by anyone)." : " (still encrypted).") + (sel.length > 5 ? "\n\nKeychain asks once for every 5." : ""))) return;
			busy(true); hmsg("Confirm in Keychain…");
			var ids = sel.map(function (x) { return x.s; });
			HS().forgetMany(HAPP, HNAME, ids, function (d, t) { hmsg(d < t ? "Hidden " + d + " of " + t + ". Confirm the next ones in Keychain…" : ""); })
				.then(function () { hiveList = hiveList.filter(function (x) { return ids.indexOf(x.s) < 0; }); hivePick = {}; paintList(); hmsg("Hidden " + ids.length + (ids.length === 1 ? " backup" : " backups") + " from the list.", "ok"); })
				.catch(function (x) { hmsg(errText(x), "err"); hiveList = null; setTimeout(function () { hiveLoad(true); }, 4000); }).then(function () { busy(false); });
		}
		else if (a === "forget") {
			var it = hiveList[+b.dataset.i];
			if (!confirm("Hide this backup from the list?\n\nThis only adds a 'hidden' note on Hive: the backup itself stays in the blockchain's history forever" + (it.encrypted ? " (still encrypted)." : ", readable by anyone."))) return;
			busy(true); hmsg("Confirm in Keychain…");
			HS().forget(HAPP, HNAME, it.s).then(function () { hiveList.splice(+b.dataset.i, 1); paintList(); hmsg("Hidden from the list.", "ok"); })
				.catch(function (x) { hmsg(errText(x), "err"); }).then(function () { busy(false); });
		}
	});
	$("cp-hive").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "cp-hive-name") { e.preventDefault(); $("cp-hive").querySelector('[data-h="login"]').click(); } else if (e.key === "Escape") closeHive(); });
	$("cp-hive-save").onclick = hiveSave;
	$("cp-hive-load").onclick = function () { hiveLoad(false); };
	if (/[?&]hive=1\b/.test(location.search) || location.hash === "#hive") openHive(false);

	/* ---------- cross-tab sync ---------- */
	window.addEventListener("storage", function (e) {
		if (e.key !== KEY) return;
		try { var s = JSON.parse(e.newValue); if (s && Array.isArray(s.boards) && s.boards.length) { state = s; if (!board(state.cur)) state.cur = state.boards[0].id; if (!editing) render(); } } catch (x) {}
	});

	/* ---------- what to back up: which boards go to Hive and the sync file (per browser, by board name) ---------- */
	var BK = KEY + ":bkoff";
	function bkOff() { try { return JSON.parse(localStorage.getItem(BK) || "{}") || {}; } catch (e) { return {}; } }
	function paintBk() {
		var off = bkOff(), on = state.boards.filter(function (b) { return !off[b.name]; }).length, all = state.boards.length;
		document.querySelectorAll("[data-bksel]").forEach(function (box) {
			var open = box.querySelector("details") && box.querySelector("details").open;
			box.innerHTML = '<details' + (open || on < all ? " open" : "") + '><summary><b>What to back up:</b> ' + (on === all ? "all " + all + (all === 1 ? " board" : " boards") : on + " of " + all + " boards") + "</summary>" +
				'<div class="cp-bkrows">' + state.boards.map(function (b) {
					return '<label class="cp-bkrow"><input type="checkbox" data-bkb="' + esc(b.name) + '"' + (off[b.name] ? "" : " checked") + "> " + esc(b.name) + " <small>" + b.notes.length + "</small></label>";
				}).join("") + "</div>" +
				'<p class="tu-note">Unticked boards stay on this device only: they are not saved to Hive, and the sync leaves the other copy of them alone.</p></details>';
		});
	}
	document.addEventListener("change", function (e) {
		var c = e.target.closest && e.target.closest("[data-bkb]"); if (!c) return;
		var off = bkOff(), n = c.dataset.bkb; if (c.checked) delete off[n]; else off[n] = 1;
		Object.keys(off).forEach(function (k) { if (!state.boards.some(function (b) { return b.name === k; })) delete off[k]; });
		try { localStorage.setItem(BK, JSON.stringify(off)); } catch (x) {}
		paintBk(); if (syncApi) syncApi.changed();
	});
	["cp-syncbtn", "cp-hivebtn"].forEach(function (id) { var b = $(id); if (b) b.addEventListener("click", function () { setTimeout(paintBk, 0); }); });

	/* ---------- ☁ Save online & sync (sync.js) ---------- */
	if (window.CTSync) syncApi = window.CTSync({
		key: KEY, uid: uid, esc: esc, toast: toast, download: download,
		state: function () { return state; },
		busy: function () { return !!editing; },
		apply: function (s) { // a synced copy replaces what is here (no new sync is started by this)
			state = s; if (!board(state.cur)) state.cur = state.boards[0].id;
			try { localStorage.setItem(KEY, JSON.stringify(state)); memOnly = false; } catch (e) { memOnly = true; }
			status(); render.noFocus = true; render(); render.noFocus = false;
		}
	});

	try { var d = JSON.parse(localStorage.getItem(KEY + ":draft") || "null"); if (d) { $("cp-new-text").value = d.t || ""; $("cp-new-title").value = d.h || ""; } } catch (e) {}
	render.noFocus = true; render(); render.noFocus = false;
})();
