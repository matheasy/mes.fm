/* MES Find (2026-11-23): the shared find bar + page / line box of the document viewers (mes.fm/pdf, /docx, /text).

   Pure parts (also node: require("mes.fm/main_js/find-bar.js")):
     MESFind.find(text, q, {caseSensitive, wholeWord, nl, max}) -> [[start, end], ...]
         not case sensitive = also ignores accents (é finds e); a space in q matches any run of spaces / tabs / new lines
         (nl: false = not new lines); max = stop after this many (default 5000).
     MESFind.snippet(text, a, b, n) -> {pre, hit, post, l, r}  a short piece round the match for the results list (l / r = cut).
     MESFind.groups(hits) -> [{g, label, items: [{h, i}]}]       hits in a row with the same .g go under one heading (.gl).
     MESFind.lineOf(starts, offset) -> index                     starts = sorted start offsets (lines, pages ...).
     MESFind.parseJump("12", max) -> 12 | null

   Page parts:
     MESFind.bar({mount, search(q, opts, progress) -> {hits, note} | Promise, go(hit, i, hits), clear(), onClose,
                  placeholder, theme: "dark"}) -> {el, open(text), close(), isOpen(), refresh(keep), next(), prev(), input}
         a hit = {g, gl, text, a, b} (snippet made here) or {g, gl, pre, hit, post}. Enter / Shift+Enter = next / previous,
         Esc = close. Options (match case, whole words, results list shown) are kept in localStorage "mes-find".
         fixed: true = always shown (e.g. in a side panel): no close button, Esc clears it.
     MESFind.pageBox({label: "Page", onGo(n)}) -> {el, set(cur, total), input}
     MESFind.textIndex(roots, skip(el) -> bool) -> {s, nodes}; MESFind.range(ix, a, b) -> Range
     MESFind.paint(ranges, cur) / MESFind.unpaint()  CSS Custom Highlight API ("mes-find" / "mes-find-cur"); MESFind.styleRoot(shadowRoot)
         adds the ::highlight rules inside a shadow root (document rules do not reach into it).
     MESFind.reveal(scroller, rect)  scrolls a box so the rect sits a third of the way down. */
