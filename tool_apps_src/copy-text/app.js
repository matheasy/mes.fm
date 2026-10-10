/* MES Copy Text -- mes.fm/copy-text
 * A clipboard shelf: save texts as notes on boards, click a note to copy it. Pin, colour, drag to reorder, search across
 * boards, {date}/{time}/... placeholders filled in at copy time, undo for deletes, .txt / .json export, JSON restore.
 * Everything lives in localStorage ("mes-copytext:v1"); nothing leaves the browser. Other tabs stay in sync via the storage event.
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
	}
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
	function status() {
		var total = 0, bytes = 0;
		state.boards.forEach(function (b) { total += b.notes.length; });
		try { bytes = JSON.stringify(state).length; } catch (e) {}
		var kb = bytes > 1024 ? (bytes / 1024).toFixed(bytes > 10240 ? 0 : 1) + " KB" : bytes + " bytes";
		$("cp-status").textContent = memOnly ? "Your browser is blocking storage, so these texts will be lost when you close the tab. Use More ▾ → Back up everything."
			: total + (total === 1 ? " text" : " texts") + " on " + state.boards.length + (state.boards.length === 1 ? " board" : " boards") + " · " + kb + " of about 5 MB used in this browser";
		$("cp-status").classList.toggle("cp-warn", memOnly);
	}
	function renderBoards() {
		var h = state.boards.map(function (b) {
			var on = b.id === state.cur && !query;
			return '<button type="button" role="tab" class="cp-tab" data-id="' + b.id + '" aria-selected="' + on + '">' + esc(b.name) + ' <span class="cp-n">' + b.notes.length + "</span></button>";
		}).join("");
		h += '<button type="button" class="cp-tab cp-tab--add" id="cp-addboard">+ Board</button>';
		$("cp-boards").innerHTML = h;
	}
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
				'<span class="cp-sp"></span><button type="button" class="tu-btn tu-btn--ghost cp-up" title="Move up" aria-label="Move up">↑</button><button type="button" class="tu-btn tu-btn--ghost cp-down" title="Move down" aria-label="Move down">↓</button></div></div>';
		}
		return '<div class="cp-note c-' + (n.c || "x") + (n.pin ? " is-pin" : "") + '" data-id="' + n.id + '" draggable="' + (!query) + '">' +
			'<div class="cp-nh"><span class="cp-grip" title="Drag to reorder" aria-hidden="true">⠿</span><b class="cp-title">' + (n.title ? esc(n.title) : '<i>' + esc(n.text.split("\n")[0].slice(0, 40) || "Empty") + (n.text.length > 40 ? "…" : "") + "</i>") + "</b>" +
			(showBoard ? '<span class="cp-bname">' + esc(b.name) + "</span>" : "") + (dynamic(n.text) ? '<span class="cp-dyn" title="Contains {date}/{time} placeholders that are filled in when you copy">live</span>' : "") + '<span class="cp-sp"></span>' +
			'<button type="button" class="cp-ibtn cp-pin" aria-pressed="' + !!n.pin + '" title="' + (n.pin ? "Unpin" : "Pin to the top") + '" aria-label="' + (n.pin ? "Unpin" : "Pin to the top") + '">★</button></div>' +
			'<div class="cp-body' + (long && !ex ? " is-clamped" : "") + '" tabindex="0" role="button" title="Click to copy" aria-label="Copy: ' + esc(n.title || n.text.slice(0, 30)) + '"><pre>' + esc(n.text) + "</pre></div>" +
			(long ? '<button type="button" class="cp-more">' + (ex ? "Show less" : "Show more") + "</button>" : "") +
			'<div class="cp-foot"><button type="button" class="tu-btn tu-btn--primary cp-copy">Copy</button><button type="button" class="tu-btn tu-btn--ghost cp-edit-btn" title="Edit" aria-label="Edit">✎</button>' +
			'<button type="button" class="tu-btn tu-btn--ghost cp-dup" title="Duplicate" aria-label="Duplicate">⧉</button><button type="button" class="tu-btn tu-btn--ghost cp-del" title="Delete" aria-label="Delete">🗑</button>' +
			'<span class="cp-sp"></span><span class="cp-count">' + n.text.length + " chars · " + words(n.text) + " words</span></div></div>";
	}
	function sorted(list) { // pinned first, otherwise the saved order
		return list.map(function (n, i) { return { n: n, i: i }; }).sort(function (a, b) { return (b.n.pin ? 1 : 0) - (a.n.pin ? 1 : 0) || a.i - b.i; }).map(function (x) { return x.n; });
	}
	function render() {
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
				var s = JSON.parse(r.result);
				if (!s || !Array.isArray(s.boards)) throw 0;
				var added = 0;
				s.boards.forEach(function (ib) {
					if (!ib || !Array.isArray(ib.notes)) return;
					var b = null; state.boards.forEach(function (x) { if (x.name === ib.name) b = x; });
					if (!b) { b = { id: uid(), name: String(ib.name || "Imported").slice(0, 40), notes: [] }; state.boards.push(b); }
					ib.notes.forEach(function (n) {
						if (!n || typeof n.text !== "string") return;
						var dup = b.notes.some(function (x) { return x.text === n.text && (x.title || "") === (n.title || ""); });
						if (dup) return;
						b.notes.push({ id: uid(), title: String(n.title || "").slice(0, 80), text: n.text, c: COLORS.indexOf(n.c) >= 0 ? n.c : "", pin: !!n.pin, t: +n.t || Date.now() }); added++;
					});
				});
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
		f.n.text = text.replace(/\s+$/, ""); f.n.title = title; if (card.dataset.pc != null) f.n.c = card.dataset.pc;
		if (to !== f.b.id && board(to)) { f.b.notes.splice(f.i, 1); board(to).notes.unshift(f.n); toast("Moved to “" + board(to).name + "”"); }
		if (!quiet) { editing = null; save(); render(); } else save();
	}

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

	/* ---------- cross-tab sync ---------- */
	window.addEventListener("storage", function (e) {
		if (e.key !== KEY) return;
		try { var s = JSON.parse(e.newValue); if (s && Array.isArray(s.boards) && s.boards.length) { state = s; if (!board(state.cur)) state.cur = state.boards[0].id; if (!editing) render(); } } catch (x) {}
	});

	try { var d = JSON.parse(localStorage.getItem(KEY + ":draft") || "null"); if (d) { $("cp-new-text").value = d.t || ""; $("cp-new-title").value = d.h || ""; } } catch (e) {}
	render.noFocus = true; render(); render.noFocus = false;
})();
