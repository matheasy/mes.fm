/* MES Photo Editor round 8 -- icons that never depend on an emoji font. Windows 7 (Opera, older Firefox) has no colour emoji font and only a few of
 * the symbol characters the editor used, so its buttons showed empty boxes. Every icon character in the editor's own chrome (tool list, menus, panel
 * buttons, top bar, dialogs, toasts) is swapped for a small inline SVG drawn with the text colour: PE.icon(name) builds one, PE.icoize(node) swaps the
 * characters inside a node, and a MutationObserver keeps doing it as the editor redraws itself. Typed text (inputs, layer names, the font list,
 * anything with data-noico) is never touched. The tool list uses PE.toolIcon(id) directly. */
(function () {
	"use strict";
	var PE = window.PE; if (!PE) return;
	var R = function (x, y, w, h, rx, extra) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + (rx ? ' rx="' + rx + '"' : "") + (extra || "") + "/>"; };
	var C = function (cx, cy, r, extra) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"' + (extra || "") + "/>"; };
	var D = function (d, extra) { return '<path d="' + d + '"' + (extra || "") + "/>"; };
	var FILL = ' fill="currentColor" stroke="none"';
	var ICONS = {
		move: D("M12 2v20M2 12h20M12 2 9 5M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"),
		marquee: R(4, 5, 16, 14, 0, ' stroke-dasharray="3 2.5"'),
		lasso: D("M8 17.5C4.5 16 3 13.5 4.5 10.5 6.5 6.5 14 4.5 18 6.5s2.5 7-3 9c-2 .7-4.5.8-7 .3M8 17.5c-1 1.5-.5 3.5 1.5 4"),
		wand: D("M4 20 15 9M13.5 7.5l3 3M17 3v3M15.5 4.5h3M20 9v2M19 10h2M10 3v2M9 4h2"),
		crop: D("M6 2v16h16M2 6h16v16"),
		layercrop: D("M6 2v16h16M2 6h16v16") + R(9, 9, 6, 6, 0, ' stroke-dasharray="2 1.5"'),
		brush: D("M19.5 3.5l1 1L12 14l-2-2zM10 12c-2.5-.5-4.5 1-4.5 3.5 0 1.2-.8 2.3-2 2.5 2.5 2.5 7 2 8-1 .6-1.8 0-3.5-1.5-5"),
		smudge: D("M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 10.5a1.5 1.5 0 0 1 3 0V12M15 11.5a1.5 1.5 0 0 1 3 0V14c0 4-2.7 7-6.5 7S5 18 5 14.5V13a1.5 1.5 0 0 1 3 0v.5"),
		eraser: D("M20 20H9l-5-5a1.5 1.5 0 0 1 0-2.1l8.9-8.9a1.5 1.5 0 0 1 2.1 0l5 5a1.5 1.5 0 0 1 0 2.1L12 20M8.5 9.5l6 6"),
		clone: D("M9.5 3h5v5l3 3.5h-11L9.5 8zM5 14.5h14v3H5zM7 21h10"),
		retouch: D("M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"),
		objerase: R(3, 9, 15, 11, 3) + C(7.5, 13, 0.8, FILL) + C(12, 16, 0.8, FILL) + C(13.5, 12, 0.8, FILL) + D("M19.5 2.5v4M17.5 4.5h4"),
		bucket: D("M5 11.5 12 4.5l7.5 7.5-7 7a1.5 1.5 0 0 1-2.1 0l-5.4-5.4a1.5 1.5 0 0 1 0-2.1zM5 11.5h14.5M20.5 15.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"),
		gradient: R(3, 3, 18, 18, 2) + D("M21 3 3 21h16a2 2 0 0 0 2-2z", ' fill="currentColor" stroke="none" opacity=".75"'),
		eyedropper: D("M14.5 4.5l5 5M16 3a2.1 2.1 0 0 1 3 3l-2 2-3-3zM13 6.5l-8 8V19h4.5l8-8M5 19l-2 2"),
		hand: D("M7.5 11.5V6a1.5 1.5 0 0 1 3 0v5M10.5 10.5V4.5a1.5 1.5 0 0 1 3 0v6M13.5 10.5V5.5a1.5 1.5 0 0 1 3 0V12M16.5 9a1.5 1.5 0 0 1 3 0v5c0 4-3 7-7 7-3 0-4.7-1.6-6-4l-2-3.8a1.5 1.5 0 0 1 2.5-1.6l1.5 2"),
		zoom: C(10.5, 10.5, 6.5) + D("M15.5 15.5 21 21"),
		text: D("M5 5h14M12 5v14M9 19h6"),
		equation: D("M18 5H6.5l6 7-6 7H18"),
		shape: R(3, 6, 18, 12, 1.5),
		undo: D("M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"),
		redo: D("M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"),
		expand: D("M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"),
		shrink: D("M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7"),
		fullscreen: D("M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"),
		save: D("M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 3v5h7V3M7.5 21v-7h9v7"),
		copy: R(8, 8, 13, 13, 2) + D("M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"),
		link: D("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"),
		download: D("M12 3v13M6.5 11l5.5 5.5 5.5-5.5M4 21h16"),
		folder: D("M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"),
		folderopen: D("M3 17.5v-11A1.5 1.5 0 0 1 4.5 5H9l2 2h7a1.5 1.5 0 0 1 1.5 1.5V10M3 17.5 5.6 11h16l-2.6 8H4.5A1.5 1.5 0 0 1 3 17.5z"),
		pencil: D("M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"),
		trash: D("M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13M10 11v6M14 11v6"),
		lock: R(5, 11, 14, 10, 2) + D("M8 11V8a4 4 0 0 1 8 0v3"),
		unlock: R(5, 11, 14, 10, 2) + D("M8 11V8a4 4 0 0 1 7.6-1.7"),
		mask: C(12, 12, 9) + D("M12 3a9 9 0 0 1 0 18z", FILL),
		halfleft: C(12, 12, 9) + D("M12 3a9 9 0 0 0 0 18z", FILL),
		swap: D("M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"),
		gear: C(12, 12, 3) + D("M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"),
		pin: D("M9 3h6l-1 6 4 4H6l4-4zM12 13v8"),
		close: D("M6 6l12 12M18 6 6 18"),
		check: D("M4 12.5 9 17.5 20 6.5"),
		eye: D("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z") + C(12, 12, 3),
		eyeoff: D("M3 3l18 18M10.6 5.1C11 5 11.5 5 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.9 0 3.5-.6 4.9-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2"),
		tall: D("M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"),
		mergedown: D("M12 4v11M7 10.5l5 5 5-5M5 20h14"),
		square: R(5, 5, 14, 14, 1.5, FILL),
		plus: D("M12 5v14M5 12h14"),
		warn: D("M12 3.5 22 20.5H2zM12 10v5M12 17.8v.4"),
		picture: R(3, 4, 18, 16, 2) + C(8.5, 9.5, 1.8) + D("M21 16l-5-5L5 20"),
		page: D("M6 3h8.5L19 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5"),
		scissors: C(6, 6, 3) + C(6, 18, 3) + D("M8.1 8.1 20 20M8.1 15.9 20 4"),
		rotl: D("M3 4v6h6M3.5 10A8.5 8.5 0 1 1 6 17"),
		rotr: D("M21 4v6h-6M20.5 10A8.5 8.5 0 1 0 18 17"),
		chevr: D("M9 6l6 6-6 6"), chevd: D("M6 9l6 6 6-6"), chevu: D("M6 15l6-6 6 6"),
		search: C(10.5, 10.5, 6.5) + D("M15.5 15.5 21 21"),
		sparkle: D("M12 3l2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5L4.5 10.5 10 8.5zM19 16v4M17 18h4")
	};
	// character -> icon (VS16 after an emoji is dropped with it)
	var GLYPH = { "✥": "move", "⬚": "marquee", "➰": "lasso", "✨": "sparkle", "⛶": "fullscreen", "🖌": "brush", "👆": "smudge", "◌": "eraser", "🧽": "objerase", "💧": "retouch", "🪣": "bucket", "◐": "halfleft", "💉": "eyedropper", "✋": "hand", "🔍": "search", "🔎": "search", "▭": "shape",
		"↶": "undo", "↷": "redo", "⤢": "expand", "⤡": "shrink", "💾": "save", "⧉": "copy", "🔗": "link", "⬇": "download", "📥": "download", "📁": "folder", "📂": "folderopen", "✎": "pencil", "✏": "pencil", "🗑": "trash", "🔒": "lock", "🔓": "unlock", "◑": "mask", "⇄": "swap", "⚙": "gear", "📌": "pin",
		"✕": "close", "✖": "close", "✓": "check", "✔": "check", "👁": "eye", "⇕": "tall", "⇩": "mergedown", "■": "square", "＋": "plus", "⚠": "warn", "🖼": "picture", "📄": "page", "✂": "scissors", "↺": "rotl", "⟲": "rotl", "⟳": "rotr", "↻": "rotr", "▸": "chevr", "▶": "chevr", "▾": "chevd", "▼": "chevd", "▲": "chevu" };
	var TOOL = { move: "move", marquee: "marquee", lasso: "lasso", wand: "wand", crop: "crop", layercrop: "layercrop", brush: "brush", smudge: "smudge", eraser: "eraser", clone: "clone", retouch: "retouch", objerase: "objerase", bucket: "bucket", gradient: "gradient", eyedropper: "eyedropper", hand: "hand", zoom: "zoom", text: "text", equation: "equation", shape: "shape" };
	var RE = new RegExp("(" + Object.keys(GLYPH).map(function (g) { return g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")️?", "g");
	PE.icon = function (name, cls) { var b = ICONS[name]; if (!b) return ""; return '<svg class="pe-ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + b + "</svg>"; };
	PE.toolIcon = function (id, fallback) { var n = TOOL[id]; return n ? PE.icon(n) : '<span class="pe-ico-t">' + PE.esc(fallback || "?") + "</span>"; };
	PE.ICONS = ICONS; PE.ICON_GLYPHS = GLYPH;
	var SKIP = "input,textarea,select,option,script,style,code,svg,[data-noico],[contenteditable],.pe-lname,.pe-rec-n,.pe-rename,.pe-comp-name,.pe-help p";
	function swapText(tn) {
		var s = tn.nodeValue; RE.lastIndex = 0; if (!s || !RE.test(s)) return; var par = tn.parentNode; if (!par || (par.closest && par.closest(SKIP))) return;
		RE.lastIndex = 0; var frag = document.createDocumentFragment(), last = 0, m;
		while ((m = RE.exec(s))) { if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index))); var t = document.createElement("template"); t.innerHTML = PE.icon(GLYPH[m[1]]); frag.appendChild(t.content.firstChild); last = m.index + m[0].length; }
		if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
		par.replaceChild(frag, tn);
	}
	PE.icoize = function (node) {
		if (!node) return; if (node.nodeType === 3) { swapText(node); return; } if (node.nodeType !== 1 || (node.closest && node.closest(SKIP))) return;
		var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null), list = [], n; while ((n = w.nextNode())) { RE.lastIndex = 0; if (RE.test(n.nodeValue)) list.push(n); } list.forEach(swapText);
	};
	function ours(n) { var e = n.nodeType === 1 ? n : n.parentNode; return !!(e && e.closest && e.closest("#pe, .tu-toast")); }
	var queue = [], sched = false;
	function flush() { sched = false; var q = queue; queue = []; q.forEach(function (n) { if (n.isConnected && ours(n)) PE.icoize(n); }); }
	if (window.MutationObserver) {
		new MutationObserver(function (ms) {
			ms.forEach(function (m) { if (m.type === "characterData") queue.push(m.target); else for (var i = 0; i < m.addedNodes.length; i++) queue.push(m.addedNodes[i]); });
			if (queue.length && !sched) { sched = true; flush(); }   // at once (a mutation callback is already a microtask: no box ever paints; rAF would not run in a background tab)
		}).observe(document.body, { childList: true, subtree: true, characterData: true });
	}
	var root = document.getElementById("pe"); if (root) PE.icoize(root);
	var srch = document.getElementById("pe-search"); if (srch) srch.placeholder = srch.placeholder.replace(/^\S+\s+/, "");
})();