(function (root) {
	"use strict";
	var ACC = /[̀-ͯ]/g;
	function fold(s) {
		var l = s.toLowerCase(); if (l.length !== s.length) l = s.replace(/[\s\S]/g, function (c) { var x = c.toLowerCase(); return x.length === 1 ? x : c; });
		return l.replace(/[^\x00-\x7f]/g, function (c) { var d = c.normalize ? c.normalize("NFD").replace(ACC, "") : c; return d.length === 1 ? d : c; });
	}
	function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
	var WORD = /[\p{L}\p{N}_]/u;
	function find(text, q, o) {
		o = o || {}; text = String(text == null ? "" : text); q = String(q == null ? "" : q);
		var max = o.max || 5000;
		if (!q.trim()) return [];
		var cs = !!o.caseSensitive, hay = cs ? text : fold(text), n = cs ? q : fold(q);
		var ws = o.nl === false ? "[^\\S\\n]+" : "\\s+";
		var src = n.replace(/^\s+|\s+$/g, "").split(/\s+/).map(escRe).join(ws);
		if (/^\s/.test(n)) src = ws + src; if (/\s$/.test(n) && n.trim()) src += ws;
		var re = new RegExp(src, "g"), out = [], m;
		while ((m = re.exec(hay))) {
			if (!m[0].length) { re.lastIndex++; continue; }
			var a = m.index, b = a + m[0].length;
			if (o.wholeWord && (WORD.test(text.charAt(a - 1)) && WORD.test(text.charAt(a)) || WORD.test(text.charAt(b)) && WORD.test(text.charAt(b - 1)))) continue;
			out.push([a, b]); if (out.length >= max) break;
		}
		return out;
	}
	function flat(s) { return s.replace(/\s+/g, " "); }
	function snippet(text, a, b, n) {
		n = n || 40; text = String(text || "");
		var s = Math.max(0, a - n), e = Math.min(text.length, b + n + 20);
		if (s > 0) { var sp = text.slice(s, a).search(/\s/); if (sp >= 0 && sp < n - 8) s += sp + 1; }
		if (e < text.length) { var t = text.slice(b, e), k = t.search(/\s\S*$/); if (k > 10) e = b + k; }
		return { pre: flat(text.slice(s, a)).replace(/^ /, ""), hit: flat(text.slice(a, b)), post: flat(text.slice(b, e)).replace(/ $/, ""), l: s > 0, r: e < text.length };
	}
	function groups(hits) {
		var out = [], cur = null;
		(hits || []).forEach(function (h, i) { if (!cur || cur.g !== h.g) { cur = { g: h.g, label: h.gl || "", items: [] }; out.push(cur); } cur.items.push({ h: h, i: i }); });
		return out;
	}
	function lineOf(starts, off) { var lo = 0, hi = starts.length - 1; while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo; }
	function parseJump(v, max) { var n = parseInt(String(v).replace(/[^\d]/g, ""), 10); if (!(n >= 1)) return null; return max ? Math.min(n, max) : n; }
	var api = { find: find, snippet: snippet, groups: groups, lineOf: lineOf, parseJump: parseJump, fold: fold };
	if (typeof module === "object" && module.exports) { module.exports = api; return; }
	if (root.MESFind) return;

	/* ---------------- page parts ---------------- */
	var HL = "::highlight(mes-find){background-color:rgba(253,214,40,.55);color:inherit}::highlight(mes-find-cur){background-color:#f97316;color:#fff}";
	var STY = ".mes-find{--mf-bg:#fff;--mf-fg:#1f2328;--mf-dim:#5d6470;--mf-line:#cfd5dd;--mf-field:#fff;--mf-hover:#eef2f7;--mf-acc:#2563eb;--mf-mark:#fde68a;--mf-markfg:#111;" +
		"background:var(--mf-bg);color:var(--mf-fg);border-bottom:1px solid var(--mf-line);font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:left}" +
		".mes-find *{box-sizing:border-box;color:inherit}" +
		"body.dark-mode .mes-find,body.dark .mes-find,.mes-find[data-theme=dark]{--mf-bg:#1e1f26;--mf-fg:#ececf1;--mf-dim:#aeb0c2;--mf-line:#3a3c4a;--mf-field:#111217;--mf-hover:#30323f;--mf-acc:#7aa7ff;--mf-mark:#a16207;--mf-markfg:#fff}" +
		".mes-find .mf-row{display:flex;align-items:center;gap:.3em;padding:.35em .5em;flex-wrap:wrap}" +
		".mes-find .mf-qw{position:relative;flex:1 1 14em;min-width:10em;display:flex;align-items:center}" +
		".mes-find .mf-ico{position:absolute;left:.55em;opacity:.6;pointer-events:none;display:flex}" +
		".mes-find .mf-q{width:100%;font:inherit;font-size:15px;padding:.42em .6em .42em 2em;border:1px solid var(--mf-line);border-radius:.45em;background:var(--mf-field);color:var(--mf-fg);margin:0}" +
		".mes-find .mf-q:focus{outline:2px solid var(--mf-acc);outline-offset:-1px}" +
		".mes-find .mf-n{min-width:5.5em;text-align:center;color:var(--mf-dim);font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13px}" +
		".mes-find .mf-n.is-none{color:#dc2626}body.dark-mode .mes-find .mf-n.is-none,.mes-find[data-theme=dark] .mf-n.is-none{color:#ff8a8a}" +
		".mes-find button{font:inherit;margin:0;cursor:pointer;background:transparent;border:1px solid transparent;border-radius:.4em;color:var(--mf-fg);min-width:2.2em;height:2.2em;padding:0 .45em;line-height:1}" +
		".mes-find button:hover{background:var(--mf-hover)}.mes-find button[aria-pressed=true]{background:var(--mf-hover);border-color:var(--mf-acc);color:var(--mf-acc)}" +
		".mes-find button:focus-visible{outline:2px solid var(--mf-acc);outline-offset:-2px}.mes-find button:disabled{opacity:.4;cursor:default}" +
		".mes-find .mf-t{font-weight:700;font-size:13px}.mes-find .mf-w{text-decoration:underline;text-underline-offset:3px}" +
		".mes-find--fixed{border-bottom:0}.mes-find.mes-find--fixed .mf-res{max-height:none;overflow:visible}.mes-find .mf-res{border-top:1px solid var(--mf-line);max-height:var(--mf-max,min(36vh,320px));overflow:auto;padding:.2em 0 .4em}" +
		".mes-find .mf-sum{padding:.3em .8em;color:var(--mf-dim);font-size:13px}" +
		".mes-find .mf-gh{display:flex;justify-content:space-between;gap:.5em;padding:.45em .8em .15em;font-weight:700;font-size:12.5px;color:var(--mf-dim);text-transform:uppercase;letter-spacing:.03em;position:sticky;top:-.2em;background:var(--mf-bg)}" +
		".mes-find .mf-gh button{height:auto;min-width:0;padding:0 .3em;font-size:12px;text-transform:none;letter-spacing:0;color:var(--mf-acc);font-weight:600}" +
		".mes-find .mf-it{display:block;width:100%;height:auto;text-align:left;padding:.35em .8em .35em 1.2em;border-radius:0;font-size:13.5px;line-height:1.4;overflow-wrap:anywhere}" +
		".mes-find .mf-it.is-on{background:var(--mf-hover);box-shadow:inset 3px 0 var(--mf-acc)}" +
		".mes-find .mf-it mark{background:var(--mf-mark);color:var(--mf-markfg);border-radius:2px;padding:0 1px}" +
		".mes-find .mf-it small{color:var(--mf-dim);margin-right:.4em;font-variant-numeric:tabular-nums}" +
		".mes-find .mf-note{padding:.35em .8em;font-size:13px;color:var(--mf-dim)}" +
		".mes-fpage{display:inline-flex;align-items:center;gap:.3em;white-space:nowrap;font-size:13px}" +
		".mes-fpage input{width:3.6em;text-align:center;font:inherit;font-size:13px;padding:.25em .2em;border:1px solid var(--mf-pl,#c3c9d2);border-radius:.35em;background:var(--mf-pf,#fff);color:inherit;margin:0;-moz-appearance:textfield}" +
		".mes-fpage input::-webkit-inner-spin-button{-webkit-appearance:none}" +
		"body.dark-mode .mes-fpage input,.mes-fpage[data-theme=dark] input{--mf-pl:#4a4c5a;--mf-pf:#111217}" +
		"@media (max-width:560px){.mes-find .mf-n{min-width:4.2em}.mes-find .mf-t{display:none}}" + HL;
	function css() { if (document.getElementById("mes-find-css")) return; var s = document.createElement("style"); s.id = "mes-find-css"; s.textContent = STY; document.head.appendChild(s); }
	function styleRoot(r) { if (!r || r.querySelector && r.querySelector("style[data-mes-find]")) return; var s = document.createElement("style"); s.setAttribute("data-mes-find", ""); s.textContent = HL; r.appendChild(s); }
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var KEY = "mes-find";
	function loadOpt() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
	function saveOpt(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
	var ICO = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5l5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
	var LIMIT = 400;

	function bar(cfg) {
		css();
		var O = loadOpt(); if (O.list == null) O.list = true;
		var el = document.createElement("div"); el.className = "mes-find"; el.setAttribute("role", "search"); el.hidden = true;
		if (cfg.theme === "dark") el.setAttribute("data-theme", "dark");
		el.innerHTML = '<div class="mf-row"><div class="mf-qw"><span class="mf-ico">' + ICO + '</span><input type="search" class="mf-q" enterkeyhint="search" spellcheck="false" autocomplete="off" aria-label="Find in the document" placeholder="' + esc(cfg.placeholder || "Find in the document…") + '"></div>' +
			'<span class="mf-n" aria-live="polite"></span>' +
			'<button type="button" class="mf-prev" title="Previous match (Shift+Enter)" aria-label="Previous match">&#9650;</button>' +
			'<button type="button" class="mf-next" title="Next match (Enter)" aria-label="Next match">&#9660;</button>' +
			'<button type="button" class="mf-case" title="Match case (capitals must match; also tells é from e)" aria-pressed="false"><span class="mf-t">Aa</span></button>' +
			'<button type="button" class="mf-word" title="Whole words only" aria-pressed="false"><span class="mf-t mf-w">ab</span></button>' +
			'<button type="button" class="mf-list" title="Show or hide the list of matches" aria-pressed="false">&#9776;<span class="mf-t"> Results</span></button>' +
			'<button type="button" class="mf-x" title="Close (Esc)" aria-label="Close find">&#10005;</button></div>' +
			'<div class="mf-res" hidden><div class="mf-sum"></div><div class="mf-items"></div></div>';
		var q = el.querySelector(".mf-q"), nEl = el.querySelector(".mf-n"), res = el.querySelector(".mf-res"), sum = el.querySelector(".mf-sum"), items = el.querySelector(".mf-items");
		var bCase = el.querySelector(".mf-case"), bWord = el.querySelector(".mf-word"), bList = el.querySelector(".mf-list");
		var hits = [], at = -1, gen = 0, note = "", t = 0;
		if (cfg.mount) cfg.mount.appendChild(el);
		if (cfg.fixed) { el.hidden = false; el.classList.add("mes-find--fixed"); el.querySelector(".mf-x").hidden = true; }
		function paintOpts() { bCase.setAttribute("aria-pressed", String(!!O.cs)); bWord.setAttribute("aria-pressed", String(!!O.ww)); bList.setAttribute("aria-pressed", String(!!O.list)); res.hidden = !(O.list && (hits.length || note) && q.value.trim()); }
		paintOpts();
		function count() {
			nEl.classList.toggle("is-none", !!q.value.trim() && !hits.length && !nEl.dataset.busy);
			if (nEl.dataset.busy) return;
			nEl.textContent = !q.value.trim() ? "" : hits.length ? (at + 1) + " of " + hits.length.toLocaleString() + (hits.capped ? "+" : "") : "No matches";
		}
		function list() {
			if (!hits.length) { sum.textContent = note || ""; items.innerHTML = ""; paintOpts(); return; }
			var gs = groups(hits), shown = 0, html = "";
			var gCount = gs.filter(function (g) { return g.label; }).length;
			sum.innerHTML = esc(hits.length.toLocaleString() + (hits.capped ? "+" : "") + (hits.length === 1 ? " match" : " matches") + (gCount > 1 ? " in " + gCount.toLocaleString() + " " + (cfg.groupWord || "places") : "")) + (note ? " · " + esc(note) : "");
			for (var k = 0; k < gs.length && shown < LIMIT; k++) {
				var g = gs[k];
				if (g.label) html += '<div class="mf-gh"><span>' + esc(g.label) + '</span><span>' + g.items.length + "</span></div>";
				for (var j = 0; j < g.items.length && shown < LIMIT; j++, shown++) {
					var h = g.items[j].h, sn = h.pre != null ? h : snippet(h.text, h.a, h.b);
					html += '<button type="button" class="mf-it' + (g.items[j].i === at ? " is-on" : "") + '" data-i="' + g.items[j].i + '">' + (h.sub ? "<small>" + esc(h.sub) + "</small>" : "") + (sn.l ? "&hellip;" : "") + esc(sn.pre) + "<mark>" + esc(sn.hit) + "</mark>" + esc(sn.post) + (sn.r ? "&hellip;" : "") + "</button>";
				}
			}
			if (shown < hits.length) html += '<div class="mf-note">The list shows the first ' + LIMIT + '. Use ▲ ▼ (or Enter) to step through all of them.</div>';
			items.innerHTML = html; paintOpts();
		}
		function mark() {
			[].forEach.call(items.querySelectorAll(".mf-it"), function (b) { var on = +b.dataset.i === at; b.classList.toggle("is-on", on); if (on && !res.hidden) { var r = b.getBoundingClientRect(), c = res.getBoundingClientRect(); if (r.top < c.top + 20 || r.bottom > c.bottom) res.scrollTop += r.top - c.top - c.height / 3; } });
		}
		function go(i) {
			if (!hits.length) return;
			at = (i + hits.length) % hits.length; count(); mark();
			if (cfg.go) cfg.go(hits[at], at, hits);
		}
		function run(keep) {
			var my = ++gen, v = q.value, was = at;
			if (!v.trim()) { hits = []; at = -1; note = ""; if (cfg.clear) cfg.clear(); count(); list(); return; }
			nEl.dataset.busy = "1"; nEl.textContent = "…";
			Promise.resolve(cfg.search(v, { caseSensitive: !!O.cs, wholeWord: !!O.ww }, function (msg) { if (my === gen) nEl.textContent = msg; })).then(function (r) {
				if (my !== gen) return;
				delete nEl.dataset.busy;
				hits = (r && r.hits) || []; note = (r && r.note) || ""; hits.capped = !!(r && r.capped);
				at = -1; list();
				if (hits.length) go(keep && was >= 0 ? Math.min(was, hits.length - 1) : (r && r.start) || 0); else { if (cfg.clear) cfg.clear(); count(); }
			}, function (e) { if (my !== gen) return; delete nEl.dataset.busy; hits = []; note = (e && e.message) || "Search failed"; count(); list(); });
		}
		q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { run(false); }, 220); });
		q.addEventListener("keydown", function (e) {
			if (e.key === "Enter") { e.preventDefault(); clearTimeout(t); if (!hits.length || nEl.dataset.busy) run(false); else go(at + (e.shiftKey ? -1 : 1)); }
			else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
			else if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); go(at + 1); }
			else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); go(at - 1); }
		});
		el.addEventListener("keydown", function (e) { if (e.key === "Escape" && e.target !== q) { e.preventDefault(); close(); } });
		el.querySelector(".mf-next").onclick = function () { if (!hits.length) run(false); else go(at + 1); };
		el.querySelector(".mf-prev").onclick = function () { if (!hits.length) run(false); else go(at - 1); };
		bCase.onclick = function () { O.cs = !O.cs; saveOpt(O); paintOpts(); run(true); };
		bWord.onclick = function () { O.ww = !O.ww; saveOpt(O); paintOpts(); run(true); };
		bList.onclick = function () { O.list = !O.list; saveOpt(O); paintOpts(); mark(); };
		el.querySelector(".mf-x").onclick = function () { close(); };
		items.addEventListener("click", function (e) { var b = e.target.closest(".mf-it"); if (b) go(+b.dataset.i); });
		function open(text) {
			var was = el.hidden; el.hidden = false;
			if (text && text.trim() && text.length < 200 && text !== q.value) { q.value = text.replace(/\s+/g, " ").trim(); run(false); }
			else if (was && q.value.trim()) run(true);
			q.focus(); q.select();
			if (cfg.onOpen) cfg.onOpen();
		}
		function close() { if (cfg.fixed) { q.value = ""; run(false); return; } if (el.hidden) return; el.hidden = true; gen++; hits = []; at = -1; if (cfg.clear) cfg.clear(); if (cfg.onClose) cfg.onClose(); }
		return { el: el, input: q, open: open, close: close, isOpen: function () { return !el.hidden; }, refresh: function (keep) { if (!el.hidden && q.value.trim()) run(keep !== false); },
			next: function () { if (!hits.length) run(false); else go(at + 1); }, prev: function () { if (!hits.length) run(false); else go(at - 1); },
			current: function () { return hits[at] || null; }, hits: function () { return hits; } };
	}

	function pageBox(cfg) {
		css();
		var el = document.createElement("label"); el.className = "mes-fpage"; el.title = cfg.title || "Type a number and press Enter to jump there";
		if (cfg.theme === "dark") el.setAttribute("data-theme", "dark");
		el.innerHTML = '<span class="mf-pl">' + esc(cfg.label || "Page") + '</span><input type="text" inputmode="numeric" autocomplete="off" aria-label="' + esc(cfg.aria || ((cfg.label || "Page") + " number")) + '"><span class="mf-pt"></span>';
		var inp = el.querySelector("input"), tot = el.querySelector(".mf-pt"), cur = 0, total = 0, editing = false;
		function show() { if (!editing) inp.value = total ? String(cur) : ""; tot.textContent = total ? "/ " + total.toLocaleString() : ""; inp.disabled = !total; inp.style.width = Math.max(3.2, String(total).length * 0.7 + 1.6) + "em"; }
		function jump() { var n = parseJump(inp.value, total); editing = false; if (n && cfg.onGo) cfg.onGo(n); else show(); inp.blur(); }
		inp.addEventListener("focus", function () { editing = true; setTimeout(function () { inp.select(); }, 0); });
		inp.addEventListener("blur", function () { editing = false; show(); });
		inp.addEventListener("keydown", function (e) {
			if (e.key === "Enter") { e.preventDefault(); jump(); }
			else if (e.key === "Escape") { e.preventDefault(); editing = false; show(); inp.blur(); }
			else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); var n = (parseJump(inp.value, total) || cur) + (e.key === "ArrowUp" ? -1 : 1); n = Math.max(1, Math.min(total, n)); inp.value = n; if (cfg.onGo) cfg.onGo(n); }
		});
		show();
		return { el: el, input: inp, set: function (c, t) { cur = c; total = t; show(); } };
	}

	var BLOCK = /^(P|DIV|LI|TD|TH|TR|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|BLOCKQUOTE|PRE|DT|DD|FIGCAPTION|CAPTION|TABLE|UL|OL|BODY)$/;
	/* text of different paragraphs / cells gets a space between them (not in any node), so words of two blocks never run together */
	function blockOf(e, r) { while (e && e !== r && !BLOCK.test(e.nodeName)) e = e.parentNode; return e; }
	function textIndex(roots, skip) {
		var s = "", nodes = [];
		(Array.isArray(roots) ? roots : [roots]).forEach(function (r, k) {
			if (!r) return;
			var w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentNode; if (!p) return NodeFilter.FILTER_REJECT; for (var e = p; e && e !== r; e = e.parentNode) { if (/^(STYLE|SCRIPT|NOSCRIPT|MJX-ASSISTIVE-MML)$/.test(e.nodeName) || e.hidden || (skip && skip(e))) return NodeFilter.FILTER_REJECT; } return NodeFilter.FILTER_ACCEPT; } });
			var n; if (k && s && !/\s$/.test(s)) s += " ";
			var lastB = null;
			while ((n = w.nextNode())) { var bk = blockOf(n.parentNode, r); if (lastB && bk !== lastB && s && !/\s$/.test(s)) s += " "; lastB = bk; nodes.push({ n: n, at: s.length }); s += n.nodeValue; }
		});
		return { s: s, nodes: nodes };
	}
	function nodeAt(ix, off, end) {
		var lo = 0, hi = ix.nodes.length - 1;
		while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (ix.nodes[mid].at < off || (!end && ix.nodes[mid].at === off)) lo = mid; else hi = mid - 1; }
		return ix.nodes[lo];
	}
	function range(ix, a, b) {
		if (!ix.nodes.length) return null;
		var r = document.createRange(), na = nodeAt(ix, a, false), nb = nodeAt(ix, b, true);
		try { r.setStart(na.n, Math.min(na.n.nodeValue.length, Math.max(0, a - na.at))); r.setEnd(nb.n, Math.min(nb.n.nodeValue.length, Math.max(0, b - nb.at))); } catch (e) { return null; }
		return r;
	}
	var hasHL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
	function paint(ranges, cur) {
		if (!hasHL) { if (cur) { var s = getSelection(); s.removeAllRanges(); s.addRange(cur); } return; }
		var all = new Highlight(); (ranges || []).forEach(function (r) { if (r) all.add(r); }); CSS.highlights.set("mes-find", all);
		if (cur) CSS.highlights.set("mes-find-cur", new Highlight(cur)); else CSS.highlights.delete("mes-find-cur");
	}
	function unpaint() { if (hasHL) { CSS.highlights.delete("mes-find"); CSS.highlights.delete("mes-find-cur"); } }
	function reveal(sc, rect, smooth) {
		if (!sc || !rect) return;
		var c = sc.getBoundingClientRect(), top = Math.max(c.top, 0), bot = Math.min(c.bottom, innerHeight);
		if (rect.top >= top + 30 && rect.bottom <= bot - 30 && rect.left >= c.left && rect.right <= c.right) return;
		sc.scrollTo({ top: sc.scrollTop + rect.top - c.top - (bot - top) / 3, left: rect.left < c.left || rect.right > c.right ? sc.scrollLeft + rect.left - c.left - c.width / 3 : sc.scrollLeft, behavior: smooth ? "smooth" : "auto" });
	}
	/* Ctrl/Cmd+F (and F3 / Ctrl+G) for one area: only while it is on screen, so the browser's own find still works elsewhere on the page */
	function keys(area, fns) {
		document.addEventListener("keydown", function (e) {
			var mod = e.ctrlKey || e.metaKey, k = e.key && e.key.toLowerCase();
			if (!(mod && (k === "f" || k === "g")) && e.key !== "F3") return;
			if (fns.when && !fns.when()) return;
			var r = area.getBoundingClientRect(); if (!r.width || r.bottom < 60 || r.top > innerHeight - 60) return;
			e.preventDefault();
			if (k === "f" && !e.shiftKey) fns.open(); else if (e.shiftKey) fns.prev(); else fns.next();
		});
	}
	api.bar = bar; api.pageBox = pageBox; api.textIndex = textIndex; api.range = range; api.paint = paint; api.unpaint = unpaint; api.styleRoot = styleRoot; api.reveal = reveal; api.keys = keys; api.esc = esc; api.css = css;
	root.MESFind = api;
})(typeof window !== "undefined" ? window : this);
