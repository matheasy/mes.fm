/* MES Matrix Calculator: grid editor (with a synced text box) + the operations, over MESMat (lib.js). */
(function () {
	"use strict";
	var M = window.MESMat, $ = function (id) { return document.getElementById(id); }, root = $("mx"); if (!root || !M) return;
	var MAX = 50, KEY = "mes-matrix:v1", S = { a: "1 2; 3 4", b: "5 6; 7 8", c: "", op: "mul", p: "2", pv: null, act: "relu", dp: 4, fr: false, view: "grid", cm: false };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) for (var k in S) if (sv[k] != null) S[k] = sv[k]; } catch (e) { /* ignore */ }
	var PV = { scale: 1, pow: 1, softmax: 1 }; S.pv = Object.assign({ scale: "2", pow: "2", softmax: "1" }, S.pv && typeof S.pv === "object" ? S.pv : {}); if (sv && !sv.pv && PV[S.op] && S.p != null) S.pv[S.op] = String(S.p);   // the number k, the power n and the temperature are kept apart (older saves had one shared value p)
	var qp = new URLSearchParams(location.search), fromLink = false;   // share links: ?a=1 2; 3 4&b=...&op=mul (also c, p, act, cm)
	["a", "b", "c", "op", "p", "act"].forEach(function (k) { if (qp.get(k) != null) { S[k] = qp.get(k); fromLink = true; } }); if (qp.get("cm") != null) { S.cm = qp.get("cm") === "1"; fromLink = true; } if (qp.get("p") != null && PV[S.op]) S.pv[S.op] = qp.get("p");
	if (fromLink && history.replaceState) try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	var toastT; function toast(m) { var t = $("mx-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function numOr(t) { try { return M.num(String(t).replace(/^(\s*[+-]?\d+),(\d+\s*)$/, "$1.$2")); } catch (e) { return NaN; } }   // the k / n / temperature box: same expressions as a cell, "2,5" read as 2.5
	function numTxt(x) { var d = +S.dp; if (S.fr) { var f = M.frac(x, 500); if (f && f.indexOf("/") > 0) return f; } return M.fmt(x, d); }
	function copyText(t, ok) {
		function fallback() { var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;"; document.body.appendChild(ta); ta.select(); var done = false; try { done = document.execCommand("copy"); } catch (e) { /* ignore */ } ta.remove(); toast(done ? ok : "Could not copy: select the text and press Ctrl+C"); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(ok); }, fallback); else fallback();
	}

	/* ---------- operations ---------- */
	var needB = { add: 1, sub: 1, mul: 1, had: 1, vec: 1, solve: 1, layer: 1, attn: 1 }, needC = { layer: 1, attn: 1 };
	var OPS = [
		["Arithmetic", [["add", "A + B"], ["sub", "A − B"], ["mul", "A × B (matrix multiplication)"], ["had", "A ∘ B (multiply number by number)"], ["scale", "k × A (multiply by a number)"], ["T", "Transpose of A"], ["pow", "A to the power n"]]],
		["Determinant, inverse and equations", [["det", "Determinant of A"], ["inv", "Inverse of A (with working)"], ["rank", "Rank of A"], ["trace", "Trace of A"], ["rref", "Row-reduce A (RREF, with working)"], ["solve", "Solve A·x = b (with working)"]]],
		["Decompositions", [["eig", "Eigenvalues and eigenvectors of A"], ["svd", "Singular value decomposition (SVD) of A"], ["qr", "QR decomposition of A"]]],
		["Vectors", [["vec", "Dot product, lengths and cosine similarity of A and B"], ["norm", "Norms of A"]]],
		["Machine learning", [["softmax", "Softmax of each row of A (with temperature)"], ["act", "Apply an activation function to A"], ["layer", "One dense layer: y = activation(W·x + b)"], ["attn", "Attention: softmax(Q·Kᵀ/√d)·V"]]]
	];
	var OPSET = {}; OPS.forEach(function (g) { g[1].forEach(function (o) { OPSET[o[0]] = 1; }); }); var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); }; if (!own(OPSET, S.op)) S.op = "mul"; if (!own(M.ACT, S.act)) S.act = "relu"; if ([2, 3, 4, 6].indexOf(+S.dp) < 0) S.dp = 4;
	$("mx-op").innerHTML = OPS.map(function (g) { return '<optgroup label="' + g[0] + '">' + g[1].map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</optgroup>"; }).join("");
	function labels() {   // [long label, short name] for each matrix, by operation
		var op = S.op; if (op === "layer") return { a: ["Weights W", "W"], b: ["Input x (a column)", "x"], c: ["Bias b (one number per row of W)", "b"] };
		if (op === "attn") return { a: ["Queries Q", "Q"], b: ["Keys K", "K"], c: ["Values V", "V"] };
		if (op === "solve") return { a: ["Matrix A", "A"], b: ["Right-hand side b", "b"], c: ["Matrix C", "C"] };
		if (op === "vec") return { a: ["Vector A", "A"], b: ["Vector B", "B"], c: ["Matrix C", "C"] };
		return { a: ["Matrix A", "A"], b: ["Matrix B", "B"], c: ["Matrix C", "C"] };
	}

	/* ---------- the grids: G[k].cells is the matrix as cell text (the source of truth); S[k] is the same as compact text ---------- */
	var G = {}, KS = ["a", "b", "c"], mats = $("mx-mats");
	function blank(r, c) { var o = []; for (var i = 0; i < r; i++) o.push(new Array(c).fill("")); return o; }
	function tooBig(rows) { if (rows.length > MAX || rows[0].length > MAX) throw new Error("That is a " + rows.length + " × " + rows[0].length + " matrix. This page works with up to " + MAX + " rows and " + MAX + " columns."); }
	function fromText(t, dr, dc) { try { var rows = M.parseTable(t).rows; if (rows.length) { tooBig(rows); return rows; } } catch (e) { /* fall back to a blank grid */ } return blank(dr, dc); }
	KS.forEach(function (k) { G[k] = { cells: fromText(S[k], 2, k === "c" ? 1 : 2), undo: null }; });
	function dims(k) { return [G[k].cells.length, G[k].cells[0].length]; }
	function isEmpty(k) { return G[k].cells.every(function (r) { return r.every(function (c) { return !String(c).trim(); }); }); }
	function compact(k) { return isEmpty(k) ? "" : M.matText(G[k].cells, "compact"); }
	function cellEl(k, i, j) { var tb = $("mx-g" + k).tBodies[0], r = tb.rows[i]; return r && r.cells[j] ? r.cells[j].firstChild : null; }
	mats.innerHTML = KS.map(function (k) {
		var tb = function (act, txt, lab) { return '<button type="button" class="mx-tb" data-act="' + act + '" aria-label="' + lab + '">' + txt + "</button>"; }, fill = function (act, txt, tip) { return '<button type="button" class="tu-chip mx-fill" data-act="' + act + '" title="' + tip + '">' + txt + "</button>"; };
		return '<div class="mx-mat" id="mx-w' + k + '" data-k="' + k + '" role="group" aria-labelledby="mx-l' + k + '"' + (k === "c" ? " hidden" : "") + '>' +
			'<div class="mx-mh"><span class="tu-label" id="mx-l' + k + '">Matrix ' + k.toUpperCase() + '</span><span class="mx-size" id="mx-s' + k + '"></span><span class="mx-offnote">not used by this operation</span></div>' +
			'<div class="mx-gw"><div class="mx-br"><table class="mx-grid" id="mx-g' + k + '"><tbody></tbody></table></div></div>' +
			'<textarea id="mx-' + k + '" class="tu-input mx-ta" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" aria-labelledby="mx-l' + k + '" aria-describedby="mx-e' + k + '"></textarea>' +
			'<p class="mx-terr" id="mx-e' + k + '" hidden></p><p class="mx-gnote" id="mx-n' + k + '" hidden></p><p class="mx-unote" id="mx-u' + k + '" hidden><span></span> <button type="button" class="mx-undo" data-act="undo">Undo</button></p>' +
			'<div class="mx-tools"><span class="mx-sz">Rows ' + tb("r-", "−", "Remove the last row") + tb("r+", "+", "Add a row") + '</span><span class="mx-sz">Columns ' + tb("c-", "−", "Remove the last column") + tb("c+", "+", "Add a column") + '</span></div><div class="mx-tools mx-fills">' +
			fill("zero", "Zero", "Fill every cell with 0") + fill("eye", "Identity", "1 on the diagonal, 0 elsewhere (square matrices only)") + fill("rand", "Random", "Random whole numbers from −9 to 9") + fill("clear", "Clear", "Empty every cell") + fill("T", "Transpose", "Swap rows and columns") + "</div></div>";
	}).join("");
	function widths(k, only) {   // each column as wide as its longest cell (4.2em at least)
		var g = G[k], R = g.cells.length, C = g.cells[0].length;
		for (var j = 0; j < C; j++) { if (only != null && j !== only) continue; var L = 0; for (var i = 0; i < R; i++) L = Math.max(L, String(g.cells[i][j]).length); var w = Math.min(14, Math.max(4.2, 0.62 * L + 1.5)).toFixed(2) + "em"; for (var i2 = 0; i2 < R; i2++) { var el = cellEl(k, i2, j); if (el) el.style.width = w; } }
	}
	function meta(k) {
		var d = dims(k), w = $("mx-w" + k); $("mx-s" + k).textContent = d[0] + " × " + d[1];
		w.querySelector('[data-act="r-"]').disabled = d[0] <= 1; w.querySelector('[data-act="c-"]').disabled = d[1] <= 1; w.querySelector('[data-act="r+"]').disabled = d[0] >= MAX; w.querySelector('[data-act="c+"]').disabled = d[1] >= MAX; w.querySelector('[data-act="eye"]').disabled = d[0] !== d[1];
	}
	function render(k) {
		var g = G[k], nm = labels()[k][1], h = "";
		g.cells.forEach(function (r, i) { h += "<tr>" + r.map(function (v, j) { return '<td><input type="text" class="mx-cell" data-k="' + k + '" data-i="' + i + '" data-j="' + j + '" value="' + esc(v) + '" placeholder="0" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next" aria-label="' + nm + ", row " + (i + 1) + ", column " + (j + 1) + '"></td>'; }).join("") + "</tr>"; });
		$("mx-g" + k).tBodies[0].innerHTML = h; widths(k); meta(k);
	}
	function syncText(k, force) { var ta = $("mx-" + k); if (force || document.activeElement !== ta) { ta.value = ta._v = isEmpty(k) ? "" : M.matText(G[k].cells, "text"); ta.rows = Math.min(10, Math.max(3, G[k].cells.length + 1)); $("mx-e" + k).hidden = true; ta.removeAttribute("aria-invalid"); } }
	function setCells(k, rows, note) {   // replace a whole matrix; `note` offers an Undo of it
		var prev = G[k].cells; G[k].cells = rows; render(k); syncText(k, true);
		var u = $("mx-u" + k); if (note) { G[k].undo = prev; u.firstChild.textContent = note; u.hidden = false; } else { G[k].undo = null; u.hidden = true; }
	}
	function hideUndo(k) { G[k].undo = null; $("mx-u" + k).hidden = true; }
	function sizeTxt(rows) { return rows.length + " × " + rows[0].length; }

	/* typing in a cell */
	var runT; function later() { clearTimeout(runT); runT = setTimeout(run, 90); }
	mats.addEventListener("input", function (e) {
		var t = e.target;
		if (t.classList.contains("mx-cell")) { var k = t.dataset.k; G[k].cells[+t.dataset.i][+t.dataset.j] = t.value; widths(k, +t.dataset.j); syncText(k, true); hideUndo(k); later(); }
		else if (t.classList.contains("mx-ta")) textLater(t.id.slice(3));
	});
	/* keyboard: Tab / Shift+Tab are the browser's own (cells are in reading order); Enter = next row, Shift+Enter = row above; arrows move between cells at the edge of the text */
	mats.addEventListener("keydown", function (e) {
		var t = e.target; if (!t.classList || !t.classList.contains("mx-cell") || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
		var k = t.dataset.k, i = +t.dataset.i, j = +t.dataset.j, d = dims(k), v = t.value, a = t.selectionStart, b = t.selectionEnd, whole = a === 0 && b === v.length, ni = i, nj = j;
		if (e.key === "Enter") { e.preventDefault(); ni = e.shiftKey ? i - 1 : i + 1; if (ni < 0 || ni >= d[0]) { t.select(); return; } }
		else if (e.shiftKey) return;
		else if (e.key === "ArrowUp") ni = i - 1; else if (e.key === "ArrowDown") ni = i + 1;
		else if (e.key === "ArrowLeft") { if (!whole && !(a === 0 && b === 0)) return; nj = j - 1; }
		else if (e.key === "ArrowRight") { if (!whole && !(a === v.length && b === v.length)) return; nj = j + 1; }
		else return;
		e.preventDefault(); if (ni < 0 || ni >= d[0] || nj < 0 || nj >= d[1]) return;
		var n = cellEl(k, ni, nj); if (n) { n.focus(); n.select(); }
	});
	/* paste a table into a cell: into the first cell it replaces the matrix, anywhere else it fills from that cell and grows the grid */
	mats.addEventListener("paste", function (e) {
		var t = e.target; if (!t.classList || !t.classList.contains("mx-cell")) return;
		var cd = e.clipboardData || window.clipboardData, txt = cd ? (cd.getData("text/plain") || cd.getData("text") || "") : ""; if (!txt.trim()) return;
		var shaped = /[\n\t;&\[\]{}|]/.test(txt.trim()), tbl;
		try { tbl = M.parseTable(txt); } catch (err) { if (!shaped) return; e.preventDefault(); toast(err.message); return; }
		var P = tbl.rows; if (!P.length) return;
		if (P.length === 1 && P[0].length === 1 && !shaped) return;   // one number: the browser's own paste
		e.preventDefault();
		var k = t.dataset.k, i0 = +t.dataset.i, j0 = +t.dataset.j, prev = G[k].cells, rows;
		if (!i0 && !j0) rows = P.map(function (r) { return r.slice(); });
		else { var R = Math.max(prev.length, i0 + P.length), C = Math.max(prev[0].length, j0 + P[0].length); rows = blank(R, C); prev.forEach(function (r, i) { r.forEach(function (c, j) { rows[i][j] = c; }); }); P.forEach(function (r, i) { r.forEach(function (c, j) { rows[i0 + i][j0 + j] = c; }); }); }
		try { tooBig(rows); } catch (err) { toast(err.message); return; }
		var nb = 0; P.forEach(function (r) { r.forEach(function (c) { if (!String(c).trim()) nb++; }); });
		var msg = "Pasted a " + sizeTxt(P) + " " + ({ text: "table", spreadsheet: "block of spreadsheet cells", Markdown: "Markdown table" }[tbl.format] || tbl.format + " matrix") + (i0 || j0 ? " from row " + (i0 + 1) + ", column " + (j0 + 1) : "") + "." + (tbl.notes.length ? " " + tbl.notes.join(" ") : "") + (nb ? " " + nb + (nb === 1 ? " blank cell counts" : " blank cells count") + " as 0." : "");
		setCells(k, rows, msg); run(); var n = cellEl(k, i0, j0); if (n) n.focus();
	});
	/* size, quick fills, undo */
	mats.addEventListener("click", function (e) {
		var btn = e.target.closest("button[data-act]"); if (!btn || btn.disabled) return; var k = btn.closest(".mx-mat").dataset.k, act = btn.dataset.act, c = G[k].cells, d = dims(k), r, lost;
		var filled = function (row) { return row.some(function (x) { return String(x).trim(); }); };
		if (act === "undo") { if (G[k].undo) { var u = G[k].undo; G[k].undo = null; setCells(k, u); toast("Undone"); run(); } return; }
		if (act === "r+") { if (d[0] >= MAX) return; r = c.map(function (x) { return x.slice(); }); r.push(new Array(d[1]).fill("")); setCells(k, r); }
		else if (act === "c+") { if (d[1] >= MAX) return; setCells(k, c.map(function (x) { return x.concat([""]); })); }
		else if (act === "r-") { if (d[0] <= 1) return; lost = filled(c[d[0] - 1]); setCells(k, c.slice(0, -1), lost ? "Removed row " + d[0] + "." : null); }
		else if (act === "c-") { if (d[1] <= 1) return; lost = filled(c.map(function (x) { return x[d[1] - 1]; })); setCells(k, c.map(function (x) { return x.slice(0, -1); }), lost ? "Removed column " + d[1] + "." : null); }
		else if (act === "zero") setCells(k, c.map(function (x) { return x.map(function () { return "0"; }); }), "Filled with zeros.");
		else if (act === "eye") { if (d[0] !== d[1]) return; setCells(k, c.map(function (x, i) { return x.map(function (_, j) { return i === j ? "1" : "0"; }); }), "Made the identity matrix."); }
		else if (act === "rand") setCells(k, c.map(function (x) { return x.map(function () { return String(Math.floor(Math.random() * 19) - 9); }); }), "Filled with random numbers.");
		else if (act === "clear") setCells(k, blank(d[0], d[1]), "Cleared.");
		else if (act === "T") setCells(k, c[0].map(function (_, j) { return c.map(function (x) { return x[j]; }); }), "Transposed (" + d[0] + " × " + d[1] + " became " + d[1] + " × " + d[0] + ").");
		else return;
		run();
	});
	/* the text box: parsed shortly after typing stops; text that cannot be read leaves the grid as it was */
	var textT = {};
	function textLater(k) { clearTimeout(textT[k]); textT[k] = setTimeout(function () { textToGrid(k); }, 350); }
	function textToGrid(k) {
		var ta = $("mx-" + k), er = $("mx-e" + k), t; if (ta.value === ta._v) return;   // unchanged since the grid last wrote it
		try { t = M.parseTable(ta.value); if (t.rows.length) tooBig(t.rows); } catch (err) { er.textContent = err.message + " The grid still shows the last matrix that could be read."; er.hidden = false; ta.setAttribute("aria-invalid", "true"); return; }
		er.hidden = true; ta.removeAttribute("aria-invalid"); ta._v = ta.value; var d = dims(k); G[k].cells = t.rows.length ? t.rows : blank(d[0], d[1]); hideUndo(k); render(k); run();
	}
	mats.addEventListener("focusout", function (e) { var t = e.target; if (t.classList && t.classList.contains("mx-ta")) { clearTimeout(textT[t.id.slice(3)]); textToGrid(t.id.slice(3)); } });

	/* ---------- view: Grid | Grid + text | Text ---------- */
	function setView(v) { S.view = v === "text" || v === "both" ? v : "grid"; root.setAttribute("data-view", S.view); Array.prototype.forEach.call($("mx-view").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === S.view)); }); }
	$("mx-view").addEventListener("click", function (e) { var b = e.target.closest("button[data-view]"); if (!b) return; KS.forEach(function (k) { syncText(k, true); }); setView(b.dataset.view); save(); });

	/* ---------- examples and the page-level buttons ---------- */
	var EX = [["Multiply", "1 2 3; 4 5 6", "7 8; 9 10; 11 12", "mul"], ["Inverse", "4 7; 2 6", "1 0; 0 1", "inv"], ["Determinant", "2 0 1; 1 3 2; 1 1 4", "1 0; 0 1", "det"], ["Eigenvalues", "2 1; 1 2", "1 0; 0 1", "eig"], ["Solve equations", "2 1; 1 3", "3; 5", "solve"], ["Rotation", "cos(pi/6) -sin(pi/6); sin(pi/6) cos(pi/6)", "1; 0", "mul"], ["SVD", "3 0; 4 5; 0 1", "1 0; 0 1", "svd"], ["Softmax scores", "2 1 0.1; 0.5 0.5 3", "1 0; 0 1", "softmax"], ["Dense layer", "0.5 -1 2; 1 1 -0.5", "1; 2; 3", "layer", "0.1; -0.2"], ["Attention", "1 0; 0 1; 1 1", "1 0; 0 1; 1 1", "attn", "1 2; 3 4; 5 6"]];
	EX.forEach(function (e) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = e[0]; b.onclick = function () { G.a.cells = fromText(e[1], 2, 2); G.b.cells = fromText(e[2], 2, 2); G.c.cells = e[4] ? fromText(e[4], 2, 1) : blank(2, 1); S.op = e[3]; if (e[3] === "softmax") S.pv.softmax = "1"; load(); run(); }; $("mx-ex").appendChild(b); });
	$("mx-swap").onclick = function () { var t = G.a.cells; G.a.cells = G.b.cells; G.b.cells = t; ["a", "b"].forEach(function (k) { hideUndo(k); render(k); syncText(k, true); }); run(); };
	$("mx-rand").onclick = function () { var rnd = function (r, c) { return blank(r, c).map(function (x) { return x.map(function () { return String(Math.floor(Math.random() * 19) - 9); }); }); }, n = 2 + Math.floor(Math.random() * 2), m = 2 + Math.floor(Math.random() * 2), p = 2 + Math.floor(Math.random() * 2); G.a.cells = rnd(n, m); G.b.cells = rnd(m, p); ["a", "b"].forEach(function (k) { hideUndo(k); render(k); syncText(k, true); }); run(); };
	$("mx-link").onclick = function () {
		var q = new URLSearchParams(); q.set("a", compact("a")); if (needB[S.op]) q.set("b", compact("b")); if (needC[S.op] && !isEmpty("c")) q.set("c", compact("c")); q.set("op", S.op);
		if (PV[S.op]) q.set("p", S.pv[S.op]); if (S.op === "act" || S.op === "layer") q.set("act", S.act); if (S.op === "attn" && S.cm) q.set("cm", "1");
		copyText(location.origin + location.pathname + "?" + q.toString(), "Link copied: it opens this calculation");
	};
	function load() { KS.forEach(function (k) { hideUndo(k); render(k); syncText(k, true); }); $("mx-op").value = S.op; $("mx-p").value = S.pv[S.op] || "2"; $("mx-act").value = S.act; $("mx-dp").value = S.dp; $("mx-fr").checked = S.fr; $("mx-cm").checked = S.cm; setView(S.view); ui(); }
	function ui() {
		var op = S.op, L = labels(); $("mx-pw").hidden = !(op === "scale" || op === "pow" || op === "softmax"); $("mx-pl").textContent = op === "pow" ? "Power n" : op === "scale" ? "Number k" : "Temperature";
		$("mx-actw").hidden = !(op === "act" || op === "layer"); $("mx-cmw").hidden = op !== "attn";
		KS.forEach(function (k) {
			var w = $("mx-w" + k), lab = $("mx-l" + k); if (lab.textContent !== L[k][0]) { lab.textContent = L[k][0]; Array.prototype.forEach.call(w.querySelectorAll(".mx-cell"), function (c) { c.setAttribute("aria-label", L[k][1] + ", row " + (+c.dataset.i + 1) + ", column " + (+c.dataset.j + 1)); }); }
			if (k === "b") w.classList.toggle("mx-off", !needB[op]); if (k === "c") w.hidden = !needC[op];
		});
		if (needC[op] && isEmpty("c") && !$("mx-wc").contains(document.activeElement)) { var want = op === "layer" ? [dims("a")[0], 1] : dims("b"); if (dims("c").join() !== want.join()) { G.c.cells = blank(want[0], want[1]); render("c"); syncText("c", true); } }
	}

	/* ---------- run ---------- */
	var outs = [], pa = null, pb = null;
	function block(title, inner, note) { return '<div class="tu-card mx-blk"><h3>' + esc(title) + "</h3>" + inner + (note ? '<p class="tu-note">' + note + "</p>" : "") + "</div>"; }
	function matHtml(A, opt) {
		opt = opt || {}; var h = '<table class="mx-m' + (opt.cls ? " " + opt.cls : "") + '"><tbody>';
		A.forEach(function (r, i) { h += "<tr>" + r.map(function (v, j) { var heat = opt.heat ? ' style="background:rgba(124,58,237,' + (0.08 + 0.55 * Math.max(0, Math.min(1, v))).toFixed(2) + ')"' : ""; return "<td" + (opt.click ? ' data-i="' + i + '" data-j="' + j + '" tabindex="0" class="mx-click" aria-label="Row ' + (i + 1) + ", column " + (j + 1) + ": " + esc(numTxt(v)) + '. Show how it was made."' : "") + heat + ">" + esc(opt.fmt ? opt.fmt(v) : numTxt(v)) + "</td>"; }).join("") + "</tr>"; });
		return h + "</tbody></table>";
	}
	function stepsHtml(steps) {   // big matrices: the step list is shortened and shows no matrices (lib.js keeps copies only for small ones)
		var SHOW = 150, list = steps.slice(0, SHOW).map(function (s) { return "<li>" + esc(s.text) + (s.M ? matHtml(s.M, { cls: "mx-small" }) : "") + "</li>"; }).join("");
		return '<details class="mx-steps"><summary>Show the row operations (' + steps.length + " step" + (steps.length === 1 ? "" : "s") + ")</summary>" + (steps.length && !steps[0].M ? '<p class="tu-note">The matrix after each step is shown for small matrices only.</p>' : "") + "<ol>" + list + "</ol>" + (steps.length > SHOW ? '<p class="tu-note">… and ' + (steps.length - SHOW) + " more steps.</p>" : "") + "</details>";
	}
	function cplx(z) { return z.im ? M.fmt(z.re, +S.dp) + (z.im > 0 ? " + " : " − ") + M.fmt(Math.abs(z.im), +S.dp) + "i" : numTxt(z.re); }
	function clearHl() { Array.prototype.forEach.call(root.querySelectorAll(".mx-hr, .mx-hc, .mx-on"), function (c) { c.classList.remove("mx-hr", "mx-hc", "mx-on"); }); }
	function markBad(k, bad) { var set = {}; bad.forEach(function (b) { set[b.i + "," + b.j] = 1; }); Array.prototype.forEach.call($("mx-g" + k).querySelectorAll(".mx-cell"), function (c) { var on = !!set[c.dataset.i + "," + c.dataset.j]; c.classList.toggle("mx-bad", on); if (on) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid"); }); }
	function run() {
		clearTimeout(runT); S.op = $("mx-op").value; if (PV[S.op]) S.p = S.pv[S.op]; S.act = $("mx-act").value; S.dp = +$("mx-dp").value; S.fr = $("mx-fr").checked; S.cm = $("mx-cm").checked; ui();
		KS.forEach(function (k) { S[k] = compact(k); }); save(); clearHl();
		var out = $("mx-out"), err = $("mx-err"), L = labels(), rd = {}; err.hidden = true; out.innerHTML = ""; outs = [];
		KS.forEach(function (k) {   // cell text -> numbers; blank cells count as 0, a cell that is not a number is outlined in red
			var r = isEmpty(k) ? { M: [], blanks: 0, bad: [] } : M.toNums(G[k].cells, L[k][0].replace(/\s*\(.*$/, "")); rd[k] = r; markBad(k, r.bad);
			var n = $("mx-n" + k); n.hidden = !r.blanks; n.textContent = r.blanks ? r.blanks + (r.blanks === 1 ? " blank cell counts" : " blank cells count") + " as 0." : "";
		});
		try {
			var used = ["a"].concat(needB[S.op] ? ["b"] : [], needC[S.op] ? ["c"] : []);
			used.forEach(function (k) { var b = rd[k].bad; if (b.length) throw new Error(b[0].msg.charAt(0).toUpperCase() + b[0].msg.slice(1) + (b.length > 1 ? " (" + (b.length - 1) + " more cell" + (b.length > 2 ? "s" : "") + " in red.)" : "")); });
			var A = rd.a.M, B = rd.b.M, C = rd.c.M; pa = A; pb = B; var op = S.op, H = "", res = null;
			if (!A.length) { out.innerHTML = '<div class="tu-card tu-card--tint">Type numbers into ' + esc(L.a[0]) + " to begin, or press one of the examples.</div>"; showOuts(); return; }
			if (needB[op] && !B.length) throw new Error("This operation needs a second matrix: fill in " + L.b[0].replace(/\s*\(.*$/, "") + ".");
			var P = PV[op] ? numOr(S.pv[op]) : NaN, sh = M.shape(A);
			var put = function (name, X) { outs.push([name, X]); };
			if (op === "add" || op === "sub") { res = M.add(A, B, op === "sub" ? -1 : 1); put("A " + (op === "sub" ? "−" : "+") + " B", res); H = block("A " + (op === "sub" ? "−" : "+") + " B", matHtml(res), "Each number is added to the number in the same place, so both matrices must be the same size."); }
			else if (op === "mul") { res = M.mul(A, B); put("A × B", res); H = block("A × B  (" + sh[0] + " × " + sh[1] + " times " + M.shape(B)[0] + " × " + M.shape(B)[1] + " = " + res.length + " × " + res[0].length + ")", matHtml(res, { click: true }) + '<p class="mx-why" id="mx-why" aria-live="polite">Click a number to see how it was made: its row of A and column of B light up in the grids above.</p>', "Every number is a row of A paired with a column of B: multiply the pairs, then add."); }
			else if (op === "had") { res = M.hadamard(A, B); put("A ∘ B", res); H = block("A ∘ B", matHtml(res), "The Hadamard (element-wise) product. Neural networks use it for gating, for example in LSTMs."); }
			else if (op === "scale") { need(isFinite(P), "Type a number for k."); res = M.scale(A, P); put(numTxt(P) + " × A", res); H = block(numTxt(P) + " × A", matHtml(res)); }
			else if (op === "T") { res = M.T(A); put("Aᵀ", res); H = block("Aᵀ  (" + res.length + " × " + res[0].length + ")", matHtml(res), "Rows become columns. In attention the transposed keys Kᵀ line up with the queries Q."); }
			else if (op === "pow") { need(Number.isInteger(P), "Type a whole number for n."); res = M.power(A, P); put("A^" + P, res); H = block("A^" + P, matHtml(res), "A multiplied by itself " + P + " times. Powers of a transition matrix show where a process ends up after " + P + " steps."); }
			else if (op === "det") { var d = M.det(A); put("Determinant", [[d]]); H = block("Determinant of A", '<div class="mx-big">' + numTxt(d) + "</div>", Math.abs(d) < 1e-9 ? "The determinant is 0: the matrix squashes space flat, so it has no inverse." : "Not zero, so A has an inverse. The size of the determinant is how much A scales areas (or volumes)."); }
			else if (op === "inv") { var iv = M.inverse(A); res = iv.inv; var chk = M.mul(A, res); put("A⁻¹", res); put("Check: A × A⁻¹", chk); H = block("Inverse of A", matHtml(res) + stepsHtml(iv.steps), "Gauss-Jordan: row-reduce [A | I] until the left half is I; the right half is A⁻¹. Check: A × A⁻¹ = I."); H += block("Check: A × A⁻¹", matHtml(chk)); }
			else if (op === "rank") { var rk = M.rank(A); put("Rank", [[rk]]); H = block("Rank of A", '<div class="mx-big">' + rk + "</div>", "The number of independent rows. Rank " + rk + " of a " + sh[0] + " × " + sh[1] + " matrix" + (rk < Math.min(sh[0], sh[1]) ? ": some rows or columns carry no new information (low rank, which is what compression and LoRA exploit)." : ": full rank.")); }
			else if (op === "trace") { var tr = M.trace(A); put("Trace", [[tr]]); H = block("Trace of A", '<div class="mx-big">' + numTxt(tr) + "</div>", "The sum of the diagonal. It also equals the sum of the eigenvalues."); }
			else if (op === "rref") { var R = M.rref(A); res = R.M; put("RREF of A", res); H = block("Row-reduced form (RREF)", matHtml(res) + stepsHtml(R.steps), "Pivot columns: " + (R.pivots.map(function (c) { return c + 1; }).join(", ") || "none") + ". The number of pivots is the rank."); }
			else if (op === "solve") {
				var s = M.solve(A, B), many = B[0].length > 1; res = s.X; put(many ? "X" : "x", res); var ax = M.mul(A, res);
				H = block(many ? "Solution X of A·X = b (one column per column of b)" : "Solution x of A·x = b", matHtml(res) + stepsHtml(s.steps), many ? "Each column of X solves A·x = that column of b. Check: A × X = b, below." : "Check: A × x = " + ax.map(function (r) { return numTxt(r[0]); }).join(", ") + " (should equal b = " + B.map(function (r) { return numTxt(r[0]); }).join(", ") + ").");
				if (many) { put("Check: A × X", ax); H += block("Check: A × X", matHtml(ax)); }
			}
			else if (op === "eig") {
				var e = M.eig(A); H = block("Eigenvalues", '<ol class="mx-ev">' + e.values.map(function (z) { return "<li>" + esc(cplx(z)) + "</li>"; }).join("") + "</ol>", e.symmetric ? "A is symmetric, so the eigenvalues are real and the eigenvectors are perpendicular (these are the principal components if A is a covariance matrix)." : "A is not symmetric: eigenvalues can be complex (a rotation), shown with i.");
				if (e.values.every(function (z) { return !z.im; })) put("Eigenvalues (a column)", e.values.map(function (z) { return [z.re]; }));
				if (e.vectors) { put("Eigenvectors (columns)", e.vectors); H += block("Eigenvectors (columns, in the same order)", matHtml(e.vectors), "A·v = λ·v for each column v and its eigenvalue λ."); }
			}
			else if (op === "svd") { var sv2 = M.svd(A); put("Singular values (a column)", sv2.s.map(function (z) { return [z]; })); put("U", sv2.U); put("V", sv2.V); H = block("Singular values", '<ol class="mx-ev">' + sv2.s.map(function (z) { return "<li>" + numTxt(z) + "</li>"; }).join("") + "</ol>", "A = U · Σ · Vᵀ, where Σ has the singular values on its diagonal. Keeping only the biggest singular values gives the best low-rank approximation of A (image compression, PCA, LoRA)."); H += block("U", matHtml(sv2.U)) + block("V", matHtml(sv2.V)); }
			else if (op === "qr") { var q = M.qr(A); put("Q", q.Q); put("R", q.R); H = block("Q (orthonormal columns)", matHtml(q.Q)) + block("R (upper triangular)", matHtml(q.R), "A = Q × R. Used for solving least-squares problems stably."); }
			else if (op === "vec") {
				var a1 = [].concat.apply([], A), b1 = [].concat.apply([], B); need(a1.length === b1.length, "A has " + a1.length + " numbers and B has " + b1.length + ": a dot product needs the same count."); var dt = M.dot(a1, b1), na = M.norm(A), nb = M.norm(B), cs = (na && nb) ? dt / (na * nb) : NaN; put("Dot product", [[dt]]);
				H = block("A and B as vectors", '<table class="mx-kv"><tr><td>Dot product A·B</td><td>' + numTxt(dt) + "</td></tr><tr><td>Length of A (‖A‖)</td><td>" + numTxt(na) + "</td></tr><tr><td>Length of B (‖B‖)</td><td>" + numTxt(nb) + "</td></tr><tr><td>Cosine similarity</td><td>" + (isFinite(cs) ? numTxt(cs) : "undefined (a zero vector)") + "</td></tr><tr><td>Angle between them</td><td>" + (isFinite(cs) ? M.fmt(Math.acos(Math.max(-1, Math.min(1, cs))) * 180 / Math.PI, 2) + "°" : "—") + "</td></tr></table>", "All the numbers of each matrix are read in order as one long vector. Cosine similarity is 1 for the same direction, 0 for unrelated (perpendicular), −1 for opposite: it is how embeddings are compared.");
			}
			else if (op === "norm") { put("Frobenius norm", [[M.norm(A)]]); H = block("Norms of A", '<table class="mx-kv"><tr><td>Frobenius / L2 (√ sum of squares)</td><td>' + numTxt(M.norm(A)) + "</td></tr><tr><td>L1 (sum of absolute values)</td><td>" + numTxt(M.norm(A, "1")) + "</td></tr><tr><td>Max (largest absolute value)</td><td>" + numTxt(M.norm(A, "inf")) + "</td></tr></table>", "L1 and L2 penalties (weight decay) shrink a model's weights using these."); }
			else if (op === "softmax") { need(isFinite(P) && P > 0, "Temperature must be a number above 0."); res = M.softmaxRows(A, P); put("Softmax", res); H = block("Softmax of each row (temperature " + numTxt(P) + ")", matHtml(res, { heat: true, fmt: function (v) { return M.fmt(v * 100, 1) + "%"; } }), "Each row now adds up to 100%. Try temperature 0.2 (almost all on the biggest) and 5 (almost even)."); }
			else if (op === "act") { res = M.mapAct(A, S.act); put(S.act + "(A)", res); H = block(S.act + "(A)", matHtml(res), "Applied to every number separately. Without an activation function, stacking layers would still just be one big matrix multiplication."); }
			else if (op === "layer") {
				var bb = C.length ? C : null, nx = B[0].length;
				if (B.length !== sh[1]) throw new Error(B.length === 1 && nx === sh[1] ? "x is typed as a row. Press Transpose under x to make it a column (one number per row)." : "x needs " + sh[1] + " rows (one per column of W), but it has " + B.length + ".");
				if (bb) need(bb.length === sh[0], "b needs " + sh[0] + " numbers (one per row of W), but it has " + bb.length + ".");
				var Ly = M.layer(A, B, bb, S.act); put("a = " + S.act + "(z)", Ly.a); put("z = W·x + b", Ly.z);
				H = block("z = W·x + b", matHtml(Ly.z), "W is " + sh[0] + " × " + sh[1] + ", x has " + sh[1] + " numbers" + (nx > 1 ? " in each of its " + nx + " columns (a batch: each column is one input)" : "") + (bb ? ", b has " + bb.length : " (no bias: b is empty)") + ": the layer turns " + sh[1] + " inputs into " + sh[0] + " outputs.") + block("a = " + S.act + "(z)  (the layer's output)", matHtml(Ly.a));
			}
			else if (op === "attn") {
				need(C.length, "Fill in the values matrix V (same number of rows as K)."); need(M.shape(B)[1] === sh[1], "Q and K must have the same number of columns (the key size d), but Q has " + sh[1] + " and K has " + M.shape(B)[1] + "."); need(C.length === B.length, "V must have as many rows as K (" + B.length + ")."); if (S.cm) need(A.length === B.length, "A causal mask needs Q and K to have the same number of rows (one per token).");
				var at = M.attention(A, B, C, S.cm); put("Output", at.out); put("Attention weights", at.weights); put("Scores", at.scores.map(function (r) { return r.map(function (v) { return v === -Infinity ? -1e9 : v; }); }));
				H = block("Scores = Q·Kᵀ / √" + sh[1] + (S.cm ? " (causal: later tokens hidden)" : ""), matHtml(at.scores, { fmt: function (v) { return v === -Infinity ? "−∞" : numTxt(v); } })) + block("Attention weights = softmax(scores), each row adds to 100%", matHtml(at.weights, { heat: true, fmt: function (v) { return M.fmt(v * 100, 1) + "%"; } }), "Row i says how much token i looks at every other token." + (S.cm ? " With the causal mask a token cannot look ahead, as in a language model writing text." : "")) + block("Output = weights · V", matHtml(at.out));
			}
			out.innerHTML = H; showOuts();
		} catch (e) { err.hidden = false; err.textContent = e.message || String(e); showOuts(); }
		function need(c, m) { if (!c) throw new Error(m); }
	}
	/* ---------- the result bar: pick a result matrix, copy it in four formats, or use it as A / B ---------- */
	function showOuts() {
		var bar = $("mx-resbar"), sel = $("mx-pick"); bar.hidden = !outs.length; if (!outs.length) return;
		sel.innerHTML = outs.map(function (o, i) { return '<option value="' + i + '">' + esc(o[0]) + " (" + o[1].length + " × " + o[1][0].length + ")</option>"; }).join(""); $("mx-pickw").hidden = outs.length < 2;
	}
	function picked() { var o = outs[+$("mx-pick").value || 0]; return o ? o[1] : null; }
	$("mx-resbar").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var X = picked(); if (!X) return;
		if (b.dataset.fmt) { var f = b.dataset.fmt, txt = M.matText(X, f, f === "tsv" ? function (v) { return M.fmt(v, Math.max(+S.dp, 6)); } : numTxt); copyText(txt, { text: "Copied as text", tsv: "Copied: paste it into a spreadsheet", latex: "Copied as LaTeX", numpy: "Copied as NumPy code" }[f]); }
		else if (b.dataset.use) { var k = b.dataset.use; setCells(k, X.map(function (r) { return r.map(M.cellStr); }), "Put the result in " + labels()[k][1] + "."); run(); toast("Now in " + labels()[k][0].replace(/\s*\(.*$/, "")); }
	});
	/* A × B: click a number of the product to light up its row of A and column of B in the grids */
	function explain(td) {
		if (S.op !== "mul" || !pa || !pb) return; var i = +td.dataset.i, j = +td.dataset.j; if (!pa[i] || !pb[0] || pb[0][j] == null) return; clearHl(); td.classList.add("mx-on");
		for (var q = 0; q < pa[i].length; q++) { var c1 = cellEl("a", i, q); if (c1) c1.classList.add("mx-hr"); } for (var r = 0; r < pb.length; r++) { var c2 = cellEl("b", r, j); if (c2) c2.classList.add("mx-hc"); }
		var terms = pa[i].map(function (v, q) { return M.fmt(v, 4) + " × " + M.fmt(pb[q][j], 4); }), val = pa[i].reduce(function (s, v, q) { return s + v * pb[q][j]; }, 0), w = $("mx-why");
		if (w) w.innerHTML = '<span class="mx-kr">Row ' + (i + 1) + ' of A</span> · <span class="mx-kc">column ' + (j + 1) + " of B</span> = " + esc(terms.join(" + ")) + " = <b>" + esc(numTxt(val)) + "</b>";
	}
	$("mx-out").addEventListener("click", function (e) { var td = e.target.closest("td[data-i]"); if (td) explain(td); });
	$("mx-out").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.i != null) { e.preventDefault(); explain(e.target); } });
	["mx-act", "mx-dp", "mx-fr", "mx-cm"].forEach(function (id) { $(id).addEventListener("change", run); });
	$("mx-op").addEventListener("change", function () { S.op = $("mx-op").value; if (PV[S.op]) $("mx-p").value = S.pv[S.op]; run(); }); $("mx-p").addEventListener("input", function () { if (PV[S.op]) S.pv[S.op] = $("mx-p").value; later(); });
	load(); run();
})();
